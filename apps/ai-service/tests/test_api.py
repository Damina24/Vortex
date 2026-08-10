"""Endpoint tests for the AI service API (TestClient, MockProvider)."""

from fastapi.testclient import TestClient

from src.main import app

client = TestClient(app)

STORYBOARD_PAYLOAD = {
    "storyboardName": "Q3 launch teaser",
    "projectName": "VORTEX Q3",
    "projectDescription": "A short teaser for the Q3 launch.",
    "objective": "awareness",
    "targetPlatforms": ["youtube", "tiktok", "instagram"],
    "brandContext": "Modern, bold, high contrast.",
    "scenes": [
        {"orderIndex": 0, "prompt": "Logo reveal on black", "duration": 3},
        {"orderIndex": 1, "prompt": "Product montage", "duration": 6},
    ],
}

ENHANCE_PAYLOAD = {
    "prompt": "A person running through a city",
    "aspectRatio": "9:16",
    "brandContext": "Gritty, handheld look",
}


def test_health_endpoint():
    resp = client.get("/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["service"] == "vortex-ai-service"
    assert body["provider"] == "MockProvider"


def test_storyboard_strategy_returns_valid_plan():
    resp = client.post("/v1/ai/storyboard-strategy", json=STORYBOARD_PAYLOAD)
    assert resp.status_code == 200
    plan = resp.json()
    for key in (
        "summary",
        "targetAudience",
        "tone",
        "creativeDirection",
        "scenePlan",
        "distributionNotes",
    ):
        assert key in plan
        assert len(plan["scenePlan"]) >= 1
    first = plan["scenePlan"][0]
    assert first["orderIndex"] == 0
    assert "suggestedPrompt" in first


def test_enhance_prompt_returns_enhanced_text():
    resp = client.post("/v1/ai/enhance-prompt", json=ENHANCE_PAYLOAD)
    assert resp.status_code == 200
    out = resp.json()
    assert out["enhancedPrompt"] != ""
    assert out["enhancedNegativePrompt"] != ""


def test_storyboard_strategy_validates_input():
    resp = client.post("/v1/ai/storyboard-strategy", json={})
    assert resp.status_code == 422


def test_service_unavailable_when_unconfigured(monkeypatch):
    import src.routers as routers

    def _none():
        return None

    monkeypatch.setattr(routers, "get_llm", _none)
    resp = client.post(
        "/v1/ai/storyboard-strategy", json=STORYBOARD_PAYLOAD
    )
    assert resp.status_code == 503
    assert "No LLM provider" in resp.json()["detail"]