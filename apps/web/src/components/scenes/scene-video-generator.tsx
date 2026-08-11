"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { CheckCircle2, Clapperboard, RefreshCw, XCircle } from "lucide-react";
import { notifyCreditsUpdated } from "@/lib/credits-client";
import { InsufficientCreditsAlert } from "@/components/ai/insufficient-credits-alert";

export interface GeneratedVideoRef {
  id: string;
  url: string;
  thumbnailUrl?: string | null;
  name: string;
  mimeType?: string | null;
}

/**
 * "Generate video" control for a scene. POSTs to the generation-jobs API
 * (which charges credits and — in mock mode — renders synchronously), then
 * refreshes the server component list so the new asset and status appear.
 * Insufficient-credit responses (402) surface the inline buy-credits alert.
 */
export function SceneVideoGenerator({
  sceneId,
  status,
  generatedVideo,
  creditCost,
}: {
  sceneId: string;
  status: "pending" | "generating" | "completed" | "failed";
  generatedVideo: GeneratedVideoRef | null;
  creditCost: number;
}) {
  const router = useRouter();
  const [isRendering, setIsRendering] = useState(false);
  const [insufficientMessage, setInsufficientMessage] = useState<string | null>(
    null,
  );

  async function handleGenerate() {
    setIsRendering(true);
    setInsufficientMessage(null);

    try {
      await axios.post("/api/v1/generation-jobs", { sceneId });
      toast.success("Video rendered");
      notifyCreditsUpdated();
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 402) {
        setInsufficientMessage(
          error.response?.data?.error ||
            "Video renders cost credits. Top up and try again.",
        );
      } else if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error("Video generation failed. Try again.");
      }
    } finally {
      setIsRendering(false);
    }
  }

  if (insufficientMessage) {
    return <InsufficientCreditsAlert message={insufficientMessage} />;
  }

  if (generatedVideo) {
    return (
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-background/50 p-3">
        <div className="flex min-w-0 items-center gap-3">
          <a
            href={generatedVideo.url}
            target="_blank"
            rel="noreferrer"
            className="group flex h-16 w-24 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-muted/40"
            title="Open render preview"
          >
            <img
              src={generatedVideo.thumbnailUrl ?? generatedVideo.url}
              alt={`${generatedVideo.name} preview`}
              className="h-full w-full object-cover transition-transform group-hover:scale-105"
            />
          </a>
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-green-600 dark:text-green-400">
              <CheckCircle2 className="h-4 w-4" />
              Rendered
            </p>
            <p className="truncate text-xs text-muted-foreground">
              Mock render preview — {generatedVideo.name}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isRendering}
          className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:border-vortex-500/50 hover:text-foreground disabled:opacity-50"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRendering ? "animate-spin" : ""}`}
          />
          Re-render
        </button>
      </div>
    );
  }

  if (status === "generating") {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin text-vortex-500" />
        Rendering video…
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="mt-4 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50/50 p-3 text-sm text-red-600 dark:border-red-900 dark:bg-red-950/30 dark:text-red-400">
        <XCircle className="h-4 w-4 shrink-0" />
        <span className="flex-1">This scene&apos;s render failed.</span>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isRendering}
          className="inline-flex items-center gap-1.5 rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium hover:bg-red-100 disabled:opacity-50 dark:border-red-900 dark:hover:bg-red-950"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${isRendering ? "animate-spin" : ""}`}
          />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="mt-4">
      <button
        type="button"
        onClick={handleGenerate}
        disabled={isRendering}
        className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-3.5 py-2 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 transition-colors"
      >
        <Clapperboard className="h-4 w-4" />
        {isRendering ? "Rendering…" : `Generate Video · ${creditCost} credits`}
      </button>
    </div>
  );
}
