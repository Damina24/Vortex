import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { summarizeCampaigns } from "@/lib/publishing/campaign-ab-summary";

/**
 * Returns A/B analytics for the authenticated user's published campaigns,
 * newest first. Each campaign is reduced to its live variant ranking, winner
 * leader, confidence and recommendation via the pure campaign-summary helper
 * (itself built on the same `evaluateAbTest` evaluator the Publishing page
 * uses), so the Analytics dashboard can surface winning creatives at a glance.
 * Session-checked: returns 401 when unauthenticated.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const campaigns = await prisma.campaign.findMany({
      where: { project: { createdBy: session.user.id } },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        name: true,
        platform: true,
        platformCampaignId: true,
        createdAt: true,
        variants: {
          select: {
            id: true,
            variantName: true,
            isWinner: true,
            performanceMetrics: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: summarizeCampaigns(campaigns),
    });
  } catch (error) {
    console.error("Error fetching campaign A/B analytics:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch campaign analytics" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";