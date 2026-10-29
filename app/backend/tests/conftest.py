import os
import sys

# Dummy values so importing main never needs a real Supabase or a .env file.
# load_dotenv doesn't override variables that are already set.
os.environ["SUPABASE_URL"] = "http://localhost:1"
os.environ["SUPABASE_SERVICE_ROLE_KEY"] = "test-service-key"
os.environ["SUPABASE_ANON_KEY"] = "test-anon-key"

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
