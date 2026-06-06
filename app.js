const KEY = "beer_counter_v13";

/** Default reference period (minutes): wait this long between beers after the starter allowance. */
const DEFAULT_REFERENCE_PERIOD_MINUTES = 90;

/** Picker range (minutes). Native `<select>` uses the iOS scroll wheel; desktop shows a dropdown. */
const REFERENCE_PERIOD_PICK_MIN = 30;
const REFERENCE_PERIOD_PICK_MAX = 180;
const REFERENCE_PERIOD_PICK_STEP = 15;

const REFERENCE_PERIOD_CHOICES = (() => {
  const a = [];
  for (let m = REFERENCE_PERIOD_PICK_MIN; m <= REFERENCE_PERIOD_PICK_MAX; m += REFERENCE_PERIOD_PICK_STEP) {
    a.push(m);
  }
  return a;
})();

/** Reference “beer” for equivalents and next-beer timing: 40 cl @ 5% → pure alcohol (cl). */
const REF_BEER_CL = 40;
const REF_BEER_ABV = 5;
const REF_BEER_PURE_CL = REF_BEER_CL * (REF_BEER_ABV / 100);

/** First two standard beers can be started without waiting; later beers use the cooldown. */
const INITIAL_ALLOWANCE_STANDARD_BEERS = 2;
const INITIAL_ALLOWANCE_PURE_CL = INITIAL_ALLOWANCE_STANDARD_BEERS * REF_BEER_PURE_CL;

function normalizeReferencePeriodMinutes(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return null;
  const x = Math.round(n);
  if (x < 1 || x > 24 * 60) return null;
  return x;
}

function snapReferencePeriodToPickerChoice(n) {
  if (typeof n !== "number" || !Number.isFinite(n)) return DEFAULT_REFERENCE_PERIOD_MINUTES;
  const clamped = Math.min(REFERENCE_PERIOD_PICK_MAX, Math.max(REFERENCE_PERIOD_PICK_MIN, Math.round(n)));
  let best = REFERENCE_PERIOD_CHOICES[0];
  let bestD = Math.abs(best - clamped);
  for (const c of REFERENCE_PERIOD_CHOICES) {
    const d = Math.abs(c - clamped);
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function getReferencePeriodMinutes(data) {
  const n = normalizeReferencePeriodMinutes(data.referencePeriodMinutes);
  const raw = n ?? DEFAULT_REFERENCE_PERIOD_MINUTES;
  return snapReferencePeriodToPickerChoice(raw);
}

function getReferencePeriodMs(data) {
  return getReferencePeriodMinutes(data) * 60 * 1000;
}

/** Refresh often enough for minute countdowns without doing unnecessary work. */
const SUMMARY_REFRESH_MS = 15 * 1000;

function formatAbvComma(abv) {
  return abv.toFixed(1).replace(".", ",");
}

/** Pure alcohol (cl) for calculations. */
function pureAlcoholClFromServing(abv, cl) {
  return cl * (abv / 100);
}

/** Short label for default grid buttons and matching log lines. */
function defaultPresetDrinkLabel(abv, cl) {
  return `${formatAbvComma(abv)}% ${cl} cl`;
}

const DEFAULT_DRINKS = {
  "2_16_5": { abv: 2.0, cl: 20, label: defaultPresetDrinkLabel(2.0, 20) },
  "2_33":   { abv: 2.0, cl: 33, label: defaultPresetDrinkLabel(2.0, 33) },
  "2_40":   { abv: 2.0, cl: 40, label: defaultPresetDrinkLabel(2.0, 40) },
  "2_50":   { abv: 2.0, cl: 50, label: defaultPresetDrinkLabel(2.0, 50) },

  "3_16_5": { abv: 3.5, cl: 20, label: defaultPresetDrinkLabel(3.5, 20) },
  "3_33":   { abv: 3.5, cl: 33, label: defaultPresetDrinkLabel(3.5, 33) },
  "3_40":   { abv: 3.5, cl: 40, label: defaultPresetDrinkLabel(3.5, 40) },
  "3_50":   { abv: 3.5, cl: 50, label: defaultPresetDrinkLabel(3.5, 50) },

  "5_16_5": { abv: 5.0, cl: 20, label: defaultPresetDrinkLabel(5.0, 20) },
  "5_33":   { abv: 5.0, cl: 33, label: defaultPresetDrinkLabel(5.0, 33) },
  "5_40":   { abv: 5.0, cl: 40, label: defaultPresetDrinkLabel(5.0, 40) },
  "5_50":   { abv: 5.0, cl: 50, label: defaultPresetDrinkLabel(5.0, 50) }
};

function today() {
  const d = new Date();
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${day}`;
}

function parseStoredData(raw) {
  if (raw == null || raw === "") return null;
  try {
    const o = JSON.parse(raw);
    return o && typeof o === "object" && !Array.isArray(o) ? o : null;
  } catch {
    return null;
  }
}

/** Prefer localStorage; fall back to sessionStorage (helps when sandboxes e.g. CodePen evict one store). */
function readPersistedData() {
  let data = parseStoredData(localStorage.getItem(KEY));
  if (data) return data;
  data = parseStoredData(sessionStorage.getItem(KEY));
  return data || {};
}

function isSyntheticLogEntry(e) {
  return Boolean(e && (e.kind === "start" || e.kind === "accrual_paused"));
}

function inferSessionDateFromLog(log) {
  let bestTs = Infinity;
  let bestDate = null;
  for (const e of log) {
    if (!e || isSyntheticLogEntry(e)) continue;
    const ts = typeof e.ts === "number" && Number.isFinite(e.ts) ? e.ts : null;
    const d = e.date && /^\d{4}-\d{2}-\d{2}$/.test(e.date) ? e.date : null;
    if (ts != null && d && ts <= bestTs) {
      bestTs = ts;
      bestDate = d;
    }
  }
  return bestDate || today();
}

function nowTime() {
  return new Date().toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function parseAtDateTime(dateYmd, hhmm) {
  if (!dateYmd || typeof dateYmd !== "string") return Date.now();
  if (!hhmm || typeof hhmm !== "string") return Date.now();
  const parts = hhmm.split(":");
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return Date.now();
  const [y, mo, d] = dateYmd.split("-").map(Number);
  if (!Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return Date.now();
  return new Date(y, mo - 1, d, h, m, 0, 0).getTime();
}

function migrateLogEntries(data) {
  const log = data.log;
  const sessionDay = data.date || today();
  let changed = false;
  for (const entry of log) {
    if (!entry.date || typeof entry.date !== "string") {
      entry.date = sessionDay;
      changed = true;
    }
    if (typeof entry.ts !== "number" || !Number.isFinite(entry.ts)) {
      entry.ts = parseAtDateTime(entry.date, entry.time);
      changed = true;
    }
  }
  return changed;
}

function sortLogByTsDesc(log) {
  log.sort((a, b) => {
    const ta = typeof a.ts === "number" && Number.isFinite(a.ts) ? a.ts : 0;
    const tb = typeof b.ts === "number" && Number.isFinite(b.ts) ? b.ts : 0;
    return tb - ta;
  });
}

/** Newest first by time; bump ts when tied so order is strict. Returns true if log order or any ts changed. */
function sortLogNewestFirst(log) {
  if (log.length === 0) return false;
  let changed = false;
  const tsOrderBefore = log.map((e) => e.ts);
  sortLogByTsDesc(log);
  const tsOrderAfter = log.map((e) => e.ts);
  if (
    tsOrderBefore.length !== tsOrderAfter.length ||
    tsOrderBefore.some((t, i) => t !== tsOrderAfter[i])
  ) {
    changed = true;
  }
  let bumped = true;
  while (bumped) {
    bumped = false;
    for (let i = 0; i < log.length - 1; i++) {
      if (log[i].ts <= log[i + 1].ts) {
        log[i].ts = log[i + 1].ts + 1;
        bumped = true;
        changed = true;
      }
    }
  }
  return changed;
}

function formatEntryWhenForDisplay(entry) {
  const d = entry.date || today();
  const t = normalizeTimeForTimeInput(entry.time || "") || String(entry.time || "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
    return [d, t].filter(Boolean).join(" ");
  }
  return t ? `${d} ${t}` : d;
}

function isDateTimeStrictlyInFuture(dateYmd, hhmm) {
  return parseAtDateTime(dateYmd, hhmm) > Date.now();
}

function normalizeGoHomeTime(value) {
  const t = normalizeTimeForTimeInput(value || "");
  return t && /^\d{2}:\d{2}$/.test(t) ? t : "";
}

/** Removes legacy synthetic rows. Cooldown is measured from real drink timestamps only. */
function syncSessionStartEntry(data) {
  const log = data.log;
  let changed = false;
  const startIndices = [];
  for (let i = 0; i < log.length; i++) {
    if (isSyntheticLogEntry(log[i])) startIndices.push(i);
  }
  for (let k = startIndices.length - 1; k >= 0; k--) {
    log.splice(startIndices[k], 1);
    changed = true;
  }
  return changed;
}

function getFirstDrinkTimestamp(log) {
  if (!log.length) return null;
  let min = Infinity;
  for (const e of log) {
    if (isSyntheticLogEntry(e)) continue;
    if (typeof e.ts === "number" && Number.isFinite(e.ts)) min = Math.min(min, e.ts);
  }
  return min === Infinity ? null : min;
}

function getRealDrinkEntriesOldestFirst(log) {
  const entries = [];
  for (const e of log) {
    if (isSyntheticLogEntry(e)) continue;
    if (typeof e.ts !== "number" || !Number.isFinite(e.ts)) continue;
    entries.push(e);
  }
  entries.sort((a, b) => a.ts - b.ts);
  return entries;
}

function getLastDrinkTimestamp(log) {
  const entries = getRealDrinkEntriesOldestFirst(log);
  return entries.length ? entries[entries.length - 1].ts : null;
}

function getStarterAllowanceUsedAtMs(log) {
  let total = 0;
  for (const entry of getRealDrinkEntriesOldestFirst(log)) {
    total += pureAlcoholClFromServing(entry.abv, entry.cl);
    if (total >= INITIAL_ALLOWANCE_PURE_CL - 0.001) return entry.ts;
  }
  return null;
}

function getAllowedPureAlcoholCl(log, data, nowMs = Date.now()) {
  const firstDrinkMs = getFirstDrinkTimestamp(log);
  if (firstDrinkMs == null) return 0;
  const starterUsedAtMs = getStarterAllowanceUsedAtMs(log);
  if (starterUsedAtMs === null || nowMs < starterUsedAtMs) return INITIAL_ALLOWANCE_PURE_CL;
  const completedCooldowns = Math.max(0, Math.floor((nowMs - starterUsedAtMs) / getReferencePeriodMs(data)));
  return INITIAL_ALLOWANCE_PURE_CL + completedCooldowns * REF_BEER_PURE_CL;
}

function getGoHomeMs(data) {
  const goHomeTime = normalizeGoHomeTime(data.goHomeTime);
  if (!goHomeTime) return null;
  const firstDrinkMs = getFirstDrinkTimestamp(data.log);
  const sessionDate = data.date || today();
  let goHomeMs = parseAtDateTime(sessionDate, goHomeTime);
  if (firstDrinkMs !== null && goHomeMs < firstDrinkMs) goHomeMs += 24 * 60 * 60 * 1000;
  return goHomeMs;
}

function getGoHomeLastStartMs(data) {
  const goHomeMs = getGoHomeMs(data);
  if (goHomeMs === null) return null;
  return goHomeMs - getReferencePeriodMs(data);
}

function getGoHomePhase(data, nowMs = Date.now()) {
  const goHomeMs = getGoHomeMs(data);
  if (goHomeMs === null) return "none";
  if (nowMs > goHomeMs + 1) return "gone-home";
  const lastStartMs = goHomeMs - getReferencePeriodMs(data);
  if (nowMs > lastStartMs + 1) return "before-home";
  return "open";
}

function projectedDrinkStatus(d, drank, pureCl, nowMs = Date.now()) {
  const projected = drank + pureCl;
  const goHomePhase = getGoHomePhase(d, nowMs);
  if (goHomePhase === "gone-home") return "gone-home";
  if (projected <= INITIAL_ALLOWANCE_PURE_CL + 0.001) return "ok";
  if (goHomePhase === "before-home") return "too-late";
  const lastDrinkMs = getLastDrinkTimestamp(d.log);
  if (lastDrinkMs === null) return "ok";
  if (nowMs < lastDrinkMs + getReferencePeriodMs(d) - 1) return "bad";
  return "ok";
}

function formatCountdownDuration(ms) {
  const totalMinutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
  return `${totalMinutes} min`;
}

function getNextReferenceBeerStatusLine(d, drank, nowMs = Date.now()) {
  const goHomePhase = getGoHomePhase(d, nowMs);
  if (goHomePhase === "gone-home") return "No more beers go home";
  if (drank + REF_BEER_PURE_CL <= INITIAL_ALLOWANCE_PURE_CL + 0.001) return "";

  if (goHomePhase === "before-home") return "No more beers before going home";

  const lastDrinkMs = getLastDrinkTimestamp(d.log);
  if (lastDrinkMs === null) return "";

  const msUntilNextBeer = lastDrinkMs + getReferencePeriodMs(d) - nowMs;
  if (msUntilNextBeer <= 1) return "";
  const lastStartMs = getGoHomeLastStartMs(d);
  if (lastStartMs !== null && nowMs + msUntilNextBeer > lastStartMs + 1) {
    return "No more beers before going home";
  }

  return `Next beer in ${formatCountdownDuration(msUntilNextBeer)}`;
}

function load() {
  let data = readPersistedData();

  if (!Array.isArray(data.log)) data.log = [];
  let dirty = false;

  if (!data.date || typeof data.date !== "string") {
    data.date = data.log.length > 0 ? inferSessionDateFromLog(data.log) : today();
    dirty = true;
  }

  if (migrateLogEntries(data)) dirty = true;
  const refRaw =
    normalizeReferencePeriodMinutes(data.referencePeriodMinutes) ?? DEFAULT_REFERENCE_PERIOD_MINUTES;
  const refSnapped = snapReferencePeriodToPickerChoice(refRaw);
  if (data.referencePeriodMinutes !== refSnapped) {
    data.referencePeriodMinutes = refSnapped;
    dirty = true;
  }
  const goHomeTime = normalizeGoHomeTime(data.goHomeTime);
  if (data.goHomeTime !== goHomeTime) {
    data.goHomeTime = goHomeTime;
    dirty = true;
  }
  if (sortLogNewestFirst(data.log)) dirty = true;
  if (syncSessionStartEntry(data)) {
    dirty = true;
    sortLogNewestFirst(data.log);
  }
  if (dirty) save(data);

  return data;
}

function save(data) {
  if (Array.isArray(data.log) && data.log.length > 0) {
    data.date = inferSessionDateFromLog(data.log);
  } else if (!data.date) {
    data.date = today();
  }
  const s = JSON.stringify(data);
  try {
    localStorage.setItem(KEY, s);
  } catch {
    /* quota / blocked */
  }
  try {
    sessionStorage.setItem(KEY, s);
  } catch {
    /* private mode / blocked */
  }
}

function tryRequestPersistentStorage() {
  if (!navigator.storage?.persist) return;
  navigator.storage.persist().catch(() => {});
}

function addDrink(defaultKey) {
  const data = load();
  const base = DEFAULT_DRINKS[defaultKey];
  if (!base) return;
  const label = base.label;

  data.log.push({
    date: today(),
    time: nowTime(),
    ts: Date.now(),
    abv: base.abv,
    cl: base.cl,
    label: label
  });

  syncSessionStartEntry(data);
  sortLogNewestFirst(data.log);
  save(data);
  render();
}

function undoLast() {
  const data = load();
  if (data.log.length > 0) {
    data.log.shift();
    syncSessionStartEntry(data);
    sortLogNewestFirst(data.log);
    save(data);
    render();
  }
}

function resetDay() {
  const data = load();
  data.log = [];
  data.date = today();
  save(data);
  render();
}

function getPureAlcoholCl(log) {
  let total = 0;
  log.forEach((entry) => {
    if (isSyntheticLogEntry(entry)) return;
    total += entry.cl * (entry.abv / 100);
  });
  return total;
}

function rebuildLogLabel(entry) {
  for (const key of Object.keys(DEFAULT_DRINKS)) {
    const d = DEFAULT_DRINKS[key];
    if (Math.abs(d.abv - entry.abv) < 1e-6 && Math.abs(d.cl - entry.cl) < 1e-6) {
      return d.label;
    }
  }
  const abvStr = entry.abv.toFixed(1).replace(".", ",");
  return `${abvStr}% · ${entry.cl} cl`;
}

function normalizeTimeForTimeInput(hhmm) {
  if (!hhmm || typeof hhmm !== "string") return "";
  const m = hhmm.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return "";
  const h = Math.min(23, Math.max(0, parseInt(m[1], 10)));
  const min = Math.min(59, Math.max(0, parseInt(m[2], 10)));
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

let logEditIndex = null;
let logEditDrinkKey = null;

function findDefaultDrinkKeyForEntry(entry) {
  if (isSyntheticLogEntry(entry)) return null;
  for (const key of Object.keys(DEFAULT_DRINKS)) {
    const d = DEFAULT_DRINKS[key];
    if (Math.abs(d.abv - entry.abv) < 1e-6 && Math.abs(d.cl - entry.cl) < 1e-6) {
      return key;
    }
  }
  return null;
}

function syncLogEditMatrixSelection() {
  const matrix = document.getElementById("logEditMatrix");
  if (!matrix) return;
  matrix.querySelectorAll("button[data-drink]").forEach((b) => {
    b.classList.toggle("log-edit-matrix-btn--selected", b.getAttribute("data-drink") === logEditDrinkKey);
  });
}

function syncPresetMatrixButtonLabels(data) {
  const d = data ?? load();
  const drank = getPureAlcoholCl(d.log);

  document.querySelectorAll("button[data-drink]").forEach((btn) => {
    const key = btn.getAttribute("data-drink");
    const preset = DEFAULT_DRINKS[key];
    if (!preset) return;
    const span = btn.querySelector("span");
    if (span) span.textContent = defaultPresetDrinkLabel(preset.abv, preset.cl);

    const pure = pureAlcoholClFromServing(preset.abv, preset.cl);
    btn.classList.remove("preset-pace--ok", "preset-pace--bad");
    if (projectedDrinkStatus(d, drank, pure) === "ok") {
      btn.classList.add("preset-pace--ok");
    } else {
      btn.classList.add("preset-pace--bad");
    }
  });
}

function setLogEditError(msg) {
  const el = document.getElementById("logEditError");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("hidden", !msg);
}

function openLogEditor(index) {
  const data = load();
  const entry = data.log[index];
  if (!entry || isSyntheticLogEntry(entry)) return;

  logEditIndex = index;
  logEditDrinkKey = findDefaultDrinkKeyForEntry(entry);
  setLogEditError("");

  const dateEl = document.getElementById("logEditDate");
  const sessionDay = data.date || today();
  dateEl.value = entry.date && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) ? entry.date : sessionDay;
  dateEl.max = today();
  const past = new Date();
  past.setDate(past.getDate() - 60);
  dateEl.min = `${past.getFullYear()}-${String(past.getMonth() + 1).padStart(2, "0")}-${String(past.getDate()).padStart(2, "0")}`;

  const timeEl = document.getElementById("logEditTime");
  timeEl.value = normalizeTimeForTimeInput(entry.time);
  syncLogEditMatrixSelection();

  const backdrop = document.getElementById("logEditBackdrop");
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");
  timeEl.focus();
}

function closeLogEditor() {
  logEditIndex = null;
  logEditDrinkKey = null;
  syncLogEditMatrixSelection();
  setLogEditError("");
  const backdrop = document.getElementById("logEditBackdrop");
  backdrop.classList.add("hidden");
  backdrop.setAttribute("aria-hidden", "true");
}

function saveLogEdit() {
  if (logEditIndex === null) return;
  const data = load();
  const entry = data.log[logEditIndex];
  if (!entry) {
    closeLogEditor();
    return;
  }
  if (isSyntheticLogEntry(entry)) {
    closeLogEditor();
    return;
  }

  const dateVal = document.getElementById("logEditDate").value.trim();
  const timeVal = document.getElementById("logEditTime").value.trim();
  if (!dateVal || !/^\d{4}-\d{2}-\d{2}$/.test(dateVal)) {
    setLogEditError("Set a valid date.");
    return;
  }
  if (!timeVal) {
    setLogEditError("Set a valid time.");
    return;
  }

  if (dateVal > today()) {
    setLogEditError("Date cannot be in the future.");
    return;
  }

  if (isDateTimeStrictlyInFuture(dateVal, timeVal)) {
    setLogEditError("That time is still in the future today.");
    return;
  }

  if (!logEditDrinkKey || !DEFAULT_DRINKS[logEditDrinkKey]) {
    setLogEditError("Choose strength and serving size (same grid as the main counter).");
    return;
  }

  const base = DEFAULT_DRINKS[logEditDrinkKey];
  entry.date = dateVal;
  entry.time = timeVal;
  entry.abv = base.abv;
  entry.cl = base.cl;
  entry.ts = parseAtDateTime(dateVal, timeVal);
  entry.label = rebuildLogLabel(entry);

  sortLogNewestFirst(data.log);
  syncSessionStartEntry(data);
  sortLogNewestFirst(data.log);
  save(data);
  closeLogEditor();
  render();
}

function updateSummary(data) {
  const d = data ?? load();

  const drank = getPureAlcoholCl(d.log);
  const allowed = getAllowedPureAlcoholCl(d.log, d);
  const diff = drank - allowed;
  let paceClass = "summary--pace-ok";
  if (diff > 0.001) {
    paceClass = "summary--pace-bad";
  }

  const beersD = drank / REF_BEER_PURE_CL;
  const beersA = allowed / REF_BEER_PURE_CL;
  const nextBeerLine = getFirstDrinkTimestamp(d.log) == null
    ? ""
    : getNextReferenceBeerStatusLine(d, drank);
  const nextBeerHtml = nextBeerLine
    ? `<div class="summary-next-beer summary-value--dark">${nextBeerLine}</div>`
    : "";

  const el = document.getElementById("summary");
  if (!el) return;
  el.classList.remove("summary--pace-ok", "summary--pace-bad");
  el.classList.add(paceClass);
  el.innerHTML = `
    <div class="summary-label">Drank / allowed</div>
    <div class="summary-value summary-value--dark">${drank.toFixed(2).replace(".", ",")} / ${allowed.toFixed(2).replace(".", ",")} pure alcohol</div>
    <div class="summary-beer-equiv summary-value--dark">${beersD.toFixed(2).replace(".", ",")} / ${beersA.toFixed(2).replace(".", ",")} beers</div>
    ${nextBeerHtml}
  `;
  syncPresetMatrixButtonLabels(d);
}

function ensureReferencePeriodSelectOptions() {
  const sel = document.getElementById("referencePeriodInput");
  if (!sel || sel.dataset.optionsBuilt === "1") return;
  sel.dataset.optionsBuilt = "1";
  sel.innerHTML = "";
  for (const m of REFERENCE_PERIOD_CHOICES) {
    const opt = document.createElement("option");
    opt.value = String(m);
    opt.textContent = `${m} min`;
    sel.appendChild(opt);
  }
}

function applyReferencePeriodFromInput() {
  const input = document.getElementById("referencePeriodInput");
  if (!input) return;
  const v = parseInt(input.value, 10);
  const data = load();
  if (!REFERENCE_PERIOD_CHOICES.includes(v)) {
    input.value = String(getReferencePeriodMinutes(data));
    return;
  }
  data.referencePeriodMinutes = v;
  let dirty = false;
  if (syncSessionStartEntry(data)) {
    dirty = true;
    sortLogNewestFirst(data.log);
  }
  save(data);
  updateSummary(data);
  if (dirty) render();
}

function applyGoHomeTimeFromInput() {
  const input = document.getElementById("goHomeTimeInput");
  if (!input) return;
  const data = load();
  data.goHomeTime = normalizeGoHomeTime(input.value);
  input.value = data.goHomeTime;
  save(data);
  render();
}

function render() {
  const data = load();
  updateSummary(data);

  let logHtml = "";
  if (data.log.length === 0) {
    logHtml += `<div class="log-empty">No entries yet.</div>`;
  } else {
    data.log.forEach((entry, idx) => {
      const line = `${escapeHtml(formatEntryWhenForDisplay(entry))} - ${escapeHtml(entry.label)}`;
      if (entry.kind === "start") {
        logHtml += `<div class="log-entry log-entry--start">${line}</div>`;
      } else {
        logHtml += `<button type="button" class="log-entry" data-log-index="${idx}">${line}</button>`;
      }
    });
  }

  document.getElementById("log").innerHTML = logHtml;
  const refInput = document.getElementById("referencePeriodInput");
  if (refInput) refInput.value = String(getReferencePeriodMinutes(data));
  const goHomeInput = document.getElementById("goHomeTimeInput");
  if (goHomeInput) goHomeInput.value = data.goHomeTime || "";
  syncPresetMatrixButtonLabels(data);
}

document.getElementById("drinkMatrix").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-drink]");
  if (!btn) return;
  addDrink(btn.getAttribute("data-drink"));
});

function openResetConfirm() {
  const backdrop = document.getElementById("resetConfirmBackdrop");
  backdrop.classList.remove("hidden");
  backdrop.setAttribute("aria-hidden", "false");
  document.getElementById("resetConfirmCancel").focus();
}

function closeResetConfirm() {
  const backdrop = document.getElementById("resetConfirmBackdrop");
  backdrop.classList.add("hidden");
  backdrop.setAttribute("aria-hidden", "true");
}

document.getElementById("undoBtn").addEventListener("click", undoLast);
document.getElementById("resetBtn").addEventListener("click", openResetConfirm);

document.getElementById("resetConfirmBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "resetConfirmBackdrop") closeResetConfirm();
});
document.getElementById("resetConfirmCancel").addEventListener("click", closeResetConfirm);
document.getElementById("resetConfirmOk").addEventListener("click", () => {
  closeResetConfirm();
  resetDay();
});

const referencePeriodInput = document.getElementById("referencePeriodInput");
if (referencePeriodInput) {
  referencePeriodInput.addEventListener("change", applyReferencePeriodFromInput);
}

const goHomeTimeInput = document.getElementById("goHomeTimeInput");
if (goHomeTimeInput) {
  goHomeTimeInput.addEventListener("change", applyGoHomeTimeFromInput);
}

document.getElementById("log").addEventListener("click", (e) => {
  const btn = e.target.closest("button.log-entry[data-log-index]");
  if (!btn) return;
  const idx = parseInt(btn.getAttribute("data-log-index"), 10);
  if (Number.isFinite(idx)) openLogEditor(idx);
});

document.getElementById("logEditBackdrop").addEventListener("click", (e) => {
  if (e.target.id === "logEditBackdrop") closeLogEditor();
});

document.getElementById("logEditCancel").addEventListener("click", closeLogEditor);
document.getElementById("logEditSave").addEventListener("click", saveLogEdit);

document.getElementById("logEditMatrix").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-drink]");
  if (!btn) return;
  logEditDrinkKey = btn.getAttribute("data-drink");
  syncLogEditMatrixSelection();
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  const resetBackdrop = document.getElementById("resetConfirmBackdrop");
  if (resetBackdrop && !resetBackdrop.classList.contains("hidden")) { closeResetConfirm(); return; }
  const backdrop = document.getElementById("logEditBackdrop");
  if (backdrop && !backdrop.classList.contains("hidden")) closeLogEditor();
});

setInterval(() => {
  if (document.visibilityState !== "visible") return;
  updateSummary();
}, SUMMARY_REFRESH_MS);

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") updateSummary();
});

document.addEventListener("pageshow", (e) => {
  if (e.persisted) render();
});

ensureReferencePeriodSelectOptions();
tryRequestPersistentStorage();
render();
