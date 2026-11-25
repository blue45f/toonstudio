/**
 * 실시간 무빙툰 릴스/쇼츠 2.5D 패럴랙스 카메라 모션 & 플랫폼 세이프존 검증 엔진 (Wave 40E).
 *
 * - 웹툰 컷을 5개 깊이 평면(bg-sky · mid-env · character · foreground-fx · speech-balloon)으로 분리해
 *   2.5D 원근 투영 행렬(3×3 아핀 + 4×4 CSS matrix3d)을 결정론적으로 산출한다.
 * - 5종 무빙툰 카메라 모션 프리셋과 30/60fps 결정론적 프레임 평가기(evaluateParallaxFrame)를 제공한다.
 * - 9:16 릴스/쇼츠/틱톡 및 16:9 유튜브 세이프존(우측 좋아요 레일 · 하단 캡션 · 플레이어 바) 침범을
 *   픽셀 단위로 자동 검증하고 무침범 보정 좌표(nudge)를 산출한다.
 */

export type ParallaxDepthPlaneId = "bg-sky" | "mid-env" | "character" | "foreground-fx" | "speech-balloon";
export type MovingtoonCameraPresetId = "ken-burns-drift" | "dolly-zoom-tension" | "action-impact-shake" | "vertical-pan-reveal" | "speedline-pulse";
export type MovingtoonFrameRate = 30 | 60;
export type ReelsAspectTarget = "reels-9x16" | "tiktok-9x16" | "shorts-9x16" | "youtube-16x9";
export type SafeZoneHazardKind = "top-hud" | "right-actions" | "bottom-caption" | "bottom-player-bar" | "right-channel-badge" | "edge-overscan";
export type SafeZoneSeverity = "pass" | "warning" | "critical";
export type Matrix3x3 = readonly [number, number, number, number, number, number, number, number, number];
export type Matrix4x4 = readonly [
  number, number, number, number, number, number, number, number,
  number, number, number, number, number, number, number, number,
];

export interface Rect2D {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ParallaxDepthPlaneProfile {
  readonly id: ParallaxDepthPlaneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly zIndex: number;
  readonly zDepth: number;
  readonly parallaxFactor: number;
  readonly shakeWeight: number;
  readonly dofBlurWeight: number;
  readonly safeZoneCritical: boolean;
}

export interface ParallaxLayerInput {
  readonly planeId: ParallaxDepthPlaneId;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly normalizedBounds: Rect2D;
  readonly zDepthOverride?: number;
  readonly parallaxOverride?: number;
  readonly safeAnchorLocked?: boolean;
  readonly baseOpacity?: number;
}

export interface MovingtoonCutScene {
  readonly sceneId: string;
  readonly episodeCode: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly durationSec: number;
  readonly focalLengthPx: number;
  readonly depthSeparationPx: number;
  readonly layers: readonly ParallaxLayerInput[];
}

export interface MovingtoonCameraPresetSpec {
  readonly id: MovingtoonCameraPresetId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly summaryKo: string;
  readonly summaryEn: string;
  readonly recommendedBpmRange: readonly [number, number];
  readonly baseZoomStart: number;
  readonly baseZoomEnd: number;
  readonly panAmplitudeXNorm: number;
  readonly panAmplitudeYNorm: number;
  readonly dollyShiftPx: number;
  readonly rollAmplitudeDeg: number;
  readonly shakePeakPx: number;
  readonly pulseCycles: number;
}

export interface SafeZoneHazardRect {
  readonly id: string;
  readonly kind: SafeZoneHazardKind;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly rect: Rect2D;
  readonly severity: "warning" | "critical";
}

export interface AspectSafeZoneProfile {
  readonly target: ReelsAspectTarget;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly aspectRatioLabel: string;
  readonly widthPx: number;
  readonly heightPx: number;
  readonly coreSafeRect: Rect2D;
  readonly hazards: readonly SafeZoneHazardRect[];
}

export interface CameraRigState {
  readonly xPx: number;
  readonly yPx: number;
  readonly zPx: number;
  readonly zoom: number;
  readonly rollDeg: number;
  readonly fovDeg: number;
  readonly shakeOffsetXpx: number;
  readonly shakeOffsetYpx: number;
}

export interface EvaluatedParallaxPlane {
  readonly planeId: ParallaxDepthPlaneId;
  readonly labelKo: string;
  readonly labelEn: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly zIndex: number;
  readonly zDepth: number;
  readonly parallaxFactor: number;
  readonly translateXpx: number;
  readonly translateYpx: number;
  readonly translateZpx: number;
  readonly scale: number;
  readonly rotationDeg: number;
  readonly opacity: number;
  readonly blurPx: number;
  readonly matrix3x3: Matrix3x3;
  readonly matrix4x4: Matrix4x4;
  readonly cssTransform: string;
  readonly projectedBounds: Rect2D;
  readonly safeZoneCritical: boolean;
}

export interface SafeZoneCollisionIssue {
  readonly planeId: ParallaxDepthPlaneId;
  readonly layerTitleKo: string;
  readonly layerTitleEn: string;
  readonly hazardId: string;
  readonly hazardKind: SafeZoneHazardKind;
  readonly hazardLabelKo: string;
  readonly hazardLabelEn: string;
  readonly overlapAreaPx2: number;
  readonly overlapRatio: number;
  readonly severity: "warning" | "critical";
  readonly recommendedNudgePx: { readonly dx: number; readonly dy: number };
}

export interface SafeZoneValidationReport {
  readonly target: ReelsAspectTarget;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly coreSafeRect: Rect2D;
  readonly status: SafeZoneSeverity;
  readonly passed: boolean;
  readonly totalOverlapAreaPx2: number;
  readonly criticalCount: number;
  readonly warningCount: number;
  readonly issues: readonly SafeZoneCollisionIssue[];
  readonly summaryKo: string;
  readonly summaryEn: string;
}

export interface EvaluateParallaxFrameOptions {
  readonly presetId: MovingtoonCameraPresetId;
  readonly frameIndex: number;
  readonly fps: MovingtoonFrameRate;
  readonly aspectTarget: ReelsAspectTarget;
  readonly intensity?: number;
  readonly reducedMotion?: boolean;
  readonly extraSafeOffsetByPlane?: Readonly<Partial<Record<ParallaxDepthPlaneId, { readonly dx: number; readonly dy: number }>>>;
}

export interface EvaluatedParallaxFrame {
  readonly sceneId: string;
  readonly presetId: MovingtoonCameraPresetId;
  readonly aspectTarget: ReelsAspectTarget;
  readonly viewportWidthPx: number;
  readonly viewportHeightPx: number;
  readonly fps: MovingtoonFrameRate;
  readonly frameIndex: number;
  readonly totalFrames: number;
  readonly timestampSec: number;
  readonly timestampMs: number;
  readonly normalizedProgress: number;
  readonly easedProgress: number;
  readonly reducedMotion: boolean;
  readonly camera: CameraRigState;
  readonly planes: readonly EvaluatedParallaxPlane[];
  readonly safeZone: SafeZoneValidationReport;
}

export interface ParallaxSequenceAudit {
  readonly sceneId: string;
  readonly presetId: MovingtoonCameraPresetId;
  readonly aspectTarget: ReelsAspectTarget;
  readonly fps: MovingtoonFrameRate;
  readonly totalFrames: number;
  readonly sampledFrameCount: number;
  readonly worstFrameIndex: number;
  readonly worstStatus: SafeZoneSeverity;
  readonly maxOverlapAreaPx2: number;
  readonly offendingFrameIndices: readonly number[];
  readonly frames: readonly EvaluatedParallaxFrame[];
}

export const PARALLAX_DEPTH_PLANES: readonly ParallaxDepthPlaneId[] = [
  "bg-sky",
  "mid-env",
  "character",
  "foreground-fx",
  "speech-balloon",
] as const;

export const PARALLAX_DEPTH_PLANE_PROFILES: Readonly<Record<ParallaxDepthPlaneId, ParallaxDepthPlaneProfile>> = {
  "bg-sky": {
    id: "bg-sky", labelKo: "원경 하늘·노을", labelEn: "BG Sky",
    zIndex: 1, zDepth: -2.0, parallaxFactor: 0.24, shakeWeight: 0.25, dofBlurWeight: 1.8, safeZoneCritical: false,
  },
  "mid-env": {
    id: "mid-env", labelKo: "중경 배경·구조물", labelEn: "Mid Env",
    zIndex: 2, zDepth: -0.9, parallaxFactor: 0.56, shakeWeight: 0.55, dofBlurWeight: 0.85, safeZoneCritical: false,
  },
  character: {
    id: "character", labelKo: "주역 인물", labelEn: "Character",
    zIndex: 3, zDepth: 0.0, parallaxFactor: 1.0, shakeWeight: 0.85, dofBlurWeight: 0.0, safeZoneCritical: true,
  },
  "foreground-fx": {
    id: "foreground-fx", labelKo: "전경 이펙트·집중선", labelEn: "Foreground FX",
    zIndex: 4, zDepth: 0.72, parallaxFactor: 1.48, shakeWeight: 1.35, dofBlurWeight: 1.1, safeZoneCritical: false,
  },
  "speech-balloon": {
    id: "speech-balloon", labelKo: "말풍선·대사 레이어", labelEn: "Speech Balloon",
    zIndex: 5, zDepth: 1.12, parallaxFactor: 0.42, shakeWeight: 0.35, dofBlurWeight: 0.0, safeZoneCritical: true,
  },
};

export const MOVINGTOON_CAMERA_PRESETS: readonly MovingtoonCameraPresetId[] = [
  "ken-burns-drift",
  "dolly-zoom-tension",
  "action-impact-shake",
  "vertical-pan-reveal",
  "speedline-pulse",
] as const;

export const CAMERA_PRESET_CATALOG: Readonly<Record<MovingtoonCameraPresetId, MovingtoonCameraPresetSpec>> = {
  "ken-burns-drift": {
    id: "ken-burns-drift", labelKo: "켄 번즈 드리프트", labelEn: "Ken Burns Drift",
    summaryKo: "완만한 대각선 패닝과 1.0→1.14 서사 줌인으로 감정선을 끌어올립니다.",
    summaryEn: "Gentle diagonal pan with a 1.0→1.14 push-in for emotional beats.",
    recommendedBpmRange: [78, 108], baseZoomStart: 1.0, baseZoomEnd: 1.14,
    panAmplitudeXNorm: 0.045, panAmplitudeYNorm: -0.028, dollyShiftPx: 38,
    rollAmplitudeDeg: 0.7, shakePeakPx: 0, pulseCycles: 0,
  },
  "dolly-zoom-tension": {
    id: "dolly-zoom-tension", labelKo: "돌리 줌 긴장감", labelEn: "Dolly-Zoom Tension",
    summaryKo: "인물 크기는 고정한 채 배경 원근을 급격히 압축해 서스펜스를 극대화합니다.",
    summaryEn: "Vertigo dolly-zoom keeps character scale locked while compressing background perspective.",
    recommendedBpmRange: [95, 130], baseZoomStart: 1.0, baseZoomEnd: 1.24,
    panAmplitudeXNorm: 0.012, panAmplitudeYNorm: -0.01, dollyShiftPx: -185,
    rollAmplitudeDeg: 1.15, shakePeakPx: 2.2, pulseCycles: 1,
  },
  "action-impact-shake": {
    id: "action-impact-shake", labelKo: "액션 임팩트 셰이크", labelEn: "Action Impact Shake",
    summaryKo: "타격 순간 급속 펀치인과 감쇠 다중주파수 진동으로 타격감을 전달합니다.",
    summaryEn: "Sharp punch-in with damped multi-frequency impulse shake at the strike beat.",
    recommendedBpmRange: [124, 165], baseZoomStart: 1.02, baseZoomEnd: 1.2,
    panAmplitudeXNorm: 0.022, panAmplitudeYNorm: -0.018, dollyShiftPx: 64,
    rollAmplitudeDeg: 2.4, shakePeakPx: 22, pulseCycles: 2,
  },
  "vertical-pan-reveal": {
    id: "vertical-pan-reveal", labelKo: "세로 팬 리빌", labelEn: "Vertical Pan Reveal",
    summaryKo: "세로 스크롤 웹툰의 상→하 시선 이동을 5층 시차로 부드럽게 재현합니다.",
    summaryEn: "Top-to-bottom vertical webtoon reveal with staggered 5-plane depth parallax.",
    recommendedBpmRange: [90, 128], baseZoomStart: 1.05, baseZoomEnd: 1.08,
    panAmplitudeXNorm: 0.008, panAmplitudeYNorm: 0.11, dollyShiftPx: 24,
    rollAmplitudeDeg: 0.25, shakePeakPx: 0, pulseCycles: 0,
  },
  "speedline-pulse": {
    id: "speedline-pulse", labelKo: "스피드라인 펄스", labelEn: "Speedline Pulse",
    summaryKo: "비트 박자에 맞춰 전경 집중선과 방사형 줌 펄스를 주기적으로 분출합니다.",
    summaryEn: "Rhythmic radial zoom pulse and foreground speedline burst synced to beats.",
    recommendedBpmRange: [128, 175], baseZoomStart: 1.03, baseZoomEnd: 1.18,
    panAmplitudeXNorm: 0.018, panAmplitudeYNorm: -0.014, dollyShiftPx: 82,
    rollAmplitudeDeg: 1.4, shakePeakPx: 11, pulseCycles: 4,
  },
};

export const ASPECT_SAFE_ZONE_PROFILES: Readonly<Record<ReelsAspectTarget, AspectSafeZoneProfile>> = {
  "reels-9x16": {
    target: "reels-9x16", labelKo: "9:16 릴스·쇼츠 통합", labelEn: "9:16 Reels / Shorts",
    aspectRatioLabel: "9:16", widthPx: 1080, heightPx: 1920,
    coreSafeRect: { x: 60, y: 250, width: 840, height: 1248 },
    hazards: [
      { id: "reels-top-hud", kind: "top-hud", labelKo: "상단 카메라·팔로우 HUD", labelEn: "Top HUD & Notch", rect: { x: 0, y: 0, width: 1080, height: 250 }, severity: "warning" },
      { id: "reels-right-actions", kind: "right-actions", labelKo: "우측 좋아요·댓글·공유 레일", labelEn: "Right Like/Comment Rail", rect: { x: 900, y: 760, width: 180, height: 780 }, severity: "critical" },
      { id: "reels-bottom-caption", kind: "bottom-caption", labelKo: "하단 캡션·계정·오디오 영역", labelEn: "Bottom Caption & Audio Bar", rect: { x: 0, y: 1498, width: 1080, height: 422 }, severity: "critical" },
    ],
  },
  "tiktok-9x16": {
    target: "tiktok-9x16", labelKo: "9:16 틱톡 엄격 세이프존", labelEn: "9:16 TikTok Strict",
    aspectRatioLabel: "9:16", widthPx: 1080, heightPx: 1920,
    coreSafeRect: { x: 60, y: 270, width: 816, height: 1190 },
    hazards: [
      { id: "tiktok-top-hud", kind: "top-hud", labelKo: "상단 추천·팔로잉 탭", labelEn: "Top For-You Tab", rect: { x: 0, y: 0, width: 1080, height: 270 }, severity: "warning" },
      { id: "tiktok-right-actions", kind: "right-actions", labelKo: "우측 좋아요·북마크·음반 레일", labelEn: "Right Action Rail", rect: { x: 876, y: 690, width: 204, height: 830 }, severity: "critical" },
      { id: "tiktok-bottom-caption", kind: "bottom-caption", labelKo: "하단 설명·해시태그·검색 바", labelEn: "Bottom Caption & Search Bar", rect: { x: 0, y: 1460, width: 1080, height: 460 }, severity: "critical" },
    ],
  },
  "shorts-9x16": {
    target: "shorts-9x16", labelKo: "9:16 유튜브 쇼츠", labelEn: "9:16 YouTube Shorts",
    aspectRatioLabel: "9:16", widthPx: 1080, heightPx: 1920,
    coreSafeRect: { x: 64, y: 230, width: 848, height: 1290 },
    hazards: [
      { id: "shorts-top-hud", kind: "top-hud", labelKo: "상단 쇼츠 검색·메뉴 HUD", labelEn: "Top Shorts Bar", rect: { x: 0, y: 0, width: 1080, height: 230 }, severity: "warning" },
      { id: "shorts-right-actions", kind: "right-actions", labelKo: "우측 좋아요·싫어요·댓글 레일", labelEn: "Right Action Rail", rect: { x: 912, y: 800, width: 168, height: 740 }, severity: "critical" },
      { id: "shorts-bottom-caption", kind: "bottom-caption", labelKo: "하단 채널·구독·제목 캡션", labelEn: "Bottom Channel & Caption", rect: { x: 0, y: 1520, width: 1080, height: 400 }, severity: "critical" },
    ],
  },
  "youtube-16x9": {
    target: "youtube-16x9", labelKo: "16:9 유튜브 가로형", labelEn: "16:9 YouTube Standard",
    aspectRatioLabel: "16:9", widthPx: 1920, heightPx: 1080,
    coreSafeRect: { x: 96, y: 54, width: 1614, height: 896 },
    hazards: [
      { id: "yt-top-overscan", kind: "top-hud", labelKo: "상단 제목·타이틀 세이프 여백", labelEn: "Top Title Safe Margin", rect: { x: 0, y: 0, width: 1920, height: 54 }, severity: "warning" },
      { id: "yt-right-badge", kind: "right-channel-badge", labelKo: "우하단 채널 워터마크·카드 구역", labelEn: "Bottom-Right Watermark Zone", rect: { x: 1710, y: 820, width: 210, height: 130 }, severity: "warning" },
      { id: "yt-bottom-player", kind: "bottom-player-bar", labelKo: "하단 재생 시크바·자막 컨트롤", labelEn: "Bottom Player Scrubber Bar", rect: { x: 0, y: 950, width: 1920, height: 130 }, severity: "critical" },
    ],
  },
};

export const DEFAULT_MOVINGTOON_SCENES: readonly MovingtoonCutScene[] = [
  {
    sceneId: "ep12-rooftop-clash",
    episodeCode: "EP.12 #18",
    titleKo: "옥상 비 내리는 대치 컷 (세이프존 경고 포함)",
    titleEn: "EP.12 Rooftop Confrontation (Safe-Zone Hazard Demo)",
    durationSec: 6,
    focalLengthPx: 920,
    depthSeparationPx: 145,
    layers: [
      { planeId: "bg-sky", titleKo: "폭풍 전야 먹구름 하늘", titleEn: "Stormy Dusk Sky", normalizedBounds: { x: -0.06, y: -0.04, width: 1.12, height: 0.62 } },
      { planeId: "mid-env", titleKo: "옥상 난간·도심 실루엣", titleEn: "Rooftop Rail & Skyline", normalizedBounds: { x: -0.04, y: 0.24, width: 1.08, height: 0.56 } },
      { planeId: "character", titleKo: "주인공 한서준 클로즈업", titleEn: "Protagonist Close-Up", normalizedBounds: { x: 0.16, y: 0.22, width: 0.58, height: 0.52 } },
      { planeId: "foreground-fx", titleKo: "빗줄기·집중선 이펙트", titleEn: "Rain Streaks & Speedlines", normalizedBounds: { x: 0.0, y: 0.05, width: 1.0, height: 0.9 }, baseOpacity: 0.88 },
      { planeId: "speech-balloon", titleKo: "결정적 대사 말풍선 (우측·하단 침범)", titleEn: "Climax Speech Balloon (Right/Bottom Overlap)", normalizedBounds: { x: 0.58, y: 0.72, width: 0.36, height: 0.14 } },
    ],
  },
  {
    sceneId: "ep12-safe-master",
    episodeCode: "EP.12 #19",
    titleKo: "릴스 세이프존 보정 완료 마스터 컷",
    titleEn: "EP.12 Safe-Zone Fitted Master Cut",
    durationSec: 6,
    focalLengthPx: 920,
    depthSeparationPx: 145,
    layers: [
      { planeId: "bg-sky", titleKo: "새벽 안개 하늘", titleEn: "Dawn Mist Sky", normalizedBounds: { x: -0.05, y: -0.03, width: 1.1, height: 0.6 } },
      { planeId: "mid-env", titleKo: "성당 아치·돌계단", titleEn: "Cathedral Arch & Steps", normalizedBounds: { x: -0.03, y: 0.2, width: 1.06, height: 0.58 } },
      { planeId: "character", titleKo: "주인공·상대역 2샷", titleEn: "Two-Shot Subject", normalizedBounds: { x: 0.14, y: 0.24, width: 0.56, height: 0.46 } },
      { planeId: "foreground-fx", titleKo: "흩날리는 잿빛 꽃잎", titleEn: "Drifting Ash Petals", normalizedBounds: { x: 0.02, y: 0.1, width: 0.96, height: 0.8 }, baseOpacity: 0.9 },
      { planeId: "speech-balloon", titleKo: "중앙 상단 세이프 말풍선", titleEn: "Center-Safe Speech Balloon", normalizedBounds: { x: 0.14, y: 0.19, width: 0.54, height: 0.11 }, safeAnchorLocked: true },
    ],
  },
];

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function roundTo(value: number, digits = 4): number {
  const factor = Math.pow(10, digits);
  const rounded = Math.round(value * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function easeInOutCubic(t: number): number {
  const c = clamp(t, 0, 1);
  return c < 0.5 ? 4 * c * c * c : 1 - Math.pow(-2 * c + 2, 3) / 2;
}

function easeOutQuint(t: number): number {
  const c = clamp(t, 0, 1);
  return 1 - Math.pow(1 - c, 5);
}

/** 두 사각형의 교차 면적(px²)을 계산한다. */
export function computeRectOverlapAreaPx2(a: Rect2D, b: Rect2D): number {
  const xOverlap = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const yOverlap = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return roundTo(xOverlap * yOverlap, 2);
}

/** 주어진 요소를 대상 플랫폼 코어 세이프존 안으로 자동 이동시켜 0px² 침범 좌표를 반환한다. */
export function autoFitElementToSafeZone(
  rect: Rect2D,
  target: ReelsAspectTarget,
): { readonly fittedRect: Rect2D; readonly nudgePx: { readonly dx: number; readonly dy: number } } {
  const safe = ASPECT_SAFE_ZONE_PROFILES[target].coreSafeRect;
  const maxWidth = Math.min(rect.width, safe.width);
  const maxHeight = Math.min(rect.height, safe.height);
  const clampedX = clamp(rect.x, safe.x, safe.x + safe.width - maxWidth);
  const clampedY = clamp(rect.y, safe.y, safe.y + safe.height - maxHeight);

  const fittedRect: Rect2D = {
    x: roundTo(clampedX, 2),
    y: roundTo(clampedY, 2),
    width: roundTo(maxWidth, 2),
    height: roundTo(maxHeight, 2),
  };
  return {
    fittedRect,
    nudgePx: { dx: roundTo(fittedRect.x - rect.x, 2), dy: roundTo(fittedRect.y - rect.y, 2) },
  };
}

function evaluateCameraRig(
  preset: MovingtoonCameraPresetSpec,
  progress: number,
  viewportWidth: number,
  viewportHeight: number,
  intensity: number,
  reducedMotion: boolean,
): { readonly camera: CameraRigState; readonly easedProgress: number } {
  const t = clamp(progress, 0, 1);
  const amp = reducedMotion ? 0.12 : clamp(intensity, 0.25, 2.0);
  const eased = easeInOutCubic(t);

  let xPx: number;
  let yPx: number;
  let zPx: number;
  let zoom: number;
  let rollDeg: number;
  let shakeOffsetXpx = 0;
  let shakeOffsetYpx = 0;
  let fovDeg = 48;

  if (preset.id === "ken-burns-drift") {
    xPx = (eased - 0.5) * viewportWidth * preset.panAmplitudeXNorm * amp;
    yPx = (eased - 0.5) * viewportHeight * preset.panAmplitudeYNorm * amp;
    zPx = eased * preset.dollyShiftPx * amp;
    zoom = 1 + (preset.baseZoomStart - 1 + (preset.baseZoomEnd - preset.baseZoomStart) * eased) * amp;
    rollDeg = Math.sin(t * Math.PI) * preset.rollAmplitudeDeg * amp;
  } else if (preset.id === "dolly-zoom-tension") {
    const curve = easeInOutCubic(t);
    xPx = Math.sin(t * Math.PI * 2) * viewportWidth * preset.panAmplitudeXNorm * amp;
    yPx = (curve - 0.5) * viewportHeight * preset.panAmplitudeYNorm * amp;
    zPx = curve * preset.dollyShiftPx * amp;
    zoom = 1 + (preset.baseZoomEnd - 1) * curve * amp;
    fovDeg = roundTo(48 - 14 * curve * amp, 2);
    rollDeg = Math.sin(t * Math.PI) * preset.rollAmplitudeDeg * amp;
    if (!reducedMotion) {
      shakeOffsetXpx = Math.sin(t * Math.PI * 14) * preset.shakePeakPx * curve * amp;
      shakeOffsetYpx = Math.cos(t * Math.PI * 11) * preset.shakePeakPx * 0.7 * curve * amp;
    }
  } else if (preset.id === "action-impact-shake") {
    const impactCenter = 0.18;
    const punch = t < impactCenter
      ? easeOutQuint(t / impactCenter)
      : 1 - 0.35 * easeInOutCubic((t - impactCenter) / (1 - impactCenter));
    const decay = t >= impactCenter ? Math.exp(-5.4 * (t - impactCenter)) : (t / impactCenter) * 0.25;
    xPx = (punch - 0.35) * viewportWidth * preset.panAmplitudeXNorm * amp;
    yPx = (punch - 0.35) * viewportHeight * preset.panAmplitudeYNorm * amp;
    zPx = punch * preset.dollyShiftPx * amp;
    zoom = 1 + (preset.baseZoomEnd - 1) * punch * amp;
    rollDeg = Math.sin(t * Math.PI * 7) * preset.rollAmplitudeDeg * decay * amp;
    if (!reducedMotion) {
      const dt = Math.max(0, t - impactCenter);
      shakeOffsetXpx = (Math.cos(dt * 71.0) * 0.65 + Math.cos(dt * 113.0) * 0.35) * preset.shakePeakPx * decay * amp;
      shakeOffsetYpx = (Math.cos(dt * 63.0 + 0.4) * 0.6 + Math.sin(dt * 97.0 + 0.8) * 0.4) * preset.shakePeakPx * decay * amp;
    }
  } else if (preset.id === "vertical-pan-reveal") {
    xPx = Math.sin(t * Math.PI) * viewportWidth * preset.panAmplitudeXNorm * amp;
    yPx = (eased - 0.5) * viewportHeight * preset.panAmplitudeYNorm * amp;
    zPx = eased * preset.dollyShiftPx * amp;
    zoom = 1 + (preset.baseZoomStart - 1 + (preset.baseZoomEnd - preset.baseZoomStart) * eased) * amp;
    rollDeg = Math.sin(t * Math.PI) * preset.rollAmplitudeDeg * amp;
  } else {
    const pulseWave = Math.pow(Math.max(0, Math.sin(t * Math.PI * preset.pulseCycles)), 2);
    xPx = Math.sin(t * Math.PI * 2) * viewportWidth * preset.panAmplitudeXNorm * amp;
    yPx = Math.cos(t * Math.PI * 2) * viewportHeight * preset.panAmplitudeYNorm * amp;
    zPx = (0.35 * eased + 0.65 * pulseWave) * preset.dollyShiftPx * amp;
    zoom = 1 + (preset.baseZoomStart - 1 + (preset.baseZoomEnd - preset.baseZoomStart) * (0.4 * eased + 0.6 * pulseWave)) * amp;
    rollDeg = Math.sin(t * Math.PI * preset.pulseCycles) * preset.rollAmplitudeDeg * amp;
    if (!reducedMotion) {
      shakeOffsetXpx = Math.sin(t * 89.0) * preset.shakePeakPx * pulseWave * amp;
      shakeOffsetYpx = Math.cos(t * 73.0) * preset.shakePeakPx * 0.8 * pulseWave * amp;
    }
  }

  return {
    easedProgress: roundTo(eased, 5),
    camera: {
      xPx: roundTo(xPx, 3),
      yPx: roundTo(yPx, 3),
      zPx: roundTo(zPx, 3),
      zoom: roundTo(zoom, 5),
      rollDeg: roundTo(reducedMotion ? 0 : rollDeg, 3),
      fovDeg: roundTo(fovDeg, 2),
      shakeOffsetXpx: roundTo(shakeOffsetXpx, 3),
      shakeOffsetYpx: roundTo(shakeOffsetYpx, 3),
    },
  };
}

function buildTransformMatrices(
  tx: number,
  ty: number,
  tz: number,
  scale: number,
  rotationDeg: number,
  focalLengthPx: number,
): { readonly matrix3x3: Matrix3x3; readonly matrix4x4: Matrix4x4; readonly cssTransform: string } {
  const rad = (rotationDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const a = roundTo(cos * scale, 6);
  const b = roundTo(sin * scale, 6);
  const c = roundTo(-sin * scale, 6);
  const d = roundTo(cos * scale, 6);
  const rx = roundTo(tx, 3);
  const ry = roundTo(ty, 3);
  const rz = roundTo(tz, 3);
  const invPerspective = focalLengthPx > 0 ? roundTo(-1 / focalLengthPx, 7) : 0;

  const matrix3x3: Matrix3x3 = [a, c, rx, b, d, ry, 0, 0, 1];
  const matrix4x4: Matrix4x4 = [
    a, b, 0, 0,
    c, d, 0, 0,
    0, 0, 1, invPerspective,
    rx, ry, rz, 1,
  ];
  const cssTransform = `translate3d(${rx}px, ${ry}px, ${rz}px) scale(${roundTo(scale, 4)}) rotate(${roundTo(rotationDeg, 3)}deg)`;
  return { matrix3x3, matrix4x4, cssTransform };
}

function projectBounds(baseRect: Rect2D, tx: number, ty: number, scale: number, rotationDeg: number): Rect2D {
  const cx = baseRect.x + baseRect.width / 2;
  const cy = baseRect.y + baseRect.height / 2;
  // 중심 회전 후 네 모서리를 둘러싼 경계로 회전한 가장자리까지 검사한다.
  const rad = rotationDeg * Math.PI / 180;
  const scaledW = Math.abs(Math.cos(rad) * baseRect.width * scale) + Math.abs(Math.sin(rad) * baseRect.height * scale);
  const scaledH = Math.abs(Math.sin(rad) * baseRect.width * scale) + Math.abs(Math.cos(rad) * baseRect.height * scale);
  return {
    x: roundTo(cx + tx - scaledW / 2, 2),
    y: roundTo(cy + ty - scaledH / 2, 2),
    width: roundTo(scaledW, 2),
    height: roundTo(scaledH, 2),
  };
}

/** 5개 깊이 평면의 투영 경계가 대상 플랫폼 세이프존(우측 좋아요 · 하단 캡션 등)을 침범하는지 검증한다. */
export function validateSafeZoneLayout(
  planes: readonly EvaluatedParallaxPlane[],
  target: ReelsAspectTarget,
): SafeZoneValidationReport {
  const profile = ASPECT_SAFE_ZONE_PROFILES[target];
  const issues: SafeZoneCollisionIssue[] = [];
  let totalOverlapAreaPx2 = 0;

  for (const plane of planes) {
    if (!plane.safeZoneCritical) continue;
    const bounds = plane.projectedBounds;
    if (![bounds.x, bounds.y, bounds.width, bounds.height].every(Number.isFinite) || bounds.width <= 0 || bounds.height <= 0) {
      throw new RangeError("주요 요소의 경계 좌표는 유한하고 크기는 양수여야 합니다.");
    }
    const planeArea = bounds.width * bounds.height;
    const { nudgePx } = autoFitElementToSafeZone(plane.projectedBounds, target);

    const visibleArea = computeRectOverlapAreaPx2(plane.projectedBounds, { x: 0, y: 0, width: profile.widthPx, height: profile.heightPx });
    const outsideArea = Math.max(0, planeArea - visibleArea);
    if (outsideArea > 0.01) {
      totalOverlapAreaPx2 = roundTo(totalOverlapAreaPx2 + outsideArea, 2);
      issues.push({
        planeId: plane.planeId, layerTitleKo: plane.titleKo, layerTitleEn: plane.titleEn,
        hazardId: "viewport-outside", hazardKind: "edge-overscan", hazardLabelKo: "화면 밖 잘림", hazardLabelEn: "Outside viewport",
        overlapAreaPx2: roundTo(outsideArea, 2), overlapRatio: roundTo(outsideArea / planeArea, 4), severity: "critical", recommendedNudgePx: nudgePx,
      });
    }
    for (const hazard of profile.hazards) {
      const overlapAreaPx2 = computeRectOverlapAreaPx2(plane.projectedBounds, hazard.rect);
      if (overlapAreaPx2 <= 0) continue;
      totalOverlapAreaPx2 = roundTo(totalOverlapAreaPx2 + overlapAreaPx2, 2);
      const overlapRatio = roundTo(clamp(overlapAreaPx2 / planeArea, 0, 1), 4);
      const severity: "warning" | "critical" =
        hazard.severity === "critical" || overlapRatio >= 0.08 ? "critical" : "warning";

      issues.push({
        planeId: plane.planeId,
        layerTitleKo: plane.titleKo,
        layerTitleEn: plane.titleEn,
        hazardId: hazard.id,
        hazardKind: hazard.kind,
        hazardLabelKo: hazard.labelKo,
        hazardLabelEn: hazard.labelEn,
        overlapAreaPx2,
        overlapRatio,
        severity,
        recommendedNudgePx: nudgePx,
      });
    }
  }

  const criticalCount = issues.filter((issue) => issue.severity === "critical").length;
  const warningCount = issues.filter((issue) => issue.severity === "warning").length;
  const status: SafeZoneSeverity = criticalCount > 0 ? "critical" : warningCount > 0 ? "warning" : "pass";

  return {
    target,
    viewportWidthPx: profile.widthPx,
    viewportHeightPx: profile.heightPx,
    coreSafeRect: profile.coreSafeRect,
    status,
    passed: status === "pass",
    totalOverlapAreaPx2,
    criticalCount,
    warningCount,
    issues,
    summaryKo: status === "pass"
      ? `${profile.labelKo} 현재 프레임 예제 경계 통과 (주요 인물·말풍선 UI 겹침·화면 이탈 0px²)`
      : `${profile.labelKo} 세이프존 침범 ${issues.length}건 감지 (치명 ${criticalCount} · 주의 ${warningCount}, 총 ${Math.round(totalOverlapAreaPx2)}px²)`,
    summaryEn: status === "pass"
      ? `${profile.labelEn} current-frame example bounds pass (0px² UI overlap or viewport clipping)`
      : `${issues.length} safe-zone collision(s) detected on ${profile.labelEn} (${criticalCount} critical, ${warningCount} warning)`,
  };
}

/**
 * 30/60fps 결정론적 2.5D 패럴랙스 프레임 평가기.
 * 동일한 입력(씬 · 프리셋 · 프레임 번호 · FPS · 화면비)은 항상 비트 단위로 동일한 행렬과 세이프존 리포트를 반환한다.
 */
export function evaluateParallaxFrame(
  scene: MovingtoonCutScene,
  options: EvaluateParallaxFrameOptions,
): EvaluatedParallaxFrame {
  if ((options.fps !== 30 && options.fps !== 60) || !Number.isFinite(scene.durationSec) || scene.durationSec <= 0 ||
      !Number.isFinite(options.frameIndex) || !Number.isFinite(options.intensity ?? 1)) {
    throw new RangeError("프레임·길이·강도는 유한한 값이어야 하며 FPS는 30 또는 60이어야 합니다.");
  }
  const fps = options.fps;
  const durationSec = Math.max(0.5, scene.durationSec);
  const totalFrames = Math.max(1, Math.round(durationSec * fps));
  const frameIndex = clamp(Math.floor(options.frameIndex), 0, totalFrames - 1);
  const normalizedProgress = totalFrames > 1 ? frameIndex / (totalFrames - 1) : 0;
  const timestampSec = roundTo(frameIndex / fps, 4);
  const timestampMs = Math.round((frameIndex / fps) * 1000);
  const reducedMotion = Boolean(options.reducedMotion);
  const intensity = options.intensity ?? 1.0;

  const profile = ASPECT_SAFE_ZONE_PROFILES[options.aspectTarget];
  const preset = CAMERA_PRESET_CATALOG[options.presetId];
  const { camera, easedProgress } = evaluateCameraRig(
    preset, normalizedProgress, profile.widthPx, profile.heightPx, intensity, reducedMotion,
  );

  const layerMap = new Map<ParallaxDepthPlaneId, ParallaxLayerInput>();
  for (const layer of scene.layers) layerMap.set(layer.planeId, layer);

  const focalLengthPx = Math.max(320, scene.focalLengthPx);
  const depthSepPx = Math.max(40, scene.depthSeparationPx);

  const planes: EvaluatedParallaxPlane[] = PARALLAX_DEPTH_PLANES.map((planeId) => {
    const planeProfile = PARALLAX_DEPTH_PLANE_PROFILES[planeId];
    const input = layerMap.get(planeId);
    const zDepth = input?.zDepthOverride ?? planeProfile.zDepth;
    const parallaxFactor = input?.parallaxOverride ?? planeProfile.parallaxFactor;
    const locked = Boolean(input?.safeAnchorLocked);

    const baseRect: Rect2D = input
      ? {
          x: input.normalizedBounds.x * profile.widthPx,
          y: input.normalizedBounds.y * profile.heightPx,
          width: input.normalizedBounds.width * profile.widthPx,
          height: input.normalizedBounds.height * profile.heightPx,
        }
      : { x: 0, y: 0, width: profile.widthPx, height: profile.heightPx };

    const effectiveDepthPx = zDepth * depthSepPx;
    const cameraDistance = Math.max(240, focalLengthPx - (effectiveDepthPx + camera.zPx));
    const neutralDistance = Math.max(240, focalLengthPx - effectiveDepthPx);
    let planeScale: number;

    if (options.presetId === "dolly-zoom-tension") {
      // 실제 광학 돌리-줌(Vertigo) 공식: M(z) = (D0(z) / D1(z)) * (D1(0) / D0(0))
      const lensZoomCompensation = Math.max(240, focalLengthPx - camera.zPx) / focalLengthPx;
      const opticalMagnification = (neutralDistance / cameraDistance) * lensZoomCompensation;
      planeScale = locked
        ? 1.0
        : roundTo(1 + (opticalMagnification - 1) * 1.85 + (-zDepth * 0.08 * (camera.zoom - 1)), 5);
    } else if (options.presetId === "speedline-pulse" && planeId === "foreground-fx") {
      planeScale = roundTo(1 + (camera.zoom - 1) * 1.45, 5);
    } else {
      const perspectiveRatio = neutralDistance / cameraDistance;
      planeScale = locked
        ? 1.0
        : roundTo(1 + (camera.zoom - 1) * (0.45 + 0.55 * parallaxFactor) + (perspectiveRatio - 1) * 0.45, 5);
    }

    const extraOffset = options.extraSafeOffsetByPlane?.[planeId];
    const tx = (locked ? 0 : -(camera.xPx * parallaxFactor) + camera.shakeOffsetXpx * planeProfile.shakeWeight) + (extraOffset?.dx ?? 0);
    const ty = (locked ? 0 : -(camera.yPx * parallaxFactor) + camera.shakeOffsetYpx * planeProfile.shakeWeight) + (extraOffset?.dy ?? 0);
    const tz = roundTo(effectiveDepthPx + camera.zPx * (locked ? 0 : 0.25), 2);
    const rotationDeg = locked ? 0 : roundTo(camera.rollDeg * (0.35 + 0.65 * planeProfile.shakeWeight), 3);
    const blurPx = reducedMotion || locked
      ? 0
      : roundTo(Math.abs(zDepth) * planeProfile.dofBlurWeight * Math.max(0.2, camera.zoom - 0.85), 2);
    const opacity = roundTo(clamp(input?.baseOpacity ?? 1.0, 0, 1), 3);
    const { matrix3x3, matrix4x4, cssTransform } = buildTransformMatrices(tx, ty, tz, planeScale, rotationDeg, focalLengthPx);
    const projectedBounds = projectBounds(baseRect, tx, ty, planeScale, rotationDeg);

    return {
      planeId, labelKo: planeProfile.labelKo, labelEn: planeProfile.labelEn,
      titleKo: input?.titleKo ?? planeProfile.labelKo, titleEn: input?.titleEn ?? planeProfile.labelEn,
      zIndex: planeProfile.zIndex, zDepth, parallaxFactor,
      translateXpx: roundTo(tx, 3), translateYpx: roundTo(ty, 3), translateZpx: tz,
      scale: planeScale, rotationDeg, opacity, blurPx, matrix3x3, matrix4x4, cssTransform,
      projectedBounds, safeZoneCritical: planeProfile.safeZoneCritical,
    };
  });

  const safeZone = validateSafeZoneLayout(planes, options.aspectTarget);
  return {
    sceneId: scene.sceneId, presetId: options.presetId, aspectTarget: options.aspectTarget,
    viewportWidthPx: profile.widthPx, viewportHeightPx: profile.heightPx,
    fps, frameIndex, totalFrames, timestampSec, timestampMs,
    normalizedProgress: roundTo(normalizedProgress, 5), easedProgress, reducedMotion,
    camera, planes, safeZone,
  };
}

/** 지정한 표본 프레임만 검사한다. 표본 사이 프레임이나 실제 영상 출력의 안전성을 보증하지 않는다. */
export function evaluateParallaxSequence(
  scene: MovingtoonCutScene,
  options: Omit<EvaluateParallaxFrameOptions, "frameIndex"> & { readonly sampleCount?: number },
): ParallaxSequenceAudit {
  if (options.fps !== 30 && options.fps !== 60) throw new RangeError("FPS는 30 또는 60이어야 합니다.");
  if (!Number.isFinite(scene.durationSec) || scene.durationSec <= 0 ||
      !Number.isInteger(options.sampleCount ?? 9) || (options.sampleCount ?? 9) < 1 || (options.sampleCount ?? 9) > 1000) {
    throw new RangeError("유효한 클립 길이와 1~1000개의 정수 표본 수가 필요합니다.");
  }
  const totalFrames = Math.max(1, Math.round(Math.max(0.5, scene.durationSec) * options.fps));
  const sampleCount = clamp(Math.floor(options.sampleCount ?? 9), 1, totalFrames);
  const frames: EvaluatedParallaxFrame[] = [];
  const offendingFrameIndices: number[] = [];

  let worstFrameIndex = 0;
  let maxOverlapAreaPx2 = 0;
  let worstStatus: SafeZoneSeverity = "pass";

  for (let i = 0; i < sampleCount; i += 1) {
    const frameIndex = sampleCount === 1 ? 0 : Math.round((i / (sampleCount - 1)) * (totalFrames - 1));
    const evaluated = evaluateParallaxFrame(scene, { ...options, frameIndex });
    frames.push(evaluated);
    if (!evaluated.safeZone.passed) offendingFrameIndices.push(frameIndex);
    if (evaluated.safeZone.totalOverlapAreaPx2 > maxOverlapAreaPx2) {
      maxOverlapAreaPx2 = evaluated.safeZone.totalOverlapAreaPx2;
      worstFrameIndex = frameIndex;
    }
    if (evaluated.safeZone.status === "critical" || (evaluated.safeZone.status === "warning" && worstStatus === "pass")) {
      worstStatus = evaluated.safeZone.status;
    }
  }

  return {
    sceneId: scene.sceneId, presetId: options.presetId, aspectTarget: options.aspectTarget,
    fps: options.fps, totalFrames, sampledFrameCount: frames.length,
    worstFrameIndex, worstStatus, maxOverlapAreaPx2: roundTo(maxOverlapAreaPx2, 2),
    offendingFrameIndices, frames,
  };
}
