/**
 * Studio AI 클라이언트 동기 설정·판별 리프 모듈.
 * 네트워크 요청 구현과 프롬프트 파서를 진입 그래프에 묶지 않고 설정 확인만 제공한다.
 */
import { userAiTextKeyOrder } from "@/shared/ai/user-ai-store";

import {
  isStudioAiConfigured,
  saveStudioAiSettings,
  type StudioAiSettings,
} from "./studio-ai-settings";

import type { StudioAiImageSize, StudioTextAiTransport } from "./studio-ai-response-parsing";
import type {
  StudioServerAiProviderPreference,
  StudioServerAiStatus,
} from "../studio-server-ai-client";

export { isStudioAiConfigured, saveStudioAiSettings, type StudioAiSettings };

export const STUDIO_AI_IMAGE_SIZES: ReadonlyArray<{ value: StudioAiImageSize; label: string }> = [
  { value: "1024x1024", label: "정사각형 (1024×1024)" },
  { value: "1024x1792", label: "세로형 (1024×1792)" },
  { value: "1792x1024", label: "가로형 (1792×1024)" },
];

export const DEFAULT_STUDIO_AI_IMAGE_SIZE: StudioAiImageSize = "1024x1024";

const DEFAULT_TEXT_AI_TRANSPORT: StudioTextAiTransport = { mode: "byok" };

export function studioTextAiTransportForOperation(
  transport: StudioTextAiTransport,
  operationId: string,
): StudioTextAiTransport {
  return transport.mode === "server" ? { ...transport, operationId } : transport;
}

export function isStudioTextAiConfigured(
  settings: StudioAiSettings,
  transport: StudioTextAiTransport = DEFAULT_TEXT_AI_TRANSPORT,
): boolean {
  return transport.mode === "server" || isStudioAiConfigured(settings);
}

export function resolveActiveServerAiProviderLabel(
  preference: StudioServerAiProviderPreference,
  status: Pick<StudioServerAiStatus, "configured" | "providers"> | null,
): string {
  if (preference === "auto") {
    // 실제 순서대로 적는다(completeStudioServerText와 같은 규칙): 내 키(무료 키·먼저 쓰기로 한 유료 키)가 먼저면 앞에 적는다.
    const keyOrder = userAiTextKeyOrder();
    // "하나만 고정"은 고른 내 키만 쓰고 다른 경로로 넘어가지 않는다.
    if (keyOrder === "fixed") return "고정: 내 키";
    const myKeysFirst = keyOrder === "first";
    const prefix = myKeysFirst ? "내 키 → " : "";
    if (status?.providers?.some((provider) => provider.id === "anthropic" && provider.configured)) {
      return `자동: ${prefix}ToonStudio 고성능 AI → 무료 AI`;
    }
    if (myKeysFirst) return status?.configured ? "자동: 내 키 → 무료 AI" : "자동: 내 키";
    return status?.configured ? "자동 무료 AI" : "자동 무료 AI → 내 무료 키";
  }
  return status?.providers?.find((provider) => provider.id === preference)?.label ?? "선택한 무료 AI";
}
