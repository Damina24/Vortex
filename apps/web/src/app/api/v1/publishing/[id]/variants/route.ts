import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { z } from "zod";
import {
  CampaignVariantDuplicateError,
  PublishAssetNotFoundError,
  PublishProjectNotFoundError,
  addCampaignVariant,
} from "@/lib/publishing/jobs";

const addVariantSchema = z.object({
  assetId: z.string().uuid(),
  variantName: z.string().min(1, "Variant name is required").max(255),
});

/**
 * Adds an additional creative asset to an existing published campaign as a new
 * (non-winning) variant so it can be A/B tested against the current creative.
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
    const validation = addVariantSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 },
      );
    }

    const variant = await addCampaignVariant({
      userId: session.user.id,
      campaignId: params.id,
      assetId: validation.data.assetId,
      variantName: validation.data.variantName,
    });

    return NextResponse.json({ success: true, data: variant }, { status: 201 });
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
    if (error instanceof CampaignVariantDuplicateError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 409 },
      );
    }
    console.error("Error adding campaign variant:", error);
    return NextResponse.json(
      { success: false, error: "Failed to add variant" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
