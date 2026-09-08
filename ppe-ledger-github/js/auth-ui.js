// ============================================================================
// Sign-in screen wiring. Pure DOM + calls into firebase.js — no app state.
// ============================================================================
import { signInEmail, signInGoogle, resetPassword } from "./firebase.js";

function showError(message) {
  const el = document.getElementById("signinError");
  el.textContent = message;
  el.classList.add("show");
}
function clearError() {
  const el = document.getElementById("signinError");
  el.textContent = "";
  el.classList.remove("show");
}
function friendlyAuthError(err) {
  const code = err && err.code;
  switch (code) {
    case "auth/invalid-email": return "That doesn't look like a valid email address.";
    case "auth/user-disabled": return "This account has been disabled. Contact your administrator.";
    case "auth/user-not-found":
    case "auth/wrong-password":
    case "auth/invalid-credential": return "Incorrect email or password.";
    case "auth/too-many-requests": return "Too many attempts — please wait a moment and try again.";
    case "auth/popup-closed-by-user": return "";
    default: return "Couldn't sign in — please try again.";
  }
}

export function setupSignInForm() {
  const form = document.getElementById("signinForm");
  const googleBtn = document.getElementById("googleSignInBtn");
  const forgotLink = document.getElementById("forgotPasswordLink");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("signinEmail").value.trim();
    const password = document.getElementById("signinPassword").value;
    const btn = document.getElementById("signinSubmitBtn");
    btn.disabled = true;
    btn.textContent = "Signing in…";
    try {
      await signInEmail(email, password);
    } catch (err) {
      const msg = friendlyAuthError(err);
      if (msg) showError(msg);
    } finally {
      btn.disabled = false;
      btn.textContent = "Sign in";
    }
  });

  googleBtn.addEventListener("click", async () => {
    clearError();
    try {
      await signInGoogle();
    } catch (err) {
      const msg = friendlyAuthError(err);
      if (msg) showError(msg);
    }
  });

  forgotLink.addEventListener("click", async (e) => {
    e.preventDefault();
    clearError();
    const email = document.getElementById("signinEmail").value.trim();
    if (!email) { showError("Enter your email above first, then click “Forgot password” again."); return; }
    try {
      await resetPassword(email);
      showError("Password reset email sent — check your inbox.");
      document.getElementById("signinError").style.color = "var(--good)";
    } catch (err) {
      showError(friendlyAuthError(err) || "Couldn't send a reset email.");
    }
  });
}
