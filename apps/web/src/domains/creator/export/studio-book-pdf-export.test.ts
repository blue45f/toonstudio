import { describe, expect, it } from "vitest";

import { BOOK_TRIM_PRESETS, MM_TO_PT, bookPagePixelSize } from "./studio-book-layout-model";
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
