/**
 * 펜 떼기 신발끈 튐(Shoelace Lift-Tail Spike) 및 압력 스파이크 억제기.
 *
 * 스타일러스 펜촉이 화면에서 떨어지는 마지막 8~16ms(최대 20ms) 구간에 디지타이저 코일/정전 신호가
 * 순간적으로 먼 좌표로 튀거나 압력이 `0.02 -> 0.95 -> 0`으로 급등하는 신발끈 현상을 실시간 감지한다.
 * - 방향 역전·갈고리 점프 세그먼트는 모든 센서 채널과 함께 원자적으로 제거한다.
 * - 동일 방향 과도 점프는 직전 접선 연장선 안쪽으로 클램핑해 매끄럽게 수렴시킨다.
 * - 리프트 압력 스파이크는 억제하고 자연스러운 코사인 단조 테이퍼링으로 마감한다.
 * - 일관된 보폭과 방향을 유지하는 정상적인 빠른 해칭(직선 스트로크)은 단 1픽셀도 깎지 않는다.
 */

import { isStudioPixelPencilRenderMode } from "../studio-pixel-pencil";
import type { DrawEl } from "../studio-element-model";
import { recordStudioDrawingStabilityCounts } from "./studio-cuttoon-drawing-stability-telemetry";

const DEFAULT_LIFT_WINDOW_MS = 20;
const MIN_SPIKE_JUMP_DOC_PX = 14;
const MIN_HOOK_JUMP_DOC_PX = 5;
const MIN_RECOIL_JUMP_DOC_PX = 3.5;
const FAST_HATCH_MAX_TURN_DEG = 28;
const HOOK_TURN_DEG = 52;
const RECOIL_TURN_DEG = 95;
const OVERSHOOT_STEP_MULTIPLIER = 4.2;
const HOOK_STEP_MULTIPLIER = 2.0;

export interface StudioLiftReleasePressureGuardInput {
  readonly pointerType?: unknown;
  readonly rawPressure?: unknown;
  readonly lastContactPressure: number;
  readonly rawMaterialPressure?: boolean;
}

/**
 * pointerup 하드웨어 이벤트 자체에 실린 리프트 압력 급등(예: 직전 0.04 -> pointerup 0.92)을
 * 소비 전에 1차 차단한다. 머티리얼 워크벤치 브러시는 원시 필압 패리티 계약을 유지한다.
 */
export function sanitizeStudioLiftReleaseRawPressure(
  input: StudioLiftReleasePressureGuardInput,
): number | undefined {
  if (input.rawMaterialPressure) {
    return typeof input.rawPressure === "number" && Number.isFinite(input.rawPressure)
      ? input.rawPressure
      : undefined;
  }
  if (input.pointerType !== "pen") {
    return typeof input.rawPressure === "number" && Number.isFinite(input.rawPressure)
      ? input.rawPressure
      : undefined;
  }
  if (typeof input.rawPressure !== "number" || !Number.isFinite(input.rawPressure)) {
    return undefined;
  }
  const raw = Math.min(1, Math.max(0, input.rawPressure));
  const prev = Math.min(1, Math.max(0, input.lastContactPressure));
  const spikeThreshold = Math.max(prev + 0.28, prev * 1.65 + 0.12);
  if (raw > spikeThreshold) {
    recordStudioDrawingStabilityCounts({ pressureSpikesSuppressed: 1 });
    return Math.max(0, prev * 0.35);
  }
  return raw;
}

export interface StudioStrokeLiftTailStabilizeOptions {
  readonly pointerType?: string;
  readonly releaseRawPressure?: number;
  readonly coordinateScale?: number;
  readonly liftWindowMs?: number;
}

export interface StudioStrokeLiftTailStabilizeResult {
  readonly stroke: DrawEl;
  readonly changed: boolean;
  readonly removedTailSampleCount: number;
  readonly clampedTailEndpoint: boolean;
  readonly suppressedPressureSpike: boolean;
}

function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? 0;
  }
  return ((sorted[mid - 1] ?? 0) + (sorted[mid] ?? 0)) * 0.5;
}

function turnAngleDegrees(
  ax: number,
  ay: number,
  bx: number,
  by: number,
  cx: number,
  cy: number,
): number {
  const v1x = bx - ax;
  const v1y = by - ay;
  const v2x = cx - bx;
  const v2y = cy - by;
  const len1 = Math.hypot(v1x, v1y);
  const len2 = Math.hypot(v2x, v2y);
  if (len1 <= 1e-6 || len2 <= 1e-6) return 0;
  const cos = Math.min(1, Math.max(-1, (v1x * v2x + v1y * v2y) / (len1 * len2)));
  return (Math.acos(cos) * 180) / Math.PI;
}

function sliceOptionalChannel(
  channel: readonly number[] | undefined,
  nextCount: number,
): number[] | undefined {
  if (!channel) return undefined;
  return channel.slice(0, nextCount);
}

function truncateStrokeSamples(stroke: DrawEl, nextPointCount: number): DrawEl {
  return {
    ...stroke,
    points: stroke.points.slice(0, nextPointCount * 2),
    pressures: sliceOptionalChannel(stroke.pressures, nextPointCount),
    tiltXs: sliceOptionalChannel(stroke.tiltXs, nextPointCount),
    tiltYs: sliceOptionalChannel(stroke.tiltYs, nextPointCount),
    twists: sliceOptionalChannel(stroke.twists, nextPointCount),
    speeds: sliceOptionalChannel(stroke.speeds, nextPointCount),
    tangentialPressures: sliceOptionalChannel(stroke.tangentialPressures, nextPointCount),
    altitudeAngles: sliceOptionalChannel(stroke.altitudeAngles, nextPointCount),
    azimuthAngles: sliceOptionalChannel(stroke.azimuthAngles, nextPointCount),
    contactWidths: sliceOptionalChannel(stroke.contactWidths, nextPointCount),
    contactHeights: sliceOptionalChannel(stroke.contactHeights, nextPointCount),
    sampleTimeOffsets: sliceOptionalChannel(stroke.sampleTimeOffsets, nextPointCount),
  };
}

function isSegmentWithinLiftWindow(
  timeOffsets: readonly number[] | undefined,
  pointCount: number,
  segmentEndIndex: number,
  liftWindowMs: number,
): boolean {
  if (!timeOffsets || timeOffsets.length < pointCount || segmentEndIndex <= 0) {
    return true;
  }
  const tPrev = timeOffsets[segmentEndIndex - 1];
  const tCurr = timeOffsets[segmentEndIndex];
  if (typeof tPrev !== "number" || typeof tCurr !== "number") return true;
  const dt = tCurr - tPrev;
  // reduced-precision 타이머(dt === 0)는 허용하되, 의도적 정지 후 이동(dt > liftWindowMs)은 제외한다.
  return dt >= -1 && dt <= liftWindowMs;
}

function hasRecentLiftPressureAnomaly(
  pressures: readonly number[] | undefined,
  pointCount: number,
  releaseRawPressure: number,
): boolean {
  if (!pressures || pressures.length < pointCount || pointCount < 3) return false;
  const last = pressures[pointCount - 1] ?? 0.5;
  const prev = pressures[pointCount - 2] ?? 0.5;
  const beforePrev = pressures[pointCount - 3] ?? prev;
  if (last <= 0.2) return true;
  if (prev <= 0.18 && last >= prev + 0.28 && releaseRawPressure <= 0.12) return true;
  if (last >= beforePrev + 0.35 && releaseRawPressure <= 0.12) return true;
  return false;
}

function detectAndRepairTailGeometry(
  initialStroke: DrawEl,
  scale: number,
  liftWindowMs: number,
  releaseRawPressure: number,
): {
  stroke: DrawEl;
  removedCount: number;
  clampedEndpoint: boolean;
} {
  let working = initialStroke;
  let removedCount = 0;
  let clampedEndpoint = false;

  // 최대 마지막 2개 리프트 샘플까지 역방향으로 검사하되 최소 3개의 본체 샘플은 반드시 남긴다.
  for (let pass = 0; pass < 2; pass += 1) {
    const pointCount = Math.floor(working.points.length / 2);
    if (pointCount < 4) break;
    const lastIdx = pointCount - 1;
    if (!isSegmentWithinLiftWindow(working.sampleTimeOffsets, pointCount, lastIdx, liftWindowMs)) {
      break;
    }

    const xA = working.points[(lastIdx - 2) * 2] ?? 0;
    const yA = working.points[(lastIdx - 2) * 2 + 1] ?? 0;
    const xB = working.points[(lastIdx - 1) * 2] ?? 0;
    const yB = working.points[(lastIdx - 1) * 2 + 1] ?? 0;
    const xC = working.points[lastIdx * 2] ?? 0;
    const yC = working.points[lastIdx * 2 + 1] ?? 0;

    const tailDist = Math.hypot(xC - xB, yC - yB);
    const bodySteps: number[] = [];
    const bodyStart = Math.max(1, lastIdx - 7);
    for (let idx = bodyStart; idx < lastIdx; idx += 1) {
      const px = working.points[(idx - 1) * 2] ?? 0;
      const py = working.points[(idx - 1) * 2 + 1] ?? 0;
      const cx = working.points[idx * 2] ?? 0;
      const cy = working.points[idx * 2 + 1] ?? 0;
      bodySteps.push(Math.hypot(cx - px, cy - py));
    }
    const medianBodyStep = Math.max(0.5 / scale, medianOf(bodySteps));
    const maxBodyStep = Math.max(medianBodyStep, ...bodySteps);
    const turnDeg = turnAngleDegrees(xA, yA, xB, yB, xC, yC);

    // 본체 자체의 방향 일관성 확인 (정상 빠른 직선 해칭 보호 게이트)
    let maxRecentBodyTurnDeg = 0;
    for (let idx = Math.max(2, lastIdx - 4); idx < lastIdx; idx += 1) {
      const bx0 = working.points[(idx - 2) * 2] ?? 0;
      const by0 = working.points[(idx - 2) * 2 + 1] ?? 0;
      const bx1 = working.points[(idx - 1) * 2] ?? 0;
      const by1 = working.points[(idx - 1) * 2 + 1] ?? 0;
      const bx2 = working.points[idx * 2] ?? 0;
      const by2 = working.points[idx * 2 + 1] ?? 0;
      maxRecentBodyTurnDeg = Math.max(
        maxRecentBodyTurnDeg,
        turnAngleDegrees(bx0, by0, bx1, by1, bx2, by2),
      );
    }

    const isConsistentFastHatching =
      turnDeg <= FAST_HATCH_MAX_TURN_DEG
      && maxRecentBodyTurnDeg <= FAST_HATCH_MAX_TURN_DEG
      && tailDist <= Math.max(medianBodyStep * 3.2, maxBodyStep * 2.2);
    if (isConsistentFastHatching) {
      break;
    }

    const pressureAnomaly = hasRecentLiftPressureAnomaly(
      working.pressures,
      pointCount,
      releaseRawPressure,
    );

    const isRecoilWhip =
      turnDeg >= RECOIL_TURN_DEG
      && tailDist >= Math.max(MIN_RECOIL_JUMP_DOC_PX / scale, medianBodyStep * 0.75);
    const isHookSpike =
      turnDeg >= HOOK_TURN_DEG
      && tailDist >= Math.max(MIN_HOOK_JUMP_DOC_PX / scale, medianBodyStep * HOOK_STEP_MULTIPLIER)
      && (pressureAnomaly || tailDist >= Math.max(MIN_SPIKE_JUMP_DOC_PX / scale, maxBodyStep * 2.4));
    const isExtremeOvershoot =
      tailDist >= Math.max(MIN_SPIKE_JUMP_DOC_PX / scale, medianBodyStep * OVERSHOOT_STEP_MULTIPLIER)
      && tailDist > maxBodyStep * 2.8;

    if (isRecoilWhip || isHookSpike) {
      working = truncateStrokeSamples(working, pointCount - 1);
      removedCount += 1;
      continue;
    }

    if (isExtremeOvershoot) {
      if (turnDeg >= 36) {
        working = truncateStrokeSamples(working, pointCount - 1);
        removedCount += 1;
        continue;
      }
      // 접선 방향과 일치하는 초고배율 오버슈트는 직전 진행 벡터 연장선 안쪽으로 부드럽게 클램핑한다.
      const prevDx = xB - xA;
      const prevDy = yB - yA;
      const prevLen = Math.hypot(prevDx, prevDy);
      if (prevLen > 1e-6) {
        const clampLen = Math.min(medianBodyStep * 0.65, 8 / scale);
        const nextPoints = working.points.slice();
        nextPoints[lastIdx * 2] = xB + (prevDx / prevLen) * clampLen;
        nextPoints[lastIdx * 2 + 1] = yB + (prevDy / prevLen) * clampLen;
        working = { ...working, points: nextPoints };
        clampedEndpoint = true;
      } else {
        working = truncateStrokeSamples(working, pointCount - 1);
        removedCount += 1;
      }
      break;
    }

    break;
  }

  return { stroke: working, removedCount, clampedEndpoint };
}

function suppressLiftPressureSpikeAndTaper(
  stroke: DrawEl,
  liftWindowMs: number,
  releaseRawPressure: number,
  geometryRepaired: boolean,
): { stroke: DrawEl; suppressed: boolean } {
  const rawMaterialPressure =
    stroke.mode === "pen" && Boolean(stroke.brushEnginePrograms?.material);
  if (rawMaterialPressure || stroke.mode !== "pen") {
    return { stroke, suppressed: false };
  }
  const pressures = stroke.pressures;
  const pointCount = Math.floor(stroke.points.length / 2);
  if (!pressures || pressures.length < 3 || pressures.length !== pointCount) {
    return { stroke, suppressed: false };
  }

  const bodyEnd = Math.max(1, pointCount - 2);
  const bodySlice = pressures.slice(Math.max(0, bodyEnd - 6), bodyEnd);
  const bodyMedian = Math.max(0.05, medianOf(bodySlice));

  const pLast = pressures[pointCount - 1] ?? bodyMedian;
  const pPrev = pressures[pointCount - 2] ?? bodyMedian;
  const pBeforePrev = pressures[pointCount - 3] ?? bodyMedian;

  const tailInWindow = isSegmentWithinLiftWindow(
    stroke.sampleTimeOffsets,
    pointCount,
    pointCount - 1,
    liftWindowMs,
  );

  // 패턴 1: 0.4 -> 0.02 -> 0.95 (-> 0) 형태의 급락 후 급등(Dip-then-Spike)
  const dipAtPrev =
    pPrev <= Math.min(0.18, bodyMedian * 0.55)
    && pLast >= pPrev + 0.28
    && releaseRawPressure <= 0.15;
  const dipAtBeforePrev =
    pointCount >= 4
    && pBeforePrev <= Math.min(0.18, bodyMedian * 0.55)
    && (pPrev >= pBeforePrev + 0.28 || pLast >= pBeforePrev + 0.28)
    && releaseRawPressure <= 0.15;

  // 패턴 2: 본체 압력 대비 마지막 리프트 프레임에서만 비정상 급등 후 펜이 떨어진 경우
  const terminalBurst =
    tailInWindow
    && releaseRawPressure <= 0.12
    && pLast >= Math.max(bodyMedian, pPrev) + 0.34;

  const spikeDetected = dipAtPrev || dipAtBeforePrev || terminalBurst;
  if (!spikeDetected && !geometryRepaired) {
    return { stroke, suppressed: false };
  }

  const nextPressures = pressures.slice();
  if (spikeDetected) {
    const anchorIdx = dipAtBeforePrev
      ? Math.max(0, pointCount - 4)
      : Math.max(0, pointCount - 3);
    const anchorPressure = Math.min(
      1,
      Math.max(0.04, nextPressures[anchorIdx] ?? bodyMedian),
    );
    const tailCount = pointCount - 1 - anchorIdx;
    const targetTip = Math.max(0.02, anchorPressure * 0.16);
    for (let step = 1; step <= tailCount; step += 1) {
      const idx = anchorIdx + step;
      const t = step / (tailCount + 0.35);
      const cosineWeight = 0.5 * (1 + Math.cos(Math.PI * Math.min(1, t)));
      const tapered = targetTip + (anchorPressure - targetTip) * cosineWeight;
      const prevVal = nextPressures[idx - 1] ?? anchorPressure;
      // 이미 낮게 감쇠하던 필압을 위로 끌어올리지 않고 단조 비증가 테이퍼로 마감한다.
      const existing = nextPressures[idx] ?? tapered;
      const candidate = existing > prevVal ? tapered : Math.min(existing, tapered);
      nextPressures[idx] = Math.max(0.01, Math.min(prevVal, candidate));
    }
    return {
      stroke: { ...stroke, pressures: nextPressures },
      suppressed: true,
    };
  }

  // 좌표 스파이크가 제거/클램핑된 끝단이 고압으로 뭉툭하게 끝나지 않도록 부드러운 2점 테이퍼를 건다.
  const penultIdx = pointCount - 2;
  const lastIdx = pointCount - 1;
  const baseP = nextPressures[penultIdx] ?? bodyMedian;
  const currentLastP = nextPressures[lastIdx] ?? baseP;
  const taperedLast = Math.min(currentLastP, Math.max(0.03, baseP * 0.42));
  if (Math.abs(taperedLast - currentLastP) <= 1e-4) {
    return { stroke, suppressed: false };
  }
  nextPressures[lastIdx] = taperedLast;
  return {
    stroke: { ...stroke, pressures: nextPressures },
    suppressed: false,
  };
}

/**
 * 자유선 릴리스 직후 확정될 `DrawEl`에서 신발끈 좌표 스파이크와 압력 스파이크를 정화한다.
 */
export function stabilizeStudioStrokeLiftTail(
  stroke: DrawEl,
  options: StudioStrokeLiftTailStabilizeOptions = {},
): StudioStrokeLiftTailStabilizeResult {
  const pointerType = options.pointerType ?? "pen";
  if (
    (stroke.kind ?? "freehand") !== "freehand"
    || isStudioPixelPencilRenderMode(stroke.brush)
    || stroke.brush === "pixel"
    || (pointerType !== "pen" && pointerType !== "unknown")
  ) {
    return {
      stroke,
      changed: false,
      removedTailSampleCount: 0,
      clampedTailEndpoint: false,
      suppressedPressureSpike: false,
    };
  }

  const scale =
    typeof options.coordinateScale === "number"
    && Number.isFinite(options.coordinateScale)
    && options.coordinateScale > 0
      ? options.coordinateScale
      : 1;
  const liftWindowMs =
    typeof options.liftWindowMs === "number"
    && Number.isFinite(options.liftWindowMs)
    && options.liftWindowMs > 0
      ? options.liftWindowMs
      : DEFAULT_LIFT_WINDOW_MS;
  const releaseRawPressure =
    typeof options.releaseRawPressure === "number"
    && Number.isFinite(options.releaseRawPressure)
      ? Math.min(1, Math.max(0, options.releaseRawPressure))
      : 0;

  const geometry = detectAndRepairTailGeometry(
    stroke,
    scale,
    liftWindowMs,
    releaseRawPressure,
  );
  const geometryChanged = geometry.removedCount > 0 || geometry.clampedEndpoint;
  const pressureResult = suppressLiftPressureSpikeAndTaper(
    geometry.stroke,
    liftWindowMs,
    releaseRawPressure,
    geometryChanged,
  );

  const changed = geometryChanged || pressureResult.stroke !== geometry.stroke;
  if (geometryChanged || pressureResult.suppressed) {
    recordStudioDrawingStabilityCounts({
      tailSpikesSuppressed: geometryChanged ? 1 : 0,
      pressureSpikesSuppressed: pressureResult.suppressed ? 1 : 0,
    });
  }

  return {
    stroke: pressureResult.stroke,
    changed,
    removedTailSampleCount: geometry.removedCount,
    clampedTailEndpoint: geometry.clampedEndpoint,
    suppressedPressureSpike: pressureResult.suppressed,
  };
}
