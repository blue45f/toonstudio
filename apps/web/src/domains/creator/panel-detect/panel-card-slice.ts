/**
 * 카드뉴스 슬라이스 공개 API — 분석(행 측정) → 계획(절단 위치) → 수동 조정.
 *
 * 분석과 계획은 generator 하나로 쓰고(컷 감지와 같은 점검 시점 규칙), 동기·비동기 드라이버가 구동한다. 결과는 결정적이다.
 * 사용자가 컷을 옮기거나 가까운 여백으로 붙이는 편집은 행 측정을 다시 하지 않고 계획만 새로 만든다.
 */

import { analyzeCardRows } from "./panel-card-slice-profile";
import {
  assembleCardSlicePlan,
  cardCountRange,
  cutUniformity,
  planCardSlicesSteps,
} from "./panel-card-slice-plan";
import {
  CARD_NEWS_PRESET,
  CARD_SLICE_LIMITS,
  CardSliceError,
  cardGeometry,
  type CardRowProfile,
  type CardSliceOptions,
  type CardSlicePlan,
  type ResolvedCardSliceOptions,
} from "./panel-card-slice-types";
import {
  PanelDetectBudget,
  runPanelDetectAsync,
  runPanelDetectSync,
  type PanelDetectDriverHooks,
} from "./panel-detect-runtime";
import { PANEL_DETECT_LIMITS, PanelDetectError } from "./panel-detect-types";

import type { PanelDetectRaster } from "./panel-detect-types";

export interface CardSliceAnalysis {
  readonly profile: CardRowProfile;
  readonly plan: CardSlicePlan;
  readonly options: ResolvedCardSliceOptions;
}

function boundedInteger(value: number | undefined, fallback: number, min: number, max: number, label: string): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new CardSliceError("invalid-options", `${label} 값은 ${min}~${max} 사이 정수여야 해요.`);
  }
  return value;
}

function defaultNow(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

export function resolveCardSliceOptions(options: CardSliceOptions = {}): ResolvedCardSliceOptions {
  const minFill = options.minFill ?? CARD_SLICE_LIMITS.defaultMinFill;
  if (!Number.isFinite(minFill) || minFill < 0.1 || minFill > 0.9) {
    throw new CardSliceError("invalid-options", "최소 채움 값은 0.1~0.9 사이여야 해요.");
  }
  const cardCount = options.cardCount === undefined || options.cardCount === null
    ? null
    : boundedInteger(options.cardCount, 1, 1, CARD_SLICE_LIMITS.hardMaxCards, "카드 수");
  return {
    cardWidth: boundedInteger(options.cardWidth, CARD_NEWS_PRESET.width, 64, 4_096, "카드 폭"),
    cardHeight: boundedInteger(options.cardHeight, CARD_NEWS_PRESET.height, 64, 8_192, "카드 높이"),
    minFill,
    cardCount,
    maxCards: boundedInteger(options.maxCards, CARD_SLICE_LIMITS.hardMaxCards, 1, CARD_SLICE_LIMITS.hardMaxCards, "카드 수 상한"),
    timeLimitMs: boundedInteger(options.timeLimitMs, CARD_SLICE_LIMITS.timeLimitMs, 1, 600_000, "시간 상한"),
    now: options.now ?? defaultNow,
    isCancelled: options.isCancelled ?? (() => false),
  };
}

function assertRaster(raster: PanelDetectRaster): void {
  const { width, height, data } = raster;
  if (
    !Number.isInteger(width) || !Number.isInteger(height)
    || width < CARD_SLICE_LIMITS.minSourceWidth || height < 1
    || width * height > PANEL_DETECT_LIMITS.maxInputPixels
    || typeof data !== "object" || data === null || data.length !== width * height * 4
  ) {
    throw new CardSliceError("invalid-input");
  }
}

function hooksFor(options: ResolvedCardSliceOptions): PanelDetectDriverHooks {
  return { now: options.now, deadlineAt: options.now() + options.timeLimitMs, isCancelled: options.isCancelled };
}

function asCardSliceError(error: unknown): unknown {
  if (error instanceof PanelDetectError && (error.code === "cancelled" || error.code === "timeout")) {
    return new CardSliceError(error.code, undefined, { cause: error });
  }
  return error;
}

export function* cardSliceSteps(
  raster: PanelDetectRaster,
  options: ResolvedCardSliceOptions,
): Generator<void, CardSliceAnalysis, void> {
  assertRaster(raster);
  const budget = new PanelDetectBudget();
  const profile = yield* analyzeCardRows(raster, budget);
  const geometry = cardGeometry(raster.width, options);
  const plan = yield* planCardSlicesSteps(profile, geometry, options, budget);
  return { profile, plan, options };
}

/** 동기 실행(시험·작은 이미지). 시간 상한과 취소를 점검 시점마다 확인한다. */
export function sliceCards(raster: PanelDetectRaster, options?: CardSliceOptions): CardSliceAnalysis {
  const resolved = resolveCardSliceOptions(options);
  try {
    return runPanelDetectSync(cardSliceSteps(raster, resolved), hooksFor(resolved));
  } catch (error) {
    throw asCardSliceError(error);
  }
}

export interface CardSliceAsyncHooks {
  readonly yieldNow?: () => Promise<void>;
}

function defaultYieldNow(): Promise<void> {
  return new Promise<void>((resolve) => { setTimeout(resolve, 0); });
}

/** 비동기 실행: 일정 시간마다 화면에 양보해 멈추지 않고, 그 틈에 취소 신호가 전달된다. */
export async function sliceCardsAsync(
  raster: PanelDetectRaster,
  options?: CardSliceOptions,
  hooks: CardSliceAsyncHooks = {},
): Promise<CardSliceAnalysis> {
  const resolved = resolveCardSliceOptions(options);
  try {
    return await runPanelDetectAsync(cardSliceSteps(raster, resolved), hooksFor(resolved), hooks.yieldNow ?? defaultYieldNow);
  } catch (error) {
    throw asCardSliceError(error);
  }
}

/** 행 측정은 그대로 두고 카드 수만 바꿔 다시 나눈다(수동으로 옮긴 컷은 사라진다). null 이면 자동. */
export async function replanCardSlicesAsync(
  analysis: CardSliceAnalysis,
  cardCount: number | null,
  signal?: AbortSignal,
  hooks: CardSliceAsyncHooks = {},
): Promise<CardSliceAnalysis> {
  const options: ResolvedCardSliceOptions = {
    ...analysis.options,
    cardCount,
    isCancelled: () => signal?.aborted === true,
  };
  try {
    const plan = await runPanelDetectAsync(
      planCardSlicesSteps(analysis.profile, analysis.plan.geometry, options, new PanelDetectBudget()),
      hooksFor(options),
      hooks.yieldNow ?? defaultYieldNow,
    );
    return { profile: analysis.profile, plan, options: { ...analysis.options, cardCount } };
  } catch (error) {
    throw asCardSliceError(error);
  }
}

// ── 수동 조정 ───────────────────────────────────────────────────────────

/** index 번째 컷(카드 index 와 index+1 사이)이 움직일 수 있는 행 범위. 양쪽 조각이 카드 높이를 넘지 않고 너무 짧아지지 않는다. */
export function cardCutBounds(plan: CardSlicePlan, index: number): { readonly min: number; readonly max: number } | null {
  const cut = plan.cuts[index];
  if (!cut) return null;
  const previous = index === 0 ? 0 : plan.cuts[index - 1].y;
  const next = index + 1 < plan.cuts.length ? plan.cuts[index + 1].y : plan.sourceHeight;
  const { cardSourceHeight, minManualLength } = plan.geometry;
  const min = Math.max(previous + minManualLength, next - cardSourceHeight);
  const max = Math.min(next - minManualLength, previous + cardSourceHeight);
  return min <= max ? { min, max } : null;
}

function withCuts(analysis: CardSliceAnalysis, rows: readonly number[], manual: ReadonlySet<number>): CardSliceAnalysis {
  const plan = assembleCardSlicePlan(analysis.profile, analysis.plan.geometry, analysis.options, rows, manual);
  return { ...analysis, plan };
}

function manualRowsOf(plan: CardSlicePlan): Set<number> {
  return new Set(plan.cuts.filter((cut) => cut.manual).map((cut) => cut.y));
}

/** 컷을 y 행으로 옮긴다(움직일 수 있는 범위 안으로 맞춘다). 범위를 만들 수 없거나 같은 자리면 같은 객체를 돌려준다. */
export function moveCardCut(analysis: CardSliceAnalysis, index: number, y: number): CardSliceAnalysis {
  const bounds = cardCutBounds(analysis.plan, index);
  if (!bounds || !Number.isFinite(y)) return analysis;
  const target = Math.min(bounds.max, Math.max(bounds.min, Math.round(y)));
  if (target === analysis.plan.cuts[index].y) return analysis;
  const rows = analysis.plan.cuts.map((cut, position) => (position === index ? target : cut.y));
  const manual = manualRowsOf(analysis.plan);
  manual.delete(analysis.plan.cuts[index].y);
  manual.add(target);
  return withCuts(analysis, rows, manual);
}

const SNAP_REACH = 60;

/** threshold 이상으로 비어 있는 절단선 중 current 에 가장 가까운 것을 찾고, 그 주변 여백 구간의 가운데를 돌려준다. */
function nearestCleanRow(profile: CardRowProfile, current: number, bounds: { readonly min: number; readonly max: number }, threshold: number): number | null {
  const low = Math.max(1, bounds.min);
  const high = Math.min(profile.height - 1, bounds.max);
  const clean = (y: number): boolean => y >= low && y <= high && cutUniformity(profile, y) >= threshold;
  const limit = Math.max(current - low, high - current);
  for (let distance = 0; distance <= limit; distance += 1) {
    const found = clean(current - distance) ? current - distance : clean(current + distance) ? current + distance : -1;
    if (found < 0) continue;
    let first = found;
    let last = found;
    while (found - first < SNAP_REACH && clean(first - 1)) first -= 1;
    while (last - found < SNAP_REACH && clean(last + 1)) last += 1;
    return Math.round((first + last) / 2);
  }
  return null;
}

/**
 * 컷을 움직일 수 있는 범위에서 가장 가까운 여백 줄로 붙이고, 그 여백 구간의 가운데에 둔다.
 * 완전한 여백이 없으면 거의 빈 줄을 찾고, 그것도 없거나 지금 위치가 이미 같은 등급이면 그대로 둔다.
 */
export function snapCardCut(analysis: CardSliceAnalysis, index: number): CardSliceAnalysis {
  const bounds = cardCutBounds(analysis.plan, index);
  const current = analysis.plan.cuts[index];
  if (!bounds || !current) return analysis;
  const currentRank = current.kind === "clean" ? 2 : current.kind === "soft" ? 1 : 0;
  const options: ReadonlyArray<readonly [number, number]> = [[CARD_SLICE_LIMITS.cleanUniformity, 2], [CARD_SLICE_LIMITS.softUniformity, 1]];
  for (const [threshold, rank] of options) {
    if (rank < currentRank) break;
    const row = nearestCleanRow(analysis.profile, current.y, bounds, threshold);
    if (row !== null) return moveCardCut(analysis, index, row);
  }
  return analysis;
}

/** 자동 계획으로 되돌린다(수동으로 옮긴 컷을 모두 버린다). */
export function resetCardCuts(analysis: CardSliceAnalysis): Promise<CardSliceAnalysis> {
  return replanCardSlicesAsync(analysis, analysis.options.cardCount);
}

export function cardRange(analysis: CardSliceAnalysis): { readonly min: number; readonly max: number } {
  return cardCountRange(analysis.plan.sourceHeight, analysis.plan.geometry, analysis.options);
}
