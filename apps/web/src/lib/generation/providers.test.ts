import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MockVideoProvider,
  VideoProviderUnavailableError,
  buildPosterSvg,
  escapeXml,
  getVideoProvider,
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
    expect(() => getVideoProvider("kling")).toThrowError(
      VideoProviderUnavailableError,
    );
    expect(() => getVideoProvider("kling")).toThrowError(
      /provider "kling" is not available/,
    );
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
