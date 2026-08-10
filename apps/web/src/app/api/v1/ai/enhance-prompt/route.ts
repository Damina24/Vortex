import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { AiServiceError, enhanceScenePrompt } from "@/lib/ai/client";
import {
  AI_CREDIT_COSTS,
  InsufficientCreditsError,
  getCreditsBalance,
  spendCredits,
} from "@/lib/credits";
import { z } from "zod";

const enhancePromptSchema = z
  .object({
    sceneId: z.string().uuid().optional(),
    prompt: z.string().min(1).optional(),
    negativePrompt: z.string().optional(),
    aspectRatio: z.string().optional(),
    brandContext: z.string().optional(),
  })
  .refine(
    (data) => Boolean(data.sceneId) || Boolean(data.prompt?.trim()),
    { message: "Provide either a sceneId or a prompt" }
  );

/**
 * Proxies the AI service's enhance-prompt endpoint. Accepts a `sceneId`
 * (resolves the prompt from the database) or a raw prompt, and returns the
 * enhanced generation prompt plus a negative prompt.
 */
export async function POST(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validation = enhancePromptSchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const { sceneId, prompt, negativePrompt, aspectRatio, brandContext } =
      validation.data;

    let promptToEnhance: string | null | undefined = prompt;
    let negativeToEnhance: string | null | undefined = negativePrompt;
    let aspectToEnhance: string | null | undefined = aspectRatio;

    if (sceneId) {
      const scene = await prisma.scene.findFirst({
        where: {
          id: sceneId,
          storyboard: {
            project: {
              createdBy: session.user.id,
            },
          },
        },
      });

      if (!scene) {
        return NextResponse.json(
          { success: false, error: "Scene not found" },
          { status: 404 }
        );
      }

      promptToEnhance = scene.prompt;
      negativeToEnhance = scene.negativePrompt;
      aspectToEnhance = aspectRatio ?? scene.aspectRatio;
    }

    if (!promptToEnhance?.trim()) {
      return NextResponse.json(
        { success: false, error: "Scene has no prompt to enhance" },
        { status: 400 }
      );
    }

    const cost = AI_CREDIT_COSTS.enhancePrompt;
    const balance = await getCreditsBalance(session.user.id);
    if (balance < cost) {
      return NextResponse.json(
        {
          success: false,
          error: `Prompt enhancement costs ${cost} credit but you only have ${balance}.`,
        },
        { status: 402 }
      );
    }

    const result = await enhanceScenePrompt({
      prompt: promptToEnhance,
      negativePrompt: negativeToEnhance ?? null,
      aspectRatio: aspectToEnhance ?? "16:9",
      brandContext: brandContext ?? null,
    });

    // Charge the user atomically and record a usage transaction. This runs
    // after a successful LLM response so users are never charged for failures.
    const remaining = await spendCredits({
      userId: session.user.id,
      amount: cost,
      description: `AI prompt enhancement ("${promptToEnhance.slice(0, 48)}${
        promptToEnhance.length > 48 ? "..." : ""
      }")`,
    });

    return NextResponse.json({
      success: true,
      data: result,
      credits: { cost, remaining },
    });
  } catch (error) {
    if (error instanceof InsufficientCreditsError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 402 }
      );
    }
    if (error instanceof AiServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("Error enhancing scene prompt:", error);
    return NextResponse.json(
      { success: false, error: "Failed to enhance prompt" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";