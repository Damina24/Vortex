import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { recalculateStoryboardDuration } from "@/lib/db/recalculate-storyboard-duration";
import { z } from "zod";

const createSceneSchema = z.object({
  storyboardId: z.string().uuid(),
  orderIndex: z.number().int().min(0),
  duration: z.number().int().min(1),
  prompt: z.string().min(1, "Prompt is required"),
  negativePrompt: z.string().optional(),
  cameraDirection: z.any().optional(),
  aspectRatio: z.string().default("16:9"),
});

export async function GET(req: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { searchParams } = new URL(req.url);
    const storyboardId = searchParams.get("storyboardId");

    if (!storyboardId) {
      return NextResponse.json(
        { success: false, error: "storyboardId is required" },
        { status: 400 }
      );
    }

    // Verify storyboard ownership
    const storyboard = await prisma.storyboard.findFirst({
      where: {
        id: storyboardId,
        project: {
          createdBy: session.user.id,
        },
      },
    });

    if (!storyboard) {
      return NextResponse.json(
        { success: false, error: "Storyboard not found" },
        { status: 404 }
      );
    }

    const scenes = await prisma.scene.findMany({
      where: { storyboardId },
      orderBy: { orderIndex: "asc" },
      include: {
        styleReference: {
          select: { id: true, name: true, url: true },
        },
        generatedVideo: {
          select: { id: true, name: true, url: true, thumbnailUrl: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: scenes });
  } catch (error) {
    console.error("Error fetching scenes:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scenes" },
      { status: 500 }
    );
  }
}

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
    const validation = createSceneSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const { storyboardId, orderIndex, duration, prompt, negativePrompt, cameraDirection, aspectRatio } = validation.data;

    // Verify storyboard ownership
    const storyboard = await prisma.storyboard.findFirst({
      where: {
        id: storyboardId,
        project: {
          createdBy: session.user.id,
        },
      },
    });

    if (!storyboard) {
      return NextResponse.json(
        { success: false, error: "Storyboard not found" },
        { status: 404 }
      );
    }

    const scene = await prisma.scene.create({
      data: {
        storyboardId,
        orderIndex,
        duration,
        prompt,
        negativePrompt,
        cameraDirection,
        aspectRatio,
        status: "pending",
      },
    });

    // Keep the storyboard's total duration in sync
    await recalculateStoryboardDuration(storyboardId);

    return NextResponse.json({ success: true, data: scene }, { status: 201 });
  } catch (error) {
    console.error("Error creating scene:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create scene" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";