import {
  STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
  Studio3dGenerationProviderError,
  type Studio3dGenerationArtifacts,
  type Studio3dGenerationCapabilities,
  type Studio3dGenerationJobIdentity,
  type Studio3dGenerationJobProgress,
  type Studio3dGenerationJobState,
  type Studio3dGenerationProgress,
  type Studio3dGenerationProvider,
  type Studio3dGenerationRequest,
  type Studio3dGenerationSubmission,
} from "./studio-3d-generation-provider";

export const VARCO_3D_PROVIDER_ID = "varco-3d" as const;
export const VARCO_3D_NC_OPENAPI_DEFAULT_BASE_URL = "https://openapi.ai.nc.com" as const;
export const VARCO_3D_STUDIO_DEFAULT_BASE_URL = "https://3d.varco.ai/api/external-api" as const;

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_FIRST_POLL_DELAY_MS = 3_000;
const DEFAULT_MAX_POLL_DELAY_MS = 20_000;
const DEFAULT_DEADLINE_MS = 10 * 60_000;
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type Varco3dSurface = "nc-openapi" | "studio";

export type Varco3dFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface Varco3dProviderConfig {
  readonly apiKey: string;
  readonly surface?: Varco3dSurface;
  readonly ncOpenApiBaseUrl?: string;
  readonly studioBaseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxImageBytes?: number;
  readonly fetchImpl?: Varco3dFetch;
  readonly now?: () => number;
}

export interface Varco3dArtifactsWithBinary extends Studio3dGenerationArtifacts {
  readonly bytes: Uint8Array;
  readonly mimeType: string;
  readonly filename: string;
}

type JsonRecord = Record<string, unknown>;

function recordOf(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function boundedString(value: unknown, maxLength = 512): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function sanitizeBaseUrl(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  const parsed = new URL(candidate);
  if (
    parsed.protocol !== "https:" &&
    parsed.hostname !== "127.0.0.1" &&
    parsed.hostname !== "localhost"
  ) {
    throw new Studio3dGenerationProviderError({
      code: "invalid-request",
      message: "VARCO 3D provider URL must use HTTPS.",
    });
  }
  return parsed.toString().replace(/\/+$/u, "");
}

function mapHttpFailure(
  status: number,
  payload: unknown,
): Studio3dGenerationProviderError {
  const rec = recordOf(payload);
  const rawMessage =
    boundedString(rec?.message, 240) ??
    boundedString(rec?.error, 240) ??
    `VARCO 3D rejected the request with HTTP ${status}.`;
  if (status === 401 || status === 403) {
    return new Studio3dGenerationProviderError({
      code: "authentication",
      message: "VARCO 3D authentication failed.",
      responseStatus: status,
      providerCode: rawMessage,
    });
  }
  if (status === 429) {
    return new Studio3dGenerationProviderError({
      code: "rate-limited",
      message: "VARCO 3D rate limit was reached.",
      retryable: true,
      responseStatus: status,
    });
  }
  if (status >= 500) {
    return new Studio3dGenerationProviderError({
      code: "provider-unavailable",
      message: "VARCO 3D is temporarily unavailable.",
      retryable: true,
      responseStatus: status,
    });
  }
  return new Studio3dGenerationProviderError({
    code: "provider-rejected",
    message: rawMessage,
    responseStatus: status,
  });
}

function normalizeStatusToJobState(rawStatus: string, hasModelUrl: boolean): Studio3dGenerationJobState {
  const upper = rawStatus.toUpperCase();
  if (
    hasModelUrl ||
    upper === "COMPLETED" ||
    upper === "DONE" ||
    upper === "SUCCEEDED" ||
    upper === "SUCCESS"
  ) {
    return "succeeded";
  }
  if (
    upper === "FAILED" ||
    upper === "ERROR" ||
    upper === "CANCELLED" ||
    upper === "CANCELED"
  ) {
    return "failed";
  }
  if (upper === "PENDING" || upper === "QUEUED") {
    return "queued";
  }
  return "running";
}

function clampPolygonCount(
  requested: number | undefined,
  surface: Varco3dSurface,
): number {
  const maxFaces = surface === "nc-openapi" ? 300_000 : 1_000_000;
  const fallback = surface === "nc-openapi" ? 300_000 : 500_000;
  if (typeof requested !== "number" || !Number.isFinite(requested)) return fallback;
  return Math.max(1_000, Math.min(maxFaces, Math.round(requested)));
}

export class Varco3dProvider implements Studio3dGenerationProvider {
  readonly providerId = VARCO_3D_PROVIDER_ID;
  readonly #apiKey: string;
  readonly #surface: Varco3dSurface;
  readonly #ncOpenApiBaseUrl: string;
  readonly #studioBaseUrl: string;
  readonly #timeoutMs: number;
  readonly #maxImageBytes: number;
  readonly #fetch: Varco3dFetch;
  readonly #now: () => number;

  constructor(config: Varco3dProviderConfig) {
    const rawKey = config.apiKey.trim();
    this.#apiKey = rawKey.startsWith("varco:") ? rawKey.slice("varco:".length).trim() : rawKey;
    this.#surface = config.surface ?? "nc-openapi";
    this.#ncOpenApiBaseUrl = sanitizeBaseUrl(
      config.ncOpenApiBaseUrl,
      VARCO_3D_NC_OPENAPI_DEFAULT_BASE_URL,
    );
    this.#studioBaseUrl = sanitizeBaseUrl(
      config.studioBaseUrl,
      VARCO_3D_STUDIO_DEFAULT_BASE_URL,
    );
    this.#timeoutMs =
      typeof config.timeoutMs === "number" &&
      Number.isFinite(config.timeoutMs) &&
      config.timeoutMs >= 1_000
        ? Math.round(config.timeoutMs)
        : DEFAULT_TIMEOUT_MS;
    this.#maxImageBytes = config.maxImageBytes ?? DEFAULT_MAX_IMAGE_BYTES;
    this.#fetch = config.fetchImpl ?? fetch;
    this.#now = config.now ?? Date.now;
  }

  async capabilities(): Promise<Studio3dGenerationCapabilities> {
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      modes: ["image-to-3d", "multiview-to-3d"],
      maxImages: 4,
      supportedFormats: ["glb"],
      supportsCancellation: false,
      firstPollDelayMs: DEFAULT_FIRST_POLL_DELAY_MS,
      maxPollDelayMs: DEFAULT_MAX_POLL_DELAY_MS,
      deadlineMs: DEFAULT_DEADLINE_MS,
    };
  }

  #assertConfigured(): void {
    if (!this.#apiKey) {
      throw new Studio3dGenerationProviderError({
        code: "not-configured",
        message: "VARCO 3D API key is not configured.",
      });
    }
  }

  async #requestJson(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<{ readonly response: Response; readonly payload: JsonRecord }> {
    if (signal.aborted) {
      throw new Studio3dGenerationProviderError({
        code: "cancelled",
        message: "VARCO 3D request was cancelled.",
      });
    }
    const timeoutController = new AbortController();
    const timer = setTimeout(() => timeoutController.abort(), this.#timeoutMs);
    timer.unref?.();
    const onAbort = () => timeoutController.abort();
    signal.addEventListener("abort", onAbort, { once: true });
    try {
      const response = await this.#fetch(url, {
        ...init,
        signal: timeoutController.signal,
      });
      const text = await response.text();
      let payload: JsonRecord = {};
      if (text.trim()) {
        try {
          const parsed = JSON.parse(text) as unknown;
          payload = recordOf(parsed) ?? { data: parsed };
        } catch {
          throw new Studio3dGenerationProviderError({
            code: "invalid-response",
            message: "VARCO 3D returned a non-JSON response.",
            responseStatus: response.status,
          });
        }
      }
      return { response, payload };
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }
  }

  async submit(
    request: Studio3dGenerationRequest,
    signal: AbortSignal,
  ): Promise<Studio3dGenerationSubmission> {
    this.#assertConfigured();
    if (request.mode !== "image-to-3d" && request.mode !== "multiview-to-3d") {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: `VARCO 3D supports image-to-3d and multiview-to-3d modes (received ${request.mode}).`,
      });
    }
    const images = request.images ?? [];
    if (images.length === 0) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: "VARCO 3D generation requires at least one reference image.",
      });
    }
    for (const img of images) {
      if (img.bytes.byteLength < 1 || img.bytes.byteLength > this.#maxImageBytes) {
        throw new Studio3dGenerationProviderError({
          code: "invalid-request",
          message: `VARCO 3D image ${img.filename} exceeds maximum allowed byte budget.`,
        });
      }
    }

    const effectiveSurface: Varco3dSurface =
      request.mode === "multiview-to-3d" ? "studio" : this.#surface;
    const form = new FormData();
    const firstImage = images[0]!;

    if (effectiveSurface === "nc-openapi") {
      const faceType = request.options?.meshMode === "Quad" ? "quad" : "tri";
      const faceNum = clampPolygonCount(request.options?.targetFaceCount, "nc-openapi");
      const generateTexture = request.options?.material === "None" ? "false" : "true";
      const seed = typeof request.options?.seed === "number" ? String(request.options.seed) : "-1";
      form.append(
        "image",
        new Blob([new Uint8Array(firstImage.bytes)], { type: firstImage.mimeType }),
        firstImage.filename,
      );
      form.append("target_face_type", faceType);
      form.append("target_face_num", String(faceNum));
      form.append("generate_texture", generateTexture);
      form.append("seed", seed);

      const { response, payload } = await this.#requestJson(
        `${this.#ncOpenApiBaseUrl}/3d/varco/v1/image-to-3d`,
        {
          method: "POST",
          headers: { OPENAPI_KEY: this.#apiKey, Accept: "application/json" },
          body: form,
        },
        signal,
      );
      if (!response.ok) throw mapHttpFailure(response.status, payload);
      const taskUuid = boundedString(payload.requestId) ?? boundedString(payload.taskId);
      if (!taskUuid) {
        throw new Studio3dGenerationProviderError({
          code: "invalid-response",
          message: "VARCO 3D OpenAPI submission did not return requestId.",
          responseStatus: response.status,
        });
      }
      return {
        schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
        providerId: this.providerId,
        requestId: request.requestId,
        taskUuid,
        subscriptionKey: "nc-openapi",
        jobUuids: [taskUuid],
        consumedCredits: null,
        submittedAt: new Date(this.#now()).toISOString(),
      };
    }

    const polygonCount = clampPolygonCount(request.options?.targetFaceCount, "studio");
    const useAlpha = Boolean(request.options?.preserveAlpha);
    form.append("useAlpha", String(useAlpha));
    form.append("polygonCount", String(polygonCount));

    let endpoint = `${this.#studioBaseUrl}/v2/generate`;
    let subscriptionKey = "studio-v2";
    if (request.mode === "multiview-to-3d") {
      if (images.length < 2) {
        throw new Studio3dGenerationProviderError({
          code: "invalid-request",
          message: "VARCO 3D multiview-to-3d requires at least front and back images.",
        });
      }
      endpoint = `${this.#studioBaseUrl}/v1/mv/generate`;
      subscriptionKey = "studio-mv";
      const viewKeys = ["front", "back", "left", "right"] as const;
      images.slice(0, 4).forEach((img, idx) => {
        const key = viewKeys[idx] ?? "front";
        form.append(key, new Blob([new Uint8Array(img.bytes)], { type: img.mimeType }), img.filename);
      });
    } else {
      form.append(
        "image",
        new Blob([new Uint8Array(firstImage.bytes)], { type: firstImage.mimeType }),
        firstImage.filename,
      );
    }

    const { response, payload } = await this.#requestJson(
      endpoint,
      {
        method: "POST",
        headers: { "x-api-key": this.#apiKey, Accept: "application/json" },
        body: form,
      },
      signal,
    );
    if (!response.ok) throw mapHttpFailure(response.status, payload);
    const taskUuid = boundedString(payload.taskId) ?? boundedString(payload.requestId);
    if (!taskUuid) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "VARCO 3D Studio submission did not return taskId.",
        responseStatus: response.status,
      });
    }
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      requestId: request.requestId,
      taskUuid,
      subscriptionKey,
      jobUuids: [taskUuid],
      consumedCredits: null,
      submittedAt: new Date(this.#now()).toISOString(),
    };
  }

  async poll(
    job: Studio3dGenerationJobIdentity,
    signal: AbortSignal,
  ): Promise<Studio3dGenerationProgress> {
    this.#assertConfigured();
    const isStudio = job.subscriptionKey.startsWith("studio");
    const isMv = job.subscriptionKey === "studio-mv";
    const url = isStudio
      ? `${this.#studioBaseUrl}${isMv ? `/v1/mv/tasks/${job.taskUuid}` : `/v2/tasks/${job.taskUuid}`}`
      : `${this.#ncOpenApiBaseUrl}/inference/result/${job.taskUuid}`;
    const headers: Record<string, string> = isStudio
      ? { "x-api-key": this.#apiKey, Accept: "application/json" }
      : { OPENAPI_KEY: this.#apiKey, Accept: "application/json" };

    const { response, payload } = await this.#requestJson(url, { method: "GET", headers }, signal);
    if (!response.ok) throw mapHttpFailure(response.status, payload);

    const rawStatus = boundedString(payload.status) ?? "running";
    const hasModelUrl = Boolean(boundedString(payload.model_url) || boundedString(payload.glbUrl));
    const state = normalizeStatusToJobState(rawStatus, hasModelUrl);
    if (state === "failed") {
      throw new Studio3dGenerationProviderError({
        code: "generation-failed",
        message: boundedString(payload.errorMessage) ?? boundedString(payload.error) ?? "VARCO 3D generation failed.",
        providerCode: rawStatus,
      });
    }
    const jobs: Studio3dGenerationJobProgress[] = [
      {
        jobUuid: job.taskUuid,
        status: state === "succeeded" ? "Completed" : rawStatus,
        progressPercent: state === "succeeded" ? 100 : null,
      },
    ];
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      requestId: job.requestId,
      state,
      jobs,
      retryAfterMs: null,
    };
  }

  async download(
    job: Studio3dGenerationJobIdentity,
    signal: AbortSignal,
  ): Promise<Varco3dArtifactsWithBinary> {
    this.#assertConfigured();
    const isStudio = job.subscriptionKey.startsWith("studio");
    const metaUrl = isStudio
      ? `${this.#studioBaseUrl}/v2/tasks/${job.taskUuid}/download-glb`
      : `${this.#ncOpenApiBaseUrl}/inference/result/${job.taskUuid}`;
    const headers: Record<string, string> = isStudio
      ? { "x-api-key": this.#apiKey, Accept: "application/json" }
      : { OPENAPI_KEY: this.#apiKey, Accept: "application/json" };

    const { response, payload } = await this.#requestJson(
      metaUrl,
      { method: "GET", headers },
      signal,
    );
    if (!response.ok) throw mapHttpFailure(response.status, payload);

    const glbUrl = boundedString(payload.glbUrl) ?? boundedString(payload.model_url);
    if (!glbUrl) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "VARCO 3D download response did not include a GLB URL.",
      });
    }
    const parsedUrl = new URL(glbUrl);
    if (
      parsedUrl.protocol !== "https:" &&
      parsedUrl.hostname !== "127.0.0.1" &&
      parsedUrl.hostname !== "localhost"
    ) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "VARCO 3D returned an insecure artifact URL.",
      });
    }

    const binaryResp = await this.#fetch(glbUrl, { method: "GET", signal });
    if (!binaryResp.ok) {
      throw new Studio3dGenerationProviderError({
        code: "provider-unavailable",
        message: `VARCO 3D GLB binary download failed with HTTP ${binaryResp.status}.`,
        retryable: binaryResp.status >= 500,
        responseStatus: binaryResp.status,
      });
    }
    const bytes = new Uint8Array(await binaryResp.arrayBuffer());
    const filename = `${job.taskUuid}.glb`;
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      requestId: job.requestId,
      taskUuid: job.taskUuid,
      artifacts: [{ name: filename, url: glbUrl }],
      bytes,
      mimeType: "model/gltf-binary",
      filename,
    };
  }
}

export function createVarco3dProvider(config: Varco3dProviderConfig): Varco3dProvider {
  return new Varco3dProvider(config);
}
