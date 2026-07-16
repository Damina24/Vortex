"""
VORTEX AI — AI Service
Python FastAPI service for AI/ML heavy lifting:
- Creative Director (LangGraph agent)
- Performance Prediction (XGBoost)
- Brand Guard (CLIP + OCR)
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from src.api.routes import creative_director, prediction, brand_guard
from src.config.settings import settings

app = FastAPI(
    title="VORTEX AI Service",
    description="AI/ML service for VORTEX AI — Creative Operating System for Video",
    version="1.0.0",
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Health check
@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": "vortex-ai-service",
        "version": "1.0.0",
    }

# Routers
app.include_router(creative_director.router, prefix="/api/v1/ai", tags=["Creative Director"])
app.include_router(prediction.router, prefix="/api/v1/ai", tags=["Performance Prediction"])
app.include_router(brand_guard.router, prefix="/api/v1/ai", tags=["Brand Guard"])


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "src.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True,
    )