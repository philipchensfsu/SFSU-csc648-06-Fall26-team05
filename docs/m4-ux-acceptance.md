# M4 UX flows and acceptance checks: features 03, 05 and 10

How a person uses features 03, 05 and 10, and the checks that show each one works. Each check has
an ID, preconditions, steps, an expected result you can see on screen, and a status.

Status as of 2026-11-18, against `develop` at `a829373` and the open PRs named below. Update the
status column as checks are run; a check is **Passed** only after someone ran it and saw the
expected result.

## Sources and gaps

| Feature | Name as the repo uses it | Where it's built | State on 2026-11-18 |
|---|---|---|---|
| 03 | PRD details page (work status, team and priority, activity) | [PrdDetailsPage.jsx](../app/frontend/src/nautilus/app/details/PrdDetailsPage.jsx) ("The PRD details page (feature 03)"); activity in PR #176 | Overview, owning team, priority and work status are on `develop`. The Activity tab and Recent activity card are **in review** in #176 |
| 05 | AI discussion summaries | Backend #163 (merged); [Discussion summary (feature 05)](frontend-api.md#discussion-summary-feature-05) | **No screen yet.** #163 says the "Summarize discussion" control in `CommentsPanel` stays with Aksh; no frontend PR exists |
| 10 | Progress reports | Backend #162 (merged); [Reports (feature 10)](frontend-api.md#reports-feature-10); Reports page in PR #179 | The Reports page is **in review** in #179 |

**Missing sources:**
- **The team's M4 task list is not in the repo.** Feature names here come from code comments, PR
  titles and `docs/frontend-api.md`, not from the task list. Check them against the task list
  before submitting.
- **No requirement IDs.** The PR template asks for one (for example `R_5.2`), but #162, #163 and
  #176 give none. Requirement IDs for these features are left out rather than guessed.
- **The M3 report** (`milestones/m3/*.pdf`) couldn't be searched as text, so it wasn't used.

**Feature 10, "Progress Reports & Roadmap":** the task list's title includes a roadmap. Only the
progress reports part exists:

| Part | Status |
|---|---|
| Counts by status, work status, priority, owner and team | Backend merged (#162); page in review (#179) |
| Team, project and owner filters | Backend merged (#162); page in review (#179) |
| Recent activity across PRDs | Backend merged (#162); page in review (#179) |
| Overdue PRDs | Not built: needs dates, which wait for the milestone decision (#162, `progress_report.sql`) |
| Roadmap | Not built. No route, screen, migration or doc in the repo mentions a roadmap. The Reports page does not cover it |

## Before running the checks

- Run the local stack from [local-development.md](local-development.md) (`supabase start`, then
  `docker compose up`), and run `supabase db reset` first so the seed data below holds.
- Sign in at http://localhost:5173 with the seeded accounts:

| Account | Password | Role | Seeded PRDs |
|---|---|---|---|
| `alice.pm@example.com` (Alice PM) | `password1` | Campus Apps admin | Campus Study Group Finder (draft), Library Room Booking (in review), Expense Report Tool (final) |
| `ben.pm@example.com` (Ben PM) | `password2` | Campus Apps member | Neighborhood Lost Pet Board (draft) |
| `erin.engineer@example.com` (Erin Engineer) | `password3` | Campus Apps member | none |

- Projects: Campus Life (Study Group Finder, Library Room Booking), Internal Tools (no PRDs),
  Community (Lost Pet Board).
- **No teams are seeded, and no screen creates teams on `develop`** (`api.createTeam` exists, but no
  page uses it). Checks that need a team say so; create one as Alice with
  `POST /api/organizations/{id}/teams` ([Managing departments and teams](frontend-api.md#managing-departments-and-teams-admins)).
- To make the API fail on purpose, stop the backend with `docker compose stop backend` and start it
  again with `docker compose start backend`.

---

## Feature 03: PRD details page

**Goal:** see where a PRD stands (review status, owning team, priority, people, approvals, latest
versions and work status) and, as an owner or org admin, change the team, priority and work status
without opening the editor.

### Flow

1. **Start:** the Dashboard's PRD table (open a row's menu, choose **Details & history**), or the
   **Details** button in the editor's top bar.
2. The page opens on **Overview**, with the title, description, project, owners and version in the
   header and **Overview** and **History** tabs.
3. The **Overview** card shows Status, Owning team, Priority, Created and Last saved. Owners and org
   admins get selects for Owning team and Priority, plus **Suggest with AI**; everyone else sees text.
4. **People on this PRD (n)** lists everyone with their role; owners and admins also get **Manage
   access** and a **Share** button in the top bar.
5. **Work status** shows Not started, In progress and Done. Only the moves the backend allows are
   enabled: not started → in progress → done, and done → in progress.
6. **In review in #176:** an **Activity** tab between Overview and History, and a **Recent activity**
   card on Overview.

### What success looks like

- A new owning team or priority shows in its select straight away and is still there after a reload.
- After a work status change, the new state is highlighted and the header note updates.
- **Activity (#176):** the tab lists events newest first, filtered by All, Edits, People, Comments,
  Reviews and Work status, ending with "The PRD was created".

### States

| State | What the screen shows |
|---|---|
| Loading | "Loading…" in the People and Latest versions cards until they arrive |
| PRD can't be loaded | "Couldn’t load this PRD." with the error and **Try again** |
| No saved versions | "No saved versions yet." in Latest versions |
| Not submitted for review | "Not submitted for review yet." in Approvals |
| Not an owner or org admin | Owning team and Priority as text; no Share, Manage access or Suggest with AI; Work status buttons disabled with "Only the PRD’s owners and org admins can change it." |
| Owner, PRD not approved | Work status buttons disabled with "Can change once the PRD is approved." |
| Save fails | The error appears in red under the card |
| Activity (#176) | "Loading activity…"; "Couldn’t load the activity." with **Try again**; "Nothing of this kind yet." for an empty filter; "Couldn’t load the latest activity." on the card |

Related: [PrdDetailsPage.jsx](../app/frontend/src/nautilus/app/details/PrdDetailsPage.jsx),
[Work status (E14)](frontend-api.md#work-status-e14),
[Owning team and priority (A08)](frontend-api.md#owning-team-and-priority-a08), PR #176. The History tab
and version view belong to feature 01 (revision history) and are not checked here.

### Acceptance checks

| ID | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|
| F03-01 | Signed in as Alice | 1. On the Dashboard, open the menu on Expense Report Tool's row. 2. Choose **Details & history**. | The details page opens on Overview, with "Expense Report Tool" as the title, the **Overview** tab selected and "Owner: Alice PM" in the header | Not run |
| F03-02 | Signed in as Alice; Expense Report Tool open in the editor | Click **Details** in the top bar | The same details page opens on Overview | Not run |
| F03-03 | Signed in as Alice; fresh seed | Open Campus Study Group Finder's details | The Overview card shows Status Draft, Owning team "No team" and Priority "Not set"; Approvals says "Not submitted for review yet."; People lists Alice PM · you as Owner | Not run |
| F03-04 | Signed in as Alice | 1. Open Expense Report Tool's details. 2. Set **Priority** to High. 3. Reload the page. | "Saving…" shows briefly; after the reload, Priority is still High | Not run |
| F03-05 | Signed in as Alice; a team exists (see "Before running the checks") | 1. Open Expense Report Tool's details. 2. Choose the team in **Owning team**. 3. Reload. | The team is still selected after the reload | Not run |
| F03-06 | Signed in as Alice; Expense Report Tool is final and Not started | 1. Open its details. 2. In **Work status**, click **In progress**. 3. Click **Done**. | Before step 2, Not started is highlighted and only In progress is enabled. After step 2, In progress is highlighted and only Done is enabled. After step 3, Done is highlighted and only In progress is enabled (reopen); the card's note reads Done | Not run |
| F03-07 | Signed in as Alice | Open Campus Study Group Finder's details (a draft) | All three Work status buttons are disabled, with "Can change once the PRD is approved." | Not run |
| F03-08 | As Alice, share Campus Study Group Finder with Erin as Viewer (**Share**); then sign in as Erin | Open the PRD's details | Owning team and Priority are plain text; no Share, Manage access or Suggest with AI; Work status buttons are disabled with "Only the PRD’s owners and org admins can change it." | Not run |
| F03-09 | Signed in as Alice; `GEMINI_API_KEY` set; a team exists; the PRD has saved content | 1. Open its details. 2. Click **Suggest with AI**. 3. Click **Use this**. | The button reads "Thinking…", then "AI suggests: *team* · *priority* priority" appears; after **Use this**, both selects show the suggestion and the box closes | Not run |
| F03-10 | Signed in as Alice; backend stopped | Open any PRD's details | "Couldn’t load this PRD." with the error and **Try again**; after the backend restarts, **Try again** loads the page | Not run |
| F03-11 | PR #176 checked out; signed in as Alice; a PRD with a few events (for example after F03-06) | 1. Open Expense Report Tool's details. 2. In **Recent activity**, click **See all**. | The card lists the 3 newest events; **See all** opens the Activity tab, which lists every event and ends with "The PRD was created" | Not run |
| F03-12 | As F03-11 | On the Activity tab, click **Work status**, then **People** | Work status shows only work status events; People shows only people events, or "Nothing of this kind yet." | Not run |
| F03-13 | PR #176 checked out; a PRD with a saved version and a comment | On its Activity tab, click **View version** on an edit, go back, then click **View comment** on a comment | **View version** opens that version in History; **View comment** opens the editor with the Comments tab selected | Not run |
| F03-14 | PR #176 checked out; backend stopped | Open the Activity tab | "Couldn’t load the activity." with **Try again**; it loads after the backend restarts | Not run |

---

## Feature 05: AI discussion summaries

**Goal:** anyone who can open a PRD, viewers included, gets a short summary of the comments on one
saved version: themes, open questions, requested changes by section, and unresolved items, each
pointing at the comments it came from. Nothing is saved, and no review state changes.

### Flow (planned)

**No screen exists yet.** What the contract and #163 say the screen must do:
- **Start:** a "Summarize discussion" control in the editor's Comments panel (`CommentsPanel`),
  shown to anyone who can open the PRD (no capability flag).
- It calls `POST /api/prds/{id}/discussion-summary` for the current version, or for a chosen version.
- **Result:** four lists (themes, open questions, requested changes, unresolved items), each item
  linking to its comments, rendered as plain text.

### States (from the API contract)

| State | What the API returns | What the screen needs to show |
|---|---|---|
| No comments, or nothing saved | 200 with four empty lists and `comment_count: 0`; no AI call | An empty result, even with AI off |
| Long discussion | `summarized_comment_count` < `comment_count` | That the summary covers the most recent comments |
| AI off or busy | `ai_disabled`, `ai_cooldown`, `ai_busy` and the other shared AI codes | An error; not to be confused with "no comments" |
| No access | 404 | Not reachable from the UI; the PRD can't be opened |
| Version of another PRD | 404 `Version not found` | An error |

Related: [Discussion summary (feature 05)](frontend-api.md#discussion-summary-feature-05), PR #163,
`app/backend/tests/integration/test_discussion_summary_db.py`.

### Acceptance checks

These are **blocked** until the Comments panel has the control. Each is written from the contract
above. Fill in the exact labels once the UI lands.

| ID | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|
| F05-01 | UI built; `GEMINI_API_KEY` set; a PRD with a saved version and several comments; signed in as an owner | Open the PRD in the editor, open Comments, and ask for a summary | Four lists appear; each item links to at least one comment, and following a link shows that comment | Not run (blocked: no UI) |
| F05-02 | As F05-01, signed in as a **viewer** of the PRD | Ask for a summary | The control is there and a summary appears; nothing else changes: no proposal, no new version, and the review state stays the same | Not run (blocked: no UI) |
| F05-03 | UI built; a PRD whose current version has no comments | Ask for a summary | An empty result, not an error, even with AI switched off | Not run (blocked: no UI) |
| F05-04 | UI built; AI switched off; a PRD with comments | Ask for a summary | An error that says AI isn't available; no empty summary | Not run (blocked: no UI) |
| F05-05 | UI built; a version with more comments than fit (over 100) | Ask for a summary | The summary says it covers the most recent comments | Not run (blocked: no UI) |

---

## Feature 10: Progress reports (Reports page)

**Goal:** see how the PRDs you can see are progressing: how many there are, their review status,
work status and priority, who owns them, which team they belong to, and what happened recently.
Narrow it by team, project or owner. Members see their own PRDs; org admins see every PRD in the
organization.

The Reports page is **in review in PR #179** (`feature/leman-reports-page`), not on `develop` yet.
Roadmap and overdue PRDs are not part of it (see "Sources and gaps").

### Flow

1. **Start:** **Reports** in the sidebar, between Projects and Search, from any workspace page.
2. The page opens with the title Reports. Admins see "Progress across every PRD in *organization*.";
   members see "Progress across the PRDs you can see."
3. **Filters:** Team (active teams), Project and Owner (organization members), each starting at "All".
   Changing one reloads the report; they combine. **Clear filters** appears once one is set.
4. **Report:** Total PRDs; Status, Work status and Priority cards; By owner and By team tables with
   a column per status; Recent activity, where each line's PRD title opens that PRD.

### What success looks like

- The Reports link is highlighted in the sidebar while the page is open, and the tab title reads
  "Nautilus — Reports".
- Every category shows every value, with 0 for ones that don't occur. A PRD without a priority
  counts as "No priority", and PRDs without an owning team are the "No team" row.

### States

| State | What the screen shows |
|---|---|
| First load | "Loading report…" |
| Reloading after a filter change | The previous report stays, dimmed, until the new one arrives |
| No PRDs at all | "No PRDs to report on yet. Numbers appear here once there are PRDs you can see." |
| Filters match nothing | "No PRDs match these filters. Try another team, project or owner." |
| PRDs but no events | "No activity yet." under Recent activity |
| API error | "Couldn’t load this report." with the error and **Try again** |
| Directory can't be read | No Team or Owner filter; "Team and owner filters aren’t available right now."; the report still loads |
| PRD from activity can no longer be opened | "You can’t open this PRD any more." |

Related: [Reports (feature 10)](frontend-api.md#reports-feature-10), PR #162 (backend), PR #179
(page: `ReportsPage.jsx`, `reports.js`, `Sidebar.jsx`).

### Acceptance checks

Expected numbers assume a fresh `supabase db reset` with nothing changed since, except where the
preconditions say otherwise.

| ID | Preconditions | Steps | Expected result | Status |
|---|---|---|---|---|
| F10-01 | PR #179 checked out; signed in as Alice; on the Dashboard | Click **Reports** in the sidebar | The Reports page opens; Reports is highlighted in the sidebar and Dashboard isn't; the tab title is "Nautilus — Reports"; the lede reads "Progress across every PRD in Campus Apps." | Not run |
| F10-02 | As F10-01; fresh seed | Look at the summary cards | Total PRDs 4. Status: Draft 2, In review 1, Final 1, Assigned 0. Work status: Not started 4, In progress 0, Done 0. Priority: Critical 0, High 0, Medium 0, Low 0, No priority 4 | Not run |
| F10-03 | As F10-02 | Look at By owner and By team | By owner: Alice PM 3 (Draft 1, In review 1, Final 1), Ben PM 1 (Draft 1). By team: one "No team" row with 4 | Not run |
| F10-04 | PR #179; signed in as Ben | Open Reports | The lede reads "Progress across the PRDs you can see."; Total PRDs 1, Draft 1 | Not run |
| F10-05 | PR #179; signed in as Alice | 1. Open Reports. 2. Set **Project** to Campus Life. 3. Then set **Owner** to Ben PM. | After step 2, Total PRDs is 2 (Draft 1, In review 1). After step 3 (Campus Life and Ben together), "No PRDs match these filters." | Not run |
| F10-06 | As F10-05, after step 3 | Click **Clear filters** | All three filters return to All; Total PRDs is 4 again; Clear filters disappears | Not run |
| F10-07 | PR #179; signed in as Alice | Set **Owner** to Ben PM | Total PRDs 1; By owner lists only Ben PM | Not run |
| F10-08 | PR #179; signed in as Alice; a team exists and is set as Expense Report Tool's owning team (F03-05) | 1. Open Reports. 2. Set **Team** to that team. | Total PRDs 1 (Final 1); By team lists that team with 1. Without the filter, By team lists the team with 1 and "No team" with 3 | Not run |
| F10-09 | PR #179; signed in as Alice | Set **Project** to Internal Tools | "No PRDs match these filters. Try another team, project or owner."; no cards or tables | Not run |
| F10-10 | PR #179; signed in as Erin (no PRDs) | Open Reports | "No PRDs to report on yet. Numbers appear here once there are PRDs you can see." | Not run |
| F10-11 | PR #179; signed in as Alice; Expense Report Tool's priority set to High (F03-04) | Open Reports | Priority: High 1, No priority 3; the other priorities show 0 | Not run |
| F10-12 | PR #179; signed in as Alice; Expense Report Tool's work status changed (F03-06) | 1. Open Reports. 2. Under **Recent activity**, click **Expense Report Tool**. | Recent activity lists the work status change with "Expense Report Tool" and a time; clicking the title opens that PRD | Not run |
| F10-13 | PR #179; signed in as Alice; fresh seed | Open Reports | Recent activity says "No activity yet." | Not run |
| F10-14 | PR #179; signed in as Alice; backend stopped | 1. Click **Reports**. 2. Start the backend. 3. Click **Try again**. | After step 1, "Couldn’t load this report." with the error and **Try again**, and no numbers. After step 3, the report loads and the alert is gone | Not run |
| F10-15 | PR #179; signed in as Ada (Other Org admin) | Open Reports | "No PRDs to report on yet." and no cards or tables: none of Campus Apps' PRDs are counted | Not run |
