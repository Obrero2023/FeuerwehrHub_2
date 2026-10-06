import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

const STATUS_COLORS = {
  geplant: '#6b7280',
  offen: '#2563eb',
  voll: '#dc2626',
  abgesagt: '#9ca3af',
  abgeschlossen: '#16a34a',
  entwurf: '#6b7280',
  veröffentlicht: '#16a34a',
  archiviert: '#9ca3af',
};

const STATUS_LABELS = {
  geplant: 'Geplant',
  offen: 'Offen',
  voll: 'Voll',
  abgesagt: 'Abgesagt',
  abgeschlossen: 'Abgeschlossen',
  entwurf: 'Entwurf',
  veröffentlicht: 'Veröffentlicht',
  archiviert: 'Archiviert',
};

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

/** Status aus dem Lehrgang-Objekt oder der Anfrage-URL extrahieren (Detailseite). */
function resolveStatusFromQuery(items, query) {
  if (items && items.length > 0) {
    return items[0].status;
  }
  if (query) {
    return decodeURIComponent(query).toLowerCase();
  }
  return 'veröffentlicht';
}

/** UI-Meldung je nach Berechtigung (nur Verwalter/ADMIN). */
function renderPermissionNotice(canManage) {
  if (!canManage) {
    return '';
  }
  // Verwalter: keine Mitteilung nötig
  return '';
}

// ── Hauptliste ────────────────────────────────────────────────────────────────

export async function renderLehrgaenge() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const content = document.getElementById('page-content');
  const isVerwalter = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');
  const isReader = user?.permissions?.includes('lehrgangsverwaltung.lesen');
  // Lehrgangsarten verwalten: Admin oder Nutzer mit Fahrzeugbuchung (Verwalten)-Recht
  const canManageLehrgangsarten = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('fahrzeugbuchung.verwalten');

  content.innerHTML = `
    <div class="page-header">
      <div><h2>Lehrgänge</h2><p>Übersicht der verfügbaren Lehrgänge und Anmeldungen</p></div>
      <div>
        ${canManageLehrgangsarten ? `<button class="btn btn--secondary" id="btn-lehrgangsarten">Lehrgangsarten verwalten</button>` : ''}
        ${isVerwalter ? '<button class="btn btn--primary" id="btn-new-lehrgang">+ Neuer Lehrgang</button>' : ''}
      </div>
    </div>
    <div id="lehrgangsarten-section" style="display:none"></div>
    <div id="lehrgang-form" style="display:none"></div>
    <div id="lehrgang-list" class="lehrgang-grid"></div>
  `;
  renderIcons(content);

  const renderList = (items, canManage, currentUser) => {
    const grid = document.getElementById('lehrgang-list');
    if (!grid) return;

    if (!items.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <span class="icon icon--large">📚</span>
          <p>Keine Lehrgänge vorhanden</p>
          ${canManage ? '<button class="btn btn--primary" id="btn-new-lehrgang">Neuer Lehrgang</button>' : ''}
        </div>`;
      const nb = document.getElementById('btn-new-lehrgang');
      if (nb) nb.addEventListener('click', showForm);
      return;
    }

    grid.innerHTML = items.map((l, idx) => `
      <div class="lehrgang-card" style="animation-delay: ${idx * 0.06}s">
        <div class="lehrgang-header">
          <h3>${esc(l.titel)}</h3>
          <span class="lehrgang-status" style="color:${STATUS_COLORS[l.status] || '#666'}">${STATUS_LABELS[l.status] || l.status}</span>
        </div>
        <div class="lehrgang-meta">
          <span>📅 ${l.start_datum} – ${l.end_datum}</span>
          ${l.ort ? `<span>📍 ${esc(l.ort)}</span>` : ''}
          ${l.anmeldeschluss ? `<span>📝 Bis ${l.anmeldeschluss}</span>` : ''}
          <span>👥 ${l.anmeldungen_count || 0}/${l.max_teilnehmer || '?'}</span>
          ${l.kosten !== undefined && l.kosten !== null ? `<span>💶 ${l.kosten} €${l.kosten_uebernommen_durch ? ' (' + l.kosten_uebernommen_durch + ')' : ''}</span>` : ''}
        </div>
        ${l.beschreibung ? `<p class="lehrgang-desc">${esc(l.beschreibung)}</p>` : ''}
        <div class="lehrgang-actions">
          <button class="btn btn--small btn--secondary view-lehrgang" data-id="${l.id}">Details</button>
          ${canManage ? `
            <button class="btn btn--small btn--info edit-lehrgang" data-id="${l.id}">Bearbeiten</button>
            <button class="btn btn--small btn--warning anmelden" data-id="${l.id}">Anmelden</button>
            <button class="btn btn--small btn--danger delete-lehrgang" data-id="${l.id}">Löschen</button>
          ` : ''}
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.view-lehrgang').forEach(b => {
      b.addEventListener('click', () => { window.location.hash = `#/lehrgang/${b.dataset.id}`; });
    });
    if (canManage) {
      document.querySelectorAll('.edit-lehrgang').forEach(b => {
        b.addEventListener('click', () => { window.location.hash = `#/lehrgang-edit/${b.dataset.id}`; });
      });
      document.querySelectorAll('.anmelden').forEach(b => {
        b.addEventListener('click', () => { window.location.hash = `#/lehrgang/${b.dataset.id}`; });
      });
      document.querySelectorAll('.delete-lehrgang').forEach(b => {
        b.addEventListener('click', async () => {
          if (confirm('Lehrgang wirklich löschen?')) {
            try { await api.deleteLehrgang(b.dataset.id); toast('Lehrgang gelöscht', 'success'); loadAndRender(); }
            catch (e) { toast(e.message, 'error'); }
          }
        });
      });
    }
  };

  document.getElementById('btn-new-lehrgang').addEventListener('click', showForm);

  await loadAndRender();
}

// ── Formular (Neu/Bearbeiten) ─────────────────────────────────────────────────

let _lehrgangsartenCache = null;
let _lehrgangsartenLoaded = false;

/** Lehrgangsarten laden (mit einfachem Cache). */
async function loadLehrgangsarten() {
  if (_lehrgangsartenLoaded) return _lehrgangsartenCache;
  try {
    const list = await api.getLehrgangsarten();
    _lehrgangsartenCache = Array.isArray(list) ? list : [];
  } catch (e) {
    _lehrgangsartenCache = [];
  }
  _lehrgangsartenLoaded = true;
  return _lehrgangsartenCache;
}

export const showForm = async (l = null) => {
  const formEl = document.getElementById('lehrgang-form');
  const listEl = document.getElementById('lehrgang-list');
  if (!formEl) return;
  formEl.style.display = 'block';
  if (listEl) listEl.style.display = 'none';

  // Load Lehrgangsarten for the dropdown
  const lehrgangsarten = await loadLehrgangsarten();

  formEl.innerHTML = `
    <div class="card">
      <h3>${l ? 'Lehrgang bearbeiten' : 'Neuer Lehrgang'}</h3>
      <form id="lehrgang-form-el" class="form-grid">
        <input type="text" id="fld-titel" placeholder="Titel / Bezeichnung" value="${l ? esc(l.titel) : ''}" required />
        <textarea id="feld-beschreibung" placeholder="Beschreibung">${l ? esc(l.beschreibung || '') : ''}</textarea>
        <select id="feld-lehrgangsart">
          <option value="">-- Lehrgangsart wählen --</option>
          ${lehrgangsarten.map(la => `
            <option value="${la.id}" ${l && l.lehrgangsart_id == la.id ? 'selected' : ''}>${esc(la.name)}</option>
          `).join('')}
        </select>
        <input type="text" id="feld-ort" placeholder="Veranstaltungsort" value="${l ? esc(l.ort || '') : ''}" />
        <div class="form-row">
          <input type="date" id="feld-start" value="${l && l.start_datum ? l.start_datum : ''}" required />
          <input type="date" id="feld-ende" value="${l && l.end_datum ? l.end_datum : ''}" required />
        </div>
        <div class="form-row">
          <input type="date" id="feld-anmeldeschluss" placeholder="Anmeldefrist" value="${l && l.anmeldeschluss ? l.anmeldeschluss : ''}" />
          <input type="number" id="feld-max" placeholder="Max. Plätze" value="${l && l.max_teilnehmer ? l.max_teilnehmer : ''}" min="1" />
        </div>
        <div class="form-row">
          <input type="number" id="feld-kosten" placeholder="Kosten (€)" value="${l && l.kosten ? l.kosten : ''}" step="0.01" />
          <select id="feld-kosten-durch">
            <option value="">Kostenübernahme</option>
            <option value="feuerwehr" ${l && l.kosten_uebernommen_durch === 'feuerwehr' ? 'selected' : ''}>Feuerwehr</option>
            <option value="teilnehmer" ${l && l.kosten_uebernommen_durch === 'teilnehmer' ? 'selected' : ''}>Teilnehmer</option>
            <option value="teilweise" ${l && l.kosten_uebernommen_durch === 'teilweise' ? 'selected' : ''}>Teilweise</option>
          </select>
        </div>
        ${l && l.status ? `<div class="form-row"><select id="feld-status">
            <option value="geplant" ${l.status === 'geplant' ? 'selected' : ''}>Geplant</option>
            <option value="offen" ${l.status === 'offen' ? 'selected' : ''}>Offen</option>
            <option value="voll" ${l.status === 'voll' ? 'selected' : ''}>Voll</option>
            <option value="abgesagt" ${l.status === 'abgesagt' ? 'selected' : ''}>Abgesagt</option>
            <option value="abgeschlossen" ${l.status === 'abgeschlossen' ? 'selected' : ''}>Abgeschlossen</option>
            <option value="entwurf" ${l.status === 'entwurf' ? 'selected' : ''}>Entwurf</option>
            <option value="veröffentlicht" ${l.status === 'veröffentlicht' ? 'selected' : ''}>Veröffentlicht</option>
            <option value="archiviert" ${l.status === 'archiviert' ? 'selected' : ''}>Archiviert</option>
          </select></div>` : ''}
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">${l ? 'Speichern' : 'Anlegen'}</button>
          <button type="button" id="btn-cancel" class="btn btn--secondary">Abbrechen</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('btn-cancel').addEventListener('click', () => {
    formEl.style.display = 'none';
    if (listEl) listEl.style.display = '';
  });

  document.getElementById('lehrgang-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      titel: document.getElementById('fld-titel').value,
      beschreibung: document.getElementById('feld-beschreibung').value || null,
      ort: document.getElementById('feld-ort').value || null,
      start_datum: document.getElementById('feld-start').value,
      end_datum: document.getElementById('feld-ende').value,
      anmeldeschluss: document.getElementById('feld-anmeldeschluss').value || null,
      max_teilnehmer: parseInt(document.getElementById('feld-max').value) || null,
      kosten: parseFloat(document.getElementById('feld-kosten').value) || null,
      kosten_uebernommen_durch: document.getElementById('feld-kosten-durch').value || null,
      lehrgangsart_id: document.getElementById('feld-lehrgangsart').value || null,
    };
    try {
      if (l) {
        await api.updateLehrgang(l.id, body);
        toast('Lehrgang aktualisiert', 'success');
      } else {
        await api.createLehrgang(body);
        toast('Lehrgang angelegt', 'success');
      }
      // Zurück zur Übersicht navigieren, um die Liste zu aktualisieren
      window.location.hash = '#/lehrgaenge';
    } catch (e) { toast(e.message, 'error'); }
  });
};

// ── Detailansicht ────────────────────────────────────────────────────────────

export async function renderLehrgangDetail() {
  const hash = window.location.hash;
  const id = hash.match(/#\/lehrgang\/(.+)$/)?.[1];
  if (!id) return window.location.hash = '#/lehrgaenge';

  const [settings, user, lehrgang, anmeldungen] = await Promise.all([
    api.getSettings(),
    api.me(),
    api.getLehrgang(id).catch(e => { toast(e.message, 'error'); return null; }),
  ]);
  if (!lehrgang) return;

  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const content = document.getElementById('page-content');
  const isVerwalter = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');
  const isReader = user?.permissions?.includes('lehrgangsverwaltung.lesen');

  const remainingSpots = (lehrgang.max_teilnehmer || 0) - (lehrgang.anmeldungen_count || 0);

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>${esc(lehrgang.titel)}</h2>
        <p><span class="lehrgang-status" style="color:${STATUS_COLORS[lehrgang.status] || '#666'}">${STATUS_LABELS[lehrgang.status] || lehrgang.status}</span>
          | ${isVerwalter ? 'Veranstaltungsort: ' + esc(lehrgang.ort || '–') : ''}</p>
        ${!isVerwalter && !isReader ? '<p style="color:var(--rot)">Sie haben nicht die Berechtigung, diese Seite zu sehen.</p>' : ''}
      </div>
      <div class="page-header-actions">
        <button class="btn btn--secondary" onclick="history.back()">Zurück</button>
        ${isVerwalter ? `
          <button class="btn btn--info" id="btn-edit-lehrgang">Bearbeiten</button>
          <button class="btn btn--warning" id="btn-anmeldungen">Teilnehmer</button>
          <button class="btn btn--primary" id="btn-email-template">E-Mail-Vorlage</button>
          <button class="btn btn--danger" id="btn-delete-lehrgang">Löschen</button>
        ` : ''}
      </div>
    </div>
    <div class="card">
      <h3>Veranstaltung</h3>
      <table class="details-table">
        <tr><td>📅 Start</td><td>${lehrgang.start_datum}</td></tr>
        <tr><td>📅 Ende</td><td>${lehrgang.end_datum}</td></tr>
        ${lehrgang.ort ? `<tr><td>📍 Ort</td><td>${esc(lehrgang.ort)}</td></tr>` : ''}
        ${lehrgang.anmeldeschluss ? `<tr><td>📝 Anmeldeschluss</td><td>${lehrgang.anmeldeschluss}</td></tr>` : ''}
        ${lehrgang.max_teilnehmer ? `<tr><td>👥 Plätze</td><td>${lehrgang.anmeldungen_count || 0} / ${lehrgang.max_teilnehmer} (offen: ${remainingSpots})</td></tr>` : ''}
      </table>
    </div>
    ${lehrgang.beschreibung ? `
    <div class="card">
      <h3>Beschreibung</h3>
      <p>${esc(lehrgang.beschreibung)}</p>
    </div>` : ''}
    ${lehrgang.voraussetzung ? `
    <div class="card">
      <h3>Voraussetzungen</h3>
      <p>${esc(lehrgang.voraussetzung)}</p>
    </div>` : ''}
    ${isVerwalter && !lehrgang.voraussetzung ? `
    <div class="card">
      <h3>Voraussetzungen bearbeiten</h3>
      <p><small>Voraussetzungen werden im Hauptformular hinterlegt.</small></p>
    </div>` : ''}
    ${!isVerwalter && remainingSpots <= 0 && isReader ? `
    <div class="card" style="border-color:var(--rot)">
      <h3 style="color:var(--rot)">Ausgebucht</h3>
      <p>Der Lehrgang ist vollständig belegt. Eine Anmeldung ist nicht mehr möglich.</p>
    </div>` : ''}
    ${!isVerwalter && (remainingSpots > 0 || !lehrgang.max_teilnehmer) && isReader ? `
    <div class="card" style="border-color:var(--grün,var(--personal-c))">
      <h3 style="color:var(--grün,var(--personal-c))">Anmeldung möglich</h3>
      <p>Es sind noch Plätze frei. Klicken Sie im Menü oben auf "Anmelden".</p>
      <button class="btn btn--primary" onclick="window.location.hash='#/lehrgaenge'">Zur Übersicht</button>
    </div>` : ''}
    ${isVerwalter && anmeldungen ? `
    <div class="card">
      <h3>Vorhandene Anmeldungen (${anmeldungen.length})</h3>
      <div id="anmeldungen-list"></div>
    </div>` : ''}
  `;

  renderIcons(content);

  if (isVerwalter) {
    const btnEdit = document.getElementById('btn-edit-lehrgang');
    if (btnEdit) btnEdit.addEventListener('click', () => { window.location.hash = `#/lehrgang-edit/${lehrgang.id}`; });
    const btnAnmeld = document.getElementById('btn-anmeldungen');
    if (btnAnmeld) btnAnmeld.addEventListener('click', () => { window.location.hash = `#/lehrgang/${lehrgang.id}/anmeldungen`; });
    const btnEmail = document.getElementById('btn-email-template');
    if (btnEmail) btnEmail.addEventListener('click', () => showEmailTemplate(lehrgang.id));
    const btnDelete = document.getElementById('btn-delete-lehrgang');
    if (btnDelete) btnDelete.addEventListener('click', () => deleteLehrgang(lehrgang.id));
  }

  if (isVerwalter && anmeldungen) {
    const listEl = document.getElementById('anmeldungen-list');
    if (listEl) {
      listEl.innerHTML = anmeldungen.map(a => `
        <div class="anmeldung-item">
          <span class="anmeldung-user"><strong>${esc(a.user_name)}</strong></span>
          <span class="anmeldung-date">${a.anmeldedatum}</span>
          <span class="anmeldung-status" style="color:${STATUS_COLORS[a.status] || '#666'}">${STATUS_LABELS[a.status] || a.status}</span>
          ${a.bemerkung ? `<span class="anmeldung-remark">${esc(a.bemerkung)}</span>` : ''}
        </div>
      `).join('');
    }
  }
}

async function deleteLehrgang(id) {
  if (!confirm('Lehrgang wirklich löschen?')) return;
  try {
    await api.deleteLehrgang(id);
    toast('Lehrgang gelöscht', 'success');
    window.location.hash = '#/lehrgaenge';
  } catch (e) { toast(e.message, 'error'); }
}

async function showEmailTemplate(id) {
  try {
    const data = await api.generateEmailTemplate(id);
    const template = `Betreff: Anmeldung für ${data.lehrgang_titel || 'Lehrgang'}

Sehr geehrte Damen und Herren,

Ihre Platzzuweisung für den Lehrgang "${data.lehrgang_titel}" wurde bestätigt.

Teilnehmer (${data.anzahl}):
${data.csv || '(keine bestätigten Teilnehmer)'}

Mit freundlichen Grüßen,
Lehrgangsverwaltung
`;
    await navigator.clipboard.writeText(template);
    toast(`E-Mail-Vorlage für ${data.anzahl} Teilnehmer in die Zwischenablage kopiert`, 'success');
  } catch (e) { toast(e.message, 'error'); }
}

// ── Bearbeitungsansicht ──────────────────────────────────────────────────────

export async function renderLehrgangEdit() {
  const hash = window.location.hash;
  const id = hash.match(/#\/lehrgang-edit\/(.+)$/)?.[1];
  if (!id) return window.location.hash = '#/lehrgaenge';

  const [settings, user, lehrgang] = await Promise.all([
    api.getSettings(),
    api.me(),
    api.getLehrgang(id).catch(e => { toast(e.message, 'error'); return null; }),
  ]);
  if (!lehrgang) return;
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Lehrgang bearbeiten</h2></div>
      <button class="btn btn--secondary" onclick="history.back()">Zurück</button>
    </div>
    <div id="lehrgang-form" style="display:block"></div>
  `;
  renderIcons(content);

  await showForm(lehrgang);
}

// ── Anmeldungen (Verwaltung) ─────────────────────────────────────────────────

let _currentAnmeldungenLehrgangId = null;

export async function renderLehrgangAnmeldungen() {
  const hash = window.location.hash;
  const id = hash.match(/#\/lehrgang\/(.+?)\/anmeldungen$/)?.[1];
  if (!id) return window.location.hash = '#/lehrgaenge';

  const [settings, user, lehrgang, anmeldungen] = await Promise.all([
    api.getSettings(),
    api.me(),
    api.getLehrgang(id).catch(e => { toast(e.message, 'error'); return null; }),
    api.getAnmeldungen(id).catch(e => { toast(e.message, 'error'); return []; }),
  ]);
  if (!lehrgang) return;

  _currentAnmeldungenLehrgangId = lehrgang.id;

  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Anmeldungen: ${esc(lehrgang.titel)}</h2>
        <p>${lehrgang.start_datum} – ${lehrgang.end_datum}</p>
      </div>
      <div class="page-header-actions">
        <button class="btn btn--secondary" onclick="history.back()">Zurück</button>
        <button class="btn btn--primary" id="btn-email-template">E-Mail-Vorlage</button>
      </div>
    </div>
    <div class="card">
      <h3>Alle Registrierungen (${anmeldungen.length})</h3>
      <p>Plätze: ${lehrgang.max_teilnehmer || '?'}</p>
      <div id="anmeldungen-list"></div>
    </div>
  `;
  renderIcons(content);

  const btnEmail = document.getElementById('btn-email-template');
  if (btnEmail) btnEmail.addEventListener('click', () => showEmailTemplate(_currentAnmeldungenLehrgangId));

  const listEl = document.getElementById('anmeldungen-list');
  if (listEl) {
    listEl.innerHTML = anmeldungen.map(a => `
      <div class="anmeldung-item">
        <span class="anmeldung-user"><strong>${esc(a.user_name)}</strong></span>
        <span class="anmeldung-date">${a.anmeldedatum}</span>
        <span class="anmeldung-status" style="color:${STATUS_COLORS[a.status] || '#666'}">${STATUS_LABELS[a.status] || a.status}</span>
        ${a.bemerkung ? `<span class="anmeldung-remark">${esc(a.bemerkung)}</span>` : ''}
        <div class="anmeldung-actions">
          ${a.status !== 'abgemeldet' ? `
            <button class="btn btn--success btn--small" data-anm="${a.id}" data-act="confirm">Platz zuweisen</button>
            <button class="btn btn--danger btn--small" data-anm="${a.id}" data-act="reject">Ablehnen / Warteliste</button>
          ` : ''}
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.anmeldung-actions button[data-act="confirm"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const anmId = btn.dataset.anm;
        try {
          await api.updateAnmeldung(_currentAnmeldungenLehrgangId, anmId, { status: 'bestaetigt' });
          toast('Platz zugewiesen', 'success');
          renderLehrgangAnmeldungen();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
    listEl.querySelectorAll('.anmeldung-actions button[data-act="reject"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const anmId = btn.dataset.anm;
        try {
          await api.updateAnmeldung(_currentAnmeldungenLehrgangId, anmId, { status: 'abgelehnt' });
          toast('Abgelehnt / Warteliste', 'success');
          renderLehrgangAnmeldungen();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }
}

// ── Lehrgangsarten verwalten ────────────────────────────────────────────

/** Sektion umschalten: Liste anzeigen / zum Lehrgänge-Overlay zurück */
async function showLehrgangsartenSection() {
  const formEl = document.getElementById('lehrgang-form');
  const sectionEl = document.getElementById('lehrgangsarten-section');
  const listEl = document.getElementById('lehrgang-list');
  if (!sectionEl) return;

  if (sectionEl.style.display === 'block') {
    // Zurueck zur Lehrgaenge-Uebersicht
    sectionEl.style.display = 'none';
    if (formEl) formEl.style.display = 'none';
    if (listEl) listEl.style.display = '';
    return;
  }

  sectionEl.style.display = 'block';
  if (formEl) formEl.style.display = 'none';
  if (listEl) listEl.style.display = 'none';
  renderLehrgangsarten();
}

let _currentLehrgangsartId = null;

/** Lehrgangsarten-Liste laden und rendern */
async function renderLehrgangsarten() {
  const sectionEl = document.getElementById('lehrgangsarten-section');
  if (!sectionEl) return;

  let lehrgangsarten;
  try {
    lehrgangsarten = await api.getLehrgangsarten();
  } catch (e) {
    sectionEl.innerHTML = `<div class="card"><p class="error-msg">${esc(e.message)}</p></div>`;
    return;
  }

  sectionEl.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>Lehrgangsarten verwalten</span>
        <button class="btn btn--primary btn--sm" id="btn-new-lehrgangsart">Neue Lehrgangsart</button>
      </div>
      <div class="card__body card__body--flush">
        <div id="lehrgangsarten-form" style="display:none"></div>
        <div id="lehrgangsarten-list">
          <p class="wrap-loading">Lade...</p>
        </div>
      </div>
    </div>
  `;
  renderIcons(sectionEl);

  const listEl = document.getElementById('lehrgangsarten-list');
  if (!listEl) return;

  if (!lehrgangsarten.length) {
    listEl.innerHTML = '<p class="text-muted">Noch keine Lehrgangsarten vorhanden.</p>';
    return;
  }

  listEl.innerHTML = lehrgangsarten.map(la => `
    <div class="lehrgangsart-row" data-id="${la.id}">
      <div>
        <div class="fw-bold">${esc(la.name)}</div>
        ${la.beschreibung ? `<div class="text-muted text-sm">${esc(la.beschreibung)}</div>` : ''}
        ${la.voraussetzung ? `<div class="text-muted text-sm">Voraussetzung: ${esc(la.voraussetzung)}</div>` : ''}
      </div>
      <div class="btn-group">
        <button class="btn btn--outline btn--sm" data-action="edit" data-id="${la.id}"
          data-name="${esc(la.name)}" data-beschreibung="${esc(la.beschreibung || '')}"
          data-voraussetzung="${esc(la.voraussetzung || '')}">Bearbeiten</button>
        <button class="btn btn--danger btn--sm" data-action="delete" data-id="${la.id}" data-name="${esc(la.name)}">
          Löschen
        </button>
      </div>
    </div>
  `).join('');

  renderIcons(listEl);

  // Neue Lehrgangsart
  document.getElementById('btn-new-lehrgangsart').onclick = () => {
    _currentLehrgangsartId = null;
    showLehrgangsartenForm();
  };

  // Bearbeiten
  listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      _currentLehrgangsartId = btn.dataset.id;
      showLehrgangsartenForm(btn.dataset.name, btn.dataset.beschreibung, btn.dataset.voraussetzung);
    });
  });

  // Loeschen
  listEl.querySelectorAll('[data-action="delete"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const name = btn.dataset.name;
      if (!confirm(`Lehrgangsart "${name}" wirklich löschen?`)) return;
      try {
        await api.deleteLehrgangsart(btn.dataset.id);
        toast('Lehrgangsart gelöscht', 'success');
        renderLehrgangsarten();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

/** Formular zum Erstellen/Bearbeiten einer Lehrgangsart anzeigen */
function showLehrgangsartenForm(name = '', beschreibung = '', voraussetzung = '') {
  const formEl = document.getElementById('lehrgangsarten-form');
  const listEl = document.getElementById('lehrgangsarten-list');
  if (!formEl || !listEl) return;

  formEl.style.display = 'block';
  listEl.style.display = 'none';

  formEl.innerHTML = `
    <div class="card">
      <h3>${_currentLehrgangsartId ? 'Lehrgangsart bearbeiten' : 'Neue Lehrgangsart'}</h3>
      <form id="lehrgangsarten-form-el" class="form-grid">
        <div class="form-group form-group--compact">
          <label>Name des Lehrgangs <span class="required">*</span></label>
          <input type="text" id="fld-name" placeholder="z.B. Grundlehrgang" value="${esc(name)}" required />
        </div>
        <div class="form-group form-group--compact">
          <label>Beschreibung</label>
          <textarea id="feld-beschreibung" placeholder="Beschreibung des Lehrgangs" rows="3">${esc(beschreibung)}</textarea>
        </div>
        <div class="form-group form-group--compact">
          <label>Voraussetzung</label>
          <textarea id="feld-voraussetzung" placeholder="Welche Voraussetzungen müssen Teilnehmer mitbringen?" rows="3">${esc(voraussetzung)}</textarea>
        </div>
        <div class="form-actions">
          <button type="submit" class="btn btn--primary">${_currentLehrgangsartId ? 'Speichern' : 'Anlegen'}</button>
          <button type="button" id="btn-cancel-lehrgangsart" class="btn btn--secondary">Abbrechen</button>
        </div>
      </form>
    </div>
  `;

  document.getElementById('btn-cancel-lehrgangsart').addEventListener('click', () => {
    formEl.style.display = 'none';
    listEl.style.display = 'block';
    renderLehrgangsarten();
  });

  document.getElementById('lehrgangsarten-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();
    const body = {
      name: document.getElementById('fld-name').value,
      beschreibung: document.getElementById('feld-beschreibung').value || null,
      voraussetzung: document.getElementById('feld-voraussetzung').value || null,
    };
    try {
      if (_currentLehrgangsartId) {
        await api.updateLehrgangsart(_currentLehrgangsartId, body);
        toast('Lehrgangsart aktualisiert', 'success');
      } else {
        await api.createLehrgangsart(body);
        toast('Lehrgangsart angelegt', 'success');
      }
      formEl.style.display = 'none';
      listEl.style.display = 'block';
      renderLehrgangsarten();
    } catch (e) { toast(e.message, 'error'); }
  });
}