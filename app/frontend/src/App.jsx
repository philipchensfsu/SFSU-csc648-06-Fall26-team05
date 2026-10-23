import { useEffect, useState } from "react";
import About from "./components/About";
import SiteHeader from "./components/SiteHeader";
import Prototype from "./prototype/Prototype";
import SignInPage from "./nautilus/auth/SignInPage";
import SignUpPage from "./nautilus/auth/SignUpPage";
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
      (_event, nextSession) => setSession(nextSession),
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

  // One Supabase auth call, with the pages' busy / error / notice states around it.
  async function authCall(call, notice) {
    setAuthError("");
    setAuthNotice("");

    if (!supabase) {
      setAuthError("Sign-in is unavailable: Supabase keys are not configured.");
      return;
    }

    setAuthBusy(true);
    const { error } = await call();
    setAuthBusy(false);

    if (error) setAuthError(error.message);
    else if (notice) setAuthNotice(notice);
  }

  const email = session?.user?.email ?? null;

  // Avoid flashing the logged-out header before the session is known.
  if (!checkedSession) {
    return null;
  }

  // Signed in, so both auth pages hand over to the dashboard.
  if ((path === "/signin" || path === "/signup") && session) {
    return <Prototype initialUser={email} onLogOut={logOut} />;
  }

  // Supabase sends people back here once Google or an emailed link is done.
  const back = `${window.location.origin}/signin`;
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
