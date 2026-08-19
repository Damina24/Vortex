import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ElevenLabsAudioProvider,
  getAudioProvider,
} from "./audio-providers";

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
  delete process.env.ELEVENLABS_API_KEY;
});

describe("ElevenLabsAudioProvider", () => {
  it("posts the correct request and returns an mp3 asset", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([1, 2, 3, 4]));
    const provider = new ElevenLabsAudioProvider({
      apiKey: "el-test",
      baseUrl: "https://example.com",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const result = await provider.generate({
      prompt: "Welcome to Vortex",
      kind: "voiceover",
      duration: 3,
      voice: "some-voice-id",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { method: string; headers: Record<string, string>; body: string },
    ];
    expect(url).toBe("https://example.com/v1/text-to-speech/some-voice-id");
    expect(init.method).toBe("POST");
    expect(init.headers["xi-api-key"]).toBe("el-test");
    expect(JSON.parse(init.body)).toEqual({
      text: "Welcome to Vortex",
      model_id: "eleven_multilingual_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
        use_speaker_boost: true,
      },
    });

    expect(result.provider).toBe("elevenlabs");
    expect(result.duration).toBe(3);
    expect(result.files).toHaveLength(1);
    expect(result.files[0].contentType).toBe("audio/mpeg");
    expect(result.files[0].filename).toMatch(/\.mp3$/);
    expect(result.files[0].body).toHaveLength(4);
    expect(result.metadata.voiceId).toBe("some-voice-id");
  });

  it("defaults the model/voice and reads the key from env", async () => {
    process.env.ELEVENLABS_API_KEY = "el-env";
    const fetchMock = vi
      .fn()
      .mockResolvedValue(okResponse([9]))
      .mockName("fetch");
    const provider = new ElevenLabsAudioProvider({
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    await provider.generate({
      prompt: "hi",
      kind: "voiceover",
      duration: 1,
    });

    const [url, init] = fetchMock.mock.calls[0] as [
      string,
      { headers: Record<string, string>; body: string },
    ];
    expect(url).toMatch(/\/v1\/text-to-speech\/21m00Tcm4TlvDq8ikWAM$/);
    expect(init.headers["xi-api-key"]).toBe("el-env");
    expect(JSON.parse(init.body).model_id).toBe("eleven_multilingual_v2");
  });

  it("rejects music kind", async () => {
    const provider = new ElevenLabsAudioProvider({
      apiKey: "el-test",
      fetchImpl: (async () => okResponse()) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", kind: "music", duration: 1 }),
    ).rejects.toThrow("only supports voiceover");
  });

  it("throws when no API key is configured", async () => {
    const provider = new ElevenLabsAudioProvider({
      fetchImpl: (async () => okResponse()) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", kind: "voiceover", duration: 1 }),
    ).rejects.toThrow("ELEVENLABS_API_KEY is required");
  });

  it("throws on a non-ok response", async () => {
    const provider = new ElevenLabsAudioProvider({
      apiKey: "el-test",
      fetchImpl: (async () => badResponse(401)) as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", kind: "voiceover", duration: 1 }),
    ).rejects.toThrow("status 401");
  });
});

describe("getAudioProvider registry", () => {
  it("resolves the elevenlabs provider by name", () => {
    expect(getAudioProvider("elevenlabs").name).toBe("elevenlabs");
  });
});
