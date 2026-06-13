import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

export async function renderHome() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('home');

  const content = document.getElementById('page-content');
  const displayName = user?.display_name || user?.username || '';
  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';
  const modules = settings?.modules || {};

  const dseMissing = isAdmin && (!settings?.datenschutz_kontakt_name || !settings?.datenschutz_kontakt_email);

  content.innerHTML = `
    ${dseMissing ? `
    <div class="alert-warning dse-warning-banner" style="display:flex;align-items:center;gap:12px;padding:12px 16px;border-radius:8px;margin-bottom:16px;background:var(--warning-bg,#fff8e1);border:1px solid var(--warning-border,#f9a825);color:var(--warning-text,#5d4037)">
      <span style="font-size:18px">⚠️</span>
      <span style="flex:1;font-size:13px">
        <strong>Datenschutzerklärung unvollständig:</strong>
        Die Kontaktdaten für die öffentliche Datenschutzerklärung (Art. 13 DSGVO) sind noch nicht hinterlegt.
        <a href="#/admin" style="color:inherit;font-weight:600;margin-left:4px">→ Admin-Panel → Konfiguration</a>
      </span>
      <button id="btn-dse-warning-dismiss" style="background:none;border:none;cursor:pointer;font-size:16px;color:inherit;padding:0 4px;opacity:.6" title="Ausblenden">✕</button>
    </div>` : ''}
    <div class="page-header">
      <div>
        <h2>Willkommen, ${esc(displayName)}</h2>
        <p>${esc(settings?.ff_name || 'FeuerwehrHub')}</p>
      </div>
    </div>

    <div class="home-grid">

      <div class="home-grid__main">

        <div id="announcements-section">
          <div class="section-bar">
            <h3 class="section-bar__heading">
              ${icon('megaphone', 15)} Ankündigungen
            </h3>
            ${isAdmin ? `<button class="btn btn--primary btn--sm" id="btn-new-announcement">+ Neu</button>` : ''}
          </div>
          <div id="announcements-list"><p class="text-muted text-sm">Lade...</p></div>
        </div>

        ${modules.verein ? `
        <div id="schwarzesbrett-section">
          <div class="section-bar">
            <h3 class="section-bar__heading">
              ${icon('clipboard-list', 15)} Schwarzes Brett
            </h3>
            <a href="#/verein" class="section-bar__link">Verwalten →</a>
          </div>
          <div id="schwarzesbrett-list"><p class="text-muted text-sm">Lade...</p></div>
        </div>` : ''}

      </div>

      <div class="home-grid__side">

        <div class="widget-card widget-card--termine" id="termine-widget">
          <div class="widget-card__header">
            <h3>${icon('calendar', 15)} Termine</h3>
            <a href="#/termine">Alle anzeigen →</a>
          </div>
          <div class="widget-card__body" id="termine-widget-content">
            <p class="text-muted text-sm">Lade...</p>
          </div>
        </div>

        <div class="widget-card widget-card--lager" id="lowstock-widget" style="display:none">
          <div class="widget-card__header">
            <h3>${icon('alert-triangle', 15)} Mindestbestand</h3>
            <a href="#/articles">Lager öffnen →</a>
          </div>
          <div class="widget-card__body" id="lowstock-widget-content"></div>
        </div>

      </div>
    </div>

    ${isAdmin ? `
    <div id="modal-announcement" class="modal-overlay">
      <div class="modal">
        <div class="modal__header">
          <h3 id="modal-announcement-title">Ankündigung erstellen</h3>
          <button class="modal__close" id="btn-close-announcement">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="ann-title" placeholder="z.B. Übung nächste Woche" />
          </div>
          <div class="form-group">
            <label>Inhalt</label>
            <textarea id="ann-content" rows="5" class="field" placeholder="Nachricht..."></textarea>
          </div>
          <div class="form-group">
            <label class="check-label">
              <input type="checkbox" id="ann-pinned" />
              Ankündigung anheften (erscheint immer oben)
            </label>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--primary" id="btn-submit-announcement">Speichern</button>
          <button class="btn btn--outline" id="btn-cancel-announcement">Abbrechen</button>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  renderIcons(content);

  document.getElementById('btn-dse-warning-dismiss')?.addEventListener('click', e => {
    e.target.closest('.dse-warning-banner')?.remove();
  });

  await loadAnnouncements(user, isAdmin);
  loadTermineWidget(modules);
  if (isAdmin || modules.lager === true) loadLowStockWidget();
  if (isAdmin) setupAnnouncementModal(user);
  if (modules.verein) loadSchwarztesBrett(isAdmin);
}

// ── Ankündigungen ─────────────────────────────────────────────────────────────

async function loadAnnouncements(user, isAdmin) {
  const list = document.getElementById('announcements-list');
  if (!list) return;

  try {
    const items = await api.getAnnouncements();

    if (!items.length) {
      list.innerHTML = `<p class="text-muted text-sm">Keine Ankündigungen vorhanden.</p>`;
      return;
    }

    list.innerHTML = items.map(a => `
      <div class="card announcement-card" data-id="${a.id}">
        <div class="card__header">
          <span>
            ${a.pinned ? `<span class="ann-pin" title="Angeheftet">${icon('pin', 13)}</span>` : ''}
            <strong>${esc(a.title)}</strong>
          </span>
          <span class="card__header-meta">
            <span class="text-muted text-xs">${esc(a.created_by_name)} · ${formatDate(a.created_at)}</span>
            ${isAdmin ? `
              <div class="btn-group">
                <button class="btn btn--outline btn--sm" data-action="edit-ann"
                  data-id="${a.id}" data-title="${esc(a.title)}"
                  data-content="${esc(a.content)}" data-pinned="${a.pinned}">Bearbeiten</button>
                <button class="btn btn--danger btn--sm" data-action="delete-ann" data-id="${a.id}">Löschen</button>
              </div>
            ` : ''}
          </span>
        </div>
        <div class="card__body card__body--pre">${esc(a.content)}</div>
      </div>
    `).join('');

    renderIcons(list);

    if (isAdmin) {
      list.querySelectorAll('[data-action="delete-ann"]').forEach(btn => {
        btn.addEventListener('click', async () => {
          if (!confirm('Ankündigung wirklich löschen?')) return;
          try {
            await api.deleteAnnouncement(btn.dataset.id);
            toast('Ankündigung gelöscht');
            await loadAnnouncements(user, isAdmin);
          } catch (e) { toast(e.message, 'error'); }
        });
      });

      list.querySelectorAll('[data-action="edit-ann"]').forEach(btn => {
        btn.addEventListener('click', () => {
          openAnnouncementModal({
            id: btn.dataset.id,
            title: btn.dataset.title,
            content: btn.dataset.content,
            pinned: btn.dataset.pinned === 'true',
          }, user, isAdmin);
        });
      });
    }
  } catch (e) {
    list.innerHTML = `<p class="error-msg">Fehler: ${esc(e.message)}</p>`;
  }
}

// ── Ankündigung-Modal ─────────────────────────────────────────────────────────

let editTarget = null;

function setupAnnouncementModal(user) {
  document.getElementById('btn-new-announcement')?.addEventListener('click', () => {
    openAnnouncementModal(null, user, true);
  });

  const close = () => {
    document.getElementById('modal-announcement').classList.remove('active');
    document.getElementById('ann-title').value = '';
    document.getElementById('ann-content').value = '';
    document.getElementById('ann-pinned').checked = false;
    editTarget = null;
  };

  document.getElementById('btn-close-announcement').addEventListener('click', close);
  document.getElementById('btn-cancel-announcement').addEventListener('click', close);

  document.getElementById('btn-submit-announcement').addEventListener('click', async () => {
    const title   = document.getElementById('ann-title').value.trim();
    const content = document.getElementById('ann-content').value.trim();
    const pinned  = document.getElementById('ann-pinned').checked;

    if (!title)   { toast('Titel eingeben', 'error'); return; }
    if (!content) { toast('Inhalt eingeben', 'error'); return; }

    try {
      if (editTarget) {
        await api.updateAnnouncement(editTarget, { title, content, pinned });
        toast('Ankündigung gespeichert');
      } else {
        await api.createAnnouncement({ title, content, pinned });
        toast('Ankündigung erstellt');
      }
      close();
      await loadAnnouncements(user, true);
    } catch (e) { toast(e.message, 'error'); }
  });
}

function openAnnouncementModal(ann, user, isAdmin) {
  editTarget = ann?.id || null;
  document.getElementById('modal-announcement-title').textContent =
    ann ? 'Ankündigung bearbeiten' : 'Ankündigung erstellen';
  document.getElementById('ann-title').value    = ann?.title   || '';
  document.getElementById('ann-content').value  = ann?.content || '';
  document.getElementById('ann-pinned').checked = ann?.pinned  || false;
  document.getElementById('modal-announcement').classList.add('active');
  document.getElementById('ann-title').focus();
}

// ── Termine-Widget ────────────────────────────────────────────────────────────

async function loadTermineWidget(modules = {}) {
  const widget  = document.getElementById('termine-widget');
  const content = document.getElementById('termine-widget-content');
  if (!widget || !content) return;

  try {
    const fetches = [api.getMyTermine()];
    if (modules.verein) fetches.push(api.getEvents().catch(() => []));
    const [myTermine, vereinEvents] = await Promise.all(fetches);

    const vereinNorm = (vereinEvents || []).map(e => ({
      id: e.id,
      title: e.titel,
      location: e.ort || null,
      start_at: e.datum + 'T' + (e.uhrzeit ? e.uhrzeit + ':00' : '00:00:00'),
      typ_color: null,
      _source: 'verein',
    }));

    const now      = new Date();
    const upcoming = [...myTermine, ...vereinNorm]
      .filter(t => new Date(t.start_at) >= now)
      .sort((a, b) => new Date(a.start_at) - new Date(b.start_at))
      .slice(0, 5);

    if (!upcoming.length) {
      content.innerHTML = `<p class="text-muted text-sm" style="margin:0">Keine bevorstehenden Termine.</p>`;
      return;
    }

    content.innerHTML = upcoming.map(t => {
      const d = new Date(t.start_at);
      const colorDot = t._source === 'verein'
        ? `<span class="termine-tag">Verein</span>`
        : t.typ_color
          ? `<span class="type-dot" style="background:${t.typ_color}"></span>`
          : '';
      return `
        <div class="termine-row">
          <div class="termine-row__date">
            <div class="termine-row__day">${String(d.getDate()).padStart(2,'0')}</div>
            <div class="termine-row__month">${d.toLocaleDateString('de-DE',{month:'short'})}</div>
          </div>
          <div class="termine-row__body">
            <div class="termine-row__title">${colorDot}${esc(t.title)}</div>
            <div class="termine-row__meta">
              ${d.toLocaleTimeString('de-DE',{hour:'2-digit',minute:'2-digit'})} Uhr
              ${t.location ? ` · ${esc(t.location)}` : ''}
            </div>
          </div>
        </div>`;
    }).join('');
  } catch (_) {
    widget.style.display = 'none';
  }
}

// ── Mindestbestand-Widget ─────────────────────────────────────────────────────

async function loadLowStockWidget() {
  const widget  = document.getElementById('lowstock-widget');
  const content = document.getElementById('lowstock-widget-content');
  if (!widget || !content) return;

  try {
    const items = await api.lowStock();
    if (!items.length) return;

    widget.style.display = '';

    content.innerHTML = items.slice(0, 8).map(a => `
      <div class="stock-row">
        <div class="stock-row__name">${esc(a.name)}</div>
        <div class="stock-row__qty">${a.current_stock} / ${a.min_stock} ${esc(a.unit)}</div>
      </div>
    `).join('') + (items.length > 8 ? `<p class="text-muted text-xs" style="margin:6px 0 0">… und ${items.length - 8} weitere</p>` : '');
  } catch (_) { /* Widget bleibt ausgeblendet */ }
}

// ── Schwarzes Brett ───────────────────────────────────────────────────────────

async function loadSchwarztesBrett(isAdmin) {
  const list = document.getElementById('schwarzesbrett-list');
  if (!list) return;
  try {
    const posts = await api.getVereinPosts();
    if (!posts?.length) {
      list.innerHTML = `<p class="text-muted text-sm">Keine Beiträge vorhanden.</p>`;
      return;
    }
    list.innerHTML = posts.map(p => `
      <div class="card announcement-card">
        <div class="card__header">
          <span>
            ${p.pinned ? `<span class="ann-pin--gelb">${icon('pin', 13)}</span>` : ''}
            <strong>${esc(p.title)}</strong>
            ${p.visibility === 'vorstand' && isAdmin ? `<span class="badge badge--orange" style="margin-left:8px">Nur Vorstand</span>` : ''}
          </span>
          <span class="text-muted text-xs">
            ${p.expires_at ? `Bis ${p.expires_at} · ` : ''}${esc(p.created_by_name)}
          </span>
        </div>
        <div class="card__body card__body--pre">${esc(p.content)}</div>
      </div>
    `).join('');
    renderIcons(list);
  } catch (e) {
    list.innerHTML = `<p class="error-msg">Fehler: ${esc(e.message)}</p>`;
  }
}
