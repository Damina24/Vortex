import prisma from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { AI_CREDIT_COSTS, spendCredits } from "@/lib/credits";
import type { GenerationJobResponse, ImageJobResponse } from "@/types";
import { toJobResponse, type GenerationJobWithStatus } from "./jobs";
import { storeGeneratedFiles } from "./storage";
import {
  getImageProvider,
  isAsyncImageProvider,
  type ImageGenerationProvider,
} from "./image-providers";

/** Re-export so callers depend only on the image module. */
export { toJobResponse as toImageJobResponse };

/** Thrown when a project does not exist or is not owned by the caller. */
export class ImageProjectNotFoundError extends Error {
  constructor() {
    super("Project not found");
    this.name = "ImageProjectNotFoundError";
  }
}

/** Shared failure-persist helper for the create and advance paths. */
async function markFailed(input: {
  jobId: string;
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
  } catch (error) {
    console.error("Failed to persist image generation failure:", error);
  }
}

/** Loads an image job for the current user (ownership verified via the project). */
export async function getImageJobForUser(jobId: string, userId: string) {
  return prisma.generationJob.findFirst({
    where: {
      id: jobId,
      project: { createdBy: userId },
    },
  });
}

/** The slice of a persisted image job needed to advance a two-phase render. */
export interface PersistedImageJob {
  id: string;
  /** Nullable for DB-safety; image jobs are always created with a project. */
  projectId: string | null;
  provider: string;
  providerJobId: string | null;
  status: string;
  creditsConsumed: number;
  outputAssets: Prisma.JsonValue;
  errorMessage: string | null;
  inputParams?: Prisma.JsonValue | null;
}

/**
 * Advances a two-phase image job one poll. Resolves the async provider (via
 * `getImageProvider(job.provider)`, or the injected `providerOverride`) and
 * calls its `retrieve`: while the provider reports `processing` the job stays
 * in flight; `failed` marks the job failed; `succeeded` persists the rendered
 * file(s), creates the image `Asset`, and completes the job. Clients poll
 * `GET /api/v1/image-jobs/[id]` until the returned status is terminal.
 */
export async function advanceImageJob(
  job: PersistedImageJob,
  opts: {
    userId?: string;
    providerOverride?: ImageGenerationProvider;
  } = {},
): Promise<{ status: string; job: ImageJobResponse }> {
  // Only two-phase jobs in flight are advanced; everything else is terminal.
  if (job.status !== "processing" || !job.providerJobId || !job.projectId) {
    return {
      status: job.status,
      job: toJobResponse(job as GenerationJobWithStatus),
    };
  }

  const provider = opts.providerOverride ?? getImageProvider(job.provider);
  if (!isAsyncImageProvider(provider)) {
    return {
      status: job.status,
      job: toJobResponse(job as GenerationJobWithStatus),
    };
  }

  const input = (job.inputParams ?? {}) as {
    prompt?: unknown;
    aspectRatio?: unknown;
    style?: unknown;
  };
  const project = await prisma.project.findUnique({
    where: { id: job.projectId },
    select: { teamId: true, name: true },
  });

  const params = {
    prompt: typeof input.prompt === "string" ? input.prompt : "Untitled image",
    aspectRatio:
      typeof input.aspectRatio === "string" ? input.aspectRatio : "16:9",
    style: typeof input.style === "string" ? (input.style as string) : null,
    projectName: project?.name ?? null,
  };

  const retrieved = await provider.retrieve(job.providerJobId, params);

  if (retrieved.status === "processing") {
    return {
      status: "processing",
      job: toJobResponse(job as GenerationJobWithStatus),
    };
  }

  if (retrieved.status === "failed") {
    await markFailed({
      jobId: job.id,
      error: new Error(retrieved.error),
    });
    const failedJob = await prisma.generationJob.findUniqueOrThrow({
      where: { id: job.id },
    });
    return {
      status: "failed",
      job: toJobResponse(failedJob as GenerationJobWithStatus),
    };
  }

  const stored = await storeGeneratedFiles({
    files: retrieved.result.files,
    teamId: project?.teamId ?? "",
  });
  const primary = stored[0];

  const asset = await prisma.asset.create({
    data: {
      teamId: project?.teamId ?? "",
      projectId: job.projectId,
      name: `Image — ${project?.name ?? job.projectId}`,
      type: "image",
      mimeType: primary?.mimeType ?? retrieved.result.files[0].contentType,
      sizeBytes: primary?.sizeBytes ?? null,
      url: primary?.url ?? "",
      duration: null,
      width: retrieved.result.width,
      height: retrieved.result.height,
      createdBy: opts.userId ?? "",
      metadata: {
        provider: provider.name,
        ...(retrieved.result.metadata as object),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const outputAssets: GenerationJobResponse["outputAssets"] = stored.map(
    (ref) => ({
      id: asset.id,
      url: ref.url,
      type: "image",
      name: asset.name,
      mimeType: ref.mimeType,
    }),
  );

  await prisma.generationJob.update({
    where: { id: job.id },
    data: {
      providerJobId: job.providerJobId,
      status: "completed",
      outputAssets: outputAssets as unknown as Prisma.InputJsonValue,
      completedAt: new Date(),
    },
  });

  const finishedJob = await prisma.generationJob.findUniqueOrThrow({
    where: { id: job.id },
  });
  return {
    status: "completed",
    job: toJobResponse(finishedJob as GenerationJobWithStatus),
  };
}

export interface CreateImageJobInput {
  userId: string;
  projectId: string;
  prompt: string;
  aspectRatio: string;
  style?: string | null;
  provider?: string | ImageGenerationProvider;
}

export interface CreateImageJobResult {
  job: ImageJobResponse;
  creditsConsumed: number;
  remainingBalance: number;
}

/**
 * Charges credits up front and runs an image generation, driving the persisted
 * job through `queued → processing → completed | failed`, storing the rendered
 * file(s) to S3 (or inline as data URIs when storage is down), and creating an
 * image `Asset`. Image generation is project-level (not scene-level), so no
 * scene or storyboard is updated.
 */
export async function createImageGenerationJob(
  input: CreateImageJobInput,
): Promise<CreateImageJobResult> {
  const {
    userId,
    projectId,
    prompt,
    aspectRatio,
    style,
    provider: providerInput,
  } = input;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, teamId: true, createdBy: true, name: true },
  });
  if (!project || project.createdBy !== userId) {
    throw new ImageProjectNotFoundError();
  }

  const provider =
    typeof providerInput === "string"
      ? getImageProvider(providerInput)
      : (providerInput ?? getImageProvider());

  const cost = AI_CREDIT_COSTS.imageGeneration;
  const remainingBalance = await spendCredits({
    userId,
    amount: cost,
    description: `Image generation for project ${project.name ?? projectId}`,
  });

  const job = await prisma.generationJob.create({
    data: {
      projectId: project.id,
      jobType: "image",
      provider: provider.name,
      status: "queued",
      creditsConsumed: cost,
      inputParams: {
        prompt,
        aspectRatio,
        style: style ?? null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { status: "processing", startedAt: new Date() },
  });

  // Async (two-phase) providers (FLUX, …) submit a generation and return
  // immediately; the client polls `GET /api/v1/image-jobs/[id]`, which calls
  // `advanceImageJob` until the provider reports the image is finished.
  if (isAsyncImageProvider(provider)) {
    try {
      const submitted = await provider.submit({
        prompt,
        aspectRatio,
        style: style ?? null,
        projectName: project.name ?? null,
      });
      await prisma.generationJob.update({
        where: { id: job.id },
        data: { providerJobId: submitted.providerJobId },
      });
      const queued = await prisma.generationJob.findUniqueOrThrow({
        where: { id: job.id },
      });
      return {
        job: toJobResponse(queued as GenerationJobWithStatus),
        creditsConsumed: cost,
        remainingBalance,
      };
    } catch (error) {
      await markFailed({ jobId: job.id, error });
      throw error;
    }
  }

  let result: Awaited<ReturnType<ImageGenerationProvider["generate"]>>;
  try {
    result = await provider.generate({
      prompt,
      aspectRatio,
      style: style ?? null,
      projectName: project.name ?? null,
    });
  } catch (error) {
    await markFailed({ jobId: job.id, error });
    throw error;
  }

  const stored = await storeGeneratedFiles({
    files: result.files,
    teamId: project.teamId,
  });
  const primary = stored[0];

  const asset = await prisma.asset.create({
    data: {
      teamId: project.teamId,
      projectId: project.id,
      name: `Image — ${project.name ?? projectId}`,
      type: "image",
      mimeType: primary?.mimeType ?? result.files[0].contentType,
      sizeBytes: primary?.sizeBytes ?? null,
      url: primary?.url ?? "",
      duration: null,
      width: result.width,
      height: result.height,
      createdBy: userId,
      metadata: {
        provider: provider.name,
        ...(result.metadata as object),
      } as unknown as Prisma.InputJsonValue,
    },
  });

  const outputAssets: GenerationJobResponse["outputAssets"] = stored.map(
    (ref) => ({
      id: asset.id,
      url: ref.url,
      type: "image",
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

  const finishedJob = await prisma.generationJob.findUniqueOrThrow({
    where: { id: job.id },
  });

  return {
    job: toJobResponse(finishedJob as GenerationJobWithStatus),
    creditsConsumed: cost,
    remainingBalance,
  };
}