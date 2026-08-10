"""Shared pytest fixtures for the VORTEX AI service test suite.

Tests use the deterministic MockProvider so they run fully offline and
without needing real LLM API keys.
"""

import pytest

from src.config import get_settings


@pytest.fixture(autouse=True)
def _mock_llm(monkeypatch):
    """Force the service into offline MockProvider mode for every test."""
    monkeypatch.setenv("MOCK_LLM", "true")
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    get_settings.cache_clear()
    yield
    get_settings.cache_clear()
