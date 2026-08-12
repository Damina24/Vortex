import type { PerformanceMetrics, PerformancePrediction } from "@/types";

/** Raw numeric metrics carried inside `analytics_events.metadata`. */
export interface RawEventMetrics {
  impressions?: number;
  clicks?: number;
  conversions?: number;
  cost?: number;
  revenue?: number;
}

/** A single day in the returned time series. */
export interface AnalyticsSeriesPoint {
  date: string; // ISO date (YYYY-MM-DD)
  impressions: number;
  clicks: number;
  conversions: number;
}

/** Client-facing analytics payload returned by `GET /api/v1/analytics`. */
export interface AnalyticsSummary {
  timeframe: string;
  metrics: PerformanceMetrics;
  prediction: PerformancePrediction;
  series: AnalyticsSeriesPoint[];
}

interface SummedMetrics {
  impressions: number;
  clicks: number;
  conversions: number;
  cost: number;
  revenue: number;
}

const ZERO: SummedMetrics = {
  impressions: 0,
  clicks: 0,
  conversions: 0,
  cost: 0,
  revenue: 0,
};

/**
 * Aggregates raw event-metric rows into the canonical `PerformanceMetrics`
 * shape, guarding every division so empty or partial data never yields `NaN`.
 */
export function aggregateMetrics(
  metrics: RawEventMetrics[],
): PerformanceMetrics {
  const sums = metrics.reduce<SummedMetrics>(
    (acc, r) => {
      acc.impressions += r.impressions ?? 0;
      acc.clicks += r.clicks ?? 0;
      acc.conversions += r.conversions ?? 0;
      acc.cost += r.cost ?? 0;
      acc.revenue += r.revenue ?? 0;
      return acc;
    },
    { ...ZERO },
  );

  const ctr = sums.impressions ? sums.clicks / sums.impressions : 0;
  const conversionRate = sums.clicks ? sums.conversions / sums.clicks : 0;
  const roas = sums.cost ? sums.revenue / sums.cost : 0;
  const costPerConversion = sums.conversions ? sums.cost / sums.conversions : 0;

  return {
    impressions: sums.impressions,
    clicks: sums.clicks,
    ctr,
    conversions: sums.conversions,
    conversionRate,
    roas,
    costPerConversion,
    spend: sums.cost,
  };
}

const TIER_SUGGESTIONS: Record<
  "poor" | "fair" | "good" | "excellent",
  string[]
> = {
  poor: [
    "Refresh creative assets",
    "Broaden audience targeting",
    "Review placements",
  ],
  fair: [
    "Optimize call-to-action",
    "Tighten audience targeting",
    "A/B test creatives",
  ],
  good: [
    "Scale winning creatives",
    "Expand to new audiences",
    "Raise bids on top performers",
  ],
  excellent: [
    "Scale budget",
    "Expand to new platforms",
    "Replicate the winning formula",
  ],
};

/**
 * Predicts near-term CTR from the trailing 3-day series, classifies a
 * performance tier, and returns actionable suggestions. Pure & deterministic
 * given the same inputs.
 */
export function predict(
  metrics: PerformanceMetrics,
  series: AnalyticsSeriesPoint[],
): PerformancePrediction {
  const recent = series.slice(-3);
  const recentClicks = recent.reduce((a, p) => a + p.clicks, 0);
  const recentImpressions = recent.reduce((a, p) => a + p.impressions, 0);
  const predictedCtr = recentImpressions
    ? recentClicks / recentImpressions
    : metrics.ctr;

  const volume = metrics.impressions;
  // Confidence grows with impression volume; floor at 10%.
  const confidence = Math.min(1, Math.max(0.1, volume / 5000));
  const rounded = Number((predictedCtr * 1000).toFixed(0)) / 1000;

  let tier: PerformancePrediction["tier"];
  if (rounded < 0.01) tier = "poor";
  else if (rounded < 0.03) tier = "fair";
  else if (rounded < 0.07) tier = "good";
  else tier = "excellent";

  return {
    predictedCtr: rounded,
    confidence: Number((confidence * 100).toFixed(0)),
    tier,
    suggestions: TIER_SUGGESTIONS[tier],
  };
}

const EMPTY_SERIES: AnalyticsSeriesPoint[] = Array.from({ length: 7 }, () => ({
  date: "",
  impressions: 0,
  clicks: 0,
  conversions: 0,
}));

/**
 * Composes aggregate + predict + series handling into the summary shape the
 * dashboard consumes. Pure, so it is unit-tested directly; the API route only
 * shapes DB rows and delegates here.
 */
export function buildAnalyticsSummary(opts: {
  metrics: RawEventMetrics[];
  series: AnalyticsSeriesPoint[];
  timeframe?: string;
}): AnalyticsSummary {
  const computed = aggregateMetrics(opts.metrics);
  const seriesWithZero = opts.series.length ? opts.series : EMPTY_SERIES;
  return {
    timeframe: opts.timeframe ?? "All time",
    metrics: computed,
    prediction: predict(computed, seriesWithZero),
    series: seriesWithZero,
  };
}
