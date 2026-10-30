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

A project groups a user's PRDs. Projects are private to their owner.

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
  "id": "uuid", "title": "string", "owner_id": "uuid", "project_id": "uuid | null",
  "status": "draft | in_review | final | assigned",
  "content_json": { }, "content_text": "string | null",
  "doc_schema_version": 1, "revision": 3,
  "created_at": "…", "updated_at": "…"
}
```

**Who sees what (today):** a PRD is visible only to its owner (and legacy admin accounts). Status grants no visibility.
Sharing comes with per-PRD roles (E03): owner, editor, viewer.

| Route | Body / query | Response | Errors |
|---|---|---|---|
| `POST /api/prds` | `{ "title": string ≤ 200, "project_id": uuid \| null }` | 201 `PRD` (status `draft`, revision 1) | 403 if the account can't create PRDs (legacy engineer accounts); 404 if `project_id` isn't one of **your** projects; 422 |
| `GET /api/prds` | optional `?search=text` (matches title and content text) | 200 `PRD[]`, most recently updated first | |
| `GET /api/prds/{id}` | | 200 `PRD` | 404 |
| `PUT /api/prds/{id}` | `{ "revision": int, "title"?, "content_json"?, "content_text"? }`: only the fields you send change | 200 `PRD` with the new `revision` | 404 not visible; 403 visible but not editable; 409 `stale_revision`; 422 |
| `DELETE /api/prds/{id}` | | 204 | 404 |

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

See [Organizations](#organizations) for the rules (one org per account).

| PR | Route | Body | Response | Errors |
|---|---|---|---|---|
| #72 | `POST /api/organizations/join` | `{ "code": "K7QX-M2PA-9DZR" }` (any case, dashes and spaces optional) | 200 `{ organization_id }`; caller becomes a **member** | 404 `invalid_join_code`; 403 `membership_inactive` (ask an admin); 409 `already_in_organization` |
| #72 | `GET /api/organizations/{id}/join-code` | | 200 `{ join_code }` (admins only) | 403 members; 404 others |
| #72 | `POST /api/organizations/{id}/join-code` | | 200 `{ join_code }`: a **new** code; the old one stops working | 403 members; 404 others |

Next: per-PRD roles (E03) add `my_role` to PRDs, a "Shared with me" list (`GET /api/prds?view=owned|shared`) and
invites; admin routes for members, departments and teams (E02).

### AI (Marco)

Drafts: #63 generation service, #67 AI records and staged proposals, #68 per-user AI usage gate, #69
`POST /api/prds/{id}/generate` (generation preview), #70 accepting AI proposals through the normal save, #55 atomic
save and version history. Marco adds their request/response details here as they merge.

## Changes from the integration guide

Team decisions (2026-10-29/30) that change the Frontend Integration Guide v0.1:

- **No `can_approve` or `can_assign` flags.** Being assigned as a reviewer is what lets someone approve; PRD owners assign.
- **Org roles are `admin` and `member` only** (no `viewer`/`editor`). PRD access comes from per-PRD roles: owner, editor, viewer.
- **One org per account.** `GET /api/me` returns `organization` (object or `null`), not a `memberships` list.
- **Members join with an org code**, not admin-created accounts. There's no initial password and no
  `password_change_required` screen.
- **Org structure is optional:** new orgs have no default department or team, and a team may have no department.
- **Don't send `status` when saving a PRD.** A PRD moves from draft to in review when its owners assign reviewers.
