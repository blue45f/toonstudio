/**
 * #33 글로벌 4대 문화권 프로필, 통화/도량형 환산 규칙 및 문화권 용어 사전 (₩0 로컬 · 0 AI 토큰).
 */

export type LocalizationCultureId =
  | "ko-vertical-scroll"
  | "jp-rtl-manga"
  | "en-ltr-comic"
  | "zh-vertical-scroll";

export type HorizontalReadingFlow = "ltr" | "rtl";
export type BalloonWritingMode = "horizontal-tb" | "vertical-rl";
export type MeasurementSystem = "metric" | "imperial";
export type LocalizationCurrencyCode = "KRW" | "JPY" | "USD" | "CNY";
export type LocalizationReviewSeverity = "info" | "warning" | "error";

export type LocalizationReviewFlagCode =
  | "TEXT_OVERFLOW_EXPANSION"
  | "WRITING_MODE_ASPECT_MISMATCH"
  | "BALLOON_OUT_OF_SAFE_BOUNDS"
  | "TAIL_DETACHED_OR_INVALID"
  | "ASYMMETRIC_ART_FLIP_REVIEW"
  | "CULTURAL_GESTURE_REVIEW"
  | "BAKED_SFX_REDRAW_REQUIRED"
  | "HONORIFIC_OR_CULTURAL_TERM_REVIEW"
  | "CURRENCY_CONVERTED"
  | "CURRENCY_REVIEW_NEEDED"
  | "UNIT_CONVERTED"
  | "UNIT_SYSTEM_MISMATCH"
  | "FONT_TOO_SMALL_FOR_CULTURE"
  | "READING_ORDER_REINDEXED";

export interface CultureLocalizationProfile {
  readonly id: LocalizationCultureId;
  readonly labelKo: string;
  readonly readingDirection: "ltr-ttb" | "rtl-ttb";
  readonly horizontalFlow: HorizontalReadingFlow;
  readonly writingMode: BalloonWritingMode;
  readonly currencyCode: LocalizationCurrencyCode;
  readonly currencySymbol: string;
  readonly measurementSystem: MeasurementSystem;
  readonly layoutFormat: "vertical-scroll" | "page-spread" | "ltr-comic";
  readonly minFontSizePx: number;
  readonly recommendedLineChars: number;
  readonly textExpansionFactor: number;
}

export const GLOBAL_CULTURE_PROFILES: Readonly<
  Record<LocalizationCultureId, CultureLocalizationProfile>
> = {
  "ko-vertical-scroll": {
    id: "ko-vertical-scroll",
    labelKo: "한국 세로 스크롤 웹툰",
    readingDirection: "ltr-ttb",
    horizontalFlow: "ltr",
    writingMode: "horizontal-tb",
    currencyCode: "KRW",
    currencySymbol: "₩",
    measurementSystem: "metric",
    layoutFormat: "vertical-scroll",
    minFontSizePx: 14,
    recommendedLineChars: 18,
    textExpansionFactor: 1.0,
  },
  "jp-rtl-manga": {
    id: "jp-rtl-manga",
    labelKo: "일본 우→좌 종서 만화",
    readingDirection: "rtl-ttb",
    horizontalFlow: "rtl",
    writingMode: "vertical-rl",
    currencyCode: "JPY",
    currencySymbol: "¥",
    measurementSystem: "metric",
    layoutFormat: "page-spread",
    minFontSizePx: 13,
    recommendedLineChars: 16,
    textExpansionFactor: 1.12,
  },
  "en-ltr-comic": {
    id: "en-ltr-comic",
    labelKo: "북미/글로벌 좌→우 코믹",
    readingDirection: "ltr-ttb",
    horizontalFlow: "ltr",
    writingMode: "horizontal-tb",
    currencyCode: "USD",
    currencySymbol: "$",
    measurementSystem: "imperial",
    layoutFormat: "ltr-comic",
    minFontSizePx: 15,
    recommendedLineChars: 26,
    textExpansionFactor: 1.38,
  },
  "zh-vertical-scroll": {
    id: "zh-vertical-scroll",
    labelKo: "중화권 세로 스크롤 웹툰",
    readingDirection: "ltr-ttb",
    horizontalFlow: "ltr",
    writingMode: "horizontal-tb",
    currencyCode: "CNY",
    currencySymbol: "¥",
    measurementSystem: "metric",
    layoutFormat: "vertical-scroll",
    minFontSizePx: 14,
    recommendedLineChars: 16,
    textExpansionFactor: 0.92,
  },
};

/** USD 1.00 기준 기본 로컬 환율표(외부 API 호출 없음, 옵션으로 재정의 가능). */
export const DEFAULT_USD_EXCHANGE_RATES: Readonly<Record<LocalizationCurrencyCode, number>> = {
  USD: 1.0,
  KRW: 1350.0,
  JPY: 150.0,
  CNY: 7.2,
};

export interface ConvertedExpressionRecord {
  readonly panelId: string;
  readonly balloonId: string;
  readonly kind: "currency" | "unit";
  readonly originalText: string;
  readonly convertedText: string;
  readonly sourceCode: string;
  readonly targetCode: string;
  readonly sourceValue: number;
  readonly targetValue: number;
}

export interface LocalizationReviewFlag {
  readonly code: LocalizationReviewFlagCode;
  readonly severity: LocalizationReviewSeverity;
  readonly panelId: string;
  readonly balloonId?: string;
  readonly sfxId?: string;
  readonly messageKo: string;
  readonly suggestedActionKo: string;
}

export const CULTURAL_KEYWORD_RULES: readonly {
  readonly token: string;
  readonly categoryKo: string;
  readonly adviceKo: string;
}[] = [
  { token: "선배", categoryKo: "한국어 위계 호칭", adviceKo: "이름 호칭 또는 senpai/先輩로 일관화하세요." },
  { token: "오빠", categoryKo: "친족·연상 호칭", adviceKo: "캐릭터 관계에 맞는 현지 호칭으로 조정하세요." },
  { token: "형", categoryKo: "남성 연상 호칭", adviceKo: "친형제 여부·친밀도에 따라 호칭을 현지화하세요." },
  { token: "언니", categoryKo: "여성 연상 호칭", adviceKo: "친자매 여부·말투에 맞춰 호칭을 변환하세요." },
  { token: "先輩", categoryKo: "일본어 위계 호칭", adviceKo: "한국어(선배) 또는 영어(이름/senpai) 기준을 확인하세요." },
  { token: "さん", categoryKo: "일본어 경칭 접미사", adviceKo: "대상 언어 존칭(씨/님/Mr./Ms.)과 중복 여부를 검수하세요." },
  { token: "세배", categoryKo: "한국 고유 명절 관습", adviceKo: "해외 독자용 짧은 각주나 문맥 보완을 검토하세요." },
  { token: "온돌", categoryKo: "한국 고유 주거 문화", adviceKo: "heated floor 등 문화권 보완 표기를 검토하세요." },
];

export function roundMetric(value: number, decimals: number): number {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

function formatLocalizedCurrency(amount: number, code: LocalizationCurrencyCode): string {
  if (code === "KRW") {
    return `₩${(Math.round(amount / 10) * 10).toLocaleString("en-US")}`;
  }
  if (code === "JPY") {
    return `¥${Math.round(amount).toLocaleString("en-US")}`;
  }
  if (code === "CNY") {
    return `¥${roundMetric(amount, amount >= 100 ? 0 : 1).toLocaleString("en-US")}`;
  }
  return `$${roundMetric(amount, 2).toFixed(2)}`;
}

interface CurrencyPatternSpec {
  readonly code: LocalizationCurrencyCode;
  readonly regex: RegExp;
  readonly multiplier: number;
}

function buildCurrencyPatterns(sourceCurrency: LocalizationCurrencyCode): readonly CurrencyPatternSpec[] {
  const yenCode: LocalizationCurrencyCode = sourceCurrency === "CNY" ? "CNY" : "JPY";
  return [
    { code: "KRW", regex: /(\d[\d,]*(?:\.\d+)?)\s*만\s*원/g, multiplier: 10000 },
    { code: "KRW", regex: /(\d[\d,]*(?:\.\d+)?)\s*천\s*원/g, multiplier: 1000 },
    { code: "KRW", regex: /(\d[\d,]*(?:\.\d+)?)\s*원/g, multiplier: 1 },
    { code: "KRW", regex: /(?:₩|KRW\s*)(\d[\d,]*(?:\.\d+)?)/g, multiplier: 1 },
    { code: "JPY", regex: /(\d[\d,]*(?:\.\d+)?)\s*円/g, multiplier: 1 },
    { code: "JPY", regex: /JPY\s*(\d[\d,]*(?:\.\d+)?)/g, multiplier: 1 },
    { code: "CNY", regex: /(?:CNY\s*|RMB\s*)(\d[\d,]*(?:\.\d+)?)/g, multiplier: 1 },
    { code: "CNY", regex: /(\d[\d,]*(?:\.\d+)?)\s*元/g, multiplier: 1 },
    { code: yenCode, regex: /¥\s*(\d[\d,]*(?:\.\d+)?)/g, multiplier: 1 },
    { code: "USD", regex: /(?:\$|USD\s*)(\d[\d,]*(?:\.\d+)?)/g, multiplier: 1 },
    { code: "USD", regex: /(\d[\d,]*(?:\.\d+)?)\s*달러/g, multiplier: 1 },
  ];
}

interface UnitConversionRule {
  readonly sourceSystem: MeasurementSystem;
  readonly sourceUnit: string;
  readonly targetUnit: string;
  readonly regex: RegExp;
  readonly convert: (value: number) => number;
  readonly decimals: number;
}

const UNIT_CONVERSION_RULES: readonly UnitConversionRule[] = [
  { sourceSystem: "metric", sourceUnit: "cm", targetUnit: "in", regex: /(\d+(?:\.\d+)?)\s*cm\b/gi, convert: (v) => v / 2.54, decimals: 1 },
  { sourceSystem: "metric", sourceUnit: "km", targetUnit: "mi", regex: /(\d+(?:\.\d+)?)\s*km\b/gi, convert: (v) => v * 0.621371, decimals: 2 },
  { sourceSystem: "metric", sourceUnit: "kg", targetUnit: "lb", regex: /(\d+(?:\.\d+)?)\s*kg\b/gi, convert: (v) => v * 2.20462, decimals: 1 },
  { sourceSystem: "metric", sourceUnit: "°C", targetUnit: "°F", regex: /(-?\d+(?:\.\d+)?)\s*(?:°C|℃)/g, convert: (v) => (v * 9) / 5 + 32, decimals: 1 },
  {
    sourceSystem: "imperial",
    sourceUnit: "in",
    targetUnit: "cm",
    regex: /(\d+(?:\.\d+)?)(?:\s*(?:inches|inch)\b|in\b|\s+in\b(?![ \t]+(?:the|a|an|my|your|his|her|our|their|this|that)\b))/gi,
    convert: (v) => v * 2.54,
    decimals: 1,
  },
  { sourceSystem: "imperial", sourceUnit: "mi", targetUnit: "km", regex: /(\d+(?:\.\d+)?)\s*(?:miles|mile|mi)\b/gi, convert: (v) => v * 1.60934, decimals: 2 },
  { sourceSystem: "imperial", sourceUnit: "lb", targetUnit: "kg", regex: /(\d+(?:\.\d+)?)\s*(?:pounds|pound|lbs|lb)\b/gi, convert: (v) => v * 0.453592, decimals: 1 },
  { sourceSystem: "imperial", sourceUnit: "°F", targetUnit: "°C", regex: /(-?\d+(?:\.\d+)?)\s*(?:°F|℉)/g, convert: (v) => ((v - 32) * 5) / 9, decimals: 1 },
];

/**
 * 대사 문자열 내 통화(KRW/JPY/USD/CNY)와 도량형(metric ↔ imperial)을 결정적 로컬 규칙으로 환산·검수한다.
 */
export function localizeCurrenciesAndUnits(
  panelId: string,
  balloonId: string,
  text: string,
  sourceProfile: CultureLocalizationProfile,
  targetProfile: CultureLocalizationProfile,
  rates: Record<LocalizationCurrencyCode, number>,
  autoConvertCurrency: boolean,
  autoConvertUnits: boolean,
  preserveOriginalText: boolean,
  conversionsOut: ConvertedExpressionRecord[],
  flagsOut: LocalizationReviewFlag[],
): string {
  let workingText = text;
  const curHolders: string[] = [];
  const currencyPatterns = buildCurrencyPatterns(sourceProfile.currencyCode);

  for (let i = 0; i < currencyPatterns.length; i += 1) {
    const spec = currencyPatterns[i];
    if (spec.code === targetProfile.currencyCode) {
      continue;
    }
    const pattern = new RegExp(spec.regex.source, spec.regex.flags);
    workingText = workingText.replace(pattern, (match, numStr: string) => {
      const rawValue = Number(numStr.replace(/,/g, "")) * spec.multiplier;
      if (!Number.isFinite(rawValue)) {
        return match;
      }
      const converted = (rawValue / rates[spec.code]) * rates[targetProfile.currencyCode];
      const formatted = formatLocalizedCurrency(converted, targetProfile.currencyCode);
      conversionsOut.push({
        panelId,
        balloonId,
        kind: "currency",
        originalText: match,
        convertedText: formatted,
        sourceCode: spec.code,
        targetCode: targetProfile.currencyCode,
        sourceValue: roundMetric(rawValue, 2),
        targetValue: roundMetric(converted, 2),
      });
      if (autoConvertCurrency && !preserveOriginalText) {
        flagsOut.push({
          code: "CURRENCY_CONVERTED",
          severity: "info",
          panelId,
          balloonId,
          messageKo: `통화(${match} → ${formatted})를 ${targetProfile.currencyCode} 기준으로 자동 환산했습니다.`,
          suggestedActionKo: "작중 물가·시대 배경에 맞춰 최종 금액 표기를 확인하세요.",
        });
        curHolders.push(formatted);
        return `__TOON_CUR_${curHolders.length - 1}__`;
      }
      flagsOut.push({
        code: "CURRENCY_REVIEW_NEEDED",
        severity: "warning",
        panelId,
        balloonId,
        messageKo: `원본 통화(${match}, ${spec.code})가 대상 문화권(${targetProfile.currencyCode})과 다릅니다.`,
        suggestedActionKo: `${formatted} 환산 또는 각주 표기를 검토하세요.`,
      });
      return match;
    });
  }
  for (let i = 0; i < curHolders.length; i += 1) {
    workingText = workingText.split(`__TOON_CUR_${i}__`).join(curHolders[i]);
  }

  const unitHolders: string[] = [];
  for (let i = 0; i < UNIT_CONVERSION_RULES.length; i += 1) {
    const rule = UNIT_CONVERSION_RULES[i];
    if (rule.sourceSystem === targetProfile.measurementSystem) {
      continue;
    }
    const pattern = new RegExp(rule.regex.source, rule.regex.flags);
    workingText = workingText.replace(pattern, (match, numStr: string) => {
      const sourceValue = Number(numStr);
      if (!Number.isFinite(sourceValue)) {
        return match;
      }
      const targetValue = roundMetric(rule.convert(sourceValue), rule.decimals);
      const formatted = `${targetValue}${rule.targetUnit}`;
      conversionsOut.push({
        panelId,
        balloonId,
        kind: "unit",
        originalText: match,
        convertedText: formatted,
        sourceCode: rule.sourceUnit,
        targetCode: rule.targetUnit,
        sourceValue,
        targetValue,
      });
      if (autoConvertUnits && !preserveOriginalText) {
        flagsOut.push({
          code: "UNIT_CONVERTED",
          severity: "info",
          panelId,
          balloonId,
          messageKo: `도량형(${match} → ${formatted})을 ${targetProfile.measurementSystem} 체계로 변환했습니다.`,
          suggestedActionKo: "대사 리듬에 맞춰 자연스러운 반올림 수치인지 확인하세요.",
        });
        unitHolders.push(formatted);
        return `__TOON_UNIT_${unitHolders.length - 1}__`;
      }
      flagsOut.push({
        code: "UNIT_SYSTEM_MISMATCH",
        severity: "warning",
        panelId,
        balloonId,
        messageKo: `도량형(${match})이 대상 문화권(${targetProfile.measurementSystem})과 다릅니다.`,
        suggestedActionKo: `${formatted} 환산 또는 괄호 병기를 검토하세요.`,
      });
      return match;
    });
  }
  for (let i = 0; i < unitHolders.length; i += 1) {
    workingText = workingText.split(`__TOON_UNIT_${i}__`).join(unitHolders[i]);
  }
  return workingText;
}
