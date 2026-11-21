"""Feature 10: the progress report. Counts and recent activity over the PRDs
the caller can see, narrowed by owning team, project or owner."""

import pytest

from conftest import add_to_prd, org_prd


@pytest.fixture
def org(make_user, make_org, db):
    """Ada is the admin. Olive owns Alpha (draft, Growth team, high) and Beta (final); Ben owns Gamma (in review)."""
    ada, olive, ben = (make_user() for _ in range(3))
    org_id = make_org(ada, olive, ben)
    for user, name in ((olive, "Olive Owner"), (ben, "Ben Lee")):
        db.execute("update profile set full_name = %s where id = %s", (name, user.id))
    growth = db.execute(
        "insert into team (organization_id, name) values (%s, 'Growth') returning id::text",
        (org_id,),
    ).fetchone()[0]
    alpha, beta, gamma = (
        org_prd(db, org_id, owner, title)
        for owner, title in ((olive, "Alpha"), (olive, "Beta"), (ben, "Gamma"))
    )
    db.execute(
        "update prd set owning_team_id = %s, priority = 'high' where id = %s",
        (growth, alpha),
    )
    db.execute("update prd set status = 'final' where id = %s", (beta,))
    db.execute("update prd set status = 'in_review' where id = %s", (gamma,))
    return dict(
        ada=ada,
        olive=olive,
        ben=ben,
        id=org_id,
        growth=growth,
        alpha=alpha,
        beta=beta,
        gamma=gamma,
    )


def report(user, **params):
    r = user.api("GET", "/reports/progress", params=params)
    assert r.status_code == 200, r.text
    return r.json()


def test_admins_see_the_whole_org(org):
    body = report(org["ada"])
    assert body["total"] == 3
    assert body["by_status"] == {"draft": 1, "final": 1, "in_review": 1}
    assert body["by_work_status"] == {"not_started": 3}
    assert body["by_priority"] == {"high": 1, "none": 2}
    assert body["by_owner"] == [
        {
            "owner": {"id": org["olive"].id, "name": "Olive Owner"},
            "total": 2,
            "by_status": {"draft": 1, "final": 1},
        },
        {
            "owner": {"id": org["ben"].id, "name": "Ben Lee"},
            "total": 1,
            "by_status": {"in_review": 1},
        },
    ]
    assert body["by_team"] == [
        {"team": None, "total": 2, "by_status": {"final": 1, "in_review": 1}},
        {
            "team": {"id": org["growth"], "name": "Growth"},
            "total": 1,
            "by_status": {"draft": 1},
        },
    ]


def test_members_see_only_their_prds(org, db):
    assert report(org["ben"])["total"] == 1
    add_to_prd(db, org["alpha"], org["ben"], "viewer")
    assert report(org["ben"])["by_status"] == {"draft": 1, "in_review": 1}


def test_filters_narrow_the_report(org):
    assert report(org["ada"], team_id=org["growth"])["total"] == 1
    assert report(org["ada"], owner_id=org["olive"].id)["by_status"] == {
        "draft": 1,
        "final": 1,
    }
    assert (
        report(org["ada"], project_id="00000000-0000-0000-0000-000000000000")["total"]
        == 0
    )


def test_recent_activity_spans_prds_newest_first(org, db):
    for prd, at in ((org["alpha"], 30), (org["gamma"], 20)):
        event = db.execute(
            "select record_prd_event(%s, 'comment_added', %s, '{}'::jsonb)",
            (prd, org["olive"].id),
        ).fetchone()[0]
        db.execute(
            "update prd_event set created_at = now() - make_interval(secs => %s) where id = %s",
            (at, event),
        )
    activity = report(org["ada"])["activity"]
    assert [(a["prd_title"], a["type"]) for a in activity] == [
        ("Gamma", "comment_added"),
        ("Alpha", "comment_added"),
    ]
    assert (
        activity[0]["summary"] == "Olive Owner commented"
        and activity[0]["actor"]["name"] == "Olive Owner"
    )
    assert [a["prd_title"] for a in report(org["ben"])["activity"]] == ["Gamma"]
    assert len(report(org["ada"], activity_limit=1)["activity"]) == 1


def test_an_empty_report(make_user):
    body = report(make_user())
    assert body == {
        "total": 0,
        "by_status": {},
        "by_work_status": {},
        "by_priority": {},
        "by_owner": [],
        "by_team": [],
        "activity": [],
    }


def test_bad_parameters_are_422(org):
    assert (
        org["ada"]
        .api("GET", "/reports/progress", params={"activity_limit": 51})
        .status_code
        == 422
    )
    assert (
        org["ada"]
        .api("GET", "/reports/progress", params={"team_id": "nope"})
        .status_code
        == 422
    )
