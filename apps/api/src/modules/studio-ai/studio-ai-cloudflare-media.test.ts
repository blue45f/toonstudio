import { describe, expect, it, vi } from "vitest";

import type { StudioAiCapabilityConfig } from "./studio-ai-capabilities";
import {
  embedTextWithCloudflare,
  embedTextWithFreePool,
  generateImageWithCloudflare,
  generateImageWithFreePool,
} from "./studio-ai-cloudflare-media";
import {
  StudioAiCapabilityInputError,
  StudioAiCapabilityProviderError,
  type StudioAiMediaFetch,
} from "./studio-ai-media";

const ACCOUNT_ID = "0123456789abcdef0123456789abcdef";
const cloudflareEnv = {
  NODE_ENV: "production",
  STUDIO_AI_FREE_POOL_ENABLED: "true",
  STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID: ACCOUNT_ID,
  STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN: "cloudflare-media-token",
  STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED: "true",
};

function cloudflareConfig(
  capability: "image-generation" | "embedding",
): StudioAiCapabilityConfig {
  const model = capability === "image-generation"
    ? "@cf/black-forest-labs/flux-1-schnell"
    : "@cf/baai/bge-m3";
  return {
    provider: "cloudflare",
    capability,
    model,
    configured: true,
    endpoint: `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/${model}`,
    apiKey: "cloudflare-media-token",
    dataTerms: { dataUsage: "unconfirmed", dataTermsLabel: "test" },
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Cloudflare FLUX 이미지 생성 어댑터", () => {
  it("/ai/run 경로로 요청하고 봉투에서 base64 이미지와 Neurons 근사를 돌려준다", async () => {
    let capturedUrl = "";
    let capturedBody = "";
    const fetchFn: StudioAiMediaFetch = async (url, init) => {
      capturedUrl = url;
      capturedBody = String(init.body);
      return jsonResponse({ result: { image: "aGVsbG8=" }, success: true, errors: [] });
    };
    const result = await generateImageWithCloudflare(cloudflareConfig("image-generation"), {
      prompt: "밤 거리 배경",
      steps: 4,
      seed: 42,
    }, fetchFn);

    expect(capturedUrl).toBe(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/ai/run/@cf/black-forest-labs/flux-1-schnell`,
    );
    expect(JSON.parse(capturedBody)).toEqual({ prompt: "밤 거리 배경", steps: 4, seed: 42 });
    expect(result.imageBase64).toBe("aGVsbG8=");
    expect(result.contentType).toBe("image/jpeg");
    // 4타일*4.8 + 4스텝*9.6 = 57.6 → 58
    expect(result.estimatedNeurons).toBe(58);
  });

  it("스텝 범위 밖 입력은 호출 전에 거절하고 봉투 실패는 재전송 없이 확정 거절한다", async () => {
    const fetchFn = vi.fn<StudioAiMediaFetch>();
    await expect(generateImageWithCloudflare(cloudflareConfig("image-generation"), {
      prompt: "배경",
      steps: 9,
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    expect(fetchFn).not.toHaveBeenCalled();

    const envelopeError = await generateImageWithCloudflare(
      cloudflareConfig("image-generation"),
      { prompt: "배경" },
      async () => jsonResponse({ success: false, errors: [{ code: 1000 }] }),
    ).catch((error: unknown) => error);
    expect(envelopeError).toBeInstanceOf(StudioAiCapabilityProviderError);
    expect((envelopeError as StudioAiCapabilityProviderError).classification)
      .toMatchObject({ kind: "request_rejected", billingFailoverEligible: false });
  });

  it("403/5035는 유료 플랜 요구로 분류해 무료 쿼터 전환 가능으로 표시한다", async () => {
    const error = await generateImageWithCloudflare(
      cloudflareConfig("image-generation"),
      { prompt: "배경" },
      async () => jsonResponse({ errors: [{ code: 5035, message: "redacted" }] }, 403),
    ).catch((caught: unknown) => caught);
    expect((error as StudioAiCapabilityProviderError).classification).toMatchObject({
      kind: "free_quota_exhausted",
      billingFailoverEligible: true,
      businessCode: "5035",
    });
  });

  it("풀 경유 호출은 계정·토큰이 없으면 unavailable, 있으면 cloudflare로 확정한다", async () => {
    await expect(generateImageWithFreePool(
      { prompt: "배경" },
      { NODE_ENV: "production" },
      async () => jsonResponse({}),
    )).rejects.toMatchObject({ name: "StudioAiCapabilityUnavailableError" });

    const run = await generateImageWithFreePool(
      { prompt: "배경" },
      cloudflareEnv,
      async () => jsonResponse({ result: { image: "AA==" }, success: true }),
    );
    expect(run).toMatchObject({
      provider: "cloudflare",
      model: "@cf/black-forest-labs/flux-1-schnell",
    });
    expect(run.result.imageBase64).toBe("AA==");
  });
});

describe("Cloudflare bge-m3 임베딩 어댑터", () => {
  it("텍스트 배열을 보내고 shape와 개수를 검증해 벡터를 돌려준다", async () => {
    let capturedBody = "";
    const fetchFn: StudioAiMediaFetch = async (_url, init) => {
      capturedBody = String(init.body);
      return jsonResponse({
        result: { data: [[0.1, 0.2], [0.3, 0.4]], shape: [2, 2] },
        success: true,
      });
    };
    const result = await embedTextWithCloudflare(cloudflareConfig("embedding"), {
      texts: ["주인공은 검객이다", "배경은 밤의 항구"],
    }, fetchFn);
    expect(JSON.parse(capturedBody)).toEqual({
      text: ["주인공은 검객이다", "배경은 밤의 항구"],
    });
    expect(result.dimensions).toBe(2);
    expect(result.embeddings).toEqual([[0.1, 0.2], [0.3, 0.4]]);
    expect(result.estimatedNeurons).toBeGreaterThanOrEqual(1);
  });

  it("개수·차원이 어긋난 응답은 성공으로 바꾸지 않는다", async () => {
    const mismatch = await embedTextWithCloudflare(
      cloudflareConfig("embedding"),
      { texts: ["하나", "둘"] },
      async () => jsonResponse({ result: { data: [[0.1]], shape: [1, 1] }, success: true }),
    ).catch((error: unknown) => error);
    expect(mismatch).toBeInstanceOf(StudioAiCapabilityProviderError);

    const badValue = await embedTextWithCloudflare(
      cloudflareConfig("embedding"),
      { texts: ["하나"] },
      async () => jsonResponse({
        result: { data: [["숫자아님"]], shape: [1, 1] },
        success: true,
      }),
    ).catch((error: unknown) => error);
    expect(badValue).toBeInstanceOf(StudioAiCapabilityProviderError);
  });

  it("빈 텍스트와 상한 초과는 호출 전에 거절한다", async () => {
    const fetchFn = vi.fn<StudioAiMediaFetch>();
    await expect(embedTextWithCloudflare(cloudflareConfig("embedding"), {
      texts: [],
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    await expect(embedTextWithCloudflare(cloudflareConfig("embedding"), {
      texts: ["  "],
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    await expect(embedTextWithCloudflare(cloudflareConfig("embedding"), {
      texts: Array.from({ length: 101 }, () => "텍스트"),
    }, fetchFn)).rejects.toBeInstanceOf(StudioAiCapabilityInputError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("풀 경유 임베딩이 제공자·모델을 결과에 남긴다", async () => {
    const run = await embedTextWithFreePool(
      { texts: ["설정 텍스트"] },
      cloudflareEnv,
      async () => jsonResponse({ result: { data: [[0.5]], shape: [1, 1] }, success: true }),
    );
    expect(run.provider).toBe("cloudflare");
    expect(run.result.embeddings).toEqual([[0.5]]);
  });
});
