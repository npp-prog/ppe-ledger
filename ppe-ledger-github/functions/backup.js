// ============================================================================
// Daily backup — Firestore data + Storage files (photos, PAR/ICS scans, etc.).
// Requested Sept 2026 as a safety net "in case of uncertainties" separate from
// anything the app itself does. Runs on its own every night, no one needs to
// remember to click anything.
//
// What it does, every night at 2:00 AM (Asia/Manila):
//   1. Reads every Firestore collection the app uses and writes the whole
//      thing out as one JSON file.
//   2. Copies every file currently in Firebase Storage into a dated folder
//      (backups/<date>/storage/...) in the SAME bucket — a server-side copy,
//      so it doesn't download/re-upload the actual bytes through this
//      function, it just tells Cloud Storage to duplicate the object.
//   3. Saves that same Firestore JSON into backups/<date>/firestore-export.json
//      too, so the dated folder is a complete, self-contained snapshot.
//   4. Emails a short summary to npp@mgocandoniaccounting.org, with the
//      Firestore JSON attached directly when it's small enough to email
//      (photos/documents are usually too large for that, so those are just
//      reported by count/size — they're safely in Storage under backups/,
//      downloadable any time from Firebase Console -> Storage).
//
// This is purely ADDITIVE — it only reads the live collections/files and
// writes into a brand-new "backups/" prefix. It never edits, deletes, or
// truncates anything the app itself uses.
//
// ONE THING WORTH KNOWING: nothing here ever deletes an old backup, so the
// backups/ folder in Storage will keep growing forever and slowly add to
// your Cloud Storage bill. If that ever matters, the fix is a Storage
// "Lifecycle rule" (Cloud Console -> Storage -> your bucket -> Lifecycle) set
// to auto-delete anything under backups/ older than however many days you
// want to keep — a Console setting, not a code change, so it's not included
// here; ask if you'd like the exact steps.
//
// SETUP REQUIRED BEFORE THIS CAN DEPLOY (see the delivery message for the
// full walkthrough):
//   1. Turn on 2-Step Verification on npp@mgocandoniaccounting.org (if not
//      already on), then generate a Google "App Password" for Mail.
//   2. From the ppe-ledger-github folder: `firebase functions:secrets:set
//      GMAIL_APP_PASSWORD` and paste that App Password when prompted.
//   3. `firebase deploy --only functions:dailyBackup`
// ============================================================================
'use strict';

const { onSchedule } = require('firebase-functions/v2/scheduler');
const { defineSecret } = require('firebase-functions/params');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

const GMAIL_APP_PASSWORD = defineSecret('GMAIL_APP_PASSWORD');

// Sends to itself — simplest possible setup (one account, one App Password). Change both the "to"
// and "from" below (and re-run functions:secrets:set for whichever account should send it) if a
// different address should receive or send these emails later.
const BACKUP_EMAIL = 'npp@mgocandoniaccounting.org';

// A Firestore JSON attachment above this size is skipped (still saved in Storage either way) —
// keeps this comfortably under Gmail's ~25MB attachment limit with room for the email itself.
const MAX_EMAIL_ATTACHMENT_MB = 15;

function db() { return admin.firestore(); }
function bucket() { return admin.storage().bucket(); }

// Every collection the app actually reads/writes today (mirrors firestore.rules) — add a new name
// here if a new collection is ever introduced, or it silently won't be included in the backup.
const COLLECTIONS = [
  'assets', 'postings', 'tb_snapshots', 'cip_projects', 'par_ics', 'ptr_itr',
  'swa_records', 'history_of_repair', 'user_roles', 'auditLog',
];

async function exportFirestoreJson() {
  const out = {};
  for (const name of COLLECTIONS) {
    const snap = await db().collection(name).get();
    out[name] = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  }
  return out;
}

/** Server-side copies every existing Storage file into backups/<date>/storage/<original path>,
 *  skipping anything already under backups/ so a backup never backs up an earlier backup.
 *
 *  Copies CONCURRENCY_LIMIT files at a time instead of one at a time — the first real run of this
 *  function took long enough copying 73 files sequentially (one round trip, then a second round
 *  trip for its size, per file) that it blew past the function's default 60-second timeout and got
 *  marked "Failed" by Cloud Scheduler, even though the copy itself finished fine moments later.
 *  Running a batch of files in parallel cuts that wall-clock time roughly by the batch size, so this
 *  keeps working comfortably as the number of files grows, alongside the longer timeout set below. */
const CONCURRENCY_LIMIT = 10;

async function copyOneFile(file, dateStr) {
  await file.copy(bucket().file(`backups/${dateStr}/storage/${file.name}`));
  const [meta] = await file.getMetadata();
  return Number(meta.size || 0);
}

async function copyStorageFilesToBackup(dateStr) {
  const [allFiles] = await bucket().getFiles();
  const files = allFiles.filter(f => !f.name.startsWith('backups/'));
  const skipped = allFiles.length - files.length;
  let copied = 0, totalBytes = 0;

  for (let i = 0; i < files.length; i += CONCURRENCY_LIMIT) {
    const batch = files.slice(i, i + CONCURRENCY_LIMIT);
    const results = await Promise.allSettled(batch.map(f => copyOneFile(f, dateStr)));
    results.forEach((r, idx) => {
      if (r.status === 'fulfilled') {
        copied++;
        totalBytes += r.value;
      } else {
        console.error(`dailyBackup: failed to copy ${batch[idx].name}:`, r.reason);
      }
    });
  }
  return { copied, totalBytes, skipped };
}

exports.dailyBackup = onSchedule({
  schedule: 'every day 02:00',
  timeZone: 'Asia/Manila',
  secrets: [GMAIL_APP_PASSWORD],
  // The default timeout (60s) is nowhere near enough for exporting every collection, copying every
  // Storage file, and sending the email — the first real run took several minutes and got marked
  // "Failed" by Cloud Scheduler purely from hitting that default, even though the backup itself
  // completed correctly moments later. 540s (9 minutes) gives real headroom above that; bumping
  // memory a bit too, since building the full Firestore JSON export in memory grows with the data.
  timeoutSeconds: 540,
  memory: '512MiB',
}, async () => {
  const dateStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const firestoreData = await exportFirestoreJson();
  const jsonBuffer = Buffer.from(JSON.stringify(firestoreData, null, 2), 'utf8');

  // Save the Firestore export itself alongside the Storage copy, so backups/<date>/ is one
  // complete, self-contained snapshot of everything as of that night.
  await bucket().file(`backups/${dateStr}/firestore-export.json`).save(jsonBuffer, {
    contentType: 'application/json',
  });

  const { copied, totalBytes, skipped } = await copyStorageFilesToBackup(dateStr);

  const counts = Object.fromEntries(Object.entries(firestoreData).map(([k, v]) => [k, v.length]));
  const totalMB = (totalBytes / (1024 * 1024)).toFixed(1);
  const attachSizeMB = jsonBuffer.length / (1024 * 1024);
  const canAttach = attachSizeMB <= MAX_EMAIL_ATTACHMENT_MB;

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: BACKUP_EMAIL, pass: GMAIL_APP_PASSWORD.value() },
  });

  const summaryLines = Object.entries(counts).map(([k, n]) => `  ${k}: ${n} document(s)`).join('\n');
  await transporter.sendMail({
    from: BACKUP_EMAIL,
    to: BACKUP_EMAIL,
    subject: `PPE Ledger daily backup — ${dateStr}`,
    text: `Daily backup completed for ${dateStr}.

Firestore data:
${summaryLines}

Storage files (photos/PAR/ICS documents): ${copied} file(s) copied, ~${totalMB} MB total` +
      (skipped ? `, ${skipped} earlier-backup file(s) skipped` : '') + `.

Everything is saved in Cloud Storage under backups/${dateStr}/ (Firebase Console -> Storage), and
stays there even if something in the live app changes later.
` + (canAttach
        ? "Today's Firestore data export is attached to this email directly, too."
        : `(The Firestore data export was ${attachSizeMB.toFixed(1)} MB — too large to attach directly. Download it from backups/${dateStr}/firestore-export.json in Storage instead.)`),
    attachments: canAttach ? [{ filename: `firestore-export-${dateStr}.json`, content: jsonBuffer }] : [],
  });

  console.log(`dailyBackup complete for ${dateStr}: storage copied=${copied} skipped=${skipped} totalMB=${totalMB} firestoreCounts=${JSON.stringify(counts)}`);
});
