import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

const GESCHLECHT_LABELS = {
  männlich: 'männlich',
  weiblich: 'weiblich',
  divers: 'divers',
};

const ANWERTER_STATUS_LABELS = {
  aktiv: 'Aktiv',
  aufgenommen: 'Aufgenommen',
  abgemeldet: 'Abgemeldet',
  archiviert: 'Archiviert',
};

function formatDatumDeutsch(iso) {
  if (!iso) return '-';
  const parts = iso.slice(0, 10).split('-');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

function formatTimeDeutsch(t) {
  if (!t) return '';
  return t.slice(0, 5);
}

async function setupPage(activeNavPage) {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell(activeNavPage || 'jugendfeuerwehr');

  const perms = user?.permissions || [];
  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
  const state = {
    user,
    isAdmin,
    canReadMitglieder: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.mitglieder.lesen') || perms.includes('jugendfeuerwehr.lesen'),
    canWriteMitglieder: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.mitglieder'),
    canCreateAnwerter: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.anwerter'),
    canWriteAnwerter: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.anwerter'),
    canWriteDienstteilnahmen: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.dienstteilnahmen'),
    canReadKleiderkammer: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.kleiderkammer.lesen') || perms.includes('jugendfeuerwehr.lesen'),
    canWriteKleiderkammer: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.kleiderkammer'),
    canWriteMitgliedschaftsvorgaerge: isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.mitgliedschaftsvorgaerge'),
  };
  return { settings, state, container: document.getElementById('page-content') };
}

function renderHeader(container, title, subtitle) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h2>${title}</h2>
        <p>${subtitle}</p>
      </div>
    </div>
  `;
}

export async function renderJugendfeuerwehrMitglieder() {
  const { container, state } = await setupPage('jugendfeuerwehr');
  renderHeader(container, 'Jugendfeuerwehrmitglieder', 'Jugendfeuerwehrmitglieder verwalten und archivieren');

  container.innerHTML += `
    <div class="jugend-tabs">
      <button class="tab-btn active" data-tab="aktiv">Aktiv</button>
      <button class="tab-btn" data-tab="archiviert">Archiviert</button>
    </div>
    <div id="tab-content"></div>
  `;

  container.querySelectorAll('.jugend-tabs .tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      container.querySelectorAll('.jugend-tabs .tab-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderMitgliederTab(b.dataset.tab, state);
    });
  });

  renderMitgliederTab('aktiv', state);
  renderIcons(container);
}

async function renderMitgliederTab(tab, state) {
  const c = document.getElementById('tab-content');
  const canRead = state.canReadMitglieder;
  const canWrite = state.canWriteMitglieder;

  c.innerHTML = `
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
      <button class="btn btn--primary" id="btn-new-mitglied" ${canWrite ? '' : 'style="display:none;"'}>Neues Mitglied</button>
    </div>
    <div id="mitglieder-list"></div>
    <div id="mitglied-form" style="display:none"></div>
  `;

  if (!canRead) {
    c.innerHTML += '<p style="color:#c00;margin-top:12px">Keine Berechtigung zum Einsehen von Mitgliederdaten.</p>';
    if (canWrite) document.getElementById('btn-new-mitglied').addEventListener('click', () => showMemberForm(null, state));
    return;
  }

  let mitglieder;
  if (tab === 'archiviert') {
    try { mitglieder = await api.getJugendmitgliederArchiviert(); } catch { mitglieder = []; }
  } else {
    try { mitglieder = await api.getJugendmitglieder(); } catch { mitglieder = []; }
  }

  if (!mitglieder.length) {
    c.innerHTML += `
      <div class="empty-state">
        <span class="icon icon--large">👦</span>
        <p>${tab === 'archiviert' ? 'Keine archivierten Mitglieder vorhanden' : 'Keine Jugendfeuerwehrmitglieder vorhanden'}</p>
        ${canWrite ? '<button class="btn btn--primary" id="btn-new-mid-empty">Neues Mitglied</button>' : ''}
      </div>`;
    if (canWrite) {
      document.getElementById('btn-new-mid-empty')?.addEventListener('click', () => showMemberForm(null, state));
      document.getElementById('btn-new-mitglied').addEventListener('click', () => showMemberForm(null, state));
    }
    return;
  }

  c.innerHTML += `
    <table class="jugend-table">
      <thead>
        <tr>
          <th>Vorname</th><th>Nachname</th><th>Geburt</th><th>Alter</th><th>Eintritt</th><th>Austritt</th>
          <th>Geschlecht</th><th>Telefon</th><th>E-Mail</th><th>Juleica</th><th>Status</th><th>Aktionen</th>
        </tr>
      </thead>
      <tbody>
        ${mitglieder.map((m, idx) => {
          const arch = m.archiviert;
          return `
          <tr class="jugend-row ${!canWrite ? 'jugend-row--readonly' : ''}" style="animation-delay:${idx * 0.06}s">
            <td class="jugend-vorname"><strong>${esc(m.vorname || '')}</strong></td>
            <td class="jugend-nachname">${esc(m.nachname || '')}</td>
            <td class="jugend-geburtsdatum">${formatDatumDeutsch(m.geburtsdatum)}</td>
            <td class="jugend-alter">${m.alter_jahre ?? '-'}</td>
            <td class="jugend-eintritt">${formatDatumDeutsch(m.eintrittsdatum)}</td>
            <td class="jugend-austritt">${m.austrittsdatum ? formatDatumDeutsch(m.austrittsdatum) : '–'}</td>
            <td class="jugend-geschlecht">${GESCHLECHT_LABELS[m.geschlecht] || esc(m.geschlecht)}</td>
            <td class="jugend-telefon">${m.telefon || '–'}</td>
            <td class="jugend-email">${m.email || '–'}</td>
            <td class="jugend-juleica">${m.juleica ? '✓' : '–'}</td>
            <td class="jugend-status">${arch ? 'Archiviert' : 'Aktiv'}</td>
            <td class="jugend-actions">
              <button class="btn btn--small btn--primary view-mitglied" data-id="${m.id}">Details</button>
              ${canWrite ? `
                <button class="btn btn--small btn--info edit-mitglied" data-id="${m.id}">Bearbeiten</button>
                <button class="btn btn--small btn--danger delete-mitglied" data-id="${m.id}">${arch ? 'Wiederherstellen' : 'Archivieren'}</button>
              ` : ''}
            </td>
          </tr>`;
        }).join('')}
      </tbody>
    </table>
  `;

  const tbody = c.querySelector('.jugend-table tbody');
  tbody?.querySelectorAll('.view-mitglied').forEach(b => {
    b.addEventListener('click', async () => {
      try { showMemberDetail(await api.getJugendmitglied(b.dataset.id)); }
      catch (e) { toast(e.message, 'error'); }
    });
  });
  if (canWrite) {
    tbody?.querySelectorAll('.edit-mitglied').forEach(b => {
      b.addEventListener('click', () => showMemberForm(mitglieder.find(x => x.id === b.dataset.id), state));
    });
    tbody?.querySelectorAll('.delete-mitglied').forEach(b => {
      b.addEventListener('click', async () => {
        const m = mitglieder.find(x => x.id === b.dataset.id);
        if (m.archiviert) {
          if (!confirm(`Mitglied "${m.name}" wiederherstellen?`)) return;
          try {
            await api.updateJugendmitglied(m.id, { archiviert: false });
            toast('Mitglied wiederhergestellt', 'success');
            renderMitgliederTab(tab, state);
          } catch (e) { toast(e.message, 'error'); }
        } else {
          if (!confirm(`Mitglied "${m.name}" wirklich archivieren?`)) return;
          try {
            await api.deleteJugendmitglied(m.id);
            toast('Mitglied archiviert', 'success');
            renderMitgliederTab(tab, state);
          } catch (e) { toast(e.message, 'error'); }
        }
      });
    });
  }

  if (canWrite) document.getElementById('btn-new-mitglied').addEventListener('click', () => showMemberForm(null, state));
}

// ── Mitglieder-Formular (Neu/Bearbeiten) ──────────────────────────────────────

async function showMemberForm(m = null, state = null) {
  const c = document.getElementById('tab-content');
  const list = document.getElementById('mitglieder-list');
  if (!c) return;
  if (list) list.style.display = 'none';

  const isEdit = !!m;

  // Determine current archiviert status for the Status dropdown
  const currentArchiviert = m?.archiviert ? true : false;

  c.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${isEdit ? 'Mitglied bearbeiten' : 'Neues Mitglied'}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-member">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="member-form-el" class="form-grid">
          <div class="form-group form-group--half">
            <label>Vorname <span class="required">*</span></label>
            <input type="text" id="fld-vorname" placeholder="Vorname" value="${m ? esc(m.vorname || m.name?.split(' ')[0] || '') : ''}" required maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Nachname <span class="required">*</span></label>
            <input type="text" id="fld-nachname" placeholder="Nachname" value="${m ? esc(m.nachname || m.name?.split(' ').slice(1).join(' ') || '') : ''}" required maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Geburtsdatum <span class="required">*</span></label>
            <input type="date" id="fld-geburtsdatum" value="${m ? m.geburtsdatum : ''}" required />
          </div>
          <div class="form-group form-group--half">
            <label>Eintrittsdatum <span class="required">*</span></label>
            <input type="date" id="fld-eintrittsdatum" value="${m ? m.eintrittsdatum : ''}" required />
          </div>
          <div class="form-group form-group--half">
            <label>Austrittsdatum</label>
            <input type="date" id="fld-austrittsdatum" value="${m ? (m.austrittsdatum || '') : ''}" />
          </div>
          <div class="form-group form-group--half">
            <label>Status <span class="required">*</span></label>
            <select id="fld-status" required>
              <option value="false" ${currentArchiviert === false ? 'selected' : ''}>Aktiv</option>
              <option value="true" ${currentArchiviert === true ? 'selected' : ''}>Archiviert</option>
            </select>
          </div>
          <div class="form-group form-group--half">
            <label>Geschlecht <span class="required">*</span></label>
            <select id="fld-geschlecht" required>
              <option value="männlich" ${m && m.geschlecht === 'männlich' ? 'selected' : ''}>männlich</option>
              <option value="weiblich" ${m && m.geschlecht === 'weiblich' ? 'selected' : ''}>weiblich</option>
              <option value="divers" ${m && m.geschlecht === 'divers' ? 'selected' : ''}>divers</option>
            </select>
          </div>
          <div class="form-group form-group--full">
            <label>Adresse <span class="required">*</span></label>
            <input type="text" id="fld-adresse" placeholder="Straße, Hausnummer, PLZ, Ort" value="${m ? esc(m.adresse || '') : ''}" maxlength="200" required />
          </div>
          <div class="form-group form-group--half">
            <label>Telefon</label>
            <input type="tel" id="fld-telefon" placeholder="Telefonnummer" value="${m ? esc(m.telefon || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>E-Mail</label>
            <input type="email" id="fld-email" placeholder="E-Mail-Adresse" value="${m ? esc(m.email || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--full">
            <label>Eltern / Erziehungsberechtigte – Name 1 <span class="required">*</span></label>
            <input type="text" id="fld-eltern-name" placeholder="Name" value="${m ? esc(m.eltern_name || '') : ''}" required maxlength="200" />
          </div>
          <div class="form-group form-group--full">
            <label>Eltern / Erziehungsberechtigte – Name 2</label>
            <input type="text" id="fld-eltern-name-2" placeholder="Name" value="${m ? esc(m.eltern_name_2 || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Eltern 2 – Telefon</label>
            <input type="tel" id="fld-eltern-telefon-2" placeholder="Telefonnummer" value="${m ? esc(m.eltern_telefon_2 || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>Eltern 2 – E-Mail</label>
            <input type="email" id="fld-eltern-email-2" placeholder="E-Mail-Adresse" value="${m ? esc(m.eltern_email_2 || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Eltern – Telefon</label>
            <input type="tel" id="fld-eltern-telefon" placeholder="Telefonnummer" value="${m ? esc(m.eltern_telefon || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>Eltern – E-Mail</label>
            <input type="email" id="fld-eltern-email" placeholder="E-Mail-Adresse" value="${m ? esc(m.eltern_email || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Juleica</label>
            <input type="checkbox" id="fld-juleica" ${m && m.juleica ? 'checked' : ''} />
          </div>
          <div class="form-group form-group--half">
            <label>Juleica gültig bis</label>
            <input type="date" id="fld-juleica-ablauf" value="${m ? (m.juleica_ablauf || '') : ''}" />
          </div>
          <div class="form-group form-group--full">
            <label>Bemerkung</label>
            <textarea id="fld-bemerkung" rows="3" placeholder="Bemerkungen">${m ? esc(m.bemerkung || '') : ''}</textarea>
          </div>
          <div class="form-group form-group--full" style="margin-top:12px">
            <button type="submit" class="btn btn--primary">${isEdit ? 'Speichern' : 'Anlegen'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel-member').addEventListener('click', () => {
    c.innerHTML = '';
    if (list) list.style.display = '';
  });

  document.getElementById('member-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();
    const vorname = document.getElementById('fld-vorname').value.trim();
    const nachname = document.getElementById('fld-nachname').value.trim();
    if (!vorname || !nachname) { toast('Vorname und Nachname sind Pflichtfelder', 'error'); return; }
    const geburtsdatum = document.getElementById('fld-geburtsdatum').value;
    const eintrittsdatum = document.getElementById('fld-eintrittsdatum').value;
    if (!geburtsdatum || !eintrittsdatum) { toast('Geburts- und Eintrittsdatum sind Pflichtfelder', 'error'); return; }
    const geschlecht = document.getElementById('fld-geschlecht').value;
    if (!geschlecht) { toast('Geschlecht ist ein Pflichtfeld', 'error'); return; }
    const status = document.getElementById('fld-status').value;
    const adresse = document.getElementById('fld-adresse').value.trim();
    if (!adresse) { toast('Adresse ist ein Pflichtfeld', 'error'); return; }
    const elternName = document.getElementById('fld-eltern-name').value.trim();
    if (!elternName) { toast('Eltern / Erziehungsberechtigte – Name (1) ist ein Pflichtfeld', 'error'); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (geburtsdatum > today) { toast('Geburtsdatum darf nicht in der Zukunft liegen', 'error'); return; }

    const body = {
      vorname,
      nachname,
      geburtsdatum,
      eintrittsdatum,
      austrittsdatum: document.getElementById('fld-austrittsdatum').value || null,
      geschlecht,
      adresse,
      telefon: document.getElementById('fld-telefon').value || null,
      email: document.getElementById('fld-email').value || null,
      eltern_name: elternName,
      eltern_name_2: document.getElementById('fld-eltern-name-2').value.trim() || null,
      eltern_telefon: document.getElementById('fld-eltern-telefon').value || null,
      eltern_email: document.getElementById('fld-eltern-email').value || null,
      eltern_telefon_2: document.getElementById('fld-eltern-telefon-2').value || null,
      eltern_email_2: document.getElementById('fld-eltern-email-2').value || null,
      juleica: document.getElementById('fld-juleica').checked,
      juleica_ablauf: document.getElementById('fld-juleica-ablauf').value || null,
      bemerkung: document.getElementById('fld-bemerkung').value || null,
      archiviert: status === 'true',
    };

    try {
      if (isEdit) {
        await api.updateJugendmitglied(m.id, body);
        toast('Mitglied aktualisiert', 'success');
      } else {
        await api.createJugendmitglied(body);
        toast('Mitglied angelegt', 'success');
      }
      const tab = document.querySelector('.jugend-tabs .tab-btn.active')?.dataset.tab || 'aktiv';
      window.__jfMitgliederState = state;
      c.innerHTML = '';
      if (list) list.style.display = '';
      await renderMitgliederTab(tab, state);
    } catch (e) {
      toast(e.message || 'Fehler beim Speichern', 'error');
    }
  });
}

// ── Mitglieder-Details-Overlay ───────────────────────────────────────────────

async function showMemberDetail(m) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal modal--md">
      <div class="modal__header">
        <h3>${esc(m.vorname || '')} ${esc(m.nachname || '')}</h3>
        <button class="modal__close" aria-label="Schließen">✕</button>
      </div>
      <div class="modal__body">
        <dl class="feld">
          <dt>Vorname</dt><dd>${esc(m.vorname || '-')}</dd>
          <dt>Nachname</dt><dd>${esc(m.nachname || '-')}</dd>
          <dt>Geburtsdatum</dt><dd>${formatDatumDeutsch(m.geburtsdatum)}</dd>
          <dt>Alter</dt><dd>${m.alter_jahre ?? '-'} Jahre</dd>
          <dt>Eintritt</dt><dd>${formatDatumDeutsch(m.eintrittsdatum)}</dd>
          <dt>Austritt</dt><dd>${m.austrittsdatum ? formatDatumDeutsch(m.austrittsdatum) : '–'}</dd>
          <dt>Geschlecht</dt><dd>${GESCHLECHT_LABELS[m.geschlecht] || m.geschlecht}</dd>
          ${m.adresse ? `<dt>Adresse</dt><dd>${esc(m.adresse)}</dd>` : ''}
          ${m.telefon ? `<dt>Telefon</dt><dd>${esc(m.telefon)}</dd>` : ''}
          ${m.email ? `<dt>E-Mail</dt><dd>${esc(m.email)}</dd>` : ''}
          ${m.eltern_name ? `<dt>Erziehungsberechtigte 1 (Name)</dt><dd>${esc(m.eltern_name)}</dd>` : ''}
          ${m.eltern_name_2 ? `<dt>Erziehungsberechtigte 2 (Name)</dt><dd>${esc(m.eltern_name_2)}</dd>` : ''}
          ${m.eltern_telefon ? `<dt>Erziehungsberechtigte 1 (Telefon)</dt><dd>${esc(m.eltern_telefon)}</dd>` : ''}
          ${m.eltern_email ? `<dt>Erziehungsberechtigte 1 (E-Mail)</dt><dd>${esc(m.eltern_email)}</dd>` : ''}
          ${m.eltern_telefon_2 ? `<dt>Erziehungsberechtigte 2 (Telefon)</dt><dd>${esc(m.eltern_telefon_2)}</dd>` : ''}
          ${m.eltern_email_2 ? `<dt>Erziehungsberechtigte 2 (E-Mail)</dt><dd>${esc(m.eltern_email_2)}</dd>` : ''}
          <dt>Juleica</dt><dd>${m.juleica ? 'Ja' : 'Nein'}${m.juleica_ablauf ? ` (gültig bis ${formatDatumDeutsch(m.juleica_ablauf)})` : ''}</dd>
          ${m.bemerkung ? `<dt>Bemerkung</dt><dd>${esc(m.bemerkung)}</dd>` : ''}
          <dt>Status</dt><dd>${m.archiviert ? 'Archiviert' : 'Aktiv'}</dd>
        </dl>
      </div>
      <div class="modal__footer">
        <button class="btn btn--outline" id="btn-vorgaenge">${icon('history', 14)} Mitgliedschaftsvorgänge</button>
        <button class="btn btn--outline" id="btn-close-mitglied">Schließen</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  // Show modal by adding active class (triggers CSS display:flex)
  requestAnimationFrame(() => overlay.classList.add('active'));

  const closeModal = () => {
    overlay.classList.remove('active');
    setTimeout(() => overlay.remove(), 150); // wait for transition
  };

  overlay.querySelectorAll('.modal__close').forEach(btn => btn.addEventListener('click', closeModal));
  // Close on backdrop click
  overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });
  document.getElementById('btn-close-mitglied')?.addEventListener('click', closeModal);
  document.getElementById('btn-vorgaenge')?.addEventListener('click', () => {
    closeModal();
    showVorgaenge(m.id);
  });
}

// ── Seiten: Anwärter ──────────────────────────────────────────────────────────

window.__jfAnwerterState = window.__jfAnwerterState || {};

export async function renderJugendfeuerwehrAnwerter() {
  const { container, state } = await setupPage('jugendfeuerwehr');
  renderHeader(container, 'Anwärter', 'Anwärter verwalten und bewerben');

  container.innerHTML += `
    <div class="jugend-tabs">
      <button class="tab-btn active" data-tab="aktiv">Aktiv</button>
      <button class="tab-btn" data-tab="archiviert">Archiviert</button>
    </div>
    <div id="tab-content"></div>
  `;

  container.querySelectorAll('.jugend-tabs .tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      container.querySelectorAll('.jugend-tabs .tab-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderAnwerterTab(b.dataset.tab, state);
    });
  });

  renderAnwerterTab('aktiv', state);
  renderIcons(container);
}

async function renderAnwerterTab(tab, state) {
  const c = document.getElementById('tab-content');
  const canWrite = state.canWriteAnwerter;
  const canCreate = state.canCreateAnwerter;

  c.innerHTML = `
    <div style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap">
      ${canCreate ? '<button class="btn btn--primary" id="btn-new-anwerter">Neuen Anwärter anlegen</button>' : ''}
    </div>
    <div id="anwerter-list"></div>
  `;

  let anwaeter;
  try {
    anwaeter = tab === 'archiviert' ? await api.getAnwaeterArchiviert() : await api.getAnwaeter();
  } catch { anwaeter = []; }

  if (!anwaeter.length) {
    c.insertAdjacentHTML('beforeend', `
      <div class="card">
        <div class="card__header">
          <span class="icon">👦</span>
          <span>Keine Anwärter vorhanden</span>
        </div>
        <div class="card__body">
          <p style="text-align:center;color:var(--text-muted);font-style:italic;margin:0 0 16px 0">
            Noch keine Anwärter angelegt. Lege einen neuen Anwärter an.
          </p>
          <div style="text-align:center">
            ${canCreate ? '<button class="btn btn--primary" id="btn-new-anw-empty">Neuen Anwärter anlegen</button>' : ''}
          </div>
        </div>
      </div>`);
    if (canCreate) {
      document.getElementById('btn-new-anwerter')?.addEventListener('click', () => showAnwerterForm());
      document.getElementById('btn-new-anw-empty')?.addEventListener('click', () => showAnwerterForm());
    }
    return;
  }

  c.innerHTML += `
    <div style="margin-top:12px">
      <table class="jugend-table">
        <thead>
          <tr><th>Vorname</th><th>Nachname</th><th>Geburt</th><th>Alter</th><th>Eintritt</th><th>Status</th><th>Aktionen</th></tr>
        </thead>
        <tbody>
          ${anwaeter.map(a => `
          <tr data-id="${a.id}">
            <td class="jugend-vorname"><strong>${a.vorname || ''}</strong></td>
            <td class="jugend-nachname">${a.nachname || ''}</td>
            <td class="jugend-geburtsdatum">${formatDatumDeutsch(a.geburtsdatum)}</td>
            <td class="jugend-alter">${a.alter_jahre ?? '-'}</td>
            <td class="jugend-eintritt">${formatDatumDeutsch(a.eintrittsdatum)}</td>
            <td class="jugend-status"><span class="badge badge--${a.status === 'archiviert' ? 'danger' : a.status === 'abgemeldet' ? 'warning' : 'success'}">${ANWERTER_STATUS_LABELS[a.status] || esc(a.status)}</span></td>
            <td class="jugend-actions">
              ${canWrite ? `
                <button class="btn btn--small btn--info edit-anwerter" data-id="${a.id}">Bearbeiten</button>
                <button class="btn btn--small btn--danger archive-anwerter" data-id="${a.id}">${a.status === 'archiviert' ? 'Wiederherstellen' : 'Archivieren'}</button>
              ` : ''}
              <button class="btn btn--small btn--secondary view-anwerter" data-id="${a.id}">Dienstteilnahmen</button>
            </td>
          </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;

  window.__jfAnwerterState = { tab, state, list };

  const wrap = c.querySelector('.jugend-table tbody');
  wrap?.querySelectorAll('.view-anwerter').forEach(b => {
    b.addEventListener('click', () => renderAnwerterDienstteilnahmen(b.dataset.id, state));
  });
  if (canWrite) {
    wrap?.querySelectorAll('.edit-anwerter').forEach(b => {
      b.addEventListener('click', () => showAnwerterForm(anwaeter.find(x => x.id === b.dataset.id)));
    });
    wrap?.querySelectorAll('.archive-anwerter').forEach(b => {
      b.addEventListener('click', async () => {
        const a = anwaeter.find(x => x.id === b.dataset.id);
        if (a.status === 'archiviert') {
          if (!confirm(`Anwerter "${a.name}" wiederherstellen?`)) return;
          try { await api.updateAnwerter(a.id, { status: 'aktiv' }); toast('Wiederhergestellt', 'success'); renderAnwerterTab(tab, state); }
          catch (e) { toast(e.message, 'error'); }
        } else {
          if (!confirm(`Anwerter "${a.name}" wirklich archivieren?`)) return;
          try { await api.updateAnwerter(a.id, { status: 'archiviert' }); toast('Archiviert', 'success'); renderAnwerterTab(tab, state); }
          catch (e) { toast(e.message, 'error'); }
        }
      });
    });
  }

  // Listener nach allen innerHTML += Operationen anhängen (damit er nicht zerstört wird)
  if (canCreate) document.getElementById('btn-new-anwerter')?.addEventListener('click', () => showAnwerterForm());
}

async function showAnwerterForm(a = null) {
  const c = document.getElementById('tab-content');
  if (!c) return;
  const isEdit = !!a;

  // Determine current archiviert status for the Status dropdown
  const currentArchiviert = a?.status === 'archiviert' ? true : false;

  c.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${isEdit ? 'Anwärter bearbeiten' : 'Neuen Anwärter anlegen'}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-anwerter">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="anwerter-form-el" class="form-grid">
          <div class="form-group form-group--half">
            <label>Vorname <span class="required">*</span></label>
            <input type="text" id="fld-a-vorname" placeholder="Vorname" value="${a ? esc(a.vorname || '') : ''}" required maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Nachname <span class="required">*</span></label>
            <input type="text" id="fld-a-nachname" placeholder="Nachname" value="${a ? esc(a.nachname || '') : ''}" required maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Geburtstag <span class="required">*</span></label>
            <input type="date" id="fld-a-geburtsdatum" value="${a ? a.geburtsdatum : ''}" required />
          </div>
          <div class="form-group form-group--full">
            <label>Straße Hausnummer</label>
            <input type="text" id="fld-a-adresse" placeholder="Straße, Hausnummer, PLZ, Ort" value="${a ? esc(a.adresse || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>PLZ</label>
            <input type="text" id="fld-a-plz" placeholder="PLZ" value="${a ? a.plz || '' : ''}" maxlength="10" />
          </div>
          <div class="form-group form-group--half">
            <label>Ort</label>
            <input type="text" id="fld-a-ort" placeholder="Ort" value="${a ? a.ort || '' : ''}" maxlength="100" />
          </div>
          <div class="form-group form-group--half">
            <label>Ortsteil</label>
            <input type="text" id="fld-a-ortsteil" placeholder="Ortsteil" value="${a ? a.ortsteil || '' : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>Telefonnummer <span class="required">*</span></label>
            <input type="tel" id="fld-a-telefonnummer" placeholder="Telefonnummer" value="${a ? esc(a.telefon || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>E-Mail <span class="required">*</span></label>
            <input type="email" id="fld-a-email" placeholder="E-Mail-Adresse" value="${a ? esc(a.email || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--full">
            <label>Name des Erziehungsberechtigten</label>
            <input type="text" id="fld-a-eltern-vorname" placeholder="Name" value="${a ? esc(a.eltern_vorname || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Telefonnummer Erziehungsberechtigten</label>
            <input type="tel" id="fld-a-eltern-telefon" placeholder="Telefonnummer" value="${a ? esc(a.eltern_telefonnummer || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>Datum Erstkontakt</label>
            <input type="date" id="fld-a-erstkontakt" value="${a ? (a.erstkontakt || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10)}" />
          </div>
          <div class="form-group form-group--half">
            <label>Status</label>
            <select id="fld-a-status">
              <option value="aktiv" ${a && a.status === 'aktiv' ? 'selected' : ''} selected>Aktiv</option>
              <option value="archiviert" ${a && a.status === 'archiviert' ? 'selected' : ''}>Archiviert</option>
            </select>
          </div>
          <div class="form-group form-group--full" style="margin-top:12px">
            <button type="submit" class="btn btn--primary">${isEdit ? 'Speichern' : 'Anlegen'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel-anwerter').addEventListener('click', () => {
    c.innerHTML = '';
  });

  document.getElementById('anwerter-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();

    const vorname = document.getElementById('fld-a-vorname').value.trim();
    const nachname = document.getElementById('fld-a-nachname').value.trim();
    if (!vorname || !nachname) { toast('Vorname und Nachname sind Pflichtfelder', 'error'); return; }
    const geburtsdatum = document.getElementById('fld-a-geburtsdatum').value;
    if (!geburtsdatum) { toast('Geburtsdatum ist ein Pflichtfeld', 'error'); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (geburtsdatum > today) { toast('Geburtsdatum darf nicht in der Zukunft liegen', 'error'); return; }
    const telefon = document.getElementById('fld-a-telefonnummer').value.trim();
    if (!telefon) { toast('Telefonnummer ist ein Pflichtfeld', 'error'); return; }
    const email = document.getElementById('fld-a-email').value.trim();
    if (!email) { toast('E-Mail-Adresse ist ein Pflichtfeld', 'error'); return; }

    const body = {
      vorname,
      nachname,
      geburtsdatum,
      plz: document.getElementById('fld-a-plz').value.trim() || null,
      ort: document.getElementById('fld-a-ort').value.trim() || null,
      ortsteil: document.getElementById('fld-a-ortsteil').value.trim() || null,
      adresse: document.getElementById('fld-a-adresse').value.trim() || null,
      telefon,
      email,
      eltern_vorname: document.getElementById('fld-a-eltern-vorname').value.trim() || null,
      eltern_telefonnummer: document.getElementById('fld-a-eltern-telefon').value || null,
      erstkontakt: document.getElementById('fld-a-erstkontakt').value || null,
      status: document.getElementById('fld-a-status').value || 'aktiv',
    };

    try {
      if (isEdit) {
        await api.updateAnwerter(a.id, body);
        toast('Anwärter aktualisiert', 'success');
      } else {
        await api.createAnwerter(body);
        toast('Anwärter angelegt', 'success');
      }
      c.innerHTML = '';
      const { tab, state } = window.__jfAnwerterState || {};
      if (tab) renderAnwerterTab(tab, state);
    } catch (e) { toast(e.message || 'Fehler beim Speichern', 'error'); }
  });
}

// ── Anwärter → Dienstteilnahmen ───────────────────────────────────────────────

async function renderAnwerterDienstteilnahmen(anwerterId, state) {
  const c = document.getElementById('tab-content');
  try {
    const [anwerter, teilnahmen] = await Promise.all([
      api.getAnwerter(anwerterId),
      api.getDienstteilnahmen(anwerterId),
    ]);

    let rows = teilnahmen.map(t => `
      <tr>
        <td class="jugend-geburtsdatum">${formatDatumDeutsch(t.datum)}</td>
        <td class="jugend-name">${esc(t.termin_bezeichnung)}</td>
        <td class="jugend-alter">${t.zeit_von ? formatTimeDeutsch(t.zeit_von) : '–'} – ${t.zeit_bis ? formatTimeDeutsch(t.zeit_bis) : '–'}</td>
        <td class="jugend-status"><span class="badge badge--${t.status === 'bestätigt' ? 'success' : t.status === 'abwesend' ? 'danger' : 'warning'}">${esc(t.status)}</span></td>
        <td class="jugend-bemerkung">${esc(t.bemerkung || '')}</td>
      </tr>
    `).join('');

    c.innerHTML = `
      <div style="margin-top:12px">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
          <h3 style="margin:0;font-size:1.1rem">Dienstteilnahmen – ${esc(anwerter.vorname || '')} ${esc(anwerter.nachname || '')}</h3>
          ${state.canWriteDienstteilnahmen ? `<button class="btn btn--primary btn--sm" id="btn-new-teilnahme">Neue Teilnahme</button>` : ''}
        </div>
        <table class="jugend-table">
          <thead><tr><th>Datum</th><th>Termin</th><th>Zeit</th><th>Status</th><th>Bemerkung</th></tr></thead>
          <tbody>${teilnahmen.length ? rows : '<tr><td colspan="5" class="wrap-loading">Keine Dienstteilnahmen vorhanden</td></tr>'}</tbody>
        </table>
      </div>
    `;

    if (state.canWriteDienstteilnahmen) {
      document.getElementById('btn-new-teilnahme').addEventListener('click', () => showDienstteilnahmeForm(anwerterId, state));
    }
  } catch (e) {
    c.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
  }
}

async function showDienstteilnahmeForm(anwerterId, state) {
  const c = document.getElementById('tab-content');
  c.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>Neue Dienstteilnahme</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-teilnahme">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="teilnahme-form-el" class="form-grid">
          <div class="form-group form-group--full">
            <label>Termin-Bezeichnung <span class="required">*</span></label>
            <input type="text" id="fld-t-bezeichnung" placeholder="z.B. Wachenstellung" required maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Datum <span class="required">*</span></label>
            <input type="date" id="fld-t-datum" required />
          </div>
          <div class="form-group form-group--half">
            <label>Zeit von</label>
            <input type="time" id="fld-t-von" />
          </div>
          <div class="form-group form-group--half">
            <label>Zeit bis</label>
            <input type="time" id="fld-t-bis" />
          </div>
          <div class="form-group form-group--full">
            <label>Status</label>
            <select id="fld-t-status">
              <option value="bestätigt">Bestätigt</option>
              <option value="abwesend">Abwesend</option>
              <option value="abgemeldet">Abgemeldet</option>
            </select>
          </div>
          <div class="form-group form-group--full">
            <label>Bemerkung</label>
            <textarea id="fld-t-bemerkung" rows="3"></textarea>
          </div>
          <div class="form-group form-group--full" style="margin-top:12px">
            <button type="submit" class="btn btn--primary">Anlegen</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel-teilnahme').addEventListener('click', () => {
    renderAnwerterDienstteilnahmen(anwerterId, state);
  });

  document.getElementById('teilnahme-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();
    const termin_bezeichnung = document.getElementById('fld-t-bezeichnung').value.trim();
    if (!termin_bezeichnung) { toast('Termin-Bezeichnung ist ein Pflichtfeld', 'error'); return; }
    const datum = document.getElementById('fld-t-datum').value;
    if (!datum) { toast('Datum ist ein Pflichtfeld', 'error'); return; }

    try {
      await api.createDienstteilnahme(anwerterId, {
        termin_bezeichnung,
        datum,
        zeit_von: document.getElementById('fld-t-von').value || null,
        zeit_bis: document.getElementById('fld-t-bis').value || null,
        bemerkung: document.getElementById('fld-t-bemerkung').value || null,
        status: document.getElementById('fld-t-status').value || null,
      });
      toast('Dienstteilnahme angelegt', 'success');
      renderAnwerterDienstteilnahmen(anwerterId, state);
} catch (e) { toast(e.message || 'Fehler beim Anlegen', 'error'); }
  });
}

// ── Mitgliedschaftsvorgänge (Modal) ───────────────────────────────────────────

async function showVorgaenge(mitgliedId) {
  try {
    const vorgaenge = await api.getMitgliedschaftsvorgaenge(mitgliedId);
    const overlay = document.querySelector('.modal-overlay');
    if (overlay) {
      const box = document.createElement('div');
      box.style.marginTop = '16px';
      box.innerHTML = `
        <hr style="margin:16px 0;border:none;height:1px;background:var(--border);">
        <p style="font-weight:600;margin-bottom:8px">Mitgliedschaftsvorgaenge</p>
        <table style="width:100%;border-collapse:collapse;font-size:0.85rem">
          <thead><tr><th>Datum</th><th>Typ</th><th>Grund</th></tr></thead>
          <tbody>
            ${vorgaenge.map(v => `<tr>
              <td>${formatDatumDeutsch(v.datum)}</td>
              <td>${esc(v.typ)}</td>
              <td>${esc(v.grund || '')}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      `;
      overlay.querySelector('.modal__body').appendChild(box);
    }
  } catch (e) {
    toast(e.message, 'error');
  }
}

// ── Seiten: Kleiderkammer ─────────────────────────────────────────────────────

export async function renderJugendfeuerwehrKleiderkammer() {
  const { container, state } = await setupPage('jugendfeuerwehr');
  renderHeader(container, 'Kleiderkammer', 'Lagerartikel verwalten und Kleidung ausgeben');

  container.innerHTML += `
    <div class="jugend-tabs" style="margin-bottom:0">
      <button class="tab-btn active" data-ktab="bekleidung">Bekleidung</button>
      <button class="tab-btn" data-ktab="lager">Lager</button>
      <button class="tab-btn" data-ktab="ausgaben">Ausgaben &amp; R&uuml;ckgaben</button>
      <button class="tab-btn" data-ktab="bestellungen">Bestellte Artikel</button>
    </div>
    <div id="ktab-content" style="margin-top:12px"></div>
  `;

  container.querySelectorAll('.jugend-tabs .tab-btn').forEach(b => {
    b.addEventListener('click', () => {
      container.querySelectorAll('.jugend-tabs .tab-btn').forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      renderKleiderkammerSubtab(b.dataset.ktab, state);
    });
  });

  window.__jfKleiderState = state;
  renderKleiderkammerSubtab('bekleidung', state);
  renderIcons(container);
}

async function renderKleiderkammerSubtab(subtab, state) {
  const container = document.getElementById('ktab-content');
  if (subtab === 'bekleidung') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:1.1rem">Stammdaten</h3>
        ${state.canWriteKleiderkammer ? '<button class="btn btn--primary btn--sm" id="btn-new-artikel">Neuen Stammartikel anlegen</button>' : ''}
      </div>
      <table class="jugend-table" style="width:100%">
        <thead>
          <tr><th>Name</th><th>Beschreibung</th><th>Größen</th><th>Bestand</th><th>Einheit</th><th>Aktionen</th></tr>
        </thead>
        <tbody id="artikel-list">
          <tr><td colspan="6" class="wrap-loading">Lade...</td></tr>
        </tbody>
      </table>
    `;

    try {
      const artikel = await api.getLagerartikel();
      const tbody = document.getElementById('artikel-list');
      if (!artikel.length) {
        tbody.innerHTML = `<tr><td colspan="6" class="wrap-loading">Keine Stammartikel vorhanden</td></tr>`;
      } else {
        tbody.innerHTML = artikel.map(a => {
          const groessen = Array.isArray(a.groessen) ? a.groessen : [];
          const mengePerGroesse = (a.menge_per_groesse && typeof a.menge_per_groesse === 'object') ? a.menge_per_groesse : {};
          const groessenHtml = groessen.length
            ? groessen.map(g => `${g}: ${mengePerGroesse[g] ?? 0}`).join(', ')
            : '–';
          return `
          <tr data-id="${a.id}">
            <td class="jugend-name"><strong>${esc(a.name)}</strong></td>
            <td class="jugend-bemerkung">${esc(a.beschreibung || '-')}</td>
            <td class="jugend-groessen">${esc(groessenHtml)}</td>
            <td><strong>${a.menge}</strong></td>
            <td>${a.einheit || 'St&uuml;ck'}</td>
            <td class="jugend-actions">
              ${state.canWriteKleiderkammer ? `
                <button class="btn btn--small btn--info edit-artikel" data-id="${a.id}">Bearbeiten</button>
                <button class="btn btn--small btn--danger delete-artikel" data-id="${a.id}">L&ouml;schen</button>
              ` : ''}
            </td>
          </tr>`;
        }).join('');
        renderIcons(tbody);
      }
      if (state.canWriteKleiderkammer) {
        document.getElementById('btn-new-artikel')?.addEventListener('click', () => showLagerartikelForm());
        tbody?.querySelectorAll('.edit-artikel').forEach(b => {
          b.addEventListener('click', async () => {
            try {
              const l = await api.getLagerartikelItem(b.dataset.id);
              showLagerartikelForm(l);
            } catch (e) {
              toast(e.message || 'Fehler beim Laden des Artikels', 'error');
            }
          });
        });
        tbody?.querySelectorAll('.delete-artikel').forEach(b => {
          b.addEventListener('click', async () => {
            const id = b.dataset.id;
            const name = b.closest('tr')?.querySelector('.jugend-name strong')?.textContent || '';
            if (!confirm(`Stammartikel "${name}" wirklich löschen?`)) return;
            try {
              await api.deleteLagerartikel(id);
              toast('Stammartikel gelöscht', 'success');
              renderKleiderkammerSubtab('bekleidung', window.__jfKleiderState);
            } catch (e) {
              toast(e.message || 'Fehler beim Löschen', 'error');
            }
          });
        });
      }
    } catch (e) {
      document.getElementById('artikel-list').innerHTML = `<tr><td colspan="6">Fehler beim Laden: ${esc(e.message)}</td></tr>`;
    }
  } else if (subtab === 'lager') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:1.1rem">Lager – Bestand pro Größe</h3>
      </div>
      <table class="jugend-table" style="width:100%">
        <thead>
          <tr><th>Artikel</th><th>Größen &amp; Bestand</th><th>Gesamt</th><th>Einheit</th><th>Aktionen</th></tr>
        </thead>
        <tbody id="lager-list">
          <tr><td colspan="5" class="wrap-loading">Lade...</td></tr>
        </tbody>
      </table>
    `;

    try {
      const artikel = await api.getLagerartikel();
      const tbody = document.getElementById('lager-list');
      if (!artikel.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="wrap-loading">Keine Stammartikel vorhanden</td></tr>`;
      } else {
        tbody.innerHTML = artikel.map(a => {
          const groessen = Array.isArray(a.groessen) ? a.groessen : [];
          const mengePerGroesse = (a.menge_per_groesse && typeof a.menge_per_groesse === 'object') ? a.menge_per_groesse : {};
          const groessenRows = groessen.length
            ? groessen.map(g => `
              <div style="display:flex;align-items:center;gap:8px;justify-content:space-between">
                <span>${esc(g)}</span>
                <div style="display:flex;align-items:center;gap:4px">
                  <button class="btn btn--sm btn--outline" data-action="dec" data-size="${esc(g)}" data-id="${a.id}" ${state.canWriteKleiderkammer ? '' : 'disabled'}>−</button>
                  <span style="min-width:32px;text-align:center">${mengePerGroesse[g] ?? 0}</span>
                  <button class="btn btn--sm btn--outline" data-action="inc" data-size="${esc(g)}" data-id="${a.id}" ${state.canWriteKleiderkammer ? '' : 'disabled'}>+</button>
                </div>
              </div>`).join('')
            : '<div style="color:#666;font-style:italic">Keine Größen definiert</div>';
          return `
          <tr data-id="${a.id}">
            <td class="jugend-name"><strong>${esc(a.name)}</strong></td>
            <td class="jugend-groessen">${groessenRows}</td>
            <td><strong>${a.menge}</strong> ${a.einheit || 'Stück'}</td>
            <td>${a.einheit || 'Stück'}</td>
            <td class="jugend-actions"></td>
          </tr>`;
        }).join('');
        renderIcons(tbody);
      }
      if (state.canWriteKleiderkammer) {
        tbody?.querySelectorAll('button[data-action="inc"], button[data-action="dec"]').forEach(b => {
          b.addEventListener('click', async () => {
            const id = b.dataset.id;
            const size = b.dataset.size;
            const action = b.dataset.action;
            const delta = action === 'inc' ? 1 : -1;
            try {
              await api.patchLagerartikelStock(id, size, delta);
              toast('Bestand aktualisiert', 'success');
              renderKleiderkammerSubtab('lager', window.__jfKleiderState);
            } catch (e) {
              toast(e.message || 'Fehler beim Aktualisieren des Bestands', 'error');
            }
          });
        });
      }
    } catch (e) {
      document.getElementById('lager-list').innerHTML = `<tr><td colspan="5">Fehler beim Laden: ${esc(e.message)}</td></tr>`;
    }
  } else if (subtab === 'ausgaben') {
    renderAusgabenTab(container, state);
  } else if (subtab === 'bestellungen') {
    renderBestellteArtikelTab(container, state);
  }
}

async function renderBestellteArtikelTab(container, state) {
  const canWrite = state.canWriteKleiderkammer;
  const ausgaben = await api.getKleiderausgaben();
  const artikel = await api.getLagerartikel();

  // Statistik berechnen
  const total = ausgaben.length;
  const offen = ausgaben.filter(a => (a.rueckgabe_menge || 0) < a.menge).length;
  const zurueckgegeben = ausgaben.filter(a => (a.rueckgabe_menge || 0) >= a.menge).length;

  container.innerHTML = `
    <div class="card">
      <div class="card__header">
        <h3 style="margin:0;font-size:1.1rem">Bestellte Artikel (Ubersicht)</h3>
        <div style="display:flex;gap:12px;align-items:center">
          ${canWrite ? '<button class="btn btn--secondary btn--sm" id="btn-new-bestellung">Neue Bestellung</button>' : ''}
          ${canWrite ? '<button class="btn btn--secondary btn--sm" id="btn-export-bestellungen">Export als CSV</button>' : ''}
        </div>
      </div>
      <div class="card__body">
        <div class="stats-row" style="display:flex;gap:16px;margin-bottom:16px">
          <div class="stat-card" style="flex:1">
            <div class="stat-card__number" style="font-size:20px;font-weight:700">${total}</div>
            <div class="stat-card__label">Gesamt</div>
          </div>
          <div class="stat-card" style="flex:1">
            <div class="stat-card__number" style="font-size:20px;font-weight:700;color:var(--gelb-dunkel)">${offen}</div>
            <div class="stat-card__label">Offen</div>
          </div>
          <div class="stat-card" style="flex:1">
            <div class="stat-card__number" style="font-size:20px;font-weight:700;color:var(--gruen-dunkel)">${zurueckgegeben}</div>
            <div class="stat-card__label">Zurückgegeben</div>
          </div>
        </div>
        <div class="table-wrapper">
          ${total === 0 ? `
            <div class="empty-state" style="text-align:center;padding:$space-xl">
              <span class="icon icon--large">📦</span>
              <p style="color:var(--text-muted);margin:12px 0">Keine Bestellungen vorhanden.</p>
              ${canWrite ? '<p style="color:var(--gruen-dunkel);font-size:$font-size-sm">Klicken Sie auf "Neue Bestellung", um eine Bestellung anzulegen.</p>' : ''}
            </div>` : ''}
            <table style="width:100%;border-collapse:collapse">
              <thead>
                <tr>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap;width:40px"><input type="checkbox" id="select-all-bestellungen" style="width:16px;height:16px;cursor:pointer"></th>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap">Mitglied</th>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap">Artikel</th>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap">Größe</th>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap">Menge</th>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap">Bestellt am</th>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap">Status</th>
                  <th style="background:var(--bg-card-hover);padding:10px 16px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);border-bottom:1px solid var(--border);white-space:nowrap">Aktionen</th>
                </tr>
              </thead>
              <tbody id="bestellte-artikel-list">
                ${ausgaben.map(a => {
                  const lagerArtikel = Array.isArray(artikel) ? artikel.find(x => x.id === a.lagerartikel_id) : null;
                  const artikelName = lagerArtikel ? lagerArtikel.name : 'Unbekannt';
                  const groesseLabel = Array.isArray(lagerArtikel?.groessen) && lagerArtikel.groessen.includes(a.groesse || '') ? (a.groesse || '') : (a.groesse || '-');
                  const status = (a.rueckgabe_menge || 0) >= a.menge ? 'Zurückgegeben' : 'Bestellt';
                  const statusBadgeClass = (a.rueckgabe_menge || 0) >= a.menge ? 'vollstaendig' : 'teillieferung';
                  return `<tr data-id="${a.id}" style="background:var(--bg-card)">
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border);text-align:center"><input type="checkbox" class="export-checkbox" value="${a.id}" style="width:16px;height:16px;cursor:pointer"></td>
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border)">${esc(a.mitglied_name || 'Unbekannt')}</td>
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border)"><strong>${esc(artikelName)}</strong></td>
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border)">${esc(groesseLabel)}</td>
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border)">${a.menge}</td>
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border)">${formatDatumDeutsch(a.ausgabedatum)}</td>
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border)">
                        <span class="badge badge--${statusBadgeClass}">${status}</span>
                      </td>
                      <td style="padding:10px 16px;color:var(--text);border-bottom:1px solid var(--border)">
                        <div class="btn-group">
                          ${canWrite && (a.rueckgabe_menge || 0) < a.menge ? `<button class="btn btn--outline btn--sm btn-uebernehmen-bestellung" data-id="${a.id}" data-artikelName="${esc(a.lagerartikel_name || 'Artikel')}" data-groesse="${a.groesse || ''}" data-menge="${a.menge}" data-lagerartikel-id="${a.lagerartikel_id}">Artikel übernehmen</button>` : ''}
                          ${canWrite ? `<button class="btn btn--outline btn--sm btn-bestellung-loeschen" data-id="${a.id}">Bestellung löschen</button>` : ''}
                        </div>
                      </td>
                    </tr>`;
                }).join('')}
              </tbody>
            </table>
        </div>
      </div>
    </div>
  `;

  const tbody = document.getElementById('bestellte-artikel-list');

  if (canWrite) {
    // "Select all" checkbox
    document.getElementById('select-all-bestellungen')?.addEventListener('change', (e) => {
      const checked = e.target.checked;
      tbody.querySelectorAll('.export-checkbox').forEach(cb => cb.checked = checked);
    });

    // Export selected as CSV
    document.getElementById('btn-export-bestellungen')?.addEventListener('click', () => {
      const selected = Array.from(tbody.querySelectorAll('.export-checkbox:checked')).map(cb => cb.value);
      if (!selected.length) {
        toast('Bitte wähle mindestens einen Eintrag aus', 'error');
        return;
      }
      const rows = [];
      rows.push('Mitglied,Artikel,Größe,Menge,Bestellt am,Status');
      for (const id of selected) {
        const row = tbody.querySelector(`tr[data-id="${id}"]`);
        if (!row) continue;
        const mitglied = row.querySelector('td:nth-child(2)').textContent.trim();
        const artikel = row.querySelector('td:nth-child(3)').textContent.trim();
        const groesse = row.querySelector('td:nth-child(4)').textContent.trim();
        const menge = row.querySelector('td:nth-child(5)').textContent.trim();
        const datum = row.querySelector('td:nth-child(6)').textContent.trim();
        const status = row.querySelector('td:nth-child(7)').textContent.trim();
        rows.push(`"${mitglied}","${artikel}","${groesse}",${menge},"${datum}","${status}"`);
      }
      const csv = rows.join('\n');
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bestellte_artikel_${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      toast('Export erstellt', 'success');
    });

    document.getElementById('btn-new-bestellung')?.addEventListener('click', async () => {
      // Members laden für Dropdown
      const alle = await api.getJugendmitglieder();
      const activeMitglieder = alle.filter(m => !m.archiviert);

      const overlay = document.createElement('div');
      overlay.className = 'modal-overlay';
      overlay.innerHTML = `
        <div class="modal modal--md">
          <div class="modal__header">
            <span style="font-size:1.1rem;font-weight:600">Neue Bestellung</span>
            <button type="button" class="modal__close" aria-label="Schließen">✕</button>
          </div>
          <div class="modal__body">
            <form id="bestellung-form" class="form-grid">
              <div class="form-group form-group--full">
                <label>Artikel <span class="required">*</span></label>
                <select id="fld-b-lagerartikel-id" required>
                  <option value="">-- Artikel auswählen --</option>
                  ${artikel.map(a => `<option value="${a.id}" data-groessen='${JSON.stringify(a.groessen)}'>${esc(a.name)}</option>`).join('')}
                </select>
              </div>
              <div class="form-group form-group--half">
                <label>Größe <span class="required">*</span></label>
                <select id="fld-b-groesse" required disabled>
                  <option value="">-- Größe wählen (Artikel zuerst) --</option>
                </select>
              </div>
              <div class="form-group form-group--half">
                <label>Menge <span class="required">*</span></label>
                <input type="number" id="fld-b-menge" min="1" value="1" required />
              </div>
              <div class="form-group form-group--full">
                <label>Jugendmitglied <span class="required">*</span></label>
                <select id="fld-b-mitglied-id" required>
                  <option value="">-- Mitglied auswählen --</option>
                  ${activeMitglieder.map(m => `<option value="${m.id}">${esc(m.vorname || '')} ${esc(m.nachname || '')}</option>`).join('')}
                </select>
              </div>
              <div class="form-group form-group--full" style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
                <button type="button" class="btn btn--outline" data-close-modal>Abbrechen</button>
                <button type="submit" class="btn btn--primary">Bestellung erstellen</button>
              </div>
            </form>
          </div>
          <div class="modal__footer"></div>
        </div>
      `;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('active'));

      // Größe-Dropdown beim Artikel-Wechsel aktualisieren
      const artikelSelect = document.getElementById('fld-b-lagerartikel-id');
      const groesseSelect = document.getElementById('fld-b-groesse');
      artikelSelect.addEventListener('change', (e) => {
        const selected = artikel.find(a => a.id === e.target.value);
        groesseSelect.innerHTML = '<option value="">-- Größe wählen --</option>';
        if (selected && Array.isArray(selected.groessen) && selected.groessen.length > 0) {
          selected.groessen.forEach(g => {
            const opt = document.createElement('option');
            opt.value = g;
            opt.textContent = g;
            groesseSelect.appendChild(opt);
          });
          groesseSelect.disabled = false;
        } else {
          groesseSelect.disabled = true;
        }
      });

      // Mitglied-Dropdown kann leer sein, wenn keine aktiven Mitglieder
      if (!activeMitglieder.length) {
        document.getElementById('fld-b-mitglied-id').disabled = true;
        document.getElementById('fld-b-mitglied-id').innerHTML = '<option value="">Keine aktiven Mitglieder</option>';
      }

      const closeModal = () => {
        overlay.classList.remove('active');
        setTimeout(() => overlay.remove(), 150);
      };
      overlay.querySelectorAll('.modal__close').forEach(btn => btn.addEventListener('click', closeModal));
      overlay.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
      overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

      document.getElementById('bestellung-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const lagerartikelId = document.getElementById('fld-b-lagerartikel-id').value.trim();
        const menge = +document.getElementById('fld-b-menge').value;
        const mitgliedId = document.getElementById('fld-b-mitglied-id').value.trim();
        if (!lagerartikelId) { toast('Bitte einen Artikel auswählen', 'error'); return; }
        if (!mitgliedId) { toast('Bitte ein Jugendmitglied auswählen', 'error'); return; }
        try {
          await api.createBestellung({ mitglied_id: mitgliedId, lagerartikel_id: lagerartikelId, menge, groesse: document.getElementById('fld-b-groesse').value.trim() || null });
          toast('Bestellung erstellt', 'success');
          closeModal();
          renderBestellteArtikelTab(container, state);
        } catch (err) {
          toast(`Fehler: ${err.message || err}`, 'error');
        }
      });
    });

    // "Artikel übernehmen" Button-Handler
    tbody.querySelectorAll('.btn-uebernehmen-bestellung').forEach(b => {
      b.addEventListener('click', async () => {
        const artikelName = b.dataset.artikelName;
        const groesse = b.dataset.groesse;
        const menge = +b.dataset.menge;
        const lagerartikelId = b.dataset.lagerartikelId;

        // Jugendfeuerwehrmitglieder laden
        const alle = await api.getJugendmitglieder();
        const activeMitglieder = alle.filter(m => !m.archiviert);

        if (!activeMitglieder.length) {
          toast('Keine aktiven Jugendfeuerwehrmitglieder vorhanden', 'error');
          return;
        }

        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay';
        overlay.innerHTML = `
          <div class="modal modal--md">
            <div class="modal__header">
              <span style="font-size:1.1rem;font-weight:600">Artikel übernehmen: ${esc(artikelName)} (${groesse || '-'}) × ${menge}</span>
              <button type="button" class="modal__close" aria-label="Schließen">✕</button>
            </div>
            <div class="modal__body">
              <form id="uebernehmen-form" class="form-grid">
                <div class="form-group form-group--full">
                  <label>Jugendmitglied <span class="required">*</span></label>
                  <select id="fld-u-mitglied" required>
                    <option value="">-- Auswählen --</option>
                    ${activeMitglieder.map(m => `<option value="${m.id}">${esc(m.vorname || '')} ${esc(m.nachname || '')}</option>`).join('')}
                  </select>
                </div>
                <div class="form-group form-group--half">
                  <label>Menge <span class="required">*</span></label>
                  <input type="number" id="fld-u-menge" min="1" max="${menge}" value="${menge}" required />
                </div>
                <div class="form-group form-group--half">
                  <label>Größe</label>
                  <input type="text" id="fld-u-groesse" value="${groesse || ''}" />
                </div>
                <div class="form-group form-group--full" style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
                  <button type="button" class="btn btn--outline" data-close-modal>Abbrechen</button>
                  <button type="submit" class="btn btn--primary">Übernehmen & Übergabe</button>
                </div>
              </form>
            </div>
            <div class="modal__footer"></div>
          </div>
        `;
        document.body.appendChild(overlay);
        requestAnimationFrame(() => overlay.classList.add('active'));

        const closeModal = () => {
          overlay.classList.remove('active');
          setTimeout(() => overlay.remove(), 150);
        };
        overlay.querySelectorAll('.modal__close').forEach(btn => btn.addEventListener('click', closeModal));
        overlay.querySelectorAll('[data-close-modal]').forEach(btn => btn.addEventListener('click', closeModal));
        overlay.addEventListener('click', (e) => { if (e.target === overlay) closeModal(); });

        document.getElementById('uebernehmen-form').addEventListener('submit', async (e) => {
          e.preventDefault();
          const mitgliedId = document.getElementById('fld-u-mitglied').value;
          const uebernehmenMenge = +document.getElementById('fld-u-menge').value;
          const uebernehmenGroesse = document.getElementById('fld-u-groesse').value.trim() || null;
          if (!mitgliedId) { toast('Bitte ein Jugendmitglied auswählen', 'error'); return; }
          try {
            await api.übernehmenKleiderartikel(mitgliedId, lagerartikelId, uebernehmenMenge, uebernehmenGroesse);
            toast('Artikel erfolgreich übergeben', 'success');
            closeModal();
            renderBestellteArtikelTab(container, state);
          } catch (err) {
            toast(`Fehler: ${err.message || err}`, 'error');
          }
        });
      });
    });

    // "Bestellung löschen" Button-Handler
    tbody.querySelectorAll('.btn-bestellung-loeschen').forEach(b => {
      b.addEventListener('click', async () => {
        if (!confirm('Bestellung wirklich löschen?')) return;
        try {
          await api.deleteKleiderausgabe(b.dataset.id);
          toast('Bestellung gelöscht', 'success');
          renderBestellteArtikelTab(container, state);
        } catch (err) {
          toast(`Fehler: ${err.message || err}`, 'error');
        }
      });
    });
  }
}

// ── Ausgaben & Rückgaben: Mitglieder-Liste ─────────────────────────────────

async function renderAusgabenTab(container, state) {
  const canWrite = state.canWriteKleiderkammer;

  container.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
      <h3 style="margin:0;font-size:1.1rem">Ausgaben &amp; R&uuml;ckgaben</h3>
    </div>
    <div id="ausgaben-mitglieder-view">
      <table class="jugend-table" style="width:100%">
        <thead>
          <tr><th>Name</th><th>Geburtsdatum</th><th>Aktuelle Kleidung</th><th>Aktionen</th></tr>
        </thead>
        <tbody id="ausgaben-mitglieder-list">
          <tr><td colspan="4" class="wrap-loading">Lade...</td></tr>
        </tbody>
      </table>
    </div>
    <div id="ausgaben-detail-view" style="margin-top:24px;display:none"></div>
  `;

  try {
    const mitglieder = await api.getJugendmitglieder();
    const ausgaben = await api.getKleiderausgaben();
    const artikel = await api.getLagerartikel();

    const activeMitglieder = mitglieder.filter(m => !m.archiviert);
    const tbody = document.getElementById('ausgaben-mitglieder-list');

    if (!activeMitglieder.length) {
      tbody.innerHTML = `<tr><td colspan="4" class="wrap-loading">Keine aktiven Jugendfeuerwehrmitglieder vorhanden</td></tr>`;
      return;
    }

    // Anzahl aktuell ausgegebener (nicht vollständig zurückerhaltener) Artikel pro Mitglied
    const ausgabenProMitglied = {};
    ausgaben.forEach(a => {
      const offen = a.menge - (a.rueckgabe_menge || 0);
      if (offen > 0) {
        ausgabenProMitglied[a.mitglied_id] = (ausgabenProMitglied[a.mitglied_id] || 0) + offen;
      }
    });

    tbody.innerHTML = activeMitglieder.map(m => {
      const artikelCount = ausgabenProMitglied[m.id] || 0;
      return `
        <tr data-id="${m.id}">
          <td class="jugend-name"><strong>${esc(m.vorname || '')} ${esc(m.nachname || '')}</strong></td>
          <td class="jugend-geburtsdatum">${formatDatumDeutsch(m.geburtsdatum)}</td>
          <td>${artikelCount} ${artikelCount === 1 ? 'Artikel' : 'Artikel'}</td>
          <td class="jugend-actions">
            <button class="btn btn--small btn--secondary btn-details-mitglied" data-id="${m.id}">Details</button>
            ${canWrite ? `<button class="btn btn--small btn--outline btn-bearbeiten-mitglied" data-id="${m.id}">Bearbeiten</button>` : ''}
            <button class="btn btn--small btn--secondary btn-export-mitglied" data-id="${m.id}" data-name="${esc((m.vorname || '') + ' ' + (m.nachname || ''))}">Export</button>
          </td>
        </tr>
      `;
    }).join('');

    tbody.querySelectorAll('.btn-details-mitglied').forEach(b => {
      b.addEventListener('click', () => showMitgliedKleidung(b.dataset.id, state));
    });
    tbody.querySelectorAll('.btn-export-mitglied').forEach(b => {
      b.addEventListener('click', async () => {
        const mitgliedId = b.dataset.id;
        const mitgliedName = b.dataset.name;
        try {
          const csv = await api.getMitgliedBestellungen(mitgliedId);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bestellung_jugendmitglied_${mitgliedId}.csv`;
          a.textContent = `Download: Bestellungen für ${mitgliedName}`;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        } catch (err) {
          toast(`Fehler beim Exportieren: ${err.message || err}`, 'error');
        }
      });
    });
    if (canWrite) {
      tbody.querySelectorAll('.btn-bearbeiten-mitglied').forEach(b => {
        b.addEventListener('click', () => showMitgliedKleidungBearbeiten(b.dataset.id, state));
      });
    }
  } catch (e) {
    document.getElementById('ausgaben-mitglieder-list').innerHTML = `<tr><td colspan="4">Fehler beim Laden: ${esc(e.message)}</td></tr>`;
  }
}

// ── Mitglied: aktuelle Kleidung anzeigen (Details) ──────────────────────────

async function showMitgliedKleidung(mitgliedId, state) {
  const detailView = document.getElementById('ausgaben-detail-view');
  const listView = document.getElementById('ausgaben-mitglieder-view');
  listView.style.display = 'none';
  detailView.style.display = '';
  detailView.innerHTML = '<div class="wrap-loading">Lade...</div>';

  try {
    const [mitglied, ausgaben, artikel] = await Promise.all([
      api.getJugendmitglied(mitgliedId),
      api.getKleiderausgaben(),
      api.getLagerartikel(),
    ]);

    const artikelMap = {};
    artikel.forEach(a => { artikelMap[a.id] = a; });

    // Gehaltene Bestände pro Mitglied: key = `${artikelId}|${groesse}` -> { offen, ausgaben }
    const offenMap = {};
    ausgaben.forEach(a => {
      if (a.mitglied_id !== mitgliedId) return;
      const offen = a.menge - (a.rueckgabe_menge || 0);
      if (offen <= 0) return;
      const g = a.groesse || '';
      const key = `${a.lagerartikel_id}|${g}`;
      if (!offenMap[key]) offenMap[key] = { offen: 0, ausgaben: [] };
      offenMap[key].offen += offen;
      offenMap[key].ausgaben.push(a);
    });

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="margin:0">${esc(mitglied.vorname || '')} ${esc(mitglied.nachname || '')} – Aktuelle Kleidung</h4>
        <div style="display:flex;gap:8px">
          <button class="btn btn--sm btn--outline" id="btn-export-bestellung" data-mitglied-id="${mitgliedId}" data-mitglied-name="${esc((mitglied.vorname || '') + ' ' + (mitglied.nachname || ''))}">Bestellung exportieren</button>
          <button class="btn btn--sm btn--outline" id="btn-zurueck-zu-mitgliedern">Zur&uuml;ck</button>
        </div>
      </div>
    `;

    // Alle Stammdartikel × Größen anzeigen – auch solche, die das Mitglied noch nicht erhalten hat (offen = 0)
    if (!artikel.length) {
      html += `<p style="color:#666;font-style:italic">Keine Stammartikel vorhanden.</p>`;
    } else {
      html += `<table class="jugend-table" style="width:100%"><thead><tr><th>Artikel</th><th>Größe</th><th>Menge</th><th>Ausgabe am</th><th>Rückgabe am</th><th>Aktionen</th></tr></thead><tbody>`;
      for (const a of artikel) {
        const groessen = Array.isArray(a.groessen) ? a.groessen : [];
        const sizeList = groessen.length > 0 ? groessen.map(g => g) : [''];
        for (const g of sizeList) {
          const entry = offenMap[`${a.id}|${g}`];
          const offen = entry?.offen || 0;
          const ausgabe = entry?.ausgaben?.[0];
          html += `
            <tr data-id="${a.id}" data-groesse="${esc(g)}">
              <td class="jugend-name"><strong>${esc(a.name)}</strong></td>
              <td>${esc(g) || '–'}</td>
              <td>${offen > 0 ? `<strong>${offen}</strong> ${esc(a.einheit || 'Stück')}` : '–'}</td>
              <td class="jugend-geburtsdatum">${ausgabe ? formatDatumDeutsch(ausgabe.ausgabedatum) : '–'}</td>
              <td>${ausgabe?.rueckgabedatum ? formatDatumDeutsch(ausgabe.rueckgabedatum) : '–'}</td>
              <td class="jugend-actions">
                ${offen > 0 ? `<button class="btn btn--small btn--outline btn-rueckgabe-detail" data-id="${ausgabe?.id}" data-mitglied-id="${mitgliedId}" data-mitglied-name="${esc((mitglied.vorname || '') + ' ' + (mitglied.nachname || ''))}" data-artikel-name="${esc(a.name)}" data-offen="${offen}">Rückgabe</button>` : ''}
                ${offen === 0 && !ausgabe?.rueckgabedatum ? `<button class="btn btn--small btn--primary btn-bestellen-detail" data-id="${a.id}" data-groesse="${esc(g)}" data-mitglied-id="${mitgliedId}" data-artikel-name="${esc(a.name)}">Bestellen</button>` : ''}
              </td>
            </tr>
          `;
        }
      }
      html += `</tbody></table>`;
    }

    detailView.innerHTML = html;

    document.getElementById('btn-zurueck-zu-mitgliedern').addEventListener('click', () => {
      detailView.style.display = 'none';
      listView.style.display = '';
      renderAusgabenTab(listView, state);
    });

    detailView.querySelectorAll('.btn-rueckgabe-detail').forEach(b => {
      b.addEventListener('click', () => {
        showRueckgabeForm(b.dataset.id, b.dataset.mitgliedName, b.dataset.artikelName, +b.dataset.offen);
      });
    });

    // Export bestellungen (CSV)
    detailView.querySelectorAll('.btn-export-bestellung').forEach(b => {
      b.addEventListener('click', async () => {
        const mitgliedId = b.dataset.mitgliedId;
        const mitgliedName = b.dataset.mitgliedName;
        try {
          const csv = await api.getMitgliedBestellungen(mitgliedId);
          const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `bestellung_jugendmitglied_${mitgliedId}.csv`;
          a.textContent = `Download: Bestellungen für ${mitgliedName}`;
          a.style.display = 'none';
          document.body.appendChild(a);
          a.click();
          setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
        } catch (err) {
          toast(`Fehler beim Exportieren: ${err.message || err}`, 'error');
        }
      });
    });

    // Bestellen-Button (wenn kein Gegenstand gehalten wird / Bestellung nötig)
    detailView.querySelectorAll('.btn-bestellen-detail').forEach(b => {
      b.addEventListener('click', async () => {
        const mitgliedId = b.dataset.mitgliedId;
        const artikelName = b.dataset.artikelName;
        const groesse = b.dataset.groesse;
        const mengeStr = window.prompt(`Wie viele "${artikelName}" (${groesse}) soll bestellt werden?`, '1');
        const menge = parseInt(mengeStr, 10);
        if (!menge || menge < 1) return;
        try {
          await api.createBestellung({
            mitglied_id: mitgliedId,
            lagerartikel_id: b.dataset.id,
            menge,
            groesse: groesse || null,
          });
          toast('Bestellung erfolgreich erstellt', 'success');
          // Detail-View neu laden
          await showMitgliedKleidung(mitgliedId, state);
        } catch (err) {
          toast(`Fehler bei Bestellung: ${err.message || err}`, 'error');
        }
      });
    });
  } catch (e) {
    detailView.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
    document.getElementById('btn-zurueck-zu-mitgliedern')?.addEventListener('click', () => {
      detailView.style.display = 'none';
      listView.style.display = '';
      renderAusgabenTab(listView, state);
    });
  }
}

// ── Mitglied: Kleidung bearbeiten ───────────────────────────────────────────

async function showMitgliedKleidungBearbeiten(mitgliedId, state) {
  const detailView = document.getElementById('ausgaben-detail-view');
  const listView = document.getElementById('ausgaben-mitglieder-view');
  listView.style.display = 'none';
  detailView.style.display = '';
  detailView.innerHTML = '<div class="wrap-loading">Lade...</div>';

  try {
    const [mitglied, ausgaben, artikel] = await Promise.all([
      api.getJugendmitglied(mitgliedId),
      api.getKleiderausgaben(),
      api.getLagerartikel(),
    ]);

    const artikelMap = {};
    artikel.forEach(a => { artikelMap[a.id] = a; });

    // Gehaltene Bestände pro Mitglied: key = `${artikelId}|${groesse}` -> { offen, ausgaben }
    const offenMap = {};
    ausgaben.forEach(a => {
      if (a.mitglied_id !== mitgliedId) return;
      const offen = a.menge - (a.rueckgabe_menge || 0);
      if (offen <= 0) return;
      const g = a.groesse || '';
      const key = `${a.lagerartikel_id}|${g}`;
      if (!offenMap[key]) offenMap[key] = { offen: 0, ausgaben: [] };
      offenMap[key].offen += offen;
      offenMap[key].ausgaben.push(a);
    });

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h4 style="margin:0">${esc(mitglied.vorname || '')} ${esc(mitglied.nachname || '')} – Kleidung bearbeiten</h4>
        <div style="display:flex;gap:8px">
          <button class="btn btn--sm btn--outline" id="btn-zurueck-zu-mitgliedern-edit">Zur&uuml;ck</button>
          <button class="btn btn--sm btn--outline" id="btn-export-bestellung-edit" data-mitglied-id="${mitgliedId}" data-mitglied-name="${esc((mitglied.vorname || '') + ' ' + (mitglied.nachname || ''))}">Bestellung exportieren</button>
          <button class="btn btn--sm btn--primary" id="btn-speichern-kleidung-oben">Speichern</button>
        </div>
      </div>
    `;

    // Alle Stammdartikel × Größen als Bearbeitungs-Raster (aktuelle gehaltene Menge)
    const rows = [];
    for (const a of artikel) {
      const groessen = Array.isArray(a.groessen) ? a.groessen : [];
      const sizeList = groessen.length > 0 ? groessen.map(g => g) : [''];
      for (const g of sizeList) {
        const entry = offenMap[`${a.id}|${g}`];
        const offen = entry?.offen || 0;
        // Lagerbestand für diese Größe ermitteln
        const mengePerGroesse = (a.menge_per_groesse && typeof a.menge_per_groesse === 'object') ? a.menge_per_groesse : {};
        const lagerBestand = mengePerGroesse[g] ?? 0;
        rows.push({ a, g, offen, entry, lagerBestand });
      }
    }

    html += `<p style="font-weight:600;margin-bottom:8px">Gehaltete Kleidung nach Größe bearbeiten:</p>`;
    if (!rows.length) {
      html += `<p style="color:#666;font-style:italic">Keine Stammartikel vorhanden.</p>`;
    } else {
      html += `<table class="jugend-table" style="width:100%"><thead><tr><th>Artikel</th><th>Größe</th><th>Lagerbestand</th><th>Menge (gehalten)</th><th>Aktionen</th></tr></thead><tbody>`;
      for (const row of rows) {
        const { a, g, offen, entry, lagerBestand } = row;
        const ausgabeId = entry?.ausgaben?.[0]?.id || '';
        html += `
          <tr data-id="${a.id}" data-groesse="${esc(g)}">
            <td class="jugend-name"><strong>${esc(a.name)}</strong></td>
            <td>${esc(g) || '–'}</td>
            <td><strong>${lagerBestand}</strong> ${esc(a.einheit || 'Stück')}</td>
            <td><input type="number" min="0" value="${offen}" data-id="${a.id}" data-groesse="${esc(g)}" class="edit-qty" data-orig="${offen}" data-ausgabe-id="${ausgabeId}" data-open="${offen}"/></td>
            <td class="jugend-actions">
              ${offen > 0 ? `<button class="btn btn--small btn--danger btn-rueckgabe-edit" data-id="${a.id}" data-groesse="${esc(g)}" data-ausgabe-id="${ausgabeId}" data-offen="${offen}">Rückgabe</button>` : ''}
              ${offen === 0 ? `<button class="btn btn--small btn--primary btn-bestellen-edit" data-id="${a.id}" data-groesse="${esc(g)}" data-mitglied-id="${mitgliedId}" data-artikel-name="${esc(a.name)}">Bestellen</button>` : ''}
            </td>
          </tr>
        `;
      }
      html += `</tbody></table>`;
    }

    // Bemerkung-Feld für allgemeine Notizen
    html += `
      <div style="margin-top:24px">
        <hr style="margin:0 0 16px 0;border:none;height:1px;background:var(--border);">
        <div class="form-group form-group--full">
          <label>Bemerkung</label>
          <textarea id="fld-edit-bemerkung" rows="3" placeholder="Allgemeine Notizen zur Kleidung dieses Mitglieds"></textarea>
        </div>
        <div style="margin-top:8px">
          <button class="btn btn--sm btn--primary" id="btn-speichern-kleidung-unten">Speichern</button>
        </div>
      </div>
    `;

    detailView.innerHTML = html;

    document.getElementById('btn-zurueck-zu-mitgliedern-edit').addEventListener('click', () => {
      detailView.style.display = 'none';
      listView.style.display = '';
      renderAusgabenTab(listView, state);
    });

    detailView.querySelectorAll('.btn-rueckgabe-edit').forEach(b => {
      b.addEventListener('click', () => {
        showRueckgabeForm(b.dataset.ausgabeId, `${esc(mitglied.vorname || '')} ${esc(mitglied.nachname || '')}`, '', +b.dataset.offen);
      });
    });

    // Bestellen-Button (wenn Lagerbestand 0)
    detailView.querySelectorAll('.btn-bestellen-edit').forEach(b => {
      b.addEventListener('click', async () => {
        const mitgliedId = b.dataset.mitgliedId;
        const artikelName = b.dataset.artikelName;
        const groesse = b.dataset.groesse;
        const mengeStr = window.prompt(`Wie viele "${artikelName}" (${groesse}) soll bestellt werden?`, '1');
        const menge = parseInt(mengeStr, 10);
        if (!menge || menge < 1) return;
        try {
          await api.createBestellung({
            mitglied_id: mitgliedId,
            lagerartikel_id: b.dataset.id,
            menge,
            groesse: groesse || null,
          });
          toast('Bestellung erfolgreich erstellt', 'success');
          // Bearbeitungs-View neu laden
          await showMitgliedKleidungBearbeiten(mitgliedId, state);
        } catch (err) {
          toast(`Fehler bei Bestellung: ${err.message || err}`, 'error');
        }
      });
    });

    // Geänderte Mengen im Bearbeitungs-Raster speichern
    async function speichernKleidung() {
      const inputs = detailView.querySelectorAll('.edit-qty');
      if (!inputs.length) return;

      // Restliche offene Bestände pro Ausgabedatensatz nachverfolgen
      const openRemainder = new Map();
      ausgaben.forEach(au => {
        if (au.mitglied_id !== mitgliedId) return;
        const offen = au.menge - (au.rueckgabe_menge || 0);
        if (offen > 0) openRemainder.set(au.id, { au, remaining: offen });
      });

      let changes = 0;
      let errors = 0;
      for (let i = 0; i < inputs.length; i++) {
        const input = inputs[i];
        const row = rows[i];
        if (!row) continue;
        const orig = +input.dataset.orig;
        const neu = Math.max(0, +input.value || 0);
        if (neu === orig) continue;
        try {
          if (neu > orig) {
            await api.createKleiderausgabe({
              mitglied_id: mitgliedId,
              lagerartikel_id: row.a.id,
              menge: neu - orig,
              groesse: row.g || null,
            });
            changes++;
          } else if (neu < orig) {
            const delta = orig - neu;
            let remaining = delta;
            const groupEntry = row.entry;
            const ausgabeIds = groupEntry && groupEntry.ausgaben ? groupEntry.ausgaben.map(au => au.id) : [];
            for (const aid of ausgabeIds) {
              if (remaining <= 0) break;
              const rec = openRemainder.get(aid);
              if (!rec || rec.remaining <= 0) continue;
              const take = Math.min(rec.remaining, remaining);
              if (take > 0) {
                await api.rueckgabeKleiderausgabe(aid, {
                  rueckgabe_menge: take,
                  rueckgabe_bemerkung: null,
                  bemerkung: null,
                });
                rec.remaining -= take;
                remaining -= take;
                changes++;
              }
            }
            if (remaining > 0) {
              errors++;
              toast(`Nur ${delta - remaining} von ${delta} konnten zurückgegeben werden`, 'error');
            }
          }
        } catch (e) {
          errors++;
          toast(e.message || 'Fehler beim Speichern der Kleidung', 'error');
        }
      }
      if (changes > 0) {
        toast(`${changes} ${changes === 1 ? 'Eintrag' : 'Einträge'} aktualisiert`, 'success');
        detailView.style.display = 'none';
        listView.style.display = '';
        renderAusgabenTab(listView, state);
      } else if (errors > 0) {
        // Fehler-Toasts wurden bereits einzeln angezeigt
      } else {
        toast('Keine Änderungen vorgenommen', 'info');
      }
    }

    document.getElementById('btn-export-bestellung-edit')?.addEventListener('click', async () => {
      const mid = document.getElementById('btn-export-bestellung-edit').dataset.mitgliedId;
      const mname = document.getElementById('btn-export-bestellung-edit').dataset.mitgliedName;
      try {
        const csv = await api.getMitgliedBestellungen(mid);
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `bestellung_jugendmitglied_${mid}.csv`;
        a.textContent = `Download: Bestellungen für ${mname}`;
        a.style.display = 'none';
        document.body.appendChild(a);
        a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      } catch (err) {
        toast(`Fehler beim Exportieren: ${err.message || err}`, 'error');
      }
    });

    document.getElementById('btn-speichern-kleidung-oben')?.addEventListener('click', speichernKleidung);
    document.getElementById('btn-speichern-kleidung-unten')?.addEventListener('click', speichernKleidung);
  } catch (e) {
    detailView.innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
    document.getElementById('btn-zurueck-zu-mitgliedern-edit')?.addEventListener('click', () => {
      detailView.style.display = 'none';
      listView.style.display = '';
      renderAusgabenTab(listView, state);
    });
  }
}

// ── Rückgabe-Formular (Modal) ───────────────────────────────────────────────────

function showRueckgabeForm(ausgabeId, mitgliedName, artikelName, offenMenge) {
  const overlay = document.createElement('div');
  overlay.className = 'error-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  overlay.innerHTML = `
    <div class="card" style="max-width:480px;width:90%;background:var(--surface);padding:24px;border-radius:8px;">
      <div class="card__header" style="margin-bottom:20px;display:flex;align-items:flex-start;gap:12px">
        <span style="font-size:1.1rem;font-weight:600">Rückgabe – ${esc(mitgliedName || '')}</span>
        <button type="button" class="btn btn--sm btn--outline" onclick="this.closest('.error-overlay').remove()" style="margin-left:auto">Abbrechen</button>
      </div>
      <div style="font-size:0.9rem;color:var(--muted);margin-bottom:16px">Artikel: ${esc(artikelName || '')}<br>Offen: ${offenMenge} Stk.</div>
      <form id="rueckgabe-form" class="form-grid">
        <div class="form-group form-group--half">
          <label>Rückgabemenge <span class="required">*</span></label>
          <input type="number" id="fld-rueckgabe-menge" min="1" max="${offenMenge}" value="${offenMenge}" required />
        </div>
        <div class="form-group form-group--half">
          <label>Rückgabedatum</label>
          <input type="date" id="fld-rueckgabe-datum" value="${new Date().toISOString().slice(0, 10)}" />
        </div>
        <div class="form-group form-group--full">
          <label>Bemerkung (intern)</label>
          <textarea id="fld-rueckgabe-bemerkung" rows="2" placeholder="Interner Vermerk"></textarea>
        </div>
        <div class="form-group form-group--full">
          <label>Rückgabe-Bemerkung (für Mitglied)</label>
          <textarea id="fld-rueckgabe-bemerkung-ext" rows="2" placeholder="Sichtbar für Mitglied (optional)"></textarea>
        </div>
        <div class="form-group form-group--full" style="margin-top:12px;display:flex;gap:8px;justify-content:flex-end">
          <button type="button" class="btn btn--outline" onclick="this.closest('.error-overlay').remove()">Abbrechen</button>
          <button type="submit" class="btn btn--primary">Rückgabe buchen</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById('rueckgabe-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const menge = +document.getElementById('fld-rueckgabe-menge').value;
    if (!menge || menge < 1 || menge > offenMenge) {
      toast(`Menge muss zwischen 1 und ${offenMenge} liegen`, 'error');
      return;
    }
    try {
      await api.rueckgabeKleiderausgabe(ausgabeId, {
        rueckgabe_menge: menge,
        rueckgabedatum: document.getElementById('fld-rueckgabe-datum').value || null,
        bemerkung: document.getElementById('fld-rueckgabe-bemerkung').value || null,
        rueckgabe_bemerkung: document.getElementById('fld-rueckgabe-bemerkung-ext').value || null,
      });
      toast('Rückgabe gebucht', 'success');
      overlay.remove();
      // Refresh the current view – find which tab is active
      const activeTab = document.querySelector('.jugend-tabs .tab-btn.active')?.dataset.ktab;
      if (activeTab === 'ausgaben') {
        const container = document.getElementById('ktab-content');
        if (container) renderKleiderkammerSubtab('ausgaben', window.__jfKleiderState);
      }
    } catch (err) {
      toast(err.message || 'Fehler bei der Rückgabe', 'error');
    }
  });
}

async function showLagerartikelForm(l = null) {
  const container = document.getElementById('ktab-content');
  if (!container) return;
  const isEdit = !!l;

  // Determine current sizes for the form
  const currentGroessen = l && l.groessen ? (Array.isArray(l.groessen) ? l.groessen : []) : [];
  const defaultGroessen = ['S', 'M', 'L', 'XL', 'XXL'];

  container.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${isEdit ? 'Stammartikel bearbeiten' : 'Neuen Stammartikel anlegen'}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-artikel">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="artikel-form-el" class="form-grid">
          <div class="form-group form-group--full">
            <label>Name <span class="required">*</span></label>
            <input type="text" id="fld-l-name" placeholder="z.B.Jugendhelm" value="${l ? esc(l.name) : ''}" required maxlength="200" />
          </div>
          <div class="form-group form-group--full">
            <label>Beschreibung</label>
            <input type="text" id="fld-l-beschreibung" placeholder="Beschreibung" value="${l ? esc(l.beschreibung || '') : ''}" />
          </div>
          <div class="form-group form-group--full">
            <label>Verfügbare Größen (durch Komma getrennt)</label>
            <input type="text" id="fld-l-groessen" placeholder="z.B.S,M,L,XL,XXL" value="${l ? currentGroessen.join(',') : defaultGroessen.join(',')}" maxlength="50" />
            <small class="form-text--small">Beispiel: S,M,L,XL,XXL</small>
          </div>
          <div class="form-group form-group--half">
            <label>Einheit</label>
            <input type="text" id="fld-l-einheit" placeholder="St&uuml;ck" value="${l ? (l.einheit || 'St&uuml;ck') : 'St&uuml;ck'}" />
          </div>
          <div class="form-group form-group--full" style="margin-top:12px">
            <button type="submit" class="btn btn--primary">${isEdit ? 'Speichern' : 'Anlegen'}</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel-artikel').addEventListener('click', () => {
    renderKleiderkammerSubtab('bekleidung', window.__jfKleiderState);
  });

  document.getElementById('artikel-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('fld-l-name').value.trim();
    if (!name) { toast('Name ist ein Pflichtfeld', 'error'); return; }

    // Größen verarbeiten
    const groessenInput = document.getElementById('fld-l-groessen').value.trim();
    const groessen = groessenInput ? groessenInput.split(',').map(g => g.trim()).filter(g => g.length > 0) : [];

    const einheit = document.getElementById('fld-l-einheit').value.trim() || 'Stück';

    // Bestand per Größe ist im "Lager"-Subtab separat verwaltbar
    // Beim Anlegen/Bearbeiten über dieses Formular wird menge_per_groesse auf {} zurückgesetzt
    // → Default-Werte 0 für alle Größen
    const mengePerGroesseObj = {};
    for (const g of groessen) {
      mengePerGroesseObj[g] = 0;
    }
    const gesamtMenge = 0;

    const body = {
      name,
      beschreibung: document.getElementById('fld-l-beschreibung').value || null,
      groessen,
      menge_per_groesse: Object.keys(mengePerGroesseObj).length > 0 ? mengePerGroesseObj : null,
      einheit,
      menge: gesamtMenge,
    };

    try {
      if (isEdit) {
        await api.updateLagerartikel(l.id, body);
        toast('Lagerartikel aktualisiert', 'success');
      } else {
        await api.createLagerartikel(body);
        toast('Lagerartikel angelegt', 'success');
      }
      renderKleiderkammerSubtab('bekleidung', window.__jfKleiderState);
    } catch (e) { toast(e.message || 'Fehler beim Speichern', 'error'); }
  });
}

// ── Seiten: Dienstteilnahmen ──────────────────────────────────────────────────

export async function renderJugendfeuerwehrDienstteilnahmen() {
  const { container, state } = await setupPage('jugendfeuerwehr');
  renderHeader(container, 'Dienstteilnahmen', 'Dienstteilnahmen von Anw&auml;rtern verwalten');

  container.innerHTML += `
    <div id="dienstteilnahmen-content"></div>
  `;

  if (state.canWriteAnwerter || state.canReadMitglieder) {
    try {
      const anwaeter = await api.getAnwaeter();
      let html = '';
      if (!anwaeter.length) {
        html = '<p class="wrap-loading">Keine aktiven Anw&auml;rter vorhanden.</p>';
      } else {
        html = `
          <div class="jugend-table-wrapper">
            <table class="jugend-table">
              <thead><tr><th>Name</th><th>Eintritt</th><th>Status</th><th>Dienstteilnahmen</th><th>Aktionen</th></tr></thead>
              <tbody>
                ${anwaeter.map(a => `
                  <tr data-id="${a.id}">
                    <td class="jugend-name"><strong>${esc(a.name)}</strong></td>
                    <td class="jugend-eintritt">${formatDatumDeutsch(a.eintrittsdatum)}</td>
                    <td class="jugend-status">${ANWERTER_STATUS_LABELS[a.status] || esc(a.status)}</td>
                    <td class="jugend-actions">
                      <button class="btn btn--small btn--secondary view-dt" data-id="${a.id}">Teilnahmen ansehen</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        `;
      }
      document.getElementById('dienstteilnahmen-content').innerHTML = html;

      document.querySelectorAll('.view-dt').forEach(b => {
        b.addEventListener('click', () => renderAnwerterDienstteilnahmen(b.dataset.id, state));
      });
      renderIcons(document.getElementById('dienstteilnahmen-content'));
    } catch (e) {
      document.getElementById('dienstteilnahmen-content').innerHTML = `<p class="error-msg error-msg--block">Fehler: ${esc(e.message)}</p>`;
    }
  } else {
    document.getElementById('dienstteilnahmen-content').innerHTML = '<p style="color:#c00">Keine Berechtigung.</p>';
  }
}

// ── Hauptseite (Default) ─────────────────────────────────────────────────────

export async function renderJugendfeuerwehr() {
  await renderJugendfeuerwehrMitglieder();
}

