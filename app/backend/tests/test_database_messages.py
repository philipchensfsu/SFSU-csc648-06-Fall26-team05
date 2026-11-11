"""Routes turn database errors into readable ones by matching the exact message
the SQL raises. If a migration rewords one, the route would answer 500 instead;
these tests fail first."""

from pathlib import Path

import pytest

from routes import comments, directory_admin, prd_members, reviews

# Every route table that maps a database message to an API error.
ERROR_TABLES = (prd_members.MEMBER_ERRORS, comments.COMMENT_ERRORS, reviews.REVIEW_ERRORS, reviews.DECISION_ERRORS,
                directory_admin.DIRECTORY_ERRORS, directory_admin.MEMBER_ADMIN_ERRORS)
MESSAGES = sorted({message for table in ERROR_TABLES for message in table})


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
    assert directory_admin.DIRECTORY_ERRORS and directory_admin.MEMBER_ADMIN_ERRORS
