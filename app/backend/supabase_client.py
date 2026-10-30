import os

from dotenv import load_dotenv
from supabase import Client, create_client

load_dotenv()

SUPABASE_URL = os.environ["SUPABASE_URL"]
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
SUPABASE_ANON_KEY = os.environ["SUPABASE_ANON_KEY"]

# Service-role client: bypasses Row Level Security entirely. Only use it for
# work that must act outside any single user's permissions (here, just
# verifying access tokens). Never use it to read/write app data on a user's
# behalf -- use user_client() instead so Postgres RLS enforces access.
# The one exception is the save_prd database function (prd_save.py), which
# only the service role may call and which checks the verified user's
# permissions itself with the same helpers RLS uses.
supabase: Client = create_client(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)


def user_client(access_token: str) -> Client:
    """A client scoped to one user's access token, so every request goes
    through Postgres RLS as that user instead of the backend re-implementing
    authorization checks in Python."""
    client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    client.postgrest.auth(access_token)
    return client
