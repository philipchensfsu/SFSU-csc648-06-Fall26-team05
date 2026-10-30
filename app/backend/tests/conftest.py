import os
import sys

# The integration tests (tests/integration) need the real local-stack
# settings, so keep them as LOCAL_* before replacing them below.
for name in ("SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"):
    if name in os.environ:
        os.environ.setdefault(f"LOCAL_{name}", os.environ[name])

# Dummy values so importing main never needs a real Supabase or a .env file.
# load_dotenv doesn't override variables that are already set.
os.environ["SUPABASE_URL"] = "http://localhost:1"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-key"
os.environ["SUPABASE_ANON_KEY"] = "test-anon-key"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
