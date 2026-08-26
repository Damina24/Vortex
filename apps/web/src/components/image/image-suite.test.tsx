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
import { ImageSuite, type ImageAssetRef } from "@/components/image/image-suite";
import type { ImageProviderInfo } from "@/lib/generation/image-providers-catalog";

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

const imageAssets: ImageAssetRef[] = [
  {
    id: "asset-1",
    name: "Image — Summer launch",
    url: "https://cdn.example/img.png",
    mimeType: "image/png",
    width: 1920,
    height: 1080,
    createdAt: "2026-08-01T00:00:00.000Z",
    projectName: "Summer launch",
  },
];

const props = {
  projects,
  imageAssets,
  creditCosts: { imageGeneration: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  // The Project picker fetches the selected project's brand profile on mount;
  // default to "no profile" so unrelated tests don't depend on it.
  axiosMock.default.get.mockResolvedValue({
    data: { success: true, data: { brandDna: null } },
  });
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
describe("ImageSuite", () => {
  it("renders the generation form and the image library", () => {
    render(<ImageSuite {...props} />);

    expect(
      screen.getByRole("form", { name: /image generation/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: /generate image · 1 credit/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Image — Summer launch")).toBeInTheDocument();
    const image = document.querySelector("img");
    expect(image).toHaveAttribute("src", "https://cdn.example/img.png");
  });

  it("shows the empty library state when no images exist", () => {
    render(<ImageSuite {...props} imageAssets={[]} />);
    expect(screen.getByText(/no images yet/i)).toBeInTheDocument();
  });

  it("shows the active Brand DNA chip for the selected project", async () => {
    axiosMock.default.get.mockResolvedValueOnce({
      data: {
        success: true,
        data: { brandDna: { id: "bd-1", name: "Acme Organic" } },
      },
    });

    render(<ImageSuite {...props} />);
    await flush();

    expect(
      screen.getByText(/Brand DNA: Acme Organic/i),
    ).toBeInTheDocument();
    expect(axiosMock.default.get).toHaveBeenCalledWith(
      "/api/v1/projects/project-1",
    );
  });

  it("shows the no-brand hint when the selected project has no profile", async () => {
    render(<ImageSuite {...props} />);
    await flush();

    expect(
      screen.getByText(/No brand profile assigned/i),
    ).toBeInTheDocument();
  });

  it("defaults the aspect ratio to 16:9 and updates on selection", async () => {
    render(<ImageSuite {...props} />);
    expect(screen.getByRole("combobox", { name: /aspect ratio/i })).toHaveValue(
      "16:9",
    );

    fireEvent.change(
      screen.getByRole("combobox", { name: /aspect ratio/i }),
      { target: { value: "1:1" } },
    );
    await flush();
    expect(screen.getByRole("combobox", { name: /aspect ratio/i })).toHaveValue(
      "1:1",
    );
  });

  it("shows a provider dropdown from the catalog by default", () => {
    render(<ImageSuite {...props} />);

    const select = screen.getByRole("combobox", { name: /image provider/i });
    expect(
      within(select)
        .getAllByRole("option")
        .map((o) => o.textContent),
    ).toEqual([
      "Mock (offline SVG poster)",
      "Stability AI",
      "FLUX (Black Forest Labs)",
    ]);
    expect(select).toHaveValue("mock");
  });

  it("disables unconfigured providers and blocks submit for the selected one", () => {
    const providerOptions: ImageProviderInfo[] = [
      {
        name: "mock",
        label: "Mock (offline SVG poster)",
        available: true,
      },
      {
        name: "stability",
        label: "Stability AI",
        available: false,
        reason: "Requires STABILITY_API_KEY env var",
      },
      {
        name: "flux",
        label: "FLUX (Black Forest Labs)",
        available: true,
      },
    ];
    render(
      <ImageSuite
        {...props}
        providerOptions={providerOptions}
        defaultProvider="stability"
      />,
    );

    const select = screen.getByRole("combobox", { name: /image provider/i });
    expect(
      within(select).getByRole("option", { name: /Stability/ }),
    ).toBeDisabled();
    // Selected provider is unavailable → submit blocked and reason shown.
    expect(
      screen.getByRole("button", { name: /generate image/i }),
    ).toBeDisabled();
    expect(
      screen.getByText(/Requires STABILITY_API_KEY env var/),
    ).toBeInTheDocument();
  });
it("posts the selected provider and completes synchronously in mock mode", async () => {
    axiosMock.default.post.mockResolvedValueOnce({
      data: { success: true, data: { status: "completed", jobId: "job-1" } },
    });

    render(<ImageSuite {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: /prompt/i }), {
      target: { value: "a red fox in snow" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /image generation/i }));

    expect(axiosMock.default.post).toHaveBeenCalledWith("/api/v1/image-jobs", {
      projectId: "project-1",
      prompt: "a red fox in snow",
      aspectRatio: "16:9",
      style: null,
      provider: "mock",
    });

    await flush();
    expect(toastMock.success).toHaveBeenCalledWith("Image generated");
  });

  it("polls an async provider until the job completes", async () => {
    axiosMock.default.post.mockResolvedValueOnce({
      data: {
        success: true,
        data: { status: "processing", jobId: "job-1" },
      },
    });
    axiosMock.default.get
      // Mount effect fetches the selected project's brand profile first.
      .mockResolvedValueOnce({
        data: { success: true, data: { brandDna: null } },
      })
      .mockResolvedValueOnce({
        data: { success: true, data: { status: "completed" } },
      });

    render(<ImageSuite {...props} />);
    fireEvent.change(screen.getByRole("textbox", { name: /prompt/i }), {
      target: { value: "a mountain lake" },
    });
    fireEvent.submit(screen.getByRole("form", { name: /image generation/i }));

    await flush();
    await flush();

    expect(axiosMock.default.get).toHaveBeenCalledWith(
      "/api/v1/image-jobs/job-1",
    );
    expect(toastMock.success).toHaveBeenCalledWith("Image generated");
  });
});