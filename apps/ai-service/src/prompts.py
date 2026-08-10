"""Prompt templates and prompt builders for the AI service."""

from .schemas import EnhancePromptRequest, StoryboardStrategyRequest

STRATEGY_SYSTEM_PROMPT = """You are VORTEX AI, a senior video advertising strategist and creative director. You transform briefs and raw scene outlines into a complete, production-ready video strategy.

Return ONLY a JSON object with exactly this structure:
{
  "summary": "2-3 sentence overview of the video strategy",
  "targetAudience": "Who this video is for and what motivates them",
  "tone": "Overall tone and mood of the video",
  "creativeDirection": "Visual, narrative, and pacing direction",
  "scenePlan": [
    {
      "orderIndex": 0,
      "goal": "What this scene must accomplish",
      "suggestedPrompt": "A concrete, production-ready video generation prompt for this scene",
      "notes": "Timing, transitions, or post-production notes"
    }
  ],
  "distributionNotes": "Platform-specific suggestions (formats, crops, hooks)"
}
Respond with valid JSON only."""

ENHANCE_SYSTEM_PROMPT = """You are an expert AI video prompt engineer for VORTEX. You expand basic scene ideas into rich, production-ready video generation prompts (shot type, camera movement, lighting, subject, composition, pacing) without inventing elements the user did not ask for.

Return ONLY a JSON object with this structure:
{
  "enhancedPrompt": "The fully enriched generation prompt",
  "enhancedNegativePrompt": "Negative prompt guarding against common video artifacts"
}
Respond with valid JSON only."""


def _build_context_block(req: StoryboardStrategyRequest) -> str:
    lines = []
    if req.projectName:
        lines.append(f"Project: {req.projectName}")
    if req.projectDescription:
        lines.append(f"Project description: {req.projectDescription}")
    if req.objective:
        lines.append(f"Objective: {req.objective}")
    if req.targetPlatforms:
        lines.append(f"Target platforms: {', '.join(req.targetPlatforms)}")
    if req.brandContext:
        lines.append(f"Brand context:\n{req.brandContext}")
    return "\n".join(lines)


def build_strategy_user_prompt(req: StoryboardStrategyRequest) -> str:
    context = _build_context_block(req)
    scene_lines = "\n".join(
        (
            f"- Scene {s.orderIndex}: {s.prompt}"
            + (
                f" [duration {s.duration}s, {s.aspectRatio}]"
                if s.duration or s.aspectRatio
                else ""
            )
        )
        for s in req.scenes
    )
    return (
        f"Storyboard: {req.storyboardName}\n\n"
        f"{context}\n\n"
        f"Existing scene outline:\n{scene_lines if scene_lines else '(no scenes defined yet)'}\n\n"
        "Produce the strategy JSON described in the system prompt."
    )


def build_enhance_user_prompt(req: EnhancePromptRequest) -> str:
    parts = [f"Original scene prompt: {req.prompt}"]
    if req.negativePrompt:
        parts.append(f"Original negative prompt: {req.negativePrompt}")
    parts.append(f"Aspect ratio: {req.aspectRatio or '16:9'}")
    if req.brandContext:
        parts.append(f"Brand context:\n{req.brandContext}")
    parts.append("Produce the enhance JSON described in the system prompt.")
    return "\n".join(parts)