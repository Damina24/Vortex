import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AudioProjectNotFoundError,
  type CreateAudioJobInput,
  createAudioGenerationJob,
  getAudioJobForUser,
  toAudioJobResponse,
} from "./audio-jobs";
import { AudioProviderUnavailableError } from "./audio-providers";
import { InsufficientCreditsError } from "@/lib/credits";

interface UpdateArgs {
  where: { id: string };
  data: Record<string, unknown>;
}

interface ProjectFindArgs {
  where: { id: string };
  select: Record<string, unknown>;
}

interface JobCreateArgs {
  data: Record<string, unknown>;
}

interface AssetCreateArgs {
  data: Record<string, unknown>;
}

interface AudioResult {
  provider: string;
  providerJobId: string;
  duration: number;
  files: { filename: string; contentType: string; body: Buffer }[];
  metadata: Record<string, unknown>;
}

/** In-memory fake of `@/lib/db/prisma` mirroring the audio job surface. */
const db = vi.hoisted(() => {
  const seedProject = {
    id: "project-1",
    teamId: "team-1",
    createdBy: "user-1",
    name: "Acme — Summer Launch",
  };
  const seedJob = {
    id: "job-a1",
    status: "queued",
    creditsConsumed: 5,
    outputAssets: [],
    errorMessage: null,
  };

  return {
    project: {
      findUnique: vi.fn(async ({ where }: ProjectFindArgs) =>
        where.id === seedProject.id ? seedProject : null,
      ),
    },
    generationJob: {
      create: vi.fn(async ({ data }: JobCreateArgs) => ({
        id: "job-a1",
        ...data,
      })),
      update: vi.fn(async ({ where, data }: UpdateArgs) => ({
        id: where.id,
        ...data,
      })),
      findFirst: vi.fn(async () => seedJob),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "job-a1",
        status: "completed",
        creditsConsumed: 5,
        outputAssets: [{ id: "asset-a1", url: "https://cdn/x.wav" }],
        errorMessage: null,
      })),
    },
    asset: {
      create: vi.fn(async ({ data }: AssetCreateArgs) => ({
        id: "asset-a1",
        ...data,
      })),
    },
  };
});

vi.mock("@/lib/db/prisma", () => ({
  default: db,
  prisma: db,
}));

const creditsMock = vi.hoisted(() => ({
  spendCredits: vi.fn(async () => 95),
}));

vi.mock("@/lib/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits")>();
  return { ...actual, spendCredits: creditsMock.spendCredits };
});

const storageMock = vi.hoisted(() => ({
  storeGeneratedFiles: vi.fn(async () => [
    {
      url: "https://cdn.example/preview.wav",
      mimeType: "audio/wav",
      sizeBytes: 4200,
      inline: false,
    },
  ]),
}));

vi.mock("@/lib/generation/storage", () => ({
  storeGeneratedFiles: storageMock.storeGeneratedFiles,
}));

const stubProvider = {
  name: "mock",
  generate: vi.fn(async (): Promise<AudioResult> => ({
    provider: "mock",
    providerJobId: "mock_voiceover_abc",
    duration: 4,
    files: [
      {
        filename: "mock.wav",
        contentType: "audio/wav",
        body: Buffer.from(new Uint8Array(44 + 10)),
      },
    ],
    metadata: { mock: true, kind: "voiceover" },
  })),
};

const baseInput: CreateAudioJobInput = {
  userId: "user-1",
  projectId: "project-1",
  kind: "voiceover",
  prompt: "warm product narration",
  duration: 4,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MOCK_AUDIO_DELAY_MS", "0");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createAudioGenerationJob", () => {
  it("runs a voiceover through the full pipeline and completes it", async () => {
    const result = await createAudioGenerationJob({
      ...baseInput,
      provider: stubProvider,
    });

    expect(creditsMock.spendCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", amount: 5 }),
    );
    expect(db.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "voice",
          status: "queued",
          provider: "mock",
          creditsConsumed: 5,
        }),
      }),
    );
    // Processing state was set before completion.
    expect(db.generationJob.update.mock.calls[0]?.[0]?.data.status).toBe(
      "processing",
    );
    expect(result.job.status).toBe("completed");
    expect(result.creditsConsumed).toBe(5);
    expect(result.remainingBalance).toBe(95);

    expect(stubProvider.generate).toHaveBeenCalled();
    expect(storageMock.storeGeneratedFiles).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "team-1" }),
    );
    expect(db.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: "team-1",
          projectId: "project-1",
          type: "audio",
          createdBy: "user-1",
          duration: 4,
        }),
      }),
    );
    // Job completed with the provider id and asset list from storage.
    expect(db.generationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          providerJobId: "mock_voiceover_abc",
          outputAssets: [
            expect.objectContaining({
              id: "asset-a1",
              url: "https://cdn.example/preview.wav",
            }),
          ],
        }),
      }),
    );
  });

  it("charges the music cost and writes jobType music for music kind", async () => {
    await createAudioGenerationJob({
      ...baseInput,
      kind: "music",
      provider: stubProvider,
    });

    expect(creditsMock.spendCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", amount: 8 }),
    );
    expect(db.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobType: "music" }),
      }),
    );
  });

  it("rejects up front when credits are insufficient", async () => {
    creditsMock.spendCredits.mockRejectedValueOnce(
      new InsufficientCreditsError(3, 5),
    );

    await expect(
      createAudioGenerationJob({ ...baseInput, provider: stubProvider }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    expect(db.generationJob.create).not.toHaveBeenCalled();
    expect(db.asset.create).not.toHaveBeenCalled();
    expect(stubProvider.generate).not.toHaveBeenCalled();
  });

  it("rejects unregistered provider names without charging credits", async () => {
    await expect(
      createAudioGenerationJob({ ...baseInput, provider: "eleven" }),
    ).rejects.toBeInstanceOf(AudioProviderUnavailableError);

    expect(creditsMock.spendCredits).not.toHaveBeenCalled();
    expect(db.generationJob.create).not.toHaveBeenCalled();
  });

  it("throws AudioProjectNotFoundError for projects the user does not own", async () => {
    db.project.findUnique.mockResolvedValueOnce(null);

    await expect(
      createAudioGenerationJob({ ...baseInput, provider: stubProvider }),
    ).rejects.toBeInstanceOf(AudioProjectNotFoundError);

    expect(creditsMock.spendCredits).not.toHaveBeenCalled();
  });

  it("marks the job failed when the provider errors", async () => {
    const failingProvider = {
      name: "mock",
      generate: vi.fn(async () => {
        throw new Error("tts unavailable");
      }),
    };

    await expect(
      createAudioGenerationJob({ ...baseInput, provider: failingProvider }),
    ).rejects.toThrow("tts unavailable");

    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-a1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "tts unavailable",
        }),
      }),
    );
    expect(db.asset.create).not.toHaveBeenCalled();
  });
});

describe("getAudioJobForUser", () => {
  it("loads a job scoped to the current user via the project owner", async () => {
    await getAudioJobForUser("job-a1", "user-1");

    expect(db.generationJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-a1", project: { createdBy: "user-1" } },
      }),
    );
  });
});

describe("toAudioJobResponse", () => {
  it("maps a persisted job to the client-facing shape", () => {
    expect(
      toAudioJobResponse({
        id: "job-9",
        status: "completed",
        creditsConsumed: 5,
        outputAssets: [{ id: "asset-9", url: "https://x/y.wav" }],
        errorMessage: null,
      }),
    ).toEqual({
      jobId: "job-9",
      status: "completed",
      creditsConsumed: 5,
      outputAssets: [{ id: "asset-9", url: "https://x/y.wav" }],
      errorMessage: undefined,
    });
  });
});
