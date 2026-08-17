"use client";

import { useEffect, useRef, useState } from "react";
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
const VIDEO_PROVIDERS = [
  { value: "mock", label: "Mock (fast, offline)" },
  { value: "mock-async", label: "Mock async (poll flow)" },
  { value: "ffmpeg", label: "FFmpeg (local MP4)" },
  { value: "kling", label: "Kling AI" },
] as const;

export function SceneVideoGenerator({
  sceneId,
  status,
  generatedVideo,
  creditCost,
  defaultProvider = "mock",
}: {
  sceneId: string;
  status: "pending" | "generating" | "completed" | "failed";
  generatedVideo: GeneratedVideoRef | null;
  creditCost: number;
  /** Render provider to use. Defaults to `mock`; pass e.g. `"ffmpeg"` to
   * render a real local MP4 (requires VIDEO_PROVIDER=ffmpeg + ffmpeg installed)
   * or `"mock-async"`/`"kling"` to exercise the two-phase submit/poll flow. */
  defaultProvider?: string;
}) {
  const router = useRouter();
  const [isRendering, setIsRendering] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [insufficientMessage, setInsufficientMessage] = useState<string | null>(
    null,
  );
  const [provider, setProvider] = useState<string>(
    defaultProvider ?? "mock",
  );
  const cancelledRef = useRef(false);

  useEffect(() => () => {
    cancelledRef.current = true;
  }, []);

  // Async polling cadence for two-phase providers (kling / ffmpeg / mock-async).
  const POLL_INTERVAL_MS = 1500;
  const MAX_ATTEMPTS = 90; // ~2 minutes at 1.5s intervals

  async function handleGenerate() {
    setIsRendering(true);
    setProgress(null);
    setInsufficientMessage(null);

    try {
      const res = await axios.post("/api/v1/generation-jobs", {
        sceneId,
        provider,
      });
      const job = res.data?.data as {
        jobId?: string;
        status?: string;
        errorMessage?: string | null;
      };

      // Synchronous providers (e.g. mock) complete on submit — just refresh.
      if (!job || job.status === "completed") {
        toast.success("Video rendered");
        notifyCreditsUpdated();
        void router.refresh();
        return;
      }

      // Async provider: poll until the job reaches a terminal state.
      if (!job.jobId) {
        throw new Error("Render started but no job id was returned");
      }
      await pollJob(job.jobId);
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
      setProgress(null);
    }
  }

  async function pollJob(jobId: string) {
    let attempts = 0;
    while (!cancelledRef.current && attempts < MAX_ATTEMPTS) {
      attempts += 1;
      // eslint-disable-next-line no-await-in-loop
      const res = await axios.get(`/api/v1/generation-jobs/${jobId}`);
      const job = res.data?.data as {
        status?: string;
        errorMessage?: string | null;
      };

      if (!job) {
        break;
      }

      if (job.status === "completed") {
        toast.success("Video rendered");
        notifyCreditsUpdated();
        void router.refresh();
        return;
      }

      if (job.status === "failed") {
        toast.error(job.errorMessage || "Render failed");
        void router.refresh();
        return;
      }

      // Still processing — nudge the inline progress bar and wait.
      setProgress(Math.min(95, Math.round((attempts / MAX_ATTEMPTS) * 100)));
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }

    if (!cancelledRef.current) {
      toast("Render is still processing — check back in a moment.");
    }
    void router.refresh();
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
            {/* eslint-disable-next-line @next/next/no-img-element -- The
                thumbnail may be an SVG poster, a remote video URL, or an inline
                data URI (S3 fallback); next/image can't reliably optimize
                those, so keep the plain <img> for this small preview. */}
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
    <div className="mt-4 flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <select
          value={provider}
          onChange={(e) => setProvider(e.target.value)}
          disabled={isRendering}
          className="text-xs"
          title="Render provider"
        >
          {VIDEO_PROVIDERS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
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
      {progress !== null && (
        <div className="h-1.5 w-full max-w-48 overflow-hidden rounded bg-muted">
          <div
            className="h-full w-full bg-vortex-500 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}
    </div>
  );
}
