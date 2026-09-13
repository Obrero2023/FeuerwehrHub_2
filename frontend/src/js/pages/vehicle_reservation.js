import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate, formatDateTime } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

let vehicles = [];
let editingReservationId = null;

// Status-Labels
const STATUS_LABELS = {
  gebucht:    'Buchung',
  storniert:  'Storniert',
  abgeschlossen: 'Abgeschlossen',
};

export async function renderVehicleReservation() {
  const [settings, user] = await Promise.all([
    api.getSettings(), api.me(),
  ]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('vehicle_reservation');
  renderIcons();

  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
  const canEdit = isAdmin || (user?.permissions || []).includes('fahrzeugbuchung.edit');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Fahrzeugreservierung</h2><p>Fahrzeuge buchen und Reservierungen verwalten</p></div>
      <div class="btn-group">
        <button class="btn btn--primary" id="btn-new-reservation">+ Neue Reservierung</button>
      </div>
    </div>

    <!-- Statistiken -->
    <div id="reservation-stats" class="stats-grid" style="margin-bottom:20px">
      <div class="stat-card"><div class="stat-card__value" id="stat-total">-</div><div class="stat-card__label">Aktive Buchungen</div></div>
      <div class="stat-card"><div class="stat-card__value" id="stat-today">-</div><div class="stat-card__label">Heute</div></div>
      <div class="stat-card"><div class="stat-card__value" id="stat-week">-</div><div class="stat-card__label">Diese Woche</div></div>
      <div class="stat-card"><div class="stat-card__value" id="stat-month">-</div><div class="stat-card__label">Diesen Monat</div></div>
    </div>

    <!-- Reservierungsliste -->
    <div id="reservation-list-wrap"></div>

    <!-- Modal: Reservierung anlegen / bearbeiten -->
    <div id="modal-reservation" class="modal-overlay">
      <div class="modal modal--md">
        <div class="modal__header">
          <h3 id="modal-reservation-title">Reservierung anlegen</h3>
          <button class="modal__close" id="btn-close-reservation-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Fahrzeug <span class="required">*</span></label>
            <select id="res-vehicle">
              <option value="">-- Fahrzeug auswählen --</option>
            </select>
          </div>
          <div class="form-group">
            <label>Grund <span class="required">*</span></label>
            <textarea id="res-reason" rows="2" class="field" placeholder="Grund der Reservierung..." maxlength="500"></textarea>
          </div>
          <div class="form-grid--2">
            <div class="form-group">
              <label>Startdatum <span class="required">*</span></label>
              <input type="date" id="res-start-date" />
            </div>
            <div class="form-group">
              <label>Enddatum <span class="required">*</span></label>
              <input type="date" id="res-end-date" />
            </div>
          </div>
          <div class="form-grid--2">
            <div class="form-group">
              <label>Startzeit</label>
              <input type="time" id="res-start-time" value="08:00" />
            </div>
            <div class="form-group">
              <label>Endzeit</label>
              <input type="time" id="res-end-time" value="18:00" />
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--primary" id="btn-submit-reservation">Speichern</button>
          <button class="btn btn--outline" id="btn-cancel-reservation">Abbrechen</button>
        </div>
      </div>
    </div>

    <!-- Modal: Storno-Bestätigung -->
    <div id="modal-cancel-reservation" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3>Reservierung stornieren</h3>
          <button class="modal__close" id="btn-close-cancel-modal">✕</button>
        </div>
        <div class="modal__body">
          <p>Soll diese Reservierung wirklich storniert werden?</p>
          <div class="form-group" style="margin-top:12px">
            <label>Grund für Stornierung (optional)</label>
            <textarea id="cancel-reason" rows="2" class="field" maxlength="500" placeholder="Grund..."></textarea>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--danger" id="btn-confirm-cancel">Ja, stornieren</button>
          <button class="btn btn--outline" id="btn-cancel-cancel">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  await loadVehicles();
  await loadReservations(canEdit);
  await loadStats();

  setupReservationModal(canEdit);
  document.getElementById('btn-new-reservation')?.addEventListener('click', () => openReservationModal(null, canEdit));
}

// ── Fahrzeuge laden ────────────────────────────────────

async function loadVehicles() {
  try {
    vehicles = await api.getVehicles();
    const sel = document.getElementById('res-vehicle');
    if (!sel) return;
    sel.innerHTML = `<option value="">-- Fahrzeug auswählen --</option>` +
      vehicles.map(v => `<option value="${v.id}">${esc(v.name)} (${esc(v.vehicle_type || '')})</option>`).join('');
  } catch (e) {
    toast('Fehler beim Laden der Fahrzeuge', 'error');
  }
}

// ── Reservierungen laden ────────────────────────────────────

async function loadReservations(canEdit) {
  const wrap = document.getElementById('reservation-list-wrap');
  if (!wrap) return;
  wrap.innerHTML = '<p class="text-muted text-sm">Lade...</p>';

  try {
    const reservations = await api.getReservations();

    if (!reservations.length) {
      wrap.innerHTML = `
        <div class="card">
          <div class="card__body empty-state">Noch keine Reservierungen vorhanden.</div>
        </div>`;
      return;
    }

    const today = new Date().toISOString().slice(0, 10);

    const rows = reservations.map(r => {
      const statusLabel = STATUS_LABELS[r.status] || r.status;
      const statusClass = r.status === 'storniert' ? 'text-muted' : r.status === 'abgeschlossen' ? 'text-success' : 'text-warning';
      const isPast = r.end_date < today;
      const rowClass = isPast && r.status === 'gebucht' ? 'opacity-60' : '';

      return `
        <tr class="data-row reservation-row ${rowClass}" data-id="${r.id}">
          <td class="fw-semibold">${esc(r.vehicle_name)}</td>
          <td>${esc(r.reason)}</td>
          <td>${formatDate(r.start_date)}</td>
          <td>${formatDate(r.end_date)}</td>
          <td>${r.start_time?.slice(0, 5) || '08:00'} - ${r.end_time?.slice(0, 5) || '18:00'}</td>
          <td><span class="status-badge status-badge--${r.status}">${statusLabel}</span></td>
          <td>${esc(r.user_name || r.created_by_name || '-')}</td>
          <td>${esc(r.created_at ? formatDateTime(r.created_at) : '')}</td>
          ${canEdit ? `
          <td>
            <div class="btn-group">
              <button class="btn btn--outline btn--sm" data-action="edit" data-id="${r.id}">Bearb.</button>
              ${r.status === 'gebucht' ? `<button class="btn btn--danger btn--sm" data-action="cancel" data-id="${r.id}">Stornieren</button>` : ''}
            </div>
          </td>` : '<td></td>'}
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="card">
        <div class="card__header">
          <span>Reservierungen (${reservations.length})</span>
        </div>
        <div class="card__body card__body--flush">
          <table class="data-table">
            <thead>
              <tr>
                <th>Fahrzeug</th>
                <th>Grund</th>
                <th>Von</th>
                <th>Bis</th>
                <th>Zeit</th>
                <th>Status</th>
                <th>Buchend</th>
                <th>Erstellt</th>
                <th></th>
              </tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;

    // Actions
    if (canEdit) {
      wrap.querySelectorAll('[data-action="edit"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = reservations.find(x => x.id === btn.dataset.id);
          if (r) openReservationModal(r, canEdit);
        });
      });

      wrap.querySelectorAll('[data-action="cancel"]').forEach(btn => {
        btn.addEventListener('click', () => {
          const r = reservations.find(x => x.id === btn.dataset.id);
          if (r) openCancelModal(r);
        });
      });
    }

  } catch (e) {
    wrap.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

// ── Stats laden ────────────────────────────────────────────

async function loadStats() {
  try {
    const stats = await api.getReservationStats();
    document.getElementById('stat-total').textContent = stats.total_active;
    document.getElementById('stat-today').textContent = stats.today;
    document.getElementById('stat-week').textContent = stats.this_week;
    document.getElementById('stat-month').textContent = stats.this_month;
  } catch (_) { /* Stats sind optional */ }
}

// ── Reservierungs-Modal ────────────────────────────────────

function openReservationModal(r, canEdit) {
  editingReservationId = r?.id || null;
  document.getElementById('modal-reservation-title').textContent = r ? 'Reservierung bearbeiten' : 'Reservierung anlegen';

  document.getElementById('res-vehicle').value = r?.vehicle_id || '';
  document.getElementById('res-reason').value = r?.reason || '';
  document.getElementById('res-start-date').value = r?.start_date || '';
  document.getElementById('res-end-date').value = r?.end_date || '';
  document.getElementById('res-start-time').value = r?.start_time?.slice(0, 5) || '08:00';
  document.getElementById('res-end-time').value = r?.end_time?.slice(0, 5) || '18:00';

  document.getElementById('modal-reservation').classList.add('active');
  document.getElementById('res-vehicle').focus();
}

function setupReservationModal(canEdit) {
  const close = () => {
    document.getElementById('modal-reservation').classList.remove('active');
    editingReservationId = null;
  };

  ['btn-close-reservation-modal', 'btn-cancel-reservation'].forEach(btnId => {
    const old = document.getElementById(btnId);
    const fresh = old.cloneNode(true);
    old.parentNode.replaceChild(fresh, old);
    fresh.addEventListener('click', close);
  });

  const submitOld = document.getElementById('btn-submit-reservation');
  const submitBtn = submitOld.cloneNode(true);
  submitOld.parentNode.replaceChild(submitBtn, submitOld);

  submitBtn.addEventListener('click', async () => {
    const vehicle_id = document.getElementById('res-vehicle').value;
    const reason      = document.getElementById('res-reason').value.trim();
    const start_date  = document.getElementById('res-start-date').value;
    const end_date    = document.getElementById('res-end-date').value;
    const start_time  = document.getElementById('res-start-time').value;
    const end_time    = document.getElementById('res-end-time').value;

    if (!vehicle_id)  { toast('Fahrzeug auswählen', 'error'); return; }
    if (!reason)      { toast('Grund eingeben', 'error'); return; }
    if (!start_date)  { toast('Startdatum eingeben', 'error'); return; }
    if (!end_date)    { toast('Enddatum eingeben', 'error'); return; }
    if (end_date < start_date) { toast('Enddatum muss nach Startdatum sein', 'error'); return; }

    const body = { vehicle_id, reason, start_date, end_date, start_time, end_time };

    submitBtn.disabled = true;
    try {
      if (editingReservationId) {
        await api.updateReservation(editingReservationId, body);
        toast('Reservierung aktualisiert');
      } else {
        await api.createReservation(body);
        toast('Reservierung angelegt');
      }
      close();
      await loadReservations(canEdit);
      await loadStats();
    } catch (e) { toast(e.message, 'error'); }
    finally { submitBtn.disabled = false; }
  });
}

// ── Storno-Modal ────────────────────────────────────────────

function openCancelModal(r) {
  document.getElementById('cancel-reason').value = '';
  document.getElementById('modal-cancel-reservation').classList.add('active');

  const close = () => document.getElementById('modal-cancel-reservation').classList.remove('active');
  document.getElementById('btn-close-cancel-modal').onclick = close;
  document.getElementById('btn-cancel-cancel').onclick = close;

  const confirmOld = document.getElementById('btn-confirm-cancel');
  const confirmBtn = confirmOld.cloneNode(true);
  confirmOld.parentNode.replaceChild(confirmBtn, confirmOld);

  confirmBtn.addEventListener('click', async () => {
    try {
      await api.updateReservation(r.id, { status: 'storniert' });
      toast('Reservierung storniert');
      close();
      const user = await api.me().catch(() => null);
      const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
      const canEdit = isAdmin || (user?.permissions || []).includes('fahrzeugbuchung.edit');
      await loadReservations(canEdit);
      await loadStats();
    } catch (e) { toast(e.message, 'error'); }
  });
}
