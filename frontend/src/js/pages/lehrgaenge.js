import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate, formatDateTime } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

let currentUser = null;
let lehrgaengeCache = [];
let lehrgangsartenCache = [];
let currentLehrgangId = null; // for anmeldungen view
let editingLehrgangId = null;
let userAnmeldungenCache = new Set(); // Cache of course IDs the user is registered for
let userAnmeldungByLehrgang = new Map(); // Cache of anmeldung IDs keyed by lehrgang_id

export async function renderLehrgaenge() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  currentUser = user;
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const content = document.getElementById('page-content');
  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
  const canRead = isAdmin || (user?.permissions || []).includes('lehrgangsverwaltung');
  const canManage = isAdmin || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');

  if (!canRead) {
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Kein Zugriff</h2><p>Sie benötigen die Berechtigung "lehrgangsverwaltung", um diese Seite aufzurufen.</p></div>
      </div>
    `;
    return;
  }

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Lehrgangsverwaltung</h2>
        <p>Feuerwehr-Lehrgänge verwalten und Anmeldungen organisieren</p>
      </div>
      ${canManage ? `<button class="btn btn--primary" id="btn-new-lehrgang">+ Neuer Lehrgang</button>` : ''}
    </div>
    <div id="lehrgang-form-wrap" style="display:none"></div>
    <div id="lehrgang-list-wrap"></div>
    <div id="anmeldungen-wrap" style="display:none"></div>
  `;
  renderIcons(content);

  // Load lehrgangsarten for dropdown
  try { lehrgangsartenCache = await api.getLehrgaenge({ art: '' }).catch(() => []); } catch(e) {}
  // Actually need a dedicated endpoint for lehrgangsarten - let's check if exists in api
  // For now we'll fetch them from the first lehrgänge response or use empty array
  // Actually, there's no getLehrgangsarten in api.js yet - we'll fetch via getLehrgaenge and extract unique arts

  await loadLehrgaenge();

  // --- Load & Render Lehrgänge ---
  async function loadLehrgaenge() {
    const wrap = document.getElementById('lehrgang-list-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state">Lade Lehrgänge...</div>';

    try {
      const [lehrgaenge, userAnmeldungen] = await Promise.all([
        api.getLehrgaenge(),
        api.getMe() // Get current user to fetch their registrations
      ]);
      lehrgaengeCache = lehrgaenge || [];

      // Fetch user's registrations
      if (userAnmeldungen && userAnmeldungen.id) {
        const anmeldungen = await api.getMyAnmeldungen();
        userAnmeldungenCache = new Set(anmeldungen.map(a => a.lehrgang_id));
        userAnmeldungByLehrgang = new Map(anmeldungen.map(a => [a.lehrgang_id, a.id]));
      } else {
        userAnmeldungenCache = new Set();
        userAnmeldungByLehrgang = new Map();
      }

      // Extract unique lehrgangsarten from the list
      const artsMap = new Map();
      lehrgaengeCache.forEach(l => {
        if (l.lehrgangsart_id && l.lehrgangsart_name) {
          artsMap.set(l.lehrgangsart_id, { id: l.lehrgangsart_id, name: l.lehrgangsart_name });
        }
      });
      lehrgangsartenCache = Array.from(artsMap.values());

      renderLehrgangList();
    } catch (e) {
      toast(e.message, 'error');
      wrap.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
    }
  }

  function isUserAnmeldet(lehrgangId) {
    return userAnmeldungenCache.has(lehrgangId);
  }

  function getCurrentUserId() {
    return currentUser?.id || null;
  }

  function renderLehrgangList() {
    const wrap = document.getElementById('lehrgang-list-wrap');
    if (!wrap) return;

    if (!lehrgaengeCache.length) {
      wrap.innerHTML = '<div class="empty-state">Noch keine Lehrgänge vorhanden.</div>';
      return;
    }

    const statusColors = {
      'geplant':    '#6c757d',
      'offen':      '#3b82f6',
      'voll':       '#f59e0b',
      'abgesagt':   '#ef4444',
      'abgeschlossen': '#22c55e',
    };

    const statusLabels = {
      'geplant':    'Geplant',
      'offen':      'Offen',
      'voll':       'Voll',
      'abgesagt':   'Abgesagt',
      'abgeschlossen': 'Abgeschlossen',
    };

    wrap.innerHTML = `
      <div class="filter-bar">
        <div class="filter-group">
          <label>Status filtern</label>
          <select id="filter-status">
            <option value="">Alle</option>
            <option value="geplant">Geplant</option>
            <option value="offen">Offen</option>
            <option value="voll">Voll</option>
            <option value="abgesagt">Abgesagt</option>
            <option value="abgeschlossen">Abgeschlossen</option>
          </select>
        </div>
        <div class="filter-group">
          <label>Lehrgangsart</label>
          <select id="filter-art">
            <option value="">Alle</option>
            ${lehrgangsartenCache.map(a => `<option value="${a.id}">${esc(a.name)}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label>Ab Datum</label>
          <input type="date" id="filter-ab-datum" />
        </div>
        <div class="filter-group">
          <button class="btn btn--outline" id="btn-reset-filter">Zurücksetzen</button>
        </div>
      </div>
      <table class="data-table">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Art</th>
            <th>Zeitraum</th>
            <th>Ort</th>
            <th>Anmeldeschluss</th>
            <th>Max TN</th>
            <th style="color:var(--text-color)">Status</th>
            <th>Anmeldungen</th>
            ${canManage ? '<th>Aktionen</th>' : ''}
            ${!canManage ? '<th>Meine Anmeldung</th>' : ''}
          </tr>
        </thead>
        <tbody>
          ${lehrgaengeCache.map(l => {
            const statusColor = statusColors[l.status] || '#6c757d';
            const anmeldungenPct = l.max_teilnehmer ? Math.round((l.anmeldungen_count / l.max_teilnehmer) * 100) : 0;
            return `
            <tr data-id="${l.id}" style="--status-color: ${statusColor}">
              <td><strong>${esc(l.titel)}</strong></td>
              <td>${esc(l.lehrgangsart_name || '—')}</td>
              <td>${formatDate(l.start_datum)} – ${formatDate(l.end_datum)}</td>
              <td>${esc(l.ort || '—')}</td>
              <td>${l.anmeldeschluss ? formatDate(l.anmeldeschluss) : '—'}</td>
              <td>${l.max_teilnehmer ? l.max_teilnehmer : '—'}</td>
              <td style="color:var(--status-color)">${statusLabels[l.status] || l.status}</td>
              <td>${l.anmeldungen_count || 0} ${l.max_teilnehmer ? `<span style="font-size:0.8em;color:var(--text-muted)">(${anmeldungenPct}%)</span>` : ''}</td>
              ${canManage ? `
                <td>
                  <div class="btn-group">
                    <button class="btn btn--outline btn--sm btn-edit-lehrgang" data-id="${l.id}">Bearbeiten</button>
                    <button class="btn btn--outline btn--sm btn-anmeldungen" data-id="${l.id}" title="Anmeldungen verwalten">${icon('users', 14)}</button>
                    <button class="btn btn--danger btn--sm btn-delete-lehrgang" data-id="${l.id}">Löschen</button>
                  </div>
                </td>` : `
                <td>
                  <div class="btn-group">
                    ${isUserAnmeldet(l.id) ? `<button class="btn btn--danger btn--sm btn-self-anmeldung" data-id="${l.id}">Abmelden</button>` : `<button class="btn btn--primary btn--sm btn-self-anmeldung" data-id="${l.id}">Anmelden</button>`}
                  </div>
                </td>`}
            </tr>`;
          }).join('')}
        </tbody>
      </table>
    `;
    renderIcons(wrap);

    // Filter handlers
    const applyFilter = () => {
      const status = document.getElementById('filter-status').value;
      const art = document.getElementById('filter-art').value;
      const abDatum = document.getElementById('filter-ab-datum').value;

      // We'll do server-side filtering via API
      loadLehrgaengeFiltered(status, art, abDatum);
    };

    document.getElementById('filter-status')?.addEventListener('change', applyFilter);
    document.getElementById('filter-art')?.addEventListener('change', applyFilter);
    document.getElementById('filter-ab-datum')?.addEventListener('change', applyFilter);
    document.getElementById('btn-reset-filter')?.addEventListener('click', () => {
      document.getElementById('filter-status').value = '';
      document.getElementById('filter-art').value = '';
      document.getElementById('filter-ab-datum').value = '';
      loadLehrgaenge();
    });

    // Action buttons
    wrap.querySelectorAll('.btn-edit-lehrgang').forEach(btn => {
      btn.addEventListener('click', () => openLehrgangForm(btn.dataset.id));
    });

    wrap.querySelectorAll('.btn-delete-lehrgang').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Lehrgang wirklich löschen? Dies entfernt auch alle Anmeldungen.')) return;
        try {
          await api.deleteLehrgang(btn.dataset.id);
          toast('Lehrgang gelöscht');
          await loadLehrgaenge();
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    wrap.querySelectorAll('.btn-anmeldungen').forEach(btn => {
      btn.addEventListener('click', () => showAnmeldungen(btn.dataset.id));
    });

    // Self registration / de-registration button
    wrap.querySelectorAll('.btn-self-anmeldung').forEach(btn => {
      btn.addEventListener('click', async () => {
        const lehrgangId = btn.dataset.id;
        const isAbmelden = btn.textContent.trim() === 'Abmelden';
        try {
          if (isAbmelden) {
            const anmeldungId = userAnmeldungByLehrgang.get(lehrgangId);
            if (anmeldungId) {
              await api.deleteAnmeldung(lehrgangId, anmeldungId);
            }
            toast('Abgemeldet');
          } else {
            await api.createAnmeldung(lehrgangId, { bemerkung: null });
            toast('Anmeldung erfolgreich');
          }
          await loadLehrgaenge();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  async function loadLehrgaengeFiltered(status, art, abDatum) {
    const wrap = document.getElementById('lehrgang-list-wrap');
    if (!wrap) return;
    wrap.innerHTML = '<div class="empty-state">Lade Lehrgänge...</div>';

    try {
      const params = {};
      if (status) params.status = status;
      if (art) params.art = art;
      if (abDatum) params.ab_datum = abDatum;
      const lehrgaenge = await api.getLehrgaenge(params);
      lehrgaengeCache = lehrgaenge || [];
      renderLehrgangList();
    } catch (e) {
      toast(e.message, 'error');
      wrap.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
    }
  }

  // --- Lehrgang Form (Create/Edit) ---
  function openLehrgangForm(id = null) {
    editingLehrgangId = id;
    const isEdit = !!id;
    const lehrgang = isEdit ? lehrgaengeCache.find(l => l.id === id) : null;
    const formWrap = document.getElementById('lehrgang-form-wrap');
    const listWrap = document.getElementById('lehrgang-list-wrap');

    formWrap.style.display = 'block';
    listWrap.style.display = 'none';

    const statusOptions = ['geplant', 'offen', 'voll', 'abgesagt', 'abgeschlossen']
      .map(s => `<option value="${s}" ${isEdit && lehrgang?.status === s ? 'selected' : ''}>${statusLabels[s]}</option>`).join('');
    const artOptions = lehrgangsartenCache.map(a => `<option value="${a.id}" ${isEdit && lehrgang?.lehrgangsart_id === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('');

    formWrap.innerHTML = `
      <div class="card">
        <div class="card__header">${isEdit ? 'Lehrgang bearbeiten' : 'Neuen Lehrgang anlegen'}</div>
        <div class="card__body">
          <div class="form-group">
            <label>Titel <span class="required">*</span></label>
            <input type="text" id="lg-titel" maxlength="200" value="${isEdit ? esc(lehrgang?.titel || '') : ''}" placeholder="Titel des Lehrgangs" />
          </div>
          <div class="form-group">
            <label>Beschreibung</label>
            <textarea id="lg-beschreibung" rows="3" maxlength="2000" placeholder="Beschreibung des Lehrgangs">${isEdit ? esc(lehrgang?.beschreibung || '') : ''}</textarea>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Ort</label>
              <input type="text" id="lg-ort" maxlength="200" value="${isEdit ? esc(lehrgang?.ort || '') : ''}" placeholder="Veranstaltungsort" />
            </div>
            <div class="form-group">
              <label>Lehrgangsart</label>
              <select id="lg-lehrgangsart">
                <option value="">— Keine Art —</option>
                ${artOptions}
              </select>
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Startdatum <span class="required">*</span></label>
              <input type="date" id="lg-start" value="${isEdit ? lehrgang?.start_datum?.split('T')[0] || '' : ''}" required />
            </div>
            <div class="form-group">
              <label>Enddatum <span class="required">*</span></label>
              <input type="date" id="lg-end" value="${isEdit ? lehrgang?.end_datum?.split('T')[0] || '' : ''}" required />
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Anmeldeschluss</label>
              <input type="date" id="lg-anmeldeschluss" value="${isEdit ? lehrgang?.anmeldeschluss?.split('T')[0] || '' : ''}" />
            </div>
            <div class="form-group">
              <label>Max. Teilnehmer</label>
              <input type="number" id="lg-max" min="1" value="${isEdit ? lehrgang?.max_teilnehmer || '' : ''}" />
            </div>
          </div>
          <div class="form-grid">
            <div class="form-group">
              <label>Status</label>
              <select id="lg-status">${statusOptions}</select>
            </div>
            <div class="form-group">
              <label>Kosten (€)</label>
              <input type="number" id="lg-kosten" min="0" step="0.01" value="${isEdit ? lehrgang?.kosten || '' : ''}" />
            </div>
          </div>
          <div class="form-group">
            <label>Kosten übernommen durch</label>
            <select id="lg-kosten-uebernommen">
              <option value="">— Auswählen —</option>
              <option value="feuerwehr" ${isEdit && lehrgang?.kosten_uebernommen_durch === 'feuerwehr' ? 'selected' : ''}>Feuerwehr</option>
              <option value="teilnehmer" ${isEdit && lehrgang?.kosten_uebernommen_durch === 'teilnehmer' ? 'selected' : ''}>Teilnehmer</option>
              <option value="teilweise" ${isEdit && lehrgang?.kosten_uebernommen_durch === 'teilweise' ? 'selected' : ''}>Teilweise</option>
            </select>
          </div>
          <div class="form-group">
            <label>Voraussetzungen</label>
            <textarea id="lg-voraussetzung" rows="2" maxlength="1000" placeholder="Voraussetzungen für die Teilnahme">${isEdit ? esc(lehrgang?.voraussetzung || '') : ''}</textarea>
          </div>
          <div class="form-group">
            <label class="check-label">
              <input type="checkbox" id="lg-voraussetzungen-erfuellt" ${isEdit && lehrgang?.voraussetzungen_erfuellt ? 'checked' : ''} />
              Voraussetzungen erfüllt
            </label>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-lehrgang">${isEdit ? 'Aktualisieren' : 'Speichern'}</button>
            <button class="btn btn--outline" id="btn-cancel-lehrgang">Abbrechen</button>
          </div>
        </div>
      </div>
    `;

    // Cancel button
    document.getElementById('btn-cancel-lehrgang').addEventListener('click', () => {
      closeLehrgangForm();
    });

    // Save button
    document.getElementById('btn-save-lehrgang').addEventListener('click', async () => {
      const titel = document.getElementById('lg-titel').value.trim();
      if (!titel) { toast('Titel ist erforderlich', 'error'); return; }

      const start = document.getElementById('lg-start').value;
      const end = document.getElementById('lg-end').value;
      if (!start || !end) { toast('Start- und Enddatum sind erforderlich', 'error'); return; }
      if (new Date(end) < new Date(start)) { toast('Enddatum muss nach Startdatum liegen', 'error'); return; }

      const anmeldeschluss = document.getElementById('lg-anmeldeschluss').value;
      if (anmeldeschluss && new Date(anmeldeschluss) > new Date(start)) { toast('Anmeldeschluss muss vor dem Startdatum liegen', 'error'); return; }

      const body = {
        titel,
        beschreibung: document.getElementById('lg-beschreibung').value.trim() || null,
        ort: document.getElementById('lg-ort').value.trim() || null,
        start_datum: start,
        end_datum: end,
        anmeldeschluss: anmeldeschluss || null,
        max_teilnehmer: document.getElementById('lg-max').value ? parseInt(document.getElementById('lg-max').value) : null,
        status: document.getElementById('lg-status').value,
        kosten: document.getElementById('lg-kosten').value ? parseFloat(document.getElementById('lg-kosten').value) : null,
        kosten_uebernommen_durch: document.getElementById('lg-kosten-uebernommen').value || null,
        lehrgangsart_id: document.getElementById('lg-lehrgangsart').value || null,
        voraussetzung: document.getElementById('lg-voraussetzung').value.trim() || null,
        voraussetzungen_erfuellt: document.getElementById('lg-voraussetzungen-erfuellt').checked,
      };

      try {
        if (isEdit) {
          await api.updateLehrgang(editingLehrgangId, body);
          toast('Lehrgang aktualisiert');
        } else {
          await api.createLehrgang(body);
          toast('Lehrgang angelegt');
        }
        closeLehrgangForm();
        await loadLehrgaenge();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function closeLehrgangForm() {
    editingLehrgangId = null;
    document.getElementById('lehrgang-form-wrap').style.display = 'none';
    document.getElementById('lehrgang-list-wrap').style.display = 'block';
  }

  // --- Anmeldungen View ---
  async function showAnmeldungen(lehrgangId) {
    currentLehrgangId = lehrgangId;
    const lehrgang = lehrgaengeCache.find(l => l.id === lehrgangId);
    const listWrap = document.getElementById('lehrgang-list-wrap');
    const anmeldungenWrap = document.getElementById('anmeldungen-wrap');

    listWrap.style.display = 'none';
    document.getElementById('lehrgang-form-wrap').style.display = 'none';
    anmeldungenWrap.style.display = 'block';
    anmeldungenWrap.innerHTML = '<div class="empty-state">Lade Anmeldungen...</div>';

    try {
      const anmeldungen = await api.getAnmeldungen(lehrgangId);
      const isVerwalter = canManage;

      anmeldungenWrap.innerHTML = `
        <div class="page-header" style="margin-bottom:16px">
          <div>
            <h2>${icon('arrow-left', 18)} ${esc(lehrgang?.titel || 'Lehrgang')}</h2>
            <p>Anmeldungen verwalten</p>
          </div>
          <button class="btn btn--outline" id="btn-back-to-lehrgaenge">Zurück zur Übersicht</button>
        </div>
        ${isVerwalter && (lehrgang?.status === 'offen' || lehrgang?.status === 'geplant') ? `
          <div class="card" style="margin-bottom:16px">
            <div class="card__header">Neue Anmeldung (für anderen Benutzer)</div>
            <div class="card__body">
              <div class="form-grid">
                <div class="form-group form-group--full">
                  <label>Benutzer</label>
                  <select id="anmeldung-user"></select>
                </div>
                <div class="form-group">
                  <label>Bemerkung</label>
                  <input type="text" id="anmeldung-bemerkung" placeholder="Optional" />
                </div>
              </div>
              <div class="btn-group mt-sm">
                <button class="btn btn--primary" id="btn-create-anmeldung-admin">Anmelden</button>
              </div>
            </div>
          </div>` : ''}
        <table class="data-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Status</th>
              <th>Anmeldedatum</th>
              <th>Bemerkung</th>
              <th>Bestätigt von</th>
              <th>Bestätigt am</th>
              ${isVerwalter ? '<th>Aktionen</th>' : ''}
            </tr>
          </thead>
          <tbody>
            ${(anmeldungen || []).map(a => {
              const anmeldungStatusColors = {
                'angemeldet': '#3b82f6',
                'bestaetigt': '#22c55e',
                'abgelehnt': '#ef4444',
                'abgemeldet': '#6c757d',
                'teilgenommen': '#10b981',
                'nicht_erschienen': '#f97316',
              };
              const anmeldungStatusLabels = {
                'angemeldet': 'Angemeldet',
                'bestaetigt': 'Bestätigt',
                'abgelehnt': 'Abgelehnt',
                'abgemeldet': 'Abgemeldet',
                'teilgenommen': 'Teilgenommen',
                'nicht_erschienen': 'Nicht erschienen',
              };
              const statusColor = anmeldungStatusColors[a.status] || '#6c757d';
              const isOwner = user?.id === a.user_id;
              const canEditStatus = isVerwalter;
              const canDelete = isVerwalter || isOwner;

              const statusOptions = Object.entries(anmeldungStatusLabels)
                .map(([val, label]) => `<option value="${val}" ${a.status === val ? 'selected' : ''}>${label}</option>`).join('');

              return `
              <tr data-id="${a.id}" style="--status-color: ${statusColor}">
                <td>${esc(a.user_name)}</td>
                <td style="color:var(--status-color)">${anmeldungStatusLabels[a.status] || a.status}</td>
                <td>${formatDateTime(a.anmeldedatum)}</td>
                <td>${esc(a.bemerkung || '—')}</td>
                <td>${esc(a.bestaetigt_von_name || '—')}</td>
                <td>${a.bestaetigt_am ? formatDateTime(a.bestaetigt_am) : '—'}</td>
                ${canDelete || canEditStatus ? `
                  <td>
                    <div class="btn-group">
                      ${canEditStatus ? `
                        <select class="field field--sm status-select-anmeldung" data-id="${a.id}" title="Status ändern">
                          ${statusOptions}
                        </select>` : ''}
                      ${canDelete ? `<button class="btn btn--danger btn--sm btn-delete-anmeldung" data-id="${a.id}">${isVerwalter ? 'Löschen' : 'Abmelden'}</button>` : ''}
                    </div>
                  </td>` : ''}
              </tr>`;
            }).join('')}
          </tbody>
        </table>
        ${!anmeldungen?.length ? '<div class="empty-state">Noch keine Anmeldungen für diesen Lehrgang.</div>' : ''}
      `;
      renderIcons(anmeldungenWrap);

      // Load users for admin anmeldung
      if (isVerwalter && (lehrgang?.status === 'offen' || lehrgang?.status === 'geplant')) {
        try {
          const users = await api.getUsers();
          const userSelect = document.getElementById('anmeldung-user');
          if (userSelect) {
            userSelect.innerHTML = '<option value="">— Benutzer wählen —</option>' +
              users.filter(u => !anmeldungen?.some(a => a.user_id === u.id))
                .map(u => `<option value="${u.id}">${esc(u.display_name || u.username)}</option>`).join('');
          }
        } catch (e) { console.error(e); }
      }

      // Back button
      document.getElementById('btn-back-to-lehrgaenge')?.addEventListener('click', () => {
        anmeldungenWrap.style.display = 'none';
        listWrap.style.display = 'block';
        currentLehrgangId = null;
      });

      // Admin create anmeldung for other user
      document.getElementById('btn-create-anmeldung-admin')?.addEventListener('click', async () => {
        const userId = document.getElementById('anmeldung-user').value;
        const bemerkung = document.getElementById('anmeldung-bemerkung').value.trim();
        if (!userId) { toast('Benutzer wählen', 'error'); return; }
        try {
          // TODO: Backend needs to support specifying user_id for admin registrations
          // For now, we can only register the current user (admin themselves)
          // To register another user, we'd need to modify the API
          toast('Diese Funktion ist noch nicht implementiert. Als Admin können Sie aktuell nur sich selbst für einen Lehrgang anmelden.', 'info');
        } catch (e) { toast(e.message, 'error'); }
      });

      // Status select
      anmeldungenWrap.querySelectorAll('.status-select-anmeldung').forEach(select => {
        select.addEventListener('change', async (e) => {
          const anmeldungId = e.target.dataset.id;
          const newStatus = e.target.value;
          if (!newStatus) return;
          try {
            await api.updateAnmeldung(lehrgangId, anmeldungId, { status: newStatus, bemerkung: null });
            toast('Status aktualisiert');
            await showAnmeldungen(lehrgangId);
          } catch (err) { toast(err.message, 'error'); }
        });
      });

      // Delete/Abmelden
      anmeldungenWrap.querySelectorAll('.btn-delete-anmeldung').forEach(btn => {
        btn.addEventListener('click', async () => {
          const action = isVerwalter ? 'löschen' : 'abmelden';
          if (!confirm(`Anmeldung wirklich ${action}?`)) return;
          try {
            await api.deleteAnmeldung(lehrgangId, btn.dataset.id);
            toast(isVerwalter ? 'Anmeldung gelöscht' : 'Abgemeldet');
            await showAnmeldungen(lehrgangId);
          } catch (e) { toast(e.message, 'error'); }
        });
      });

    } catch (e) {
      toast(e.message, 'error');
      anmeldungenWrap.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
    }
  }

  // --- New Lehrgang Button ---
  document.getElementById('btn-new-lehrgang')?.addEventListener('click', () => openLehrgangForm());
}