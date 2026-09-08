/* ============================================================
   PPE Ledger — straight-line depreciation & reconciliation tool
   Municipal Government Office, Candoni — General Fund PPE
   (Standalone / Firebase edition — ported from the Claude Artifact version)
   ============================================================ */
import { db, browserDownload } from "./firebase.js";

/* ---------- Chart-of-accounts catalog (fixed reference data — not user data) ---------- */
const ACCOUNT_CATALOG = [
  // group, code, name, depreciable, depExpCode, depExpName
  ["Land & Land Improvements", 10701010, "Land", false, null, null],
  ["Land & Land Improvements", 10702010, "Land Improvements, Aquaculture Structures", true, 50501020, "Depreciation - Land Improvements"],
  ["Land & Land Improvements", 10702990, "Other Land Improvements", true, 50501020, "Depreciation - Land Improvements"],
  ["Infrastructure Assets", 10703010, "Road Networks", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703020, "Flood Control Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703030, "Sewer Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703040, "Water Supply Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703050, "Power Supply Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703060, "Communication Networks", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703070, "Seaport Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703080, "Airport Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703090, "Parks, Plazas and Monuments", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703990, "Other Infrastructure Assets", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Buildings & Structures", 10704010, "Buildings", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704020, "School Buildings", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704030, "Hospitals and Health Centers", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704040, "Markets", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704050, "Slaughterhouses", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704060, "Hostels and Dormitories", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704990, "Other Structures", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Machinery & Equipment", 10705010, "Machinery", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705020, "Office Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705030, "Information and Communication Technology Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705040, "Agricultural and Forestry Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705050, "Marine and Fishery Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705060, "Airport Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705070, "Communication Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705080, "Construction and Heavy Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705090, "Disaster Response and Rescue Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705100, "Military, Police and Security Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705110, "Medical Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705120, "Printing Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705130, "Sports Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705140, "Technical and Scientific Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705990, "Other Machinery and Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Transportation Equipment", 10706010, "Motor Vehicles", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706020, "Trains", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706030, "Aircrafts and Aircrafts Ground Equipment", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706040, "Watercrafts", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706990, "Other Transportation Equipment", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Furniture, Fixtures & Books", 10707010, "Furniture and Fixtures", true, 50501070, "Depreciation - Furniture, Fixtures and Books"],
  ["Furniture, Fixtures & Books", 10707020, "Books", true, 50501070, "Depreciation - Furniture, Fixtures and Books"],
  ["Construction in Progress", 10710010, "Construction in Progress - Land Improvements", false, null, null],
  ["Construction in Progress", 10710020, "Construction in Progress - Infrastructure Assets", false, null, null],
  ["Construction in Progress", 10710030, "Construction in Progress - Buildings and Other Structures", false, null, null],
  ["Other PPE", 10799010, "Work/Zoo Animals", true, 50501990, "Depreciation - Other Property, Plant and Equipment"],
  ["Other PPE", 10799990, "Other Property, Plant and Equipment", true, 50501990, "Depreciation - Other Property, Plant and Equipment"],
  ["Biological Assets", 10801020, "Plants and Trees", false, null, null],
  ["Intangible Assets", 10901010, "Patents/Copyrights", true, 50502010, "Amortization - Intangible Assets"],
  ["Intangible Assets", 10901020, "Computer Software", true, 50502010, "Amortization - Intangible Assets"],
  ["Intangible Assets", 10901990, "Other Intangible Assets", true, 50502010, "Amortization - Intangible Assets"],
];
const ACCOUNT_BY_CODE = {};
ACCOUNT_CATALOG.forEach(([group, code, name, dep, expCode, expName]) => {
  ACCOUNT_BY_CODE[code] = { group, code, name, depreciable: dep, expCode, expName };
});
function accountInfo(code) {
  return ACCOUNT_BY_CODE[code] || { group: "Other", code, name: "Account " + code, depreciable: false, expCode: null, expName: null };
}

const BASELINE_PERIOD = "2025-12"; // last closed year-end this registry is anchored to (per uploaded TB)

/* ---------- Generic helpers ---------- */
const PESO = new Intl.NumberFormat("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
function fmtMoney(n) { n = Number(n) || 0; return (n < 0 ? "-₱" : "₱") + PESO.format(Math.abs(n)); }
function fmtNum(n) { return PESO.format(Number(n) || 0); }
function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
function fmtDate(d) {
  if (!d) return "—";
  const dt = new Date(d + "T00:00:00");
  if (isNaN(dt)) return d;
  return dt.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
const MONTH_NAMES = ["January","February","March","April","May","June","July","August","September","October","November","December"];
function periodLabel(p) { const [y, m] = p.split("-").map(Number); return MONTH_NAMES[m - 1] + " " + y; }
function periodShort(p) { const [y, m] = p.split("-").map(Number); return MONTH_NAMES[m - 1].slice(0,3) + " " + y; }
function addMonths(p, n) {
  let [y, m] = p.split("-").map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return y + "-" + String(m).padStart(2, "0");
}
function cmpPeriod(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function todayPeriod() {
  const d = new Date();
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
}
function csvField(v) {
  v = v == null ? "" : String(v);
  if (/[",\n]/.test(v)) return '"' + v.replace(/"/g, '""') + '"';
  return v;
}
function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove("show"), 2600);
}
function uid(prefix) { return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

/* ---------- App state ---------- */
const S = {
  db: null,
  ready: false,
  assets: new Map(),      // id -> asset doc
  postings: new Map(),    // period -> {period, amounts:{}, postedAt, postedBy}
  tbSnapshots: new Map(), // period -> {period, accounts:{}, ...}
  view: "dashboard",
  currentUser: null,      // Firebase Auth user, set by initApp()
  registerFilter: { q: "", category: "", status: "active" },
  depPeriod: null,   // chosen period for Monthly Depreciation view
  reconPeriod: null, // chosen period for Reconciliation view
  reconDraft: "",    // unsaved Trial Balance text (pasted or uploaded) not yet tied to a saved period
};
/** Label used for "last edited by" / "posted by" style attribution — the signed-in user's email. */
function viewerLabel() {
  return (S.currentUser && (S.currentUser.email || S.currentUser.displayName)) || "Unnamed";
}

/* ---------- Depreciation engine ---------- */
function monthlyRate(asset) {
  if (!asset.depreciable || !asset.useful_life_years) return 0;
  const base = (asset.cost || 0) - (asset.residual_value || 0);
  const months = asset.useful_life_years * 12;
  if (months <= 0) return 0;
  return base / months;
}
function acquiredMonth(asset) {
  if (!asset.date_acquired) return null;
  return asset.date_acquired.slice(0, 7);
}
/** Sum of all posted depreciation for one asset across every posted period. */
function postedTotalFor(assetId) {
  let sum = 0;
  for (const doc of S.postings.values()) {
    if (doc.amounts && doc.amounts[assetId]) sum += doc.amounts[assetId];
  }
  return sum;
}
/** Sum of posted depreciation for one asset, periods <= given period (inclusive), period > baseline. */
function postedTotalThrough(assetId, period) {
  let sum = 0;
  for (const [p, doc] of S.postings.entries()) {
    if (cmpPeriod(p, period) <= 0 && doc.amounts && doc.amounts[assetId]) sum += doc.amounts[assetId];
  }
  return sum;
}
function currentAccumDepr(asset) {
  return round2((asset.accum_depr_baseline || 0) + postedTotalFor(asset.id));
}
function accumDeprAsOf(asset, period) {
  if (cmpPeriod(period, BASELINE_PERIOD) <= 0) return round2(asset.accum_depr_baseline || 0);
  return round2((asset.accum_depr_baseline || 0) + postedTotalThrough(asset.id, period));
}
function carryingAmount(asset, period) {
  const ad = period ? accumDeprAsOf(asset, period) : currentAccumDepr(asset);
  return round2((asset.cost || 0) - ad);
}
/** Depreciation amount that WOULD post for `period` for this asset, given everything posted before it. */
function previewAmountFor(asset, period) {
  if (asset.status !== "active" || !asset.depreciable) return 0;
  if (cmpPeriod(period, BASELINE_PERIOD) <= 0) return 0;
  const am = acquiredMonth(asset);
  if (am && cmpPeriod(period, am) <= 0) return 0; // depreciation starts the month AFTER acquisition
  const rate = monthlyRate(asset);
  if (rate <= 0) return 0;
  const alreadyBefore = round2((asset.accum_depr_baseline || 0) + postedTotalThrough(asset.id, addMonths(period, -1)));
  const depreciableBase = (asset.cost || 0) - (asset.residual_value || 0);
  const remaining = round2(depreciableBase - alreadyBefore);
  if (remaining <= 0.004) return 0;
  return round2(Math.min(rate, remaining));
}
/** Next period that has not yet been posted. */
function nextUnpostedPeriod() {
  let p = addMonths(BASELINE_PERIOD, 1);
  while (S.postings.has(p)) p = addMonths(p, 1);
  return p;
}
function lastPostedPeriod() {
  let last = null;
  for (const p of S.postings.keys()) if (!last || cmpPeriod(p, last) > 0) last = p;
  return last;
}
function activeAssets() { return [...S.assets.values()].filter(a => a.status === "active"); }
function depreciableActiveAssets() { return activeAssets().filter(a => a.depreciable); }

/* ---------- Reconciliation engine ---------- */
/** distinct {code,name} cost accounts actually used in the active register, sorted by code */
function distinctCostAccounts() {
  const map = new Map();
  activeAssets().forEach(a => { if (!map.has(a.account_code)) map.set(a.account_code, a.account_name); });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([code, name]) => ({ code, name }));
}
function registryCostFor(code) {
  return round2(activeAssets().filter(a => a.account_code === code).reduce((s, a) => s + (a.cost || 0), 0));
}
function registryADFor(code, period) {
  return round2(activeAssets().filter(a => a.account_code === code && a.depreciable)
    .reduce((s, a) => s + accumDeprAsOf(a, period), 0));
}
/** Build the full variance table for a chosen period against a tb_snapshot doc (or null). */
function computeReconciliation(period) {
  const tb = S.tbSnapshots.get(period);
  const accounts = tb ? tb.accounts : null;
  return distinctCostAccounts().map(({ code, name }) => {
    const adCode = code + 1;
    const regCost = registryCostFor(code);
    const regAD = registryADFor(code, period);
    const tbCost = accounts && accounts[code] ? Number(accounts[code].debit || 0) : null;
    const tbAD = accounts && accounts[adCode] ? Number(accounts[adCode].credit || 0) : null;
    const varCost = tbCost == null ? null : round2(regCost - tbCost);
    const varAD = tbAD == null ? null : round2(regAD - tbAD);
    // Trial Balance exports commonly omit a line entirely when its balance is zero, rather than
    // listing it as 0 — so a missing AD line only counts against reconciliation if the register
    // itself shows a nonzero accumulated depreciation for that account (a real, unexplained gap).
    // A missing AD line paired with ₱0.00 register AD (e.g. an asset that hasn't started
    // depreciating yet) is not a variance worth flagging.
    const adOk = !accountInfo(code).depreciable || (tbAD != null ? Math.abs(varAD) < 1 : Math.abs(regAD) < 1);
    const ok = tbCost != null && Math.abs(varCost) < 1 && adOk;
    return { code, name, adCode, regCost, regAD, tbCost, tbAD, varCost, varAD, ok, hasTb: !!accounts };
  });
}
/**
 * Is the PPE cost (not accumulated depreciation) side of the register tied out to a Trial
 * Balance, as of/most-recently-before the given depreciation period? This is the gate we check
 * before letting a period be posted — accumulated depreciation isn't checked here since this
 * period's posting is exactly what would change it.
 */
function costReconciliationStatus(period) {
  const tbPeriods = [...S.tbSnapshots.keys()].filter(p => cmpPeriod(p, period) <= 0).sort(cmpPeriod);
  const tbPeriod = tbPeriods.length ? tbPeriods[tbPeriods.length - 1] : null;
  if (!tbPeriod) return { ok: false, reason: "no-tb", tbPeriod: null, flagged: [] };
  const rows = computeReconciliation(tbPeriod).filter(r => distinctCostAccounts().some(c => c.code === r.code));
  const flagged = rows.filter(r => r.tbCost == null || Math.abs(r.varCost) >= 1);
  return { ok: flagged.length === 0, reason: flagged.length ? "variance" : null, tbPeriod, flagged };
}

/* ---------- JEV (journal entry voucher) engine ---------- */
/** Grouped debit/credit lines for a period's depreciation — posted if it exists, else a live preview. */
function jevForPeriod(period) {
  const posted = S.postings.get(period);
  const lines = new Map(); // expCode -> {expCode,expName,adCode,adName,amount}
  if (posted) {
    for (const [assetId, amt] of Object.entries(posted.amounts || {})) {
      const asset = S.assets.get(assetId);
      if (!asset || !amt) continue;
      addJevLine(lines, asset, amt);
    }
  } else {
    depreciableActiveAssets().forEach(a => {
      const amt = previewAmountFor(a, period);
      if (amt > 0) addJevLine(lines, a, amt);
    });
  }
  const arr = [...lines.values()].sort((a, b) => a.expCode - b.expCode);
  const total = round2(arr.reduce((s, l) => s + l.amount, 0));
  return { posted: !!posted, lines: arr, total, postedAt: posted && posted.postedAt, postedBy: posted && posted.postedBy };
}
function addJevLine(lines, asset, amt) {
  const info = accountInfo(asset.account_code);
  const key = asset.account_code;
  if (!lines.has(key)) {
    lines.set(key, {
      expCode: info.expCode || asset.dep_exp_account_code, expName: info.expName || asset.dep_exp_account_name,
      adCode: asset.account_code + 1, adName: "Accumulated Depreciation - " + info.name, amount: 0,
    });
  }
  lines.get(key).amount = round2(lines.get(key).amount + amt);
}

/* ---------- DB init (Firestore, via the js/firebase.js adapter) ---------- */
function initDb() {
  try {
    S.db = db;
    db.collection("assets").onSnapshot(
      snap => { S.assets.clear(); snap.docs.forEach(d => S.assets.set(d.id, { id: d.id, ...d.data() })); S.ready = true; setSync(true); renderAll(); },
      err => { console.error(err); setSync(false, "Connection issue — showing last known data."); }
    );
    db.collection("postings").onSnapshot(
      snap => { S.postings.clear(); snap.docs.forEach(d => S.postings.set(d.id, d.data())); renderAll(); },
      err => console.error(err)
    );
    db.collection("tb_snapshots").onSnapshot(
      snap => { S.tbSnapshots.clear(); snap.docs.forEach(d => S.tbSnapshots.set(d.id, d.data())); renderAll(); },
      err => console.error(err)
    );
  } catch (e) {
    console.error(e);
    setSync(false, "Database unavailable — check your Firebase configuration.");
  }
}
function setSync(live, msg) {
  document.getElementById("syncdot").classList.toggle("live", !!live);
  document.getElementById("syncstatus").textContent = msg || (live ? "Live — synced with your team" : "Offline");
}

/* ============================================================
   RENDER: Dashboard
   ============================================================ */
function renderDashboard() {
  const el = document.getElementById("view-dashboard");
  if (!S.ready) { el.innerHTML = loadingBlock(); return; }
  const active = activeAssets();
  const totalCost = round2(active.reduce((s, a) => s + (a.cost || 0), 0));
  const totalAD = round2(active.reduce((s, a) => s + currentAccumDepr(a), 0));
  const totalCarrying = round2(totalCost - totalAD);
  const retiredCount = [...S.assets.values()].filter(a => a.status === "retired").length;
  const nonDep = active.filter(a => !a.depreciable).length;
  const last = lastPostedPeriod();
  const next = nextUnpostedPeriod();

  // category breakdown
  const byCat = new Map();
  active.forEach(a => {
    const k = a.account_name;
    if (!byCat.has(k)) byCat.set(k, { name: k, cost: 0, ad: 0, count: 0, depreciable: a.depreciable });
    const c = byCat.get(k);
    c.cost += a.cost || 0; c.ad += currentAccumDepr(a); c.count++;
  });
  const cats = [...byCat.values()].sort((a, b) => b.cost - a.cost);

  // reconciliation attention items — latest tb snapshot period if any
  const tbPeriods = [...S.tbSnapshots.keys()].sort(cmpPeriod);
  const latestTbPeriod = tbPeriods.length ? tbPeriods[tbPeriods.length - 1] : null;
  const recon = latestTbPeriod ? computeReconciliation(latestTbPeriod) : [];
  const flags = recon.filter(r => r.hasTb && !r.ok);
  const okCount = recon.filter(r => r.hasTb && r.ok).length;

  el.innerHTML = `
    <div class="cardrow">
      <div class="card"><div class="label">Total PPE Cost</div><div class="value">${fmtMoney(totalCost)}</div><div class="foot">${active.length} active items</div></div>
      <div class="card"><div class="label">Accumulated Depreciation</div><div class="value">${fmtMoney(totalAD)}</div><div class="foot">as of ${last ? periodShort(last) : periodShort(BASELINE_PERIOD)}</div></div>
      <div class="card"><div class="label">Carrying Amount</div><div class="value">${fmtMoney(totalCarrying)}</div><div class="foot">net book value, all classes</div></div>
      <div class="card"><div class="label">Reconciliation</div><div class="value" style="color:${flags.length ? "var(--bad)" : "var(--good)"}">${latestTbPeriod ? flags.length + " to check" : "—"}</div><div class="foot">${latestTbPeriod ? okCount + " accounts tie out • " + periodShort(latestTbPeriod) : "No Trial Balance loaded yet"}</div></div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div><h3>Depreciation posting status</h3><div class="desc">Baseline anchored to your ${fmtDate(BASELINE_PERIOD + "-31")} Trial Balance</div></div>
        <button class="btn primary" onclick="setView('depreciation')">Go to Monthly Depreciation →</button>
      </div>
      <div class="panel-body">
        <div class="kv" style="grid-template-columns:180px 1fr;">
          <dt>Baseline period</dt><dd class="mono">${periodLabel(BASELINE_PERIOD)}</dd>
          <dt>Last posted</dt><dd class="mono">${last ? periodLabel(last) : "None — not yet started"}</dd>
          <dt>Next due</dt><dd class="mono">${periodLabel(next)}${cmpPeriod(next, todayPeriod()) < 0 ? ' <span class="pill warn">overdue</span>' : ""}</dd>
          <dt>Depreciable assets</dt><dd>${depreciableActiveAssets().length} of ${active.length} active items (${nonDep} non-depreciable: land, CIP, biological)</dd>
        </div>
      </div>
    </div>

    ${flags.length ? `
    <div class="panel">
      <div class="panel-head"><div><h3>Needs your attention</h3><div class="desc">Accounts where the register doesn't tie to the ${periodShort(latestTbPeriod)} Trial Balance</div></div>
        <button class="btn" onclick="setView('reconciliation')">Open Reconciliation →</button></div>
      <div class="panel-body"><div class="flag-list">
        ${flags.map(f => `<div class="flag-item bad">
            <span class="pill bad">CHECK</span>
            <div><b>${esc(f.name)}</b> (${f.code}) — register shows ${fmtMoney(f.regCost)} in cost${accountInfo(f.code).depreciable ? ` / ${fmtMoney(f.regAD)} accumulated depreciation` : ""},
            Trial Balance shows ${fmtMoney(f.tbCost)}${accountInfo(f.code).depreciable ? ` / ${fmtMoney(f.tbAD || 0)}` : ""}
            — variance ${fmtMoney(f.varCost)}${f.varAD ? " cost, " + fmtMoney(f.varAD) + " accum. depr." : ""}.</div>
          </div>`).join("")}
      </div></div>
    </div>` : latestTbPeriod ? `<div class="banner info">All ${okCount} PPE accounts tie to the ${periodShort(latestTbPeriod)} Trial Balance. Nothing needs attention.</div>` :
    `<div class="banner warn">No Trial Balance has been entered for reconciliation yet. Open <a href="#" onclick="setView('reconciliation');return false;">Reconciliation</a> to paste one in.</div>`}

    <div class="panel">
      <div class="panel-head"><div><h3>By category</h3><div class="desc">Active items, current period</div></div></div>
      <div class="panel-body flush"><div class="tablewrap"><table>
        <thead><tr><th>Category</th><th class="num">Items</th><th class="num">Cost</th><th class="num">Accum. Depreciation</th><th class="num">Carrying Amount</th><th>% Depreciated</th></tr></thead>
        <tbody>${cats.map(c => {
          const pct = c.depreciable && c.cost ? Math.min(100, Math.round((c.ad / c.cost) * 100)) : null;
          return `<tr><td>${esc(c.name)}</td><td class="num mono">${c.count}</td><td class="num mono">${fmtMoney(c.cost)}</td>
            <td class="num mono">${c.depreciable ? fmtMoney(c.ad) : '<span class="subtle">n/a</span>'}</td>
            <td class="num mono">${fmtMoney(c.cost - c.ad)}</td>
            <td>${pct == null ? '<span class="subtle">—</span>' : `<div class="progress" style="width:90px;display:inline-block;vertical-align:middle;margin-right:6px;"><div style="width:${pct}%"></div></div><span class="mono subtle">${pct}%</span>`}</td></tr>`;
        }).join("")}</tbody>
      </table></div></div>
    </div>
  `;
}
function loadingBlock() {
  return `<div class="empty"><div class="big">⋯</div>Loading the shared PPE register&hellip;</div>`;
}

/* ============================================================
   RENDER: Asset Register
   ============================================================ */
function renderRegister() {
  const el = document.getElementById("view-register");
  if (!S.ready) { el.innerHTML = loadingBlock(); return; }
  const f = S.registerFilter;
  const categories = [...new Set([...S.assets.values()].map(a => a.account_name))].sort();
  let rows = [...S.assets.values()];
  if (f.status !== "all") rows = rows.filter(a => a.status === f.status);
  if (f.category) rows = rows.filter(a => a.account_name === f.category);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(a => [a.property_id, a.description, a.location, a.accountable_officer, a.asset_type]
      .some(v => v && String(v).toLowerCase().includes(q)));
  }
  rows.sort((a, b) => (a.account_name || "").localeCompare(b.account_name) || (a.property_id || "").localeCompare(b.property_id || ""));

  el.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <input type="text" class="grow" id="regSearch" placeholder="Search description, property ID, location, officer…" value="${esc(f.q)}">
        <select id="regCategory"><option value="">All categories</option>${categories.map(c => `<option ${c === f.category ? "selected" : ""}>${esc(c)}</option>`).join("")}</select>
        <select id="regStatus">
          <option value="active" ${f.status === "active" ? "selected" : ""}>Active</option>
          <option value="all" ${f.status === "all" ? "selected" : ""}>All</option>
        </select>
        <span style="flex:1"></span>
        <button class="btn" onclick="exportRegisterCsv()">Download CSV</button>
        <button class="btn" onclick="openBulkAddModal()">Bulk add (paste)</button>
        <button class="btn primary" onclick="openAssetModal()">+ Add asset</button>
      </div>
      <div class="panel-body flush"><div class="tablewrap"><table>
        <thead><tr><th>Property ID</th><th>Category</th><th>Description</th><th>Location</th><th class="num">Cost</th><th class="num">Accum. Depr.</th><th class="num">Carrying</th><th>Status</th></tr></thead>
        <tbody>${rows.length ? rows.map(a => `
          <tr class="clickable" onclick="openAssetDetail('${a.id}')">
            <td class="mono">${esc(a.property_id) || "—"}</td>
            <td>${esc(a.account_name)}</td>
            <td class="truncate" title="${esc(a.description)}">${esc(a.description) || "—"}</td>
            <td class="truncate" title="${esc(a.location)}">${esc(a.location) || "—"}</td>
            <td class="num mono">${fmtMoney(a.cost)}</td>
            <td class="num mono">${a.depreciable ? fmtMoney(currentAccumDepr(a)) : '<span class="subtle">n/a</span>'}</td>
            <td class="num mono">${fmtMoney(carryingAmount(a))}</td>
            <td>${a.status === "retired" ? '<span class="pill neutral">Retired</span>' : '<span class="pill good">Active</span>'}</td>
          </tr>`).join("") : `<tr><td colspan="8"><div class="empty">No assets match these filters.</div></td></tr>`}
        </tbody>
      </table></div></div>
    </div>
  `;
  document.getElementById("regSearch").addEventListener("input", e => { S.registerFilter.q = e.target.value; renderRegister(); });
  document.getElementById("regCategory").addEventListener("change", e => { S.registerFilter.category = e.target.value; renderRegister(); });
  document.getElementById("regStatus").addEventListener("change", e => { S.registerFilter.status = e.target.value; renderRegister(); });
}
function exportRegisterCsv() {
  const f = S.registerFilter;
  let rows = [...S.assets.values()];
  if (f.status !== "all") rows = rows.filter(a => a.status === f.status);
  if (f.category) rows = rows.filter(a => a.account_name === f.category);
  if (f.q) {
    const q = f.q.toLowerCase();
    rows = rows.filter(a => [a.property_id, a.description, a.location, a.accountable_officer, a.asset_type]
      .some(v => v && String(v).toLowerCase().includes(q)));
  }
  rows.sort((a, b) => (a.account_name || "").localeCompare(b.account_name) || (a.property_id || "").localeCompare(b.property_id || ""));
  const out = [["Property ID", "Category", "Description", "Location", "Accountable Officer", "Date Acquired", "Cost", "Residual Value", "Useful Life (yrs)", "Accum. Depr.", "Carrying Amount", "Status"]];
  rows.forEach(a => out.push([a.property_id || "", a.account_name || "", a.description || "", a.location || "", a.accountable_officer || "",
    a.date_acquired || "", (a.cost || 0).toFixed(2), (a.residual_value || 0).toFixed(2), a.useful_life_years || "",
    a.depreciable ? currentAccumDepr(a).toFixed(2) : "n/a", carryingAmount(a).toFixed(2), a.status || ""]));
  const csv = out.map(r => r.map(csvField).join(",")).join("\n");
  browserDownload(`Asset_Register_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8;");
  toast("Saved.");
}

function assetCategoryOptions(selectedCode) {
  const groups = {};
  ACCOUNT_CATALOG.forEach(([g, code]) => { (groups[g] = groups[g] || []).push(code); });
  return Object.entries(groups).map(([g, codes]) => `<optgroup label="${esc(g)}">${codes.map(code => {
    const info = accountInfo(code);
    return `<option value="${code}" ${code === selectedCode ? "selected" : ""}>${code} — ${esc(info.name)}</option>`;
  }).join("")}</optgroup>`).join("");
}

function openAssetModal(existingId) {
  const a = existingId ? S.assets.get(existingId) : null;
  openModal(`
    <div class="modal-head"><h3>${a ? "Edit asset" : "Add asset"}</h3><button class="iconbtn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <div class="field"><label>Account / Category</label>
        <select id="f_account">${assetCategoryOptions(a ? a.account_code : null)}</select></div>
      <div class="fieldrow">
        <div class="field"><label>Property / Tag No.</label><input id="f_propid" value="${esc(a ? a.property_id : "")}"></div>
        <div class="field"><label>Date acquired</label><input type="date" id="f_date" value="${a ? a.date_acquired || "" : ""}"></div>
      </div>
      <div class="field"><label>Description</label><textarea id="f_desc" rows="2">${esc(a ? a.description : "")}</textarea></div>
      <div class="fieldrow">
        <div class="field"><label>Location / Office</label><input id="f_loc" value="${esc(a ? a.location : "")}"></div>
        <div class="field"><label>Accountable officer</label><input id="f_officer" value="${esc(a ? a.accountable_officer : "")}"></div>
      </div>
      <div class="fieldrow3">
        <div class="field"><label>Cost (₱)</label><input type="number" step="0.01" id="f_cost" value="${a ? a.cost : ""}"></div>
        <div class="field"><label>5% Residual value (₱)</label><input type="number" step="0.01" id="f_residual" value="${a ? a.residual_value : ""}"></div>
        <div class="field"><label>Useful life (years)</label><input type="number" step="1" id="f_life" value="${a ? a.useful_life_years : ""}"></div>
      </div>
      <div class="field"><label>PAR / DV reference</label><input id="f_remarks" value="${esc(a ? a.remarks : "")}" placeholder="e.g. PAR No. 2026-01-0004"></div>
      <div class="banner info" id="f_preview" style="margin-top:4px;"></div>
    </div>
    <div class="modal-foot">
      ${a ? `<button class="btn danger" style="margin-right:auto" onclick="retireAsset('${a.id}')">Retire this asset</button>` : ""}
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="saveAsset(${a ? `'${a.id}'` : "null"})">${a ? "Save changes" : "Add asset"}</button>
    </div>
  `);
  const updatePreview = () => {
    const cost = Number(document.getElementById("f_cost").value) || 0;
    const res = Number(document.getElementById("f_residual").value) || 0;
    const life = Number(document.getElementById("f_life").value) || 0;
    const code = Number(document.getElementById("f_account").value);
    const info = accountInfo(code);
    const monthly = info.depreciable && life ? (cost - res) / (life * 12) : 0;
    document.getElementById("f_preview").textContent = info.depreciable
      ? `Straight-line: ${fmtMoney(monthly)} / month once depreciation starts (the month after acquisition).`
      : `${info.name} is not depreciated (land, construction-in-progress, or biological asset).`;
  };
  ["f_cost", "f_residual", "f_life", "f_account"].forEach(id => document.getElementById(id).addEventListener("input", updatePreview));
  document.getElementById("f_account").addEventListener("change", () => {
    const cost = document.getElementById("f_cost").value;
    if (!document.getElementById("f_residual").value && cost) document.getElementById("f_residual").value = round2(Number(cost) * 0.05);
    updatePreview();
  });
  updatePreview();
}

async function saveAsset(existingId) {
  if (!S.db) return toast("No shared database in this view.");
  const code = Number(document.getElementById("f_account").value);
  const info = accountInfo(code);
  const cost = round2(Number(document.getElementById("f_cost").value) || 0);
  if (cost <= 0) return toast("Enter a cost greater than zero.");
  const rec = {
    account_code: code, account_name: info.name, ad_account_code: code + 1,
    dep_exp_account_code: info.expCode, dep_exp_account_name: info.expName,
    property_id: document.getElementById("f_propid").value.trim(),
    date_acquired: document.getElementById("f_date").value || null,
    description: document.getElementById("f_desc").value.trim(),
    location: document.getElementById("f_loc").value.trim(),
    accountable_officer: document.getElementById("f_officer").value.trim(),
    remarks: document.getElementById("f_remarks").value.trim(),
    cost, residual_value: round2(Number(document.getElementById("f_residual").value) || 0),
    useful_life_years: Number(document.getElementById("f_life").value) || 0,
    depreciable: !!info.depreciable,
    status: "active",
    updated_by: viewerLabel(), updated_at: new Date().toISOString(),
  };
  try {
    if (existingId) {
      await S.db.collection("assets").doc(existingId).update(rec);
      toast("Asset updated.");
    } else {
      rec.accum_depr_baseline = 0;
      rec.source_sheet = "Added in app";
      await S.db.collection("assets").add(rec);
      toast("Asset added.");
    }
    closeModal();
  } catch (e) { console.error(e); toast("Couldn't save — try again."); }
}

async function retireAsset(id) {
  if (!S.db) return;
  if (!confirm("Retire this asset? It will stop accruing depreciation and move to the Retired Assets list.")) return;
  await S.db.collection("assets").doc(id).update({ status: "retired", retired_at: new Date().toISOString(), retired_by: viewerLabel() });
  toast("Asset retired.");
  closeModal();
}

function openAssetDetail(id) {
  const a = S.assets.get(id);
  if (!a) return;
  const rate = monthlyRate(a);
  const ad = currentAccumDepr(a);
  const carrying = round2(a.cost - ad);
  const life = a.useful_life_years ? a.useful_life_years * 12 : 0;
  const monthsPosted = life ? Math.min(life, Math.round((ad) / (rate || 1))) : 0;
  openModal(`
    <div class="modal-head"><h3>${esc(a.property_id) || "Asset"} — ${esc(a.account_name)}</h3><button class="iconbtn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="margin-top:0;">${esc(a.description) || "<span class=subtle>No description</span>"}</p>
      <div class="kv">
        <dt>Category</dt><dd>${esc(a.account_name)} <span class="mono subtle">(${a.account_code})</span></dd>
        <dt>Location</dt><dd>${esc(a.location) || "—"}</dd>
        <dt>Accountable officer</dt><dd>${esc(a.accountable_officer) || "—"}</dd>
        <dt>Date acquired</dt><dd>${fmtDate(a.date_acquired)}</dd>
        <dt>Reference</dt><dd>${esc(a.remarks) || "—"}</dd>
        <dt>Status</dt><dd>${a.status === "retired" ? '<span class="pill neutral">Retired</span>' : '<span class="pill good">Active</span>'}</dd>
      </div>
      <hr style="border:none;border-top:1px solid var(--line-soft);margin:14px 0;">
      <div class="kv">
        <dt>Cost</dt><dd class="mono">${fmtMoney(a.cost)}</dd>
        <dt>5% Residual value</dt><dd class="mono">${fmtMoney(a.residual_value)}</dd>
        <dt>Useful life</dt><dd>${a.useful_life_years || 0} years ${a.depreciable ? `<span class="subtle mono">(${fmtMoney(rate)}/mo)</span>` : ""}</dd>
        <dt>Baseline AD (${periodShort(BASELINE_PERIOD)})</dt><dd class="mono">${fmtMoney(a.accum_depr_baseline)}</dd>
        <dt>Accum. depreciation now</dt><dd class="mono">${a.depreciable ? fmtMoney(ad) : "n/a — not depreciable"}</dd>
        <dt>Carrying amount</dt><dd class="mono">${fmtMoney(carrying)}</dd>
      </div>
      ${a.revaluations && a.revaluations.length ? (() => {
        const last = a.revaluations[a.revaluations.length - 1];
        return `<p class="subtle" style="font-size:11.5px;margin-top:12px;">Revalued ${a.revaluations.length} time(s) — last ${fmtDate(last.date)}: ${fmtMoney(last.old_cost)} &rarr; ${fmtMoney(last.new_cost)}${last.reason ? " (" + esc(last.reason) + ")" : ""}</p>`;
      })() : ""}
      ${a.source_sheet ? `<p class="subtle" style="font-size:11.5px;margin-top:12px;">Source: ${esc(a.source_sheet)}${a.updated_by ? " • last edited by " + esc(a.updated_by) : ""}</p>` : ""}
    </div>
    <div class="modal-foot">
      ${a.status === "active" ? `<button class="btn danger" style="margin-right:auto" onclick="retireAsset('${a.id}')">Retire</button>` : ""}
      <button class="btn ghost" onclick="closeModal()">Close</button>
      ${a.status === "active" ? `<button class="btn" onclick="openRevalueModal('${a.id}')">Revalue</button>` : ""}
      <button class="btn primary" onclick="openAssetModal('${a.id}')">Edit</button>
    </div>
  `);
}

function openRevalueModal(id) {
  const a = S.assets.get(id);
  if (!a) return;
  openModal(`
    <div class="modal-head"><h3>Revalue asset</h3><button class="iconbtn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p style="margin-top:0;">${esc(a.account_name)} ${a.property_id ? "— " + esc(a.property_id) : ""}</p>
      <p class="subtle" style="font-size:12.5px;">Use this when an updated market appraisal or zonal valuation changes what this asset is worth &mdash; the new value applies going forward, and the old value stays on record below.</p>
      <div class="kv" style="margin-bottom:14px;">
        <dt>Current cost</dt><dd class="mono">${fmtMoney(a.cost)}</dd>
        <dt>Current residual value</dt><dd class="mono">${fmtMoney(a.residual_value)}</dd>
      </div>
      <div class="fieldrow">
        <div class="field"><label>New market value (₱)</label><input type="number" step="0.01" id="rv_cost" value="${a.cost}"></div>
        <div class="field"><label>New residual value (₱)</label><input type="number" step="0.01" id="rv_residual" value="${a.residual_value}"></div>
      </div>
      <div class="fieldrow">
        <div class="field"><label>Effective date</label><input type="date" id="rv_date" value="${new Date().toISOString().slice(0, 10)}"></div>
        <div class="field"><label>Reference / reason</label><input id="rv_reason" placeholder="e.g. 2026 zonal valuation, Assessor's Office"></div>
      </div>
      ${a.revaluations && a.revaluations.length ? `
        <hr style="border:none;border-top:1px solid var(--line-soft);margin:14px 0;">
        <label style="margin-bottom:6px;">Revaluation history</label>
        <div class="kv" style="font-size:12.5px;grid-template-columns:110px 1fr;">
          ${a.revaluations.slice().reverse().map(r => `<dt class="mono">${fmtDate(r.date)}</dt><dd>${fmtMoney(r.old_cost)} &rarr; ${fmtMoney(r.new_cost)}${r.reason ? " — " + esc(r.reason) : ""} <span class="subtle">(${esc(r.by || "")})</span></dd>`).join("")}
        </div>
      ` : ""}
    </div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="revalueAsset('${a.id}')">Save revaluation</button>
    </div>
  `);
}

async function revalueAsset(id) {
  if (!S.db) return toast("No shared database in this view.");
  const a = S.assets.get(id);
  if (!a) return;
  const newCost = round2(Number(document.getElementById("rv_cost").value) || 0);
  const newResidual = round2(Number(document.getElementById("rv_residual").value) || 0);
  const date = document.getElementById("rv_date").value || new Date().toISOString().slice(0, 10);
  const reason = document.getElementById("rv_reason").value.trim();
  if (newCost <= 0) return toast("Enter a market value greater than zero.");
  if (newCost === a.cost && newResidual === a.residual_value) return toast("No change to save.");
  const entry = {
    date, old_cost: a.cost, new_cost: newCost, old_residual: a.residual_value, new_residual: newResidual,
    reason, by: viewerLabel(), at: new Date().toISOString(),
  };
  const revaluations = [...(a.revaluations || []), entry];
  try {
    await S.db.collection("assets").doc(id).update({
      cost: newCost, residual_value: newResidual, revaluations,
      updated_by: viewerLabel(), updated_at: new Date().toISOString(),
    });
    toast("Revaluation saved.");
    closeModal();
  } catch (e) { console.error(e); toast("Couldn't save — try again."); }
}

function openBulkAddModal() {
  openModal(`
    <div class="modal-head"><h3>Bulk add assets</h3><button class="iconbtn" onclick="closeModal()">✕</button></div>
    <div class="modal-body">
      <p class="subtle">Upload a CSV file, or paste rows copied from a spreadsheet — one asset per line, columns in this order:</p>
      <p class="mono subtle" style="font-size:11.5px;">account_code, property_id, date_acquired (YYYY-MM-DD), description, location, accountable_officer, cost, residual_value, useful_life_years</p>
      <div class="field" style="margin-top:10px;">
        <label>CSV file</label>
        <input type="file" id="bulkFile" accept=".csv,text/csv">
      </div>
      <p class="subtle" style="font-size:12px;margin:10px 0 6px;">— or paste directly —</p>
      <div class="field"><textarea id="bulkPaste" rows="7" placeholder="10705020&#9;2026-01-0001&#9;2026-01-15&#9;Laptop for HR&#9;HR Office&#9;Juan Dela Cruz&#9;58000&#9;2900&#9;5"></textarea></div>
      <div id="bulkPreview" class="subtle" style="font-size:12px;"></div>
    </div>
    <div class="modal-foot">
      <button class="btn ghost" onclick="closeModal()">Cancel</button>
      <button class="btn primary" onclick="submitBulkAdd()">Add all</button>
    </div>
  `);
  const textarea = document.getElementById("bulkPaste");
  const preview = () => {
    const rows = parseBulkRows(textarea.value);
    document.getElementById("bulkPreview").textContent = rows.length ? `${rows.length} row(s) recognized.` : textarea.value.trim() ? "No valid rows recognized yet." : "";
  };
  textarea.addEventListener("input", preview);
  document.getElementById("bulkFile").addEventListener("change", e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let text = String(reader.result || "");
      if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1); // strip BOM
      textarea.value = text;
      preview();
      toast(`Loaded ${file.name}.`);
    };
    reader.onerror = () => toast("Couldn't read that file.");
    reader.readAsText(file);
  });
}
/** Parses one CSV field-list respecting double-quoted fields (which may contain commas). */
function parseCsvLine(line) {
  const out = [];
  let cur = "", inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQuotes = false; }
      else cur += c;
    } else if (c === '"') inQuotes = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
function parseBulkRows(text) {
  return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean).map(line => {
    return line.includes("\t") ? line.split("\t").map(c => c.trim()) : parseCsvLine(line);
  }).filter(cols => cols.length >= 7 && Number(cols[0]));
}
async function submitBulkAdd() {
  if (!S.db) return toast("No shared database in this view.");
  const rows = parseBulkRows(document.getElementById("bulkPaste").value);
  if (!rows.length) return toast("No valid rows found.");
  let added = 0;
  for (const cols of rows) {
    const [code, propid, date, desc, loc, officer, cost, residual, life] = cols;
    const info = accountInfo(Number(code));
    const c = round2(Number(cost) || 0);
    if (c <= 0) continue;
    await S.db.collection("assets").add({
      account_code: Number(code), account_name: info.name, ad_account_code: Number(code) + 1,
      dep_exp_account_code: info.expCode, dep_exp_account_name: info.expName,
      property_id: propid || "", date_acquired: date || null, description: desc || "",
      location: loc || "", accountable_officer: officer || "", remarks: "",
      cost: c, residual_value: round2(Number(residual) || c * 0.05), useful_life_years: Number(life) || 0,
      depreciable: !!info.depreciable, status: "active", accum_depr_baseline: 0,
      source_sheet: "Bulk import", updated_by: viewerLabel(), updated_at: new Date().toISOString(),
    });
    added++;
  }
  toast(`${added} asset(s) added.`);
  closeModal();
}

/* ============================================================
   RENDER: Monthly Depreciation
   ============================================================ */
function periodOptionsForDepreciation() {
  const opts = [];
  const next = nextUnpostedPeriod();
  for (let p = addMonths(BASELINE_PERIOD, 1); cmpPeriod(p, next) <= 0; p = addMonths(p, 1)) opts.push(p);
  return opts;
}
function renderDepreciation() {
  const el = document.getElementById("view-depreciation");
  if (!S.ready) { el.innerHTML = loadingBlock(); return; }
  const opts = periodOptionsForDepreciation();
  if (!S.depPeriod || !opts.includes(S.depPeriod)) S.depPeriod = opts[opts.length - 1];
  const period = S.depPeriod;
  const isPosted = S.postings.has(period);
  const jev = jevForPeriod(period);
  const recon = isPosted ? { ok: true } : costReconciliationStatus(period);

  // per-asset preview rows
  const assetRows = depreciableActiveAssets().map(a => ({
    asset: a,
    amount: isPosted ? (S.postings.get(period).amounts[a.id] || 0) : previewAmountFor(a, period),
  })).filter(r => r.amount > 0 || isPosted).sort((a, b) => b.amount - a.amount);

  el.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <label style="margin:0;">Period</label>
        <select id="depPeriodSel">${opts.map(p => `<option value="${p}" ${p === period ? "selected" : ""}>${periodLabel(p)}${S.postings.has(p) ? " (posted)" : p === nextUnpostedPeriod() ? " (next due)" : ""}</option>`).join("")}</select>
        <span style="flex:1"></span>
        ${isPosted
          ? `<span class="pill good">Posted ${jev.postedAt ? "• " + new Date(jev.postedAt).toLocaleDateString() : ""}${jev.postedBy ? " by " + esc(jev.postedBy) : ""}</span>
             ${period === lastPostedPeriod() ? `<button class="btn danger" onclick="undoPosting('${period}')">Undo posting</button>` : ""}`
          : `<button class="btn primary" onclick="postPeriod('${period}')" ${assetRows.length && recon.ok ? "" : "disabled"} title="${recon.ok ? "" : "Upload/confirm a Trial Balance that ties out on PPE cost accounts first — see the Reconciliation tab"}">Post ${periodLabel(period)} depreciation</button>`}
      </div>
      <div class="panel-body">
        ${!isPosted && !recon.ok ? `
          <div class="banner ${recon.reason === "no-tb" ? "warn" : "bad"}">
            <span>⚠</span>
            <span>${recon.reason === "no-tb"
              ? "Posting is on hold: no Trial Balance has been uploaded yet for this period or earlier. Go to <b>Reconciliation</b> and save a Trial Balance so PPE cost accounts can be checked first."
              : `Posting is on hold: ${recon.flagged.length} PPE cost account(s) don't tie out to the Trial Balance for ${periodLabel(recon.tbPeriod)}. Fix or re-upload the Trial Balance in <b>Reconciliation</b>, then come back here.`}</span>
          </div>` : ""}
        <div class="cardrow" style="margin-bottom:0;">
          <div class="card"><div class="label">Assets depreciating</div><div class="value">${assetRows.length}</div></div>
          <div class="card"><div class="label">Total depreciation</div><div class="value">${fmtMoney(jev.total)}</div></div>
          <div class="card"><div class="label">Status</div><div class="value" style="font-size:16px;">${isPosted ? '<span class="pill good">Posted</span>' : '<span class="pill warn">Preview — not posted</span>'}</div></div>
        </div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div><h3>JEV summary — ${periodLabel(period)}</h3><div class="desc">Journal entry voucher grouping, ready to hand off for posting to your books</div></div>
        <div style="display:flex;gap:8px;">
          <button class="btn" onclick="exportJevCsv('${period}')">Export CSV</button>
          <button class="btn" onclick="window.print()">Print</button>
        </div>
      </div>
      <div class="panel-body flush"><div class="tablewrap"><table>
        <thead><tr><th>Dr — Account</th><th class="num">Debit</th><th>Cr — Account</th><th class="num">Credit</th></tr></thead>
        <tbody>${jev.lines.length ? jev.lines.map(l => `
          <tr><td class="mono">${l.expCode}<br><span style="font-family:'Public Sans'">${esc(l.expName)}</span></td>
              <td class="num mono">${fmtMoney(l.amount)}</td>
              <td class="mono">${l.adCode}<br><span style="font-family:'Public Sans'">${esc(l.adName)}</span></td>
              <td class="num mono">${fmtMoney(l.amount)}</td></tr>`).join("")
          : `<tr><td colspan="4"><div class="empty">No depreciation to record this period.</div></td></tr>`}
        </tbody>
        ${jev.lines.length ? `<tfoot><tr style="font-weight:700;"><td>Total</td><td class="num mono">${fmtMoney(jev.total)}</td><td></td><td class="num mono">${fmtMoney(jev.total)}</td></tr></tfoot>` : ""}
      </table></div></div>
    </div>

    <div class="panel">
      <div class="panel-head"><h3>Per-asset detail</h3>
        <button class="btn" onclick="exportDepreciationDetailCsv('${period}')">Download CSV</button>
      </div>
      <div class="panel-body flush"><div class="tablewrap"><table>
        <thead><tr><th>Property ID</th><th>Category</th><th class="num">Monthly Rate</th><th class="num">This period</th><th class="num">Accum. Depr. after</th><th class="num">Carrying after</th></tr></thead>
        <tbody>${assetRows.length ? assetRows.map(r => {
          const before = accumDeprAsOf(r.asset, addMonths(period, -1));
          const after = round2(before + r.amount);
          return `<tr><td class="mono">${esc(r.asset.property_id) || "—"}</td><td>${esc(r.asset.account_name)}</td>
            <td class="num mono">${fmtMoney(monthlyRate(r.asset))}</td>
            <td class="num mono">${fmtMoney(r.amount)}</td>
            <td class="num mono">${fmtMoney(after)}</td>
            <td class="num mono">${fmtMoney(round2(r.asset.cost - after))}</td></tr>`;
        }).join("") : `<tr><td colspan="6"><div class="empty">Nothing to show.</div></td></tr>`}</tbody>
      </table></div></div>
    </div>
  `;
  document.getElementById("depPeriodSel").addEventListener("change", e => { S.depPeriod = e.target.value; renderDepreciation(); });
}

async function postPeriod(period) {
  if (!S.db) return toast("No shared database in this view.");
  if (S.postings.has(period)) return toast("Already posted.");
  const recon = costReconciliationStatus(period);
  if (!recon.ok) return toast(recon.reason === "no-tb"
    ? "Upload a Trial Balance in Reconciliation before posting."
    : "PPE cost accounts don't tie out to the Trial Balance yet — fix that in Reconciliation first.");
  const amounts = {};
  const totalsByAccount = {};
  depreciableActiveAssets().forEach(a => {
    const amt = previewAmountFor(a, period);
    if (amt > 0) { amounts[a.id] = amt; totalsByAccount[a.account_code] = round2((totalsByAccount[a.account_code] || 0) + amt); }
  });
  if (!Object.keys(amounts).length) return toast("Nothing to post for this period.");
  if (!confirm(`Post depreciation for ${periodLabel(period)}? Total ${fmtMoney(Object.values(amounts).reduce((s, v) => s + v, 0))} across ${Object.keys(amounts).length} assets.`)) return;
  await S.db.collection("postings").doc(period).set({
    period, amounts, totalsByAccount, postedAt: new Date().toISOString(), postedBy: viewerLabel(),
  });
  toast("Posted " + periodLabel(period) + ".");
}
async function undoPosting(period) {
  if (!S.db) return;
  if (!confirm(`Undo the ${periodLabel(period)} posting? This cannot be redone automatically.`)) return;
  await S.db.collection("postings").doc(period).delete();
  toast("Posting undone.");
}
function exportJevCsv(period) {
  const jev = jevForPeriod(period);
  const rows = [["Debit Account Code", "Debit Account", "Debit Amount", "Credit Account Code", "Credit Account", "Credit Amount"]];
  jev.lines.forEach(l => rows.push([l.expCode, l.expName, l.amount.toFixed(2), l.adCode, l.adName, l.amount.toFixed(2)]));
  rows.push(["", "TOTAL", jev.total.toFixed(2), "", "TOTAL", jev.total.toFixed(2)]);
  const csv = rows.map(r => r.map(csvField).join(",")).join("\n");
  browserDownload(`JEV_Depreciation_${period}.csv`, csv, "text/csv;charset=utf-8;");
  toast("Saved.");
}
function exportDepreciationDetailCsv(period) {
  const isPosted = S.postings.has(period);
  const assetRows = depreciableActiveAssets().map(a => ({
    asset: a,
    amount: isPosted ? (S.postings.get(period).amounts[a.id] || 0) : previewAmountFor(a, period),
  })).filter(r => r.amount > 0 || isPosted).sort((a, b) => b.amount - a.amount);
  const rows = [["Property ID", "Category", "Description", "Monthly Rate", "This Period", "Accum. Depr. After", "Carrying After"]];
  assetRows.forEach(r => {
    const before = accumDeprAsOf(r.asset, addMonths(period, -1));
    const after = round2(before + r.amount);
    rows.push([r.asset.property_id || "", r.asset.account_name || "", r.asset.description || "",
      monthlyRate(r.asset).toFixed(2), r.amount.toFixed(2), after.toFixed(2), round2(r.asset.cost - after).toFixed(2)]);
  });
  const csv = rows.map(r => r.map(csvField).join(",")).join("\n");
  browserDownload(`Depreciation_Detail_${period}.csv`, csv, "text/csv;charset=utf-8;");
  toast("Saved.");
}

/* ============================================================
   RENDER: Reconciliation
   ============================================================ */
function renderReconciliation() {
  const el = document.getElementById("view-reconciliation");
  if (!S.ready) { el.innerHTML = loadingBlock(); return; }
  if (!S.reconPeriod) {
    const tbPeriods = [...S.tbSnapshots.keys()].sort(cmpPeriod);
    S.reconPeriod = tbPeriods.length ? tbPeriods[tbPeriods.length - 1] : BASELINE_PERIOD;
  }
  const period = S.reconPeriod;
  const tb = S.tbSnapshots.get(period);
  const rows = computeReconciliation(period);
  const flaggedCount = rows.filter(r => r.hasTb && !r.ok).length;
  const otherPeriods = [...S.tbSnapshots.keys()].sort(cmpPeriod);

  el.innerHTML = `
    <div class="panel">
      <div class="toolbar">
        <label style="margin:0;">Period</label>
        <input type="month" id="reconPeriodInput" value="${period}">
        ${otherPeriods.length ? `<select id="reconQuick"><option value="">Previously entered…</option>${otherPeriods.map(p => `<option value="${p}" ${p === period ? "selected" : ""}>${periodLabel(p)}</option>`).join("")}</select>` : ""}
        <span style="flex:1"></span>
        ${tb ? `<span class="subtle" style="font-size:12px;">Entered ${tb.enteredBy ? "by " + esc(tb.enteredBy) + " " : ""}${tb.enteredAt ? new Date(tb.enteredAt).toLocaleDateString() : ""}</span>` : ""}
      </div>
      <div class="panel-body">
        <p class="subtle" style="margin-top:0;">Paste your Trial Balance export for this period below — the same columns your accounting system exports: <span class="mono">Account Code, Account Name, Debit, Credit</span> (tab or comma separated). Only PPE cost and accumulated-depreciation accounts are used; everything else is ignored.</p>
        <div class="fieldrow" style="align-items:flex-end;margin-bottom:10px;">
          <div class="field" style="flex:1;">
            <label>Or upload the Trial Balance from an Excel file (.xlsx / .xls / .csv)</label>
            <input type="file" id="tbFile" accept=".xlsx,.xls,.csv">
          </div>
        </div>
        <textarea id="tbPaste" rows="6" placeholder="10705020&#9;Office Equipment&#9;2063166.50&#9;0&#10;10705021&#9;Accumulated Depreciation - Office Equipment&#9;0&#9;756648.50">${tb ? Object.entries(tb.accounts).map(([code, v]) => `${code}\t${v.name}\t${v.debit}\t${v.credit}`).join("\n") : (S.reconDraft || "")}</textarea>
        <div style="margin-top:10px;"><button class="btn primary" onclick="saveTbSnapshot()">Save &amp; compare</button></div>
      </div>
    </div>

    <div class="panel">
      <div class="panel-head">
        <div><h3>Variance — ${periodLabel(period)}</h3><div class="desc">${tb ? (flaggedCount ? flaggedCount + " account(s) need a look" : "Everything ties out") : "Paste a Trial Balance above to compare"}</div></div>
        ${tb ? `<button class="btn" onclick="exportReconCsv('${period}')">Export CSV</button>` : ""}
      </div>
      <div class="panel-body flush"><div class="tablewrap"><table>
        <thead><tr><th>Account</th><th class="num">Cost — Register</th><th class="num">Cost — TB</th><th class="num">Variance</th>
          <th class="num">Accum. Depr. — Register</th><th class="num">Accum. Depr. — TB</th><th class="num">Variance</th><th>Status</th></tr></thead>
        <tbody>${rows.map(r => `
          <tr>
            <td class="mono">${r.code}<br><span style="font-family:'Public Sans'">${esc(r.name)}</span></td>
            <td class="num mono">${fmtMoney(r.regCost)}</td>
            <td class="num mono">${r.tbCost == null ? '<span class="subtle">—</span>' : fmtMoney(r.tbCost)}</td>
            <td class="num mono">${r.varCost == null ? "—" : fmtMoney(r.varCost)}</td>
            <td class="num mono">${accountInfo(r.code).depreciable ? fmtMoney(r.regAD) : '<span class="subtle">n/a</span>'}</td>
            <td class="num mono">${r.tbAD == null ? '<span class="subtle">—</span>' : fmtMoney(r.tbAD)}</td>
            <td class="num mono">${r.varAD == null ? "—" : fmtMoney(r.varAD)}</td>
            <td>${!r.hasTb ? '<span class="pill neutral">No TB</span>' : r.ok ? '<span class="pill good">OK</span>' : '<span class="pill bad">Check</span>'}</td>
          </tr>`).join("")}</tbody>
      </table></div></div>
    </div>
  `;
  document.getElementById("reconPeriodInput").addEventListener("change", e => { if (e.target.value) { S.reconPeriod = e.target.value; renderReconciliation(); } });
  const q = document.getElementById("reconQuick");
  if (q) q.addEventListener("change", e => { if (e.target.value) { S.reconPeriod = e.target.value; renderReconciliation(); } });
  document.getElementById("tbFile").addEventListener("change", e => handleTbFileUpload(e.target));
  document.getElementById("tbPaste").addEventListener("input", e => { S.reconDraft = e.target.value; });
}

function parseTbLines(text) {
  const accounts = {};
  text.split("\n").map(l => l.trim()).filter(Boolean).forEach(line => {
    const cols = line.includes("\t") ? line.split("\t") : line.split(",");
    if (cols.length < 4) return;
    const code = Number(String(cols[0]).replace(/[^\d.]/g, ""));
    if (!code) return;
    const name = (cols[1] || "").trim();
    const debit = Number(String(cols[2]).replace(/[, ]/g, "")) || 0;
    const credit = Number(String(cols[3]).replace(/[, ]/g, "")) || 0;
    accounts[code] = { name, debit, credit };
  });
  return accounts;
}
async function saveTbSnapshot() {
  if (!S.db) return toast("No shared database in this view.");
  const period = document.getElementById("reconPeriodInput").value || S.reconPeriod;
  const text = document.getElementById("tbPaste").value;
  const accounts = parseTbLines(text);
  if (!Object.keys(accounts).length) return toast("Couldn't find any valid rows.");
  await S.db.collection("tb_snapshots").doc(period).set({
    period, accounts, source: "Pasted in app", enteredBy: viewerLabel(), enteredAt: new Date().toISOString(),
  });
  S.reconPeriod = period;
  S.reconDraft = "";
  toast("Trial Balance saved — comparing now.");
}
function handleTbFileUpload(inputEl) {
  const file = inputEl.files && inputEl.files[0];
  if (!file) return;
  if (typeof XLSX === "undefined") {
    toast("Couldn't load the Excel reader — check your internet connection and try again.");
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: "" });
      const lines = rows
        .map(r => (r || []).slice(0, 4).map(v => (v == null ? "" : String(v).trim())))
        .filter(r => r.some(v => v !== "") && /\d/.test(r[0] || ""))
        .map(r => r.join("\t"));
      if (!lines.length) { toast("Couldn't find any account rows in that file."); return; }
      S.reconDraft = lines.join("\n");
      document.getElementById("tbPaste").value = S.reconDraft;
      toast(`Loaded ${lines.length} row(s) from "${file.name}" — review below, then Save & compare.`);
    } catch (err) {
      console.error(err);
      toast("Couldn't read that file — make sure it's a Trial Balance export (.xlsx, .xls, or .csv).");
    } finally {
      inputEl.value = "";
    }
  };
  reader.onerror = () => toast("Couldn't read that file.");
  reader.readAsArrayBuffer(file);
}

function exportReconCsv(period) {
  const rows = computeReconciliation(period);
  const out = [["Account Code", "Account Name", "Cost (Register)", "Cost (TB)", "Cost Variance", "Accum Depr (Register)", "Accum Depr (TB)", "AD Variance", "Status"]];
  rows.forEach(r => out.push([r.code, r.name, r.regCost.toFixed(2), r.tbCost == null ? "" : r.tbCost.toFixed(2), r.varCost == null ? "" : r.varCost.toFixed(2),
    accountInfo(r.code).depreciable ? r.regAD.toFixed(2) : "", r.tbAD == null ? "" : r.tbAD.toFixed(2), r.varAD == null ? "" : r.varAD.toFixed(2), r.hasTb ? (r.ok ? "OK" : "CHECK") : "NO TB"]));
  const csv = out.map(r => r.map(csvField).join(",")).join("\n");
  browserDownload(`Reconciliation_${period}.csv`, csv, "text/csv;charset=utf-8;");
  toast("Saved.");
}

/* ============================================================
   RENDER: Retired Assets
   ============================================================ */
function renderRetired() {
  const el = document.getElementById("view-retired");
  if (!S.ready) { el.innerHTML = loadingBlock(); return; }
  const rows = [...S.assets.values()].filter(a => a.status === "retired")
    .sort((a, b) => (a.account_name || "").localeCompare(b.account_name));
  el.innerHTML = `
    <div class="panel">
      <div class="panel-head"><div><h3>Retired / derecognized assets</h3><div class="desc">${rows.length} item(s) — kept for history, excluded from active depreciation and reconciliation totals</div></div>
        <button class="btn" onclick="exportRetiredCsv()">Download CSV</button>
      </div>
      <div class="panel-body flush"><div class="tablewrap"><table>
        <thead><tr><th>Property ID</th><th>Category</th><th>Description</th><th>Location</th><th class="num">Cost</th><th class="num">Accum. Depr. (frozen)</th><th>Remarks</th></tr></thead>
        <tbody>${rows.length ? rows.map(a => `
          <tr class="clickable" onclick="openAssetDetail('${a.id}')">
            <td class="mono">${esc(a.property_id) || "—"}</td>
            <td>${esc(a.account_name)}</td>
            <td class="truncate" title="${esc(a.description)}">${esc(a.description) || "—"}</td>
            <td class="truncate">${esc(a.location) || "—"}</td>
            <td class="num mono">${fmtMoney(a.cost)}</td>
            <td class="num mono">${fmtMoney(a.accum_depr_baseline)}</td>
            <td class="truncate" title="${esc(a.remarks)}">${esc(a.remarks) || "—"}</td>
          </tr>`).join("") : `<tr><td colspan="7"><div class="empty">No retired assets.</div></td></tr>`}
        </tbody>
      </table></div></div>
    </div>
  `;
}
function exportRetiredCsv() {
  const rows = [...S.assets.values()].filter(a => a.status === "retired")
    .sort((a, b) => (a.account_name || "").localeCompare(b.account_name));
  const out = [["Property ID", "Category", "Description", "Location", "Cost", "Accum. Depr. (frozen)", "Retired Date", "Remarks"]];
  rows.forEach(a => out.push([a.property_id || "", a.account_name || "", a.description || "", a.location || "",
    (a.cost || 0).toFixed(2), (a.accum_depr_baseline || 0).toFixed(2), a.retired_date || "", a.remarks || ""]));
  const csv = out.map(r => r.map(csvField).join(",")).join("\n");
  browserDownload(`Retired_Assets_${new Date().toISOString().slice(0, 10)}.csv`, csv, "text/csv;charset=utf-8;");
  toast("Saved.");
}

/* ============================================================
   RENDER: shared shell
   ============================================================ */
function renderAll() {
  renderPeriodStatus();
  renderDashboard();
  renderRegister();
  renderDepreciation();
  renderReconciliation();
  renderRetired();
}
function renderPeriodStatus() {
  const last = lastPostedPeriod();
  document.getElementById("periodStatus").textContent =
    "Baseline " + periodShort(BASELINE_PERIOD) + (last ? " • Posted through " + periodShort(last) : " • No postings yet");
}
function setView(v) {
  S.view = v;
  document.querySelectorAll("#nav button").forEach(b => b.classList.toggle("active", b.dataset.view === v));
  document.querySelectorAll(".view").forEach(el => el.classList.toggle("active", el.id === "view-" + v));
  const titles = {
    dashboard: ["Dashboard", "Straight-line PPE depreciation • General Fund"],
    register: ["Asset Register", "Property card for every PPE item — cost, residual value, useful life"],
    depreciation: ["Monthly Depreciation", "Compute, post, and generate the JEV summary for a period"],
    reconciliation: ["Reconciliation", "Compare the register against your Trial Balance, by account code"],
    retired: ["Retired Assets", "Derecognized / disposed items kept for historical reference"],
  };
  document.getElementById("viewTitle").textContent = titles[v][0];
  document.getElementById("viewSubtitle").textContent = titles[v][1];
}

/* ---------- modal helpers ---------- */
function openModal(html) {
  document.getElementById("modalRoot").innerHTML = html;
  document.getElementById("modalOverlay").classList.add("open");
}
function closeModal() { document.getElementById("modalOverlay").classList.remove("open"); }

/* ---------- static UI wiring (nav buttons, modal overlay) — bound once ---------- */
let staticUiBound = false;
function bindStaticUI() {
  if (staticUiBound) return;
  staticUiBound = true;
  document.querySelectorAll("#nav button").forEach(b => b.addEventListener("click", () => setView(b.dataset.view)));
  const overlay = document.getElementById("modalOverlay");
  if (overlay) overlay.addEventListener("click", e => { if (e.target.id === "modalOverlay") closeModal(); });
}

/* ---------- entry point, called by js/main.js once Firebase Auth confirms a signed-in user ---------- */
export function initApp(user) {
  S.currentUser = user;
  const emailEl = document.getElementById("authEmail");
  if (emailEl) emailEl.textContent = viewerLabel();
  bindStaticUI();
  setView(S.view);
  initDb();
  renderAll();
}

/* ---------- expose functions referenced from inline onclick="" handlers in rendered HTML ----------
   (ES module top-level declarations are NOT added to `window` automatically, unlike classic scripts,
   so anything called from an inline event handler attribute must be attached explicitly.) */
Object.assign(window, {
  setView, openBulkAddModal, openAssetModal, openAssetDetail, closeModal,
  retireAsset, saveAsset, submitBulkAdd, postPeriod, undoPosting,
  exportJevCsv, exportReconCsv, saveTbSnapshot,
  openRevalueModal, revalueAsset,
  exportRegisterCsv, exportRetiredCsv, exportDepreciationDetailCsv,
  handleTbFileUpload,
});
