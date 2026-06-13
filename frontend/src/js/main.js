import { initRouter, registerRoute, registerScanRoute } from './router.js';

// Theme sofort anwenden, bevor der erste Paint passiert
if (localStorage.getItem('ff_theme') === 'dark') {
  document.documentElement.setAttribute('data-theme', 'dark');
}
import { renderLogin } from './pages/login.js';
import { renderSetup } from './pages/setup.js';
import { renderHome } from './pages/home.js';
import { renderOrders } from './pages/orders.js';
import { renderNewOrder } from './pages/new-order.js';
import { renderArticles } from './pages/articles.js';
import { renderSettings } from './pages/settings.js';
import { renderAdmin } from './pages/admin.js';
import { renderMyArea } from './pages/my-area.js';
import { renderPersonal } from './pages/personal.js';
import { renderVehicles } from './pages/vehicles.js';
import { rendervehicle_checklist } from './pages/vehicle_checklist.js';
import { renderIncidents } from './pages/incidents.js';
import { renderNewIncident } from './pages/new-incident.js';
import { renderEditIncident } from './pages/edit-incident.js';
import { renderVerein } from './pages/verein.js';
import { renderClock } from './pages/clock.js';
import { renderScanView } from './pages/scan.js';
import { renderDatenschutz } from './pages/datenschutz.js';
import { renderDienstReports } from './pages/dienst-reports.js';

// Routen registrieren
registerRoute('#/login',     renderLogin);
registerRoute('#/setup',     renderSetup);
registerRoute('#/',          renderHome);
registerRoute('#/my-area',   renderMyArea);
registerRoute('#/personal',  renderPersonal, 'personal');
registerRoute('#/termine',   renderPersonal, 'personal');
registerRoute('#/vehicles',  renderVehicles,  'fahrzeuge');
registerRoute('#/vehicle_checklist', rendervehicle_checklist, 'fahrzeugpruefung');
registerRoute('#/incidents',     renderIncidents,   'einsatzberichte');
registerRoute('#/new-incident',  renderNewIncident,  'einsatzberichte');
registerRoute('#/edit-incident', renderEditIncident, 'einsatzberichte');
registerRoute('#/orders',    renderOrders,    ['lager', 'lager.approve']);
registerRoute('#/new-order', renderNewOrder,  'lager');
registerRoute('#/articles',  renderArticles,  'lager');
registerRoute('#/settings',  renderSettings);
registerRoute('#/admin',     renderAdmin);
registerRoute('#/verein',         renderVerein,    'verein');
registerRoute('#/zeiterfassung', renderPersonal,  'personal');
registerRoute('#/clock',         renderClock);
registerRoute('#/datenschutz',     renderDatenschutz);
registerRoute('#/dienstberichte', renderDienstReports);

// Scan-Route (dynamisch, tokenbasiert)
registerScanRoute(renderScanView);

// Fallback
registerRoute('*', renderLogin);

// App starten
initRouter();
