"""Business logic for the AI service endpoints."""

from .llm import LLMProvider, extract_json
from .prompts import (
    ENHANCE_SYSTEM_PROMPT,
    STRATEGY_SYSTEM_PROMPT,
    build_enhance_user_prompt,
    build_strategy_user_prompt,
)
from .schemas import (
    EnhancePromptRequest,
    EnhancePromptResponse,
    StoryboardStrategyRequest,
    StoryboardStrategyResponse,
)


def generate_storyboard_strategy(
    provider: LLMProvider, req: StoryboardStrategyRequest
) -> StoryboardStrategyResponse:
    raw = provider.complete(
        system=STRATEGY_SYSTEM_PROMPT,
        user=build_strategy_user_prompt(req),
        json_mode=True,
    )
    return StoryboardStrategyResponse.model_validate(extract_json(raw))


def enhance_scene_prompt(
    provider: LLMProvider, req: EnhancePromptRequest
) -> EnhancePromptResponse:
    raw = provider.complete(
        system=ENHANCE_SYSTEM_PROMPT,
        user=build_enhance_user_prompt(req),
        json_mode=True,
    )
    return EnhancePromptResponse.model_validate(extract_json(raw))