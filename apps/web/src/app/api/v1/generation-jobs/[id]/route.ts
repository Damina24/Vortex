import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import {
  GenerationJobNotFoundError,
  completeVideoGenerationJob,
} from "@/lib/generation/jobs";

/**
 * Returns a single generation job for the current user, advancing it first if
 * it is running under an async (two-phase) provider so polling drives it to
 * completion. Sync/mock jobs complete on submit and are returned unchanged.
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

    const { job } = await completeVideoGenerationJob({
      jobId: ctx.params.id,
      userId: session.user.id,
    });

    return NextResponse.json({ success: true, data: job });
  } catch (error) {
    if (error instanceof GenerationJobNotFoundError) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }
    console.error("Error fetching generation job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch generation job" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";
