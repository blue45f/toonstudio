import { describe, expect, it } from "vitest";

import {
  isCloudflareEmbeddingModel,
  isCloudflareImageModel,
  isGroqTranscriptionModel,
  isGroqVisionModel,
  resolveStudioAiCapabilityProviders,
  studioAiCapabilityStatuses,
} from "./studio-ai-capabilities";
import { studioAiProviderStatuses } from "./studio-ai-provider";

const groqEnv = {
  NODE_ENV: "production",
  STUDIO_AI_FREE_POOL_ENABLED: "true",
  STUDIO_AI_FREE_GROQ_API_KEY: "groq-capability-key",
  STUDIO_AI_FREE_GROQ_CONFIRMED: "true",
};

describe("Studio AI capability registry — Groq 모달리티", () => {
  it("전사는 기존 Groq 키를 재사용해 신규 키 없이 등록된다", () => {
    const providers = resolveStudioAiCapabilityProviders("transcription", groqEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      provider: "groq",
      capability: "transcription",
      model: "whisper-large-v3",
      configured: true,
      endpoint: "https://api.groq.com/openai/v1/audio/transcriptions",
    });
  });

  it("비전은 공식 문서의 현행 모델만 기본값으로 등록된다", () => {
    const providers = resolveStudioAiCapabilityProviders("vision", groqEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      provider: "groq",
      capability: "vision",
      model: "qwen/qwen3.8-27b",
      endpoint: "https://api.groq.com/openai/v1/chat/completions",
    });
    expect(isGroqVisionModel("qwen/qwen3.8-27b")).toBe(true);
    // 문서에서 내려간 이전 비전 모델은 무료 경계에 넣지 않는다.
    expect(isGroqVisionModel("meta-llama/llama-4-scout-17b-16e-instruct")).toBe(false);
  });

  it("운영자 확인이 없으면 Groq 능력은 등록되지 않는다", () => {
    const { STUDIO_AI_FREE_GROQ_CONFIRMED: _unused, ...withoutConfirm } = groqEnv;
    expect(resolveStudioAiCapabilityProviders("transcription", withoutConfirm)).toEqual([]);
    expect(resolveStudioAiCapabilityProviders("vision", withoutConfirm)).toEqual([]);
    const status = studioAiCapabilityStatuses(withoutConfirm)
      .find((entry) => entry.capability === "transcription");
    expect(status).toMatchObject({ provider: "groq", configured: false });
  });

  it("allowlist 밖 모델로 바꾸면 조용히 넘어가지 않고 비활성화된다", () => {
    expect(resolveStudioAiCapabilityProviders("transcription", {
      ...groqEnv,
      STUDIO_AI_FREE_GROQ_TRANSCRIPTION_MODEL: "whisper-large-v3-turbo",
    })).toHaveLength(1);
    expect(isGroqTranscriptionModel("whisper-large-v3-turbo")).toBe(true);
    expect(resolveStudioAiCapabilityProviders("transcription", {
      ...groqEnv,
      STUDIO_AI_FREE_GROQ_TRANSCRIPTION_MODEL: "whisper-unreviewed",
    })).toEqual([]);
    expect(resolveStudioAiCapabilityProviders("vision", {
      ...groqEnv,
      STUDIO_AI_FREE_GROQ_VISION_MODEL: "meta-llama/llama-4-scout-17b-16e-instruct",
    })).toEqual([]);
  });

  it("상태에는 비밀값이 없고 능력별 모델과 약관 배지가 함께 노출된다", () => {
    const statuses = studioAiCapabilityStatuses(groqEnv);
    const transcription = statuses.find((entry) => entry.capability === "transcription");
    expect(transcription).toMatchObject({
      provider: "groq",
      model: "whisper-large-v3",
      configured: true,
      dataUsage: "no-training",
    });
    expect(JSON.stringify(statuses)).not.toContain("groq-capability-key");
  });
});

describe("Studio AI capability registry — Cloudflare 모달리티", () => {
  const cloudflareEnv = {
    NODE_ENV: "production",
    STUDIO_AI_FREE_POOL_ENABLED: "true",
    STUDIO_AI_FREE_CLOUDFLARE_ACCOUNT_ID: "0123456789abcdef0123456789abcdef",
    STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN: "cloudflare-capability-token",
    STUDIO_AI_FREE_CLOUDFLARE_CONFIRMED: "true",
  };

  it("이미지 생성은 무료 할당 확인 모델만 /ai/run endpoint로 등록된다", () => {
    const providers = resolveStudioAiCapabilityProviders("image-generation", cloudflareEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      provider: "cloudflare",
      capability: "image-generation",
      model: "@cf/black-forest-labs/flux-1-schnell",
      configured: true,
      endpoint:
        "https://api.cloudflare.com/client/v4/accounts/0123456789abcdef0123456789abcdef/ai/run/@cf/black-forest-labs/flux-1-schnell",
    });
    expect(isCloudflareImageModel("@cf/black-forest-labs/flux-1-schnell")).toBe(true);
    // Neurons가 수십 배인 계열은 무료 할당 등록에서 제외한다.
    expect(isCloudflareImageModel("@cf/leonardo/phoenix-1.0")).toBe(false);
    expect(isCloudflareImageModel("@cf/black-forest-labs/flux-2-dev")).toBe(false);
  });

  it("임베딩은 다국어 bge-m3만 등록되고 영어 전용 모델은 제외된다", () => {
    const providers = resolveStudioAiCapabilityProviders("embedding", cloudflareEnv);
    expect(providers).toHaveLength(1);
    expect(providers[0]).toMatchObject({
      provider: "cloudflare",
      capability: "embedding",
      model: "@cf/baai/bge-m3",
      configured: true,
    });
    expect(isCloudflareEmbeddingModel("@cf/baai/bge-m3")).toBe(true);
    expect(isCloudflareEmbeddingModel("@cf/baai/bge-large-en-v1.5")).toBe(false);
    expect(resolveStudioAiCapabilityProviders("embedding", {
      ...cloudflareEnv,
      STUDIO_AI_FREE_CLOUDFLARE_EMBEDDING_MODEL: "@cf/baai/bge-large-en-v1.5",
    })).toEqual([]);
  });

  it("chat 무료 모델 allowlist 밖이면 계정 자체가 미구성이라 미디어 능력도 등록되지 않는다", () => {
    expect(resolveStudioAiCapabilityProviders("image-generation", {
      ...cloudflareEnv,
      STUDIO_AI_FREE_CLOUDFLARE_MODEL: "@cf/meta/llama-3.3-70b-instruct-fp8-fast",
    })).toEqual([]);
    const statuses = studioAiCapabilityStatuses(cloudflareEnv);
    expect(statuses.find((entry) => entry.capability === "image-generation"))
      .toMatchObject({ provider: "cloudflare", configured: true });
    expect(JSON.stringify(statuses)).not.toContain("cloudflare-capability-token");
  });
});

describe("Studio AI provider 데이터 약관 배지", () => {
  it("무료 티어 학습 사용이 명시된 제공자는 training 배지를 단다", () => {
    const statuses = studioAiProviderStatuses({
      NODE_ENV: "production",
      STUDIO_AI_FREE_POOL_ENABLED: "true",
    });
    const byId = new Map(statuses.map((status) => [status.id, status]));
    expect(byId.get("gemini")).toMatchObject({ dataUsage: "training" });
    expect(byId.get("mistral")).toMatchObject({ dataUsage: "training" });
    expect(byId.get("groq")).toMatchObject({ dataUsage: "no-training" });
    expect(byId.get("openrouter")).toMatchObject({ dataUsage: "varies" });
    // 확인되지 않은 제공자를 안전하다고 단정하지 않는다.
    expect(byId.get("cloudflare")).toMatchObject({ dataUsage: "unconfirmed" });
    for (const status of statuses) {
      expect(status.dataTermsLabel.length).toBeGreaterThan(0);
    }
  });
});
