import type { StudioAiCapabilityConfig } from "./studio-ai-capabilities";
import {
  ensureCapabilityConfigured,
  providerNetworkError,
  runStudioAiCapability,
  throwForProviderErrorResponse,
  StudioAiCapabilityInputError,
  StudioAiCapabilityProviderError,
  type StudioAiCapabilityRun,
  type StudioAiMediaFetch,
} from "./studio-ai-media";

/**
 * Cloudflare Workers AI 무료 할당 어댑터 — 이미지 생성(FLUX.1-schnell)과 텍스트 임베딩(bge-m3).
 * 기존 풀의 Cloudflare 계정·토큰을 그대로 재사용한다 (신규 키 0).
 * 실제 외부 호출은 이 파일의 함수들이 유일한 경계이며, 테스트는 fetch를 목으로 주입한다.
 * Neurons 추정은 공식 가격표(2026-10-06 확인) 단가로 계산한 근사값으로,
 * 쿼터 원장에 실측 대신 기록할 때 쓰는 값이다.
 */

// ---------------------------------------------------------------------------
// 이미지 생성
// ---------------------------------------------------------------------------

export interface StudioAiImageGenerationInput {
  prompt: string;
  /** FLUX.1-schnell 스텝 수 (1~8). 생략하면 제공자 기본값. */
  steps?: number;
  seed?: number;
}

export interface StudioAiImageGenerationResult {
  provider: "cloudflare";
  model: string;
  /** base64 JPEG (제공자 응답 그대로). */
  imageBase64: string;
  contentType: "image/jpeg";
  /** 공식 단가 기준 근사: 512x512 타일당 4.80 + 스텝당 9.60 Neurons, 기본 출력 1024x1024=4타일. */
  estimatedNeurons: number;
}

const FLUX_NEURONS_PER_TILE = 4.8;
const FLUX_NEURONS_PER_STEP = 9.6;
const FLUX_DEFAULT_TILES = 4; // 1024x1024
const FLUX_DEFAULT_STEPS = 4;

function validateImageInput(input: StudioAiImageGenerationInput): void {
  if (!input.prompt.trim() || input.prompt.length > 4_000) {
    throw new StudioAiCapabilityInputError(
      "image-generation",
      "이미지 생성 지시는 1~4,000자로 입력해야 해요.",
    );
  }
  if (
    input.steps !== undefined
    && (!Number.isInteger(input.steps) || input.steps < 1 || input.steps > 8)
  ) {
    throw new StudioAiCapabilityInputError("image-generation", "스텝 수는 1~8 사이 정수예요.");
  }
  if (
    input.seed !== undefined
    && (!Number.isInteger(input.seed) || input.seed < 0)
  ) {
    throw new StudioAiCapabilityInputError("image-generation", "seed는 0 이상 정수예요.");
  }
}

interface CloudflareEnvelope<T> {
  result?: T;
  success?: boolean;
  errors?: unknown;
}

async function postCloudflareRun<T>(
  config: StudioAiCapabilityConfig,
  body: Record<string, unknown>,
  fetchFn: StudioAiMediaFetch,
  signal?: AbortSignal,
): Promise<T> {
  let response: Response;
  try {
    response = await fetchFn(config.endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      ...(signal ? { signal } : {}),
    });
  } catch {
    throw providerNetworkError(config);
  }
  if (!response.ok) await throwForProviderErrorResponse(config, response);
  const envelope = (await response.json()) as CloudflareEnvelope<T>;
  // HTTP 200인데 봉투가 실패를 말하면 "형식이 깨진 성공"이라 재전송하지 않는다 (풀 원칙).
  if (envelope.success === false || envelope.result === undefined) {
    throw new StudioAiCapabilityProviderError(config, {
      kind: "request_rejected",
      billingFailoverEligible: false,
    });
  }
  return envelope.result;
}

export async function generateImageWithCloudflare(
  config: StudioAiCapabilityConfig,
  input: StudioAiImageGenerationInput,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiImageGenerationResult> {
  ensureCapabilityConfigured(config);
  validateImageInput(input);
  const steps = input.steps ?? FLUX_DEFAULT_STEPS;
  const result = await postCloudflareRun<{ image?: unknown }>(config, {
    prompt: input.prompt,
    ...(input.steps !== undefined ? { steps: input.steps } : {}),
    ...(input.seed !== undefined ? { seed: input.seed } : {}),
  }, fetchFn, signal);
  if (typeof result.image !== "string" || result.image.length === 0) {
    throw new StudioAiCapabilityProviderError(config, {
      kind: "request_rejected",
      billingFailoverEligible: false,
    });
  }
  return {
    provider: "cloudflare",
    model: config.model,
    imageBase64: result.image,
    contentType: "image/jpeg",
    estimatedNeurons: Math.ceil(
      FLUX_NEURONS_PER_TILE * FLUX_DEFAULT_TILES + FLUX_NEURONS_PER_STEP * steps,
    ),
  };
}

export function generateImageWithFreePool(
  input: StudioAiImageGenerationInput,
  env: Partial<Record<string, string | undefined>> = process.env,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiCapabilityRun<StudioAiImageGenerationResult>> {
  return runStudioAiCapability("image-generation", env, (config) =>
    generateImageWithCloudflare(config, input, fetchFn, signal));
}

// ---------------------------------------------------------------------------
// 텍스트 임베딩
// ---------------------------------------------------------------------------

export interface StudioAiEmbeddingInput {
  /** 1~100개. 작품·설정처럼 한국어 텍스트를 그대로 넣는다 (bge-m3 다국어). */
  texts: string[];
}

export interface StudioAiEmbeddingResult {
  provider: "cloudflare";
  model: string;
  dimensions: number;
  embeddings: number[][];
  /** 공식 단가 기준 근사: 입력 100만 토큰당 1,075 Neurons. 토큰 수는 문자수/4로 어림한다. */
  estimatedNeurons: number;
}

export const STUDIO_AI_EMBEDDING_MAX_TEXTS = 100;
export const STUDIO_AI_EMBEDDING_MAX_TEXT_LENGTH = 8_000;
const BGE_M3_NEURONS_PER_MILLION_TOKENS = 1_075;

function validateEmbeddingInput(input: StudioAiEmbeddingInput): void {
  if (!Array.isArray(input.texts) || input.texts.length === 0) {
    throw new StudioAiCapabilityInputError("embedding", "임베딩할 텍스트가 비어 있어요.");
  }
  if (input.texts.length > STUDIO_AI_EMBEDDING_MAX_TEXTS) {
    throw new StudioAiCapabilityInputError(
      "embedding",
      `한 번에 ${STUDIO_AI_EMBEDDING_MAX_TEXTS}개까지만 임베딩할 수 있어요.`,
    );
  }
  for (const text of input.texts) {
    if (typeof text !== "string" || !text.trim() || text.length > STUDIO_AI_EMBEDDING_MAX_TEXT_LENGTH) {
      throw new StudioAiCapabilityInputError(
        "embedding",
        `텍스트는 1~${STUDIO_AI_EMBEDDING_MAX_TEXT_LENGTH}자로 입력해야 해요.`,
      );
    }
  }
}

export async function embedTextWithCloudflare(
  config: StudioAiCapabilityConfig,
  input: StudioAiEmbeddingInput,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiEmbeddingResult> {
  ensureCapabilityConfigured(config);
  validateEmbeddingInput(input);
  const result = await postCloudflareRun<{ data?: unknown; shape?: unknown }>(config, {
    text: input.texts,
  }, fetchFn, signal);

  const rows: unknown[] = Array.isArray(result.data) ? result.data : [];
  const shape: unknown[] = Array.isArray(result.shape) ? result.shape : [];
  const dimensions = typeof shape[1] === "number" ? shape[1] : 0;
  if (rows.length !== input.texts.length || dimensions <= 0) {
    throw new StudioAiCapabilityProviderError(config, {
      kind: "request_rejected",
      billingFailoverEligible: false,
    });
  }
  const embeddings: number[][] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length !== dimensions) {
      throw new StudioAiCapabilityProviderError(config, {
        kind: "request_rejected",
        billingFailoverEligible: false,
      });
    }
    const vector: number[] = [];
    for (const value of row as unknown[]) {
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new StudioAiCapabilityProviderError(config, {
          kind: "request_rejected",
          billingFailoverEligible: false,
        });
      }
      vector.push(value);
    }
    embeddings.push(vector);
  }
  const totalChars = input.texts.reduce((sum, text) => sum + text.length, 0);
  return {
    provider: "cloudflare",
    model: config.model,
    dimensions,
    embeddings,
    estimatedNeurons: Math.max(
      1,
      Math.ceil((totalChars / 4 / 1_000_000) * BGE_M3_NEURONS_PER_MILLION_TOKENS),
    ),
  };
}

export function embedTextWithFreePool(
  input: StudioAiEmbeddingInput,
  env: Partial<Record<string, string | undefined>> = process.env,
  fetchFn: StudioAiMediaFetch = fetch,
  signal?: AbortSignal,
): Promise<StudioAiCapabilityRun<StudioAiEmbeddingResult>> {
  return runStudioAiCapability("embedding", env, (config) =>
    embedTextWithCloudflare(config, input, fetchFn, signal));
}
