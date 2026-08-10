import type {
  AiEnhancePromptRequest,
  AiEnhancePromptResult,
  AiStoryboardStrategy,
  AiStoryboardStrategyRequest,
} from "@/types";

/**
 * Thrown when the AI service responds with a non-2xx status or cannot be
 * reached. `status` mirrors the HTTP status so API routes can forward it.
 */
export class AiServiceError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AiServiceError";
    this.status = status;
  }
}

const DEFAULT_AI_SERVICE_URL = "http://localhost:8000";
const DEFAULT_TIMEOUT_MS = 60_000;

/** Server-side config for the AI service (never exposed to the client). */
export function getAiServiceConfig() {
  return {
    baseUrl: (process.env.AI_SERVICE_URL || DEFAULT_AI_SERVICE_URL).replace(
      /\/+$/,
      ""
    ),
    timeoutMs: Number(process.env.AI_SERVICE_TIMEOUT_MS) || DEFAULT_TIMEOUT_MS,
  };
}

async function request<T>(path: string, body: unknown): Promise<T> {
  const { baseUrl, timeoutMs } = getAiServiceConfig();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: controller.signal,
    });

    if (!response.ok) {
      let detail = `AI service returned HTTP ${response.status}`;
      try {
        const data = await response.json();
        if (data?.detail) {
          detail = String(data.detail);
        }
      } catch {
        // Non-JSON error body; keep the default message.
      }
      throw new AiServiceError(response.status, detail);
    }

    return (await response.json()) as T;
  } catch (error) {
    if (error instanceof AiServiceError) {
      throw error;
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceError(
        504,
        "The AI service timed out. Try again with shorter content."
      );
    }
    throw new AiServiceError(
      502,
      `Cannot reach the AI service at ${baseUrl}. Is it running?`
    );
  } finally {
    clearTimeout(timer);
  }
}

/** Generates a creative strategy + scene plan for a storyboard. */
export function generateStoryboardStrategy(
  req: AiStoryboardStrategyRequest
): Promise<AiStoryboardStrategy> {
  return request<AiStoryboardStrategy>("/v1/ai/storyboard-strategy", req);
}

/** Enriches a raw scene prompt into a production-ready generation prompt. */
export function enhanceScenePrompt(
  req: AiEnhancePromptRequest
): Promise<AiEnhancePromptResult> {
  return request<AiEnhancePromptResult>("/v1/ai/enhance-prompt", req);
}