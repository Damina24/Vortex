"""VORTEX AI Service — FastAPI application.

LLM-powered creative operations for storyboards:
- POST /v1/ai/storyboard-strategy — full creative strategy for a storyboard
- POST /v1/ai/enhance-prompt     — production-ready scene prompt enhancement
- GET  /health                   — liveness / provider status
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import get_settings
from .llm import get_llm
from .routers import router as ai_router

logger = logging.getLogger("uvicorn.error")

settings = get_settings()


@asynccontextmanager
async def lifespan(_app: FastAPI):
    provider = get_llm()
    if provider is None:
        logger.warning(
            "No LLM provider configured — set OPENAI_API_KEY, ANTHROPIC_API_KEY, "
            "or MOCK_LLM=true for offline development."
        )
    else:
        logger.info("LLM provider active: %s", provider.__class__.__name__)
    yield


app = FastAPI(
    title=settings.app_name,
    description="AI/ML service for VORTEX AI — Creative Operating System for Video",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health():
    provider = get_llm()
    return {
        "status": "ok",
        "service": "vortex-ai-service",
        "version": settings.app_version,
        "provider": provider.__class__.__name__ if provider else "none",
    }


app.include_router(ai_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("src.main:app", host="0.0.0.0", port=8000, reload=True)