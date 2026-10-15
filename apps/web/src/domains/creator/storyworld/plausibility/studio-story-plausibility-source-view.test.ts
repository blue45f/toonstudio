import { describe, expect, it } from "vitest";

import type { StoryworldScene } from "../studio-storyworld-causality";
import {
  PLAUSIBILITY_SOURCE_VIEW_CHARS,
  buildPlausibilitySourceView,
  splitQuote,
} from "./studio-story-plausibility-source-view";
import type { PlausibilityQuote } from "./studio-story-plausibility-types";

const TEXT = "처음 글입니다.\n아르카디야가 문을 열었다. 그리고 걸어 나갔다.";

function sceneWith(start: number, end: number, copy: string | undefined = "copy-1"): StoryworldScene {
  return {
    id: "s1", title: "장면", order: 10,
    source: { excerpt: TEXT.slice(start, end).slice(0, 20), boundary: "scene-number", ...(copy ? { copy } : {}), start, end },
  };
}

function quoteFor(text: string, word: string): PlausibilityQuote {
  const chars = Array.from(text);
  const at = Array.from(text.slice(0, text.indexOf(word))).length;
  const from = Math.max(0, at - 5);
  const to = Math.min(chars.length, at + Array.from(word).length + 5);
  const lead = from > 0 ? "…" : "";
  const tail = to < chars.length ? "…" : "";
  return { text: `${lead}${chars.slice(from, to).join("")}${tail}`, highlightStart: lead.length + (at - from), highlightEnd: lead.length + (at - from) + Array.from(word).length };
}

describe("인용 나누기", () => {
  it("앞뒤 말줄임표를 빼고 강조 단어의 위치를 돌려준다", () => {
    const quote = quoteFor(TEXT, "아르카디야");
    const parts = splitQuote(quote);
    expect(parts.highlighted).toBe("아르카디야");
    expect(parts.context.startsWith("…")).toBe(false);
    expect(parts.context.slice(parts.offsetInContext, parts.offsetInContext + 5)).toBe("아르카디야");
  });
});

describe("원고에서 보기", () => {
  it("원고 사본이 있으면 장면 원문을 보여 주고 인용 단어를 강조한다", () => {
    const scene = sceneWith(0, TEXT.length);
    const view = buildPlausibilitySourceView(scene, new Map([["copy-1", TEXT]]), quoteFor(TEXT, "아르카디야"));
    expect(view.mode).toBe("manuscript");
    expect(view.highlight).toBe("아르카디야");
    expect(view.before + view.highlight + view.after).toBe(TEXT);
    expect(view.note).toBeNull();
  });

  it("장면 범위만 잘라 보여 준다(다른 장면의 글은 섞지 않는다)", () => {
    const start = TEXT.indexOf("아르카디야");
    const view = buildPlausibilitySourceView(sceneWith(start, TEXT.length), new Map([["copy-1", TEXT]]));
    expect(view.before + view.highlight + view.after).toBe(TEXT.slice(start));
    expect(view.highlight).toBe("");
  });

  it("강조할 인용이 없으면 장면 글만 보여 주고 강조하지 않는다", () => {
    const view = buildPlausibilitySourceView(sceneWith(0, TEXT.length), new Map([["copy-1", TEXT]]));
    expect(view.highlight).toBe("");
    expect(view.before).toBe(TEXT);
  });

  it("사본이 없으면 문서에 남겨 둔 발췌를 보여 주고 이유를 알린다", () => {
    const scene = sceneWith(0, TEXT.length);
    const view = buildPlausibilitySourceView(scene, new Map());
    expect(view.mode).toBe("excerpt");
    expect(view.before).toBe(scene.source?.excerpt);
    expect(view.note).toContain("원고 사본을 이 기기에서 찾지 못해서");
  });

  it("위치가 사본 길이를 넘으면 발췌로 물러난다", () => {
    const view = buildPlausibilitySourceView(sceneWith(0, TEXT.length + 50), new Map([["copy-1", TEXT]]));
    expect(view.mode).toBe("excerpt");
  });

  it("원고에서 가져오지 않은 장면은 보여 줄 원문이 없다고 알린다", () => {
    const view = buildPlausibilitySourceView({ id: "s", title: "직접", order: 1 }, new Map());
    expect(view.mode).toBe("none");
    expect(view.note).toContain("원고에서 가져온 것이 아니에요");
    expect(buildPlausibilitySourceView(undefined, new Map()).mode).toBe("none");
  });

  it("아주 긴 장면은 강조 둘레만 잘라 보여 준다", () => {
    const filler = "가나다라마바사 ".repeat(5_000);
    const text = `${filler}아르카디야가 걸었다.${filler}`;
    const view = buildPlausibilitySourceView(sceneWith(0, text.length), new Map([["copy-1", text]]), quoteFor(text, "아르카디야"));
    expect(view.highlight).toBe("아르카디야");
    expect(view.truncatedStart).toBe(true);
    expect(view.truncatedEnd).toBe(true);
    expect(view.before.length + view.highlight.length + view.after.length).toBeLessThanOrEqual(PLAUSIBILITY_SOURCE_VIEW_CHARS);
  });

  it("앞부분만 보여 줄 때도 길이 상한을 지킨다", () => {
    const text = "가".repeat(PLAUSIBILITY_SOURCE_VIEW_CHARS * 3);
    const view = buildPlausibilitySourceView(sceneWith(0, text.length), new Map([["copy-1", text]]));
    expect(view.before).toHaveLength(PLAUSIBILITY_SOURCE_VIEW_CHARS);
    expect(view.truncatedEnd).toBe(true);
    expect(view.truncatedStart).toBe(false);
  });
});
