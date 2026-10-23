import { memo } from 'react';

// The crew. Edit freely: name, roles (shown as chips), a short bio, and a GitHub profile URL (null = no link).
const TEAM = [
  { name: "Aksh Patel", roles: ["Front-End Lead", "GitHub Co-Lead"], github: "https://github.com/AkshPatel63",
    bio: "Builds the React interface and owns component structure and responsive layout, and helps keep the repository and pull requests in order." },
  { name: "Giovannie Silva", roles: ["AI Master"], github: "https://github.com/Gsilva-code",
    bio: "Researches and integrates the machine learning features that power the smarter parts of our application." },
  { name: "Leman Yuksel", roles: ["Scrum Master"], github: "https://github.com/LemanYuksel",
    bio: "Runs our standups and sprint planning, tracks the backlog, and keeps every milestone moving on schedule." },
  { name: "Vineela Vandanapu", roles: ["Back-End Lead"], github: "https://github.com/whichcat",
    bio: "Designs the server-side architecture and API endpoints that connect the interface to our data layer." },
  { name: "Om Pandya", roles: ["Team Lead", "AI Master"], github: "https://github.com/Atom3798",
    bio: "Coordinates the team’s roadmap and deliverables while contributing to the machine learning side of the project." },
  { name: "Philip Chen", roles: ["GitHub Master"], github: "https://github.com/philipchensfsu",
    bio: "Maintains the repository, enforces our branching strategy, and reviews pull requests before they reach main." },
  { name: "Marco Garcia", roles: ["Back-End Lead"], github: "https://github.com/MarcoGarcia650",
    bio: "Sets up the FastAPI backend and Supabase database integration, and keeps our data layer and API endpoints working end to end." },
];

// avatar colours, taken in turn
const AVATAR = [['#85D1DB', '#102C33'], ['#1D6F7A', '#FFFFFF'], ['#B3EBF2', '#155E68'], ['#4FAAB7', '#FFFFFF']];

const initials = (name) => name.split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

function TeamCard({ member, index }) {
  const [bg, ink] = AVATAR[index % AVATAR.length];
  const handle = member.github ? member.github.replace(/\/+$/, '').split('/').pop() : '';
  return (
    <li className="rv">
      <article className="ab-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <span className="ab-av" aria-hidden="true" style={{ background: bg, color: ink }}>{initials(member.name)}</span>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '0' }}>
            <h3 style={{ margin: '0', fontSize: '21px', lineHeight: '1.15', letterSpacing: '-0.012em', fontWeight: '600', color: 'var(--ink)' }}>{member.name}</h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
              {member.roles.map((role) => (
                <span key={role} className="ab-role">{role}</span>
              ))}
            </div>
          </div>
        </div>
        <p style={{ margin: '0', fontSize: '15px', lineHeight: '1.6', color: 'var(--text)' }}>{member.bio}</p>
        {member.github && (
          <a className="ab-gh" href={member.github} target="_blank" rel="noopener noreferrer" aria-label={`${member.name} on GitHub`}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 7 4 12l5 5" />
              <path d="M15 7l5 5-5 5" />
            </svg>
            GitHub <span className="ab-handle">@{handle}</span>
            <svg className="ab-out" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M5 11 11 5" />
              <path d="M6 5h5v5" />
            </svg>
          </a>
        )}
      </article>
    </li>
  );
}

// THE TEAM
function Team() {
  return (
    <section id="team" style={{ position: "relative", padding: "32px 24px 128px" }}>
      {/* a jellyfish and a seahorse keep to the margins */}
      <div className="sea sea-zone sea-back hide-sm" aria-hidden="true" style={{ left: "0", width: "7.5%", top: "120px", bottom: "120px" }}>
        <div className="swim-home" style={{ left: "18px", top: "40px" }}>
          <div className="swim" data-sea="jelly">
            <svg className="jellybob" viewBox="0 0 64 100" width="58" height="90">
              <g className="tentacles k2" fill="none" strokeWidth="2.4" strokeLinecap="round">
                <path d="M14 38 q-5 10 0 20 q5 10 0 20 q-4 8 0 14" />
                <path d="M25 40 q-4 10 0 20 q4 10 0 20" />
                <path d="M39 40 q4 10 0 20 q-4 10 0 20" />
                <path d="M50 38 q5 10 0 20 q-5 10 0 20 q4 8 0 14" />
              </g>
              <path className="s1 bell" d="M5 36 C5 15 17 4 32 4 C47 4 59 15 59 36 C54 33 50 38 45.5 35 C41 38 36.5 34 32 37 C27.5 34 23 38 18.5 35 C14 38 10 33 5 36 Z" />
              <ellipse className="s3" cx="19" cy="15" rx="4.2" ry="2.6" transform="rotate(-32 19 15)" />
              <circle className="s3" cx="46" cy="15" r="2.2" />
              <circle className="se" cx="25" cy="23" r="2.4" />
              <circle className="se" cx="39" cy="23" r="2.4" />
              <path className="ke" d="M28.5 28 q3.5 3 7 0" fill="none" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </div>
        </div>
      </div>
      <div className="sea sea-zone sea-back hide-sm" aria-hidden="true" style={{ right: "0", width: "7.5%", top: "260px", bottom: "140px" }}>
        <div className="swim-home" style={{ left: "22px", top: "60px" }}>
          <div className="swim" data-sea="seahorse">
            <div className="seahorse">
              <svg viewBox="0 0 56 100" width="48" height="86">
                <path className="s2" d="M37 36 Q48 41 39 50 Z" />
                <path className="s2" d="M25 8 L28 1 L31 8 Z" />
                <path className="s2" d="M31 9 L36 4 L36 11 Z" />
                <path className="k1" d="M31 58 C34 70 30 82 21 82 C14 82 13 74 18 72 C21 71 24 74 22 76" fill="none" strokeWidth="7" strokeLinecap="round" />
                <ellipse className="s1" cx="28" cy="44" rx="11.5" ry="16" />
                <path className="s1" d="M20 22 Q16 32 19 36 L36 33 Q38 25 35 19 Z" />
                <circle className="s1" cx="29" cy="17" r="10" />
                <path className="s1" d="M21 15 L9 16 Q6 16.6 6 19 Q6 21.4 9 22 L21 21 Z" />
                <g className="k3" fill="none" strokeWidth="2" strokeLinecap="round">
                  <path d="M21 38 h12" />
                  <path d="M20 44 h15" />
                  <path d="M21 50 h12" />
                </g>
                <circle className="sw" cx="27" cy="14.5" r="3.4" />
                <circle className="se" cx="26.4" cy="14.8" r="2" />
              </svg>
            </div>
          </div>
        </div>
      </div>
      <div style={{ maxWidth: "1200px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "40px" }}>
        <div className="rv" style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-end", justifyContent: "space-between", gap: "20px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "14px", maxWidth: "640px" }}>
            <div className="mono" style={{ fontSize: "12px", letterSpacing: ".08em", color: "var(--accent)" }}>THE CREW</div>
            <h2 style={{ margin: "0", fontSize: "clamp(36px, 4.6vw, 56px)", lineHeight: "1.04", letterSpacing: "-0.028em", fontWeight: "650", color: "var(--ink)" }}>Seven roles, <span className="serif hl hl-scroll">one crew</span>.</h2>
          </div>
          <p style={{ margin: "0", color: "var(--text)", fontSize: "17px", maxWidth: "380px" }}>Front end, back end, AI, and the process that holds it all together.</p>
        </div>
        <ul className="ab-grid">
          {TEAM.map((member, i) => (
            <TeamCard key={member.name} member={member} index={i} />
          ))}
          <li className="rv">
            <a className="ab-card ab-find" href="#meetings" style={{ position: "relative" }}>
              <span className="mono" style={{ fontSize: "11px", letterSpacing: ".08em", color: "var(--accent)" }}>FIND US</span>
              <p style={{ margin: "0", fontSize: "21px", lineHeight: "1.3", letterSpacing: "-0.012em", fontWeight: "600", color: "var(--ink)" }}>Tuesdays in class. Thursdays in person at Peninsula.</p>
              <span className="ab-go">
                Meeting schedule<svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 3v10" />
                  <path d="M3.5 8.5 8 13l4.5-4.5" />
                </svg>
              </span><span className="ab-crab" aria-hidden="true">
                <svg viewBox="0 0 64 46" width="50" height="36">
                  <g className="k2" strokeWidth="2.6" strokeLinecap="round" fill="none">
                    <path d="M18 30 L9 34" />
                    <path d="M19 33 L11 39" />
                    <path d="M22 35 L16 42" />
                    <path d="M46 30 L55 34" />
                    <path d="M45 33 L53 39" />
                    <path d="M42 35 L48 42" />
                    <path d="M17 22 L12 16" />
                    <path d="M47 22 L52 16" />
                    <path d="M27 17 L25 9" />
                    <path d="M37 17 L39 9" />
                  </g>
                  <path className="s2 claw-l" d="M3 13 C3 6 10 3 14 7 L10 11 L15 12 C15 18 9 21 5 18 C3.6 16.8 3 15 3 13 Z" />
                  <path className="s2 claw-r" d="M61 13 C61 6 54 3 50 7 L54 11 L49 12 C49 18 55 21 59 18 C60.4 16.8 61 15 61 13 Z" />
                  <ellipse className="s1" cx="32" cy="26" rx="17" ry="11" />
                  <circle className="s3" cx="22.5" cy="27" r="2.4" />
                  <circle className="s3" cx="41.5" cy="27" r="2.4" />
                  <circle className="sw" cx="25" cy="8" r="3.6" />
                  <circle className="se" cx="25.4" cy="8.3" r="1.9" />
                  <circle className="sw" cx="39" cy="8" r="3.6" />
                  <circle className="se" cx="39.4" cy="8.3" r="1.9" />
                  <path className="ke" d="M28 28 q4 3 8 0" fill="none" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </span>
            </a>
          </li>
        </ul>
      </div>
    </section>
  );
}

export default memo(Team);
