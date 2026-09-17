// ============================================================================
// Pure calculation helpers — ported from js/app.js. These take explicit
// arguments only (no global/cached state), so unlike the reconciliation
// helpers in lib/reconciliation.js, these are close to verbatim copies of
// their client-side namesakes rather than adaptations.
// ============================================================================
'use strict';

const BASELINE_PERIOD = "2025-12"; // must match js/app.js's BASELINE_PERIOD

const ROAD_ACCOUNT_CODES = [10703010];
const OTHER_INFRA_ACCOUNT_CODES = [10703020, 10703030, 10703040, 10703050, 10703060, 10703070, 10703080, 10703090, 10703990];
const ZERO_RESIDUAL_ACCOUNT_CODES = [...ROAD_ACCOUNT_CODES, ...OTHER_INFRA_ACCOUNT_CODES];
const CIP_ACCOUNT_CODES = [10710010, 10710020, 10710030];

function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
function cmpPeriod(a, b) { return a < b ? -1 : a > b ? 1 : 0; }
function addMonths(p, n) {
  // Verbatim copy of js/app.js's addMonths() — do not "simplify" this; a naive rewrite of the
  // negative-modulo handling here is exactly the kind of off-by-one that would silently corrupt
  // which period a posting or reconciliation check lands on.
  let [y, m] = p.split("-").map(Number);
  m += n;
  y += Math.floor((m - 1) / 12);
  m = ((m - 1) % 12 + 12) % 12 + 1;
  return y + "-" + String(m).padStart(2, "0");
}
function fundDocId(fund, period) { return fund === "GF" ? period : `${fund}__${period}`; }
function isZeroResidualAccount(code) { return ZERO_RESIDUAL_ACCOUNT_CODES.includes(Number(code)); }
function defaultResidualFor(code, cost) { return isZeroResidualAccount(code) ? 0 : round2((Number(cost) || 0) * 0.05); }
function isCipAccount(code) { return CIP_ACCOUNT_CODES.includes(Number(code)); }

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
function accountCodeAsOf(asset, period) {
  const changes = asset && asset.account_changes;
  if (!changes || !changes.length) return asset ? asset.account_code : null;
  const sorted = [...changes].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let code = sorted[0].old_code;
  sorted.forEach(c => { if ((c.date || "").slice(0, 7) <= period) code = c.new_code; });
  return code;
}
function fundAsOf(asset, period) {
  const changes = asset && asset.fund_changes;
  if (!changes || !changes.length) return asset ? (asset.fund || "GF") : null;
  const sorted = [...changes].sort((a, b) => (a.date || "").localeCompare(b.date || ""));
  let fund = sorted[0].old_fund;
  sorted.forEach(c => { if ((c.date || "").slice(0, 7) <= period) fund = c.new_fund; });
  return fund;
}
function cipBillingTotal(b) {
  return round2((Number(b.by_contract) || 0) + (Number(b.admin_materials) || 0) + (Number(b.admin_labor) || 0) +
    (Number(b.admin_overhead) || 0) + (Number(b.admin_consultancy) || 0) + (Number(b.admin_others) || 0) +
    (Number(b.transfers_adjustments) || 0));
}
function cipProjectTotal(p) { return round2((p.billings || []).reduce((s, b) => s + cipBillingTotal(b), 0)); }

module.exports = {
  BASELINE_PERIOD, ZERO_RESIDUAL_ACCOUNT_CODES, CIP_ACCOUNT_CODES,
  round2, cmpPeriod, addMonths, fundDocId, isZeroResidualAccount, defaultResidualFor, isCipAccount,
  monthlyRate, acquiredMonth, accountCodeAsOf, fundAsOf, cipBillingTotal, cipProjectTotal,
};
