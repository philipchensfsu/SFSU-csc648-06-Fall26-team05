"""Feature 04: what the bot can read (PRD list, PRD status, inbox, summary), always
exactly as the linked person would see it in Nautilus."""

from conftest import org_prd, save_version
from test_bot_routes import DISCORD_A, DISCORD_B, bot, link


def ada_with_prds(make_user, make_org, db, *titles):
    ada, ben = make_user(), make_user()
    org = make_org(ada, ben)
    prds = [org_prd(db, org, ada, title) for title in titles]
    link(ada, DISCORD_A)
    link(ben, DISCORD_B)
    return ada, ben, prds


def test_the_prd_list_matches_the_persons_own_list_without_documents(
    make_user, make_org, db
):
    ada, ben, _ = ada_with_prds(make_user, make_org, db, "Alpha", "Beta", "Gamma")
    r = bot("GET", "/bot/prds")
    assert r.status_code == 200
    body = r.json()
    assert [p["id"] for p in body["items"]] == [
        p["id"] for p in ada.api("GET", "/prds").json()
    ]
    assert body["total"] == 3 and {p["my_role"] for p in body["items"]} == {"owner"}
    assert (
        "content_json" not in body["items"][0]
        and "content_text" not in body["items"][0]
    )


def test_the_list_pages_and_filters_like_the_web_list(make_user, make_org, db):
    ada_with_prds(make_user, make_org, db, "Alpha", "Beta", "Gamma")
    limited = bot("GET", "/bot/prds", params={"limit": 2}).json()
    assert len(limited["items"]) == 2 and limited["total"] == 3
    assert [
        p["title"]
        for p in bot("GET", "/bot/prds", params={"search": "bet"}).json()["items"]
    ] == ["Beta"]
    assert bot("GET", "/bot/prds", params={"view": "shared"}).json()["total"] == 0
    assert bot("GET", "/bot/prds", params={"limit": 26}).status_code == 422


def test_people_see_only_their_own_prds(make_user, make_org, db):
    ada, ben, (alpha,) = ada_with_prds(make_user, make_org, db, "Alpha")
    assert bot("GET", "/bot/prds", DISCORD_B).json() == {"items": [], "total": 0}
    r = bot("GET", f"/bot/prds/{alpha}", DISCORD_B)
    assert r.status_code == 404


def test_a_prds_status_has_its_review_and_owners_but_no_document(
    make_user, make_org, db
):
    ada, _, (alpha,) = ada_with_prds(make_user, make_org, db, "Alpha")
    db.execute("update profile set full_name = 'Ada Admin' where id = %s", (ada.id,))
    r = bot("GET", f"/bot/prds/{alpha}")
    assert r.status_code == 200
    body = r.json()
    full = ada.api("GET", f"/prds/{alpha}").json()
    assert (
        body["title"] == "Alpha"
        and body["status"] == full["status"]
        and body["approval"] == full["approval"]
    )
    assert body["owners"] == [{"id": ada.id, "name": "Ada Admin"}]
    assert "content_json" not in body and "capabilities" not in body


def test_the_inbox_shows_unread_notifications(make_user, make_org, db):
    ada, ben, (alpha,) = ada_with_prds(make_user, make_org, db, "Alpha")
    assert (
        ada.api(
            "PUT", f"/prds/{alpha}/members/{ben.id}", json={"role": "editor"}
        ).status_code
        == 200
    )
    inbox = bot("GET", "/bot/inbox", DISCORD_B).json()
    assert inbox["unread_count"] == 1 and [n["type"] for n in inbox["items"]] == [
        "member_added"
    ]
    note = inbox["items"][0]["id"]
    assert (
        ben.api("PATCH", f"/notifications/{note}", json={"read": True}).status_code
        == 200
    )
    assert bot("GET", "/bot/inbox", DISCORD_B).json()["items"] == []
    assert (
        len(
            bot("GET", "/bot/inbox", DISCORD_B, params={"unread_only": "false"}).json()[
                "items"
            ]
        )
        == 1
    )
    assert bot("GET", "/bot/inbox").json()["items"] == []  # Ada's own inbox


def test_every_read_needs_a_linked_account():
    for path in (
        "/bot/prds",
        "/bot/prds/00000000-0000-0000-0000-000000000000",
        "/bot/inbox",
    ):
        r = bot("GET", path, "111111111111111111")
        assert r.status_code == 403 and r.json()["code"] == "discord_not_linked", path


def test_a_summary_is_asked_as_the_linked_person(make_user, make_org, db):
    # No comments: an empty summary without the model (the local stack has no
    # Gemini key). The model path is Marco's, tested in test_discussion_summary_db.
    ada, ben, (alpha, beta) = ada_with_prds(make_user, make_org, db, "Alpha", "Beta")
    r = bot("POST", f"/bot/prds/{alpha}/summary")
    assert r.status_code == 200, r.text
    assert r.json()["version_id"] is None and r.json()["generation_record_id"] is None
    assert r.json() == ada.api("POST", f"/prds/{alpha}/discussion-summary").json()
    # Ben is in the org but not on the PRD.
    assert bot("POST", f"/bot/prds/{alpha}/summary", DISCORD_B).status_code == 404
    other = save_version(db, beta, ada)
    assert (
        bot(
            "POST", f"/bot/prds/{alpha}/summary", json={"version_id": other}
        ).status_code
        == 404
    )
    assert (
        bot(
            "POST", f"/bot/prds/{alpha}/summary", json={"version_id": "nope"}
        ).status_code
        == 422
    )
    assert (
        bot("POST", f"/bot/prds/{alpha}/summary", "111111111111111111").json()["code"]
        == "discord_not_linked"
    )
