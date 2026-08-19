import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { z } from "zod";
import { InsufficientCreditsError } from "@/lib/credits";
import {
  SceneNotFoundError,
  createVideoGenerationJob,
} from "@/lib/generation/jobs";
import { VideoProviderUnavailableError } from "@/lib/generation/providers";

const createJobSchema = z.object({
  sceneId: z.string().uuid(),
  /**
   * Optional render provider name (e.g. `mock`, `mock-async`, `ffmpeg`, `kling`,
   * `runway`).
   * Defaults to the configured `VIDEO_PROVIDER` (mock) when omitted, so existing
   * clients are unaffected.
   */
  provider: z.string().min(1).optional(),
});

/**
 * Starts a video render for a scene. In mock mode (the default) the render
 * completes synchronously through the full pipeline: credits are charged, a
 * `GenerationJob` and video `Asset` are created, and the scene is linked to
 * the generated asset. Real render providers can be plugged in later behind
 * the same `createVideoGenerationJob` endpoint.
 *
 * - `402` when the user does not have enough credits (same contract as the
 *   AI endpoints, so the credits UI shows the buy-credits CTA).
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
        { success: false, error: "Please provide a valid scene id" },
        { status: 400 },
      );
    }

    const { job, creditsConsumed, remainingBalance } =
      await createVideoGenerationJob({
        userId: session.user.id,
        sceneId: validation.data.sceneId,
        provider: validation.data.provider,
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
    if (error instanceof SceneNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    if (error instanceof VideoProviderUnavailableError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 },
      );
    }
    console.error("Video generation failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate video" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
