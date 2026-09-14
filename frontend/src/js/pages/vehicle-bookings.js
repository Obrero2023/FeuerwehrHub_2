import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

export async function renderVehicleBookings() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('fahrzeugbuchung');

  const content = document.getElementById('page-content');
  const canBook = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('fahrzeugbuchung');
  const canManage = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('fahrzeugbuchung.verwalten');

  content.innerHTML = `
    <div class="page-header">
      <div><h2>Fahrzeugbuchung</h2><p>Buchungen für Fahrzeuge verwalten</p></div>
      ${canBook ? `<button class="btn btn--primary" id="btn-new-booking">+ Neue Buchung</button>` : ''}
    </div>
    <div id="booking-create-form" style="display:none"></div>
    <div id="booking-list-wrap"></div>
  `;
  renderIcons(content);

  // Load vehicles for dropdown
  let vehicles = [];
  try { vehicles = await api.getVehicles().catch(() => []); } catch(e) {}

  // Load bookings
  let bookings = [];
  let loading = true;

  const loadBookings = async () => {
    try {
      bookings = await api.getVehicleBookings().catch(() => []);
    } catch(e) { toast(e.message, 'error'); }
    loading = false;
    renderBookings();
  };

  const renderBookings = () => {
    const grid = document.getElementById('booking-list-wrap');
    if (!grid) return;
    if (loading) { grid.innerHTML = '<div class="empty-state">Lade Buchungen...</div>'; return; }
    if (!bookings.length) { grid.innerHTML = '<div class="empty-state">Keine Buchungen vorhanden.</div>'; return; }

    grid.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>Fahrzeug</th><th>Datum</th><th>Von</th><th>Bis</th><th>Grund</th><th>Status</th><th>Buchungs-ID</th>
        ${canManage ? '<th>Aktionen</th>' : ''}
      </tr></thead>
      <tbody>
        ${bookings.map(b => `
          <tr data-id="${b.id}">
            <td>${esc(b.vehicle_name || 'Fahrzeug ' + b.vehicle_id)}</td>
            <td>${formatDate(b.booking_date)}</td>
            <td>${b.time_from}</td>
            <td>${b.time_to}</td>
            <td>${esc(b.reason)}</td>
            <td>${b.status}</td>
            <td>${b.id}</td>
            ${canManage ? `<td>
              <button class="btn btn--outline btn--sm btn-edit-booking" data-id="${b.id}">Bearbeiten</button>
              <button class="btn btn--danger btn--sm btn-delete-booking" data-id="${b.id}">Löschen</button>
            </td>` : ''}
          </tr>
        `).join('')}
      </tbody>
    </table>`;
    renderIcons(grid);

    // Delete buttons
    grid.querySelectorAll('.btn-delete-booking').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Buchung wirklich löschen?')) return;
        try {
          await api.deleteVehicleBooking(btn.dataset.id);
          toast('Buchung gelöscht');
          await loadBookings();
        } catch(e) { toast(e.message, 'error'); }
      });
    });

    // Edit buttons
    grid.querySelectorAll('.btn-edit-booking').forEach(btn => {
      btn.addEventListener('click', () => openEditModal(btn.dataset.id));
    });
  };

  const openCreateForm = () => {
    const formEl = document.getElementById('booking-create-form');
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div class="card">
        <div class="card__header">Neue Buchung erstellen</div>
        <div class="card__body">
          <div class="form-group">
            <label>Fahrzeug <span class="required">*</span></label>
            <select id="bk-vehicle">
              <option value="">— Fahrzeug wählen —</option>
              ${vehicles.map(v => `<option value="${v.id}">${esc(v.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Datum <span class="required">*</span></label>
            <input type="date" id="bk-date" />
          </div>
          <div class="form-group">
            <label>Von (Uhrzeit)</label>
            <input type="time" id="bk-from" />
          </div>
          <div class="form-group">
            <label>Bis (Uhrzeit)</label>
            <input type="time" id="bk-to" />
          </div>
          <div class="form-group">
            <label>Grund <span class="required">*</span></label>
            <textarea id="bk-reason" rows="3" maxlength="2000" placeholder="Warum wird das Fahrzeug benötigt?"></textarea>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-booking">Speichern</button>
            <button class="btn btn--outline" id="btn-cancel-booking">Abbrechen</button>
          </div>
        </div>
      </div>
    `;
    bindFormEvents('create');
  };

  const openEditModal = (id) => {
    const booking = bookings.find(b => b.id === id);
    if (!booking) return;
    const formEl = document.getElementById('booking-create-form');
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div class="card">
        <div class="card__header">Buchung bearbeiten</div>
        <div class="card__body">
          <div class="form-group">
            <label>Fahrzeug</label>
            <select id="bk-vehicle">
              ${vehicles.map(v => `<option value="${v.id}" ${v.id === booking.vehicle_id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label>Datum</label>
            <input type="date" id="bk-date" value="${booking.booking_date}" />
          </div>
          <div class="form-group">
            <label>Von (Uhrzeit)</label>
            <input type="time" id="bk-from" value="${booking.time_from}" />
          </div>
          <div class="form-group">
            <label>Bis (Uhrzeit)</label>
            <input type="time" id="bk-to" value="${booking.time_to}" />
          </div>
          <div class="form-group">
            <label>Grund</label>
            <textarea id="bk-reason" rows="3" maxlength="2000">${esc(booking.reason)}</textarea>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="bk-status">
              <option value="buchung" ${booking.status === 'buchung' ? 'selected' : ''}>Buchung</option>
              <option value="bestaetigt" ${booking.status === 'bestaetigt' ? 'selected' : ''}>Bestätigt</option>
              <option value="abgesagt" ${booking.status === 'abgesagt' ? 'selected' : ''}>Abgesagt</option>
            </select>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-booking">Aktualisieren</button>
            <button class="btn btn--outline" id="btn-cancel-booking">Abbrechen</button>
          </div>
        </div>
      </div>
    `;
    bindFormEvents('edit', id);
  };

  const bindFormEvents = (mode, id) => {
    document.getElementById('btn-cancel-booking')?.addEventListener('click', () => {
      document.getElementById('booking-create-form').style.display = 'none';
    });

    document.getElementById('btn-save-booking')?.addEventListener('click', async () => {
      const vehicleId = document.getElementById('bk-vehicle').value;
      const date = document.getElementById('bk-date').value;
      const timeFrom = document.getElementById('bk-from').value;
      const timeTo = document.getElementById('bk-to').value;
      const reason = document.getElementById('bk-reason').value.trim();
      const status = document.getElementById('bk-status')?.value;

      if (!vehicleId || !date || !timeFrom || !timeTo) {
        toast('Fahrzeug, Datum, Uhrzeit und Grund erforderlich', 'error');
        return;
      }

      const bookingData = {
        vehicle_id: vehicleId,
        booking_date: date,
        time_from: timeFrom,
        time_to: timeTo,
        reason,
      };

      try {
        if (mode === 'create') {
          await api.createVehicleBooking(bookingData);
          toast('Buchung erstellt');
        } else {
          await api.updateVehicleBooking(id, { ...bookingData, status });
          toast('Buchung aktualisiert');
        }
        document.getElementById('booking-create-form').style.display = 'none';
        await loadBookings();
      } catch(e) { toast(e.message, 'error'); }
    });
  };

  // Event listeners
  document.getElementById('btn-new-booking')?.addEventListener('click', openCreateForm);

  await loadBookings();
}
