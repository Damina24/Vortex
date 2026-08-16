// VORTEX AI — Campaign A/B analytics (dashboard read model)
//
// Runs the same pure evaluator used by the publishing pages (`evaluateAbTest`)
// over the user's published campaigns and flattens it into a lightweight
// dashboard shape, tagging each variant with its persisted `isWinner` flag so
// the Analytics page can highlight the live leader. The evaluator is advisory
// only — a human may still override the statistical leader on the Publishing
// page — so these summaries surface `winnerId`/`recommendation` as context.

import { evaluateAbTest, type AbMetric, type ComputedVariant } from "./ab-test";
import type { RawEventMetrics } from "@/lib/analytics/metrics";

export interface CampaignVariantSummary extends ComputedVariant {
  /** Whether this variant was chosen as the winner on the Publishing page. */
  isWinner: boolean;
}

export interface CampaignAbSummary {
  campaignId: string;
  name: string;
  platform: string | null;
  platformCampaignId: string | null;
  createdAt: Date | null;
  /** Variants ranked best → worst by the chosen metric. */
  variants: CampaignVariantSummary[];
  metric: AbMetric;
  winnerId: string | null;
  hasWinner: boolean;
  confidence: number;
  recommendation: string;
}

export interface CampaignRow {
  id: string;
  name?: string | null;
  platform?: unknown;
  platformCampaignId?: unknown;
  createdAt?: Date | null;
  variants: Array<{
    id: string;
    variantName?: string | null;
    isWinner?: boolean;
    performanceMetrics?: unknown;
  }>;
}

/**
 * Summarizes a single published campaign for the dashboard A/B panel. The
 * evaluator is run with `minImpressions: 0` so even low-volume variants are
 * ranked and the live leader is always visible (advisory, not decisive).
 */
export function summarizeCampaign(row: CampaignRow): CampaignAbSummary {
  const inputs = row.variants.map((v) => ({
    variantId: v.id,
    variantName: v.variantName ?? v.id,
    metrics: (v.performanceMetrics as RawEventMetrics | null) ?? {},
  }));

  const evaluation = evaluateAbTest(inputs, { minImpressions: 0, minConfidence: 0 });

  const variants: CampaignVariantSummary[] = evaluation.ranked.map((computed) => ({
    ...computed,
    isWinner: Boolean(row.variants.find((v) => v.id === computed.variantId)?.isWinner),
  }));

  return {
    campaignId: row.id,
    name: row.name ?? "Untitled campaign",
    platform: typeof row.platform === "string" ? row.platform : null,
    platformCampaignId:
      typeof row.platformCampaignId === "string" ? row.platformCampaignId : null,
    createdAt: row.createdAt ?? null,
    variants,
    metric: evaluation.metric,
    winnerId: evaluation.winnerId,
    hasWinner: variants.some((v) => v.isWinner),
    confidence: evaluation.confidence,
    recommendation: evaluation.recommendation,
  };
}

/** Summarizes a list of published campaigns for the dashboard panel. */
export function summarizeCampaigns(rows: CampaignRow[]): CampaignAbSummary[] {
  return rows.map(summarizeCampaign);
}