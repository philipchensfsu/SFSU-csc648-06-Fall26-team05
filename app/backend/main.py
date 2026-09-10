from fastapi import FastAPI

from supabase_client import supabase

app = FastAPI()


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.get("/api/health/db")
def health_db():
    # Simple query to confirm the Supabase connection works.
    # Replace "healthcheck" once real tables exist.
    response = supabase.table("healthcheck").select("*").limit(1).execute()
    return {"status": "ok", "sample": response.data}
