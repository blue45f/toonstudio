import { describe, expect, it } from "vitest";

import { DEFAULT_BOOK_FOLIO, bookFolioTextWidthPt } from "./studio-book-binding";
import {
  BOOK_TRIM_PRESETS,
  MM_TO_PT,
  bookPagePixelSize,
  computeBookPageBoxes,
  findBookTrimPreset,
} from "./studio-book-layout-model";
import { buildBookPrintPdf, type BookPdfPage } from "./studio-book-pdf-export";

// 최소 SOI를 가진 가짜 JPEG — 빌더는 SOI(FFD8)만 검사하고 바이트를 그대로 임베드한다.
const fakeJpeg = (width: number, height: number): BookPdfPage => ({
  jpegBytes: Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]),
  width,
  height,
});

const spec = BOOK_TRIM_PRESETS[0].spec; // 신국판
const size300 = bookPagePixelSize(spec, 300);

function pdfText(bytes: Uint8Array): string {
  return new TextDecoder("latin1").decode(bytes);
}

describe("buildBookPrintPdf", () => {
  it("판형을 고르면 Media·Trim·Bleed 박스가 판형(mm→pt) 그대로 기록된다", () => {
    const { bytes, pageBoxes, warnings } = buildBookPrintPdf(
      [fakeJpeg(size300.width, size300.height)],
      { spec, cropMarks: false }
    );
    const text = pdfText(bytes);
    expect(text.startsWith("%PDF-1.4")).toBe(true);
    const mediaW = (158 * MM_TO_PT).toFixed(2).replace(/\.?0+$/, "");
    const mediaH = (231 * MM_TO_PT).toFixed(2).replace(/\.?0+$/, "");
    expect(text).toContain(`/MediaBox [0 0 ${mediaW} ${mediaH}]`);
    // TrimBox: 도련 3mm만큼 안쪽에서 재단 크기.
    const trimX = (3 * MM_TO_PT).toFixed(2).replace(/\.?0+$/, "");
    const trimX2 = (155 * MM_TO_PT).toFixed(2).replace(/\.?0+$/, "");
    const trimY2 = (228 * MM_TO_PT).toFixed(2).replace(/\.?0+$/, "");
    expect(text).toContain(`/TrimBox [${trimX} ${trimX} ${trimX2} ${trimY2}]`);
    expect(text).toContain(`/BleedBox [0 0 ${mediaW} ${mediaH}]`);
    expect(pageBoxes).toHaveLength(1);
    expect(warnings).toEqual([]);
    expect(text).toContain("/Count 1");
  });

  it("재단 마크를 켜면 MediaBox가 마크 여유(7mm×2)만큼 넓어지고 마크가 그려진다", () => {
    const plain = buildBookPrintPdf([fakeJpeg(size300.width, size300.height)], {
      spec,
      cropMarks: false,
    });
    const marked = buildBookPrintPdf([fakeJpeg(size300.width, size300.height)], {
      spec,
      cropMarks: true,
    });
    const markedText = pdfText(marked.bytes);
    const mediaW = ((158 + 14) * MM_TO_PT).toFixed(2).replace(/\.?0+$/, "");
    expect(markedText).toContain(`/MediaBox [0 0 ${mediaW} `);
    // 마크 스트림(선 두께 0.35 + 선분)이 들어간다.
    expect(markedText).toContain("0.35 w");
    expect(marked.bytes.length).toBeGreaterThan(plain.bytes.length);
    // TrimBox 원점도 마크 여유만큼 이동한다.
    const trimX = ((7 + 3) * MM_TO_PT).toFixed(2).replace(/\.?0+$/, "");
    expect(markedText).toContain(`/TrimBox [${trimX} ${trimX} `);
  });

  it("안전 영역 밖 요소가 경고로 실리고, 내보내기 자체는 성공한다", () => {
    const { bytes, warnings } = buildBookPrintPdf(
      [fakeJpeg(size300.width, size300.height), fakeJpeg(size300.width, size300.height)],
      {
        spec,
        elementsByPage: [
          [{ id: "b1", label: "대사", kind: "balloon", rect: { x: 2, y: 10, width: 40, height: 12 } }],
          undefined,
        ],
      }
    );
    expect(bytes.length).toBeGreaterThan(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatchObject({ pageIndex: 0, elementId: "b1", code: "outside-safe" });
  });

  it("판형 비율과 다른 페이지는 aspect-mismatch 경고", () => {
    const { warnings } = buildBookPrintPdf([fakeJpeg(800, 800)], { spec });
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe("aspect-mismatch");
  });

  it("빈 페이지·비JPEG는 throw 한다", () => {
    expect(() => buildBookPrintPdf([], { spec })).toThrow("페이지가 없어요");
    expect(() =>
      buildBookPrintPdf(
        [{ jpegBytes: Uint8Array.from([0x89, 0x50, 0x4e, 0x47]), width: 10, height: 10 }],
        { spec }
      )
    ).toThrow("JPEG 형식");
  });

  it("결정적이다 — 같은 입력은 같은 바이트", () => {
    const page = fakeJpeg(size300.width, size300.height);
    const a = buildBookPrintPdf([page], { spec, cropMarks: true }, { title: "단행본" });
    const b = buildBookPrintPdf([page], { spec, cropMarks: true }, { title: "단행본" });
    expect(a.bytes).toEqual(b.bytes);
    expect(pdfText(a.bytes)).toContain("/Title <FEFF");
  });
});

describe("buildBookPrintPdf — 책 구성(여백 안에 맞춤·쪽 번호·표지)", () => {
  const a5 = (() => {
    const preset = findBookTrimPreset("a5");
    if (!preset) throw new Error("a5 preset missing");
    return preset.spec;
  })();
  const a5Size = bookPagePixelSize(a5, 300);
  const body = (): BookPdfPage => fakeJpeg(a5Size.width, a5Size.height);
  const cover = (): BookPdfPage => ({ ...fakeJpeg(a5Size.width, a5Size.height), role: "cover" });
  const bookRequest = {
    spec: a5,
    dpi: 300,
    binding: { placement: "inside-safe" as const, folio: DEFAULT_BOOK_FOLIO, cover: {} },
  };

  /** xref 표의 오프셋이 모두 해당 오브젝트 머리를 가리키는지 확인한다(오브젝트 번호·오프셋 정합). */
  function assertXrefIntegrity(bytes: Uint8Array): void {
    const text = pdfText(bytes);
    const startxref = Number(/startxref\n(\d+)\n%%EOF$/u.exec(text)?.[1]);
    expect(Number.isFinite(startxref)).toBe(true);
    expect(text.slice(startxref).startsWith("xref\n0 ")).toBe(true);
    const size = Number(/xref\n0 (\d+)\n/u.exec(text.slice(startxref))?.[1]);
    expect(text).toContain(`/Size ${size} `);
    const tableStart = startxref + text.slice(startxref).indexOf("\n", text.slice(startxref).indexOf("\n") + 1) + 1;
    for (let num = 1; num < size; num += 1) {
      const entry = text.slice(tableStart + num * 20, tableStart + num * 20 + 20);
      const offset = Number(entry.slice(0, 10));
      expect(text.slice(offset).startsWith(`${num} 0 obj`)).toBe(true);
    }
  }

  function contentStreams(bytes: Uint8Array): string[] {
    return [...pdfText(bytes).matchAll(/stream\n(q\n[\s\S]*?)\nendstream/gu)].map((match) => match[1] ?? "");
  }

  it("binding을 생략하거나 비워 두면 기존 출력과 바이트가 같고 글꼴 오브젝트가 없다", () => {
    const plain = buildBookPrintPdf([body(), body()], { spec: a5, cropMarks: true }, { title: "책" });
    const empty = buildBookPrintPdf([body(), body()], { spec: a5, cropMarks: true, binding: {} }, { title: "책" });
    expect(empty.bytes).toEqual(plain.bytes);
    expect(pdfText(plain.bytes)).not.toContain("/Font");
    expect(pdfText(plain.bytes)).not.toContain("BT\n");
    expect(plain.pageFolios).toEqual([null, null]);
  });

  it("쪽 번호: 본문 쪽마다 1부터 번호를 찍고 표준 글꼴 오브젝트와 xref가 맞는다", () => {
    const result = buildBookPrintPdf([body(), body(), body()], { ...bookRequest, binding: { folio: DEFAULT_BOOK_FOLIO } });
    const text = pdfText(result.bytes);
    expect(result.pageFolios).toEqual([1, 2, 3]);
    for (const number of [1, 2, 3]) expect(text).toContain(`(${number}) Tj`);
    expect(text).toContain("/BaseFont /Helvetica");
    expect(text).toContain("/Font << /F1 ");
    expect(text).toContain("/ProcSet [/PDF /Text /ImageC]");
    expect(text).toContain("/Count 3");
    assertXrefIntegrity(result.bytes);
  });

  it("쪽 번호는 바깥쪽 아래: 첫 쪽(오른쪽 면)은 오른쪽 끝, 둘째 쪽(왼쪽 면)은 왼쪽 끝에 놓인다", () => {
    const result = buildBookPrintPdf([body(), body()], { ...bookRequest, binding: { folio: DEFAULT_BOOK_FOLIO } });
    const [first, second] = contentStreams(result.bytes);
    const read = (stream: string | undefined) => {
      const match = /\/F1 9 Tf\n0 g\n([\d.]+) ([\d.]+) Td\n\((\d+)\) Tj/u.exec(stream ?? "");
      return { x: Number(match?.[1]), y: Number(match?.[2]), text: match?.[3] };
    };
    const right = computeBookPageBoxes(a5, "right").safe;
    const left = computeBookPageBoxes(a5, "left").safe;
    const firstFolio = read(first);
    const secondFolio = read(second);
    expect(firstFolio.text).toBe("1");
    expect(firstFolio.x + bookFolioTextWidthPt("1", 9)).toBeCloseTo(right.x + right.width, 1);
    expect(secondFolio.text).toBe("2");
    expect(secondFolio.x).toBeCloseTo(left.x, 1);
    expect(firstFolio.y).toBeGreaterThan(0);
    expect(firstFolio.y).toBeLessThan(right.y);
  });

  it("재단 마크 여유로 박스가 옮겨져도 쪽 번호는 같은 상대 위치를 유지한다", () => {
    const plain = buildBookPrintPdf([body()], { spec: a5, binding: { folio: DEFAULT_BOOK_FOLIO } });
    const marked = buildBookPrintPdf([body()], { spec: a5, cropMarks: true, binding: { folio: DEFAULT_BOOK_FOLIO } });
    const pick = (bytes: Uint8Array) => /([\d.]+) ([\d.]+) Td/u.exec(contentStreams(bytes)[0] ?? "");
    const shift = 7 * MM_TO_PT;
    expect(Number(pick(marked.bytes)?.[1]) - Number(pick(plain.bytes)?.[1])).toBeCloseTo(shift, 1);
    expect(Number(pick(marked.bytes)?.[2]) - Number(pick(plain.bytes)?.[2])).toBeCloseTo(shift, 1);
  });

  it("표지는 단면이고 쪽 번호가 없으며 본문 번호 매김에 들어가지 않는다", () => {
    const result = buildBookPrintPdf([cover(), body(), body()], bookRequest);
    expect(result.pageFolios).toEqual([null, 1, 2]);
    const streams = contentStreams(result.bytes);
    expect(streams[0]).not.toContain("BT");
    expect(streams[1]).toContain("(1) Tj");
    expect(streams[2]).toContain("(2) Tj");
    // 표지는 도련 박스를 채운다 — 제본 여백 없는 단면 박스.
    const single = computeBookPageBoxes(a5, "single");
    expect(result.pageBoxes[0]?.safe.width).toBeCloseTo(single.safe.width, 5);
    // 본문 첫 쪽은 표지를 세지 않고 오른쪽 면으로 시작한다.
    expect(result.pageBoxes[1]?.safe.x).toBeCloseTo(computeBookPageBoxes(a5, "right").safe.x, 5);
    expect(result.pageBoxes[2]?.safe.x).toBeCloseTo(computeBookPageBoxes(a5, "left").safe.x, 5);
    assertXrefIntegrity(result.bytes);
  });

  it("쪽 번호 시작값을 바꿀 수 있고 대시 서식을 쓴다", () => {
    const result = buildBookPrintPdf([body(), body()], {
      spec: a5,
      binding: { folio: { ...DEFAULT_BOOK_FOLIO, startAt: 5, format: "arabic-dash" } },
    });
    expect(result.pageFolios).toEqual([5, 6]);
    expect(pdfText(result.bytes)).toContain("(- 5 -) Tj");
  });

  it("여백 안에 맞추기: 비율이 다른 원고도 늘리지 않고 안전 영역 안에 가운데 맞춘다(비율 경고도 없다)", () => {
    const wide = fakeJpeg(1600, 800);
    const tall = fakeJpeg(690, 12000);
    const result = buildBookPrintPdf([wide, tall], { spec: a5, binding: { placement: "inside-safe" } });
    expect(result.warnings).toEqual([]);
    const streams = contentStreams(result.bytes);
    const safes = [computeBookPageBoxes(a5, "right").safe, computeBookPageBoxes(a5, "left").safe];
    [wide, tall].forEach((page, index) => {
      const match = /q\n([\d.]+) 0 0 ([\d.]+) ([\d.]+) ([\d.]+) cm/u.exec(streams[index] ?? "");
      const [w, h, x, y] = [1, 2, 3, 4].map((group) => Number(match?.[group]));
      const safe = safes[index];
      expect(x).toBeGreaterThanOrEqual((safe?.x ?? 0) - 0.05);
      expect(y).toBeGreaterThanOrEqual((safe?.y ?? 0) - 0.05);
      expect((x ?? 0) + (w ?? 0)).toBeLessThanOrEqual((safe?.x ?? 0) + (safe?.width ?? 0) + 0.05);
      expect((y ?? 0) + (h ?? 0)).toBeLessThanOrEqual((safe?.y ?? 0) + (safe?.height ?? 0) + 0.05);
      expect((w ?? 0) / (h ?? 1)).toBeCloseTo(page.width / page.height, 2);
    });
  });

  it("풀블리드(기본)에서는 같은 원고에 비율 경고가 그대로 나온다", () => {
    const result = buildBookPrintPdf([fakeJpeg(1600, 800)], { spec: a5 });
    expect(result.warnings.map((warning) => warning.code)).toEqual(["aspect-mismatch"]);
  });

  it("표지가 판형 비율과 다르면 표지에는 비율 경고가 난다", () => {
    const result = buildBookPrintPdf([{ ...fakeJpeg(800, 800), role: "cover" }, body()], bookRequest);
    expect(result.warnings).toEqual([expect.objectContaining({ pageIndex: 0, code: "aspect-mismatch" })]);
  });

  it("같은 입력은 같은 바이트다(결정적)", () => {
    const a = buildBookPrintPdf([cover(), body()], bookRequest, { title: "내 이야기" });
    const b = buildBookPrintPdf([cover(), body()], bookRequest, { title: "내 이야기" });
    expect(a.bytes).toEqual(b.bytes);
  });
});
