import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';
import QRCode from 'qrcode';
import { Html5Qrcode } from 'html5-qrcode';
import { generateArtikelListe } from '../pdf-generator.js';

export async function renderArticles() {
  const [settings, user, units, locations, initCategories] = await Promise.all([
    api.getSettings(), api.me(), api.getUnits(), api.getStorageLocations(),
    api.getArticleCategories().catch(() => []),
  ]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('articles');

  const isAdmin = user?.role === 'admin' || user?.role === 'superuser';

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Artikelstamm</h2>
        <p>Bekannte Artikel verwalten und als Vorlage für Bestellungen nutzen</p>
      </div>
      <div class="btn-group">
        <button class="btn btn--outline" id="btn-scan-qr">${icon('camera', 14)} QR scannen</button>
        <button class="btn btn--outline" id="btn-scan-ean">${icon('scan-barcode', 14)} EAN scannen</button>
        ${isAdmin ? `<button class="btn btn--outline btn--sm" id="btn-manage-categories" title="Kategorien verwalten">${icon('tag', 13)} Kategorien</button>` : ''}
        <button class="btn btn--primary" id="btn-new-article">${icon('plus', 14)} Neuer Artikel</button>
      </div>
    </div>

    <div class="lager-layout">

      <!-- Lagerort-Sidebar -->
      <aside id="location-sidebar" class="lager-sidebar">
        <div class="card card--flush">
          <div class="card__header sidebar-card-header">
            <span class="sidebar-heading">${icon('warehouse', 13)} Lagerorte</span>
            <button class="btn btn--ghost btn--sm" id="btn-new-location" title="Neuer Lagerort">${icon('plus', 13)}</button>
          </div>
          <div id="location-tree" class="location-tree"></div>
        </div>
      </aside>

      <!-- Artikel-Tabelle -->
      <div class="lager-main">
        <div class="card">
          <div class="card__header" id="articles-card-header">
            <span>Artikel</span>
            <button class="btn btn--ghost btn--sm" id="btn-pdf-articles" title="Als PDF exportieren">${icon('file-text', 13)}</button>
          </div>
          <div class="lager-filter">
            <input type="text" id="search-input" placeholder="Name oder Kategorie suchen..." class="lager-filter__search" />
            <select id="category-filter" class="lager-filter__select">
              <option value="">Alle Kategorien</option>
            </select>
          </div>
          <div class="card__body card__body--flush">
            <div class="table-wrapper">
              <table>
                <thead>
                  <tr>
                    <th></th>
                    <th>Bezeichnung</th>
                    <th>Kategorie</th>
                    <th>EAN</th>
                    <th>Einheit</th>
                    <th>Bestand (Ist / Soll)</th>
                    <th>Lagerort</th>
                    <th>Aktionen</th>
                  </tr>
                </thead>
                <tbody id="articles-tbody"></tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Artikel-Modal -->
    <div class="modal-overlay" id="article-modal">
      <div class="modal">
        <div class="modal__header">
          <span id="modal-title">Neuer Artikel</span>
          <button class="modal__close" id="close-article-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Bezeichnung *</label>
            <input type="text" id="a-name" maxlength="255" placeholder="z.B. HP 85A Toner" />
          </div>
          <div class="form-group">
            <label>Kategorie</label>
            <input type="text" id="a-category" maxlength="100" placeholder="z.B. Toner, Papier..." list="a-cat-list" />
            <datalist id="a-cat-list"></datalist>
          </div>
          <div class="form-group">
            <label>EAN / Barcode</label>
            <input type="text" id="a-ean" maxlength="64" placeholder="z.B. 4006381333931" />
          </div>
          <div class="form-group">
            <label>Lagerort</label>
            <select id="a-location">
              <option value="">— Kein Lagerort —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Einheit *</label>
            <select id="a-unit">
              ${units.map(u => `<option value="${esc(u.label)}">${esc(u.label)}</option>`).join('')}
            </select>
          </div>
          <div class="form-grid--2">
            <div class="form-group">
              <label>Ist-Bestand (aktuell vorhanden)</label>
              <input type="number" id="a-current-stock" min="0" value="0" />
            </div>
            <div class="form-group">
              <label>Mindestbestand (Soll)</label>
              <input type="number" id="a-min-stock" min="0" value="0" />
            </div>
          </div>
          <div class="form-group">
            <label>Anmerkung</label>
            <textarea id="a-notes" maxlength="500" placeholder="Optional..."></textarea>
          </div>
          <label class="check-label">
            <input type="checkbox" id="a-instance-tracking" />
            <span>Einzelobjekt-Tracking aktivieren (Seriennummern statt Mengenverwaltung)</span>
          </label>
          <p id="a-instance-tracking-hint" class="check-hint" style="display:none">
            Ist-Bestand wird automatisch aus den erfassten Instanzen berechnet.
          </p>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-article-modal2">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-article">Speichern</button>
        </div>
      </div>
    </div>

    <!-- Instanz-Modal -->
    <div class="modal-overlay" id="instance-modal">
      <div class="modal modal--sm">
        <div class="modal__header">
          <span id="instance-modal-title">Neue Instanz</span>
          <button class="modal__close" id="close-instance-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-grid--2">
            <div class="form-group">
              <label>Seriennummer</label>
              <input type="text" id="inst-serial" maxlength="128" placeholder="z.B. SN-2026-001" />
            </div>
            <div class="form-group">
              <label>Bezeichnung / Kurzname</label>
              <input type="text" id="inst-label" maxlength="128" placeholder="z.B. Leiter #3" />
            </div>
          </div>
          <div class="form-group">
            <label>Zustand</label>
            <select id="inst-condition">
              <option value="gut">Gut</option>
              <option value="in_wartung">In Wartung</option>
              <option value="defekt">Defekt</option>
              <option value="ausgemustert">Ausgemustert</option>
            </select>
          </div>
          <div class="form-group">
            <label>Lagerort</label>
            <select id="inst-location">
              <option value="">— Kein Lagerort —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Anmerkung</label>
            <textarea id="inst-notes" maxlength="1000" placeholder="Optional..."></textarea>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-instance-modal2">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-instance">Speichern</button>
        </div>
      </div>
    </div>

    <!-- Lagerort-Modal -->
    <div class="modal-overlay" id="location-modal">
      <div class="modal modal--xs">
        <div class="modal__header">
          <span id="location-modal-title">Neuer Lagerort</span>
          <button class="modal__close" id="close-location-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Name *</label>
            <input type="text" id="loc-name" maxlength="128" placeholder="z.B. Hauptlager, Regal A1..." />
          </div>
          <div class="form-group">
            <label>Übergeordneter Lagerort</label>
            <select id="loc-parent">
              <option value="">— Kein (Stamm-Ebene) —</option>
            </select>
          </div>
          <div class="form-group">
            <label>Beschreibung</label>
            <textarea id="loc-description" maxlength="500" placeholder="Optional..."></textarea>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-location-modal2">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-location">Speichern</button>
        </div>
      </div>
    </div>

    <!-- Inspektions-Modal -->
    <div class="modal-overlay" id="insp-modal">
      <div class="modal">
        <div class="modal__header">
          <span id="insp-modal-title">Neue Frist</span>
          <button class="modal__close" id="close-insp-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Bezeichnung *</label>
            <input type="text" id="i-name" maxlength="128" placeholder="z.B. Druckprüfung, UVV, TÜV..." />
          </div>
          <div class="form-grid--2">
            <div class="form-group">
              <label>Letzte Prüfung</label>
              <input type="date" id="i-last-date" />
            </div>
            <div class="form-group">
              <label>Nächste Prüfung</label>
              <input type="date" id="i-next-date" />
            </div>
          </div>
          <div class="form-group">
            <label>Intervall (Monate)</label>
            <input type="number" id="i-interval" min="1" placeholder="z.B. 12" />
          </div>
          <div class="form-group">
            <label>Anmerkung</label>
            <textarea id="i-notes" maxlength="500" placeholder="Optional..."></textarea>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-insp-modal2">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-insp">Speichern</button>
        </div>
      </div>
    </div>

    <!-- Charge-Modal -->
    <div class="modal-overlay" id="charge-modal">
      <div class="modal">
        <div class="modal__header">
          <span id="charge-modal-title">Neue Charge</span>
          <button class="modal__close" id="close-charge-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Chargennummer *</label>
            <input type="text" id="c-charge-nr" maxlength="128" placeholder="z.B. LOT-2026-001" />
          </div>
          <div class="form-grid--2">
            <div class="form-group">
              <label>MHD (Mindesthaltbarkeit)</label>
              <input type="date" id="c-mhd" />
            </div>
            <div class="form-group">
              <label>Menge</label>
              <input type="number" id="c-menge" min="0" value="0" />
            </div>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-charge-modal2">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-charge">Speichern</button>
        </div>
      </div>
    </div>

    <!-- EAN-Scan-Modal -->
    <div class="modal-overlay" id="ean-modal">
      <div class="modal">
        <div class="modal__header">
          <span>EAN / Barcode suchen</span>
          <button class="modal__close" id="close-ean-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>EAN eingeben oder scannen</label>
            <input type="text" id="ean-input" maxlength="64" placeholder="Barcode scannen..." autofocus />
          </div>
          <div id="ean-result"></div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-ean-modal2">Schließen</button>
        </div>
      </div>
    </div>

    <!-- QR-Kamera-Scan-Modal -->
    <div class="modal-overlay" id="scan-modal">
      <div class="modal modal--sm">
        <div class="modal__header">
          <span>${icon('camera', 14)} QR-Code scannen</span>
          <button class="modal__close" id="close-scan-modal">✕</button>
        </div>
        <div class="modal__body">
          <div id="qr-reader-lager" class="scan-reader"></div>
          <p class="scan-hint">QR-Code eines Artikels oder Einzelobjekts vor die Kamera halten</p>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-scan-modal2">Schließen</button>
        </div>
      </div>
    </div>

    <!-- Bestandteil-Modal -->
    <div class="modal-overlay" id="comp-modal">
      <div class="modal modal--sm">
        <div class="modal__header">
          <span>${icon('layers', 14)} Bestandteil hinzufügen</span>
          <button class="modal__close" id="close-comp-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Artikel</label>
            <select id="comp-child-id"></select>
          </div>
          <div class="form-group">
            <label>Menge</label>
            <input type="number" id="comp-quantity" min="1" max="9999" value="1" />
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-comp-modal2">Abbrechen</button>
          <button class="btn btn--primary" id="btn-save-comp">Hinzufügen</button>
        </div>
      </div>
    </div>

    <!-- Kategorien-Modal -->
    <div class="modal-overlay" id="categories-modal">
      <div class="modal modal--sm">
        <div class="modal__header">
          <span>${icon('tag', 14)} Kategorien verwalten</span>
          <button class="modal__close" id="close-categories-modal">✕</button>
        </div>
        <div class="modal__body">
          <div id="categories-list" style="margin-bottom:16px"></div>
          <div class="form-group form-group--compact" style="display:flex;gap:8px;align-items:flex-end">
            <div style="flex:1">
              <label>Neue Kategorie</label>
              <input type="text" id="new-cat-label" maxlength="100" placeholder="z.B. Atemschutz" />
            </div>
            <button class="btn btn--primary btn--sm" id="btn-add-category">Anlegen</button>
          </div>
        </div>
        <div class="modal__footer">
          <button class="btn btn--outline" id="close-categories-modal2">Schließen</button>
        </div>
      </div>
    </div>
  `;

  renderIcons(document.getElementById('page-content'));

  let editId = null;
  let chargeEditId = null;
  let chargeArticleId = null;
  let inspEditId = null;
  let inspArticleId = null;
  let instanceEditId = null;
  let compArticleId = null;
  let instanceArticleId = null;
  let locationEditId = null;

  const ffName = settings?.ff_name || 'FeuerwehrHub';
  let qrScanner    = null;
  let qrRunning    = false;
  let categories   = initCategories || [];
  let lastArticles = [];

  const CONDITION_LABEL = { gut: 'Gut', in_wartung: 'In Wartung', defekt: 'Defekt', ausgemustert: 'Ausgemustert' };
  const CONDITION_COLOR = { gut: 'var(--gruen)', in_wartung: 'var(--gelb)', defekt: 'var(--error)', ausgemustert: 'var(--text-subtle)' };
  const expandedArticles = new Set();
  let currentSearch = '';
  let currentCategory = '';
  let currentLocation = null;  // UUID des gewählten Lagerorts, null = alle
  let allLocations = locations || [];

  // ── Bestandteile ──────────────────────────────────────────────────────────

  async function openCompModal(articleId) {
    compArticleId = articleId;
    const allArticles = await api.getArticles({});
    const select = document.getElementById('comp-child-id');
    select.innerHTML = allArticles
      .filter(a => a.id !== articleId)
      .map(a => `<option value="${a.id}">${esc(a.name)}${a.category ? ` (${esc(a.category)})` : ''}</option>`)
      .join('');
    document.getElementById('comp-quantity').value = 1;
    document.getElementById('comp-modal').classList.add('active');
  }

  function closeCompModal() {
    document.getElementById('comp-modal').classList.remove('active');
    compArticleId = null;
  }

  // ── Kategorie-Datalist aktuell halten ─────────────────────────────────────

  function refreshCatDatalist() {
    const dl = document.getElementById('a-cat-list');
    if (dl) dl.innerHTML = categories.map(c => `<option value="${esc(c.label)}">`).join('');
  }

  async function loadCategoriesModal() {
    const list = document.getElementById('categories-list');
    if (!list) return;
    list.innerHTML = '<p class="text-muted text-sm">Lade...</p>';
    try {
      categories = await api.getArticleCategories();
    } catch (e) {
      list.innerHTML = `<p class="error-msg">${esc(e.message)}</p>`;
      return;
    }
    refreshCatDatalist();
    if (!categories.length) {
      list.innerHTML = '<p class="text-muted text-sm">Noch keine Kategorien angelegt.</p>';
      return;
    }
    list.innerHTML = `<table class="table table--compact"><thead><tr>
      <th>Bezeichnung</th><th>Artikel</th><th></th>
    </tr></thead><tbody>${categories.map(c => `
      <tr id="cat-row-${c.id}">
        <td id="cat-label-${c.id}">${esc(c.label)}</td>
        <td class="text-muted text-sm">${c.used_count > 0 ? c.used_count : '—'}</td>
        <td><div class="btn-group">
          <button class="btn btn--ghost btn--sm" data-action="cat-edit" data-id="${c.id}" data-label="${esc(c.label)}">${icon('pencil', 12)}</button>
          <button class="btn btn--ghost btn--sm text-error" data-action="cat-delete" data-id="${c.id}" data-count="${c.used_count}"
            ${c.used_count > 0 ? `title="${c.used_count} Artikel nutzen diese Kategorie"` : ''}>${icon('trash-2', 12)}</button>
        </div></td>
      </tr>`).join('')}</tbody></table>`;
    renderIcons(list);

    list.querySelectorAll('[data-action="cat-edit"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        const td = document.getElementById(`cat-label-${id}`);
        if (!td) return;
        td.innerHTML = `<div style="display:flex;gap:6px;align-items:center">
          <input type="text" id="cat-edit-${id}" value="${esc(btn.dataset.label)}" class="field" style="flex:1" />
          <button class="btn btn--primary btn--sm" id="cat-save-${id}">✓</button>
          <button class="btn btn--outline btn--sm" id="cat-discard-${id}">✕</button>
        </div>`;
        document.getElementById(`cat-discard-${id}`).onclick = () => loadCategoriesModal();
        document.getElementById(`cat-save-${id}`).onclick = async () => {
          const newLabel = document.getElementById(`cat-edit-${id}`).value.trim();
          if (!newLabel) { toast('Bezeichnung darf nicht leer sein', 'error'); return; }
          try {
            await api.updateArticleCategory(id, { label: newLabel });
            toast('Gespeichert');
            loadCategoriesModal();
            load();
          } catch (e) { toast(e.message, 'error'); }
        };
      });
    });

    list.querySelectorAll('[data-action="cat-delete"]').forEach(btn => {
      btn.addEventListener('click', async () => {
        const count = +btn.dataset.count;
        if (count > 0 && !confirm(`Diese Kategorie wird von ${count} Artikel(n) genutzt. Trotzdem löschen?\n(Artikel behalten ihre Kategorie als Text)`)) return;
        try {
          await api.deleteArticleCategory(btn.dataset.id);
          toast('Kategorie gelöscht');
          loadCategoriesModal();
        } catch (e) { toast(e.message, 'error'); }
      });
    });
  }

  // ── QR-Kamera-Scanner ─────────────────────────────────────────────────────

  async function openScanModal() {
    document.getElementById('scan-modal').classList.add('active');
    try {
      qrScanner = new Html5Qrcode('qr-reader-lager');
      const qrConfig = { fps: 10, qrbox: { width: 240, height: 240 } };
      const onDecode = (text) => {
        closeScanModal();
        if (text.startsWith('http://') || text.startsWith('https://')) {
          window.location.href = text;
          return;
        }
        document.getElementById('ean-input').value = text;
        document.getElementById('ean-result').innerHTML = '';
        document.getElementById('ean-modal').classList.add('active');
        searchEan(text);
      };
      try {
        await qrScanner.start({ facingMode: 'environment' }, qrConfig, onDecode, () => {});
        qrRunning = true;
      } catch {
        const devices = await Html5Qrcode.getCameras();
        if (devices?.length) {
          const cam = devices.find(d => /back|rear|environment/i.test(d.label)) || devices[devices.length - 1];
          await qrScanner.start(cam.id, qrConfig, onDecode, () => {});
          qrRunning = true;
        }
      }
    } catch {
      document.getElementById('qr-reader-lager').innerHTML =
        '<p class="scan-no-camera">Kamera nicht verfügbar oder Zugriff verweigert.</p>';
    }
  }

  async function closeScanModal() {
    document.getElementById('scan-modal').classList.remove('active');
    if (qrScanner && qrRunning) {
      try { await qrScanner.stop(); } catch {}
      qrRunning = false;
    }
    const reader = document.getElementById('qr-reader-lager');
    if (reader) reader.innerHTML = '';
  }

  // ── Lagerort-Hilfsfunktionen ──────────────────────────────────────────────

  function buildLocationTree(nodes, parentId = null) {
    return nodes
      .filter(l => (l.parent_id ?? null) === parentId)
      .sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  }

  function renderLocationNode(loc, depth = 0) {
    const children = buildLocationTree(allLocations, loc.id);
    const isSelected = currentLocation === loc.id;
    const pad = depth * 14;
    return `
      <div class="loc-item ${isSelected ? 'loc-item--active' : ''}"
           data-action="select-loc" data-id="${loc.id}" style="--depth:${depth}">
        <span class="loc-item__label" title="${esc(loc.name)}">${esc(loc.name)}</span>
        <button class="btn btn--ghost btn--sm loc-item__btn" data-action="edit-loc" data-id="${loc.id}" title="Bearbeiten">${icon('pencil', 11)}</button>
        <button class="btn btn--ghost btn--sm loc-item__btn loc-item__btn--delete" data-action="delete-loc" data-id="${loc.id}" title="Löschen">${icon('trash-2', 11)}</button>
      </div>
      ${children.map(c => renderLocationNode(c, depth + 1)).join('')}
    `;
  }

  function renderLocationTree() {
    const tree = document.getElementById('location-tree');
    if (!tree) return;
    const roots = buildLocationTree(allLocations);
    const allSelected = currentLocation === null;
    tree.innerHTML = `
      <div class="loc-item loc-item--root ${allSelected ? 'loc-item--active' : ''}"
           data-action="select-loc" data-id="">
        ${icon('list', 12)} Alle Artikel
      </div>
      ${roots.map(l => renderLocationNode(l, 0)).join('')}
    `;
    renderIcons(tree);
  }

  // Flat-Liste für Dropdowns (eingerückt via Leerzeichen)
  function buildLocationOptions(excludeId = null, nodes = null, parentId = null, depth = 0) {
    const source = nodes ?? buildLocationTree(allLocations, parentId);
    let html = '';
    for (const loc of source) {
      if (loc.id === excludeId) continue;
      const indent = '   '.repeat(depth);
      html += `<option value="${loc.id}">${indent}${esc(loc.name)}</option>`;
      html += buildLocationOptions(excludeId, buildLocationTree(allLocations, loc.id), null, depth + 1);
    }
    return html;
  }

  function refreshLocationSelects(excludeId = null) {
    const opts = buildLocationOptions(excludeId);
    const aLoc = document.getElementById('a-location');
    const locParent = document.getElementById('loc-parent');
    if (aLoc)      aLoc.innerHTML      = `<option value="">— Kein Lagerort —</option>${opts}`;
    if (locParent) locParent.innerHTML = `<option value="">— Kein (Stamm-Ebene) —</option>${buildLocationOptions(excludeId)}`;
  }

  renderLocationTree();
  refreshLocationSelects();

  // ── QR-Label-Druck ────────────────────────────────────────────────────────
  async function printQrLabel(title, sub1, sub2, qrContent) {
    const dataUrl = await QRCode.toDataURL(qrContent, {
      width: 200, margin: 1,
      color: { dark: '#000000', light: '#ffffff' },
    });
    const win = window.open('', '_blank');
    win.document.write(`<!DOCTYPE html><html lang="de"><head>
      <meta charset="utf-8"><title>Label</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: sans-serif; padding: 16px; }
        .label { display: inline-flex; align-items: center; gap: 14px; border: 1.5px solid #333; border-radius: 8px; padding: 12px 16px; }
        .label__title { font-weight: 700; font-size: 15px; margin-bottom: 4px; }
        .label__sub { font-size: 11px; color: #555; line-height: 1.6; }
        @media print { body { padding: 0; } }
      </style></head><body>
      <div class="label">
        <img src="${dataUrl}" width="110" height="110" alt="QR-Code">
        <div>
          <div class="label__title">${title}</div>
          ${sub1 || sub2 ? `<div class="label__sub">${[sub1, sub2].filter(Boolean).join('<br>')}</div>` : ''}
        </div>
      </div>
      <script>window.onload = () => window.print()<\/script>
    </body></html>`);
    win.document.close();
  }

  // ── Artikel laden ─────────────────────────────────────────────────────────

  async function load() {
    const params = {};
    if (currentSearch)   params.search      = currentSearch;
    if (currentCategory) params.category    = currentCategory;
    if (currentLocation) params.location_id = currentLocation;
    const articles = await api.getArticles(params);
    lastArticles = articles || [];

    // Kategorie-Dropdown: konfigurierte Kategorien + ggf. verwaiste aus Artikeln
    const catSelect = document.getElementById('category-filter');
    if (catSelect) {
      const prev = catSelect.value;
      const configuredLabels = new Set(categories.map(c => c.label));
      const orphans = [...new Set((articles || []).map(a => a.category).filter(Boolean))]
        .filter(c => !configuredLabels.has(c)).sort();
      const allCats = [...categories.map(c => c.label), ...orphans];
      catSelect.innerHTML = '<option value="">Alle Kategorien</option>' +
        allCats.map(c => `<option value="${esc(c)}" ${c === prev ? 'selected' : ''}>${esc(c)}</option>`).join('');
    }
    refreshCatDatalist();
    const tbody = document.getElementById('articles-tbody');

    if (!articles || articles.length === 0) {
      tbody.innerHTML = `<tr><td colspan="8" class="table-empty">Keine Artikel vorhanden</td></tr>`;
      return;
    }

    tbody.innerHTML = articles.map(a => {
      const ist  = a.current_stock ?? 0;
      const soll = a.min_stock ?? 0;
      const low  = soll > 0 && ist < soll;
      const ok   = soll > 0 && ist >= soll;

      let bestandHtml;
      if (soll === 0 && ist === 0) {
        bestandHtml = `<span class="text-subtle">—</span>`;
      } else {
        const cls = low ? 'text-error fw-semibold' : ok ? 'text-success fw-semibold' : 'fw-semibold';
        const stockIcon = low ? `${icon('alert-triangle', 13)} ` : ok ? `${icon('check-circle', 13)} ` : '';
        bestandHtml = `<span class="${cls}">${stockIcon}${ist} / ${soll}</span>`;
      }

      const expanded = expandedArticles.has(a.id);

      const locName = a.storage_location_id
        ? (allLocations.find(l => l.id === a.storage_location_id)?.name || '—')
        : '—';

      return `
        <tr class="article-row ${low ? 'row--warning' : ''}" data-article-id="${a.id}" data-instance-tracking="${a.instance_tracking}">
          <td>
            <button class="btn btn--ghost btn--sm" data-action="toggle" data-id="${a.id}" title="Chargen anzeigen">
              ${icon(expanded ? 'chevron-down' : 'chevron-right', 14)}
            </button>
          </td>
          <td><strong>${esc(a.name)}</strong></td>
          <td>${esc(a.category) || '—'}</td>
          <td><code class="text-sm">${esc(a.ean) || '—'}</code></td>
          <td>${esc(a.unit)}</td>
          <td>${bestandHtml}</td>
          <td class="text-subtle text-sm">${esc(locName)}</td>
          <td>
            <div class="btn-group">
              <button class="btn btn--outline btn--sm" data-action="qr-article"
                data-name="${esc(a.name)}" data-ean="${esc(a.ean||'')}" data-cat="${esc(a.category||'')}"
                title="Label drucken">
                ${icon('qr-code', 14)}
              </button>
              <button class="btn btn--outline btn--sm" data-action="edit" data-id="${a.id}">
                ${icon('file-pen', 14)}
              </button>
              <button class="btn btn--danger btn--sm" data-action="delete" data-id="${a.id}">
                ${icon('trash-2', 14)}
              </button>
            </div>
          </td>
        </tr>
        ${expanded ? `<tr class="charge-row"><td colspan="8" id="expanded-${a.id}" class="charges-container"></td></tr>` : ''}
      `;
    }).join('');
    renderIcons(tbody);

    // Expandierte Artikel nachladen
    for (const id of expandedArticles) {
      loadExpanded(id);
    }
  }

  // ── Expanded: Chargen + Inspektionen ─────────────────────────────────────

  async function loadExpanded(articleId) {
    const container = document.getElementById(`expanded-${articleId}`);
    if (!container) return;
    // Artikel aus der aktuellen Liste holen um instance_tracking zu kennen
    const articlesEls = document.querySelectorAll(`[data-article-id="${articleId}"]`);
    const isInstanceTracking = articlesEls[0]?.dataset.instanceTracking === 'true';
    container.innerHTML = `
      <div id="instances-${articleId}"></div>
      <div id="charges-${articleId}"></div>
      <div id="inspections-${articleId}"></div>
      <div id="components-${articleId}"></div>
    `;
    const tasks = [loadCharges(articleId), loadInspections(articleId), loadComponents(articleId)];
    if (isInstanceTracking) tasks.unshift(loadInstances(articleId));
    await Promise.all(tasks);
  }

  async function loadInstances(articleId) {
    const container = document.getElementById(`instances-${articleId}`);
    if (!container) return;
    const articleName = document.querySelector(`[data-article-id="${articleId}"] td:nth-child(2) strong`)?.textContent?.trim() || '';
    const instances = await api.getArticleInstances(articleId);
    container.innerHTML = `
      <div class="expanded-section">
        <div class="expanded-section__header">
          <strong class="expanded-section__label">Einzelobjekte</strong>
          <button class="btn btn--outline btn--sm" data-action="new-instance" data-article-id="${articleId}">
            ${icon('plus', 12)} Instanz
          </button>
        </div>
        ${instances.length === 0
          ? '<p class="expanded-section__empty">Noch keine Instanzen erfasst</p>'
          : `<table class="table--nested">
              <thead><tr><th>Seriennr.</th><th>Bezeichnung</th><th>Zustand</th><th>Lagerort</th><th>Aktionen</th></tr></thead>
              <tbody>
                ${instances.map(inst => {
                  const cond = inst.condition || 'gut';
                  const locName = inst.storage_location_id
                    ? (allLocations.find(l => l.id === inst.storage_location_id)?.name || '—') : '—';
                  return `<tr>
                    <td><code>${esc(inst.serial_number) || '—'}</code></td>
                    <td>${esc(inst.label) || '—'}</td>
                    <td><span class="condition--${cond}">${CONDITION_LABEL[cond] || cond}</span></td>
                    <td class="text-sm">${esc(locName)}</td>
                    <td><div class="btn-group">
                      <button class="btn btn--outline btn--sm" data-action="qr-instance"
                        data-serial="${esc(inst.serial_number||'')}" data-label="${esc(inst.label||'')}"
                        data-article-name="${esc(articleName)}"
                        data-token="${esc(inst.scan_token||'')}" title="Label drucken">
                        ${icon('qr-code', 12)}
                      </button>
                      <button class="btn btn--outline btn--sm" data-action="edit-instance"
                        data-article-id="${articleId}" data-instance-id="${inst.id}"
                        data-serial="${esc(inst.serial_number||'')}" data-label="${esc(inst.label||'')}"
                        data-condition="${cond}" data-loc="${inst.storage_location_id||''}"
                        data-notes="${esc(inst.notes||'')}">
                        ${icon('file-pen', 12)}
                      </button>
                      <button class="btn btn--danger btn--sm" data-action="delete-instance"
                        data-article-id="${articleId}" data-instance-id="${inst.id}">
                        ${icon('trash-2', 12)}
                      </button>
                    </div></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`
        }
      </div>`;
    renderIcons(container);
  }

  async function loadComponents(articleId) {
    const container = document.getElementById(`components-${articleId}`);
    if (!container) return;
    const components = await api.getArticleComponents(articleId);
    container.innerHTML = `
      <div class="expanded-section">
        <div class="expanded-section__header">
          <strong class="expanded-section__label">Bestandteile</strong>
          <button class="btn btn--outline btn--sm" data-action="new-comp" data-article-id="${articleId}">
            ${icon('plus', 12)} Bestandteil
          </button>
        </div>
        ${components.length === 0
          ? '<p class="expanded-section__empty">Noch keine Bestandteile erfasst</p>'
          : `<table class="table--nested">
              <thead><tr><th>Artikel</th><th>Kategorie</th><th>Menge</th><th>Einheit</th><th></th></tr></thead>
              <tbody>
                ${components.map(c => `<tr>
                  <td>${esc(c.child_name)}</td>
                  <td class="text-subtle text-sm">${esc(c.child_category) || '—'}</td>
                  <td class="fw-semibold">${c.quantity}</td>
                  <td class="text-sm">${esc(c.child_unit)}</td>
                  <td>
                    <button class="btn btn--danger btn--sm" data-action="delete-comp"
                      data-article-id="${articleId}" data-comp-id="${c.id}">
                      ${icon('trash-2', 12)}
                    </button>
                  </td>
                </tr>`).join('')}
              </tbody>
            </table>`
        }
      </div>`;
    renderIcons(container);
  }

  async function loadCharges(articleId) {
    const container = document.getElementById(`charges-${articleId}`);
    if (!container) return;

    const charges = await api.getCharges(articleId);
    const today = new Date().toISOString().slice(0, 10);

    container.innerHTML = `
      <div class="expanded-section">
        <div class="expanded-section__header">
          <strong class="expanded-section__label">Chargen</strong>
          <button class="btn btn--outline btn--sm" data-action="new-charge" data-article-id="${articleId}">
            ${icon('plus', 12)} Charge
          </button>
        </div>
        ${charges.length === 0
          ? '<p class="expanded-section__empty">Keine Chargen vorhanden</p>'
          : `<table class="table--nested">
              <thead><tr><th>Chargennr.</th><th>MHD</th><th>Menge</th><th>Aktionen</th></tr></thead>
              <tbody>
                ${charges.map(c => {
                  const expired = c.mhd && c.mhd < today;
                  const soon = c.mhd && !expired && c.mhd <= new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
                  const mhdColor = expired ? 'var(--error)' : soon ? 'var(--gelb)' : '';
                  const mhdIcon = expired ? icon('alert-triangle', 12) + ' ' : soon ? icon('clock', 12) + ' ' : '';
                  return `<tr>
                    <td><code>${esc(c.charge_nr)}</code></td>
                    <td>${c.mhd ? `<span class="date-status${expired?' date-status--overdue':soon?' date-status--soon':''}">${mhdIcon}${formatDate(c.mhd)}</span>` : '—'}</td>
                    <td>${c.menge}</td>
                    <td><div class="btn-group">
                      <button class="btn btn--outline btn--sm" data-action="edit-charge"
                        data-article-id="${articleId}" data-charge-id="${c.id}"
                        data-charge-nr="${esc(c.charge_nr)}" data-mhd="${c.mhd||''}" data-menge="${c.menge}">
                        ${icon('file-pen', 12)}
                      </button>
                      <button class="btn btn--danger btn--sm" data-action="delete-charge"
                        data-article-id="${articleId}" data-charge-id="${c.id}">
                        ${icon('trash-2', 12)}
                      </button>
                    </div></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`
        }
      </div>`;
    renderIcons(container);
  }

  async function loadInspections(articleId) {
    const container = document.getElementById(`inspections-${articleId}`);
    if (!container) return;

    const inspections = await api.getArticleInspections(articleId);
    const today = new Date().toISOString().slice(0, 10);
    const soon30 = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);

    container.innerHTML = `
      <div class="expanded-section">
        <div class="expanded-section__header">
          <strong class="expanded-section__label">Prüfungen & Fristen</strong>
          <button class="btn btn--outline btn--sm" data-action="new-insp" data-article-id="${articleId}">
            ${icon('plus', 12)} Frist
          </button>
        </div>
        ${inspections.length === 0
          ? '<p class="expanded-section__empty">Keine Fristen vorhanden</p>'
          : `<table class="table--nested">
              <thead><tr><th>Bezeichnung</th><th>Letzte Prüfung</th><th>Nächste Prüfung</th><th>Intervall</th><th>Aktionen</th></tr></thead>
              <tbody>
                ${inspections.map(i => {
                  const overdue = i.next_date && i.next_date < today;
                  const soon    = i.next_date && !overdue && i.next_date <= soon30;
                  const ico = overdue ? icon('alert-triangle', 12) + ' ' : soon ? icon('clock', 12) + ' ' : '';
                  return `<tr>
                    <td><strong>${esc(i.name)}</strong>${i.notes ? `<br/><small class="text-subtle">${esc(i.notes)}</small>` : ''}</td>
                    <td>${formatDate(i.last_date)}</td>
                    <td>${i.next_date ? `<span class="date-status${overdue?' date-status--overdue':soon?' date-status--soon':''}">${ico}${formatDate(i.next_date)}</span>` : '—'}</td>
                    <td>${i.interval_months ? `${i.interval_months} Monate` : '—'}</td>
                    <td><div class="btn-group">
                      <button class="btn btn--outline btn--sm" data-action="edit-insp"
                        data-article-id="${articleId}" data-insp-id="${i.id}"
                        data-name="${esc(i.name)}" data-last="${i.last_date||''}"
                        data-next="${i.next_date||''}" data-interval="${i.interval_months||''}"
                        data-notes="${esc(i.notes||'')}">
                        ${icon('file-pen', 12)}
                      </button>
                      <button class="btn btn--danger btn--sm" data-action="delete-insp"
                        data-article-id="${articleId}" data-insp-id="${i.id}">
                        ${icon('trash-2', 12)}
                      </button>
                    </div></td>
                  </tr>`;
                }).join('')}
              </tbody>
            </table>`
        }
      </div>`;
    renderIcons(container);
  }

  // ── Artikel-Modal ─────────────────────────────────────────────────────────

  async function openModal(articleId = null) {
    editId = articleId;
    refreshLocationSelects();
    const trackingCb   = document.getElementById('a-instance-tracking');
    const trackingHint = document.getElementById('a-instance-tracking-hint');
    const stockField   = document.getElementById('a-current-stock');

    if (articleId) {
      const a = await api.getArticle(articleId);
      document.getElementById('modal-title').textContent = 'Artikel bearbeiten';
      document.getElementById('a-name').value = a.name || '';
      document.getElementById('a-category').value = a.category || '';
      document.getElementById('a-ean').value = a.ean || '';
      document.getElementById('a-location').value = a.storage_location_id || '';
      document.getElementById('a-unit').value = a.unit || units[0]?.label || '';
      document.getElementById('a-current-stock').value = a.current_stock ?? 0;
      document.getElementById('a-min-stock').value = a.min_stock ?? 0;
      document.getElementById('a-notes').value = a.notes || '';
      trackingCb.checked = !!a.instance_tracking;
    } else {
      document.getElementById('modal-title').textContent = 'Neuer Artikel';
      document.getElementById('a-name').value = '';
      document.getElementById('a-category').value = '';
      document.getElementById('a-ean').value = '';
      document.getElementById('a-location').value = currentLocation || '';
      document.getElementById('a-unit').value = units[0]?.label || '';
      document.getElementById('a-current-stock').value = 0;
      document.getElementById('a-min-stock').value = 0;
      document.getElementById('a-notes').value = '';
      trackingCb.checked = false;
    }
    const updateTrackingUI = () => {
      const on = trackingCb.checked;
      stockField.disabled = on;
      trackingHint.style.display = on ? '' : 'none';
    };
    updateTrackingUI();
    trackingCb.onchange = updateTrackingUI;
    document.getElementById('article-modal').classList.add('active');
  }

  function closeArticleModal() {
    document.getElementById('article-modal').classList.remove('active');
    editId = null;
  }

  // ── Charge-Modal ──────────────────────────────────────────────────────────

  function openChargeModal(articleId, charge = null) {
    chargeArticleId = articleId;
    chargeEditId = charge?.id || null;
    document.getElementById('charge-modal-title').textContent = charge ? 'Charge bearbeiten' : 'Neue Charge';
    document.getElementById('c-charge-nr').value = charge?.charge_nr || '';
    document.getElementById('c-mhd').value = charge?.mhd || '';
    document.getElementById('c-menge').value = charge?.menge ?? 0;
    document.getElementById('charge-modal').classList.add('active');
  }

  function closeChargeModal() {
    document.getElementById('charge-modal').classList.remove('active');
    chargeEditId = null;
    chargeArticleId = null;
  }

  // ── Inspektions-Modal ─────────────────────────────────────────────────────

  function openInspModal(articleId, insp = null) {
    inspArticleId = articleId;
    inspEditId = insp?.id || null;
    document.getElementById('insp-modal-title').textContent = insp ? 'Frist bearbeiten' : 'Neue Frist';
    document.getElementById('i-name').value         = insp?.name || '';
    document.getElementById('i-last-date').value    = insp?.last_date || '';
    document.getElementById('i-next-date').value    = insp?.next_date || '';
    document.getElementById('i-interval').value     = insp?.interval_months ?? '';
    document.getElementById('i-notes').value        = insp?.notes || '';
    document.getElementById('insp-modal').classList.add('active');
  }

  function closeInspModal() {
    document.getElementById('insp-modal').classList.remove('active');
    inspEditId = null;
    inspArticleId = null;
  }

  // ── Instanz-Modal ─────────────────────────────────────────────────────────

  function openInstanceModal(articleId, inst = null) {
    instanceArticleId = articleId;
    instanceEditId = inst?.id || null;
    document.getElementById('instance-modal-title').textContent = inst ? 'Instanz bearbeiten' : 'Neue Instanz';
    document.getElementById('inst-serial').value    = inst?.serial_number || '';
    document.getElementById('inst-label').value     = inst?.label || '';
    document.getElementById('inst-condition').value = inst?.condition || 'gut';
    document.getElementById('inst-notes').value     = inst?.notes || '';
    // Lagerort-Optionen aktualisieren
    const instLoc = document.getElementById('inst-location');
    instLoc.innerHTML = `<option value="">— Kein Lagerort —</option>${buildLocationOptions()}`;
    instLoc.value = inst?.storage_location_id || '';
    document.getElementById('instance-modal').classList.add('active');
  }

  function closeInstanceModal() {
    document.getElementById('instance-modal').classList.remove('active');
    instanceEditId = null;
    instanceArticleId = null;
  }

  // ── EAN-Modal ─────────────────────────────────────────────────────────────

  function openEanModal() {
    document.getElementById('ean-input').value = '';
    document.getElementById('ean-result').innerHTML = '';
    document.getElementById('ean-modal').classList.add('active');
    setTimeout(() => document.getElementById('ean-input').focus(), 100);
  }

  function closeEanModal() {
    document.getElementById('ean-modal').classList.remove('active');
  }

  // ── Globaler USB-Barcode-Scanner-Listener ──────────────────────────────────
  // USB-Scanner senden Zeichen als schnelle Tastatureingabe + Enter am Ende.
  // Erkennung: viele Zeichen in kurzer Zeit (< 80ms pro Zeichen).
  {
    let scanBuffer = '';
    let scanTimeout = null;
    const SCAN_CHAR_DELAY = 80; // ms — Scanner tippen viel schneller als Menschen

    document.addEventListener('keydown', (e) => {
      // Ignorieren wenn ein Modal offen ist oder ein Input fokussiert
      const active = document.activeElement;
      const inInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.tagName === 'SELECT');
      const modalOpen = document.querySelector('.modal-overlay.active');
      if (inInput || modalOpen) return;

      if (e.key === 'Enter' && scanBuffer.length >= 8) {
        e.preventDefault();
        const ean = scanBuffer;
        scanBuffer = '';
        clearTimeout(scanTimeout);
        // EAN-Modal öffnen und direkt suchen
        document.getElementById('ean-input').value = ean;
        document.getElementById('ean-result').innerHTML = '';
        document.getElementById('ean-modal').classList.add('active');
        searchEan(ean);
        return;
      }

      // Nur druckbare Zeichen (Ziffern, Buchstaben)
      if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
        clearTimeout(scanTimeout);
        scanBuffer += e.key;
        scanTimeout = setTimeout(() => { scanBuffer = ''; }, SCAN_CHAR_DELAY);
      }
    });
  }

  // ── Event-Listener ────────────────────────────────────────────────────────

  document.getElementById('btn-new-article').addEventListener('click', () => openModal());
  document.getElementById('close-article-modal').addEventListener('click', closeArticleModal);
  document.getElementById('close-article-modal2').addEventListener('click', closeArticleModal);
  document.getElementById('close-charge-modal').addEventListener('click', closeChargeModal);
  document.getElementById('close-charge-modal2').addEventListener('click', closeChargeModal);
  document.getElementById('close-insp-modal').addEventListener('click', closeInspModal);
  document.getElementById('close-insp-modal2').addEventListener('click', closeInspModal);
  document.getElementById('close-instance-modal').addEventListener('click', closeInstanceModal);
  document.getElementById('close-instance-modal2').addEventListener('click', closeInstanceModal);
  if (isAdmin) {
    document.getElementById('btn-manage-categories').addEventListener('click', () => {
      document.getElementById('categories-modal').classList.add('active');
      loadCategoriesModal();
    });
    document.getElementById('close-categories-modal').addEventListener('click', () => {
      document.getElementById('categories-modal').classList.remove('active');
    });
    document.getElementById('close-categories-modal2').addEventListener('click', () => {
      document.getElementById('categories-modal').classList.remove('active');
    });
    document.getElementById('categories-modal').addEventListener('click', (e) => {
      if (e.target === document.getElementById('categories-modal'))
        document.getElementById('categories-modal').classList.remove('active');
    });
    document.getElementById('btn-add-category').addEventListener('click', async () => {
      const label = document.getElementById('new-cat-label').value.trim();
      if (!label) { toast('Bezeichnung eingeben', 'error'); return; }
      try {
        await api.createArticleCategory({ label });
        document.getElementById('new-cat-label').value = '';
        toast('Kategorie angelegt');
        loadCategoriesModal();
      } catch (e) { toast(e.message, 'error'); }
    });
    document.getElementById('new-cat-label').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('btn-add-category').click();
    });
  }

  document.getElementById('btn-pdf-articles').addEventListener('click', () => {
    if (!lastArticles.length) { toast('Keine Artikel zum Exportieren', 'error'); return; }
    const filterParts = [];
    if (currentCategory) filterParts.push(currentCategory);
    if (currentSearch)   filterParts.push(`Suche: "${currentSearch}"`);
    try { generateArtikelListe(lastArticles, ffName, filterParts.join(', ')); }
    catch (e) { toast(e.message, 'error'); }
  });

  document.getElementById('btn-scan-qr').addEventListener('click', openScanModal);
  document.getElementById('close-scan-modal').addEventListener('click', closeScanModal);
  document.getElementById('close-scan-modal2').addEventListener('click', closeScanModal);
  document.getElementById('scan-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('scan-modal')) closeScanModal();
  });
  document.getElementById('btn-scan-ean').addEventListener('click', openEanModal);
  document.getElementById('close-ean-modal').addEventListener('click', closeEanModal);
  document.getElementById('close-ean-modal2').addEventListener('click', closeEanModal);

  // EAN-Suche (Enter oder nach 13 Zeichen automatisch)
  const eanInput = document.getElementById('ean-input');
  let eanTimer = null;
  eanInput.addEventListener('input', () => {
    clearTimeout(eanTimer);
    const val = eanInput.value.trim();
    if (val.length >= 8) {
      eanTimer = setTimeout(() => searchEan(val), 400);
    }
  });
  eanInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      clearTimeout(eanTimer);
      searchEan(eanInput.value.trim());
    }
  });

  async function searchEan(ean) {
    const resultDiv = document.getElementById('ean-result');
    if (!ean) { resultDiv.innerHTML = ''; return; }

    try {
      const article = await api.lookupEan(ean);
      resultDiv.innerHTML = `
        <div class="ean-result ean-result--found">
          <strong>${esc(article.name)}</strong><br/>
          <span class="text-muted">Kategorie: ${esc(article.category) || '—'} · Einheit: ${esc(article.unit)} · Bestand: ${article.current_stock} / ${article.min_stock}</span><br/>
          <button class="btn btn--outline btn--sm ean-result__btn" onclick="document.getElementById('ean-modal').classList.remove('active')">
            Zum Artikel →
          </button>
        </div>
      `;
      // Artikel aufklappen
      expandedArticles.add(article.id);
      load();
    } catch {
      resultDiv.innerHTML = `
        <div class="ean-result ean-result--error">
          Kein Artikel mit EAN <code>${esc(ean)}</code> gefunden.
        </div>
      `;
    }
  }

  // Artikel-Tabelle Klicks
  document.getElementById('articles-tbody').addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    const action = btn.dataset.action;

    if (action === 'toggle') {
      const id = btn.dataset.id;
      if (expandedArticles.has(id)) {
        expandedArticles.delete(id);
      } else {
        expandedArticles.add(id);
      }
      load();
    }

    if (action === 'qr-article') {
      const name = btn.dataset.name;
      const ean  = btn.dataset.ean;
      const cat  = btn.dataset.cat;
      await printQrLabel(name, cat || null, ean ? `EAN: ${ean}` : null, ean || name);
    }

    if (action === 'qr-instance') {
      const serial      = btn.dataset.serial;
      const label       = btn.dataset.label;
      const articleName = btn.dataset.articleName;
      const token       = btn.dataset.token;
      const title       = articleName || label || serial || '—';
      const sub1        = label && label !== title ? label : null;
      const sub2        = serial ? `SN: ${serial}` : null;
      const qrContent   = token
        ? `${window.location.origin}/#/scan/${token}`
        : (serial || label || title);
      await printQrLabel(title, sub1, sub2, qrContent);
    }

    if (action === 'edit') {
      openModal(btn.dataset.id);
    }

    if (action === 'delete') {
      if (!confirm('Artikel wirklich löschen?')) return;
      try {
        await api.deleteArticle(btn.dataset.id);
        toast('Artikel gelöscht');
        load();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    if (action === 'new-instance') {
      openInstanceModal(btn.dataset.articleId);
    }

    if (action === 'edit-instance') {
      openInstanceModal(btn.dataset.articleId, {
        id:                  btn.dataset.instanceId,
        serial_number:       btn.dataset.serial || null,
        label:               btn.dataset.label || null,
        condition:           btn.dataset.condition || 'gut',
        storage_location_id: btn.dataset.loc || null,
        notes:               btn.dataset.notes || null,
      });
    }

    if (action === 'delete-instance') {
      if (!confirm('Instanz wirklich löschen?')) return;
      try {
        await api.deleteArticleInstance(btn.dataset.articleId, btn.dataset.instanceId);
        toast('Instanz gelöscht');
        loadInstances(btn.dataset.articleId);
        load();
      } catch (e) { toast(e.message, 'error'); }
    }

    if (action === 'new-insp') {
      openInspModal(btn.dataset.articleId);
    }

    if (action === 'edit-insp') {
      openInspModal(btn.dataset.articleId, {
        id:             btn.dataset.inspId,
        name:           btn.dataset.name,
        last_date:      btn.dataset.last || null,
        next_date:      btn.dataset.next || null,
        interval_months: btn.dataset.interval ? parseInt(btn.dataset.interval) : null,
        notes:          btn.dataset.notes || null,
      });
    }

    if (action === 'delete-insp') {
      if (!confirm('Frist wirklich löschen?')) return;
      try {
        await api.deleteArticleInspection(btn.dataset.articleId, btn.dataset.inspId);
        toast('Frist gelöscht');
        loadInspections(btn.dataset.articleId);
      } catch (e) { toast(e.message, 'error'); }
    }

    if (action === 'new-charge') {
      openChargeModal(btn.dataset.articleId);
    }

    if (action === 'edit-charge') {
      openChargeModal(btn.dataset.articleId, {
        id:        btn.dataset.chargeId,
        charge_nr: btn.dataset.chargeNr,
        mhd:       btn.dataset.mhd || null,
        menge:     parseInt(btn.dataset.menge) || 0,
      });
    }

    if (action === 'delete-charge') {
      if (!confirm('Charge wirklich löschen?')) return;
      try {
        await api.deleteCharge(btn.dataset.articleId, btn.dataset.chargeId);
        toast('Charge gelöscht');
        load();
      } catch (e) {
        toast(e.message, 'error');
      }
    }

    if (action === 'new-comp') {
      openCompModal(btn.dataset.articleId);
    }

    if (action === 'delete-comp') {
      if (!confirm('Bestandteil entfernen?')) return;
      try {
        await api.deleteArticleComponent(btn.dataset.articleId, btn.dataset.compId);
        toast('Bestandteil entfernt');
        loadComponents(btn.dataset.articleId);
      } catch (e) { toast(e.message, 'error'); }
    }
  });

  // Bestandteil speichern
  document.getElementById('close-comp-modal').addEventListener('click', closeCompModal);
  document.getElementById('close-comp-modal2').addEventListener('click', closeCompModal);
  document.getElementById('comp-modal').addEventListener('click', (e) => {
    if (e.target === document.getElementById('comp-modal')) closeCompModal();
  });
  document.getElementById('btn-save-comp').addEventListener('click', async () => {
    if (!compArticleId) return;
    const childId  = document.getElementById('comp-child-id').value;
    const quantity = parseInt(document.getElementById('comp-quantity').value) || 1;
    if (!childId) return;
    try {
      await api.createArticleComponent(compArticleId, { child_article_id: childId, quantity });
      toast('Bestandteil hinzugefügt');
      closeCompModal();
      loadComponents(compArticleId);
    } catch (e) { toast(e.message, 'error'); }
  });

  // Artikel speichern
  document.getElementById('btn-save-article').addEventListener('click', async () => {
    const body = {
      name:                document.getElementById('a-name').value.trim(),
      category:            document.getElementById('a-category').value.trim() || null,
      ean:                 document.getElementById('a-ean').value.trim() || null,
      unit:                document.getElementById('a-unit').value,
      current_stock:       parseInt(document.getElementById('a-current-stock').value) || 0,
      min_stock:           parseInt(document.getElementById('a-min-stock').value) || 0,
      notes:               document.getElementById('a-notes').value.trim() || null,
      storage_location_id: document.getElementById('a-location').value || null,
      instance_tracking:   document.getElementById('a-instance-tracking').checked,
    };

    if (!body.name) { toast('Bezeichnung eingeben', 'error'); return; }

    try {
      if (editId) {
        await api.updateArticle(editId, body);
        toast('Artikel aktualisiert');
      } else {
        await api.createArticle(body);
        toast('Artikel angelegt');
      }
      closeArticleModal();
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  // Instanz speichern
  document.getElementById('btn-save-instance').addEventListener('click', async () => {
    const body = {
      serial_number:       document.getElementById('inst-serial').value.trim() || null,
      label:               document.getElementById('inst-label').value.trim() || null,
      condition:           document.getElementById('inst-condition').value,
      storage_location_id: document.getElementById('inst-location').value || null,
      notes:               document.getElementById('inst-notes').value.trim() || null,
    };
    try {
      if (instanceEditId) {
        await api.updateArticleInstance(instanceArticleId, instanceEditId, body);
        toast('Instanz aktualisiert');
      } else {
        await api.createArticleInstance(instanceArticleId, body);
        toast('Instanz angelegt');
      }
      closeInstanceModal();
      loadInstances(instanceArticleId);
      load();
    } catch (e) { toast(e.message, 'error'); }
  });

  // Charge speichern
  document.getElementById('btn-save-charge').addEventListener('click', async () => {
    const body = {
      charge_nr: document.getElementById('c-charge-nr').value.trim(),
      mhd:       document.getElementById('c-mhd').value || null,
      menge:     parseInt(document.getElementById('c-menge').value) || 0,
    };

    if (!body.charge_nr) { toast('Chargennummer eingeben', 'error'); return; }

    try {
      if (chargeEditId) {
        await api.updateCharge(chargeArticleId, chargeEditId, body);
        toast('Charge aktualisiert');
      } else {
        await api.createCharge(chargeArticleId, body);
        toast('Charge angelegt');
      }
      closeChargeModal();
      load();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  // Inspektions-Frist speichern
  document.getElementById('btn-save-insp').addEventListener('click', async () => {
    const body = {
      name:            document.getElementById('i-name').value.trim(),
      last_date:       document.getElementById('i-last-date').value || null,
      next_date:       document.getElementById('i-next-date').value || null,
      interval_months: parseInt(document.getElementById('i-interval').value) || null,
      notes:           document.getElementById('i-notes').value.trim() || null,
    };
    if (!body.name) { toast('Bezeichnung eingeben', 'error'); return; }
    try {
      if (inspEditId) {
        await api.updateArticleInspection(inspArticleId, inspEditId, body);
        toast('Frist aktualisiert');
      } else {
        await api.createArticleInspection(inspArticleId, body);
        toast('Frist angelegt');
      }
      closeInspModal();
      loadInspections(inspArticleId);
    } catch (e) { toast(e.message, 'error'); }
  });

  // ── Suche & Kategorie-Filter ──────────────────────────────────────────────

  let searchTimer = null;
  document.getElementById('search-input').addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      currentSearch = e.target.value.trim();
      load();
    }, 300);
  });

  document.getElementById('category-filter').addEventListener('change', (e) => {
    currentCategory = e.target.value;
    load();
  });

  // ── Lagerort-Sidebar Klicks ───────────────────────────────────────────────

  document.getElementById('location-tree').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();

    if (btn.dataset.action === 'select-loc') {
      currentLocation = btn.dataset.id || null;
      renderLocationTree();
      load();
    }

    if (btn.dataset.action === 'edit-loc') {
      const loc = allLocations.find(l => l.id === btn.dataset.id);
      if (!loc) return;
      locationEditId = loc.id;
      refreshLocationSelects(loc.id);
      document.getElementById('location-modal-title').textContent = 'Lagerort bearbeiten';
      document.getElementById('loc-name').value = loc.name || '';
      document.getElementById('loc-parent').value = loc.parent_id || '';
      document.getElementById('loc-description').value = loc.description || '';
      document.getElementById('location-modal').classList.add('active');
    }

    if (btn.dataset.action === 'delete-loc') {
      const loc = allLocations.find(l => l.id === btn.dataset.id);
      if (!loc) return;
      if (!confirm(`Lagerort „${loc.name}" wirklich löschen?`)) return;
      api.deleteStorageLocation(loc.id)
        .then(() => {
          toast('Lagerort gelöscht');
          if (currentLocation === loc.id) currentLocation = null;
          return api.getStorageLocations();
        })
        .then(locs => {
          allLocations = locs || [];
          renderLocationTree();
          refreshLocationSelects();
          load();
        })
        .catch(err => toast(err.message, 'error'));
    }
  });

  document.getElementById('btn-new-location').addEventListener('click', () => {
    locationEditId = null;
    refreshLocationSelects();
    document.getElementById('location-modal-title').textContent = 'Neuer Lagerort';
    document.getElementById('loc-name').value = '';
    document.getElementById('loc-parent').value = '';
    document.getElementById('loc-description').value = '';
    document.getElementById('location-modal').classList.add('active');
    setTimeout(() => document.getElementById('loc-name').focus(), 80);
  });

  function closeLocationModal() {
    document.getElementById('location-modal').classList.remove('active');
    locationEditId = null;
  }
  document.getElementById('close-location-modal').addEventListener('click', closeLocationModal);
  document.getElementById('close-location-modal2').addEventListener('click', closeLocationModal);

  document.getElementById('btn-save-location').addEventListener('click', async () => {
    const body = {
      name:        document.getElementById('loc-name').value.trim(),
      parent_id:   document.getElementById('loc-parent').value || null,
      description: document.getElementById('loc-description').value.trim() || null,
    };
    if (!body.name) { toast('Name eingeben', 'error'); return; }
    try {
      if (locationEditId) {
        await api.updateStorageLocation(locationEditId, body);
        toast('Lagerort aktualisiert');
      } else {
        await api.createStorageLocation(body);
        toast('Lagerort angelegt');
      }
      closeLocationModal();
      allLocations = await api.getStorageLocations() || [];
      renderLocationTree();
      refreshLocationSelects();
    } catch (e) {
      toast(e.message, 'error');
    }
  });

  load();
}
