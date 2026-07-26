/* ============================================================================
   AGRICULTURAL INPUT SUBSIDY DISTRIBUTION REGISTER
   ----------------------------------------------------------------------------
   Pure HTML/CSS/JS build. There is no backend process, so this file plays the
   role Task 2 and Task 3 ask a server to play: it is the ONLY place a
   validation rule or a derived figure is calculated. The UI layer (render.js
   logic further down) never computes anything itself — it only asks this
   layer for numbers and displays what comes back. That is what the brief
   means by "a figure computed once, so the officer can be held to it": here,
   "once" means "in one function", not "on one machine".

   Persistence: the starting 40 rows load from data.json every time (this is
   the register's system of record for the assessment). Any record created or
   edited in the browser is layered on top in localStorage, so a reload keeps
   your changes without ever mutating data.json. A "Reset to sample data"
   action is provided to clear that overlay.
============================================================================ */

const STORAGE_KEY = "subsidy_register_overlay_v1";
const NETWORK_DELAY_MS = 260; // simulated latency so loading states are real, not decorative

const INPUT_TYPES = [
  "Seed - Paddy (HYV)",
  "Seed - Cotton (Bt)",
  "Seed - Groundnut",
  "Seed - Redgram",
  "Fertiliser - Urea",
  "Fertiliser - DAP",
  "Fertiliser - NPK 20:20:0",
  "Fertiliser - MOP",
];

/* ----------------------------------------------------------------------------
   ERROR SHAPE
   Every endpoint below returns one of these two shapes, and nothing else:
     ok:   { ok: true,  data: <payload> }
     fail: { ok: false, error: { field: string|null, message: string, code: string } }
   The UI checks `.ok` and never has to guess what a failure looks like.
---------------------------------------------------------------------------- */
function fail(field, message, code = "VALIDATION_ERROR") {
  return { ok: false, error: { field, message, code } };
}
function ok(data) {
  return { ok: true, data };
}

/* ----------------------------------------------------------------------------
   IN-MEMORY STORE
---------------------------------------------------------------------------- */
const Store = {
  baseRecords: [],   // as loaded from data.json, never mutated
  overlay: {},        // record_id -> record, edits/creates layered on top
  loaded: false,
};

function loadOverlay() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    Store.overlay = raw ? JSON.parse(raw) : {};
  } catch (e) {
    Store.overlay = {};
  }
}
function saveOverlay() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(Store.overlay));
}

function allRecordsRaw() {
  // base records with overlay edits applied, plus any overlay-only new records
  const byId = new Map();
  for (const r of Store.baseRecords) byId.set(r.record_id, { ...r });
  for (const id of Object.keys(Store.overlay)) {
    if (Store.overlay[id] === null) {
      byId.delete(id); // tombstone (not used by UI yet, kept for completeness)
    } else {
      byId.set(id, { ...Store.overlay[id] });
    }
  }
  return Array.from(byId.values());
}

function delay(ms = NETWORK_DELAY_MS) {
  return new Promise((res) => setTimeout(res, ms));
}

/* ----------------------------------------------------------------------------
   TASK 1 — load the sample dataset
---------------------------------------------------------------------------- */
async function initData() {
  loadOverlay();
  const res = await fetch("data.json");
  if (!res.ok) throw new Error("Could not load data.json");
  Store.baseRecords = await res.json();
  Store.loaded = true;
}

/* ----------------------------------------------------------------------------
   TASK 2 — validation (server-side rule: the only place it genuinely holds)
---------------------------------------------------------------------------- */
function validateRecord(input, { isUpdate = false } = {}) {
  const required = ["farmer_id", "farmer_name", "village", "input_type", "entitlement_qty"];
  for (const field of required) {
    const v = input[field];
    if (v === undefined || v === null || v === "") {
      return fail(field, `${fieldLabel(field)} is required.`);
    }
  }

  if (!/^FARM-\d{3,6}$/.test(String(input.farmer_id).trim())) {
    return fail("farmer_id", "Farmer ID must look like FARM-1234.");
  }

  if (String(input.farmer_name).trim().length < 2) {
    return fail("farmer_name", "Farmer name is too short.");
  }

  if (!INPUT_TYPES.includes(input.input_type)) {
    return fail("input_type", "Choose a valid input type from the list.");
  }

  const ent = Number(input.entitlement_qty);
  if (!Number.isFinite(ent) || ent < 0) {
    return fail("entitlement_qty", "Entitlement quantity must be a number of 0 or more.");
  }

  const issuedRaw = input.issued_qty === undefined || input.issued_qty === "" ? 0 : input.issued_qty;
  const issued = Number(issuedRaw);
  if (!Number.isFinite(issued) || issued < 0) {
    return fail("issued_qty", "Issued quantity must be a number of 0 or more.");
  }

  if (issued > ent) {
    return fail("issued_qty", "Issued quantity cannot exceed the entitlement — this record would draw the entitlement twice.");
  }

  if (input.issue_date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.issue_date)) {
      return fail("issue_date", "Issue date must be in YYYY-MM-DD form.");
    }
  }

  if (!isUpdate) {
    if (!input.record_id || !/^REG-\d{4}-\d{4,6}$/.test(input.record_id)) {
      return fail("record_id", "Record ID must look like REG-2026-0001.");
    }
    const existing = allRecordsRaw().find((r) => r.record_id === input.record_id);
    if (existing) {
      return fail("record_id", "A record with this Record ID already exists.");
    }
  }

  return ok(true);
}

function fieldLabel(field) {
  return {
    record_id: "Record ID",
    farmer_id: "Farmer ID",
    farmer_name: "Farmer name",
    village: "Village",
    input_type: "Input type",
    entitlement_qty: "Entitlement quantity",
    issued_qty: "Issued quantity",
    issue_date: "Issue date",
  }[field] || field;
}

/* ----------------------------------------------------------------------------
   TASK 3 — derived figures, computed only here
---------------------------------------------------------------------------- */
function computeDerived(record) {
  const entitlement = Number(record.entitlement_qty) || 0;
  const issued = Number(record.issued_qty) || 0;
  const balance = entitlement - issued;

  let status;
  if (record.issued_qty === null || record.issued_qty === undefined) status = "unrecorded";
  else if (issued === 0) status = "not_collected";
  else if (balance <= 0) status = "fully_issued";
  else status = "partially_issued";

  let daysWaiting = null;
  if (record.issue_date && status !== "fully_issued") {
    const issueDate = new Date(record.issue_date + "T00:00:00");
    const today = new Date("2026-07-26T00:00:00"); // fixed "today" so the register is reproducible
    if (!isNaN(issueDate.getTime())) {
      daysWaiting = Math.max(0, Math.round((today - issueDate) / 86400000));
    }
  }

  return { ...record, balance, status, days_waiting: daysWaiting };
}

function enrichAll(records) {
  return records.map(computeDerived);
}

function computeSummary(records) {
  const enriched = enrichAll(records);
  const totalEntitlement = enriched.reduce((s, r) => s + (Number(r.entitlement_qty) || 0), 0);
  const totalIssued = enriched.reduce((s, r) => s + (Number(r.issued_qty) || 0), 0);
  const totalBalance = totalEntitlement - totalIssued;
  const fullyIssuedCount = enriched.filter((r) => r.status === "fully_issued").length;
  const notCollectedCount = enriched.filter((r) => r.status === "not_collected").length;
  const partialCount = enriched.filter((r) => r.status === "partially_issued").length;
  const unrecordedCount = enriched.filter((r) => r.status === "unrecorded").length;
  return {
    count: enriched.length,
    totalEntitlement,
    totalIssued,
    totalBalance,
    fullyIssuedCount,
    notCollectedCount,
    partialCount,
    unrecordedCount,
  };
}

/* ----------------------------------------------------------------------------
   TASK 2 — API surface: list / create / update
   All three are async and go through `delay()` to behave like real endpoints.
---------------------------------------------------------------------------- */
async function apiListRecords({ q = "", village = "", inputType = "", status = "" } = {}) {
  await delay();
  if (!Store.loaded) return fail(null, "Register has not finished loading.", "NOT_READY");

  let records = enrichAll(allRecordsRaw());

  if (village) records = records.filter((r) => r.village === village);
  if (inputType) records = records.filter((r) => r.input_type === inputType);
  if (status) records = records.filter((r) => r.status === status);

  if (q.trim()) {
    const needle = q.trim().toLowerCase();
    records = records.filter((r) => {
      return (
        String(r.farmer_name || "").toLowerCase().includes(needle) ||
        String(r.farmer_id || "").toLowerCase().includes(needle) ||
        String(r.record_id || "").toLowerCase().includes(needle) ||
        String(r.village || "").toLowerCase().includes(needle)
      );
    });
  }

  records.sort((a, b) => a.record_id.localeCompare(b.record_id));

  return ok({ records, summary: computeSummary(allRecordsRaw()) });
}

async function apiCreateRecord(input) {
  await delay();
  const v = validateRecord(input, { isUpdate: false });
  if (!v.ok) return v;

  const record = {
    record_id: input.record_id.trim(),
    farmer_id: input.farmer_id.trim(),
    farmer_name: input.farmer_name.trim(),
    village: input.village.trim(),
    input_type: input.input_type,
    entitlement_qty: Number(input.entitlement_qty),
    issued_qty: input.issued_qty === "" || input.issued_qty === undefined ? 0 : Number(input.issued_qty),
    issue_date: input.issue_date || null,
  };
  record.balance = record.entitlement_qty - record.issued_qty;

  Store.overlay[record.record_id] = record;
  saveOverlay();
  return ok(computeDerived(record));
}

async function apiUpdateRecord(recordId, input) {
  await delay();
  const existing = allRecordsRaw().find((r) => r.record_id === recordId);
  if (!existing) return fail("record_id", "Record not found.", "NOT_FOUND");

  const merged = { ...existing, ...input, record_id: recordId };
  const v = validateRecord(merged, { isUpdate: true });
  if (!v.ok) return v;

  merged.entitlement_qty = Number(merged.entitlement_qty);
  merged.issued_qty = merged.issued_qty === "" || merged.issued_qty === undefined ? 0 : Number(merged.issued_qty);
  merged.balance = merged.entitlement_qty - merged.issued_qty;

  Store.overlay[recordId] = merged;
  saveOverlay();
  return ok(computeDerived(merged));
}

function apiResetOverlay() {
  Store.overlay = {};
  saveOverlay();
}

/* Exposed to render.js */
window.SubsidyAPI = {
  initData,
  apiListRecords,
  apiCreateRecord,
  apiUpdateRecord,
  apiResetOverlay,
  INPUT_TYPES,
};