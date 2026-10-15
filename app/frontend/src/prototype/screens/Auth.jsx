import { useState } from "react";
import { TAKEN_EMAILS } from "../data";

function Field({ id, label, required = true, error, ...inputProps }) {
  const errorId = `${id}-error`;
  return (
    <div className="nt-field">
      <label htmlFor={id}>
        {label} <span className="nt-req">{required ? "(Required)" : "(Optional)"}</span>
      </label>
      <input
        id={id}
        name={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...inputProps}
      />
      {error ? (
        <p id={errorId} className="nt-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function AuthCard({ children }) {
  return (
    <main className="nt-auth">
      <p className="nt-logo nt-auth-logo">Nautilus</p>
      <section className="nt-card nt-auth-card">{children}</section>
    </main>
  );
}

export function SignIn({ onSignIn, onSwitch }) {
  function handleSubmit(event) {
    event.preventDefault();
    const email = new FormData(event.currentTarget).get("email");
    onSignIn(email);
  }

  return (
    <AuthCard>
      <h1>Welcome back</h1>
      <p className="nt-muted">Sign in to open your PRDs.</p>
      <form onSubmit={handleSubmit}>
        <Field id="email" label="Email" type="email" autoComplete="email" />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
        />
        <button type="submit" className="nt-btn nt-btn-primary nt-btn-block">
          Sign in
        </button>
      </form>
      <p className="nt-auth-switch">
        New here?{" "}
        <button type="button" className="nt-link-button" onClick={onSwitch}>
          Create an account
        </button>
      </p>
    </AuthCard>
  );
}

export function SignUp({ onSignUp, onSwitch }) {
  const [errors, setErrors] = useState({});

  function handleSubmit(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email").trim().toLowerCase();
    const nextErrors = {};
    if (TAKEN_EMAILS.includes(email)) {
      nextErrors.email =
        "Error: this email is already in use. Sign in instead, or use a different email.";
    }
    if (form.get("password") !== form.get("confirm")) {
      nextErrors.confirm = "Error: the passwords don't match.";
    }
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length === 0) onSignUp(email);
  }

  return (
    <AuthCard>
      <h1>Create your account</h1>
      <p className="nt-muted">Fields marked Required must be filled in.</p>
      <form onSubmit={handleSubmit}>
        <Field id="name" label="Full name" autoComplete="name" />
        <Field
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={errors.email}
        />
        <Field
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
        />
        <Field
          id="confirm"
          label="Confirm password"
          type="password"
          autoComplete="new-password"
          error={errors.confirm}
        />
        <button type="submit" className="nt-btn nt-btn-primary nt-btn-block">
          Create account
        </button>
      </form>
      <p className="nt-auth-switch">
        Already have an account?{" "}
        <button type="button" className="nt-link-button" onClick={onSwitch}>
          Sign in
        </button>
      </p>
      <p className="nt-demo-hint">
        Prototype tip: use <code>taken@example.com</code> to see the
        &ldquo;email in use&rdquo; error.
      </p>
    </AuthCard>
  );
}
