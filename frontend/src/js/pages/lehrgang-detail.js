import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

export async function renderLehrgangDetail({ params }) {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  const courseId = params?.id;
  if (!courseId) {
    window.location.hash = '#/lehrgaenge';
    return;
  }
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgangsverwaltung');

  const canManage = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');
  const canRegister = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Lehrgang-Detail</h2>
        <p>Übersicht und Verwaltung des Lehrgangs</p>
      </div>
      <div class="btn-group" id="detail-actions">
        ${canManage ? `
          <button class="btn btn--outline" id="btn-edit-course">Bearbeiten</button>
          <button class="btn btn--primary" id="btn-assign-seats">Plätze zuweisen</button>
          ${canManage ? `<button class="btn btn--outline" id="btn-email-template">E-Mail-Vorlage</button>` : ''}
        ` : ''}
        <a class="btn btn--outline" href="#/lehrgaenge">Zurück zur Übersicht</a>
      </div>
    </div>
    <div id="course-detail-wrap"></div>
    <div id="course-assign-form" style="display:none"></div>
  `;
  renderIcons(content);

  let course = null;
  let registrations = [];
  let loading = true;

  const loadData = async () => {
    try {
      const [courseData, regs] = await Promise.all([
        api.getCourse(courseId).catch(() => null),
        api.listCourseRegistrations(courseId).catch(() => [])
      ]);
      course = courseData;
      registrations = regs || [];
    } catch(e) { toast(e.message, 'error'); }
    loading = false;
    renderDetail();
  };

  const renderDetail = () => {
    const detailWrap = document.getElementById('course-detail-wrap');
    if (!detailWrap) return;
    if (!course) {
      detailWrap.innerHTML = '<div class="error-msg">Lehrgang nicht gefunden oder nicht autorisiert.</div>';
      return;
    }
    if (loading) {
      detailWrap.innerHTML = '<div class="empty-state">Lade Lehrgangs-Details...</div>';
      return;
    }

    const startStr = course.start_date ? formatDate(course.start_date) : '—';
    const endStr   = course.end_date ? formatDate(course.end_date) : '—';
    const deadlineStr = course.registration_deadline ? formatDate(course.registration_deadline) : '—';
    const statusColors = {
      'entwurf': '#6c757d',
      'veroeffentlicht': '#48bb78',
      'abgeschlossen': '#2563eb',
      'archiviert': '#9ca3af',
    };
    const statusColor = statusColors[course.status] || '#6c757d';

    const assignedCount = registrations.filter(r => r.status === 'platzzugewiesen').length;
    const maxParticipants = course.max_participants || 0;
    const availableSeats = Math.max(0, maxParticipants - assignedCount);

    detailWrap.innerHTML = `
      <div class="card">
        <div class="card__header">${esc(course.title)}</div>
        <div class="card__body">
          <div class="detail-grid">
            <div class="detail-item">
              <strong>Titel</strong>
              <div>${esc(course.title)}</div>
            </div>
            <div class="detail-item">
              <strong>Beschreibung</strong>
              <div>${course.description ? esc(course.description) : '<em>Keine Beschreibung</em>'}</div>
            </div>
            <div class="detail-item">
              <strong>Ort</strong>
              <div>${esc(course.location || 'Nicht angegeben')}</div>
            </div>
            <div class="detail-item">
              <strong>Zeitraum</strong>
              <div>${startStr} – ${endStr}</div>
            </div>
            <div class="detail-item">
              <strong>Anmeldeschluss</strong>
              <div>${deadlineStr}</div>
            </div>
            <div class="detail-item">
              <strong>Max. Teilnehmer</strong>
              <div>${maxParticipants} (${assignedCount} belegt, ${availableSeats} frei)</div>
            </div>
            <div class="detail-item">
              <strong>Status</strong>
              <div style="color:var(--status-color);font-weight:600">${course.status}</div>
            </div>
            <div class="detail-item">
              <strong>Erstellt von</strong>
              <div>${esc(course.created_by_name || course.created_by?.toString() || 'Unbekannt')}</div>
            </div>
            <div class="detail-item">
              <strong>Erstellt am</strong>
              <div>${formatDate(new Date(course.created_at))}</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Registrierungen anzeigen
    if (registrations.length > 0 || canManage) {
      const regWrap = document.createElement('div');
      regWrap.innerHTML = `
        <div class="card card--no-top">
          <div class="card__header">Teilnehmer</div>
          <div class="card__body" id="registration-list-wrap">
            ${registrations.length > 0 ? '' : '<div class="empty-state">Keine Registrierungen vorhanden.</div>'}
          </div>
        </div>
      `;
      detailWrap.appendChild(regWrap);
      renderIcons(regWrap);

      if (registrations.length > 0) {
        const regList = document.getElementById('registration-list-wrap');
        if (regList) {
          const regTable = document.createElement('table');
          regTable.className = 'data-table';
          regTable.innerHTML = `
            <thead><tr>
              <th>Teilnehmer</th><th>Status</th><th>Anmeldung am</th><th>Platz zugewiesen</th>
              ${canManage ? '<th>Aktionen</th>' : ''}
            </tr></thead>
            <tbody>
              ${registrations.map(r => {
                const statusColors = {
                  'angemeldet': '#f5c542',
                  'platzzugewiesen': '#48bb78',
                  'warteliste': '#2563eb',
                  'abgelehnt': '#e53e3e',
                  'storniert': '#9ca3af',
                };
                const statusColor = statusColors[r.status] || '#6c757d';
                return `
                <tr data-id="${r.id}" style="--status-color: ${statusColor}">
                  <td>${esc(r.username || r.display_name || 'Unbekannt')}</td>
                  <td style="color:var(--status-color)">${r.status}</td>
                  <td>${formatDate(new Date(r.registered_at))}</td>
                  <td>${r.assigned_at ? formatDate(new Date(r.assigned_at)) : '—'}</td>
                  ${canManage ? `<td>
                    <div class="btn-group">
                      ${r.status !== 'platzzugewiesen' ? `<button class="btn btn--outline btn--sm btn-assign-seat" data-id="${r.id}">Platz zuweisen</button>` : ''}
                      ${r.status !== 'storniert' ? `<button class="btn btn--outline btn--sm btn-update-reg" data-id="${r.id}">Status ändern</button>` : ''}
                    </div>
                  </td>` : ''}
                </tr>
                `;}).join('')}
            </tbody>
          `;
          regList.innerHTML = '';
          regList.appendChild(regTable);
          renderIcons(regList);

          // Assign seat buttons
          regList.querySelectorAll('.btn-assign-seat').forEach(btn => {
            btn.addEventListener('click', async () => {
              if (!confirm(`Platz für "${esc(btn.dataset.participantName || btn.dataset.id)}" zuweisen?`)) return;
              try {
                await api.assignSeats(courseId, [btn.dataset.id]);
                toast('Platz zugewiesen');
                await loadData();
              } catch(e) { toast(e.message, 'error'); }
            });
          });

          // Update registration status buttons
          regList.querySelectorAll('.btn-update-reg').forEach(btn => {
            btn.addEventListener('click', () => {
              openRegistrationModal(btn.dataset.id);
            });
          });
        }
      }
    }

    // Action buttons
    const btnGroup = document.querySelector('.page-header .btn-group');
    if (canManage) {
      const editBtn = document.getElementById('btn-edit-course');
      if (editBtn) {
        editBtn.addEventListener('click', () => {
          window.location.hash = `#/lehrgang/${courseId}/edit`;
        });
      }

      const assignBtn = document.getElementById('btn-assign-seats');
      if (assignBtn) {
        assignBtn.addEventListener('click', () => openAssignForm());
      }

      const emailBtn = document.getElementById('btn-email-template');
      if (emailBtn) {
        emailBtn.addEventListener('click', async () => {
          try {
            const blob = await api.getEmailTemplate(courseId);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `lehrgang_${courseId}_teilnehmer.eml`;
            a.click();
            URL.revokeObjectURL(url);
            toast('E-Mail-Vorlage generiert');
          } catch(e) { toast(e.message, 'error'); }
        });
      }
    }

    const registerBtn = document.getElementById('btn-register-course');
    if (registerBtn) {
      registerBtn.addEventListener('click', async () => {
        try {
          await api.registerCourse(courseId);
          toast('Angemeldet!');
          await loadData();
        } catch(e) { toast(e.message, 'error'); }
      });
    }
  };

  const openAssignForm = () => {
    const formEl = document.getElementById('course-assign-form');
    formEl.style.display = 'block';
    const waitlist = registrations.filter(r => r.status === 'warteliste' || r.status === 'angemeldet');
    formEl.innerHTML = `
      <div class="card">
        <div class="card__header">Plätze zuweisen</div>
        <div class="card__body">
          <p>Verfügbare Plätze: ${availableSeats}/${maxParticipants}</p>
          <div class="form-group">
            <label>Warteliste / Angemeldete Teilnehmer</label>
            <div style="max-height:200px;overflow-y:auto;border:1px solid var(--border);padding:8px;border-radius:4px;">
              ${waitlist.map(r => `
                <label class="check-label" style="display:block;margin:4px 0;">
                  <input type="checkbox" value="${r.id}" ${r.status === 'angemeldet' ? 'checked' : ''} />
                  ${esc(r.username || r.display_name || 'Unbekannt')} (${r.status === 'angemeldet' ? 'angemeldet' : 'warteliste'})
                </label>
              `).join('')}
            </div>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-assign-selected">Ausgewählte zuweisen</button>
            <button class="btn btn--outline" id="btn-cancel-assign">Abbrechen</button>
          </div>
        </div>
      </div>
    `;
    renderIcons(formEl);

    document.getElementById('btn-cancel-assign')?.addEventListener('click', () => {
      document.getElementById('course-assign-form').style.display = 'none';
    });

    document.getElementById('btn-assign-selected')?.addEventListener('click', async () => {
      const checkboxes = formEl.querySelectorAll('input[type="checkbox"]:checked');
      const ids = Array.from(checkboxes).map(cb => cb.value);
      if (ids.length === 0) {
        toast('Keine Teilnehmer ausgewählt', 'error');
        return;
      }
      if (ids.length > availableSeats) {
        toast(`Nur ${availableSeats} Plätze verfügbar`, 'error');
        return;
      }
      try {
        await api.assignSeats(courseId, ids);
        toast(`${ids.length} Platz(e) zugewiesen`);
        document.getElementById('course-assign-form').style.display = 'none';
        await loadData();
      } catch(e) { toast(e.message, 'error'); }
    });
  };

  const openRegistrationModal = (regId) => {
    const reg = registrations.find(r => r.id === regId);
    if (!reg) return;
    const modal = document.createElement('div');
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <div class="modal__header">
          <h3>Registrierung bearbeiten</h3>
          <button class="modal__close" id="btn-close-reg-modal">✕</button>
        </div>
        <div class="modal__body">
          <div class="form-group">
            <label>Status</label>
            <select id="reg-status">
              <option value="angemeldet" ${reg.status === 'angemeldet' ? 'selected' : ''}>Angemeldet</option>
              <option value="platzzugewiesen" ${reg.status === 'platzzugewiesen' ? 'selected' : ''}>Platz zugewiesen</option>
              <option value="warteliste" ${reg.status === 'warteliste' ? 'selected' : ''}>Warteliste</option>
              <option value="abgelehnt" ${reg.status === 'abgelehnt' ? 'selected' : ''}>Abgelehnt</option>
              <option value="storniert" ${reg.status === 'storniert' ? 'selected' : ''}>Storniert</option>
            </select>
          </div>
          <div class="form-group">
            <label>Notizen</label>
            <textarea id="reg-notes" rows="3">${esc(reg.notes || '')}</textarea>
          </div>
          <div class="modal__footer">
            <button class="btn btn--outline" id="btn-cancel-reg-modal">Abbrechen</button>
            <button class="btn btn--primary" id="btn-save-reg-modal">Speichern</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    renderIcons(modal);

    document.getElementById('btn-close-reg-modal')?.addEventListener('click', () => {
      modal.remove();
    });
    document.getElementById('btn-cancel-reg-modal')?.addEventListener('click', () => {
      modal.remove();
    });

    document.getElementById('btn-save-reg-modal')?.addEventListener('click', async () => {
      const status = document.getElementById('reg-status').value;
      const notes = document.getElementById('reg-notes').value.trim();
      try {
        await api.updateRegistration(regId, { status, notes });
        toast('Registrierung aktualisiert');
        modal.remove();
        await loadData();
      } catch(e) { toast(e.message, 'error'); }
    });
  };

  await loadData();
}