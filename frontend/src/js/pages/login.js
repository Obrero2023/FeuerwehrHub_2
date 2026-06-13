import { api, setAuthState } from '../api.js';
import { toast } from '../toast.js';
import { navigate } from '../router.js';
import { getLoginLogo } from '../logo.js';

export async function renderLogin() {
  // Automatisch zu Setup weiterleiten wenn noch kein User existiert
  try {
    const status = await fetch('/api/auth/setup-status').then(r => r.json());
    if (status?.setup_needed) {
      window.location.hash = '#/setup';
      return;
    }
  } catch (_) { /* ignorieren, normaler Login-Flow */ }

  const app = document.getElementById('app');

  app.innerHTML = `
    <div class="auth-page">
      <div class="auth-card">
        <div class="auth-header">
          <div class="auth-emblem" id="login-emblem">${getLoginLogo()}</div>
          <h1 id="login-title">FeuerwehrHub</h1>
          <p>Freiwillige Feuerwehr</p>
        </div>
        <div class="auth-body" id="auth-step-login">
          <div class="form-group">
            <label>Benutzername</label>
            <input type="text" id="login-user" autocomplete="username" placeholder="benutzername"
                   autocapitalize="none" autocorrect="off" spellcheck="false" />
          </div>
          <div class="form-group">
            <label>Passwort</label>
            <input type="password" id="login-pass" autocomplete="current-password" placeholder="••••••••" />
          </div>
          <div style="margin-top:20px">
            <button class="btn btn--primary btn--full btn--lg" id="btn-login">Anmelden</button>
          </div>
        </div>
        <div style="text-align:center;padding:12px 0 4px;border-top:1px solid var(--border);margin-top:4px">
          <a href="#/datenschutz" style="font-size:12px;color:var(--text-muted)">Datenschutzerklärung</a>
        </div>
      </div>
    </div>
  `;

  // Enter-Taste
  app.querySelectorAll('input').forEach(inp => {
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
  });
  app.querySelector('#btn-login').addEventListener('click', doLogin);

  // Name und Logo aus den öffentlichen Settings nachladen
  try {
    const briefkopf = await fetch('/api/verein/briefkopf').then(r => r.ok ? r.json() : null);
    if (briefkopf?.ff_name) {
      const title = document.getElementById('login-title');
      if (title) title.textContent = briefkopf.ff_name;
    }
    if (briefkopf?.has_logo) {
      const emblem = document.getElementById('login-emblem');
      if (emblem) emblem.innerHTML = `<img src="/api/verein/logo" alt="Logo"
        style="width:40px;height:40px;object-fit:contain;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3));">`;
    }
  } catch (_) { /* Fallback auf FH-Standard */ }
}

async function doLogin() {
  const username = document.getElementById('login-user').value.trim();
  const password = document.getElementById('login-pass').value;

  if (!username || !password) {
    toast('Bitte Benutzername und Passwort eingeben', 'error');
    return;
  }

  const btn = document.getElementById('btn-login');
  btn.disabled = true;
  btn.textContent = 'Anmelden…';

  try {
    const res = await api.login({ username, password });
    if (!res) return;

    if (res.requires_totp) {
      renderTotpVerify();
    } else {
      setAuthState(true);
      navigate('#/');
    }
  } catch (e) {
    toast(e.message || 'Anmeldung fehlgeschlagen', 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Anmelden';
  }
}

function renderTotpVerify() {
  const body = document.getElementById('auth-step-login');
  body.innerHTML = `
    <div class="auth-totp-hint">
      <strong>2-Faktor-Authentifizierung</strong>
      Gib den aktuellen Code aus deiner Authenticator-App ein.
    </div>
    <div class="form-group">
      <label>6-stelliger Code</label>
      <input type="text" id="totp-code" class="totp-code-input"
             maxlength="6" inputmode="numeric" placeholder="000000" autocomplete="one-time-code" />
    </div>
    <div style="margin-top:20px">
      <button class="btn btn--primary btn--full btn--lg" id="btn-totp">Bestätigen</button>
    </div>
  `;

  const input = document.getElementById('totp-code');
  input.focus();
  input.addEventListener('keydown', e => { if (e.key === 'Enter') doVerifyTotp(); });
  document.getElementById('btn-totp').addEventListener('click', doVerifyTotp);
}

async function doVerifyTotp() {
  const code = document.getElementById('totp-code').value.trim();
  if (code.length !== 6) {
    toast('Bitte einen 6-stelligen Code eingeben', 'error');
    return;
  }

  try {
    const res = await api.verifyTotp({ code });
    if (!res) return;
    setAuthState(true);
    navigate('#/');
  } catch (e) {
    toast(e.message || 'Ungültiger Code', 'error');
  }
}

