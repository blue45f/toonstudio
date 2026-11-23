/**
 * AR 스마트 글래스(XREAL · Vision Pro · WebXR immersive-ar) 6DoF 공간 HUD & 실물 컬러 OKLCH 스포이드,
 * VR 헤드셋(WebXR immersive-vr) 3D 배경 걸어다니며 스카우팅 · 2D 콘티 컷 카메라 스냅 · WebAudio Spatial Panner 산출 엔진 (Wave 28).
 * 실전 웹 표준 전용 · 원시 색 문자열 0건 · 순수 메모리 상태 전용.
 */

const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;

const roundTo = (value: number, digits = 3): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const degToRad = (deg: number): number => (deg * Math.PI) / 180;
const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

export interface Vec3Meters { readonly x: number; readonly y: number; readonly z: number; }
export interface HeadPose6DoF {
  readonly positionMeters: Vec3Meters; readonly yawDeg: number; readonly pitchDeg: number; readonly rollDeg: number;
}

// === 1. WebXR 기기 지원 프로브 ===

export interface WebXrNavigatorLike {
  readonly isSessionSupported?: (mode: "immersive-ar" | "immersive-vr" | "inline") => Promise<boolean>;
}
export interface WebXrDeviceSupportReport {
  readonly webXrAvailable: boolean; readonly immersiveArSupported: boolean; readonly immersiveVrSupported: boolean;
  readonly recommendedSessionMode: "immersive-ar" | "immersive-vr" | "inline-preview";
  readonly requiredFeatures: readonly string[]; readonly optionalFeatures: readonly string[];
}

/** 표준 `navigator.xr.isSessionSupported`를 호출해 AR/VR WebXR 세션 지원 여부를 안전하게 탐지한다. */
export async function detectWebXrDeviceSupport(xrLike?: WebXrNavigatorLike | null): Promise<WebXrDeviceSupportReport> {
  const xr: WebXrNavigatorLike | undefined =
    xrLike !== undefined
      ? (xrLike ?? undefined)
      : typeof navigator !== "undefined"
        ? (navigator as Navigator & { readonly xr?: WebXrNavigatorLike }).xr
        : undefined;

  if (!xr || typeof xr.isSessionSupported !== "function") {
    return {
      webXrAvailable: false, immersiveArSupported: false, immersiveVrSupported: false,
      recommendedSessionMode: "inline-preview", requiredFeatures: ["local-floor"], optionalFeatures: ["bounded-floor", "hand-tracking"],
    };
  }
  const probeMode = async (mode: "immersive-ar" | "immersive-vr"): Promise<boolean> => {
    try {
      return Boolean(await xr.isSessionSupported?.(mode));
    } catch {
      return false;
    }
  };
  const ar = await probeMode("immersive-ar");
  const vr = await probeMode("immersive-vr");

  return {
    webXrAvailable: true, immersiveArSupported: ar, immersiveVrSupported: vr,
    recommendedSessionMode: ar ? "immersive-ar" : vr ? "immersive-vr" : "inline-preview",
    requiredFeatures: ["local-floor"],
    optionalFeatures: ar ? ["anchors", "hit-test", "hand-tracking"] : ["bounded-floor", "hand-tracking"],
  };
}

// === 2. AR 스마트 글래스 6DoF 공간 HUD 앵커 솔버 ===

export type ArGlassDeviceProfile = "xreal-glass" | "vision-pro" | "webxr-ar-headset";
export type SpatialHudSlot = "left" | "right" | "top" | "top-left" | "top-right";
export type SpatialHudLockMode = "world-locked" | "head-follow-lazy" | "desk-anchored";
export type SpatialHudPanelRole = "layer-tree" | "reference-board" | "color-palette" | "brush-shelf";

export interface SpatialHudPanelSpec {
  readonly id: string; readonly role: SpatialHudPanelRole; readonly labelKo: string; readonly labelEn: string;
  readonly preferredSlot: SpatialHudSlot; readonly widthMeters: number; readonly heightMeters: number;
}
export interface SpatialHudAnchorInput {
  readonly deviceProfile: ArGlassDeviceProfile; readonly lockMode?: SpatialHudLockMode; readonly headPose?: HeadPose6DoF;
  readonly canvasSizeMeters?: { readonly width: number; readonly height: number };
  readonly canvasDistanceMeters?: number; readonly minGapMeters?: number; readonly panels?: readonly SpatialHudPanelSpec[];
}
export interface SpatialHudAnchor {
  readonly id: string; readonly role: SpatialHudPanelRole; readonly labelKo: string; readonly labelEn: string;
  readonly slot: SpatialHudSlot; readonly positionMeters: Vec3Meters;
  readonly rotationDeg: { readonly yaw: number; readonly pitch: number; readonly roll: number };
  readonly widthMeters: number; readonly heightMeters: number;
  readonly azimuthDeg: number; readonly elevationDeg: number; readonly distanceMeters: number;
  readonly canvasClearanceMeters: number; readonly withinComfortFov: boolean;
}
export interface SpatialHudLayoutResult {
  readonly deviceProfile: ArGlassDeviceProfile; readonly lockMode: SpatialHudLockMode;
  readonly horizontalFovDeg: number; readonly verticalFovDeg: number; readonly anchors: readonly SpatialHudAnchor[];
  readonly collisionCount: number; readonly canvasOverlapCount: number; readonly allWithinComfortRange: boolean;
  readonly canvasKeepoutBounds: { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };
  readonly webXrSessionInit: { readonly mode: "immersive-ar"; readonly referenceSpaceType: "local-floor" | "local"; readonly optionalFeatures: readonly string[] };
}

interface ArDeviceOpticsSpec {
  readonly horizontalFovDeg: number; readonly verticalFovDeg: number; readonly defaultDistanceMeters: number; readonly curveRadiusMeters: number;
}
interface PlaneRect { readonly cx: number; readonly cy: number; readonly w: number; readonly h: number; }

const AR_OPTICS_BY_DEVICE: Readonly<Record<ArGlassDeviceProfile, ArDeviceOpticsSpec>> = {
  "xreal-glass": { horizontalFovDeg: 52, verticalFovDeg: 32, defaultDistanceMeters: 1.4, curveRadiusMeters: 1.5 },
  "vision-pro": { horizontalFovDeg: 100, verticalFovDeg: 85, defaultDistanceMeters: 1.15, curveRadiusMeters: 1.25 },
  "webxr-ar-headset": { horizontalFovDeg: 78, verticalFovDeg: 62, defaultDistanceMeters: 1.25, curveRadiusMeters: 1.35 },
};

export const DEFAULT_SPATIAL_HUD_PANELS: readonly SpatialHudPanelSpec[] = [
  { id: "hud-layers", role: "layer-tree", labelKo: "레이어 트리", labelEn: "Layer Tree", preferredSlot: "left", widthMeters: 0.34, heightMeters: 0.46 },
  { id: "hud-reference", role: "reference-board", labelKo: "레퍼런스 보드", labelEn: "Reference Board", preferredSlot: "right", widthMeters: 0.4, heightMeters: 0.44 },
  { id: "hud-palette", role: "color-palette", labelKo: "OKLCH 팔레트", labelEn: "OKLCH Palette", preferredSlot: "top", widthMeters: 0.46, heightMeters: 0.2 },
];

const rectsOverlap = (a: PlaneRect, b: PlaneRect, margin: number): boolean =>
  Math.abs(a.cx - b.cx) < (a.w + b.w) / 2 + margin && Math.abs(a.cy - b.cy) < (a.h + b.h) / 2 + margin;

const rectClearance = (a: PlaneRect, b: PlaneRect): number =>
  roundTo(Math.max(Math.abs(a.cx - b.cx) - (a.w + b.w) / 2, Math.abs(a.cy - b.cy) - (a.h + b.h) / 2), 3);

/** AR 스마트 글래스 6DoF 시야에서 중앙 캔버스를 침범하지 않고 충돌 0건으로 공간 HUD 앵커를 배치한다. */
export function computeSpatialHudAnchors(input: SpatialHudAnchorInput): SpatialHudLayoutResult {
  const optics = AR_OPTICS_BY_DEVICE[input.deviceProfile];
  const lockMode: SpatialHudLockMode = input.lockMode ?? "world-locked";
  const headPose: HeadPose6DoF = input.headPose ?? { positionMeters: { x: 0, y: 1.45, z: 0 }, yawDeg: 0, pitchDeg: 0, rollDeg: 0 };
  const canvasW = clamp(input.canvasSizeMeters?.width ?? 0.68, 0.3, 1.8);
  const canvasH = clamp(input.canvasSizeMeters?.height ?? 0.48, 0.25, 1.2);
  const baseDistance = clamp(input.canvasDistanceMeters ?? optics.defaultDistanceMeters, 0.65, 3.0);
  const gap = clamp(input.minGapMeters ?? 0.06, 0.02, 0.25);
  const requestedPanels = (input.panels && input.panels.length > 0 ? input.panels : DEFAULT_SPATIAL_HUD_PANELS).slice(0, 6);

  const canvasRect: PlaneRect = { cx: 0, cy: 0, w: canvasW, h: canvasH };
  const placedRects: PlaneRect[] = [];
  const anchors: SpatialHudAnchor[] = [];
  const yawRad = degToRad(lockMode === "head-follow-lazy" ? headPose.yawDeg * 0.45 : headPose.yawDeg);
  const cosY = Math.cos(yawRad);
  const sinY = Math.sin(yawRad);

  for (const panel of requestedPanels) {
    const pw = clamp(panel.widthMeters, 0.16, 0.9);
    const ph = clamp(panel.heightMeters, 0.12, 0.8);
    let cx = 0;
    let cy = 0;
    if (panel.preferredSlot === "left") { cx = -(canvasW / 2 + gap + pw / 2); }
    else if (panel.preferredSlot === "right") { cx = canvasW / 2 + gap + pw / 2; }
    else if (panel.preferredSlot === "top") { cy = canvasH / 2 + gap + ph / 2; }
    else if (panel.preferredSlot === "top-left") { cx = -(canvasW / 2 + gap + pw / 2); cy = canvasH / 2 + gap + ph / 2; }
    else { cx = canvasW / 2 + gap + pw / 2; cy = canvasH / 2 + gap + ph / 2; }

    for (let iter = 0; iter < 16; iter += 1) {
      const candidate: PlaneRect = { cx, cy, w: pw, h: ph };
      if (!rectsOverlap(candidate, canvasRect, gap * 0.5) && !placedRects.some((r) => rectsOverlap(candidate, r, gap * 0.5))) break;
      if (panel.preferredSlot === "top") cy += ph * 0.5 + gap;
      else if (panel.preferredSlot === "left" || panel.preferredSlot === "top-left") cx -= pw * 0.5 + gap;
      else cx += pw * 0.5 + gap;
    }

    const finalRect: PlaneRect = { cx, cy, w: pw, h: ph };
    placedRects.push(finalRect);
    const localZ = -(baseDistance - Math.min(0.28, (cx * cx) / (2 * optics.curveRadiusMeters)));
    const worldX = headPose.positionMeters.x + cx * cosY + localZ * sinY;
    const worldY = headPose.positionMeters.y + cy;
    const worldZ = headPose.positionMeters.z - cx * sinY + localZ * cosY;
    const azimuthDeg = roundTo(radToDeg(Math.atan2(cx, Math.abs(localZ))), 1);
    const elevationDeg = roundTo(radToDeg(Math.atan2(cy, Math.hypot(cx, localZ))), 1);
    const distanceMeters = roundTo(Math.hypot(cx, cy, localZ), 3);

    anchors.push({
      id: panel.id, role: panel.role, labelKo: panel.labelKo, labelEn: panel.labelEn, slot: panel.preferredSlot,
      positionMeters: { x: roundTo(worldX, 3), y: roundTo(worldY, 3), z: roundTo(worldZ, 3) },
      rotationDeg: { yaw: roundTo(-azimuthDeg * 0.85, 1), pitch: roundTo(-elevationDeg * 0.65, 1), roll: 0 },
      widthMeters: roundTo(pw, 3), heightMeters: roundTo(ph, 3), azimuthDeg, elevationDeg, distanceMeters,
      canvasClearanceMeters: rectClearance(finalRect, canvasRect),
      withinComfortFov: Math.abs(azimuthDeg) <= optics.horizontalFovDeg * 0.72 && Math.abs(elevationDeg) <= optics.verticalFovDeg * 0.75,
    });
  }

  let collisionCount = 0;
  let canvasOverlapCount = 0;
  for (let i = 0; i < placedRects.length; i += 1) {
    const a = placedRects[i];
    if (!a) continue;
    if (rectsOverlap(a, canvasRect, 0.001)) canvasOverlapCount += 1;
    for (let j = i + 1; j < placedRects.length; j += 1) {
      const b = placedRects[j];
      if (b && rectsOverlap(a, b, 0.001)) collisionCount += 1;
    }
  }

  return {
    deviceProfile: input.deviceProfile, lockMode, horizontalFovDeg: optics.horizontalFovDeg, verticalFovDeg: optics.verticalFovDeg,
    anchors, collisionCount, canvasOverlapCount,
    allWithinComfortRange: anchors.every((item) => item.distanceMeters >= 0.6 && item.distanceMeters <= 2.6),
    canvasKeepoutBounds: { minX: roundTo(-canvasW / 2, 3), maxX: roundTo(canvasW / 2, 3), minY: roundTo(-canvasH / 2, 3), maxY: roundTo(canvasH / 2, 3) },
    webXrSessionInit: { mode: "immersive-ar", referenceSpaceType: lockMode === "desk-anchored" ? "local-floor" : "local", optionalFeatures: ["anchors", "hit-test", "hand-tracking"] },
  };
}

// === 3. AR 실물 컬러 스포이드 → OKLCH 브러시 스와치 변환 ===

export interface RealWorldColorSampleInput {
  readonly r: number; readonly g: number; readonly b: number;
  readonly channelRange?: "0-255" | "0-1"; readonly sourceColorSpace?: "srgb" | "display-p3";
  readonly whiteBalanceKelvin?: number; readonly labelKo?: string; readonly labelEn?: string;
}
export interface OklchTuple { readonly l: number; readonly c: number; readonly h: number; }
export interface RealWorldOklchSwatch {
  readonly labelKo: string; readonly labelEn: string; readonly sourceColorSpace: "srgb" | "display-p3";
  readonly rawOklch: OklchTuple; readonly oklch: OklchTuple; readonly cssOklch: string;
  readonly srgbUnit: { readonly r: number; readonly g: number; readonly b: number };
  readonly wideGamutOutsideSrgb: boolean; readonly hueFamilyKo: string; readonly hueFamilyEn: string;
  readonly contrastVsLightCanvas: number; readonly contrastVsDarkCanvas: number; readonly swatchTokenName: string;
}

const srgbTransferToLinear = (v01: number): number => {
  const c = clamp(v01, 0, 1);
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};
const linearToSrgbTransfer = (lin: number): number => {
  const c = clamp(lin, 0, 1);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
};

function linearToSrgbMatrix(lr: number, lg: number, lb: number, space: "srgb" | "display-p3"): readonly [number, number, number] {
  if (space === "srgb") return [lr, lg, lb];
  return [
    1.2249401763 * lr - 0.2249401763 * lg,
    -0.0420569547 * lr + 1.0420569547 * lg,
    -0.0196375546 * lr - 0.0786360456 * lg + 1.0982736002 * lb,
  ];
}

function linearRgbToOklch(lr: number, lg: number, lb: number, space: "srgb" | "display-p3"): OklchTuple {
  const [sr, sg, sb] = linearToSrgbMatrix(lr, lg, lb, space);
  const lCbrt = Math.cbrt(Math.max(0, 0.4122214708 * sr + 0.5363325363 * sg + 0.0514459929 * sb));
  const mCbrt = Math.cbrt(Math.max(0, 0.2119034982 * sr + 0.6806995451 * sg + 0.1073969566 * sb));
  const sCbrt = Math.cbrt(Math.max(0, 0.0883024619 * sr + 0.2817188376 * sg + 0.6299787005 * sb));
  const okL = 0.2104542553 * lCbrt + 0.793617785 * mCbrt - 0.0040720468 * sCbrt;
  const okA = 1.9779984951 * lCbrt - 2.428592205 * mCbrt + 0.4505937099 * sCbrt;
  const okB = 0.0259040371 * lCbrt + 0.7827717662 * mCbrt - 0.808675766 * sCbrt;
  const chroma = Math.hypot(okA, okB);
  const hue = chroma < 1e-5 ? 0 : (((Math.atan2(okB, okA) * 180) / Math.PI) + 360) % 360;
  return { l: roundTo(clamp(okL, 0, 1), 4), c: roundTo(Math.max(0, chroma), 4), h: roundTo(hue, 1) };
}

function classifyOklchHueFamily(color: OklchTuple): { readonly ko: string; readonly en: string } {
  if (color.c < 0.025) return { ko: "무채색·뉴트럴", en: "Neutral" };
  if (color.h < 38 || color.h >= 342) return { ko: "크림슨·적갈", en: "Crimson / Red" };
  if (color.h < 78) return { ko: "앰버·오렌지", en: "Amber / Orange" };
  if (color.h < 120) return { ko: "골드·올리브", en: "Gold / Olive" };
  if (color.h < 172) return { ko: "포레스트·그린", en: "Forest Green" };
  if (color.h < 220) return { ko: "틸·시안", en: "Teal / Cyan" };
  if (color.h < 272) return { ko: "코발트·블루", en: "Cobalt Blue" };
  return { ko: "바이올렛·마젠타", en: "Violet / Magenta" };
}

/** AR 카메라에서 추출한 실물 색상을 Display-P3/sRGB·화이트밸런스 보정 후 OKLCH 브러시 스와치로 변환한다. */
export function sampleRealWorldColorToOklch(sample: RealWorldColorSampleInput): RealWorldOklchSwatch {
  const space = sample.sourceColorSpace ?? "srgb";
  const div = sample.channelRange === "0-1" ? 1 : 255;
  const lrRaw = srgbTransferToLinear(clamp(sample.r / div, 0, 1));
  const lgRaw = srgbTransferToLinear(clamp(sample.g / div, 0, 1));
  const lbRaw = srgbTransferToLinear(clamp(sample.b / div, 0, 1));
  const rawOklch = linearRgbToOklch(lrRaw, lgRaw, lbRaw, space);

  const kelvin = clamp(sample.whiteBalanceKelvin ?? 6500, 2700, 10000);
  const tempShift = (6500 - kelvin) / 6500;
  const lrCal = clamp(lrRaw * (1 - tempShift * 0.14), 0, 1);
  const lgCal = clamp(lgRaw, 0, 1);
  const lbCal = clamp(lbRaw * (1 + tempShift * 0.18), 0, 1);
  const oklch = linearRgbToOklch(lrCal, lgCal, lbCal, space);

  const [sLinR, sLinG, sLinB] = linearToSrgbMatrix(lrCal, lgCal, lbCal, space);
  const wideGamutOutsideSrgb =
    sLinR < -0.005 || sLinR > 1.005 || sLinG < -0.005 || sLinG > 1.005 || sLinB < -0.005 || sLinB > 1.005;
  const relLum = 0.2126 * clamp(sLinR, 0, 1) + 0.7152 * clamp(sLinG, 0, 1) + 0.0722 * clamp(sLinB, 0, 1);
  const family = classifyOklchHueFamily(oklch);
  const lPct = roundTo(oklch.l * 100, 1);

  return {
    labelKo: sample.labelKo ?? `${family.ko} 실물 스와치`,
    labelEn: sample.labelEn ?? `${family.en} Real-World Swatch`,
    sourceColorSpace: space, rawOklch, oklch,
    cssOklch: `oklch(${lPct}% ${oklch.c.toFixed(4)} ${oklch.h.toFixed(1)})`,
    srgbUnit: { r: roundTo(linearToSrgbTransfer(sLinR), 4), g: roundTo(linearToSrgbTransfer(sLinG), 4), b: roundTo(linearToSrgbTransfer(sLinB), 4) },
    wideGamutOutsideSrgb, hueFamilyKo: family.ko, hueFamilyEn: family.en,
    contrastVsLightCanvas: roundTo((Math.max(0.95, relLum) + 0.05) / (Math.min(0.95, relLum) + 0.05), 2),
    contrastVsDarkCanvas: roundTo((Math.max(0.06, relLum) + 0.05) / (Math.min(0.06, relLum) + 0.05), 2),
    swatchTokenName: `ar-swatch-l${Math.round(lPct)}-c${Math.round(oklch.c * 100)}-h${Math.round(oklch.h)}`,
  };
}

export const SAMPLE_REAL_WORLD_COLORS: readonly RealWorldColorSampleInput[] = [
  { r: 214, g: 138, b: 92, channelRange: "0-255", sourceColorSpace: "srgb", whiteBalanceKelvin: 5200, labelKo: "오후 햇살 테라코타", labelEn: "Afternoon Terracotta" },
  { r: 245, g: 48, b: 64, channelRange: "0-255", sourceColorSpace: "display-p3", whiteBalanceKelvin: 6500, labelKo: "Display-P3 네온 코랄", labelEn: "Display-P3 Neon Coral" },
  { r: 58, g: 122, b: 148, channelRange: "0-255", sourceColorSpace: "srgb", whiteBalanceKelvin: 7400, labelKo: "비 갠 창가 슬레이트", labelEn: "Rain-Washed Slate" },
];

// === 4. VR 헤드셋(WebXR immersive-vr) 3D 배경 걸어다니며 스카우팅 & 컷 스냅샷 ===

export type VrScoutingSceneId = "classroom" | "alley" | "palace";
export type CutAspectRatio = "9:16" | "4:5" | "16:9" | "1:1";
export type VrShotType = "extreme-close-up" | "close-up" | "medium-shot" | "wide-establishing" | "low-angle-dramatic" | "high-angle-overview";

export interface VrSceneAudioCue {
  readonly cueId: string; readonly labelKo: string; readonly labelEn: string; readonly positionMeters: Vec3Meters;
  readonly refDistanceMeters: number; readonly maxDistanceMeters: number; readonly rolloffFactor: number;
}
export interface VrScoutingSceneSpec {
  readonly id: VrScoutingSceneId; readonly nameKo: string; readonly nameEn: string;
  readonly walkBounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number; readonly minY: number; readonly maxY: number };
  readonly spawnPosition: Vec3Meters; readonly spawnYawDeg: number; readonly focalLandmark: Vec3Meters;
  readonly focalNameKo: string; readonly focalNameEn: string; readonly audioCues: readonly VrSceneAudioCue[];
}
export interface VrScoutingRigState {
  readonly sceneId: VrScoutingSceneId; readonly positionMeters: Vec3Meters;
  readonly yawDeg: number; readonly pitchDeg: number; readonly rollDeg: number; readonly verticalFovDeg: number;
  readonly clampedToBounds: boolean; readonly distanceToFocalMeters: number; readonly shotType: VrShotType;
}
export interface VrScoutingStepInput {
  readonly moveForwardMeters?: number; readonly moveRightMeters?: number; readonly verticalOffsetMeters?: number;
  readonly yawDeltaDeg?: number; readonly pitchDeltaDeg?: number; readonly rollDeltaDeg?: number;
  readonly fovDeltaDeg?: number; readonly teleportTarget?: Vec3Meters;
}
export interface WebAudioPannerConfig {
  readonly panningModel: "HRTF"; readonly distanceModel: "inverse";
  readonly positionX: number; readonly positionY: number; readonly positionZ: number;
  readonly refDistance: number; readonly maxDistance: number; readonly rolloffFactor: number;
}
export interface SpatialAudioSourceProjection {
  readonly cueId: string; readonly labelKo: string; readonly labelEn: string;
  readonly azimuthDeg: number; readonly elevationDeg: number; readonly distanceMeters: number;
  readonly attenuationGain: number; readonly webAudioPannerConfig: WebAudioPannerConfig;
}
export interface VrCutFrameSnapshot {
  readonly snapshotId: string; readonly sceneId: VrScoutingSceneId; readonly sceneNameKo: string; readonly sceneNameEn: string;
  readonly aspectRatio: CutAspectRatio;
  readonly camera: {
    readonly positionMeters: Vec3Meters; readonly lookAtTargetMeters: Vec3Meters;
    readonly yawDeg: number; readonly pitchDeg: number; readonly rollDeg: number;
    readonly verticalFovDeg: number; readonly equivalent35mmFocalLengthMm: number; readonly dutchTiltActive: boolean;
  };
  readonly composition: {
    readonly shotType: VrShotType; readonly horizonLineRatio: number;
    readonly vanishingPointNormalized: { readonly x: number; readonly y: number };
    readonly dramaScore: number; readonly framingNotesKo: string; readonly framingNotesEn: string;
  };
  readonly spatialAudioSources: readonly SpatialAudioSourceProjection[];
}
export interface PannerNodeLike {
  panningModel?: string; distanceModel?: string; refDistance?: number; maxDistance?: number; rolloffFactor?: number;
  positionX?: { readonly setValueAtTime?: (value: number, startTime: number) => void; value?: number };
  positionY?: { readonly setValueAtTime?: (value: number, startTime: number) => void; value?: number };
  positionZ?: { readonly setValueAtTime?: (value: number, startTime: number) => void; value?: number };
}

export const VR_SCOUTING_SCENES: Readonly<Record<VrScoutingSceneId, VrScoutingSceneSpec>> = {
  classroom: {
    id: "classroom", nameKo: "방과 후 햇살 교실", nameEn: "After-School Sunlit Classroom",
    walkBounds: { minX: -4.0, maxX: 4.0, minZ: -4.5, maxZ: 4.5, minY: 0.55, maxY: 2.9 },
    spawnPosition: { x: 0.4, y: 1.55, z: 2.6 }, spawnYawDeg: 0,
    focalLandmark: { x: -1.2, y: 1.35, z: -2.2 }, focalNameKo: "창가 마지막 책상", focalNameEn: "Window-Side Back Desk",
    audioCues: [
      { cueId: "aud-window-breeze", labelKo: "창밖 저녁 바람", labelEn: "Evening Window Breeze", positionMeters: { x: -3.6, y: 1.8, z: -1.5 }, refDistanceMeters: 1.2, maxDistanceMeters: 16, rolloffFactor: 1.1 },
      { cueId: "aud-hallway-steps", labelKo: "복도 끝 발소리", labelEn: "Hallway Footsteps", positionMeters: { x: 3.4, y: 0.3, z: -3.2 }, refDistanceMeters: 1.0, maxDistanceMeters: 18, rolloffFactor: 1.2 },
    ],
  },
  alley: {
    id: "alley", nameKo: "비 오는 야간 골목", nameEn: "Rainy Night Back-Alley",
    walkBounds: { minX: -2.6, maxX: 2.6, minZ: -9.0, maxZ: 9.0, minY: 0.5, maxY: 4.8 },
    spawnPosition: { x: 0, y: 1.6, z: 5.4 }, spawnYawDeg: 0,
    focalLandmark: { x: 0.2, y: 1.4, z: -2.5 }, focalNameKo: "가로등 아래 우산 실루엣", focalNameEn: "Umbrella Silhouette Under Streetlamp",
    audioCues: [
      { cueId: "aud-rain-gutter", labelKo: "빗물 배수관 낙하", labelEn: "Rain Gutter Splash", positionMeters: { x: -2.2, y: 2.6, z: 1.8 }, refDistanceMeters: 1.0, maxDistanceMeters: 20, rolloffFactor: 1.0 },
      { cueId: "aud-neon-hum", labelKo: "네온 간판 저주파 험", labelEn: "Neon Sign Hum", positionMeters: { x: 2.1, y: 3.2, z: -1.4 }, refDistanceMeters: 1.1, maxDistanceMeters: 18, rolloffFactor: 1.15 },
    ],
  },
  palace: {
    id: "palace", nameKo: "달빛 고궁 전각 회랑", nameEn: "Moonlit Palace Corridor",
    walkBounds: { minX: -7.5, maxX: 7.5, minZ: -10.0, maxZ: 10.0, minY: 0.55, maxY: 6.5 },
    spawnPosition: { x: 0, y: 1.65, z: 6.5 }, spawnYawDeg: 0,
    focalLandmark: { x: 0, y: 2.2, z: -4.5 }, focalNameKo: "대청마루 어좌 계단", focalNameEn: "Grand Hall Steps",
    audioCues: [
      { cueId: "aud-eaves-chime", labelKo: "처마 풍경 소리", labelEn: "Eaves Wind Chime", positionMeters: { x: -4.2, y: 4.4, z: 1.5 }, refDistanceMeters: 1.5, maxDistanceMeters: 26, rolloffFactor: 0.9 },
      { cueId: "aud-courtyard-wind", labelKo: "달빛 뜰 밤바람", labelEn: "Courtyard Night Wind", positionMeters: { x: 4.8, y: 1.2, z: -3.5 }, refDistanceMeters: 1.6, maxDistanceMeters: 28, rolloffFactor: 0.85 },
    ],
  },
};

function classifyVrShot(position: Vec3Meters, pitchDeg: number, distToFocal: number, fovDeg: number): VrShotType {
  if (position.y <= 0.95 && pitchDeg >= 10) return "low-angle-dramatic";
  if (position.y >= 2.6 && pitchDeg <= -14) return "high-angle-overview";
  if (distToFocal <= 1.8 && fovDeg <= 44) return "extreme-close-up";
  if (distToFocal <= 3.0) return "close-up";
  if (distToFocal <= 6.2) return "medium-shot";
  return "wide-establishing";
}

/** 특정 3D 배경 씬의 초기 VR 스카우팅 카메라 리그 상태를 생성한다. */
export function createInitialVrScoutingRig(sceneId: VrScoutingSceneId = "alley"): VrScoutingRigState {
  const scene = VR_SCOUTING_SCENES[sceneId];
  const pos = scene.spawnPosition;
  const dist = roundTo(Math.hypot(scene.focalLandmark.x - pos.x, scene.focalLandmark.y - pos.y, scene.focalLandmark.z - pos.z), 2);
  return {
    sceneId, positionMeters: { ...pos }, yawDeg: scene.spawnYawDeg, pitchDeg: 0, rollDeg: 0, verticalFovDeg: 54,
    clampedToBounds: false, distanceToFocalMeters: dist, shotType: classifyVrShot(pos, 0, dist, 54),
  };
}

/** VR 헤드셋 6DoF 이동·회전·텔레포트·FOV 조절을 적용해 스카우팅 리그를 한 스텝 갱신한다. */
export function stepVrScoutingRig(
  rig: VrScoutingRigState, input: VrScoutingStepInput, sceneOverride?: VrScoutingSceneSpec,
): VrScoutingRigState {
  const scene = sceneOverride ?? VR_SCOUTING_SCENES[rig.sceneId];
  const nextYaw = (((rig.yawDeg + (input.yawDeltaDeg ?? 0) + 180) % 360) + 360) % 360 - 180;
  const nextPitch = clamp(rig.pitchDeg + (input.pitchDeltaDeg ?? 0), -80, 80);
  const nextRoll = clamp(rig.rollDeg + (input.rollDeltaDeg ?? 0), -35, 35);
  const nextFov = clamp(rig.verticalFovDeg + (input.fovDeltaDeg ?? 0), 24, 105);

  let rawX = rig.positionMeters.x;
  let rawY = rig.positionMeters.y;
  let rawZ = rig.positionMeters.z;
  if (input.teleportTarget) {
    rawX = input.teleportTarget.x; rawY = input.teleportTarget.y; rawZ = input.teleportTarget.z;
  } else {
    const yawRad = degToRad(nextYaw);
    const moveFwd = clamp(input.moveForwardMeters ?? 0, -12, 12);
    const moveRight = clamp(input.moveRightMeters ?? 0, -12, 12);
    rawX += -Math.sin(yawRad) * moveFwd + Math.cos(yawRad) * moveRight;
    rawZ += -Math.cos(yawRad) * moveFwd - Math.sin(yawRad) * moveRight;
    rawY += clamp(input.verticalOffsetMeters ?? 0, -4, 4);
  }

  const b = scene.walkBounds;
  const clampedX = clamp(rawX, b.minX, b.maxX);
  const clampedY = clamp(rawY, b.minY, b.maxY);
  const clampedZ = clamp(rawZ, b.minZ, b.maxZ);
  const clampedToBounds = Math.abs(clampedX - rawX) > 1e-4 || Math.abs(clampedY - rawY) > 1e-4 || Math.abs(clampedZ - rawZ) > 1e-4;
  const nextPos: Vec3Meters = { x: roundTo(clampedX, 3), y: roundTo(clampedY, 3), z: roundTo(clampedZ, 3) };
  const dist = roundTo(Math.hypot(scene.focalLandmark.x - nextPos.x, scene.focalLandmark.y - nextPos.y, scene.focalLandmark.z - nextPos.z), 2);

  return {
    sceneId: scene.id, positionMeters: nextPos, yawDeg: roundTo(nextYaw, 1), pitchDeg: roundTo(nextPitch, 1),
    rollDeg: roundTo(nextRoll, 1), verticalFovDeg: roundTo(nextFov, 1), clampedToBounds,
    distanceToFocalMeters: dist, shotType: classifyVrShot(nextPos, nextPitch, dist, nextFov),
  };
}

/** WebAudio API `PannerNode` 인스턴스에 HRTF 공간 음향 좌표를 직접 적용한다. */
export function applySpatialAudioToWebAudioPanner(panner: PannerNodeLike, config: WebAudioPannerConfig, audioCurrentTime = 0): void {
  panner.panningModel = config.panningModel;
  panner.distanceModel = config.distanceModel;
  panner.refDistance = config.refDistance;
  panner.maxDistance = config.maxDistance;
  panner.rolloffFactor = config.rolloffFactor;
  if (panner.positionX?.setValueAtTime) panner.positionX.setValueAtTime(config.positionX, audioCurrentTime);
  else if (panner.positionX) panner.positionX.value = config.positionX;
  if (panner.positionY?.setValueAtTime) panner.positionY.setValueAtTime(config.positionY, audioCurrentTime);
  else if (panner.positionY) panner.positionY.value = config.positionY;
  if (panner.positionZ?.setValueAtTime) panner.positionZ.setValueAtTime(config.positionZ, audioCurrentTime);
  else if (panner.positionZ) panner.positionZ.value = config.positionZ;
}

/** VR 스카우팅 앵글을 2D 웹툰 콘티 컷 카메라 프레임으로 스냅하고 3D 공간 음향(azimuth/elevation)을 산출한다. */
export function captureVrAngleToCutFrame(
  rig: VrScoutingRigState,
  options?: { readonly aspectRatio?: CutAspectRatio; readonly sceneOverride?: VrScoutingSceneSpec; readonly sequenceIndex?: number },
): VrCutFrameSnapshot {
  const scene = options?.sceneOverride ?? VR_SCOUTING_SCENES[rig.sceneId];
  const aspectRatio: CutAspectRatio = options?.aspectRatio ?? "9:16";
  const seq = Math.max(1, Math.round(options?.sequenceIndex ?? 1));
  const yawRad = degToRad(rig.yawDeg);
  const pitchRad = degToRad(rig.pitchDeg);
  const cosP = Math.cos(pitchRad);
  const sinP = Math.sin(pitchRad);
  const sinY = Math.sin(yawRad);
  const cosY = Math.cos(yawRad);

  const fwd: Vec3Meters = { x: -sinY * cosP, y: sinP, z: -cosY * cosP };
  const right: Vec3Meters = { x: cosY, y: 0, z: -sinY };
  const up: Vec3Meters = { x: sinY * sinP, y: cosP, z: cosY * sinP };
  const lookDist = Math.max(1.5, rig.distanceToFocalMeters);
  const lookAtTargetMeters: Vec3Meters = {
    x: roundTo(rig.positionMeters.x + fwd.x * lookDist, 3),
    y: roundTo(rig.positionMeters.y + fwd.y * lookDist, 3),
    z: roundTo(rig.positionMeters.z + fwd.z * lookDist, 3),
  };

  const tanHalfFov = Math.tan(degToRad(rig.verticalFovDeg) / 2);
  const equivalent35mmFocalLengthMm = roundTo(24 / (2 * tanHalfFov), 1);
  const dutchTiltActive = Math.abs(rig.rollDeg) >= 3;
  const horizonLineRatio = roundTo(clamp(0.5 + Math.tan(pitchRad) / (2 * tanHalfFov), 0.08, 0.92), 3);
  const toFocalX = scene.focalLandmark.x - rig.positionMeters.x;
  const toFocalY = scene.focalLandmark.y - rig.positionMeters.y;
  const toFocalZ = scene.focalLandmark.z - rig.positionMeters.z;
  const focalRight = toFocalX * right.x + toFocalY * right.y + toFocalZ * right.z;
  const focalForward = Math.max(0.25, toFocalX * fwd.x + toFocalY * fwd.y + toFocalZ * fwd.z);
  const vpX = roundTo(clamp(0.5 + focalRight / (2 * focalForward * tanHalfFov), 0.1, 0.9), 3);
  const dramaScore = Math.round(clamp(30 + Math.min(35, Math.abs(rig.pitchDeg) * 1.15) + Math.min(20, Math.abs(rig.rollDeg) * 1.2) + Math.min(20, Math.abs(rig.verticalFovDeg - 54) * 0.55), 20, 99));

  const spatialAudioSources: SpatialAudioSourceProjection[] = scene.audioCues.map((cue) => {
    const dx = cue.positionMeters.x - rig.positionMeters.x;
    const dy = cue.positionMeters.y - rig.positionMeters.y;
    const dz = cue.positionMeters.z - rig.positionMeters.z;
    const dist = Math.max(0.05, Math.hypot(dx, dy, dz));
    const relRight = dx * right.x + dy * right.y + dz * right.z;
    const relUp = dx * up.x + dy * up.y + dz * up.z;
    const relForward = dx * fwd.x + dy * fwd.y + dz * fwd.z;
    const clampedDist = Math.max(dist, cue.refDistanceMeters);
    return {
      cueId: cue.cueId, labelKo: cue.labelKo, labelEn: cue.labelEn,
      azimuthDeg: roundTo(radToDeg(Math.atan2(relRight, relForward)), 1),
      elevationDeg: roundTo(radToDeg(Math.atan2(relUp, Math.hypot(relRight, relForward))), 1),
      distanceMeters: roundTo(dist, 2),
      attenuationGain: roundTo(clamp(cue.refDistanceMeters / (cue.refDistanceMeters + cue.rolloffFactor * (clampedDist - cue.refDistanceMeters)), 0.02, 1), 3),
      webAudioPannerConfig: {
        panningModel: "HRTF", distanceModel: "inverse",
        positionX: roundTo(relRight, 3), positionY: roundTo(relUp, 3), positionZ: roundTo(-relForward, 3),
        refDistance: cue.refDistanceMeters, maxDistance: cue.maxDistanceMeters, rolloffFactor: cue.rolloffFactor,
      },
    };
  });

  return {
    snapshotId: `vr-cut-${scene.id}-${String(seq).padStart(2, "0")}`,
    sceneId: scene.id, sceneNameKo: scene.nameKo, sceneNameEn: scene.nameEn, aspectRatio,
    camera: {
      positionMeters: { ...rig.positionMeters }, lookAtTargetMeters,
      yawDeg: rig.yawDeg, pitchDeg: rig.pitchDeg, rollDeg: rig.rollDeg,
      verticalFovDeg: rig.verticalFovDeg, equivalent35mmFocalLengthMm, dutchTiltActive,
    },
    composition: {
      shotType: rig.shotType, horizonLineRatio, vanishingPointNormalized: { x: vpX, y: horizonLineRatio }, dramaScore,
      framingNotesKo: `${equivalent35mmFocalLengthMm}mm 환산 · 수평선 ${Math.round(horizonLineRatio * 100)}%${dutchTiltActive ? ` · 더치틸트 ${rig.rollDeg}°` : ""}`,
      framingNotesEn: `${equivalent35mmFocalLengthMm}mm eq. · Horizon ${Math.round(horizonLineRatio * 100)}%${dutchTiltActive ? ` · Dutch tilt ${rig.rollDeg} deg` : ""}`,
    },
    spatialAudioSources,
  };
}
