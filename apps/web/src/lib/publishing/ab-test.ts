import type { RawEventMetrics } from "@/lib/analytics/metrics";

/**
 * A/B testing core for publishing campaigns. Pure and deterministic given the
 * same inputs (mirrors the design of `lib/analytics/metrics.ts`): the API
 * routes and UI delegate to these helpers so they are unit-tested directly
 * rather than through a full HTTP round-trip.
 */

export type AbMetric = "ctr" | "conversionRate" | "roas" | "cpa";

export interface AbVariantInput {
  variantId: string;
  variantName?: string;
  /** Per-variant raw metrics (same shape stored in `analytics_events`). */
  metrics: RawEventMetrics;
}

export interface ComputedVariant {
  variantId: string;
  variantName: string;
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  revenue: number;
  ctr: number; // clicks / impressions (0 if none)
  conversionRate: number; // conversions / clicks (0 if none)
  cpa: number; // cost per acquisition (0 if no conversions)
  roas: number; // revenue / cost (0 if no spend)
}

export interface AbTestResult {
  /** Variants ranked from best → worst by the chosen metric. */
  ranked: ComputedVariant[];
  /** The variant id of the current leader, or `null` when undecided. */
  winnerId: string | null;
  winningValue: number;
  /** Confidence in the leader, 0–100 (scales with impression volume). */
  confidence: number;
  metric: AbMetric;
  recommendation: string;
}

export interface EvaluateAbTestOptions {
  /** Variants with fewer impressions are excluded from winner selection. */
  minImpressions?: number;
  /** Metric used to rank variants. CPA is "lower is better". */
  metric?: AbMetric;
  /** Floor for reported confidence (a low-volume leader is not decisive). */
  minConfidence?: number;
}

function safeDiv(num: number, den: number): number {
  return den > 0 ? num / den : 0;
}

function computeVariant(input: AbVariantInput): ComputedVariant {
  const m = input.metrics;
  const impressions = m.impressions ?? 0;
  const clicks = m.clicks ?? 0;
  const conversions = m.conversions ?? 0;
  const cost = m.cost ?? 0;
  const revenue = m.revenue ?? 0;

  return {
    variantId: input.variantId,
    variantName: input.variantName ?? input.variantId,
    impressions,
    clicks,
    conversions,
    cost,
    revenue,
    ctr: safeDiv(clicks, impressions),
    conversionRate: safeDiv(conversions, clicks),
    cpa: safeDiv(cost, conversions),
    roas: safeDiv(revenue, cost),
  };
}

/** Comparator for the "lower is better" metrics (e.g. CPA). */
const LOWER_BETTER: AbMetric[] = ["cpa"];

const METRIC_LABEL: Record<AbMetric, string> = {
  ctr: "CTR",
  conversionRate: "conversion rate",
  roas: "ROAS",
  cpa: "CPA",
};

/**
 * Evaluates a set of campaign variants and declares a winner by the chosen
 * metric. A winner is only declared when at least one variant clears
 * `minImpressions` (default 50) and the leader is strictly best; ties and
 * low-volume sets return `winnerId: null`.
 */
export function evaluateAbTest(
  variants: AbVariantInput[],
  opts: EvaluateAbTestOptions = {},
): AbTestResult {
  const minImpressions = opts.minImpressions ?? 50;
  const metric = opts.metric ?? "ctr";
  const minConfidence = opts.minConfidence ?? 20;

  const computed = variants.map(computeVariant);

  // Rank best → worst (lower-is-better metrics sort ascending).
  const ranked = computed
    .filter((v) => v.impressions >= minImpressions)
    .sort((a, b) => {
      const aValue = a[metric];
      const bValue = b[metric];
      if (LOWER_BETTER.includes(metric)) {
        return aValue - bValue;
      }
      return bValue - aValue;
    });

  const leader = ranked[0];
  // The leader is a strict winner when it is the unique variant with the
  // best metric value (i.e. not tied with another variant).
  const hasStrictLeader =
    leader !== undefined &&
    ranked.filter((v) => v[metric] === leader[metric]).length === 1;

  // Confidence scales with total impression volume, floored at minConfidence.
  const totalImpressions = computed.reduce((sum, v) => sum + v.impressions, 0);
  const confidence = Math.min(
    100,
    Math.max(minConfidence, (totalImpressions / 10000) * 100),
  );

  let winnerId: string | null = null;
  let winningValue = leader ? leader[metric] : 0;
  let recommendation: string;

  if (!leader) {
    recommendation = `Not enough data yet — collect at least ${minImpressions} impressions per variant before a winner can be chosen.`;
  } else if (!hasStrictLeader) {
    winnerId = leader.variantId;
    winningValue = leader[metric];
    recommendation = `"${leader.variantName}" leads on ${METRIC_LABEL[metric]}, but another variant is tied. Consider running longer to break the tie.`;
  } else {
    winnerId = leader.variantId;
    winningValue = leader[metric];
    const loser = ranked[1];
    if (loser) {
      const lift =
        LOWER_BETTER.includes(metric) && loser[metric] > 0
          ? (loser[metric] - leader[metric]) / loser[metric]
          : leader[metric] > 0
            ? (leader[metric] - loser[metric]) / loser[metric]
            : 0;
      const pct = Math.round(lift * 100);
      recommendation = `Promote "${leader.variantName}" — it beats "${loser.variantName}" by ${pct}% on ${METRIC_LABEL[metric]}. Reallocate budget to the winner.`;
    } else {
      recommendation = `Promote "${leader.variantName}" — it is the leading variant on ${METRIC_LABEL[metric]}.`;
    }
  }

  return {
    ranked,
    winnerId,
    winningValue,
    confidence: Number(confidence.toFixed(0)),
    metric,
    recommendation,
  };
}
