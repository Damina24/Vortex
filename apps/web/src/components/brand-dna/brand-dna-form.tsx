"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Save, Loader2 } from "lucide-react";
import toast from "react-hot-toast";
import axios from "axios";
import type { BrandDnaPayload } from "@/lib/brand-dna";

interface BrandDnaFormProps {
  /** Present when editing an existing brand profile; omitted when creating. */
  brandDnaId?: string;
  initialData?: BrandDnaPayload | null;
}

/** Converts a string[] into a comma-separated, deduped display string. */
function toListString(values: string[] | undefined | null): string {
  return Array.from(new Set((values ?? []).filter(Boolean))).join(", ");
}

/** Parses a comma/tab/newline separated string into a trimmed string[]. */
function parseListString(raw: string): string[] {
  return Array.from(
    new Set(
      raw
        .split(/[,;\n]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

const inputClass =
  "w-full rounded-lg border bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-sm font-medium">
      {children}
    </label>
  );
}

/**
 * Shared create/edit form for a brand profile (visual identity, typography,
 * voice, and compliance). Present the same sections as the Brand DNA spec so
 * the values flow straight into the AI prompt-enrichment context.
 */
export function BrandDnaForm({ brandDnaId, initialData }: BrandDnaFormProps) {
  const router = useRouter();
  const isEdit = Boolean(brandDnaId);
  const [isSaving, setIsSaving] = useState(false);

  const [name, setName] = useState(initialData?.name ?? "");
  const [primary, setPrimary] = useState(
    toListString(initialData?.colors?.primary)
  );
  const [secondary, setSecondary] = useState(
    toListString(initialData?.colors?.secondary)
  );
  const [forbidden, setForbidden] = useState(
    toListString(initialData?.colors?.forbidden)
  );
  const [headingFont, setHeadingFont] = useState(
    initialData?.typography?.headingFont ?? ""
  );
  const [bodyFont, setBodyFont] = useState(
    initialData?.typography?.bodyFont ?? ""
  );
  const [minSizePx, setMinSizePx] = useState(
    initialData?.typography?.minSizePx ?? 16
  );
  const [placementRules, setPlacementRules] = useState<
    "top_left" | "bottom_right" | "custom"
  >(initialData?.logo?.placementRules ?? "top_left");
  const [minSizePercent, setMinSizePercent] = useState(
    initialData?.logo?.minSizePercent ?? 10
  );
  const [adjectives, setAdjectives] = useState(
    toListString(initialData?.voice?.adjectives)
  );
  const [forbiddenWords, setForbiddenWords] = useState(
    toListString(initialData?.voice?.forbiddenWords)
  );
  const [sentenceStructure, setSentenceStructure] = useState<
    "short_punchy" | "descriptive" | "technical"
  >(initialData?.voice?.sentenceStructure ?? "short_punchy");
  const [industry, setIndustry] = useState<
    "health" | "finance" | "general" | "alcohol"
  >(initialData?.compliance?.industry ?? "general");
  const [disclaimers, setDisclaimers] = useState(
    toListString(initialData?.compliance?.requiredDisclaimers)
  );

  function buildPayload(): BrandDnaPayload {
    return {
      name: name.trim(),
      colors: {
        primary: parseListString(primary),
        secondary: parseListString(secondary),
        forbidden: parseListString(forbidden),
      },
      typography: {
        headingFont: headingFont.trim(),
        bodyFont: bodyFont.trim(),
        minSizePx: Number(minSizePx) || 16,
      },
      logo: {
        variants: initialData?.logo?.variants ?? [],
        placementRules,
        minSizePercent: Number(minSizePercent) || 10,
      },
      voice: {
        adjectives: parseListString(adjectives),
        forbiddenWords: parseListString(forbiddenWords),
        sentenceStructure,
      },
      compliance: {
        requiredDisclaimers: parseListString(disclaimers),
        industry,
        regionalRules: initialData?.compliance?.regionalRules ?? {},
      },
    };
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);

    try {
      const payload = buildPayload();
      if (isEdit && brandDnaId) {
        await axios.patch(`/api/v1/brand-dna/${brandDnaId}`, payload);
        toast.success("Brand profile updated");
      } else {
        await axios.post("/api/v1/brand-dna", payload);
        toast.success("Brand profile created");
      }
      router.push("/dashboard/brand-dna");
      router.refresh();
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.data?.error) {
        toast.error(error.response.data.error);
      } else {
        toast.error(isEdit ? "Failed to update brand profile" : "Failed to create brand profile");
      }
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      {/* Name */}
      <section className="rounded-xl border p-6 space-y-4">
        <h2 className="text-lg font-semibold">Basics</h2>
        <div className="space-y-2">
          <FieldLabel htmlFor="name">Brand name</FieldLabel>
          <input
            id="name"
            type="text"
            required
            maxLength={255}
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={inputClass}
            placeholder="e.g. Acme Organic Skincare"
          />
        </div>
      </section>
{/* Visual Identity */}
      <section className="rounded-xl border p-6 space-y-5">
        <h2 className="text-lg font-semibold">Visual Identity</h2>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="primary">Primary colors</FieldLabel>
            <input
              id="primary"
              type="text"
              value={primary}
              onChange={(e) => setPrimary(e.target.value)}
              className={inputClass}
              placeholder="e.g. #0B3C2D, #D4A24E"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated hex or color names used across creative.
            </p>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="secondary">Secondary colors</FieldLabel>
            <input
              id="secondary"
              type="text"
              value={secondary}
              onChange={(e) => setSecondary(e.target.value)}
              className={inputClass}
              placeholder="e.g. #E3DAC9, #F5F1E6"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FieldLabel htmlFor="forbidden">Forbidden colors</FieldLabel>
            <input
              id="forbidden"
              type="text"
              value={forbidden}
              onChange={(e) => setForbidden(e.target.value)}
              className={inputClass}
              placeholder="e.g. #FF0000 (never use red)"
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="headingFont">Heading font</FieldLabel>
            <input
              id="headingFont"
              type="text"
              value={headingFont}
              onChange={(e) => setHeadingFont(e.target.value)}
              className={inputClass}
              placeholder="e.g. Bebas Neue"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="bodyFont">Body font</FieldLabel>
            <input
              id="bodyFont"
              type="text"
              value={bodyFont}
              onChange={(e) => setBodyFont(e.target.value)}
              className={inputClass}
              placeholder="e.g. Inter"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="minSizePx">Minimum body size (px)</FieldLabel>
            <input
              id="minSizePx"
              type="number"
              min={8}
              max={64}
              value={minSizePx}
              onChange={(e) => setMinSizePx(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="placement">Logo placement</FieldLabel>
            <select
              id="placement"
              value={placementRules}
              onChange={(e) =>
                setPlacementRules(e.target.value as "top_left" | "bottom_right" | "custom")
              }
              className={inputClass}
            >
              <option value="top_left">Top left</option>
              <option value="bottom_right">Bottom right</option>
              <option value="custom">Custom</option>
            </select>
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="minSizePercent">Min logo size (% of frame)</FieldLabel>
            <input
              id="minSizePercent"
              type="number"
              min={1}
              max={100}
              value={minSizePercent}
              onChange={(e) => setMinSizePercent(Number(e.target.value))}
              className={inputClass}
            />
          </div>
        </div>
      </section>
{/* Voice */}
      <section className="rounded-xl border p-6 space-y-5">
        <h2 className="text-lg font-semibold">Brand Voice</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="adjectives">Voice adjectives</FieldLabel>
            <input
              id="adjectives"
              type="text"
              value={adjectives}
              onChange={(e) => setAdjectives(e.target.value)}
              className={inputClass}
              placeholder="e.g. energetic, trustworthy, modern"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="forbiddenWords">Forbidden words</FieldLabel>
            <input
              id="forbiddenWords"
              type="text"
              value={forbiddenWords}
              onChange={(e) => setForbiddenWords(e.target.value)}
              className={inputClass}
              placeholder="e.g. cheap, gimmicky"
            />
          </div>
          <div className="space-y-2">
            <FieldLabel htmlFor="sentenceStructure">Sentence structure</FieldLabel>
            <select
              id="sentenceStructure"
              value={sentenceStructure}
              onChange={(e) =>
                setSentenceStructure(
                  e.target.value as "short_punchy" | "descriptive" | "technical"
                )
              }
              className={inputClass}
            >
              <option value="short_punchy">Short & punchy</option>
              <option value="descriptive">Descriptive</option>
              <option value="technical">Technical</option>
            </select>
          </div>
        </div>
      </section>

      {/* Compliance */}
      <section className="rounded-xl border p-6 space-y-5">
        <h2 className="text-lg font-semibold">Compliance</h2>
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="space-y-2">
            <FieldLabel htmlFor="industry">Industry</FieldLabel>
            <select
              id="industry"
              value={industry}
              onChange={(e) =>
                setIndustry(
                  e.target.value as "health" | "finance" | "general" | "alcohol"
                )
              }
              className={inputClass}
            >
              <option value="general">General</option>
              <option value="health">Health</option>
              <option value="finance">Finance</option>
              <option value="alcohol">Alcohol</option>
            </select>
          </div>
          <div className="space-y-2 sm:col-span-2">
            <FieldLabel htmlFor="disclaimers">Required disclaimers</FieldLabel>
            <input
              id="disclaimers"
              type="text"
              value={disclaimers}
              onChange={(e) => setDisclaimers(e.target.value)}
              className={inputClass}
              placeholder="e.g. Results may vary, Terms apply"
            />
            <p className="text-xs text-muted-foreground">
              Comma-separated disclaimers that must appear in compliant creative.
            </p>
          </div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={isSaving}
          className="inline-flex items-center gap-2 rounded-lg bg-vortex-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-vortex-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isSaving ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : isEdit ? (
            <Save className="h-4 w-4" />
          ) : (
            <Plus className="h-4 w-4" />
          )}
          {isSaving
            ? "Saving..."
            : isEdit
              ? "Save changes"
              : "Create brand profile"}
        </button>
        <Link
          href="/dashboard/brand-dna"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}