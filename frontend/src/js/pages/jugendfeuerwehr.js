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

  if (canWrite) document.getElementById('btn-new-mitglied').addEventListener('click', () => showMemberForm());

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
    if (canWrite) document.getElementById('btn-new-mid-empty')?.addEventListener('click', () => showMemberForm());
    return;
  }

  c.innerHTML += `
    <table class="jugend-table">
      <thead>
        <tr>
          <th>Name</th><th>Geburt</th><th>Alter</th><th>Eintritt</th><th>Austritt</th>
          <th>Geschlecht</th><th>Telefon</th><th>E-Mail</th><th>Juleica</th><th>Status</th><th>Aktionen</th>
        </tr>
      </thead>
      <tbody>
        ${mitglieder.map((m, idx) => {
          const arch = m.archiviert;
          return `
          <tr class="jugend-row ${!canWrite ? 'jugend-row--readonly' : ''}" style="animation-delay:${idx * 0.06}s">
            <td class="jugend-name"><strong>${esc(m.name)}</strong></td>
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
              <button class="btn btn--small btn--secondary view-mitglied" data-id="${m.id}">Details</button>
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
      b.addEventListener('click', () => showMemberForm(mitglieder.find(x => x.id === b.dataset.id)));
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

async function showMemberForm(m = null) {
  const c = document.getElementById('tab-content');
  const list = document.getElementById('mitglieder-list');
  if (!c) return;
  if (list) list.style.display = 'none';

  const isEdit = !!m;

  c.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${isEdit ? 'Mitglied bearbeiten' : 'Neues Mitglied'}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-member">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="member-form-el" class="form-grid">
          <div class="form-group form-group--full">
            <label>Name <span class="required">*</span></label>
            <input type="text" id="fld-name" placeholder="Vor- und Nachname" value="${m ? esc(m.name) : ''}" required maxlength="200" />
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
            <label>Geschlecht <span class="required">*</span></label>
            <select id="fld-geschlecht" required>
              <option value="männlich" ${m && m.geschlecht === 'männlich' ? 'selected' : ''}>männlich</option>
              <option value="weiblich" ${m && m.geschlecht === 'weiblich' ? 'selected' : ''}>weiblich</option>
              <option value="divers" ${m && m.geschlecht === 'divers' ? 'selected' : ''}>divers</option>
            </select>
          </div>
          <div class="form-group form-group--full">
            <label>Adresse</label>
            <input type="text" id="fld-adresse" placeholder="Straße, Hausnummer, PLZ, Ort" value="${m ? esc(m.adresse || '') : ''}" maxlength="200" />
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
            <label>Eltern / Erziehungsberechtigte – Name</label>
            <input type="text" id="fld-eltern-name" placeholder="Name" value="${m ? esc(m.eltern_name || '') : ''}" />
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
    const name = document.getElementById('fld-name').value.trim();
    if (!name) { toast('Name ist ein Pflichtfeld', 'error'); return; }
    const geburtsdatum = document.getElementById('fld-geburtsdatum').value;
    const eintrittsdatum = document.getElementById('fld-eintrittsdatum').value;
    if (!geburtsdatum || !eintrittsdatum) { toast('Geburts- und Eintrittsdatum sind Pflichtfelder', 'error'); return; }
    const geschlecht = document.getElementById('fld-geschlecht').value;
    if (!geschlecht) { toast('Geschlecht ist ein Pflichtfeld', 'error'); return; }
    const today = new Date().toISOString().slice(0, 10);
    if (geburtsdatum > today) { toast('Geburtsdatum darf nicht in der Zukunft liegen', 'error'); return; }

    const body = {
      name,
      geburtsdatum,
      eintrittsdatum,
      austrittsdatum: document.getElementById('fld-austrittsdatum').value || null,
      geschlecht,
      adresse: document.getElementById('fld-adresse').value || null,
      telefon: document.getElementById('fld-telefon').value || null,
      email: document.getElementById('fld-email').value || null,
      eltern_name: document.getElementById('fld-eltern-name').value || null,
      eltern_telefon: document.getElementById('fld-eltern-telefon').value || null,
      eltern_email: document.getElementById('fld-eltern-email').value || null,
      juleica: document.getElementById('fld-juleica').checked,
      juleica_ablauf: document.getElementById('fld-juleica-ablauf').value || null,
      bemerkung: document.getElementById('fld-bemerkung').value || null,
      archiviert: m?.archiviert ? true : null,
    };

    try {
      if (isEdit) {
        await api.updateJugendmitglied(m.id, body);
        toast('Mitglied aktualisiert', 'success');
      } else {
        await api.createJugendmitglied(body);
        toast('Mitglied angelegt', 'success');
      }
      const tab = c.closest('.jugend-tabs') ? c.querySelector('.jugend-tabs .tab-btn.active')?.dataset.tab : 'aktiv';
      window.__jfMitgliederState = state;
      c.innerHTML = '';
      if (list) list.style.display = '';
      await renderMitgliederTab(tab || 'aktiv', state);
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
    <div class="card" style="max-width:500px;width:90%;background:var(--surface);padding:24px;border-radius:8px;">
      <div class="card__header" style="margin-bottom:16px">
        <span style="font-size:1.1rem;font-weight:600">${esc(m.name)}</span>
        <button class="btn btn--sm btn--outline" onclick="this.closest('.error-overlay').remove()" style="float:right">Schließen</button>
      </div>
      <div style="font-size:0.9rem;line-height:1.6">
        <p><strong>Geburtsdatum:</strong> ${formatDatumDeutsch(m.geburtsdatum)}</p>
        <p><strong>Alter:</strong> ${m.alter_jahre ?? '-'} Jahre</p>
        <p><strong>Eintritt:</strong> ${formatDatumDeutsch(m.eintrittsdatum)}</p>
        <p><strong>Austritt:</strong> ${m.austrittsdatum ? formatDatumDeutsch(m.austrittsdatum) : '–'}</p>
        <p><strong>Geschlecht:</strong> ${GESCHLECHT_LABELS[m.geschlecht] || m.geschlecht}</p>
        ${m.adresse ? `<p><strong>Adresse:</strong> ${esc(m.adresse)}</p>` : ''}
        ${m.telefon ? `<p><strong>Telefon:</strong> ${esc(m.telefon)}</p>` : ''}
        ${m.email ? `<p><strong>E-Mail:</strong> ${esc(m.email)}</p>` : ''}
        ${m.eltern_name ? `<p><strong>Eltern (Name):</strong> ${esc(m.eltern_name)}</p>` : ''}
        ${m.eltern_telefon ? `<p><strong>Eltern (Telefon):</strong> ${esc(m.eltern_telefon)}</p>` : ''}
        ${m.eltern_email ? `<p><strong>Eltern (E-Mail):</strong> ${esc(m.eltern_email)}</p>` : ''}
        <p><strong>Juleica:</strong> ${m.juleica ? 'Ja' : 'Nein'}${m.juleica_ablauf ? ` (gültig bis ${formatDatumDeutsch(m.juleica_ablauf)})` : ''}</p>
        ${m.bemerkung ? `<p><strong>Bemerkung:</strong> ${esc(m.bemerkung)}</p>` : ''}
        <p><strong>Status:</strong> ${m.archiviert ? 'Archiviert' : 'Aktiv'}</p>
        <hr style="margin:16px 0;border:none;height:1px;background:var(--border);">
        <button class="btn btn--sm btn--outline" id="btn-vorgaenge">${icon('history', 14)} Mitgliedschaftsvorgänge</button>
      </div>
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
  renderHeader(container, 'Anwerter', 'Anwerter verwalten und bewerben');

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
          <tr><th>Name</th><th>Geburt</th><th>Alter</th><th>Eintritt</th><th>Status</th><th>Aktionen</th></tr>
        </thead>
        <tbody>
          ${anwaeter.map(a => `
          <tr data-id="${a.id}">
            <td class="jugend-name"><strong>${esc(a.name)}</strong></td>
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

  c.innerHTML = `
    <div class="card">
      <div class="card__header">
        <span>${isEdit ? 'Anwerter bearbeiten' : 'Neuen Anwerter anlegen'}</span>
        <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-anwerter">Abbrechen</button>
      </div>
      <div class="card__body card__body--flush">
        <form id="anwerter-form-el" class="form-grid">
          <div class="form-group form-group--full">
            <label>Name <span class="required">*</span></label>
            <input type="text" id="fld-a-name" placeholder="Vor- und Nachname" value="${a ? esc(a.name) : ''}" required maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Geburtsdatum <span class="required">*</span></label>
            <input type="date" id="fld-a-geburtsdatum" value="${a ? a.geburtsdatum : ''}" required />
          </div>
          <div class="form-group form-group--half">
            <label>Eintrittsdatum <span class="required">*</span></label>
            <input type="date" id="fld-a-eintrittsdatum" value="${a ? a.eintrittsdatum : ''}" required />
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
            <label>Status</label>
            <select id="fld-a-status">
              <option value="aktiv" ${a && a.status === 'aktiv' ? 'selected' : ''}>Aktiv</option>
              <option value="aufgenommen" ${a && a.status === 'aufgenommen' ? 'selected' : ''}>Aufgenommen</option>
              <option value="abgemeldet" ${a && a.status === 'abgemeldet' ? 'selected' : ''}>Abgemeldet</option>
              <option value="archiviert" ${a && a.status === 'archiviert' ? 'selected' : ''}>Archiviert</option>
            </select>
          </div>
          <div class="form-group form-group--full">
            <label>Adresse</label>
            <input type="text" id="fld-a-adresse" placeholder="Straße, Hausnummer, PLZ, Ort" value="${a ? esc(a.adresse || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--half">
            <label>Telefon</label>
            <input type="tel" id="fld-a-telefon" placeholder="Telefonnummer" value="${a ? esc(a.telefon || '') : ''}" maxlength="50" />
          </div>
          <div class="form-group form-group--half">
            <label>E-Mail</label>
            <input type="email" id="fld-a-email" placeholder="E-Mail-Adresse" value="${a ? esc(a.email || '') : ''}" maxlength="200" />
          </div>
          <div class="form-group form-group--full">
            <label>Eltern / Erziehungsberechtigte – Name</label>
            <input type="text" id="fld-a-eltern-name" placeholder="Name" value="${a ? esc(a.eltern_name || '') : ''}" />
          </div>
          <div class="form-group form-group--half">
            <label>Eltern – Telefon</label>
            <input type="tel" id="fld-a-eltern-telefon" placeholder="Telefonnummer" value="${a ? esc(a.eltern_telefon || '') : ''}" maxlength="50" />
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
    const name = document.getElementById('fld-a-name').value.trim();
    if (!name) { toast('Name ist ein Pflichtfeld', 'error'); return; }
    const geburtsdatum = document.getElementById('fld-a-geburtsdatum').value;
    const eintrittsdatum = document.getElementById('fld-a-eintrittsdatum').value;
    if (!geburtsdatum || !eintrittsdatum) { toast('Geburts- und Eintrittsdatum sind Pflichtfelder', 'error'); return; }
    const geschlecht = document.getElementById('fld-a-geschlecht').value;
    const today = new Date().toISOString().slice(0, 10);
    if (geburtsdatum > today) { toast('Geburtsdatum darf nicht in der Zukunft liegen', 'error'); return; }

    const body = {
      name,
      geburtsdatum,
      eintrittsdatum,
      geschlecht,
      status: document.getElementById('fld-a-status').value,
      adresse: document.getElementById('fld-a-adresse').value || null,
      telefon: document.getElementById('fld-a-telefon').value || null,
      email: document.getElementById('fld-a-email').value || null,
      eltern_name: document.getElementById('fld-a-eltern-name').value || null,
      eltern_telefon: document.getElementById('fld-a-eltern-telefon').value || null,
      eltern_email: document.getElementById('fld-a-eltern-email').value || null,
      bemerkung: document.getElementById('fld-a-bemerkung').value || null,
    };

    try {
      if (isEdit) {
        await api.updateAnwerter(a.id, body);
        toast('Anwerter aktualisiert', 'success');
      } else {
        await api.createAnwerter(body);
        toast('Anwerter angelegt', 'success');
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
          <h3 style="margin:0;font-size:1.1rem">Dienstteilnahmen – ${esc(anwerter.name)}</h3>
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
          <tr><th>Name</th><th>Beschreibung</th><th>Menge</th><th>Einheit</th><th>Aktionen</th></tr>
        </thead>
        <tbody id="artikel-list">
          <tr><td colspan="5" class="wrap-loading">Lade...</td></tr>
        </tbody>
      </table>
    `;

    try {
      const artikel = await api.getLagerartikel();
      const tbody = document.getElementById('artikel-list');
      if (!artikel.length) {
        tbody.innerHTML = `<tr><td colspan="5" class="wrap-loading">Keine Lagerartikel vorhanden</td></tr>`;
      } else {
        tbody.innerHTML = artikel.map(a => `
          <tr data-id="${a.id}">
            <td class="jugend-name"><strong>${esc(a.name)}</strong></td>
            <td class="jugend-bemerkung">${esc(a.beschreibung || '-')}</td>
            <td><strong>${a.menge}</strong></td>
            <td>${a.einheit || 'St&uuml;ck'}</td>
            <td class="jugend-actions">
              ${state.canWriteKleiderkammer ? `
                <button class="btn btn--small btn--info edit-artikel" data-id="${a.id}">Bearbeiten</button>
                <button class="btn btn--small btn--danger delete-artikel" data-id="${a.id}">L&ouml;schen</button>
              ` : `<button class="btn btn--small btn--secondary" data-id="${a.id}">Ausgeben</button>`}
            </td>
          </tr>
        `).join('');
        renderIcons(tbody);
      }
      if (state.canWriteKleiderkammer) {
        document.getElementById('btn-new-artikel')?.addEventListener('click', () => showLagerartikelForm());
      }
    } catch (e) {
      document.getElementById('artikel-list').innerHTML = `<tr><td colspan="5">Fehler beim Laden: ${esc(e.message)}</td></tr>`;
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
          <div class="form-group form-group--half">
            <label>Menge <span class="required">*</span></label>
            <input type="number" id="fld-l-menge" placeholder="0" value="${l ? l.menge : 0}" min="0" required />
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
    const mengeStr = document.getElementById('fld-l-menge').value;
    const menge = parseInt(mengeStr, 10);
    if (isNaN(menge) || menge < 0) { toast('Menge muss eine nicht-negative Zahl sein', 'error'); return; }

    const body = {
      name,
      beschreibung: document.getElementById('fld-l-beschreibung').value || null,
      menge,
      einheit: document.getElementById('fld-l-einheit').value || null,
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
              ${artikel.filter(a => a.menge > 0).map(a => `<option value="${a.id}" data-menge="${a.menge}">${esc(a.name)} (${a.menge} ${a.einheit || 'St&uuml;ck'})</option>`).join('')}
            </select>
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

  const sel = document.getElementById('fld-aus-artikel');
  const updateMengeMax = () => {
    const opt = sel.options[sel.selectedIndex];
    document.getElementById('fld-aus-menge').max = opt.dataset.menge || 1;
  };
  sel.addEventListener('change', updateMengeMax);
  updateMengeMax();

  document.getElementById('ausgabe-form-el').addEventListener('submit', async (e) => {
    e.preventDefault();
    const mitgliedId = document.getElementById('fld-aus-mitglied').value;
    const artikelId = document.getElementById('fld-aus-artikel').value;
    const menge = +document.getElementById('fld-aus-menge').value;
    if (!mitgliedId || !artikelId) { toast('Mitglied und Artikel sind Pflichtfelder', 'error'); return; }
    if (menge <= 0) { toast('Menge muss gr&ouml;ßer als 0 sein', 'error'); return; }
    const opt = sel.options[sel.selectedIndex];
    if (menge > +opt.dataset.menge) { toast(`Nicht genug Lagerbestand (verf&uuml;gbar: ${opt.dataset.menge})`, 'error'); return; }

    try {
      await api.createKleiderausgabe({
        mitglied_id: mitgliedId,
        lagerartikel_id: artikelId,
        menge,
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

