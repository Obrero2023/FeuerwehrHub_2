import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

export async function renderMeineAnmeldungen() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('meine-anmeldungen');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Meine Anmeldungen</h2>
        <p>Übersicht deiner Lehrgangs-Registrierungen</p>
      </div>
    </div>
    <div id="reg-list-wrap"></div>
  `;
  renderIcons(content);

  let registrations = [];
  let loading = true;

  const loadRegistrations = async () => {
    try {
      registrations = await api.listMyRegistrations().catch(() => []);
    } catch(e) { toast(e.message, 'error'); }
    loading = false;
    renderRegistrations();
  };

  const renderRegistrations = () => {
    const grid = document.getElementById('reg-list-wrap');
    if (!grid) return;
    if (loading) { grid.innerHTML = '<div class="empty-state">Lade Anmeldungen...</div>'; return; }
    if (!registrations.length) { grid.innerHTML = '<div class="empty-state">Keine Anmeldungen vorhanden.</div>'; return; }

    const statusColors = {
      'angemeldet': '#f5c542',       // gelb
      'platzzugewiesen': '#48bb78',   // grün
      'warteliste': '#2563eb',        // blau
      'abgelehnt': '#e53e3e',         // rot
      'storniert': '#9ca3af',         // grau
    };

    grid.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>Lehrgang</th><th>Ort</th><th>Start</th><th>Ende</th><th style="color:var(--text-color)">Status</th><th>Anmeldung am</th><th>Platz zugewiesen</th><th>Aktionen</th>
      </tr></thead>
      <tbody>
        ${registrations.map(r => {
          const statusColor = statusColors[r.status] || '#6c757d';
          return `
          <tr data-id="${r.id}" style="--status-color: ${statusColor}">
            <td>${esc(r.title)}</td>
            <td>${esc(r.location || '—')}</td>
            <td>${r.start_date ? formatDate(r.start_date) : '—'}</td>
            <td>${r.end_date ? formatDate(r.end_date) : '—'}</td>
            <td style="color:var(--status-color)">${r.status}</td>
            <td>${formatDate(new Date(r.registered_at))}</td>
            <td>${r.assigned_at ? formatDate(new Date(r.assigned_at)) : '—'}</td>
            <td>
              ${r.status === 'angemeldet' ? `<button class="btn btn--danger btn--sm btn-cancel-reg" data-id="${r.course_id}" data-title="${esc(r.title)}">Stornieren</button>` : ''}
            </td>
          </tr>
          `;}).join('')}
      </tbody>
    </table>`;
    renderIcons(grid);

    grid.querySelectorAll('.btn-cancel-reg').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm(`Anmeldung für "${btn.dataset.title}" stornieren?`)) return;
        try {
          await api.cancelRegistration(btn.dataset.id);
          toast('Anmeldung storniert');
          await loadRegistrations();
        } catch(e) { toast(e.message, 'error'); }
      });
    });
  };

  await loadRegistrations();
}