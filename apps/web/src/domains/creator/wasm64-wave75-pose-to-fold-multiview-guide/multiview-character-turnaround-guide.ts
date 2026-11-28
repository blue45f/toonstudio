/**
 * Wave 75: 멀티뷰 캐릭터 화풍 일관성 턴어라운드 가이드 엔진.
 *
 * 2~3컷(정면·반측면·측면) 캐릭터 설정 시트로부터 3D 타원체 두상·헤어 볼륨 및
 * 해부학적 좌/우 카이랄성(chirality) 랜드마크 모델을 구축하고,
 * 임의의 카메라 요(yaw)·피치(pitch)·롤(roll)·초점거리(24~135mm)로 원근 투영하여
 * Loomis 교차 윤곽선, 작가 Ink DNA 펜선 굵기 적응, 비례 이탈 감사를 제공한다.
 */

import type { Vec2, Vec3 } from "./pose-to-fold-garment-solver";

export type CanonicalReferenceViewKind = "front" | "three-quarter" | "side";
export type AnatomicalSide = "left" | "right" | "center";
export type SignatureLandmarkKind = "scar" | "mole" | "earring" | "tattoo" | "band-aid" | "accessory";

export interface CharacterReferenceView {
  readonly view: CanonicalReferenceViewKind;
  readonly eyeLineRatio?: number;
  readonly chinTaper?: number;
  readonly earTopRatio?: number;
  readonly earBottomRatio?: number;
  readonly jawAngleDeg?: number;
  readonly headWidthToHeight?: number;
  readonly headDepthToHeight?: number;
  readonly noseProtrusionRatio?: number;
  readonly hairCrownVolume?: number;
  readonly hairSilhouetteSpread?: number;
}

export interface CharacterSignatureLandmarkInput {
  readonly id: string;
  readonly labelKo: string;
  readonly kind: SignatureLandmarkKind;
  readonly anatomicalSide: AnatomicalSide;
  readonly verticalRatio: number;
  readonly lateralRatio: number;
  readonly protrusionRatio?: number;
}

export interface ArtistInkDnaProfile {
  readonly baseOuterContourWidthPx: number;
  readonly baseHairStrokeWidthPx: number;
  readonly baseInteriorDetailWidthPx: number;
  readonly silhouetteEmphasis: number;
  readonly depthAttenuation: number;
}

export interface CharacterSheetInput {
  readonly characterId: string;
  readonly characterName: string;
  readonly views: readonly CharacterReferenceView[];
  readonly signatureLandmarks?: readonly CharacterSignatureLandmarkInput[];
  readonly inkDna?: Partial<ArtistInkDnaProfile>;
}

export interface CanonicalProportions3d {
  readonly eyeLineRatio: number;
  readonly browLineRatio: number;
  readonly mouthLineRatio: number;
  readonly chinTaper: number;
  readonly earTopRatio: number;
  readonly earBottomRatio: number;
  readonly jawAngleDeg: number;
  readonly headWidthToHeight: number;
  readonly headDepthToHeight: number;
  readonly noseProtrusionRatio: number;
  readonly hairCrownVolume: number;
  readonly hairSilhouetteSpread: number;
  readonly headRadii: Vec3;
  readonly hairRadii: Vec3;
}

export interface CanonicalLandmark3d {
  readonly id: string;
  readonly labelKo: string;
  readonly category: "anatomy" | "signature";
  readonly kind?: SignatureLandmarkKind;
  readonly anatomicalSide: AnatomicalSide;
  readonly position3d: Vec3;
  readonly normal3d: Vec3;
}

export interface CharacterMultiviewModel {
  readonly characterId: string;
  readonly characterName: string;
  readonly sourceViews: readonly CanonicalReferenceViewKind[];
  readonly sheetConsistencyScore: number;
  readonly proportions: CanonicalProportions3d;
  readonly inkDna: ArtistInkDnaProfile;
  readonly landmarks3d: readonly CanonicalLandmark3d[];
}

export interface MultiviewCameraSpec {
  /** 카메라 요 각도(-180..+180°). 0=정면, 음수=캐릭터가 화면 오른쪽을 바라봄, 양수=화면 왼쪽을 바라봄 */
  readonly yawDeg: number;
  /** 카메라 피치 각도(-60..+60°). 양수=하이앵글(내려다봄), 음수=로우앵글(올려다봄) */
  readonly pitchDeg: number;
  readonly rollDeg?: number;
  readonly focalLengthMm?: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly headScreenHeightFraction?: number;
}

export interface ProjectedContourPoint {
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly occluded: boolean;
}

export interface ProjectedGuideContour {
  readonly id: string;
  readonly labelKo: string;
  readonly role: "head-cage" | "hair-volume";
  readonly closed: boolean;
  readonly points: readonly ProjectedContourPoint[];
  readonly adaptedStrokeWidthPx: number;
}

export interface ProjectedLandmark2d {
  readonly id: string;
  readonly labelKo: string;
  readonly category: "anatomy" | "signature";
  readonly kind?: SignatureLandmarkKind;
  readonly anatomicalSide: AnatomicalSide;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
  readonly facingCos: number;
  readonly occluded: boolean;
  readonly perspectiveScale: number;
  readonly adaptedStrokeWidthPx: number;
}

export interface MultiviewPerspectiveMetrics {
  readonly focalLengthMm: number;
  readonly cameraDistanceHeadUnits: number;
  readonly noseToBrowScaleRatio: number;
  readonly noseToEarScaleRatio: number;
  readonly foreshorteningIntensity: number;
}

export interface MultiviewTurnaroundGuide {
  readonly characterId: string;
  readonly characterName: string;
  readonly camera: {
    readonly yawDeg: number;
    readonly pitchDeg: number;
    readonly rollDeg: number;
    readonly focalLengthMm: number;
    readonly viewportWidth: number;
    readonly viewportHeight: number;
  };
  readonly headCenter2d: Vec2;
  readonly projectedHeadHeightPx: number;
  readonly projectedHeadWidthPx: number;
  readonly contours: {
    readonly centerline: ProjectedGuideContour;
    readonly eyeLine: ProjectedGuideContour;
    readonly browLine: ProjectedGuideContour;
    readonly jawLine: ProjectedGuideContour;
    readonly headSilhouette: ProjectedGuideContour;
    readonly hairVolumeSilhouette: ProjectedGuideContour;
  };
  readonly landmarks: readonly ProjectedLandmark2d[];
  readonly perspectiveMetrics: MultiviewPerspectiveMetrics;
  readonly inkStrokeHierarchyPx: {
    readonly outerContourPx: number;
    readonly hairVolumePx: number;
    readonly interiorDetailPx: number;
  };
}

export interface DrawnLandmarkObservation { readonly id: string; readonly x: number; readonly y: number; }
export type DriftSeverity = "ok" | "minor" | "major" | "critical";

export interface LandmarkDriftFinding {
  readonly landmarkId: string;
  readonly labelKo: string;
  readonly driftPercent: number;
  readonly verticalDriftPercent: number;
  readonly horizontalDriftPercent: number;
  readonly chiralityInverted: boolean;
  readonly drawnWhileOccluded: boolean;
  readonly severity: DriftSeverity;
  readonly guidanceKo: string;
}

export interface ProportionDriftAuditReport {
  readonly characterId: string;
  readonly auditedCount: number;
  readonly overallDriftPercent: number;
  readonly maxDriftPercent: number;
  readonly chiralityViolationCount: number;
  readonly occlusionViolationCount: number;
  readonly passed: boolean;
  readonly findings: readonly LandmarkDriftFinding[];
  readonly summaryKo: string;
}

const DEG_TO_RAD = Math.PI / 180;
const SENSOR_HEIGHT_MM = 24;
const OCCLUSION_FACING_THRESHOLD = 0.02;

const DEFAULT_INK_DNA: ArtistInkDnaProfile = {
  baseOuterContourWidthPx: 2.4,
  baseHairStrokeWidthPx: 1.65,
  baseInteriorDetailWidthPx: 1.05,
  silhouetteEmphasis: 1.32,
  depthAttenuation: 0.28,
};

const clamp = (v: number, lo: number, hi: number): number => (Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : lo);
const v3Sub = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const v3Add = (a: Vec3, b: Vec3): Vec3 => ({ x: a.x + b.x, y: a.y + b.y, z: a.z + b.z });
const v3Scale = (v: Vec3, s: number): Vec3 => ({ x: v.x * s, y: v.y * s, z: v.z * s });
const v3Dot = (a: Vec3, b: Vec3): number => a.x * b.x + a.y * b.y + a.z * b.z;
const v3Cross = (a: Vec3, b: Vec3): Vec3 => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});
const v3Norm = (v: Vec3, fb: Vec3 = { x: 0, y: 0, z: 1 }): Vec3 => {
  const len = Math.hypot(v.x, v.y, v.z);
  return len <= 1e-7 ? fb : { x: v.x / len, y: v.y / len, z: v.z / len };
};

function weightedAvg(entries: ReadonlyArray<readonly [number | undefined, number]>, fallback: number): number {
  let num = 0;
  let den = 0;
  for (let i = 0; i < entries.length; i += 1) {
    const [val, weight] = entries[i];
    if (typeof val === "number" && Number.isFinite(val) && weight > 0) {
      num += val * weight;
      den += weight;
    }
  }
  return den > 0 ? num / den : fallback;
}

function ellipsoidSurfacePoint(
  radii: Vec3, verticalRatio: number, azimuthRad: number, protrusion: number, chinTaper: number,
): { readonly position: Vec3; readonly normal: Vec3 } {
  const y = clamp(verticalRatio - 0.5, -0.495, 0.495);
  const yNorm = clamp(y / Math.max(0.1, radii.y), -0.99, 0.99);
  const ring = Math.sqrt(Math.max(0.01, 1 - yNorm * yNorm));
  const effRx = radii.x * (y < 0 ? 1 - Math.abs(y / 0.5) * chinTaper * 0.34 : 1);
  const effRz = radii.z * (y < -0.15 ? 0.92 : 1);
  const sx = effRx * ring * Math.sin(azimuthRad);
  const sz = effRz * ring * Math.cos(azimuthRad);
  const normal = v3Norm(
    { x: sx / Math.max(0.02, effRx * effRx), y: y / Math.max(0.02, radii.y * radii.y), z: sz / Math.max(0.02, effRz * effRz) },
    { x: Math.sin(azimuthRad), y: 0, z: Math.cos(azimuthRad) },
  );
  return { position: v3Add({ x: sx, y, z: sz }, v3Scale(normal, protrusion)), normal };
}

/** 2~3컷(정면·반측면·측면) 캐릭터 설정 시트로부터 3D 일관성 두상·랜드마크 모델을 구축한다. */
export function buildCharacterMultiviewModel(input: CharacterSheetInput): CharacterMultiviewModel {
  if (input.views.length < 2) {
    throw new Error("멀티뷰 일관성 모델을 구축하려면 최소 2개 이상의 기준 시트(정면·반측면·측면 중 택 2)가 필요합니다.");
  }

  const byKind = new Map<CanonicalReferenceViewKind, CharacterReferenceView>();
  for (let i = 0; i < input.views.length; i += 1) byKind.set(input.views[i].view, input.views[i]);
  const f = byKind.get("front");
  const tq = byKind.get("three-quarter");
  const s = byKind.get("side");

  const eyeLineRatio = clamp(weightedAvg([[f?.eyeLineRatio, 0.5], [tq?.eyeLineRatio, 0.25], [s?.eyeLineRatio, 0.25]], 0.5), 0.34, 0.66);
  const chinTaper = clamp(weightedAvg([[f?.chinTaper, 0.65], [tq?.chinTaper, 0.25], [s?.chinTaper, 0.1]], 0.55), 0.1, 0.92);
  const earTopRatio = clamp(weightedAvg([[s?.earTopRatio, 0.45], [f?.earTopRatio, 0.35], [tq?.earTopRatio, 0.2]], eyeLineRatio + 0.04), 0.42, 0.72);
  const earBottomRatio = clamp(weightedAvg([[s?.earBottomRatio, 0.45], [f?.earBottomRatio, 0.35], [tq?.earBottomRatio, 0.2]], eyeLineRatio - 0.16), 0.18, earTopRatio - 0.08);
  const jawAngleDeg = clamp(weightedAvg([[s?.jawAngleDeg, 0.55], [tq?.jawAngleDeg, 0.3], [f?.jawAngleDeg, 0.15]], 122), 95, 148);
  const headWidthToHeight = clamp(weightedAvg([[f?.headWidthToHeight, 0.7], [tq?.headWidthToHeight, 0.3]], 0.72), 0.54, 0.92);
  const headDepthToHeight = clamp(weightedAvg([[s?.headDepthToHeight, 0.7], [tq?.headDepthToHeight, 0.3]], 0.82), 0.64, 1.02);
  const noseProtrusionRatio = clamp(weightedAvg([[s?.noseProtrusionRatio, 0.7], [tq?.noseProtrusionRatio, 0.25], [f?.noseProtrusionRatio, 0.05]], 0.11), 0.04, 0.22);
  const hairCrownVolume = clamp(weightedAvg([[f?.hairCrownVolume, 0.4], [tq?.hairCrownVolume, 0.3], [s?.hairCrownVolume, 0.3]], 1.18), 1.02, 1.55);
  const hairSilhouetteSpread = clamp(weightedAvg([[f?.hairSilhouetteSpread, 0.5], [tq?.hairSilhouetteSpread, 0.3], [s?.hairSilhouetteSpread, 0.2]], 1.14), 1.02, 1.5);

  const eyeSamples = input.views.map((v) => v.eyeLineRatio).filter((v): v is number => typeof v === "number" && Number.isFinite(v));
  const eyeSpread = eyeSamples.length >= 2 ? Math.max(...eyeSamples) - Math.min(...eyeSamples) : 0;
  const sheetConsistencyScore = clamp(1 - eyeSpread * 3.5, 0.35, 1);

  const headRadii: Vec3 = { x: headWidthToHeight * 0.5, y: 0.5, z: headDepthToHeight * 0.5 };
  const hairRadii: Vec3 = {
    x: headRadii.x * hairSilhouetteSpread,
    y: headRadii.y * hairCrownVolume,
    z: headRadii.z * 0.5 * (hairCrownVolume + hairSilhouetteSpread),
  };

  const proportions: CanonicalProportions3d = {
    eyeLineRatio,
    browLineRatio: clamp(eyeLineRatio + 0.075, 0.44, 0.74),
    mouthLineRatio: clamp(eyeLineRatio - 0.25, 0.14, 0.36),
    chinTaper, earTopRatio, earBottomRatio, jawAngleDeg,
    headWidthToHeight, headDepthToHeight, noseProtrusionRatio,
    hairCrownVolume, hairSilhouetteSpread, headRadii, hairRadii,
  };

  const baseOuter = clamp(input.inkDna?.baseOuterContourWidthPx ?? DEFAULT_INK_DNA.baseOuterContourWidthPx, 1.2, 5.0);
  const baseHair = clamp(input.inkDna?.baseHairStrokeWidthPx ?? Math.min(baseOuter * 0.72, DEFAULT_INK_DNA.baseHairStrokeWidthPx), 0.8, baseOuter * 0.92);
  const baseInterior = clamp(input.inkDna?.baseInteriorDetailWidthPx ?? Math.min(baseHair * 0.68, DEFAULT_INK_DNA.baseInteriorDetailWidthPx), 0.45, baseHair * 0.88);
  const inkDna: ArtistInkDnaProfile = {
    baseOuterContourWidthPx: baseOuter,
    baseHairStrokeWidthPx: baseHair,
    baseInteriorDetailWidthPx: baseInterior,
    silhouetteEmphasis: clamp(input.inkDna?.silhouetteEmphasis ?? DEFAULT_INK_DNA.silhouetteEmphasis, 1.0, 2.0),
    depthAttenuation: clamp(input.inkDna?.depthAttenuation ?? DEFAULT_INK_DNA.depthAttenuation, 0.0, 0.6),
  };

  const landmarks3d: CanonicalLandmark3d[] = [];
  const addAnatomy = (id: string, labelKo: string, side: AnatomicalSide, vr: number, azDeg: number, prot = 0): void => {
    const pt = ellipsoidSurfacePoint(headRadii, vr, azDeg * DEG_TO_RAD, prot, chinTaper);
    landmarks3d.push({ id, labelKo, category: "anatomy", anatomicalSide: side, position3d: pt.position, normal3d: pt.normal });
  };

  addAnatomy("crown", "정수리", "center", 0.99, 0);
  addAnatomy("chin", "턱끝", "center", 0.015, 0, 0.01);
  addAnatomy("brow-center", "미간", "center", proportions.browLineRatio, 0, 0.018);
  addAnatomy("nose-bridge", "콧대", "center", eyeLineRatio - 0.02, 0, noseProtrusionRatio * 0.55);
  addAnatomy("nose-tip", "코끝", "center", eyeLineRatio - 0.145, 0, noseProtrusionRatio);
  addAnatomy("mouth-center", "입술 중앙", "center", proportions.mouthLineRatio, 0, 0.02);
  addAnatomy("left-eye", "왼쪽 눈", "left", eyeLineRatio, 20, 0.005);
  addAnatomy("right-eye", "오른쪽 눈", "right", eyeLineRatio, -20, 0.005);
  addAnatomy("left-ear-top", "왼쪽 귀 상단", "left", earTopRatio, 88, 0.025);
  addAnatomy("right-ear-top", "오른쪽 귀 상단", "right", earTopRatio, -88, 0.025);
  addAnatomy("left-ear-bottom", "왼쪽 귀 하단", "left", earBottomRatio, 88, 0.022);
  addAnatomy("right-ear-bottom", "오른쪽 귀 하단", "right", earBottomRatio, -88, 0.022);

  const jawHeightRatio = clamp(0.18 + (jawAngleDeg - 95) / 360, 0.16, 0.34);
  addAnatomy("left-jaw-corner", "왼쪽 턱각", "left", jawHeightRatio, 58, 0.005);
  addAnatomy("right-jaw-corner", "오른쪽 턱각", "right", jawHeightRatio, -58, 0.005);

  const sigs = input.signatureLandmarks ?? [];
  for (let i = 0; i < sigs.length; i += 1) {
    const sig = sigs[i];
    const sign = sig.anatomicalSide === "left" ? 1 : sig.anatomicalSide === "right" ? -1 : 0;
    const azRad = sign * Math.asin(clamp(sig.lateralRatio, 0, 0.985));
    const pt = ellipsoidSurfacePoint(headRadii, clamp(sig.verticalRatio, 0.04, 0.96), azRad, sig.protrusionRatio ?? (sig.kind === "earring" ? 0.032 : 0.008), chinTaper);
    landmarks3d.push({
      id: sig.id, labelKo: sig.labelKo, category: "signature", kind: sig.kind,
      anatomicalSide: sig.anatomicalSide, position3d: pt.position, normal3d: pt.normal,
    });
  }

  return {
    characterId: input.characterId,
    characterName: input.characterName,
    sourceViews: input.views.map((v) => v.view),
    sheetConsistencyScore,
    proportions,
    inkDna,
    landmarks3d,
  };
}

interface TurnaroundProjectionState {
  readonly cameraPos: Vec3;
  readonly cameraDistance: number;
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
  readonly focalPixels: number;
  readonly viewportWidth: number;
  readonly viewportHeight: number;
}

function buildTurnaroundProjection(camera: MultiviewCameraSpec): {
  readonly state: TurnaroundProjectionState;
  readonly yawDeg: number;
  readonly pitchDeg: number;
  readonly rollDeg: number;
  readonly focalLengthMm: number;
} {
  const yawDeg = clamp(camera.yawDeg, -180, 180);
  const pitchDeg = clamp(camera.pitchDeg, -60, 60);
  const rollDeg = clamp(camera.rollDeg ?? 0, -45, 45);
  const focalLengthMm = clamp(camera.focalLengthMm ?? 50, 24, 135);
  const viewportWidth = clamp(camera.viewportWidth, 120, 4096);
  const viewportHeight = clamp(camera.viewportHeight, 120, 4096);
  const headFraction = clamp(camera.headScreenHeightFraction ?? 0.56, 0.25, 0.85);

  const cameraDistance = Math.max(1.25, (focalLengthMm / SENSOR_HEIGHT_MM) / headFraction);
  const yaw = yawDeg * DEG_TO_RAD;
  const pitch = pitchDeg * DEG_TO_RAD;
  const roll = rollDeg * DEG_TO_RAD;

  const toCam: Vec3 = { x: Math.cos(pitch) * Math.sin(yaw), y: Math.sin(pitch), z: Math.cos(pitch) * Math.cos(yaw) };
  const cameraPos = v3Scale(toCam, cameraDistance);
  const forward = v3Scale(toCam, -1);
  const right0 = v3Norm(v3Cross(forward, { x: 0, y: 1, z: 0 }), { x: 1, y: 0, z: 0 });
  const up0 = v3Norm(v3Cross(right0, forward), { x: 0, y: 1, z: 0 });
  const cosR = Math.cos(roll);
  const sinR = Math.sin(roll);
  const right = v3Add(v3Scale(right0, cosR), v3Scale(up0, sinR));
  const up = v3Add(v3Scale(right0, -sinR), v3Scale(up0, cosR));

  return {
    state: {
      cameraPos, cameraDistance, forward, right, up, viewportWidth, viewportHeight,
      focalPixels: (focalLengthMm / SENSOR_HEIGHT_MM) * viewportHeight,
    },
    yawDeg, pitchDeg, rollDeg, focalLengthMm,
  };
}

function projectHeadPoint(point3d: Vec3, normal3d: Vec3, proj: TurnaroundProjectionState) {
  const rel = v3Sub(point3d, proj.cameraPos);
  const depth = Math.max(0.2, v3Dot(rel, proj.forward));
  const scale = proj.focalPixels / depth;
  const facingCos = v3Dot(normal3d, v3Norm(v3Sub(proj.cameraPos, point3d), { x: 0, y: 0, z: 1 }));
  return {
    x: proj.viewportWidth * 0.5 + v3Dot(rel, proj.right) * scale,
    y: proj.viewportHeight * 0.5 - v3Dot(rel, proj.up) * scale,
    depth,
    facingCos,
    occluded: facingCos <= OCCLUSION_FACING_THRESHOLD,
    perspectiveScale: proj.cameraDistance / depth,
  };
}

function adaptInkWidth(basePx: number, depthNorm: number, facingCos: number, inkDna: ArtistInkDnaProfile, isSilhouette: boolean): number {
  const depthFactor = clamp(1 + inkDna.depthAttenuation * clamp((1 - depthNorm) * 0.5, -0.6, 0.6), 0.78, 1.32);
  const silFactor = isSilhouette ? inkDna.silhouetteEmphasis : 1 + (inkDna.silhouetteEmphasis - 1) * (1 - clamp(Math.abs(facingCos), 0, 1)) * 0.35;
  return clamp(basePx * depthFactor * silFactor, 0.45, 7.5);
}

/** 3D 두상·헤어 모델을 임의의 요/피치/롤/초점거리로 투영하여 Loomis 턴어라운드 가이드를 생성한다. */
export function projectMultiviewTurnaroundGuide(
  model: CharacterMultiviewModel,
  camera: MultiviewCameraSpec,
): MultiviewTurnaroundGuide {
  const { state: proj, yawDeg, pitchDeg, rollDeg, focalLengthMm } = buildTurnaroundProjection(camera);
  const { proportions, inkDna } = model;
  const { headRadii, hairRadii } = proportions;

  const landmarks: ProjectedLandmark2d[] = model.landmarks3d.map((lm) => {
    const p = projectHeadPoint(lm.position3d, lm.normal3d, proj);
    const depthNorm = 1 + (p.depth - proj.cameraDistance) / Math.max(0.25, headRadii.z);
    return {
      id: lm.id, labelKo: lm.labelKo, category: lm.category, kind: lm.kind, anatomicalSide: lm.anatomicalSide,
      x: p.x, y: p.y, depth: p.depth, facingCos: p.facingCos, occluded: p.occluded, perspectiveScale: p.perspectiveScale,
      adaptedStrokeWidthPx: adaptInkWidth(inkDna.baseInteriorDetailWidthPx, depthNorm, p.facingCos, inkDna, false),
    };
  });

  const buildHorizRing = (id: string, labelKo: string, vr: number): ProjectedGuideContour => {
    const points: ProjectedContourPoint[] = [];
    for (let i = 0; i <= 24; i += 1) {
      const az = -Math.PI * 0.55 + (i / 24) * Math.PI * 1.1;
      const surf = ellipsoidSurfacePoint(headRadii, vr, az, 0.004, proportions.chinTaper);
      const p = projectHeadPoint(surf.position, surf.normal, proj);
      points.push({ x: p.x, y: p.y, depth: p.depth, occluded: p.occluded });
    }
    return { id, labelKo, role: "head-cage", closed: false, points, adaptedStrokeWidthPx: inkDna.baseInteriorDetailWidthPx };
  };

  const centerlinePoints: ProjectedContourPoint[] = [];
  for (let i = 0; i <= 18; i += 1) {
    const surf = ellipsoidSurfacePoint(headRadii, 0.02 + (i / 18) * 0.96, 0, 0.006, proportions.chinTaper);
    const p = projectHeadPoint(surf.position, surf.normal, proj);
    centerlinePoints.push({ x: p.x, y: p.y, depth: p.depth, occluded: p.occluded });
  }
  const centerline: ProjectedGuideContour = {
    id: "centerline", labelKo: "얼굴 정중선", role: "head-cage", closed: false,
    points: centerlinePoints, adaptedStrokeWidthPx: inkDna.baseInteriorDetailWidthPx * 0.95,
  };
  const eyeLine = buildHorizRing("eye-line", "눈높이 보조선", proportions.eyeLineRatio);
  const browLine = buildHorizRing("brow-line", "눈썹 보조선", proportions.browLineRatio);

  const jawAnglesDeg = [-88, -68, -46, -24, 0, 24, 46, 68, 88];
  const jawHeights = [proportions.earBottomRatio, 0.26, 0.16, 0.07, 0.015, 0.07, 0.16, 0.26, proportions.earBottomRatio];
  const jawLine: ProjectedGuideContour = {
    id: "jaw-line", labelKo: "턱선 가이드", role: "head-cage", closed: false,
    adaptedStrokeWidthPx: inkDna.baseOuterContourWidthPx * 0.88,
    points: jawAnglesDeg.map((deg, idx) => {
      const surf = ellipsoidSurfacePoint(headRadii, jawHeights[idx], deg * DEG_TO_RAD, 0.008, proportions.chinTaper);
      const p = projectHeadPoint(surf.position, surf.normal, proj);
      return { x: p.x, y: p.y, depth: p.depth, occluded: p.occluded };
    }),
  };

  const buildSilRing = (
    id: string, labelKo: string, role: "head-cage" | "hair-volume", radii: Vec3, yShift: number, widthPx: number,
  ): ProjectedGuideContour => {
    const points: ProjectedContourPoint[] = [];
    for (let i = 0; i < 32; i += 1) {
      const th = (i / 32) * Math.PI * 2;
      const dir = v3Add(v3Scale(proj.right, Math.cos(th)), v3Scale(proj.up, Math.sin(th)));
      const invLen = Math.sqrt((dir.x / radii.x) ** 2 + (dir.y / radii.y) ** 2 + (dir.z / radii.z) ** 2);
      const r = 1 / Math.max(0.1, invLen);
      const p = projectHeadPoint({ x: dir.x * r, y: dir.y * r + yShift, z: dir.z * r }, dir, proj);
      points.push({ x: p.x, y: p.y, depth: p.depth, occluded: false });
    }
    return { id, labelKo, role, closed: true, points, adaptedStrokeWidthPx: widthPx };
  };

  const outerContourPx = adaptInkWidth(inkDna.baseOuterContourWidthPx, 1, 0, inkDna, true);
  const hairVolumePx = clamp(adaptInkWidth(inkDna.baseHairStrokeWidthPx, 1, 0.35, inkDna, false), inkDna.baseInteriorDetailWidthPx * 1.12, outerContourPx * 0.92);
  const interiorDetailPx = clamp(inkDna.baseInteriorDetailWidthPx, 0.45, hairVolumePx * 0.88);
  const headSilhouette = buildSilRing("head-silhouette", "두상 외곽 실루엣", "head-cage", headRadii, 0, outerContourPx);
  const hairVolumeSilhouette = buildSilRing("hair-volume-silhouette", "헤어 볼륨 실루엣", "hair-volume", hairRadii, (proportions.hairCrownVolume - 1) * 0.16, hairVolumePx);

  const byId = new Map(landmarks.map((lm) => [lm.id, lm]));
  const noseScale = byId.get("nose-tip")?.perspectiveScale ?? 1;
  const browScale = byId.get("brow-center")?.perspectiveScale ?? 1;
  const earScale = byId.get("left-ear-top")?.perspectiveScale ?? 1;
  const noseToBrowScaleRatio = noseScale / Math.max(0.01, browScale);
  const noseToEarScaleRatio = noseScale / Math.max(0.01, earScale);
  const centerProj = projectHeadPoint({ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: 1 }, proj);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < headSilhouette.points.length; i += 1) {
    const pt = headSilhouette.points[i];
    if (pt.x < minX) minX = pt.x;
    if (pt.x > maxX) maxX = pt.x;
    if (pt.y < minY) minY = pt.y;
    if (pt.y > maxY) maxY = pt.y;
  }
  const crown = byId.get("crown");
  const chin = byId.get("chin");
  const projectedHeadHeightPx = Math.max(1, crown && chin ? Math.max(Math.abs(chin.y - crown.y), maxY - minY) : maxY - minY);

  return {
    characterId: model.characterId,
    characterName: model.characterName,
    camera: { yawDeg, pitchDeg, rollDeg, focalLengthMm, viewportWidth: proj.viewportWidth, viewportHeight: proj.viewportHeight },
    headCenter2d: { x: centerProj.x, y: centerProj.y },
    projectedHeadHeightPx,
    projectedHeadWidthPx: Math.max(1, maxX - minX),
    contours: { centerline, eyeLine, browLine, jawLine, headSilhouette, hairVolumeSilhouette },
    landmarks,
    perspectiveMetrics: {
      focalLengthMm,
      cameraDistanceHeadUnits: proj.cameraDistance,
      noseToBrowScaleRatio,
      noseToEarScaleRatio,
      foreshorteningIntensity: clamp((noseToEarScaleRatio - 1) * 4, 0, 1.5),
    },
    inkStrokeHierarchyPx: { outerContourPx, hairVolumePx, interiorDetailPx },
  };
}

function interpolateCenterlineX(guide: MultiviewTurnaroundGuide, y: number): number {
  const pts = guide.contours.centerline.points;
  if (pts.length === 0) return guide.headCenter2d.x;
  let best = pts[0];
  let bestDist = Math.abs(pts[0].y - y);
  for (let i = 1; i < pts.length; i += 1) {
    const d = Math.abs(pts[i].y - y);
    if (d < bestDist) {
      bestDist = d;
      best = pts[i];
    }
  }
  return best.x;
}

/**
 * 작가가 그린 랜드마크 좌표를 3D 턴어라운드 가이드와 대조해
 * 비례 이탈률(%)·좌우 반전·가림 위반을 감사하고 차분한 한국어 교정 가이드를 반환한다.
 */
export function auditDrawingAgainstMultiviewGuide(
  guide: MultiviewTurnaroundGuide,
  drawnLandmarks: readonly DrawnLandmarkObservation[],
  tolerancePercent = 4.0,
): ProportionDriftAuditReport {
  const byId = new Map(guide.landmarks.map((lm) => [lm.id, lm]));
  const headH = Math.max(1, guide.projectedHeadHeightPx);
  const findings: LandmarkDriftFinding[] = [];
  let driftSum = 0;
  let maxDriftPercent = 0;
  let chiralityViolationCount = 0;
  let occlusionViolationCount = 0;

  for (let i = 0; i < drawnLandmarks.length; i += 1) {
    const drawn = drawnLandmarks[i];
    const target = byId.get(drawn.id);
    if (!target) continue;

    const dx = drawn.x - target.x;
    const dy = drawn.y - target.y;
    const horizontalDriftPercent = (dx / headH) * 100;
    const verticalDriftPercent = (-dy / headH) * 100;
    const driftPercent = (Math.hypot(dx, dy) / headH) * 100;

    const centerX = interpolateCenterlineX(guide, target.y);
    const expectedSign = target.x - centerX;
    const drawnSign = drawn.x - centerX;
    const chiralityInverted =
      target.anatomicalSide !== "center" &&
      !target.occluded &&
      Math.abs(expectedSign) > headH * 0.025 &&
      Math.abs(drawnSign) > headH * 0.025 &&
      expectedSign * drawnSign < 0;

    const drawnWhileOccluded = target.occluded;
    if (chiralityInverted) chiralityViolationCount += 1;
    if (drawnWhileOccluded) occlusionViolationCount += 1;
    driftSum += driftPercent;
    if (driftPercent > maxDriftPercent) maxDriftPercent = driftPercent;

    const severity: DriftSeverity =
      chiralityInverted || drawnWhileOccluded || driftPercent >= tolerancePercent * 2.5
        ? "critical"
        : driftPercent >= tolerancePercent * 1.4
          ? "major"
          : driftPercent >= tolerancePercent
            ? "minor"
            : "ok";

    let guidanceKo: string;
    if (drawnWhileOccluded) {
      guidanceKo = `${target.labelKo} 위치는 현재 시야각(요 ${Math.round(guide.camera.yawDeg)}°)에서 두상 뒤로 가려집니다.`;
    } else if (chiralityInverted) {
      const sideKo = target.anatomicalSide === "left" ? "해부학적 왼쪽" : "해부학적 오른쪽";
      guidanceKo = `${target.labelKo} 위치가 ${sideKo} 기준에서 좌우 반전되어 반대쪽에 그려졌습니다.`;
    } else if (driftPercent < tolerancePercent) {
      guidanceKo = `${target.labelKo} 비례가 기준 시트와 일치합니다(오차 ${driftPercent.toFixed(1)}%).`;
    } else if (Math.abs(verticalDriftPercent) >= Math.abs(horizontalDriftPercent)) {
      guidanceKo = `${target.labelKo} 높이가 정면 설정보다 ${Math.abs(verticalDriftPercent).toFixed(1)}% ${verticalDriftPercent > 0 ? "높습니다" : "낮습니다"}.`;
    } else {
      guidanceKo = `${target.labelKo} 위치가 정면 설정보다 ${Math.abs(horizontalDriftPercent).toFixed(1)}% ${horizontalDriftPercent > 0 ? "오른쪽으로 치우쳤습니다" : "왼쪽으로 치우쳤습니다"}.`;
    }

    findings.push({
      landmarkId: target.id, labelKo: target.labelKo, driftPercent,
      verticalDriftPercent, horizontalDriftPercent, chiralityInverted,
      drawnWhileOccluded, severity, guidanceKo,
    });
  }

  const auditedCount = findings.length;
  const overallDriftPercent = auditedCount > 0 ? driftSum / auditedCount : 0;
  const passed = auditedCount > 0 && overallDriftPercent <= tolerancePercent && chiralityViolationCount === 0 && occlusionViolationCount === 0;
  const summaryKo = passed
    ? `${guide.characterName} 턴어라운드 비례 일치(평균 오차 ${overallDriftPercent.toFixed(1)}%).`
    : `${guide.characterName} 비례 이탈 감지: 평균 오차 ${overallDriftPercent.toFixed(1)}%, 좌우 반전 ${chiralityViolationCount}건, 가림 위반 ${occlusionViolationCount}건.`;

  return {
    characterId: guide.characterId,
    auditedCount,
    overallDriftPercent,
    maxDriftPercent,
    chiralityViolationCount,
    occlusionViolationCount,
    passed,
    findings,
    summaryKo,
  };
}
