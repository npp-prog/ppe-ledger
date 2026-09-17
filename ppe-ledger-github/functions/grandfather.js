// ============================================================================
// One-time (but safely re-runnable) migration for the Google Sign-In
// pending-approval gate — see the big comment atop firestore.rules for the
// full story of what this gate does and why it exists.
//
// Marks every email currently registered in Firebase Authentication as
// approved:true in user_roles, merged onto whatever doc (if any) already
// exists for them, so nobody who was already using the app before this gate
// shipped gets locked out the moment the new firestore.rules are published.
//
// SEQUENCING — this MUST be run (via the "Run grandfather migration" button
// an Admin can add to the Users & Roles tab, or by calling it once from the
// browser console while signed in as an Admin) BEFORE the updated
// firestore.rules are published. Publishing the new rules first would
// immediately deny access to every Google-signed-in user without an
// approved:true doc, including staff actively using the app.
//
// Safe to re-run: it skips any doc that's already a genuine, undecided
// pending request (pending:true && approved:false) rather than blindly
// approving it — a real access request an Admin hasn't acted on yet should
// stay in that state, not get silently auto-approved by a later re-run of
// this migration. It also merges rather than replaces, so it never touches
// is_admin/tabs/active on an existing role doc.
// ============================================================================
'use strict';

const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');
const { requireAdmin } = require('./lib/roles');

function db() { return admin.firestore(); }

exports.grandfatherExistingUsers = onCall(async (request) => {
  await requireAdmin(db(), request.auth, HttpsError);

  let grandfathered = 0, skippedPending = 0, alreadyApproved = 0, noEmail = 0;
  let pageToken;
  do {
    const page = await admin.auth().listUsers(1000, pageToken);
    for (const authUser of page.users) {
      const email = (authUser.email || "").toLowerCase();
      if (!email) { noEmail++; continue; } // no email on this account — nothing to key a role doc on
      const ref = db().collection("user_roles").doc(email);
      const snap = await ref.get();
      const existing = snap.exists ? snap.data() : null;
      if (existing && existing.pending === true && existing.approved === false) { skippedPending++; continue; }
      if (existing && existing.approved === true) { alreadyApproved++; continue; }
      await ref.set({
        approved: true, grandfathered: true, grandfathered_at: new Date().toISOString(),
      }, { merge: true });
      grandfathered++;
    }
    pageToken = page.pageToken;
  } while (pageToken);

  return { ok: true, grandfathered, skippedPending, alreadyApproved, noEmail };
});
