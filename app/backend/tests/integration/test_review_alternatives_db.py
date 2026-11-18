"""Alternative AI proposals from review feedback (feature 09) against the
local stack: comments -> two staged options from one model call -> one
accepted through the save core, the other retired, with real RLS, row locks
and E09. Gemini isn't called: the model is a double."""

import copy
import json
import threading
import time
from types import SimpleNamespace

import psycopg
import pytest
from supabase import create_client

from ai import chat, chat_revision, records, review_alternatives
from ai.acceptance import AcceptanceError
from ai.gemini_client import AIError, GeminiResult
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL, add_to_prd, connect_db, org_prd
from errors import ApiError
from prd_save import SaveError, save_prd
from test_review_suggestion_db import DOC, INJECTION, section

GOALS_SMALL = section("goals", "Cut drafting time by half within a semester.")
GOALS_BROAD = section("goals", "Cut drafting time by half and review time by a third within a year.")
RISKS = section("risks", "Budget approval may slip a quarter; plan a smaller first release.")
SCOPE = section("non_goals", "Phase one covers drafting only; reviews move to phase two.")
NEW_RISKS = section("risks", "Low adoption in the first month.")


def option(title, *sections, explanation="Addresses the budget and goal comments.", tradeoffs=("Smaller change.",)):
    return {"title": title, "explanation": explanation, "tradeoffs": list(tradeoffs), "sections": list(sections)}


REPLY = {"options": [option("Tighten the goal", GOALS_SMALL, RISKS, tradeoffs=["Quick to review.", "Less ambitious."]),
                     option("Phase the release", GOALS_BROAD, SCOPE, RISKS, tradeoffs=["Bigger change."])]}


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


class Model:
    def __init__(self, reply=None):
        self.reply, self.prompts, self.kwargs = reply or REPLY, [], []

    def __call__(self, prompt, **kwargs):
        self.prompts.append(prompt)
        self.kwargs.append(kwargs)
        return GeminiResult(data=self.reply, model="fake", prompt_tokens=11, output_tokens=13)


class Guardrails:
    def __init__(self, verdict="allow"):
        self.verdict, self.asked = verdict, []

    def check_scope(self, prd, session_messages, instruction, *, call_model, timeout_seconds):
        self.asked.append(instruction)
        call_model("scope?", system_instruction="", response_schema={}, max_output_tokens=10)  # counts its usage
        return self.verdict


def modules(guardrails=None):
    prompts = SimpleNamespace(FIXED_REFUSAL="Only this PRD.", FIXED_CLARIFICATION="How does it relate?",
                              CHAT_PROMPT_VERSION="v", CHAT_SYSTEM_INSTRUCTION="", CHAT_RESPONSE_SCHEMA={},
                              build_chat_prompt=lambda *a: "")
    return chat.ChatModules(guardrails or Guardrails(), prompts)


@pytest.fixture
def cast(make_user, make_org, db, service):
    """Owner, editor, viewer and a reviewer (Finance) on a saved v2 PRD, with
    two comments from the reviewer on the current version (revision 2)."""
    owner, editor, viewer, finance = make_user(), make_user(), make_user(), make_user()
    prd = org_prd(db, make_org(owner, editor, viewer, finance), owner, "Alternatives")
    add_to_prd(db, prd, editor, "editor")
    add_to_prd(db, prd, viewer, "viewer")
    add_to_prd(db, prd, finance, "viewer")
    save_prd(service, verified(service, owner), prd, 1, content_json=DOC)
    version = db.execute("select current_version_id::text from prd where id = %s", (prd,)).fetchone()[0]
    comments = []
    for section_type, body in (("risks", "There's no budget risk. Approval could slip a quarter."),
                               ("goals", f"The goal isn't measurable. {INJECTION}")):
        r = finance.api("POST", f"/prds/{prd}/comments",
                        json={"version_id": version, "section_type": section_type, "body": body})
        assert r.status_code == 201, r.text
        comments.append(r.json()["id"])
    return dict(prd=prd, owner=owner, editor=editor, viewer=viewer, finance=finance, comments=comments)


def alternatives(user, cast, service, model=None, revision=2, instruction=None, guardrails=None, feedback_ids=None):
    return review_alternatives.propose_alternatives(
        as_user(user), service, actor_id=user.id, prd_id=cast["prd"], revision=revision,
        feedback_ids=cast["comments"] if feedback_ids is None else feedback_ids, instruction=instruction,
        call_model=model or Model(), modules=modules(guardrails))


def accept(service, user, cast, body, number, revision=2, content=None):
    content = content or body["options"][number - 1]["proposal"]["content_json"]
    return save_prd(service, verified(service, user), cast["prd"], revision, content_json=content,
                    origin="ai_generated", generation_record_id=body["generation_record_id"], option=number)


def options(db, record_id):
    return db.execute("select option_no, kind, status from ai_proposal where generation_record_id = %s "
                      "order by option_no nulls first", (record_id,)).fetchall()


def records_of(db, prd):
    return db.execute("select status, error_message, prompt_version, prompt_tokens, output_tokens "
                      "from generation_record where prd_id = %s order by created_at", (prd,)).fetchall()


def state(db, prd):
    return db.execute("select content_json, revision, status from prd where id = %s", (prd,)).fetchone()


def version_count(db, prd):
    return db.execute("select count(*) from prd_version where prd_id = %s", (prd,)).fetchone()[0]


# --- staging -----------------------------------------------------------------------


def test_one_call_stages_two_options_and_saves_nothing(cast, db, service):
    before = state(db, cast["prd"])
    model = Model()
    body = alternatives(cast["owner"], cast, service, model)
    assert body["base_revision"] == 2
    assert [(o["option"], o["title"]) for o in body["options"]] == [(1, "Tighten the goal"), (2, "Phase the release")]
    assert body["options"][0]["tradeoffs"] == ["Quick to review.", "Less ambitious."]
    assert body["options"][0]["proposal"]["section_types"] == ["goals", "risks"]
    assert body["options"][1]["proposal"]["section_types"] == ["goals", "non_goals", "risks"]
    for o in body["options"]:  # a complete document per option, every other section as saved
        merged = {s["attrs"]["type"]: s for s in o["proposal"]["content_json"]["content"]}
        for saved in DOC["content"]:
            if saved["attrs"]["type"] not in o["proposal"]["section_types"]:
                assert merged[saved["attrs"]["type"]] == saved
    assert state(db, cast["prd"]) == before
    # One provider call: one record with its usage, two options without records of their own.
    assert len(model.prompts) == 1
    assert records_of(db, cast["prd"]) == [("success", None, review_alternatives.PROMPT_VERSION, 11, 13)]
    assert options(db, body["generation_record_id"]) == [(1, "review_suggestion", "pending"),
                                                         (2, "review_suggestion", "pending")]
    stored = db.execute("select content from ai_proposal where generation_record_id = %s and option_no = 2",
                        (body["generation_record_id"],)).fetchone()[0]
    assert stored["feedback_ids"] == cast["comments"] and stored["title"] == "Phase the release"
    # Comments reach the model as data, without names.
    sent = json.loads(model.prompts[0])
    assert INJECTION in sent["review_feedback"][1]["comment"] and "author" not in model.prompts[0]
    assert model.kwargs[0]["max_output_tokens"] == review_alternatives.MAX_OUTPUT_TOKENS


def test_scope_check_and_main_call_share_one_record(cast, db, service):
    guardrails = Guardrails("allow")
    alternatives(cast["owner"], cast, service, instruction="Keep it short.", guardrails=guardrails)
    assert guardrails.asked == ["Keep it short."]
    # Two provider calls inside one admission, recorded once with the summed usage.
    assert records_of(db, cast["prd"]) == [("success", None, review_alternatives.PROMPT_VERSION, 22, 26)]


@pytest.mark.parametrize("verdict, code", [("block", "out_of_scope"), ("unclear", "clarification_needed")])
def test_an_out_of_scope_instruction_stages_nothing(cast, db, service, verdict, code):
    model = Model()
    with pytest.raises(ApiError) as info:
        alternatives(cast["owner"], cast, service, model, instruction="Write a poem.", guardrails=Guardrails(verdict))
    assert (info.value.status_code, info.value.code) == (422, code)
    assert model.prompts == ["scope?"]  # only the scope check ran; no options were asked for
    assert records_of(db, cast["prd"]) == [("failed", code, review_alternatives.PROMPT_VERSION, 11, 13)]
    assert db.execute("select count(*) from ai_proposal where prd_id = %s", (cast["prd"],)).fetchone() == (0,)


# --- authorization -----------------------------------------------------------------


def test_only_owners_can_ask(cast, db, service):
    for who in ("editor", "viewer", "finance"):
        with pytest.raises(ApiError) as info:
            alternatives(cast[who], cast, service)
        assert (info.value.status_code, info.value.code) == (403, "owner_required")
    assert records_of(db, cast["prd"]) == []


def test_the_database_stages_options_only_for_owners(cast, db, service):
    # The trusted writer checks again, whatever the Python layer did.
    with pytest.raises(records.RecordError) as info:
        records.stage_alternatives(service, actor_id=cast["editor"].id, prd_id=cast["prd"], base_revision=2,
                                   model="fake", prompt_version="v", prompt_tokens=1, output_tokens=1,
                                   candidates=[{"a": 1}, {"b": 2}])
    assert (info.value.status_code, info.value.code) == (403, "owner_required")
    with pytest.raises(records.RecordError) as info:
        records.stage_alternatives(service, actor_id=cast["owner"].id, prd_id=cast["prd"], base_revision=2,
                                   model="fake", prompt_version="v", prompt_tokens=1, output_tokens=1,
                                   candidates=[{"a": 1}])  # one option isn't a set
    assert info.value.code == "validation_error"
    assert records_of(db, cast["prd"]) == []


def test_an_owner_demoted_during_the_call_gets_nothing_staged(cast, db, service):
    db.execute("update prd_member set role = 'owner' where prd_id = %s and user_id = %s",
               (cast["prd"], cast["editor"].id))

    class Demoting(Model):
        def __call__(self, prompt, **kwargs):
            db.execute("update prd_member set role = 'editor' where prd_id = %s and user_id = %s",
                       (cast["prd"], cast["owner"].id))
            return super().__call__(prompt, **kwargs)

    with pytest.raises(ApiError) as info:
        alternatives(cast["owner"], cast, service, Demoting())
    assert info.value.code == "owner_required"
    assert [r[:2] for r in records_of(db, cast["prd"])] == [("failed", "owner_required")]  # the call is counted
    assert db.execute("select count(*) from ai_proposal where prd_id = %s", (cast["prd"],)).fetchone() == (0,)


def test_someone_else_cant_accept_the_owners_option(cast, db, service):
    db.execute("update prd_member set role = 'owner' where prd_id = %s and user_id = %s",
               (cast["prd"], cast["editor"].id))
    body = alternatives(cast["owner"], cast, service)
    with pytest.raises(AcceptanceError) as info:
        accept(service, cast["editor"], cast, body, 1)
    assert info.value.code == "proposal_unavailable"
    assert options(db, body["generation_record_id"])[0][2] == "pending"


def test_feedback_must_be_current_comments_on_this_prd(cast, db, service):
    with pytest.raises(ApiError) as info:
        alternatives(cast["owner"], cast, service, feedback_ids=["33333333-3333-4333-8333-333333333333"])
    assert info.value.code == "invalid_feedback"
    save_prd(service, verified(service, cast["owner"]), cast["prd"], 2, title="Moved on")
    with pytest.raises(ApiError) as info:
        alternatives(cast["owner"], cast, service, revision=3)
    assert info.value.code == "feedback_not_current"
    assert records_of(db, cast["prd"]) == []


# --- stale revisions ---------------------------------------------------------------


def test_stale_requests_and_stale_options_are_refused(cast, db, service):
    with pytest.raises(ApiError) as info:
        alternatives(cast["owner"], cast, service, revision=1)
    assert info.value.code == "stale_revision"

    body = alternatives(cast["owner"], cast, service)
    save_prd(service, verified(service, cast["editor"]), cast["prd"], 2, title="Saved meanwhile")
    for number in (1, 2):
        with pytest.raises(SaveError) as info:
            accept(service, cast["owner"], cast, body, number)
        assert info.value.code == "stale_revision"
    assert [o[2] for o in options(db, body["generation_record_id"])] == ["pending", "pending"]


def test_a_save_while_the_model_ran_records_the_call_and_stages_nothing(cast, db, service):
    class SavingMeanwhile(Model):
        def __call__(self, prompt, **kwargs):
            save_prd(service, verified(service, cast["editor"]), cast["prd"], 2, title="Saved meanwhile")
            return super().__call__(prompt, **kwargs)

    with pytest.raises(ApiError) as info:
        alternatives(cast["owner"], cast, service, SavingMeanwhile())
    assert info.value.code == "stale_revision"
    assert records_of(db, cast["prd"]) == [("success", None, review_alternatives.PROMPT_VERSION, 11, 13)]
    assert db.execute("select count(*) from ai_proposal where prd_id = %s", (cast["prd"],)).fetchone() == (0,)


# --- malformed candidates ----------------------------------------------------------


def marked(section_node):
    node = copy.deepcopy(section_node)
    node["content"][0]["content"][0]["marks"] = [{"type": "ai_generated", "attrs": {"generation_record_id": "x"}}]
    return node


SAVED_GOALS = next(s for s in DOC["content"] if s["attrs"]["type"] == "goals")


@pytest.mark.parametrize("reply", [
    {"options": [option("Only one", GOALS_SMALL)]},
    {"options": [option("A", GOALS_SMALL), option("B", RISKS), option("C", SCOPE)]},
    {"options": [option("Same", GOALS_SMALL), option("Same again", GOALS_SMALL)]},  # identical documents
    {"options": [option("No change", SAVED_GOALS), option("B", RISKS)]},  # an option that changes nothing
    {"options": [option("", GOALS_SMALL), option("B", RISKS)]},
    {"options": [option("A" * 81, GOALS_SMALL), option("B", RISKS)]},
    {"options": [option("A", GOALS_SMALL, tradeoffs=[]), option("B", RISKS)]},
    {"options": [option("A", GOALS_SMALL, tradeoffs=["x"] * 5), option("B", RISKS)]},
    {"options": [option("A", GOALS_SMALL, explanation=""), option("B", RISKS)]},
    {"options": [option("A", marked(GOALS_SMALL)), option("B", RISKS)]},  # obeying the injected comment
    {"options": [option("A", GOALS_SMALL, GOALS_BROAD), option("B", RISKS)]},  # one section twice
    {"options": [option("A", section("approval", "Approved.")), option("B", RISKS)]},
    {"options": "two"},
    ["not", "an", "object"],
])
def test_malformed_options_fail_the_whole_reply(cast, db, service, reply):
    with pytest.raises(AIError) as info:
        alternatives(cast["owner"], cast, service, Model(reply))
    assert info.value.code == "ai_invalid_output"
    assert [r[:3] for r in records_of(db, cast["prd"])] == [("failed", "ai_invalid_output",
                                                             review_alternatives.PROMPT_VERSION)]
    assert db.execute("select count(*) from ai_proposal where prd_id = %s", (cast["prd"],)).fetchone() == (0,)


# --- acceptance and sibling invalidation -------------------------------------------


def test_accepting_one_option_supersedes_the_other(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    record_id = body["generation_record_id"]
    saved = accept(service, cast["owner"], cast, body, 2)
    assert saved["revision"] == 3
    by_type = {s["attrs"]["type"]: json.dumps(s) for s in saved["content_json"]["content"]}
    assert all(record_id in by_type[t] for t in ("goals", "non_goals", "risks"))  # option 2's sections, marked
    assert record_id not in by_type["problem"]
    assert options(db, record_id) == [(1, "review_suggestion", "superseded"), (2, "review_suggestion", "accepted")]
    version = db.execute("select origin, generation_record_id::text, changed_sections from prd_version "
                         "where prd_id = %s order by version_no desc limit 1", (cast["prd"],)).fetchone()
    assert version == ("ai_generated", record_id, ["goals", "non_goals", "risks"])

    # The sibling is gone, at the old revision and at the new one.
    for revision in (2, 3):
        with pytest.raises(AcceptanceError) as info:
            accept(service, cast["owner"], cast, body, 1, revision=revision)
        assert info.value.code == "proposal_unavailable"
    assert state(db, cast["prd"])[1] == 3


def test_a_lost_response_retry_returns_the_save_only_for_the_accepted_option(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    first = accept(service, cast["owner"], cast, body, 1)
    again = accept(service, cast["owner"], cast, body, 1)  # the same request, sent again
    assert again["revision"] == first["revision"] == 3 and again["content_json"] == first["content_json"]
    assert version_count(db, cast["prd"]) == 2
    with pytest.raises(AcceptanceError) as info:  # never a false success for the other option
        accept(service, cast["owner"], cast, body, 2)
    assert info.value.code == "proposal_unavailable"


def test_the_database_guard_holds_without_the_python_checks(cast, db, service):
    # A no-op acceptance keeps the revision, so only the sibling rule stops a
    # second option; call the take directly, as save_prd does.
    body = alternatives(cast["owner"], cast, service)
    owner, record_id = cast["owner"].id, body["generation_record_id"]
    with connect_db() as conn:
        conn.execute("select ai_take_proposal(%s, %s, %s, 1::smallint, 2)", (owner, cast["prd"], record_id))
        with pytest.raises(psycopg.Error) as info:
            conn.execute("select ai_take_proposal(%s, %s, %s, 2::smallint, 2)", (owner, cast["prd"], record_id))
        assert info.value.sqlstate == "NTPRP"
        conn.rollback()
    with connect_db() as conn:  # naming no option on a set of options finds nothing
        with pytest.raises(psycopg.Error) as info:
            conn.execute("select ai_take_proposal(%s, %s, %s, null, 2)", (owner, cast["prd"], record_id))
        assert info.value.sqlstate == "NTPRP"


def test_a_no_op_acceptance_still_retires_the_sibling(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    saved = save_prd(service, verified(service, cast["owner"]), cast["prd"], 2, content_json=DOC,
                     origin="ai_generated", generation_record_id=body["generation_record_id"], option=1)
    assert saved["revision"] == 2  # nothing changed, so no new revision
    assert [o[2] for o in options(db, body["generation_record_id"])] == ["accepted", "superseded"]
    with pytest.raises(AcceptanceError) as info:
        accept(service, cast["owner"], cast, body, 2)
    assert info.value.code == "proposal_unavailable"


def test_options_must_be_named(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    owner = verified(service, cast["owner"])
    with pytest.raises(ApiError) as info:  # a set of options needs one picked
        save_prd(service, owner, cast["prd"], 2, content_json=body["options"][0]["proposal"]["content_json"],
                 origin="ai_generated", generation_record_id=body["generation_record_id"])
    assert (info.value.status_code, info.value.code) == (422, "option_required")
    with pytest.raises(AcceptanceError) as info:  # there's no third option
        accept(service, cast["owner"], cast, body, 3, content=body["options"][0]["proposal"]["content_json"])
    assert info.value.code == "proposal_unavailable"
    with pytest.raises(SaveError) as info:
        save_prd(service, owner, cast["prd"], 2, title="x", option=1)
    assert info.value.code == "validation_error"
    assert [o[2] for o in options(db, body["generation_record_id"])] == ["pending", "pending"]


def test_accepting_an_option_cant_change_other_sections(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    sneaky = copy.deepcopy(body["options"][0]["proposal"]["content_json"])
    scope = next(s for s in sneaky["content"] if s["attrs"]["type"] == "non_goals")
    scope["content"] = SCOPE["content"]  # option 2's change slipped into option 1
    with pytest.raises(AcceptanceError) as info:
        accept(service, cast["owner"], cast, body, 1, content=sneaky)
    assert info.value.code == "proposal_scope"
    assert [o[2] for o in options(db, body["generation_record_id"])] == ["pending", "pending"]


def test_concurrent_acceptance_of_both_options_saves_exactly_one(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    outcomes = {}
    with connect_db() as holder:  # hold the PRD lock so both saves queue on it
        holder.execute("select 1 from prd where id = %s for update", (cast["prd"],))

        def run(number):
            try:
                outcomes[number] = accept(service, cast["owner"], cast, body, number)["revision"]
            except (SaveError, AcceptanceError) as exc:
                outcomes[number] = (exc.status_code, exc.code)

        threads = [threading.Thread(target=run, args=(n,)) for n in (1, 2)]
        for thread in threads:
            thread.start()
        time.sleep(1.0)
        holder.rollback()  # release: they now race for the lock
        for thread in threads:
            thread.join(30)
    won = [n for n, result in outcomes.items() if result == 3]
    assert len(won) == 1, outcomes
    lost = outcomes[3 - won[0]]
    assert lost in ((409, "stale_revision"), (409, "proposal_unavailable"))
    statuses = dict((o[0], o[2]) for o in options(db, body["generation_record_id"]))
    assert statuses == {won[0]: "accepted", 3 - won[0]: "superseded"}
    assert version_count(db, cast["prd"]) == 2 and state(db, cast["prd"])[1] == 3


# --- request adjustments -----------------------------------------------------------


def adjust(user, cast, service, body, number, revision=2):
    def risks_model(prompt, **kwargs):
        return GeminiResult(data={"sections": [NEW_RISKS], "explanation": "Swapped the risk."}, model="fake",
                            prompt_tokens=5, output_tokens=7)
    return chat_revision.propose_revision(
        as_user(user), service, actor_id=user.id, prd_id=cast["prd"], revision=revision,
        instruction="Use the adoption risk instead.", session_messages=[],
        previous_generation_record_id=body["generation_record_id"], previous_option=number,
        modules=modules(), call_model=risks_model)


def test_adjusting_an_option_retires_the_whole_set(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    adjusted = adjust(cast["owner"], cast, service, body, 2)
    # The adjustment builds on option 2 and stays a review suggestion with its comments.
    assert adjusted["proposal"]["section_types"] == ["goals", "non_goals", "risks"]
    assert options(db, body["generation_record_id"]) == [(1, "review_suggestion", "superseded"),
                                                         (2, "review_suggestion", "rejected")]
    assert options(db, adjusted["generation_record_id"]) == [(None, "review_suggestion", "pending")]
    stored = db.execute("select content from ai_proposal where generation_record_id = %s",
                        (adjusted["generation_record_id"],)).fetchone()[0]
    assert stored["feedback_ids"] == cast["comments"]

    for number in (1, 2):  # no option of the set can be accepted afterwards
        with pytest.raises(AcceptanceError) as info:
            accept(service, cast["owner"], cast, body, number)
        assert info.value.code == "proposal_unavailable"
    saved = save_prd(service, verified(service, cast["owner"]), cast["prd"], 2,
                     content_json=adjusted["proposal"]["content_json"], origin="ai_generated",
                     generation_record_id=adjusted["generation_record_id"])
    risks = next(s for s in saved["content_json"]["content"] if s["attrs"]["type"] == "risks")
    assert "Low adoption" in json.dumps(risks) and adjusted["generation_record_id"] in json.dumps(risks)


def test_the_database_rechecks_access_before_retiring_a_set(cast, db, service):
    # Whatever the Python layer did: a requester who lost ownership or access retires nothing.
    body = alternatives(cast["owner"], cast, service)
    retire = dict(actor_id=cast["owner"].id, prd_id=cast["prd"], generation_record_id=body["generation_record_id"],
                  option=1)
    db.execute("update prd_member set role = 'owner' where prd_id = %s and user_id = %s",
               (cast["prd"], cast["editor"].id))
    for role, expected in (("editor", (403, "owner_required")), ("viewer", (403, "forbidden"))):
        db.execute("update prd_member set role = %s where prd_id = %s and user_id = %s",
                   (role, cast["prd"], cast["owner"].id))
        with pytest.raises(records.RecordError) as info:
            records.retire_alternatives(service, **retire)
        assert (info.value.status_code, info.value.code) == expected
    db.execute("delete from prd_member where prd_id = %s and user_id = %s", (cast["prd"], cast["owner"].id))
    with pytest.raises(records.RecordError) as info:
        records.retire_alternatives(service, **retire)
    assert (info.value.status_code, info.value.code) == (404, "not_found")
    assert options(db, body["generation_record_id"]) == [(1, "review_suggestion", "pending"),
                                                         (2, "review_suggestion", "pending")]


def test_an_option_already_accepted_cant_be_adjusted(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    accept(service, cast["owner"], cast, body, 1)
    with pytest.raises(ApiError) as info:  # the sibling is superseded
        adjust(cast["owner"], cast, service, body, 2, revision=3)
    assert info.value.code == "proposal_unavailable"


def test_the_set_is_retired_before_the_adjustment_is_staged(cast, db, service):
    # The sibling is accepted while the adjustment's model call runs: the
    # adjustment fails and nothing is staged, so two options never both land.
    body = alternatives(cast["owner"], cast, service)

    def accepting_meanwhile(prompt, **kwargs):
        if prompt == "scope?":  # the scope check's call
            return GeminiResult(data={}, model="fake", prompt_tokens=1, output_tokens=1)
        save_prd(service, verified(service, cast["owner"]), cast["prd"], 2, content_json=DOC,  # a no-op acceptance
                 origin="ai_generated", generation_record_id=body["generation_record_id"], option=1)
        return GeminiResult(data={"sections": [NEW_RISKS], "explanation": "Swapped."}, model="fake",
                            prompt_tokens=5, output_tokens=7)

    with pytest.raises(ApiError) as info:
        chat_revision.propose_revision(
            as_user(cast["owner"]), service, actor_id=cast["owner"].id, prd_id=cast["prd"], revision=2,
            instruction="Use the adoption risk instead.", session_messages=[],
            previous_generation_record_id=body["generation_record_id"], previous_option=2,
            modules=modules(), call_model=accepting_meanwhile)
    assert info.value.code == "proposal_unavailable"
    assert [o[2] for o in options(db, body["generation_record_id"])] == ["accepted", "superseded"]
    assert db.execute("select count(*) from ai_proposal where prd_id = %s and option_no is null",
                      (cast["prd"],)).fetchone() == (0,)
    assert [r[:2] for r in records_of(db, cast["prd"])] == [("success", None), ("failed", "proposal_unavailable")]


def test_adjusting_needs_the_option_and_the_owner(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    with pytest.raises(ApiError) as info:
        adjust(cast["owner"], cast, service, body, None)
    assert (info.value.status_code, info.value.code) == (422, "option_required")
    with pytest.raises(ApiError) as info:  # an editor can't adjust the owner's option
        adjust(cast["editor"], cast, service, body, 1)
    assert info.value.code == "proposal_unavailable"
    assert [o[2] for o in options(db, body["generation_record_id"])] == ["pending", "pending"]


# --- database rules ------------------------------------------------------------------


def test_one_record_stages_one_proposal_or_one_per_option(cast, db, service):
    body = alternatives(cast["owner"], cast, service)
    record_id = body["generation_record_id"]
    insert = ("insert into ai_proposal (prd_id, requester_id, kind, base_revision, content, generation_record_id, "
              "option_no, expires_at) values (%s, %s, 'review_suggestion', 2, '{}', %s, %s, now() + interval '1 hour')")
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(insert, (cast["prd"], cast["owner"].id, record_id, 1))
    single = alternatives(cast["owner"], cast, service)["generation_record_id"]
    db.execute("delete from ai_proposal where generation_record_id = %s", (single,))
    db.execute(insert, (cast["prd"], cast["owner"].id, single, None))
    with pytest.raises(psycopg.errors.UniqueViolation):
        db.execute(insert, (cast["prd"], cast["owner"].id, single, None))
    with pytest.raises(psycopg.errors.CheckViolation):
        db.execute("update ai_proposal set status = 'withdrawn' where generation_record_id = %s", (record_id,))


def test_new_functions_are_for_the_backend_only(db):
    rows = db.execute("""
        select p.proname, has_function_privilege('authenticated', p.oid, 'execute'),
               has_function_privilege('anon', p.oid, 'execute'),
               has_function_privilege('service_role', p.oid, 'execute')
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where n.nspname = 'public'
          and p.proname in ('ai_stage_alternatives', 'ai_retire_alternatives', 'ai_take_proposal', 'save_prd')
        order by p.proname""").fetchall()
    assert rows == [("ai_retire_alternatives", False, False, True), ("ai_stage_alternatives", False, False, True),
                    ("ai_take_proposal", False, False, False), ("save_prd", False, False, True)]


# --- the route -----------------------------------------------------------------------


def test_the_route_is_wired_and_checks_access_first(cast):
    r = cast["owner"].api("POST", f"/prds/{cast['prd']}/review-alternatives", json={"revision": 2, "feedback_ids": []})
    assert (r.status_code, r.json()["code"]) == (422, "validation_error")
    r = cast["editor"].api("POST", f"/prds/{cast['prd']}/review-alternatives",
                           json={"revision": 2, "feedback_ids": cast["comments"]})
    assert (r.status_code, r.json()["code"]) == (403, "owner_required")
    r = cast["owner"].api("POST", f"/prds/{cast['prd']}/ai-revisions",
                          json={"revision": 2, "instruction": "x", "previous_option": 0})
    assert r.status_code == 422
