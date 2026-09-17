// ============================================================================
// Server-side auditLog writer — Admin SDK equivalent of js/app.js's
// logAudit() (see lines ~373-397), but designed to be called INSIDE the same
// Firestore transaction as the mutation it describes, so the audit entry and
// the asset write succeed or fail together atomically (an improvement over
// the client's best-effort/non-blocking version, now that this can run
// server-side with a transaction available).
//
// Collection shape is unchanged from the client's interim version — same
// field names — so existing auditLog documents and the (currently absent)
// Users & Roles / any future audit-log viewer UI keep working without
// modification:
//   { action, target_type, target_id, details, fund, by, by_email, at }
// ============================================================================
'use strict';

/** Writes one auditLog entry as part of `transaction` (a Firestore
 *  Transaction from db.runTransaction()). `db` is the Admin Firestore
 *  instance (used only to build the new doc ref — the actual write goes
 *  through `transaction.set()` so it's part of the atomic commit).
 *  `actor` is { email, displayName } for the "by"/"by_email" fields —
 *  callable functions get this from `context.auth.token` (email, name). */
function writeAuditLogInTransaction(transaction, db, { action, targetType, targetId, details, fund, actor }) {
  const ref = db.collection("auditLog").doc();
  transaction.set(ref, {
    action,
    target_type: targetType,
    target_id: targetId,
    details: details || {},
    fund: fund || null,
    by: (actor && (actor.displayName || actor.email)) || "Unnamed",
    by_email: (actor && (actor.email || "")).toLowerCase(),
    at: new Date().toISOString(),
  });
  return ref;
}

/** Non-transactional variant (best-effort, matches the client's original
 *  semantics) for call sites that don't already have an open transaction —
 *  none of the migrated functions in this codebase should need this, since
 *  every mutation here is written to go through runTransaction(), but it's
 *  kept available for anything added later that doesn't need transactional
 *  atomicity with the audit entry. */
async function writeAuditLog(db, { action, targetType, targetId, details, fund, actor }) {
  await db.collection("auditLog").add({
    action,
    target_type: targetType,
    target_id: targetId,
    details: details || {},
    fund: fund || null,
    by: (actor && (actor.displayName || actor.email)) || "Unnamed",
    by_email: (actor && (actor.email || "")).toLowerCase(),
    at: new Date().toISOString(),
  });
}

module.exports = { writeAuditLogInTransaction, writeAuditLog };
