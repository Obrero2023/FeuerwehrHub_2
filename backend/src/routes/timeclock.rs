use axum::{
    extract::{Query, State},
    middleware,
    routing::{get, post},
    Json, Router,
};
use validator::Validate;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use std::time::{Duration, Instant};
use uuid::Uuid;

use crate::{
    auth::{
        middleware::{require_auth, require_module},
        rate_limit::{punch_rate_limit, LoginRateLimiter},
    },
    errors::{AppError, AppResult},
    AppState,
};

const BADGE_FAIL_WINDOW: Duration = Duration::from_secs(300); // 5 Minuten
const BADGE_FAIL_MAX: u32 = 10;

// ── Structs ──────────────────────────────────────────────────────────────────

#[derive(Serialize, FromRow)]
pub struct TimeEntry {
    pub id:        Uuid,
    pub user_id:   Uuid,
    pub check_in:  DateTime<Utc>,
    pub check_out: Option<DateTime<Utc>>,
    pub typ:       String,
    pub notes:     Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct ClockResponse {
    pub action:       String, // "check_in" oder "check_out"
    pub display_name: String,
    pub time:         DateTime<Utc>,
    pub entry_id:     Uuid,
    pub termin_title: Option<String>,
}

#[derive(Serialize, FromRow)]
pub struct ClockStatus {
    pub user_id:      Uuid,
    pub display_name: Option<String>,
    pub username:     String,
    pub checked_in:   bool,
    pub check_in:     Option<DateTime<Utc>>,
    pub entry_id:     Option<Uuid>,
}

#[derive(Serialize, FromRow)]
pub struct TimeEntryWithName {
    pub id:           Uuid,
    pub user_id:      Uuid,
    pub display_name: Option<String>,
    pub username:     String,
    pub check_in:     DateTime<Utc>,
    pub check_out:    Option<DateTime<Utc>>,
    pub typ:          String,
    pub notes:        Option<String>,
    pub termin_id:    Option<Uuid>,
    pub termin_title: Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct PunchBody {
    #[validate(length(min = 1, max = 100))]
    pub badge_code: String,
    #[validate(length(max = 20))]
    pub typ:        Option<String>,
}

#[derive(Deserialize)]
pub struct HistoryQuery {
    pub from: Option<NaiveDate>,
    pub to:   Option<NaiveDate>,
}

#[derive(Serialize, FromRow)]
pub struct ActiveEntry {
    pub user_id:      Uuid,
    pub display_name: Option<String>,
    pub username:     String,
    pub check_in:     DateTime<Utc>,
    pub entry_id:     Uuid,
}

// ── Kiosk-Endpunkte (kein Login noetig) ─────────────────────────────────────

/// POST /api/clock/punch — Ein- oder Ausstempeln per Badge-Code
pub async fn punch(
    State(state): State<AppState>,
    Json(body): Json<PunchBody>,
) -> AppResult<Json<ClockResponse>> {
    body.validate()?;
    let code = body.badge_code.trim();
    if code.is_empty() {
        return Err(AppError::BadRequest("Badge-Code fehlt".into()));
    }

    // User per badge_code ODER per ID (UUID aus QR-Code) finden
    let user = if let Ok(uuid) = code.parse::<Uuid>() {
        sqlx::query_as::<_, (Uuid, Option<String>, String)>(
            "SELECT id, display_name, username FROM users WHERE id = $1 "
        )
        .bind(uuid)
        .fetch_optional(&state.db)
        .await?
    } else {
        sqlx::query_as::<_, (Uuid, Option<String>, String)>(
            "SELECT id, display_name, username FROM users WHERE badge_code = $1 "
        )
        .bind(code)
        .fetch_optional(&state.db)
        .await?
    };

    let (user_id, display_name, username) = match user {
        Some(u) => {
            // Erfolg → Fehlerzähler für diesen Code zurücksetzen
            state.punch_fail_counts.remove(code);
            u
        }
        None => {
            // Fehlschlag → per-Code Zähler erhöhen und ggf. sperren
            let now = Instant::now();
            let blocked = {
                let mut entry = state.punch_fail_counts
                    .entry(code.to_string())
                    .or_insert((0, now));
                if now.duration_since(entry.1) > BADGE_FAIL_WINDOW {
                    *entry = (1, now);
                } else {
                    entry.0 += 1;
                }
                entry.0 >= BADGE_FAIL_MAX
            };
            if blocked {
                tracing::warn!("Badge-Code Rate-Limit: Code '{}' nach {} Fehlversuchen gesperrt", code, BADGE_FAIL_MAX);
                return Err(AppError::TooManyRequests);
            }
            return Err(AppError::BadRequest("Unbekannter Badge-Code".into()));
        }
    };

    let name = display_name.clone().unwrap_or_else(|| username.clone());

    // Offenen Eintrag pruefen (eingecheckt, aber noch nicht ausgecheckt)
    let open_entry = sqlx::query_as::<_, (Uuid,)>(
        "SELECT id FROM time_entries WHERE user_id = $1 AND check_out IS NULL ORDER BY check_in DESC LIMIT 1"
    )
    .bind(user_id)
    .fetch_optional(&state.db)
    .await?;

    if let Some((entry_id,)) = open_entry {
        // Ausstempeln
        sqlx::query("UPDATE time_entries SET check_out = NOW() WHERE id = $1")
            .bind(entry_id)
            .execute(&state.db)
            .await?;

        Ok(Json(ClockResponse {
            action: "check_out".to_string(),
            display_name: name,
            time: Utc::now(),
            entry_id,
            termin_title: None,
        }))
    } else {
        // Aktiven Termin suchen (allgemein oder für diesen User)
        let active_termin = sqlx::query_as::<_, (Uuid, String)>(
            "SELECT t.id, t.title FROM termine t
             WHERE t.start_at <= NOW()
               AND (t.end_at IS NULL OR t.end_at >= NOW())
               AND (
                   NOT EXISTS (SELECT 1 FROM termin_assignments WHERE termin_id = t.id)
                   OR EXISTS (SELECT 1 FROM termin_assignments WHERE termin_id = t.id AND user_id = $1)
               )
             ORDER BY t.start_at DESC
             LIMIT 1"
        )
        .bind(user_id)
        .fetch_optional(&state.db)
        .await?;

        let (termin_id, termin_title) = match active_termin {
            Some((tid, title)) => (Some(tid), Some(title)),
            None => (None, None),
        };

        // Einstempeln
        let entry_id = sqlx::query_scalar::<_, Uuid>(
            "INSERT INTO time_entries (user_id, typ, termin_id) VALUES ($1, $2, $3) RETURNING id"
        )
        .bind(user_id)
        .bind(body.typ.as_deref().unwrap_or("wachdienst"))
        .bind(termin_id)
        .fetch_one(&state.db)
        .await?;

        Ok(Json(ClockResponse {
            action: "check_in".to_string(),
            display_name: name,
            time: Utc::now(),
            entry_id,
            termin_title,
        }))
    }
}

/// GET /api/clock/active — Wer ist gerade eingestempelt?
pub async fn active_entries(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<ActiveEntry>>> {
    let rows = sqlx::query_as::<_, ActiveEntry>(
        "SELECT t.user_id, u.display_name, u.username, t.check_in, t.id AS entry_id
         FROM time_entries t
         JOIN users u ON u.id = t.user_id
         WHERE t.check_out IS NULL
         ORDER BY t.check_in ASC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

// ── Authentifizierte Endpunkte (Personal-Modul) ─────────────────────────────

/// GET /api/timeclock/history — Zeiterfassungs-History
pub async fn history(
    State(state): State<AppState>,
    Query(q): Query<HistoryQuery>,
) -> AppResult<Json<Vec<TimeEntryWithName>>> {
    let from = q.from.unwrap_or_else(|| {
        (Utc::now() - chrono::Duration::days(30)).date_naive()
    });
    let to = q.to.unwrap_or_else(|| Utc::now().date_naive());

    let rows = sqlx::query_as::<_, TimeEntryWithName>(
        "SELECT t.id, t.user_id, u.display_name, u.username, t.check_in, t.check_out, t.typ, t.notes,
                t.termin_id, te.title AS termin_title
         FROM time_entries t
         JOIN users u ON u.id = t.user_id
         LEFT JOIN termine te ON te.id = t.termin_id
         WHERE t.check_in::date >= $1 AND t.check_in::date <= $2
         ORDER BY t.check_in DESC"
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

/// GET /api/timeclock/summary — Stunden pro Mitglied im Zeitraum
#[derive(Serialize, FromRow)]
pub struct MemberTimeSummary {
    pub user_id:      Uuid,
    pub display_name: Option<String>,
    pub username:     String,
    pub total_hours:  f64,
    pub entry_count:  i64,
}

pub async fn summary(
    State(state): State<AppState>,
    Query(q): Query<HistoryQuery>,
) -> AppResult<Json<Vec<MemberTimeSummary>>> {
    let from = q.from.unwrap_or_else(|| {
        (Utc::now() - chrono::Duration::days(30)).date_naive()
    });
    let to = q.to.unwrap_or_else(|| Utc::now().date_naive());

    let rows = sqlx::query_as::<_, MemberTimeSummary>(
        "SELECT t.user_id, u.display_name, u.username,
                COALESCE(SUM(EXTRACT(EPOCH FROM (COALESCE(t.check_out, NOW()) - t.check_in)) / 3600.0), 0)::FLOAT8 AS total_hours,
                COUNT(*) AS entry_count
         FROM time_entries t
         JOIN users u ON u.id = t.user_id
         WHERE t.check_in::date >= $1 AND t.check_in::date <= $2
         GROUP BY t.user_id, u.display_name, u.username
         ORDER BY total_hours DESC"
    )
    .bind(from)
    .bind(to)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

// ── Router ───────────────────────────────────────────────────────────────────

/// Kiosk-Router: kein Auth noetig (laeuft am Tablet an der Wache)
pub fn clock_router() -> Router<AppState> {
    let limiter = LoginRateLimiter::with_quota(30, 10);
    Router::new()
        .route("/punch", post(punch))
        .route("/active", get(active_entries))
        .route_layer(middleware::from_fn_with_state(limiter, punch_rate_limit))
}

/// Auswertungs-Router: Auth + Personal-Modul noetig
pub fn timeclock_router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/history", get(history))
        .route("/summary", get(summary))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("personal")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}
