"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Loader2, Check, X } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";
import { notifyCreditsUpdated, isInsufficientCreditsError } from "@/lib/credits-client";
import { InsufficientCreditsAlert } from "@/components/ai/insufficient-credits-alert";

interface ScenePromptEnhancerProps {
  sceneId: string;
}

interface EnhanceResult {
  prompt: string;
  negativePrompt: string | null;
}

/**
 * One-click AI prompt enhancement for a scene card. Requests the enhanced
 * prompt from the AI proxy (charges credits), shows a reviewable preview, and
 * only persists it to the scene when the user clicks Apply.
 */
export function ScenePromptEnhancer({ sceneId }: ScenePromptEnhancerProps) {
  const router = useRouter();
  const [isEnhancing, setIsEnhancing] = useState(false);
  const [isApplying, setIsApplying] = useState(false);
  const [preview, setPreview] = useState<EnhanceResult | null>(null);
  const [insufficientCreditsMessage, setInsufficientCreditsMessage] =
    useState<string | null>(null);

  async function handleEnhance() {
    setIsEnhancing(true);
    try {
      const { data } = await axios.post("/api/v1/ai/enhance-prompt", { sceneId });
      setPreview(data.data);
      setInsufficientCreditsMessage(null);
      notifyCreditsUpdated();
      toast.success(
        `Prompt enhanced — ${data.credits?.cost ?? 1} credit${
          (data.credits?.cost ?? 1) === 1 ? "" : "s"
        } used, ${data.credits?.remaining ?? "?"} remaining`
      );
    } catch (error) {
      if (isInsufficientCreditsError(error)) {
        const message =
          axios.isAxiosError(error) && error.response?.data?.error
            ? error.response.data.error
            : "You don't have enough credits for this.";
        setInsufficientCreditsMessage(message);
      } else if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to enhance prompt");
      }
    } finally {
      setIsEnhancing(false);
    }
  }

  async function handleApply() {
    if (!preview) return;
    setIsApplying(true);
    try {
      await axios.patch(`/api/v1/scenes/${sceneId}`, {
        prompt: preview.prompt,
        negativePrompt: preview.negativePrompt ?? "",
      });
      toast.success("Enhanced prompt saved");
      setPreview(null);
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Failed to save enhanced prompt");
      }
    } finally {
      setIsApplying(false);
    }
  }

  return (
    <div className="mt-3">
      {insufficientCreditsMessage ? (
        <InsufficientCreditsAlert message={insufficientCreditsMessage} />
      ) : preview ? (
        <div className="rounded-lg border border-vortex-500/40 bg-muted/40 p-3 text-sm">
          <p className="mb-1 flex items-center gap-1 text-xs font-medium text-vortex-600 dark:text-vortex-400">
            <Sparkles className="h-3 w-3" />
            Enhanced preview
          </p>
          <p className="text-muted-foreground">{preview.prompt}</p>
          {preview.negativePrompt ? (
            <p className="mt-2 text-xs italic text-muted-foreground">
              Negative: {preview.negativePrompt}
            </p>
          ) : null}
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={handleApply}
              disabled={isApplying}
              className="inline-flex items-center gap-1 rounded-md bg-vortex-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-vortex-700 disabled:opacity-50 transition-colors"
            >
              {isApplying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              {isApplying ? "Saving..." : "Apply"}
            </button>
            <button
              type="button"
              onClick={() => setPreview(null)}
              disabled={isApplying}
              className="inline-flex items-center gap-1 rounded-md border px-2.5 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-3.5 w-3.5" />
              Discard
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={handleEnhance}
          disabled={isEnhancing}
          className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium text-vortex-600 hover:border-vortex-500/50 hover:bg-vortex-50 disabled:opacity-50 transition-colors dark:text-vortex-400 dark:hover:bg-vortex-950/50"
        >
          {isEnhancing ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isEnhancing ? "Enhancing..." : "Enhance with AI"}
        </button>
      )}
    </div>
  );
}