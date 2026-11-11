"""Fresh v2 demo data for the demo account (replaces the M2 v1 seed).

Creates or reuses, for one demo account only:
- the account itself (login kept: an existing password is never changed
  unless DEMO_PASSWORD is set);
- its organization, with the account as admin (one org per account, #71);
- its projects;
- ten PRDs in the agreed v2 format (Tiptap JSON, docs/prd-document-format.md),
  validated with the shared validator, with their interview answers;
- two member accounts in the same organization, with per-PRD roles (one
  editor, one viewer, and PRDs they aren't on), to show the admin, member
  and viewer views.

PRD content goes through the reviewed save core (prd_save.save_prd, #55), so
every PRD with content gets a real version, server-derived content_text and
a change-log note, exactly like a user's save. No AI records are created:
nothing here claims AI involvement, so there are no ai_generated marks or
generation records. Review status (in review, final, assigned) has no
workflow yet (E07/E08), so it's set on the PRD after its save, as demo
metadata only; no approvals are invented.

Re-runnable: it deletes only PRDs and projects owned by the demo account
(their versions, answers, roles and context cascade) and recreates them. The
demo organization and memberships are reused, and the members' PRD roles
are re-added to the new PRDs. Nobody else's data is touched: it refuses to
run if the demo account is a non-admin member of someone else's
organization, or a demo member belongs to another organization.

Usage, from app/backend (the local stack is the default target):
    python seed_demo.py                 # SUPABASE_* from the environment/.env
    DEMO_PASSWORD=... python seed_demo.py

It refuses non-local Supabase URLs unless --allow-hosted is given. Running it
against the hosted project is part of the hosted rollout plan (Marco's
go-ahead, after the migrations), not something to do ad hoc.

Passwords are never stored in the repo. DEMO_PASSWORD applies to every demo
account (admin and members); a new account without it gets a random
password, printed once.
"""

import argparse
import os
import secrets
import sys
from urllib.parse import urlparse

from seed_demo_content import PRDS, PROJECTS

DEMO_EMAIL = os.environ.get("DEMO_EMAIL", "nautilus.demo@example.com")
DEMO_NAME = "Nautilus Demo PM"
DEMO_ORG = "Nautilus Demo"
LOCAL_HOSTS = {"127.0.0.1", "localhost", "host.docker.internal"}

# Members of the demo organization (plain members, not admins). Their
# addresses follow DEMO_EMAIL as name+tag@domain, so a throwaway demo address
# gets throwaway members. "prds" maps PRD titles to that member's role; a
# member sees only the PRDs listed.
MEMBERS = [
    {"tag": "engineer", "name": "Nautilus Demo Engineer",
     "prds": {"Campus Study Group Finder": "editor", "Expense Report Automation": "viewer"}},
    {"tag": "stakeholder", "name": "Nautilus Demo Stakeholder",
     "prds": {"Campus Study Group Finder": "viewer"}},
]


def member_email(member):
    local, domain = DEMO_EMAIL.split("@", 1)
    return f"{local}+{member['tag']}@{domain}"


def section_order():
    """The nine section types in the shared spec's standard order."""
    from prd_document import section_types

    return list(section_types())


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


def find_user(supabase, email):
    for user in supabase.auth.admin.list_users(per_page=1000):
        if user.email == email:
            return user
    return None


def find_demo_user(supabase):
    return find_user(supabase, DEMO_EMAIL)


def ensure_account(supabase, email, name):
    """Returns (user, note). An existing account keeps its password unless
    DEMO_PASSWORD is set. A new account without it gets a random one, which
    is the only time a password is printed."""
    password = os.environ.get("DEMO_PASSWORD")
    user = find_user(supabase, email)
    if user:
        if password:
            supabase.auth.admin.update_user_by_id(user.id, {"password": password})
            return user, f"{email}: existing account, password set from DEMO_PASSWORD."
        return user, f"{email}: existing account, password unchanged (set DEMO_PASSWORD to reset it)."
    generated = password is None
    password = password or secrets.token_urlsafe(12)
    created = supabase.auth.admin.create_user({
        "email": email, "password": password, "email_confirm": True,
        "user_metadata": {"full_name": name},
    })
    if generated:
        return created.user, f"{email}: new account. Password: {password}\nSave this now: it isn't stored anywhere else."
    return created.user, f"{email}: new account, password set from DEMO_PASSWORD."


def ensure_demo_user(supabase):
    return ensure_account(supabase, DEMO_EMAIL, DEMO_NAME)


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


def ensure_org_member(supabase, user_id, org_id):
    """A plain, active member of the demo organization. Never moves an
    account out of another organization (one active org per account)."""
    rows = (supabase.table("organization_member").select("organization_id")
            .eq("user_id", user_id).eq("active", True).execute().data)
    if rows and rows[0]["organization_id"] != org_id:
        raise SystemExit(f"Demo member {user_id} belongs to another organization; not adding them.")
    supabase.table("organization_member").upsert(
        {"organization_id": org_id, "user_id": user_id, "access_role": "member", "active": True},
        on_conflict="organization_id,user_id").execute()


def ensure_members(supabase, org_id):
    """Returns [(member spec, user, note)] for the demo members, each an
    active member of the demo organization."""
    members = []
    for member in MEMBERS:
        user, note = ensure_account(supabase, member_email(member), member["name"])
        supabase.table("profile").update({"full_name": member["name"]}).eq("id", user.id).execute()
        ensure_org_member(supabase, user.id, org_id)
        members.append((member, user, note))
    return members


def seed(supabase, allow_hosted=False):
    import prd_save

    require_local_target(allow_hosted)
    check_documents()
    user, note = ensure_demo_user(supabase)
    user_id = user.id
    supabase.table("profile").update({"full_name": DEMO_NAME}).eq("id", user_id).execute()
    org_id = ensure_demo_org(supabase, user_id)
    members = ensure_members(supabase, org_id)

    # Only the demo account's own rows. PRDs first (their roles, versions,
    # answers and context cascade), then its projects.
    supabase.table("prd").delete().eq("owner_id", user_id).execute()
    supabase.table("project").delete().eq("owner_id", user_id).execute()

    project_ids = {}
    for name in PROJECTS:
        project_ids[name] = (supabase.table("project").insert({"name": name, "owner_id": user_id})
                             .execute().data[0]["id"])

    # Oldest first, so "recently updated" ordering matches the story.
    prd_ids = {}
    for prd in sorted(PRDS, key=lambda p: -p["days_ago"]):
        row = (supabase.table("prd").insert({
            "title": prd["title"], "owner_id": user_id, "organization_id": org_id,
            "project_id": project_ids.get(prd["project"]),
        }).execute().data[0])
        prd_ids[prd["title"]] = row["id"]
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

    # The members' roles, granted by the demo admin. Written directly like
    # the rest of the demo data, so no member_added events or notifications
    # are recorded (nobody gets an invite in their inbox).
    supabase.table("prd_member").insert([
        {"prd_id": prd_ids[title], "user_id": user.id, "role": role, "granted_by": user_id}
        for member, user, _ in members for title, role in member["prds"].items()
    ]).execute()

    print(f"Seeded {len(PROJECTS)} projects and {len(PRDS)} PRDs for {DEMO_EMAIL} in {DEMO_ORG!r}, "
          f"with {len(members)} members")
    for line in [note] + [member_note for _, _, member_note in members]:
        print(line)
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
