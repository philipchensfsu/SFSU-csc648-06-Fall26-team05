import { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import "./SignIn.css";

function SignIn({ onSignIn }) {
  // "signin" shows the login form, "signup" shows the create-account form.
  const [mode, setMode] = useState("signin");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const isSignUp = mode === "signup";

  // Swap between the two forms and clear anything left over.
  function switchMode() {
    setMode(isSignUp ? "signin" : "signup");
    setError("");
  }

  // Hand off to Google; Supabase sends the user back to /signin afterwards.
  async function handleGoogle() {
    setError("");

    if (!supabase) {
      setError("Sign-in is unavailable: Supabase keys are not configured.");
      return;
    }

    setBusy(true);
    const { error: authError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/signin` },
    });

    // On success the browser leaves this page, so only clean up on failure.
    if (authError) {
      setError(authError.message);
      setBusy(false);
    }
  }

  // Stop the form from refreshing the page, then sign in through Supabase.
  async function handleSubmit(event) {
    event.preventDefault();

    // Read the fields before awaiting -- the event is recycled after that.
    const form = event.currentTarget;
    const email = form.email.value;
    const password = form.password.value;

    if (isSignUp && password !== form["confirm-password"].value) {
      setError("Passwords do not match.");
      return;
    }

    setError("");

    if (!supabase) {
      setError("Sign-in is unavailable: Supabase keys are not configured.");
      return;
    }

    setBusy(true);
    const { error: authError } = isSignUp
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (authError) {
      setError(authError.message);
      return;
    }

    onSignIn?.(email);
  }

  return (
    <main className="signin-page">
      <section className="signin-card">
        <h1>{isSignUp ? "Create your account" : "Welcome back"}</h1>
        <p>
          {isSignUp
            ? "Sign up to start working on your PRDs."
            : "Sign in to view your PRDs."}
        </p>

        <form onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            autoComplete="email"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            placeholder="Your password"
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
          />

          {isSignUp && (
            <>
              <label htmlFor="confirm-password">Confirm password</label>
              <input
                id="confirm-password"
                name="confirm-password"
                type="password"
                placeholder="Re-enter your password"
                autoComplete="new-password"
                required
              />
            </>
          )}

          {error && (
            <p className="signin-error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" disabled={busy}>
            {busy
              ? "Please wait…"
              : isSignUp
                ? "Create account"
                : "Sign in"}
          </button>
        </form>

        <div className="signin-divider">
          <span>or</span>
        </div>

        <button
          type="button"
          className="signin-google"
          onClick={handleGoogle}
          disabled={busy}
        >
          <svg className="signin-google-icon" viewBox="0 0 18 18" aria-hidden="true">
            <path
              fill="#4285F4"
              d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
            />
            <path
              fill="#34A853"
              d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
            />
            <path
              fill="#FBBC05"
              d="M3.97 10.72a5.4 5.4 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
            />
            <path
              fill="#EA4335"
              d="M9 3.58c1.32 0 2.5.46 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
            />
          </svg>
          Continue with Google
        </button>

        <p className="signin-switch">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <button type="button" onClick={switchMode}>
            {isSignUp ? "Sign in" : "Create account"}
          </button>
        </p>
      </section>
    </main>
  );
}

export default SignIn;
