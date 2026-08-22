/**
 * Audio generation provider catalog shared between the (server-side)
 * availability reporter and the (client-side) Audio Suite dropdown. This
 * module must stay free of Node/Next.js dependencies so it can be imported
 * from client components without pulling server-only code into the bundle.
 */

export type AudioProviderKind = "voiceover" | "music";

export interface AudioProviderInfo {
  name: string;
  label: string;
  /** Whether the provider can generate right now (credentials configured). */
  available: boolean;
  /** Human-readable reason when `available` is false. */
  reason?: string;
  /** The audio kinds this provider can generate (used to filter the dropdown). */
  kinds: AudioProviderKind[];
}

/** The full audio-provider list shown in the Audio Suite's provider dropdown. */
export const AUDIO_PROVIDER_CATALOG: ReadonlyArray<{
  value: string;
  label: string;
  kinds: AudioProviderKind[];
}> = [
  { value: "mock", label: "Mock (offline WAV)", kinds: ["voiceover", "music"] },
  { value: "openai", label: "OpenAI TTS", kinds: ["voiceover"] },
  { value: "elevenlabs", label: "ElevenLabs", kinds: ["voiceover"] },
  { value: "suno", label: "Suno", kinds: ["music"] },
];
