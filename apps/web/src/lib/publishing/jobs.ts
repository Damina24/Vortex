import prisma from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import {
  getPublishingProvider,
  type PublishAsset,
  type PublishPlatform,
  type PublishVisibility,
  type PublishedResult,
  type PublishingProvider,
} from "./providers";
import { evaluateAbTest, type ComputedVariant } from "./ab-test";
import type { RawEventMetrics } from "@/lib/analytics/metrics";

/** Thrown when the project is missing or not owned by the caller. */
export class PublishProjectNotFoundError extends Error {
  constructor() {
    super("Project not found");
    this.name = "PublishProjectNotFoundError";
  }
}

/** Thrown when the asset is missing or not part of the project. */
export class PublishAssetNotFoundError extends Error {
  constructor() {
    super("Asset not found");
    this.name = "PublishAssetNotFoundError";
  }
}

/** Thrown when the same asset is added to a campaign twice. */
export class CampaignVariantDuplicateError extends Error {
  constructor() {
    super("Asset is already a variant of this campaign");
    this.name = "CampaignVariantDuplicateError";
  }
}

/**
 * Resolves the publishing provider. An explicit provider instance or name
 * wins; otherwise it falls back to the configured/default `PUBLISHING_PROVIDER`
 * (mock for local development), consistent with the generation providers.
 */
function resolveProvider(
  provider: string | PublishingProvider | undefined,
): PublishingProvider {
  if (typeof provider === "string") {
    return getPublishingProvider(provider);
  }
  if (provider) {
    return provider;
  }
  return getPublishingProvider();
}

/**
 * Publishes an asset to a platform and persists the result as a `Campaign`
 * with a single `CampaignVariant` (the published creative), recording the
 * platform id + shareable URL on the asset's metadata.
 *
 * Ownership is enforced up front: the project must be created by `userId` and
 * the asset must belong to that project's team.
 *
 * Throws `PublishProjectNotFoundError` / `PublishAssetNotFoundError` when the
 * referenced records are missing or not owned, or a provider error.
 */
export async function publishAssetToPlatform(input: {
  userId: string;
  projectId: string;
  assetId: string;
  platform: PublishPlatform;
  title: string;
  description: string;
  tags?: string[];
  visibility?: PublishVisibility;
  provider?: string | PublishingProvider;
  publishedAt?: Date;
}): Promise<{ campaign: unknown; result: PublishedResult }> {
  const { userId, projectId, assetId, platform } = input;

  const project = await prisma.project.findFirst({
    where: { id: projectId, createdBy: userId },
  });
  if (!project) {
    throw new PublishProjectNotFoundError();
  }

  const asset = await prisma.asset.findFirst({
    where: { id: assetId, projectId, teamId: project.teamId },
  });
  if (!asset) {
    throw new PublishAssetNotFoundError();
  }

  const provider = resolveProvider(input.provider);

  const assetForPublish: PublishAsset = {
    url: asset.url,
    mimeType: asset.mimeType,
    sizeBytes: asset.sizeBytes === null ? null : Number(asset.sizeBytes),
    filename: asset.name,
  };

  const result = await provider.publish({
    platform,
    asset: assetForPublish,
    title: input.title,
    description: input.description,
    tags: input.tags ?? [],
    visibility: input.visibility ?? "private",
  });

  // Persist the published campaign + its single (winning) variant.
  const campaign = await prisma.campaign.create({
    data: {
      projectId,
      name: input.title,
      platform,
      platformCampaignId: result.platformId,
      status: "active",
      startDate: input.publishedAt ?? result.publishedAt,
      targetingConfig: {} as Prisma.InputJsonValue,
      variants: {
        create: {
          assetId: asset.id,
          variantName: input.title,
          weight: 1,
          isWinner: true,
          performanceMetrics: {} as Prisma.InputJsonValue,
        },
      },
    },
    include: { variants: true },
  });

  // Record the published URL + platform id on the asset so it is easy to spot
  // published content without joining campaigns.
  const metadata =
    asset.metadata && typeof asset.metadata === "object"
      ? (asset.metadata as Record<string, unknown>)
      : {};
  await prisma.asset.update({
    where: { id: asset.id },
    data: {
      metadata: {
        ...metadata,
        published: {
          platform,
          platformId: result.platformId,
          url: result.url,
          provider: result.provider,
          publishedAt: input.publishedAt ?? result.publishedAt,
        },
      } as Prisma.InputJsonValue,
    },
  });

  return { campaign, result };
}

/**
 * Adds an additional creative asset as a new (non-winning) variant to an
 * existing published campaign, enabling A/B testing between creatives. The
 * campaign must be owned by `userId`.
 */
export async function addCampaignVariant(input: {
  userId: string;
  campaignId: string;
  assetId: string;
  variantName: string;
}): Promise<CampaignVariantResult> {
  const { userId, campaignId, assetId, variantName } = input;

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      project: { createdBy: userId },
    },
    select: { id: true, projectId: true },
  });
  if (!campaign) {
    throw new PublishProjectNotFoundError();
  }

  // The asset must exist and belong to the same project/team.
  const asset = await prisma.asset.findFirst({
    where: { id: assetId, projectId: campaign.projectId },
  });
  if (!asset) {
    throw new PublishAssetNotFoundError();
  }

  // Prevent duplicate variants of the same asset.
  const existing = await prisma.campaignVariant.findFirst({
    where: { campaignId, assetId },
  });
  if (existing) {
    throw new CampaignVariantDuplicateError();
  }

  const totalWeight = await prisma.campaignVariant.aggregate({
    where: { campaignId },
    _sum: { weight: true },
  });
  const equalWeight = totalWeight._sum.weight
    ? 1 / (Number(totalWeight._sum.weight) + 1)
    : 0.5;

  const variant = await prisma.campaignVariant.create({
    data: {
      campaignId,
      assetId,
      variantName,
      weight: equalWeight,
      isWinner: false,
      performanceMetrics: {} as Prisma.InputJsonValue,
    },
  });

  return {
    id: variant.id,
    campaignId: variant.campaignId,
    assetId: variant.assetId,
    variantName: variant.variantName,
    weight: Number(variant.weight),
    isWinner: variant.isWinner,
    performanceMetrics:
      (variant.performanceMetrics as Record<string, unknown>) ?? {},
    createdAt: variant.createdAt,
  };
}

/** Result of evaluating a campaign's variants and choosing a winner. */
export interface CampaignWinnerResult {
  variantId: string | null;
  winnerMetrics: ComputedVariant | null;
  recommendation: string;
  confidence: number;
}

/**
 * Marks the given variant as the winner of a campaign (clearing any other
 * winner) and records its computed metrics, derived from the aggregated
 * variant metrics via `evaluateAbTest`. The chosen variant is always marked
 * the winner — the evaluation is returned as advisory context (a human may
 * override the statistical leader), but `performanceMetrics` is surfaced so
 * the UI can surface a warning when they do.
 */
export async function markCampaignWinner(input: {
  userId: string;
  campaignId: string;
  variantId: string;
}): Promise<CampaignWinnerResult> {
  const { userId, campaignId, variantId } = input;

  const campaign = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      project: { createdBy: userId },
    },
    select: { id: true },
  });
  if (!campaign) {
    throw new PublishProjectNotFoundError();
  }

  const variant = await prisma.campaignVariant.findFirst({
    where: { id: variantId, campaignId },
  });
  if (!variant) {
    throw new PublishAssetNotFoundError();
  }

  // Build inputs for the pure evaluator from all the campaign's variants.
  const variants = await prisma.campaignVariant.findMany({
    where: { campaignId },
  });

  const inputs = variants.map((v) => ({
    variantId: v.id,
    variantName: v.variantName ?? v.id,
    metrics:
      (v.performanceMetrics as unknown as RawEventMetrics) ??
      ({} as RawEventMetrics),
  }));

  const evaluation = evaluateAbTest(inputs, { minImpressions: 1 });

  // Evaluation is advisory context; the caller (a human) may override the
  // statistical leader, so we never block on it — we just surface confidence.
  const overrodeLeader =
    evaluation.winnerId !== null && evaluation.winnerId !== variantId;

  // Clear any previously-winner, then flag the chosen variant and merge its
  // computed metrics back onto `performanceMetrics`.
  await prisma.$transaction([
    prisma.campaignVariant.updateMany({
      where: { campaignId, isWinner: true },
      data: { isWinner: false },
    }),
    prisma.campaignVariant.update({
      where: { id: variantId },
      data: {
        isWinner: true,
        performanceMetrics: {
          ...(variant.performanceMetrics as object | null),
          ...evaluation.ranked.find((r) => r.variantId === variantId),
          ...(overrodeLeader
            ? { overrodeStatisticalLeader: evaluation.winnerId }
            : {}),
        } as Prisma.InputJsonValue,
      },
    }),
  ]);

  return {
    variantId,
    winnerMetrics:
      evaluation.ranked.find((r) => r.variantId === variantId) ?? null,
    recommendation: evaluation.recommendation,
    confidence: evaluation.confidence,
  };
}

/** Shape returned to callers when adding a variant (avoids leaking the raw
 * Prisma client type). */
export interface CampaignVariantResult {
  id: string;
  campaignId: string;
  assetId: string | null;
  variantName: string | null;
  weight: number;
  isWinner: boolean;
  performanceMetrics: Record<string, unknown>;
  createdAt: Date;
}
