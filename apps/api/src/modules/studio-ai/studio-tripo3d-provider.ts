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

export const TRIPO_3D_PROVIDER_ID = "tripo-3d" as const;
export const TRIPO_3D_OPENAPI_DEFAULT_BASE_URL = "https://api.tripo3d.ai" as const;
export const TRIPO_3D_CREDITS_EXHAUSTED_PROVIDER_CODE = "tripo-credits-exhausted" as const;

export type Tripo3dModelVersion =
  | "v3.1-20260211"
  | "P1-20260311"
  | "P2-20260801"
  | "v3.0-20250812"
  | "v2.5-20250123";

const DEFAULT_TIMEOUT_MS = 60_000;
const DEFAULT_FIRST_POLL_DELAY_MS = 2_000;
const DEFAULT_MAX_POLL_DELAY_MS = 10_000;
const DEFAULT_DEADLINE_MS = 15 * 60_000;
const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

const LOW_POLY_PROMPT_REGEX =
  /\b(low[-_\s]?poly|lowpoly|stylized\s+game\s+prop|mobile\s+mesh)\b|로우\s*폴리|저폴리곤/iu;

export type Tripo3dFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface Tripo3dProviderConfig {
  readonly apiKey: string;
  readonly baseUrl?: string;
  readonly timeoutMs?: number;
  readonly maxImageBytes?: number;
  readonly fetchImpl?: Tripo3dFetch;
  readonly now?: () => number;
}

export interface Tripo3dArtifactsWithBinary extends Studio3dGenerationArtifacts {
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
      message: "Tripo 3D provider URL must use HTTPS.",
    });
  }
  return parsed.toString().replace(/\/+$/u, "");
}

export function isTripo3dCreditsExhaustedError(error: unknown): boolean {
  return (
    error instanceof Studio3dGenerationProviderError &&
    (error.responseStatus === 402 ||
      error.providerCode === TRIPO_3D_CREDITS_EXHAUSTED_PROVIDER_CODE)
  );
}

export function selectTripo3dModelVersion(options: {
  readonly requestedModel?: unknown;
  readonly prompt?: string;
  readonly quad?: boolean;
  readonly smartLowPoly?: boolean;
}): Tripo3dModelVersion {
  if (
    options.requestedModel === "v3.1-20260211" ||
    options.requestedModel === "P1-20260311" ||
    options.requestedModel === "P2-20260801" ||
    options.requestedModel === "v3.0-20250812" ||
    options.requestedModel === "v2.5-20250123"
  ) {
    return options.requestedModel;
  }
  const isLowPoly =
    Boolean(options.smartLowPoly) ||
    (typeof options.prompt === "string" && LOW_POLY_PROMPT_REGEX.test(options.prompt));
  if (isLowPoly) {
    return options.quad ? "P2-20260801" : "P1-20260311";
  }
  return "v3.1-20260211";
}

function clampFaceLimit(
  requested: unknown,
  modelVersion: Tripo3dModelVersion,
  quad: boolean,
): number | undefined {
  if (typeof requested !== "number" || !Number.isFinite(requested) || requested <= 0) {
    return undefined;
  }
  if (modelVersion === "P1-20260311") {
    return Math.max(50, Math.min(20_000, Math.round(requested)));
  }
  if (modelVersion === "P2-20260801") {
    const max = quad ? 25_000 : 50_000;
    return Math.max(48, Math.min(max, Math.round(requested)));
  }
  const max = quad ? 150_000 : 2_000_000;
  return Math.max(1_000, Math.min(max, Math.round(requested)));
}

function mapTripoFailure(status: number, payload: JsonRecord): Studio3dGenerationProviderError {
  const tripoCode = typeof payload.code === "number" ? payload.code : undefined;
  const rawMessage =
    boundedString(payload.message, 240) ??
    boundedString(payload.suggestion, 240) ??
    `Tripo 3D rejected the request with HTTP ${status}.`;
  if (status === 401 || status === 403) {
    return new Studio3dGenerationProviderError({
      code: "authentication",
      message: "Tripo 3D authentication failed.",
      responseStatus: status,
      providerCode: String(tripoCode ?? rawMessage),
    });
  }
  if (status === 402 || tripoCode === 2010 || /credit|balance/iu.test(rawMessage)) {
    return new Studio3dGenerationProviderError({
      code: "provider-rejected",
      message: `Tripo 3D credits are exhausted: ${rawMessage}`,
      retryable: false,
      responseStatus: 402,
      providerCode: TRIPO_3D_CREDITS_EXHAUSTED_PROVIDER_CODE,
    });
  }
  if (status === 429 || tripoCode === 2000) {
    return new Studio3dGenerationProviderError({
      code: "rate-limited",
      message: "Tripo 3D rate limit was reached.",
      retryable: true,
      responseStatus: 429,
      providerCode: String(tripoCode ?? "2000"),
    });
  }
  if (tripoCode === 2008) {
    return new Studio3dGenerationProviderError({
      code: "provider-rejected",
      message: `Tripo 3D content policy rejection: ${rawMessage}`,
      retryable: false,
      responseStatus: status,
      providerCode: "2008",
    });
  }
  if (status >= 500 || tripoCode === 1000) {
    return new Studio3dGenerationProviderError({
      code: "provider-unavailable",
      message: "Tripo 3D is temporarily unavailable.",
      retryable: true,
      responseStatus: status,
      providerCode: String(tripoCode ?? status),
    });
  }
  return new Studio3dGenerationProviderError({
    code: "provider-rejected",
    message: rawMessage,
    responseStatus: status,
    providerCode: tripoCode !== undefined ? String(tripoCode) : undefined,
  });
}

function normalizeTripoState(rawStatus: string, hasModelUrl: boolean): Studio3dGenerationJobState {
  const lower = rawStatus.toLowerCase();
  if (hasModelUrl || lower === "success" || lower === "succeeded" || lower === "completed") {
    return "succeeded";
  }
  if (
    lower === "failed" ||
    lower === "banned" ||
    lower === "expired" ||
    lower === "cancelled" ||
    lower === "canceled"
  ) {
    return "failed";
  }
  if (lower === "queued" || lower === "pending") {
    return "queued";
  }
  return "running";
}

function extractModelUrl(data: JsonRecord): string | null {
  const output = recordOf(data.output);
  const result = recordOf(data.result);
  const candidates: unknown[] = [
    output?.pbr_model,
    output?.model,
    output?.base_model,
    recordOf(result?.pbr_model)?.url,
    recordOf(result?.model)?.url,
    recordOf(result?.base_model)?.url,
  ];
  for (const item of candidates) {
    const str = boundedString(item, 2048);
    if (str) return str;
  }
  return null;
}

export class Tripo3dProvider implements Studio3dGenerationProvider {
  readonly providerId = TRIPO_3D_PROVIDER_ID;
  readonly #apiKey: string;
  readonly #baseUrl: string;
  readonly #timeoutMs: number;
  readonly #maxImageBytes: number;
  readonly #fetch: Tripo3dFetch;
  readonly #now: () => number;

  constructor(config: Tripo3dProviderConfig) {
    const rawKey = config.apiKey.trim();
    this.#apiKey = rawKey.startsWith("tripo:") ? rawKey.slice("tripo:".length).trim() : rawKey;
    this.#baseUrl = sanitizeBaseUrl(config.baseUrl, TRIPO_3D_OPENAPI_DEFAULT_BASE_URL);
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
      modes: ["text-to-3d", "image-to-3d", "multiview-to-3d", "texture-only"],
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
        message: "Tripo 3D API key is not configured.",
      });
    }
  }

  #authHeaders(extra?: Readonly<Record<string, string>>): Record<string, string> {
    return {
      Authorization: `Bearer ${this.#apiKey}`,
      Accept: "application/json",
      ...extra,
    };
  }

  async #requestJson(
    url: string,
    init: RequestInit,
    signal: AbortSignal,
  ): Promise<{ readonly response: Response; readonly payload: JsonRecord }> {
    if (signal.aborted) {
      throw new Studio3dGenerationProviderError({
        code: "cancelled",
        message: "Tripo 3D request was cancelled.",
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
            message: "Tripo 3D returned a non-JSON response.",
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

  async #uploadImageToken(
    image: { readonly filename: string; readonly mimeType: string; readonly bytes: Uint8Array },
    signal: AbortSignal,
  ): Promise<{ readonly fileToken: string; readonly fileType: string }> {
    if (image.bytes.byteLength < 1 || image.bytes.byteLength > this.#maxImageBytes) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-request",
        message: `Tripo 3D image ${image.filename} exceeds maximum allowed byte budget.`,
      });
    }
    const form = new FormData();
    form.append(
      "file",
      new Blob([new Uint8Array(image.bytes)], { type: image.mimeType }),
      image.filename,
    );
    const { response, payload } = await this.#requestJson(
      `${this.#baseUrl}/v2/openapi/upload/sts`,
      {
        method: "POST",
        headers: this.#authHeaders(),
        body: form,
      },
      signal,
    );
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
      throw mapTripoFailure(response.status, payload);
    }
    const data = recordOf(payload.data);
    const token = boundedString(data?.image_token) ?? boundedString(data?.file_token);
    if (!token) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "Tripo 3D upload did not return an image_token.",
        responseStatus: response.status,
      });
    }
    const ext = image.filename.split(".").pop()?.toLowerCase() || "png";
    return { fileToken: token, fileType: ext === "jpeg" ? "jpg" : ext };
  }

  async submit(
    request: Studio3dGenerationRequest,
    signal: AbortSignal,
  ): Promise<Studio3dGenerationSubmission> {
    this.#assertConfigured();
    const extOpts = recordOf(request.options) ?? {};
    const quad = request.options?.meshMode === "Quad" || extOpts.quad === true;
    const modelVersion = selectTripo3dModelVersion({
      requestedModel: extOpts.tripoModelVersion ?? request.options?.tier,
      prompt: request.prompt,
      quad,
      smartLowPoly: Boolean(extOpts.smartLowPoly),
    });
    const effectiveQuad = modelVersion === "P1-20260311" ? false : quad;
    const faceLimit = clampFaceLimit(request.options?.targetFaceCount, modelVersion, effectiveQuad);
    const generateTexture = request.options?.material !== "None";
    const pbr = request.options?.material !== "Shaded" && generateTexture;
    const textureQuality =
      request.options?.textureResolution === "High" ||
      request.options?.highDefinitionTexture === true ||
      extOpts.textureQuality === "detailed"
        ? "detailed"
        : "standard";

    const baseGenBody: Record<string, unknown> = {
      model_version: modelVersion,
      texture: generateTexture,
      pbr,
      texture_quality: textureQuality,
      auto_size: Boolean(extOpts.autoSize ?? true),
      ...(effectiveQuad ? { quad: true } : {}),
      ...(faceLimit !== undefined ? { face_limit: faceLimit } : {}),
      ...(typeof request.options?.seed === "number" ? { model_seed: request.options.seed } : {}),
    };
    if (modelVersion !== "P1-20260311") {
      if (extOpts.smartLowPoly) baseGenBody.smart_low_poly = true;
      if (extOpts.generateParts) baseGenBody.generate_parts = true;
      if (extOpts.geometryQuality === "detailed" || request.options?.quality === "high") {
        baseGenBody.geometry_quality = "detailed";
      }
    }

    let endpoint = `${this.#baseUrl}/v3/generation/text-to-model`;
    let body: Record<string, unknown> = baseGenBody;

    if (request.mode === "text-to-3d") {
      const prompt = boundedString(request.prompt, 1024);
      if (!prompt) {
        throw new Studio3dGenerationProviderError({
          code: "invalid-request",
          message: "Tripo 3D text-to-3d requires a non-empty prompt.",
        });
      }
      const poseSuffix =
        extOpts.pose === "T-Pose" || request.options?.taPose === true
          ? ", t-pose:1.0:1.0:1.0:1.0:9.0"
          : extOpts.pose === "A-Pose"
            ? ", a-pose:1.0:1.0:1.0:1.0:9.0"
            : "";
      body = { ...baseGenBody, prompt: `${prompt}${poseSuffix}` };
    } else if (request.mode === "image-to-3d") {
      const firstImage = request.images?.[0];
      if (!firstImage) {
        throw new Studio3dGenerationProviderError({
          code: "invalid-request",
          message: "Tripo 3D image-to-3d requires at least one reference image.",
        });
      }
      const uploaded = await this.#uploadImageToken(firstImage, signal);
      endpoint = `${this.#baseUrl}/v3/generation/image-to-model`;
      body = {
        ...baseGenBody,
        file: { type: uploaded.fileType, file_token: uploaded.fileToken },
      };
    } else if (request.mode === "multiview-to-3d") {
      const images = request.images ?? [];
      if (images.length < 2) {
        throw new Studio3dGenerationProviderError({
          code: "invalid-request",
          message: "Tripo 3D multiview-to-3d requires at least 2 view images.",
        });
      }
      const uploadedTokens = await Promise.all(
        images.slice(0, 4).map((img) => this.#uploadImageToken(img, signal)),
      );
      endpoint = `${this.#baseUrl}/v3/generation/multiview-to-model`;
      body = {
        ...baseGenBody,
        files: uploadedTokens.map((u) => ({ type: u.fileType, file_token: u.fileToken })),
      };
    } else if (request.mode === "texture-only") {
      const originalTaskId = boundedString(extOpts.originalModelTaskId, 128);
      if (!originalTaskId) {
        throw new Studio3dGenerationProviderError({
          code: "invalid-request",
          message: "Tripo 3D texture-only requires options.originalModelTaskId.",
        });
      }
      endpoint = `${this.#baseUrl}/v3/postprocess/texture`;
      body = {
        original_model_task_id: originalTaskId,
        model_version: "v3.5-20260815",
        texture: true,
        pbr: true,
        texture_quality: textureQuality,
        ...(request.prompt ? { text_prompt: request.prompt.trim() } : {}),
        ...(extOpts.delight || request.options?.textureDelight ? { delight: true } : {}),
      };
    }

    const { response, payload } = await this.#requestJson(
      endpoint,
      {
        method: "POST",
        headers: this.#authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify(body),
      },
      signal,
    );
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
      throw mapTripoFailure(response.status, payload);
    }
    const data = recordOf(payload.data);
    const taskUuid = boundedString(data?.task_id) ?? boundedString(payload.task_id);
    if (!taskUuid) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "Tripo 3D submission did not return task_id.",
        responseStatus: response.status,
      });
    }
    return {
      schemaVersion: STUDIO_3D_GENERATION_PROVIDER_CONTRACT_VERSION,
      providerId: this.providerId,
      requestId: request.requestId,
      taskUuid,
      subscriptionKey: modelVersion,
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
    const { response, payload } = await this.#requestJson(
      `${this.#baseUrl}/v2/openapi/task/${encodeURIComponent(job.taskUuid)}`,
      { method: "GET", headers: this.#authHeaders() },
      signal,
    );
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
      throw mapTripoFailure(response.status, payload);
    }
    const data = recordOf(payload.data) ?? payload;
    const rawStatus = boundedString(data.status) ?? "running";
    const modelUrl = extractModelUrl(data);
    const state = normalizeTripoState(rawStatus, Boolean(modelUrl));
    if (state === "failed") {
      throw new Studio3dGenerationProviderError({
        code: "generation-failed",
        message: boundedString(data.message) ?? `Tripo 3D task ended with status: ${rawStatus}.`,
        providerCode: rawStatus,
      });
    }
    const progressPercent =
      typeof data.progress === "number" && Number.isFinite(data.progress)
        ? Math.max(0, Math.min(100, Math.round(data.progress)))
        : state === "succeeded"
          ? 100
          : null;
    const jobs: Studio3dGenerationJobProgress[] = [
      {
        jobUuid: job.taskUuid,
        status: state === "succeeded" ? "Completed" : rawStatus,
        progressPercent,
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
  ): Promise<Tripo3dArtifactsWithBinary> {
    this.#assertConfigured();
    const { response, payload } = await this.#requestJson(
      `${this.#baseUrl}/v2/openapi/task/${encodeURIComponent(job.taskUuid)}`,
      { method: "GET", headers: this.#authHeaders() },
      signal,
    );
    if (!response.ok || (typeof payload.code === "number" && payload.code !== 0)) {
      throw mapTripoFailure(response.status, payload);
    }
    const data = recordOf(payload.data) ?? payload;
    const glbUrl = extractModelUrl(data);
    if (!glbUrl) {
      throw new Studio3dGenerationProviderError({
        code: "invalid-response",
        message: "Tripo 3D task output did not include a downloadable model URL.",
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
        message: "Tripo 3D returned an insecure artifact URL.",
      });
    }
    const binaryResp = await this.#fetch(glbUrl, { method: "GET", signal });
    if (!binaryResp.ok) {
      throw new Studio3dGenerationProviderError({
        code: "provider-unavailable",
        message: `Tripo 3D GLB binary download failed with HTTP ${binaryResp.status}.`,
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

export function createTripo3dProvider(config: Tripo3dProviderConfig): Tripo3dProvider {
  return new Tripo3dProvider(config);
}
