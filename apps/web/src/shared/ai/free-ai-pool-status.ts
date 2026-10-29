import { api } from "@/platform/api";

export interface FreeAiPoolProviderStatus {
  /** "anthropic"은 키 없는 사용자의 1순위인 운영 고성능 경로다(운영자 비용, 사용자 비용 없음). */
  id: "anthropic" | "gemini" | "qwen" | "groq" | "sambanova" | "zai" | "mistral" | "cloudflare" | "openrouter" | "siliconflow" | "deepseek";
  label: string;
  configured: boolean;
  model: string;
  /** 무료 티어 데이터 약관 배지 — 서버 풀 메타데이터가 내려줄 때만 존재한다. */
  dataUsage?: "training" | "no-training" | "varies" | "unconfirmed";
  dataTermsLabel?: string;
}

export interface FreeAiPoolCapabilityStatus {
  provider: FreeAiPoolProviderStatus["id"];
  capability: "chat" | "transcription" | "vision" | "image-generation" | "embedding";
  model: string;
  configured: boolean;
  dataUsage?: "training" | "no-training" | "varies" | "unconfirmed";
  dataTermsLabel?: string;
}

export interface FreeAiPoolStatus {
  configured: boolean;
  provider: FreeAiPoolProviderStatus["id"] | "none";
  model: string;
  providers: FreeAiPoolProviderStatus[];
  selection: {
    default: "auto";
    order: FreeAiPoolProviderStatus["id"][];
    fallback: boolean;
    fallbackPolicy?: "free_quota_exhausted" | "billing_quota_exhausted" | "premium_unavailable";
  };
  requiresAuth: boolean;
  freePool?: boolean;
  /** 자동 경로의 1순위를 운영자가 부담하는지(운영 고성능 경로가 켜져 있으면 true). */
  operatorFunded?: boolean;
  /** 운영 고성능 경로 상태. 서버가 키를 갖고 있지 않으면 configured=false다. */
  premium?: {
    configured: boolean;
    automatic: boolean;
    model: string;
    userDailyRequestLimit: number;
  };
  poolCapabilities?: FreeAiPoolCapabilityStatus[];
  settingsHref?: string;
  quota?: {
    enforced: boolean;
    timezone: "UTC";
    failureMode: "closed";
    dailyRequestLimit: number;
    dailyTokenLimit: number;
    globalDailyRequestLimit?: number;
    globalDailyTokenLimit?: number;
  };
}

export async function getFreeAiPoolStatus(signal?: AbortSignal): Promise<FreeAiPoolStatus> {
  return api.get<FreeAiPoolStatus>("/studio-ai/status", { signal });
}
