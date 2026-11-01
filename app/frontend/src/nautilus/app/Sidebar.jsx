import Logo from "./Logo";
import { initialsOf } from "./format";
import { Avatar, MenuButton } from "./ui";
import {
  IconDoc,
  IconFolder,
  IconGrid,
  IconMenu,
  IconPeople,
  IconPlus,
  IconSearch,
  IconSignOut,
  IconSliders,
  IconX,
} from "./icons";

function NavItem({ icon, current, count, kbd, onClick, children }) {
  return (
    <button
      type="button"
      className={`nw-nav-item${current ? " is-current" : ""}`}
      aria-current={current ? "page" : undefined}
      onClick={onClick}
    >
      {icon}
      {children}
      {count !== undefined ? <span className="nw-nav-count">{count}</span> : null}
      {kbd ? (
        <kbd className="nw-kbd nw-nav-kbd" aria-hidden="true">
          {kbd}
        </kbd>
      ) : null}
    </button>
  );
}

// The workspace's left column. Below 800px wide it folds into a top bar
// with a Menu button (`menuOpen`).
function Sidebar({
  page,
  account,
  organization,
  prdCount,
  projectCount,
  recent,
  shortcut,
  menuOpen,
  onToggleMenu,
  onNavigate,
  onCreatePrd,
  onOpenPrd,
  onSignOut,
}) {
  return (
    <aside className={`nw-side${menuOpen ? " is-open" : ""}`} aria-label="Sidebar">
      <div className="nw-side-top">
        <button
          type="button"
          className="nw-logo-link"
          aria-label="Nautilus dashboard"
          onClick={() => onNavigate({ page: "dashboard" })}
        >
          <Logo />
        </button>
        <button
          type="button"
          className="nw-side-toggle"
          aria-expanded={menuOpen}
          aria-controls="nw-side-body"
          onClick={onToggleMenu}
        >
          {menuOpen ? <IconX size={16} /> : <IconMenu size={18} />}
          Menu
        </button>
      </div>

      <div className="nw-side-body" id="nw-side-body">
        <button type="button" className="nw-new" onClick={() => onCreatePrd(null)}>
          <IconPlus size={16} />
          New PRD
        </button>

        <nav className="nw-nav" aria-label="Primary">
          <NavItem
            icon={<IconGrid />}
            current={page === "dashboard"}
            onClick={() => onNavigate({ page: "dashboard" })}
          >
            Dashboard
          </NavItem>
          <NavItem
            icon={<IconDoc />}
            count={prdCount}
            onClick={() => onNavigate({ page: "dashboard", anchor: "prds" })}
          >
            PRDs
          </NavItem>
          <NavItem
            icon={<IconFolder />}
            count={projectCount}
            current={page === "projects"}
            onClick={() => onNavigate({ page: "projects" })}
          >
            Projects
          </NavItem>
          <NavItem
            icon={<IconSearch />}
            kbd={shortcut}
            current={page === "search"}
            onClick={() => onNavigate({ page: "search" })}
          >
            Search
          </NavItem>
        </nav>

        {organization?.access_role === "admin" ? (
          <nav className="nw-nav" aria-labelledby="nw-org-h">
            <h2 id="nw-org-h" className="nw-side-label">
              {organization.name}
            </h2>
            <NavItem
              icon={<IconPeople />}
              current={page === "people"}
              onClick={() => onNavigate({ page: "people" })}
            >
              People
            </NavItem>
          </nav>
        ) : null}

        {recent.length ? (
          <section className="nw-recent" aria-labelledby="nw-recent-h">
            <h2 id="nw-recent-h" className="nw-side-label">
              Recent
            </h2>
            <ul>
              {recent.map((prd) => (
                <li key={prd.id}>
                  <button type="button" className="nw-recent-item" onClick={() => onOpenPrd(prd)}>
                    <span className={`nw-dot nw-dot-${prd.status}`} aria-hidden="true" />
                    <span className="nw-recent-title">{prd.title}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="nw-account">
          <Avatar initials={initialsOf(account.name, account.email)} size="md" />
          <div className="nw-account-text">
            <span className="nw-account-name">{account.name || account.email}</span>
            {organization ? (
              <span className="nw-account-sub">
                {organization.access_role === "admin" ? "Admin" : "Member"} · {organization.name}
              </span>
            ) : account.name ? (
              <span className="nw-account-sub">{account.email}</span>
            ) : null}
          </div>
          <MenuButton
            label="Account"
            className="nw-icon-btn nw-account-btn"
            heading={account.email}
            items={[{ label: "Sign out", icon: <IconSignOut />, onSelect: onSignOut }]}
          >
            <IconSliders />
          </MenuButton>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;
