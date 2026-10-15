import { describe, expect, it } from "vitest";

import { DEFAULT_BOOK_FOLIO } from "./studio-book-binding";
import { bookPagePixelSize, findBookTrimPreset } from "./studio-book-layout-model";
import { renderPagesToPdf } from "./studio-pdf-export";

/** 캔버스 2D 컨텍스트의 대역 — 표지와 페이지 평탄화가 부르는 메서드만 기록한다. */
class FakeContext2D {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign: CanvasTextAlign = "start";
  textBaseline: CanvasTextBaseline = "alphabetic";
  readonly texts: string[] = [];
  fillRect(): void {}
  drawImage(): void {}
  beginPath(): void {}
  moveTo(): void {}
  lineTo(): void {}
  stroke(): void {}
  measureText(text: string): { readonly width: number } {
    return { width: Array.from(text).length * 10 };
  }
  fillText(text: string): void {
    this.texts.push(text);
  }
}

class FakeCanvas {
  readonly ctx = new FakeContext2D();
  constructor(public width: number, public height: number) {}
  getContext(): FakeContext2D {
    return this.ctx;
  }
}

const asCanvas = (canvas: FakeCanvas) => canvas as unknown as HTMLCanvasElement;

const a5 = (() => {
  const preset = findBookTrimPreset("a5");
  if (!preset) throw new Error("a5 preset missing");
  return preset.spec;
})();

function fakeJpeg(seed: number): Uint8Array {
  return Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, seed, 2, 3, 4]);
}

describe("renderPagesToPdf — 책 구성의 글자 표지", () => {
  const pixels = bookPagePixelSize(a5, 150);

  function setup() {
    const created: FakeCanvas[] = [];
    const encoded: { width: number; height: number }[] = [];
    return {
      created,
      encoded,
      options: {
        createCanvas: (width: number, height: number) => {
          const canvas = new FakeCanvas(width, height);
          created.push(canvas);
          return asCanvas(canvas);
        },
        toJpeg: (canvas: HTMLCanvasElement) => {
          encoded.push({ width: canvas.width, height: canvas.height });
          return Promise.resolve(fakeJpeg(encoded.length));
        },
      },
    };
  }

  it("표지를 켜면 판형(도련 포함) 크기 표지 한 장이 맨 앞에 붙고 제목·지은이가 그려진다", async () => {
    const { created, encoded, options } = setup();
    const result = await renderPagesToPdf({
      ...options,
      pages: [asCanvas(new FakeCanvas(800, 1200)), asCanvas(new FakeCanvas(800, 1200))],
      title: "내 인생의 한 장면",
      book: {
        spec: a5,
        dpi: 150,
        binding: { placement: "inside-safe", folio: DEFAULT_BOOK_FOLIO, cover: { author: "홍길동" } },
      },
    });

    // 본문 두 장 + 표지 한 장.
    expect(result.pageCount).toBe(3);
    expect(encoded).toHaveLength(3);
    // 본문 평탄화 캔버스 두 장 뒤에 표지 캔버스가 판형 픽셀 크기로 만들어진다.
    const coverCanvas = created.find((canvas) => canvas.width === pixels.width && canvas.height === pixels.height);
    expect(coverCanvas?.ctx.texts).toEqual(["내 인생의 한 장면", "홍길동"]);
    const text = new TextDecoder("latin1").decode(new Uint8Array(await result.blob.arrayBuffer()));
    expect(text).toContain("/Count 3");
    // 표지(첫 쪽)에는 쪽 번호가 없고 본문 두 쪽에 1, 2가 찍힌다.
    expect(text).toContain("(1) Tj");
    expect(text).toContain("(2) Tj");
    expect(text).not.toContain("(3) Tj");
    expect(result.bookWarnings).toEqual([]);
  });

  it("지은이를 비우면 제목만 그리고, 제목이 비어 있으면 ‘제목 없음’을 쓴다", async () => {
    const { created, options } = setup();
    await renderPagesToPdf({
      ...options,
      pages: [asCanvas(new FakeCanvas(800, 1200))],
      title: "   ",
      book: { spec: a5, dpi: 150, binding: { cover: {} } },
    });
    const coverCanvas = created.find((canvas) => canvas.width === pixels.width && canvas.height === pixels.height);
    expect(coverCanvas?.ctx.texts).toEqual(["제목 없음"]);
  });

  it("표지를 켜지 않으면 표지 캔버스를 만들지 않고 쪽수도 그대로다", async () => {
    const { created, encoded, options } = setup();
    const result = await renderPagesToPdf({
      ...options,
      pages: [asCanvas(new FakeCanvas(pixels.width, pixels.height))],
      title: "책",
      book: { spec: a5, dpi: 150 },
    });
    expect(result.pageCount).toBe(1);
    expect(encoded).toHaveLength(1);
    expect(created.every((canvas) => canvas.width === pixels.width && canvas.height === pixels.height)).toBe(true);
    expect(created).toHaveLength(1);
  });

  it("표지 캔버스를 만들지 못하면 한글 메시지로 실패하고 PDF를 만들지 않는다", async () => {
    const { options } = setup();
    await expect(renderPagesToPdf({
      ...options,
      createCanvas: (width, height) => {
        const canvas = new FakeCanvas(width, height);
        // 평탄화 캔버스는 정상, 표지 크기 캔버스만 컨텍스트가 없다.
        if (width === pixels.width && height === pixels.height) {
          return asCanvas(Object.assign(canvas, { getContext: () => null }));
        }
        return asCanvas(canvas);
      },
      pages: [asCanvas(new FakeCanvas(800, 1200))],
      title: "책",
      book: { spec: a5, dpi: 150, binding: { cover: {} } },
    })).rejects.toThrow("표지 캔버스를 만들지 못했어요");
  });
});
