use axum::{
    extract::{Path, Query, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use chrono::{NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use validator::Validate;
use uuid::Uuid;
use sqlx::types::Json as SqlJson;

use crate::{
    auth::middleware::{require_module, require_auth, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ───────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Lehrgang {
    pub id:                   Uuid,
    pub titel:                String,
    pub description:          Option<String>,
    pub veranstaltungsort:    Option<String>,
    pub start_date:           NaiveDate,
    pub end_date:             NaiveDate,
    pub registration_deadline: NaiveDate,
    pub max_places:           i32,
    pub prerequisites:        SqlJson<Vec<Uuid>>, // IDs von Qualifikationen
    pub status:               String,
    pub creator_id:           Uuid,
    pub created_at:           chrono::DateTime<Utc>,
    pub updated_at:           chrono::DateTime<Utc>,
}

#[derive(Deserialize, Validate)]
pub struct LehrgangBody {
    #[validate(length(min = 1, max = 200))]
    pub titel:                String,
    pub description:          Option<String>,
    pub veranstaltungsort:    Option<String>,
    pub start_date:           NaiveDate,
    pub end_date:             NaiveDate,
    pub registration_deadline: NaiveDate,
    pub max_places:           i32,
    pub prerequisites:        Option<Vec<Uuid>>,
}

#[derive(Deserialize)]
pub struct UpdateLehrgangBody {
    #[validate(length(min = 1, max = 200))]
    pub titel:                Option<String>,
    pub description:          Option<String>,
    pub veranstaltungsort:    Option<String>,
    pub start_date:           Option<NaiveDate>,
    pub end_date:             Option<NaiveDate>,
    pub registration_deadline: Option<NaiveDate>,
    pub max_places:           Option<i32>,
    pub prerequisites:        Option<Vec<Uuid>>,
    pub status:               Option<String>,
}

#[derive(Deserialize)]
pub struct LehrgangQuery {
    pub status:      Option<String>,      // gefiltert nach status
    pub start_after: Option<NaiveDate>,   // ab diesem Datum
    pub end_before:  Option<NaiveDate>,   // bis zu diesem Datum
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Registrierung {
    pub id:              Uuid,
    pub user_id:         Uuid,
    pub lehrgang_id:     Uuid,
    pub registered_at:   chrono::DateTime<Utc>,
    pub status:          String,
    pub username:        Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct RegistrierungBody {
    // optional: Typ der Bewerbung
    pub typ: Option<String>, // z.B. "regulär", "vertretung", etc.
    // optional: Notiz vom Bewerber
    #[validate(length(max = 500))]
    pub notiz: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateRegistrierungBody {
    pub status: Option<String>, // z.B. "platz_zugewiesen", "warteliste", "abgelehnt"
    pub notiz: Option<String>, // interne Notiz vom Admin
}

#[derive(Serialize)]
pub struct ExportTeilnehmerResponse {
    pub email:      String,
    pub vorname:    Option<String>,
    pub nachname:   Option<String>,
    pub username:   String,
    pub lehrgang_titel:    String,
    pub lehrgang_datum:    String, // Format: start_date bis end_date
    pub lehrgang_ort:     Option<String>,
}

// ── Helper ──────────────────────────────────────────────────────────────

async fn fetch_lehrgang_by_id(db: &sqlx::PgPool, id: Uuid) -> AppResult<Lehrgang> {
    let lehrgang = sqlx::query_as::<_, Lehrgang>(
        "SELECT id, titel, description, veranstaltungsort, start_date, end_date, registration_deadline, max_places, prerequisites, status, creator_id, created_at, updated_at
         FROM lehrgaenge WHERE id = $1"
    )
    .bind(id)
    .fetch_one(db)
    .await
    .map_err(|_| AppError::NotFound);

    Ok(lehrgang)
}

async fn count_aktuell_plaetze(db: &sqlx::PgPool, lehrgang_id: Uuid) -> AppResult<i32> {
    let count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lehrgang_registrierungen WHERE lehrgang_id = $1 AND status = 'platz_zugewiesen'"
    )
    .bind(lehrgang_id)
    .fetch_one(db)
    .await?;
    Ok(count as i32)
}

// ── Lehrgänge ─────────────────────────────────────────────────────────

pub async fn list_lehrgaenge(
    State(state): State<AppState>,
    Query(query): Query<LehrgangQuery>,
) -> AppResult<Json<Vec<Lehrgang>>> {
    let mut sql = "SELECT id, titel, description, veranstaltungsort, start_date, end_date, registration_deadline, max_places, prerequisites, status, creator_id, created_at, updated_at FROM lehrgaenge WHERE status = 'veröffentlicht'".to_string();
    let mut bindings: Vec<sqlx::types::Json<Uuid>> = Vec::new();

    if let Some(status) = query.status {
        sql.push_str(" AND status = $1");
        bindings.push(sqlx::types::Json(status));
    }
    if let Some(start_after) = query.start_after {
        let placeholder = if bindings.is_empty() { "$1" } else { format!("${}", bindings.len() + 1) };
        sql.push_str(&format!(" AND start_date >= {}", placeholder));
        bindings.push(sqlx::types::Json(start_after));
    }
    if let Some(end_before) = query.end_before {
        let placeholder = if bindings.is_empty() { "$1" } else if bindings.len() == 1 { "$2" } else { format!("${}", bindings.len() + 1) };
        sql.push_str(&format!(" AND end_date <= {}", placeholder));
        bindings.push(sqlx::types::Json(end_before));
    }

    sql.push_str(" ORDER BY start_date ASC, titel ASC");

    let mut query = sqlx::query_as::<_, Lehrgang>(&sql);
    for binding in bindings {
        query = query.bind(binding);
    }

    let lehrgaenge = query.fetch_all(&state.db).await?;
    Ok(Json(lehrgaenge))
}

pub async fn get_lehrgang(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<Lehrgang>> {
    let lehrgang = fetch_lehrgang_by_id(&state.db, id).await?;
    Ok(Json(lehrgang))
}

pub async fn create_lehrgang(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<LehrgangBody>,
) -> AppResult<Json<Lehrgang>> {
    body.validate()?;

    // Validierung: Anmeldefrist muss nach heute liegen für veröffentlichte Lehrgänge
    if body.status == Some("veröffentlicht".to_string()) {
        if body.registration_deadline <= Utc::now().date_naive() {
            return Err(AppError::BadRequest("Anmeldefrist muss in der Zukunft liegen für veröffentlichte Lehrgänge".into()));
        }
    }

    let prerequisites_json = body.prerequisites.unwrap_or_default();
    let lehrgang = sqlx::query_as::<_, Lehrgang>(
        "INSERT INTO lehrgaenge (titel, description, veranstaltungsort, start_date, end_date, registration_deadline, max_places, prerequisites, status, creator_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, titel, description, veranstaltungsort, start_date, end_date, registration_deadline, max_places, prerequisites, status, creator_id, created_at, updated_at"
    )
    .bind(&body.titel)
    .bind(&body.description)
    .bind(&body.veranstaltungsort)
    .bind(body.start_date)
    .bind(body.end_date)
    .bind(body.registration_deadline)
    .bind(body.max_places)
    .bind(SqlJson(prerequisites_json))
    .bind(body.status.unwrap_or_else(|| "entwurf".to_string()))
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(lehrgang))
}

pub async fn update_lehrgang(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateLehrgangBody>,
) -> AppResult<Json<Lehrgang>> {
    let existing = fetch_lehrgang_by_id(&state.db, id).await?;

    // Berechtigungscheck: nur Admin oder Ersteller kann bearbeiten (erweitert später mit require_module)
    // Einfache Admin-Prüfung:
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    // Validierung: Wenn status geändert wird auf "veröffentlicht", prüfen Anmeldefrist in der Zukunft
    let new_status = body.status.as_ref().unwrap_or(&existing.status);
    if new_status == "veröffentlicht" && body.registration_deadline.unwrap_or(existing.registration_deadline) <= Utc::now().date_naive() {
        return Err(AppError::BadRequest("Anmeldefrist muss in der Zukunft liegen für veröffentlichte Lehrgänge".into()));
    }

    let new_titel = body.titel.as_ref().unwrap_or(&existing.titel);
    let new_description = body.description.as_ref().unwrap_or(&existing.description);
    let new_veranstaltungsort = body.veranstaltungsort.as_ref().unwrap_or(&existing.veranstaltungsort);
    let new_start_date = body.start_date.unwrap_or(existing.start_date);
    let new_end_date = body.end_date.unwrap_or(existing.end_date);
    let new_registration_deadline = body.registration_deadline.unwrap_or(existing.registration_deadline);
    let new_max_places = body.max_places.unwrap_or(existing.max_places);
    let new_prerequisites = body.prerequisites.as_ref().unwrap_or(&existing.prerequisites);

    let lehrgang = sqlx::query_as::<_, Lehrgang>(
        "UPDATE lehrgaenge
         SET titel = $1, description = $2, veranstaltungsort = $3, start_date = $4, end_date = $5, registration_deadline = $6, max_places = $7, prerequisites = $8, status = $9
         WHERE id = $10
         RETURNING id, titel, description, veranstaltungsort, start_date, end_date, registration_deadline, max_places, prerequisites, status, creator_id, created_at, updated_at"
    )
    .bind(new_titel)
    .bind(new_description)
    .bind(new_veranstaltungsort)
    .bind(new_start_date)
    .bind(new_end_date)
    .bind(new_registration_deadline)
    .bind(new_max_places)
    .bind(new_prerequisites)
    .bind(new_status)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(lehrgang))
}

pub async fn delete_lehrgang(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // Nur Admin oder Ersteller kann löschen (erweitert später mit require_module)
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query("DELETE FROM lehrgaenge WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Lehrgang gelöscht" })))
}

// ── Registrierungen ─────────────────────────────────────────────────────────

pub async fn list_registrierungen(
    State(state): State<AppState>,
    Path(lehrgang_id): Path<Uuid>,
) -> AppResult<Json<Vec<Registrierung>>> {
    let registrierungen = sqlx::query_as::<_, Registrierung>(
        "SELECT r.id, r.user_id, r.lehrgang_id, r.registered_at, r.status, u.username
         FROM lehrgang_registrierungen r
         JOIN users u ON u.id = r.user_id
         WHERE r.lehrgang_id = $1
         ORDER BY r.registered_at DESC"
    )
    .bind(lehrgang_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(registrierungen))
}

pub async fn create_registrierung(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(lehrgang_id): Path<Uuid>,
    Json(body): Json<RegistrierungBody>,
) -> AppResult<Json<Registrierung>> {
    body.validate()?;

    // Prüfen ob Lehrgang existiert und veröffentlicht ist
    let lehrgang = fetch_lehrgang_by_id(&state.db, lehrgang_id).await?;
    if lehrgang.status != "veröffentlicht" {
        return Err(AppError::BadRequest("Nur veröffentlichte Lehrgänge können gebucht werden".into()));
    }

    // Prüfen ob Anmeldefrist noch nicht abgelaufen
    if lehrgang.registration_deadline < Utc::now().date_naive() {
        return Err(AppError::BadRequest("Anmeldefrist abgelaufen".into()));
    }

    // Prüfen ob Benutzer bereits registriert ist
    let existing: Option<Registrierung> = sqlx::query_as::<_, Registrierung>(
        "SELECT id, user_id, lehrgang_id, registered_at, status, username FROM lehrgang_registrierungen r
         JOIN users u ON u.id = r.user_id
         WHERE r.lehrgang_id = $1 AND r.user_id = $2"
    )
    .bind(lehrgang_id)
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?;

    if existing.is_some() {
        return Err(AppError::Conflict("Sie sind bereits für diesen Lehrgang registriert".into()));
    }

    let registrierung = sqlx::query_as::<_, Registrierung>(
        "INSERT INTO lehrgang_registrierungen (user_id, lehrgang_id, status)
         VALUES ($1, $2, $3)
         RETURNING id, user_id, lehrgang_id, registered_at, status"
    )
    .bind(claims.sub)
    .bind(lehrgang_id)
    .bind("angemeldet")
    .fetch_one(&state.db)
    .await?;

    Ok(Json(registrierung))
}

pub async fn update_registrierung_status(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((lehrgang_id, registrierung_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateRegistrierungBody>,
) -> AppResult<Json<Registrierung>> {
    body.validate()?;

    // Nur Admin kann Registrierung status ändern
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let status = body.status.as_deref().unwrap_or("angemeldet");
    // Validierung des Status
    let valid_statuses = ["angemeldet", "bewerbt", "platz_zugewiesen", "warteliste", "abgelehnt", "storniert"];
    if !valid_statuses.contains(&status) {
        return Err(AppError::BadRequest("Ungültiger Status".into()));
    }

    let lehrgang = fetch_lehrgang_by_id(&state.db, lehrgang_id).await?;

    // Wenn Status auf "platz_zugewiesen" gesetzt wird, prüfen Platzlimit
    if status == "platz_zugewiesen" {
        let aktuelle_plaetze = count_aktuell_plaetze(&state.db, lehrgang_id).await?;
        if aktuelle_plaetze >= lehrgang.max_places {
            return Err(AppError::BadRequest("Nicht mehr Plätze verfügbar".into()));
        }
    }

    let registrierung = sqlx::query_as::<_, Registrierung>(
        "UPDATE lehrgang_registrierungen
         SET status = $1
         WHERE id = $2 AND lehrgang_id = $3
         RETURNING id, user_id, lehrgang_id, registered_at, status"
    )
    .bind(status)
    .bind(registrierung_id)
    .bind(lehrgang_id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound);

    Ok(Json(registrierung))
}

pub async fn delete_registrierung(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((lehrgang_id, registrierung_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    // Nur Admin oder gleicher Benutzer kann löschen
    if !claims.is_admin_or_above() && claims.sub != registrierung_id {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query(
        "DELETE FROM lehrgang_registrierungen WHERE id = $1 AND lehrgang_id = $2"
    )
    .bind(registrierung_id)
    .bind(lehrgang_id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Registrierung gelöscht" })))
}

// ── Export (E-Mail-Vorlage) ────────────────────────────────────────────────

pub async fn export_teilnehmer(
    State(state): State<AppState>,
    Path(lehrgang_id): Path<Uuid>,
) -> AppResult<Json<Vec<ExportTeilnehmerResponse>>> {
    // Nur Admin kann exportieren
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let teilnehmer = sqlx::query_as::<_, ExportTeilnehmerResponse>(
        "SELECT u.username, u.display_name as vorname, (SELECT username FROM users WHERE id = u.id) as nachname,
                l.titel as lehrgang_titel,
                l.start_date, l.end_date,
                l.veranstaltungsort
         FROM lehrgang_registrierungen lr
         JOIN users u ON u.id = lr.user_id
         JOIN lehrgaenge l ON l.id = lr.lehrgang_id
         WHERE lr.lehrgang_id = $1 AND lr.status = 'platz_zugewiesen'
         ORDER BY u.display_name, u.username"
    )
    .bind(lehrgang_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(teilnehmer))
}

// ── Router ──────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_lehrgaenge).post(create_lehrgang))
        .route("/:id", get(get_lehrgang).put(update_lehrgang).delete(delete_lehrgang))
        .route("/:id/registrierungen", get(list_registrierungen))
        .route("/:id/registrierungen/create", post(create_registrierung))
        .route("/:id/registrierungen/:id", put(update_registrierung_status).delete(delete_registrierung))
        .route("/:id/export", get(export_teilnehmer))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("lehrgangsverwaltung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}