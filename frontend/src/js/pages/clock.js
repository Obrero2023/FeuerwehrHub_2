import { api } from '../api.js';
import { esc } from '../utils.js';
import { Html5Qrcode } from 'html5-qrcode';

export async function renderClock() {
  // Direkt in #app rendern — page-content existiert evtl. nicht (kein Login/Shell)
  const app = document.getElementById('app');
  const shell = document.getElementById('app-shell');

  // Shell ausblenden fuer Kiosk-Modus
  if (shell) shell.style.display = 'none';
  document.body.style.overflow = 'hidden';

  // Eigenen Container erzeugen
  let content = document.getElementById('page-content');
  if (!content) {
    app.innerHTML = '<div id="page-content"></div>';
    content = document.getElementById('page-content');
  }

  // Settings laden fuer FF-Name
  let ffName = 'FeuerwehrHub';
  try {
    const s = await fetch('/api/settings').then(r => r.json());
    ffName = s?.ff_name || ffName;
  } catch {}

  content.innerHTML = `
    <div class="clock-kiosk">
      <div class="clock-kiosk__header">
        <div class="clock-kiosk__title">${esc(ffName)}</div>
        <div class="clock-kiosk__subtitle">Stempeluhr</div>
        <div class="clock-kiosk__time" id="clock-time"></div>
      </div>

      <div class="clock-kiosk__body">
        <div class="clock-kiosk__left">
          <div class="clock-kiosk__scan-area" id="scan-area">
            <div class="clock-kiosk__tabs">
              <button class="clock-tab active" data-tab="camera">Kamera</button>
              <button class="clock-tab" data-tab="manual">Manuelle Eingabe</button>
            </div>

            <div id="tab-camera" class="clock-tab-content active">
              <div id="qr-reader" class="clock-qr-reader"></div>
              <div class="clock-hint-row">
                <p class="clock-kiosk__hint">Dienstausweis vor die Kamera halten</p>
                <button class="btn btn--outline btn--sm" id="btn-flip-camera" title="Kamera wechseln">🔄 Drehen</button>
              </div>
            </div>

            <div id="tab-manual" class="clock-tab-content" style="display:none">
              <div class="clock-manual-pad">
                <input type="text" id="badge-input" class="clock-kiosk__input"
                  placeholder="Badge-Code oder ID eingeben..." autocomplete="off" />
                <button class="btn btn--primary clock-kiosk__submit" id="btn-punch">Stempeln</button>
              </div>
            </div>

            <p class="clock-kiosk__usb-hint">USB-Scanner: Einfach scannen — wird automatisch erkannt</p>
          </div>

          <div class="clock-kiosk__feedback" id="clock-feedback" style="display:none">
            <div class="clock-kiosk__feedback-icon" id="feedback-icon"></div>
            <div class="clock-kiosk__feedback-name" id="feedback-name"></div>
            <div class="clock-kiosk__feedback-action" id="feedback-action"></div>
            <div class="clock-kiosk__feedback-time" id="feedback-time"></div>
            <div class="clock-kiosk__feedback-termin" id="feedback-termin" style="display:none"></div>
          </div>
        </div>

        <div class="clock-kiosk__right">
          <h3>Aktuell an der Wache</h3>
          <div id="active-list" class="clock-kiosk__active-list"></div>
        </div>
      </div>

      <div class="clock-kiosk__footer">
        <a href="#/" class="clock-kiosk__back">← Zurück zu FeuerwehrHub</a>
      </div>
    </div>
  `;

  // ── Uhr ─────────────────────────────────────────────────────────────────

  function updateClock() {
    const el = document.getElementById('clock-time');
    if (!el) return;
    const now = new Date();
    el.textContent = now.toLocaleDateString('de-DE', {
      weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    }) + '  ·  ' + now.toLocaleTimeString('de-DE', {
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
  }
  updateClock();
  const clockInterval = setInterval(updateClock, 1000);

  // ── Tabs ────────────────────────────────────────────────────────────────

  let qrScanner = null;
  let cameraRunning = false;
  let facingMode = 'environment'; // 'environment' = Rückkamera, 'user' = Frontkamera

  document.querySelectorAll('.clock-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.clock-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.clock-tab-content').forEach(c => { c.style.display = 'none'; c.classList.remove('active'); });
      tab.classList.add('active');
      const target = document.getElementById(`tab-${tab.dataset.tab}`);
      target.style.display = '';
      target.classList.add('active');

      if (tab.dataset.tab === 'camera' && !cameraRunning) {
        startCamera();
      } else if (tab.dataset.tab === 'manual') {
        stopCamera();
        setTimeout(() => document.getElementById('badge-input')?.focus(), 100);
      }
    });
  });

  // ── Kamera QR-Scanner ───────────────────────────────────────────────────

  let lastScan = '';
  let lastScanTime = 0;

  async function startCamera() {
    const readerEl = document.getElementById('qr-reader');
    if (!readerEl) return;

    const qrConfig = { fps: 10, qrbox: { width: 280, height: 280 } };
    const onScan = (decodedText) => {
      const now = Date.now();
      if (decodedText === lastScan && now - lastScanTime < 5000) return;
      lastScan = decodedText;
      lastScanTime = now;
      handleBadge(decodedText);
    };

    try {
      qrScanner = new Html5Qrcode('qr-reader');

      // Versuch 1: facingMode (funktioniert auf modernen Geräten)
      try {
        await qrScanner.start({ facingMode }, qrConfig, onScan, () => {});
        cameraRunning = true;
        return;
      } catch {}

      // Versuch 2: Kamera per Device-ID (Fallback für ältere Geräte)
      const devices = await Html5Qrcode.getCameras();
      if (devices && devices.length > 0) {
        // Rückkamera bevorzugen, sonst erste verfügbare
        const backCam = devices.find(d => /back|rear|environment/i.test(d.label));
        const cam = backCam || devices[devices.length - 1];
        await qrScanner.start(cam.id, qrConfig, onScan, () => {});
        cameraRunning = true;
        return;
      }

      throw new Error('Keine Kamera gefunden');
    } catch (err) {
      readerEl.innerHTML = `
        <div class="clock-no-camera">
          <p class="clock-no-camera__title">Keine Kamera verfügbar</p>
          <p class="clock-no-camera__hint">Nutze den USB-Scanner oder die manuelle Eingabe</p>
        </div>`;
    }
  }

  async function stopCamera() {
    if (qrScanner && cameraRunning) {
      try { await qrScanner.stop(); } catch {}
      cameraRunning = false;
    }
  }

  // Kamera starten
  startCamera();

  // ── Aktive Eintraege ────────────────────────────────────────────────────

  async function loadActive() {
    const list = document.getElementById('active-list');
    if (!list) return;

    try {
      const entries = await api.clockActive();
      if (!entries.length) {
        list.innerHTML = '<p class="clock-active-empty">Niemand eingestempelt</p>';
        return;
      }
      list.innerHTML = entries.map(e => {
        const since = new Date(e.check_in).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        return `
          <div class="clock-kiosk__active-item">
            <span class="clock-kiosk__active-dot"></span>
            <strong>${esc(e.display_name || e.username)}</strong>
            <span class="clock-active-since">seit ${since}</span>
          </div>`;
      }).join('');
    } catch {
      list.innerHTML = '<p class="clock-active-empty">Fehler beim Laden</p>';
    }
  }
  loadActive();
  const activeInterval = setInterval(loadActive, 15000);

  // ── Feedback ────────────────────────────────────────────────────────────

  let feedbackTimeout = null;

  function showFeedback(data) {
    clearTimeout(feedbackTimeout);
    const scanArea = document.getElementById('scan-area');
    const feedback = document.getElementById('clock-feedback');
    scanArea.style.display = 'none';
    feedback.style.display = 'flex';
    stopCamera();

    const isIn = data.action === 'check_in';
    document.getElementById('feedback-icon').textContent = isIn ? '✅' : '👋';
    document.getElementById('feedback-name').textContent = data.display_name;
    document.getElementById('feedback-action').textContent = isIn ? 'Eingestempelt' : 'Ausgestempelt';
    document.getElementById('feedback-action').className =
      `clock-kiosk__feedback-action ${isIn ? 'feedback--in' : 'feedback--out'}`;
    document.getElementById('feedback-time').textContent =
      new Date(data.time).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) + ' Uhr';

    const terminEl = document.getElementById('feedback-termin');
    if (terminEl) {
      if (isIn && data.termin_title) {
        terminEl.textContent = `📅 ${data.termin_title}`;
        terminEl.style.display = '';
      } else {
        terminEl.style.display = 'none';
      }
    }

    feedback.className = `clock-kiosk__feedback ${isIn ? 'feedback--bg-in' : 'feedback--bg-out'}`;

    loadActive();

    feedbackTimeout = setTimeout(() => {
      feedback.style.display = 'none';
      feedback.className = 'clock-kiosk__feedback';
      scanArea.style.display = '';
      document.getElementById('badge-input').value = '';
      // Kamera wieder starten wenn Tab aktiv
      if (document.querySelector('.clock-tab[data-tab="camera"].active')) {
        startCamera();
      } else {
        document.getElementById('badge-input')?.focus();
      }
    }, 4000);
  }

  function showError(msg) {
    clearTimeout(feedbackTimeout);
    const scanArea = document.getElementById('scan-area');
    const feedback = document.getElementById('clock-feedback');
    scanArea.style.display = 'none';
    feedback.style.display = 'flex';
    feedback.className = 'clock-kiosk__feedback feedback--bg-error';

    document.getElementById('feedback-icon').textContent = '❌';
    document.getElementById('feedback-name').textContent = msg;
    document.getElementById('feedback-action').textContent = '';
    document.getElementById('feedback-time').textContent = '';

    feedbackTimeout = setTimeout(() => {
      feedback.style.display = 'none';
      feedback.className = 'clock-kiosk__feedback';
      scanArea.style.display = '';
      document.getElementById('badge-input').value = '';
      if (document.querySelector('.clock-tab[data-tab="camera"].active')) {
        startCamera();
      } else {
        document.getElementById('badge-input')?.focus();
      }
    }, 3000);
  }

  // ── Badge-Code verarbeiten ──────────────────────────────────────────────

  async function handleBadge(code) {
    if (!code) return;

    // vCard QR-Code parsen: FeuerwehrHub-ID extrahieren (Option B)
    let badgeCode = code.trim();
    const idMatch = badgeCode.match(/FeuerwehrHub-ID\s+([0-9a-f-]{36})/i);
    if (idMatch) {
      badgeCode = idMatch[1];
    }

    try {
      const result = await api.clockPunch({ badge_code: badgeCode });
      showFeedback(result);
    } catch (e) {
      showError(e.message || 'Unbekannter Badge-Code');
    }
  }

  // ── Manuelle Eingabe ────────────────────────────────────────────────────

  const badgeInput = document.getElementById('badge-input');
  badgeInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleBadge(badgeInput.value.trim());
    }
  });
  document.getElementById('btn-punch').addEventListener('click', () => {
    handleBadge(badgeInput.value.trim());
  });

  // Kamera drehen
  document.getElementById('btn-flip-camera').addEventListener('click', async () => {
    facingMode = facingMode === 'environment' ? 'user' : 'environment';
    await stopCamera();
    await startCamera();
  });

  // ── USB-Scanner / RFID Listener ────────────────────────────────────────

  let scanBuffer = '';
  let scanTimeout = null;

  function onKeyDown(e) {
    if (document.activeElement === badgeInput) return;
    if (document.getElementById('clock-feedback')?.style.display !== 'none') return;

    if (e.key === 'Enter' && scanBuffer.length >= 4) {
      e.preventDefault();
      const code = scanBuffer;
      scanBuffer = '';
      clearTimeout(scanTimeout);
      handleBadge(code);
      return;
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
      clearTimeout(scanTimeout);
      scanBuffer += e.key;
      scanTimeout = setTimeout(() => { scanBuffer = ''; }, 80);
    }
  }
  document.addEventListener('keydown', onKeyDown);

  // ── Cleanup ─────────────────────────────────────────────────────────────

  const observer = new MutationObserver(() => {
    if (!document.getElementById('scan-area')) {
      clearInterval(clockInterval);
      clearInterval(activeInterval);
      clearTimeout(feedbackTimeout);
      document.removeEventListener('keydown', onKeyDown);
      stopCamera();
      if (shell) shell.style.display = '';
      document.body.style.overflow = '';
      observer.disconnect();
    }
  });
  observer.observe(content, { childList: true });
}
