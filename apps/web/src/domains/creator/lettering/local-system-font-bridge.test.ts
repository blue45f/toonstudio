import { describe, expect, it, vi } from "vitest";

import {
  buildLocalFontRightsBomRecord,
  classifyLetteringFontScriptGroup,
  formatLetteringCssFontFamily,
  loadLocalSystemFontsForLettering,
  LOCAL_SYSTEM_FONT_RIGHTS_WARNING_EN,
  LOCAL_SYSTEM_FONT_RIGHTS_WARNING_KO,
  WEB_SAFE_KOREAN_FALLBACK_FONTS,
  type LocalFontDataLike,
} from "./local-system-font-bridge";

function localFont(
  family: string,
  style = "Regular",
  postscriptName?: string,
  fullName?: string,
): LocalFontDataLike {
  return {
    family,
    style,
    postscriptName: postscriptName ?? `${family.replace(/\s+/gu, "")}-${style}`,
    fullName: fullName ?? `${family} ${style}`,
  };
}

describe("loadLocalSystemFontsForLettering", () => {
  it("queryLocalFonts 결과를 한글·영문 패밀리별로 중복 제거·정렬하고 Rights BOM 상업 경고를 부착한다", async () => {
    const queryLocalFonts = vi.fn(async () => [
      localFont("Helvetica Neue", "Bold"),
      localFont("산돌고딕", "Bold"),
      localFont("나눔고딕", "Regular"),
      localFont("산돌고딕", "Regular"),
      localFont("helvetica neue", "Regular"),
      localFont("   "),
      localFont("Arial", "Regular"),
      localFont("Pretendard", "Medium"),
    ]);

    const result = await loadLocalSystemFontsForLettering({
      targetWindow: { queryLocalFonts },
    });

    expect(queryLocalFonts).toHaveBeenCalledTimes(1);
    expect(result.status).toBe("loaded");
    expect(result.supported).toBe(true);
    expect(result.usedFallback).toBe(false);
    expect(result.errorMessage).toBeNull();
    expect(result.unverifiedLocalFontCount).toBe(5);
    expect(result.rightsWarningBannerKo).toBe(LOCAL_SYSTEM_FONT_RIGHTS_WARNING_KO);
    expect(result.rightsWarningBannerEn).toBe(LOCAL_SYSTEM_FONT_RIGHTS_WARNING_EN);

    // 한글(한국어 스크립트 힌트 포함) 패밀리가 먼저 오고, 영문 패밀리가 뒤에 알파벳순 정렬된다.
    expect(result.fonts.map((font) => font.family)).toEqual([
      "나눔고딕",
      "산돌고딕",
      "Pretendard",
      "Arial",
      "Helvetica Neue",
    ]);

    // 동일 패밀리의 굵기·스타일은 하나로 병합된다.
    const sandoll = result.fonts.find((font) => font.family === "산돌고딕");
    expect(sandoll?.styles).toEqual(["Bold", "Regular"]);
    expect(sandoll?.cssFontFamily).toBe('"산돌고딕", sans-serif');

    // 모든 로컬 PC 시스템 폰트는 상업 라이선스 미검증(false)과 KO/EN 경고 메타데이터를 가진다.
    for (const font of result.fonts) {
      expect(font.source).toBe("local-system");
      expect(font.commercialLicenseVerified).toBe(false);
      expect(font.rightsBom.origin).toBe("local-system");
      expect(font.rightsBom.commercialLicenseVerified).toBe(false);
      expect(font.rightsBom.licenseCode).toBe("UNKNOWN-LOCAL-SYSTEM");
      expect(font.rightsBom.requiresExportReview).toBe(true);
      expect(font.rightsBom.blocksCommercialExportByDefault).toBe(true);
      expect(font.rightsBom.warningKo).toBe(
        "로컬 PC 시스템 폰트 — 상업 연재 출고 전 라이선스 확인 필요",
      );
      expect(font.rightsBom.warningEn).toBe(LOCAL_SYSTEM_FONT_RIGHTS_WARNING_EN);
    }
  });

  it("미지원 브라우저에서는 상업 검증 완료 표준 한글 폰트 폴백 목록을 반환한다", async () => {
    const result = await loadLocalSystemFontsForLettering({
      targetWindow: {},
    });

    expect(result.status).toBe("unsupported");
    expect(result.supported).toBe(false);
    expect(result.usedFallback).toBe(true);
    expect(result.unverifiedLocalFontCount).toBe(0);
    expect(result.rightsWarningBannerKo).toBeNull();
    expect(result.rightsWarningBannerEn).toBeNull();
    expect(result.fonts).toEqual(WEB_SAFE_KOREAN_FALLBACK_FONTS);
    expect(result.fonts.length).toBeGreaterThanOrEqual(4);

    for (const font of result.fonts) {
      expect(font.source).toBe("web-safe-fallback");
      expect(font.commercialLicenseVerified).toBe(true);
      expect(font.rightsBom.licenseCode).toBe("OFL-1.1");
      expect(font.rightsBom.blocksCommercialExportByDefault).toBe(false);
      expect(font.rightsBom.warningKo).toBeNull();
    }
  });

  it("권한 거부(NotAllowedError)·런타임 오류·빈 결과 시에도 안전하게 폴백 목록으로 전환한다", async () => {
    const denied = await loadLocalSystemFontsForLettering({
      targetWindow: {
        queryLocalFonts: async () => {
          throw new DOMException("User denied permission", "NotAllowedError");
        },
      },
    });
    expect(denied.status).toBe("denied");
    expect(denied.supported).toBe(true);
    expect(denied.usedFallback).toBe(true);
    expect(denied.errorMessage).toContain("권한");
    expect(denied.fonts).toEqual(WEB_SAFE_KOREAN_FALLBACK_FONTS);

    const errored = await loadLocalSystemFontsForLettering({
      targetWindow: {
        queryLocalFonts: async () => {
          throw new Error("Font enumeration timeout");
        },
      },
    });
    expect(errored.status).toBe("error");
    expect(errored.usedFallback).toBe(true);
    expect(errored.errorMessage).toBe("Font enumeration timeout");
    expect(errored.fonts).toEqual(WEB_SAFE_KOREAN_FALLBACK_FONTS);

    const empty = await loadLocalSystemFontsForLettering({
      targetWindow: {
        queryLocalFonts: async () => [localFont("   ")],
      },
    });
    expect(empty.status).toBe("empty");
    expect(empty.usedFallback).toBe(true);
    expect(empty.fonts).toEqual(WEB_SAFE_KOREAN_FALLBACK_FONTS);
  });

  it("검색 필터·최대 개수·웹 안전 폴백 병합 옵션을 지원한다", async () => {
    const result = await loadLocalSystemFontsForLettering({
      targetWindow: {
        queryLocalFonts: async () => [localFont("산돌고딕"), localFont("Pretendard")],
      },
      includeWebSafeFallback: true,
      search: "나눔",
      maxEntries: 2,
    });

    expect(result.status).toBe("loaded");
    expect(result.fonts).toHaveLength(2);
    expect(result.fonts.every((font) => font.displayName.includes("나눔"))).toBe(true);
    expect(result.unverifiedLocalFontCount).toBe(0);
    expect(result.rightsWarningBannerKo).toBeNull();
  });
});

describe("buildLocalFontRightsBomRecord & 보조 유틸리티", () => {
  it("로컬 PC 시스템 폰트는 fail-closed Rights BOM 레코드(UNKNOWN / 미검증)를 생성한다", async () => {
    const loaded = await loadLocalSystemFontsForLettering({
      targetWindow: {
        queryLocalFonts: async () => [localFont("윤고딕 740", "Regular")],
      },
    });
    const localEntry = loaded.fonts[0];
    expect(localEntry).toBeDefined();
    if (!localEntry) return;

    const bomRecord = buildLocalFontRightsBomRecord(localEntry, ["cut-003", "cut-019"]);
    expect(bomRecord.category).toBe("font");
    expect(bomRecord.licenseCode).toBe("UNKNOWN");
    expect(bomRecord.commercialAllowed).toBe(false);
    expect(bomRecord.commercialLicenseVerified).toBe(false);
    expect(bomRecord.verified).toBe(false);
    expect(bomRecord.warningKo).toBe(LOCAL_SYSTEM_FONT_RIGHTS_WARNING_KO);
    expect(bomRecord.warningEn).toBe(LOCAL_SYSTEM_FONT_RIGHTS_WARNING_EN);
    expect(bomRecord.usedInCutIds).toEqual(["cut-003", "cut-019"]);
  });

  it("웹 안전 폴백 폰트는 OFL-1.1 상업 허용 Rights BOM 레코드를 생성한다", () => {
    const fallbackEntry = WEB_SAFE_KOREAN_FALLBACK_FONTS[0];
    expect(fallbackEntry).toBeDefined();
    if (!fallbackEntry) return;

    const bomRecord = buildLocalFontRightsBomRecord(fallbackEntry, ["cut-001"]);
    expect(bomRecord.category).toBe("font");
    expect(bomRecord.licenseCode).toBe("OFL-1.1");
    expect(bomRecord.commercialAllowed).toBe(true);
    expect(bomRecord.commercialLicenseVerified).toBe(true);
    expect(bomRecord.verified).toBe(true);
    expect(bomRecord.warningKo).toBeNull();
    expect(bomRecord.warningEn).toBeNull();
  });

  it("CSS font-family 인용과 한글/영문 스크립트 분류를 정확히 수행한다", () => {
    expect(formatLetteringCssFontFamily('Comic "Bold" \\ 1')).toBe(
      '"Comic \\"Bold\\" \\\\ 1", sans-serif',
    );
    expect(classifyLetteringFontScriptGroup("산돌고딕")).toBe("korean");
    expect(classifyLetteringFontScriptGroup("Noto Sans KR")).toBe("korean");
    expect(classifyLetteringFontScriptGroup("Roboto")).toBe("latin-other");
  });
});
