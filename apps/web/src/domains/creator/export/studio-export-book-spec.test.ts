import { afterEach, describe, expect, it } from "vitest";

import { BOOK_TRIM_PRESETS } from "./studio-book-layout-model";
import {
  DEFAULT_STUDIO_BOOK_LAYOUT_SPEC,
  describeBookLayoutSpec,
  readStudioBookLayoutSpecDraft,
  resetStudioBookLayoutSpecDraft,
  resolveBookPrintRequest,
  writeStudioBookLayoutSpecDraft,
} from "./studio-export-book-spec";

afterEach(() => {
  resetStudioBookLayoutSpecDraft();
});

describe("resolveBookPrintRequest", () => {
  it("비활성이면 undefined — 호출자가 book 키를 생략해 기존 경로를 탄다", () => {
    expect(resolveBookPrintRequest(DEFAULT_STUDIO_BOOK_LAYOUT_SPEC)).toBeUndefined();
    expect(
      resolveBookPrintRequest({ ...DEFAULT_STUDIO_BOOK_LAYOUT_SPEC, presetId: "b6" })
    ).toBeUndefined();
  });

  it("활성이면 프리셋 스펙을 그대로 빌더 요청으로 옮긴다", () => {
    const request = resolveBookPrintRequest({
      enabled: true,
      presetId: "b6",
      cropMarks: false,
      dpi: 150,
    });
    expect(request).toEqual({
      spec: BOOK_TRIM_PRESETS[1].spec,
      presetId: "b6",
      cropMarks: false,
      dpi: 150,
    });
  });

  it("모르는 프리셋 id는 첫 프리셋으로 폴백한다", () => {
    const request = resolveBookPrintRequest({
      enabled: true,
      presetId: "gone",
      cropMarks: true,
      dpi: 300,
    });
    expect(request?.presetId).toBe(BOOK_TRIM_PRESETS[0].id);
    expect(request?.spec).toBe(BOOK_TRIM_PRESETS[0].spec);
  });
});

describe("describeBookLayoutSpec / 초안", () => {
  it("요약에 판형·도련·마크·dpi가 들어간다", () => {
    expect(describeBookLayoutSpec(DEFAULT_STUDIO_BOOK_LAYOUT_SPEC)).toBe(
      "신국판 (152×225) · 152×225mm · 도련 3mm · 안전 여백 12mm · 재단 마크 · 300dpi"
    );
  });

  it("초안은 쓰기 전 null, 쓴 뒤 같은 값, 리셋하면 null", () => {
    expect(readStudioBookLayoutSpecDraft()).toBeNull();
    writeStudioBookLayoutSpecDraft(DEFAULT_STUDIO_BOOK_LAYOUT_SPEC);
    expect(readStudioBookLayoutSpecDraft()).toEqual(DEFAULT_STUDIO_BOOK_LAYOUT_SPEC);
    resetStudioBookLayoutSpecDraft();
    expect(readStudioBookLayoutSpecDraft()).toBeNull();
  });
});
