/**
 * Wave 106 — 3D 루미스(Loomis) 두상 360° 턴어라운드 리깅 및 표정 프리셋 투영 엔진.
 *
 * 좌표계 규약 (오른손 데카르트 좌표계, 두상 로컬 공간):
 * - `+X_local`: 캐릭터의 해부학적 왼쪽(`anatomical-left`). 정면(`yaw = 0°`)에서 화면 오른쪽(`screen-right`).
 * - `-X_local`: 캐릭터의 해부학적 오른쪽(`anatomical-right`). 정면(`yaw = 0°`)에서 화면 왼쪽(`screen-left`).
 * - `+Y_local`: 정수리 방향(위), `+Z_local`: 안면 정면(코 방향, 카메라 시선 방향).
 * - 회전 순서 `v_cam = R_y(yaw) * R_x(pitch) * v_local`: `pitch = 0°` 수평 회전에서 모든 `yaw`의 Y좌표가 엄밀히 보존된다.
 */

import {
  EXPRESSION_PRESET_TABLE,
  type AnatomicalSide,
  type CharacterHeadCanonSheet,
  type ComicExpressionMarkerKind,
  type EarSpanCanon,
  type ExpressionPresetId,
  type HeadProjectionOptions,
  type HeadViewAngle,
  type ProjectedAsymmetricLandmark,
  type ProjectedBrowFeature,
  type ProjectedCanonGuideRails,
  type ProjectedCharacterHeadView,
  type ProjectedComicMarker,
  type ProjectedCranialBounds,
  type ProjectedEarFeature,
  type ProjectedEyeFeature,
  type ProjectedLoomisSidePlane,
  type ProjectedMouthFeature,
  type ProjectedNoseFeature,
  type ProjectedPoint3D,
  type ScreenSide,
  type Vec2,
  type Vec3,
} from "./loomis-rig-types-and-presets";

export {
  ALL_EXPRESSION_PRESET_IDS,
  createDefaultCharacterHeadCanonSheet,
  EXPRESSION_PRESET_TABLE,
  type AnatomicalSide,
  type AsymmetricFacialLandmark,
  type AsymmetricLandmarkKind,
  type CharacterHeadCanonSheet,
  type CharacterStyleArchetype,
  type ComicExpressionMarkerKind,
  type EarSpanCanon,
  type ExpressionPresetId,
  type ExpressionRigParameters,
  type HeadProjectionOptions,
  type HeadViewAngle,
  type ProjectedAsymmetricLandmark,
  type ProjectedBrowFeature,
  type ProjectedCanonGuideRails,
  type ProjectedCharacterHeadView,
  type ProjectedComicMarker,
  type ProjectedCranialBounds,
  type ProjectedEarFeature,
  type ProjectedEyeFeature,
  type ProjectedLoomisSidePlane,
  type ProjectedMouthFeature,
  type ProjectedNoseFeature,
  type ProjectedPoint3D,
  type ScreenSide,
  type Vec2,
  type Vec3,
} from "./loomis-rig-types-and-presets";

const DEG_TO_RAD = Math.PI / 180;
const DEFAULT_HEAD_SCALE_PX = 240;
const DEFAULT_OCCLUSION_THRESHOLD = 0.08;
const EARRING_OCCLUSION_THRESHOLD = -0.15;

export function clampFinite(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, value));
}

export function normalizeYawDeg(yawDeg: number): number {
  if (!Number.isFinite(yawDeg)) {
    return 0;
  }
  if (Math.abs(yawDeg) === 180) {
    return yawDeg > 0 ? 180 : -180;
  }
  let wrapped = (((yawDeg + 180) % 360) + 360) % 360 - 180;
  if (Object.is(wrapped, -0)) {
    wrapped = 0;
  }
  return wrapped;
}

export function normalizeVec3(v: Vec3): Vec3 {
  const len = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  if (!Number.isFinite(len) || len < 1e-9) {
    return { x: 0, y: 0, z: 1 };
  }
  return { x: v.x / len, y: v.y / len, z: v.z / len };
}

export function dotVec3(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

/** `v_cam = R_y(yaw) * R_x(pitch) * v_local` 직교 회전 변환. */
export function rotateHeadLocalToCamera(v: Vec3, yawDeg: number, pitchDeg: number): Vec3 {
  const pitchRad = pitchDeg * DEG_TO_RAD;
  const yawRad = yawDeg * DEG_TO_RAD;
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  const x1 = v.x;
  const y1 = v.y * cosP - v.z * sinP;
  const z1 = v.y * sinP + v.z * cosP;

  return {
    x: x1 * cosY + z1 * sinY,
    y: y1,
    z: -x1 * sinY + z1 * cosY,
  };
}

interface SanitizedHeadCanon {
  readonly headWidthToHeightRatio: number;
  readonly eyeLineVerticalRatio: number;
  readonly browLineVerticalRatio: number;
  readonly noseVerticalRatio: number;
  readonly mouthVerticalRatio: number;
  readonly eyeSpacingInEyeWidths: number;
  readonly chinTaperSharpness: number;
  readonly jawHeightRatio: number;
  readonly earSpan: EarSpanCanon;
  readonly hairVolumeCrownScale: number;
  readonly craniumRadiusX: number;
  readonly craniumRadiusY: number;
  readonly craniumRadiusZ: number;
  readonly craniumCenterY: number;
}

function sanitizeCanonSheet(sheet: CharacterHeadCanonSheet): SanitizedHeadCanon {
  const headWidthToHeightRatio = clampFinite(sheet.headWidthToHeightRatio, 0.52, 1.15, 0.76);
  const eyeLineVerticalRatio = clampFinite(sheet.eyeLineVerticalRatio, 0.36, 0.62, 0.48);
  const eyeSpacingInEyeWidths = clampFinite(sheet.eyeSpacingInEyeWidths, 0.55, 1.85, 1.0);
  const noseLengthRatio = clampFinite(sheet.noseLengthRatio, 0.1, 0.3, 0.19);
  const chinTaperSharpness = clampFinite(sheet.chinTaperSharpness, 0.0, 1.0, 0.62);
  const jawHeightRatio = clampFinite(sheet.jawHeightRatio, 0.18, 0.44, 0.32);
  const hairVolumeCrownScale = clampFinite(sheet.hairVolumeCrownScale, 1.0, 1.45, 1.12);

  const browLineVerticalRatio = clampFinite(eyeLineVerticalRatio - 0.085, 0.24, 0.54, 0.395);
  const noseVerticalRatio = clampFinite(eyeLineVerticalRatio + noseLengthRatio, 0.54, 0.82, 0.67);
  const mouthVerticalRatio = clampFinite(
    noseVerticalRatio + (1.0 - noseVerticalRatio) * 0.36,
    noseVerticalRatio + 0.05,
    0.92,
    0.79,
  );

  const earTop = clampFinite(sheet.earSpanStartToEnd.topRatioFromCrown, 0.25, 0.65, browLineVerticalRatio);
  const earBottom = clampFinite(sheet.earSpanStartToEnd.bottomRatioFromCrown, earTop + 0.12, 0.86, noseVerticalRatio);

  const craniumRadiusX = headWidthToHeightRatio * 0.5;
  const craniumRadiusY = (1.0 - jawHeightRatio) * 0.5;
  const craniumRadiusZ = craniumRadiusX * 1.08;
  const craniumCenterY = 0.5 - craniumRadiusY;

  return {
    headWidthToHeightRatio,
    eyeLineVerticalRatio,
    browLineVerticalRatio,
    noseVerticalRatio,
    mouthVerticalRatio,
    eyeSpacingInEyeWidths,
    chinTaperSharpness,
    jawHeightRatio,
    earSpan: { topRatioFromCrown: earTop, bottomRatioFromCrown: earBottom },
    hairVolumeCrownScale,
    craniumRadiusX,
    craniumRadiusY,
    craniumRadiusZ,
    craniumCenterY,
  };
}

/**
 * 정수리(0.0)~턱(1.0) 높이에서 C⁰ 연속 루미스 두상 수평 단면 `(rx, rz)` 및 수직 법선 기울기를 계산한다.
 */
function sampleHeadSurfaceCrossSection(
  canon: SanitizedHeadCanon,
  elevationNorm: number,
): { readonly rx: number; readonly rz: number; readonly slopeY: number } {
  const elev = clampFinite(elevationNorm, 0.01, 0.99, 0.5);
  const craniumMidElev = canon.craniumRadiusY;
  const jawStartElev = 1.0 - canon.jawHeightRatio;

  if (elev <= craniumMidElev) {
    const t = clampFinite((craniumMidElev - elev) / Math.max(0.05, craniumMidElev), 0, 1, 0);
    const radial = Math.sqrt(Math.max(0.08, 1.0 - t * t * 0.94));
    return {
      rx: canon.craniumRadiusX * radial,
      rz: canon.craniumRadiusZ * radial,
      slopeY: clampFinite(t * 0.78, 0, 0.85, 0),
    };
  }

  if (elev <= jawStartElev) {
    const midT = clampFinite((elev - craniumMidElev) / Math.max(0.05, jawStartElev - craniumMidElev), 0, 1, 0);
    const scale = 1.0 - midT * 0.08;
    return {
      rx: canon.craniumRadiusX * scale,
      rz: canon.craniumRadiusZ * scale,
      slopeY: -0.18 * midT,
    };
  }

  const jawT = clampFinite((elev - jawStartElev) / Math.max(0.05, canon.jawHeightRatio), 0, 1, 0.5);
  const taperPower = 1.15 + (1.0 - canon.chinTaperSharpness) * 1.15;
  const widthFactor = Math.max(
    0.16,
    1.0 - Math.pow(jawT, taperPower) * (0.72 + canon.chinTaperSharpness * 0.14),
  );
  const depthFactor = Math.max(0.68, 1.0 - Math.pow(jawT, 1.4) * 0.24);

  return {
    rx: canon.craniumRadiusX * 0.92 * widthFactor,
    rz: canon.craniumRadiusZ * 0.92 * depthFactor,
    slopeY: -0.18 - jawT * 0.34,
  };
}

function projectToScreen(camPos: Vec3, originPx: Vec2, headScalePx: number): Vec2 {
  return { x: originPx.x + camPos.x * headScalePx, y: originPx.y - camPos.y * headScalePx };
}

function classifyScreenSide(deltaX: number, deadzone: number): ScreenSide {
  if (Math.abs(deltaX) <= deadzone) {
    return "center";
  }
  return deltaX > 0 ? "screen-right" : "screen-left";
}

function buildHeadSurfacePointAndNormal(
  canon: SanitizedHeadCanon,
  elevationNorm: number,
  azimuthRad: number,
): { readonly positionLocal: Vec3; readonly normalLocal: Vec3 } {
  const { rx, rz, slopeY } = sampleHeadSurfaceCrossSection(canon, elevationNorm);
  const sinA = Math.sin(azimuthRad);
  const cosA = Math.cos(azimuthRad);
  return {
    positionLocal: { x: rx * sinA, y: 0.5 - elevationNorm, z: rz * cosA },
    normalLocal: normalizeVec3({ x: sinA / Math.max(0.06, rx), y: slopeY, z: cosA / Math.max(0.06, rz) }),
  };
}

function resolveComicMarkerLocalAnchor(
  kind: ComicExpressionMarkerKind,
  canon: SanitizedHeadCanon,
): { readonly pos: Vec3; readonly normal: Vec3 } {
  switch (kind) {
    case "anger-vein":
      return {
        pos: { x: canon.craniumRadiusX * 0.58, y: 0.5 - (canon.browLineVerticalRatio - 0.1), z: canon.craniumRadiusZ * 0.78 },
        normal: normalizeVec3({ x: 0.5, y: 0.15, z: 0.85 }),
      };
    case "sweat-drop":
      return {
        pos: { x: -canon.craniumRadiusX * 0.72, y: 0.5 - (canon.browLineVerticalRatio - 0.04), z: canon.craniumRadiusZ * 0.65 },
        normal: normalizeVec3({ x: -0.6, y: 0.1, z: 0.79 }),
      };
    case "shock-lines":
      return {
        pos: { x: 0, y: 0.5 - (canon.browLineVerticalRatio - 0.14), z: canon.craniumRadiusZ * 0.92 },
        normal: { x: 0, y: 0.2, z: 0.98 },
      };
    case "tear-glint":
      return {
        pos: { x: canon.craniumRadiusX * 0.36, y: 0.5 - (canon.eyeLineVerticalRatio + 0.035), z: canon.craniumRadiusZ * 0.9 },
        normal: normalizeVec3({ x: 0.32, y: 0, z: 0.95 }),
      };
    case "blush-lines":
      return {
        pos: { x: canon.craniumRadiusX * 0.44, y: 0.5 - (canon.eyeLineVerticalRatio + 0.08), z: canon.craniumRadiusZ * 0.86 },
        normal: normalizeVec3({ x: 0.38, y: -0.05, z: 0.92 }),
      };
    case "confident-glint":
      return {
        pos: { x: -canon.craniumRadiusX * 0.44, y: 0.5 - (canon.browLineVerticalRatio - 0.06), z: canon.craniumRadiusZ * 0.84 },
        normal: normalizeVec3({ x: -0.4, y: 0.1, z: 0.91 }),
      };
    case "eye-bag-hatch":
      return {
        pos: { x: canon.craniumRadiusX * 0.32, y: 0.5 - (canon.eyeLineVerticalRatio + 0.045), z: canon.craniumRadiusZ * 0.91 },
        normal: normalizeVec3({ x: 0.28, y: 0, z: 0.96 }),
      };
    case "sigh-puff":
      return {
        pos: { x: canon.craniumRadiusX * 0.34, y: 0.5 - (canon.mouthVerticalRatio + 0.02), z: canon.craniumRadiusZ * 0.94 },
        normal: normalizeVec3({ x: 0.3, y: -0.1, z: 0.95 }),
      };
  }
}

/** 주어진 `(yawDeg, pitchDeg)` 시점과 표정 프리셋으로 3D 루미스 두상·이목구비·비대칭 특징점을 투영한다. */
export function projectCharacterHeadAtView(
  canonSheet: CharacterHeadCanonSheet,
  viewAngle: HeadViewAngle,
  expressionPreset: ExpressionPresetId = "neutral",
  options?: HeadProjectionOptions,
): ProjectedCharacterHeadView {
  const canon = sanitizeCanonSheet(canonSheet);
  const yawDeg = normalizeYawDeg(viewAngle.yawDeg);
  const pitchDeg = clampFinite(viewAngle.pitchDeg, -45, 45, 0);
  const headScalePx = clampFinite(options?.headScalePx ?? DEFAULT_HEAD_SCALE_PX, 64, 1024, DEFAULT_HEAD_SCALE_PX);
  const originPx: Vec2 = {
    x: clampFinite(options?.originPx?.x ?? 0, -100000, 100000, 0),
    y: clampFinite(options?.originPx?.y ?? 0, -100000, 100000, 0),
  };
  const baseOcclusion = clampFinite(options?.occlusionThreshold ?? DEFAULT_OCCLUSION_THRESHOLD, -0.5, 0.5, DEFAULT_OCCLUSION_THRESHOLD);
  const expr = EXPRESSION_PRESET_TABLE[expressionPreset] ?? EXPRESSION_PRESET_TABLE.neutral;

  const pitchRad = pitchDeg * DEG_TO_RAD;
  const yawRad = yawDeg * DEG_TO_RAD;
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  const craniumCenterCam = rotateHeadLocalToCamera({ x: 0, y: canon.craniumCenterY, z: 0 }, yawDeg, pitchDeg);
  const craniumSupportX = Math.sqrt(
    Math.pow(cosY * canon.craniumRadiusX, 2) +
      Math.pow(sinY * sinP * canon.craniumRadiusY, 2) +
      Math.pow(sinY * cosP * canon.craniumRadiusZ, 2),
  );
  const craniumSupportY = Math.sqrt(
    Math.pow(cosP * canon.craniumRadiusY, 2) + Math.pow(sinP * canon.craniumRadiusZ, 2),
  );

  const sidePlaneRadius = canon.craniumRadiusY * 0.72;
  const buildSidePlane = (side: AnatomicalSide): ProjectedLoomisSidePlane => {
    const sign = side === "anatomical-left" ? 1 : -1;
    const centerCam = rotateHeadLocalToCamera(
      { x: sign * canon.craniumRadiusX * 0.88, y: canon.craniumCenterY, z: -0.02 * canon.craniumRadiusZ },
      yawDeg,
      pitchDeg,
    );
    const normalDotView = rotateHeadLocalToCamera({ x: sign, y: 0, z: 0 }, yawDeg, pitchDeg).z;
    return {
      anatomicalSide: side,
      center2D: projectToScreen(centerCam, originPx, headScalePx),
      radiusXPx: sidePlaneRadius * Math.max(0.18, Math.abs(normalDotView)) * headScalePx,
      radiusYPx: sidePlaneRadius * headScalePx,
      normalDotView,
      visible: normalDotView > 0.05,
    };
  };

  const frontMidlinePoint = (elevNorm: number): Vec3 => {
    const sec = sampleHeadSurfaceCrossSection(canon, elevNorm);
    return rotateHeadLocalToCamera({ x: 0, y: 0.5 - elevNorm, z: sec.rz }, yawDeg, pitchDeg);
  };

  const crownTopYCam = craniumCenterCam.y + craniumSupportY;
  const hairCrownTopYCam = craniumCenterCam.y + craniumSupportY * (1.0 + (canon.hairVolumeCrownScale - 1.0) * 0.9);
  const browMidCam = frontMidlinePoint(canon.browLineVerticalRatio);
  const eyeMidCam = frontMidlinePoint(canon.eyeLineVerticalRatio);
  const noseBaseSec = sampleHeadSurfaceCrossSection(canon, canon.noseVerticalRatio);
  const noseBaseCam = rotateHeadLocalToCamera({ x: 0, y: 0.5 - canon.noseVerticalRatio, z: noseBaseSec.rz }, yawDeg, pitchDeg);
  const noseTipCam = rotateHeadLocalToCamera(
    { x: 0, y: 0.5 - (canon.noseVerticalRatio - 0.015), z: noseBaseSec.rz + 0.085 },
    yawDeg,
    pitchDeg,
  );
  const mouthMidCam = frontMidlinePoint(canon.mouthVerticalRatio);
  const chinSec = sampleHeadSurfaceCrossSection(canon, 0.99);
  const chinTipCam = rotateHeadLocalToCamera({ x: 0, y: -0.5, z: chinSec.rz * 0.95 }, yawDeg, pitchDeg);

  const canonGuideRails: ProjectedCanonGuideRails = {
    crownY: originPx.y - crownTopYCam * headScalePx,
    hairCrownY: originPx.y - hairCrownTopYCam * headScalePx,
    browY: originPx.y - browMidCam.y * headScalePx,
    eyeY: originPx.y - eyeMidCam.y * headScalePx,
    noseY: originPx.y - noseBaseCam.y * headScalePx,
    mouthY: originPx.y - mouthMidCam.y * headScalePx,
    chinY: originPx.y - chinTipCam.y * headScalePx,
  };

  const halfBoundX = Math.max(craniumSupportX, Math.abs(chinTipCam.x) + chinSec.rx * Math.abs(cosY));
  const minYCam = Math.min(chinTipCam.y, craniumCenterCam.y - craniumSupportY);
  const widthPx = halfBoundX * 2 * headScalePx;
  const heightPx = Math.max(1e-3, (crownTopYCam - minYCam) * headScalePx);
  const cranialBounds: ProjectedCranialBounds = {
    minX: originPx.x - halfBoundX * headScalePx,
    maxX: originPx.x + halfBoundX * headScalePx,
    minY: originPx.y - crownTopYCam * headScalePx,
    maxY: originPx.y - minYCam * headScalePx,
    widthPx,
    heightPx,
    widthToHeightRatio: widthPx / heightPx,
  };

  const centerlineCurve: ProjectedPoint3D[] = [];
  for (let i = 0; i <= 14; i += 1) {
    const { positionLocal, normalLocal } = buildHeadSurfacePointAndNormal(canon, 0.04 + (i / 14) * 0.95, 0);
    const position3D = rotateHeadLocalToCamera(positionLocal, yawDeg, pitchDeg);
    const camNorm = rotateHeadLocalToCamera(normalLocal, yawDeg, pitchDeg);
    centerlineCurve.push({ position3D, position2D: projectToScreen(position3D, originPx, headScalePx), visible: camNorm.z > -0.05 });
  }

  const browBeltCurve: ProjectedPoint3D[] = [];
  for (let i = -7; i <= 7; i += 1) {
    const { positionLocal, normalLocal } = buildHeadSurfacePointAndNormal(canon, canon.browLineVerticalRatio, (i / 7) * Math.PI * 0.55);
    const position3D = rotateHeadLocalToCamera(positionLocal, yawDeg, pitchDeg);
    const camNorm = rotateHeadLocalToCamera(normalLocal, yawDeg, pitchDeg);
    browBeltCurve.push({ position3D, position2D: projectToScreen(position3D, originPx, headScalePx), visible: camNorm.z > -0.05 });
  }

  const jawWaypoints: readonly Vec3[] = [
    { x: -canon.craniumRadiusX * 0.94, y: 0.5 - canon.earSpan.bottomRatioFromCrown, z: -0.04 * canon.craniumRadiusZ },
    { x: -canon.craniumRadiusX * (0.82 - canon.chinTaperSharpness * 0.16), y: 0.5 - (1.0 - canon.jawHeightRatio * 0.45), z: canon.craniumRadiusZ * 0.36 },
    { x: -canon.craniumRadiusX * (0.34 - canon.chinTaperSharpness * 0.14), y: -0.455, z: chinSec.rz * 0.86 },
    { x: 0, y: -0.5, z: chinSec.rz * 0.95 },
    { x: canon.craniumRadiusX * (0.34 - canon.chinTaperSharpness * 0.14), y: -0.455, z: chinSec.rz * 0.86 },
    { x: canon.craniumRadiusX * (0.82 - canon.chinTaperSharpness * 0.16), y: 0.5 - (1.0 - canon.jawHeightRatio * 0.45), z: canon.craniumRadiusZ * 0.36 },
    { x: canon.craniumRadiusX * 0.94, y: 0.5 - canon.earSpan.bottomRatioFromCrown, z: -0.04 * canon.craniumRadiusZ },
  ];
  const jawlineContour: ProjectedPoint3D[] = jawWaypoints.map((pt) => {
    const position3D = rotateHeadLocalToCamera(pt, yawDeg, pitchDeg);
    return { position3D, position2D: projectToScreen(position3D, originPx, headScalePx), visible: true };
  });

  const hairSilhouetteCurve: ProjectedPoint3D[] = [];
  const hairScaleX = 1.0 + (canon.hairVolumeCrownScale - 1.0) * 0.65;
  const hairScaleY = 1.0 + (canon.hairVolumeCrownScale - 1.0) * 0.9;
  for (let i = 0; i <= 12; i += 1) {
    const angle = Math.PI - (i / 12) * Math.PI;
    const position3D: Vec3 = {
      x: craniumCenterCam.x + Math.cos(angle) * craniumSupportX * hairScaleX,
      y: craniumCenterCam.y + Math.sin(angle) * craniumSupportY * hairScaleY,
      z: 0,
    };
    hairSilhouetteCurve.push({ position3D, position2D: projectToScreen(position3D, originPx, headScalePx), visible: true });
  }

  const faceFrontWidth = canon.headWidthToHeightRatio * 0.86;
  const singleEyeW = faceFrontWidth / (2.0 + canon.eyeSpacingInEyeWidths + 1.35);
  const eyeOffsetX = (canon.eyeSpacingInEyeWidths * 0.5 + 0.5) * singleEyeW;
  const eyeHalfW = singleEyeW * 0.5;
  const eyeSec = sampleHeadSurfaceCrossSection(canon, canon.eyeLineVerticalRatio);
  const eyeLocalY = 0.5 - canon.eyeLineVerticalRatio;
  const baseEyeAperture = singleEyeW * 0.44;

  const projectEye = (side: AnatomicalSide): ProjectedEyeFeature => {
    const sign = side === "anatomical-left" ? 1 : -1;
    const openness = side === "anatomical-left" ? expr.eyeOpennessLeft : expr.eyeOpennessRight;
    const cAng = Math.asin(clampFinite((sign * eyeOffsetX) / Math.max(0.1, eyeSec.rx), -0.85, 0.85, 0));
    const iAng = Math.asin(clampFinite((sign * (eyeOffsetX - eyeHalfW)) / Math.max(0.1, eyeSec.rx), -0.85, 0.85, 0));
    const oAng = Math.asin(clampFinite((sign * (eyeOffsetX + eyeHalfW)) / Math.max(0.1, eyeSec.rx), -0.92, 0.92, 0));
    const centerCam = rotateHeadLocalToCamera({ x: sign * eyeOffsetX, y: eyeLocalY, z: eyeSec.rz * Math.cos(cAng) * 0.96 }, yawDeg, pitchDeg);
    const inner2D = projectToScreen(rotateHeadLocalToCamera({ x: sign * (eyeOffsetX - eyeHalfW), y: eyeLocalY, z: eyeSec.rz * Math.cos(iAng) * 0.97 }, yawDeg, pitchDeg), originPx, headScalePx);
    const outer2D = projectToScreen(rotateHeadLocalToCamera({ x: sign * (eyeOffsetX + eyeHalfW), y: eyeLocalY, z: eyeSec.rz * Math.cos(oAng) * 0.94 }, yawDeg, pitchDeg), originPx, headScalePx);
    const normalDotView = rotateHeadLocalToCamera(normalizeVec3({ x: Math.sin(cAng) * 0.85, y: 0, z: Math.cos(cAng) }), yawDeg, pitchDeg).z;
    return {
      anatomicalSide: side,
      center2D: projectToScreen(centerCam, originPx, headScalePx),
      innerCorner2D: inner2D,
      outerCorner2D: outer2D,
      widthPx: Math.hypot(outer2D.x - inner2D.x, outer2D.y - inner2D.y),
      apertureHeightPx: baseEyeAperture * openness * headScalePx,
      pupilRadiusPx: baseEyeAperture * 0.42 * expr.pupilScale * headScalePx,
      opennessFactor: openness,
      normalDotView,
      visible: normalDotView > baseOcclusion,
      screenSide: classifyScreenSide(centerCam.x - eyeMidCam.x, 0.005),
    };
  };

  const leftEye = projectEye("anatomical-left");
  const rightEye = projectEye("anatomical-right");

  const projectBrow = (side: AnatomicalSide): ProjectedBrowFeature => {
    const sign = side === "anatomical-left" ? 1 : -1;
    const slantDeg = side === "anatomical-left" ? expr.browSlantLeftDeg : expr.browSlantRightDeg;
    const browElev = clampFinite(canon.browLineVerticalRatio + expr.browElevationOffsetNorm, 0.2, 0.56, 0.39);
    const browSec = sampleHeadSurfaceCrossSection(canon, browElev);
    const slantY = Math.sin(slantDeg * DEG_TO_RAD) * eyeHalfW * 0.65;
    const baseY = 0.5 - browElev;
    const normalDotView = rotateHeadLocalToCamera(normalizeVec3({ x: sign * 0.36, y: 0.06, z: 0.93 }), yawDeg, pitchDeg).z;
    return {
      anatomicalSide: side,
      inner2D: projectToScreen(rotateHeadLocalToCamera({ x: sign * Math.max(0.02, eyeOffsetX - eyeHalfW * 1.05), y: baseY + slantY, z: browSec.rz * 0.96 }, yawDeg, pitchDeg), originPx, headScalePx),
      peak2D: projectToScreen(rotateHeadLocalToCamera({ x: sign * (eyeOffsetX + eyeHalfW * 0.2), y: baseY + 0.012, z: browSec.rz * 0.89 }, yawDeg, pitchDeg), originPx, headScalePx),
      outer2D: projectToScreen(rotateHeadLocalToCamera({ x: sign * (eyeOffsetX + eyeHalfW * 1.15), y: baseY - slantY * 0.65, z: browSec.rz * 0.78 }, yawDeg, pitchDeg), originPx, headScalePx),
      slantDeg,
      normalDotView,
      visible: normalDotView > baseOcclusion,
    };
  };

  const noseNormalDot = rotateHeadLocalToCamera({ x: 0, y: -0.05, z: 1 }, yawDeg, pitchDeg).z;
  const noseTip2D = projectToScreen(noseTipCam, originPx, headScalePx);
  const noseBase2D = projectToScreen(noseBaseCam, originPx, headScalePx);
  const nose: ProjectedNoseFeature = {
    bridge2D: projectToScreen(eyeMidCam, originPx, headScalePx),
    tip2D: noseTip2D,
    base2D: noseBase2D,
    normalDotView: noseNormalDot,
    visible: noseNormalDot > -0.18,
    profileProtrusionPx: Math.abs(noseTip2D.x - noseBase2D.x),
  };

  const mouthSec = sampleHeadSurfaceCrossSection(canon, canon.mouthVerticalRatio);
  const mouthHalfW = singleEyeW * 0.92;
  const mouthBaseY = 0.5 - canon.mouthVerticalRatio;
  const mouthLift = expr.mouthCurvature * 0.018;
  const mouthSkewLift = expr.mouthSkew * 0.012;
  const mouthOpenHalf = expr.mouthOpenness * 0.032;
  const mouthNormalDot = rotateHeadLocalToCamera({ x: 0, y: -0.08, z: 1 }, yawDeg, pitchDeg).z;
  const mouth: ProjectedMouthFeature = {
    leftCorner2D: projectToScreen(rotateHeadLocalToCamera({ x: mouthHalfW, y: mouthBaseY + mouthLift + mouthSkewLift, z: mouthSec.rz * 0.88 }, yawDeg, pitchDeg), originPx, headScalePx),
    rightCorner2D: projectToScreen(rotateHeadLocalToCamera({ x: -mouthHalfW, y: mouthBaseY + mouthLift - mouthSkewLift, z: mouthSec.rz * 0.88 }, yawDeg, pitchDeg), originPx, headScalePx),
    centerTop2D: projectToScreen(rotateHeadLocalToCamera({ x: 0, y: mouthBaseY + mouthOpenHalf * 0.45, z: mouthSec.rz * 0.99 }, yawDeg, pitchDeg), originPx, headScalePx),
    centerBottom2D: projectToScreen(rotateHeadLocalToCamera({ x: 0, y: mouthBaseY - mouthOpenHalf * 0.85 - mouthLift * 0.25, z: mouthSec.rz * 0.97 }, yawDeg, pitchDeg), originPx, headScalePx),
    curvature: expr.mouthCurvature,
    openness: expr.mouthOpenness,
    skew: expr.mouthSkew,
    normalDotView: mouthNormalDot,
    visible: mouthNormalDot > -0.12,
  };

  const projectEar = (side: AnatomicalSide): ProjectedEarFeature => {
    const sign = side === "anatomical-left" ? 1 : -1;
    const earMid = (canon.earSpan.topRatioFromCrown + canon.earSpan.bottomRatioFromCrown) * 0.5;
    const outerCam = rotateHeadLocalToCamera({ x: sign * canon.craniumRadiusX * 1.09, y: 0.5 - earMid, z: -0.09 * canon.craniumRadiusZ }, yawDeg, pitchDeg);
    const normalDotView = rotateHeadLocalToCamera({ x: sign, y: 0, z: 0 }, yawDeg, pitchDeg).z;
    return {
      anatomicalSide: side,
      top2D: projectToScreen(rotateHeadLocalToCamera({ x: sign * canon.craniumRadiusX * 0.98, y: 0.5 - canon.earSpan.topRatioFromCrown, z: -0.04 * canon.craniumRadiusZ }, yawDeg, pitchDeg), originPx, headScalePx),
      outer2D: projectToScreen(outerCam, originPx, headScalePx),
      bottom2D: projectToScreen(rotateHeadLocalToCamera({ x: sign * canon.craniumRadiusX * 0.95, y: 0.5 - canon.earSpan.bottomRatioFromCrown, z: -0.02 * canon.craniumRadiusZ }, yawDeg, pitchDeg), originPx, headScalePx),
      normalDotView,
      visible: normalDotView > EARRING_OCCLUSION_THRESHOLD,
      screenSide: classifyScreenSide(outerCam.x, 0.005),
    };
  };

  const innerGapPx = Math.abs(leftEye.innerCorner2D.x - rightEye.innerCorner2D.x);
  const avgEyeWidthPx = Math.max(1e-3, (leftEye.widthPx + rightEye.widthPx) * 0.5);
  const effectiveEyeSpacingRatio = leftEye.visible && rightEye.visible ? innerGapPx / avgEyeWidthPx : canon.eyeSpacingInEyeWidths;
  const jawBaseY = originPx.y - frontMidlinePoint(1.0 - canon.jawHeightRatio).y * headScalePx;
  const totalRailHeightPx = Math.max(1e-3, canonGuideRails.chinY - canonGuideRails.crownY);
  const effectiveJawToHeadRatio = Math.max(0.05, (canonGuideRails.chinY - jawBaseY) / totalRailHeightPx);
  const effectiveEyeLineVerticalRatio = clampFinite((canonGuideRails.eyeY - canonGuideRails.crownY) / totalRailHeightPx, 0.05, 0.95, canon.eyeLineVerticalRatio);

  const isFrontHemisphere = Math.abs(yawDeg) <= 90;
  const asymmetricLandmarks: ProjectedAsymmetricLandmark[] = canonSheet.asymmetricLandmarks.map((lm) => {
    const sideSign = lm.anatomicalSide === "anatomical-left" ? 1 : -1;
    const clampedAngle = clampFinite(lm.surfaceAngleDeg, 0, 180, 40);
    const clampedElev = clampFinite(lm.elevationNorm, 0.02, 0.98, 0.55);
    const sizeScale = clampFinite(lm.sizeScale ?? 1.0, 0.4, 2.5, 1.0);
    const { positionLocal, normalLocal } = buildHeadSurfacePointAndNormal(canon, clampedElev, sideSign * clampedAngle * DEG_TO_RAD);
    const position3D = rotateHeadLocalToCamera(positionLocal, yawDeg, pitchDeg);
    const normal3D = normalizeVec3(rotateHeadLocalToCamera(normalLocal, yawDeg, pitchDeg));
    const threshold = lm.kind === "earring" ? EARRING_OCCLUSION_THRESHOLD : baseOcclusion;
    const { positionLocal: refMidLocal } = buildHeadSurfacePointAndNormal(canon, clampedElev, isFrontHemisphere ? 0 : Math.PI);
    const refMidCam = rotateHeadLocalToCamera(refMidLocal, yawDeg, pitchDeg);
    const lateralOffset = Math.abs(yawDeg) === 180 || Math.abs(yawDeg) === 0 ? position3D.x : position3D.x - refMidCam.x;

    return {
      landmarkId: lm.landmarkId,
      kind: lm.kind,
      labelKo: lm.labelKo,
      anatomicalSide: lm.anatomicalSide,
      surfaceAngleDeg: clampedAngle,
      elevationNorm: clampedElev,
      position3D,
      normal3D,
      position2D: projectToScreen(position3D, originPx, headScalePx),
      normalDotView: normal3D.z,
      occlusionThreshold: threshold,
      visible: normal3D.z > threshold,
      expectedScreenSide: classifyScreenSide(lateralOffset, 0.008),
      sizePx: headScalePx * 0.055 * sizeScale,
    };
  });

  const activeComicMarkers: ProjectedComicMarker[] = expr.comicMarkers.map((markerKind) => {
    const anchor = resolveComicMarkerLocalAnchor(markerKind, canon);
    const camPos = rotateHeadLocalToCamera(anchor.pos, yawDeg, pitchDeg);
    const camNorm = rotateHeadLocalToCamera(anchor.normal, yawDeg, pitchDeg);
    return {
      kind: markerKind,
      anchor2D: projectToScreen(camPos, originPx, headScalePx),
      scalePx: headScalePx * 0.052,
      visible: camNorm.z > baseOcclusion,
    };
  });

  return {
    characterId: canonSheet.characterId,
    characterName: canonSheet.characterName,
    viewAngle: { yawDeg, pitchDeg },
    expressionPreset: expr.presetId,
    expressionParams: expr,
    headScalePx,
    originPx,
    canonGuideRails,
    cranialBounds,
    craniumSphere: {
      center2D: projectToScreen(craniumCenterCam, originPx, headScalePx),
      radiusXPx: craniumSupportX * headScalePx,
      radiusYPx: craniumSupportY * headScalePx,
      leftSidePlane: buildSidePlane("anatomical-left"),
      rightSidePlane: buildSidePlane("anatomical-right"),
    },
    centerlineCurve,
    browBeltCurve,
    jawlineContour,
    hairSilhouetteCurve,
    facialFeatures: {
      leftEye,
      rightEye,
      leftBrow: projectBrow("anatomical-left"),
      rightBrow: projectBrow("anatomical-right"),
      nose,
      mouth,
      leftEar: projectEar("anatomical-left"),
      rightEar: projectEar("anatomical-right"),
      effectiveEyeSpacingRatio,
      effectiveJawToHeadRatio,
      effectiveEyeLineVerticalRatio,
    },
    asymmetricLandmarks,
    activeComicMarkers,
  };
}
