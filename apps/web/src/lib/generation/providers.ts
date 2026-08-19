import { createHash, createHmac } from "crypto";
import { spawn } from "child_process";

/**
 * Video generation provider abstraction. Mirrors the AI service's
 * provider-agnostic design (`apps/ai-service/src/llm.py`): real render
 * providers (Kling, Runway, Hailuo, WAN, …) implement the same interface
 * and are resolved by name through `getVideoProvider`.
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

export function renderAspectDimensions(aspectRatio: string) {
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
// Real render providers (Kling, Runway, Hailuo, WAN, …) submit a job and
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
// FFmpeg — local H.264 render provider (async two-phase)
// ============================================================
// Renders a real, playable MP4 on the machine running the web app using the
// `ffmpeg` binary (selected with VIDEO_PROVIDER=ffmpeg). The frame palette is
// derived from the Brand DNA colors already present in the enriched prompt
// (`#hex` tokens the render-prompt enrichment appends) and the scene prompt is
// burned onto the frame with a `drawtext` overlay, then encoded to H.264
// (yuv420p, faststart) for broad browser/platform compatibility. Like every
// async provider it is two-phase: `submit()` returns a job id and `retrieve()`
// renders on poll, so a long render is resumable across requests.
//
// The heavy pieces are small and pure (`extractHexColors`,
// `buildFfmpegRenderSpec`, `escapeFfmpegFilterText`, `buildFfmpegArgs`) so they
// are unit-tested without a real ffmpeg binary; `renderMp4WithFfmpeg` shells
// out, and `FfmpegVideoProvider` accepts an injected `renderImpl` for tests.

export interface FfmpegRenderSpec {
  width: number;
  height: number;
  duration: number;
  fps: number;
  /** Frame background color as a hex without the `#` (e.g. "1E1B4B"). */
  backgroundColorHex: string;
  accentHex: string;
  /** Text burned onto the frame (the truncated prompt). */
  overlayTitle: string;
  drawText: boolean;
}

/**
 * Extracts and normalizes `#rgb` / `#rrggbb` color tokens embedded in a prompt
 * (the brand colors the render-prompt enrichment appends). 3-digit forms are
 * expanded to 6-digit so ffmpeg's `color=` source accepts them.
 */
export function extractHexColors(text: string): string[] {
  const matches = text.match(/#([0-9a-f]{3}|[0-9a-f]{6})(?![\w#])/gi) ?? [];
  return matches.map((token) => {
    const hex = token.replace("#", "").toLowerCase();
    return `#${hex.length === 3 ? hex.split("").map((c) => c + c).join("") : hex}`;
  });
}

const DEFAULT_BG_HEX = "1E1B4B";
const DEFAULT_ACCENT_HEX = "7C3AED";

/**
 * Builds a deterministic render spec for a scene prompt. Colors are derived
 * from any `#hex` tokens in the (already brand-enriched) prompt so output
 * matches the project's Brand DNA palette; missing colors fall back to the
 * VORTEX brand gradient.
 */
export function buildFfmpegRenderSpec(
  params: VideoGenerationParams,
): FfmpegRenderSpec {
  const dims = renderAspectDimensions(params.aspectRatio);
  const colors = extractHexColors(params.prompt);
  return {
    width: dims.width,
    height: dims.height,
    duration: params.duration,
    fps: 25,
    backgroundColorHex: (colors[0] ?? `#${DEFAULT_BG_HEX}`).replace("#", ""),
    accentHex: (colors[1] ?? `#${DEFAULT_ACCENT_HEX}`).replace("#", ""),
    overlayTitle: normalizePosterText(params.prompt, 60),
    drawText: true,
  };
}

/**
 * Escapes text for safe use inside a ffmpeg `drawtext` filter expression
 * (colons, commas, semicolons and quotes all terminate the filter grammar).
 */
export function escapeFfmpegFilterText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/:/g, "\\:")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;")
    .replace(/'/g, "\\'");
}

/**
 * Builds a stable, deterministic ffmpeg argument vector for the render spec.
 * Produces H.264 `yuv420p` (mobile/browser-safe) with a `drawtext` overlay of
 * the scene prompt and writes the encoded bytes to stdout.
 */
export function buildFfmpegArgs(spec: FfmpegRenderSpec): string[] {
  const size = `${spec.width}x${spec.height}`;
  const args: string[] = [
    "-y",
    "-f",
    "lavfi",
    "-i",
    `color=c=0x${spec.backgroundColorHex}:s=${size}:d=${spec.duration}:r=${spec.fps}`,
  ];

  if (spec.drawText && spec.overlayTitle) {
    const fontSize = Math.max(
      40,
      Math.round(Math.min(spec.width, spec.height) / 22),
    );
    const text =
      `drawtext=text='${escapeFfmpegFilterText(spec.overlayTitle)}'` +
      `:fontcolor=white:fontsize=${fontSize}` +
      `:x=(w-text_w)/2:y=(h-text_h)/2:box=1:boxcolor=black@0.35:boxborderw=20`;
    args.push("-vf", text);
  }

  args.push(
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    "-t",
    String(spec.duration),
    "-f",
    "mp4",
    "-",
  );

  return args;
}
export interface RenderMp4Options {
  ffmpegPath?: string;
}

/**
 * Renders an MP4 by shelling out to ffmpeg, capturing the encoded bytes from
 * stdout into a Buffer. Rejects with the ffmpeg stderr tail when the binary is
 * missing or the encode fails.
 */
export async function renderMp4WithFfmpeg(
  spec: FfmpegRenderSpec,
  opts: RenderMp4Options = {},
): Promise<Buffer> {
  const ffmpegPath = opts.ffmpegPath ?? process.env.FFMPEG_PATH ?? "ffmpeg";
  const args = buildFfmpegArgs(spec);

  return new Promise<Buffer>((resolve, reject) => {
    const child = spawn(ffmpegPath, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const stderr: string[] = [];
    let settled = false;

    child.stdout.on("data", (c: Buffer) => chunks.push(c));
    child.stderr.on("data", (c: Buffer) => {
      const text = c.toString();
      stderr.push(text);
      // Keep a bounded tail so failures don't accumulate unbounded output.
      if (stderr.length > 20) stderr.splice(0, stderr.length - 20);
    });

    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      reject(
        new Error(
          `Failed to start ffmpeg ("${ffmpegPath}"): ${error.message}. ` +
            `Install ffmpeg and ensure it is on PATH, or set FFMPEG_PATH.`,
        ),
      );
    });

    child.on("close", (code) => {
      if (settled) return;
      settled = true;
      if (code !== 0) {
        reject(
          new Error(
            `ffmpeg exited with code ${code}: ${stderr.join("").slice(-1200)}`,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks));
    });
  });
}

export interface FfmpegVideoProviderConfig {
  latencyMs?: number;
  now?: () => number;
  ffmpegPath?: string;
  /** Injectable renderer (used by tests to avoid needing a real ffmpeg). */
  renderImpl?: (spec: FfmpegRenderSpec) => Promise<Buffer>;
}

/**
 * Async two-phase provider that renders a real MP4 with ffmpeg. `submit`
 * encodes the request in the job id; `retrieve` reports `processing` until the
 * (simulated) latency elapses, then runs the encoder and wraps the bytes in a
 * `GenerationResult` that the standard finalize path persists as a video asset.
 */
export class FfmpegVideoProvider implements AsyncVideoGenerationProvider {
  readonly name = "ffmpeg";

  private readonly latencyMs: number;
  private readonly now: () => number;
  private readonly ffmpegPath?: string;
  private readonly renderImpl?: (spec: FfmpegRenderSpec) => Promise<Buffer>;

  constructor(config: FfmpegVideoProviderConfig = {}) {
    this.latencyMs = Math.max(
      0,
      config.latencyMs ??
        Number(process.env.FFMPEG_RENDER_DELAY_MS ?? 1500),
    );
    this.now = config.now ?? (() => Date.now());
    this.ffmpegPath = config.ffmpegPath;
    this.renderImpl = config.renderImpl;
  }

  /** Async providers use `submit` + `retrieve`; `generate` is not used. */
  async generate(_params: VideoGenerationParams): Promise<GenerationResult> {
    throw new Error(
      "FfmpegVideoProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: VideoGenerationParams): Promise<VideoSubmitResult> {
    const startedAt = this.now();
    const digest = createHash("sha1").update(params.prompt).digest("hex");
    return { providerJobId: `ffmpeg_${digest.slice(0, 12)}_${startedAt}` };
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

    const spec = buildFfmpegRenderSpec(params);
    const body = this.renderImpl
      ? await this.renderImpl(spec)
      : await renderMp4WithFfmpeg(spec, { ffmpegPath: this.ffmpegPath });
    const digest = createHash("sha1").update(providerJobId).digest("hex");

    return {
      status: "succeeded",
      result: {
        provider: this.name,
        providerJobId,
        width: spec.width,
        height: spec.height,
        duration: params.duration,
        files: [
          {
            filename: `vortex-render-${digest.slice(0, 8)}.mp4`,
            contentType: "video/mp4",
            body,
          },
        ],
        metadata: {
          provider: "ffmpeg",
          codec: "h264",
          pixelFormat: "yuv420p",
          backgroundColor: spec.backgroundColorHex,
          accentColor: spec.accentHex,
        },
      },
    };
  }
}

// Register the real local renderer. `mock` remains the default; set
// VIDEO_PROVIDER=ffmpeg (with ffmpeg on PATH or FFMPEG_PATH set) to produce
// actual MP4 files end-to-end without any third-party API key.
PROVIDER_REGISTRY.ffmpeg = () => new FfmpegVideoProvider();

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

// ============================================================
// Runway — text-to-video API provider (async two-phase)
// ============================================================
// Production-ready provider backed by the Runway text-to-video API
// (api.dev.runwayml.com). Runway renders asynchronously, so this implements
// the two-phase `AsyncVideoGenerationProvider` capability: `submit()` creates
// a text-to-video task and returns its id, then `retrieve()` is polled until
// the render finishes, at which point the finished MP4 is downloaded and
// wrapped in a `GenerationResult`. Select it with `VIDEO_PROVIDER=runway` and
// set `RUNWAY_API_KEY`. All network access is injected via `fetchImpl` so the
// provider is unit-testable without a real key.
//
// NOTE: modeled on Runway's public API contract (developers.runwayml.com) —
// `POST /v1/text_to_video`, `GET /v1/text_to_video/{id}`, Bearer auth, and
// PENDING/RUNNING/SUCCEEDED/FAILED/THROTTLED task statuses. Verify the exact
// request/response shape against your account before going to production.

export interface RunwayVideoProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

const RUNWAY_DEFAULT_BASE_URL = "https://api.dev.runwayml.com/v1";

/** Runway (gen3a_turbo) renders 5s or 10s clips; round any requested duration. */
export function pickRunwayDuration(seconds: number): string {
  return seconds <= 7.5 ? "5" : "10";
}

/** Map our "W:H" aspect ratio to Runway's "WIDTH:HEIGHT" ratio strings. */
export function runwayRatio(aspectRatio: string): string {
  switch (aspectRatio) {
    case "9:16":
      return "768:1280";
    case "1:1":
      return "768:768";
    default:
      return "1280:768"; // 16:9
  }
}

/** Derive typical output dimensions from an aspect ratio (Runway may omit them). */
export function runwayAspectDimensions(aspectRatio: string): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case "9:16":
      return { width: 768, height: 1280 };
    case "1:1":
      return { width: 768, height: 768 };
    default:
      return { width: 1280, height: 768 };
  }
}

/** Parses a Runway API JSON body into a plain record. */
function runwayJson(body: unknown): Record<string, unknown> {
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

export class RunwayVideoProvider implements AsyncVideoGenerationProvider {
  readonly name = "runway";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(config: RunwayVideoProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.RUNWAY_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? RUNWAY_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.model = config.model ?? process.env.RUNWAY_VIDEO_MODEL ?? "gen3a_turbo";
  }

  async generate(_params: VideoGenerationParams): Promise<GenerationResult> {
    throw new Error(
      "RunwayVideoProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: VideoGenerationParams): Promise<VideoSubmitResult> {
    this.assertConfigured();

    const response = await this.fetchImpl(`${this.baseUrl}/text_to_video`, {
      method: "POST",
      headers: this.authHeaders(),
      body: JSON.stringify({
        model: this.model,
        prompt: params.prompt,
        ratio: runwayRatio(params.aspectRatio),
        duration: pickRunwayDuration(params.duration),
        watermark: false,
      }),
    });
    if (!response.ok) {
      throw new Error(`Runway submit failed with status ${response.status}`);
    }
    const data = runwayJson(await response.json());
    const taskId = data.id;
    if (typeof taskId !== "string" || !taskId) {
      throw new Error("Runway submit returned no task id");
    }
    const status = data.status;
    if (status === "FAILED" || status === "CANCELLED") {
      throw new Error(
        `Runway task failed immediately: ${String(data.error ?? status)}`,
      );
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
      `${this.baseUrl}/text_to_video/${id}`,
      {
        method: "GET",
        headers: this.authHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error(`Runway retrieve failed with status ${response.status}`);
    }
    const data = runwayJson(await response.json());
    const status = data.status;

    if (
      status === "PENDING" ||
      status === "RUNNING" ||
      status === "THROTTLED"
    ) {
      return {
        status: "processing",
        progress:
          typeof data.progress === "number" ? data.progress : undefined,
      };
    }

    if (status === "FAILED" || status === "CANCELLED") {
      return {
        status: "failed",
        error: String(data.error ?? "Runway generation failed"),
      };
    }

    if (status === "SUCCEEDED") {
      const url = this.firstOutputUrl(data.output);
      if (!url) {
        throw new Error("Runway succeeded but returned no video URL");
      }
      const file = await this.downloadVideo(url);
      const dims = runwayAspectDimensions(params.aspectRatio);
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
              filename: `runway-${providerJobId.slice(0, 12)}.mp4`,
              contentType: file.contentType,
              body: file.body,
            },
          ],
          metadata: {
            provider: "runway",
            model: this.model,
            taskId: providerJobId,
          },
        },
      };
    }

    throw new Error(`Runway returned unknown status: ${String(status)}`);
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error(
        "RUNWAY_API_KEY is required when VIDEO_PROVIDER=runway",
      );
    }
  }

  private firstOutputUrl(output: unknown): string | undefined {
    if (Array.isArray(output)) {
      const url = output.find((item) => typeof item === "string");
      return typeof url === "string" && url ? url : undefined;
    }
    if (typeof output === "string" && output) {
      return output;
    }
    return undefined;
  }

  private async downloadVideo(
    url: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(
        `Runway video download failed with status ${res.status}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "video/mp4",
    };
  }
}

// Register the real provider. `mock` remains the default; set VIDEO_PROVIDER=runway
// (with RUNWAY_API_KEY) to render real videos end-to-end.
PROVIDER_REGISTRY.runway = () => new RunwayVideoProvider();

// ============================================================
// Hailuo — MiniMax video-generation API provider (async two-phase)
// ============================================================
// Production-ready provider backed by the MiniMax Hailuo video-generation API
// (api.minimax.chat; api.minimaxi.com for international accounts). Like Kling
// and Runway it is two-phase: `submit()` creates a task and returns its
// `task_id`, then `retrieve()` is polled until the render finishes, at which
// point the finished MP4 is downloaded from `video_url` and wrapped in a
// `GenerationResult`. Select it with `VIDEO_PROVIDER=hailuo` and set
// `HAILUO_API_KEY`. All network access is injected via `fetchImpl` so the
// provider is unit-testable without a real key.
//
// NOTE: modeled on MiniMax's public Hailuo API contract
// (platform.minimaxi.com) — verify the exact request/response shape against
// your account before going to production.

export interface HailuoVideoProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

const HAILUO_DEFAULT_BASE_URL = "https://api.minimax.chat";
const HAILUO_DEFAULT_MODEL = "hailuo-02";

/** MiniMax Hailuo renders 6s or 8s clips; round any requested duration. */
export function pickHailuoDuration(seconds: number): number {
  return seconds <= 7 ? 6 : 8;
}

/** Map our "W:H" aspect ratio to MiniMax's "W:H" strings (default 16:9). */
export function hailuoAspectRatio(aspectRatio: string): string {
  switch (aspectRatio) {
    case "9:16":
      return "9:16";
    case "1:1":
      return "1:1";
    default:
      return "16:9";
  }
}

/** Derive typical output dimensions from an aspect ratio (Hailuo may omit them). */
export function hailuoAspectDimensions(aspectRatio: string): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    default:
      return { width: 1920, height: 1080 };
  }
}

/**
 * Coerces a MiniMax API JSON body into a plain record.
 */
function hailuoBody(body: unknown): Record<string, unknown> {
  return body && typeof body === "object"
    ? (body as Record<string, unknown>)
    : {};
}

/**
 * Parses a MiniMax API JSON body into a plain record, throwing on a non-zero
 * `base_resp.status_code` (MiniMax reports app-level errors in-band, typically
 * with HTTP 200). Used for `submit`, where any error code means the task was
 * not created; `retrieve` parses leniently so a failed render can be mapped
 * to a `{ status: "failed" }` result.
 */
function hailuoJson(body: unknown): Record<string, unknown> {
  const obj = hailuoBody(body);
  const baseResp = obj.base_resp as Record<string, unknown> | undefined;
  const code = baseResp?.status_code;
  if (typeof code === "number" && code !== 0) {
    throw new Error(
      `Hailuo API error (${code}): ${String(baseResp?.status_msg ?? "unknown error")}`,
    );
  }
  return obj;
}

export class HailuoVideoProvider implements AsyncVideoGenerationProvider {
  readonly name = "hailuo";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(config: HailuoVideoProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.HAILUO_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? HAILUO_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.model = config.model ?? process.env.HAILUO_MODEL ?? HAILUO_DEFAULT_MODEL;
  }

  /** Async providers use `submit` + `retrieve`; `generate` is not used. */
  async generate(_params: VideoGenerationParams): Promise<GenerationResult> {
    throw new Error(
      "HailuoVideoProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: VideoGenerationParams): Promise<VideoSubmitResult> {
    this.assertConfigured();

    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/video_generation`,
      {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          model: this.model,
          prompt: params.prompt,
          aspect_ratio: hailuoAspectRatio(params.aspectRatio),
          duration: pickHailuoDuration(params.duration),
          prompt_optimizer: true,
          watermark: false,
          subject_reference: [],
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`Hailuo submit failed with status ${response.status}`);
    }
    const data = hailuoJson(await response.json());
    const taskId = data.task_id;
    if (typeof taskId !== "string" || !taskId) {
      throw new Error("Hailuo submit returned no task id");
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
      `${this.baseUrl}/v1/query/video_generation?task_id=${id}`,
      {
        method: "GET",
        headers: this.authHeaders(),
      },
    );
    if (!response.ok) {
      throw new Error(`Hailuo retrieve failed with status ${response.status}`);
    }
    // Parse leniently (no `base_resp` throw) so a failed render is mapped to a
    // `{ status: "failed" }` result instead of surfacing as a transport error.
    const data = hailuoBody(await response.json());
    const status = data.status;
    const baseResp = data.base_resp as Record<string, unknown> | undefined;
    const statusCode = baseResp?.status_code;

    if (status === "Queueing" || status === "Processing") {
      return { status: "processing" };
    }

    if (status === "Fail") {
      return {
        status: "failed",
        error: String(baseResp?.status_msg ?? "Hailuo generation failed"),
      };
    }

    if (status === "Success") {
      const url = this.firstVideoUrl(data.video_url);
      if (!url) {
        throw new Error("Hailuo succeeded but returned no video URL");
      }
      const file = await this.downloadVideo(url);
      const dims = hailuoAspectDimensions(params.aspectRatio);
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
              filename: `hailuo-${providerJobId.slice(0, 12)}.mp4`,
              contentType: file.contentType,
              body: file.body,
            },
          ],
          metadata: {
            provider: "hailuo",
            model: this.model,
            taskId: providerJobId,
          },
        },
      };
    }

    // No recognized status — surface an in-band API error if one was reported.
    if (typeof statusCode === "number" && statusCode !== 0) {
      throw new Error(
        `Hailuo API error (${statusCode}): ${String(baseResp?.status_msg ?? "unknown error")}`,
      );
    }

    throw new Error(`Hailuo returned unknown status: ${String(status)}`);
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error(
        "HAILUO_API_KEY is required when VIDEO_PROVIDER=hailuo",
      );
    }
  }

  private firstVideoUrl(url: unknown): string | undefined {
    if (typeof url === "string" && url) {
      return url;
    }
    if (url && typeof url === "object") {
      const nested = (url as Record<string, unknown>).url;
      if (typeof nested === "string" && nested) {
        return nested;
      }
    }
    return undefined;
  }

  private async downloadVideo(
    url: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(
        `Hailuo video download failed with status ${res.status}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "video/mp4",
    };
  }
}

// Register the real provider. `mock` remains the default; set
// VIDEO_PROVIDER=hailuo (with HAILUO_API_KEY) to render real videos end-to-end.
PROVIDER_REGISTRY.hailuo = () => new HailuoVideoProvider();

// ============================================================
// WAN — Alibaba Cloud DashScope text-to-video provider (async two-phase)
// ============================================================
// Production-ready provider backed by the DashScope (Alibaba Model Studio)
// text-to-video API (dashscope.aliyuncs.com) for the WAN models. Like Kling,
// Runway and Hailuo it is two-phase: `submit()` creates an async task and
// returns its `task_id`, then `retrieve()` is polled until the render
// finishes, at which point the finished MP4 is downloaded from `video_url`
// and wrapped in a `GenerationResult`. Select it with `VIDEO_PROVIDER=wan`
// and set `WAN_API_KEY`. All network access is injected via `fetchImpl` so
// the provider is unit-testable without a real key.
//
// NOTE: modeled on DashScope's public WAN API contract
// (bailian.console.aliyun.com / alibabacloud.com Model Studio) — verify the
// exact request/response shape against your account before going to
// production.

export interface WanVideoProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

const WAN_DEFAULT_BASE_URL = "https://dashscope.aliyuncs.com/api/v1";
const WAN_DEFAULT_MODEL = "wan2.2-t2v-flash";

/** DashScope WAN renders 5s or 10s clips; round any requested duration. */
export function pickWanDuration(seconds: number): number {
  return seconds <= 7.5 ? 5 : 10;
}

/** Map our "W:H" aspect ratio to DashScope's "WIDTH*HEIGHT" size strings. */
export function wanSize(aspectRatio: string): string {
  switch (aspectRatio) {
    case "9:16":
      return "720*1280";
    case "1:1":
      return "480*480";
    default:
      return "1280*720"; // 16:9
  }
}

/** Derive typical output dimensions from an aspect ratio (WAN may omit them). */
export function wanAspectDimensions(aspectRatio: string): {
  width: number;
  height: number;
} {
  switch (aspectRatio) {
    case "9:16":
      return { width: 720, height: 1280 };
    case "1:1":
      return { width: 480, height: 480 };
    default:
      return { width: 1280, height: 720 };
  }
}

/**
 * Parses a DashScope API JSON envelope, throwing when the top-level `code`
 * indicates an error (DashScope reports failures in-band — e.g. HTTP 200 with
 * `{ "code": "InvalidParameter", "message": "..." }`).
 */
function wanJson(body: unknown): Record<string, unknown> {
  const obj =
    body && typeof body === "object" ? (body as Record<string, unknown>) : {};
  const code = obj.code;
  const codeStr = typeof code === "number" ? String(code) : code;
  if (typeof codeStr === "string" && codeStr !== "" && codeStr !== "0") {
    throw new Error(
      `WAN API error (${codeStr}): ${String(obj.message ?? "unknown error")}`,
    );
  }
  return obj;
}


export class WanVideoProvider implements AsyncVideoGenerationProvider {
  readonly name = "wan";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(config: WanVideoProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.WAN_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? WAN_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.model = config.model ?? process.env.WAN_MODEL ?? WAN_DEFAULT_MODEL;
  }

  /** Async providers use `submit` + `retrieve`; `generate` is not used. */
  async generate(_params: VideoGenerationParams): Promise<GenerationResult> {
    throw new Error(
      "WanVideoProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: VideoGenerationParams): Promise<VideoSubmitResult> {
    this.assertConfigured();

    const response = await this.fetchImpl(
      `${this.baseUrl}/services/aigc/text2video/image-synthesis`,
      {
        method: "POST",
        headers: this.authHeaders(),
        body: JSON.stringify({
          model: this.model,
          input: {
            prompt: params.prompt,
            negative_prompt: params.negativePrompt ?? "",
          },
          parameters: {
            size: wanSize(params.aspectRatio),
            duration: pickWanDuration(params.duration),
            prompt_extend: true,
            watermark: false,
          },
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`WAN submit failed with status ${response.status}`);
    }
    const data = wanJson(await response.json());
    const output = data.output as Record<string, unknown> | undefined;
    const taskId = output?.task_id;
    if (typeof taskId !== "string" || !taskId) {
      throw new Error("WAN submit returned no task id");
    }
    return { providerJobId: taskId };
  }

  async retrieve(
    providerJobId: string,
    params: VideoGenerationParams,
  ): Promise<VideoRetrieveResult> {
    this.assertConfigured();
    const id = encodeURIComponent(providerJobId);
    const response = await this.fetchImpl(`${this.baseUrl}/tasks/${id}`, {
      method: "GET",
      headers: this.authHeaders(),
    });
    if (!response.ok) {
      throw new Error(`WAN retrieve failed with status ${response.status}`);
    }
    const data = wanJson(await response.json());
    const output = (data.output as Record<string, unknown> | undefined) ?? {};
    const status = output.task_status;

    if (status === "PENDING" || status === "RUNNING") {
      return { status: "processing" };
    }

    if (status === "FAILED" || status === "CANCELED") {
      return {
        status: "failed",
        error: String(output.message ?? "WAN generation failed"),
      };
    }

    if (status === "SUCCEEDED") {
      const url = this.firstVideoUrl(output.video_url);
      if (!url) {
        throw new Error("WAN succeeded but returned no video URL");
      }
      const file = await this.downloadVideo(url);
      const dims = wanAspectDimensions(params.aspectRatio);
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
              filename: `wan-${providerJobId.slice(0, 12)}.mp4`,
              contentType: file.contentType,
              body: file.body,
            },
          ],
          metadata: {
            provider: "wan",
            model: this.model,
            taskId: providerJobId,
          },
        },
      };
    }

    throw new Error(`WAN returned unknown task_status: ${String(status)}`);
  }

  private authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      "Content-Type": "application/json",
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error(
        "WAN_API_KEY is required when VIDEO_PROVIDER=wan",
      );
    }
  }

  private firstVideoUrl(url: unknown): string | undefined {
    if (typeof url === "string" && url) {
      return url;
    }
    if (url && typeof url === "object") {
      const nested = (url as Record<string, unknown>).url;
      if (typeof nested === "string" && nested) {
        return nested;
      }
    }
    return undefined;
  }

  private async downloadVideo(
    url: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(
        `WAN video download failed with status ${res.status}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "video/mp4",
    };
  }
}

// Register the real provider. `mock` remains the default; set
// VIDEO_PROVIDER=wan (with WAN_API_KEY) to render real videos end-to-end.
PROVIDER_REGISTRY.wan = () => new WanVideoProvider();

