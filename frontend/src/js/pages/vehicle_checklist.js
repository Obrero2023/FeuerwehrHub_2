import { api } from "../api.js";
import { renderShell, setShellInfo } from "../shell.js";
import { icon, renderIcons } from "../icons.js";
import { formatDate, esc } from "../utils.js";
import { toast } from "../toast.js";

let selectedVehicleId = null;
let selectedVehicleType = "hlf1";
let inspectionObjects = [];
let currentProtocol = null;

export async function rendervehiclechecklist() {
  console.log("Fahrzeugprüfung geladen");
  const [settings, user] = await Promise.all([api.getSettings(), api.me()]);
  setShellInfo(settings?.ff_name, user, settings?.modules);
  renderShell("fahrzeugpruefung");

  const hash = window.location.hash || "#/vehicle_checklist";
  const activeTab = hash.includes("hlf2-inspection")
    ? "hlf2"
    : hash.includes("mtf-inspection")
      ? "mtf"
      : hash.includes("geraete")
        ? "geraete"
        : hash.includes("auswertung")
          ? "auswertung"
          : "hlf1";

  if (activeTab === "hlf2") selectedVehicleType = "hlf2";
  else if (activeTab === "mtf") selectedVehicleType = "mtf";
  else if (activeTab === "hlf1") selectedVehicleType = "hlf1";

  const content = document.getElementById("page-content");

  content.innerHTML = `
        <div class="page-header">
            <div>
                <h2>Fahrzeugprüfung</h2>
                <p>Verwaltung von Fahrzeugprüfungen und Inspektionen</p>
            </div>
        </div>

        <div class="tab-bar" id="inspection-tabs">
            <button class="tab-btn${activeTab === "hlf1" ? " tab-btn--active" : ""}" data-tab="hlf1">${icon("truck", 14)} HLF-1</button>
            <button class="tab-btn${activeTab === "hlf2" ? " tab-btn--active" : ""}" data-tab="hlf2">${icon("truck", 14)} HLF-2</button>
            <button class="tab-btn${activeTab === "mtf" ? " tab-btn--active" : ""}" data-tab="mtf">${icon("truck", 14)} MTF</button>
            <button class="tab-btn${activeTab === "geraete" ? " tab-btn--active" : ""}" data-tab="geraete">${icon("package", 14)} Geräte Anlegen</button>
            <button class="tab-btn${activeTab === "auswertung" ? " tab-btn--active" : ""}" data-tab="auswertung">${icon("file-text", 14)} Auswertung</button>
        </div>

        <div id="tab-hlf1" class="tab-panel" style="display:${activeTab === "hlf1" ? "block" : "none"}">
            <div class="content-card">
                <div class="form-row" style="margin-bottom: 1rem;">
                    <label>Fahrzeug auswählen</label>
                    <select id="vehicle-select-hlf1" class="input" style="width: 100%; max-width: 400px;"></select>
                </div>
                <div id="inspection-objects-hlf1" class="inspection-checklist-wrap" style="display: none;">
                    <h3>Prüfungsobjekte</h3>
                    <div id="objects-list-hlf1" class="inspection-objects-list"></div>
                    <div class="form-actions" style="margin-top: 1rem;">
                        <button class="btn btn--primary" id="btn-submit-inspection-hlf1">${icon("save", 14)} Prüfung speichern</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-hlf2" class="tab-panel" style="display:${activeTab === "hlf2" ? "block" : "none"}">
            <div class="content-card">
                <div class="form-row" style="margin-bottom: 1rem;">
                    <label>Fahrzeug auswählen</label>
                    <select id="vehicle-select-hlf2" class="input" style="width: 100%; max-width: 400px;"></select>
                </div>
                <div id="inspection-objects-hlf2" class="inspection-checklist-wrap" style="display: none;">
                    <h3>Prüfungsobjekte</h3>
                    <div id="objects-list-hlf2" class="inspection-objects-list"></div>
                    <div class="form-actions" style="margin-top: 1rem;">
                        <button class="btn btn--primary" id="btn-submit-inspection-hlf2">${icon("save", 14)} Prüfung speichern</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-mtf" class="tab-panel" style="display:${activeTab === "mtf" ? "block" : "none"}">
            <div class="content-card">
                <div class="form-row" style="margin-bottom: 1rem;">
                    <label>Fahrzeug auswählen</label>
                    <select id="vehicle-select-mtf" class="input" style="width: 100%; max-width: 400px;"></select>
                </div>
                <div id="inspection-objects-mtf" class="inspection-checklist-wrap" style="display: none;">
                    <h3>Prüfungsobjekte</h3>
                    <div id="objects-list-mtf" class="inspection-objects-list"></div>
                    <div class="form-actions" style="margin-top: 1rem;">
                        <button class="btn btn--primary" id="btn-submit-inspection-mtf">${icon("save", 14)} Prüfung speichern</button>
                    </div>
                </div>
            </div>
        </div>

        <div id="tab-geraete" class="tab-panel" style="display:${activeTab === "geraete" ? "block" : "none"}">
            <div class="content-card">
                <div class="form-row" style="margin-bottom: 1rem;">
                    <label>Fahrzeug auswählen</label>
                    <select id="vehicle-select-geraete" class="input" style="width: 100%; max-width: 400px;"></select>
                </div>
                <div id="equipment-wrap" style="display: none;">
                    <div class="card__header" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 1rem;">
                        <span>Geräte / Beladung</span>
                        <button class="btn btn--primary btn--sm" id="btn-new-equipment">${icon("plus", 14)} Gerät hinzufügen</button>
                    </div>
                    <div id="equipment-list" class="data-table-wrap"><p class="wrap-loading">Lade Geräte...</p></div>
                </div>
            </div>
        </div>

        <div id="tab-auswertung" class="tab-panel" style="display:${activeTab === "auswertung" ? "block" : "none"}">
            <div class="content-card">
                <div class="form-row" style="margin-bottom: 1rem;">
                    <label>Fahrzeug auswählen</label>
                    <select id="vehicle-select-auswertung" class="input" style="width: 100%; max-width: 400px;"></select>
                </div>
                <div id="evaluation-wrap" style="display: none;">
                    <h3>Prüfprotokolle</h3>
                    <div id="protocols-list" class="data-table-wrap"><p class="wrap-loading">Lade Protokolle...</p></div>
                </div>
            </div>
        </div>
    `;

  // Tab-Handling
  const tabs = content.querySelectorAll(".tab-btn");
  const panels = content.querySelectorAll(".tab-panel");

  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("tab-btn--active"));
      panels.forEach((p) => (p.style.display = "none"));
      tab.classList.add("tab-btn--active");
      const tabId = tab.dataset.tab;
      document.getElementById(`tab-${tabId}`).style.display = "block";

      // Update selected type
      if (tabId === "hlf1") selectedVehicleType = "hlf1";
      else if (tabId === "hlf2") selectedVehicleType = "hlf2";
      else if (tabId === "mtf") selectedVehicleType = "mtf";

      // Load data for the tab
      if (tabId === "hlf1" || tabId === "hlf2" || tabId === "mtf") {
        loadVehiclesForType(tabId);
      } else if (tabId === "geraete") {
        loadVehiclesForEquipment();
      } else if (tabId === "auswertung") {
        loadVehiclesForEvaluation();
      }
    });
  });

  renderIcons(content);

  // Initial load based on active tab
  if (activeTab === "hlf1" || activeTab === "hlf2" || activeTab === "mtf") {
    loadVehiclesForType(activeTab);
  } else if (activeTab === "geraete") {
    loadVehiclesForEquipment();
  } else if (activeTab === "auswertung") {
    loadVehiclesForEvaluation();
  }

  // Setup event listeners for vehicle selectors
  setupVehicleSelector("hlf1");
  setupVehicleSelector("hlf2");
  setupVehicleSelector("mtf");
  setupVehicleSelector("geraete");
  setupVehicleSelector("auswertung");
}

async function loadVehiclesForType(type) {
  try {
    const vehicles = await api.getVehicles();
    const filtered = vehicles.filter((v) => v.vehicle_type === type);
    renderVehicleSelect(type, filtered);
  } catch (e) {
    toast("Fehler beim Laden der Fahrzeuge: " + e.message, "error");
  }
}

async function loadVehiclesForEquipment() {
  try {
    const vehicles = await api.getVehicles();
    renderVehicleSelect("geraete", vehicles);
  } catch (e) {
    toast("Fehler beim Laden der Fahrzeuge: " + e.message, "error");
  }
}

async function loadVehiclesForEvaluation() {
  try {
    const vehicles = await api.getVehicles();
    renderVehicleSelect("auswertung", vehicles);
  } catch (e) {
    toast("Fehler beim Laden der Fahrzeuge: " + e.message, "error");
  }
}

function renderVehicleSelect(tabPrefix, vehicles) {
  const selectId = `vehicle-select-${tabPrefix}`;
  const select = document.getElementById(selectId);
  if (!select) return;

  select.innerHTML = '<option value="">-- Fahrzeug auswählen --</option>';
  vehicles.forEach((v) => {
    const opt = document.createElement("option");
    opt.value = v.id;
    opt.textContent = `${v.name} (${v.license_plate || "kein Kennzeichen"})`;
    select.appendChild(opt);
  });

  // Restore previous selection if exists
  if (selectedVehicleId) {
    select.value = selectedVehicleId;
  }
}

function setupVehicleSelector(tabPrefix) {
  const select = document.getElementById(`vehicle-select-${tabPrefix}`);
  if (!select) return;

  select.addEventListener("change", async (e) => {
    selectedVehicleId = e.target.value;
    if (!selectedVehicleId) {
      hideInspectionObjects(tabPrefix);
      hideEquipment();
      hideEvaluation();
      return;
    }

    if (tabPrefix === "hlf1" || tabPrefix === "hlf2" || tabPrefix === "mtf") {
      await loadInspectionObjects(tabPrefix);
    } else if (tabPrefix === "geraete") {
      await loadEquipment();
    } else if (tabPrefix === "auswertung") {
      await loadEvaluation();
    }
  });
}

function hideInspectionObjects(tabPrefix) {
  const wrap = document.getElementById(`inspection-objects-${tabPrefix}`);
  if (wrap) wrap.style.display = "none";
}

function hideEquipment() {
  const wrap = document.getElementById("equipment-wrap");
  if (wrap) wrap.style.display = "none";
}

function hideEvaluation() {
  const wrap = document.getElementById("evaluation-wrap");
  if (wrap) wrap.style.display = "none";
}

async function loadInspectionObjects(type) {
  try {
    const objects = await api.listInspectionObjectsByType(type);
    inspectionObjects = objects;
    const listId = `objects-list-${type}`;
    const wrapId = `inspection-objects-${type}`;

    const list = document.getElementById(listId);
    const wrap = document.getElementById(wrapId);

    if (!list || !wrap) return;

    if (!objects.length) {
      list.innerHTML =
        '<p class="text-muted text-sm">Keine Prüfungsobjekte für diesen Fahrzeugtyp definiert.</p>';
      wrap.style.display = "block";
      return;
    }

    // Load existing protocol for this vehicle if any
    let existingItems = [];
    if (selectedVehicleId) {
      try {
        const protocols = await api.getInspectionProtocols(selectedVehicleId);
        if (protocols.length > 0) {
          const latest = protocols[0];
          const items = await api.getInspectionProtocolItems(
            selectedVehicleId,
            latest.id,
          );
          existingItems = items;
        }
      } catch (e) {
        console.warn("Could not load existing protocol:", e);
      }
    }

    list.innerHTML = objects
      .map((obj) => {
        const existing = existingItems.find(
          (i) => i.inspection_object_id === obj.id,
        );
        const status = existing?.status || "fehlt";
        const defectText = existing?.defect_text || "";

        return `
                <div class="inspection-object-item" data-object-id="${obj.id}">
                    <div class="inspection-object-header">
                        <span class="inspection-object-label">${esc(obj.label)}</span>
                        <span class="inspection-object-status inspection-object-status--${status}">${capitalize(status)}</span>
                    </div>
                    <div class="inspection-object-status-select">
                        <label><input type="radio" name="status-${obj.id}" value="geprüft" ${status === "geprüft" ? "checked" : ""}> Geprüft</label>
                        <label><input type="radio" name="status-${obj.id}" value="mangelhaft" ${status === "mangelhaft" ? "checked" : ""}> Mangelhaft</label>
                        <label><input type="radio" name="status-${obj.id}" value="fehlt" ${status === "fehlt" ? "checked" : ""}> Fehlt</label>
                    </div>
                    <div class="inspection-object-textarea">
                        <label>Freitext / Mangelbeschreibung</label>
                        <textarea class="input" name="defect-${obj.id}" rows="2" placeholder="Optional: Mangelbeschreibung oder Notizen">${esc(defectText)}</textarea>
                    </div>
                </div>
            `;
      })
      .join("");

    wrap.style.display = "block";

    // Setup submit button
    const btnId = `btn-submit-inspection-${type}`;
    const btn = document.getElementById(btnId);
    if (btn) {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);
      newBtn.addEventListener("click", () => submitInspection(type));
    }
  } catch (e) {
    toast("Fehler beim Laden der Prüfungsobjekte: " + e.message, "error");
  }
}

async function submitInspection(type) {
  if (!selectedVehicleId) {
    toast("Bitte wählen Sie zuerst ein Fahrzeug aus.", "error");
    return;
  }

  try {
    const items = [];
    inspectionObjects.forEach((obj) => {
      const statusRadio = document.querySelector(
        `input[name="status-${obj.id}"]:checked`,
      );
      const defectText = document
        .querySelector(`textarea[name="defect-${obj.id}"]`)
        .value.trim();

      if (!statusRadio) {
        throw new Error(`Status für ${obj.label} nicht ausgewählt`);
      }

      items.push({
        inspection_object_id: obj.id,
        status: statusRadio.value,
        defect_text: defectText || null,
      });
    });

    const result = await api.createInspectionProtocol(selectedVehicleId, {
      vehicle_id: selectedVehicleId,
      items: items,
    });

    toast(
      `Prüfung gespeichert (Protokoll: ${result.protocol.protocol_number})`,
      "success",
    );

    // Refresh the display
    await loadInspectionObjects(type);
  } catch (e) {
    toast("Fehler beim Speichern: " + e.message, "error");
  }
}

async function loadEquipment() {
  if (!selectedVehicleId) {
    hideEquipment();
    return;
  }

  try {
    const wrap = document.getElementById("equipment-wrap");
    const list = document.getElementById("equipment-list");
    if (!wrap || !list) return;

    list.innerHTML = '<p class="wrap-loading">Lade Geräte...</p>';
    wrap.style.display = "block";

    const items = await api.getEquipment(selectedVehicleId);

    if (!items.length) {
      list.innerHTML =
        '<p class="text-muted text-sm">Keine Geräte eingetragen.</p>';
      return;
    }

    const EQ_STATUS_LABELS = {
      ok: "In Ordnung",
      defekt: "Defekt",
      ausgebaut: "Ausgebaut",
    };

    list.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Name</th>
                        <th>Seriennummer</th>
                        <th>Hersteller</th>
                        <th>Baujahr</th>
                        <th>Nächste Prüfung</th>
                        <th>Status</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${items
                      .map(
                        (e) => `
                        <tr>
                            <td class="fw-semibold">${esc(e.name)}</td>
                            <td class="text-muted">${esc(e.serial_number || "–")}</td>
                            <td class="text-muted">${esc(e.manufacturer || "–")}</td>
                            <td class="text-muted">${e.year_built || "–"}</td>
                            <td class="text-muted">${e.next_inspection ? formatDate(e.next_inspection) : "–"}</td>
                            <td><span class="eq-status eq-status--${e.status}">${EQ_STATUS_LABELS[e.status] || e.status}</span></td>
                            <td>
                                <div class="btn-group">
                                    <button class="btn btn--outline btn--sm" data-action="edit-equip" data-id="${e.id}" title="Bearbeiten">${icon("edit", 12)}</button>
                                    <button class="btn btn--outline btn--sm btn--danger" data-action="del-equip" data-id="${e.id}" title="Löschen">${icon("trash-2", 12)}</button>
                                </div>
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;

    // Bind actions
    list.querySelectorAll('[data-action="edit-equip"]').forEach((btn) => {
      btn.addEventListener("click", () => openEquipmentModal(btn.dataset.id));
    });
    list.querySelectorAll('[data-action="del-equip"]').forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("Gerät wirklich löschen?")) return;
        try {
          await api.deleteEquipment(selectedVehicleId, btn.dataset.id);
          toast("Gerät gelöscht");
          loadEquipment();
        } catch (e) {
          toast(e.message, "error");
        }
      });
    });

    // Setup new equipment button
    const btnNew = document.getElementById("btn-new-equipment");
    if (btnNew) {
      const newBtn = btnNew.cloneNode(true);
      btnNew.parentNode.replaceChild(newBtn, btnNew);
      newBtn.addEventListener("click", () => openEquipmentModal(null));
    }
  } catch (e) {
    toast("Fehler beim Laden der Geräte: " + e.message, "error");
  }
}

function openEquipmentModal(equipId) {
  // Simple modal implementation
  const isEdit = !!equipId;
  const modalHtml = `
        <div class="modal-overlay" id="modal-equipment">
            <div class="modal modal--md">
                <div class="modal__header">
                    <h3>${isEdit ? "Gerät bearbeiten" : "Gerät hinzufügen"}</h3>
                    <button class="modal__close" id="btn-close-equip-modal">${icon("x", 14)}</button>
                </div>
                <div class="modal__body">
                    <form id="equip-form">
                        <input type="hidden" name="id" value="${equipId || ""}">
                        <div class="form-row">
                            <label>Name *</label>
                            <input type="text" name="name" class="input" required>
                        </div>
                        <div class="form-row">
                            <label>Seriennummer</label>
                            <input type="text" name="serial_number" class="input">
                        </div>
                        <div class="form-row">
                            <label>Hersteller</label>
                            <input type="text" name="manufacturer" class="input">
                        </div>
                        <div class="form-row">
                            <label>Baujahr</label>
                            <input type="number" name="year_built" class="input" min="1900" max="2099">
                        </div>
                        <div class="form-row">
                            <label>Status</label>
                            <select name="status" class="input">
                                <option value="ok">In Ordnung</option>
                                <option value="defekt">Defekt</option>
                                <option value="ausgebaut">Ausgebaut</option>
                            </select>
                        </div>
                        <div class="form-row">
                            <label>Letzte Prüfung</label>
                            <input type="date" name="last_inspection" class="input">
                        </div>
                        <div class="form-row">
                            <label>Nächste Prüfung</label>
                            <input type="date" name="next_inspection" class="input">
                        </div>
                        <div class="form-row">
                            <label>Intervall (Monate)</label>
                            <input type="number" name="interval_months" class="input" min="1">
                        </div>
                        <div class="form-row">
                            <label>Notizen</label>
                            <textarea name="notes" class="input" rows="3"></textarea>
                        </div>
                    </form>
                </div>
                <div class="modal__footer">
                    <button class="btn btn--primary" id="btn-submit-equip">${icon("save", 14)} Speichern</button>
                    <button class="btn btn--outline" id="btn-cancel-equip">${icon("x", 14)} Abbrechen</button>
                </div>
            </div>
        </div>
    `;

  // Remove existing modal
  const existing = document.getElementById("modal-equipment");
  if (existing) existing.remove();

  const div = document.createElement("div");
  div.innerHTML = modalHtml;
  document.body.appendChild(div.firstElementChild);
  renderIcons(document.getElementById("modal-equipment"));

  // Load data if editing
  if (isEdit) {
    loadEquipmentData(equipId);
  }

  // Bind modal events
  const modal = document.getElementById("modal-equipment");
  modal
    .querySelectorAll("#btn-close-equip-modal, #btn-cancel-equip")
    .forEach((btn) => {
      btn.addEventListener("click", () => modal.remove());
    });

  document
    .getElementById("btn-submit-equip")
    .addEventListener("click", async () => {
      const form = document.getElementById("equip-form");
      const formData = new FormData(form);
      const body = Object.fromEntries(formData);
      if (body.year_built === "") delete body.year_built;
      if (body.interval_months === "") delete body.interval_months;
      if (body.last_inspection === "") body.last_inspection = null;
      if (body.next_inspection === "") body.next_inspection = null;

      try {
        if (isEdit) {
          await api.updateEquipment(selectedVehicleId, equipId, body);
          toast("Gerät aktualisiert");
        } else {
          await api.createEquipment(selectedVehicleId, body);
          toast("Gerät hinzugefügt");
        }
        modal.remove();
        loadEquipment();
      } catch (e) {
        toast(e.message, "error");
      }
    });
}

async function loadEquipmentData(equipId) {
  try {
    const items = await api.getEquipment(selectedVehicleId);
    const item = items.find((e) => e.id === equipId);
    if (!item) return;

    const form = document.getElementById("equip-form");
    form.name.value = item.name;
    form.serial_number.value = item.serial_number || "";
    form.manufacturer.value = item.manufacturer || "";
    form.year_built.value = item.year_built || "";
    form.status.value = item.status;
    form.last_inspection.value = item.last_inspection || "";
    form.next_inspection.value = item.next_inspection || "";
    form.interval_months.value = item.interval_months || "";
    form.notes.value = item.notes || "";
  } catch (e) {
    console.warn("Could not load equipment data:", e);
  }
}

async function loadEvaluation() {
  if (!selectedVehicleId) {
    hideEvaluation();
    return;
  }

  try {
    const wrap = document.getElementById("evaluation-wrap");
    const list = document.getElementById("protocols-list");
    if (!wrap || !list) return;

    list.innerHTML = '<p class="wrap-loading">Lade Protokolle...</p>';
    wrap.style.display = "block";

    const data = await api.getInspectionEvaluation(selectedVehicleId);

    if (!data.protocols?.length) {
      list.innerHTML =
        '<p class="text-muted text-sm">Keine Prüfprotokolle vorhanden.</p>';
      return;
    }

    list.innerHTML = `
            <table class="data-table">
                <thead>
                    <tr>
                        <th>Protokoll-Nr.</th>
                        <th>Datum</th>
                        <th>Prüfer</th>
                        <th>OK</th>
                        <th>Mangelhaft</th>
                        <th>Fehlt</th>
                        <th></th>
                    </tr>
                </thead>
                <tbody>
                    ${data.protocols
                      .map(
                        (p) => `
                        <tr>
                            <td class="fw-semibold">${esc(p.protocol.protocol_number)}</td>
                            <td>${p.protocol.inspection_date ? formatDate(p.protocol.inspection_date) : "–"}</td>
                            <td>${esc(p.protocol.inspected_by_name || "–")}</td>
                            <td><span class="text-success">${p.ok_count}</span></td>
                            <td><span class="text-warning">${p.mangel_count}</span></td>
                            <td><span class="text-muted">${p.fehlt_count}</span></td>
                            <td>
                                <div class="btn-group">
                                    <button class="btn btn--outline btn--sm" data-action="view-protocol" data-id="${p.protocol.id}" title="Details">${icon("eye", 12)}</button>
                                    <button class="btn btn--outline btn--sm" data-action="download-protocol" data-id="${p.protocol.id}" title="PDF">${icon("download", 12)}</button>
                                </div>
                            </td>
                        </tr>
                    `,
                      )
                      .join("")}
                </tbody>
            </table>
        `;

    // Bind actions
    list.querySelectorAll('[data-action="view-protocol"]').forEach((btn) => {
      btn.addEventListener("click", () => viewProtocol(btn.dataset.id));
    });
    list
      .querySelectorAll('[data-action="download-protocol"]')
      .forEach((btn) => {
        btn.addEventListener("click", () => downloadProtocol(btn.dataset.id));
      });
  } catch (e) {
    toast("Fehler beim Laden der Auswertung: " + e.message, "error");
  }
}

async function viewProtocol(protocolId) {
  try {
    const detail = await api.getInspectionProtocol(
      selectedVehicleId,
      protocolId,
    );
    // Show in modal or redirect to detail view
    toast(
      "Protokoll " + detail.protocol.protocol_number + " geladen",
      "success",
    );
  } catch (e) {
    toast("Fehler: " + e.message, "error");
  }
}

function downloadProtocol(protocolId) {
  // Use direct download via fetch with blob
  fetch(
    `/api/vehicles/${selectedVehicleId}/inspection-protocols/${protocolId}/pdf`,
    {
      credentials: "include",
    },
  )
    .then((res) => {
      if (!res.ok) throw new Error("Download fehlgeschlagen");
      return res.blob();
    })
    .then((blob) => {
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `Inspektionsprotokoll_${protocolId}.pdf`;
      a.click();
      window.URL.revokeObjectURL(url);
    })
    .catch((e) => toast("Download fehlgeschlagen: " + e.message, "error"));
}

function capitalize(text) {
  if (!text) return "";
  return text.charAt(0).toUpperCase() + text.slice(1);
}
