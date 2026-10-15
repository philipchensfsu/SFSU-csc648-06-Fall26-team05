import { useState } from "react";

const SCREENS = [
  ["signin", "Sign in"],
  ["signup", "Create account"],
  ["dashboard", "Dashboard"],
  ["dashboard-empty", "Dashboard (no PRDs)"],
  ["create", "Create a PRD"],
  ["interview", "Discovery interview"],
  ["review", "Review answers"],
  ["generating", "Generating"],
  ["editor", "Editor"],
  ["export", "Export"],
  ["reset", "Reset mock data"],
];

// Demo-only panel for jumping between screens while reviewing the prototype.
function ScreenJumper({ failGeneration, onToggleFail, onJump }) {
  const [open, setOpen] = useState(false);

  return (
    <aside className="nt-jumper" aria-label="Prototype screens">
      <button
        type="button"
        className="nt-btn nt-btn-dark"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {open ? "Close" : "Prototype screens"}
      </button>
      {open ? (
        <div className="nt-jumper-panel">
          <ul>
            {SCREENS.map(([id, label]) => (
              <li key={id}>
                <button
                  type="button"
                  className="nt-link-button"
                  onClick={() => onJump(id)}
                >
                  {label}
                </button>
              </li>
            ))}
          </ul>
          <label className="nt-check">
            <input
              type="checkbox"
              checked={failGeneration}
              onChange={(event) => onToggleFail(event.target.checked)}
            />
            Make PRD generation fail
          </label>
        </div>
      ) : null}
    </aside>
  );
}

export default ScreenJumper;
