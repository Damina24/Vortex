// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SceneVideoGenerator } from "@/components/scenes/scene-video-generator";

// ============================================================
// Module mocks (declared before the component import is executed)
// ============================================================

const routerMock = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerMock.refresh }),
}));

const toastMock = vi.hoisted(() => {
  const success = vi.fn();
  const error = vi.fn();
  const toast = Object.assign(vi.fn(), { success, error });
  return { toast, success, error };
});

vi.mock("react-hot-toast", () => ({ default: toastMock.toast }));

const notifyMock = vi.hoisted(() => ({
  notifyCreditsUpdated: vi.fn(),
}));

vi.mock("@/lib/credits-client", () => ({
  notifyCreditsUpdated: notifyMock.notifyCreditsUpdated,
}));

const axiosMock = vi.hoisted(() => ({
  default: {
    post: vi.fn(),
    get: vi.fn(),
    isAxiosError: vi.fn(
      (error: unknown) =>
        typeof error === "object" && error !== null && "response" in error,
    ),
  },
}));

vi.mock("axios", () => ({ default: axiosMock.default }));

vi.mock("@/components/ai/insufficient-credits-alert", () => ({
  InsufficientCreditsAlert: ({ message }: { message: string }) => (
    <div data-testid="insufficient-credits-alert">{message}</div>
  ),
}));

// ============================================================
// Helpers
// ============================================================

const baseProps = {
  sceneId: "scene-1",
  status: "pending" as const,
  generatedVideo: null,
  creditCost: 10,
  defaultProvider: "mock",
};

/** Shapes a `POST /api/v1/generation-jobs` success body. */
function postResponse(job: { status?: string; jobId?: string } = {}) {
  return {
    data: {
      success: true,
      data: { status: "completed", jobId: "job-1", ...job },
    },
  };
}

/** Shapes a `GET /api/v1/generation-jobs/[id]` success body. */
function pollResponse(job: { status: string; errorMessage?: string }) {
  return { data: { success: true, data: job } };
}

/** Axios-style rejection that passes the mocked `isAxiosError` check. */
function makeAxiosError(status: number, data?: unknown, message = "Request failed") {
  return { message, response: { status, data } };
}

/** Flush the microtask queue so closed-over mock promises settle in order. */
async function flushMicrotasks() {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Advance fake timers, running any pending poll schedule + its microtasks. */
async function flushTimers(ms: number) {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function clickGenerate() {
  fireEvent.click(
    screen.getByRole("button", { name: /generate video|rendering/i }),
  );
}

// ============================================================
// Shared setup
// ============================================================

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("SceneVideoGenerator", () => {
  describe("rendering states", () => {
    it("shows all render providers and the generate button by default", () => {
      render(<SceneVideoGenerator {...baseProps} />);

      const select = screen.getByRole("combobox");
      expect(select).toBeInTheDocument();
      expect(select).toHaveValue("mock");

      const options = screen.getAllByRole("option");
      expect(options).toHaveLength(6);
      expect(options.map((o) => o.textContent)).toEqual([
        "Mock (fast, offline)",
        "Mock async (poll flow)",
        "FFmpeg (local MP4)",
        "Kling AI",
        "Runway AI",
        "Hailuo AI",
      ]);

      expect(
        screen.getByRole("button", { name: /Generate Video · 10 credits/i }),
      ).toBeInTheDocument();
    });

    it("defaults the select to the configured provider", () => {
      render(<SceneVideoGenerator {...baseProps} defaultProvider="ffmpeg" />);
      expect(screen.getByRole("combobox")).toHaveValue("ffmpeg");
    });

    it("renders an inline player for completed real video renders", () => {
      render(
        <SceneVideoGenerator
          {...baseProps}
          status="completed"
          generatedVideo={{
            id: "asset-1",
            url: "https://cdn.example/video.mp4",
            thumbnailUrl: "https://cdn.example/video.poster.jpg",
            name: "Scene 1 render",
            mimeType: "video/mp4",
          }}
        />,
      );

      expect(screen.getByText("Rendered")).toBeInTheDocument();
      // jsdom/testing-library don't expose the implicit "video" ARIA role,
      // so query the media element directly.
      const player = document.querySelector("video");
      expect(player).toHaveAttribute("src", "https://cdn.example/video.mp4");
      expect(player).toHaveAttribute(
        "poster",
        "https://cdn.example/video.poster.jpg",
      );
      expect(player).toHaveAttribute("controls");
      // No poster `<img>` is rendered for real video.
      expect(screen.queryByRole("img")).not.toBeInTheDocument();
      expect(screen.getByRole("button", { name: /re-render/i })).toBeInTheDocument();
    });

    it("keeps the poster thumbnail for non-video mock renders", () => {
      render(
        <SceneVideoGenerator
          {...baseProps}
          status="completed"
          generatedVideo={{
            id: "asset-2",
            url: "https://cdn.example/poster.svg",
            thumbnailUrl: "https://cdn.example/poster.svg",
            name: "Scene 2 render",
            mimeType: "image/svg+xml",
          }}
        />,
      );

      const thumb = screen.getByRole("img", { name: "Scene 2 render preview" });
      expect(thumb).toHaveAttribute("src", "https://cdn.example/poster.svg");
      expect(thumb.closest("a")).toHaveAttribute(
        "href",
        "https://cdn.example/poster.svg",
      );
      // No video player for image-only renders.
      expect(document.querySelector("video")).not.toBeInTheDocument();
    });

    it("renders the generating placeholder while a render is in flight", () => {
      render(<SceneVideoGenerator {...baseProps} status="generating" />);
      expect(screen.getByText("Rendering video…")).toBeInTheDocument();
    });

    it("renders the failed state with a retry action", () => {
      render(<SceneVideoGenerator {...baseProps} status="failed" />);
      expect(screen.getByText(/this scene's render failed/i)).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /retry/i })).toBeInTheDocument();
    });
  });

  describe("sync providers", () => {
    it("completes immediately on submit and refreshes", async () => {
      axiosMock.default.post.mockResolvedValueOnce(postResponse());

      render(<SceneVideoGenerator {...baseProps} />);
      await clickGenerate();

      expect(axiosMock.default.post).toHaveBeenCalledWith(
        "/api/v1/generation-jobs",
        { sceneId: "scene-1", provider: "mock" },
      );

      await flushMicrotasks();

      expect(toastMock.success).toHaveBeenCalledWith("Video rendered");
      expect(notifyMock.notifyCreditsUpdated).toHaveBeenCalled();
      expect(routerMock.refresh).toHaveBeenCalled();
      // The button returns to its idle label once rendering finishes.
      expect(
        screen.getByRole("button", { name: /generate video/i }),
      ).toBeEnabled();
    });

    it("sends the selected provider to the API", async () => {
      axiosMock.default.post.mockResolvedValueOnce(postResponse());
      render(<SceneVideoGenerator {...baseProps} />);

      fireEvent.change(screen.getByRole("combobox"), {
        target: { value: "kling" },
      });
      await clickGenerate();

      expect(axiosMock.default.post).toHaveBeenCalledWith(
        "/api/v1/generation-jobs",
        { sceneId: "scene-1", provider: "kling" },
      );
    });
  });

  describe("async providers (submit → poll → complete)", () => {
    it("polls until the job completes and refreshes", async () => {
      axiosMock.default.post.mockResolvedValueOnce(
        postResponse({ status: "processing", jobId: "job-2" }),
      );
      axiosMock.default.get.mockResolvedValueOnce(
        pollResponse({ status: "completed" }),
      );

      render(<SceneVideoGenerator {...baseProps} defaultProvider="mock-async" />);
      await clickGenerate();
      await flushMicrotasks();

      expect(axiosMock.default.get).toHaveBeenCalledWith(
        "/api/v1/generation-jobs/job-2",
      );
      expect(toastMock.success).toHaveBeenCalledWith("Video rendered");
      expect(routerMock.refresh).toHaveBeenCalled();
    });

    it("shows a progress state while the job is still processing", async () => {
      vi.useFakeTimers();
      axiosMock.default.post.mockResolvedValueOnce(
        postResponse({ status: "processing", jobId: "job-3" }),
      );
      // First poll: still processing. Second poll (after the interval): done.
      axiosMock.default.get
        .mockResolvedValueOnce(pollResponse({ status: "processing" }))
        .mockResolvedValueOnce(pollResponse({ status: "completed" }));

      render(<SceneVideoGenerator {...baseProps} defaultProvider="mock-async" />);
      await clickGenerate();
      await flushMicrotasks();

      expect(axiosMock.default.get).toHaveBeenCalledTimes(1);
      // Button stays disabled while the async render is being polled.
      expect(screen.getByRole("button", { name: /rendering/i })).toBeDisabled();

      await flushTimers(1500);
      await flushMicrotasks();

      expect(axiosMock.default.get).toHaveBeenCalledTimes(2);
      expect(toastMock.success).toHaveBeenCalledWith("Video rendered");
      expect(routerMock.refresh).toHaveBeenCalled();
    });

    it("surfaces the provider error when the poll reports failure", async () => {
      axiosMock.default.post.mockResolvedValueOnce(
        postResponse({ status: "processing", jobId: "job-4" }),
      );
      axiosMock.default.get.mockResolvedValueOnce(
        pollResponse({ status: "failed", errorMessage: "Kling generation failed" }),
      );

      render(<SceneVideoGenerator {...baseProps} defaultProvider="kling" />);
      await clickGenerate();
      await flushMicrotasks();

      expect(toastMock.error).toHaveBeenCalledWith("Kling generation failed");
      expect(routerMock.refresh).toHaveBeenCalled();
    });
  });

  describe("API failures", () => {
    it("shows the inline buy-credits alert on HTTP 402", async () => {
      axiosMock.default.post.mockRejectedValueOnce(
        makeAxiosError(402, { error: "Video renders cost credits. Balance is 3." }),
      );

      render(<SceneVideoGenerator {...baseProps} />);
      await clickGenerate();
      await flushMicrotasks();

      expect(
        await screen.findByTestId("insufficient-credits-alert"),
      ).toHaveTextContent("Video renders cost credits. Balance is 3.");
      expect(toastMock.error).not.toHaveBeenCalled();
      expect(routerMock.refresh).not.toHaveBeenCalled();
    });

    it("toasts the server error message for non-402 failures", async () => {
      axiosMock.default.post.mockRejectedValueOnce(
        makeAxiosError(503, { error: "Provider temporarily unavailable" }),
      );

      render(<SceneVideoGenerator {...baseProps} />);
      await clickGenerate();
      await flushMicrotasks();

      expect(toastMock.error).toHaveBeenCalledWith(
        "Provider temporarily unavailable",
      );
    });

    it("falls back to a generic message when no response body exists", async () => {
      axiosMock.default.post.mockRejectedValueOnce(new Error("network down"));

      render(<SceneVideoGenerator {...baseProps} />);
      await clickGenerate();
      await flushMicrotasks();

      expect(toastMock.error).toHaveBeenCalledWith(
        "Video generation failed. Try again.",
      );
    });
  });
});