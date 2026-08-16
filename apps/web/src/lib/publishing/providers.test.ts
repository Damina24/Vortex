import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MetaPublishingProvider,
  MockPublishingProvider,
  PublishingProviderUnavailableError,
  TikTokPublishingProvider,
  YouTubePublishingProvider,
  getPublishingProvider,
} from "./providers";

// --- Response fixtures -----------------------------------------------------

/** Minimal `Response`-like object with headers + an optional JSON body. */
function response({
  ok = true,
  status = 200,
  headers = {},
  jsonBody,
  arrayBuffer,
}: {
  ok?: boolean;
  status?: number;
  headers?: Record<string, string>;
  jsonBody?: unknown;
  arrayBuffer?: ArrayBuffer;
}) {
  return {
    ok,
    status,
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null } as unknown as Headers,
    json: async () => jsonBody ?? {},
    arrayBuffer: async () => arrayBuffer ?? new ArrayBuffer(0),
  } as unknown as Response;
}

const params = {
  platform: "youtube" as const,
  asset: {
    url: "https://cdn.vortex/assets/final.mp4",
    mimeType: "video/mp4",
    sizeBytes: 2048,
    filename: "final.mp4",
  },
  title: "Q3 Launch Teaser",
  description: "A conversion-focused teaser.",
  tags: ["launch", "teaser"],
  visibility: "unlisted" as const,
};

const mockNow = () => new Date("2026-08-15T12:00:00.000Z");

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.YOUTUBE_ACCESS_TOKEN;
});

// --- Mock provider ---------------------------------------------------------

describe("MockPublishingProvider", () => {
  it("is deterministic for identical inputs and produces a shareable URL", async () => {
    const provider = new MockPublishingProvider(mockNow);

    const first = await provider.publish(params);
    const again = await provider.publish(params);

    expect(first.provider).toBe("mock");
    expect(first.platformId).toBe(again.platformId);
    expect(first.publishedAt).toEqual(mockNow());
    expect(first.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=/);
    expect(first.url).toContain(first.platformId);
  });

  it("generates platform-specific ids across platforms", async () => {
    const provider = new MockPublishingProvider(mockNow);
    const tiktok = await provider.publish({ ...params, platform: "tiktok" });
    const meta = await provider.publish({ ...params, platform: "meta" });
    const organic = await provider.publish({ ...params, platform: "organic" });

    expect(tiktok.url).toMatch(/^https:\/\/www\.tiktok\.com\//);
    expect(meta.url).toMatch(/^https:\/\/www\.facebook\.com\//);
    expect(organic.url).toContain("vortex-ai.com");
  });

  it("changes the id when the platform or title changes", async () => {
    const provider = new MockPublishingProvider(mockNow);
    const a = await provider.publish(params);
    const b = await provider.publish({ ...params, title: "Different title" });
    expect(a.platformId).not.toBe(b.platformId);
  });
});

// --- getPublishingProvider registry ----------------------------------------

describe("getPublishingProvider registry", () => {
  it("resolves the mock provider by default", () => {
    expect(getPublishingProvider().name).toBe("mock");
  });

  it("resolves providers by name", () => {
    expect(getPublishingProvider("youtube").name).toBe("youtube");
    expect(getPublishingProvider("tiktok").name).toBe("tiktok");
  });

  it("throws for unregistered providers", () => {
    expect(() => getPublishingProvider("snapchat")).toThrowError(
      PublishingProviderUnavailableError,
    );
    expect(() => getPublishingProvider("snapchat")).toThrowError(
      /"snapchat" is not available/,
    );
  });
});

// --- YouTube (real) provider -----------------------------------------------

describe("YouTubePublishingProvider", () => {
  const assetBytes = new Uint8Array([1, 2, 3, 4, 5]).buffer;

  /** A fetch that downloads the asset, initializes the session, then uploads. */
  function youtubeFetch(opts: {
    resumableUri?: string | null;
    uploadOk?: boolean;
    uploadStatus?: number;
    uploadBody?: unknown;
  } = {}) {
    return vi.fn().mockImplementation(async (url: string) => {
      if (url === params.asset.url) {
        return response({ arrayBuffer: assetBytes });
      }
      const headers =
        opts.resumableUri === undefined
          ? { location: "https://upload.example.com/session/abc" }
          : { location: opts.resumableUri ?? "" };
      if (url.startsWith("https://upload.example.com/")) {
        return response({
          ok: opts.uploadOk ?? true,
          status: opts.uploadStatus ?? 200,
          jsonBody: opts.uploadBody ?? { id: "VIDEO_ID_123" },
        });
      }
      return response({ headers });
    });
  }

  function makeProvider(fetchImpl: typeof fetch) {
    return new YouTubePublishingProvider({
      accessToken: "ya29.test-token",
      fetchImpl,
      now: mockNow,
    });
  }

  it("downloads the asset, uploads via resumable protocol, and returns the video", async () => {
    const fetchMock = youtubeFetch();
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.publish(params);

    expect(fetchMock).toHaveBeenCalledTimes(3);
    // 1) asset download
    expect(fetchMock.mock.calls[0][0]).toBe(params.asset.url);
    // 2) session init
    const [initUrl, initInit] = fetchMock.mock.calls[1] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(initUrl).toContain("uploadType=resumable");
    expect(initInit.headers.Authorization).toBe("Bearer ya29.test-token");
    expect(initInit.headers["X-Upload-Content-Length"]).toBe("5");
    expect(JSON.parse(initInit.body)).toEqual({
      snippet: {
        title: params.title,
        description: params.description,
        tags: params.tags,
      },
      status: { privacyStatus: "unlisted" },
    });
    // 3) final upload
    expect(fetchMock.mock.calls[2][0]).toBe("https://upload.example.com/session/abc");

    expect(result.provider).toBe("youtube");
    expect(result.platformId).toBe("VIDEO_ID_123");
    expect(result.url).toBe("https://www.youtube.com/watch?v=VIDEO_ID_123");
    expect(result.publishedAt).toEqual(mockNow());
    expect(result.metadata.sizeBytes).toBe(5);
  });

  it("throws when no access token is configured", async () => {
    const provider = new YouTubePublishingProvider({
      fetchImpl: (async () => response({})) as unknown as typeof fetch,
    });
    await expect(provider.publish(params)).rejects.toThrow(
      "access token is required",
    );
  });

  it("throws when initialization returns a non-ok response", async () => {
    const fetchMock = youtubeFetch();
    const provider = makeProvider(
      (async (...a: Parameters<typeof fetch>) => {
        if (String(a[0]).includes("uploadType=resumable")) {
          return response({ ok: false, status: 401 });
        }
        return response({ arrayBuffer: assetBytes });
      }) as unknown as typeof fetch,
    );
    await expect(provider.publish(params)).rejects.toThrow("status 401");
  });

  it("throws when initialization omits the resumable URI", async () => {
    const fetchMock = youtubeFetch({ resumableUri: null });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(params)).rejects.toThrow(
      "no resumable session URI",
    );
  });

  it("throws when the final upload fails", async () => {
    const fetchMock = youtubeFetch({ uploadOk: false, uploadStatus: 500 });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(params)).rejects.toThrow("status 500");
  });

  it("throws when upload returns no video id", async () => {
    const fetchMock = youtubeFetch({ uploadBody: {} });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(params)).rejects.toThrow("no video id");
  });

  it("throws when the asset cannot be downloaded first", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      response({ ok: false, status: 404 }),
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(params)).rejects.toThrow(
      "Failed to download asset",
    );
  });

// --- TikTok (real) provider -------------------------------------------------

describe("TikTokPublishingProvider", () => {
  const tiktokParams = { ...params, platform: "tiktok" as const };

  function makeFetch(body: unknown) {
    return vi.fn().mockResolvedValue(
      response({ ok: true, status: 200, jsonBody: body }),
    );
  }

  function makeProvider(fetchImpl: typeof fetch) {
    return new TikTokPublishingProvider({
      accessToken: "tiktok.test-token",
      fetchImpl,
      now: mockNow,
    });
  }

  it("publishes via PULL_FROM_URL and returns the publish_id", async () => {
    const fetchMock = makeFetch({
      data: { publish_id: "TIKTOK_PUBLISH_123" },
    });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.publish(tiktokParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toContain("/v2/post/publish/video/init/");
    expect(init.headers.Authorization).toBe("Bearer tiktok.test-token");
    const body = JSON.parse(init.body);
    expect(body.source_info).toEqual({
      source: "PULL_FROM_URL",
      video_url: params.asset.url,
    });
    expect(body.post_info.title).toBe(params.title);
    expect(body.post_info.privacy_level).toBe("FOLLOWERS"); // "unlisted" default

    expect(result.provider).toBe("tiktok");
    expect(result.platformId).toBe("TIKTOK_PUBLISH_123");
    expect(result.url).toContain("TIKTOK_PUBLISH_123");
    expect(result.publishedAt).toEqual(mockNow());
  });

  it("maps public visibility to PUBLIC_TO_EVERYONE", async () => {
    const fetchMock = makeFetch({ data: { publish_id: "p1" } });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.publish({ ...tiktokParams, visibility: "public" });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).post_info.privacy_level).toBe(
      "PUBLIC_TO_EVERYONE",
    );
  });

  it("maps private visibility to SELF_ONLY", async () => {
    const fetchMock = makeFetch({ data: { publish_id: "p2" } });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.publish({ ...tiktokParams, visibility: "private" });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).post_info.privacy_level).toBe("SELF_ONLY");
  });

  it("throws when no access token is configured", async () => {
    const provider = new TikTokPublishingProvider({
      fetchImpl: (async () => response({})) as unknown as typeof fetch,
    });
    await expect(provider.publish(tiktokParams)).rejects.toThrow(
      "access token is required",
    );
  });

  it("throws when the init call fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(response({ ok: false, status: 401 }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(tiktokParams)).rejects.toThrow("status 401");
  });

  it("throws when no publish_id is returned", async () => {
    const fetchMock = makeFetch({ data: {} });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(tiktokParams)).rejects.toThrow(
      "no publish_id",
    );
  });
});

});


// --- Meta (real) provider ---------------------------------------------------

describe("MetaPublishingProvider", () => {
  const metaParams = { ...params, platform: "meta" as const };

  function makeFetch(body: unknown) {
    return vi.fn().mockResolvedValue(
      response({ ok: true, status: 200, jsonBody: body }),
    );
  }

  function makeProvider(fetchImpl: typeof fetch) {
    return new MetaPublishingProvider({
      accessToken: "meta.test-token",
      pageId: "17841400000000000",
      fetchImpl,
      now: mockNow,
    });
  }

  it("publishes via the Graph API and returns the video id", async () => {
    const fetchMock = makeFetch({ id: "META_VIDEO_123" });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.publish(metaParams);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toBe(
      "https://graph.facebook.com/v21.0/17841400000000000/videos",
    );
    expect(init.headers.Authorization).toBe("Bearer meta.test-token");
    expect(init.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(init.body);
    expect(body.file_url).toBe(params.asset.url);
    expect(body.title).toBe(params.title);
    expect(body.description).toBe(params.description);
    expect(body.published).toBe(true);
        expect(body.privacy).toBe(JSON.stringify({ value: "ALL_FRIENDS" })); // unlisted

    expect(result.provider).toBe("meta");
    expect(result.platformId).toBe("META_VIDEO_123");
    expect(result.url).toBe(
      "https://www.facebook.com/watch/?v=META_VIDEO_123",
    );
    expect(result.publishedAt).toEqual(mockNow());
  });

  it("maps public visibility to EVERYONE", async () => {
    const fetchMock = makeFetch({ id: "v1" });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.publish({ ...metaParams, visibility: "public" });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).privacy).toBe(
      JSON.stringify({ value: "EVERYONE" }),
    );
  });

  it("maps private visibility to SELF", async () => {
    const fetchMock = makeFetch({ id: "v2" });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await provider.publish({ ...metaParams, visibility: "private" });
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    expect(JSON.parse(init.body).privacy).toBe(JSON.stringify({ value: "SELF" }));
  });

  it("throws when no access token is configured", async () => {
    const provider = new MetaPublishingProvider({
      pageId: "123",
      fetchImpl: (async () => response({})) as unknown as typeof fetch,
    });
    await expect(provider.publish(metaParams)).rejects.toThrow(
      "access token is required",
    );
  });

  it("throws when no page id is configured", async () => {
    const provider = new MetaPublishingProvider({
      accessToken: "tok",
      fetchImpl: (async () => response({})) as unknown as typeof fetch,
    });
    await expect(provider.publish(metaParams)).rejects.toThrow(
      "Page id is required",
    );
  });

  it("throws when the Graph API call fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        response({ ok: false, status: 400, jsonBody: { error: { message: "bad" } } }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(metaParams)).rejects.toThrow("status 400");
  });

  it("throws when the response has no video id", async () => {
    const fetchMock = makeFetch({ id: null });
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.publish(metaParams)).rejects.toThrow("no video id");
  });
});

