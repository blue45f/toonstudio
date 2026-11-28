/**
 * Wave-58: 3D 버추얼 카메라 프레이밍·삼분할/황금나선 구도 해석 솔버 (`virtual-camera-framing-solver`).
 *
 * 피사체 바운딩 박스·얼굴 위치·시선 벡터를 삼분할(Rule of Thirds) 또는 황금나선(Golden Spiral)
 * 교점에 투영 정렬하도록 3D 카메라 위치·타깃·업벡터·더치 틸트(안전 상한 ±22°)·피사계 심도(DoF)를
 * 해석적으로 계산하며, 말풍선 안전 영역과 피사체 얼굴이 겹치지 않도록 프레이밍을 자동 보정한다.
 */

import {
  DEFAULT_FULL_FRAME_SENSOR_HEIGHT_MM,
  SHOT_GRAMMAR_PRESETS,
  computeCameraFovDegrees,
  type NarrativeShotGrammar,
  type NarrativeShotPlan,
  type NormalizedRect2D,
  type Vec2,
  type Vec3,
} from "./narrative-beat-shot-classifier";

/** 어지럼증·화면 균형 붕괴 방지를 위한 더치 틸트 안전 상한(±22°). */
export const MAX_SAFE_DUTCH_ROLL_DEG = 22;

/** 표준 35mm 시네마 허용 착란원 기준(mm). */
export const DEFAULT_CIRCLE_OF_CONFUSION_MM = 0.03;

const GOLDEN_MAJOR = 2 / (1 + Math.sqrt(5));
const GOLDEN_MINOR = 1 - GOLDEN_MAJOR;

/** 삼분할(Rule of Thirds) 4대 교점 (정규화 화면 좌표). */
export const RULE_OF_THIRDS_ANCHORS: readonly Vec2[] = [
  { x: 1 / 3, y: 1 / 3 }, { x: 2 / 3, y: 1 / 3 },
  { x: 1 / 3, y: 2 / 3 }, { x: 2 / 3, y: 2 / 3 },
] as const;

/** 황금나선(Golden Spiral) 4대 초점 교점 (정규화 화면 좌표). */
export const GOLDEN_SPIRAL_ANCHORS: readonly Vec2[] = [
  { x: GOLDEN_MINOR, y: GOLDEN_MINOR }, { x: GOLDEN_MAJOR, y: GOLDEN_MINOR },
  { x: GOLDEN_MINOR, y: GOLDEN_MAJOR }, { x: GOLDEN_MAJOR, y: GOLDEN_MAJOR },
] as const;

/** 구도 정렬 기준 모드. */
export type CompositionAnchorMode = "golden-spiral" | "rule-of-thirds";

/** 3D 축 정렬 바운딩 박스(미터 단위). */
export interface BoundingBox3D { readonly max: Vec3; readonly min: Vec3 }

/** 프레이밍 대상 피사체 3D 명세. */
export interface SubjectFramingTarget {
  readonly bounds: BoundingBox3D;
  readonly faceCenter?: Vec3;
  readonly faceRadiusMeters?: number;
  readonly gazeDirection?: Vec3;
  readonly id: string;
}

/** 버추얼 카메라 프레이밍 솔버 입력. */
export interface VirtualCameraSolveInput {
  readonly apertureFStop?: number;
  readonly aspectRatio?: number;
  readonly azimuthOffsetDeg?: number;
  readonly balloonSafeZones?: readonly NormalizedRect2D[];
  readonly cameraSideSign?: -1 | 1;
  readonly circleOfConfusionLimitMm?: number;
  readonly compositionMode?: CompositionAnchorMode;
  readonly dutchRollDeg?: number;
  readonly elevationDeg?: number;
  readonly focalLengthMm?: number;
  readonly preferredCompositionPoint?: Vec2;
  readonly secondarySubject?: SubjectFramingTarget | null;
  readonly sensorHeightMm?: number;
  readonly shotGrammar: NarrativeShotGrammar;
  readonly shotPlan?: NarrativeShotPlan;
  readonly subject: SubjectFramingTarget;
}

/** 얇은 렌즈 기반 피사계 심도(DoF) 해석 결과. */
export interface DepthOfFieldSpec {
  readonly apertureFStop: number;
  readonly circleOfConfusionLimitMm: number;
  readonly farFocusMeters: number;
  readonly focusDistanceMeters: number;
  readonly hyperfocalDistanceMeters: number;
  readonly isHyperfocal: boolean;
  readonly nearFocusMeters: number;
  readonly totalDepthOfFieldMeters: number;
}

/** 3D 점의 2D 화면 투영 결과. */
export interface ProjectedScreenPoint {
  readonly depthMeters: number;
  readonly inFrontOfCamera: boolean;
  readonly ndcX: number;
  readonly ndcY: number;
  readonly u: number;
  readonly v: number;
}

/** 3D 카메라 리깅 계산 결과. */
export interface VirtualCameraRig {
  readonly apertureFStop: number;
  readonly aspectRatio: number;
  readonly balloonAvoidanceApplied: boolean;
  readonly balloonFaceOverlapRatio: number;
  readonly cameraPosition: Vec3;
  readonly cameraRight: Vec3;
  readonly cameraTarget: Vec3;
  readonly cameraUp: Vec3;
  readonly compositionMode: CompositionAnchorMode;
  readonly depthOfField: DepthOfFieldSpec;
  readonly diagonalFovDeg: number;
  readonly dutchRollDeg: number;
  readonly dutchRollWasClamped: boolean;
  readonly elevationDeg: number;
  readonly focalLengthMm: number;
  readonly horizontalFovDeg: number;
  readonly minBalloonClearance: number;
  readonly projectedFaceCenter: Vec2;
  readonly projectedFaceRect: NormalizedRect2D;
  readonly sensorHeightMm: number;
  readonly shotGrammar: NarrativeShotGrammar;
  readonly targetCompositionAnchor: Vec2;
  readonly verticalFovDeg: number;
}

/** 프레이밍 구도 품질 평가 결과. */
export interface FramingCompositionScore {
  readonly anchorAlignmentScore: number;
  readonly balloonClearanceScore: number;
  readonly dutchSafetyScore: number;
  readonly grade: "A" | "B" | "C" | "D" | "S";
  readonly headroomAndMarginScore: number;
  readonly issuesKo: readonly string[];
  readonly leadRoomScore: number;
  readonly nearestAnchorDistance: number;
  readonly overallScore: number;
}

/** 구도 품질 평가 옵션. */
export interface CompositionEvaluationOptions {
  readonly balloonSafeZones?: readonly NormalizedRect2D[];
  readonly compositionMode?: CompositionAnchorMode;
  readonly subjectGazeDirection?: Vec3;
}

const WORLD_UP: Vec3 = { x: 0, y: 1, z: 0 };
const FALLBACK_UP: Vec3 = { x: 0, y: 0, z: -1 };

const clamp = (v: number, min: number, max: number): number => (Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : min);
const roundTo = (v: number, d: number): number => {
  if (!Number.isFinite(v)) return v;
  const f = Math.pow(10, d);
  return Math.round(v * f) / f;
};
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
const roundVec3 = (v: Vec3, d = 4): Vec3 => ({ x: roundTo(v.x, d), y: roundTo(v.y, d), z: roundTo(v.z, d) });

const getBoundsCenter = (b: BoundingBox3D): Vec3 => ({
  x: (b.min.x + b.max.x) * 0.5, y: (b.min.y + b.max.y) * 0.5, z: (b.min.z + b.max.z) * 0.5,
});
const getBoundsSize = (b: BoundingBox3D): Vec3 => ({
  x: Math.max(0.05, Math.abs(b.max.x - b.min.x)),
  y: Math.max(0.05, Math.abs(b.max.y - b.min.y)),
  z: Math.max(0.05, Math.abs(b.max.z - b.min.z)),
});

function resolveFaceCenter(subject: SubjectFramingTarget): Vec3 {
  if (subject.faceCenter) return subject.faceCenter;
  const center = getBoundsCenter(subject.bounds);
  const height = Math.max(0.1, subject.bounds.max.y - subject.bounds.min.y);
  return { x: center.x, y: subject.bounds.min.y + height * 0.85, z: center.z };
}

function resolveFaceRadius(subject: SubjectFramingTarget): number {
  if (subject.faceRadiusMeters !== undefined && subject.faceRadiusMeters > 0) {
    return clamp(subject.faceRadiusMeters, 0.06, 0.45);
  }
  return clamp(Math.max(0.2, subject.bounds.max.y - subject.bounds.min.y) * 0.085, 0.1, 0.22);
}

interface CameraBasis { readonly forward: Vec3; readonly right: Vec3; readonly up: Vec3 }

function buildCameraBasis(position: Vec3, target: Vec3, dutchRollDeg: number): CameraBasis {
  const forward = normalize3(sub3(target, position), { x: 0, y: 0, z: -1 });
  const refUp = Math.abs(dot3(forward, WORLD_UP)) > 0.992 ? FALLBACK_UP : WORLD_UP;
  const baseRight = normalize3(cross3(forward, refUp), { x: 1, y: 0, z: 0 });
  const baseUp = normalize3(cross3(baseRight, forward), WORLD_UP);
  const rollRad = (dutchRollDeg * Math.PI) / 180;
  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);
  return {
    forward,
    right: normalize3(add3(scale3(baseRight, cosR), scale3(baseUp, sinR)), baseRight),
    up: normalize3(add3(scale3(baseRight, -sinR), scale3(baseUp, cosR)), baseUp),
  };
}

/** 3D 월드 좌표를 카메라 투영 행렬로 정규화 화면 좌표(`[0, 1]`)에 투영한다. */
export function projectWorldPointToScreen(
  point: Vec3,
  cameraPosition: Vec3,
  cameraTarget: Vec3,
  verticalFovDeg: number,
  aspectRatio: number,
  dutchRollDeg = 0,
): ProjectedScreenPoint {
  const basis = buildCameraBasis(cameraPosition, cameraTarget, dutchRollDeg);
  const rel = sub3(point, cameraPosition);
  const zCam = dot3(rel, basis.forward);
  const tanHalfV = Math.tan(((clamp(verticalFovDeg, 5, 160) * Math.PI) / 180) * 0.5);
  const tanHalfH = tanHalfV * clamp(aspectRatio, 0.35, 3.5);
  const safeDepth = Math.max(0.001, zCam);
  const ndcX = dot3(rel, basis.right) / (safeDepth * tanHalfH);
  const ndcY = dot3(rel, basis.up) / (safeDepth * tanHalfV);
  return {
    depthMeters: zCam, inFrontOfCamera: zCam > 0.001,
    ndcX, ndcY, u: 0.5 + 0.5 * ndcX, v: 0.5 - 0.5 * ndcY,
  };
}

function projectFaceRect(
  faceCenter: Vec3,
  faceRadiusMeters: number,
  cameraPosition: Vec3,
  cameraTarget: Vec3,
  verticalFovDeg: number,
  aspectRatio: number,
  dutchRollDeg: number,
): { readonly center: Vec2; readonly rect: NormalizedRect2D } {
  const proj = projectWorldPointToScreen(faceCenter, cameraPosition, cameraTarget, verticalFovDeg, aspectRatio, dutchRollDeg);
  const tanHalfV = Math.tan(((clamp(verticalFovDeg, 5, 160) * Math.PI) / 180) * 0.5);
  const tanHalfH = tanHalfV * clamp(aspectRatio, 0.35, 3.5);
  const depth = Math.max(0.1, proj.depthMeters);
  const halfW = clamp((faceRadiusMeters / (depth * tanHalfH)) * 0.55, 0.025, 0.32);
  const halfH = clamp((faceRadiusMeters / (depth * tanHalfV)) * 0.62, 0.03, 0.36);
  return {
    center: { x: proj.u, y: proj.v },
    rect: { height: halfH * 2, width: halfW * 2, x: proj.u - halfW, y: proj.v - halfH },
  };
}

function rectIntersectionArea(a: NormalizedRect2D, b: NormalizedRect2D): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return xOverlap * yOverlap;
}

function rectEdgeClearance(a: NormalizedRect2D, b: NormalizedRect2D): number {
  const dx = Math.max(0, Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width)));
  const dy = Math.max(0, Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height)));
  return Math.hypot(dx, dy);
}

function evaluateBalloonOverlap(
  faceRect: NormalizedRect2D,
  zones: readonly NormalizedRect2D[],
): { readonly minClearance: number; readonly overlapRatio: number } {
  if (zones.length === 0) return { minClearance: 1, overlapRatio: 0 };
  const faceArea = Math.max(1e-6, faceRect.width * faceRect.height);
  let totalOverlap = 0;
  let minClearance = Infinity;
  for (const zone of zones) {
    const overlap = rectIntersectionArea(faceRect, zone);
    totalOverlap += overlap;
    const clearance = overlap > 0 ? 0 : rectEdgeClearance(faceRect, zone);
    if (clearance < minClearance) minClearance = clearance;
  }
  return { minClearance: Number.isFinite(minClearance) ? minClearance : 1, overlapRatio: clamp(totalOverlap / faceArea, 0, 1) };
}

function computeDepthOfField(
  focalLengthMm: number,
  apertureFStop: number,
  focusDistanceMeters: number,
  cocLimitMm: number,
): DepthOfFieldSpec {
  const f = clamp(focalLengthMm, 10, 300);
  const n = clamp(apertureFStop, 1.0, 32);
  const c = clamp(cocLimitMm, 0.005, 0.1);
  const sMm = Math.max(f * 2, focusDistanceMeters * 1000);
  const hyperfocalMm = (f * f) / (n * c) + f;
  const nearMm = (sMm * (hyperfocalMm - f)) / Math.max(1e-3, hyperfocalMm + sMm - 2 * f);
  const isHyperfocal = sMm >= hyperfocalMm - f;
  const farMm = isHyperfocal ? Infinity : (sMm * (hyperfocalMm - f)) / Math.max(1e-3, hyperfocalMm - sMm);
  return {
    apertureFStop: n, circleOfConfusionLimitMm: c,
    farFocusMeters: isHyperfocal ? Infinity : roundTo(farMm / 1000, 4),
    focusDistanceMeters: roundTo(focusDistanceMeters, 4),
    hyperfocalDistanceMeters: roundTo(hyperfocalMm / 1000, 4),
    isHyperfocal, nearFocusMeters: roundTo(nearMm / 1000, 4),
    totalDepthOfFieldMeters: isHyperfocal ? Infinity : roundTo((farMm - nearMm) / 1000, 4),
  };
}

function rotateY(v: Vec3, angleDeg: number): Vec3 {
  const rad = (angleDeg * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  return { x: v.x * c + v.z * s, y: v.y, z: -v.x * s + v.z * c };
}

function solveTargetForAnchor(
  cameraPosition: Vec3,
  faceCenter: Vec3,
  desiredAnchor: Vec2,
  verticalFovDeg: number,
  aspectRatio: number,
  dutchRollDeg: number,
): Vec3 {
  const tanHalfV = Math.tan(((clamp(verticalFovDeg, 5, 160) * Math.PI) / 180) * 0.5);
  const tanHalfH = tanHalfV * clamp(aspectRatio, 0.35, 3.5);
  const desiredNdcX = (desiredAnchor.x - 0.5) * 2;
  const desiredNdcY = (0.5 - desiredAnchor.y) * 2;

  let target = faceCenter;
  for (let iter = 0; iter < 5; iter += 1) {
    const basis = buildCameraBasis(cameraPosition, target, dutchRollDeg);
    const relFace = sub3(faceCenter, cameraPosition);
    const depth = Math.max(0.15, dot3(relFace, basis.forward));
    const errX = dot3(relFace, basis.right) / (depth * tanHalfH) - desiredNdcX;
    const errY = dot3(relFace, basis.up) / (depth * tanHalfV) - desiredNdcY;
    if (Math.hypot(errX, errY) < 1e-4) break;
    target = add3(target, add3(scale3(basis.right, errX * depth * tanHalfH), scale3(basis.up, errY * depth * tanHalfV)));
  }
  return target;
}

function computeBaseViewDirection(input: VirtualCameraSolveInput, subjectFace: Vec3, elevationDeg: number): Vec3 {
  const sideSign: -1 | 1 = input.cameraSideSign ?? 1;
  let horizDir: Vec3;

  if (input.secondarySubject && input.shotGrammar === "over-the-shoulder") {
    const secCenter = getBoundsCenter(input.secondarySubject.bounds);
    const toSpeaker = normalize3({ x: subjectFace.x - secCenter.x, y: 0, z: subjectFace.z - secCenter.z }, { x: 0, y: 0, z: -1 });
    const perp = { x: -toSpeaker.z * sideSign, y: 0, z: toSpeaker.x * sideSign };
    horizDir = normalize3(add3(scale3(toSpeaker, -0.92), scale3(perp, 0.39)));
  } else if (input.secondarySubject && input.shotGrammar === "medium-two-shot") {
    const secCenter = getBoundsCenter(input.secondarySubject.bounds);
    const axis = normalize3({ x: secCenter.x - subjectFace.x, y: 0, z: secCenter.z - subjectFace.z }, { x: 1, y: 0, z: 0 });
    horizDir = { x: -axis.z * sideSign, y: 0, z: axis.x * sideSign };
  } else {
    const gazeXZ = normalize3(
      { x: input.subject.gazeDirection?.x ?? 0, y: 0, z: input.subject.gazeDirection?.z ?? 1 },
      { x: 0, y: 0, z: 1 },
    );
    horizDir = rotateY(gazeXZ, (input.shotGrammar === "extreme-closeup" ? 12 : 26) * sideSign);
  }

  if (Math.abs(input.azimuthOffsetDeg ?? 0) > 1e-4) horizDir = rotateY(horizDir, input.azimuthOffsetDeg ?? 0);
  const elevRad = (clamp(elevationDeg, -55, 82) * Math.PI) / 180;
  return normalize3({ x: horizDir.x * Math.cos(elevRad), y: Math.sin(elevRad), z: horizDir.z * Math.cos(elevRad) });
}

function selectInitialCompositionAnchor(
  mode: CompositionAnchorMode,
  preferredPoint: Vec2 | undefined,
  shotPlan: NarrativeShotPlan | undefined,
  gazeScreenX: number,
): Vec2 {
  if (preferredPoint) return { x: clamp(preferredPoint.x, 0.14, 0.86), y: clamp(preferredPoint.y, 0.14, 0.86) };
  const anchors = mode === "golden-spiral" ? GOLDEN_SPIRAL_ANCHORS : RULE_OF_THIRDS_ANCHORS;
  const hint = shotPlan?.negativeSpace.subjectAnchorHint;
  if (hint === "left-third") return anchors[0];
  if (hint === "right-third") return anchors[1];
  if (hint === "center-lower") return { x: gazeScreenX >= 0 ? anchors[0].x : anchors[1].x, y: anchors[2].y };
  return gazeScreenX >= 0 ? anchors[0] : anchors[1];
}

/**
 * 피사체 바운딩 박스·시선·말풍선 안전 영역을 고려해 3D 카메라 리깅(위치·타깃·업벡터·더치 틸트·DoF)을
 * 해석적으로 계산한다.
 */
export function solveVirtualCameraRig(input: VirtualCameraSolveInput): VirtualCameraRig {
  const preset = SHOT_GRAMMAR_PRESETS[input.shotGrammar];
  const compositionMode: CompositionAnchorMode = input.compositionMode ?? "rule-of-thirds";
  const aspectRatio = clamp(input.aspectRatio ?? input.shotPlan?.aspectRatio ?? 16 / 9, 0.35, 3.5);
  const sensorHeightMm = clamp(input.sensorHeightMm ?? input.shotPlan?.sensorHeightMm ?? DEFAULT_FULL_FRAME_SENSOR_HEIGHT_MM, 6, 70);
  const focalLengthMm = clamp(input.focalLengthMm ?? input.shotPlan?.focalLengthMm ?? preset.defaultFocalLengthMm, 12, 250);
  const apertureFStop = clamp(input.apertureFStop ?? input.shotPlan?.apertureFStop ?? preset.defaultApertureFStop, 1.2, 22);
  const elevationDeg = clamp(input.elevationDeg ?? input.shotPlan?.recommendedElevationDeg ?? preset.defaultElevationDeg, -55, 82);
  const requestedDutch = input.dutchRollDeg ?? input.shotPlan?.recommendedDutchRollDeg ?? preset.defaultDutchRollDeg;
  const dutchRollDeg = roundTo(clamp(requestedDutch, -MAX_SAFE_DUTCH_ROLL_DEG, MAX_SAFE_DUTCH_ROLL_DEG), 3);
  const dutchRollWasClamped = Math.abs(requestedDutch) > MAX_SAFE_DUTCH_ROLL_DEG + 1e-6;

  const fov = computeCameraFovDegrees(focalLengthMm, aspectRatio, sensorHeightMm);
  const faceCenter = resolveFaceCenter(input.subject);
  const faceRadius = resolveFaceRadius(input.subject);
  const subjectSize = getBoundsSize(input.subject.bounds);
  const subjectCenter = getBoundsCenter(input.subject.bounds);

  let frameSpanMeters = subjectSize.y;
  let pivotCenter = faceCenter;
  if (input.shotGrammar === "extreme-closeup") {
    frameSpanMeters = faceRadius * 3.8;
  } else if (input.secondarySubject && input.shotGrammar === "medium-two-shot") {
    const secCenter = getBoundsCenter(input.secondarySubject.bounds);
    const pairWidth = length3(sub3(subjectCenter, secCenter)) + subjectSize.x * 1.4;
    frameSpanMeters = Math.max(subjectSize.y, pairWidth / Math.max(0.6, aspectRatio));
    const mid = scale3(add3(subjectCenter, secCenter), 0.5);
    pivotCenter = { x: mid.x, y: faceCenter.y - subjectSize.y * 0.14, z: mid.z };
  } else if (input.shotGrammar === "establishing-wide" || input.shotGrammar === "birds-eye-reveal") {
    frameSpanMeters = Math.max(subjectSize.y, 1.8);
    pivotCenter = subjectCenter;
  }

  const tanHalfV = Math.tan(((fov.verticalFovDeg * Math.PI) / 180) * 0.5);
  let distanceMeters = clamp(frameSpanMeters / (2 * preset.baseSubjectScreenHeightRatio * tanHalfV), 0.55, 48);
  if (input.secondarySubject && input.shotGrammar === "over-the-shoulder") {
    distanceMeters = Math.max(distanceMeters, length3(sub3(faceCenter, resolveFaceCenter(input.secondarySubject))) + 0.85);
  }

  const viewDirFromPivot = computeBaseViewDirection(input, faceCenter, elevationDeg);
  const initialCamPos = add3(pivotCenter, scale3(viewDirFromPivot, distanceMeters));
  const initialBasis = buildCameraBasis(initialCamPos, faceCenter, dutchRollDeg);
  const gazeScreenX = dot3(normalize3(input.subject.gazeDirection ?? { x: 0, y: 0, z: 1 }), initialBasis.right);
  const balloonZones: readonly NormalizedRect2D[] =
    input.balloonSafeZones ?? (input.shotPlan ? [input.shotPlan.negativeSpace.balloonSafeRect] : []);

  const initialAnchor = selectInitialCompositionAnchor(compositionMode, input.preferredCompositionPoint, input.shotPlan, gazeScreenX);
  const modeAnchors = compositionMode === "golden-spiral" ? GOLDEN_SPIRAL_ANCHORS : RULE_OF_THIRDS_ANCHORS;
  const candidateAnchors: readonly Vec2[] = [
    initialAnchor, ...modeAnchors,
    { x: 0.5, y: 0.58 }, { x: 0.333, y: 0.68 }, { x: 0.667, y: 0.68 },
    { x: 0.24, y: 0.52 }, { x: 0.76, y: 0.52 }, { x: 0.5, y: 0.74 },
  ];

  let chosenAnchor = initialAnchor;
  let chosenCamPos = initialCamPos;
  let chosenTarget = solveTargetForAnchor(initialCamPos, faceCenter, initialAnchor, fov.verticalFovDeg, aspectRatio, dutchRollDeg);
  let chosenFaceProj = projectFaceRect(faceCenter, faceRadius, chosenCamPos, chosenTarget, fov.verticalFovDeg, aspectRatio, dutchRollDeg);
  let chosenBalloonStats = evaluateBalloonOverlap(chosenFaceProj.rect, balloonZones);
  let balloonAvoidanceApplied = false;

  if (balloonZones.length > 0 && chosenBalloonStats.overlapRatio > 0) {
    balloonAvoidanceApplied = true;
    let bestCost = Infinity;
    for (const distScale of [1.0, 1.22, 1.48]) {
      const testCamPos = add3(pivotCenter, scale3(viewDirFromPivot, clamp(distanceMeters * distScale, 0.55, 55)));
      for (const cand of candidateAnchors) {
        const testTarget = solveTargetForAnchor(testCamPos, faceCenter, cand, fov.verticalFovDeg, aspectRatio, dutchRollDeg);
        const testProj = projectFaceRect(faceCenter, faceRadius, testCamPos, testTarget, fov.verticalFovDeg, aspectRatio, dutchRollDeg);
        const stats = evaluateBalloonOverlap(testProj.rect, balloonZones);
        const outOfBounds =
          testProj.rect.x < 0.04 || testProj.rect.y < 0.04 ||
          testProj.rect.x + testProj.rect.width > 0.96 || testProj.rect.y + testProj.rect.height > 0.96;
        const cost =
          stats.overlapRatio * 100 + (outOfBounds ? 2.5 : 0) +
          Math.hypot(cand.x - initialAnchor.x, cand.y - initialAnchor.y) * 0.65 +
          (distScale - 1) * 1.1 - Math.min(0.12, stats.minClearance);
        if (cost < bestCost) {
          bestCost = cost;
          chosenAnchor = cand;
          chosenCamPos = testCamPos;
          chosenTarget = testTarget;
          chosenFaceProj = testProj;
          chosenBalloonStats = stats;
        }
      }
      if (chosenBalloonStats.overlapRatio === 0 && chosenBalloonStats.minClearance >= 0.025) break;
    }
  }

  const finalBasis = buildCameraBasis(chosenCamPos, chosenTarget, dutchRollDeg);
  const depthOfField = computeDepthOfField(
    focalLengthMm, apertureFStop, Math.max(0.25, length3(sub3(faceCenter, chosenCamPos))),
    input.circleOfConfusionLimitMm ?? DEFAULT_CIRCLE_OF_CONFUSION_MM,
  );

  return {
    apertureFStop: roundTo(apertureFStop, 2), aspectRatio: roundTo(aspectRatio, 4),
    balloonAvoidanceApplied, balloonFaceOverlapRatio: roundTo(chosenBalloonStats.overlapRatio, 4),
    cameraPosition: roundVec3(chosenCamPos, 4), cameraRight: roundVec3(finalBasis.right, 5),
    cameraTarget: roundVec3(chosenTarget, 4), cameraUp: roundVec3(finalBasis.up, 5),
    compositionMode, depthOfField, diagonalFovDeg: fov.diagonalFovDeg, dutchRollDeg, dutchRollWasClamped,
    elevationDeg: roundTo(elevationDeg, 2), focalLengthMm: roundTo(focalLengthMm, 1),
    horizontalFovDeg: fov.horizontalFovDeg, minBalloonClearance: roundTo(chosenBalloonStats.minClearance, 4),
    projectedFaceCenter: { x: roundTo(chosenFaceProj.center.x, 4), y: roundTo(chosenFaceProj.center.y, 4) },
    projectedFaceRect: {
      height: roundTo(chosenFaceProj.rect.height, 4), width: roundTo(chosenFaceProj.rect.width, 4),
      x: roundTo(chosenFaceProj.rect.x, 4), y: roundTo(chosenFaceProj.rect.y, 4),
    },
    sensorHeightMm, shotGrammar: input.shotGrammar,
    targetCompositionAnchor: { x: roundTo(chosenAnchor.x, 4), y: roundTo(chosenAnchor.y, 4) },
    verticalFovDeg: fov.verticalFovDeg,
  };
}

/**
 * 계산된 버추얼 카메라 리깅의 삼분할/황금나선 정합도, 말풍선 회피 여유,
 * 화면 여백(Headroom), 시선 리드 룸 및 더치 틸트 안전성을 종합 채점한다.
 */
export function evaluateFramingCompositionScore(
  rig: VirtualCameraRig,
  options: CompositionEvaluationOptions = {},
): FramingCompositionScore {
  const mode = options.compositionMode ?? rig.compositionMode;
  const anchors = mode === "golden-spiral" ? GOLDEN_SPIRAL_ANCHORS : RULE_OF_THIRDS_ANCHORS;
  const issuesKo: string[] = [];

  let nearestAnchorDistance = Infinity;
  for (const anchor of anchors) {
    const dist = Math.hypot(rig.projectedFaceCenter.x - anchor.x, rig.projectedFaceCenter.y - anchor.y);
    if (dist < nearestAnchorDistance) nearestAnchorDistance = dist;
  }
  const anchorAlignmentScore = clamp(Math.exp(-(nearestAnchorDistance * nearestAnchorDistance) / (2 * 0.16 * 0.16)), 0, 1);
  if (anchorAlignmentScore < 0.55) issuesKo.push("피사체 얼굴 중심이 삼분할/황금나선 주요 교점에서 크게 벗어났습니다.");

  const balloonStats = options.balloonSafeZones
    ? evaluateBalloonOverlap(rig.projectedFaceRect, options.balloonSafeZones)
    : { minClearance: rig.minBalloonClearance, overlapRatio: rig.balloonFaceOverlapRatio };
  const balloonClearanceScore =
    balloonStats.overlapRatio > 0
      ? clamp(1 - balloonStats.overlapRatio * 2.5, 0, 0.4)
      : clamp(0.75 + Math.min(0.05, balloonStats.minClearance) * 5, 0.75, 1);
  if (balloonStats.overlapRatio > 0.01) issuesKo.push("말풍선 안전 영역과 피사체 얼굴이 겹칩니다.");

  const r = rig.projectedFaceRect;
  const marginOverflow =
    Math.max(0, 0.05 - r.x) + Math.max(0, 0.05 - r.y) + Math.max(0, r.x + r.width - 0.95) + Math.max(0, r.y + r.height - 0.95);
  const headroomAndMarginScore = clamp(1 - marginOverflow * 4.2, 0, 1);
  if (headroomAndMarginScore < 0.7) issuesKo.push("피사체 얼굴이 프레임 가장자리에 지나치게 밀착되거나 잘립니다.");

  let leadRoomScore = 0.85;
  if (options.subjectGazeDirection) {
    const gazeX = dot3(normalize3(options.subjectGazeDirection), rig.cameraRight);
    if (Math.abs(gazeX) > 0.15) {
      const spaceAhead = gazeX > 0 ? 1 - rig.projectedFaceCenter.x : rig.projectedFaceCenter.x;
      leadRoomScore = clamp((spaceAhead - 0.2) / 0.45, 0.15, 1);
      if (leadRoomScore < 0.55) issuesKo.push("시선 방향 앞쪽 여백(Lead Room)이 부족합니다.");
    }
  }

  const absDutch = Math.abs(rig.dutchRollDeg);
  const dutchSafetyScore =
    absDutch <= MAX_SAFE_DUTCH_ROLL_DEG ? 1 : clamp(1 - (absDutch - MAX_SAFE_DUTCH_ROLL_DEG) / 18, 0, 1);
  if (dutchSafetyScore < 1) {
    issuesKo.push(`더치 틸트(${absDutch}°)가 안전 상한(±${MAX_SAFE_DUTCH_ROLL_DEG}°)을 초과했습니다.`);
  }

  const overallScore = roundTo(
    clamp(
      (anchorAlignmentScore * 0.32 + balloonClearanceScore * 0.3 + headroomAndMarginScore * 0.18 +
        leadRoomScore * 0.1 + dutchSafetyScore * 0.1) * 100,
      0,
      100,
    ),
    2,
  );
  const grade = overallScore >= 90 ? "S" : overallScore >= 80 ? "A" : overallScore >= 68 ? "B" : overallScore >= 52 ? "C" : "D";

  return {
    anchorAlignmentScore: roundTo(anchorAlignmentScore, 4),
    balloonClearanceScore: roundTo(balloonClearanceScore, 4),
    dutchSafetyScore: roundTo(dutchSafetyScore, 4),
    grade,
    headroomAndMarginScore: roundTo(headroomAndMarginScore, 4),
    issuesKo,
    leadRoomScore: roundTo(leadRoomScore, 4),
    nearestAnchorDistance: roundTo(nearestAnchorDistance, 4),
    overallScore,
  };
}
