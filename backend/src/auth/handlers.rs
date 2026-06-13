use axum::{extract::State, http::{header, HeaderMap, HeaderValue}, Extension, Json};
use bcrypt::{hash, verify, DEFAULT_COST};
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use serde::{Deserialize, Serialize};
use std::sync::OnceLock;
use uuid::Uuid;
use validator::Validate;

static DUMMY_HASH: OnceLock<String> = OnceLock::new();

fn dummy_hash() -> &'static str {
    DUMMY_HASH.get_or_init(|| {
        hash("timing_equalizer_never_matches", DEFAULT_COST).unwrap()
    })
}

pub(crate) fn validate_password(password: &str) -> Result<(), crate::errors::AppError> {
    use crate::errors::AppError;
    if password.len() < 16 {
        return Err(AppError::BadRequest("Passwort muss mindestens 16 Zeichen haben".into()));
    }
    if !password.chars().any(|c| c.is_uppercase()) {
        return Err(AppError::BadRequest("Passwort muss mindestens einen Großbuchstaben enthalten".into()));
    }
    if !password.chars().any(|c| c.is_lowercase()) {
        return Err(AppError::BadRequest("Passwort muss mindestens einen Kleinbuchstaben enthalten".into()));
    }
    if !password.chars().any(|c| c.is_ascii_digit() || !c.is_alphanumeric()) {
        return Err(AppError::BadRequest("Passwort muss mindestens eine Zahl oder ein Sonderzeichen enthalten".into()));
    }
    Ok(())
}

use crate::{
    audit,
    auth::{middleware::Claims, totp},
    crypto,
    errors::{AppError, AppResult},
    AppState,
};

// ── Login ────────────────────────────────────────────────────────────────────

#[derive(Deserialize, Validate)]
pub struct LoginRequest {
    #[validate(length(min = 1, max = 100))]
    pub username: String,
    #[validate(length(min = 1, max = 200))]
    pub password: String,
}

#[derive(Serialize)]
pub struct LoginResponse {
    pub requires_totp: bool,
    pub totp_setup_required: bool,
}

#[derive(sqlx::FromRow)]
struct LoginUserRow {
    id: Uuid,
    username: String,
    password_hash: String,
    totp_secret: Option<String>,
    totp_enabled: bool,
    is_admin: bool,
    role: String,
    failed_login_attempts: i32,
    locked_until: Option<chrono::DateTime<Utc>>,
    token_version: i32,
}

fn build_session_cookie(token: &str, config: &crate::config::Config) -> String {
    let secure = if config.frontend_url.starts_with("https") { "; Secure" } else { "" };
    let max_age = config.jwt_expiry_hours * 3600;
    format!("ff_session={token}; HttpOnly; SameSite=Strict; Path=/api; Max-Age={max_age}{secure}")
}

fn session_headers(token: &str, config: &crate::config::Config) -> AppResult<HeaderMap> {
    let cookie = build_session_cookie(token, config);
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&cookie).map_err(|e| crate::errors::AppError::Internal(e.into()))?,
    );
    Ok(headers)
}

pub async fn login(
    State(state): State<AppState>,
    Json(body): Json<LoginRequest>,
) -> AppResult<(HeaderMap, Json<LoginResponse>)> {
    body.validate()?;
    let user_opt = sqlx::query_as::<_, LoginUserRow>(
        "SELECT id, username, password_hash, totp_secret, totp_enabled, is_admin, role,
                failed_login_attempts, locked_until, token_version
         FROM users WHERE username = $1"
    )
    .bind(&body.username)
    .fetch_optional(&state.db)
    .await?;

    let user = match user_opt {
        Some(u) => u,
        None => {
            // Timing-Attack-Prävention: bcrypt auch für unbekannte User ausführen
            let _ = verify(&body.password, dummy_hash());
            return Err(AppError::Unauthorized);
        }
    };

    // Account-Lockout prüfen
    if let Some(locked_until) = user.locked_until {
        if locked_until > Utc::now() {
            return Err(AppError::BadRequest(
                "Account vorübergehend gesperrt. Bitte später erneut versuchen.".into(),
            ));
        }
    }

    if !verify(&body.password, &user.password_hash)
        .map_err(|e| AppError::Internal(e.into()))?
    {
        // Fehlversuch zählen
        let new_attempts = user.failed_login_attempts + 1;
        let locked_until = if new_attempts >= state.config.login_max_attempts as i32 {
            tracing::warn!(
                "Account gesperrt nach {} Fehlversuchen: {}",
                new_attempts,
                user.username
            );
            Some(Utc::now() + Duration::minutes(state.config.lockout_minutes))
        } else {
            None
        };

        sqlx::query(
            "UPDATE users SET failed_login_attempts = $1, locked_until = $2,
             ical_token = CASE WHEN $2 IS NOT NULL THEN NULL ELSE ical_token END
             WHERE id = $3"
        )
        .bind(new_attempts)
        .bind(locked_until)
        .bind(user.id)
        .execute(&state.db)
        .await?;

        let action = if locked_until.is_some() { "ACCOUNT_LOCKED" } else { "LOGIN_FAILED" };
        audit::log(&state.db, Some(user.id), &user.username, action, Some("user"), Some(user.id), None).await;

        return Err(AppError::Unauthorized);
    }

    // Erfolgreicher Login → Zähler zurücksetzen
    sqlx::query(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1"
    )
    .bind(user.id)
    .execute(&state.db)
    .await?;

    audit::log(&state.db, Some(user.id), &user.username, "LOGIN_SUCCESS", Some("user"), Some(user.id), None).await;

    // TOTP nicht aktiv → direkt vollen Token als Cookie setzen
    if !user.totp_enabled {
        let token = make_jwt(&state, user.id, &user.username, user.is_admin, &user.role, true, user.token_version)?;
        let headers = session_headers(&token, &state.config)?;
        return Ok((headers, Json(LoginResponse {
            requires_totp: false,
            totp_setup_required: false,
        })));
    }

    // TOTP aktiv → Partial-Token als Cookie, Frontend liefert Code nach
    let token = make_jwt(&state, user.id, &user.username, user.is_admin, &user.role, false, user.token_version)?;
    let headers = session_headers(&token, &state.config)?;
    Ok((headers, Json(LoginResponse {
        requires_totp: true,
        totp_setup_required: false,
    })))
}

// ── TOTP verifizieren ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct VerifyTotpRequest {
    pub code: String,
}

#[derive(sqlx::FromRow)]
struct TotpUserRow {
    totp_secret: Option<String>,
    failed_login_attempts: i32,
    locked_until: Option<chrono::DateTime<Utc>>,
    token_version: i32,
}

pub async fn verify_totp(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<VerifyTotpRequest>,
) -> AppResult<(HeaderMap, Json<serde_json::Value>)> {
    let user = sqlx::query_as::<_, TotpUserRow>(
        "SELECT totp_secret, failed_login_attempts, locked_until, token_version FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    // Account-Lockout auch für TOTP-Versuche prüfen
    if let Some(locked_until) = user.locked_until {
        if locked_until > Utc::now() {
            return Err(AppError::BadRequest(
                "Account vorübergehend gesperrt. Bitte später erneut versuchen.".into(),
            ));
        }
    }

    let encrypted_secret = user.totp_secret.ok_or(AppError::BadRequest(
        "Kein TOTP-Secret vorhanden".into(),
    ))?;
    let secret = crypto::decrypt_or_plaintext(&encrypted_secret, &state.config.encryption_key);

    let valid = totp::verify_code(&secret, &body.code)
        .map_err(|e| AppError::Internal(e))?;

    if !valid {
        // Fehlversuch zählen — nutzt denselben Lockout-Mechanismus wie Login
        let new_attempts = user.failed_login_attempts + 1;
        let locked_until = if new_attempts >= state.config.login_max_attempts as i32 {
            tracing::warn!(
                "Account gesperrt nach {} TOTP-Fehlversuchen: {}",
                new_attempts,
                claims.username
            );
            Some(Utc::now() + Duration::minutes(state.config.lockout_minutes))
        } else {
            None
        };
        sqlx::query(
            "UPDATE users SET failed_login_attempts = $1, locked_until = $2,
             ical_token = CASE WHEN $2 IS NOT NULL THEN NULL ELSE ical_token END
             WHERE id = $3"
        )
        .bind(new_attempts)
        .bind(locked_until)
        .bind(claims.sub)
        .execute(&state.db)
        .await?;

        return Err(AppError::InvalidTotp);
    }

    // Erfolgreiche TOTP-Verifikation → Zähler zurücksetzen
    sqlx::query(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = $1"
    )
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    let token = make_jwt(&state, claims.sub, &claims.username, claims.is_admin, &claims.role, true, user.token_version)?;
    let headers = session_headers(&token, &state.config)?;
    Ok((headers, Json(serde_json::json!({ "ok": true }))))
}

// ── TOTP Setup ───────────────────────────────────────────────────────────────

#[derive(Serialize)]
pub struct TotpSetupResponse {
    pub secret: String,
    pub uri: String,
}

pub async fn setup_totp(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<TotpSetupResponse>> {
    let secret = totp::generate_secret();
    let ff_name = state.config.ff_name.clone();

    let uri = totp::generate_qr_uri(&secret, &claims.username, &ff_name)
        .map_err(|e| AppError::Internal(e))?;

    let encrypted_secret = crypto::encrypt(&secret, &state.config.encryption_key)
        .map_err(|e| AppError::Internal(e))?;

    sqlx::query!(
        "UPDATE users SET totp_secret = $1 WHERE id = $2",
        encrypted_secret,
        claims.sub
    )
    .execute(&state.db)
    .await?;

    Ok(Json(TotpSetupResponse { secret, uri }))
}

#[derive(Deserialize)]
pub struct ConfirmTotpRequest {
    pub code: String,
}

pub async fn confirm_totp(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ConfirmTotpRequest>,
) -> AppResult<(HeaderMap, Json<serde_json::Value>)> {
    let user = sqlx::query_as::<_, (Option<String>, i32)>(
        "SELECT totp_secret, token_version FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let encrypted_secret = user.0.ok_or(AppError::BadRequest(
        "Kein TOTP-Secret vorhanden. Bitte zuerst /setup-totp aufrufen.".into(),
    ))?;
    let secret = crypto::decrypt_or_plaintext(&encrypted_secret, &state.config.encryption_key);

    let valid = totp::verify_code(&secret, &body.code)
        .map_err(|e| AppError::Internal(e))?;

    if !valid {
        return Err(AppError::InvalidTotp);
    }

    sqlx::query("UPDATE users SET totp_enabled = TRUE WHERE id = $1")
        .bind(claims.sub)
        .execute(&state.db)
        .await?;

    let token = make_jwt(&state, claims.sub, &claims.username, claims.is_admin, &claims.role, true, user.1)?;
    let headers = session_headers(&token, &state.config)?;
    Ok((headers, Json(serde_json::json!({ "ok": true }))))
}

// ── Eigenes Profil ───────────────────────────────────────────────────────────

#[derive(sqlx::FromRow)]
struct UserProfileRow {
    id: Uuid,
    username: String,
    is_admin: bool,
    role: String,
    totp_enabled: bool,
    display_name: Option<String>,
    theme: String,
    permissions: Vec<String>,
    role_permissions: Option<Vec<String>>,
    assigned_role_id: Option<Uuid>,
    assigned_role_name: Option<String>,
    role_level: Option<i32>,
    badge_code: Option<String>,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct FunctionEntry {
    pub role_id:     Uuid,
    pub name:        String,
    pub permissions: Vec<String>,
}

#[derive(Serialize)]
pub struct MeResponse {
    pub id: Uuid,
    pub username: String,
    pub is_admin: bool,
    pub role: String,
    pub totp_enabled: bool,
    pub display_name: Option<String>,
    pub theme: String,
    pub permissions: Vec<String>,
    pub assigned_role_id: Option<Uuid>,
    pub assigned_role_name: Option<String>,
    pub role_level: Option<i32>,
    pub functions: Vec<FunctionEntry>,
    pub badge_code: Option<String>,
}

pub async fn me(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<MeResponse>> {
    let user = sqlx::query_as::<_, UserProfileRow>(
        "SELECT u.id, u.username, u.is_admin, u.role, u.totp_enabled, u.display_name,
                u.theme, u.permissions, r.permissions as role_permissions,
                u.role_id as assigned_role_id, r.name as assigned_role_name,
                r.level as role_level, u.badge_code
         FROM users u
         LEFT JOIN roles r ON r.id = u.role_id
         WHERE u.id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    // Zusatzfunktionen laden
    let functions = sqlx::query_as::<_, FunctionEntry>(
        "SELECT r.id as role_id, r.name, r.permissions
         FROM user_functions uf
         JOIN roles r ON r.id = uf.role_id
         WHERE uf.user_id = $1
         ORDER BY r.name ASC"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await?;

    // Effektive Permissions = Dienstgrad + Funktionen + individuelle (dedupliziert)
    let mut perms = user.role_permissions.unwrap_or_default();
    for f in &functions {
        for p in &f.permissions {
            if !perms.contains(p) { perms.push(p.clone()); }
        }
    }
    for p in &user.permissions {
        if !perms.contains(p) { perms.push(p.clone()); }
    }

    Ok(Json(MeResponse {
        id: user.id,
        username: user.username,
        is_admin: user.is_admin,
        role: user.role,
        totp_enabled: user.totp_enabled,
        display_name: user.display_name,
        theme: user.theme,
        permissions: perms,
        assigned_role_id: user.assigned_role_id,
        assigned_role_name: user.assigned_role_name,
        role_level: user.role_level,
        functions,
        badge_code: user.badge_code,
    }))
}

// ── TOTP deaktivieren ────────────────────────────────────────────────────────

#[derive(Deserialize)]
pub struct DisableTotpRequest {
    pub code: String,
}

pub async fn disable_totp(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<DisableTotpRequest>,
) -> AppResult<Json<serde_json::Value>> {
    let user = sqlx::query_as::<_, (Option<String>, i32)>(
        "SELECT totp_secret, token_version FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::Unauthorized)?;

    let encrypted_secret = user.0.ok_or(AppError::BadRequest(
        "2FA ist nicht eingerichtet".into(),
    ))?;
    let secret = crypto::decrypt_or_plaintext(&encrypted_secret, &state.config.encryption_key);

    let valid = totp::verify_code(&secret, &body.code)
        .map_err(|e| AppError::Internal(e))?;

    if !valid {
        return Err(AppError::InvalidTotp);
    }

    sqlx::query(
        "UPDATE users SET totp_enabled = FALSE, totp_secret = NULL, token_version = token_version + 1 WHERE id = $1"
    )
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "TOTP_DISABLED",
        Some("user"), Some(claims.sub), None).await;

    Ok(Json(serde_json::json!({ "message": "2FA deaktiviert" })))
}

// ── Profil aktualisieren ─────────────────────────────────────────────────────

#[derive(Deserialize, Validate)]
pub struct UpdateProfileBody {
    #[validate(length(max = 100))]
    pub display_name: Option<String>,
    pub theme: Option<String>,
}

pub async fn update_profile(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<UpdateProfileBody>,
) -> AppResult<Json<serde_json::Value>> {
    body.validate()?;
    if let Some(theme) = body.theme.as_deref() {
        if theme != "light" && theme != "dark" {
            return Err(AppError::BadRequest("Ungültiges Theme".into()));
        }
        sqlx::query("UPDATE users SET theme = $1 WHERE id = $2")
            .bind(theme)
            .bind(claims.sub)
            .execute(&state.db)
            .await?;
    }

    if body.display_name.is_some() {
        let display_name = body.display_name.and_then(|s| {
            let s = s.trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        });
        sqlx::query("UPDATE users SET display_name = $1 WHERE id = $2")
            .bind(display_name)
            .bind(claims.sub)
            .execute(&state.db)
            .await?;
    }

    Ok(Json(serde_json::json!({ "message": "Profil gespeichert" })))
}

// ── Setup-Status (öffentlich) ────────────────────────────────────────────────

pub async fn setup_status(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;
    Ok(Json(serde_json::json!({ "setup_needed": count == 0 })))
}

// ── Setup (erster Admin-Account) ─────────────────────────────────────────────

#[derive(Deserialize, Validate)]
pub struct SetupRequest {
    #[validate(length(min = 1, max = 64))]
    pub username: String,
    pub password: String,
    #[validate(length(min = 1, max = 200))]
    pub ff_name: String,
    pub datenschutz_kontakt_name:    Option<String>,
    pub datenschutz_kontakt_email:   Option<String>,
    pub datenschutz_kontakt_telefon: Option<String>,
    pub datenschutz_hoster:          Option<String>,
}

pub async fn initial_setup(
    State(state): State<AppState>,
    Json(body): Json<SetupRequest>,
) -> AppResult<Json<serde_json::Value>> {
    body.validate()?;
    // Nur ausführbar wenn noch kein User existiert
    let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users")
        .fetch_one(&state.db)
        .await?;

    if count > 0 {
        return Err(AppError::Forbidden);
    }

    let username = body.username.trim();
    if username.is_empty() {
        return Err(AppError::BadRequest("Benutzername darf nicht leer sein".into()));
    }
    if username.len() > 64 {
        return Err(AppError::BadRequest("Benutzername zu lang (max. 64 Zeichen)".into()));
    }

    validate_password(&body.password)?;

    let password_hash = hash(&body.password, DEFAULT_COST)
        .map_err(|e| AppError::Internal(e.into()))?;

    sqlx::query!(
        "INSERT INTO users (username, password_hash, is_admin, role) VALUES ($1, $2, TRUE, 'superuser')",
        username,
        password_hash
    )
    .execute(&state.db)
    .await?;

    sqlx::query!(
        "UPDATE settings SET value = $1 WHERE key = 'ff_name'",
        body.ff_name
    )
    .execute(&state.db)
    .await?;

    sqlx::query!(
        "UPDATE settings SET value = 'true' WHERE key = 'setup_complete'"
    )
    .execute(&state.db)
    .await?;

    let dse_fields = [
        ("datenschutz_kontakt_name",    &body.datenschutz_kontakt_name),
        ("datenschutz_kontakt_email",   &body.datenschutz_kontakt_email),
        ("datenschutz_kontakt_telefon", &body.datenschutz_kontakt_telefon),
        ("datenschutz_hoster",          &body.datenschutz_hoster),
    ];
    for (key, val_opt) in dse_fields {
        if let Some(val) = val_opt {
            let v = val.trim();
            if !v.is_empty() {
                sqlx::query(
                    "INSERT INTO settings (key, value) VALUES ($1, $2)
                     ON CONFLICT (key) DO UPDATE SET value = $2"
                )
                .bind(key)
                .bind(v)
                .execute(&state.db)
                .await?;
            }
        }
    }

    Ok(Json(serde_json::json!({ "message": "Setup abgeschlossen" })))
}

// ── Passwort ändern ──────────────────────────────────────────────────────────

#[derive(Deserialize, Validate)]
pub struct ChangePasswordRequest {
    #[validate(length(min = 1, max = 200))]
    pub current_password: String,
    #[validate(length(min = 1, max = 200))]
    pub new_password: String,
}

pub async fn change_password(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<ChangePasswordRequest>,
) -> AppResult<(HeaderMap, Json<serde_json::Value>)> {
    body.validate()?;
    let user = sqlx::query_as::<_, (String,)>(
        "SELECT password_hash FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?
    .ok_or(AppError::NotFound)?;

    if !verify(&body.current_password, &user.0)
        .map_err(|e| AppError::Internal(e.into()))?
    {
        return Err(AppError::Unauthorized);
    }

    validate_password(&body.new_password)?;

    let new_hash = hash(&body.new_password, DEFAULT_COST)
        .map_err(|e| AppError::Internal(e.into()))?;

    // Passwort ändern + alle anderen Sessions + iCal-Token invalidieren
    let new_version: i32 = sqlx::query_scalar(
        "UPDATE users SET password_hash = $1, token_version = token_version + 1, ical_token = NULL
         WHERE id = $2 RETURNING token_version"
    )
    .bind(new_hash)
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    let new_token = make_jwt(&state, claims.sub, &claims.username, claims.is_admin, &claims.role, true, new_version)?;
    let headers = session_headers(&new_token, &state.config)?;
    Ok((headers, Json(serde_json::json!({ "message": "Passwort geändert" }))))
}

// ── Logout ───────────────────────────────────────────────────────────────────

pub async fn logout(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<(HeaderMap, Json<serde_json::Value>)> {
    sqlx::query("UPDATE users SET token_version = token_version + 1 WHERE id = $1")
        .bind(claims.sub)
        .execute(&state.db)
        .await
        .map_err(|e| AppError::Internal(e.into()))?;

    audit::log(&state.db, Some(claims.sub), &claims.username, "LOGOUT",
        Some("user"), Some(claims.sub), None).await;

    let secure = if state.config.frontend_url.starts_with("https") { "; Secure" } else { "" };
    let clear = format!("ff_session=; HttpOnly; SameSite=Strict; Path=/api; Max-Age=0{secure}");
    let mut headers = HeaderMap::new();
    headers.insert(
        header::SET_COOKIE,
        HeaderValue::from_str(&clear).map_err(|e| AppError::Internal(e.into()))?,
    );

    Ok((headers, Json(serde_json::json!({ "message": "Ausgeloggt" }))))
}

// ── Hilfsfunktion JWT ────────────────────────────────────────────────────────

fn make_jwt(
    state: &AppState,
    user_id: Uuid,
    username: &str,
    is_admin: bool,
    role: &str,
    totp_verified: bool,
    token_version: i32,
) -> AppResult<String> {
    let exp = Utc::now()
        .checked_add_signed(Duration::hours(state.config.jwt_expiry_hours))
        .unwrap()
        .timestamp() as usize;

    let claims = Claims {
        sub: user_id,
        username: username.to_string(),
        is_admin,
        role: role.to_string(),
        totp_verified,
        token_version,
        exp,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(state.config.jwt_secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(e.into()))
}
