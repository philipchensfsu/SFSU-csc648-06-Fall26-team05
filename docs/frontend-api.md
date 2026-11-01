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
| 400 | `invalid_cursor` | A paged list got a `cursor` it didn't issue (edited, truncated, or from another list) | Drop the cursor and load the first page again |
| 401 | `not_authenticated` | Missing, invalid or expired token | Send the user to sign in again |
| 403 | `forbidden` | Signed in but not allowed (e.g. can see a PRD but can't edit it) | Show `detail`; don't retry |
| 404 | `not_found` | Doesn't exist, **or** exists but you can't see it (same response on purpose) | Show "not found" |
| 405 | `method_not_allowed` | The path exists but not with this HTTP method | A bug in the call; fix the method |
| 409 | `stale_revision` | Someone saved the PRD after you loaded it | Reload the PRD, then let the user reapply their change |
| 409 | `conflict` | Other conflicts | Show `detail` |
| 422 | `validation_error` | Body or parameters don't match the schema (wrong type, too long, unknown field) | Show `detail`; it names the field |
| 500 | `database_error`, `internal_error` | A bug on our side | Show a generic error |
| 503 | `service_unavailable` | Supabase (database or sign-in) is unreachable or overloaded | "Try again shortly"; safe to retry |

AI routes add their own `ai_*` codes; see [Generation preview](#generation-preview-ai) for the full list.

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
  "review_state": "in_review | changes_requested | approved | null",
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

`review_state` is the current [review round](#reviews)'s state, or `null` when nothing is under review (never
submitted, or the last round was superseded by an edit). Use it for badges such as "Changes requested".

| Route | Body / query | Response | Errors |
|---|---|---|---|
| `POST /api/prds` | `{ "title": string ≤ 200, "project_id": uuid \| null }` | 201 `PRD` (status `draft`, revision 1, `my_role: "owner"`), in your organization | 403 `no_organization` if the account has none; 404 if `project_id` isn't one of **your** projects; 422 |
| `GET /api/prds` | optional `?search=text` (matches title and content text); optional `?view=`: `owned` (PRDs you own), `shared` (PRDs you were invited to as editor or viewer: "Shared with me"), `needs_my_approval` (PRDs whose open round is waiting on your decision, also when another reviewer requested changes) or `waiting_for_approval` (PRDs you own with a round in review or changes requested) | 200 `PRD[]`, most recently updated first. Without `view`: every PRD you can see, which for an org admin is every PRD in the org | 422 unknown `view` |
| `GET /api/prds/{id}` | | 200 `PRD` plus `approval` and `capabilities` (below) | 404 |
| `PUT /api/prds/{id}` | `{ "revision": int, "title"?, "content_json"?, "content_text"? }`: only the fields you send change | 200 `PRD` with the new `revision` | 404 not visible; 403 visible but not editable; 409 `stale_revision`; 422 (`status_not_allowed` if `status` is sent) |
| `DELETE /api/prds/{id}` | | 204 | 404 unless you're an owner or an org admin |

- **`approval`** (only on `GET /api/prds/{id}`) summarizes the current review round:
  `{ "round_id", "round_no", "version_id", "state", "required_count", "approved_count", "reviewers": [...] }`, where
  `reviewers` has the same shape as in a [review round](#reviews) (including each `explanation`). With nothing under
  review, the ids and `state` are `null`, the counts are `0` and `reviewers` is empty. An approved round keeps its counts.
- **`capabilities`** (only on `GET /api/prds/{id}`) says what **you** may do right now. Use it to show or hide buttons
  instead of working it out from `my_role`; the flags use the same rules the routes enforce.

  | Flag | True when |
  |---|---|
  | `can_view`, `can_comment` | always (you can see the PRD; viewers comment too) |
  | `can_edit`, `can_request_ai` | you're an owner, editor or org admin; once the PRD is approved (`final`/`assigned`), owners only |
  | `can_delete`, `can_assign` | you're an owner or org admin (`can_assign`: manage people, choose reviewers) |
  | `can_submit_review` | you're an owner or org admin, the PRD has a saved, non-empty version, and no review is open |
  | `can_approve` | you're a reviewer on the current round who hasn't decided, and the round is still on the current version |

  Work-status, classification and routing flags come with Marco's E14 and A08.
- **Don't send `status` on save.** Review state changes only through the review workflow (Decision 6, #62). Both saves
  reject it with 422 `status_not_allowed`.
- `content_json` is today's v1 shape (`{ description, sections: [...] }`). The Tiptap JSON v2 format is specified in
  [`docs/prd-document-format.md`](prd-document-format.md).

**S03 save (on `develop` behind a switch, #81; off in production).** When the backend runs with `PRD_SAVE_V2=true`,
the same `PUT /api/prds/{id}` goes through the S03 save. The switch is off until the cutover: the editor must send
v2 documents first.

- **Body:** `{ "revision": int, "title"?, "description"?: string | null, "content_json"?: v2 document,
  "generation_record_id"?: uuid, "confirmed_reviewer_ids"?: [uuid] }`. Only the fields you send change;
  `description: null` clears it. `confirmed_reviewer_ids` (1–50) is only for edits to an approved PRD (E09,
  below).
- **Response:** 200 `PRD`, now including `description`, with the new `revision`. The server derives `content_text`
  and keeps a version for each save that changes something. A save that changes nothing returns the PRD unchanged.
- **Errors:**
  - 422 `invalid_document`, with an `errors` list (path and code per problem), for a document that isn't v2,
    including today's v1 shape;
  - 422 `invalid_title` / `invalid_description`;
  - 422 `status_not_allowed` if `status` is sent; 422 for `content_text` (the server derives it);
  - 403 viewer; 404 not visible; 409 `stale_revision`;
  - E09 (approved PRDs and reviews): see **Saving during or after a review** below.
- **Accepting an AI proposal (A05):** send the proposal's `generation_record_id` with the save, plus the title,
  description and `content_json` the person kept (edited or not), and `revision` = the preview's `base_revision`.
  - Sections accepted exactly as proposed get the `ai_generated` mark (the editor's AI highlight); edited sections
    don't. The version records the save as AI-assisted either way.
  - A proposal can be used once, by the person who asked for it, at the revision it was made for. Resending the same
    acceptance after a lost response returns the saved PRD instead of an error.
  - Errors: 409 `proposal_unavailable` (already used, expired, or not yours: discard the preview); 409
    `stale_revision` (the PRD changed since the preview: generate again); 422 `invalid_generation_record` (the
    document carries an `ai_generated` mark the server didn't add); 422 `unsupported_proposal` (this kind of AI
    proposal can't be accepted through the save yet: discard it). Whole drafts from Generate, section edits
    and review suggestions are accepted.

**Saving during or after a review (E09, Decision 9).** Title, description and content edits interact with
[reviews](#reviews):

| PRD state when you save | What happens | Response |
|---|---|---|
| `draft`, or no open round | A normal save | 200 `PRD` |
| A round is open (`in_review` or `changes_requested`) | The round is superseded and continues on the new version with the same reviewers, all back to pending. The PRD stays `in_review`. If no reviewer can still take part, or the save empties the document, the PRD goes back to `draft` | 200 `PRD` (check `status`) |
| Approved (`final` or `assigned`), sent **without** `confirmed_reviewer_ids` | Nothing is saved | 409 `reapproval_required` |
| Approved, sent **with** `confirmed_reviewer_ids` by an **owner** | Saved; the approved round is superseded and a new round starts with the confirmed reviewers. The PRD goes to `in_review` | 200 `PRD` (`status: "in_review"`) |
| Approved, saved by an editor or org admin (not an owner) | Nothing is saved | 403 `owner_required` |

- **The edit modal (approved PRDs):** on 409 `reapproval_required`, keep the edits and show the modal "Your edits need
  new approval". Prefill it with the reviewers of the latest round (`GET /api/prds/{id}/reviews`, first item). The
  owner can add or remove people, then **Apply edits** resends the same save with `confirmed_reviewer_ids`.
  **Discard** drops the edits; nothing is saved.
- Reviewer list errors (the same codes as submitting a review): 422 `validation_error` (empty list),
  `not_in_organization`, `owner_cannot_review`, and
  `empty_prd` (an approved PRD can't be resubmitted empty). 422 `confirmed_reviewers_not_allowed` if you send a list
  for a PRD that isn't approved.
- **Notifications:** an edit during a review notifies everyone who had approved or requested changes (`superseded`).
  Reviewers who hadn't decided get nothing new. An approved PRD's new round notifies the confirmed reviewers
  (`submitted`, `resubmitted: true`). Each save records one event.
- A save that changes nothing never needs a reviewer list and never touches the review.

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
- Inviting someone or changing their role sends them a [notification](#notifications); removing someone doesn't.
  Setting a role someone already has changes nothing.
- Removing a reviewer who hasn't decided on the open round (and isn't an org admin, so can't see the PRD any more)
  drops their review slot, as [deactivating a reviewer](#managing-members-admins) does.

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

### Reviews

An owner (or org admin) submits the PRD's current saved version to reviewers they pick from the org. That opens a
numbered **review round** tied to that version and moves the PRD to `in_review`. Each reviewer then approves or
requests changes; when everyone has approved, the PRD becomes `final`.

`ReviewRound`:

```json
{
  "id": "uuid", "prd_id": "uuid", "round_no": 1, "version_id": "uuid", "version_no": 3,
  "state": "in_review | changes_requested | approved | superseded", "owner_review_allowed": false,
  "submitted_by": "uuid | null", "submitted_at": "…", "completed_at": "… | null",
  "reviewers": [{ "user_id": "uuid", "name": "string | null", "department": "string | null",
                  "state": "pending | approved | changes_requested", "decided_at": "… | null",
                  "explanation": "string | null", "comment_id": "uuid | null" }]
}
```

| Route | Body | Response | Errors |
|---|---|---|---|
| `POST /api/prds/{id}/reviews` | `{ "revision": int, "version_id": "uuid", "reviewer_ids": ["uuid", …] }` (1–50) | 201 `{ "round": ReviewRound, "revision": int, "status": "in_review" }` | 404; 403 not an owner or org admin; 409 `stale_revision`, `stale_version`, `no_saved_version`, `review_in_progress`; 422 `empty_prd`, `not_in_organization`, `owner_cannot_review`, `validation_error` (no reviewers) |
| `GET /api/prds/{id}/reviews?limit=25&cursor=` | | 200 `{ "items": ReviewRound[], "next_cursor": … }`, newest first, superseded rounds included | 404; 400 `invalid_cursor` |
| `PUT /api/prds/{id}/reviews/{round_id}/decision` | `{ "version_id": "uuid", "decision": "approved" \| "changes_requested", "explanation"?: "string", "section_type"?: null \| "<section type>" }` | 200 `{ "round": ReviewRound, "revision": int, "status": "in_review" \| "final" }` | 404 can't see the PRD or round; 403 not a reviewer on it, or `owner_cannot_review`; 409 `stale_version` (the PRD changed since submission), `round_not_current`, `decision_already_made`; 422 `validation_error` (no explanation for changes, over 5,000 characters, unknown section) |

- Send the `revision` and `current_version_id` of the PRD you loaded.
- Pick reviewers from the [organization directory](#organization-directory). Reviewers who aren't on the PRD yet
  are added as **viewers**, so they can read and comment. Each reviewer gets a `submitted` notification.
- **Owners can't review their own PRD**, unless the PRD's owners are everyone in the org (`owner_review_allowed`
  is then `true`, and stays so for that round even if someone joins later).
- One round at a time: while a round is `in_review`, `changes_requested` or `approved`, submitting again is 409
  `review_in_progress`.
- **Edits during a review** (with Marco's E09): saving a new version supersedes the round and starts a new one on the
  new version with the same reviewers, all back to pending; the PRD stays `in_review`. Reviewers who had decided get a
  `superseded` notification. The old round keeps its decisions and explanations, so show superseded rounds as history
  (`GET .../reviews`). Reviewers who left are dropped; if none remain, or the PRD is emptied, it goes back to `draft`.
  Edits to an approved PRD are owner-only and go through a modal to confirm the reviewers. Request and response
  details: [Saving during or after a review](#prds).
- The reviewer list is frozen when the round starts. Names and departments are as of submission. The one exception
  for now: a reviewer who loses access (deactivated, or removed from the PRD) before deciding is dropped from the
  round, and its `reviewers` no longer list them. Decisions already made stay.
- **Deciding:** send the round's `version_id`. **Requesting changes needs an `explanation`**; it's saved as a comment
  on that version (optionally on one section) and shown as the reviewer's `explanation`. An approval can carry an
  optional note the same way.
- One decision per reviewer per round. Sending the same decision again (same explanation) returns 200 and changes
  nothing, so retries are safe; a different decision is 409 `decision_already_made`.
- The last approval makes the round `approved` and the PRD `final`. One change request makes the round
  `changes_requested` (the PRD stays `in_review`); the others can still decide, but the round can't be approved.
  The owner edits and resubmits once the round is superseded (E09).
- Notifications: each approval or change request notifies the owners (`approved`, `changes_requested`). The last
  approval sends a single `round_approved` to the owners and reviewers instead. A change request doesn't also send
  a `comment_added`.

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

### Managing departments and teams (admins)

Org admins build the structure their organization uses; it's all optional. Nothing is deleted: archiving replaces
deletion, and archived units stay in the directory with `archived: true`. Responses use the directory's
`department` and `team` shapes.

| Route | Body | Response | Errors |
|---|---|---|---|
| `POST /api/organizations/{id}/departments` | `{ "name": "1–100 chars" }` | 201 department | 409 `name_taken` |
| `PATCH /api/organizations/{id}/departments/{dept_id}` | any of `{ "name", "head_id": uuid \| null, "archived": bool }` | 200 department | 404; 409 `name_taken`, `department_not_empty`; 422 `head_not_in_department`, `not_in_organization` |
| `POST /api/organizations/{id}/teams` | `{ "name": "1–100 chars", "department_id": uuid \| null }` | 201 team | 409 `name_taken`; 422 `not_in_organization` |
| `PATCH /api/organizations/{id}/teams/{team_id}` | any of `{ "name", "department_id": uuid \| null, "lead_id": uuid \| null, "archived": bool }` | 200 team | 404; 409 `name_taken`, `team_not_empty`; 422 `lead_not_in_team`, `not_in_organization` |
| `PUT /api/organizations/{id}/teams/{team_id}/members/{user_id}` | | 204, also if already on it | 404; 409 `team_archived`; 422 `not_in_organization` (not an active member) |
| `DELETE /api/organizations/{id}/teams/{team_id}/members/{user_id}` | | 204, also if not on it | 404; 422 `lead_not_in_team` (clear or change the lead first) |

All routes: 404 if you're not an active member of the organization, 403 if you're a member but not an admin.

- **Only the fields you send change.** Send `null` to clear a head, lead or department.
- **Names** are trimmed and unique among *active* departments (and among active teams), ignoring case; an archived
  unit's name can be reused.
- **Heads and leads:** a department head must be an active member *of that department*, and a team lead must be on
  the team. Move the person in first. Member department changes come with E02 part 2.
- **Archiving** needs the unit to be empty: a department with active members or active teams, or a team with active
  members, is 409 until they're moved out. Archived teams take no new members.
- Team membership never changes anyone's org role or access to PRDs.

### Managing members (admins)

`PATCH /api/organizations/{id}/members/{user_id}` changes one member. Send only what changes; `null` clears
`department_id`, `manager_id` or `title`.

| Body field | Notes |
|---|---|
| `access_role` | `"member"` or `"admin"` (not `null`) |
| `department_id` | a department of this organization (not archived), or `null` |
| `manager_id` | an active member of this organization, or `null`; no loops |
| `title` | up to 100 characters; `""` or `null` clears it |
| `active` | `false` deactivates, `true` reactivates (not `null`) |
| `replacement_manager_id` | only when deactivating someone who manages people: their new manager, or `null` for none |
| `transfer_owner_to` | only when deactivating the only owner of some PRDs: an active member who becomes their owner |

Response: 200 `{ "user_id", "active", "access_role", "department_id", "manager_id", "title" }`.

| Status | `code` | When |
|---|---|---|
| 404 | `not_found` | You're not an active member of the organization, or the person isn't in it |
| 403 | `forbidden` | You're a member but not an admin |
| 409 | `last_admin` | Demoting or deactivating the organization's last active admin. Make someone else an admin first |
| 409 | `has_direct_reports` | Deactivating someone who manages people without `replacement_manager_id`; the body lists them in `reports` (user ids) |
| 409 | `owns_prds` | Deactivating the only owner of some PRDs without `transfer_owner_to`; the body lists them in `prds` (`[{ prd_id, title }]`) |
| 409 | `active_elsewhere` | Reactivating someone who is now active in another organization (one per account) |
| 409 | `department_not_empty`-style directory codes | e.g. moving someone into an archived department |
| 422 | `manager_cycle`, `manager_inactive`, `not_in_organization`, `head_not_in_department` | Reporting lines would loop; the manager or replacement isn't an active member here; moving a department head out of their department |
| 422 | `validation_error` | Unknown field, bad role, title too long |

- **Deactivating** removes the person's access to every PRD in the organization at once (their roles stay, and come
  back if they're reactivated). Their department-head and team-lead positions are cleared. Show the `reports` or
  `prds` lists from a 409 so the admin can choose, then send the request again with the choice.
- New owners from `transfer_owner_to` are recorded like a role change on each PRD.
- **Deactivating a reviewer** drops their *undecided* review slots on open rounds (decisions they already made stay).
  A round left with only approvals completes (the PRD becomes `final`, `round_approved` notifies owners and
  reviewers); a round left with no reviewers is superseded, the PRD goes back to `draft` and the owners get a
  `superseded` notification. Both are system events: `actor_name` is `null`, and the payload has
  `reason: "reviewer_deactivated"` and `removed_reviewer_id`. Removing a reviewer from the PRD does the same with
  `reason: "reviewer_removed"`.
- The organization always keeps at least one active admin, even when two admins change each other at once.

## Generation preview (AI)

`POST /api/prds/{id}/generate` drafts a whole PRD from its interview answers with Gemini. **It's a preview: nothing is
saved.** The user accepts it through the normal save (`generation_record_id` on `PUT`, see the S03 save); rejecting means
discarding it.

| Body | Response | Who |
|---|---|---|
| `{ "revision": int }`: the revision you last loaded | 200 `{ proposal: { title, description, content_json, doc_schema_version: 2, sources: [] }, base_revision, generation_record_id }` | Can edit the PRD |

- **Needs** answers to `problem`, `target_users` and `goals`. It uses the title, the description, all seven
  answers and the PRD's saved AI context (decisions, constraints, open questions, summary).
- `content_json` is a v2 document with all nine sections ([prd-document-format.md](prd-document-format.md)).
  `sources` is always empty for now.
- Keep `generation_record_id`: send it with the save that accepts the draft, so the server knows this content came
  from the AI.
- **No streaming:** show a waiting state. A slow generation can still fail with 502/503; offer a retry.

| Status | `code` | When | Suggested handling |
|---|---|---|---|
| 404 | `not_found` | You can't see the PRD | Show "not found" |
| 403 | `forbidden` | You can view the PRD but not edit it | Hide Generate for viewers |
| 409 | `stale_revision` | The PRD was saved after you loaded it, or while the draft was being written | Reload, then generate again |
| 409 | `intake_changed` | The interview answers changed while the draft was being written | Show the message and a **Generate again** button. Keep this separate from `stale_revision` |
| 422 | `intake_incomplete` | `problem`, `target_users` or `goals` is unanswered | Send the user back to the interview |
| 422 | `invalid_context` | The PRD's saved AI context is malformed | Show `detail` |
| 422 | `validation_error` | Bad body (missing or non-positive `revision`, unknown field) | Show `detail` |
| 429 | `ai_cooldown`, `ai_busy` | Per-user AI limits; the body and the `Retry-After` header include `retry_after` (seconds) | Disable AI actions until then |
| 429 | `ai_disabled` | AI is switched off | Hide AI actions; manual editing works |
| 429 | `ai_provider_rate_limited` | Gemini is rate limited | "Try again in a minute" |
| 502 | `ai_provider_error`, `ai_invalid_output` | Gemini failed or returned an unusable draft | Offer a retry |
| 503 | `ai_unavailable`, `ai_budget_exhausted` | AI isn't configured or is out of quota | Keep manual editing |

## PRD chat (AI)

`POST /api/prds/{id}/ai/chat` answers questions about one PRD. **Answers only: it never changes the PRD.** Edit
suggestions come later, through the same proposal and save flow as generation.

| Body | Response | Who |
|---|---|---|
| `{ "revision": int, "message": "1–2000 chars", "history": [ { "role": "user" \| "assistant", "content": "1–8000 chars" } ] }` (at most 20 history items) | 200 `{ kind: "answer" \| "blocked" \| "clarification", message, base_revision, generation_record_id }` | Can view the PRD |

- `blocked` and `clarification` carry a fixed message; show it like an answer.
- Keep `history` in the browser for the open PRD only, and clear it when another PRD opens.
- **Disabled until Om's guardrail and prompt modules are in** (#80): until then it returns 503 `ai_chat_unavailable`.
- Same limits as generation: one AI request per user at a time, a short cooldown, no streaming.
- Errors: 404 `not_found`, 409 `stale_revision`, 422 `validation_error`, 422 `ai_output_blocked` (the AI declined;
  suggest rewording), 503 `ai_chat_unavailable` (hide the chat), and the shared AI codes from the generation table
  (`ai_cooldown`, `ai_busy`, `ai_disabled`, `ai_provider_rate_limited`, `ai_provider_error`, `ai_invalid_output`,
  `ai_unavailable`, `ai_budget_exhausted`).

## AI section edits

`POST /api/prds/{id}/ai-edit` asks the AI to rewrite **one section** and returns a proposal to preview. **Nothing is
saved**; the person accepts it through the normal save or discards it.

| Body | Response | Who |
|---|---|---|
| `{ "revision": int, "section_type": "goals", "instruction": "1–2000 chars", "session_messages": [ { "role": "user" \| "assistant", "content": "1–8000 chars" } ] }` (at most 20; the chat's recent turns) | 200 `{ kind: "proposal" \| "blocked" \| "clarification", message, proposal, base_revision, generation_record_id }`. `proposal` is `{ section_type, section, content_json }` (null unless `kind` is `"proposal"`) | **Can edit** the PRD (viewers can still chat; they get 403 here) |

- `message` explains the change. `content_json` is the saved document with only that section replaced (or inserted in
  the standard order), ready to preview.
- **Accept** by saving `content_json` with `generation_record_id` (see the S03 save): unchanged, or with only that
  section edited. Other sections, the title and the description must not change in that save, so save manual edits
  first. An unchanged section gets the AI highlight; an edited one doesn't. Reject by discarding.
- A save in between makes the proposal stale (409). The PRD must already be in the v2 format.
- `session_messages` uses `content`, like the chat's `history` (the integration guide v0.1 example says `text`).
- Like the chat, it returns 503 `ai_chat_unavailable` until Om's guardrail modules are in (#80).
- **Frontend (Om/Aksh):** the editor's Rewrite / Expand / Shorten / Improve / Insert actions each map to `ai-edit`
  with the section's `type` and an instruction (the action, plus any selected text). Lock editing while the request
  runs.
- Errors: as for the chat, plus 403 `forbidden` (can't edit), 409 `document_not_v2` (hide AI edits for that PRD),
  and on accept 422 `proposal_scope` (the save changed something besides that section: save manual edits first,
  then accept).

## Revision suggestions from review feedback (E12)

`POST /api/prds/{id}/review-suggestions` asks the AI how to address chosen review comments and returns one proposal to
preview, with an explanation. **Nothing is saved, and nothing about the review changes**: the AI can't approve,
reject, reply to or resolve anything.

| Body | Response | Who |
|---|---|---|
| `{ "revision": int, "feedback_ids": [uuid] (1–20), "instruction"?: "≤ 2000 chars" }` | 200 `{ explanation, proposal: { section_types, sections, content_json }, base_revision, generation_record_id }` | **Owners only** (Backend Tasks v1.2). Editors, viewers, reviewers and org admins who aren't owners get 403 `owner_required` |

- `feedback_ids` are **comment ids** ([Comments](#comments)), all on this PRD's **current version**. A reviewer's
  change-request explanation is a comment too, so use its `comment_id`.
- `proposal.sections` are only the sections the AI changed; `content_json` is the saved document with those replaced
  (or inserted in the standard order), ready to preview. `explanation` says how the changes address the feedback and
  what it didn't act on.
- **Accept** by saving `content_json` with `generation_record_id` (see the S03 save), unchanged or with those sections
  edited. Other sections, the title and the description must not change in that save (422 `proposal_scope`).
  Sections accepted unchanged get the AI highlight. Reject by discarding.
- Accepting is a normal edit: during a review it continues the round like any other save (E09).
- **Which button flag to use:** `capabilities.can_request_review_suggestions` (on `GET /api/prds/{id}`), **not**
  `can_request_ai`. It's true only for an owner, on a PRD with a saved v2 version and at least one comment on that
  version; `can_request_ai` is broader (editors too) and covers Generate and section edits. AI being off still comes
  back as `ai_disabled` from this route.
- Errors: 404; 403 `owner_required`; 409 `stale_revision` (the PRD changed: reload, pick comments again); 409
  `document_not_v2`; 422 `invalid_feedback` (an id isn't a comment on this PRD you can see); 422
  `feedback_not_current` (a comment is on an older version); 422 `validation_error`; plus the shared AI codes
  (`ai_cooldown`, `ai_busy`, `ai_disabled`, `ai_provider_rate_limited`, `ai_provider_error`, `ai_invalid_output`,
  `ai_unavailable`, `ai_budget_exhausted`).

## Owning team and priority (A08)

Neither is reviewed material: changing them doesn't change the revision, make a version or reset a review (Decision 9).
The owning team grants no access. PRD responses add `owning_team_id` and `priority` (`low` | `medium` | `high` |
`critical`, or null).

| Route | Body | Response | Who |
|---|---|---|---|
| `POST /api/prds/{id}/classification` | `{ "revision": int }` | 200 `{ suggestion: { id, team_id, priority, rationale }, base_revision, generation_record_id }`. A preview: nothing on the PRD changes | Owner or org admin |
| `PUT /api/prds/{id}/classification/{suggestion_id}/decision` | `{ "decision": "accepted" \| "rejected", "team_id"?, "priority"? }` (adjustments only with `accepted`; `team_id: null` means no team) | 200 `PRD` | Owner or org admin |
| `PUT /api/prds/{id}/routing` | `{ "owning_team_id": uuid \| null, "priority": ... \| null }` | 200 `PRD` | Owner or org admin |

- The suggestion uses AI (same limits and AI error codes as generation). It needs saved content (422 `needs_content`)
  and at least one active team in the org (422 `no_teams`). A save while it runs gives 409 `stale_revision`.
- A suggestion is decided once: a second decision is 409 `suggestion_unavailable`.
- A team must be an active team of the PRD's org (422 `invalid_team`). Editors and viewers get 403.
- Clients can't write `owning_team_id` or `priority` directly (Data API); use these routes.

## Notifications

Each person's in-app inbox. Notifications are created by the actions themselves (for now: being invited to a PRD or
having your role changed, comments, review submissions and decisions). You never get one for your own action, and notifications
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
| `GET /api/notifications?unread_only=false&limit=25&cursor=` | | 200 `{ "items": Notification[], "next_cursor": "string \| null", "unread_count": int }`, most recent activity first (`updated_at`) | 400 `invalid_cursor` |
| `PATCH /api/notifications/{id}` | `{ "read": true }` | 200 `Notification`; repeating it succeeds and keeps the first `read_at` | 404 not yours (or the PRD is hidden from you); 422 anything but `read: true` |

- **Paging:** `limit` is 1–100 (default 25). Send `next_cursor` back as `cursor` for the next page; `null` means the end.
  `unread_count` always counts all your unread notifications, whatever page or filter you asked for.
- **`type`** is the event that caused it. Link to the PRD with `prd_id`; `version_id`, `round_id` and `comment_id`
  are set when the event has them. `actor_name` is the actor's name at the time (`null` for system or AI actions).
- **`payload` by type:** `member_added`: `{ user_id, role }`; `member_role_changed`: `{ user_id, from, to }`;
  `comment_added`: `{ section_type }`; `submitted`: `{ round_no, resubmitted }`; `approved`: `{ round_no }`;
  `changes_requested`: `{ round_no, section_type }`; `round_approved`: `{ round_no, reviewer_id }` (the last
  approver; `null` when the round completed because a pending reviewer lost access, with `reason` and
  `removed_reviewer_id`: see [Managing members](#managing-members-admins)); `superseded` (`round_id` is the
  superseded round): after an edit `{ reviewer_ids, continued, version_no, changed, generation_record_id? }`, where
  `continued` is `false` when the PRD went back to draft, or, when the last pending reviewer lost access,
  `{ round_no, reviewer_ids: [], continued: false, reason, removed_reviewer_id }`; `work_status_changed`:
  `{ from, to, status }` (only `done` notifies, the owners).
- **Comment batching:** several comments from one person on one PRD, starting within 10 minutes of the first, share
  one unread notification. `count` is how many comments it stands for ("Ed left 3 comments"), `comment_id` points at
  the first one and `updated_at` is when the latest arrived; a growing batch moves back to the top of the inbox. Once
  read, the next comment starts a new notification.
  Other types always have `count: 1`.
- No realtime updates: refetch the unread count when the user navigates or on a timer.
- **Saves never notify.** Each save that changes something records one event for the PRD's history: `version_saved`
  (`{ version_no, changed }`, where `changed` lists `title`, `description` and section types) or, when it accepts
  an AI proposal, `ai_applied` (the same plus `generation_record_id`). Neither creates a notification, so they never
  appear in the inbox.

## Coming in open PRs

Not on `develop` yet. Shapes can still change in review; each PR updates its entry here.

### AI (Marco)

Open: #106 (save events).
Each adds its entry here or in the main reference as it merges.

### Version history (Marco, draft, #84)

Read-only history of a PRD's saves (S04). Every save that changes the title, description or document keeps a
permanent snapshot (since the S03 save core). There's no restore; don't show a Restore control.

| Route | Query | Response | Errors |
|---|---|---|---|
| `GET /api/prds/{id}/versions` | `limit` (1–100, default 25), `cursor` | 200 `{ items: [Version], next_cursor }`, newest first | 404 if you can't see the PRD; 400 `invalid_cursor` (start again without one); 422 bad `limit` |
| `GET /api/prds/{id}/versions/{version_id}` | | 200 `Version` plus `title`, `description`, `content_json`, `doc_schema_version`, `generation_record_id` | 404 if you can't see the PRD, or the version isn't one of **this** PRD's |

`Version`: `{ id, version_no, saved_revision, actor: { id, name } | null, origin, created_at, changed_sections, change_summary }`

- **Pages:** send `next_cursor` back as `cursor` for the next page; it's `null` on the last page. Cursors are opaque.
  Pages are stable: a save made while you page doesn't shift them.
- **`origin`:** `pm_edit`, `ai_generated` (an accepted AI proposal, saved by `actor`) or `checkpoint`.
- **`actor`:** `null` for the checkpoint that kept content saved before history existed, and for people whose account
  was deleted. `name` can be `null` if they never set one.
- **`changed_sections`:** section types whose content changed. `change_summary` is a short line such as "Edited title,
  problem" (wording may still change).
- **Who can see it:** anyone who can view the PRD (owner, editor, viewer, org admin), the same as the PRD itself.

## Changes from the integration guide

Team decisions (2026-10-29/30) that change the Frontend Integration Guide v0.1:

- **No `can_approve` or `can_assign` flags.** Being assigned as a reviewer is what lets someone approve; PRD owners assign.
- **Org roles are `admin` and `member` only** (no `viewer`/`editor`). PRD access comes from per-PRD roles: owner, editor, viewer.
- **One org per account.** `GET /api/me` returns `organization` (object or `null`), not a `memberships` list.
- **Members join with an org code**, not admin-created accounts. There's no initial password and no
  `password_change_required` screen.
- **Org structure is optional:** new orgs have no default department or team, and a team may have no department.
- **Don't send `status` when saving a PRD.** A PRD moves from draft to in review when its owners assign reviewers.
