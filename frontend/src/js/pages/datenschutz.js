import { esc } from '../utils.js';

export async function renderDatenschutz() {
  const app = document.getElementById('app');
  app.innerHTML = '<div style="max-width:800px;margin:40px auto;padding:0 20px"><p style="color:var(--text-muted)">Lade...</p></div>';

  let s = {};
  try {
    const res = await fetch('/api/settings/public');
    if (res.ok) s = await res.json();
  } catch (_) { /* Fallback: leere Felder */ }

  const orgName    = s.ff_name    || '(Name der Feuerwehr)';
  const orgStrasse = s.ff_strasse || '';
  const orgOrt     = s.ff_ort     || '';
  const kontaktName    = s.datenschutz_kontakt_name    || '(Verantwortliche Person)';
  const kontaktEmail   = s.datenschutz_kontakt_email   || '(E-Mail)';
  const kontaktTel     = s.datenschutz_kontakt_telefon || '';
  const hoster         = s.datenschutz_hoster          || 'Eigener Server';

  const adresse = [orgStrasse, orgOrt].filter(Boolean).join(', ');

  app.innerHTML = `
    <div style="max-width:800px;margin:40px auto;padding:0 20px 60px">
      <div style="margin-bottom:24px">
        <a href="#/login" style="color:var(--primary);font-size:13px">← Zurück zur Anmeldung</a>
      </div>
      <h1 style="font-size:24px;font-weight:700;margin-bottom:4px">Datenschutzerklärung</h1>
      <p style="color:var(--text-muted);font-size:13px;margin-bottom:32px">
        ${esc(orgName)}${adresse ? ' · ' + esc(adresse) : ''}
      </p>

      <div class="dse-section">
        <h2>1. Verantwortlicher (Art. 13 Abs. 1 DSGVO)</h2>
        <p>Verantwortlich für die Verarbeitung personenbezogener Daten in dieser FeuerwehrHub-Instanz ist:</p>
        <p>
          <strong>${esc(orgName)}</strong><br>
          ${adresse ? esc(adresse) + '<br>' : ''}
          Kontakt: ${esc(kontaktName)}<br>
          E-Mail: <a href="mailto:${esc(kontaktEmail)}">${esc(kontaktEmail)}</a>
          ${kontaktTel ? '<br>Telefon: ' + esc(kontaktTel) : ''}
        </p>
      </div>

      <div class="dse-section">
        <h2>2. Verarbeitete Daten und Zweck</h2>
        <p>FeuerwehrHub verarbeitet folgende personenbezogene Daten zur digitalen Verwaltung des Feuerwehrdienstes:</p>
        <table class="dse-table">
          <thead><tr><th>Datenkategorie</th><th>Felder</th><th>Zweck</th></tr></thead>
          <tbody>
            <tr><td>Zugangsdaten</td><td>Benutzername, Passwort-Hash</td><td>Authentifizierung</td></tr>
            <tr><td>Stammdaten</td><td>Anzeigename, Personalnummer, Eintrittsdatum</td><td>Mitgliederverwaltung</td></tr>
            <tr><td>Kontaktdaten <em>(verschlüsselt)</em></td><td>Telefon, private E-Mail, Anschrift</td><td>Erreichbarkeit im Einsatzfall</td></tr>
            <tr><td>Gesundheitsdaten (Art. 9 DSGVO)</td><td>Qualifikationen mit medizinischem Bezug (z.&thinsp;B. Atemschutz G26/3)</td><td>Eignungsnachweis für Atemschutzgeräteträger</td></tr>
            <tr><td>Notfallkontakte <em>(verschlüsselt)</em></td><td>Name, Telefon der Notfallkontaktperson</td><td>Benachrichtigung bei Unfall</td></tr>
            <tr><td>Zeiterfassung</td><td>Stempelzeiten, Dienstart, Terminbezug</td><td>Stundennachweis, Fördermittel</td></tr>
            <tr><td>Ausrüstung</td><td>Pager, Schlüssel, Ausweise</td><td>Inventarverwaltung</td></tr>
            <tr><td>Qualifikationen &amp; Ehrungen</td><td>Aus-/Weiterbildungen, Auszeichnungen</td><td>Qualifikationsnachweis</td></tr>
            <tr><td>Anwesenheit</td><td>Teilnahme an Übungen und Einsätzen</td><td>Leistungsnachweis</td></tr>
            <tr><td>Audit-Protokoll</td><td>Datenzugriffe, Änderungen an Personaldaten</td><td>Nachvollziehbarkeit (Art. 5 Abs. 2 DSGVO)</td></tr>
          </tbody>
        </table>
      </div>

      <div class="dse-section">
        <h2>3. Rechtsgrundlagen</h2>
        <ul>
          <li><strong>Art. 6 Abs. 1 lit. c DSGVO</strong> — Erfüllung gesetzlicher Pflichten (Brandschutzgesetze des jeweiligen Bundeslandes)</li>
          <li><strong>Art. 6 Abs. 1 lit. e DSGVO</strong> — Aufgabe im öffentlichen Interesse (für Feuerwehren als Teil der öffentlichen Gefahrenabwehr)</li>
          <li><strong>Art. 6 Abs. 1 lit. b DSGVO</strong> — Vertragserfüllung / Vereinsmitgliedschaft (für eingetragene Vereine)</li>
          <li><strong>Art. 9 Abs. 2 lit. b DSGVO</strong> — Verarbeitung von Gesundheitsdaten im Beschäftigungs- und Sozialschutzkontext (Atemschutzeignung)</li>
        </ul>
      </div>

      <div class="dse-section">
        <h2>4. Technische und organisatorische Schutzmaßnahmen (Art. 32 DSGVO)</h2>
        <ul>
          <li>Kontaktdaten werden mit <strong>AES-256-GCM</strong> verschlüsselt in der Datenbank gespeichert</li>
          <li>Passwörter werden mit <strong>bcrypt</strong> gehasht — nie im Klartext gespeichert</li>
          <li>Optionale <strong>Zwei-Faktor-Authentifizierung (TOTP)</strong></li>
          <li>Zugriff auf Gesundheitsdaten (Art. 9) auf Admins und die betreffende Person beschränkt</li>
          <li>Vollständiges <strong>Audit-Logging</strong> aller Zugriffe auf personenbezogene Daten</li>
          <li>Kommunikation ausschließlich über <strong>HTTPS</strong></li>
          <li>Rate-Limiting auf allen Authentifizierungsendpunkten</li>
        </ul>
      </div>

      <div class="dse-section">
        <h2>5. Datenweitergabe und Auftragsverarbeitung</h2>
        <p>Personenbezogene Daten werden nicht an Dritte weitergegeben, soweit dies nicht gesetzlich vorgeschrieben ist (z.&thinsp;B. Weitergabe von Einsatzdaten an Leitstellen).</p>
        <p><strong>Server-/Datenbankbetrieb:</strong> ${esc(hoster)}</p>
        <p>Sofern ein externer Hoster eingesetzt wird, besteht ein Auftragsverarbeitungsvertrag (AVV) gemäß Art. 28 DSGVO.</p>
      </div>

      <div class="dse-section">
        <h2>6. Speicherdauer und Löschfristen</h2>
        <table class="dse-table">
          <thead><tr><th>Datenkategorie</th><th>Frist</th></tr></thead>
          <tbody>
            <tr><td>Aktive Mitglieder</td><td>Löschung auf Antrag (Art. 17 DSGVO) oder bei Austritt nach Ablauf gesetzlicher Aufbewahrungsfristen</td></tr>
            <tr><td>Zeiterfassungsdaten</td><td>10 Jahre (steuer- und handelsrechtliche Aufbewahrungspflichten)</td></tr>
            <tr><td>Audit-Protokoll</td><td>3 Jahre</td></tr>
            <tr><td>Passworte (Hashes)</td><td>Bis zur Accountlöschung</td></tr>
          </tbody>
        </table>
      </div>

      <div class="dse-section">
        <h2>7. Ihre Rechte als betroffene Person</h2>
        <p>Sie haben nach der DSGVO folgende Rechte gegenüber dem Verantwortlichen:</p>
        <ul>
          <li><strong>Auskunft (Art. 15 DSGVO):</strong> Vollständiger Datenexport als JSON-Datei unter <em>Mein Bereich → Datenschutz → Meine Daten exportieren</em></li>
          <li><strong>Berichtigung (Art. 16 DSGVO):</strong> Änderung eigener Daten unter <em>Mein Bereich → Profil</em></li>
          <li><strong>Löschung (Art. 17 DSGVO):</strong> Antrag direkt beim oben genannten Datenschutzkontakt</li>
          <li><strong>Einschränkung der Verarbeitung (Art. 18 DSGVO)</strong></li>
          <li><strong>Datenübertragbarkeit (Art. 20 DSGVO):</strong> JSON-Export verfügbar (s. Art. 15)</li>
          <li><strong>Widerspruch (Art. 21 DSGVO)</strong></li>
        </ul>
      </div>

      <div class="dse-section">
        <h2>8. Beschwerderecht</h2>
        <p>Sie haben das Recht, sich bei der zuständigen Datenschutzaufsichtsbehörde Ihres Bundeslandes zu beschweren, wenn Sie der Ansicht sind, dass die Verarbeitung Ihrer personenbezogenen Daten gegen die DSGVO verstößt.</p>
        <p>Eine Liste der Landesbehörden finden Sie auf der Website der Bundesbeauftragten für den Datenschutz: <a href="https://www.bfdi.bund.de" target="_blank" rel="noopener noreferrer">www.bfdi.bund.de</a></p>
      </div>

      <p style="font-size:12px;color:var(--text-muted);margin-top:40px;border-top:1px solid var(--border);padding-top:16px">
        Diese Datenschutzerklärung wurde mit FeuerwehrHub generiert und ist auf den spezifischen Einsatz dieser Software zugeschnitten.
        Sie sollte durch einen Datenschutzbeauftragten oder Rechtsanwalt auf Vollständigkeit und Aktualität geprüft werden.
        Stand: ${new Date().toLocaleDateString('de-DE', { year: 'numeric', month: 'long' })}
      </p>
    </div>

    <style>
      .dse-section { margin-bottom: 32px; }
      .dse-section h2 { font-size: 16px; font-weight: 700; margin-bottom: 12px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
      .dse-section p, .dse-section li { font-size: 14px; line-height: 1.7; color: var(--text); margin-bottom: 8px; }
      .dse-section ul { padding-left: 20px; }
      .dse-section a { color: var(--primary); }
      .dse-table { width: 100%; border-collapse: collapse; font-size: 13px; margin-top: 8px; }
      .dse-table th { text-align: left; padding: 8px 12px; background: var(--bg-card-hover); border-bottom: 2px solid var(--border); font-weight: 600; }
      .dse-table td { padding: 8px 12px; border-bottom: 1px solid var(--border); vertical-align: top; }
    </style>
  `;
}
