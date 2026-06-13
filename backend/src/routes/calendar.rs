use axum::{
    extract::{Path, State},
    http::header,
    middleware,
    response::{IntoResponse, Response},
    routing::{get, post},
    Extension, Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use uuid::Uuid;

use crate::{
    auth::middleware::{require_auth, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct IcalTermin {
    id:          Uuid,
    title:       String,
    start_at:    DateTime<Utc>,
    end_at:      Option<DateTime<Utc>>,
    location:    Option<String>,
    description: Option<String>,
    typ_name:    Option<String>,
    created_at:  DateTime<Utc>,
    updated_at:  DateTime<Utc>,
}

#[derive(Serialize)]
pub struct IcalTokenResponse {
    pub token: Uuid,
    pub url:   String,
}

// ── Token verwalten ──────────────────────────────────────────────────────────

/// Aktuellen iCal-Token abrufen (oder null wenn noch keiner existiert)
pub async fn get_ical_token(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let (token, created_at): (Option<Uuid>, Option<DateTime<Utc>>) = sqlx::query_as(
        "SELECT ical_token, ical_token_created_at FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "token": token,
        "created_at": created_at,
    })))
}

/// Neuen iCal-Token generieren (ersetzt vorherigen)
pub async fn generate_ical_token(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let token = Uuid::new_v4();

    sqlx::query(
        "UPDATE users SET ical_token = $1, ical_token_created_at = NOW() WHERE id = $2"
    )
    .bind(token)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "token": token })))
}

/// iCal-Token löschen (Feed deaktivieren)
pub async fn revoke_ical_token(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    sqlx::query(
        "UPDATE users SET ical_token = NULL, ical_token_created_at = NULL WHERE id = $1"
    )
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "message": "Token widerrufen" })))
}

// ── Öffentlicher iCal-Feed ──────────────────────────────────────────────────

pub async fn ical_feed(
    State(state): State<AppState>,
    Path(token): Path<Uuid>,
) -> Result<Response, AppError> {
    // Token → User-ID ermitteln (gesperrte Accounts und abgelaufene Tokens abgelehnt)
    let user_id: Option<Uuid> = sqlx::query_scalar(
        "SELECT id FROM users WHERE ical_token = $1
         AND (locked_until IS NULL OR locked_until < NOW())
         AND (ical_token_created_at IS NULL
              OR ical_token_created_at > NOW() - INTERVAL '1 year')"
    )
    .bind(token)
    .fetch_optional(&state.db)
    .await?;

    let user_id = user_id.ok_or(AppError::NotFound)?;

    // Termine laden (gleiche Logik wie get_my_termine)
    let termine = sqlx::query_as::<_, IcalTermin>(
        "SELECT t.id, t.title, t.start_at, t.end_at, t.location, t.description,
                tt.name AS typ_name, t.created_at, t.updated_at
         FROM termine t
         LEFT JOIN termin_typen tt ON tt.id = t.typ_id
         WHERE
             NOT EXISTS (SELECT 1 FROM termin_assignments ta WHERE ta.termin_id = t.id)
             OR
             EXISTS (SELECT 1 FROM termin_assignments ta
                     WHERE ta.termin_id = t.id AND ta.user_id = $1)
         ORDER BY t.start_at ASC"
    )
    .bind(user_id)
    .fetch_all(&state.db)
    .await?;

    // iCal generieren
    let mut ical = String::with_capacity(4096);
    ical.push_str("BEGIN:VCALENDAR\r\n");
    ical.push_str("VERSION:2.0\r\n");
    ical.push_str("PRODID:-//FeuerwehrHub//Termine//DE\r\n");
    ical.push_str("CALSCALE:GREGORIAN\r\n");
    ical.push_str("METHOD:PUBLISH\r\n");
    ical.push_str("X-WR-CALNAME:FeuerwehrHub Termine\r\n");
    ical.push_str("X-WR-TIMEZONE:Europe/Berlin\r\n");

    for t in &termine {
        ical.push_str("BEGIN:VEVENT\r\n");
        ical.push_str(&format!("UID:{}-feuerwehrhub\r\n", t.id));
        ical.push_str(&format!("DTSTAMP:{}\r\n", ical_datetime(&t.updated_at)));
        ical.push_str(&format!("DTSTART:{}\r\n", ical_datetime(&t.start_at)));

        if let Some(ref end) = t.end_at {
            ical.push_str(&format!("DTEND:{}\r\n", ical_datetime(end)));
        } else {
            // Kein Ende → 2 Stunden Standard
            let end = t.start_at + chrono::Duration::hours(2);
            ical.push_str(&format!("DTEND:{}\r\n", ical_datetime(&end)));
        }

        ical.push_str(&format!("SUMMARY:{}\r\n", ical_escape(&t.title)));

        if let Some(ref loc) = t.location {
            if !loc.is_empty() {
                ical.push_str(&format!("LOCATION:{}\r\n", ical_escape(loc)));
            }
        }

        let mut desc_parts = Vec::new();
        if let Some(ref typ) = t.typ_name {
            desc_parts.push(format!("Typ: {}", typ));
        }
        if let Some(ref d) = t.description {
            if !d.is_empty() {
                desc_parts.push(d.clone());
            }
        }
        if !desc_parts.is_empty() {
            ical.push_str(&format!("DESCRIPTION:{}\r\n", ical_escape(&desc_parts.join("\\n"))));
        }

        ical.push_str(&format!("CREATED:{}\r\n", ical_datetime(&t.created_at)));
        ical.push_str(&format!("LAST-MODIFIED:{}\r\n", ical_datetime(&t.updated_at)));
        ical.push_str("END:VEVENT\r\n");
    }

    ical.push_str("END:VCALENDAR\r\n");

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, "text/calendar; charset=utf-8")
        .header(header::CONTENT_DISPOSITION, "attachment; filename=\"feuerwehrhub.ics\"")
        .header(header::CACHE_CONTROL, "no-cache, no-store, must-revalidate")
        .body(ical.into())
        .unwrap())
}

/// DateTime → iCal-Format (UTC): 20260404T120000Z
fn ical_datetime(dt: &DateTime<Utc>) -> String {
    dt.format("%Y%m%dT%H%M%SZ").to_string()
}

/// Text für iCal escapen (Komma, Semikolon, Backslash, Newlines)
fn ical_escape(s: &str) -> String {
    s.replace('\\', "\\\\")
     .replace(';', "\\;")
     .replace(',', "\\,")
     .replace('\n', "\\n")
     .replace('\r', "")
}

// ── Router ───────────────────────────────────────────────────────────────────

/// Authentifizierte Routen unter /api/me für Token-Verwaltung
pub fn me_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/ical-token", get(get_ical_token).post(generate_ical_token).delete(revoke_ical_token))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}

/// Öffentliche Route (kein Auth!) — Kalender-Apps pollen diese URL
pub fn public_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/calendar/:token.ics", get(ical_feed))
}
