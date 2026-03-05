from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


Platform = Literal["youtube", "facebook", "instagram", "tiktok"]
ContentType = Literal["video", "post", "image"]
ProductionStage = Literal["planned", "scripting", "shooting", "editing", "published"]


# ── Ideas ─────────────────────────────────────────────

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
    url: str | None
    platform: str
    content_type: str
    title: str | None
    description: str | None
    author_name: str | None
    thumbnail_url: str | None
    published_at: str | None
    view_count: int | None
    like_count: int | None
    comment_count: int | None
    share_count: int | None
    save_count: int | None
    notes: str | None
    status: str
    created_at: str


# ── Schedule ──────────────────────────────────────────

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
    notes: str | None
    created_at: str
    idea: IdeaOut | None = None


# ── Daily Summary ─────────────────────────────────────

class DailySummary(BaseModel):
    date: str
    new_ideas_count: int
    new_ideas: list[IdeaOut]
    shoots_today: list[ScheduleOut]
    in_progress: list[ScheduleOut]
