import { createHash, createHmac } from "crypto";

/**
 * Video generation provider abstraction. Mirrors the AI service's
 * provider-agnostic design (`apps/ai-service/src/llm.py`): real render
 * providers (Kling, Runway, WAN, Hailuo, …) implement the same interface
 * later and are resolved by name through `getVideoProvider`.
 */

export interface VideoGenerationParams {
  prompt: string;
  negativePrompt?: string | null;
  aspectRatio: string;
  duration: number;
  projectName?: string | null;
}

/** A file produced by a provider, ready to be persisted. */
export interface GeneratedFile {
  filename: string;
  contentType: string;
  body: Buffer;
}

export interface GenerationResult {
  provider: string;
  /** The provider's external job id (only meaningful for remote providers). */
  providerJobId: string;
  width: number;
  height: number;
  duration: number;
  files: GeneratedFile[];
  metadata: Record<string, unknown>;
}

export interface VideoGenerationProvider {
  readonly name: string;
  generate(params: VideoGenerationParams): Promise<GenerationResult>;
}

/** Thrown when an unregistered provider name is requested. */
export class VideoProviderUnavailableError extends Error {
  providerName: string;

  constructor(providerName: string) {
    super(
      `Video generation provider "${providerName}" is not available. ` +
        `Set VIDEO_PROVIDER=mock for local development.`,
    );
    this.name = "VideoProviderUnavailableError";
    this.providerName = providerName;
  }
}

const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

const DEFAULT_DIMENSIONS = { width: 1280, height: 720 };

function renderAspectDimensions(aspectRatio: string) {
  return ASPECT_DIMENSIONS[aspectRatio] ?? DEFAULT_DIMENSIONS;
}

/** Escape text for safe embedding inside an SVG/XML document. */
export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Collapse whitespace and truncate long prompts for the poster card. */
export function normalizePosterText(value: string, max = 120): string {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length > max ? `${cleaned.slice(0, max).trimEnd()}…` : cleaned;
}

function wrapText(value: string, maxChars: number): string[] {
  const words = value.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length <= maxChars) {
      line = `${line} ${word}`.trim();
    } else {
      if (line) lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Builds a deterministic SVG "poster" that stands in for the rendered video
 * in mock mode. Real providers will return actual video files; this keeps the
 * full pipeline (job → asset → scene link → preview) exercisable offline.
 */
export function buildPosterSvg(input: {
  width: number;
  height: number;
  prompt: string;
  duration: number;
  aspectRatio: string;
}): string {
  const { width, height, duration, aspectRatio } = input;
  const titleLines = wrapText(normalizePosterText(input.prompt), 28);
  const titleY = height * 0.42;
  const lineHeight = Math.max(28, Math.round(height * 0.075));
  const fontSize = Math.max(28, Math.round(Math.min(width, height) / 16));

  const linesSvg = titleLines
    .map(
      (line, i) =>
        `<text x="50%" y="${Math.round(titleY + i * lineHeight)}" text-anchor="middle" ` +
        `font-family="Inter, system-ui, sans-serif" font-size="${fontSize}" ` +
        `font-weight="700" fill="#EDE9FE">${escapeXml(line)}</text>`,
    )
    .join("\n    ");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <linearGradient id="vortex-bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1E1B4B"/>
      <stop offset="55%" stop-color="#4C1D95"/>
      <stop offset="100%" stop-color="#7C3AED"/>
    </linearGradient>
    <radialGradient id="vortex-glow" cx="50%" cy="35%" r="60%">
      <stop offset="0%" stop-color="#FFFFFF" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#FFFFFF" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#vortex-bg)"/>
  <rect width="100%" height="100%" fill="url(#vortex-glow)"/>
  <circle cx="${width * 0.85}" cy="${height * 0.15}" r="${Math.min(width, height) * 0.06}" fill="#A78BFA" opacity="0.5"/>
  <circle cx="${width * 0.12}" cy="${height * 0.88}" r="${Math.min(width, height) * 0.08}" fill="#C4B5FD" opacity="0.3"/>
  <rect x="${Math.round(width * 0.06)}" y="${Math.round(height * 0.06)}" width="${Math.round(width * 0.88)}" height="${Math.round(height * 0.03)}" rx="8" fill="#8B5CF6" opacity="0.6"/>
  ${linesSvg}
  <text x="6%" y="${height * 0.93}" font-family="Inter, system-ui, sans-serif" font-size="${Math.max(20, Math.round(height * 0.035))}" font-weight="600" fill="#C4B5FD">VORTEX · MOCK RENDER</text>
  <text x="94%" y="${height * 0.93}" text-anchor="end" font-family="Inter, system-ui, sans-serif" font-size="${Math.max(20, Math.round(height * 0.035))}" font-weight="600" fill="#C4B5FD">${aspectRatio} · ${duration}s</text>
</svg>
`;
}

/**
 * Deterministic offline render provider. Simulates the render latency (a
 * configurable delay) and produces an SVG poster stand-in for the video. Never
 * fires network requests, so it works with zero API keys.
 */
export class MockVideoProvider implements VideoGenerationProvider {
  readonly name = "mock";

  async generate(params: VideoGenerationParams): Promise<GenerationResult> {
    const delayMs = Math.max(
      0,
      Number(process.env.MOCK_RENDER_DELAY_MS ?? 900),
    );
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const dims = renderAspectDimensions(params.aspectRatio);
    const svg = buildPosterSvg({
      width: dims.width,
      height: dims.height,
      prompt: params.prompt,
      duration: params.duration,
      aspectRatio: params.aspectRatio,
    });

    const digest = createHash("sha1").update(params.prompt).digest("hex");

    return {
      provider: this.name,
      providerJobId: `mock_render_${digest.slice(0, 12)}`,
      width: dims.width,
      height: dims.height,
      duration: params.duration,
      files: [
        {
          filename: `mock-render-${digest.slice(0, 8)}.svg`,
          contentType: "image/svg+xml",
          body: Buffer.from(svg, "utf8"),
        },
      ],
      metadata: { mock: true, format: "svg-postcard" },
    };
  }
}

const PROVIDER_REGISTRY: Record<string, () => VideoGenerationProvider> = {
  mock: () => new MockVideoProvider(),
};

/**
 * Resolves a generation provider by name. Defaults to the `VIDEO_PROVIDER`
 * env var (or `mock` for local development). Unknown names throw
 * `VideoProviderUnavailableError` so callers can map it to a 503 response.
 */
export function getVideoProvider(
  name?: string | null,
): VideoGenerationProvider {
  const key = (name || process.env.VIDEO_PROVIDER || "mock").toLowerCase();
  const factory = PROVIDER_REGISTRY[key];
  if (!factory) {
    throw new VideoProviderUnavailableError(
      name || key || process.env.VIDEO_PROVIDER || "",
    );
  }
  return factory();
}

// ============================================================
// Async (two-phase) video providers
// ============================================================
// Real render providers (Kling, Runway, WAN, Hailuo, …) submit a job and
// return a `providerJobId` immediately, then expose a `retrieve` call that is
// polled until the render is done. This section defines that capability on top
// of the sync `generate()` interface and ships a stateless mock that simulates
// it, so the whole submit → poll → complete flow is exercisable offline.

export interface VideoSubmitResult {
  providerJobId: string;
}

export type VideoRetrieveResult =
  | { status: "processing"; progress?: number }
  | { status: "succeeded"; result: GenerationResult }
  | { status: "failed"; error: string };

export interface AsyncVideoGenerationProvider extends VideoGenerationProvider {
  submit(params: VideoGenerationParams): Promise<VideoSubmitResult>;
  /** `params` mirrors the original request; real providers may ignore it. */
  retrieve(
    providerJobId: string,
    params: VideoGenerationParams,
  ): Promise<VideoRetrieveResult>;
}

/** Capability check: is this provider two-phase (submit/poll/complete)? */
export function isAsyncVideoProvider(
  provider: VideoGenerationProvider,
): provider is AsyncVideoGenerationProvider {
  return (
    typeof (provider as AsyncVideoGenerationProvider).submit === "function"
  );
}

export interface MockAsyncVideoProviderConfig {
  latencyMs?: number;
  now?: () => number;
}

/**
 * Stateless simulation of a real async video provider. `submit` encodes the
 * submission timestamp in the provider job id; `retrieve` compares it against
 * the (injectable) clock so the job is reported `processing` until
 * `latencyMs` has elapsed, then `succeeded`. Because all state is derived
 * from the job id + params, it can be resumed across separate requests —
 * exactly like a real vendor — without any database bookkeeping.
 */
export class MockAsyncVideoProvider implements AsyncVideoGenerationProvider {
  readonly name = "mock-async";

  private readonly latencyMs: number;
  private readonly now: () => number;

  constructor(config: MockAsyncVideoProviderConfig = {}) {
    this.latencyMs = Math.max(
      0,
      config.latencyMs ?? Number(process.env.MOCK_ASYNC_LATENCY_MS ?? 2000),
    );
    this.now = config.now ?? (() => Date.now());
  }

  /** Async providers use `submit` + `retrieve`; `generate` is not used. */
  async generate(_params: VideoGenerationParams): Promise<GenerationResult> {
    throw new Error(
      "MockAsyncVideoProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: VideoGenerationParams): Promise<VideoSubmitResult> {
    const startedAt = this.now();
    const digest = createHash("sha1").update(params.prompt).digest("hex");
    return { providerJobId: `mock_async_${digest.slice(0, 12)}_${startedAt}` };
  }

  async retrieve(
    providerJobId: string,
    params: VideoGenerationParams,
  ): Promise<VideoRetrieveResult> {
    const startedAt = Number(String(providerJobId).split("_").pop() ?? 0);
    const elapsed = Math.max(0, this.now() - startedAt);

    if (elapsed < this.latencyMs) {
      const progress = this.latencyMs
        ? Math.min(1, Number((elapsed / this.latencyMs).toFixed(2)))
        : 1;
      return { status: "processing", progress };
    }

    const dims = renderAspectDimensions(params.aspectRatio);
    const svg = buildPosterSvg({
      width: dims.width,
      height: dims.height,
      prompt: params.prompt,
      duration: params.duration,
      aspectRatio: params.aspectRatio,
    });
    const digest = createHash("sha1").update(providerJobId).digest("hex");

    return {
      status: "succeeded",
      result: {
        provider: this.name,
        providerJobId,
        width: dims.width,
        height: dims.height,
        duration: params.duration,
        files: [
          {
            filename: `mock-async-${digest.slice(0, 8)}.svg`,
            contentType: "image/svg+xml",
            body: Buffer.from(svg, "utf8"),
          },
        ],
        metadata: { mock: true, async: true, format: "svg-postcard" },
      },
    };
  }
}

// Register the async mock provider. `mock` remains the default; `mock-async`
// demonstrates (and tests) the full submit → poll → complete flow.
PROVIDER_REGISTRY["mock-async"] = () => new MockAsyncVideoProvider();
// ============================================================
// Kling AI — real text-to-video provider
// ============================================================
// Production-ready provider backed by the Kling AI API (api.klingai.com).
// Kling renders asynchronously, so this implements the two-phase
// `AsyncVideoGenerationProvider` capability: `submit()` creates a task and
// returns its id, then `retrieve()` is polled until the render finishes, at
// which point the finished MP4 is downloaded and wrapped in a
// `GenerationResult`. Select it with `VIDEO_PROVIDER=kling` and set
// `KLING_API_KEY` + `KLING_API_SECRET`. All network access is injected via
// `fetchImpl` so the provider is unit-testable without a real key.

export interface KlingVideoProviderConfig {
  apiKey?: string;
  apiSecret?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injectable clock (seconds) so the auth signature is deterministic in tests. */
  timestampProvider?: () => number;
  modelName?: string;
  mode?: "std" | "pro";
}

const KLING_DEFAULT_BASE_URL = "https://api.klingai.com";

/** Kling only renders 5s or 10s clips; round any requested duration. */
export function pickKlingDuration(seconds: number): string {
  return seconds <= 7.5 ? "5" : "10";
}

/** Derive typical output dimensions from an aspect ratio (Kling may omit them). */
export function klingAspectDimensions(aspectRatio: string): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    default:
      return { width: 1280, height: 720 };
  }
}

/**
 * Builds the Kling authentication headers. The signature is the hex
 * HMAC-SHA256 (keyed by the API secret) over the stringified Unix timestamp in
 * seconds — Kling's documented access-key/secret scheme. Injected via
 * `timestampProvider` in tests so the output is deterministic.
 */
export function buildKlingAuthHeaders(input: {
  apiKey: string;
  apiSecret: string;
  timestamp: number;
  expectJsonBody?: boolean;
}): Record<string, string> {
  const ts = String(input.timestamp);
  const signature = createHmac("sha256", input.apiSecret)
    .update(ts)
    .digest("hex");
  const headers: Record<string, string> = {
    "Api-Key": input.apiKey,
    "Api-Secret": input.apiSecret,
    Timestamp: ts,
    Signature: signature,
    Accept: "application/json",
  };
  if (input.expectJsonBody) {
    headers["Content-Type"] = "application/json";
  }
  return headers;
}

/**
 * Parses a Kling API JSON envelope, throwing on a non-zero `code`.
 */
function klingJson(body: unknown): Record<string, unknown> {
  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = obj.code as number | undefined;
  if (typeof code === "number" && code !== 0) {
    throw new Error(
      `Kling API error (${code}): ${String(obj.message ?? "unknown error")}`,
    );
  }
  return (obj.data as Record<string, unknown>) ?? {};
}

interface KlingVideoRef {
  url?: string;
  id?: string;
  width?: number;
  height?: number;
}

export class KlingVideoProvider implements AsyncVideoGenerationProvider {
  readonly name = "kling";

  private readonly fetchImpl: typeof fetch;
  private readonly apiKey: string;
  private readonly apiSecret: string;
  private readonly baseUrl: string;
  private readonly timestamp: () => number;
  private readonly modelName: string;
  private readonly mode: "std" | "pro";

  constructor(config: KlingVideoProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.KLING_API_KEY ?? "";
    this.apiSecret = config.apiSecret ?? process.env.KLING_API_SECRET ?? "";
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.baseUrl = (config.baseUrl ?? KLING_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.timestamp =
      config.timestampProvider ?? (() => Math.floor(Date.now() / 1000));
    this.modelName = config.modelName ?? process.env.KLING_MODEL ?? "kling-v1";
    this.mode = config.mode ?? "std";
  }

  /** Async providers use `submit` + `retrieve`; `generate` is not used. */
  async generate(_params: VideoGenerationParams): Promise<GenerationResult> {
    throw new Error(
      "KlingVideoProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: VideoGenerationParams): Promise<VideoSubmitResult> {
    this.assertConfigured();
    const body = JSON.stringify({
      model_name: this.modelName,
      prompt: params.prompt,
      negative_prompt: params.negativePrompt ?? "",
      cfg_scale: 0.5,
      mode: this.mode,
      aspect_ratio: params.aspectRatio,
      duration: pickKlingDuration(params.duration),
    });
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/videos/text2video`,
      {
        method: "POST",
        headers: buildKlingAuthHeaders({
          apiKey: this.apiKey,
          apiSecret: this.apiSecret,
          timestamp: this.timestamp(),
          expectJsonBody: true,
        }),
        body,
      },
    );
    if (!response.ok) {
      throw new Error(`Kling submit failed with status ${response.status}`);
    }
    const data = klingJson(await response.json());
    const taskId = data.task_id;
    if (typeof taskId !== "string" || !taskId) {
      throw new Error("Kling submit returned no task id");
    }
    return { providerJobId: taskId };
  }

  async retrieve(
    providerJobId: string,
    params: VideoGenerationParams,
  ): Promise<VideoRetrieveResult> {
    this.assertConfigured();
    const id = encodeURIComponent(providerJobId);
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/videos/text2video/${id}`,
      {
        method: "GET",
        headers: buildKlingAuthHeaders({
          apiKey: this.apiKey,
          apiSecret: this.apiSecret,
          timestamp: this.timestamp(),
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Kling retrieve failed with status ${response.status}`);
    }
    const data = klingJson(await response.json());
    const status = data.task_status;

    if (status === "submitted" || status === "processing") {
      return { status: "processing" };
    }

    if (status === "failed") {
      return {
        status: "failed",
        error: String(data.task_status_msg ?? "Kling generation failed"),
      };
    }

    if (status === "succeed") {
      const video = this.firstVideo(data.task_result);
      if (!video?.url) {
        throw new Error("Kling succeeded but returned no video URL");
      }
      const file = await this.downloadVideo(video.url);
      const dims = klingAspectDimensions(params.aspectRatio);
      return {
        status: "succeeded",
        result: {
          provider: this.name,
          providerJobId,
          width: video.width ?? dims.width,
          height: video.height ?? dims.height,
          duration: params.duration,
          files: [
            {
              filename: `kling-${providerJobId.slice(0, 12)}.mp4`,
              contentType: file.contentType,
              body: file.body,
            },
          ],
          metadata: {
            provider: "kling",
            model: this.modelName,
            mode: this.mode,
            taskId: providerJobId,
            videoId: video.id ?? null,
          },
        },
      };
    }

    throw new Error(`Kling returned unknown task_status: ${String(status)}`);
  }

  private assertConfigured(): void {
    if (!this.apiKey || !this.apiSecret) {
      throw new Error(
        "KLING_API_KEY and KLING_API_SECRET are required when VIDEO_PROVIDER=kling",
      );
    }
  }

  private firstVideo(result: unknown): KlingVideoRef | undefined {
    if (!result || typeof result !== "object") {
      return undefined;
    }
    const videos = (result as { videos?: unknown }).videos;
    if (!Array.isArray(videos) || videos.length === 0) {
      return undefined;
    }
    const v = videos[0] as Record<string, unknown>;
    return {
      url: typeof v.url === "string" ? v.url : undefined,
      id: typeof v.id === "string" ? v.id : undefined,
      width: typeof v.width === "number" ? v.width : undefined,
      height: typeof v.height === "number" ? v.height : undefined,
    };
  }

  private async downloadVideo(
    url: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Kling video download failed with status ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "video/mp4",
    };
  }
}

// Register the real provider. `mock` remains the default; set VIDEO_PROVIDER=kling
// (with KLING_API_KEY + KLING_API_SECRET) to render real videos end-to-end.
PROVIDER_REGISTRY.kling = () => new KlingVideoProvider();

