"""Owning team and priority (A08) against the local stack: suggestion
(in-process, fake model), the decision and manual routing through the API,
and the database rules (who may set the columns, valid teams, no version,
no revision change)."""

import json
from pathlib import Path

import pytest
from supabase import create_client

from ai import classification
from ai.gemini_client import AIError, GeminiResult
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL, add_to_prd, org_prd
from errors import ApiError
from prd_save import save_prd

FIXTURES = Path(__file__).resolve().parents[2].parent / "shared" / "fixtures" / "prd_document" / "valid"
if not FIXTURES.exists():
    FIXTURES = Path("/shared/fixtures/prd_document/valid")
DOC = json.loads((FIXTURES / "full_generated_draft.json").read_text(encoding="utf-8"))["document"]


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


def team(db, org, name, archived=False):
    return db.execute("insert into team (organization_id, name, archived_at) values (%s, %s, %s) returning id::text",
                      (org, name, "now()" if archived else None)).fetchone()[0]


@pytest.fixture
def cast(make_user, make_org, db, service):
    owner, editor, viewer, admin, outsider = (make_user() for _ in range(5))
    org = make_org(admin, owner, editor, viewer)
    other_org = make_org(outsider)
    teams = {"growth": team(db, org, "Growth"), "platform": team(db, org, "Platform"),
             "legacy": team(db, org, "Legacy", archived=True), "foreign": team(db, other_org, "Theirs")}
    prd = org_prd(db, org, owner, "Route me")
    add_to_prd(db, prd, editor, "editor")
    add_to_prd(db, prd, viewer, "viewer")
    save_prd(service, service.auth.get_user(owner.token).user, prd, 1, content_json=DOC)  # revision 2
    return dict(prd=prd, org=org, teams=teams, owner=owner, editor=editor, viewer=viewer, admin=admin,
                outsider=outsider)


def replying(*replies):
    queue = list(replies)

    def call_model(prompt, **kwargs):
        return GeminiResult(data=queue.pop(0), model="fake", prompt_tokens=3, output_tokens=2)
    return call_model


def suggest(user, cast, service, *replies, revision=2):
    return classification.suggest_routing(as_user(user), service, actor_id=user.id, prd_id=cast["prd"],
                                          revision=revision, call_model=replying(*replies))


def routing(db, prd):
    return db.execute("select owning_team_id::text, priority, revision from prd where id = %s", (prd,)).fetchone()


def versions(db, prd):
    return db.execute("select count(*) from prd_version where prd_id = %s", (prd,)).fetchone()[0]


def test_owner_gets_a_suggestion_and_nothing_changes_yet(cast, db, service):
    body = suggest(cast["owner"], cast, service,
                   {"team_id": cast["teams"]["platform"], "priority": "high", "rationale": "Infrastructure work."})
    assert body["suggestion"]["team_id"] == cast["teams"]["platform"] and body["base_revision"] == 2
    assert routing(db, cast["prd"]) == (None, None, 2)
    row = db.execute("select status, requested_by::text, suggested_priority from classification_suggestion "
                     "where id = %s", (body["suggestion"]["id"],)).fetchone()
    assert row == ("pending", cast["owner"].id, "high")
    assert db.execute("select \"trigger\", status from generation_record where id = %s",
                      (body["generation_record_id"],)).fetchone() == ("classification", "success")


def test_the_prompt_lists_only_active_teams_of_this_org(cast, service):
    seen = []

    def call_model(prompt, **kwargs):
        seen.append(prompt)
        return GeminiResult(data={"team_id": cast["teams"]["growth"], "priority": "low", "rationale": "x"},
                            model="fake", prompt_tokens=1, output_tokens=1)
    classification.suggest_routing(as_user(cast["owner"]), service, actor_id=cast["owner"].id, prd_id=cast["prd"],
                                   revision=2, call_model=call_model)
    names = {t["name"] for t in json.loads(seen[0])["teams"]}
    assert names == {"Growth", "Platform"}


def test_an_off_list_team_is_retried_then_fails_without_a_suggestion(cast, db, service):
    foreign = {"team_id": cast["teams"]["foreign"], "priority": "high", "rationale": "x"}
    with pytest.raises(AIError) as info:
        suggest(cast["owner"], cast, service, foreign, foreign)
    assert info.value.code == "ai_invalid_output"
    assert db.execute("select count(*) from classification_suggestion where prd_id = %s", (cast["prd"],)).fetchone() == (0,)
    assert db.execute("select status, error_message from generation_record where prd_id = %s and \"trigger\" = "
                      "'classification'", (cast["prd"],)).fetchone() == ("failed", "ai_invalid_output")


@pytest.mark.parametrize("who", ["editor", "viewer", "outsider"])
def test_only_owners_and_org_admins_may_ask(cast, db, service, who):
    with pytest.raises(ApiError) as info:
        suggest(cast[who], cast, service, {"team_id": cast["teams"]["growth"], "priority": "low", "rationale": "x"})
    assert info.value.status_code in (403, 404)
    assert db.execute("select count(*) from ai_usage_gate where user_id = %s", (cast[who].id,)).fetchone() == (0,)


def test_org_admin_may_ask_too(cast, service):
    body = suggest(cast["admin"], cast, service, {"team_id": cast["teams"]["growth"], "priority": "medium",
                                                  "rationale": "Customer-facing."})
    assert body["suggestion"]["priority"] == "medium"


def test_stale_and_saved_meanwhile(cast, db, service):
    with pytest.raises(ApiError) as info:
        suggest(cast["owner"], cast, service, revision=1)
    assert info.value.code == "stale_revision"
    owner = service.auth.get_user(cast["owner"].token).user

    def save_meanwhile(prompt, **kwargs):
        save_prd(service, owner, cast["prd"], 2, title="Renamed meanwhile")
        return GeminiResult(data={"team_id": cast["teams"]["growth"], "priority": "low", "rationale": "x"},
                            model="fake", prompt_tokens=1, output_tokens=1)
    with pytest.raises(ApiError) as info:
        classification.suggest_routing(as_user(cast["owner"]), service, actor_id=cast["owner"].id,
                                       prd_id=cast["prd"], revision=2, call_model=save_meanwhile)
    assert info.value.code == "stale_revision"
    assert db.execute("select count(*) from classification_suggestion where prd_id = %s", (cast["prd"],)).fetchone() == (0,)


def test_accepting_with_an_adjustment_sets_routing_without_a_version(cast, db, service):
    body = suggest(cast["owner"], cast, service,
                   {"team_id": cast["teams"]["platform"], "priority": "high", "rationale": "Infra."})
    before = versions(db, cast["prd"])
    r = cast["owner"].api("PUT", f"/prds/{cast['prd']}/classification/{body['suggestion']['id']}/decision",
                          json={"decision": "accepted", "priority": "critical"})
    assert r.status_code == 200, r.text
    assert (r.json()["owning_team_id"], r.json()["priority"]) == (cast["teams"]["platform"], "critical")
    assert routing(db, cast["prd"]) == (cast["teams"]["platform"], "critical", 2)  # revision unchanged
    assert versions(db, cast["prd"]) == before
    assert db.execute("select status, final_priority, decided_by::text from classification_suggestion where id = %s",
                      (body["suggestion"]["id"],)).fetchone() == ("accepted", "critical", cast["owner"].id)
    again = cast["owner"].api("PUT", f"/prds/{cast['prd']}/classification/{body['suggestion']['id']}/decision",
                              json={"decision": "rejected"})
    assert (again.status_code, again.json()["code"]) == (409, "suggestion_unavailable")


def test_rejecting_changes_nothing_and_editors_cannot_decide(cast, db, service):
    body = suggest(cast["owner"], cast, service, {"team_id": cast["teams"]["growth"], "priority": "low",
                                                  "rationale": "x"})
    sid = body["suggestion"]["id"]
    r = cast["editor"].api("PUT", f"/prds/{cast['prd']}/classification/{sid}/decision", json={"decision": "accepted"})
    assert r.status_code == 403
    r = cast["owner"].api("PUT", f"/prds/{cast['prd']}/classification/{sid}/decision", json={"decision": "rejected"})
    assert r.status_code == 200 and routing(db, cast["prd"]) == (None, None, 2)
    r = cast["owner"].api("PUT", f"/prds/{cast['prd']}/classification/{sid}/decision",
                          json={"decision": "rejected", "priority": "low"})
    assert r.status_code == 422


def test_manual_routing_by_owner_and_admin_only_with_valid_teams(cast, db):
    prd = cast["prd"]
    r = cast["owner"].api("PUT", f"/prds/{prd}/routing", json={"owning_team_id": cast["teams"]["growth"],
                                                               "priority": "medium"})
    assert r.status_code == 200 and routing(db, prd) == (cast["teams"]["growth"], "medium", 2)
    r = cast["admin"].api("PUT", f"/prds/{prd}/routing", json={"owning_team_id": None, "priority": "low"})
    assert r.status_code == 200 and routing(db, prd) == (None, "low", 2)
    assert cast["editor"].api("PUT", f"/prds/{prd}/routing", json={"owning_team_id": None, "priority": "high"}).status_code == 403
    for bad in ("legacy", "foreign"):
        r = cast["owner"].api("PUT", f"/prds/{prd}/routing", json={"owning_team_id": cast["teams"][bad], "priority": "low"})
        assert (r.status_code, r.json()["code"]) == (422, "invalid_team")
    assert cast["outsider"].api("PUT", f"/prds/{prd}/routing", json={"owning_team_id": None, "priority": "low"}).status_code == 404


def test_the_database_enforces_it_even_through_the_data_api(cast, db):
    prd = cast["prd"]
    r = cast["editor"].rest("PATCH", f"prd?id=eq.{prd}", json={"priority": "critical"})
    assert r.status_code == 403
    # Even an owner can't write the columns directly (S02 grants); PUT /routing
    # goes through set_prd_routing.
    r = cast["owner"].rest("PATCH", f"prd?id=eq.{prd}", json={"owning_team_id": cast["teams"]["growth"]})
    assert r.status_code == 403
    assert routing(db, prd)[:2] == (None, None)
    r = cast["owner"].rest("POST", "classification_suggestion",
                           json={"prd_id": prd, "base_revision": 2, "suggested_priority": "low", "rationale": "x"})
    assert r.status_code in (401, 403)


def test_running_api_checks_access_before_ai(cast):
    # Holds whatever AI settings the running API has: access comes first.
    r = cast["editor"].api("POST", f"/prds/{cast['prd']}/classification", json={"revision": 2})
    assert r.status_code == 403


def classify_with_real_client(cast, service, user):
    """The real request path with the real Gemini client (no model double), so
    the test sets the AI configuration itself instead of relying on the
    running API's. Neither case below can reach the provider."""
    with pytest.raises(AIError) as info:
        classification.suggest_routing(as_user(user), service, actor_id=user.id, prd_id=cast["prd"], revision=2)
    return info.value


def test_with_ai_switched_off_the_owner_gets_ai_disabled(cast, db, service, monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "false")
    error = classify_with_real_client(cast, service, cast["owner"])
    assert (error.status_code, error.code) == (429, "ai_disabled")
    assert db.execute("select count(*) from classification_suggestion where prd_id = %s",
                      (cast["prd"],)).fetchone() == (0,)


def test_with_ai_on_but_no_key_the_owner_gets_ai_unavailable(cast, db, service, monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "0")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)  # fails before any provider call
    error = classify_with_real_client(cast, service, cast["owner"])
    assert (error.status_code, error.code) == (503, "ai_unavailable")
    assert db.execute("select count(*) from classification_suggestion where prd_id = %s",
                      (cast["prd"],)).fetchone() == (0,)
