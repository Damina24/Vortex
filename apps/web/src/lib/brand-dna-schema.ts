// VORTEX AI — Shared zod validation for Brand DNA payloads.
// Used by both the collection route (POST) and the item route (PATCH) so the
// create and update contracts can never drift.

import { z } from "zod";

const stringArraySchema = z.array(z.string().min(1)).default([]);

export const brandDnaSchema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  colors: z
    .object({
      primary: stringArraySchema,
      secondary: stringArraySchema,
      forbidden: stringArraySchema,
    })
    .default({ primary: [], secondary: [], forbidden: [] }),
  typography: z
    .object({
      headingFont: z.string().max(255).default(""),
      bodyFont: z.string().max(255).default(""),
      minSizePx: z.number().int().min(8).max(64).default(16),
    })
    .default({ headingFont: "", bodyFont: "", minSizePx: 16 }),
  logo: z
    .object({
      variants: z.array(z.unknown()).default([]),
      placementRules: z
        .enum(["top_left", "bottom_right", "custom"])
        .default("top_left"),
      minSizePercent: z.number().int().min(1).max(100).default(10),
    })
    .default({ variants: [], placementRules: "top_left", minSizePercent: 10 }),
  voice: z
    .object({
      adjectives: stringArraySchema,
      forbiddenWords: stringArraySchema,
      sentenceStructure: z
        .enum(["short_punchy", "descriptive", "technical"])
        .default("short_punchy"),
    })
    .default({
      adjectives: [],
      forbiddenWords: [],
      sentenceStructure: "short_punchy",
    }),
  characters: z
    .object({
      referenceImages: z.array(z.unknown()).default([]),
      ageRange: z.string().default(""),
      style: z
        .enum(["photorealistic", "illustrated", "3d"])
        .default("photorealistic"),
      consistencyRules: z.string().default(""),
    })
    .nullable()
    .optional(),
  compliance: z
    .object({
      requiredDisclaimers: stringArraySchema,
      industry: z
        .enum(["health", "finance", "general", "alcohol"])
        .default("general"),
      regionalRules: z.record(z.string(), stringArraySchema).default({}),
    })
    .default({
      requiredDisclaimers: [],
      industry: "general",
      regionalRules: {},
    }),
});

export type BrandDnaInput = z.infer<typeof brandDnaSchema>;