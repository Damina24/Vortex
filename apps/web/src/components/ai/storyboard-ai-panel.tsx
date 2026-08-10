"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Sparkles,
  Wand2,
  Loader2,
  CheckCircle2,
  Target,
  Megaphone,
  MonitorSmartphone,
} from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";
import type { AiStoryboardStrategy } from "@/types";

/**
 * AI Creative Strategy panel for a storyboard detail page. Generates a full
 * creative strategy via /api/v1/ai/storyboard-strategy and can materialize the
 * returned scene plan as real scenes.
 */
export function StoryboardAiPanel({
  storyboardId,
  startIndex,
  initialStrategy,
}: {
  storyboardId: string;
  startIndex: number;
  initialStrategy?: AiStoryboardStrategy | null;
}) {
  const router = useRouter();
  const [strategy, setStrategy] = useState<AiStoryboardStrategy | null>(
    initialStrategy ?? null
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [objective, setObjective] = useState("");
  const [platformsInput, setPlatformsInput] = useState("");
  const [brandContext, setBrandContext] = useState("");

  async function handleGenerate() {
    setIsGenerating(true);
    try {
      const payload: Record<string, unknown> = { storyboardId };
      if (objective) {
        payload.objective = objective;
      }
      const platforms = platformsInput
        .split(",")
        .map((platform) => platform.trim())
        .filter(Boolean);
      if (platforms.length > 0) {
        payload.targetPlatforms = platforms;
      }
      if (brandContext.trim()) {
        payload.brandContext = brandContext.trim();
      }

      const response = await axios.post(
        "/api/v1/ai/storyboard-strategy",
        payload
      );
      setStrategy(response.data.data);
      setApplied(false);
      const credits = response.data?.credits;
      toast.success(
        credits
          ? `AI strategy generated (-${credits.cost} credit${
              credits.cost === 1 ? "" : "s"
            }, ${credits.remaining} remaining)`
          : "AI strategy generated!"
      );
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.error
          ? error.response.data.error
          : "Failed to generate strategy";
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  }

  async function handleApplyPlan() {
    if (!strategy) return;
    setIsApplying(true);
    try {
      for (const item of strategy.scenePlan) {
        await axios.post("/api/v1/scenes", {
          storyboardId,
          orderIndex: startIndex + item.orderIndex,
          duration: 5,
          prompt: item.suggestedPrompt,
          aspectRatio: "16:9",
        });
      }
      setApplied(true);
      toast.success("Scenes created from the AI plan!");
      router.refresh();
    } catch (error) {
      const message =
        axios.isAxiosError(error) && error.response?.data?.error
          ? error.response.data.error
          : "Failed to create scenes";
      toast.error(message);
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <section className="rounded-xl border p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Sparkles className="h-5 w-5 text-vortex-500" />
            AI Creative Strategy
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Generate a full strategy — audience, tone, direction, and a
            scene-by-scene plan — from this storyboard and its project.
          </p>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isGenerating}
          className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGenerating ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Wand2 className="h-4 w-4" />
          )}
          {isGenerating
            ? "Generating..."
            : strategy
              ? "Regenerate Strategy"
              : "Generate Strategy"}
        </button>
      </div>

      <details className="mt-4 text-sm">
        <summary className="cursor-pointer font-medium text-muted-foreground hover:text-foreground">
          Customize the brief (optional)
        </summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <label
              htmlFor="ai-objective"
              className="text-xs font-medium text-muted-foreground"
            >
              Objective
            </label>
            <select
              id="ai-objective"
              value={objective}
              onChange={(e) => setObjective(e.target.value)}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">Use project objective</option>
              <option value="conversion">Conversion</option>
              <option value="awareness">Awareness</option>
              <option value="engagement">Engagement</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label
              htmlFor="ai-platforms"
              className="text-xs font-medium text-muted-foreground"
            >
              Target platforms
            </label>
            <input
              id="ai-platforms"
              type="text"
              value={platformsInput}
              onChange={(e) => setPlatformsInput(e.target.value)}
              placeholder="youtube, tiktok, instagram"
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </div>
        </div>
        <div className="mt-3 space-y-1.5">
          <label
            htmlFor="ai-brand-context"
            className="text-xs font-medium text-muted-foreground"
          >
            Brand context
          </label>
          <textarea
            id="ai-brand-context"
            rows={2}
            value={brandContext}
            onChange={(e) => setBrandContext(e.target.value)}
            placeholder="Modern, bold, high contrast. Avoid wordy UI screenshots."
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-none"
          />
        </div>
      </details>

      {strategy ? (
        <div className="mt-6 space-y-6">
          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Summary
            </h3>
            <p className="text-sm leading-relaxed">{strategy.summary}</p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-lg border p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Target className="h-3.5 w-3.5" />
                Target Audience
              </p>
              <p className="mt-2 text-sm">{strategy.targetAudience}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <Megaphone className="h-3.5 w-3.5" />
                Tone
              </p>
              <p className="mt-2 text-sm capitalize">{strategy.tone}</p>
            </div>
            <div className="rounded-lg border p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <MonitorSmartphone className="h-3.5 w-3.5" />
                Distribution
              </p>
              <p className="mt-2 text-sm">{strategy.distributionNotes}</p>
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Creative Direction
            </h3>
            <p className="text-sm leading-relaxed">
              {strategy.creativeDirection}
            </p>
          </div>

          {strategy.scenePlan.length > 0 && (
            <div>
              <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Scene Plan
              </h3>
              <ol className="space-y-3">
                {strategy.scenePlan.map((item) => (
                  <li key={item.orderIndex} className="rounded-lg border p-4">
                    <p className="text-sm font-semibold">
                      Scene {startIndex + item.orderIndex + 1} — {item.goal}
                    </p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.suggestedPrompt}
                    </p>
                    {item.notes && (
                      <p className="mt-2 text-xs text-muted-foreground/80">
                        {item.notes}
                      </p>
                    )}
                  </li>
                ))}
              </ol>
              <button
                type="button"
                onClick={handleApplyPlan}
                disabled={isApplying || applied}
                className="mt-4 inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium text-muted-foreground hover:border-vortex-500/50 hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isApplying ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : applied ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <Wand2 className="h-4 w-4" />
                )}
                {isApplying
                  ? "Creating scenes..."
                  : applied
                    ? "Scenes created from plan"
                    : "Create Scenes from Plan"}
              </button>
            </div>
          )}
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          {isGenerating
            ? "Working on it — this can take up to a minute..."
            : "No strategy yet. Generate one to get a scene-by-scene creative plan."}
        </p>
      )}
    </section>
  );
}