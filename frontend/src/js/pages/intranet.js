import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

let currentUser = null;
let entriesCache = []; // Cache für Einträge (für Edit-Modus)

export async function renderIntranet() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('intranet');

  const content = document.getElementById('page-content');
  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
  const canWrite = isAdmin || (user?.permissions || []).includes('intranet');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Intranet</h2>
        <p>Links und Dokumente für alle</p>
      </div>
      ${canWrite ? `<button class="btn btn--primary" id="btn-new-entry">Neuer Eintrag</button>` : ''}
    </div>
    <div id="intranet-create-form" style="display:none"></div>
    <div id="intranet-grid" class="intranet-grid"></div>
  `;
  renderIcons(content);

  let selectedType = null;
  let allRoles = [];
  let editingId = null; // null = create mode, UUID = edit mode

  // Rollen laden
  if (canWrite) {
    allRoles = await api.getRoles().catch(() => []);
  }

  const getSelectedRoleIds = () => {
    const checks = document.querySelectorAll('#entry-role-checks input:checked');
    if (checks.length === 0) return [];
    return [...checks].map(cb => cb.value);
  };

  const buildRoleChecks = (selectedIds = []) => {
    const container = document.getElementById('entry-role-checks');
    if (!container || !allRoles.length) return;
    container.innerHTML = allRoles.map(r => {
      const checked = selectedIds.includes(r.id) ? 'checked' : '';
      return `
        <label class="check-label">
          <input type="checkbox" class="entry-role-check" value="${r.id}" ${checked} />
          ${esc(r.name)}
        </label>
      `;
    }).join('');
  };

  // Formular bauen (Erstellen oder Bearbeiten)
  const renderForm = () => {
    const formEl = document.getElementById('intranet-create-form');
    const isEdit = editingId !== null;
    const entryData = isEdit ? (entriesCache.find(e => e.id === editingId) || {}) : {};
    const isFile = entryData.entry_type === 'file';

    formEl.innerHTML = `
      <div class="card">
        <div class="card__header">${isEdit ? 'Eintrag bearbeiten' : 'Neuen Eintrag erstellen'}</div>
        <div class="card__body">
          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="entry-title" maxlength="200"
              value="${isEdit ? esc(entryData.title) : ''}" placeholder="Titel des Eintrags" />
          </div>
          <div class="form-group">
            <label>Beschreibung (optional)</label>
            <textarea id="entry-desc" rows="3" placeholder="Kurze Beschreibung">${isEdit ? esc(entryData.description || '') : ''}</textarea>
          </div>
          ${isEdit && !isFile ? `
          <div class="form-group">
            <label>URL</label>
            <input type="url" id="entry-url" value="${esc(entryData.url || '')}" placeholder="https://..." />
          </div>` : ''}
          ${!isEdit ? `
          <div class="form-group">
            <label>Typ</label>
            <div class="btn-group">
              <button class="btn btn--outline" id="btn-type-link">Link</button>
              <button class="btn btn--outline" id="btn-type-file">Datei</button>
            </div>
          </div>
          <div id="type-link-fields" style="display:block">
            <div class="form-group">
              <label>URL</label>
              <input type="url" id="entry-url" placeholder="https://..." />
            </div>
          </div>
          <div id="type-file-fields" style="display:block">
            <div class="form-group">
              <label>Datei</label>
              <input type="file" id="entry-file" />
              <small class="text-subtle">Max. 100 MB</small>
            </div>
          </div>` : ''}
          <div class="form-group">
            <label>Sichtbar für Rollen <small class="text-subtle">(Standard: alle)</small></label>
            <div id="entry-role-checks" class="admin-check-list"></div>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-entry">${isEdit ? 'Aktualisieren' : 'Speichern'}</button>
            <button class="btn btn--outline" id="btn-cancel-entry">Abbrechen</button>
          </div>
        </div>
      </div>
    `;

    buildRoleChecks(isEdit ? (entryData.role_ids || []) : []);

    if (!isEdit) {
      document.getElementById('btn-type-link')?.addEventListener('click', () => {
        selectedType = 'link';
        document.getElementById('type-link-fields').style.display = 'block';
        document.getElementById('type-file-fields').style.display = 'none';
      });
      document.getElementById('btn-type-file')?.addEventListener('click', () => {
        selectedType = 'file';
        document.getElementById('type-link-fields').style.display = 'none';
        document.getElementById('type-file-fields').style.display = 'block';
      });
    }
  };

  // Initialisieren
  selectedType = null;
  renderForm();
  attachFormListeners();

  // Neue Eintrag-Button
  document.getElementById('btn-new-entry')?.addEventListener('click', () => {
    editingId = null;
    selectedType = null;
    renderForm();
    attachFormListeners();
    document.getElementById('intranet-create-form').style.display = 'block';
    document.getElementById('intranet-grid').style.display = 'none';
  });

  // Helper: Event-Listener für Formular-Buttons (nach renderForm() neu anbringen)
  function attachFormListeners() {
    document.getElementById('btn-cancel-entry')?.addEventListener('click', () => {
      document.getElementById('intranet-create-form').style.display = 'none';
      document.getElementById('intranet-grid').style.display = 'block';
    });

    document.getElementById('btn-save-entry')?.addEventListener('click', async () => {
      const title = document.getElementById('entry-title').value.trim();
      const desc = document.getElementById('entry-desc').value.trim();
      if (!title) { toast('Titel erforderlich', 'error'); return; }

      const role_ids = getSelectedRoleIds();

      if (editingId) {
        // Update
        try {
          const entry = entriesCache.find(en => en.id === editingId);
          const isFile = entry?.entry_type === 'file';
          if (isFile) {
            // Datei-Eintrag: URL und Typ nicht ändern
            await api.updateIntranetFileEntry(editingId, { title, description: desc, role_ids });
          } else {
            // Link-Eintrag: URL aktualisieren
            const urlInput = document.getElementById('entry-url');
            const url = urlInput?.value.trim() || '';
            await api.updateIntranetEntry(editingId, { title, url, description: desc, role_ids });
          }
          toast('Eintrag aktualisiert');
        } catch (e) { toast(e.message, 'error'); return; }
      } else if (selectedType === 'link') {
        const url = document.getElementById('entry-url')?.value.trim();
        if (!url) { toast('URL erforderlich', 'error'); return; }
        try {
          await api.createIntranetLink({ title, url, description: desc, role_ids });
          toast('Link gespeichert');
        } catch (e) { toast(e.message, 'error'); return; }
      } else if (selectedType === 'file') {
        const fileInput = document.getElementById('entry-file');
        const file = fileInput?.files[0];
        if (!file) { toast('Datei erforderlich', 'error'); return; }
        try {
          await api.createIntranetFile(file, title, desc, role_ids);
          toast('Datei hochgeladen');
        } catch (e) { toast(e.message, 'error'); return; }
      } else {
        toast('Typ auswählen', 'error');
        return;
      }
      document.getElementById('intranet-create-form').style.display = 'none';
      document.getElementById('intranet-grid').style.display = 'block';
      await loadIntranet();
    });
  }

  async function loadIntranet() {
    const grid = document.getElementById('intranet-grid');
    if (!grid) return;

    try {
      const entries = await api.getIntranet();
      entriesCache = entries || [];

      if (!entriesCache?.length) {
        grid.innerHTML = `<div class="empty-state">Noch keine Einträge vorhanden.</div>`;
        return;
      }
      grid.innerHTML = entriesCache.map(e => {
        const isFile = e.entry_type === 'file';
        const canEdit = canWrite;
        return `
          <div class="intranet-card" data-id="${e.id}">
            <div class="intranet-card__corner"></div>
            <div class="intranet-card__corner intranet-card__corner--tr"></div>
            <div class="intranet-card__corner intranet-card__corner--bl"></div>
            <div class="intranet-card__corner intranet-card__corner--br"></div>
            <div class="intranet-card__icon">${isFile ? icon('file', 24) : icon('link', 24)}</div>
            <div class="intranet-card__title">${esc(e.title)}</div>
            ${e.description ? `<div class="intranet-card__desc">${esc(e.description)}</div>` : ''}
            ${e.file_name ? `<div class="intranet-card__meta">${esc(e.file_name)}</div>` : ''}
            ${e.url ? `<div class="intranet-card__url">${esc(e.url)}</div>` : ''}
            <div class="intranet-card__by">von ${esc(e.published_by_name || '')}</div>
            ${canEdit ? `
            <div class="intranet-card__actions">
              <button class="btn btn--outline btn--sm btn-edit-entry" data-id="${e.id}">Bearbeiten</button>
              <button class="btn btn--danger btn--sm btn-delete-entry" data-id="${e.id}">Löschen</button>
            </div>` : ''}
          </div>
        `;
      }).join('');

      renderIcons(grid);

      // Lösch-Buttons (funktioniert für Link- und DateiEinträge)
      grid.querySelectorAll('.btn-delete-entry').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          if (!confirm('Eintrag wirklich löschen?')) return;
          try {
            await api.deleteIntranet(id);
            toast('Eintrag gelöscht');
            await loadIntranet();
          } catch (err) { toast(err.message, 'error'); }
        });
      });

      // Bearbeiten-Buttons (für Links und Dateien)
      grid.querySelectorAll('.btn-edit-entry').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation();
          const id = btn.dataset.id;
          editingId = id;
          selectedType = null;
          renderForm();
          attachFormListeners();
          document.getElementById('intranet-create-form').style.display = 'block';
          document.getElementById('intranet-grid').style.display = 'none';
        });
      });

      // Klick-Handler (Hauptbereich, nicht Buttons)
      grid.querySelectorAll('.intranet-card').forEach(card => {
        card.addEventListener('click', (e) => {
          if (e.target.closest('.btn-edit-entry, .btn-delete-entry')) return;
          const id = card.dataset.id;
          const entry = entriesCache.find(en => en.id === id);
          if (!entry) return;
          if (entry.entry_type === 'link' && entry.url) {
            window.open(entry.url, '_blank', 'noopener');
          } else if (entry.entry_type === 'file') {
            api.downloadIntranet(id).then(res => {
              if (!res.ok) throw new Error('Download fehlgeschlagen');
              return res.blob();
            }).then(blob => {
              const url = URL.createObjectURL(blob);
              const a = document.createElement('a');
              a.href = url;
              a.download = entry.file_name || 'download';
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }).catch(err => toast(err.message, 'error'));
          }
        });
      });
    } catch (e) {
      grid.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
    }
  }

  await loadIntranet();
}