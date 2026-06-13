import { api } from '../api.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

let _user = null;
let _reports = [];
let _allUsers = [];

export async function renderDienstReports() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  _user = user;
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('dienst-reports');

  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>${icon('book-open', 18)} Dienstberichte</h2>
        <p>Übungsbuch &amp; Dienstabende</p>
      </div>
      <button class="btn btn--primary" id="btn-new-report">${icon('plus', 14)} Neuer Bericht</button>
    </div>

    <div id="reports-wrap">
      <p class="text-muted text-sm">Lade...</p>
    </div>

    <!-- Modal -->
    <div id="modal-report" class="modal" style="display:none">
      <div class="modal__backdrop"></div>
      <div class="modal__box" style="max-width:640px;width:100%">
        <div class="modal__header">
          <h3 id="modal-report-title">Bericht</h3>
          <button class="modal__close" id="btn-close-report">✕</button>
        </div>
        <div class="modal__body" id="modal-report-body"></div>
        <div class="modal__footer" id="modal-report-footer"></div>
      </div>
    </div>
  `;

  renderIcons();

  document.getElementById('btn-new-report').addEventListener('click', () => openModal(null, isAdmin));
  document.getElementById('btn-close-report').addEventListener('click', closeModal);
  document.querySelector('#modal-report .modal__backdrop').addEventListener('click', closeModal);

  // Pre-load member list for participant picker
  try {
    const members = await api.getPersonalMembers().catch(() => []);
    _allUsers = Array.isArray(members) ? members : [];
  } catch (_) {}

  await loadReports();
}

async function loadReports() {
  const wrap = document.getElementById('reports-wrap');
  try {
    _reports = await api.listDienstReports();
    renderList(wrap);
  } catch (e) {
    wrap.innerHTML = `<p class="error-msg">Fehler: ${esc(e.message)}</p>`;
  }
}

const CATEGORY_LABELS = {
  uebung:      'Übung',
  dienstabend: 'Dienstabend',
  sonstiges:   'Sonstiges',
};

const CATEGORY_COLORS = {
  uebung:      { bg: '#e3f2fd', color: '#1565c0' },
  dienstabend: { bg: '#f3e5f5', color: '#6a1b9a' },
  sonstiges:   { bg: '#f5f5f5', color: '#616161' },
};

function renderList(wrap) {
  const isAdmin = _user?.role === 'admin' || _user?.role === 'superuser';

  if (!_reports.length) {
    wrap.innerHTML = `
      <div class="card">
        <div class="card__body">
          <p class="text-muted text-sm">Noch keine Dienstberichte vorhanden.</p>
        </div>
      </div>`;
    return;
  }

  const rows = _reports.map(r => {
    const cat = CATEGORY_COLORS[r.category] || CATEGORY_COLORS.sonstiges;
    const label = CATEGORY_LABELS[r.category] || r.category;
    return `
      <tr data-id="${r.id}" style="cursor:pointer" class="report-row">
        <td>${formatDate(r.report_date)}</td>
        <td><span style="padding:2px 8px;border-radius:12px;font-size:11px;background:${cat.bg};color:${cat.color}">${esc(label)}</span></td>
        <td style="font-weight:600">${esc(r.title)}</td>
        <td>${r.duration_min != null ? r.duration_min + ' Min.' : '—'}</td>
        <td>${r.leader_name ? esc(r.leader_name) : '—'}</td>
        <td style="text-align:right">
          ${isAdmin ? `<button class="btn btn--ghost btn--sm btn-edit-report" data-id="${r.id}" title="Bearbeiten">${icon('pencil', 13)}</button>
          <button class="btn btn--ghost btn--sm btn-del-report" data-id="${r.id}" title="Löschen" style="color:var(--rot)">${icon('trash-2', 13)}</button>` : ''}
        </td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <div class="card">
      <div class="card__body" style="padding:0">
        <table class="data-table" style="width:100%">
          <thead>
            <tr>
              <th>Datum</th><th>Art</th><th>Titel</th><th>Dauer</th><th>Leiter</th><th></th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    </div>`;

  renderIcons();

  wrap.querySelectorAll('.report-row').forEach(row => {
    row.addEventListener('click', e => {
      if (e.target.closest('button')) return;
      const r = _reports.find(x => x.id === row.dataset.id);
      if (r) openDetailModal(r);
    });
  });

  wrap.querySelectorAll('.btn-edit-report').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const r = _reports.find(x => x.id === btn.dataset.id);
      if (r) openModal(r, true);
    });
  });

  wrap.querySelectorAll('.btn-del-report').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('Bericht wirklich löschen?')) return;
      try {
        await api.deleteDienstReport(btn.dataset.id);
        await loadReports();
      } catch (err) {
        alert(err.message);
      }
    });
  });
}

function openDetailModal(report) {
  document.getElementById('modal-report-title').textContent = report.title;
  document.getElementById('modal-report-footer').innerHTML = '';
  document.getElementById('modal-report-body').innerHTML = `
    <div style="display:grid;gap:8px">
      ${kv('Datum',     formatDate(report.report_date))}
      ${kv('Art',       CATEGORY_LABELS[report.category] || report.category)}
      ${report.duration_min != null ? kv('Dauer', report.duration_min + ' Minuten') : ''}
      ${report.location  ? kv('Ort',    esc(report.location))  : ''}
      ${report.leader_name ? kv('Übungsleiter', esc(report.leader_name)) : ''}
      ${report.notes     ? `<div style="margin-top:8px;padding:12px;background:var(--bg-subtle);border-radius:6px;font-size:13px">${esc(report.notes)}</div>` : ''}
    </div>
  `;
  showModal();

  // Load participants asynchronously
  api.getDienstReport(report.id).then(detail => {
    if (!detail?.participants?.length) return;
    const names = detail.participants.map(p => esc(p.display_name)).join(', ');
    const body = document.getElementById('modal-report-body');
    if (body) body.insertAdjacentHTML('beforeend', kv('Teilnehmer', names));
  }).catch(() => {});
}

function openModal(report, isAdmin) {
  if (!isAdmin) return;
  document.getElementById('modal-report-title').textContent = report ? 'Bericht bearbeiten' : 'Neuer Bericht';

  const memberOptions = _allUsers.map(u =>
    `<option value="${u.id}">${esc(u.display_name || u.username)}</option>`
  ).join('');

  const selectedIds = report ? [] : []; // For edit, participants are loaded async

  document.getElementById('modal-report-body').innerHTML = `
    <div style="display:grid;gap:14px">
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Datum *</label>
        <input type="date" id="f-date" class="form-control" value="${report?.report_date || ''}">
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Titel *</label>
        <input type="text" id="f-title" class="form-control" value="${esc(report?.title || '')}" placeholder="z.B. Atemschutzübung">
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Art</label>
        <select id="f-category" class="form-control">
          <option value="uebung"      ${report?.category === 'uebung'      ? 'selected' : ''}>Übung</option>
          <option value="dienstabend" ${report?.category === 'dienstabend' ? 'selected' : ''}>Dienstabend</option>
          <option value="sonstiges"   ${report?.category === 'sonstiges'   ? 'selected' : ''}>Sonstiges</option>
        </select>
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Dauer (Minuten)</label>
        <input type="number" id="f-duration" class="form-control" value="${report?.duration_min ?? ''}" min="0" step="15">
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Ort</label>
        <input type="text" id="f-location" class="form-control" value="${esc(report?.location || '')}">
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Übungsleiter</label>
        <input type="text" id="f-leader" class="form-control" value="${esc(report?.leader_name || '')}" placeholder="Name frei eingeben">
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Teilnehmer</label>
        <select id="f-participants" class="form-control" multiple style="height:100px">
          ${memberOptions}
        </select>
        <div style="font-size:11px;color:var(--text-muted);margin-top:2px">Strg+Klick für Mehrfachauswahl</div>
      </div>
      <div>
        <label style="font-size:12px;color:var(--text-muted);display:block;margin-bottom:4px">Bemerkungen</label>
        <textarea id="f-notes" class="form-control" rows="3" style="resize:vertical">${esc(report?.notes || '')}</textarea>
      </div>
    </div>
  `;

  // Pre-select participants if editing
  if (report) {
    api.getDienstReport(report.id).then(detail => {
      const sel = document.getElementById('f-participants');
      if (!sel || !detail?.participants) return;
      const ids = new Set(detail.participants.map(p => p.user_id).filter(Boolean));
      Array.from(sel.options).forEach(o => { o.selected = ids.has(o.value); });
    }).catch(() => {});
  }

  document.getElementById('modal-report-footer').innerHTML = `
    <button class="btn btn--ghost" id="btn-cancel-report">Abbrechen</button>
    <button class="btn btn--primary" id="btn-save-report">Speichern</button>
  `;

  document.getElementById('btn-cancel-report').addEventListener('click', closeModal);
  document.getElementById('btn-save-report').addEventListener('click', async () => {
    const date  = document.getElementById('f-date').value;
    const title = document.getElementById('f-title').value.trim();
    if (!date || !title) { alert('Datum und Titel sind Pflichtfelder.'); return; }

    const sel = document.getElementById('f-participants');
    const participantIds = Array.from(sel.selectedOptions).map(o => o.value);

    const body = {
      report_date:      date,
      title,
      category:         document.getElementById('f-category').value,
      duration_min:     parseInt(document.getElementById('f-duration').value) || null,
      location:         document.getElementById('f-location').value.trim() || null,
      leader_name:      document.getElementById('f-leader').value.trim() || null,
      notes:            document.getElementById('f-notes').value.trim() || null,
      participant_ids:  participantIds,
    };

    const btn = document.getElementById('btn-save-report');
    btn.disabled = true;
    try {
      if (report) {
        await api.updateDienstReport(report.id, body);
      } else {
        await api.createDienstReport(body);
      }
      closeModal();
      await loadReports();
    } catch (e) {
      alert(e.message);
      btn.disabled = false;
    }
  });

  showModal();
}

function kv(label, value) {
  return `<div style="display:grid;grid-template-columns:130px 1fr;gap:4px;font-size:13px">
    <span style="color:var(--text-muted)">${label}</span>
    <span>${value}</span>
  </div>`;
}

function showModal() {
  document.getElementById('modal-report').style.display = 'flex';
}

function closeModal() {
  document.getElementById('modal-report').style.display = 'none';
}
