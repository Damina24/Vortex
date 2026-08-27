import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FluxImageProvider,
  ImageProviderUnavailableError,
  MockImageProvider,
  OpenAIImageProvider,
  StabilityImageProvider,
  getImageProvider,
  getImageProviderAvailability,
  isAsyncImageProvider,
} from "./image-providers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("MockImageProvider", () => {
  it("returns a deterministic SVG poster with the mapped dimensions", async () => {
    vi.stubEnv("MOCK_IMAGE_DELAY_MS", "0");
    const provider = new MockImageProvider();

    const result = await provider.generate({
      prompt: "a dramatic eagle flying over mountains",
      aspectRatio: "9:16",
      style: null,
      projectName: "Acme — Summer Launch",
    });

    expect(result.provider).toBe("mock");
    expect(result.providerJobId).toMatch(/^mock_image_[a-f0-9]{12}$/);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1920);

    const file = result.files[0];
    expect(file.contentType).toBe("image/svg+xml");
    expect(file.filename).toMatch(/^mock-image-[a-f0-9]{8}\.svg$/);
    expect(Buffer.isBuffer(file.body)).toBe(true);
    expect(file.body.toString("utf8")).toContain("<svg xmlns=");
    expect(result.metadata).toMatchObject({
      mock: true,
      format: "svg-postcard",
      aspectRatio: "9:16",
    });
  });

  it("maps common aspect ratios to width/height dimensions", async () => {
    vi.stubEnv("MOCK_IMAGE_DELAY_MS", "0");
    const provider = new MockImageProvider();

    const landscape = await provider.generate({
      prompt: "x",
      aspectRatio: "16:9",
      style: null,
      projectName: null,
    });
    expect(landscape.width).toBe(1920);
    expect(landscape.height).toBe(1080);

    const square = await provider.generate({
      prompt: "x",
      aspectRatio: "1:1",
      style: null,
      projectName: null,
    });
    expect(square.width).toBe(1080);
    expect(square.height).toBe(1080);

    const portrait = await provider.generate({
      prompt: "x",
      aspectRatio: "4:5",
      style: null,
      projectName: null,
    });
    expect(portrait.width).toBe(1080);
    expect(portrait.height).toBe(1350);
  });

  it("falls back to a safe default for unknown aspect ratios", async () => {
    vi.stubEnv("MOCK_IMAGE_DELAY_MS", "0");
    const provider = new MockImageProvider();

    const result = await provider.generate({
      prompt: "x",
      aspectRatio: "21:9",
      style: null,
      projectName: null,
    });
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
  });

  it("is deterministic for identical prompts", async () => {
    const provider = new MockImageProvider();
    const args = {
      prompt: "the same scene",
      aspectRatio: "16:9" as const,
      style: "cinematic" as string | null,
      projectName: null as string | null,
    };

    const [first, second] = await Promise.all([
      provider.generate(args),
      provider.generate(args),
    ]);

    expect(first.files[0].body).toEqual(second.files[0].body);
    expect(first.providerJobId).toBe(second.providerJobId);
  });

  it("honors MOCK_IMAGE_DELAY_MS before resolving", async () => {
    vi.stubEnv("MOCK_IMAGE_DELAY_MS", "50");
    const provider = new MockImageProvider();
    const start = Date.now();
    await provider.generate({
      prompt: "p",
      aspectRatio: "1:1",
      style: null,
      projectName: null,
    });
    expect(Date.now() - start).toBeGreaterThanOrEqual(45);
  });
});

describe("getImageProvider", () => {
  it("resolves the mock provider by default", () => {
    expect(getImageProvider().name).toBe("mock");
  });

  it("resolves providers by name", () => {
    expect(getImageProvider("mock").name).toBe("mock");
    expect(getImageProvider("stability").name).toBe("stability");
    expect(getImageProvider("flux").name).toBe("flux");
    expect(getImageProvider("gpt-image").name).toBe("gpt-image");
  });

  it("falls back to the default provider for empty names", () => {
    expect(getImageProvider("").name).toBe("mock");
    expect(getImageProvider(null).name).toBe("mock");
  });

  it("honors the IMAGE_PROVIDER env var for the default", () => {
    vi.stubEnv("IMAGE_PROVIDER", "flux");
    expect(getImageProvider().name).toBe("flux");
  });

  it("throws ImageProviderUnavailableError for unregistered providers", () => {
    expect(() => getImageProvider("dall-e")).toThrowError(
      ImageProviderUnavailableError,
    );
    expect(() => getImageProvider("dall-e")).toThrowError(
      /Image generation provider "dall-e"/,
    );
  });
});

describe("isAsyncImageProvider", () => {
  it("is true only for two-phase (submit/poll/complete) providers", () => {
    // FLUX runs async: submit() then retrieve().
    expect(isAsyncImageProvider(new FluxImageProvider())).toBe(true);
    // Mock, Stability, and OpenAI are synchronous one-shot providers.
    expect(isAsyncImageProvider(new MockImageProvider())).toBe(false);
    expect(isAsyncImageProvider(new StabilityImageProvider())).toBe(false);
    expect(isAsyncImageProvider(new OpenAIImageProvider())).toBe(false);
  });
});

describe("FluxImageProvider", () => {
  it("is two-phase, so generate() is unsupported", async () => {
    const provider = new FluxImageProvider({ apiKey: "k" });
    await expect(
      provider.generate({ prompt: "x", aspectRatio: "16:9" }),
    ).rejects.toThrowError(/two-phase: use submit\(\) then retrieve\(\)/);
  });

  it("throws when FLUX_API_KEY is missing", async () => {
    vi.stubEnv("FLUX_API_KEY", "");
    const provider = new FluxImageProvider();
    await expect(
      provider.submit({ prompt: "x", aspectRatio: "16:9" }),
    ).rejects.toThrowError(/FLUX_API_KEY is required/);
  });

  it("propagates remote failures from retrieve", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ status: "FAILED", error: "content filtered" }),
    }));

    const provider = new FluxImageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.retrieve("gen-1", {
      prompt: "x",
      aspectRatio: "16:9",
    });
    expect(result.status).toBe("failed");
    expect(result.status === "failed" && result.error).toBe(
      "content filtered",
    );
  });
});

describe("StabilityImageProvider", () => {
  it("throws when STABILITY_API_KEY is missing", async () => {
    vi.stubEnv("STABILITY_API_KEY", "");
    const provider = new StabilityImageProvider();
    await expect(
      provider.generate({ prompt: "x", aspectRatio: "16:9" }),
    ).rejects.toThrowError(/STABILITY_API_KEY is required/);
  });

  it("returns a PNG asset from the remote API", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: {
        get: (name: string) => (name === "content-type" ? "image/png" : null),
      },
      arrayBuffer: async () => new ArrayBuffer(8),
    }));

    const provider = new StabilityImageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.generate({
      prompt: "a red fox in snow",
      aspectRatio: "1:1",
      style: "cinematic",
      projectName: null,
    });

    expect(result.provider).toBe("stability");
    expect(result.providerJobId).toMatch(/^stability_img_[a-f0-9]{12}$/);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);

    const file = result.files[0];
    expect(file.contentType).toBe("image/png");
    expect(file.filename).toMatch(/^stability-[a-f0-9]{8}\.png$/);
    expect(Buffer.isBuffer(file.body)).toBe(true);
    expect(result.metadata).toMatchObject({
      model: "stable-image-core",
      provider: "stability",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.stability.ai/v2beta/stable-image/generate/core",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer k",
        }),
      }),
    );
  });
});

describe("OpenAiImageProvider", () => {
  it("throws when OPENAI_API_KEY is missing", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const provider = new OpenAIImageProvider();
    await expect(
      provider.generate({ prompt: "x", aspectRatio: "16:9" }),
    ).rejects.toThrowError(/OPENAI_API_KEY is required/);
  });

  it("returns a PNG asset decoded from the base64 payload", async () => {
    const pngBytes = "PNG-demo-payload";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ b64_json: Buffer.from(pngBytes, "utf8").toString("base64") }],
      }),
    }));

    const provider = new OpenAIImageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    const result = await provider.generate({
      prompt: "a red fox in snow",
      aspectRatio: "1:1",
      style: "cinematic",
      projectName: null,
    });

    expect(result.provider).toBe("gpt-image");
    expect(result.providerJobId).toMatch(/^gpt_image_[a-f0-9]{12}$/);
    expect(result.width).toBe(1080);
    expect(result.height).toBe(1080);

    const file = result.files[0];
    expect(file.contentType).toBe("image/png");
    expect(file.filename).toMatch(/^gpt-image-[a-f0-9]{8}\.png$/);
    expect(Buffer.isBuffer(file.body)).toBe(true);
    expect(file.body.toString("utf8")).toBe(pngBytes);
    expect(result.metadata).toMatchObject({
      model: "gpt-image-1",
      provider: "gpt-image",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.openai.com/v1/images/generations",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ Authorization: "Bearer k" }),
        body: expect.stringContaining('"model":"gpt-image-1"'),
      }),
    );
  });

  it("folds the style hint into the prompt and maps the size", async () => {
    const fetchMock = vi.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({
        data: [{ b64_json: Buffer.from("x", "utf8").toString("base64") }],
      }),
    }));

    const provider = new OpenAIImageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await provider.generate({
      prompt: "a mountain lake",
      aspectRatio: "16:9",
      style: "watercolor",
      projectName: null,
    });

    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const body = JSON.parse(String(init.body)) as {
      prompt: string;
      size: string;
    };
    expect(body.prompt).toBe("a mountain lake, watercolor style");
    expect(body.size).toBe("1536x1024");

    await provider.generate({
      prompt: "x",
      aspectRatio: "9:16",
      style: null,
      projectName: null,
    });
    const [, portraitInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(String(portraitInit.body)).size).toBe("1024x1536");
  });

  it("propagates remote failures", async () => {
    const fetchMock = vi.fn(async () => ({ ok: false, status: 500 }));
    const provider = new OpenAIImageProvider({
      apiKey: "k",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await expect(
      provider.generate({ prompt: "x", aspectRatio: "16:9" }),
    ).rejects.toThrowError(/status 500/);
  });
});

describe("getImageProviderAvailability", () => {
  it("marks mock as available even with no credentials", () => {
    vi.stubEnv("STABILITY_API_KEY", "");
    vi.stubEnv("FLUX_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    const mock = getImageProviderAvailability().find((p) => p.name === "mock");
    expect(mock?.available).toBe(true);
    expect(mock?.reason).toBeUndefined();
  });

  it("flags real providers whose credentials are missing", () => {
    vi.stubEnv("STABILITY_API_KEY", "");
    vi.stubEnv("FLUX_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    const providers = getImageProviderAvailability();
    for (const name of ["stability", "flux", "gpt-image"]) {
      const provider = providers.find((p) => p.name === name);
      expect(provider?.available).toBe(false);
      expect(provider?.reason).toMatch(/Requires/);
    }
  });

  it("marks real providers as available when their credentials are set", () => {
    vi.stubEnv("STABILITY_API_KEY", "s");
    vi.stubEnv("FLUX_API_KEY", "f");
    vi.stubEnv("OPENAI_API_KEY", "o");

    const providers = getImageProviderAvailability();
    for (const name of ["stability", "flux", "gpt-image"]) {
      const provider = providers.find((p) => p.name === name);
      expect(provider?.available).toBe(true);
      expect(provider?.reason).toBeUndefined();
    }
  });

  it("reports the exact missing credential names", () => {
    vi.stubEnv("STABILITY_API_KEY", "s");
    vi.stubEnv("FLUX_API_KEY", "");
    vi.stubEnv("OPENAI_API_KEY", "");

    const flux = getImageProviderAvailability().find((p) => p.name === "flux");
    expect(flux?.available).toBe(false);
    expect(flux?.reason).toBe("Requires FLUX_API_KEY env var");

    const gptImage = getImageProviderAvailability().find(
      (p) => p.name === "gpt-image",
    );
    expect(gptImage?.available).toBe(false);
    expect(gptImage?.reason).toBe("Requires OPENAI_API_KEY env var");
  });
});