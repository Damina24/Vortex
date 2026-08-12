import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { z } from "zod";
import { InsufficientCreditsError } from "@/lib/credits";
import {
  AudioProjectNotFoundError,
  createAudioGenerationJob,
} from "@/lib/generation/audio-jobs";
import { AudioProviderUnavailableError } from "@/lib/generation/audio-providers";

const createJobSchema = z.object({
  projectId: z.string().uuid(),
  kind: z.enum(["voiceover", "music"]),
  prompt: z.string().min(1),
  duration: z.number().int().min(1).max(600),
  voice: z.string().nullish(),
  style: z.string().nullish(),
});

/**
 * Starts an audio generation for a project. In mock mode (the default) the
 * render completes synchronously through the full pipeline: credits are charged,
 * a `GenerationJob` (voice/music) and an audio `Asset` are created, and the
 * files are persisted to storage. Real TTS/music providers plug in behind the
 * same endpoint.
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
        { success: false, error: "Please provide a valid audio job request" },
        { status: 400 },
      );
    }

    const { prompt, duration, kind, projectId, voice, style } = validation.data;

    const { job, creditsConsumed, remainingBalance } =
      await createAudioGenerationJob({
        userId: session.user.id,
        projectId,
        prompt,
        duration,
        kind,
        voice: voice ?? null,
        style: style ?? null,
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
    if (error instanceof AudioProjectNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 404 },
      );
    }
    if (error instanceof AudioProviderUnavailableError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 503 },
      );
    }
    console.error("Audio generation failed:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate audio" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
