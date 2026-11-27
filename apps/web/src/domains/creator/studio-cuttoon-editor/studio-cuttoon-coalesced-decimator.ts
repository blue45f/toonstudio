/**
 * 120Hz/240Hz 고주사율 Coalesced 이벤트 적응형 코너 보존 데시메이터.
 *
 * 메인 스레드 프레임 예산이 빡빡할 때(`> 6ms` 지연 조짐 또는 120Hz/240Hz 고밀도 버스트),
 * 일직선 구간의 과밀 중복 포인트만 서브픽셀 허용 오차 안에서 무손실 병합하고:
 * - 배치의 첫 샘플과 마지막 권위 끝점 100% 보존
 * - 방향 전환각 `>= 18°` 코너 포인트 100% 보존
 * - 필압 국소 극값(변곡 피크/밸리) 및 유의미한 압력·기울기 변화점 100% 보존
 * 규칙을 강제해 프레임 드롭 없이 매끄러운 필감과 날카로운 선화를 유지한다.
 */

import type { StudioStagePointerBatchMapper } from "../canvas/studio-stage-pointer-coordinate";
import { recordStudioDrawingStabilityCounts } from "./studio-cuttoon-drawing-stability-telemetry";

export const STUDIO_COALESCED_CORNER_PRESERVE_DEG = 18;
export const STUDIO_COALESCED_TIGHT_BUDGET_MS = 6;

const DEFAULT_COLLINEAR_TOLERANCE_DOC_PX = 0.38;
const SEVERE_BUDGET_COLLINEAR_TOLERANCE_DOC_PX = 0.68;
const DEFAULT_MAX_MERGED_SPAN_DOC_PX = 16;
const PRESSURE_EXTREMA_EPSILON = 0.012;
const PRESSURE_DELTA_PRESERVE_THRESHOLD = 0.035;
const TILT_DELTA_PRESERVE_DEG = 4;

export interface StudioCoalescedSampleLike {
  readonly pressure?: number;
  readonly tiltX?: number;
  readonly tiltY?: number;
  readonly timeStamp?: number;
  readonly shiftKey?: boolean;
}

export interface StudioCoalescedBudgetObservation {
  readonly nowMs: number;
  readonly sampleCount: number;
}

export interface StudioCoalescedBudgetDecision {
  readonly tightBudget: boolean;
  readonly severeBudget: boolean;
  readonly lastBatchCostMs: number;
  readonly deliveryDeltaMs: number;
}

export interface StudioCoalescedFrameBudgetTracker {
  observeDelivery(input: StudioCoalescedBudgetObservation): StudioCoalescedBudgetDecision;
  recordBatchCost(durationMs: number): void;
  reset(): void;
}

/**
 * 연속 포인터 배치 사이의 시간 간격과 직전 배치 소비 비용을 추적해 `> 6ms` 예산 압박을 감지한다.
 */
export function createStudioCoalescedFrameBudgetTracker(): StudioCoalescedFrameBudgetTracker {
  let lastDeliveryAtMs: number | null = null;
  let lastBatchCostMs = 0;

  return {
    observeDelivery({ nowMs, sampleCount }: StudioCoalescedBudgetObservation): StudioCoalescedBudgetDecision {
      const deliveryDeltaMs =
        lastDeliveryAtMs !== null && Number.isFinite(nowMs - lastDeliveryAtMs)
          ? Math.max(0, nowMs - lastDeliveryAtMs)
          : 0;
      lastDeliveryAtMs = nowMs;

      // 1) 직전 배치 처리 비용이 6ms를 넘었거나,
      // 2) 프레임 배달 간격이 6ms를 넘으면서 coalesced 샘플이 4개 이상 쌓였거나,
      // 3) 240Hz 등 한 번에 7개 이상의 고밀도 샘플이 몰려온 경우 적응형 데시메이션을 켠다.
      const tightBudget =
        lastBatchCostMs > STUDIO_COALESCED_TIGHT_BUDGET_MS
        || (deliveryDeltaMs > STUDIO_COALESCED_TIGHT_BUDGET_MS && sampleCount >= 4)
        || sampleCount >= 7;
      const severeBudget =
        lastBatchCostMs > 10
        || (deliveryDeltaMs > 14 && sampleCount >= 8)
        || sampleCount >= 14;

      return {
        tightBudget,
        severeBudget,
        lastBatchCostMs,
        deliveryDeltaMs,
      };
    },
    recordBatchCost(durationMs: number): void {
      if (Number.isFinite(durationMs) && durationMs >= 0) {
        lastBatchCostMs = durationMs;
      }
    },
    reset(): void {
      lastDeliveryAtMs = null;
      lastBatchCostMs = 0;
    },
  };
}

export interface StudioCoalescedDecimateOptions {
  readonly tightBudget: boolean;
  readonly severeBudget?: boolean;
  readonly coordinateScale?: number;
  readonly cornerThresholdDeg?: number;
  readonly bypass?: boolean;
}

export interface StudioDecimatedCoalescedEntry<T> {
  readonly originalIndex: number;
  readonly sample: T;
  readonly point: { x: number; y: number } | null;
}

export interface StudioCoalescedDecimationResult<T> {
  readonly entries: readonly StudioDecimatedCoalescedEntry<T>[];
  readonly keptIndices: ReadonlySet<number>;
  readonly pointsByIndex: ReadonlyMap<number, { x: number; y: number }>;
  readonly droppedCount: number;
  readonly preservedCornerCount: number;
  readonly preservedPressureExtremaCount: number;
}

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function directionAngleDeg(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const ux = bx - ax;
  const uy = by - ay;
  const vx = cx - bx;
  const vy = cy - by;
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu <= 1e-6 || lv <= 1e-6) return 0;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function perpendicularDistanceToChord(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen <= 1e-6) return Math.hypot(px - ax, py - ay);
  return Math.abs(dy * px - dx * py + bx * ay - by * ax) / chordLen;
}

function isLocalPressureExtrema(
  prevP: number,
  currP: number,
  nextP: number,
): boolean {
  const d1 = currP - prevP;
  const d2 = nextP - currP;
  if (d1 * d2 >= 0) return false;
  return (
    Math.max(Math.abs(d1), Math.abs(d2)) >= PRESSURE_EXTREMA_EPSILON
  );
}

/**
 * Coalesced 샘플 배열을 순회하며 일직선 과밀 포인트만 병합 제거하고 코너(`>= 18°`) 및
 * 필압 변곡점을 100% 보존한 엔트리 목록을 반환한다.
 */
export function decimateStudioCoalescedPointerBatch<T extends StudioCoalescedSampleLike>(
  samples: readonly T[],
  mapper: Pick<StudioStagePointerBatchMapper, "pointFor">,
  options: StudioCoalescedDecimateOptions,
): StudioCoalescedDecimationResult<T> {
  const count = samples.length;
  if (options.bypass || !options.tightBudget || count <= 2) {
    return {
      entries: samples.map((sample, originalIndex) => ({
        originalIndex,
        sample,
        // 예산이 여유로운 일반 경로에서는 기존 루프의 lazy 매핑과 동일하게 동작하도록 null 허용
        point: null,
      })),
      keptIndices: new Set(samples.map((_, idx) => idx)),
      pointsByIndex: new Map(),
      droppedCount: 0,
      preservedCornerCount: 0,
      preservedPressureExtremaCount: 0,
    };
  }

  const scale =
    typeof options.coordinateScale === "number"
    && Number.isFinite(options.coordinateScale)
    && options.coordinateScale > 0
      ? options.coordinateScale
      : 1;
  const cornerThresholdDeg =
    typeof options.cornerThresholdDeg === "number" && Number.isFinite(options.cornerThresholdDeg)
      ? options.cornerThresholdDeg
      : STUDIO_COALESCED_CORNER_PRESERVE_DEG;
  const maxCollinearError =
    (options.severeBudget
      ? SEVERE_BUDGET_COLLINEAR_TOLERANCE_DOC_PX
      : DEFAULT_COLLINEAR_TOLERANCE_DOC_PX) / scale;
  const maxMergedSpan = DEFAULT_MAX_MERGED_SPAN_DOC_PX / scale;

  const mappedPoints: Array<{ x: number; y: number } | null> = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const sample = samples[i];
    mappedPoints[i] = sample ? mapper.pointFor(sample as unknown as PointerEvent) : null;
  }

  const kept: StudioDecimatedCoalescedEntry<T>[] = [];
  let preservedCornerCount = 0;
  let preservedPressureExtremaCount = 0;

  const firstSample = samples[0];
  if (!firstSample) {
    return {
      entries: [],
      keptIndices: new Set(),
      pointsByIndex: new Map(),
      droppedCount: 0,
      preservedCornerCount: 0,
      preservedPressureExtremaCount: 0,
    };
  }

  kept.push({
    originalIndex: 0,
    sample: firstSample,
    point: mappedPoints[0] ?? null,
  });

  let anchorIdx = 0;
  // 직전 앵커 이후 병합 대기 중인 중간 인덱스들(새 끝점과의 현 오차 검사용)
  let pendingSpanIndices: number[] = [];

  for (let i = 1; i < count - 1; i += 1) {
    const currSample = samples[i];
    if (!currSample) continue;
    const prevSample = samples[i - 1] ?? firstSample;
    const nextSample = samples[i + 1] ?? currSample;
    const anchorSample = samples[anchorIdx] ?? firstSample;

    const pAnchor = mappedPoints[anchorIdx] ?? null;
    const pPrev = mappedPoints[i - 1] ?? pAnchor;
    const pCurr = mappedPoints[i] ?? null;
    const pNext = mappedPoints[i + 1] ?? null;

    if (!pAnchor || !pPrev || !pCurr || !pNext || currSample.shiftKey) {
      kept.push({ originalIndex: i, sample: currSample, point: pCurr });
      anchorIdx = i;
      pendingSpanIndices = [];
      continue;
    }

    // 1. 코너 보존 검사: 인접 세그먼트 전환각 또는 앵커 기준 전환각이 >= 18° 이면 100% 보존
    const localTurnDeg = directionAngleDeg(
      pPrev.x,
      pPrev.y,
      pCurr.x,
      pCurr.y,
      pNext.x,
      pNext.y,
    );
    const anchorTurnDeg =
      anchorIdx !== i - 1
        ? directionAngleDeg(pAnchor.x, pAnchor.y, pCurr.x, pCurr.y, pNext.x, pNext.y)
        : localTurnDeg;
    const isCorner =
      localTurnDeg >= cornerThresholdDeg || anchorTurnDeg >= cornerThresholdDeg;

    if (isCorner) {
      kept.push({ originalIndex: i, sample: currSample, point: pCurr });
      preservedCornerCount += 1;
      anchorIdx = i;
      pendingSpanIndices = [];
      continue;
    }

    // 2. 필압 변곡점(피크/밸리) 및 유의미한 압력·기울기 변화 보존 검사
    const prevPressure = finiteOr(prevSample.pressure, 0.5);
    const currPressure = finiteOr(currSample.pressure, 0.5);
    const nextPressure = finiteOr(nextSample.pressure, 0.5);
    const anchorPressure = finiteOr(anchorSample.pressure, 0.5);

    const isPressureExtrema = isLocalPressureExtrema(
      prevPressure,
      currPressure,
      nextPressure,
    );
    const hasSignificantPressureShift =
      Math.abs(currPressure - anchorPressure) >= PRESSURE_DELTA_PRESERVE_THRESHOLD;
    const hasSignificantTiltShift =
      Math.abs(finiteOr(currSample.tiltX, 0) - finiteOr(anchorSample.tiltX, 0))
        >= TILT_DELTA_PRESERVE_DEG
      || Math.abs(finiteOr(currSample.tiltY, 0) - finiteOr(anchorSample.tiltY, 0))
        >= TILT_DELTA_PRESERVE_DEG;

    if (isPressureExtrema || hasSignificantPressureShift || hasSignificantTiltShift) {
      kept.push({ originalIndex: i, sample: currSample, point: pCurr });
      if (isPressureExtrema) preservedPressureExtremaCount += 1;
      anchorIdx = i;
      pendingSpanIndices = [];
      continue;
    }

    // 3. 현(Chord) 수직 편차 및 최대 병합 거리 검사:
    // 현재 점 i를 건너뛰고 pAnchor -> pNext로 이었을 때, i 및 앞서 건너뛴 모든 중간 점들이
    // 서브픽셀 직선 오차(maxCollinearError) 이내에 놓이는지 검증한다.
    const spanToNext = Math.hypot(pNext.x - pAnchor.x, pNext.y - pAnchor.y);
    let exceedsChordTolerance = spanToNext > maxMergedSpan;
    if (!exceedsChordTolerance) {
      const candidateCheckIndices = [...pendingSpanIndices, i];
      for (const checkIdx of candidateCheckIndices) {
        const pt = mappedPoints[checkIdx];
        if (!pt) continue;
        const err = perpendicularDistanceToChord(
          pt.x,
          pt.y,
          pAnchor.x,
          pAnchor.y,
          pNext.x,
          pNext.y,
        );
        if (err > maxCollinearError) {
          exceedsChordTolerance = true;
          break;
        }
      }
    }

    if (exceedsChordTolerance) {
      kept.push({ originalIndex: i, sample: currSample, point: pCurr });
      anchorIdx = i;
      pendingSpanIndices = [];
      continue;
    }

    pendingSpanIndices.push(i);
  }

  const lastIdx = count - 1;
  const lastSample = samples[lastIdx];
  if (lastSample) {
    kept.push({
      originalIndex: lastIdx,
      sample: lastSample,
      point: mappedPoints[lastIdx] ?? null,
    });
  }

  const droppedCount = Math.max(0, count - kept.length);
  if (droppedCount > 0 || preservedCornerCount > 0) {
    recordStudioDrawingStabilityCounts({
      coalescedSamplesDecimated: droppedCount,
      cornersPreserved: preservedCornerCount,
    });
  }

  const keptIndices = new Set<number>();
  const pointsByIndex = new Map<number, { x: number; y: number }>();
  for (const entry of kept) {
    keptIndices.add(entry.originalIndex);
    if (entry.point) pointsByIndex.set(entry.originalIndex, entry.point);
  }

  return {
    entries: kept,
    keptIndices,
    pointsByIndex,
    droppedCount,
    preservedCornerCount,
    preservedPressureExtremaCount,
  };
}
