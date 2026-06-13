use axum::{
    body::Body,
    extract::{Request, State},
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use uuid::Uuid;

use crate::{errors::AppError, AppState};

#[derive(Debug, serde::Serialize, serde::Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub username: String,
    pub is_admin: bool,
    pub role: String,
    pub totp_verified: bool,
    #[serde(default)]
    pub token_version: i32,
    pub exp: usize,
}

impl Claims {
    pub fn is_admin_or_above(&self) -> bool {
        self.role == "admin" || self.role == "superuser"
    }
    pub fn is_superuser(&self) -> bool {
        self.role == "superuser"
    }
}

/// Vollständige Auth — JWT gültig + TOTP verifiziert + Token nicht widerrufen
pub async fn require_auth(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = extract_token(&req).ok_or(AppError::Unauthorized)?;

    let claims = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?
    .claims;

    if !claims.totp_verified {
        return Err(AppError::TotpRequired);
    }

    verify_token_version(&state, &claims).await?;

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

/// Partielle Auth — nur gültiges JWT, TOTP noch nicht zwingend (für Setup/Verify)
pub async fn require_partial_auth(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = extract_token(&req).ok_or(AppError::Unauthorized)?;

    let claims = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?
    .claims;

    verify_token_version(&state, &claims).await?;

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

async fn verify_token_version(state: &AppState, claims: &Claims) -> Result<(), AppError> {
    let db_version: Option<i32> = sqlx::query_scalar(
        "SELECT token_version FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| AppError::Internal(e.into()))?;

    match db_version {
        Some(v) if v == claims.token_version => Ok(()),
        _ => Err(AppError::Unauthorized),
    }
}

pub async fn require_admin(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, AppError> {
    let token = extract_token(&req).ok_or(AppError::Unauthorized)?;

    let claims = decode::<Claims>(
        &token,
        &DecodingKey::from_secret(state.config.jwt_secret.as_bytes()),
        &Validation::default(),
    )
    .map_err(|_| AppError::Unauthorized)?
    .claims;

    if !claims.totp_verified {
        return Err(AppError::TotpRequired);
    }
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    verify_token_version(&state, &claims).await?;

    req.extensions_mut().insert(claims);
    Ok(next.run(req).await)
}

// ── Modul-Berechtigungsprüfung ────────────────────────────────────────────────

/// Gibt alle Permissions zurück, die Zugriff auf `module` gewähren.
/// Beispiel: "lager.read" → auch User mit "lager" oder "lager.approve" dürfen rein.
/// Gibt None zurück wenn keine Hierarchie gilt (exakter Match genügt).
fn accepted_permissions(module: &str) -> Option<Vec<&'static str>> {
    match module {
        "lager.read"              => Some(vec!["lager.read", "lager", "lager.approve"]),
        "lager"                   => Some(vec!["lager", "lager.approve"]),
        "einsatzberichte.read"    => Some(vec!["einsatzberichte.read", "einsatzberichte", "einsatzberichte.approve"]),
        "einsatzberichte"         => Some(vec!["einsatzberichte", "einsatzberichte.approve"]),
        _                         => None,
    }
}

/// Prüft ob ein User Zugriff auf ein Modul hat (DB-Lookup, wirkt sofort bei Änderungen).
/// Admins und Superuser haben immer Zugriff.
/// Für Module mit Hierarchie (lager, einsatzberichte) reicht eine höhere Permission aus.
async fn check_module(state: &AppState, claims: &Claims, module: &str) -> Result<(), AppError> {
    if claims.is_admin_or_above() {
        return Ok(());
    }

    let has_perm: bool = if let Some(accepted) = accepted_permissions(module) {
        // Hierarchie-Prüfung: User hat Zugriff wenn er irgendeine der akzeptierten Permissions besitzt
        let accepted_owned: Vec<String> = accepted.iter().map(|s| s.to_string()).collect();
        sqlx::query_scalar(
            "SELECT EXISTS (
                SELECT 1 FROM (
                    SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}')) AS perm
                    FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                    UNION ALL
                    SELECT unnest(fr.permissions)
                    FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
                ) t
                WHERE t.perm = ANY($1)
             )"
        )
        .bind(&accepted_owned)
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    } else {
        // Exakter Match (personal, fahrzeuge, verein, lager.approve, einsatzberichte.approve, ...)
        sqlx::query_scalar(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
                UNION
                SELECT unnest(fr.permissions)
                FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $2
             )"
        )
        .bind(module)
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await
        .unwrap_or(false)
    };

    if has_perm { Ok(()) } else { Err(AppError::Forbidden) }
}

/// Middleware-Factory: gibt eine Middleware zurück die das angegebene Modul prüft.
/// Verwendung: `.route_layer(middleware::from_fn_with_state(state.clone(), require_module("lager")))`
pub fn require_module(
    module: &'static str,
) -> impl Fn(
    State<AppState>,
    axum::Extension<Claims>,
    Request<Body>,
    Next,
) -> std::pin::Pin<Box<dyn std::future::Future<Output = Result<Response, AppError>> + Send>>
+ Clone {
    move |State(state): State<AppState>,
          axum::Extension(claims): axum::Extension<Claims>,
          req: Request<Body>,
          next: Next| {
        Box::pin(async move {
            check_module(&state, &claims, module).await?;
            Ok(next.run(req).await)
        })
    }
}

fn extract_token(req: &Request) -> Option<String> {
    // Cookie (httpOnly) hat Vorrang vor Authorization-Header
    if let Some(cookie) = req.headers()
        .get("Cookie")
        .and_then(|v| v.to_str().ok())
        .and_then(|cookies| {
            cookies.split(';').find_map(|c| {
                c.trim().strip_prefix("ff_session=").map(|s| s.to_string())
            })
        })
    {
        return Some(cookie);
    }
    // Fallback: Bearer-Token (API-Clients)
    req.headers()
        .get("Authorization")
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
        .map(|s| s.to_string())
}
