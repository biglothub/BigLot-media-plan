from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Query

from api.db import get_db
from api.schemas import ScheduleCreate, ScheduleOut, ScheduleStatusUpdate

router = APIRouter(prefix="/schedule", tags=["schedule"])


def _attach_idea(rows: list[dict]) -> list[dict]:
    """Attach idea_backlog data to each schedule row."""
    if not rows:
        return rows
    backlog_ids = [r["backlog_id"] for r in rows]
    ideas_result = get_db().table("idea_backlog").select("*").in_("id", backlog_ids).execute()
    ideas_map = {i["id"]: i for i in ideas_result.data}
    for row in rows:
        row["idea"] = ideas_map.get(row["backlog_id"])
    return rows


@router.get("/today", response_model=list[ScheduleOut])
async def get_today_schedule():
    today = date.today().isoformat()
    result = (
        get_db()
        .table("production_calendar")
        .select("*")
        .eq("shoot_date", today)
        .order("created_at")
        .execute()
    )
    return _attach_idea(result.data)


@router.get("/week", response_model=list[ScheduleOut])
async def get_week_schedule():
    today = date.today()
    end = today + timedelta(days=7)
    result = (
        get_db()
        .table("production_calendar")
        .select("*")
        .gte("shoot_date", today.isoformat())
        .lte("shoot_date", end.isoformat())
        .order("shoot_date")
        .execute()
    )
    return _attach_idea(result.data)


@router.post("", response_model=ScheduleOut, status_code=201)
async def create_schedule(body: ScheduleCreate):
    # Check idea exists
    idea = get_db().table("idea_backlog").select("id").eq("id", body.backlog_id).execute()
    if not idea.data:
        raise HTTPException(status_code=404, detail="Idea not found")

    row = {
        "backlog_id": body.backlog_id,
        "shoot_date": body.shoot_date,
        "notes": body.notes,
        "status": "planned",
    }
    result = get_db().table("production_calendar").insert(row).execute()
    return _attach_idea(result.data)[0]


@router.patch("/{schedule_id}/status", response_model=ScheduleOut)
async def update_schedule_status(schedule_id: str, body: ScheduleStatusUpdate):
    result = (
        get_db()
        .table("production_calendar")
        .update({"status": body.status})
        .eq("id", schedule_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Schedule not found")
    return _attach_idea(result.data)[0]
