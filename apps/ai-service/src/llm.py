"""LLM providers and provider factory.

The service is provider-agnostic. OpenAI and Anthropic are supported via their
official SDKs. MockProvider returns deterministic, schema-compatible responses
for offline development and testing (opt-in via MOCK_LLM=true).
"""

import json
import re
from abc import ABC, abstractmethod
from typing import Optional

from .config import Settings, get_settings


class LLMProvider(ABC):
    """Minimal chat-completion interface implemented by every provider."""

    @abstractmethod
    def complete(self, *, system: str, user: str, json_mode: bool = True) -> str:
        """Return the model's text response for the given messages."""


class OpenAIProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        from openai import OpenAI

        self._client = OpenAI(api_key=settings.openai_api_key)
        self._model = settings.openai_model

    def complete(self, *, system: str, user: str, json_mode: bool = True) -> str:
        kwargs = {
            "model": self._model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "temperature": 0.7,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}
        response = self._client.chat.completions.create(**kwargs)
        return response.choices[0].message.content or ""


class AnthropicProvider(LLMProvider):
    def __init__(self, settings: Settings) -> None:
        import anthropic

        self._client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        self._model = settings.anthropic_model

    def complete(self, *, system: str, user: str, json_mode: bool = True) -> str:
        message = self._client.messages.create(
                        model=self._model,
            max_tokens=2048,
            system=system,
            messages=[{"role": "user", "content": user}],
        )
        return "".join(
            block.text for block in message.content if getattr(block, "type", "") == "text"
        )


class MockProvider(LLMProvider):
    """Deterministic provider used when MOCK_LLM=true (dev/test only)."""

    def complete(self, *, system: str, user: str, json_mode: bool = True) -> str:
        if "prompt engineer" in system.lower():
            return self._mock_enhance(user)
        return self._mock_strategy()

    @staticmethod
    def _mock_strategy() -> str:
        return json.dumps(
            {
                "summary": (
                    "A tight, conversion-focused campaign that hooks within the first "
                    "two seconds and reinforces the value proposition with clean product visuals."
                ),
                "targetAudience": "Indie creators and small teams evaluating VORTEX for faster video production.",
                "tone": "aspirational, confident, concise",
                "creativeDirection": (
                    "Bold motion typography over studio product footage with a warm, energetic "
                    "color grade and quick, rhythmic cuts."
                ),
                "scenePlan": [
                    {
                        "orderIndex": 0,
                        "goal": "Hook the viewer immediately",
                        "suggestedPrompt": (
                            "Kinetic typography intro revealing 'Your video. Your rules.' over a dark studio backdrop, "
                            "camera quick zoom-in, high contrast rim lighting."
                        ),
                        "notes": "First 2 seconds; end on a hard smash cut.",
                    },
                    {
                        "orderIndex": 1,
                        "goal": "Show product value",
                        "suggestedPrompt": (
                            "Product close-ups on a clean gradient podium, smooth orbit camera move, "
                            "macro details, shallow depth of field."
                        ),
                        "notes": "5-6 seconds; subtle parallax between cuts.",
                    },
                    {
                        "orderIndex": 2,
                        "goal": "Call to action",
                        "suggestedPrompt": (
                            "Final screen: product center frame with CTA text reveal, camera slow push-in, "
                            "bright accent flare on the button."
                        ),
                        "notes": "Lock graphics and logo placement for brand consistency.",
                    },
                ],
                "distributionNotes": (
                    "16:9 master for YouTube/ads; crop to 9:16 and 1:1 with reframed subjects. "
                    "Keep captions under 58 chars for social."
                ),
            }
        )

    @staticmethod
    def _mock_enhance(user: str) -> str:
        match = re.search(r"Original scene prompt:\s*(.+)", user)
        original = match.group(1).strip() if match else "A cinematic scene."
        return json.dumps(
            {
                "enhancedPrompt": (
                    f"{original} — cinematic 4K, smooth slow camera push-in, natural volumetric "
                    "lighting, shallow depth of field, rich filmic color grade, subtle grain, "
                    "clean composition with strong subject separation."
                ),
                "enhancedNegativePrompt": (
                    "blurry footage, oversaturated colors, warped faces, flicker, duplicated subjects, "
                    "watermark, low resolution"
                ),
            }
        )


def get_llm() -> Optional[LLMProvider]:
    """Resolve the active provider, or None when no provider is configured."""
    settings = get_settings()
    if settings.mock_llm:
        return MockProvider()
    if settings.openai_api_key:
        return OpenAIProvider(settings)
    if settings.anthropic_api_key:
        return AnthropicProvider(settings)
    return None


def extract_json(text: str) -> dict:
    """Parse a JSON object from model output, tolerating fenced code blocks and prose."""
    text = text.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*|```\s*$", "", text, flags=re.MULTILINE).strip()
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, flags=re.DOTALL)
        if match:
            return json.loads(match.group(0))
        raise ValueError("Provider response could not be parsed as JSON")