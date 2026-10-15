import { useEffect, useState } from "react";
import About from "./components/About";
import SiteHeader from "./components/SiteHeader";
import Prototype from "./prototype/Prototype";
import { supabase } from "../lib/supabaseClient";

function App() {
  const [session, setSession] = useState(null);
  // Without Supabase there is no session to wait for, so start off resolved.
  const [checkedSession, setCheckedSession] = useState(!supabase);
  const [path, setPath] = useState(window.location.pathname);

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
    setPath(nextPath);
    window.scrollTo(0, 0);
  }

  async function logOut() {
    await supabase?.auth.signOut();
    navigate("/");
  }

  const email = session?.user?.email ?? null;

  // Avoid flashing the logged-out header before the session is known.
  if (!checkedSession) {
    return null;
  }

  // The app itself lives at /signin: the sign-in form, then the dashboard.
  if (path === "/signin") {
    return <Prototype initialUser={email} onLogOut={logOut} />;
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
