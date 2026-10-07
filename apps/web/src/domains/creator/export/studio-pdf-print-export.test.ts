import { inflateSync } from "node:zlib";

import { describe, expect, it } from "vitest";

import { buildPdfFromJpegPages, renderPagesToPdf, type PdfJpegPage } from "./studio-pdf-export";
import {
  PRINT_MM_TO_PT,
  buildPrintPdfFromPages,
  buildCropMarksContent,
  computePrintLayout,
  countPrintPdfOutputPages,
  cropMarkSegments,
  deflateStoredZlib,
  planBookletImposition,
  rgbToCmyk,
  rgbaToCmykBytes,
  type PrintPdfPage,
} from "./studio-pdf-print-export";

// ── 바이트 유틸 — studio-pdf-export.test.ts와 같은 latin1 규약 ──

function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

const countOf = (haystack: string, needle: string): number => haystack.split(needle).length - 1;

/** SOI/EOI를 갖춘 가짜 JPEG — seed 바이트로 페이지를 구분한다. */
function fakeJpeg(seed: number): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, seed & 0xff, 0x0a, 0x25, 0x25, 0x45, 0x4f, 0x46, 0xff, 0xd9,
  ]);
}

const jpegPage = (seed: number, width = 690, height = 1280): PrintPdfPage => ({
  kind: "jpeg",
  jpegBytes: fakeJpeg(seed),
  width,
  height,
});

/** 오브젝트 번호로 스트림 데이터를 /Length 만큼 잘라낸다. */
function extractObjectStream(bytes: Uint8Array, text: string, objNum: number): Uint8Array {
  const objAt = text.indexOf(`${objNum} 0 obj\n`);
  expect(objAt).toBeGreaterThan(-1);
  const streamAt = text.indexOf("stream\n", objAt);
  const length = Number(/\/Length (\d+)/.exec(text.slice(objAt, streamAt))?.[1]);
  const start = streamAt + "stream\n".length;
  return bytes.slice(start, start + length);
}

/** 파일 안의 모든 이미지 스트림을 등장 순서대로 — fakeJpeg의 seed 바이트 목록으로 환원. */
function imageSeedsInOrder(bytes: Uint8Array): number[] {
  const text = latin1(bytes);
  const seeds: number[] = [];
  const re = /\/Subtype \/Image/g;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const streamAt = text.indexOf("stream\n", match.index);
    // fakeJpeg 레이아웃: SOI(2) + APP0(4) 다음 바이트가 seed.
    seeds.push(bytes[streamAt + "stream\n".length + 6]);
  }
  return seeds;
}

describe("기본 옵션 — 기본 라이터와 바이트 동등", () => {
  const pages: PdfJpegPage[] = [
    { jpegBytes: fakeJpeg(1), width: 690, height: 1280 },
    { jpegBytes: fakeJpeg(2), width: 720, height: 900 },
  ];

  it("옵션 없음·제목 없음이 기본 라이터와 같다", () => {
    const expected = buildPdfFromJpegPages(pages);
    const actual = buildPrintPdfFromPages(pages.map((p) => ({ kind: "jpeg" as const, ...p })));
    expect(actual.length).toBe(expected.length);
    expect(latin1(actual)).toBe(latin1(expected));
  });

  it("전부 기본값인 print 옵션·한글 제목도 기본 라이터와 같다", () => {
    const expected = buildPdfFromJpegPages(pages, { title: "단행본 제목" });
    const actual = buildPrintPdfFromPages(pages.map((p) => ({ kind: "jpeg" as const, ...p })), {
      title: "단행본 제목",
      print: { bleedMm: 0, cropMarks: false, colorMode: "rgb", imposition: "none" },
    });
    expect(latin1(actual)).toBe(latin1(expected));
  });
});

describe("computePrintLayout", () => {
  it("도련·마크가 없으면 margin 0, 박스 생략, 이미지가 전체를 채운다", () => {
    const layout = computePrintLayout(517.5, 960, {});
    expect(layout.marginPt).toBe(0);
    expect(layout.trimBox).toBeNull();
    expect(layout.bleedBox).toBeNull();
    expect(layout.mediaBox).toEqual([0, 0, 517.5, 960]);
    expect(layout.imageRect).toEqual({ x: 0, y: 0, width: 517.5, height: 960 });
  });

  it("도련 3mm면 MediaBox·BleedBox가 도련만큼 커지고 TrimBox가 안쪽에 놓인다", () => {
    const bleed = 3 * PRINT_MM_TO_PT;
    const layout = computePrintLayout(517.5, 960, { bleedMm: 3 });
    expect(layout.bleedPt).toBeCloseTo(bleed);
    expect(layout.marginPt).toBeCloseTo(bleed);
    expect(layout.mediaBox[2]).toBeCloseTo(517.5 + bleed * 2);
    expect(layout.bleedBox).toEqual([0, 0, layout.mediaBox[2], layout.mediaBox[3]]);
    expect(layout.trimBox?.[0]).toBeCloseTo(bleed);
    expect(layout.trimBox?.[2]).toBeCloseTo(bleed + 517.5);
    expect(layout.imageRect.width).toBeCloseTo(517.5 + bleed * 2);
  });

  it("재단 마크가 있으면 마크 여유(간격 2mm + 길이 5mm)가 margin에 더해진다", () => {
    const layout = computePrintLayout(517.5, 960, { bleedMm: 3, cropMarks: true });
    expect(layout.marginPt).toBeCloseTo(10 * PRINT_MM_TO_PT);
    // BleedBox는 마크 여유만큼 안쪽에서 시작한다.
    expect(layout.bleedBox?.[0]).toBeCloseTo(7 * PRINT_MM_TO_PT);
  });
});

describe("cropMarkSegments / buildCropMarksContent", () => {
  const layout = computePrintLayout(200, 300, { bleedMm: 3, cropMarks: true });

  it("모서리 4곳 × 2선 = 8개 선분, 접지선을 주면 10개", () => {
    expect(cropMarkSegments(layout)).toHaveLength(8);
    expect(cropMarkSegments(layout, 150)).toHaveLength(10);
  });

  it("마크는 도련 가장자리에서 간격만큼 떨어져 시작한다", () => {
    const segments = cropMarkSegments(layout);
    const start = layout.bleedPt + 2 * PRINT_MM_TO_PT;
    const leftBottom = segments[0];
    // 왼쪽 아래 수평선: TrimBox 왼쪽 모서리 y에서, x는 trim 시작점 - (start..start+길이).
    expect(leftBottom.y1).toBeCloseTo(layout.trimBox![1]);
    expect(leftBottom.x2).toBeCloseTo(layout.trimBox![0] - start);
    expect(leftBottom.x1).toBeCloseTo(layout.trimBox![0] - start - 5 * PRINT_MM_TO_PT);
  });

  it("RGB는 검정(g), CMYK는 전판(k) 색상 연산자를 쓴다", () => {
    expect(buildCropMarksContent(layout, "rgb")).toContain("0 g");
    expect(buildCropMarksContent(layout, "cmyk")).toContain("1 1 1 1 k");
    expect(buildCropMarksContent(layout, "rgb")).toContain("\nS\nQ");
  });

  it("마크가 닿지 않는 지오메트리(margin 0)면 빈 문자열", () => {
    expect(buildCropMarksContent(computePrintLayout(200, 300, {}), "rgb")).toBe("");
  });
});

describe("CMYK 변환", () => {
  it("rgbToCmyk 기본 색", () => {
    expect(rgbToCmyk(1, 1, 1)).toEqual([0, 0, 0, 0]);
    expect(rgbToCmyk(0, 0, 0)).toEqual([0, 0, 0, 1]);
    expect(rgbToCmyk(1, 0, 0)).toEqual([0, 1, 1, 0]);
    expect(rgbToCmyk(0, 0, 1)).toEqual([1, 1, 0, 0]);
  });

  it("rgbaToCmykBytes — 불투명 빨강과 투명 흰색(흰 종이 합성)", () => {
    const rgba = new Uint8ClampedArray([
      255, 0, 0, 255, // 빨강
      0, 0, 0, 0, // 완전 투명 검정 → 흰색으로 합성
      0, 0, 0, 128, // 반투명 검정 → 중간 회색
    ]);
    const cmyk = rgbaToCmykBytes(rgba);
    expect([...cmyk.slice(0, 4)]).toEqual([0, 255, 255, 0]);
    expect([...cmyk.slice(4, 8)]).toEqual([0, 0, 0, 0]);
    expect([...cmyk.slice(8, 12)]).toEqual([0, 0, 0, 128]);
  });

  it("길이가 4의 배수가 아니면 throw", () => {
    expect(() => rgbaToCmykBytes(new Uint8Array(3))).toThrow(/픽셀 데이터 길이/);
  });
});

describe("deflateStoredZlib", () => {
  it("표준 zlib으로 되읽힌다 — 빈 데이터·작은 데이터·다중 블록", () => {
    for (const size of [0, 5, 65535, 200_000]) {
      const data = new Uint8Array(size);
      for (let i = 0; i < size; i++) data[i] = (i * 31 + 7) & 0xff;
      const packed = deflateStoredZlib(data);
      expect(packed[0]).toBe(0x78);
      expect(packed[1]).toBe(0x01);
      expect(inflateSync(packed)).toEqual(Buffer.from(data));
    }
  });
});

describe("planBookletImposition", () => {
  it("4페이지 — 시트 1장 [4·1 / 2·3]", () => {
    expect(planBookletImposition(4)).toEqual([{ front: [3, 0], back: [1, 2] }]);
  });

  it("8페이지 — 시트 2장", () => {
    expect(planBookletImposition(8)).toEqual([
      { front: [7, 0], back: [1, 6] },
      { front: [5, 2], back: [3, 4] },
    ]);
  });

  it("5페이지 — 8로 패딩되고 빈 자리는 null", () => {
    expect(planBookletImposition(5)).toEqual([
      { front: [null, 0], back: [1, null] },
      { front: [null, 2], back: [3, 4] },
    ]);
  });

  it("1페이지 — 나머지는 전부 빈 페이지", () => {
    expect(planBookletImposition(1)).toEqual([{ front: [null, 0], back: [null, null] }]);
  });

  it("0페이지면 throw", () => {
    expect(() => planBookletImposition(0)).toThrow(/페이지가 없어요/);
  });

  it("출력 페이지 수 — booklet은 시트×2, 아니면 입력 그대로", () => {
    expect(countPrintPdfOutputPages(7)).toBe(7);
    expect(countPrintPdfOutputPages(7, { imposition: "none" })).toBe(7);
    expect(countPrintPdfOutputPages(4, { imposition: "booklet" })).toBe(2);
    expect(countPrintPdfOutputPages(5, { imposition: "booklet" })).toBe(4);
  });
});

describe("buildPrintPdfFromPages — 도련·마크 산출 구조", () => {
  it("TrimBox·BleedBox가 페이지 사전에 들어가고 마크가 콘텐츠에 그려진다", () => {
    const bytes = buildPrintPdfFromPages([jpegPage(9)], {
      print: { bleedMm: 3, cropMarks: true },
    });
    const text = latin1(bytes);
    const layout = computePrintLayout(690 * 0.75, 1280 * 0.75, { bleedMm: 3, cropMarks: true });
    const fmt = (v: number): string =>
      Number.isInteger(v) ? String(v) : v.toFixed(2).replace(/\.?0+$/, "");
    expect(text).toContain(`/MediaBox [0 0 ${fmt(layout.mediaBox[2])} ${fmt(layout.mediaBox[3])}]`);
    expect(text).toContain(
      `/TrimBox [${layout.trimBox!.map(fmt).join(" ")}]`
    );
    expect(text).toContain(`/BleedBox [${layout.bleedBox!.map(fmt).join(" ")}]`);
    // 콘텐츠 스트림(오브젝트 4)에 마크 경로가 있다.
    const content = latin1(extractObjectStream(bytes, text, 4));
    expect(content).toContain("/Im0 Do");
    expect(content).toContain("0 g");
    expect(countOf(content, " l\n")).toBe(8);
  });

  it("도련만 있고 마크가 없으면 TrimBox는 있고 마크 경로는 없다", () => {
    const bytes = buildPrintPdfFromPages([jpegPage(9)], { print: { bleedMm: 3 } });
    const text = latin1(bytes);
    expect(text).toContain("/TrimBox");
    const content = latin1(extractObjectStream(bytes, text, 4));
    expect(content).not.toContain(" l\n");
  });
});

describe("buildPrintPdfFromPages — CMYK 산출 구조", () => {
  const cmykPage: PrintPdfPage = {
    kind: "cmyk-raster",
    cmykBytes: Uint8Array.from([0, 255, 255, 0, 10, 20, 30, 40]),
    width: 2,
    height: 1,
  };

  it("DeviceCMYK·FlateDecode 이미지로 임베드되고 스트림이 원본으로 복원된다", () => {
    const bytes = buildPrintPdfFromPages([cmykPage], { print: { colorMode: "cmyk" } });
    const text = latin1(bytes);
    expect(text).toContain("/ColorSpace /DeviceCMYK");
    expect(text).toContain("/Filter /FlateDecode");
    const stream = extractObjectStream(bytes, text, 5);
    expect(inflateSync(stream)).toEqual(Buffer.from(cmykPage.cmykBytes as Uint8Array));
  });

  it("모드와 페이지 종류가 어긋나면 throw", () => {
    expect(() => buildPrintPdfFromPages([jpegPage(1)], { print: { colorMode: "cmyk" } })).toThrow(
      /CMYK 래스터 페이지/
    );
    expect(() => buildPrintPdfFromPages([cmykPage], { print: { colorMode: "rgb" } })).toThrow(
      /JPEG 페이지/
    );
    expect(() => buildPrintPdfFromPages([cmykPage])).toThrow(/JPEG 페이지/);
  });

  it("CMYK 데이터 길이가 크기와 다르면 throw", () => {
    const bad: PrintPdfPage = { kind: "cmyk-raster", cmykBytes: new Uint8Array(7), width: 2, height: 1 };
    expect(() => buildPrintPdfFromPages([bad], { print: { colorMode: "cmyk" } })).toThrow(
      /CMYK 데이터 길이/
    );
  });
});

describe("buildPrintPdfFromPages — 스프레드 배열 산출 구조", () => {
  const pages = [11, 22, 33, 44].map((seed) => jpegPage(seed, 100, 200));

  it("4페이지 → 펼침면 2장, 이미지 순서가 제본 배열을 따른다", () => {
    const bytes = buildPrintPdfFromPages(pages, { print: { imposition: "booklet" } });
    const text = latin1(bytes);
    expect(text).toContain("/Count 2");
    // 앞면 [4쪽·1쪽], 뒷면 [2쪽·3쪽] — 파일 안 이미지 순서 = seed [44, 11, 22, 33].
    expect(imageSeedsInOrder(bytes)).toEqual([44, 11, 22, 33]);
    // 펼침면 폭은 재단 폭의 2배(100px→75pt ×2 = 150pt), 높이는 그대로.
    expect(text).toContain("/MediaBox [0 0 150 150]");
    // 각 펼침면에 이미지 2개 배치.
    const firstContent = latin1(extractObjectStream(bytes, text, 4));
    expect(countOf(firstContent, " Do\n")).toBe(2);
  });

  it("스프레드 + 마크면 접지선 마크까지 10개 선분이 그려진다", () => {
    const bytes = buildPrintPdfFromPages(pages, {
      print: { imposition: "booklet", bleedMm: 3, cropMarks: true },
    });
    const text = latin1(bytes);
    const firstContent = latin1(extractObjectStream(bytes, text, 4));
    expect(countOf(firstContent, " l\n")).toBe(10);
  });

  it("페이지 크기가 섞이면 throw", () => {
    const mixed = [...pages.slice(0, 3), jpegPage(55, 120, 200)];
    expect(() => buildPrintPdfFromPages(mixed, { print: { imposition: "booklet" } })).toThrow(
      /크기가 같을 때만/
    );
  });

  it("빈 자리가 있는 스프레드는 이미지를 1개만 배치한다", () => {
    const five = [11, 22, 33, 44, 55].map((seed) => jpegPage(seed, 100, 200));
    const bytes = buildPrintPdfFromPages(five, { print: { imposition: "booklet" } });
    const text = latin1(bytes);
    expect(text).toContain("/Count 4");
    // 첫 펼침면 앞 = [빈·1쪽] → 이미지 1개.
    const firstContent = latin1(extractObjectStream(bytes, text, 4));
    expect(countOf(firstContent, " Do\n")).toBe(1);
  });
});

describe("buildPrintPdfFromPages — 검증", () => {
  it("빈 배열·잘못된 도련·깨진 JPEG를 거부한다", () => {
    expect(() => buildPrintPdfFromPages([])).toThrow(/페이지가 없어요/);
    expect(() => buildPrintPdfFromPages([jpegPage(1)], { print: { bleedMm: -1 } })).toThrow(
      /재단 여백/
    );
    const broken: PrintPdfPage = { kind: "jpeg", jpegBytes: new Uint8Array([1, 2, 3, 4]), width: 10, height: 10 };
    expect(() => buildPrintPdfFromPages([broken])).toThrow(/JPEG 형식/);
  });
});

// ── renderPagesToPdf 경유 — print 옵션이 실제 내보내기까지 닿는지 ──

class PrintFakeContext {
  fillStyle = "";
  fillRect(): void {}
  drawImage(): void {}
  getImageData(_x: number, _y: number, w: number, h: number): { data: Uint8ClampedArray } {
    const data = new Uint8ClampedArray(w * h * 4);
    // 전부 불투명 빨강.
    for (let i = 0; i < data.length; i += 4) {
      data[i] = 255;
      data[i + 3] = 255;
    }
    return { data };
  }
}

class PrintFakeCanvas {
  ctx = new PrintFakeContext();
  constructor(
    public width: number,
    public height: number
  ) {}
  getContext(): PrintFakeContext {
    return this.ctx;
  }
}

const asPrintCanvas = (fake: PrintFakeCanvas) => fake as unknown as HTMLCanvasElement;

describe("renderPagesToPdf — print 옵션 경유", () => {
  it("CMYK 모드면 JPEG 인코드를 거치지 않고 DeviceCMYK PDF를 만든다", async () => {
    const result = await renderPagesToPdf({
      pages: [asPrintCanvas(new PrintFakeCanvas(4, 2))],
      title: "인쇄본",
      createCanvas: (width, height) => asPrintCanvas(new PrintFakeCanvas(width, height)),
      toJpeg: () => Promise.reject(new Error("CMYK 모드에서 JPEG 인코드를 타면 안 된다")),
      print: { colorMode: "cmyk" },
    });
    expect(result.pageCount).toBe(1);
    const pdf = new Uint8Array(await result.blob.arrayBuffer());
    const text = latin1(pdf);
    expect(text).toContain("/ColorSpace /DeviceCMYK");
    // 빨강(255,0,0) → CMYK (0,255,255,0)이 스트림에 복원된다.
    const stream = extractObjectStream(pdf, text, 5);
    expect([...inflateSync(stream).subarray(0, 4)]).toEqual([0, 255, 255, 0]);
  });

  it("도련·마크 옵션이면 TrimBox가 있는 PDF를 만든다", async () => {
    const result = await renderPagesToPdf({
      pages: [asPrintCanvas(new PrintFakeCanvas(100, 200))],
      title: "인쇄본",
      createCanvas: (width, height) => asPrintCanvas(new PrintFakeCanvas(width, height)),
      toJpeg: () => Promise.resolve(fakeJpeg(3)),
      print: { bleedMm: 3, cropMarks: true },
    });
    const pdf = new Uint8Array(await result.blob.arrayBuffer());
    const text = latin1(pdf);
    expect(text).toContain("/TrimBox");
    expect(text).toContain("/BleedBox");
  });

  it("스프레드 배열이면 펼침면 수로 페이지가 줄어든다", async () => {
    const sources = [0, 1, 2, 3].map(() => asPrintCanvas(new PrintFakeCanvas(100, 200)));
    const result = await renderPagesToPdf({
      pages: sources,
      title: "단행본",
      createCanvas: (width, height) => asPrintCanvas(new PrintFakeCanvas(width, height)),
      toJpeg: () => Promise.resolve(fakeJpeg(5)),
      print: { imposition: "booklet" },
    });
    expect(result.pageCount).toBe(2);
  });
});
