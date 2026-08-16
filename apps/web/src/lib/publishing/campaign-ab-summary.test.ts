import { describe, expect, it } from "vitest";
import {
  summarizeCampaign,
  summarizeCampaigns,
  type CampaignRow,
} from "./campaign-ab-summary";

function variant(id: string, name: string, metrics: Record<string, number>, isWinner = false) {
  return { id, variantName: name, isWinner, performanceMetrics: metrics };
}

const campaign: CampaignRow = {
  id: "camp-1",
  name: "Summer launch",
  platform: "youtube",
  platformCampaignId: "yt-123",
  createdAt: new Date("2026-08-01T10:00:00Z"),
  variants: [
    variant("var-a", "Hero A", {
      impressions: 1000,
      clicks: 100,
      conversions: 10,
      cost: 50,
      revenue: 200,
    }),
    variant("var-b", "Hero B", {
      impressions: 200,
      clicks: 5,
      conversions: 1,
      cost: 50,
      revenue: 100,
    }),
  ],
};

describe("summarizeCampaign", () => {
  it("ranks variants best → worst and declares the CTR leader as winner", () => {
    const summary = summarizeCampaign(campaign);

    expect(summary.campaignId).toBe("camp-1");
    expect(summary.name).toBe("Summer launch");
    expect(summary.platform).toBe("youtube");
    expect(summary.metric).toBe("ctr");

    expect(summary.variants[0].variantId).toBe("var-a");
    expect(summary.variants[0].ctr).toBeCloseTo(0.1);
    expect(summary.variants[1].variantId).toBe("var-b");

    expect(summary.winnerId).toBe("var-a");
    expect(summary.recommendation.toLowerCase()).toContain("promote");
  });

  it("tags each variant with its persisted isWinner flag", () => {
    const summary = summarizeCampaign({
      ...campaign,
      variants: [
        ...campaign.variants,
        variant("var-c", "Hero C", {
          impressions: 50,
          clicks: 2,
          conversions: 0,
          cost: 10,
          revenue: 0,
        }, true),
      ],
    });
    const winner = summary.variants.find((v) => v.isWinner);
    expect(winner?.variantId).toBe("var-c");
  });

  it("handles an empty variant set (no leader / no winner)", () => {
    const summary = summarizeCampaign({ ...campaign, variants: [] });
    expect(summary.variants).toEqual([]);
    expect(summary.winnerId).toBeNull();
    expect(summary.hasWinner).toBe(false);
  });

  it("defaults missing display fields", () => {
    const summary = summarizeCampaign({
      id: "camp-2",
      variants: [],
    });
    expect(summary.name).toBe("Untitled campaign");
    expect(summary.platform).toBeNull();
    expect(summary.createdAt).toBeNull();
  });
});

describe("summarizeCampaigns", () => {
  it("maps every campaign through the summary helper", () => {
    const summaries = summarizeCampaigns([campaign, { id: "camp-2", variants: [] }]);
    expect(summaries).toHaveLength(2);
    expect(summaries[0].campaignId).toBe("camp-1");
    expect(summaries[1].campaignId).toBe("camp-2");
  });
});