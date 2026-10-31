"""The v2 demo seed against the local stack: run it twice for a throwaway
demo address and check what it created, that reruns don't duplicate
anything, and that other accounts are untouched."""

import uuid

import httpx
import pytest
from supabase import create_client

import seed_demo
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL, User

PASSWORD = "seed-test-password-123"


@pytest.fixture
def demo(monkeypatch, db):
    email = f"it-demo-{uuid.uuid4().hex[:8]}@example.com"
    monkeypatch.setattr(seed_demo, "DEMO_EMAIL", email)
    monkeypatch.setenv("DEMO_PASSWORD", PASSWORD)
    service = create_client(SUPABASE_URL, SERVICE_KEY)
    yield service, email
    user = seed_demo.find_demo_user(service)
    if user:
        db.execute("delete from prd where owner_id = %s", (user.id,))
        db.execute("delete from organization where created_by = %s", (user.id,))
        service.auth.admin.delete_user(user.id)
    for member in seed_demo.MEMBERS:
        found = seed_demo.find_user(service, seed_demo.member_email(member))
        if found:
            service.auth.admin.delete_user(found.id)


def counts(db, user_id):
    return db.execute("""
        select (select count(*) from organization_member where user_id = %(u)s and active),
               (select count(*) from organization where created_by = %(u)s),
               (select count(*) from project where owner_id = %(u)s),
               (select count(*) from prd where owner_id = %(u)s),
               (select count(*) from prd_version v join prd p on p.id = v.prd_id where p.owner_id = %(u)s),
               (select count(*) from generation_record g join prd p on p.id = g.prd_id where p.owner_id = %(u)s)
    """, {"u": user_id}).fetchone()


def test_seed_creates_the_demo_org_projects_and_v2_prds(demo, db):
    service, email = demo
    org_id = seed_demo.seed(service)
    user = seed_demo.find_demo_user(service)
    prds = len(seed_demo.PRDS)
    # A version for each PRD whose save changed something (an empty draft
    # with no description is a no-op save); no AI records.
    saved = sum(1 for p in seed_demo.PRDS if p["content"] or seed_demo.description_for(p))
    assert counts(db, user.id) == (1, 1, len(seed_demo.PROJECTS), prds, saved, 0)
    assert db.execute("select access_role from organization_member where user_id = %s", (user.id,)).fetchone() == \
        ("admin",)
    rows = db.execute("select title, status, doc_schema_version, content_json is not null, content_text, "
                      "organization_id::text, description from prd where owner_id = %s", (user.id,)).fetchall()
    expected = {p["title"]: p for p in seed_demo.PRDS}
    for title, status, schema, has_doc, text, org, description in rows:
        assert status == expected[title]["status"] and org == org_id
        assert description == seed_demo.description_for(expected[title])
        if expected[title]["content"]:
            assert has_doc and schema == 2 and text  # server-derived
    # The versions came from the save core: the demo user saved them.
    authors = db.execute("select distinct v.created_by::text, v.origin from prd_version v join prd p on p.id = v.prd_id "
                         "where p.owner_id = %s", (user.id,)).fetchall()
    assert authors == [(user.id, "pm_edit")]


def test_reruns_replace_without_duplicating_and_keep_the_login(demo, db):
    service, email = demo
    first_org = seed_demo.seed(service)
    user = seed_demo.find_demo_user(service)
    first = counts(db, user.id)
    assert seed_demo.seed(service) == first_org
    assert counts(db, user.id) == first
    r = httpx.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON_KEY},
                   json={"email": email, "password": PASSWORD})
    assert r.status_code == 200


def test_other_accounts_are_untouched(demo, db, make_user):
    service, _ = demo
    alice = make_user()
    prd = alice.api("POST", "/prds", json={"title": "Alice's own"}).json()
    before = db.execute("select count(*) from prd where owner_id = %s", (alice.id,)).fetchone()
    seed_demo.seed(service)
    seed_demo.seed(service)
    assert db.execute("select count(*) from prd where owner_id = %s", (alice.id,)).fetchone() == before
    assert db.execute("select title from prd where id = %s", (prd["id"],)).fetchone() == ("Alice's own",)


def test_a_demo_account_in_someone_elses_org_is_not_seeded(demo, db, make_org, make_user):
    service, email = demo
    owner = make_user()
    created = service.auth.admin.create_user({"email": email, "password": PASSWORD, "email_confirm": True})
    org = make_org(owner)
    db.execute("delete from organization_member where user_id = %s", (created.user.id,))
    db.execute("insert into organization_member (organization_id, user_id) values (%s, %s)", (org, created.user.id))
    with pytest.raises(SystemExit):
        seed_demo.seed(service)
    assert db.execute("select count(*) from prd where owner_id = %s", (created.user.id,)).fetchone() == (0,)


def sign_in(email):
    r = httpx.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON_KEY},
                   json={"email": email, "password": PASSWORD})
    assert r.status_code == 200, email
    body = r.json()
    return User(body["user"]["id"], email, body["access_token"])


def test_members_join_the_demo_org_with_their_prd_roles(demo, db):
    service, _ = demo
    org_id = seed_demo.seed(service)
    seed_demo.seed(service)  # rerun: roles re-added once, memberships reused
    signed_in = []
    for member in seed_demo.MEMBERS:
        user = sign_in(seed_demo.member_email(member))
        assert db.execute("select organization_id::text, access_role from organization_member "
                          "where user_id = %s and active", (user.id,)).fetchall() == [(org_id, "member")]
        roles = dict(db.execute("select p.title, m.role from prd_member m join prd p on p.id = m.prd_id "
                                "where m.user_id = %s", (user.id,)).fetchall())
        assert roles == member["prds"]
        # Through the API, a member sees exactly the PRDs they're on.
        listed = user.api("GET", "/prds").json()
        items = listed["items"] if isinstance(listed, dict) else listed
        assert {p["title"] for p in items} == set(member["prds"])
        signed_in.append((member, user, items))
    # Saves last (an editor's rename changes what the next member would list):
    # viewers can't save, editors can.
    for member, user, items in signed_in:
        for p in items:
            current = user.api("GET", f"/prds/{p['id']}").json()
            r = user.api("PUT", f"/prds/{p['id']}", json={"revision": current["revision"], "title": p["title"] + " x"})
            assert r.status_code == (403 if member["prds"][p["title"]] == "viewer" else 200), p["title"]
