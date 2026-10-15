// Mock data for the UI prototype. Nothing here is persisted.

export const TAKEN_EMAILS = ["taken@example.com", "demo@nautilus.app"];

export const INITIAL_PROJECTS = [
  { id: "p1", name: "Student Apps", description: "Apps for campus life" },
  { id: "p2", name: "Capstone", description: "Senior capstone work" },
];

export const QUESTIONS = [
  {
    id: "problem",
    label: "Problem",
    prompt: "Hi! I'll ask a few questions to build your PRD. First: what problem are you solving?",
    required: true,
  },
  {
    id: "users",
    label: "Target users",
    prompt: "Who will use this product?",
    required: true,
  },
  {
    id: "goals",
    label: "Goals",
    prompt: "What do you want to accomplish?",
    hint: "Example: help students join a group within one day of searching.",
    required: true,
  },
  {
    id: "scope",
    label: "Scope",
    prompt: "What is in scope, and what is out of scope?",
    hint: "Example: In: group search, join requests. Out: video calls.",
    required: false,
  },
  {
    id: "constraints",
    label: "Constraints",
    prompt: "Are there any constraints, like platform, time, or team size?",
    required: false,
  },
  {
    id: "metrics",
    label: "Success metrics",
    prompt: "How will you know the product is successful?",
    required: false,
  },
  {
    id: "notes",
    label: "Additional notes",
    prompt: "Anything else? Links or research notes are welcome.",
    required: false,
  },
];

export const SAMPLE_ANSWERS = {
  problem: "Students struggle to find study groups for their classes.",
  users: "Undergraduates at one university, mostly first and second year.",
  goals: "Help students join a group within one day of searching.",
  scope: "In: group search, join requests. Out: video calls.",
  constraints: "Web only, one semester, team of five.",
  metrics: "",
  notes: "",
};

const CAMPUS_SECTIONS = [
  {
    id: "problem",
    title: "Problem Statement",
    html: "<p>Students at [University] struggle to find study groups for their courses. Many study alone, miss deadlines, and have no easy way to meet classmates in the same class. Existing group chats are hard to discover and quickly go stale.</p>",
  },
  {
    id: "goals",
    title: "Goals",
    html: "<ul><li>Help students join a relevant study group within one day of searching.</li><li>Let students create and manage their own groups.</li><li>Keep group details current and easy to scan.</li></ul>",
  },
  {
    id: "nongoals",
    title: "Non-Goals",
    html: "<ul><li>Video calls or built-in chat.</li><li>Tutoring marketplaces or paid features.</li><li>Support for universities beyond the pilot campus.</li></ul>",
  },
  {
    id: "users",
    title: "Target Users",
    html: '<p>Undergraduate students at the pilot university, mostly first and second year. <mark class="nt-assumption" data-assumption="1">Most users are likely on mobile phones between classes.</mark></p><ul><li>Joiners who want an existing group for a course.</li><li>Organizers who want to start and fill a group.</li></ul>',
    assumptions: 1,
  },
  {
    id: "stories",
    title: "User Stories",
    html: "<ul><li>As a student, I filter groups by course so I can find one that fits.</li><li>As a student, I request to join a group so the organizer can approve me.</li><li>As an organizer, I edit meeting times so members stay informed.</li></ul>",
  },
  {
    id: "requirements",
    title: "Requirements",
    html: "<ul><li>FR-01: Students search groups by course code and section.</li><li>FR-02: Students request to join a group.</li><li>FR-03: Organizers approve or decline join requests.</li></ul>",
  },
  {
    id: "metrics",
    title: "Success Metrics",
    html: '<ul><li><mark class="nt-assumption" data-assumption="1">60% of searching students join a group within 24 hours.</mark></li><li>Weekly active groups grow through the semester.</li></ul>',
    assumptions: 1,
  },
  {
    id: "risks",
    title: "Risks",
    html: "<ul><li>Low adoption if too few groups exist at launch.</li><li>Stale groups that no longer meet.</li></ul>",
  },
  {
    id: "questions",
    title: "Open Questions",
    html: "<ul><li>Should groups be tied to a specific section or the whole course?</li><li>Do organizers need moderation tools?</li></ul>",
  },
];

export const INITIAL_PRDS = [
  {
    id: "d1",
    title: "CampusConnect PRD",
    projectId: "p1",
    status: "Updated",
    modified: "2026-10-12",
    answers: SAMPLE_ANSWERS,
    sections: CAMPUS_SECTIONS,
  },
  {
    id: "d2",
    title: "Study Group Finder",
    projectId: "p1",
    status: "Generated",
    modified: "2026-10-09",
    answers: SAMPLE_ANSWERS,
    sections: CAMPUS_SECTIONS,
  },
  {
    id: "d3",
    title: "Capstone Scheduler",
    projectId: "p2",
    status: "Draft",
    modified: "2026-10-05",
    answers: {},
    sections: null,
  },
  {
    id: "d4",
    title: "Notes App Idea",
    projectId: null,
    status: "Draft",
    modified: "2026-09-28",
    answers: {},
    sections: null,
  },
];

function escapeHtml(text) {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

// Fakes the AI draft: uses the interview answers where we have them and
// sample text everywhere else.
export function draftSectionsFromAnswers(answers) {
  const fromAnswer = (key) =>
    answers[key] ? `<p>${escapeHtml(answers[key])}</p>` : null;

  return CAMPUS_SECTIONS.map((section) => {
    const override =
      (section.id === "problem" && fromAnswer("problem")) ||
      (section.id === "goals" && fromAnswer("goals")) ||
      (section.id === "metrics" && fromAnswer("metrics"));
    if (section.id === "users" && answers.users) {
      return {
        ...section,
        html: `<p>${escapeHtml(answers.users)} <mark class="nt-assumption" data-assumption="1">Most users are likely on mobile phones between classes.</mark></p>`,
      };
    }
    return override ? { ...section, html: override, assumptions: 0 } : section;
  });
}

export function formatDate(iso) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}
