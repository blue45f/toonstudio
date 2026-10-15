/**
 * 컷 감지 실행 규칙 — 옵션 해석, 작업량 예산, 동기/비동기 드라이버.
 *
 * 알고리즘 본체(panel-detect-core)는 generator 하나로 작성한다. generator 는 일정한 작업량마다 `yield` 로
 * 점검 시점을 알리고, 드라이버가 그때마다 취소와 시간 상한을 확인한다.
 * - 동기 드라이버: 테스트·Worker 안의 단순 실행. 끝까지 멈추지 않지만 시간 상한은 지킨다.
 * - 비동기 드라이버: 메인 스레드에서 쓰는 실행. 일정 시간마다 이벤트 루프에 양보해 화면이 멈추지 않고,
 *   AbortSignal 같은 취소 신호가 실제로 전달될 틈을 만든다.
 * 같은 입력은 어느 드라이버로 돌려도 같은 결과를 낸다(결정성). 시간은 오류(timeout)에만 영향을 준다.
 */

import {
  PANEL_DETECT_LIMITS,
  PANEL_DETECT_SENSITIVITIES,
  PANEL_READING_ORDERS,
  PanelDetectError,
  type PanelDetectOptions,
  type PanelDetectSensitivity,
  type PanelReadingOrder,
} from "./panel-detect-types";

/** 민감도별 여백 최소 두께: 분석 래스터의 짧은 변 대비 비율(최소 픽셀 하한 포함). */
const SENSITIVITY_GAP: Readonly<Record<PanelDetectSensitivity, { readonly ratio: number; readonly floor: number }>> =
  Object.freeze({
    fine: { ratio: 0.004, floor: 3 },
    normal: { ratio: 0.007, floor: 3 },
    coarse: { ratio: 0.016, floor: 4 },
  });

/** 한 행(열)을 "여백 줄"로 보는 비내용 허용 비율. 스캔 잡티·바깥 테두리 한두 줄을 흡수한다. */
export const PANEL_DETECT_INK_TOLERANCE = 0.012;

export interface ResolvedPanelDetectOptions {
  readonly readingOrder: PanelReadingOrder;
  readonly sensitivity: PanelDetectSensitivity;
  readonly maxDepth: number;
  readonly maxAnalysisPixels: number;
  readonly maxPanels: number;
  readonly timeLimitMs: number;
  readonly gutterTolerance: number;
  readonly now: () => number;
  readonly isCancelled: () => boolean;
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PanelDetectError("invalid-options", `${label} 값은 ${min}~${max} 사이 정수여야 해요.`);
  }
  return value;
}

export function resolvePanelDetectOptions(options: PanelDetectOptions | undefined): ResolvedPanelDetectOptions {
  const source = options ?? {};
  const readingOrder = source.readingOrder ?? "webtoon";
  if (!(PANEL_READING_ORDERS as readonly string[]).includes(readingOrder)) {
    throw new PanelDetectError("invalid-options", "읽기 순서 값이 올바르지 않아요.");
  }
  const sensitivity = source.sensitivity ?? "normal";
  if (!(PANEL_DETECT_SENSITIVITIES as readonly string[]).includes(sensitivity)) {
    throw new PanelDetectError("invalid-options", "민감도 값이 올바르지 않아요.");
  }
  return {
    readingOrder,
    sensitivity,
    maxDepth: boundedInteger(source.maxDepth, PANEL_DETECT_LIMITS.defaultMaxDepth, 1, PANEL_DETECT_LIMITS.maxDepthCeiling, "최대 깊이"),
    maxAnalysisPixels: boundedInteger(
      source.maxAnalysisPixels,
      PANEL_DETECT_LIMITS.defaultAnalysisPixels,
      PANEL_DETECT_LIMITS.minAnalysisPixels,
      PANEL_DETECT_LIMITS.maxInputPixels,
      "분석 픽셀 상한",
    ),
    maxPanels: boundedInteger(source.maxPanels, PANEL_DETECT_LIMITS.defaultMaxPanels, 1, 1_000, "컷 개수 상한"),
    timeLimitMs: boundedInteger(source.timeLimitMs, PANEL_DETECT_LIMITS.defaultTimeLimitMs, 1, 600_000, "시간 상한"),
    gutterTolerance: boundedInteger(source.gutterTolerance, PANEL_DETECT_LIMITS.defaultGutterTolerance, 1, 128, "여백색 허용 오차"),
    now: source.now ?? defaultNow,
    isCancelled: source.isCancelled ?? (() => false),
  };
}

/** 분석 래스터 짧은 변과 민감도로 여백 최소 두께(분석 픽셀)를 구한다. */
export function minGapForSensitivity(sensitivity: PanelDetectSensitivity, analysisWidth: number, analysisHeight: number): number {
  const preset = SENSITIVITY_GAP[sensitivity];
  return Math.max(preset.floor, Math.round(preset.ratio * Math.min(analysisWidth, analysisHeight)));
}

/** 한 번 양보하기까지 허용하는 작업량(바이트·픽셀 접근 횟수의 대략치). */
const YIELD_WORK_UNITS = 600_000;
/** 비동기 드라이버가 이벤트 루프에 양보하는 간격(ms). */
const SLICE_MS = 12;

/** generator 가 작업량을 신고하고, 점검 시점이 되면 true 를 돌려받는다. */
export class PanelDetectBudget {
  private work = 0;

  /** units 만큼 일했다고 신고한다. 점검 시점이면 true — 호출한 generator 는 곧바로 `yield` 해야 한다. */
  consume(units: number): boolean {
    this.work += units;
    if (this.work < YIELD_WORK_UNITS) return false;
    this.work = 0;
    return true;
  }
}

export interface PanelDetectDriverHooks {
  readonly now: () => number;
  readonly deadlineAt: number;
  readonly isCancelled: () => boolean;
}

export function createDriverHooks(options: ResolvedPanelDetectOptions): PanelDetectDriverHooks {
  return {
    now: options.now,
    deadlineAt: options.now() + options.timeLimitMs,
    isCancelled: options.isCancelled,
  };
}

function checkpoint(hooks: PanelDetectDriverHooks): void {
  if (hooks.isCancelled()) throw new PanelDetectError("cancelled");
  if (hooks.now() > hooks.deadlineAt) throw new PanelDetectError("timeout");
}

export function runPanelDetectSync<T>(
  steps: Generator<void, T, void>,
  hooks: PanelDetectDriverHooks,
): T {
  checkpoint(hooks);
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return step.value;
    checkpoint(hooks);
  }
}

export async function runPanelDetectAsync<T>(
  steps: Generator<void, T, void>,
  hooks: PanelDetectDriverHooks,
  yieldNow: () => Promise<void>,
): Promise<T> {
  checkpoint(hooks);
  let sliceStart = hooks.now();
  for (let step = steps.next(); ; step = steps.next()) {
    if (step.done) return step.value;
    checkpoint(hooks);
    if (hooks.now() - sliceStart >= SLICE_MS) {
      await yieldNow();
      checkpoint(hooks);
      sliceStart = hooks.now();
    }
  }
}
