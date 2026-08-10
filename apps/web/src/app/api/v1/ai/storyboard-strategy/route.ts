import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import { AiServiceError, generateStoryboardStrategy } from "@/lib/ai/client";
import type { AiStoryboardStrategyRequest } from "@/types";
import { z } from "zod";

const generateStrategySchema = z.object({
  storyboardId: z.string().uuid(),
  objective: z.enum(["conversion", "awareness", "engagement"]).optional(),
  targetPlatforms: z.array(z.string().min(1)).optional(),
  brandContext: z.string().optional(),
});

/**
 * Proxies the AI service's storyboard-strategy endpoint. Builds the request
 * from the storyboard, its scenes, and the owning project, then persists the
 * generated strategy onto `Storyboard.aiStrategy`.
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
    const validation = generateStrategySchema.safeParse(body);
    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const { storyboardId, objective, targetPlatforms, brandContext } =
      validation.data;

    const storyboard = await prisma.storyboard.findFirst({
      where: {
        id: storyboardId,
        project: {
          createdBy: session.user.id,
        },
      },
      include: {
        project: true,
        scenes: {
          orderBy: { orderIndex: "asc" },
        },
      },
    });

    if (!storyboard) {
      return NextResponse.json(
        { success: false, error: "Storyboard not found" },
        { status: 404 }
      );
    }

    const aiRequest: AiStoryboardStrategyRequest = {
      storyboardName: storyboard.name,
      projectName: storyboard.project.name,
      projectDescription: storyboard.project.description,
      objective: objective ?? storyboard.project.objective ?? null,
      targetPlatforms:
        targetPlatforms ??
        (storyboard.project.targetPlatforms as string[]) ??
        [],
      brandContext: brandContext ?? null,
      scenes: storyboard.scenes.map((scene) => ({
        orderIndex: scene.orderIndex,
        prompt: scene.prompt,
        duration: scene.duration,
        aspectRatio: scene.aspectRatio,
      })),
    };

    const strategy = await generateStoryboardStrategy(aiRequest);

    // Cache the strategy on the storyboard so the detail page can render it
    // without calling the LLM again.
    try {
      await prisma.storyboard.update({
        where: { id: storyboardId },
        data: { aiStrategy: strategy as unknown as Prisma.InputJsonValue },
      });
    } catch (persistError) {
      console.error("Failed to persist AI strategy:", persistError);
    }

    return NextResponse.json({ success: true, data: strategy });
  } catch (error) {
    if (error instanceof AiServiceError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error.status }
      );
    }
    console.error("Error generating storyboard strategy:", error);
    return NextResponse.json(
      { success: false, error: "Failed to generate strategy" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";