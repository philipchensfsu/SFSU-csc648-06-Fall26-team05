import { useEffect, useState } from "react";
import About from "./components/About";
import SiteHeader from "./components/SiteHeader";
import Prototype from "./prototype/Prototype";
import SignInPage from "./nautilus/auth/SignInPage";
import SignUpPage from "./nautilus/auth/SignUpPage";
import ResetPasswordPage from "./nautilus/auth/ResetPasswordPage";
import { supabase } from "../lib/supabaseClient";

function App() {
  const [session, setSession] = useState(null);
  // Without Supabase there is no session to wait for, so start off resolved.
  const [checkedSession, setCheckedSession] = useState(!supabase);
  const [path, setPath] = useState(window.location.pathname);
  // What the sign-in and sign-up pages show while a request is out.
  const [authError, setAuthError] = useState("");
  const [authNotice, setAuthNotice] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  // A recovery link signs the person in, so without this they would land on
  // the dashboard and the password would never change.
  const [recovering, setRecovering] = useState(false);

  // Restore an existing login on page load, then follow any later changes.
  useEffect(() => {
    if (!supabase) {
      return undefined;
    }

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setCheckedSession(true);
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        setSession(nextSession);
        if (event === "PASSWORD_RECOVERY") setRecovering(true);
      },
    );

    return () => listener.subscription.unsubscribe();
  }, []);

  // Keep the browser's back and forward buttons working.
  useEffect(() => {
    function handlePopState() {
      setPath(window.location.pathname);
    }

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  function navigate(nextPath) {
    window.history.pushState({}, "", nextPath);
    setPath(window.location.pathname);
    setAuthError("");
    setAuthNotice("");
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  async function logOut() {
    await supabase?.auth.signOut();
    navigate("/");
  }

  // One Supabase auth call, with the pages' busy / error / notice states around
  // it. Reports whether the call went through, so a caller can stay put on a
  // failure rather than moving the person on.
  async function authCall(call, notice) {
    setAuthError("");
    setAuthNotice("");

    if (!supabase) {
      setAuthError("Sign-in is unavailable: Supabase keys are not configured.");
      return false;
    }

    setAuthBusy(true);
    const { error } = await call();
    setAuthBusy(false);

    if (error) {
      setAuthError(error.message);
      return false;
    }

    if (notice) setAuthNotice(notice);
    return true;
  }

  const email = session?.user?.email ?? null;

  // Avoid flashing the logged-out header before the session is known.
  if (!checkedSession) {
    return null;
  }

  // Supabase sends people back here once Google or a reset link is done.
  const back = `${window.location.origin}/signin`;

  // A reset link was opened, so pick the new password before anything else.
  if (recovering) {
    return (
      <ResetPasswordPage
        busy={authBusy}
        error={authError}
        notice={authNotice}
        onNavigate={navigate}
        onSubmit={async ({ password }) => {
          const saved = await authCall(() =>
            supabase.auth.updateUser({ password }),
          );
          // On a failure the message stays on this page, so keep it up.
          if (saved) setRecovering(false);
        }}
      />
    );
  }

  // Signed in, so both auth pages hand over to the dashboard.
  if ((path === "/signin" || path === "/signup") && session) {
    return <Prototype initialUser={email} onLogOut={logOut} />;
  }

  const authProps = {
    busy: authBusy,
    error: authError,
    notice: authNotice,
    onNavigate: navigate,
    onGoogle: () =>
      authCall(() =>
        supabase.auth.signInWithOAuth({
          provider: "google",
          options: { redirectTo: back },
        }),
      ),
  };

  if (path === "/signin") {
    return (
      <SignInPage
        {...authProps}
        onSubmit={(form) =>
          authCall(() =>
            supabase.auth.signInWithPassword({
              email: form.email,
              password: form.password,
            }),
          )
        }
        onForgotPassword={(formEmail) =>
          authCall(
            () => supabase.auth.resetPasswordForEmail(formEmail, { redirectTo: back }),
            "Check your inbox for a link to reset your password.",
          )
        }
      />
    );
  }

  if (path === "/signup") {
    return (
      <SignUpPage
        {...authProps}
        onSubmit={(form) =>
          authCall(
            () =>
              supabase.auth.signUp({
                email: form.email,
                password: form.password,
                options: { data: { full_name: form.name } },
              }),
            "Check your inbox to confirm your email, then sign in.",
          )
        }
      />
    );
  }

  // Everything else is the public team page.
  return (
    <>
      <SiteHeader
        email={email}
        onLogIn={() => navigate("/signin")}
        onDashboard={() => navigate("/signin")}
        onLogOut={logOut}
      />
      <About />
    </>
  );
}

export default App;
