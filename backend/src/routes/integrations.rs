// ── Schnittstellen: DIVERA 24/7 & Alamos FE2 ─────────────────────────────────
use axum::{
    extract::{Query, State},
    http::HeaderMap,
    middleware,
    routing::{get, post, put},
    Extension, Json, Router,
};
use chrono::{DateTime, Datelike, NaiveDate, NaiveTime, Timelike, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    audit,
    auth::middleware::{require_auth, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Settings ──────────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct IntegrationSettings {
    pub divera_api_key:        String,
    pub divera_webhook_secret: String,
    pub alamos_webhook_secret: String,
}

#[derive(Deserialize)]
pub struct UpdateIntegrationSettings {
    pub divera_api_key:        Option<String>,
    pub divera_webhook_secret: Option<String>,
    pub alamos_webhook_secret: Option<String>,
}

async fn get_setting(db: &sqlx::PgPool, key: &str) -> String {
    sqlx::query_scalar::<_, String>("SELECT value FROM settings WHERE key = $1")
        .bind(key)
        .fetch_optional(db)
        .await
        .unwrap_or(None)
        .unwrap_or_default()
}

async fn set_setting(db: &sqlx::PgPool, key: &str, value: &str) -> AppResult<()> {
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ($1, $2)
         ON CONFLICT (key) DO UPDATE SET value = $2, updated_at = NOW()"
    )
    .bind(key)
    .bind(value)
    .execute(db)
    .await?;
    Ok(())
}

pub async fn get_integrations(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<IntegrationSettings>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }
    Ok(Json(IntegrationSettings {
        divera_api_key:        get_setting(&state.db, "divera_api_key").await,
        divera_webhook_secret: get_setting(&state.db, "divera_webhook_secret").await,
        alamos_webhook_secret: get_setting(&state.db, "alamos_webhook_secret").await,
    }))
}

pub async fn update_integrations(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<UpdateIntegrationSettings>,
) -> AppResult<Json<IntegrationSettings>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }
    if let Some(v) = &body.divera_api_key        { set_setting(&state.db, "divera_api_key", v).await?; }
    if let Some(v) = &body.divera_webhook_secret  { set_setting(&state.db, "divera_webhook_secret", v).await?; }
    if let Some(v) = &body.alamos_webhook_secret  { set_setting(&state.db, "alamos_webhook_secret", v).await?; }

    audit::log(&state.db, Some(claims.sub), &claims.username, "INTEGRATIONS_UPDATED", None, None, None).await;
    get_integrations(State(state), Extension(claims)).await
}

// ── DIVERA Webhook ─────────────────────────────────────────────────────────────

/// Query-Parameter für Webhook-Authentifizierung: ?secret=...
#[derive(Deserialize)]
pub struct WebhookQuery {
    pub secret: Option<String>,
}

/// DIVERA Alarm-Payload — unterstützt snake_case und PascalCase
#[derive(Deserialize, Default)]
pub struct DiveraAlarm {
    #[serde(alias = "Id")]
    pub id:           Option<i64>,
    #[serde(alias = "ForeignId")]
    pub foreign_id:   Option<String>,
    #[serde(alias = "Title")]
    pub title:        Option<String>,
    #[serde(alias = "Text")]
    pub text:         Option<String>,
    #[serde(alias = "Address")]
    pub address:      Option<String>,
    #[serde(alias = "Lat", deserialize_with = "deser_f64_flexible", default)]
    pub lat:          Option<f64>,
    #[serde(alias = "Lng", deserialize_with = "deser_f64_flexible", default)]
    pub lng:          Option<f64>,
    #[serde(alias = "Number")]
    pub number:       Option<String>,
    #[serde(alias = "Priority")]
    pub priority:     Option<Value>,
    #[serde(alias = "TsPublish")]
    pub ts_publish:   Option<i64>,
    #[serde(alias = "TsCreate")]
    pub ts_create:    Option<i64>,
    #[serde(alias = "TsClose", alias = "ts_update", alias = "TsUpdate")]
    pub ts_close:     Option<i64>,
    #[serde(alias = "Closed")]
    pub closed:       Option<bool>,
    #[serde(alias = "Report")]
    pub report:       Option<String>,
}

/// Akzeptiert lat/lng als Zahl oder als String (DIVERA schickt beides)
fn deser_f64_flexible<'de, D>(d: D) -> Result<Option<f64>, D::Error>
where D: serde::Deserializer<'de> {
    let v: Option<Value> = Option::deserialize(d)?;
    Ok(v.and_then(|v| match v {
        Value::Number(n) => n.as_f64(),
        Value::String(s) => s.parse().ok(),
        _ => None,
    }))
}

/// Extrahiert DiveraAlarm aus beliebigem JSON — versucht mehrere Strukturen.
/// DIVERA sendet beim Webhook dieselbe Struktur wie die Poll-API:
///   {"data": {"alarm": {"items": {"123": {...alarm felder...}}}}}
/// Daneben wird auch direktes {"Data": {...}} (flat) unterstützt.
fn extract_alarm(v: &Value) -> DiveraAlarm {
    for data_key in &["data", "Data"] {
        if let Some(data) = v.get(data_key) {
            // Verschachtelt: data.alarm.items.{erste_id}
            for alarm_key in &["alarm", "Alarm"] {
                if let Some(alarm_obj) = data.get(alarm_key) {
                    for items_key in &["items", "Items"] {
                        if let Some(items) = alarm_obj.get(items_key) {
                            let candidate = items.as_object()
                                .and_then(|m| m.values().next().cloned())
                                .or_else(|| items.as_array().and_then(|a| a.first().cloned()));
                            if let Some(first) = candidate {
                                if let Ok(a) = serde_json::from_value::<DiveraAlarm>(first) {
                                    if a.id.is_some() || a.title.is_some() {
                                        return a;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            // Flach: {"data": {id, title, address, ...}}
            if let Ok(a) = serde_json::from_value::<DiveraAlarm>(data.clone()) {
                if a.id.is_some() || a.title.is_some() || a.foreign_id.is_some() {
                    return a;
                }
            }
        }
    }
    // Direkt als Alarm-Objekt
    serde_json::from_value::<DiveraAlarm>(v.clone()).unwrap_or_default()
}

pub async fn webhook_divera(
    State(state): State<AppState>,
    Query(q): Query<WebhookQuery>,
    headers: HeaderMap,
    body: axum::body::Bytes,
) -> AppResult<Json<serde_json::Value>> {
    // Raw body loggen — hilft beim Debugging wenn DIVERA ein unerwartetes Format schickt
    let body_str = String::from_utf8_lossy(&body);
    tracing::info!(target: "divera_webhook", "Eingehender DIVERA-Webhook: {}", body_str);

    // Secret-Validierung: Query-Param ODER Authorization-Header ODER X-Webhook-Secret-Header
    let stored_secret = get_setting(&state.db, "divera_webhook_secret").await;
    if !stored_secret.is_empty() {
        let from_query = q.secret.as_deref().unwrap_or("");
        let from_auth = headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let from_header = headers
            .get("x-webhook-secret")
            .and_then(|v| v.to_str().ok())
            .unwrap_or("");
        let provided = if !from_query.is_empty() { from_query }
                       else if !from_auth.is_empty() { from_auth }
                       else { from_header };
        if provided != stored_secret {
            tracing::warn!(target: "divera_webhook", "Secret-Validierung fehlgeschlagen (provided={:?})", provided);
            return Err(AppError::Forbidden);
        }
    }

    let payload: Value = serde_json::from_slice(&body)
        .map_err(|e| {
            tracing::error!(target: "divera_webhook", "JSON-Parse-Fehler: {e}");
            AppError::BadRequest(format!("Ungültiges JSON: {e}"))
        })?;

    let alarm = extract_alarm(&payload);
    let external_id = alarm.foreign_id.clone()
        .filter(|s| !s.is_empty())
        .or_else(|| alarm.id.map(|i| format!("divera:{i}")));

    tracing::info!(target: "divera_webhook",
        "Alarm extrahiert — id={:?} title={:?} external_id={:?}",
        alarm.id, alarm.title, external_id
    );

    match insert_divera_alarm(&state.db, alarm).await? {
        false => {
            tracing::info!(target: "divera_webhook", "Duplikat erkannt: {:?}", external_id);
            Ok(Json(serde_json::json!({ "status": "duplicate", "external_id": external_id })))
        }
        true => {
            tracing::info!(target: "divera_webhook", "Einsatz angelegt: {:?}", external_id);
            Ok(Json(serde_json::json!({ "status": "created", "external_id": external_id })))
        }
    }
}

// ── Alamos Webhook ─────────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct AlamosLocation {
    pub street:     Option<String>,
    pub house:      Option<String>,
    pub postalCode: Option<String>,
    pub city:       Option<String>,
    pub building:   Option<String>,
    pub additional: Option<String>,
}

#[derive(Deserialize)]
pub struct AlamosData {
    pub externalId:          Option<String>,
    pub keyword:             Option<String>,
    pub keyword_description: Option<String>,
    pub message:             Option<Vec<String>>,
    pub location:            Option<AlamosLocation>,
}

#[derive(Deserialize)]
pub struct AlamosPayload {
    pub r#type:        Option<String>,
    pub timestamp:     Option<String>,
    pub authorization: Option<String>,
    pub data:          Option<AlamosData>,
}

pub async fn webhook_alamos(
    State(state): State<AppState>,
    Query(q): Query<WebhookQuery>,
    Json(payload): Json<AlamosPayload>,
) -> AppResult<Json<serde_json::Value>> {
    // Secret-Validierung (Query-Param ODER payload.authorization)
    let stored_secret = get_setting(&state.db, "alamos_webhook_secret").await;
    if !stored_secret.is_empty() {
        let provided = q.secret.as_deref()
            .or_else(|| payload.authorization.as_deref())
            .unwrap_or("");
        if provided != stored_secret {
            return Err(AppError::Forbidden);
        }
    }

    let data = payload.data.unwrap_or_else(|| AlamosData {
        externalId: None, keyword: None, keyword_description: None,
        message: None, location: None,
    });

    // Externe ID
    let external_id = data.externalId.filter(|s| !s.is_empty())
        .map(|id| format!("alamos:{id}"));

    // Duplikat-Prüfung
    if let Some(ref eid) = external_id {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM incident_reports WHERE external_id = $1)"
        )
        .bind(eid)
        .fetch_one(&state.db)
        .await?;
        if exists {
            return Ok(Json(serde_json::json!({ "status": "duplicate", "external_id": eid })));
        }
    }

    // Datum + Zeit aus timestamp
    let dt = payload.timestamp
        .as_deref()
        .and_then(|s| DateTime::parse_from_rfc3339(s).ok())
        .map(|dt| dt.with_timezone(&Utc));
    let incident_date = dt
        .map(|d| d.date_naive())
        .unwrap_or_else(|| Utc::now().date_naive());
    let alarm_time: Option<NaiveTime> = dt
        .map(|d| { let t = d.time(); NaiveTime::from_hms_opt(t.hour(), t.minute(), 0).unwrap_or(t) });

    // Einsatzort
    let location = if let Some(loc) = &data.location {
        let mut parts: Vec<String> = Vec::new();
        if let Some(s) = &loc.street {
            let mut addr = s.clone();
            if let Some(h) = &loc.house { addr.push(' '); addr.push_str(h); }
            parts.push(addr);
        }
        if let Some(c) = &loc.city { parts.push(c.clone()); }
        if let Some(b) = &loc.building { parts.push(b.clone()); }
        if let Some(a) = &loc.additional { parts.push(a.clone()); }
        if parts.is_empty() { "Unbekannt".to_string() } else { parts.join(", ") }
    } else {
        "Unbekannt".to_string()
    };

    let postal_code = data.location.as_ref()
        .and_then(|l| l.postalCode.clone())
        .filter(|s| !s.is_empty());

    let type_key   = data.keyword.unwrap_or_else(|| "sonstiges".to_string());
    let type_label = data.keyword_description.unwrap_or_else(|| type_key.clone());
    let notes = data.message
        .and_then(|msgs| msgs.into_iter().filter(|s| !s.is_empty()).next());

    let year = incident_date.year();
    let incident_number = next_free_number(&state.db, year).await?;

    sqlx::query(
        "INSERT INTO incident_reports
         (incident_number, incident_date, alarm_time,
          incident_type_key, incident_type_label, location, postal_code, notes,
          status, source, external_id,
          strength_leadership, strength_sub, strength_crew,
          resources)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'entwurf','alamos',$9,0,0,0,'{}')"
    )
    .bind(&incident_number)
    .bind(incident_date)
    .bind(alarm_time)
    .bind(&type_key)
    .bind(&type_label)
    .bind(&location)
    .bind(postal_code)
    .bind(notes)
    .bind(&external_id)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "status": "created",
        "incident_number": incident_number,
        "external_id": external_id,
    })))
}

// ── DIVERA Poll-Import ────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct ImportResult {
    pub imported: u32,
    pub skipped:  u32,
    pub errors:   u32,
}

/// DIVERA /api/v2/alarms Antwortstruktur
#[derive(Deserialize)]
struct DiveraAlarmsResponse {
    success: Option<bool>,
    data:    Option<DiveraAlarmsData>,
}

#[derive(Deserialize)]
struct DiveraAlarmsData {
    alarm: Option<DiveraAlarmCollection>,
    items: Option<Value>,   // einige API-Antworten liefern items direkt unter data
}

#[derive(Deserialize)]
struct DiveraAlarmCollection {
    items: Option<Value>,   // Map {"123": {...}} oder Array [{...}]
}

pub async fn import_divera(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<ImportResult>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }
    let api_key = get_setting(&state.db, "divera_api_key").await;
    if api_key.is_empty() {
        return Err(AppError::BadRequest("Kein DIVERA API-Key konfiguriert".into()));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e.to_string())))?;

    let resp = client
        .get("https://app.divera247.com/api/v2/alarms")
        .query(&[("accesskey", &api_key)])
        .send()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("DIVERA nicht erreichbar: {e}")))?;

    if !resp.status().is_success() {
        return Err(AppError::Internal(anyhow::anyhow!("DIVERA HTTP {}", resp.status())));
    }

    let body: DiveraAlarmsResponse = resp.json()
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("DIVERA Antwort ungültig: {e}")))?;

    if body.success == Some(false) {
        return Err(AppError::Internal(anyhow::anyhow!("DIVERA meldete Fehler (success=false)")));
    }

    let alarms: Vec<DiveraAlarm> = body.data
        .and_then(|d| {
            let from_alarm = d.alarm.and_then(|a| a.items);
            from_alarm.or(d.items)
        })
        .map(|items| match items {
            Value::Object(map) => map.into_values()
                .filter_map(|v| serde_json::from_value::<DiveraAlarm>(v).ok())
                .collect(),
            Value::Array(arr) => arr.into_iter()
                .filter_map(|v| serde_json::from_value::<DiveraAlarm>(v).ok())
                .collect(),
            _ => vec![],
        })
        .unwrap_or_default();

    let mut imported = 0u32;
    let mut skipped  = 0u32;
    let mut errors   = 0u32;

    for alarm in alarms {
        match insert_divera_alarm(&state.db, alarm).await {
            Ok(true)  => imported += 1,
            Ok(false) => skipped  += 1,
            Err(_)    => errors   += 1,
        }
    }

    audit::log(&state.db, Some(claims.sub), &claims.username,
        "DIVERA_IMPORT", None, None,
        Some(&format!("imported={imported} skipped={skipped} errors={errors}"))).await;

    Ok(Json(ImportResult { imported, skipped, errors }))
}

/// Gibt Ok(true) zurück wenn angelegt, Ok(false) bei Duplikat
async fn insert_divera_alarm(db: &sqlx::PgPool, alarm: DiveraAlarm) -> AppResult<bool> {
    let external_id = alarm.foreign_id
        .filter(|s| !s.is_empty())
        .or_else(|| alarm.id.map(|i| format!("divera:{i}")));

    if let Some(ref eid) = external_id {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM incident_reports WHERE external_id = $1)"
        )
        .bind(eid)
        .fetch_one(db)
        .await?;
        if exists { return Ok(false); }
    }

    let ts = alarm.ts_publish.filter(|&t| t > 0)
        .or_else(|| alarm.ts_create.filter(|&t| t > 0));
    let publish_dt = ts.and_then(|ts| DateTime::<Utc>::from_timestamp(ts, 0));
    let incident_date = publish_dt
        .map(|dt| dt.date_naive())
        .unwrap_or_else(|| Utc::now().date_naive());
    let alarm_time = publish_dt
        .map(|dt| { let t = dt.time(); NaiveTime::from_hms_opt(t.hour(), t.minute(), 0).unwrap_or(t) });
    let end_time = alarm.ts_close
        .and_then(|ts| DateTime::<Utc>::from_timestamp(ts, 0))
        .map(|dt| { let t = dt.time(); NaiveTime::from_hms_opt(t.hour(), t.minute(), 0).unwrap_or(t) });

    let location   = alarm.address.unwrap_or_else(|| "Unbekannt".to_string());
    let type_label = alarm.title.unwrap_or_else(|| "Einsatz".to_string());
    let status     = if alarm.closed.unwrap_or(false) { "archiviert" } else { "entwurf" };

    let mut notes_parts: Vec<String> = Vec::new();
    if let Some(txt) = alarm.text.filter(|s| !s.is_empty())  { notes_parts.push(txt); }
    if let Some(rep) = alarm.report.filter(|s| !s.is_empty()) { notes_parts.push(format!("Bericht: {rep}")); }
    if let (Some(lat), Some(lng)) = (alarm.lat, alarm.lng) {
        notes_parts.push(format!("Koordinaten: {lat:.5}, {lng:.5}"));
    }
    let notes = if notes_parts.is_empty() { None } else { Some(notes_parts.join("\n")) };

    let year = incident_date.year();
    let incident_number = if let Some(n) = alarm.number.filter(|s| !s.is_empty()) {
        n
    } else {
        next_free_number(db, year).await?
    };

    sqlx::query(
        "INSERT INTO incident_reports
         (incident_number, incident_date, alarm_time, end_time,
          incident_type_key, incident_type_label, location, notes,
          status, source, external_id,
          strength_leadership, strength_sub, strength_crew, resources)
         VALUES ($1,$2,$3,$4,'sonstiges',$5,$6,$7,$8,'divera',$9,0,0,0,'{}')"
    )
    .bind(&incident_number)
    .bind(incident_date)
    .bind(alarm_time)
    .bind(end_time)
    .bind(&type_label)
    .bind(&location)
    .bind(notes)
    .bind(status)
    .bind(&external_id)
    .execute(db)
    .await?;

    Ok(true)
}

// ── DIVERA Verbindungstest ────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TestResult {
    pub ok:      bool,
    pub message: String,
}

pub async fn test_divera(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<TestResult>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }
    let api_key = get_setting(&state.db, "divera_api_key").await;
    if api_key.is_empty() {
        return Ok(Json(TestResult {
            ok: false,
            message: "Kein API-Key konfiguriert.".into(),
        }));
    }

    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e.to_string())))?;

    match client
        .get("https://app.divera247.com/api/v2/alarms")
        .query(&[("accesskey", &api_key)])
        .send()
        .await
    {
        Ok(resp) if resp.status().is_success() => {
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            if body.get("success").and_then(|v| v.as_bool()) == Some(false) {
                Ok(Json(TestResult {
                    ok: false,
                    message: "API-Key ungültig (DIVERA meldet success=false).".into(),
                }))
            } else {
                Ok(Json(TestResult {
                    ok: true,
                    message: "Verbindung zu DIVERA erfolgreich.".into(),
                }))
            }
        }
        Ok(resp) => Ok(Json(TestResult {
            ok: false,
            message: format!("DIVERA HTTP {}", resp.status()),
        })),
        Err(e) => Ok(Json(TestResult {
            ok: false,
            message: format!("Verbindung fehlgeschlagen: {e}"),
        })),
    }
}

// ── Hilfsfunktion ─────────────────────────────────────────────────────────────

async fn next_free_number(db: &sqlx::PgPool, year: i32) -> AppResult<String> {
    let max_seq: Option<i32> = sqlx::query_scalar(
        "SELECT MAX(CAST(SPLIT_PART(incident_number, '-', 2) AS INTEGER))
         FROM incident_reports
         WHERE incident_number LIKE $1"
    )
    .bind(format!("{year}-") + "%")
    .fetch_one(db)
    .await?;
    Ok(format!("{year}-{:03}", max_seq.unwrap_or(0) + 1))
}

// ── Router ────────────────────────────────────────────────────────────────────

/// Geschützte Einstellungs-Routen — in main.rs unter /api/integrations eingehängt
pub fn settings_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(get_integrations).put(update_integrations))
        .route("/divera/test",   post(test_divera))
        .route("/divera/import", post(import_divera))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}

/// Öffentliche Webhook-Routen (Auth via Secret-Param) — in main.rs unter /api eingehängt
pub fn webhooks_router() -> Router<AppState> {
    Router::new()
        .route("/webhook/divera", post(webhook_divera))
        .route("/webhook/alamos", post(webhook_alamos))
}
