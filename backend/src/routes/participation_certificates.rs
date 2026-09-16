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
    pdf::PdfBuilder,
    AppState,
};

// ── Structs ───────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct ParticipationCertificate {
    pub id:                  Uuid,
    pub user_id:             Uuid,
    pub username:            Option<String>,
    pub start_date:          NaiveDate,
    pub end_date:            NaiveDate,
    pub alarm_time:          NaiveTime,
    pub end_time:            NaiveTime,
    pub unit_leader_id:      Option<Uuid>,
    pub unit_leader_name:    Option<String>,
    pub status:              String,
    pub created_at:          chrono::DateTime<Utc>,
    pub approved_at:         Option<chrono::DateTime<Utc>>,
    pub signed_at:           Option<chrono::DateTime<Utc>>,
    pub signed_by:           Option<Uuid>,
    pub signed_by_name:      Option<String>,
    pub template_path:       Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct CreateCertificateBody {
    pub start_date:    NaiveDate,
    pub end_date:      NaiveDate,
    pub alarm_time:    NaiveTime,
    pub end_time:      NaiveTime,
    pub unit_leader_id: Uuid,
}

#[derive(Deserialize)]
pub struct CertificateQuery {
    pub user_id:        Option<Uuid>,
    pub status:         Option<String>,
    pub unit_leader_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateStatusBody {
    pub status: String,
}

// ── Helper ──────────────────────────────────────────────────────

async fn fetch_certificate_by_id(
    db: &sqlx::PgPool,
    id: Uuid,
) -> AppResult<ParticipationCertificate> {
    sqlx::query_as::<_, ParticipationCertificate>(
        "SELECT pc.id, pc.user_id, COALESCE(u.display_name, u.username) as username,
                pc.start_date, pc.end_date, pc.alarm_time, pc.end_time,
                pc.unit_leader_id, COALESCE(ul.display_name, ul.username) as unit_leader_name,
                pc.status, pc.created_at, pc.approved_at, pc.signed_at,
                pc.signed_by,
                (SELECT display_name FROM users WHERE id = pc.signed_by) as signed_by_name,
                pc.template_path
         FROM participation_certificates pc
         JOIN users u ON u.id = pc.user_id
         LEFT JOIN users ul ON ul.id = pc.unit_leader_id
         WHERE pc.id = $1"
    )
    .bind(id)
    .fetch_one(db)
    .await
    .map_err(|_| AppError::NotFound)
}

// ── PDF generation ──────────────────────────────────────────────

async fn generate_certificate_pdf(
    db: &sqlx::PgPool,
    certificate: &ParticipationCertificate,
) -> AppResult<Vec<u8>> {
    let signature_data = certificate.signed_by
        .map(|signed_by| {
            sqlx::query_scalar::<_, Option<String>>(
                "SELECT signature FROM users WHERE id = $1"
            )
            .bind(signed_by)
            .fetch_one(db)
        })
        .transpose()
        .await?
        .flatten();

    let signature_bytes = signature_data
        .and_then(|data| {
            data.strip_prefix("data:")
                .and_then(|rest| rest.split_once(";base64,"))
                .and_then(|(_, encoded)| base64::decode(encoded).ok())
        });

    let ff_name: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'ff_name'"
    )
    .fetch_optional(db)
    .await?;

    let mut builder = PdfBuilder::new("Teilnahmebescheinigung Feuerwehreinsatz")
        .heading(ff_name.unwrap_or_else(|| "Feuerwehr".to_string()))
        .sub_heading("Teilnahmebescheinigung Feuerwehreinsatz")
        .text_block(
            "Hiermit wird bescheinigt, dass der/die unten genannte Einsatzkraft am beschriebenen Einsatz teilgenommen hat."
        )
        .spacer(4.0)
        .key_value("Teilnehmer/in", certificate.username.clone().unwrap_or_default())
        .key_value("Einsatzzeitraum", format!(
            "{} bis {}",
            certificate.start_date.format("%d.%m.%Y"),
            certificate.end_date.format("%d.%m.%Y")
        ))
        .key_value("Alarmzeit", certificate.alarm_time.format("%H:%M").to_string())
        .key_value("Einsatzende", certificate.end_time.format("%H:%M").to_string())
        .key_value(
            "Einheitsführer/in",
            certificate.unit_leader_name.clone().unwrap_or_else(|| "—".to_string()),
        )
        .spacer(6.0);

    if let Some(bytes) = signature_bytes {
        builder = builder.signature_image(bytes, 45.0, 20.0);
        builder = builder.key_value(
            "Unterschrift",
            certificate.signed_by_name.clone().unwrap_or_default(),
        );
    } else {
        builder = builder.key_value(
            "Unterschrift",
            certificate.signed_by_name.clone().unwrap_or_else(|| "—".to_string()),
        );
    }

    builder
        .spacer(4.0)
        .text_block(
            "Diese Bescheinigung wurde digital erstellt und ist ohne Unterschrift nicht gültig."
        )
        .build(&crate::pdf::load_font_bytes())
        .map_err(|e| AppError::Internal(e.into()))
}

// ── Routes ───────────────────────────────────────────────────────

pub async fn list_certificates(
    State(state): State<AppState>,
    Query(query): Query<CertificateQuery>,
) -> AppResult<Json<Vec<ParticipationCertificate>>> {
    let certificates = sqlx::query_as::<_, ParticipationCertificate>(
        "SELECT pc.id, pc.user_id, COALESCE(u.display_name, u.username) as username,
                pc.start_date, pc.end_date, pc.alarm_time, pc.end_time,
                pc.unit_leader_id, COALESCE(ul.display_name, ul.username) as unit_leader_name,
                pc.status, pc.created_at, pc.approved_at, pc.signed_at,
                pc.signed_by,
                (SELECT display_name FROM users WHERE id = pc.signed_by) as signed_by_name,
                pc.template_path
         FROM participation_certificates pc
         JOIN users u ON u.id = pc.user_id
         LEFT JOIN users ul ON ul.id = pc.unit_leader_id
         WHERE 1=1
           AND ($1::uuid IS NULL OR pc.user_id = $1)
           AND ($2::text IS NULL OR pc.status = $2)
           AND ($3::uuid IS NULL OR pc.unit_leader_id = $3)
         ORDER BY pc.created_at DESC"
    )
    .bind(query.user_id)
    .bind(query.status)
    .bind(query.unit_leader_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(certificates))
}

pub async fn get_certificate_by_id(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ParticipationCertificate>> {
    fetch_certificate_by_id(&state.db, id).await.map(Json)
}

pub async fn get_certificate_pdf(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<(
    axum::http::HeaderMap,
    Vec<u8>,
)> {
    let certificate = fetch_certificate_by_id(&state.db, id).await?;
    let pdf = generate_certificate_pdf(&state.db, &certificate).await?;

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        axum::http::HeaderValue::from_static(&format!(
            "attachment; filename=\"teilnahmebescheinigung-{}.pdf\"",
            id.hyphenated()
        )),
    );

    Ok((headers, pdf))
}

pub async fn create_certificate(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateCertificateBody>,
) -> AppResult<Json<ParticipationCertificate>> {
    if body.end_date < body.start_date {
        return Err(AppError::BadRequest("Enddatum muss nach Startdatum liegen".into()));
    }

    let leader_exists: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)"
    )
    .bind(body.unit_leader_id)
    .fetch_one(&state.db)
    .await?;

    if !leader_exists {
        return Err(AppError::BadRequest("Einheitsführer nicht gefunden".into()));
    }

    let certificate = sqlx::query_as::<_, ParticipationCertificate>(
        "WITH inserted AS (
            INSERT INTO participation_certificates
                (user_id, start_date, end_date, alarm_time, end_time, unit_leader_id, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
            RETURNING id, user_id, start_date, end_date, alarm_time, end_time,
                      unit_leader_id, status, created_at
        )
        SELECT i.id, i.user_id, u.username, i.start_date, i.end_date, i.alarm_time, i.end_time,
               i.unit_leader_id, i.status, i.created_at
        FROM inserted i
        JOIN users u ON u.id = i.user_id
        "
    )
    .bind(claims.sub)
    .bind(body.start_date)
    .bind(body.end_date)
    .bind(body.alarm_time)
    .bind(body.end_time)
    .bind(body.unit_leader_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(certificate))
}

pub async fn update_certificate_status(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateStatusBody>,
) -> AppResult<Json<ParticipationCertificate>> {
    let new_status = body.status;

    if new_status != "approved" && new_status != "rejected" && new_status != "signed" {
        return Err(AppError::BadRequest("Ungültiger Status".into()));
    }

    let is_admin = claims.is_admin_or_above();
    let is_schreiben = if is_admin {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("teilnahmebescheinigung.schreiben")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !is_admin && !is_schreiben {
        return Err(AppError::Forbidden);
    }

    sqlx::query(
        "UPDATE participation_certificates
         SET status = $1,
             approved_at = CASE WHEN $1 IN ('approved','signed') THEN NOW() ELSE approved_at END,
             signed_at = CASE WHEN $1 = 'signed' THEN NOW() ELSE signed_at END,
             signed_by = CASE WHEN $1 = 'signed' THEN $2 ELSE signed_by END
         WHERE id = $3"
    )
    .bind(&new_status)
    .bind(claims.sub)
    .bind(id)
    .execute(&state.db)
    .await?;

    fetch_certificate_by_id(&state.db, id).await.map(Json)
}

// ── Template upload (Admin only) ──────────────────────────────

#[derive(Deserialize)]
pub struct UploadTemplateBody {
    pub template_path: String,
}

pub async fn upload_template(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<UploadTemplateBody>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    // Store template path in settings
    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_template', $1)
         ON CONFLICT (key) DO UPDATE SET value = $1"
    )
    .bind(&body.template_path)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn get_template(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let template_path: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'teilnahmebescheinigung_template'"
    )
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "template_path": template_path.unwrap_or_default()
    })))
}

// ── Signature endpoints ───────────────────────────────────────

pub async fn upload_signature(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let has_schreiben = if claims.is_admin_or_above() {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("teilnahmebescheinigung.schreiben")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !has_schreiben {
        return Err(AppError::Forbidden);
    }

    let signature: String = body["signature"]
        .as_str()
        .ok_or(AppError::BadRequest("Signature erforderlich".into()))?
        .to_string();

    sqlx::query(
        "UPDATE users SET signature = $1 WHERE id = $2"
    )
    .bind(&signature)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn get_signature(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let signature: Option<String> = sqlx::query_scalar(
        "SELECT signature FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "signature": signature.unwrap_or_default()
    })))
}

// ── Router ──────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_certificates).post(create_certificate))
        .route("/:id", get(get_certificate_by_id))
        .route("/:id/pdf", get(get_certificate_pdf))
        .route("/:id/status", put(update_certificate_status))
        .route("/template", post(upload_template).get(get_template))
        .route("/signature", post(upload_signature).get(get_signature))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("teilnahmebescheinigung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}