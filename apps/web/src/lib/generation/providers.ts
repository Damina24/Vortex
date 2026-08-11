import { createHash } from "crypto";

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
