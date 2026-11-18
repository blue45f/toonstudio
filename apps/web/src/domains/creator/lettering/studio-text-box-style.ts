/**
 * CSP 텍스트 배경 상자(TextBackgroundEnabled/Color/Alpha), 장평·자폭 비율(TextHorizontalRatio/TextVerticalRatio),
 * 및 원고 전체 대사 검색·치환(searchAndReplaceStoryDialogues) 엔진.
 *
 * 역공학 근거(REA evidence_id):
 * - ev_ddb41ced2767b5780b22fb835ba93870d61c17a55583bf40f277aef4d9b6ef68
 * - ev_4571415adae1548e2078cdaf17fdc17fc7b43d1c9bdbbb5a58461c885bbdd64d
 *
 * 클린룸 구현 원칙:
 * - 자폭(가로 비율, TextHorizontalRatio) 및 장평(세로 비율, TextVerticalRatio)을 50%~200% 범위로 정규화한다.
 * - 텍스트 배경 상자 색상·알파(0..1)·여백을 계산해 비파괴 배경 사각형 기술자를 반환한다.
 * - 대사 일괄 검색·치환은 일반 문자열/정규식, 대소문자 구분, 유니코드 온전한 단어 일치,
 *   화자·페이지 필터를 지원하며 잘못된 정규식이나 0길이 무한 루프 패턴을 예외 없이 안전하게 차단한다.
 */

import type { BubbleEl, El, StudioDialogueRangeFormat, StudioDialogueRubySpan, TextEl } from "../studio-element-model";

export interface StudioTextBoxStyle {
  /** CSP TextBackgroundEnabled — 글자 뒤 불투명/반투명 배경 상자 표시 여부. */
  readonly textBackgroundEnabled: boolean;
  /** CSP TextBackgroundColor — #RRGGBB 형식 배경 상자 색상. */
  readonly textBackgroundColor: string;
  /** CSP TextBackgroundAlpha — 배경 상자 불투명도(0..1). */
  readonly textBackgroundAlpha: number;
  /** 배경 상자 안쪽 여백(px, 0..48, 기본 6). */
  readonly textBackgroundPaddingPx: number;
  /** CSP TextHorizontalRatio — 자폭(가로 스케일 백분율, 50..200, 기본 100). */
  readonly textHorizontalRatio: number;
  /** CSP TextVerticalRatio — 장평(세로 스케일 백분율, 50..200, 기본 100). */
  readonly textVerticalRatio: number;
}

export const STUDIO_TEXT_SCALE_RATIO_RANGE = Object.freeze({
  min: 50,
  max: 200,
  step: 5,
});

export const DEFAULT_STUDIO_TEXT_BOX_STYLE: StudioTextBoxStyle = Object.freeze({
  textBackgroundEnabled: false,
  textBackgroundColor: "#ffffff",
  textBackgroundAlpha: 0.85,
  textBackgroundPaddingPx: 6,
  textHorizontalRatio: 100,
  textVerticalRatio: 100,
});

export interface StudioTextBoxBackgroundRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fillRgba: string;
  readonly hexColor: string;
  readonly alpha: number;
}

export interface StoryDialogueElementMeta {
  readonly speaker?: string;
}

export type StoryDialogueElement = (TextEl | BubbleEl) & StoryDialogueElementMeta;

export interface StoryDialoguePageInput {
  readonly pageId: string;
  readonly pageNumber?: number;
  readonly elements: readonly El[];
}

export interface StoryDialogueSearchReplaceOptions {
  readonly search: string;
  readonly replace: string;
  readonly mode?: "plain" | "regex";
  readonly matchCase?: boolean;
  readonly wholeWord?: boolean;
  /** 화자 이름 필터(부분 일치 또는 정확 일치, 대소문자 무시). */
  readonly speakerFilter?: string;
  /** 대상 페이지 ID 화이트리스트(미지정 시 전체 페이지 대상). */
  readonly pageIds?: readonly string[];
  /** true면 실제 텍스트를 바꾸지 않고 일치 내역만 미리보기로 반환한다. */
  readonly dryRun?: boolean;
}

export interface StoryDialogueMatchRecord {
  readonly pageId: string;
  readonly elementId: string;
  readonly elementType: "text" | "bubble";
  readonly speaker?: string;
  readonly matchCount: number;
  readonly beforeText: string;
  readonly afterText: string;
}

export interface StoryDialogueSearchReplaceResult<
  TPage extends StoryDialoguePageInput = StoryDialoguePageInput,
> {
  readonly ok: boolean;
  readonly errorMessage: string | null;
  readonly totalMatches: number;
  readonly affectedElementCount: number;
  readonly matches: readonly StoryDialogueMatchRecord[];
  readonly pages: readonly TPage[];
}

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function normalizeHexColor(raw: unknown, fallback = "#ffffff"): string {
  if (typeof raw !== "string") return fallback;
  const trimmed = raw.trim();
  if (/^#[0-9a-fA-F]{6}$/u.test(trimmed)) return trimmed.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/u.test(trimmed)) {
    const r = trimmed[1]!;
    const g = trimmed[2]!;
    const b = trimmed[3]!;
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase();
  }
  return fallback;
}

export function hexColorWithAlphaToRgba(hex: string, alpha: number): string {
  const clean = normalizeHexColor(hex, "#ffffff").slice(1);
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  const a = Math.round(clamp(alpha, 0, 1) * 1000) / 1000;
  return `rgba(${r}, ${g}, ${b}, ${a})`;
}

/** 외부 저장 문서·미설정 필드를 안전한 StudioTextBoxStyle로 정규화한다. */
export function normalizeStudioTextBoxStyle(raw: unknown): StudioTextBoxStyle {
  if (!raw || typeof raw !== "object") {
    return { ...DEFAULT_STUDIO_TEXT_BOX_STYLE };
  }
  const src = raw as Record<string, unknown>;
  const ratioMin = STUDIO_TEXT_SCALE_RATIO_RANGE.min;
  const ratioMax = STUDIO_TEXT_SCALE_RATIO_RANGE.max;

  const hRatio =
    typeof src.textHorizontalRatio === "number"
      ? clamp(Math.round(src.textHorizontalRatio), ratioMin, ratioMax)
      : DEFAULT_STUDIO_TEXT_BOX_STYLE.textHorizontalRatio;
  const vRatio =
    typeof src.textVerticalRatio === "number"
      ? clamp(Math.round(src.textVerticalRatio), ratioMin, ratioMax)
      : DEFAULT_STUDIO_TEXT_BOX_STYLE.textVerticalRatio;
  const alpha =
    typeof src.textBackgroundAlpha === "number"
      ? clamp(src.textBackgroundAlpha, 0, 1)
      : DEFAULT_STUDIO_TEXT_BOX_STYLE.textBackgroundAlpha;
  const pad =
    typeof src.textBackgroundPaddingPx === "number"
      ? clamp(Math.round(src.textBackgroundPaddingPx), 0, 48)
      : DEFAULT_STUDIO_TEXT_BOX_STYLE.textBackgroundPaddingPx;

  return {
    textBackgroundEnabled: src.textBackgroundEnabled === true,
    textBackgroundColor: normalizeHexColor(
      src.textBackgroundColor,
      DEFAULT_STUDIO_TEXT_BOX_STYLE.textBackgroundColor,
    ),
    textBackgroundAlpha: alpha,
    textBackgroundPaddingPx: pad,
    textHorizontalRatio: hRatio,
    textVerticalRatio: vRatio,
  };
}

/** TextEl 또는 BubbleEl에서 텍스트 박스·장평·자폭 속성을 읽는다. */
export function readStudioTextBoxStyleFromElement(element: unknown): StudioTextBoxStyle {
  return normalizeStudioTextBoxStyle(element);
}

/** patchEl에 전달할 수 있는 타입 안전한 부분 패치 객체를 만든다. */
export function toStudioTextBoxStyleElementPatch(
  elementId: string,
  patch: Partial<StudioTextBoxStyle>,
): Partial<El> {
  const carrier: Partial<TextEl> & Partial<StudioTextBoxStyle> = {
    id: elementId,
    ...patch,
  };
  return carrier;
}

/** 장평·자폭 비율로부터 2D 스케일 계수 및 CSS transform 문자열을 산출한다. */
export function computeTextScaleTransform(style: Pick<
  StudioTextBoxStyle,
  "textHorizontalRatio" | "textVerticalRatio"
>): {
  readonly scaleX: number;
  readonly scaleY: number;
  readonly cssTransform: string;
} {
  const scaleX =
    clamp(style.textHorizontalRatio, STUDIO_TEXT_SCALE_RATIO_RANGE.min, STUDIO_TEXT_SCALE_RATIO_RANGE.max) / 100;
  const scaleY =
    clamp(style.textVerticalRatio, STUDIO_TEXT_SCALE_RATIO_RANGE.min, STUDIO_TEXT_SCALE_RATIO_RANGE.max) / 100;
  return {
    scaleX,
    scaleY,
    cssTransform: scaleX === 1 && scaleY === 1 ? "none" : `scale(${scaleX}, ${scaleY})`,
  };
}

/** 텍스트 바운딩 박스와 배경 설정으로 배경 상자 사각형을 계산한다(비활성 시 null). */
export function computeTextBoxBackgroundRect(
  bounds: { readonly x: number; readonly y: number; readonly width: number; readonly height: number },
  style: StudioTextBoxStyle,
): StudioTextBoxBackgroundRect | null {
  if (!style.textBackgroundEnabled || style.textBackgroundAlpha <= 0) {
    return null;
  }
  const pad = clamp(style.textBackgroundPaddingPx, 0, 48);
  return {
    x: bounds.x - pad,
    y: bounds.y - pad,
    width: Math.max(1, bounds.width + pad * 2),
    height: Math.max(1, bounds.height + pad * 2),
    fillRgba: hexColorWithAlphaToRgba(style.textBackgroundColor, style.textBackgroundAlpha),
    hexColor: style.textBackgroundColor,
    alpha: style.textBackgroundAlpha,
  };
}

function escapeRegExpLiteral(literal: string): string {
  return literal.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function compileDialogueMatcher(options: StoryDialogueSearchReplaceOptions): {
  readonly ok: true;
  readonly regex: RegExp;
} | {
  readonly ok: false;
  readonly errorMessage: string;
} {
  if (options.search.length === 0) {
    return { ok: false, errorMessage: "검색어를 입력해 주세요." };
  }
  if (options.search.length > 512) {
    return { ok: false, errorMessage: "검색 패턴이 너무 깁니다(최대 512자)." };
  }

  const baseSource =
    options.mode === "regex" ? options.search : escapeRegExpLiteral(options.search);
  // 한글·영문·숫자 모두에서 정확히 동작하는 유니코드 단어 경계 검사.
  const wrappedSource = options.wholeWord
    ? `(?<![\\p{L}\\p{N}_])(?:${baseSource})(?![\\p{L}\\p{N}_])`
    : baseSource;
  const flags = options.matchCase ? "gu" : "giu";

  try {
    const regex = new RegExp(wrappedSource, flags);
    return { ok: true, regex };
  } catch {
    return {
      ok: false,
      errorMessage: "유효하지 않은 정규식 문법입니다. 괄호나 이스케이프 기호를 확인해 주세요.",
    };
  }
}

function remapSpanOffsetsAfterLengthChange(
  spans: readonly StudioDialogueRubySpan[] | undefined,
  newLength: number,
): readonly StudioDialogueRubySpan[] | undefined {
  if (!spans || spans.length === 0) return spans;
  return spans
    .map((span) => ({
      ...span,
      start: clamp(span.start, 0, newLength),
      end: clamp(span.end, 0, newLength),
    }))
    .filter((span) => span.end > span.start);
}

function remapRangeFormatsAfterLengthChange(
  ranges: readonly StudioDialogueRangeFormat[] | undefined,
  newLength: number,
): readonly StudioDialogueRangeFormat[] | undefined {
  if (!ranges || ranges.length === 0) return ranges;
  return ranges
    .map((range) => ({
      ...range,
      start: clamp(range.start, 0, newLength),
      end: clamp(range.end, 0, newLength),
    }))
    .filter((range) => range.end > range.start);
}

function replaceWithSafeZeroLengthGuard(
  source: string,
  regex: RegExp,
  replacement: string,
): { readonly count: number; readonly result: string } {
  regex.lastIndex = 0;
  let count = 0;
  let cursor = 0;
  let out = "";
  let match: RegExpExecArray | null;

  while ((match = regex.exec(source)) !== null) {
    // 0길이 일치(예: "^", "(?=가)")는 무한 루프를 막기 위해 빈 일치로 건너뛰고 한 코드포인트 전진한다.
    if (match[0].length === 0) {
      const step = source.codePointAt(regex.lastIndex)! > 0xffff ? 2 : 1;
      regex.lastIndex += step;
      if (regex.lastIndex > source.length) break;
      continue;
    }
    count += 1;
    out += source.slice(cursor, match.index);
    const singleRegex = new RegExp(regex.source, regex.flags.replace("g", ""));
    out += match[0].replace(singleRegex, replacement);
    cursor = match.index + match[0].length;
  }

  if (count === 0) {
    return { count: 0, result: source };
  }
  out += source.slice(cursor);
  return { count, result: out };
}

/**
 * 원고 다중 페이지의 대사(TextEl·BubbleEl)를 검색·치환한다.
 * 잘못된 정규식이 들어와도 예외를 던지지 않고 원본 페이지를 그대로 보존한 채 오류 메시지를 돌려준다.
 */
export function searchAndReplaceStoryDialogues<
  TPage extends StoryDialoguePageInput = StoryDialoguePageInput,
>(
  pages: readonly TPage[],
  options: StoryDialogueSearchReplaceOptions,
): StoryDialogueSearchReplaceResult<TPage> {
  const compiled = compileDialogueMatcher(options);
  if (!compiled.ok) {
    return {
      ok: false,
      errorMessage: compiled.errorMessage,
      totalMatches: 0,
      affectedElementCount: 0,
      matches: [],
      pages,
    };
  }

  const pageFilterSet =
    options.pageIds && options.pageIds.length > 0 ? new Set(options.pageIds) : null;
  const normalizedSpeakerFilter = options.speakerFilter?.trim().toLowerCase() ?? "";

  let totalMatches = 0;
  let affectedElementCount = 0;
  const matches: StoryDialogueMatchRecord[] = [];

  const nextPages = pages.map((page): TPage => {
    if (pageFilterSet && !pageFilterSet.has(page.pageId)) {
      return page;
    }

    let pageChanged = false;
    const nextElements = page.elements.map((el): El => {
      if (el.type !== "text" && el.type !== "bubble") return el;

      const speakerRaw = (el as StoryDialogueElement).speaker ?? el.name ?? "";
      if (
        normalizedSpeakerFilter.length > 0 &&
        !speakerRaw.toLowerCase().includes(normalizedSpeakerFilter)
      ) {
        return el;
      }

      const { count, result } = replaceWithSafeZeroLengthGuard(
        el.text,
        compiled.regex,
        options.replace,
      );
      if (count === 0) return el;

      totalMatches += count;
      affectedElementCount += 1;
      matches.push({
        pageId: page.pageId,
        elementId: el.id,
        elementType: el.type,
        ...(speakerRaw ? { speaker: speakerRaw } : {}),
        matchCount: count,
        beforeText: el.text,
        afterText: result,
      });

      if (options.dryRun) return el;

      pageChanged = true;
      return {
        ...el,
        text: result,
        ...(el.rubySpans !== undefined
          ? { rubySpans: remapSpanOffsetsAfterLengthChange(el.rubySpans, result.length) }
          : {}),
        ...(el.rangeFormats !== undefined
          ? { rangeFormats: remapRangeFormatsAfterLengthChange(el.rangeFormats, result.length) }
          : {}),
      };
    });

    if (!pageChanged || options.dryRun) return page;
    return {
      ...page,
      elements: nextElements,
    };
  });

  return {
    ok: true,
    errorMessage: null,
    totalMatches,
    affectedElementCount,
    matches,
    pages: nextPages,
  };
}
