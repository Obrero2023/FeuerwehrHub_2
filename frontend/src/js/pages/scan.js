import { api } from '../api.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc } from '../utils.js';
import { navigate } from '../router.js';

const CONDITION_LABEL = {
  gut:          'Gut',
  in_wartung:   'In Wartung',
  defekt:       'Defekt',
  ausgemustert: 'Ausgemustert',
};

export async function renderScanView(token) {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('');

  const content = document.getElementById('page-content');

  let data;
  try {
    data = await api.getScanData(token);
  } catch {
    content.innerHTML = `
      <div class="page-header">
        <div><h2>QR-Code nicht gefunden</h2><p>Dieser Code ist ungültig oder nicht mehr aktiv.</p></div>
        <button class="btn btn--outline" data-action="back">Zurück</button>
      </div>`;
    content.querySelector('[data-action="back"]').addEventListener('click', () => navigate('#/articles'));
    return;
  }

  const cond = data.condition || 'ausgemustert';
  const condLabel = CONDITION_LABEL[cond] || cond;

  const inspectionHtml = data.next_inspection
    ? `<div class="scan-row"><span class="scan-row__label">Nächste Prüfung</span><span class="scan-row__value">${esc(data.next_inspection)}</span></div>`
    : '';

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>${esc(data.article_name)}</h2>
        ${data.article_category ? `<p>${esc(data.article_category)}</p>` : ''}
      </div>
      <div class="btn-group">
        <span class="condition--${esc(cond)}">${esc(condLabel)}</span>
        <button class="btn btn--outline" data-action="back">Zurück</button>
      </div>
    </div>

    <div class="card scan-card">
      ${data.label      ? `<div class="scan-row"><span class="scan-row__label">Bezeichnung</span><span class="scan-row__value">${esc(data.label)}</span></div>` : ''}
      ${data.serial_number ? `<div class="scan-row"><span class="scan-row__label">Seriennummer</span><span class="scan-row__value"><code>${esc(data.serial_number)}</code></span></div>` : ''}
      ${data.location_name ? `<div class="scan-row"><span class="scan-row__label">Lagerort</span><span class="scan-row__value">${esc(data.location_name)}</span></div>` : ''}
      ${inspectionHtml}
    </div>`;

  content.querySelector('[data-action="back"]').addEventListener('click', () => navigate('#/articles'));
}
