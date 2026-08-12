import prisma from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { AI_CREDIT_COSTS, spendCredits } from "@/lib/credits";
import type { GenerationJobResponse } from "@/types";
import {
  getVideoProvider,
  type VideoGenerationProvider,
  type VideoGenerationParams,
} from "./providers";
import { storeGeneratedFiles } from "./storage";

/** Thrown when a scene does not exist or is not owned by the caller. */
export class SceneNotFoundError extends Error {
  constructor() {
    super("Scene not found");
    this.name = "SceneNotFoundError";
  }
}

function truncate(value: string, max = 48): string {
  const cleaned = value.replace(/\s+/g, " ").trim();
  return cleaned.length > max ? `${cleaned.slice(0, max).trimEnd()}…` : cleaned;
}

export type GenerationJobWithStatus = {
  id: string;
  status: string;
  creditsConsumed: number;
  outputAssets: Prisma.JsonValue;
  errorMessage: string | null;
};

/** Maps a persisted generation job to the client-facing response shape. */
export function toJobResponse(
  job: GenerationJobWithStatus,
): GenerationJobResponse {
  return {
    jobId: job.id,
    status: job.status as GenerationJobResponse["status"],
    creditsConsumed: job.creditsConsumed,
    outputAssets: Array.isArray(job.outputAssets)
      ? (job.outputAssets as unknown as GenerationJobResponse["outputAssets"])
      : [],
    errorMessage: job.errorMessage ?? undefined,
  };
}

/** Loads a job for a user, verifying ownership through the project. */
export async function getVideoJobForUser(
  jobId: string,
  userId: string,
): Promise<Awaited<ReturnType<typeof prisma.generationJob.findFirst>>> {
  return prisma.generationJob.findFirst({
    where: {
      id: jobId,
      project: { createdBy: userId },
    },
  });
}

async function markJobFailed(input: {
  jobId: string;
  sceneId: string;
  storyboardId: string;
  error: unknown;
}): Promise<void> {
  const message =
    input.error instanceof Error ? input.error.message : String(input.error);
  try {
    await prisma.generationJob.update({
      where: { id: input.jobId },
      data: {
        status: "failed",
        errorMessage: message.slice(0, 500),
        completedAt: new Date(),
      },
    });
    await prisma.scene.update({
      where: { id: input.sceneId },
      data: { status: "failed" },
    });
    await prisma.storyboard.update({
      where: { id: input.storyboardId },
      data: { status: "failed" },
    });
  } catch (error) {
    console.error("Failed to persist generation failure:", error);
  }
}
/**
 * Creates and runs a video generation job for a scene, charging the user's
 * credits atomically up front (so a queued render is always paid for) and
 * driving the full state machine:
 *
 *   scene pending → generating → completed | failed
 *   job   queued  → processing  → completed | failed
 *
 * Output files are persisted to object storage (`storeGeneratedFiles`) and a
 * video `Asset` is created and linked to the scene's `generatedVideo`. The
 * storyboard status is kept in sync: `generating` while any scene renders and
 * `completed` once every scene has finished.
 *
 * `provider` may be a provider name (resolved via `getVideoProvider`) or a
 * provider instance (useful for tests).
 *
 * Throws `SceneNotFoundError` (unknown/not-owned scene),
 * `InsufficientCreditsError` (insufficient balance) or a provider error.
 */
export async function createVideoGenerationJob(opts: {
  userId: string;
  sceneId: string;
  provider?: string | VideoGenerationProvider;
}) {
  const { userId, sceneId } = opts;

  const scene = await prisma.scene.findFirst({
    where: {
      id: sceneId,
      storyboard: { project: { createdBy: userId } },
    },
    include: {
      storyboard: { include: { project: true } },
    },
  });

  if (!scene) {
    throw new SceneNotFoundError();
  }

  const provider =
    typeof opts.provider === "string"
      ? getVideoProvider(opts.provider)
      : (opts.provider ?? getVideoProvider());

  const cost = AI_CREDIT_COSTS.videoGeneration;

  // Book the render credits up front. This throws InsufficientCreditsError
  // (mapped to HTTP 402 by the API route) when the balance is too low.
  const remainingBalance = await spendCredits({
    userId,
    amount: cost,
    description: `Video render for scene ${scene.orderIndex + 1} — ${truncate(
      scene.prompt,
    )}`,
  });

  const job = await prisma.generationJob.create({
    data: {
      projectId: scene.storyboard.projectId,
      sceneId: scene.id,
      jobType: "video",
      provider: provider.name,
      status: "queued",
      creditsConsumed: cost,
      inputParams: {
        prompt: scene.prompt,
        negativePrompt: scene.negativePrompt,
        aspectRatio: scene.aspectRatio,
        duration: scene.duration,
        orderIndex: scene.orderIndex,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.scene.update({
    where: { id: scene.id },
    data: { status: "generating", generationJobId: job.id },
  });
  await prisma.storyboard.update({
    where: { id: scene.storyboardId },
    data: { status: "generating" },
  });

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { status: "processing", startedAt: new Date() },
  });

  const params: VideoGenerationParams = {
    prompt: scene.prompt,
    negativePrompt: scene.negativePrompt,
    aspectRatio: scene.aspectRatio,
    duration: scene.duration,
    projectName: scene.storyboard.project.name,
  };

  let result: Awaited<ReturnType<VideoGenerationProvider["generate"]>>;
  try {
    result = await provider.generate(params);
  } catch (error) {
    await markJobFailed({
      jobId: job.id,
      sceneId: scene.id,
      storyboardId: scene.storyboardId,
      error,
    });
    throw error;
  }

  const stored = await storeGeneratedFiles({
    files: result.files,
    teamId: scene.storyboard.project.teamId,
  });

  const primary = stored[0];

  const asset = await prisma.asset.create({
    data: {
      teamId: scene.storyboard.project.teamId,
      projectId: scene.storyboard.projectId,
      name: `Scene ${scene.orderIndex + 1} render`,
      type: "video",
      mimeType: primary?.mimeType ?? null,
      sizeBytes: primary?.sizeBytes ?? null,
      url: primary?.url ?? "",
      duration: result.duration,
      width: result.width,
      height: result.height,
      createdBy: userId,
      metadata: {
        provider: provider.name,
        ...result.metadata,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const outputAssets: GenerationJobResponse["outputAssets"] = stored.map(
    (ref) => ({
      id: asset.id,
      url: ref.url,
      type: "video",
      name: asset.name,
      mimeType: ref.mimeType,
    }),
  );

  await prisma.generationJob.update({
    where: { id: job.id },
    data: {
      providerJobId: result.providerJobId,
      status: "completed",
      outputAssets: outputAssets as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });

  await prisma.scene.update({
    where: { id: scene.id },
    data: { status: "completed", generatedVideoId: asset.id },
  });

  const incompleteScenes = await prisma.scene.count({
    where: {
      storyboardId: scene.storyboardId,
      status: { not: "completed" },
    },
  });

  await prisma.storyboard.update({
    where: { id: scene.storyboardId },
    data: { status: incompleteScenes === 0 ? "completed" : "generating" },
  });

  const finishedJob = await prisma.generationJob.findUniqueOrThrow({
    where: { id: job.id },
  });

  return {
    job: toJobResponse(finishedJob),
    creditsConsumed: cost,
    remainingBalance,
  };
}
