import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

const STATUS_COLORS = {
  geplant: '#6b7280',
  offen: '#2563eb',
  voll: '#dc2626',
  abgesagt: '#9ca3af',
  abgeschlossen: '#16a34a',
};

export async function renderLehrgaenge() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgaenge');

  const content = document.getElementById('page-content');
  const isVerwalter = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');

  content.innerHTML = `
    <div class="page-header">
      <div><h2>Lehrgänge</h2><p>Übersicht aller Lehrgänge und Anmeldungen</p></div>
      ${isVerwalter ? '<button class="btn btn--primary" id="btn-new-lehrgang">+ Neuer Lehrgang</button>' : ''}
    </div>
    <div id="lehrgang-form" style="display:none"></div>
    <div id="lehrgang-list" class="lehrgang-grid"></div>
  `;
  renderIcons(content);

  const loadAndRender = async () => {
    try {
      const lehrgaenge = await api.getLehrgaenge().catch(() => []);
      renderList(lehrgaenge, isVerwalter, user);
    } catch (e) { toast(e.message, 'error'); }
  };

  const renderList = (items, canManage, currentUser) => {
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
      if (nb) nb.addEventListener('click', showForm);
      return;
    }

    grid.innerHTML = items.map((l, idx) => `
      <div class="lehrgang-card" style="animation-delay: ${idx * 0.06}s">
        <div class="lehrgang-header">
          <h3>${esc(l.titel)}</h3>
          <span class="lehrgang-status" style="color:${STATUS_COLORS[l.status] || '#666'}">${l.status}</span>
        </div>
        <div class="lehrgang-meta">
          <span>📅 ${l.start_datum} – ${l.end_datum}</span>
          ${l.ort ? `<span>📍 ${esc(l.ort)}</span>` : ''}
          ${l.anmeldeschluss ? `<span>📝 Bis ${l.anmeldeschluss}</span>` : ''}
          <span>👥 ${l.anmeldungen_count || 0}/${l.max_teilnehmer || '?'}</span>
          ${l.kosten !== undefined && l.kosten !== null ? `<span>💶 ${l.kosten} €${l.kosten_uebernommen_durch ? ' (' + l.kosten_uebernommen_durch + ')' : ''}</span>` : ''}
        </div>
        ${l.beschreibung ? `<p class="lehrgang-desc">${esc(l.beschreibung)}</p>` : ''}
        <div class="lehrgang-actions">
          <button class="btn btn--small btn--secondary view-lehrgang" data-id="${l.id}">Details</button>
          ${canManage ? `
            <button class="btn btn--small btn--info edit-lehrgang" data-id="${l.id}">Bearbeiten</button>
            <button class="btn btn--small btn--danger delete-lehrgang" data-id="${l.id}">Löschen</button>
          ` : ''}
        </div>
      </div>
    `).join('');

    document.querySelectorAll('.view-lehrgang').forEach(b => {
      b.addEventListener('click', () => { window.location.hash = `#/lehrgang/${b.dataset.id}`; });
    });
    document.querySelectorAll('.edit-lehrgang').forEach(b => {
      b.addEventListener('click', () => { window.location.hash = `#/lehrgang-edit/${b.dataset.id}`; });
    });
    document.querySelectorAll('.delete-lehrgang').forEach(b => {
      b.addEventListener('click', async () => {
        if (confirm('Lehrgang wirklich löschen?')) {
          try { await api.deleteLehrgang(b.dataset.id); toast('Lehrgang gelöscht', 'success'); loadAndRender(); }
          catch (e) { toast(e.message, 'error'); }
        }
      });
    });
  };

  const showForm = async (l = null) => {
    const formEl = document.getElementById('lehrgang-form');
    const listEl = document.getElementById('lehrgang-list');
    if (!formEl) return;
    formEl.style.display = 'block';
    if (listEl) listEl.style.display = 'none';

    formEl.innerHTML = `
      <div class="card">
        <h3>${l ? 'Lehrgang bearbeiten' : 'Neuer Lehrgang'}</h3>
        <form id="lehrgang-form-el" class="form-grid">
          <input type="text" id="fld-titel" placeholder="Titel" value="${l ? esc(l.titel) : ''}" required />
          <textarea id="feld-beschreibung" placeholder="Beschreibung">${l ? esc(l.beschreibung || '') : ''}</textarea>
          <input type="text" id="feld-ort" placeholder="Ort" value="${l ? esc(l.ort || '') : ''}" />
          <div class="form-row">
            <input type="date" id="feld-start" value="${l && l.start_datum ? l.start_datum : ''}" required />
            <input type="date" id="feld-ende" value="${l && l.end_datum ? l.end_datum : ''}" required />
          </div>
          <div class="form-row">
            <input type="date" id="feld-anmeldeschluss" placeholder="Anmeldeschluss" value="${l && l.anmeldeschluss ? l.anmeldeschluss : ''}" />
            <input type="number" id="feld-max" placeholder="Max Teilnehmer" value="${l && l.max_teilnehmer ? l.max_teilnehmer : ''}" min="1" />
          </div>
          <div class="form-row">
            <input type="number" id="feld-kosten" placeholder="Kosten" value="${l && l.kosten ? l.kosten : ''}" step="0.01" />
            <select id="feld-kosten-durch">
              <option value="">Kostenübernahme</option>
              <option value="feuerwehr" ${l && l.kosten_uebernommen_durch === 'feuerwehr' ? 'selected' : ''}>Feuerwehr</option>
              <option value="teilnehmer" ${l && l.kosten_uebernommen_durch === 'teilnehmer' ? 'selected' : ''}>Teilnehmer</option>
              <option value="teilweise" ${l && l.kosten_uebernommen_durch === 'teilweise' ? 'selected' : ''}>Teilweise</option>
            </select>
          </div>
          <div class="form-actions">
            <button type="submit" class="btn btn--primary">${l ? 'Speichern' : 'Anlegen'}</button>
            <button type="button" id="btn-cancel" class="btn btn--secondary">Abbrechen</button>
          </div>
        </form>
      </div>
    `;

    document.getElementById('btn-cancel').addEventListener('click', () => {
      formEl.style.display = 'none';
      if (listEl) listEl.style.display = '';
    });

    document.getElementById('lehrgang-form-el').addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = {
        titel: document.getElementById('fld-titel').value,
        beschreibung: document.getElementById('feld-beschreibung').value || null,
        ort: document.getElementById('feld-ort').value || null,
        start_datum: document.getElementById('feld-start').value,
        end_datum: document.getElementById('feld-ende').value,
        anmeldeschluss: document.getElementById('feld-anmeldeschluss').value || null,
        max_teilnehmer: parseInt(document.getElementById('feld-max').value) || null,
        kosten: parseFloat(document.getElementById('feld-kosten').value) || null,
        kosten_uebernommen_durch: document.getElementById('feld-kosten-durch').value || null,
      };
      try {
        if (l) {
          await api.updateLehrgang(l.id, body);
          toast('Lehrgang aktualisiert', 'success');
        } else {
          await api.createLehrgang(body);
          toast('Lehrgang angelegt', 'success');
        }
        loadAndRender();
      } catch (e) { toast(e.message, 'error'); }
    });
  };

  document.getElementById('btn-new-lehrgang').addEventListener('click', showForm);

  await loadAndRender();
}