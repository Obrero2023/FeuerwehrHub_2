import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

let currentUser = null;

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

  // Form HTML wird dynamisch eingefügt

  let selectedType = null;

  // Create form toggling
  const formEl = document.getElementById('intranet-create-form');
  formEl.innerHTML = `
    <div class="card">
      <div class="card__header">Neuen Eintrag erstellen</div>
      <div class="card__body">
        <div class="form-group">
          <label>Titel</label>
          <input type="text" id="entry-title" maxlength="200" placeholder="Titel des Eintrags" />
        </div>
        <div class="form-group">
          <label>Beschreibung (optional)</label>
          <textarea id="entry-desc" rows="3" placeholder="Kurze Beschreibung"></textarea>
        </div>
        <div class="form-group">
          <label>Typ</label>
          <div class="btn-group">
            <button class="btn btn--outline" id="btn-type-link">Link</button>
            <button class="btn btn--outline" id="btn-type-file">Datei</button>
          </div>
        </div>
        <div id="type-link-fields" style="display:none">
          <div class="form-group">
            <label>URL</label>
            <input type="url" id="entry-url" placeholder="https://..." />
          </div>
        </div>
        <div id="type-file-fields" style="display:none">
          <div class="form-group">
            <label>Datei</label>
            <input type="file" id="entry-file" />
            <small class="text-subtle">Max. 100 MB</small>
          </div>
        </div>
        <div class="btn-group mt-md">
          <button class="btn btn--primary" id="btn-save-entry">Speichern</button>
          <button class="btn btn--outline" id="btn-cancel-entry">Abbrechen</button>
        </div>
      </div>
    </div>
  `;

  document.getElementById('btn-new-entry')?.addEventListener('click', () => {
    formEl.style.display = 'block';
    document.getElementById('intranet-grid').style.display = 'none';
  });

  document.getElementById('btn-cancel-entry')?.addEventListener('click', () => {
    formEl.style.display = 'none';
    document.getElementById('intranet-grid').style.display = 'block';
  });

  document.getElementById('btn-type-link')?.addEventListener('click', () => {
    selectedType = 'link';
    document.getElementById('type-link-fields').style.display = 'block';
    document.getElementById('type-file-fields').style.display = 'none';
    document.getElementById('btn-type-link').classList.add('btn--primary');
    document.getElementById('btn-type-link').classList.remove('btn--outline');
    document.getElementById('btn-type-file').classList.add('btn--outline');
    document.getElementById('btn-type-file').classList.remove('btn--primary');
  });

  document.getElementById('btn-type-file')?.addEventListener('click', () => {
    selectedType = 'file';
    document.getElementById('type-link-fields').style.display = 'none';
    document.getElementById('type-file-fields').style.display = 'block';
    document.getElementById('btn-type-file').classList.add('btn--primary');
    document.getElementById('btn-type-file').classList.remove('btn--outline');
    document.getElementById('btn-type-link').classList.add('btn--outline');
    document.getElementById('btn-type-link').classList.remove('btn--primary');
  });

  document.getElementById('btn-save-entry')?.addEventListener('click', async () => {
    const title = document.getElementById('entry-title').value.trim();
    const desc = document.getElementById('entry-desc').value.trim();
    if (!title) { toast('Titel erforderlich', 'error'); return; }

    if (selectedType === 'link') {
      const url = document.getElementById('entry-url').value.trim();
      if (!url) { toast('URL erforderlich', 'error'); return; }
      try {
        await api.createIntranetLink({ title, url, description: desc });
        toast('Link gespeichert');
      } catch (e) { toast(e.message, 'error'); return; }
    } else if (selectedType === 'file') {
      const fileInput = document.getElementById('entry-file');
      const file = fileInput.files[0];
      if (!file) { toast('Datei erforderlich', 'error'); return; }
      try {
        await api.createIntranetFile(file, title, desc);
        toast('Datei hochgeladen');
      } catch (e) { toast(e.message, 'error'); return; }
    } else {
      toast('Typ auswählen', 'error');
      return;
    }
    formEl.style.display = 'none';
    document.getElementById('intranet-grid').style.display = 'block';
    await loadIntranet(user);
  });

  await loadIntranet(user);
}

async function loadIntranet(user) {
  const grid = document.getElementById('intranet-grid');
  if (!grid) return;

  try {
    const entries = await api.getIntranet();
    if (!entries?.length) {
      grid.innerHTML = `<div class="empty-state">Noch keine Einträge vorhanden.</div>`;
      return;
    }
    grid.innerHTML = entries.map(e => {
      const isFile = e.entry_type === 'file';
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
        </div>
      `;
    }).join('');

    renderIcons(grid);

    // Click handler
    grid.querySelectorAll('.intranet-card').forEach(card => {
      const id = card.dataset.id;
      const entry = entries.find(e => e.id === id);
      if (!entry) return;

      card.addEventListener('click', () => {
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