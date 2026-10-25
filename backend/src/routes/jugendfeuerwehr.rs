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
    pub vorname: Option<String>,
    pub nachname: Option<String>,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
    pub austrittsdatum: Option<NaiveDate>,
    pub geschlecht: String,
    pub adresse: Option<String>,
    pub telefon: Option<String>,
    pub email: Option<String>,
    pub eltern_name: Option<String>,
    pub eltern_name_2: Option<String>,
    pub eltern_telefon: Option<String>,
    pub eltern_email: Option<String>,
    pub eltern_telefon_2: Option<String>,
    pub eltern_email_2: Option<String>,
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
    pub groessen: serde_json::Value,        // JSON-Array: ["XS","S","M","L","XL"]
    pub menge_per_groesse: serde_json::Value, // JSON-Object: {"XS":5,"S":10,"M":8}
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
    pub groessen: Option<serde_json::Value>,       // JSON-Array von Größen
    pub menge_per_groesse: Option<serde_json::Value>, // JSON-Object Mengen pro Größe
    pub einheit: Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateLagerartikel {
    #[validate(length(min = 1, max = 200))]
    pub name: Option<String>,
    pub beschreibung: Option<String>,
    pub groessen: Option<serde_json::Value>,
    pub menge_per_groesse: Option<serde_json::Value>,
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
    pub groesse: Option<String>,
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
    pub groesse: Option<String>,
    pub bemerkung: Option<String>,
}

// ── Anwerter Structs ────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Anwerter {
    pub id: Uuid,
    pub name: String,
    pub vorname: Option<String>,
    pub nachname: Option<String>,
    pub plz: Option<String>,
    pub ort: Option<String>,
    pub ortsteil: Option<String>,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
    pub geschlecht: String,
    pub adresse: Option<String>,
    pub telefon: Option<String>,
    pub email: Option<String>,
    pub eltern_name: Option<String>,
    pub eltern_vorname: Option<String>,
    pub eltern_nachname: Option<String>,
    pub eltern_telefonnummer: Option<String>,
    pub eltern_email: Option<String>,
    pub bemerkung: Option<String>,
    pub status: String,
    pub alter_jahre: i32,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
    pub erstkontakt: Option<NaiveDate>,
}

#[derive(Deserialize, Validate)]
pub struct CreateAnwerter {
    #[validate(length(min = 1, max = 200))]
    pub vorname: String,
    #[validate(length(min = 1, max = 200))]
    pub nachname: String,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
    pub geschlecht: String,
    pub adresse: Option<String>,
    #[validate(length(max = 50))]
    pub telefon: Option<String>,
    #[validate(length(max = 200))]
    pub email: Option<String>,
    #[validate(length(max = 50))]
    pub plz: Option<String>,
    #[validate(length(max = 100))]
    pub ort: Option<String>,
    #[validate(length(max = 100))]
    pub ortsteil: Option<String>,
    pub eltern_vorname: Option<String>,
    pub eltern_nachname: Option<String>,
    #[validate(length(max = 50))]
    pub eltern_telefonnummer: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email: Option<String>,
    pub bemerkung: Option<String>,
    pub status: Option<String>,
    pub erstkontakt: Option<NaiveDate>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateAnwerter {
    pub vorname: Option<String>,
    pub nachname: Option<String>,
    pub plz: Option<String>,
    pub ort: Option<String>,
    pub ortsteil: Option<String>,
    pub geburtsdatum: Option<NaiveDate>,
    pub eintrittsdatum: Option<NaiveDate>,
    #[validate(length(min = 1, max = 20))]
    pub geschlecht: Option<String>,
    pub adresse: Option<String>,
    #[validate(length(max = 50))]
    pub telefon: Option<String>,
    #[validate(length(max = 200))]
    pub email: Option<String>,
    pub eltern_vorname: Option<String>,
    pub eltern_nachname: Option<String>,
    #[validate(length(max = 50))]
    pub eltern_telefonnummer: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email: Option<String>,
    pub bemerkung: Option<String>,
    pub status: Option<String>,
    pub erstkontakt: Option<NaiveDate>,
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
    pub vorname: String,
    #[validate(length(min = 1, max = 200))]
    pub nachname: String,
    pub user_id: Option<Uuid>,
    pub geburtsdatum: NaiveDate,
    pub eintrittsdatum: NaiveDate,
    pub austrittsdatum: Option<NaiveDate>,
    #[validate(length(min = 1, max = 20))]
    pub geschlecht: String,
    #[validate(length(min = 1, max = 200))]
    pub adresse: String,
    #[validate(length(max = 50))]
    pub telefon: Option<String>,
    #[validate(length(max = 200))]
    pub email: Option<String>,
    pub eltern_name: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_name_2: Option<String>,
    #[validate(length(max = 50))]
    pub eltern_telefon: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email: Option<String>,
    #[validate(length(max = 50))]
    pub eltern_telefon_2: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email_2: Option<String>,
    pub juleica: Option<bool>,
    pub juleica_ablauf: Option<NaiveDate>,
    pub bemerkung: Option<String>,
    pub archiviert: Option<bool>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateJugendmitglied {
    #[validate(length(min = 1, max = 200))]
    pub vorname: Option<String>,
    #[validate(length(min = 1, max = 200))]
    pub nachname: Option<String>,
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
    pub eltern_name_2: Option<String>,
    #[validate(length(max = 50))]
    pub eltern_telefon: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email: Option<String>,
    #[validate(length(max = 50))]
    pub eltern_telefon_2: Option<String>,
    #[validate(length(max = 200))]
    pub eltern_email_2: Option<String>,
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
        SELECT id, user_id, name, vorname, nachname, geburtsdatum, eintrittsdatum, austrittsdatum,
               geschlecht, adresse, telefon, email, eltern_name, eltern_name_2,
               eltern_telefon, eltern_email, eltern_telefon_2, eltern_email_2, juleica, juleica_ablauf, bemerkung, archiviert,
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
        SELECT id, user_id, name, vorname, nachname, geburtsdatum, eintrittsdatum, austrittsdatum,
               geschlecht, adresse, telefon, email, eltern_name, eltern_name_2,
               eltern_telefon, eltern_email, eltern_telefon_2, eltern_email_2, juleica, juleica_ablauf, bemerkung, archiviert,
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
        SELECT id, user_id, name, vorname, nachname, geburtsdatum, eintrittsdatum, austrittsdatum,
               geschlecht, adresse, telefon, email, eltern_name, eltern_name_2,
               eltern_telefon, eltern_email, eltern_telefon_2, eltern_email_2, juleica, juleica_ablauf, bemerkung, archiviert,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        FROM jugendfeuerwehr_mitglieder
        WHERE id = $1
        "#,
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("GET /api/jugendfeuerwehr/{id} - database error: {e}");
        AppError::Database(e)
    })?
    .ok_or(AppError::NotFound)?;

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
            (user_id, vorname, nachname, geburtsdatum, eintrittsdatum, austrittsdatum,
             geschlecht, adresse, telefon, email, eltern_name, eltern_name_2,
             eltern_telefon, eltern_email, eltern_telefon_2, eltern_email_2, juleica, juleica_ablauf, bemerkung, archiviert,
             erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22)
        RETURNING id, user_id, name, vorname, nachname, geburtsdatum, eintrittsdatum, austrittsdatum,
                    geschlecht, adresse, telefon, email, eltern_name, eltern_name_2,
                    eltern_telefon, eltern_email, eltern_telefon_2, eltern_email_2, juleica, juleica_ablauf, bemerkung, archiviert,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.user_id)
    .bind(&body.vorname)
    .bind(&body.nachname)
    .bind(body.geburtsdatum)
    .bind(body.eintrittsdatum)
    .bind(body.austrittsdatum)
    .bind(&body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.eltern_name)
    .bind(&body.eltern_name_2)
    .bind(&body.eltern_telefon)
    .bind(&body.eltern_email)
    .bind(&body.eltern_telefon_2)
    .bind(&body.eltern_email_2)
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
        SET vorname = COALESCE($1, vorname),
            nachname = COALESCE($2, nachname),
            user_id = COALESCE($3, user_id),
            geburtsdatum = COALESCE($4, geburtsdatum),
            eintrittsdatum = COALESCE($5, eintrittsdatum),
            austrittsdatum = COALESCE($6, austrittsdatum),
            geschlecht = COALESCE($7, geschlecht),
            adresse = COALESCE($8, adresse),
            telefon = COALESCE($9, telefon),
            email = COALESCE($10, email),
            eltern_name = COALESCE($11, eltern_name),
            eltern_name_2 = COALESCE($12, eltern_name_2),
            eltern_telefon = COALESCE($13, eltern_telefon),
            eltern_email = COALESCE($14, eltern_email),
            eltern_telefon_2 = COALESCE($15, eltern_telefon_2),
            eltern_email_2 = COALESCE($16, eltern_email_2),
            juleica = COALESCE($17, juleica),
            juleica_ablauf = COALESCE($18, juleica_ablauf),
            bemerkung = COALESCE($19, bemerkung),
            archiviert = COALESCE($20, archiviert),
            aktualisiert_am = NOW()
        WHERE id = $21
        RETURNING id, user_id, name, vorname, nachname, geburtsdatum, eintrittsdatum, austrittsdatum,
                    geschlecht, adresse, telefon, email, eltern_name, eltern_name_2,
                    eltern_telefon, eltern_email, eltern_telefon_2, eltern_email_2, juleica, juleica_ablauf, bemerkung, archiviert,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.vorname)
    .bind(body.nachname)
    .bind(body.user_id)
    .bind(body.geburtsdatum)
    .bind(body.eintrittsdatum)
    .bind(body.austrittsdatum)
    .bind(body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.eltern_name)
    .bind(&body.eltern_name_2)
    .bind(&body.eltern_telefon)
    .bind(&body.eltern_email)
    .bind(&body.eltern_telefon_2)
    .bind(&body.eltern_email_2)
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
        SELECT id, name, beschreibung, menge, groessen, menge_per_groesse, einheit,
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
        SELECT id, name, beschreibung, menge, groessen, menge_per_groesse, einheit,
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

    let groessen = body.groessen.clone().unwrap_or_else(|| serde_json::json!([]));
    let menge_per_groesse = body.menge_per_groesse.clone().unwrap_or_else(|| serde_json::json!({}));

    let item = sqlx::query_as::<_, Lagerartikel>(
        r#"
        INSERT INTO jugendfeuerwehr_lagerartikel
            (name, beschreibung, groessen, menge_per_groesse, einheit, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id, name, beschreibung, menge, groessen, menge_per_groesse, einheit,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(&body.name)
    .bind(&body.beschreibung)
    .bind(&groessen)
    .bind(&menge_per_groesse)
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
            groessen = COALESCE($3, groessen),
            menge_per_groesse = COALESCE($4, menge_per_groesse),
            einheit = COALESCE($5, einheit),
            aktualisiert_am = NOW()
        WHERE id = $6
        RETURNING id, name, beschreibung, menge, groessen, menge_per_groesse, einheit,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.name)
    .bind(&body.beschreibung)
    .bind(&body.groessen)
    .bind(&body.menge_per_groesse)
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

#[derive(Deserialize)]
pub struct UpdateLagerartikelStock {
    pub size: String,
    pub delta: i32,
}

pub async fn update_lagerartikel_stock(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateLagerartikelStock>,
) -> AppResult<Json<Lagerartikel>> {
    let result = sqlx::query_as::<_, Lagerartikel>(
        r#"
        UPDATE jugendfeuerwehr_lagerartikel
        SET menge_per_groesse = jsonb_set(
            menge_per_groesse,
            ARRAY[$1],
            ((COALESCE((menge_per_groesse ->> $1)::integer, 0) + $2))::text::jsonb,
            true
        )
        WHERE id = $3
          AND COALESCE((menge_per_groesse ->> $1)::integer, 0) + $2 >= 0
        RETURNING id, name, beschreibung, menge, groessen, menge_per_groesse, einheit,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(&body.size)
    .bind(body.delta)
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("PATCH /api/jugendfeuerwehr/lagerartikel/{}/stock - database error: {}", id, e);
        AppError::Conflict("Bestand kann nicht negativ sein oder Artikel/Größe nicht gefunden".into())
    })?;

    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        "LAGERARTIKEL_STOCK_ADJUSTED",
        Some("jugendfeuerwehr_lagerartikel"),
        Some(result.id),
        Some(&format!("{{\"size\":\"{}\",\"delta\":{}}}", body.size, body.delta)),
    )
    .await;

    Ok(Json(result))
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
    // Falls Größe angegeben: menge_per_groesse prüfen
    let groesse = body.groesse.clone();
    let updated_rows = if let Some(ref g) = groesse {
        // Prüfen ob genug in dieser Größe vorhanden
        let row: (i32,) = sqlx::query_as(
            r#"
            SELECT COALESCE((menge_per_groesse ->> $1)::integer, 0) as menge_groesse
            FROM jugendfeuerwehr_lagerartikel WHERE id = $2
            "#
        )
        .bind(g)
        .bind(body.lagerartikel_id)
        .fetch_one(&state.db)
        .await
        .map_err(|_| AppError::NotFound)?;

        if row.0 < body.menge {
            return Err(AppError::Conflict("Nicht genug Lagerbestand in dieser Größe verfügbar".into()));
        }

        // Atomare Reduktion pro Größe
        let updated = sqlx::query(
            r#"
            UPDATE jugendfeuerwehr_lagerartikel
            SET menge = menge - $1,
                menge_per_groesse = jsonb_set(menge_per_groesse, '{$2}', to_jsonb(COALESCE((menge_per_groesse ->> $2)::integer, 0) - $1))
            WHERE id = $3 AND menge >= $1 AND COALESCE((menge_per_groesse ->> $2)::integer, 0) >= $1
            "#
        )
        .bind(body.menge)
        .bind(g)
        .bind(body.lagerartikel_id)
        .execute(&state.db)
        .await?;

        updated.rows_affected()
    } else {
        // Ohne Größe: Gesamtmenge prüfen
        let updated = sqlx::query(
            "UPDATE jugendfeuerwehr_lagerartikel SET menge = menge - $1 WHERE id = $2 AND menge >= $1"
        )
        .bind(body.menge)
        .bind(body.lagerartikel_id)
        .execute(&state.db)
        .await?;

        updated.rows_affected()
    };

    if updated_rows == 0 {
        return Err(AppError::Conflict("Nicht genug Lagerbestand verfügbar".into()));
    }

    let ausgabe_id: Uuid = sqlx::query_scalar(
        r#"
        INSERT INTO jugendfeuerwehr_kleiderausgaben
            (mitglied_id, lagerartikel_id, menge, groesse, bemerkung, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id
        "#,
    )
    .bind(body.mitglied_id)
    .bind(body.lagerartikel_id)
    .bind(body.menge)
    .bind(&body.groesse)
    .bind(&body.bemerkung)
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("POST /api/jugendfeuerwehr/ausgaben - database error: {}", e);
        AppError::Database(e)
    })?;

    let ausgabe = sqlx::query_as::<_, Kleiderausgabe>(
        r#"
        SELECT ka.id, ka.mitglied_id, m.name as mitglied_name,
               ka.lagerartikel_id, la.name as lagerartikel_name,
               ka.menge, ka.groesse, ka.ausgabedatum, ka.rueckgabedatum,
               ka.rueckgabe_menge, ka.rueckgabe_bemerkung, ka.bemerkung,
               ka.erstellt_von, ka.erstellt_von_name, ka.erstellt_am, ka.aktualisiert_am
        FROM jugendfeuerwehr_kleiderausgaben ka
        JOIN jugendfeuerwehr_mitglieder m ON m.id = ka.mitglied_id
        JOIN jugendfeuerwehr_lagerartikel la ON la.id = ka.lagerartikel_id
        WHERE ka.id = $1
        "#,
    )
    .bind(ausgabe_id)
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
    Path(ausgabe_id): Path<Uuid>,
    Json(body): Json<CreateRueckgabe>,
) -> AppResult<Json<Kleiderausgabe>> {
    if body.rueckgabe_menge <= 0 {
        return Err(AppError::BadRequest("Rückgabemenge muss größer als 0 sein".into()));
    }

    let mut tx = state.db.begin().await.map_err(|e| AppError::Internal(e.into()))?;

    // SELECT ... FOR UPDATE sperrt die Zeile gegen gleichzeitige Bearbeitung
    let row: (Uuid, i32, Option<i32>) = sqlx::query_as(
        r#"
        SELECT lagerartikel_id, menge, rueckgabe_menge
        FROM jugendfeuerwehr_kleiderausgaben
        WHERE id = $1
        FOR UPDATE
        "#
    )
    .bind(ausgabe_id)
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| AppError::NotFound)?;

    let (lagerartikel_id, ausgabe_menge, rueckgabe_menge) = row;
    let bereits_zurueck = rueckgabe_menge.unwrap_or(0);
    let offene_menge = ausgabe_menge - bereits_zurueck;

    if body.rueckgabe_menge > offene_menge {
        tx.rollback().await.ok();
        return Err(AppError::BadRequest(format!(
            "Rückgabemenge ({}) darf {} nicht überschreiten",
            body.rueckgabe_menge, offene_menge
        )));
    }

    // Atomare Bestandserhöhung innerhalb der Transaktion
    sqlx::query("UPDATE jugendfeuerwehr_lagerartikel SET menge = menge + $1 WHERE id = $2")
        .bind(body.rueckgabe_menge)
        .bind(lagerartikel_id)
        .execute(&mut *tx)
        .await?;

    let neue_rueckgabe_gesamt = bereits_zurueck + body.rueckgabe_menge;
    let ist_vollzurueck = neue_rueckgabe_gesamt >= ausgabe_menge;
    let rueckgabedatum = body.rueckgabedatum.unwrap_or_else(|| chrono::Utc::now().date_naive());

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
    .fetch_one(&mut *tx)
    .await
    .map_err(|_| AppError::NotFound)?;

    tx.commit().await.map_err(|e| AppError::Internal(e.into()))?;

    // Audit-Log: sowohl bei voller als auch bei teilweiser Rückgabe
    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        if ist_vollzurueck { "KLEIDERAUSGABE_RETURNED" } else { "KLEIDERAUSGABE_PARTIAL_RETURN" },
        Some("jugendfeuerwehr_kleiderausgaben"),
        Some(ausgabe_id),
        None,
    )
    .await;

    Ok(Json(ausgabe))
}

// ── Anwerter Routes ────────────────────────────────────────────────────────

pub async fn list_anwärter(
    State(state): State<AppState>,
    Extension(_claims): Extension<Claims>,
) -> AppResult<Json<Vec<Anwerter>>> {
    let anwaeter = sqlx::query_as::<_, Anwerter>(
        r#"
        SELECT id, name, vorname, nachname, plz, ort, ortsteil,
               geburtsdatum, eintrittsdatum, geschlecht,
               adresse, telefon, email,
               eltern_name, eltern_vorname, eltern_nachname, eltern_telefonnummer, eltern_email,
               bemerkung, status,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am, erstkontakt
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
        SELECT id, name, vorname, nachname, plz, ort, ortsteil,
               geburtsdatum, eintrittsdatum, geschlecht,
               adresse, telefon, email,
               eltern_name, eltern_vorname, eltern_nachname, eltern_telefonnummer, eltern_email,
               bemerkung, status,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am, erstkontakt
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
        SELECT id, name, vorname, nachname, plz, ort, ortsteil,
               geburtsdatum, eintrittsdatum, geschlecht,
               adresse, telefon, email,
               eltern_name, eltern_vorname, eltern_nachname, eltern_telefonnummer, eltern_email,
               bemerkung, status,
               EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
               erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am, erstkontakt
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
    let erstkontakt = body.erstkontakt.unwrap_or_else(|| chrono::Utc::now().date_naive());

    let anwerter = sqlx::query_as::<_, Anwerter>(
        r#"
        INSERT INTO jugendfeuerwehr_anwerter
            (vorname, nachname, geburtsdatum, eintrittsdatum, geschlecht, adresse, telefon, email,
             plz, ort, ortsteil,
             eltern_vorname, eltern_nachname, eltern_telefonnummer, eltern_email, bemerkung, status, erstkontakt,
             erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        RETURNING id, name, vorname, nachname, plz, ort, ortsteil,
                    geburtsdatum, eintrittsdatum, geschlecht,
                    adresse, telefon, email,
                    eltern_name, eltern_vorname, eltern_nachname, eltern_telefonnummer, eltern_email,
                    bemerkung, status,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am, erstkontakt
        "#,
    )
    .bind(&body.vorname)
    .bind(&body.nachname)
    .bind(body.geburtsdatum)
    .bind(body.eintrittsdatum)
    .bind(&body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.plz)
    .bind(&body.ort)
    .bind(&body.ortsteil)
    .bind(&body.eltern_vorname)
    .bind(&body.eltern_nachname)
    .bind(&body.eltern_telefonnummer)
    .bind(&body.eltern_email)
    .bind(&body.bemerkung)
    .bind(&status)
    .bind(erstkontakt)
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

    let status = body.status.clone().unwrap_or_else(|| "aktiv".to_string());
    let erstkontakt = body.erstkontakt.unwrap_or_else(|| chrono::Utc::now().date_naive());

    let anwerter = sqlx::query_as::<_, Anwerter>(
        r#"
        UPDATE jugendfeuerwehr_anwerter
        SET name = trim(coalesce($1, '') || ' ' || coalesce($2, '')),
            vorname = COALESCE($1, vorname),
            nachname = COALESCE($2, nachname),
            plz = COALESCE($3, plz),
            ort = COALESCE($4, ort),
            ortsteil = COALESCE($5, ortsteil),
            geburtsdatum = COALESCE($6, geburtsdatum),
            eintrittsdatum = COALESCE($7, eintrittsdatum),
            geschlecht = COALESCE($8, geschlecht),
            adresse = COALESCE($9, adresse),
            telefon = COALESCE($10, telefon),
            email = COALESCE($11, email),
            eltern_vorname = COALESCE($12, eltern_vorname),
            eltern_nachname = COALESCE($13, eltern_nachname),
            eltern_telefonnummer = COALESCE($14, eltern_telefonnummer),
            eltern_email = COALESCE($15, eltern_email),
            bemerkung = COALESCE($16, bemerkung),
            status = COALESCE($17, status),
            erstkontakt = COALESCE($18, erstkontakt),
            aktualisiert_am = NOW()
        WHERE id = $19
        RETURNING id, name, vorname, nachname, plz, ort, ortsteil,
                    geburtsdatum, eintrittsdatum, geschlecht,
                    adresse, telefon, email,
                    eltern_name, eltern_vorname, eltern_nachname, eltern_telefonnummer, eltern_email,
                    bemerkung, status,
                    EXTRACT(YEAR FROM AGE(CURRENT_DATE, geburtsdatum))::INTEGER as alter_jahre,
                    erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am, erstkontakt
        "#,
    )
    .bind(&body.vorname)
    .bind(&body.nachname)
    .bind(&body.plz)
    .bind(&body.ort)
    .bind(&body.ortsteil)
    .bind(&body.geburtsdatum)
    .bind(&body.eintrittsdatum)
    .bind(&body.geschlecht)
    .bind(&body.adresse)
    .bind(&body.telefon)
    .bind(&body.email)
    .bind(&body.eltern_vorname)
    .bind(&body.eltern_nachname)
    .bind(&body.eltern_telefonnummer)
    .bind(&body.eltern_email)
    .bind(&body.bemerkung)
    .bind(&body.status)
    .bind(&body.erstkontakt)
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
               eltern_name, eltern_telefon, eltern_email
        FROM jugendfeuerwehr_anwerter
        WHERE id = $1
        "#
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    let (anwerter_name, geburtsdatum, geschlecht, adresse, telefon, email, eltern_name, eltern_telefon, eltern_email) = anwerter;

    // Name in Vorname und Nachname aufteilen (erstes Wort = Vorname, Rest = Nachname)
    let parts: Vec<&str> = anwerter_name.splitn(2, ' ').collect();
    let vorname = parts.first().copied().unwrap_or("");
    let nachname = parts.get(1).copied().unwrap_or("");

    let result = sqlx::query(
        r#"
        INSERT INTO jugendfeuerwehr_mitglieder
            (vorname, nachname, geburtsdatum, eintrittsdatum, geschlecht, adresse, telefon, email,
             eltern_name, eltern_name_2, eltern_telefon, eltern_email, eltern_telefon_2, eltern_email_2, juleica, juleica_ablauf, bemerkung,
             archiviert, erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20)
        "#
    )
    .bind(&vorname)
    .bind(&nachname)
    .bind(chrono::Utc::now().date_naive())
    .bind(&geschlecht)
    .bind(&adresse)
    .bind(&telefon)
    .bind(&email)
    .bind(&eltern_name)
    .bind(None::<String>)
    .bind(&eltern_telefon)
    .bind(&eltern_email)
    .bind(None::<String>)
    .bind(None::<String>)
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
        sqlx::query_scalar("SELECT id FROM jugendfeuerwehr_mitglieder WHERE vorname = $1 AND nachname = $2 AND geburtsdatum = $3 ORDER BY erstellt_am DESC LIMIT 1")
            .bind(&vorname)
            .bind(&nachname)
            .bind(geburtsdatum)
            .fetch_one(&state.db)
            .await
            .ok()
    } else {
        None
    };

    let _ = new_id; // suppress unused warning; the record exists with matching vorname+nachname+geburtsdatum.

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

    let event_name = format!("MITGLIEDSCHAFTVORGANG_{}", body.typ.to_uppercase());
    audit::log(
        &state.db,
        Some(claims.sub),
        &claims.username,
        &event_name,
        Some("jugendfeuerwehr_mitgliedschaftsvorgaenge"),
        Some(vorgang.id),
        None,
    )
    .await;

    Ok(Json(vorgang))
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    // Jugendmitglieder: Lesen → jugendfeuerwehr.lesen, Schreiben → jugendfeuerwehr.mitglieder
    let mitglieder = Router::new()
        .route("/", get(list_jugendmitglieder).post(create_jugendmitglied))
        .route("/archiviert", get(list_jugendmitglieder_archiviert))
        .route("/:id", get(get_jugendmitglied).put(update_jugendmitglied).delete(delete_jugendmitglied))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("jugendfeuerwehr.lesen")))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    // Kleiderkammer: Lesen → jugendfeuerwehr.kleiderkammer.lesen, Schreiben → jugendfeuerwehr.kleiderkammer
    let kleiderkammer = Router::new()
        .route("/lagerartikel", get(list_lagerartikel).post(create_lagerartikel))
        .route("/lagerartikel/:id", get(get_lagerartikel).put(update_lagerartikel).patch(update_lagerartikel_stock).delete(delete_lagerartikel))
        .route("/ausgaben", get(list_ausgaben).post(create_ausgabe))
        .route("/ausgaben/:ausgabe_id/rueckgabe", post(return_ausgabe))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("jugendfeuerwehr.kleiderkammer.lesen")))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    // Anwerter: Lesen → jugendfeuerwehr.lesen, Anlegen → jugendfeuerwehr.anwerter,
    //          Bearbeiten/Archivieren/Promote → jugendfeuerwehr (Verwalter)
    //          Dienstteilnahmen ergänzen → jugendfeuerwehr.dienstteilnahmen
    let anwerter = Router::new()
        .route("/anwaester", get(list_anwärter).post(create_anwerter))
        .route("/anwaester/archiviert", get(list_anwärter_archiviert))
        .route("/anwaester/:id", get(get_anwerter).put(update_anwerter).delete(delete_anwerter))
        .route("/anwaester/:id/promote", post(promote_anwerter))
        .route("/anwaester/:anwerter_id/dienstteilnahmen", get(list_dienstteilnahmen).post(create_dienstteilnahme))
        .route("/dienstteilnahmen/:id", put(update_dienstteilnahme))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("jugendfeuerwehr.anwerter")))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    // Mitgliedschaftsvorgänge: Lesen → jugendfeuerwehr.lesen, Erfassen → jugendfeuerwehr.mitgliedschaftsvorgaenge
    let vorgaenge = Router::new()
        .route("/vorgaenge", post(create_vorgang))
        .route("/:mitglied_id/vorgaenge", get(list_vorgaenge))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("jugendfeuerwehr.lesen")))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_auth));

    Router::new()
        .merge(mitglieder)
        .merge(kleiderkammer)
        .merge(anwerter)
        .merge(vorgaenge)
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}