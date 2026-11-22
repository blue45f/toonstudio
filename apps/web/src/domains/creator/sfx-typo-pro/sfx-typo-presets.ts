/**
 * 자동 효과음(SFX) 타이포그래피 4종 스타일 · 의성어 프리셋 · 타입 정의.
 */

export type SfxStyleId = "brush" | "metal" | "shockwave" | "horror";

export type SfxDistortionMode =
  | "none"
  | "arch-up"
  | "arch-down"
  | "perspective-left"
  | "perspective-right"
  | "perspective-burst";

export type SfxLocaleCode = "ko" | "en" | "ja" | "zh";

export interface SfxDoubleStrokeSpec {
  readonly innerColor: string;
  readonly innerWidth: number;
  readonly outerColor: string;
  readonly outerWidth: number;
}

export interface SfxDistortionSpec {
  readonly mode: SfxDistortionMode;
  /** 아치 곡률 강도 (-1 ~ 1, 기본 0.35). */
  readonly archStrength: number;
  /** 원근 테이퍼 크기 비율 (0.35 ~ 1.85, 1은 변화 없음). */
  readonly taperRatio: number;
  /** 수평 기울기(도, -30 ~ 30). */
  readonly skewDeg: number;
  /** 원근 깊이감(0 ~ 1). */
  readonly perspectiveDepth: number;
}

export interface SfxCutPlacement {
  readonly cutId: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly rotationDeg: number;
  readonly anchor: "center" | "top-left" | "top-right" | "bottom-left" | "bottom-right";
  readonly zIndex: number;
}

export interface SfxStylePreset {
  readonly id: SfxStyleId;
  readonly labelKo: string;
  readonly summaryKo: string;
  readonly fontFamily: string;
  readonly fontWeight: number;
  readonly baseFontSize: number;
  readonly letterSpacing: number;
  readonly defaultSkewDeg: number;
  readonly fillGradientStops: readonly { readonly offset: string; readonly color: string }[];
  readonly gradientAngleDeg: number;
  readonly defaultDoubleStroke: SfxDoubleStrokeSpec;
  readonly shadowColor: string;
  readonly shadowOffsetX: number;
  readonly shadowOffsetY: number;
  readonly decorationKind: "splatter" | "metallic-slash" | "shock-rays" | "horror-drip";
  readonly decorationColor: string;
  readonly jitterAmplitude: number;
}

export interface SfxPresetPhrase {
  readonly id: string;
  readonly textKo: string;
  readonly labelKo: string;
  readonly recommendedStyle: SfxStyleId;
  readonly recommendedDistortion: SfxDistortionMode;
  readonly translations: Readonly<Record<SfxLocaleCode, string>>;
}

export interface SfxVectorStampSpec {
  readonly id: string;
  readonly text: string;
  readonly originalText: string;
  readonly locale: SfxLocaleCode;
  readonly styleId: SfxStyleId;
  readonly distortion: SfxDistortionSpec;
  readonly doubleStroke: SfxDoubleStrokeSpec;
  readonly placement: SfxCutPlacement;
  readonly seed: number;
  /** 번역 교체 시 원본 배치 폭을 유지하기 위한 자동 폰트 보정 배율(0.45 ~ 1.25). */
  readonly localizedFitScale: number;
}

export interface SfxGlyphTransform {
  readonly index: number;
  readonly char: string;
  readonly x: number;
  readonly y: number;
  readonly fontSize: number;
  readonly scaleX: number;
  readonly scaleY: number;
  readonly rotateDeg: number;
  readonly skewXDeg: number;
  readonly skewYDeg: number;
  readonly jitterX: number;
  readonly jitterY: number;
  readonly opacity: number;
}

export interface SfxDecorationElement {
  readonly kind: "path" | "line" | "circle";
  readonly d?: string;
  readonly x1?: number;
  readonly y1?: number;
  readonly x2?: number;
  readonly y2?: number;
  readonly cx?: number;
  readonly cy?: number;
  readonly r?: number;
  readonly stroke?: string;
  readonly strokeWidth?: number;
  readonly fill?: string;
  readonly opacity: number;
}

export interface SfxVectorStampModel {
  readonly spec: SfxVectorStampSpec;
  readonly style: SfxStylePreset;
  readonly viewBoxWidth: number;
  readonly viewBoxHeight: number;
  readonly gradientId: string;
  readonly glyphs: readonly SfxGlyphTransform[];
  readonly decorations: readonly SfxDecorationElement[];
  readonly svgMarkup: string;
}

export const SFX_STYLE_PRESETS: readonly SfxStylePreset[] = Object.freeze([
  {
    id: "brush",
    labelKo: "붓글씨",
    summaryKo: "먹 번짐과 힘 있는 강약이 살아 있는 액션·사극 붓터치",
    fontFamily: "'Gungsuh', 'Nanum Myeongjo', 'Pretendard', serif",
    fontWeight: 900,
    baseFontSize: 82,
    letterSpacing: -2,
    defaultSkewDeg: -10,
    fillGradientStops: [
      { offset: "0%", color: "#1c1917" },
      { offset: "58%", color: "#292524" },
      { offset: "100%", color: "#44403c" },
    ],
    gradientAngleDeg: 105,
    defaultDoubleStroke: {
      innerColor: "#fafaf9",
      innerWidth: 7,
      outerColor: "#111827",
      outerWidth: 14,
    },
    shadowColor: "#0c0a09",
    shadowOffsetX: 4,
    shadowOffsetY: 6,
    decorationKind: "splatter",
    decorationColor: "#1c1917",
    jitterAmplitude: 3.5,
  },
  {
    id: "metal",
    labelKo: "메탈",
    summaryKo: "강철 하이라이트와 날카로운 반사광을 강조한 금속 충돌음",
    fontFamily: "'Space Grotesk', 'Pretendard', sans-serif",
    fontWeight: 900,
    baseFontSize: 78,
    letterSpacing: 3,
    defaultSkewDeg: -14,
    fillGradientStops: [
      { offset: "0%", color: "#f8fafc" },
      { offset: "38%", color: "#94a3b8" },
      { offset: "55%", color: "#334155" },
      { offset: "82%", color: "#e2e8f0" },
      { offset: "100%", color: "#64748b" },
    ],
    gradientAngleDeg: 90,
    defaultDoubleStroke: {
      innerColor: "#0f172a",
      innerWidth: 6,
      outerColor: "#cbd5e1",
      outerWidth: 12,
    },
    shadowColor: "#020617",
    shadowOffsetX: 5,
    shadowOffsetY: 5,
    decorationKind: "metallic-slash",
    decorationColor: "#e2e8f0",
    jitterAmplitude: 0.8,
  },
  {
    id: "shockwave",
    labelKo: "충격파",
    summaryKo: "폭발·타격 순간의 에너지가 튀어나오는 고채도 방사 효과음",
    fontFamily: "'Pretendard', 'Apple SD Gothic Neo', sans-serif",
    fontWeight: 900,
    baseFontSize: 86,
    letterSpacing: -1,
    defaultSkewDeg: -12,
    fillGradientStops: [
      { offset: "0%", color: "#fef08a" },
      { offset: "48%", color: "#f97316" },
      { offset: "100%", color: "#dc2626" },
    ],
    gradientAngleDeg: 90,
    defaultDoubleStroke: {
      innerColor: "#ffffff",
      innerWidth: 8,
      outerColor: "#991b1b",
      outerWidth: 16,
    },
    shadowColor: "#450a0a",
    shadowOffsetX: 6,
    shadowOffsetY: 7,
    decorationKind: "shock-rays",
    decorationColor: "#facc15",
    jitterAmplitude: 4.5,
  },
  {
    id: "horror",
    labelKo: "공포",
    summaryKo: "불안하게 떨리는 글자 축과 스며드는 음영의 스릴러 효과음",
    fontFamily: "'Nanum Myeongjo', 'Batang', serif",
    fontWeight: 800,
    baseFontSize: 76,
    letterSpacing: 5,
    defaultSkewDeg: 5,
    fillGradientStops: [
      { offset: "0%", color: "#e2e8f0" },
      { offset: "45%", color: "#991b1b" },
      { offset: "100%", color: "#1e1b4b" },
    ],
    gradientAngleDeg: 90,
    defaultDoubleStroke: {
      innerColor: "#09090b",
      innerWidth: 6,
      outerColor: "#7f1d1d",
      outerWidth: 13,
    },
    shadowColor: "#000000",
    shadowOffsetX: 2,
    shadowOffsetY: 9,
    decorationKind: "horror-drip",
    decorationColor: "#7f1d1d",
    jitterAmplitude: 6.2,
  },
]);

export const SFX_DISTORTION_LABELS: Readonly<Record<SfxDistortionMode, string>> = Object.freeze({
  none: "직선 기본",
  "arch-up": "상향 아치",
  "arch-down": "하향 아치",
  "perspective-left": "좌→우 원근",
  "perspective-right": "우→좌 원근",
  "perspective-burst": "중앙 돌출",
});

export const SFX_LOCALE_LABELS: Readonly<Record<SfxLocaleCode, string>> = Object.freeze({
  ko: "한국어 (KO)",
  en: "영어 (EN)",
  ja: "일본어 (JA)",
  zh: "중국어 (ZH)",
});

export const SFX_PRESET_PHRASES: readonly SfxPresetPhrase[] = Object.freeze([
  {
    id: "kwang",
    textKo: "쾅!",
    labelKo: "강타·충돌",
    recommendedStyle: "shockwave",
    recommendedDistortion: "perspective-burst",
    translations: { ko: "쾅!", en: "BOOM!", ja: "ドォン!", zh: "轰!" },
  },
  {
    id: "seueuk",
    textKo: "스윽",
    labelKo: "미끄러짐·시선",
    recommendedStyle: "brush",
    recommendedDistortion: "perspective-left",
    translations: { ko: "스윽", en: "SWISH", ja: "スッ", zh: "唰" },
  },
  {
    id: "dugeun",
    textKo: "두근",
    labelKo: "심장 고동·긴장",
    recommendedStyle: "horror",
    recommendedDistortion: "arch-up",
    translations: { ko: "두근", en: "BA-DUMP", ja: "ドキッ", zh: "扑通" },
  },
  {
    id: "paat",
    textKo: "파앗!",
    labelKo: "섬광·돌파",
    recommendedStyle: "shockwave",
    recommendedDistortion: "arch-up",
    translations: { ko: "파앗!", en: "FLASH!", ja: "パァッ!", zh: "刷!" },
  },
  {
    id: "cheolkeok",
    textKo: "철컥",
    labelKo: "금속·장전",
    recommendedStyle: "metal",
    recommendedDistortion: "perspective-right",
    translations: { ko: "철컥", en: "CLACK", ja: "カチャッ", zh: "咔哒" },
  },
  {
    id: "kkiiik",
    textKo: "끼이익",
    labelKo: "문 열림·공포",
    recommendedStyle: "horror",
    recommendedDistortion: "arch-down",
    translations: { ko: "끼이익", en: "CREEAAK", ja: "ギィィ…", zh: "嘎吱—" },
  },
  {
    id: "ureureung",
    textKo: "우르릉",
    labelKo: "천둥·지진",
    recommendedStyle: "brush",
    recommendedDistortion: "perspective-left",
    translations: { ko: "우르릉", en: "RUMBLE", ja: "ゴゴゴ", zh: "轰隆隆" },
  },
  {
    id: "kkaeng",
    textKo: "챙!",
    labelKo: "검격·격돌",
    recommendedStyle: "metal",
    recommendedDistortion: "perspective-burst",
    translations: { ko: "챙!", en: "CLANG!", ja: "キィン!", zh: "锵!" },
  },
]);

export const DEFAULT_SFX_PLACEMENT: SfxCutPlacement = Object.freeze({
  cutId: "cut-01",
  x: 120,
  y: 160,
  width: 360,
  height: 170,
  rotationDeg: -6,
  anchor: "center",
  zIndex: 40,
});

export function getSfxStylePreset(styleId: SfxStyleId): SfxStylePreset {
  return SFX_STYLE_PRESETS.find((preset) => preset.id === styleId) ?? SFX_STYLE_PRESETS[0]!;
}
