import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import prisma from "@/lib/db/prisma";

/** Lists the video/image assets of a project, scoped to its owner. */
export async function GET(
  _req: Request,
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

    const project = await prisma.project.findFirst({
      where: { id: params.id, createdBy: session.user.id },
      select: { id: true, teamId: true },
    });
    if (!project) {
      return NextResponse.json(
        { success: false, error: "Project not found" },
        { status: 404 },
      );
    }

    const assets = await prisma.asset.findMany({
      where: { projectId: project.id, teamId: project.teamId, type: "video" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        url: true,
        mimeType: true,
        sizeBytes: true,
        duration: true,
        type: true,
      },
    });

    return NextResponse.json({ success: true, data: assets });
  } catch (error) {
    console.error("Error fetching project assets:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch assets" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
