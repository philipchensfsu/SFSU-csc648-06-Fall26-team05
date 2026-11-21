"""Replies: escaped, under Discord's 2000-character limit, and honest about
AI text."""

import pytest

from nautilus_bot import format as fmt
from nautilus_bot.config import ConfigError, load


def prd(i, title="Checkout"):
    return {"id": f"{i:08d}-1111-4111-8111-111111111111", "title": title, "status": "in_review",
            "review_state": "changes_requested", "priority": None, "my_role": "viewer"}


def test_nautilus_text_cant_mention_anyone_or_format_the_message():
    out = fmt.prds({"items": [prd(1, "@everyone **urgent** <@123456789012345678>")], "total": 1})
    assert "@everyone" not in out and "**urgent**" not in out and "<@123456789012345678>" not in out


def test_long_lists_stay_under_the_limit():
    out = fmt.prds({"items": [prd(i, "A very long PRD title " * 6) for i in range(25)], "total": 40})
    assert len(out) <= fmt.LIMIT and "…more in Nautilus." in out and out.startswith("25 of 40 PRDs")


def test_summary_sections_and_the_empty_case():
    data = {"version_no": 3, "comment_count": 5, "summarized_comment_count": 5, "summary": {
        "themes": [{"title": "Budget", "summary": "Costs unclear."}], "open_questions": [{"question": "Who signs?"}],
        "requested_changes": [{"change": "Add a risk."}], "unresolved_items": []}}
    out = fmt.summary(data)
    assert "version 3 (5 comments)" in out and "AI-generated" in out
    assert "**Themes**" in out and "Who signs?" in out and "**Unresolved**" not in out
    assert "nothing to summarize" in fmt.summary({"comment_count": 0})
    huge = {**data, "summary": {"themes": [{"title": "T", "summary": "x" * 500}] * 10}}
    assert len(fmt.summary(huge)) <= fmt.LIMIT


def test_prd_status_shows_review_progress_and_owners():
    out = fmt.prd({**prd(1), "work_status": "in_progress", "description": "Pay faster.",
                   "approval": {"state": "in_review", "approved_count": 1, "required_count": 2},
                   "owners": [{"id": "x", "name": "Olive"}]})
    assert "1 of 2 approved" in out and "Owners: Olive" in out and "in progress" in out


def test_configuration_names_whats_missing_but_never_values():
    with pytest.raises(ConfigError) as info:
        load({"DISCORD_BOT_TOKEN": "tok-123", "NAUTILUS_API_URL": "", "BOT_API_SECRET": ""})
    assert "NAUTILUS_API_URL" in str(info.value) and "BOT_API_SECRET" in str(info.value)
    assert "tok-123" not in str(info.value)
    with pytest.raises(ConfigError):
        load({"DISCORD_BOT_TOKEN": "t", "NAUTILUS_API_URL": "http://example.com", "BOT_API_SECRET": "s"})
    settings = load({"DISCORD_BOT_TOKEN": "tok-123", "NAUTILUS_API_URL": "https://n.test/", "BOT_API_SECRET": "s"})
    assert settings.api_url == "https://n.test" and "tok-123" not in repr(settings)


@pytest.mark.parametrize("raw", ["20s", "abc", "0", "-5", "nan", "inf"])
def test_bad_timeout_gives_a_config_error_not_a_traceback(raw):
    env = {"DISCORD_BOT_TOKEN": "t", "NAUTILUS_API_URL": "https://n.test", "BOT_API_SECRET": "s",
           "BOT_REQUEST_TIMEOUT_SECONDS": raw}
    with pytest.raises(ConfigError) as info:
        load(env)
    assert "BOT_REQUEST_TIMEOUT_SECONDS" in str(info.value)


def test_timeouts_default_when_unset_or_blank_and_accept_numbers():
    base = {"DISCORD_BOT_TOKEN": "t", "NAUTILUS_API_URL": "https://n.test", "BOT_API_SECRET": "s"}
    assert (load(base).request_timeout, load(base).summary_timeout) == (20.0, 290.0)
    blank = load({**base, "BOT_REQUEST_TIMEOUT_SECONDS": " ", "BOT_SUMMARY_TIMEOUT_SECONDS": ""})
    assert (blank.request_timeout, blank.summary_timeout) == (20.0, 290.0)
    custom = load({**base, "BOT_REQUEST_TIMEOUT_SECONDS": "7.5", "BOT_SUMMARY_TIMEOUT_SECONDS": "120"})
    assert (custom.request_timeout, custom.summary_timeout) == (7.5, 120.0)
