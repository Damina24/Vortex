import { createHash } from "crypto";

/**
 * Audio generation provider abstraction. Mirrors the AI service's
 * provider-agnostic design (`apps/ai-service/src/llm.py`): real TTS/music
 * providers (ElevenLabs, Murf, Suno, …) implement the same interface and are
 * resolved by name through `getAudioProvider`.
 */

export type AudioKind = "voiceover" | "music";

export interface AudioGenerationParams {
  prompt: string;
  kind: AudioKind;
  duration: number;
  voice?: string | null;
  style?: string | null;
  projectName?: string | null;
}

export interface AudioGenerationResult {
  provider: string;
  /** The provider's external job id (only meaningful for remote providers). */
  providerJobId: string;
  duration: number;
  files: GeneratedFile[];
  metadata: Record<string, unknown>;
}

export interface AudioGenerationProvider {
  readonly name: string;
  generate(params: AudioGenerationParams): Promise<AudioGenerationResult>;
}

/** Thrown when an unregistered provider name is requested. */
export class AudioProviderUnavailableError extends Error {
  providerName: string;

  constructor(providerName: string) {
    super(
      `Audio generation provider "${providerName}" is not available. ` +
        `Set AUDIO_PROVIDER=mock for local development.`,
    );
    this.name = "AudioProviderUnavailableError";
    this.providerName = providerName;
  }
}

// The WAV buffer type is shared with the video providers module.
import type { GeneratedFile } from "./providers";

const SAMPLE_RATE = 22050; // Hz
const CHANNELS = 1;
const BITS_PER_SAMPLE = 16;

/**
 * Builds a minimal PCM WAV buffer of silence spanning `seconds` (16-bit,
 * mono, 22.05 kHz). Real providers return actual audio; this keeps the
 * pipeline exercisable offline with a valid, importable audio file.
 *
 * The header is assembled byte-by-byte (no string literals) so it is immune
 * to quote-handling issues in the transpiler/toolchain.
 */
function buildSilentWav(seconds: number): Buffer {
  const bytesPerSample = BITS_PER_SAMPLE / 8;
  const numSamples = Math.max(
    1,
    Math.floor(SAMPLE_RATE * Math.max(1, seconds)),
  );
  const dataSize = numSamples * CHANNELS * bytesPerSample;
  const chunkSize = 36 + dataSize;
  const byteRate = SAMPLE_RATE * CHANNELS * bytesPerSample;
  const blockAlign = CHANNELS * bytesPerSample;

  const header = new Uint8Array([
    // 0:  "RIFF"
    0x52,
    0x49,
    0x46,
    0x46,
    // 4:  ChunkSize (little-endian)
    chunkSize & 0xff,
    (chunkSize >>> 8) & 0xff,
    (chunkSize >>> 16) & 0xff,
    (chunkSize >>> 24) & 0xff,
    // 8:  "WAVE"
    0x57,
    0x41,
    0x56,
    0x45,
    // 12: "fmt " / subchunk1 size (16) / PCM(1) / channels / sample rate / byte rate / block align / bps
    0x66,
    0x72,
    0x6d,
    0x20,
    0x10,
    0x00,
    0x00,
    0x00,
    0x01,
    0x00,
    CHANNELS,
    0x00,
    SAMPLE_RATE & 0xff,
    (SAMPLE_RATE >>> 8) & 0xff,
    (SAMPLE_RATE >>> 16) & 0xff,
    (SAMPLE_RATE >>> 24) & 0xff,
    byteRate & 0xff,
    (byteRate >>> 8) & 0xff,
    (byteRate >>> 16) & 0xff,
    (byteRate >>> 24) & 0xff,
    blockAlign & 0xff,
    0x00,
    BITS_PER_SAMPLE & 0xff,
    0x00,
    // 36: "data" / subchunk2 size
    0x64,
    0x61,
    0x74,
    0x61,
    dataSize & 0xff,
    (dataSize >>> 8) & 0xff,
    (dataSize >>> 16) & 0xff,
    (dataSize >>> 24) & 0xff,
  ]);

  // 44-byte header followed by zeroed (silent) PCM samples.
  const buffer = new Uint8Array(44 + dataSize);
  buffer.set(header, 0);
  return Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
}

/**
 * Deterministic offline render provider. Simulates render latency (a
 * configurable delay via `MOCK_AUDIO_DELAY_MS`) and produces a silent WAV
 * stand-in. Never fires network requests, so it works with zero API keys.
 */
export class MockAudioProvider implements AudioGenerationProvider {
  readonly name = "mock";

  async generate(
    params: AudioGenerationParams,
  ): Promise<AudioGenerationResult> {
    const delayMs = Math.max(0, Number(process.env.MOCK_AUDIO_DELAY_MS ?? 0));
    if (delayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    const duration = Math.max(1, Math.floor(params.duration));
    const body = buildSilentWav(duration);
    const digest = createHash("sha1").update(params.prompt).digest("hex");

    return {
      provider: this.name,
      providerJobId: `mock_${params.kind}_${digest.slice(0, 12)}`,
      duration,
      files: [
        {
          filename: `mock-${params.kind}-${digest.slice(0, 8)}.wav`,
          contentType: "audio/wav",
          body,
        },
      ],
      metadata: { mock: true, kind: params.kind, sampleRate: SAMPLE_RATE },
    };
  }
}

const AUDIO_PROVIDER_REGISTRY: Record<string, () => AudioGenerationProvider> = {
  mock: () => new MockAudioProvider(),
};

/**
 * Resolves an audio generation provider by name. Defaults to the
 * `AUDIO_PROVIDER` env var (or `mock` for local development). Unknown names
 * throw `AudioProviderUnavailableError` so callers can map it to a 503.
 */
export function getAudioProvider(
  name?: string | null,
): AudioGenerationProvider {
  const key = (name || process.env.AUDIO_PROVIDER || "mock").toLowerCase();
  const factory = AUDIO_PROVIDER_REGISTRY[key];
  if (!factory) {
    throw new AudioProviderUnavailableError(
      name || key || process.env.AUDIO_PROVIDER || "",
    );
  }
  return factory();
}
