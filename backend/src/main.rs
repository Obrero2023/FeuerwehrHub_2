mod audit;
mod auth;
mod config;
mod crypto;
mod errors;
mod log_buffer;
mod pdf;
mod routes;
mod update_check;

use axum::{
    http::{HeaderValue, Method},
    Router,
};
use dashmap::DashMap;
use sqlx::PgPool;
use std::{sync::Arc, time::Instant};
use tower_http::{
    cors::CorsLayer,
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};
use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt};

use auth::rate_limit::{GlobalRateLimiter, global_rate_limit};
use config::Config;
use log_buffer::{LogBuffer, LogBufferLayer};

#[derive(Clone)]
pub struct AppState {
    pub db:               PgPool,
    pub config:           Config,
    pub log_buffer:       LogBuffer,
    pub update_checker:   update_check::UpdateChecker,
    /// Fehlgeschlagene Punch-Versuche pro Badge-Code: (Anzahl, erstes Fehlschlagen).
    /// Verhindert Enumeration bekannter Code-Schemata am Kiosk-Tablet.
    pub punch_fail_counts: Arc<DashMap<String, (u32, Instant)>>,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let log_buffer = LogBuffer::new();

    tracing_subscriber::registry()
        .with(tracing_subscriber::EnvFilter::new(
            std::env::var("RUST_LOG").unwrap_or_else(|_| "info".into()),
        ))
        .with(tracing_subscriber::fmt::layer())
        .with(LogBufferLayer::new(log_buffer.clone()))
        .init();

    let config = Config::from_env()?;

    const JWT_SECRET_DEFAULT: &str = "change-this-to-a-long-random-secret";
    if config.jwt_secret.len() < 32 || config.jwt_secret == JWT_SECRET_DEFAULT {
        tracing::error!(
            "JWT_SECRET ist nicht gesetzt, zu kurz (mind. 32 Zeichen) oder entspricht dem \
             bekannten Default-Wert. Bitte in der .env-Datei setzen: openssl rand -hex 64"
        );
        std::process::exit(1);
    }

    const ENCRYPTION_KEY_DEFAULT: &str = "change-this-to-a-different-random-secret";
    if config.encryption_key.is_empty()
        || config.encryption_key == ENCRYPTION_KEY_DEFAULT
        || config.encryption_key == config.jwt_secret
    {
        tracing::error!(
            "ENCRYPTION_KEY ist nicht gesetzt, entspricht dem bekannten Default oder ist \
             identisch mit JWT_SECRET. Bitte einen eigenen Wert setzen: openssl rand -hex 64"
        );
        std::process::exit(1);
    }

    tracing::info!("Starte FeuerwehrHub für: {}", config.ff_name);

    let pool = PgPool::connect(&config.database_url()).await?;
    tracing::info!("Datenbankverbindung hergestellt");

    sqlx::migrate!("../migrations").run(&pool).await?;
    tracing::info!("Migrationen abgeschlossen");

    let state = AppState {
        db:               pool,
        config:           config.clone(),
        log_buffer,
        update_checker:   update_check::UpdateChecker::new(),
        punch_fail_counts: Arc::new(DashMap::new()),
    };

    let origin: HeaderValue = config.frontend_url
        .parse()
        .expect("FRONTEND_URL ist keine gültige Origin");

    let cors = CorsLayer::new()
        .allow_origin(origin)
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::DELETE])
        .allow_headers([
            axum::http::header::AUTHORIZATION,
            axum::http::header::CONTENT_TYPE,
        ]);

    let global_limiter = GlobalRateLimiter::new();

    let app = Router::new()
        .nest("/api", routes::articles::scan_router(state.clone()))
        .nest("/api/settings",      routes::settings::public_router(state.clone()))
        .nest("/api/auth",          routes::auth::router(state.clone()))
        .nest("/api/admin",         routes::admin::router(state.clone()))
        .nest("/api/roles",         routes::roles::router(state.clone()))
        .nest("/api/orders",        routes::orders::router(state.clone()))
        .nest("/api/articles",          routes::articles::router(state.clone()))
        .nest("/api/storage-locations", routes::storage_locations::router(state.clone()))
        .nest("/api/settings",      routes::settings::router(state.clone()))
        .nest("/api/announcements", routes::announcements::router(state.clone()))
        .nest("/api/me",            routes::selfservice::router(state.clone()))
        .nest("/api/me",            routes::termine::me_router(state.clone()))
        .nest("/api/me",            routes::calendar::me_router(state.clone()))
        .nest("/api",               routes::calendar::public_router(state.clone()))
        .nest("/api/personal",      routes::personal::router(state.clone()))
        .nest("/api/personal",      routes::termine::personal_router(state.clone()))
        .nest("/api/vehicles",           routes::vehicles::router(state.clone()))
        .nest("/api/incident-types",     routes::incident_types::router(state.clone()))
        .nest("/api/einsatzberichte",    routes::incidents::router(state.clone()))
        .nest("/api/integrations",       routes::integrations::settings_router(state.clone()))
        .nest("/api",                    routes::integrations::webhooks_router())
        .nest("/api/dienstberichte",     routes::dienst_reports::router(state.clone()))
        .nest("/api/verein",             routes::verein::router(state.clone()))
        .nest("/api/clock",              routes::timeclock::clock_router())
        .nest("/api/timeclock",          routes::timeclock::timeclock_router(state.clone()))
        .route_layer(axum::middleware::from_fn_with_state(
            global_limiter,
            global_rate_limit,
        ))
        .with_state(state)
        .layer(cors)
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::HeaderName::from_static("x-frame-options"),
            HeaderValue::from_static("DENY"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("strict-origin-when-cross-origin"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::HeaderName::from_static("strict-transport-security"),
            HeaderValue::from_static("max-age=31536000; includeSubDomains; preload"),
        ))
        .layer(SetResponseHeaderLayer::if_not_present(
            axum::http::header::HeaderName::from_static("content-security-policy"),
            HeaderValue::from_static(
                "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self';connect-src 'self'; frame-ancestors 'none'",
            ),
        ))
        .layer(TraceLayer::new_for_http());

    let addr = format!("{}:{}", config.app_host, config.app_port);
    let listener = tokio::net::TcpListener::bind(&addr).await?;
    tracing::info!("Server läuft auf http://{}", addr);

    axum::serve(
        listener,
        app.into_make_service_with_connect_info::<std::net::SocketAddr>(),
    )
    .await?;

    Ok(())
}
