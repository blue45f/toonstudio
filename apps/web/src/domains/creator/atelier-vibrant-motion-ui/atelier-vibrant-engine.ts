/**
 * Wave 64B — `AtelierVivid` 탈-바이올렛 주얼-톤 아틀리에 생동감·입체 에나멜 UI·마이크로 시어터 모션 엔진.
 *
 * - 화방 5원색 안료(에메랄드 보태니컬 158° · 코발트 울트라마린 236° · 크림슨 주홍 24° · 앰버 오커 골드 76° · 포슬린 아이보리 86°)
 * - 5대 창작 컨텍스트 주얼-톤 다이나믹 팔레트(ink-atelier · pigment-splash · stage-cinema · story-editorial · night-studio-glow)
 * - 바이올렛 휴(265°~325°) 0% 불변식 검증기(`verifyZeroVioletSlop`) + 전 텍스트·버튼 WCAG 2.2 AA(>= 4.5:1) 자동 감사
 * - 4종 입체 에나멜 버튼·도구 배지 4단계 상태 물리 모델(`evaluateTactileButtonSpec`) — 모션 감소 즉시 0 스냅, 전속성 일괄 트랜지션 금지
 * - 포인터·스크롤 연동 마이크로-시어터 역동성 계산기(`computeMicroTheaterKinematics`) — ±4.5° 3D 틸트 클램프, 다층 리본 시차, 잉크 물결 감쇠
 * - 순수 결정론적 TypeScript 엔진(DOM · Web Storage · 네트워크 의존 0건)
 */

export const ATELIER_VIVID_SCHEMA_VERSION = "toonstudio.atelier-vivid-ui.v1" as const;
export const VIOLET_HUE_MIN = 265;
export const VIOLET_HUE_MAX = 325;
export const WCAG_AA_MIN_RATIO = 4.5;
export const MAX_TILT_DEG = 4.5;
export const PRIMARY_PRESS_SCALE = 0.97;
export const SPRING_PRESS_DURATION_MS = 150;
export const INK_RIPPLE_DURATION_MS = 540;
export const MIN_HIT_AREA_PX = 44;

export type AtelierVividPaletteId = "ink-atelier" | "pigment-splash" | "stage-cinema" | "story-editorial" | "night-studio-glow";
export type JewelPigmentId = "emerald-botanical" | "cobalt-ultramarine" | "crimson-vermilion" | "amber-ochre-gold" | "porcelain-ivory";
export type TactileButtonVariantId = "primary-enamel" | "secondary-ceramic" | "tool-jewel-badge" | "ghost-ink-pill";
export type TactileInteractionState = "rest" | "hover" | "active" | "focus";
export type ContrastPairRoleId = "body-on-canvas" | "muted-on-surface" | "primary-enamel" | "secondary-ceramic" | "accent-badge" | "ink-on-elevated";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface NamedOklchToken { readonly name: string; readonly color: OklchColor; }
export interface JewelPigmentSpec {
  readonly id: JewelPigmentId; readonly labelKo: string; readonly labelEn: string; readonly hueDeg: number;
  readonly roleKo: string; readonly roleEn: string;
  readonly swatch: OklchColor; readonly deepTone: OklchColor; readonly lightWash: OklchColor;
}
export interface MeshGradientStop {
  readonly id: string; readonly xPct: number; readonly yPct: number;
  readonly radiusPct: number; readonly alpha: number; readonly color: OklchColor;
}
export interface RibbonLayerSpec {
  readonly depth: "back" | "mid" | "front"; readonly parallaxFactorPx: number; readonly scrollFactorPx: number;
  readonly strokeWidth: number; readonly alpha: number; readonly color: OklchColor;
}
export interface AtelierVividPalette {
  readonly id: AtelierVividPaletteId; readonly polarity: "light" | "dark";
  readonly labelKo: string; readonly labelEn: string; readonly moodTagKo: string; readonly moodTagEn: string;
  readonly creativeContextKo: string; readonly creativeContextEn: string; readonly craftNoteKo: string; readonly craftNoteEn: string;
  readonly corePigmentIds: readonly JewelPigmentId[];
  readonly canvas: OklchColor; readonly surface: OklchColor; readonly elevated: OklchColor;
  readonly border: OklchColor; readonly borderStrong: OklchColor; readonly ink: OklchColor; readonly inkMuted: OklchColor;
  readonly primary: OklchColor; readonly onPrimary: OklchColor; readonly secondary: OklchColor; readonly onSecondary: OklchColor;
  readonly accent: OklchColor; readonly onAccent: OklchColor; readonly highlight: OklchColor;
  readonly specularRim: OklchColor; readonly focusRing: OklchColor;
  readonly meshStops: readonly [MeshGradientStop, MeshGradientStop, MeshGradientStop];
  readonly ribbons: readonly [RibbonLayerSpec, RibbonLayerSpec, RibbonLayerSpec];
}
export interface VioletViolationEntry { readonly name: string; readonly hueDeg: number; }
export interface ZeroVioletAuditResult {
  readonly inspectedCount: number; readonly violetViolationCount: number; readonly violetPercent: number;
  readonly minForbiddenHue: number; readonly maxForbiddenHue: number;
  readonly offendingTokens: readonly VioletViolationEntry[]; readonly passed: boolean;
}
export interface PaletteContrastRow {
  readonly roleId: ContrastPairRoleId; readonly labelKo: string; readonly labelEn: string;
  readonly foreground: OklchColor; readonly background: OklchColor;
  readonly wcagRatio: number; readonly apcaLc: number; readonly passesAa: boolean; readonly grade: "AAA" | "AA" | "FAIL";
}
export interface PaletteContrastAudit {
  readonly paletteId: AtelierVividPaletteId; readonly minRequiredRatio: number;
  readonly rows: readonly PaletteContrastRow[]; readonly worstWcagRatio: number; readonly allPassAa: boolean;
}
export interface TactileButtonSpecInput {
  readonly variant: TactileButtonVariantId; readonly state: TactileInteractionState;
  readonly paletteId: AtelierVividPaletteId; readonly reducedMotion?: boolean;
}
export interface TactileButtonSpec {
  readonly variant: TactileButtonVariantId; readonly state: TactileInteractionState;
  readonly paletteId: AtelierVividPaletteId; readonly reducedMotion: boolean;
  readonly labelKo: string; readonly labelEn: string; readonly badgeTagKo: string; readonly badgeTagEn: string;
  readonly backgroundOklch: OklchColor; readonly foregroundOklch: OklchColor; readonly borderOklch: OklchColor;
  readonly specularHighlightOklch: OklchColor; readonly ambientShadowOklch: OklchColor; readonly focusRingOklch: OklchColor;
  readonly wcagContrastRatio: number; readonly passesWcagAa: boolean;
  readonly scale: number; readonly translateYPx: number; readonly durationMs: number; readonly springCurve: string;
  readonly topSpecularPx: number; readonly innerBevelBorderPx: number; readonly shadowLayerCount: number;
  readonly boxShadowCss: string; readonly transformCss: string; readonly transitionProperty: string; readonly minHitAreaPx: number;
}
export interface MicroTheaterKinematicsInput {
  readonly pointerX: number; readonly pointerY: number; readonly scrollProgress?: number;
  readonly rippleAgeMs?: number; readonly rippleActive?: boolean;
  readonly reducedMotion?: boolean; readonly paletteId?: AtelierVividPaletteId;
}
export interface RibbonParallaxFrame {
  readonly depth: "back" | "mid" | "front"; readonly offsetXPx: number; readonly offsetYPx: number;
  readonly scrollShiftYPx: number; readonly strokeWidth: number; readonly strokeCss: string; readonly fillCss: string;
}
export interface InkRippleFrame {
  readonly active: boolean; readonly ageMs: number; readonly progress: number; readonly radiusPct: number; readonly opacity: number;
}
export interface MicroTheaterKinematics {
  readonly normalizedPointerX: number; readonly normalizedPointerY: number; readonly scrollProgress: number;
  readonly reducedMotion: boolean; readonly maxTiltDeg: number;
  readonly rotateXDeg: number; readonly rotateYDeg: number; readonly tiltMagnitudeDeg: number;
  readonly specularShiftXPct: number; readonly specularShiftYPct: number;
  readonly ribbonFrames: readonly [RibbonParallaxFrame, RibbonParallaxFrame, RibbonParallaxFrame];
  readonly inkRipple: InkRippleFrame; readonly cardTransformCss: string; readonly meshGradientCss: string; readonly motionSafe: boolean;
}
export interface AtelierVividCssExportOptions {
  readonly reducedMotion?: boolean; readonly pointerX?: number; readonly pointerY?: number; readonly scrollProgress?: number;
}
export interface AtelierVividSnapshotInput {
  readonly paletteId?: AtelierVividPaletteId; readonly buttonState?: TactileInteractionState;
  readonly pointerX?: number; readonly pointerY?: number; readonly scrollProgress?: number;
  readonly rippleAgeMs?: number; readonly rippleActive?: boolean; readonly reducedMotion?: boolean;
}
export interface AtelierVividSnapshot {
  readonly schemaVersion: typeof ATELIER_VIVID_SCHEMA_VERSION;
  readonly palette: AtelierVividPalette;
  readonly violetAudit: ZeroVioletAuditResult;
  readonly contrastAudit: PaletteContrastAudit;
  readonly allPaletteContrastAudits: readonly PaletteContrastAudit[];
  readonly buttonSpecs: readonly [TactileButtonSpec, TactileButtonSpec, TactileButtonSpec, TactileButtonSpec];
  readonly kinematics: MicroTheaterKinematics;
  readonly craftScore: number;
}

const ok = (l: number, c: number, h: number): OklchColor => ({ l, c, h });
const roundTo = (value: number, digits: number): number => Math.round(value * Math.pow(10, digits)) / Math.pow(10, digits);
const clamp = (value: number, min: number, max: number): number => (Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min);
const clamp01 = (value: number): number => clamp(value, 0, 1);

export function normalizeHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const mod = hue % 360;
  return mod < 0 ? mod + 360 : mod;
}
export function isForbiddenVioletHue(hue: number): boolean {
  const h = normalizeHue(hue);
  return h >= VIOLET_HUE_MIN && h <= VIOLET_HUE_MAX;
}
export function sanitizeNonVioletHue(hue: number): number {
  const h = normalizeHue(hue);
  return !isForbiddenVioletHue(h) ? roundTo(h, 1) : h < 295 ? 236 : 342;
}
export function formatOklch(color: OklchColor, alpha?: number): string {
  const l = roundTo(clamp01(color.l), 3);
  const c = roundTo(clamp(color.c, 0, 0.4), 3);
  const h = sanitizeNonVioletHue(color.h);
  return alpha === undefined ? `oklch(${l} ${c} ${h})` : `oklch(${l} ${c} ${h} / ${clamp01(alpha).toFixed(2)})`;
}

/** OKLCH -> OKLab -> LMS -> Linear sRGB 변환(0..1 클램프). */
export function oklchToLinearSrgb(color: OklchColor): readonly [number, number, number] {
  const l = clamp01(color.l);
  const c = clamp(color.c, 0, 0.4);
  const hRad = (sanitizeNonVioletHue(color.h) * Math.PI) / 180;
  const a = c * Math.cos(hRad);
  const b = c * Math.sin(hRad);
  const lP = l + 0.3963377774 * a + 0.2158037573 * b;
  const mP = l - 0.1055613458 * a - 0.0638541728 * b;
  const sP = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lP * lP * lP;
  const m3 = mP * mP * mP;
  const s3 = sP * sP * sP;
  return [
    clamp01(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    clamp01(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    clamp01(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ];
}

/** WCAG 2.2 상대 휘도 Y (ITU-R BT.709 선형 계수). */
export function computeRelativeLuminanceY(color: OklchColor): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  return roundTo(0.2126 * r + 0.7152 * g + 0.0722 * b, 4);
}

/** WCAG 2.2 대비비(1.00 ~ 21.00). */
export function computeWcagContrastRatio(foreground: OklchColor, background: OklchColor): number {
  const y1 = computeRelativeLuminanceY(foreground);
  const y2 = computeRelativeLuminanceY(background);
  return roundTo((Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05), 2);
}

function linearChannelToSrgb(channel: number): number {
  const v = clamp01(channel);
  return v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
}
function computeApcaScreenLuminance(color: OklchColor): number {
  const [r, g, b] = oklchToLinearSrgb(color);
  const y = 0.2126729 * Math.pow(linearChannelToSrgb(r), 2.4) + 0.7151522 * Math.pow(linearChannelToSrgb(g), 2.4) + 0.072175 * Math.pow(linearChannelToSrgb(b), 2.4);
  return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
}

/** APCA W3 지각 대비 Lc(밝은 배경 양수 / 어두운 배경 음수). */
export function computeApcaContrastLc(textColor: OklchColor, backgroundColor: OklchColor): number {
  const yTxt = computeApcaScreenLuminance(textColor);
  const yBg = computeApcaScreenLuminance(backgroundColor);
  if (Math.abs(yBg - yTxt) < 0.0005) return 0;
  if (yBg > yTxt) {
    const sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : roundTo((sapc - 0.027) * 100, 1);
  }
  const sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
  return sapc > -0.1 ? 0 : roundTo((sapc + 0.027) * 100, 1);
}

/** 화방 고채도 주얼-톤 5원색 안료 정본(바이올렛 265°~325° 0%). */
export const ATELIER_JEWEL_PIGMENTS: readonly JewelPigmentSpec[] = [
  { id: "emerald-botanical", labelKo: "에메랄드 보태니컬 158°", labelEn: "Emerald Botanical 158°", hueDeg: 158, roleKo: "선화 집중 · 확인 신호 · 자연 생동감", roleEn: "Line-art focus, verification cue, botanical vitality", swatch: ok(0.45, 0.145, 158), deepTone: ok(0.32, 0.105, 158), lightWash: ok(0.86, 0.085, 158) },
  { id: "cobalt-ultramarine", labelKo: "코발트 울트라마린 236°", labelEn: "Cobalt Ultramarine 236°", hueDeg: 236, roleKo: "채색 깊이 · 3D 공간 · 정밀 기기", roleEn: "Pigment depth, 3D stage, precision instruments", swatch: ok(0.44, 0.165, 236), deepTone: ok(0.24, 0.085, 236), lightWash: ok(0.84, 0.08, 236) },
  { id: "crimson-vermilion", labelKo: "크림슨 주홍 24°", labelEn: "Crimson Vermilion 24°", hueDeg: 24, roleKo: "주홍 낙관 · 핵심 CTA · 연재 하이라이트", roleEn: "Vermilion seal, hero CTA, editorial focal punch", swatch: ok(0.47, 0.195, 24), deepTone: ok(0.34, 0.14, 24), lightWash: ok(0.85, 0.095, 24) },
  { id: "amber-ochre-gold", labelKo: "앰버 오커 골드 76°", labelEn: "Amber Ochre Gold 76°", hueDeg: 76, roleKo: "림라이트 광택 · 야간 램프 · 황금 배지", roleEn: "Rim-light specular, night desk lamp, gold accents", swatch: ok(0.79, 0.155, 76), deepTone: ok(0.44, 0.115, 76), lightWash: ok(0.92, 0.075, 76) },
  { id: "porcelain-ivory", labelKo: "포슬린 아이보리 86°", labelEn: "Porcelain Ivory 86°", hueDeg: 86, roleKo: "한지·도자기 표면 · 눈부심 억제 바탕", roleEn: "Porcelain ceramic surface and glare-safe canvas", swatch: ok(0.975, 0.014, 86), deepTone: ok(0.89, 0.022, 86), lightWash: ok(0.992, 0.006, 86) },
] as const;

/** 5대 창작 컨텍스트 주얼-톤 다이나믹 팔레트. */
export const ATELIER_VIVID_PALETTES: readonly AtelierVividPalette[] = [
  {
    id: "ink-atelier", polarity: "light", labelKo: "잉크 아틀리에 · 선화 집중", labelEn: "Ink Atelier · Linework Focus",
    moodTagKo: "보태니컬 포레스트 + 웜 페이퍼 + 주홍 낙관", moodTagEn: "Botanical Forest + Warm Paper + Vermilion Seal",
    creativeContextKo: "펜선 · 펜촉 필압 · 원고 잉킹 집중 작업", creativeContextEn: "Dip-pen inking, pressure linework, and manuscript focus",
    craftNoteKo: "포슬린 아이보리 원고지 위에 에메랄드 에나멜 버튼과 주홍 잉크 낙관으로 선명한 시선 위계를 세웁니다.",
    craftNoteEn: "Balances porcelain paper with emerald enamel controls and crisp vermilion seal cues.",
    corePigmentIds: ["emerald-botanical", "porcelain-ivory", "crimson-vermilion"],
    canvas: ok(0.975, 0.012, 86), surface: ok(0.946, 0.016, 84), elevated: ok(0.992, 0.006, 86),
    border: ok(0.84, 0.018, 86), borderStrong: ok(0.66, 0.032, 158), ink: ok(0.21, 0.024, 236), inkMuted: ok(0.41, 0.022, 220),
    primary: ok(0.43, 0.132, 158), onPrimary: ok(0.99, 0.006, 86), secondary: ok(0.962, 0.018, 86), onSecondary: ok(0.21, 0.024, 236),
    accent: ok(0.47, 0.19, 24), onAccent: ok(0.992, 0.006, 86), highlight: ok(0.78, 0.148, 76), specularRim: ok(0.995, 0.008, 86), focusRing: ok(0.43, 0.14, 158),
    meshStops: [
      { id: "emerald-mist", xPct: 16, yPct: 18, radiusPct: 58, alpha: 0.22, color: ok(0.76, 0.135, 158) },
      { id: "vermilion-seal", xPct: 86, yPct: 24, radiusPct: 48, alpha: 0.18, color: ok(0.74, 0.155, 24) },
      { id: "amber-paper-glow", xPct: 54, yPct: 88, radiusPct: 62, alpha: 0.2, color: ok(0.87, 0.105, 76) },
    ],
    ribbons: [
      { depth: "back", parallaxFactorPx: 6, scrollFactorPx: -8, strokeWidth: 22, alpha: 0.24, color: ok(0.72, 0.14, 158) },
      { depth: "mid", parallaxFactorPx: 12, scrollFactorPx: 6, strokeWidth: 14, alpha: 0.42, color: ok(0.64, 0.175, 24) },
      { depth: "front", parallaxFactorPx: 18, scrollFactorPx: 11, strokeWidth: 8, alpha: 0.72, color: ok(0.46, 0.145, 158) },
    ],
  },
  {
    id: "pigment-splash", polarity: "light", labelKo: "피그먼트 스플래시 · 채색 생동감", labelEn: "Pigment Splash · Color Vitality",
    moodTagKo: "코발트 + 앰버 골드 + 코랄 주홍 + 민트 틸", moodTagEn: "Cobalt + Amber Gold + Coral Vermilion + Mint Teal",
    creativeContextKo: "수채 · 과슈 · 다층 채색과 팔레트 혼색 작업", creativeContextEn: "Watercolor, gouache, and high-chroma pigment mixing sessions",
    craftNoteKo: "화방 안료 트레이에서 꺼낸 코발트·앰버·주홍·민트 틸을 고채도 주얼 메쉬로 펼쳐 채색 에너지를 끌어올립니다.",
    craftNoteEn: "Pairs ultramarine cobalt, sunlit ochre, coral vermilion, and mint teal for lively color work.",
    corePigmentIds: ["cobalt-ultramarine", "amber-ochre-gold", "crimson-vermilion", "emerald-botanical"],
    canvas: ok(0.974, 0.012, 86), surface: ok(0.944, 0.018, 82), elevated: ok(0.994, 0.006, 86),
    border: ok(0.83, 0.026, 230), borderStrong: ok(0.62, 0.068, 236), ink: ok(0.2, 0.032, 236), inkMuted: ok(0.4, 0.028, 228),
    primary: ok(0.44, 0.168, 236), onPrimary: ok(0.992, 0.006, 86), secondary: ok(0.845, 0.135, 76), onSecondary: ok(0.2, 0.03, 52),
    accent: ok(0.47, 0.195, 24), onAccent: ok(0.992, 0.006, 86), highlight: ok(0.68, 0.145, 168), specularRim: ok(0.995, 0.01, 86), focusRing: ok(0.44, 0.17, 236),
    meshStops: [
      { id: "cobalt-pool", xPct: 18, yPct: 22, radiusPct: 58, alpha: 0.24, color: ok(0.66, 0.16, 236) },
      { id: "amber-flare", xPct: 82, yPct: 18, radiusPct: 54, alpha: 0.26, color: ok(0.83, 0.155, 76) },
      { id: "mint-coral-bloom", xPct: 68, yPct: 86, radiusPct: 56, alpha: 0.22, color: ok(0.74, 0.145, 168) },
    ],
    ribbons: [
      { depth: "back", parallaxFactorPx: 7, scrollFactorPx: -10, strokeWidth: 24, alpha: 0.28, color: ok(0.8, 0.155, 76) },
      { depth: "mid", parallaxFactorPx: 14, scrollFactorPx: 7, strokeWidth: 15, alpha: 0.48, color: ok(0.62, 0.185, 24) },
      { depth: "front", parallaxFactorPx: 20, scrollFactorPx: 12, strokeWidth: 9, alpha: 0.78, color: ok(0.48, 0.17, 236) },
    ],
  },
  {
    id: "stage-cinema", polarity: "dark", labelKo: "스테이지 시네마 · 3D 가상 작업실", labelEn: "Stage Cinema · 3D Virtual Atelier",
    moodTagKo: "딥 사파이어 슬레이트 + 골드 림라이트 + 청록 스포트", moodTagEn: "Deep Sapphire Slate + Gold Rimlight + Teal Spotlight",
    creativeContextKo: "AtelierStage 3D 배경 배치 · 카메라 구도 · 광학 림라이트 연출", creativeContextEn: "AtelierStage 3D set layout, camera staging, and rim-light cinematography",
    craftNoteKo: "깊은 사파이어 무대 바탕에 앰버 골드 림라이트와 청록 스포트라이트로 3D 입체감과 조작 집중도를 함께 살립니다.",
    craftNoteEn: "Combines deep sapphire slate with warm gold rimlight and crisp teal spotlight telemetry.",
    corePigmentIds: ["cobalt-ultramarine", "amber-ochre-gold", "emerald-botanical"],
    canvas: ok(0.165, 0.032, 236), surface: ok(0.215, 0.036, 234), elevated: ok(0.265, 0.042, 232),
    border: ok(0.36, 0.045, 228), borderStrong: ok(0.56, 0.085, 184), ink: ok(0.96, 0.012, 86), inkMuted: ok(0.79, 0.022, 206),
    primary: ok(0.81, 0.155, 76), onPrimary: ok(0.18, 0.028, 52), secondary: ok(0.295, 0.052, 236), onSecondary: ok(0.96, 0.012, 86),
    accent: ok(0.76, 0.138, 184), onAccent: ok(0.16, 0.028, 224), highlight: ok(0.72, 0.145, 158), specularRim: ok(0.94, 0.075, 76), focusRing: ok(0.83, 0.155, 76),
    meshStops: [
      { id: "sapphire-depth", xPct: 20, yPct: 18, radiusPct: 62, alpha: 0.36, color: ok(0.46, 0.15, 236) },
      { id: "gold-rimlight", xPct: 84, yPct: 24, radiusPct: 52, alpha: 0.28, color: ok(0.8, 0.155, 76) },
      { id: "teal-spot", xPct: 52, yPct: 88, radiusPct: 56, alpha: 0.26, color: ok(0.72, 0.14, 184) },
    ],
    ribbons: [
      { depth: "back", parallaxFactorPx: 7, scrollFactorPx: -9, strokeWidth: 24, alpha: 0.3, color: ok(0.52, 0.155, 236) },
      { depth: "mid", parallaxFactorPx: 14, scrollFactorPx: 7, strokeWidth: 14, alpha: 0.52, color: ok(0.74, 0.14, 184) },
      { depth: "front", parallaxFactorPx: 20, scrollFactorPx: 12, strokeWidth: 8, alpha: 0.84, color: ok(0.82, 0.155, 76) },
    ],
  },
  {
    id: "story-editorial", polarity: "light", labelKo: "스토리 에디토리얼 · 연재 쇼케이스", labelEn: "Story Editorial · Webtoon Showcase",
    moodTagKo: "매거진 아이보리 + 선명 주홍 + 에메랄드 + 딥 잉크", moodTagEn: "Magazine Ivory + Vivid Vermilion + Emerald + Deep Ink",
    creativeContextKo: "웹툰 홈 쇼케이스 · 화별 표지 · 독자 공개 프레젠테이션", creativeContextEn: "Webtoon homepage showcase, episode covers, and editorial launch surfaces",
    craftNoteKo: "화보지 같은 포슬린 아이보리 지면에 선명한 크림슨 주홍 CTA와 에메랄드 인증 배지를 배치해 강렬한 첫인상을 만듭니다.",
    craftNoteEn: "Delivers editorial punch by pairing porcelain pages with vivid vermilion CTAs and emerald seals.",
    corePigmentIds: ["porcelain-ivory", "crimson-vermilion", "emerald-botanical", "cobalt-ultramarine"],
    canvas: ok(0.978, 0.012, 86), surface: ok(0.946, 0.016, 82), elevated: ok(0.995, 0.005, 86),
    border: ok(0.84, 0.018, 82), borderStrong: ok(0.6, 0.095, 24), ink: ok(0.19, 0.026, 236), inkMuted: ok(0.39, 0.022, 228),
    primary: ok(0.47, 0.198, 24), onPrimary: ok(0.992, 0.006, 86), secondary: ok(0.96, 0.016, 86), onSecondary: ok(0.19, 0.026, 236),
    accent: ok(0.44, 0.138, 158), onAccent: ok(0.992, 0.006, 86), highlight: ok(0.77, 0.15, 76), specularRim: ok(0.995, 0.008, 86), focusRing: ok(0.47, 0.195, 24),
    meshStops: [
      { id: "vermilion-edition", xPct: 16, yPct: 20, radiusPct: 54, alpha: 0.22, color: ok(0.7, 0.175, 24) },
      { id: "emerald-leaf", xPct: 84, yPct: 26, radiusPct: 52, alpha: 0.2, color: ok(0.72, 0.145, 158) },
      { id: "ochre-foil", xPct: 50, yPct: 90, radiusPct: 58, alpha: 0.22, color: ok(0.84, 0.135, 76) },
    ],
    ribbons: [
      { depth: "back", parallaxFactorPx: 6, scrollFactorPx: -8, strokeWidth: 22, alpha: 0.24, color: ok(0.82, 0.145, 76) },
      { depth: "mid", parallaxFactorPx: 13, scrollFactorPx: 6, strokeWidth: 14, alpha: 0.48, color: ok(0.56, 0.145, 158) },
      { depth: "front", parallaxFactorPx: 19, scrollFactorPx: 11, strokeWidth: 9, alpha: 0.8, color: ok(0.5, 0.195, 24) },
    ],
  },
  {
    id: "night-studio-glow", polarity: "dark", labelKo: "나이트 스튜디오 글로우 · 야간 마감", labelEn: "Night Studio Glow · Late Deadline",
    moodTagKo: "웜 옵시디언 + 앰버 데스크 램프 + 청옥 포인트", moodTagEn: "Warm Obsidian + Amber Desk Lamp + Jade Point",
    creativeContextKo: "장시간 야간 연재 마감 · 저자극 고대비 다크 작업 환경", creativeContextEn: "Overnight episode finishing with warm desk-lamp glow and low-strain contrast",
    craftNoteKo: "차가운 청보라 눈부심 대신 웜 옵시디언 바탕에 앰버 데스크 램프와 청옥 에나멜 신호로 따뜻한 야간 생동감을 유지합니다.",
    craftNoteEn: "Replaces cold purple glare with warm obsidian, amber lamp warmth, and celadon jade cues.",
    corePigmentIds: ["amber-ochre-gold", "emerald-botanical", "crimson-vermilion"],
    canvas: ok(0.16, 0.016, 64), surface: ok(0.21, 0.02, 66), elevated: ok(0.26, 0.024, 68),
    border: ok(0.36, 0.028, 68), borderStrong: ok(0.58, 0.088, 76), ink: ok(0.955, 0.012, 86), inkMuted: ok(0.78, 0.022, 80),
    primary: ok(0.8, 0.152, 76), onPrimary: ok(0.17, 0.022, 58), secondary: ok(0.285, 0.026, 68), onSecondary: ok(0.955, 0.012, 86),
    accent: ok(0.76, 0.138, 164), onAccent: ok(0.16, 0.024, 164), highlight: ok(0.68, 0.175, 24), specularRim: ok(0.94, 0.07, 76), focusRing: ok(0.82, 0.155, 76),
    meshStops: [
      { id: "amber-desk-lamp", xPct: 22, yPct: 16, radiusPct: 58, alpha: 0.3, color: ok(0.78, 0.15, 76) },
      { id: "jade-celadon", xPct: 82, yPct: 30, radiusPct: 52, alpha: 0.24, color: ok(0.7, 0.135, 164) },
      { id: "vermilion-ember", xPct: 56, yPct: 88, radiusPct: 52, alpha: 0.22, color: ok(0.62, 0.165, 24) },
    ],
    ribbons: [
      { depth: "back", parallaxFactorPx: 6, scrollFactorPx: -8, strokeWidth: 22, alpha: 0.28, color: ok(0.62, 0.16, 24) },
      { depth: "mid", parallaxFactorPx: 13, scrollFactorPx: 6, strokeWidth: 14, alpha: 0.5, color: ok(0.72, 0.138, 164) },
      { depth: "front", parallaxFactorPx: 19, scrollFactorPx: 11, strokeWidth: 8, alpha: 0.84, color: ok(0.81, 0.152, 76) },
    ],
  },
] as const;

const PALETTE_MAP: Readonly<Record<AtelierVividPaletteId, AtelierVividPalette>> = ATELIER_VIVID_PALETTES.reduce(
  (acc, item) => {
    acc[item.id] = item;
    return acc;
  },
  {} as Record<AtelierVividPaletteId, AtelierVividPalette>,
);

export function getAtelierVividPalette(id: AtelierVividPaletteId): AtelierVividPalette {
  return PALETTE_MAP[id] ?? ATELIER_VIVID_PALETTES[0];
}

/** 5대 팔레트 및 5원색 안료의 모든 OKLCH 토큰 수집. */
export function collectPaletteOklchTokens(palettes: readonly AtelierVividPalette[] = ATELIER_VIVID_PALETTES): readonly NamedOklchToken[] {
  const tokens: NamedOklchToken[] = [];
  for (const pigment of ATELIER_JEWEL_PIGMENTS) {
    tokens.push(
      { name: `pigment.${pigment.id}.swatch`, color: pigment.swatch },
      { name: `pigment.${pigment.id}.deepTone`, color: pigment.deepTone },
      { name: `pigment.${pigment.id}.lightWash`, color: pigment.lightWash },
    );
  }
  for (const p of palettes) {
    const pairs: readonly [string, OklchColor][] = [
      ["canvas", p.canvas], ["surface", p.surface], ["elevated", p.elevated], ["border", p.border],
      ["borderStrong", p.borderStrong], ["ink", p.ink], ["inkMuted", p.inkMuted], ["primary", p.primary],
      ["onPrimary", p.onPrimary], ["secondary", p.secondary], ["onSecondary", p.onSecondary], ["accent", p.accent],
      ["onAccent", p.onAccent], ["highlight", p.highlight], ["specularRim", p.specularRim], ["focusRing", p.focusRing],
    ];
    for (const [k, color] of pairs) tokens.push({ name: `${p.id}.${k}`, color });
    for (const stop of p.meshStops) tokens.push({ name: `${p.id}.mesh.${stop.id}`, color: stop.color });
    for (const ribbon of p.ribbons) tokens.push({ name: `${p.id}.ribbon.${ribbon.depth}`, color: ribbon.color });
  }
  return tokens;
}

/** 바이올렛 휴(265°~325°) 0% 불변식 검증기. */
export function verifyZeroVioletSlop(customTokens?: readonly NamedOklchToken[]): ZeroVioletAuditResult {
  const tokens = customTokens ?? collectPaletteOklchTokens();
  const offendingTokens: VioletViolationEntry[] = [];
  for (const entry of tokens) {
    const hueDeg = roundTo(normalizeHue(entry.color.h), 2);
    if (isForbiddenVioletHue(hueDeg)) offendingTokens.push({ name: entry.name, hueDeg });
  }
  const inspectedCount = tokens.length;
  const violetViolationCount = offendingTokens.length;
  const violetPercent = inspectedCount === 0 ? 0 : roundTo((violetViolationCount / inspectedCount) * 100, 2);
  return {
    inspectedCount, violetViolationCount, violetPercent,
    minForbiddenHue: VIOLET_HUE_MIN, maxForbiddenHue: VIOLET_HUE_MAX,
    offendingTokens, passed: violetViolationCount === 0,
  };
}

/** 팔레트 전 텍스트·버튼 조합 WCAG 2.2 AA(>= 4.5:1) 자동 감사. */
export function auditPaletteContrast(paletteId: AtelierVividPaletteId): PaletteContrastAudit {
  const p = getAtelierVividPalette(paletteId);
  const pairs: readonly { readonly roleId: ContrastPairRoleId; readonly labelKo: string; readonly labelEn: string; readonly fg: OklchColor; readonly bg: OklchColor }[] = [
    { roleId: "body-on-canvas", labelKo: "본문 잉크 / 캔버스", labelEn: "Body Ink / Canvas", fg: p.ink, bg: p.canvas },
    { roleId: "muted-on-surface", labelKo: "보조 텍스트 / 표면", labelEn: "Muted Text / Surface", fg: p.inkMuted, bg: p.surface },
    { roleId: "primary-enamel", labelKo: "주 에나멜 버튼", labelEn: "Primary Enamel Button", fg: p.onPrimary, bg: p.primary },
    { roleId: "secondary-ceramic", labelKo: "세라믹 보조 버튼", labelEn: "Secondary Ceramic Button", fg: p.onSecondary, bg: p.secondary },
    { roleId: "accent-badge", labelKo: "도구 에나멜 배지", labelEn: "Tool Jewel Badge", fg: p.onAccent, bg: p.accent },
    { roleId: "ink-on-elevated", labelKo: "카드 제목 / 입체 카드", labelEn: "Card Heading / Elevated", fg: p.ink, bg: p.elevated },
  ];
  const rows: PaletteContrastRow[] = pairs.map((pair) => {
    const wcagRatio = computeWcagContrastRatio(pair.fg, pair.bg);
    const apcaLc = computeApcaContrastLc(pair.fg, pair.bg);
    const passesAa = wcagRatio >= WCAG_AA_MIN_RATIO;
    const grade: "AAA" | "AA" | "FAIL" = wcagRatio >= 7 ? "AAA" : passesAa ? "AA" : "FAIL";
    return { roleId: pair.roleId, labelKo: pair.labelKo, labelEn: pair.labelEn, foreground: pair.fg, background: pair.bg, wcagRatio, apcaLc, passesAa, grade };
  });
  const worstWcagRatio = rows.reduce((min, r) => Math.min(min, r.wcagRatio), Number.POSITIVE_INFINITY);
  return { paletteId: p.id, minRequiredRatio: WCAG_AA_MIN_RATIO, rows, worstWcagRatio: Number.isFinite(worstWcagRatio) ? worstWcagRatio : 1, allPassAa: rows.every((r) => r.passesAa) };
}

export function auditAllVividPalettesContrast(): readonly PaletteContrastAudit[] {
  return ATELIER_VIVID_PALETTES.map((p) => auditPaletteContrast(p.id));
}

const BUTTON_VARIANT_META: Readonly<Record<TactileButtonVariantId, {
  readonly labelKo: string; readonly labelEn: string; readonly badgeTagKo: string; readonly badgeTagEn: string;
  readonly activeScale: number; readonly hoverScale: number; readonly topSpecularPx: number;
  readonly innerBevelBorderPx: number; readonly shadowLayerCount: number;
}>> = {
  "primary-enamel": { labelKo: "주 에나멜 버튼", labelEn: "Primary Enamel", badgeTagKo: "1px 광택 + 2단 그림자 + 0.97 프레스", badgeTagEn: "1px Specular + 2-Tier Shadow + 0.97 Press", activeScale: PRIMARY_PRESS_SCALE, hoverScale: 1.015, topSpecularPx: 1, innerBevelBorderPx: 1, shadowLayerCount: 2 },
  "secondary-ceramic": { labelKo: "세라믹 표면 버튼", labelEn: "Secondary Ceramic", badgeTagKo: "도자기 유약 림 + 2단 접지 그림자", badgeTagEn: "Ceramic Glaze Rim + 2-Tier Ground Shadow", activeScale: 0.98, hoverScale: 1.01, topSpecularPx: 1, innerBevelBorderPx: 1, shadowLayerCount: 2 },
  "tool-jewel-badge": { labelKo: "도구 에나멜 배지", labelEn: "Tool Jewel Badge", badgeTagKo: "주얼 안료 코어 + 음각 베벨 링", badgeTagEn: "Jewel Pigment Core + Recessed Bevel Ring", activeScale: 0.96, hoverScale: 1.02, topSpecularPx: 1, innerBevelBorderPx: 1, shadowLayerCount: 2 },
  "ghost-ink-pill": { labelKo: "보조 잉크 필", labelEn: "Ghost Ink Pill", badgeTagKo: "투명 잉크 워시 + 경량 필 응답", badgeTagEn: "Translucent Ink Wash + Lightweight Pill", activeScale: 0.985, hoverScale: 1.005, topSpecularPx: 0, innerBevelBorderPx: 1, shadowLayerCount: 1 },
};

export const TACTILE_BUTTON_VARIANTS: readonly TactileButtonVariantId[] = [
  "primary-enamel", "secondary-ceramic", "tool-jewel-badge", "ghost-ink-pill",
] as const;

/** 입체 에나멜 버튼 & 도구 배지 4단계 상태 물리 모델. */
export function evaluateTactileButtonSpec(input: TactileButtonSpecInput): TactileButtonSpec {
  const palette = getAtelierVividPalette(input.paletteId);
  const meta = BUTTON_VARIANT_META[input.variant] ?? BUTTON_VARIANT_META["primary-enamel"];
  const reducedMotion = Boolean(input.reducedMotion);
  const state = input.state;

  const isPrimary = input.variant === "primary-enamel";
  const isCeramic = input.variant === "secondary-ceramic";
  const isBadge = input.variant === "tool-jewel-badge";
  const backgroundOklch = isPrimary ? palette.primary : isCeramic ? palette.secondary : isBadge ? palette.accent : state === "hover" || state === "active" ? palette.surface : palette.elevated;
  const foregroundOklch = isPrimary ? palette.onPrimary : isCeramic ? palette.onSecondary : isBadge ? palette.onAccent : palette.ink;
  const borderOklch = isPrimary ? palette.primary : isCeramic ? palette.borderStrong : isBadge ? palette.accent : state === "focus" ? palette.focusRing : palette.border;
  const ambientShadowOklch = isPrimary ? palette.primary : isBadge ? palette.accent : palette.ink;

  const wcagContrastRatio = computeWcagContrastRatio(foregroundOklch, backgroundOklch);
  const scale = reducedMotion ? 1 : state === "active" ? meta.activeScale : state === "hover" ? meta.hoverScale : 1;
  const translateYPx = reducedMotion ? 0 : state === "active" ? 1 : state === "hover" ? -1.5 : 0;
  const durationMs = reducedMotion ? 0 : SPRING_PRESS_DURATION_MS;
  const springCurve = reducedMotion ? "linear" : "cubic-bezier(0.22, 1, 0.36, 1)";

  const specularAlpha = state === "active" ? 0.24 : 0.42;
  const bevelAlpha = palette.polarity === "dark" ? 0.34 : 0.22;
  const groundBlur = state === "active" ? 2 : state === "hover" ? 6 : 4;
  const ambientY = state === "active" ? 3 : state === "hover" ? 12 : 8;
  const ambientBlur = state === "active" ? 8 : state === "hover" ? 22 : 16;
  const ambientAlpha = input.variant === "ghost-ink-pill" ? 0.08 : state === "hover" ? 0.3 : 0.22;

  const shadowParts: string[] = [];
  if (meta.topSpecularPx > 0) shadowParts.push(`inset 0 ${meta.topSpecularPx}px 0 ${formatOklch(palette.specularRim, specularAlpha)}`);
  if (meta.innerBevelBorderPx > 0) shadowParts.push(`inset 0 -${meta.innerBevelBorderPx}px 0 ${formatOklch(palette.ink, bevelAlpha)}`);
  shadowParts.push(`0 1px ${groundBlur}px ${formatOklch(palette.ink, 0.16)}`);
  if (meta.shadowLayerCount >= 2) shadowParts.push(`0 ${ambientY}px ${ambientBlur}px -4px ${formatOklch(ambientShadowOklch, ambientAlpha)}`);
  if (state === "focus") shadowParts.push(`0 0 0 2px ${formatOklch(palette.canvas)}`, `0 0 0 4px ${formatOklch(palette.focusRing)}`);

  return {
    variant: input.variant, state, paletteId: palette.id, reducedMotion,
    labelKo: meta.labelKo, labelEn: meta.labelEn, badgeTagKo: meta.badgeTagKo, badgeTagEn: meta.badgeTagEn,
    backgroundOklch, foregroundOklch, borderOklch, specularHighlightOklch: palette.specularRim,
    ambientShadowOklch, focusRingOklch: palette.focusRing, wcagContrastRatio, passesWcagAa: wcagContrastRatio >= WCAG_AA_MIN_RATIO,
    scale, translateYPx, durationMs, springCurve,
    topSpecularPx: meta.topSpecularPx, innerBevelBorderPx: meta.innerBevelBorderPx, shadowLayerCount: meta.shadowLayerCount,
    boxShadowCss: shadowParts.join(", "),
    transformCss: reducedMotion ? "none" : `translate3d(0, ${translateYPx}px, 0) scale(${scale})`,
    transitionProperty: reducedMotion ? "none" : "transform, box-shadow, background-color, border-color",
    minHitAreaPx: MIN_HIT_AREA_PX,
  };
}

/** 잉크 물결(Ink Ripple) 지수 감쇠 커브 계산. */
export function computeInkRippleDecay(rippleAgeMs: number, rippleActive: boolean, reducedMotion: boolean): InkRippleFrame {
  if (reducedMotion || !rippleActive) return { active: false, ageMs: 0, progress: 0, radiusPct: 0, opacity: 0 };
  const safeAge = clamp(rippleAgeMs, 0, INK_RIPPLE_DURATION_MS);
  const t = clamp01(safeAge / INK_RIPPLE_DURATION_MS);
  const radiusPct = roundTo((1 - Math.exp(-3.4 * t)) * 100, 2);
  const opacity = t >= 1 ? 0 : roundTo(Math.max(0, (1 - t) * Math.exp(-1.55 * t) * 0.56), 3);
  return { active: t < 1, ageMs: roundTo(safeAge, 1), progress: roundTo(t, 3), radiusPct, opacity };
}

/** 실시간 캔버스 컨텍스트 연동 동적 메쉬 그라데이션 CSS 생성(순수 OKLCH). */
export function buildDynamicMeshGradientCss(
  palette: AtelierVividPalette, pointerX: number, pointerY: number, scrollProgress: number, reducedMotion: boolean,
): string {
  const nx = reducedMotion ? 0 : clamp(pointerX, -1, 1);
  const ny = reducedMotion ? 0 : clamp(pointerY, -1, 1);
  const sp = reducedMotion ? 0 : clamp01(scrollProgress);
  const layers = palette.meshStops.map((stop, idx) => {
    const drift = idx === 0 ? 10 : idx === 1 ? -12 : 8;
    const x = roundTo(clamp(stop.xPct + nx * drift, 4, 96), 1);
    const y = roundTo(clamp(stop.yPct + ny * drift + (sp - 0.5) * (idx === 1 ? -14 : 12), 4, 96), 1);
    return `radial-gradient(${stop.radiusPct}% ${stop.radiusPct}% at ${x}% ${y}%, ${formatOklch(stop.color, stop.alpha)} 0%, ${formatOklch(stop.color, 0)} 74%)`;
  });
  layers.push(`linear-gradient(155deg, ${formatOklch(palette.elevated)} 0%, ${formatOklch(palette.canvas)} 100%)`);
  return layers.join(", ");
}

/** 포인터·스크롤 연동 마이크로-시어터 역동성 계산기(±4.5° 클램프 + reduced-motion 0 스냅). */
export function computeMicroTheaterKinematics(input: MicroTheaterKinematicsInput): MicroTheaterKinematics {
  const palette = getAtelierVividPalette(input.paletteId ?? "pigment-splash");
  const reducedMotion = Boolean(input.reducedMotion);
  const normalizedPointerX = roundTo(clamp(input.pointerX, -1, 1), 3);
  const normalizedPointerY = roundTo(clamp(input.pointerY, -1, 1), 3);
  const scrollProgress = roundTo(clamp01(input.scrollProgress ?? 0), 3);

  const rotateYDeg = reducedMotion ? 0 : roundTo(clamp(normalizedPointerX * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG), 2);
  const rotateXDeg = reducedMotion ? 0 : roundTo(clamp(-normalizedPointerY * MAX_TILT_DEG, -MAX_TILT_DEG, MAX_TILT_DEG), 2);
  const tiltMagnitudeDeg = reducedMotion ? 0 : roundTo(Math.min(MAX_TILT_DEG, Math.hypot(rotateXDeg, rotateYDeg)), 2);
  const specularShiftXPct = reducedMotion ? 50 : roundTo(50 + normalizedPointerX * 34, 1);
  const specularShiftYPct = reducedMotion ? 50 : roundTo(50 + normalizedPointerY * 32, 1);

  const ribbonFrames = palette.ribbons.map((r): RibbonParallaxFrame => ({
    depth: r.depth,
    offsetXPx: reducedMotion ? 0 : roundTo(normalizedPointerX * r.parallaxFactorPx, 2),
    offsetYPx: reducedMotion ? 0 : roundTo(normalizedPointerY * r.parallaxFactorPx * 0.72, 2),
    scrollShiftYPx: reducedMotion ? 0 : roundTo((scrollProgress - 0.5) * 2 * r.scrollFactorPx, 2),
    strokeWidth: r.strokeWidth,
    strokeCss: formatOklch(r.color, r.alpha),
    fillCss: formatOklch(r.color, roundTo(r.alpha * 0.28, 2)),
  })) as unknown as readonly [RibbonParallaxFrame, RibbonParallaxFrame, RibbonParallaxFrame];

  const inkRipple = computeInkRippleDecay(input.rippleAgeMs ?? 0, Boolean(input.rippleActive), reducedMotion);
  const cardTransformCss = reducedMotion ? "none" : `perspective(960px) rotateX(${rotateXDeg}deg) rotateY(${rotateYDeg}deg)`;
  const meshGradientCss = buildDynamicMeshGradientCss(palette, normalizedPointerX, normalizedPointerY, scrollProgress, reducedMotion);

  return {
    normalizedPointerX, normalizedPointerY, scrollProgress, reducedMotion, maxTiltDeg: MAX_TILT_DEG,
    rotateXDeg, rotateYDeg, tiltMagnitudeDeg, specularShiftXPct, specularShiftYPct,
    ribbonFrames, inkRipple, cardTransformCss, meshGradientCss,
    motionSafe: reducedMotion || (Math.abs(rotateXDeg) <= MAX_TILT_DEG && Math.abs(rotateYDeg) <= MAX_TILT_DEG),
  };
}

/** 생성형 CSS 변수 시트 내보내기(순수 OKLCH + prefers-reduced-motion 안전 가드). */
export function exportAtelierVividCssVariables(paletteId: AtelierVividPaletteId, options?: AtelierVividCssExportOptions): string {
  const palette = getAtelierVividPalette(paletteId);
  const reducedMotion = Boolean(options?.reducedMotion);
  const primarySpec = evaluateTactileButtonSpec({ variant: "primary-enamel", state: "rest", paletteId: palette.id, reducedMotion });
  const meshCss = buildDynamicMeshGradientCss(palette, options?.pointerX ?? 0, options?.pointerY ?? 0, options?.scrollProgress ?? 0.25, reducedMotion);

  return [
    `/* AtelierVivid Jewel-Tone CSS Tokens — ${palette.id} (0% Violet 265-325deg · WCAG 2.2 AA) */`,
    `:root[data-atelier-vivid="${palette.id}"] {`,
    `  --atelier-vivid-canvas: ${formatOklch(palette.canvas)};`,
    `  --atelier-vivid-surface: ${formatOklch(palette.surface)};`,
    `  --atelier-vivid-elevated: ${formatOklch(palette.elevated)};`,
    `  --atelier-vivid-border: ${formatOklch(palette.border)};`,
    `  --atelier-vivid-border-strong: ${formatOklch(palette.borderStrong)};`,
    `  --atelier-vivid-ink: ${formatOklch(palette.ink)};`,
    `  --atelier-vivid-ink-muted: ${formatOklch(palette.inkMuted)};`,
    `  --atelier-vivid-primary: ${formatOklch(palette.primary)};`,
    `  --atelier-vivid-on-primary: ${formatOklch(palette.onPrimary)};`,
    `  --atelier-vivid-secondary: ${formatOklch(palette.secondary)};`,
    `  --atelier-vivid-on-secondary: ${formatOklch(palette.onSecondary)};`,
    `  --atelier-vivid-accent: ${formatOklch(palette.accent)};`,
    `  --atelier-vivid-on-accent: ${formatOklch(palette.onAccent)};`,
    `  --atelier-vivid-highlight: ${formatOklch(palette.highlight)};`,
    `  --atelier-vivid-focus-ring: ${formatOklch(palette.focusRing)};`,
    `  --atelier-vivid-mesh-bg: ${meshCss};`,
    `  --atelier-vivid-btn-enamel-shadow: ${primarySpec.boxShadowCss};`,
    `  --atelier-vivid-btn-press-scale: ${reducedMotion ? 1 : PRIMARY_PRESS_SCALE};`,
    `  --atelier-vivid-btn-press-ms: ${primarySpec.durationMs}ms;`,
    `  --atelier-vivid-btn-transition: ${primarySpec.transitionProperty};`,
    `  --atelier-vivid-max-tilt-deg: ${reducedMotion ? 0 : MAX_TILT_DEG}deg;`,
    `}`,
    ``,
    `@media (prefers-reduced-motion: reduce) {`,
    `  :root[data-atelier-vivid="${palette.id}"] {`,
    `    --atelier-vivid-btn-press-scale: 1;`,
    `    --atelier-vivid-btn-press-ms: 0ms;`,
    `    --atelier-vivid-btn-transition: none;`,
    `    --atelier-vivid-max-tilt-deg: 0deg;`,
    `  }`,
    `}`,
  ].join("\n");
}

/** JSON 매니페스트 내보내기. */
export function exportAtelierVividManifestJson(snapshot: AtelierVividSnapshot): string {
  return JSON.stringify(
    {
      schemaVersion: snapshot.schemaVersion,
      paletteId: snapshot.palette.id,
      polarity: snapshot.palette.polarity,
      labelKo: snapshot.palette.labelKo,
      labelEn: snapshot.palette.labelEn,
      craftScore: snapshot.craftScore,
      violetAudit: snapshot.violetAudit,
      contrastAudit: {
        worstWcagRatio: snapshot.contrastAudit.worstWcagRatio,
        allPassAa: snapshot.contrastAudit.allPassAa,
        rows: snapshot.contrastAudit.rows.map((r) => ({ roleId: r.roleId, wcagRatio: r.wcagRatio, apcaLc: r.apcaLc, grade: r.grade })),
      },
      kinematics: {
        reducedMotion: snapshot.kinematics.reducedMotion,
        maxTiltDeg: snapshot.kinematics.maxTiltDeg,
        rotateXDeg: snapshot.kinematics.rotateXDeg,
        rotateYDeg: snapshot.kinematics.rotateYDeg,
        specularShiftXPct: snapshot.kinematics.specularShiftXPct,
        specularShiftYPct: snapshot.kinematics.specularShiftYPct,
      },
      buttonSpecs: snapshot.buttonSpecs.map((b) => ({
        variant: b.variant, state: b.state, scale: b.scale, durationMs: b.durationMs,
        wcagContrastRatio: b.wcagContrastRatio, passesWcagAa: b.passesWcagAa, transitionProperty: b.transitionProperty,
      })),
    },
    null,
    2,
  );
}

/** 통합 스냅샷 빌더. */
export function buildAtelierVividSnapshot(input?: AtelierVividSnapshotInput): AtelierVividSnapshot {
  const palette = getAtelierVividPalette(input?.paletteId ?? "pigment-splash");
  const reducedMotion = Boolean(input?.reducedMotion);
  const buttonState = input?.buttonState ?? "rest";
  const violetAudit = verifyZeroVioletSlop();
  const allPaletteContrastAudits = auditAllVividPalettesContrast();
  const contrastAudit = allPaletteContrastAudits.find((a) => a.paletteId === palette.id) ?? auditPaletteContrast(palette.id);
  const buttonSpecs = TACTILE_BUTTON_VARIANTS.map((variant) =>
    evaluateTactileButtonSpec({ variant, state: buttonState, paletteId: palette.id, reducedMotion }),
  ) as unknown as readonly [TactileButtonSpec, TactileButtonSpec, TactileButtonSpec, TactileButtonSpec];
  const kinematics = computeMicroTheaterKinematics({
    pointerX: input?.pointerX ?? 0.25, pointerY: input?.pointerY ?? -0.18, scrollProgress: input?.scrollProgress ?? 0.35,
    rippleAgeMs: input?.rippleAgeMs ?? 0, rippleActive: Boolean(input?.rippleActive), reducedMotion, paletteId: palette.id,
  });
  const craftScore =
    (violetAudit.passed ? 35 : 0) +
    (allPaletteContrastAudits.every((a) => a.allPassAa) ? 30 : 0) +
    (buttonSpecs.every((b) => b.passesWcagAa) ? 20 : 0) +
    (kinematics.motionSafe ? 15 : 0);

  return { schemaVersion: ATELIER_VIVID_SCHEMA_VERSION, palette, violetAudit, contrastAudit, allPaletteContrastAudits, buttonSpecs, kinematics, craftScore };
}
