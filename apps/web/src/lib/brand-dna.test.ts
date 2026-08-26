import { describe, expect, it } from "vitest";
import {
  brandDnaToPayload,
  buildBrandContext,
  buildBrandVoiceSuffix,
  composeBrandContext,
  defaultBrandDnaPayload,
  enrichAudioPrompt,
  enrichImagePrompt,
  payloadToBrandDnaJson,
  type BrandDnaPayload,
  type BrandDnaRow,
} from "./brand-dna";

const rowFixture: BrandDnaRow = {
  id: "bd-1",
  name: "Acme Organic",
  visualIdentity: {
    colors: { primary: ["#0B3C2D"], secondary: ["#D4A24E"], forbidden: ["#FF0000"] },
    typography: { headingFont: "Bebas Neue", bodyFont: "Inter", minSizePx: 18 },
    logo: {
      variants: [
        { id: "asset-1", url: "https://cdn.example.com/logo.png", name: "Logo" },
      ],
      placementRules: "top_left",
      minSizePercent: 12,
    },
  },
  voiceTone: {
    voice: {
      adjectives: ["energetic", "trustworthy"],
      forbiddenWords: ["cheap"],
      sentenceStructure: "short_punchy",
    },
    characters: {
      referenceImages: [
        { id: "asset-2", url: "https://cdn.example.com/char.png", name: "Mascot" },
      ],
      ageRange: "25-40",
      style: "3d",
      consistencyRules: "Keep the mascot facing forward.",
    },
  },
  complianceRules: {
    compliance: {
      requiredDisclaimers: ["Results may vary"],
      industry: "health",
      regionalRules: { US: ["English only"] },
    },
  },
  createdAt: new Date("2026-01-01"),
  updatedAt: new Date("2026-01-02"),
};

describe("brandDnaToPayload", () => {
  it("flattens the stored JSON columns into the typed payload", () => {
    const payload = brandDnaToPayload(rowFixture);

    expect(payload.name).toBe("Acme Organic");
    expect(payload.colors.primary).toEqual(["#0B3C2D"]);
    expect(payload.typography.headingFont).toBe("Bebas Neue");
    expect(payload.typography.minSizePx).toBe(18);
    expect(payload.logo.placementRules).toBe("top_left");
    expect(payload.logo.minSizePercent).toBe(12);
    expect(payload.voice.adjectives).toEqual(["energetic", "trustworthy"]);
    expect(payload.characters?.style).toBe("3d");
    expect(payload.compliance.industry).toBe("health");
    expect(payload.compliance.requiredDisclaimers).toEqual(["Results may vary"]);
    expect(payload.compliance.regionalRules["US"]).toEqual(["English only"]);
  });

  it("tolerates a brand row with empty/missing JSON columns", () => {
    const payload = brandDnaToPayload({
      id: "bd-2",
      name: "Empty",
      visualIdentity: null,
      voiceTone: {},
      complianceRules: undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(payload.colors).toEqual({ primary: [], secondary: [], forbidden: [] });
    expect(payload.typography.minSizePx).toBe(16);
    expect(payload.logo.placementRules).toBe("top_left");
    expect(payload.voice.sentenceStructure).toBe("short_punchy");
    expect(payload.compliance.industry).toBe("general");
    expect(payload.characters).toBeNull();
  });

  it("falls back to defaults for malformed inline values", () => {
    const payload = brandDnaToPayload({
      id: "bd-3",
      name: "Messy",
      visualIdentity: {
        colors: { primary: "not-an-array", secondary: [123], forbidden: null },
        typography: { headingFont: 42, minSizePx: "big" },
        logo: { variants: [{ url: "missing-id" }], placementRules: "sideways" },
      },
      voiceTone: { voice: { sentenceStructure: "loud" } },
      complianceRules: { compliance: { industry: "crypto" } },
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(payload.colors.primary).toEqual([]);
    expect(payload.typography.headingFont).toBe("");
    expect(payload.typography.minSizePx).toBe(16);
    expect(payload.logo.variants).toEqual([]);
    expect(payload.logo.placementRules).toBe("top_left");
    expect(payload.voice.sentenceStructure).toBe("short_punchy");
    expect(payload.compliance.industry).toBe("general");
  });
});

describe("payloadToBrandDnaJson", () => {
  it("round-trips through brandDnaToPayload", () => {
    const source: BrandDnaPayload = brandDnaToPayload(rowFixture);
    const json = payloadToBrandDnaJson(source);

    const roundTripped = brandDnaToPayload({
      id: "bd-x",
      name: source.name,
      visualIdentity: json.visualIdentity,
      voiceTone: json.voiceTone,
      complianceRules: json.complianceRules,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    expect(roundTripped).toEqual(source);
  });

  it("always stores `characters` as an object key", () => {
    const json = payloadToBrandDnaJson(defaultBrandDnaPayload());
    const voice = json.voiceTone as Record<string, unknown>;
    expect(voice.characters).toEqual({});
    const compliance = json.complianceRules as Record<string, unknown>;
    expect(compliance.compliance).toEqual(
      expect.objectContaining({ industry: "general", regionalRules: {} })
    );
  });
});

describe("defaultBrandDnaPayload", () => {
  it("returns a ready-to-edit blank payload", () => {
    const defaults = defaultBrandDnaPayload();

    expect(defaults.name).toBe("");
    expect(defaults.colors.primary).toEqual([]);
    expect(defaults.typography.minSizePx).toBe(16);
    expect(defaults.logo.placementRules).toBe("top_left");
    expect(defaults.voice.sentenceStructure).toBe("short_punchy");
    expect(defaults.compliance.industry).toBe("general");
    expect(defaults.characters).toBeUndefined();
  });
});
describe("buildBrandContext", () => {
  it("renders a full profile into a readable brand brief", () => {
    const payload = brandDnaToPayload(rowFixture);
    const brief = buildBrandContext(payload);

    expect(brief).toContain("Brand: Acme Organic");
    expect(brief).toContain("primary: #0B3C2D");
    expect(brief).toContain("secondary: #D4A24E");
    expect(brief).toContain("forbidden: #FF0000");
    expect(brief).toContain("heading Bebas Neue");
    expect(brief).toContain("min body size 18px");
    expect(brief).toContain("logo placement top_left");
    expect(brief).toContain("min 12%");
    expect(brief).toContain("energetic, trustworthy");
    expect(brief).toContain("avoid: cheap");
    expect(brief).toContain("industry health");
    expect(brief).toContain("must include disclaimer(s): Results may vary");
    expect(brief).toContain("US (English only)");
  });

  it("splits hex and named primary colors into distinct list groups", () => {
    const payload = defaultBrandDnaPayload();
    payload.colors.primary = ["#FF00AA", "Deep Forest Green"];
    const brief = buildBrandContext(payload);

    expect(brief).toContain("primary: #FF00AA");
    expect(brief).toContain("named: Deep Forest Green");
  });

  it("degrades empty profiles to not specified placeholders", () => {
    const brief = buildBrandContext(defaultBrandDnaPayload());

    expect(brief).toContain("Brand: Unnamed brand");
    expect(brief).toContain("colors: not specified");
    expect(brief).toContain("heading not specified");
  });
});

describe("composeBrandContext", () => {
  it("prefers the saved profile over nothing", () => {
    const context = composeBrandContext(rowFixture);

    expect(context).toContain("Brand: Acme Organic");
  });

  it("appends a manual brief when both exist", () => {
    const context = composeBrandContext(rowFixture, "Focus on eco-packaging.");

    expect(context).toContain("Brand: Acme Organic");
    expect(context).toContain("Additional brief from user:");
    expect(context).toContain("Focus on eco-packaging.");
  });

  it("falls back to the manual brief when there is no profile", () => {
    const context = composeBrandContext(null, "Manual only.");

    expect(context).toBe("Manual only.");
  });

  it("returns null when there is neither a profile nor a brief", () => {
    expect(composeBrandContext(null, undefined)).toBeNull();
    expect(composeBrandContext(null, "   ")).toBeNull();
  });
});

describe("enrichImagePrompt", () => {
  it("leaves the prompt untouched when no brand is assigned", () => {
    const result = enrichImagePrompt({ prompt: "a fox in snow", brand: null });
    expect(result.prompt).toBe("a fox in snow");

    expect(
      enrichImagePrompt({ prompt: "a fox in snow", brand: undefined }).prompt,
    ).toBe("a fox in snow");
  });

  it("folds the brand style guide and avoidance rules into the single prompt", () => {
    const result = enrichImagePrompt({
      prompt: "a sleek sports car",
      brand: rowFixture,
    });

    expect(result.prompt).toContain("Brand style:");
    expect(result.prompt).toContain("brand colors #0B3C2D");
    expect(result.prompt).toContain("accent colors #D4A24E");
    expect(result.prompt).toContain("heading font Bebas Neue");
    expect(result.prompt).toContain("body font Inter");
    expect(result.prompt).toContain("logo placement top_left");
    expect(result.prompt).toContain("logo minimum size 12% of frame");
    expect(result.prompt).toContain("avoid colors #FF0000");
    expect(result.prompt).toContain('avoid words "cheap"');
  });

  it("carries the default logo rules for an otherwise-empty profile", () => {
    const emptyRow: BrandDnaRow = {
      id: "bd-empty",
      name: "Empty",
      visualIdentity: null,
      voiceTone: {},
      complianceRules: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = enrichImagePrompt({
      prompt: "a fox in a forest",
      brand: emptyRow,
    });

    // Normalized defaults (logo placement + min size) are always present, so a
    // brand row still contributes a style suffix; audiences/avoidance are empty.
    expect(result.prompt).toContain("a fox in a forest");
    expect(result.prompt).toContain(
      "Brand style: logo placement top_left; logo minimum size 10% of frame.",
    );
    expect(result.prompt).not.toContain("avoid colors");
    expect(result.prompt).not.toContain("avoid words");
  });
});

describe("buildBrandVoiceSuffix", () => {
  it("maps adjectives, sentence structure, and forbidden words to directives", () => {
    const suffix = buildBrandVoiceSuffix(brandDnaToPayload(rowFixture));

    expect(suffix).toContain("tone of voice: energetic, trustworthy");
    expect(suffix).toContain("short, punchy sentences");
    expect(suffix).toContain('avoid words: "cheap"');
  });

  it("maps descriptive and technical sentence structures", () => {
    const descriptive = defaultBrandDnaPayload();
    descriptive.voice.sentenceStructure = "descriptive";
    expect(buildBrandVoiceSuffix(descriptive)).toContain(
      "descriptive, flowing sentences",
    );

    const technical = defaultBrandDnaPayload();
    technical.voice.sentenceStructure = "technical";
    expect(buildBrandVoiceSuffix(technical)).toContain(
      "technical, precise phrasing",
    );
  });

  it("periods and empties the avoidance segment when no words are forbidden", () => {
    const payload = defaultBrandDnaPayload();
    const suffix = buildBrandVoiceSuffix(payload);

    expect(suffix).toContain("Brand voice:");
    expect(suffix).toContain("short, punchy sentences");
    expect(suffix).not.toContain("avoid words");
  });
});

describe("enrichAudioPrompt", () => {
  it("leaves the prompt untouched when no brand is assigned", () => {
    expect(
      enrichAudioPrompt({ prompt: "upbeat summer track", brand: null }).prompt,
    ).toBe("upbeat summer track");

    expect(
      enrichAudioPrompt({
        prompt: "upbeat summer track",
        brand: undefined,
      }).prompt,
    ).toBe("upbeat summer track");
  });

  it("folds the brand voice directives into the single prompt", () => {
    const result = enrichAudioPrompt({
      prompt: "a confident launch voiceover",
      brand: rowFixture,
    });

    expect(result.prompt).toContain("a confident launch voiceover");
    expect(result.prompt).toContain("Brand voice:");
    expect(result.prompt).toContain("tone of voice: energetic, trustworthy");
    expect(result.prompt).toContain('avoid words: "cheap"');
  });

  it("always emits a suffix for a brand row via the default sentence structure", () => {
    const emptyRow: BrandDnaRow = {
      id: "bd-empty",
      name: "Empty",
      visualIdentity: null,
      voiceTone: {},
      complianceRules: {},
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = enrichAudioPrompt({
      prompt: "laid-back lounge music",
      brand: emptyRow,
    });

    expect(result.prompt).toContain("laid-back lounge music");
    expect(result.prompt).toContain("Brand voice:");
    expect(result.prompt).toContain("short, punchy sentences");
    expect(result.prompt).not.toContain("avoid words");
  });
});