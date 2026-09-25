use axum::{
    extract::{Path, Query, State},
    middleware,
    response::IntoResponse,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use chrono::{NaiveDate, Utc};
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
pub struct Course {
    pub id:                Uuid,
    pub title:             String,
    pub description:       Option<String>,
    pub location:          Option<String>,
    pub start_date:        Option<NaiveDate>,
    pub end_date:          Option<NaiveDate>,
    pub registration_deadline: Option<NaiveDate>,
    pub max_participants:  Option<i64>,
    pub prerequisites:     Vec<String>,
    pub status:            String,
    pub created_by:        Option<Uuid>,
    pub created_by_name:   Option<String>,
    pub created_at:        chrono::DateTime<Utc>,
    pub updated_at:        chrono::DateTime<Utc>,
    pub updated_by:        Option<Uuid>,
    pub updated_by_name:   Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct CourseDetail {
    pub id:                Uuid,
    pub title:             String,
    pub description:       Option<String>,
    pub location:          Option<String>,
    pub start_date:        Option<NaiveDate>,
    pub end_date:          Option<NaiveDate>,
    pub registration_deadline: Option<NaiveDate>,
    pub max_participants:  Option<i64>,
    pub prerequisites:     Vec<String>,
    pub status:            String,
    pub created_by:        Option<Uuid>,
    pub created_by_name:   Option<String>,
    pub created_at:        chrono::DateTime<Utc>,
    pub updated_at:        chrono::DateTime<Utc>,
    pub updated_by:        Option<Uuid>,
    pub updated_by_name:   Option<String>,
    pub active_assignments: i64,
}

#[derive(Deserialize, Validate)]
pub struct CourseBody {
    #[validate(length(min = 1, max = 300))]
    pub title:              String,
    pub description:        Option<String>,
    pub location:           Option<String>,
    pub start_date:         Option<NaiveDate>,
    pub end_date:           Option<NaiveDate>,
    pub registration_deadline: Option<NaiveDate>,
    pub max_participants:   Option<i64>,
    pub prerequisites:      Option<Vec<String>>,
    pub status:             Option<String>,
}

#[derive(Deserialize)]
pub struct CourseQuery {
    pub status: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct CourseRegistration {
    pub id:            Uuid,
    pub course_id:     Uuid,
    pub user_id:       Uuid,
    pub username:      Option<String>,
    pub display_name:  Option<String>,
    pub registered_at: chrono::DateTime<Utc>,
    pub status:        String,
    pub assigned_by:   Option<Uuid>,
    pub assigned_by_name: Option<String>,
    pub assigned_at:   Option<chrono::DateTime<Utc>>,
    pub notes:         Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct MyRegistration {
    pub id:            Uuid,
    pub course_id:     Uuid,
    pub title:         String,
    pub location:      Option<String>,
    pub start_date:    Option<NaiveDate>,
    pub end_date:      Option<NaiveDate>,
    pub status:        String,
    pub assigned_at:   Option<chrono::DateTime<Utc>>,
    pub registered_at: chrono::DateTime<Utc>,
}

#[derive(Deserialize)]
pub struct AssignSeatsBody {
    pub registration_ids: Vec<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateRegistrationBody {
    pub status: Option<String>,
    pub notes:  Option<String>,
}

// ── Helpers ────────────────────────────────────────────────────────────

async fn fetch_course_by_id(db: &sqlx::PgPool, id: Uuid) -> AppResult<Course> {
    sqlx::query_as::<_, Course>(
        "SELECT id, title, description, location, start_date, end_date,
                registration_deadline, max_participants, prerequisites, status,
                created_by, created_by_name, created_at, updated_at,
                updated_by, updated_by_name
         FROM courses WHERE id = $1"
    )
    .bind(id)
    .fetch_one(db)
    .await
    .map_err(|_| AppError::NotFound)
}

async fn fetch_course_detail(db: &sqlx::PgPool, id: Uuid) -> AppResult<CourseDetail> {
    let course = sqlx::query_as::<_, CourseDetail>(
        "SELECT c.*,
                COALESCE((SELECT COUNT(*) FROM course_registrations cr
                          WHERE cr.course_id = c.id AND cr.status = 'platzzugewiesen'), 0)
                 as active_assignments
         FROM courses c WHERE c.id = $1"
    )
    .bind(id)
    .fetch_optional(db)
    .await?
    .ok_or(AppError::NotFound)?;
    Ok(course)
}

// ── GET /api/lehrgangsverwaltung/courses ──────────────────────────────

pub async fn list_courses(
    State(state): State<AppState>,
    Query(query): Query<CourseQuery>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Course>>> {
    let is_admin = claims.is_admin_or_above();
    let has_module = is_admin || {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("lehrgangsverwaltung")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };
    if !has_module {
        return Err(AppError::Forbidden);
    }

    let status_filter = if is_admin {
        query.status
    } else {
        // Leser sehen nur veröffentlichte
        Some("veroeffentlicht".to_string())
    };

    let courses = sqlx::query_as::<_, Course>(
        "SELECT id, title, description, location, start_date, end_date,
                registration_deadline, max_participants, prerequisites, status,
                created_by, created_by_name, created_at, updated_at,
                updated_by, updated_by_name
         FROM courses
         WHERE 1=1
           AND ($1::text IS NULL OR status = $1)
         ORDER BY created_at DESC"
    )
    .bind(status_filter)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(courses))
}

// ── GET /api/lehrgangsverwaltung/courses/:id ───────────────────────────

pub async fn get_course(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<CourseDetail>> {
    let course = fetch_course_detail(&state.db, id).await?;

    // Nicht veröffentlichte nur für Berechtigte / Admins
    if course.status != "veroeffentlicht" {
        let is_admin = claims.is_admin_or_above();
        let has_module = is_admin || {
            sqlx::query_scalar::<_, bool>(
                "SELECT $1 = ANY(
                    SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                    FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                 )"
            )
            .bind("lehrgangsverwaltung")
            .bind(claims.sub)
            .fetch_one(&state.db)
            .await?
        };
        if !has_module {
            return Err(AppError::Forbidden);
        }
    }

    Ok(Json(course))
}

// ── POST /api/lehrgangsverwaltung/courses ─────────────────────────────

pub async fn create_course(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CourseBody>,
) -> AppResult<Json<Course>> {
    body.validate()?;
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    if body.title.trim().is_empty() {
        return Err(AppError::BadRequest("Titel darf nicht leer sein".into()));
    }

    let prerequisites = body.prerequisites.clone().unwrap_or_default();

    let row = sqlx::query_as::<_, Course>(
        "INSERT INTO courses
            (title, description, location, start_date, end_date,
             registration_deadline, max_participants, prerequisites,
             status, created_by, created_by_name)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
         RETURNING id, title, description, location, start_date, end_date,
                   registration_deadline, max_participants, prerequisites, status,
                   created_by, created_by_name, created_at, updated_at,
                   updated_by, updated_by_name"
    )
    .bind(body.title.trim())
    .bind(body.description.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()))
    .bind(body.location.as_deref().map(|s| s.trim()).filter(|s| !s.is_empty()))
    .bind(body.start_date)
    .bind(body.end_date)
    .bind(body.registration_deadline)
    .bind(body.max_participants)
    .bind(&prerequisites)
    .bind(body.status.clone().unwrap_or_else(|| "entwurf".to_string()))
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await?;

    crate::audit::log(&state.db, Some(claims.sub), &claims.username,
        "COURSE_CREATED", Some("course"), Some(row.id), None).await;

    Ok(Json(row))
}

// ── PUT /api/lehrgangsverwaltung/courses/:id ──────────────────────────

pub async fn update_course(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<CourseBody>,
) -> AppResult<Json<Course>> {
    body.validate()?;
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let existing = fetch_course_by_id(&state.db, id).await?;

    let prerequisites = body.prerequisites.clone().unwrap_or_else(|| existing.prerequisites.clone());

    let row = sqlx::query_as::<_, Course>(
        "UPDATE courses SET
            title = COALESCE($1, title),
            description = COALESCE($2, description),
            location = COALESCE($3, location),
            start_date = COALESCE($4, start_date),
            end_date = COALESCE($5, end_date),
            registration_deadline = COALESCE($6, registration_deadline),
            max_participants = COALESCE($7, max_participants),
            prerequisites = COALESCE($8, prerequisites),
            status = COALESCE($9, status),
            updated_by = COALESCE($10, updated_by),
            updated_by_name = COALESCE($11, updated_by_name)
         WHERE id = $12
         RETURNING id, title, description, location, start_date, end_date,
                   registration_deadline, max_participants, prerequisites, status,
                   created_by, created_by_name, created_at, updated_at,
                   updated_by, updated_by_name"
    )
    .bind(body.title.trim().to_string())
    .bind(body.description.as_deref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
    .bind(body.location.as_deref().map(|s| s.trim().to_string()).filter(|s| !s.is_empty()))
    .bind(body.start_date)
    .bind(body.end_date)
    .bind(body.registration_deadline)
    .bind(body.max_participants)
    .bind(Some(&prerequisites))
    .bind(body.status)
    .bind(Some(claims.sub))
    .bind(Some(&claims.username))
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    crate::audit::log(&state.db, Some(claims.sub), &claims.username,
        "COURSE_UPDATED", Some("course"), Some(id), None).await;

    Ok(Json(row))
}

// ── DELETE /api/lehrgangsverwaltung/courses/:id ───────────────────────

pub async fn delete_course(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    // Prüfen ob der Kurs existiert
    fetch_course_by_id(&state.db, id).await?;

    sqlx::query("DELETE FROM courses WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    crate::audit::log(&state.db, Some(claims.sub), &claims.username,
        "COURSE_DELETED", Some("course"), Some(id), None).await;

    Ok(Json(serde_json::json!({ "message": "Lehrgang gelöscht" })))
}

// ── POST /api/lehrgangsverwaltung/courses/:id/register ─────────────────

pub async fn register_course(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<CourseRegistration>> {
    let course = fetch_course_detail(&state.db, id).await?;

    // Nur veröffentlichte Lehrgänge
    if course.status != "veroeffentlicht" {
        return Err(AppError::BadRequest("Lehrgang ist nicht veröffentlicht".into()));
    }

    // Anmeldefrist prüfen
    if let Some(deadline) = course.registration_deadline {
        if Utc::now().date_naive() > deadline {
            return Err(AppError::BadRequest("Anmeldeschluss ist abgelaufen".into()));
        }
    }

    // Bereits registriert?
    let existing: Option<String> = sqlx::query_scalar(
        "SELECT status FROM course_registrations
         WHERE course_id = $1 AND user_id = $2"
    )
    .bind(id)
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?;

    if let Some(status) = existing {
        if status != "storniert" {
            return Err(AppError::Conflict("Bereits für diesen Lehrgang registriert".into()));
        }
        // Stornierte Registrierung wieder aktivieren
        let row = sqlx::query_as::<_, CourseRegistration>(
            "UPDATE course_registrations
             SET status = 'angemeldet', assigned_by = NULL, assigned_at = NULL, notes = NULL
             WHERE course_id = $1 AND user_id = $2
             RETURNING id, course_id, user_id, registered_at, status, assigned_by, assigned_at, notes"
        )
        .bind(id)
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;
        return Ok(Json(row));
    }

    // Prüfen ob bereits ein aktiver Platz existiert (sollte durch UNIQUE verhindert sein)
    // Einfach inserten
    let row = sqlx::query_as::<_, CourseRegistration>(
        "INSERT INTO course_registrations (course_id, user_id)
         VALUES ($1, $2)
         RETURNING id, course_id, user_id, registered_at, status, assigned_by, assigned_at, notes"
    )
    .bind(id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

// ── DELETE /api/lehrgangsverwaltung/courses/:id/register ───────────────

pub async fn cancel_registration(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let course = fetch_course_by_id(&state.db, id).await?;
    if course.status != "veroeffentlicht" {
        return Err(AppError::BadRequest("Lehrgang ist nicht veröffentlicht".into()));
    }

    let result = sqlx::query(
        "UPDATE course_registrations
         SET status = 'storniert'
         WHERE course_id = $1 AND user_id = $2 AND status != 'storniert'"
    )
    .bind(id)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Registrierung storniert" })))
}

// ── GET /api/lehrgangsverwaltung/courses/:id/registrations ──────────────

pub async fn list_course_registrations(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<CourseRegistration>>> {
    // Prüfen ob User Admin des Moduls
    if !claims.is_admin_or_above() {
        let has_module = {
            sqlx::query_scalar::<_, bool>(
                "SELECT $1 = ANY(
                    SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                    FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                 )"
            )
            .bind("lehrgangsverwaltung.verwalten")
            .bind(claims.sub)
            .fetch_one(&state.db)
            .await?
        };
        if !has_module {
            return Err(AppError::Forbidden);
        }
    }

    // Prüfen ob der Kurs existiert
    fetch_course_by_id(&state.db, id).await?;

    let regs = sqlx::query_as::<_, CourseRegistration>(
        "SELECT cr.id, cr.course_id, cr.user_id,
                COALESCE(u.display_name, u.username) as username,
                cr.registered_at, cr.status,
                cr.assigned_by, COALESCE(a.display_name, a.username) as assigned_by_name,
                cr.assigned_at, cr.notes
         FROM course_registrations cr
         JOIN users u ON u.id = cr.user_id
         LEFT JOIN users a ON a.id = cr.assigned_by
         WHERE cr.course_id = $1
         ORDER BY cr.registered_at ASC"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(regs))
}

// ── PUT /api/lehrgangsverwaltung/registrations/:id ──────────────────────

pub async fn update_registration(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateRegistrationBody>,
) -> AppResult<Json<CourseRegistration>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    if let Some(ref status) = body.status {
        if !["angemeldet","platzzugewiesen","warteliste","abgelehnt","storniert"].contains(&status.as_str()) {
            return Err(AppError::BadRequest("Ungültiger Status".into()));
        }
    }

    let row = sqlx::query_as::<_, CourseRegistration>(
        "UPDATE course_registrations
         SET status = COALESCE($1, status),
             notes = COALESCE($2, notes),
             assigned_by = CASE WHEN $1 = 'platzzugewiesen' THEN $3 ELSE assigned_by END,
             assigned_at = CASE WHEN $1 = 'platzzugewiesen' THEN NOW() ELSE assigned_at END
         WHERE id = $4
         RETURNING id, course_id, user_id, registered_at, status, assigned_by, assigned_at, notes"
    )
    .bind(&body.status)
    .bind(&body.notes)
    .bind(Some(claims.sub))
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

// ── POST /api/lehrgangsverwaltung/courses/:id/assign-seats ─────────────

pub async fn assign_seats(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<AssignSeatsBody>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let course = fetch_course_detail(&state.db, id).await?;
    let max = course.max_participants.unwrap_or(0);

    // Anzahl aktiver Platzzusagen (inklusive der neuen) darf max nicht überschreiten
    let current_active: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM course_registrations
         WHERE course_id = $1 AND status = 'platzzugewiesen'"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Wie viele der angefragten Registrierungen sind noch nicht platzzugewiesen?
    let requested_new: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM course_registrations
         WHERE id = ANY($1) AND status != 'platzzugewiesen'"
    )
    .bind(&body.registration_ids)
    .fetch_one(&state.db)
    .await?;

    if current_active + requested_new > max {
        return Err(AppError::BadRequest(format!(
            "Nur {} Plätze verfügbar ({} bereits zugewiesen, {} neue Anfragen)",
            max, current_active, requested_new
        )));
    }

    // Alle angefragten IDs auf platzzugewiesen setzen
    sqlx::query(
        "UPDATE course_registrations
         SET status = 'platzzugewiesen',
             assigned_by = $1,
             assigned_at = NOW()
         WHERE id = ANY($2) AND course_id = $3"
    )
    .bind(claims.sub)
    .bind(&body.registration_ids)
    .bind(id)
    .execute(&state.db)
    .await?;

    crate::audit::log(&state.db, Some(claims.sub), &claims.username,
        "SEATS_ASSIGNED", Some("course"), Some(id),
        Some(&format!("{} Plätze zugewiesen", requested_new))).await;

    Ok(Json(serde_json::json!({
        "message": format!("{} Platz(e) zugewiesen", requested_new),
        "assigned": requested_new,
        "max_participants": max,
        "current_active": current_active + requested_new,
    })))
}

// ── GET /api/lehrgangsverwaltung/meine-anmeldungen ────────────────────

pub async fn list_my_registrations(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<MyRegistration>>> {
    let regs = sqlx::query_as::<_, MyRegistration>(
        "SELECT cr.id, cr.course_id, c.title, c.location,
                c.start_date, c.end_date, cr.status, cr.assigned_at, cr.registered_at
         FROM course_registrations cr
         JOIN courses c ON c.id = cr.course_id
         WHERE cr.user_id = $1
         ORDER BY cr.registered_at DESC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(regs))
}

// ── POST /api/lehrgangsverwaltung/courses/:id/email-template ───────────

pub async fn create_email_template(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<impl IntoResponse> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let course = fetch_course_detail(&state.db, id).await?;

    // Teilnehmer mit platzzugewiesen laden
    let participants = sqlx::query_as::<_, (String, String)>(
        "SELECT COALESCE(u.display_name, u.username) as name,
                u.username
         FROM course_registrations cr
         JOIN users u ON u.id = cr.user_id
         WHERE cr.course_id = $1 AND cr.status = 'platzzugewiesen'"
    )
    .bind(id)
    .fetch_all(&state.db)
    .await?;

    let start_str = course.start_date.map(|d| d.to_string()).unwrap_or_default();
    let end_str   = course.end_date.map(|d| d.to_string()).unwrap_or_default();
    let location  = course.location.clone().unwrap_or_default();

    // .eml generieren (RFC 822) — Empfänger als BCC
    let bcc_list = participants.iter()
        .map(|(name, username)| format!("\"{}\" <{}>", name_escape(name), username))
        .collect::<Vec<_>>()
        .join(", ");

    let subject = format!("Lehrgang: {} — Platzbestätigung", course.title);

    let body_text = format!(
        "Sehr geehrte Teilnehmer,\n\
        \n\
        Sie haben einen Platz im Lehrgang \"{}\" erhalten.\n\
        \n\
        Details:\n\
        Zeitraum: {} – {}\n\
        Ort: {}\n\
        \n\
        Wir freuen uns auf Ihre Teilnahme.\n\
        \n\
        Mit freundlichen Grüßen\n\
        {}",
        course.title, start_str, end_str, location,
        course.created_by_name.unwrap_or_else(|| "FeuerwehrHub".to_string())
    );

    let eml = format!(
        "MIME-Version: 1.0\r\n\
        Content-Type: text/plain; charset=\"utf-8\"\r\n\
        Content-Transfer-Encoding: 8bit\r\n\
        To: undisclosed-recipients:;\r\n\
        BCC: {}\r\n\
        Subject: {}\r\n\
        Date: {}\r\n\
        \n\
        {}",
        bcc_list, subject,
        Utc::now().format("%a, %d %b %Y %H:%M:%S +0000"),
        body_text
    );

    crate::audit::log(&state.db, Some(claims.sub), &claims.username,
        "EMAIL_TEMPLATE_CREATED", Some("course"), Some(id), None).await;

    // als .eml File zurückgeben
    let filename = format!("lehrgang_{}_teilnehmer.eml", id);
    Ok((
        [
            (axum::http::header::CONTENT_TYPE, "message/rfc822".to_string()),
            (axum::http::header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", filename)),
        ],
        eml,
    ))
}

fn name_escape(s: &str) -> String {
    s.replace('"', "\\\"")
}

// ── Router ────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        // Kurse
        .route("/courses", get(list_courses).post(create_course))
        .route("/courses/:id", get(get_course).put(update_course).delete(delete_course))
        // Registrierungen
        .route("/courses/:id/register", post(register_course).delete(cancel_registration))
        .route("/courses/:id/registrations", get(list_course_registrations))
        .route("/courses/:id/assign-seats", post(assign_seats))
        .route("/courses/:id/email-template", get(create_email_template))
        .route("/meine-anmeldungen", get(list_my_registrations))
        // Middleware
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("lehrgangsverwaltung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}