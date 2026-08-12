import prisma from "@/lib/db/prisma";
import type { Prisma } from "@prisma/client";
import { AI_CREDIT_COSTS, spendCredits } from "@/lib/credits";
import type { AudioJobResponse, GenerationJobResponse } from "@/types";
import { toJobResponse, type GenerationJobWithStatus } from "./jobs";
import { storeGeneratedFiles } from "./storage";
import {
  getAudioProvider,
  type AudioGenerationProvider,
} from "./audio-providers";

/** Re-export so callers depend only on the audio module. */
export { toJobResponse as toAudioJobResponse };

/** Thrown when a project does not exist or is not owned by the caller. */
export class AudioProjectNotFoundError extends Error {
  constructor() {
    super("Project not found");
    this.name = "AudioProjectNotFoundError";
  }
}

type AudioKind = "voiceover" | "music";

/** Maps a user-facing audio kind to the persisted job type. */
function jobTypeFor(kind: AudioKind): "voice" | "music" {
  return kind === "music" ? "music" : "voice";
}

/** Reads the per-kind credit cost from the single source of truth. */
function costFor(kind: AudioKind): number {
  return kind === "voiceover"
    ? AI_CREDIT_COSTS.voiceover
    : AI_CREDIT_COSTS.music;
}

async function markAudioJobFailed(input: {
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
    console.error("Failed to persist audio generation failure:", error);
  }
}

/** Loads an audio job for the current user (ownership verified via the project). */
export async function getAudioJobForUser(jobId: string, userId: string) {
  return prisma.generationJob.findFirst({
    where: {
      id: jobId,
      project: { createdBy: userId },
    },
  });
}

export interface CreateAudioJobInput {
  userId: string;
  projectId: string;
  kind: "voiceover" | "music";
  prompt: string;
  duration: number;
  voice?: string | null;
  style?: string | null;
  provider?: string | AudioGenerationProvider;
}

export interface CreateAudioJobResult {
  job: AudioJobResponse;
  creditsConsumed: number;
  remainingBalance: number;
}

/**
 * Charges credits up front and runs an audio generation, driving the persisted
 * job through `queued → processing → completed | failed`, storing the rendered
 * files to S3 (or inline as data URIs when storage is down), and creating an
 * audio `Asset`. Audio is project-level (not scene-level), so no scene or
 * storyboard is updated.
 */
export async function createAudioGenerationJob(
  input: CreateAudioJobInput,
): Promise<CreateAudioJobResult> {
  const {
    userId,
    projectId,
    kind,
    prompt,
    duration,
    voice,
    style,
    provider: providerInput,
  } = input;

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, teamId: true, createdBy: true, name: true },
  });
  if (!project || project.createdBy !== userId) {
    throw new AudioProjectNotFoundError();
  }

  const provider =
    typeof providerInput === "string"
      ? getAudioProvider(providerInput)
      : (providerInput ?? getAudioProvider());

  const cost = costFor(kind);
  const remainingBalance = await spendCredits({
    userId,
    amount: cost,
    description: `Audio generation (${kind}) for project ${project.name ?? projectId}`,
  });

  const job = await prisma.generationJob.create({
    data: {
      projectId: project.id,
      jobType: jobTypeFor(kind),
      provider: provider.name,
      status: "queued",
      creditsConsumed: cost,
      inputParams: {
        kind,
        prompt,
        duration,
        voice: voice ?? null,
        style: style ?? null,
      } as unknown as Prisma.InputJsonValue,
    },
  });

  await prisma.generationJob.update({
    where: { id: job.id },
    data: { status: "processing", startedAt: new Date() },
  });

  let result: Awaited<ReturnType<AudioGenerationProvider["generate"]>>;
  try {
    result = await provider.generate({
      prompt,
      kind,
      duration,
      voice: voice ?? null,
      style: style ?? null,
      projectName: project.name ?? null,
    });
  } catch (error) {
    await markAudioJobFailed({ jobId: job.id, error });
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
      name: `${kind === "voiceover" ? "Voiceover" : "Music"} — ${project.name ?? projectId}`,
      type: "audio",
      mimeType: primary?.mimeType ?? result.files[0].contentType,
      sizeBytes: primary?.sizeBytes ?? null,
      url: primary?.url ?? "",
      duration: result.duration,
      width: null,
      height: null,
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
      type: "audio",
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
