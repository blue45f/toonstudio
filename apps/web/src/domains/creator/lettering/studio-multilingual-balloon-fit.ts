/**
 * Studio Multilingual Balloon Fit — 한국어 원문 기반 다국어 말풍선 넘침·가독성 사전 진단 코어.
 *
 * 기존 `studio-dialogue-length-budget.ts`의 길이 정규화(`measureDialogueLength`)와
 * `studio-bubble-text-fit.ts`의 단일 패딩 공식(`bubbleTextBoxWidth` / `bubbleTextBoxHeight`)을
 * 재사용해, 번역이 들어오기 전 단계에서 말풍선 바운딩 박스(폭×높이)·폰트 크기·행간·한국어
 * 원문 길이만으로 언어별 넘침 위험도(`safe` / `tight` / `overflow`), 권장 폰트 축소율,
 * 말풍선 최소 확장 px, 390px 모바일 가독성 최소 폰트 크기 가드를 결정적으로 계산한다.
 *
 * - DOM / Canvas / Konva 의존 없음(순수·결정적).
 * - 입력 객체를 변형하지 않으며 반환 구조는 동결(Object.freeze)한다.
 */

import { STUDIO_CANVAS_WIDTH } from "../canvas/studio-canvas-constants";
import {
  BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
  bubbleHorizontalPadding,
  bubbleTextBoxHeight,
  bubbleTextBoxWidth,
  bubbleVerticalPaddingTotal,
} from "./studio-bubble-text-fit";
import { measureDialogueLength } from "./studio-dialogue-length-budget";

export type MultilingualBalloonTargetLocale = "en" | "ja" | "th" | "es" | "zh";

export type BalloonOverflowRisk = "safe" | "tight" | "overflow";

export interface MultilingualBalloonExpansionProfile {
  readonly locale: MultilingualBalloonTargetLocale;
  readonly labelKo: string;
  /** 한국어 원문 대비 번역 시 예상 텍스트 확장 계수. */
  readonly expansionFactor: number;
  readonly rationaleKo: string;
}

/** 한국어 원문 기준 다국어 말풍선 확장 계수 정본 표. */
export const MULTILINGUAL_BALLOON_EXPANSION_PROFILES: Readonly<
  Record<MultilingualBalloonTargetLocale, MultilingualBalloonExpansionProfile>
> = Object.freeze({
  en: Object.freeze({
    locale: "en",
    labelKo: "영어",
    expansionFactor: 1.35,
    rationaleKo: "관사·전치사·단어 줄바꿈 여유로 한국어 대비 약 1.35배 확장",
  }),
  ja: Object.freeze({
    locale: "ja",
    labelKo: "일본어",
    expansionFactor: 1.12,
    rationaleKo: "히라가나·조사 표기로 한국어 대비 약 1.12배 확장",
  }),
  th: Object.freeze({
    locale: "th",
    labelKo: "태국어",
    expansionFactor: 1.28,
    rationaleKo: "성조·모음 기호와 연속 음절로 한국어 대비 약 1.28배 확장",
  }),
  es: Object.freeze({
    locale: "es",
    labelKo: "스페인어",
    expansionFactor: 1.42,
    rationaleKo: "관사·어미 굴절·긴 어휘로 한국어 대비 약 1.42배 확장",
  }),
  zh: Object.freeze({
    locale: "zh",
    labelKo: "중국어",
    expansionFactor: 0.85,
    rationaleKo: "한자 압축 표기로 한국어 대비 약 0.85배 수준",
  }),
});

export const DEFAULT_MULTILINGUAL_TARGET_LOCALES: readonly MultilingualBalloonTargetLocale[] =
  Object.freeze(["en", "ja", "th", "es", "zh"]);

/** 모바일 웹툰 가독성 기준 뷰포트 폭(px). */
export const MOBILE_VIEWPORT_WIDTH_PX = 390;

/** 390px 모바일 화면에서 대사가 뭉개지지 않는 최소 실효 글자 크기(CSS px). */
export const MOBILE_MIN_READABLE_FONT_PX = 11;

/** 말풍선 높이 점유율이 이 비율을 넘으면 넘침 직전(`tight`)으로 본다. */
export const BALLOON_TIGHT_UTILIZATION_THRESHOLD = 0.85;

/** 폰트 축소 탐색 간격(px). studio-bubble-text-fit의 0.5px 그리드와 일치한다. */
const FONT_SEARCH_STEP_PX = 0.5;
const MAX_WIDTH_SEARCH_EXPAND_PX = 4_000;

export interface MultilingualBalloonFitInput {
  /** 말풍선 바운딩 박스 폭(px). */
  readonly boxWidthPx: number;
  /** 말풍선 바운딩 박스 높이(px). */
  readonly boxHeightPx: number;
  /** 현재 캔버스 폰트 크기(px). */
  readonly fontSizePx: number;
  /** 행간 배수(예: 1.35). */
  readonly lineHeight: number;
  /** 한국어 원문 텍스트(줄바꿈 포함 가능). `sourceCharCount`와 함께 쓰면 명시 숫자가 우선한다. */
  readonly sourceText?: string;
  /** 한국어 원문 글자 수(정수). 생략 시 `sourceText`에서 정규화 길이를 계산한다. */
  readonly sourceCharCount?: number;
  /** 캔버스 논리 폭(px). 기본값은 Studio 정본 폭(720px). 390px 모바일 가독성 환산에 사용한다. */
  readonly canvasWidthPx?: number;
  /** 모바일 기준 뷰포트 폭(px). 기본 390px. */
  readonly mobileViewportWidthPx?: number;
  /** 390px 모바일 기준 최소 허용 글자 크기(CSS px). 기본 11px. */
  readonly mobileMinReadableFontPx?: number;
  /** 말풍선 내부 여백(px). 생략 시 studio-bubble-text-fit의 폰트 비례 패딩 공식을 사용한다. */
  readonly paddingPx?: number;
  /** 진단 대상 언어 목록. 생략 시 en·ja·th·es·zh 전체. */
  readonly targetLocales?: readonly MultilingualBalloonTargetLocale[];
  /** 작품 실측 보정 등 언어별 확장 계수 덮어쓰기. */
  readonly expansionFactorOverrides?: Readonly<
    Partial<Record<MultilingualBalloonTargetLocale, number>>
  >;
}

export interface MultilingualBalloonLocaleDiagnosis {
  readonly locale: MultilingualBalloonTargetLocale;
  readonly labelKo: string;
  readonly expansionFactor: number;
  readonly sourceCharCount: number;
  readonly estimatedCharCount: number;
  readonly estimatedLineCount: number;
  readonly requiredTextHeightPx: number;
  readonly availableTextHeightPx: number;
  readonly heightUtilization: number;
  readonly risk: BalloonOverflowRisk;
  /** 390px 모바일 가독성 하한을 지킨 권장 폰트 크기(캔버스 px). */
  readonly recommendedFontSizePx: number;
  /** 권장 폰트 축소율(0..1, 예: 0.85는 15% 축소, 1은 축소 불필요). */
  readonly recommendedFontShrinkRatio: number;
  /** 권장 폰트 축소 퍼센트(0..100). */
  readonly recommendedFontShrinkPercent: number;
  /** 권장 폰트가 390px 모바일 화면에 그려질 때의 실효 크기(CSS px). */
  readonly effectiveMobileFontPx: number;
  /** 현재 폰트가 390px 모바일 화면에 그려질 때의 실효 크기(CSS px). */
  readonly currentMobileFontPx: number;
  /** 폰트 축소가 390px 모바일 최소 가독성 하한에 걸렸는지 여부. */
  readonly mobileReadabilityGuarded: boolean;
  /** 현재 폰트 자체가 390px 모바일 가독성 하한 미만인지 여부. */
  readonly currentFontBelowMobileFloor: boolean;
  /** 넘침 해소에 필요한 최소 말풍선 세로 확장(px). 여유/빠듯 상태면 0. */
  readonly minBalloonExpandHeightPx: number;
  /** 높이 고정 시 넘침 해소에 필요한 최소 말풍선 가로 확장(px). 세로 1줄 미만이면 0. */
  readonly minBalloonExpandWidthPx: number;
  /** 넘침 해소를 위한 최소 말풍선 확장(px, 세로 우선). */
  readonly minBalloonExpandPx: number;
  /** 작가에게 바로 실행 가능한 한글 진단 문구. */
  readonly guidanceKo: string;
}

export interface MultilingualBalloonFitReport {
  readonly sourceCharCount: number;
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly fontSizePx: number;
  readonly lineHeight: number;
  readonly canvasWidthPx: number;
  readonly mobileViewportWidthPx: number;
  readonly mobileScale: number;
  readonly mobileMinReadableFontPx: number;
  readonly minCanvasFontSizeForMobilePx: number;
  readonly currentMobileFontPx: number;
  readonly currentFontBelowMobileFloor: boolean;
  readonly worstRisk: BalloonOverflowRisk;
  readonly worstLocale: MultilingualBalloonTargetLocale | null;
  readonly maxRequiredExpandPx: number;
  readonly overflowLocaleCount: number;
  readonly tightLocaleCount: number;
  readonly guardedLocaleCount: number;
  readonly locales: readonly MultilingualBalloonLocaleDiagnosis[];
  readonly summaryKo: string;
}

const RISK_PRIORITY: Readonly<Record<BalloonOverflowRisk, number>> = {
  safe: 0,
  tight: 1,
  overflow: 2,
};

function roundTo(value: number, digits: number): number {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
}

function ceilHalfPx(value: number): number {
  return Math.ceil(value * 2 - 1e-9) / 2;
}

function floorHalfPx(value: number): number {
  return Math.floor(value * 2 + 1e-9) / 2;
}

/** BCP-47 로케일 코드(`en-US`, `ja-JP`, `zh-Hans` 등)를 5개 진단 대상 로케일로 정규화한다. */
export function normalizeMultilingualTargetLocale(
  locale: string,
): MultilingualBalloonTargetLocale | null {
  const primary = locale.trim().toLowerCase().split(/[-_]/u)[0] ?? "";
  if (
    primary === "en" ||
    primary === "ja" ||
    primary === "th" ||
    primary === "es" ||
    primary === "zh"
  ) {
    return primary;
  }
  return null;
}

function validateInput(input: MultilingualBalloonFitInput): {
  canvasWidthPx: number;
  mobileViewportWidthPx: number;
  mobileMinReadableFontPx: number;
  paragraphLengths: readonly number[];
  sourceCharCount: number;
} {
  if (!Number.isFinite(input.boxWidthPx) || input.boxWidthPx <= 0) {
    throw new Error("boxWidthPx must be a positive finite number.");
  }
  if (!Number.isFinite(input.boxHeightPx) || input.boxHeightPx <= 0) {
    throw new Error("boxHeightPx must be a positive finite number.");
  }
  if (!Number.isFinite(input.fontSizePx) || input.fontSizePx <= 0) {
    throw new Error("fontSizePx must be a positive finite number.");
  }
  if (!Number.isFinite(input.lineHeight) || input.lineHeight <= 0) {
    throw new Error("lineHeight must be a positive finite number.");
  }

  const canvasWidthPx = input.canvasWidthPx ?? STUDIO_CANVAS_WIDTH;
  const mobileViewportWidthPx = input.mobileViewportWidthPx ?? MOBILE_VIEWPORT_WIDTH_PX;
  const mobileMinReadableFontPx = input.mobileMinReadableFontPx ?? MOBILE_MIN_READABLE_FONT_PX;

  if (!Number.isFinite(canvasWidthPx) || canvasWidthPx <= 0) {
    throw new Error("canvasWidthPx must be a positive finite number.");
  }
  if (!Number.isFinite(mobileViewportWidthPx) || mobileViewportWidthPx <= 0) {
    throw new Error("mobileViewportWidthPx must be a positive finite number.");
  }
  if (!Number.isFinite(mobileMinReadableFontPx) || mobileMinReadableFontPx <= 0) {
    throw new Error("mobileMinReadableFontPx must be a positive finite number.");
  }
  if (input.paddingPx !== undefined) {
    if (!Number.isFinite(input.paddingPx) || input.paddingPx < 0) {
      throw new Error("paddingPx must be a non-negative finite number.");
    }
    if (
      input.boxWidthPx <= input.paddingPx * 2 ||
      input.boxHeightPx <= input.paddingPx * 2
    ) {
      throw new Error("Balloon box must be larger than twice paddingPx.");
    }
  }
  if (input.sourceCharCount !== undefined) {
    if (!Number.isFinite(input.sourceCharCount) || input.sourceCharCount < 0) {
      throw new Error("sourceCharCount must be a non-negative finite number.");
    }
    const count = Math.round(input.sourceCharCount);
    return {
      canvasWidthPx,
      mobileViewportWidthPx,
      mobileMinReadableFontPx,
      paragraphLengths: count > 0 ? [count] : [],
      sourceCharCount: count,
    };
  }

  const rawText = input.sourceText ?? "";
  const totalCount = measureDialogueLength(rawText);
  if (totalCount === 0) {
    return {
      canvasWidthPx,
      mobileViewportWidthPx,
      mobileMinReadableFontPx,
      paragraphLengths: [],
      sourceCharCount: 0,
    };
  }
  const paragraphs = rawText
    .split(/\r?\n/u)
    .map((line) => measureDialogueLength(line))
    .filter((len) => len > 0);
  return {
    canvasWidthPx,
    mobileViewportWidthPx,
    mobileMinReadableFontPx,
    paragraphLengths: paragraphs.length > 0 ? paragraphs : [totalCount],
    sourceCharCount: totalCount,
  };
}

interface BoxGeometryMeasurement {
  readonly innerWidthPx: number;
  readonly innerHeightPx: number;
  readonly verticalPadPx: number;
  readonly horizontalPadPx: number;
  readonly lineCount: number;
  readonly requiredTextHeightPx: number;
  readonly heightUtilization: number;
  readonly fits: boolean;
}

function measureTextInBalloon(params: {
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly fontSizePx: number;
  readonly lineHeight: number;
  readonly paddingPx?: number;
  readonly paragraphLengths: readonly number[];
  readonly expansionFactor: number;
}): BoxGeometryMeasurement {
  const {
    boxWidthPx,
    boxHeightPx,
    fontSizePx,
    lineHeight,
    paddingPx,
    paragraphLengths,
    expansionFactor,
  } = params;

  const horizontalPadPx =
    paddingPx !== undefined ? paddingPx * 2 : bubbleHorizontalPadding(fontSizePx) * 2;
  const verticalPadPx =
    paddingPx !== undefined ? paddingPx * 2 : bubbleVerticalPaddingTotal(fontSizePx);
  const innerWidthPx =
    paddingPx !== undefined
      ? Math.max(8, boxWidthPx - horizontalPadPx)
      : bubbleTextBoxWidth(boxWidthPx, fontSizePx);
  const innerHeightPx =
    paddingPx !== undefined
      ? Math.max(8, boxHeightPx - verticalPadPx)
      : bubbleTextBoxHeight(boxHeightPx, fontSizePx);

  if (paragraphLengths.length === 0) {
    return {
      innerWidthPx,
      innerHeightPx,
      verticalPadPx,
      horizontalPadPx,
      lineCount: 0,
      requiredTextHeightPx: 0,
      heightUtilization: 0,
      fits: true,
    };
  }

  const singleCharFitsHorizontally = innerWidthPx >= fontSizePx;
  const charsPerLine = Math.max(1, Math.floor(innerWidthPx / fontSizePx));

  let lineCount = 0;
  for (const paraLen of paragraphLengths) {
    const projectedUnits = paraLen * expansionFactor;
    lineCount += Math.max(1, Math.ceil(projectedUnits / charsPerLine));
  }

  const requiredTextHeightPx = roundTo(lineCount * fontSizePx * lineHeight, 1);
  const heightUtilization = roundTo(requiredTextHeightPx / innerHeightPx, 3);
  const fits = singleCharFitsHorizontally && requiredTextHeightPx <= innerHeightPx;

  return {
    innerWidthPx,
    innerHeightPx,
    verticalPadPx,
    horizontalPadPx,
    lineCount,
    requiredTextHeightPx,
    heightUtilization,
    fits,
  };
}

function resolveExpansionFactor(
  locale: MultilingualBalloonTargetLocale,
  overrides?: Readonly<Partial<Record<MultilingualBalloonTargetLocale, number>>>,
): number {
  const override = overrides?.[locale];
  if (typeof override === "number" && Number.isFinite(override) && override > 0) {
    return override;
  }
  return MULTILINGUAL_BALLOON_EXPANSION_PROFILES[locale].expansionFactor;
}

function findLargestFittingFontPx(params: {
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly maxFontSizePx: number;
  readonly minFontSizePx: number;
  readonly lineHeight: number;
  readonly paddingPx?: number;
  readonly paragraphLengths: readonly number[];
  readonly expansionFactor: number;
}): number | null {
  const { maxFontSizePx, minFontSizePx } = params;
  if (minFontSizePx > maxFontSizePx) return null;

  const start = floorHalfPx(maxFontSizePx);
  const floor = ceilHalfPx(minFontSizePx);
  for (let candidate = start; candidate >= floor - 1e-9; candidate = roundTo(candidate - FONT_SEARCH_STEP_PX, 1)) {
    const measured = measureTextInBalloon({
      boxWidthPx: params.boxWidthPx,
      boxHeightPx: params.boxHeightPx,
      fontSizePx: candidate,
      lineHeight: params.lineHeight,
      paddingPx: params.paddingPx,
      paragraphLengths: params.paragraphLengths,
      expansionFactor: params.expansionFactor,
    });
    if (measured.fits) return candidate;
  }
  return null;
}

function findMinWidthExpandPx(params: {
  readonly boxWidthPx: number;
  readonly boxHeightPx: number;
  readonly fontSizePx: number;
  readonly lineHeight: number;
  readonly paddingPx?: number;
  readonly paragraphLengths: readonly number[];
  readonly expansionFactor: number;
}): number {
  const base = measureTextInBalloon(params);
  if (base.fits) return 0;

  // 세로 높이가 단 한 줄도 담지 못하면 가로 확장만으로는 넘침을 해소할 수 없다.
  const minLineHeightPx = params.fontSizePx * params.lineHeight;
  if (base.innerHeightPx < minLineHeightPx * Math.max(1, params.paragraphLengths.length)) {
    return 0;
  }

  let low = 1;
  let high = MAX_WIDTH_SEARCH_EXPAND_PX;
  const maxCheck = measureTextInBalloon({
    ...params,
    boxWidthPx: params.boxWidthPx + high,
  });
  if (!maxCheck.fits) return high;

  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    const probe = measureTextInBalloon({
      ...params,
      boxWidthPx: params.boxWidthPx + mid,
    });
    if (probe.fits) {
      high = mid;
    } else {
      low = mid + 1;
    }
  }
  return low;
}

function buildLocaleGuidanceKo(params: {
  readonly labelKo: string;
  readonly expansionFactor: number;
  readonly risk: BalloonOverflowRisk;
  readonly heightUtilization: number;
  readonly recommendedFontSizePx: number;
  readonly recommendedFontShrinkPercent: number;
  readonly currentMobileFontPx: number;
  readonly mobileMinReadableFontPx: number;
  readonly minCanvasFontSizeForMobilePx: number;
  readonly mobileReadabilityGuarded: boolean;
  readonly currentFontBelowMobileFloor: boolean;
  readonly minBalloonExpandHeightPx: number;
}): string {
  const {
    labelKo,
    expansionFactor,
    risk,
    heightUtilization,
    recommendedFontSizePx,
    recommendedFontShrinkPercent,
    currentMobileFontPx,
    mobileMinReadableFontPx,
    minCanvasFontSizeForMobilePx,
    mobileReadabilityGuarded,
    currentFontBelowMobileFloor,
    minBalloonExpandHeightPx,
  } = params;

  if (currentFontBelowMobileFloor) {
    if (minBalloonExpandHeightPx > 0) {
      return `${labelKo}(${expansionFactor}x) 기준 현재 글자가 390px 모바일에서 ${currentMobileFontPx}px로 작습니다. 폰트를 ${minCanvasFontSizeForMobilePx}px 이상으로 키우고 말풍선 높이를 ${minBalloonExpandHeightPx}px 넓히세요.`;
    }
    return `현재 글자가 390px 모바일에서 ${currentMobileFontPx}px로 최소 기준(${mobileMinReadableFontPx}px)보다 작습니다. 폰트를 ${minCanvasFontSizeForMobilePx}px 이상으로 키우세요.`;
  }

  if (risk === "overflow") {
    if (mobileReadabilityGuarded) {
      return `${labelKo}(${expansionFactor}x) 번역 시 말풍선을 넘칩니다. 폰트를 더 줄이면 390px 모바일 가독성(${mobileMinReadableFontPx}px) 아래로 떨어지므로 말풍선 높이를 최소 ${minBalloonExpandHeightPx}px 넓히세요.`;
    }
    return `${labelKo}(${expansionFactor}x) 번역 시 넘칩니다. 폰트를 ${recommendedFontSizePx}px(${recommendedFontShrinkPercent}% 축소)로 줄이거나 말풍선 높이를 최소 ${minBalloonExpandHeightPx}px 넓히세요.`;
  }

  if (risk === "tight") {
    const pct = Math.round(heightUtilization * 100);
    return `${labelKo}(${expansionFactor}x) 번역 시 말풍선 여백이 빠듯합니다(점유율 ${pct}%). 대사를 1~2어절 줄이거나 말풍선에 여유 높이를 두세요.`;
  }

  return `${labelKo}(${expansionFactor}x) 번역 후에도 현재 말풍선 안에 안정적으로 들어갑니다.`;
}

function diagnoseSingleLocale(params: {
  readonly input: MultilingualBalloonFitInput;
  readonly locale: MultilingualBalloonTargetLocale;
  readonly paragraphLengths: readonly number[];
  readonly sourceCharCount: number;
  readonly mobileScale: number;
  readonly mobileMinReadableFontPx: number;
  readonly minCanvasFontSizeForMobilePx: number;
}): MultilingualBalloonLocaleDiagnosis {
  const {
    input,
    locale,
    paragraphLengths,
    sourceCharCount,
    mobileScale,
    mobileMinReadableFontPx,
    minCanvasFontSizeForMobilePx,
  } = params;
  const profile = MULTILINGUAL_BALLOON_EXPANSION_PROFILES[locale];
  const expansionFactor = resolveExpansionFactor(locale, input.expansionFactorOverrides);
  const estimatedCharCount =
    sourceCharCount === 0 ? 0 : Math.max(1, Math.round(sourceCharCount * expansionFactor));

  const currentMobileFontPx = roundTo(input.fontSizePx * mobileScale, 1);
  const currentFontBelowMobileFloor =
    currentMobileFontPx + 1e-6 < mobileMinReadableFontPx;

  const base = measureTextInBalloon({
    boxWidthPx: input.boxWidthPx,
    boxHeightPx: input.boxHeightPx,
    fontSizePx: input.fontSizePx,
    lineHeight: input.lineHeight,
    paddingPx: input.paddingPx,
    paragraphLengths,
    expansionFactor,
  });

  const risk: BalloonOverflowRisk = !base.fits
    ? "overflow"
    : base.heightUtilization > BALLOON_TIGHT_UTILIZATION_THRESHOLD
      ? "tight"
      : "safe";

  let recommendedFontSizePx = input.fontSizePx;
  let mobileReadabilityGuarded = currentFontBelowMobileFloor;

  if (currentFontBelowMobileFloor) {
    recommendedFontSizePx = minCanvasFontSizeForMobilePx;
  } else if (risk === "overflow") {
    const guardedFit = findLargestFittingFontPx({
      boxWidthPx: input.boxWidthPx,
      boxHeightPx: input.boxHeightPx,
      maxFontSizePx: input.fontSizePx,
      minFontSizePx: minCanvasFontSizeForMobilePx,
      lineHeight: input.lineHeight,
      paddingPx: input.paddingPx,
      paragraphLengths,
      expansionFactor,
    });
    if (guardedFit !== null) {
      recommendedFontSizePx = guardedFit;
      mobileReadabilityGuarded = false;
    } else {
      // 모바일 가독성 하한 안에서는 축소만으로 못 들어간다 → 하한에서 고정하고 확장 px를 권고.
      const absoluteFloor = Math.min(
        BUBBLE_AUTO_SHRINK_MIN_FONT_DEFAULT,
        minCanvasFontSizeForMobilePx,
      );
      const unconstrained = findLargestFittingFontPx({
        boxWidthPx: input.boxWidthPx,
        boxHeightPx: input.boxHeightPx,
        maxFontSizePx: input.fontSizePx,
        minFontSizePx: Math.max(6, absoluteFloor),
        lineHeight: input.lineHeight,
        paddingPx: input.paddingPx,
        paragraphLengths,
        expansionFactor,
      });
      recommendedFontSizePx = Math.min(input.fontSizePx, minCanvasFontSizeForMobilePx);
      mobileReadabilityGuarded =
        unconstrained === null || unconstrained < minCanvasFontSizeForMobilePx;
    }
  }

  const effectiveFontForExpansion = currentFontBelowMobileFloor
    ? minCanvasFontSizeForMobilePx
    : input.fontSizePx;
  const expansionProbe =
    effectiveFontForExpansion === input.fontSizePx
      ? base
      : measureTextInBalloon({
          boxWidthPx: input.boxWidthPx,
          boxHeightPx: input.boxHeightPx,
          fontSizePx: effectiveFontForExpansion,
          lineHeight: input.lineHeight,
          paddingPx: input.paddingPx,
          paragraphLengths,
          expansionFactor,
        });

  const minBalloonExpandHeightPx = expansionProbe.fits
    ? 0
    : Math.max(1, Math.ceil(expansionProbe.requiredTextHeightPx - expansionProbe.innerHeightPx));

  const minBalloonExpandWidthPx = expansionProbe.fits
    ? 0
    : findMinWidthExpandPx({
        boxWidthPx: input.boxWidthPx,
        boxHeightPx: input.boxHeightPx,
        fontSizePx: effectiveFontForExpansion,
        lineHeight: input.lineHeight,
        paddingPx: input.paddingPx,
        paragraphLengths,
        expansionFactor,
      });

  const recommendedFontShrinkRatio = currentFontBelowMobileFloor
    ? 1
    : Math.min(1, roundTo(recommendedFontSizePx / input.fontSizePx, 3));
  const recommendedFontShrinkPercent = Math.max(
    0,
    Math.round((1 - recommendedFontShrinkRatio) * 100),
  );
  const effectiveMobileFontPx = roundTo(recommendedFontSizePx * mobileScale, 1);

  const guidanceKo = buildLocaleGuidanceKo({
    labelKo: profile.labelKo,
    expansionFactor,
    risk,
    heightUtilization: base.heightUtilization,
    recommendedFontSizePx,
    recommendedFontShrinkPercent,
    currentMobileFontPx,
    mobileMinReadableFontPx,
    minCanvasFontSizeForMobilePx,
    mobileReadabilityGuarded,
    currentFontBelowMobileFloor,
    minBalloonExpandHeightPx,
  });

  return Object.freeze({
    locale,
    labelKo: profile.labelKo,
    expansionFactor,
    sourceCharCount,
    estimatedCharCount,
    estimatedLineCount: base.lineCount,
    requiredTextHeightPx: base.requiredTextHeightPx,
    availableTextHeightPx: base.innerHeightPx,
    heightUtilization: base.heightUtilization,
    risk,
    recommendedFontSizePx,
    recommendedFontShrinkRatio,
    recommendedFontShrinkPercent,
    effectiveMobileFontPx,
    currentMobileFontPx,
    mobileReadabilityGuarded,
    currentFontBelowMobileFloor,
    minBalloonExpandHeightPx,
    minBalloonExpandWidthPx,
    minBalloonExpandPx: minBalloonExpandHeightPx,
    guidanceKo,
  });
}

/** 단일 대상 언어의 말풍선 넘침·모바일 가독성을 사전 진단한다. */
export function diagnoseMultilingualBalloonLocale(
  input: MultilingualBalloonFitInput,
  locale: MultilingualBalloonTargetLocale,
): MultilingualBalloonLocaleDiagnosis {
  const report = diagnoseMultilingualBalloonFit({
    ...input,
    targetLocales: [locale],
  });
  const first = report.locales[0];
  if (!first) {
    throw new Error("Target locale diagnosis could not be produced.");
  }
  return first;
}

/** 한국어 원문과 말풍선 기하 정보로 다국어(en·ja·th·es·zh) 넘침·390px 가독성을 일괄 진단한다. */
export function diagnoseMultilingualBalloonFit(
  input: MultilingualBalloonFitInput,
): MultilingualBalloonFitReport {
  const {
    canvasWidthPx,
    mobileViewportWidthPx,
    mobileMinReadableFontPx,
    paragraphLengths,
    sourceCharCount,
  } = validateInput(input);

  const targetLocales =
    input.targetLocales && input.targetLocales.length > 0
      ? [...new Set(input.targetLocales)]
      : DEFAULT_MULTILINGUAL_TARGET_LOCALES;

  const mobileScale = Math.min(1, mobileViewportWidthPx / canvasWidthPx);
  const minCanvasFontSizeForMobilePx = ceilHalfPx(mobileMinReadableFontPx / mobileScale);
  const currentMobileFontPx = roundTo(input.fontSizePx * mobileScale, 1);
  const currentFontBelowMobileFloor =
    currentMobileFontPx + 1e-6 < mobileMinReadableFontPx;

  const locales = targetLocales.map((locale) =>
    diagnoseSingleLocale({
      input,
      locale,
      paragraphLengths,
      sourceCharCount,
      mobileScale,
      mobileMinReadableFontPx,
      minCanvasFontSizeForMobilePx,
    }),
  );

  let worstRisk: BalloonOverflowRisk = "safe";
  let worstLocale: MultilingualBalloonTargetLocale | null = null;
  let worstUtilization = -1;
  let maxRequiredExpandPx = 0;
  let overflowLocaleCount = 0;
  let tightLocaleCount = 0;
  let guardedLocaleCount = 0;

  for (const item of locales) {
    if (item.risk === "overflow") overflowLocaleCount += 1;
    if (item.risk === "tight") tightLocaleCount += 1;
    if (item.mobileReadabilityGuarded) guardedLocaleCount += 1;
    if (item.minBalloonExpandPx > maxRequiredExpandPx) {
      maxRequiredExpandPx = item.minBalloonExpandPx;
    }
    const betterRisk = RISK_PRIORITY[item.risk] > RISK_PRIORITY[worstRisk];
    const tieMoreUtilized =
      RISK_PRIORITY[item.risk] === RISK_PRIORITY[worstRisk] &&
      item.heightUtilization > worstUtilization;
    if (worstLocale === null || betterRisk || tieMoreUtilized) {
      worstRisk = item.risk;
      worstLocale = item.locale;
      worstUtilization = item.heightUtilization;
    }
  }

  let summaryKo: string;
  if (sourceCharCount === 0) {
    summaryKo = currentFontBelowMobileFloor
      ? `390px 모바일 기준 현재 폰트(${currentMobileFontPx}px)가 작습니다. ${minCanvasFontSizeForMobilePx}px 이상을 권장합니다.`
      : "원문 대사를 입력하면 언어별 말풍선 넘침 위험을 바로 진단합니다.";
  } else if (overflowLocaleCount > 0) {
    const worstLabel = worstLocale
      ? MULTILINGUAL_BALLOON_EXPANSION_PROFILES[worstLocale].labelKo
      : "대상 언어";
    summaryKo =
      guardedLocaleCount > 0
        ? `${overflowLocaleCount}개 언어(${worstLabel} 포함)에서 넘침 위험 · 390px 가독성 하한 보호를 위해 말풍선 높이를 최소 ${maxRequiredExpandPx}px 넓히세요.`
        : `${overflowLocaleCount}개 언어(${worstLabel} 포함)에서 넘침 예상 · 말풍선 높이를 최소 ${maxRequiredExpandPx}px 넓히거나 폰트를 축소하세요.`;
  } else if (currentFontBelowMobileFloor) {
    summaryKo = `390px 모바일에서 글자가 ${currentMobileFontPx}px로 작습니다. 폰트를 ${minCanvasFontSizeForMobilePx}px 이상으로 키우세요.`;
  } else if (tightLocaleCount > 0) {
    summaryKo = `${tightLocaleCount}개 언어에서 말풍선 여백이 빠듯합니다. 대사를 조금 줄이거나 높이에 여유를 두세요.`;
  } else {
    summaryKo = `${locales.length}개 대상 언어 모두 현재 말풍선 안에 안정적으로 들어갑니다.`;
  }

  return Object.freeze({
    sourceCharCount,
    boxWidthPx: input.boxWidthPx,
    boxHeightPx: input.boxHeightPx,
    fontSizePx: input.fontSizePx,
    lineHeight: input.lineHeight,
    canvasWidthPx,
    mobileViewportWidthPx,
    mobileScale: roundTo(mobileScale, 4),
    mobileMinReadableFontPx,
    minCanvasFontSizeForMobilePx,
    currentMobileFontPx,
    currentFontBelowMobileFloor,
    worstRisk,
    worstLocale,
    maxRequiredExpandPx,
    overflowLocaleCount,
    tightLocaleCount,
    guardedLocaleCount,
    locales: Object.freeze(locales),
    summaryKo,
  });
}
