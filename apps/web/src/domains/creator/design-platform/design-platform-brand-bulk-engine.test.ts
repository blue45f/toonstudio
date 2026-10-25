import { describe, expect, it } from "vitest";

import {
  auditDesignPlatformPreflight,
  buildGoodsMockupSpec,
  computeWcagContrastRatio,
  DESIGN_PLATFORM_GOODS_MOCKUPS,
  DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS,
  evaluateBrandGuardrailCompliance,
  generateBulkEpisodeArtifacts,
  shuffleSeriesStylePack,
} from "./design-platform-brand-bulk-engine";

describe("design-platform-brand-bulk-engine", () => {
  it("시리즈 스타일 팩을 원클릭 순환 셔플하고 WCAG 2.1 명암비를 정확히 계산한다", () => {
    const first = DESIGN_PLATFORM_STYLE_SHUFFLE_PACKS[0]!;
    const second = shuffleSeriesStylePack(first.id);
    expect(second.id).not.toBe(first.id);

    const contrast = computeWcagContrastRatio(
      first.palette.primaryText,
      first.palette.canvasBg,
    );
    expect(contrast).toBeGreaterThanOrEqual(4.5);
  });

  it("망고보드 권한 모드(777/774/770)와 어도비 익스프레스 브랜드 잠금 가드레일을 검증한다", () => {
    const policy = {
      seriesTitle: "회귀자의 시계탑",
      permissionFlag: "774" as const,
      lockTitleLogoPosition: true,
      requireAgeRatingBadge: true,
      requireCopyrightNotice: true,
      enforceBrandPaletteOnly: true,
      allowedPaletteHexes: ["#160F29", "#FFFBEB", "#F59E0B"],
    };

    // 774 모드에서 일반 팀원은 보기는 가능하나 편집이 차단된다
    const memberAudit = evaluateBrandGuardrailCompliance({
      policy,
      collaboratorRole: "team-member",
      titleLogoMoved: true,
      hasAgeRatingBadge: true,
      hasCopyrightNotice: true,
      usedColorsHex: ["#FF00FF"],
    });
    expect(memberAudit.canView).toBe(true);
    expect(memberAudit.canEdit).toBe(false);
    expect(memberAudit.compliant).toBe(false);
    expect(memberAudit.violations.length).toBeGreaterThanOrEqual(3);

    // 대표 작가(owner)가 가드레일을 모두 준수한 경우 통과한다
    const ownerAudit = evaluateBrandGuardrailCompliance({
      policy,
      collaboratorRole: "owner",
      titleLogoMoved: false,
      hasAgeRatingBadge: true,
      hasCopyrightNotice: true,
      usedColorsHex: ["#F59E0B"],
    });
    expect(ownerAudit.canEdit).toBe(true);
    expect(ownerAudit.compliant).toBe(true);
  });

  it("캔바 Bulk Create 방식 회차 테이블로부터 Polotno 호환 다중 페이지 문서를 생성한다", () => {
    const manifest = generateBulkEpisodeArtifacts(
      {
        seriesTitle: "회귀자의 시계탑",
        formatId: "insta-cuttoon-4x5",
        stylePackId: "rofan-imperial-velvet",
        titlePattern: "{{seriesTitle}} {{episodePad}}화",
        subtitlePattern: "{{episodeTitle}} · {{featuredCharacter}}",
        hookPattern: "{{hookCopy}}",
        copyrightLine: "© 2026 ToonStudio",
      },
      [
        {
          episodeNumber: 1,
          episodeTitle: "시계탑의 밤",
          hookCopy: "이번 생에는 절대 늦지 않아.",
          releaseDate: "2026-10-26",
          featuredCharacter: "카셀",
          ageRating: "15+",
        },
        {
          episodeNumber: 2,
          episodeTitle: "황금빛 계약",
          hookCopy: "네가 원하는 대가를 말해 봐.",
          releaseDate: "2026-11-02",
          featuredCharacter: "세르피나",
          ageRating: "15+",
        },
      ],
    );

    expect(manifest.totalGenerated).toBe(2);
    expect(manifest.polotnoDocument.pages).toHaveLength(2);
    expect(manifest.polotnoDocument.pages[0]?.children.length).toBe(5);
    expect(manifest.cards[0]?.resolvedTitle).toBe("회귀자의 시계탑 01화");
  });

  it("키틀·미리캔버스 5종 IP 굿즈 인쇄·칼선 목업 사양과 상업용 프리플라이트 감사를 수행한다", () => {
    expect(DESIGN_PLATFORM_GOODS_MOCKUPS).toHaveLength(5);
    const acrylic = buildGoodsMockupSpec("acrylic-stand-diorama");
    expect(acrylic.preset.dieCutMarginMm).toBe(2.5);
    expect(acrylic.whiteUnderbaseLayerName).toBe("WHITE_UNDERBASE_MASK");

    const blockedReport = auditDesignPlatformPreflight({
      formatId: "print-a5-spread",
      actualDpi: 150,
      actualColorSpace: "sRGB",
      actualBleedMm: 0,
      hasUnlicensedExternalFont: true,
      hasDraftWatermark: true,
      foregroundHex: "#777777",
      backgroundHex: "#888888",
      safeZoneClippedLayerCount: 2,
    });
    expect(blockedReport.overallStatus).toBe("blocked");
    expect(blockedReport.remediations.length).toBeGreaterThanOrEqual(5);
  });
});
