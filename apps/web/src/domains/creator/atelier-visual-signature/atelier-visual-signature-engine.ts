/**
 * Wave 59C — 아틀리에 하드웨어 비주얼 시그니처 엔진.
 *
 * - 4종 정본 3단 표면 사다리(Warm Alabaster · Ink Obsidian · Hanok Sepia · WCAG AAA Ultra)
 * - 전 색상 OKLCH 구조체 전용(원시 색상 표기 0건, 바이올렛 휴 270~320° 완전 배제)
 * - OKLCH → Linear sRGB → WCAG 2.2 상대 휘도 대비비(Contrast Ratio) & APCA 지각 대비(Lc) 실측 수식
 * - 동심원 곡률(outerRadiusPx === innerRadiusPx + paddingPx) · 8pt 리듬 · 85/10/5 시각 위계 감사
 * - 카메라 렌즈·하드웨어 감성 15° 로터리 다이얼 디텐트·관성 스냅 물리 모델 & 브러시 그레인 스와치
 * - 순수 결정론적 TypeScript 엔진(DOM · 저장소 · 네트워크 의존 0건)
 */

export const VIOLET_HUE_MIN = 270;
export const VIOLET_HUE_MAX = 320;
export const DEFAULT_DETENT_STEP_DEG = 15;
export const DEFAULT_SNAP_WINDOW_DEG = 6;
export const RHYTHM_BASE_UNIT_PX = 8;

export type AtelierSurfaceThemeId = "warm-alabaster" | "ink-obsidian" | "hanok-sepia" | "wcag-aaa-ultra";
export type ContrastRoleId = "body" | "caption" | "button" | "focus-ring" | "accent-signal";
export type RotaryDialModeId = "canvas-rotation" | "brush-angle" | "zoom-magnification";
export type BrushGrainSwatchId = "hanji-mulberry" | "gpen-bristol" | "charcoal-laid" | "watercolor-rough" | "marker-vellum";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; }
export interface SurfaceLadderTier {
  readonly tier: 1 | 2 | 3;
  readonly tokenName: "--atelier-surface-canvas" | "--atelier-surface-panel" | "--atelier-surface-instrument";
  readonly labelKo: string; readonly labelEn: string; readonly roleKo: string; readonly roleEn: string;
  readonly color: OklchColor;
}
export interface AtelierSurfaceTheme {
  readonly id: AtelierSurfaceThemeId; readonly polarity: "light" | "dark";
  readonly labelKo: string; readonly labelEn: string; readonly craftNoteKo: string; readonly craftNoteEn: string;
  readonly accentNameKo: string; readonly accentNameEn: string; readonly accentHueDeg: number;
  readonly contrastStandard: "WCAG-AA" | "WCAG-AAA"; readonly minWcagRatio: number; readonly minApcaAbsLc: number;
  readonly glareReductionPercent: number; readonly blueLightAttenuationPercent: number;
  readonly canvas: OklchColor; readonly panel: OklchColor; readonly instrument: OklchColor;
  readonly line: OklchColor; readonly lineStrong: OklchColor; readonly ink: OklchColor; readonly inkMuted: OklchColor;
  readonly accent: OklchColor; readonly onAccent: OklchColor; readonly focusRing: OklchColor;
  readonly good: OklchColor; readonly warn: OklchColor; readonly bad: OklchColor;
  readonly ladder: readonly [SurfaceLadderTier, SurfaceLadderTier, SurfaceLadderTier];
}
export interface ContrastAuditRow {
  readonly roleId: ContrastRoleId; readonly labelKo: string; readonly labelEn: string;
  readonly foreground: OklchColor; readonly background: OklchColor;
  readonly foregroundLuminanceY: number; readonly backgroundLuminanceY: number;
  readonly wcagContrastRatio: number; readonly apcaLc: number; readonly apcaAbsLc: number;
  readonly passesAa: boolean; readonly passesAaa: boolean; readonly passesApcaTarget: boolean;
  readonly grade: "AAA" | "AA" | "FAIL";
}
export interface ThemeTypographyContrastAudit {
  readonly themeId: AtelierSurfaceThemeId; readonly contrastStandard: "WCAG-AA" | "WCAG-AAA";
  readonly minWcagRatio: number; readonly minApcaAbsLc: number;
  readonly rows: readonly ContrastAuditRow[];
  readonly worstWcagRatio: number; readonly worstApcaAbsLc: number;
  readonly allPassAa: boolean; readonly allPassAaa: boolean; readonly allMeetThemeTarget: boolean;
}
export interface ConcentricGeometryInput {
  readonly innerRadiusPx: number; readonly paddingPx: number;
  readonly outerRadiusPx?: number; readonly controlGapPx?: number;
  readonly neutralSurfacePercent?: number; readonly inkChromePercent?: number; readonly accentSignalPercent?: number;
}
export interface VisualHierarchyBalanceAudit {
  readonly neutralSurfacePercent: number; readonly inkChromePercent: number; readonly accentSignalPercent: number;
  readonly totalPercent: number; readonly neutralDeficitPercent: number; readonly accentExcessPercent: number;
  readonly passesBalanceRule: boolean;
}
export interface ConcentricGeometryAudit {
  readonly outerRadiusPx: number; readonly recommendedOuterRadiusPx: number;
  readonly innerRadiusPx: number; readonly paddingPx: number;
  readonly controlRadiusPx: number; readonly controlGapPx: number;
  readonly errorPx: number; readonly isConcentricExact: boolean; readonly rhythmUnitPx: number;
  readonly isPaddingOn4ptGrid: boolean; readonly isPaddingOn8ptGrid: boolean;
  readonly isOuterOn4ptGrid: boolean; readonly is8ptRhythmAligned: boolean;
  readonly recommended8ptPaddingPx: number; readonly visualBalance: VisualHierarchyBalanceAudit;
  readonly geometryScore: number;
}
export interface RotaryDialInput {
  readonly rawAngleDeg: number; readonly angularVelocityDegPerSec?: number;
  readonly detentStepDeg?: number; readonly snapWindowDeg?: number;
  readonly snapEnabled?: boolean; readonly mode?: RotaryDialModeId;
}
export interface RotaryTickMark {
  readonly index: number; readonly angleDeg: number; readonly kind: "cardinal" | "major" | "minor";
}
export interface RotaryDialEvaluation {
  readonly mode: RotaryDialModeId; readonly rawAngleDeg: number; readonly angularVelocityDegPerSec: number;
  readonly projectedAngleDeg: number; readonly detentStepDeg: number; readonly nearestDetentDeg: number;
  readonly detentOffsetDeg: number; readonly snappedAngleDeg: number; readonly normalizedAngleDeg: number;
  readonly signedAngleDeg: number; readonly detentIndex: number; readonly detentEngaged: boolean;
  readonly isCardinal90: boolean; readonly hapticPulseStrength: number; readonly zoomPercent: number;
  readonly readoutAngleText: string; readonly readoutZoomText: string; readonly tickMarks: readonly RotaryTickMark[];
}
export interface BrushGrainSwatch {
  readonly id: BrushGrainSwatchId; readonly labelKo: string; readonly labelEn: string;
  readonly paperWeightGsm: number; readonly toothDensity: number; readonly inkAbsorbency: number;
  readonly grainSpacingPx: number; readonly craftNoteKo: string; readonly craftNoteEn: string;
  readonly baseTone: OklchColor; readonly grainTone: OklchColor; readonly strokeTone: OklchColor;
}
export interface VioletZeroAudit {
  readonly inspectedTokenCount: number; readonly violetTokenCount: number;
  readonly violetPercent: number; readonly passed: boolean;
}
export interface AtelierVisualSignatureSnapshot {
  readonly theme: AtelierSurfaceTheme;
  readonly contrastAudit: ThemeTypographyContrastAudit;
  readonly allThemeContrastAudits: readonly ThemeTypographyContrastAudit[];
  readonly concentricAudit: ConcentricGeometryAudit;
  readonly rotaryDial: RotaryDialEvaluation;
  readonly activeBrushSwatch: BrushGrainSwatch;
  readonly violetAudit: VioletZeroAudit;
  readonly overallSignatureScore: number;
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
  return !isForbiddenVioletHue(h) ? roundTo(h, 1) : h < 295 ? 245 : 345;
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
  const lPrime = l + 0.3963377774 * a + 0.2158037573 * b;
  const mPrime = l - 0.1055613458 * a - 0.0638541728 * b;
  const sPrime = l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lPrime * lPrime * lPrime;
  const m3 = mPrime * mPrime * mPrime;
  const s3 = sPrime * sPrime * sPrime;
  return [
    clamp01(4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3),
    clamp01(-1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3),
    clamp01(-0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3),
  ];
}

/** WCAG 2.2 상대 휘도 Y (ITU-R BT.709 선형 계수). */
export function computeRelativeLuminanceY(color: OklchColor): number {
  const [rLin, gLin, bLin] = oklchToLinearSrgb(color);
  return roundTo(0.2126 * rLin + 0.7152 * gLin + 0.0722 * bLin, 4);
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
  const [rLin, gLin, bLin] = oklchToLinearSrgb(color);
  const y =
    0.2126729 * Math.pow(linearChannelToSrgb(rLin), 2.4) +
    0.7151522 * Math.pow(linearChannelToSrgb(gLin), 2.4) +
    0.072175 * Math.pow(linearChannelToSrgb(bLin), 2.4);
  return y > 0.022 ? y : y + Math.pow(0.022 - y, 1.414);
}

/** APCA W3 0.0.98G-4g 지각 대비(Lc, 밝은 배경 양수 / 어두운 배경 음수). */
export function computeApcaPerceptualContrastLc(textColor: OklchColor, backgroundColor: OklchColor): number {
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

function makeTheme(
  spec: Omit<AtelierSurfaceTheme, "ladder"> & {
    readonly tier1Ko: string; readonly tier1En: string;
    readonly tier2Ko: string; readonly tier2En: string;
    readonly tier3Ko: string; readonly tier3En: string;
  },
): AtelierSurfaceTheme {
  const { tier1Ko, tier1En, tier2Ko, tier2En, tier3Ko, tier3En, ...base } = spec;
  return {
    ...base,
    ladder: [
      { tier: 1, tokenName: "--atelier-surface-canvas", labelKo: tier1Ko, labelEn: tier1En, roleKo: "원고 바탕(1단)", roleEn: "Tier 1 Canvas", color: base.canvas },
      { tier: 2, tokenName: "--atelier-surface-panel", labelKo: tier2Ko, labelEn: tier2En, roleKo: "작업대 패널(2단)", roleEn: "Tier 2 Panel", color: base.panel },
      { tier: 3, tokenName: "--atelier-surface-instrument", labelKo: tier3Ko, labelEn: tier3En, roleKo: "인스트루먼트(3단)", roleEn: "Tier 3 Instrument", color: base.instrument },
    ],
  };
}

export const ATELIER_SURFACE_THEMES: readonly AtelierSurfaceTheme[] = [
  makeTheme({
    id: "warm-alabaster", polarity: "light", labelKo: "웜 알라바스터 화실", labelEn: "Warm Alabaster Atelier",
    craftNoteKo: "알라바스터 종이 → 린넨 작업대 → 순백 인스트루먼트 3단 명도와 보태니컬 포레스트 포인트",
    craftNoteEn: "Alabaster paper to linen desk to pure instrument 3-tier ladder with Botanical Forest accent",
    accentNameKo: "보태니컬 포레스트 158°", accentNameEn: "Botanical Forest 158°", accentHueDeg: 158,
    contrastStandard: "WCAG-AA", minWcagRatio: 4.5, minApcaAbsLc: 60, glareReductionPercent: 78, blueLightAttenuationPercent: 24,
    canvas: ok(0.979, 0.008, 92), panel: ok(0.953, 0.012, 90), instrument: ok(1, 0, 90),
    line: ok(0.84, 0.012, 86), lineStrong: ok(0.68, 0.016, 84), ink: ok(0.2, 0.012, 75), inkMuted: ok(0.41, 0.014, 78),
    accent: ok(0.41, 0.112, 158), onAccent: ok(0.988, 0.004, 158), focusRing: ok(0.4, 0.12, 158),
    good: ok(0.42, 0.115, 158), warn: ok(0.46, 0.12, 72), bad: ok(0.44, 0.155, 26),
    tier1Ko: "알라바스터 종이", tier1En: "Alabaster Paper", tier2Ko: "린넨 작업대", tier2En: "Linen Desk", tier3Ko: "순백 인스트루먼트", tier3En: "Instrument Deck",
  }),
  makeTheme({
    id: "ink-obsidian", polarity: "dark", labelKo: "잉크 옵시디언 야간", labelEn: "Ink Obsidian Night",
    craftNoteKo: "눈부심 0% 먹물 슬레이트 3단 계층과 웜 앰버 72° 조도 신호로 장시간 야간 마감에 맞춤",
    craftNoteEn: "Zero-glare ink slate 3-tier surfaces paired with Warm Amber 72° cues for overnight deadlines",
    accentNameKo: "웜 앰버 72°", accentNameEn: "Warm Amber 72°", accentHueDeg: 72,
    contrastStandard: "WCAG-AA", minWcagRatio: 4.5, minApcaAbsLc: 60, glareReductionPercent: 100, blueLightAttenuationPercent: 82,
    canvas: ok(0.155, 0.012, 225), panel: ok(0.195, 0.014, 224), instrument: ok(0.24, 0.015, 222),
    line: ok(0.34, 0.015, 224), lineStrong: ok(0.48, 0.018, 220), ink: ok(0.955, 0.008, 88), inkMuted: ok(0.79, 0.012, 84),
    accent: ok(0.81, 0.145, 72), onAccent: ok(0.17, 0.018, 65), focusRing: ok(0.84, 0.15, 72),
    good: ok(0.8, 0.125, 158), warn: ok(0.84, 0.14, 78), bad: ok(0.74, 0.15, 28),
    tier1Ko: "먹물 슬레이트 바탕", tier1En: "Ink Slate Base", tier2Ko: "다크 작업 데크", tier2En: "Slate Panel", tier3Ko: "인스트루먼트 하우징", tier3En: "Instrument Housing",
  }),
  makeTheme({
    id: "hanok-sepia", polarity: "light", labelKo: "한옥 한지 세피아", labelEn: "Hanok Hanji Sepia",
    craftNoteKo: "청색광을 억제한 닥지 세피아 3단 표면과 테라코타 42° 포인트로 원고 채색 중립성 유지",
    craftNoteEn: "Blue-light-reduced hanji sepia surfaces and Terracotta 42° accents keeping color grading neutral",
    accentNameKo: "테라코타 42°", accentNameEn: "Terracotta 42°", accentHueDeg: 42,
    contrastStandard: "WCAG-AA", minWcagRatio: 4.5, minApcaAbsLc: 60, glareReductionPercent: 86, blueLightAttenuationPercent: 68,
    canvas: ok(0.938, 0.022, 82), panel: ok(0.902, 0.025, 80), instrument: ok(0.964, 0.018, 84),
    line: ok(0.77, 0.024, 76), lineStrong: ok(0.61, 0.028, 72), ink: ok(0.21, 0.022, 58), inkMuted: ok(0.39, 0.024, 62),
    accent: ok(0.43, 0.132, 42), onAccent: ok(0.985, 0.008, 86), focusRing: ok(0.42, 0.14, 42),
    good: ok(0.41, 0.112, 156), warn: ok(0.45, 0.125, 68), bad: ok(0.43, 0.15, 26),
    tier1Ko: "한지 세피아 원지", tier1En: "Hanji Sepia Sheet", tier2Ko: "송진 린넨 패널", tier2En: "Resin Linen Panel", tier3Ko: "닥지 인스트루먼트", tier3En: "Mulberry Deck",
  }),
  makeTheme({
    id: "wcag-aaa-ultra", polarity: "dark", labelKo: "WCAG AAA 초고대비", labelEn: "WCAG AAA Ultra",
    craftNoteKo: "전 항목 대비비 7:1 이상 및 APCA |Lc| 75 이상으로 저시력·밝은 야외 채광 환경 대응",
    craftNoteEn: "Every pair exceeds WCAG 7:1 and APCA |Lc| 75 for low-vision accessibility and bright outdoor light",
    accentNameKo: "시그널 앰버 78°", accentNameEn: "Signal Amber 78°", accentHueDeg: 78,
    contrastStandard: "WCAG-AAA", minWcagRatio: 7.0, minApcaAbsLc: 75, glareReductionPercent: 96, blueLightAttenuationPercent: 76,
    canvas: ok(0.115, 0.006, 225), panel: ok(0.15, 0.008, 225), instrument: ok(0.185, 0.009, 225),
    line: ok(0.58, 0.01, 222), lineStrong: ok(0.76, 0.012, 220), ink: ok(0.988, 0.004, 90), inkMuted: ok(0.885, 0.008, 88),
    accent: ok(0.875, 0.145, 78), onAccent: ok(0.11, 0.01, 60), focusRing: ok(0.89, 0.11, 205),
    good: ok(0.87, 0.13, 160), warn: ok(0.9, 0.14, 84), bad: ok(0.82, 0.135, 30),
    tier1Ko: "초고대비 옵시디언", tier1En: "Ultra Obsidian", tier2Ko: "고명암 작업 데크", tier2En: "High-Contrast Deck", tier3Ko: "인스트루먼트 쉘", tier3En: "Instrument Shell",
  }),
] as const;

export const ATELIER_BRUSH_GRAIN_SWATCHES: readonly BrushGrainSwatch[] = [
  {
    id: "hanji-mulberry", labelKo: "순지 닥섬유", labelEn: "Hanji Mulberry", paperWeightGsm: 180, toothDensity: 0.62, inkAbsorbency: 0.78, grainSpacingPx: 7,
    craftNoteKo: "긴 닥나무 섬유결이 먹선 번짐을 부드럽게 잡아줍니다.", craftNoteEn: "Long mulberry fibers gently hold ink feathering.",
    baseTone: ok(0.952, 0.018, 85), grainTone: ok(0.84, 0.022, 78), strokeTone: ok(0.24, 0.016, 65),
  },
  {
    id: "gpen-bristol", labelKo: "원고 브리스톨", labelEn: "G-Pen Bristol", paperWeightGsm: 220, toothDensity: 0.18, inkAbsorbency: 0.32, grainSpacingPx: 14,
    craftNoteKo: "매끄러운 표면으로 G펜 세선과 톤 붙이기에 끊김이 없습니다.", craftNoteEn: "Smooth hot-press finish built for crisp G-pen lineart.",
    baseTone: ok(0.985, 0.004, 90), grainTone: ok(0.91, 0.006, 90), strokeTone: ok(0.18, 0.01, 225),
  },
  {
    id: "charcoal-laid", labelKo: "목탄 레이드지", labelEn: "Charcoal Laid", paperWeightGsm: 260, toothDensity: 0.88, inkAbsorbency: 0.64, grainSpacingPx: 5,
    craftNoteKo: "일정한 횡골이 목탄·콘테의 거친 명암 입자를 살려냅니다.", craftNoteEn: "Rhythmic laid ribs catch dry charcoal and conte grain.",
    baseTone: ok(0.92, 0.016, 80), grainTone: ok(0.76, 0.02, 74), strokeTone: ok(0.25, 0.018, 60),
  },
  {
    id: "watercolor-rough", labelKo: "황목 수채지", labelEn: "Rough Cotton 300g", paperWeightGsm: 300, toothDensity: 0.94, inkAbsorbency: 0.92, grainSpacingPx: 4,
    craftNoteKo: "깊은 요철과 높은 흡수율로 습식 번짐과 드라이브러시를 표현합니다.", craftNoteEn: "Deep cold-press valleys support wet blooms and drybrush.",
    baseTone: ok(0.96, 0.014, 88), grainTone: ok(0.82, 0.018, 82), strokeTone: ok(0.41, 0.11, 158),
  },
  {
    id: "marker-vellum", labelKo: "마카 벨럼지", labelEn: "Marker Vellum", paperWeightGsm: 150, toothDensity: 0.12, inkAbsorbency: 0.21, grainSpacingPx: 18,
    craftNoteKo: "뒤배임 없는 반투명 표면으로 알코올 마카 그라데이션이 깔끔합니다.", craftNoteEn: "Bleed-resistant vellum tuned for clean marker washes.",
    baseTone: ok(0.972, 0.007, 96), grainTone: ok(0.895, 0.01, 94), strokeTone: ok(0.44, 0.13, 42),
  },
] as const;

export function getAtelierSurfaceTheme(themeId: AtelierSurfaceThemeId): AtelierSurfaceTheme {
  return ATELIER_SURFACE_THEMES.find((t) => t.id === themeId) ?? ATELIER_SURFACE_THEMES[0];
}
export function getBrushGrainSwatch(swatchId: BrushGrainSwatchId): BrushGrainSwatch {
  return ATELIER_BRUSH_GRAIN_SWATCHES.find((s) => s.id === swatchId) ?? ATELIER_BRUSH_GRAIN_SWATCHES[0];
}

function buildContrastRow(
  roleId: ContrastRoleId, labelKo: string, labelEn: string,
  foreground: OklchColor, background: OklchColor, minApcaAbsLc: number,
): ContrastAuditRow {
  const foregroundLuminanceY = computeRelativeLuminanceY(foreground);
  const backgroundLuminanceY = computeRelativeLuminanceY(background);
  const wcagContrastRatio = computeWcagContrastRatio(foreground, background);
  const apcaLc = computeApcaPerceptualContrastLc(foreground, background);
  const apcaAbsLc = roundTo(Math.abs(apcaLc), 1);
  const passesAa = wcagContrastRatio >= 4.5;
  const passesAaa = wcagContrastRatio >= 7.0;
  const passesApcaTarget = apcaAbsLc >= minApcaAbsLc;
  const grade: "AAA" | "AA" | "FAIL" = passesAaa ? "AAA" : passesAa ? "AA" : "FAIL";
  return {
    roleId, labelKo, labelEn, foreground, background, foregroundLuminanceY, backgroundLuminanceY,
    wcagContrastRatio, apcaLc, apcaAbsLc, passesAa, passesAaa, passesApcaTarget, grade,
  };
}

/** 테마 전 구간(본문·캡션·버튼·포커스 링·포인트 신호) WCAG 2.2 & APCA Lc 실측 감사. */
export function auditThemeTypographyContrast(themeId: AtelierSurfaceThemeId): ThemeTypographyContrastAudit {
  const theme = getAtelierSurfaceTheme(themeId);
  const rows: readonly ContrastAuditRow[] = [
    buildContrastRow("body", "본문 텍스트 (잉크/바탕)", "Body Text (Ink/Canvas)", theme.ink, theme.canvas, theme.minApcaAbsLc),
    buildContrastRow("caption", "캡션·메타 (보조/패널)", "Caption (Muted/Panel)", theme.inkMuted, theme.panel, theme.minApcaAbsLc),
    buildContrastRow("button", "주 버튼 라벨 (버튼/포인트)", "Primary Button (On-Accent)", theme.onAccent, theme.accent, theme.minApcaAbsLc),
    buildContrastRow("focus-ring", "포커스 링 (링/인스트루먼트)", "Focus Ring (Ring/Instrument)", theme.focusRing, theme.instrument, theme.minApcaAbsLc),
    buildContrastRow("accent-signal", "포인트 신호 (포인트/바탕)", "Accent Signal (Accent/Canvas)", theme.accent, theme.canvas, theme.minApcaAbsLc),
  ];
  const worstWcagRatio = Math.min(...rows.map((r) => r.wcagContrastRatio));
  const worstApcaAbsLc = Math.min(...rows.map((r) => r.apcaAbsLc));
  return {
    themeId: theme.id, contrastStandard: theme.contrastStandard, minWcagRatio: theme.minWcagRatio, minApcaAbsLc: theme.minApcaAbsLc,
    rows, worstWcagRatio, worstApcaAbsLc,
    allPassAa: rows.every((r) => r.passesAa), allPassAaa: rows.every((r) => r.passesAaa),
    allMeetThemeTarget: rows.every((r) => r.wcagContrastRatio >= theme.minWcagRatio && r.apcaAbsLc >= theme.minApcaAbsLc),
  };
}

export function auditAllThemesContrast(): readonly ThemeTypographyContrastAudit[] {
  return ATELIER_SURFACE_THEMES.map((theme) => auditThemeTypographyContrast(theme.id));
}

/** 동심원 곡률(outer === inner + padding) · 8pt 리듬 · 85/10/5 시각 위계 기하 감사기. */
export function auditConcentricGeometry(input: ConcentricGeometryInput): ConcentricGeometryAudit {
  const innerRadiusPx = Math.round(clamp(input.innerRadiusPx, 2, 48));
  const paddingPx = Math.round(clamp(input.paddingPx, 0, 48));
  const recommendedOuterRadiusPx = innerRadiusPx + paddingPx;
  const outerRadiusPx = input.outerRadiusPx === undefined ? recommendedOuterRadiusPx : Math.round(clamp(input.outerRadiusPx, 0, 96));
  const controlGapPx = Math.round(clamp(input.controlGapPx ?? 4, 2, 16));
  const controlRadiusPx = Math.max(2, innerRadiusPx - controlGapPx);
  const errorPx = Math.abs(outerRadiusPx - recommendedOuterRadiusPx);
  const isConcentricExact = errorPx === 0;
  const isPaddingOn4ptGrid = paddingPx % 4 === 0;
  const isPaddingOn8ptGrid = paddingPx % RHYTHM_BASE_UNIT_PX === 0;
  const isOuterOn4ptGrid = outerRadiusPx % 4 === 0;
  const is8ptRhythmAligned = isPaddingOn8ptGrid && isOuterOn4ptGrid;
  const recommended8ptPaddingPx = Math.max(RHYTHM_BASE_UNIT_PX, Math.round(paddingPx / RHYTHM_BASE_UNIT_PX) * RHYTHM_BASE_UNIT_PX);

  const neutralSurfacePercent = Math.round(clamp(input.neutralSurfacePercent ?? 85, 0, 100));
  const inkChromePercent = Math.round(clamp(input.inkChromePercent ?? 10, 0, 100));
  const accentSignalPercent = Math.round(clamp(input.accentSignalPercent ?? 5, 0, 100));
  const totalPercent = neutralSurfacePercent + inkChromePercent + accentSignalPercent;
  const neutralDeficitPercent = Math.max(0, 85 - neutralSurfacePercent);
  const accentExcessPercent = Math.max(0, accentSignalPercent - 5);
  const passesBalanceRule = totalPercent === 100 && neutralSurfacePercent >= 80 && inkChromePercent >= 8 && inkChromePercent <= 15 && accentSignalPercent <= 7;

  const visualBalance: VisualHierarchyBalanceAudit = {
    neutralSurfacePercent, inkChromePercent, accentSignalPercent, totalPercent, neutralDeficitPercent, accentExcessPercent, passesBalanceRule,
  };
  const concentricPoints = isConcentricExact ? 45 : Math.max(0, 45 - errorPx * 8);
  const rhythmPoints = is8ptRhythmAligned ? 25 : isPaddingOn4ptGrid ? 16 : 6;
  const balancePoints = passesBalanceRule ? 30 : Math.max(0, 30 - neutralDeficitPercent - accentExcessPercent * 2);

  return {
    outerRadiusPx, recommendedOuterRadiusPx, innerRadiusPx, paddingPx, controlRadiusPx, controlGapPx, errorPx, isConcentricExact,
    rhythmUnitPx: RHYTHM_BASE_UNIT_PX, isPaddingOn4ptGrid, isPaddingOn8ptGrid, isOuterOn4ptGrid, is8ptRhythmAligned,
    recommended8ptPaddingPx, visualBalance, geometryScore: Math.min(100, concentricPoints + rhythmPoints + balancePoints),
  };
}

function buildRotaryTickMarks(stepDeg: number): readonly RotaryTickMark[] {
  const safeStep = Math.max(5, Math.min(45, Math.round(stepDeg)));
  const count = Math.floor(360 / safeStep);
  const ticks: RotaryTickMark[] = [];
  for (let i = 0; i < count; i += 1) {
    const angleDeg = i * safeStep;
    const kind: RotaryTickMark["kind"] = angleDeg % 90 === 0 ? "cardinal" : angleDeg % 45 === 0 ? "major" : "minor";
    ticks.push({ index: i, angleDeg, kind });
  }
  return ticks;
}

function toSignedAngle(deg: number): number {
  const norm = normalizeHue(deg);
  if (deg < 0 && Math.abs(norm - 180) < 0.01) return -180;
  return norm > 180 ? roundTo(norm - 360, 1) : roundTo(norm, 1);
}

/** 카메라 렌즈·하드웨어 15° 로터리 다이얼 디텐트·관성 스냅 평가기. */
export function evaluateRotaryDialDetent(input: RotaryDialInput): RotaryDialEvaluation {
  const mode: RotaryDialModeId = input.mode ?? "canvas-rotation";
  const rawAngleDeg = Number.isFinite(input.rawAngleDeg) ? roundTo(input.rawAngleDeg, 1) : 0;
  const rawVel = input.angularVelocityDegPerSec;
  const angularVelocityDegPerSec = rawVel !== undefined && Number.isFinite(rawVel) ? clamp(rawVel, -720, 720) : 0;
  const rawStep = input.detentStepDeg;
  const detentStepDeg = Math.round(rawStep !== undefined && Number.isFinite(rawStep) ? clamp(rawStep, 5, 45) : DEFAULT_DETENT_STEP_DEG);
  const rawWin = input.snapWindowDeg;
  const snapWindowDeg = rawWin !== undefined && Number.isFinite(rawWin) ? clamp(rawWin, 0, detentStepDeg / 2) : Math.min(DEFAULT_SNAP_WINDOW_DEG, detentStepDeg / 2);
  const snapEnabled = input.snapEnabled ?? true;

  const inertiaTauSec = 0.065;
  const projectedAngleDeg = roundTo(rawAngleDeg + angularVelocityDegPerSec * inertiaTauSec, 1);
  const nearestDetentDeg = Math.round(projectedAngleDeg / detentStepDeg) * detentStepDeg;
  const detentOffsetDeg = roundTo(projectedAngleDeg - nearestDetentDeg, 1);
  const shouldSnap = snapEnabled && (Math.abs(detentOffsetDeg) <= snapWindowDeg || Math.abs(angularVelocityDegPerSec) >= 90);
  const snappedAngleDeg = shouldSnap ? nearestDetentDeg : projectedAngleDeg;

  const normalizedAngleDeg = roundTo(normalizeHue(snappedAngleDeg), 1);
  const signedAngleDeg = toSignedAngle(snappedAngleDeg);
  const detentCount = Math.max(1, Math.round(360 / detentStepDeg));
  const detentIndex = Math.round(normalizedAngleDeg / detentStepDeg) % detentCount;
  const isCardinal90 = Math.abs(normalizedAngleDeg % 90) < 0.01;
  const hapticPulseStrength = shouldSnap ? (isCardinal90 ? 1.0 : normalizedAngleDeg % 45 === 0 ? 0.72 : 0.45) : 0;
  const zoomPercent = Math.round(clamp(100 * Math.pow(2, signedAngleDeg / 60), 25, 800));
  const absSigned = Math.abs(signedAngleDeg).toFixed(1).padStart(5, "0");
  const signPrefix = signedAngleDeg > 0 ? "+" : signedAngleDeg < 0 ? "-" : " ";

  return {
    mode, rawAngleDeg, angularVelocityDegPerSec, projectedAngleDeg, detentStepDeg, nearestDetentDeg, detentOffsetDeg,
    snappedAngleDeg, normalizedAngleDeg, signedAngleDeg, detentIndex, detentEngaged: shouldSnap, isCardinal90,
    hapticPulseStrength, zoomPercent, readoutAngleText: `${signPrefix}${absSigned}°`, readoutZoomText: `${zoomPercent}%`,
    tickMarks: buildRotaryTickMarks(detentStepDeg),
  };
}

/** 4종 테마 및 5종 브러시 그레인 스와치 전체의 바이올렛 휴(270~320°) 0% 검증. */
export function auditVioletZeroPolicy(): VioletZeroAudit {
  let inspected = 0;
  let violetHits = 0;
  for (const t of ATELIER_SURFACE_THEMES) {
    for (const token of [t.canvas, t.panel, t.instrument, t.line, t.lineStrong, t.ink, t.inkMuted, t.accent, t.onAccent, t.focusRing, t.good, t.warn, t.bad]) {
      inspected += 1;
      if (isForbiddenVioletHue(token.h)) violetHits += 1;
    }
  }
  for (const s of ATELIER_BRUSH_GRAIN_SWATCHES) {
    for (const token of [s.baseTone, s.grainTone, s.strokeTone]) {
      inspected += 1;
      if (isForbiddenVioletHue(token.h)) violetHits += 1;
    }
  }
  return {
    inspectedTokenCount: inspected, violetTokenCount: violetHits,
    violetPercent: roundTo((violetHits / Math.max(1, inspected)) * 100, 1), passed: violetHits === 0,
  };
}

export function buildAtelierVisualSignatureSnapshot(params: {
  readonly themeId: AtelierSurfaceThemeId; readonly innerRadiusPx: number; readonly paddingPx: number;
  readonly rawAngleDeg: number; readonly angularVelocityDegPerSec?: number; readonly snapEnabled?: boolean;
  readonly dialMode?: RotaryDialModeId; readonly brushSwatchId?: BrushGrainSwatchId;
}): AtelierVisualSignatureSnapshot {
  const theme = getAtelierSurfaceTheme(params.themeId);
  const allThemeContrastAudits = auditAllThemesContrast();
  const contrastAudit = allThemeContrastAudits.find((a) => a.themeId === theme.id) ?? auditThemeTypographyContrast(theme.id);
  const concentricAudit = auditConcentricGeometry({ innerRadiusPx: params.innerRadiusPx, paddingPx: params.paddingPx });
  const rotaryDial = evaluateRotaryDialDetent({
    rawAngleDeg: params.rawAngleDeg, angularVelocityDegPerSec: params.angularVelocityDegPerSec ?? 0,
    snapEnabled: params.snapEnabled ?? true, mode: params.dialMode ?? "canvas-rotation",
  });
  const activeBrushSwatch = getBrushGrainSwatch(params.brushSwatchId ?? "hanji-mulberry");
  const violetAudit = auditVioletZeroPolicy();
  const allTargetsMet = allThemeContrastAudits.filter((a) => a.allMeetThemeTarget).length;
  const overallSignatureScore = Math.min(
    100,
    Math.round((allTargetsMet / allThemeContrastAudits.length) * 40) +
      Math.round((concentricAudit.geometryScore / 100) * 35) +
      (violetAudit.passed ? 15 : 0) +
      (rotaryDial.detentEngaged ? 10 : 8),
  );
  return { theme, contrastAudit, allThemeContrastAudits, concentricAudit, rotaryDial, activeBrushSwatch, violetAudit, overallSignatureScore };
}

/** 순수 OKLCH CSS 디자인 토큰 시트 생성(원시 색상 표기 0건). */
export function exportAtelierDesignTokensCss(snapshot: AtelierVisualSignatureSnapshot): string {
  const { theme, concentricAudit, rotaryDial, activeBrushSwatch } = snapshot;
  return [
    `/* ToonStudio Atelier Visual Signature — ${theme.id} (${theme.contrastStandard}) */`,
    `:root[data-atelier-theme="${theme.id}"] {`,
    `  --atelier-surface-canvas: ${formatOklch(theme.canvas)};`,
    `  --atelier-surface-panel: ${formatOklch(theme.panel)};`,
    `  --atelier-surface-instrument: ${formatOklch(theme.instrument)};`,
    `  --atelier-line: ${formatOklch(theme.line)};`,
    `  --atelier-line-strong: ${formatOklch(theme.lineStrong)};`,
    `  --atelier-ink: ${formatOklch(theme.ink)};`,
    `  --atelier-ink-muted: ${formatOklch(theme.inkMuted)};`,
    `  --atelier-accent: ${formatOklch(theme.accent)};`,
    `  --atelier-on-accent: ${formatOklch(theme.onAccent)};`,
    `  --atelier-focus-ring: ${formatOklch(theme.focusRing)};`,
    `  --atelier-good: ${formatOklch(theme.good)};`,
    `  --atelier-warn: ${formatOklch(theme.warn)};`,
    `  --atelier-bad: ${formatOklch(theme.bad)};`,
    `  --atelier-radius-outer: ${concentricAudit.outerRadiusPx}px;`,
    `  --atelier-radius-inner: ${concentricAudit.innerRadiusPx}px;`,
    `  --atelier-padding-shell: ${concentricAudit.paddingPx}px;`,
    `  --atelier-radius-control: ${concentricAudit.controlRadiusPx}px;`,
    `  --atelier-rhythm-unit: ${concentricAudit.rhythmUnitPx}px;`,
    `  --atelier-dial-angle: ${rotaryDial.snappedAngleDeg}deg;`,
    `  --atelier-dial-detent-step: ${rotaryDial.detentStepDeg}deg;`,
    `  --atelier-dial-zoom: ${rotaryDial.zoomPercent}%;`,
    `  --atelier-grain-swatch: "${activeBrushSwatch.id}";`,
    `  --atelier-grain-base: ${formatOklch(activeBrushSwatch.baseTone)};`,
    `}`,
  ].join("\n");
}

/** 아틀리에 비주얼 시그니처 결정론적 JSON 명세 생성. */
export function exportVisualSignatureJson(snapshot: AtelierVisualSignatureSnapshot): string {
  const { theme, contrastAudit, concentricAudit, rotaryDial, activeBrushSwatch, violetAudit } = snapshot;
  return JSON.stringify(
    {
      schemaVersion: "toonstudio.atelier-visual-signature.v1",
      evaluationScope: "deterministic-design-system-audit",
      theme: {
        id: theme.id, polarity: theme.polarity, labelKo: theme.labelKo, accentNameKo: theme.accentNameKo,
        accentHueDeg: theme.accentHueDeg, contrastStandard: theme.contrastStandard,
        surfaceLadder: theme.ladder.map((step) => ({ tier: step.tier, tokenName: step.tokenName, labelKo: step.labelKo, oklch: formatOklch(step.color) })),
      },
      contrastAudit: {
        allPassAa: contrastAudit.allPassAa, allPassAaa: contrastAudit.allPassAaa, allMeetThemeTarget: contrastAudit.allMeetThemeTarget,
        worstWcagRatio: contrastAudit.worstWcagRatio, worstApcaAbsLc: contrastAudit.worstApcaAbsLc,
        rows: contrastAudit.rows.map((row) => ({ roleId: row.roleId, wcagContrastRatio: row.wcagContrastRatio, apcaLc: row.apcaLc, grade: row.grade })),
      },
      concentricGeometry: {
        outerRadiusPx: concentricAudit.outerRadiusPx, innerRadiusPx: concentricAudit.innerRadiusPx, paddingPx: concentricAudit.paddingPx,
        controlRadiusPx: concentricAudit.controlRadiusPx, errorPx: concentricAudit.errorPx,
        isConcentricExact: concentricAudit.isConcentricExact, is8ptRhythmAligned: concentricAudit.is8ptRhythmAligned,
        visualBalance85105: concentricAudit.visualBalance,
      },
      rotaryDial: {
        mode: rotaryDial.mode, snappedAngleDeg: rotaryDial.snappedAngleDeg, detentStepDeg: rotaryDial.detentStepDeg,
        detentEngaged: rotaryDial.detentEngaged, isCardinal90: rotaryDial.isCardinal90,
        zoomPercent: rotaryDial.zoomPercent, readoutAngleText: rotaryDial.readoutAngleText,
      },
      activeBrushSwatch: {
        id: activeBrushSwatch.id, labelKo: activeBrushSwatch.labelKo, paperWeightGsm: activeBrushSwatch.paperWeightGsm,
        toothDensity: activeBrushSwatch.toothDensity, inkAbsorbency: activeBrushSwatch.inkAbsorbency,
      },
      violetZeroAudit: violetAudit,
      overallSignatureScore: snapshot.overallSignatureScore,
    },
    null,
    2,
  );
}
