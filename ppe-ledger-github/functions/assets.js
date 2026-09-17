// ============================================================================
// Callable Cloud Functions for asset (PPE + Semi-Expendable) mutations —
// server-side ports of js/app.js's saveAsset() [create/update halves],
// submitRetire(), reviveAsset(), and deleteRetiredAsset().
//
// SCOPE NOTE (Phase 1 of the migration — see CLOUD_FUNCTIONS_PROPOSAL.md):
// These functions expect `data` to already be the assembled asset record —
// the same shape saveAsset() builds client-side from the form (property_id,
// description, cost, account_code, etc.) — NOT raw DOM values. The plan is
// for js/app.js to keep building that object exactly as it does today and,
// in a later small commit, call these functions instead of writing to
// Firestore directly (Rollout step 2 in the proposal). Nothing here changes
// what the client sends, only who performs the write and the audit log.
//
// OUT OF SCOPE for Phase 1, deliberately: Storage (photo/document) uploads.
// Those go directly from the browser to Firebase Storage, which has its own
// security rules independent of Firestore — moving them through a callable
// function would mean streaming file bytes through the function, which is
// both unnecessary (Storage rules already gate that write) and a needless
// payload-size complication. The client still calls uploadFile()/deleteFile()
// itself and then patches photo_url/photo_path/document_* onto the asset doc
// the same way it does today; only the core record fields + status changes
// route through these functions.
//
// Also out of scope for Phase 1: the PAR/ICS "recorded" linkage side effect
// (marking a par_ics doc `recorded: true` when a new asset is added from a
// pending PAR/ICS record). That's a second, lower-stakes collection write —
// left as a direct client write for now, same as CIP/PAR-ICS/PTR-ITR/SWA/HOR
// generally (see the proposal's "Leave as direct client writes" list). If
// `data.linkParIcsId` is present, createAsset returns it back to the caller
// unchanged so the client can still perform that follow-up update itself.
// ============================================================================
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireEditAccess } = require('./lib/roles');
const { writeAuditLogInTransaction } = require('./lib/audit');

function db() { return admin.firestore(); }

/** Mirrors firestore.rules' assetCostValid()/assetResidualValid(): a present
 *  cost/residual_value must be a non-negative number. Kept in sync with the
 *  rules deliberately — this function is meant to make those rules provably
 *  redundant once assets' rules are tightened per the proposal's rollout
 *  step 3, so both layers reject the exact same shapes in the meantime. */
function assertValidCost(rec) {
  const checkField = (key) => {
    if (rec[key] === undefined || rec[key] === null) return;
    if (typeof rec[key] !== "number" || !isFinite(rec[key]) || rec[key] < 0) {
      throw new HttpsError("invalid-argument", `${key} must be a non-negative number.`);
    }
  };
  checkField("cost");
  checkField("residual_value");
}

/** Strips fields the client must never control directly — these are always
 *  set server-side from the verified auth token / server clock, mirroring
 *  how saveAsset() sets updated_by/updated_at from viewerLabel()/Date.now()
 *  rather than trusting anything the form itself could supply. */
function stripServerControlledFields(rec) {
  const clean = { ...rec };
  delete clean.updated_by; delete clean.updated_at;
  delete clean.status; // status transitions only happen via retire/reactivate, never a plain save
  delete clean.retired_at; delete clean.retired_by; delete clean.retire_reason; delete clean.retire_detail; delete clean.retire_reference;
  delete clean.reactivations;
  delete clean.source_sheet;
  return clean;
}

exports.createAsset = onCall(async (request) => {
  const { email, role } = await requireEditAccess(db(), request.auth, "register", HttpsError);
  const rec = stripServerControlledFields(request.data && request.data.rec);
  if (!rec) throw new HttpsError("invalid-argument", "Missing asset record.");
  assertValidCost(rec);
  if (!rec.item_type || !["ppe", "sx"].includes(rec.item_type)) {
    throw new HttpsError("invalid-argument", "item_type must be 'ppe' or 'sx'.");
  }
  if (rec.item_type === "ppe" && !(rec.cost > 0)) {
    throw new HttpsError("invalid-argument", "Enter a cost greater than zero.");
  }
  if (rec.item_type === "sx" && !rec.description) {
    throw new HttpsError("invalid-argument", "Enter a description.");
  }
  rec.status = "active";
  rec.source_sheet = "Added in app";
  rec.updated_by = (request.auth.token.name || email);
  rec.updated_at = new Date().toISOString();
  if (rec.item_type === "sx" && !rec.ledger_entries) { rec.ledger_entries = []; rec.transfers = []; }

  const ref = db().collection("assets").doc();
  const result = await db().runTransaction(async (tx) => {
    tx.set(ref, rec);
    writeAuditLogInTransaction(tx, db(), {
      action: "asset_create", targetType: "asset", targetId: ref.id,
      details: { property_id: rec.property_id || rec.sen || "", description: rec.description || "", account_name: rec.account_name || "", cost: rec.cost || 0, item_type: rec.item_type },
      fund: rec.fund || null,
      actor: { email, displayName: request.auth.token.name },
    });
    return { id: ref.id };
  });
  return { ok: true, id: result.id, linkParIcsId: (request.data && request.data.linkParIcsId) || null };
});

exports.updateAsset = onCall(async (request) => {
  const { email } = await requireEditAccess(db(), request.auth, "register", HttpsError);
  const assetId = request.data && request.data.assetId;
  const rec = stripServerControlledFields(request.data && request.data.rec);
  if (!assetId || !rec) throw new HttpsError("invalid-argument", "Missing assetId or asset record.");
  assertValidCost(rec);
  if (rec.item_type === "ppe" && rec.cost !== undefined && !(rec.cost > 0)) {
    throw new HttpsError("invalid-argument", "Enter a cost greater than zero.");
  }
  rec.updated_by = (request.auth.token.name || email);
  rec.updated_at = new Date().toISOString();

  const ref = db().collection("assets").doc(assetId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Item not found.");
    tx.update(ref, rec);
    writeAuditLogInTransaction(tx, db(), {
      action: "asset_update", targetType: "asset", targetId: assetId,
      details: { property_id: rec.property_id || rec.sen || "", description: rec.description || "", account_name: rec.account_name || "", cost: rec.cost || 0, item_type: rec.item_type },
      fund: rec.fund || null,
      actor: { email, displayName: request.auth.token.name },
    });
  });
  return { ok: true, id: assetId };
});

exports.retireAsset = onCall(async (request) => {
  const { email } = await requireEditAccess(db(), request.auth, "register", HttpsError);
  const { assetId, reason, detail, reference, date } = request.data || {};
  if (!assetId) throw new HttpsError("invalid-argument", "Missing assetId.");
  if (!reason) throw new HttpsError("invalid-argument", "Select a reason.");
  if (!detail) throw new HttpsError("invalid-argument", "Enter a detail explaining what happened.");
  const effectiveDate = date || new Date().toISOString().slice(0, 10);

  const ref = db().collection("assets").doc(assetId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Item not found.");
    const a = snap.data();
    tx.update(ref, {
      status: "retired", retired_at: effectiveDate + "T00:00:00.000Z", retired_by: (request.auth.token.name || email),
      retire_reason: reason, retire_detail: detail, retire_reference: reference || "",
    });
    writeAuditLogInTransaction(tx, db(), {
      action: "asset_retire", targetType: "asset", targetId: assetId,
      details: { property_id: a.property_id || a.sen || "", description: a.description || "", reason, detail, reference: reference || "" },
      fund: a.fund || null,
      actor: { email, displayName: request.auth.token.name },
    });
  });
  return { ok: true };
});

exports.reactivateAsset = onCall(async (request) => {
  const { email } = await requireEditAccess(db(), request.auth, "register", HttpsError);
  const { assetId, reason, date } = request.data || {};
  if (!assetId) throw new HttpsError("invalid-argument", "Missing assetId.");
  if (!reason) throw new HttpsError("invalid-argument", "Enter a reason for reactivating this item.");
  const effectiveDate = date || new Date().toISOString().slice(0, 10);
  const actorLabel = request.auth.token.name || email;

  const ref = db().collection("assets").doc(assetId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Item not found.");
    const a = snap.data();
    if (a.status !== "retired") throw new HttpsError("failed-precondition", "This item is not retired.");
    const entry = {
      date: effectiveDate, reason, by: actorLabel, at: new Date().toISOString(),
      previous_retired_at: a.retired_at || "", previous_retired_by: a.retired_by || "",
      previous_retire_reason: a.retire_reason || "", previous_retire_detail: a.retire_detail || "",
      previous_retire_reference: a.retire_reference || "",
    };
    tx.update(ref, {
      status: "active",
      retired_at: null, retired_by: null, retire_reason: null, retire_detail: null, retire_reference: null,
      reactivations: [...(a.reactivations || []), entry],
      updated_by: actorLabel, updated_at: new Date().toISOString(),
    });
    writeAuditLogInTransaction(tx, db(), {
      action: "asset_reactivate", targetType: "asset", targetId: assetId,
      details: { property_id: a.property_id || a.sen || "", description: a.description || "", reason, effective_date: effectiveDate },
      fund: a.fund || null,
      actor: { email, displayName: request.auth.token.name },
    });
  });
  return { ok: true };
});

exports.deleteRetiredAsset = onCall(async (request) => {
  // Note: gated on the "retired" tab, not "register" — matches the client's
  // canEdit("retired") gate on the Delete button in renderRetired(), which is
  // deliberately separate from Reactivate's "register" gate (see the comment
  // above openReviveModal() in js/app.js).
  const { email } = await requireEditAccess(db(), request.auth, "retired", HttpsError);
  const { assetId } = request.data || {};
  if (!assetId) throw new HttpsError("invalid-argument", "Missing assetId.");

  const ref = db().collection("assets").doc(assetId);
  await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new HttpsError("not-found", "Item not found.");
    const a = snap.data();
    if (a.status !== "retired") throw new HttpsError("failed-precondition", "Only retired items can be permanently deleted.");
    // Linked-record counts (History of Repair / PTR-ITR) are advisory only in the client's
    // confirm() prompt today, not enforced server-side — deleting still proceeds either way,
    // matching the existing client behavior exactly (those records just show "item removed").
    // Snapshot BEFORE deleting, same reasoning as the client: no doc left to read after.
    writeAuditLogInTransaction(tx, db(), {
      action: "asset_delete", targetType: "asset", targetId: assetId,
      details: { property_id: a.property_id || a.sen || "", description: a.description || "", account_name: a.account_name || "", cost: a.cost || 0, item_type: a.item_type || (a.sen ? "sx" : "ppe") },
      fund: a.fund || null,
      actor: { email, displayName: request.auth.token.name },
    });
    tx.delete(ref);
  });
  return { ok: true };
});
