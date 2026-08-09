import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { z } from "zod";

const updateSceneSchema = z.object({
  orderIndex: z.number().int().min(0).optional(),
  duration: z.number().int().min(1).optional(),
  prompt: z.string().min(1).optional(),
  negativePrompt: z.string().optional(),
  cameraDirection: z.any().optional(),
  aspectRatio: z.string().optional(),
  status: z.enum(["pending", "generating", "completed", "failed"]).optional(),
});

export async function GET(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const scene = await prisma.scene.findFirst({
      where: {
        id: params.id,
        storyboard: {
          project: {
            createdBy: session.user.id,
          },
        },
      },
      include: {
        styleReference: {
          select: { id: true, name: true, url: true },
        },
        generatedVideo: {
          select: { id: true, name: true, url: true, thumbnailUrl: true },
        },
      },
    });

    if (!scene) {
      return NextResponse.json(
        { success: false, error: "Scene not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: scene });
  } catch (error) {
    console.error("Error fetching scene:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch scene" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const body = await req.json();
    const validation = updateSceneSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const existing = await prisma.scene.findFirst({
      where: {
        id: params.id,
        storyboard: {
          project: {
            createdBy: session.user.id,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Scene not found" },
        { status: 404 }
      );
    }

    const updated = await prisma.scene.update({
      where: { id: params.id },
      data: validation.data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating scene:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update scene" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const existing = await prisma.scene.findFirst({
      where: {
        id: params.id,
        storyboard: {
          project: {
            createdBy: session.user.id,
          },
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Scene not found" },
        { status: 404 }
      );
    }

    await prisma.scene.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting scene:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete scene" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";