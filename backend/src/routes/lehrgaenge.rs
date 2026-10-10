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
pub struct Lehrgang {
    pub id: Uuid,
    pub titel: String,
    pub beschreibung: Option<String>,
    pub ort: Option<String>,
    pub start_datum: NaiveDate,
    pub end_datum: NaiveDate,
    pub anmeldeschluss: Option<NaiveDate>,
    pub max_teilnehmer: Option<i32>,
    pub status: String,
    pub lehrgangsart_id: Option<Uuid>,
    pub lehrgangsart_name: Option<String>,
    pub voraussetzung: Option<String>,
    pub voraussetzungen_erfuellt: bool,
    pub anmeldungen_count: i64,
    pub erstellt_von: Option<Uuid>,
    pub erstellt_von_name: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Anmeldung {
    pub id: Uuid,
    pub lehrgang_id: Uuid,
    pub user_id: Uuid,
    pub user_name: String,
    pub status: String,
    pub anmeldedatum: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
    pub bemerkung: Option<String>,
    pub bestaetigt_von: Option<Uuid>,
    pub bestaetigt_von_name: Option<String>,
    pub bestaetigt_am: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Deserialize, Validate)]
pub struct CreateLehrgang {
    #[validate(length(min = 1, max = 200))]
    pub titel: String,
    pub beschreibung: Option<String>,
    pub ort: Option<String>,
    pub start_datum: NaiveDate,
    pub end_datum: NaiveDate,
    pub anmeldeschluss: Option<NaiveDate>,
    pub max_teilnehmer: Option<i32>,
    pub lehrgangsart_id: Option<Uuid>,
    pub voraussetzung: Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateLehrgang {
    #[validate(length(min = 1, max = 200))]
    pub titel: Option<String>,
    pub beschreibung: Option<String>,
    pub ort: Option<String>,
    pub start_datum: Option<NaiveDate>,
    pub end_datum: Option<NaiveDate>,
    pub anmeldeschluss: Option<NaiveDate>,
    pub max_teilnehmer: Option<i32>,
    pub status: Option<String>,
    pub lehrgangsart_id: Option<Uuid>,
    pub voraussetzung: Option<String>,
    pub voraussetzungen_erfuellt: Option<bool>,
}

#[derive(Deserialize)]
pub struct CreateAnmeldung {
    pub bemerkung: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateAnmeldung {
    pub status: Option<String>,
    pub bemerkung: Option<String>,
}

#[derive(Deserialize)]
pub struct LehrgangQuery {
    pub status: Option<String>,
    pub art: Option<Uuid>,
    pub ab_datum: Option<NaiveDate>,
}

// ── Routes ────────────────────────────────────────────────────────────────────

pub async fn list_lehrgaenge(
    State(state): State<AppState>,
    Query(query): Query<LehrgangQuery>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Lehrgang>>> {
    let is_verw = is_verwalter(&state.db, &claims).await;
    let is_rdr = is_reader(&state.db, &claims).await;

    if !is_verw && !is_rdr {
        return Err(AppError::Forbidden);
    }

    let status_filter: Option<String> = if is_rdr {
        // Leser sehen nur veröffentlichte Lehrgänge (oder 'offen' als Fallback)
        Some("veröffentlicht".to_string())
    } else {
        query.status
    };

    let lehrgaenge = sqlx::query_as::<_, Lehrgang>(
        r#"
        SELECT l.id, l.titel, l.beschreibung, l.ort,
               l.start_datum, l.end_datum, l.anmeldeschluss,
               l.max_teilnehmer, l.status,
               l.lehrgangsart_id,
               la.name as lehrgangsart_name, l.voraussetzung,
               l.voraussetzungen_erfuellt,
               COALESCE((SELECT COUNT(*) FROM lehrgang_anmeldungen la WHERE la.lehrgang_id = l.id), 0) as anmeldungen_count,
               l.erstellt_von, l.erstellt_von_name, l.erstellt_am, l.aktualisiert_am
        FROM lehrgaenge l
        LEFT JOIN lehrgangsarten la ON la.id = l.lehrgangsart_id
        WHERE 1=1
          AND ($1::text IS NULL OR l.status = $1)
          AND ($2::uuid IS NULL OR l.lehrgangsart_id = $2)
          AND ($3::date IS NULL OR l.start_datum <= $3)
        ORDER BY l.start_datum ASC
        "#,
    )
    .bind(status_filter)
    .bind(query.art)
    .bind(query.ab_datum)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(lehrgaenge))
}

pub async fn get_lehrgang(
    State(state): State<AppState>,
    Path(id): Path<Uuid>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Lehrgang>> {
    let is_verw = is_verwalter(&state.db, &claims).await;
    let is_rdr = is_reader(&state.db, &claims).await;

    if !is_verw && !is_rdr {
        return Err(AppError::Forbidden);
    }

    let lehrgang = sqlx::query_as::<_, Lehrgang>(
        r#"
        SELECT l.id, l.titel, l.beschreibung, l.ort,
               l.start_datum, l.end_datum, l.anmeldeschluss,
               l.max_teilnehmer, l.status,
               l.lehrgangsart_id,
               la.name as lehrgangsart_name, l.voraussetzung,
               l.voraussetzungen_erfuellt,
               COALESCE((SELECT COUNT(*) FROM lehrgang_anmeldungen la WHERE la.lehrgang_id = l.id), 0) as anmeldungen_count,
               l.erstellt_von, l.erstellt_von_name, l.erstellt_am, l.aktualisiert_am
        FROM lehrgaenge l
        LEFT JOIN lehrgangsarten la ON la.id = l.lehrgangsart_id
        WHERE l.id = $1
          AND ($2::boolean OR l.status = 'veröffentlicht')
        "#,
    )
    .bind(id)
    .bind(is_verw)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    Ok(Json(lehrgang))
}

pub async fn create_lehrgang(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateLehrgang>,
) -> AppResult<Json<Lehrgang>> {
    tracing::info!("POST /api/lehrgaenge - creating lehrgang for user {:?}: titel={:?}, start={:?}, end={:?}, anmeldeschluss={:?}, max_teilnehmer={:?}, lehrgangsart_id={:?}",
        claims.sub, body.titel, body.start_datum, body.end_datum, body.anmeldeschluss, body.max_teilnehmer, body.lehrgangsart_id);

    // Nur Verwalter dürfen Lehrgänge erstellen
    if !is_verwalter(&state.db, &claims).await {
        tracing::warn!("Forbidden - user {:?} has no lehrgangsverwaltung.verwalten permission", claims.sub);
        return Err(AppError::Forbidden);
    }

    match body.validate() {
        Ok(()) => tracing::info!("POST /api/lehrgaenge - body validation passed"),
        Err(e) => {
            tracing::warn!("POST /api/lehrgaenge - body validation failed: {:#?}", e);
            return Err(AppError::BadRequest(e.to_string()));
        }
    }

    // Validierung: end_datum muss nach start_datum liegen
    if body.end_datum < body.start_datum {
        tracing::warn!("POST /api/lehrgaenge - invalid date range: start={} end={}", body.start_datum, body.end_datum);
        return Err(AppError::BadRequest("Enddatum muss nach Startdatum liegen".into()));
    }

    // Validierung: anmeldeschluss muss vor start_datum liegen
    if let Some(schluss) = body.anmeldeschluss {
        if schluss > body.start_datum {
            tracing::warn!("POST /api/lehrgaenge - invalid anmeldeschluss: start={} schluss={}", body.start_datum, schluss);
            return Err(AppError::BadRequest("Anmeldeschluss muss vor dem Startdatum liegen".into()));
        }
    }

    let status = "geplant".to_string();

    tracing::info!("POST /api/lehrgaenge - inserting into database");
    let lehrgang = sqlx::query_as::<_, Lehrgang>(
        r#"
        INSERT INTO lehrgaenge
            (titel, beschreibung, ort, start_datum, end_datum, anmeldeschluss,
             max_teilnehmer, status,
             lehrgangsart_id, voraussetzung, voraussetzungen_erfuellt,
             erstellt_von, erstellt_von_name)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        RETURNING
            id, titel, beschreibung, ort,
            start_datum, end_datum, anmeldeschluss,
            max_teilnehmer, status,
            lehrgangsart_id,
            (SELECT name FROM lehrgangsarten WHERE id = lehrgangsart_id) as lehrgangsart_name,
            voraussetzung, voraussetzungen_erfuellt,
            0 as anmeldungen_count,
            erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.titel)
    .bind(body.beschreibung)
    .bind(body.ort)
    .bind(body.start_datum)
    .bind(body.end_datum)
    .bind(body.anmeldeschluss)
    .bind(body.max_teilnehmer)
    .bind(status)
    .bind(body.lehrgangsart_id)
    .bind(body.voraussetzung)
    .bind(false)
    .bind(claims.sub)
    .bind(&claims.username)
    .fetch_one(&state.db)
    .await
    .map_err(|e| {
        tracing::error!("POST /api/lehrgaenge - database error: {:#?}", e);
        AppError::Database(e)
    })?;

    tracing::info!("POST /api/lehrgaenge - lehrgang created successfully, id={}", lehrgang.id);
    audit::log(&state.db, Some(claims.sub), &claims.username, "LEHRGANG_CREATED",
        Some("lehrgaenge"), Some(lehrgang.id), None).await;

    Ok(Json(lehrgang))
}

pub async fn update_lehrgang(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateLehrgang>,
) -> AppResult<Json<Lehrgang>> {
    // Prüfen ob Lehrgang existiert
    let exists: Option<i32> = sqlx::query_scalar("SELECT 1 FROM lehrgaenge WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    // Nur Verwalter dürfen Lehrgänge bearbeiten
    if !is_verwalter(&state.db, &claims).await {
        return Err(AppError::Forbidden);
    }

    // Body-Validierung (z.B. Titel-Länge)
    body.validate()?;

    // Validierung: Titel muss nicht-leer sein
    if let Some(ref t) = body.titel {
        if t.trim().is_empty() {
            return Err(AppError::BadRequest("Titel darf nicht leer sein".into()));
        }
    }

    // Validierung: end_datum muss nach start_datum liegen
    if let (Some(s), Some(e)) = (body.start_datum, body.end_datum) {
        if e < s {
            return Err(AppError::BadRequest("Enddatum muss nach Startdatum liegen".into()));
        }
    }

    // Validierung: Anmeldeschluss muss vor dem Startdatum liegen
    if let (Some(schluss), Some(s)) = (body.anmeldeschluss, body.start_datum) {
        if schluss > s {
            return Err(AppError::BadRequest("Anmeldeschluss muss vor dem Startdatum liegen".into()));
        }
    }

    let lehrgang = sqlx::query_as::<_, Lehrgang>(
        r#"
        UPDATE lehrgaenge
        SET titel = COALESCE($1, titel),
            beschreibung = COALESCE($2, beschreibung),
            ort = COALESCE($3, ort),
            start_datum = COALESCE($4, start_datum),
            end_datum = COALESCE($5, end_datum),
            anmeldeschluss = COALESCE($6, anmeldeschluss),
            max_teilnehmer = COALESCE($7, max_teilnehmer),
            status = COALESCE($8, status),
            lehrgangsart_id = COALESCE($9, lehrgangsart_id),
            voraussetzung = COALESCE($10, voraussetzung),
            voraussetzungen_erfuellt = COALESCE($11, voraussetzungen_erfuellt),
            aktualisiert_am = NOW()
        WHERE id = $12
        RETURNING
            id, titel, beschreibung, ort,
            start_datum, end_datum, anmeldeschluss,
            max_teilnehmer, status,
            lehrgangsart_id,
            (SELECT name FROM lehrgangsarten WHERE id = lehrgangsart_id) as lehrgangsart_name,
            voraussetzung, voraussetzungen_erfuellt,
            COALESCE((SELECT COUNT(*) FROM lehrgang_anmeldungen la WHERE la.lehrgang_id = lehrgaenge.id), 0) as anmeldungen_count,
            erstellt_von, erstellt_von_name, erstellt_am, aktualisiert_am
        "#,
    )
    .bind(body.titel)
    .bind(body.beschreibung)
    .bind(body.ort)
    .bind(body.start_datum)
    .bind(body.end_datum)
    .bind(body.anmeldeschluss)
    .bind(body.max_teilnehmer)
    .bind(body.status)
    .bind(body.lehrgangsart_id)
    .bind(body.voraussetzung)
    .bind(body.voraussetzungen_erfuellt)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "LEHRGANG_UPDATED",
        Some("lehrgaenge"), Some(id), None).await;

    Ok(Json(lehrgang))
}

pub async fn delete_lehrgang(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // Nur Verwalter dürfen Lehrgänge löschen
    if !is_verwalter(&state.db, &claims).await {
        return Err(AppError::Forbidden);
    }
    let result = sqlx::query("DELETE FROM lehrgaenge WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    audit::log(&state.db, Some(claims.sub), &claims.username, "LEHRGANG_DELETED",
        Some("lehrgaenge"), Some(id), None).await;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Lehrgang gelöscht" })))
}

// ── Anmeldungen ─────────────────────────────────────────────────────────────────

pub async fn list_anmeldungen(
    State(state): State<AppState>,
    Path(lehrgang_id): Path<Uuid>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Anmeldung>>> {
    // Nur Verwalter dürfen alle Registrierungen sehen
    if !is_verwalter(&state.db, &claims).await {
        return Err(AppError::Forbidden);
    }

    // Prüfen ob Lehrgang existiert und nicht abgesagt ist
    let lehrgang_exists: Option<i32> = sqlx::query_scalar(
        "SELECT 1 FROM lehrgaenge WHERE id = $1 AND status != 'abgesagt'"
    )
    .bind(lehrgang_id)
    .fetch_optional(&state.db)
    .await?;

    if lehrgang_exists.is_none() {
        return Err(AppError::NotFound);
    }

    let anmeldungen = sqlx::query_as::<_, Anmeldung>(
        r#"
        SELECT
            la.id, la.lehrgang_id, la.user_id,
            COALESCE(u.display_name, u.username) as user_name,
            la.status, la.anmeldedatum, la.aktualisiert_am,
            la.bemerkung, la.bestaetigt_von,
            COALESCE(sc.display_name, sc.username) as bestaetigt_von_name,
            la.bestaetigt_am
        FROM lehrgang_anmeldungen la
        JOIN users u ON u.id = la.user_id
        LEFT JOIN users sc ON sc.id = la.bestaetigt_von
        WHERE la.lehrgang_id = $1
        ORDER BY la.anmeldedatum ASC
        "#,
    )
    .bind(lehrgang_id)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(anmeldungen))
}

pub async fn get_anmeldungen_for_user(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Anmeldung>>> {
    let anmeldungen = sqlx::query_as::<_, Anmeldung>(
        r#"
        SELECT
            la.id, la.lehrgang_id, la.user_id,
            COALESCE(u.display_name, u.username) as user_name,
            la.status, la.anmeldedatum, la.aktualisiert_am,
            la.bemerkung, la.bestaetigt_von,
            COALESCE(sc.display_name, sc.username) as bestaetigt_von_name,
            la.bestaetigt_am
        FROM lehrgang_anmeldungen la
        JOIN users u ON u.id = la.user_id
        LEFT JOIN users sc ON sc.id = la.bestaetigt_von
        WHERE la.user_id = $1
        ORDER BY la.anmeldedatum ASC
        "#,
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(anmeldungen))
}

pub async fn create_anmeldung(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(lehrgang_id): Path<Uuid>,
    Json(body): Json<CreateAnmeldung>,
) -> AppResult<Json<Anmeldung>> {
    // Prüfen ob Lehrgang existiert
    let lehrgang_status: Option<String> = sqlx::query_scalar("SELECT status FROM lehrgaenge WHERE id = $1")
        .bind(lehrgang_id)
        .fetch_optional(&state.db)
        .await?;

    let status = match lehrgang_status {
        Some(s) => s,
        None => return Err(AppError::NotFound),
    };

    if status != "offen" && status != "geplant" && status != "veröffentlicht" {
        return Err(AppError::BadRequest("Dieser Lehrgang nimmt keine neuen Anmeldungen mehr an".into()));
    }

    // Prüfen ob User bereits angemeldet ist (und nicht abgemeldet)
    let already_anmeldet: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lehrgang_anmeldungen WHERE lehrgang_id = $1 AND user_id = $2 AND status != 'abgemeldet'"
    )
    .bind(lehrgang_id)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    if already_anmeldet > 0 {
        return Err(AppError::BadRequest("Du bist bereits für diesen Lehrgang angemeldet".into()));
    }

    // Prüfen ob max Teilnehmer erreicht
    let max_teilnehmer: Option<i32> = sqlx::query_scalar("SELECT max_teilnehmer FROM lehrgaenge WHERE id = $1")
        .bind(lehrgang_id)
        .fetch_one(&state.db)
        .await?;

    let aktuelle_anzahl: i64 = sqlx::query_scalar(
        "SELECT COUNT(*) FROM lehrgang_anmeldungen WHERE lehrgang_id = $1 AND status IN ('angemeldet', 'bestaetigt', 'teilgenommen')"
    )
    .bind(lehrgang_id)
    .fetch_one(&state.db)
    .await?;

    if let Some(max_tn) = max_teilnehmer {
        if aktuelle_anzahl >= max_tn as i64 {
            return Err(AppError::BadRequest("Der Lehrgang ist ausgebucht.".into()));
        }
    }

    let anmeldung = sqlx::query_as::<_, Anmeldung>(
        r#"
        INSERT INTO lehrgang_anmeldungen (lehrgang_id, user_id, bemerkung)
        VALUES ($1, $2, $3)
        RETURNING
            id, lehrgang_id, user_id,
            (SELECT COALESCE(display_name, username) FROM users WHERE id = user_id) as user_name,
            status, anmeldedatum, aktualisiert_am,
            bemerkung, bestaetigt_von,
            bestaetigt_von_name, bestaetigt_am
        "#,
    )
    .bind(lehrgang_id)
    .bind(claims.sub)
    .bind(body.bemerkung)
    .fetch_one(&state.db)
    .await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "ANMELDUNG_CREATED",
        Some("lehrgang_anmeldungen"), Some(anmeldung.id), None).await;

    Ok(Json(anmeldung))
}

pub async fn update_anmeldung(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((_lehrgang_id, anmeldung_id)): Path<(Uuid, Uuid)>,
    Json(body): Json<UpdateAnmeldung>,
) -> AppResult<Json<Anmeldung>> {
    // Prüfen ob User die Anmeldung ändern darf
    let user_id: Uuid = sqlx::query_scalar("SELECT user_id FROM lehrgang_anmeldungen WHERE id = $1")
        .bind(anmeldung_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let is_owner = user_id == claims.sub;
    let is_verwalter = if claims.is_admin_or_above() {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            )"
        )
        .bind("lehrgangsverwaltung.verwalten")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    // Status-Änderung nur für Verwalter
    if let Some(ref status) = body.status {
        if !is_verwalter {
            return Err(AppError::Forbidden);
        }
    }

    let anmeldung = sqlx::query_as::<_, Anmeldung>(
        r#"
        UPDATE lehrgang_anmeldungen
        SET status = COALESCE($1, status),
            bemerkung = COALESCE($2, bemerkung),
            aktualisiert_am = NOW(),
            bestaetigt_von = CASE WHEN $1 IS NOT NULL AND $1 != 'angemeldet' THEN $3 ELSE bestaetigt_von END,
            bestaetigt_von_name = CASE WHEN $1 IS NOT NULL AND $1 != 'angemeldet' THEN $4 ELSE bestaetigt_von_name END,
            bestaetigt_am = CASE WHEN $1 IS NOT NULL AND $1 != 'angemeldet' THEN NOW() ELSE bestaetigt_am END
        WHERE id = $5
        RETURNING
            id, lehrgang_id, user_id,
            (SELECT COALESCE(display_name, username) FROM users WHERE id = user_id) as user_name,
            status, anmeldedatum, aktualisiert_am,
            bemerkung, bestaetigt_von,
            bestaetigt_von_name, bestaetigt_am
        "#,
    )
    .bind(body.status)
    .bind(body.bemerkung)
    .bind(claims.sub)
    .bind(&claims.username)
    .bind(anmeldung_id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "ANMELDUNG_UPDATED",
        Some("lehrgang_anmeldungen"), Some(anmeldung_id), None).await;

    Ok(Json(anmeldung))
}

pub async fn delete_anmeldung(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path((_lehrgang_id, anmeldung_id)): Path<(Uuid, Uuid)>,
) -> AppResult<Json<serde_json::Value>> {
    // Nur der Anmender (oder Verwalter) kann eine Anmeldung löschen
    let user_id: Uuid = sqlx::query_scalar("SELECT user_id FROM lehrgang_anmeldungen WHERE id = $1")
        .bind(anmeldung_id)
        .fetch_optional(&state.db)
        .await?
        .ok_or(AppError::NotFound)?;

    let is_owner = user_id == claims.sub;
    let is_verwalter = if claims.is_admin_or_above() {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            )"
        )
        .bind("lehrgangsverwaltung.verwalten")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !is_owner && !is_verwalter {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query("UPDATE lehrgang_anmeldungen SET status = 'abgemeldet' WHERE id = $1")
        .bind(anmeldung_id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    audit::log(&state.db, Some(claims.sub), &claims.username, "ANMELDUNG_DELETED",
        Some("lehrgang_anmeldungen"), Some(anmeldung_id), None).await;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Anmeldung storniert" })))
}

// ── Lehrgangsarten ───────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Lehrgangsart {
    pub id: Uuid,
    pub name: String,
    pub beschreibung: Option<String>,
    pub veranstaltungsort: Option<String>,
    pub voraussetzung: Option<String>,
    pub erstellt_am: chrono::DateTime<chrono::Utc>,
    pub aktualisiert_am: chrono::DateTime<chrono::Utc>,
}

#[derive(Deserialize, Validate)]
pub struct CreateLehrgangsart {
    #[validate(length(min = 1, max = 200))]
    pub name: String,
    pub beschreibung: Option<String>,
    pub veranstaltungsort: Option<String>,
    pub voraussetzung: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateLehrgangsart {
    pub name: Option<String>,
    pub beschreibung: Option<String>,
    pub veranstaltungsort: Option<String>,
    pub voraussetzung: Option<String>,
}

/// Alle Lehrgangsarten auflisten
/// Öffentlich für alle authentifizierten User mit lehrgangsverwaltung Berechtigung
pub async fn list_lehrgangsarten(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Lehrgangsart>>> {
    // Prüfen ob User Zugriff auf das Lehrgangsverwaltung-Modul hat
    let has_access = if claims.is_admin_or_above() {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            )"
        )
        .bind("lehrgangsverwaltung")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !has_access {
        return Err(AppError::Forbidden);
    }

    let lehrgangsarten = sqlx::query_as::<_, Lehrgangsart>(
        "SELECT id, name, beschreibung, veranstaltungsort, voraussetzung, erstellt_am, aktualisiert_am
         FROM lehrgangsarten
         ORDER BY name ASC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(lehrgangsarten))
}

/// Neue Lehrgangsart anlegen
/// Nur für Admins oder Nutzer mit fahrzeugbuchung.verwalten permission
pub async fn create_lehrgangsart(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateLehrgangsart>,
) -> AppResult<Json<Lehrgangsart>> {
    // Nur Admins oder Nutzer mit fahrzeugbuchung.verwalten dürfen Lehrgangsarten anlegen
    let is_admin = claims.is_admin_or_above();
    let is_verwalten = if is_admin {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            )"
        )
        .bind("fahrzeugbuchung.verwalten")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !is_admin && !is_verwalten {
        return Err(AppError::Forbidden);
    }

    body.validate()?;

    let lehrgangsart = sqlx::query_as::<_, Lehrgangsart>(
        "INSERT INTO lehrgangsarten (name, beschreibung, veranstaltungsort, voraussetzung)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, beschreibung, veranstaltungsort, voraussetzung, erstellt_am, aktualisiert_am"
    )
    .bind(&body.name)
    .bind(&body.beschreibung)
    .bind(&body.veranstaltungsort)
    .bind(&body.voraussetzung)
    .fetch_one(&state.db)
    .await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "LEHRGANGSART_CREATED",
        Some("lehrgangsarten"), Some(lehrgangsart.id), None).await;

    Ok(Json(lehrgangsart))
}

/// Lehrgangsart aktualisieren
/// Nur für Admins oder Nutzer mit fahrzeugbuchung.verwalten permission
pub async fn update_lehrgangsart(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateLehrgangsart>,
) -> AppResult<Json<Lehrgangsart>> {
    // Prüfen ob Lehrgangsart existiert
    let exists: Option<i32> = sqlx::query_scalar("SELECT 1 FROM lehrgangsarten WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    // Nur Admins oder Nutzer mit fahrzeugbuchung.verwalten dürfen Lehrgangsarten aktualisieren
    let is_admin = claims.is_admin_or_above();
    let is_verwalten = if is_admin {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            )"
        )
        .bind("fahrzeugbuchung.verwalten")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !is_admin && !is_verwalten {
        return Err(AppError::Forbidden);
    }

    let lehrgangsart = sqlx::query_as::<_, Lehrgangsart>(
        "UPDATE lehrgangsarten
         SET name = COALESCE($1, name),
             beschreibung = COALESCE($2, beschreibung),
             veranstaltungsort = COALESCE($3, veranstaltungsort),
             voraussetzung = COALESCE($4, voraussetzung),
             aktualisiert_am = NOW()
         WHERE id = $5
         RETURNING id, name, beschreibung, veranstaltungsort, voraussetzung, erstellt_am, aktualisiert_am"
    )
    .bind(body.name)
    .bind(body.beschreibung)
    .bind(body.veranstaltungsort)
    .bind(body.voraussetzung)
    .bind(id)
    .fetch_one(&state.db)
    .await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "LEHRGANGSART_UPDATED",
        Some("lehrgangsarten"), Some(id), None).await;

    Ok(Json(lehrgangsart))
}

/// Lehrgangsart loeschen
/// Nur fuer Admins oder Nutzer mit fahrzeugbuchung.verwalten permission
pub async fn delete_lehrgangsart(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // Pruefen ob Lehrgangsart existiert
    let exists: Option<i32> = sqlx::query_scalar("SELECT 1 FROM lehrgangsarten WHERE id = $1")
        .bind(id)
        .fetch_optional(&state.db)
        .await?;

    if exists.is_none() {
        return Err(AppError::NotFound);
    }

    // Pruefen ob Lehrgangsart von Lehrgaengen verwendet wird
    let used_count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM lehrgaenge WHERE lehrgangsart_id = $1")
        .bind(id)
        .fetch_one(&state.db)
        .await?;

    if used_count > 0 {
        return Err(AppError::BadRequest(format!(
            "Lehrgangsart wird von {} Lehrgaengen verwendet und kann nicht geloescht werden", used_count
        )));
    }

    // Nur Admins oder Nutzer mit fahrzeugbuchung.verwalten dürfen Lehrgangsarten loeschen
    let is_admin = claims.is_admin_or_above();
    let is_verwalten = if is_admin {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
            )"
        )
        .bind("fahrzeugbuchung.verwalten")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !is_admin && !is_verwalten {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query("DELETE FROM lehrgangsarten WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    audit::log(&state.db, Some(claims.sub), &claims.username, "LEHRGANGSART_DELETED",
        Some("lehrgangsarten"), Some(id), None).await;

    Ok(Json(serde_json::json!({ "ok": true, "message": "Lehrgangsart geloescht" })))
}

// ── E-Mail-Vorlage ───────────────────────────────────────────────────────

/// Erzeugt eine E-Mail-Vorlage aus Teilnehmern mit zugewiesenem Platz (status = 'bestaetigt')
/// Nur für Lehrgangsverwaltung-Admins.
pub async fn generate_email_template(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(lehrgang_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    if !is_verwalter(&state.db, &claims).await {
        return Err(AppError::Forbidden);
    }

    // Prüfen ob Lehrgang existiert
    let lehrgang_exists: Option<i32> = sqlx::query_scalar("SELECT 1 FROM lehrgaenge WHERE id = $1")
        .bind(lehrgang_id)
        .fetch_optional(&state.db)
        .await?;

    if lehrgang_exists.is_none() {
        return Err(AppError::NotFound);
    }

    // Teilnehmer mit bestätigtem Platz holen
    let teilnehmer: Vec<TeilnehmerRow> = sqlx::query_as::<_, TeilnehmerRow>(
        r#"
        SELECT
            COALESCE(u.display_name, u.username) as user_name,
            u.username,
            la.status, la.anmeldedatum
        FROM lehrgang_anmeldungen la
        JOIN users u ON u.id = la.user_id
        WHERE la.lehrgang_id = $1
          AND la.status = 'bestaetigt'
        ORDER BY la.anmeldedatum ASC
        "#,
    )
    .bind(lehrgang_id)
    .fetch_all(&state.db)
    .await?;

    let lines: Vec<String> = teilnehmer.iter().map(|t| {
        format!("{}\t{}\t{}", t.user_name, t.username, t.anmeldedatum.format("%d.%m.%Y %H:%M"))
    }).collect();

    let csv_content = lines.join("\n");

    audit::log(&state.db, Some(claims.sub), &claims.username, "EMAIL_TEMPLATE_GENERATED",
        Some("lehrgaenge"), Some(lehrgang_id), None).await;

    Ok(Json(serde_json::json!({
        "lehrgang_id": lehrgang_id,
        "anzahl": teilnehmer.len(),
        "csv": csv_content,
        "teilnehmer": teilnehmer.iter().map(|t| serde_json::json!({
            "name": t.user_name,
            "username": t.username,
            "anmeldedatum": t.anmeldedatum.format("%d.%m.%Y %H:%M").to_string()
        })).collect::<Vec<_>>()
    })))
}

#[derive(sqlx::FromRow)]
struct TeilnehmerRow {
    user_name: String,
    username: String,
    status: String,
    anmeldedatum: chrono::DateTime<chrono::Utc>,
}

// ── Helper ────────────────────────────────────────────────────────────────────

/// Prüft ob der User Lehrgangsverwalter-Rechte hat (Admin, Superuser oder "lehrgangsverwaltung.verwalten")
async fn is_verwalter(pool: &PgPool, claims: &Claims) -> bool {
    if claims.is_admin_or_above() {
        return true;
    }
    sqlx::query_scalar::<_, bool>(
        "SELECT $1 = ANY(
            SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
            FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
            UNION
            SELECT unnest(fr.permissions)
            FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
        )"
    )
    .bind("lehrgangsverwaltung.verwalten")
    .bind(claims.sub)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

/// Prüft ob der User Leserechte für Lehrgänge hat ("lehrgangsverwaltung.lesen")
async fn is_reader(pool: &PgPool, claims: &Claims) -> bool {
    if claims.is_admin_or_above() {
        return true;
    }
    sqlx::query_scalar::<_, bool>(
        "SELECT $1 = ANY(
            SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
            FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
            UNION
            SELECT unnest(fr.permissions)
            FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
        )"
    )
    .bind("lehrgangsverwaltung.lesen")
    .bind(claims.sub)
    .fetch_one(pool)
    .await
    .unwrap_or(false)
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    // Alle Routen erfordern: eingeloggt + "lehrgangsverwaltung"-Berechtigung
    Router::new()
        .route("/",
            get(list_lehrgaenge)
            .post(create_lehrgang))
        .route("/:id",
            get(get_lehrgang)
            .put(update_lehrgang)
            .delete(delete_lehrgang))
        .route("/:lehrgang_id/anmeldungen",
            get(list_anmeldungen)
            .post(create_anmeldung))
        .route("/:lehrgang_id/anmeldungen/:anmeldung_id",
            put(update_anmeldung)
            .delete(delete_anmeldung))
        .route("/user/anmeldungen",
            get(get_anmeldungen_for_user))
        .route("/:lehrgang_id/email-template",
               get(generate_email_template))
        .route("/lehrgangsarten",
            get(list_lehrgangsarten)
            .post(create_lehrgangsart))
        .route("/lehrgangsarten/:id",
            put(update_lehrgangsart)
            .delete(delete_lehrgangsart))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("lehrgangsverwaltung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}