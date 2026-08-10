"""Pydantic request/response schemas for the AI service API."""

from typing import Optional

from pydantic import BaseModel, Field


class SceneContext(BaseModel):
    orderIndex: int = Field(ge=0)
    prompt: str = Field(min_length=1)
    duration: Optional[int] = Field(default=5, ge=1)
    aspectRatio: Optional[str] = "16:9"


class StoryboardStrategyRequest(BaseModel):
    storyboardName: str = Field(min_length=1, max_length=255)
    projectName: Optional[str] = None
    projectDescription: Optional[str] = None
    objective: Optional[str] = None  # conversion | awareness | engagement
    targetPlatforms: list[str] = []
    brandContext: Optional[str] = None
    scenes: list[SceneContext] = []


class ScenePlanItem(BaseModel):
    orderIndex: int = Field(ge=0)
    goal: str
    suggestedPrompt: str
    notes: str = ""


class StoryboardStrategyResponse(BaseModel):
    summary: str
    targetAudience: str
    tone: str
    creativeDirection: str
    scenePlan: list[ScenePlanItem]
    distributionNotes: str = ""


class EnhancePromptRequest(BaseModel):
    prompt: str = Field(min_length=1)
    negativePrompt: Optional[str] = None
    aspectRatio: Optional[str] = "16:9"
    brandContext: Optional[str] = None


class EnhancePromptResponse(BaseModel):
    enhancedPrompt: str
    enhancedNegativePrompt: str = ""