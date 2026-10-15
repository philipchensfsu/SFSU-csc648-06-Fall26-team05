import { supabase } from "./supabaseClient";

async function request(path, options = {}) {
  const { data } = (await supabase?.auth.getSession()) ?? { data: {} };
  const token = data.session?.access_token;

  const response = await fetch(`/api${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.detail || `Request failed: ${response.status}`);
  }

  if (response.status === 204) return null;
  return response.json();
}

export const api = {
  listProjects: () => request("/projects"),
  createProject: (name) =>
    request("/projects", { method: "POST", body: JSON.stringify({ name }) }),
  deleteProject: (id) => request(`/projects/${id}`, { method: "DELETE" }),

  listPrds: () => request("/prds"),
  createPrd: (title, projectId) =>
    request("/prds", {
      method: "POST",
      body: JSON.stringify({ title, project_id: projectId ?? null }),
    }),
  getPrd: (id) => request(`/prds/${id}`),
  updatePrd: (id, payload) =>
    request(`/prds/${id}`, { method: "PUT", body: JSON.stringify(payload) }),
  deletePrd: (id) => request(`/prds/${id}`, { method: "DELETE" }),
};
