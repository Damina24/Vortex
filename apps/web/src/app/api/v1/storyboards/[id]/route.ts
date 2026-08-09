import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { StoryboardStatus } from "@prisma/client";
import { z } from "zod";

const updateStoryboardSchema = z.object({
  name: z.string().min(1, "Name is required").max(255).optional(),
  status: z.enum(["draft", "active", "generating", "completed", "failed"]).optional(),
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

    const storyboard = await prisma.storyboard.findFirst({
      where: {
        id: params.id,
        project: {
          createdBy: session.user.id,
        },
      },
      include: {
        project: {
          select: { id: true, name: true },
        },
        scenes: {
          orderBy: { orderIndex: "asc" },
          include: {
            styleReference: {
              select: { id: true, name: true, url: true },
            },
            generatedVideo: {
              select: { id: true, name: true, url: true, thumbnailUrl: true },
            },
          },
        },
        _count: {
          select: { scenes: true },
        },
      },
    });

    if (!storyboard) {
      return NextResponse.json(
        { success: false, error: "Storyboard not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: storyboard });
  } catch (error) {
    console.error("Error fetching storyboard:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch storyboard" },
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
    const validation = updateStoryboardSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const existing = await prisma.storyboard.findFirst({
      where: {
        id: params.id,
        project: {
          createdBy: session.user.id,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Storyboard not found" },
        { status: 404 }
      );
    }

    const { name, status } = validation.data;

    const updated = await prisma.storyboard.update({
      where: { id: params.id },
      data: {
        ...(name !== undefined && { name }),
        ...(status !== undefined && { status: status as StoryboardStatus }),
      },
      include: {
        _count: {
          select: { scenes: true },
        },
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error("Error updating storyboard:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update storyboard" },
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

    const existing = await prisma.storyboard.findFirst({
      where: {
        id: params.id,
        project: {
          createdBy: session.user.id,
        },
      },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Storyboard not found" },
        { status: 404 }
      );
    }

    await prisma.storyboard.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting storyboard:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete storyboard" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";