use axum::{
    body::Body,
    extract::{DefaultBodyLimit, Multipart, Path, State},
    handler::Handler,
    http::header,
    middleware,
    response::Response,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use std::path::Path as FilePath;
use tokio::fs;
use uuid::Uuid;
use validator::Validate;

use crate::{
    audit,
    auth::middleware::{require_auth, require_module, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct IntranetEntry {
    pub id:              Uuid,
    pub title:           String,
    pub entry_type:      String,
    pub url:             Option<String>,
    pub file_name:       Option<String>,
    pub mime_type:       Option<String>,
    pub file_size:       Option<i64>,
    pub description:     Option<String>,
    pub published_by:    Option<Uuid>,
    pub published_by_name: Option<String>,
    pub published_at:    chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateLinkEntry {
    #[validate(length(min = 1, max = 200))]
    pub title:       String,
    #[validate(url)]
    pub url:         String,
    pub description: Option<String>,
    pub role_ids:    Option<Vec<Uuid>>,
}

// ── Helper: Rollen des Nutzers ermitteln ──────────────────────────────────

/// Alle Rollen-IDs des Nutzers: Primärrolle (users.role_id) + Zusatzfunktionen
async fn user_role_ids(db: &PgPool, user_id: Uuid) -> Vec<Uuid> {
    sqlx::query_scalar::<_, Uuid>(
        "SELECT r.id FROM roles r WHERE r.id = (SELECT u.role_id FROM users u WHERE u.id = $1)
         UNION
         SELECT uf.role_id FROM user_functions uf WHERE uf.user_id = $1"
    )
    .bind(user_id)
    .fetch_all(db)
    .await
    .unwrap_or_default()
}

/// Prüft ob ein Eintrag für die gegebenen Rollen sichtbar ist.
/// Einträge ohne Rollen-Zuordnung sind für alle sichtbar.
async fn entry_visible_to(db: &PgPool, entry_id: Uuid, role_ids: &[Uuid]) -> bool {
    sqlx::query_scalar::<_, bool>(
        "SELECT NOT EXISTS (
            SELECT 1 FROM intranet_entry_roles er
            WHERE er.entry_id = $1
        )
        OR EXISTS (
            SELECT 1 FROM intranet_entry_roles er
            WHERE er.entry_id = $1 AND er.role_id = ANY($2::uuid[])
        )"
    )
    .bind(entry_id)
    .bind(role_ids)
    .fetch_one(db)
    .await
    .unwrap_or(false)
}

/// Rollen-Zuordnungen für einen Intranet-Eintrag speichern.
/// `None` → alle Rollen aus der Tabelle (Default).
/// `Some(leeres Array)` → nur Admin/Superuser (keine Rolle).
async fn save_entry_roles(db: &PgPool, entry_id: Uuid, role_ids: Option<Vec<Uuid>>) -> AppResult<()> {
    let insert_all = "INSERT INTO intranet_entry_roles (entry_id, role_id)
                       SELECT $1, id FROM roles ON CONFLICT DO NOTHING";
    let insert_specific = "INSERT INTO intranet_entry_roles (entry_id, role_id)
                           SELECT $1, unnest($2::uuid[]) ON CONFLICT DO NOTHING";

    match role_ids {
        None => {
            sqlx::query(insert_all).bind(entry_id).execute(db).await?;
        }
        Some(ids) if ids.is_empty() => {
            // Keine Rolle ausgewählt → nur Admin/Superuser sehen den Eintrag
        }
        Some(ids) => {
            sqlx::query(insert_specific)
                .bind(entry_id)
                .bind(&ids)
                .execute(db)
                .await?;
        }
    }

    Ok(())
}

// ── Handler: Alle Einträge laden (lesen) ──────────────────────────────────

pub async fn list_entries(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<IntranetEntry>>> {
    // Intranet-Modul muss aktiv sein oder User braucht intranet-Berechtigung
    let rows = if claims.is_admin_or_above() {
        sqlx::query_as::<_, IntranetEntry>(
            "SELECT id, title, entry_type, url, file_name, mime_type, file_size,
                    description, published_by, published_by_name, published_at
             FROM intranet_entries
             ORDER BY published_at DESC"
        )
        .fetch_all(&state.db)
        .await?
    } else {
        let role_ids = user_role_ids(&state.db, claims.sub).await;

        sqlx::query_as::<_, IntranetEntry>(
            "SELECT e.id, e.title, e.entry_type, e.url, e.file_name,
                    e.mime_type, e.file_size, e.description,
                    e.published_by, e.published_by_name, e.published_at
             FROM intranet_entries e
             WHERE NOT EXISTS (
                 SELECT 1 FROM intranet_entry_roles er
                 WHERE er.entry_id = e.id
             )
             OR EXISTS (
                 SELECT 1 FROM intranet_entry_roles er
                 WHERE er.entry_id = e.id
                 AND er.role_id = ANY($1::uuid[])
             )
             ORDER BY e.published_at DESC"
        )
        .bind(&role_ids)
        .fetch_all(&state.db)
        .await?
    };

    Ok(Json(rows))
}

// ── Handler: Link-Eintrag erstellen ──────────────────────────────────────

#[derive(Deserialize, Validate)]
pub struct UpdateLinkEntry {
    #[validate(length(min = 1, max = 200))]
    pub title: String,
    #[validate(url)]
    pub url: String,
    pub description: Option<String>,
    pub role_ids: Option<Vec<Uuid>>,
}

pub async fn update_link_entry(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateLinkEntry>,
) -> AppResult<Json<IntranetEntry>> {
    body.validate()?;

    // Nur Admin/Superuser oder User mit "intranet"-Berechtigung dürfen bearbeiten
    if !claims.is_admin_or_above() {
        let has_perm: bool = sqlx::query_scalar(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
             )"
        )
        .bind("intranet")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !has_perm {
            return Err(AppError::Forbidden);
        }
    }

    // Prüfen ob Eintrag existiert und ob es ein Datei-Eintrag ist
    let row = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT entry_type, file_path FROM intranet_entries WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    if row.1.is_some() {
        // Eintrag ist eine Datei → kann nicht bearbeitet werden
        return Err(AppError::BadRequest("Datei-Einträge können nicht bearbeitet werden".into()));
    }

    let updated = sqlx::query_as::<_, IntranetEntry>(
        "UPDATE intranet_entries
         SET title = $1, url = $2, description = $3, updated_at = NOW()
         WHERE id = $4
         RETURNING id, title, entry_type, url, file_name, mime_type, file_size,
                   description, published_by, published_by_name, published_at"
    )
    .bind(body.title.trim())
    .bind(body.url.trim())
    .bind(body.description.unwrap_or_default())
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Rollen-Zuordnungen neu setzen
    sqlx::query("DELETE FROM intranet_entry_roles WHERE entry_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    save_entry_roles(&state.db, id, body.role_ids).await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "INTENTRY_UPDATED",
        Some("intranet_entries"), Some(id), None).await;

    Ok(Json(updated))
}

// ── Handler: Datei-Eintrag bearbeiten ─────────────────────────────

#[derive(Deserialize, Validate)]
pub struct UpdateFileEntry {
    #[validate(length(min = 1, max = 200))]
    pub title: String,
    pub description: Option<String>,
    pub role_ids: Option<Vec<Uuid>>,
}

pub async fn update_file_entry(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateFileEntry>,
) -> AppResult<Json<IntranetEntry>> {
    body.validate()?;

    // Nur Admin/Superuser oder User mit "intranet"-Berechtigung d&uuml;rfen bearbeiten
    if !claims.is_admin_or_above() {
        let has_perm: bool = sqlx::query_scalar(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
             )"
        )
        .bind("intranet")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !has_perm {
            return Err(AppError::Forbidden);
        }
    }

    // Pr&uuml;fen ob Eintrag existiert und ob es ein Datei-Eintrag ist
    let row = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT entry_type, file_path FROM intranet_entries WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    if row.1.is_none() {
        // Eintrag ist ein Link → dieser Handler ist nur f&uuml;r Dateien
        return Err(AppError::BadRequest("Link-Eintr&auml;ge m&uuml;ssen &uuml;ber das Link-Update bearbeitet werden".into()));
    }

    let updated = sqlx::query_as::<_, IntranetEntry>(
        "UPDATE intranet_entries
         SET title = $1, description = $2, updated_at = NOW()
         WHERE id = $3
         RETURNING id, title, entry_type, url, file_name, mime_type, file_size,
                   description, published_by, published_by_name, published_at"
    )
    .bind(body.title.trim())
    .bind(body.description.unwrap_or_default())
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    // Rollen-Zuordnungen neu setzen
    sqlx::query("DELETE FROM intranet_entry_roles WHERE entry_id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;
    save_entry_roles(&state.db, id, body.role_ids).await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "INTENTRY_UPDATED",
        Some("intranet_entries"), Some(id), None).await;

    Ok(Json(updated))
}

pub async fn create_link_entry(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateLinkEntry>,
) -> AppResult<Json<IntranetEntry>> {
    body.validate()?;

    // Nur Admin/Superuser oder User mit "intranet"-Berechtigung dürfen veröffentlichen
    if !claims.is_admin_or_above() {
        // Prüfe ob User die "intranet"-Permission hat (direkt oder via Rolle/Funktion)
        let has_perm: bool = sqlx::query_scalar(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
             )"
        )
        .bind("intranet")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !has_perm {
            return Err(AppError::Forbidden);
        }
    }

    let row = sqlx::query_as::<_, IntranetEntry>(
        "INSERT INTO intranet_entries (title, entry_type, url, description, published_by, published_by_name)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id, title, entry_type, url, file_name, mime_type, file_size,
                   description, published_by, published_by_name, published_at"
    )
    .bind(body.title.trim())
    .bind("link")
    .bind(body.url.trim())
    .bind(body.description.unwrap_or_default())
    .bind(claims.sub)
    .bind(claims.username.clone())
    .fetch_one(&state.db)
    .await?;

    // Rollen-Sichtbarkeit speichern
    save_entry_roles(&state.db, row.id, body.role_ids).await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "INTENTRY_CREATED",
        Some("intranet_entries"), Some(row.id), None).await;

    Ok(Json(row))
}

// ── Handler: Datei-Entry erstellen ────────────────────────────────────────

pub async fn create_file_entry(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<IntranetEntry>> {
    let mut title: Option<String> = None;
    let mut description: Option<String> = None;
    let mut roles_json: Option<String> = None;
    let mut file_data: Option<(Vec<u8>, String, String)> = None; // (bytes, filename, mime)

    while let Some(field) = multipart.next_field().await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        match field.name() {
            Some("title") => { title = field.text().await.ok(); }
            Some("description") => { description = field.text().await.ok(); }
            Some("role_ids") => { roles_json = field.text().await.ok(); }
            Some("file") => {
                let filename = field.file_name().unwrap_or("datei").to_string();
                let mime = field.content_type().unwrap_or("application/octet-stream").to_string();
                let bytes = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;
                if bytes.len() > 100 * 1024 * 1024 {
                    return Err(AppError::BadRequest("Datei zu groß (max. 100 MB)".into()));
                }
                file_data = Some((bytes.to_vec(), filename, mime));
            }
            _ => {}
        }
    }

    let role_ids: Option<Vec<Uuid>> = roles_json
        .and_then(|s| serde_json::from_str::<Vec<Uuid>>(&s).ok());

    let (bytes, filename, mime) = file_data.ok_or_else(|| AppError::BadRequest("Keine Datei hochgeladen".into()))?;

    // Berechtigungsprüfung
    if !claims.is_admin_or_above() {
        let has_perm: bool = sqlx::query_scalar(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
             )"
        )
        .bind("intranet")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !has_perm {
            return Err(AppError::Forbidden);
        }
    }

    let title_val = title.unwrap_or_else(|| filename.clone());
    let doc_id = Uuid::new_v4();
    let dir = FilePath::new(&state.config.data_dir).join("intranet");
    fs::create_dir_all(&dir).await.map_err(|e| AppError::Internal(e.into()))?;

    let ext = FilePath::new(&filename)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("bin");
    let stored_name = format!("{}.{}", doc_id, ext);
    let file_path = dir.join(&stored_name);
    let file_size = bytes.len() as i64;

    fs::write(&file_path, &bytes).await.map_err(|e| AppError::Internal(e.into()))?;

    let row = sqlx::query_as::<_, IntranetEntry>(
        "INSERT INTO intranet_entries (title, entry_type, url, file_path, file_name, mime_type, file_size, description, published_by, published_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
         RETURNING id, title, entry_type, url, file_name, mime_type, file_size,
                   description, published_by, published_by_name, published_at"
    )
    .bind(title_val.trim())
    .bind("file")
    .bind(None::<String>)
    .bind(stored_name)
    .bind(filename)
    .bind(Some(mime))
    .bind(file_size)
    .bind(description.unwrap_or_default())
    .bind(claims.sub)
    .bind(claims.username.clone())
    .fetch_one(&state.db)
    .await?;

    // Rollen-Sichtbarkeit speichern
    save_entry_roles(&state.db, row.id, role_ids).await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "INTENTRY_FILE_UPLOADED",
        Some("intranet_entries"), Some(row.id), None).await;

    Ok(Json(row))
}

// ── Handler: Eintrag löschen ────────────────────────────────────────────

pub async fn delete_entry(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // Nur Admin oder User mit intranet-Permission
    if !claims.is_admin_or_above() {
        let has_perm: bool = sqlx::query_scalar(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
             )"
        )
        .bind("intranet")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false);

        if !has_perm {
            return Err(AppError::Forbidden);
        }
    }

    let row = sqlx::query_as::<_, (String, Option<String>)>(
        "SELECT entry_type, file_path FROM intranet_entries WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Datei löschen falls vorhanden
    if let Some(ref file_path_str) = row.1 {
        let path = FilePath::new(&state.config.data_dir).join("intranet").join(file_path_str);
        let _ = fs::remove_file(&path).await;
    }

    sqlx::query("DELETE FROM intranet_entries WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "INTENTRY_DELETED",
        Some("intranet_entries"), Some(id), None).await;

    Ok(Json(serde_json::json!({ "ok": true })))
}

// ── Handler: Datei herunterladen ────────────────────────────────────────

pub async fn download_file(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Response> {
    let row = sqlx::query_as::<_, (String, String, Option<String>)>(
        "SELECT file_name, file_path, mime_type FROM intranet_entries WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Sichtbarkeitsprüfung für Nicht-Admins
    if !claims.is_admin_or_above() {
        let role_ids = user_role_ids(&state.db, claims.sub).await;
        if !entry_visible_to(&state.db, id, &role_ids).await {
            return Err(AppError::Forbidden);
        }
    }

    let path = FilePath::new(&state.config.data_dir)
        .join("intranet")
        .join(&row.1);
    let bytes = fs::read(&path).await.map_err(|_| AppError::NotFound)?;
    let mime = row.2.unwrap_or_else(|| "application/octet-stream".into());
    let filename = row.0;

    Ok(Response::builder()
        .header(header::CONTENT_TYPE, &mime)
        .header(
            header::CONTENT_DISPOSITION,
            format!("attachment; filename=\"{}\"", filename.replace('"', "").replace(['\r', '\n'], "")),
        )
        .body(Body::from(bytes))
        .unwrap())
}

// ── Router ────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    // Alle eingeloggten User können lesen und Dateien herunterladen
    let public = Router::new()
        .route("/", get(list_entries))
        .route("/:id/download", get(download_file))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    // Nur Admin/Superuser oder User mit "intranet"-Berechtigung können erstellen/bearbeiten/löschen
    let protected = Router::new()
        .route("/", post(create_link_entry))
        .route("/file", post(create_file_entry.layer(DefaultBodyLimit::max(100 * 1024 * 1024))))
        .route("/:id", put(update_link_entry).delete(delete_entry))
        .route("/:id/file", put(update_file_entry))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("intranet")))
        .route_layer(middleware::from_fn_with_state(state, require_auth));

    Router::new()
        .merge(public)
        .merge(protected)
}
