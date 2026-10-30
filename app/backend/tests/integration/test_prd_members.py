"""E03 per-PRD roles: the creator becomes the owner, people on an org PRD
are active members of its org, every PRD keeps an owner, and clients can
read but not write the roles."""

import psycopg
import pytest

from conftest import data_api


@pytest.fixture
def org(make_user, db):
    """Alice (admin) and Ben (member) in one org; Carol in another; Dan in none."""
    alice, ben, carol, dan = (make_user() for _ in range(4))
    org_id = db.execute("insert into organization (name, created_by) values ('Org', %s) returning id::text",
                        (alice.id,)).fetchone()[0]
    other = db.execute("insert into organization (name, created_by) values ('Other', %s) returning id::text",
                       (carol.id,)).fetchone()[0]
    db.execute("insert into organization_member (organization_id, user_id, access_role) values "
               "(%s, %s, 'admin'), (%s, %s, 'member'), (%s, %s, 'admin')",
               (org_id, alice.id, org_id, ben.id, other, carol.id))
    yield {"id": org_id, "other": other, "alice": alice, "ben": ben, "carol": carol, "dan": dan}
    db.execute("delete from prd where organization_id in (%s, %s)", (org_id, other))
    db.execute("delete from organization where id in (%s, %s)", (org_id, other))


def org_prd(db, org, creator):
    return db.execute("insert into prd (title, owner_id, organization_id) values ('Org PRD', %s, %s) returning id::text",
                      (creator.id, org["id"])).fetchone()[0]


def add(db, prd, user, role):
    db.execute("insert into prd_member (prd_id, user_id, role) values (%s, %s, %s)", (prd, user.id, role))


def violation(db, sql, params):
    with pytest.raises(psycopg.errors.CheckViolation) as caught:
        with db.transaction():
            db.execute(sql, params)
    return caught.value.diag.constraint_name


def test_creating_a_prd_makes_the_creator_its_owner(make_user):
    alice = make_user()
    prd = alice.api("POST", "/prds", json={"title": "Mine"}).json()["id"]
    rows = alice.rest("GET", f"prd_member?prd_id=eq.{prd}&select=user_id,role").json()
    assert rows == [{"user_id": alice.id, "role": "owner"}]
    assert alice.rest("POST", "rpc/prd_role", json={"target_prd": prd}).json() == "owner"
    assert alice.rest("POST", "rpc/is_prd_owner", json={"target_prd": prd}).json() is True


def test_every_existing_prd_has_an_owner(db):
    assert db.execute("select count(*) from prd p where not exists "
                      "(select 1 from prd_member m where m.prd_id = p.id and m.role = 'owner')").fetchone()[0] == 0


def test_org_members_can_be_added_with_any_role(org, db):
    prd = org_prd(db, org, org["alice"])
    add(db, prd, org["ben"], "editor")
    roles = dict(db.execute("select user_id::text, role from prd_member where prd_id = %s", (prd,)).fetchall())
    assert roles == {org["alice"].id: "owner", org["ben"].id: "editor"}


@pytest.mark.parametrize("who", ["carol", "dan"])
def test_people_outside_the_org_cannot_be_added(org, db, who):
    prd = org_prd(db, org, org["alice"])
    sql = "insert into prd_member (prd_id, user_id, role) values (%s, %s, 'viewer')"
    assert violation(db, sql, (prd, org[who].id)) == "prd_member_same_org"


def test_a_personal_prd_has_only_its_creator(make_user, db):
    alice, ben = make_user(), make_user()
    prd = alice.api("POST", "/prds", json={"title": "Personal"}).json()["id"]
    sql = "insert into prd_member (prd_id, user_id, role) values (%s, %s, 'viewer')"
    assert violation(db, sql, (prd, ben.id)) == "prd_member_personal"


def test_the_last_owner_cannot_be_removed_or_demoted(org, db):
    prd = org_prd(db, org, org["alice"])
    remove = "delete from prd_member where prd_id = %s and user_id = %s"
    assert violation(db, remove, (prd, org["alice"].id)) == "prd_owner_required"
    demote = "update prd_member set role = 'editor' where prd_id = %s and user_id = %s"
    assert violation(db, demote, (prd, org["alice"].id)) == "prd_owner_required"


def test_ownership_can_be_handed_over_in_one_transaction(org, db):
    prd = org_prd(db, org, org["alice"])
    with db.transaction():
        add(db, prd, org["ben"], "owner")
        db.execute("delete from prd_member where prd_id = %s and user_id = %s", (prd, org["alice"].id))
    assert db.execute("select user_id::text from prd_member where prd_id = %s", (prd,)).fetchall() == [(org["ben"].id,)]


def test_deleting_a_prd_removes_its_people(org, db):
    prd = org_prd(db, org, org["alice"])
    add(db, prd, org["ben"], "viewer")
    db.execute("delete from prd where id = %s", (prd,))
    assert db.execute("select count(*) from prd_member where prd_id = %s", (prd,)).fetchone()[0] == 0


def test_a_deactivated_member_has_no_role(org, db):
    prd = org_prd(db, org, org["alice"])
    add(db, prd, org["ben"], "editor")
    ben = org["ben"]
    assert ben.rest("POST", "rpc/prd_role", json={"target_prd": prd}).json() == "editor"
    db.execute("update organization_member set active = false where user_id = %s", (ben.id,))
    assert ben.rest("POST", "rpc/prd_role", json={"target_prd": prd}).json() is None


def test_org_admins_are_recognized_only_in_their_org(org, db):
    prd = org_prd(db, org, org["ben"])
    assert org["alice"].rest("POST", "rpc/is_prd_org_admin", json={"target_prd": prd}).json() is True
    assert org["ben"].rest("POST", "rpc/is_prd_org_admin", json={"target_prd": prd}).json() is False
    assert org["carol"].rest("POST", "rpc/is_prd_org_admin", json={"target_prd": prd}).json() is False


def test_clients_cannot_write_roles(make_user):
    alice, ben = make_user(), make_user()
    prd = alice.api("POST", "/prds", json={"title": "Mine"}).json()["id"]
    r = alice.rest("POST", "prd_member", json={"prd_id": prd, "user_id": ben.id, "role": "editor"})
    assert r.status_code in (401, 403)
    r = alice.rest("PATCH", f"prd_member?prd_id=eq.{prd}", json={"role": "viewer"})
    assert r.status_code in (401, 403)


def test_roles_are_visible_only_on_prds_you_can_see(make_user):
    alice, ben = make_user(), make_user()
    prd = alice.api("POST", "/prds", json={"title": "Mine"}).json()["id"]
    assert ben.rest("GET", f"prd_member?prd_id=eq.{prd}&select=user_id").json() == []
    assert ben.rest("POST", "rpc/prd_role", json={"target_prd": prd}).json() is None


def test_signed_out_callers_cannot_use_the_helpers(make_user):
    prd = make_user().api("POST", "/prds", json={"title": "Mine"}).json()["id"]
    for helper in ("prd_role", "is_prd_owner", "is_prd_org_admin"):
        assert data_api("POST", f"rpc/{helper}", json={"target_prd": prd}).status_code in (401, 403, 404)
