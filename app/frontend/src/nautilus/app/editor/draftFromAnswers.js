import { PRD_SECTIONS, QUESTIONS, parseAnswer } from "../questions";

// A first draft built only from the person's own interview answers: each
// answer is placed in the section it belongs to and nothing is made up, so
// sections with no matching answer start empty for the author to write.
// Used when AI generation isn't available ("Start from my answers").
//
// The draft is a saved v2 document (docs/prd-document-format.md), built as
// plain JSON so this screen doesn't load the editor.

// Text with its single line breaks as hard breaks. Empty text has no nodes:
// the format doesn't allow empty text nodes.
function inline(text, marks) {
  const nodes = [];
  text.split("\n").forEach((line, index) => {
    if (index) nodes.push({ type: "hardBreak" });
    if (line) nodes.push(marks ? { type: "text", text: line, marks } : { type: "text", text: line });
  });
  return nodes;
}

function paragraphs(text) {
  return (text ?? "")
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => ({ type: "paragraph", content: inline(block) }));
}

function labelled(label, text) {
  if (!text) return [];
  return [{
    type: "paragraph",
    content: [...inline(`${label}:`, [{ type: "bold" }]), { type: "text", text: " " }, ...inline(text)],
  }];
}

function bullets(items) {
  if (!items.length) return [];
  return [{
    type: "bulletList",
    content: items.map((item) => ({ type: "listItem", content: [{ type: "paragraph", content: inline(item) }] })),
  }];
}

export function draftFromAnswers(answers) {
  const parsed = Object.fromEntries(
    QUESTIONS.map((question) => [question.id, parseAnswer(question, answers[question.id])]),
  );
  const { problem, target_users: users, goals, scope, constraints, success_metrics: metrics } = parsed;

  const blocks = {
    problem: [...paragraphs(problem.problem), ...labelled("How it’s handled today", problem.today)],
    goals: [...paragraphs(goals.users), ...labelled("For the team", goals.team)],
    non_goals: paragraphs(scope.out),
    target_users: [
      ...bullets(users.groups),
      ...paragraphs(users.users),
      ...labelled("What they want to accomplish", users.needs),
      ...labelled("Pain points today", users.pains),
    ],
    user_stories: [],
    requirements: labelled("In scope", scope.in),
    success_metrics: paragraphs(metrics.metrics),
    risks: labelled("Constraints", constraints.constraints),
    open_questions: [],
  };

  return {
    type: "doc",
    content: PRD_SECTIONS.map((section) => ({
      type: "section",
      attrs: { type: section.id },
      content: blocks[section.id].length ? blocks[section.id] : [{ type: "paragraph" }],
    })),
  };
}
