use std::{
    net::IpAddr,
    num::NonZeroU32,
    sync::Arc,
    time::{Duration, Instant},
};

use axum::{
    body::Body,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode},
    middleware::Next,
    response::Response,
};
use dashmap::DashMap;
use governor::{
    clock::DefaultClock,
    state::{InMemoryState, NotKeyed},
    Quota, RateLimiter,
};
use std::net::SocketAddr;

type Limiter = Arc<RateLimiter<NotKeyed, InMemoryState, DefaultClock>>;
type LimiterEntry = (Limiter, Instant);

fn extract_ip(headers: &HeaderMap, addr: SocketAddr) -> IpAddr {
    headers
        .get("x-forwarded-for")
        .and_then(|v| v.to_str().ok())
        .and_then(|s| s.split(',').next())
        .and_then(|s| s.trim().parse::<IpAddr>().ok())
        .unwrap_or_else(|| addr.ip())
}

#[derive(Clone)]
pub struct LoginRateLimiter {
    limiters: Arc<DashMap<IpAddr, LimiterEntry>>,
    per_minute: u32,
    burst: u32,
}

impl LoginRateLimiter {
    pub fn new() -> Self {
        Self::with_quota(10, 5)
    }

    pub fn with_quota(per_minute: u32, burst: u32) -> Self {
        let limiters: Arc<DashMap<IpAddr, LimiterEntry>> = Arc::new(DashMap::new());

        // Hintergrund-Task: bereinigt Einträge älter als 10 Minuten alle 5 Minuten
        let limiters_clone = limiters.clone();
        tokio::spawn(async move {
            let mut interval = tokio::time::interval(tokio::time::Duration::from_secs(300));
            loop {
                interval.tick().await;
                let cutoff = Instant::now() - Duration::from_secs(600);
                limiters_clone.retain(|_, (_, last_access)| *last_access > cutoff);
            }
        });

        Self { limiters, per_minute, burst }
    }

    fn limiter_for(&self, ip: IpAddr) -> Limiter {
        let (per_minute, burst) = (self.per_minute, self.burst);
        let mut entry = self.limiters.entry(ip).or_insert_with(|| {
            (
                Arc::new(RateLimiter::direct(
                    Quota::per_minute(NonZeroU32::new(per_minute).unwrap())
                        .allow_burst(NonZeroU32::new(burst).unwrap()),
                )),
                Instant::now(),
            )
        });
        entry.1 = Instant::now();
        entry.0.clone()
    }
}

pub async fn login_rate_limit(
    State(limiter): State<LoginRateLimiter>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let ip = extract_ip(request.headers(), addr);
    let lim = limiter.limiter_for(ip);

    if lim.check().is_err() {
        tracing::warn!("Login Rate-Limit überschritten für IP: {}", ip);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(request).await)
}

pub async fn punch_rate_limit(
    State(limiter): State<LoginRateLimiter>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let ip = extract_ip(request.headers(), addr);
    let lim = limiter.limiter_for(ip);

    if lim.check().is_err() {
        tracing::warn!("Punch Rate-Limit überschritten für IP: {}", ip);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(request).await)
}

// ── Globaler API-Rate-Limiter ─────────────────────────────────────────────────
// 300 Requests/Minute pro IP, Burst 60 — schützt alle Endpunkte vor Enumeration
// und DoS. Login/Punch haben zusätzlich eigene, strengere Limits.

#[derive(Clone)]
pub struct GlobalRateLimiter(pub LoginRateLimiter);

impl GlobalRateLimiter {
    pub fn new() -> Self {
        Self(LoginRateLimiter::with_quota(300, 60))
    }
}

pub async fn global_rate_limit(
    State(limiter): State<GlobalRateLimiter>,
    ConnectInfo(addr): ConnectInfo<SocketAddr>,
    request: Request<Body>,
    next: Next,
) -> Result<Response, StatusCode> {
    let ip = extract_ip(request.headers(), addr);
    let lim = limiter.0.limiter_for(ip);

    if lim.check().is_err() {
        tracing::warn!("Globales Rate-Limit überschritten für IP: {}", ip);
        return Err(StatusCode::TOO_MANY_REQUESTS);
    }

    Ok(next.run(request).await)
}
