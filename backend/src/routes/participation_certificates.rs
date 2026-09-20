use axum::{
    extract::{Multipart, Path, Query, State},
    middleware,
    routing::{delete, get, post, put},
    Extension, Json, Router,
};
use base64::{Engine as _, engine::general_purpose};
use chrono::{NaiveDate, NaiveTime, Utc};
use serde::{Deserialize, Serialize};
use std::io::{Cursor, Read, Write};
use std::path::Path as FsPath;
use tokio::fs;
use validator::Validate;
use uuid::Uuid;

use crate::{
    auth::middleware::{require_module, require_auth, Claims},
    errors::{AppError, AppResult},
    pdf::PdfBuilder,
    AppState,
};

// ── Structs ───────────────────────────────────────────────────

#[derive(Serialize, sqlx::FromRow)]
pub struct ParticipationCertificate {
    pub id:                  Uuid,
    pub user_id:             Uuid,
    pub username:            Option<String>,
    pub start_date:          NaiveDate,
    pub end_date:            NaiveDate,
    pub alarm_time:          NaiveTime,
    pub end_time:            NaiveTime,
    pub unit_leader_id:      Option<Uuid>,
    pub unit_leader_name:    Option<String>,
    pub status:              String,
    pub created_at:          chrono::DateTime<Utc>,
    pub approved_at:         Option<chrono::DateTime<Utc>>,
    pub signed_at:           Option<chrono::DateTime<Utc>>,
    pub signed_by:           Option<Uuid>,
    pub signed_by_name:      Option<String>,
    pub template_path:       Option<String>,
}

#[derive(Deserialize, Validate)]
pub struct CreateCertificateBody {
    pub start_date:    NaiveDate,
    pub end_date:      NaiveDate,
    pub alarm_time:    NaiveTime,
    pub end_time:      NaiveTime,
    pub unit_leader_id: Uuid,
}

#[derive(Serialize, sqlx::FromRow)]
pub struct UnitLeaderEntry {
    pub id: Uuid,
    pub username: String,
    pub display_name: Option<String>,
}

#[derive(Deserialize)]
pub struct CertificateQuery {
    pub user_id:        Option<Uuid>,
    pub status:         Option<String>,
    pub unit_leader_id: Option<Uuid>,
}

#[derive(Deserialize)]
pub struct UpdateStatusBody {
    pub status: String,
}

// ── Helper ──────────────────────────────────────────────────────

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum CertificatePermissionLevel {
    None,
    Read,
    Write,
    Admin,
}

async fn get_certificate_permission_level(state: &AppState, claims: &Claims) -> AppResult<CertificatePermissionLevel> {
    // Check for global admin/superuser
    if claims.is_admin_or_above() {
        return Ok(CertificatePermissionLevel::Admin);
    }

    // Query all module permissions at once (admin > write > read)
    let perms: Vec<String> = sqlx::query_scalar::<_, String>(
        "SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}')) AS perm
         FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $1
         UNION
         SELECT unnest(fr.permissions)
         FROM user_functions uf JOIN roles fr ON fr.id = uf.role_id WHERE uf.user_id = $1"
    )
    .bind(claims.sub)
    .fetch_all(&state.db)
    .await
    .unwrap_or_default();

    if perms.iter().any(|p| p == "teilnahmebescheinigung.admin") {
        Ok(CertificatePermissionLevel::Admin)
    } else if perms.iter().any(|p| p == "teilnahmebescheinigung.schreiben") {
        Ok(CertificatePermissionLevel::Write)
    } else if perms.iter().any(|p| p == "teilnahmebescheinigung") {
        Ok(CertificatePermissionLevel::Read)
    } else {
        Ok(CertificatePermissionLevel::None)
    }
}

/// Checks whether the authenticated user may access a given certificate.
/// Admins (global or module-level) can access any certificate.
/// Regular users only have access to certificates they created (user_id = claims.sub)
/// or that were sent to them as Einheitsführer (unit_leader_id = claims.sub).
async fn fetch_certificate_by_id(
    state: &AppState,
    id: Uuid,
    claims: &Claims,
) -> AppResult<ParticipationCertificate> {
    let cert = sqlx::query_as::<_, ParticipationCertificate>(
        "SELECT pc.id, pc.user_id, COALESCE(u.display_name, u.username) as username,
                pc.start_date, pc.end_date, pc.alarm_time, pc.end_time,
                pc.unit_leader_id, COALESCE(ul.display_name, ul.username) as unit_leader_name,
                pc.status, pc.created_at, pc.approved_at, pc.signed_at,
                pc.signed_by,
                (SELECT display_name FROM users WHERE id = pc.signed_by) as signed_by_name,
                pc.template_path
         FROM participation_certificates pc
         JOIN users u ON u.id = pc.user_id
         LEFT JOIN users ul ON ul.id = pc.unit_leader_id
         WHERE pc.id = $1"
    )
    .bind(id)
    .fetch_one(&state.db)
    .await
    .map_err(|_| AppError::NotFound)?;

    let perm_level = get_certificate_permission_level(state, claims).await?;
    let user_id = claims.sub;

    match perm_level {
        CertificatePermissionLevel::Admin => {}
        CertificatePermissionLevel::Write => {
            if cert.user_id != user_id && cert.unit_leader_id != Some(user_id) {
                return Err(AppError::Forbidden);
            }
        }
        CertificatePermissionLevel::Read => {
            if cert.user_id != user_id {
                return Err(AppError::Forbidden);
            }
        }
        CertificatePermissionLevel::None => return Err(AppError::Forbidden),
    }

    Ok(cert)
}

// ── PDF generation ──────────────────────────────────────────────

/// Liest das Stempel-Bild aus dem data_dir und gibt die Bilddaten zurück.
/// Erwartet im data_dir: teilnahmebescheinigung_stempel.png
async fn read_stempel_image(state: &AppState) -> AppResult<Option<Vec<u8>>> {
    let stempel_path = FsPath::new(&state.config.data_dir).join("teilnahmebescheinigung_stempel.png");

    if !stempel_path.exists() {
        return Ok(None);
    }

    let data = tokio::fs::read(&stempel_path)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!("Stempel lesen fehlgeschlagen: {}", e)))?;

    Ok(Some(data))
}

// ── DOCX-Template-Hilfsfunktionen ──────────────────────────────────────

/// Füllt die Rich-Text-Inhaltssteuerelemente eines DOCX-Templates mit den gegebenen Werten.
/// Erwartet ein DOCX mit Content Controls, deren `w:alias` den Schlüsseln in `values` entspricht.
/// Gibt das gefüllte DOCX als Vec<u8> zurück oder einen Fehler.
fn fill_docx_template(
    template_data: &[u8],
    values: &serde_json::Map<String, serde_json::Value>,
) -> anyhow::Result<Vec<u8>> {
    // Öffne das DOCX als ZIP-Archiv
    let mut archive = zip::ZipArchive::new(Cursor::new(template_data))?;

    // Lese alle Dateien aus dem DOCX
    let mut files: Vec<(String, Vec<u8>)> = Vec::new();
    for i in 0..archive.len() {
        let mut file = archive.by_index(i)?;
        let name = file.name().to_string();
        let mut data = Vec::new();
        file.read_to_end(&mut data)?;
        files.push((name, data));
    }

    // Trenne Text- und Bildwerte
    let mut text_values = serde_json::Map::new();
    let mut image_values: Vec<(String, Vec<u8>, String)> = Vec::new(); // (alias, image_data, mime)

    for (key, value) in values {
        if let Some(val_str) = value.as_str() {
            if val_str.starts_with("data:image/") {
                if let Some((mime, data)) = parse_data_uri(val_str) {
                    image_values.push((key.clone(), data, mime));
                }
            } else if val_str != "—" {
                text_values.insert(key.clone(), value.clone());
            }
        }
    }

    // Finde document.xml und document.xml.rels
    let mut document_xml_bytes = None;
    let mut document_rels_bytes = None;

    for (name, data) in &files {
        if name == "word/document.xml" {
            document_xml_bytes = Some(data.clone());
        } else if name == "word/_rels/document.xml.rels" {
            document_rels_bytes = Some(data.clone());
        }
    }

    // Textwerte in document.xml einfügen
    if let Some(ref xml_bytes) = document_xml_bytes {
        let xml = String::from_utf8_lossy(xml_bytes).to_string();
        let modified = fill_sdt_content_text(&xml, &text_values);
        for (name, data) in &mut files {
            if name == "word/document.xml" {
                *data = modified.as_bytes().to_vec();
            }
        }
    }

    // Bilder einbetten
    if !image_values.is_empty() {
        files = embed_images(files, image_values, document_rels_bytes);
    }

    // Schreibe das modifizierte DOCX zurück
    let mut output = Vec::new();
    {
        let mut writer = zip::ZipWriter::new(Cursor::new(&mut output));
        let options = zip::write::FileOptions::default()
            .compression_method(zip::CompressionMethod::Stored);

        for (name, data) in &files {
            writer.start_file(name, options)?;
            writer.write_all(data)?;
        }
        writer.finish()?;
    }

    Ok(output)
}

/// Parst eine Data-URI wie `data:image/png;base64,...` in (MIME-Typ, Rohdaten).
fn parse_data_uri(data_uri: &str) -> Option<(String, Vec<u8>)> {
    let rest = data_uri.strip_prefix("data:")?;
    let (mime, data_part) = rest.split_once(';')?;
    let b64_data = data_part.strip_prefix("base64,")?;
    let data = general_purpose::STANDARD.decode(b64_data).ok()?;
    Some((mime.to_string(), data))
}

/// Betten Bilder in das DOCX-ZIP ein und ersetze Content Controls durch Inline-Bilder.
fn embed_images(
    mut files: Vec<(String, Vec<u8>)>,
    images: Vec<(String, Vec<u8>, String)>, // (alias, image_data, mime)
    document_rels_bytes: Option<Vec<u8>>,
) -> Vec<(String, Vec<u8>)> {
    let rels_str = document_rels_bytes
        .map(|d| String::from_utf8_lossy(&d).to_string())
        .unwrap_or_default();
    let mut rels_xml = rels_str;

    // document.xml finden und aktualisieren
    let mut doc_xml = None;
    for (name, data) in &files {
        if name == "word/document.xml" {
            doc_xml = Some(String::from_utf8_lossy(data).to_string());
            break;
        }
    }
    let mut doc_xml = doc_xml.unwrap_or_default();

    // Finde höchste bestehende rId-Nummer in document.xml.rels
    let mut max_rel_num: usize = 0;
    for cap in regex_captures(&rels_xml, r#"Id="rId(\d+)""#) {
        if let Ok(n) = cap.parse::<usize>() {
            max_rel_num = max_rel_num.max(n);
        }
    }

    // Finde höchste bestehende Media-Nummer
    let mut max_media_num: usize = 0;
    for (name, _) in &files {
        if let Some(num_str) = name.strip_prefix("word/media/image") {
            if let Some(num) = num_str.split('.').next().and_then(|s| s.parse::<usize>().ok()) {
                max_media_num = max_media_num.max(num);
            }
        }
    }

    for (i, (alias, image_data, mime)) in images.iter().enumerate() {
        let media_num = max_media_num + i + 1;
        let ext = match mime.as_str() {
            "image/png" => "png",
            "image/jpeg" | "image/jpg" => "jpg",
            "image/gif" => "gif",
            _ => "png",
        };
        let media_filename = format!("image{}.{}", media_num, ext);
        let rel_id = format!("rId{}", max_rel_num + i + 1);

        // Bild zum ZIP hinzufügen
        files.push((format!("word/media/{}", media_filename), image_data.clone()));

        // Beziehung hinzufügen
        let relationship = format!(
            r#"<Relationship Id="{}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/{}"/>"#,
            rel_id, media_filename
        );
        if let Some(pos) = rels_xml.rfind("</Relationships>") {
            rels_xml.insert_str(pos, &relationship);
        }

        // Content Control durch Inline-Bild ersetzen
        doc_xml = replace_sdt_with_image(&doc_xml, alias, &rel_id);
    }

    // Dateien aktualisieren
    for (name, data) in &mut files {
        if name == "word/_rels/document.xml.rels" {
            *data = rels_xml.as_bytes().to_vec();
        } else if name == "word/document.xml" {
            *data = doc_xml.as_bytes().to_vec();
        }
    }

    files
}

/// Ersetzt ein Rich-Text-Inhaltssteuerelement durch ein Inline-Bild-Element.
fn replace_sdt_with_image(xml: &str, alias: &str, rel_id: &str) -> String {
    let alias_pattern = format!(r#"<w:alias w:val="{}""#, alias);

    if let Some(alias_pos) = xml.find(&alias_pattern) {
        // Finde den öffnenden <w:sdt>-Tag vor dem Alias
        if let Some(sdt_start) = xml[..alias_pos].rfind("<w:sdt>") {
            // Finde den schließenden </w:sdt>-Tag
            if let Some(sdt_end) = xml[alias_pos..].find("</w:sdt>") {
                let sdt_end_pos = alias_pos + sdt_end;
                let sdt_full_end = sdt_end_pos + "</w:sdt>".len();

                let image_xml = format!(
                    r#"<w:sdt>
  <w:sdtPr><w:alias w:val="{}"/></w:sdtPr>
  <w:sdtContent>
    <w:p>
      <w:r>
        <w:drawing>
          <wp:inline distT="0" distB="0" distL="0" distR="0" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
            <wp:extent cx="914400" cy="914400"/>
            <wp:docPr id="1" name="Image"/>
            <a:graphic>
              <a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
                <pic:pic>
                  <pic:nvPicPr>
                    <pic:cNvPr id="0" name="Image"/>
                    <pic:cNvPicPr/>
                  </pic:nvPicPr>
                  <pic:blipFill>
                    <a:blip r:embed="{}"/>
                    <a:stretch><a:fillRect/></a:stretch>
                  </pic:blipFill>
                  <pic:spPr>
                    <a:xfrm><a:off x="0" y="0"/><a:ext cx="914400" cy="914400"/></a:xfrm>
                    <a:prstGeom prst="rect"><a:avLst/></a:prstGeom>
                  </pic:spPr>
                </pic:pic>
              </a:graphicData>
            </a:graphic>
          </wp:inline>
        </w:drawing>
      </w:r>
    </w:p>
  </w:sdtContent>
</w:sdt>"#,
                    alias, rel_id
                );

                let mut result = xml.to_string();
                result.replace_range(sdt_start..sdt_full_end, &image_xml);
                return result;
            }
        }
    }

    xml.to_string()
}

/// Ersetzt den Textinhalt aller Rich-Text-Inhaltssteuerelemente in der XML.
/// Für jedes Key-Value-Paar in `values` sucht es das Content Control mit passendem `w:alias`
/// und ersetzt den Textinhalt seines `<w:sdtContent>` durch den Wert.
///
/// Der Alias‑Vergleich ist gross-/kleinschreibungs‑unabhängig: sowohl die exakte Schreibweise
/// als auch die Variante mit kleingeschriebenem ersten Buchstaben werden gesucht.
fn fill_sdt_content_text(xml: &str, values: &serde_json::Map<String, serde_json::Value>) -> String {
    let mut result = xml.to_string();

    for (key, value) in values {
        if let Some(val_str) = value.as_str() {
            // Wir suchen nach beiden Varianten: exakt so wie im Key und mit kleinem Anfangsbuchstaben
            let alias_patterns = [
                format!(r#"<w:alias w:val="{}""#, key),
                format!(r#"<w:alias w:val="{}""#, key.to_lowercase()),
            ];

            for alias_pattern in &alias_patterns {
                let mut search_pos = 0usize;

                while let Some(alias_pos) = result[search_pos..].find(alias_pattern) {
                    let actual_alias_pos = search_pos + alias_pos;

                    if let Some(sdt_content_start) = result[actual_alias_pos..].find("<w:sdtContent>") {
                        let sdt_content_pos = actual_alias_pos + sdt_content_start;

                        if let Some(sdt_content_end) = result[sdt_content_pos..].find("</w:sdtContent>") {
                            let sdt_content_end_pos = sdt_content_pos + sdt_content_end;

                            let mut content = result[sdt_content_pos..sdt_content_end_pos].to_string();

                            if let Some(t_start) = content.find("<w:t>") {
                                if let Some(t_end) = content[t_start..].find("</w:t>") {
                                    let t_end_pos = t_start + t_end;
                                    content.replace_range(t_start + 5..t_end_pos, val_str);
                                }
                            }

                            result.replace_range(sdt_content_pos..sdt_content_end_pos, &content);
                            search_pos = sdt_content_end_pos;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
            }
        }
    }

    result
}

/// Hilfsfunktion: einfaches Regex-Capture ohne externes Regex-Crate.
/// Sucht ALLE Vorkommen des Musters im Text (nicht nur das erste).
fn regex_captures(text: &str, pattern: &str) -> Vec<String> {
    let mut results = Vec::new();
    // Parse pattern like r#"Id="rId(\d+)""#
    let Some(paren_pos) = pattern.find('(') else { return results };
    let Some(paren_end) = pattern.find(')') else { return results };
    let prefix = &pattern[..paren_pos];
    let suffix = &pattern[paren_end + 1..];

    let mut search_from = 0usize;
    loop {
        // Suche nach dem nächsten Vorkommen ab search_from
        if let Some(start_idx) = text[search_from..].find(prefix) {
            let actual_start = search_from + start_idx;
            let after = &text[actual_start + prefix.len()..];
            if let Some(end_idx) = after.find(suffix) {
                results.push(after[..end_idx].to_string());
                // Weitersuchen nach dem nächsten Vorkommen nach diesem Match
                search_from = actual_start + prefix.len() + end_idx + suffix.len();
            } else {
                break;
            }
        } else {
            break;
        }
    }
    results
}

/// Konvertiert DOCX-Bytes zu PDF-Bytes mittels LibreOffice.
/// Erwartet, dass `libreoffice` im PATH verfügbar ist (im Docker-Image bereitgestellt).
fn docx_to_pdf(docx_data: &[u8]) -> anyhow::Result<Vec<u8>> {
    use std::process::Command;

    // Erstelle ein temporäres Verzeichnis für die Dateien
    let temp_dir = tempfile::tempdir()?;
    let docx_path = temp_dir.path().join("template.docx");
    let pdf_path = temp_dir.path().join("template.pdf");

    // Schreibe die DOCX-Daten in die temporäre Datei
    std::fs::write(&docx_path, docx_data)?;

    // Führe LibreOffice aus: konvertiere DOCX zu PDF
    // -env:UserInstallation=... vermeidet "User installation could not be completed"
    // indem ein beschreibbares Profil-Verzeichnis in /tmp verwendet wird
    let profile_dir = temp_dir.path().join("lo-profile");
    std::fs::create_dir_all(&profile_dir)?;
    let output = Command::new("libreoffice")
        .args(&[
            "--headless",
            "-env:UserInstallation",
            &format!("file://{}", profile_dir.display()),
            "--convert-to",
            "pdf:writer_pdf_Export",
            "--outdir",
            temp_dir.path().to_str().unwrap(),
            docx_path.to_str().unwrap()
        ])
        .output()?;

    if !output.status.success() {
        let err_msg = String::from_utf8_lossy(&output.stderr);
        return Err(anyhow::anyhow!("LibreOffice konvertierung fehlgeschlagen: {}", err_msg));
    }

    // Lese die erzeugte PDF-Datei
    let pdf_data = std::fs::read(&pdf_path)?;

    // Temporäres Verzeichnis wird automatisch bereinigt wenn temp_dir out of scope geht
    Ok(pdf_data)
}

async fn generate_certificate_pdf(
    state: &AppState,
    certificate: &ParticipationCertificate,
) -> AppResult<Vec<u8>> {
    // Get ff_name from settings
    let ff_name: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'ff_name'"
    )
    .fetch_optional(&state.db)
    .await
    .ok()
    .flatten();

    // Read stempel image if available
    let stempel_image = read_stempel_image(state).await.unwrap_or(None);

    // Read signature from the user who signed the certificate (or the unit leader)
    let signature_data = if let Some(signed_by) = certificate.signed_by {
        let sig: Option<String> = sqlx::query_scalar(
            "SELECT signature FROM users WHERE id = $1"
        )
        .bind(signed_by)
        .fetch_optional(&state.db)
        .await
        .ok()
        .flatten();
        sig
    } else {
        None
    };

    // Global template laden (falls vorhanden)
    let template_path = FsPath::new(&state.config.data_dir).join("teilnahmebescheinigung_template.docx");
    let template_data = if template_path.exists() {
        tokio::fs::read(&template_path).await.ok()
    } else {
        None
    };

    // Versuche, das DOCX-Template zu füllen und zu PDF zu konvertieren
    if let Some(ref template_bytes) = template_data {
        let mut values = serde_json::Map::new();
        // Teilnehmer‑Name – beide Varianten versuchen
        values.insert("Name".to_string(), serde_json::Value::String(
            certificate.username.clone().unwrap_or_default()
        ));
        values.insert("name".to_string(), serde_json::Value::String(
            certificate.username.clone().unwrap_or_default()
        ));
        values.insert("date".to_string(), serde_json::Value::String(
            certificate.start_date.format("%d.%m.%Y").to_string()
        ));
        values.insert("date2".to_string(), serde_json::Value::String(
            certificate.end_date.format("%d.%m.%Y").to_string()
        ));
        values.insert("time-start".to_string(), serde_json::Value::String(
            certificate.alarm_time.format("%H:%M").to_string()
        ));
        values.insert("time-stop".to_string(), serde_json::Value::String(
            certificate.end_time.format("%H:%M").to_string()
        ));
        values.insert("name-gf".to_string(), serde_json::Value::String(
            certificate.unit_leader_name.clone().unwrap_or_default()
        ));
        // Unterschrift als Data-URI einbetten, falls vorhanden
        values.insert("sing".to_string(), serde_json::Value::String(
            signature_data
                .as_ref()
                .map(|s| s.to_string())
                .unwrap_or_else(|| "—".to_string())
        ));
        // Stempel als Data-URI einbetten, falls vorhanden
        values.insert("stempel".to_string(), serde_json::Value::String(
            stempel_image
                .as_ref()
                .map(|data| {
                    let b64 = general_purpose::STANDARD.encode(data);
                    format!("data:image/png;base64,{}", b64)
                })
                .unwrap_or_else(|| "—".to_string())
        ));

        match fill_docx_template(template_bytes, &values) {
            Ok(filled_docx) => {
                match docx_to_pdf(&filled_docx) {
                    Ok(pdf_bytes) => {
                        return Ok(pdf_bytes);
                    }
                    Err(e) => {
                        // Fallback: LibreOffice nicht verfügbar oder Fehler
                        tracing::warn!("DOCX→PDF Konvertierung fehlgeschlagen, nutze PdfBuilder: {}", e);
                    }
                }
            }
            Err(e) => {
                tracing::warn!("DOCX-Template-Füllung fehlgeschlagen, nutze PdfBuilder: {}", e);
            }
        }
    }

    // Fallback: PdfBuilder wie zuvor
    let mut builder = PdfBuilder::new("Teilnahmebescheinigung Feuerwehreinsatz")
        .heading(ff_name.unwrap_or_else(|| "Feuerwehr".to_string()))
        .sub_heading("Teilnahmebescheinigung Feuerwehreinsatz")
        .text_block(
            "Hiermit wird bescheinigt, dass der/die unten genannte Einsatzkraft am beschriebenen Einsatz teilgenommen hat.",
        )
        .spacer(4.0)
        .key_value(
            "Teilnehmer/in",
            certificate.username.clone().unwrap_or_default(),
        )
        .key_value(
            "Einsatzzeitraum",
            format!(
                "{} bis {}",
                certificate.start_date.format("%d.%m.%Y"),
                certificate.end_date.format("%d.%m.%Y")
            ),
        )
        .key_value(
            "Alarmzeit",
            certificate.alarm_time.format("%H:%M").to_string(),
        )
        .key_value(
            "Einsatzende",
            certificate.end_time.format("%H:%M").to_string(),
        )
        .key_value(
            "Einheitsführer/in",
            certificate
                .unit_leader_name
                .clone()
                .unwrap_or_else(|| "—".to_string()),
        );

    // Include stamp image if available
    if let Some(ref stempel_data) = stempel_image {
        builder = builder
            .spacer(6.0)
            .signature_image(stempel_data.clone(), 40.0, 30.0);
    }

    builder
        .spacer(6.0)
        .key_value(
            "Unterschrift",
            certificate
                .signed_by_name
                .clone()
                .unwrap_or_else(|| "—".to_string()),
        )
        .spacer(4.0)
        .text_block(
            "Diese Bescheinigung wurde digital erstellt und ist ohne Unterschrift nicht gültig.",
        )
        .build(&crate::pdf::load_font_bytes())
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))
}

// ── Routes ───────────────────────────────────────────────────────

pub async fn list_certificates(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Query(query): Query<CertificateQuery>,
) -> AppResult<Json<Vec<ParticipationCertificate>>> {
    let perm_level = get_certificate_permission_level(&state, &claims).await?;
    let user_id = claims.sub;

    // If user has no permission, return empty list
    if perm_level == CertificatePermissionLevel::None {
        return Ok(Json(vec![]));
    }

    let certificates = sqlx::query_as::<_, ParticipationCertificate>(
        "SELECT pc.id, pc.user_id, COALESCE(u.display_name, u.username) as username,
                pc.start_date, pc.end_date, pc.alarm_time, pc.end_time,
                pc.unit_leader_id, COALESCE(ul.display_name, ul.username) as unit_leader_name,
                pc.status, pc.created_at, pc.approved_at, pc.signed_at,
                pc.signed_by,
                (SELECT display_name FROM users WHERE id = pc.signed_by) as signed_by_name,
                pc.template_path
         FROM participation_certificates pc
         JOIN users u ON u.id = pc.user_id
         LEFT JOIN users ul ON ul.id = pc.unit_leader_id
         WHERE 1=1
           AND ($1::uuid IS NULL OR pc.user_id = $1)
           AND ($2::text IS NULL OR pc.status = $2)
           AND ($3::uuid IS NULL OR pc.unit_leader_id = $3)
         ORDER BY pc.created_at DESC"
    )
    .bind(query.user_id)
    .bind(query.status)
    .bind(query.unit_leader_id)
    .fetch_all(&state.db)
    .await?;

    // Filter based on permission level:
    // - Admin: see all certificates
    // - Write: see own certificates + certificates where user is unit leader
    // - Read: see only own certificates
    let filtered: Vec<ParticipationCertificate> = certificates
        .into_iter()
        .filter(|cert| {
            perm_level == CertificatePermissionLevel::Admin
                || (perm_level == CertificatePermissionLevel::Write
                    && (cert.user_id == user_id || cert.unit_leader_id == Some(user_id)))
                || (perm_level == CertificatePermissionLevel::Read && cert.user_id == user_id)
        })
        .collect();

    Ok(Json(filtered))
}

pub async fn get_certificate_by_id(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<ParticipationCertificate>> {
    fetch_certificate_by_id(&state, id, &claims).await.map(Json)
}

pub async fn get_certificate_pdf(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<(
    axum::http::HeaderMap,
    Vec<u8>,
)> {
    let certificate = fetch_certificate_by_id(&state, id, &claims).await?;
    let pdf = generate_certificate_pdf(&state, &certificate).await?;

    let mut headers = axum::http::HeaderMap::new();
    headers.insert(
        axum::http::header::CONTENT_TYPE,
        axum::http::HeaderValue::from_static("application/pdf"),
    );
    headers.insert(
        axum::http::header::CONTENT_DISPOSITION,
        axum::http::HeaderValue::from_str(&format!(
            "attachment; filename=\"teilnahmebescheinigung-{}.pdf\"",
            id.hyphenated()
        )).map_err(|_| {
            AppError::Internal(anyhow::anyhow!("Invalid header"))
        })?,
    );

    Ok((headers, pdf))
}

pub async fn create_certificate(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<CreateCertificateBody>,
) -> AppResult<Json<ParticipationCertificate>> {
    if body.end_date < body.start_date {
        return Err(AppError::BadRequest("Enddatum muss nach Startdatum liegen".into()));
    }

    let leader_exists: bool = sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (SELECT 1 FROM users WHERE id = $1)"
    )
    .bind(body.unit_leader_id)
    .fetch_one(&state.db)
    .await?;

    if !leader_exists {
        return Err(AppError::BadRequest("Einheitsführer nicht gefunden".into()));
    }

    let certificate = sqlx::query_as::<_, ParticipationCertificate>(
        "WITH inserted AS (
            INSERT INTO participation_certificates
                (user_id, start_date, end_date, alarm_time, end_time, unit_leader_id, status)
            VALUES ($1, $2, $3, $4, $5, $6, 'pending')
            RETURNING id, user_id, start_date, end_date, alarm_time, end_time,
                      unit_leader_id, status, created_at
        )
        SELECT i.id, i.user_id, u.username, i.start_date, i.end_date, i.alarm_time, i.end_time,
               i.unit_leader_id, COALESCE(ul.display_name, ul.username) as unit_leader_name,
               i.status, i.created_at,
               NULL::timestamptz as approved_at,
               NULL::timestamptz as signed_at,
               NULL::uuid as signed_by,
               NULL::text as signed_by_name,
               NULL::text as template_path
        FROM inserted i
        JOIN users u ON u.id = i.user_id
        LEFT JOIN users ul ON ul.id = i.unit_leader_id
        "
    )
    .bind(claims.sub)
    .bind(body.start_date)
    .bind(body.end_date)
    .bind(body.alarm_time)
    .bind(body.end_time)
    .bind(body.unit_leader_id)
    .fetch_one(&state.db)
    .await?;

    Ok(Json(certificate))
}

pub async fn delete_certificate(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
) -> AppResult<Json<serde_json::Value>> {
    // First check if user has access to this certificate (owner, leader, or admin)
    let cert = fetch_certificate_by_id(&state, id, &claims).await?;

    let perm_level = get_certificate_permission_level(&state, &claims).await?;
    let user_id = claims.sub;

    // Allow delete if user is the creator OR has admin permission
    let is_creator = cert.user_id == user_id;
    let is_admin = perm_level == CertificatePermissionLevel::Admin;
    if !is_creator && !is_admin {
        return Err(AppError::Forbidden);
    }

    let result = sqlx::query("DELETE FROM participation_certificates WHERE id = $1")
        .bind(id)
        .execute(&state.db)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound);
    }

    Ok(Json(serde_json::json!({ "message": "Bescheinigung gelöscht" })))
}

pub async fn update_certificate_status(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Path(id): Path<Uuid>,
    Json(body): Json<UpdateStatusBody>,
) -> AppResult<Json<ParticipationCertificate>> {
    let new_status = body.status;

    if new_status != "approved" && new_status != "rejected" && new_status != "signed" {
        return Err(AppError::BadRequest("Ungültiger Status".into()));
    }

    // Check permission to update status: admin (global or module) or schreiben
    let has_admin_perm = claims.is_admin_or_above()
        || sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("teilnahmebescheinigung.admin")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?;

    let is_schreiben = if has_admin_perm {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("teilnahmebescheinigung.schreiben")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !has_admin_perm && !is_schreiben {
        return Err(AppError::Forbidden);
    }

    // Check if user has access to this certificate (owner, leader, or admin)
    let cert = fetch_certificate_by_id(&state, id, &claims).await?;

    sqlx::query(
        "UPDATE participation_certificates
         SET status = $1,
             approved_at = CASE WHEN $1 IN ('approved','signed') THEN NOW() ELSE approved_at END,
             signed_at = CASE WHEN $1 = 'signed' THEN NOW() ELSE signed_at END,
             signed_by = CASE WHEN $1 = 'signed' THEN $2 ELSE signed_by END
         WHERE id = $3"
    )
    .bind(&new_status)
    .bind(claims.sub)
    .bind(id)
    .execute(&state.db)
    .await?;

    fetch_certificate_by_id(&state, id, &claims).await.map(Json)
}

// ── Template upload (Admin only) ──────────────────────────────

/// Handle multipart form data for template upload
pub async fn upload_template(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() == Some("file") {
            let content_type = field.content_type().unwrap_or("").to_string();
            let is_docx = content_type
                .starts_with("application/vnd.openxmlformats-officedocument.wordprocessingml.document")
                || field.file_name().map_or(false, |n| n.to_lowercase().ends_with(".docx"));
            if !is_docx {
                return Err(AppError::BadRequest("Nur DOCX-Dateien erlaubt".into()));
            }

            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;

            const MAX_TEMPLATE_SIZE: usize = 20 * 1024 * 1024; // 20 MB
            if data.len() > MAX_TEMPLATE_SIZE {
                return Err(AppError::BadRequest("Template zu groß (max. 20 MB)".into()));
            }

            let dir = FsPath::new(&state.config.data_dir);
            fs::create_dir_all(dir)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            fs::write(dir.join("teilnahmebescheinigung_template.docx"), &data)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            // Mark template as uploaded in settings
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_template', $1)
                 ON CONFLICT (key) DO UPDATE SET value = $1"
            )
            .bind("uploaded")
            .execute(&state.db)
            .await?;

            return Ok(Json(serde_json::json!({ "ok": true })));
        }
    }

    Err(AppError::BadRequest("Keine Datei im Request gefunden".into()))
}

/// Delete the uploaded template (Admin only)
pub async fn delete_template(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let path = FsPath::new(&state.config.data_dir).join("teilnahmebescheinigung_template.docx");
    if path.exists() {
        fs::remove_file(&path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
    }

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_template', '')
         ON CONFLICT (key) DO UPDATE SET value = ''"
    )
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Get template status (whether a template is uploaded)
pub async fn get_template(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let has_template: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'teilnahmebescheinigung_template'"
    )
    .fetch_optional(&state.db)
    .await?;

    let has_template = has_template.map_or(false, |v| v == "uploaded");
    let path = FsPath::new(&state.config.data_dir).join("teilnahmebescheinigung_template.docx");
    let file_exists = path.exists();

    Ok(Json(serde_json::json!({
        "has_template": has_template && file_exists,
        "template_path": if has_template && file_exists { "teilnahmebescheinigung_template.docx" } else { "" }
    })))
}

// ── Stempel (Stamp) upload (Admin only) ──────────────────────

/// Handle multipart form data for stamp upload (image file)
pub async fn upload_stempel(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    mut multipart: Multipart,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    while let Some(field) = multipart
        .next_field()
        .await
        .map_err(|e| AppError::BadRequest(e.to_string()))?
    {
        if field.name() == Some("file") {
            let content_type = field.content_type().unwrap_or("").to_string();
            if !content_type.starts_with("image/") {
                return Err(AppError::BadRequest("Nur Bilddateien erlaubt".into()));
            }

            let data = field
                .bytes()
                .await
                .map_err(|e| AppError::BadRequest(e.to_string()))?;

            const MAX_STAMP_SIZE: usize = 5 * 1024 * 1024; // 5 MB
            if data.len() > MAX_STAMP_SIZE {
                return Err(AppError::BadRequest("Stempel zu groß (max. 5 MB)".into()));
            }

            let dir = FsPath::new(&state.config.data_dir);
            fs::create_dir_all(dir)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;
            fs::write(dir.join("teilnahmebescheinigung_stempel.png"), &data)
                .await
                .map_err(|e| AppError::Internal(e.into()))?;

            // Mark stamp as uploaded in settings
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_stempel', $1)
                 ON CONFLICT (key) DO UPDATE SET value = $1"
            )
            .bind("uploaded")
            .execute(&state.db)
            .await?;

            return Ok(Json(serde_json::json!({ "ok": true })));
        }
    }

    Err(AppError::BadRequest("Keine Datei im Request gefunden".into()))
}

/// Delete the uploaded stamp (Admin only)
pub async fn delete_stempel(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    if !claims.is_admin_or_above() {
        return Err(AppError::Forbidden);
    }

    let path = FsPath::new(&state.config.data_dir).join("teilnahmebescheinigung_stempel.png");
    if path.exists() {
        fs::remove_file(&path)
            .await
            .map_err(|e| AppError::Internal(e.into()))?;
    }

    sqlx::query(
        "INSERT INTO settings (key, value) VALUES ('teilnahmebescheinigung_stempel', '')
         ON CONFLICT (key) DO UPDATE SET value = ''"
    )
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

/// Get stamp status
pub async fn get_stempel(
    State(state): State<AppState>,
) -> AppResult<Json<serde_json::Value>> {
    let has_stempel: Option<String> = sqlx::query_scalar(
        "SELECT value FROM settings WHERE key = 'teilnahmebescheinigung_stempel'"
    )
    .fetch_optional(&state.db)
    .await?;

    let has_stempel = has_stempel.map_or(false, |v| v == "uploaded");
    let path = FsPath::new(&state.config.data_dir).join("teilnahmebescheinigung_stempel.png");
    let file_exists = path.exists();

    Ok(Json(serde_json::json!({
        "has_stempel": has_stempel && file_exists,
    })))
}

// ── Signature endpoints ───────────────────────────────────────

pub async fn upload_signature(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
    Json(body): Json<serde_json::Value>,
) -> AppResult<Json<serde_json::Value>> {
    let has_schreiben = if claims.is_admin_or_above() {
        true
    } else {
        sqlx::query_scalar::<_, bool>(
            "SELECT $1 = ANY(
                SELECT unnest(COALESCE(u.permissions, '{}') || COALESCE(r.permissions, '{}'))
                FROM users u LEFT JOIN roles r ON r.id = u.role_id WHERE u.id = $2
             )"
        )
        .bind("teilnahmebescheinigung.schreiben")
        .bind(claims.sub)
        .fetch_one(&state.db)
        .await?
    };

    if !has_schreiben {
        return Err(AppError::Forbidden);
    }

    let signature: String = body["signature"]
        .as_str()
        .ok_or(AppError::BadRequest("Signature erforderlich".into()))?
        .to_string();

    sqlx::query(
        "UPDATE users SET signature = $1 WHERE id = $2"
    )
    .bind(&signature)
    .bind(claims.sub)
    .execute(&state.db)
    .await?;

    Ok(Json(serde_json::json!({ "ok": true })))
}

pub async fn get_signature(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<serde_json::Value>> {
    let signature: Option<String> = sqlx::query_scalar(
        "SELECT signature FROM users WHERE id = $1"
    )
    .bind(claims.sub)
    .fetch_optional(&state.db)
    .await?;

    Ok(Json(serde_json::json!({
        "signature": signature.unwrap_or_default()
    })))
}

// ── Handler: Alle Einheitsführer laden ────────────────────────────

pub async fn list_unit_leaders(
    State(state): State<AppState>,
    Extension(claims): Extension<Claims>,
) -> AppResult<Json<Vec<UnitLeaderEntry>>> {
    let leaders = sqlx::query_as::<_, UnitLeaderEntry>(
        "SELECT u.id, u.username, u.display_name
         FROM users u
         WHERE EXISTS (
             SELECT 1
             FROM (
                 SELECT unnest(COALESCE(u.permissions, '{}')) AS perm
                 UNION
                 SELECT unnest(COALESCE(r.permissions, '{}'))
                 FROM roles r WHERE r.id = u.role_id
                 UNION
                 SELECT unnest(fr.permissions)
                 FROM user_functions uf
                 JOIN roles fr ON fr.id = uf.role_id
                 WHERE uf.user_id = u.id
             ) perms
             WHERE perms.perm IN ('teilnahmebescheinigung.schreiben', 'teilnahmebescheinigung.admin')
         )
         ORDER BY COALESCE(u.display_name, u.username) ASC"
    )
    .fetch_all(&state.db)
    .await?;

    Ok(Json(leaders))
}

// ── Router ──────────────────────────────────────────────────────

pub fn router(state: AppState) -> Router<AppState> {
    Router::new()
        .route("/", get(list_certificates).post(create_certificate))
        .route("/:id", get(get_certificate_by_id).delete(delete_certificate))
        .route("/:id/pdf", get(get_certificate_pdf))
        .route("/:id/status", put(update_certificate_status))
        .route("/template", post(upload_template).get(get_template).delete(delete_template))
        .route("/signature", post(upload_signature).get(get_signature))
        .route("/stempel", post(upload_stempel).get(get_stempel).delete(delete_stempel))
        .route("/unit-leaders", get(list_unit_leaders))
        .route_layer(middleware::from_fn_with_state(state.clone(), require_module("teilnahmebescheinigung")))
        .route_layer(middleware::from_fn_with_state(state, require_auth))
}