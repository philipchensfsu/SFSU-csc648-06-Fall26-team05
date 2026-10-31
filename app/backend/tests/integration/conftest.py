"""Integration tests: real Supabase Auth, Postgres RLS and the running API.

Start the local stack first (`supabase start`, `docker compose up`), then:

    docker compose exec backend python -m pytest tests/integration -q

They are skipped when the local stack isn't running, and they refuse to run
against anything but a local address, so they can never touch production.
Each test creates its own throwaway users and deletes them afterwards.
"""

import os
import uuid
from dataclasses import dataclass
from urllib.parse import urlparse

import httpx
import psycopg
import pytest

LOCAL_HOSTS = {"127.0.0.1", "localhost", "host.docker.internal"}

SUPABASE_URL = os.environ.get("LOCAL_SUPABASE_URL", "http://127.0.0.1:54321")
API_URL = os.environ.get("NAUTILUS_API_URL", "http://localhost:8000/api")
DB_URL = os.environ.get(
    "NAUTILUS_TEST_DB_URL",
    f"postgresql://postgres:postgres@{urlparse(SUPABASE_URL).hostname}:54322/postgres",
)
# LOCAL_* are copied from SUPABASE_* by tests/conftest.py before it replaces
# those with dummies for the unit tests. The defaults are the Supabase CLI's
# public local keys: the same on every machine and only valid against the
# local stack. compose.yaml sets the same values.
ANON_KEY = os.environ.get(
    "LOCAL_SUPABASE_ANON_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9"
    ".CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0",
)
SERVICE_KEY = os.environ.get(
    "LOCAL_SUPABASE_SERVICE_ROLE_KEY",
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0"
    ".EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU",
)
# Test-only password for the throwaway users these tests create.
TEST_PASSWORD = "integration-test-password"

for _url in (SUPABASE_URL, API_URL, DB_URL):
    if urlparse(_url).hostname not in LOCAL_HOSTS:
        raise pytest.UsageError(f"Integration tests only run against a local stack, not {_url}")


@pytest.fixture(scope="session", autouse=True)
def local_stack():
    try:
        httpx.get(f"{SUPABASE_URL}/auth/v1/health", headers={"apikey": ANON_KEY}, timeout=3).raise_for_status()
        httpx.get(f"{API_URL}/health", timeout=3).raise_for_status()
    except httpx.HTTPError:
        pytest.skip("local stack not running (supabase start, docker compose up)")


@pytest.fixture(scope="session")
def db():
    with psycopg.connect(DB_URL, autocommit=True) as conn:
        yield conn


@dataclass
class User:
    id: str
    email: str
    token: str

    def api(self, method, path, **kwargs):
        """Calls the FastAPI backend as this user."""
        headers = {"Authorization": f"Bearer {self.token}"}
        return httpx.request(method, f"{API_URL}{path}", headers=headers, **kwargs)

    def rest(self, method, path, **kwargs):
        """Calls the Supabase Data API directly as this user, bypassing the backend."""
        return data_api(method, path, token=self.token, **kwargs)


def data_api(method, path, token=None, **kwargs):
    headers = {"apikey": ANON_KEY, "Prefer": "return=representation"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return httpx.request(method, f"{SUPABASE_URL}/rest/v1/{path}", headers=headers, **kwargs)


@pytest.fixture
def make_user(db):
    """make_user(role="pm", org=True) -> a signed-in throwaway User; deleted after the test.

    Every account belongs to an organization, so by default the user is the
    admin of their own new one. Pass org=False for an account with none.
    """
    admin = {"apikey": SERVICE_KEY, "Authorization": f"Bearer {SERVICE_KEY}"}
    created = []

    def make(role="pm", org=True):
        email = f"it-{uuid.uuid4().hex[:12]}@example.com"
        r = httpx.post(f"{SUPABASE_URL}/auth/v1/admin/users", headers=admin,
                       json={"email": email, "password": TEST_PASSWORD, "email_confirm": True})
        r.raise_for_status()
        user_id = r.json()["id"]
        created.append(user_id)
        db.execute("update profile set role = %s where id = %s", (role, user_id))
        if org:
            org_id = db.execute("insert into organization (name, created_by) values (%s, %s) returning id::text",
                                (f"Org of {email}", user_id)).fetchone()[0]
            db.execute("insert into organization_member (organization_id, user_id, access_role) "
                       "values (%s, %s, 'admin')", (org_id, user_id))
        r = httpx.post(f"{SUPABASE_URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON_KEY},
                       json={"email": email, "password": TEST_PASSWORD})
        r.raise_for_status()
        return User(user_id, email, r.json()["access_token"])

    yield make
    left_behind = []
    for user_id in created:
        # Organizations outlive their creator, so remove the test ones first
        # (their PRDs first: a PRD's organization can't be deleted under it).
        remove_orgs_created_by(db, user_id)
        # Cascades to the user's profile, projects, PRDs and their child rows.
        r = httpx.delete(f"{SUPABASE_URL}/auth/v1/admin/users/{user_id}", headers=admin)
        if r.status_code != 200:
            left_behind.append(f"{user_id} ({r.status_code})")
    if left_behind:
        # A row without ON DELETE (e.g. one the user created on someone
        # else's PRD) can block the delete; fail instead of leaving them.
        pytest.fail("Couldn't delete test users: " + ", ".join(left_behind))


@pytest.fixture
def make_org(db):
    """make_org(admin, *members) -> org id: admin as its admin, members as members; deleted after the test."""
    created = []

    def make(admin, *members):
        # Accounts belong to one organization: leave the ones make_user made.
        for user in (admin, *members):
            remove_orgs_created_by(db, user.id)
        org = db.execute("insert into organization (name, created_by) values ('Test org', %s) returning id::text",
                         (admin.id,)).fetchone()[0]
        created.append(org)
        db.execute("insert into organization_member (organization_id, user_id, access_role) values (%s, %s, 'admin')",
                   (org, admin.id))
        for member in members:
            db.execute("insert into organization_member (organization_id, user_id) values (%s, %s)", (org, member.id))
        return org

    yield make
    for org in created:
        db.execute("delete from prd where organization_id = %s", (org,))
        db.execute("delete from organization where id = %s", (org,))


def org_prd(db, org, creator, title="Org PRD", project_id=None):
    """A PRD in the org, created directly (the creator becomes its owner)."""
    return db.execute("insert into prd (title, owner_id, organization_id, project_id) values (%s, %s, %s, %s) "
                      "returning id::text", (title, creator.id, org, project_id)).fetchone()[0]


def add_to_prd(db, prd, user, role):
    db.execute("insert into prd_member (prd_id, user_id, role) values (%s, %s, %s)", (prd, user.id, role))


def remove_orgs_created_by(db, user_id):
    db.execute("delete from prd where organization_id in (select id from organization where created_by = %s)", (user_id,))
    db.execute("delete from organization where created_by = %s", (user_id,))
