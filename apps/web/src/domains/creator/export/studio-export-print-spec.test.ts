import { afterEach, describe, expect, it } from "vitest";

import {
  DEFAULT_STUDIO_PDF_PRINT_SPEC,
  describePdfPrintSpec,
  readStudioPdfPrintSpecDraft,
  resetStudioPdfPrintSpecDraft,
  resolvePdfPrintOptions,
  writeStudioPdfPrintSpecDraft,
  type StudioPdfPrintSpecState,
} from "./studio-export-print-spec";

afterEach(() => {
  resetStudioPdfPrintSpecDraft();
});

describe("resolvePdfPrintOptions", () => {
  it("비활성이면 undefined — 호출자가 print 키를 생략해 기본 경로를 탄다", () => {
    expect(resolvePdfPrintOptions(DEFAULT_STUDIO_PDF_PRINT_SPEC)).toBeUndefined();
    // 비활성이면 나머지 값이 기본값이 아니어도 빌더 옵션으로 새지 않는다.
    expect(
      resolvePdfPrintOptions({
        enabled: false,
        bleedMm: 3,
        cropMarks: true,
        colorMode: "cmyk",
        imposition: "booklet",
      })
    ).toBeUndefined();
  });

  it("활성 + 전부 기본값이면 기본값 그대로의 옵션을 돌려준다", () => {
    expect(
      resolvePdfPrintOptions({ ...DEFAULT_STUDIO_PDF_PRINT_SPEC, enabled: true })
    ).toEqual({ bleedMm: 0, cropMarks: false, colorMode: "rgb", imposition: "none" });
  });

  it("활성이면 네 항목을 빌더 옵션으로 그대로 옮긴다", () => {
    const state: StudioPdfPrintSpecState = {
      enabled: true,
      bleedMm: 3,
      cropMarks: true,
      colorMode: "cmyk",
      imposition: "booklet",
    };
    expect(resolvePdfPrintOptions(state)).toEqual({
      bleedMm: 3,
      cropMarks: true,
      colorMode: "cmyk",
      imposition: "booklet",
    });
  });
});

describe("describePdfPrintSpec", () => {
  it("전부 기본값이면 기본 구성이라고만 말한다", () => {
    expect(describePdfPrintSpec(DEFAULT_STUDIO_PDF_PRINT_SPEC)).toBe("기본 구성");
    expect(
      describePdfPrintSpec({ ...DEFAULT_STUDIO_PDF_PRINT_SPEC, enabled: true })
    ).toBe("기본 구성");
  });

  it("기본값에서 벗어난 항목만 추려 나열한다", () => {
    expect(
      describePdfPrintSpec({
        enabled: true,
        bleedMm: 3,
        cropMarks: true,
        colorMode: "cmyk",
        imposition: "booklet",
      })
    ).toBe("도련 3mm · 재단 마크 · CMYK · 중철 스프레드");
    expect(
      describePdfPrintSpec({ ...DEFAULT_STUDIO_PDF_PRINT_SPEC, enabled: true, cropMarks: true })
    ).toBe("재단 마크");
  });
});

describe("인쇄 스펙 초안", () => {
  it("쓰기 전에는 null이고, 쓴 뒤에는 같은 상태를 돌려준다", () => {
    expect(readStudioPdfPrintSpecDraft()).toBeNull();
    const next: StudioPdfPrintSpecState = {
      enabled: true,
      bleedMm: 5,
      cropMarks: false,
      colorMode: "rgb",
      imposition: "none",
    };
    writeStudioPdfPrintSpecDraft(next);
    expect(readStudioPdfPrintSpecDraft()).toEqual(next);
  });

  it("리셋하면 다시 null이 된다", () => {
    writeStudioPdfPrintSpecDraft(DEFAULT_STUDIO_PDF_PRINT_SPEC);
    resetStudioPdfPrintSpecDraft();
    expect(readStudioPdfPrintSpecDraft()).toBeNull();
  });
});
