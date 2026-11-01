import { supabase } from "./supabaseClient";

async function request(path, options = {}) {
  const { data } = (await supabase?.auth.getSession()) ?? { data: {} };
  const token = data.session?.access_token;

  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
    });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error("Couldn’t reach the server. Check your connection and try again.");
    }
    throw error;
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.detail || `Request failed: ${response.status}`);
    error.status = response.status;
    // The S01 contract carries a stable `code` so callers can branch on the
    // reason rather than the message; the AI limits add `retry_after`.
    error.code = body.code;
    error.retryAfter = body.retry_after;
    // 422 invalid_document lists each problem with its path in the document.
    error.errors = body.errors;
    throw error;
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  // The signed-in account and its organization (null until it has one).
  getMe: () => request("/me"),
  createOrganization: (name) =>
    request("/organizations", { method: "POST", body: JSON.stringify({ name }) }),
  joinOrganization: (code) =>
    request("/organizations/join", { method: "POST", body: JSON.stringify({ code }) }),
  // Admins only; a new code stops the old one working.
  getJoinCode: (orgId) => request(`/organizations/${orgId}/join-code`),
  regenerateJoinCode: (orgId) => request(`/organizations/${orgId}/join-code`, { method: "POST" }),
  // Active members (emails only for admins), departments and teams.
  getDirectory: (orgId) => request(`/organizations/${orgId}/directory`),

  listProjects: () => request("/projects"),
  createProject: (name) =>
    request("/projects", { method: "POST", body: JSON.stringify({ name }) }),
  renameProject: (id, name) =>
    request(`/projects/${id}`, { method: "PUT", body: JSON.stringify({ name }) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),

  listPrds: (search) =>
    request(search ? `/prds?search=${encodeURIComponent(search)}` : "/prds"),
  createPrd: (title, projectId) =>
    request("/prds", {
      method: "POST",
      body: JSON.stringify({ title, project_id: projectId ?? null }),
    }),
  getPrd: (id) => request(`/prds/${id}`),
  updatePrd: (id, payload) =>
    request(`/prds/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deletePrd: (id) => request(`/prds/${id}`, { method: "DELETE" }),

  // Answer-only PRD chat. `history` is the recent turns for this PRD only;
  // the backend caps it and never treats it as instructions. Resolves to
  // {kind: "answer" | "blocked" | "clarification", message, base_revision}.
  chatAboutPrd: (prdId, { revision, message, history }) =>
    request(`/prds/${prdId}/ai/chat`, {
      method: "POST",
      body: JSON.stringify({ revision, message, history }),
    }),

  listIntakeAnswers: (prdId) => request(`/prds/${prdId}/intake`),
  saveIntakeAnswer: (prdId, questionKey, answerText, skipped) =>
    request(`/prds/${prdId}/intake/${questionKey}`, {
      method: "PUT",
      body: JSON.stringify({ answer_text: answerText, skipped }),
    }),
};
