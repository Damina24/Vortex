// @vitest-environment jsdom
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ScenePromptEnhancer } from "./scene-prompt-enhancer";

const routerMock = vi.hoisted(() => ({ refresh: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMock,
}));

const toastMock = vi.hoisted(() => {
  const success = vi.fn();
  const error = vi.fn();
  const toast = Object.assign(vi.fn(), { success, error });
  return { toast, success, error };
});

vi.mock("react-hot-toast", () => ({ default: toastMock.toast }));

const notifyMock = vi.hoisted(() => ({ notifyCreditsUpdated: vi.fn() }));

vi.mock("@/lib/credits-client", () => ({
  notifyCreditsUpdated: notifyMock.notifyCreditsUpdated,
  isInsufficientCreditsError: (error: unknown) =>
    typeof error === "object" &&
    error !== null &&
    "response" in error &&
    (error as { response?: { status?: number } }).response?.status === 402,
}));

const axiosMock = vi.hoisted(() => ({
  default: {
    post: vi.fn(),
    patch: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
});

const enhanceResponse = {
  success: true,
  data: {
    enhancedPrompt: "cinematic mountain lake at sunrise, slow light reveal",
    enhancedNegativePrompt: "blurry, oversaturated",
  },
  credits: { cost: 1, remaining: 9 },
};

describe("ScenePromptEnhancer", () => {
  it("requests enhancement for the scene id and shows the enhanced preview", async () => {
    axiosMock.default.post.mockResolvedValueOnce({ data: enhanceResponse });

    render(<ScenePromptEnhancer sceneId="scene-1" />);
    fireEvent.click(screen.getByRole("button", { name: /enhance with ai/i }));

    expect(
      await screen.findByText("cinematic mountain lake at sunrise, slow light reveal"),
    ).toBeInTheDocument();
    expect(screen.getByText(/Negative: blurry, oversaturated/)).toBeInTheDocument();
    expect(axiosMock.default.post).toHaveBeenCalledWith(
      "/api/v1/ai/enhance-prompt",
      { sceneId: "scene-1" },
    );
  });

  it("persists the enhanced fields to the scene on Apply", async () => {
    axiosMock.default.post.mockResolvedValueOnce({ data: enhanceResponse });
    axiosMock.default.patch.mockResolvedValueOnce({ data: { success: true } });

    render(<ScenePromptEnhancer sceneId="scene-1" />);
    fireEvent.click(screen.getByRole("button", { name: /enhance with ai/i }));
    await screen.findByText(/slow light reveal/);

    fireEvent.click(screen.getByRole("button", { name: /^apply$/i }));

    await waitFor(() =>
      expect(axiosMock.default.patch).toHaveBeenCalledWith("/api/v1/scenes/scene-1", {
        prompt: "cinematic mountain lake at sunrise, slow light reveal",
        negativePrompt: "blurry, oversaturated",
      }),
    );
    expect(routerMock.refresh).toHaveBeenCalled();
  });
});