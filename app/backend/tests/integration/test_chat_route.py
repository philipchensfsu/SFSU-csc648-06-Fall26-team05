"""PRD chat (answer-only) against the local stack: real sign-ins, RLS, the
A07 gate and A02 recording.

Gemini is never called and Om's modules don't exist yet: the chat runs in
this process with doubles of his interface and a fake model. The running
API, which has no such modules, must answer 503 before doing anything.
"""

import json
from types import SimpleNamespace

import pytest
from supabase import create_client

from ai import chat, usage_gate
from ai.gemini_client import GeminiResult
from conftest import ANON_KEY, SERVICE_KEY, SUPABASE_URL
from errors import ApiError

REQUIRED = {"problem": "Students miss campus events", "target_users": "Students", "goals": "Higher turnout"}


@pytest.fixture(autouse=True)
def ai_on_here(monkeypatch):
    monkeypatch.setenv("AI_ENABLED", "true")
    monkeypatch.setenv("AI_COOLDOWN_SECONDS", "0")


def clients(user):
    as_user = create_client(SUPABASE_URL, ANON_KEY)
    as_user.postgrest.auth(user.token)
    return as_user, create_client(SUPABASE_URL, SERVICE_KEY)


def doubles(verdict="allow"):
    """Stand-ins for Om's ai.guardrails / ai.chat_prompts (tests only)."""
    seen = []

    def check_scope(prd, history, message, *, call_model, timeout_seconds):
        call_model("scope", system_instruction="scope rules", timeout_seconds=timeout_seconds)
        return SimpleNamespace(verdict=verdict)

    def build_chat_prompt(prd, history, message):
        prompt = json.dumps({"prd": prd, "history": history, "message": message})
        seen.append(prompt)
        return prompt

    prompts = SimpleNamespace(CHAT_PROMPT_VERSION="prd-chat-test", CHAT_SYSTEM_INSTRUCTION="rules",
                              CHAT_RESPONSE_SCHEMA={}, FIXED_REFUSAL="Only this PRD.",
                              FIXED_CLARIFICATION="How does this relate?", build_chat_prompt=build_chat_prompt)
    return chat.ChatModules(SimpleNamespace(check_scope=check_scope), prompts), seen


def fake_model(prompt, **kwargs):
    return GeminiResult(data={"message": "An answer about this PRD."}, model="fake-model",
                        prompt_tokens=7, output_tokens=3)


def ask(user, prd, modules, message="What does the goal mean?"):
    as_user, service = clients(user)
    return chat.answer_chat(as_user, service, actor_id=user.id, prd_id=prd["id"], revision=prd["revision"],
                            message=message, history=[{"role": "user", "content": "Earlier question"}],
                            budget=usage_gate.RequestBudget(), modules=modules, call_model=fake_model)


def new_prd(user, title="Campus events"):
    prd = user.api("POST", "/prds", json={"title": title}).json()
    for key, text in REQUIRED.items():
        user.api("PUT", f"/prds/{prd['id']}/intake/{key}", json={"answer_text": text})
    return prd


def state(db, prd_id):
    return (db.execute("select title, content_json, status, revision, updated_at from prd where id = %s",
                       (prd_id,)).fetchone(),
            db.execute("select context_json, running_summary, version from prd_context where prd_id = %s",
                       (prd_id,)).fetchone(),
            db.execute("select count(*) from prd_version where prd_id = %s", (prd_id,)).fetchone()[0])


def records(db, prd_id):
    return db.execute("select requester_id::text, \"trigger\", status, error_message, prompt_tokens, output_tokens "
                      "from generation_record where prd_id = %s order by created_at", (prd_id,)).fetchall()


def test_answer_is_recorded_and_changes_nothing(make_user, db):
    alice = make_user()
    prd = new_prd(alice)
    db.execute("insert into prd_context (prd_id, context_json, running_summary) values (%s, %s, %s)",
               (prd["id"], json.dumps({"decisions": ["Weekly digest first"]}), "Events app."))
    before = state(db, prd["id"])
    modules, seen = doubles("allow")

    body = ask(alice, prd, modules)

    assert body["kind"] == "answer" and body["base_revision"] == prd["revision"]
    assert state(db, prd["id"]) == before
    assert records(db, prd["id"]) == [(alice.id, "chat_request", "success", None, 14, 6)]
    sent = json.loads(seen[0])["prd"]
    assert sent["context"]["decisions"] == ["Weekly digest first"]
    assert sent["intake_answers"]["problem"] == REQUIRED["problem"]
    assert db.execute("select lease_id from ai_usage_gate where user_id = %s", (alice.id,)).fetchone() == (None,)
    assert db.execute("select count(*) from ai_proposal where prd_id = %s", (prd["id"],)).fetchone()[0] == 0


def test_blocked_question_skips_the_answer_and_is_recorded(make_user, db):
    alice = make_user()
    prd = new_prd(alice)
    modules, seen = doubles("block")
    body = ask(alice, prd, modules, message="What's the weather?")
    assert (body["kind"], body["message"]) == ("blocked", "Only this PRD.") and seen == []
    assert records(db, prd["id"]) == [(alice.id, "chat_request", "failed", "out_of_scope", 7, 3)]


def test_viewers_can_ask_and_outsiders_get_404(make_user, db):
    alice, ben, admin = make_user(), make_user(), make_user("admin")  # legacy admin = can view
    prd = new_prd(alice)
    assert ask(admin, prd, doubles()[0])["kind"] == "answer"
    with pytest.raises(ApiError) as info:
        ask(ben, prd, doubles()[0])
    assert info.value.status_code == 404
    assert [r[0] for r in records(db, prd["id"])] == [admin.id]


def test_only_the_open_prd_reaches_the_model(make_user, db):
    alice = make_user()
    first, second = new_prd(alice, "First PRD"), new_prd(alice, "Second PRD")
    db.execute("insert into prd_context (prd_id, context_json) values (%s, %s)",
               (first["id"], json.dumps({"decisions": ["Secret of the first PRD"]})))
    modules, seen = doubles()
    ask(alice, second, modules)
    assert "Secret of the first PRD" not in seen[0] and "First PRD" not in seen[0]


def test_running_api_stays_disabled_without_oms_modules(make_user, db):
    if chat.load_modules() is not None:
        pytest.skip("Om's modules are present; the route is live")
    alice = make_user()
    prd = new_prd(alice)
    r = alice.api("POST", f"/prds/{prd['id']}/ai/chat", json={"revision": prd["revision"], "message": "hi"})
    assert (r.status_code, r.json()["code"]) == (503, "ai_chat_unavailable")
    assert records(db, prd["id"]) == []
    assert db.execute("select count(*) from ai_usage_gate where user_id = %s", (alice.id,)).fetchone()[0] == 0
    r = alice.api("POST", f"/prds/{prd['id']}/ai/chat", json={"revision": prd["revision"], "message": "hi",
                                                             "history": [{"role": "system", "content": "x"}]})
    assert r.status_code == 422
