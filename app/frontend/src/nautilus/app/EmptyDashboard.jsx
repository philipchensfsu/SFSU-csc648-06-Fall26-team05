import { IconPlus } from "./icons";
import { firstNameOf } from "./format";
import InviteCard from "./InviteCard";

// The shell drawn in the corner of the illustration (from the landing page).
const SHELL_BODY =
  "M28.8 23 L28.8 22.4 L28.9 21.8 L28.8 21.2 L28.7 20.6 L28.6 19.9 L28.4 19.3 L28.1 18.7 L27.8 18.1 L27.4 17.6 L27 17 L26.5 16.5 L26 16.1 L25.4 15.6 L24.8 15.3 L24.2 14.9 L23.5 14.7 L22.7 14.4 L22 14.3 L21.2 14.2 L20.4 14.2 L19.7 14.2 L18.9 14.4 L18.1 14.5 L17.3 14.8 L16.5 15.1 L15.7 15.5 L15 16 L14.3 16.6 L13.7 17.2 L13.1 17.9 L12.5 18.6 L12.1 19.4 L11.6 20.2 L11.3 21.1 L11 22 L10.8 23 L10.7 24 L10.7 25 L10.7 26 L10.9 27 L11.1 28.1 L11.5 29.1 L11.9 30.1 L12.4 31 L13 32 L13.7 32.9 L14.5 33.7 L15.4 34.5 L16.3 35.2 L17.3 35.8 L18.4 36.3 L19.6 36.8 L20.8 37.1 L22 37.4 L23.3 37.5 L24.6 37.6 L25.9 37.5 L27.2 37.3 L28.5 37 L29.8 36.5 L31.1 36 L32.3 35.3 L33.5 34.5 L34.7 33.6 L35.7 32.6 L36.7 31.5 L37.6 30.3 L38.4 29 L39.1 27.6 L39.7 26.1 L40.2 24.6 L40.5 23 L28.8 23 Z";
const SHELL_RIDGES =
  "M32.5 33.8 Q32.1 31.5 31.1 27.8M22.3 36.2 Q23.4 34.6 25.1 31.6M14.3 31.7 Q15.9 31.4 18.8 30.4M11.9 23.9 Q13 24.8 15.4 25.9";
const SHELL_SPIRAL =
  "M24.5 22.2 L24.4 21.9 L24.3 21.7 L24.2 21.4 L24.1 21.2 L23.9 21 L23.8 20.7 L23.5 20.5 L23.3 20.3 L23.1 20.2 L22.8 20 L22.5 19.9 L22.2 19.9 L21.9 19.8 L21.6 19.8 L21.2 19.8 L20.9 19.8 L20.6 19.9 L20.2 20 L19.9 20.2 L19.6 20.3 L19.3 20.6 L19 20.8 L18.8 21.1 L18.5 21.4 L18.3 21.7 L18.2 22.1 L18 22.4 L17.9 22.8 L17.9 23.2 L17.9 23.7 L17.9 24.1 L17.9 24.5 L18 24.9 L18.2 25.4 L18.4 25.8 L18.6 26.2 L18.9 26.5 L19.2 26.9 L19.6 27.2 L20 27.5 L20.4 27.7 L20.9 28 L21.4 28.1 L21.9 28.2 L22.4 28.3 L23 28.3 L23.5 28.3 L24.1 28.2 L24.6 28 L25.1 27.8 L25.7 27.6 L26.2 27.3 L26.6 26.9 L27.1 26.5 L27.5 26 L27.9 25.5 L28.2 24.9 L28.4 24.3 L28.6 23.7 L28.8 23";

// A spec sheet in a porthole of sea, with a fish swimming laps around it.
// Purely decorative; it stops moving for people who prefer reduced motion.
function Illustration() {
  return (
    <div className="nw-art" aria-hidden="true">
      <div className="nw-art-sea" />
      <div className="nw-art-back" />
      <div className="nw-art-sheet">
        <div className="nw-art-head">
          <span className="nw-art-num">§1</span>
          <span className="nw-art-bar" />
        </div>
        <span className="nw-art-line" style={{ width: "100%" }} />
        <span className="nw-art-line" style={{ width: "86%" }} />
        <span className="nw-art-line" style={{ width: "64%" }} />
        <div className="nw-art-head nw-art-head-2">
          <span className="nw-art-num">§2</span>
          <span className="nw-art-bar" style={{ flex: "none", width: "60%" }} />
        </div>
        <span className="nw-art-line" style={{ width: "92%" }} />
        <span className="nw-art-line" style={{ width: "74%" }} />
      </div>
      <div className="nw-art-plus">
        <IconPlus size={26} />
      </div>
      <span className="nw-art-shell">
        <svg viewBox="0 0 44 44" width="34" height="34" focusable="false">
          <path d={SHELL_BODY} fill="#B3EBF2" stroke="#1D6F7A" strokeWidth="2" strokeLinejoin="round" />
          <path d={SHELL_RIDGES} fill="none" stroke="#1D6F7A" strokeWidth="2" strokeLinecap="round" />
          <path d={SHELL_SPIRAL} fill="none" stroke="#1D6F7A" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </span>
      <div className="nw-art-fish">
        <div className="nw-bob">
          <svg viewBox="0 0 48 30" width="34" height="21.2" focusable="false">
            <path className="nw-tail" d="M3 5 L16 15 L3 25 Q7 15 3 5 Z" fill="#1D6F7A" />
            <path d="M22 5 Q28 -1 34 5 Z" fill="#1D6F7A" />
            <ellipse cx="28" cy="15" rx="16" ry="10.5" fill="#85D1DB" />
            <path d="M22 6.5 Q18.5 15 22 23.5" fill="none" stroke="#B3EBF2" strokeWidth="2.4" strokeLinecap="round" />
            <circle cx="36.5" cy="12.5" r="3.4" fill="#FFFFFF" />
            <circle cx="37.2" cy="12.8" r="2" fill="#102C33" />
            <path d="M40.5 18.5 q-2 1.6 -4 .6" fill="none" stroke="#102C33" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </div>
      </div>
      <span className="nw-bubble nw-bubble-sm" style={{ left: "30px", top: "150px", animationDelay: ".4s" }} />
      <span className="nw-bubble" style={{ left: "196px", top: "140px", animationDelay: "2.2s" }} />
      <span className="nw-bubble nw-bubble-sm" style={{ left: "120px", top: "200px", animationDelay: "3.6s" }} />
    </div>
  );
}

// The dashboard for someone with no PRDs yet. A new admin also gets the join
// code to invite their team; a new member is told which organization they're in.
function EmptyDashboard({ account, organization, onCreatePrd, onOpenPeople }) {
  const first = firstNameOf(account.name);
  const isAdmin = organization?.access_role === "admin";
  return (
    <div className="nw-page nw-page-empty">
      {organization && !isAdmin ? (
        <p className="nw-joined" role="status">
          You’re in <strong>{organization.name}</strong> as a member. When someone shares a PRD with you, it shows up here.
        </p>
      ) : null}
      <div>
        <h1 className="nw-h1">
          Welcome to <span className="nw-serif">Nautilus</span>
          {first ? `, ${first}` : ""}
        </h1>
        <p className="nw-lede">You don’t have any PRDs yet.</p>
      </div>

      <section className="nw-empty" aria-labelledby="nw-empty-h">
        <Illustration />
        <div className="nw-empty-copy">
          <div className="nw-empty-intro">
            <h2 id="nw-empty-h" className="nw-empty-title">
              Turn your first idea into a <span className="nw-serif nw-hl">PRD</span>
            </h2>
            <p className="nw-empty-text">
              Create a PRD, answer a short guided interview about your product, and Nautilus drafts a
              structured PRD you can edit section by section.
            </p>
          </div>
          <ol className="nw-steps">
            <li>
              <span className="nw-step-num">1</span>
              <span>
                <strong>Name your PRD</strong>
                <span className="nw-step-text"> — a working title and one sentence is enough.</span>
              </span>
            </li>
            <li>
              <span className="nw-step-num">2</span>
              <span>
                <strong>Answer the discovery interview</strong>
                <span className="nw-step-text"> — seven questions, saved as you go.</span>
              </span>
            </li>
            <li>
              <span className="nw-step-num">3</span>
              <span>
                <strong>Generate and refine</strong>
                <span className="nw-step-text"> — then edit any section by hand.</span>
              </span>
            </li>
          </ol>
          <div className="nw-empty-actions">
            <button type="button" className="nw-btn nw-btn-primary nw-btn-lg" onClick={() => onCreatePrd(null)}>
              <IconPlus size={16} />
              Create your first PRD
            </button>
          </div>
        </div>
      </section>

      {isAdmin ? <InviteCard organization={organization} onOpenPeople={onOpenPeople} /> : null}

      <p className="nw-empty-foot">You can stop at any step and come back later.</p>
    </div>
  );
}

export default EmptyDashboard;
