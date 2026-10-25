/**
 * studio-ai-partial-retry.ts — 부분 재시도(영역 지정 다시 채색) 스캐폴드 (순수 모듈, fetch 없음).
 *
 * 정식 인페인팅 모델이 없으므로, 이번 단계에서는 영역 선택·요청 구조까지만
 * 만든다. 폴백 동작은 "전체 재생성 후 선택 영역만 합성"으로 고정하고,
 * 그 한계를 호출부 UI가 명시한다. 모델 호출 자체는 이 모듈에 없다.
 */

/** 캔버스 정규화 좌표(0~1). x/y는 좌상단, width/height는 크기이다. */
export interface StudioAiPartialRetryRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export type StudioAiPartialRetryFallback = "full-regen-mask-composite";

export interface StudioAiPartialRetryRequest {
  readonly region: StudioAiPartialRetryRegion;
  readonly prompt: string;
  readonly sourceImageId: string;
  readonly fallback: StudioAiPartialRetryFallback;
}

export type StudioAiPartialRetryResult =
  | { readonly ok: true; readonly request: StudioAiPartialRetryRequest }
  | {
      readonly ok: false;
      readonly reason: "invalid_region" | "empty_prompt" | "empty_source";
    };

function isValidRegion(region: StudioAiPartialRetryRegion): boolean {
  const { x, y, width, height } = region;
  const numbers = [x, y, width, height];
  if (numbers.some((value) => !Number.isFinite(value))) return false;
  if (x < 0 || y < 0 || width <= 0 || height <= 0) return false;
  if (x + width > 1 || y + height > 1) return false;
  return true;
}

export function createPartialRetryRequest(input: {
  readonly region: StudioAiPartialRetryRegion;
  readonly prompt: string;
  readonly sourceImageId: string;
}): StudioAiPartialRetryResult {
  if (!isValidRegion(input.region)) return { ok: false, reason: "invalid_region" };
  const prompt = input.prompt.trim();
  if (!prompt) return { ok: false, reason: "empty_prompt" };
  if (!input.sourceImageId.trim()) return { ok: false, reason: "empty_source" };
  return {
    ok: true,
    request: {
      region: input.region,
      prompt,
      sourceImageId: input.sourceImageId,
      fallback: "full-regen-mask-composite",
    },
  };
}
