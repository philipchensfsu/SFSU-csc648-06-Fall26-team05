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
deactivated in the organization. Owners and org admins invite people: see [People on a PRD](#people-on-a-prd).

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

### People on a PRD

Owners and org admins invite people from the PRD's organization, change their roles and remove them. Anyone on a
PRD can see who's on it and can leave it. A PRD always keeps at least one owner.

`PRDMember`: `{ "user_id": "uuid", "name": "string | null", "role": "owner | editor | viewer", "granted_by": "uuid | null", "added_at": "…" }`

| Route | Body | Response | Errors |
|---|---|---|---|
| `GET /api/prds/{id}/members` | | 200 `PRDMember[]`, in the order they were added (the creator first) | 404 if you can't see the PRD |
| `PUT /api/prds/{id}/members/{user_id}` | `{ "role": "owner" \| "editor" \| "viewer" }` | 200 `PRDMember[]` (the updated list): adds the person, or changes their role | 404 can't see the PRD; 403 `forbidden` not an owner or org admin; 422 `not_in_organization` (not an active member of the PRD's org); 422 `validation_error` unknown role; 409 `owner_required` (demoting the last owner) |
| `DELETE /api/prds/{id}/members/{user_id}` | | 204, also when the person wasn't on it | 404; 403 removing someone else without managing the PRD; 409 `owner_required` (the last owner) |

- To leave a PRD, `DELETE` with your own `user_id`. Afterwards it's 404 for you unless you're an org admin.
- An owner who demotes themselves loses the right to manage people straight away.
- Pick invitees from the [organization directory](#organization-directory) (`members[].user_id`).
- Inviting someone sends them a [notification](#notifications). Setting a role someone already has changes nothing.

### Comments

Flat comments on a PRD's saved version. Anyone who can view the PRD (owners, editors, viewers, org admins) can read
and post them. New comments go on the PRD's **current** version; older comments stay readable and carry their
`version_no` for a "v2" label. No replies, edits, deletes or mentions. Comments never change the PRD, its revision or
its review.

`Comment`:

```json
{
  "id": "uuid", "prd_id": "uuid", "version_id": "uuid", "version_no": 3, "section_type": "goals | null",
  "author": { "id": "uuid | null", "name": "string | null", "department": "string | null" },
  "body": "plain text", "created_at": "…"
}
```

| Route | Body | Response | Errors |
|---|---|---|---|
| `GET /api/prds/{id}/comments?version_id=&limit=25&cursor=` | | 200 `{ "items": Comment[], "next_cursor": "string \| null" }`, **oldest first**; without `version_id`, every version's comments | 404 if you can't see the PRD; 400 `invalid_cursor` |
| `POST /api/prds/{id}/comments` | `{ "version_id": "uuid", "section_type": null \| "<section type>", "body": "1–5,000 chars" }` | 201 `Comment` | 404; 409 `no_saved_version` (the PRD has never been saved: disable the comment box); 409 `stale_version` (someone saved since: reload, keep the draft, post again); 422 `validation_error` (blank or too-long body, unknown section) |

- Send the `current_version_id` from the PRD you loaded as `version_id`.
- `section_type` is one of the nine section types in [`prd-document-format.md`](prd-document-format.md), or `null`
  for the whole PRD.
- **`body` is plain text: escape it when rendering**, and keep line breaks.
- `author.name` and `author.department` are frozen when the comment is posted, so later renames or department
  moves don't change them.
- Posting notifies the PRD's owners and editors (`comment_added`, with `comment_id` and `version_id` set). Inbox
  `payload`: `{ section_type }`.

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

Reading `organization` straight from Supabase (not through these routes): name the columns, e.g.
`select=id,name`. `select *` fails with 401/403, because clients can't read the `join_code` column.

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

## Notifications

Each person's in-app inbox. Notifications are created by the actions themselves (for now: being invited to a PRD and
comments; review notifications arrive with E07–E08). You never get one for your own action, and notifications
about a PRD you can no longer see are hidden from the list and the unread count.

`Notification`:

```json
{
  "id": "uuid", "type": "member_added", "prd_id": "uuid", "title": "PRD title",
  "actor_id": "uuid | null", "actor_name": "string | null", "payload": { "user_id": "uuid", "role": "editor" },
  "version_id": "uuid | null", "round_id": "uuid | null", "comment_id": "uuid | null",
  "created_at": "…", "read_at": "… | null", "count": 1, "updated_at": "…"
}
```

| Route | Body | Response | Errors |
|---|---|---|---|
| `GET /api/notifications?unread_only=false&limit=25&cursor=` | | 200 `{ "items": Notification[], "next_cursor": "string \| null", "unread_count": int }`, newest first | 400 `invalid_cursor` |
| `PATCH /api/notifications/{id}` | `{ "read": true }` | 200 `Notification`; repeating it succeeds and keeps the first `read_at` | 404 not yours (or the PRD is hidden from you); 422 anything but `read: true` |

- **Paging:** `limit` is 1–100 (default 25). Send `next_cursor` back as `cursor` for the next page; `null` means the end.
  `unread_count` always counts all your unread notifications, whatever page or filter you asked for.
- **`type`** is the event that caused it. Link to the PRD with `prd_id`; `version_id`, `round_id` and `comment_id`
  are set when the event has them. `actor_name` is the actor's name at the time (`null` for system or AI actions).
- **`payload` by type:** `member_added`: `{ user_id, role }`; `comment_added`: `{ section_type }`. Types still to come: `submitted`,
  `approved`, `changes_requested`, `round_approved`, `superseded`, `work_status_changed`.
- **Comment batching:** several comments from one person on one PRD, starting within 10 minutes of the first, share
  one unread notification. `count` is how many comments it stands for ("Ed left 3 comments"), `comment_id` points at
  the first one and `updated_at` is when the latest arrived. Once read, the next comment starts a new notification.
  Other types always have `count: 1`.
- No realtime updates: refetch the unread count when the user navigates or on a timer.

## Coming in open PRs

Not on `develop` yet. Shapes can still change in review; each PR updates its entry here.

### Organizations (Vineela)

Next: admin routes for members, departments and teams (E02).

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
