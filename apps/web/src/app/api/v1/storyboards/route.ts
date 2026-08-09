import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";
import { z } from "zod";

const createStoryboardSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().min(1, "Name is required").max(255),
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
    const projectId = searchParams.get("projectId");
    const page = parseInt(searchParams.get("page") || "1");
    const pageSize = parseInt(searchParams.get("pageSize") || "20");

    const where: Record<string, unknown> = {
      project: {
        createdBy: session.user.id,
      },
    };

    if (projectId) {
      where.projectId = projectId;
    }

    const [storyboards, total] = await Promise.all([
      prisma.storyboard.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            select: { scenes: true },
          },
          project: {
            select: { id: true, name: true },
          },
        },
      }),
      prisma.storyboard.count({ where }),
    ]);

    return NextResponse.json({
      success: true,
      data: storyboards,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    });
  } catch (error) {
    console.error("Error fetching storyboards:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch storyboards" },
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
    const validation = createStoryboardSchema.safeParse(body);

    if (!validation.success) {
      const errors = validation.error.flatten().fieldErrors;
      const firstError = Object.values(errors).flat()[0];
      return NextResponse.json(
        { success: false, error: firstError || "Validation failed" },
        { status: 400 }
      );
    }

    const { projectId, name } = validation.data;

    // Verify user owns the project
    const project = await prisma.project.findFirst({
      where: {
        id: projectId,
        createdBy: session.user.id,
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 }
      );
    }

    const storyboard = await prisma.storyboard.create({
      data: {
        projectId,
        name,
        status: "draft",
      },
      include: {
        _count: {
          select: { scenes: true },
        },
      },
    });

    return NextResponse.json(
      { success: true, data: storyboard },
      { status: 201 }
    );
  } catch (error) {
    console.error("Error creating storyboard:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create storyboard" },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";