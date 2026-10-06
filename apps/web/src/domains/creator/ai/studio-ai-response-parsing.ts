/**
 * Studio AI 응답 해석 — 제공자 JSON 응답에서 본문·이미지·모델·사용량(provenance)을
 * 꺼내는 순수 함수와, 그 결과 형태를 정의하는 타입 모음.
 *
 * studio-ai-client의 내부 헬퍼였으나 전송(HTTP)·기능 래퍼와 공유하는 책임이라 분리했다.
 * 부수효과가 없다(fetch·저장소 접근 없음) — 입력 JSON과 설정만으로 결정된다.
 */

import {
  parseStudioServerAiFailoverMetadata,
  type StudioServerAiFailoverMetadata,
  type StudioServerAiProviderPreference,
} from "../studio-server-ai-client";

import type { StudioAiSettings } from "./studio-ai-settings";

export type StudioTextAiTransport =
  | { mode: "byok"; signal?: AbortSignal }
  | {
      mode: "server";
      provider?: StudioServerAiProviderPreference;
      signal?: AbortSignal;
      /** Stable Studio provenance operation ID reused as the paid server request retry key. */
      operationId?: string;
    };

export interface StudioAiTokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

/** 저장 가능한 텍스트 생성 이력. API 키·전체 프롬프트·응답 본문은 의도적으로 포함하지 않는다. */
export interface StudioTextAiProvenance {
  provider: string;
  model: string;
  transport: StudioTextAiTransport["mode"];
  promptVersion: 1;
  createdAt: string;
  requestId?: string;
  usage?: StudioAiTokenUsage;
  /** 서버 자동 선택이 무료 한도·요청 제한을 감지해 다른 공급자로 전환한 경우의 안전한 구조화 이력. */
  failover?: StudioServerAiFailoverMetadata;
}

/** 텍스트 AI 결과에 실제 공급자·모델 감사 정보를 일관되게 붙이는 공통 결과 형태. */
export type StudioTextAiData<T extends object> = T & { textProvenance: StudioTextAiProvenance };

export type StudioAiImageSize = "1024x1024" | "1024x1792" | "1792x1024";

export function extractFirstB64Json(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const data = (json as Record<string, unknown>).data;
  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as Record<string, unknown> | undefined;
  const b64 = first?.b64_json;
  return typeof b64 === "string" && b64.length > 0 ? b64 : null;
}

export function extractGeneratedModel(json: unknown, fallback: string): string {
  if (!json || typeof json !== "object") return fallback;
  const candidate = (json as Record<string, unknown>).model;
  return typeof candidate === "string" && candidate.trim().length > 0
    ? candidate.trim().slice(0, 200)
    : fallback;
}

export function extractFirstChatContent(json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const choices = (json as Record<string, unknown>).choices;
  if (!Array.isArray(choices) || choices.length === 0) return null;
  const message = (choices[0] as Record<string, unknown> | undefined)?.message as Record<string, unknown> | undefined;
  const content = message?.content;
  return typeof content === "string" && content.trim().length > 0 ? content.trim() : null;
}

export function textProviderFromSettings(settings: StudioAiSettings): string {
  try {
    return new URL(settings.baseUrl).hostname.slice(0, 120) || "custom";
  } catch {
    return settings.baseUrl.trim().slice(0, 120) || "custom";
  }
}

export function optionalTokenCount(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
    ? Math.min(value, 2_147_483_647)
    : undefined;
}

export function extractTextAiProvenance(
  json: unknown,
  settings: StudioAiSettings,
  transport: StudioTextAiTransport
): StudioTextAiProvenance {
  const record = json && typeof json === "object" && !Array.isArray(json)
    ? json as Record<string, unknown>
    : {};
  const usageRecord = record.usage && typeof record.usage === "object" && !Array.isArray(record.usage)
    ? record.usage as Record<string, unknown>
    : {};
  const promptTokens = optionalTokenCount(usageRecord.promptTokens ?? usageRecord.prompt_tokens);
  const completionTokens = optionalTokenCount(
    usageRecord.completionTokens ?? usageRecord.completion_tokens
  );
  const totalTokens = optionalTokenCount(usageRecord.totalTokens ?? usageRecord.total_tokens);
  const usage = promptTokens !== undefined || completionTokens !== undefined || totalTokens !== undefined
    ? {
        ...(promptTokens !== undefined ? { promptTokens } : {}),
        ...(completionTokens !== undefined ? { completionTokens } : {}),
        ...(totalTokens !== undefined ? { totalTokens } : {}),
      }
    : undefined;
  const rawProvider = typeof record.provider === "string" ? record.provider.trim().slice(0, 120) : "";
  const rawModel = typeof record.model === "string" ? record.model.trim().slice(0, 200) : "";
  const rawRequestId = typeof record.requestId === "string"
    ? record.requestId.trim().slice(0, 240)
    : "";
  const provider = rawProvider || (
    transport.mode === "server"
      ? transport.provider && transport.provider !== "auto"
        ? transport.provider
        : "server-auto"
      : textProviderFromSettings(settings)
  );
  const model = rawModel || settings.textModel.trim().slice(0, 200) || "unknown";
  const failover = transport.mode === "server"
    && (provider === "gemini"
      || provider === "qwen"
      || provider === "groq"
      || provider === "sambanova"
      || provider === "zai"
      || provider === "mistral"
      || provider === "cloudflare"
      || provider === "openrouter"
      || provider === "siliconflow"
      || provider === "deepseek")
    ? parseStudioServerAiFailoverMetadata(record.failover, { provider, model })
    : undefined;
  return {
    provider,
    model,
    transport: transport.mode,
    promptVersion: 1,
    createdAt: new Date().toISOString(),
    ...(rawRequestId ? { requestId: rawRequestId } : {}),
    ...(usage ? { usage } : {}),
    ...(failover ? { failover } : {}),
  };
}

export function parseImageSize(size: StudioAiImageSize): { width: number; height: number } {
  const m = /^(\d+)x(\d+)$/.exec(size);
  if (!m) return { width: 1024, height: 1024 };
  return { width: Number(m[1]), height: Number(m[2]) };
}
