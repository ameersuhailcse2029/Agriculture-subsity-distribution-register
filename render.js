/* ============================================================================
   UI LAYER — reads from window.SubsidyAPI only. Never computes a derived
   figure itself (Task 3): it displays whatever the API layer returns.
============================================================================ */

const els = {
  tableBody: document.getElementById("table-body"),
  tableWrap: document.getElementById("table-wrap"),
  resultCount: document.getElementById("result-count"),
  searchInput: document.getElementById("search-input"),
  villageFilter: document.getElementById("village-filter"),
  inputFilter: document.getElementById("input-filter"),
  statusFilter: document.getElementById("status-filter"),
  clearFilters: document.getElementById("clear-filters"),
  loadingState: document.getElementById("loading-state"),
  emptyState: document.getElementById("empty-state"),
  errorState: document.getElementById("error-state"),
  errorMessage: document.getElementById("error-message"),
  retryBtn: document.getElementById("retry-btn"),
  summaryEntitlement: document.getElementById("summary-entitlement"),
  summaryIssued: document.getElementById("summary-issued"),
  summaryBalance: document.getElementById("summary-balance"),
  summaryRecords: document.getElementById("summary-records"),
  summaryNotCollected: document.getElementById("summary-not-collected"),
  newEntryBtn: document.getElementById("new-entry-btn"),
  resetSampleBtn: document.getElementById("reset-sample-btn"),
  modalBackdrop: document.getElementById("modal-backdrop"),
  modalTitle: document.getElementById("modal-title"),
  form: document.getElementById("record-form"),
  formError: document.getElementById("form-error"),
  cancelFormBtn: document.getElementById("cancel-form-btn"),
  inputTypeSelect: document.getElementById("f-input-type"),
};

const STATUS_META = {
  fully_issued: { label: "Fully issued", cls: "stamp--green" },
  partially_issued: { label: "Partial", cls: "stamp--amber" },
  not_collected: { label: "Not collected", cls: "stamp--red" },
  unrecorded: { label: "Unrecorded", cls: "stamp--gray" },
};

let editingRecordId = null; // null = create mode

/* ---------------------------------------------------------------- init ---- */
async function boot() {
  populateInputTypeOptions();
  wireEvents();

  await window.SubsidyAPI.initData();

  await refresh();
}

function populateInputTypeOptions() {
  for (const type of window.SubsidyAPI.INPUT_TYPES) {
    const opt1 = document.createElement("option");
    opt1.value = type;
    opt1.textContent = type;
    els.inputFilter.appendChild(opt1);

    const opt2 = document.createElement("option");
    opt2.value = type;
    opt2.textContent = type;
    els.inputTypeSelect.appendChild(opt2);
  }
}

function wireEvents() {
  els.searchInput.addEventListener("input", debounce(refresh, 120));
  els.villageFilter.addEventListener("change", refresh);
  els.inputFilter.addEventListener("change", refresh);
  els.statusFilter.addEventListener("change", refresh);
  els.clearFilters.addEventListener("click", () => {
    els.searchInput.value = "";
    els.villageFilter.value = "";
    els.inputFilter.value = "";
    els.statusFilter.value = "";
    refresh();
  });
  els.retryBtn.addEventListener("click", refresh);
  els.newEntryBtn.addEventListener("click", () => openModal("create"));
  els.cancelFormBtn.addEventListener("click", closeModal);
  els.modalBackdrop.addEventListener("click", (e) => {
    if (e.target === els.modalBackdrop) closeModal();
  });
  els.form.addEventListener("submit", handleSubmit);
  els.resetSampleBtn.addEventListener("click", async () => {
    if (!confirm("Discard every entry you've added or edited in this browser and return to the sample register?")) return;
    window.SubsidyAPI.apiResetOverlay();
    await refresh();
  });
}

function debounce(fn, wait) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

/* ------------------------------------------------------------- refresh ---- */
async function refresh() {
  setState("loading");
  try {
    const filters = {
      q: els.searchInput.value,
      village: els.villageFilter.value,
      inputType: els.inputFilter.value,
      status: els.statusFilter.value,
    };
    const res = await window.SubsidyAPI.apiListRecords(filters);
    if (!res.ok) {
      setState("error", res.error.message);
      return;
    }
    renderVillageOptionsOnce(res.data.records);
    renderSummary(res.data.summary);
    renderTable(res.data.records);
    if (res.data.records.length === 0) {
      setState("empty");
    } else {
      setState("ready");
    }
  } catch (err) {
    setState("error", "The register could not be reached. Check your connection and try again.");
  }
}

let villageOptionsBuilt = false;
function renderVillageOptionsOnce(records) {
  if (villageOptionsBuilt) return;
  const villages = Array.from(new Set(records.map((r) => r.village).filter(Boolean))).sort();
  for (const v of villages) {
    const opt = document.createElement("option");
    opt.value = v;
    opt.textContent = v;
    els.villageFilter.appendChild(opt);
  }
  villageOptionsBuilt = true;
}

function setState(state, message) {
  els.loadingState.hidden = state !== "loading";
  els.emptyState.hidden = state !== "empty";
  els.errorState.hidden = state !== "error";
  els.tableWrap.hidden = state !== "ready";
  if (state === "error") els.errorMessage.textContent = message || "Something went wrong.";
}

/* ------------------------------------------------------------- summary ---- */
function renderSummary(summary) {
  els.summaryEntitlement.textContent = summary.totalEntitlement.toLocaleString();
  els.summaryIssued.textContent = summary.totalIssued.toLocaleString();
  els.summaryBalance.textContent = summary.totalBalance.toLocaleString();
  els.summaryRecords.textContent = summary.count.toLocaleString();
  els.summaryNotCollected.textContent = summary.notCollectedCount.toLocaleString();
}

/* --------------------------------------------------------------- table ---- */
function renderTable(records) {
  els.resultCount.textContent = `${records.length} record${records.length === 1 ? "" : "s"} shown`;
  els.tableBody.innerHTML = "";
  const frag = document.createDocumentFragment();

  for (const r of records) {
    const tr = document.createElement("tr");
    if (r.status === "unrecorded") tr.classList.add("row--flagged");

    tr.innerHTML = `
      <td class="mono">${escapeHtml(r.record_id)}</td>
      <td>
        <div class="farmer-name">${escapeHtml(r.farmer_name)}</div>
        <div class="farmer-id mono">${escapeHtml(r.farmer_id)}</div>
      </td>
      <td>${escapeHtml(r.village)}</td>
      <td>${escapeHtml(r.input_type)}</td>
      <td class="mono num">${fmtQty(r.entitlement_qty)}</td>
      <td class="mono num">${fmtQty(r.issued_qty)}</td>
      <td class="mono num ${r.balance === 0 ? "num--zero" : ""}">${fmtQty(r.balance)}</td>
      <td>${statusStamp(r.status)}</td>
      <td class="mono num">${r.days_waiting === null ? "—" : r.days_waiting}</td>
      <td><button class="btn btn--ghost btn--small" data-edit="${escapeAttr(r.record_id)}">Edit</button></td>
    `;
    frag.appendChild(tr);
  }
  els.tableBody.appendChild(frag);

  els.tableBody.querySelectorAll("[data-edit]").forEach((btn) => {
    btn.addEventListener("click", () => openModal("edit", btn.getAttribute("data-edit")));
  });
}

function fmtQty(v) {
  if (v === null || v === undefined || Number.isNaN(v)) return "—";
  return `${v} kg`;
}

function statusStamp(status) {
  const meta = STATUS_META[status] || { label: status, cls: "stamp--gray" };
  return `<span class="stamp ${meta.cls}">${meta.label}</span>`;
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}

/* ------------------------------------------------------------ modal/form -- */
async function openModal(mode, recordId) {
  els.form.reset();
  els.formError.hidden = true;
  clearFieldErrors();

  if (mode === "create") {
    editingRecordId = null;
    els.modalTitle.textContent = "Record a new issue";
    document.getElementById("f-record-id").disabled = false;
    document.getElementById("f-record-id-row").hidden = false;
  } else {
    editingRecordId = recordId;
    els.modalTitle.textContent = `Edit ${recordId}`;
    document.getElementById("f-record-id-row").hidden = true;

    const res = await window.SubsidyAPI.apiListRecords({ q: recordId });
    const rec = res.ok ? res.data.records.find((r) => r.record_id === recordId) : null;
    if (rec) {
      document.getElementById("f-farmer-id").value = rec.farmer_id || "";
      document.getElementById("f-farmer-name").value = rec.farmer_name || "";
      document.getElementById("f-village").value = rec.village || "";
      document.getElementById("f-input-type").value = rec.input_type || "";
      document.getElementById("f-entitlement").value = rec.entitlement_qty ?? "";
      document.getElementById("f-issued").value = rec.issued_qty ?? "";
      document.getElementById("f-date").value = rec.issue_date || "";
    }
  }

  els.modalBackdrop.hidden = false;
  document.getElementById("f-farmer-id").focus();
}

function closeModal() {
  els.modalBackdrop.hidden = true;
  editingRecordId = null;
}

function clearFieldErrors() {
  document.querySelectorAll(".field-error").forEach((el) => (el.textContent = ""));
  document.querySelectorAll(".field-invalid").forEach((el) => el.classList.remove("field-invalid"));
}

async function handleSubmit(e) {
  e.preventDefault();
  clearFieldErrors();
  els.formError.hidden = true;

  const input = {
    record_id: document.getElementById("f-record-id").value.trim(),
    farmer_id: document.getElementById("f-farmer-id").value.trim(),
    farmer_name: document.getElementById("f-farmer-name").value.trim(),
    village: document.getElementById("f-village").value.trim(),
    input_type: document.getElementById("f-input-type").value,
    entitlement_qty: document.getElementById("f-entitlement").value,
    issued_qty: document.getElementById("f-issued").value,
    issue_date: document.getElementById("f-date").value,
  };

  const submitBtn = els.form.querySelector('button[type="submit"]');
  submitBtn.disabled = true;
  submitBtn.textContent = "Saving…";

  let res;
  try {
    if (editingRecordId) {
      res = await window.SubsidyAPI.apiUpdateRecord(editingRecordId, input);
    } else {
      res = await window.SubsidyAPI.apiCreateRecord(input);
    }
  } finally {
    submitBtn.disabled = false;
    submitBtn.textContent = "Save entry";
  }

  if (!res.ok) {
    els.formError.hidden = false;
    els.formError.textContent = res.error.message;
    if (res.error.field) {
      const FIELD_TO_DOM_ID = {
        record_id: "f-record-id",
        farmer_id: "f-farmer-id",
        farmer_name: "f-farmer-name",
        village: "f-village",
        input_type: "f-input-type",
        entitlement_qty: "f-entitlement",
        issued_qty: "f-issued",
        issue_date: "f-date",
      };
      const fieldEl = document.getElementById(FIELD_TO_DOM_ID[res.error.field]);
      if (fieldEl) {
        fieldEl.classList.add("field-invalid");
        fieldEl.focus();
      }
    }
    return;
  }

  closeModal();
  await refresh();
}

boot();