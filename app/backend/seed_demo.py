"""Fresh v2 demo data for the demo account (replaces the M2 v1 seed).

Creates or reuses, for one demo account only:
- the account itself (login kept: an existing password is never changed
  unless DEMO_PASSWORD is set);
- its organization, with the account as admin (one org per account, #71);
- its projects;
- ten PRDs in the agreed v2 format (Tiptap JSON, docs/prd-document-format.md),
  validated with the shared validator, with their interview answers.

PRD content goes through the reviewed save core (prd_save.save_prd, #55), so
every PRD with content gets a real version, server-derived content_text and
a change-log note, exactly like a user's save. No AI records are created:
nothing here claims AI involvement, so there are no ai_generated marks or
generation records. Review status (in review, final, assigned) has no
workflow yet (E07/E08), so it's set on the PRD after its save, as demo
metadata only; no approvals are invented.

Re-runnable: it deletes only PRDs and projects owned by the demo account
(their versions, answers, roles and context cascade) and recreates them. The
demo organization and membership are reused. Nobody else's data is touched,
and it refuses to run if the demo account is a non-admin member of someone
else's organization.

Usage, from app/backend (the local stack is the default target):
    python seed_demo.py                 # SUPABASE_* from the environment/.env
    DEMO_PASSWORD=... python seed_demo.py

It refuses non-local Supabase URLs unless --allow-hosted is given. Running it
against the hosted project is part of the hosted rollout plan (Marco's
go-ahead, after the migrations), not something to do ad hoc.

The password is never stored in the repo. A new account without
DEMO_PASSWORD gets a random password, printed once.
"""

import argparse
import os
import secrets
import sys
from urllib.parse import urlparse

DEMO_EMAIL = os.environ.get("DEMO_EMAIL", "nautilus.demo@example.com")
DEMO_NAME = "Nautilus Demo PM"
DEMO_ORG = "Nautilus Demo"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "host.docker.internal"}


def section_order():
    """The nine section types in the shared spec's standard order."""
    from prd_document import section_types

    return list(section_types())

# --- demo content ---------------------------------------------------------------

PROJECTS = ["Campus Life", "Internal Tools", "Community"]

# `content=None` means a draft that hasn't been generated yet. `answers` are
# the intake answers (Section 1.6 keys); "" means the question was skipped.
PRDS = [
    {
        "title": "Campus Study Group Finder",
        "project": "Campus Life",
        "status": "in_review",
        "days_ago": 2,
        "answers": {
            "problem": "Students struggle to find study groups for their classes.",
            "target_users": "Undergraduates, mostly first and second year.",
            "goals": "Help students join a group within one day of searching.",
            "scope": "In: group search and join requests. Out: video calls.",
            "constraints": "Web only, one semester, team of five.",
            "success_metrics": "60% of searchers join a group within 24 hours.",
            "notes": "",
        },
        "content": {
            "problem": "Students study alone because existing group chats are hard to discover and go stale quickly.",
            "goals": ["Join a relevant study group within one day of searching.", "Let students create and manage their own groups."],
            "non_goals": ["Video calls or built-in chat.", "Paid tutoring."],
            "target_users": "Undergraduates in large lecture courses.",
            "assumption": "Most users search from a phone between classes.",
            "user_stories": ["As a student, I filter groups by course code so I find one that fits.", "As an organizer, I approve join requests."],
            "requirements": ["FR-01: Search groups by course code and section.", "FR-02: Request to join a group.", "FR-03: Organizers approve or decline requests."],
            "success_metrics": ["60% of searchers join a group within 24 hours.", "Weekly active groups grow through the semester."],
            "risks": ["Too few groups at launch to be useful."],
            "open_questions": ["Should groups be tied to a section or the whole course?"],
        },
    },
    {
        "title": "Dining Hall Menu Alerts",
        "project": "Campus Life",
        "status": "final",
        "days_ago": 9,
        "answers": {
            "problem": "Students with dietary restrictions don't know what the dining hall is serving until they arrive.",
            "target_users": "Students on a meal plan, especially vegetarian, vegan, or allergy-restricted.",
            "goals": "Notify students when a meal matching their diet is on the menu.",
            "scope": "In: daily menu alerts by dietary tag. Out: ordering or payments.",
            "constraints": "Menu data comes from the dining services spreadsheet.",
            "success_metrics": "Fewer wasted trips; 40% of subscribers open an alert weekly.",
            "notes": "",
        },
        "content": {
            "problem": "Students with dietary restrictions walk to the dining hall only to find nothing they can eat.",
            "goals": ["Alert students when a matching meal is on today's menu.", "Show allergen tags on every menu item."],
            "non_goals": ["Online ordering.", "Meal plan payments."],
            "target_users": "Meal plan holders with vegetarian, vegan, gluten-free, or allergy needs.",
            "user_stories": ["As a vegan student, I get a morning alert when a vegan entree is served.", "As a student with a nut allergy, I see allergen tags before I go."],
            "requirements": ["FR-01: Subscribe to dietary tags.", "FR-02: Daily push or email alert.", "FR-03: Import the menu spreadsheet nightly."],
            "success_metrics": ["40% of subscribers open an alert each week.", "Survey: fewer wasted trips."],
            "risks": ["Menu spreadsheet is updated late or inconsistently."],
            "open_questions": ["Can dining services commit to a menu update time?"],
        },
    },
    {
        "title": "Library Room Booking",
        "project": "Campus Life",
        "status": "draft",
        "days_ago": 1,
        # Partway through the interview: the wizard resumes at "goals".
        "answers": {
            "problem": "Group study rooms are booked on paper sign-up sheets and often sit empty.",
            "target_users": "Students who need a quiet room for group work.",
        },
        "content": None,
    },
    {
        "title": "Bike Share Docking Map",
        "project": None,
        "status": "in_review",
        "days_ago": 5,
        "answers": {
            "problem": "Riders can't tell which bike docks near campus have bikes or open spots.",
            "target_users": "Commuting students and staff who use the city bike share.",
            "goals": "Show live dock availability on a map.",
            "scope": "In: live map and favorites. Out: renting bikes in-app.",
            "constraints": "Depends on the city's public bike share feed.",
            "success_metrics": "Riders check the map before 50% of trips.",
            "notes": "The city feed is GBFS format.",
        },
        "content": {
            "problem": "Riders walk to a dock and find it empty, or full when they need to return a bike.",
            "goals": ["Show live bikes and open spots for nearby docks.", "Let riders save favorite docks."],
            "non_goals": ["Renting or unlocking bikes in the app."],
            "target_users": "Students and staff commuting by bike share.",
            "assumption": "The city feed refreshes at least once a minute.",
            "user_stories": ["As a commuter, I check my home dock before leaving.", "As a rider, I find the nearest dock with open spots."],
            "requirements": ["FR-01: Map of docks with live counts.", "FR-02: Save favorite docks.", "FR-03: Read the city GBFS feed."],
            "success_metrics": ["Riders check the map before half of their trips."],
            "risks": ["The public feed goes down or changes format."],
            "open_questions": ["Do we need an offline fallback?"],
        },
    },
    {
        "title": "Expense Report Automation",
        "project": "Internal Tools",
        "status": "assigned",
        "days_ago": 14,
        "answers": {
            "problem": "Employees fill out expense reports by hand and finance re-types them.",
            "target_users": "Employees who travel and the finance team that reimburses them.",
            "goals": "Cut reimbursement time from two weeks to three days.",
            "scope": "In: receipt upload and approval flow. Out: corporate cards.",
            "constraints": "Must export to the existing accounting system as CSV.",
            "success_metrics": "Average reimbursement time under three days.",
            "notes": "",
        },
        "content": {
            "problem": "Paper expense reports are slow, error-prone, and re-typed by finance.",
            "goals": ["Reimburse employees within three days.", "Remove manual re-typing by finance."],
            "non_goals": ["Issuing corporate cards.", "Tax reporting."],
            "target_users": "Traveling employees, their managers, and the finance team.",
            "user_stories": ["As an employee, I photograph a receipt and submit it.", "As a manager, I approve reports from my phone.", "As finance, I export approved reports as CSV."],
            "requirements": ["FR-01: Upload receipt photos.", "FR-02: Manager approval step.", "FR-03: CSV export for accounting."],
            "success_metrics": ["Average reimbursement time under three days.", "Zero re-typed reports per month."],
            "risks": ["Receipt photos are unreadable."],
            "open_questions": ["What is the approval limit before a director signs off?"],
        },
    },
    {
        "title": "Employee Onboarding Checklist",
        "project": "Internal Tools",
        "status": "in_review",
        "days_ago": 6,
        "answers": {
            "problem": "New hires get onboarding steps from five different people and miss some.",
            "target_users": "New employees and their hiring managers.",
            "goals": "Every new hire finishes onboarding in their first week.",
            "scope": "In: checklist per role and manager view. Out: payroll setup.",
            "constraints": "",
            "success_metrics": "90% of checklists completed within five days.",
            "notes": "",
        },
        "content": {
            "problem": "Onboarding steps are scattered across emails, so new hires miss accounts, training, and paperwork.",
            "goals": ["One checklist per role.", "Managers see who is stuck."],
            "non_goals": ["Payroll and benefits enrollment."],
            "target_users": "New hires and hiring managers.",
            "user_stories": ["As a new hire, I see every step I need to finish this week.", "As a manager, I see which steps my new hire hasn't done."],
            "requirements": ["FR-01: Checklist templates per role.", "FR-02: Mark steps done.", "FR-03: Manager progress view."],
            "success_metrics": ["90% of checklists done within five days."],
            "risks": ["Templates go out of date."],
            "open_questions": ["Who owns updating each role's template?"],
        },
    },
    {
        "title": "Support Ticket Triage Dashboard",
        "project": "Internal Tools",
        "status": "draft",
        "days_ago": 3,
        # Interview finished, not generated yet: opens on the review screen.
        "answers": {
            "problem": "Support tickets sit unassigned because nobody owns triage.",
            "target_users": "Support agents and the support team lead.",
            "goals": "Every ticket gets an owner within one business hour.",
            "scope": "In: triage queue and assignment. Out: replacing the ticketing system.",
            "constraints": "Read-only access to the current ticketing system's API.",
            "success_metrics": "Median time to first owner under one hour.",
            "notes": "",
        },
        "content": None,
    },
    {
        "title": "Recipe Meal Planner",
        "project": None,
        "status": "final",
        "days_ago": 18,
        "answers": {
            "problem": "Planning a week of meals and a grocery list takes too long.",
            "target_users": "Busy students and young professionals who cook at home.",
            "goals": "Plan a week of meals and get a grocery list in under ten minutes.",
            "scope": "In: meal calendar and grocery list. Out: grocery delivery.",
            "constraints": "",
            "success_metrics": "Users plan at least three weeks in their first month.",
            "notes": "",
        },
        "content": {
            "problem": "People who cook at home spend too long deciding meals and writing grocery lists.",
            "goals": ["Plan a week of meals in under ten minutes.", "Generate a combined grocery list."],
            "non_goals": ["Grocery delivery.", "Calorie tracking."],
            "target_users": "Students and young professionals cooking on a budget.",
            "assumption": "Users already have a few favorite recipes saved somewhere.",
            "user_stories": ["As a cook, I drag recipes onto a weekly calendar.", "As a shopper, I get one grocery list for the week."],
            "requirements": ["FR-01: Save recipes.", "FR-02: Weekly meal calendar.", "FR-03: Combined grocery list."],
            "success_metrics": ["Users plan at least three weeks in their first month."],
            "risks": ["Importing recipes from websites is unreliable."],
            "open_questions": ["Should grocery lists group items by store aisle?"],
        },
    },
    {
        "title": "Volunteer Shift Scheduler",
        "project": "Community",
        "status": "in_review",
        "days_ago": 4,
        "answers": {
            "problem": "The food bank coordinates volunteer shifts by group text and double-books people.",
            "target_users": "Food bank volunteers and the volunteer coordinator.",
            "goals": "Fill every shift without double-booking.",
            "scope": "In: shift sign-up and reminders. Out: donor management.",
            "constraints": "Volunteers range in age; must work without an app install.",
            "success_metrics": "No unfilled shifts for a month.",
            "notes": "",
        },
        "content": {
            "problem": "Shifts are organized over group text, so some get double-booked and others go unfilled.",
            "goals": ["Fill every shift.", "Remind volunteers the day before."],
            "non_goals": ["Donor and donation tracking."],
            "target_users": "Food bank volunteers of all ages and one coordinator.",
            "user_stories": ["As a volunteer, I sign up for an open shift from a link.", "As the coordinator, I see which shifts still need people."],
            "requirements": ["FR-01: Shift calendar with open spots.", "FR-02: Sign up from a web link, no install.", "FR-03: Text reminder the day before."],
            "success_metrics": ["No unfilled shifts for a month."],
            "risks": ["Older volunteers may not use links."],
            "open_questions": ["Do we need a phone-in option?"],
        },
    },
    {
        "title": "Neighborhood Lost Pet Board",
        "project": "Community",
        "status": "draft",
        "days_ago": 0,
        "answers": {},
        "content": None,
    },
]



# --- v2 documents ------------------------------------------------------------------

def _text(text, marks=None):
    node = {"type": "text", "text": text}
    if marks:
        node["marks"] = marks
    return node


def _paragraph(*texts):
    return {"type": "paragraph", "content": list(texts)}


def build_document(content):
    """A v2 document from the demo content: one section per type, in the
    standard order, paragraphs for text and bullet lists for lists. The
    target-users assumption uses the agreed assumption mark (option A: users
    may add it; AI output never does)."""
    sections = []
    for section_type in section_order():
        value = content[section_type]
        if isinstance(value, list):
            body = [{"type": "bulletList", "content": [
                {"type": "listItem", "content": [_paragraph(_text(item))]} for item in value]}]
        else:
            texts = [_text(value)]
            if section_type == "target_users" and content.get("assumption"):
                texts += [_text(" "), _text(content["assumption"], [{"type": "assumption"}])]
            body = [_paragraph(*texts)]
        sections.append({"type": "section", "attrs": {"type": section_type}, "content": body})
    return {"type": "doc", "content": sections}


def description_for(prd):
    """A one-line summary for the card: the interview's problem answer, else
    the document's problem statement."""
    text = (prd["answers"].get("problem") or (prd["content"] or {}).get("problem") or "").strip()
    return text[:2000] or None


def check_documents():
    """Every seeded document must pass the shared validator before anything
    is written."""
    from prd_document import validate_document

    problems = []
    for prd in PRDS:
        if prd["content"]:
            errors = validate_document(build_document(prd["content"]))
            problems += [f"{prd['title']}: {e.code} at {e.path}" for e in errors]
    if problems:
        raise SystemExit("Demo documents don't validate:\n" + "\n".join(problems))


# --- seeding -----------------------------------------------------------------------

def require_local_target(allow_hosted):
    host = urlparse(os.environ.get("SUPABASE_URL", "")).hostname
    if host not in LOCAL_HOSTS and not allow_hosted:
        raise SystemExit(f"Refusing to seed {host!r}: not a local stack. Hosted seeding is part of the rollout plan "
                         "and needs --allow-hosted.")


def find_demo_user(supabase):
    for user in supabase.auth.admin.list_users(per_page=1000):
        if user.email == DEMO_EMAIL:
            return user
    return None


def ensure_demo_user(supabase):
    """Returns (user, note). An existing account keeps its password unless
    DEMO_PASSWORD is set. A new account without it gets a random one, which
    is the only time a password is printed."""
    password = os.environ.get("DEMO_PASSWORD")
    user = find_demo_user(supabase)
    if user:
        if password:
            supabase.auth.admin.update_user_by_id(user.id, {"password": password})
            return user, "Existing account: password set from DEMO_PASSWORD."
        return user, "Existing account: password unchanged (set DEMO_PASSWORD to reset it)."
    generated = password is None
    password = password or secrets.token_urlsafe(12)
    created = supabase.auth.admin.create_user({
        "email": DEMO_EMAIL, "password": password, "email_confirm": True,
        "user_metadata": {"full_name": DEMO_NAME},
    })
    if generated:
        return created.user, f"New account. Demo password: {password}\nSave this now: it isn't stored anywhere else."
    return created.user, "New account: password set from DEMO_PASSWORD."


def ensure_demo_org(supabase, user_id):
    """The demo account's organization, as its admin. Reuses an existing
    active membership; never takes over someone else's organization."""
    rows = (supabase.table("organization_member").select("organization_id, access_role")
            .eq("user_id", user_id).eq("active", True).execute().data)
    if rows:
        if rows[0]["access_role"] != "admin":
            raise SystemExit(f"{DEMO_EMAIL} is a member (not admin) of another organization; not seeding into it.")
        return rows[0]["organization_id"]
    org_id = (supabase.table("organization").insert({"name": DEMO_ORG, "created_by": user_id})
              .execute().data[0]["id"])
    supabase.table("organization_member").insert(
        {"organization_id": org_id, "user_id": user_id, "access_role": "admin"}).execute()
    return org_id


def seed(supabase, allow_hosted=False):
    import prd_save

    require_local_target(allow_hosted)
    check_documents()
    user, note = ensure_demo_user(supabase)
    user_id = user.id
    supabase.table("profile").update({"full_name": DEMO_NAME}).eq("id", user_id).execute()
    org_id = ensure_demo_org(supabase, user_id)

    # Only the demo account's own rows. PRDs first (their roles, versions,
    # answers and context cascade), then its projects.
    supabase.table("prd").delete().eq("owner_id", user_id).execute()
    supabase.table("project").delete().eq("owner_id", user_id).execute()

    project_ids = {}
    for name in PROJECTS:
        project_ids[name] = (supabase.table("project").insert({"name": name, "owner_id": user_id})
                             .execute().data[0]["id"])

    # Oldest first, so "recently updated" ordering matches the story.
    for prd in sorted(PRDS, key=lambda p: -p["days_ago"]):
        row = (supabase.table("prd").insert({
            "title": prd["title"], "owner_id": user_id, "organization_id": org_id,
            "project_id": project_ids.get(prd["project"]),
        }).execute().data[0])
        answers = [{"prd_id": row["id"], "question_key": key, "answer_text": text, "skipped": text == ""}
                   for key, text in prd["answers"].items()]
        if answers:
            supabase.table("intake_answer").insert(answers).execute()
        fields = {"description": description_for(prd)}
        if prd["content"]:
            fields["content_json"] = build_document(prd["content"])
        prd_save.save_prd(supabase, user, row["id"], row["revision"], **fields)
        if prd["status"] != "draft":
            # Demo metadata only: there's no review workflow yet (E07/E08).
            supabase.table("prd").update({"status": prd["status"]}).eq("id", row["id"]).execute()

    print(f"Seeded {len(PROJECTS)} projects and {len(PRDS)} PRDs for {DEMO_EMAIL} in {DEMO_ORG!r}")
    print(note)
    return org_id


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--allow-hosted", action="store_true",
                        help="allow a non-local SUPABASE_URL (hosted rollout only)")
    args = parser.parse_args(argv)
    from supabase_client import supabase

    seed(supabase, allow_hosted=args.allow_hosted)


if __name__ == "__main__":
    sys.exit(main())
