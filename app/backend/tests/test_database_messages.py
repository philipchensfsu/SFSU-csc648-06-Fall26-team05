"""Routes turn database errors into readable ones by matching the exact message
the SQL raises. If a migration rewords one, the route would answer 500 instead;
these tests fail first."""

from pathlib import Path

import pytest

import main

# Every route table that maps a database message to an API error.
ERROR_TABLES = ("MEMBER_ERRORS", "COMMENT_ERRORS", "REVIEW_ERRORS", "DECISION_ERRORS", "DIRECTORY_ERRORS",
                "MEMBER_ADMIN_ERRORS")
MESSAGES = sorted({message for table in ERROR_TABLES for message in getattr(main, table, {})})


def migrations_sql() -> str:
    parents = Path(__file__).resolve().parents
    # The repo root in a checkout (CI); /supabase in the backend container.
    roots = ([parents[3] / "supabase"] if len(parents) > 3 else []) + [Path("/supabase")]
    for root in roots:
        folder = root / "migrations"
        if folder.is_dir():
            return "\n".join(path.read_text() for path in sorted(folder.glob("*.sql")))
    pytest.skip("migrations aren't available here (no repo root and no /supabase mount)")


@pytest.mark.parametrize("message", MESSAGES)
def test_each_mapped_message_is_still_raised(message):
    assert f"raise exception '{message}'" in migrations_sql()


def test_the_tables_cover_the_directory_and_member_admin_routes():
    assert main.DIRECTORY_ERRORS and main.MEMBER_ADMIN_ERRORS
