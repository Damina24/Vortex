import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { z } from "zod";
import { InsufficientCreditsError } from "@/lib/credits";
import {
  ImageProjectNotFoundError,
  createImageGenerationJob,
} from "@/lib/generation/image-jobs";
import { ImageProviderUnavailableError } from "@/lib/generation/image-providers";

const createJobSchema = z.object({
  projectId: z.string().uuid(),
  prompt: z.string().min(1),
  aspectRatio: z.enum(["16:9", "9:16", "1:1", "4:5"]),
  style: z.string().nullish(),
  /**
   * Optional image provider name (e.g. `mock`, `stability`, `flux`). Defaults
   * to the configured `IMAGE_PROVIDER` (mock) when omitted, so existing
   * clients are unaffected.
   */
  provider: z.string().min(1).optional(),
});

/**
 * Starts an image generation for a project. In mock mode (the default) the
 * render completes synchronously through the full pipeline: credits are charged,
 * a `GenerationJob` (image) and an image `Asset` are created, and the files are
 * persisted to storage. Real image providers plug in behind the same endpoint.
 *
 * - `402` when the user lacks credits (same contract as the other AI endpoints).
 * - `404` when the project is missing or not owned by the caller.
 * - `503` when the requested provider is not registered.
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
    const validation = createJobSchema.safeParse(body);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: "Please provide a valid image job request" },
        { status: 400 },
      );
    }

    const { prompt, aspectRatio, projectId, style, provider } =
      validation.data;

    const { job, creditsConsumed, remainingBalance } =
      await createImageGenerationJob({
        userId: session.user.id,
        projectId,
        prompt,
        aspectRatio,
        style: style ?? null,
        provider,
      });

    return NextResponse.json(
      {
        success: true,
        data: job,
        credits: { cost: creditsConsumed, remaining: remainingBalance },
      },
      { status: 201 },
    );
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 402 },
      );
    }
    if (error instanceof ImageProjectNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    if (error instanceof ImageProviderUnavailableError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 },
      );
    }
    console.error("Image generation failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate image" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";