"""Plain-text replies, short enough for one Discord message.

Everything from Nautilus (titles, names, AI text) is escaped, so it can't
format the message or mention anyone. Replies are also sent with mentions
turned off.
"""

from __future__ import annotations

from discord.utils import escape_markdown, escape_mentions

from .api import ApiError

LIMIT = 2000

LINK_HELP = ("Your Discord account isn't linked to Nautilus yet. In Nautilus, open Settings, choose "
             "\"Connect Discord\" to get a code, then run `/link` with it here.")

STATUS = {"draft": "Draft", "in_review": "In review", "final": "Final", "assigned": "Assigned"}
REVIEW = {"in_review": "in review", "changes_requested": "changes requested", "approved": "approved"}
WORK = {"not_started": "not started", "in_progress": "in progress", "done": "done"}
ROLE = {"owner": "owner", "editor": "editor", "viewer": "viewer", "org_admin": "org admin"}
EVENTS = {
    "created": "created", "version_saved": "new version saved", "ai_applied": "AI suggestion applied",
    "member_added": "added you", "member_role_changed": "role changed", "member_removed": "member removed",
    "team_added": "team added", "comment_added": "new comment", "mentioned": "mentioned you",
    "submitted": "sent for review", "approved": "approved", "changes_requested": "changes requested",
    "round_approved": "review approved", "superseded": "review restarted", "work_status_changed": "work status changed",
    "reviewer_changed": "reviewer changed",
}


def text(value) -> str:
    """Untrusted text from Nautilus, made inert for Discord."""
    return escape_mentions(escape_markdown(str(value or "").strip()))


def clip(message: str) -> str:
    if len(message) <= LIMIT:
        return message
    return message[: LIMIT - 2].rstrip() + " …"


def _words(mapping, value, default="—"):
    return mapping.get(value, str(value).replace("_", " ")) if value else default


def error_message(error: ApiError, command: str) -> str:
    code, status = error.code, error.status
    if code == "discord_not_linked":
        return LINK_HELP
    if code == "invalid_link_code":
        return ("That code doesn't match, or it has expired (codes last 10 minutes and work once). "
                "Create a new one in Nautilus settings and run `/link` again.")
    if code in ("ai_cooldown", "ai_busy"):
        wait = f" Try again in {error.retry_after} seconds." if error.retry_after else " Try again shortly."
        reason = "You asked very recently." if code == "ai_cooldown" else "You already have an AI request running."
        return reason + wait
    if code == "ai_disabled":
        return "AI is switched off in Nautilus right now."
    if code in ("ai_budget_exhausted", "ai_provider_rate_limited"):
        return "The AI has reached its usage limit for now. Try again later."
    if code in ("ai_provider_error", "ai_invalid_output", "ai_unavailable", "ai_output_blocked"):
        return "The AI couldn't produce a summary this time. Try again in a minute."
    if code == "bot_not_configured":
        return "The Nautilus server isn't set up for the Discord bot yet. Tell the Nautilus team."
    if code == "timeout":
        if command == "summary":
            return ("Nautilus took too long to answer. The summary may still finish (and count toward your AI "
                    "allowance), so wait a minute before trying again.")
        return "Nautilus took too long to answer. Try again in a moment."
    if code == "unreachable":
        return "Couldn't reach Nautilus. Try again in a moment."
    if status == 401:
        return "The bot couldn't sign in to Nautilus. Tell the Nautilus team."
    if status == 404:
        return "Not found, or you don't have access to it in Nautilus."
    if status == 403:
        return "You don't have access to that in Nautilus."
    if status in (400, 422):
        return "Nautilus didn't accept that. Check the id or option and try again."
    return "Something went wrong in Nautilus. Try again in a moment."


def linked(data: dict) -> str:
    name = text(data.get("full_name")) or "your account"
    return f"Linked as **{name}**. Your commands now answer with what you can see in Nautilus."


def me(data: dict) -> str:
    lines = [f"Linked to **{text(data.get('full_name')) or 'your Nautilus account'}**"]
    org = data.get("organization")
    if org:
        lines.append(f"Organization: {text(org.get('name'))} ({_words(ROLE, org.get('access_role'))})")
    else:
        lines.append("Not in an organization yet.")
    return "\n".join(lines)


def _prd_line(prd: dict) -> str:
    review = f", {REVIEW[prd['review_state']]}" if prd.get("review_state") in REVIEW else ""
    priority = f", {prd['priority']} priority" if prd.get("priority") else ""
    return (f"• **{text(prd.get('title'))}** ({_words(STATUS, prd.get('status'))}{review}{priority}, "
            f"you: {_words(ROLE, prd.get('my_role'))})\n  `{prd.get('id')}`")


def prds(data: dict) -> str:
    items, total = data.get("items") or [], data.get("total", 0)
    if not items:
        return "No PRDs match."
    head = f"{len(items)} of {total} PRDs, newest change first:" if total > len(items) else \
        f"{total} PRD{'s' if total != 1 else ''}, newest change first:"
    lines = [head]
    for prd in items:
        candidate = "\n".join(lines + [_prd_line(prd)])
        if len(candidate) > LIMIT - 60:
            lines.append("…more in Nautilus.")
            break
        lines.append(_prd_line(prd))
    lines.append("Use `/prd` or `/summary` with an id above.")
    return clip("\n".join(lines))


def prd(data: dict) -> str:
    lines = [f"**{text(data.get('title'))}**", f"Status: {_words(STATUS, data.get('status'))}"]
    approval = data.get("approval") or {}
    if approval.get("state"):
        lines.append(f"Review: {REVIEW.get(approval['state'], approval['state'])}, "
                     f"{approval.get('approved_count', 0)} of {approval.get('required_count', 0)} approved")
    lines.append(f"Work: {_words(WORK, data.get('work_status'))} · Priority: {data.get('priority') or '—'}")
    owners = [text(o.get("name")) or "someone" for o in data.get("owners") or []]
    if owners:
        lines.append("Owners: " + ", ".join(owners))
    lines.append(f"Your role: {_words(ROLE, data.get('my_role'))}")
    if data.get("description"):
        lines.append("")
        lines.append(text(data["description"])[:600])
    return clip("\n".join(lines))


def inbox(data: dict, unread_only: bool) -> str:
    items = data.get("items") or []
    unread = data.get("unread_count", 0)
    if not items:
        return "No unread notifications." if unread_only else "No notifications."
    lines = [f"{unread} unread:" if unread_only else f"Latest notifications ({unread} unread):"]
    for item in items:
        who = f" by {text(item.get('actor_name'))}" if item.get("actor_name") else ""
        lines.append(f"• {_words(EVENTS, item.get('type'))}{who} on **{text(item.get('title'))}**")
    if data.get("next_cursor"):
        lines.append("…more in Nautilus.")
    lines.append("Mark them read in Nautilus.")
    return clip("\n".join(lines))


def summary(data: dict) -> str:
    count, used = data.get("comment_count", 0), data.get("summarized_comment_count", 0)
    if not count:
        return "No comments on this version yet, so there's nothing to summarize."
    body = data.get("summary") or {}
    scope = f"{used} of {count} comments" if used < count else f"{count} comment{'s' if count != 1 else ''}"
    lines = [f"Discussion summary of version {data.get('version_no')} ({scope}). AI-generated: check the "
             "comments before acting on it."]
    sections = (
        ("Themes", "themes", lambda i: f"{text(i.get('title'))}: {text(i.get('summary'))}"),
        ("Open questions", "open_questions", lambda i: text(i.get("question"))),
        ("Requested changes", "requested_changes", lambda i: text(i.get("change"))),
        ("Unresolved", "unresolved_items", lambda i: text(i.get("item"))),
    )
    for title, key, line in sections:
        items = body.get(key) or []
        if items:
            lines.append(f"\n**{title}**")
            lines.extend(f"• {line(item)}" for item in items)
    if len(lines) == 1:
        lines.append("Nothing stood out in the comments.")
    return clip("\n".join(lines))
