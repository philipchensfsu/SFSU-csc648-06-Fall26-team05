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
