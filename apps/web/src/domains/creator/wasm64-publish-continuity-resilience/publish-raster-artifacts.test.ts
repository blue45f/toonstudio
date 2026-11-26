import { unzlibSync } from "fflate";
import { PDFDict, PDFDocument, PDFName, PDFRawStream } from "pdf-lib";
import { describe, expect, it } from "vitest";

import { buildPdfX4PrintPackage, packageForPublishTarget, type PackagePublishInput, type PublishRightsBom } from "./cmyk-pdfx4-epub3-print-packager";
import { encodePublishRasterPng } from "./publish-raster-png";
import { isValidPublishRaster } from "./publish-raster-validation";

const rightsBom: PublishRightsBom = {
  workId: "work", episodeId: "episode", title: "색상 원고", language: "ko", generatedAtIso: "2026-11-27T00:00:00Z",
  assets: [], royaltySplits: [{ creatorId: "author", displayName: "작가", role: "art", sharePercent: 100 }],
};
function printInput(rgba: Uint8ClampedArray): PackagePublishInput {
  return {
    specId: "print-book-cmyk-pdfx4", rightsBom,
    slices: [{ sliceId: "page", fileName: "page.png", widthPx: 2, heightPx: 1, format: "png", byteLength: rgba.length,
      dpi: 300, bleedMm: 3, rgba }],
  };
}

describe("원고 픽셀이 포함된 실제 출판 파일", () => {
  it("RGBA 길이가 맞아도 픽셀 상한을 넘으면 거절하고 정확한 상한은 허용한다", () => {
    const limit = 16_777_216;
    const pixels = new Uint8ClampedArray((limit + 1) * 4);
    expect(isValidPublishRaster(pixels, 1, limit + 1)).toBe(false);
    expect(isValidPublishRaster(pixels.subarray(0, limit * 4), 4096, 4096)).toBe(true);
  });

  it("PDF 파서가 모든 페이지의 이미지와 콘텐츠를 읽고 원고 색을 구별한다", async () => {
    const red = printInput(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]));
    const blue = printInput(new Uint8ClampedArray([0, 0, 255, 255, 0, 0, 0, 0]));
    const redPdf = buildPdfX4PrintPackage(red).pdfBytes;
    expect(redPdf).not.toEqual(buildPdfX4PrintPackage(blue).pdfBytes);
    const combined = buildPdfX4PrintPackage({ ...red, slices: [...red.slices, ...blue.slices] }).pdfBytes;
    const document = await PDFDocument.load(combined);
    expect(document.getPageCount()).toBe(2);
    for (const [index, page] of document.getPages().entries()) {
      const resources = page.node.lookup(PDFName.of("Resources"), PDFDict);
      const images = resources.lookup(PDFName.of("XObject"), PDFDict);
      const image = images.lookup(PDFName.of("Im0"));
      if (!(image instanceof PDFRawStream)) throw new Error("PDF 이미지 스트림 누락");
      expect(image.dict.get(PDFName.of("ColorSpace"))?.toString()).toBe("/DeviceCMYK");
      const expected = index === 0 ? [0, 255, 255, 0, 0, 0, 0, 0] : [255, 255, 0, 0, 0, 0, 0, 0];
      expect(Array.from(unzlibSync(image.getContents()))).toEqual(expected);
      const contents = page.node.lookup(PDFName.of("Contents"));
      if (!(contents instanceof PDFRawStream)) throw new Error("PDF 페이지 콘텐츠 스트림 누락");
      expect(new TextDecoder().decode(contents.getContents())).toContain("/Im0 Do");
      expect(page.getTrimBox().width).toBeGreaterThan(0);
    }
    const pdfText = new TextDecoder("latin1").decode(combined);
    const xref = Number(/startxref\n(\d+)/.exec(pdfText)?.[1]);
    expect(new TextDecoder().decode(combined.subarray(xref, xref + 4))).toBe("xref");
  });

  it("실제 픽셀이 없는 인쇄 입력은 빈 PDF 대신 사전 검증 실패를 반환한다", () => {
    const input = printInput(new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 0, 0]));
    const { rgba: _pixels, ...withoutPixels } = input.slices[0];
    const result = packageForPublishTarget({ ...input, slices: [withoutPixels] });
    expect(result.artifact).toBeNull();
    expect(result.preflight.blockingIssues.some((issue) => issue.code === "missing-raster-pixels")).toBe(true);
    expect(() => buildPdfX4PrintPackage({ ...input, slices: [withoutPixels] })).toThrow("RGBA");
  });

  it("PNG는 선언한 크기와 원본 RGBA를 실제 IHDR·IDAT에 기록한다", () => {
    const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 128]);
    const png = encodePublishRasterPng(rgba, 2, 1);
    expect(Array.from(png.subarray(0, 8))).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    expect(view.getUint32(16)).toBe(2);
    expect(view.getUint32(20)).toBe(1);
    const idatSize = view.getUint32(33);
    expect(new TextDecoder().decode(png.subarray(37, 41))).toBe("IDAT");
    expect(Array.from(unzlibSync(png.subarray(41, 41 + idatSize)))).toEqual([0, ...rgba]);
    expect(() => encodePublishRasterPng(rgba, 2, 2)).toThrow(RangeError);
  });

  it.each([
    { label: "너비 0", width: 0, height: 1, byteLength: 0 },
    { label: "높이 0", width: 1, height: 0, byteLength: 0 },
    { label: "음수 크기", width: -1, height: 1, byteLength: 0 },
    { label: "NaN 크기", width: Number.NaN, height: 1, byteLength: 0 },
    { label: "무한 크기", width: 1, height: Number.POSITIVE_INFINITY, byteLength: 0 },
    { label: "소수 크기", width: 0.5, height: 2, byteLength: 4 },
    { label: "픽셀 상한 초과", width: 65_536, height: 65_536, byteLength: 4 },
    { label: "픽셀 부족", width: 2, height: 1, byteLength: 4 },
    { label: "픽셀 초과", width: 2, height: 1, byteLength: 12 },
  ])("$label 입력을 할당하거나 잘라내지 않고 명시적으로 거절한다", ({ width, height, byteLength }) => {
    const rgba = new Uint8ClampedArray(byteLength);
    const base = printInput(rgba);
    const slice = base.slices[0];
    if (!slice) throw new Error("인쇄 입력 fixture 누락");
    const input: PackagePublishInput = {
      ...base,
      slices: [{ ...slice, widthPx: width, heightPx: height }],
    };
    const result = packageForPublishTarget(input);
    expect(result.artifact).toBeNull();
    expect(result.preflight.passed).toBe(false);
    expect(result.preflight.maxObservedTacPercent).toBeNull();
    expect(result.preflight.blockingIssues).toContainEqual(expect.objectContaining({
      code: "missing-raster-pixels", severity: "error", sliceId: "page",
    }));
    expect(() => buildPdfX4PrintPackage(input)).toThrow("RGBA");
    expect(() => encodePublishRasterPng(rgba, width, height)).toThrow(RangeError);
  });
});
