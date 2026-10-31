"""E03 part 3: every PRD belongs to its creator's organization, PRD responses
carry the caller's my_role, and GET /api/prds?view= splits owned from shared."""

import psycopg
import pytest

from conftest import add_to_prd, org_prd


def test_a_new_prd_belongs_to_the_creators_org(make_user, db):
    alice = make_user()
    r = alice.api("POST", "/prds", json={"title": "Mine"})
    assert r.status_code == 201, r.text
    org = db.execute("select organization_id::text from organization_member where user_id = %s", (alice.id,)).fetchone()[0]
    assert r.json()["organization_id"] == org and r.json()["my_role"] == "owner"


def test_an_account_without_an_org_cannot_create_prds(make_user):
    r = make_user(org=False).api("POST", "/prds", json={"title": "Nowhere"})
    assert r.status_code == 403 and r.json()["code"] == "no_organization"


def test_every_prd_has_an_org_and_keeps_it(make_user, db):
    alice, other = make_user(), make_user()
    prd = alice.api("POST", "/prds", json={"title": "Mine"}).json()["id"]
    with pytest.raises(psycopg.errors.NotNullViolation):
        db.execute("insert into prd (title, owner_id) values ('No org', %s)", (alice.id,))
    other_org = db.execute("select organization_id::text from organization_member where user_id = %s",
                           (other.id,)).fetchone()[0]
    assert alice.rest("PATCH", f"prd?id=eq.{prd}", json={"organization_id": other_org}).status_code == 403


@pytest.fixture
def shared(make_user, make_org, db):
    """Alice owns one PRD and edits Ben's; Erin views Ben's; Ada is the org admin."""
    ada, alice, ben, erin = (make_user() for _ in range(4))
    org = make_org(ada, alice, ben, erin)
    alices = org_prd(db, org, alice, "Alice's")
    bens = org_prd(db, org, ben, "Ben's")
    add_to_prd(db, bens, alice, "editor")
    add_to_prd(db, bens, erin, "viewer")
    return dict(ada=ada, alice=alice, ben=ben, erin=erin, alices=alices, bens=bens)


def roles(user, query=""):
    return {p["title"]: p["my_role"] for p in user.api("GET", f"/prds{query}").json()}


def test_my_role_reflects_each_callers_access(shared):
    assert roles(shared["alice"]) == {"Alice's": "owner", "Ben's": "editor"}
    assert roles(shared["erin"]) == {"Ben's": "viewer"}
    assert roles(shared["ada"]) == {"Alice's": "org_admin", "Ben's": "org_admin"}
    assert shared["erin"].api("GET", f"/prds/{shared['bens']}").json()["my_role"] == "viewer"


def test_view_splits_owned_from_shared(shared):
    alice = shared["alice"]
    assert roles(alice, "?view=owned") == {"Alice's": "owner"}
    assert roles(alice, "?view=shared") == {"Ben's": "editor"}
    # An org admin's access isn't an invitation, so it's in neither list.
    assert roles(shared["ada"], "?view=owned") == {} and roles(shared["ada"], "?view=shared") == {}


def test_an_unknown_view_is_422(make_user):
    r = make_user().api("GET", "/prds?view=everything")
    assert r.status_code == 422 and r.json()["code"] == "validation_error"


def test_saving_returns_my_role(shared):
    alice = shared["alice"]
    prd = alice.api("GET", f"/prds/{shared['bens']}").json()
    r = alice.api("PUT", f"/prds/{shared['bens']}", json={"revision": prd["revision"], "title": "Ben's v2"})
    assert r.status_code == 200 and r.json()["my_role"] == "editor"


def test_seeded_prds_are_in_the_seeded_org(db):
    assert db.execute("select count(*) from prd p join organization o on o.id = p.organization_id "
                      "where o.name = 'Campus Apps'").fetchone()[0] >= 4
