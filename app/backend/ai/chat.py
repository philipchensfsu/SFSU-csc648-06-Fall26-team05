"""PRD chat, answer-only (Backend Tasks A04 first slice; D5 chatbot).

POST /api/prds/{id}/ai/chat {revision, message, history} returns
{kind, message, base_revision, generation_record_id}, where kind is
"answer", "blocked" or "clarification". It never changes the PRD: no
content, version, review state or durable context is written. Only the
generation_record (A02, trigger chat_request) persists.

Ownership (agreed 2026-10-30): Om supplies the domain guardrail and the chat
prompts as two modules under app/backend/ai/ (see REQUIRED_EXPORTS); this
file is the backend wiring around them. Until both modules exist and export
what's required, the route answers 503 ai_chat_unavailable before touching
the database or the usage gate.

Order:
1. Load the PRD, its answers and its saved context with the user's own
   client, so RLS decides what they can see (404). Viewers may chat (D5).
2. The expected revision must be current (409).
3. Inside one A07 admission: Om's check_scope, then, only on "allow", the
   answer call. "block" and "unclear" skip the answer call and return his
   fixed refusal or clarification. Provider failures stay normal API errors.
4. Record the request (A02). The database checks view access again as the
   requester when recording, so nothing is returned to someone who lost
   access meanwhile.

Every provider call, including any the guardrail makes, goes through a
wrapper that caps its timeout from the request budget (usage_gate.
RequestBudget) and counts tokens for the record. History and PRD text are
client or user data: Om's prompts must treat them as data, never
instructions, and a scope "allow" grants nothing. Access is decided by RLS
and the database functions only.
"""

from __future__ import annotations

import importlib
import logging
from collections.abc import Callable
from dataclasses import dataclass

from ai import records, usage_gate
from ai.gemini_client import AIError, GeminiResult, generate_json, model_name
from ai.generation import INTAKE_KEYS, SavedContext, check_context
from errors import ApiError

logger = logging.getLogger("nautilus.ai")

# What Om's modules must export. Checked on every request, so the route turns
# on by itself once both are merged.
REQUIRED_EXPORTS = {
    "ai.guardrails": ("check_scope",),
    "ai.chat_prompts": ("CHAT_PROMPT_VERSION", "CHAT_SYSTEM_INSTRUCTION", "CHAT_RESPONSE_SCHEMA",
                        "FIXED_REFUSAL", "FIXED_CLARIFICATION", "build_chat_prompt"),
}
VERDICTS = ("allow", "block", "unclear")

# Bounds (v1.2 A04): the route's request model enforces the message and
# history limits; these bound what the backend sends and accepts.
MAX_MESSAGE_CHARS = 2000
MAX_HISTORY_MESSAGES = 20
MAX_DOCUMENT_CHARS = 30000  # current PRD text sent to the model, cut beyond this
MAX_ANSWER_CHARS = 8000
MAX_ANSWER_OUTPUT_TOKENS = 4096

CHAT_UNAVAILABLE = (503, "Chat with the AI isn't available yet. You can keep editing by hand.",
                    "ai_chat_unavailable")
STALE_REVISION = (409, "This PRD changed since you last loaded it. Refresh and try again.", "stale_revision")


@dataclass(frozen=True)
class ChatModules:
    guardrails: object
    prompts: object


def load_modules() -> ChatModules | None:
    """Om's guardrail and prompt modules, or None while either is missing or
    incomplete (the route then stays disabled)."""
    loaded = {}
    for name, exports in REQUIRED_EXPORTS.items():
        try:
            module = importlib.import_module(name)
        except ModuleNotFoundError as exc:
            if exc.name != name:
                logger.error("Chat module %s failed to import (%s)", name, type(exc).__name__)
            return None
        except Exception as exc:  # noqa: BLE001 - a broken module disables chat, not the app
            logger.error("Chat module %s failed to import (%s)", name, type(exc).__name__)
            return None
        missing = [export for export in exports if not hasattr(module, export)]
        if missing:
            logger.error("Chat module %s is missing %s", name, ", ".join(missing))
            return None
        loaded[name] = module
    return ChatModules(guardrails=loaded["ai.guardrails"], prompts=loaded["ai.chat_prompts"])


def answer_chat(user_client, service_client, *, actor_id, prd_id: str, revision: int, message: str,
                history: list[dict], budget: usage_gate.RequestBudget | None = None,
                modules: ChatModules | None = None, call_model: Callable[..., GeminiResult] | None = None) -> dict:
    modules = modules or load_modules()
    if modules is None:
        raise ApiError(*CHAT_UNAVAILABLE)
    if not message.strip():
        raise ApiError(422, "Type a message for the AI.", "validation_error")
    budget = budget or usage_gate.RequestBudget()

    current_revision, prd = load_chat_prd(user_client, prd_id)
    if current_revision != revision:
        raise ApiError(*STALE_REVISION)

    calls = _BudgetedCalls(call_model or generate_json, budget)
    prompts = modules.prompts
    with usage_gate.admitted(user_client):
        try:
            calls.cap = usage_gate.scope_timeout_seconds()
            decision = modules.guardrails.check_scope(prd, history, message, call_model=calls,
                                                      timeout_seconds=budget.call_timeout(calls.cap))
            verdict = _verdict(decision)
            if verdict != "allow":
                kind, text, code = (("blocked", prompts.FIXED_REFUSAL, "out_of_scope") if verdict == "block"
                                    else ("clarification", prompts.FIXED_CLARIFICATION, "clarification_needed"))
                record = _record(service_client, actor_id, prd_id, revision, calls, prompts,
                                 status="failed", error_code=code)
                return _response(kind, text, revision, record)

            calls.cap = usage_gate.main_timeout_seconds()
            result = calls(prompts.build_chat_prompt(prd, history, message),
                           system_instruction=prompts.CHAT_SYSTEM_INSTRUCTION,
                           response_schema=prompts.CHAT_RESPONSE_SCHEMA,
                           max_output_tokens=MAX_ANSWER_OUTPUT_TOKENS)
            answer = _checked_answer(result)
        except AIError as exc:
            _record_failure(service_client, actor_id, prd_id, revision, calls, prompts, exc.code)
            raise
        record = _record(service_client, actor_id, prd_id, revision, calls, prompts, status="success")
    return _response("answer", answer, revision, record)


def load_chat_prd(user_client, prd_id: str) -> tuple[int, dict]:
    """The PRD as the chat sees it, read as the user (RLS). Only this PRD."""
    rows = user_client.table("prd").select("*").eq("id", prd_id).execute().data
    if not rows:
        raise ApiError(404, "PRD not found")
    row = rows[0]
    answers = {key: "" for key in INTAKE_KEYS}
    for answer in (user_client.table("intake_answer").select("question_key, answer_text, skipped")
                   .eq("prd_id", prd_id).execute().data):
        if answer["question_key"] in answers and not answer["skipped"]:
            answers[answer["question_key"]] = answer["answer_text"] or ""
    context_rows = (user_client.table("prd_context").select("context_json, running_summary")
                    .eq("prd_id", prd_id).execute().data)
    context = SavedContext.from_row(context_rows[0] if context_rows else None)
    check_context(context)
    text = row.get("content_text") or ""
    return row["revision"], {
        "id": row["id"],
        "title": row["title"],
        "description": row.get("description") or "",
        "content_text": text[:MAX_DOCUMENT_CHARS],
        "content_text_truncated": len(text) > MAX_DOCUMENT_CHARS,
        "intake_answers": answers,
        "context": {"decisions": list(context.decisions), "constraints": list(context.constraints),
                    "open_questions": list(context.open_questions),
                    "running_summary": context.running_summary},
    }


class _BudgetedCalls:
    """The model call handed to the guardrail and used for the answer: caps
    each call's timeout from the request budget and counts tokens."""

    def __init__(self, call_model, budget):
        self._call_model, self._budget = call_model, budget
        self.cap = usage_gate.main_timeout_seconds()
        self.model = None
        self.prompt_tokens = self.output_tokens = 0

    def __call__(self, prompt, **kwargs):
        wanted = min(kwargs.get("timeout_seconds") or self.cap, self.cap)
        kwargs["timeout_seconds"] = self._budget.call_timeout(wanted)
        result = self._call_model(prompt, **kwargs)
        self.model = result.model
        self.prompt_tokens += result.prompt_tokens or 0
        self.output_tokens += result.output_tokens or 0
        return result


def _verdict(decision) -> str:
    verdict = getattr(decision, "verdict", decision)
    if verdict not in VERDICTS:
        logger.warning("Scope check returned an unknown verdict; treating it as block")
        return "block"
    return verdict


def _checked_answer(result: GeminiResult) -> str:
    data = result.data
    text = data.get("message") if isinstance(data, dict) else None
    if not isinstance(text, str) or not text.strip() or len(text) > MAX_ANSWER_CHARS:
        logger.warning("Chat reply on %s failed checks", result.model)
        raise AIError(502, "ai_invalid_output")
    return text


def _record(service_client, actor_id, prd_id, revision, calls, prompts, *, status, error_code=None):
    # Raw chat text isn't stored (user_request stays empty).
    return records.record_ai_request(
        service_client, actor_id=actor_id, prd_id=prd_id, base_revision=revision, trigger="chat_request",
        model=calls.model or model_name(), prompt_version=prompts.CHAT_PROMPT_VERSION, status=status,
        error_code=error_code, prompt_tokens=calls.prompt_tokens or None, output_tokens=calls.output_tokens or None)


def _record_failure(service_client, actor_id, prd_id, revision, calls, prompts, error_code):
    # Best effort: the provider error is what the user needs to see.
    try:
        _record(service_client, actor_id, prd_id, revision, calls, prompts, status="failed", error_code=error_code)
    except Exception as exc:  # noqa: BLE001
        logger.error("Couldn't record a failed chat request (%s)", type(exc).__name__)


def _response(kind: str, message: str, revision: int, record: records.RecordResult) -> dict:
    return {"kind": kind, "message": message, "base_revision": revision,
            "generation_record_id": record.generation_record_id}
