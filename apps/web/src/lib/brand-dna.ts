// VORTEX AI — Brand DNA serialization helpers
//
// The Prisma `BrandDna` model stores brand data in three JSON columns
// (`visualIdentity`, `voiceTone`, `complianceRules`). The UI and API work with
// the flattened, typed `BrandDnaPayload` shape below. These helpers are the
// single bridge between the two so the on-disk shape can't drift from what
// the editor writes or reads.

import type {
  BrandCharacter,
  BrandCompliance,
  BrandLogo,
  BrandTypography,
  BrandVoice,
  BrandVisualIdentity,
} from "@/types";

export interface BrandDnaRow {
  id: string;
  name: string;
  visualIdentity: unknown;
  voiceTone: unknown;
  complianceRules: unknown;
  createdAt: Date;
  updatedAt: Date;
}

/** Flattened brand DNA shape used by the API and the editor form. */
export interface BrandDnaPayload {
  name: string;
  colors: BrandVisualIdentity;
  typography: BrandTypography;
  logo: BrandLogo;
  voice: BrandVoice;
  characters?: BrandCharacter | null;
  compliance: BrandCompliance;
}

// ============================================================
// Normalizers (tolerate missing / partially-filled JSON)
// ============================================================

function toStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === "string")
    : [];
}

function maybeObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeColors(value: unknown): BrandVisualIdentity {
  const obj = maybeObject(value);
  return {
    primary: toStringArray(obj.primary),
    secondary: toStringArray(obj.secondary),
    forbidden: toStringArray(obj.forbidden),
  };
}

function normalizeTypography(value: unknown): BrandTypography {
  const obj = maybeObject(value);
  return {
    headingFont: typeof obj.headingFont === "string" ? obj.headingFont : "",
    bodyFont: typeof obj.bodyFont === "string" ? obj.bodyFont : "",
    minSizePx:
      typeof obj.minSizePx === "number" ? obj.minSizePx : 16,
  };
}

function normalizeLogo(value: unknown): BrandLogo {
  const obj = maybeObject(value);
  const variants = Array.isArray(obj.variants) ? obj.variants : [];
  return {
    variants: variants.filter(
      (v): v is BrandLogo["variants"][number] => {
        if (v && typeof v === "object") {
          const vo = v as Record<string, unknown>;
          return typeof vo.url === "string" && typeof vo.id === "string";
        }
        return false;
      }
    ),
    placementRules:
      obj.placementRules === "bottom_right" ||
      obj.placementRules === "custom"
        ? obj.placementRules
        : "top_left",
    minSizePercent:
      typeof obj.minSizePercent === "number" ? obj.minSizePercent : 10,
  };
}

function normalizeVoice(value: unknown): BrandVoice {
  const obj = maybeObject(value);
  return {
    adjectives: toStringArray(obj.adjectives),
    forbiddenWords: toStringArray(obj.forbiddenWords),
    sentenceStructure:
      obj.sentenceStructure === "descriptive" ||
      obj.sentenceStructure === "technical"
        ? obj.sentenceStructure
        : "short_punchy",
  };
}
function normalizeCharacter(value: unknown): BrandCharacter | null {
  const obj = maybeObject(value);
  if (Object.keys(obj).length === 0) return null;
  const references = Array.isArray(obj.referenceImages)
    ? obj.referenceImages
    : [];
  return {
    referenceImages: references.filter(
      (v): v is BrandCharacter["referenceImages"][number] => {
        if (v && typeof v === "object") {
          const vo = v as Record<string, unknown>;
          return typeof vo.url === "string" && typeof vo.id === "string";
        }
        return false;
      }
    ),
    ageRange: typeof obj.ageRange === "string" ? obj.ageRange : "",
    style:
      obj.style === "illustrated" || obj.style === "3d"
        ? obj.style
        : "photorealistic",
    consistencyRules:
      typeof obj.consistencyRules === "string" ? obj.consistencyRules : "",
  };
}
function normalizeCompliance(value: unknown): BrandCompliance {
  const obj = maybeObject(value);
  const regionalRules: Record<string, string[]> = {};
  if (obj.regionalRules && typeof obj.regionalRules === "object") {
    for (const [key, val] of Object.entries(
      obj.regionalRules as Record<string, unknown>
    )) {
      regionalRules[key] = toStringArray(val);
    }
  }
  return {
    requiredDisclaimers: toStringArray(obj.requiredDisclaimers),
    industry:
      obj.industry === "health" ||
      obj.industry === "finance" ||
      obj.industry === "alcohol"
        ? obj.industry
        : "general",
    regionalRules,
  };
}

// ============================================================
// Mapping
// ============================================================

/** Maps a Prisma `BrandDna` row to the flattened payload shape. */
export function brandDnaToPayload(row: BrandDnaRow): BrandDnaPayload {
  const visual = maybeObject(row.visualIdentity);
  const voice = maybeObject(row.voiceTone);
  const compliance = maybeObject(row.complianceRules);

  return {
    name: row.name,
    colors: normalizeColors(visual.colors),
    typography: normalizeTypography(visual.typography),
    logo: normalizeLogo(visual.logo),
    voice: normalizeVoice(voice.voice),
    characters: normalizeCharacter(voice.characters),
    compliance: normalizeCompliance(compliance.compliance),
  };
}

/** Maps the flattened payload to the JSON values stored on the model. */
export function payloadToBrandDnaJson(payload: BrandDnaPayload): {
  visualIdentity: unknown;
  voiceTone: unknown;
  complianceRules: unknown;
} {
  return {
    visualIdentity: {
      colors: payload.colors,
      typography: payload.typography,
      logo: payload.logo,
    },
    voiceTone: {
      voice: payload.voice,
      characters: payload.characters ?? {},
    },
    complianceRules: {
      compliance: payload.compliance,
    },
  };
}

/** A fully-populated blank payload for a new brand profile. */
export function defaultBrandDnaPayload(): BrandDnaPayload {
  return {
    name: "",
    colors: { primary: [], secondary: [], forbidden: [] },
    typography: { headingFont: "", bodyFont: "", minSizePx: 16 },
    logo: { variants: [], placementRules: "top_left", minSizePercent: 10 },
    voice: {
      adjectives: [],
      forbiddenWords: [],
      sentenceStructure: "short_punchy",
    },
    compliance: {
      requiredDisclaimers: [],
      industry: "general",
      regionalRules: {},
    },
  };
}
// ============================================================
// Brand brief rendering (for AI context injection)
// ============================================================

function joinList(items: string[] | undefined | null): string {
  const filtered = (items ?? []).filter(Boolean);
  return filtered.length > 0 ? filtered.join(", ") : "not specified";
}

/**
 * Renders a saved brand profile into a compact, human-readable brief that can
 * be injected into an AI prompt's `brandContext`. Every section is represented
 * so the model has a complete picture, while empty sections degrade gracefully
 * to "not specified" instead of being dropped entirely.
 */
export function buildBrandContext(payload: BrandDnaPayload): string {
  const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

  const primaryColors = payload.colors.primary.filter((c) =>
    hexPattern.test(c.trim())
  );
  const namedColors = payload.colors.primary
    .map((c) => c.trim())
    .filter((c) => !hexPattern.test(c));

  const colorList =
    primaryColors.length > 0 || namedColors.length > 0
      ? [
          ...(primaryColors.length > 0
            ? [`primary: ${primaryColors.join(" ")}`]
            : []),
          ...(namedColors.length > 0
            ? [`named: ${namedColors.join(", ")}`]
            : []),
          ...(payload.colors.secondary.length > 0
            ? [`secondary: ${payload.colors.secondary.join(", ")}`]
            : []),
        ].join(" · ")
      : "not specified";

  const sections = [
    `Brand: ${payload.name || "Unnamed brand"}`,
    `Visual identity - colors: ${colorList}${
      payload.colors.forbidden.length > 0
        ? `; forbidden: ${payload.colors.forbidden.join(", ")}`
        : ""
    }; typography: heading ${payload.typography.headingFont || "not specified"}, body ${
      payload.typography.bodyFont || "not specified"
    }, min body size ${payload.typography.minSizePx}px; logo placement ${
      payload.logo.placementRules
    } (min ${payload.logo.minSizePercent}% of frame)`,
    `Voice: ${joinList(payload.voice.adjectives)}${
      payload.voice.forbiddenWords.length > 0
        ? `; avoid: ${payload.voice.forbiddenWords.join(", ")}`
        : ""
    }; sentence structure: ${payload.voice.sentenceStructure.replace(
      "_",
      " "
    )}`,
  ];

  if (payload.characters) {
    sections.push(
      `Characters: age range ${payload.characters.ageRange || "not specified"}, style ${
        payload.characters.style
      }${
        payload.characters.consistencyRules
          ? `; consistency: ${payload.characters.consistencyRules}`
          : ""
      }${
        payload.characters.referenceImages.length > 0
          ? `; ${payload.characters.referenceImages.length} reference image(s) attached`
          : ""
      }`
    );
  }

  sections.push(
    `Compliance: industry ${payload.compliance.industry}${
      payload.compliance.requiredDisclaimers.length > 0
        ? `; must include disclaimer(s): ${payload.compliance.requiredDisclaimers.join(
            "; "
          )}`
        : ""
    }${
      Object.keys(payload.compliance.regionalRules).length > 0
        ? `; regional rules: ${Object.entries(payload.compliance.regionalRules)
            .map(
              ([region, rules]) =>
                `${region} (${(rules ?? []).join(", ")})`
            )
            .join("; ")}`
        : ""
    }`
  );

  return sections.join("\n");
}

/**
 * Composes the final brand context for an AI request from an optional saved
 * brand profile and an optional manually-entered brief. The saved profile is
 * authoritative; a manual brief is appended so both are honored.
 */
export function composeBrandContext(
  profile: BrandDnaRow | null | undefined,
  manual?: string | null
): string | null {
  const manualText = manual?.trim();
  if (!profile) return manualText || null;

  const profileContext = buildBrandContext(brandDnaToPayload(profile));
  if (!profileContext) return manualText || null;

  return manualText
    ? `${profileContext}\n\nAdditional brief from user:\n${manualText}`
    : profileContext;
}

/**
 * Loads a project's assigned brand profile and renders it as an AI brand
 * context string, or returns null when the project has no brand assignment.
 */
export async function loadBrandContextForProject(
  prismaClient: {
    brandDna: {
      findUnique: (args: {
        where: { id: string };
      }) => Promise<BrandDnaRow | null>;
    };
  },
  project: { brandDnaId?: string | null },
  manual?: string | null
): Promise<string | null> {
  if (!project.brandDnaId) return manual?.trim() || null;

  const row = await prismaClient.brandDna.findUnique({
    where: { id: project.brandDnaId },
  });

  return composeBrandContext(row, manual);
}

// ============================================================
// Visual brand enrichment (video / image generation prompts)
// ============================================================

const HEX_COLOR_PATTERN = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;

function cleanList(items: string[]): string[] {
  return items.map((item) => item.trim()).filter(Boolean);
}

/**
 * Builds a compact visual-style suffix describing a brand's look so rendered
 * scenes match the brand guidelines. Only concrete visual rules are included;
 * empty profiles yield `null` so the render prompt stays untouched.
 */
export function buildBrandVisualPromptSuffix(
  payload: BrandDnaPayload
): string | null {
  const parts: string[] = [];

  const hexColors = cleanList(payload.colors.primary).filter((c) =>
    HEX_COLOR_PATTERN.test(c)
  );
  if (hexColors.length > 0) {
    parts.push(`brand colors ${hexColors.join(", ")}`);
  }

  const accents = cleanList(payload.colors.secondary);
  if (accents.length > 0) {
    parts.push(`accent colors ${accents.join(", ")}`);
  }

  if (payload.typography.headingFont.trim()) {
    parts.push(`heading font ${payload.typography.headingFont.trim()}`);
  }
  if (payload.typography.bodyFont.trim()) {
    parts.push(`body font ${payload.typography.bodyFont.trim()}`);
  }
  if (payload.logo.placementRules.trim()) {
    parts.push(`logo placement ${payload.logo.placementRules.trim()}`);
  }
  if (payload.logo.minSizePercent > 0) {
    parts.push(`logo minimum size ${payload.logo.minSizePercent}% of frame`);
  }

  return parts.length > 0 ? `Brand style: ${parts.join("; ")}.` : null;
}

/**
 * Builds a negative-prompt suffix listing forbidden brand elements so renders
 * avoid them. Returns `null` when the profile forbids nothing.
 */
export function buildBrandNegativePromptSuffix(
  payload: BrandDnaPayload
): string | null {
  const parts: string[] = [];

  const forbiddenColors = cleanList(payload.colors.forbidden);
  if (forbiddenColors.length > 0) {
    parts.push(`avoid colors ${forbiddenColors.join(", ")}`);
  }

  const forbiddenWords = cleanList(payload.voice.forbiddenWords);
  if (forbiddenWords.length > 0) {
    parts.push(`avoid words "${forbiddenWords.join('", "')}"`);
  }

  return parts.length > 0 ? parts.join("; ") : null;
}

/**
 * Enriches a scene's render prompts with the project's brand visual identity.
 * The scene's stored prompt is never mutated — only the provider request gains
 * the brand suffix. Returns the inputs unchanged when no brand is assigned.
 */
export function enrichScenePrompts(input: {
  prompt: string;
  negativePrompt: string | null;
  brand: BrandDnaRow | null | undefined;
}): { prompt: string; negativePrompt: string | null } {
  if (!input.brand) {
    return { prompt: input.prompt, negativePrompt: input.negativePrompt };
  }

  const payload = brandDnaToPayload(input.brand);
  const styleSuffix = buildBrandVisualPromptSuffix(payload);
  const negativeSuffix = buildBrandNegativePromptSuffix(payload);

  return {
    prompt: styleSuffix
      ? `${input.prompt.trim()}\n\n${styleSuffix}`
      : input.prompt,
    negativePrompt: negativeSuffix
      ? `${input.negativePrompt?.trim() ?? ""} ${negativeSuffix}`.trim()
      : input.negativePrompt,
  };
}

/**
 * Enriches an image generation prompt with the project's brand visual identity
 * (colors, typography, logo rules) plus the brand's forbidden-colors/words
 * guidance. Unlike scenes, image generation sends a single text prompt with no
 * separate negative-prompt field, so avoidance rules are folded into the prompt
 * as guidance. The stored prompt is never mutated — only the provider request
 * gains the suffix. Returns the prompt unchanged when no brand is assigned or
 * the profile expresses no visual rules.
 */
export function enrichImagePrompt(input: {
  prompt: string;
  brand: BrandDnaRow | null | undefined;
}): { prompt: string } {
  if (!input.brand) {
    return { prompt: input.prompt };
  }

  const payload = brandDnaToPayload(input.brand);
  const styleSuffix = buildBrandVisualPromptSuffix(payload);
  const negativeSuffix = buildBrandNegativePromptSuffix(payload);

  const sections: string[] = [];
  if (styleSuffix) sections.push(styleSuffix);
  if (negativeSuffix) sections.push(negativeSuffix);

  if (sections.length === 0) {
    return { prompt: input.prompt };
  }

  return { prompt: `${input.prompt.trim()}\n\n${sections.join(" ")}` };
}

// ============================================================
// Brand voice enrichment (audio generation prompts)
// ============================================================

/** Renders each brand sentence-structure choice as an audio directive. */
const BRAND_SENTENCE_HINTS: Record<
  BrandVoice["sentenceStructure"],
  string
> = {
  short_punchy: "short, punchy sentences",
  descriptive: "descriptive, flowing sentences",
  technical: "technical, precise phrasing",
};

/**
 * Builds a compact voice-style suffix for audio generation so voiceovers/music
 * match the brand's voice. Adjectives become a tone directive, the sentence
 * structure a phrasing hint, and forbidden words a plainly-stated avoidance
 * rule. The normalized default sentence structure is always emitted, so a brand
 * row always contributes a suffix (mirroring how the visual helper always emits
 * the default logo rules).
 */
export function buildBrandVoiceSuffix(payload: BrandDnaPayload): string | null {
  const parts: string[] = [];

  const adjectives = cleanList(payload.voice.adjectives);
  if (adjectives.length > 0) {
    parts.push(`tone of voice: ${adjectives.join(", ")}`);
  }

  parts.push(BRAND_SENTENCE_HINTS[payload.voice.sentenceStructure]);

  const forbiddenWords = cleanList(payload.voice.forbiddenWords);
  if (forbiddenWords.length > 0) {
    parts.push(
      `avoid words: ${forbiddenWords.map((word) => `"${word}"`).join(", ")}`,
    );
  }

  return `Brand voice: ${parts.join("; ")}.`;
}

/**
 * Enriches an audio generation prompt with the project's brand voice (tone,
 * sentence structure, forbidden words). Audio sends a single prompt with no
 * separate negative field, so avoidance rules are folded in as guidance. The
 * stored prompt is never mutated — only the provider request gains the suffix.
 * Returns the prompt unchanged when no brand is assigned.
 */
export function enrichAudioPrompt(input: {
  prompt: string;
  brand: BrandDnaRow | null | undefined;
}): { prompt: string } {
  if (!input.brand) {
    return { prompt: input.prompt };
  }

  const payload = brandDnaToPayload(input.brand);
  const suffix = buildBrandVoiceSuffix(payload);
  if (!suffix) {
    return { prompt: input.prompt };
  }

  return { prompt: `${input.prompt.trim()}\n\n${suffix}` };
}
