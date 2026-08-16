import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { z } from "zod";
import {
  PublishAssetNotFoundError,
  PublishProjectNotFoundError,
  publishAssetToPlatform,
} from "@/lib/publishing/jobs";
import { PublishingProviderUnavailableError } from "@/lib/publishing/providers";

const publishSchema = z.object({
  projectId: z.string().uuid(),
  assetId: z.string().uuid(),
  platform: z.enum(["youtube", "tiktok", "meta", "google", "organic"]),
  title: z.string().min(1).max(255),
  description: z.string().max(5000).optional().default(""),
  tags: z.array(z.string().min(1).max(50)).max(20).optional(),
  visibility: z.enum(["public", "unlisted", "private"]).optional(),
  provider: z.string().min(1).optional(),
});

/**
 * Publishes a finished asset (video) to a platform and records the result as a
 * `Campaign` + `CampaignVariant`. The provider is resolved from `provider`
 * (optional), else the `PUBLISHING_PROVIDER` env var / mock default.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => null);
    const validation = publishSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 },
      );
    }

    const {
      projectId,
      assetId,
      platform,
      title,
      description,
      tags,
      visibility,
      provider,
    } = validation.data;

    const { campaign, result } = await publishAssetToPlatform({
      userId: session.user.id,
      projectId,
      assetId,
      platform,
      title,
      description: description ?? "",
      tags,
      visibility,
      provider,
    });

    return NextResponse.json(
      { success: true, data: { campaign, published: result } },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof PublishProjectNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    if (error instanceof PublishAssetNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    if (error instanceof PublishingProviderUnavailableError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 },
      );
    }
    console.error("Error publishing asset:", error);
    return NextResponse.json(
      {
        success: false,
        error: `Publishing failed: ${error instanceof Error ? error.message : "unknown error"}`,
      },
      { status: 500 },
    );
  }
}

/**
 * Lists published campaigns owned by the current user (via their projects),
 * newest first, with their variants.
 */
export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get("page") || "1"));
    const pageSize = Math.min(
      50,
      Math.max(1, parseInt(searchParams.get("pageSize") || "20")),
    );

    const where = { project: { createdBy: session.user.id } };

    const [campaigns, total] = await Promise.all([
      prisma.campaign.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          project: { select: { id: true, name: true } },
          variants: {
            include: { asset: { select: { id: true, url: true, name: true } } },
          },
        },
      }),
      prisma.campaign.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: campaigns,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Error fetching published campaigns:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch published campaigns" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
