# Backend API for the frontend

What the backend accepts and returns **on `develop`**, plus what open PRs will change. It replaces the API parts of
the Frontend Integration Guide v0.1 where they differ (see [Changes from the integration guide](#changes-from-the-integration-guide)).

**Keeping it current:** every backend PR that adds or changes a route updates this file in the same PR. When a PR
merges, its entry moves from [Coming in open PRs](#coming-in-open-prs) into the main reference.

## Basics

- **Base path:** `/api`. Locally the Vite dev server proxies `/api` to the backend (http://localhost:5173 → :8000);
  on Vercel it's the same domain.
- **Auth:** send the Supabase session's access token on every route except health:
  `Authorization: Bearer <access_token>`. The backend works out who the user is from the token; never send a user id
  (or, once orgs land, an org id for the caller's own org).
- **JSON** in and out. IDs are UUID strings; timestamps are ISO 8601 in UTC.
- **Unknown fields are rejected** with 422, so a typo in a field name fails loudly instead of being ignored.
- **Optimistic concurrency on PRDs:** every PRD has a `revision`. Send the revision you last loaded with each update;
  if someone saved since, you get 409 `stale_revision`. Use the `revision` from the response for your next save.

## Errors

Every error has the same shape:

```json
{ "detail": "This PRD changed since you last loaded it. Refresh and try again.", "code": "stale_revision" }
```

- `detail` is always a readable sentence you can show as-is.
- `code` is stable: branch on it, not on `detail` or the status alone.
- 422 errors also include `errors`: `[{ "loc": ["body", "title"], "msg": "...", "type": "..." }]`.

| Status | `code` | When | Suggested handling |
|---|---|---|---|
| 400 | `bad_request` | The request is understood but not allowed as sent (e.g. an unknown intake question, an invalid value) | Show `detail` |
| 401 | `not_authenticated` | Missing, invalid or expired token | Send the user to sign in again |
| 403 | `forbidden` | Signed in but not allowed (e.g. can see a PRD but can't edit it) | Show `detail`; don't retry |
| 404 | `not_found` | Doesn't exist, **or** exists but you can't see it (same response on purpose) | Show "not found" |
| 409 | `stale_revision` | Someone saved the PRD after you loaded it | Reload the PRD, then let the user reapply their change |
| 409 | `conflict` | Other conflicts | Show `detail` |
| 422 | `validation_error` | Body or parameters don't match the schema (wrong type, too long, unknown field) | Show `detail`; it names the field |
| 500 | `database_error`, `internal_error` | A bug on our side | Show a generic error |
| 503 | `service_unavailable` | Supabase (database or sign-in) is unreachable or overloaded | "Try again shortly"; safe to retry |

AI routes add their own `ai_*` codes (see the Gemini client in `app/backend/ai/gemini_client.py`); they'll be listed
here when the AI routes merge.

## Health

| Route | Auth | Response |
|---|---|---|
| `GET /api/health` | none | `{"status": "ok"}` |
| `GET /api/health/db` | none | `{"status": "ok"}`, or 503 if the database is unreachable |

## Projects

A project groups a user's PRDs. Projects are private to their owner, and any signed-in user can create them.

`Project`: `{ id, name, owner_id, created_at, updated_at }`

| Route | Body | Response | Errors |
|---|---|---|---|
| `POST /api/projects` | `{ "name": string ≤ 200 }` | 201 `Project` | 422 |
| `GET /api/projects` | | 200 `Project[]`, most recently updated first | |
| `PUT /api/projects/{id}` | `{ "name": string ≤ 200 }` (rename) | 200 `Project` | 404, 422 |
| `DELETE /api/projects/{id}` | | 204. **Deletes the project's PRDs too.** | 404 |

## PRDs

`PRD`:

```json
{
  "id": "uuid", "title": "string", "owner_id": "uuid (the creator)", "organization_id": "uuid", "project_id": "uuid | null",
  "my_role": "owner | editor | viewer | org_admin",
  "status": "draft | in_review | final | assigned",
  "content_json": { }, "content_text": "string | null",
  "doc_schema_version": 1, "revision": 3,
  "created_at": "…", "updated_at": "…"
}
```

**Who can do what.** Access comes from the person's role on that PRD, or from being an admin of the PRD's organization.
Status and the old profile role (`pm`, `engineer`, `admin`) grant nothing.

| | View | Edit (title, content, intake answers) | Delete |
|---|---|---|---|
| Owner | yes | yes | yes |
| Editor | yes | yes | no |
| Viewer | yes | no (403) | no (404) |
| Org admin (any PRD in their org) | yes | yes | yes |
| Anyone else | no (404) | no (404) | no (404) |

The creator becomes the PRD's owner, and a PRD can have several owners. Roles stop counting if the person is
deactivated in the organization. Inviting people comes with E04.

Every PRD belongs to its creator's organization. `my_role` is the caller's access: their role on the PRD, or
`org_admin` when they only see it as an admin of its organization. Use it to decide which buttons to show.

| Route | Body / query | Response | Errors |
|---|---|---|---|
| `POST /api/prds` | `{ "title": string ≤ 200, "project_id": uuid \| null }` | 201 `PRD` (status `draft`, revision 1, `my_role: "owner"`), in your organization | 403 `no_organization` if the account has none; 404 if `project_id` isn't one of **your** projects; 422 |
| `GET /api/prds` | optional `?search=text` (matches title and content text); optional `?view=owned` (PRDs you own) or `?view=shared` (PRDs you were invited to as editor or viewer: "Shared with me") | 200 `PRD[]`, most recently updated first. Without `view`: every PRD you can see, which for an org admin is every PRD in the org | 422 unknown `view` |
| `GET /api/prds/{id}` | | 200 `PRD` | 404 |
| `PUT /api/prds/{id}` | `{ "revision": int, "title"?, "content_json"?, "content_text"? }`: only the fields you send change | 200 `PRD` with the new `revision` | 404 not visible; 403 visible but not editable; 409 `stale_revision`; 422 |
| `DELETE /api/prds/{id}` | | 204 | 404 unless you're an owner or an org admin |

- **Don't send `status` on save.** Review state changes only through the review workflow (Decision 6, #62). The backend
  still accepts it for now and will reject it with 422 once #62 is live.
- `content_json` is today's v1 shape (`{ description, sections: [...] }`). The Tiptap JSON v2 format is specified in
  [`docs/prd-document-format.md`](prd-document-format.md); saves switch to it with Marco's S03 work.

## Intake answers

The interview answers for a PRD, one per question.

`IntakeAnswer`: `{ question_key, answer_text, skipped, answered_at }`

Question keys: `problem`, `target_users`, `goals`, `scope`, `constraints`, `success_metrics`, `notes`.

| Route | Body | Response | Errors |
|---|---|---|---|
| `GET /api/prds/{id}/intake` | | 200 `IntakeAnswer[]` (empty if the PRD isn't visible) | |
| `PUT /api/prds/{id}/intake/{question_key}` | `{ "answer_text": string ≤ 5000, "skipped": bool }` | 200 `IntakeAnswer` (saving again overwrites) | 400 unknown question key; 422 |

## Organizations

**One organization per account.** A normal sign-up names an org and becomes its admin; members join with the org's
code from a "member sign-up" tab. Someone in two orgs uses two accounts. Orgs start with no departments or teams.
The backend finds the caller's org from their token, so routes for your own org never need an org id from you.

| Route | Body | Response | Errors |
|---|---|---|---|
| `POST /api/organizations` | `{ "name": string, 1–200 }` | 201 `{ organization_id }`; caller becomes **admin** | 409 `already_in_organization`; 422 |
| `GET /api/me` | | 200 `{ id, email, full_name, organization }` | |

`organization` in `GET /api/me` is `{ organization_id, name, access_role: "admin" | "member" }`, or **`null`** when the
account has no organization yet: show the "Create your organization" step. Call it after sign-in to decide which
screens to show (admin screens only for `access_role: "admin"`).

### Joining with a code

Each org has a join code that only its admins can see. A member sign-up: create the account, then send the code.

| Route | Body | Response | Errors |
|---|---|---|---|
| `POST /api/organizations/join` | `{ "code": "K7QX-M2PA-9DZR" }` (any case; dashes and spaces optional) | 200 `{ organization_id }`; caller becomes a **member** with no department or team | 404 `invalid_join_code`; 403 `membership_inactive` (deactivated there: ask an admin); 409 `already_in_organization` |
| `GET /api/organizations/{id}/join-code` | | 200 `{ join_code }` (admins only) | 403 members; 404 others |
| `POST /api/organizations/{id}/join-code` | | 200 `{ join_code }`: a **new** code; the old one stops working | 403 members; 404 others |

## Organization directory

Everything the org chart needs in one call. Only active members of the organization can read it.

| Route | Response | Errors |
|---|---|---|
| `GET /api/organizations/{id}/directory` | 200 `{ organization, departments, teams, members }` | 404 if you're not an active member (or it doesn't exist) |

```json
{
  "organization": { "id": "uuid", "name": "Acme" },
  "departments": [ { "id": "uuid", "name": "Product", "head_id": "uuid | null", "archived": false } ],
  "teams": [ { "id": "uuid", "name": "Growth", "department_id": "uuid | null", "lead_id": "uuid | null", "archived": false } ],
  "members": [ {
    "user_id": "uuid", "name": "Ben PM (or null)", "email": "only for admins, else null",
    "department_id": "uuid | null", "team_ids": ["uuid"],
    "access_role": "admin | member", "manager_id": "uuid | null", "title": "string | null"
  } ]
}
```

Members are active members only, sorted by name. Archived departments and teams are included with `archived: true`
so the chart can grey them out.

## Coming in open PRs

Not on `develop` yet. Shapes can still change in review; each PR updates its entry here.

### Organizations (Vineela)

Next: inviting people to a PRD (E04) and admin routes for members, departments and teams (E02).

### AI (Marco)

**Status: all draft.** These routes are in open PRs and are **not on `develop`** and **not deployed**. Shapes can still
change in review. AI also needs migrations that aren't applied to the hosted database, and a Gemini key in Vercel.

| PR | Route | Body | Response | Who |
|---|---|---|---|---|
| #69 (+ #74) | `POST /api/prds/{id}/generate` | `{ "revision": int }` | 200 `{ proposal: { title, description, content_json, doc_schema_version: 2, sources: [] }, base_revision, generation_record_id }`. A preview only: nothing is saved | Can edit the PRD |
| #70 (+ #81) | `PUT /api/prds/{id}` | adds optional `generation_record_id` to accept a proposal (edited or not) | the saved PRD. **Not wired yet:** #81 passes it through once #70 merges | Can edit |
| #85 | `POST /api/prds/{id}/ai-edit` | `{ "revision": int, "section_type": "goals", "instruction": "1–2000 chars", "session_messages": [ { "role": "user" \| "assistant", "content": "1–8000 chars" } ] }` (at most 20; the chat's recent turns) | 200 `{ kind: "proposal" \| "blocked" \| "clarification", message, proposal, base_revision, generation_record_id }`. `proposal` is `{ section_type, section, content_json }` (null unless `kind` is `"proposal"`). Nothing is saved | **Can edit** the PRD |
| #75 | `POST /api/prds/{id}/ai/chat` | `{ "revision": int, "message": "1–2000 chars", "history": [ { "role": "user" \| "assistant", "content": "1–8000 chars" } ] }` (at most 20 history items; earlier answers can be up to 8000 characters) | 200 `{ kind: "answer" \| "blocked" \| "clarification", message, base_revision, generation_record_id }`. Answers only; never changes the PRD | Can view the PRD |

- **Generate:** needs answers to `problem`, `target_users` and `goals`. It uses the PRD's title, description, answers
  and saved AI context.
- **AI edit (one section):** for editors (viewers can still chat; they get 403 here).
  - `message` explains the change. `content_json` is the saved document with only that section replaced (or
    inserted in the standard order), ready to preview.
  - **Accept** by saving `content_json` with `generation_record_id`: unchanged, or with only that section edited.
    Other sections, the title and the description must not change in that save, so save manual edits first, as the
    guide says.
  - An unchanged section gets the AI highlight; an edited one doesn't. Reject by discarding.
  - A save in between makes the proposal stale (409).
  - The PRD must already be in the v2 format (409 `document_not_v2` otherwise).
  - `session_messages` uses `content`, like the chat's `history`. The integration guide v0.1 example says `text`.
  - Like the chat, it returns 503 until Om's guardrail modules are in.
- **Frontend work for AI edits (Om/Aksh):** the editor's Rewrite / Expand / Shorten / Improve / Insert actions are
  still stand-ins. Each maps to `ai-edit` with the scoped section's `type` and an instruction (the action, plus any
  selected text).
  - The preview and accept need the v2 editor, because the result is a v2 section.
  - Lock editing while the request runs.
  - Review-feedback edits (E12) will reuse this flow once review tables exist.
- **Accepting a proposal:** send its `generation_record_id` with the save. The AI highlight (`ai_generated` mark) goes
  only on sections accepted unchanged. A proposal can be used once, by the person who asked for it, at the revision
  it was made for.
- **Chat:** `blocked` and `clarification` carry a fixed message; show it like an answer. Keep `history` in the
  browser for the open PRD only, and clear it when another PRD opens. **Disabled until Om's guardrail and prompt
  modules are in**: until then it returns 503 `ai_chat_unavailable`. Edit suggestions in chat come later, through the
  same proposal and save flow.
- **Limits (all AI routes):** one AI request per user at a time, plus a short cooldown between requests. A request
  takes at most about 3 minutes. Show a waiting state; there's no streaming.

AI error codes (all routes above; `{detail, code}` as usual; `detail` is safe to show):

| Status | `code` | When | Suggested handling |
|---|---|---|---|
| 409 | `stale_revision` | The PRD changed since you loaded it | Reload, then retry |
| 409 | `intake_changed` | (generate) the answers changed while the draft was written | "Generate again" |
| 409 | `proposal_unavailable` | (accept) the proposal was already used, expired, or isn't yours | Discard the preview |
| 409 | `document_not_v2` | (ai-edit) the PRD is still in the old format | Hide AI edits for it |
| 422 | `proposal_scope` | (accept a section edit) the save changed something besides that section, or sent title/description | Save manual edits first, then accept |
| 422 | `intake_incomplete` | (generate) a required answer is missing | Send the user to the interview |
| 422 | `invalid_context` | the PRD's saved AI context is malformed | Show `detail` |
| 422 | `ai_output_blocked` | the AI declined the request | Suggest rewording |
| 429 | `ai_cooldown`, `ai_busy` | AI limits; the body and `Retry-After` header include `retry_after` (seconds) | Disable AI buttons until then |
| 429 | `ai_disabled` | AI is switched off | Hide AI actions; manual editing works |
| 429 | `ai_provider_rate_limited` | Gemini is rate limited | "Try again in a minute" |
| 502 | `ai_provider_error`, `ai_invalid_output` | Gemini failed or answered badly | Offer a retry |
| 503 | `ai_unavailable`, `ai_budget_exhausted` | AI isn't configured or is out of quota | Keep manual editing |
| 503 | `ai_chat_unavailable` | (chat) not switched on yet | Hide the chat |

## Changes from the integration guide

Team decisions (2026-10-29/30) that change the Frontend Integration Guide v0.1:

- **No `can_approve` or `can_assign` flags.** Being assigned as a reviewer is what lets someone approve; PRD owners assign.
- **Org roles are `admin` and `member` only** (no `viewer`/`editor`). PRD access comes from per-PRD roles: owner, editor, viewer.
- **One org per account.** `GET /api/me` returns `organization` (object or `null`), not a `memberships` list.
- **Members join with an org code**, not admin-created accounts. There's no initial password and no
  `password_change_required` screen.
- **Org structure is optional:** new orgs have no default department or team, and a team may have no department.
- **Don't send `status` when saving a PRD.** A PRD moves from draft to in review when its owners assign reviewers.
