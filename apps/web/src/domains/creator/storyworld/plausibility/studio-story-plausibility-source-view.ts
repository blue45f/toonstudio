/**
 * "원고에서 보기": 발견이 걸린 장면의 원문 보기를 만든다.
 *
 * 원고 사본이 있고 장면의 위치가 그 사본 안에 있으면 장면 원문을, 아니면 문서에 남겨 둔 짧은 발췌를
 * 보여 준다. 근거에 원고 인용이 있으면 그 단어를 강조한다. 아주 긴 장면은 강조 둘레만 잘라 보여 준다.
 * 화면 부품에서 분리한 순수 함수라서 위치 계산을 테스트할 수 있다.
 */
import type { StoryworldScene } from "../studio-storyworld-causality";
import type { PlausibilityQuote } from "./studio-story-plausibility-types";

export const PLAUSIBILITY_SOURCE_VIEW_CHARS = 6_000;
const CONTEXT_BEFORE = 600;

export interface PlausibilitySourceView {
  readonly mode: "manuscript" | "excerpt" | "none";
  readonly before: string;
  readonly highlight: string;
  readonly after: string;
  readonly truncatedStart: boolean;
  readonly truncatedEnd: boolean;
  /** 화면에 덧붙이는 안내. 없으면 null. */
  readonly note: string | null;
}

const NONE: PlausibilitySourceView = {
  mode: "none",
  before: "",
  highlight: "",
  after: "",
  truncatedStart: false,
  truncatedEnd: false,
  note: "이 장면은 원고에서 가져온 것이 아니에요. 설정에서 직접 만든 장면이라 보여 드릴 원문이 없어요.",
};

/** 인용 글에서 앞뒤 말줄임표를 뺀 둘레 글과, 그 안에서 강조할 단어를 돌려준다. */
export function splitQuote(quote: PlausibilityQuote): { readonly context: string; readonly highlighted: string; readonly offsetInContext: number } {
  const chars = Array.from(quote.text);
  const lead = chars[0] === "…" ? 1 : 0;
  const tail = chars.at(-1) === "…" && chars.length - lead > 1 ? 1 : 0;
  const contextChars = chars.slice(lead, chars.length - tail);
  const highlighted = chars.slice(quote.highlightStart, quote.highlightEnd).join("");
  const before = chars.slice(lead, Math.max(lead, quote.highlightStart)).join("");
  return { context: contextChars.join(""), highlighted, offsetInContext: before.length };
}

function locate(text: string, quote: PlausibilityQuote | undefined): { readonly start: number; readonly end: number } | null {
  if (!quote) return null;
  const { context, highlighted, offsetInContext } = splitQuote(quote);
  if (!highlighted) return null;
  const at = context ? text.indexOf(context) : -1;
  if (at >= 0) return { start: at + offsetInContext, end: at + offsetInContext + highlighted.length };
  const direct = text.indexOf(highlighted);
  return direct >= 0 ? { start: direct, end: direct + highlighted.length } : null;
}

function windowed(text: string, found: { readonly start: number; readonly end: number } | null): Omit<PlausibilitySourceView, "mode" | "note"> {
  const from = found ? Math.max(0, found.start - CONTEXT_BEFORE) : 0;
  const to = Math.min(text.length, from + PLAUSIBILITY_SOURCE_VIEW_CHARS);
  if (!found || found.end > to) {
    return { before: text.slice(from, to), highlight: "", after: "", truncatedStart: from > 0, truncatedEnd: to < text.length };
  }
  return {
    before: text.slice(from, found.start),
    highlight: text.slice(found.start, found.end),
    after: text.slice(found.end, to),
    truncatedStart: from > 0,
    truncatedEnd: to < text.length,
  };
}

export function buildPlausibilitySourceView(
  scene: StoryworldScene | undefined,
  manuscripts: ReadonlyMap<string, string>,
  quote?: PlausibilityQuote,
): PlausibilitySourceView {
  const source = scene?.source;
  if (!scene || !source) return NONE;
  const copy = source.copy !== undefined ? manuscripts.get(source.copy) : undefined;
  if (copy !== undefined && source.start !== undefined && source.end !== undefined && source.start < source.end && source.end <= copy.length) {
    const text = copy.slice(source.start, source.end);
    return { mode: "manuscript", note: null, ...windowed(text, locate(text, quote)) };
  }
  return {
    mode: "excerpt",
    note: "원고 사본을 이 기기에서 찾지 못해서 장면의 앞부분만 보여 드려요. 원고를 다시 붙여 넣으면 전체를 볼 수 있어요.",
    ...windowed(source.excerpt, locate(source.excerpt, quote)),
  };
}
