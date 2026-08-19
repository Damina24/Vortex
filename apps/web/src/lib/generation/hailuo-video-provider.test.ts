import { afterEach, describe, expect, it, vi } from "vitest";
import {
  HailuoVideoProvider,
  getVideoProvider,
  hailuoAspectDimensions,
  hailuoAspectRatio,
  isAsyncVideoProvider,
  pickHailuoDuration,
} from "./providers";
import type { AsyncVideoGenerationProvider } from "./providers";

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

const TASK_ID = "hailuo-task-123";

function makeProvider(
  fetchImpl: typeof fetch,
  config: Partial<ConstructorParameters<typeof HailuoVideoProvider>[0]> = {},
) {
  return new HailuoVideoProvider({
    apiKey: "mm-test-key",
    fetchImpl,
    ...config,
  });
}

const params = {
  prompt: "A cinematic city flyover at dusk",
  negativePrompt: "blurry, low quality",
  aspectRatio: "16:9",
  duration: 8,
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.HAILUO_API_KEY;
  delete process.env.HAILUO_MODEL;
});

// --- Helpers ---------------------------------------------------------------

describe("pickHailuoDuration", () => {
  it("rounds to the supported 6s or 8s clips", () => {
    expect(pickHailuoDuration(3)).toBe(6);
    expect(pickHailuoDuration(7)).toBe(6);
    expect(pickHailuoDuration(7.1)).toBe(8);
    expect(pickHailuoDuration(12)).toBe(8);
  });
});

describe("hailuoAspectRatio", () => {
  it("maps aspect ratios to MiniMax ratio strings and defaults otherwise", () => {
    expect(hailuoAspectRatio("16:9")).toBe("16:9");
    expect(hailuoAspectRatio("9:16")).toBe("9:16");
    expect(hailuoAspectRatio("1:1")).toBe("1:1");
    expect(hailuoAspectRatio("4:5")).toBe("16:9");
  });
});

describe("hailuoAspectDimensions", () => {
  it("maps known aspect ratios and defaults otherwise", () => {
    expect(hailuoAspectDimensions("9:16")).toEqual({ width: 1080, height: 1920 });
    expect(hailuoAspectDimensions("1:1")).toEqual({ width: 1080, height: 1080 });
    expect(hailuoAspectDimensions("16:9")).toEqual({ width: 1920, height: 1080 });
  });
});

describe("HailuoVideoProvider", () => {
  it("submits a video-generation task and returns its id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ task_id: TASK_ID, base_resp: { status_code: 0 } }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.submit(params);

    expect(result.providerJobId).toBe(TASK_ID);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.minimax.chat/v1/video_generation");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer mm-test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "hailuo-02",
      prompt: params.prompt,
      aspect_ratio: "16:9",
      duration: 8,
      prompt_optimizer: true,
      watermark: false,
    });
  });

  it("throws when credentials are missing", async () => {
    const provider = new HailuoVideoProvider({
      fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
    });
    await expect(provider.submit(params)).rejects.toThrow(
      "HAILUO_API_KEY is required",
    );
  });

  it("throws on a failed submit request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 429));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.submit(params)).rejects.toThrow("status 429");
  });

  it("throws when the API reports an in-band error", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ base_resp: { status_code: 1000, status_msg: "invalid prompt" } }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.submit(params)).rejects.toThrow(
      "invalid prompt",
    );
  });

  it("reports processing for queued/running tasks", async () => {
    for (const status of ["Queueing", "Processing"]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ task_id: TASK_ID, status }));
      const provider = makeProvider(fetchMock as unknown as typeof fetch);

      const res = await provider.retrieve(TASK_ID, params);
      expect(res.status).toBe("processing");
    }
  });

  it("reports failed with the provider error message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({
          task_id: TASK_ID,
          status: "Fail",
          base_resp: { status_code: 1001, status_msg: "render exploded" },
        }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, params);
    expect(res.status).toBe("failed");
    if (res.status === "failed") {
      expect(res.error).toBe("render exploded");
    }
  });


  it("downloads the finished video on success and wraps it in a result", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          task_id: TASK_ID,
          status: "Success",
          video_url: "https://cdn.minimaxi/out.mp4",
        }),
      )
      .mockResolvedValueOnce(binaryResponse([1, 2, 3, 4]));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, params);
    expect(res.status).toBe("succeeded");
    if (res.status === "succeeded") {
      expect(res.result.provider).toBe("hailuo");
      expect(res.result.providerJobId).toBe(TASK_ID);
      expect(res.result.width).toBe(1920);
      expect(res.result.height).toBe(1080);
      expect(res.result.duration).toBe(8);
      expect(res.result.files[0].filename).toMatch(/\.mp4$/);
      expect(res.result.files[0].contentType).toBe("video/mp4");
      expect(res.result.files[0].body).toHaveLength(4);
      expect(res.result.metadata.model).toBe("hailuo-02");
    }
  });

  it("throws when succeeded but no video URL is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ task_id: TASK_ID, status: "Success", video_url: null }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "no video URL",
    );
  });

  it("throws on unknown status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ task_id: TASK_ID, status: "bogus" }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "unknown status",
    );
  });

  it("throws when the video download fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          task_id: TASK_ID,
          status: "Success",
          video_url: "https://cdn.minimaxi/out.mp4",
        }),
      )
      .mockResolvedValueOnce(jsonResponse({}, 404));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "download failed with status 404",
    );
  });
});

describe("getVideoProvider registry", () => {
  it("resolves the hailuo provider by name", () => {
    expect(getVideoProvider("hailuo").name).toBe("hailuo");
    expect(isAsyncVideoProvider(getVideoProvider("hailuo"))).toBe(true);
  });

  it("fails on hailuo when no key is set (env read at construction)", async () => {
    const provider = getVideoProvider("hailuo") as AsyncVideoGenerationProvider;
    await expect(
      provider.submit({ prompt: "x", aspectRatio: "16:9", duration: 5 }),
    ).rejects.toThrow("HAILUO_API_KEY is required");
  });
});
