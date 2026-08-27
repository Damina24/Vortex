/**
 * Image generation provider catalog shared between the (server-side)
 * availability reporter and the (client-side) Image Suite dropdown. This
 * module must stay free of Node/Next.js dependencies so it can be imported
 * from client components without pulling server-only code into the bundle.
 */

export interface ImageProviderInfo {
  name: string;
  label: string;
  /** Whether the provider can generate right now (credentials configured). */
  available: boolean;
  /** Human-readable reason when `available` is false. */
  reason?: string;
}

/** The full image-provider list shown in the Image Suite's provider dropdown. */
export const IMAGE_PROVIDER_CATALOG: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "mock", label: "Mock (offline SVG poster)" },
  { value: "stability", label: "Stability AI" },
  { value: "flux", label: "FLUX (Black Forest Labs)" },
  { value: "gpt-image", label: "OpenAI (gpt-image)" },
];

/** Aspect-ratio options offered in the Image Suite. */
export const IMAGE_ASPECT_RATIOS: ReadonlyArray<{
  value: string;
  label: string;
}> = [
  { value: "16:9", label: "16:9 (landscape)" },
  { value: "9:16", label: "9:16 (portrait)" },
  { value: "1:1", label: "1:1 (square)" },
  { value: "4:5", label: "4:5 (portrait)" },
];