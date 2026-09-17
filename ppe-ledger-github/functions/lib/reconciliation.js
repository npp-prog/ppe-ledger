// ============================================================================
// Server-side adaptations of js/app.js's reconciliation/depreciation-gate
// logic. These mirror (by name and behavior) the client functions of the
// same name — activeAssets, distinctCostAccounts, registryCostFor,
// registryADFor, computeReconciliation, costReconciliationStatus,
// previewAmountFor — but take pre-fetched arrays as explicit parameters
// instead of reading the client's live `S` cache, since a Cloud Function
// has no such cache and must query Firestore itself via the Admin SDK.
//
// IMPORTANT: if the client-side versions of these functions in js/app.js
// ever change (a new reconciliation rule, a different gate condition), this
// file needs the same change made here too — there is no shared import
// between the browser bundle and this Functions codebase. Keep the two in
// sync by hand; this file's structure deliberately mirrors app.js's
// function names and order to make that comparison easy.
// ============================================================================
'use strict';

const { accountInfo, isSxAccount } = require('./accountCatalog');
const { round2, cmpPeriod, addMonths, BASELINE_PERIOD, accountCodeAsOf, fundAsOf, cipProjectTotal, monthlyRate, acquiredMonth } = require('./calc');

function activeAssets(assets, fund, period) {
  return assets.filter(a => a.status === "active" && (period ? fundAsOf(a, period) === fund : (a.fund || "GF") === fund));
}
function depreciableActiveAssets(assets, fund) {
  return activeAssets(assets, fund).filter(a => a.depreciable);
}
function activeCipProjects(cipProjects, fund) {
  return cipProjects.filter(p => (p.fund || "GF") === fund && p.status !== "completed");
}
function postedTotalThrough(postings, assetId, period) {
  let sum = 0;
  for (const doc of postings) {
    if (doc.amounts && doc.amounts[assetId] && cmpPeriod(doc.period, period) <= 0) sum += doc.amounts[assetId];
  }
  return sum;
}
function accumDeprAsOf(postings, asset, period) {
  if (cmpPeriod(period, BASELINE_PERIOD) <= 0) return round2(asset.accum_depr_baseline || 0);
  return round2((asset.accum_depr_baseline || 0) + postedTotalThrough(postings, asset.id, period));
}
function distinctCostAccounts(assets, cipProjects, fund, period) {
  const map = new Map();
  activeAssets(assets, fund, period).forEach(a => {
    const code = period ? accountCodeAsOf(a, period) : a.account_code;
    if (code && !map.has(code)) map.set(code, accountInfo(code).name);
  });
  activeCipProjects(cipProjects, fund).forEach(p => {
    if (p.account_code && !map.has(p.account_code)) map.set(p.account_code, p.account_name);
  });
  return [...map.entries()].sort((a, b) => a[0] - b[0]).map(([code, name]) => ({ code, name }));
}
function registryCostFor(assets, cipProjects, code, fund, period) {
  const assetCost = round2(activeAssets(assets, fund, period)
    .filter(a => (period ? accountCodeAsOf(a, period) : a.account_code) === code)
    .reduce((s, a) => s + (a.cost || 0), 0));
  const cipCost = round2(activeCipProjects(cipProjects, fund)
    .filter(p => p.account_code === code)
    .reduce((s, p) => s + cipProjectTotal(p), 0));
  return round2(assetCost + cipCost);
}
function registryADFor(assets, postings, code, period, fund) {
  return round2(activeAssets(assets, fund, period)
    .filter(a => accountCodeAsOf(a, period) === code && a.depreciable)
    .reduce((s, a) => s + accumDeprAsOf(postings, a, period), 0));
}
function computeReconciliation(assets, cipProjects, postings, tbSnapshot, fund, period) {
  const accounts = tbSnapshot ? tbSnapshot.accounts : null;
  return distinctCostAccounts(assets, cipProjects, fund, period).map(({ code, name }) => {
    const adCode = code + 1;
    const regCost = registryCostFor(assets, cipProjects, code, fund, period);
    const regAD = registryADFor(assets, postings, code, period, fund);
    const tbCost = accounts && accounts[code] ? Number(accounts[code].debit || 0) : null;
    const tbAD = accounts && accounts[adCode] ? Number(accounts[adCode].credit || 0) : null;
    const varCost = tbCost == null ? null : round2(regCost - tbCost);
    const varAD = tbAD == null ? null : round2(regAD - tbAD);
    const adOk = !accountInfo(code).depreciable || (tbAD != null ? Math.abs(varAD) < 1 : Math.abs(regAD) < 1);
    const ok = tbCost != null && Math.abs(varCost) < 1 && adOk;
    return { code, name, adCode, regCost, regAD, tbCost, tbAD, varCost, varAD, ok, hasTb: !!accounts };
  });
}
/** `tbSnapshotForRequiredPeriod` is the tb_snapshots doc (or null) for `addMonths(period, -1)` —
 *  the caller fetches it (there's exactly one relevant doc, no need to fetch the whole collection). */
function costReconciliationStatus(assets, cipProjects, postings, tbSnapshotForRequiredPeriod, fund, period) {
  const requiredPeriod = addMonths(period, -1);
  if (!tbSnapshotForRequiredPeriod) return { ok: false, reason: "no-tb", tbPeriod: null, requiredPeriod, flagged: [] };
  const distinct = distinctCostAccounts(assets, cipProjects, fund, requiredPeriod);
  const rows = computeReconciliation(assets, cipProjects, postings, tbSnapshotForRequiredPeriod, fund, requiredPeriod)
    .filter(r => distinct.some(c => c.code === r.code) && !isSxAccount(r.code));
  const flagged = rows.filter(r => r.tbCost == null || Math.abs(r.varCost) >= 1);
  return { ok: flagged.length === 0, reason: flagged.length ? "variance" : null, tbPeriod: requiredPeriod, requiredPeriod, flagged };
}
/** Depreciation amount that would post for `period` for this asset — verbatim logic from
 *  js/app.js's previewAmountFor(), adapted to take `postings` as an explicit array. */
function previewAmountFor(postings, asset, period) {
  if (asset.status !== "active" || !asset.depreciable) return 0;
  if (cmpPeriod(period, BASELINE_PERIOD) <= 0) return 0;
  const am = acquiredMonth(asset);
  if (am && cmpPeriod(period, am) <= 0) return 0;
  const rate = monthlyRate(asset);
  if (rate <= 0) return 0;
  const alreadyBefore = round2((asset.accum_depr_baseline || 0) + postedTotalThrough(postings, asset.id, addMonths(period, -1)));
  const depreciableBase = (asset.cost || 0) - (asset.residual_value || 0);
  const remaining = round2(depreciableBase - alreadyBefore);
  if (remaining <= 0.004) return 0;
  return round2(Math.min(rate, remaining));
}

module.exports = {
  activeAssets, depreciableActiveAssets, activeCipProjects, postedTotalThrough, accumDeprAsOf,
  distinctCostAccounts, registryCostFor, registryADFor, computeReconciliation, costReconciliationStatus,
  previewAmountFor,
};
