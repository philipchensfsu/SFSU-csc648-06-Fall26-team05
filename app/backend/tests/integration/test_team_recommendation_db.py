"""AI-recommended teams (feature 08(b)) against the local stack, on feature
02's add_team_to_prd: recommend (a preview) -> an owner picks teams and roles
-> the teams are added in one transaction, rechecked under the PRD lock.
Gemini isn't called: the model is a double."""

import json
import threading

import pytest
from supabase import create_client

from ai import classification, team_recommendation
from ai.gemini_client import AIError, GeminiResult
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL, add_to_prd, org_prd
from errors import ApiError
from prd_save import save_prd
from test_review_suggestion_db import DOC


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "0")


@pytest.fixture
def service():
    return create_client(SUPABASE_URL, SERVICE_KEY)


def as_user(user):
    client = create_client(SUPABASE_URL, ANON_KEY)
    client.postgrest.auth(user.token)
    return client


def verified(service, user):
    return service.auth.get_user(user.token).user


def team(db, org, name, *members, archived=False):
    team_id = db.execute(
        "insert into team (organization_id, name, archived_at) values (%s, %s, %s) returning id::text",
        (org, name, "now()" if archived else None),
    ).fetchone()[0]
    for user in members:
        db.execute(
            "insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)",
            (org, team_id, user.id),
        )
    return team_id


@pytest.fixture
def cast(make_user, make_org, db, service):
    """Ada is the org admin; Olive owns the PRD; Ed edits it; Vi views it.
    Growth: Ed, Gus, Gia (inactive). Platform: Hal, Ivy. Design: Ed only (adds
    nobody). Empty: no one. Legacy: archived (and so empty). Theirs: another org's team."""
    ada, olive, ed, vi, gus, gia, hal, ivy, nia = (make_user() for _ in range(9))
    org = make_org(ada, olive, ed, vi, gus, gia, hal, ivy, nia)
    for user, name in (
        (olive, "Olive Owner"),
        (gus, "Gus Growth"),
        (hal, "Hal Platform"),
    ):
        db.execute("update profile set full_name = %s where id = %s", (name, user.id))
    prd = org_prd(db, org, olive, "Checkout redesign")
    add_to_prd(db, prd, ed, "editor")
    add_to_prd(db, prd, vi, "viewer")
    save_prd(service, verified(service, olive), prd, 1, content_json=DOC)  # revision 2
    teams = {
        "growth": team(db, org, "Growth", ed, gus, gia),
        "platform": team(db, org, "Platform", hal, ivy),
        "design": team(db, org, "Design", ed),
        "empty": team(db, org, "Empty"),
        "legacy": team(db, org, "Legacy", archived=True),
    }
    db.execute(
        "update organization_member set active = false where user_id = %s", (gia.id,)
    )
    other_admin = make_user()
    teams["theirs"] = team(db, make_org(other_admin), "Theirs")
    return dict(
        prd=prd,
        org=org,
        teams=teams,
        ada=ada,
        olive=olive,
        ed=ed,
        vi=vi,
        gus=gus,
        gia=gia,
        hal=hal,
        ivy=ivy,
        nia=nia,
    )


class Model:
    def __init__(self, *replies):
        self.replies, self.prompts = list(replies), []

    def __call__(self, prompt, **kwargs):
        self.prompts.append(prompt)
        reply = self.replies.pop(0) if len(self.replies) > 1 else self.replies[0]
        return GeminiResult(data=reply, model="fake", prompt_tokens=3, output_tokens=4)


def picks(cast, *names):
    return {
        "teams": [
            {"team_id": cast["teams"][n], "reason": f"The PRD needs {n}."}
            for n in names
        ]
    }


def recommend(user, cast, service, model=None, revision=2):
    return team_recommendation.recommend_teams(
        as_user(user),
        service,
        actor_id=user.id,
        prd_id=cast["prd"],
        revision=revision,
        call_model=model or Model(picks(cast, "platform", "growth")),
    )


def decide(user, cast, rec_id, decision="accepted", teams=None):
    body = {"decision": decision}
    if teams is not None:
        body["teams"] = [
            {"team_id": cast["teams"][n], "role": role} for n, role in teams
        ]
    return user.api(
        "PUT",
        f"/prds/{cast['prd']}/members/team-recommendations/{rec_id}/decision",
        json=body,
    )


def roles(db, prd):
    return dict(
        db.execute(
            "select user_id::text, role from prd_member where prd_id = %s", (prd,)
        ).fetchall()
    )


def events(db, prd, event_type="team_added"):
    return db.execute(
        "select payload from prd_event where prd_id = %s and event_type = %s order by created_at",
        (prd, event_type),
    ).fetchall()


def rec_row(db, rec_id):
    return db.execute(
        "select status, selections, decided_by::text from team_recommendation where id = %s",
        (rec_id,),
    ).fetchone()


def records(db, prd):
    return db.execute(
        'select "trigger", status, error_message, prompt_version, prompt_tokens, output_tokens '
        "from generation_record where prd_id = %s order by created_at",
        (prd,),
    ).fetchall()


# --- recommending -----------------------------------------------------------------


def test_owner_gets_up_to_three_teams_and_nothing_changes(cast, db, service):
    before = roles(db, cast["prd"])
    model = Model(picks(cast, "platform", "growth"))
    body = recommend(cast["olive"], cast, service, model)
    rec = body["recommendation"]
    assert body["base_revision"] == 2
    assert [
        (t["name"], t["active_members"], t["new_members"]) for t in rec["teams"]
    ] == [
        ("Platform", 2, 2),
        ("Growth", 2, 1),
    ]  # Gia is inactive; Ed is already on the PRD
    assert (
        rec["teams"][0]["reason"] == "The PRD needs platform."
        and rec["teams"][1]["department"] is None
    )
    assert roles(db, cast["prd"]) == before and events(db, cast["prd"]) == []
    assert rec_row(db, rec["id"]) == ("pending", None, None)
    assert records(db, cast["prd"]) == [
        ("classification", "success", None, team_recommendation.PROMPT_VERSION, 3, 4)
    ]

    # Only active teams of this org that would add someone are offered, and no people's names are sent.
    sent = json.loads(model.prompts[0])
    assert sorted(t["name"] for t in sent["teams"]) == ["Growth", "Platform"]
    for name in ("Gus Growth", "Hal Platform", "Olive Owner"):
        assert name not in model.prompts[0]


def test_org_admins_may_ask_but_editors_viewers_and_outsiders_may_not(
    cast, db, service
):
    assert recommend(cast["ada"], cast, service)["recommendation"]["teams"]
    for who, status in (("ed", 403), ("vi", 403), ("nia", 404)):
        with pytest.raises(ApiError) as info:
            recommend(cast[who], cast, service)
        assert info.value.status_code == status
    assert len(records(db, cast["prd"])) == 1  # only the admin's call


def test_nothing_to_add_or_no_content_stops_before_the_model(
    cast, db, service, make_user
):
    model = Model(picks(cast, "growth"))
    for name in ("gus", "hal", "ivy"):
        add_to_prd(
            db, cast["prd"], cast[name], "viewer"
        )  # every team member is on the PRD now
    with pytest.raises(ApiError) as info:
        recommend(cast["olive"], cast, service, model)
    assert (info.value.status_code, info.value.code) == (422, "no_eligible_teams")
    blank = org_prd(db, cast["org"], cast["olive"], "Empty PRD")
    with pytest.raises(ApiError) as info:
        team_recommendation.recommend_teams(
            as_user(cast["olive"]),
            service,
            actor_id=cast["olive"].id,
            prd_id=blank,
            revision=1,
            call_model=model,
        )
    assert info.value.code == "needs_content"
    assert model.prompts == [] and records(db, cast["prd"]) == []


def test_a_stale_request_is_refused_before_the_model(cast, db, service):
    model = Model(picks(cast, "growth"))
    with pytest.raises(ApiError) as info:
        recommend(cast["olive"], cast, service, model, revision=1)
    assert info.value.code == "stale_revision"
    assert model.prompts == [] and records(db, cast["prd"]) == []


def test_a_save_during_the_call_keeps_the_revision_the_model_saw(cast, db, service):
    class SavingMeanwhile(Model):
        def __call__(self, prompt, **kwargs):
            save_prd(
                service,
                verified(service, cast["ed"]),
                cast["prd"],
                2,
                title="Saved meanwhile",
            )
            return super().__call__(prompt, **kwargs)

    model = SavingMeanwhile(picks(cast, "growth"))
    body = recommend(cast["olive"], cast, service, model)
    # The model saw revision 2's content; the PRD is at 3 now, so the frontend can flag it as older.
    assert (
        "Checkout redesign" in model.prompts[0]
        and "Saved meanwhile" not in model.prompts[0]
    )
    assert body["base_revision"] == 2
    assert db.execute(
        "select revision from prd where id = %s", (cast["prd"],)
    ).fetchone() == (3,)
    assert db.execute(
        "select base_revision from team_recommendation where id = %s",
        (body["recommendation"]["id"],),
    ).fetchone() == (2,)
    assert db.execute(
        "select base_revision from generation_record where id = %s",
        (body["generation_record_id"],),
    ).fetchone() == (2,)
    # Still acceptable (content edits don't invalidate it).
    assert (
        decide(
            cast["olive"],
            cast,
            body["recommendation"]["id"],
            teams=[("growth", "viewer")],
        ).status_code
        == 200
    )


@pytest.mark.parametrize(
    "bad",
    [
        lambda c: picks(c, "design"),  # not offered: adds nobody
        lambda c: picks(c, "legacy"),  # archived
        lambda c: picks(c, "theirs"),  # another org
        lambda c: picks(c, "growth", "growth"),
        lambda c: {"teams": []},
        lambda c: {"teams": [{"team_id": c["teams"]["growth"], "reason": "  "}]},
        lambda c: {
            "teams": [
                {"team_id": c["teams"][n], "reason": "x"}
                for n in ("growth", "platform", "growth", "platform")
            ]
        },
        lambda c: {"teams": "Growth"},
    ],
)
def test_invalid_replies_are_retried_once_then_fail(cast, db, service, bad):
    model = Model(bad(cast))
    with pytest.raises(AIError) as info:
        recommend(cast["olive"], cast, service, model)
    assert info.value.code == "ai_invalid_output" and len(model.prompts) == 2
    assert records(db, cast["prd"]) == [
        (
            "classification",
            "failed",
            "ai_invalid_output",
            team_recommendation.PROMPT_VERSION,
            6,
            8,
        )
    ]
    assert db.execute(
        "select count(*) from team_recommendation where prd_id = %s", (cast["prd"],)
    ).fetchone() == (0,)


def test_a_good_second_try_is_one_record_with_both_tries_counted(cast, db, service):
    model = Model(picks(cast, "theirs"), picks(cast, "growth"))
    body = recommend(cast["olive"], cast, service, model)
    assert [t["name"] for t in body["recommendation"]["teams"]] == ["Growth"] and len(
        model.prompts
    ) == 2
    assert records(db, cast["prd"]) == [
        ("classification", "success", None, team_recommendation.PROMPT_VERSION, 6, 8)
    ]


# --- deciding ------------------------------------------------------------------------


def test_accepting_adds_the_chosen_teams_with_their_roles(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    r = decide(
        cast["olive"],
        cast,
        rec["id"],
        teams=[("growth", "viewer"), ("platform", "editor")],
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "accepted"
    # Editors first, so someone in both teams would get the higher role.
    assert [(x["team_id"], x["role"]) for x in body["results"]] == [
        (cast["teams"]["platform"], "editor"),
        (cast["teams"]["growth"], "viewer"),
    ]
    growth = body["results"][1]
    assert [m["user_id"] for m in growth["added"]] == [cast["gus"].id]
    assert [(m["user_id"], m["role"]) for m in growth["skipped"]] == [
        (cast["ed"].id, "editor")
    ]
    assert roles(db, cast["prd"]) == {
        cast["olive"].id: "owner",
        cast["ed"].id: "editor",
        cast["vi"].id: "viewer",
        cast["gus"].id: "viewer",
        cast["hal"].id: "editor",
        cast["ivy"].id: "editor",
    }
    assert len(body["members"]) == 6
    # Feature 02's events: one team_added per team. Both come from one
    # transaction, so they share created_at; compare without order.
    assert sorted(
        (p["team_name"], p["role"], len(p["user_ids"]))
        for (p,) in events(db, cast["prd"])
    ) == [("Growth", "viewer", 1), ("Platform", "editor", 2)]
    status, selections, decided_by = rec_row(db, rec["id"])
    assert (
        status == "accepted" and decided_by == cast["olive"].id and len(selections) == 2
    )
    # The single owning team and priority (A08) are a separate operation.
    assert db.execute(
        "select owning_team_id, priority from prd where id = %s", (cast["prd"],)
    ).fetchone() == (None, None)


def test_someone_in_two_chosen_teams_gets_the_higher_role_and_nobody_is_downgraded(
    cast, db, service
):
    db.execute(
        "insert into team_member (organization_id, team_id, user_id) values (%s, %s, %s)",
        (cast["org"], cast["teams"]["growth"], cast["hal"].id),
    )
    add_to_prd(db, cast["prd"], cast["ivy"], "editor")
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    r = decide(
        cast["olive"],
        cast,
        rec["id"],
        teams=[("growth", "viewer"), ("platform", "editor")],
    )
    assert r.status_code == 200, r.text
    current = roles(db, cast["prd"])
    assert current[cast["hal"].id] == "editor"  # in both teams
    assert (
        current[cast["ivy"].id] == "editor" and current[cast["ed"].id] == "editor"
    )  # already on it, unchanged


def test_rejecting_adds_nobody_and_each_recommendation_is_decided_once(
    cast, db, service
):
    first = recommend(cast["olive"], cast, service)["recommendation"]
    r = decide(cast["olive"], cast, first["id"], "rejected")
    assert (
        r.status_code == 200
        and r.json()["status"] == "rejected"
        and r.json()["results"] == []
    )
    assert rec_row(db, first["id"])[0] == "rejected" and events(db, cast["prd"]) == []
    for decision, teams in (("rejected", None), ("accepted", [("growth", "viewer")])):
        r = decide(cast["olive"], cast, first["id"], decision, teams)
        assert (r.status_code, r.json()["code"]) == (409, "recommendation_unavailable")

    second = recommend(cast["olive"], cast, service)["recommendation"]
    assert (
        decide(
            cast["olive"], cast, second["id"], teams=[("growth", "viewer")]
        ).status_code
        == 200
    )
    r = decide(cast["olive"], cast, second["id"], teams=[("platform", "viewer")])
    assert (r.status_code, r.json()["code"]) == (409, "recommendation_unavailable")
    assert cast["hal"].id not in roles(db, cast["prd"])


def test_permissions_are_checked_again_when_deciding(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    for who, status in (("ed", 403), ("vi", 403), ("nia", 404)):
        assert (
            decide(cast[who], cast, rec["id"], teams=[("growth", "viewer")]).status_code
            == status
        )
    # The owner who asked is demoted before deciding: refused, nothing added.
    db.execute(
        "update prd_member set role = 'owner' where prd_id = %s and user_id = %s",
        (cast["prd"], cast["ed"].id),
    )
    db.execute(
        "update prd_member set role = 'editor' where prd_id = %s and user_id = %s",
        (cast["prd"], cast["olive"].id),
    )
    assert (
        decide(cast["olive"], cast, rec["id"], teams=[("growth", "viewer")]).status_code
        == 403
    )
    assert rec_row(db, rec["id"])[0] == "pending" and cast["gus"].id not in roles(
        db, cast["prd"]
    )
    # Any current owner or org admin may decide it.
    assert (
        decide(cast["ada"], cast, rec["id"], teams=[("growth", "viewer")]).status_code
        == 200
    )
    assert rec_row(db, rec["id"])[2] == cast["ada"].id


def test_org_membership_is_checked_again_when_deciding(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    # The owner who asked has left the organization: her PRD role no longer counts, so she can't even see it.
    db.execute(
        "update organization_member set active = false where user_id = %s",
        (cast["olive"].id,),
    )
    assert (
        decide(cast["olive"], cast, rec["id"], teams=[("growth", "viewer")]).status_code
        == 404
    )
    # An org admin who is no longer an admin (and isn't on the PRD) can't either.
    db.execute(
        "update organization_member set access_role = 'member' where user_id = %s",
        (cast["ada"].id,),
    )
    assert (
        decide(cast["ada"], cast, rec["id"], teams=[("growth", "viewer")]).status_code
        == 404
    )
    assert rec_row(db, rec["id"])[0] == "pending" and cast["gus"].id not in roles(
        db, cast["prd"]
    )


def test_people_who_left_the_org_since_the_recommendation_are_not_added(
    cast, db, service
):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    db.execute(
        "update organization_member set active = false where user_id = %s",
        (cast["hal"].id,),
    )
    r = decide(cast["olive"], cast, rec["id"], teams=[("platform", "editor")])
    assert r.status_code == 200
    assert [p["user_id"] for p in r.json()["results"][0]["added"]] == [cast["ivy"].id]
    assert cast["hal"].id not in roles(db, cast["prd"])


def test_team_eligibility_is_checked_again_and_a_failure_adds_no_one(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    db.execute(
        "delete from team_member where team_id = %s", (cast["teams"]["platform"],)
    )
    db.execute(
        "update team set archived_at = now() where id = %s",
        (cast["teams"]["platform"],),
    )
    r = decide(
        cast["olive"],
        cast,
        rec["id"],
        teams=[("growth", "viewer"), ("platform", "editor")],
    )
    assert (r.status_code, r.json()["code"]) == (422, "team_not_found")
    # All or nothing: Growth wasn't added either, and the recommendation is still open.
    assert (
        cast["gus"].id not in roles(db, cast["prd"]) and events(db, cast["prd"]) == []
    )
    assert rec_row(db, rec["id"])[0] == "pending"
    assert (
        decide(cast["olive"], cast, rec["id"], teams=[("growth", "viewer")]).status_code
        == 200
    )


def test_only_recommended_teams_and_valid_selections_are_accepted(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    cases = [
        ([("design", "viewer")], 422, "team_not_recommended"),
        ([("growth", "viewer"), ("growth", "editor")], 422, "validation_error"),
        ([("growth", "owner")], 422, "validation_error"),
    ]
    for teams, status, code in cases:
        r = decide(cast["olive"], cast, rec["id"], teams=teams)
        assert (r.status_code, r.json()["code"]) == (status, code), teams
    assert (
        decide(cast["olive"], cast, rec["id"], "accepted").status_code == 422
    )  # accept needs teams
    assert (
        decide(
            cast["olive"], cast, rec["id"], "rejected", [("growth", "viewer")]
        ).status_code
        == 422
    )
    r = cast["olive"].api(
        "PUT",
        f"/prds/{cast['prd']}/members/team-recommendations/{rec['id']}/decision",
        json={"decision": "accepted", "teams": []},
    )
    assert r.status_code == 422
    assert rec_row(db, rec["id"])[0] == "pending" and events(db, cast["prd"]) == []


def test_a_recommendation_from_another_prd_is_unavailable(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    other = org_prd(db, cast["org"], cast["olive"], "Other PRD")
    r = cast["olive"].api(
        "PUT",
        f"/prds/{other}/members/team-recommendations/{rec['id']}/decision",
        json={
            "decision": "accepted",
            "teams": [{"team_id": cast["teams"]["growth"], "role": "viewer"}],
        },
    )
    assert (r.status_code, r.json()["code"]) == (409, "recommendation_unavailable")


def test_a_content_save_after_the_recommendation_doesnt_block_accepting(
    cast, db, service
):
    # Membership isn't content: the recommendation stays usable after an edit.
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    save_prd(service, verified(service, cast["ed"]), cast["prd"], 2, title="Edited")
    assert (
        decide(cast["olive"], cast, rec["id"], teams=[("growth", "viewer")]).status_code
        == 200
    )


def test_two_concurrent_acceptances_add_the_team_once(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    outcomes = []
    barrier = threading.Barrier(2)

    def run(user):
        barrier.wait()
        outcomes.append(
            decide(user, cast, rec["id"], teams=[("platform", "editor")]).status_code
        )

    threads = [threading.Thread(target=run, args=(cast[w],)) for w in ("olive", "ada")]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join(30)
    assert sorted(outcomes) == [200, 409]
    assert len(events(db, cast["prd"])) == 1
    assert db.execute(
        "select count(*) from notification n join prd_event e on e.id = n.event_id "
        "where n.prd_id = %s and e.event_type = 'team_added'",
        (cast["prd"],),
    ).fetchone() == (2,)  # Hal and Ivy, once each


# --- database rules and the rest -----------------------------------------------------


def test_the_database_functions_hold_without_the_api(cast, db, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    r = cast["ed"].rest(
        "POST",
        "/rpc/decide_team_recommendation",
        json={
            "target_prd": cast["prd"],
            "target_recommendation": rec["id"],
            "decision": "accepted",
            "selections": [{"team_id": cast["teams"]["growth"], "role": "viewer"}],
        },
    )
    assert r.status_code == 400 and "prd_manage_forbidden" in r.text
    r = cast["olive"].rest(
        "POST",
        "/rpc/ai_record_team_recommendation",
        json={
            "p_actor": cast["olive"].id,
            "p_prd_id": cast["prd"],
            "p_base_revision": 2,
            "p_model": "x",
            "p_prompt_version": "x",
            "p_status": "success",
            "p_error_code": None,
            "p_prompt_tokens": 1,
            "p_output_tokens": 1,
            "p_teams": [{"team_id": cast["teams"]["growth"], "reason": "x"}],
        },
    )
    assert r.status_code in (401, 403, 404)  # browsers can't fake a recommendation
    r = cast["ed"].rest(
        "POST", "/rpc/prd_team_candidates", json={"target_prd": cast["prd"]}
    )
    assert r.status_code == 400 and "prd_manage_forbidden" in r.text
    with pytest.raises(ApiError) as info:  # the record function checks teams itself
        team_recommendation._record(
            service,
            cast["olive"].id,
            cast["prd"],
            2,
            type("Calls", (), {"model": "x", "prompt_tokens": 0, "output_tokens": 0})(),
            status="success",
            teams=[{"team_id": cast["teams"]["theirs"], "reason": "x"}],
        )
    assert info.value.code == "validation_error"
    with pytest.raises(
        ApiError
    ) as info:  # ...and a base revision the PRD hasn't reached
        team_recommendation._record(
            service,
            cast["olive"].id,
            cast["prd"],
            3,
            type("Calls", (), {"model": "x", "prompt_tokens": 0, "output_tokens": 0})(),
            status="success",
            teams=[{"team_id": cast["teams"]["growth"], "reason": "x"}],
        )
    assert info.value.code == "validation_error"
    assert rec_row(db, rec["id"])[0] == "pending"


def test_people_who_can_see_the_prd_can_read_its_recommendations(cast, service):
    rec = recommend(cast["olive"], cast, service)["recommendation"]
    seen = as_user(cast["vi"]).table("team_recommendation").select("id").execute().data
    assert [row["id"] for row in seen] == [rec["id"]]
    assert (
        as_user(cast["nia"]).table("team_recommendation").select("id").execute().data
        == []
    )


def test_classification_is_still_its_own_operation(cast, db, service):
    def model(prompt, **kwargs):
        return GeminiResult(
            data={
                "team_id": cast["teams"]["design"],
                "priority": "high",
                "rationale": "UI work.",
            },
            model="fake",
            prompt_tokens=1,
            output_tokens=1,
        )

    body = classification.suggest_routing(
        as_user(cast["olive"]),
        service,
        actor_id=cast["olive"].id,
        prd_id=cast["prd"],
        revision=2,
        call_model=model,
    )
    assert (
        body["suggestion"]["team_id"] == cast["teams"]["design"]
    )  # A08 may still pick any active team
    assert roles(db, cast["prd"])[cast["ed"].id] == "editor" and cast[
        "gus"
    ].id not in roles(db, cast["prd"])


def test_the_routes_are_wired_and_ai_off_uses_no_quota(cast, db, monkeypatch):
    r = cast["ed"].api(
        "POST",
        f"/prds/{cast['prd']}/members/team-recommendations",
        json={"revision": 2},
    )
    assert (r.status_code, r.json()["code"]) == (403, "forbidden")
    r = cast["olive"].api(
        "POST", f"/prds/{cast['prd']}/members/team-recommendations", json={}
    )
    assert r.status_code == 422
    monkeypatch.setenv("AI_ENABLED", "false")
    with pytest.raises(AIError) as info:
        team_recommendation.recommend_teams(
            as_user(cast["olive"]),
            create_client(SUPABASE_URL, SERVICE_KEY),
            actor_id=cast["olive"].id,
            prd_id=cast["prd"],
            revision=2,
        )
    assert (info.value.status_code, info.value.code) == (429, "ai_disabled")
    assert records(db, cast["prd"]) == []
