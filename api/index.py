from fastapi import FastAPI

from api.routers import ideas, schedule, summary

app = FastAPI(
    title="BigLot Media Plan API",
    description="API for OpenClaw to manage content ideas, schedules, and daily summaries.",
    version="1.0.0",
)

app.include_router(ideas.router)
app.include_router(schedule.router)
app.include_router(summary.router)


@app.get("/")
async def health():
    return {"status": "ok", "service": "BigLot Media Plan API"}
