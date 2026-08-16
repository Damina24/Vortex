import { createHash } from "crypto";

/**
 * Platform publishing provider abstraction. Mirrors the AI/generation
 * provider designs (`apps/ai-service/src/llm.py`,
 * `apps/web/src/lib/generation/providers.ts`): every destination platform
 * (YouTube, TikTok, Meta, …) implements the same `publish` interface and is
 * resolved by name through `getPublishingProvider`. A deterministic
 * `MockPublishingProvider` ships for offline development/testing.
 */

export type PublishPlatform =
  "youtube" | "tiktok" | "meta" | "google" | "organic";

export type PublishVisibility = "public" | "unlisted" | "private";

export interface PublishAsset {
  /** Where the finished file lives. Providers fetch these bytes to upload. */
  url: string;
  mimeType: string | null;
  sizeBytes: number | null;
  filename: string;
}

export interface PublishParams {
  platform: PublishPlatform;
  asset: PublishAsset;
  title: string;
  description: string;
  tags?: string[];
  visibility?: PublishVisibility;
}

export interface PublishedResult {
  provider: string;
  platform: PublishPlatform;
  /** The platform's external id (e.g. a YouTube video id). */
  platformId: string;
  /** Canonical shareable URL for the published item. */
  url: string;
  publishedAt: Date;
  metadata: Record<string, unknown>;
}

export interface PublishingProvider {
  readonly name: string;
  publish(params: PublishParams): Promise<PublishedResult>;
}

/** Thrown when an unregistered platform name is requested. */
export class PublishingProviderUnavailableError extends Error {
  platformName: string;

  constructor(platformName: string) {
    super(
      `Publishing provider for platform "${platformName}" is not available. ` +
        `Set PUBLISHING_PROVIDER=mock for local development.`,
    );
    this.name = "PublishingProviderUnavailableError";
    this.platformName = platformName;
  }
}

const PLATFORM_SHARE_ROOT: Record<PublishPlatform, string> = {
  youtube: "https://www.youtube.com/watch?v=",
  tiktok: "https://www.tiktok.com/@vortex/video/",
  meta: "https://www.facebook.com/watch/?v=",
  google: "https://www.youtube.com/watch?v=",
  organic: "https://vortex-ai.com/published/",
};

/**
 * Deterministic offline publishing provider. Never touches the network: given
 * the same inputs it produces the same platform id and a plausible shareable
 * URL. Keeps the full publish → persist flow exercisable end-to-end without
 * any platform credentials.
 */
export class MockPublishingProvider implements PublishingProvider {
  readonly name = "mock";

  constructor(private readonly now: () => Date = () => new Date()) {}

  async publish(params: PublishParams): Promise<PublishedResult> {
    const seed = `${params.platform}:${params.asset.filename}:${params.title}`;
    const digest = createHash("sha1").update(seed).digest("hex");

    let platform: PublishPlatform = params.platform;
    let tokenLength = 12;
    if (platform === "youtube") {
      tokenLength = 11;
    } else if (platform === "tiktok") {
      tokenLength = 15;
    } else if (platform === "meta") {
      tokenLength = 16;
    }
    const platformId = digest.slice(0, tokenLength);

    return {
      provider: this.name,
      platform,
      platformId,
      url: `${PLATFORM_SHARE_ROOT[platform]}${platformId}`,
      publishedAt: this.now(),
      metadata: { mock: true },
    };
  }
}

const PROVIDER_REGISTRY: Record<string, () => PublishingProvider> = {
  mock: () => new MockPublishingProvider(),
};

/**
 * Resolves a publishing provider by platform name. Defaults to the
 * `PUBLISHING_PROVIDER` env var (or `mock` for local development). Unknown
 * names throw `PublishingProviderUnavailableError` so callers can map it to a
 * 503.
 */
export function getPublishingProvider(
  name?: string | null,
): PublishingProvider {
  const key = (name || process.env.PUBLISHING_PROVIDER || "mock").toLowerCase();
  const factory = PROVIDER_REGISTRY[key];
  if (!factory) {
    throw new PublishingProviderUnavailableError(
      name || key || process.env.PUBLISHING_PROVIDER || "",
    );
  }
  return factory();
}

// ============================================================
// YouTube (real) publishing provider
// ============================================================
// Publishes a video to YouTube using the two-step resumable upload protocol of
// the YouTube Data API v3:
//
//   1. `POST /upload/youtube/v3/videos?uploadType=resumable&part=snippet,status`
//      with an OAuth2 `Authorization` header and the snippet/status metadata —
//      the response `Location` header is the resumable upload URI.
//   2. `PUT <resumable-uri>` with the MP4 bytes; a 200/201 response's JSON
//      `id` is the new video id.
//
// The access token is injected via config (falling back to
// `YOUTUBE_ACCESS_TOKEN`) so OAuth obtain/refresh is left to the caller.

export interface YouTubePublishingProviderConfig {
  accessToken?: string;
  baseUrl?: string;
  uploadBaseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injectable clock so `publishedAt` is deterministic in tests. */
  now?: () => Date;
}

const YOUTUBE_DEFAULT_UPLOAD_BASE_URL =
  "https://www.googleapis.com/upload/youtube/v3";
const YOUTUBE_DEFAULT_MIME = "video/mp4";

export class YouTubePublishingProvider implements PublishingProvider {
  readonly name = "youtube";

  private readonly fetchImpl: typeof fetch;
  private readonly accessToken: string;
  private readonly uploadBaseUrl: string;
  private readonly now: () => Date;

  constructor(config: YouTubePublishingProviderConfig = {}) {
    this.accessToken =
      config.accessToken ?? process.env.YOUTUBE_ACCESS_TOKEN ?? "";
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.uploadBaseUrl = (
      config.uploadBaseUrl ?? YOUTUBE_DEFAULT_UPLOAD_BASE_URL
    ).replace(/\/+$/, "");
    this.now = config.now ?? (() => new Date());
  }

  async publish(params: PublishParams): Promise<PublishedResult> {
    this.assertConfigured();

    // Fetch the finished file's bytes so they can be uploaded to the platform.
    const bytes = await this.downloadAsset(params.asset.url);
    const mimeType = params.asset.mimeType || YOUTUBE_DEFAULT_MIME;

    // Step 1: ask YouTube for a resumable upload session.
    const initResponse = await this.fetchImpl(
      `${this.uploadBaseUrl}/videos?uploadType=resumable&part=snippet,status`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
          "X-Upload-Content-Length": String(bytes.length),
          "X-Upload-Content-Type": mimeType,
        },
        body: JSON.stringify({
          snippet: {
            title: params.title,
            description: params.description,
            tags: params.tags ?? [],
          },
          status: {
            privacyStatus: params.visibility ?? "private",
          },
        }),
      },
    );

    if (!initResponse.ok) {
      throw new Error(
        `YouTube upload initialization failed with status ${initResponse.status}`,
      );
    }

    const resumableUri = initResponse.headers.get("location");
    if (!resumableUri) {
      throw new Error(
        "YouTube upload initialization returned no resumable session URI",
      );
    }

    // Step 2: stream the file bytes into the resumable session.
    const uploadResponse = await this.fetchImpl(resumableUri, {
      method: "PUT",
      headers: {
        "Content-Type": mimeType,
        "Content-Length": String(bytes.length),
      },
      body: new Uint8Array(bytes),
    });

    if (!uploadResponse.ok) {
      throw new Error(
        `YouTube upload failed with status ${uploadResponse.status}`,
      );
    }

    const result = (await uploadResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const videoId = result.id;
    if (typeof videoId !== "string" || !videoId) {
      throw new Error("YouTube upload returned no video id");
    }

    return {
      provider: this.name,
      platform: "youtube",
      platformId: videoId,
      url: `https://www.youtube.com/watch?v=${videoId}`,
      publishedAt: this.now(),
      metadata: { mimeType, sizeBytes: bytes.length },
    };
  }

  private assertConfigured(): void {
    if (!this.accessToken) {
      throw new Error(
        "A YouTube access token is required to publish (YOUTUBE_ACCESS_TOKEN)",
      );
    }
  }

  private async downloadAsset(url: string): Promise<Buffer> {
    const res = await this.fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(
        `Failed to download asset for publishing: status ${res.status}`,
      );
    }
    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }
}

// Register the real YouTube provider alongside mock. The default stays `mock`.
PROVIDER_REGISTRY.youtube = () => new YouTubePublishingProvider();

// ============================================================
// TikTok (real) publishing provider
// ============================================================
// Publishes a video to TikTok using the Content Posting API
// ("post /publish/video"). This provider uses the server-to-server
// `PULL_FROM_URL` source: rather than uploading file bytes, it hands TikTok the
// finished asset's URL and TikTok pulls it.
//
//   `POST {baseUrl}/v2/post/publish/video/init/`
//     Authorization: Bearer <access_token>   (scope: video.publish)
//     body: { source_info: { source: "PULL_FROM_URL", video_url }, post_info }
//     → `data.publish_id` (the job id we persist as the platform id)
//
// The access token is injected via config (falling back to
// `TIKTOK_ACCESS_TOKEN`). The message/status of the published item is left to
// TikTok's async processing; `publish_id` is returned immediately so the job
// can be tracked.

export interface TikTokPublishingProviderConfig {
  accessToken?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  /** Injectable clock so `publishedAt` is deterministic in tests. */
  now?: () => Date;
}

const TIKTOK_DEFAULT_BASE_URL = "https://open.tiktokapis.com";

/** Maps VORTEX visibility → TikTok `post_info.privacy_level`. */
function toTikTokPrivacy(visibility: PublishVisibility | undefined): string {
  switch (visibility) {
    case "public":
      return "PUBLIC_TO_EVERYONE";
    case "unlisted":
      return "FOLLOWERS";
    default:
      return "SELF_ONLY";
  }
}

export class TikTokPublishingProvider implements PublishingProvider {
  readonly name = "tiktok";

  private readonly fetchImpl: typeof fetch;
  private readonly accessToken: string;
  private readonly baseUrl: string;
  private readonly now: () => Date;

  constructor(config: TikTokPublishingProviderConfig = {}) {
    this.accessToken =
      config.accessToken ?? process.env.TIKTOK_ACCESS_TOKEN ?? "";
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.baseUrl = (config.baseUrl ?? TIKTOK_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.now = config.now ?? (() => new Date());
  }

  async publish(params: PublishParams): Promise<PublishedResult> {
    this.assertConfigured();

    const initResponse = await this.fetchImpl(
      `${this.baseUrl}/v2/post/publish/video/init/`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          "Content-Type": "application/json; charset=UTF-8",
        },
        body: JSON.stringify({
          source_info: {
            source: "PULL_FROM_URL",
            video_url: params.asset.url,
          },
          post_info: {
            title: params.title,
            privacy_level: toTikTokPrivacy(params.visibility),
            disable_comment: false,
            disable_duet: false,
            disable_stitch: false,
          },
        }),
      },
    );

    if (!initResponse.ok) {
      throw new Error(
        `TikTok publish init failed with status ${initResponse.status}`,
      );
    }

    const payload = (await initResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const data =
      payload.data && typeof payload.data === "object"
        ? (payload.data as Record<string, unknown>)
        : {};
    const publishId = data.publish_id;

    if (typeof publishId !== "string" || !publishId) {
      throw new Error("TikTok publish init returned no publish_id");
    }

    return {
      provider: this.name,
      platform: "tiktok",
      platformId: publishId,
      url: `https://www.tiktok.com/@vortex/video/${publishId}`,
      publishedAt: this.now(),
      metadata: { publishId },
    };
  }

  private assertConfigured(): void {
    if (!this.accessToken) {
      throw new Error(
        "A TikTok access token is required to publish (TIKTOK_ACCESS_TOKEN)",
      );
    }
  }
}

// Register the real TikTok provider alongside mock and YouTube. Default stays
// `mock`.
PROVIDER_REGISTRY.tiktok = () => new TikTokPublishingProvider();

// ============================================================
// Meta (real) publishing provider
// ============================================================
// Publishes a video to a Facebook Page using the Meta Graph API:
//
//   `POST {baseUrl}/{apiVersion}/{pageId}/videos`
//     Authorization: Bearer <page_access_token>
//     body: { file_url, title, description, published: true, privacy }
//     → { id: <video_id> }   (persisted as the platform id)
//
// Like the TikTok provider it uses `file_url`, so Meta pulls the finished
// asset from its URL server-to-server rather than receiving uploaded bytes.
// The access token must be a Page-scoped token for `pageId`; obtaining and
// refreshing it is left to the caller. `accountId` in `PublishParams` is
// currently unused — the page is fixed via config/env so the same token grants
// a single target, which is the common "channel" model.

export interface MetaPublishingProviderConfig {
  accessToken?: string;
  pageId?: string;
  baseUrl?: string;
  apiVersion?: string;
  fetchImpl?: typeof fetch;
  /** Injectable clock so `publishedAt` is deterministic in tests. */
  now?: () => Date;
}

const META_DEFAULT_BASE_URL = "https://graph.facebook.com";
const META_DEFAULT_API_VERSION = "v21.0";

/** Maps VORTEX visibility → Meta Graph API `privacy.value`. */
function toMetaPrivacy(visibility: PublishVisibility | undefined): string {
  switch (visibility) {
    case "public":
      return "EVERYONE";
    case "unlisted":
      return "ALL_FRIENDS";
    default:
      return "SELF";
  }
}

export class MetaPublishingProvider implements PublishingProvider {
  readonly name = "meta";

  private readonly fetchImpl: typeof fetch;
  private readonly accessToken: string;
  private readonly pageId: string;
  private readonly baseUrl: string;
  private readonly apiVersion: string;
  private readonly now: () => Date;

  constructor(config: MetaPublishingProviderConfig = {}) {
    this.accessToken =
      config.accessToken ?? process.env.META_ACCESS_TOKEN ?? "";
    this.pageId = config.pageId ?? process.env.META_PAGE_ID ?? "";
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.baseUrl = (config.baseUrl ?? META_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.apiVersion = config.apiVersion ?? META_DEFAULT_API_VERSION;
    this.now = config.now ?? (() => new Date());
  }

  async publish(params: PublishParams): Promise<PublishedResult> {
    this.assertConfigured();

    const uploadUrl = `${this.baseUrl}/${this.apiVersion}/${this.pageId}/videos`;
    const initResponse = await this.fetchImpl(uploadUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        file_url: params.asset.url,
        title: params.title,
        description: params.description,
        published: true,
        privacy: JSON.stringify({
          value: toMetaPrivacy(params.visibility),
        }),
      }),
    });

    if (!initResponse.ok) {
      throw new Error(`Meta publish failed with status ${initResponse.status}`);
    }

    const payload = (await initResponse.json().catch(() => ({}))) as Record<
      string,
      unknown
    >;
    const videoId = payload.id;

    if (typeof videoId !== "string" || !videoId) {
      throw new Error("Meta publish returned no video id");
    }

    return {
      provider: this.name,
      platform: "meta",
      platformId: videoId,
      url: `https://www.facebook.com/watch/?v=${videoId}`,
      publishedAt: this.now(),
      metadata: { videoId },
    };
  }

  private assertConfigured(): void {
    if (!this.accessToken) {
      throw new Error(
        "A Meta access token is required to publish (META_ACCESS_TOKEN)",
      );
    }
    if (!this.pageId) {
      throw new Error("A Meta Page id is required to publish (META_PAGE_ID)");
    }
  }
}

// Register the real Meta provider alongside mock, YouTube and TikTok. Default
// stays `mock`.
PROVIDER_REGISTRY.meta = () => new MetaPublishingProvider();
