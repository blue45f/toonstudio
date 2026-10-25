/**
 * studio-interaction-visual-fx.ts — 드로잉·드래그 시각 피드백 스펙 (순수 모듈, fetch 없음).
 *
 * 드로잉·드래그 전용 리플·하이라이트 배선이 없어, 이 모듈은 렌더링이 아니라
 * 스펙 데이터만 만든다. 실제 그리기는 호출부가 맡는다(예: core 파티클
 * 버스트 triggerParticleBurst 재사용). 좌표·반경·지속시간이 유효하지 않으면
 * null로 fail-closed한다. 지속시간은 1,000ms 상한이다.
 */

export interface StudioRippleSpec {
  readonly kind: "ripple";
  readonly x: number;
  readonly y: number;
  readonly startRadius: number;
  readonly endRadius: number;
  readonly durationMs: number;
}

export interface StudioDropHighlightSpec {
  readonly kind: "highlight";
  readonly targetId: string;
  readonly durationMs: number;
}

export interface StudioToolFlashSpec {
  readonly kind: "flash";
  readonly toolId: string;
  readonly durationMs: number;
}

const MAX_DURATION_MS = 1000;

function isFiniteNumber(value: number): boolean {
  return typeof value === "number" && Number.isFinite(value);
}

/** 스트로크 시작·종료 지점의 리플 스펙을 만든다. */
export function buildStrokeRippleSpec(
  x: number,
  y: number,
): StudioRippleSpec | null {
  if (!isFiniteNumber(x) || !isFiniteNumber(y)) return null;
  return Object.freeze({
    kind: "ripple",
    x,
    y,
    startRadius: 2,
    endRadius: 18,
    durationMs: 300,
  });
}

/** 드롭 대상 하이라이트 스펙을 만든다. 빈 대상 id는 무효이다. */
export function buildDropHighlightSpec(
  targetId: string,
): StudioDropHighlightSpec | null {
  if (targetId === "") return null;
  return Object.freeze({ kind: "highlight", targetId, durationMs: 400 });
}

/** 툴 선택 플래시 스펙을 만든다. 빈 툴 id는 무효이다. */
export function buildToolFlashSpec(toolId: string): StudioToolFlashSpec | null {
  if (toolId === "") return null;
  return Object.freeze({ kind: "flash", toolId, durationMs: 200 });
}

/** 스펙의 지속시간이 상한 이내인지 확인한다. */
export function isVisualFxDurationValid(durationMs: number): boolean {
  return isFiniteNumber(durationMs) && durationMs > 0 && durationMs <= MAX_DURATION_MS;
}
