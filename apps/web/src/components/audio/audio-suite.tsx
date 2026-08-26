"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import toast from "react-hot-toast";
import { AudioLines, Loader2, Music, Palette, Sparkles } from "lucide-react";
import { notifyCreditsUpdated } from "@/lib/credits-client";
import { InsufficientCreditsAlert } from "@/components/ai/insufficient-credits-alert";
import {
  AUDIO_PROVIDER_CATALOG,
  type AudioProviderInfo,
} from "@/lib/generation/audio-providers-catalog";

export type AudioAssetRef = {
  id: string;
  name: string;
  url: string;
  mimeType: string | null;
  duration: number | null;
  createdAt: string;
  projectName: string;
};

export interface AudioSuiteProps {
  projects: { id: string; name: string }[];
  audioAssets: AudioAssetRef[];
  creditCosts: { voiceover: number; music: number };
  /** Server-computed provider availability (from configured credentials).
   * Omit to treat every provider as available (e.g. in tests). */
  providerOptions?: AudioProviderInfo[];
  /** Audio provider to use. Defaults to `mock`; pass e.g. `"suno"` to generate
   * real music tracks (requires AUDIO_PROVIDER=suno + SUNO_API_KEY). */
  defaultProvider?: string;
}

type AudioKind = "voiceover" | "music";

const VOICES = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
const POLL_INTERVAL_MS = 1500;
const MAX_POLL_ATTEMPTS = 120; // ~3 minutes of polling for async providers (Suno)

/**
 * Audio Suite: pick a project, choose voiceover/music, describe what you want,
 * and generate. Submits to `POST /api/v1/audio-jobs` (which charges credits and
 * completes synchronously in mock mode), surfaces HTTP 402 via the inline
 * buy-credits alert, and polls `GET /api/v1/audio-jobs/[id]` for async providers.
 * The generated asset appears in the library below after a server refresh.
 */
export function AudioSuite({
  projects,
  audioAssets,
  creditCosts,
  providerOptions,
  defaultProvider = "mock",
}: AudioSuiteProps) {
  const router = useRouter();

  const options: AudioProviderInfo[] =
    providerOptions ??
    AUDIO_PROVIDER_CATALOG.map((p) => ({
      name: p.value,
      label: p.label,
      available: true,
      kinds: p.kinds,
    }));

  // The initial kind is always voiceover, so start on a provider that can
  // actually generate it (e.g. `AUDIO_PROVIDER=suno` alone must not leave the
  // dropdown on a music-only provider for a voiceover form).
  const initialKind: AudioKind = "voiceover";
  const initialSupported = options.filter((p) => p.kinds.includes(initialKind));

  const [projectId, setProjectId] = useState<string>(projects[0]?.id ?? "");
  const [kind, setKind] = useState<AudioKind>(initialKind);
  const [prompt, setPrompt] = useState("");
  const [duration, setDuration] = useState<number>(15);
  const [voice, setVoice] = useState<string>(VOICES[0]);
  const [provider, setProvider] = useState<string>(() => {
    const requested = defaultProvider ?? "mock";
    if (initialSupported.some((p) => p.name === requested)) return requested;
    return (
      initialSupported.find((p) => p.available)?.name ??
      initialSupported[0]?.name ??
      "mock"
    );
  });
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

  const visibleOptions = options.filter((p) => p.kinds.includes(kind));
  const selectedProvider = visibleOptions.find((p) => p.name === provider);
  const selectedUnavailable = Boolean(
    selectedProvider && !selectedProvider.available,
  );

  const cost = kind === "voiceover" ? creditCosts.voiceover : creditCosts.music;

  function switchKind(next: AudioKind) {
    setKind(next);
    setDuration(next === "voiceover" ? 15 : 30);
    // Providers are kind-specific (Suno is music-only; TTS is voiceover-only).
    // If the current selection can't generate the new kind, jump to the first
    // supported, available option (falling back to the first supported one).
    const supported = options.filter((p) => p.kinds.includes(next));
    if (!supported.some((p) => p.name === provider)) {
      const fallback = supported.find((p) => p.available) ?? supported[0];
      setProvider(fallback?.name ?? "mock");
    }
  }

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
      const res = await axios.post("/api/v1/audio-jobs", {
        projectId,
        kind,
        prompt: prompt.trim(),
        duration,
        voice: kind === "voiceover" ? voice : null,
        provider,
      });
      const job = res.data?.data as { jobId?: string; status?: string };

      // Mock completes synchronously — just refresh to surface the new asset.
      if (!job || job.status === "completed") {
        toast.success("Audio generated");
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
            : "Audio generation costs credits. Top up and try again.",
        );
      } else if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(String(error.response.data.error));
      } else {
        toast.error("Audio generation failed. Try again.");
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
      const res = await axios.get(`/api/v1/audio-jobs/${jobId}`);
      const job = res.data?.data as {
        status?: string;
        errorMessage?: string | null;
      };

      if (job?.status === "completed") {
        toast.success("Audio generated");
        notifyCreditsUpdated();
        void router.refresh();
        return;
      }
      if (job?.status === "failed") {
        toast.error(job.errorMessage || "Audio generation failed");
        void router.refresh();
        return;
      }
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    }
    toast("Audio is still generating — check back in a moment.");
    void router.refresh();
  }

  const kindBadge = (name: string): string => {
    const lower = name.toLowerCase();
    if (lower.startsWith("voiceover")) return "Voiceover";
    if (lower.startsWith("music")) return "Music";
    return "Audio";
  };

  if (insufficientMessage) {
    return <InsufficientCreditsAlert message={insufficientMessage} />;
  }

  if (projects.length === 0) {
    return (
      <div className="rounded-xl border border-dashed p-16 text-center">
        <Music className="mx-auto h-16 w-16 text-muted-foreground/30 mb-4" />
        <h3 className="text-xl font-semibold mb-2">No projects yet</h3>
        <p className="text-sm text-muted-foreground mb-8 max-w-md mx-auto">
          Create a project first — then you can generate voiceovers and music
          for it here.
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
        aria-label="Audio generation"
        className="rounded-xl border p-5 space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">New generation</h2>
          <div className="inline-flex rounded-lg border bg-muted/40 p-1">
            {(
              [
                { value: "voiceover", label: "Voiceover", icon: Sparkles },
                { value: "music", label: "Music", icon: Music },
              ] as const
            ).map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => switchKind(value)}
                className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  kind === value
                    ? "bg-background text-vortex-600 shadow-sm dark:text-vortex-400"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Icon className="h-4 w-4" />
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Project</span>
            <select
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
              disabled={isGenerating}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vortex-500"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5 text-sm">
            <span className="font-medium">Duration (seconds)</span>
            <input
              type="number"
              min={1}
              max={600}
              value={duration}
              onChange={(e) =>
                setDuration(Math.max(1, Number(e.target.value) || 1))
              }
              disabled={isGenerating}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vortex-500"
            />
          </label>
        </div>

        {brandName !== undefined && (
          <div>
            {brandName ? (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-vortex-500/40 bg-vortex-50 px-2.5 py-1 text-xs font-medium text-vortex-700 dark:bg-vortex-950/50 dark:text-vortex-300">
                <Palette className="h-3.5 w-3.5" />
                Brand Voice: {brandName} — audio will follow these brand
                guidelines.
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">
                No brand profile assigned — audio will not follow brand
                guidelines.
              </span>
            )}
          </div>
        )}

        <label className="space-y-1.5 text-sm">
          <span className="font-medium">Provider</span>
          <select
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            disabled={isGenerating}
            title="Audio provider"
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vortex-500"
          >
            {visibleOptions.map((p) => (
              <option
                key={p.name}
                value={p.name}
                disabled={!p.available}
                title={!p.available ? p.reason : undefined}
              >
                {p.label}
                {!p.available ? " (not configured)" : ""}
              </option>
            ))}
          </select>
          {selectedUnavailable && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              {selectedProvider?.reason} — set the env var on the server to
              enable this provider.
            </p>
          )}
        </label>

        <label className="space-y-1.5 text-sm">
          <span className="font-medium">
            {kind === "voiceover"
              ? "Script / voiceover lines"
              : "Musical direction"}
          </span>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isGenerating}
            rows={3}
            placeholder={
              kind === "voiceover"
                ? "Your brand, offer, and the lines to be spoken…"
                : "Genre, mood, tempo, and instruments — e.g. upbeat electronic with a driving bassline…"
            }
            className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vortex-500 resize-none"
          />
        </label>

        {kind === "voiceover" && (
          <label className="space-y-1.5 text-sm sm:max-w-xs">
            <span className="font-medium">Voice</span>
            <select
              value={voice}
              onChange={(e) => setVoice(e.target.value)}
              disabled={isGenerating}
              className="w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-vortex-500"
            >
              {VOICES.map((v) => (
                <option key={v} value={v} className="capitalize">
                  {v}
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center justify-between gap-3 border-t pt-4">
          <p className="text-xs text-muted-foreground">
            Charged {cost} credits per {kind}.{" "}
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
              <AudioLines className="h-4 w-4" />
            )}
            {isGenerating
              ? "Generating…"
              : `Generate ${kind} · ${cost} credits`}
          </button>
        </div>
      </form>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Library</h2>
          <span className="text-xs text-muted-foreground">
            {audioAssets.length} asset{audioAssets.length === 1 ? "" : "s"}
          </span>
        </div>

        {audioAssets.length > 0 ? (
          <ul className="space-y-3">
            {audioAssets.map((asset) => (
              <li key={asset.id} className="rounded-xl border p-4 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 font-medium">
                      <span className="inline-flex items-center rounded-full border border-vortex-500/40 bg-vortex-50 px-2 py-0.5 text-xs font-medium text-vortex-700 dark:bg-vortex-950/50 dark:text-vortex-300">
                        {kindBadge(asset.name)}
                      </span>
                      <span className="truncate">{asset.name}</span>
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {asset.projectName} ·{" "}
                      {asset.duration ? `${asset.duration}s` : "—"} ·{" "}
                      {new Date(asset.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })}
                    </p>
                  </div>
                </div>
                <audio
                  controls
                  preload="none"
                  src={asset.url}
                  className="h-9 w-full"
                />
              </li>
            ))}
          </ul>
        ) : (
          <div className="rounded-xl border border-dashed p-12 text-center">
            <AudioLines className="mx-auto h-12 w-12 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground">
              No audio yet — generate your first voiceover or track above.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
