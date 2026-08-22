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

// --- Async (two-phase) audio providers --------------------------------------
// Real music providers (Suno, …) submit a generation and return a
// `providerJobId` immediately, then expose a `retrieve` call that is polled
// until the track is ready — mirroring the async video providers in
// `./providers`. `generate()` remains the synchronous interface for one-shot
// TTS providers (mock/openai/elevenlabs).

export interface AudioSubmitResult {
  providerJobId: string;
}

export type AudioRetrieveResult =
  | { status: "processing"; progress?: number }
  | { status: "succeeded"; result: AudioGenerationResult }
  | { status: "failed"; error: string };

export interface AsyncAudioGenerationProvider extends AudioGenerationProvider {
  submit(params: AudioGenerationParams): Promise<AudioSubmitResult>;
  /** `params` mirrors the original request; real providers may ignore it. */
  retrieve(
    providerJobId: string,
    params: AudioGenerationParams,
  ): Promise<AudioRetrieveResult>;
}

/** Capability check: is this provider two-phase (submit/poll/complete)? */
export function isAsyncAudioProvider(
  provider: AudioGenerationProvider,
): provider is AsyncAudioGenerationProvider {
  return (
    typeof (provider as AsyncAudioGenerationProvider).submit === "function"
  );
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
 * Configuration for the OpenAI TTS provider. Kept injectable so unit tests can
 * stub the key, base URL, and fetch implementation without a real key.
 */
export interface OpenAiAudioProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
}

/**
 * Real voiceover provider backed by the OpenAI Text-to-Speech API
 * (`POST /v1/audio/speech`). The response body is returned as an MP3 audio
 * asset. This is the keyless-free counterpart to `MockAudioProvider`: it makes
 * one network request, so it must be selected with `AUDIO_PROVIDER=openai`.
 */
export class OpenAiAudioProvider implements AudioGenerationProvider {
  readonly name = "openai";

  constructor(private readonly config: OpenAiAudioProviderConfig = {}) {}

  async generate(
    params: AudioGenerationParams,
  ): Promise<AudioGenerationResult> {
    if (params.kind !== "voiceover") {
      throw new Error("OpenAI TTS only supports voiceover generation");
    }

    const apiKey = this.config.apiKey ?? process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required when AUDIO_PROVIDER=openai");
    }

    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    const baseUrl = this.config.baseUrl ?? "https://api.openai.com/v1";
    const voice = params.voice || "alloy";
    const model = "tts-1";

    const digest = createHash("sha1")
      .update(`${params.prompt}:${voice}`)
      .digest("hex");

    const response = await fetchImpl(`${baseUrl}/audio/speech`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        input: params.prompt,
        voice,
        response_format: "mp3",
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI TTS request failed with status ${response.status}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    return {
      provider: this.name,
      providerJobId: `openai_tts_${digest.slice(0, 12)}`,
      duration: Math.max(1, Math.floor(params.duration)),
      files: [
        {
          filename: `voiceover-${digest.slice(0, 8)}.mp3`,
          contentType: "audio/mpeg",
          body,
        },
      ],
      metadata: { model, voice, format: "mp3", provider: "openai" },
    };
  }
}

// Register the real provider alongside mock. The default remains `mock`.
AUDIO_PROVIDER_REGISTRY.openai = () => new OpenAiAudioProvider();

/**
 * Configuration for the ElevenLabs voiceover provider. Kept injectable so unit
 * tests can stub the key, base URL, and fetch implementation without a real
 * key.
 */
export interface ElevenLabsAudioProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
  /** Default voice id used when `params.voice` is not provided. */
  voiceId?: string;
}

const ELEVENLABS_DEFAULT_BASE_URL = "https://api.elevenlabs.io";
const ELEVENLABS_DEFAULT_MODEL = "eleven_multilingual_v2";
/** "Rachel" — a well-known default voice from the ElevenLabs voice library. */
const ELEVENLABS_DEFAULT_VOICE_ID = "21m00Tcm4TlvDq8ikWAM";

/**
 * Real voiceover provider backed by the ElevenLabs Text-to-Speech API
 * (`POST /v1/text-to-speech/{voice_id}`, authenticated with the `xi-api-key`
 * header). The response body is returned as an MP3 audio asset. Select it with
 * `AUDIO_PROVIDER=elevenlabs` and set `ELEVENLABS_API_KEY`.
 */
export class ElevenLabsAudioProvider implements AudioGenerationProvider {
  readonly name = "elevenlabs";

  constructor(private readonly config: ElevenLabsAudioProviderConfig = {}) {}

  async generate(
    params: AudioGenerationParams,
  ): Promise<AudioGenerationResult> {
    if (params.kind !== "voiceover") {
      throw new Error("ElevenLabs only supports voiceover generation");
    }

    const apiKey = this.config.apiKey ?? process.env.ELEVENLABS_API_KEY;
    if (!apiKey) {
      throw new Error(
        "ELEVENLABS_API_KEY is required when AUDIO_PROVIDER=elevenlabs",
      );
    }

    const fetchImpl = this.config.fetchImpl ?? globalThis.fetch;
    const baseUrl = (
      this.config.baseUrl ?? ELEVENLABS_DEFAULT_BASE_URL
    ).replace(/\/+$/, "");
    const model = this.config.model ?? ELEVENLABS_DEFAULT_MODEL;
    const voiceId =
      params.voice ?? this.config.voiceId ?? ELEVENLABS_DEFAULT_VOICE_ID;

    const digest = createHash("sha1")
      .update(`${params.prompt}:${voiceId}:${model}`)
      .digest("hex");

    const response = await fetchImpl(
      `${baseUrl}/v1/text-to-speech/${encodeURIComponent(voiceId)}`,
      {
        method: "POST",
        headers: {
          "xi-api-key": apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: params.prompt,
          model_id: model,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0,
            use_speaker_boost: true,
          },
        }),
      },
    );

    if (!response.ok) {
      throw new Error(
        `ElevenLabs TTS request failed with status ${response.status}`,
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    const body = Buffer.from(arrayBuffer);

    return {
      provider: this.name,
      providerJobId: `elevenlabs_tts_${digest.slice(0, 12)}`,
      duration: Math.max(1, Math.floor(params.duration)),
      files: [
        {
          filename: `voiceover-${digest.slice(0, 8)}.mp3`,
          contentType: "audio/mpeg",
          body,
        },
      ],
      metadata: { model, voiceId, format: "mp3", provider: "elevenlabs" },
    };
  }
}

// ============================================================
// Suno — music-generation API provider (async two-phase)
// ============================================================
// Production-ready provider backed by a Suno-compatible generation gateway
// (the widely deployed `api.sunoapi.dev`-style API): `POST /api/v1/generation`
// kicks off a music-generation batch and returns its id, then
// `GET /api/v1/generation/{id}` is polled until its `output` array contains
// finished clips, at which point the first clip's `audio_url` is downloaded
// and wrapped in an `AudioGenerationResult`. Select it with
// `AUDIO_PROVIDER=suno` and set `SUNO_API_KEY`.
//
// NOTE: modeled on the public Suno gateway contract — verify the exact
// request/response shape against the gateway you integrate with before going
// to production.
export interface SunoAudioProviderConfig {
  apiKey?: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  model?: string;
}

const SUNO_DEFAULT_BASE_URL = "https://api.sunoapi.dev";
const SUNO_DEFAULT_MODEL = "chirp-v3-5";

/** Coerces a Suno gateway JSON body into a plain record (unwraps `data`). */
function sunoJson(body: unknown): Record<string, unknown> {
  if (body === null || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  if (
    typeof record.data === "object" &&
    record.data !== null &&
    !Array.isArray(record.data)
  ) {
    return { ...record, ...(record.data as Record<string, unknown>) };
  }
  return record;
}

export class SunoMusicProvider implements AsyncAudioGenerationProvider {
  readonly name = "suno";

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly model: string;

  constructor(config: SunoAudioProviderConfig = {}) {
    this.apiKey = config.apiKey ?? process.env.SUNO_API_KEY ?? "";
    this.baseUrl = (config.baseUrl ?? SUNO_DEFAULT_BASE_URL).replace(
      /\/+$/,
      "",
    );
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
    this.model = config.model ?? process.env.SUNO_MODEL ?? SUNO_DEFAULT_MODEL;
  }

  /** Suno is two-phase: use `submit()` then `retrieve()` (polled by the API). */
  async generate(
    _params: AudioGenerationParams,
  ): Promise<AudioGenerationResult> {
    throw new Error(
      "SunoMusicProvider is two-phase: use submit() then retrieve()",
    );
  }

  async submit(params: AudioGenerationParams): Promise<AudioSubmitResult> {
    this.assertConfigured();
    if (params.kind !== "music") {
      throw new Error("Suno only supports music generation");
    }

    const body: Record<string, unknown> = {
      prompt: params.prompt,
      title: params.projectName ?? "Untitled track",
      make_instrumental: false,
      model: this.model,
    };
    if (params.style) body.style = params.style;

    const response = await this.fetchImpl(`${this.baseUrl}/api/v1/generation`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`Suno submit failed with status ${response.status}`);
    }

    const data = sunoJson(await response.json());
    if (data.status === false) {
      throw new Error(
        `Suno submit failed: ${String(data.message ?? data.error ?? "unknown error")}`,
      );
    }
    const jobId = typeof data.id === "string" ? (data.id as string) : undefined;
    if (!jobId) {
      throw new Error("Suno submit returned no generation id");
    }
    return { providerJobId: jobId };
  }

  async retrieve(
    providerJobId: string,
    params: AudioGenerationParams,
  ): Promise<AudioRetrieveResult> {
    this.assertConfigured();
    const id = encodeURIComponent(providerJobId);
    const response = await this.fetchImpl(
      `${this.baseUrl}/api/v1/generation/${id}`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${this.apiKey}` },
      },
    );
    if (!response.ok) {
      throw new Error(`Suno retrieve failed with status ${response.status}`);
    }

    const data = sunoJson(await response.json());
    if (data.status === false || data.failed === true) {
      return {
        status: "failed",
        error: String(data.message ?? data.error ?? "Suno generation failed"),
      };
    }

    const clips = Array.isArray(data.output) ? data.output : [];
    if (clips.length === 0) {
      return { status: "processing" };
    }

    const firstClip = clips.find(
      (clip): clip is Record<string, unknown> =>
        typeof clip === "object" &&
        clip !== null &&
        typeof (clip as Record<string, unknown>).audio_url === "string",
    );
    if (!firstClip) {
      // Clips exist but none has a finished audio_url yet — keep polling.
      return { status: "processing" };
    }

    const audioUrl = String(firstClip.audio_url);
    const file = await this.downloadAudio(audioUrl);

    const rawDuration = Number(firstClip.duration);
    const duration =
      Number.isFinite(rawDuration) && rawDuration > 0
        ? Math.max(1, Math.round(rawDuration))
        : Math.max(1, Math.floor(params.duration));

    const digest = createHash("sha1").update(providerJobId).digest("hex");

    return {
      status: "succeeded",
      result: {
        provider: this.name,
        providerJobId,
        duration,
        files: [
          {
            filename: `suno-${digest.slice(0, 8)}.mp3`,
            contentType: file.contentType,
            body: file.body,
          },
        ],
        metadata: {
          model: this.model,
          title: typeof firstClip.title === "string" ? firstClip.title : null,
          imageUrl:
            typeof firstClip.image_url === "string"
              ? firstClip.image_url
              : null,
          format: "mp3",
          provider: "suno",
        },
      },
    };
  }

  private assertConfigured(): void {
    if (!this.apiKey) {
      throw new Error("SUNO_API_KEY is required when AUDIO_PROVIDER=suno");
    }
  }

  private async downloadAudio(
    url: string,
  ): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.fetchImpl(url, { method: "GET" });
    if (!res.ok) {
      throw new Error(`Suno audio download failed with status ${res.status}`);
    }
    const arrayBuffer = await res.arrayBuffer();
    return {
      body: Buffer.from(arrayBuffer),
      contentType: res.headers.get("content-type") ?? "audio/mpeg",
    };
  }
}

// Register the real music provider alongside mock/openai/elevenlabs. The
// default remains `mock`; set AUDIO_PROVIDER=suno (with SUNO_API_KEY) to
// generate real tracks end-to-end.
AUDIO_PROVIDER_REGISTRY.suno = () => new SunoMusicProvider();

// Register the real provider alongside mock/openai. The default remains `mock`.
AUDIO_PROVIDER_REGISTRY.elevenlabs = () => new ElevenLabsAudioProvider();

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
