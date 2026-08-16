import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";

/** Fetches a single published campaign, scoped to the caller's projects. */
export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const campaign = await prisma.campaign.findFirst({
      where: {
        id: params.id,
        project: { createdBy: session.user.id },
      },
      include: {
        project: { select: { id: true, name: true } },
        variants: {
          include: { asset: { select: { id: true, url: true, name: true } } },
        },
      },
    });

    if (!campaign) {
      return NextResponse.json(
        { success: false, error: "Campaign not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: campaign });
  } catch (error) {
    console.error("Error fetching campaign:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch campaign" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
