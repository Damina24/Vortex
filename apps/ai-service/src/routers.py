"""API routes for the AI service."""

from fastapi import APIRouter, HTTPException

from .llm import get_llm
from .schemas import (
    EnhancePromptRequest,
    EnhancePromptResponse,
    StoryboardStrategyRequest,
    StoryboardStrategyResponse,
)
from .services import enhance_scene_prompt, generate_storyboard_strategy

router = APIRouter(prefix="/v1/ai", tags=["ai"])

UNAVAILABLE_MESSAGE = (
    "No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or MOCK_LLM=true."
)


@router.post("/storyboard-strategy", response_model=StoryboardStrategyResponse)
def storyboard_strategy(req: StoryboardStrategyRequest) -> StoryboardStrategyResponse:
    provider = get_llm()
    if provider is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE_MESSAGE)
    return generate_storyboard_strategy(provider, req)


@router.post("/enhance-prompt", response_model=EnhancePromptResponse)
def enhance_prompt(req: EnhancePromptRequest) -> EnhancePromptResponse:
    provider = get_llm()
    if provider is None:
        raise HTTPException(status_code=503, detail=UNAVAILABLE_MESSAGE)
    return enhance_scene_prompt(provider, req)