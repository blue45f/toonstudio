import {
  resolveStudioAiProviders,
  studioAiProviderDataTerms,
  type StudioAiFreeProviderId,
  type StudioAiProviderDataTerms,
} from "./studio-ai-provider";

/**
 * 공유 무료 풀의 능력(capability) 레지스트리.
 *
 * 기존 풀은 텍스트 chat completion 전용이었다. 이 레지스트리는 이미 풀에 들어 있는
 * 제공자의 무료 구간에 함께 있는 다른 모달리티를, 신규 키 없이 능력 단위로 등록한다.
 *
 * - transcription: Groq Whisper (기존 Groq 서버 키 재사용)
 * - vision: Groq 비전 모델 (기존 Groq 서버 키 재사용, chat completions 위에서 동작)
 * - image-generation / embedding: Cloudflare Workers AI (별도 단위에서 등록)
 *
 * 무료 경계는 chat과 같은 원칙을 따른다: 운영자 확인 플래그가 켜진 제공자만,
 * 그리고 무료 구간이 공식 문서로 확인된 모델 allowlist 안의 모델만 configured가 된다.
 * 모델을 env로 바꿔도 allowlist 밖이면 조용히 유료 모델로 넘어가지 않고 비활성화된다.
 */
export type StudioAiCapabilityKind =
  | "chat"
  | "transcription"
  | "vision"
  | "image-generation"
  | "embedding";

export const STUDIO_AI_CAPABILITY_KINDS: readonly StudioAiCapabilityKind[] = [
  "chat",
  "transcription",
  "vision",
  "image-generation",
  "embedding",
];

export interface StudioAiCapabilityConfig {
  provider: StudioAiFreeProviderId;
  capability: StudioAiCapabilityKind;
  model: string;
  configured: boolean;
  /** 실행 endpoint. configured가 아니면 빈 문자열이다. 서버 내부 전용. */
  endpoint: string;
  /** 서버 전용 비밀값. 상태(status) 응답에는 절대 포함하지 않는다. */
  apiKey: string;
  dataTerms: StudioAiProviderDataTerms;
}

export interface StudioAiCapabilityStatus {
  provider: StudioAiFreeProviderId;
  capability: StudioAiCapabilityKind;
  model: string;
  configured: boolean;
  dataUsage: StudioAiProviderDataTerms["dataUsage"];
  dataTermsLabel: string;
}

type EnvLike = Partial<Record<string, string | undefined>>;

function boundedText(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === "string" && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
}

const GROQ_API_BASE = "https://api.groq.com/openai/v1";

/**
 * Groq 무료 rate limit 표(공식 문서, 2026-10-06 확인)에 있는 Whisper 모델만 허용한다.
 * whisper-large-v3: 20 RPM · 2K RPD · 오디오 28,800초/일.
 */
const GROQ_TRANSCRIPTION_MODELS = new Set(["whisper-large-v3", "whisper-large-v3-turbo"]);
export const STUDIO_AI_GROQ_DEFAULT_TRANSCRIPTION_MODEL = "whisper-large-v3";

export function isGroqTranscriptionModel(model: string): boolean {
  return GROQ_TRANSCRIPTION_MODELS.has(model.trim().toLowerCase());
}

/**
 * Groq 공식 비전 문서(2026-10-06 확인)가 현재 지원하는 유일한 비전 모델.
 * 이전 Llama 4 Scout/Maverick은 문서에서 내려갔으므로 allowlist에 넣지 않는다.
 */
const GROQ_VISION_MODELS = new Set(["qwen/qwen3.8-27b"]);
export const STUDIO_AI_GROQ_DEFAULT_VISION_MODEL = "qwen/qwen3.8-27b";

export function isGroqVisionModel(model: string): boolean {
  return GROQ_VISION_MODELS.has(model.trim().toLowerCase());
}

function groqCapabilityConfig(
  capability: "transcription" | "vision",
  env: EnvLike,
): StudioAiCapabilityConfig {
  const [groq] = resolveStudioAiProviders("groq", env);
  const model = capability === "transcription"
    ? boundedText(
        env.STUDIO_AI_FREE_GROQ_TRANSCRIPTION_MODEL,
        STUDIO_AI_GROQ_DEFAULT_TRANSCRIPTION_MODEL,
        200,
      )
    : boundedText(env.STUDIO_AI_FREE_GROQ_VISION_MODEL, STUDIO_AI_GROQ_DEFAULT_VISION_MODEL, 200);
  const modelAllowed = capability === "transcription"
    ? isGroqTranscriptionModel(model)
    : isGroqVisionModel(model);
  const configured = Boolean(groq) && modelAllowed;
  return {
    provider: "groq",
    capability,
    model,
    configured,
    endpoint: configured
      ? capability === "transcription"
        ? `${GROQ_API_BASE}/audio/transcriptions`
        : `${GROQ_API_BASE}/chat/completions`
      : "",
    apiKey: configured ? (groq?.apiKey ?? "") : "",
    dataTerms: studioAiProviderDataTerms("groq"),
  };
}

function chatCapabilityConfigs(env: EnvLike): StudioAiCapabilityConfig[] {
  return resolveStudioAiProviders("auto", env)
    .filter((provider) => provider.freePool)
    .map((provider) => ({
      provider: provider.id as StudioAiFreeProviderId,
      capability: "chat" as const,
      model: provider.model,
      configured: true,
      endpoint: provider.endpoint,
      apiKey: provider.apiKey,
      dataTerms: studioAiProviderDataTerms(provider.id),
    }));
}

/**
 * 능력별 configured 제공자를 풀 기본 순서대로 반환한다.
 * 아직 등록되지 않은 능력은 빈 배열을 반환해 호출자가 정직하게 비활성으로 표시하게 한다.
 */
export function resolveStudioAiCapabilityProviders(
  capability: StudioAiCapabilityKind,
  env: EnvLike = process.env,
): StudioAiCapabilityConfig[] {
  if (capability === "chat") return chatCapabilityConfigs(env);
  if (capability === "transcription" || capability === "vision") {
    const config = groqCapabilityConfig(capability, env);
    return config.configured ? [config] : [];
  }
  // image-generation / embedding은 Cloudflare 단위에서 등록한다.
  return [];
}

/** 상태 응답용으로 비밀값을 제거한 능력 목록. configured가 아닌 능력도 모델·약관 배지와 함께 노출한다. */
export function studioAiCapabilityStatuses(
  env: EnvLike = process.env,
): StudioAiCapabilityStatus[] {
  const statuses: StudioAiCapabilityStatus[] = [];
  for (const capability of STUDIO_AI_CAPABILITY_KINDS) {
    if (capability === "chat") {
      for (const config of chatCapabilityConfigs(env)) {
        statuses.push(toCapabilityStatus(config));
      }
      continue;
    }
    const candidates = capabilityCandidateConfigs(capability, env);
    for (const config of candidates) statuses.push(toCapabilityStatus(config));
  }
  return statuses;
}

function toCapabilityStatus(config: StudioAiCapabilityConfig): StudioAiCapabilityStatus {
  return {
    provider: config.provider,
    capability: config.capability,
    model: config.model,
    configured: config.configured,
    dataUsage: config.dataTerms.dataUsage,
    dataTermsLabel: config.dataTerms.dataTermsLabel,
  };
}

function capabilityCandidateConfigs(
  capability: Exclude<StudioAiCapabilityKind, "chat">,
  env: EnvLike,
): StudioAiCapabilityConfig[] {
  if (capability === "transcription" || capability === "vision") {
    return [groqCapabilityConfig(capability, env)];
  }
  return [];
}
