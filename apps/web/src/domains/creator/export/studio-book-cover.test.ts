import { afterEach, describe, expect, it, vi } from "vitest";

import {
  BOOK_COVER_PAPER,
  balanceBookCoverLines,
  computeBookCoverGeometry,
  drawBookCover,
  loadBookCoverFonts,
  wrapBookCoverText,
  type BookCoverCanvasContext,
} from "./studio-book-cover";
import { bookPagePixelSize, findBookTrimPreset } from "./studio-book-layout-model";

function a5Spec() {
  const preset = findBookTrimPreset("a5");
  if (!preset) throw new Error("a5 preset missing");
  return preset.spec;
}

interface DrawnText {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly fontPx: number;
  readonly width: number;
  readonly align: string;
}

/** 호출을 기록하는 가짜 2D 컨텍스트. 글자 폭은 글자 수 × 글자 크기 × 0.9로 둔다. */
class RecordingContext implements BookCoverCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern = "#000000";
  strokeStyle: string | CanvasGradient | CanvasPattern = "#000000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly fillRects: { x: number; y: number; width: number; height: number; style: unknown }[] = [];
  readonly texts: DrawnText[] = [];
  readonly strokes: { from: [number, number]; to: [number, number]; style: unknown }[] = [];
  private path: [number, number][] = [];

  private fontPx(): number {
    return Number(/(\d+(?:\.\d+)?)px/u.exec(this.font)?.[1] ?? "10");
  }

  fillRect(x: number, y: number, width: number, height: number): void {
    this.fillRects.push({ x, y, width, height, style: this.fillStyle });
  }

  beginPath(): void {
    this.path = [];
  }

  moveTo(x: number, y: number): void {
    this.path.push([x, y]);
  }

  lineTo(x: number, y: number): void {
    this.path.push([x, y]);
  }

  stroke(): void {
    const [from, to] = this.path;
    if (from && to) this.strokes.push({ from, to, style: this.strokeStyle });
  }

  measureText(text: string): { readonly width: number } {
    return { width: Array.from(text).length * this.fontPx() * 0.9 };
  }

  fillText(text: string, x: number, y: number): void {
    this.texts.push({
      text, x, y, fontPx: this.fontPx(), width: this.measureText(text).width, align: this.textAlign,
    });
  }
}

describe("wrapBookCoverText", () => {
  const measure = (value: string) => Array.from(value).length * 10;

  it("낱말 단위로 줄을 바꾼다", () => {
    expect(wrapBookCoverText("내 이야기 한 장면", 60, measure)).toEqual(["내 이야기", "한 장면"]);
    // 한 줄에 다 들어가면 줄을 나누지 않는다.
    expect(wrapBookCoverText("내 이야기 한 장면", 100, measure)).toEqual(["내 이야기 한 장면"]);
  });

  it("한 낱말이 한 줄보다 길면 글자 단위로 나누고 글자를 하나도 잃지 않는다", () => {
    const lines = wrapBookCoverText("가나다라마바사아", 30, measure);
    expect(lines).toEqual(["가나다", "라마바", "사아"]);
    expect(lines.join("")).toBe("가나다라마바사아");
  });

  it("빈 문자열은 줄이 없다", () => {
    expect(wrapBookCoverText("   ", 100, measure)).toEqual([]);
  });
});

describe("balanceBookCoverLines", () => {
  const measure = (value: string) => Array.from(value).length * 10;

  it("줄 수는 그대로 두고 마지막 줄에 낱말 하나만 남는 모양을 피한다", () => {
    // 넉넉한 폭에서는 ["내 이야기 한", "장면"]으로 갈라지지만, 같은 두 줄 안에서 고르게 맞춘다.
    expect(wrapBookCoverText("내 이야기 한 장면", 90, measure)).toEqual(["내 이야기 한", "장면"]);
    expect(balanceBookCoverLines("내 이야기 한 장면", 90, measure)).toEqual(["내 이야기", "한 장면"]);
  });

  it("한 줄이면 그대로 두고, 빈 문자열은 줄이 없으며, 글자를 잃지 않는다", () => {
    expect(balanceBookCoverLines("내 이야기", 90, measure)).toEqual(["내 이야기"]);
    expect(balanceBookCoverLines("  ", 90, measure)).toEqual([]);
    const text = "여름방학 외갓집 마당 수박 이야기 그리고 그 뒤";
    const lines = balanceBookCoverLines(text, 100, measure);
    expect(lines.join(" ")).toBe(text);
    expect(lines.length).toBe(wrapBookCoverText(text, 100, measure).length);
    expect(lines.every((line) => measure(line) <= 100)).toBe(true);
  });
});

describe("computeBookCoverGeometry", () => {
  it("도련을 포함한 판형 픽셀 크기와, 도련·안전 여백을 뺀 안전 영역을 돌려준다", () => {
    const spec = a5Spec();
    const geometry = computeBookCoverGeometry(spec, 300);
    const size = bookPagePixelSize(spec, 300);
    expect(geometry.widthPx).toBe(size.width);
    expect(geometry.heightPx).toBe(size.height);
    const mm = 300 / 25.4;
    // 표지는 단면이라 제본 여백이 없다 — 좌우 안전 여백이 같다.
    expect(geometry.safe.left).toBeCloseTo((spec.bleedMm + spec.safeMarginMm) * mm, 3);
    expect(size.width - geometry.safe.right).toBeCloseTo((spec.bleedMm + spec.safeMarginMm) * mm, 3);
    expect(geometry.safe.top).toBeCloseTo((spec.bleedMm + spec.safeMarginMm) * mm, 3);
  });
});

describe("drawBookCover", () => {
  const spec = a5Spec();
  const geometry = computeBookCoverGeometry(spec, 150);

  function insideSafe(entry: DrawnText): boolean {
    const half = entry.width / 2;
    return entry.align === "center"
      && entry.x - half >= geometry.safe.left - 0.5
      && entry.x + half <= geometry.safe.right + 0.5
      && entry.y >= geometry.safe.top - 0.5
      && entry.y <= geometry.safe.bottom + 0.5;
  }

  it("도련 끝까지 종이색 배경을 깔고, 제목·포인트 선·지은이를 안전 영역 안에 그린다", () => {
    const ctx = new RecordingContext();
    const layout = drawBookCover(ctx, geometry, { title: "내 이야기", author: "홍길동" });
    expect(ctx.fillRects[0]).toMatchObject({ x: 0, y: 0, width: geometry.widthPx, height: geometry.heightPx, style: BOOK_COVER_PAPER });
    expect(ctx.texts.map((entry) => entry.text)).toEqual(["내 이야기", "홍길동"]);
    expect(ctx.texts.every(insideSafe)).toBe(true);
    expect(layout.titleLines).toEqual(["내 이야기"]);
    expect(layout.authorFontPx).not.toBeNull();
    // 포인트 선 하나, 안전 영역 폭 안.
    expect(ctx.strokes).toHaveLength(1);
    const stroke = ctx.strokes[0];
    expect(stroke?.from[0]).toBeGreaterThanOrEqual(geometry.safe.left);
    expect(stroke?.to[0]).toBeLessThanOrEqual(geometry.safe.right);
    // 제목이 지은이보다 위에 있다.
    expect((ctx.texts[0]?.y ?? 0)).toBeLessThan(ctx.texts[1]?.y ?? 0);
  });

  it("한 줄에 안 들어가는 제목은 줄 길이를 고르게 나눠 마지막 줄에 낱말 하나만 남기지 않는다", () => {
    const ctx = new RecordingContext();
    const layout = drawBookCover(ctx, geometry, { title: "내 인생의 한 장면" });
    expect(layout.titleLines).toEqual(["내 인생의", "한 장면"]);
    expect(ctx.texts.map((entry) => entry.text)).toEqual(["내 인생의", "한 장면"]);
    expect(ctx.texts.every(insideSafe)).toBe(true);
  });

  it("지은이를 비우면 지은이 줄을 그리지 않는다", () => {
    const ctx = new RecordingContext();
    const layout = drawBookCover(ctx, geometry, { title: "제목", author: "  " });
    expect(ctx.texts.map((entry) => entry.text)).toEqual(["제목"]);
    expect(layout.authorFontPx).toBeNull();
  });

  it("긴 제목은 글자를 줄이고 줄을 나누어 안전 영역 안에 다 담으며 글자를 자르지 않는다", () => {
    const title = "아주 오래전 여름방학에 외갓집 마당에서 수박을 나눠 먹던 날의 이야기와 그 뒤에 남은 이야기들";
    const short = new RecordingContext();
    const shortLayout = drawBookCover(short, geometry, { title: "짧은 제목" });
    const long = new RecordingContext();
    const longLayout = drawBookCover(long, geometry, { title });
    expect(longLayout.titleFontPx).toBeLessThan(shortLayout.titleFontPx);
    expect(longLayout.titleLines.length).toBeGreaterThan(1);
    expect(long.texts.every(insideSafe)).toBe(true);
    expect(longLayout.titleLines.join(" ").replace(/\s+/gu, " ")).toBe(title);
  });

  it("긴 지은이 이름도 안전 영역을 넘지 않는다", () => {
    const ctx = new RecordingContext();
    drawBookCover(ctx, geometry, { title: "제목", author: "아주아주 긴 이름을 가진 지은이와 함께한 사람들 모두" });
    expect(ctx.texts.every(insideSafe)).toBe(true);
  });
});

describe("loadBookCoverFonts", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("브라우저 밖(문서가 없는 환경)에서는 아무것도 하지 않고 끝난다", async () => {
    await expect(loadBookCoverFonts({ title: "제목", author: "지은이" })).resolves.toBeUndefined();
  });

  it("제목·지은이 글자를 견본으로 굵은 글꼴과 보통 글꼴을 모두 불러온다", async () => {
    const load = vi.fn((_font: string, _text?: string) => Promise.resolve([]));
    vi.stubGlobal("document", { fonts: { load } });
    await loadBookCoverFonts({ title: "내 이야기", author: "홍길동" });
    expect(load).toHaveBeenCalledTimes(2);
    const calls = load.mock.calls;
    expect(calls.map(([font]) => font.split(" ")[0]).sort()).toEqual(["500", "800"]);
    expect(calls.every(([, text]) => text === "내 이야기홍길동")).toBe(true);
  });

  it("불러오기가 실패해도 예외 없이 끝나 표지 만들기를 막지 않는다", async () => {
    vi.stubGlobal("document", { fonts: { load: () => Promise.reject(new Error("network")) } });
    await expect(loadBookCoverFonts({ title: "제목" })).resolves.toBeUndefined();
  });
});
