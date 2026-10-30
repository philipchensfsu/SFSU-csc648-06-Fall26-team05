"""E01 directory rules, checked when each transaction commits: reporting lines,
department heads, team leads and archiving, plus the per-org lock that stops
two concurrent changes from forming a cycle together."""

import threading
import time
from dataclasses import dataclass

import psycopg
import pytest

from conftest import DB_URL


@dataclass
class Org:
    id: str
    product: str
    ops: str
    growth: str
    alice: str
    ben: str
    erin: str
    ada: str


@pytest.fixture
def org(make_user, db):
    """Alice (admin), Ben, Erin and Ada in Product; an Ops department; a Growth team in Product, no lead."""
    alice, ben, erin, ada = (make_user(org=False).id for _ in range(4))
    org_id = db.execute("insert into organization (name, created_by) values ('Rules', %s) returning id::text",
                        (alice,)).fetchone()[0]
    product, ops = (db.execute("insert into department (organization_id, name) values (%s, %s) returning id::text",
                               (org_id, name)).fetchone()[0] for name in ("Product", "Ops"))
    growth = db.execute("insert into team (organization_id, department_id, name) values (%s, %s, 'Growth') "
                        "returning id::text", (org_id, product)).fetchone()[0]
    for user, role in ((alice, "admin"), (ben, "member"), (erin, "member"), (ada, "member")):
        db.execute("insert into organization_member (organization_id, user_id, department_id, access_role) "
                   "values (%s, %s, %s, %s)", (org_id, user, product, role))
    yield Org(org_id, product, ops, growth, alice, ben, erin, ada)
    db.execute("delete from organization where id = %s", (org_id,))


def commit(*statements):
    """Runs the statements as one transaction. Returns the violated constraint name, or None if it committed."""
    with psycopg.connect(DB_URL) as conn:
        try:
            with conn.transaction():
                for sql, params in statements:
                    conn.execute(sql, params)
        except psycopg.errors.CheckViolation as exc:
            return exc.diag.constraint_name
    return None


def manager(user, boss):
    return "update organization_member set manager_id = %s where user_id = %s", (boss, user)


def head(department, user):
    return "update department set head_id = %s where id = %s", (user, department)


def deactivate(user):
    return "update organization_member set active = false where user_id = %s", (user,)


def move(user, department):
    return "update organization_member set department_id = %s where user_id = %s", (department, user)


def join_team(o, user):
    return "insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)", (o.id, o.growth, user)


def lead(o, user):
    return "update team set lead_id = %s where id = %s", (user, o.growth)


# Reporting lines

def test_a_normal_reporting_chain_commits(org):
    assert commit(manager(org.ben, org.alice), manager(org.erin, org.alice), manager(org.ada, org.ben)) is None


@pytest.mark.parametrize("loop", ["two", "three"])
def test_reporting_cycles_are_rejected(org, loop):
    chain = [org.alice, org.ben] if loop == "two" else [org.alice, org.ben, org.erin]
    steps = [manager(user, chain[(i + 1) % len(chain)]) for i, user in enumerate(chain)]
    assert commit(*steps) == "org_manager_cycle"


def test_deactivating_a_manager_with_active_reports_is_rejected(org):
    assert commit(manager(org.ben, org.alice), deactivate(org.alice)) == "org_manager_active"


def test_deactivating_a_manager_while_reassigning_reports_commits(org):
    assert commit(manager(org.ben, org.alice), deactivate(org.alice), manager(org.ben, org.erin)) is None


# Department heads

def test_a_department_member_can_be_head(org):
    assert commit(head(org.product, org.ben)) is None


@pytest.mark.parametrize("change", ["other department", "moved out", "deactivated"])
def test_heads_must_be_active_members_of_their_department(org, change):
    steps = {
        "other department": [head(org.ops, org.ben)],
        "moved out": [head(org.product, org.ben), move(org.ben, org.ops)],
        "deactivated": [head(org.product, org.ben), deactivate(org.ben)],
    }[change]
    assert commit(*steps) == "org_department_head"


def test_moving_a_head_and_naming_a_new_one_together_commits(org):
    assert commit(head(org.product, org.ben), move(org.ben, org.ops), head(org.product, org.erin)) is None


# Team leads

def test_a_lead_must_be_on_the_team(org):
    assert commit(lead(org, org.ben)) == "org_team_lead"
    assert commit(join_team(org, org.ben), lead(org, org.ben)) is None


def test_removing_the_lead_from_the_team_is_rejected(org):
    assert commit(join_team(org, org.ben), lead(org, org.ben)) is None
    remove = ("delete from team_member where team_id = %s and user_id = %s", (org.growth, org.ben))
    assert commit(remove) == "org_team_lead"


# Archiving

def test_an_archived_department_cannot_hold_active_members(org):
    archive_ops = ("update department set archived_at = now() where id = %s", (org.ops,))
    assert commit(archive_ops, move(org.ada, org.ops)) == "org_department_archived"


def test_an_archived_department_cannot_hold_an_active_team(org):
    clear = ("update organization_member set department_id = null where organization_id = %s", (org.id,))
    archive_product = ("update department set archived_at = now() where id = %s", (org.product,))
    assert commit(clear, archive_product) == "org_department_archived"


def test_an_archived_team_cannot_take_members_but_an_empty_one_can_be_archived(org):
    archive_growth = ("update team set archived_at = now() where id = %s", (org.growth,))
    assert commit(archive_growth, join_team(org, org.ben)) == "org_team_archived"
    assert commit(archive_growth) is None


# Concurrency

def test_concurrent_changes_that_form_a_cycle_together_are_rejected(org):
    """Each change is fine alone. The second waits for the org lock, then sees the first and fails."""
    first_done = threading.Event()

    def first():
        with psycopg.connect(DB_URL) as conn, conn.transaction():
            conn.execute(*manager(org.alice, org.ben))
            time.sleep(1.5)  # hold the org lock while the second change starts
        first_done.set()

    thread = threading.Thread(target=first)
    thread.start()
    time.sleep(0.5)
    started = time.monotonic()
    result = commit(manager(org.ben, org.alice))
    waited = time.monotonic() - started
    thread.join()
    assert first_done.is_set() and result == "org_manager_cycle" and waited > 0.5


def test_clients_cannot_call_the_check_functions(db):
    for function in ("check_org_directory(uuid)", "lock_org_directory()", "check_org_directory_trigger()"):
        assert db.execute("select has_function_privilege('authenticated', %s, 'execute')",
                          (function,)).fetchone()[0] is False
