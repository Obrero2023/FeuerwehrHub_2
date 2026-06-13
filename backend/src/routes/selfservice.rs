use axum::{
    extract::{Path, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use validator::Validate;
use chrono::{DateTime, NaiveDate, Utc};
use serde::{Deserialize, Serialize};
use sqlx::PgPool;
use uuid::Uuid;

use crate::{
    audit,
    auth::middleware::{require_auth, Claims},
    crypto::{decrypt_or_plaintext, encrypt},
    errors::{AppError, AppResult},
    AppState,
};

// ── Structs ───────────────────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct MemberProfile {
    pub id:                      Uuid,
    pub user_id:                 Uuid,
    pub phone:                   Option<String>,
    pub email_private:           Option<String>,
    pub address:                 Option<String>,
    pub emergency_contact_name:  Option<String>,
    pub emergency_contact_phone: Option<String>,
    pub updated_at:              DateTime<Utc>,
    pub updated_by_id:           Option<Uuid>,
    pub updated_by_name:         Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct UpdateProfileBody {
    #[validate(length(max = 50))]
    pub phone:                   Option<String>,
    #[validate(length(max = 200))]
    pub email_private:           Option<String>,
    #[validate(length(max = 300))]
    pub address:                 Option<String>,
    #[validate(length(max = 200))]
    pub emergency_contact_name:  Option<String>,
    #[validate(length(max = 50))]
    pub emergency_contact_phone: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct EmergencyContact {
    pub id:           Uuid,
    pub user_id:      Uuid,
    pub name:         String,
    pub phone:        String,
    pub relationship: Option<String>,
    pub sort_order:   i32,
    pub created_at:   DateTime<Utc>,
}

#[derive(Deserialize, Validate)]
pub struct EmergencyContactBody {
    #[validate(length(min = 1, max = 200))]
    pub name:         String,
    #[validate(length(min = 1, max = 50))]
    pub phone:        String,
    #[validate(length(max = 100))]
    pub relationship: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Qualification {
    pub id:             Uuid,
    pub user_id:        Uuid,
    pub name:           String,
    pub acquired_at:    Option<NaiveDate>,
    pub expires_at:     Option<NaiveDate>,
    pub notes:          Option<String>,
    pub created_at:     DateTime<Utc>,
    pub is_health_data: bool,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct Equipment {
    pub id:          Uuid,
    pub user_id:     Uuid,
    pub r#type:      String,
    pub identifier:  Option<String>,
    pub issued_at:   Option<NaiveDate>,
    pub expires_at:  Option<NaiveDate>,
    pub notes:       Option<String>,
    pub status:      String,
    pub returned_at: Option<NaiveDate>,
    pub created_at:  DateTime<Utc>,
}

// ── Encrypt/Decrypt-Helpers ───────────────────────────────────────────────────

fn enc(val: Option<&str>, key: &str) -> Option<String> {
    val.map(|v| encrypt(v, key).unwrap_or_else(|_| v.to_string()))
}

fn dec(val: Option<String>, key: &str) -> Option<String> {
    val.map(|v| decrypt_or_plaintext(&v, key))
}

fn decrypt_profile(p: MemberProfile, key: &str) -> MemberProfile {
    MemberProfile {
        phone:                   dec(p.phone, key),
        email_private:           dec(p.email_private, key),
        address:                 dec(p.address, key),
        emergency_contact_name:  dec(p.emergency_contact_name, key),
        emergency_contact_phone: dec(p.emergency_contact_phone, key),
        ..p
    }
}

fn decrypt_contact(c: EmergencyContact, key: &str) -> EmergencyContact {
    EmergencyContact {
        name:  decrypt_or_plaintext(&c.name, key),
        phone: decrypt_or_plaintext(&c.phone, key),
        ..c
    }
}

// ── Profil lesen ──────────────────────────────────────────────────────────────

pub async fn get_profile(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<MemberProfile>> {
    let key = &state.config.encryption_key;
    let profile = sqlx::query_as::<_, MemberProfile>(
        "SELECT id, user_id, phone, email_private, address,
                emergency_contact_name, emergency_contact_phone, updated_at,
                updated_by_id, updated_by_name
         FROM member_profiles WHERE user_id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?;

    if let Some(p) = profile {
        return Ok(Json(decrypt_profile(p, key)));
    }

    // Profil noch nicht vorhanden → anlegen
    let new_profile = sqlx::query_as::<_, MemberProfile>(
        "INSERT INTO member_profiles (user_id)
         VALUES ($1)
         RETURNING id, user_id, phone, email_private, address,
                   emergency_contact_name, emergency_contact_phone, updated_at,
                   updated_by_id, updated_by_name"
    )
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(decrypt_profile(new_profile, key)))
}

// ── Profil bearbeiten ─────────────────────────────────────────────────────────

pub async fn update_profile(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<UpdateProfileBody>,
) -> AppResult<Json<MemberProfile>> {
    body.validate()?;
    let key = &state.config.encryption_key;

    let profile = sqlx::query_as::<_, MemberProfile>(
        "INSERT INTO member_profiles (user_id, phone, email_private, address,
             emergency_contact_name, emergency_contact_phone)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id) DO UPDATE SET
             phone                   = EXCLUDED.phone,
             email_private           = EXCLUDED.email_private,
             address                 = EXCLUDED.address,
             emergency_contact_name  = EXCLUDED.emergency_contact_name,
             emergency_contact_phone = EXCLUDED.emergency_contact_phone,
             updated_at              = NOW()
         RETURNING id, user_id, phone, email_private, address,
                   emergency_contact_name, emergency_contact_phone, updated_at,
                   updated_by_id, updated_by_name"
    )
    .bind(claims.sub)
    .bind(enc(body.phone.as_deref().map(str::trim).filter(|s| !s.is_empty()), key))
    .bind(enc(body.email_private.as_deref().map(str::trim).filter(|s| !s.is_empty()), key))
    .bind(enc(body.address.as_deref().map(str::trim).filter(|s| !s.is_empty()), key))
    .bind(enc(body.emergency_contact_name.as_deref().map(str::trim).filter(|s| !s.is_empty()), key))
    .bind(enc(body.emergency_contact_phone.as_deref().map(str::trim).filter(|s| !s.is_empty()), key))
    .fetch_one(&state.db)
    .await?;

    audit::log(
        &state.db, Some(claims.sub), &claims.username,
        "update_profile", Some("MemberProfile"), Some(claims.sub), None,
    ).await;

    Ok(Json(decrypt_profile(profile, key)))
}

// ── Qualifikationen lesen ─────────────────────────────────────────────────────

pub async fn get_qualifications(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Qualification>>> {
    let qualifications = sqlx::query_as::<_, Qualification>(
        "SELECT id, user_id, name, acquired_at, expires_at, notes, created_at, is_health_data
         FROM qualifications
         WHERE user_id = $1
         ORDER BY expires_at ASC NULLS LAST, name ASC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(qualifications))
}

// ── Ausrüstung lesen ──────────────────────────────────────────────────────────

pub async fn get_equipment(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Equipment>>> {
    let equipment = sqlx::query_as::<_, Equipment>(
        "SELECT id, user_id, type, identifier, issued_at, expires_at, notes,
                status, returned_at, created_at
         FROM member_equipment
         WHERE user_id = $1
         ORDER BY type ASC, created_at ASC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(equipment))
}

pub async fn return_equipment(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(eq_id): Path<Uuid>,
) -> AppResult<Json<Equipment>> {
    let eq = sqlx::query_as::<_, Equipment>(
        "UPDATE member_equipment
         SET status = 'zurückgegeben', returned_at = NOW()
         WHERE id = $1 AND user_id = $2
         RETURNING id, user_id, type, identifier, issued_at, expires_at, notes,
                   status, returned_at, created_at"
    )
    .bind(eq_id)
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    Ok(Json(eq))
}

pub async fn equipment_pdf(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(eq_id): Path<Uuid>,
) -> AppResult<axum::response::Response> {
    use axum::response::IntoResponse;
    use axum::http::header;

    let eq = sqlx::query_as::<_, Equipment>(
        "SELECT id, user_id, type, identifier, issued_at, expires_at, notes,
                status, returned_at, created_at
         FROM member_equipment
         WHERE id = $1 AND user_id = $2"
    )
    .bind(eq_id)
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Fetch user display name
    let display_name: String = sqlx::query_scalar(
        "SELECT COALESCE(display_name, username) FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .unwrap_or_else(|| claims.username.clone());

    let font_bytes = crate::pdf::load_font_bytes();
    let issued = eq.issued_at.map(|d| d.to_string()).unwrap_or_else(|| "—".into());
    let expires = eq.expires_at.map(|d| d.to_string()).unwrap_or_else(|| "—".into());
    let returned = eq.returned_at.map(|d| d.to_string()).unwrap_or_else(|| "—".into());

    let pdf_bytes = crate::pdf::PdfBuilder::new("Ausrüstungs-Ausgabebeleg")
        .heading("Ausrüstungs-Ausgabebeleg")
        .separator()
        .key_value("Mitglied", &display_name)
        .key_value("Ausrüstungstyp", &eq.r#type)
        .key_value("Kennung / Nummer", eq.identifier.as_deref().unwrap_or("—"))
        .key_value("Ausgabedatum", &issued)
        .key_value("Ablaufdatum", &expires)
        .key_value("Status", &eq.status)
        .key_value("Rückgabe", &returned)
        .key_value("Bemerkungen", eq.notes.as_deref().unwrap_or("—"))
        .build(&font_bytes)
        .map_err(|e| AppError::Internal(anyhow::anyhow!("{e}")))?;

    let filename = format!("Ausgabebeleg_{}.pdf", eq.r#type.replace(' ', "_"));
    Ok((
        [
            (header::CONTENT_TYPE, "application/pdf"),
            (header::CONTENT_DISPOSITION, &format!("attachment; filename=\"{filename}\"")),
        ],
        pdf_bytes,
    ).into_response())
}

// ── Notfallkontakte ───────────────────────────────────────────────────────────

pub async fn list_emergency_contacts(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<EmergencyContact>>> {
    let key = &state.config.encryption_key;
    let contacts = sqlx::query_as::<_, EmergencyContact>(
        "SELECT id, user_id, name, phone, relationship, sort_order, created_at
         FROM emergency_contacts
         WHERE user_id = $1
         ORDER BY sort_order ASC, created_at ASC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(contacts.into_iter().map(|c| decrypt_contact(c, key)).collect()))
}

pub async fn create_emergency_contact(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<EmergencyContactBody>,
) -> AppResult<Json<EmergencyContact>> {
    body.validate()?;
    let name = body.name.trim().to_string();
    let phone = body.phone.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name darf nicht leer sein".into()));
    }
    if phone.is_empty() {
        return Err(AppError::BadRequest("Telefon darf nicht leer sein".into()));
    }
    let key = &state.config.encryption_key;

    let contact = sqlx::query_as::<_, EmergencyContact>(
        "INSERT INTO emergency_contacts (user_id, name, phone, relationship)
         VALUES ($1, $2, $3, $4)
         RETURNING id, user_id, name, phone, relationship, sort_order, created_at"
    )
    .bind(claims.sub)
    .bind(encrypt(&name, key).unwrap_or(name.clone()))
    .bind(encrypt(&phone, key).unwrap_or(phone))
    .bind(body.relationship.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .fetch_one(&state.db)
    .await?;

    audit::log(
        &state.db, Some(claims.sub), &claims.username,
        "create_emergency_contact", Some("EmergencyContact"), Some(contact.id), None,
    ).await;

    Ok(Json(decrypt_contact(contact, key)))
}

pub async fn update_emergency_contact(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(contact_id): Path<Uuid>,
    Json(body): Json<EmergencyContactBody>,
) -> AppResult<Json<EmergencyContact>> {
    body.validate()?;
    let name = body.name.trim().to_string();
    let phone = body.phone.trim().to_string();
    if name.is_empty() {
        return Err(AppError::BadRequest("Name darf nicht leer sein".into()));
    }
    if phone.is_empty() {
        return Err(AppError::BadRequest("Telefon darf nicht leer sein".into()));
    }
    let key = &state.config.encryption_key;

    let contact = sqlx::query_as::<_, EmergencyContact>(
        "UPDATE emergency_contacts
         SET name = $1, phone = $2, relationship = $3
         WHERE id = $4 AND user_id = $5
         RETURNING id, user_id, name, phone, relationship, sort_order, created_at"
    )
    .bind(encrypt(&name, key).unwrap_or(name))
    .bind(encrypt(&phone, key).unwrap_or(phone))
    .bind(body.relationship.as_deref().map(str::trim).filter(|s| !s.is_empty()))
    .bind(contact_id)
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    audit::log(
        &state.db, Some(claims.sub), &claims.username,
        "update_emergency_contact", Some("EmergencyContact"), Some(contact.id), None,
    ).await;

    Ok(Json(decrypt_contact(contact, key)))
}

pub async fn delete_emergency_contact(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(contact_id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    let result = sqlx::query(
        "DELETE FROM emergency_contacts WHERE id = $1 AND user_id = $2"
    )
    .bind(contact_id)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    audit::log(
        &state.db, Some(claims.sub), &claims.username,
        "delete_emergency_contact", Some("EmergencyContact"), Some(contact_id), None,
    ).await;

    Ok(Json(serde_json::json!({ "message": "Notfallkontakt gelöscht" })))
}

// ── Ehrungen (read-only) ──────────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct Honor {
    pub id:         Uuid,
    pub user_id:    Uuid,
    pub name:       String,
    pub awarded_at: Option<chrono::NaiveDate>,
    pub notes:      Option<String>,
    pub status:     String,
    pub created_at: DateTime<Utc>,
}

pub async fn get_my_honors(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<Honor>>> {
    let honors = sqlx::query_as::<_, Honor>(
        "SELECT id, user_id, name, awarded_at, notes, status, created_at
         FROM honors
         WHERE user_id = $1
         ORDER BY awarded_at DESC NULLS LAST"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    Ok(Json(honors))
}

// ── Datenexport (Art. 15 DSGVO) ──────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct ExportAccount {
    username:     String,
    display_name: Option<String>,
    role:         String,
    created_at:   DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct ExportProfile {
    phone:                   Option<String>,
    email_private:           Option<String>,
    address:                 Option<String>,
    emergency_contact_name:  Option<String>,
    emergency_contact_phone: Option<String>,
    updated_at:              DateTime<Utc>,
}

#[derive(sqlx::FromRow)]
struct ExportDetails {
    date_of_birth:    Option<NaiveDate>,
    entry_date:       Option<NaiveDate>,
    exit_date:        Option<NaiveDate>,
    personnel_number: Option<String>,
    notes:            Option<String>,
}

#[derive(sqlx::FromRow)]
struct ExportContact {
    name:         String,
    phone:        String,
    relationship: Option<String>,
}

#[derive(sqlx::FromRow)]
struct ExportQualification {
    name:           String,
    acquired_at:    Option<NaiveDate>,
    expires_at:     Option<NaiveDate>,
    notes:          Option<String>,
    is_health_data: bool,
}

#[derive(sqlx::FromRow)]
struct ExportEquipment {
    r#type:     String,
    identifier: Option<String>,
    issued_at:  Option<NaiveDate>,
    expires_at: Option<NaiveDate>,
    notes:      Option<String>,
}

#[derive(sqlx::FromRow)]
struct ExportHonor {
    name:       String,
    awarded_at: Option<NaiveDate>,
    notes:      Option<String>,
    status:     String,
}

#[derive(sqlx::FromRow)]
struct ExportTimeEntry {
    check_in:  DateTime<Utc>,
    check_out: Option<DateTime<Utc>>,
    typ:       String,
    notes:     Option<String>,
}

pub async fn collect_user_export(db: &PgPool, user_id: Uuid, encryption_key: &str) -> AppResult<serde_json::Value> {
    let account = sqlx::query_as::<_, ExportAccount>(
        "SELECT username, display_name, role, created_at FROM users WHERE id = $1"
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?
    .ok_or(AppError::NotFound)?;

    let profile = sqlx::query_as::<_, ExportProfile>(
        "SELECT phone, email_private, address, emergency_contact_name, emergency_contact_phone, updated_at
         FROM member_profiles WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    let details = sqlx::query_as::<_, ExportDetails>(
        "SELECT date_of_birth, entry_date, exit_date, personnel_number, notes
         FROM member_details WHERE user_id = $1"
    )
    .bind(user_id)
    .fetch_optional(db)
    .await?;

    let emergency_contacts = sqlx::query_as::<_, ExportContact>(
        "SELECT name, phone, relationship FROM emergency_contacts WHERE user_id = $1 ORDER BY sort_order ASC"
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let qualifications = sqlx::query_as::<_, ExportQualification>(
        "SELECT name, acquired_at, expires_at, notes, is_health_data FROM qualifications WHERE user_id = $1 ORDER BY name ASC"
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let equipment = sqlx::query_as::<_, ExportEquipment>(
        "SELECT type, identifier, issued_at, expires_at, notes FROM member_equipment WHERE user_id = $1 ORDER BY type ASC"
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let honors = sqlx::query_as::<_, ExportHonor>(
        "SELECT name, awarded_at, notes, status FROM honors WHERE user_id = $1 ORDER BY awarded_at DESC NULLS LAST"
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let time_entries = sqlx::query_as::<_, ExportTimeEntry>(
        "SELECT check_in, check_out, typ, notes FROM time_entries WHERE user_id = $1 ORDER BY check_in DESC"
    )
    .bind(user_id)
    .fetch_all(db)
    .await?;

    let key = encryption_key;
    let data = serde_json::json!({
        "export_date": Utc::now().to_rfc3339(),
        "account": {
            "username":     account.username,
            "display_name": account.display_name,
            "role":         account.role,
            "created_at":   account.created_at.to_rfc3339(),
        },
        "profile": profile.as_ref().map(|p| serde_json::json!({
            "phone":                   dec(p.phone.clone(), key),
            "email_private":           dec(p.email_private.clone(), key),
            "address":                 dec(p.address.clone(), key),
            "emergency_contact_name":  dec(p.emergency_contact_name.clone(), key),
            "emergency_contact_phone": dec(p.emergency_contact_phone.clone(), key),
            "updated_at":              p.updated_at.to_rfc3339(),
        })),
        "details": details.as_ref().map(|d| serde_json::json!({
            "date_of_birth":    d.date_of_birth,
            "entry_date":       d.entry_date,
            "exit_date":        d.exit_date,
            "personnel_number": d.personnel_number,
            "notes":            d.notes,
        })),
        "emergency_contacts": emergency_contacts.iter().map(|c| serde_json::json!({
            "name":         decrypt_or_plaintext(&c.name, key),
            "phone":        decrypt_or_plaintext(&c.phone, key),
            "relationship": c.relationship,
        })).collect::<Vec<_>>(),
        "qualifications": qualifications.iter().map(|q| serde_json::json!({
            "name":           q.name,
            "acquired_at":    q.acquired_at,
            "expires_at":     q.expires_at,
            "notes":          q.notes,
            "is_health_data": q.is_health_data,
        })).collect::<Vec<_>>(),
        "equipment": equipment.iter().map(|e| serde_json::json!({
            "type":       e.r#type,
            "identifier": e.identifier,
            "issued_at":  e.issued_at,
            "expires_at": e.expires_at,
            "notes":      e.notes,
        })).collect::<Vec<_>>(),
        "honors": honors.iter().map(|h| serde_json::json!({
            "name":       h.name,
            "awarded_at": h.awarded_at,
            "notes":      h.notes,
            "status":     h.status,
        })).collect::<Vec<_>>(),
        "time_entries": time_entries.iter().map(|t| serde_json::json!({
            "check_in":  t.check_in.to_rfc3339(),
            "check_out": t.check_out.map(|dt| dt.to_rfc3339()),
            "typ":       t.typ,
            "notes":     t.notes,
        })).collect::<Vec<_>>(),
    });

    Ok(data)
}

pub async fn export_my_data(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let data = collect_user_export(&state.db, claims.sub, &state.config.encryption_key).await?;

    audit::log(
        &state.db, Some(claims.sub), &claims.username,
        "export_own_data", Some("User"), Some(claims.sub), None,
    ).await;

    Ok(Json(data))
}

// ── Router ────────────────────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/profile",                   get(get_profile).put(update_profile))
        .route("/qualifications",            get(get_qualifications))
        .route("/equipment",                 get(get_equipment))
        .route("/equipment/:id/return",     put(return_equipment))
        .route("/equipment/:id/pdf",        get(equipment_pdf))
        .route("/emergency-contacts",        get(list_emergency_contacts).post(create_emergency_contact))
        .route("/emergency-contacts/:id",    put(update_emergency_contact).delete(delete_emergency_contact))
        .route("/honors",                    get(get_my_honors))
        .route("/export",                    get(export_my_data))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}
