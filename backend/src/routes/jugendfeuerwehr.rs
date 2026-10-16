use axum::{
    extract::{Path, Query, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use chrono::{NaiveDate, Utc};
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
    pub archiviert: bool,
    pub alter_jahre: i32,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
}

// ── Kleiderkammer Structs ─────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Lagerartikel {
    pub id: Uuid,
    pub name: String,
    pub beschreibung: Option<String>,
    pub menge: i32,
    pub einheit: String,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateLagerartikel {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    pub beschreibung: Option<String>,
    pub menge: i32,
    pub einheit: Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateLagerartikel {
    #[validate(length(min = 1, max = 200))]
    pub name: Option<String>,
    pub beschreibung: Option<String>,
    pub menge: Option<i32>,
    pub einheit: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Kleiderausgabe {
    pub id: Uuid,
    pub mitglied_id: Uuid,
    pub mitglied_name: String,
    pub lagerartikel_id: Uuid,
    pub lagerartikel_name: String,
    pub menge: i32,
    pub ausgabedatum: NaiveDate,
    pub rueckgabedatum: Option<NaiveDate>,
    pub rueckgabe_menge: Option<i32>,
    pub rueckgabe_bemerkung: Option<String>,
    pub bemerkung: Option<String>,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize)]
pub struct CreateAusgabe {
    pub mitglied_id: Uuid,
    pub lagerartikel_id: Uuid,
    pub menge: i32,
    pub bemerkung: Option<String>,
}

// ── Anwerter Structs ────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Anwerter {
    pub id: Uuid,
    pub name: String,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
    pub geschlecht: String,
    pub adresse: Option<String>,
    pub telefon: Option<String>,
    pub email: Option<String>,
    pub eltern_name: Option<String>,
    pub eltern_telefon: Option<String>,
    pub eltern_email: Option<String>,
    pub bemerkung: Option<String>,
    pub status: String,
    pub alter_jahre: i32,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateAnwerter {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
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
    pub bemerkung: Option<String>,
    pub status: Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateAnwerter {
    #[validate(length(min = 1, max = 200))]
    pub name: Option<String>,
    pub geburtsdatum: Option<NaiveDate>,
    pub eintrittsdatum: Option<NaiveDate>,
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
    pub bemerkung: Option<String>,
    pub status: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Dienstteilnahme {
    pub id: Uuid,
    pub anwerter_id: Uuid,
    pub anwerter_name: String,
    pub termin_bezeichnung: String,
    pub datum: NaiveDate,
    pub zeit_von: Option<chrono::NaiveTime>,
    pub zeit_bis: Option<chrono::NaiveTime>,
    pub bemerkung: Option<String>,
    pub bestaetigt_von_name: Option<String>,
    pub bestaetigt_am: Option<chrono::DateTime<chrono::Utc>>,
    pub status: String,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateDienstteilnahme {
    pub anwerter_id: Uuid,
    #[validate(length(min = 1, max = 200))]
    pub termin_bezeichnung: String,
    pub datum: NaiveDate,
    pub zeit_von: Option<chrono::NaiveTime>,
    pub zeit_bis: Option<chrono::NaiveTime>,
    pub bemerkung: Option<String>,
    pub status: Option<String>,
}

// ── Mitgliedschaftsvorgänge Structs ────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Mitgliedschaftsvorgang {
    pub id: Uuid,
    pub mitglied_id: Uuid,
    pub mitglied_name: String,
    pub typ: String,
    pub datum: NaiveDate,
    pub vorherischer_name: Option<String>,
    pub neuer_name: Option<String>,
    pub grund: Option<String>,
    pub bemerkung: Option<String>,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateVorgang {
    pub mitglied_id: Uuid,
    #[validate(length(min = 1, max = 20))]
    pub typ: String,
    pub datum: NaiveDate,
    pub vorherischer_name: Option<String>,
    pub neuer_name: Option<String>,
    pub grund: Option<String>,
    pub bemerkung: Option<String>,
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
    pub archiviert: Option<bool>,
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
    pub archiviert: Option<bool>,
}

// ── Jugendmitglieder Routes ─────────────────────────────────────────────────-----

pub async fn list_jugendmitglieder(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Jugendmitglied>>> {
    let mitglieder = sqlx::query_as::<_, Jugendmitglied>(
        r#"
        SELECT id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
               geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
               eltern_email, juleica, juleica_ablauf, bemerkung, archiviert,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_mitglieder
        WHERE archiviert = FALSE
        ORDER BY name ASC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(mitglieder))
}

pub async fn list_jugendmitglieder_archiviert(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Jugendmitglied>>> {
    let mitglieder = sqlx::query_as::<_, Jugendmitglied>(
        r#"
        SELECT id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
               geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
               eltern_email, juleica, juleica_ablauf, bemerkung, archiviert,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_mitglieder
        WHERE archiviert = TRUE
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
               eltern_email, juleica, juleica_ablauf, bemerkung, archiviert,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
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
             eltern_email, juleica, juleica_ablauf, bemerkung, archiviert,
             erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
        RETURNING id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
                    geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
                    eltern_email, juleica, juleica_ablauf, bemerkung, archiviert,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
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
    .bind(body.archiviert.unwrap_or(false))
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
            archiviert = COALESCE($16, archiviert),
            aktualisiert_am = NOW()
        WHERE id = $17
        RETURNING id, user_id, name, geburtsdatum, eintrittsdatum, austrittsdatum,
                    geschlecht, adresse, telefon, email, eltern_name, eltern_telefon,
                    eltern_email, juleica, juleica_ablauf, bemerkung, archiviert,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
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
    .bind(body.archiviert)
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

    Ok(Json(mitglied))
}

pub async fn delete_jugendmitglied(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // Mitglied wird archiviert statt gelöscht — historische Daten bleiben erhalten
    let result = sqlx::query(
        "UPDATE jugendfeuerwehr_mitglieder SET archiviert = TRUE, austrittsdatum = COALESCE(austrittsdatum, CURRENT_DATE) WHERE id = $1 AND archiviert = FALSE"
    )
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
        "JUGENDMITGLIED_ARCHIVIERT",
        Some("jugendfeuerwehr_mitglieder"),
        Some(id),
        None,
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Mitglied archiviert" })))
}

// ── Kleiderkammer Routes ───────────────────────────────────────────────────

pub async fn list_lagerartikel(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Lagerartikel>>> {
    let items = sqlx::query_as::<_, Lagerartikel>(
        r#"
        SELECT id, name, beschreibung, menge, einheit,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_lagerartikel
        ORDER BY name ASC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(items))
}

pub async fn get_lagerartikel(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Lagerartikel>> {
    let item = sqlx::query_as::<_, Lagerartikel>(
        r#"
        SELECT id, name, beschreibung, menge, einheit,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_lagerartikel
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    Ok(Json(item))
}

pub async fn create_lagerartikel(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateLagerartikel>,
) -> AppResult<Json<Lagerartikel>> {
    body.validate()?;
    if body.menge < 0 {
        return Err(AppError::BadRequest("Menge darf nicht negativ sein".into()));
    }

    let item = sqlx::query_as::<_, Lagerartikel>(
        r#"
        INSERT INTO jugendfeuerwehr_lagerartikel
            (name, beschreibung, menge, einheit, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, name, beschreibung, menge, einheit,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(&body.name)
    .bind(&body.beschreibung)
    .bind(body.menge)
    .bind(body.einheit.unwrap_or_else(|| "Stück".to_string()))
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "LAGERARTIKEL_CREATED",
        Some("jugendfeuerwehr_lagerartikel"),
        Some(item.id),
        None,
    )
    .await;

    Ok(Json(item))
}

pub async fn update_lagerartikel(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateLagerartikel>,
) -> AppResult<Json<Lagerartikel>> {
    body.validate()?;

    let item = sqlx::query_as::<_, Lagerartikel>(
        r#"
        UPDATE jugendfeuerwehr_lagerartikel
        SET name = COALESCE($1, name),
            beschreibung = COALESCE($2, beschreibung),
            menge = COALESCE($3, menge),
            einheit = COALESCE($4, einheit),
            aktualisiert_am = NOW()
        WHERE id = $5
        RETURNING id, name, beschreibung, menge, einheit,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.name)
    .bind(&body.beschreibung)
    .bind(body.menge)
    .bind(body.einheit)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "LAGERARTIKEL_UPDATED",
        Some("jugendfeuerwehr_lagerartikel"),
        Some(id),
        None,
    )
    .await;

    Ok(Json(item))
}

pub async fn delete_lagerartikel(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query("DELETE FROM jugendfeuerwehr_lagerartikel WHERE id = $1")
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
        "LAGERARTIKEL_DELETED",
        Some("jugendfeuerwehr_lagerartikel"),
        Some(id),
        None,
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Lagerartikel gelöscht" })))
}

// ── Kleiderausgaben Routes ─────────────────────────────────────────────────

pub async fn list_ausgaben(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Kleiderausgabe>>> {
    let ausgaben = sqlx::query_as::<_, Kleiderausgabe>(
        r#"
        SELECT ka.id, ka.mitglied_id, m.name as mitglied_name,
               ka.lagerartikel_id, la.name as lagerartikel_name,
               ka.menge, ka.ausgabedatum, ka.rueckgabedatum,
               ka.rueckgabe_menge, ka.rueckgabe_bemerkung, ka.bemerkung,
               ka.erstellt_von, ka.erstellt_von_name, ka.erstellt_am, ka.aktualisiert_am
        FROM jugendfeuerwehr_kleiderausgaben ka
        JOIN jugendfeuerwehr_mitglieder m ON m.id = ka.mitglied_id
        JOIN jugendfeuerwehr_lagerartikel la ON la.id = ka.lagerartikel_id
        ORDER BY ka.ausgabedatum DESC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(ausgaben))
}

pub async fn create_ausgabe(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateAusgabe>,
) -> AppResult<Json<Kleiderausgabe>> {
    if body.menge <= 0 {
        return Err(AppError::BadRequest("Menge muss größer als 0 sein".into()));
    }

    // Atomare Bestandsreduktion: WHERE menge >= body.menge verhindert Überbestellung
    let updated = sqlx::query(
        "UPDATE jugendfeuerwehr_lagerartikel SET menge = menge - $1 WHERE id = $2 AND menge >= $1"
    )
    .bind(body.menge)
    .bind(body.lagerartikel_id)
    .execute(&state.db)
    .await?;

    if updated.rows_affected() == 0 {
        return Err(AppError::Conflict("Nicht genug Lagerbestand verfügbar".into()));
    }

    let ausgabe = sqlx::query_as::<_, Kleiderausgabe>(
        r#"
        INSERT INTO jugendfeuerwehr_kleiderausgaben
            (mitglied_id, lagerartikel_id, menge, bemerkung, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING ka.id, ka.mitglied_id, m.name as mitglied_name,
                   ka.lagerartikel_id, la.name as lagerartikel_name,
                   ka.menge, ka.ausgabedatum, ka.rueckgabedatum,
                   ka.rueckgabe_menge, ka.rueckgabe_bemerkung, ka.bemerkung,
                   ka.erstellt_von, ka.erstellt_von_name, ka.erstellt_am, ka.aktualisiert_am
        FROM jugendfeuerwehr_kleiderausgaben ka
        JOIN jugendfeuerwehr_mitglieder m ON m.id = ka.mitglied_id
        JOIN jugendfeuerwehr_lagerartikel la ON la.id = ka.lagerartikel_id
        WHERE ka.id = jugendfeuerwehr_kleiderausgaben.id
        "#,
    )
    .bind(body.mitglied_id)
    .bind(body.lagerartikel_id)
    .bind(body.menge)
    .bind(&body.bemerkung)
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("POST /api/jugendfeuerwehr/ausgaben - database error: {}", e);
        AppError::Database(e)
    })?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "KLEIDERAUSGABE_CREATED",
        Some("jugendfeuerwehr_kleiderausgaben"),
        Some(ausgabe.id),
        None,
    )
    .await;

    Ok(Json(ausgabe))
}

#[derive(Deserialize)]
pub struct CreateRueckgabe {
    pub rueckgabe_menge: i32,
    pub rueckgabedatum: Option<NaiveDate>,
    pub bemerkung: Option<String>,
    pub rueckgabe_bemerkung: Option<String>,
}

pub async fn return_ausgabe(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((_mitglied_id, ausgabe_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<CreateRueckgabe>,
) -> AppResult<Json<Kleiderausgabe>> {
    if body.rueckgabe_menge <= 0 {
        return Err(AppError::BadRequest("Rückgabemenge muss größer als 0 sein".into()));
    }

    // Hole die Ausgabe und prüfe die restliche offene Menge
    let row: (Uuid, i32, Option<i32>) = sqlx::query_as(
        r#"
        SELECT lagerartikel_id, menge, rueckgabe_menge
        FROM jugendfeuerwehr_kleiderausgaben
        WHERE id = $1
        "#
    )
    .bind(ausgabe_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    let (lagerartikel_id, ausgabe_menge, rueckgabe_menge) = row;
    let bereits_zurueck = rueckgabe_menge.unwrap_or(0);
    let offene_menge = ausgabe_menge - bereits_zurueck;

    if body.rueckgabe_menge > offene_menge {
        return Err(AppError::BadRequest(format!(
            "Rückgabemenge ({}) darf {} nicht überschreiten",
            body.rueckgabe_menge, offene_menge
        )));
    }

    // Atomare Bestandserhöhung: zurückgegebene Menge zum Lagerbestand hinzufügen
    sqlx::query("UPDATE jugendfeuerwehr_lagerartikel SET menge = menge + $1 WHERE id = $2")
        .bind(body.rueckgabe_menge)
        .bind(lagerartikel_id)
        .execute(&state.db)
        .await?;

    let neue_rueckgabe_gesamt = bereits_zurueck + body.rueckgabe_menge;
    let ist_vollzurueck = neue_rueckgabe_gesamt >= ausgabe_menge;

    let rueckgabedatum = body.rueckgabedatum.unwrap_or_else(|| chrono::Utc::today().naive_utc().date());

    let ausgabe = sqlx::query_as::<_, Kleiderausgabe>(
        r#"
        UPDATE jugendfeuerwehr_kleiderausgaben
        SET rueckgabedatum = COALESCE($1, rueckgabedatum),
            rueckgabe_menge = $2,
            rueckgabe_bemerkung = COALESCE($3, rueckgabe_bemerkung),
            bemerkung = COALESCE($4, bemerkung),
            aktualisiert_am = NOW()
        WHERE id = $5
        RETURNING ka.id, ka.mitglied_id, m.name as mitglied_name,
                   ka.lagerartikel_id, la.name as lagerartikel_name,
                   ka.menge, ka.ausgabedatum, ka.rueckgabedatum,
                   ka.rueckgabe_menge, ka.rueckgabe_bemerkung, ka.bemerkung,
                   ka.erstellt_von, ka.erstellt_von_name, ka.erstellt_am, ka.aktualisiert_am
        FROM jugendfeuerwehr_kleiderausgaben ka
        JOIN jugendfeuerwehr_mitglieder m ON m.id = ka.mitglied_id
        JOIN jugendfeuerwehr_lagerartikel la ON la.id = ka.lagerartikel_id
        WHERE ka.id = jugendfeuerwehr_kleiderausgaben.id
        "#,
    )
    .bind(rueckgabedatum)
    .bind(neue_rueckgabe_gesamt)
    .bind(&body.rueckgabe_bemerkung)
    .bind(&body.bemerkung)
    .bind(ausgabe_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    if ist_vollzurueck {
        audit::log(
            &state.db,
            Some(claims.sub),
            &claims.username,
            "KLEIDERAUSGABE_RETURNED",
            Some("jugendfeuerwehr_kleiderausgaben"),
            Some(ausgabe_id),
            None,
        )
        .await;
    }

    let _ = ist_vollzurueck; // suppress unused warning
    Ok(Json(ausgabe))
}

// ── Anwerter Routes ────────────────────────────────────────────────────────

pub async fn list_anwärter(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Anwerter>>> {
    let anwaeter = sqlx::query_as::<_, Anwerter>(
        r#"
        SELECT id, name, geburtsdatum, eintrittsdatum, geschlecht,
               adresse, telefon, email, eltern_name, eltern_telefon,
               eltern_email, bemerkung, status,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_anwerter
        WHERE status IN ('aktiv', 'aufgenommen')
        ORDER BY name ASC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(anwaeter))
}

pub async fn list_anwärter_archiviert(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Anwerter>>> {
    let anwaeter = sqlx::query_as::<_, Anwerter>(
        r#"
        SELECT id, name, geburtsdatum, eintrittsdatum, geschlecht,
               adresse, telefon, email, eltern_name, eltern_telefon,
               eltern_email, bemerkung, status,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_anwerter
        WHERE status = 'archiviert' OR status = 'abgemeldet'
        ORDER BY name ASC
        "#,
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(anwaeter))
}

pub async fn get_anwerter(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Anwerter>> {
    let anwerter = sqlx::query_as::<_, Anwerter>(
        r#"
        SELECT id, name, geburtsdatum, eintrittsdatum, geschlecht,
               adresse, telefon, email, eltern_name, eltern_telefon,
               eltern_email, bemerkung, status,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_anwerter
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    Ok(Json(anwerter))
}

pub async fn create_anwerter(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateAnwerter>,
) -> AppResult<Json<Anwerter>> {
    body.validate()?;

    let status = body.status.unwrap_or_else(|| "aktiv".to_string());

    let anwerter = sqlx::query_as::<_, Anwerter>(
        r#"
        INSERT INTO jugendfeuerwehr_anwerter
            (name, geburtsdatum, eintrittsdatum, geschlecht, adresse, telefon, email,
             eltern_name, eltern_telefon, eltern_email, bemerkung, status,
             erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        RETURNING id, name, geburtsdatum, eintrittsdatum, geschlecht,
                    adresse, telefon, email, eltern_name, eltern_telefon,
                    eltern_email, bemerkung, status,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(&body.name)
    .bind(body.geburtsdatum)
    .bind(body.eintrittsdatum)
    .bind(&body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.eltern_name)
    .bind(&body.eltern_telefon)
    .bind(&body.eltern_email)
    .bind(&body.bemerkung)
    .bind(&status)
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "ANWERTER_CREATED",
        Some("jugendfeuerwehr_anwerter"),
        Some(anwerter.id),
        None,
    )
    .await;

    Ok(Json(anwerter))
}

pub async fn update_anwerter(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateAnwerter>,
) -> AppResult<Json<Anwerter>> {
    body.validate()?;

    let anwerter = sqlx::query_as::<_, Anwerter>(
        r#"
        UPDATE jugendfeuerwehr_anwerter
        SET name = COALESCE($1, name),
            geburtsdatum = COALESCE($2, geburtsdatum),
            eintrittsdatum = COALESCE($3, eintrittsdatum),
            geschlecht = COALESCE($4, geschlecht),
            adresse = COALESCE($5, adresse),
            telefon = COALESCE($6, telefon),
            email = COALESCE($7, email),
            eltern_name = COALESCE($8, eltern_name),
            eltern_telefon = COALESCE($9, eltern_telefon),
            eltern_email = COALESCE($10, eltern_email),
            bemerkung = COALESCE($11, bemerkung),
            status = COALESCE($12, status),
            aktualisiert_am = NOW()
        WHERE id = $13
        RETURNING id, name, geburtsdatum, eintrittsdatum, geschlecht,
                    adresse, telefon, email, eltern_name, eltern_telefon,
                    eltern_email, bemerkung, status,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.name)
    .bind(body.geburtsdatum)
    .bind(body.eintrittsdatum)
    .bind(body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.eltern_name)
    .bind(&body.eltern_telefon)
    .bind(&body.eltern_email)
    .bind(&body.bemerkung)
    .bind(body.status)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "ANWERTER_UPDATED",
        Some("jugendfeuerwehr_anwerter"),
        Some(id),
        None,
    )
    .await;

    Ok(Json(anwerter))
}

pub async fn delete_anwerter(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // Anwerter archivieren statt löschen
    let result = sqlx::query(
        "UPDATE jugendfeuerwehr_anwerter SET status = 'archiviert' WHERE id = $1 AND status != 'archiviert'"
    )
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
        "ANWERTER_ARCHIVIERT",
        Some("jugendfeuerwehr_anwerter"),
        Some(id),
        None,
    )
    .await;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Anwerter archiviert" })))
}

/// Anwerter in ein Jugendmitglied umwandeln (ohne Duplikate, Dienstteilnahmen bleiben)
pub async fn promote_anwerter(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let anwerter: (String, NaiveDate, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>) = sqlx::query_as(
        r#"
        SELECT name, geburtsdatum, geschlecht, adresse, telefon, email,
               eltern_name, eltern_telefon, eltern_email, bemerkung
        FROM jugendfeuerwehr_anwerter
        WHERE id = $1
        "#
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    let (name, geburtsdatum, geschlecht, adresse, telefon, email, eltern_name, eltern_telefon, eltern_email) = anwerter;

    let result = sqlx::query(
        r#"
        INSERT INTO jugendfeuerwehr_mitglieder
            (name, geburtsdatum, eintrittsdatum, geschlecht, adresse, telefon, email,
             eltern_name, eltern_telefon, eltern_email, juleica, juleica_ablauf, bemerkung,
             archiviert, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT DO NOTHING
        "#
    )
    .bind(&name)
    .bind(geburtsdatum)
    .bind(chrono::Utc::today().naive_utc().date())
    .bind(&geschlecht)
    .bind(&adresse)
    .bind(&telefon)
    .bind(&email)
    .bind(&eltern_name)
    .bind(&eltern_telefon)
    .bind(&eltern_email)
    .bind(false)
    .bind(None::<NaiveDate>)
    .bind(None::<String>)
    .bind(false)
    .bind(claims.sub)
    .bind(&claims.username)
    .execute(&state.db)
    .await?;

    // Anwerter-Status auf "aufgenommen" setzen
    sqlx::query("UPDATE jugendfeuerwehr_anwerter SET status = 'aufgenommen' WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "ANWERTER_PROMOTED_TO_MEMBER",
        Some("jugendfeuerwehr_anwerter"),
        Some(id),
        None,
    )
    .await;

    let new_id: Option<Uuid> = if result.rows_affected() > 0 {
        Some(sqlx::query_scalar("SELECT id FROM jugendfeuerwehr_mitglieder WHERE name = $1 AND geburtsdatum = $2 ORDER BY erstellt_am DESC LIMIT 1")
            .bind(&name)
            .bind(geburtsdatum)
            .fetch_one(&state.db)
            .await
            .ok())
    } else {
        None
    };

    let _ = new_id; // suppress unused warning; the record exists with matching name+geb.

    // The Dienstteilnahmen remain untouched — only Anwerter status changes
    Ok(Json(serde_json::json!({
        "ok": true,
        "message": "Anwerter in Jugendmitglied umgewandelt",
        "existing_dienstteilnahmen_preserved": true
    })))
}

// ── Dienstteilnahmen Routes ─────────────────────────────────────────────────

pub async fn list_dienstteilnahmen(
    State(state): State<AppState>,
    Path(anwerter_id): Path<Uuid>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Dienstteilnahme>>> {
    let teilnahmen = sqlx::query_as::<_, Dienstteilnahme>(
        r#"
        SELECT dt.id, dt.anwerter_id, a.name as anwerter_name,
               dt.termin_bezeichnung, dt.datum, dt.zeit_von, dt.zeit_bis,
               dt.bemerkung, dt.bestaetigt_von_name, dt.bestaetigt_am,
               dt.status, dt.erstellt_von_name, dt.erstellt_am
        FROM jugendfeuerwehr_dienstteilnahmen dt
        JOIN jugendfeuerwehr_anwerter a ON a.id = dt.anwerter_id
        WHERE dt.anwerter_id = $1
        ORDER BY dt.datum DESC, dt.zeit_von ASC, dt.zeit_bis ASC
        "#,
    )
    .bind(anwerter_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(teilnahmen))
}

pub async fn create_dienstteilnahme(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateDienstteilnahme>,
) -> AppResult<Json<Dienstteilnahme>> {
    body.validate()?;

    let status = body.status.unwrap_or_else(|| "bestätigt".to_string());

    let teilnahme = sqlx::query_as::<_, Dienstteilnahme>(
        r#"
        INSERT INTO jugendfeuerwehr_dienstteilnahmen
            (anwerter_id, termin_bezeichnung, datum, zeit_von, zeit_bis, bemerkung, status, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING dt.id, dt.anwerter_id, a.name as anwerter_name,
                    dt.termin_bezeichnung, dt.datum, dt.zeit_von, dt.zeit_bis,
                    dt.bemerkung, dt.bestaetigt_von_name, dt.bestaetigt_am,
                    dt.status, dt.erstellt_von_name, dt.erstellt_am
        FROM jugendfeuerwehr_dienstteilnahmen dt
        JOIN jugendfeuerwehr_anwerter a ON a.id = dt.anwerter_id
        WHERE dt.id = jugendfeuerwehr_dienstteilnahmen.id
        "#,
    )
    .bind(body.anwerter_id)
    .bind(&body.termin_bezeichnung)
    .bind(body.datum)
    .bind(body.zeit_von)
    .bind(body.zeit_bis)
    .bind(&body.bemerkung)
    .bind(&status)
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "DIENSTTEILNAHME_CREATED",
        Some("jugendfeuerwehr_dienstteilnahmen"),
        Some(teilnahme.id),
        None,
    )
    .await;

    Ok(Json(teilnahme))
}

#[derive(Deserialize)]
pub struct UpdateDienstteilnahme {
    pub termin_bezeichnung: Option<String>,
    pub datum: Option<NaiveDate>,
    pub zeit_von: Option<chrono::NaiveTime>,
    pub zeit_bis: Option<chrono::NaiveTime>,
    pub bemerkung: Option<String>,
    pub status: Option<String>,
    pub bestätigen: Option<bool>,  // "bestätigen" flag to timestamp the confirmation
}

pub async fn update_dienstteilnahme(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateDienstteilnahme>,
) -> AppResult<Json<Dienstteilnahme>> {
    // Dienstteilnahmen dürfen nur von Verwaltern/Admins verändert werden
    let is_verwalter = claims.is_admin_or_above() || {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            )"
        )
        .bind("jugendfeuerwehr")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    };

    if !is_verwalter {
        return Err(AppError::Forbidden);
    }

    let teilnahme = sqlx::query_as::<_, Dienstteilnahme>(
        r#"
        UPDATE jugendfeuerwehr_dienstteilnahmen
        SET termin_bezeichnung = COALESCE($1, termin_bezeichnung),
            datum = COALESCE($2, datum),
            zeit_von = COALESCE($3, zeit_von),
            zeit_bis = COALESCE($4, zeit_bis),
            bemerkung = COALESCE($5, bemerkung),
            status = COALESCE($6, status),
            bestaetigt_von = CASE WHEN $7 THEN $8 ELSE bestaetigt_von END,
            bestaetigt_von_name = CASE WHEN $7 THEN $9 ELSE bestaetigt_von_name END,
            bestaetigt_am = CASE WHEN $7 THEN NOW() ELSE bestaetigt_am END,
            aktualisiert_am = NOW()
        WHERE id = $10
        RETURNING dt.id, dt.anwerter_id, a.name as anwerter_name,
                    dt.termin_bezeichnung, dt.datum, dt.zeit_von, dt.zeit_bis,
                    dt.bemerkung, dt.bestaetigt_von_name, dt.bestaetigt_am,
                    dt.status, dt.erstellt_von_name, dt.erstellt_am
        FROM jugendfeuerwehr_dienstteilnahmen dt
        JOIN jugendfeuerwehr_anwerter a ON a.id = dt.anwerter_id
        WHERE dt.id = jugendfeuerwehr_dienstteilnahmen.id
        "#,
    )
    .bind(body.termin_bezeichnung)
    .bind(body.datum)
    .bind(body.zeit_von)
    .bind(body.zeit_bis)
    .bind(&body.bemerkung)
    .bind(body.status)
    .bind(body.bestätigen.unwrap_or(false))
    .bind(claims.sub)
    .bind(&claims.username)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "DIENSTTEILNAHME_UPDATED",
        Some("jugendfeuerwehr_dienstteilnahmen"),
        Some(id),
        None,
    )
    .await;

    Ok(Json(teilnahme))
}

// ── Mitgliedschaftsvorgänge Routes ─────────────────────────────────────────

pub async fn list_vorgaenge(
    State(state): State<AppState>,
    Path(mitglied_id): Path<Uuid>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Mitgliedschaftsvorgang>>> {
    let vorgaenge = sqlx::query_as::<_, Mitgliedschaftsvorgang>(
        r#"
        SELECT mv.id, mv.mitglied_id, m.name as mitglied_name,
               mv.typ, mv.datum, mv.vorherischer_name, mv.neuer_name,
               mv.grund, mv.bemerkung,
               mv.erstellt_von, mv.erstellt_von_name, mv.erstellt_am
        FROM jugendfeuerwehr_mitgliedschaftsvorgaenge mv
        JOIN jugendfeuerwehr_mitglieder m ON m.id = mv.mitglied_id
        WHERE mv.mitglied_id = $1
        ORDER BY mv.datum DESC
        "#,
    )
    .bind(mitglied_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(vorgaenge))
}

pub async fn create_vorgang(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateVorgang>,
) -> AppResult<Json<Mitgliedschaftsvorgang>> {
    body.validate()?;

    let allowed_types = ["anmeldung", "abmeldung", "ummeldung"];
    if !allowed_types.contains(&body.typ.as_str()) {
        return Err(AppError::BadRequest("Typ muss 'anmeldung', 'abmeldung' oder 'ummeldung' sein".into()));
    }

    let vorgang = sqlx::query_as::<_, Mitgliedschaftsvorgang>(
        r#"
        INSERT INTO jugendfeuerwehr_mitgliedschaftsvorgaenge
            (mitglied_id, typ, datum, vorherischer_name, neuer_name, grund, bemerkung, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING mv.id, mv.mitglied_id, m.name as mitglied_name,
                    mv.typ, mv.datum, mv.vorherischer_name, mv.neuer_name,
                    mv.grund, mv.bemerkung,
                    mv.erstellt_von, mv.erstellt_von_name, mv.erstellt_am
        FROM jugendfeuerwehr_mitgliedschaftsvorgaenge mv
        JOIN jugendfeuerwehr_mitglieder m ON m.id = mv.mitglied_id
        WHERE mv.id = jugendfeuerwehr_mitgliedschaftsvorgaenge.id
        "#,
    )
    .bind(body.mitglied_id)
    .bind(&body.typ)
    .bind(body.datum)
    .bind(&body.vorherischer_name)
    .bind(&body.neuer_name)
    .bind(&body.grund)
    .bind(&body.bemerkung)
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        format!("MITGLIEDSCHAFTVORGANG_{}", body.typ.to_uppercase()),
        Some("jugendfeuerwehr_mitgliedschaftsvorgaenge"),
        Some(vorgang.id),
        None,
    )
    .await;

    Ok(Json(vorgang))
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        // Jugendmitglieder
        .route("/", get(list_jugendmitglieder).post(create_jugendmitglied))
        .route("/archiviert", get(list_jugendmitglieder_archiviert))
        .route("/:id", get(get_jugendmitglied).put(update_jugendmitglied).delete(delete_jugendmitglied))
        // Kleiderkammer
        .route("/lagerartikel", get(list_lagerartikel).post(create_lagerartikel))
        .route("/lagerartikel/:id", get(get_lagerartikel).put(update_lagerartikel).delete(delete_lagerartikel))
        .route("/ausgaben", get(list_ausgaben).post(create_ausgabe))
        .route("/ausgaben/:ausgabe_id/rueckgabe", post(return_ausgabe))
        // Anwerter
        .route("/anwaester", get(list_anwärter).post(create_anwerter))
        .route("/anwaester/archiviert", get(list_anwärter_archiviert))
        .route("/anwaester/:id", get(get_anwerter).put(update_anwerter).delete(delete_anwerter))
        .route("/anwaester/:id/promote", post(promote_anwerter))
        .route("/anwaester/:anwerter_id/dienstteilnahmen", get(list_dienstteilnahmen).post(create_dienstteilnahme))
        .route("/dienstteilnahmen/:id", put(update_dienstteilnahme))
        // Mitgliedschaftsvorgänge
        .route("/vorgaenge", post(create_vorgang))
        .route("/:mitglied_id/vorgaenge", get(list_vorgaenge))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("jugendfeuerwehr")))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("jugendfeuerwehr.lesen")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}