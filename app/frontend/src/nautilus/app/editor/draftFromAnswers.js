import { PRD_SECTIONS, QUESTIONS, parseAnswer } from "../questions";
import { escapeHtml } from "./escape";

// A first draft built only from the person's own interview answers: each
// answer is placed in the section it belongs to and nothing is made up, so
// sections with no matching answer start empty for the author to write.
// Used when AI generation isn't available ("Start from my answers").

function paragraphs(text) {
  return text
    .split(/\n{2,}/)
    .map((block) => block.trim())
    .filter(Boolean)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

function labelled(label, text) {
  if (!text) return "";
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(text).replace(/\n/g, "<br>")}</p>`;
}

function bullets(items) {
  if (!items.length) return "";
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

export function draftFromAnswers(answers) {
  const parsed = Object.fromEntries(
    QUESTIONS.map((question) => [question.id, parseAnswer(question, answers[question.id])]),
  );
  const { problem, target_users: users, goals, scope, constraints, success_metrics: metrics } = parsed;

  const html = {
    problem: paragraphs(problem.problem) + labelled("How it’s handled today", problem.today),
    goals: paragraphs(goals.users) + labelled("For the team", goals.team),
    non_goals: paragraphs(scope.out),
    target_users:
      bullets(users.groups) +
      paragraphs(users.users) +
      labelled("What they want to accomplish", users.needs) +
      labelled("Pain points today", users.pains),
    user_stories: "",
    requirements: labelled("In scope", scope.in),
    success_metrics: paragraphs(metrics.metrics),
    risks: labelled("Constraints", constraints.constraints),
    open_questions: "",
  };

  return PRD_SECTIONS.map((section) => ({
    id: section.id,
    title: section.label,
    html: html[section.id] || "<p></p>",
  }));
}
