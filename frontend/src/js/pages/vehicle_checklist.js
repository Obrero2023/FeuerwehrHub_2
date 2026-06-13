import { api } from '../api.js';
import { renderShell, setShellInfo } from '../shell.js';
import { icon, renderIcons } from '../icons.js';

export async function rendervehicle_checklist() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('fahrzeugpruefung');

  const content = document.getElementById('page-content');

  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Fahrzeugprüfung</h2>
        <p>Verwaltung von Fahrzeugprüfungen und Inspektionen</p>
      </div>
    </div>

    <div class="tab-bar" id="inspection-tabs">
      <button class="tab-btn tab-btn--active" data-tab="hlf1">${icon('truck', 14)} HLF-1</button>
      <button class="tab-btn" data-tab="hlf2">${icon('truck', 14)} HLF-2</button>
      <button class="tab-btn" data-tab="mtf">${icon('truck', 14)} MTF</button>
    </div>

    <div id="tab-hlf1" class="tab-panel">
      <div class="content-card">
        <h3>HLF-1 Inspektionen</h3>
        <p>Hier werden die Inspektionen und Prüfungen für HLF-1 verwaltet.</p>
      </div>
    </div>
    <div id="tab-hlf2" class="tab-panel" style="display:none">
      <div class="content-card">
        <h3>HLF-2 Inspektionen</h3>
        <p>Hier werden die Inspektionen und Prüfungen für HLF-2 verwaltet.</p>
      </div>
    </div>
    <div id="tab-mtf" class="tab-panel" style="display:none">
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
}