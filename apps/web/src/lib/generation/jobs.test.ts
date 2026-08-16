import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  SceneNotFoundError,
  completeVideoGenerationJob,
  createVideoGenerationJob,
  getVideoJobForUser,
  toJobResponse,
} from "./jobs";
import {
  VideoProviderUnavailableError,
  type AsyncVideoGenerationProvider,
  type VideoGenerationProvider,
} from "./providers";
import { InsufficientCreditsError } from "@/lib/credits";
import { storeGeneratedFiles } from "./storage";

interface UpdateArgs {
  where: { id: string };
  data: Record<string, unknown>;
}

interface SeedScene {
  id: string;
  storyboardId: string;
  orderIndex: number;
  duration: number;
  prompt: string;
  negativePrompt: string | null;
  aspectRatio: string;
  storyboard: {
    id: string;
    projectId: string;
    name: string;
    project: { id: string; name: string; teamId: string; createdBy: string };
  };
}

/** In-memory fake of `@/lib/db/prisma` for the generation state machine. */
const db = vi.hoisted(() => {
  const seedScene: SeedScene = {
    id: "scene-1",
    storyboardId: "sb-1",
    orderIndex: 2,
    duration: 4,
    prompt: "A bold product close-up",
    negativePrompt: null,
    aspectRatio: "9:16",
    storyboard: {
      id: "sb-1",
      projectId: "project-1",
      name: "Summer launch",
      project: {
        id: "project-1",
        name: "Acme",
        teamId: "team-1",
        createdBy: "user-1",
      },
    },
  };

  return {
    scene: {
      findFirst: vi.fn(async (): Promise<SeedScene | null> => seedScene),
      update: vi.fn(async ({ where, data }: UpdateArgs) => ({
        id: where.id,
        ...data,
      })),
      count: vi.fn(async () => 0),
    },
    storyboard: {
      update: vi.fn(async ({ where, data }: UpdateArgs) => ({
        id: where.id,
        ...data,
      })),
    },
    generationJob: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "job-1",
        ...data,
      })),
      update: vi.fn(async ({ where, data }: UpdateArgs) => ({
        id: where.id,
        ...data,
      })),
      findFirst: vi.fn(async () => ({
        id: "job-1",
        status: "queued",
        creditsConsumed: 10,
        outputAssets: [],
        errorMessage: null,
      })),
      findUniqueOrThrow: vi.fn(async () => ({
        id: "job-1",
        status: "completed",
        creditsConsumed: 10,
        outputAssets: [{ id: "asset-1" }],
        errorMessage: null,
      })),
    },
    asset: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: "asset-1",
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
  spendCredits: vi.fn(async () => 90),
}));

vi.mock("@/lib/credits", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/credits")>();
  return { ...actual, spendCredits: creditsMock.spendCredits };
});

const storageMock = vi.hoisted(() => ({
  storeGeneratedFiles: vi.fn(async () => [
    {
      url: "https://cdn.example/preview.svg",
      mimeType: "image/svg+xml",
      sizeBytes: 42,
      inline: false,
    },
  ]),
}));

vi.mock("@/lib/generation/storage", () => ({
  storeGeneratedFiles: storageMock.storeGeneratedFiles,
}));

const stubProvider: VideoGenerationProvider = {
  name: "mock",
  generate: vi.fn(async () => ({
    provider: "mock",
    providerJobId: "mock_render_abc",
    width: 1080,
    height: 1920,
    duration: 4,
    files: [
      {
        filename: "mock-render.svg",
        contentType: "image/svg+xml",
        body: Buffer.from("<svg/>"),
      },
    ],
    metadata: { mock: true },
  })),
};

const opts = { userId: "user-1", sceneId: "scene-1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("MOCK_RENDER_DELAY_MS", "0");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("createVideoGenerationJob", () => {
  it("runs a scene through the full pipeline and completes it", async () => {
    const result = await createVideoGenerationJob({
      ...opts,
      provider: "mock",
    });

    expect(creditsMock.spendCredits).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "user-1", amount: 10 }),
    );
    expect(db.generationJob.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ jobType: "video", status: "queued" }),
      }),
    );
    // The job was marked processing before it completed.
    expect(db.generationJob.update.mock.calls[0]?.[0]?.data.status).toBe(
      "processing",
    );
    expect(result.job.status).toBe("completed");
    expect(result.creditsConsumed).toBe(10);
    expect(result.remainingBalance).toBe(90);
    expect(storeGeneratedFiles).toHaveBeenCalledWith(
      expect.objectContaining({ teamId: "team-1" }),
    );
    expect(db.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          teamId: "team-1",
          projectId: "project-1",
          type: "video",
          createdBy: "user-1",
        }),
      }),
    );
    expect(db.scene.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          generatedVideoId: "asset-1",
        }),
      }),
    );
    // No incomplete scenes left → storyboard finished.
    expect(db.storyboard.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "completed" }),
      }),
    );
  });

  it("keeps the storyboard in generating state when other scenes remain", async () => {
    db.scene.count.mockResolvedValueOnce(3);

    await createVideoGenerationJob({ ...opts, provider: stubProvider });

    expect(db.storyboard.update).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "generating" }),
      }),
    );
  });

  it("rejects the job up front when credits are insufficient", async () => {
    creditsMock.spendCredits.mockRejectedValueOnce(
      new InsufficientCreditsError(3, 10),
    );

    await expect(
      createVideoGenerationJob({ ...opts, provider: "mock" }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);

    expect(db.generationJob.create).not.toHaveBeenCalled();
    expect(db.scene.update).not.toHaveBeenCalled();
  });

  it("throws SceneNotFoundError for scenes the user does not own", async () => {
    db.scene.findFirst.mockResolvedValueOnce(null);

    await expect(
      createVideoGenerationJob({ ...opts, provider: "mock" }),
    ).rejects.toBeInstanceOf(SceneNotFoundError);

    expect(creditsMock.spendCredits).not.toHaveBeenCalled();
  });

  it("rejects unregistered provider names without charging credits", async () => {
    await expect(
      createVideoGenerationJob({ ...opts, provider: "runway" }),
    ).rejects.toBeInstanceOf(VideoProviderUnavailableError);

    expect(creditsMock.spendCredits).not.toHaveBeenCalled();
  });

  it("marks the job and scene failed when the provider errors", async () => {
    const failingProvider: VideoGenerationProvider = {
      name: "mock",
      generate: vi.fn(async () => {
        throw new Error("render boom");
      }),
    };

    await expect(
      createVideoGenerationJob({ ...opts, provider: failingProvider }),
    ).rejects.toThrow("render boom");

    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "failed",
          errorMessage: "render boom",
        }),
      }),
    );
    expect(db.scene.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
    expect(db.storyboard.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: "failed" }),
      }),
    );
  });
});

describe("getVideoJobForUser", () => {
  it("loads a job scoped to the current user", async () => {
    const job = await getVideoJobForUser("job-1", "user-1");

    expect(db.generationJob.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "job-1", project: { createdBy: "user-1" } },
      }),
    );
    expect(job?.id).toBe("job-1");
  });
});

describe("toJobResponse", () => {
  it("maps a persisted job to the client-facing shape", () => {
    expect(
      toJobResponse({
        id: "job-9",
        status: "completed",
        creditsConsumed: 10,
        outputAssets: [{ id: "asset-9" }],
        errorMessage: null,
      }),
    ).toEqual({
      jobId: "job-9",
      status: "completed",
      creditsConsumed: 10,
      outputAssets: [{ id: "asset-9" }],
      errorMessage: undefined,
    });
  });
});

describe("Async (two-phase) video jobs", () => {
  const asyncResult = {
    provider: "mock-async",
    providerJobId: "external-123",
    width: 1920,
    height: 1080,
    duration: 4,
    files: [
      {
        filename: "clip.svg",
        contentType: "image/svg+xml",
        body: Buffer.from("<svg/>"),
      },
    ],
    metadata: { mock: true },
  };

  const asyncProvider: AsyncVideoGenerationProvider = {
    name: "mock-async",
    generate: vi.fn(async () => {
      throw new Error("async providers do not implement generate");
    }),
    submit: vi.fn(async () => ({ providerJobId: "external-123" })),
    retrieve: vi.fn(async () => ({
      status: "succeeded" as const,
      result: asyncResult,
    })),
  };

  it("submits an async job and returns it processing instead of completing", async () => {
    db.generationJob.findUniqueOrThrow.mockResolvedValueOnce({
      id: "job-1",
      providerJobId: "external-123",
      status: "processing",
      creditsConsumed: 10,
      outputAssets: [],
      errorMessage: null,
    } as never);

    const result = await createVideoGenerationJob({
      ...opts,
      provider: asyncProvider,
    });

    expect(asyncProvider.submit).toHaveBeenCalledTimes(1);
    expect(db.generationJob.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ providerJobId: "external-123" }),
      }),
    );
    // The synchronous finalize path must not run for async providers.
    expect(db.asset.create).not.toHaveBeenCalled();
    expect(result.job.status).toBe("processing");
  });

  it("advances a processing async job to completed on poll", async () => {
    vi.stubEnv("MOCK_ASYNC_LATENCY_MS", "0");
    db.generationJob.findFirst.mockResolvedValueOnce({
      id: "job-1",
      provider: "mock-async",
      providerJobId: "mock_async_abc_1000",
      sceneId: "scene-1",
      status: "processing",
      creditsConsumed: 10,
      outputAssets: [],
      errorMessage: null,
    } as never);

    const result = await completeVideoGenerationJob({
      jobId: "job-1",
      userId: "user-1",
    });

    expect(result.status).toBe("completed");
    expect(db.asset.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ teamId: "team-1", type: "video" }),
      }),
    );
    expect(db.scene.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "completed",
          generatedVideoId: "asset-1",
        }),
      }),
    );
  });

  it("leaves a sync-provider processing job unchanged", async () => {
    db.generationJob.findFirst.mockResolvedValueOnce({
      id: "job-1",
      provider: "mock",
      providerJobId: "x",
      sceneId: "scene-1",
      status: "processing",
      creditsConsumed: 10,
      outputAssets: [],
      errorMessage: null,
    } as never);

    const result = await completeVideoGenerationJob({
      jobId: "job-1",
      userId: "user-1",
    });

    expect(result.status).toBe("processing");
    expect(db.asset.create).not.toHaveBeenCalled();
  });

  it("throws when the job is missing or not owned", async () => {
    db.generationJob.findFirst.mockResolvedValueOnce(null as never);

    await expect(
      completeVideoGenerationJob({ jobId: "missing", userId: "user-1" }),
    ).rejects.toBeTruthy();
  });
});
