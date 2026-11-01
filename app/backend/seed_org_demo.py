"""Org and review demo data on top of seed_demo.py (Backend Tasks Q03).

seed_demo.py seeds the demo account, its organization and ten PRDs. This adds
what the review demo needs, in that same organization:

- ten people with departments, teams, heads, leads, managers and titles;
- real review history: each review action runs as the person who takes it,
  signed in with their own session, through the same database functions the
  app uses, so rounds, decisions, comments, events and notifications are
  exactly what the app would produce;
- a second organization with a single member, for solo use.

seed_demo.py marks some PRDs in_review or final without review rounds; this
resets them to draft and builds the real states instead.

    DEMO_PASSWORD=... python seed_org_demo.py

DEMO_PASSWORD is required: every review action signs in as the person taking
it, so all demo accounts (including seed_demo.py's) share that password. Like
seed_demo.py it refuses non-local Supabase URLs unless --allow-hosted is
given, and only touches the demo accounts' own data.
"""

import argparse
import os
import sys

import seed_demo

PEOPLE = [
    # key, name, department, team, title, manager key, access role
    ("dana", "Dana Lee", "Product", None, "Head of Product", None, "admin"),
    ("omar", "Omar Haddad", "Product", "Growth", "Product Manager", "dana", "member"),
    ("noah", "Noah Fischer", "Product", "Growth", "Data Analyst", "omar", "member"),
    ("raj", "Raj Patel", "Engineering", None, "Engineering Manager", None, "member"),
    ("mei", "Mei Chen", "Engineering", "Platform", "Senior Engineer", "raj", "member"),
    ("sam", "Sam Ortiz", "Engineering", "Platform", "Software Engineer", "mei", "member"),
    ("priya", "Priya Nair", "Engineering", "Mobile", "Mobile Engineer", "raj", "member"),
    ("grace", "Grace Wu", "Engineering", "Mobile", "QA Engineer", "priya", "member"),
    ("leo", "Leo Kim", "Design", None, "Head of Design", None, "member"),
    ("ava", "Ava Brooks", "Design", "Growth", "Product Designer", "leo", "member"),
]
TEAMS = {"Growth": "Product", "Platform": "Engineering", "Mobile": "Engineering"}
HEADS = {"Product": "dana", "Engineering": "raj", "Design": "leo"}
LEADS = {"Growth": "omar", "Platform": "mei", "Mobile": "priya"}
SOLO = ("solo", "Jordan Rivera", "Rivera Studio")

# How each demo PRD's review should end up (seed_demo.py titles). Actions run
# in order; "submit" is by the demo account, the PRD's owner.
REVIEWS = {
    "Campus Study Group Finder": [
        ("invite", "omar", "editor"), ("invite", "noah", "viewer"),
        ("submit", ["dana", "raj"]),
        ("comment", "noah", "goals", "Can we measure 'within one day' from the first search?"),
        ("comment", "raj", None, "Search by course code is straightforward; join approvals need a notification."),
        ("decide", "dana", "approved", None, None),
    ],
    "Bike Share Docking Map": [
        ("submit", ["raj", "mei"]),
        ("decide", "raj", "changes_requested", "risks", "Add the risk of stale dock data when the city feed is down."),
    ],
    "Dining Hall Menu Alerts": [
        ("submit", ["dana", "mei"]),
        ("decide", "dana", "approved", None, "Clear scope."), ("decide", "mei", "approved", None, None),
    ],
    "Recipe Meal Planner": [
        ("submit", ["leo", "ava"]),
        ("decide", "leo", "approved", None, None), ("decide", "ava", "approved", None, None),
    ],
    # TODO(Q03, after Marco's E09 #107): "Employee Onboarding Checklist" as a
    # superseded round: submit, one approval, then an owner edit through the
    # save, which supersedes the round and continues it on the new version.
}


def email(key):
    return f"demo.{key}@example.com"


def ensure_person(supabase, key, name, password):
    existing = next((u for u in supabase.auth.admin.list_users(per_page=1000) if u.email == email(key)), None)
    if existing:
        supabase.auth.admin.update_user_by_id(existing.id, {"password": password})
        user_id = existing.id
    else:
        user_id = supabase.auth.admin.create_user({
            "email": email(key), "password": password, "email_confirm": True,
            "user_metadata": {"full_name": name}}).user.id
    supabase.table("profile").update({"full_name": name}).eq("id", user_id).execute()
    return user_id


def sign_in(address, password):
    """A client acting as that account, through RLS, like the API's user_client."""
    from supabase import create_client
    from supabase_client import SUPABASE_ANON_KEY, SUPABASE_URL, user_client

    session = create_client(SUPABASE_URL, SUPABASE_ANON_KEY).auth.sign_in_with_password(
        {"email": address, "password": password}).session
    return user_client(session.access_token)


def ensure_unit(supabase, table, org_id, name, extra=None):
    rows = (supabase.table(table).select("id").eq("organization_id", org_id).eq("name", name)
            .is_("archived_at", "null").execute().data)
    if rows:
        return rows[0]["id"]
    return supabase.table(table).insert({"organization_id": org_id, "name": name, **(extra or {})}).execute().data[0]["id"]


def build_directory(supabase, org_id, ids):
    """Departments, teams and memberships. Members first, then heads and
    leads, since the directory checks need them in place."""
    dept_ids = {d: ensure_unit(supabase, "department", org_id, d) for d in {p[2] for p in PEOPLE}}
    team_ids = {t: ensure_unit(supabase, "team", org_id, t, {"department_id": dept_ids[d]}) for t, d in TEAMS.items()}
    for key, _, dept, team, title, _, role in PEOPLE:
        supabase.table("organization_member").upsert({
            "organization_id": org_id, "user_id": ids[key], "active": True, "access_role": role,
            "department_id": dept_ids[dept], "title": title, "manager_id": None}).execute()
        if team:
            supabase.table("team_member").upsert({"organization_id": org_id, "team_id": team_ids[team],
                                                  "user_id": ids[key]}, ignore_duplicates=True).execute()
    for key, *_, manager, _ in PEOPLE:
        if manager:
            (supabase.table("organization_member").update({"manager_id": ids[manager]})
             .eq("organization_id", org_id).eq("user_id", ids[key]).execute())
    for dept, key in HEADS.items():
        supabase.table("department").update({"head_id": ids[key]}).eq("id", dept_ids[dept]).execute()
    for team, key in LEADS.items():
        supabase.table("team").update({"lead_id": ids[key]}).eq("id", team_ids[team]).execute()


def play_reviews(supabase, org_id, owner_client, clients, ids):
    prds = {p["title"]: p for p in supabase.table("prd").select("id, title, revision, current_version_id")
            .eq("organization_id", org_id).execute().data}
    for title, actions in REVIEWS.items():
        prd = prds[title]
        round_id = None
        for action in actions:
            kind = action[0]
            if kind == "invite":
                owner_client.rpc("set_prd_member", {"target_prd": prd["id"], "target_user": ids[action[1]],
                                                    "new_role": action[2]}).execute()
            elif kind == "submit":
                round_id = owner_client.rpc("submit_prd_review", {
                    "target_prd": prd["id"], "base_revision": prd["revision"],
                    "target_version": prd["current_version_id"],
                    "reviewer_ids": [ids[k] for k in action[1]]}).execute().data
            elif kind == "comment":
                clients[action[1]].rpc("add_prd_comment", {
                    "target_prd": prd["id"], "target_version": prd["current_version_id"],
                    "target_section": action[2], "comment_body": action[3]}).execute()
            elif kind == "decide":
                clients[action[1]].rpc("decide_review", {
                    "target_prd": prd["id"], "target_round": round_id, "target_version": prd["current_version_id"],
                    "decision": action[2], "target_section": action[3], "explanation": action[4]}).execute()


def ensure_solo_org(supabase, password):
    key, name, org_name = SOLO
    user_id = ensure_person(supabase, key, name, password)
    if not (supabase.table("organization_member").select("organization_id")
            .eq("user_id", user_id).eq("active", True).execute().data):
        org_id = supabase.table("organization").insert({"name": org_name, "created_by": user_id}).execute().data[0]["id"]
        supabase.table("organization_member").insert(
            {"organization_id": org_id, "user_id": user_id, "access_role": "admin"}).execute()


def seed(supabase, allow_hosted=False):
    password = os.environ.get("DEMO_PASSWORD")
    if not password:
        raise SystemExit("Set DEMO_PASSWORD: every demo account signs in with it to take its review actions.")
    org_id = seed_demo.seed(supabase, allow_hosted=allow_hosted)  # sets the demo account's password too
    # seed_demo's bare statuses become real review history below.
    supabase.table("prd").update({"status": "draft"}).eq("organization_id", org_id).execute()

    ids = {key: ensure_person(supabase, key, name, password) for key, name, *_ in PEOPLE}
    build_directory(supabase, org_id, ids)

    owner_client = sign_in(seed_demo.DEMO_EMAIL, password)
    clients = {key: sign_in(email(key), password) for key in {a[1] for acts in REVIEWS.values() for a in acts
                                                       if a[0] in ("comment", "decide")}}
    play_reviews(supabase, org_id, owner_client, clients, ids)
    ensure_solo_org(supabase, password)

    print(f"Seeded {len(PEOPLE)} people, {len(TEAMS)} teams and {len(REVIEWS)} reviewed PRDs; "
          f"solo account {email(SOLO[0])}.")
    print("All demo accounts use DEMO_PASSWORD.")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    parser.add_argument("--allow-hosted", action="store_true",
                        help="allow a non-local SUPABASE_URL (hosted rollout only)")
    args = parser.parse_args(argv)
    from supabase_client import supabase

    seed(supabase, allow_hosted=args.allow_hosted)


if __name__ == "__main__":
    sys.exit(main())
