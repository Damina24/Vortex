import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MockAsyncVideoProvider,
  MockVideoProvider,
  VideoProviderUnavailableError,
  buildPosterSvg,
  escapeXml,
  getVideoProvider,
  isAsyncVideoProvider,
  normalizePosterText,
} from "./providers";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("MockVideoProvider", () => {
  it("returns deterministic render metadata without any network access", async () => {
    vi.stubEnv("MOCK_RENDER_DELAY_MS", "0");
    const provider = new MockVideoProvider();

    const first = await provider.generate({
      prompt: "A dramatic eagle flying over mountains",
      aspectRatio: "9:16",
      duration: 5,
    });
    const second = await provider.generate({
      prompt: "A dramatic eagle flying over mountains",
      aspectRatio: "9:16",
      duration: 5,
    });

    expect(first.provider).toBe("mock");
    expect(first.providerJobId).toBe(second.providerJobId);
    expect(first.width).toBe(1080);
    expect(first.height).toBe(1920);
    expect(first.duration).toBe(5);
    expect(first.files).toHaveLength(1);
    expect(first.files[0]?.contentType).toBe("image/svg+xml");
    expect(first.files[0]?.body.toString("utf8")).toContain("<svg xmlns=");
  });

  it("maps the aspect ratio to width/height dimensions", async () => {
    vi.stubEnv("MOCK_RENDER_DELAY_MS", "0");
    const provider = new MockVideoProvider();

    const landscape = await provider.generate({
      prompt: "x",
      aspectRatio: "16:9",
      duration: 6,
    });
    expect(landscape.width).toBe(1920);
    expect(landscape.height).toBe(1080);

    const square = await provider.generate({
      prompt: "x",
      aspectRatio: "1:1",
      duration: 3,
    });
    expect(square.width).toBe(1080);
    expect(square.height).toBe(1080);
  });

  it("falls back to a safe default for unknown aspect ratios", async () => {
    vi.stubEnv("MOCK_RENDER_DELAY_MS", "0");
    const provider = new MockVideoProvider();

    const result = await provider.generate({
      prompt: "x",
      aspectRatio: "21:9",
      duration: 4,
    });
    expect(result.width).toBe(1280);
    expect(result.height).toBe(720);
  });

  it("escapes prompt text so it cannot inject XML into the poster", async () => {
    vi.stubEnv("MOCK_RENDER_DELAY_MS", "0");
    const provider = new MockVideoProvider();

    const result = await provider.generate({
      prompt: '<script>alert("pwned")</script>',
      aspectRatio: "16:9",
      duration: 4,
    });

    const svg = result.files[0]?.body.toString("utf8") ?? "";
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).not.toContain('alert("pwned")');
  });
});

describe("getVideoProvider", () => {
  it("resolves the mock provider by default", () => {
    expect(getVideoProvider().name).toBe("mock");
  });

  it("resolves providers by name", () => {
    expect(getVideoProvider("mock").name).toBe("mock");
  });

  it("throws VideoProviderUnavailableError for unregistered providers", () => {
    expect(() => getVideoProvider("wan")).toThrowError(
      VideoProviderUnavailableError,
    );
    expect(() => getVideoProvider("wan")).toThrowError(
      /provider "wan" is not available/,
    );
  });

  it("resolves the real runway provider by name", () => {
    expect(getVideoProvider("runway").name).toBe("runway");
    expect(isAsyncVideoProvider(getVideoProvider("runway"))).toBe(true);
  });

  it("falls back to the default provider for empty names", () => {
    expect(getVideoProvider("").name).toBe("mock");
  });
});

describe("SVG poster helpers", () => {
  it("escapes XML metacharacters", () => {
    expect(escapeXml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;",
    );
  });

  it("normalizes and truncates long prompts", () => {
    expect(normalizePosterText("  hello    world  ")).toBe("hello world");
    const long = "x".repeat(300);
    const shortened = normalizePosterText(long, 120);
    expect(shortened.length).toBeLessThanOrEqual(121);
    expect(shortened.endsWith("…")).toBe(true);
  });

  it("builds a poster that includes prompt, aspect ratio, and duration", () => {
    const svg = buildPosterSvg({
      width: 1000,
      height: 700,
      prompt: "Sunset over the ocean",
      duration: 8,
      aspectRatio: "16:9",
    });

    expect(svg).toContain("Sunset over the ocean");
    expect(svg).toContain("16:9 · 8s");
    expect(svg).toContain('width="1000" height="700"');
    expect(svg).toContain("MOCK RENDER");
  });
});

describe("Async video providers", () => {
  const params = {
    prompt: "A fox in the snow",
    aspectRatio: "16:9",
    duration: 5,
  };

  it("classifies providers by capability", async () => {
    expect(isAsyncVideoProvider(new MockAsyncVideoProvider())).toBe(true);
    expect(isAsyncVideoProvider(new MockVideoProvider())).toBe(false);
  });

  it("reports processing until the latency elapses, then succeeded", async () => {
    let now = 1_000;
    const provider = new MockAsyncVideoProvider({
      latencyMs: 100,
      now: () => now,
    });

    const submitted = await provider.submit(params);
    expect(submitted.providerJobId).toMatch(/^mock_async_/);

    const early = await provider.retrieve(submitted.providerJobId, params);
    expect(early.status).toBe("processing");

    now = 1_150; // 150ms > 100ms latency
    const done = await provider.retrieve(submitted.providerJobId, params);
    expect(done.status).toBe("succeeded");
    if (done.status === "succeeded") {
      expect(done.result.provider).toBe("mock-async");
      expect(done.result.duration).toBe(5);
      expect(done.result.files[0]?.contentType).toBe("image/svg+xml");
    }
  });

  it("is stateless and resumable across distinct provider instances", async () => {
    const submitter = new MockAsyncVideoProvider({
      latencyMs: 50,
      now: () => 1_000,
    });
    const submitted = await submitter.submit(params);

    // A "different request" re-reads the same job id with a later clock.
    const poller = new MockAsyncVideoProvider({
      latencyMs: 50,
      now: () => 1_100,
    });
    const done = await poller.retrieve(submitted.providerJobId, params);
    expect(done.status).toBe("succeeded");
  });

  it("resolves mock-async through the registry and reports progress 0..1", async () => {
    let now = 1_000;
    const provider = new MockAsyncVideoProvider({
      latencyMs: 100,
      now: () => now,
    });
    const submitted = await provider.submit(params);

    now = 1_050; // half-way
    const mid = await provider.retrieve(submitted.providerJobId, params);
    if (mid.status === "processing") {
      expect(mid.progress).toBeGreaterThan(0.4);
      expect(mid.progress).toBeLessThanOrEqual(1);
    }
    expect(getVideoProvider("mock-async").name).toBe("mock-async");
    expect(isAsyncVideoProvider(getVideoProvider("mock-async"))).toBe(true);
  });
});
