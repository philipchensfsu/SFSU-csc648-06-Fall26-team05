from fastapi import FastAPI

from supabase_client import supabase

app = FastAPI()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db():
    # Confirms the Supabase connection works by querying the real schema.
    response = supabase.table("prds").select("*").limit(1).execute()
    return {"status": "ok", "sample": response.data}
