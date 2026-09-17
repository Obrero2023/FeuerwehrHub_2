import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

export async function renderTeilnahmebescheinigung() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('teilnahmebescheinigung');

  const content = document.getElementById('page-content');

  // Berechtigungsprüfung
  const canRead = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('teilnahmebescheinigung');
  const canSchreiben = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('teilnahmebescheinigung.schreiben');
  const canAdmin = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('teilnahmebescheinigung.admin');

  if (!canRead && !canSchreiben && !canAdmin) {
    content.innerHTML = `
      <div class="page-header">
        <div><h2>Kein Zugriff</h2><p>Nur Benutzer mit entsprechender Berechtigung können auf diese Seite zugreifen.</p></div>
      </div>`;
    return;
  }

  const userId = user?.id;

  content.innerHTML = `
    <div class="page-header">
      <div><h2>Teilnahmebescheinigung Feuerwehreinsatz</h2><p>Bescheinigung für Teilnahme an einem Einsatz erstellen</p></div>
    </div>
    <div id="tc-create-form" style="display:none"></div>
    <div id="tc-list-wrap"></div>
  `;
  renderIcons(content);

  // Alle User für den Einheitsführer-Dropdown laden (nur mit Schreibrechten)
  let allUsers = [];
  try {
    // Nutzt das spezialisierte Endpoint, das auch für Nicht-Admins erreichbar ist
    allUsers = await api.getUnitLeaders().catch(() => []);
  } catch(e) {}

  // Zertifikate laden
  let certificates = [];
  let loading = true;

  const loadCertificates = async () => {
    try {
      const params = {};
      if (canSchreiben || canAdmin) {
        // Admin/Schreiben sieht alle
        certificates = await api.getParticipationCertificates(params).catch(() => []);
      } else {
        // Zeige eigene erstellte + als Einheitsführer erhaltene Bescheinigungen
        const [owned, asLeader] = await Promise.all([
          api.getParticipationCertificates({ user_id: userId }).catch(() => []),
          api.getParticipationCertificates({ unit_leader_id: userId }).catch(() => []),
        ]);
        const seen = new Set();
        certificates = [...owned, ...asLeader].filter(c => {
          if (seen.has(c.id)) return false;
          seen.add(c.id);
          return true;
        });
      }
    } catch(e) { toast(e.message, 'error'); }
    loading = false;
    renderCertificates();
  };

  const renderCertificates = () => {
    const grid = document.getElementById('tc-list-wrap');
    if (!grid) return;
    if (loading) { grid.innerHTML = '<div class="empty-state">Lade Bescheinigungen...</div>'; return; }
    if (!certificates.length) { grid.innerHTML = '<div class="empty-state">Keine Bescheinigungen vorhanden.</div>'; return; }

    const statusColors = {
      'pending':  '#f5c542',
      'approved': '#48bb78',
      'rejected': '#e53e3e',
      'signed':   '#0891b2',
    };
    const statusLabels = {
      'pending':  'Ausstehend',
      'approved': 'Freigegeben',
      'rejected': 'Abgelehnt',
      'signed':   'Unterschrieben',
    };

    grid.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>Datum Start</th><th>Datum Ende</th><th>Alarmzeit</th><th>Endzeit</th>
        <th>Einheitsführer</th><th>Ersteller</th><th>Status</th><th>Erstellt am</th><th>Aktionen</th>
      </tr></thead>
      <tbody>
        ${certificates.map(c => {
          const statusColor = statusColors[c.status] || '#6c757d';
          return `
          <tr data-id="${c.id}" style="--status-color: ${statusColor}">
            <td>${formatDate(c.start_date)}</td>
            <td>${formatDate(c.end_date)}</td>
            <td>${c.alarm_time}</td>
            <td>${c.end_time}</td>
            <td>${esc(c.unit_leader_name || '—')}</td>
            <td>${esc(c.username || '—')}</td>
            <td style="color:${statusColor};font-weight:600">${statusLabels[c.status] || c.status}</td>
            <td style="font-size:0.85em;color:var(--text-muted)">${formatDate(c.created_at)}</td>
            ${(() => {
              const isCreator = String(c.user_id) === String(userId);
              const isLeader = String(c.unit_leader_id) === String(userId);
              const canDownload = canRead && c.status === 'signed' && (isCreator || isLeader);
              if (!canSchreiben && !canAdmin && !canDownload) return '';
              return `<td>
              ${c.status === 'pending' ? `
                <select class="field field--sm status-select" data-id="${c.id}">
                  <option value="">— Aktion —</option>
                  <option value="signed">Unterschreiben</option>
                  <option value="rejected">Ablehnen</option>
                </select>` : ''}
              ${c.status === 'signed' ? `
                <button class="btn btn--sm btn--outline tc-pdf-btn" data-id="${c.id}" data-action="download-pdf">
                  ${icon('download', 12)} PDF herunterladen
                </button>
              ` : ''}
            </td>`;
            })()},
          </tr>
        `;}).join('')}
      </tbody>
    </table>`;
    renderIcons(grid);

    // Status-Änderungen
    grid.querySelectorAll('.status-select').forEach(select => {
      select.addEventListener('change', async (e) => {
        const certId = e.target.dataset.id;
        const newStatus = e.target.value;
        if (!newStatus) return;

        select.disabled = true;
        select.innerHTML = '<option>Wird verarbeitet...</option>';

        try {
          const signature = localStorage.getItem('ff_signature') || '';

          // Wenn Unterschreiben und Signatur vorhanden, zuerst hochladen
          if (newStatus === 'signed' && signature) {
            try {
              await api.uploadSignature(signature);
            } catch (sigErr) {
              toast('Unterschrift konnte nicht gespeichert werden', 'error');
            }
          }

          await api.updateCertificateStatus(certId, { status: newStatus });
          toast(newStatus === 'signed' ? 'Unterschrift registriert' : 'Status aktualisiert');
          await loadCertificates();
        } catch(e) { toast(e.message, 'error'); }
      });
    });

    // PDF-Download-Buttons
    grid.querySelectorAll('.tc-pdf-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const certId = btn.dataset.id;
        try {
          const blob = await api.downloadCertificatePdf(certId);
          if (!blob) return;

          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `teilnahmebescheinigung-${certId}.pdf`;
          a.click();
          URL.revokeObjectURL(url);
        } catch(e) { toast(e.message, 'error'); }
      });
    });
  };

  // Formular zum Erstellen einer Bescheinigung
  if (canRead) {
    const openCreateForm = () => {
      const formEl = document.getElementById('tc-create-form');
      formEl.style.display = 'block';
      formEl.innerHTML = `
        <div class="card">
          <div class="card__header">Neue Teilnahmebescheinigung erstellen</div>
          <div class="card__body">
            <div class="form-group">
              <label>Datum Start Einsatz <span class="required">*</span></label>
              <input type="date" id="tc-start-date" />
            </div>
            <div class="form-group">
              <label>Datum Ende Einsatz <span class="text-muted">(Standard: gleicher Tag wie Start)</span></label>
              <input type="date" id="tc-end-date" />
            </div>
            <div class="form-group">
              <label>Uhrzeit Alamierung <span class="required">*</span></label>
              <input type="time" id="tc-alarm-time" />
            </div>
            <div class="form-group">
              <label>Uhrzeit Einsatz Ende <span class="required">*</span></label>
              <input type="time" id="tc-end-time" />
            </div>
            <div class="form-group">
              <label>Einheitsführer <span class="required">*</span></label>
              <select id="tc-unit-leader">
                <option value="">— Einheitsführer wählen —</option>
                ${allUsers.map(u => `<option value="${u.id}">${esc(u.display_name || u.username)}</option>`).join('')}
              </select>
            </div>
            <div class="form-group" style="font-size:0.9em;color:var(--text-muted);margin-top:12px">
              <div>Erstellt für: <strong>${user?.username || 'Sie'}</strong></div>
            </div>
            <div class="btn-group mt-md">
              <button class="btn btn--primary" id="btn-save-tc">Senden</button>
              <button class="btn btn--outline" id="btn-cancel-tc">Abbrechen</button>
            </div>
          </div>
        </div>
      `;
      bindFormEvents('create');
    };

    const bindFormEvents = (mode) => {
      document.getElementById('btn-cancel-tc')?.addEventListener('click', () => {
        document.getElementById('tc-create-form').style.display = 'none';
      });

      document.getElementById('btn-save-tc')?.addEventListener('click', async () => {
        const startDate = document.getElementById('tc-start-date').value;
        const endDate = document.getElementById('tc-end-date').value;
        const alarmTime = document.getElementById('tc-alarm-time').value;
        const endTime = document.getElementById('tc-end-time').value;
        const unitLeaderId = document.getElementById('tc-unit-leader').value;

        if (!startDate || !alarmTime || !endTime || !unitLeaderId) {
          toast('Alle Felder sind erforderlich', 'error');
          return;
        }

        const endDateValue = endDate || startDate;

        const certificateData = {
          start_date: startDate,
          end_date: endDateValue,
          alarm_time: alarmTime,
          end_time: endTime,
          unit_leader_id: unitLeaderId,
        };

        try {
          await api.createParticipationCertificate(certificateData);
          toast('Teilnahmebescheinigung erstellt und an Einheitsführer gesendet');
          document.getElementById('tc-create-form').style.display = 'none';
          await loadCertificates();
        } catch(e) { toast(e.message, 'error'); }
      });
    };

    // Button zum Erstellen hinzufügen
    const header = content.querySelector('.page-header');
    const btn = document.createElement('button');
    btn.className = 'btn btn--primary';
    btn.id = 'btn-new-tc';
    btn.textContent = '+ Neue Bescheinigung';
    btn.addEventListener('click', openCreateForm);
    header.appendChild(btn);
  }

  await loadCertificates();
}