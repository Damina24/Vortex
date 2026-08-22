import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SunoMusicProvider,
  getAudioProvider,
  isAsyncAudioProvider,
} from "./audio-providers";

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

/** Minimal `Response`-like object with a binary (audio) body. */
function binaryResponse(bytes: number[], contentType = "audio/mpeg") {
  return {
    ok: true,
    status: 200,
    json: async () => ({}),
    headers: { get: (_k: string) => contentType } as unknown as Headers,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
    body: null,
  } as unknown as Response;
}

const GENERATION_ID = "suno-gen-123";

function makeProvider(
  fetchImpl: typeof fetch,
  config: Partial<ConstructorParameters<typeof SunoMusicProvider>[0]> = {},
) {
  return new SunoMusicProvider({
    apiKey: "suno-test-key",
    fetchImpl,
    ...config,
  });
}

const params = {
  prompt: "An upbeat synthwave track with retro leads",
  kind: "music" as const,
  duration: 60,
  style: "synthwave, 80s, energetic",
  projectName: "Acme — Summer Launch",
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SUNO_API_KEY;
  delete process.env.SUNO_MODEL;
});

// --- SunoMusicProvider ---------------------------------------------------------

describe("SunoMusicProvider", () => {
  it("submits a music generation and returns its batch id", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: true, id: GENERATION_ID }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.submit(params);

    expect(result.providerJobId).toBe(GENERATION_ID);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.sunoapi.dev/api/v1/generation");
    expect(init.method).toBe("POST");
    const headers = init.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer suno-test-key");
    expect(JSON.parse(String(init.body))).toEqual({
      prompt: params.prompt,
      title: "Acme — Summer Launch",
      make_instrumental: false,
      model: "chirp-v3-5",
      style: "synthwave, 80s, energetic",
    });
  });

  it("defaults the model from env and the title when projectName is absent", async () => {
    process.env.SUNO_API_KEY = "suno-env";
    process.env.SUNO_MODEL = "chirp-v3-0";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ id: GENERATION_ID }));
    const provider = new SunoMusicProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await provider.submit({
      prompt: "ambient pad",
      kind: "music",
      duration: 30,
      style: null,
      projectName: null,
    });

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer suno-env",
    );
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body).toMatchObject({
      model: "chirp-v3-0",
      title: "Untitled track",
    });
    expect(body.style).toBeUndefined();
  });
  it("rejects voiceover kind", async () => {
    const provider = makeProvider((async () =>
      jsonResponse({ id: "x" })) as unknown as typeof fetch);
    await expect(
      provider.submit({ ...params, kind: "voiceover" }),
    ).rejects.toThrow("Suno only supports music generation");
  });

  it("throws when no api key is configured", async () => {
    const provider = new SunoMusicProvider({
      fetchImpl: (async () => jsonResponse({})) as unknown as typeof fetch,
    });
    await expect(provider.submit(params)).rejects.toThrow(
      "SUNO_API_KEY is required",
    );
  });

  it("throws when the gateway reports an explicit error on submit", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ status: false, message: "credits exhausted" }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);
    await expect(provider.submit(params)).rejects.toThrow("credits exhausted");
  });

  it("throws on a non-ok submit response and when no id is returned", async () => {
    const failing = makeProvider((async () =>
      jsonResponse({}, 429)) as unknown as typeof fetch);
    await expect(failing.submit(params)).rejects.toThrow("status 429");

    const noId = makeProvider((async () =>
      jsonResponse({ status: true })) as unknown as typeof fetch);
    await expect(noId.submit(params)).rejects.toThrow("no generation id");
  });

  it("reports processing while the gateway has no finished clips", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ status: true, output: [] }));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.retrieve(GENERATION_ID, params);

    expect(result).toEqual({ status: "processing" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.sunoapi.dev/api/v1/generation/${GENERATION_ID}`,
    );
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer suno-test-key",
    );
  });

  it("keeps polling when clips exist but none has an audio_url yet", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        status: true,
        output: [{ id: "clip-1", title: "Track" }],
      }),
    );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.retrieve(GENERATION_ID, params);
    expect(result).toEqual({ status: "processing" });
  });

  it("downloads the finished clip and returns an mp3 asset", async () => {
    const tracks = [
      {
        id: "clip-2",
        title: "Neon Nights",
        image_url: "https://cdn.suno.example/art.jpg",
        audio_url: "https://cdn.suno.example/track.mp3",
        duration: 124,
      },
    ];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ status: true, output: tracks }))
      .mockResolvedValueOnce(binaryResponse([9, 9, 9, 9, 9]));
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.retrieve(GENERATION_ID, params);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const downloadUrl = fetchMock.mock.calls[1][0] as string;
    expect(downloadUrl).toBe("https://cdn.suno.example/track.mp3");
    expect(result).toMatchObject({ status: "succeeded" });
    if (result.status !== "succeeded") throw new Error("expected success");
    expect(result.result.provider).toBe("suno");
    expect(result.result.providerJobId).toBe(GENERATION_ID);
    expect(result.result.duration).toBe(124);
    expect(result.result.files).toHaveLength(1);
    expect(result.result.files[0].contentType).toBe("audio/mpeg");
    expect(result.result.files[0].filename).toMatch(/^suno-[a-f0-9]{8}\.mp3$/);
    expect(result.result.files[0].body).toHaveLength(5);
    expect(result.result.metadata).toMatchObject({
      model: "chirp-v3-5",
      title: "Neon Nights",
      imageUrl: "https://cdn.suno.example/art.jpg",
      format: "mp3",
    });
  });

  it("reports failed when the gateway returns an error payload", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ status: false, message: "generation failed" }),
      );
    const provider = makeProvider(fetchMock as unknown as typeof fetch);

    const result = await provider.retrieve(GENERATION_ID, params);
    expect(result).toEqual({
      status: "failed",
      error: "generation failed",
    });
  });

  it("throws when the gateway is unavailable on retrieve", async () => {
    const provider = makeProvider((async () =>
      jsonResponse({}, 500)) as unknown as typeof fetch);
    await expect(provider.retrieve(GENERATION_ID, params)).rejects.toThrow(
      "status 500",
    );
  });
});

// --- Registry + async capability -------------------------------------------

describe("getAudioProvider registry", () => {
  it("resolves the suno provider by name", () => {
    expect(getAudioProvider("suno").name).toBe("suno");
  });

  it("is flagged as an async (two-phase) provider", () => {
    const provider = getAudioProvider("suno");
    expect(isAsyncAudioProvider(provider)).toBe(true);
    // Synchronous providers must not be flagged async.
    expect(isAsyncAudioProvider(getAudioProvider("mock"))).toBe(false);
  });
});
