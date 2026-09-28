import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate, formatDateTime } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

export async function renderLehrgaenge() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const isAdmin = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Lehrgangsverwaltung</h2><p>Verwaltung von Feuerwehr-Lehrgängen</p></div>
      ${isAdmin ? `<button class="btn btn--primary" id="btn-new-lehrgang">+ Neuer Lehrgang</button>` : ''}
    </div>
    <div id="lehrgang-list-wrap"></div>
    <div id="lehrgang-detail-wrap" style="display:none"></div>
    <div id="lehrgang-form-wrap" style="display:none"></div>
  `;
  renderIcons(content);

  // Event listeners
  document.getElementById('btn-new-lehrgang')?.addEventListener('click', () => openLehrgangModal(null));

  await loadLehrgaenge(isAdmin);
}

// ── Lehrgang-Liste ────────────────────────────────────────────────

async function loadLehrgaenge(isAdmin) {
  const listWrap = document.getElementById('lehrgang-list-wrap');
  const detailWrap = document.getElementById('lehrgang-detail-wrap');
  const formWrap = document.getElementById('lehrgang-form-wrap');

  listWrap.style.display = 'block';
  detailWrap.style.display = 'none';
  formWrap.style.display = 'none';
  listWrap.innerHTML = '<p class="text-muted text-sm">Lade Lehrgänge...</p>';

  try {
    const lehrgaenge = await api.getLehrgaenge();

    if (!lehrgaenge.length) {
      listWrap.innerHTML = `
        <div class="card">
          <div class="card__body empty-state">
            Keine Lehrgänge vorhanden.
            ${isAdmin ? `<br><br><button class="btn btn--primary" id="btn-empty-new">Lehrgang anlegen</button>` : ''}
          </div>
        </div>`;
      if (isAdmin) {
        document.getElementById('btn-empty-new')?.addEventListener('click', () => openLehrgangModal(null));
      }
      return;
    }

    const rows = lehrgaenge.map(l => {
      const statusLabel = l.status === 'veröffentlicht' ? '<span class="badge badge--green">Veröffentlicht</span>'
        : l.status === 'entwurf' ? '<span class="badge badge--yellow">Entwurf</span>'
        : l.status === 'abgeschlossen' ? '<span class="badge badge--blue">Abgeschlossen</span>'
        : '<span class="badge badge--gray">Archiviert</span>';
      return `
        <tr class="data-row lehrgang-row" data-id="${l.id}">
          <td>${esc(l.titel)}</td>
          <td>${esc(l.veranstaltungsort || '–')}</td>
          <td>${formatDate(l.start_date)} – ${formatDate(l.end_date)}</td>
          <td>${formatDate(l.registration_deadline)}</td>
          <td>${l.max_places} Plätze</td>
          <td>${statusLabel}</td>
          ${isAdmin ? `<td>
            <button class="btn btn--outline btn--sm" data-action="edit-lehrgang" data-id="${l.id}">Bearb.</button>
            <button class="btn btn--danger btn--sm" data-action="delete-lehrgang" data-id="${l.id}">Löschen</button>
          </td>` : '<td></td>'}
        </tr>`;
    }).join('');

    listWrap.innerHTML = `
      <div class="card">
        <div class="card__header">
          <span>Lehrgänge (${lehrgaenge.length})</span>
          <input type="text" id="lehrgang-search" placeholder="Suchen..." maxlength="100" class="field" style="width:200px" />
        </div>
        <div class="card__body card__body--flush">
          <table class="data-table">
            <thead>
              <tr>
                <th>Titel</th><th>Ort</th><th>Zeitraum</th><th>Anmeldefrist</th><th>Plätze</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody id="lehrgang-tbody">${rows}</tbody>
          </table>
        </div>
      </div>`;

    document.getElementById('lehrgang-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.lehrgang-row').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    if (isAdmin) {
      listWrap.querySelectorAll('[data-action="edit-lehrgang"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          const l = lehrgaenge.find(l => l.id === btn.dataset.id);
          if (l) openLehrgangModal(l);
        });
      });
      listWrap.querySelectorAll('[data-action="delete-lehrgang"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Lehrgang wirklich löschen?')) return;
          try {
            await api.deleteLehrgang(btn.dataset.id);
            toast('Lehrgang gelöscht');
            await loadLehrgaenge(true);
          } catch (e) { toast(e.message, 'error'); }
        });
      });
    }

    listWrap.querySelectorAll('.lehrgang-row').forEach(tr => {
      tr.addEventListener('click', () => openLehrgangDetail(tr.dataset.id));
    });

  } catch (e) {
    listWrap.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

// ── Lehrgang-Detail ──────────────────────────────────────────────

async function openLehrgangDetail(id) {
  const listWrap = document.getElementById('lehrgang-list-wrap');
  const detailWrap = document.getElementById('lehrgang-detail-wrap');
  listWrap.style.display = 'none';
  detailWrap.style.display = 'block';
  detailWrap.innerHTML = '<p class="text-muted text-sm">Lade...</p>';

  try {
    const l = await api.getLehrgang(id);
    const registrations = await api.getLehrgangRegistrierungen(id).catch(() => []);
    const plaetze_zugewiesen = registrations.filter(r => r.status === 'platz_zugewiesen').length;
    const plaetze_verfuegbar = l.max_places - plaetze_zugewiesen;

    detailWrap.innerHTML = `
      <div class="card" style="margin-bottom:20px">
        <div class="card__header">
          <span>${esc(l.titel)}</span>
          ${l.status === 'veröffentlicht' ? '<span class="badge badge--green">Veröffentlicht</span>' : '<span class="badge badge--gray">Entwurf</span>'}
        </div>
        <div class="card__body">
          ${l.description ? `<p class="text-sm">${esc(l.description)}</p>` : ''}
          <div class="stammdaten-grid">
            ${field('Veranstaltungsort', l.veranstaltungsort)}
            ${field('Zeitraum', `${formatDate(l.start_date)} – ${formatDate(l.end_date)}`)}
            ${field('Anmeldefrist', formatDate(l.registration_deadline))}
            ${field('Plätze', `${plaetze_verfuegbar} von ${l.max_places} verfügbar`)}
          </div>
          ${l.prerequisites && l.prerequisites.length > 0 ? `
            <div class="mt-md">
              <h4>Voraussetzungen</h4>
              <ul>${l.prerequisites.map(p => `<li>${esc(p.name || p)}</li>`).join('')}</ul>
            </div>
          ` : ''}
        </div>
      </div>

      <div class="card">
        <div class="card__header">
          <span>Registrierungen (${registrations.length})</span>
          <button class="btn btn--outline btn--sm" id="btn-back-lehrgaenge">← Zurück</button>
        </div>
        <div class="card__body">
          ${registrations.length === 0 ? '<p class="text-muted text-sm">Noch keine Registrierungen.</p>' : `
            <table class="data-table">
              <thead>
                <tr><th>Benutzer</th><th>Registriert</th><th>Status</th></tr>
              </thead>
              <tbody>
                ${registrations.map(r => `
                  <tr>
                    <td>${esc(r.username || 'Unbekannt')}</td>
                    <td>${formatDateTime(r.registered_at)}</td>
                    <td><span class="status-badge status-badge--${r.status}">${r.status}</span></td>
                  </tr>`).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    `;

    document.getElementById('btn-back-lehrgaenge')?.addEventListener('click', () => loadLehrgaenge(true));

  } catch (e) {
    detailWrap.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

function field(label, value) {
  if (value == null || value === '') return '';
  return `
    <div>
      <div class="field-output__label">${label}</div>
      <div class="field-output__value">${esc(String(value))}</div>
    </div>`;
}

// ── Lehrgang-Modal (Anlegen / Bearbeiten) ─────────────────────────

let editLehrgangId = null;

function openLehrgangModal(l) {
  editLehrgangId = l?.id || null;
  const modal = document.getElementById('modal-lehrgang');
  if (!modal) return;

  modal.classList.add('active');
  document.getElementById('modal-lehrgang-title').textContent = l ? 'Lehrgang bearbeiten' : 'Lehrgang anlegen';
  document.getElementById('lehrgang-titel').value = l?.titel || '';
  document.getElementById('lehrgang-description').value = l?.description || '';
  document.getElementById('lehrgang-ort').value = l?.veranstaltungsort || '';
  document.getElementById('lehrgang-start').value = l?.start_date || '';
  document.getElementById('lehrgang-end').value = l?.end_date || '';
  document.getElementById('lehrgang-deadline').value = l?.registration_deadline || '';
  document.getElementById('lehrgang-max-places').value = l?.max_places || '';
  document.getElementById('lehrgang-status').value = l?.status || 'entwurf';
}

function setupLehrgangModal(onSuccess) {
  const close = () => {
    document.getElementById('modal-lehrgang').classList.remove('active');
    editLehrgangId = null;
  };
  document.getElementById('btn-close-lehrgang-modal')?.addEventListener('click', close);
  document.getElementById('btn-cancel-lehrgang')?.addEventListener('click', close);

  const submitOld = document.getElementById('btn-submit-lehrgang');
  const submitBtn = submitOld.cloneNode(true);
  submitOld.parentNode.replaceChild(submitBtn, submitOld);
  submitBtn.addEventListener('click', async () => {
    const titel = document.getElementById('lehrgang-titel').value.trim();
    if (!titel) { toast('Titel eingeben', 'error'); return; }
    const start_date = document.getElementById('lehrgang-start').value;
    const end_date = document.getElementById('lehrgang-end').value;
    const registration_deadline = document.getElementById('lehrgang-deadline').value;
    if (!start_date || !end_date || !registration_deadline) { toast('Daten und Fristen eingeben', 'error'); return; }
    const body = {
      titel,
      description: document.getElementById('lehrgang-description').value || null,
      veranstaltungsort: document.getElementById('lehrgang-ort').value || null,
      start_date,
      end_date,
      registration_deadline,
      max_places: parseInt(document.getElementById('lehrgang-max-places').value) || 0,
      status: document.getElementById('lehrgang-status').value,
    };
    submitBtn.disabled = true;
    try {
      if (editLehrgangId) {
        await api.updateLehrgang(editLehrgangId, body);
        toast('Lehrgang gespeichert');
      } else {
        await api.createLehrgang(body);
        toast('Lehrgang angelegt');
      }
      close();
      await loadLehrgaenge(true);
      onSuccess?.();
    } catch (e) { toast(e.message, 'error'); }
    finally { submitBtn.disabled = false; }
  });
}

// ── Registrierungen verwalten ───────────────────────────────────────

export async function renderRegistrierungen() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('registrierungen');

  const isAdmin = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Registrierungen</h2><p>Registrierungen zu Lehrgängen</p></div>
    </div>
    <div id="registrierung-list-wrap"></div>
  `;
  renderIcons(content);

  if (!isAdmin) {
    content.querySelector('#registrierung-list-wrap').innerHTML = '<p class="text-muted text-sm">Nur für Admins verfügbar.</p>';
    return;
  }

  try {
    const lehrgaenge = await api.getLehrgaenge();
    const wrap = document.getElementById('registrierung-list-wrap');
    if (!lehrgaenge.length) {
      wrap.innerHTML = '<div class="card"><div class="card__body empty-state">Keine Lehrgänge vorhanden.</div></div>';
      return;
    }

    const rows = lehrgaenge.map(l => {
      const statusLabel = l.status === 'veröffentlicht' ? '<span class="badge badge--green">Veröffentlicht</span>' : '<span class="badge badge--gray">'+l.status+'</span>';
      return `
        <tr class="data-row">
          <td>${esc(l.titel)}</td>
          <td>${formatDate(l.start_date)} – ${formatDate(l.end_date)}</td>
          <td>${statusLabel}</td>
          <td>
            <button class="btn btn--outline btn--sm" data-action="view-registrierungen" data-id="${l.id}">Registrierungen</button>
            <button class="btn btn--outline btn--sm" data-action="export-lehrgang" data-id="${l.id}">CSV</button>
          </td>
        </tr>`;
    }).join('');

    wrap.innerHTML = `
      <div class="card">
        <div class="card__header">Lehrgänge mit Registrierungen</div>
        <div class="card__body card__body--flush">
          <table class="data-table">
            <thead><tr><th>Titel</th><th>Zeitraum</th><th>Status</th><th>Aktionen</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>`;

    wrap.querySelectorAll('[data-action="view-registrierungen"]').forEach(btn => {
      btn.addEventListener('click', () => viewRegistrierungen(btn.dataset.id));
    });
    wrap.querySelectorAll('[data-action="export-lehrgang"]').forEach(btn => {
      btn.addEventListener('click', () => exportLehrgangCsv(btn.dataset.id));
    });

  } catch (e) {
    content.querySelector('#registrierung-list-wrap').innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

async function viewRegistrierungen(lehrgangId) {
  try {
    const registrierungen = await api.getLehrgangRegistrierungen(lehrgangId);
    const modal = document.getElementById('modal-registrierungen');
    if (!modal) return;
    modal.classList.add('active');

    document.getElementById('modal-registrierungen-title').textContent = 'Registrierungen';
    const listWrap = document.getElementById('registrierungen-list');
    if (!registrierungen.length) {
      listWrap.innerHTML = '<p class="text-muted text-sm">Keine Registrierungen.</p>';
    } else {
      listWrap.innerHTML = `
        <table class="data-table">
          <thead><tr><th>Benutzer</th><th>Registriert</th><th>Status</th><th>Aktion</th></tr></thead>
          <tbody>
            ${registrierungen.map(r => `
              <tr>
                <td>${esc(r.username || 'Unbekannt')}</td>
                <td>${formatDateTime(r.registered_at)}</td>
                <td><span class="status-badge status-badge--${r.status}">${r.status}</span></td>
                <td>
                  ${r.status !== 'platz_zugewiesen' ? `<button class="btn btn--outline btn--sm btn-assign" data-id="${r.id}" data-lehrgang="${r.lehrgang_id}">Platz zuweisen</button>` : ''}
                  ${r.status !== 'abgelehnt' ? `<button class="btn btn--outline btn--sm btn-reject" data-id="${r.id}" data-lehrgang="${r.lehrgang_id}">Ablehnen</button>` : ''}
                </td>
              </tr>`).join('')}
          </tbody>
        </table>`;

      listWrap.querySelectorAll('.btn-assign').forEach(btn => {
        btn.addEventListener('click', async () => {
          try {
            await api.updateRegistrierungStatus(btn.dataset.lehrgang, btn.dataset.id, { status: 'platz_zugewiesen' });
            toast('Platz zugewiesen');
            viewRegistrierungen(lehrgangId);
          } catch (e) { toast(e.message, 'error'); }
        });
      });
      listWrap.querySelectorAll('.btn-reject').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Registrierung ablehnen?')) return;
          try {
            await api.updateRegistrierungStatus(btn.dataset.lehrgang, btn.dataset.id, { status: 'abgelehnt' });
            toast('Registrierung abgelehnt');
            viewRegistrierungen(lehrgangId);
          } catch (e) { toast(e.message, 'error'); }
        });
      });
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

async function exportLehrgangCsv(lehrgangId) {
  try {
    const data = await api.exportLehrgangTeilnehmer(lehrgangId);
    if (!data.length) { toast('Keine Teilnehmer mit Platz zugewiesen.', 'error'); return; }

    let csv = 'Vorname,Nachname,Benutzername,Lehrgang,Datum,Ort,E-Mail\n';
    for (const t of data) {
      csv += `${t.vorname || ''},${t.nachname || ''},${t.username},${t.lehrgang_titel},${t.lehrgang_datum},${t.lehrgang_ort || ''},${t.email}\n`;
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `teilnehmer_${lehrgangId}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast('CSV exportiert');
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Meine Anmeldungen ─────────────────────────────────────────────

export async function renderMeineAnmeldungen() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('meine-anmeldungen');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div><h2>Meine Anmeldungen</h2><p>Ihre Registrierungen zu Lehrgängen</p></div>
    </div>
    <div id="my-registrierungen-wrap"></div>
  `;
  renderIcons(content);

  try {
    const allLehrgaenge = await api.getLehrgaenge();
    const meineRegistrierungen = allLehrgaenge.filter(l => l.creator_id === user.id);

    const wrap = document.getElementById('my-registrierungen-wrap');
    if (!meineRegistrierungen.length) {
      wrap.innerHTML = '<div class="card"><div class="card__body empty-state">Keine Anmeldungen vorhanden.</div></div>';
      return;
    }

    wrap.innerHTML = `
      <div class="card">
        <div class="card__header">Meine Lehrgänge</div>
        <div class="card__body card__body--flush">
          <table class="data-table">
            <thead><tr><th>Titel</th><th>Ort</th><th>Datum</th><th>Status</th></tr></thead>
            <tbody>
              ${meineRegistrierungen.map(l => `
                <tr class="data-row">
                  <td>${esc(l.titel)}</td>
                  <td>${esc(l.veranstaltungsort || '–')}</td>
                  <td>${formatDate(l.start_date)} – ${formatDate(l.end_date)}</td>
                  <td><span class="badge badge--blue">${l.status}</span></td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>
      </div>`;
  } catch (e) {
    content.querySelector('#my-registrierungen-wrap').innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

// ── Hilfsfunktionen ────────────────────────────────────────────────

function nvl(id) {
  const v = document.getElementById(id)?.value?.trim();
  return v || null;
}

function num(id) {
  const v = parseInt(document.getElementById(id)?.value);
  return isNaN(v) ? null : v;
}