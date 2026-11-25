// @vitest-environment jsdom

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_READER_CUTS,
  MANUSCRIPT_WIDTH_PRESETS,
  MOBILE_DEVICE_IDS,
  MOBILE_DEVICE_PROFILES,
  READABILITY_MIN_EFFECTIVE_FONT_PX,
  READER_PLATFORM_IDS,
  READER_PLATFORM_PROFILES,
  StudioMobileReaderPreviewPanel,
  auditMobileReaderCuts,
  autoFixMobileReaderCuts,
  buildMobilePreviewSvg,
  calculateViewportGeometry,
  createDefaultReaderCuts,
  exportMobileReaderAuditJson,
  formatReadDuration,
  getMobileDeviceProfile,
  getReaderPlatformProfile,
  type MobileReaderCutInput,
} from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function makeCut(overrides: Partial<MobileReaderCutInput> & { readonly id: string }): MobileReaderCutInput {
  return {
    id: overrides.id,
    labelKo: overrides.labelKo ?? `검증 컷 ${overrides.id}`,
    labelEn: overrides.labelEn ?? `Audit Cut ${overrides.id}`,
    cutHeightPx: overrides.cutHeightPx ?? 640,
    gutterAfterPx: overrides.gutterAfterPx ?? 200,
    bubbleFontPx: overrides.bubbleFontPx ?? 28,
    dialogueCharCount: overrides.dialogueCharCount ?? 20,
    backgroundTone: overrides.backgroundTone ?? "tinted",
    edgeTreatment: overrides.edgeTreatment ?? "soft-vignette",
    captionPlacement: overrides.captionPlacement ?? "middle",
  };
}

describe("1. 실기기 4종 · 플랫폼 3종 · 실제 가시 뷰포트 기하학", () => {
  it("4대 실기기 프로필(iPhone SE/Galaxy S25/iPhone 16 Pro Max/iPad mini)이 정확한 CSS 폭·높이·노치 스펙을 제공한다", () => {
    expect(MOBILE_DEVICE_IDS).toEqual([
      "iphone-se-375",
      "galaxy-s25-390",
      "iphone-16-promax-430",
      "ipad-mini-744",
    ]);
    expect(MOBILE_DEVICE_PROFILES).toHaveLength(4);

    const se = getMobileDeviceProfile("iphone-se-375");
    expect(se.cssWidthPx).toBe(375);
    expect(se.cssHeightPx).toBe(667);
    expect(se.topSafeAreaPx).toBe(20);
    expect(se.bottomHomeIndicatorPx).toBe(0);

    const s25 = getMobileDeviceProfile("galaxy-s25-390");
    expect(s25.cssWidthPx).toBe(390);
    expect(s25.notchKind).toBe("punch-hole");

    const pm = getMobileDeviceProfile("iphone-16-promax-430");
    expect(pm.cssWidthPx).toBe(430);
    expect(pm.notchKind).toBe("dynamic-island");
    expect(pm.topSafeAreaPx).toBeGreaterThan(s25.topSafeAreaPx);

    const ipad = getMobileDeviceProfile("ipad-mini-744");
    expect(ipad.cssWidthPx).toBe(744);
    expect(ipad.formFactor).toBe("tablet");
  });

  it("3대 플랫폼 크롬(네이버·카카오·글로벌)이 고유한 상/하단 네비게이션 및 댓글바 높이와 권장 원고 폭을 갖는다", () => {
    expect(READER_PLATFORM_IDS).toEqual(["naver-webtoon", "kakao-page", "global-vertical"]);
    expect(READER_PLATFORM_PROFILES).toHaveLength(3);
    expect(MANUSCRIPT_WIDTH_PRESETS).toEqual([690, 800, 1080]);

    const naver = getReaderPlatformProfile("naver-webtoon");
    const kakao = getReaderPlatformProfile("kakao-page");
    const global = getReaderPlatformProfile("global-vertical");

    expect(naver.recommendedManuscriptWidthPx).toBe(800);
    expect(kakao.recommendedManuscriptWidthPx).toBe(690);
    expect(global.recommendedManuscriptWidthPx).toBe(1080);
    expect(kakao.bottomChromeHeightPx).toBeGreaterThan(naver.bottomChromeHeightPx);
    expect(kakao.commentBarHeightPx).toBeGreaterThan(global.commentBarHeightPx);
  });

  it("calculateViewportGeometry는 상단 안전영역+크롬과 하단 댓글바+홈인디케이터를 차감한 실제 컷 가시 높이를 계산한다", () => {
    const withChrome = calculateViewportGeometry("iphone-16-promax-430", "kakao-page", true);
    expect(withChrome.topObstructedPx).toBe(59 + 52);
    expect(withChrome.bottomObstructedPx).toBe(34 + 64);
    expect(withChrome.visibleViewportHeightPx).toBe(932 - 111 - 98);

    const hiddenChrome = calculateViewportGeometry("iphone-16-promax-430", "kakao-page", false);
    expect(hiddenChrome.topChromeHeightPx).toBe(0);
    expect(hiddenChrome.bottomChromeHeightPx).toBe(0);
    expect(hiddenChrome.visibleViewportHeightPx).toBeGreaterThan(withChrome.visibleViewportHeightPx);
  });

  it("4대 기기 × 3대 플랫폼 모든 12개 조합에서 가시 뷰포트 비율이 유효(50%~98%)하다", () => {
    for (const deviceId of MOBILE_DEVICE_IDS) {
      for (const platformId of READER_PLATFORM_IDS) {
        const vp = calculateViewportGeometry(deviceId, platformId, true);
        expect(vp.visibleViewportHeightPx).toBeGreaterThanOrEqual(450);
        expect(vp.usableViewportRatioPct).toBeGreaterThan(50);
        expect(vp.usableViewportRatioPct).toBeLessThan(98);
      }
    }
  });

  it("원고 폭(690/800/1080px) 대비 다운스케일 배율이 기기 폭에 따라 단조 증가하며 태블릿에서도 1.0을 넘지 않는다", () => {
    for (const widthPx of MANUSCRIPT_WIDTH_PRESETS) {
      const ratios = MOBILE_DEVICE_IDS.map(
        (deviceId) =>
          auditMobileReaderCuts({
            cuts: [makeCut({ id: "c1" })],
            deviceId,
            manuscriptWidthPx: widthPx,
          }).summary.downscaleRatio,
      );
      expect(ratios[0] ?? 0).toBeLessThan(ratios[1] ?? 0);
      expect(ratios[1] ?? 0).toBeLessThan(ratios[2] ?? 0);
      expect(ratios[2] ?? 0).toBeLessThan(ratios[3] ?? 0);
      expect(ratios[3] ?? 0).toBeLessThanOrEqual(1);
    }
  });
});

describe("2. 물리적 가독성 · 다크모드 눈부심 · 엄지 간섭 · 완독 시간 감사 엔진", () => {
  it("실효 말풍선 폰트가 11.5px 미만이면 readability-font-too-small(가독성 위험) 경고를 발생시킨다", () => {
    const failAudit = auditMobileReaderCuts({
      cuts: [makeCut({ id: "tiny", bubbleFontPx: 24 })],
      deviceId: "iphone-se-375",
      platformId: "naver-webtoon",
      manuscriptWidthPx: 800,
    });
    expect(failAudit.cuts[0]?.effectiveFontPx).toBe(11.25);
    expect(failAudit.cuts[0]?.readabilityStatus).toBe("danger");
    const fontWarning = failAudit.warnings.find((w) => w.code === "readability-font-too-small");
    expect(fontWarning).toBeDefined();
    expect(fontWarning?.severity).toBe("critical");
    expect(fontWarning?.titleKo).toContain("가독성 위험");

    const passAudit = auditMobileReaderCuts({
      cuts: [makeCut({ id: "safe", bubbleFontPx: 25 })],
      deviceId: "iphone-se-375",
      platformId: "naver-webtoon",
      manuscriptWidthPx: 800,
    });
    expect(passAudit.cuts[0]?.effectiveFontPx).toBeGreaterThanOrEqual(READABILITY_MIN_EFFECTIVE_FONT_PX);
    expect(passAudit.cuts[0]?.readabilityStatus).not.toBe("danger");
    expect(passAudit.warnings.some((w) => w.code === "readability-font-too-small")).toBe(false);
  });

  it("동일한 24px 말풍선 원고라도 iPhone SE(375w)에서는 가독성 위험이지만 iPhone 16 Pro Max(430w)에서는 통과한다", () => {
    const cut = makeCut({ id: "borderline", bubbleFontPx: 24 });
    const se = auditMobileReaderCuts({ cuts: [cut], deviceId: "iphone-se-375", manuscriptWidthPx: 800 });
    const pm = auditMobileReaderCuts({ cuts: [cut], deviceId: "iphone-16-promax-430", manuscriptWidthPx: 800 });

    expect(se.summary.unreadableCutCount).toBe(1);
    expect(pm.summary.unreadableCutCount).toBe(0);
    expect(pm.summary.minEffectiveFontPx).toBeGreaterThan(se.summary.minEffectiveFontPx);
  });

  it("1080px 글로벌 원고는 690px 카카오 원고보다 다운스케일이 커서 더 큰 원고 폰트를 요구한다", () => {
    const cut = makeCut({ id: "global-check", bubbleFontPx: 26 });
    const kakao = auditMobileReaderCuts({ cuts: [cut], deviceId: "galaxy-s25-390", manuscriptWidthPx: 690 });
    const global = auditMobileReaderCuts({ cuts: [cut], deviceId: "galaxy-s25-390", manuscriptWidthPx: 1080 });

    expect(kakao.summary.minEffectiveFontPx).toBeGreaterThan(READABILITY_MIN_EFFECTIVE_FONT_PX);
    expect(global.summary.minEffectiveFontPx).toBeLessThan(READABILITY_MIN_EFFECTIVE_FONT_PX);
    expect(global.summary.minRecommendedManuscriptFontPx).toBeGreaterThan(kakao.summary.minRecommendedManuscriptFontPx);
  });

  it("다크 모드에서는 흰 배경·직각 외곽선 컷의 눈부심(white-edge bleed)을 탐지하고, 라이트 모드에서는 탐지하지 않는다", () => {
    const whiteCut = makeCut({
      id: "glare",
      bubbleFontPx: 30,
      backgroundTone: "white-paper",
      edgeTreatment: "hard-white-border",
    });

    const darkAudit = auditMobileReaderCuts({ cuts: [whiteCut], viewerTheme: "dark" });
    expect(darkAudit.cuts[0]?.whiteEdgeBleedRisk).toBe(true);
    expect(darkAudit.warnings.some((w) => w.code === "dark-mode-white-edge-bleed")).toBe(true);

    const lightAudit = auditMobileReaderCuts({ cuts: [whiteCut], viewerTheme: "light" });
    expect(lightAudit.cuts[0]?.whiteEdgeBleedRisk).toBe(false);
    expect(lightAudit.warnings.some((w) => w.code === "dark-mode-white-edge-bleed")).toBe(false);
  });

  it("다크 모드라도 소프트 비네팅 또는 누아르 풀블리드 경계 처리 시 눈부심 위험이 해소된다", () => {
    const softened = makeCut({
      id: "soft-white",
      bubbleFontPx: 30,
      backgroundTone: "white-paper",
      edgeTreatment: "soft-vignette",
    });
    const noir = makeCut({
      id: "noir",
      bubbleFontPx: 30,
      backgroundTone: "dark-noir",
      edgeTreatment: "full-bleed-dark",
    });

    const audit = auditMobileReaderCuts({ cuts: [softened, noir], viewerTheme: "dark" });
    expect(audit.summary.whiteEdgeBleedCutCount).toBe(0);
    expect(audit.warnings.some((w) => w.code === "dark-mode-white-edge-bleed")).toBe(false);
  });

  it("하단 자막이 있는 컷의 여백이 좁으면 하단 댓글바·엄지 터치 영역 간섭 경고가 발생하고 여백 확장 시 해소된다", () => {
    const tightCut = makeCut({
      id: "bottom-tight",
      bubbleFontPx: 30,
      gutterAfterPx: 30,
      captionPlacement: "bottom-edge",
    });
    const tightAudit = auditMobileReaderCuts({
      cuts: [tightCut],
      deviceId: "galaxy-s25-390",
      platformId: "kakao-page",
      manuscriptWidthPx: 690,
      chromeVisible: true,
    });
    expect(tightAudit.cuts[0]?.thumbOverlapRisk).toBe(true);
    expect(tightAudit.warnings.some((w) => w.code === "thumb-comment-bar-overlap")).toBe(true);

    const roomyAudit = auditMobileReaderCuts({
      cuts: [{ ...tightCut, cutHeightPx: 1400, gutterAfterPx: 260 }],
      deviceId: "galaxy-s25-390",
      platformId: "kakao-page",
      manuscriptWidthPx: 690,
      chromeVisible: true,
    });
    expect(roomyAudit.cuts[0]?.thumbOverlapRisk).toBe(false);
    expect(roomyAudit.warnings.some((w) => w.code === "thumb-comment-bar-overlap")).toBe(false);
  });

  it("짧은 컷이 한 화면에 4컷 이상 몰리면 viewport-cut-overcrowding 경고가 발생한다", () => {
    const denseCuts = [1, 2, 3, 4, 5].map((n) =>
      makeCut({ id: `d-${n}`, cutHeightPx: 220, gutterAfterPx: 20, bubbleFontPx: 30 }),
    );
    const audit = auditMobileReaderCuts({
      cuts: denseCuts,
      deviceId: "iphone-16-promax-430",
      platformId: "naver-webtoon",
      manuscriptWidthPx: 800,
    });
    expect(audit.summary.maxSimultaneousCutsInViewport).toBeGreaterThanOrEqual(4);
    expect(audit.warnings.some((w) => w.code === "viewport-cut-overcrowding")).toBe(true);
  });

  it("단일 컷 높이가 가시 화면의 1.45배를 크게 초과하면 cut-exceeds-single-viewport 안내를 발생시킨다", () => {
    const tallCut = makeCut({ id: "panorama", cutHeightPx: 2400, gutterAfterPx: 180, bubbleFontPx: 30 });
    const audit = auditMobileReaderCuts({
      cuts: [tallCut],
      deviceId: "iphone-se-375",
      platformId: "naver-webtoon",
      manuscriptWidthPx: 800,
    });
    expect(audit.warnings.some((w) => w.code === "cut-exceeds-single-viewport")).toBe(true);
  });

  it("회차 예상 완독 시간(초/분) 및 모든 추정 지표에 dataSourceKind='estimate'가 일관되게 명시된다", () => {
    const audit = auditMobileReaderCuts({
      cuts: createDefaultReaderCuts(),
      deviceId: "galaxy-s25-390",
      platformId: "naver-webtoon",
      projectedEpisodeCutCount: 60,
    });

    expect(audit.dataSourceKind).toBe("estimate");
    expect(audit.provenance.dataSourceKind).toBe("estimate");
    expect(audit.summary.dataSourceKind).toBe("estimate");
    expect(audit.readTimeEstimate.dataSourceKind).toBe("estimate");
    expect(audit.readTimeEstimate.provenance.dataSourceKind).toBe("estimate");
    for (const cut of audit.cuts) {
      expect(cut.dataSourceKind).toBe("estimate");
    }

    expect(audit.readTimeEstimate.sequenceReadTimeSec).toBeGreaterThan(5);
    expect(audit.readTimeEstimate.projectedEpisodeReadTimeSec).toBeGreaterThan(
      audit.readTimeEstimate.sequenceReadTimeSec,
    );
    expect(audit.readTimeEstimate.projectedEpisodeReadTimeMin).toBeGreaterThan(1);
    expect(formatReadDuration(135, "ko")).toBe("2분 15초");
    expect(formatReadDuration(45, "ko")).toBe("45초");
    expect(formatReadDuration(120, "en")).toBe("2m");
  });

  it("autoFixMobileReaderCuts는 말풍선 폰트·다크모드 눈부심·하단 댓글바 간섭을 일괄 보정하고 적합도 점수를 높인다", () => {
    const fixed = autoFixMobileReaderCuts({
      cuts: DEFAULT_READER_CUTS,
      deviceId: "iphone-se-375",
      platformId: "naver-webtoon",
      viewerTheme: "dark",
      manuscriptWidthPx: 800,
    });

    expect(fixed.fixes.length).toBeGreaterThanOrEqual(2);
    expect(fixed.afterAudit.summary.unreadableCutCount).toBe(0);
    expect(fixed.afterAudit.summary.whiteEdgeBleedCutCount).toBe(0);
    expect(fixed.afterAudit.summary.overallReadinessScore).toBeGreaterThan(
      fixed.beforeAudit.summary.overallReadinessScore,
    );
  });

  it("빈 컷 배열이나 비정상 수치 입력도 안전하게 정규화해 NaN 없이 감사를 수행한다", () => {
    const fallbackAudit = auditMobileReaderCuts({
      cuts: [],
      manuscriptWidthPx: Number.NaN,
      readingCharsPerSec: -5,
      scrollSpeedCssPxPerSec: 0,
    });
    expect(fallbackAudit.cuts.length).toBe(DEFAULT_READER_CUTS.length);
    expect(Number.isFinite(fallbackAudit.summary.overallReadinessScore)).toBe(true);
    expect(Number.isFinite(fallbackAudit.readTimeEstimate.projectedEpisodeReadTimeSec)).toBe(true);
  });
});

describe("3. 순수 시맨틱 SVG 모바일 목업 생성기 & 감사 리포트 JSON 내보내기", () => {
  it("buildMobilePreviewSvg는 4대 기기·3대 플랫폼·다크/라이트 조합에서 유효한 SVG 문자열을 생성한다", () => {
    for (const deviceId of MOBILE_DEVICE_IDS) {
      const audit = auditMobileReaderCuts({
        cuts: DEFAULT_READER_CUTS,
        deviceId,
        platformId: "kakao-page",
        viewerTheme: "dark",
      });
      const svg = buildMobilePreviewSvg(audit, { scrollOffsetCssPx: 40 });
      expect(svg.startsWith("<svg xmlns=")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain(`data-device="${deviceId}"`);
      expect(svg).toContain('data-platform="kakao-page"');
      expect(svg).toContain('data-role="platform-bottom-chrome"');
    }
  });

  it("buildMobilePreviewSvg 출력에는 원시 hex/rgb/hsl 색상이 0건이며 XML 특수문자를 안전하게 이스케이프한다", () => {
    const audit = auditMobileReaderCuts({
      cuts: [makeCut({ id: "xml-cut", labelKo: '컷 <1> & "대사"', bubbleFontPx: 22 })],
      deviceId: "iphone-16-promax-430",
      viewerTheme: "light",
    });
    const svg = buildMobilePreviewSvg(audit);

    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
    expect(svg).not.toMatch(/\brgba?\s*\(/iu);
    expect(svg).not.toMatch(/\bhsla?\s*\(/iu);
    expect(svg).toContain("oklch(");
    expect(svg).toContain("currentColor");
    expect(svg).toContain("&lt;1&gt; &amp; &quot;대사&quot;");
  });

  it("exportMobileReaderAuditJson은 스키마 버전·dataSourceKind='estimate'·뷰포트·컷·경고를 포함한 유효 JSON을 반환한다", () => {
    const audit = auditMobileReaderCuts({
      cuts: DEFAULT_READER_CUTS,
      deviceId: "iphone-se-375",
      platformId: "naver-webtoon",
      viewerTheme: "dark",
    });
    const raw = exportMobileReaderAuditJson(audit);
    const parsed = JSON.parse(raw) as {
      schemaVersion: string;
      dataSourceKind: string;
      device: { id: string };
      platform: { id: string };
      readTimeEstimate: { dataSourceKind: string; projectedEpisodeReadTimeSec: number };
      cuts: unknown[];
      warnings: unknown[];
    };

    expect(parsed.schemaVersion).toBe("toonstudio.mobile-reader-preview-sim.v1");
    expect(parsed.dataSourceKind).toBe("estimate");
    expect(parsed.device.id).toBe("iphone-se-375");
    expect(parsed.platform.id).toBe("naver-webtoon");
    expect(parsed.readTimeEstimate.dataSourceKind).toBe("estimate");
    expect(parsed.cuts).toHaveLength(DEFAULT_READER_CUTS.length);
    expect(parsed.warnings.length).toBeGreaterThanOrEqual(2);
  });
});

describe("4. StudioMobileReaderPreviewPanel UI 인터랙션 & 단독 렌더", () => {
  it("Props 없이 단독 렌더(<StudioMobileReaderPreviewPanel />)되어도 KPI 4종·추정 배지·SVG 프레임이 정상 표시된다", () => {
    render(<StudioMobileReaderPreviewPanel />);

    expect(screen.getByTestId("studio-mobile-reader-preview-panel")).toBeTruthy();
    expect(screen.getByTestId("reader-sim-estimate-badge").getAttribute("data-source-kind")).toBe("estimate");
    expect(screen.getByTestId("reader-sim-readiness-score")).toBeTruthy();
    expect(screen.getByTestId("reader-sim-visible-viewport")).toBeTruthy();
    expect(screen.getByTestId("reader-sim-min-effective-font")).toBeTruthy();
    expect(screen.getByTestId("reader-sim-read-time")).toBeTruthy();
    expect(screen.getByTestId("reader-sim-phone-svg")).toBeTruthy();
  });

  it("4대 실기기 버튼을 순차 클릭하면 SVG 프레임과 가시 뷰포트 높이가 즉시 전환된다", () => {
    render(<StudioMobileReaderPreviewPanel />);

    for (const deviceId of MOBILE_DEVICE_IDS) {
      const btn = screen.getByTestId(`reader-sim-device-${deviceId}`);
      fireEvent.click(btn);
      expect(btn.getAttribute("aria-pressed")).toBe("true");
      expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-device")).toBe(deviceId);
    }
  });

  it("3대 플랫폼 버튼 및 원고 폭 버튼 클릭 시 플랫폼 크롬과 축소 비율이 실시간 갱신된다", () => {
    render(<StudioMobileReaderPreviewPanel />);

    fireEvent.click(screen.getByTestId("reader-sim-platform-kakao-page"));
    expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-platform")).toBe("kakao-page");
    expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-manuscript-width")).toBe("690");

    fireEvent.click(screen.getByTestId("reader-sim-platform-global-vertical"));
    expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-platform")).toBe("global-vertical");
    expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-manuscript-width")).toBe("1080");

    fireEvent.click(screen.getByTestId("reader-sim-width-800"));
    expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-manuscript-width")).toBe("800");
  });

  it("다크/라이트 토글과 크롬 표시 토글이 눈부심 경고와 가시 뷰포트 높이를 즉시 바꾼다", () => {
    render(<StudioMobileReaderPreviewPanel />);

    expect(screen.getByTestId("reader-sim-warning-dark-mode-white-edge-bleed")).toBeTruthy();
    const withChromeVp = Number(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-visible-viewport-px"));

    fireEvent.click(screen.getByTestId("reader-sim-theme-light"));
    expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-theme")).toBe("light");
    expect(screen.queryByTestId("reader-sim-warning-dark-mode-white-edge-bleed")).toBeNull();

    fireEvent.click(screen.getByTestId("reader-sim-chrome-toggle"));
    expect(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-chrome-visible")).toBe("false");
    const hiddenChromeVp = Number(screen.getByTestId("reader-sim-phone-svg").getAttribute("data-visible-viewport-px"));
    expect(hiddenChromeVp).toBeGreaterThan(withChromeVp);
  });

  it("컷 말풍선 폰트·여백 슬라이더 조작 및 원클릭 보정 버튼이 실시간 경고를 해소한다", () => {
    render(<StudioMobileReaderPreviewPanel />);

    expect(screen.getByTestId("reader-sim-warning-readability-font-too-small")).toBeTruthy();
    expect(screen.getByTestId("reader-sim-warning-thumb-comment-bar-overlap")).toBeTruthy();

    fireEvent.change(screen.getByTestId("cut-font-1"), { target: { value: "28" } });
    expect(screen.queryByTestId("reader-sim-warning-readability-font-too-small")).toBeNull();

    fireEvent.click(screen.getByTestId("reader-sim-autofix-btn"));
    expect(screen.queryByTestId("reader-sim-warning-dark-mode-white-edge-bleed")).toBeNull();
    expect(screen.queryByTestId("reader-sim-warning-thumb-comment-bar-overlap")).toBeNull();
    expect(screen.getByTestId("reader-sim-autofix-summary")).toBeTruthy();
  });

  it("컷 추가·삭제, 스크롤 슬라이더, 초기화 버튼이 상태를 일관되게 관리한다", () => {
    render(<StudioMobileReaderPreviewPanel />);

    fireEvent.click(screen.getByTestId("reader-sim-add-cut-btn"));
    expect(screen.getByTestId("reader-sim-cut-row-5")).toBeTruthy();

    fireEvent.click(screen.getByTestId("cut-remove-5"));
    expect(screen.queryByTestId("reader-sim-cut-row-5")).toBeNull();

    fireEvent.change(screen.getByTestId("reader-sim-scroll-slider"), { target: { value: "120" } });
    expect(screen.getByTestId("reader-sim-scroll-readout").textContent).toContain("120 /");

    fireEvent.click(screen.getByTestId("reader-sim-reset-btn"));
    expect(screen.getByTestId("reader-sim-status-banner").textContent).toContain("복원");
  });

  it("JSON·SVG 복사 버튼과 내보내기 미리보기 탭이 콜백과 스니펫을 정확히 동작시킨다", async () => {
    vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
    const onAuditChange = vi.fn();
    const onExportJson = vi.fn();
    const onExportSvg = vi.fn();

    render(
      <StudioMobileReaderPreviewPanel
        onAuditChange={onAuditChange}
        onExportJson={onExportJson}
        onExportSvg={onExportSvg}
      />,
    );

    expect(onAuditChange).toHaveBeenCalled();

    fireEvent.click(screen.getByTestId("reader-sim-copy-json-btn"));
    await waitFor(() => expect(onExportJson).toHaveBeenCalledTimes(1));
    expect(onExportJson.mock.calls[0]?.[0]).toContain("toonstudio.mobile-reader-preview-sim.v1");
    expect(screen.getByTestId("reader-sim-export-preview").textContent).toContain('"dataSourceKind": "estimate"');

    fireEvent.click(screen.getByTestId("reader-sim-copy-svg-btn"));
    await waitFor(() => expect(onExportSvg).toHaveBeenCalledTimes(1));
    expect(onExportSvg.mock.calls[0]?.[0]).toContain("<svg xmlns=");
    expect(screen.getByTestId("reader-sim-export-preview").textContent).toContain("<svg xmlns=");

    fireEvent.click(screen.getByTestId("reader-sim-tab-hidden"));
    expect(screen.queryByTestId("reader-sim-export-preview")).toBeNull();
  });

  it("영문 로케일(locale='en')과 초기 기기·플랫폼 props를 정확히 반영한다", () => {
    render(
      <StudioMobileReaderPreviewPanel
        locale="en"
        initialDeviceId="ipad-mini-744"
        initialPlatformId="global-vertical"
        initialTheme="light"
      />,
    );

    expect(screen.getByTestId("reader-sim-estimate-badge").textContent).toContain("Estimated");
    expect(screen.getByTestId("reader-sim-copy-json-btn").textContent).toContain("Copy JSON");
    const svg = screen.getByTestId("reader-sim-phone-svg");
    expect(svg.getAttribute("data-device")).toBe("ipad-mini-744");
    expect(svg.getAttribute("data-platform")).toBe("global-vertical");
    expect(svg.getAttribute("data-theme")).toBe("light");
  });
});

describe("5. 코드 위생 자가 검증 (파일 줄수 · Calm Atelier 토큰 · 금지 패턴 0건)", () => {
  it("4개 모듈 파일이 모두 800줄 이하이며 원시 색·transition-all·= {}·Storage·private Map store·BigInt 리터럴이 0건이다", () => {
    const dir = path.resolve(import.meta.dirname);
    const requiredFiles = [
      "mobile-reader-sim-engine.ts",
      "StudioMobileReaderPreviewPanel.tsx",
      "index.ts",
      "mobile-reader-preview-sim.test.tsx",
    ];

    for (const file of requiredFiles) {
      expect(existsSync(path.join(dir, file))).toBe(true);
    }

    const allFiles = readdirSync(dir).filter((f) => /\.(?:ts|tsx)$/u.test(f));
    expect(allFiles.length).toBe(4);

    for (const file of allFiles) {
      const src = readFileSync(path.join(dir, file), "utf8");
      const lineCount = src.split(/\r?\n/).length;
      expect(lineCount).toBeLessThanOrEqual(800);
      expect(src).not.toMatch(/:\s*any\b/u);
      expect(src).not.toMatch(/\bas\s+any\b/u);

      if (file !== "mobile-reader-preview-sim.test.tsx") {
        expect(src).not.toMatch(/\blocalStorage\b/u);
        expect(src).not.toMatch(/\bsessionStorage\b/u);
        expect(src).not.toMatch(/0x[0-9a-fA-F]+n\b/u);
        expect(src).not.toMatch(/\b\d+n\b/u);
        expect(src).not.toMatch(/private\s+(?:readonly\s+)?store\s*[:=]\s*new\s+Map/u);
        expect(src).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u);
        expect(src).not.toMatch(/\brgba?\s*\(/iu);
        expect(src).not.toMatch(/\bhsla?\s*\(/iu);
      }

      if (file === "StudioMobileReaderPreviewPanel.tsx") {
        expect(src).not.toContain("transition-all");
        expect(src).not.toContain("Sparkles");
        expect(src).not.toMatch(/Props\s*=\s*\{\}/u);
        expect(src).not.toMatch(/\)\s*=\s*\{\}/u);
        expect(src).toContain("[word-break:keep-all]");
        expect(src).toContain("tabular-nums");
        expect(src).toContain("min-h-11");
      }
    }
  });
});
