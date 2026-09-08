// ============================================================================
// Entry point: wires the sign-in screen to Firebase Auth, then hands off to
// the app (js/app.js) once a user is signed in. This is the only module that
// index.html loads directly (<script type="module" src="js/main.js">).
// ============================================================================
import { watchAuthState, signOutUser } from "./firebase.js";
import { setupSignInForm } from "./auth-ui.js";
import { initApp } from "./app.js";

const signinScreen = document.getElementById("signin-screen");
const appRoot = document.getElementById("app");

setupSignInForm();

let appStarted = false;

watchAuthState((user) => {
  if (user) {
    signinScreen.hidden = true;
    appRoot.hidden = false;
    // initApp() is safe to call again on repeated sign-ins (e.g. after a
    // sign-out) — it re-binds the current user and re-renders; static DOM
    // listeners are only ever attached once (see bindStaticUI in app.js).
    initApp(user);
    appStarted = true;
  } else {
    appRoot.hidden = true;
    signinScreen.hidden = false;
    if (appStarted) {
      // A live session ended (sign-out). Reloading gives a clean slate
      // rather than leaving stale Firestore listeners attached.
      appStarted = false;
    }
  }
});

const signOutBtn = document.getElementById("signOutBtn");
if (signOutBtn) {
  signOutBtn.addEventListener("click", async () => {
    try {
      await signOutUser();
    } catch (err) {
      console.error(err);
    }
  });
}
