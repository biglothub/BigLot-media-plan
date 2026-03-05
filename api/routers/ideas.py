from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import httpx
from fastapi import APIRouter, HTTPException, Query

from api.db import get_db
from api.schemas import IdeaCreate, IdeaOut, IdeaUpdate

router = APIRouter(prefix="/ideas", tags=["ideas"])


def _generate_idea_code() -> str:
    date_part = datetime.now(timezone.utc).strftime("%Y%m%d")
    rand_part = uuid4().hex[:8]
    return f"BL-{date_part}-{rand_part}"


@router.get("", response_model=list[IdeaOut])
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


@router.get("/{idea_id}", response_model=IdeaOut)
async def get_idea(idea_id: str):
    result = get_db().table("idea_backlog").select("*").eq("id", idea_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Idea not found")
    return result.data[0]


@router.post("", response_model=IdeaOut, status_code=201)
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

    # Auto-enrich if URL is provided and title is missing
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


@router.patch("/{idea_id}", response_model=IdeaOut)
async def update_idea(idea_id: str, body: IdeaUpdate):
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = get_db().table("idea_backlog").update(updates).eq("id", idea_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Idea not found")
    return result.data[0]


@router.delete("/{idea_id}", status_code=204)
async def delete_idea(idea_id: str):
    get_db().table("idea_backlog").delete().eq("id", idea_id).execute()


async def _enrich_url(url: str) -> dict | None:
    """Call the SvelteKit enrich endpoint to extract metadata from a URL."""
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
