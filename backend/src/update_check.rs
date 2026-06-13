use std::sync::Arc;
use tokio::sync::RwLock;
use serde::{Deserialize, Serialize};
use ed25519_dalek::{Signature, Verifier, VerifyingKey};

const UPDATE_URL: &str = "https://feuerwehrhub.de/files/latest.json";
const SIG_URL:    &str = "https://feuerwehrhub.de/files/latest.json.sig";
const CACHE_SECS: u64 = 6 * 3600;

// Öffentlicher Ed25519-Schlüssel (32 Byte) — privater Schlüssel liegt nur lokal in FeuerwehrHub_WIN/keys/
const PUBLIC_KEY: [u8; 32] = [
    0x90, 0xb7, 0x2a, 0x7e, 0x9e, 0xb2, 0x6d, 0x2b,
    0x08, 0x7e, 0x40, 0x1b, 0xad, 0x8a, 0xdc, 0xb4,
    0x32, 0xe9, 0x15, 0x50, 0xac, 0x00, 0x4d, 0xda,
    0x70, 0xc7, 0x20, 0xa9, 0x74, 0x47, 0x0c, 0x56,
];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LatestRelease {
    pub version:      String,
    pub date:         String,
    pub download_url: String,
    pub info_url:     String,
    pub notes:        String,
}

#[derive(Debug, Clone, Serialize)]
pub struct UpdateInfo {
    pub update_available: bool,
    pub current_version:  String,
    pub latest:           Option<LatestRelease>,
}

struct CachedCheck {
    info:       UpdateInfo,
    fetched_at: std::time::Instant,
}

#[derive(Clone)]
pub struct UpdateChecker {
    cache: Arc<RwLock<Option<CachedCheck>>>,
}

impl UpdateChecker {
    pub fn new() -> Self {
        Self {
            cache: Arc::new(RwLock::new(None)),
        }
    }

    pub async fn check(&self) -> UpdateInfo {
        {
            let guard = self.cache.read().await;
            if let Some(cached) = guard.as_ref() {
                if cached.fetched_at.elapsed().as_secs() < CACHE_SECS {
                    return cached.info.clone();
                }
            }
        }

        let info = Self::fetch().await;

        let mut guard = self.cache.write().await;
        *guard = Some(CachedCheck {
            info: info.clone(),
            fetched_at: std::time::Instant::now(),
        });

        info
    }

    async fn fetch() -> UpdateInfo {
        let current = env!("CARGO_PKG_VERSION").to_string();

        let latest = match Self::fetch_and_verify().await {
            Ok(release) => Some(release),
            Err(e) => {
                tracing::warn!("Update-Check fehlgeschlagen: {e}");
                None
            }
        };

        let update_available = latest
            .as_ref()
            .map(|l| version_newer(&l.version, &current))
            .unwrap_or(false);

        UpdateInfo { update_available, current_version: current, latest }
    }

    async fn fetch_and_verify() -> anyhow::Result<LatestRelease> {
        let client = reqwest::Client::new();

        // JSON und Signatur parallel laden
        let (json_resp, sig_resp) = tokio::try_join!(
            client.get(UPDATE_URL).send(),
            client.get(SIG_URL).send(),
        )?;

        let json_bytes = json_resp.bytes().await?;
        let sig_hex   = sig_resp.text().await?;

        // Signatur verifizieren bevor JSON geparst wird
        let sig_bytes: Vec<u8> = hex::decode(sig_hex.trim())?;
        let signature = Signature::from_slice(&sig_bytes)
            .map_err(|e| anyhow::anyhow!("Ungültige Signatur: {e}"))?;

        let verifying_key = VerifyingKey::from_bytes(&PUBLIC_KEY)
            .map_err(|e| anyhow::anyhow!("Ungültiger Public Key: {e}"))?;

        verifying_key.verify(&json_bytes, &signature)
            .map_err(|_| anyhow::anyhow!("Signaturprüfung fehlgeschlagen — Update abgelehnt"))?;

        // UTF-8 BOM entfernen falls vorhanden (Windows-Tools fügen ihn manchmal hinzu)
        let json_slice = json_bytes.as_ref().strip_prefix(b"\xef\xbb\xbf").unwrap_or(&json_bytes);
        let release: LatestRelease = serde_json::from_slice(json_slice)?;
        Ok(release)
    }
}

fn version_newer(latest: &str, current: &str) -> bool {
    let parse = |s: &str| -> Vec<u32> {
        s.trim_start_matches('v')
            .split('.')
            .filter_map(|p| p.parse().ok())
            .collect()
    };
    parse(latest) > parse(current)
}
