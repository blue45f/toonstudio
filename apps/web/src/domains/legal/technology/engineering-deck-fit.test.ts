import { describe, expect, it } from "vitest";

import {
  DECK_POINT_DENSE_WIDTH,
  DECK_POINT_MAX_WIDTH,
  DECK_POINT_TIGHT_WIDTH,
  clipForSlide,
  codeLineRows,
  deckDensity,
  fitCodeFontSize,
  fitTableFontSize,
  shortenDeckPath,
  splitSentences,
  tableColumnWidths,
  visualWidth,
} from "./engineering-deck-fit";

describe("화면 폭 계산", () => {
  it("한글은 영문의 두 배 폭으로 센다", () => {
    expect(visualWidth("abc")).toBe(3);
    expect(visualWidth("가나다")).toBe(6);
    expect(visualWidth("OPFS 파일")).toBe(4 + 1 + 4);
    expect(visualWidth("")).toBe(0);
  });

  it("마침표 뒤 공백에서만 문장을 나눈다", () => {
    expect(splitSentences("첫 문장입니다. 둘째 문장입니다. 끝")).toEqual(["첫 문장입니다.", "둘째 문장입니다.", "끝"]);
    expect(splitSentences("버전 3.5 를 씁니다.")).toEqual(["버전 3.5 를 씁니다."]);
    expect(splitSentences("")).toEqual([]);
  });
});

describe("슬라이드용 문단 줄이기", () => {
  it("짧은 문단은 그대로 둔다", () => {
    expect(clipForSlide("  짧은 문단입니다.  ", DECK_POINT_MAX_WIDTH)).toEqual({ text: "짧은 문단입니다.", clipped: false });
  });

  it("긴 문단은 문장 단위로 앞에서부터 담고 줄임표를 붙인다", () => {
    const text = `${"가".repeat(60)}다. ${"나".repeat(60)}다. ${"다".repeat(60)}다.`;
    const clipped = clipForSlide(text, 260);
    expect(clipped.clipped).toBe(true);
    expect(clipped.text.endsWith(" …")).toBe(true);
    expect(visualWidth(clipped.text)).toBeLessThanOrEqual(260);
    expect(clipped.text.startsWith("가")).toBe(true);
  });

  it("첫 문장부터 넘치면 글자 단위로 자른다", () => {
    const clipped = clipForSlide("가".repeat(400), 100);
    expect(clipped.clipped).toBe(true);
    expect(clipped.text.endsWith("…")).toBe(true);
    expect(visualWidth(clipped.text)).toBeLessThanOrEqual(100);
  });
});

describe("글자 크기 단계", () => {
  it("가장 긴 문단의 폭으로 단계를 고른다", () => {
    expect(deckDensity([40, 80, 120])).toBe("normal");
    expect(deckDensity([40, DECK_POINT_DENSE_WIDTH + 1])).toBe("dense");
    expect(deckDensity([DECK_POINT_TIGHT_WIDTH + 1])).toBe("tight");
    expect(deckDensity([])).toBe("normal");
  });
});

describe("코드 글자 크기", () => {
  const box = { width: 56, height: 30 };

  it("짧은 코드는 가장 큰 크기(1.7cqw)를 쓴다", () => {
    expect(fitCodeFontSize("const a = 1;\nconst b = 2;", box)).toBe(1.7);
  });

  it("줄바꿈 없이 들어가는 크기를 먼저 고른다(코드는 줄바꿈되면 읽기 어렵다)", () => {
    const line = `const handle = await root.getFileHandle('layer-1.bin', { create: true });`;
    const size = fitCodeFontSize(line, box);
    const columns = Math.floor((box.width - 2.6) / (size * 0.6));
    expect(visualWidth(line)).toBeLessThanOrEqual(columns);
    expect(size).toBeLessThan(1.7);
  });

  it("줄 수가 많을수록 작아지고 최소 크기 아래로는 내려가지 않는다", () => {
    const lines = (count: number): string => Array.from({ length: count }, (_, index) => `const value${index} = ${index};`).join("\n");
    const small = fitCodeFontSize(lines(14), box);
    const smaller = fitCodeFontSize(lines(26), box);
    expect(small).toBeLessThanOrEqual(1.7);
    expect(smaller).toBeLessThan(small);
    expect(fitCodeFontSize(lines(500), box)).toBe(0.76);
  });

  it("긴 줄 하나 때문에 코드 전체가 너무 작아지지는 않는다", () => {
    // 18줄 중 한 줄만 아주 길다. 그 줄이 안 접히게 전체를 줄이면(0.8대) 읽기 어려우므로 그 줄만 접고 더 큰 크기를 쓴다.
    const body = Array.from({ length: 17 }, (_, index) => `const value${index} = ${index};`);
    const code = [...body, `const long = "${"x".repeat(110)}";`].join("\n");
    const size = fitCodeFontSize(code, { width: 56.5, height: 39.5 });
    expect(size).toBeGreaterThanOrEqual(1);
  });

  it("줄바꿈된 줄은 단어 경계에서 끊기는 손실까지 센다", () => {
    expect(codeLineRows("aaaa bbbb", 9)).toBe(1);
    // 폭의 합은 17이라 두 줄이면 충분해 보이지만, 낱말이 중간에서 끊기지 않으므로 세 번째 낱말이 다음 줄로 밀린다.
    expect(codeLineRows("aaaaaaaa bbbbbbbb cccccccc", 10)).toBe(3);
    expect(Math.ceil(visualWidth("aaaaaaaa bbbbbbbb cccccccc") / 10)).toBe(3);
    expect(codeLineRows("aaaaaa bbbbbb cccccc", 13)).toBe(2);
    // 줄보다 긴 낱말은 낱말 중간에서 끊는다.
    expect(codeLineRows("x".repeat(25), 10)).toBe(3);
    // 줄 끝 공백은 폭에 넣지 않는다.
    expect(codeLineRows(`${"a".repeat(8)}      `, 10)).toBe(1);
    // 한글은 두 칸으로 센다.
    expect(codeLineRows("가나다 라마바 사아자", 10)).toBe(3);
    expect(codeLineRows("가나다 라마바 사아자", 14)).toBe(2);
  });

  it("긴 줄은 줄바꿈 줄 수로 센다", () => {
    const longLine = `const text = "${"x".repeat(160)}";`;
    expect(fitCodeFontSize(longLine, { width: 40, height: 6 })).toBeLessThan(1.7);
  });
});

describe("표 글자 크기", () => {
  const table = (rows: number, cell: string) => ({
    columns: ["이름", "무료 한도", "쓰는 곳", "상태"],
    rows: Array.from({ length: rows }, () => [cell, cell, cell, cell]),
  });
  const box = { width: 93, height: 28 };

  it("열 폭은 내용 길이에 비례하고 합이 전체 폭이다", () => {
    const widths = tableColumnWidths(
      { columns: ["a", "b"], rows: [["x", "가".repeat(20)]] },
      100,
    );
    expect(widths).toHaveLength(2);
    expect(widths.reduce((sum, width) => sum + width, 0)).toBeCloseTo(100, 5);
    expect(widths[1] ?? 0).toBeGreaterThan(widths[0] ?? 0);
  });

  it("행이 적고 짧으면 크게, 8행×4열에 문장이 길면 작게 쓴다", () => {
    const few = fitTableFontSize(table(3, "짧은 값"), box);
    const many = fitTableFontSize(table(8, "월 요청 한도 안에서 무료로 사용하고 초과하면 멈춥니다"), box);
    expect(few).toBeGreaterThan(many);
    expect(many).toBeGreaterThanOrEqual(0.9);
    expect(few).toBeLessThanOrEqual(1.7);
  });

  it("8행×4열의 짧은 값은 읽히는 크기(1.2cqw 이상)를 유지한다", () => {
    expect(fitTableFontSize(table(8, "무료 5GB"), box)).toBeGreaterThanOrEqual(1.2);
  });
});

describe("경로 줄이기", () => {
  it("짧은 경로는 그대로, 긴 경로는 뒤쪽 폴더와 파일만 남긴다", () => {
    expect(shortenDeckPath("apps/web/src/a.ts")).toBe("apps/web/src/a.ts");
    const long = "apps/web/src/domains/creator/virtual-space/studio-virtual-space-proximity.ts";
    const short = shortenDeckPath(long);
    expect(short.startsWith("…/")).toBe(true);
    expect(short.endsWith("studio-virtual-space-proximity.ts")).toBe(true);
    expect(short.length).toBeLessThanOrEqual(46);
    expect(long.endsWith(short.slice(2))).toBe(true);
  });

  it("#심볼 힌트는 항상 남긴다", () => {
    const short = shortenDeckPath("apps/web/src/domains/creator/virtual-space/studio-virtual-space-proximity.ts#nextNearby");
    expect(short.endsWith("#nextNearby")).toBe(true);
    expect(short.startsWith("…/")).toBe(true);
  });
});
