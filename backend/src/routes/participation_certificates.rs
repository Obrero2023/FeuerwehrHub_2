use axum::{
    extract::{Multipart, Path, Query, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use chrono::{NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use std::path::Path;
use tokio::fs;
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

#[derive(Serialize, sqlx::FromRow)]
pub struct UnitLeaderEntry {
    pub id: Uuid,
    pub username: String,
    pub display_name: Option<String>,
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

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CertificatePermissionLevel {
    None,
    Read,
    Write,
    Admin,
}

async fn get_certificate_permission_level(state: &AppState, claims: &Claims) -> AppResult<CertificatePermissionLevel> {
    // Check for global admin/superuser
    if claims.is_admin_or_above() {
        return Ok(CertificatePermissionLevel::Admin);
    }

    // Query all module permissions at once (admin > write > read)
    let perms: Vec<String> = sqlx::query_scalar::<_, String>(
        "SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}')) AS perm
         FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1
         UNION
         SELECT unnest(fr.permissions)
         FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $1"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    if perms.iter().any(|p| p == "teilnahmebescheinigung.admin") {
        Ok(CertificatePermissionLevel::Admin)
    } else if perms.iter().any(|p| p == "teilnahmebescheinigung.schreiben") {
        Ok(CertificatePermissionLevel::Write)
    } else if perms.iter().any(|p| p == "teilnahmebescheinigung") {
        Ok(CertificatePermissionLevel::Read)
    } else {
        Ok(CertificatePermissionLevel::None)
    }
}

/// Checks whether the authenticated user may access a given certificate.
/// Admins (global or module-level) can access any certificate.
/// Regular users only have access to certificates they created (user_id = claims.sub)
/// or that were sent to them as Einheitsführer (unit_leader_id = claims.sub).
async fn fetch_certificate_by_id(
    state: &AppState,
    id: Uuid,
    claims: &Claims,
) -> AppResult<ParticipationCertificate> {
    let cert = sqlx::query_as::<_, ParticipationCertificate>(
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
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    let perm_level = get_certificate_permission_level(state, claims).await?;
    let user_id = claims.sub;

    match perm_level {
        CertificatePermissionLevel::Admin => {}
        CertificatePermissionLevel::Write => {
            if cert.user_id != user_id && cert.unit_leader_id != Some(user_id) {
                return Err(AppError::Forbidden);
            }
        }
        CertificatePermissionLevel::Read => {
            if cert.user_id != user_id {
                return Err(AppError::Forbidden);
            }
        }
        CertificatePermissionLevel::None => return Err(AppError::Forbidden),
    }

    Ok(cert)
}

// ── PDF generation ──────────────────────────────────────────────

async fn generate_certificate_pdf(
    db: &sqlx::PgPool,
    certificate: &ParticipationCertificate,
) -> AppResult<Vec<u8>> {
    // Get ff_name
    let ff_name: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'ff_name'"
    )
    .fetch_optional(db)
    .await?;

    PdfBuilder::new("Teilnahmebescheinigung Feuerwehreinsatz")
        .heading(ff_name.unwrap_or_else(|| "Feuerwehr".to_string()))
        .sub_heading("Teilnahmebescheinigung Feuerwehreinsatz")
        .text_block(
            "Hiermit wird bescheinigt, dass der/die unten genannte Einsatzkraft am beschriebenen Einsatz teilgenommen hat.",
        )
        .spacer(4.0)
        .key_value(
            "Teilnehmer/in",
            certificate.username.clone().unwrap_or_default(),
        )
        .key_value(
            "Einsatzzeitraum",
            format!(
                "{} bis {}",
                certificate.start_date.format("%d.%m.%Y"),
                certificate.end_date.format("%d.%m.%Y")
            ),
        )
        .key_value(
            "Alarmzeit",
            certificate.alarm_time.format("%H:%M").to_string(),
        )
        .key_value(
            "Einsatzende",
            certificate.end_time.format("%H:%M").to_string(),
        )
        .key_value(
            "Einheitsführer/in",
            certificate
                .unit_leader_name
                .clone()
                .unwrap_or_else(|| "—".to_string()),
        )
        .spacer(6.0)
        .key_value(
            "Unterschrift",
            certificate
                .signed_by_name
                .clone()
                .unwrap_or_else(|| "—".to_string()),
        )
        .spacer(4.0)
        .text_block(
            "Diese Bescheinigung wurde digital erstellt und ist ohne Unterschrift nicht gültig.",
        )
        .build(&crate::pdf::load_font_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))
}

// ── Routes ───────────────────────────────────────────────────────

pub async fn list_certificates(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<CertificateQuery>,
) -> AppResult<Json<Vec<ParticipationCertificate>>> {
    let perm_level = get_certificate_permission_level(&state, &claims).await?;
    let user_id = claims.sub;

    // If user has no permission, return empty list
    if perm_level == CertificatePermissionLevel::None {
        return Ok(Json(vec![]));
    }

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

    // Filter based on permission level:
    // - Admin: see all certificates
    // - Write: see own certificates + certificates where user is unit leader
    // - Read: see only own certificates
    let filtered: Vec<ParticipationCertificate> = certificates
        .into_iter()
        .filter(|cert| {
            perm_level == CertificatePermissionLevel::Admin
                || (perm_level == CertificatePermissionLevel::Write
                    && (cert.user_id == user_id || cert.unit_leader_id == Some(user_id)))
                || (perm_level == CertificatePermissionLevel::Read && cert.user_id == user_id)
        })
        .collect();

    Ok(Json(filtered))
}

pub async fn get_certificate_by_id(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ParticipationCertificate>> {
    fetch_certificate_by_id(&state, id, &claims).await.map(Json)
}

pub async fn get_certificate_pdf(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<(
    axum::http::HeaderMap,
    Vec<u8>,
)> {
    let certificate = fetch_certificate_by_id(&state, id, &claims).await?;
    let pdf = generate_certificate_pdf(&state.db, &certificate).await?;

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        axum::http::HeaderValue::from_str(&format!(
            "attachment; filename=\"teilnahmebescheinigung-{}.pdf\"",
            id.hyphenated()
        )).map_err(|_| {
            AppError::Internal(anyhow::anyhow!("Invalid header"))
        })?,
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
               i.unit_leader_id, COALESCE(ul.display_name, ul.username) as unit_leader_name,
               i.status, i.created_at,
               NULL::timestamptz as approved_at,
               NULL::timestamptz as signed_at,
               NULL::uuid as signed_by,
               NULL::text as signed_by_name,
               NULL::text as template_path
        FROM inserted i
        JOIN users u ON u.id = i.user_id
        LEFT JOIN users ul ON ul.id = i.unit_leader_id
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

pub async fn delete_certificate(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // First check if user has access to this certificate (owner, leader, or admin)
    let cert = fetch_certificate_by_id(&state, id, &claims).await?;

    let perm_level = get_certificate_permission_level(&state, &claims).await?;
    let user_id = claims.sub;

    // Allow delete if user is the creator OR has admin permission
    let is_creator = cert.user_id == user_id;
    let is_admin = perm_level == CertificatePermissionLevel::Admin;
    if !is_creator && !is_admin {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query("DELETE FROM participation_certificates WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Bescheinigung gelöscht" })))
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

    // Check permission to update status: admin (global or module) or schreiben
    let has_admin_perm = claims.is_admin_or_above()
        || sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("teilnahmebescheinigung.admin")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;

    let is_schreiben = if has_admin_perm {
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

    if !has_admin_perm && !is_schreiben {
        return Err(AppError::Forbidden);
    }

    // Check if user has access to this certificate (owner, leader, or admin)
    let cert = fetch_certificate_by_id(&state, id, &claims).await?;

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

    fetch_certificate_by_id(&state, id, &claims).await.map(Json)
}

// ── Template upload (Admin only) ──────────────────────────────

/// Handle multipart form data for template upload
pub async fn upload_template(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() == Some("file") {
            let content_type = field.content_type().unwrap_or("").to_string();
            let is_docx = content_type
                .starts_with("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                || field.file_name().map_or(false, |n| n.to_lowercase().ends_with(".docx"));
            if !is_docx {
                return Err(AppError::BadRequest("Nur DOCX-Dateien erlaubt".into()));
            }

            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;

            const MAX_TEMPLATE_SIZE: usize = 20 * 1024 * 1024; // 20 MB
            if data.len() > MAX_TEMPLATE_SIZE {
                return Err(AppError::BadRequest("Template zu groß (max. 20 MB)".into()));
            }

            let dir = Path::new(&state.config.data_dir);
            fs::create_dir_all(dir)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            fs::write(dir.join("teilnahmebescheinigung_template.docx"), &data)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            // Mark template as uploaded in settings
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_template', $1)
                 ON CONFLICT (key) DO UPDATE SET value = $1"
            )
            .bind("uploaded")
            .execute(&state.db)
            .await?;

            return Ok(Json(serde_json::json!({ "ok": true })));
        }
    }

    Err(AppError::BadRequest("Keine Datei im Request gefunden".into()))
}

/// Delete the uploaded template (Admin only)
pub async fn delete_template(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let path = Path::new(&state.config.data_dir).join("teilnahmebescheinigung_template.docx");
    if path.exists() {
        fs::remove_file(&path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
    }

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_template', '')
         ON CONFLICT (key) DO UPDATE SET value = ''"
    )
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Get template status (whether a template is uploaded)
pub async fn get_template(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let has_template: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'teilnahmebescheinigung_template'"
    )
    .fetch_optional(&state.db)
    .await?;

    let has_template = has_template.map_or(false, |v| v == "uploaded");
    let path = Path::new(&state.config.data_dir).join("teilnahmebescheinigung_template.docx");
    let file_exists = path.exists();

    Ok(Json(serde_json::json!({
        "has_template": has_template && file_exists,
        "template_path": if has_template && file_exists { "teilnahmebescheinigung_template.docx" } else { "" }
    })))
}

// ── Stempel (Stamp) upload (Admin only) ──────────────────────

/// Handle multipart form data for stamp upload (image file)
pub async fn upload_stempel(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() == Some("file") {
            let content_type = field.content_type().unwrap_or("").to_string();
            if !content_type.starts_with("image/") {
                return Err(AppError::BadRequest("Nur Bilddateien erlaubt".into()));
            }

            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;

            const MAX_STAMP_SIZE: usize = 5 * 1024 * 1024; // 5 MB
            if data.len() > MAX_STAMP_SIZE {
                return Err(AppError::BadRequest("Stempel zu groß (max. 5 MB)".into()));
            }

            let dir = Path::new(&state.config.data_dir);
            fs::create_dir_all(dir)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            fs::write(dir.join("teilnahmebescheinigung_stempel.png"), &data)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            // Mark stamp as uploaded in settings
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_stempel', $1)
                 ON CONFLICT (key) DO UPDATE SET value = $1"
            )
            .bind("uploaded")
            .execute(&state.db)
            .await?;

            return Ok(Json(serde_json::json!({ "ok": true })));
        }
    }

    Err(AppError::BadRequest("Keine Datei im Request gefunden".into()))
}

/// Delete the uploaded stamp (Admin only)
pub async fn delete_stempel(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let path = Path::new(&state.config.data_dir).join("teilnahmebescheinigung_stempel.png");
    if path.exists() {
        fs::remove_file(&path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
    }

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_stempel', '')
         ON CONFLICT (key) DO UPDATE SET value = ''"
    )
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Get stamp status
pub async fn get_stempel(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let has_stempel: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'teilnahmebescheinigung_stempel'"
    )
    .fetch_optional(&state.db)
    .await?;

    let has_stempel = has_stempel.map_or(false, |v| v == "uploaded");
    let path = Path::new(&state.config.data_dir).join("teilnahmebescheinigung_stempel.png");
    let file_exists = path.exists();

    Ok(Json(serde_json::json!({
        "has_stempel": has_stempel && file_exists,
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

// ── Handler: Alle Einheitsführer laden ────────────────────────────

pub async fn list_unit_leaders(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<UnitLeaderEntry>>> {
    let leaders = sqlx::query_as::<_, UnitLeaderEntry>(
        "SELECT u.id, u.username, u.display_name
         FROM users u
         WHERE EXISTS (
             SELECT 1
             FROM (
                 SELECT unnest(COALESCE(u.permissions, '{}')) AS perm
                 UNION
                 SELECT unnest(COALESCE(r.permissions, '{}'))
                 FROM roles r WHERE r.id = u.role_id
                 UNION
                 SELECT unnest(fr.permissions)
                 FROM user_functions uf
                 JOIN roles fr ON fr.id = uf.role_id
                 WHERE uf.user_id = u.id
             ) perms
             WHERE perms.perm IN ('teilnahmebescheinigung.schreiben', 'teilnahmebescheinigung.admin')
         )
         ORDER BY COALESCE(u.display_name, u.username) ASC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(leaders))
}

// ── Router ──────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_certificates).post(create_certificate))
        .route("/:id", get(get_certificate_by_id).delete(delete_certificate))
        .route("/:id/pdf", get(get_certificate_pdf))
        .route("/:id/status", put(update_certificate_status))
        .route("/template", post(upload_template).get(get_template).delete(delete_template))
        .route("/signature", post(upload_signature).get(get_signature))
        .route("/stempel", post(upload_stempel).get(get_stempel).delete(delete_stempel))
        .route("/unit-leaders", get(list_unit_leaders))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("teilnahmebescheinigung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}