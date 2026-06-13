use axum::{
    extract::{DefaultBodyLimit, Multipart, State},
    handler::Handler,
    http::{header, StatusCode},
    middleware,
    response::{IntoResponse, Response},
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;
use tokio::fs;

use crate::{
    audit,
    auth::middleware::{require_auth, Claims},
    crypto,
    errors::{AppError, AppResult},
    AppState,
};

pub const KNOWN_MODULES: &[&str] = &[
    "lager.read", "lager", "lager.approve",
    "personal", "fahrzeuge",
    "einsatzberichte.read", "einsatzberichte", "einsatzberichte.approve",
    "verein",
];

#[derive(Serialize)]
pub struct Settings {
    pub ff_name: String,
    pub ff_strasse: String,
    pub ff_ort: String,
    pub setup_complete: bool,
    pub modules: HashMap<String, bool>,
    pub datenschutz_kontakt_name:    String,
    pub datenschutz_kontakt_email:   String,
    pub datenschutz_kontakt_telefon: String,
    pub datenschutz_hoster:          String,
}

#[derive(Deserialize)]
pub struct UpdateSettings {
    pub ff_name: Option<String>,
    pub ff_strasse: Option<String>,
    pub ff_ort: Option<String>,
    pub datenschutz_kontakt_name:    Option<String>,
    pub datenschutz_kontakt_email:   Option<String>,
    pub datenschutz_kontakt_telefon: Option<String>,
    pub datenschutz_hoster:          Option<String>,
}

/// Öffentlich abrufbare Settings für die Datenschutzerklärung (kein Login nötig).
#[derive(Serialize)]
pub struct PublicSettings {
    pub ff_name:    String,
    pub ff_strasse: String,
    pub ff_ort:     String,
    pub datenschutz_kontakt_name:    String,
    pub datenschutz_kontakt_email:   String,
    pub datenschutz_kontakt_telefon: String,
    pub datenschutz_hoster:          String,
}

pub async fn get_settings(State(state): State<AppState>) -> AppResult<Json<Settings>> {
    let rows = sqlx::query!("SELECT key, value FROM settings")
        .fetch_all(&state.db)
        .await?;

    let map: HashMap<String, String> = rows
        .into_iter()
        .map(|r| (r.key, r.value))
        .collect();

    let mut modules = HashMap::new();
    for &m in KNOWN_MODULES {
        let key = format!("module_{}", m);
        modules.insert(m.to_string(), map.get(&key).map(|v| v == "true").unwrap_or(false));
    }

    Ok(Json(Settings {
        ff_name:        map.get("ff_name").cloned().unwrap_or_default(),
        ff_strasse:     map.get("ff_strasse").cloned().unwrap_or_default(),
        ff_ort:         map.get("ff_ort").cloned().unwrap_or_default(),
        setup_complete: map.get("setup_complete").map(|v| v == "true").unwrap_or(false),
        modules,
        datenschutz_kontakt_name:    map.get("datenschutz_kontakt_name").cloned().unwrap_or_default(),
        datenschutz_kontakt_email:   map.get("datenschutz_kontakt_email").cloned().unwrap_or_default(),
        datenschutz_kontakt_telefon: map.get("datenschutz_kontakt_telefon").cloned().unwrap_or_default(),
        datenschutz_hoster:          map.get("datenschutz_hoster").cloned().unwrap_or_else(|| "Eigener Server".to_string()),
    }))
}

pub async fn update_settings(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<UpdateSettings>,
) -> AppResult<Json<Settings>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }
    if let Some(name) = &body.ff_name {
        if name.len() > 200 {
            return Err(AppError::BadRequest("ff_name: maximal 200 Zeichen".into()));
        }
        sqlx::query!(
            "INSERT INTO settings (key, value) VALUES ('ff_name', $1)
             ON CONFLICT (key) DO UPDATE SET value = $1",
            name
        )
        .execute(&state.db)
        .await?;
    }

    if let Some(strasse) = &body.ff_strasse {
        sqlx::query!(
            "INSERT INTO settings (key, value) VALUES ('ff_strasse', $1)
             ON CONFLICT (key) DO UPDATE SET value = $1",
            strasse
        )
        .execute(&state.db)
        .await?;
    }

    if let Some(ort) = &body.ff_ort {
        sqlx::query!(
            "INSERT INTO settings (key, value) VALUES ('ff_ort', $1)
             ON CONFLICT (key) DO UPDATE SET value = $1",
            ort
        )
        .execute(&state.db)
        .await?;
    }

    let dse_fields = [
        ("datenschutz_kontakt_name",    &body.datenschutz_kontakt_name),
        ("datenschutz_kontakt_email",   &body.datenschutz_kontakt_email),
        ("datenschutz_kontakt_telefon", &body.datenschutz_kontakt_telefon),
        ("datenschutz_hoster",          &body.datenschutz_hoster),
    ];
    for (key, val_opt) in dse_fields {
        if let Some(val) = val_opt {
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ($1, $2)
                 ON CONFLICT (key) DO UPDATE SET value = $2"
            )
            .bind(key)
            .bind(val)
            .execute(&state.db)
            .await?;
        }
    }

    audit::log(&state.db, Some(claims.sub), &claims.username, "SETTINGS_UPDATED",
        Some("settings"), None, None).await;

    get_settings(State(state)).await
}

// ── Module aktivieren/deaktivieren ───────────────────────────────────────────

#[derive(Deserialize)]
pub struct UpdateModules {
    pub modules: HashMap<String, bool>,
}

pub async fn update_modules(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<UpdateModules>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    for (key, value) in &body.modules {
        if !KNOWN_MODULES.contains(&key.as_str()) {
            continue;
        }
        let setting_key = format!("module_{}", key);
        let setting_val = if *value { "true" } else { "false" };
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2",
        )
        .bind(&setting_key)
        .bind(setting_val)
        .execute(&state.db)
        .await?;
    }

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "MODULES_UPDATED",
        Some("settings"),
        None,
        None,
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── PDF-Vorlage: öffentlich abrufbar ─────────────────────────────────────────
pub async fn get_pdf(State(state): State<AppState>) -> Response {
    let path = Path::new(&state.config.data_dir).join("beschaffungsauftrag.pdf");
    match fs::read(&path).await {
        Ok(bytes) => (
            StatusCode::OK,
            [(header::CONTENT_TYPE, "application/pdf")],
            bytes,
        )
            .into_response(),
        Err(_) => (
            StatusCode::NOT_FOUND,
            Json(serde_json::json!({"error": "Keine PDF-Vorlage hinterlegt. Bitte im Admin-Panel hochladen."})),
        )
            .into_response(),
    }
}

// ── PDF-Vorlage hochladen (nur Admin/Superuser) ───────────────────────────────
pub async fn upload_pdf(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() == Some("file") {
            let content_type = field.content_type().unwrap_or("").to_string();
            if content_type != "application/pdf" {
                return Err(AppError::BadRequest("Nur PDF-Dateien erlaubt".into()));
            }

            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;

            const MAX_PDF_SIZE: usize = 10 * 1024 * 1024; // 10 MB
            if data.len() > MAX_PDF_SIZE {
                return Err(AppError::BadRequest("PDF zu groß (max. 10 MB)".into()));
            }

            let dir = Path::new(&state.config.data_dir);
            fs::create_dir_all(dir)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            fs::write(dir.join("beschaffungsauftrag.pdf"), &data)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            return Ok(Json(serde_json::json!({"ok": true})));
        }
    }

    Err(AppError::BadRequest("Keine PDF-Datei im Request gefunden".into()))
}

// ── PDF-Vorlage löschen (nur Admin/Superuser) ─────────────────────────────────
pub async fn delete_pdf(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let path = Path::new(&state.config.data_dir).join("beschaffungsauftrag.pdf");
    if !path.exists() {
        return Err(AppError::NotFound);
    }

    fs::remove_file(&path)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "PDF_DELETED",
        Some("settings"), None, None).await;

    Ok(Json(serde_json::json!({"ok": true})))
}

// ── SMTP-Konfiguration ───────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct SmtpConfigResponse {
    pub host:         String,
    pub port:         u16,
    pub username:     String,
    pub password_set: bool,
    pub from_email:   String,
    pub from_name:    String,
    pub encryption:   String,
}

#[derive(Deserialize)]
pub struct SmtpConfigRequest {
    pub host:       String,
    pub port:       u16,
    pub username:   String,
    pub password:   String, // leer = bisheriges Passwort beibehalten
    pub from_email: String,
    pub from_name:  String,
    pub encryption: String,
}

pub async fn get_smtp_config(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<SmtpConfigResponse>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT key, value FROM settings WHERE key LIKE 'smtp_%'",
    )
    .fetch_all(&state.db)
    .await?;

    let map: HashMap<String, String> = rows.into_iter().collect();

    Ok(Json(SmtpConfigResponse {
        host:         map.get("smtp_host").cloned().unwrap_or_default(),
        port:         map.get("smtp_port").and_then(|v| v.parse().ok()).unwrap_or(587),
        username:     map.get("smtp_username").cloned().unwrap_or_default(),
        password_set: map.get("smtp_password").map(|v| !v.is_empty()).unwrap_or(false),
        from_email:   map.get("smtp_from_email").cloned().unwrap_or_default(),
        from_name:    map.get("smtp_from_name").cloned().unwrap_or_default(),
        encryption:   map.get("smtp_encryption").cloned().unwrap_or_else(|| "starttls".to_string()),
    }))
}

pub async fn update_smtp_config(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<SmtpConfigRequest>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let non_password_pairs = [
        ("smtp_host",       body.host),
        ("smtp_port",       body.port.to_string()),
        ("smtp_username",   body.username),
        ("smtp_from_email", body.from_email),
        ("smtp_from_name",  body.from_name),
        ("smtp_encryption", body.encryption),
    ];

    for (key, value) in &non_password_pairs {
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ($1, $2)
             ON CONFLICT (key) DO UPDATE SET value = $2"
        )
        .bind(key)
        .bind(value)
        .execute(&state.db)
        .await?;
    }

    // Passwort nur aktualisieren wenn ein neues übergeben wurde
    if !body.password.is_empty() {
        let encrypted = crypto::encrypt(&body.password, &state.config.encryption_key)
            .map_err(|e| AppError::Internal(e))?;
        sqlx::query(
            "INSERT INTO settings (key, value) VALUES ('smtp_password', $1)
             ON CONFLICT (key) DO UPDATE SET value = $1"
        )
        .bind(&encrypted)
        .execute(&state.db)
        .await?;
    }

    audit::log(&state.db, Some(claims.sub), &claims.username, "SMTP_UPDATED",
        Some("settings"), None, None).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

#[derive(Deserialize)]
pub struct TestMailBody {
    pub to: String,
}

pub async fn send_test_mail(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<TestMailBody>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    // SMTP-Config laden
    let rows: Vec<(String, String)> = sqlx::query_as(
        "SELECT key, value FROM settings WHERE key LIKE 'smtp_%'",
    )
    .fetch_all(&state.db)
    .await?;

    let map: HashMap<String, String> = rows.into_iter().collect();

    let host       = map.get("smtp_host").cloned().unwrap_or_default();
    let port: u16  = map.get("smtp_port").and_then(|v| v.parse().ok()).unwrap_or(587);
    let username   = map.get("smtp_username").cloned().unwrap_or_default();
    let password   = map.get("smtp_password")
        .map(|v| crypto::decrypt_or_plaintext(v, &state.config.encryption_key))
        .unwrap_or_default();
    let from_email = map.get("smtp_from_email").cloned().unwrap_or_default();
    let from_name  = map.get("smtp_from_name").cloned().unwrap_or_else(|| "FeuerwehrHub".to_string());
    let encryption = map.get("smtp_encryption").cloned().unwrap_or_else(|| "starttls".to_string());

    if host.is_empty() || from_email.is_empty() {
        return Err(AppError::BadRequest("SMTP-Host und Absender-E-Mail müssen konfiguriert sein".into()));
    }

    use lettre::{
        message::header::ContentType,
        transport::smtp::authentication::Credentials,
        AsyncSmtpTransport, AsyncTransport, Message, Tokio1Executor,
    };

    let email = Message::builder()
        .from(format!("{} <{}>", from_name, from_email).parse()
            .map_err(|_| AppError::BadRequest("Ungültige Absender-Adresse".into()))?)
        .to(body.to.parse()
            .map_err(|_| AppError::BadRequest("Ungültige Empfänger-Adresse".into()))?)
        .subject("FeuerwehrHub – SMTP Test")
        .header(ContentType::TEXT_PLAIN)
        .body("Diese E-Mail bestätigt, dass die SMTP-Konfiguration in FeuerwehrHub funktioniert.".to_string())
        .map_err(|e| AppError::BadRequest(format!("E-Mail konnte nicht erstellt werden: {}", e)))?;

    let creds = Credentials::new(username, password);

    let mailer = match encryption.as_str() {
        "tls" => AsyncSmtpTransport::<Tokio1Executor>::relay(&host)
            .map_err(|e| AppError::BadRequest(format!("SMTP-Verbindungsfehler: {}", e)))?
            .port(port)
            .credentials(creds)
            .build(),
        "none" => AsyncSmtpTransport::<Tokio1Executor>::builder_dangerous(&host)
            .port(port)
            .credentials(creds)
            .build(),
        _ /* starttls */ => AsyncSmtpTransport::<Tokio1Executor>::starttls_relay(&host)
            .map_err(|e| AppError::BadRequest(format!("SMTP-Verbindungsfehler: {}", e)))?
            .port(port)
            .credentials(creds)
            .build(),
    };

    mailer.send(email).await
        .map_err(|e| AppError::BadRequest(format!("E-Mail-Versand fehlgeschlagen: {}", e)))?;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Test-Mail versendet" })))
}

/// Öffentlicher Endpunkt — gibt nur DSE-relevante Felder zurück, kein Login nötig.
pub async fn get_public_settings(State(state): State<AppState>) -> AppResult<Json<PublicSettings>> {
    let rows = sqlx::query!("SELECT key, value FROM settings")
        .fetch_all(&state.db)
        .await?;

    let map: HashMap<String, String> = rows
        .into_iter()
        .map(|r| (r.key, r.value))
        .collect();

    Ok(Json(PublicSettings {
        ff_name:                     map.get("ff_name").cloned().unwrap_or_default(),
        ff_strasse:                  map.get("ff_strasse").cloned().unwrap_or_default(),
        ff_ort:                      map.get("ff_ort").cloned().unwrap_or_default(),
        datenschutz_kontakt_name:    map.get("datenschutz_kontakt_name").cloned().unwrap_or_default(),
        datenschutz_kontakt_email:   map.get("datenschutz_kontakt_email").cloned().unwrap_or_default(),
        datenschutz_kontakt_telefon: map.get("datenschutz_kontakt_telefon").cloned().unwrap_or_default(),
        datenschutz_hoster:          map.get("datenschutz_hoster").cloned().unwrap_or_else(|| "Eigener Server".to_string()),
    }))
}

pub fn public_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/public", get(get_public_settings))
        .with_state(state)
}

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(get_settings).put(update_settings))
        .route("/modules", put(update_modules))
        .route("/pdf", get(get_pdf)
            .post(upload_pdf.layer(DefaultBodyLimit::max(12 * 1024 * 1024)))
            .delete(delete_pdf))
        .route("/smtp", get(get_smtp_config).put(update_smtp_config))
        .route("/smtp/test", post(send_test_mail))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth))
}
