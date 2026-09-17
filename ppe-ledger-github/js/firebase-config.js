// ============================================================================
// Firebase project configuration
// ============================================================================
// Replace the placeholder values below with YOUR Firebase project's config.
// You get these from: Firebase Console -> Project settings -> General ->
// "Your apps" -> the web app (</>) -> SDK setup and configuration -> Config.
//
// These values are NOT secret — Firebase's client config is meant to be
// public (it just tells the SDK which project to talk to). Access control
// is enforced by Firebase Authentication + the Firestore security rules in
// firestore.rules, not by hiding this file. It's fine to commit this file
// to a public GitHub repo once filled in.
//
// See README.md for the full step-by-step setup guide.
// ============================================================================

export const firebaseConfig = {
  apiKey: "REPLACE_WITH_YOUR_API_KEY",
  authDomain: "REPLACE_WITH_YOUR_PROJECT.firebaseapp.com",
  projectId: "REPLACE_WITH_YOUR_PROJECT_ID",
  storageBucket: "REPLACE_WITH_YOUR_PROJECT.appspot.com",
  messagingSenderId: "REPLACE_WITH_YOUR_SENDER_ID",
  appId: "REPLACE_WITH_YOUR_APP_ID",
};
