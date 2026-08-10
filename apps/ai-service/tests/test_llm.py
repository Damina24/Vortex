"""Unit tests for the LLM provider layer (no network, no real SDKs)."""

import json

from src.llm import MockProvider, extract_json


def test_mock_strategy_is_valid_json():
    provider = MockProvider()
    raw = provider.complete(system="Strategy", user="brief")
    parsed = json.loads(raw)
    assert {
        "summary",
        "targetAudience",
        "tone",
        "creativeDirection",
        "scenePlan",
        "distributionNotes",
    } <= parsed.keys()
    assert isinstance(parsed["scenePlan"], list) and len(parsed["scenePlan"]) >= 1


def test_mock_enhance_is_valid_json():
    provider = MockProvider()
    raw = provider.complete(
        system="You are an expert AI video prompt engineer",
        user="Original scene prompt: a man walking",
    )
    parsed = json.loads(raw)
    assert "enhancedPrompt" in parsed
    assert "enhancedNegativePrompt" in parsed


def test_extract_json_handles_fenced_block():
    fenced = "```json\n{\"a\": 1}\n```"
    assert extract_json(fenced) == {"a": 1}


def test_extract_json_handles_prose_around_json():
    prose = "Here is the data:\n{\"k\": \"v\"}\nThat's it."
    assert extract_json(prose) == {"k": "v"}


def test_extract_json_raises_on_non_json():
    import pytest

    with pytest.raises(ValueError):
        extract_json("definitely not json")