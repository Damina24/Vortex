import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { z } from "zod";
import {
  PublishAssetNotFoundError,
  PublishProjectNotFoundError,
  markCampaignWinner,
} from "@/lib/publishing/jobs";

const winnerSchema = z.object({
  variantId: z.string().uuid(),
});

/**
 * Promotes a variant of a published campaign to the winner (clearing any prior
 * winner). The A/B evaluation is returned as advisory context so the caller can
 * surface it — a human may override the statistical leader.
 */
export async function POST(
  req: Request,
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

    const body = await req.json().catch(() => null);
    const validation = winnerSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 },
      );
    }

    const result = await markCampaignWinner({
      userId: session.user.id,
      campaignId: params.id,
      variantId: validation.data.variantId,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (
      error instanceof PublishProjectNotFoundError ||
      error instanceof PublishAssetNotFoundError
    ) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    console.error("Error promoting campaign winner:", error);
    return NextResponse.json(
      { success: false, error: "Failed to promote winner" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
