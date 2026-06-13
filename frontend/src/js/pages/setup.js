import { api } from '../api.js';
import { toast } from '../toast.js';
import { navigate } from '../router.js';
import { icon, renderIcons } from '../icons.js';

export function renderSetup() {
  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-emblem">${icon('truck', 32)}</div>
          <h1>Ersteinrichtung</h1>
          <p>FeuerwehrHub</p>
        </div>

        <div class="auth-body" id="setup-step-1">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Schritt 1 von 2 — Administrator-Account</p>
          <p style="font-size:12px;color:var(--text-subtle);margin-bottom:20px">
            Willkommen! Richte jetzt den ersten Administrator-Account ein.
          </p>
          <div class="form-group">
            <label>Name der Feuerwehr</label>
            <input type="text" id="setup-ff-name" placeholder="Freiwillige Feuerwehr Musterstadt" />
          </div>
          <div class="form-group">
            <label>Admin-Benutzername</label>
            <input type="text" id="setup-user" placeholder="admin" autocomplete="username" />
          </div>
          <div class="form-group">
            <label>Passwort <span style="font-size:11px;color:var(--text-subtle)">(min. 16 Zeichen, mind. 1 Großbuchstabe &amp; 1 Zahl)</span></label>
            <input type="password" id="setup-pass" autocomplete="new-password" placeholder="••••••••" />
          </div>
          <div class="form-group">
            <label>Passwort wiederholen</label>
            <input type="password" id="setup-pass2" autocomplete="new-password" placeholder="••••••••" />
          </div>
          <div style="margin-top:20px">
            <button class="btn btn--primary btn--full btn--lg" id="btn-setup-next">Weiter →</button>
          </div>
        </div>

        <div class="auth-body" id="setup-step-2" style="display:none">
          <p style="font-size:13px;color:var(--text-muted);margin-bottom:4px">Schritt 2 von 2 — Datenschutzerklärung (Art. 13 DSGVO)</p>
          <p style="font-size:12px;color:var(--text-subtle);margin-bottom:20px">
            Diese Angaben erscheinen in der öffentlichen Datenschutzerklärung.
            Du kannst sie später im <strong>Admin-Panel → Konfiguration</strong> ändern.
          </p>
          <div class="form-group">
            <label>Verantwortliche Person <span style="font-size:11px;color:var(--text-subtle)">(empfohlen)</span></label>
            <input type="text" id="setup-dse-name" placeholder="Max Mustermann" maxlength="150" />
          </div>
          <div class="form-group">
            <label>E-Mail <span style="font-size:11px;color:var(--text-subtle)">(empfohlen)</span></label>
            <input type="email" id="setup-dse-email" placeholder="datenschutz@feuerwehr-beispiel.de" maxlength="150" />
          </div>
          <div class="form-group">
            <label>Telefon <span style="font-size:11px;color:var(--text-subtle)">(optional)</span></label>
            <input type="text" id="setup-dse-telefon" placeholder="+49 123 456789" maxlength="50" />
          </div>
          <div class="form-group">
            <label>Hoster / Server-Standort <span style="font-size:11px;color:var(--text-subtle)">(optional)</span></label>
            <input type="text" id="setup-dse-hoster" placeholder="z.B. Eigener Server im Gerätehaus" maxlength="200" />
          </div>
          <div class="btn-group" style="margin-top:20px;gap:8px">
            <button class="btn btn--outline" id="btn-setup-back">← Zurück</button>
            <button class="btn btn--primary btn--lg" style="flex:1" id="btn-setup-finish">Einrichtung abschließen</button>
          </div>
        </div>
      </div>
    </div>
  `;

  renderIcons(app);

  document.getElementById('btn-setup-next').addEventListener('click', goToStep2);
  document.getElementById('btn-setup-back').addEventListener('click', () => {
    document.getElementById('setup-step-2').style.display = 'none';
    document.getElementById('setup-step-1').style.display = 'block';
  });
  document.getElementById('btn-setup-finish').addEventListener('click', doSetup);

  // Enter auf Schritt 1
  ['setup-ff-name', 'setup-user', 'setup-pass', 'setup-pass2'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', e => {
      if (e.key === 'Enter') goToStep2();
    });
  });
}

function goToStep2() {
  const ffName   = document.getElementById('setup-ff-name').value.trim();
  const username = document.getElementById('setup-user').value.trim();
  const pass     = document.getElementById('setup-pass').value;
  const pass2    = document.getElementById('setup-pass2').value;

  if (!ffName || !username || !pass) {
    toast('Alle Felder ausfüllen', 'error');
    return;
  }
  if (pass !== pass2) {
    toast('Passwörter stimmen nicht überein', 'error');
    return;
  }
  if (pass.length < 16) {
    toast('Passwort muss mindestens 16 Zeichen haben', 'error');
    return;
  }
  if (!pass.split('').some(c => c >= 'A' && c <= 'Z')) {
    toast('Passwort muss mindestens einen Großbuchstaben enthalten', 'error');
    return;
  }
  if (!pass.split('').some(c => c >= '0' && c <= '9')) {
    toast('Passwort muss mindestens eine Zahl enthalten', 'error');
    return;
  }

  document.getElementById('setup-step-1').style.display = 'none';
  document.getElementById('setup-step-2').style.display = 'block';
  document.getElementById('setup-dse-name').focus();
}

async function doSetup() {
  const btn = document.getElementById('btn-setup-finish');
  btn.disabled = true;
  btn.textContent = 'Einrichten…';

  const body = {
    username:  document.getElementById('setup-user').value.trim(),
    password:  document.getElementById('setup-pass').value,
    ff_name:   document.getElementById('setup-ff-name').value.trim(),
    datenschutz_kontakt_name:    document.getElementById('setup-dse-name').value.trim()   || null,
    datenschutz_kontakt_email:   document.getElementById('setup-dse-email').value.trim()  || null,
    datenschutz_kontakt_telefon: document.getElementById('setup-dse-telefon').value.trim()|| null,
    datenschutz_hoster:          document.getElementById('setup-dse-hoster').value.trim() || null,
  };

  try {
    await api.setup(body);
    toast('Einrichtung abgeschlossen! Bitte anmelden.');
    navigate('#/login');
  } catch (e) {
    toast(e.message || 'Fehler bei der Einrichtung', 'error');
    btn.disabled = false;
    btn.textContent = 'Einrichtung abschließen';
  }
}
