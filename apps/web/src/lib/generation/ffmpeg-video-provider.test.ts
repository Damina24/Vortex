import { afterEach, describe, expect, it, vi } from "vitest";
import {
  FfmpegVideoProvider,
  buildFfmpegArgs,
  buildFfmpegRenderSpec,
  escapeFfmpegFilterText,
  extractHexColors,
  getVideoProvider,
  isAsyncVideoProvider,
  renderMp4WithFfmpeg,
  type FfmpegRenderSpec,
} from "./providers";

const params = {
  prompt:
    "A sleek red sports car. Brand style: brand colors #f00, #123456; heading font Inter.",
  negativePrompt: "blurry, low quality",
  aspectRatio: "16:9",
  duration: 6,
};

afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.FFMPEG_RENDER_DELAY_MS;
});

describe("extractHexColors", () => {
  it("finds 6-digit and 3-digit hex tokens and normalizes 3-digit forms", () => {
    expect(extractHexColors(params.prompt)).toEqual(["#ff0000", "#123456"]);
  });

  it("expands 3-digit codes to their 6-digit equivalent", () => {
    expect(extractHexColors("palette #abc and #0f0 accent")).toEqual([
      "#aabbcc",
      "#00ff00",
    ]);
  });

  it("ignores non-hex tokens and returns an empty list when none present", () => {
    expect(extractHexColors("no colors in here")).toEqual([]);
    // "123456" without a '#' is not a color token; "#xyz" is not hex.
    expect(extractHexColors("use 123456 and #xyz")).toEqual([]);
  });
});

describe("buildFfmpegRenderSpec", () => {
  it("lifts brand colors from the enriched prompt into the palette", () => {
    const spec = buildFfmpegRenderSpec(params);
    expect(spec.width).toBe(1920);
    expect(spec.height).toBe(1080);
    expect(spec.backgroundColorHex).toBe("ff0000");
    expect(spec.accentHex).toBe("123456");
  });

  it("falls back to the VORTEX brand gradient when no colors are present", () => {
    const spec = buildFfmpegRenderSpec({
      ...params,
      prompt: "A minimalist product shot",
    });
    expect(spec.backgroundColorHex).toBe("1E1B4B");
    expect(spec.accentHex).toBe("7C3AED");
  });

  it("maps aspect ratios to dimensions and truncates long prompts", () => {
    const spec = buildFfmpegRenderSpec({
      ...params,
      aspectRatio: "9:16",
      prompt: "A".repeat(200),
    });
    expect(spec.width).toBe(1080);
    expect(spec.height).toBe(1920);
    expect(spec.overlayTitle.length).toBeLessThanOrEqual(61); // 60 max + ellipsis
  });
});

describe("escapeFfmpegFilterText", () => {
  it("escapes characters that terminate the drawtext filter grammar", () => {
    expect(escapeFfmpegFilterText("a:b,c;d'e")).toBe("a\\:b\\,c\\;d\\'e");
    expect(escapeFfmpegFilterText(("back\\slash"))).toBe("back\\\\slash");
  });
});

describe("buildFfmpegArgs", () => {
  it("produces an H.264 / MP4 encode with the brand background color", () => {
    const args = buildFfmpegArgs(buildFfmpegRenderSpec(params));
    const joined = args.join(" ");
    expect(joined).toContain("color=c=0xff0000");
    expect(joined).toContain("libx264");
    expect(joined).toContain("yuv420p");
    expect(joined).toContain("faststart");
    expect(joined).toContain('-f mp4');
    expect(joined).toContain("drawtext=text=");
  });

  it("omits the drawtext filter when overlay text is empty", () => {
    const base = buildFfmpegRenderSpec(params);
    const spec: FfmpegRenderSpec = { ...base, overlayTitle: "" };
    const args = buildFfmpegArgs(spec);
    expect(args.join(" ")).not.toContain("drawtext");
  });
});

describe("FfmpegVideoProvider", () => {
  const now = () => 10_000;

  it("is registered as an async provider", () => {
    const provider = getVideoProvider("ffmpeg");
    expect(provider.name).toBe("ffmpeg");
    expect(isAsyncVideoProvider(provider)).toBe(true);
  });

  it("returns a deterministic provider job id from submit", async () => {
    const provider = new FfmpegVideoProvider({ now });
    const submitted = await provider.submit(params);
    expect(submitted.providerJobId.startsWith("ffmpeg_")).toBe(true);
    expect(submitted.providerJobId.endsWith("_10000")).toBe(true);
  });

  it("reports processing while the render latency has not elapsed", async () => {
    const provider = new FfmpegVideoProvider({ now, latencyMs: 5000 });
    const submitted = await provider.submit(params);
    const result = await provider.retrieve(submitted.providerJobId, params);
    expect(result.status).toBe("processing");
    if (result.status === "processing") {
      expect(result.progress).toBe(0);
    }
  });

  it("renders an MP4 via the injected renderer once latency has elapsed", async () => {
    const renderImpl = vi.fn(async (_spec: FfmpegRenderSpec) =>
      Buffer.from("fake mp4 bytes"),
    );
    const provider = new FfmpegVideoProvider({ now, latencyMs: 0, renderImpl });
    const submitted = await provider.submit(params);
    const result = await provider.retrieve(submitted.providerJobId, params);

    expect(renderImpl).toHaveBeenCalledTimes(1);
    if (result.status !== "succeeded") {
      throw new Error("expected succeeded result");
    }
    expect(result.result.provider).toBe("ffmpeg");
    expect(result.result.width).toBe(1920);
    expect(result.result.height).toBe(1080);
    expect(result.result.duration).toBe(6);
    expect(result.result.files[0].contentType).toBe("video/mp4");
    expect(result.result.files[0].filename.endsWith(".mp4")).toBe(true);
    expect(result.result.files[0].body.toString()).toBe("fake mp4 bytes");
    expect(result.result.metadata.provider).toBe("ffmpeg");
    expect(result.result.metadata.codec).toBe("h264");
    expect(result.result.metadata.backgroundColor).toBe("ff0000");
  });
});

describe("renderMp4WithFfmpeg", () => {
  it("rejects with a helpful message when ffmpeg is missing", async () => {
    const spec = buildFfmpegRenderSpec(params);
    await expect(
      renderMp4WithFfmpeg(spec, { ffmpegPath: "definitely-not-a-real-binary" }),
    ).rejects.toThrow(/Failed to start ffmpeg/);
  });
});