use axum::{
    extract::{Path, Query, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use chrono::NaiveDate;
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;
use validator::Validate;

use crate::{
    audit,
    auth::middleware::{require_module, require_auth, Claims},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Jugendmitglied {
    pub id: Uuid,
    pub user_id: Option<Uuid>,
    pub name: String,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
    pub austrittsdatum: Option<NaiveDate>,
    pub geschlecht: String,
    pub adresse: Option<String>,
    pub telefon: Option<String>,
    pub email: Option<String>,
    pub eltern_name: Option<String>,
    pub eltern_telefon: Option<String>,
    pub eltern_email: Option<String>,
    pub juleica: bool,
    pub juleica_ablauf: Option<NaiveDate>,
    pub bemerkung: Option<String>,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateJugendmitglied {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    pub user_id: Option<Uuid>,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
    pub austrittsdatum: Option<NaiveDate>,
    #[validate(length(min = 1, max = 20))]
    pub geschlecht: String,
    pub adresse: Option<String>,
    #[validate(length(max = 50))]
    pub telefon: Option<String>,
    #[validate(length(max = 200))]
    pub email: Option<String>,
    pub eltern_name: Option<String>,
    pub eltern_telefon: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email: Option<String>,
    pub juleica: Option<bool>,
    pub juleica_ablauf: Option<NaiveDate>,
    pub bemerkung: Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateJugendmitglied {
    #[validate(length(min = 1, max = 200))]
    pub name: Option<String>,
    pub user_id: Option<Uuid>,
    pub geburtsdatum: Option<NaiveDate>,
    pub eintrittsdatum: Option<NaiveDate>,
    pub austrittsdatum: Option<NaiveDate>,
    #[validate(length(min = 1, max = 20))]
    pub geschlecht: Option<String>,
    pub adresse: Option<String>,
    #[validate(length(max = 50))]
    pub telefon: Option<String>,
    #[validate(length(max = 200))]
    pub email: Option<String>,
    pub eltern_name: Option<String>,
    pub eltern_telefon: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email: Option<String>,
    pub juleica: Option<bool>,
    pub juleica_ablauf: Option<NaiveDate>,
    pub bemerkung: Option<String>,
}

// ── Routes ────────────────────────────────────────────────────────────────────

pub async fn list_jugendmitglieder(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Jugendmitglied>>> {
    let mitglieder = sqlx::query_as::<_, Jugendmitglied>(
        r#"
        SELECT id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
               geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
               eltern_email, juleica, juleica_ablauf, bemerkung,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_mitglieder
        ORDER BY name ASC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(mitglieder))
}

pub async fn get_jugendmitglied(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Jugendmitglied>> {
    let mitglied = sqlx::query_as::<_, Jugendmitglied>(
        r#"
        SELECT id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
               geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
               eltern_email, juleica, juleica_ablauf, bemerkung,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_mitglieder
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    Ok(Json(mitglied))
}

pub async fn create_jugendmitglied(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateJugendmitglied>,
) -> AppResult<Json<Jugendmitglied>> {
    body.validate()?;

    let mitglied = sqlx::query_as::<_, Jugendmitglied>(
        r#"
        INSERT INTO jugendfeuerwehr_mitglieder
            (user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
             geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
             eltern_email, juleica, juleica_ablauf, bemerkung,
             erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        RETURNING id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
                    geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
                    eltern_email, juleica, juleica_ablauf, bemerkung,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.user_id)
    .bind(&body.name)
    .bind(body.geburtsdatum)
    .bind(body.eintrittsdatum)
    .bind(body.austrittsdatum)
    .bind(&body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.eltern_name)
    .bind(&body.eltern_telefon)
    .bind(&body.eltern_email)
    .bind(body.juleica.unwrap_or(false))
    .bind(body.juleica_ablauf)
    .bind(&body.bemerkung)
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("POST /api/jugendfeuerwehr - database error: {}", e);
        AppError::Database(e)
    })?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "JUGENDMITGLIED_CREATED",
        Some("jugendfeuerwehr_mitglieder"),
        Some(mitglied.id),
        None,
    )
    .await;

    Ok(Json(mitglied))
}

pub async fn update_jugendmitglied(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateJugendmitglied>,
) -> AppResult<Json<Jugendmitglied>> {
    body.validate()?;

    let mitglied = sqlx::query_as::<_, Jugendmitglied>(
        r#"
        UPDATE jugendfeuerwehr_mitglieder
        SET name = COALESCE($1, name),
            user_id = COALESCE($2, user_id),
            geburtsdatum = COALESCE($3, geburtsdatum),
            eintrittsdatum = COALESCE($4, eintrittsdatum),
            austrittsdatum = COALESCE($5, austrittsdatum),
            geschlecht = COALESCE($6, geschlecht),
            adresse = COALESCE($7, adresse),
            telefon = COALESCE($8, telefon),
            email = COALESCE($9, email),
            eltern_name = COALESCE($10, eltern_name),
            eltern_telefon = COALESCE($11, eltern_telefon),
            eltern_email = COALESCE($12, eltern_email),
            juleica = COALESCE($13, juleica),
            juleica_ablauf = COALESCE($14, juleica_ablauf),
            bemerkung = COALESCE($15, bemerkung),
            aktualisiert_am = NOW()
        WHERE id = $16
        RETURNING id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
                    geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
                    eltern_email, juleica, juleica_ablauf, bemerkung,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.name)
    .bind(body.user_id)
    .bind(body.geburtsdatum)
    .bind(body.eintrittsdatum)
    .bind(body.austrittsdatum)
    .bind(body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.eltern_name)
    .bind(&body.eltern_telefon)
    .bind(&body.eltern_email)
    .bind(body.juleica)
    .bind(body.juleica_ablauf)
    .bind(&body.bemerkung)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "JUGENDMITGLIED_UPDATED",
        Some("jugendfeuerwehr_mitglieder"),
        Some(id),
        None,
    )
    .await;

    Ok(mitglied)
}

pub async fn delete_jugendmitglied(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM jugendfeuerwehr_mitglieder WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "JUGENDMITGLIED_DELETED",
        Some("jugendfeuerwehr_mitglieder"),
        Some(id),
        None,
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Mitglied gelöscht" })))
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_jugendmitglieder).post(create_jugendmitglied))
        .route("/:id", get(get_jugendmitglied).put(update_jugendmitglied).delete(delete_jugendmitglied))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("jugendfeuerwehr")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}