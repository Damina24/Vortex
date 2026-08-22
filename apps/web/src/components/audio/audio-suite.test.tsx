// @vitest-environment jsdom
import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AudioSuite, type AudioAssetRef } from "@/components/audio/audio-suite";
import type { AudioProviderInfo } from "@/lib/generation/audio-providers-catalog";

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

const projects = [
  { id: "project-1", name: "Summer launch" },
  { id: "project-2", name: "Webinar teaser" },
];

const audioAssets: AudioAssetRef[] = [
  {
    id: "asset-1",
    name: "Voiceover — Summer launch",
    url: "https://cdn.example/vo.mp3",
    mimeType: "audio/mpeg",
    duration: 12,
    createdAt: "2026-08-01T00:00:00.000Z",
    projectName: "Summer launch",
  },
];

const props = {
  projects,
  audioAssets,
  creditCosts: { voiceover: 5, music: 8 },
};

beforeEach(() => {
  vi.clearAllMocks();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

async function flush() {
  await act(async () => {
    await Promise.resolve();
  });
}

describe("AudioSuite", () => {
  it("renders the generation form and the audio library", () => {
    render(<AudioSuite {...props} />);

    expect(
      screen.getByRole("form", { name: /audio generation/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate voiceover · 5 credits/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Voiceover — Summer launch")).toBeInTheDocument();
    // jsdom/testing-library don't expose the implicit "audio" ARIA role, so
    // query the media element directly.
    const player = document.querySelector("audio");
    expect(player).toHaveAttribute("src", "https://cdn.example/vo.mp3");
  });

  it("shows the empty library state when no audio exists", () => {
    render(<AudioSuite {...props} audioAssets={[]} />);
    expect(screen.getByText(/no audio yet/i)).toBeInTheDocument();
  });

  it("switching to music updates the cost label and default duration", () => {
    render(<AudioSuite {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Music" }));

    expect(
      screen.getByRole("button", { name: /generate music · 8 credits/i }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /generate voiceover/i }),
    ).not.toBeInTheDocument();
  });

  it("posts the form payload and refreshes on completion", async () => {
    axiosMock.default.post.mockResolvedValueOnce({
      data: { success: true, data: { status: "completed", jobId: "job-1" } },
    });

    render(<AudioSuite {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: /script/i }), {
      target: { value: "Hello world" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /audio generation/i }));

    expect(axiosMock.default.post).toHaveBeenCalledWith("/api/v1/audio-jobs", {
      projectId: "project-1",
      kind: "voiceover",
      prompt: "Hello world",
      duration: 15,
      voice: "alloy",
      provider: "mock",
    });

    await flush();

    expect(toastMock.success).toHaveBeenCalledWith("Audio generated");
    expect(notifyMock.notifyCreditsUpdated).toHaveBeenCalled();
    expect(routerMock.refresh).toHaveBeenCalled();
  });

  it("shows the buy-credits alert on HTTP 402", async () => {
    axiosMock.default.post.mockRejectedValueOnce({
      message: "Request failed",
      response: { status: 402, data: { error: "Out of credits." } },
    });

    render(<AudioSuite {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: /script/i }), {
      target: { value: "Hello" },
    });
    await act(async () => {
      fireEvent.submit(screen.getByRole("form", { name: /audio generation/i }));
      await Promise.resolve();
    });

    expect(
      await screen.findByTestId("insufficient-credits-alert"),
    ).toHaveTextContent("Out of credits.");
  });

  it("shows a provider dropdown filtered to voiceover-capable providers", () => {
    render(<AudioSuite {...props} />);

    // Initial kind is voiceover → mock, openai, elevenlabs (suno is music-only).
    const select = screen.getByRole("combobox", { name: /provider/i });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Mock (offline WAV)", "OpenAI TTS", "ElevenLabs"]);
    expect(select).toHaveValue("mock");
  });

  it("filters to music-capable providers and falls back after switching kind", () => {
    render(<AudioSuite {...props} defaultProvider="openai" />);
    fireEvent.click(screen.getByRole("button", { name: "Music" }));

    const select = screen.getByRole("combobox", { name: /provider/i });
    // OpenAI is voiceover-only → fall back to the first music-capable option.
    expect(select).toHaveValue("mock");
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual(["Mock (offline WAV)", "Suno"]);
  });

  it("disables unconfigured providers and blocks submit for the selected one", () => {
    const providerOptions: AudioProviderInfo[] = [
      {
        name: "mock",
        label: "Mock (offline WAV)",
        available: true,
        kinds: ["voiceover", "music"],
      },
      {
        name: "openai",
        label: "OpenAI TTS",
        available: false,
        reason: "Requires OPENAI_API_KEY env var",
        kinds: ["voiceover"],
      },
      {
        name: "elevenlabs",
        label: "ElevenLabs",
        available: true,
        kinds: ["voiceover"],
      },
      {
        name: "suno",
        label: "Suno",
        available: true,
        kinds: ["music"],
      },
    ];
    render(
      <AudioSuite
        {...props}
        providerOptions={providerOptions}
        defaultProvider="openai"
      />,
    );

    const select = screen.getByRole("combobox", { name: /provider/i });
    expect(
      within(select).getByRole("option", { name: /OpenAI/ }),
    ).toBeDisabled();
    // Selected provider is unavailable → submit blocked and reason shown.
    expect(
      screen.getByRole("button", { name: /generate voiceover/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Requires OPENAI_API_KEY env var/),
    ).toBeInTheDocument();
  });

  it("posts the selected provider after switching to music", async () => {
    axiosMock.default.post.mockResolvedValueOnce({
      data: { success: true, data: { status: "completed", jobId: "job-1" } },
    });

    render(<AudioSuite {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Music" }));
    fireEvent.change(screen.getByRole("combobox", { name: /provider/i }), {
      target: { value: "suno" },
    });
    fireEvent.change(
      screen.getByRole("textbox", { name: /musical direction/i }),
      { target: { value: "A chill lo-fi beat" } },
    );
    fireEvent.submit(screen.getByRole("form", { name: /audio generation/i }));

    expect(axiosMock.default.post).toHaveBeenCalledWith("/api/v1/audio-jobs", {
      projectId: "project-1",
      kind: "music",
      prompt: "A chill lo-fi beat",
      duration: 30,
      voice: null,
      provider: "suno",
    });

    await flush();
    expect(toastMock.success).toHaveBeenCalledWith("Audio generated");
  });
});
