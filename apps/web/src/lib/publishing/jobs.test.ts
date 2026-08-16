import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PublishAssetNotFoundError, PublishProjectNotFoundError, addCampaignVariant, markCampaignWinner, publishAssetToPlatform } from "./jobs";
import type { PublishedResult } from "./providers";

interface UpdateArgs {
  where: { id: string };
  data: Record<string, unknown>;
}

/** In-memory fake of `@/lib/db/prisma` for the publishing persistence layer. */
const db = vi.hoisted(() => {
  const seedProject = {
    id: "project-1",
    name: "Acme",
    teamId: "team-1",
    createdBy: "user-1",
  };
  const seedAsset = {
    id: "asset-1",
    projectId: "project-1",
    teamId: "team-1",
    name: "final-render.mp4",
    type: "video",
    mimeType: "video/mp4",
    sizeBytes: 2048,
    url: "https://cdn.vortex/final-render.mp4",
    metadata: { provider: "mock" },
  };

  return {
    project: {
      findFirst: vi.fn(async (): Promise<typeof seedProject | null> => seedProject),
    },
    asset: {
      findFirst: vi.fn(async (): Promise<typeof seedAsset | null> => seedAsset),
      update: vi.fn(async ({ where, data }: UpdateArgs) => ({
        id: where.id,
        ...data,
      })),
    },
        campaign: {
      create: vi.fn(
        async ({ data, include }: { data: Record<string, unknown>; include: unknown }) => ({
          id: "campaign-1",
          ...data,
          variants: include ? [{ id: "variant-1" }] : [],
        }),
      ),
            findFirst: vi.fn(async (): Promise<{ id: string; projectId: string } | null> => ({ id: "campaign-1", projectId: "project-1" })),
    },
    campaignVariant: {
      findFirst: vi.fn(async (): Promise<unknown | null> => null),
      create: vi.fn(
        async ({ data }: { data: Record<string, unknown> }) => ({
          id: "variant-2",
          ...data,
          weight: 0.5,
          createdAt: new Date(),
        }),
      ),
      aggregate: vi.fn(async () => ({ _sum: { weight: 1 } })),
      findMany: vi.fn(async () => [
        {
          id: "variant-1",
          variantName: "Variant A",
          weight: 1,
          isWinner: true,
          performanceMetrics: { impressions: 1000, clicks: 50, conversions: 5, cost: 10, revenue: 0 },
        },
        {
          id: "variant-2",
          variantName: "Variant B",
          weight: 1,
          isWinner: false,
          performanceMetrics: { impressions: 1000, clicks: 80, conversions: 8, cost: 10, revenue: 0 },
        },
      ]),
      update: vi.fn(async ({ where, data }: UpdateArgs) => ({ id: where.id, ...data })),
      updateMany: vi.fn(async () => ({ count: 1 })),
    },
    $transaction: vi.fn(async (queries: unknown[]) => queries.map((_, i) => ({ count: 1, id: `id-${i}` }))),
  };
});

vi.mock("@/lib/db/prisma", () => ({
  default: db,
  prisma: db,
}));

const FIXED_DATE = new Date("2026-08-15T12:00:00.000Z");

const input = {
  userId: "user-1",
  projectId: "project-1",
  assetId: "asset-1",
  platform: "youtube" as const,
  title: "Q3 Launch Teaser",
  description: "A conversion-focused teaser.",
  tags: ["launch"],
  visibility: "unlisted" as const,
  publishedAt: FIXED_DATE,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe("publishAssetToPlatform", () => {
  const stubbedResult: PublishedResult = {
    provider: "mock",
    platform: "youtube",
    platformId: "VID12345ABCD",
    url: "https://www.youtube.com/watch?v=VID12345ABCD",
    publishedAt: FIXED_DATE,
    metadata: { mock: true },
  };

  const stubProvider = {
    name: "mock",
    publish: vi.fn(async () => stubbedResult),
  };

  it("publishes via the provider and persists a campaign + variant", async () => {
    const { campaign, result } = await publishAssetToPlatform({
      ...input,
      provider: stubProvider,
    });

    expect(db.project.findFirst).toHaveBeenCalledWith({
      where: { id: "project-1", createdBy: "user-1" },
    });
    expect(db.asset.findFirst).toHaveBeenCalledWith({
      where: { id: "asset-1", projectId: "project-1", teamId: "team-1" },
    });
    expect(stubProvider.publish).toHaveBeenCalledTimes(1);

    expect(db.campaign.create).toHaveBeenCalledTimes(1);
    const createArg = db.campaign.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data.projectId).toBe("project-1");
    expect(createArg.data.name).toBe(input.title);
    expect(createArg.data.status).toBe("active");
    expect(createArg.data.platformCampaignId).toBe("VID12345ABCD");

    expect(db.asset.update).toHaveBeenCalledTimes(1);
    const updateArg = db.asset.update.mock.calls[0][0] as UpdateArgs;
    const metadata = updateArg.data.metadata as Record<string, unknown>;
    expect(metadata.published).toEqual({
      platform: "youtube",
      platformId: "VID12345ABCD",
      url: "https://www.youtube.com/watch?v=VID12345ABCD",
      provider: "mock",
      publishedAt: FIXED_DATE,
    });

    expect(campaign).toBeDefined();
    expect(result).toBe(stubbedResult);
  });

  it("throws PublishProjectNotFoundError when the project is missing", async () => {
    db.project.findFirst.mockResolvedValueOnce(null);
    await expect(publishAssetToPlatform({ ...input, provider: stubProvider })).rejects.toBeInstanceOf(
      PublishProjectNotFoundError,
    );
    expect(db.campaign.create).not.toHaveBeenCalled();
  });

  it("throws PublishAssetNotFoundError when the asset is missing", async () => {
    db.asset.findFirst.mockResolvedValueOnce(null);
    await expect(publishAssetToPlatform({ ...input, provider: stubProvider })).rejects.toBeInstanceOf(
      PublishAssetNotFoundError,
    );
    expect(db.campaign.create).not.toHaveBeenCalled();
  });

  it("does not persist a campaign when the provider fails", async () => {
    stubProvider.publish.mockRejectedValueOnce(new Error("Upload exploded"));
    await expect(
      publishAssetToPlatform({ ...input, provider: stubProvider }),
    ).rejects.toThrow("Upload exploded");
    expect(db.campaign.create).not.toHaveBeenCalled();
  });

  it("respects an explicit provider name via the registry", async () => {
    const { campaign } = await publishAssetToPlatform({
      ...input,
      provider: "mock",
      publishedAt: FIXED_DATE,
    });
    expect(campaign).toBeDefined();
    expect(db.campaign.create).toHaveBeenCalledTimes(1);
  });
});


describe("addCampaignVariant", () => {
  it("creates a new non-winning variant for the caller's campaign", async () => {
    const variant = await addCampaignVariant({
      userId: "user-1",
      campaignId: "campaign-1",
      assetId: "asset-1",
      variantName: "Close-up cut",
    });

    expect(db.campaign.findFirst).toHaveBeenCalledWith({
      where: { id: "campaign-1", project: { createdBy: "user-1" } },
      select: { id: true, projectId: true },
    });
    expect(db.campaignVariant.findFirst).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1", assetId: "asset-1" },
    });
    expect(db.campaignVariant.create).toHaveBeenCalledTimes(1);
    const createArg = db.campaignVariant.create.mock.calls[0][0] as {
      data: Record<string, unknown>;
    };
    expect(createArg.data.campaignId).toBe("campaign-1");
    expect(createArg.data.assetId).toBe("asset-1");
    expect(createArg.data.variantName).toBe("Close-up cut");
    expect(createArg.data.isWinner).toBe(false);

    // weight is converted to a number from the aggregate decimal.
    expect(variant.weight).toBe(0.5);
    expect(variant.id).toBe("variant-2");
  });

  it("throws PublishProjectNotFoundError when the campaign is not owned", async () => {
    db.campaign.findFirst.mockResolvedValueOnce(null);
    await expect(
      addCampaignVariant({
        userId: "user-1",
        campaignId: "campaign-1",
        assetId: "asset-1",
        variantName: "X",
      }),
    ).rejects.toBeInstanceOf(PublishProjectNotFoundError);
    expect(db.campaignVariant.create).not.toHaveBeenCalled();
  });

  it("throws PublishAssetNotFoundError when the asset is missing", async () => {
    db.asset.findFirst.mockResolvedValueOnce(null);
    await expect(
      addCampaignVariant({
        userId: "user-1",
        campaignId: "campaign-1",
        assetId: "asset-1",
        variantName: "X",
      }),
    ).rejects.toBeInstanceOf(PublishAssetNotFoundError);
    expect(db.campaignVariant.create).not.toHaveBeenCalled();
  });

  it("throws when the asset is already a variant", async () => {
    db.campaignVariant.findFirst.mockResolvedValueOnce({ id: "variant-1" });
    await expect(
      addCampaignVariant({
        userId: "user-1",
        campaignId: "campaign-1",
        assetId: "asset-1",
        variantName: "X",
      }),
    ).rejects.toThrow("already a variant");
  });
});

describe("markCampaignWinner", () => {
  // Default: the requested variant exists.
  beforeEach(() => {
    db.campaignVariant.findFirst.mockResolvedValue({
      id: "variant-2",
      campaignId: "campaign-1",
      assetId: "asset-1",
      variantName: "Variant B",
      performanceMetrics: { impressions: 0, clicks: 0, conversions: 0, cost: 0, revenue: 0 },
    });
  });

  it("marks the chosen variant winner and clears any prior winner", async () => {
    // findMany defaults: variant-1 (50 clicks) vs variant-2 (80 clicks) on 1000
    // impressions each → variant-2 is the statistical leader (higher CTR).
    const result = await markCampaignWinner({
      userId: "user-1",
      campaignId: "campaign-1",
      variantId: "variant-2",
    });

    expect(db.campaignVariant.updateMany).toHaveBeenCalledWith({
      where: { campaignId: "campaign-1", isWinner: true },
      data: { isWinner: false },
    });
    expect(db.campaignVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "variant-2" },
        data: expect.objectContaining({ isWinner: true }),
      }),
    );

    expect(result.variantId).toBe("variant-2");
    // variant-2 leads on CTR → it's the statistical winner, so no override flag.
    expect(result.winnerMetrics?.variantId).toBe("variant-2");
    expect(result.winnerMetrics?.ctr).toBeCloseTo(0.08);
    expect(result.confidence).toBe(20);
  });

  it("allows overriding the statistical leader and records the override", async () => {
    // Ask to mark variant-1 winner even though variant-2 leads statistically.
    const result = await markCampaignWinner({
      userId: "user-1",
      campaignId: "campaign-1",
      variantId: "variant-1",
    });

    expect(db.campaignVariant.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "variant-1" },
        data: expect.objectContaining({
          isWinner: true,
          performanceMetrics: expect.objectContaining({
            overrodeStatisticalLeader: "variant-2",
          }),
        }),
      }),
    );
    expect(result.variantId).toBe("variant-1");
  });

  it("throws PublishProjectNotFoundError when the campaign is not owned", async () => {
    db.campaign.findFirst.mockResolvedValueOnce(null);
    await expect(
      markCampaignWinner({
        userId: "user-1",
        campaignId: "campaign-1",
        variantId: "variant-1",
      }),
    ).rejects.toBeInstanceOf(PublishProjectNotFoundError);
  });

  it("throws PublishAssetNotFoundError when the variant is missing", async () => {
    db.campaignVariant.findFirst.mockResolvedValueOnce(null);
    await expect(
      markCampaignWinner({
        userId: "user-1",
        campaignId: "campaign-1",
        variantId: "variant-1",
      }),
    ).rejects.toBeInstanceOf(PublishAssetNotFoundError);
  });
});

