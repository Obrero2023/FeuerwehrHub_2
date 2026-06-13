import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc } from '../utils.js';
import { icon, renderIcons } from '../icons.js';
import QRCode from 'qrcode';

const ROLE_LABELS = {
  superuser: 'Superuser',
  admin:     'Admin',
  user:      'Benutzer',
};

const MODULE_LABELS = {
  'lager.read':              'Lager (Nur lesen)',
  lager:                     'Lager (Schreiben)',
  'lager.approve':           'Lager (Genehmigen)',
  personal:                  'Personal',
  fahrzeuge:                 'Technik & Geräte',
  'einsatzberichte.read':    'Einsatzberichte (Nur lesen)',
  einsatzberichte:           'Einsatzberichte (Schreiben)',
  'einsatzberichte.approve': 'Einsatzberichte (Genehmigen)',
  verein:                    'Vereinsverwaltung',
};

export async function renderAdmin() {
  const [settings, me] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, me, settings?.modules);
  renderShell('admin');

  // Zugriffsprüfung
  if (me?.role !== 'superuser' && me?.role !== 'admin') {
    document.getElementById('page-content').innerHTML =
      `<div class="page-header"><div><h2>Kein Zugriff</h2><p>Nur Admins können diese Seite aufrufen.</p></div></div>`;
    return;
  }

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Admin Panel</h2>
        <p>Benutzerverwaltung und Konfiguration</p>
      </div>
    </div>

    <div id="update-banner" class="alert-success update-banner" style="display:none">
      <span>${icon('arrow-up-circle', 16)}</span>
      <span id="update-banner-text"></span>
      <a id="update-banner-link" href="#" target="_blank" class="text-success admin-banner-link">Releases ansehen</a>
    </div>

    <style>@keyframes spin { to { transform: rotate(360deg); } }</style>

    <div class="tab-bar">
      <button class="tab-btn tab-btn--active" data-tab="users">Benutzer</button>
      <button class="tab-btn" data-tab="roles">Rollen</button>
      <button class="tab-btn" data-tab="modules">Module</button>
      <button class="tab-btn" data-tab="einsatzarten">Einsatzarten</button>
      <button class="tab-btn" data-tab="config">Konfiguration</button>
      <button class="tab-btn" data-tab="dienstausweise">Dienstausweise</button>
      <button class="tab-btn" data-tab="audit">Audit-Log</button>
      <button class="tab-btn" data-tab="container-log">Container-Log</button>
      <button class="tab-btn" data-tab="integrations">Schnittstellen</button>
    </div>

    <div id="tab-users" class="tab-panel">
      <div class="card">
        <div class="card__header">
          <span>Benutzer</span>
          <button class="btn btn--primary btn--sm" id="btn-new-user">+ Benutzer anlegen</button>
        </div>
        <div class="card__body" id="users-table-wrap">
          <p>Lade...</p>
        </div>
      </div>
    </div>

    <div id="tab-roles" class="tab-panel" style="display:none">
      <div class="card">
        <div class="card__header">
          <span>Rollen</span>
          <button class="btn btn--primary btn--sm" id="btn-new-role">+ Rolle anlegen</button>
        </div>
        <div class="card__body" id="roles-table-wrap"><p>Lade...</p></div>
      </div>
    </div>

    <div id="tab-modules" class="tab-panel" style="display:none">
      <div class="card">
        <div class="card__header">Module aktivieren / deaktivieren</div>
        <div class="card__body" id="modules-list">
          <p>Lade...</p>
        </div>
      </div>
    </div>

    <div id="tab-einsatzarten" class="tab-panel" style="display:none">
      <div class="card">
        <div class="card__header">
          <span>Einsatzarten / Stichwortverzeichnis</span>
          <button class="btn btn--primary btn--sm" id="btn-new-einsatzart">+ Neue Einsatzart</button>
        </div>
        <div class="card__body card__body--flush">
          <div id="einsatzarten-add-form" class="ea-add-form" style="display:none">
            <div class="ea-add-grid">
              <div class="form-group form-group--compact">
                <label>Schlüssel <span class="required">*</span>
                  <span class="text-muted fw-normal">(unveränderlich)</span></label>
                <input type="text" id="ea-key" placeholder="z.B. TH2_BOOT" class="text-uppercase" />
              </div>
              <div class="form-group form-group--compact">
                <label>Bezeichnung <span class="required">*</span></label>
                <input type="text" id="ea-label" placeholder="z.B. TH2 – Boot in Not" />
              </div>
              <div class="form-group form-group--compact">
                <label>Kategorie <span class="required">*</span></label>
                <input type="text" id="ea-category" list="ea-cat-list" placeholder="z.B. Brand" />
                <datalist id="ea-cat-list"></datalist>
              </div>
              <div class="btn-group">
                <button class="btn btn--primary btn--sm" id="ea-btn-submit">Anlegen</button>
                <button class="btn btn--outline btn--sm" id="ea-btn-cancel">✕</button>
              </div>
            </div>
          </div>
          <div id="einsatzarten-list">
            <p class="wrap-loading">Lade...</p>
          </div>
        </div>
      </div>
      <p class="hint hint--inline">
        Der Schlüssel (Key) ist nach dem Anlegen nicht mehr änderbar, da er in gespeicherten Einsatzberichten als Snapshot hinterlegt wird.
        Die Bezeichnung kann jederzeit angepasst werden.
      </p>
    </div>

    <div id="tab-config" class="tab-panel" style="display:none">
      ${!settings?.datenschutz_kontakt_name || !settings?.datenschutz_kontakt_email ? `
      <div class="alert-warning dse-warning-banner" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;margin-bottom:16px;background:var(--warning-bg,#fff8e1);border:1px solid var(--warning-border,#f9a825);color:var(--warning-text,#5d4037)">
        <span style="font-size:18px">⚠️</span>
        <span style="font-size:13px;flex:1">
          <strong>Datenschutzerklärung unvollständig:</strong>
          Verantwortliche Person und/oder E-Mail fehlen — die öffentliche Datenschutzerklärung (Art. 13 DSGVO) ist damit nicht rechtskonform.
          Bitte unten ausfüllen.
        </span>
      </div>` : ''}
      <div class="card">
        <div class="card__header">Design</div>
        <div class="card__body">
          <p class="text-muted text-sm mb-md">
            Wähle das Erscheinungsbild der Oberfläche. Die Einstellung wird lokal im Browser gespeichert.
          </p>
          <div class="btn-group">
            <button id="theme-btn-light" class="btn btn--outline">☀️ Helles Design</button>
            <button id="theme-btn-dark" class="btn btn--outline">🌙 Dunkles Design</button>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card__header">Feuerwehr-Stammdaten</div>
        <div class="card__body">
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>Name der Feuerwehr</label>
              <input type="text" id="cfg-ff-name" maxlength="100" value="${esc(settings?.ff_name || '')}" />
            </div>
            <div class="form-group">
              <label>Straße & Hausnummer</label>
              <input type="text" id="cfg-ff-strasse" maxlength="100" value="${esc(settings?.ff_strasse || '')}" />
            </div>
            <div class="form-group">
              <label>PLZ & Ort</label>
              <input type="text" id="cfg-ff-ort" maxlength="100" value="${esc(settings?.ff_ort || '')}" />
            </div>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-config">Speichern</button>
          </div>
        </div>
      </div>

      <div class="card card--no-top">
        <div class="card__header">Wappen / Logo</div>
        <div class="card__body">
          <p class="text-muted text-sm mb-md">
            Lade das Wappen oder Logo deiner Feuerwehr hoch. Es erscheint auf der Anmeldeseite und in der Navigation.
            Empfohlen: PNG mit transparentem Hintergrund, max. 500 KB.
          </p>
          <div id="logo-preview" class="admin-preview-row"></div>
          <div class="form-group">
            <label>Bilddatei auswählen (PNG, JPG, SVG, WEBP)</label>
            <input type="file" id="logo-upload-input" accept="image/*" />
          </div>
          <div class="btn-group mt-sm">
            <button class="btn btn--primary" id="btn-upload-logo">Wappen speichern</button>
            <button class="btn btn--outline" id="btn-remove-logo">Standard (FH) wiederherstellen</button>
          </div>
        </div>
      </div>

      <div class="card card--no-top">
        <div class="card__header">Unterschrift</div>
        <div class="card__body">
          <p class="text-muted text-sm mb-md">
            Lade eine Unterschrift hoch. Sie wird automatisch in generierte PDFs eingesetzt
            (generisches PDF, kein Template). Empfohlen: PNG mit transparentem Hintergrund, max. 500 KB.
          </p>
          <div id="sig-preview" class="admin-preview-row"></div>
          <div class="form-group">
            <label>Bilddatei auswählen (PNG, JPG)</label>
            <input type="file" id="sig-upload-input" accept="image/png,image/jpeg" />
          </div>
          <div class="btn-group mt-sm">
            <button class="btn btn--primary" id="btn-upload-sig">Unterschrift speichern</button>
            <button class="btn btn--outline" id="btn-remove-sig">Unterschrift entfernen</button>
          </div>
        </div>
      </div>

      <div class="card card--no-top">
        <div class="card__header">Beschaffungsauftrag PDF-Vorlage</div>
        <div class="card__body">
          <p class="text-muted text-sm mb-md">
            Lade das offizielle Formular deiner Feuerwehr / Stadt hoch.
            Dieses PDF wird als Vorlage für alle Beschaffungsaufträge verwendet und mit den Bestelldaten befüllt.
          </p>
          <div id="pdf-upload-status" class="text-sm mb-sm"></div>
          <div class="form-group">
            <label>PDF-Datei auswählen</label>
            <input type="file" id="pdf-upload-input" accept=".pdf" />
          </div>
          <div class="btn-group mt-sm">
            <button class="btn btn--primary" id="btn-upload-pdf">PDF hochladen</button>
            <a class="btn btn--outline" href="/api/settings/pdf" target="_blank" id="btn-view-pdf">Aktuelles PDF ansehen</a>
            <button class="btn btn--danger" id="btn-delete-pdf" style="display:none">PDF löschen</button>
          </div>
        </div>
      </div>

      <div class="card card--no-top">
        <div class="card__header">Datenschutzerklärung — Kontaktdaten</div>
        <div class="card__body">
          <p class="text-muted text-sm mb-md">
            Diese Angaben erscheinen in der öffentlichen
            <a href="#/datenschutz" style="color:var(--primary)">Datenschutzerklärung</a>
            der FeuerwehrHub-Instanz (Art. 13 DSGVO).
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label>Verantwortliche Person</label>
              <input type="text" id="dse-name" maxlength="150"
                value="${esc(settings?.datenschutz_kontakt_name || '')}"
                placeholder="Max Mustermann" />
            </div>
            <div class="form-group">
              <label>E-Mail</label>
              <input type="email" id="dse-email" maxlength="150"
                value="${esc(settings?.datenschutz_kontakt_email || '')}"
                placeholder="datenschutz@feuerwehr-beispiel.de" />
            </div>
            <div class="form-group">
              <label>Telefon</label>
              <input type="text" id="dse-telefon" maxlength="50"
                value="${esc(settings?.datenschutz_kontakt_telefon || '')}"
                placeholder="+49 123 456789" />
            </div>
            <div class="form-group">
              <label>Hoster / Server-Standort</label>
              <input type="text" id="dse-hoster" maxlength="200"
                value="${esc(settings?.datenschutz_hoster || 'Eigener Server')}"
                placeholder="z.B. Eigener Server im Gerätehaus, Strato VPS Deutschland" />
            </div>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-dse">Speichern</button>
            <a href="#/datenschutz" class="btn btn--outline" target="_blank">Vorschau</a>
          </div>
        </div>
      </div>
    </div>

    <div id="tab-audit" class="tab-panel" style="display:none">
      <div class="card">
        <div class="card__header">
          <span>Audit-Log</span>
          <button class="btn btn--outline btn--sm" id="btn-refresh-audit">Aktualisieren</button>
        </div>
        <div class="card__body" id="audit-table-wrap"><p>Lade...</p></div>
      </div>
    </div>

    <div id="tab-container-log" class="tab-panel" style="display:none">
      <div class="card">
        <div class="card__header">
          <span>Container-Log</span>
          <button class="btn btn--outline btn--sm" id="btn-refresh-container-log">Aktualisieren</button>
        </div>
        <div class="card__body" id="container-log-wrap">
          <pre id="container-log-content" class="terminal terminal--container-log">Lade...</pre>
        </div>
      </div>
    </div>

    <div id="tab-dienstausweise" class="tab-panel" style="display:none">
      <div class="card">
        <div class="card__header">
          <span>Dienstausweise</span>
          <button class="btn btn--outline btn--sm" id="btn-print-badges">${icon('printer', 14)} Alle drucken</button>
        </div>
        <div class="card__body" id="badges-wrap">
          <p>Lade...</p>
        </div>
      </div>
    </div>

    <div id="tab-integrations" class="tab-panel" style="display:none">
      <div class="card" style="margin-bottom:16px">
        <div class="card__header">${icon('zap', 14)} DIVERA 24/7</div>
        <div class="card__body">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
            Einsätze werden automatisch importiert sobald DIVERA den Webhook auslöst.
            Trage die URL unten in DIVERA ein: <em>Administration → Schnittstellen → Datenweitergabe</em>.
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label>DIVERA API-Key (für Poll-Import)</label>
              <input type="text" id="int-divera-key" placeholder="Systemnutzer-Key aus DIVERA" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Webhook-Secret (schützt den Empfangs-Endpunkt)</label>
              <input type="password" id="int-divera-secret" placeholder="Beliebiger geheimer String" autocomplete="off" />
            </div>
            <div class="form-group form-group--full">
              <label>Webhook-URL (in DIVERA eintragen)</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="text" id="int-divera-url" readonly
                  style="background:var(--bg-input);color:var(--text-muted);font-size:12px;font-family:monospace" />
                <button class="btn btn--outline btn--sm" id="btn-copy-divera-url">${icon('copy', 13)} Kopieren</button>
              </div>
            </div>
          </div>
          <div style="display:flex;gap:8px;margin-top:4px;align-items:center">
            <button class="btn btn--outline btn--sm" id="btn-test-divera">${icon('plug', 13)} Verbindung testen</button>
            <button class="btn btn--outline btn--sm" id="btn-import-divera">${icon('download', 13)} Jetzt importieren</button>
            <span id="divera-feedback" style="font-size:12px"></span>
          </div>
        </div>
      </div>

      <div class="card" style="margin-bottom:16px">
        <div class="card__header">${icon('zap', 14)} Alamos FE2 / aPager PRO</div>
        <div class="card__body">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px">
            FE2 muss so konfiguriert sein, dass es bei Alarm einen HTTP-POST an die URL unten sendet.
            Das Secret wird in FE2 als <code>authorization</code>-Feld mitgesendet.
          </p>
          <div class="form-grid">
            <div class="form-group">
              <label>Alamos Auth-Secret</label>
              <input type="password" id="int-alamos-secret" placeholder="Identisch mit FE2-Konfiguration" autocomplete="off" />
            </div>
            <div class="form-group">
              <label>Webhook-URL (in FE2 eintragen)</label>
              <div style="display:flex;gap:8px;align-items:center">
                <input type="text" id="int-alamos-url" readonly
                  style="background:var(--bg-input);color:var(--text-muted);font-size:12px;font-family:monospace" />
                <button class="btn btn--outline btn--sm" id="btn-copy-alamos-url">${icon('copy', 13)} Kopieren</button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="display:flex;gap:8px">
        <button class="btn btn--primary" id="btn-save-integrations">${icon('save', 14)} Speichern</button>
      </div>
    </div>

    <!-- Modal: Badge-Code setzen -->
    <div id="modal-badge" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3 id="badge-modal-title">Badge-Code setzen</h3>
          <button class="modal__close" id="btn-close-badge-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Badge-Code (QR / Barcode / RFID-Kennung)</label>
            <input type="text" id="badge-code-input" maxlength="128" placeholder="z.B. FF-2026-042" autocomplete="off" />
            <small class="text-subtle">Leer lassen zum Entfernen des Codes.</small>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="btn-cancel-badge">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-badge">Speichern</button>
        </div>
      </div>
    </div>

    <!-- Modal: Neuer Benutzer -->
    <div id="modal-new-user" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3>Neuen Benutzer anlegen</h3>
          <button class="modal__close" id="btn-close-new-user">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Benutzername</label>
            <input type="text" id="new-user-name" maxlength="64" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>Passwort (mind. 8 Zeichen)</label>
            <input type="password" id="new-user-pw" autocomplete="new-password" />
          </div>
          <div class="form-group">
            <label>Rolle</label>
            <select id="new-user-role">
              <option value="user">Benutzer</option>
              ${me?.role === 'superuser' ? '<option value="admin">Admin</option>' : ''}
            </select>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--primary" id="btn-submit-new-user">Anlegen</button>
          <button class="btn btn--outline" id="btn-cancel-new-user">Abbrechen</button>
        </div>
      </div>
    </div>

    <!-- Modal: Rolle anlegen/bearbeiten -->
    <div id="modal-role" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3 id="modal-role-title">Rolle anlegen</h3>
          <button class="modal__close" id="btn-close-role-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Rollenname</label>
            <input type="text" id="role-name" maxlength="64" placeholder="z.B. Lagerverwalter" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>Typ</label>
            <select id="role-type">
              <option value="dienstgrad">Dienstgrad (z.B. Truppführer, Gruppenführer)</option>
              <option value="funktion">Zusatzfunktion (z.B. Gerätewart, Lagerverwalter)</option>
            </select>
          </div>
          <div class="form-group">
            <label>Module</label>
            <div id="role-perm-checks" class="admin-check-list"></div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--primary" id="btn-submit-role">Speichern</button>
          <button class="btn btn--outline" id="btn-cancel-role">Abbrechen</button>
        </div>
      </div>
    </div>

    <!-- Modal: Benutzer bearbeiten -->
    <div id="modal-edit-user" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3>Benutzer bearbeiten</h3>
          <button class="modal__close" id="btn-close-edit-user">✕</button>
        </div>
        <div class="modal__body">
          <p id="edit-user-info" class="text-muted text-sm mb-sm"></p>
          <div class="form-group">
            <label>Benutzername</label>
            <input type="text" id="edit-user-username" maxlength="64" autocomplete="off" />
          </div>
          <div class="form-group">
            <label>Anzeigename</label>
            <input type="text" id="edit-user-displayname" maxlength="100"
              placeholder="Leer = Benutzername wird verwendet" />
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--primary" id="btn-submit-edit-user">Speichern</button>
          <button class="btn btn--outline" id="btn-cancel-edit-user">Abbrechen</button>
        </div>
      </div>
    </div>

    <!-- Modal: Zusatzfunktionen verwalten -->
    <div id="modal-functions" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3>Zusatzfunktionen — <span id="modal-functions-username"></span></h3>
          <button class="modal__close" id="btn-close-functions">✕</button>
        </div>
        <div class="modal__body">
          <p class="text-muted text-sm mb-md">
            Zusatzfunktionen erweitern die Modulberechtigungen des Benutzers additiv.
          </p>
          <div id="functions-checks" class="admin-check-list"></div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="btn-close-functions-footer">Schließen</button>
        </div>
      </div>
    </div>

    <!-- Modal: PW Reset -->
    <div id="modal-reset-pw" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3>Passwort zurücksetzen</h3>
          <button class="modal__close" id="btn-close-reset-pw">✕</button>
        </div>
        <div class="modal__body">
          <p id="reset-pw-username" class="text-muted text-sm mb-sm"></p>
          <div class="form-group">
            <label>Neues Passwort (mind. 8 Zeichen)</label>
            <input type="password" id="reset-pw-value" autocomplete="new-password" />
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--primary" id="btn-submit-reset-pw">Zurücksetzen</button>
          <button class="btn btn--outline" id="btn-cancel-reset-pw">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  // Tabs
  content.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      content.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
      btn.classList.add('tab-btn--active');
      content.querySelectorAll('.tab-panel').forEach(p => p.style.display = 'none');
      document.getElementById(`tab-${btn.dataset.tab}`).style.display = 'block';
      if (btn.dataset.tab === 'audit')           loadAuditLog();
      if (btn.dataset.tab === 'modules')         loadModules();
      if (btn.dataset.tab === 'container-log')   loadContainerLog();
      if (btn.dataset.tab === 'einsatzarten')    loadEinsatzarten();
      if (btn.dataset.tab === 'dienstausweise')  loadDienstausweise();
      if (btn.dataset.tab === 'integrations')    loadIntegrations();
    });
  });

  // Design / Dark Mode
  function updateThemeButtons(theme) {
    document.getElementById('theme-btn-light').classList.toggle('btn--primary', theme !== 'dark');
    document.getElementById('theme-btn-light').classList.toggle('btn--outline', theme === 'dark');
    document.getElementById('theme-btn-dark').classList.toggle('btn--primary', theme === 'dark');
    document.getElementById('theme-btn-dark').classList.toggle('btn--outline', theme !== 'dark');
  }
  updateThemeButtons(localStorage.getItem('ff_theme') || 'light');

  document.getElementById('theme-btn-light').addEventListener('click', () => {
    document.documentElement.removeAttribute('data-theme');
    localStorage.removeItem('ff_theme');
    updateThemeButtons('light');
  });
  document.getElementById('theme-btn-dark').addEventListener('click', () => {
    document.documentElement.setAttribute('data-theme', 'dark');
    localStorage.setItem('ff_theme', 'dark');
    updateThemeButtons('dark');
  });

  // Konfig speichern
  document.getElementById('btn-save-config').addEventListener('click', async () => {
    try {
      await api.updateSettings({
        ff_name:    document.getElementById('cfg-ff-name').value.trim(),
        ff_strasse: document.getElementById('cfg-ff-strasse').value.trim(),
        ff_ort:     document.getElementById('cfg-ff-ort').value.trim(),
      });
      toast('Einstellungen gespeichert');
    } catch (e) { toast(e.message, 'error'); }
  });

  // PDF-Status anzeigen
  const updatePdfStatus = (hasPdf) => {
    const statusEl = document.getElementById('pdf-upload-status');
    const deleteBtn = document.getElementById('btn-delete-pdf');
    if (!statusEl) return;
    if (hasPdf) {
      statusEl.innerHTML = `<span class="text-success">${icon('check-circle', 14)} PDF-Vorlage ist hinterlegt</span>`;
      if (deleteBtn) deleteBtn.style.display = '';
    } else {
      statusEl.innerHTML = `<span class="text-error">${icon('alert-triangle', 14)} Noch keine PDF-Vorlage hochgeladen</span>`;
      if (deleteBtn) deleteBtn.style.display = 'none';
    }
    renderIcons(statusEl);
  };

  fetch('/api/settings/pdf', { method: 'HEAD' })
    .then(res => updatePdfStatus(res.ok))
    .catch(() => updatePdfStatus(false));

  // PDF hochladen
  document.getElementById('btn-upload-pdf').addEventListener('click', async () => {
    const file = document.getElementById('pdf-upload-input').files[0];
    if (!file) { toast('Keine Datei ausgewählt', 'error'); return; }
    if (!file.name.toLowerCase().endsWith('.pdf')) { toast('Nur PDF-Dateien erlaubt', 'error'); return; }
    try {
      await api.uploadPdf(file);
      toast('PDF-Vorlage erfolgreich hochgeladen');
      document.getElementById('pdf-upload-input').value = '';
      updatePdfStatus(true);
    } catch (e) { toast(e.message, 'error'); }
  });

  // PDF löschen
  document.getElementById('btn-delete-pdf').addEventListener('click', async () => {
    if (!confirm('PDF-Vorlage wirklich löschen? Danach wird das generische PDF verwendet.')) return;
    try {
      await api.deletePdf();
      toast('PDF-Vorlage gelöscht');
      updatePdfStatus(false);
    } catch (e) { toast(e.message, 'error'); }
  });

  // Datenschutzerklärung Kontaktdaten speichern
  document.getElementById('btn-save-dse').addEventListener('click', async () => {
    try {
      await api.updateSettings({
        datenschutz_kontakt_name:    document.getElementById('dse-name').value.trim() || null,
        datenschutz_kontakt_email:   document.getElementById('dse-email').value.trim() || null,
        datenschutz_kontakt_telefon: document.getElementById('dse-telefon').value.trim() || null,
        datenschutz_hoster:          document.getElementById('dse-hoster').value.trim() || null,
      });
      toast('Datenschutz-Kontakt gespeichert');
    } catch (e) { toast(e.message, 'error'); }
  });

  // Logo-Verwaltung
  const updateLogoPreview = () => {
    const el = document.getElementById('logo-preview');
    if (!el) return;
    const saved = localStorage.getItem('ff_custom_logo');
    if (saved) {
      el.innerHTML = `
        <img src="${saved}" class="admin-preview-logo">
        <span class="text-success fw-semibold text-xs">✓ Eigenes Wappen aktiv</span>`;
    } else {
      el.innerHTML = `<span class="text-muted text-xs">Standard-Logo (FH) aktiv</span>`;
    }
    renderIcons(el);
  };
  updateLogoPreview();

  document.getElementById('btn-upload-logo').addEventListener('click', () => {
    const file = document.getElementById('logo-upload-input').files[0];
    if (!file) { toast('Keine Datei ausgewählt', 'error'); return; }
    if (!file.type.startsWith('image/')) { toast('Nur Bilddateien erlaubt', 'error'); return; }
    if (file.size > 500 * 1024) { toast('Datei zu groß (max. 500 KB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      localStorage.setItem('ff_custom_logo', e.target.result);
      toast('Wappen gespeichert — wird ab dem nächsten Seitenaufruf angezeigt');
      updateLogoPreview();
      document.getElementById('logo-upload-input').value = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-remove-logo').addEventListener('click', () => {
    localStorage.removeItem('ff_custom_logo');
    toast('Standard-Logo wiederhergestellt');
    updateLogoPreview();
  });

  // Unterschrift-Verwaltung
  const updateSigPreview = () => {
    const el = document.getElementById('sig-preview');
    if (!el) return;
    const saved = localStorage.getItem('ff_signature');
    if (saved) {
      el.innerHTML = `
        <img src="${saved}" class="admin-preview-sig">
        <span class="text-success fw-semibold text-xs">✓ Unterschrift gespeichert</span>`;
    } else {
      el.innerHTML = `<span class="text-muted text-xs">Keine Unterschrift hinterlegt</span>`;
    }
  };
  updateSigPreview();

  document.getElementById('btn-upload-sig').addEventListener('click', () => {
    const file = document.getElementById('sig-upload-input').files[0];
    if (!file) { toast('Keine Datei ausgewählt', 'error'); return; }
    if (!file.type.startsWith('image/')) { toast('Nur Bilddateien erlaubt', 'error'); return; }
    if (file.size > 500 * 1024) { toast('Datei zu groß (max. 500 KB)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = e => {
      localStorage.setItem('ff_signature', e.target.result);
      toast('Unterschrift gespeichert');
      updateSigPreview();
      document.getElementById('sig-upload-input').value = '';
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-remove-sig').addEventListener('click', () => {
    localStorage.removeItem('ff_signature');
    toast('Unterschrift entfernt');
    updateSigPreview();
  });

  // Benutzer + Rollen laden
  const roles = await api.getRoles().catch(() => []);
  await loadUsers(me, roles);

  // Rollen-Tab
  await loadRoles(me);

  renderIcons(document.getElementById('page-content'));

  document.getElementById('btn-refresh-audit').addEventListener('click', loadAuditLog);
  document.getElementById('btn-refresh-container-log').addEventListener('click', loadContainerLog);

  // Update-Check im Hintergrund
  checkForUpdate();

  // Modal: Neuer Benutzer
  let resetTarget = null;
  let editUserTarget = null;

  document.getElementById('btn-new-user').addEventListener('click', () => {
    document.getElementById('modal-new-user').classList.add('active');
    document.getElementById('new-user-name').focus();
  });

  const closeNewUser = () => {
    document.getElementById('modal-new-user').classList.remove('active');
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-pw').value = '';
  };
  document.getElementById('btn-close-new-user').addEventListener('click', closeNewUser);
  document.getElementById('btn-cancel-new-user').addEventListener('click', closeNewUser);

  document.getElementById('btn-submit-new-user').addEventListener('click', async () => {
    const username = document.getElementById('new-user-name').value.trim();
    const password = document.getElementById('new-user-pw').value;
    const role     = document.getElementById('new-user-role').value;

    if (!username || !password) { toast('Alle Felder ausfüllen', 'error'); return; }
    if (password.length < 8)    { toast('Passwort mind. 8 Zeichen', 'error'); return; }

    try {
      await api.createUser({ username, password, role });
      toast(`Benutzer "${username}" angelegt`);
      closeNewUser();
      const roles = await api.getRoles().catch(() => []);
      await loadUsers(me, roles);
    } catch (e) { toast(e.message, 'error'); }
  });

  // Modal: PW Reset
  const closeResetPw = () => {
    document.getElementById('modal-reset-pw').classList.remove('active');
    document.getElementById('reset-pw-value').value = '';
    resetTarget = null;
  };
  document.getElementById('btn-close-reset-pw').addEventListener('click', closeResetPw);
  document.getElementById('btn-cancel-reset-pw').addEventListener('click', closeResetPw);

  document.getElementById('btn-submit-reset-pw').addEventListener('click', async () => {
    const newPassword = document.getElementById('reset-pw-value').value;
    if (newPassword.length < 8) { toast('Passwort mind. 8 Zeichen', 'error'); return; }
    try {
      await api.resetPassword(resetTarget.id, { new_password: newPassword });
      toast(`Passwort für "${resetTarget.username}" zurückgesetzt`);
      closeResetPw();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Modal: Benutzer bearbeiten
  const closeEditUser = () => {
    document.getElementById('modal-edit-user').classList.remove('active');
    document.getElementById('edit-user-username').value = '';
    document.getElementById('edit-user-displayname').value = '';
    editUserTarget = null;
  };
  document.getElementById('btn-close-edit-user').addEventListener('click', closeEditUser);
  document.getElementById('btn-cancel-edit-user').addEventListener('click', closeEditUser);

  document.getElementById('btn-submit-edit-user').addEventListener('click', async () => {
    const username    = document.getElementById('edit-user-username').value.trim();
    const displayName = document.getElementById('edit-user-displayname').value.trim();
    if (!username) { toast('Benutzername darf nicht leer sein', 'error'); return; }
    try {
      await api.updateUser(editUserTarget.id, {
        username,
        display_name: displayName || null,
      });
      toast(`Benutzer "${username}" aktualisiert`);
      closeEditUser();
      const roles = await api.getRoles().catch(() => []);
      await loadUsers(me, roles);
    } catch (e) { toast(e.message, 'error'); }
  });

  // Event Delegation für Tabellen-Aktionen
  document.getElementById('users-table-wrap').addEventListener('click', async (e) => {
    const id = e.target.dataset.id;
    const username = e.target.dataset.username;

    if (e.target.matches('[data-action="reset-pw"]')) {
      resetTarget = { id, username };
      document.getElementById('reset-pw-username').textContent = `Benutzer: ${username}`;
      document.getElementById('modal-reset-pw').classList.add('active');
      document.getElementById('reset-pw-value').focus();
    }

    if (e.target.matches('[data-action="edit-user"]')) {
      editUserTarget = { id, username };
      document.getElementById('edit-user-info').textContent = `Benutzer: ${username}`;
      document.getElementById('edit-user-username').value = e.target.dataset.username;
      document.getElementById('edit-user-displayname').value = e.target.dataset.displayname || '';
      document.getElementById('modal-edit-user').classList.add('active');
      document.getElementById('edit-user-username').focus();
    }

    if (e.target.matches('[data-action="reset-totp"]')) {
      if (!confirm(`2FA für "${username}" wirklich zurücksetzen? Der Benutzer muss 2FA danach neu einrichten.`)) return;
      try {
        await api.adminResetTotp(id);
        toast(`2FA für "${username}" zurückgesetzt`);
        const roles = await api.getRoles().catch(() => []);
        await loadUsers(me, roles);
      } catch (e) { toast(e.message, 'error'); }
    }

    if (e.target.matches('[data-action="toggle-role"]')) {
      const currentRole = e.target.dataset.role;
      const newRole = currentRole === 'admin' ? 'user' : 'admin';
      try {
        await api.updateUserSystemRole(id, { role: newRole });
        toast(`Systemrolle auf "${ROLE_LABELS[newRole]}" geändert`);
        const roles = await api.getRoles().catch(() => []);
        await loadUsers(me, roles);
      } catch (e) { toast(e.message, 'error'); }
    }

    if (e.target.matches('[data-action="delete"]')) {
      if (!confirm(`Benutzer "${username}" wirklich löschen?`)) return;
      try {
        await api.deleteUser(id);
        toast(`Benutzer "${username}" gelöscht`);
        const roles = await api.getRoles().catch(() => []);
        await loadUsers(me, roles);
      } catch (e) { toast(e.message, 'error'); }
    }

    if (e.target.matches('[data-action="export"]')) {
      try {
        const data = await api.exportUser(id);
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `daten-export-${esc(username)}-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
      } catch (e) { toast(e.message, 'error'); }
    }

    if (e.target.matches('[data-action="unlock"]')) {
      if (!confirm(`Account "${username}" wirklich entsperren?`)) return;
      try {
        await api.unlockUser(id);
        toast(`Account "${username}" entsperrt`);
        const roles = await api.getRoles().catch(() => []);
        await loadUsers(me, roles);
      } catch (e) { toast(e.message, 'error'); }
    }

    if (e.target.matches('[data-action="manage-functions"]')) {
      await openFunctionsModal(id, username);
    }
  });

  // Rolle-Dropdown Änderungen (delegiert)
  document.getElementById('users-table-wrap').addEventListener('change', async (e) => {
    if (!e.target.matches('.user-role-select')) return;
    const userId = e.target.dataset.userId;
    const roleId = e.target.value || null;
    try {
      await api.assignRole(userId, roleId);
      toast('Rolle zugewiesen');
    } catch (err) {
      toast(err.message, 'error');
    }
  });

  // Dienstausweise – Print-Button
  document.getElementById('btn-print-badges')?.addEventListener('click', async () => {
    const users = await api.getBadges();
    if (!users?.length) return;
    const cards = await Promise.all(users.map(async u => {
      const name = (u.display_name || u.username).replace(/</g, '&lt;');
      const qrContent = u.badge_code || u.id;
      const label = u.badge_code
        ? u.badge_code.replace(/</g, '&lt;')
        : `<span class="text-muted text-xs" style="font-style:italic">Kein Badge-Code (UUID)</span>`;
      const dataUrl = await QRCode.toDataURL(qrContent, { width: 160, margin: 1 });
      return `<div class="pc"><img src="${dataUrl}" width="160" height="160"/><div class="pn">${name}</div><div class="pk">${label}</div></div>`;
    }));
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dienstausweise</title>
      <style>body{font-family:sans-serif;margin:16px}.pg{display:flex;flex-wrap:wrap;gap:12px}
      .pc{border:1px solid #ccc;border-radius:6px;padding:10px;text-align:center;break-inside:avoid}
      .pn{font-weight:bold;font-size:13px;margin-top:4px}.pk{font-size:11px;color:#666}
      @media print{body{margin:0}.pg{gap:8px}}</style></head>
      <body><div class="pg">${cards.join('')}</div>
      <script>window.onload=()=>window.print()<\/script></body></html>`);
    win.document.close();
  });

  // Dienstausweise – Modal-Buttons
  document.getElementById('btn-close-badge-modal')?.addEventListener('click', () => {
    document.getElementById('modal-badge').classList.remove('active');
    badgeEditUid = null;
  });
  document.getElementById('btn-cancel-badge')?.addEventListener('click', () => {
    document.getElementById('modal-badge').classList.remove('active');
    badgeEditUid = null;
  });
  document.getElementById('btn-save-badge')?.addEventListener('click', async () => {
    if (!badgeEditUid) return;
    const code = document.getElementById('badge-code-input').value.trim() || null;
    try {
      await api.setBadge(badgeEditUid, code);
      toast(code ? 'Badge-Code gesetzt' : 'Badge-Code entfernt');
      document.getElementById('modal-badge').classList.remove('active');
      badgeEditUid = null;
      loadDienstausweise();
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}

async function openFunctionsModal(userId, username) {
  const modal    = document.getElementById('modal-functions');
  const checksEl = document.getElementById('functions-checks');
  document.getElementById('modal-functions-username').textContent = username;
  checksEl.innerHTML = '<p class="text-muted text-sm">Lade...</p>';
  modal.classList.add('active');

  const [allRoles, userFunctions] = await Promise.all([
    api.getRoles().catch(() => []),
    api.getUserFunctions(userId).catch(() => []),
  ]);

  const funktionen = allRoles.filter(r => r.type === 'funktion');
  const assignedIds = userFunctions.map(f => f.role_id);

  if (!funktionen.length) {
    checksEl.innerHTML = '<p class="text-muted text-sm">Keine Zusatzfunktionen angelegt.</p>';
  } else {
    checksEl.innerHTML = funktionen.map(f => `
      <label class="fn-check-label">
        <input type="checkbox" class="fn-check" data-role-id="${f.id}"
          ${assignedIds.includes(f.id) ? 'checked' : ''} />
        <span>
          <strong class="fw-semibold">${esc(f.name)}</strong>
          ${f.permissions.length ? `<span class="text-muted text-xs ms-sm">→ ${f.permissions.join(', ')}</span>` : ''}
        </span>
      </label>
    `).join('');

    checksEl.querySelectorAll('.fn-check').forEach(cb => {
      cb.addEventListener('change', async () => {
        const roleId = cb.dataset.roleId;
        try {
          if (cb.checked) {
            await api.assignFunction(userId, { role_id: roleId });
            toast('Funktion zugewiesen');
          } else {
            await api.removeFunction(userId, roleId);
            toast('Funktion entfernt');
          }
        } catch (e) {
          cb.checked = !cb.checked; // revert
          toast(e.message, 'error');
        }
      });
    });
  }

  const close = () => { modal.classList.remove('active'); };
  document.getElementById('btn-close-functions').onclick = close;
  document.getElementById('btn-close-functions-footer').onclick = close;
}

async function loadRoles(me) {
  const wrap = document.getElementById('roles-table-wrap');
  if (!wrap) return;

  let editTarget = null;

  const render = async () => {
    const roles = await api.getRoles().catch(() => []);

    if (!roles.length) {
      wrap.innerHTML = '<p class="wrap-loading">Noch keine Rollen angelegt.</p>';
    } else {
      wrap.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>Rollenname</th>
              <th>Typ</th>
              <th>Module</th>
              <th>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            ${roles.map(r => `
              <tr>
                <td><strong>${esc(r.name)}</strong></td>
                <td>
                  <span class="${r.type === 'funktion' ? 'badge-warning' : 'badge-success'}">
                    ${r.type === 'funktion' ? 'Zusatzfunktion' : 'Dienstgrad'}
                  </span>
                </td>
                <td>${r.permissions.length ? r.permissions.map(p => MODULE_LABELS[p] || esc(p)).join(', ') : '<span class="text-subtle">keine</span>'}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn--outline btn--sm" data-action="edit-role"
                      data-id="${r.id}" data-name="${esc(r.name)}" data-type="${r.type}"
                      data-perms="${JSON.stringify(r.permissions).replace(/"/g,'&quot;')}">Bearbeiten</button>
                    <button class="btn btn--danger btn--sm" data-action="delete-role"
                      data-id="${r.id}" data-name="${esc(r.name)}">Löschen</button>
                  </div>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    wrap.querySelectorAll('[data-action="edit-role"]').forEach(btn => {
      btn.addEventListener('click', () => {
        editTarget = btn.dataset.id;
        const perms = JSON.parse(btn.dataset.perms || '[]');
        document.getElementById('modal-role-title').textContent = 'Rolle bearbeiten';
        document.getElementById('role-name').value = btn.dataset.name;
        document.getElementById('role-type').value = btn.dataset.type || 'dienstgrad';
        buildPermCheckboxes(perms);
        document.getElementById('modal-role').classList.add('active');
      });
    });

    wrap.querySelectorAll('[data-action="delete-role"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Rolle "${btn.dataset.name}" wirklich löschen?`)) return;
        try {
          await api.deleteRole(btn.dataset.id);
          toast('Rolle gelöscht');
          render();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  };

  await render();

  const buildPermCheckboxes = (selected = []) => {
    document.getElementById('role-perm-checks').innerHTML =
      Object.entries(MODULE_LABELS).map(([key, label]) => `
        <label class="check-label">
          <input type="checkbox" value="${key}" ${selected.includes(key) ? 'checked' : ''} />
          ${label}
        </label>
      `).join('');
  };

  const closeModal = () => {
    editTarget = null;
    document.getElementById('modal-role').classList.remove('active');
    document.getElementById('role-name').value = '';
    document.getElementById('role-type').value = 'dienstgrad';
  };

  document.getElementById('btn-new-role').addEventListener('click', () => {
    editTarget = null;
    document.getElementById('modal-role-title').textContent = 'Rolle anlegen';
    document.getElementById('role-name').value = '';
    document.getElementById('role-type').value = 'dienstgrad';
    buildPermCheckboxes();
    document.getElementById('modal-role').classList.add('active');
  });

  document.getElementById('btn-close-role-modal').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-role').addEventListener('click', closeModal);

  document.getElementById('btn-submit-role').addEventListener('click', async () => {
    const name = document.getElementById('role-name').value.trim();
    if (!name) { toast('Rollenname eingeben', 'error'); return; }
    const permissions = [...document.querySelectorAll('#role-perm-checks input:checked')]
      .map(cb => cb.value);
    const type = document.getElementById('role-type').value;

    try {
      if (editTarget) {
        await api.updateRole(editTarget, { name, permissions, type });
        toast('Rolle gespeichert');
      } else {
        await api.createRole({ name, permissions, type });
        toast(`Rolle "${name}" angelegt`);
      }
      closeModal();
      render();
    } catch (e) { toast(e.message, 'error'); }
  });
}

async function loadUsers(me, roles = []) {
  const wrap = document.getElementById('users-table-wrap');
  if (!wrap) return;

  try {
    const users = await api.getUsers();

    if (!users.length) {
      wrap.innerHTML = '<p class="wrap-loading">Keine Benutzer gefunden.</p>';
      return;
    }

    const dienstgrade = roles.filter(r => r.type === 'dienstgrad');

    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Benutzername</th>
            <th>Systemrolle</th>
            <th>Dienstgrad</th>
            <th>Funktionen</th>
            <th>2FA</th>
            <th>Status</th>
            <th>Erstellt</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          ${users.map(u => {
            const isSelf = u.id === me?.id;
            const isSuperuser = u.role === 'superuser';
            const canEdit = me?.role === 'superuser' && !isSuperuser;
            const canReset = (me?.role === 'superuser' || (me?.role === 'admin' && u.role === 'user'));
            const canEditUser = !isSelf && !isSuperuser && canReset;
            const isPrivileged = u.role === 'admin' || u.role === 'superuser';
            const isLocked = u.locked_until && new Date(u.locked_until) > new Date();

            const roleDropdown = isPrivileged
              ? `<span class="text-muted text-xs">alle (Systemrolle)</span>`
              : `<select class="user-role-select field field--sm" data-user-id="${u.id}">
                   <option value="">— kein Dienstgrad —</option>
                   ${dienstgrade.map(r =>
                     `<option value="${r.id}" ${u.role_id === r.id ? 'selected' : ''}>${esc(r.name)}</option>`
                   ).join('')}
                 </select>`;

            return `
              <tr>
                <td>
                  ${esc(u.username)}
                  ${isSelf ? ' <span class="text-muted text-xs">(ich)</span>' : ''}
                </td>
                <td>
                  <span class="badge badge--${esc(u.role)}">${ROLE_LABELS[u.role] || esc(u.role)}</span>
                </td>
                <td>${roleDropdown}</td>
                <td>
                  ${!isPrivileged
                    ? `<button class="btn btn--outline btn--sm" data-action="manage-functions"
                         data-id="${u.id}" data-username="${esc(u.username)}">
                         Funktionen
                       </button>`
                    : '<span class="text-muted text-xs">alle</span>'}
                </td>
                <td class="text-center">${u.totp_enabled ? `${icon('lock', 14)}` : '—'}</td>
                <td class="text-center">
                  ${isLocked ? `<span class="badge badge--danger" title="Gesperrt bis ${new Date(u.locked_until).toLocaleString('de-DE')}">Gesperrt</span>` : '—'}
                </td>
                <td class="text-muted text-sm">
                  ${new Date(u.created_at).toLocaleDateString('de-DE')}
                </td>
                <td>
                  <div class="btn-group">
                    ${canEditUser ? `
                      <button class="btn btn--outline btn--sm"
                        data-action="edit-user" data-id="${u.id}"
                        data-username="${esc(u.username)}"
                        data-displayname="${esc(u.display_name || '')}">
                        Bearbeiten
                      </button>` : ''}
                    ${canReset ? `
                      <button class="btn btn--outline btn--sm"
                        data-action="reset-pw" data-id="${u.id}" data-username="${esc(u.username)}">
                        PW Reset
                      </button>` : ''}
                    ${canReset && u.totp_enabled ? `
                      <button class="btn btn--outline btn--sm"
                        data-action="reset-totp" data-id="${u.id}" data-username="${esc(u.username)}">
                        2FA Reset
                      </button>` : ''}
                    ${canReset && isLocked ? `
                      <button class="btn btn--warning btn--sm"
                        data-action="unlock" data-id="${u.id}" data-username="${esc(u.username)}">
                        Entsperren
                      </button>` : ''}
                    <button class="btn btn--outline btn--sm"
                      data-action="export" data-id="${u.id}" data-username="${esc(u.username)}">
                      Export
                    </button>
                    ${canEdit ? `
                      <button class="btn btn--outline btn--sm"
                        data-action="toggle-role" data-id="${u.id}"
                        data-role="${u.role}" data-username="${esc(u.username)}">
                        → ${u.role === 'admin' ? 'Benutzer' : 'Admin'}
                      </button>
                      <button class="btn btn--danger btn--sm"
                        data-action="delete" data-id="${u.id}" data-username="${esc(u.username)}">
                        Löschen
                      </button>` : ''}
                  </div>
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;
  } catch (e) {
    wrap.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
  }
}

const MODULE_DEFS = [
  { key: 'lager',           iconName: 'package',         label: 'Lager',           desc: 'Beschaffungsaufträge, Bestellübersicht, Artikelstamm' },
  { key: 'personal',        iconName: 'users',           label: 'Personal',        desc: 'Mitgliederverwaltung, Qualifikationen, Ehrungen' },
  { key: 'einsatzberichte', iconName: 'truck',           label: 'Einsatzberichte', desc: 'Einsatzberichte erfassen und verwalten' },
  { key: 'verein',          iconName: 'building',        label: 'Verein',          desc: 'Vorstandsverwaltung, Schwarzes Brett, Dokumentenablage, Briefkopf' },
  { key: 'fahrzeuge',       iconName: 'wrench',          label: 'Technik &amp; Geräte', desc: 'Fahrzeuge, Geräte, Fristen, Prüfungen, Checklisten' },
  { key: 'jugendfeuerwehr', iconName: 'users',           label: 'Jugendfeuerwehr', desc: 'JF-Mitglieder, Termine, Wettbewerbe',                  soon: true },
];

async function loadModules() {
  const wrap = document.getElementById('modules-list');
  if (!wrap) return;

  try {
    const settings = await api.getSettings();
    const modules = settings?.modules || {};

    wrap.innerHTML = `
      <p class="text-muted text-sm mb-md">
        Aktiviere oder deaktiviere Module für diese Feuerwehr.
        Deaktivierte Module sind für alle Benutzer ausgeblendet.
      </p>
      <div>
        ${MODULE_DEFS.map(m => `
          <div class="module-row">
            <div class="module-row__info">
              <span>${icon(m.iconName, 22)}</span>
              <div>
                <div class="module-row__label">${m.label}
                  ${m.soon ? '<span class="text-subtle text-xs fw-normal ms-sm">Demnächst</span>' : ''}
                </div>
                <div class="module-row__desc">${m.desc}</div>
              </div>
            </div>
            <label class="toggle-switch">
              <input type="checkbox" data-module="${m.key}"
                ${modules[m.key] ? 'checked' : ''}
                ${m.soon ? 'disabled' : ''} />
              <span class="toggle-switch__track"></span>
            </label>
          </div>
        `).join('')}
      </div>
      <div class="btn-group mt-md">
        <button class="btn btn--primary" id="btn-save-modules">Änderungen speichern</button>
      </div>
    `;

    renderIcons(wrap);

    document.getElementById('btn-save-modules').addEventListener('click', async () => {
      const updated = {};
      wrap.querySelectorAll('input[data-module]').forEach(cb => {
        if (!cb.disabled) updated[cb.dataset.module] = cb.checked;
      });
      try {
        await api.updateModules({ modules: updated });
        toast('Module gespeichert');
      } catch (e) { toast(e.message, 'error'); }
    });
  } catch (e) {
    wrap.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
  }
}

async function loadAuditLog() {
  const wrap = document.getElementById('audit-table-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p>Lade...</p>';

  try {
    const entries = await api.getAuditLog();

    if (!entries.length) {
      wrap.innerHTML = '<p class="wrap-loading">Noch keine Einträge.</p>';
      return;
    }

    const ACTION_LABELS = {
      LOGIN_SUCCESS:    `${icon('check-circle', 14)} Login erfolgreich`,
      LOGIN_FAILED:     `${icon('alert-triangle', 14)} Login fehlgeschlagen`,
      ACCOUNT_LOCKED:   `${icon('lock', 14)} Account gesperrt`,
      ACCOUNT_UNLOCKED: `${icon('unlock', 14)} Account entsperrt`,
      USER_CREATED:     `${icon('plus', 14)} Benutzer angelegt`,
      USER_DELETED:     `${icon('trash-2', 14)} Benutzer gelöscht`,
      PASSWORD_RESET:   `${icon('key', 14)} Passwort zurückgesetzt`,
      ROLE_CHANGED:     `${icon('wrench', 14)} Systemrolle geändert`,
      SETTINGS_UPDATED: `${icon('settings', 14)} Einstellungen geändert`,
    };

    wrap.innerHTML = `
      <table class="table">
        <thead>
          <tr>
            <th>Zeitpunkt</th>
            <th>Benutzer</th>
            <th>Aktion</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          ${entries.map(e => `
            <tr>
              <td class="text-muted text-sm" style="white-space:nowrap">
                ${new Date(e.created_at).toLocaleString('de-DE')}
              </td>
              <td>${esc(e.username)}</td>
              <td style="white-space:nowrap">${ACTION_LABELS[e.action] || esc(e.action)}</td>
              <td class="text-muted text-sm">${esc(e.details || '')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    renderIcons(wrap);
  } catch (err) {
    wrap.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(err.message)}</p>`;
  }
}


// ── Container-Log ─────────────────────────────────────────────────────────────

async function loadContainerLog() {
  const pre = document.getElementById('container-log-content');
  if (!pre) return;
  pre.textContent = 'Lade...';
  try {
    const data = await api.getContainerLog();
    const lines = data?.lines || [];
    if (!lines.length) {
      pre.textContent = 'Noch keine Log-Einträge vorhanden.';
      return;
    }
    pre.textContent = lines.join('\n');
    pre.scrollTop = pre.scrollHeight;
  } catch (e) {
    pre.textContent = `Fehler: ${e.message}`;
  }
}

// ── Einsatzarten ─────────────────────────────────────────────────────────────

async function loadEinsatzarten() {
  const list = document.getElementById('einsatzarten-list');
  if (!list) return;
  list.innerHTML = `<p class="wrap-loading">Lade...</p>`;

  let types;
  try {
    types = await api.getIncidentTypes();
  } catch (e) {
    list.innerHTML = `<p class="error-msg error-msg--block">${esc(e.message)}</p>`;
    return;
  }

  // Eindeutige Kategorien in Reihenfolge ihres ersten Auftretens
  const cats = [...new Set(types.map(t => t.category))];

  // Datalist für Kategorie-Eingabefelder befüllen
  const datalist = document.getElementById('ea-cat-list');
  if (datalist) datalist.innerHTML = cats.map(c => `<option value="${esc(c)}">`).join('');

  list.innerHTML = cats.map(cat => {
    const items = types.filter(t => t.category === cat);
    if (!items.length) return '';
    return `
      <div class="ea-group">
        <div class="ea-cat-header">${esc(cat)}</div>
        ${items.map(t => `
          <div class="ea-row${t.active ? '' : ' ea-row--inactive'}" data-id="${t.id}">
            <div class="ea-key">${esc(t.key)}</div>
            <div class="ea-label" id="ea-label-${t.id}">${esc(t.label)}</div>
            <div class="ea-count text-muted text-xs">
              ${t.used_count > 0 ? `${t.used_count} Bericht${t.used_count !== 1 ? 'e' : ''}` : '—'}
            </div>
            <div class="btn-group">
              <button class="btn btn--outline btn--sm" data-action="ea-edit" data-id="${t.id}"
                data-label="${esc(t.label)}" data-cat="${esc(t.category)}" data-key="${esc(t.key)}" data-sort="${t.sort_order}">
                Bearbeiten
              </button>
              <button class="btn btn--outline btn--sm ${t.active ? 'text-warning' : 'text-success'}"
                data-action="ea-toggle" data-id="${t.id}">
                ${t.active ? 'Deakt.' : 'Aktiv.'}
              </button>
              <button class="btn btn--danger btn--sm" data-action="ea-delete" data-id="${t.id}"
                data-key="${esc(t.key)}" data-count="${t.used_count}"
                ${t.used_count > 0 ? 'title="Dieser Typ wird in Einsatzberichten verwendet"' : ''}>
                Löschen
              </button>
            </div>
          </div>`).join('')}
      </div>`;
  }).join('');

  // Add-Formular
  document.getElementById('btn-new-einsatzart').onclick = () => {
    document.getElementById('einsatzarten-add-form').style.display = 'block';
    document.getElementById('btn-new-einsatzart').style.display = 'none';
    document.getElementById('ea-key').focus();
  };
  document.getElementById('ea-btn-cancel').onclick = () => {
    document.getElementById('einsatzarten-add-form').style.display = 'none';
    document.getElementById('btn-new-einsatzart').style.display = '';
  };
  document.getElementById('ea-btn-submit').onclick = async () => {
    const key   = document.getElementById('ea-key').value.trim().toUpperCase();
    const label = document.getElementById('ea-label').value.trim();
    const cat   = document.getElementById('ea-category').value.trim();
    if (!key || !label || !cat) { toast('Schlüssel, Bezeichnung und Kategorie sind Pflichtfelder', 'error'); return; }
    try {
      await api.createIncidentType({ key, label, category: cat, sort_order: 50 });
      toast('Einsatzart angelegt');
      document.getElementById('ea-key').value = '';
      document.getElementById('ea-label').value = '';
      document.getElementById('ea-category').value = '';
      document.getElementById('einsatzarten-add-form').style.display = 'none';
      document.getElementById('btn-new-einsatzart').style.display = '';
      loadEinsatzarten();
    } catch (e) { toast(e.message, 'error'); }
  };

  // Edit inline
  list.querySelectorAll('[data-action="ea-edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const id       = btn.dataset.id;
      const labelDiv = document.getElementById(`ea-label-${id}`);
      if (!labelDiv) return;

      const catOptions = cats.map(c => `<option value="${esc(c)}">`).join('');
      labelDiv.innerHTML = `
        <div class="ea-edit-row">
          <input type="text" id="ea-edit-label-${id}" value="${esc(btn.dataset.label)}"
            class="field ea-edit-label" />
          <input type="text" id="ea-edit-cat-${id}" value="${esc(btn.dataset.cat)}"
            class="field field--sm" list="ea-cat-list-edit-${id}" placeholder="Kategorie" />
          <datalist id="ea-cat-list-edit-${id}">${catOptions}</datalist>
          <input type="number" id="ea-edit-sort-${id}" value="${btn.dataset.sort}"
            class="field field--sm ea-edit-sort" placeholder="Sort" />
          <button class="btn btn--primary btn--sm" id="ea-save-${id}">✓</button>
          <button class="btn btn--outline btn--sm" id="ea-discard-${id}">✕</button>
        </div>`;

      document.getElementById(`ea-discard-${id}`).onclick = () => loadEinsatzarten();
      document.getElementById(`ea-save-${id}`).onclick = async () => {
        const newLabel = document.getElementById(`ea-edit-label-${id}`).value.trim();
        const newCat   = document.getElementById(`ea-edit-cat-${id}`).value.trim();
        const newSort  = +document.getElementById(`ea-edit-sort-${id}`).value || 50;
        if (!newLabel || !newCat) { toast('Bezeichnung und Kategorie dürfen nicht leer sein', 'error'); return; }
        try {
          await api.updateIncidentType(id, {
            key: btn.dataset.key || '', label: newLabel, category: newCat, sort_order: newSort,
          });
          toast('Gespeichert');
          loadEinsatzarten();
        } catch (e) { toast(e.message, 'error'); }
      };
    });
  });

  // Toggle aktiv/inaktiv
  list.querySelectorAll('[data-action="ea-toggle"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const t = types.find(x => x.id === btn.dataset.id);
      if (!t) return;
      try {
        await api.updateIncidentType(t.id, {
          key: t.key, label: t.label, category: t.category, sort_order: t.sort_order,
          active: !t.active,
        });
        toast(t.active ? 'Deaktiviert' : 'Aktiviert');
        loadEinsatzarten();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

  // Löschen
  list.querySelectorAll('[data-action="ea-delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const count = +btn.dataset.count;
      const msg = count > 0
        ? `Einsatzart "${btn.dataset.key}" wirklich löschen?\n\nAchtung: ${count} Einsatzbericht${count !== 1 ? 'e verwenden' : ' verwendet'} diesen Typ. Die Berichte bleiben erhalten, der Typ erscheint aber nicht mehr in Auswertungen.`
        : `Einsatzart "${btn.dataset.key}" wirklich löschen?`;
      if (!confirm(msg)) return;
      try {
        await api.deleteIncidentType(btn.dataset.id);
        toast('Gelöscht');
        loadEinsatzarten();
      } catch (e) { toast(e.message, 'error'); }
    });
  });

}

// ── Dienstausweise ───────────────────────────────────────────────────────────

let badgeEditUid = null;

async function loadDienstausweise() {
  const wrap = document.getElementById('badges-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p class="wrap-loading">Lade...</p>';

  let users;
  try {
    users = await api.getBadges();
  } catch (e) {
    wrap.innerHTML = `<p class="error-msg error-msg--block">Fehler beim Laden: ${esc(e.message)}</p>`;
    return;
  }

  if (!users || users.length === 0) {
    wrap.innerHTML = '<p class="text-subtle wrap-loading">Keine Benutzer vorhanden.</p>';
    return;
  }

  let cards;
  try {
    cards = await Promise.all(users.map(async u => {
      const name = esc(u.display_name || u.username);
      let qrImg = '';
      if (u.badge_code) {
        const dataUrl = await QRCode.toDataURL(u.badge_code, { width: 128, margin: 1 });
        qrImg = `<img src="${dataUrl}" alt="QR" width="128" height="128" class="badge-card__qr-img" />`;
      } else {
        qrImg = `<div class="badge-card__qr-placeholder">Kein Code</div>`;
      }
      return `
        <div class="badge-card">
          ${qrImg}
          <div class="badge-card__name">${name}</div>
          <div class="badge-card__code">${u.badge_code ? `<code>${esc(u.badge_code)}</code>` : '—'}</div>
          <button class="btn btn--outline btn--sm" data-action="edit-badge"
            data-uid="${u.id}" data-name="${name}" data-code="${esc(u.badge_code || '')}">
            ${icon('file-pen', 12)} Code setzen
          </button>
        </div>`;
    }));
  } catch (e) {
    wrap.innerHTML = `<p class="error-msg error-msg--block">Fehler beim Rendern: ${esc(e.message)}</p>`;
    return;
  }

  wrap.innerHTML = `<div class="badge-cards">${cards.join('')}</div>`;
  renderIcons(wrap);

  wrap.querySelectorAll('[data-action="edit-badge"]').forEach(btn => {
    btn.addEventListener('click', () => {
      badgeEditUid = btn.dataset.uid;
      document.getElementById('badge-modal-title').textContent = `Badge-Code: ${btn.dataset.name}`;
      document.getElementById('badge-code-input').value = btn.dataset.code;
      document.getElementById('modal-badge').classList.add('active');
      document.getElementById('badge-code-input').focus();
    });
  });
}

// ── Update-Check ──────────────────────────────────────────────────────────────

const GITHUB_REPO = 'obrero2023/FeuerwehrHub_2';

async function checkForUpdate() {
  try {
    const info = await api.checkForUpdate();
    if (!info?.update_available || !info.latest) return;
    const banner = document.getElementById('update-banner');
    const text   = document.getElementById('update-banner-text');
    const link   = document.getElementById('update-banner-link');
    if (!banner) return;
    text.textContent = `Update verfügbar: v${info.latest.version} (installiert: v${info.current_version})`;
    link.href = info.latest.info_url || `https://github.com/${GITHUB_REPO}/releases`;
    banner.style.display = 'flex';
  } catch (_) { /* Server nicht erreichbar — ignorieren */ }
}

// ── Schnittstellen-Tab ────────────────────────────────────────────────────────

async function loadIntegrations() {
  const baseUrl = `${window.location.protocol}//${window.location.host}`;

  // Webhook-URLs vorausfüllen
  const diveraUrlEl  = document.getElementById('int-divera-url');
  const alamosUrlEl  = document.getElementById('int-alamos-url');
  if (diveraUrlEl) diveraUrlEl.value = `${baseUrl}/api/webhook/divera?secret=<DEIN_SECRET>`;
  if (alamosUrlEl)  alamosUrlEl.value  = `${baseUrl}/api/webhook/alamos?secret=<DEIN_SECRET>`;

  try {
    const s = await api.getIntegrations();
    if (document.getElementById('int-divera-key'))    document.getElementById('int-divera-key').value    = s.divera_api_key        || '';
    if (document.getElementById('int-divera-secret')) document.getElementById('int-divera-secret').value = s.divera_webhook_secret  || '';
    if (document.getElementById('int-alamos-secret')) document.getElementById('int-alamos-secret').value = s.alamos_webhook_secret  || '';

    // URLs mit echtem Secret befüllen sobald Secret bekannt
    if (s.divera_webhook_secret && diveraUrlEl)
      diveraUrlEl.value = `${baseUrl}/api/webhook/divera?secret=${encodeURIComponent(s.divera_webhook_secret)}`;
    if (s.alamos_webhook_secret && alamosUrlEl)
      alamosUrlEl.value = `${baseUrl}/api/webhook/alamos?secret=${encodeURIComponent(s.alamos_webhook_secret)}`;
  } catch (e) {
    toast('Einstellungen konnten nicht geladen werden', 'error');
  }

  // Kopier-Buttons
  document.getElementById('btn-copy-divera-url')?.addEventListener('click', () => {
    navigator.clipboard.writeText(diveraUrlEl?.value || '').then(() => toast('URL kopiert'));
  });
  document.getElementById('btn-copy-alamos-url')?.addEventListener('click', () => {
    navigator.clipboard.writeText(alamosUrlEl?.value || '').then(() => toast('URL kopiert'));
  });

  // Verbindungstest
  document.getElementById('btn-test-divera')?.addEventListener('click', async () => {
    const fb = document.getElementById('divera-feedback');
    fb.textContent = 'Prüfe…';
    fb.style.color = 'var(--text-muted)';
    try {
      const r = await api.testDivera();
      fb.textContent = r.message;
      fb.style.color = r.ok ? 'var(--color-success, #3fb950)' : 'var(--color-danger, #e63022)';
    } catch (e) {
      fb.textContent = e.message;
      fb.style.color = 'var(--color-danger, #e63022)';
    }
  });

  // Manueller Import
  document.getElementById('btn-import-divera')?.addEventListener('click', async () => {
    const fb  = document.getElementById('divera-feedback');
    const btn = document.getElementById('btn-import-divera');
    btn.disabled = true;
    fb.textContent = 'Importiere…';
    fb.style.color = 'var(--text-muted)';
    try {
      const r = await api.importDivera();
      fb.textContent = `${r.imported} importiert, ${r.skipped} übersprungen${r.errors ? `, ${r.errors} Fehler` : ''}`;
      fb.style.color = r.errors ? 'var(--color-danger, #e63022)' : 'var(--color-success, #3fb950)';
    } catch (e) {
      fb.textContent = e.message;
      fb.style.color = 'var(--color-danger, #e63022)';
    } finally {
      btn.disabled = false;
    }
  });

  // Speichern
  document.getElementById('btn-save-integrations')?.addEventListener('click', async () => {
    try {
      const secret_divera = document.getElementById('int-divera-secret')?.value.trim() || '';
      const secret_alamos = document.getElementById('int-alamos-secret')?.value.trim() || '';
      await api.saveIntegrations({
        divera_api_key:        document.getElementById('int-divera-key')?.value.trim() || '',
        divera_webhook_secret: secret_divera,
        alamos_webhook_secret: secret_alamos,
      });
      // URLs aktualisieren
      if (diveraUrlEl && secret_divera)
        diveraUrlEl.value = `${baseUrl}/api/webhook/divera?secret=${encodeURIComponent(secret_divera)}`;
      if (alamosUrlEl && secret_alamos)
        alamosUrlEl.value = `${baseUrl}/api/webhook/alamos?secret=${encodeURIComponent(secret_alamos)}`;
      toast('Schnittstellen-Einstellungen gespeichert');
    } catch (e) {
      toast(e.message, 'error');
    }
  });
}
