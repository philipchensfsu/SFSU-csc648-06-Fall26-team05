"""Feature 02: adding a whole team to a PRD. A snapshot of the team's active
members, as editors or viewers, never changing anyone already on the PRD, with
one team_added event that notifies the people added."""

import pytest

from conftest import add_to_prd, org_prd


@pytest.fixture
def team(make_user, make_org, db):
    """Ada is the admin; Olive owns the PRD; Ed edits it. Growth is Ed, Gus and Gia; Gia is inactive."""
    ada, olive, ed, gus, gia, nia = (make_user() for _ in range(6))
    org = make_org(ada, olive, ed, gus, gia, nia)
    db.execute(
        "update profile set full_name = 'Olive Owner' where id = %s", (olive.id,)
    )
    prd = org_prd(db, org, olive, "Team PRD")
    add_to_prd(db, prd, ed, "editor")
    growth = db.execute(
        "insert into team (organization_id, name) values (%s, 'Growth') returning id::text",
        (org,),
    ).fetchone()[0]
    for user in (ed, gus, gia):
        db.execute(
            "insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)",
            (org, growth, user.id),
        )
    db.execute(
        "update organization_member set active = false where user_id = %s", (gia.id,)
    )
    return dict(
        ada=ada,
        olive=olive,
        ed=ed,
        gus=gus,
        gia=gia,
        nia=nia,
        org=org,
        prd=prd,
        growth=growth,
    )


def add_team(user, prd, team_id, role="viewer"):
    return user.api(
        "POST", f"/prds/{prd}/members/teams", json={"team_id": team_id, "role": role}
    )


def roles(db, prd):
    return dict(
        db.execute(
            "select user_id::text, role from prd_member where prd_id = %s", (prd,)
        ).fetchall()
    )


def test_adds_active_members_and_skips_people_already_on_it(team, db):
    r = add_team(team["olive"], team["prd"], team["growth"], "viewer")
    assert r.status_code == 200, r.text
    body = r.json()
    assert [m["user_id"] for m in body["added"]] == [team["gus"].id]
    assert [(m["user_id"], m["role"]) for m in body["skipped"]] == [
        (team["ed"].id, "editor")
    ]
    assert {m["user_id"] for m in body["members"]} == {
        team["olive"].id,
        team["ed"].id,
        team["gus"].id,
    }
    # Ed keeps editor (never downgraded); Gia is inactive, so not added.
    assert roles(db, team["prd"]) == {
        team["olive"].id: "owner",
        team["ed"].id: "editor",
        team["gus"].id: "viewer",
    }


def test_one_event_notifies_only_the_people_added(team, db):
    add_team(team["olive"], team["prd"], team["growth"], "editor")
    [(event_type, payload)] = db.execute(
        "select event_type, payload from prd_event where prd_id = %s", (team["prd"],)
    ).fetchall()
    assert event_type == "team_added"
    assert payload == {
        "team_id": team["growth"],
        "team_name": "Growth",
        "role": "editor",
        "user_ids": [team["gus"].id],
    }
    recipients = db.execute(
        "select recipient_id::text from notification where prd_id = %s", (team["prd"],)
    ).fetchall()
    assert recipients == [(team["gus"].id,)]
    [event] = team["olive"].api("GET", f"/prds/{team['prd']}/events").json()["items"]
    assert event["summary"] == "Olive Owner added the Growth team as editors (1 person)"


def test_repeating_it_adds_and_records_nothing(team, db):
    add_team(team["olive"], team["prd"], team["growth"])
    r = add_team(team["olive"], team["prd"], team["growth"])
    assert r.status_code == 200 and r.json()["added"] == []
    assert len(r.json()["skipped"]) == 2
    assert (
        db.execute(
            "select count(*) from prd_event where prd_id = %s", (team["prd"],)
        ).fetchone()[0]
        == 1
    )


def test_later_team_members_get_nothing(team, make_user, db):
    add_team(team["olive"], team["prd"], team["growth"])
    db.execute(
        "insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)",
        (team["org"], team["growth"], team["nia"].id),
    )
    assert team["nia"].id not in roles(db, team["prd"])


def test_org_admins_can_add_a_team_but_editors_cant(team, db):
    assert add_team(team["ed"], team["prd"], team["growth"]).status_code == 403
    assert add_team(team["nia"], team["prd"], team["growth"]).status_code == 404
    assert add_team(team["ada"], team["prd"], team["growth"]).status_code == 200


def test_owner_role_and_bad_teams_are_rejected(team, make_user, make_org, db):
    r = add_team(team["olive"], team["prd"], team["growth"], "owner")
    assert r.status_code == 422 and r.json()["code"] == "validation_error"
    db.execute("delete from team_member where team_id = %s", (team["growth"],))
    db.execute("update team set archived_at = now() where id = %s", (team["growth"],))
    r = add_team(team["olive"], team["prd"], team["growth"])
    assert r.status_code == 422 and r.json()["code"] == "team_not_found"
    other_admin = make_user()
    other_org = make_org(other_admin)
    other_team = db.execute(
        "insert into team (organization_id, name) values (%s, 'Elsewhere') returning id::text",
        (other_org,),
    ).fetchone()[0]
    r = add_team(team["olive"], team["prd"], other_team)
    assert r.status_code == 422 and r.json()["code"] == "team_not_found"
    assert roles(db, team["prd"]) == {
        team["olive"].id: "owner",
        team["ed"].id: "editor",
    }


def test_the_database_function_refuses_owner_too(team, db):
    r = team["olive"].rest(
        "POST",
        "/rpc/add_team_to_prd",
        json={
            "target_prd": team["prd"],
            "target_team": team["growth"],
            "new_role": "owner",
        },
    )
    assert r.status_code == 400 and "invalid_team_role" in r.text
