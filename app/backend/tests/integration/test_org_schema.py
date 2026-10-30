"""E01 organization schema (#58): who sees which org rows, no direct client
writes, same-org links, unique active names, roles, and the org helpers."""

import psycopg
import pytest

from conftest import data_api

COLUMNS = {
    "organization": "id",
    "department": "organization_id",
    "team": "organization_id",
    "organization_member": "organization_id",
    "team_member": "organization_id",
}


@pytest.fixture
def orgs(make_user, db):
    """Org X: Alice (admin) and Erin (inactive), a Product department and Growth team. Org Y: Ben (admin), Ops."""
    alice, ben, erin = make_user(), make_user(), make_user()
    x, y = (db.execute("insert into organization (name, created_by) values (%s, %s) returning id::text",
                       (name, creator.id)).fetchone()[0] for name, creator in (("Org X", alice), ("Org Y", ben)))
    product = db.execute("insert into department (organization_id, name) values (%s, 'Product') returning id::text",
                         (x,)).fetchone()[0]
    ops = db.execute("insert into department (organization_id, name) values (%s, 'Ops') returning id::text",
                     (y,)).fetchone()[0]
    growth = db.execute("insert into team (organization_id, department_id, name) values (%s, %s, 'Growth') "
                        "returning id::text", (x, product)).fetchone()[0]
    db.execute("insert into organization_member (organization_id, user_id, department_id, access_role) values "
               "(%s, %s, %s, 'admin'), (%s, %s, %s, 'admin')", (x, alice.id, product, y, ben.id, ops))
    db.execute("insert into organization_member (organization_id, user_id, active) values (%s, %s, false)", (x, erin.id))
    db.execute("insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)", (x, growth, alice.id))
    yield dict(x=x, y=y, product=product, ops=ops, growth=growth, alice=alice, ben=ben, erin=erin)
    db.execute("delete from organization where id in (%s, %s)", (x, y))


def fails(db, sql, params=()):
    try:
        with db.transaction():
            db.execute(sql, params)
    except psycopg.Error:
        return True
    return False


@pytest.mark.parametrize("table", COLUMNS)
def test_members_see_only_their_own_org(orgs, table):
    rows = orgs["alice"].rest("GET", f"{table}?select={COLUMNS[table]}").json()
    assert {row[COLUMNS[table]] for row in rows} == {orgs["x"]}


def test_inactive_members_and_signed_out_callers_see_nothing(orgs):
    assert orgs["erin"].rest("GET", "organization_member?select=user_id").json() == []
    assert data_api("GET", "organization?select=id").status_code in (401, 403)


def test_clients_cannot_write_directory_rows(orgs, db):
    alice = orgs["alice"]
    assert alice.rest("POST", "department", json={"organization_id": orgs["x"], "name": "New"}).status_code in (401, 403)
    assert alice.rest("PATCH", f"organization?id=eq.{orgs['x']}", json={"name": "Renamed"}).status_code in (401, 403)
    assert db.execute("select name from organization where id = %s", (orgs["x"],)).fetchone()[0] == "Org X"


@pytest.mark.parametrize("change", [
    "member in another org's department", "team in another org's department", "non-member on a team",
    "manager from another org", "own manager", "head from another org",
])
def test_links_stay_inside_one_org(orgs, db, change):
    o = orgs
    sql, params = {
        "member in another org's department": (
            "update organization_member set department_id = %s where user_id = %s", (o["ops"], o["alice"].id)),
        "team in another org's department": (
            "insert into team (organization_id, department_id, name) values (%s, %s, 'X')", (o["x"], o["ops"])),
        "non-member on a team": (
            "insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)", (o["x"], o["growth"], o["ben"].id)),
        "manager from another org": (
            "update organization_member set manager_id = %s where user_id = %s", (o["ben"].id, o["alice"].id)),
        "own manager": (
            "update organization_member set manager_id = %s where user_id = %s", (o["alice"].id, o["alice"].id)),
        "head from another org": (
            "update department set head_id = %s where id = %s", (o["ben"].id, o["product"])),
    }[change]
    assert fails(db, sql, params)


def test_active_names_are_unique_but_archived_ones_can_be_reused(orgs, db):
    assert fails(db, "insert into department (organization_id, name) values (%s, 'PRODUCT')", (orgs["x"],))
    with db.transaction():
        db.execute("delete from team_member where team_id = %s", (orgs["growth"],))
        db.execute("update organization_member set department_id = null where organization_id = %s", (orgs["x"],))
        db.execute("update team set archived_at = now() where id = %s", (orgs["growth"],))
        db.execute("update department set archived_at = now() where id = %s", (orgs["product"],))
    assert not fails(db, "insert into department (organization_id, name) values (%s, 'Product')", (orgs["x"],))


def test_blank_org_names_and_unknown_roles_are_rejected(orgs, db):
    assert fails(db, "insert into organization (name) values ('   ')")
    assert fails(db, "update organization_member set access_role = 'editor' where user_id = %s", (orgs["alice"].id,))
    assert db.execute("select access_role from organization_member where user_id = %s",
                      (orgs["erin"].id,)).fetchone()[0] == "member"


def test_there_are_no_can_assign_or_can_approve_flags(db):
    columns = {row[0] for row in db.execute("select column_name from information_schema.columns "
                                             "where table_name = 'organization_member'").fetchall()}
    assert not columns & {"can_assign", "can_approve"}


def test_new_functions_start_closed_to_clients(db):
    db.execute("create function it_probe() returns int language sql as 'select 1'")
    try:
        grants = {role: db.execute("select has_function_privilege(%s, 'it_probe()', 'execute')", (role,)).fetchone()[0]
                  for role in ("anon", "authenticated", "service_role")}
    finally:
        db.execute("drop function it_probe()")
    assert grants == {"anon": False, "authenticated": False, "service_role": True}


def test_org_helpers_answer_only_for_the_caller(orgs):
    assert data_api("POST", "rpc/is_org_member", json={"target_org": orgs["x"]}).status_code in (401, 403, 404)
    assert orgs["ben"].rest("POST", "rpc/is_org_member", json={"target_org": orgs["x"]}).json() is False
    assert orgs["alice"].rest("POST", "rpc/is_org_admin", json={"target_org": orgs["x"]}).json() is True


def test_deleting_a_manager_head_or_lead_clears_those_links(orgs, make_user, db):
    temp = make_user()
    o = orgs
    with db.transaction():
        db.execute("insert into organization_member (organization_id, user_id, department_id) values (%s, %s, %s)",
                   (o["x"], temp.id, o["product"]))
        db.execute("insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)",
                   (o["x"], o["growth"], temp.id))
        db.execute("update organization_member set manager_id = %s where user_id = %s", (temp.id, o["alice"].id))
        db.execute("update department set head_id = %s where id = %s", (temp.id, o["product"]))
        db.execute("update team set lead_id = %s where id = %s", (temp.id, o["growth"]))
    db.execute("delete from profile where id = %s", (temp.id,))
    links = db.execute("select (select manager_id from organization_member where user_id = %s), "
                       "(select head_id from department where id = %s), (select lead_id from team where id = %s)",
                       (o["alice"].id, o["product"], o["growth"])).fetchone()
    assert links == (None, None, None)


def test_personal_projects_and_prds_still_work(make_user):
    alice = make_user()
    assert alice.api("POST", "/projects", json={"name": "Personal"}).status_code == 201
    assert alice.api("POST", "/prds", json={"title": "Personal"}).status_code == 201
