"""Health-check routes used by monitoring and deployment checks."""

from fastapi import APIRouter, HTTPException

from supabase_client import supabase

router = APIRouter()


@router.get("/api/health")
def health():
    """Report that the API process is up."""
    return {"status": "ok"}


@router.get("/api/health/db")
def health_db():
    """Report whether the database can be reached.

    Raises:
        HTTPException: 503 if the Supabase query fails.
    """
    # Confirms the Supabase connection works by querying the real schema.
    # This route is public and the service-role client bypasses RLS, so it
    # only reports reachability and never returns row data.
    try:
        supabase.table("prd").select("id").limit(1).execute()
    except Exception:
        raise HTTPException(status_code=503, detail="Database unreachable")
    return {"status": "ok"}
