#!/usr/bin/env node
/* ============================================================
   One-time seed script: loads data/seed_assets.json and
   data/seed_tb_2025-12.json into your Firestore project.

   Usage:
     1. Download a service account key from
        Firebase Console -> Project settings -> Service accounts
        -> Generate new private key. Save it somewhere OUTSIDE this
        repo (never commit it — see .gitignore).
     2. Run:
          GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
          node scripts/seed.mjs
        (or pass the path as the first argument instead of the env var:
          node scripts/seed.mjs /path/to/serviceAccountKey.json)
     3. Delete/forget the local key file once you're done — it is not
        needed again unless you want to re-run this script.

   This script is idempotent for assets (each asset keeps a stable id
   like "a1", "a2", ... from the seed file) — running it twice just
   overwrites the same documents rather than duplicating them.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";

const __dirname = dirname(fileURLToPath(import.meta.url));
const keyPathArg = process.argv[2];

function initAdmin() {
  if (keyPathArg) {
    const key = JSON.parse(readFileSync(keyPathArg, "utf8"));
    return initializeApp({ credential: cert(key) });
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    return initializeApp({ credential: applicationDefault() });
  }
  console.error(
    "No credentials given.\n" +
    "Pass a service account key path as an argument:\n" +
    "  node scripts/seed.mjs /path/to/serviceAccountKey.json\n" +
    "or set GOOGLE_APPLICATION_CREDENTIALS to that path first."
  );
  process.exit(1);
}

const app = initAdmin();
const db = getFirestore(app);

async function seedAssets() {
  const raw = readFileSync(join(__dirname, "..", "data", "seed_assets.json"), "utf8");
  const assets = JSON.parse(raw);
  console.log(`Seeding ${assets.length} asset(s)...`);
  const CHUNK = 450; // stay under Firestore's 500-writes-per-batch limit
  for (let i = 0; i < assets.length; i += CHUNK) {
    const batch = db.batch();
    for (const asset of assets.slice(i, i + CHUNK)) {
      const { id, ...data } = asset;
      if (!id) { console.warn("Skipping asset with no id:", asset); continue; }
      batch.set(db.collection("assets").doc(String(id)), data);
    }
    await batch.commit();
    console.log(`  committed ${Math.min(i + CHUNK, assets.length)} / ${assets.length}`);
  }
  console.log("Assets seeded.");
}

async function seedTbSnapshot() {
  const raw = readFileSync(join(__dirname, "..", "data", "seed_tb_2025-12.json"), "utf8");
  const snapshot = JSON.parse(raw);
  const period = snapshot.period;
  if (!period) throw new Error("seed_tb_2025-12.json is missing a 'period' field.");
  const doc = {
    period: snapshot.period,
    accounts: snapshot.accounts,
    source: snapshot.source || "Seed import",
    enteredBy: snapshot.enteredBy || "System Import",
    enteredAt: snapshot.enteredAt || new Date().toISOString(),
  };
  await db.collection("tb_snapshots").doc(period).set(doc);
  console.log(`Trial Balance snapshot for ${period} seeded (${Object.keys(snapshot.accounts).length} accounts).`);
}

try {
  await seedAssets();
  await seedTbSnapshot();
  console.log("\nDone. Your Firestore project now has the baseline PPE register and the " +
    "December 2025 Trial Balance loaded, ready for the app to take over month-to-month.");
  process.exit(0);
} catch (err) {
  console.error("Seeding failed:", err);
  process.exit(1);
}
