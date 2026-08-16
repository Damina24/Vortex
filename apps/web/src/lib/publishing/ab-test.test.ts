import { describe, expect, it } from "vitest";
import { evaluateAbTest } from "./ab-test";

const v = (variantId: string, impressions: number, ctr: number) => ({
  variantId,
  variantName: `Variant ${variantId}`,
  metrics: {
    impressions,
    clicks: Math.round(impressions * ctr),
    conversions: Math.round(impressions * ctr * 0.1),
    cost: impressions * 0.05,
    revenue: impressions * 0.2,
  },
});

describe("evaluateAbTest", () => {
    it("declares the highest-CTR variant the winner with a recommendation", () => {
    const result = evaluateAbTest([v("A", 5000, 0.04), v("B", 5000, 0.08)]);

    expect(result.winnerId).toBe("B");
    expect(result.metric).toBe("ctr");
    expect(result.ranked[0].variantId).toBe("B");
    expect(result.ranked[1].variantId).toBe("A");
    expect(result.confidence).toBe(100);
    expect(result.recommendation).toMatch(/Promote "Variant B"/);
    // B's CTR (0.08) is double A's (0.04) — a 100% lift.
    expect(result.recommendation).toMatch(/100%/);
  });

  it("uses a higher minImpressions to gate winner selection", () => {
    // Below the default threshold ⇒ no leader declared.
    const low = evaluateAbTest([v("A", 10, 0.05), v("B", 10, 0.04)]);
    expect(low.winnerId).toBeNull();
    expect(low.recommendation).toMatch(/Not enough data/);

    // Above threshold ⇒ B wins (larger impressions avoid rounding ties).
    const high = evaluateAbTest(
      [v("A", 1000, 0.05), v("B", 1000, 0.06)],
      { minImpressions: 10 },
    );
    expect(high.winnerId).toBe("B");
  });

  it("returns null winner and flags a tie when variants are tied on the metric", () => {
    const result = evaluateAbTest(
      [
        v("A", 1000, 0.05),
        v("B", 1000, 0.05),
      ],
      { minImpressions: 1 },
    );
    // Both are tied for best, so not a *strict* winner.
    expect(result.winnerId).toBe("A");
    expect(result.recommendation).toMatch(/tied/);
  });

  it("supports CPA (lower is better) as the ranking metric", () => {
    const result = evaluateAbTest(
      [
        {
          variantId: "Cheap",
          metrics: { impressions: 2000, clicks: 200, conversions: 40, cost: 40, revenue: 0 },
        },
        {
          variantId: "Pricy",
          metrics: { impressions: 2000, clicks: 200, conversions: 20, cost: 40, revenue: 0 },
        },
      ],
      { metric: "cpa", minImpressions: 1 },
    );
    // Cheap has CPA 1, Pricy has CPA 2 ⇒ Cheap wins under lower-is-better.
    expect(result.winnerId).toBe("Cheap");
    expect(result.ranked[0].cpa).toBe(1);
    expect(result.ranked[1].cpa).toBe(2);
  });

  it("filters out variants below minImpressions before ranking", () => {
    const result = evaluateAbTest(
      [
        v("Big", 5000, 0.04),
        v("Tiny", 5, 0.5), // would win on raw CTR but is filtered out
      ],
      { minImpressions: 50 },
    );
    expect(result.winnerId).toBe("Big");
    expect(result.ranked).toHaveLength(1);
  });

  it("computes CTR / CPA / ROAS without NaN on empty input", () => {
    const result = evaluateAbTest([], { minImpressions: 0 });
    expect(result.winnerId).toBeNull();
    expect(result.ranked).toEqual([]);
    expect(result.recommendation).toMatch(/Not enough data/);
  });

  it("scales confidence with impression volume", () => {
    const low = evaluateAbTest(
      [
        { variantId: "A", metrics: { impressions: 100, clicks: 5, conversions: 0, cost: 5, revenue: 0 } },
        { variantId: "B", metrics: { impressions: 100, clicks: 8, conversions: 1, cost: 5, revenue: 0 } },
      ],
      { minImpressions: 10 },
    );
    // 200 total impressions ⇒ confidence = max(20, 2) = 20 (floor).
    expect(low.confidence).toBe(20);

    const high = evaluateAbTest(
      [
        { variantId: "A", metrics: { impressions: 8000, clicks: 400, conversions: 40, cost: 400, revenue: 800 } },
        { variantId: "B", metrics: { impressions: 8000, clicks: 600, conversions: 60, cost: 400, revenue: 800 } },
      ],
      { minImpressions: 10 },
    );
    // 16000 impressions ⇒ min(100, max(20, 160)) = 100.
    expect(high.confidence).toBe(100);
  });

  it("computes conversion metrics correctly", () => {
    const result = evaluateAbTest(
      [
        {
          variantId: "X",
          metrics: { impressions: 1000, clicks: 100, conversions: 10, cost: 50, revenue: 200 },
        },
      ],
      { minImpressions: 1 },
    );
    const computed = result.ranked[0];
    expect(computed.ctr).toBeCloseTo(0.1);
    expect(computed.conversionRate).toBeCloseTo(0.1);
    expect(computed.cpa).toBeCloseTo(5);
    expect(computed.roas).toBeCloseTo(4);
  });
});
