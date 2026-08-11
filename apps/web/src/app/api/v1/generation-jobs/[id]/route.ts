import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import { getVideoJobForUser, toJobResponse } from "@/lib/generation/jobs";

/**
 * Returns a single generation job for the current user. Useful for polling —
 * mock renders complete synchronously, but real render providers will run
 * asynchronously and clients can poll this endpoint until completion.
 */
export async function GET(_req: Request, ctx: { params: { id: string } }) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const job = await getVideoJobForUser(ctx.params.id, session.user.id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: toJobResponse(job) });
  } catch (error) {
    console.error("Error fetching generation job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch generation job" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
