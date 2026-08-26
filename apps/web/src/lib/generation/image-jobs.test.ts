import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ImageProjectNotFoundError,
  type CreateImageJobInput,
  type PersistedImageJob,
  advanceImageJob,
  createImageGenerationJob,
  getImageJobForUser,
  toImageJobResponse,
} from "./image-jobs";
import { ImageProviderUnavailableError, type ImageGenerationParams, type ImageGenerationProvider } from "./image-providers";
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

interface ImageResult {
  provider: string;
  providerJobId: string;
  width: number;
  height: number;
  files: { filename: string; contentType: string; body: Buffer }[];
  metadata: Record<string, unknown>;
}

/** In-memory fake of `@/lib/db/prisma` mirroring the image job surface. */
const db = vi.hoisted(() => {
  const seedProject = {
    id: "project-1",
    teamId: "team-1",
    createdBy: "user-1",
    name: "Acme — Summer Launch",
  };
  const seedJob = {
    id: "job-i1",
    status: "queued",
    creditsConsumed: 1,
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
        id: "job-i1",
        ...data,
      })),
      update: vi.fn(async ({ where, data }: UpdateArgs) => ({
        id: where.id,
        ...data,
      })),
      findFirst: vi.fn(async () => seedJob),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "job-i1",
        status: "completed",
        creditsConsumed: 1,
        outputAssets: [{ id: "asset-i1", url: "https://cdn/x.png" }],
        errorMessage: null,
      })),
    },
    asset: {
      create: vi.fn(async ({ data }: AssetCreateArgs) => ({
        id: "asset-i1",
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
      url: "https://cdn.example/preview.png",
      mimeType: "image/png",
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
  generate: vi.fn(async (): Promise<ImageResult> => ({
    provider: "mock",
    providerJobId: "mock_image_abc",
    width: 1920,
    height: 1080,
    files: [
      {
        filename: "mock.svg",
        contentType: "image/svg+xml",
        body: Buffer.from("<svg xmlns='x'></svg>"),
      },
    ],
    metadata: { mock: true, format: "svg-postcard" },
  })),
};

const baseInput: CreateImageJobInput = {
  userId: "user-1",
  projectId: "project-1",
  prompt: "a dramatic eagle over mountains",
  aspectRatio: "16:9",
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MOCK_IMAGE_DELAY_MS", "0");
});

afterEach(() => {
  vi.unstubAllEnvs();
});
describe("createImageGenerationJob", () => {
  it("runs an image through the full pipeline and completes it", async () => {
    const result = await createImageGenerationJob({
      ...baseInput,
      provider: stubProvider,
    });

    expect(creditsMock.spendCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", amount: 1 }),
    );
    expect(db.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          jobType: "image",
          status: "queued",
          provider: "mock",
          creditsConsumed: 1,
        }),
      }),
    );
    // Processing state was set before completion.
    expect(db.generationJob.update.mock.calls[0]?.[0]?.data.status).toBe(
      "processing",
    );
    expect(result.job.status).toBe("completed");
    expect(result.creditsConsumed).toBe(1);
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
          type: "image",
          createdBy: "user-1",
          width: 1920,
          height: 1080,
          duration: null,
        }),
      }),
    );
    // Job completed with the provider id and asset list from storage.
    expect(db.generationJob.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          providerJobId: "mock_image_abc",
          outputAssets: [
            expect.objectContaining({
              id: "asset-i1",
              url: "https://cdn.example/preview.png",
            }),
          ],
        }),
      }),
    );
  });

  it("writes the aspect ratio into the persisted input params", async () => {
    await createImageGenerationJob({
      ...baseInput,
      aspectRatio: "9:16",
      provider: stubProvider,
    });

    expect(db.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          inputParams: expect.objectContaining({ aspectRatio: "9:16" }),
        }),
      }),
    );
  });

  it("enriches the provider prompt with the project's Brand DNA", async () => {
    db.project.findUnique.mockResolvedValueOnce({
      id: "project-branded",
      teamId: "team-1",
      createdBy: "user-1",
      name: "Branded Co",
      brandDna: {
        id: "bd-img-1",
        name: "Branded Co",
        visualIdentity: {
          colors: {
            primary: ["#0B3C2D"],
            secondary: ["#D4A24E"],
            forbidden: ["#FF0000"],
          },
          typography: { headingFont: "Bebas Neue", bodyFont: "Inter", minSizePx: 16 },
          logo: { variants: [], placementRules: "top_left", minSizePercent: 12 },
        },
        voiceTone: {
          voice: {
            adjectives: ["energetic"],
            forbiddenWords: ["cheap"],
            sentenceStructure: "short_punchy",
          },
          characters: {},
        },
        complianceRules: {
          compliance: {
            requiredDisclaimers: [],
            industry: "health",
            regionalRules: {},
          },
        },
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
      },
    } as never);

    const generateMock = vi.fn<ImageGenerationProvider["generate"]>(
      async () => ({
        provider: "mock-branded",
        providerJobId: "branded-image-1",
        width: 1920,
        height: 1080,
        files: [
          {
            filename: "branded.svg",
            contentType: "image/svg+xml",
            body: Buffer.from("<svg/>"),
          },
        ],
        metadata: {},
      }),
    );
    const brandProvider = { name: "mock-branded", generate: generateMock };

    await createImageGenerationJob({
      ...baseInput,
      projectId: "project-branded",
      provider: brandProvider,
    });

    const captured = generateMock.mock.calls[0]?.[0] as ImageGenerationParams;
    expect(captured.prompt).toContain("Brand style:");
    expect(captured.prompt).toContain("brand colors #0B3C2D");
    expect(captured.prompt).toContain("heading font Bebas Neue");
    // Image generation has no separate negative field, so avoidance rules are
    // folded directly into the prompt.
    expect(captured.prompt).toContain("avoid colors #FF0000");
    expect(captured.prompt).toContain('avoid words "cheap"');

    // The audit trail stored on the job reflects the enriched render request.
    const createCall = db.generationJob.create.mock
      .calls[0]?.[0] as { data: { inputParams: Record<string, unknown> } };
    expect(createCall.data.inputParams.prompt).toContain("Brand style:");
  });

  it("rejects up front when credits are insufficient", async () => {
    creditsMock.spendCredits.mockRejectedValueOnce(
      new InsufficientCreditsError(0, 1),
    );

    await expect(
      createImageGenerationJob({ ...baseInput, provider: stubProvider }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    expect(db.generationJob.create).not.toHaveBeenCalled();
    expect(db.asset.create).not.toHaveBeenCalled();
    expect(stubProvider.generate).not.toHaveBeenCalled();
  });

  it("rejects unregistered provider names without charging credits", async () => {
    await expect(
      createImageGenerationJob({ ...baseInput, provider: "dall-e" }),
    ).rejects.toBeInstanceOf(ImageProviderUnavailableError);

    expect(creditsMock.spendCredits).not.toHaveBeenCalled();
    expect(db.generationJob.create).not.toHaveBeenCalled();
  });

  it("throws ImageProjectNotFoundError for projects the user does not own", async () => {
    db.project.findUnique.mockResolvedValueOnce(null);

    await expect(
      createImageGenerationJob({ ...baseInput, provider: stubProvider }),
    ).rejects.toBeInstanceOf(ImageProjectNotFoundError);

    expect(creditsMock.spendCredits).not.toHaveBeenCalled();
  });

  it("marks the job failed when the provider errors", async () => {
    const failingProvider = {
      name: "mock",
      generate: vi.fn(async () => {
        throw new Error("image service unavailable");
      }),
    };

    await expect(
      createImageGenerationJob({ ...baseInput, provider: failingProvider }),
    ).rejects.toThrow("image service unavailable");

    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-i1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "image service unavailable",
        }),
      }),
    );
    expect(db.asset.create).not.toHaveBeenCalled();
  });
});

describe("getImageJobForUser", () => {
  it("loads a job scoped to the current user via the project owner", async () => {
    await getImageJobForUser("job-i1", "user-1");

    expect(db.generationJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-i1", project: { createdBy: "user-1" } },
      }),
    );
  });
});

describe("toImageJobResponse", () => {
  it("maps a persisted job to the client-facing shape", () => {
    expect(
      toImageJobResponse({
        id: "job-9",
        status: "completed",
        creditsConsumed: 1,
        outputAssets: [{ id: "asset-9", url: "https://x/y.png" }],
        errorMessage: null,
      }),
    ).toEqual({
      jobId: "job-9",
      status: "completed",
      creditsConsumed: 1,
      outputAssets: [{ id: "asset-9", url: "https://x/y.png" }],
      errorMessage: undefined,
    });
  });
});
describe("async (two-phase) image providers", () => {
  const asyncResult: ImageResult = {
    provider: "flux",
    providerJobId: "flux-gen-1",
    width: 1080,
    height: 1080,
    files: [
      {
        filename: "flux-abc.png",
        contentType: "image/png",
        body: Buffer.from(new Uint8Array([1, 2, 3])),
      },
    ],
    metadata: { provider: "flux", model: "flux" },
  };

  const asyncProvider = {
    name: "flux",
    generate: vi.fn(async () => {
      throw new Error("async image providers do not implement generate");
    }),
    submit: vi.fn(async () => ({ providerJobId: "flux-gen-1" })),
    retrieve: vi.fn(async () => ({
      status: "succeeded" as const,
      result: asyncResult,
    })),
  };

  it("submits an async job and returns it processing instead of completing", async () => {
    db.generationJob.findUniqueOrThrow.mockResolvedValueOnce({
      id: "job-i1",
      providerJobId: "flux-gen-1",
      status: "processing",
      creditsConsumed: 1,
      outputAssets: [],
      errorMessage: null,
    } as never);

    const result = await createImageGenerationJob({
      ...baseInput,
      provider: asyncProvider,
    });

    expect(asyncProvider.submit).toHaveBeenCalledTimes(1);
    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-i1" },
        data: expect.objectContaining({ providerJobId: "flux-gen-1" }),
      }),
    );
    // The synchronous finalize path must not run for async providers.
    expect(db.asset.create).not.toHaveBeenCalled();
    expect(result.job.status).toBe("processing");
  });

  it("marks the job failed when async submit errors", async () => {
    const failing = {
      ...asyncProvider,
      submit: vi.fn(async () => {
        throw new Error("flux gateway down");
      }),
    };

    await expect(
      createImageGenerationJob({
        ...baseInput,
        provider: failing,
      }),
    ).rejects.toThrow("flux gateway down");

    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-i1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "flux gateway down",
        }),
      }),
    );
    expect(db.asset.create).not.toHaveBeenCalled();
  });
});
describe("advanceImageJob", () => {
  const runningJob: PersistedImageJob = {
    id: "job-i1",
    projectId: "project-1",
    provider: "flux",
    providerJobId: "flux-gen-1",
    status: "processing",
    creditsConsumed: 1,
    outputAssets: [],
    errorMessage: null,
    inputParams: {
      prompt: "a red fox in snow",
      aspectRatio: "1:1",
      style: "cinematic",
    },
  };

  const asyncResult: ImageResult = {
    provider: "flux",
    providerJobId: "flux-gen-1",
    width: 1080,
    height: 1080,
    files: [
      {
        filename: "flux-abc.png",
        contentType: "image/png",
        body: Buffer.from(new Uint8Array([1, 2, 3])),
      },
    ],
    metadata: { provider: "flux", model: "flux" },
  };

  const asyncProvider = {
    name: "flux",
    generate: vi.fn(async () => {
      throw new Error("async image providers do not implement generate");
    }),
    submit: vi.fn(async () => ({ providerJobId: "flux-gen-1" })),
    retrieve: vi.fn(async () => ({
      status: "succeeded" as const,
      result: asyncResult,
    })),
  };

  it("keeps a processing job in flight", async () => {
    const idleProvider = {
      ...asyncProvider,
      retrieve: vi.fn(async () => ({ status: "processing" as const })),
    };

    const result = await advanceImageJob(runningJob, {
      userId: "user-1",
      providerOverride: idleProvider,
    });

    expect(result.status).toBe("processing");
    expect(idleProvider.retrieve).toHaveBeenCalledWith(
      "flux-gen-1",
      expect.objectContaining({
        prompt: "a red fox in snow",
        aspectRatio: "1:1",
      }),
    );
    expect(db.asset.create).not.toHaveBeenCalled();
  });

  it("marks the job failed when the provider reports failure", async () => {
    const failedProvider = {
      ...asyncProvider,
      retrieve: vi.fn(async () => ({
        status: "failed" as const,
        error: "generation canceled",
      })),
    };

    const result = await advanceImageJob(runningJob, {
      userId: "user-1",
      providerOverride: failedProvider,
    });

    expect(result.status).toBe("failed");
    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-i1" },
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "generation canceled",
        }),
      }),
    );
    expect(db.asset.create).not.toHaveBeenCalled();
  });

  it("completes the job by storing files and creating the asset", async () => {
    const result = await advanceImageJob(runningJob, {
      userId: "user-1",
      providerOverride: asyncProvider,
    });

    expect(asyncProvider.retrieve).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("completed");
    expect(db.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: "team-1",
          projectId: "project-1",
          type: "image",
          width: 1080,
          height: 1080,
          createdBy: "user-1",
        }),
      }),
    );
    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-i1" },
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("leaves a sync-provider processing job unchanged", async () => {
    const result = await advanceImageJob(
      {
        ...runningJob,
        provider: "mock",
      },
      { userId: "user-1", providerOverride: stubProvider },
    );

    expect(result.status).toBe("processing");
    expect(db.asset.create).not.toHaveBeenCalled();
  });

  it("returns terminal jobs without calling the provider", async () => {
    const result = await advanceImageJob(
      {
        ...runningJob,
        status: "queued",
        providerJobId: null,
      },
      { userId: "user-1", providerOverride: asyncProvider },
    );

    expect(result.status).toBe("queued");
    expect(asyncProvider.retrieve).not.toHaveBeenCalled();
  });
});