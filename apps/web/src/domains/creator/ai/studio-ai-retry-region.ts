/**
 * studio-ai-retry-region.ts — 부분 재시도 영역 선택 상태 기계 (순수 모듈, fetch 없음).
 *
 * 부분 재시도 요청(studio-ai-partial-retry.ts)은 정규화 좌표 영역을
 * 받지만, 그 영역을 캔버스에서 고르는 상태 기계는 없었다. 이 모듈은
 * 드래그 시작·이동·종료로 정규화 사각형을 만든다. 면적이 0이면 종료가
 * 실패하고, 범위를 벗어난 좌표는 0~1로 고정한다. 만든 영역은
 * createPartialRetryRequest의 region 입력으로 그대로 쓴다.
 */

export interface StudioAiRetryRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface StudioAiRetryRegionSelection {
  readonly startX: number;
  readonly startY: number;
  readonly currentX: number;
  readonly currentY: number;
  readonly active: boolean;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

/** 드래그를 시작한다. */
export function startRetryRegionSelection(
  x: number,
  y: number,
): StudioAiRetryRegionSelection {
  return {
    startX: clamp01(x),
    startY: clamp01(y),
    currentX: clamp01(x),
    currentY: clamp01(y),
    active: true,
  };
}

/** 드래그 이동을 반영한다. 비활성 선택은 그대로 둔다. */
export function moveRetryRegionSelection(
  selection: StudioAiRetryRegionSelection,
  x: number,
  y: number,
): StudioAiRetryRegionSelection {
  if (!selection.active) return selection;
  return { ...selection, currentX: clamp01(x), currentY: clamp01(y) };
}

export type StudioAiRetryRegionResult =
  | { readonly ok: true; readonly region: StudioAiRetryRegion }
  | { readonly ok: false; readonly reason: "inactive" | "empty_area" };

/** 드래그를 끝내고 정규화 사각형을 만든다. 면적이 0이면 실패한다. */
export function endRetryRegionSelection(
  selection: StudioAiRetryRegionSelection,
): StudioAiRetryRegionResult {
  if (!selection.active) return { ok: false, reason: "inactive" };
  const x = Math.min(selection.startX, selection.currentX);
  const y = Math.min(selection.startY, selection.currentY);
  const width = Math.abs(selection.currentX - selection.startX);
  const height = Math.abs(selection.currentY - selection.startY);
  if (width <= 0 || height <= 0) return { ok: false, reason: "empty_area" };
  return { ok: true, region: { x, y, width, height } };
}
