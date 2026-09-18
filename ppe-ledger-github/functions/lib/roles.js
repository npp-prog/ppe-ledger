// ============================================================================
// Server-side port of js/app.js's role/tab-access model (isHardcodedAdmin,
// isAdmin, tabAccess, hasTabAccess, canEdit — see lines ~248-436 of js/app.js
// as of the Sept 2026 Cloud Functions migration).
//
// IMPORTANT: this duplicates the client's authorization logic, it does not
// share code with it (same caveat as lib/accountCatalog.js — no shared
// module system between the browser bundle and this Functions codebase).
// If HARDCODED_ADMIN_EMAILS, EDITABLE_TABS/VIEW_ONLY_TABS, or the tabAccess()
// defaulting behavior in js/app.js ever change, this file needs the matching
// change made here too.
//
// Unlike the client, which reads S.userRoles from an in-memory cache kept in
// sync by a live Firestore listener, every function here takes a Firestore
// Admin instance (or an already-fetched role doc) explicitly and reads
// on demand — a Cloud Function invocation has no such cache and each
// invocation is a fresh, independent call.
// ============================================================================
'use strict';

// Must match js/app.js's HARDCODED_ADMIN_EMAILS exactly.
const HARDCODED_ADMIN_EMAILS = ["npp@mgocandoniaccounting.org"];

// Must match js/app.js's EDITABLE_TABS / VIEW_ONLY_TABS exactly.
const EDITABLE_TABS = ["register", "depreciation", "reconciliation", "cip", "parics", "ptritr", "swa", "hor", "retired"];
const VIEW_ONLY_TABS = ["dashboard", "reports"];
const ALL_PERMISSION_TABS = [...EDITABLE_TABS, ...VIEW_ONLY_TABS];
// Must match js/app.js's HIDDEN_BY_DEFAULT_TABS exactly — these three start fully hidden, not just
// view-only, for anyone without an explicit tabs entry (Sept 2026).
const HIDDEN_BY_DEFAULT_TABS = ["swa", "cip", "retired"];

function isHardcodedAdmin(email) {
  return HARDCODED_ADMIN_EMAILS.some(e => e.toLowerCase() === (email || "").toLowerCase());
}

/** Fetches the caller's user_roles doc (or null if none exists) and returns
 *  { email, role } where `email` is the lowercased email used as the doc's
 *  key. `db` is a Firestore Admin instance (admin.firestore()). */
async function loadRoleForEmail(db, email) {
  const emailLower = (email || "").toLowerCase();
  if (!emailLower) return { email: emailLower, role: null };
  const snap = await db.collection("user_roles").doc(emailLower).get();
  return { email: emailLower, role: snap.exists ? snap.data() : null };
}

/** True if this email is an Admin — hardcoded, or `is_admin: true` on their
 *  own user_roles doc. Mirrors js/app.js's isAdmin(), but takes the already-
 *  fetched role doc (from loadRoleForEmail) instead of reading S.userRoles. */
function isAdmin(email, role) {
  if (isHardcodedAdmin(email)) return true;
  return !!(role && role.is_admin);
}

/** True if this email's user_roles doc marks them inactive (active === false).
 *  Absence of a doc, or a doc that omits `active`, defaults to active — this
 *  mirrors the opt-in restriction model used throughout (see firestore.rules'
 *  isActive() and js/app.js's tabAccess()): shipping a gate never silently
 *  locks out staff who haven't been given an explicit role/status yet. */
function isActive(role) {
  if (!role) return true;
  return role.active !== false;
}

/** Returns "edit" | "view" | "none" for `tabKey`, given the caller's email
 *  and already-fetched role doc. Verbatim port of js/app.js's tabAccess() —
 *  default-deny-edit as of Sept 2026: no role doc, or a role doc that omits
 *  this tab key, now means "view" (or "none" for HIDDEN_BY_DEFAULT_TABS),
 *  not "edit". Keep in sync with app.js. */
function tabAccess(email, role, tabKey) {
  if (isAdmin(email, role)) return "edit";
  const fallback = HIDDEN_BY_DEFAULT_TABS.includes(tabKey) ? "none" : "view";
  if (!role) return fallback;
  const level = role.tabs && role.tabs[tabKey];
  if (level === "none" || level === "view" || level === "edit") return level;
  return fallback;
}
function hasTabAccess(email, role, tabKey) { return tabAccess(email, role, tabKey) !== "none"; }
function canEdit(email, role, tabKey) { return tabAccess(email, role, tabKey) === "edit"; }

/** Callable-function guard: throws an HttpsError (via the `HttpsError` ctor
 *  passed in, since firebase-functions is not a dependency of this pure-
 *  logic file) if the request isn't signed in, is inactive, or lacks Edit
 *  access to `tabKey`. Returns { email, role } on success so callers don't
 *  need to re-fetch. `context`/`request.auth` is the `auth` object onCall
 *  handlers receive (has `.token.email`). */
async function requireEditAccess(db, auth, tabKey, HttpsError) {
  if (!auth || !auth.token || !auth.token.email) {
    throw new HttpsError("unauthenticated", "You must be signed in to do this.");
  }
  const email = (auth.token.email || "").toLowerCase();
  const { role } = await loadRoleForEmail(db, email);
  if (!isActive(role)) {
    throw new HttpsError("permission-denied", "Your account has been marked inactive. Contact your Admin.");
  }
  if (!canEdit(email, role, tabKey)) {
    throw new HttpsError("permission-denied", "View-only access — ask your Admin for Edit access to make changes here.");
  }
  return { email, role };
}

/** Callable-function guard for Admin-only actions that aren't about a specific tab (e.g. the
 *  grandfather migration) — throws unless the caller is an Admin (hardcoded, or is_admin:true on
 *  their own role doc). Unlike requireEditAccess(), does not check isActive()/tabAccess() since
 *  there's no tab involved; an Admin is an Admin regardless of per-tab settings. */
async function requireAdmin(db, auth, HttpsError) {
  if (!auth || !auth.token || !auth.token.email) {
    throw new HttpsError("unauthenticated", "You must be signed in to do this.");
  }
  const email = (auth.token.email || "").toLowerCase();
  const { role } = await loadRoleForEmail(db, email);
  if (!isAdmin(email, role)) {
    throw new HttpsError("permission-denied", "Admins only.");
  }
  return { email, role };
}

module.exports = {
  HARDCODED_ADMIN_EMAILS, EDITABLE_TABS, VIEW_ONLY_TABS, ALL_PERMISSION_TABS, HIDDEN_BY_DEFAULT_TABS,
  isHardcodedAdmin, loadRoleForEmail, isAdmin, isActive, tabAccess, hasTabAccess, canEdit,
  requireEditAccess, requireAdmin,
};
