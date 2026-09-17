# Cloud Functions migration — proposal (NOT built, opt-in)

Status: **proposal only**, per your instruction not to build this until you
confirm. Nothing in this document has been implemented — no `functions/`
directory, no code, no `firebase.json` functions block. This exists so you
have something concrete to react to before any of it gets written.

**Honesty note on "mirroring candoni-accounting":** I don't have access to
that repo or its `firestore.rules`/Functions code anywhere in this session —
it was referenced in your brief but never shared or attached. Everything
below is my own design, built from first principles and from what's
actually in `js/app.js` today, not a literal copy of that project's
pattern. If you can share candoni-accounting's actual rules/Functions files,
I'll revise this to genuinely match its conventions (naming, folder layout,
helper structure) rather than just approximating the idea of "callable
functions + role checks + audit log."

## Why do this at all

Today, every write — creating an asset, retiring one, posting a
depreciation period — goes straight from the signed-in user's browser to
Firestore, governed only by security rules. Security rules can validate a
document's *shape* (this update's `cost` isn't negative, this field exists)
but they can't easily express richer business logic (e.g. "you may retire
an item you have Edit access to, but posting a period requires a role that
Edit-on-Register alone doesn't imply," or "an audit log entry MUST exist
for every asset mutation, and a client can't just skip writing it").
Moving the sensitive operations into callable Cloud Functions means:

- The Admin SDK (server-side) writes to Firestore, which is **not** subject
  to security rules at all — so the function itself is the single place
  authorization and validation live, instead of being split between rules
  and client-side JS.
- An audit log entry can be written **in the same function call**, as part
  of the same operation, so it's structurally impossible for a client to
  save an asset edit without also logging it (today's client-side
  `logAudit()` call in `js/app.js` is best-effort — a modified or buggy
  client could skip it entirely, or write a false entry).
- Role checks move server-side, where a client can't inspect or bypass the
  check by editing JS in devtools.

## Scope — what would move, what wouldn't (first pass)

**Move to callable functions:**
- `createAsset` / `updateAsset` — today's `saveAsset()` in `js/app.js`
- `retireAsset` — today's `submitRetire()`
- `reactivateAsset` — today's `reviveAsset()`
- `deleteRetiredAsset` — today's `deleteRetiredAsset()`
- `postDepreciationPeriod` — today's `postPeriod()`

**Leave as direct client writes, for now:** everything else (CIP billings,
PAR/ICS, PTR/ITR, SWA, History of Repair, Transfer/Revalue, Trial Balance
snapshots). These are lower-stakes and higher-volume/more-varied in shape —
moving all of them at once would be a much bigger rewrite for less
immediate benefit. They could migrate in later phases using the same
pattern once it's proven on the five functions above.

## Proposed shape of one function (illustrative, not final code)

```
exports.retireAsset = onCall(async (request) => {
  const { assetId, reason, detail, reference, date } = request.data;
  const email = (request.auth?.token?.email || "").toLowerCase();
  if (!email) throw new HttpsError("unauthenticated", "Sign in required.");

  const roleDoc = await db.doc(`user_roles/${email}`).get();
  if (!canEditTab(roleDoc, "register")) {
    throw new HttpsError("permission-denied", "No edit access to the Asset Register.");
  }
  if (!reason || !detail) {
    throw new HttpsError("invalid-argument", "Reason and detail are required.");
  }

  const assetRef = db.doc(`assets/${assetId}`);
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(assetRef);
    if (!snap.exists) throw new HttpsError("not-found", "Item not found.");
    tx.update(assetRef, {
      status: "retired", retired_at: date, retired_by: email,
      retire_reason: reason, retire_detail: detail, retire_reference: reference || "",
    });
    tx.create(db.collection("auditLog").doc(), {
      action: "asset_retire", target_type: "asset", target_id: assetId,
      details: { reason, detail, reference }, by_email: email, at: new Date().toISOString(),
    });
  });
  return { ok: true };
});
```

`canEditTab()` would read the same `user_roles` document shape the app
already uses (`is_admin`, `tabs.<tabKey>` = `"edit" | "view" | "none"`),
just evaluated server-side instead of client-side — so the actual
permission MODEL doesn't change, only where it's enforced.

## Rollout, so this stays reversible at every step

1. Deploy the functions alongside the existing direct-write code path —
   don't touch `js/app.js` yet. Nothing changes for users.
2. Point `js/app.js`'s `saveAsset`/`submitRetire`/etc. at the callable
   functions instead of `S.db.collection(...).update()`, one function at a
   time, each as its own small, revertable change.
3. Only once a given operation has been running through its Cloud Function
   for a while with no issues, tighten `firestore.rules` for that
   collection from "any signed-in+active user" down to "server-side
   (Admin SDK) writes only, client reads only" — e.g.
   `allow write: if false;` on `assets` once `createAsset`/`updateAsset`/
   `retireAsset`/`reactivateAsset`/`deleteRetiredAsset` fully cover every
   client mutation path against that collection. Doing this before every
   code path is migrated would break the app, so this step waits until the
   last one lands.
4. Each phase above is its own commit/deploy, independently revertible —
   at no point does this require one big-bang rewrite.

## Costs and practical notes

- Cloud Functions requires the Blaze (pay-as-you-go) plan — you're already
  on it for Firebase Storage, so this doesn't add a new billing tier, just
  usage on one already-enabled plan.
- Cold starts: for a low-traffic single-office government tool, an
  occasional 1-2s delay on the first call after idle is a reasonable
  trade-off for the security benefit; can be mitigated later with a
  minimum-instance setting if it's ever a real annoyance.
- Testing: the existing Playwright test harness (mock `firebase.js`) would
  need a parallel mock for whichever functions are called, or a real test
  pass against the Firebase Emulator Suite's Functions + Firestore
  emulators together — a bigger testing lift than this project's tests
  have needed so far, worth budgeting for.

## What I need from you to move forward

- Confirmation you want this built at all (vs. staying with the tightened
  rules from step 2 indefinitely).
- If you have candoni-accounting's actual code, sharing it so this can
  genuinely mirror its patterns instead of approximating them.
- Which of the five functions above to build first, if you'd rather phase
  it rather than do all five at once.
