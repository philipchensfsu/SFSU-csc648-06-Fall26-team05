from datetime import datetime, timezone
from typing import Optional
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from auth import get_current_user
from common import RequestModel

router = APIRouter()

# Fixed in application code, not the DB (Section 1.6 of the M2 report).
INTAKE_QUESTION_KEYS = {
    "problem",
    "target_users",
    "goals",
    "scope",
    "constraints",
    "success_metrics",
    "notes",
}


class IntakeAnswerIn(RequestModel):
    answer_text: str = Field(default="", max_length=5000)
    skipped: bool = False


class IntakeAnswerOut(BaseModel):
    question_key: str
    answer_text: Optional[str]
    skipped: bool
    answered_at: datetime


@router.get("/api/prds/{prd_id}/intake", response_model=list[IntakeAnswerOut])
def list_intake_answers(prd_id: UUID, auth=Depends(get_current_user)):
    client = auth["client"]
    response = (
        client.table("intake_answer")
        .select("question_key, answer_text, skipped, answered_at")
        .eq("prd_id", str(prd_id))
        .execute()
    )
    return response.data


@router.put("/api/prds/{prd_id}/intake/{question_key}", response_model=IntakeAnswerOut)
def save_intake_answer(
    prd_id: UUID,
    question_key: str,
    payload: IntakeAnswerIn,
    auth=Depends(get_current_user),
):
    if question_key not in INTAKE_QUESTION_KEYS:
        raise HTTPException(status_code=400, detail=f"Unknown question: {question_key}")

    client = auth["client"]
    row = {
        "prd_id": str(prd_id),
        "question_key": question_key,
        "answer_text": payload.answer_text,
        "skipped": payload.skipped,
        "answered_at": datetime.now(timezone.utc).isoformat(),
    }
    # Unique on (prd_id, question_key), so revising an answer overwrites it.
    response = (
        client.table("intake_answer")
        .upsert(row, on_conflict="prd_id,question_key")
        .execute()
    )
    return response.data[0]
