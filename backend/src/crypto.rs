use aes_gcm::{
    aead::{Aead, AeadCore, KeyInit, OsRng},
    Aes256Gcm, Nonce,
};
use anyhow::{anyhow, Result};
use base64::{engine::general_purpose::STANDARD, Engine};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};

const PREFIX_V1: &str = "enc:v1:";
const PREFIX_V2: &str = "enc:v2:";

/// Alte Schlüsselableitung (SHA256) — nur noch für Entschlüsselung bestehender v1-Daten.
fn derive_key_v1(encryption_key: &str) -> [u8; 32] {
    Sha256::digest(encryption_key.as_bytes()).into()
}

/// Neue Schlüsselableitung per HKDF-SHA256 (RFC 5869).
/// Salt und Info sorgen für Domain-Separation; neues Format seit enc:v2:.
fn derive_key_v2(encryption_key: &str) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(
        Some(b"FeuerwehrHub-enc-v2"),
        encryption_key.as_bytes(),
    );
    let mut okm = [0u8; 32];
    hk.expand(b"aes-256-gcm", &mut okm).expect("HKDF expand: Ausgabelänge zu groß");
    okm
}

fn do_encrypt(plaintext: &str, key_bytes: [u8; 32], prefix: &str) -> Result<String> {
    let cipher = Aes256Gcm::new(key_bytes.as_ref().into());
    let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext.as_bytes())
        .map_err(|e| anyhow!("Verschlüsselung fehlgeschlagen: {e}"))?;

    let mut combined = nonce.to_vec();
    combined.extend_from_slice(&ciphertext);
    Ok(format!("{}{}", prefix, STANDARD.encode(&combined)))
}

fn do_decrypt(b64_payload: &str, key_bytes: [u8; 32]) -> Result<String> {
    let combined = STANDARD
        .decode(b64_payload)
        .map_err(|e| anyhow!("Base64-Dekodierung fehlgeschlagen: {e}"))?;

    if combined.len() < 12 {
        return Err(anyhow!("Ungültige verschlüsselte Daten"));
    }

    let (nonce_bytes, ciphertext) = combined.split_at(12);
    let nonce = Nonce::from_slice(nonce_bytes);
    let cipher = Aes256Gcm::new(key_bytes.as_ref().into());

    let plaintext = cipher
        .decrypt(nonce, ciphertext)
        .map_err(|e| anyhow!("Entschlüsselung fehlgeschlagen: {e}"))?;

    String::from_utf8(plaintext).map_err(|e| anyhow!("UTF-8-Fehler: {e}"))
}

/// Verschlüsselt einen Wert mit HKDF-abgeleitetem AES-256-GCM (enc:v2: Format).
pub fn encrypt(plaintext: &str, encryption_key: &str) -> Result<String> {
    do_encrypt(plaintext, derive_key_v2(encryption_key), PREFIX_V2)
}

/// Entschlüsselt enc:v1: (SHA256) oder enc:v2: (HKDF) Werte.
pub fn decrypt(encrypted: &str, encryption_key: &str) -> Result<String> {
    if let Some(payload) = encrypted.strip_prefix(PREFIX_V2) {
        do_decrypt(payload, derive_key_v2(encryption_key))
    } else if let Some(payload) = encrypted.strip_prefix(PREFIX_V1) {
        do_decrypt(payload, derive_key_v1(encryption_key))
    } else {
        Err(anyhow!("Unbekanntes Verschlüsselungsformat"))
    }
}

/// Liest einen Wert aus der DB: entschlüsselt v1/v2 oder gibt Klartext zurück.
/// Ermöglicht schrittweise Migration ohne Datenverlust.
pub fn decrypt_or_plaintext(value: &str, encryption_key: &str) -> String {
    if value.starts_with(PREFIX_V2) || value.starts_with(PREFIX_V1) {
        decrypt(value, encryption_key).unwrap_or_else(|_| value.to_string())
    } else {
        value.to_string()
    }
}
