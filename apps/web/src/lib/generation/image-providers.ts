import { createHash } from "crypto";
import {
  IMAGE_PROVIDER_CATALOG,
  type ImageProviderInfo,
} from "./image-providers-catalog";
import type { GeneratedFile } from "./providers";
import { buildPosterSvg } from "./providers";

/**
 * Image generation provider abstraction. Mirrors the audio/video generation
 * provider design: real image providers (Stability, FLUX, …) implement the same
 * interface and are resolved by name through `getImageProvider`.
 */

export interface ImageGenerationParams {
  prompt: string;
  aspectRatio: string;
  style?: string | null;
  projectName?: string | null;
}

export interface ImageGenerationResult {
  provider: string;
  /** The provider's external job id (only meaningful for remote providers). */
  providerJobId: string;
  width: number;
  height: number;
  files: GeneratedFile[];
  metadata: Record<string, unknown>;
}

export interface ImageGenerationProvider {
  readonly name: string;
  generate(params: ImageGenerationParams): Promise<ImageGenerationResult>;
}

/** Thrown when an unregistered provider name is requested. */
export class ImageProviderUnavailableError extends Error {
  providerName: string;

  constructor(providerName: string) {
    super(
      `Image generation provider "${providerName}" is not available. ` +
        `Set IMAGE_PROVIDER=mock for local development.`,
    );
    this.name = "ImageProviderUnavailableError";
    this.providerName = providerName;
  }
}

// --- Async (two-phase) image providers -------------------------------------
// Real image providers (FLUX via the BFL API) submit a generation and return a
// `providerJobId` immediately, then expose a `retrieve` call that is polled
// until the image is ready — mirroring the async video/audio providers.

export interface ImageSubmitResult {
  providerJobId: string;
}

export type ImageRetrieveResult =
  | { status: "processing"; progress?: number }
  | { status: "succeeded"; result: ImageGenerationResult }
  | { status: "failed"; error: string };

export interface AsyncImageGenerationProvider extends ImageGenerationProvider {
  submit(params: ImageGenerationParams): Promise<ImageSubmitResult>;
  /** `params` mirrors the original request; real providers may ignore it. */
  retrieve(
    providerJobId: string,
    params: ImageGenerationParams,
  ): Promise<ImageRetrieveResult>;
}

/** Capability check: is this provider two-phase (submit/poll/complete)? */
export function isAsyncImageProvider(
  provider: ImageGenerationProvider,
): provider is AsyncImageGenerationProvider {
  return typeof (provider as AsyncImageGenerationProvider).submit === "function";
}

const IMAGE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  "16:9": { width: 1920, height: 1080 },
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

const IMAGE_DEFAULT_DIMENSIONS = { width: 1280, height: 720 };

/** Derive typical output dimensions from an aspect ratio (providers may omit them). */
export function imageDimensionsFor(aspectRatio: string): {
  width: number;
  height: number;
} {
  return IMAGE_DIMENSIONS[aspectRatio] ?? IMAGE_DEFAULT_DIMENSIONS;
}

/**
 * Deterministic offline render provider. Simulates render latency (a
 * configurable delay via `MOCK_IMAGE_DELAY_MS`) and produces an SVG poster
 * stand-in exactly like the mock video provider. Never fires network requests,
 * so it works with zero API keys.
 */
export class MockImageProvider implements ImageGenerationProvider {
  readonly name = "mock";

  async generate(
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    const delayMs = Math.max(0, Number(process.env.MOCK_IMAGE_DELAY_MS ?? 0));
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const dims = imageDimensionsFor(params.aspectRatio);
    const svg = buildPosterSvg({
      width: dims.width,
      height: dims.height,
      prompt: params.prompt,
      duration: 1,
      aspectRatio: params.aspectRatio,
    });
    const digest = createHash("sha1").update(params.prompt).digest("hex");

    return {
      provider: this.name,
      providerJobId: `mock_image_${digest.slice(0, 12)}`,
      width: dims.width,
      height: dims.height,
      files: [
        {
          filename: `mock-image-${digest.slice(0, 8)}.svg`,
          contentType: "image/svg+xml",
          body: Buffer.from(svg, "utf8"),
        },
      ],
      metadata: {
        mock: true,
        format: "svg-postcard",
        aspectRatio: params.aspectRatio,
      },
    };
  }
}

const IMAGE_PROVIDER_REGISTRY: Record<string, () => ImageGenerationProvider> = {
  mock: () => new MockImageProvider(),
};

// ============================================================
// Stability AI — real image generation provider (sync)
// ============================================================
// Real provider backed by the Stability AI Stable Image Core API
// (`POST /v2beta/stable-image/generate/core`), authenticated with a Bearer
// key. The response body is returned directly as a PNG image asset, so it is
// synchronous like the OpenAI TTS audio provider. Select it with
// `IMAGE_PROVIDER=stability` and set `STABILITY_API_KEY`.

export interface StabilityImageProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

const STABILITY_DEFAULT_BASE_URL = "https://api.stability.ai";

/** Builds a small `multipart/form-data` body for the Stability endpoint. */
function buildMultipart(
  fields: Record<string, string>,
  boundary: string,
): string {
  const parts = Object.entries(fields).map(
    ([key, value]) =>
      `--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${value}\r\n`,
  );
  parts.push(`--${boundary}--\r\n`);
  return parts.join("");
}

export class StabilityImageProvider implements ImageGenerationProvider {
  readonly name = "stability";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(config: StabilityImageProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.STABILITY_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? STABILITY_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  async generate(
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      throw new Error(
        "STABILITY_API_KEY is required when IMAGE_PROVIDER=stability",
      );
    }

    const boundary = `vortex-${Date.now().toString(36)}-${Math.random()
      .toString(36)
      .slice(2)}`;
    const fields: Record<string, string> = {
      prompt: params.prompt,
      aspect_ratio: params.aspectRatio,
      output_format: "png",
    };
    if (params.style) fields.style_preset = params.style;

    const response = await this.fetchImpl(
      `${this.baseUrl}/v2beta/stable-image/generate/core`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "image/*",
          "Content-Type": `multipart/form-data; boundary=${boundary}`,
        },
        body: buildMultipart(fields, boundary),
      },
    );

    if (!response.ok) {
      throw new Error(
        `Stability AI generate request failed with status ${response.status}`,
      );
    }

    const contentType =
      response.headers.get("content-type") ?? "image/png";
    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);
    const dims = imageDimensionsFor(params.aspectRatio);
    const digest = createHash("sha1")
      .update(`${params.prompt}:${params.aspectRatio}`)
      .digest("hex");

    return {
      provider: this.name,
      providerJobId: `stability_img_${digest.slice(0, 12)}`,
      width: dims.width,
      height: dims.height,
      files: [
        {
          filename: `stability-${digest.slice(0, 8)}.png`,
          contentType,
          body,
        },
      ],
      metadata: {
        model: "stable-image-core",
        aspectRatio: params.aspectRatio,
        format: "png",
        provider: "stability",
      },
    };
  }
}

// Register the real provider alongside mock. The default remains `mock`.
IMAGE_PROVIDER_REGISTRY.stability = () => new StabilityImageProvider();

// ============================================================
// FLUX — Black Forest Labs image API provider (async two-phase)
// ============================================================
// Production-ready provider backed by the Black Forest Labs FLUX API
// (`api.bfl.ai`): `POST /v1/images/generations/{model}` kicks off a generation
// and returns its id, then `GET /v1/images/generations/{id}` is polled until
// the task is `Ready`, at which point `result.sample` (a JSON/base64 image
// payload) is decoded into a PNG asset. Select it with `IMAGE_PROVIDER=flux`
// and set `FLUX_API_KEY`.
//
// NOTE: modeled on the public BFL API contract — verify the exact request/
// response shape against bfl.ai before going to production.

export interface FluxImageProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

const FLUX_DEFAULT_BASE_URL = "https://api.bfl.ai";
const FLUX_DEFAULT_MODEL = "flux-pro-1.1";

export class FluxImageProvider implements AsyncImageGenerationProvider {
  readonly name = "flux";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(config: FluxImageProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.FLUX_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? FLUX_DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.model = config.model ?? process.env.FLUX_MODEL ?? FLUX_DEFAULT_MODEL;
  }

  /** FLUX is two-phase: use `submit()` then `retrieve()` (polled by the API). */
  async generate(
    _params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    throw new Error(
      "FluxImageProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: ImageGenerationParams): Promise<ImageSubmitResult> {
    this.assertConfigured();

    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/images/generations/${encodeURIComponent(this.model)}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          prompt: params.prompt,
          aspect_ratio: params.aspectRatio,
          output_format: "png",
        }),
      },
    );
    if (!response.ok) {
      throw new Error(`FLUX submit failed with status ${response.status}`);
    }

    const data = (await response.json()) as Record<string, unknown>;
    if (typeof data.error === "string" && data.error) {
      throw new Error(`FLUX submit failed: ${data.error}`);
    }
    const id = typeof data.id === "string" ? (data.id as string) : undefined;
    if (!id) {
      throw new Error("FLUX submit returned no generation id");
    }
    return { providerJobId: id };
  }

  async retrieve(
    providerJobId: string,
    params: ImageGenerationParams,
  ): Promise<ImageRetrieveResult> {
    this.assertConfigured();
    return this.retrieveChecked(providerJobId, params);
  }

  private async retrieveChecked(
    providerJobId: string,
    params: ImageGenerationParams,
  ): Promise<ImageRetrieveResult> {
    const id = encodeURIComponent(providerJobId);
    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/images/generations/${id}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!response.ok) {
      throw new Error(`FLUX retrieve failed with status ${response.status}`);
    }

    const data = (await response.json()) as { status?: unknown } & Record<
      string,
      unknown
    >;
    const status =
      typeof data.status === "string" ? data.status.toUpperCase() : "";

    if (
      status === "PENDING" ||
      status === "PROCESSING" ||
      status === "TASK_PROGRESS"
    ) {
      return { status: "processing" };
    }

    if (
      status === "FAILED" ||
      status === "REVOKED" ||
      typeof data.error === "string"
    ) {
      return {
        status: "failed",
        error: String(data.error ?? data.message ?? "FLUX generation failed"),
      };
    }

    return this.finishSucceeded(providerJobId, params, data);
  }

  private async finishSucceeded(
    providerJobId: string,
    params: ImageGenerationParams,
    data: { status?: unknown } & Record<string, unknown>,
  ): Promise<ImageRetrieveResult> {
    const status =
      typeof data.status === "string" ? data.status.toUpperCase() : "";
    if (status !== "READY" && status !== "SUCCESS" && status !== "SUCCEEDED") {
      // Unknown status — keep polling.
      return { status: "processing" };
    }

    const result =
      typeof data.result === "object" && data.result !== null
        ? (data.result as Record<string, unknown>)
        : {};
    const sample =
      typeof result.sample === "string" ? (result.sample as string) : "";
    const imageUrl =
      typeof result.image_url === "string" ? (result.image_url as string) : "";

    let file: { body: Buffer; contentType: string };
    if (sample) {
      let b64 = sample.trim();
      // Some responses wrap the base64 in JSON (quoted string or array).
      if (b64.startsWith("[") || b64.startsWith("\"")) {
        try {
          const parsed = JSON.parse(b64) as unknown;
          if (Array.isArray(parsed)) b64 = String(parsed[0] ?? "");
          else b64 = String(parsed);
        } catch {
          // Fall through to the raw payload.
        }
      }
      const comma = b64.indexOf(",");
      if (comma >= 0 && /^data:/i.test(b64.slice(0, 20))) {
        b64 = b64.slice(comma + 1);
      }
      if (!b64) {
        throw new Error("FLUX succeeded but returned an empty image payload");
      }
      file = { body: Buffer.from(b64, "base64"), contentType: "image/png" };
    } else if (imageUrl) {
      file = await this.downloadImage(imageUrl);
    } else {
      throw new Error("FLUX succeeded but returned no image data");
    }

    const dims = imageDimensionsFor(params.aspectRatio);
    const digest = createHash("sha1").update(providerJobId).digest("hex");

    return {
      status: "succeeded",
      result: {
        provider: this.name,
        providerJobId,
        width: dims.width,
        height: dims.height,
        files: [
          {
            filename: `flux-${digest.slice(0, 8)}.png`,
            contentType: file.contentType,
            body: file.body,
          },
        ],
        metadata: {
          model: this.model,
          aspectRatio: params.aspectRatio,
          format: "png",
          provider: "flux",
        },
      },
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error("FLUX_API_KEY is required when IMAGE_PROVIDER=flux");
    }
  }

  private async downloadImage(
    url: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`FLUX image download failed with status ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "image/png",
    };
  }
}

// Register the real async provider. The default remains `mock`.
IMAGE_PROVIDER_REGISTRY.flux = () => new FluxImageProvider();

// ============================================================
// OpenAI — gpt-image image generation provider (sync)
// ============================================================
// Production-ready provider backed by the OpenAI Images API
// (`POST /v1/images/generations`, Bearer key). gpt-image-1 returns the rendered
// image inline as base64 when `response_format: "b64_json"` is requested, so it
// is synchronous like the Stability provider: one request produces a PNG asset.
// Select it with `IMAGE_PROVIDER=gpt-image` and set `OPENAI_API_KEY`.

export interface OpenAIImageProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
  quality?: string;
}

const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com";
const OPENAI_DEFAULT_IMAGE_MODEL = "gpt-image-1";
const OPENAI_DEFAULT_QUALITY = "high";

/**
 * Maps an aspect ratio to the closest size the OpenAI Images API accepts
 * (`1536x1024`, `1024x1536`, `1024x1024`, or `auto`). gpt-image-1 has no
 * 4:5 size, so it falls back to the portrait `1024x1536`.
 */
function openAiImageSizeFor(aspectRatio: string): string {
  switch (aspectRatio) {
    case "16:9":
      return "1536x1024";
    case "9:16":
    case "4:5":
      return "1024x1536";
    default:
      return "1024x1024";
  }
}

export class OpenAIImageProvider implements ImageGenerationProvider {
  readonly name = "gpt-image";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;
  private readonly quality: string;

  constructor(config: OpenAIImageProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.OPENAI_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? OPENAI_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.model =
      config.model ?? process.env.OPENAI_IMAGE_MODEL ?? OPENAI_DEFAULT_IMAGE_MODEL;
    this.quality =
      config.quality ??
      process.env.OPENAI_IMAGE_QUALITY ??
      OPENAI_DEFAULT_QUALITY;
  }

  async generate(
    params: ImageGenerationParams,
  ): Promise<ImageGenerationResult> {
    if (!this.apiKey) {
      throw new Error(
        "OPENAI_API_KEY is required when IMAGE_PROVIDER=gpt-image",
      );
    }

    // gpt-image-1 encodes style and composition in the prompt text (it has no
    // separate style-preset field), so fold the optional style hint in rather
    // than silently dropping it.
    const prompt = params.style
      ? `${params.prompt}, ${params.style} style`
      : params.prompt;

    const response = await this.fetchImpl(
      `${this.baseUrl}/v1/images/generations`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: this.model,
          prompt,
          n: 1,
          size: openAiImageSizeFor(params.aspectRatio),
          quality: this.quality,
          response_format: "b64_json",
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `OpenAI image request failed with status ${response.status}`,
      );
    }

    const data = (await response.json()) as { data?: unknown };
    const items = Array.isArray(data.data) ? data.data : [];
    const item = items[0] as Record<string, unknown> | undefined;
    let b64 =
      item && typeof item.b64_json === "string" ? (item.b64_json as string) : "";

    // gpt-image occasionally wraps the base64 payload in JSON (a quoted string
    // or array); unwrap it before decoding.
    if (b64.startsWith("[") || b64.startsWith("\"")) {
      try {
        const parsed = JSON.parse(b64) as unknown;
        if (Array.isArray(parsed)) b64 = String(parsed[0] ?? "");
        else b64 = String(parsed);
      } catch {
        // Fall through to the raw payload.
      }
    }
    const comma = b64.indexOf(",");
    if (comma >= 0 && /^data:/i.test(b64.slice(0, 20))) {
      b64 = b64.slice(comma + 1);
    }
    if (!b64) {
      throw new Error("OpenAI succeeded but returned no image payload");
    }

    const body = Buffer.from(b64, "base64");
    const dims = imageDimensionsFor(params.aspectRatio);
    const digest = createHash("sha1")
      .update(`${params.prompt}:${params.aspectRatio}`)
      .digest("hex");

    return {
      provider: this.name,
      providerJobId: `gpt_image_${digest.slice(0, 12)}`,
      width: dims.width,
      height: dims.height,
      files: [
        {
          filename: `gpt-image-${digest.slice(0, 8)}.png`,
          contentType: "image/png",
          body,
        },
      ],
      metadata: {
        model: this.model,
        aspectRatio: params.aspectRatio,
        format: "png",
        provider: "gpt-image",
      },
    };
  }
}

// Register the real synchronous provider. The default remains `mock`.
IMAGE_PROVIDER_REGISTRY["gpt-image"] = () => new OpenAIImageProvider();

/** Providers that generate without any external credentials. */
const KEYLESS_IMAGE_PROVIDERS = new Set(["mock"]);

/**
 * Reports which image providers are wired up on this deployment by reading the
 * credential env vars each real provider requires. Only call this server-side
 * (server component / API route); the values are deployment configuration.
 */
export function getImageProviderAvailability(): ImageProviderInfo[] {
  return IMAGE_PROVIDER_CATALOG.map(({ value, label }) => {
    const reason = missingImageProviderCredentials(value);
    return reason
      ? { name: value, label, available: false, reason }
      : { name: value, label, available: true };
  });
}

/** Returns the missing credential names (or undefined when ready to generate). */
function missingImageProviderCredentials(name: string): string | undefined {
  if (KEYLESS_IMAGE_PROVIDERS.has(name)) {
    return undefined;
  }
  const required: string[] = [];
  switch (name) {
    case "stability":
      required.push("STABILITY_API_KEY");
      break;
    case "flux":
      required.push("FLUX_API_KEY");
      break;
    case "gpt-image":
      required.push("OPENAI_API_KEY");
      break;
    default:
      return undefined;
  }
  const missing = required.filter((env) => !process.env[env]);
  return missing.length > 0
    ? `Requires ${missing.join(" + ")} env var${missing.length > 1 ? "s" : ""}`
    : undefined;
}

/**
 * Resolves an image generation provider by name. Defaults to the
 * `IMAGE_PROVIDER` env var (or `mock` for local development). Unknown names
 * throw `ImageProviderUnavailableError` so callers can map it to a 503.
 */
export function getImageProvider(
  name?: string | null,
): ImageGenerationProvider {
  const key = (name || process.env.IMAGE_PROVIDER || "mock").toLowerCase();
  const factory = IMAGE_PROVIDER_REGISTRY[key];
  if (!factory) {
    throw new ImageProviderUnavailableError(
      name || key || process.env.IMAGE_PROVIDER || "",
    );
  }
  return factory();
}