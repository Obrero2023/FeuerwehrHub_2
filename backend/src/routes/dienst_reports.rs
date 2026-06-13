use axum::{
    extract::{Path, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use validator::Validate;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    audit,
    auth::middleware::{require_auth, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct DienstReport {
    pub id:           Uuid,
    pub report_date:  NaiveDate,
    pub title:        String,
    pub category:     String,
    pub duration_min: Option<i32>,
    pub location:     Option<String>,
    pub notes:        Option<String>,
    pub leader_id:    Option<Uuid>,
    pub leader_name:  Option<String>,
    pub created_by:   Option<Uuid>,
    pub created_at:   DateTime<Utc>,
    pub updated_at:   DateTime<Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Participant {
    pub id:           Uuid,
    pub report_id:    Uuid,
    pub user_id:      Option<Uuid>,
    pub display_name: String,
    pub created_at:   DateTime<Utc>,
}

#[derive(Serialize)]
pub struct DienstReportDetail {
    #[serde(flatten)]
    pub report:       DienstReport,
    pub participants: Vec<Participant>,
}

#[derive(Deserialize, Validate)]
pub struct DienstReportBody {
    pub report_date:  NaiveDate,
    #[validate(length(min = 1, max = 200))]
    pub title:        String,
    #[validate(length(max = 50))]
    pub category:     Option<String>,
    pub duration_min: Option<i32>,
    #[validate(length(max = 200))]
    pub location:     Option<String>,
    #[validate(length(max = 5000))]
    pub notes:        Option<String>,
    pub leader_id:    Option<Uuid>,
    #[validate(length(max = 200))]
    pub leader_name:  Option<String>,
    pub participant_ids: Option<Vec<Uuid>>,
}

// ── Handlers ──────────────────────────────────────────────────────────────────

pub async fn list_reports(
    State(state): State<AppState>,
    _claims: Extension<Claims>,
) -> AppResult<Json<Vec<DienstReport>>> {
    let reports = sqlx::query_as::<_, DienstReport>(
        "SELECT id, report_date, title, category, duration_min, location, notes,
                leader_id, leader_name, created_by, created_at, updated_at
         FROM dienst_reports
         ORDER BY report_date DESC, created_at DESC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(reports))
}

pub async fn get_report(
    State(state): State<AppState>,
    _claims: Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<DienstReportDetail>> {
    let report = sqlx::query_as::<_, DienstReport>(
        "SELECT id, report_date, title, category, duration_min, location, notes,
                leader_id, leader_name, created_by, created_at, updated_at
         FROM dienst_reports WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    let participants = sqlx::query_as::<_, Participant>(
        "SELECT id, report_id, user_id, display_name, created_at
         FROM dienst_report_participants
         WHERE report_id = $1
         ORDER BY display_name ASC"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(DienstReportDetail { report, participants }))
}

pub async fn create_report(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<DienstReportBody>,
) -> AppResult<Json<DienstReportDetail>> {
    body.validate()?;
    let title = body.title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::BadRequest("Titel darf nicht leer sein".into()));
    }
    let category = body.category.as_deref().unwrap_or("uebung").to_string();

    let report = sqlx::query_as::<_, DienstReport>(
        "INSERT INTO dienst_reports
             (report_date, title, category, duration_min, location, notes, leader_id, leader_name, created_by)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING id, report_date, title, category, duration_min, location, notes,
                   leader_id, leader_name, created_by, created_at, updated_at"
    )
    .bind(body.report_date)
    .bind(&title)
    .bind(&category)
    .bind(body.duration_min)
    .bind(body.location.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.leader_id)
    .bind(body.leader_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    let participants = insert_participants(&state, report.id, body.participant_ids.as_deref()).await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "DIENST_REPORT_CREATE",
               Some("dienst_reports"), Some(report.id), None).await;

    Ok(Json(DienstReportDetail { report, participants }))
}

pub async fn update_report(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<DienstReportBody>,
) -> AppResult<Json<DienstReportDetail>> {
    body.validate()?;
    let title = body.title.trim().to_string();
    if title.is_empty() {
        return Err(AppError::BadRequest("Titel darf nicht leer sein".into()));
    }
    let category = body.category.as_deref().unwrap_or("uebung").to_string();

    let report = sqlx::query_as::<_, DienstReport>(
        "UPDATE dienst_reports
         SET report_date = $1, title = $2, category = $3, duration_min = $4,
             location = $5, notes = $6, leader_id = $7, leader_name = $8
         WHERE id = $9
         RETURNING id, report_date, title, category, duration_min, location, notes,
                   leader_id, leader_name, created_by, created_at, updated_at"
    )
    .bind(body.report_date)
    .bind(&title)
    .bind(&category)
    .bind(body.duration_min)
    .bind(body.location.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.notes.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(body.leader_id)
    .bind(body.leader_name.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Replace participants
    sqlx::query("DELETE FROM dienst_report_participants WHERE report_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    let participants = insert_participants(&state, id, body.participant_ids.as_deref()).await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "DIENST_REPORT_UPDATE",
               Some("dienst_reports"), Some(id), None).await;

    Ok(Json(DienstReportDetail { report, participants }))
}

pub async fn delete_report(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM dienst_reports WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    audit::log(&state.db, Some(claims.sub), &claims.username, "DIENST_REPORT_DELETE",
               Some("dienst_reports"), Some(id), None).await;

    Ok(Json(serde_json::json!({ "deleted": true })))
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async fn insert_participants(
    state: &AppState,
    report_id: Uuid,
    ids: Option<&[Uuid]>,
) -> AppResult<Vec<Participant>> {
    let Some(ids) = ids else {
        return Ok(Vec::new());
    };
    if ids.is_empty() {
        return Ok(Vec::new());
    }

    // Fetch display names for the given user IDs
    let users: Vec<(Uuid, String)> = sqlx::query_as(
        "SELECT id, COALESCE(display_name, username) FROM users WHERE id = ANY($1)"
    )
    .bind(ids)
    .fetch_all(&state.db)
    .await?;

    let mut participants = Vec::new();
    for (uid, name) in &users {
        let p = sqlx::query_as::<_, Participant>(
            "INSERT INTO dienst_report_participants (report_id, user_id, display_name)
             VALUES ($1, $2, $3)
             RETURNING id, report_id, user_id, display_name, created_at"
        )
        .bind(report_id)
        .bind(uid)
        .bind(name)
        .fetch_one(&state.db)
        .await?;
        participants.push(p);
    }

    Ok(participants)
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/",    get(list_reports).post(create_report))
        .route("/:id", get(get_report).put(update_report).delete(delete_report))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}
