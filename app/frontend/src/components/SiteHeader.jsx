import "./SiteHeader.css";

// Top bar for the public team page: shows "Log in" to visitors, and the
// signed-in email plus a way back to the dashboard once someone is in.
function SiteHeader({ email, onLogIn, onDashboard, onLogOut }) {
  return (
    <header className="site-header">
      <span className="site-brand">Nautilus</span>

      <nav className="site-nav">
        {email ? (
          <>
            <span className="site-user">{email}</span>
            <button type="button" className="site-btn" onClick={onDashboard}>
              Dashboard
            </button>
            <button
              type="button"
              className="site-btn site-btn-ghost"
              onClick={onLogOut}
            >
              Log out
            </button>
          </>
        ) : (
          <button type="button" className="site-btn" onClick={onLogIn}>
            Log in
          </button>
        )}
      </nav>
    </header>
  );
}

export default SiteHeader;
