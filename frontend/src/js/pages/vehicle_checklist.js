import { api } from '../api.js';
import { renderShell, setShellInfo } from '../shell.js';
import { icon, renderIcons } from '../icons.js';

export async function rendervehiclechecklist() {
    console.log('Fahrzeugprüfung geladen');
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('fahrzeugpruefung');

  const hash = window.location.hash || '#/vehicle_checklist';
  const activeTab = hash.includes('hlf2-inspection') ? 'hlf2'
    : hash.includes('mtf-inspection') ? 'mtf'
    : 'hlf1';

  const content = document.getElementById('page-content');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Fahrzeugprüfung</h2>
        <p>Verwaltung von Fahrzeugprüfungen und Inspektionen</p>
      </div>
    </div>

    <div class="tab-bar" id="inspection-tabs">
      <button class="tab-btn${activeTab === 'hlf1' ? ' tab-btn--active' : ''}" data-tab="hlf1">${icon('truck', 14)} HLF-1</button>
      <button class="tab-btn${activeTab === 'hlf2' ? ' tab-btn--active' : ''}" data-tab="hlf2">${icon('truck', 14)} HLF-2</button>
      <button class="tab-btn${activeTab === 'mtf' ? ' tab-btn--active' : ''}" data-tab="mtf">${icon('truck', 14)} MTF</button>
    </div>

    <div id="tab-hlf1" class="tab-panel" style="display:${activeTab === 'hlf1' ? 'block' : 'none'}">
      <div class="content-card">
        <h3>HLF-1 Inspektionen</h3>
        <div class="inspection-checklist">
          <div class="inspection-item">
            <label class="inspection-label">
              <input type="checkbox" class="inspection-checkbox" id="pa-check">
              PA (Pumpenprüfung) prüfen
            </label>
            <span class="inspection-status" id="pa-status">Nicht geprüft</span>
          </div>
          <div class="inspection-item">
            <label class="inspection-label">
              <input type="checkbox" class="inspection-checkbox" id="ts-check">
              TS (Tragkraftspritze) prüfen
            </label>
            <span class="inspection-status" id="ts-status">Nicht geprüft</span>
          </div>
        </div>
        <p>Hier werden die Inspektionen und Prüfungen für HLF-1 verwaltet.</p>
      </div>
    </div>
    <div id="tab-hlf2" class="tab-panel" style="display:${activeTab === 'hlf2' ? 'block' : 'none'}">
      <div class="content-card">
        <h3>HLF-2 Inspektionen</h3>
        <p>Hier werden die Inspektionen und Prüfungen für HLF-2 verwaltet.</p>
      </div>
    </div>
    <div id="tab-mtf" class="tab-panel" style="display:${activeTab === 'mtf' ? 'block' : 'none'}">
      <div class="content-card">
        <h3>MTF Inspektionen</h3>
        <p>Hier werden die Inspektionen und Prüfungen für MTF verwaltet.</p>
      </div>
    </div>
  `;

  // Tab-Handling
  const tabs = content.querySelectorAll('.tab-btn');
  const panels = content.querySelectorAll('.tab-panel');

  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      // Deaktiviere alle Tabs und Panels
      tabs.forEach(t => t.classList.remove('tab-btn--active'));
      panels.forEach(p => p.style.display = 'none');

      // Aktiviere den geklickten Tab und sein Panel
      tab.classList.add('tab-btn--active');
      const tabId = tab.dataset.tab;
      document.getElementById(`tab-${tabId}`).style.display = 'block';
    });
  });

  renderIcons(content);

  // PA / TS Prüf-Handling (HLF-1)
  const paCheckbox = document.getElementById('pa-check');
  const paStatus = document.getElementById('pa-status');
  if (paCheckbox && paStatus) {
    paCheckbox.addEventListener('change', () => {
      paStatus.textContent = paCheckbox.checked ? 'Geprüft' : 'Nicht geprüft';
      paStatus.classList.toggle('inspection-status--done', paCheckbox.checked);
    });
  }

  const tsCheckbox = document.getElementById('ts-check');
  const tsStatus = document.getElementById('ts-status');
  if (tsCheckbox && tsStatus) {
    tsCheckbox.addEventListener('change', () => {
      tsStatus.textContent = tsCheckbox.checked ? 'Geprüft' : 'Nicht geprüft';
      tsStatus.classList.toggle('inspection-status--done', tsCheckbox.checked);
    });
  }
}