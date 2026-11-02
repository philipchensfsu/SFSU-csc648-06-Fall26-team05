"""The org demo seed (Q03) against the local stack, for a throwaway demo address:
the directory, real review states with their comments and notifications, the
solo organization, and that a rerun leaves the same data."""

import uuid

import pytest
from supabase import create_client

import seed_demo
import seed_org_demo
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL

PASSWORD = "seed-org-test-password-123"


@pytest.fixture
def demo(monkeypatch, db):
    name = f"it-org-{uuid.uuid4().hex[:8]}"
    monkeypatch.setattr(seed_demo, "DEMO_EMAIL", f"{name}@example.com")
    monkeypatch.setenv("DEMO_PASSWORD", PASSWORD)
    service = create_client(SUPABASE_URL, SERVICE_KEY)
    yield service
    # The demo account, the tagged people (name+key@...) and the solo org's owner.
    users = db.execute("select id::text from auth.users where email = %s or email like %s",
                       (f"{name}@example.com", f"{name}+%@example.com")).fetchall()
    for (user_id,) in users:
        db.execute("delete from prd where owner_id = %s", (user_id,))
    for (user_id,) in users:
        db.execute("delete from organization where created_by = %s", (user_id,))
    for (user_id,) in users:
        service.auth.admin.delete_user(user_id)


def org_of(db, service):
    owner = seed_demo.find_demo_user(service)
    return db.execute("select organization_id::text from organization_member where user_id = %s and active",
                      (owner.id,)).fetchone()[0]


def review_states(db, org):
    return dict(db.execute("""
        select p.title, p.status || '/' || coalesce(r.state, 'none')
        from prd p left join review_round r on r.prd_id = p.id and r.state <> 'superseded'
        where p.organization_id = %s""", (org,)).fetchall())


def snapshot(db, org):
    return db.execute("""
        select (select count(*) from organization_member where organization_id = %(o)s and active),
               (select count(*) from department where organization_id = %(o)s),
               (select count(*) from team where organization_id = %(o)s),
               (select count(*) from team_member where organization_id = %(o)s),
               (select count(*) from review_round r join prd p on p.id = r.prd_id where p.organization_id = %(o)s),
               (select count(*) from prd_comment c join prd p on p.id = c.prd_id where p.organization_id = %(o)s)
    """, {"o": org}).fetchone()


def test_the_seed_builds_the_directory_and_real_review_states(demo, db):
    seed_org_demo.seed(demo, anon_key=ANON_KEY)
    org = org_of(db, demo)
    states = review_states(db, org)
    assert states.pop("Campus Study Group Finder") == "in_review/in_review"
    assert states.pop("Bike Share Docking Map") == "in_review/changes_requested"
    assert states.pop("Dining Hall Menu Alerts") == "final/approved"
    assert states.pop("Recipe Meal Planner") == "final/approved"
    assert states.pop("Expense Report Automation") == "final/approved"
    assert states.pop("Employee Onboarding Checklist") == "in_review/in_review"
    assert set(states.values()) == {"draft/none"}  # seed_demo's bare statuses are gone
    people = len(seed_org_demo.PEOPLE) + len(seed_demo.MEMBERS) + 1  # and the demo account
    assert snapshot(db, org)[:3] == (people, 3, len(seed_org_demo.TEAMS))
    heads = dict(db.execute("select d.name, p.full_name from department d join profile p on p.id = d.head_id "
                            "where d.organization_id = %s", (org,)).fetchall())
    assert heads == {"Product": "Dana Lee", "Engineering": "Raj Patel", "Design": "Leo Kim"}


def test_review_actions_were_taken_by_the_people_themselves(demo, db):
    seed_org_demo.seed(demo, anon_key=ANON_KEY)
    org = org_of(db, demo)
    decided = db.execute("""
        select pr.full_name, s.state from review_slot s join review_round r on r.id = s.round_id
        join prd p on p.id = r.prd_id join profile pr on pr.id = s.reviewer_id
        where p.title = 'Bike Share Docking Map' and p.organization_id = %s""", (org,)).fetchall()
    assert sorted(decided) == [("Mei Chen", "pending"), ("Raj Patel", "changes_requested")]
    actors = {row[0] for row in db.execute("""
        select e.actor_name from prd_event e join prd p on p.id = e.prd_id where p.organization_id = %s""", (org,))}
    assert {"Dana Lee", "Raj Patel", "Noah Fischer"} <= actors
    notified = db.execute("select count(distinct recipient_id) from notification n join prd p on p.id = n.prd_id "
                          "where p.organization_id = %s", (org,)).fetchone()[0]
    assert notified >= 5


def test_an_owner_edit_during_review_resets_the_approval(demo, db):
    seed_org_demo.seed(demo, anon_key=ANON_KEY)
    org = org_of(db, demo)
    rounds = db.execute("""
        select r.state, r.version_id = p.current_version_id, pr.full_name, s.state
        from review_round r join prd p on p.id = r.prd_id
        join review_slot s on s.round_id = r.id join profile pr on pr.id = s.reviewer_id
        where p.title = 'Employee Onboarding Checklist' and p.organization_id = %s""", (org,)).fetchall()
    assert sorted(rounds) == [("in_review", True, "Dana Lee", "pending"), ("in_review", True, "Mei Chen", "pending"),
                              ("superseded", False, "Dana Lee", "approved"), ("superseded", False, "Mei Chen", "pending")]
    superseded = db.execute("""
        select count(*) from notification n join prd_event e on e.id = n.event_id join prd p on p.id = n.prd_id
        join profile pr on pr.id = n.recipient_id
        where p.title = 'Employee Onboarding Checklist' and p.organization_id = %s and pr.full_name = 'Dana Lee'
          and e.event_type = 'superseded'""", (org,)).fetchone()[0]
    assert superseded == 1


def test_the_owners_started_work_on_an_approved_prd(demo, db):
    seed_org_demo.seed(demo, anon_key=ANON_KEY)
    org = org_of(db, demo)
    work = dict(db.execute("select title, work_status from prd where organization_id = %s", (org,)).fetchall())
    assert work.pop("Expense Report Automation") == "in_progress"
    assert set(work.values()) == {"not_started"}


def test_the_solo_organization_has_one_member(demo, db):
    seed_org_demo.seed(demo, anon_key=ANON_KEY)
    members = db.execute("""
        select count(*) from organization_member m join auth.users u on u.id = m.user_id
        where u.email = %s and m.active""", (seed_org_demo.email("solo"),)).fetchone()[0]
    assert members == 1


def test_a_rerun_leaves_the_same_data(demo, db):
    seed_org_demo.seed(demo, anon_key=ANON_KEY)
    org = org_of(db, demo)
    first, states = snapshot(db, org), review_states(db, org)
    seed_org_demo.seed(demo, anon_key=ANON_KEY)
    assert org_of(db, demo) == org
    assert snapshot(db, org) == first and review_states(db, org) == states


def test_it_needs_a_password(demo, monkeypatch):
    monkeypatch.delenv("DEMO_PASSWORD")
    with pytest.raises(SystemExit, match="DEMO_PASSWORD"):
        seed_org_demo.seed(demo, anon_key=ANON_KEY)
