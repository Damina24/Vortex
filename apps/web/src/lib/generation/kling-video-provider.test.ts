import { afterEach, describe, expect, it, vi } from "vitest";
import {
  KlingVideoProvider,
  buildKlingAuthHeaders,
  getVideoProvider,
  isAsyncVideoProvider,
  klingAspectDimensions,
  pickKlingDuration,
} from "./providers";
import type { AsyncVideoGenerationProvider } from "./providers";
import { createHmac } from "crypto";

// --- Response fixtures -----------------------------------------------------

/** Minimal `Response`-like object with a JSON body. */
function jsonResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
    headers: { get: () => null } as unknown as Headers,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

/** Minimal `Response`-like object with a binary (video) body. */
function binaryResponse(bytes: number[], contentType = "video/mp4") {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    headers: { get: (_k: string) => contentType } as unknown as Headers,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    body: null,
  } as unknown as Response;
}

const successEnvelope = (data: unknown) => ({ code: 0, message: "success", data });

const TASK_ID = "kling-task-123";

function makeProvider(fetchImpl: typeof fetch) {
  return new KlingVideoProvider({
    apiKey: "ak-test",
    apiSecret: "sk-test",
    fetchImpl,
    timestampProvider: () => 1_718_889_260,
  });
}

const params = {
  prompt: "A drone flying over mountains at sunset",
  negativePrompt: "blurry, low quality",
  aspectRatio: "16:9",
  duration: 8,
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.KLING_API_KEY;
  delete process.env.KLING_API_SECRET;
});

// --- Helpers ---------------------------------------------------------------

describe("pickKlingDuration", () => {
  it("rounds to the supported 5s or 10s clips", () => {
    expect(pickKlingDuration(3)).toBe("5");
    expect(pickKlingDuration(8)).toBe("10");
    expect(pickKlingDuration(7.5)).toBe("5");
    expect(pickKlingDuration(7.6)).toBe("10");
  });
});

describe("klingAspectDimensions", () => {
  it("maps known aspect ratios and defaults otherwise", () => {
    expect(klingAspectDimensions("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(klingAspectDimensions("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(klingAspectDimensions("16:9")).toEqual({ width: 1280, height: 720 });
  });
});

describe("buildKlingAuthHeaders", () => {
  it("computes the HMAC-SHA256 signature over the timestamp", () => {
    const headers = buildKlingAuthHeaders({
      apiKey: "ak",
      apiSecret: "sk",
      timestamp: 1_718_900_000,
    });
    const expected = createHmac("sha256", "sk")
      .update("1718900000")
      .digest("hex");
    expect(headers["Api-Key"]).toBe("ak");
    expect(headers["Api-Secret"]).toBe("sk");
    expect(headers.Timestamp).toBe("1718900000");
    expect(headers.Signature).toBe(expected);
  });

  it("adds Content-Type only for JSON bodies", () => {
    const withBody = buildKlingAuthHeaders({
      apiKey: "a",
      apiSecret: "b",
      timestamp: 1,
      expectJsonBody: true,
    });
    expect(withBody["Content-Type"]).toBe("application/json");
    const withoutBody = buildKlingAuthHeaders({
      apiKey: "a",
      apiSecret: "b",
      timestamp: 1,
    });
    expect(withoutBody["Content-Type"]).toBeUndefined();
  });
});
// --- Provider --------------------------------------------------------------

describe("KlingVideoProvider", () => {
  it("is classified as an async (two-phase) provider", () => {
    expect(
      isAsyncVideoProvider(new KlingVideoProvider({ apiKey: "a", apiSecret: "b" })),
    ).toBe(true);
  });

  it("rejects direct generate() calls", async () => {
    const provider = makeProvider(
      (async () => jsonResponse({})) as unknown as typeof fetch,
    );
    await expect(
      provider.generate({ prompt: "x", aspectRatio: "16:9", duration: 5 }),
    ).rejects.toThrow("two-phase");
  });

  it("submits the correct request and returns the task id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(successEnvelope({ task_id: TASK_ID, task_status: "submitted" })),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const submitted = await provider.submit(params);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://api.klingai.com/v1/videos/text2video");
    expect(init.method).toBe("POST");
    expect(init.headers["Content-Type"]).toBe("application/json");
    expect(init.headers["Api-Key"]).toBe("ak-test");
    expect(init.headers.Signature).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.parse(init.body)).toMatchObject({
      model_name: "kling-v1",
      prompt: params.prompt,
      negative_prompt: params.negativePrompt,
      mode: "std",
      aspect_ratio: "16:9",
      duration: "10", // 8s rounds up to the 10s clip
    });
    expect(submitted.providerJobId).toBe(TASK_ID);
  });

  it("returns processing while the Kling task is running", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(successEnvelope({ task_id: TASK_ID, task_status: "processing" })),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, params);
    expect(res.status).toBe("processing");
  });

  it("returns failed with the provider message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          successEnvelope({
            task_id: TASK_ID,
            task_status: "failed",
            task_status_msg: "content rejected",
          }),
        ),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, params);
    expect(res.status).toBe("failed");
    if (res.status === "failed") {
      expect(res.error).toBe("content rejected");
    }
  });

  it("downloads the finished video and wraps it in a GenerationResult", async () => {
    const videoUrl = "https://cdn.klingai.com/videos/out.mp4";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          successEnvelope({
            task_id: TASK_ID,
            task_status: "succeed",
            task_result: {
              videos: [{ id: "vid-1", url: videoUrl, width: 1920, height: 1080 }],
            },
          }),
        ),
      )
      .mockResolvedValueOnce(binaryResponse([1, 2, 3, 4], "video/mp4"));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, params);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][0]).toBe(videoUrl);
    expect(res.status).toBe("succeeded");
    if (res.status === "succeeded") {
      expect(res.result.provider).toBe("kling");
      expect(res.result.providerJobId).toBe(TASK_ID);
      expect(res.result.width).toBe(1920);
      expect(res.result.height).toBe(1080);
      expect(res.result.duration).toBe(8);
      expect(res.result.files).toHaveLength(1);
      expect(res.result.files[0].contentType).toBe("video/mp4");
      expect(res.result.files[0].filename).toMatch(/\.mp4$/);
      expect(res.result.files[0].body).toHaveLength(4);
      expect(res.result.metadata.videoId).toBe("vid-1");
    }
  });

  it("falls back to aspect-ratio dimensions when the video omits them", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse(
          successEnvelope({
            task_id: TASK_ID,
            task_status: "succeed",
            task_result: { videos: [{ id: "vid-1", url: "https://cdn/x.mp4" }] },
          }),
        ),
      )
      .mockResolvedValueOnce(binaryResponse([1]));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, { ...params, aspectRatio: "9:16" });
    if (res.status === "succeeded") {
      expect(res.result.width).toBe(1080);
      expect(res.result.height).toBe(1920);
    }
  });

  it("throws when succeeded but no video URL is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(
          successEnvelope({
            task_id: TASK_ID,
            task_status: "succeed",
            task_result: { videos: [] },
          }),
        ),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "no video URL",
    );
  });

  it("throws on unknown task_status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse(successEnvelope({ task_id: TASK_ID, task_status: "bogus" })),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "unknown task_status",
    );
  });

  it("throws on a non-zero Kling error code", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 10002, message: "invalid param" }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.submit(params)).rejects.toThrow(
      "Kling API error (10002)",
    );
  });

  it("throws when credentials are missing", async () => {
    const provider = new KlingVideoProvider({
      fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
    });
    await expect(provider.submit(params)).rejects.toThrow(
      "KLING_API_KEY and KLING_API_SECRET are required",
    );
  });

  it("throws on a failed submit request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 429));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.submit(params)).rejects.toThrow("status 429");
  });
});

describe("getVideoProvider registry", () => {
  it("resolves the kling provider by name", () => {
    expect(getVideoProvider("kling").name).toBe("kling");
    expect(isAsyncVideoProvider(getVideoProvider("kling"))).toBe(true);
  });

  it("fails on kling when no key is set (env read at construction)", async () => {
    const provider = getVideoProvider("kling") as AsyncVideoGenerationProvider;
    await expect(
      provider.submit({ prompt: "x", aspectRatio: "16:9", duration: 5 }),
    ).rejects.toThrow("KLING_API_KEY and KLING_API_SECRET are required");
  });
});

