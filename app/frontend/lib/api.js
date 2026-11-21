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
    // 409s from deactivating someone list who or what needs a decision first.
    error.reports = body.reports;
    error.prds = body.prds;
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
  // A preview of a whole PRD: nothing is saved until it's accepted with a save
  // that carries the response's generation_record_id.
  generatePrd: (id, revision) =>
    request(`/prds/${id}/generate`, { method: "POST", body: JSON.stringify({ revision }) }),

  // The people on a PRD. PUT adds someone or changes their role, and returns
  // the updated list.
  listPrdMembers: (prdId) => request(`/prds/${prdId}/members`),
  setPrdMember: (prdId, userId, role) =>
    request(`/prds/${prdId}/members/${userId}`, { method: "PUT", body: JSON.stringify({ role }) }),
  removePrdMember: (prdId, userId) =>
    request(`/prds/${prdId}/members/${userId}`, { method: "DELETE" }),
  // Adds a team's current active members, as editors or viewers. People already
  // on the PRD keep their role. Resolves to { added, skipped, members }.
  addTeamToPrd: (prdId, teamId, role) =>
    request(`/prds/${prdId}/members/teams`, { method: "POST", body: JSON.stringify({ team_id: teamId, role }) }),
  // Up to three teams the AI suggests adding, each with a reason (feature
  // 08b). A preview: nothing changes until it's decided below. Resolves to
  // { recommendation: { id, teams: [TeamPick] }, base_revision, generation_record_id }.
  recommendTeams: (prdId, revision) =>
    request(`/prds/${prdId}/members/team-recommendations`, {
      method: "POST",
      body: JSON.stringify({ revision }),
    }),
  // Adds the picked teams ([{ teamId, role }]) in one step, or rejects them all
  // with an empty list. Resolves to { status, results, members }.
  decideTeamRecommendation: (prdId, recommendationId, teams) =>
    request(`/prds/${prdId}/members/team-recommendations/${recommendationId}/decision`, {
      method: "PUT",
      body: JSON.stringify(
        teams.length
          ? { decision: "accepted", teams: teams.map(({ teamId, role }) => ({ team_id: teamId, role })) }
          : { decision: "rejected" },
      ),
    }),

  // Answer-only PRD chat. `history` is the recent turns for this PRD only;
  // the backend caps it and never treats it as instructions. Resolves to
  // {kind: "answer" | "blocked" | "clarification", message, base_revision}.
  chatAboutPrd: (prdId, { revision, message, history }) =>
    request(`/prds/${prdId}/ai/chat`, {
      method: "POST",
      body: JSON.stringify({ revision, message, history }),
    }),

  // One proposal across the PRD from the chat (Marco, #138). Nothing is
  // saved; accept it through updatePrd (see editor/proposal.js).
  // With previousGenerationRecordId, adjusts that pending proposal instead.
  requestAiRevision: (prdId, { revision, instruction, sessionMessages = [], previousGenerationRecordId }) =>
    request(`/prds/${prdId}/ai-revisions`, {
      method: "POST",
      body: JSON.stringify({
        revision,
        instruction,
        session_messages: sessionMessages,
        ...(previousGenerationRecordId ? { previous_generation_record_id: previousGenerationRecordId } : {}),
      }),
    }),

  // One proposal addressing chosen comments on the current version (E12,
  // owners only). Nothing is saved; accept it like an AI revision.
  requestReviewSuggestion: (prdId, { revision, feedbackIds, instruction }) =>
    request(`/prds/${prdId}/review-suggestions`, {
      method: "POST",
      body: JSON.stringify({ revision, feedback_ids: feedbackIds, ...(instruction ? { instruction } : {}) }),
    }),

  // Linking a Discord account (feature 04). A one-time code the person runs as
  // /link in Discord; the bot then links it. Poll getDiscordLink to see it land.
  createDiscordLinkCode: () => request("/integrations/discord/link-code", { method: "POST" }),
  getDiscordLink: () => request("/integrations/discord/link"),
  unlinkDiscord: () => request("/integrations/discord/link", { method: "DELETE" }),

  listIntakeAnswers: (prdId) => request(`/prds/${prdId}/intake`),
  saveIntakeAnswer: (prdId, questionKey, answerText, skipped) =>
    request(`/prds/${prdId}/intake/${questionKey}`, {
      method: "PUT",
      body: JSON.stringify({ answer_text: answerText, skipped }),
    }),

  // The inbox. Every page carries the full `unread_count`, whatever the filter.
  listNotifications: ({ unreadOnly = false, limit = 25, cursor } = {}) => {
    const params = new URLSearchParams({ unread_only: String(unreadOnly), limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request(`/notifications?${params}`);
  },
  markNotificationRead: (id) =>
    request(`/notifications/${id}`, { method: "PATCH", body: JSON.stringify({ read: true }) }),
  // needs_my_approval or waiting_for_approval.
  listPrdsInView: (view) => request(`/prds?view=${encodeURIComponent(view)}`),

  // Org admins only. Send just the fields that change; null clears one.
  updateMember: (orgId, userId, changes) =>
    request(`/organizations/${orgId}/members/${userId}`, { method: "PATCH", body: JSON.stringify(changes) }),
  createDepartment: (orgId, name) =>
    request(`/organizations/${orgId}/departments`, { method: "POST", body: JSON.stringify({ name }) }),
  updateDepartment: (orgId, departmentId, changes) =>
    request(`/organizations/${orgId}/departments/${departmentId}`, { method: "PATCH", body: JSON.stringify(changes) }),
  createTeam: (orgId, name, departmentId) =>
    request(`/organizations/${orgId}/teams`, {
      method: "POST",
      body: JSON.stringify({ name, department_id: departmentId ?? null }),
    }),
  updateTeam: (orgId, teamId, changes) =>
    request(`/organizations/${orgId}/teams/${teamId}`, { method: "PATCH", body: JSON.stringify(changes) }),
  addTeamMember: (orgId, teamId, userId) =>
    request(`/organizations/${orgId}/teams/${teamId}/members/${userId}`, { method: "PUT" }),
    removeTeamMember: (orgId, teamId, userId) =>
    request(`/organizations/${orgId}/teams/${teamId}/members/${userId}`, { method: "DELETE" }),

  // Reviews: a round is tied to one saved version of the PRD.
  submitReview: (prdId, { revision, versionId, reviewerIds }) =>
    request(`/prds/${prdId}/reviews`, {
      method: "POST",
      body: JSON.stringify({ revision, version_id: versionId, reviewer_ids: reviewerIds }),
    }),

  // Newest round first, superseded rounds included.
  listReviews: (prdId, { limit = 25 } = {}) =>
    request(`/prds/${prdId}/reviews?limit=${limit}`),

  // decision: approved or changes_requested, which needs an explanation.
  decideReview: (prdId, roundId, { versionId, decision, explanation }) =>
    request(`/prds/${prdId}/reviews/${roundId}/decision`, {
      method: "PUT",
      body: JSON.stringify({ version_id: versionId, decision, ...(explanation ? { explanation } : {}) }),
    }),

  // Owners and org admins swap or drop a reviewer who hasn't decided yet, on an
  // open round. Both answer { round, revision, status }.
  replaceReviewer: (prdId, roundId, userId, reviewerId) =>
    request(`/prds/${prdId}/reviews/${roundId}/reviewers/${userId}/replace`, {
      method: "POST",
      body: JSON.stringify({ reviewer_id: reviewerId }),
    }),
  removeReviewer: (prdId, roundId, userId) =>
    request(`/prds/${prdId}/reviews/${roundId}/reviewers/${userId}`, { method: "DELETE" }),

  // Flat comments on a PRD's saved versions, oldest first. Without versionId,
  // every version's comments, each carrying its own version_no.
  listPrdComments: (prdId, { versionId, limit = 50, cursor } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (versionId) params.set("version_id", versionId);
    if (cursor) params.set("cursor", cursor);
    return request(`/prds/${prdId}/comments?${params}`);
  },
  // versionId is the PRD's current version; sectionType is one of the nine
  // section types, or null for the whole PRD. body is plain text. mentions is
  // the user ids of people @mentioned in it (up to 20, all able to see the PRD).
  addPrdComment: (prdId, { versionId, sectionType = null, body, mentions = [] }) =>
    request(`/prds/${prdId}/comments`, {
      method: "POST",
      body: JSON.stringify({
        version_id: versionId,
        section_type: sectionType,
        body,
        ...(mentions.length ? { mentions } : {}),
      }),
    }),

  // An AI summary of the comments on one saved version (feature 05): themes,
  // open questions, requested changes and unresolved items. Read-only: nothing
  // is saved. Without versionId, the PRD's current version.
  summarizeDiscussion: (prdId, { versionId } = {}) =>
    request(`/prds/${prdId}/discussion-summary`, {
      method: "POST",
      body: JSON.stringify(versionId ? { version_id: versionId } : {}),
    }),

  // A PRD's activity feed (E13): one event per change, newest first, paged
  // with next_cursor. types narrows it to those event types (repeated ?type=).
  listPrdEvents: (prdId, { types = [], limit = 25, cursor } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    for (const type of types) params.append("type", type);
    if (cursor) params.set("cursor", cursor);
    return request(`/prds/${prdId}/events?${params}`);
  },

  // Revision history (read-only): newest first, paged with next_cursor.
  listVersions: (prdId, { limit = 25, cursor } = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (cursor) params.set("cursor", cursor);
    return request(`/prds/${prdId}/versions?${params}`);
  },
  // One saved version with its title, description and document.
  getVersion: (prdId, versionId) => request(`/prds/${prdId}/versions/${versionId}`),

  // Work status changes only while approved; `from` is the status last seen.
  setWorkStatus: (prdId, { from, to }) =>
    request(`/prds/${prdId}/work-status`, { method: "PUT", body: JSON.stringify({ from, to }) }),
  // Owning team and priority; both are sent every time (null clears one).
  setRouting: (prdId, { teamId, priority }) =>
    request(`/prds/${prdId}/routing`, {
      method: "PUT",
      body: JSON.stringify({ owning_team_id: teamId, priority }),
    }),
  // An AI suggestion for the team and priority. Nothing changes until it's decided.
  suggestRouting: (prdId, revision) =>
    request(`/prds/${prdId}/classification`, { method: "POST", body: JSON.stringify({ revision }) }),
  // decision: "accepted" (optionally with another teamId or priority) or "rejected".
  decideRouting: (prdId, suggestionId, { decision, teamId, priority } = {}) => {
    const body = { decision };
    if (decision === "accepted" && teamId !== undefined) body.team_id = teamId;
    if (decision === "accepted" && priority !== undefined) body.priority = priority;
    return request(`/prds/${prdId}/classification/${suggestionId}/decision`, {
      method: "PUT",
      body: JSON.stringify(body),
    });
  },
};

