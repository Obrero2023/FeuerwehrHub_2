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

type BoxEncode = Box<dyn sqlx::Encode<'_, sqlx::Postgres> + sqlx::Type<sqlx::Postgres>>;

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
    let mut v1: Option<BoxEncode> = None;
    let mut v2: Option<BoxEncode> = None;
    let mut v3: Option<BoxEncode> = None;
    let mut v4: Option<BoxEncode> = None;

    if let Some(vid) = query.vehicle_id {
        sql.push_str(" AND b.vehicle_id = $1");
        v1 = Some(Box::new(vid));
    }
    if let Some(date_from) = query.date_from {
        let idx = v1.is_some() as usize + 1;
        sql.push_str(&format!(" AND b.booking_date >= ${}", idx));
        v2 = Some(Box::new(date_from));
    }
    if let Some(date_to) = query.date_to {
        let idx = v1.is_some() as usize + v2.is_some() as usize + 1;
        sql.push_str(&format!(" AND b.booking_date <= ${}", idx));
        v3 = Some(Box::new(date_to));
    }
    if let Some(status) = query.status {
        let idx = v1.is_some() as usize + v2.is_some() as usize + v3.is_some() as usize + 1;
        sql.push_str(&format!(" AND b.status = ${}", idx));
        v4 = Some(Box::new(status));
    }

    let query_builder = match (v1, v2, v3, v4) {
        (Some(a), Some(b), Some(c), Some(d)) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(a);
            let q = q.bind(b);
            let q = q.bind(c);
            q.bind(d)
        }
        (Some(a), Some(b), Some(c), None) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(a);
            let q = q.bind(b);
            q.bind(c)
        }
        (Some(a), Some(b), None, Some(d)) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(a);
            let q = q.bind(b);
            q.bind(d)
        }
        (Some(a), None, Some(c), Some(d)) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(a);
            let q = q.bind(c);
            q.bind(d)
        }
        (None, Some(b), Some(c), Some(d)) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(b);
            let q = q.bind(c);
            q.bind(d)
        }
        (Some(a), Some(b), None, None) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(a);
            q.bind(b)
        }
        (Some(a), None, Some(c), None) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(a);
            q.bind(c)
        }
        (Some(a), None, None, Some(d)) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(a);
            q.bind(d)
        }
        (None, Some(b), Some(c), None) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(b);
            q.bind(c)
        }
        (None, Some(b), None, Some(d)) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(b);
            q.bind(d)
        }
        (None, None, Some(c), Some(d)) => {
            let q = sqlx::query_as::<_, VehicleBooking>(&sql);
            let q = q.bind(c);
            q.bind(d)
        }
        (Some(a), None, None, None) => sqlx::query_as::<_, VehicleBooking>(&sql).bind(a),
        (None, Some(b), None, None) => sqlx::query_as::<_, VehicleBooking>(&sql).bind(b),
        (None, None, Some(c), None) => sqlx::query_as::<_, VehicleBooking>(&sql).bind(c),
        (None, None, None, Some(d)) => sqlx::query_as::<_, VehicleBooking>(&sql).bind(d),
        (None, None, None, None) => sqlx::query_as::<_, VehicleBooking>(&sql),
    };

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
    let mut parts = Vec::new();

    if body.reason.is_some() {
        parts.push(format!("reason = ${}", parts.len() + 1));
    }
    if body.status.is_some() {
        if body.status.as_ref().unwrap() != "buchung" && body.status.as_ref().unwrap() != "bestaetigt" && body.status.as_ref().unwrap() != "abgesagt" {
            return Err(AppError::BadRequest("Ungültiger Status".into()));
        }
        parts.push(format!("status = ${}", parts.len() + 1));
    }

    if parts.is_empty() {
        return Err(AppError::BadRequest("Keine zu aktualisierenden Felder angegeben".into()));
    }

    let id_idx = parts.len() + 1;
    parts.push("updated_at = NOW()".to_string());

    let sql = format!("UPDATE vehicle_bookings SET {} WHERE id = ${}", parts.join(", "), id_idx);
    let mut query = sqlx::query(&sql);

    if let Some(ref r) = body.reason {
        query = query.bind(r);
    }
    if let Some(ref s) = body.status {
        query = query.bind(s);
    }
    query = query.bind(id);

    query.execute(&state.db).await?;

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