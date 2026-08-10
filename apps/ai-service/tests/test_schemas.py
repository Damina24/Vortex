"""Tests for request/response schema validation and prompt builders."""

import pytest

from src.llm import MockProvider
from src.prompts import build_enhance_user_prompt, build_strategy_user_prompt
from src.schemas import (
    EnhancePromptRequest,
    EnhancePromptResponse,
    StoryboardStrategyRequest,
    StoryboardStrategyResponse,
)
from src.services import enhance_scene_prompt


def test_strategy_request_requires_name():
    with pytest.raises(Exception):
        StoryboardStrategyRequest(storyboardName="")


def test_strategy_request_defaults():
    req = StoryboardStrategyRequest(storyboardName="S")
    assert req.targetPlatforms == []
    assert req.scenes == []


def test_enhance_request_defaults_aspect():
    req = EnhancePromptRequest(prompt="x")
    assert req.aspectRatio == "16:9"
    assert req.negativePrompt is None


def test_build_strategy_prompt_mentions_name():
    req = StoryboardStrategyRequest(
        storyboardName="My Show",
        scenes=[{"orderIndex": 0, "prompt": "intro", "duration": 5}],
    )
    prompt = build_strategy_user_prompt(req)
    assert "My Show" in prompt
    assert "Scene 0" in prompt


def test_build_enhance_prompt_includes_original():
    req = EnhancePromptRequest(prompt="A scene here")
    prompt = build_enhance_user_prompt(req)
    assert "A scene here" in prompt


def test_enhance_service_validates_response():
    req = EnhancePromptRequest(prompt="A robot")
    resp = enhance_scene_prompt(MockProvider(), req)
    assert isinstance(resp, EnhancePromptResponse)
    assert resp.enhancedPrompt
