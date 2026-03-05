from __future__ import annotations

import os
from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

import httpx
from fastapi import FastAPI, APIRouter, HTTPException, Query
from pydantic import BaseModel, Field
from supabase import create_client, Client


# ── Config ────────────────────────────────────────────

SUPABASE_URL = os.environ.get("PUBLIC_SUPABASE_URL", "")
SUPABASE_ANON_KEY = os.environ.get("PUBLIC_SUPABASE_ANON_KEY", "")

_client: Client | None = None


def get_db() -> Client:
    global _client
    if _client is None:
        _client = create_client(SUPABASE_URL, SUPABASE_ANON_KEY)
    return _client


# ── Schemas ───────────────────────────────────────────

Platform = Literal["youtube", "facebook", "instagram", "tiktok"]
ContentType = Literal["video", "post", "image"]
ProductionStage = Literal["planned", "scripting", "shooting", "editing", "published"]


class IdeaCreate(BaseModel):
    url: str | None = None
    platform: Platform = "youtube"
    content_type: ContentType = "video"
    title: str | None = None
    description: str | None = None
    author_name: str | None = None
    thumbnail_url: str | None = None
    notes: str | None = None


class IdeaUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    notes: str | None = None
    status: str | None = None


class IdeaOut(BaseModel):
    id: str
    idea_code: str
    url: str | None = None
    platform: str
    content_type: str
    title: str | None = None
    description: str | None = None
    author_name: str | None = None
    thumbnail_url: str | None = None
    published_at: str | None = None
    view_count: int | None = None
    like_count: int | None = None
    comment_count: int | None = None
    share_count: int | None = None
    save_count: int | None = None
    notes: str | None = None
    status: str
    created_at: str


class ScheduleCreate(BaseModel):
    backlog_id: str
    shoot_date: str = Field(..., description="YYYY-MM-DD")
    notes: str | None = None


class ScheduleStatusUpdate(BaseModel):
    status: ProductionStage


class ScheduleOut(BaseModel):
    id: str
    backlog_id: str
    shoot_date: str
    status: str
    notes: str | None = None
    created_at: str
    idea: IdeaOut | None = None


class DailySummary(BaseModel):
    date: str
    new_ideas_count: int
    new_ideas: list[IdeaOut]
    shoots_today: list[ScheduleOut]
    in_progress: list[ScheduleOut]


# ── App ───────────────────────────────────────────────

app = FastAPI(
    title="BigLot Media Plan API",
    description="API for OpenClaw to manage content ideas, schedules, and daily summaries.",
    version="1.0.0",
)

ideas_router = APIRouter(prefix="/ideas", tags=["ideas"])
schedule_router = APIRouter(prefix="/schedule", tags=["schedule"])
summary_router = APIRouter(tags=["summary"])


# ── Helpers ───────────────────────────────────────────

def _generate_idea_code() -> str:
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand_part = uuid4().hex[:8]
    return f"BL-{date_part}-{rand_part}"


async def _enrich_url(url: str) -> dict | None:
    try:
        async with httpx.AsyncClient(timeout=20) as client:
            resp = await client.get(
                "https://biglot-media-plan.vercel.app/api/enrich",
                params={"url": url},
            )
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


def _attach_idea(rows: list[dict]) -> list[dict]:
    if not rows:
        return rows
    backlog_ids = [r["backlog_id"] for r in rows]
    ideas_result = get_db().table("idea_backlog").select("*").in_("id", backlog_ids).execute()
    ideas_map = {i["id"]: i for i in ideas_result.data}
    for row in rows:
        row["idea"] = ideas_map.get(row["backlog_id"])
    return rows


# ── Ideas Routes ──────────────────────────────────────

@ideas_router.get("", response_model=list[IdeaOut])
async def list_ideas(
    status: str | None = Query(None),
    platform: str | None = Query(None),
    limit: int = Query(50, le=100),
):
    query = get_db().table("idea_backlog").select("*").order("created_at", desc=True).limit(limit)
    if status:
        query = query.eq("status", status)
    if platform:
        query = query.eq("platform", platform)
    result = query.execute()
    return result.data


@ideas_router.get("/{idea_id}", response_model=IdeaOut)
async def get_idea(idea_id: str):
    result = get_db().table("idea_backlog").select("*").eq("id", idea_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Idea not found")
    return result.data[0]


@ideas_router.post("", response_model=IdeaOut, status_code=201)
async def create_idea(body: IdeaCreate):
    row: dict = {
        "idea_code": _generate_idea_code(),
        "platform": body.platform,
        "content_type": body.content_type,
        "title": body.title,
        "description": body.description,
        "author_name": body.author_name,
        "thumbnail_url": body.thumbnail_url,
        "notes": body.notes,
        "url": body.url,
        "status": "new",
    }

    if body.url and not body.title:
        enriched = await _enrich_url(body.url)
        if enriched:
            row["platform"] = enriched.get("platform", row["platform"])
            row["content_type"] = enriched.get("contentType", row["content_type"])
            row["title"] = enriched.get("title") or row["title"]
            row["description"] = enriched.get("description") or row["description"]
            row["author_name"] = enriched.get("authorName") or row["author_name"]
            row["thumbnail_url"] = enriched.get("thumbnailUrl") or row["thumbnail_url"]
            row["published_at"] = enriched.get("publishedAt")
            metrics = enriched.get("metrics", {})
            row["view_count"] = metrics.get("views")
            row["like_count"] = metrics.get("likes")
            row["comment_count"] = metrics.get("comments")
            row["share_count"] = metrics.get("shares")
            row["save_count"] = metrics.get("saves")

    result = get_db().table("idea_backlog").insert(row).execute()
    return result.data[0]


@ideas_router.patch("/{idea_id}", response_model=IdeaOut)
async def update_idea(idea_id: str, body: IdeaUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = get_db().table("idea_backlog").update(updates).eq("id", idea_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Idea not found")
    return result.data[0]


@ideas_router.delete("/{idea_id}", status_code=204)
async def delete_idea(idea_id: str):
    get_db().table("idea_backlog").delete().eq("id", idea_id).execute()


# ── Schedule Routes ───────────────────────────────────

@schedule_router.get("/today", response_model=list[ScheduleOut])
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


@schedule_router.get("/week", response_model=list[ScheduleOut])
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


@schedule_router.post("", response_model=ScheduleOut, status_code=201)
async def create_schedule(body: ScheduleCreate):
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


@schedule_router.patch("/{schedule_id}/status", response_model=ScheduleOut)
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


# ── Summary Routes ────────────────────────────────────

def _build_summary() -> dict:
    db = get_db()
    today = date.today()
    yesterday = today - timedelta(days=1)

    new_ideas = (
        db.table("idea_backlog")
        .select("*")
        .gte("created_at", yesterday.isoformat())
        .order("created_at", desc=True)
        .execute()
    )

    shoots_today = (
        db.table("production_calendar")
        .select("*")
        .eq("shoot_date", today.isoformat())
        .execute()
    )

    in_progress = (
        db.table("production_calendar")
        .select("*")
        .neq("status", "planned")
        .neq("status", "published")
        .order("shoot_date")
        .execute()
    )

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


@summary_router.get("/daily-summary", response_model=DailySummary)
async def get_daily_summary():
    return _build_summary()


# ── Register Routers ─────────────────────────────────

app.include_router(ideas_router)
app.include_router(schedule_router)
app.include_router(summary_router)


@app.get("/")
async def health():
    return {"status": "ok", "service": "BigLot Media Plan API"}
