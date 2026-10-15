import { afterEach, describe, expect, it } from "vitest";

import { DEFAULT_BOOK_FOLIO } from "./studio-book-binding";
import { BOOK_TRIM_PRESETS } from "./studio-book-layout-model";
import {
  applyBookBindingPreset,
  DEFAULT_STUDIO_BOOK_LAYOUT_SPEC,
  describeBookLayoutSpec,
  matchesBookBindingPreset,
  readStudioBookLayoutSpecDraft,
  resetStudioBookLayoutSpecDraft,
  resolveBookBindingLayout,
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

describe("책 구성 — 여백 안에 맞춤·쪽 번호·표지", () => {
  const on = { ...DEFAULT_STUDIO_BOOK_LAYOUT_SPEC, enabled: true };

  it("구성 필드를 하나도 켜지 않으면 binding 키가 요청에 없다(기존 요청 모양 그대로)", () => {
    expect(resolveBookBindingLayout(on)).toBeUndefined();
    expect(resolveBookBindingLayout({ ...on, placement: "full-bleed", folio: false, cover: false })).toBeUndefined();
    expect(resolveBookPrintRequest(on)).not.toHaveProperty("binding");
  });

  it("켠 항목만 binding으로 옮기고 지은이는 공백을 다듬는다", () => {
    expect(resolveBookBindingLayout({ ...on, placement: "inside-safe" })).toEqual({ placement: "inside-safe" });
    expect(resolveBookBindingLayout({ ...on, folio: true })).toEqual({ folio: DEFAULT_BOOK_FOLIO });
    expect(resolveBookBindingLayout({ ...on, cover: true })).toEqual({ cover: {} });
    expect(resolveBookBindingLayout({ ...on, cover: true, coverAuthor: "  홍길동 " })).toEqual({ cover: { author: "홍길동" } });
    // 표지를 끄면 지은이는 무시된다.
    expect(resolveBookBindingLayout({ ...on, cover: false, coverAuthor: "홍길동" })).toBeUndefined();
  });

  it("비활성이면 구성 필드가 있어도 요청을 만들지 않는다", () => {
    expect(resolveBookPrintRequest({ ...DEFAULT_STUDIO_BOOK_LAYOUT_SPEC, placement: "inside-safe", folio: true, cover: true })).toBeUndefined();
  });

  it("A5 세로 제본 책 프리셋: A5 판형 + 마크 + 300dpi + 구성 세 가지를 한 번에 맞춘다", () => {
    const applied = applyBookBindingPreset({ ...DEFAULT_STUDIO_BOOK_LAYOUT_SPEC, cropMarks: false, dpi: 150 }, "a5-portrait-book");
    expect(applied).toMatchObject({
      enabled: true, presetId: "a5", cropMarks: true, dpi: 300, placement: "inside-safe", folio: true, cover: true,
    });
    const request = resolveBookPrintRequest(applied);
    expect(request?.presetId).toBe("a5");
    expect(request?.spec).toMatchObject({ trimWidthMm: 148, trimHeightMm: 210 });
    expect(request?.binding).toEqual({ placement: "inside-safe", folio: DEFAULT_BOOK_FOLIO, cover: {} });
    expect(describeBookLayoutSpec(applied)).toBe(
      "A5 (148×210) · 148×210mm · 도련 3mm · 안전 여백 11mm · 재단 마크 · 300dpi · 여백 안에 맞춤 · 쪽 번호 · 표지"
    );
  });

  it("프리셋 눌림 표시: 같은 구성이면 true, 한 항목이라도 바꾸면 false, 모르는 id는 상태를 그대로 둔다", () => {
    const applied = applyBookBindingPreset(DEFAULT_STUDIO_BOOK_LAYOUT_SPEC, "a5-portrait-book");
    expect(matchesBookBindingPreset(applied, "a5-portrait-book")).toBe(true);
    expect(matchesBookBindingPreset({ ...applied, coverAuthor: "홍길동" }, "a5-portrait-book")).toBe(true);
    expect(matchesBookBindingPreset({ ...applied, folio: false }, "a5-portrait-book")).toBe(false);
    expect(matchesBookBindingPreset({ ...applied, presetId: "b6" }, "a5-portrait-book")).toBe(false);
    expect(matchesBookBindingPreset({ ...applied, enabled: false }, "a5-portrait-book")).toBe(false);
    expect(matchesBookBindingPreset(applied, "nope")).toBe(false);
    expect(applyBookBindingPreset(DEFAULT_STUDIO_BOOK_LAYOUT_SPEC, "nope")).toBe(DEFAULT_STUDIO_BOOK_LAYOUT_SPEC);
  });
});
