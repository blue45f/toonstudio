// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  SHORTFORM_TEASER_HEIGHT_PX,
  SHORTFORM_TEASER_WIDTH_PX,
  buildMultichannelFinishPackBundle,
  buildRightsBomReport,
  buildWcagAltPack,
  createDefaultMultichannelFinishPackInput,
} from "./multichannel-finish-pack-builder";
import { StudioPublishMarketingPackPanel } from "./StudioPublishMarketingPackPanel";

afterEach(cleanup);

describe("축 30 · 1화 완료 멀티채널 마감 팩 빌더 (multichannel-finish-pack-builder)", () => {
  it("9:16 숏폼 티저(1080×1920), 대표 썸네일 3종(1:1·16:9·3:4), WCAG ALT, Rights BOM을 일괄 산출한다", () => {
    const input = createDefaultMultichannelFinishPackInput("proj-ep1", "유리시계 <공작가>", 1);
    const bundle = buildMultichannelFinishPackBundle(input);

    // 1) 9:16 숏폼 티저
    expect(bundle.shortformTeaser9x16.widthPx).toBe(SHORTFORM_TEASER_WIDTH_PX);
    expect(bundle.shortformTeaser9x16.heightPx).toBe(SHORTFORM_TEASER_HEIGHT_PX);
    expect(bundle.shortformTeaser9x16.aspectRatio).toBe("9:16");
    expect(bundle.shortformTeaser9x16.beats).toHaveLength(4);
    expect(bundle.shortformTeaser9x16.posterSvgMarkup).toContain("유리시계 &lt;공작가&gt;");
    expect(bundle.shortformTeaser9x16.posterSvgMarkup).not.toContain("<공작가>");

    // 2) 대표 썸네일 3종
    expect(bundle.thumbnails).toHaveLength(3);
    expect(bundle.thumbnails.map((t) => `${t.aspectRatio}:${t.widthPx}x${t.heightPx}`)).toEqual([
      "1:1:600x600",
      "16:9:1280x720",
      "3:4:720x960",
    ]);
    for (const thumb of bundle.thumbnails) {
      expect(thumb.wcagContrastPass).toBe(true);
      expect(thumb.svgMarkup).toContain(`width="${thumb.widthPx}" height="${thumb.heightPx}"`);
      expect(thumb.svgDataUrl.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    }

    // 3) WCAG 2.1 AA ALT
    expect(bundle.wcagAltPack.standard).toBe("WCAG 2.1 AA");
    expect(bundle.wcagAltPack.coveragePercent).toBe(100);
    expect(bundle.wcagAltPack.complianceLevel).toBe("AA");
    expect(bundle.wcagAltPack.entries).toHaveLength(input.cuts.length);

    // 4) Rights BOM (CC-BY 배경 1종 포함 → approved-with-credits)
    expect(bundle.rightsBomReport.exportGateStatus).toBe("approved-with-credits");
    expect(bundle.rightsBomReport.exportAllowed).toBe(true);
    expect(bundle.rightsBomReport.compiledCreditsKo.length).toBeGreaterThan(0);
    expect(bundle.rightsBomReport.manifestChecksum).toMatch(/^[0-9a-f]{8}$/);
    expect(bundle.bundleExportAllowed).toBe(true);
    expect(bundle.readinessScore).toBe(100);
    expect(bundle.deliverableFiles).toHaveLength(7);
  });

  it("미검증·비상업 에셋이 포함되면 Rights BOM 게이트가 출고를 차단하고 사유를 기록한다", () => {
    const base = createDefaultMultichannelFinishPackInput("proj-block", "차단 검증작", 1);
    const withBlocked = {
      ...base,
      assets: [
        ...base.assets,
        {
          assetId: "font-bad",
          name: "비상업 테스트 폰트",
          category: "font" as const,
          licenseTier: "editorial-only" as const,
          sourceVendor: "Demo Foundry",
          commercialUseAllowed: false,
          redistributableInExport: false,
        },
      ],
    };

    const bom = buildRightsBomReport(withBlocked);
    expect(bom.exportGateStatus).toBe("blocked");
    expect(bom.exportAllowed).toBe(false);
    expect(bom.blockedCount).toBe(1);
    expect(bom.blockingReasonsKo[0]).toContain("비상업 테스트 폰트");

    const bundle = buildMultichannelFinishPackBundle(withBlocked);
    expect(bundle.bundleExportAllowed).toBe(false);
    expect(bundle.readinessScore).toBeLessThan(60);
  });

  it("장면 설명과 대사가 비어 있는 컷은 WCAG ALT 경고를 발생시킨다", () => {
    const base = createDefaultMultichannelFinishPackInput("proj-alt", "ALT 테스트", 1);
    const sparse = {
      ...base,
      cuts: [
        {
          cutId: "cut-empty",
          cutIndex: 1,
          sceneSummaryKo: "문",
          dialogueText: "",
          sfxText: "",
          characterNames: [],
          visualMoodKo: "",
          tensionScore: 30,
          has3dBackground: false,
        },
      ],
    };
    const alt = buildWcagAltPack(sparse);
    expect(alt.warningCount).toBe(1);
    expect(alt.complianceLevel).toBe("needs-review");
    expect(alt.entries[0]?.wcagStatus).toBe("warning");
  });

  it("StudioPublishMarketingPackPanel '멀티채널 마감 팩' 탭에서 Rights BOM 차단 토글이 출고 버튼을 잠근다", () => {
    render(
      <StudioPublishMarketingPackPanel
        projectId="proj-finish-ui"
        seriesTitle="밤의 우편배달부"
        episodeNumber={1}
      />,
    );

    fireEvent.click(screen.getByTestId("marketing-pack-tab-finish-pack"));
    expect(screen.getByTestId("multichannel-finish-pack-tabpanel")).toBeTruthy();
    expect(screen.getByTestId("finish-pack-teaser-preview")).toBeTruthy();
    expect(screen.getByTestId("finish-pack-thumb-square-1x1")).toBeTruthy();
    expect(screen.getByTestId("finish-pack-thumb-banner-16x9")).toBeTruthy();
    expect(screen.getByTestId("finish-pack-thumb-poster-3x4")).toBeTruthy();
    expect(screen.getByTestId("finish-pack-rights-gate-badge").textContent).toContain("출고 승인");

    const downloadBtn = screen.getByTestId("finish-pack-download-bundle-btn");
    expect(downloadBtn.hasAttribute("disabled")).toBe(false);

    // 미검증 폰트 주입 토글 → Rights BOM 차단 및 번들 다운로드 비활성화
    fireEvent.click(screen.getByTestId("finish-pack-toggle-unverified-asset"));
    expect(screen.getByTestId("finish-pack-rights-gate-badge").textContent).toContain("출고 차단");
    expect(screen.getByTestId("finish-pack-rights-block-alert")).toBeTruthy();
    expect(downloadBtn.hasAttribute("disabled")).toBe(true);
  });
});
