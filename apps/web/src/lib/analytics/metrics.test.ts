import { describe, expect, it } from "vitest";
import {
  aggregateMetrics,
  buildAnalyticsSummary,
  predict,
  type AnalyticsSeriesPoint,
} from "./metrics";
import type { PerformanceMetrics, PerformancePrediction } from "@/types";

describe("aggregateMetrics", () => {
  it("sums raw event rows and derives rates", () => {
    const result = aggregateMetrics([
      {
        impressions: 1000,
        clicks: 50,
        conversions: 5,
        cost: 200,
        revenue: 800,
      },
      { impressions: 500, clicks: 25, conversions: 2, cost: 100, revenue: 300 },
    ]);

    expect(result.impressions).toBe(1500);
    expect(result.clicks).toBe(75);
    expect(result.conversions).toBe(7);
    expect(result.spend).toBe(300);
    expect(result.ctr).toBeCloseTo(75 / 1500);
    expect(result.conversionRate).toBeCloseTo(7 / 75);
    expect(result.roas).toBeCloseTo(1100 / 300);
    expect(result.costPerConversion).toBeCloseTo(300 / 7);
  });

  it("never produces NaN for empty or partial input", () => {
    const empty = aggregateMetrics([]);
    expect(empty.ctr).toBe(0);
    expect(empty.conversionRate).toBe(0);
    expect(empty.roas).toBe(0);
    expect(empty.costPerConversion).toBe(0);

    const partial = aggregateMetrics([{ clicks: 10 }]);
    expect(partial.impressions).toBe(0);
    expect(partial.ctr).toBe(0);
    expect(partial.conversionRate).toBe(0);
  });
});

describe("predict", () => {
  const metrics = (ctr: number): PerformanceMetrics => ({
    impressions: 10000,
    clicks: Math.round(10000 * ctr),
    conversions: 10,
    spend: 100,
    roas: 1,
    ctr,
    conversionRate: 0.01,
    costPerConversion: 10,
  });

  const seriesFor = (ctr: number): AnalyticsSeriesPoint[] => [
    {
      date: "2025-01-01",
      impressions: 10000,
      clicks: Math.round(10000 * ctr),
      conversions: 10,
    },
  ];

  it.each([
    ["poor", 0.005],
    ["fair", 0.02],
    ["good", 0.05],
    ["excellent", 0.08],
  ] as const)("classifies the %s tier at ctr %.3f", (tier, ctr) => {
    const prediction = predict(metrics(ctr), seriesFor(ctr));
    expect(prediction.tier).toBe(tier);
    expect(prediction.suggestions.length).toBeGreaterThan(0);
    expect(typeof prediction.predictedCtr).toBe("number");
    expect(typeof prediction.confidence).toBe("number");
  });

  it("scales confidence with impression volume", () => {
    const low = predict(metrics(0.05), seriesFor(0.05));
    // volume 10000 => confidence saturates at 100%, but floors at 10.
    expect(low.confidence).toBe(100);

    const tiny = predict(
      {
        impressions: 10,
        clicks: 1,
        conversions: 0,
        spend: 0,
        roas: 0,
        ctr: 0.1,
        conversionRate: 0,
        costPerConversion: 0,
      },
      [{ date: "2025-01-01", impressions: 10, clicks: 1, conversions: 0 }],
    );
    expect(tiny.confidence).toBe(10);
  });
});

describe("buildAnalyticsSummary", () => {
  it("aggregates metrics, defaults to a 7-day series, and predicts", () => {
    const summary = buildAnalyticsSummary({
      metrics: [{ impressions: 1000, clicks: 50, conversions: 5, cost: 200 }],
      series: [],
    });

    expect(summary.timeframe).toBe("All time");
    expect(summary.metrics.impressions).toBe(1000);
    expect(summary.series).toHaveLength(7);
    expect(summary.prediction).toEqual(
      expect.objectContaining({
        predictedCtr: expect.any(Number),
        confidence: expect.any(Number),
        tier: expect.any(String),
      }),
    );
    expect(
      Array.from(new Set(summary.prediction.suggestions)).length,
    ).toBeGreaterThan(0);
  });

  it("honors a custom timeframe and passes the provided series through", () => {
    const series: AnalyticsSeriesPoint[] = [
      { date: "2025-01-01", impressions: 100, clicks: 10, conversions: 1 },
    ];
    const summary = buildAnalyticsSummary({
      metrics: [{ impressions: 100, clicks: 10, conversions: 1, cost: 5 }],
      series,
      timeframe: "Last 7 days",
    });

    expect(summary.timeframe).toBe("Last 7 days");
    expect(summary.series).toBe(series);
    expect(summary.series.length).toBe(1);
  });

  it("produces an AnalyticsSummary matching the documented contract", () => {
    const summary = buildAnalyticsSummary({ metrics: [], series: [] });
    expect(Object.keys(summary).sort()).toEqual([
      "metrics",
      "prediction",
      "series",
      "timeframe",
    ]);
  });
});
