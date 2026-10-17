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

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function formatDatum(iso) {
  if (!iso) return '-';
  return iso.slice(0, 10);
}

function formatDatumDeutsch(iso) {
  if (!iso) return '-';
  const parts = iso.slice(0, 10).split('-');
  return `${parts[2]}.${parts[1]}.${parts[0]}`;
}

// ── Hauptseite ───────────────────────────────────────────────────────────────

export async function renderJugendfeuerwehr() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('jugendfeuerwehr');

  const content = document.getElementById('page-content');
  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
  const perms = user?.permissions || [];

  // Granular permissions per requirement specification
  const canReadMitglieder = isAdmin || perms.includes('jugendfeuerwehr.mitglieder.lesen') || perms.includes('jugendfeuerwehr.lesen');
  const canWriteMitglieder = isAdmin || perms.includes('jugendfeuerwehr.mitglieder') || perms.includes('jugendfeuerwehr');
  const canCreateAnwerter = isAdmin || perms.includes('jugendfeuerwehr.anwerter');
  const canWriteAnwerter = isAdmin || perms.includes('jugendfeuerwehr') || perms.includes('jugendfeuerwehr.anwerter');
  const canWriteDienstteilnahmen = isAdmin || perms.includes('jugendfeuerwehr.dienstteilnahmen');
  const canReadKleiderkammer = isAdmin || perms.includes('jugendfeuerwehr.kleiderkammer.lesen') || perms.includes('jugendfeuerwehr.lesen');
  const canWriteKleiderkammer = isAdmin || perms.includes('jugendfeuerwehr.kleiderkammer');
  const canWriteMitgliedschaftsvorgaenge = isAdmin || perms.includes('jugendfeuerwehr.mitgliedschaftsvorgaenge');

  const appState = {
    canReadMitglieder,
    canWriteMitglieder,
    canCreateAnwerter,
    canWriteAnwerter,
    canWriteDienstteilnahmen,
    canReadKleiderkammer,
    canWriteKleiderkammer,
    canWriteMitgliedschaftsvorgaenge
  };

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Jugendfeuerwehr</h2>
        <p>Verwaltung von Jugendmitgliedern, Anwertern und Kleiderkammer</p>
      </div>
    </div>
    <div class="jugend-tabs">
      <button class="tab-btn active" data-tab="mitglieder">Mitglieder</button>
      <button class="tab-btn" data-tab="anwerter">Anwerter</button>
      <button class="tab-btn" data-tab="kleiderkammer">Kleiderkammer</button>
      <button class="tab-btn" data-tab="dienstteilnahmen">Dienstteilnahmen</button>
    </div>
    <div id="tab-content"></div>
  `;

  // Render the active tab
  renderTab('mitglieder');
  renderIcons(content);

  // Lade Mitglieder
  const mitglieder = await api.getJugendmitglieder().catch(() => []);

  function renderList(items) {
    const grid = document.getElementById('jugend-list');
    if (!grid) return;

    if (!items.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <span class="icon icon--large">👦</span>
          <p>Keine Jugendmitglieder vorhanden</p>
          ${canWrite ? '<button class="btn btn--primary" id="btn-new-mid-empty">Neues Mitglied</button>' : ''}
        </div>`;
      const nb = document.getElementById('btn-new-mid-empty');
      if (nb) nb.addEventListener('click', () => showForm());
      return;
    }

    grid.innerHTML = `
      <table class="jugend-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Geburtsdatum</th>
            <th>Eintritt</th>
            <th>Austritt</th>
            <th>Geschlecht</th>
            <th>Telefon</th>
            <th>E-Mail</th>
            <th>Juleica</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          ${items.map((m, idx) => {
            const isAktiv = !m.austrittsdatum;
            return `
            <tr class="jugend-row ${isAktiv ? '' : 'jugend-row--inaktiv'}" style="animation-delay: ${idx * 0.06}s;">
              <td class="jugend-name"><strong>${esc(m.name)}</strong></td>
              <td class="jugend-geburtsdatum">${formatDatumDeutsch(m.geburtsdatum)}</td>
              <td class="jugend-eintritt">${formatDatumDeutsch(m.eintrittsdatum)}</td>
              <td class="jugend-austritt">${m.austrittsdatum ? formatDatumDeutsch(m.austrittsdatum) : '–'}</td>
              <td class="jugend-geschlecht">${GESCHLECHT_LABELS[m.geschlecht] || m.geschlecht}</td>
              <td class="jugend-telefon">${m.telefon || '–'}</td>
              <td class="jugend-email">${m.email || '–'}</td>
              <td class="jugend-juleica">${m.juleica ? '✓' : '–'}</td>
              <td class="jugend-actions">
                <button class="btn btn--small btn--secondary view-mitglied" data-id="${m.id}">Details</button>
                ${canWrite ? `
                  <button class="btn btn--small btn--info edit-mitglied" data-id="${m.id}">Bearbeiten</button>
                  <button class="btn btn--small btn--danger delete-mitglied" data-id="${m.id}">Löschen</button>
                ` : ''}
              </td>
            </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    `;

    // Details-Buttons
    document.querySelectorAll('.view-mitglied').forEach(b => {
      b.addEventListener('click', async () => {
        try {
          const m = await api.getJugendmitglied(b.dataset.id);
          showMemberDetail(m);
        } catch (e) { toast(e.message, 'error'); }
      });
    });

    if (canWrite) {
      document.querySelectorAll('.edit-mitglied').forEach(b => {
        b.addEventListener('click', () => {
          showForm(items.find(x => x.id === b.dataset.id));
        });
      });

      document.querySelectorAll('.delete-mitglied').forEach(b => {
        b.addEventListener('click', async () => {
          if (!confirm('Mitglied wirklich löschen?')) return;
          try {
            await api.deleteJugendmitglied(b.dataset.id);
            toast('Mitglied gelöscht', 'success');
            renderJugendfeuerwehr();
          } catch (e) { toast(e.message, 'error'); }
        });
      });
    }
  }

  renderList(mitglieder);

  // Neues Mitglied-Button
  document.getElementById('btn-new-mitglied')?.addEventListener('click', () => showForm());

  // ── Details-Overlay ──────────────────────────────────────────────────────

  function showMemberDetail(m) {
    const overlay = document.createElement('div');
    overlay.className = 'error-overlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10000;';
    overlay.innerHTML = `
      <div class="card" style="max-width:500px;width:90%;background:var(--surface);padding:24px;border-radius:8px;">
        <div class="card__header" style="margin-bottom:16px;">
          <span style="font-size:1.1rem;font-weight:600">${esc(m.name)}</span>
          <button class="btn btn--sm btn--outline" onclick="this.closest('.error-overlay').remove()" style="float:right;">Schließen</button>
        </div>
        <div style="font-size:0.9rem;line-height:1.6;">
          <p><strong>Geburtsdatum:</strong> ${formatDatumDeutsch(m.geburtsdatum)}</p>
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
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    document.querySelector('.error-overlay button').addEventListener('click', () => overlay.remove());
  }

  // ── Formular (Neu/Bearbeiten) ──────────────────────────────────────────────

  async function showForm(m = null) {
    const formEl = document.getElementById('jugend-member-form');
    const listEl = document.getElementById('jugend-list');
    if (!formEl) return;
    formEl.style.display = 'block';
    if (listEl) listEl.style.display = 'none';

    const isEdit = !!m;

    formEl.innerHTML = `
      <div class="card">
        <div class="card__header">
          <span>${isEdit ? 'Mitglied bearbeiten' : 'Neues Mitglied'}</span>
          <button type="button" class="btn btn--sm btn--outline" id="btn-cancel-member">Abbrechen</button>
        </div>
        <div class="card__body card__body--flush">
          <form id="member-form-el" class="form-grid">
            <div class="form-group form-group--full">
              <label>Name <span class="required">*</span></label>
              <input type="text" id="fld-name" placeholder="Vor- und Nachname" value="${m ? esc(m.name) : ''}" required />
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
              <input type="date" id="fld-austrittsdatum" value="${m ? m.austrittsdatum || '' : ''}" />
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
              <input type="text" id="fld-adresse" placeholder="Straße, Hausnummer, PLZ, Ort" value="${m ? esc(m.adresse || '') : ''}" />
            </div>
            <div class="form-group form-group--half">
              <label>Telefon</label>
              <input type="tel" id="fld-telefon" placeholder="Telefonnummer" value="${m ? esc(m.telefon || '') : ''}" />
            </div>
            <div class="form-group form-group--half">
              <label>E-Mail</label>
              <input type="email" id="fld-email" placeholder="E-Mail-Adresse" value="${m ? esc(m.email || '') : ''}" />
            </div>
            <div class="form-group form-group--full">
              <label>Eltern / Erziehungsberechtigte – Name</label>
              <input type="text" id="fld-eltern-name" placeholder="Name" value="${m ? esc(m.eltern_name || '') : ''}" />
            </div>
            <div class="form-group form-group--half">
              <label>Eltern – Telefon</label>
              <input type="tel" id="fld-eltern-telefon" placeholder="Telefonnummer" value="${m ? esc(m.eltern_telefon || '') : ''}" />
            </div>
            <div class="form-group form-group--half">
              <label>Eltern – E-Mail</label>
              <input type="email" id="fld-eltern-email" placeholder="E-Mail-Adresse" value="${m ? esc(m.eltern_email || '') : ''}" />
            </div>
            <div class="form-group form-group--half">
              <label>Juleica</label>
              <input type="checkbox" id="fld-juleica" ${m && m.juleica ? 'checked' : ''} />
            </div>
            <div class="form-group form-group--half">
              <label>Juleica gültig bis</label>
              <input type="date" id="fld-juleica-ablauf" value="${m ? m.juleica_ablauf || '' : ''}" />
            </div>
            <div class="form-group form-group--full">
              <label>Bemerkung</label>
              <textarea id="fld-bemerkung" rows="3" placeholder="Bemerkungen">${m ? esc(m.bemerkung || '') : ''}</textarea>
            </div>
            <div class="form-group form-group--full" style="margin-top: 12px;">
              <button type="submit" class="btn btn--primary">${isEdit ? 'Speichern' : 'Anlegen'}</button>
            </div>
          </form>
        </div>
      </div>
    `;

    document.getElementById('btn-cancel-member')?.addEventListener('click', () => {
      formEl.style.display = 'none';
      if (listEl) listEl.style.display = '';
    });

    document.getElementById('member-form-el')?.addEventListener('submit', async (e) => {
      e.preventDefault();

      const name = document.getElementById('fld-name').value.trim();
      if (!name) { toast('Name erforderlich', 'error'); return; }

      const geburtsdatum = document.getElementById('fld-geburtsdatum').value;
      const eintrittsdatum = document.getElementById('fld-eintrittsdatum').value;
      const austrittsdatum = document.getElementById('fld-austrittsdatum').value;
      const geschlecht = document.getElementById('fld-geschlecht').value;
      const juleica = document.getElementById('fld-juleica').checked;

      const body = {
        name,
        geburtsdatum: geburtsdatum || null,
        eintrittsdatum: eintrittsdatum || null,
        austrittsdatum: austrittsdatum || null,
        geschlecht,
        adresse: document.getElementById('fld-adresse').value || null,
        telefon: document.getElementById('fld-telefon').value || null,
        email: document.getElementById('fld-email').value || null,
        eltern_name: document.getElementById('fld-eltern-name').value || null,
        eltern_telefon: document.getElementById('fld-eltern-telefon').value || null,
        eltern_email: document.getElementById('fld-eltern-email').value || null,
        juleica: juleica,
        juleica_ablauf: document.getElementById('fld-juleica-ablauf').value || null,
        bemerkung: document.getElementById('fld-bemerkung').value || null,
      };

      try {
        if (isEdit) {
          await api.updateJugendmitglied(m.id, body);
          toast('Mitglied aktualisiert', 'success');
        } else {
          await api.createJugendmitglied(body);
          toast('Mitglied angelegt', 'success');
        }
        formEl.style.display = 'none';
        if (listEl) listEl.style.display = '';
        await renderJugendfeuerwehr();
      } catch (e) {
        toast(e.message || 'Fehler beim Speichern', 'error');
      }
    });
  }
}
