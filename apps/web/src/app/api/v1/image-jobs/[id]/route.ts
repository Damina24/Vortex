import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth/auth-options";
import {
  advanceImageJob,
  getImageJobForUser,
} from "@/lib/generation/image-jobs";

/**
 * Returns a single image generation job for the current user. Also advances
 * two-phase jobs (FLUX, …) one poll: while the provider reports the image is
 * still rendering the job stays `processing`, and once it is ready the rendered
 * file is persisted and the job completes. Mock/stability complete
 * synchronously on `POST`, so this is purely a poll-endpoint for them.
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

    const job = await getImageJobForUser(ctx.params.id, session.user.id);
    if (!job) {
      return NextResponse.json(
        { success: false, error: "Job not found" },
        { status: 404 },
      );
    }

    const { job: advanced } = await advanceImageJob(job, {
      userId: session.user.id,
    });

    return NextResponse.json({ success: true, data: advanced });
  } catch (error) {
    console.error("Error fetching image generation job:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch image generation job" },
      { status: 500 },
    );
  }
}

export const dynamic = "force-dynamic";