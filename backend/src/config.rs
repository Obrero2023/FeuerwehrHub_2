use anyhow::{anyhow, bail, Result};

#[derive(Debug, Clone)]
pub struct Config {
    pub db_host: String,
    pub db_port: u16,
    pub db_name: String,
    pub db_user: String,
    pub db_password: String,
    pub app_host: String,
    pub app_port: u16,
    pub jwt_secret: String,
    pub encryption_key: String,
    pub jwt_expiry_hours: i64,
    pub ff_name: String,
    pub data_dir: String,
    pub frontend_url: String,
    pub login_max_attempts: u32,
    pub lockout_minutes: i64,
}

impl Config {
    pub fn from_env() -> Result<Self> {
        dotenvy::dotenv().ok();

        Ok(Self {
            db_host: std::env::var("DB_HOST")?,
            db_port: std::env::var("DB_PORT")
                .unwrap_or_else(|_| "5432".into())
                .parse()?,
            db_name: std::env::var("DB_NAME")?,
            db_user: std::env::var("DB_USER")?,
            db_password: std::env::var("DB_PASSWORD")?,
            app_host: std::env::var("APP_HOST")
                .unwrap_or_else(|_| "0.0.0.0".into()),
            app_port: std::env::var("APP_PORT")
                .unwrap_or_else(|_| "3000".into())
                .parse()?,
            jwt_secret: std::env::var("JWT_SECRET")?,
            encryption_key: std::env::var("ENCRYPTION_KEY")
                .unwrap_or_default(),
            jwt_expiry_hours: std::env::var("JWT_EXPIRY_HOURS")
                .unwrap_or_else(|_| "8".into())
                .parse()?,
            ff_name: std::env::var("FF_NAME")
                .unwrap_or_else(|_| "Freiwillige Feuerwehr".into()),
            data_dir: std::env::var("DATA_DIR")
                .unwrap_or_else(|_| "/data".into()),
            frontend_url: normalize_frontend_origin(
                &std::env::var("FRONTEND_URL")
                    .unwrap_or_else(|_| "http://localhost".into())
            )?,
            login_max_attempts: std::env::var("LOGIN_MAX_ATTEMPTS")
                .unwrap_or_else(|_| "5".into())
                .parse()
                .unwrap_or(5),
            lockout_minutes: std::env::var("LOCKOUT_MINUTES")
                .unwrap_or_else(|_| "15".into())
                .parse()
                .unwrap_or(15),
        })
    }

    pub fn database_url(&self) -> String {
        format!(
            "postgresql://{}:{}@{}:{}/{}",
            self.db_user, self.db_password, self.db_host, self.db_port, self.db_name
        )
    }
}

fn normalize_frontend_origin(raw: &str) -> Result<String> {
    let url = reqwest::Url::parse(raw)
        .map_err(|e| anyhow!("FRONTEND_URL ist ungültig: {e}"))?;

    match url.scheme() {
        "http" | "https" => {}
        other => bail!("FRONTEND_URL muss mit http:// oder https:// beginnen (aktuell: {other})"),
    }

    let host = url.host_str()
        .ok_or_else(|| anyhow!("FRONTEND_URL muss einen Host enthalten"))?;

    if !url.username().is_empty() || url.password().is_some() {
        bail!("FRONTEND_URL darf keine Zugangsdaten enthalten");
    }

    if url.path() != "/" || url.query().is_some() || url.fragment().is_some() {
        bail!("FRONTEND_URL darf nur die Origin enthalten (ohne Pfad, Query, Fragment)");
    }

    // Standard-Port explizit angegeben → normalisieren ohne Port
    let default_port = match url.scheme() { "http" => 80u16, _ => 443u16 };
    if url.port() == Some(default_port) {
        return Ok(format!("{}://{}", url.scheme(), host));
    }

    // Nicht-Standard-Port (z.B. 8080 für lokale Entwicklung) → als Origin zurückgeben
    match url.port() {
        Some(port) => Ok(format!("{}://{}:{}", url.scheme(), host, port)),
        None       => Ok(format!("{}://{}", url.scheme(), host)),
    }
}

#[cfg(test)]
mod tests {
    use super::normalize_frontend_origin;

    #[test]
    fn normalizes_trailing_slash() {
        assert_eq!(normalize_frontend_origin("http://localhost/").unwrap(), "http://localhost");
    }

    #[test]
    fn normalizes_explicit_default_http_port() {
        assert_eq!(normalize_frontend_origin("http://localhost:80").unwrap(), "http://localhost");
    }

    #[test]
    fn normalizes_explicit_default_https_port() {
        assert_eq!(normalize_frontend_origin("https://example.org:443").unwrap(), "https://example.org");
    }

    #[test]
    fn allows_non_standard_port() {
        assert_eq!(normalize_frontend_origin("http://localhost:8080").unwrap(), "http://localhost:8080");
    }

    #[test]
    fn rejects_paths() {
        let err = normalize_frontend_origin("http://localhost/app").unwrap_err();
        assert!(err.to_string().contains("nur die Origin"));
    }

    #[test]
    fn rejects_non_http_scheme() {
        let err = normalize_frontend_origin("file:///tmp/index.html").unwrap_err();
        assert!(err.to_string().contains("http:// oder https://"));
    }
}
