import { api } from "@/platform/api";

export interface FreeAiPoolProviderStatus {
  id: "gemini" | "qwen" | "groq" | "sambanova" | "zai" | "mistral" | "cloudflare" | "openrouter" | "siliconflow" | "deepseek";
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
    fallbackPolicy?: "free_quota_exhausted" | "billing_quota_exhausted";
  };
  requiresAuth: boolean;
  freePool?: boolean;
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
