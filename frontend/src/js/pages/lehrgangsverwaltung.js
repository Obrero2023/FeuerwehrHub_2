import { api } from '../api.js';
import { toast } from '../toast.js';
import { renderShell, setShellInfo } from '../shell.js';
import { esc, formatDate } from '../utils.js';
import { icon, renderIcons } from '../icons.js';

export async function renderLehrgaenge() {
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell('lehrgangsverwaltung');

  const canCreate = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');
  const canManage = user?.role === 'admin' || user?.role === 'superuser'
    || (user?.permissions || []).includes('lehrgangsverwaltung.verwalten');

  const content = document.getElementById('page-content');
  content.innerHTML = `
    <div class="page-header">
      <div>
        <h2>Lehrgänge</h2>
        <p>Übersicht über verfügbare Lehrgänge</p>
      </div>
      ${canCreate ? `<button class="btn btn--primary" id="btn-new-course">+ Neuen Lehrgang erstellen</button>` : ''}
    </div>
    <div id="course-create-form" style="display:none"></div>
    <div id="course-list-wrap"></div>
  `;
  renderIcons(content);

  let courses = [];
  let loading = true;

  const loadCourses = async () => {
    try {
      courses = await api.getCourses().catch(() => []);
    } catch(e) { toast(e.message, 'error'); }
    loading = false;
    renderCourses();
  };

  const renderCourses = () => {
    const grid = document.getElementById('course-list-wrap');
    if (!grid) return;
    if (loading) { grid.innerHTML = '<div class="empty-state">Lade Lehrgänge...</div>'; return; }
    if (!courses.length) { grid.innerHTML = '<div class="empty-state">Keine Lehrgänge vorhanden.</div>'; return; }

    const statusColors = {
      'entwurf': '#6c757d',        // grau
      'veroeffentlicht': '#48bb78', // grün
      'abgeschlossen': '#2563eb',   // blau
      'archiviert': '#9ca3af',     // hellgrau
    };

    grid.innerHTML = `<table class="data-table">
      <thead><tr>
        <th>Titel</th><th>Ort</th><th>Start</th><th>Ende</th><th>Teilnehmer</th><th style="color:var(--text-color)">Status</th>
        ${canManage || canCreate ? '<th>Aktionen</th>' : ''}
      </tr></thead>
      <tbody>
        ${courses.map(c => {
          const statusColor = statusColors[c.status] || '#6c757d';
          return `
          <tr data-id="${c.id}" style="--status-color: ${statusColor}">
            <td>${esc(c.title)}</td>
            <td>${esc(c.location || '—')}</td>
            <td>${c.start_date ? formatDate(c.start_date) : '—'}</td>
            <td>${c.end_date ? formatDate(c.end_date) : '—'}</td>
            <td>${c.max_participants ? `${c.active_assignments || 0}/${c.max_participants}` : `${c.active_assignments || 0}`}</td>
            <td style="color:var(--status-color)">${c.status}</td>
            ${canManage || canCreate ? `<td>
              ${canManage ? `<button class="btn btn--outline btn--sm btn-detail-course" data-id="${c.id}">Details</button>` : ''}
              ${canManage ? `<button class="btn btn--outline btn--sm btn-edit-course" data-id="${c.id}">Bearbeiten</button>` : ''}
              ${canManage ? `<button class="btn btn--danger btn--sm btn-delete-course" data-id="${c.id}">Löschen</button>` : ''}
            </td>` : ''}
          </tr>
          `;}).join('')}
      </tbody>
    </table>`;
    renderIcons(grid);

    // Detail button
    grid.querySelectorAll('.btn-detail-course').forEach(btn => {
      btn.addEventListener('click', () => window.location.hash = `#/lehrgang/${btn.dataset.id}`);
    });

    // Edit button
    grid.querySelectorAll('.btn-edit-course').forEach(btn => {
      btn.addEventListener('click', () => openEditForm(btn.dataset.id));
    });

    // Delete button
    grid.querySelectorAll('.btn-delete-course').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Lehrgang wirklich löschen?')) return;
        try {
          await api.deleteCourse(btn.dataset.id);
          toast('Lehrgang gelöscht');
          await loadCourses();
        } catch(e) { toast(e.message, 'error'); }
      });
    });
  };

  const openCreateForm = () => {
    const formEl = document.getElementById('course-create-form');
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div class="card">
        <div class="card__header">Neuen Lehrgang erstellen</div>
        <div class="card__body">
          <div class="form-group">
            <label>Titel <span class="required">*</span></label>
            <input type="text" id="lc-title" maxlength="300" />
          </div>
          <div class="form-group">
            <label>Beschreibung</label>
            <textarea id="lc-description" rows="3" maxlength="5000" placeholder="Inhalt des Lehrgangs"></textarea>
          </div>
          <div class="form-group">
            <label>Ort</label>
            <input type="text" id="lc-location" maxlength="200" placeholder="Ort der Veranstaltung" />
          </div>
          <div class="form-group">
            <label>Startdatum</label>
            <input type="date" id="lc-start-date" />
          </div>
          <div class="form-group">
            <label>Enddatum</label>
            <input type="date" id="lc-end-date" />
          </div>
          <div class="form-group">
            <label>Anmeldeschluss</label>
            <input type="date" id="lc-deadline" />
          </div>
          <div class="form-group">
            <label>Max. Teilnehmer</label>
            <input type="number" id="lc-max-participants" min="1" />
          </div>
          <div class="form-group">
            <label>Voraussetzungen (je Zeile ein Eintrag)</label>
            <textarea id="lc-prerequisites" rows="3" placeholder="z.B. Grundlehrgang abgeschlossen&#10;Mindestalter 18 Jahre"></textarea>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="lc-status">
              <option value="entwurf">Entwurf</option>
              <option value="veroeffentlicht">Veröffentlicht</option>
              <option value="abgeschlossen">Abgeschlossen</option>
              <option value="archiviert">Archiviert</option>
            </select>
          </div>
          <div class="form-group" style="font-size:0.9em;color:var(--text-muted);margin-top:12px">
            <div>Erstellt von: <strong>${user?.username || 'Sie'}</strong></div>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-course">Speichern</button>
            <button class="btn btn--outline" id="btn-cancel-course">Abbrechen</button>
          </div>
        </div>
      </div>
    `;
    bindFormEvents('create');
  };

  const openEditForm = (id) => {
    const course = courses.find(c => c.id === id);
    if (!course) return;
    const formEl = document.getElementById('course-create-form');
    formEl.style.display = 'block';
    formEl.innerHTML = `
      <div class="card">
        <div class="card__header">Lehrgang bearbeiten</div>
        <div class="card__body">
          <div class="form-group">
            <label>Titel <span class="required">*</span></label>
            <input type="text" id="lc-title" maxlength="300" value="${esc(course.title)}" />
          </div>
          <div class="form-group">
            <label>Beschreibung</label>
            <textarea id="lc-description" rows="3" maxlength="5000">${esc(course.description || '')}</textarea>
          </div>
          <div class="form-group">
            <label>Ort</label>
            <input type="text" id="lc-location" maxlength="200" value="${esc(course.location || '')}" />
          </div>
          <div class="form-group">
            <label>Startdatum</label>
            <input type="date" id="lc-start-date" value="${course.start_date ? course.start_date.toString() : ''}" />
          </div>
          <div class="form-group">
            <label>Enddatum</label>
            <input type="date" id="lc-end-date" value="${course.end_date ? course.end_date.toString() : ''}" />
          </div>
          <div class="form-group">
            <label>Anmeldeschluss</label>
            <input type="date" id="lc-deadline" value="${course.registration_deadline ? course.registration_deadline.toString() : ''}" />
          </div>
          <div class="form-group">
            <label>Max. Teilnehmer</label>
            <input type="number" id="lc-max-participants" min="1" value="${course.max_participants || ''}" />
          </div>
          <div class="form-group">
            <label>Voraussetzungen (je Zeile ein Eintrag)</label>
            <textarea id="lc-prerequisites" rows="3">${(course.prerequisites || []).join('\n')}</textarea>
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="lc-status">
              <option value="entwurf" ${course.status === 'entwurf' ? 'selected' : ''}>Entwurf</option>
              <option value="veroeffentlicht" ${course.status === 'veroeffentlicht' ? 'selected' : ''}>Veröffentlicht</option>
              <option value="abgeschlossen" ${course.status === 'abgeschlossen' ? 'selected' : ''}>Abgeschlossen</option>
              <option value="archiviert" ${course.status === 'archiviert' ? 'selected' : ''}>Archiviert</option>
            </select>
          </div>
          <div class="form-group" style="font-size:0.9em;color:var(--text-muted);margin-top:12px">
            <div>Erstellt von: <strong>${esc(course.created_by_name || course.created_by?.toString() || '—')}</strong></div>
          </div>
          <div class="btn-group mt-md">
            <button class="btn btn--primary" id="btn-save-course">Aktualisieren</button>
            <button class="btn btn--outline" id="btn-cancel-course">Abbrechen</button>
          </div>
        </div>
      </div>
    `;
    bindFormEvents('edit', id);
  };

  const bindFormEvents = (mode, id) => {
    document.getElementById('btn-cancel-course')?.addEventListener('click', () => {
      document.getElementById('course-create-form').style.display = 'none';
    });

    document.getElementById('btn-save-course')?.addEventListener('click', async () => {
      const title = document.getElementById('lc-title').value.trim();
      const description = document.getElementById('lc-description').value.trim();
      const location = document.getElementById('lc-location').value.trim();
      const startDate = document.getElementById('lc-start-date').value;
      const endDate = document.getElementById('lc-end-date').value;
      const deadline = document.getElementById('lc-deadline').value;
      const maxParticipants = document.getElementById('lc-max-participants').value;
      const prerequisites = document.getElementById('lc-prerequisites').value
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0);
      const status = document.getElementById('lc-status').value;

      if (!title) {
        toast('Titel erforderlich', 'error');
        return;
      }

      const courseData = {
        title,
        description: description || null,
        location: location || null,
        start_date: startDate ? new Date(startDate) : null,
        end_date: endDate ? new Date(endDate) : null,
        registration_deadline: deadline ? new Date(deadline) : null,
        max_participants: maxParticipants ? parseInt(maxParticipants, 10) : null,
        prerequisites,
        status,
      };

      try {
        if (mode === 'create') {
          await api.createCourse(courseData);
          toast('Lehrgang erstellt');
        } else {
          await api.updateCourse(id, courseData);
          toast('Lehrgang aktualisiert');
        }
        document.getElementById('course-create-form').style.display = 'none';
        await loadCourses();
      } catch(e) { toast(e.message, 'error'); }
    });
  };

  // Event listeners
  document.getElementById('btn-new-course')?.addEventListener('click', openCreateForm);

  await loadCourses();
}