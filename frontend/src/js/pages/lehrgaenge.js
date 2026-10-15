import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate, formatDateTime } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

const STATUS_COLORS = {
  geplant: '#6b7280',
  veröffentlicht: '#16a34a',
  voll: '#dc2626',
  abgesagt: '#9ca3af',
  archiviert: '#9ca3af',
};

const STATUS_LABELS = {
  geplant: 'Geplant',
  veröffentlicht: 'Veröffentlicht',
  voll: 'Voll',
  abgesagt: 'Abgesagt',
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

// ── Hauptliste ───────────────────────────────────────────────────────────────

export async function renderLehrgaenge() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const content = document.getElementById('page-content');
  const isVerwalter = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');
  // User mit Grundberechtigung oder Verwaltungsrecht können sich anmelden
  const canRegister = (user?.permissions || []).includes('lehrgangsverwaltung')
    || isVerwalter
    // Legacy: lesen-Berechtigung ebenfalls erlauben (wird nicht mehr neu vergeben)
    || (user?.permissions || []).includes('lehrgangsverwaltung.lesen');
  // Lehrgangsarten verwalten: Admin oder Nutzer mit lehrgangsverwaltung (Verwalten oder Admin)-Recht
  const canManageLehrgangsarten = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten')
    || (user?.permissions || []).includes('lehrgangsverwaltung.admin');

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

  // Event listener für "Lehrgangsarten verwalten" Button
  const btnLehrgangsarten = document.getElementById('btn-lehrgangsarten');
  if (btnLehrgangsarten) {
    btnLehrgangsarten.addEventListener('click', showLehrgangsartenSection);
  }

  // Lehrgänge laden
  const lehrgaenge = await api.getLehrgaenge({});

  const renderList = (items, canManage) => {
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
      if (nb) nb.addEventListener('click', () => showForm());
      return;
    }

    // Table layout for better overview
    grid.innerHTML = `
      <table class="lehrgang-table">
        <thead>
          <tr>
            <th>Titel</th>
            <th>Status</th>
            <th>Zeitraum</th>
            <th>Ort</th>
            <th>Teilnehmer</th>
            <th>Max. Plätze</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((l, idx) => `
            <tr class="lehrgang-row" style="animation-delay: ${idx * 0.06}s">
              <td class="lehrgang-title"><strong>${esc(l.titel)}</strong></td>
              <td class="lehrgang-status"><span class="status-badge" style="background-color: ${STATUS_COLORS[l.status] || '#666'}; color: white; padding: 2px 6px; border-radius: 3px; font-size: 12px;">${STATUS_LABELS[l.status] || l.status}</span></td>
              <td class="lehrgang-datum">${formatDate(l.start_datum)} – ${formatDate(l.end_datum)}</td>
              <td class="lehrgang-ort">${l.ort || '-'}</td>
              <td class="lehrgang-count">${l.anmeldungen_count || 0}</td>
              <td class="lehrgang-max">${l.max_teilnehmer || '-'}</td>
              <td class="lehrgang-actions">
                <button class="btn btn--small btn--secondary view-lehrgang" data-id="${l.id}">Details</button>
                ${canRegister ? `
                  <button class="btn btn--small btn--warning anmelden" data-id="${l.id}">Anmelden</button>
                ` : ''}
                ${canManage ? `
                  <button class="btn btn--small btn--info edit-lehrgang" data-id="${l.id}">Bearbeiten</button>
                  <button class="btn btn--small btn--danger delete-lehrgang" data-id="${l.id}">Löschen</button>
                ` : ''}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

    document.querySelectorAll('.view-lehrgang').forEach(b => {
      b.addEventListener('click', () => { window.location.hash = `#/lehrgang/${b.dataset.id}`; });
    });
    if (canRegister) {
      document.querySelectorAll('.anmelden').forEach(b => {
        b.addEventListener('click', () => { window.location.hash = `#/lehrgang/${b.dataset.id}`; });
      });
    }
    if (canManage) {
      document.querySelectorAll('.edit-lehrgang').forEach(b => {
        b.addEventListener('click', () => {
          window.location.hash = `#/lehrgang-edit/${b.dataset.id}`;
        });
      });
    }
    if (canManage) {
      document.querySelectorAll('.delete-lehrgang').forEach(b => {
        b.addEventListener('click', async () => {
          if (confirm('Lehrgang wirklich löschen?')) {
            try { await api.deleteLehrgang(b.dataset.id); toast('Lehrgang gelöscht', 'success'); renderLehrgaenge(); }
            catch (e) { toast(e.message, 'error'); }
          }
        });
      });
    }
  };

  renderList(lehrgaenge, isVerwalter);

  document.getElementById('btn-new-lehrgang').addEventListener('click', () => showForm());
}

// ── Formular (Neu/Bearbeiten) ──────────────────────────────────────────────
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

  // Load Lehrgangsarten for the dropdown and prerequisite selection
  const lehrgangsarten = await loadLehrgangsarten();
  const _currentLehrgangsartId = l?.lehrgangsart_id || null;

  /** Beschreibung und Veranstaltungsort aus der ausgewählten Lehrgangsart füllen */
  function fillFromLehrgangsart() {
    const selected = document.getElementById('feld-lehrgangsart')?.value;
    if (!selected) return;
    const la = lehrgangsarten.find(x => x.id == selected);
    if (!la) return;
    document.getElementById('feld-beschreibung').value = la.beschreibung || '';
    document.getElementById('feld-ort').value = la.veranstaltungsort || '';
    // Dauer automatisch übernehmen, aber überschreibbar
    if (la.dauer !== null && la.dauer !== undefined) {
      document.getElementById('feld-dauer').value = la.dauer;
      // Auto-calculate end date if start date is set
      if (document.getElementById('feld-start').value) {
        const start = new Date(document.getElementById('feld-start').value);
        const end = new Date(start);
        end.setDate(start.getDate() + la.dauer - 1);
        document.getElementById('feld-ende').value = end.toISOString().split('T')[0];
      }
    } else {
      document.getElementById('feld-dauer').value = '';
    }
  }

  // Render Voraussetzungen (read-only) based on selected Lehrgangsart — returns HTML string
  function renderVoraussetzungenDisplay(selectedLehrgangsartId) {
    if (!selectedLehrgangsartId) {
      return '<p class="text-muted text-sm">Wählen Sie eine Lehrgangsart, um die Voraussetzungen anzuzeigen.</p>';
    }

    const la = lehrgangsarten.find(x => x.id === selectedLehrgangsartId);
    if (!la || !la.voraussetzungen || la.voraussetzungen.length === 0) {
      return '<p class="text-muted text-sm">Für diese Lehrgangsart sind keine Voraussetzungen definiert.</p>';
    }

    const names = la.voraussetzungen
      .map(id => lehrgangsarten.find(x => x.id === id)?.name)
      .filter(Boolean);

    if (names.length === 0) {
      return '<p class="text-muted text-sm">Für diese Lehrgangsart sind keine Voraussetzungen definiert.</p>';
    }

    return names
      .map(name => `<span class="badge badge--gray" style="margin-right: 6px; margin-bottom: 4px;">${esc(name)}</span>`)
      .join('');
  }

  formEl.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${l ? 'Lehrgang bearbeiten' : 'Neuer Lehrgang'}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="lehrgang-form-el" class="form-grid">
          <div class="form-group form-group--full">
            <label>Titel / Bezeichnung <span class="required">*</span></label>
            <input type="text" id="fld-titel" placeholder="Titel / Bezeichnung" value="${l ? esc(l.titel) : ''}" required />
          </div>
          <div class="form-group form-group--full">
            <label>Beschreibung</label>
            <textarea id="feld-beschreibung" placeholder="Beschreibung">${l ? esc(l.beschreibung || '') : ''}</textarea>
          </div>
          <div class="form-group form-group--full">
            <label>Lehrgangsart</label>
            <select id="feld-lehrgangsart">
              <option value="">-- Lehrgangsart wählen --</option>
              ${lehrgangsarten.map(la => `
                <option value="${la.id}" ${l && l.lehrgangsart_id == la.id ? 'selected' : ''}>${esc(la.name)}</option>
              `).join('')}
            </select>
          </div>
          <div class="form-group form-group--full">
            <label>Veranstaltungsort</label>
            <input type="text" id="feld-ort" placeholder="Veranstaltungsort" value="${l ? esc(l.ort || '') : ''}" />
          </div>
          <div class="form-group form-group--full">
            <label>Startdatum <span class="required">*</span></label>
            <input type="date" id="feld-start" value="${l && l.start_datum ? l.start_datum : ''}" required />
          </div>
          <div class="form-group form-group--full">
            <label>Enddatum <span class="required">*</span></label>
            <input type="date" id="feld-ende" value="${l && l.end_datum ? l.end_datum : ''}" required />
          </div>
          <div class="form-group form-group--full">
            <label>Dauer (Tage)</label>
            <input type="number" id="feld-dauer" min="1" value="${l && l.dauer ? l.dauer : ''}" />
          </div>
          <div class="form-group form-group--full">
            <label>Anmeldefrist</label>
            <input type="date" id="feld-anmeldeschluss" placeholder="Anmeldefrist" value="${l && l.anmeldeschluss ? l.anmeldeschluss : ''}" />
          </div>
          <div class="form-group form-group--full">
            <label>Max. Plätze</label>
            <input type="number" id="feld-max" placeholder="Max. Plätze" value="${l && l.max_teilnehmer ? l.max_teilnehmer : ''}" min="1" />
          </div>
          <div class="form-group form-group--full">
            <label>Status</label><select id="feld-status">
              <option value="geplant" selected>Geplant</option>
              <option value="veröffentlicht">Veröffentlicht</option>
              <option value="voll">Voll</option>
              <option value="abgesagt">Abgesagt</option>
              <option value="archiviert">Archiviert</option>
            </select>
          </div>
          <div class="form-group form-group--full">
            <label>Voraussetzungen</label>
            <div id="feld-voraussetzungen-container">
              ${renderVoraussetzungenDisplay(l?.lehrgangsart_id || null)}
            </div>
          </div>
          <div class="form-group form-group--full" style="margin-top: 12px;">
            <button type="submit" class="btn btn--primary">${l ? 'Speichern' : 'Anlegen'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('feld-lehrgangsart').addEventListener('change', () => {
    fillFromLehrgangsart();
    const selectedId = document.getElementById('feld-lehrgangsart').value || null;
    document.getElementById('feld-voraussetzungen-container').innerHTML = renderVoraussetzungenDisplay(selectedId);
  });

  document.getElementById('btn-cancel').addEventListener('click', () => {
    formEl.style.display = 'none';
    if (listEl) listEl.style.display = '';
  });

  // Auto-calculate end date when start date changes
  document.getElementById('feld-start').addEventListener('change', () => {
    const dauerInput = document.getElementById('feld-dauer');
    const endInput = document.getElementById('feld-ende');
    const dauer = parseInt(dauerInput?.value || '0') || 0;
    if (dauer > 0 && endInput) {
      const start = new Date(document.getElementById('feld-start').value);
      const end = new Date(start);
      end.setDate(start.getDate() + dauer - 1);
      endInput.value = end.toISOString().split('T')[0];
    } else if (dauer === 0) {
      // If no Dauer set, just set end to start date (but validation requires end > start)
      endInput.value = document.getElementById('feld-start').value;
    }
  });

  // When Dauer input changes, recalculate end date
  document.getElementById('feld-dauer').addEventListener('change', () => {
    const dauerInput = document.getElementById('feld-dauer');
    const endInput = document.getElementById('feld-ende');
    const startInput = document.getElementById('feld-start');
    const dauer = parseInt(dauerInput?.value || '0') || 0;
    if (dauer > 0 && startInput && endInput) {
      const start = new Date(startInput.value);
      const end = new Date(start);
      end.setDate(start.getDate() + dauer - 1);
      endInput.value = end.toISOString().split('T')[0];
    }
  });

  // Update Voraussetzungen display when Lehrgangsart selection changes
  document.getElementById('feld-lehrgangsart').addEventListener('change', () => {
    fillFromLehrgangsart();
    const selectedId = document.getElementById('feld-lehrgangsart').value || null;
    document.getElementById('feld-voraussetzungen-container').innerHTML = renderVoraussetzungenDisplay(selectedId);
  });

  document.getElementById('lehrgang-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Client-side validation für bessere Fehlermeldungen
    const titel = document.getElementById('fld-titel').value.trim();
    if (!titel) {
      toast('Bitte geben Sie einen Titel ein', 'error');
      return;
    }
    if (titel.length > 200) {
      toast('Titel darf maximal 200 Zeichen haben', 'error');
      return;
    }

    const start_datum = document.getElementById('feld-start').value;
    const end_datum = document.getElementById('feld-ende').value;
    if (!start_datum || !end_datum) {
      toast('Start- und Enddatum sind Pflichtfelder', 'error');
      return;
    }
    if (end_datum < start_datum) {
      toast('Enddatum muss nach dem Startdatum liegen', 'error');
      return;
    }

    const anmeldeschluss = document.getElementById('feld-anmeldeschluss').value;
    if (anmeldeschluss && anmeldeschluss >= start_datum) {
      toast('Anmeldeschluss muss vor dem Startdatum liegen', 'error');
      return;
    }

    const max_tn = document.getElementById('feld-max').value;
    const max_teilnehmer = max_tn ? Math.max(1, parseInt(max_tn)) : null;

    // Determine lehrgangsart and its Dauer
    const lehrgangsartId = document.getElementById('feld-lehrgangsart').value;
    const lehrgangsartSelected = lehrgangsartId !== '';
    const la = lehrgangsarten.find(x => x.id == lehrgangsartId);
    const dauerAusArt = la?.dauer || null;
    // Use Dauer from Lehrgangsart if selected, otherwise from input, otherwise null
    const dauer = lehrgangsartSelected ? dauerAusArt : (parseInt(document.getElementById('feld-dauer').value || '0') || null);

    // Convert empty string to null for proper handling
    const lehrgangsart_id = lehrgangsartId === '' ? null : lehrgangsartId;

    // Client-side validation: Lehrgangsart ist optional, aber wenn gewählt, muss es eine gültige UUID sein
    if (lehrgangsartId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(lehrgangsart_id)) {
      toast('Ungültige Lehrgangsart ausgewählt', 'error');
      return;
    }

    const status = document.getElementById('feld-status').value;

    const body = {
      titel,
      beschreibung: document.getElementById('feld-beschreibung').value || null,
      ort: document.getElementById('feld-ort').value || null,
      start_datum: start_datum || null,
      end_datum: end_datum || null,
      anmeldeschluss: anmeldeschluss || null,
      max_teilnehmer: max_teilnehmer,
      lehrgangsart_id: lehrgangsart_id,
      // Voraussetzungen sind optionale Felder (werden über Checkboxes im Formular erfasst)
      voraussetzung: null,
      dauer: dauer,
      voraussetzungen: voraussetzungen.length > 0 ? voraussetzungen : null,
    };

    try {
      if (l) {
        await api.updateLehrgang(l.id, body);
        toast('Lehrgang aktualisiert', 'success');
      } else {
        await api.createLehrgang(body);
        toast('Lehrgang angelegt', 'success');
      }
      window.location.hash = '#/lehrgaenge';
      await renderLehrgaenge();
    } catch (e) {
      console.error('Lehrgang speichern fehlgeschlagen:', e);
      let rawResponse = e?.rawResponse || '';
      if (!rawResponse && e?.response) {
        rawResponse = await e.response.text().catch(() => 'Konnte Antwort nicht lesen');
      }

      const bodyStr = esc(JSON.stringify(body, null, 2));
      const errorMsg = e?.message || 'Unbekannter Fehler';
      const html = `
        <div class="error-detail-box">
          <p class="text-sm"><strong>Die Anfrage an den Server war:</strong></p>
          <pre class="error-pre text-sm">${bodyStr}</pre>
          <p class="text-sm"><strong>Rohantwort vom Server:</strong></pre>
          <pre class="error-pre text-sm">${esc(rawResponse)}</pre>
          <p class="text-sm"><strong>Verarbeitete Fehlermeldung:</strong></pre>
          <pre class="error-pre text-sm">${esc(errorMsg)}</pre>
          <button class="btn btn--sm btn--outline" onclick="this.closest('.error-overlay').style.display='none'">Schließen</button>
        </div>
      `;
      const overlay = document.createElement('div');
      overlay.className = 'error-overlay';
      overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;';
      overlay.innerHTML = html;
      document.body.appendChild(overlay);
      window.errorOverlay = overlay;
    }
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
  // User mit Grundberechtigung oder Verwaltungsrecht können sich anmelden
  const canRegister = (user?.permissions || []).includes('lehrgangsverwaltung')
    || isVerwalter
    // Legacy: lesen-Berechtigung ebenfalls erlauben (wird nicht mehr neu vergeben)
    || (user?.permissions || []).includes('lehrgangsverwaltung.lesen');

  const remainingSpots = (lehrgang.max_teilnehmer || 0) - (lehrgang.anmeldungen_count || 0);

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>${esc(lehrgang.titel)}</h2>
        <p><span class="lehrgang-status" style="color:${STATUS_COLORS[lehrgang.status] || '#666'}">${STATUS_LABELS[lehrgang.status] || lehrgang.status}</span>
          | ${isVerwalter ? 'Veranstaltungsort: ' + esc(lehrgang.ort || '–') : ''}</p>
        ${!isVerwalter && !canRegister ? '<p style="color:var(--rot)">Sie haben nicht die Berechtigung, diese Seite zu sehen.</p>' : ''}
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
        <tr><td>📅 Start</td><td>${formatDate(lehrgang.start_datum)}</td></tr>
        <tr><td>📅 Ende</td><td>${formatDate(lehrgang.end_datum)}</td></tr>
        ${lehrgang.ort ? `<tr><td>📍 Ort</td><td>${esc(lehrgang.ort)}</td></tr>` : ''}
        ${lehrgang.anmeldeschluss ? `<tr><td>📝 Anmeldeschluss</td><td>${formatDate(lehrgang.anmeldeschluss)}</td></tr>` : ''}
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
    ${!isVerwalter && remainingSpots <= 0 && canRegister ? `
    <div class="card" style="border-color:var(--rot)">
      <h3 style="color:var(--rot)">Ausgebucht</h3>
      <p>Der Lehrgang ist vollständig belegt. Anmeldungen sind nur über die Warteliste möglich. Klicken Sie im Menü oben auf "Anmelden".</p>
    </div>` : ''}
    ${!isVerwalter && (remainingSpots > 0 || !lehrgang.max_teilnehmer) && canRegister ? `
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

// ── Bearbeitungsansicht ─────────────────────────────────────────────────────

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
  <div><h2>Lehrgang bearbeiten</h2></div>
  <button class="btn btn--secondary" onclick="history.back()">Zurück</button>
</div>
<div id="lehrgang-form" style="display:block"></div>
`;
  renderIcons(content);

  await showForm(lehrgang);
}

// ── Anmeldungen (Verwaltung) ───────────────────────────────────────────────

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
  const isVerwalter = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');
  // User mit Grundberechtigung oder Verwaltungsrecht können sich anmelden
  const canRegister = (user?.permissions || []).includes('lehrgangsverwaltung')
    || isVerwalter
    // Legacy: lesen-Berechtigung ebenfalls erlauben (wird nicht mehr neu vergeben)
    || (user?.permissions || []).includes('lehrgangsverwaltung.lesen');
  content.innerHTML = `
    <div>
      <h2>Anmeldungen: ${esc(lehrgang.titel)}</h2>
      <p>${formatDate(lehrgang.start_datum)} – ${formatDate(lehrgang.end_datum)}</p>
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

// ── Lehrgangsarten verwalten ──────────────────────────────────────────────

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
  await renderLehrgangsarten();
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

  // Neue Lehrgangsart Klick-Handler immer registrieren (auch bei leerer Liste)
  document.getElementById('btn-new-lehrgangsart').addEventListener('click', () => {
    _currentLehrgangsartId = null;
    showLehrgangsartenForm(null);
  });

  if (!lehrgangsarten.length) {
    listEl.innerHTML = '<p class="text-muted">Noch keine Lehrgangsarten vorhanden.</p>';
    return;
  }

  listEl.innerHTML = lehrgangsarten.map(la => `
    <div class="lehrgangsart-row" data-id="${la.id}">
      <div>
        <div class="fw-bold">${esc(la.name)}</div>
        ${la.beschreibung ? `<div class="text-muted text-sm">${esc(la.beschreibung)}</div>` : ''}
        ${la.veranstaltungsort ? `<div class="text-muted text-sm">📍 ${esc(la.veranstaltungsort)}</div>` : ''}
        ${la.dauer ? `<div class="text-muted text-sm">⏱ Dauer: ${la.dauer} Tag${la.dauer > 1 ? 'e' : ''}</div>` : ''}
        ${la.voraussetzung ? `<div class="text-muted text-sm">Voraussetzung: ${esc(la.voraussetzung)}</div>` : '' }
      </div>
      <div class="btn-group">
        <button class="btn btn--outline btn--sm" data-action="edit" data-id="${la.id}">Bearbeiten</button>
        <button class="btn btn--danger btn--sm" data-action="delete" data-id="${la.id}" data-name="${esc(la.name)}">
          Löschen
        </button>
      </div>
    </div>
  `).join('');

  renderIcons(listEl);

  // Bearbeiten
  listEl.querySelectorAll('[data-action="edit"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const row = lehrgangsarten.find(x => x.id === btn.dataset.id);
      if (row) {
        _currentLehrgangsartId = btn.dataset.id;
        showLehrgangsartenForm(row);
      }
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
function showLehrgangsartenForm(la = null) {
  const formEl = document.getElementById('lehrgangsarten-form');
  const listEl = document.getElementById('lehrgangsarten-list');
  if (!formEl || !listEl) return;

  // Use the cached lehrgangsarten from loadLehrgangsarten()
  const allLehrgangsarten = _lehrgangsartenCache || [];
  // Determine selected UUIDs from the existing lehrgangsart, or empty array for new
  const selectedVoraussetzungen = la?.voraussetzungen || [];

  formEl.style.display = 'block';
  listEl.style.display = 'none';

  formEl.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${_currentLehrgangsartId ? 'Lehrgangsart bearbeiten' : 'Neue Lehrgangsart'}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-lehrgangsart">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="lehrgangsarten-form-el" class="form-grid">
          <div class="form-group form-group--full">
            <label>Name der Lehrgangsart <span class="required">*</span></label>
            <input type="text" id="fld-name" placeholder="z.B. Grundlehrgang" value="${esc(la?.name || '')}" required />
          </div>
          <div class="form-group form-group--full">
            <label>Beschreibung</label>
            <textarea id="feld-beschreibung" placeholder="Beschreibung des Lehrgangs" rows="3">${esc(la?.beschreibung || '')}</textarea>
          </div>
          <div class="form-group form-group--full">
            <label>Veranstaltungsort</label>
            <input type="text" id="feld-veranstaltungsort" placeholder="Für welchen Veranstaltungsort ist diese Lehrgangsart vorgesehen?" value="${esc(la?.veranstaltungsort || '')}" />
          </div>
          <div class="form-group form-group--full">
            <label>Dauer (Tage)</label>
            <input type="number" id="feld-dauer" placeholder="Dauer in Tagen" value="${la?.dauer || ''}" min="1" />
          </div>
          <div class="form-group form-group--full">
            <label>Voraussetzungen</label>
            <div id="feld-voraussetzungen-container">
              ${allLehrgangsarten.map(x => `
                <label class="checkbox-label">
                  <input type="checkbox" value="${x.id}" ${selectedVoraussetzungen.includes(x.id) ? 'checked' : ''}>
                  ${esc(x.name)}
                </label>
              `).join('')}
            </div>
            <p class="text-muted text-sm">Wählen Sie die notwendigen vorherigen Lehrgangsarten aus.</p>
          </div>
          <div class="form-group form-group--full" style="margin-top: 12px;">
            <button type="submit" class="btn btn--primary">${_currentLehrgangsartId ? 'Speichern' : 'Anlegen'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel-lehrgangsart').addEventListener('click', () => {
    formEl.style.display = 'none';
    listEl.style.display = 'block';
    renderLehrgangsarten();
  });

  document.getElementById('lehrgangsarten-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();

    // Client-side validation für Name
    const name = document.getElementById('fld-name').value.trim();
    if (!name) {
      toast('Bitte geben Sie einen Namen ein', 'error');
      return;
    }
    if (name.length > 200) {
      toast('Name darf maximal 200 Zeichen haben', 'error');
      return;
    }

    // Get selected Voraussetzungen from checkboxes
    const voraussetzungenCheckboxes = document.querySelectorAll('#feld-voraussetzungen-container input[type="checkbox"]:checked');
    const selectedVoraussetzungen = Array.from(voraussetzungenCheckboxes).map(cb => cb.value);

    const body = {
      name,
      beschreibung: document.getElementById('feld-beschreibung').value || null,
      veranstaltungsort: document.getElementById('feld-veranstaltungsort').value || null,
      dauer: parseInt(document.getElementById('feld-dauer').value) || null,
      voraussetzungen: selectedVoraussetzungen.length > 0 ? selectedVoraussetzungen : null,
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