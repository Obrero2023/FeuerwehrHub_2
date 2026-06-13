import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate, formatDateTime } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

const EQUIPMENT_LABELS = {
  pager:          'Pager',
  key:            'Schlüssel',
  transponder:    'Transponder',
  id_card:        'Dienstausweis',
  driving_permit: 'Fahrberechtigung',
};

const EQUIPMENT_TYPES = Object.entries(EQUIPMENT_LABELS)
  .map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

export async function renderPersonal() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('personal');

  const content = document.getElementById('page-content');

  if (window.location.hash === '#/termine') {
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Termine</h2><p>Terminverwaltung</p></div>
      </div>
      <div id="personal-termine-wrap"></div>
      <div id="personal-typen-wrap" style="display:none"></div>
    `;
    renderIcons(content);
    loadTermineView(settings?.modules || {});
  } else if (window.location.hash === '#/zeiterfassung') {
    content.innerHTML = `
      <div class="page-header">
        <div>
          <h2>Zeiterfassung</h2>
          <p>Dienststunden der Mitglieder auswerten</p>
        </div>
        <a href="#/clock" class="btn btn--primary" target="_blank">${icon('scan-barcode', 14)} Stempeluhr öffnen</a>
      </div>
      <div class="card">
        <div class="card__header">
          <span>Zeitraum</span>
          <input type="date" id="ze-from" class="ms-auto" />
          <span>bis</span>
          <input type="date" id="ze-to" />
          <button class="btn btn--outline btn--sm" id="btn-ze-filter">Anzeigen</button>
        </div>
      </div>
      <div class="card">
        <div class="card__header">Zusammenfassung</div>
        <div class="card__body card__body--flush" id="ze-summary-wrap">
          <p class="wrap-loading">Lade...</p>
        </div>
      </div>
      <div class="card">
        <div class="card__header">Einzelne Einträge</div>
        <div class="card__body card__body--flush" id="ze-history-wrap">
          <p class="wrap-loading">Lade...</p>
        </div>
      </div>
    `;
    renderIcons(content);
    loadZeiterfassung();
  } else {
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Personal</h2><p>Mitgliederverwaltung</p></div>
      </div>
      <div id="personal-list-wrap"></div>
      <div id="personal-detail-wrap" style="display:none"></div>
    `;
    renderIcons(content);
    loadMemberList();
  }
}

// ── Mitgliederliste ───────────────────────────────────────────────────────────

async function loadMemberList() {
  const listWrap   = document.getElementById('personal-list-wrap');
  const detailWrap = document.getElementById('personal-detail-wrap');
  listWrap.style.display   = 'block';
  detailWrap.style.display = 'none';
  listWrap.innerHTML = '<p class="text-muted text-sm">Lade...</p>';

  try {
    const members = await api.getPersonalMembers();

    const rows = members.map(m => `
      <tr data-id="${m.id}" class="member-row">
        <td><strong>${esc(m.display_name || m.username)}</strong>
          ${m.display_name ? `<span class="text-muted text-xs ms-sm">${esc(m.username)}</span>` : ''}</td>
        <td>${esc(m.personnel_number || '–')}</td>
        <td>${m.entry_date ? formatDate(m.entry_date) : '–'}</td>
        <td>${m.exit_date ? `<span class="text-error">${formatDate(m.exit_date)}</span>` : '<span class="text-success">Aktiv</span>'}</td>
      </tr>
    `).join('');

    listWrap.innerHTML = `
      <div class="card">
        <div class="card__header">
          <span>Alle Mitglieder (${members.length})</span>
          <input type="text" id="personal-search" placeholder="Suchen..." maxlength="100"
            class="field" style="width:200px" />
        </div>
        <div class="card__body card__body--flush">
          <table class="data-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Pers.-Nr.</th>
                <th>Eintrittsdatum</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody id="personal-tbody">${rows}</tbody>
          </table>
        </div>
      </div>
    `;

    document.getElementById('personal-search').addEventListener('input', e => {
      const q = e.target.value.toLowerCase();
      document.querySelectorAll('.member-row').forEach(tr => {
        tr.style.display = tr.textContent.toLowerCase().includes(q) ? '' : 'none';
      });
    });

    document.querySelectorAll('.member-row').forEach(tr => {
      tr.addEventListener('click', () => openMember(tr.dataset.id, members));
    });

  } catch (e) {
    listWrap.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

// ── Mitglied-Detailansicht ────────────────────────────────────────────────────

async function openMember(userId, members) {
  const listWrap   = document.getElementById('personal-list-wrap');
  const detailWrap = document.getElementById('personal-detail-wrap');
  listWrap.style.display   = 'none';
  detailWrap.style.display = 'block';
  detailWrap.innerHTML     = '<p class="text-muted text-sm">Lade...</p>';

  const member = members.find(m => m.id === userId);

  try {
    const [details, qualifications, equipment, honors, settings, attendance] = await Promise.all([
      api.getPersonalDetails(userId),
      api.getPersonalQualifications(userId),
      api.getPersonalEquipment(userId),
      api.getPersonalHonors(userId),
      api.getSettings(),
      api.getAttendance(userId),
    ]);
    const warnDays = settings?.qualification_warn_days ?? 90;

    detailWrap.innerHTML = `
      <div class="member-detail-header">
        <button class="btn btn--outline btn--sm" id="btn-back-personal">← Zurück</button>
        <div>
          <h3 class="member-detail-title">${esc(member?.display_name || member?.username || '')}</h3>
          <span class="text-muted text-sm">${esc(member?.username || '')}</span>
        </div>
      </div>

      <div class="tab-bar">
        <button class="tab-btn tab-btn--active" data-tab="pstamm">${icon('clipboard-list', 14)} Stammdaten</button>
        <button class="tab-btn" data-tab="pquali">${icon('graduation-cap', 14)} Qualifikationen</button>
        <button class="tab-btn" data-tab="pequip">${icon('wrench', 14)} Ausrüstung</button>
        <button class="tab-btn" data-tab="phonors">${icon('award', 14)} Ehrungen</button>
        <button class="tab-btn" data-tab="panwesenheit">${icon('calendar', 14)} Anwesenheit</button>
      </div>

      <div id="ptab-pstamm"></div>
      <div id="ptab-pquali"       style="display:none"></div>
      <div id="ptab-pequip"       style="display:none"></div>
      <div id="ptab-phonors"      style="display:none"></div>
      <div id="ptab-panwesenheit" style="display:none"></div>
    `;

    document.getElementById('btn-back-personal').addEventListener('click', loadMemberList);

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('tab-btn--active'));
        btn.classList.add('tab-btn--active');
        document.querySelectorAll('[id^="ptab-"]').forEach(t => t.style.display = 'none');
        document.getElementById(`ptab-${btn.dataset.tab}`).style.display = 'block';
      });
    });

    renderStammdaten(userId, details);
    renderQualifikationen(userId, qualifications, warnDays);
    renderAusruestung(userId, equipment);
    renderEhrungen(userId, honors);
    renderAnwesenheit(userId, attendance, member);
    renderIcons(document.getElementById('personal-detail-wrap'));

  } catch (e) {
    detailWrap.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

// ── Tab: Stammdaten ───────────────────────────────────────────────────────────

function renderStammdaten(userId, details) {
  const wrap = document.getElementById('ptab-pstamm');
  wrap.innerHTML = `
    <div class="card card--narrow">
      <div class="card__header">Stammdaten</div>
      <div class="card__body">
        <div class="form-grid">
          <div class="form-group">
            <label>Geburtsdatum</label>
            <input type="date" id="d-dob" value="${details?.date_of_birth || ''}" />
          </div>
          <div class="form-group">
            <label>Personalnummer</label>
            <input type="text" id="d-persnr" maxlength="50" value="${esc(details?.personnel_number || '')}" />
          </div>
          <div class="form-group">
            <label>Eintrittsdatum</label>
            <input type="date" id="d-entry" value="${details?.entry_date || ''}" />
          </div>
          <div class="form-group">
            <label>Austrittsdatum</label>
            <input type="date" id="d-exit" value="${details?.exit_date || ''}" />
          </div>
          <div class="form-group form-group--full">
            <label>Interne Notizen</label>
            <textarea id="d-notes" maxlength="500" rows="3" class="field">${esc(details?.notes || '')}</textarea>
          </div>
        </div>
        <div class="btn-group mt-md">
          <button class="btn btn--primary" id="btn-save-stamm">Stammdaten speichern</button>
        </div>
      </div>
    </div>

    <div class="card card--narrow">
      <div class="card__header">
        <span>Kontaktdaten</span>
        <span class="text-muted text-xs">Vom Mitglied pflegbar — hier überschreibbar</span>
      </div>
      <div class="card__body">
        ${details?.updated_by_name
          ? `<div class="alert-warning">
               Zuletzt bearbeitet von ${esc(details.updated_by_name)}
             </div>`
          : ''}
        <div class="form-grid">
          <div class="form-group">
            <label>Telefon</label>
            <input type="text" id="cd-phone" maxlength="30" value="${esc(details?.phone || '')}" placeholder="z.B. 0170 1234567" />
          </div>
          <div class="form-group">
            <label>Private E-Mail</label>
            <input type="email" id="cd-email" maxlength="100" value="${esc(details?.email_private || '')}" placeholder="max@beispiel.de" />
          </div>
          <div class="form-group form-group--full">
            <label>Adresse</label>
            <input type="text" id="cd-address" maxlength="200" value="${esc(details?.address || '')}" placeholder="Musterstraße 1, 12345 Musterstadt" />
          </div>
        </div>
        <div class="btn-group mt-md">
          <button class="btn btn--primary" id="btn-save-contact-data">Kontaktdaten speichern</button>
        </div>
      </div>
    </div>

    <div class="card card--narrow">
      <div class="card__header">Notfallkontakte</div>
      <div class="card__body">
        <div id="member-emergency-contacts-list">
          <p class="text-muted text-sm">Lade...</p>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-save-stamm').addEventListener('click', async () => {
    try {
      await api.updatePersonalDetails(userId, {
        date_of_birth:    document.getElementById('d-dob').value   || null,
        entry_date:       document.getElementById('d-entry').value || null,
        exit_date:        document.getElementById('d-exit').value  || null,
        personnel_number: document.getElementById('d-persnr').value.trim() || null,
        notes:            document.getElementById('d-notes').value.trim()  || null,
      });
      toast('Stammdaten gespeichert');
    } catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('btn-save-contact-data').addEventListener('click', async () => {
    try {
      await api.updateMemberProfile(userId, {
        phone:         document.getElementById('cd-phone').value.trim()   || null,
        email_private: document.getElementById('cd-email').value.trim()   || null,
        address:       document.getElementById('cd-address').value.trim() || null,
      });
      toast('Kontaktdaten gespeichert');
    } catch (e) { toast(e.message, 'error'); }
  });

  // Notfallkontakte laden (read-only)
  loadMemberEmergencyContacts(userId);
}

async function loadMemberEmergencyContacts(userId) {
  const listEl = document.getElementById('member-emergency-contacts-list');
  if (!listEl) return;

  try {
    const contacts = await api.getMemberEmergencyContacts(userId);

    if (!contacts.length) {
      listEl.innerHTML = '<p class="text-muted text-sm">Noch keine Notfallkontakte hinterlegt.</p>';
      return;
    }

    const rows = contacts.map(c => `
      <div class="notfall-row">
        <div><strong>${esc(c.name)}</strong></div>
        <div class="text-muted">${esc(c.phone)}</div>
        <div class="text-muted">${c.relationship ? esc(c.relationship) : '–'}</div>
      </div>
    `).join('');

    listEl.innerHTML = `
      <div class="notfall-header">
        <div class="text-muted text-xs fw-semibold">Name</div>
        <div class="text-muted text-xs fw-semibold">Telefon</div>
        <div class="text-muted text-xs fw-semibold">Beziehung</div>
      </div>
      ${rows}
    `;
  } catch (e) {
    listEl.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

// ── Tab: Qualifikationen ──────────────────────────────────────────────────────

function renderQualifikationen(userId, qualifications, warnDays) {
  const wrap = document.getElementById('ptab-pquali');
  const today = new Date(); today.setHours(0,0,0,0);

  wrap.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>Qualifikationen</span>
        <button class="btn btn--primary btn--sm" id="btn-add-quali">+ Hinzufügen</button>
      </div>
      <div id="quali-list">
        ${qualifications.length ? renderQualiTable(qualifications, warnDays, today) : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Qualifikationen eingetragen.</p></div>'}
      </div>
    </div>

    <div id="quali-modal" class="modal-overlay">
      <div class="modal modal--xs">
        <div class="modal__header">
          <h3 id="quali-modal-title">Qualifikation</h3>
          <button class="modal__close" id="btn-cancel-quali-x">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>Bezeichnung</label>
              <input type="text" id="q-name" maxlength="100" placeholder="z.B. Grundausbildung, G26.3, AGT..." />
            </div>
            <div class="form-group">
              <label>Erworben am</label>
              <input type="date" id="q-acquired" />
            </div>
            <div class="form-group">
              <label>Gültig bis</label>
              <input type="date" id="q-expires" />
            </div>
            <div class="form-group form-group--full">
              <label>Hinweis</label>
              <input type="text" id="q-notes" maxlength="200" />
            </div>
            <div class="form-group form-group--full">
              <label class="checkbox-label">
                <input type="checkbox" id="q-health-data" />
                <span>Gesundheitsdatum (Art. 9 DSGVO) — z.&thinsp;B. Atemschutz G26/3</span>
              </label>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="btn-cancel-quali">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-quali">Speichern</button>
        </div>
      </div>
    </div>
  `;

  let editQualId = null;

  const openModal = (q = null) => {
    editQualId = q?.id || null;
    document.getElementById('quali-modal-title').textContent = q ? 'Qualifikation bearbeiten' : 'Qualifikation hinzufügen';
    document.getElementById('q-name').value        = q?.name || '';
    document.getElementById('q-acquired').value    = q?.acquired_at || '';
    document.getElementById('q-expires').value     = q?.expires_at  || '';
    document.getElementById('q-notes').value       = q?.notes || '';
    document.getElementById('q-health-data').checked = q?.is_health_data || false;
    document.getElementById('quali-modal').classList.add('active');
  };

  const closeModal = () => { document.getElementById('quali-modal').classList.remove('active'); };

  document.getElementById('btn-add-quali').addEventListener('click', () => openModal());
  document.getElementById('btn-cancel-quali').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-quali-x').addEventListener('click', closeModal);

  document.getElementById('btn-save-quali').addEventListener('click', async () => {
    const name = document.getElementById('q-name').value.trim();
    if (!name) { toast('Bezeichnung eingeben', 'error'); return; }
    try {
      const body = {
        name,
        acquired_at:   document.getElementById('q-acquired').value || null,
        expires_at:    document.getElementById('q-expires').value  || null,
        notes:         document.getElementById('q-notes').value.trim() || null,
        is_health_data: document.getElementById('q-health-data').checked,
      };
      if (editQualId) {
        await api.updatePersonalQualification(userId, editQualId, body);
        toast('Qualifikation gespeichert');
      } else {
        await api.createPersonalQualification(userId, body);
        toast('Qualifikation hinzugefügt');
      }
      closeModal();
      const updated = await api.getPersonalQualifications(userId);
      document.getElementById('quali-list').innerHTML = updated.length
        ? renderQualiTable(updated, warnDays, today)
        : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Qualifikationen eingetragen.</p></div>';
      bindQualiActions(userId, warnDays, today, openModal);
    } catch (e) { toast(e.message, 'error'); }
  });

  bindQualiActions(userId, warnDays, today, openModal);
}

function renderQualiTable(qualifications, warnDays, today) {
  const rows = qualifications.map(q => {
    const { statusDot, daysLeft } = expiryStatus(q.expires_at, warnDays, today);
    const expiryText = q.expires_at
      ? `${statusDot} ${formatDate(q.expires_at)}${daysLeft !== null ? ` (${daysLeft < 0 ? 'abgelaufen' : `noch ${daysLeft}d`})` : ''}`
      : '–';
    return `
      <tr data-qid="${q.id}" data-name="${esc(q.name)}"
          data-acquired="${q.acquired_at || ''}" data-expires="${q.expires_at || ''}" data-notes="${esc(q.notes || '')}"
          data-health-data="${q.is_health_data ? '1' : ''}">
        <td>
          <strong>${esc(q.name)}</strong>
          ${q.is_health_data ? ' <span class="badge badge--danger" title="Gesundheitsdatum (Art. 9 DSGVO)">§ 9</span>' : ''}
        </td>
        <td>${q.acquired_at ? formatDate(q.acquired_at) : '–'}</td>
        <td>${expiryText}</td>
        <td>
          <div class="btn-group">
            <button class="btn btn--outline btn--sm" data-action="edit-quali">Bearbeiten</button>
            <button class="btn btn--danger btn--sm"  data-action="delete-quali">Löschen</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead><tr>
        <th>Qualifikation</th>
        <th>Erworben</th>
        <th>Gültig bis</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function bindQualiActions(userId, warnDays, today, openModal) {
  document.querySelectorAll('[data-action="edit-quali"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      openModal({
        id: tr.dataset.qid, name: tr.dataset.name,
        acquired_at: tr.dataset.acquired, expires_at: tr.dataset.expires,
        notes: tr.dataset.notes, is_health_data: tr.dataset.healthData === '1',
      });
    });
  });
  document.querySelectorAll('[data-action="delete-quali"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Qualifikation löschen?')) return;
      try {
        await api.deletePersonalQualification(userId, btn.closest('tr').dataset.qid);
        toast('Gelöscht');
        const updated = await api.getPersonalQualifications(userId);
        document.getElementById('quali-list').innerHTML = updated.length
          ? renderQualiTable(updated, warnDays, today)
          : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Qualifikationen eingetragen.</p></div>';
        bindQualiActions(userId, warnDays, today, openModal);
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// ── Tab: Ausrüstung ───────────────────────────────────────────────────────────

function renderAusruestung(userId, equipment) {
  const wrap = document.getElementById('ptab-pequip');

  wrap.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>Ausrüstung & Ausweise</span>
        <button class="btn btn--primary btn--sm" id="btn-add-equip">+ Hinzufügen</button>
      </div>
      <div id="equip-list">
        ${equipment.length ? renderEquipTable(equipment) : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Ausrüstung eingetragen.</p></div>'}
      </div>
    </div>

    <div id="equip-modal" class="modal-overlay">
      <div class="modal modal--xs">
        <div class="modal__header">
          <h3 id="equip-modal-title">Ausrüstung</h3>
          <button class="modal__close" id="btn-cancel-equip-x">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>Typ</label>
              <select id="e-type" class="field">
                ${EQUIPMENT_TYPES}
              </select>
            </div>
            <div class="form-group form-group--full">
              <label>Nr. / Bezeichnung</label>
              <input type="text" id="e-identifier" maxlength="100" placeholder="z.B. Pagernummer, Schlüsselnummer..." />
            </div>
            <div class="form-group">
              <label>Ausgestellt am</label>
              <input type="date" id="e-issued" />
            </div>
            <div class="form-group">
              <label>Gültig bis</label>
              <input type="date" id="e-expires" />
            </div>
            <div class="form-group form-group--full">
              <label>Hinweis</label>
              <input type="text" id="e-notes" maxlength="200" />
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="btn-cancel-equip">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-equip">Speichern</button>
        </div>
      </div>
    </div>
  `;

  let editEquipId = null;

  const openModal = (e = null) => {
    editEquipId = e?.id || null;
    document.getElementById('equip-modal-title').textContent = e ? 'Ausrüstung bearbeiten' : 'Ausrüstung hinzufügen';
    document.getElementById('e-type').value       = e?.type || 'pager';
    document.getElementById('e-identifier').value = e?.identifier || '';
    document.getElementById('e-issued').value     = e?.issued_at || '';
    document.getElementById('e-expires').value    = e?.expires_at || '';
    document.getElementById('e-notes').value      = e?.notes || '';
    document.getElementById('equip-modal').classList.add('active');
  };
  const closeModal = () => { document.getElementById('equip-modal').classList.remove('active'); };

  document.getElementById('btn-add-equip').addEventListener('click', () => openModal());
  document.getElementById('btn-cancel-equip').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-equip-x').addEventListener('click', closeModal);

  document.getElementById('btn-save-equip').addEventListener('click', async () => {
    try {
      const body = {
        type:       document.getElementById('e-type').value,
        identifier: document.getElementById('e-identifier').value.trim() || null,
        issued_at:  document.getElementById('e-issued').value  || null,
        expires_at: document.getElementById('e-expires').value || null,
        notes:      document.getElementById('e-notes').value.trim() || null,
      };
      if (editEquipId) {
        await api.updatePersonalEquipment(userId, editEquipId, body);
        toast('Gespeichert');
      } else {
        await api.createPersonalEquipment(userId, body);
        toast('Hinzugefügt');
      }
      closeModal();
      const updated = await api.getPersonalEquipment(userId);
      document.getElementById('equip-list').innerHTML = updated.length
        ? renderEquipTable(updated)
        : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Ausrüstung eingetragen.</p></div>';
      bindEquipActions(userId, openModal);
    } catch (e) { toast(e.message, 'error'); }
  });

  bindEquipActions(userId, openModal);
}

function renderEquipTable(equipment) {
  const rows = equipment.map(e => `
    <tr data-eid="${e.id}" data-type="${e.type}"
        data-identifier="${esc(e.identifier || '')}" data-issued="${e.issued_at || ''}"
        data-expires="${e.expires_at || ''}" data-notes="${esc(e.notes || '')}">
      <td>${EQUIPMENT_LABELS[e.type] || esc(e.type)}</td>
      <td>${esc(e.identifier || '–')}</td>
      <td>${e.issued_at ? formatDate(e.issued_at) : '–'}</td>
      <td>${e.expires_at ? formatDate(e.expires_at) : '–'}</td>
      <td>
        <div class="btn-group">
          <button class="btn btn--outline btn--sm" data-action="edit-equip">Bearbeiten</button>
          <button class="btn btn--danger btn--sm"  data-action="delete-equip">Löschen</button>
        </div>
      </td>
    </tr>`).join('');

  return `
    <table class="data-table">
      <thead><tr>
        <th>Typ</th>
        <th>Nr./Bezeichnung</th>
        <th>Ausgestellt</th>
        <th>Gültig bis</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function bindEquipActions(userId, openModal) {
  document.querySelectorAll('[data-action="edit-equip"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      openModal({ id: tr.dataset.eid, type: tr.dataset.type, identifier: tr.dataset.identifier,
                  issued_at: tr.dataset.issued, expires_at: tr.dataset.expires, notes: tr.dataset.notes });
    });
  });
  document.querySelectorAll('[data-action="delete-equip"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Eintrag löschen?')) return;
      try {
        await api.deletePersonalEquipment(userId, btn.closest('tr').dataset.eid);
        toast('Gelöscht');
        const updated = await api.getPersonalEquipment(userId);
        document.getElementById('equip-list').innerHTML = updated.length
          ? renderEquipTable(updated)
          : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Ausrüstung eingetragen.</p></div>';
        bindEquipActions(userId, openModal);
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// ── Tab: Ehrungen ─────────────────────────────────────────────────────────────

function renderEhrungen(userId, honors) {
  const wrap = document.getElementById('ptab-phonors');

  wrap.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>Ehrungen</span>
        <button class="btn btn--primary btn--sm" id="btn-add-honor">+ Hinzufügen</button>
      </div>
      <div id="honor-list">
        ${honors.length ? renderHonorTable(honors) : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Ehrungen eingetragen.</p></div>'}
      </div>
    </div>

    <div id="honor-modal" class="modal-overlay">
      <div class="modal modal--xs">
        <div class="modal__header">
          <h3 id="honor-modal-title">Ehrung</h3>
          <button class="modal__close" id="btn-cancel-honor-x">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>Bezeichnung</label>
              <input type="text" id="h-name" maxlength="100" placeholder="z.B. 10 Jahre aktiver Dienst, Feuerwehr-Ehrenzeichen..." />
            </div>
            <div class="form-group">
              <label>Verliehen am</label>
              <input type="date" id="h-awarded" />
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="h-status">
                <option value="aktiv">Aktiv</option>
                <option value="zurueckgezogen">Zurückgezogen</option>
              </select>
            </div>
            <div class="form-group form-group--full">
              <label>Hinweis</label>
              <input type="text" id="h-notes" maxlength="200" />
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="btn-cancel-honor">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-honor">Speichern</button>
        </div>
      </div>
    </div>
  `;

  let editHonorId = null;

  const openModal = (h = null) => {
    editHonorId = h?.id || null;
    document.getElementById('honor-modal-title').textContent = h ? 'Ehrung bearbeiten' : 'Ehrung hinzufügen';
    document.getElementById('h-name').value    = h?.name || '';
    document.getElementById('h-awarded').value = h?.awarded_at || '';
    document.getElementById('h-status').value  = h?.status || 'aktiv';
    document.getElementById('h-notes').value   = h?.notes || '';
    document.getElementById('honor-modal').classList.add('active');
  };
  const closeModal = () => { document.getElementById('honor-modal').classList.remove('active'); };

  document.getElementById('btn-add-honor').addEventListener('click', () => openModal());
  document.getElementById('btn-cancel-honor').addEventListener('click', closeModal);
  document.getElementById('btn-cancel-honor-x').addEventListener('click', closeModal);

  document.getElementById('btn-save-honor').addEventListener('click', async () => {
    const name = document.getElementById('h-name').value.trim();
    if (!name) { toast('Bezeichnung eingeben', 'error'); return; }
    try {
      const body = {
        name,
        awarded_at: document.getElementById('h-awarded').value || null,
        status:     document.getElementById('h-status').value,
        notes:      document.getElementById('h-notes').value.trim() || null,
      };
      if (editHonorId) {
        await api.updatePersonalHonor(userId, editHonorId, body);
        toast('Gespeichert');
      } else {
        await api.createPersonalHonor(userId, body);
        toast('Hinzugefügt');
      }
      closeModal();
      const updated = await api.getPersonalHonors(userId);
      document.getElementById('honor-list').innerHTML = updated.length
        ? renderHonorTable(updated)
        : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Ehrungen eingetragen.</p></div>';
      bindHonorActions(userId, openModal);
    } catch (e) { toast(e.message, 'error'); }
  });

  bindHonorActions(userId, openModal);
}

function renderHonorTable(honors) {
  const rows = honors.map(h => {
    const isActive = h.status === 'aktiv';
    const statusBadge = isActive
      ? `<span class="badge-success">Aktiv</span>`
      : `<span class="badge-muted">Zurückgezogen</span>`;
    return `
    <tr data-hid="${h.id}" data-name="${esc(h.name)}"
        data-awarded="${h.awarded_at || ''}" data-status="${h.status || 'aktiv'}" data-notes="${esc(h.notes || '')}">
      <td><strong>${esc(h.name)}</strong></td>
      <td>${h.awarded_at ? formatDate(h.awarded_at) : '–'}</td>
      <td>${statusBadge}</td>
      <td>${esc(h.notes || '–')}</td>
      <td>
        <div class="btn-group">
          <button class="btn btn--outline btn--sm" data-action="edit-honor">Bearbeiten</button>
          <button class="btn btn--danger btn--sm"  data-action="delete-honor">Löschen</button>
        </div>
      </td>
    </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead><tr>
        <th>Ehrung</th>
        <th>Verliehen am</th>
        <th>Status</th>
        <th>Hinweis</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function bindHonorActions(userId, openModal) {
  document.querySelectorAll('[data-action="edit-honor"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      openModal({ id: tr.dataset.hid, name: tr.dataset.name, awarded_at: tr.dataset.awarded, status: tr.dataset.status, notes: tr.dataset.notes });
    });
  });
  document.querySelectorAll('[data-action="delete-honor"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Ehrung löschen?')) return;
      try {
        await api.deletePersonalHonor(userId, btn.closest('tr').dataset.hid);
        toast('Gelöscht');
        const updated = await api.getPersonalHonors(userId);
        document.getElementById('honor-list').innerHTML = updated.length
          ? renderHonorTable(updated)
          : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Ehrungen eingetragen.</p></div>';
        bindHonorActions(userId, openModal);
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

// ── Hilfsfunktionen ───────────────────────────────────────────────────────────

function expiryStatus(expiresAt, warnDays, today) {
  const dot = (mod) => `<span class="status-dot status-dot--${mod}"></span>`;
  if (!expiresAt) return { statusDot: '', daysLeft: null };
  const exp = new Date(expiresAt); exp.setHours(0,0,0,0);
  const daysLeft = Math.floor((exp - today) / (1000 * 60 * 60 * 24));
  if (daysLeft < 0)         return { statusDot: dot('danger'), daysLeft };
  if (daysLeft <= 30)       return { statusDot: dot('danger'), daysLeft };
  if (daysLeft <= warnDays) return { statusDot: dot('warning'), daysLeft };
  return { statusDot: dot('success'), daysLeft };
}

// ── Tab: Anwesenheit ──────────────────────────────────────────────────────────

const ATTENDANCE_LABELS = {
  present: { label: 'Anwesend',     color: 'var(--gruen)' },
  absent:  { label: 'Abwesend',     color: 'var(--error)' },
  excused: { label: 'Entschuldigt', color: 'var(--gelb-dunkel)' },
};

function renderAnwesenheit(userId, attendance, member) {
  const wrap = document.getElementById('ptab-panwesenheit');
  if (!wrap) return;

  const memberName = member?.display_name || member?.username || '';

  const renderTable = (entries) => {
    if (!entries.length) return '<p class="wrap-loading">Noch keine Einträge vorhanden.</p>';
    return `
      <table class="data-table">
        <thead><tr>
          <th>Datum</th>
          <th>Status</th>
          <th>Notiz</th>
          <th></th>
        </tr></thead>
        <tbody>
          ${entries.map(e => {
            const s = ATTENDANCE_LABELS[e.status] || { label: e.status, color: 'var(--text-muted)' };
            return `
              <tr data-aid="${e.id}" class="data-row">
                <td>${formatDate(e.service_date)}</td>
                <td class="att-status att-status--${e.status} fw-semibold">${s.label}</td>
                <td>${esc(e.notes || '–')}</td>
                <td>
                  <div class="btn-group">
                    <button class="btn btn--danger btn--sm" data-action="delete-attendance" data-aid="${e.id}">Löschen</button>
                  </div>
                </td>
              </tr>`;
          }).join('')}
        </tbody>
      </table>`;
  };

  // Statistik berechnen
  const calcStats = (entries) => {
    const total   = entries.length;
    const present = entries.filter(e => e.status === 'present').length;
    const absent  = entries.filter(e => e.status === 'absent').length;
    const excused = entries.filter(e => e.status === 'excused').length;
    const pct = total > 0 ? Math.round((present / total) * 100) : 0;
    return { total, present, absent, excused, pct };
  };

  const renderStats = (entries) => {
    const s = calcStats(entries);
    return `
      <div class="att-stats">
        <div class="att-stat">
          <div class="att-stat__value">${s.total}</div>
          <div class="att-stat__label">Gesamt</div>
        </div>
        <div class="att-stat">
          <div class="att-stat__value att-status--present">${s.present}</div>
          <div class="att-stat__label">Anwesend</div>
        </div>
        <div class="att-stat">
          <div class="att-stat__value att-status--absent">${s.absent}</div>
          <div class="att-stat__label">Abwesend</div>
        </div>
        <div class="att-stat">
          <div class="att-stat__value att-status--excused">${s.excused}</div>
          <div class="att-stat__label">Entschuldigt</div>
        </div>
        <div class="att-stat">
          <div class="att-stat__value text-info">${s.pct}%</div>
          <div class="att-stat__label">Quote</div>
        </div>
      </div>`;
  };

  let currentEntries = [...attendance];

  const rebuild = () => {
    document.getElementById('attendance-stats').innerHTML = renderStats(currentEntries);
    document.getElementById('attendance-list').innerHTML  = renderTable(currentEntries);
    bindDeleteActions();
  };

  wrap.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>Dienstbeteiligung</span>
        <div class="btn-group">
          <a class="btn btn--outline btn--sm" href="/api/personal/members/${userId}/attendance/export"
             download="anwesenheit_${esc(memberName)}.csv">CSV Export</a>
          <button class="btn btn--primary btn--sm" id="btn-add-attendance">+ Eintrag hinzufügen</button>
        </div>
      </div>
      <div class="card__body">
        <div id="attendance-stats">${renderStats(currentEntries)}</div>

        <div id="add-attendance-form" class="att-add-form" style="display:none">
          <div class="form-grid">
            <div class="form-group">
              <label>Datum</label>
              <input type="date" id="att-date" value="${new Date().toISOString().slice(0,10)}" />
            </div>
            <div class="form-group">
              <label>Status</label>
              <select id="att-status" class="field">
                <option value="present">Anwesend</option>
                <option value="absent">Abwesend</option>
                <option value="excused">Entschuldigt</option>
              </select>
            </div>
            <div class="form-group form-group--full">
              <label>Notiz (optional)</label>
              <input type="text" id="att-notes" maxlength="200" placeholder="z.B. Urlaubsabwesenheit" />
            </div>
          </div>
          <div class="btn-group mt-sm">
            <button class="btn btn--primary btn--sm" id="btn-save-attendance">Speichern</button>
            <button class="btn btn--outline btn--sm" id="btn-cancel-attendance">Abbrechen</button>
          </div>
        </div>

        <div id="attendance-list">${renderTable(currentEntries)}</div>
      </div>
    </div>
  `;

  document.getElementById('btn-add-attendance').addEventListener('click', () => {
    document.getElementById('add-attendance-form').style.display = 'block';
    document.getElementById('att-date').focus();
  });

  document.getElementById('btn-cancel-attendance').addEventListener('click', () => {
    document.getElementById('add-attendance-form').style.display = 'none';
  });

  document.getElementById('btn-save-attendance').addEventListener('click', async () => {
    const date   = document.getElementById('att-date').value;
    const status = document.getElementById('att-status').value;
    const notes  = document.getElementById('att-notes').value.trim();
    if (!date) { toast('Datum angeben', 'error'); return; }
    try {
      const entry = await api.createAttendance(userId, { service_date: date, status, notes: notes || null });
      currentEntries.unshift(entry);
      rebuild();
      document.getElementById('add-attendance-form').style.display = 'none';
      document.getElementById('att-notes').value = '';
      toast('Eintrag gespeichert');
    } catch (e) { toast(e.message, 'error'); }
  });

  function bindDeleteActions() {
    document.querySelectorAll('[data-action="delete-attendance"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Eintrag löschen?')) return;
        try {
          await api.deleteAttendance(userId, btn.dataset.aid);
          currentEntries = currentEntries.filter(e => e.id !== btn.dataset.aid);
          rebuild();
          toast('Gelöscht');
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  bindDeleteActions();
}

// ── Terminverwaltung (Personal-Modul) ─────────────────────────────────────────


const VEREIN_EVENT_COLORS = {
  'Übung': 'var(--gelb)',
  'Versammlung': 'var(--info)',
  'Fest': 'var(--gruen)',
  'Arbeitsdienst': 'var(--gelb)',
  'Sonstiges': 'var(--text-muted)',
};

let _vereinTermineCache = [];

function normalizeVereinEvent(e) {
  return {
    _source: 'verein',
    id: e.id,
    title: e.titel,
    location: e.ort || null,
    start_at: e.datum + 'T' + (e.uhrzeit ? e.uhrzeit + ':00' : '00:00:00'),
    end_at: null,
    typ_name: e.typ,
    typ_color: VEREIN_EVENT_COLORS[e.typ] || 'var(--text-muted)',
    assignment_count: 0,
  };
}

function typBadge(name, color) {
  if (!name) return '<span class="text-subtle text-sm">–</span>';
  return `<span class="typ-badge" style="background:${color}22;color:${color}">${esc(name)}</span>`;
}

// ── Zeiterfassung ────────────────────────────────────────────────────────────

async function loadZeiterfassung() {
  // Standard: aktueller Monat
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
  const lastDay  = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const fromInput = document.getElementById('ze-from');
  const toInput   = document.getElementById('ze-to');
  fromInput.value = firstDay.toISOString().slice(0, 10);
  toInput.value   = lastDay.toISOString().slice(0, 10);

  async function loadData() {
    const from = fromInput.value;
    const to   = toInput.value;

    let summary, history;
    try {
      [summary, history] = await Promise.all([
        api.timeclockSummary(from, to),
        api.timeclockHistory(from, to),
      ]);
    } catch (e) {
      document.getElementById('ze-summary-wrap').innerHTML =
        `<div class="error-msg error-msg--block">Fehler: ${esc(e.message)}</div>`;
      document.getElementById('ze-history-wrap').innerHTML = '';
      return;
    }

    // Zusammenfassung
    const summaryWrap = document.getElementById('ze-summary-wrap');
    if (!summary.length) {
      summaryWrap.innerHTML = '<div class="wrap-loading"><p class="text-muted text-sm">Keine Einträge im gewählten Zeitraum.</p></div>';
    } else {
      summaryWrap.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Mitglied</th>
                <th>Einträge</th>
                <th>Stunden gesamt</th>
                <th>Ø pro Eintrag</th>
              </tr>
            </thead>
            <tbody>
              ${summary.map(s => {
                const avg = s.entry_count > 0 ? (s.total_hours / s.entry_count).toFixed(1) : '—';
                return `
                  <tr>
                    <td><strong>${esc(s.display_name || s.username)}</strong></td>
                    <td>${s.entry_count}</td>
                    <td>${s.total_hours.toFixed(1)} h</td>
                    <td>${avg} h</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }

    // Einzelne Einträge
    const historyWrap = document.getElementById('ze-history-wrap');
    if (!history.length) {
      historyWrap.innerHTML = '<div class="wrap-loading"><p class="text-muted text-sm">Keine Einträge.</p></div>';
    } else {
      historyWrap.innerHTML = `
        <div class="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Mitglied</th>
                <th>Datum</th>
                <th>Eingestempelt</th>
                <th>Ausgestempelt</th>
                <th>Dauer</th>
                <th>Typ</th>
                <th>Termin</th>
              </tr>
            </thead>
            <tbody>
              ${history.map(h => {
                const cin  = new Date(h.check_in);
                const cout = h.check_out ? new Date(h.check_out) : null;
                const datum = cin.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
                const timeIn = cin.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                const timeOut = cout ? cout.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }) : '—';
                let dauer = '—';
                if (cout) {
                  const mins = Math.round((cout - cin) / 60000);
                  const h = Math.floor(mins / 60);
                  const m = mins % 60;
                  dauer = `${h}h ${String(m).padStart(2, '0')}m`;
                } else {
                  dauer = '<span class="text-success fw-semibold">aktiv</span>';
                }
                return `
                  <tr>
                    <td>${esc(h.display_name || h.username)}</td>
                    <td>${datum}</td>
                    <td>${timeIn}</td>
                    <td>${timeOut}</td>
                    <td>${dauer}</td>
                    <td>${esc(h.typ)}</td>
                    <td>${h.termin_title ? esc(h.termin_title) : '<span class="text-muted">—</span>'}</td>
                  </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    }
  }

  document.getElementById('btn-ze-filter').addEventListener('click', loadData);
  loadData();
}

// ── Termine ──────────────────────────────────────────────────────────────────

async function loadTermineView(modules = {}) {
  const wrap = document.getElementById('personal-termine-wrap');
  wrap.innerHTML = '<p class="text-muted text-sm">Lade...</p>';

  try {
    const fetches = [api.getTermine(), api.getTerminTypen(), api.getPersonalMembers()];
    if (modules.verein) fetches.push(api.getEvents().catch(() => []));
    const [termine, typen, members, vereinEvents] = await Promise.all(fetches);

    _vereinTermineCache = modules.verein ? (vereinEvents || []).map(normalizeVereinEvent) : [];
    const all = [...termine.map(t => ({ ...t, _source: 'personal' })), ..._vereinTermineCache]
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));

    wrap.innerHTML = `
      <div class="card">
        <div class="card__header">
          <span>Termine (${all.length}${_vereinTermineCache.length ? ` · davon ${_vereinTermineCache.length} Vereins-Events` : ''})</span>
          <div class="btn-group">
            <button class="btn btn--outline btn--sm" id="btn-show-typen">${icon('tag', 13)} Termintypen</button>
            <button class="btn btn--primary btn--sm" id="btn-add-termin">+ Termin erstellen</button>
          </div>
        </div>
        <div id="termine-list">
          ${all.length ? renderTerminTable(all) : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Termine eingetragen.</p></div>'}
        </div>
      </div>

      ${renderTerminModal(typen)}
      ${renderAssignModal(members)}
    `;

    renderIcons(wrap);
    bindTermineActions(typen, members);

  } catch (e) {
    wrap.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

function renderTerminTable(termine) {
  const now = new Date();
  const rows = termine.map(t => {
    const past = new Date(t.start_at) < now;
    return `
      <tr data-tid="${t.id}" class="data-row${past ? ' data-row--past' : ''}">
        <td>
          <strong>${esc(t.title)}</strong>
          ${t.location ? `<div class="termin-location">${esc(t.location)}</div>` : ''}
        </td>
        <td>${typBadge(t.typ_name, t.typ_color || 'var(--text-muted)')}</td>
        <td class="text-muted" style="white-space:nowrap">${formatDateTime(t.start_at)}</td>
        <td class="text-muted" style="white-space:nowrap">${t.end_at ? formatDateTime(t.end_at) : '–'}</td>
        <td class="text-muted text-xs">
          ${t._source === 'verein'
            ? `<span class="inline-tag">Verein</span>`
            : t.assignment_count > 0 ? `${t.assignment_count} Mitgl.` : '<span class="text-subtle">Alle</span>'}
        </td>
        <td>
          ${t._source !== 'verein' ? `
          <div class="btn-group">
            <button class="btn btn--outline btn--sm" data-action="edit-termin">Bearbeiten</button>
            <button class="btn btn--outline btn--sm" data-action="assign-termin">${icon('users', 12)} Zuweisen</button>
            <button class="btn btn--danger btn--sm"  data-action="delete-termin">Löschen</button>
          </div>` : `<a href="#/verein" class="text-muted text-xs">Verein →</a>`}
        </td>
      </tr>`;
  }).join('');

  return `
    <table class="data-table">
      <thead><tr>
        <th>Termin</th>
        <th>Typ</th>
        <th>Beginn</th>
        <th>Ende</th>
        <th>Zugewiesen</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderTerminModal(typen) {
  const typOptions = typen.map(t =>
    `<option value="${t.id}">${esc(t.name)}</option>`
  ).join('');

  return `
    <div id="termin-modal" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3 id="termin-modal-title">Termin</h3>
          <button class="modal__close" id="btn-cancel-termin-x">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-grid">
            <div class="form-group form-group--full">
              <label>Bezeichnung</label>
              <input type="text" id="t-title" maxlength="150" placeholder="z.B. Montagsübung, AGT-Lehrgang..." />
            </div>
            <div class="form-group">
              <label>Typ</label>
              <select id="t-typ">
                <option value="">– kein Typ –</option>
                ${typOptions}
              </select>
            </div>
            <div class="form-group">
              <label>Ort</label>
              <input type="text" id="t-location" maxlength="150" placeholder="Gerätehaus, Übungsgelände..." />
            </div>
            <div class="form-group">
              <label>Beginn</label>
              <input type="datetime-local" id="t-start" />
            </div>
            <div class="form-group">
              <label>Ende (optional)</label>
              <input type="datetime-local" id="t-end" />
            </div>
            <div class="form-group form-group--full">
              <label>Beschreibung</label>
              <textarea id="t-description" maxlength="500" rows="3" class="field"></textarea>
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="btn-cancel-termin">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-termin">Speichern</button>
        </div>
      </div>
    </div>`;
}

function renderAssignModal(members) {
  const memberOptions = members.map(m => `
    <label class="assign-label">
      <input type="checkbox" value="${m.id}" class="assign-checkbox" />
      ${esc(m.display_name || m.username)}
      ${m.display_name ? `<span class="text-muted text-xs">(${esc(m.username)})</span>` : ''}
    </label>`).join('');

  return `
    <div id="assign-modal" class="modal-overlay" style="z-index:300">
      <div class="modal modal--xs">
        <div class="modal__header">
          <h3>Zuweisung</h3>
          <button class="modal__close" id="btn-cancel-assign-x">✕</button>
        </div>
        <div class="modal__body">
          <p class="text-muted text-xs mb-sm">Keine Auswahl = allgemeiner Termin (für alle sichtbar)</p>
          <input type="text" id="assign-search" placeholder="Mitglied suchen..." maxlength="100"
            class="field mb-sm" />
          <div id="assign-member-list" class="assign-member-list">${memberOptions}</div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="btn-cancel-assign">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-assign">Speichern</button>
        </div>
      </div>
    </div>`;
}

function toISOLocal(val) {
  if (!val) return null;
  // datetime-local gibt "2026-03-29T14:00" → als UTC interpretieren
  return new Date(val).toISOString();
}

function bindTermineActions(typen, members) {
  let editTerminId = null;
  let assignTerminId = null;

  const terminModal = document.getElementById('termin-modal');
  const assignModal = document.getElementById('assign-modal');

  const openTerminModal = (t = null) => {
    editTerminId = t?.id || null;
    document.getElementById('termin-modal-title').textContent = t ? 'Termin bearbeiten' : 'Termin erstellen';
    document.getElementById('t-title').value       = t?.title || '';
    document.getElementById('t-typ').value         = t?.typ_id || '';
    document.getElementById('t-location').value    = t?.location || '';
    document.getElementById('t-start').value       = t?.start_at ? toDatetimeLocal(t.start_at) : '';
    document.getElementById('t-end').value         = t?.end_at   ? toDatetimeLocal(t.end_at)   : '';
    document.getElementById('t-description').value = t?.description || '';
    terminModal.classList.add('active');
  };
  const closeTerminModal = () => { terminModal.classList.remove('active'); };

  document.getElementById('btn-add-termin').addEventListener('click', () => openTerminModal());
  document.getElementById('btn-show-typen').addEventListener('click', () => {
    const typenWrap = document.getElementById('personal-typen-wrap');
    if (typenWrap) {
      typenWrap.style.display = typenWrap.style.display === 'none' ? 'block' : 'none';
      if (typenWrap.style.display === 'block') loadTerminTypenView();
    }
  });
  document.getElementById('btn-cancel-termin').addEventListener('click', closeTerminModal);
  document.getElementById('btn-cancel-termin-x').addEventListener('click', closeTerminModal);

  document.getElementById('btn-save-termin').addEventListener('click', async () => {
    const title = document.getElementById('t-title').value.trim();
    if (!title) { toast('Bezeichnung eingeben', 'error'); return; }
    const startVal = document.getElementById('t-start').value;
    if (!startVal) { toast('Startzeit eingeben', 'error'); return; }
    // editTerminId aus data-attr lesen falls nach refresh gesetzt
    const resolvedId = editTerminId || document.getElementById('btn-save-termin').dataset.editId || null;
    try {
      const body = {
        title,
        typ_id:      document.getElementById('t-typ').value || null,
        start_at:    toISOLocal(startVal),
        end_at:      toISOLocal(document.getElementById('t-end').value),
        location:    document.getElementById('t-location').value.trim() || null,
        description: document.getElementById('t-description').value.trim() || null,
      };
      if (resolvedId) {
        await api.updateTermin(resolvedId, body);
        toast('Gespeichert');
      } else {
        await api.createTermin(body);
        toast('Termin erstellt');
      }
      editTerminId = null;
      delete document.getElementById('btn-save-termin').dataset.editId;
      closeTerminModal();
      await refreshTermine();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Assign-Modal
  const openAssignModal = async (terminId) => {
    assignTerminId = terminId;
    try {
      const assigned = await api.getTerminAssignments(terminId);
      const assignedIds = new Set(assigned.map(u => u.user_id));
      document.querySelectorAll('#assign-member-list input[type=checkbox]').forEach(cb => {
        cb.checked = assignedIds.has(cb.value);
      });
    } catch (e) { /* ignore */ }
    document.getElementById('assign-search').value = '';
    filterAssignSearch('');
    assignModal.classList.add('active');
  };
  const closeAssignModal = () => { assignModal.classList.remove('active'); };

  document.getElementById('btn-cancel-assign').addEventListener('click', closeAssignModal);
  document.getElementById('btn-cancel-assign-x').addEventListener('click', closeAssignModal);

  document.getElementById('assign-search').addEventListener('input', e => {
    filterAssignSearch(e.target.value.toLowerCase());
  });

  document.getElementById('btn-save-assign').addEventListener('click', async () => {
    const resolvedTid = assignTerminId || document.getElementById('assign-modal').dataset.terminId || null;
    const checked = [...document.querySelectorAll('#assign-member-list input[type=checkbox]:checked')];
    const user_ids = checked.map(cb => cb.value);
    try {
      await api.setTerminAssignments(resolvedTid, { user_ids });
      toast('Zuweisung gespeichert');
      closeAssignModal();
      await refreshTermine();
    } catch (e) { toast(e.message, 'error'); }
  });

  bindTerminRowActions(openTerminModal, openAssignModal);
}

function filterAssignSearch(q) {
  document.querySelectorAll('#assign-member-list label').forEach(label => {
    label.style.display = label.textContent.toLowerCase().includes(q) ? '' : 'none';
  });
}

function bindTerminRowActions(openTerminModal, openAssignModal) {
  document.querySelectorAll('[data-action="edit-termin"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tr = btn.closest('tr');
      // Hole Termin-Daten aus der Tabelle über data-tid
      const tid = tr.dataset.tid;
      api.getTermine().then(list => {
        const t = list.find(x => x.id === tid);
        if (t) openTerminModal(t);
      });
    });
  });

  document.querySelectorAll('[data-action="assign-termin"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.closest('tr').dataset.tid;
      openAssignModal(tid);
    });
  });

  document.querySelectorAll('[data-action="delete-termin"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Termin löschen?')) return;
      try {
        await api.deleteTermin(btn.closest('tr').dataset.tid);
        toast('Gelöscht');
        await refreshTermine();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

async function refreshTermine() {
  const updated = await api.getTermine();
  const all = [...updated.map(t => ({ ...t, _source: 'personal' })), ..._vereinTermineCache]
    .sort((a, b) => new Date(a.start_at) - new Date(b.start_at));
  document.getElementById('termine-list').innerHTML = all.length
    ? renderTerminTable(all)
    : '<div class="p-empty"><p class="text-muted text-sm">Noch keine Termine eingetragen.</p></div>';
  renderIcons(document.getElementById('termine-list'));
  // Bind actions neu (openModal und openAssignModal aus loadTermineView nicht zugänglich — nutze gespeicherte Referenz)
  document.querySelectorAll('[data-action="edit-termin"]').forEach(btn => {
    btn.addEventListener('click', () => {
      const tid = btn.closest('tr').dataset.tid;
      api.getTermine().then(list => {
        const t = list.find(x => x.id === tid);
        if (t) {
          document.getElementById('termin-modal-title').textContent = 'Termin bearbeiten';
          document.getElementById('t-title').value       = t.title || '';
          document.getElementById('t-typ').value         = t.typ_id || '';
          document.getElementById('t-location').value    = t.location || '';
          document.getElementById('t-start').value       = t.start_at ? toDatetimeLocal(t.start_at) : '';
          document.getElementById('t-end').value         = t.end_at   ? toDatetimeLocal(t.end_at)   : '';
          document.getElementById('t-description').value = t.description || '';
          document.getElementById('termin-modal').classList.add('active');
          // editTerminId setzen über data-attr
          document.getElementById('btn-save-termin').dataset.editId = t.id;
        }
      });
    });
  });
  document.querySelectorAll('[data-action="assign-termin"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const tid = btn.closest('tr').dataset.tid;
      document.getElementById('assign-modal').dataset.terminId = tid;
      try {
        const assigned = await api.getTerminAssignments(tid);
        const assignedIds = new Set(assigned.map(u => u.user_id));
        document.querySelectorAll('#assign-member-list input[type=checkbox]').forEach(cb => {
          cb.checked = assignedIds.has(cb.value);
        });
      } catch (e) { /* ignore */ }
      document.getElementById('assign-search').value = '';
      filterAssignSearch('');
      document.getElementById('assign-modal').classList.add('active');
    });
  });
  document.querySelectorAll('[data-action="delete-termin"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Termin löschen?')) return;
      try {
        await api.deleteTermin(btn.closest('tr').dataset.tid);
        toast('Gelöscht');
        await refreshTermine();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}

function toDatetimeLocal(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// ── Termintypen (Personal-Modul) ──────────────────────────────────────────────

async function loadTerminTypenView() {
  const wrap = document.getElementById('personal-typen-wrap');
  wrap.innerHTML = '<p class="text-muted text-sm">Lade...</p>';

  try {
    const typen = await api.getTerminTypen();

    wrap.innerHTML = `
      <div class="card">
        <div class="card__header">
          <span>Termintypen</span>
          <button class="btn btn--primary btn--sm" id="btn-add-typ">+ Typ erstellen</button>
        </div>
        <div id="typen-list">
          ${renderTypenList(typen)}
        </div>
      </div>

      <div id="typ-modal" class="modal-overlay">
        <div class="modal modal--xs">
          <div class="modal__header">
            <h3>Neuer Termintyp</h3>
            <button class="modal__close" id="btn-cancel-typ-x">✕</button>
          </div>
          <div class="modal__body">
            <div class="form-grid">
              <div class="form-group">
                <label>Bezeichnung</label>
                <input type="text" id="typ-name" maxlength="60" placeholder="z.B. Hauptversammlung" />
              </div>
              <div class="form-group">
                <label>Farbe</label>
                <input type="color" id="typ-color" value="#6b7280" class="color-input" />
              </div>
            </div>
          </div>
          <div class="modal__footer">
            <button class="btn btn--outline" id="btn-cancel-typ">Abbrechen</button>
            <button class="btn btn--primary" id="btn-save-typ">Erstellen</button>
          </div>
        </div>
      </div>
    `;

    renderIcons(wrap);

    const typModal = document.getElementById('typ-modal');
    document.getElementById('btn-add-typ').addEventListener('click', () => {
      document.getElementById('typ-name').value = '';
      document.getElementById('typ-color').value = 'var(--text-muted)';
      typModal.classList.add('active');
    });
    document.getElementById('btn-cancel-typ').addEventListener('click', () => { typModal.classList.remove('active'); });
    document.getElementById('btn-cancel-typ-x').addEventListener('click', () => { typModal.classList.remove('active'); });

    document.getElementById('btn-save-typ').addEventListener('click', async () => {
      const name = document.getElementById('typ-name').value.trim();
      if (!name) { toast('Bezeichnung eingeben', 'error'); return; }
      try {
        await api.createTerminTyp({ name, color: document.getElementById('typ-color').value });
        toast('Typ erstellt');
        typModal.classList.remove('active');
        const updated = await api.getTerminTypen();
        document.getElementById('typen-list').innerHTML = renderTypenList(updated);
        bindTypenDeleteActions();
      } catch (e) { toast(e.message, 'error'); }
    });

    bindTypenDeleteActions();

  } catch (e) {
    wrap.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
  }
}

function renderTypenList(typen) {
  if (!typen.length) return '<div class="p-empty"><p class="text-muted text-sm">Keine Typen gefunden.</p></div>';
  const rows = typen.map(t => `
    <tr data-typid="${t.id}">
      <td>
        ${typBadge(t.name, t.color)}
        ${t.is_default ? '<span class="text-subtle text-xs ms-sm">Standard</span>' : ''}
      </td>
      <td>
        ${!t.is_default
          ? `<button class="btn btn--danger btn--sm" data-action="delete-typ">Löschen</button>`
          : ''}
      </td>
    </tr>`).join('');

  return `
    <table class="data-table">
      <thead><tr>
        <th>Typ</th>
        <th></th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function bindTypenDeleteActions() {
  document.querySelectorAll('[data-action="delete-typ"]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (!confirm('Termintyp löschen? Bestehende Termine behalten ihren Typ.')) return;
      try {
        await api.deleteTerminTyp(btn.closest('tr').dataset.typid);
        toast('Gelöscht');
        const updated = await api.getTerminTypen();
        document.getElementById('typen-list').innerHTML = renderTypenList(updated);
        bindTypenDeleteActions();
      } catch (e) { toast(e.message, 'error'); }
    });
  });
}
