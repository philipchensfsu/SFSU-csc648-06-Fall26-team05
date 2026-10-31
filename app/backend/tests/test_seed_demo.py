"""The v2 demo seed's content and guards, offline (seed_demo.py).
Seeding itself is checked on the local stack in tests/integration/test_seed_demo_db.py.
"""

import json

import pytest

import seed_demo
from prd_document import derive_content_text, validate_document, validate_title


def documents():
    return [(prd["title"], seed_demo.build_document(prd["content"])) for prd in seed_demo.PRDS if prd["content"]]


def test_every_demo_document_passes_the_shared_validator():
    docs = documents()
    assert len(docs) >= 7
    for title, document in docs:
        assert validate_document(document) == [], title
        assert derive_content_text(document)


def test_documents_use_all_nine_sections_in_order():
    for title, document in documents():
        assert [s["attrs"]["type"] for s in document["content"]] == seed_demo.section_order(), title


def test_no_document_claims_ai_involvement():
    for title, document in documents():
        assert "ai_generated" not in json.dumps(document), title


def test_the_assumption_uses_the_agreed_mark():
    marked = [title for title, document in documents() if '"type": "assumption"' in json.dumps(document)]
    assert marked  # the demo shows at least one assumption to review


def test_titles_descriptions_answers_and_statuses_fit_the_rules():
    for prd in seed_demo.PRDS:
        assert validate_title(prd["title"]) == []
        description = seed_demo.description_for(prd)
        assert description is None or len(description) <= 2000
        assert set(prd["answers"]) <= {"problem", "target_users", "goals", "scope", "constraints",
                                       "success_metrics", "notes"}
        assert prd["status"] in ("draft", "in_review", "final", "assigned")
        assert prd["project"] in (None, *seed_demo.PROJECTS)


@pytest.mark.parametrize("url", ["https://hztvttyrontlunjdynsw.supabase.co", "https://example.com"])
def test_hosted_targets_are_refused_without_the_flag(monkeypatch, url):
    monkeypatch.setenv("SUPABASE_URL", url)
    with pytest.raises(SystemExit):
        seed_demo.require_local_target(allow_hosted=False)
    seed_demo.require_local_target(allow_hosted=True)  # explicit opt-in for the rollout


@pytest.mark.parametrize("url", ["http://127.0.0.1:54321", "http://host.docker.internal:54321"])
def test_local_targets_are_allowed(monkeypatch, url):
    monkeypatch.setenv("SUPABASE_URL", url)
    seed_demo.require_local_target(allow_hosted=False)
