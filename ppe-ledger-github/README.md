# PPE Ledger — MGO Candoni

A shared web tool for straight-line depreciation, monthly posting, and Trial
Balance reconciliation of Property, Plant & Equipment (PPE) — built for the
Municipal Government Office of Candoni, General Fund.

It covers every PPE category (land, infrastructure, buildings, machinery &
equipment, transportation, furniture, construction-in-progress, biological
assets, and intangibles), and gives your team:

- **Asset Register** — one property card per item: cost, 5% residual value,
  useful life, accountable officer, PAR/DV reference, how it was acquired
  (purchased, found at the station, or donated), plus a photo, a QR
  identification tag, and a scanned document (e.g. the PAR).
- **Transfer history** — record a change in location and/or accountable
  officer/custodian for any asset; every transfer is kept on record and
  shows up on the Property Card and Equipment Ledger Card.
- **Construction in Progress (CIP)** — a separate section for tracking
  in-progress construction projects (multiple contractor billings each,
  by contract and by administration) apart from the finished-asset
  register, with a printable Construction in Progress Ledger Card and a
  one-click "Complete → transfer to PPE" action once a project finishes.
- **Monthly Depreciation** — automatically computes straight-line
  depreciation for every active asset, lets you post a period, and generates
  a ready-to-book **JEV summary** (grouped by expense/accumulated-depreciation
  account pairs) that you can export as CSV or print.
- **Reconciliation** — paste in your Trial Balance for any period and the
  app flags any PPE account where the register doesn't tie out, down to the
  peso — including the 3 CIP account codes, which keep reconciling even
  after CIP moved out of the Asset Register into its own section.
- **Retired Assets** — a history of derecognized/disposed items, excluded
  from ongoing depreciation.

This version is a standalone app you host yourself on **GitHub Pages**, backed
by your own **Firebase** project (Firestore for the shared database,
Firebase Authentication so only your team can sign in). Nothing here depends
on Claude or any Anthropic service to run.

---

## How it's built

- Plain HTML/CSS/JS — no build step, no framework, no bundler.
- `js/firebase.js` talks to Firebase (Auth + Firestore) via the official
  Firebase JS SDK, loaded straight from Google's CDN as ES modules.
- `js/app.js` is all the actual PPE/depreciation/reconciliation logic — it's
  the same engine originally built as a Claude Artifact, ported to talk to
  Firestore directly instead of Claude's `db` capability.
- Everyone who signs in shares the same Firestore data in real time — add an
  asset from one browser and it appears for everyone else within a second or
  two, no refresh needed.

You do not need to know JavaScript to deploy this — just follow the steps
below. They take about 20–30 minutes the first time.

---

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com/> and sign in with a Google
   account (a free/no-cost "Spark" plan is enough for an office team of this
   size).
2. Click **Add project**, give it a name (e.g. `mgo-candoni-ppe`), and finish
   the wizard (Google Analytics is optional — you can turn it off).

## 2. Turn on Firestore (the shared database)

1. In the left sidebar, go to **Build → Firestore Database**.
2. Click **Create database**.
3. Choose **Production mode** (not "test mode" — we'll set our own rules
   below).
4. Pick a location close to the Philippines (e.g. `asia-southeast1`) and
   click **Enable**.

### Set the security rules

1. Still in Firestore, go to the **Rules** tab.
2. Replace the contents with what's in [`firestore.rules`](./firestore.rules)
   in this repo:

   ```
   rules_version = '2';
   service cloud.firestore {
     match /databases/{database}/documents {
       match /{document=**} {
         allow read, write: if request.auth != null;
       }
     }
   }
   ```
3. Click **Publish**.

This means: anyone signed in (via the accounts you create in step 3) can
read and write the shared PPE data; nobody signed out can see or touch
anything.

## 3. Turn on Authentication (sign-in)

1. Go to **Build → Authentication → Get started**.
2. Under **Sign-in method**, enable:
   - **Email/Password** — turn it on and save.
   - **Google** (optional, but convenient) — turn it on, pick a support
     email, and save.
3. Go to the **Users** tab and click **Add user** for each staff member who
   needs access — just an email and a temporary password. Share that
   temporary password with them directly (not over email, if you can help
   it) and have them change it later using the **Forgot password?** link on
   the sign-in screen, or manage it yourself from this same Users tab.

There's no self-service sign-up screen in this app on purpose — accounts are
created by whoever administers the Firebase project, so access stays limited
to your office.

## 4. Turn on Storage (photos, QR tags, and documents)

Asset photos and attached documents (like a scanned PAR) are stored in
**Firebase Storage**, a companion service to Firestore for files rather than
data records. QR tags are generated on the fly in the browser and aren't
stored anywhere.

> **This is the one step in this whole setup that isn't free.** Firestore
> and Authentication both run on Firebase's free "Spark" plan, but Storage
> requires upgrading to the pay-as-you-go **"Blaze"** plan. For an office
> register's worth of photos and scanned documents, real-world cost is
> typically a few cents to a few dollars a month (Firebase gives you a free
> allowance of storage and downloads before any charge kicks in) — but it
> does require a billing method on file, unlike every other step in this
> guide. If you'd rather skip this for now, the rest of the app works fine
> without it — the photo/document/QR fields on an asset just won't have
> anywhere to upload to until this step is done.

1. In the left sidebar, go to **Build → Storage → Get started**, or (if
   prompted) **Upgrade project → Blaze (Pay as you go)** first, then come
   back to Storage.
2. Pick the same location you chose for Firestore, and click **Done**.
3. Go to the **Rules** tab and replace the contents with what's in
   [`storage.rules`](./storage.rules) in this repo — the same "any signed-in
   user may read/write" policy as Firestore, with a 20 MB per-file cap.
4. Click **Publish**.
5. Optional: **Project settings → Usage and billing → Details & settings**
   lets you set a budget alert (e.g. notify me if this project spends more
   than $5 in a month) so an unexpectedly large bill can't sneak up on you.

## 5. Register a Web App and get your config

1. Go to **Project settings** (the gear icon, top left) → scroll to
   **Your apps** → click the **</>** (web) icon.
2. Give it a nickname (e.g. "PPE Ledger web"), skip Firebase Hosting (we're
   using GitHub Pages instead), and click **Register app**.
3. You'll see a code block that looks like this:

   ```js
   const firebaseConfig = {
     apiKey: "AIza...",
     authDomain: "mgo-candoni-ppe.firebaseapp.com",
     projectId: "mgo-candoni-ppe",
     storageBucket: "mgo-candoni-ppe.appspot.com",
     messagingSenderId: "...",
     appId: "..."
   };
   ```
4. Open [`js/firebase-config.js`](./js/firebase-config.js) in this repo and
   replace the placeholder values with these exact values.

   > **These values are not secret.** Firebase's client config is meant to
   > be public — it just tells the SDK which project to talk to. Access
   > control comes from Authentication (step 3) and the Firestore rules
   > (step 2), not from hiding this file. It's fine to commit it, even to a
   > public GitHub repo.

## 6. Seed the baseline data (one-time)

This repo ships with `data/seed_assets.json` (the full PPE register as of
the December 2025 baseline) and `data/seed_tb_2025-12.json` (that same
period's Trial Balance, for the Reconciliation view). The `scripts/seed.mjs`
script loads both into your new Firestore project in one go.

1. Install Node.js 18+ if you don't have it: <https://nodejs.org/>.
2. In this repo's folder, install the one dependency the seed script needs:

   ```sh
   npm install
   ```
3. Download a **service account key** (this is different from the web config
   above — it's a private admin credential, used only for this one-time
   import, never by the browser app):
   - **Project settings → Service accounts → Generate new private key.**
   - Save the downloaded `.json` file somewhere **outside this repo** (e.g.
     your Downloads folder) — it must never be committed to Git. This
     repo's `.gitignore` already excludes common names for it as a
     safety net, but the safest thing is to keep it outside the folder
     entirely.
4. Run the seed script, pointing it at that key:

   ```sh
   node scripts/seed.mjs /path/to/the-downloaded-key.json
   ```
5. You should see it report seeding 245 assets and the December 2025 Trial
   Balance. Once it's done, **delete the downloaded key file** — you won't
   need it again unless you want to re-seed from scratch.

### If Firebase won't let you generate a key

If step 3 above shows **"Key creation is not allowed on this service
account. Please check if service account key creation is restricted by
organization policies"** — this happens on Firebase projects created under
a Google Workspace / Google Cloud organization (e.g. a government or
company Google account) whose admins have disabled service account key
downloads as a security policy. It's not something you did wrong, and you
have two ways around it:

- **Easiest — use the alternate seed script**, which signs in as one of
  your app's own user accounts (from step 3 in [Turn on
  Authentication](#3-turn-on-authentication-sign-in)) instead of an admin
  key:

  ```sh
  node scripts/seed-client.mjs
  ```
  It will ask for the email and password of one of those accounts, then
  seed the same data the same way. No service account, no organization
  policy involved.

- **Or** ask whoever administers your Google Workspace / Cloud
  organization to grant an exception to the `iam.disableServiceAccountKeyCreation`
  organization policy for this project (Google Cloud Console → IAM & Admin
  → Organization Policies), then retry step 3 above.

## 7. Push this repo to GitHub and turn on Pages

1. Create a new repository on GitHub (public or private — either works with
   GitHub Pages, though private repos need GitHub Pages to be available on
   your plan).
2. Push this folder's contents to it:

   ```sh
   git init
   git add .
   git commit -m "Initial PPE Ledger app"
   git branch -M main
   git remote add origin https://github.com/<your-org>/<your-repo>.git
   git push -u origin main
   ```
3. In the GitHub repo, go to **Settings → Pages**.
4. Under **Build and deployment → Source**, choose **GitHub Actions**.
5. The workflow in [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml)
   runs automatically on every push to `main` and publishes the site. Check
   the **Actions** tab for progress; when it finishes, **Settings → Pages**
   will show your live URL (something like
   `https://<your-org>.github.io/<your-repo>/`).

## 8. Sign in and go

Open the published URL, sign in with one of the accounts you created in step
3, and you're in. Everyone on the team who has an account shares the same
live data.

---

## Adding more team members later

Firebase Console → Authentication → Users → **Add user**. No redeploy
needed — they can sign in with their new account right away.

## Updating the app later

Edit the files in this repo (or ask Claude to make changes for you) and push
to `main` — the GitHub Actions workflow redeploys automatically within a
minute or two.

## If something looks wrong

- **"Database unavailable" / sign-in spins forever**: double-check the
  values in `js/firebase-config.js` match your Firebase project exactly
  (Project settings → General → Your apps).
- **"Missing or insufficient permissions"**: the Firestore rules (step 2)
  haven't been published yet, or the signed-in account doesn't exist in
  Authentication → Users.
- **Data looks empty after seeding**: re-check the seed script's output for
  errors, and confirm you're looking at the same Firebase project (it's
  easy to create a second project by accident while clicking through the
  console).

## A note on cost

Firestore and Firebase Authentication both have a generous free tier (the
"Spark" plan) — for an office team of a few dozen people doing normal daily
use, this app should stay within it indefinitely. GitHub Pages hosting is
free for public repositories. **Storage** (step 4, for photos/documents) is
the one exception — it requires the "Blaze" pay-as-you-go plan, though
typical usage for an office asset register runs a few cents to a few
dollars a month; see step 4 for a budget-alert option.
