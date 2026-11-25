/**
 * Wave 41C — 웹툰 시네마토그래피 3D 카메라 광학 · 180도 법칙(Line-of-Action) 감시 · 구도 조화 점수 엔진.
 *
 * - 35mm 풀프레임 핀홀 투영 수학(24/35/50/85/135mm 수평·수직·대각 화각, 원근 왜곡률, 피사계 심도·CoC 블러)
 * - 3D 월드 좌표 → 2D 프레임 핀홀 투영기
 * - 연속 컷 180도 축 넘침(Axis Crossing) 자동 감지기(외적 부호 반전 검출 + 거울 반사 안전 카메라 제안)
 * - 삼분할(Rule of Thirds) · 황금나선(Golden Spiral) · 헤드룸/시선 여백(Lookroom) 구도 조화 점수(0~100)
 */

import { assertComposition, assertRule180Input, assertShots, requireFinite, requirePositive, requireChoice, shotSignature } from "./cinematography-input-contract";

export const FULL_FRAME_SENSOR_MM = { widthMm: 36, heightMm: 24, diagonalMm: Math.hypot(36, 24), cocLimitMm: 0.03 } as const;

export const GOLDEN_RATIO = (1 + Math.sqrt(5)) / 2;
export const GOLDEN_RECIPROCAL = 1 / GOLDEN_RATIO;
export const GOLDEN_SPIRAL_POLE_MAJOR = (GOLDEN_RATIO * GOLDEN_RATIO) / (1 + GOLDEN_RATIO * GOLDEN_RATIO);
export const GOLDEN_SPIRAL_POLE_MINOR = 1 - GOLDEN_SPIRAL_POLE_MAJOR;

export const CINEMA_FOCAL_LENGTHS = [24, 35, 50, 85, 135] as const;
export type CinemaFocalLengthMm = (typeof CINEMA_FOCAL_LENGTHS)[number];

export interface CinemaLensPresetSpec {
  readonly focalLengthMm: CinemaFocalLengthMm;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly roleKo: string;
  readonly roleEn: string;
  readonly recommendedFStop: number;
  readonly distortionCharacterKo: string;
  readonly distortionCharacterEn: string;
}

export const CINEMA_LENS_PRESETS: Readonly<Record<CinemaFocalLengthMm, CinemaLensPresetSpec>> = {
  24: {
    focalLengthMm: 24, labelKo: "24mm 광각", labelEn: "24mm Wide",
    roleKo: "공간감·액션 원근 과장", roleEn: "Spatial depth & dramatic action", recommendedFStop: 4.0,
    distortionCharacterKo: "강한 원근 확장", distortionCharacterEn: "Strong perspective expansion",
  },
  35: {
    focalLengthMm: 35, labelKo: "35mm 준광각", labelEn: "35mm Cinema Standard",
    roleKo: "영화적 스토리텔링 기본 컷", roleEn: "Classic narrative storytelling", recommendedFStop: 2.8,
    distortionCharacterKo: "자연스러운 공간 몰입", distortionCharacterEn: "Natural spatial immersion",
  },
  50: {
    focalLengthMm: 50, labelKo: "50mm 표준", labelEn: "50mm Normal",
    roleKo: "인간 시야 기준 대화·정면 컷", roleEn: "Natural human-eye dialogue", recommendedFStop: 2.0,
    distortionCharacterKo: "기준 원근 (왜곡 균형)", distortionCharacterEn: "Reference neutral perspective",
  },
  85: {
    focalLengthMm: 85, labelKo: "85mm 중망원", labelEn: "85mm Portrait",
    roleKo: "인물 클로즈업·감정선 집중", roleEn: "Intimate portrait & emotion", recommendedFStop: 1.8,
    distortionCharacterKo: "부드러운 인물 압축", distortionCharacterEn: "Flattering portrait compression",
  },
  135: {
    focalLengthMm: 135, labelKo: "135mm 망원", labelEn: "135mm Telephoto",
    roleKo: "초압축 대치·극적 배경 분리", roleEn: "High-tension background compression", recommendedFStop: 2.0,
    distortionCharacterKo: "강한 배경 압축·깊은 보케", distortionCharacterEn: "Strong telephoto compression",
  },
};

export type PerspectiveDistortionClass = "wide-exaggerated" | "natural-narrative" | "telephoto-compressed";
export type BokehSeparationGrade = "deep-focus" | "balanced-separation" | "creamy-bokeh" | "razor-shallow";

export interface PinholeOpticsInput {
  readonly focalLengthMm: number;
  readonly apertureFStop: number;
  readonly focusDistanceM: number;
  readonly backgroundDistanceM?: number;
  readonly referenceFrameWidthPx?: number;
  readonly sensorWidthMm?: number;
  readonly sensorHeightMm?: number;
  readonly cocLimitMm?: number;
}

export interface PinholeOpticsResult {
  readonly focalLengthMm: number;
  readonly apertureFStop: number;
  readonly focusDistanceM: number;
  readonly backgroundDistanceM: number;
  readonly horizontalFovDeg: number;
  readonly verticalFovDeg: number;
  readonly diagonalFovDeg: number;
  readonly perspectiveDistortionPercent: number;
  readonly telephotoCompressionFactor: number;
  readonly foreshorteningRatioPercent: number;
  readonly distortionClass: PerspectiveDistortionClass;
  readonly hyperfocalDistanceM: number;
  readonly nearFocusLimitM: number;
  readonly farFocusLimitM: number | null;
  readonly totalDepthOfFieldM: number | null;
  readonly isHyperfocal: boolean;
  readonly backgroundCocMm: number;
  readonly infinityCocMm: number;
  readonly cocBlurPercentOfWidth: number;
  readonly estimatedBlurRadiusPx: number;
  readonly bokehGrade: BokehSeparationGrade;
}

export interface Vec2XZ { readonly x: number; readonly z: number }
export interface Vec3 { readonly x: number; readonly y: number; readonly z: number }
export interface CameraPose3D { readonly position: Vec3; readonly lookAt: Vec3; readonly rollDeg?: number }

export interface ProjectedPoint2D {
  readonly u: number;
  readonly v: number;
  readonly ndcX: number;
  readonly ndcY: number;
  readonly depthM: number;
  readonly inFront: boolean;
  readonly insideFrame: boolean;
}

export interface StageActor {
  readonly id: string;
  readonly nameKo: string;
  readonly nameEn: string;
  readonly position: Vec2XZ;
}

export interface CameraShotSpec {
  readonly shotId: string;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly cameraPosition: Vec2XZ;
  readonly focalLengthMm: CinemaFocalLengthMm;
  readonly apertureFStop?: number;
  readonly targetActorId?: string;
  readonly isNeutralBridgeCut?: boolean;
}

export type AxisHemisphereSide = "positive" | "negative" | "on-axis";
export type ScreenActorOrder = "A-left-B-right" | "B-left-A-right" | "aligned";

export interface Shot180AuditItem {
  readonly shotId: string;
  readonly shotIndex: number;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly cameraPosition: Vec2XZ;
  readonly focalLengthMm: CinemaFocalLengthMm;
  readonly crossProduct: number;
  readonly signedDistanceM: number;
  readonly side: AxisHemisphereSide;
  readonly screenOrder: ScreenActorOrder;
  readonly angleFromAxisMidpointDeg: number;
  readonly crossedAxis: boolean;
  readonly isNeutralBridgeCut: boolean;
  readonly jumpCutAdvisory: boolean;
  readonly suggestedSafePosition: Vec2XZ | null;
}

export interface AxisCrossingViolation {
  readonly fromShotId: string;
  readonly toShotId: string;
  readonly fromSide: AxisHemisphereSide;
  readonly toSide: AxisHemisphereSide;
  readonly prevCrossProduct: number;
  readonly currCrossProduct: number;
  readonly originalCameraPosition: Vec2XZ;
  readonly suggestedSafePosition: Vec2XZ;
  readonly screenFlipSummaryKo: string;
  readonly screenFlipSummaryEn: string;
}

export interface Rule180AuditInput {
  readonly actorA: StageActor;
  readonly actorB: StageActor;
  readonly shots: readonly CameraShotSpec[];
  readonly onAxisToleranceM?: number;
  readonly preferredSide?: Exclude<AxisHemisphereSide, "on-axis">;
}

export interface Rule180AuditReport {
  readonly scope: "calculation-example";
  readonly sceneApplied: false;
  readonly shotsSignature: string;
  readonly actorA: StageActor;
  readonly actorB: StageActor;
  readonly axisLengthM: number;
  readonly axisAngleDeg: number;
  readonly establishedSide: AxisHemisphereSide;
  readonly shotAudits: readonly Shot180AuditItem[];
  readonly violations: readonly AxisCrossingViolation[];
  readonly jumpCutCount: number;
  readonly compliant: boolean;
  readonly continuityScore: number;
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface NormalizedPoint { readonly x: number; readonly y: number }
export type GazeDirection = "left" | "right" | "center";
export type ShotScaleId = "extreme-closeup" | "closeup" | "medium" | "wide";
export type GoldenSpiralCorner = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type HeadroomStatus = "optimal" | "too-tight" | "too-loose";
export type LookroomStatus = "optimal" | "short-sided" | "excessive-lead";
export type CompositionGrade = "masterpiece" | "balanced" | "needs-reframe" | "poor";

export interface CompositionFrameInput {
  readonly subjectFocalPoint: NormalizedPoint;
  readonly headTopY: number;
  readonly gazeDirection: GazeDirection;
  readonly shotScale?: ShotScaleId;
  readonly goldenSpiralCorner?: GoldenSpiralCorner | "auto";
}

export interface CompositionHarmonyResult {
  readonly overallScore: number;
  readonly grade: CompositionGrade;
  readonly ruleOfThirdsScore: number;
  readonly goldenSpiralScore: number;
  readonly headroomScore: number;
  readonly lookroomScore: number;
  readonly nearestThirdPoint: NormalizedPoint;
  readonly distanceToThirdPoint: number;
  readonly resolvedSpiralCorner: GoldenSpiralCorner;
  readonly goldenSpiralPole: NormalizedPoint;
  readonly distanceToSpiralPole: number;
  readonly headroomStatus: HeadroomStatus;
  readonly idealHeadroomRange: readonly [number, number];
  readonly leadRoomRatio: number;
  readonly lookroomStatus: LookroomStatus;
  readonly suggestedFocalPoint: NormalizedPoint;
  readonly suggestedHeadTopY: number;
  readonly recommendationsKo: readonly string[];
  readonly recommendationsEn: readonly string[];
}

export interface DemoCinematographyScene {
  readonly sceneId: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly descriptionKo: string;
  readonly descriptionEn: string;
  readonly actorA: StageActor;
  readonly actorB: StageActor;
  readonly shots: readonly CameraShotSpec[];
  readonly defaultApertureFStop: number;
  readonly defaultFocusDistanceM: number;
  readonly defaultBackgroundDistanceM: number;
  readonly defaultComposition: CompositionFrameInput;
}

const RAD_TO_DEG = 180 / Math.PI;
const DEG_TO_RAD = Math.PI / 180;
const EPSILON = 1e-6;

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

/** 얇은 렌즈 근사 기반 착란원(Circle of Confusion) 지름(mm) 계산. */
export function computeCocDiameterMm(
  focalLengthMm: number,
  apertureFStop: number,
  focusDistanceM: number,
  planeDistanceM: number,
): number {
  requirePositive([focalLengthMm, apertureFStop, focusDistanceM]);
  if (planeDistanceM !== Number.POSITIVE_INFINITY) requirePositive([planeDistanceM]);
  const f = Math.max(1, focalLengthMm);
  const n = Math.max(0.7, apertureFStop);
  const sMm = Math.max(f + 10, focusDistanceM * 1000);
  const denom = n * (sMm - f);
  if (!Number.isFinite(planeDistanceM) || planeDistanceM <= 0) return (f * f) / denom;
  const s2Mm = Math.max(f + 10, planeDistanceM * 1000);
  return ((f * f) / denom) * (Math.abs(s2Mm - sMm) / s2Mm);
}

/** 35mm 풀프레임 기준 핀홀 투영 화각·원근 왜곡·피사계 심도·CoC 블러 통합 계산. */
export function computePinholeOptics(input: PinholeOpticsInput): PinholeOpticsResult {
  for (const value of Object.values(input)) if (value !== undefined) requirePositive([value]);
  const focalLengthMm = clamp(input.focalLengthMm, 12, 400);
  const apertureFStop = clamp(input.apertureFStop, 1.0, 22);
  const focusDistanceM = clamp(input.focusDistanceM, 0.35, 100);
  const backgroundDistanceM = clamp(input.backgroundDistanceM ?? focusDistanceM * 3, 0.4, 200);
  const sensorWidthMm = clamp(input.sensorWidthMm ?? FULL_FRAME_SENSOR_MM.widthMm, 8, 70);
  const sensorHeightMm = clamp(input.sensorHeightMm ?? FULL_FRAME_SENSOR_MM.heightMm, 6, 56);
  const sensorDiagMm = Math.hypot(sensorWidthMm, sensorHeightMm);
  const cocLimitMm = clamp(input.cocLimitMm ?? FULL_FRAME_SENSOR_MM.cocLimitMm, 0.005, 0.1);
  const referenceFrameWidthPx = clamp(input.referenceFrameWidthPx ?? 1080, 320, 4096);

  const hFovRad = 2 * Math.atan(sensorWidthMm / (2 * focalLengthMm));
  const vFovRad = 2 * Math.atan(sensorHeightMm / (2 * focalLengthMm));
  const dFovRad = 2 * Math.atan(sensorDiagMm / (2 * focalLengthMm));

  const halfDiagCos = Math.max(0.1, Math.cos(dFovRad / 2));
  const perspectiveDistortionPercent = (1 / halfDiagCos - 1) * 100;
  const telephotoCompressionFactor = focalLengthMm / 50;

  const eqDistM = Math.max(0.32, 2.0 * (focalLengthMm / 50));
  const foreshorteningRatioPercent = ((eqDistM + 0.2) / Math.max(0.12, eqDistM - 0.2) - 1) * 100;
  const distortionClass: PerspectiveDistortionClass =
    focalLengthMm <= 28 ? "wide-exaggerated" : focalLengthMm >= 80 ? "telephoto-compressed" : "natural-narrative";

  const sMm = Math.max(focalLengthMm + 10, focusDistanceM * 1000);
  const hyperfocalMm = (focalLengthMm * focalLengthMm) / (apertureFStop * cocLimitMm) + focalLengthMm;
  const nearMm = (sMm * (hyperfocalMm - focalLengthMm)) / (hyperfocalMm + sMm - 2 * focalLengthMm);
  const isHyperfocal = sMm >= hyperfocalMm - focalLengthMm;
  const farMm = isHyperfocal ? null : (sMm * (hyperfocalMm - focalLengthMm)) / Math.max(1, hyperfocalMm - sMm);

  const nearFocusLimitM = Math.max(0.05, nearMm / 1000);
  const farFocusLimitM = farMm === null ? null : farMm / 1000;
  const totalDepthOfFieldM = farFocusLimitM === null ? null : Math.max(0, farFocusLimitM - nearFocusLimitM);

  const backgroundCocMm = computeCocDiameterMm(focalLengthMm, apertureFStop, focusDistanceM, backgroundDistanceM);
  const infinityCocMm = computeCocDiameterMm(focalLengthMm, apertureFStop, focusDistanceM, Number.POSITIVE_INFINITY);
  const cocBlurPercentOfWidth = (backgroundCocMm / sensorWidthMm) * 100;
  const estimatedBlurRadiusPx = (backgroundCocMm / sensorWidthMm) * referenceFrameWidthPx * 0.5;
  const bokehGrade: BokehSeparationGrade =
    backgroundCocMm <= cocLimitMm
      ? "deep-focus"
      : backgroundCocMm <= 0.14
        ? "balanced-separation"
        : backgroundCocMm <= 0.45
          ? "creamy-bokeh"
          : "razor-shallow";

  return {
    focalLengthMm: roundTo(focalLengthMm, 1),
    apertureFStop: roundTo(apertureFStop, 1),
    focusDistanceM: roundTo(focusDistanceM, 2),
    backgroundDistanceM: roundTo(backgroundDistanceM, 2),
    horizontalFovDeg: roundTo(hFovRad * RAD_TO_DEG, 2),
    verticalFovDeg: roundTo(vFovRad * RAD_TO_DEG, 2),
    diagonalFovDeg: roundTo(dFovRad * RAD_TO_DEG, 2),
    perspectiveDistortionPercent: roundTo(perspectiveDistortionPercent, 2),
    telephotoCompressionFactor: roundTo(telephotoCompressionFactor, 2),
    foreshorteningRatioPercent: roundTo(foreshorteningRatioPercent, 2),
    distortionClass,
    hyperfocalDistanceM: roundTo(hyperfocalMm / 1000, 2),
    nearFocusLimitM: roundTo(nearFocusLimitM, 2),
    farFocusLimitM: farFocusLimitM === null ? null : roundTo(farFocusLimitM, 2),
    totalDepthOfFieldM: totalDepthOfFieldM === null ? null : roundTo(totalDepthOfFieldM, 2),
    isHyperfocal,
    backgroundCocMm: roundTo(backgroundCocMm, 4),
    infinityCocMm: roundTo(infinityCocMm, 4),
    cocBlurPercentOfWidth: roundTo(cocBlurPercentOfWidth, 3),
    estimatedBlurRadiusPx: roundTo(estimatedBlurRadiusPx, 2),
    bokehGrade,
  };
}

function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.hypot(v.x, v.y, v.z);
  return len <= EPSILON ? { x: 0, y: 0, z: 1 } : { x: v.x / len, y: v.y / len, z: v.z / len };
}

function crossVec3(a: Vec3, b: Vec3): Vec3 {
  return { x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x };
}

function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** 3D 월드 좌표를 35mm 핀홀 카메라 정규화 프레임 좌표([0,1]×[0,1])로 투영한다. */
export function projectWorldPointToFrame(
  worldPoint: Vec3,
  camera: CameraPose3D,
  focalLengthMm: number,
  sensorWidthMm: number = FULL_FRAME_SENSOR_MM.widthMm,
  sensorHeightMm: number = FULL_FRAME_SENSOR_MM.heightMm,
): ProjectedPoint2D {
  requireFinite([worldPoint.x, worldPoint.y, worldPoint.z, camera.position.x, camera.position.y, camera.position.z, camera.lookAt.x, camera.lookAt.y, camera.lookAt.z, camera.rollDeg ?? 0]);
  requirePositive([focalLengthMm, sensorWidthMm, sensorHeightMm]);
  if (Math.hypot(camera.lookAt.x - camera.position.x, camera.lookAt.y - camera.position.y, camera.lookAt.z - camera.position.z) <= EPSILON) throw new RangeError("카메라 위치와 목표는 달라야 합니다.");
  const forward = normalizeVec3({
    x: camera.lookAt.x - camera.position.x,
    y: camera.lookAt.y - camera.position.y,
    z: camera.lookAt.z - camera.position.z,
  });
  const worldUp: Vec3 = Math.abs(forward.y) > 0.99 ? { x: 0, y: 0, z: 1 } : { x: 0, y: 1, z: 0 };
  const baseRight = normalizeVec3(crossVec3(forward, worldUp));
  const baseUp = normalizeVec3(crossVec3(baseRight, forward));

  const rollRad = (camera.rollDeg ?? 0) * DEG_TO_RAD;
  const cosR = Math.cos(rollRad);
  const sinR = Math.sin(rollRad);
  const right: Vec3 = {
    x: baseRight.x * cosR + baseUp.x * sinR,
    y: baseRight.y * cosR + baseUp.y * sinR,
    z: baseRight.z * cosR + baseUp.z * sinR,
  };
  const up: Vec3 = {
    x: baseUp.x * cosR - baseRight.x * sinR,
    y: baseUp.y * cosR - baseRight.y * sinR,
    z: baseUp.z * cosR - baseRight.z * sinR,
  };

  const rel: Vec3 = {
    x: worldPoint.x - camera.position.x,
    y: worldPoint.y - camera.position.y,
    z: worldPoint.z - camera.position.z,
  };
  const camX = dotVec3(rel, right);
  const camY = dotVec3(rel, up);
  const camZ = dotVec3(rel, forward);
  requireFinite([camX, camY, camZ]);
  const inFront = camZ > 0.05;
  const safeZ = Math.max(0.05, Math.abs(camZ));

  const ndcX = (camX * focalLengthMm) / (safeZ * (sensorWidthMm / 2));
  const ndcY = (camY * focalLengthMm) / (safeZ * (sensorHeightMm / 2));
  const u = 0.5 + ndcX * 0.5;
  const v = 0.5 - ndcY * 0.5;

  requireFinite([u, v, ndcX, ndcY]);
  return {
    u: roundTo(u, 4), v: roundTo(v, 4), ndcX: roundTo(ndcX, 4), ndcY: roundTo(ndcY, 4),
    depthM: roundTo(camZ, 3), inFront, insideFrame: inFront && u >= 0 && u <= 1 && v >= 0 && v <= 1,
  };
}

export function reflectCameraAcrossAxis(actorA: Vec2XZ, actorB: Vec2XZ, cameraPos: Vec2XZ, minClearanceM: number = 1.2): Vec2XZ {
  requireFinite([actorA.x, actorA.z, actorB.x, actorB.z, cameraPos.x, cameraPos.z]);
  requirePositive([minClearanceM]);
  const lx = actorB.x - actorA.x;
  const lz = actorB.z - actorA.z;
  const lenSq = lx * lx + lz * lz;
  if (!Number.isFinite(lenSq) || lenSq <= EPSILON * EPSILON) throw new RangeError("반사 축은 서로 다른 유한한 두 위치가 필요합니다.");

  const t = ((cameraPos.x - actorA.x) * lx + (cameraPos.z - actorA.z) * lz) / lenSq;
  const projX = actorA.x + t * lx;
  const projZ = actorA.z + t * lz;
  let rx = 2 * projX - cameraPos.x;
  let rz = 2 * projZ - cameraPos.z;

  const perpLen = Math.hypot(rx - projX, rz - projZ);
  if (perpLen > EPSILON && perpLen < minClearanceM) {
    const scale = minClearanceM / perpLen;
    rx = projX + (rx - projX) * scale;
    rz = projZ + (rz - projZ) * scale;
  }
  return { x: roundTo(rx, 2), z: roundTo(rz, 2) };
}

/** 연속 컷 180도 법칙(Line-of-Action) 축 넘침 감지기 — 외적 부호 반전 검출 및 거울 반사 대안 좌표 제안. */
export function audit180DegreeRule(input: Rule180AuditInput): Rule180AuditReport {
  assertRule180Input(input);
  const { actorA, actorB, shots } = input;
  const aPos = actorA.position;
  const bPos = actorB.position;
  const toleranceM = clamp(input.onAxisToleranceM ?? 0.18, 0.02, 1.0);

  const lx = bPos.x - aPos.x;
  const lz = bPos.z - aPos.z;
  const axisLengthM = Math.max(EPSILON, Math.hypot(lx, lz));
  const axisAngleDeg = roundTo(Math.atan2(lz, lx) * RAD_TO_DEG, 1);
  const midX = (aPos.x + bPos.x) * 0.5;
  const midZ = (aPos.z + bPos.z) * 0.5;

  const rawSideOf = (signedDist: number): AxisHemisphereSide =>
    Math.abs(signedDist) <= toleranceM ? "on-axis" : signedDist > 0 ? "positive" : "negative";

  let establishedSide: AxisHemisphereSide = input.preferredSide ?? "on-axis";
  if (establishedSide === "on-axis") {
    for (const shot of shots) {
      const cross = lx * (shot.cameraPosition.z - aPos.z) - lz * (shot.cameraPosition.x - aPos.x);
      const side = rawSideOf(cross / axisLengthM);
      if (side !== "on-axis") {
        establishedSide = side;
        break;
      }
    }
  }

  const shotAudits: Shot180AuditItem[] = [];
  const violations: AxisCrossingViolation[] = [];
  let activeSide: AxisHemisphereSide = establishedSide;
  let lastNonAxisShot: Shot180AuditItem | null = null;
  let pendingBridgeReset = false;
  let jumpCutCount = 0;

  for (let i = 0; i < shots.length; i += 1) {
    const shot = shots[i];
    if (!shot) continue;

    const cross = lx * (shot.cameraPosition.z - aPos.z) - lz * (shot.cameraPosition.x - aPos.x);
    const signedDist = cross / axisLengthM;
    const side = rawSideOf(signedDist);
    const angleDeg = Math.atan2(shot.cameraPosition.z - midZ, shot.cameraPosition.x - midX) * RAD_TO_DEG;
    const screenOrder: ScreenActorOrder =
      side === "on-axis" ? "aligned" : side === "positive" ? "A-left-B-right" : "B-left-A-right";

    const isNeutralBridge = Boolean(shot.isNeutralBridgeCut) && side === "on-axis";
    let crossedAxis = false;
    let suggestedSafePosition: Vec2XZ | null = null;

    if (isNeutralBridge) {
      pendingBridgeReset = true;
    } else if (side !== "on-axis") {
      if (pendingBridgeReset) {
        activeSide = side;
        pendingBridgeReset = false;
      } else if (activeSide !== "on-axis" && side !== activeSide) {
        crossedAxis = true;
        suggestedSafePosition = reflectCameraAcrossAxis(aPos, bPos, shot.cameraPosition);
        const prevRef = lastNonAxisShot;
        violations.push({
          fromShotId: prevRef?.shotId ?? shot.shotId,
          toShotId: shot.shotId,
          fromSide: activeSide,
          toSide: side,
          prevCrossProduct: prevRef?.crossProduct ?? 0,
          currCrossProduct: roundTo(cross, 3),
          originalCameraPosition: shot.cameraPosition,
          suggestedSafePosition,
          screenFlipSummaryKo: `${actorA.nameKo}·${actorB.nameKo} 화면 좌우 위치가 반전됩니다 (${prevRef?.screenOrder ?? "기준"} → ${screenOrder}).`,
          screenFlipSummaryEn: `Screen order of ${actorA.nameEn} & ${actorB.nameEn} flips (${prevRef?.screenOrder ?? "base"} → ${screenOrder}).`,
        });
      }
    }

    let jumpCutAdvisory = false;
    const prevShot = shotAudits[shotAudits.length - 1];
    if (prevShot && !crossedAxis && side !== "on-axis" && prevShot.side === side) {
      let deltaAngle = Math.abs(angleDeg - prevShot.angleFromAxisMidpointDeg);
      if (deltaAngle > 180) deltaAngle = 360 - deltaAngle;
      if (deltaAngle < 28 && Math.abs(shot.focalLengthMm - prevShot.focalLengthMm) <= 15) {
        jumpCutAdvisory = true;
        jumpCutCount += 1;
      }
    }

    const item: Shot180AuditItem = {
      shotId: shot.shotId, shotIndex: i, labelKo: shot.labelKo, labelEn: shot.labelEn,
      cameraPosition: shot.cameraPosition, focalLengthMm: shot.focalLengthMm,
      crossProduct: roundTo(cross, 3), signedDistanceM: roundTo(signedDist, 2),
      side, screenOrder, angleFromAxisMidpointDeg: roundTo(angleDeg, 1),
      crossedAxis, isNeutralBridgeCut: isNeutralBridge, jumpCutAdvisory, suggestedSafePosition,
    };
    shotAudits.push(item);
    if (side !== "on-axis" && !crossedAxis) lastNonAxisShot = item;
  }

  const compliant = violations.length === 0;
  const continuityScore = clamp(Math.round(100 - violations.length * 36 - jumpCutCount * 8), 0, 100);
  const summaryKo = compliant
    ? jumpCutCount > 0
      ? `180도 시선 축은 유지되었으나 유사 화각 연속 컷 ${jumpCutCount}건(30도 법칙 주의)이 있습니다.`
      : `총 ${shots.length}개 연속 컷이 180도 시선 축을 완벽히 준수합니다.`
    : `180도 시선 축 넘침 ${violations.length}건 감지 — 외적 부호가 반전된 컷을 제안 좌표로 반사 보정하세요.`;
  const summaryEn = compliant
    ? jumpCutCount > 0
      ? `180° axis preserved across ${shots.length} shots with ${jumpCutCount} 30°-rule jump-cut advisory.`
      : `All ${shots.length} consecutive shots preserve the 180° Line-of-Action cleanly.`
    : `${violations.length} axis-crossing violation(s) detected — mirror offending camera back across the axis.`;

  return {
    scope: "calculation-example", sceneApplied: false, shotsSignature: shotSignature(shots),
    actorA, actorB, axisLengthM: roundTo(axisLengthM, 2), axisAngleDeg, establishedSide,
    shotAudits, violations, jumpCutCount, compliant, continuityScore, summaryKo, summaryEn,
  };
}

/** 180도 위반 컷을 제안된 거울 반사 안전 좌표로 일괄 치환한 새 컷 배열을 반환한다. */
export function applySafe180CameraFixes(
  shots: readonly CameraShotSpec[],
  report: Rule180AuditReport,
): readonly CameraShotSpec[] {
  assertShots(shots);
  if (shotSignature(shots) !== report.shotsSignature) throw new RangeError("샷이 변경되었습니다. 진단을 다시 계산하세요.");
  const fixByShotId = new Map<string, Vec2XZ>();
  for (const item of report.shotAudits) {
    if (item.crossedAxis && item.suggestedSafePosition) fixByShotId.set(item.shotId, item.suggestedSafePosition);
  }
  const fixed = shots.map((shot) => {
    const safePos = fixByShotId.get(shot.shotId);
    return safePos ? { ...shot, cameraPosition: { ...safePos } } : shot;
  });
  assertShots(fixed);
  return fixed;
}

const RULE_OF_THIRDS_POINTS: readonly NormalizedPoint[] = [
  { x: 1 / 3, y: 1 / 3 }, { x: 2 / 3, y: 1 / 3 }, { x: 1 / 3, y: 2 / 3 }, { x: 2 / 3, y: 2 / 3 },
];

const GOLDEN_SPIRAL_POLES: Readonly<Record<GoldenSpiralCorner, NormalizedPoint>> = {
  "top-right": { x: GOLDEN_SPIRAL_POLE_MAJOR, y: GOLDEN_SPIRAL_POLE_MINOR },
  "top-left": { x: GOLDEN_SPIRAL_POLE_MINOR, y: GOLDEN_SPIRAL_POLE_MINOR },
  "bottom-right": { x: GOLDEN_SPIRAL_POLE_MAJOR, y: GOLDEN_SPIRAL_POLE_MAJOR },
  "bottom-left": { x: GOLDEN_SPIRAL_POLE_MINOR, y: GOLDEN_SPIRAL_POLE_MAJOR },
};

const HEADROOM_IDEAL_BY_SCALE: Readonly<Record<ShotScaleId, readonly [number, number]>> = {
  "extreme-closeup": [0.0, 0.08], closeup: [0.06, 0.16], medium: [0.08, 0.19], wide: [0.14, 0.28],
};

/** 황금나선(Logarithmic Golden Spiral) SVG 오버레이 폴리라인 점열 생성. */
export function generateGoldenSpiralPathPoints(
  corner: GoldenSpiralCorner,
  width: number,
  height: number,
  steps: number = 64,
): readonly NormalizedPoint[] {
  requirePositive([width, height, steps]);
  requireChoice(corner, ["top-left", "top-right", "bottom-left", "bottom-right"]);
  const safeSteps = clamp(Math.round(steps), 16, 180);
  const pole = GOLDEN_SPIRAL_POLES[corner];
  const b = (2 * Math.log(GOLDEN_RATIO)) / Math.PI;
  const maxTheta = 2.65 * Math.PI;
  const r0 = Math.hypot(0.72, 0.72) / Math.exp(b * maxTheta);
  const flipX = corner === "top-left" || corner === "bottom-left" ? -1 : 1;
  const flipY = corner === "bottom-left" || corner === "bottom-right" ? -1 : 1;

  const pts: NormalizedPoint[] = [];
  for (let i = 0; i <= safeSteps; i += 1) {
    const theta = (i / safeSteps) * maxTheta;
    const r = r0 * Math.exp(b * theta);
    pts.push({
      x: roundTo(clamp(pole.x - flipX * r * Math.cos(theta) * 0.92, 0.01, 0.99) * width, 2),
      y: roundTo(clamp(pole.y + flipY * r * Math.sin(theta) * 0.92, 0.01, 0.99) * height, 2),
    });
  }
  return pts;
}

/** 삼분할 · 황금나선 · 헤드룸 · 시선 여백(Lookroom) 구도 조화 점수(0~100) 산출기. */
export function evaluateCompositionHarmony(input: CompositionFrameInput): CompositionHarmonyResult {
  assertComposition(input);
  const fx = clamp(input.subjectFocalPoint.x, 0, 1);
  const fy = clamp(input.subjectFocalPoint.y, 0, 1);
  const headTopY = clamp(input.headTopY, 0, 0.85);
  const shotScale: ShotScaleId = input.shotScale ?? "medium";

  let nearestThird: NormalizedPoint = RULE_OF_THIRDS_POINTS[0] ?? { x: 1 / 3, y: 1 / 3 };
  let minThirdDist = Number.POSITIVE_INFINITY;
  for (const pt of RULE_OF_THIRDS_POINTS) {
    const d = Math.hypot(fx - pt.x, fy - pt.y);
    if (d < minThirdDist) { minThirdDist = d; nearestThird = pt; }
  }
  const lineDist = (Math.min(Math.abs(fx - 1 / 3), Math.abs(fx - 2 / 3)) + Math.min(Math.abs(fy - 1 / 3), Math.abs(fy - 2 / 3))) * 0.5;
  const ruleOfThirdsScore = clamp(
    Math.round(100 * Math.exp(-(minThirdDist * minThirdDist) / (2 * 0.16 * 0.16)) * 0.72 + 100 * Math.exp(-lineDist / 0.16) * 0.28),
    0, 100,
  );

  const corners: readonly GoldenSpiralCorner[] = ["top-left", "top-right", "bottom-left", "bottom-right"];
  let resolvedCorner: GoldenSpiralCorner =
    input.goldenSpiralCorner && input.goldenSpiralCorner !== "auto" ? input.goldenSpiralCorner : "top-right";
  if (!input.goldenSpiralCorner || input.goldenSpiralCorner === "auto") {
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of corners) {
      const d = Math.hypot(fx - GOLDEN_SPIRAL_POLES[c].x, fy - GOLDEN_SPIRAL_POLES[c].y);
      if (d < bestD) { bestD = d; resolvedCorner = c; }
    }
  }
  const pole = GOLDEN_SPIRAL_POLES[resolvedCorner];
  const distToPole = Math.hypot(fx - pole.x, fy - pole.y);
  const phiDist = Math.min(
    Math.hypot(fx - GOLDEN_RECIPROCAL, fy - (1 - GOLDEN_RECIPROCAL)),
    Math.hypot(fx - (1 - GOLDEN_RECIPROCAL), fy - (1 - GOLDEN_RECIPROCAL)),
    Math.hypot(fx - GOLDEN_RECIPROCAL, fy - GOLDEN_RECIPROCAL),
    Math.hypot(fx - (1 - GOLDEN_RECIPROCAL), fy - GOLDEN_RECIPROCAL),
  );
  const effGoldenDist = Math.min(distToPole, phiDist * 1.05);
  const goldenSpiralScore = clamp(Math.round(100 * Math.exp(-(effGoldenDist * effGoldenDist) / (2 * 0.19 * 0.19))), 0, 100);

  const idealHeadroomRange = HEADROOM_IDEAL_BY_SCALE[shotScale];
  const [minHead, maxHead] = idealHeadroomRange;
  const idealHeadMid = (minHead + maxHead) * 0.5;
  let headroomStatus: HeadroomStatus;
  let headroomScore: number;
  if (headTopY < minHead) {
    headroomStatus = "too-tight";
    headroomScore = clamp(Math.round(100 - ((minHead - headTopY) / Math.max(0.04, minHead)) * 75), 10, 95);
  } else if (headTopY > maxHead) {
    headroomStatus = "too-loose";
    headroomScore = clamp(Math.round(100 - ((headTopY - maxHead) / 0.28) * 85), 8, 95);
  } else {
    headroomStatus = "optimal";
    const dev = Math.abs(headTopY - idealHeadMid) / Math.max(0.02, (maxHead - minHead) * 0.5);
    headroomScore = clamp(Math.round(100 - dev * 10), 90, 100);
  }

  let leadRoomRatio: number;
  let lookroomStatus: LookroomStatus;
  let lookroomScore: number;
  let suggestedX: number;
  if (input.gazeDirection === "right" || input.gazeDirection === "left") {
    leadRoomRatio = input.gazeDirection === "right" ? 1 - fx : fx;
    suggestedX = roundTo(input.gazeDirection === "right" ? 1 / 3 : 2 / 3, 3);
    if (leadRoomRatio < 0.48) {
      lookroomStatus = "short-sided";
      lookroomScore = clamp(Math.round(100 - ((0.48 - leadRoomRatio) / 0.38) * 90), 5, 92);
    } else if (leadRoomRatio > 0.78) {
      lookroomStatus = "excessive-lead";
      lookroomScore = clamp(Math.round(100 - ((leadRoomRatio - 0.78) / 0.2) * 55), 35, 94);
    } else {
      lookroomStatus = "optimal";
      lookroomScore = clamp(Math.round(100 - Math.abs(leadRoomRatio - 0.65) * 80), 86, 100);
    }
  } else {
    const centerDev = Math.abs(fx - 0.5);
    leadRoomRatio = 1 - centerDev * 2;
    lookroomStatus = centerDev > 0.24 ? "short-sided" : "optimal";
    lookroomScore = clamp(Math.round(100 - centerDev * 170), 15, 100);
    suggestedX = 0.5;
  }

  const overallScore = clamp(
    Math.round(ruleOfThirdsScore * 0.3 + goldenSpiralScore * 0.24 + headroomScore * 0.22 + lookroomScore * 0.24),
    0, 100,
  );
  const grade: CompositionGrade =
    overallScore >= 85 ? "masterpiece" : overallScore >= 70 ? "balanced" : overallScore >= 50 ? "needs-reframe" : "poor";

  const recommendationsKo: string[] = [];
  const recommendationsEn: string[] = [];
  if (lookroomStatus === "short-sided") {
    recommendationsKo.push(
      input.gazeDirection === "right"
        ? "오른쪽을 보는 인물이 우측 끝에 몰렸습니다. 인물 시선을 좌측 1/3 지점(x≈0.33)으로 옮겨 시선 여백을 확보하세요."
        : input.gazeDirection === "left"
          ? "왼쪽을 보는 인물이 좌측 끝에 몰렸습니다. 인물 시선을 우측 2/3 지점(x≈0.67)으로 배치하세요."
          : "정면 응시 구도의 좌우 대칭이 치우쳤습니다. 인물 중심을 화면 중앙(x≈0.50)으로 정렬하세요.",
    );
    recommendationsEn.push(
      input.gazeDirection === "right"
        ? "Right-looking subject is short-sided. Place eyes near x≈0.33 to open lead room."
        : input.gazeDirection === "left"
          ? "Left-looking subject is short-sided. Place eyes near x≈0.67 to open lead room."
          : "Direct front gaze is off-center. Align subject near x≈0.50.",
    );
  }
  if (headroomStatus === "too-tight") {
    recommendationsKo.push(`머리 위 여백(${Math.round(headTopY * 100)}%)이 좁습니다. 상단 여백을 ${Math.round(idealHeadMid * 100)}%로 확보하세요.`);
    recommendationsEn.push(`Headroom (${Math.round(headTopY * 100)}%) is cramped. Tilt up toward ~${Math.round(idealHeadMid * 100)}%.`);
  } else if (headroomStatus === "too-loose") {
    recommendationsKo.push(`머리 위 빈 공간(${Math.round(headTopY * 100)}%)이 과도합니다. 상단 여백을 ${Math.round(idealHeadMid * 100)}% 수준으로 줄이세요.`);
    recommendationsEn.push(`Headroom (${Math.round(headTopY * 100)}%) leaves excess dead space. Tilt down toward ~${Math.round(idealHeadMid * 100)}%.`);
  }
  if (ruleOfThirdsScore < 72 && goldenSpiralScore < 72) {
    recommendationsKo.push(`주 피사체 시선을 삼분할 교차점(${roundTo(nearestThird.x, 2)}, ${roundTo(nearestThird.y, 2)}) 근처로 정렬하세요.`);
    recommendationsEn.push(`Align subject eyes closer to Rule-of-Thirds (${roundTo(nearestThird.x, 2)}, ${roundTo(nearestThird.y, 2)}).`);
  }
  if (recommendationsKo.length === 0) {
    recommendationsKo.push("삼분할·황금나선·헤드룸·시선 여백 균형이 안정적입니다. 현재 예제 구도의 규칙 점수가 높습니다.");
    recommendationsEn.push("Rule-of-Thirds, Golden Spiral, headroom, and lookroom are well balanced.");
  }

  return {
    overallScore, grade, ruleOfThirdsScore, goldenSpiralScore, headroomScore, lookroomScore,
    nearestThirdPoint: { x: roundTo(nearestThird.x, 3), y: roundTo(nearestThird.y, 3) },
    distanceToThirdPoint: roundTo(minThirdDist, 3),
    resolvedSpiralCorner: resolvedCorner,
    goldenSpiralPole: { x: roundTo(pole.x, 3), y: roundTo(pole.y, 3) },
    distanceToSpiralPole: roundTo(distToPole, 3),
    headroomStatus, idealHeadroomRange, leadRoomRatio: roundTo(leadRoomRatio, 3), lookroomStatus,
    suggestedFocalPoint: { x: suggestedX, y: roundTo(1 / 3, 3) },
    suggestedHeadTopY: roundTo(idealHeadMid, 3),
    recommendationsKo, recommendationsEn,
  };
}

/** 3종 웹툰 시네마토그래피 검증 데모 씬. */
export { DEMO_CINEMATOGRAPHY_SCENES } from "./cinematography-demo-scenes";
