/**
 * Studio Dialogue Length Budget — 다국어 대사 길이 예산 순수 코어 (REPORT L-3).
 *
 * 왜 이 모듈이 따로 있어야 하는가
 * ------------------------------
 * 글로벌 동시 연재에서 번역문은 원문보다 길어지는 게 보통이다(언어별 팽창).
 * 그런데 지금까지 길이를 재는 시점은 전부 **번역이 들어온 뒤**였다 — 로컬라이제이션
 * QA의 넘침 게이트도, L-2의 말풍선 핏 사전 경고(studio-dialogue-bubble-fit)도
 * "지금 캔버스에 있는 텍스트"만 본다. 작가가 원문을 쓰는 시점에는 "이 대사를
 * 영어로 옮기면 말풍선에서 터질지"를 알 방법이 없어, 식자가 언어마다 다시 터졌다.
 *
 * 이 모듈이 추가하는 것:
 *  · 언어별 평균 팽창률(번역문 길이 ÷ 원문 길이)을 상수로 두고, 원문 작성 시점에
 *    언어별 **예상 길이**를 대사마다·회차 합계로 계산한다.
 *  · 말풍선 위험 판정은 새 추정식을 만들지 않는다 — 팽창률을 텍스트 폭 측정기의
 *    **배율**로 주입해 L-2와 같은 핏 엔진(bubbleTextFitsInBox /
 *    fitBubbleBoxHeightToText / fitBubbleFontSize)을 원문 그대로 미리 돌린다.
 *    "예상 번역문이 들어갈지"를 "원문을 rate배 넓게 재면 들어갈지"로 바꾸는 것이라
 *    렌더·커밋 판정과 구조적으로 어긋나지 않는다.
 *  · 실제 번역(dialogueI18n)이 작품에 쌓이면 원문 스냅샷↔번역문 쌍의 **실측
 *    팽창률(중앙값)** 으로 상수를 작품별로 보정한다(calibrateDialogueExpansion).
 *    표본이 기준(기본 5건)에 못 미치면 기본 상수를 그대로 쓰고, 실측값은
 *    참고값으로만 함께 돌려준다 — 적은 표본으로 예산이 요동치지 않게.
 *
 * 정직성 규칙:
 *  · 팽창률은 "글자 수" 기준이고, 글자 폭 차이는 일부러 상쇄하지 않는다(보수적
 *    예산). 라틴 문자는 한글보다 좁지만 단어 중간에서 줄을 바꿀 수 없어 줄
 *    끝 손실이 생기고, 실제 식자는 번역문에 더 큰 글자를 쓰는 경우도 많다 —
 *    L-2가 테마 미지정 시 행간 최댓값을 쓰는 것과 같은 방향(경고가 이르게 뜰
 *    수는 있어도, 늦게 떠서 식자 단계에서 터지는 일은 없게)이다.
 *  · 원문을 단정할 수 없는 대사는 예산에서 제외하고 따로 센다. 번역은 있는데
 *    원문 스냅샷(dialogueI18n의 SOURCE_LOCALE)이 없는 요소는 el.text가 "지금
 *    보이는 언어"라 원문이라고 단정할 수 없다(studio-dialogue-review와 동일).
 *  · 말풍선 크기가 없으면 핏 위험을 판정하지 않고 "확인 불가"로 따로 센다
 *    (예상 길이 표시 자체는 기하와 무관하게 제공한다).
 *  · 세로쓰기 말풍선은 길이 성장이 열(列) 방향이라 가로 판정을 적용하지 않고
 *    따로 센다. 예상 길이 표시는 동일하게 제공한다.
 *  · 숨김 대사는 기본 제외(화면에 없는 대사는 게시물에 없다 — L-2·맞춤법과
 *    동일). 잠긴 대사는 읽기가 잠금과 무관하므로 포함한다.
 *  · 결과는 어디까지나 **예상 예산**이다. 대사를 줄이거나 번역을 고치는 일은
 *    하지 않는다 — 집필 시점의 제약 가시화가 이 기능의 몫이다.
 *
 * 규칙(studio-dialogue-batch.ts와 동일 규율):
 *  - Konva/DOM 의존 없음(전부 순수·결정적). 텍스트 폭 측정은 핏 엔진과 같은
 *    BubbleTextMeasurer 포트로 주입받는다(기본값은 실제 캔버스 측정기).
 *  - 입력 배열/객체는 절대 변형하지 않는다. 사용자 노출 문자열은 한글.
 *  - 원문 언어는 한국어 고정이다(번역 코어가 "한국어에서 대상 언어로"를
 *    전제하는 것과 동일). 대상 로케일 기본 목록은 번역 코어의 프리셋을
 *    그대로 쓴다 — 목록을 복제하면 서로 어긋난다.
 */

import { isEffectivelyHidden, type LayerGroup } from "../studio-layers";
import {
  dialogueExcerpt,
  isDialogueElement,
  type DialogueElementLike,
} from "./studio-dialogue-batch";
import {
  DIALOGUE_LOCALE_PRESETS,
  SOURCE_LOCALE,
  localeLabel,
  type DialogueLocaleMap,
} from "./studio-dialogue-translate";
import {
  bubbleLetterSpacing,
  bubbleTextFitsInBox,
  createCanvasBubbleTextMeasurer,
  fitBubbleBoxHeightToText,
  fitBubbleFontSize,
  resolveBubbleFontFamily,
  resolveBubbleFontSize,
  resolveBubbleFontStyle,
  resolveBubbleLineHeight,
  type BubbleTextMeasurer,
  type BubbleWebtoonTheme,
} from "./studio-bubble-text-fit";

// ── 구조 타입 — StudioPage El/PageState 의 예산 판정에 필요한 최소 부분집합 ──

/** 대사 요소의 핏 관련 필드 — DialogueElementLike에 없는 타이포그래피 필드를 얹는다(L-2와 동일 형태). */
export type LengthBudgetElementLike = DialogueElementLike & {
  fontSize?: number;
  lineHeight?: number;
  vertical?: boolean;
  font?: string;
  fontStyle?: string;
  /** true면 높이 대신 폰트 자동 축소 모드(studio-bubble-text-fit의 fitBubbleFontSize 경로). */
  autoShrinkText?: boolean;
  autoShrinkMinFontSize?: number;
};

/** 페이지 최소 형태 — DialoguePageLike + 번역 저장소(dialogueI18n). 구조 호환이라 패널이 pages를 그대로 넘긴다. */
export type LengthBudgetPageLike = {
  id: string;
  elements: readonly LengthBudgetElementLike[];
  groups?: LayerGroup[];
  dialogueI18n?: DialogueLocaleMap;
};

// ── 팽창률 기본 상수 ────────────────────────────────────────────────────────

/**
 * 한국어 원문 기준 언어별 기본 팽창률(번역문 유효 길이 ÷ 원문 유효 길이).
 *
 * 출발점 상수다 — 로컬라이제이션 실무에서 반복 보고되는 언어별 증감 경향
 * (영어·스페인어·프랑스어는 관사·주어·전치사 등으로 길어지고, 중국어는
 * 한자 표기로 짧아지며, 일본어는 가나 표기로 소폭 길어진다)을 한국어
 * 원문 기준으로 보수적으로 잡았다. 작품에 실제 번역이 쌓이면
 * calibrateDialogueExpansion의 실측 중앙값이 이 값을 대체하므로,
 * 이 표는 "번역이 아직 없는 작품"의 예산에만 쓰인다.
 */
export const DIALOGUE_EXPANSION_DEFAULTS: Readonly<
  Record<string, { rate: number; basis: string }>
> = {
  en: { rate: 1.35, basis: "주어·관사·전치사가 더해져 길어지는 경향" },
  ja: { rate: 1.1, basis: "가나 표기로 소폭 길어지는 경향" },
  "zh-Hans": { rate: 0.8, basis: "한자 표기로 짧아지는 경향" },
  "zh-Hant": { rate: 0.85, basis: "한자 표기로 짧아지는 경향" },
  es: { rate: 1.5, basis: "관사·전치사·굴절로 길어지는 경향" },
  th: { rate: 1.15, basis: "띄어쓰기 없이 이어 쓰지만 음절이 늘어나는 경향" },
  id: { rate: 1.35, basis: "접사·전치사가 더해져 길어지는 경향" },
  fr: { rate: 1.55, basis: "관사·전치사·굴절로 길어지는 경향" },
};

/** 프리셋·기본표에 없는 자유 입력 로케일의 폴백 팽창률 — 모르면 길어지는 쪽으로 잡는다. */
export const DIALOGUE_EXPANSION_FALLBACK_RATE = 1.3;

/** 실측 보정을 채택하는 최소 표본 수(원문↔번역 쌍). 미만이면 기본 상수를 유지한다. */
export const EXPANSION_CALIBRATION_MIN_SAMPLES = 5;

/** 보정 표본으로 인정하는 최소 원문 유효 길이 — 짧은 감탄사는 비율 노이즈가 커서 제외한다. */
export const EXPANSION_CALIBRATION_MIN_SOURCE_LENGTH = 8;

/** 실측 팽창률 클램프 — 극단 표본(오역·부분 번역)이 예산을 망가뜨리지 않게. */
export const EXPANSION_RATE_MIN = 0.4;
export const EXPANSION_RATE_MAX = 3.5;

// ── 길이 측정 ───────────────────────────────────────────────────────────────

/**
 * 대사의 유효 길이 — 공백 런(줄바꿈 포함)을 한 칸으로 접고 양끝을 다듬은 뒤
 * 코드 포인트 수로 센다. 원문과 번역문에 **같은 자**를 대야 비율이 의미를
 * 가지므로, 보정(calibrate)과 예상(estimate)이 반드시 이 함수를 공유한다.
 * (서로게이트 쌍을 한 글자로 세는 Array.from 기준 — 이모지·확장 한자 포함.)
 */
export function measureDialogueLength(text: string): number {
  const normalized = text.replace(/\s+/g, " ").trim();
  return normalized ? Array.from(normalized).length : 0;
}

/** 원문 길이에 팽창률을 적용한 예상 번역문 길이(자). 빈 원문은 0. */
export function estimateDialogueLength(sourceLength: number, rate: number): number {
  if (!Number.isFinite(sourceLength) || sourceLength <= 0) return 0;
  if (!Number.isFinite(rate) || rate <= 0) return sourceLength;
  return Math.max(1, Math.round(sourceLength * rate));
}

/** 팽창률 표시 — 1.35 → "×1.35", 0.8 → "×0.8". */
export function formatExpansionRate(rate: number): string {
  const rounded = Math.round(rate * 100) / 100;
  return `×${rounded}`;
}

/** 팽창률 증감 표시 — 1.35 → "+35%", 0.8 → "-20%", 1 → "±0%". */
export function formatExpansionPercent(rate: number): string {
  const pct = Math.round((rate - 1) * 100);
  if (pct > 0) return `+${pct}%`;
  if (pct < 0) return `${pct}%`;
  return "±0%";
}

// ── 작품별 보정(실측 팽창률) ────────────────────────────────────────────────

export type ExpansionRateSource = "measured" | "default";

export interface LocaleExpansionProfile {
  readonly locale: string;
  readonly label: string;
  /** 기본 상수(자유 입력 로케일은 폴백값). */
  readonly defaultRate: number;
  /** 작품 실측 중앙값. 표본이 하나라도 있으면 값, 없으면 null. 채택 여부와 무관하게 참고로 노출한다. */
  readonly measuredRate: number | null;
  /** 보정에 쓴 원문↔번역 쌍 수(최소 원문 길이 이상만). */
  readonly sampleCount: number;
  /** 실제 예산에 쓰는 비율 — 표본이 기준 이상이면 실측, 아니면 기본 상수. */
  readonly effectiveRate: number;
  readonly rateSource: ExpansionRateSource;
}

function median(values: readonly number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function clampRate(rate: number): number {
  return Math.min(EXPANSION_RATE_MAX, Math.max(EXPANSION_RATE_MIN, rate));
}

function defaultRateFor(locale: string): number {
  return DIALOGUE_EXPANSION_DEFAULTS[locale]?.rate ?? DIALOGUE_EXPANSION_FALLBACK_RATE;
}

/** 대상 로케일 결정 — 미지정 시 번역 프리셋 전체. SOURCE_LOCALE·중복은 제거한다. */
function resolveTargetLocales(locales?: readonly string[]): string[] {
  const source = locales ?? DIALOGUE_LOCALE_PRESETS.map((preset) => preset.code);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const code of source) {
    if (!code || code === SOURCE_LOCALE || seen.has(code)) continue;
    seen.add(code);
    out.push(code);
  }
  return out;
}

/**
 * 작품 실측 팽창률로 로케일별 프로필을 만든다.
 *
 * 표본은 dialogueI18n에 원문 스냅샷(SOURCE_LOCALE)과 해당 로케일 번역이
 * **둘 다** 있는 대사뿐이다 — 원문이 없는 쌍은 비율을 만들 수 없고,
 * el.text로 대신하면 "지금 보이는 언어"를 원문으로 오인할 수 있다
 * (studio-dialogue-review의 원문 정직성 규칙과 동일). 비율은 쌍별
 * (번역 유효 길이 ÷ 원문 유효 길이)의 중앙값 — 긴 대사 한 건이 평균을
 * 끌고 가지 않게 한다.
 */
export function calibrateDialogueExpansion(
  pages: readonly LengthBudgetPageLike[],
  options: { locales?: readonly string[]; minSamples?: number } = {}
): LocaleExpansionProfile[] {
  const locales = resolveTargetLocales(options.locales);
  const minSamples = Math.max(1, options.minSamples ?? EXPANSION_CALIBRATION_MIN_SAMPLES);
  const ratiosByLocale = new Map<string, number[]>(locales.map((code) => [code, []]));

  for (const page of pages) {
    const map = page.dialogueI18n;
    if (!map) continue;
    for (const entry of Object.values(map)) {
      const sourceText = entry[SOURCE_LOCALE];
      if (typeof sourceText !== "string") continue;
      const sourceLength = measureDialogueLength(sourceText);
      if (sourceLength < EXPANSION_CALIBRATION_MIN_SOURCE_LENGTH) continue;
      for (const code of locales) {
        const translated = entry[code];
        if (typeof translated !== "string") continue;
        const translatedLength = measureDialogueLength(translated);
        if (translatedLength <= 0) continue;
        ratiosByLocale.get(code)!.push(translatedLength / sourceLength);
      }
    }
  }

  return locales.map((code) => {
    const ratios = ratiosByLocale.get(code) ?? [];
    const measuredRaw = median(ratios);
    const measuredRate = measuredRaw == null ? null : clampRate(measuredRaw);
    const defaultRate = defaultRateFor(code);
    const useMeasured = measuredRate != null && ratios.length >= minSamples;
    return {
      locale: code,
      label: localeLabel(code),
      defaultRate,
      measuredRate,
      sampleCount: ratios.length,
      effectiveRate: useMeasured ? measuredRate : defaultRate,
      rateSource: useMeasured ? ("measured" as const) : ("default" as const),
    };
  });
}

// ── 예산 미리보기 ───────────────────────────────────────────────────────────

export interface DialogueLengthEstimate {
  readonly locale: string;
  readonly label: string;
  /** 예상 번역문 유효 길이(자). */
  readonly expectedLength: number;
  readonly rate: number;
  readonly rateSource: ExpansionRateSource;
}

export interface LengthBudgetItem {
  readonly id: string;
  /** 요소 id(DialogueBatchItem.id와 같은 공간). */
  readonly itemId: string;
  readonly pageId: string;
  /** 0 기준 페이지 순번(표시할 땐 +1). */
  readonly pageIndex: number;
  readonly elType: "bubble" | "text";
  /** 대사 한 줄 미리보기(목록 행 식별용). */
  readonly excerpt: string;
  /** 원문으로 확정한 텍스트(스냅샷 우선, 없으면 번역이 없는 요소의 el.text). */
  readonly sourceText: string;
  readonly sourceLength: number;
  readonly estimates: readonly DialogueLengthEstimate[];
}

export type LengthBudgetWarningKind =
  /** 예상 번역문이 지금 말풍선 높이에 들어가지 않을 것으로 예상됨. */
  | "overflow"
  /** 들어가긴 하지만 자동 축소로 글자가 눈에 띄게 작아질 것으로 예상됨. */
  | "shrink";

export interface LengthBudgetWarning {
  readonly id: string;
  readonly itemId: string;
  readonly pageId: string;
  readonly pageIndex: number;
  readonly kind: LengthBudgetWarningKind;
  readonly severity: "warning" | "info";
  readonly locale: string;
  readonly label: string;
  /** 사용자에게 보여 줄 한 줄 설명 — 전부 "예상" 어조. */
  readonly message: string;
  readonly excerpt: string;
  readonly sourceLength: number;
  readonly expectedLength: number;
  readonly rate: number;
  readonly rateSource: ExpansionRateSource;
  /** 실효 폰트 크기(px). */
  readonly fontSize: number;
  readonly boxHeight: number;
  /** 예상 번역문이 다 들어가려면 필요한 말풍선 전체 높이(px). overflow에서만. */
  readonly predictedHeight?: number;
  /** 부족한 높이(px, 양수). overflow에서만. */
  readonly overflowPx?: number;
  /** 자동 축소로 실제로 들어가게 될 폰트 크기(px). shrink에서만. */
  readonly fittedFontSize?: number;
}

export interface LocaleBudgetTotal {
  readonly locale: string;
  readonly label: string;
  readonly rate: number;
  readonly rateSource: ExpansionRateSource;
  readonly sampleCount: number;
  /** 회차 전체 원문 유효 길이 합(자). */
  readonly sourceTotalLength: number;
  /** 회차 전체 예상 번역문 길이 합(자) — 대사별 예상의 합(반올림 위치를 표시값과 일치시킨다). */
  readonly expectedTotalLength: number;
  /** 이 로케일에서 위험(overflow+shrink) 판정을 받은 말풍선 수. */
  readonly atRiskCount: number;
}

/** QC 합류형 요약 — L-2 핏 경고 summary와 같은 결(건수 중심). */
export interface DialogueLengthBudgetSummary {
  /** 예산 대상 대사 수(숨김 제외·원문 확정 가능 기준). */
  readonly totalItemCount: number;
  readonly bubbleCount: number;
  readonly textCount: number;
  /** 핏 위험까지 실제로 계산한 말풍선 수(기하 있음·가로쓰기·비어 있지 않음). */
  readonly checkedBubbleCount: number;
  /** 크기 정보가 없어 핏 위험을 계산하지 못한 말풍선 수. */
  readonly unmeasurableCount: number;
  /** 세로쓰기라 핏 위험 판정에서 제외한 말풍선 수(예상 길이는 제공). */
  readonly verticalCount: number;
  /** 원문을 단정할 수 없어 예산에서 제외한 대사 수. */
  readonly sourceUncertainCount: number;
  readonly overflowCount: number;
  readonly shrinkCount: number;
  /** overflow + shrink (로케일 중복 포함 건수). */
  readonly warningCount: number;
  /** 위험 판정을 하나라도 받은 말풍선 수(로케일 중복 제거). */
  readonly atRiskItemCount: number;
  /** 위험이 하나라도 있는 페이지 수. */
  readonly affectedPageCount: number;
}

export interface DialogueLengthBudgetResult {
  readonly profiles: readonly LocaleExpansionProfile[];
  readonly items: readonly LengthBudgetItem[];
  readonly warnings: readonly LengthBudgetWarning[];
  readonly totals: readonly LocaleBudgetTotal[];
  readonly summary: DialogueLengthBudgetSummary;
}

export interface DialogueLengthBudgetOptions {
  /** 대상 로케일(미지정 시 번역 프리셋 전체). */
  readonly locales?: readonly string[];
  /** 텍스트 폭 측정기. 미지정 시 실제 캔버스 측정기(핏 엔진 기본값과 동일). */
  readonly measurer?: BubbleTextMeasurer;
  /** 숨김 대사도 포함(기본 false). */
  readonly includeHidden?: boolean;
  /** 작품 테마 — 행간·자간 기본값 결정. 모르면 undefined(보수적 폴백, L-2와 동일). */
  readonly theme?: BubbleWebtoonTheme;
  /** 실측 보정 채택 최소 표본 수(기본 EXPANSION_CALIBRATION_MIN_SAMPLES). */
  readonly minSamples?: number;
}

/** 측정기에 팽창률을 배율로 얹는다 — "rate배 긴 번역문"을 "rate배 넓게 재는 원문"으로 근사한다. */
function scaleMeasurer(measurer: BubbleTextMeasurer, rate: number): BubbleTextMeasurer {
  if (rate === 1) return measurer;
  return {
    measureWidth(text, fontPx, fontFamily, fontStyle) {
      return measurer.measureWidth(text, fontPx, fontFamily, fontStyle) * rate;
    },
  };
}

function finitePositive(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

/**
 * 원문 대사 전체에 대해 언어별 예상 길이와 말풍선 위험을 미리 계산한다.
 *
 * 반환 warnings는 페이지 순서 → 요소 순서 → 로케일 순서다. 예상 길이는
 * 기하가 없는 대사(텍스트 요소 포함)에도 전부 제공하되, 핏 위험 판정은
 * 말풍선·기하·가로쓰기가 갖춰진 경우에만 한다(정직성 규칙 참고).
 */
export function previewDialogueLengthBudget(
  pages: readonly LengthBudgetPageLike[],
  options: DialogueLengthBudgetOptions = {}
): DialogueLengthBudgetResult {
  const profiles = calibrateDialogueExpansion(pages, {
    locales: options.locales,
    minSamples: options.minSamples,
  });
  const measurer = options.measurer ?? createCanvasBubbleTextMeasurer();
  const includeHidden = options.includeHidden ?? false;

  const items: LengthBudgetItem[] = [];
  const warnings: LengthBudgetWarning[] = [];
  let bubbleCount = 0;
  let textCount = 0;
  let checkedBubbleCount = 0;
  let unmeasurableCount = 0;
  let verticalCount = 0;
  let sourceUncertainCount = 0;
  const atRiskItems = new Set<string>();
  const atRiskByLocale = new Map<string, Set<string>>();
  const affectedPages = new Set<string>();

  pages.forEach((page, pageIndex) => {
    const groups = page.groups ?? [];
    for (const el of page.elements) {
      if (!isDialogueElement(el)) continue;
      if (!includeHidden && isEffectivelyHidden(el, groups)) continue;

      // 원문 확정 — 스냅샷이 있으면 그것이 원문, 번역만 있고 스냅샷이 없으면 단정 불가.
      const entry = page.dialogueI18n?.[el.id];
      const snapshot = entry?.[SOURCE_LOCALE];
      let sourceText: string | null;
      if (typeof snapshot === "string") {
        sourceText = snapshot;
      } else if (entry && Object.keys(entry).some((key) => key !== SOURCE_LOCALE)) {
        sourceText = null;
      } else {
        sourceText = el.text;
      }
      if (sourceText == null) {
        sourceUncertainCount += 1;
        continue;
      }

      const sourceLength = measureDialogueLength(sourceText);
      const estimates: DialogueLengthEstimate[] = profiles.map((profile) => ({
        locale: profile.locale,
        label: profile.label,
        expectedLength: estimateDialogueLength(sourceLength, profile.effectiveRate),
        rate: profile.effectiveRate,
        rateSource: profile.rateSource,
      }));
      items.push({
        id: `length-budget:${el.id}`,
        itemId: el.id,
        pageId: page.id,
        pageIndex,
        elType: el.type,
        excerpt: dialogueExcerpt(sourceText),
        sourceText,
        sourceLength,
        estimates,
      });
      if (el.type === "text") {
        textCount += 1;
        continue;
      }
      bubbleCount += 1;

      // ── 말풍선 핏 위험(언어별) ──
      // isDialogueElement의 타입 가드가 핏 필드를 좁혀 버리므로 원본 참조로 읽는다(L-2와 동일).
      const source: LengthBudgetElementLike = el;
      if (source.vertical) {
        verticalCount += 1;
        continue;
      }
      const boxWidth = finitePositive(el.width);
      const boxHeight = finitePositive(el.height);
      if (boxWidth == null || boxHeight == null) {
        unmeasurableCount += 1;
        continue;
      }
      if (sourceLength === 0) continue; // 빈 대사는 번역 길이를 예상할 수 없다.
      checkedBubbleCount += 1;

      const fontSize = resolveBubbleFontSize(source.fontSize);
      const lineHeight = resolveBubbleLineHeight({
        lineHeight: source.lineHeight,
        vertical: source.vertical,
        theme: options.theme,
      });
      const fontFamily = resolveBubbleFontFamily(source.font);
      const fontStyle = resolveBubbleFontStyle(source.fontStyle);
      const letterSpacing = bubbleLetterSpacing(options.theme);
      const fitInput = {
        text: sourceText,
        boxWidth,
        boxHeight,
        fontFamily,
        fontStyle,
        lineHeight,
        vertical: source.vertical,
        letterSpacing,
      };
      const excerpt = dialogueExcerpt(sourceText);

      for (const profile of profiles) {
        const rate = profile.effectiveRate;
        const scaled = scaleMeasurer(measurer, rate);
        if (bubbleTextFitsInBox(fitInput, fontSize, scaled)) continue;
        const expectedLength = estimateDialogueLength(sourceLength, rate);
        const base: Omit<LengthBudgetWarning, "kind" | "severity" | "message"> = {
          id: `length-budget:${el.id}:${profile.locale}`,
          itemId: el.id,
          pageId: page.id,
          pageIndex,
          locale: profile.locale,
          label: profile.label,
          excerpt,
          sourceLength,
          expectedLength,
          rate,
          rateSource: profile.rateSource,
          fontSize,
          boxHeight,
        };

        if (source.autoShrinkText) {
          const fit = fitBubbleFontSize(
            { ...fitInput, maxFontSize: fontSize, minFontSize: source.autoShrinkMinFontSize },
            scaled
          );
          if (!fit.overflow) {
            warnings.push({
              ...base,
              kind: "shrink",
              severity: "info",
              fittedFontSize: fit.fontSize,
              message: `${profile.label} 예상 약 ${expectedLength}자(원문 ${sourceLength}자) — 자동 축소로 글자가 ${fit.fontSize}px까지 줄어들 것으로 보여요.`,
            });
          } else {
            warnings.push({
              ...base,
              kind: "overflow",
              severity: "warning",
              fittedFontSize: fit.fontSize,
              message: `${profile.label} 예상 약 ${expectedLength}자(원문 ${sourceLength}자) — 자동 축소 하한(${fit.fontSize}px)에서도 다 들어가지 않을 것으로 보여요.`,
            });
          }
        } else {
          const predictedHeight = fitBubbleBoxHeightToText(
            {
              text: sourceText,
              boxWidth,
              fontSize,
              fontFamily,
              fontStyle,
              lineHeight,
              letterSpacing,
              vertical: source.vertical,
              minHeight: boxHeight,
            },
            scaled
          );
          const overflowPx = Math.max(1, Math.ceil(predictedHeight - boxHeight));
          warnings.push({
            ...base,
            kind: "overflow",
            severity: "warning",
            predictedHeight,
            overflowPx,
            message: `${profile.label} 예상 약 ${expectedLength}자(원문 ${sourceLength}자, ${formatExpansionRate(rate)}) — 지금 말풍선 높이로는 약 ${overflowPx}px 부족할 것으로 보여요.`,
          });
        }
        atRiskItems.add(el.id);
        affectedPages.add(page.id);
        let localeSet = atRiskByLocale.get(profile.locale);
        if (!localeSet) {
          localeSet = new Set();
          atRiskByLocale.set(profile.locale, localeSet);
        }
        localeSet.add(el.id);
      }
    }
  });

  const sourceTotalLength = items.reduce((sum, item) => sum + item.sourceLength, 0);
  const totals: LocaleBudgetTotal[] = profiles.map((profile) => ({
    locale: profile.locale,
    label: profile.label,
    rate: profile.effectiveRate,
    rateSource: profile.rateSource,
    sampleCount: profile.sampleCount,
    sourceTotalLength,
    expectedTotalLength: items.reduce(
      (sum, item) =>
        sum +
        (item.estimates.find((estimate) => estimate.locale === profile.locale)?.expectedLength ??
          0),
      0
    ),
    atRiskCount: atRiskByLocale.get(profile.locale)?.size ?? 0,
  }));

  const overflowCount = warnings.filter((warning) => warning.kind === "overflow").length;
  const shrinkCount = warnings.filter((warning) => warning.kind === "shrink").length;

  return {
    profiles,
    items,
    warnings,
    totals,
    summary: {
      totalItemCount: items.length,
      bubbleCount,
      textCount,
      checkedBubbleCount,
      unmeasurableCount,
      verticalCount,
      sourceUncertainCount,
      overflowCount,
      shrinkCount,
      warningCount: warnings.length,
      atRiskItemCount: atRiskItems.size,
      affectedPageCount: affectedPages.size,
    },
  };
}

/** 경고를 페이지 순서대로 묶는다 — 패널 목록 표시용(입력 순서를 그대로 보존, L-2와 동일). */
export function groupLengthBudgetWarnings(
  warnings: readonly LengthBudgetWarning[]
): { pageId: string; pageIndex: number; warnings: LengthBudgetWarning[] }[] {
  const groups: { pageId: string; pageIndex: number; warnings: LengthBudgetWarning[] }[] = [];
  for (const warning of warnings) {
    const last = groups[groups.length - 1];
    if (last && last.pageId === warning.pageId) {
      last.warnings.push(warning);
    } else {
      groups.push({ pageId: warning.pageId, pageIndex: warning.pageIndex, warnings: [warning] });
    }
  }
  return groups;
}
