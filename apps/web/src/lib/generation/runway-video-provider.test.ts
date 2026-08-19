import { afterEach, describe, expect, it, vi } from "vitest";
import {
  RunwayVideoProvider,
  getVideoProvider,
  isAsyncVideoProvider,
  pickRunwayDuration,
  runwayAspectDimensions,
  runwayRatio,
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

const TASK_ID = "runway-task-123";

function makeProvider(
  fetchImpl: typeof fetch,
  config: Partial<ConstructorParameters<typeof RunwayVideoProvider>[0]> = {},
) {
  return new RunwayVideoProvider({
    apiKey: "rw-test-key",
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
  delete process.env.RUNWAY_API_KEY;
  delete process.env.RUNWAY_VIDEO_MODEL;
});

// --- Helpers ---------------------------------------------------------------

describe("pickRunwayDuration", () => {
  it("rounds to the supported 5s or 10s clips", () => {
    expect(pickRunwayDuration(3)).toBe("5");
    expect(pickRunwayDuration(8)).toBe("10");
    expect(pickRunwayDuration(7.5)).toBe("5");
    expect(pickRunwayDuration(7.6)).toBe("10");
  });
});

describe("runwayRatio", () => {
  it("maps aspect ratios to Runway ratio strings and defaults otherwise", () => {
    expect(runwayRatio("16:9")).toBe("1280:768");
    expect(runwayRatio("9:16")).toBe("768:1280");
    expect(runwayRatio("1:1")).toBe("768:768");
    expect(runwayRatio("4:5")).toBe("1280:768");
  });
});

describe("runwayAspectDimensions", () => {
  it("maps known aspect ratios and defaults otherwise", () => {
    expect(runwayAspectDimensions("9:16")).toEqual({ width: 768, height: 1280 });
    expect(runwayAspectDimensions("1:1")).toEqual({ width: 768, height: 768 });
    expect(runwayAspectDimensions("16:9")).toEqual({ width: 1280, height: 768 });
  });
});

describe("RunwayVideoProvider", () => {
  it("submits a text-to-video task and returns its id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: TASK_ID, status: "PENDING" }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.submit(params);

    expect(result.providerJobId).toBe(TASK_ID);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.dev.runwayml.com/v1/text_to_video");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer rw-test-key");
    expect(JSON.parse(String(init.body))).toMatchObject({
      model: "gen3a_turbo",
      prompt: params.prompt,
      ratio: "1280:768",
      duration: "10",
      watermark: false,
    });
  });

  it("throws when credentials are missing", async () => {
    const provider = new RunwayVideoProvider({
      fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
    });
    await expect(provider.submit(params)).rejects.toThrow(
      "RUNWAY_API_KEY is required",
    );
  });

  it("throws on a failed submit request", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({}, 429));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.submit(params)).rejects.toThrow("status 429");
  });

  it("throws when the task fails immediately", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: TASK_ID, status: "FAILED", error: "bad prompt" }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.submit(params)).rejects.toThrow("bad prompt");
  });

  it("reports processing for queued/running/throttled tasks", async () => {
    for (const status of ["PENDING", "RUNNING", "THROTTLED"]) {
      const fetchMock = vi
        .fn()
        .mockResolvedValue(jsonResponse({ id: TASK_ID, status }));
      const provider = makeProvider(fetchMock as unknown as typeof fetch);

      const res = await provider.retrieve(TASK_ID, params);
      expect(res.status).toBe("processing");
    }
  });

  it("reports failed with the provider error message", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: TASK_ID, status: "FAILED", error: "render exploded" }),
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
          id: TASK_ID,
          status: "SUCCEEDED",
          output: ["https://cdn.runway/out.mp4"],
        }),
      )
      .mockResolvedValueOnce(binaryResponse([1, 2, 3, 4]));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const res = await provider.retrieve(TASK_ID, params);
    expect(res.status).toBe("succeeded");
    if (res.status === "succeeded") {
      expect(res.result.provider).toBe("runway");
      expect(res.result.providerJobId).toBe(TASK_ID);
      expect(res.result.width).toBe(1280);
      expect(res.result.height).toBe(768);
      expect(res.result.duration).toBe(8);
      expect(res.result.files[0].filename).toMatch(/\.mp4$/);
      expect(res.result.files[0].contentType).toBe("video/mp4");
      expect(res.result.files[0].body).toHaveLength(4);
      expect(res.result.metadata.model).toBe("gen3a_turbo");
    }
  });

  it("throws when succeeded but no video URL is present", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ id: TASK_ID, status: "SUCCEEDED", output: [] }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    await expect(provider.retrieve(TASK_ID, params)).rejects.toThrow(
      "no video URL",
    );
  });

  it("throws on unknown status", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: TASK_ID, status: "bogus" }));
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
          id: TASK_ID,
          status: "SUCCEEDED",
          output: ["https://cdn.runway/out.mp4"],
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
  it("resolves the runway provider by name", () => {
    expect(getVideoProvider("runway").name).toBe("runway");
    expect(isAsyncVideoProvider(getVideoProvider("runway"))).toBe(true);
  });

  it("fails on runway when no key is set (env read at construction)", async () => {
    const provider = getVideoProvider("runway") as AsyncVideoGenerationProvider;
    await expect(
      provider.submit({ prompt: "x", aspectRatio: "16:9", duration: 5 }),
    ).rejects.toThrow("RUNWAY_API_KEY is required");
  });
});