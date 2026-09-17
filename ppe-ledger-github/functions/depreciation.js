// ============================================================================
// Callable Cloud Function for posting a depreciation period — server-side
// port of js/app.js's postPeriod() (lines ~2298-2319), using the reconciliation
// engine ported to lib/reconciliation.js.
//
// SCOPE NOTE: only postPeriod() moves in this phase (per
// CLOUD_FUNCTIONS_PROPOSAL.md's scope list). undoPosting() — the reverse
// operation — is NOT included here; it stays a direct client write for now.
// It wasn't part of what was proposed/confirmed, and undoing a posting is a
// straightforward single-document delete with none of postPeriod()'s
// business-logic gate, so it doesn't carry the same risk that motivated
// moving posting itself server-side. It can migrate in a later, equally
// small, independently reviewable step if wanted.
//
// This function fetches the full assets/cip_projects/postings collections
// on every call rather than relying on a client-side cache (a Cloud Function
// invocation has none). For this app's scale (a single municipality's PPE
// register — hundreds, not millions, of documents) that's a deliberate,
// acceptable simplicity trade-off; if the register grows enough for this to
// matter, these reads should be narrowed with fund-scoped queries.
// ============================================================================
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireEditAccess } = require('./lib/roles');
const { writeAuditLogInTransaction } = require('./lib/audit');
const { fundDocId, addMonths, round2 } = require('./lib/calc');
const { depreciableActiveAssets, previewAmountFor, costReconciliationStatus } = require('./lib/reconciliation');

function db() { return admin.firestore(); }

async function fetchAll(collectionName) {
  const snap = await db().collection(collectionName).get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

exports.postDepreciationPeriod = onCall(async (request) => {
  const { email } = await requireEditAccess(db(), request.auth, "depreciation", HttpsError);
  const { fund, period } = request.data || {};
  if (!fund || !period) throw new HttpsError("invalid-argument", "Missing fund or period.");

  const postingRef = db().collection("postings").doc(fundDocId(fund, period));
  const existing = await postingRef.get();
  if (existing.exists) throw new HttpsError("already-exists", "Already posted.");

  const [assets, cipProjects, postings] = await Promise.all([
    fetchAll("assets"), fetchAll("cip_projects"), fetchAll("postings"),
  ]);

  const requiredPeriod = addMonths(period, -1);
  const tbSnapshotSnap = await db().collection("tb_snapshots").doc(fundDocId(fund, requiredPeriod)).get();
  const tbSnapshot = tbSnapshotSnap.exists ? tbSnapshotSnap.data() : null;

  const recon = costReconciliationStatus(assets, cipProjects, postings, tbSnapshot, fund, period);
  if (!recon.ok) {
    const msg = recon.reason === "no-tb"
      ? `Save that period's Trial Balance in Reconciliation before posting this one.`
      : `PPE cost accounts don't tie out to the Trial Balance yet — fix that in Reconciliation first.`;
    throw new HttpsError("failed-precondition", msg);
  }

  const amounts = {};
  const totalsByAccount = {};
  depreciableActiveAssets(assets, fund).forEach(a => {
    const amt = previewAmountFor(postings, a, period);
    if (amt > 0) { amounts[a.id] = amt; totalsByAccount[a.account_code] = round2((totalsByAccount[a.account_code] || 0) + amt); }
  });
  if (!Object.keys(amounts).length) throw new HttpsError("failed-precondition", "Nothing to post for this period.");

  const total = round2(Object.values(amounts).reduce((s, v) => s + v, 0));
  const actorLabel = request.auth.token.name || email;

  await db().runTransaction(async (tx) => {
    // Re-check inside the transaction to close the race between the pre-check above and this
    // write (two callers posting the same fund/period at nearly the same moment).
    const snap = await tx.get(postingRef);
    if (snap.exists) throw new HttpsError("already-exists", "Already posted.");
    tx.set(postingRef, {
      period, fund, amounts, totalsByAccount, postedAt: new Date().toISOString(), postedBy: actorLabel,
    });
    writeAuditLogInTransaction(tx, db(), {
      action: "depreciation_post", targetType: "posting", targetId: fundDocId(fund, period),
      details: { period, fund, total, asset_count: Object.keys(amounts).length },
      fund,
      actor: { email, displayName: request.auth.token.name },
    });
  });

  return { ok: true, total, assetCount: Object.keys(amounts).length };
});
