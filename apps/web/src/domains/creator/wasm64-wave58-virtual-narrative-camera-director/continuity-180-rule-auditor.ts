/**
 * Wave-58: 180도 시선 축 연속성 감사·점프컷 보정 및 돌리/패닝 키프레임 생성기 (`continuity-180-rule-auditor`).
 *
 * 연속된 컷 시퀀스 전체에서 180도 규칙(Line of Action) 위반, 30도 규칙 위반 점프컷
 * (카메라 각도 변화 < 30° & 화면 크기 유사), 단조로운 동일 샷 반복을 자동 진단하고,
 * 시선 축 반사·안전 측면 회전으로 교정된 대체 카메라 앵글과 시간 단조·부드러운 이징 기반
 * 돌리/패닝 키프레임 트랙을 생성한다.
 */

import {
  SHOT_GRAMMAR_PRESETS,
  type NarrativeShotGrammar,
  type Vec3,
} from "./narrative-beat-shot-classifier";
import { MAX_SAFE_DUTCH_ROLL_DEG } from "./virtual-camera-framing-solver";

/** 연속성 진단 위반 유형. */
export type ContinuityViolationKind = "axis-180-crossing" | "jump-cut-angle-size" | "monotonous-shot-repetition";

/** 위반 심각도. */
export type ContinuitySeverity = "error" | "warning";

/** 시퀀스 내 단일 컷 카메라 배치 노드. */
export interface SequenceCutCameraNode {
  readonly cameraPosition: Vec3;
  readonly cameraTarget: Vec3;
  readonly cameraUp?: Vec3;
  readonly cutId: string;
  readonly durationSec?: number;
  readonly dutchRollDeg?: number;
  readonly focalLengthMm: number;
  readonly gazeDirection?: Vec3;
  readonly isIntentionalAxisReset?: boolean;
  readonly primarySubjectId: string;
  readonly primarySubjectPosition: Vec3;
  readonly secondarySubjectId?: string | null;
  readonly secondarySubjectPosition?: Vec3 | null;
  readonly shotGrammar: NarrativeShotGrammar;
}

/** 연속성 감사 옵션. */
export interface ContinuityAuditOptions {
  readonly jumpCutMaxSizeRatio?: number;
  readonly maxConsecutiveSameShot?: number;
  readonly minAngleDeltaDeg?: number;
}

/** 개별 연속성 위반 진단 레코드. */
export interface ContinuityViolationRecord {
  readonly angleDeltaDeg?: number;
  readonly cutId: string;
  readonly cutIndex: number;
  readonly descriptionKo: string;
  readonly kind: ContinuityViolationKind;
  readonly previousCutId: string;
  readonly relativeSizeRatio?: number;
  readonly severity: ContinuitySeverity;
  readonly suggestedShotGrammar?: NarrativeShotGrammar;
}

/** 교정 완료된 컷 카메라 노드. */
export interface CorrectedSequenceCutCameraNode extends SequenceCutCameraNode {
  readonly appliedCorrections: readonly ContinuityViolationKind[];
  readonly axisSideSign: -1 | 0 | 1;
  readonly wasCorrected: boolean;
}

/** 시퀀스 카메라 연속성 감사 종합 결과. */
export interface SequenceContinuityAuditResult {
  readonly axisCrossingCount: number;
  readonly continuityScore: number;
  readonly correctedCuts: readonly CorrectedSequenceCutCameraNode[];
  readonly establishedAxisSideSign: -1 | 0 | 1;
  readonly jumpCutCount: number;
  readonly monotonousRepetitionCount: number;
  readonly passed: boolean;
  readonly violations: readonly ContinuityViolationRecord[];
}

/** 카메라 워킹 모션 스타일. */
export type CameraMotionStyle = "crane-rise" | "dolly-in" | "dolly-out" | "dutch-creep" | "pan-sweep" | "static-hold";

/** 키프레임 보간 이징 모드. */
export type CameraEasingMode = "cubic-in-out" | "linear" | "quintic-in-out" | "sine-in-out";

/** 단일 카메라 키프레임 스냅샷. */
export interface CameraWorkingKeyframe {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly dutchRollDeg: number;
  readonly easedProgress: number;
  readonly focalLengthMm: number;
  readonly instantaneousSpeedMps: number;
  readonly motionStyle: CameraMotionStyle;
  readonly normalizedProgress: number;
  readonly position: Vec3;
  readonly target: Vec3;
  readonly timeSec: number;
  readonly up: Vec3;
}

/** 컷 단위 키프레임 구간 메타데이터. */
export interface CameraWorkingCutSegment {
  readonly cutId: string;
  readonly cutIndex: number;
  readonly endTimeSec: number;
  readonly keyframeCount: number;
  readonly motionStyle: CameraMotionStyle;
  readonly startTimeSec: number;
}

/** 키프레임 트랙 생성 옵션. */
export interface CameraWorkingTrackOptions {
  readonly easing?: CameraEasingMode;
  readonly fps?: number;
  readonly motionAmplitudeScale?: number;
  readonly motionStyleOverrides?: Readonly<Partial<Record<string, CameraMotionStyle>>>;
  readonly prefersReducedMotion?: boolean;
  readonly samplesPerCut?: number;
}

/** 생성된 전체 시퀀스 카메라 워킹 키프레임 트랙. */
export interface CameraWorkingTrack {
  readonly cutSegments: readonly CameraWorkingCutSegment[];
  readonly easing: CameraEasingMode;
  readonly isStrictlyMonotonicTime: boolean;
  readonly keyframes: readonly CameraWorkingKeyframe[];
  readonly prefersReducedMotion: boolean;
  readonly totalDurationSec: number;
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const roundTo = (v: number, d: number): number => {
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
};
const roundVec3 = (v: Vec3, d = 4): Vec3 => ({ x: roundTo(v.x, d), y: roundTo(v.y, d), z: roundTo(v.z, d) });
const add3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const sub3 = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const scale3 = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const dot3 = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const cross3 = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x,
});
const length3 = (v: Vec3): number => Math.hypot(v.x, v.y, v.z);
const normalize3 = (v: Vec3, fallback: Vec3 = { x: 0, y: 0, z: 1 }): Vec3 => {
  const len = length3(v);
  return len <= 1e-8 ? fallback : { x: v.x / len, y: v.y / len, z: v.z / len };
};
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const lerpVec3 = (a: Vec3, b: Vec3, t: number): Vec3 => ({ x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) });

function rotateAroundPointY(point: Vec3, pivot: Vec3, angleDeg: number): Vec3 {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  const dx = point.x - pivot.x;
  const dz = point.z - pivot.z;
  return { x: pivot.x + dx * c + dz * s, y: point.y, z: pivot.z - dx * s + dz * c };
}

function computeCameraUp(position: Vec3, target: Vec3, dutchRollDeg: number): Vec3 {
  const forward = normalize3(sub3(target, position), { x: 0, y: 0, z: -1 });
  const refUp = Math.abs(dot3(forward, WORLD_UP)) > 0.992 ? { x: 0, y: 0, z: -1 } : WORLD_UP;
  const right = normalize3(cross3(forward, refUp), { x: 1, y: 0, z: 0 });
  const baseUp = normalize3(cross3(right, forward), WORLD_UP);
  const rollRad = (clamp(dutchRollDeg, -MAX_SAFE_DUTCH_ROLL_DEG, MAX_SAFE_DUTCH_ROLL_DEG) * Math.PI) / 180;
  return normalize3(add3(scale3(right, -Math.sin(rollRad)), scale3(baseUp, Math.cos(rollRad))), baseUp);
}

interface LineOfActionXZ {
  readonly axisKey: string;
  readonly dirX: number;
  readonly dirZ: number;
  readonly originX: number;
  readonly originZ: number;
}

function resolveLineOfAction(cut: SequenceCutCameraNode): LineOfActionXZ | null {
  if (cut.secondarySubjectId && cut.secondarySubjectPosition) {
    const aIsFirst = cut.primarySubjectId <= cut.secondarySubjectId;
    const pA = aIsFirst ? cut.primarySubjectPosition : cut.secondarySubjectPosition;
    const pB = aIsFirst ? cut.secondarySubjectPosition : cut.primarySubjectPosition;
    const dx = pB.x - pA.x;
    const dz = pB.z - pA.z;
    const len = Math.hypot(dx, dz);
    if (len > 1e-4) {
      const idPair = aIsFirst ? `${cut.primarySubjectId}::${cut.secondarySubjectId}` : `${cut.secondarySubjectId}::${cut.primarySubjectId}`;
      return { axisKey: `pair:${idPair}`, dirX: dx / len, dirZ: dz / len, originX: (pA.x + pB.x) * 0.5, originZ: (pA.z + pB.z) * 0.5 };
    }
  }
  if (cut.gazeDirection) {
    const len = Math.hypot(cut.gazeDirection.x, cut.gazeDirection.z);
    if (len > 1e-4) {
      return {
        axisKey: `solo:${cut.primarySubjectId}`, dirX: cut.gazeDirection.x / len, dirZ: cut.gazeDirection.z / len,
        originX: cut.primarySubjectPosition.x, originZ: cut.primarySubjectPosition.z,
      };
    }
  }
  return null;
}

const computeAxisSideSignedDistance = (axis: LineOfActionXZ, p: Vec3): number =>
  axis.dirX * (p.z - axis.originZ) - axis.dirZ * (p.x - axis.originX);

const classifyAxisSideSign = (signedDistance: number): -1 | 0 | 1 =>
  Math.abs(signedDistance) < 0.08 ? 0 : signedDistance > 0 ? 1 : -1;

function reflectPointAcrossAxisXZ(axis: LineOfActionXZ, point: Vec3): Vec3 {
  const parallel = (point.x - axis.originX) * axis.dirX + (point.z - axis.originZ) * axis.dirZ;
  const projX = axis.originX + parallel * axis.dirX;
  const projZ = axis.originZ + parallel * axis.dirZ;
  return { x: 2 * projX - point.x, y: point.y, z: 2 * projZ - point.z };
}

function computeCameraAngleDeltaDeg(prevCamPos: Vec3, prevPivot: Vec3, currCamPos: Vec3, currPivot: Vec3): number {
  const cosTheta = clamp(dot3(normalize3(sub3(prevCamPos, prevPivot)), normalize3(sub3(currCamPos, currPivot))), -1, 1);
  return (Math.acos(cosTheta) * 180) / Math.PI;
}

const computeApparentSubjectScale = (camPos: Vec3, subjectPos: Vec3, focalLengthMm: number): number =>
  focalLengthMm / Math.max(0.25, length3(sub3(camPos, subjectPos)));

function pickContrastingShotGrammar(current: NarrativeShotGrammar, hasSecondary: boolean): NarrativeShotGrammar {
  switch (current) {
    case "establishing-wide": return hasSecondary ? "medium-two-shot" : "dramatic-low-angle";
    case "medium-two-shot": return hasSecondary ? "over-the-shoulder" : "extreme-closeup";
    case "over-the-shoulder": return "extreme-closeup";
    case "dramatic-low-angle": return "dutch-tension";
    case "dutch-tension": return "extreme-closeup";
    case "extreme-closeup": return hasSecondary ? "medium-two-shot" : "establishing-wide";
    case "birds-eye-reveal": return hasSecondary ? "over-the-shoulder" : "dramatic-low-angle";
  }
}

/** 180도 안전 측면을 보존하면서 3D 각도 변화가 `minAngleDeltaDeg + 5°` 이상이 되는 최소 회전을 찾는다. */
function resolveSafeJumpCutCameraPosition(
  prevCamPos: Vec3,
  prevPivot: Vec3,
  currCamPos: Vec3,
  currPivot: Vec3,
  minAngleDeltaDeg: number,
  axis: LineOfActionXZ | null,
  requiredSide: -1 | 1 | undefined,
): { readonly achievedAngleDeltaDeg: number; readonly position: Vec3 } {
  const targetAngle = minAngleDeltaDeg + 6;
  const steps = [targetAngle, -targetAngle, targetAngle + 14, -(targetAngle + 14), targetAngle + 28, -(targetAngle + 28)];
  let bestPos = currCamPos;
  let bestAngle = computeCameraAngleDeltaDeg(prevCamPos, prevPivot, currCamPos, currPivot);
  let bestSafePos: Vec3 | null = null;
  let bestSafeAngle = -1;

  for (const deg of steps) {
    const cand = rotateAroundPointY(currCamPos, currPivot, deg);
    const angle = computeCameraAngleDeltaDeg(prevCamPos, prevPivot, cand, currPivot);
    const isSafe = !axis || requiredSide === undefined || computeAxisSideSignedDistance(axis, cand) * requiredSide > 0.12;
    if (isSafe && angle >= targetAngle) {
      return { achievedAngleDeltaDeg: angle, position: cand };
    }
    if (isSafe && angle > bestSafeAngle) {
      bestSafeAngle = angle;
      bestSafePos = cand;
    }
    if (!axis && angle > bestAngle) {
      bestAngle = angle;
      bestPos = cand;
    }
  }
  if (bestSafePos !== null) return { achievedAngleDeltaDeg: bestSafeAngle, position: bestSafePos };
  return { achievedAngleDeltaDeg: bestAngle, position: bestPos };
}

/**
 * 연속된 컷 시퀀스 전체에서 180도 시선 축 위반, 30도 점프컷, 단조로운 샷 반복을
 * 진단하고 시선 축을 보존하는 교정 카메라 앵글을 자동 산출한다.
 */
export function auditSequenceCameraContinuity(
  cuts: readonly SequenceCutCameraNode[],
  options: ContinuityAuditOptions = {},
): SequenceContinuityAuditResult {
  const minAngleDeltaDeg = clamp(options.minAngleDeltaDeg ?? 30, 10, 60);
  const jumpCutMaxSizeRatio = clamp(options.jumpCutMaxSizeRatio ?? 1.35, 1.05, 2.5);
  const maxConsecutiveSameShot = Math.max(1, Math.floor(options.maxConsecutiveSameShot ?? 2));

  const violations: ContinuityViolationRecord[] = [];
  const correctedCuts: CorrectedSequenceCutCameraNode[] = [];
  const establishedSideByAxis = new Map<string, -1 | 1>();

  let globalEstablishedSide: -1 | 0 | 1 = 0;
  let consecutiveSameShotRun = 0;
  let axisCrossingCount = 0;
  let jumpCutCount = 0;
  let monotonousRepetitionCount = 0;

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    const prev = i > 0 ? correctedCuts[i - 1] : null;
    const appliedCorrections: ContinuityViolationKind[] = [];

    let nextPos = cut.cameraPosition;
    let nextTarget = cut.cameraTarget;
    let nextFocal = clamp(cut.focalLengthMm, 12, 250);
    let nextDutch = clamp(cut.dutchRollDeg ?? 0, -MAX_SAFE_DUTCH_ROLL_DEG, MAX_SAFE_DUTCH_ROLL_DEG);
    let nextGrammar = cut.shotGrammar;

    const axis = resolveLineOfAction(cut);
    let currentSideSign: -1 | 0 | 1 = 0;

    if (axis) {
      currentSideSign = classifyAxisSideSign(computeAxisSideSignedDistance(axis, nextPos));
      const established = establishedSideByAxis.get(axis.axisKey);
      if (cut.isIntentionalAxisReset || established === undefined) {
        if (currentSideSign !== 0) {
          establishedSideByAxis.set(axis.axisKey, currentSideSign);
          if (globalEstablishedSide === 0) globalEstablishedSide = currentSideSign;
        }
      } else if (currentSideSign !== 0 && currentSideSign !== established) {
        axisCrossingCount += 1;
        appliedCorrections.push("axis-180-crossing");
        violations.push({
          cutId: cut.cutId, cutIndex: i,
          descriptionKo: `컷 '${cut.cutId}'가 시선 축(180° 규칙)을 넘어 반대편에서 촬영되었습니다. 동일 측면으로 대칭 보정합니다.`,
          kind: "axis-180-crossing", previousCutId: prev ? prev.cutId : cut.cutId, severity: "error",
        });
        nextPos = reflectPointAcrossAxisXZ(axis, nextPos);
        if (length3(sub3(nextTarget, cut.primarySubjectPosition)) > 0.05) {
          nextTarget = reflectPointAcrossAxisXZ(axis, nextTarget);
        }
        nextDutch = -nextDutch;
        currentSideSign = established;
      }
    }

    if (prev && cut.primarySubjectId === prev.primarySubjectId) {
      const angleDeltaDeg = computeCameraAngleDeltaDeg(
        prev.cameraPosition, prev.primarySubjectPosition, nextPos, cut.primarySubjectPosition,
      );
      const prevScale = computeApparentSubjectScale(prev.cameraPosition, prev.primarySubjectPosition, prev.focalLengthMm);
      const currScale = computeApparentSubjectScale(nextPos, cut.primarySubjectPosition, nextFocal);
      const relativeSizeRatio = Math.max(prevScale, currScale) / Math.max(1e-6, Math.min(prevScale, currScale));
      const scaleTierDelta = Math.abs(
        SHOT_GRAMMAR_PRESETS[nextGrammar].shotScaleRank - SHOT_GRAMMAR_PRESETS[prev.shotGrammar].shotScaleRank,
      );

      if (angleDeltaDeg < minAngleDeltaDeg && relativeSizeRatio < jumpCutMaxSizeRatio && scaleTierDelta <= 1) {
        jumpCutCount += 1;
        appliedCorrections.push("jump-cut-angle-size");
        violations.push({
          angleDeltaDeg: roundTo(angleDeltaDeg, 2), cutId: cut.cutId, cutIndex: i,
          descriptionKo: `컷 '${cut.cutId}'의 카메라 각도 변화(${roundTo(angleDeltaDeg, 1)}°)가 ${minAngleDeltaDeg}° 미만이고 프레임 크기 비율(${roundTo(relativeSizeRatio, 2)})이 유사해 점프컷이 발생합니다.`,
          kind: "jump-cut-angle-size", previousCutId: prev.cutId,
          relativeSizeRatio: roundTo(relativeSizeRatio, 3), severity: "error",
        });

        const requiredSide = axis ? establishedSideByAxis.get(axis.axisKey) : undefined;
        const solved = resolveSafeJumpCutCameraPosition(
          prev.cameraPosition, prev.primarySubjectPosition, nextPos, cut.primarySubjectPosition,
          minAngleDeltaDeg, axis, requiredSide,
        );
        nextPos = solved.position;
        const focalFactor = solved.achievedAngleDeltaDeg < minAngleDeltaDeg ? jumpCutMaxSizeRatio + 0.18 : 1.24;
        nextFocal = roundTo(clamp(nextFocal * focalFactor, 18, 135), 1);
      }
    }

    consecutiveSameShotRun = prev && cut.shotGrammar === prev.shotGrammar ? consecutiveSameShotRun + 1 : 1;
    if (consecutiveSameShotRun > maxConsecutiveSameShot && prev) {
      monotonousRepetitionCount += 1;
      const suggested = pickContrastingShotGrammar(cut.shotGrammar, Boolean(cut.secondarySubjectId && cut.secondarySubjectPosition));
      appliedCorrections.push("monotonous-shot-repetition");
      violations.push({
        cutId: cut.cutId, cutIndex: i,
        descriptionKo: `컷 '${cut.cutId}'까지 '${SHOT_GRAMMAR_PRESETS[cut.shotGrammar].labelKo}'가 ${consecutiveSameShotRun}회 연속 반복됩니다. '${SHOT_GRAMMAR_PRESETS[suggested].labelKo}' 전환을 권장합니다.`,
        kind: "monotonous-shot-repetition", previousCutId: prev.cutId, severity: "warning", suggestedShotGrammar: suggested,
      });
      nextGrammar = suggested;
      nextFocal = SHOT_GRAMMAR_PRESETS[suggested].defaultFocalLengthMm;
      consecutiveSameShotRun = 1;
    }

    correctedCuts.push({
      ...cut, appliedCorrections, axisSideSign: currentSideSign,
      cameraPosition: roundVec3(nextPos, 4), cameraTarget: roundVec3(nextTarget, 4),
      cameraUp: roundVec3(computeCameraUp(nextPos, nextTarget, nextDutch), 5),
      dutchRollDeg: roundTo(nextDutch, 3), focalLengthMm: roundTo(nextFocal, 1),
      shotGrammar: nextGrammar, wasCorrected: appliedCorrections.length > 0,
    });
  }

  const penalty = axisCrossingCount * 28 + jumpCutCount * 20 + monotonousRepetitionCount * 10;
  return {
    axisCrossingCount, continuityScore: roundTo(clamp(100 - penalty, 0, 100), 2), correctedCuts,
    establishedAxisSideSign: globalEstablishedSide, jumpCutCount, monotonousRepetitionCount,
    passed: violations.length === 0, violations,
  };
}

/** 정규화 진행률 `t ∈ [0, 1]`에 대해 지정된 카메라 보간 이징 곡선 값을 반환한다. */
export function evaluateCameraEasing(t: number, mode: CameraEasingMode = "cubic-in-out"): number {
  const u = clamp(t, 0, 1);
  switch (mode) {
    case "linear": return u;
    case "sine-in-out": return 0.5 * (1 - Math.cos(Math.PI * u));
    case "cubic-in-out": return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
    case "quintic-in-out": return u < 0.5 ? 16 * u * u * u * u * u : 1 - Math.pow(-2 * u + 2, 5) / 2;
  }
}

function defaultMotionStyleForGrammar(grammar: NarrativeShotGrammar): CameraMotionStyle {
  switch (grammar) {
    case "establishing-wide":
    case "medium-two-shot": return "pan-sweep";
    case "birds-eye-reveal": return "crane-rise";
    case "dutch-tension": return "dutch-creep";
    case "over-the-shoulder":
    case "dramatic-low-angle":
    case "extreme-closeup": return "dolly-in";
  }
}

/**
 * 컷 시퀀스로부터 시간 단조성이 보장된 부드러운 돌리/패닝/크레인/더치 키프레임 트랙을 생성한다.
 * 각 컷의 모션은 180도 시선 축을 침범하지 않도록 클램핑되며, `prefersReducedMotion` 시 정지 자세를 유지한다.
 */
export function generateCameraWorkingKeyframes(
  cuts: readonly SequenceCutCameraNode[],
  options: CameraWorkingTrackOptions = {},
): CameraWorkingTrack {
  const easing: CameraEasingMode = options.easing ?? "cubic-in-out";
  const samplesPerCut = Math.max(2, Math.floor(options.samplesPerCut ?? 5));
  const cutGapSec = 1 / clamp(options.fps ?? 60, 12, 240);
  const amp = clamp(options.motionAmplitudeScale ?? 1.0, 0, 1.5);
  const reducedMotion = Boolean(options.prefersReducedMotion);

  const keyframes: CameraWorkingKeyframe[] = [];
  const cutSegments: CameraWorkingCutSegment[] = [];
  let cursorTimeSec = 0;

  for (let i = 0; i < cuts.length; i += 1) {
    const cut = cuts[i];
    const durationSec = clamp(cut.durationSec ?? 2.0, 0.2, 30);
    const motionStyle: CameraMotionStyle = reducedMotion
      ? "static-hold"
      : (options.motionStyleOverrides?.[cut.cutId] ?? defaultMotionStyleForGrammar(cut.shotGrammar));

    const startPos = cut.cameraPosition;
    const startTarget = cut.cameraTarget;
    const startFocal = clamp(cut.focalLengthMm, 12, 250);
    const startDutch = clamp(cut.dutchRollDeg ?? 0, -MAX_SAFE_DUTCH_ROLL_DEG, MAX_SAFE_DUTCH_ROLL_DEG);
    const viewToTarget = sub3(startTarget, startPos);
    const viewDist = Math.max(0.4, length3(viewToTarget));
    const forward = normalize3(viewToTarget, { x: 0, y: 0, z: -1 });
    const right = normalize3(cross3(forward, WORLD_UP), { x: 1, y: 0, z: 0 });
    const axis = resolveLineOfAction(cut);
    const initialAxisSign = axis ? classifyAxisSideSign(computeAxisSideSignedDistance(axis, startPos)) : 0;

    let endPos = startPos;
    let endTarget = startTarget;
    let endFocal = startFocal;
    let endDutch = startDutch;

    if (motionStyle === "dolly-in") {
      endPos = add3(startPos, scale3(forward, Math.min(viewDist * 0.16, 0.75) * amp));
      endFocal = clamp(startFocal + 4 * amp, 12, 250);
    } else if (motionStyle === "dolly-out") {
      endPos = add3(startPos, scale3(forward, -Math.min(viewDist * 0.2, 0.95) * amp));
      endFocal = clamp(startFocal - 3 * amp, 12, 250);
    } else if (motionStyle === "pan-sweep") {
      const lateral = Math.min(viewDist * 0.14, 0.65) * amp;
      endPos = add3(startPos, scale3(right, lateral));
      endTarget = add3(startTarget, scale3(right, lateral * 0.25));
    } else if (motionStyle === "crane-rise") {
      endPos = add3(startPos, { x: 0, y: Math.min(viewDist * 0.15, 0.85) * amp, z: 0 });
    } else if (motionStyle === "dutch-creep") {
      endDutch = clamp(startDutch + (startDutch >= 0 ? 1 : -1) * 4.5 * amp, -MAX_SAFE_DUTCH_ROLL_DEG, MAX_SAFE_DUTCH_ROLL_DEG);
      endPos = add3(startPos, scale3(forward, Math.min(viewDist * 0.08, 0.35) * amp));
    }

    if (axis && initialAxisSign !== 0) {
      const endSigned = computeAxisSideSignedDistance(axis, endPos) * initialAxisSign;
      if (endSigned <= 0.08) {
        const startSigned = computeAxisSideSignedDistance(axis, startPos) * initialAxisSign;
        endPos = lerpVec3(startPos, endPos, clamp((startSigned - 0.12) / Math.max(1e-4, startSigned - endSigned), 0, 1));
      }
    }

    const startTimeSec = cursorTimeSec;
    const endTimeSec = startTimeSec + durationSec;
    let prevPos: Vec3 | null = null;
    let prevTime = startTimeSec;

    for (let s = 0; s < samplesPerCut; s += 1) {
      const normalizedProgress = s / (samplesPerCut - 1);
      const easedProgress = evaluateCameraEasing(normalizedProgress, easing);
      const timeSec = startTimeSec + durationSec * normalizedProgress;
      const pos = lerpVec3(startPos, endPos, easedProgress);
      const target = lerpVec3(startTarget, endTarget, easedProgress);
      const focal = lerp(startFocal, endFocal, easedProgress);
      const dutch = clamp(lerp(startDutch, endDutch, easedProgress), -MAX_SAFE_DUTCH_ROLL_DEG, MAX_SAFE_DUTCH_ROLL_DEG);
      const speedMps = prevPos !== null && timeSec > prevTime ? length3(sub3(pos, prevPos)) / (timeSec - prevTime) : 0;

      keyframes.push({
        cutId: cut.cutId, cutIndex: i, dutchRollDeg: roundTo(dutch, 3), easedProgress: roundTo(easedProgress, 5),
        focalLengthMm: roundTo(focal, 2), instantaneousSpeedMps: roundTo(speedMps, 4), motionStyle,
        normalizedProgress: roundTo(normalizedProgress, 5), position: roundVec3(pos, 4),
        target: roundVec3(target, 4), timeSec: roundTo(timeSec, 5), up: roundVec3(computeCameraUp(pos, target, dutch), 5),
      });
      prevPos = pos;
      prevTime = timeSec;
    }

    cutSegments.push({
      cutId: cut.cutId, cutIndex: i, endTimeSec: roundTo(endTimeSec, 5),
      keyframeCount: samplesPerCut, motionStyle, startTimeSec: roundTo(startTimeSec, 5),
    });
    cursorTimeSec = endTimeSec + cutGapSec;
  }

  let isStrictlyMonotonicTime = true;
  for (let k = 1; k < keyframes.length; k += 1) {
    if (keyframes[k].timeSec <= keyframes[k - 1].timeSec) {
      isStrictlyMonotonicTime = false;
      break;
    }
  }

  return {
    cutSegments, easing, isStrictlyMonotonicTime, keyframes, prefersReducedMotion: reducedMotion,
    totalDurationSec: keyframes.length > 0 ? keyframes[keyframes.length - 1].timeSec : 0,
  };
}
