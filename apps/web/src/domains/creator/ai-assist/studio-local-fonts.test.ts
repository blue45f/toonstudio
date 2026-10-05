import { describe, expect, it, vi } from "vitest";

import {
  isLocalFontAccessSupported,
  listLocalFontFamilies,
  loadLocalFontFace,
  localFontFamilyStack,
  type LocalFontDataLike,
} from "./studio-local-fonts";

// Local Font Access의 판정·열거·등록 계약을 고정한다.
// 미지원·거부·실패는 서로 다른 결과로 구분되고, 빈 목록으로 위장하지 않는다.

function fontData(family: string, style = "Regular"): LocalFontDataLike {
  return {
    family,
    style,
    fullName: `${family} ${style}`,
    blob: async () => new Blob([`font:${family}:${style}`], { type: "font/otf" }),
  };
}

describe("isLocalFontAccessSupported", () => {
  it("queryLocalFonts가 있을 때만 지원으로 판정한다", () => {
    expect(isLocalFontAccessSupported({ queryLocalFonts: async () => [] })).toBe(true);
    expect(isLocalFontAccessSupported({})).toBe(false);
    expect(isLocalFontAccessSupported(null)).toBe(false);
  });
});

describe("listLocalFontFamilies", () => {
  it("미지원 환경은 unsupported다", async () => {
    await expect(listLocalFontFamilies({})).resolves.toEqual({ kind: "unsupported" });
  });

  it("패밀리로 묶고 중복을 제거해 정렬한다", async () => {
    const result = await listLocalFontFamilies({
      queryLocalFonts: async () => [
        fontData("산돌고딕", "Bold"),
        fontData("나눔고딕"),
        fontData("산돌고딕"),
        fontData("  "),
        fontData("Pretendard"),
      ],
    });
    expect(result.kind).toBe("ok");
    if (result.kind === "ok") {
      // 한국어 collation 기준 정렬 — 한글이 라틴보다 앞에 온다.
      expect(result.families).toEqual(["나눔고딕", "산돌고딕", "Pretendard"]);
    }
  });

  it("권한 거부는 denied, 그 밖의 실패는 failed로 구분한다", async () => {
    await expect(
      listLocalFontFamilies({
        queryLocalFonts: async () => {
          throw new DOMException("permission denied", "NotAllowedError");
        },
      }),
    ).resolves.toEqual({ kind: "denied" });
    const failed = await listLocalFontFamilies({
      queryLocalFonts: async () => {
        throw new Error("boom");
      },
    });
    expect(failed).toEqual({ kind: "failed", message: "boom" });
  });
});

describe("localFontFamilyStack", () => {
  it("패밀리명을 인용해 스택을 만든다", () => {
    expect(localFontFamilyStack("산돌고딕")).toBe('"산돌고딕", sans-serif');
    expect(localFontFamilyStack('Weird "Font"')).toBe('"Weird \\"Font\\"", sans-serif');
  });
});

describe("loadLocalFontFace", () => {
  it("Regular 스타일을 우선해 FontFace를 등록한다", async () => {
    const added: unknown[] = [];
    class FakeFontFace {
      loadedFamily = "";
      constructor(
        public family: string,
        public source: ArrayBuffer,
      ) {
        this.loadedFamily = family;
      }
      async load(): Promise<this> {
        return this;
      }
    }
    const bold = fontData("산돌고딕", "Bold");
    const regular = fontData("산돌고딕", "Regular");
    const regularBlobSpy = vi.spyOn(regular, "blob");
    const boldBlobSpy = vi.spyOn(bold, "blob");
    const ok = await loadLocalFontFace("산돌고딕", {
      targetWindow: { queryLocalFonts: async () => [bold, regular] },
      targetDocument: { fonts: { add: (face) => added.push(face) } },
      fontFaceCtor: FakeFontFace,
    });
    expect(ok).toBe(true);
    expect(added).toHaveLength(1);
    expect(regularBlobSpy).toHaveBeenCalledTimes(1);
    expect(boldBlobSpy).not.toHaveBeenCalled();
  });

  it("대상 패밀리가 없거나 미지원이면 false다", async () => {
    class FakeFontFace {
      constructor(
        public family: string,
        public source: ArrayBuffer,
      ) {}
      async load(): Promise<this> {
        return this;
      }
    }
    const doc = { fonts: { add: () => undefined } };
    await expect(
      loadLocalFontFace("없는폰트", {
        targetWindow: { queryLocalFonts: async () => [fontData("다른폰트")] },
        targetDocument: doc,
        fontFaceCtor: FakeFontFace,
      }),
    ).resolves.toBe(false);
    await expect(
      loadLocalFontFace("산돌고딕", { targetWindow: {}, targetDocument: doc, fontFaceCtor: FakeFontFace }),
    ).resolves.toBe(false);
  });
});
