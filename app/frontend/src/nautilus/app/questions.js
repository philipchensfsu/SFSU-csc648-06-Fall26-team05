// The seven discovery-interview questions. Their ids are the intake
// question keys the API accepts (INTAKE_QUESTION_KEYS in main.py), in order.
//
// A question can have several parts on screen (A, B, C), but the API stores
// one answer_text per question, so the parts are saved together as plain
// text: each filled part as its label on one line and the answer below,
// separated by blank lines. That text reads naturally in the review screen
// and as input to PRD generation, and parseAnswer turns it back into parts.
// Answers saved before parts existed (one plain paragraph) load into part A.

export const QUESTIONS = [
  {
    id: "problem",
    label: "Problem",
    required: true,
    title: (name) => `What problem does ${name} solve?`,
    intro:
      "Describe the problem in your users’ words, not the solution. Nautilus builds the problem statement and goals from it.",
    parts: [
      {
        key: "problem",
        label: "What problem are you solving?",
        rows: 4,
        tips: ["Who has it", "How often", "What it costs them"],
      },
      {
        key: "today",
        label: "How is the problem handled today?",
        rows: 3,
        tips: ["Workarounds", "Tools they use"],
      },
    ],
  },
  {
    id: "target_users",
    label: "Target users",
    required: true,
    title: (name) => `Who is ${name} for?`,
    intro:
      "Be specific. “Students” is a start; “first-years in 300-person intro courses” gives Nautilus enough to write useful target users and user stories. The three parts below are saved together as one answer.",
    parts: [
      { key: "users", label: "Who are the primary users?", rows: 3, groups: true, textLabel: "Describe them" },
      { key: "needs", label: "What do these users want to accomplish?", rows: 3 },
      {
        key: "pains",
        label: "What pain points do they experience today?",
        rows: 4,
        tips: ["Frequency", "Workarounds", "Cost of the problem"],
      },
    ],
  },
  {
    id: "goals",
    label: "Goals",
    required: true,
    title: (name) => `What should ${name} achieve?`,
    intro:
      "Goals are outcomes, not features. Nautilus writes them into the goals section and checks the requirements against them.",
    parts: [
      {
        key: "users",
        label: "What changes for your users?",
        rows: 4,
        tips: ["A change in behavior", "A time frame"],
      },
      { key: "team", label: "What does your team or organization need from it?", rows: 3 },
    ],
  },
  {
    id: "scope",
    label: "Scope",
    required: false,
    title: () => "What’s in and out of the first version?",
    intro: "Drawing the line early keeps the PRD focused. Whatever you leave out becomes a non-goal.",
    parts: [
      { key: "in", label: "In scope", rows: 3, tips: ["Must-have features"] },
      { key: "out", label: "Out of scope", rows: 3, tips: ["Later versions", "Things you won’t build"] },
    ],
  },
  {
    id: "constraints",
    label: "Constraints",
    required: false,
    title: () => "What does the team have to work within?",
    intro:
      "Deadlines, platforms, budget, team size, technology or policy. Nautilus uses these to keep requirements realistic and to point out risks.",
    parts: [
      {
        key: "constraints",
        label: "Constraints",
        rows: 5,
        tips: ["Platform", "Deadline", "Team size", "Budget", "Tech stack"],
      },
    ],
  },
  {
    id: "success_metrics",
    label: "Success metrics",
    required: false,
    title: (name) => `How will you know ${name} worked?`,
    intro: "Name what you would measure and, if you can, a target. These become the success metrics section.",
    parts: [
      {
        key: "metrics",
        label: "What would you measure?",
        rows: 5,
        tips: ["A number to hit", "By when", "Where the data comes from"],
      },
    ],
  },
  {
    id: "notes",
    label: "Notes",
    required: false,
    title: () => "Anything else Nautilus should know?",
    intro:
      "Links, research, competitors, decisions already made. Everything here is used as background for the PRD.",
    parts: [{ key: "notes", label: "Notes", rows: 7 }],
  },
];

// The nine standard sections of every PRD, in order. `id` is the section
// type stored in content_json (Section 1.5 of the M2 report).
export const PRD_SECTIONS = [
  { id: "problem", label: "Problem statement" },
  { id: "goals", label: "Goals" },
  { id: "non_goals", label: "Non-goals" },
  { id: "target_users", label: "Target users" },
  { id: "user_stories", label: "User stories" },
  { id: "requirements", label: "Requirements" },
  { id: "success_metrics", label: "Success metrics" },
  { id: "risks", label: "Risks" },
  { id: "open_questions", label: "Open questions" },
];

// Leaves room for the labels inside the API's 5,000-character answer limit.
export function partMaxLength(question) {
  const labels = question.parts.reduce((total, part) => total + part.label.length + 3, 0);
  const groups = question.parts.some((part) => part.groups)
    ? MAX_GROUPS * (MAX_GROUP_LENGTH + 2) + 20 : 0;
  return Math.floor((4800 - labels - groups) / question.parts.length);
}

export const MAX_GROUPS = 8;
export const MAX_GROUP_LENGTH = 60;
const GROUPS_PREFIX = "User groups:";

// A question counts as answered once it has been saved; an optional one may
// be saved empty (skipped), a required one needs some text.
export function isAnswered(question, answers) {
  if (!(question.id in answers)) return false;
  return !question.required || Boolean(answers[question.id]?.trim());
}

export function isSkipped(question, answers) {
  return question.id in answers && !answers[question.id]?.trim();
}

// Saved text -> { [part.key]: text, groups: [] }
export function parseAnswer(question, text) {
  const values = { groups: [] };
  question.parts.forEach((part) => {
    values[part.key] = "";
  });
  const raw = (text ?? "").replace(/\r\n?/g, "\n");
  if (question.parts.length === 1) {
    values[question.parts[0].key] = raw.trim();
    return values;
  }
  const byLabel = new Map(question.parts.map((part) => [part.label, part]));
  const lines = new Map(question.parts.map((part) => [part.key, []]));
  let current = question.parts[0];
  raw.split("\n").forEach((line) => {
    const part = byLabel.get(line.trim());
    if (part) current = part;
    else lines.get(current.key).push(line);
  });
  question.parts.forEach((part) => {
    let body = lines.get(part.key).join("\n").trim();
    if (part.groups && body.startsWith(GROUPS_PREFIX)) {
      const [first, ...rest] = body.split("\n");
      values.groups = first
        .slice(GROUPS_PREFIX.length)
        .split(";")
        .map((group) => group.trim())
        .filter(Boolean);
      body = rest.join("\n").trim();
    }
    values[part.key] = body;
  });
  return values;
}

// { [part.key]: text, groups: [] } -> the text that is saved
export function serializeAnswer(question, values) {
  const blocks = question.parts
    .map((part) => {
      let body = (values[part.key] ?? "").trim();
      if (part.groups && values.groups?.length) {
        body = `${GROUPS_PREFIX} ${values.groups.join("; ")}${body ? `\n${body}` : ""}`;
      }
      return body ? { label: part.label, body } : null;
    })
    .filter(Boolean);
  if (question.parts.length === 1) return blocks[0]?.body ?? "";
  return blocks.map((block) => `${block.label}\n${block.body}`).join("\n\n");
}
