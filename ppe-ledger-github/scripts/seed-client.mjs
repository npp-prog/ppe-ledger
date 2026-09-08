#!/usr/bin/env node
/* ============================================================
   Alternative seed script — use this one if scripts/seed.mjs's
   service account key was blocked, i.e. Firebase Console showed:

     "Key creation is not allowed on this service account. Please
      check if service account key creation is restricted by
      organization policies."

   That happens on Firebase projects created under a Google
   Workspace / Google Cloud organization (e.g. a government or
   company domain) whose admins have disabled service account key
   downloads as a security policy. It's a permissions thing, not
   something you did wrong — and this script sidesteps it entirely.

   Instead of an admin credential, this signs in as one of the
   app's own user accounts (the ones you added in Firebase Console
   -> Authentication -> Users) and writes the seed data the exact
   same way the app itself would once you're signed in. No service
   account, no organization policy involved.

   Usage:
     npm install          (only needed once, if you haven't already)
     node scripts/seed-client.mjs
   It will ask for the email and password of one of those accounts.
   ============================================================ */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import readline from "node:readline/promises";
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword } from "firebase/auth";
import { getFirestore, doc, setDoc, writeBatch } from "firebase/firestore";
import { firebaseConfig } from "../js/firebase-config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function promptCredentials() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = (await rl.question("Email of an account already added in Firebase Authentication: ")).trim();
  const password = await rl.question("Its password: ");
  rl.close();
  return { email, password };
}

async function seedAssets(db) {
  const assets = JSON.parse(readFileSync(join(__dirname, "..", "data", "seed_assets.json"), "utf8"));
  console.log(`Seeding ${assets.length} asset(s)...`);
  const CHUNK = 450; // stay under Firestore's 500-writes-per-batch limit
  for (let i = 0; i < assets.length; i += CHUNK) {
    const batch = writeBatch(db);
    for (const asset of assets.slice(i, i + CHUNK)) {
      const { id, ...data } = asset;
      if (!id) { console.warn("Skipping asset with no id:", asset); continue; }
      batch.set(doc(db, "assets", String(id)), data);
    }
    await batch.commit();
    console.log(`  committed ${Math.min(i + CHUNK, assets.length)} / ${assets.length}`);
  }
  console.log("Assets seeded.");
}

async function seedTbSnapshot(db, fallbackEnteredBy) {
  const snapshot = JSON.parse(readFileSync(join(__dirname, "..", "data", "seed_tb_2025-12.json"), "utf8"));
  const period = snapshot.period;
  if (!period) throw new Error("seed_tb_2025-12.json is missing a 'period' field.");
  await setDoc(doc(db, "tb_snapshots", period), {
    period: snapshot.period,
    accounts: snapshot.accounts,
    source: snapshot.source || "Seed import",
    enteredBy: snapshot.enteredBy || fallbackEnteredBy,
    enteredAt: snapshot.enteredAt || new Date().toISOString(),
  });
  console.log(`Trial Balance snapshot for ${period} seeded (${Object.keys(snapshot.accounts).length} accounts).`);
}

async function main() {
  if (!firebaseConfig.apiKey || firebaseConfig.apiKey.startsWith("REPLACE_")) {
    console.error(
      "js/firebase-config.js still has placeholder values.\n" +
      "Finish Step 6 (paste in your real Firebase web config) before seeding."
    );
    process.exit(1);
  }

  const app = initializeApp(firebaseConfig);
  const auth = getAuth(app);
  const db = getFirestore(app);

  const { email, password } = await promptCredentials();
  console.log("Signing in...");
  await signInWithEmailAndPassword(auth, email, password);
  console.log("Signed in as " + email + ". Seeding...\n");

  await seedAssets(db);
  await seedTbSnapshot(db, email);

  console.log("\nDone. Your Firestore project now has the baseline PPE register and the " +
    "December 2025 Trial Balance loaded, ready for the app to take over month-to-month.");
  process.exit(0);
}

main().catch(err => {
  console.error("\nSeeding failed:", err.code || err.message || err);
  if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/user-not-found") {
    console.error("Double-check the email/password match an account listed under Firebase Console -> Authentication -> Users.");
  }
  process.exit(1);
});
