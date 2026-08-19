import { afterEach, describe, expect, it, vi } from "vitest";
import {
  WanVideoProvider,
  getVideoProvider,
  isAsyncVideoProvider,
  pickWanDuration,
  wanAspectDimensions,
  wanSize,
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

const TASK_ID = "wan-task-123";

function makeProvider(
  fetchImpl: typeof fetch,
  config: Partial<ConstructorParameters<typeof WanVideoProvider>[0]> = {},
) {
  return new WanVideoProvider({
    apiKey: "ds-test-key",
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
  delete process.env.WAN_API_KEY;
  delete process.env.WAN_MODEL;
});

// --- Helpers ---------------------------------------------------------------

describe("pickWanDuration", () => {
  it("rounds to the supported 5s or 10s clips", () => {
    expect(pickWanDuration(3)).toBe(5);
    expect(pickWanDuration(7.5)).toBe(5);
    expect(pickWanDuration(7.6)).toBe(10);
    expect(pickWanDuration(12)).toBe(10);
  });
});

describe("wanSize", () => {
  it("maps aspect ratios to DashScope WIDTH*HEIGHT strings and defaults otherwise", () => {
    expect(wanSize("16:9")).toBe("1280*720");
    expect(wanSize("9:16")).toBe("720*1280");
    expect(wanSize("1:1")).toBe("480*480");
    expect(wanSize("4:5")).toBe("1280*720");
  });
});

describe("wanAspectDimensions", () => {
  it("maps known aspect ratios and defaults otherwise", () => {
    expect(wanAspectDimensions("9:16")).toEqual({ width: 720, height: 1280 });
    expect(wanAspectDimensions("1:1")).toEqual({ width: 480, height: 480 });
    expect(wanAspectDimensions("16:9")).toEqual({ width: 1280, height: 720 });
  });
});

describe("WanVideoProvider", () => {
  it("submits a text-to-video task and returns its id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ output: { task_id: TASK_ID, task_status: "PENDING" }, request_id: "r1" }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.submit(params);

    expect(result.providerJobId).toBe(TASK_ID);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://dashscope.aliyuncs.com/api/v1/services/aigc/text2video/image-synthesis",
    );
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer ds-test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "wan2.2-t2v-flash",
      input: { prompt: params.prompt, negative_prompt: params.negativePrompt },
      parameters: { size: "1280*720", duration: 10, prompt_extend: true, watermark: false },
    });
  });

  it("throws when credentials are missing", async () => {
    const provider = new WanVideoProvider({
      fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
    });
    await expect(provider.submit(params)).rejects.toThrow(
      "WAN_API_KEY is required",
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
        jsonResponse({ code: "InvalidParameter", message: "bad prompt", request_id: "r1" }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.submit(params)).rejects.toThrow("bad prompt");
  });

  it("reports processing for pending/running tasks", async () => {
    for (const status of ["PENDING", "RUNNING"]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(
          jsonResponse({ output: { task_id: TASK_ID, task_status: status } }),
        );
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
          output: { task_id: TASK_ID, task_status: "FAILED", message: "render exploded" },
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
          output: {
            task_id: TASK_ID,
            task_status: "SUCCEEDED",
            video_url: "https://dashscope-result.oss-cn/out.mp4",
          },
        }),
      )
      .mockResolvedValueOnce(binaryResponse([1, 2, 3, 4]));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, params);
    expect(res.status).toBe("succeeded");
    if (res.status === "succeeded") {
      expect(res.result.provider).toBe("wan");
      expect(res.result.providerJobId).toBe(TASK_ID);
      expect(res.result.width).toBe(1280);
      expect(res.result.height).toBe(720);
      expect(res.result.duration).toBe(8);
      expect(res.result.files[0].filename).toMatch(/\.mp4$/);
      expect(res.result.files[0].contentType).toBe("video/mp4");
      expect(res.result.files[0].body).toHaveLength(4);
      expect(res.result.metadata.model).toBe("wan2.2-t2v-flash");
    }
  });

  it("throws when succeeded but no video URL is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ output: { task_id: TASK_ID, task_status: "SUCCEEDED" } }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "no video URL",
    );
  });

  it("throws on unknown task status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ output: { task_id: TASK_ID, task_status: "bogus" } }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "unknown task_status",
    );
  });

  it("throws when the video download fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({
          output: {
            task_id: TASK_ID,
            task_status: "SUCCEEDED",
            video_url: "https://dashscope-result.oss-cn/out.mp4",
          },
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
  it("resolves the wan provider by name", () => {
    expect(getVideoProvider("wan").name).toBe("wan");
    expect(isAsyncVideoProvider(getVideoProvider("wan"))).toBe(true);
  });

  it("fails on wan when no key is set (env read at construction)", async () => {
    const provider = getVideoProvider("wan") as AsyncVideoGenerationProvider;
    await expect(
      provider.submit({ prompt: "x", aspectRatio: "16:9", duration: 5 }),
    ).rejects.toThrow("WAN_API_KEY is required");
  });
});
