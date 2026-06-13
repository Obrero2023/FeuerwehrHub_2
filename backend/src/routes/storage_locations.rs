use axum::{
    extract::{Path, State},
    middleware,
    routing::{delete, get, post, put},
    Json, Router,
};
use validator::Validate;
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use uuid::Uuid;

use crate::{
    auth::middleware::{require_auth, require_module},
    errors::{AppError, AppResult},
    AppState,
};

#[derive(Serialize, FromRow)]
pub struct StorageLocation {
    pub id:          Uuid,
    pub name:        String,
    pub parent_id:   Option<Uuid>,
    pub description: Option<String>,
    pub sort_order:  i32,
    pub created_at:  DateTime<Utc>,
}

#[derive(Deserialize, Validate)]
pub struct StorageLocationBody {
    #[validate(length(min = 1, max = 128))]
    pub name:        String,
    pub parent_id:   Option<Uuid>,
    #[validate(length(max = 500))]
    pub description: Option<String>,
    pub sort_order:  Option<i32>,
}

// ── Handlers ─────────────────────────────────────────────────────────────────

pub async fn list_storage_locations(
    State(state): State<AppState>,
) -> AppResult<Json<Vec<StorageLocation>>> {
    let rows = sqlx::query_as::<_, StorageLocation>(
        "SELECT id, name, parent_id, description, sort_order, created_at
         FROM storage_locations
         ORDER BY sort_order ASC, name ASC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(rows))
}

pub async fn create_storage_location(
    State(state): State<AppState>,
    Json(body): Json<StorageLocationBody>,
) -> AppResult<Json<StorageLocation>> {
    body.validate()?;
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name darf nicht leer sein".into()));
    }

    if let Some(parent_id) = body.parent_id {
        let exists: bool = sqlx::query_scalar(
            "SELECT EXISTS(SELECT 1 FROM storage_locations WHERE id = $1)"
        )
        .bind(parent_id)
        .fetch_one(&state.db)
        .await?;
        if !exists {
            return Err(AppError::BadRequest("Übergeordneter Lagerort nicht gefunden".into()));
        }
    }

    let row = sqlx::query_as::<_, StorageLocation>(
        "INSERT INTO storage_locations (name, parent_id, description, sort_order)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, parent_id, description, sort_order, created_at"
    )
    .bind(name)
    .bind(body.parent_id)
    .bind(body.description)
    .bind(body.sort_order.unwrap_or(0))
    .fetch_one(&state.db)
    .await?;

    Ok(Json(row))
}

pub async fn update_storage_location(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Json(body): Json<StorageLocationBody>,
) -> AppResult<Json<StorageLocation>> {
    body.validate()?;
    let name = body.name.trim();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name darf nicht leer sein".into()));
    }

    if let Some(parent_id) = body.parent_id {
        if parent_id == id {
            return Err(AppError::BadRequest(
                "Ein Lagerort kann nicht sein eigener Elternknoten sein".into(),
            ));
        }
        // Zirkuläre Hierarchie verhindern: parent_id darf kein Nachfahre von id sein
        let is_descendant: bool = sqlx::query_scalar(
            "WITH RECURSIVE subtree AS (
                SELECT id FROM storage_locations WHERE id = $1
                UNION ALL
                SELECT sl.id FROM storage_locations sl JOIN subtree s ON sl.parent_id = s.id
             )
             SELECT EXISTS(SELECT 1 FROM subtree WHERE id = $2)"
        )
        .bind(id)
        .bind(parent_id)
        .fetch_one(&state.db)
        .await?;
        if is_descendant {
            return Err(AppError::BadRequest("Zirkuläre Hierarchie nicht erlaubt".into()));
        }
    }

    let row = sqlx::query_as::<_, StorageLocation>(
        "UPDATE storage_locations
         SET name=$1, parent_id=$2, description=$3, sort_order=$4
         WHERE id = $5
         RETURNING id, name, parent_id, description, sort_order, created_at"
    )
    .bind(name)
    .bind(body.parent_id)
    .bind(body.description)
    .bind(body.sort_order.unwrap_or(0))
    .bind(id)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(row))
}

pub async fn delete_storage_location(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let has_children: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM storage_locations WHERE parent_id = $1)"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if has_children {
        return Err(AppError::BadRequest(
            "Lagerort hat noch Unterknoten — bitte zuerst löschen oder verschieben".into(),
        ));
    }

    let has_articles: bool = sqlx::query_scalar(
        "SELECT EXISTS(SELECT 1 FROM articles WHERE storage_location_id = $1)"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await?;
    if has_articles {
        return Err(AppError::BadRequest(
            "Lagerort enthält noch Artikel — bitte zuerst umbuchen".into(),
        ));
    }

    let result = sqlx::query("DELETE FROM storage_locations WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Lagerort gelöscht" })))
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/",    get(list_storage_locations).post(create_storage_location))
        .route("/:id", put(update_storage_location).delete(delete_storage_location))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("lager")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}
