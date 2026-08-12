import { describe, expect, it, vi } from "vitest";
import {
  AudioProviderUnavailableError,
  MockAudioProvider,
  getAudioProvider,
} from "./audio-providers";

describe("MockAudioProvider", () => {
  it("returns a valid silent WAV with the RIFF/WAVE header", async () => {
    vi.stubEnv("MOCK_AUDIO_DELAY_MS", "0");
    const provider = new MockAudioProvider();

    const result = await provider.generate({
      prompt: "hero narration for a product demo",
      kind: "voiceover",
      duration: 2,
      voice: null,
      style: null,
      projectName: "Acme — Summer Launch",
    });

    expect(result.provider).toBe("mock");
    expect(result.providerJobId).toMatch(/^mock_voiceover_[a-f0-9]{12}$/);
    expect(result.duration).toBe(2);
    expect(result.metadata).toMatchObject({ mock: true, kind: "voiceover" });

    const file = result.files[0];
    expect(file.contentType).toBe("audio/wav");
    expect(file.filename).toMatch(/^mock-voiceover-[a-f0-9]{8}\.wav$/);
    expect(Buffer.isBuffer(file.body)).toBe(true);
    // A 2-second 22.05kHz mono 16-bit clip => 44-byte header + 88200 bytes.
    expect(file.body.length).toBe(44 + 2 * 22050 * 2);
    expect(file.body.toString("ascii", 0, 4)).toBe("RIFF");
    expect(file.body.toString("ascii", 8, 12)).toBe("WAVE");
  });

  it("is deterministic for identical prompts (same bytes for the same duration)", async () => {
    const provider = new MockAudioProvider();
    const args = {
      prompt: "the same script",
      kind: "voiceover" as const,
      duration: 3,
      voice: "nova",
      style: "authoritative",
      projectName: null,
    };

    const [first, second] = await Promise.all([
      provider.generate(args),
      provider.generate(args),
    ]);

    expect(first.files[0].body).toEqual(second.files[0].body);
    expect(first.providerJobId).toBe(second.providerJobId);
  });

  it("honors MOCK_AUDIO_DELAY_MS before resolving", async () => {
    vi.stubEnv("MOCK_AUDIO_DELAY_MS", "50");
    const provider = new MockAudioProvider();
    const start = Date.now();
    await provider.generate({
      prompt: "p",
      kind: "music",
      duration: 1,
      voice: null,
      style: null,
      projectName: null,
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});

describe("getAudioProvider", () => {
  it("resolves the mock provider by default", () => {
    expect(getAudioProvider().name).toBe("mock");
  });

  it("resolves a provider by name", () => {
    expect(getAudioProvider("mock").name).toBe("mock");
  });

  it("falls back to the default provider for empty names", () => {
    expect(getAudioProvider("").name).toBe("mock");
  });

  it("throws AudioProviderUnavailableError for unregistered providers", () => {
    expect(() => getAudioProvider("eleven")).toThrowError(
      AudioProviderUnavailableError,
    );
    expect(() => getAudioProvider("eleven")).toThrowError(
      /Audio generation provider "eleven"/,
    );
  });
});
