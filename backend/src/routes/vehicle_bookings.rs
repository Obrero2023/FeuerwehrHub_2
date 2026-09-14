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
    pub id:              Uuid,
    pub vehicle_id:      Uuid,
    pub vehicle_name:    Option<String>,
    pub user_id:         Uuid,
    pub username:        Option<String>,
    pub booking_date:    NaiveDate,
    pub time_from:       NaiveTime,
    pub time_to:         NaiveTime,
    pub reason:          String,
    pub status:          String,
    pub created_at:      chrono::DateTime<Utc>,
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
    pub reason:          Option<String>,
    pub status:          Option<String>,
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
                u.display_name as username, b.booking_date, b.time_from, b.time_to,
                b.reason, b.status, b.created_at
         FROM vehicle_bookings b
         JOIN vehicles v ON v.id = b.vehicle_id
         LEFT JOIN users u ON u.id = b.user_id
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
    let mut sql = String::from(
        "SELECT b.id, b.vehicle_id, v.name as vehicle_name, b.user_id,
                u.display_name as username, b.booking_date, b.time_from, b.time_to,
                b.reason, b.status, b.created_at
         FROM vehicle_bookings b
         JOIN vehicles v ON v.id = b.vehicle_id
         LEFT JOIN users u ON u.id = b.user_id
         WHERE 1=1"
    );
    let mut query_builder = sqlx::query_as::<_, VehicleBooking>(&sql);
    let mut param_idx: u32 = 1;

    if let Some(vehicle_id) = query.vehicle_id {
        sql.push_str(" AND b.vehicle_id = $1");
        query_builder = query_builder.bind(vehicle_id);
        param_idx = 2;
    }

    if let Some(date_from) = query.date_from {
        sql.push_str(&format!(" AND b.booking_date >= ${}", param_idx));
        query_builder = query_builder.bind(date_from);
        param_idx += 1;
    }

    if let Some(date_to) = query.date_to {
        sql.push_str(&format!(" AND b.booking_date <= ${}", param_idx));
        query_builder = query_builder.bind(date_to);
        param_idx += 1;
    }

    if let Some(status) = query.status {
        sql.push_str(&format!(" AND b.status = ${}", param_idx));
        query_builder = query_builder.bind(status);
    }

    let bookings = query_builder.fetch_all(&state.db).await?;

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
        "SELECT b.id, b.vehicle_id, v.name as vehicle_name, b.user_id,
                u.display_name as username, b.booking_date, b.time_from, b.time_to,
                b.reason, b.status, b.created_at
         FROM vehicle_bookings b
         JOIN vehicles v ON v.id = b.vehicle_id
         LEFT JOIN users u ON u.id = b.user_id
         WHERE b.id = (
             INSERT INTO vehicle_bookings
                 (vehicle_id, user_id, booking_date, time_from, time_to, reason)
             VALUES ($1, $2, $3, $4, $5, $6)
             RETURNING id
         )"
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
    Extension(_claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateBookingBody>,
) -> AppResult<Json<VehicleBooking>> {
    if body.reason.is_none() && body.status.is_none() {
        return Err(AppError::BadRequest("Keine zu aktualisierenden Felder angegeben".into()));
    }

    if let Some(ref status) = body.status {
        if status != "buchung" && status != "bestaetigt" && status != "abgesagt" {
            return Err(AppError::BadRequest("Ungültiger Status".into()));
        }
    }

    sqlx::query(
        "UPDATE vehicle_bookings
         SET reason = COALESCE($1, reason),
             status = COALESCE($2, status),
             updated_at = NOW()
         WHERE id = $3"
    )
    .bind(&body.reason)
    .bind(&body.status)
    .bind(id)
    .execute(&state.db)
    .await?;

    fetch_booking_by_id(&state.db, id).await.map(Json)
}

pub async fn delete_booking(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM vehicle_bookings WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Buchung gelöscht" })))
}

// ── Router ──────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_bookings).post(create_booking))
        .route("/:id", get(get_booking).put(update_booking).delete(delete_booking))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("fahrzeugbuchung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}