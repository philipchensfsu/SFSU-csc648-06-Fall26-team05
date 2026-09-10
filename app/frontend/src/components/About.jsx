import "./About.css";

const PLACEHOLDER_PHOTO = "/images/placeholder.svg";

/*
 * Teammates: fill in your own entry on your own branch.
 * Set `name`, `bio`, your `github` URL, and drop your photo in
 * public/images/ then point `image` at it (e.g. "/images/yourname.jpg").
 * Leaving a field as "" keeps the placeholder in its spot.
 */
const teamMembers = [
  {
    id: "member-1",
    name: "Aksh Patel",
    role: "Front-End Lead, GitHub Co-Lead",
    image: "/images/aksh.jpg",
    bio: "Builds the React interface and owns component structure and responsive layout, and helps keep the repository and pull requests in order.",
    github: "https://github.com/AkshPatel63",
  },
  {
    id: "member-2",
    name: "Giovannie Silva",
    role: "AI Master",
    image: "",
    bio: "Researches and integrates the machine learning features that power the smarter parts of our application.",
    github: "",
  },
  {
    id: "member-3",
    name: "Leman Yuksel",
    role: "Scrum Master",
    image: "",
    bio: "Runs our standups and sprint planning, tracks the backlog, and keeps every milestone moving on schedule.",
    github: "https://github.com/LemanYuksel",
  },
  {
    id: "member-4",
    name: "Vineela Vandanapu",
    role: "Back-End Lead",
    image: "",
    bio: "Designs the server-side architecture and API endpoints that connect the interface to our data layer.",
    github: "https://github.com/whichcat",
  },
  {
    id: "member-5",
    name: "Om Pandya",
    role: "Team Lead, AI Master",
    image: "",
    bio: "Coordinates the team's roadmap and deliverables while contributing to the machine learning side of the project.",
    github: "https://github.com/Atom3798",
  },
  {
    id: "member-6",
    name: "Team Member 6",
    role: "GitHub Master",
    image: "",
    bio: "Maintains the repository, enforces our branching strategy, and reviews pull requests before they reach main.",
    github: "",
  },
  {
    id: "member-7",
    name: "Marco Garcia",
    role: "Back-End Lead",
    image: "",
    bio: "Sets up the FastAPI backend and Supabase database integration, and keeps our data layer and API endpoints working end to end.",
    github: "https://github.com/MarcoGarcia650",
  },
];

const meetings = [
  { day: "Tuesdays", time: "6:00 PM - 7:00 PM", location: "Zoom" },
  { day: "Saturdays", time: "11:00 AM - 12:00 PM", location: "Zoom" },
];

function handleImageError(event) {
  const img = event.currentTarget;
  if (!img.src.endsWith(PLACEHOLDER_PHOTO)) {
    img.src = PLACEHOLDER_PHOTO;
  }
}

// Renders a real link once a URL is filled in, otherwise a muted
// non-clickable chip that holds the spot in the layout.
function ProfileLink({ label, url, memberName }) {
  if (!url) {
    return (
      <span className="member-link is-empty" title={`${label} link not added yet`}>
        {label}
      </span>
    );
  }

  return (
    <a
      className="member-link"
      href={url}
      target="_blank"
      rel="noreferrer"
      aria-label={`${memberName} on ${label}`}
    >
      {label}
    </a>
  );
}

function About() {
  return (
    <main className="about">
      <header className="about-header">
        <h1>Meet Our Team</h1>
        <p>
          We are Team 05 of CSC 648 Section 06 at San Francisco State
          University. Over the course of the semester our seven members work
          together through the software engineering lifecycle, from requirements
          and design to implementation, testing, and delivery.
        </p>
      </header>

      <section className="team-section" aria-label="Team members">
        <ul className="team-grid">
          {teamMembers.map((member) => (
            <li className="member-card" key={member.id}>
              <img
                className="member-photo"
                src={member.image || PLACEHOLDER_PHOTO}
                alt={`Portrait of ${member.name}`}
                onError={handleImageError}
                loading="lazy"
              />
              <h2 className="member-name">{member.name}</h2>
              <p className="member-role">{member.role}</p>
              <p className="member-bio">{member.bio}</p>

              <div className="member-links">
                <ProfileLink
                  label="GitHub"
                  url={member.github}
                  memberName={member.name}
                />
              </div>
            </li>
          ))}
        </ul>
      </section>

      <section className="team-info" aria-label="Team logistics">
        <div className="info-block">
          <h2>Meeting Schedule</h2>
          <p className="info-lead">We meet twice a week as a full team.</p>
          <ul className="meeting-list">
            {meetings.map((meeting) => (
              <li key={meeting.day}>
                <span className="meeting-day">{meeting.day}</span>
                <span className="meeting-time">{meeting.time}</span>
                <span className="meeting-location">{meeting.location}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="info-block">
          <h2>Communication</h2>
          <p className="info-lead">
            Slack is our primary communication channel.
          </p>
          <p>
            All project discussions, standup updates, and questions are posted
            in our team Slack workspace. Code review conversations stay on
            GitHub pull requests so decisions are documented alongside the code.
          </p>
        </div>
      </section>
    </main>
  );
}

export default About;
