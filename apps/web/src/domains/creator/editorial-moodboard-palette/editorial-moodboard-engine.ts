import { assertChromaticInput, requireFiniteMoodboard, requireOpaqueMoodboardColors } from "./moodboard-input-contract";

/**
 * Wave 45B — 탈-바이올렛 8대 에디토리얼 무드보드 · 5안료 스펙트럼 팔레트 엔진.
 *
 * - 8대 탈-바이올렛(hue 270~320도 완전 배제) 에디토리얼 아틀리에 프리셋 × 5안료(바탕·표면·먹·도메인·강조)
 * - 85/10/5 색채 비율 감사기(`auditChromaticBalance`): 편차, 바이올렛 AI 슬롭 탐지, OKLCH 기반 WCAG 2.1·APCA 대비
 * - 자동 보정(`autoRepairPaletteContrast`): 바이올렛 색상환 축출 및 WCAG 4.5:1·APCA 기준 충족 명도 보정
 * - 순수 시맨틱 SVG 포스터 프리뷰(`buildEditorialPosterSvg`, oklch 및 currentColor 전용) 및 CSS/JSON/CSP Swatch 내보내기
 */

export const EDITORIAL_MOODBOARD_PRESET_IDS = [
  "seoul-vermilion-ink", "kyoto-lacquer-gold", "youth-cobalt-citrus", "rofan-emerald-champagne",
  "noir-obsidian-amber", "slice-terracotta-mint", "fantasy-viridian-copper", "hanok-dancheong-hanji",
] as const;

export type EditorialMoodboardPresetId = (typeof EDITORIAL_MOODBOARD_PRESET_IDS)[number];
export const PIGMENT_ROLE_IDS = ["ground", "surface", "ink", "domain", "accent"] as const;
export type PigmentRoleId = (typeof PIGMENT_ROLE_IDS)[number];
export type PaletteTonePolarity = "light" | "dark";
export type WcagContrastGrade = "AAA" | "AA" | "AA-Large" | "Fail";
export type RatioBalanceStatus = "optimal" | "drift" | "imbalanced";
export type ChromaticAuditWarningSeverity = "critical" | "warn" | "info";
export type ChromaticAuditWarningCode =
  | "violet-slop-detected" | "contrast-below-aa" | "apca-below-threshold"
  | "ratio-sum-mismatch" | "neutral-field-crowded" | "accent-overused" | "domain-imbalanced";
export type ContrastPairId = "ink-on-ground" | "ink-on-surface" | "accent-on-ground" | "on-accent" | "domain-on-ground";
export type PaletteRepairActionKind = "detox-violet-hue" | "lift-wcag-contrast" | "align-on-accent" | "rebalance-ratio";

export interface OklchColor { readonly l: number; readonly c: number; readonly h: number; readonly alpha?: number; }
export interface LinearSrgbResult { readonly r: number; readonly g: number; readonly b: number; readonly inGamut: boolean; }
export interface SrgbChannelValues { readonly r: number; readonly g: number; readonly b: number; readonly a: number; readonly inGamut: boolean; }
export interface ChromaticRatioSpec { readonly neutralPct: number; readonly domainPct: number; readonly accentPct: number; }
export interface NamedOklchSample { readonly id: string; readonly labelKo: string; readonly labelEn: string; readonly color: OklchColor; }
export interface PigmentSpec {
  readonly role: PigmentRoleId; readonly nameKo: string; readonly nameEn: string;
  readonly usageKo: string; readonly usageEn: string; readonly color: OklchColor;
}
export interface EditorialMoodboardPreset {
  readonly id: EditorialMoodboardPresetId; readonly code: string; readonly polarity: PaletteTonePolarity;
  readonly nameKo: string; readonly nameEn: string; readonly subtitleKo: string; readonly subtitleEn: string;
  readonly genreTagsKo: readonly string[]; readonly genreTagsEn: readonly string[];
  readonly posterHeadlineKo: string; readonly posterHeadlineEn: string;
  readonly posterTaglineKo: string; readonly posterTaglineEn: string;
  readonly pigments: Readonly<Record<PigmentRoleId, PigmentSpec>>;
  readonly onAccent: OklchColor; readonly recommendedRatio: ChromaticRatioSpec;
}
export interface VioletSlopViolation {
  readonly slotId: string; readonly labelKo: string; readonly labelEn: string;
  readonly hue: number; readonly chroma: number; readonly color: OklchColor; readonly suggestedSafeHue: number;
}
export interface ContrastPairAudit {
  readonly pairId: ContrastPairId; readonly labelKo: string; readonly labelEn: string;
  readonly fgRole: string; readonly bgRole: string; readonly fg: OklchColor; readonly bg: OklchColor;
  readonly wcagRatio: number; readonly wcagGrade: WcagContrastGrade; readonly apcaLc: number; readonly apcaAbsLc: number;
  readonly minWcagRequired: number; readonly minApcaRequired: number; readonly passesWcagAa: boolean; readonly passesApca: boolean;
}
export interface RatioBalanceMetrics {
  readonly target: ChromaticRatioSpec; readonly input: ChromaticRatioSpec; readonly normalized: ChromaticRatioSpec;
  readonly rawSumPct: number; readonly neutralDeltaPct: number; readonly domainDeltaPct: number;
  readonly accentDeltaPct: number; readonly totalDeviationPct: number; readonly status: RatioBalanceStatus;
}
export interface ChromaticAuditWarning {
  readonly code: ChromaticAuditWarningCode; readonly severity: ChromaticAuditWarningSeverity;
  readonly titleKo: string; readonly titleEn: string; readonly detailKo: string; readonly detailEn: string;
}
export interface ChromaticBalanceAuditInput {
  readonly presetId?: EditorialMoodboardPresetId;
  readonly pigmentOverrides?: Partial<Record<PigmentRoleId, OklchColor>>;
  readonly onAccentOverride?: OklchColor;
  readonly ratio?: Partial<ChromaticRatioSpec>;
  readonly extraSamples?: readonly NamedOklchSample[];
}
export interface ChromaticBalanceAuditReport {
  readonly extraSamples?: readonly NamedOklchSample[];
  readonly preset: EditorialMoodboardPreset;
  readonly resolvedPigments: Readonly<Record<PigmentRoleId, PigmentSpec>>;
  readonly resolvedOnAccent: OklchColor; readonly ratio: RatioBalanceMetrics;
  readonly violetViolations: readonly VioletSlopViolation[];
  readonly inspectedColorCount: number; readonly violetSlopPct: number; readonly isVioletFree: boolean;
  readonly contrastPairs: readonly ContrastPairAudit[];
  readonly minWcagRatio: number; readonly minApcaAbsLc: number;
  readonly passingWcagPairCount: number; readonly totalContrastPairCount: number;
  readonly allPairsPassWcagAa: boolean; readonly allPairsPassApca: boolean;
  readonly warnings: readonly ChromaticAuditWarning[]; readonly overallScore: number;
}
export interface PaletteRepairRecord {
  readonly slotId: string; readonly action: PaletteRepairActionKind;
  readonly beforeLabel: string; readonly afterLabel: string; readonly noteKo: string; readonly noteEn: string;
}
export interface AutoRepairPaletteOptions { readonly targetWcagRatio?: number; readonly repairVioletSlop?: boolean; readonly rebalanceRatio?: boolean; }
export interface AutoRepairPaletteResult {
  readonly beforeAudit: ChromaticBalanceAuditReport; readonly afterAudit: ChromaticBalanceAuditReport;
  readonly repairedPigments: Readonly<Record<PigmentRoleId, OklchColor>>;
  readonly repairedOnAccent: OklchColor; readonly repairedRatio: ChromaticRatioSpec;
  readonly fixes: readonly PaletteRepairRecord[]; readonly fullyRepaired: boolean;
}
export interface BuildEditorialPosterSvgOptions { readonly headline?: string; readonly subtitle?: string; readonly issueLabel?: string; readonly locale?: "ko" | "en"; }

export const TARGET_CHROMATIC_RATIO: ChromaticRatioSpec = { neutralPct: 85, domainPct: 10, accentPct: 5 };
export const VIOLET_SLOP_HUE_MIN = 270;
export const VIOLET_SLOP_HUE_MAX = 320;
export const VIOLET_SLOP_MIN_CHROMA = 0.01;
export const WCAG_AA_MIN_CONTRAST = 4.5;
export const WCAG_AAA_MIN_CONTRAST = 7.0;
export const WCAG_LARGE_MIN_CONTRAST = 3.0;
export const APCA_BODY_MIN_LC = 60;
export const APCA_UI_MIN_LC = 45;

export const PIGMENT_ROLE_LABELS: Readonly<
  Record<PigmentRoleId, { readonly ko: string; readonly en: string; readonly tierKo: string; readonly tierEn: string }>
> = {
  ground: { ko: "바탕 안료", en: "Ground", tierKo: "85% 중립 바탕", tierEn: "85% Neutral" },
  surface: { ko: "표면 안료", en: "Surface", tierKo: "85% 중립 구조", tierEn: "85% Surface" },
  ink: { ko: "먹·잉크", en: "Ink", tierKo: "85% 활자·선화", tierEn: "85% Ink" },
  domain: { ko: "도메인 안료", en: "Domain", tierKo: "10% 장르 무드", tierEn: "10% Domain" },
  accent: { ko: "강조 낙관", en: "Accent", tierKo: "5% 핵심 포인트", tierEn: "5% Accent" },
};

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round3 = (n: number): number => Math.round(n * 1000) / 1000;
const clamp = (n: number, min: number, max: number): number => (!Number.isFinite(n) ? min : Math.min(max, Math.max(min, n)));
/** 색상환 각도를 [0, 360) 범위로 정규화한다. */
export function normalizeHue(hue: number): number {
  if (!Number.isFinite(hue)) return 0;
  const mod = hue % 360;
  return round2(mod < 0 ? mod + 360 : mod);
}

/** OKLCH 좌표를 유효 범위(L 0..1, C 0..0.37, H 0..360)로 정규화한다. */
export function clampOklch(color: OklchColor): OklchColor {
  const base: OklchColor = { l: round3(clamp(color.l, 0, 1)), c: round3(clamp(color.c, 0, 0.37)), h: normalizeHue(color.h) };
  return color.alpha === undefined ? base : { ...base, alpha: round3(clamp(color.alpha, 0, 1)) };
}

/** OKLCH 색상을 CSS 표준 `oklch(...)` 문자열로 직렬화한다. */
export function formatOklch(color: OklchColor): string {
  const s = clampOklch(color);
  return s.alpha !== undefined && s.alpha < 1 ? `oklch(${s.l} ${s.c} ${s.h} / ${s.alpha})` : `oklch(${s.l} ${s.c} ${s.h})`;
}

/** UI 배지 및 스펙 표기용 축약 OKLCH 라벨(`L0.52 C0.20 H29°`)을 반환한다. */
export function formatOklchCompact(color: OklchColor): string {
  const s = clampOklch(color);
  return `L${s.l.toFixed(2)} C${s.c.toFixed(2)} H${Math.round(s.h)}°`;
}

/** Björn Ottosson 공식 역행렬로 OKLCH → 선형 sRGB(0..1) 및 색역 내 여부를 계산한다. */
export function oklchToLinearSrgb(color: OklchColor): LinearSrgbResult {
  const s = clampOklch(color);
  const hRad = (s.h * Math.PI) / 180;
  const a = s.c * Math.cos(hRad);
  const b = s.c * Math.sin(hRad);
  const lP = s.l + 0.3963377774 * a + 0.2158037573 * b;
  const mP = s.l - 0.1055613458 * a - 0.0638541728 * b;
  const sP = s.l - 0.0894841775 * a - 1.291485548 * b;
  const l3 = lP * lP * lP;
  const m3 = mP * mP * mP;
  const s3 = sP * sP * sP;

  const rawR = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const rawG = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const rawB = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;
  const eps = 0.005;
  const inGamut = rawR >= -eps && rawR <= 1 + eps && rawG >= -eps && rawG <= 1 + eps && rawB >= -eps && rawB <= 1 + eps;
  return { r: clamp(rawR, 0, 1), g: clamp(rawG, 0, 1), b: clamp(rawB, 0, 1), inGamut };
}

const linearChannelToSrgb = (channel: number): number => {
  const c = clamp(channel, 0, 1);
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
};

/** OKLCH를 8비트 정수 sRGB 채널(0..255)로 변환한다(CSP 스와치 출력용). */
export function oklchToSrgb255(color: OklchColor): SrgbChannelValues {
  const lin = oklchToLinearSrgb(color);
  const alpha = color.alpha === undefined ? 1 : clamp(color.alpha, 0, 1);
  return {
    r: Math.round(linearChannelToSrgb(lin.r) * 255), g: Math.round(linearChannelToSrgb(lin.g) * 255),
    b: Math.round(linearChannelToSrgb(lin.b) * 255), a: Math.round(alpha * 255), inGamut: lin.inGamut,
  };
}

/** WCAG 2.1 상대 휘도(Y, 0..1)를 OKLCH로부터 계산한다. */
export function computeRelativeLuminance(color: OklchColor): number {
  const lin = oklchToLinearSrgb(color);
  return 0.2126 * lin.r + 0.7152 * lin.g + 0.0722 * lin.b;
}

/** OKLCH 전경/배경 쌍의 WCAG 2.1 명암비(1.0..21.0)를 계산한다. */
export function computeWcagContrastRatio(fg: OklchColor, bg: OklchColor): number {
  requireOpaqueMoodboardColors(fg, bg);
  const y1 = computeRelativeLuminance(fg);
  const y2 = computeRelativeLuminance(bg);
  return round2((Math.max(y1, y2) + 0.05) / (Math.min(y1, y2) + 0.05));
}

/** WCAG 2.1 명암비를 표준 등급(AAA / AA / AA-Large / Fail)으로 분류한다. */
export function classifyWcagGrade(ratio: number): WcagContrastGrade {
  if (ratio >= WCAG_AAA_MIN_CONTRAST) return "AAA";
  if (ratio >= WCAG_AA_MIN_CONTRAST) return "AA";
  return ratio >= WCAG_LARGE_MIN_CONTRAST ? "AA-Large" : "Fail";
}

/** APCA W3(0.0.98G-4g) 지각 명도 대비(Lc, 부호 포함)를 계산한다. */
export function computeApcaContrast(fg: OklchColor, bg: OklchColor): number {
  requireOpaqueMoodboardColors(fg, bg);
  const toY = (c: OklchColor): number => {
    const lin = oklchToLinearSrgb(c);
    const raw = 0.2126729 * Math.pow(linearChannelToSrgb(lin.r), 2.4) + 0.7151522 * Math.pow(linearChannelToSrgb(lin.g), 2.4) + 0.072175 * Math.pow(linearChannelToSrgb(lin.b), 2.4);
    return raw < 0.022 ? raw + Math.pow(0.022 - raw, 1.414) : raw;
  };
  const yTxt = toY(fg);
  const yBg = toY(bg);
  if (Math.abs(yBg - yTxt) < 0.0005) return 0;
  if (yBg > yTxt) {
    const sapc = (Math.pow(yBg, 0.56) - Math.pow(yTxt, 0.57)) * 1.14;
    return sapc < 0.1 ? 0 : round2((sapc - 0.027) * 100);
  }
  const sapc = (Math.pow(yBg, 0.65) - Math.pow(yTxt, 0.62)) * 1.14;
  return sapc > -0.1 ? 0 : round2((sapc + 0.027) * 100);
}

/** 색상환 각도가 바이올렛 AI 슬롭 배제 구간(270~320도)에 속하는지 판별한다. */
export function isHueInVioletExclusionZone(hue: number): boolean {
  const h = normalizeHue(hue);
  return h >= VIOLET_SLOP_HUE_MIN && h <= VIOLET_SLOP_HUE_MAX;
}

/** OKLCH 색상이 바이올렛 AI 슬롭(270~320도, 채도 0.01 이상)인지 탐지한다. */
export function isVioletSlopColor(color: OklchColor): boolean {
  const s = clampOklch(color);
  return s.c >= VIOLET_SLOP_MIN_CHROMA && isHueInVioletExclusionZone(s.h);
}

/** 바이올렛 구간(270~320도)에 유입된 색상을 가장 가까운 탈-바이올렛 에디토리얼 각도로 치환한다. */
export function suggestSafeEditorialHue(violetHue: number, fallbackHue?: number): number {
  if (fallbackHue !== undefined && !isHueInVioletExclusionZone(fallbackHue)) return normalizeHue(fallbackHue);
  return normalizeHue(violetHue) < 295 ? 246 : 32;
}

const mkPigment = (role: PigmentRoleId, nameKo: string, nameEn: string, usageKo: string, usageEn: string, l: number, c: number, h: number): PigmentSpec =>
  ({ role, nameKo, nameEn, usageKo, usageEn, color: clampOklch({ l, c, h }) });

/** 8대 탈-바이올렛(hue 270~320도 완전 배제) 에디토리얼 아틀리에 5안료 프리셋 카탈로그. */
export const EDITORIAL_MOODBOARD_PRESETS: readonly [EditorialMoodboardPreset, ...EditorialMoodboardPreset[]] = [
  {
    id: "seoul-vermilion-ink", code: "ATELIER-01", polarity: "light",
    nameKo: "버밀리온 인주 · 흑단", nameEn: "Seoul Vermilion & Sumi Ink",
    subtitleKo: "한지 백토 바탕 위에 송연 먹선과 주홍 낙관을 찍는 서울 에디토리얼", subtitleEn: "Warm Hanji paper grounded by pine-soot ink and a crisp vermilion seal.",
    genreTagsKo: ["현대극", "에디토리얼", "액션·드라마"], genreTagsEn: ["Contemporary", "Editorial", "Drama"],
    posterHeadlineKo: "서울 인주록", posterHeadlineEn: "SEOUL SEAL",
    posterTaglineKo: "한지 여백 · 송연 먹선 · 주홍 낙관", posterTaglineEn: "Hanji Margin · Sumi Line · Vermilion Mark",
    pigments: {
      ground: mkPigment("ground", "한지 백토", "Hanji Chalk", "85% 원고·지면 바탕", "Primary editorial paper", 0.968, 0.01, 82),
      surface: mkPigment("surface", "미색 장지", "Mulberry Card", "카드·인덱스 표면", "Secondary card surface", 0.928, 0.015, 78),
      ink: mkPigment("ink", "송연 흑단", "Pine-Soot Ebony", "제목·본문·펜선 잉크", "Primary ink", 0.185, 0.014, 68),
      domain: mkPigment("domain", "청회 먹물", "Slate Indigo Wash", "10% 섹션 띠·수묵 톤", "10% slate wash", 0.415, 0.068, 236),
      accent: mkPigment("accent", "버밀리온 인주", "Vermilion Seal", "5% 낙관·CTA 강조선", "5% vermilion seal", 0.505, 0.188, 29),
    },
    onAccent: clampOklch({ l: 0.98, c: 0.006, h: 82 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
  {
    id: "kyoto-lacquer-gold", code: "ATELIER-02", polarity: "dark",
    nameKo: "옻칠 · 금박", nameEn: "Kyoto Urushi & Gold Leaf",
    subtitleKo: "깊은 흑칠 바탕에 주홍 옻과 금박으로 무게감을 세우는 아틀리에", subtitleEn: "Deep urushi lacquer illuminated by cinnabar depth and luminous gold leaf.",
    genreTagsKo: ["동양풍 사극", "무협", "신화·럭셔리"], genreTagsEn: ["Period", "Martial Arts", "Luxury"],
    posterHeadlineKo: "흑칠금박첩", posterHeadlineEn: "URUSHI GOLD",
    posterTaglineKo: "깊은 흑칠 · 주홍 여운 · 금박 호일", posterTaglineEn: "Deep Lacquer · Cinnabar Depth · Gold Foil",
    pigments: {
      ground: mkPigment("ground", "흑칠 옻바탕", "Urushi Lacquer", "85% 암실·야경 바탕", "Deep lacquer ground", 0.155, 0.014, 38),
      surface: mkPigment("surface", "주칠 음영", "Lacquer Shadow", "패널·목차 층위 표면", "Lacquer panel surface", 0.215, 0.018, 42),
      ink: mkPigment("ink", "화지 상아", "Washi Ivory", "고명도 본문·대사 활자", "Ivory typography", 0.945, 0.014, 84),
      domain: mkPigment("domain", "주홍 옻칠", "Cinnabar Lacquer", "10% 장식 띠·전통 문양", "10% cinnabar band", 0.695, 0.148, 34),
      accent: mkPigment("accent", "금박 황금", "Kimpaku Gold", "5% 금박 낙관·CTA", "5% gold leaf mark", 0.835, 0.145, 86),
    },
    onAccent: clampOklch({ l: 0.16, c: 0.015, h: 52 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
  {
    id: "youth-cobalt-citrus", code: "ATELIER-03", polarity: "light",
    nameKo: "코발트 · 시트러스", nameEn: "Youth Cobalt & Citrus Zest",
    subtitleKo: "보라 치우침 없는 순수 울트라마린 코발트와 상큼한 시트러스 에디토리얼", subtitleEn: "Crisp porcelain paper energized by pure ultramarine cobalt and burnt citrus.",
    genreTagsKo: ["학원·청춘", "스포츠", "팝 매거진"], genreTagsEn: ["Youth", "Sports", "Pop Editorial"],
    posterHeadlineKo: "청춘 코발트", posterHeadlineEn: "COBALT ZEST",
    posterTaglineKo: "백자 여백 · 순수 코발트 · 시트러스 포인트", posterTaglineEn: "Porcelain Field · Pure Cobalt · Citrus Pop",
    pigments: {
      ground: mkPigment("ground", "백자 캔버스", "Porcelain Paper", "85% 청량한 백자 지면", "Porcelain canvas", 0.974, 0.008, 98),
      surface: mkPigment("surface", "하늘 미스트지", "Sky Mist Card", "도표·카드 보조 표면", "Soft cool paper", 0.936, 0.014, 218),
      ink: mkPigment("ink", "심해 코발트 먹", "Deep Cobalt Ink", "또렷한 청묵 본문·선화", "Deep cobalt ink", 0.215, 0.042, 250),
      domain: mkPigment("domain", "번트 시트러스", "Burnt Citrus", "10% 청춘 에너지 띠", "10% citrus band", 0.515, 0.118, 54),
      accent: mkPigment("accent", "울트라마린 코발트", "Ultramarine Cobalt", "5% 순수 청색 CTA", "5% pure cobalt", 0.465, 0.148, 254),
    },
    onAccent: clampOklch({ l: 0.982, c: 0.006, h: 96 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
  {
    id: "rofan-emerald-champagne", code: "ATELIER-04", polarity: "dark",
    nameKo: "비리디안 · 샴페인", nameEn: "Rofan Viridian & Champagne",
    subtitleKo: "보라빛 판타지 클리셰를 걷어낸 제국 비리디안 벨벳과 샴페인 골드", subtitleEn: "Imperial viridian velvet paired with champagne silk, free of purple clichés.",
    genreTagsKo: ["로맨스 판타지", "시대극", "귀족 에디토리얼"], genreTagsEn: ["Romance Fantasy", "Historical", "Royal Atelier"],
    posterHeadlineKo: "비리디안 서약", posterHeadlineEn: "VIRIDIAN VOW",
    posterTaglineKo: "심해 비리디안 · 제이드 호일 · 샴페인 금사", posterTaglineEn: "Deep Viridian · Jade Foil · Champagne Gold",
    pigments: {
      ground: mkPigment("ground", "심해 비리디안", "Deep Viridian Velvet", "85% 짙은 숲빛 바탕", "Deep emerald velvet", 0.172, 0.028, 168),
      surface: mkPigment("surface", "보태니컬 에메랄드", "Botanical Emerald", "장식 프레임·카드 면", "Botanical surface", 0.232, 0.036, 166),
      ink: mkPigment("ink", "샴페인 실크", "Champagne Silk", "따뜻한 아이보리 활자", "Champagne ivory ink", 0.946, 0.022, 88),
      domain: mkPigment("domain", "제이드 비리디안", "Imperial Jade", "10% 에메랄드 문장 띠", "10% imperial jade", 0.72, 0.132, 162),
      accent: mkPigment("accent", "샴페인 골드", "Champagne Gold", "5% 금사 낙관·CTA", "5% champagne foil", 0.848, 0.102, 84),
    },
    onAccent: clampOklch({ l: 0.16, c: 0.024, h: 166 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
  {
    id: "noir-obsidian-amber", code: "ATELIER-05", polarity: "dark",
    nameKo: "흑단 · 앰버", nameEn: "Noir Obsidian & Amber",
    subtitleKo: "젖은 아스팔트 옵시디언과 나트륨 가로등 앰버가 만드는 시네마 누아르", subtitleEn: "True obsidian darkness cut by rain-steel blues and sodium-streetlight amber.",
    genreTagsKo: ["스릴러", "누아르", "범죄·미스터리"], genreTagsEn: ["Thriller", "Noir", "Mystery"],
    posterHeadlineKo: "심야 옵시디언", posterHeadlineEn: "NOIR AMBER",
    posterTaglineKo: "흑단 암부 · 청강 빗빛 · 나트륨 앰버", posterTaglineEn: "Obsidian Dark · Rain Steel · Sodium Amber",
    pigments: {
      ground: mkPigment("ground", "옵시디언 흑단", "Obsidian Night", "85% 무채 흑단 바탕", "Obsidian dark field", 0.145, 0.008, 72),
      surface: mkPigment("surface", "그라파이트 석판", "Graphite Slate", "컷 프레임·패널 표면", "Graphite panel", 0.205, 0.011, 70),
      ink: mkPigment("ink", "안개 백금", "Mist Platinum", "선명한 야간 본문·자막", "Platinum ink", 0.938, 0.009, 82),
      domain: mkPigment("domain", "청강 스틸", "Rain Steel", "10% 빗길·금속 무드", "10% rain steel", 0.695, 0.064, 214),
      accent: mkPigment("accent", "나트륨 앰버", "Sodium Amber", "5% 가로등 핵심 강조", "5% sodium amber", 0.79, 0.165, 68),
    },
    onAccent: clampOklch({ l: 0.15, c: 0.014, h: 64 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
  {
    id: "slice-terracotta-mint", code: "ATELIER-06", polarity: "light",
    nameKo: "테라코타 · 민트", nameEn: "Slice Terracotta & Sage Mint",
    subtitleKo: "귀리 리넨 지면 위 세이지 민트와 구운 테라코타의 포근한 일상 화보", subtitleEn: "Warm oat linen balanced with botanical sage mint and kiln-fired terracotta.",
    genreTagsKo: ["일상·힐링", "에세이", "감성 로맨스"], genreTagsEn: ["Slice of Life", "Essay", "Warm Romance"],
    posterHeadlineKo: "오후 테라코타", posterHeadlineEn: "CLAY & MINT",
    posterTaglineKo: "귀리 리넨 · 세이지 민트 · 구운 토기", posterTaglineEn: "Oat Linen · Sage Mint · Kiln Terracotta",
    pigments: {
      ground: mkPigment("ground", "귀리 리넨", "Oat Linen", "85% 리넨 종이 바탕", "Warm oat linen", 0.964, 0.013, 86),
      surface: mkPigment("surface", "세이지 크림", "Sage Cream", "민트빛 카드 표면", "Botanical cream card", 0.924, 0.018, 148),
      ink: mkPigment("ink", "에스프레소 우드", "Espresso Umber", "따뜻한 고대비 본문", "Espresso ink", 0.22, 0.026, 48),
      domain: mkPigment("domain", "세이지 민트", "Botanical Mint", "10% 식물·일상 톤", "10% sage mint", 0.455, 0.092, 162),
      accent: mkPigment("accent", "구운 테라코타", "Kiln Terracotta", "5% 도기 주황 낙관", "5% kiln terracotta", 0.495, 0.145, 39),
    },
    onAccent: clampOklch({ l: 0.978, c: 0.008, h: 86 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
  {
    id: "fantasy-viridian-copper", code: "ATELIER-07", polarity: "dark",
    nameKo: "청동 · 구리", nameEn: "Fantasy Patina & Burnished Copper",
    subtitleKo: "고대 청동 녹청과 단조 구리 광택으로 빚은 하이 판타지·스팀펑크 팔레트", subtitleEn: "Aged bronze darkness illuminated by verdigris patina and forged copper.",
    genreTagsKo: ["하이 판타지", "스팀펑크", "모험·던전"], genreTagsEn: ["High Fantasy", "Steampunk", "Adventure"],
    posterHeadlineKo: "청동과 구리", posterHeadlineEn: "BRONZE FORGE",
    posterTaglineKo: "청동 심연 · 녹청 문양 · 단조 구리빛", posterTaglineEn: "Bronze Abyss · Verdigris · Forged Copper",
    pigments: {
      ground: mkPigment("ground", "청동 심연", "Aged Bronze Dark", "85% 청동 암부 바탕", "Deep bronze ground", 0.168, 0.022, 192),
      surface: mkPigment("surface", "녹청 석조", "Patina Stone", "유적·기계 패널 표면", "Patina stone panel", 0.228, 0.028, 190),
      ink: mkPigment("ink", "양피지 아이보리", "Parchment Ivory", "고명도 서사 본문", "Parchment ink", 0.94, 0.016, 84),
      domain: mkPigment("domain", "청동 녹청", "Verdigris Patina", "10% 산화 청동 띠", "10% verdigris patina", 0.728, 0.116, 186),
      accent: mkPigment("accent", "단조 구리", "Burnished Copper", "5% 단조 구리 포인트", "5% forged copper", 0.785, 0.132, 54),
    },
    onAccent: clampOklch({ l: 0.15, c: 0.02, h: 46 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
  {
    id: "hanok-dancheong-hanji", code: "ATELIER-08", polarity: "light",
    nameKo: "단청 · 한지", nameEn: "Hanok Dancheong & Hanji",
    subtitleKo: "표백 전 한지와 기와 먹색 위에 석록·주홍 단청을 절제해 얹은 전통 화보", subtitleEn: "Unbleached hanji paper framed by giwa charcoal and restrained mineral Dancheong.",
    genreTagsKo: ["한국 전통", "퓨전 사극", "문화 에디토리얼"], genreTagsEn: ["Korean Heritage", "Fusion Historical", "Cultural Print"],
    posterHeadlineKo: "단청 한지보", posterHeadlineEn: "DANCHEONG",
    posterTaglineKo: "표백 전 한지 · 석록 단청 · 주홍 인장", posterTaglineEn: "Unbleached Hanji · Mineral Green · Cinnabar",
    pigments: {
      ground: mkPigment("ground", "표백 전 한지", "Unbleached Hanji", "85% 전통 미색 한지", "Unbleached hanji paper", 0.96, 0.017, 88),
      surface: mkPigment("surface", "소나무 들보", "Pine Timber Wash", "목조·서지 보조 면", "Pine timber card", 0.916, 0.023, 80),
      ink: mkPigment("ink", "기와 먹색", "Giwa Charcoal", "단정한 기와 먹 본문", "Giwa charcoal ink", 0.2, 0.014, 78),
      domain: mkPigment("domain", "석록 단청", "Dancheong Seokrok", "10% 전통 석록 띠", "10% mineral green", 0.465, 0.088, 166),
      accent: mkPigment("accent", "주홍 단청", "Dancheong Cinnabar", "5% 전통 주홍 낙관", "5% cinnabar seal", 0.49, 0.175, 27),
    },
    onAccent: clampOklch({ l: 0.978, c: 0.01, h: 88 }), recommendedRatio: TARGET_CHROMATIC_RATIO,
  },
];

/** ID로 8대 탈-바이올렛 에디토리얼 프리셋을 조회한다(미일치 시 첫 프리셋 반환). */
export function getEditorialMoodboardPreset(id: EditorialMoodboardPresetId): EditorialMoodboardPreset {
  return EDITORIAL_MOODBOARD_PRESETS.find((preset) => preset.id === id) ?? EDITORIAL_MOODBOARD_PRESETS[0];
}

/** 슬라이더 하나를 조정할 때 나머지 두 비율을 자연스럽게 연동해 합계 100%를 유지한다. */
export function rebalanceRatioTriple(changedRole: "neutral" | "domain" | "accent", nextValue: number, current: ChromaticRatioSpec): ChromaticRatioSpec {
  const bounds = { neutral: { min: 45, max: 96 }, domain: { min: 2, max: 40 }, accent: { min: 1, max: 25 } };
  const clamped = Math.round(clamp(nextValue, bounds[changedRole].min, bounds[changedRole].max));
  const rem = 100 - clamped;
  if (changedRole === "neutral") {
    const sum = Math.max(1, current.domainPct + current.accentPct);
    const domainPct = Math.round(clamp((rem * current.domainPct) / sum, 1, rem - 1));
    return { neutralPct: clamped, domainPct, accentPct: rem - domainPct };
  }
  if (changedRole === "domain") {
    const accentPct = Math.round(clamp(current.accentPct, 1, Math.max(1, rem - 45)));
    return { neutralPct: 100 - clamped - accentPct, domainPct: clamped, accentPct };
  }
  const domainPct = Math.round(clamp(current.domainPct, 1, Math.max(1, rem - 45)));
  return { neutralPct: 100 - clamped - domainPct, domainPct, accentPct: clamped };
}

function buildContrastPair(
  pairId: ContrastPairId, labelKo: string, labelEn: string, fgRole: string, bgRole: string,
  fg: OklchColor, bg: OklchColor, minApcaRequired: number,
): ContrastPairAudit {
  const wcagRatio = computeWcagContrastRatio(fg, bg);
  const apcaLc = computeApcaContrast(fg, bg);
  const apcaAbsLc = round2(Math.abs(apcaLc));
  return {
    pairId, labelKo, labelEn, fgRole, bgRole, fg: clampOklch(fg), bg: clampOklch(bg),
    wcagRatio, wcagGrade: classifyWcagGrade(wcagRatio), apcaLc, apcaAbsLc,
    minWcagRequired: WCAG_AA_MIN_CONTRAST, minApcaRequired,
    passesWcagAa: wcagRatio >= WCAG_AA_MIN_CONTRAST, passesApca: apcaAbsLc >= minApcaRequired,
  };
}

function evaluateRatioBalance(input?: Partial<ChromaticRatioSpec>): RatioBalanceMetrics {
  const rawN = clamp(input?.neutralPct ?? TARGET_CHROMATIC_RATIO.neutralPct, 0, 100);
  const rawD = clamp(input?.domainPct ?? TARGET_CHROMATIC_RATIO.domainPct, 0, 100);
  const rawA = clamp(input?.accentPct ?? TARGET_CHROMATIC_RATIO.accentPct, 0, 100);
  const rawSum = rawN + rawD + rawA;
  const rawSumPct = round2(rawSum);
  // 표시용 반올림 합계를 분모로 쓰면 작은 양의 비율을 잃는다.
  const safeSum = rawSum > 0 ? rawSum : 100;
  const normN = round2((rawN / safeSum) * 100);
  const normD = round2((rawD / safeSum) * 100);
  const normA = round2(Math.max(0, 100 - normN - normD));
  const neutralDeltaPct = round2(normN - TARGET_CHROMATIC_RATIO.neutralPct);
  const domainDeltaPct = round2(normD - TARGET_CHROMATIC_RATIO.domainPct);
  const accentDeltaPct = round2(normA - TARGET_CHROMATIC_RATIO.accentPct);
  const totalDeviationPct = round2((Math.abs(neutralDeltaPct) + Math.abs(domainDeltaPct) + Math.abs(accentDeltaPct)) / 2);
  const status: RatioBalanceStatus =
    totalDeviationPct <= 5 && normN >= 80 && normA <= 8 ? "optimal"
      : totalDeviationPct <= 14 && normN >= 72 && normA <= 12 ? "drift" : "imbalanced";
  return {
    target: TARGET_CHROMATIC_RATIO, input: { neutralPct: rawN, domainPct: rawD, accentPct: rawA },
    normalized: { neutralPct: normN, domainPct: normD, accentPct: normA },
    rawSumPct, neutralDeltaPct, domainDeltaPct, accentDeltaPct, totalDeviationPct, status,
  };
}

/** 85/10/5 색채 비율 · 바이올렛 AI 슬롭 유입 · OKLCH WCAG 2.1/APCA 대비를 종합 감사한다. */
export function auditChromaticBalance(input?: ChromaticBalanceAuditInput): ChromaticBalanceAuditReport {
  assertChromaticInput(input);
  const preset = getEditorialMoodboardPreset(input?.presetId ?? "seoul-vermilion-ink");
  const ov = input?.pigmentOverrides;
  const resolvedPigments: Record<PigmentRoleId, PigmentSpec> = {
    ground: ov?.ground ? { ...preset.pigments.ground, color: clampOklch(ov.ground) } : preset.pigments.ground,
    surface: ov?.surface ? { ...preset.pigments.surface, color: clampOklch(ov.surface) } : preset.pigments.surface,
    ink: ov?.ink ? { ...preset.pigments.ink, color: clampOklch(ov.ink) } : preset.pigments.ink,
    domain: ov?.domain ? { ...preset.pigments.domain, color: clampOklch(ov.domain) } : preset.pigments.domain,
    accent: ov?.accent ? { ...preset.pigments.accent, color: clampOklch(ov.accent) } : preset.pigments.accent,
  };
  const resolvedOnAccent = input?.onAccentOverride ? clampOklch(input.onAccentOverride) : preset.onAccent;
  const ratio = evaluateRatioBalance(input?.ratio);

  const inspectedSlots: NamedOklchSample[] = [
    ...PIGMENT_ROLE_IDS.map((r) => ({ id: r, labelKo: `${PIGMENT_ROLE_LABELS[r].ko}(${resolvedPigments[r].nameKo})`, labelEn: `${PIGMENT_ROLE_LABELS[r].en} (${resolvedPigments[r].nameEn})`, color: resolvedPigments[r].color })),
    { id: "on-accent", labelKo: "강조 위 활자", labelEn: "On Accent Ink", color: resolvedOnAccent },
    ...(input?.extraSamples ?? []),
  ];

  const violetViolations: VioletSlopViolation[] = inspectedSlots
    .filter((slot) => isVioletSlopColor(slot.color))
    .map((slot) => {
      const fb = slot.id in preset.pigments ? preset.pigments[slot.id as PigmentRoleId].color.h : undefined;
      return {
        slotId: slot.id, labelKo: slot.labelKo, labelEn: slot.labelEn,
        hue: normalizeHue(slot.color.h), chroma: round3(slot.color.c),
        color: clampOklch(slot.color), suggestedSafeHue: suggestSafeEditorialHue(slot.color.h, fb),
      };
    });

  const inspectedColorCount = inspectedSlots.length;
  const violetSlopPct = inspectedColorCount > 0 ? round2((violetViolations.length / inspectedColorCount) * 100) : 0;
  const isVioletFree = violetViolations.length === 0;

  const contrastPairs: readonly ContrastPairAudit[] = [
    buildContrastPair("ink-on-ground", "본문 먹 / 바탕", "Ink on Ground", "ink", "ground", resolvedPigments.ink.color, resolvedPigments.ground.color, APCA_BODY_MIN_LC),
    buildContrastPair("ink-on-surface", "본문 먹 / 표면", "Ink on Surface", "ink", "surface", resolvedPigments.ink.color, resolvedPigments.surface.color, APCA_BODY_MIN_LC),
    buildContrastPair("accent-on-ground", "강조 낙관 / 바탕", "Accent on Ground", "accent", "ground", resolvedPigments.accent.color, resolvedPigments.ground.color, APCA_UI_MIN_LC),
    buildContrastPair("on-accent", "강조 활자 / 강조 낙관", "On-Accent Text", "on-accent", "accent", resolvedOnAccent, resolvedPigments.accent.color, APCA_BODY_MIN_LC),
    buildContrastPair("domain-on-ground", "도메인 안료 / 바탕", "Domain on Ground", "domain", "ground", resolvedPigments.domain.color, resolvedPigments.ground.color, APCA_UI_MIN_LC),
  ];

  const minWcagRatio = round2(Math.min(...contrastPairs.map((pair) => pair.wcagRatio)));
  const minApcaAbsLc = round2(Math.min(...contrastPairs.map((pair) => pair.apcaAbsLc)));
  const passingWcagPairCount = contrastPairs.filter((pair) => pair.passesWcagAa).length;
  const allPairsPassWcagAa = passingWcagPairCount === contrastPairs.length;
  const allPairsPassApca = contrastPairs.every((pair) => pair.passesApca);

  const warnings: ChromaticAuditWarning[] = [];
  const pushWarn = (code: ChromaticAuditWarningCode, severity: ChromaticAuditWarningSeverity, titleKo: string, titleEn: string, detailKo: string, detailEn: string): void => {
    warnings.push({ code, severity, titleKo, titleEn, detailKo, detailEn });
  };

  if (!isVioletFree) {
    pushWarn("violet-slop-detected", "critical", `바이올렛 AI 슬롭 ${violetViolations.length}건 유입 (270–320°)`, `Violet AI slop detected (${violetViolations.length})`,
      `${violetViolations.map((v) => `${v.labelKo} ${Math.round(v.hue)}°`).join(", ")} 색상이 금지 색상환(270–320°)에 들어 있습니다.`,
      `${violetViolations.map((v) => `${v.labelEn} ${Math.round(v.hue)}°`).join(", ")} falls inside 270–320°.`);
  }
  const failingWcag = contrastPairs.filter((pair) => !pair.passesWcagAa);
  if (failingWcag.length > 0) {
    pushWarn("contrast-below-aa", "critical", `WCAG AA 4.5:1 대비 미달 ${failingWcag.length}건 (최소 ${minWcagRatio.toFixed(2)}:1)`, `WCAG AA contrast below 4.5:1 (${failingWcag.length})`,
      `${failingWcag.map((p) => `${p.labelKo} ${p.wcagRatio.toFixed(2)}:1`).join(", ")}의 OKLCH 명도 보정이 필요합니다.`,
      `${failingWcag.map((p) => `${p.labelEn} ${p.wcagRatio.toFixed(2)}:1`).join(", ")} requires lightness repair.`);
  } else if (!allPairsPassApca) {
    const failingApca = contrastPairs.filter((pair) => !pair.passesApca);
    pushWarn("apca-below-threshold", "warn", `APCA 지각 대비(Lc) 주의 ${failingApca.length}건`, `APCA contrast warning (${failingApca.length})`,
      `${failingApca.map((p) => `${p.labelKo} Lc ${p.apcaAbsLc}`).join(", ")} 구간이 권장 지각 대비보다 낮습니다.`,
      `${failingApca.map((p) => `${p.labelEn} Lc ${p.apcaAbsLc}`).join(", ")} is below APCA Lc floor.`);
  }
  if (Math.abs(ratio.rawSumPct - 100) >= 0.5) {
    pushWarn("ratio-sum-mismatch", "info", `입력 비율 합계 ${ratio.rawSumPct}% (100% 기준 정규화)`, `Raw ratio sum ${ratio.rawSumPct}% (normalized to 100%)`,
      "바탕·도메인·강조 합계가 100%가 되도록 정규화해 감사했습니다.", "Channel percentages were normalized to 100% before scoring.");
  }
  if (ratio.normalized.neutralPct < 75) {
    pushWarn("neutral-field-crowded", "warn", `바탕 여백 비율 부족 (${ratio.normalized.neutralPct}% < 권장 85%)`, `Neutral canvas below 75% (${ratio.normalized.neutralPct}%)`,
      "원고와 여백이 호흡하려면 중립 바탕 비율을 80–88% 범위로 유지하는 편이 안정적입니다.", "Keep neutral canvas field around 80–88% so artwork remains focal.");
  }
  if (ratio.normalized.accentPct > 10) {
    pushWarn("accent-overused", "warn", `강조 안료 과다 (${ratio.normalized.accentPct}% > 상한 10%)`, `Accent overuse (${ratio.normalized.accentPct}% > 10% cap)`,
      "5% 낙관 강조색이 10%를 넘으면 시선 집중력이 분산되고 피로도가 높아집니다.", "Exceeding 10% accent dilutes visual hierarchy.");
  }
  if (ratio.normalized.domainPct < 4 || ratio.normalized.domainPct > 20) {
    pushWarn("domain-imbalanced", "info", `도메인 안료 편차 (${ratio.normalized.domainPct}% vs 기준 10%)`, `Domain tone drift (${ratio.normalized.domainPct}% vs 10%)`,
      "장르 분위기를 담는 도메인 안료는 8–14% 구간에서 가장 정돈된 인상을 줍니다.", "Keep domain pigment within 8–14% for clean editorial pacing.");
  }

  const penalty = Math.min(55, violetViolations.length * 32) + failingWcag.length * 16 + contrastPairs.filter((p) => p.passesWcagAa && !p.passesApca).length * 4 + Math.min(28, ratio.totalDeviationPct * 1.4);
  return {
    extraSamples: (input?.extraSamples ?? []).map((sample) => ({ id: sample.id, labelKo: sample.labelKo, labelEn: sample.labelEn, color: { ...sample.color } })),
    preset, resolvedPigments, resolvedOnAccent, ratio, violetViolations, inspectedColorCount, violetSlopPct, isVioletFree,
    contrastPairs, minWcagRatio, minApcaAbsLc, passingWcagPairCount, totalContrastPairCount: contrastPairs.length,
    allPairsPassWcagAa, allPairsPassApca, warnings, overallScore: Math.round(clamp(100 - penalty, 0, 100)),
  };
}

function searchContrastLightness(fg: OklchColor, bg: OklchColor, targetWcag: number, targetApca: number, preferLighter: boolean): OklchColor {
  const safeFg = clampOklch(fg);
  const meets = (c: OklchColor): boolean => computeWcagContrastRatio(c, bg) >= targetWcag && Math.abs(computeApcaContrast(c, bg)) >= targetApca;
  if (meets(safeFg)) return safeFg;
  const tryDir = (towardLight: boolean): OklchColor | null => {
    let l = safeFg.l;
    for (let i = 0; i < 100; i += 1) {
      l = round3(clamp(l + (towardLight ? 0.01 : -0.01), 0.04, 0.99));
      const cand: OklchColor = { l, c: round3(safeFg.c * Math.max(0.35, Math.min(1, Math.min(l / 0.25, (1 - l) / 0.18)))), h: safeFg.h };
      if (meets(cand)) return cand;
      if (l <= 0.04 || l >= 0.99) break;
    }
    return null;
  };
  const found = tryDir(preferLighter) ?? tryDir(!preferLighter);
  if (found) return found;
  const darkFb: OklchColor = { l: 0.06, c: round3(Math.min(safeFg.c, 0.04)), h: safeFg.h };
  const lightFb: OklchColor = { l: 0.985, c: round3(Math.min(safeFg.c, 0.02)), h: safeFg.h };
  return computeWcagContrastRatio(darkFb, bg) >= computeWcagContrastRatio(lightFb, bg) ? darkFb : lightFb;
}

/** 바이올렛 AI 슬롭 제거 및 OKLCH 명도 조정으로 WCAG 2.1(4.5:1+) · APCA 대비를 자동 보정한다. */
export function autoRepairPaletteContrast(input?: ChromaticBalanceAuditInput, options?: AutoRepairPaletteOptions): AutoRepairPaletteResult {
  requireFiniteMoodboard([options?.targetWcagRatio ?? 4.65]);
  if ((options?.targetWcagRatio ?? 4.65) > 21) throw new RangeError("예제 대비 목표 범위는 21 이하여야 합니다.");
  const targetWcag = Math.max(WCAG_AA_MIN_CONTRAST, options?.targetWcagRatio ?? 4.65);
  const repairViolet = options?.repairVioletSlop ?? true;
  const rebalanceRatio = options?.rebalanceRatio ?? false;

  const beforeAudit = auditChromaticBalance(input);
  const preset = beforeAudit.preset;
  const fixes: PaletteRepairRecord[] = [];
  const working: Record<PigmentRoleId, OklchColor> = {
    ground: { ...beforeAudit.resolvedPigments.ground.color }, surface: { ...beforeAudit.resolvedPigments.surface.color },
    ink: { ...beforeAudit.resolvedPigments.ink.color }, domain: { ...beforeAudit.resolvedPigments.domain.color },
    accent: { ...beforeAudit.resolvedPigments.accent.color },
  };
  let workingOnAccent: OklchColor = { ...beforeAudit.resolvedOnAccent };
  let workingRatio: ChromaticRatioSpec = { ...beforeAudit.ratio.normalized };

  if (repairViolet) {
    for (const role of PIGMENT_ROLE_IDS) {
      if (!isVioletSlopColor(working[role])) continue;
      const beforeLabel = formatOklch(working[role]);
      const safeHue = suggestSafeEditorialHue(working[role].h, preset.pigments[role].color.h);
      working[role] = clampOklch({ ...working[role], h: safeHue });
      fixes.push({ slotId: role, action: "detox-violet-hue", beforeLabel, afterLabel: formatOklch(working[role]), noteKo: `${PIGMENT_ROLE_LABELS[role].ko} 색상을 탈-바이올렛(${Math.round(safeHue)}°)으로 교정했습니다.`, noteEn: `Shifted ${PIGMENT_ROLE_LABELS[role].en} to ${Math.round(safeHue)}°.` });
    }
    if (isVioletSlopColor(workingOnAccent)) {
      const beforeLabel = formatOklch(workingOnAccent);
      const safeHue = suggestSafeEditorialHue(workingOnAccent.h, preset.onAccent.h);
      workingOnAccent = clampOklch({ ...workingOnAccent, h: safeHue });
      fixes.push({ slotId: "on-accent", action: "detox-violet-hue", beforeLabel, afterLabel: formatOklch(workingOnAccent), noteKo: `강조 활자를 탈-바이올렛 각도(${Math.round(safeHue)}°)로 교정했습니다.`, noteEn: `Shifted On-Accent hue to ${Math.round(safeHue)}°.` });
    }
  }

  const isDarkGround = preset.polarity === "dark" || working.ground.l < 0.5;
  if (working.ground.l > 0.32 && working.ground.l < 0.82) {
    const beforeLabel = formatOklch(working.ground);
    working.ground = clampOklch({ ...working.ground, l: isDarkGround ? Math.min(working.ground.l, 0.19) : Math.max(working.ground.l, 0.94) });
    fixes.push({ slotId: "ground", action: "lift-wcag-contrast", beforeLabel, afterLabel: formatOklch(working.ground), noteKo: "중간 명도 바탕을 고대비 에디토리얼 구간으로 정돈했습니다.", noteEn: "Anchored mid-tone ground to high-contrast editorial luminance." });
  }

  const preferLighterFg = working.ground.l < 0.5;
  const ensureSlot = (role: "ink" | "domain" | "accent", bg: OklchColor, minApca: number): void => {
    const curWcag = computeWcagContrastRatio(working[role], bg);
    if (curWcag >= WCAG_AA_MIN_CONTRAST && Math.abs(computeApcaContrast(working[role], bg)) >= minApca) return;
    const beforeLabel = `${formatOklch(working[role])} (${curWcag.toFixed(2)}:1)`;
    working[role] = searchContrastLightness(working[role], bg, targetWcag, minApca, preferLighterFg);
    const afterWcag = computeWcagContrastRatio(working[role], bg);
    fixes.push({ slotId: role, action: "lift-wcag-contrast", beforeLabel, afterLabel: `${formatOklch(working[role])} (${afterWcag.toFixed(2)}:1)`, noteKo: `${PIGMENT_ROLE_LABELS[role].ko} 명도를 보정해 대비 ${afterWcag.toFixed(2)}:1을 확보했습니다.`, noteEn: `Adjusted ${PIGMENT_ROLE_LABELS[role].en} lightness to ${afterWcag.toFixed(2)}:1.` });
  };

  ensureSlot("ink", working.ground, APCA_BODY_MIN_LC);
  if (computeWcagContrastRatio(working.ink, working.surface) < WCAG_AA_MIN_CONTRAST || Math.abs(computeApcaContrast(working.ink, working.surface)) < APCA_BODY_MIN_LC) {
    const beforeLabel = formatOklch(working.surface);
    working.surface = searchContrastLightness(working.surface, working.ink, targetWcag, APCA_BODY_MIN_LC, !preferLighterFg);
    fixes.push({ slotId: "surface", action: "lift-wcag-contrast", beforeLabel, afterLabel: formatOklch(working.surface), noteKo: "표면 카드 명도를 본문 먹 대비 4.5:1 이상으로 보정했습니다.", noteEn: "Adjusted surface lightness for 4.5:1+ contrast." });
  }
  ensureSlot("domain", working.ground, APCA_UI_MIN_LC);
  ensureSlot("accent", working.ground, APCA_UI_MIN_LC);

  const onAccWcag = computeWcagContrastRatio(workingOnAccent, working.accent);
  if (onAccWcag < WCAG_AA_MIN_CONTRAST || Math.abs(computeApcaContrast(workingOnAccent, working.accent)) < APCA_BODY_MIN_LC) {
    const beforeLabel = `${formatOklch(workingOnAccent)} (${onAccWcag.toFixed(2)}:1)`;
    const darkCand = clampOklch({ l: 0.14, c: 0.012, h: preset.pigments.ink.color.h });
    const lightCand = clampOklch({ l: 0.985, c: 0.006, h: preset.pigments.ground.color.h });
    const pickLight = computeWcagContrastRatio(lightCand, working.accent) >= computeWcagContrastRatio(darkCand, working.accent);
    workingOnAccent = searchContrastLightness(pickLight ? lightCand : darkCand, working.accent, targetWcag, APCA_BODY_MIN_LC, pickLight);
    const afterWcag = computeWcagContrastRatio(workingOnAccent, working.accent);
    fixes.push({ slotId: "on-accent", action: "align-on-accent", beforeLabel, afterLabel: `${formatOklch(workingOnAccent)} (${afterWcag.toFixed(2)}:1)`, noteKo: `강조 활자를 ${pickLight ? "고명도 백토" : "저명도 흑단"}으로 정렬해 ${afterWcag.toFixed(2)}:1을 확보했습니다.`, noteEn: `Aligned On-Accent text to ${afterWcag.toFixed(2)}:1.` });
  }

  if (rebalanceRatio && beforeAudit.ratio.totalDeviationPct > 0) {
    const r = beforeAudit.ratio.normalized;
    workingRatio = { ...TARGET_CHROMATIC_RATIO };
    fixes.push({ slotId: "ratio", action: "rebalance-ratio", beforeLabel: `${r.neutralPct}/${r.domainPct}/${r.accentPct}`, afterLabel: "85/10/5", noteKo: "색채 비율을 85/10/5 에디토리얼 황금비로 복원했습니다.", noteEn: "Restored 85/10/5 editorial chromatic ratio." });
  }

  const afterAudit = auditChromaticBalance({ presetId: preset.id, pigmentOverrides: working, onAccentOverride: workingOnAccent, ratio: workingRatio, extraSamples: input?.extraSamples });
  return {
    beforeAudit, afterAudit, repairedPigments: working, repairedOnAccent: workingOnAccent, repairedRatio: workingRatio,
    fixes, fullyRepaired: afterAudit.isVioletFree && afterAudit.allPairsPassWcagAa && afterAudit.minWcagRatio >= Math.max(WCAG_AA_MIN_CONTRAST, options?.targetWcagRatio ?? WCAG_AA_MIN_CONTRAST),
  };
}

export { buildEditorialPosterSvg, exportPaletteCssVariables, exportPaletteOklchJson, exportPaletteCspSwatch, buildCspSwatchBytes } from "./moodboard-output";
