// ============================================================================
// Entry point for the PPE Ledger Cloud Functions. Initializes the Admin SDK
// once, then re-exports the callable functions defined in assets.js and
// depreciation.js. See CLOUD_FUNCTIONS_PROPOSAL.md for the design and
// rollout plan, and the comments atop assets.js/depreciation.js for exactly
// what each function does and does not cover.
// ============================================================================
'use strict';

const admin = require('firebase-admin');
admin.initializeApp();

const assets = require('./assets');
const depreciation = require('./depreciation');
const grandfather = require('./grandfather');
const backup = require('./backup');

exports.createAsset = assets.createAsset;
exports.updateAsset = assets.updateAsset;
exports.retireAsset = assets.retireAsset;
exports.reactivateAsset = assets.reactivateAsset;
exports.deleteRetiredAsset = assets.deleteRetiredAsset;

exports.postDepreciationPeriod = depreciation.postDepreciationPeriod;

// One-time (safely re-runnable) migration for the Google Sign-In pending-approval gate — see
// the comment atop functions/grandfather.js and atop firestore.rules for the full story.
exports.grandfatherExistingUsers = grandfather.grandfatherExistingUsers;

// Nightly Firestore + Storage backup, emailed as a summary — see the big comment atop
// functions/backup.js for what it does and the one-time setup it needs before it can deploy.
exports.dailyBackup = backup.dailyBackup;
