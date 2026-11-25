/**
 * Wave 59B — 96% 풀블리드 몰입 미니멀 모드 & 5종 비침습 촉각 시각 피드백 엔진.
 *
 * - 3단계 몰입 뷰포트 상태 머신: full-bleed-96 (96%) · calm-studio-88 (88%) · workbench-82 (82% 하한 준수)
 * - 5종 비침습 시각 피드백:
 *   1) 펜촉 헤일로(Nib Halo): 필압·기울기·속도 기반 동적 타원 반경·잉크 채움(중앙 주시선 방해 0%)
 *   2) 자동 소멸 브러시 HUD 필(Ephemeral Pill): 크기/불투명도 변경 시 900ms 후 자동 소멸(모션 감소 즉시 스냅)
 *   3) 잉크 파동 & OPFS 저장 상태 점(Ink Ripple & Save Pulse): 150ms 물리 감속 + 3종 저장 상태 점
 *   4) 고대비 OKLCH 스포이드 루페(Eyedropper Loupe): OKLCH 명도 대비·색각안전 경고·바이올렛 270~320° 자동 회피
 *   5) 종이결 2% 촉각 그레인 & 1px 물리 버튼 음각(Press Detent): 4종 아틀리에 표면별 안전 전환 토큰
 */

export const VIOLET_SLOP_MIN_HUE = 270;
export const VIOLET_SLOP_MAX_HUE = 320;
export const EDGE_REVEAL_THRESHOLD_PX = 28;
export const EDGE_REVEAL_FADE_MS = 180;
export const CONTEXT_BAR_HEIGHT_PX = 44;
export const PRODUCT_CANVAS_FLOOR_PERCENT = 82;
export const CALM_STUDIO_CANVAS_PERCENT = 88;
export const IMMERSIVE_CANVAS_TARGET_PERCENT = 96;
export const EPHEMERAL_PILL_TTL_MS = 900;
export const EPHEMERAL_PILL_FADE_MS = 180;
export const INK_RIPPLE_DURATION_MS = 150;
export const INK_RIPPLE_EASING = "cubic-bezier(0.22, 1, 0.36, 1)";
export const PRESS_DETENT_DEPTH_PX = 1;
export const MIN_GRAIN_OPACITY = 0.015;
export const MAX_GRAIN_OPACITY = 0.03;
export const LIVE_CANVAS_SVG_WIDTH = 560;
export const LIVE_CANVAS_SVG_HEIGHT = 320;
export const TACTILE_SPEC_SCHEMA_VERSION = "toonstudio.atelier-tactile-hud.v1";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export type ImmersiveViewportModeId = "full-bleed-96" | "calm-studio-88" | "workbench-82";
export type FloatingPillVisibilityPolicy = "edge-proximity-only" | "always-subtle" | "docked";
export type AtelierSurfaceId = "warm-alabaster" | "ink-obsidian" | "hanok-sepia" | "aaa-high-contrast";
export type TactileRippleActionKind = "idle" | "opfs-save" | "undo" | "snap";
export type OpfsSaveStatus = "steady-forest" | "saving-pulse" | "offline-amber";
export type WcagContrastGrade = "AAA" | "AA" | "AA-large" | "fail";
export type CvdWarningLevel = "safe" | "caution" | "high-risk";
export type EphemeralPillPhase = "idle" | "visible" | "fading-out" | "instant-snap" | "dismissed";

export interface ImmersiveViewportModeSpec {
  readonly id: ImmersiveViewportModeId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string;
  readonly canvasOccupancyPercent: number; readonly chromeOccupancyPercent: number;
  readonly topBarVisible: boolean; readonly topBarHeightPx: number;
  readonly leftRailVisible: boolean; readonly leftSlidersOnly: boolean; readonly inspectorDocked: boolean;
  readonly edgeRevealThresholdPx: number; readonly edgeRevealFadeMs: number;
  readonly floatingPillPolicy: FloatingPillVisibilityPolicy; readonly meetsProductFloor: boolean;
}

export type ViewportTransitionAction =
  | { readonly type: "set-mode"; readonly mode: ImmersiveViewportModeId }
  | { readonly type: "toggle-full-bleed"; readonly fallbackMode?: Exclude<ImmersiveViewportModeId, "full-bleed-96"> }
  | { readonly type: "cycle-mode" };

export interface EdgeRevealState {
  readonly mode: ImmersiveViewportModeId; readonly thresholdPx: number; readonly edgeDistancePx: number;
  readonly pointerActive: boolean; readonly edgeProximityEligible: boolean; readonly revealed: boolean;
  readonly pillOpacity: number; readonly fadeDurationMs: number; readonly easing: string;
}

export interface AtelierSurfaceTheme {
  readonly id: AtelierSurfaceId; readonly labelKo: string; readonly labelEn: string;
  readonly summaryKo: string; readonly summaryEn: string; readonly polarity: "light" | "dark";
  readonly grainOpacity: number; readonly grainScalePx: number; readonly pressDetentDepthPx: number;
  readonly canvasBg: OklchColor; readonly chromeBg: OklchColor; readonly paperInk: OklchColor;
  readonly mutedInk: OklchColor; readonly accent: OklchColor; readonly border: OklchColor;
  readonly loupeOuterRing: OklchColor; readonly loupeInnerRing: OklchColor;
}

export interface EyedropperSamplePreset {
  readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly color: OklchColor;
}

export interface NibHaloState {
  readonly pressure: number; readonly tiltDeg: number; readonly velocityPxPerSec: number; readonly brushSizePx: number;
  readonly radiusXPx: number; readonly radiusYPx: number; readonly tiltAzimuthDeg: number;
  readonly inkFillRatio: number; readonly ringStrokeWidthPx: number;
  readonly centerGazeClearanceRatio: number; readonly sightlineObstructionPercent: number;
  readonly ringColorOklch: string; readonly fillColorOklch: string;
}

export interface EphemeralBrushPillState {
  readonly visible: boolean; readonly phase: EphemeralPillPhase; readonly ttlMs: number;
  readonly elapsedMs: number | null; readonly remainingMs: number; readonly opacity: number;
  readonly transitionMs: number; readonly autoDismissScheduled: boolean;
  readonly brushSizePx: number; readonly brushOpacityPercent: number;
  readonly labelKo: string; readonly labelEn: string;
}

export interface OpfsSaveDotState {
  readonly status: OpfsSaveStatus; readonly dotColorOklch: string; readonly ringColorOklch: string;
  readonly pulseActive: boolean; readonly shapeCue: "solid-dot" | "ring-pulse" | "diamond-amber";
  readonly labelKo: string; readonly labelEn: string;
}

export interface InkRippleAndSaveState {
  readonly actionKind: TactileRippleActionKind; readonly active: boolean; readonly elapsedMs: number;
  readonly durationMs: number; readonly easing: string; readonly easedProgress: number;
  readonly rippleRadiusPx: number; readonly rippleOpacity: number; readonly rippleColorOklch: string;
  readonly actionLabelKo: string; readonly actionLabelEn: string; readonly opfsDot: OpfsSaveDotState;
}

export interface EyedropperLoupeState {
  readonly active: boolean; readonly rawL: number; readonly rawC: number;
  readonly rawHueDeg: number; readonly safeHueDeg: number; readonly safeSwatchOklch: string;
  readonly contrastVsCanvas: number; readonly contrastVsInk: number; readonly contrastGrade: WcagContrastGrade;
  readonly violetSlopDetected: boolean; readonly violetAvoidanceHintKo: string; readonly violetAvoidanceHintEn: string;
  readonly cvdWarningLevel: CvdWarningLevel; readonly cvdWarningKo: string; readonly cvdWarningEn: string;
  readonly outerRingOklch: string; readonly innerRingOklch: string;
}

export interface SurfaceTactileTokens {
  readonly surfaceId: AtelierSurfaceId; readonly theme: AtelierSurfaceTheme;
  readonly grainOpacity: number; readonly grainPercentLabel: string;
  readonly pressDetentDepthPx: number; readonly activeTranslateYPx: number;
  readonly detentTransitionMs: number; readonly detentEasing: string;
  readonly canvasInkContrast: number; readonly reducedMotionSafe: boolean;
  readonly cssTokens: Readonly<Record<string, string>>;
}

export interface TactileFeedbackInput {
  readonly mode?: ImmersiveViewportModeId; readonly surfaceId?: AtelierSurfaceId;
  readonly edgeDistancePx?: number; readonly edgePointerActive?: boolean;
  readonly pressure?: number; readonly tiltDeg?: number; readonly velocityPxPerSec?: number;
  readonly brushSizePx?: number; readonly brushOpacityPercent?: number;
  readonly ephemeralTriggerElapsedMs?: number | null;
  readonly lastActionKind?: TactileRippleActionKind; readonly actionElapsedMs?: number;
  readonly opfsSaveStatus?: OpfsSaveStatus;
  readonly eyedropperActive?: boolean; readonly sampledPixel?: OklchColor;
  readonly reducedMotion?: boolean;
}

export interface TactileFeedbackState {
  readonly viewport: ImmersiveViewportModeSpec;
  readonly edgeReveal: EdgeRevealState;
  readonly reducedMotion: boolean;
  readonly nibHalo: NibHaloState;
  readonly ephemeralPill: EphemeralBrushPillState;
  readonly inkRippleAndSave: InkRippleAndSaveState;
  readonly eyedropperLoupe: EyedropperLoupeState;
  readonly surfaceTactile: SurfaceTactileTokens;
}

export const IMMERSIVE_VIEWPORT_MODES: readonly ImmersiveViewportModeSpec[] = [
  {
    id: "full-bleed-96", labelKo: "96% 풀블리드 몰입", labelEn: "96% Full-Bleed Focus",
    summaryKo: "캔버스 96%를 목표로 한 고정 레이아웃 시안입니다. 가장자리 28px 근접 표시를 미리 봅니다.",
    summaryEn: "Fixed layout concept targeting 96% canvas area, with a preview of the 28px edge reveal.",
    canvasOccupancyPercent: IMMERSIVE_CANVAS_TARGET_PERCENT, chromeOccupancyPercent: 100 - IMMERSIVE_CANVAS_TARGET_PERCENT,
    topBarVisible: false, topBarHeightPx: 0, leftRailVisible: false, leftSlidersOnly: false, inspectorDocked: false,
    edgeRevealThresholdPx: EDGE_REVEAL_THRESHOLD_PX, edgeRevealFadeMs: EDGE_REVEAL_FADE_MS,
    floatingPillPolicy: "edge-proximity-only", meetsProductFloor: IMMERSIVE_CANVAS_TARGET_PERCENT >= PRODUCT_CANVAS_FLOOR_PERCENT,
  },
  {
    id: "calm-studio-88", labelKo: "88% 차분한 아틀리에", labelEn: "88% Calm Studio",
    summaryKo: "44px 컨텍스트 바와 좌측 슬라이더를 둔 88% 목표 시안입니다. 실제 편집기 면적은 실측 전입니다.",
    summaryEn: "88% layout target with a 44px context bar and left sliders; actual editor occupancy is unmeasured.",
    canvasOccupancyPercent: CALM_STUDIO_CANVAS_PERCENT, chromeOccupancyPercent: 100 - CALM_STUDIO_CANVAS_PERCENT,
    topBarVisible: true, topBarHeightPx: CONTEXT_BAR_HEIGHT_PX, leftRailVisible: true, leftSlidersOnly: true, inspectorDocked: false,
    edgeRevealThresholdPx: 0, edgeRevealFadeMs: 0,
    floatingPillPolicy: "always-subtle", meetsProductFloor: CALM_STUDIO_CANVAS_PERCENT >= PRODUCT_CANVAS_FLOOR_PERCENT,
  },
  {
    id: "workbench-82", labelKo: "82% 전문 워크벤치", labelEn: "82% Pro Workbench",
    summaryKo: "우측 인스펙터를 포함한 82% 목표 시안입니다. 실제 제품의 면적 기준 충족 여부는 검증 전입니다.",
    summaryEn: "82% layout target with a docked inspector; actual product layout compliance is unverified.",
    canvasOccupancyPercent: PRODUCT_CANVAS_FLOOR_PERCENT, chromeOccupancyPercent: 100 - PRODUCT_CANVAS_FLOOR_PERCENT,
    topBarVisible: true, topBarHeightPx: CONTEXT_BAR_HEIGHT_PX, leftRailVisible: true, leftSlidersOnly: false, inspectorDocked: true,
    edgeRevealThresholdPx: 0, edgeRevealFadeMs: 0,
    floatingPillPolicy: "docked", meetsProductFloor: PRODUCT_CANVAS_FLOOR_PERCENT >= PRODUCT_CANVAS_FLOOR_PERCENT,
  },
] as const;

export const ATELIER_SURFACE_THEMES: readonly AtelierSurfaceTheme[] = [
  {
    id: "warm-alabaster", labelKo: "따뜻한 알라바스터", labelEn: "Warm Alabaster",
    summaryKo: "코튼 원고지 감촉의 밝은 아틀리에 표면(그레인 2.0%)", summaryEn: "Cotton paper bright atelier surface (2.0% micro grain)",
    polarity: "light", grainOpacity: 0.02, grainScalePx: 1.8, pressDetentDepthPx: PRESS_DETENT_DEPTH_PX,
    canvasBg: { l: 0.968, c: 0.008, h: 84 }, chromeBg: { l: 0.935, c: 0.011, h: 80 },
    paperInk: { l: 0.21, c: 0.016, h: 68 }, mutedInk: { l: 0.45, c: 0.018, h: 72 },
    accent: { l: 0.56, c: 0.165, h: 38 }, border: { l: 0.82, c: 0.014, h: 78 },
    loupeOuterRing: { l: 0.19, c: 0.014, h: 68 }, loupeInnerRing: { l: 0.985, c: 0.004, h: 86 },
  },
  {
    id: "ink-obsidian", labelKo: "잉크 옵시디언", labelEn: "Ink Obsidian",
    summaryKo: "야간 작화 눈부심을 낮춘 짙은 먹빛 표면(그레인 2.2%)", summaryEn: "Low-glare night drawing obsidian surface (2.2% micro grain)",
    polarity: "dark", grainOpacity: 0.022, grainScalePx: 1.9, pressDetentDepthPx: PRESS_DETENT_DEPTH_PX,
    canvasBg: { l: 0.165, c: 0.01, h: 236 }, chromeBg: { l: 0.215, c: 0.012, h: 232 },
    paperInk: { l: 0.945, c: 0.009, h: 86 }, mutedInk: { l: 0.72, c: 0.015, h: 224 },
    accent: { l: 0.74, c: 0.14, h: 196 }, border: { l: 0.34, c: 0.015, h: 230 },
    loupeOuterRing: { l: 0.96, c: 0.006, h: 86 }, loupeInnerRing: { l: 0.17, c: 0.012, h: 236 },
  },
  {
    id: "hanok-sepia", labelKo: "한옥 세피아", labelEn: "Hanok Sepia",
    summaryKo: "장시간 콘티 작업용 미색 한지 세피아 표면(그레인 2.8%)", summaryEn: "Warm Hanji parchment sepia surface for long sessions (2.8% grain)",
    polarity: "light", grainOpacity: 0.028, grainScalePx: 2.2, pressDetentDepthPx: PRESS_DETENT_DEPTH_PX,
    canvasBg: { l: 0.925, c: 0.026, h: 74 }, chromeBg: { l: 0.88, c: 0.03, h: 70 },
    paperInk: { l: 0.23, c: 0.028, h: 52 }, mutedInk: { l: 0.44, c: 0.028, h: 60 },
    accent: { l: 0.52, c: 0.145, h: 36 }, border: { l: 0.76, c: 0.028, h: 68 },
    loupeOuterRing: { l: 0.21, c: 0.025, h: 52 }, loupeInnerRing: { l: 0.965, c: 0.014, h: 76 },
  },
  {
    id: "aaa-high-contrast", labelKo: "AAA 초고대비", labelEn: "AAA High-Contrast",
    summaryKo: "명도비 14:1 이상을 확보한 고대비 판독 표면(그레인 1.5%)", summaryEn: "Ultra-legible surface exceeding 14:1 contrast with 1.5% grain",
    polarity: "dark", grainOpacity: 0.015, grainScalePx: 1.5, pressDetentDepthPx: PRESS_DETENT_DEPTH_PX,
    canvasBg: { l: 0.11, c: 0.004, h: 220 }, chromeBg: { l: 0.16, c: 0.006, h: 220 },
    paperInk: { l: 0.99, c: 0.003, h: 90 }, mutedInk: { l: 0.86, c: 0.012, h: 90 },
    accent: { l: 0.84, c: 0.155, h: 86 }, border: { l: 0.62, c: 0.01, h: 220 },
    loupeOuterRing: { l: 0.99, c: 0.003, h: 90 }, loupeInnerRing: { l: 0.11, c: 0.004, h: 220 },
  },
] as const;

export const EYEDROPPER_SAMPLE_PRESETS: readonly EyedropperSamplePreset[] = [
  { id: "sumi-ink", labelKo: "먹선 수묵", labelEn: "Sumi Ink", color: { l: 0.22, c: 0.016, h: 236 } },
  { id: "persimmon-clay", labelKo: "단감 주홍", labelEn: "Persimmon Clay", color: { l: 0.62, c: 0.17, h: 38 } },
  { id: "celadon-jade", labelKo: "청자 비색", labelEn: "Celadon Jade", color: { l: 0.66, c: 0.11, h: 162 } },
  { id: "ochre-parchment", labelKo: "황토 원고", labelEn: "Ochre Parchment", color: { l: 0.78, c: 0.115, h: 82 } },
  { id: "violet-guard-probe", labelKo: "바이올렛 경고 테스트(292°)", labelEn: "Violet Guard Probe (292 deg)", color: { l: 0.56, c: 0.16, h: 292 } },
] as const;

function clamp(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
}

function roundTo(value: number, digits: number): number {
  const factor = Math.pow(10, digits);
  return Math.round(value * factor) / factor;
}

export function normalizeHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const mod = hue % 360;
  return roundTo(mod < 0 ? mod + 360 : mod, 2);
}

export function isVioletSlopHue(hue: number): boolean {
  const normalized = normalizeHue(hue);
  return normalized >= VIOLET_SLOP_MIN_HUE && normalized <= VIOLET_SLOP_MAX_HUE;
}

export function sanitizeNonVioletHue(hue: number): number {
  const normalized = normalizeHue(hue);
  if (!isVioletSlopHue(normalized)) return normalized;
  return normalized <= 295 ? 244 : 34;
}

export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp(color.l, 0, 1), 3);
  const c = roundTo(clamp(color.c, 0, 0.37), 3);
  const h = roundTo(sanitizeNonVioletHue(color.h), 1);
  return alpha !== undefined ? `oklch(${l} ${c} ${h} / ${roundTo(clamp(alpha, 0, 1), 3)})` : `oklch(${l} ${c} ${h})`;
}

export function oklchToRelativeLuminance(color: OklchColor): number {
  const l = clamp(color.l, 0, 1);
  const c = clamp(color.c, 0, 0.37);
  const hRad = (normalizeHue(color.h) * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;
  const lCube = lPrime * lPrime * lPrime;
  const mCube = mPrime * mPrime * mPrime;
  const sCube = sPrime * sPrime * sPrime;
  const linR = clamp(+4.0767416621 * lCube - 3.3077115913 * mCube + 0.2309699292 * sCube, 0, 1);
  const linG = clamp(-1.2684380046 * lCube + 2.6097574011 * mCube - 0.3413193965 * sCube, 0, 1);
  const linB = clamp(-0.0041960863 * lCube - 0.7034186147 * mCube + 1.707614701 * sCube, 0, 1);
  return roundTo(0.2126 * linR + 0.7152 * linG + 0.0722 * linB, 5);
}

export function computeWcagContrastRatio(a: OklchColor, b: OklchColor): number {
  const y1 = oklchToRelativeLuminance(a);
  const y2 = oklchToRelativeLuminance(b);
  return roundTo((Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05), 2);
}

export function classifyContrastGrade(ratio: number): WcagContrastGrade {
  if (ratio >= 7) return "AAA";
  if (ratio >= 4.5) return "AA";
  return ratio >= 3 ? "AA-large" : "fail";
}

export function getImmersiveViewportModeSpec(id: ImmersiveViewportModeId): ImmersiveViewportModeSpec {
  return IMMERSIVE_VIEWPORT_MODES.find((item) => item.id === id) ?? IMMERSIVE_VIEWPORT_MODES[0];
}

export function transitionImmersiveViewportMode(
  current: ImmersiveViewportModeId,
  action: ViewportTransitionAction,
): ImmersiveViewportModeId {
  if (action.type === "set-mode") return getImmersiveViewportModeSpec(action.mode).id;
  if (action.type === "toggle-full-bleed") {
    return current === "full-bleed-96" ? (action.fallbackMode ?? "calm-studio-88") : "full-bleed-96";
  }
  const index = IMMERSIVE_VIEWPORT_MODES.findIndex((item) => item.id === current);
  return IMMERSIVE_VIEWPORT_MODES[index < 0 ? 0 : (index + 1) % IMMERSIVE_VIEWPORT_MODES.length].id;
}

export function getAtelierSurfaceTheme(id: AtelierSurfaceId): AtelierSurfaceTheme {
  return ATELIER_SURFACE_THEMES.find((item) => item.id === id) ?? ATELIER_SURFACE_THEMES[0];
}

export function evaluateEdgeRevealState(params: {
  readonly mode: ImmersiveViewportModeId;
  readonly edgeDistancePx: number;
  readonly pointerActive: boolean;
  readonly reducedMotion: boolean;
}): EdgeRevealState {
  const spec = getImmersiveViewportModeSpec(params.mode);
  const edgeDistancePx = roundTo(Math.max(0, Number.isFinite(params.edgeDistancePx) ? params.edgeDistancePx : 0), 1);
  const edgeProximityEligible = spec.floatingPillPolicy === "edge-proximity-only";
  const revealed = edgeProximityEligible && params.pointerActive && edgeDistancePx <= spec.edgeRevealThresholdPx;
  return {
    mode: spec.id, thresholdPx: spec.edgeRevealThresholdPx, edgeDistancePx,
    pointerActive: params.pointerActive, edgeProximityEligible, revealed,
    pillOpacity: revealed ? 0.94 : 0,
    fadeDurationMs: edgeProximityEligible ? (params.reducedMotion ? 0 : spec.edgeRevealFadeMs) : 0,
    easing: params.reducedMotion ? "step-end" : INK_RIPPLE_EASING,
  };
}

function evaluateNibHalo(params: {
  readonly pressure: number; readonly tiltDeg: number; readonly velocityPxPerSec: number;
  readonly brushSizePx: number; readonly brushOpacityPercent: number; readonly surface: AtelierSurfaceTheme;
}): NibHaloState {
  const pressure = roundTo(clamp(params.pressure, 0, 1), 3);
  const tiltDeg = roundTo(clamp(params.tiltDeg, 15, 90), 1);
  const velocityPxPerSec = roundTo(clamp(params.velocityPxPerSec, 0, 2400), 1);
  const brushSizePx = roundTo(clamp(params.brushSizePx, 1, 240), 1);
  const brushOpacityPercent = roundTo(clamp(params.brushOpacityPercent, 1, 100), 1);
  const tiltFlatness = clamp(Math.cos((tiltDeg * Math.PI) / 180), 0, 0.966);
  const speedRatio = clamp(velocityPxPerSec / 1800, 0, 1);
  const baseRadius = clamp(4 + brushSizePx * 0.13 * (0.45 + pressure * 0.72), 4, 34);
  const radiusXPx = roundTo(clamp(baseRadius * (1 + tiltFlatness * 0.85), 4, 46), 2);
  const radiusYPx = roundTo(clamp(baseRadius * Math.max(0.42, 1 - tiltFlatness * 0.34 - speedRatio * 0.14), 3, 34), 2);
  const inkFillRatio = roundTo(clamp(0.08 + pressure * (brushOpacityPercent / 100) * 0.76 * (1 - speedRatio * 0.18), 0.08, 0.88), 3);

  return {
    pressure, tiltDeg, velocityPxPerSec, brushSizePx, radiusXPx, radiusYPx,
    tiltAzimuthDeg: roundTo((90 - tiltDeg) * 0.55, 1),
    inkFillRatio, ringStrokeWidthPx: roundTo(1.2 + pressure * 1.05, 2),
    centerGazeClearanceRatio: 1, sightlineObstructionPercent: 0,
    ringColorOklch: formatOklch(params.surface.accent, 0.92),
    fillColorOklch: formatOklch(params.surface.accent, roundTo(inkFillRatio * 0.28, 3)),
  };
}

function evaluateEphemeralPill(params: {
  readonly brushSizePx: number; readonly brushOpacityPercent: number;
  readonly elapsedMs: number | null; readonly reducedMotion: boolean;
}): EphemeralBrushPillState {
  const brushSizePx = Math.round(clamp(params.brushSizePx, 1, 240));
  const brushOpacityPercent = Math.round(clamp(params.brushOpacityPercent, 1, 100));
  const labelKo = `브러시 ${brushSizePx}px · 불투명도 ${brushOpacityPercent}%`;
  const labelEn = `Brush ${brushSizePx}px · Opacity ${brushOpacityPercent}%`;

  if (params.elapsedMs === null || !Number.isFinite(params.elapsedMs)) {
    return {
      visible: false, phase: "idle", ttlMs: EPHEMERAL_PILL_TTL_MS, elapsedMs: null, remainingMs: 0,
      opacity: 0, transitionMs: 0, autoDismissScheduled: false, brushSizePx, brushOpacityPercent, labelKo, labelEn,
    };
  }
  const elapsed = Math.max(0, Math.round(params.elapsedMs));
  const remainingMs = Math.max(0, EPHEMERAL_PILL_TTL_MS - elapsed);
  if (elapsed >= EPHEMERAL_PILL_TTL_MS) {
    return {
      visible: false, phase: "dismissed", ttlMs: EPHEMERAL_PILL_TTL_MS, elapsedMs: elapsed, remainingMs: 0,
      opacity: 0, transitionMs: params.reducedMotion ? 0 : EPHEMERAL_PILL_FADE_MS, autoDismissScheduled: false,
      brushSizePx, brushOpacityPercent, labelKo, labelEn,
    };
  }
  if (params.reducedMotion) {
    return {
      visible: true, phase: "instant-snap", ttlMs: EPHEMERAL_PILL_TTL_MS, elapsedMs: elapsed, remainingMs,
      opacity: 1, transitionMs: 0, autoDismissScheduled: true, brushSizePx, brushOpacityPercent, labelKo, labelEn,
    };
  }
  const fading = elapsed >= EPHEMERAL_PILL_TTL_MS - EPHEMERAL_PILL_FADE_MS;
  return {
    visible: true, phase: fading ? "fading-out" : "visible", ttlMs: EPHEMERAL_PILL_TTL_MS, elapsedMs: elapsed, remainingMs,
    opacity: fading ? roundTo(clamp(remainingMs / EPHEMERAL_PILL_FADE_MS, 0, 1), 3) : 1,
    transitionMs: fading ? EPHEMERAL_PILL_FADE_MS : 150, autoDismissScheduled: true,
    brushSizePx, brushOpacityPercent, labelKo, labelEn,
  };
}

function evaluateOpfsDot(status: OpfsSaveStatus, reducedMotion: boolean): OpfsSaveDotState {
  if (status === "saving-pulse") {
    return {
      status, dotColorOklch: formatOklch({ l: 0.62, c: 0.135, h: 196 }), ringColorOklch: formatOklch({ l: 0.62, c: 0.135, h: 196 }, 0.42),
      pulseActive: !reducedMotion, shapeCue: "ring-pulse", labelKo: "OPFS 저장 중 표시 시연", labelEn: "OPFS Saving Indicator Preview",
    };
  }
  if (status === "offline-amber") {
    return {
      status, dotColorOklch: formatOklch({ l: 0.72, c: 0.15, h: 76 }), ringColorOklch: formatOklch({ l: 0.72, c: 0.15, h: 76 }, 0.36),
      pulseActive: false, shapeCue: "diamond-amber", labelKo: "오프라인 보관 표시 시연", labelEn: "Offline Hold Indicator Preview",
    };
  }
  return {
    status: "steady-forest", dotColorOklch: formatOklch({ l: 0.58, c: 0.14, h: 152 }), ringColorOklch: formatOklch({ l: 0.58, c: 0.14, h: 152 }, 0.32),
    pulseActive: false, shapeCue: "solid-dot", labelKo: "OPFS 저장 완료 표시 예시", labelEn: "OPFS Saved Indicator Preview",
  };
}

function evaluateInkRippleAndSave(params: {
  readonly actionKind: TactileRippleActionKind; readonly actionElapsedMs: number;
  readonly opfsSaveStatus: OpfsSaveStatus; readonly reducedMotion: boolean; readonly surface: AtelierSurfaceTheme;
}): InkRippleAndSaveState {
  const elapsedMs = Math.max(0, Math.round(Number.isFinite(params.actionElapsedMs) ? params.actionElapsedMs : 0));
  const active = params.actionKind !== "idle" && elapsedMs <= INK_RIPPLE_DURATION_MS;
  const rawProgress = active ? clamp(elapsedMs / INK_RIPPLE_DURATION_MS, 0, 1) : 1;
  const easedProgress = params.reducedMotion ? (active ? 1 : 0) : roundTo(1 - Math.pow(1 - rawProgress, 3), 3);
  const actionMeta: Record<TactileRippleActionKind, { readonly ko: string; readonly en: string; readonly color: OklchColor }> = {
    idle: { ko: "대기 중", en: "Idle", color: params.surface.mutedInk },
    "opfs-save": { ko: "OPFS 저장 표시 시연", en: "OPFS Save Indicator Preview", color: { l: 0.58, c: 0.14, h: 152 } },
    undo: { ko: "실행취소 표시 시연", en: "Undo Indicator Preview", color: { l: 0.62, c: 0.145, h: 42 } },
    snap: { ko: "스냅 표시 시연", en: "Snap Indicator Preview", color: { l: 0.62, c: 0.13, h: 204 } },
  };
  const chosen = actionMeta[params.actionKind];

  return {
    actionKind: params.actionKind, active, elapsedMs,
    durationMs: params.reducedMotion ? 0 : INK_RIPPLE_DURATION_MS,
    easing: params.reducedMotion ? "step-end" : INK_RIPPLE_EASING,
    easedProgress: active ? easedProgress : 0,
    rippleRadiusPx: active ? roundTo(params.reducedMotion ? 20 : 10 + easedProgress * 24, 2) : 0,
    rippleOpacity: active ? roundTo(params.reducedMotion ? 0.55 : (1 - easedProgress) * 0.72, 3) : 0,
    rippleColorOklch: formatOklch(chosen.color, 0.88),
    actionLabelKo: chosen.ko, actionLabelEn: chosen.en,
    opfsDot: evaluateOpfsDot(params.opfsSaveStatus, params.reducedMotion),
  };
}

function evaluateEyedropperLoupe(params: {
  readonly active: boolean; readonly sampledPixel: OklchColor; readonly surface: AtelierSurfaceTheme;
}): EyedropperLoupeState {
  const rawL = roundTo(clamp(params.sampledPixel.l, 0, 1), 3);
  const rawC = roundTo(clamp(params.sampledPixel.c, 0, 0.37), 3);
  const rawHueDeg = normalizeHue(params.sampledPixel.h);
  const violetSlopDetected = isVioletSlopHue(rawHueDeg);
  const safeHueDeg = sanitizeNonVioletHue(rawHueDeg);
  const safeColor: OklchColor = { l: rawL, c: rawC, h: safeHueDeg };
  const contrastVsCanvas = computeWcagContrastRatio(safeColor, params.surface.canvasBg);
  const contrastVsInk = computeWcagContrastRatio(safeColor, params.surface.paperInk);
  const contrastGrade = classifyContrastGrade(contrastVsCanvas);
  const isRedGreenZone =
    rawC >= 0.08 && rawL >= 0.4 && rawL <= 0.72 && ((rawHueDeg >= 16 && rawHueDeg <= 50) || (rawHueDeg >= 115 && rawHueDeg <= 165));

  let cvdWarningLevel: CvdWarningLevel = "safe";
  let cvdWarningKo = "명도 대비와 색각안전 기준을 충족합니다.";
  let cvdWarningEn = "Meets luminance contrast and color-vision safety baseline.";
  if (contrastVsCanvas < 3) {
    cvdWarningLevel = "high-risk";
    cvdWarningKo = `바탕 대비 ${contrastVsCanvas.toFixed(2)}:1 낮음 · 명도(L) 차이 0.30 이상 확보 권장`;
    cvdWarningEn = `Low canvas contrast ${contrastVsCanvas.toFixed(2)}:1 · widen lightness separation by >= 0.30`;
  } else if (violetSlopDetected || isRedGreenZone) {
    cvdWarningLevel = "caution";
    cvdWarningKo = violetSlopDetected
      ? `바이올렛(270~320°) 혼동 위험 · ${safeHueDeg}° 보정과 형태 단서 병기 권장`
      : "적록 색각 혼동 구간 · 색상 단독 표시 대신 선 모양·명도 차이를 함께 쓰세요.";
    cvdWarningEn = violetSlopDetected
      ? `Violet slop range (270-320 deg) · prefer hue ${safeHueDeg} deg with shape cues`
      : "Red-green CVD overlap zone · pair hue with lightness delta or shape cue";
  }

  return {
    active: params.active, rawL, rawC, rawHueDeg, safeHueDeg, safeSwatchOklch: formatOklch(safeColor),
    contrastVsCanvas, contrastVsInk, contrastGrade, violetSlopDetected,
    violetAvoidanceHintKo: violetSlopDetected
      ? `바이올렛 영역(${rawHueDeg}°) 자동 회피 · 안전 대체 휴 ${safeHueDeg}° 적용`
      : "바이올렛 270~320° 회피 기준 통과",
    violetAvoidanceHintEn: violetSlopDetected
      ? `Violet range (${rawHueDeg} deg) avoided · remapped to safe hue ${safeHueDeg} deg`
      : "Clear of violet slop range (270-320 deg)",
    cvdWarningLevel, cvdWarningKo, cvdWarningEn,
    outerRingOklch: formatOklch(params.surface.loupeOuterRing),
    innerRingOklch: formatOklch(params.surface.loupeInnerRing),
  };
}

function evaluateSurfaceTactileTokens(surface: AtelierSurfaceTheme, reducedMotion: boolean): SurfaceTactileTokens {
  const grainOpacity = roundTo(clamp(surface.grainOpacity, MIN_GRAIN_OPACITY, MAX_GRAIN_OPACITY), 3);
  const activeTranslateYPx = reducedMotion ? 0 : surface.pressDetentDepthPx;
  const detentTransitionMs = reducedMotion ? 0 : INK_RIPPLE_DURATION_MS;
  const detentEasing = reducedMotion ? "step-end" : INK_RIPPLE_EASING;
  const canvasInkContrast = computeWcagContrastRatio(surface.canvasBg, surface.paperInk);
  const cssTokens: Record<string, string> = {
    "--atelier-surface-id": surface.id,
    "--atelier-canvas-bg": formatOklch(surface.canvasBg),
    "--atelier-chrome-bg": formatOklch(surface.chromeBg),
    "--atelier-ink-fg": formatOklch(surface.paperInk),
    "--atelier-ink-muted": formatOklch(surface.mutedInk),
    "--atelier-accent": formatOklch(surface.accent),
    "--atelier-border": formatOklch(surface.border),
    "--atelier-grain-opacity": String(grainOpacity),
    "--atelier-grain-scale": `${surface.grainScalePx}px`,
    "--atelier-detent-depth": `${surface.pressDetentDepthPx}px`,
    "--atelier-detent-shift-y": `${activeTranslateYPx}px`,
    "--atelier-motion-duration": `${detentTransitionMs}ms`,
    "--atelier-motion-easing": detentEasing,
    "--atelier-edge-reveal-ms": `${reducedMotion ? 0 : EDGE_REVEAL_FADE_MS}ms`,
    "--atelier-pill-ttl-ms": `${EPHEMERAL_PILL_TTL_MS}ms`,
  };
  return {
    surfaceId: surface.id, theme: surface, grainOpacity,
    grainPercentLabel: `${roundTo(grainOpacity * 100, 1).toFixed(1)}%`,
    pressDetentDepthPx: surface.pressDetentDepthPx, activeTranslateYPx,
    detentTransitionMs, detentEasing, canvasInkContrast, reducedMotionSafe: true, cssTokens,
  };
}

export function evaluateTactileFeedbackState(input: TactileFeedbackInput): TactileFeedbackState {
  const viewport = getImmersiveViewportModeSpec(input.mode ?? "full-bleed-96");
  const surface = getAtelierSurfaceTheme(input.surfaceId ?? "warm-alabaster");
  const reducedMotion = Boolean(input.reducedMotion);
  const brushSizePx = input.brushSizePx ?? 28;
  const brushOpacityPercent = input.brushOpacityPercent ?? 88;
  return {
    viewport,
    edgeReveal: evaluateEdgeRevealState({
      mode: viewport.id, edgeDistancePx: input.edgeDistancePx ?? 48,
      pointerActive: Boolean(input.edgePointerActive), reducedMotion,
    }),
    reducedMotion,
    nibHalo: evaluateNibHalo({
      pressure: input.pressure ?? 0.62, tiltDeg: input.tiltDeg ?? 58,
      velocityPxPerSec: input.velocityPxPerSec ?? 320, brushSizePx, brushOpacityPercent, surface,
    }),
    ephemeralPill: evaluateEphemeralPill({
      brushSizePx, brushOpacityPercent, elapsedMs: input.ephemeralTriggerElapsedMs ?? null, reducedMotion,
    }),
    inkRippleAndSave: evaluateInkRippleAndSave({
      actionKind: input.lastActionKind ?? "idle", actionElapsedMs: input.actionElapsedMs ?? 0,
      opfsSaveStatus: input.opfsSaveStatus ?? "steady-forest", reducedMotion, surface,
    }),
    eyedropperLoupe: evaluateEyedropperLoupe({
      active: Boolean(input.eyedropperActive), sampledPixel: input.sampledPixel ?? EYEDROPPER_SAMPLE_PRESETS[1].color, surface,
    }),
    surfaceTactile: evaluateSurfaceTactileTokens(surface, reducedMotion),
  };
}

export function exportTactileFeedbackSpecJson(state: TactileFeedbackState): string {
  const { viewport, edgeReveal, nibHalo, ephemeralPill, inkRippleAndSave, eyedropperLoupe, surfaceTactile } = state;
  return JSON.stringify(
    {
      schemaVersion: TACTILE_SPEC_SCHEMA_VERSION,
      scopeNotice: "preview-token-spec-only",
      executionPreview: {
        renderer: "react-svg", timingSource: "demo-timer",
        canvasOccupancySource: "fixed-design-target-unmeasured", productLayoutVerified: false,
        documentModified: false, opfsWritePerformed: false, saveStatusSource: "simulated-indicator",
      },
      viewport: {
        mode: viewport.id, canvasOccupancyPercent: viewport.canvasOccupancyPercent,
        chromeOccupancyPercent: viewport.chromeOccupancyPercent, meetsProductFloor82: viewport.meetsProductFloor,
        topBarHeightPx: viewport.topBarHeightPx, edgeRevealThresholdPx: viewport.edgeRevealThresholdPx,
        edgeRevealFadeMs: edgeReveal.fadeDurationMs, edgePillRevealed: edgeReveal.revealed,
      },
      surface: {
        id: surfaceTactile.surfaceId, polarity: surfaceTactile.theme.polarity,
        grainOpacity: surfaceTactile.grainOpacity, pressDetentDepthPx: surfaceTactile.pressDetentDepthPx,
        activeTranslateYPx: surfaceTactile.activeTranslateYPx, canvasInkContrast: surfaceTactile.canvasInkContrast,
        cssTokens: surfaceTactile.cssTokens,
      },
      feedbackModels: {
        nibHalo: {
          pressure: nibHalo.pressure, tiltDeg: nibHalo.tiltDeg, radiusXPx: nibHalo.radiusXPx, radiusYPx: nibHalo.radiusYPx,
          inkFillRatio: nibHalo.inkFillRatio, sightlineObstructionPercent: nibHalo.sightlineObstructionPercent,
          ringColorOklch: nibHalo.ringColorOklch,
        },
        ephemeralPill: {
          visible: ephemeralPill.visible, phase: ephemeralPill.phase, ttlMs: ephemeralPill.ttlMs,
          remainingMs: ephemeralPill.remainingMs, transitionMs: ephemeralPill.transitionMs,
        },
        inkRippleAndSave: {
          actionKind: inkRippleAndSave.actionKind, durationMs: inkRippleAndSave.durationMs, easing: inkRippleAndSave.easing,
          opfsStatus: inkRippleAndSave.opfsDot.status, opfsDotOklch: inkRippleAndSave.opfsDot.dotColorOklch,
          opfsShapeCue: inkRippleAndSave.opfsDot.shapeCue,
        },
        eyedropperLoupe: {
          active: eyedropperLoupe.active, rawL: eyedropperLoupe.rawL, rawC: eyedropperLoupe.rawC,
          rawHueDeg: eyedropperLoupe.rawHueDeg, safeHueDeg: eyedropperLoupe.safeHueDeg,
          safeSwatchOklch: eyedropperLoupe.safeSwatchOklch, contrastVsCanvas: eyedropperLoupe.contrastVsCanvas,
          contrastGrade: eyedropperLoupe.contrastGrade, violetSlopDetected: eyedropperLoupe.violetSlopDetected,
          cvdWarningLevel: eyedropperLoupe.cvdWarningLevel,
        },
        surfaceTactile: {
          grainOpacity: surfaceTactile.grainOpacity, pressDetentDepthPx: surfaceTactile.pressDetentDepthPx,
          detentTransitionMs: surfaceTactile.detentTransitionMs, reducedMotionSafe: surfaceTactile.reducedMotionSafe,
        },
      },
      accessibility: {
        reducedMotion: state.reducedMotion, minTouchTargetPx: 44, colorOnlyCueFree: true,
        violetSlopRangeExcludedDeg: [VIOLET_SLOP_MIN_HUE, VIOLET_SLOP_MAX_HUE],
      },
    },
    null,
    2,
  );
}
