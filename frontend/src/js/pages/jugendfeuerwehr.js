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
  renderHeader(container, 'Jugendmitglieder', 'Jugendmitglieder verwalten und archivieren');

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

  if (canWrite) document.getElementById('btn-new-mitglied').addEventListener('click', () => showMemberForm(null, state));

  if (!canRead) {
    c.innerHTML += '<p style="color:#c00;margin-top:12px">Keine Berechtigung zum Einsehen von Mitgliederdaten.</p>';
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
        <p>${tab === 'archiviert' ? 'Keine archivierten Mitglieder vorhanden' : 'Keine Jugendmitglieder vorhanden'}</p>
        ${canWrite ? '<button class="btn btn--primary" id="btn-new-mid-empty">Neues Mitglied</button>' : ''}
      </div>`;
    if (canWrite) document.getElementById('btn-new-mid-empty')?.addEventListener('click', () => showMemberForm(null, state));
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
  overlay.className = 'error-overlay';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
  overlay.innerHTML = `
    <div class="card" style="max-width:620px;width:90%;background:var(--surface);padding:24px;border-radius:8px;">
      <div class="card__header" style="margin-bottom:20px;display:flex;align-items:flex-start;gap:12px">
        <span style="font-size:1.25rem;font-weight:600">${esc(m.vorname || '')} ${esc(m.nachname || '')}</span>
        <button class="btn btn--sm btn--outline" onclick="this.closest('.error-overlay').remove()" style="margin-left:auto">Schließen</button>
      </div>
      <div class="mitglied-detail">
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
      <hr style="margin:16px 0;border:none;height:1px;background:var(--border);">
      <button class="btn btn--sm btn--outline" id="btn-vorgaenge">${icon('history', 14)} Mitgliedschaftsvorgänge</button>
    </div>
  `;
  document.body.appendChild(overlay);
  document.querySelector('.error-overlay button').addEventListener('click', () => overlay.remove());
  document.getElementById('btn-vorgaenge')?.addEventListener('click', () => showVorgaenge(m.id));
}

// ── Seiten: Anwerter ──────────────────────────────────────────────────────────

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
      ${canCreate ? '<button class="btn btn--primary" id="btn-new-anwerter">Neuen Anwerter anlegen</button>' : ''}
    </div>
    <div id="anwerter-list"></div>
  `;

  if (canCreate) document.getElementById('btn-new-anwerter').addEventListener('click', () => showAnwerterForm());

  let anwaeter;
  try {
    anwaeter = tab === 'archiviert' ? await api.getAnwaeterArchiviert() : await api.getAnwaeter();
  } catch { anwaeter = []; }

  if (!anwaeter.length) {
    c.innerHTML += `
      <div class="empty-state">
        <span class="icon icon--large">👦</span>
        <p>Keine Anwärter vorhanden</p>
        ${canCreate ? '<button class="btn btn--primary" id="btn-new-anw-empty">Neuen Anwerter anlegen</button>' : ''}
      </div>`;
    if (canCreate) document.getElementById('btn-new-anw-empty')?.addEventListener('click', () => showAnwerterForm());
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
          <div class="form-group form-group--half">
            <label>Plz</label>
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
            <label>Geschlecht <span class="required">*</span></label>
            <select id="fld-a-geschlecht" required>
              <option value="männlich" ${a && a.geschlecht === 'männlich' ? 'selected' : ''}>männlich</option>
              <option value="weiblich" ${a && a.geschlecht === 'weiblich' ? 'selected' : ''}>weiblich</option>
              <option value="divers" ${a && a.geschlecht === 'divers' ? 'selected' : ''}>divers</option>
            </select>
          </div>
          <div class="form-group form-group--half">
            <label>Eintrittsdatum <span class="required">*</span></label>
            <input type="date" id="fld-a-eintrittsdatum" value="${a ? a.eintrittsdatum : ''}" required />
          </div>
          <div class="form-group form-group--half">
            <label>Status</label>
            <select id="fld-a-status">
              <option value="aktiv" ${a && a.status === 'aktiv' ? 'selected' : ''}>Aktiv</option>
              <option value="aufgenommen" ${a && a.status === 'aufgenommen' ? 'selected' : ''}>Aufgenommen</option>
              <option value="abgemeldet" ${a && a.status === 'abgemeldet' ? 'selected' : ''}>Abgemeldet</option>
              <option value="archiviert" ${a && a.status === 'archiviert' ? 'selected' : ''}>Archiviert</option>
            </select>
          </div>
          <div class="form-group form-group--half">
            <label>Erstkontakt</label>
            <input type="date" id="fld-a-erstkontakt" value="${a ? (a.erstkontakt || new Date().toISOString().slice(0, 10)) : new Date().toISOString().slice(0, 10)}" />
          </div>
          <div class="form-group form-group--half">
            <label>Telefonnummer</label>
            <input type="tel" id="fld-a-telefonnummer" placeholder="Telefonnummer" value="${a ? esc(a.telefon || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>E-Mail</label>
            <input type="email" id="fld-a-email" placeholder="E-Mail-Adresse" value="${a ? esc(a.email || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Erziehungsberechtigte – Vorname</label>
            <input type="text" id="fld-a-eltern-vorname" placeholder="Vorname" value="${a ? esc(a.eltern_vorname || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Erziehungsberechtigte – Nachname</label>
            <input type="text" id="fld-a-eltern-nachname" placeholder="Nachname" value="${a ? esc(a.eltern_nachname || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Eltern – Telefon</label>
            <input type="tel" id="fld-a-eltern-telefon" placeholder="Telefonnummer" value="${a ? esc(a.eltern_telefonnummer || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>Eltern – E-Mail</label>
            <input type="email" id="fld-a-eltern-email" placeholder="E-Mail-Adresse" value="${a ? esc(a.eltern_email || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--full">
            <label>Bemerkung</label>
            <textarea id="fld-a-bemerkung" rows="3" placeholder="Bemerkungen">${a ? esc(a.bemerkung || '') : ''}</textarea>
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
    const plz = document.getElementById('fld-a-plz').value.trim();
    const ort = document.getElementById('fld-a-ort').value.trim();
    const ortsteil = document.getElementById('fld-a-ortsteil').value.trim();
    const eintrittsdatum = document.getElementById('fld-a-eintrittsdatum').value;
    if (!geburtsdatum || !eintrittsdatum) { toast('Geburts- und Eintrittsdatum sind Pflichtfelder', 'error'); return; }
    const geschlecht = document.getElementById('fld-a-geschlecht').value;
    if (!geschlecht) { toast('Geschlecht ist ein Pflichtfeld', 'error'); return; }
    const telefon = document.getElementById('fld-a-telefonnummer').value.trim();
    if (!telefon) { toast('Telefonnummer ist ein Pflichtfeld', 'error'); return; }
    const email = document.getElementById('fld-a-email').value.trim();
    if (!email) { toast('E-Mail-Adresse ist ein Pflichtfeld', 'error'); return; }
    const eltern_vorname = document.getElementById('fld-a-eltern-vorname').value.trim();
    const eltern_nachname = document.getElementById('fld-a-eltern-nachname').value.trim();
    const today = new Date().toISOString().slice(0, 10);
    if (geburtsdatum > today) { toast('Geburtsdatum darf nicht in der Zukunft liegen', 'error'); return; }

    const body = {
      vorname,
      nachname,
      geburtsdatum,
      plz,
      ort,
      ortsteil,
      eintrittsdatum,
      telefon,
      email,
      eltern_vorname,
      eltern_nachname,
      eltern_telefonnummer,
      erstkontakt: document.getElementById('fld-a-erstkontakt').value || null,
      status: document.getElementById('fld-a-status').value,
      bemerkung: document.getElementById('fld-a-bemerkung').value || null,
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

// ── Anwerter → Dienstteilnahmen ───────────────────────────────────────────────

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
          <h3 style="margin:0;font-size:1.1rem">Dienstteilnahmen – ${esc(a.vorname || '')} ${a.nachname || ''}</h3>
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
    const overlay = document.querySelector('.error-overlay');
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
      overlay.querySelector('.card').appendChild(box);
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
      <button class="tab-btn active" data-ktab="artikel">Artikel &amp; Bestand</button>
      <button class="tab-btn" data-ktab="ausgaben">Ausgaben &amp; R&uuml;ckgaben</button>
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
  renderKleiderkammerSubtab('artikel', state);
  renderIcons(container);
}

async function renderKleiderkammerSubtab(subtab, state) {
  const container = document.getElementById('ktab-content');
  if (subtab === 'artikel') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:1.1rem">Lagerartikel</h3>
        ${state.canWriteKleiderkammer ? '<button class="btn btn--primary btn--sm" id="btn-new-artikel">Neuen Lagerartikel anlegen</button>' : ''}
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
        tbody.innerHTML = `<tr><td colspan="6" class="wrap-loading">Keine Lagerartikel vorhanden</td></tr>`;
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
      }
    } catch (e) {
      document.getElementById('artikel-list').innerHTML = `<tr><td colspan="6">Fehler beim Laden: ${esc(e.message)}</td></tr>`;
    }
  } else if (subtab === 'ausgaben') {
    container.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
        <h3 style="margin:0;font-size:1.1rem">Ausgaben &amp; R&uuml;ckgaben</h3>
        ${state.canWriteKleiderkammer ? '<button class="btn btn--primary btn--sm" id="btn-new-ausgabe">Neue Ausgabe</button>' : ''}
      </div>
      <table class="jugend-table" style="width:100%">
        <thead>
          <tr><th>Datum</th><th>Mitglied</th><th>Artikel</th><th>Menge</th><th>R&uuml;ckgabe</th><th>Bemerkung</th><th>Aktionen</th></tr>
        </thead>
        <tbody id="ausgaben-list">
          <tr><td colspan="7" class="wrap-loading">Lade...</td></tr>
        </tbody>
      </table>
    `;

    try {
      const ausgaben = await api.getKleiderausgaben();
      const tbody = document.getElementById('ausgaben-list');
      if (!ausgaben.length) {
        tbody.innerHTML = `<tr><td colspan="7" class="wrap-loading">Keine Ausgaben vorhanden</td></tr>`;
      } else {
        tbody.innerHTML = ausgaben.map(a => `
          <tr data-id="${a.id}">
            <td class="jugend-geburtsdatum">${formatDatumDeutsch(a.ausgabedatum)}</td>
            <td class="jugend-name">${esc(a.mitglied_name)}</td>
            <td class="jugend-name">${esc(a.lagerartikel_name)}</td>
            <td><strong>${a.menge}</strong></td>
            <td>${a.rueckgabe_menge != null ? `${a.rueckgabe_menge} ${a.rueckgabedatum ? '(' + formatDatumDeutsch(a.rueckgabedatum) + ')' : ''}` : '&ndash;'}</td>
            <td class="jugend-bemerkung">${esc(a.bemerkung || '')}</td>
            <td class="jugend-actions">
              ${a.rueckgabe_menge == null || a.rueckgabe_menge < a.menge ? `
                <button class="btn btn--small btn--outline rueckgabe-ausgabe" data-id="${a.id}" data-mitglied="${a.mitglied_name}" data-artikel="${a.lagerartikel_name}" data-offen="${a.menge - (a.rueckgabe_menge || 0)}">R&uuml;ckgabe</button>
              ` : ''}
            </td>
          </tr>
        `).join('');
        renderIcons(tbody);
      }
      if (state.canWriteKleiderkammer) {
        tbody?.querySelectorAll('.rueckgabe-ausgabe').forEach(b => {
          b.addEventListener('click', () => showRueckgabeForm(b.dataset.id, b.dataset.mitglied, b.dataset.artikel, +b.dataset.offen));
        });
      }
      document.getElementById('btn-new-ausgabe')?.addEventListener('click', () => showAusgabeForm());
    } catch (e) {
      document.getElementById('ausgaben-list').innerHTML = `<tr><td colspan="7">Fehler beim Laden: ${esc(e.message)}</td></tr>`;
    }
  }
}

async function showLagerartikelForm(l = null) {
  const container = document.getElementById('ktab-content');
  if (!container) return;
  const isEdit = !!l;

  // Determine current sizes for the form
  const currentGroessen = l && l.groessen ? (Array.isArray(l.groessen) ? l.groessen : []) : [];
  const currentMengeProGroesse = l && l.menge_per_groesse ? l.menge_per_groesse : {};
  const defaultGroessen = ['S', 'M', 'L', 'XL', 'XXL'];

  container.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${isEdit ? 'Lagerartikel bearbeiten' : 'Neuen Lagerartikel anlegen'}</span>
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
          <div class="form-group form-group--full">
            <label>Bestand pro Größe (durch Komma getrennt; Reihenfolge muss den Größen entsprechen)</label>
            <input type="text" id="fld-l-menge-pro-groesse" placeholder="z.B.5,10,8,6,4" value="${l ? Object.entries(currentMengeProGroesse).map(([k,v]) => v).join(',') : ''}" maxlength="50" />
            <small class="form-text--small">Beispiel: 5,10,8,6,4 (entspricht S=5,M=10,L=8,XL=6,XXL=4)</small>
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
    renderKleiderkammerSubtab('artikel', window.__jfKleiderState);
  });

  document.getElementById('artikel-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();

    const name = document.getElementById('fld-l-name').value.trim();
    if (!name) { toast('Name ist ein Pflichtfeld', 'error'); return; }

    // Größen verarbeiten
    const groessenInput = document.getElementById('fld-l-groessen').value.trim();
    const groessen = groessenInput ? groessenInput.split(',').map(g => g.trim()).filter(g => g.length > 0) : [];

    // Bestand pro Größe verarbeiten
    const mengeProGroesseInput = document.getElementById('fld-l-menge-pro-groesse').value.trim();
    const mengeProGroesse = mengeProGroesseInput ? mengeProGroesseInput.split(',').map(m => parseInt(m.trim(), 10) || 0) : [];

    // Sicherstellen, dass die Arrays gleiche Länge haben
    while (mengeProGroesse.length < groessen.length) {
      mengeProGroesse.push(0);
    }
    mengeProGroesse.length = Math.min(mengeProGroesse.length, groessen.length);

    const einheit = document.getElementById('fld-l-einheit').value.trim() || 'Stück';

    // Gesamtmenge berechnen
    const gesamtMenge = mengeProGroesse.reduce((sum, m) => sum + m, 0);

    const body = {
      name,
      beschreibung: document.getElementById('fld-l-beschreibung').value || null,
      groessen,
      menge_per_groesse: mengeProGroesse.length > 0 ? mengeProGroesse : null,
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
      renderKleiderkammerSubtab('artikel', window.__jfKleiderState);
    } catch (e) { toast(e.message || 'Fehler beim Speichern', 'error'); }
  });
}

async function showAusgabeForm() {
  const container = document.getElementById('ktab-content');
  if (!container) return;

  let mitglieder = [];
  let artikel = [];
  try {
    [mitglieder, artikel] = await Promise.all([api.getJugendmitglieder(), api.getLagerartikel()]);
  } catch { /* ignore */ }

  // Filter articles with stock > 0
  const artikelMitBestand = artikel.filter(a => a.menge > 0);

  container.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>Kleidung ausgeben</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-ausgabe">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="ausgabe-form-el" class="form-grid">
          <div class="form-group form-group--half">
            <label>Mitglied <span class="required">*</span></label>
            <select id="fld-aus-mitglied" required>
              <option value="">&mdash; ausw&auml;hlen &mdash;</option>
              ${mitglieder.filter(m => !m.archiviert).map(m => `<option value="${m.id}">${esc(m.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group form-group--half">
            <label>Lagerartikel <span class="required">*</span></label>
            <select id="fld-aus-artikel" required>
              <option value="">&mdash; ausw&auml;hlen &mdash;</option>
              ${artikelMitBestand.map(a => {
                const groessen = Array.isArray(a.groessen) ? a.groessen : [];
                const mengePerGroesse = (a.menge_per_groesse && typeof a.menge_per_groesse === 'object') ? a.menge_per_groesse : {};
                const groessenHtml = groessen.length ? groessen.map(g => `${g}:${mengePerGroesse[g] ?? 0}`).join(',') : 'Keine Größen';
                return `<option value="${a.id}" data-menge="${a.menge}" data-groessen='${JSON.stringify(groessenHtml)}'>${esc(a.name)} (${a.menge} ${a.einheit || 'St&uuml;ck'})</option>`;
              }).join('')}
            </select>
          </div>
          <div class="form-group form-group--half">
            <label>Größe</label>
            <select id="fld-aus-groesse" disabled>
              <option value="">&mdash; zuerst Artikel w&auml;hlen &mdash;</option>
            </select>
          </div>
          <div class="form-group form-group--half">
            <label>Verfügbar in dieser Größe</label>
            <input type="text" id="fld-aus-verfuegbar" readonly style="background:#f5f5f5;" />
          </div>
          <div class="form-group form-group--half">
            <label>Menge <span class="required">*</span></label>
            <input type="number" id="fld-aus-menge" min="1" value="1" required />
          </div>
          <div class="form-group form-group--half">
            <label>Ausgabedatum</label>
            <input type="date" id="fld-aus-datum" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
          <div class="form-group form-group--full">
            <label>Bemerkung</label>
            <textarea id="fld-aus-bemerkung" rows="2"></textarea>
          </div>
          <div class="form-group form-group--full" style="margin-top:12px">
            <button type="submit" class="btn btn--primary">Ausgeben</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel-ausgabe').addEventListener('click', () => {
    renderKleiderkammerSubtab('ausgaben', window.__jfKleiderState);
  });

  const selArtikel = document.getElementById('fld-aus-artikel');
  const selGroesse = document.getElementById('fld-aus-groesse');
  const inpVerfuegbar = document.getElementById('fld-aus-verfuegbar');
  const inpMenge = document.getElementById('fld-aus-menge');

  // Größen aktualisieren wenn Artikel gewählt
  selArtikel.addEventListener('change', () => {
    const opt = selArtikel.options[selArtikel.selectedIndex];
    selGroesse.innerHTML = '<option value="">&mdash; Gr&ouml;&szlig;e w&auml;hlen &mdash;</option>';
    inpVerfuegbar.value = '';
    inpMenge.max = 1;

    if (!opt.value) {
      selGroesse.disabled = true;
      return;
    }

    // Größen aus data-groessen parsen
    let groessenStr = opt.dataset.groessen || '';
    if (groessenStr && groessenStr !== 'Keine Größen') {
      groessenStr.split(',').forEach(pair => {
        const [g, m] = pair.split(':');
        const option = document.createElement('option');
        option.value = g.trim();
        option.textContent = `${g.trim()} (${m} St&uuml;ck verf&uuml;gbar)`;
        option.dataset.menge = m;
        selGroesse.appendChild(option);
      });
      selGroesse.disabled = false;
    } else {
      selGroesse.disabled = true;
      inpVerfuegbar.value = 'Keine Größen definiert';
    }
  });

  // Verfügbares Bestands anzeigen wenn Größe gewählt
  selGroesse.addEventListener('change', () => {
    const opt = selGroesse.options[selGroesse.selectedIndex];
    if (opt && opt.dataset.menge) {
      inpVerfuegbar.value = `${opt.dataset.menge} St&uuml;ck verf&uuml;gbar`;
      inpMenge.max = opt.dataset.menge;
    } else {
      inpVerfuegbar.value = '';
      inpMenge.max = 1;
    }
  });

  document.getElementById('ausgabe-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mitgliedId = document.getElementById('fld-aus-mitglied').value;
    const artikelId = document.getElementById('fld-aus-artikel').value;
    const groesse = document.getElementById('fld-aus-groesse').value;
    const menge = +document.getElementById('fld-aus-menge').value;
    if (!mitgliedId || !artikelId) { toast('Mitglied und Artikel sind Pflichtfelder', 'error'); return; }
    if (menge <= 0) { toast('Menge muss gr&ouml;ßer als 0 sein', 'error'); return; }
    // Wenn Größen definiert, muss eine gewählt werden
    if (selGroesse.disabled === false && !groesse) { toast('Bitte Gr&ouml;&szlig;e w&auml;hlen', 'error'); return; }
    const opt = selGroesse.options[selGroesse.selectedIndex];
    const maxMenge = opt && opt.dataset.menge ? +opt.dataset.menge : (selArtikel.options[selArtikel.selectedIndex].dataset.menge || 1);
    if (menge > maxMenge) { toast(`Nicht genug Lagerbestand (verf&uuml;gbar: ${maxMenge})`, 'error'); return; }

    try {
      await api.createKleiderausgabe({
        mitglied_id: mitgliedId,
        lagerartikel_id: artikelId,
        menge,
        groesse,
        bemerkung: document.getElementById('fld-aus-bemerkung').value || null,
      });
      toast('Kleidung wurde ausgegeben', 'success');
      renderKleiderkammerSubtab('ausgaben', window.__jfKleiderState);
    } catch (e) { toast(e.message || 'Fehler bei der Ausgabe', 'error'); }
  });
}

async function showRueckgabeForm(ausgabeId, mitgliedName, artikelName, offeneMenge) {
  const container = document.getElementById('ktab-content');
  if (!container) return;

  container.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>R&uuml;ckgabe &ndash; ${esc(mitgliedName)} / ${esc(artikelName)}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-rueckgabe">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="rueckgabe-form-el" class="form-grid">
          <div class="form-group form-group--full">
            <p style="margin:0">Noch offen: <strong>${offeneMenge}</strong> St&uuml;ck</p>
          </div>
          <div class="form-group form-group--half">
            <label>R&uuml;ckgabemenge <span class="required">*</span></label>
            <input type="number" id="fld-r-menge" min="1" max="${offeneMenge}" value="${offeneMenge}" required />
          </div>
          <div class="form-group form-group--half">
            <label>R&uuml;ckgabedatum</label>
            <input type="date" id="fld-r-datum" value="${new Date().toISOString().slice(0, 10)}" />
          </div>
          <div class="form-group form-group--full">
            <label>Bemerkung</label>
            <textarea id="fld-r-bemerkung" rows="2" placeholder="z.B. Schaden, Grund der R&uuml;ckgabe"></textarea>
          </div>
          <div class="form-group form-group--full" style="margin-top:12px">
            <button type="submit" class="btn btn--primary">R&uuml;ckgabe</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.getElementById('btn-cancel-rueckgabe').addEventListener('click', () => {
    renderKleiderkammerSubtab('ausgaben', window.__jfKleiderState);
  });

  document.getElementById('rueckgabe-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();
    const menge = +document.getElementById('fld-r-menge').value;
    if (menge <= 0) { toast('Menge muss gr&ouml;ßer als 0 sein', 'error'); return; }
    if (menge > offeneMenge) { toast(`R&uuml;ckgabemenge darf ${offeneMenge} nicht &uuml;berschreiten`, 'error'); return; }

    try {
      await api.rueckgabeKleiderausgabe(ausgabeId, {
        rueckgabe_menge: menge,
        rueckgabedatum: document.getElementById('fld-r-datum').value || null,
        bemerkung: document.getElementById('fld-r-bemerkung').value || null,
        rueckgabe_bemerkung: document.getElementById('fld-r-bemerkung').value || null,
      });
      toast('R&uuml;ckgabe erfasst &ndash; Bestand wurde aktualisiert', 'success');
      renderKleiderkammerSubtab('ausgaben', window.__jfKleiderState);
    } catch (e) { toast(e.message || 'Fehler bei der R&uuml;ckgabe', 'error'); }
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

