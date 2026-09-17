// ============================================================================
// Account catalogs — extracted VERBATIM from js/app.js's ACCOUNT_CATALOG and
// SX_ACCOUNT_CATALOG (lines 9-66 and 6166-6184 as of the Sept 2026 Cloud
// Functions migration) via a script, not hand-retyped, specifically to
// avoid a transcription error in financial account-code mappings.
//
// IMPORTANT: this is a DUPLICATE of the client's copy in js/app.js, not a
// shared import — a static-site client and a Cloud Function don't share a
// module system without a bigger refactor of the (very large) client file,
// which felt too risky to do in the same pass as this migration. If the
// account catalog in js/app.js is ever edited (a new UACS code added, an
// expense-account remapping, a name fix), this file must be regenerated to
// match — see scripts/extract-account-catalog.mjs for the exact extraction
// this file was built from, so re-running it is mechanical, not manual.
// ============================================================================
'use strict';

const ACCOUNT_CATALOG = [
  // group, code, name, depreciable, depExpCode, depExpName
  ["Land & Land Improvements", 10701010, "Land", false, null, null],
  ["Land & Land Improvements", 10702010, "Land Improvements, Aquaculture Structures", true, 50501020, "Depreciation - Land Improvements"],
  ["Land & Land Improvements", 10702990, "Other Land Improvements", true, 50501020, "Depreciation - Land Improvements"],
  // Road Networks (10703010) stays grouped under Infrastructure Assets, per the client's explicit
  // instruction (Sept 2026) — do not split it into its own optgroup.
  ["Infrastructure Assets", 10703010, "Road Networks", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703020, "Flood Control Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703030, "Sewer Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703040, "Water Supply Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703050, "Power Supply Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703060, "Communication Networks", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703070, "Seaport Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703080, "Airport Systems", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703090, "Parks, Plazas and Monuments", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Infrastructure Assets", 10703990, "Other Infrastructure Assets", true, 50501030, "Depreciation - Infrastructure Assets"],
  ["Buildings & Structures", 10704010, "Buildings", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704020, "School Buildings", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704030, "Hospitals and Health Centers", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704040, "Markets", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704050, "Slaughterhouses", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704060, "Hostels and Dormitories", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Buildings & Structures", 10704990, "Other Structures", true, 50501040, "Depreciation - Buildings and Other Structures"],
  ["Machinery & Equipment", 10705010, "Machinery", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705020, "Office Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  // ICT Equipment (10705030) stays grouped under Machinery & Equipment, per the client's explicit
  // instruction (Sept 2026) — do not split it into its own optgroup.
  ["Machinery & Equipment", 10705030, "Information and Communication Technology Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705040, "Agricultural and Forestry Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705050, "Marine and Fishery Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705060, "Airport Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705070, "Communication Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705080, "Construction and Heavy Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705090, "Disaster Response and Rescue Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705100, "Military, Police and Security Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705110, "Medical Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705120, "Printing Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705130, "Sports Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705140, "Technical and Scientific Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Machinery & Equipment", 10705990, "Other Machinery and Equipment", true, 50501050, "Depreciation - Machinery and Equipment"],
  ["Transportation Equipment", 10706010, "Motor Vehicles", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706020, "Trains", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706030, "Aircrafts and Aircrafts Ground Equipment", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706040, "Watercrafts", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Transportation Equipment", 10706990, "Other Transportation Equipment", true, 50501060, "Depreciation - Transportation Equipment"],
  ["Furniture, Fixtures & Books", 10707010, "Furniture and Fixtures", true, 50501070, "Depreciation - Furniture, Fixtures and Books"],
  ["Furniture, Fixtures & Books", 10707020, "Books", true, 50501070, "Depreciation - Furniture, Fixtures and Books"],
  ["Construction in Progress", 10710010, "Construction in Progress - Land Improvements", false, null, null],
  ["Construction in Progress", 10710020, "Construction in Progress - Infrastructure Assets", false, null, null],
  ["Construction in Progress", 10710030, "Construction in Progress - Buildings and Other Structures", false, null, null],
  ["Other PPE", 10799010, "Work/Zoo Animals", true, 50501990, "Depreciation - Other Property, Plant and Equipment"],
  ["Other PPE", 10799990, "Other Property, Plant and Equipment", true, 50501990, "Depreciation - Other Property, Plant and Equipment"],
  ["Biological Assets", 10801020, "Plants and Trees", false, null, null],
  ["Intangible Assets", 10901010, "Patents/Copyrights", true, 50502010, "Amortization - Intangible Assets"],
  ["Intangible Assets", 10901020, "Computer Software", true, 50502010, "Amortization - Intangible Assets"],
  ["Intangible Assets", 10901990, "Other Intangible Assets", true, 50502010, "Amortization - Intangible Assets"],
];

// 2026-09 fix: codes 10405080-10405140 were previously shifted by one slot — see the matching
// comment in js/app.js above SX_CODE_RELABEL_2026_09. That relabeling is a CLIENT-side, admin-only,
// one-time data fix-up (relabelMisassignedSxAccounts()) and is NOT reproduced here — this catalog
// already has the corrected names, matching js/app.js's catalog as it stands today.

const SX_ACCOUNT_CATALOG = [
  [10405010, "Semi-Expendable Machinery"],
  [10405020, "Semi-Expendable Office Equipment"],
  [10405030, "Semi-Expendable Information and Communications Technology Equipment"],
  [10405040, "Semi-Expendable Agricultural and Forestry Equipment"],
  [10405050, "Semi-Expendable Marine and Fishery Equipment"],
  [10405060, "Semi-Expendable Airport Equipment"],
  [10405070, "Semi-Expendable Communications Equipment"],
  [10405080, "Semi-Expendable Disaster Response and Rescue Equipment"],
  [10405090, "Semi-Expendable Military, Police and Security Equipment"],
  [10405100, "Semi-Expendable Medical, Dental and Laboratory Equipment"],
  [10405110, "Semi-Expendable Printing Equipment"],
  [10405120, "Semi-Expendable Sports Equipment"],
  [10405130, "Semi-Expendable Technical and Scientific Equipment"],
  [10405140, "Semi-Expendable Construction Equipment"],
  [10405990, "Semi-Expendable Other Machinery and Equipment"],
  [10406010, "Semi-Expendable Furniture and Fixtures"],
  [10406020, "Semi-Expendable Books"],
];

const ACCOUNT_BY_CODE = {};
ACCOUNT_CATALOG.forEach(([group, code, name, dep, expCode, expName]) => {
  ACCOUNT_BY_CODE[code] = { group, code, name, depreciable: dep, expCode, expName };
});

const SX_ACCOUNT_BY_CODE = {};
SX_ACCOUNT_CATALOG.forEach(([code, name]) => {
  SX_ACCOUNT_BY_CODE[code] = { group: "Semi-Expendable Property", code, name, depreciable: false, expCode: null, expName: null };
});

function accountInfo(code) {
  return ACCOUNT_BY_CODE[code] || SX_ACCOUNT_BY_CODE[code] || { group: "Other", code, name: "Account " + code, depreciable: false, expCode: null, expName: null };
}
function isSxAccount(code) {
  return Object.prototype.hasOwnProperty.call(SX_ACCOUNT_BY_CODE, code);
}

module.exports = { ACCOUNT_CATALOG, SX_ACCOUNT_CATALOG, ACCOUNT_BY_CODE, SX_ACCOUNT_BY_CODE, accountInfo, isSxAccount };
