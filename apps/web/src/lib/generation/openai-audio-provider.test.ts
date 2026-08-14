import { afterEach, describe, expect, it, vi } from "vitest";
import { OpenAiAudioProvider, getAudioProvider } from "./audio-providers";

const okResponse = (bytes: number[] = [1, 2, 3]) =>
  ({
    ok: true,
    status: 200,
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  }) as unknown as Response;

const badResponse = (status = 500) =>
  ({
    ok: false,
    status,
    arrayBuffer: async () => new ArrayBuffer(0),
  }) as unknown as Response;

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.OPENAI_API_KEY;
});

describe("OpenAiAudioProvider", () => {
  it("posts the correct request and returns an mp3 asset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([1, 2, 3, 4]));
    const provider = new OpenAiAudioProvider({
      apiKey: "sk-test",
      baseUrl: "https://example.com/v1",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.generate({
      prompt: "Welcome to Vortex",
      kind: "voiceover",
      duration: 3,
      voice: "nova",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://example.com/v1/audio/speech");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer sk-test");
    expect(JSON.parse(init.body)).toEqual({
      model: "tts-1",
      input: "Welcome to Vortex",
      voice: "nova",
      response_format: "mp3",
    });

    expect(result.provider).toBe("openai");
    expect(result.duration).toBe(3);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].contentType).toBe("audio/mpeg");
    expect(result.files[0].filename).toMatch(/\.mp3$/);
    expect(result.files[0].body).toHaveLength(4);
  });

  it("defaults the voice to alloy and reads the key from env", async () => {
    process.env.OPENAI_API_KEY = "sk-env";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse([9]))
      .mockName("fetch");
    const provider = new OpenAiAudioProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await provider.generate({
      prompt: "hi",
      kind: "voiceover",
      duration: 1,
    });

    const [, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(init.headers.Authorization).toBe("Bearer sk-env");
    expect(JSON.parse(init.body).voice).toBe("alloy");
  });

  it("rejects music kind", async () => {
    const provider = new OpenAiAudioProvider({
      apiKey: "sk-test",
      fetchImpl: (async () => okResponse()) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", kind: "music", duration: 1 }),
    ).rejects.toThrow("only supports voiceover");
  });

  it("throws when no API key is configured", async () => {
    const provider = new OpenAiAudioProvider({
      fetchImpl: (async () => okResponse()) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", kind: "voiceover", duration: 1 }),
    ).rejects.toThrow("OPENAI_API_KEY is required");
  });

  it("throws on a non-ok response", async () => {
    const provider = new OpenAiAudioProvider({
      apiKey: "sk-test",
      fetchImpl: (async () => badResponse(429)) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", kind: "voiceover", duration: 1 }),
    ).rejects.toThrow("status 429");
  });
});

describe("getAudioProvider registry", () => {
  it("resolves the openai provider by name", () => {
    expect(getAudioProvider("openai").name).toBe("openai");
  });
});
