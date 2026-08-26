"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { ImageIcon, Loader2, Palette, Sparkles } from "lucide-react";
import { notifyCreditsUpdated } from "@/lib/credits-client";
import { InsufficientCreditsAlert } from "@/components/ai/insufficient-credits-alert";
import {
  IMAGE_ASPECT_RATIOS,
  IMAGE_PROVIDER_CATALOG,
  type ImageProviderInfo,
} from "@/lib/generation/image-providers-catalog";

export type ImageAssetRef = {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  projectName: string;
};

export interface ImageSuiteProps {
  projects: { id: string; name: string }[];
  imageAssets: ImageAssetRef[];
  creditCosts: { imageGeneration: number };
  /** Server-computed provider availability (from configured credentials).
   * Omit to treat every provider as available (e.g. in tests). */
  providerOptions?: ImageProviderInfo[];
  /** Image provider to use. Defaults to `mock`; pass e.g. `"flux"` to generate
   * real images (requires IMAGE_PROVIDER=flux + FLUX_API_KEY). */
  defaultProvider?: string;
}

type AspectRatio = (typeof IMAGE_ASPECT_RATIOS)[number]["value"];

const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 120; // ~3 minutes of polling for async providers (FLUX)
const STYLE_PRESETS = ["cinematic", "photoreal", "watercolor", "minimalist"];

/**
 * Image Suite: pick a project, describe the image you want, choose an aspect
 * ratio, and generate. Submits to `POST /api/v1/image-jobs` (which charges
 * credits and completes synchronously in mock mode), surfaces HTTP 402 via the
 * inline buy-credits alert, and polls `GET /api/v1/image-jobs/[id]` for async
 * providers. The generated asset appears in the library below after a server
 * refresh.
 */
export function ImageSuite({
  projects,
  imageAssets,
  creditCosts,
  providerOptions,
  defaultProvider = "mock",
}: ImageSuiteProps) {
  const router = useRouter();

  const options: ImageProviderInfo[] =
    providerOptions ??
    IMAGE_PROVIDER_CATALOG.map((p) => ({
      name: p.value,
      label: p.label,
      available: true,
    }));

  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [prompt, setPrompt] = useState("");
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>("16:9");
  const [style, setStyle] = useState<string>(STYLE_PRESETS[0]);
  const [provider, setProvider] = useState<string>(
    () =>
      options.some((p) => p.name === defaultProvider)
        ? defaultProvider
        : (options.find((p) => p.available)?.name ?? "mock"),
  );
  const [isGenerating, setIsGenerating] = useState(false);
  const [insufficientMessage, setInsufficientMessage] = useState<string | null>(
    null,
  );
  const cancelledRef = useRef(false);
  // undefined = still loading; null = the selected project has no profile.
  const [brandName, setBrandName] = useState<string | null | undefined>(
    undefined,
  );

  // The project picker drives which brand profile applies to a generation, so
  // fetch it whenever the selection changes (mirrors the new-storyboard flag).
  useEffect(() => {
    if (!projectId) {
      setBrandName(null);
      return;
    }
    let cancelled = false;
    axios
      .get(`/api/v1/projects/${projectId}`)
      .then((res) => {
        if (!cancelled)
          setBrandName(res.data?.data?.brandDna?.name ?? null);
      })
      .catch(() => {
        if (!cancelled) setBrandName(null);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(
    () => () => {
      cancelledRef.current = true;
    },
    [],
  );

  const selectedProvider = options.find((p) => p.name === provider);
  const selectedUnavailable = Boolean(
    selectedProvider && !selectedProvider.available,
  );

  const cost = creditCosts.imageGeneration;

  async function handleGenerate(e: FormEvent) {
    e.preventDefault();
    if (!projectId) {
      toast.error("Pick a project first.");
      return;
    }
    if (!prompt.trim()) {
      toast.error("Describe what you want to generate.");
      return;
    }

    setIsGenerating(true);
    setInsufficientMessage(null);
    try {
      const res = await axios.post("/api/v1/image-jobs", {
        projectId,
        prompt: prompt.trim(),
        aspectRatio,
        style: style === STYLE_PRESETS[0] ? null : style,
        provider,
      });
      const job = res.data?.data as { jobId?: string; status?: string };

      // Mock completes synchronously — just refresh to surface the new asset.
      if (!job || job.status === "completed") {
        toast.success("Image generated");
        notifyCreditsUpdated();
        void router.refresh();
        return;
      }

      // Async provider: poll until it reaches a terminal state.
      if (!job.jobId) {
        throw new Error("Generation started but no job id was returned");
      }
      await pollJob(job.jobId);
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 402) {
        setInsufficientMessage(
          axios.isAxiosError(error) && error.response?.data?.error
            ? String(error.response.data.error)
            : "Image generation costs credits. Top up and try again.",
        );
      } else if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(String(error.response.data.error));
      } else {
        toast.error("Image generation failed. Try again.");
      }
    } finally {
      setIsGenerating(false);
    }
  }

  async function pollJob(jobId: string) {
    let attempts = 0;
    while (!cancelledRef.current && attempts < MAX_POLL_ATTEMPTS) {
      attempts += 1;
      // eslint-disable-next-line no-await-in-loop
      const res = await axios.get(`/api/v1/image-jobs/${jobId}`);
      const job = res.data?.data as {
        status?: string;
        errorMessage?: string | null;
      };

      if (job?.status === "completed") {
        toast.success("Image generated");
        notifyCreditsUpdated();
        void router.refresh();
        return;
      }
      if (job?.status === "failed") {
        toast.error(job.errorMessage || "Image generation failed");
        void router.refresh();
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    toast("Image is still generating — check back in a moment.");
    void router.refresh();
  }
if (insufficientMessage) {
    return <InsufficientCreditsAlert message={insufficientMessage} />;
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-16 text-center">
        <ImageIcon className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
        <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
          Create a project first — then you can generate images for it here.
        </p>
        <a
          href="/dashboard/projects/new"
          className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-3 text-sm font-medium text-white hover:bg-vortex-700 transition-colors"
        >
          Create Your First Project
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={handleGenerate}
        aria-label="Image generation"
        className="rounded-xl border p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">New generation</h2>
        </div>

        <label className="block text-sm font-medium">
          Project
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="mt-1.5 block w-full rounded-lg border bg-background px-3 py-2 text-sm"
          >
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>

        {brandName !== undefined && (
          <div>
            {brandName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-vortex-500/40 bg-vortex-50 px-2.5 py-1 text-xs font-medium text-vortex-700 dark:bg-vortex-950/50 dark:text-vortex-300">
                <Palette className="h-3.5 w-3.5" />
                Brand DNA: {brandName} — images will follow these brand
                guidelines.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                No brand profile assigned — images will not follow brand
                guidelines.
              </span>
            )}
          </div>
        )}

        <label className="block text-sm font-medium">
          Prompt
          <textarea
            aria-label="prompt"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the image you want to generate…"
            rows={3}
            className="mt-1.5 block w-full rounded-lg border bg-background px-3 py-2 text-sm"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="block text-sm font-medium">
            Aspect ratio
            <select
              aria-label="aspect ratio"
              value={aspectRatio}
              onChange={(e) => setAspectRatio(e.target.value as AspectRatio)}
              className="mt-1.5 block w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {IMAGE_ASPECT_RATIOS.map((ratio) => (
                <option key={ratio.value} value={ratio.value}>
                  {ratio.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Style
            <select
              aria-label="style"
              value={style}
              onChange={(e) => setStyle(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {STYLE_PRESETS.map((preset) => (
                <option key={preset} value={preset} className="capitalize">
                  {preset}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-sm font-medium">
            Provider
            <select
              aria-label="image provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="mt-1.5 block w-full rounded-lg border bg-background px-3 py-2 text-sm"
            >
              {options.map((option) => (
                <option
                  key={option.name}
                  value={option.name}
                  disabled={!option.available}
                >
                  {option.label}
                  {option.available ? "" : " (unavailable)"}
                </option>
              ))}
            </select>
          </label>
        </div>

        {selectedUnavailable && selectedProvider?.reason && (
          <p className="text-xs text-muted-foreground">
            {selectedProvider.reason} — you can still use{" "}
            {options.find((p) => p.available)?.label ?? "mock"}.
          </p>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Charged {cost} credit{cost === 1 ? "" : "s"} per image.{" "}
            <a
              href="/dashboard/credits"
              className="text-vortex-600 hover:underline"
            >
              View balance
            </a>
          </p>
          <button
            type="submit"
            disabled={isGenerating || selectedUnavailable}
            className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-4 py-2 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 transition-colors"
          >
            {isGenerating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {isGenerating
              ? "Generating…"
              : `Generate image · ${cost} credit${cost === 1 ? "" : "s"}`}
          </button>
        </div>
      </form>
<section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Library</h2>
          <span className="text-xs text-muted-foreground">
            {imageAssets.length} asset{imageAssets.length === 1 ? "" : "s"}
          </span>
        </div>

        {imageAssets.length > 0 ? (
          <ul className="space-y-3">
            {imageAssets.map((asset) => (
              <li key={asset.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="inline-flex items-center rounded-full border border-vortex-500/40 bg-vortex-50 px-2 py-0.5 text-xs font-medium text-vortex-700 dark:bg-vortex-950/50 dark:text-vortex-300">
                        Image
                      </span>
                      <span className="truncate">{asset.name}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {asset.projectName} ·{" "}
                      {asset.width && asset.height
                        ? `${asset.width}×${asset.height}`
                        : "—"}{" "}
                      ·{" "}
                      {new Date(asset.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                {/* eslint-disable-next-line @next/next/no-img-element -- Generated asset served from object storage / data URI; not routed through the CDN optimizer. */}
                <img
                  src={asset.url}
                  alt={asset.name}
                  className="max-h-64 w-full rounded-lg object-contain"
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <ImageIcon className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No images yet — generate your first one above.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}