from __future__ import annotations

from datetime import date, timedelta

from fastapi import APIRouter

from api.db import get_db
from api.schemas import DailySummary

router = APIRouter(tags=["summary"])


def _build_summary() -> dict:
    db = get_db()
    today = date.today()
    yesterday = today - timedelta(days=1)

    # New ideas (last 24h)
    new_ideas = (
        db.table("idea_backlog")
        .select("*")
        .gte("created_at", yesterday.isoformat())
        .order("created_at", desc=True)
        .execute()
    )

    # Shoots today
    shoots_today = (
        db.table("production_calendar")
        .select("*")
        .eq("shoot_date", today.isoformat())
        .execute()
    )

    # In progress (not planned, not published)
    in_progress = (
        db.table("production_calendar")
        .select("*")
        .neq("status", "planned")
        .neq("status", "published")
        .order("shoot_date")
        .execute()
    )

    # Attach ideas to schedule rows
    all_schedule = shoots_today.data + in_progress.data
    if all_schedule:
        backlog_ids = list({r["backlog_id"] for r in all_schedule})
        ideas_result = db.table("idea_backlog").select("*").in_("id", backlog_ids).execute()
        ideas_map = {i["id"]: i for i in ideas_result.data}
        for row in shoots_today.data:
            row["idea"] = ideas_map.get(row["backlog_id"])
        for row in in_progress.data:
            row["idea"] = ideas_map.get(row["backlog_id"])

    return {
        "date": today.isoformat(),
        "new_ideas_count": len(new_ideas.data),
        "new_ideas": new_ideas.data,
        "shoots_today": shoots_today.data,
        "in_progress": in_progress.data,
    }


@router.get("/daily-summary", response_model=DailySummary)
async def get_daily_summary():
    """Get daily summary. OpenClaw can call this and send the result to Telegram."""
    return _build_summary()
