/**
 * Provider catalog shared between the (server-side) availability reporter and
 * the (client-side) scene generator dropdown. This module must stay free of
 * Node/Next.js dependencies so it can be imported from client components
 * without pulling server-only code (crypto, child_process, …) into the bundle.
 */

export interface VideoProviderInfo {
  name: string;
  label: string;
  /** Whether the provider can render right now (credentials configured). */
  available: boolean;
  /** Human-readable reason when `available` is false. */
  reason?: string;
}

/** The full render-provider list shown in the scene generator dropdown. */
export const VIDEO_PROVIDER_CATALOG: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "mock", label: "Mock (fast, offline)" },
  { value: "mock-async", label: "Mock async (poll flow)" },
  { value: "ffmpeg", label: "FFmpeg (local MP4)" },
  { value: "kling", label: "Kling AI" },
  { value: "runway", label: "Runway AI" },
  { value: "hailuo", label: "Hailuo AI" },
  { value: "wan", label: "WAN AI" },
];
