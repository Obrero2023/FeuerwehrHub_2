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

use crate::{
    auth::middleware::{require_module, require_auth, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ───────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct VehicleBooking {
    pub id:                    Uuid,
    pub vehicle_id:            Uuid,
    pub vehicle_name:          Option<String>,
    pub user_id:               Uuid,
    pub username:              Option<String>,
    pub booking_date:          NaiveDate,
    pub time_from:             NaiveTime,
    pub time_to:               NaiveTime,
    pub reason:                String,
    pub status:                String,
    pub created_at:            chrono::DateTime<Utc>,
    pub status_changed_by:     Option<Uuid>,
    pub status_changed_by_name: Option<String>,
    pub status_changed_at:     Option<chrono::DateTime<Utc>>,
}

#[derive(Deserialize, Validate)]
pub struct VehicleBookingBody {
    pub vehicle_id:      Uuid,
    pub booking_date:    NaiveDate,
    pub time_from:       NaiveTime,
    pub time_to:         NaiveTime,
    pub reason:          String,
}

#[derive(Deserialize)]
pub struct UpdateBookingBody {
    pub vehicle_id:      Option<Uuid>,
    pub booking_date:    Option<NaiveDate>,
    pub time_from:       Option<NaiveTime>,
    pub time_to:         Option<NaiveTime>,
    pub reason:          Option<String>,
    pub status:          Option<String>,
    pub force:           Option<bool>,
}

#[derive(Deserialize)]
pub struct BookingQuery {
    pub vehicle_id:      Option<Uuid>,
    pub date_from:       Option<NaiveDate>,
    pub date_to:         Option<NaiveDate>,
    pub status:          Option<String>,
}

// ── Helper ──────────────────────────────────────────────────────────────

async fn fetch_booking_by_id(db: &sqlx::PgPool, id: Uuid) -> AppResult<VehicleBooking> {
    sqlx::query_as::<_, VehicleBooking>(
        "SELECT b.id, b.vehicle_id, v.name as vehicle_name, b.user_id,
                COALESCE(u.display_name, u.username) as username, b.booking_date, b.time_from, b.time_to,
                b.reason, b.status, b.created_at,
                b.status_changed_by, COALESCE(sc.display_name, sc.username) as status_changed_by_name,
                b.status_changed_at
         FROM vehicle_bookings b
         JOIN vehicles v ON v.id = b.vehicle_id
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN users sc ON sc.id = b.status_changed_by
         WHERE b.id = $1"
    )
    .bind(id)
    .fetch_one(db)
    .await
    .map_err(|_| AppError::NotFound)
}

// ── Routes ───────────────────────────────────────────────────────────────

pub async fn list_bookings(
    State(state): State<AppState>,
    Query(query): Query<BookingQuery>,
) -> AppResult<Json<Vec<VehicleBooking>>> {
    let bookings = sqlx::query_as::<_, VehicleBooking>(
        "SELECT b.id, b.vehicle_id, v.name as vehicle_name, b.user_id,
                COALESCE(u.display_name, u.username) as username, b.booking_date, b.time_from, b.time_to,
                b.reason, b.status, b.created_at,
                b.status_changed_by, COALESCE(sc.display_name, sc.username) as status_changed_by_name,
                b.status_changed_at
         FROM vehicle_bookings b
         JOIN vehicles v ON v.id = b.vehicle_id
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN users sc ON sc.id = b.status_changed_by
         WHERE 1=1
           AND ($1::uuid IS NULL OR b.vehicle_id = $1)
           AND ($2::date IS NULL OR b.booking_date >= $2)
           AND ($3::date IS NULL OR b.booking_date <= $3)
           AND ($4::text IS NULL OR b.status = $4)
         ORDER BY b.booking_date ASC, b.time_from ASC, b.vehicle_id ASC"
    )
    .bind(query.vehicle_id)
    .bind(query.date_from)
    .bind(query.date_to)
    .bind(query.status)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(bookings))
}

pub async fn get_booking(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<VehicleBooking>> {
    let booking = fetch_booking_by_id(&state.db, id).await?;
    Ok(Json(booking))
}

pub async fn create_booking(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<VehicleBookingBody>,
) -> AppResult<Json<VehicleBooking>> {
    body.validate()?;

    if body.time_to <= body.time_from {
        return Err(AppError::BadRequest("Die Endzeit muss nach der Startzeit liegen".into()));
    }

    let vehicle_status: Option<String> = sqlx::query_scalar(
        "SELECT status FROM vehicles WHERE id = $1"
    )
    .bind(body.vehicle_id)
    .fetch_optional(&state.db)
    .await?
    .filter(|s| s == "aktiv");

    if vehicle_status.is_none() {
        return Err(AppError::BadRequest("Fahrzeug nicht gefunden oder nicht aktiv".into()));
    }

    let has_overlap: bool = sqlx::query_scalar(
        "SELECT EXISTS (
            SELECT 1 FROM vehicle_bookings b
            WHERE b.vehicle_id = $1
              AND b.booking_date = $2
              AND b.status = 'buchung'
              AND b.time_from < $3
              AND b.time_to > $4
        )"
    )
    .bind(body.vehicle_id)
    .bind(body.booking_date)
    .bind(body.time_to)
    .bind(body.time_from)
    .fetch_one(&state.db)
    .await?;

    if has_overlap {
        return Err(AppError::BadRequest("Dieses Fahrzeug ist zu diesem Zeitpunkt bereits gebucht".into()));
    }

    let booking = sqlx::query_as::<_, VehicleBooking>(
        "WITH inserted AS (
            INSERT INTO vehicle_bookings
                (vehicle_id, user_id, booking_date, time_from, time_to, reason)
            VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING id, vehicle_id, user_id, booking_date, time_from, time_to, reason, created_at
        )
        SELECT i.id, i.vehicle_id, v.name as vehicle_name, i.user_id,
               COALESCE(u.display_name, u.username) as username, i.booking_date, i.time_from, i.time_to,
               i.reason, 'buchung' as status, i.created_at,
               NULL::uuid as status_changed_by,
               NULL::text as status_changed_by_name,
               NULL::timestamptz as status_changed_at
        FROM inserted i
        JOIN vehicles v ON v.id = i.vehicle_id
        LEFT JOIN users u ON u.id = i.user_id
        "
    )
    .bind(body.vehicle_id)
    .bind(claims.sub)
    .bind(body.booking_date)
    .bind(body.time_from)
    .bind(body.time_to)
    .bind(&body.reason)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(booking))
}

pub async fn update_booking(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateBookingBody>,
) -> AppResult<Json<VehicleBooking>> {
    if let Some(ref status) = body.status {
        if status != "buchung" && status != "bestaetigt" && status != "abgesagt" {
            return Err(AppError::BadRequest("Ungültiger Status".into()));
        }
    }

    // Nur Fahrzeugbuchung-Verwalter oder Admins dürfen Buchungen bearbeiten
    let is_admin = claims.is_admin_or_above();
    let is_verwalten = if is_admin {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("fahrzeugbuchung.verwalten")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !is_admin && !is_verwalten {
        return Err(AppError::Forbidden);
    }

    // Wenn Status auf "bestaetigt" gesetzt wird, prüfen ob es in der gleichen
    // Zeitspanne schon eine bestätigte Buchung gibt (für den Bestätigungsdialog)
    if body.status.as_deref() == Some("bestaetigt") && body.force != Some(true) {
        // Aktuelle Buchungsdaten (falls sich was ändert) oder vorhandene Werte verwenden
        let cur = sqlx::query_as::<_, VehicleBooking>(
            "SELECT b.id, b.vehicle_id, b.booking_date, b.time_from, b.time_to
             FROM vehicle_bookings b WHERE b.id = $1"
        )
        .bind(id)
        .fetch_one(&state.db)
        .await?;

        let check_vehicle_id = body.vehicle_id.unwrap_or(cur.vehicle_id);
        let check_date       = body.booking_date.unwrap_or(cur.booking_date);
        let check_from       = body.time_from.unwrap_or(cur.time_from);
        let check_to         = body.time_to.unwrap_or(cur.time_to);

        let existing: Option<(Uuid, String)> = sqlx::query_as(
            "SELECT b.id, COALESCE(u.display_name, u.username) as name
             FROM vehicle_bookings b
             LEFT JOIN users u ON u.id = b.user_id
             WHERE b.vehicle_id = $1
               AND b.booking_date = $2
               AND b.status = 'bestaetigt'
               AND b.time_from < $3
               AND b.time_to > $4
               AND b.id <> $5"
        )
        .bind(check_vehicle_id)
        .bind(check_date)
        .bind(check_to)
        .bind(check_from)
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

        if let Some((existing_id, name)) = existing {
            return Err(AppError::Conflict(format!(
                "Es gibt bereits eine bestätigte Buchung (ID: {}, Bucher: {}) in diesem Zeitraum.",
                existing_id, name
            )));
        }
    }

    // Status-Änderung protokollieren
    let status_changed_by = body.status.as_ref().map(|s| claims.sub);
    let status_changed_at = chrono::Utc::now();

    sqlx::query(
        "UPDATE vehicle_bookings
         SET reason = COALESCE($1, reason),
             status = COALESCE($2, status),
             status_changed_by = COALESCE($3, status_changed_by),
             status_changed_at = COALESCE($4, status_changed_at),
             updated_at = NOW()
         WHERE id = $5"
    )
    .bind(&body.reason)
    .bind(&body.status)
    .bind(&status_changed_by)
    .bind(&status_changed_at)
    .bind(id)
    .execute(&state.db)
    .await?;

    fetch_booking_by_id(&state.db, id).await.map(Json)
}

pub async fn delete_booking(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let is_admin = claims.is_admin_or_above();

    // Prüfen ob der User "fahrzeugbuchung.verwalten" hat (oder Admin ist)
    let is_verwalten = is_admin || {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("fahrzeugbuchung.verwalten")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    let result = if is_verwalten {
        sqlx::query("DELETE FROM vehicle_bookings WHERE id = $1")
            .bind(id)
            .execute(&state.db)
            .await?
    } else {
        sqlx::query("DELETE FROM vehicle_bookings WHERE id = $1 AND user_id = $2")
            .bind(id)
            .bind(claims.sub)
            .execute(&state.db)
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Buchung gelöscht" })))
}

// ── Overlap-Check ──────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct OverlapCheckBody {
    pub vehicle_id:    Uuid,
    pub booking_date:  NaiveDate,
    pub time_from:     NaiveTime,
    pub time_to:       NaiveTime,
}

#[derive(Serialize)]
pub struct OverlapCheckResponse {
    pub has_overlap:     bool,
    pub existing_booking: Option<VehicleBooking>,
}

pub async fn check_overlap(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Json(body): Json<OverlapCheckBody>,
) -> AppResult<Json<OverlapCheckResponse>> {
    let existing = sqlx::query_as::<_, VehicleBooking>(
        "SELECT b.id, b.vehicle_id, v.name as vehicle_name, b.user_id,
                COALESCE(u.display_name, u.username) as username, b.booking_date, b.time_from, b.time_to,
                b.reason, b.status, b.created_at,
                b.status_changed_by, COALESCE(sc.display_name, sc.username) as status_changed_by_name,
                b.status_changed_at
         FROM vehicle_bookings b
         JOIN vehicles v ON v.id = b.vehicle_id
         LEFT JOIN users u ON u.id = b.user_id
         LEFT JOIN users sc ON sc.id = b.status_changed_by
         WHERE b.vehicle_id = $1
           AND b.booking_date = $2
           AND b.status = 'buchung'
           AND b.time_from < $3
           AND b.time_to > $4
         ORDER BY b.time_from ASC
         LIMIT 1"
    )
    .bind(body.vehicle_id)
    .bind(body.booking_date)
    .bind(body.time_to)
    .bind(body.time_from)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(OverlapCheckResponse {
        has_overlap: existing.is_some(),
        existing_booking: existing,
    }))
}

// ── Router ──────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_bookings).post(create_booking))
        .route("/:id", get(get_booking).put(update_booking).delete(delete_booking))
        .route("/check-overlap", post(check_overlap))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("fahrzeugbuchung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}