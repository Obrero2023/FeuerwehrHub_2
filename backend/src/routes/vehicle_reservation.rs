use axum::{
    extract::{Path, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use validator::Validate;
use chrono::{DateTime, Datelike, Utc, NaiveDate, NaiveTime};

use crate::{
    auth::middleware::{require_auth, require_module, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct VehicleReservation {
    pub id:              Uuid,
    pub vehicle_id:      Uuid,
    pub vehicle_name:    String,
    pub user_id:         Option<Uuid>,
    pub user_name:       Option<String>,
    pub reason:          String,
    pub start_date:      NaiveDate,
    pub end_date:        NaiveDate,
    pub start_time:      NaiveTime,
    pub end_time:        NaiveTime,
    pub status:          String,
    pub created_by:      Uuid,
    pub created_by_name: Option<String>,
    pub created_at:      DateTime<Utc>,
    pub updated_at:      DateTime<Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateReservationBody {
    #[validate(length(min = 1, max = 200))]
    pub vehicle_id:      String,
    #[validate(length(min = 1, max = 500))]
    pub reason:          String,
    pub start_date:      NaiveDate,
    pub end_date:        NaiveDate,
    pub start_time:      Option<String>,
    pub end_time:        Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateReservationBody {
    pub reason:          Option<String>,
    pub start_date:      Option<NaiveDate>,
    pub end_date:        Option<NaiveDate>,
    pub start_time:      Option<String>,
    pub end_time:        Option<String>,
    pub status:          Option<String>,
}

#[derive(Serialize)]
pub struct ReservationStats {
    pub total_active:    i64,
    pub today:           i64,
    pub this_week:       i64,
    pub this_month:      i64,
}

// ── Reservierungen ────────────────────────────────────────────

pub async fn list_reservations(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<VehicleReservation>>> {
    let is_admin = claims.is_admin_or_above();
    let has_edit_perm = is_admin || has_edit_permission(&state.db, &claims.sub).await;

    if is_admin || has_edit_perm {
        let rows = sqlx::query_as::<_, VehicleReservation>(
            "SELECT r.id, r.vehicle_id, v.name as vehicle_name, r.user_id,
                    COALESCE(u.display_name, u.username) as user_name,
                    r.reason, r.start_date, r.end_date, r.start_time, r.end_time,
                    r.status, r.created_by,
                    COALESCE(creator.display_name, creator.username) as created_by_name,
                    r.created_at, r.updated_at
             FROM vehicle_reservations r
             JOIN vehicles v ON v.id = r.vehicle_id
             LEFT JOIN users u ON u.id = r.user_id
             LEFT JOIN users creator ON creator.id = r.created_by
             ORDER BY r.start_date DESC, r.start_time DESC"
        )
        .fetch_all(&state.db)
        .await?;
        Ok(Json(rows))
    } else {
        let rows = sqlx::query_as::<_, VehicleReservation>(
            "SELECT r.id, r.vehicle_id, v.name as vehicle_name, r.user_id,
                    COALESCE(u.display_name, u.username) as user_name,
                    r.reason, r.start_date, r.end_date, r.start_time, r.end_time,
                    r.status, r.created_by,
                    COALESCE(creator.display_name, creator.username) as created_by_name,
                    r.created_at, r.updated_at
             FROM vehicle_reservations r
             JOIN vehicles v ON v.id = r.vehicle_id
             LEFT JOIN users u ON u.id = r.user_id
             LEFT JOIN users creator ON creator.id = r.created_by
             WHERE r.user_id = $1 OR r.created_by = $1
             ORDER BY r.start_date DESC, r.start_time DESC"
        )
        .bind(claims.sub)
        .fetch_all(&state.db)
        .await?;
        Ok(Json(rows))
    }
}

pub async fn create_reservation(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateReservationBody>,
) -> AppResult<Json<VehicleReservation>> {
    body.validate()?;

    // Fahrzeug existiert prüfen
    let vehicle: Option<String> = sqlx::query_scalar(
        "SELECT name FROM vehicles WHERE id = $1"
    )
    .bind(&body.vehicle_id)
    .fetch_optional(&state.db)
    .await?;

    if vehicle.is_none() {
        return Err(AppError::BadRequest("Fahrzeug nicht gefunden".into()));
    }

    // Zeit aus String parsen (Format HH:MM → NaiveTime)
    fn parse_time(s: &str) -> NaiveTime {
        NaiveTime::parse_from_str(s, "%H:%M").unwrap_or_else(|_| NaiveTime::from_hms_opt(8, 0, 0).unwrap())
    }

    let start_t = parse_time(body.start_time.as_deref().unwrap_or("08:00"));
    let end_t   = parse_time(body.end_time.as_deref().unwrap_or("18:00"));

    // Zeitkonflikt prüfen
    let conflict: Option<(Uuid, String)> = sqlx::query_as::<_, (Uuid, String)>(
        "SELECT r.id, v.name FROM vehicle_reservations r
         JOIN vehicles v ON v.id = r.vehicle_id
         WHERE r.vehicle_id = $1
           AND r.status = 'gebucht'
           AND r.start_date <= $3 AND r.end_date >= $2
           AND NOT (r.end_time <= $4 OR r.start_time >= $5)
           AND r.id != $6"
    )
    .bind(&body.vehicle_id)
    .bind(&body.start_date)
    .bind(&body.end_date)
    .bind(start_t)
    .bind(end_t)
    .bind(Uuid::nil())
    .fetch_optional(&state.db)
    .await?;

    if let Some((_, vname)) = conflict {
        return Err(AppError::BadRequest(
            format!("Zeitkonflikt mit bestehender Reservierung für Fahrzeug '{}'", vname)
        ));
    }

    let id: Uuid = sqlx::query_scalar(
        "INSERT INTO vehicle_reservations (vehicle_id, user_id, reason, start_date, end_date, start_time, end_time, status, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id"
    )
    .bind(&body.vehicle_id)
    .bind(&claims.sub)
    .bind(body.reason.trim())
    .bind(&body.start_date)
    .bind(&body.end_date)
    .bind(start_t)
    .bind(end_t)
    .bind("gebucht")
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    get_reservation(State(state), Path(id)).await
}

pub async fn get_reservation(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<VehicleReservation>> {
    let row = sqlx::query_as::<_, VehicleReservation>(
        "SELECT r.id, r.vehicle_id, v.name as vehicle_name, r.user_id,
                COALESCE(u.display_name, u.username) as user_name,
                r.reason, r.start_date, r.end_date, r.start_time, r.end_time,
                r.status, r.created_by,
                COALESCE(creator.display_name, creator.username) as created_by_name,
                r.created_at, r.updated_at
         FROM vehicle_reservations r
         JOIN vehicles v ON v.id = r.vehicle_id
         LEFT JOIN users u ON u.id = r.user_id
         LEFT JOIN users creator ON creator.id = r.created_by
         WHERE r.id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

pub async fn update_reservation(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateReservationBody>,
) -> AppResult<Json<VehicleReservation>> {
    // Prüfen ob Bearbeitungsberechtigung besteht
    let reservation: Option<(Uuid, Uuid, String)> = sqlx::query_as::<_, (Uuid, Uuid, String)>(
        "SELECT vehicle_id, created_by, status FROM vehicle_reservations WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?;

    let (_, created_by, current_status) = match reservation {
        Some(r) => r,
        None => return Err(AppError::NotFound),
    };

    let is_admin = claims.is_admin_or_above();
    let is_owner = claims.sub == created_by;
    let has_edit_perm = is_admin || has_edit_permission(&state.db, &claims.sub).await;

    if !is_owner && !has_edit_perm && !is_admin {
        return Err(AppError::Forbidden);
    }

    // Nur Owner oder Edit-Berechtigte dürfen den Status ändern
    let new_status = match body.status.as_deref() {
        Some("gebucht") | Some("storniert") | Some("abgeschlossen") => {
            if !has_edit_perm && !is_admin && claims.sub != created_by {
                return Err(AppError::Forbidden);
            }
            body.status.clone().unwrap_or(current_status)
        }
        Some(invalid) => return Err(AppError::BadRequest(format!("Ungültiger Status: {}", invalid))),
        None => current_status,
    };

    let reason = body.reason.as_ref().map(|r| r.trim().to_string());

    // Zeit aus String parsen (Format HH:MM → NaiveTime)
    fn parse_time(s: &str) -> NaiveTime {
        NaiveTime::parse_from_str(s, "%H:%M").unwrap_or_else(|_| NaiveTime::from_hms_opt(8, 0, 0).unwrap())
    }

    let start_time_val = body.start_time.as_deref().map(parse_time).unwrap_or_else(|| NaiveTime::from_hms_opt(8, 0, 0).unwrap());
    let end_time_val   = body.end_time.as_deref().map(parse_time).unwrap_or_else(|| NaiveTime::from_hms_opt(18, 0, 0).unwrap());

    // Update mit COALESCE: nur übergebene Felder ändern, andere bleiben unverändert
    let result = sqlx::query(
        "UPDATE vehicle_reservations
         SET reason = COALESCE($1, reason),
             start_date = COALESCE($2, start_date),
             end_date = COALESCE($3, end_date),
             start_time = COALESCE($4, start_time),
             end_time = COALESCE($5, end_time),
             status = COALESCE($6, status),
             updated_at = NOW()
         WHERE id = $7"
    )
    .bind(reason)
    .bind(body.start_date)
    .bind(body.end_date)
    .bind(start_time_val)
    .bind(end_time_val)
    .bind(new_status)
    .bind(id)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    get_reservation(State(state), Path(id)).await
}

pub async fn delete_reservation(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let is_admin = claims.is_admin_or_above();
    let has_edit_perm = is_admin || has_edit_permission(&state.db, &claims.sub).await;

    if !is_admin && !has_edit_perm {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query("DELETE FROM vehicle_reservations WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Reservierung gelöscht" })))
}

pub async fn get_reservation_stats(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<ReservationStats>> {
    let today = chrono::Utc::now().date_naive();
    let this_week_start = today - chrono::Duration::days(7);
    let this_month_start = today.with_day(1).unwrap_or(today);

    let total: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vehicle_reservations WHERE status = 'gebucht'"
    )
    .fetch_one(&state.db)
    .await?;

    let today_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vehicle_reservations
         WHERE status = 'gebucht' AND start_date <= $1 AND end_date >= $1"
    )
    .bind(today)
    .fetch_one(&state.db)
    .await?;

    let week_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vehicle_reservations
         WHERE status = 'gebucht' AND end_date >= $1"
    )
    .bind(this_week_start)
    .fetch_one(&state.db)
    .await?;

    let month_count: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM vehicle_reservations
         WHERE status = 'gebucht' AND start_date <= $1 AND end_date >= $1"
    )
    .bind(this_month_start)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(ReservationStats {
        total_active: total,
        today: today_count,
        this_week: week_count,
        this_month: month_count,
    }))
}

// ── Hilfsfunktionen ────────────────────────────────────────────

async fn has_edit_permission(db: &sqlx::PgPool, user_id: &Uuid) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1 FROM (
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}')) AS perm
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION ALL
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            ) t
            WHERE t.perm = 'fahrzeugbuchung.edit'
         )"
    )
    .bind(user_id)
    .fetch_one(db)
    .await
    .unwrap_or(false)
}

// ── Router ────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/",                    get(list_reservations).post(create_reservation))
        .route("/:id",                 get(get_reservation).put(update_reservation).delete(delete_reservation))
        .route("/stats",               get(get_reservation_stats))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("fahrzeugbuchung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}
