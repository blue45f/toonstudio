import { describe, expect, it } from "vitest";

import {
  PREPRESS_CMYK_PROFILES,
  PUBLICATION_FORMAT_SPECS,
  SUPPORTED_PUBLICATION_FORMATS,
  auditPrepressColorSeparation,
  buildEpubFixedLayoutManifest,
  buildPrintImpositionManifest,
  computePageBoxGeometry,
  convertRgbToPrepressCmyk,
  recomposeVerticalWebtoonToPages,
  renderPrintPagePrepressSvg,
  runPrintPreflightAudit,
  verifyPageGazeFlow,
  type NamedRgbColorSample,
  type PlacedPrintPanel,
  type RecompositionResult,
  type VerticalWebtoonPanelSpec,
} from "./index";

/** 300 DPI 이상 단행본 인쇄 마스터 규격(2000×2300~2600px) 12컷 세로 웹툰 픽스처 생성. */
function makeStandardWebtoonPanels12(
  overrides: Readonly<Record<number, Partial<VerticalWebtoonPanelSpec>>> = {}
): readonly VerticalWebtoonPanelSpec[] {
  const templates: readonly { w: number; h: number; imp: number; ws: number }[] = [
    { w: 2000, h: 2400, imp: 1.1, ws: 0 },
    { w: 2000, h: 2250, imp: 1.0, ws: 80 },
    { w: 2000, h: 2550, imp: 1.05, ws: 90 },
    { w: 2000, h: 2200, imp: 0.95, ws: 70 },
    { w: 2000, h: 2350, imp: 1.15, ws: 260 },
    { w: 2000, h: 2300, imp: 1.0, ws: 85 },
    { w: 2000, h: 2500, imp: 1.1, ws: 95 },
    { w: 2000, h: 2250, imp: 0.95, ws: 75 },
    { w: 2000, h: 2450, imp: 1.25, ws: 320 },
    { w: 2000, h: 2350, imp: 1.0, ws: 90 },
    { w: 2000, h: 2250, imp: 1.05, ws: 80 },
    { w: 2000, h: 2500, imp: 1.15, ws: 110 },
  ];

  return templates.map((tpl, idx) => {
    const base: VerticalWebtoonPanelSpec = {
      id: `cut-${String(idx + 1).padStart(2, "0")}`,
      widthPx: tpl.w, heightPx: tpl.h, importanceWeight: tpl.imp, verticalWhitespaceBeforePx: tpl.ws,
      focalSubjectBox: {
        x: Math.round(tpl.w * 0.25), y: Math.round(tpl.h * 0.34),
        width: Math.round(tpl.w * 0.48), height: Math.round(tpl.h * 0.36), label: "hero-face",
      },
      speechBalloonSafeBoxes: [
        { x: Math.round(tpl.w * 0.14), y: Math.round(tpl.h * 0.12), width: Math.round(tpl.w * 0.36), height: Math.round(tpl.h * 0.16), label: "line-1" },
        { x: Math.round(tpl.w * 0.52), y: Math.round(tpl.h * 0.72), width: Math.round(tpl.w * 0.34), height: Math.round(tpl.h * 0.14), label: "line-2" },
      ],
    };
    const patch = overrides[idx];
    return patch ? { ...base, ...patch } : base;
  });
}

describe("wasm64-wave76-webtoon-print-recomposition", () => {
  describe("PUBLICATION_FORMAT_SPECS 규격 정합성", () => {
    it("5개 인쇄·전자책·숏폼 출판 규격이 모두 등록되어 있다", () => {
      expect(SUPPORTED_PUBLICATION_FORMATS).toEqual([
        "kr-b5-tankobon", "jp-b6-manga", "us-graphic-novel", "epub-fixed-layout", "shortform-9x16-storyboard",
      ]);
      for (const id of SUPPORTED_PUBLICATION_FORMATS) {
        const spec = PUBLICATION_FORMAT_SPECS[id];
        expect(spec.trimWidthMm).toBeGreaterThan(0);
        expect(spec.trimHeightMm).toBeGreaterThan(0);
        expect(spec.dpi).toBeGreaterThanOrEqual(150);
        expect(spec.trimWidthPx).toBeGreaterThan(0);
        expect(spec.trimHeightPx).toBeGreaterThan(0);
      }
    });

    it("한국 B5·일본 B6·북미 그래픽노블 인쇄 수치와 읽기 방향이 정확하다", () => {
      const b5 = PUBLICATION_FORMAT_SPECS["kr-b5-tankobon"];
      expect([b5.trimWidthMm, b5.trimHeightMm, b5.bleedMm, b5.dpi, b5.gutterMm, b5.insideSpineMarginMm]).toEqual([
        182, 257, 3, 300, 12, 14,
      ]);
      expect(b5.defaultReadingDirection).toBe("ltr");
      expect(b5.colorSpace).toBe("cmyk");

      const b6 = PUBLICATION_FORMAT_SPECS["jp-b6-manga"];
      expect([b6.trimWidthMm, b6.trimHeightMm, b6.bleedMm, b6.dpi]).toEqual([128, 182, 3, 300]);
      expect(b6.defaultReadingDirection).toBe("rtl");
      expect(b6.colorSpace).toBe("cmyk");

      const us = PUBLICATION_FORMAT_SPECS["us-graphic-novel"];
      expect([us.trimWidthMm, us.trimHeightMm, us.bleedMm, us.dpi]).toEqual([168, 259, 3.175, 300]);
      expect(us.defaultReadingDirection).toBe("ltr");
    });

    it("ePub3 고정 레이아웃(1600×2560 RGB)과 9:16 숏폼(1080×1920 RGB) 규격이 정확하다", () => {
      const epub = PUBLICATION_FORMAT_SPECS["epub-fixed-layout"];
      expect([epub.trimWidthPx, epub.trimHeightPx, epub.bleedMm, epub.colorSpace]).toEqual([1600, 2560, 0, "rgb"]);

      const sf = PUBLICATION_FORMAT_SPECS["shortform-9x16-storyboard"];
      expect([sf.trimWidthPx, sf.trimHeightPx, sf.bleedMm, sf.colorSpace]).toEqual([1080, 1920, 0, "rgb"]);
      expect(sf.titleSafeInsetMm?.bottom).toBeGreaterThan(sf.titleSafeInsetMm?.top ?? 0);
    });
  });

  describe("세로 웹툰 → 가로 단행본 리컴포지션 솔버 (LTR/RTL·시선 동선·클리프행어·스플래시)", () => {
    it("12컷 세로 웹툰을 한국 B5(LTR)로 리컴포지션할 때 겹침·말풍선 잘림·피사체 잘림이 0건이다", () => {
      const panels = makeStandardWebtoonPanels12();
      const result = recomposeVerticalWebtoonToPages(panels, { formatId: "kr-b5-tankobon" });

      expect(result.readingDirection).toBe("ltr");
      expect(result.summary.totalSourcePanels).toBe(12);
      expect(result.summary.totalOverlapCount).toBe(0);
      expect(result.summary.balloonClippedCount).toBe(0);
      expect(result.summary.focalSubjectClippedCount).toBe(0);
      expect(result.summary.allPagesMonotonicGazeValid).toBe(true);
      expect(result.pages.flatMap((p) => p.placedPanels.map((pp) => pp.panelId))).toEqual(panels.map((p) => p.id));

      let multiColRows = 0;
      for (const page of result.pages) {
        expect(page.gazeFlow.overlapCount).toBe(0);
        expect(page.gazeFlow.monotonicRowOrderValid).toBe(true);
        expect(page.gazeFlow.verticalRowProgressionValid).toBe(true);
        expect(page.gazeFlow.gutterConsistent).toBe(true);
        const byRow = new Map<number, PlacedPrintPanel[]>();
        for (const pp of page.placedPanels) {
          const list = byRow.get(pp.rowIndex) ?? [];
          list.push(pp);
          byRow.set(pp.rowIndex, list);
        }
        for (const row of byRow.values()) {
          if (row.length >= 2) {
            multiColRows += 1;
            for (let i = 1; i < row.length; i += 1) {
              expect(row[i].slotFrameMm.xMm).toBeGreaterThan(row[i - 1].slotFrameMm.xMm);
            }
          }
        }
      }
      expect(multiColRows).toBeGreaterThan(0);
    });

    it("12컷 세로 웹툰을 일본 B6(RTL)로 리컴포지션할 때 행 내부 X 좌표가 우→좌로 엄격히 감소한다", () => {
      const panels = makeStandardWebtoonPanels12();
      const result = recomposeVerticalWebtoonToPages(panels, { formatId: "jp-b6-manga" });

      expect(result.readingDirection).toBe("rtl");
      expect(result.summary.totalOverlapCount).toBe(0);
      expect(result.summary.balloonClippedCount).toBe(0);
      expect(result.summary.focalSubjectClippedCount).toBe(0);
      expect(result.summary.allPagesMonotonicGazeValid).toBe(true);

      let rtlMultiColRows = 0;
      for (const page of result.pages) {
        const byRow = new Map<number, PlacedPrintPanel[]>();
        for (const pp of page.placedPanels) {
          const list = byRow.get(pp.rowIndex) ?? [];
          list.push(pp);
          byRow.set(pp.rowIndex, list);
        }
        for (const row of byRow.values()) {
          if (row.length >= 2) {
            rtlMultiColRows += 1;
            for (let i = 1; i < row.length; i += 1) {
              expect(row[i].slotFrameMm.xMm).toBeLessThan(row[i - 1].slotFrameMm.xMm);
            }
          }
        }
      }
      expect(rtlMultiColRows).toBeGreaterThan(0);
    });

    it("클리프행어 반전 컷은 LTR·RTL 모두 책장을 넘긴 직후 짝수 페이지의 첫 번째 컷에 배치된다", () => {
      const panels = makeStandardWebtoonPanels12({ 8: { isCliffhangerReveal: true, importanceWeight: 1.5 } });
      for (const formatId of ["kr-b5-tankobon", "jp-b6-manga"] as const) {
        const res = recomposeVerticalWebtoonToPages(panels, { formatId });
        const revealPage = res.pages.find((p) => p.placedPanels.some((pp) => pp.panelId === "cut-09"));
        expect(revealPage?.placedPanels[0].panelId).toBe("cut-09");
        expect(revealPage?.placedPanels[0].readingOrderOnPage).toBe(0);
        expect((revealPage?.pageNumber ?? 1) % 2).toBe(0);
        expect(revealPage?.hasCliffhangerRevealAtStart).toBe(true);
        expect(revealPage?.isPostPageTurnReveal).toBe(true);
        expect(res.summary.cliffhangerPostTurnPlacedCount).toBe(1);
      }
    });

    it("세로형 스플래시 컷은 단독 전면 도련(full-bleed) 페이지로 배치되고 말풍선이 잘리지 않는다", () => {
      const panels = makeStandardWebtoonPanels12({
        5: {
          isSplashSpread: true, widthPx: 2400, heightPx: 3300, importanceWeight: 1.8,
          focalSubjectBox: { x: 600, y: 700, width: 1200, height: 1600 },
          speechBalloonSafeBoxes: [{ x: 360, y: 380, width: 700, height: 340 }],
        },
      });
      const result = recomposeVerticalWebtoonToPages(panels, { formatId: "kr-b5-tankobon" });
      const splashPage = result.pages.find((p) => p.isSplashPage);

      expect(splashPage?.placedPanels).toHaveLength(1);
      expect(splashPage?.placedPanels[0].panelId).toBe("cut-06");
      expect(splashPage?.placedPanels[0].isFullBleed).toBe(true);
      expect(splashPage?.placedPanels[0].slotFrameMm).toEqual(splashPage?.bleedBoxMm);
      expect(splashPage?.placedPanels[0].balloonClippedCount).toBe(0);
      expect(splashPage?.placedPanels[0].focalSubjectClippedCount).toBe(0);
    });

    it("가로형 양면 스플래시 컷은 양면 펼침(dual-page spread) 전면 도련으로 확장된다", () => {
      const panels = makeStandardWebtoonPanels12({
        4: {
          isSplashSpread: true, widthPx: 4600, heightPx: 3200, importanceWeight: 2.0,
          focalSubjectBox: { x: 1400, y: 800, width: 1800, height: 1500 },
          speechBalloonSafeBoxes: [{ x: 600, y: 420, width: 900, height: 360 }],
        },
      });
      const result = recomposeVerticalWebtoonToPages(panels, { formatId: "kr-b5-tankobon" });
      const spreadPage = result.pages.find((p) => p.isDualPageSpread);

      expect(spreadPage?.trimBoxMm.widthMm).toBe(364);
      expect(spreadPage?.bleedBoxMm.widthMm).toBe(370);
      expect(spreadPage?.placedPanels[0].balloonClippedCount).toBe(0);
      expect(spreadPage?.placedPanels[0].focalSubjectClippedCount).toBe(0);
    });

    it("홀수/짝수(recto/verso) 안쪽 제본 여백이 LTR·RTL에서 대칭적으로 안전 영역을 이동시킨다", () => {
      const b5 = PUBLICATION_FORMAT_SPECS["kr-b5-tankobon"];
      const ltrOdd = computePageBoxGeometry(b5, 1, "ltr");
      const ltrEven = computePageBoxGeometry(b5, 2, "ltr");
      expect([ltrOdd.pageSide, ltrOdd.spineEdge, ltrOdd.liveSafeBoxMm.xMm]).toEqual(["recto", "left", 14]);
      expect([ltrEven.pageSide, ltrEven.spineEdge, ltrEven.liveSafeBoxMm.xMm]).toEqual(["verso", "right", 12]);
      expect(ltrOdd.liveSafeBoxMm.xMm).toBeGreaterThan(ltrEven.liveSafeBoxMm.xMm);

      const b6 = PUBLICATION_FORMAT_SPECS["jp-b6-manga"];
      const rtlOdd = computePageBoxGeometry(b6, 1, "rtl");
      const rtlEven = computePageBoxGeometry(b6, 2, "rtl");
      expect([rtlOdd.pageSide, rtlOdd.spineEdge, rtlOdd.liveSafeBoxMm.xMm]).toEqual(["verso", "right", 9]);
      expect([rtlEven.pageSide, rtlEven.spineEdge, rtlEven.liveSafeBoxMm.xMm]).toEqual(["recto", "left", 12]);
      expect(rtlEven.liveSafeBoxMm.xMm).toBeGreaterThan(rtlOdd.liveSafeBoxMm.xMm);
    });

    it("상단·하단에 멀리 떨어진 말풍선이 있는 초장축 컷도 contain-protected로 말풍선 잘림이 0건이다", () => {
      const extreme: readonly VerticalWebtoonPanelSpec[] = [
        {
          id: "tall-extreme-1", widthPx: 800, heightPx: 3200, importanceWeight: 1.2, verticalWhitespaceBeforePx: 0,
          focalSubjectBox: { x: 160, y: 1200, width: 480, height: 700 },
          speechBalloonSafeBoxes: [
            { x: 80, y: 60, width: 620, height: 240 },
            { x: 100, y: 2860, width: 600, height: 260 },
          ],
        },
        {
          id: "wide-2", widthPx: 1600, heightPx: 900, importanceWeight: 1.0, verticalWhitespaceBeforePx: 80,
          focalSubjectBox: { x: 500, y: 200, width: 600, height: 500 },
          speechBalloonSafeBoxes: [{ x: 80, y: 80, width: 420, height: 200 }],
        },
      ];
      const result = recomposeVerticalWebtoonToPages(extreme, { formatId: "kr-b5-tankobon" });
      expect(result.summary.balloonClippedCount).toBe(0);
      expect(result.summary.focalSubjectClippedCount).toBe(0);
    });

    it("9:16 숏폼 스토리보드 리컴포지션은 타이틀 안전 영역과 페이지당 최대 2컷 제약을 준수한다", () => {
      const result = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12(), {
        formatId: "shortform-9x16-storyboard",
      });
      expect(result.pages.length).toBeGreaterThanOrEqual(6);
      expect(result.summary.balloonClippedCount).toBe(0);
      expect(result.summary.focalSubjectClippedCount).toBe(0);
      for (const page of result.pages) {
        expect(page.placedPanels.length).toBeLessThanOrEqual(2);
        expect(page.liveSafeBoxMm.yMm).toBe(22);
        expect(page.trimBoxMm.heightMm - (page.liveSafeBoxMm.yMm + page.liveSafeBoxMm.heightMm)).toBeCloseTo(44, 2);
      }
    });

    it("동일 입력 재실행 시 결정론적이며 빈 컷 배열도 안전하게 처리한다", () => {
      const panels = makeStandardWebtoonPanels12({ 7: { isCliffhangerReveal: true } });
      expect(recomposeVerticalWebtoonToPages(panels, { formatId: "us-graphic-novel" })).toEqual(
        recomposeVerticalWebtoonToPages(panels, { formatId: "us-graphic-novel" })
      );
      const empty = recomposeVerticalWebtoonToPages([], { formatId: "kr-b5-tankobon" });
      expect(empty.pages).toHaveLength(0);
      expect(empty.summary.balloonClippedCount).toBe(0);
    });
  });

  describe("CMYK 분판(GCR·UCR·TAC 상한·순수 먹 K100 선화 보존)", () => {
    it("순수 검정 선화(0,0,0)와 극암부 무채색 선화는 4도 혼합 없이 K 단색으로 보존한다", () => {
      const pureBlack = convertRgbToPrepressCmyk({ r: 0, g: 0, b: 0 });
      expect([pureBlack.c, pureBlack.m, pureBlack.y, pureBlack.k, pureBlack.totalInkPercent]).toEqual([0, 0, 0, 100, 100]);
      expect(pureBlack.isKOnlyLineart).toBe(true);

      const nearBlack = convertRgbToPrepressCmyk({ r: 8, g: 8, b: 8 });
      expect([nearBlack.c, nearBlack.m, nearBlack.y]).toEqual([0, 0, 0]);
      expect(nearBlack.k).toBeGreaterThan(95);
      expect(nearBlack.isKOnlyLineart).toBe(true);
    });

    it("isLineartHint가 켜진 무채색 회색 스크린톤은 CMY=0, K 단색으로 분판된다", () => {
      const tone = convertRgbToPrepressCmyk({ r: 128, g: 128, b: 128 }, { isLineartHint: true });
      expect([tone.c, tone.m, tone.y]).toEqual([0, 0, 0]);
      expect(tone.k).toBeGreaterThan(45);
      expect(tone.k).toBeLessThan(55);
      expect(tone.isKOnlyLineart).toBe(true);
    });

    it("극단적인 고채도·암부 RGB 격자 전체에서 도공지(300%)·비도공지(260%)·SWOP(280%) TAC 상한을 엄격히 지킨다", () => {
      const steps = [0, 15, 32, 64, 128, 192, 255];
      for (const profileId of ["coated-fogra39", "uncoated-newsprint", "web-offset-swop"] as const) {
        const limit = PREPRESS_CMYK_PROFILES[profileId].tacLimitPercent;
        for (const r of steps) {
          for (const g of steps) {
            for (const b of steps) {
              const out = convertRgbToPrepressCmyk({ r, g, b }, { profileId });
              expect(Math.min(out.c, out.m, out.y, out.k)).toBeGreaterThanOrEqual(0);
              expect(out.c + out.m + out.y + out.k).toBeLessThanOrEqual(limit + 1e-6);
              expect(out.totalInkPercent).toBeLessThanOrEqual(limit);
            }
          }
        }
      }
    });

    it("GCR 강도를 높이면 동일 암부 색에서 K 비중이 높아지고 CMY 총량이 줄어든다", () => {
      const low = convertRgbToPrepressCmyk({ r: 42, g: 26, b: 58 }, { gcrStrength: 0.25, ucrStrength: 0.1, preservePureBlackLineart: false });
      const high = convertRgbToPrepressCmyk({ r: 42, g: 26, b: 58 }, { gcrStrength: 0.9, ucrStrength: 0.4, preservePureBlackLineart: false });
      expect(high.k).toBeGreaterThan(low.k);
      expect(high.c + high.m + high.y).toBeLessThan(low.c + low.m + low.y);
    });

    it("사용자 지정 TAC 상한(240%)과 일괄 분판 감사 리포트가 정확히 동작한다", () => {
      const samples: readonly NamedRgbColorSample[] = [
        { id: "lineart-ink", r: 0, g: 0, b: 0, isLineart: true },
        { id: "deep-shadow", r: 18, g: 10, b: 28 },
        { id: "neon-cyan", r: 0, g: 245, b: 255 },
        { id: "warm-paper", r: 250, g: 245, b: 235 },
      ];
      const audit = auditPrepressColorSeparation(samples, { profileId: "uncoated-newsprint", tacLimitPercent: 240 });
      expect(audit.sampleCount).toBe(4);
      expect(audit.tacViolationCount).toBe(0);
      expect(audit.maxTacPercent).toBeLessThanOrEqual(240);
      expect(audit.kOnlyLineartCount).toBe(1);
      expect(audit.gamutCompressedCount).toBeGreaterThanOrEqual(1);
    });
  });

  describe("인쇄 프리플라이트 감사(DPI·도련·제본 여백 침범·TAC) 및 조판 매니페스트", () => {
    it("고해상도·안전 여백 준수 B5 단행본은 프리플라이트 오류 0건(ready-for-press)으로 통과한다", () => {
      const recomposition = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12(), { formatId: "kr-b5-tankobon" });
      const report = runPrintPreflightAudit(recomposition, {
        panelColorSamples: {
          "cut-01": [
            { id: "ink", r: 0, g: 0, b: 0, isLineart: true },
            { id: "sky", r: 44, g: 132, b: 220 },
          ],
        },
      });
      expect(report.passed).toBe(true);
      expect(report.status).toBe("ready-for-press");
      expect(report.errorCount).toBe(0);
      expect(report.minEffectiveDpiObserved).toBeGreaterThanOrEqual(300);
      expect(report.maxTacPercentObserved).toBeLessThanOrEqual(300);
    });

    it("유효 해상도가 300 DPI 미만인 저해상도 컷은 LOW_EFFECTIVE_DPI 오류로 적발한다", () => {
      const lowRes = makeStandardWebtoonPanels12({ 0: { widthPx: 420, heightPx: 540 }, 1: { widthPx: 420, heightPx: 540 } });
      const report = runPrintPreflightAudit(recomposeVerticalWebtoonToPages(lowRes, { formatId: "kr-b5-tankobon" }));
      expect(report.passed).toBe(false);
      expect(report.status).toBe("blocked-errors");
      expect(report.issues.some((i) => i.code === "LOW_EFFECTIVE_DPI" && i.severity === "error")).toBe(true);
    });

    it("흑백 선화(monochrome-lineart) 컷이 300~599 DPI 대역이면 600 DPI 권장 경고를 기록한다", () => {
      const singleLineartCut: readonly VerticalWebtoonPanelSpec[] = [
        {
          id: "lineart-01", widthPx: 2200, heightPx: 3100, importanceWeight: 1.2, verticalWhitespaceBeforePx: 0,
          focalSubjectBox: { x: 500, y: 800, width: 1100, height: 1200 },
          speechBalloonSafeBoxes: [{ x: 300, y: 260, width: 700, height: 340 }],
        },
      ];
      const recomposition = recomposeVerticalWebtoonToPages(singleLineartCut, { formatId: "kr-b5-tankobon" });
      const report = runPrintPreflightAudit(recomposition, { panelArtModes: { "lineart-01": "monochrome-lineart" } });
      expect(report.passed).toBe(true);
      expect(report.status).toBe("review-warnings");
      expect(report.minEffectiveDpiObserved).toBeGreaterThanOrEqual(300);
      expect(report.minEffectiveDpiObserved).toBeLessThan(600);
      expect(
        report.issues.some((i) => i.code === "LINEART_DPI_BELOW_600" && i.severity === "warning" && i.panelId === "lineart-01")
      ).toBe(true);
    });

    it("전면 도련 컷의 도련이 3mm 미만으로 부족하면 BLEED_COVERAGE_INSUFFICIENT 오류를 적발한다", () => {
      const panels = makeStandardWebtoonPanels12({
        0: { isSplashSpread: true, widthPx: 2400, heightPx: 3300, speechBalloonSafeBoxes: [{ x: 400, y: 400, width: 600, height: 300 }] },
      });
      const base = recomposeVerticalWebtoonToPages(panels, { formatId: "kr-b5-tankobon" });
      const broken: RecompositionResult = {
        ...base,
        pages: base.pages.map((p, idx) =>
          idx === 0 ? { ...p, placedPanels: p.placedPanels.map((pp) => ({ ...pp, slotFrameMm: p.trimBoxMm })) } : p
        ),
      };
      const report = runPrintPreflightAudit(broken);
      expect(report.passed).toBe(false);
      expect(report.issues.some((i) => i.code === "BLEED_COVERAGE_INSUFFICIENT" && i.severity === "error")).toBe(true);
    });

    it("말풍선이 안쪽 제본 여백(스파인 거터)을 침범하면 SPINE_GUTTER_TEXT_INTRUSION 오류를 적발한다", () => {
      const base = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12(), { formatId: "kr-b5-tankobon" });
      const intruded: RecompositionResult = {
        ...base,
        pages: base.pages.map((p, idx) =>
          idx === 0
            ? {
                ...p,
                placedPanels: p.placedPanels.map((pp, pIdx) =>
                  pIdx === 0 ? { ...pp, mappedSpeechBalloonsMm: [{ xMm: 4, yMm: 40, widthMm: 35, heightMm: 18 }] } : pp
                ),
              }
            : p
        ),
      };
      const report = runPrintPreflightAudit(intruded);
      expect(report.passed).toBe(false);
      const spineIssue = report.issues.find((i) => i.code === "SPINE_GUTTER_TEXT_INTRUSION");
      expect(spineIssue?.severity).toBe("error");
      expect(spineIssue?.measuredValue).toBeCloseTo(10, 2);
    });

    it("외부 원시 CMYK 판의 TAC 초과 오류와 4도 먹 선화 경고를 함께 검출한다", () => {
      const recomposition = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12(), { formatId: "kr-b5-tankobon" });
      const report = runPrintPreflightAudit(recomposition, {
        rawPreSeparatedCmykChecks: [
          { sampleId: "over-ink-bg", pageNumber: 1, panelId: "cut-01", c: 95, m: 90, y: 85, k: 80 },
          { sampleId: "muddy-lineart", pageNumber: 1, panelId: "cut-02", c: 45, m: 40, y: 40, k: 95, isLineart: true },
        ],
      });
      expect(report.passed).toBe(false);
      expect(report.issues.some((i) => i.code === "TAC_LIMIT_EXCEEDED" && i.severity === "error")).toBe(true);
      expect(report.issues.some((i) => i.code === "FOUR_COLOR_BLACK_LINEART" && i.severity === "warning")).toBe(true);
    });

    it("verifyPageGazeFlow는 겹치는 컷과 역전된 읽기 순서를 정확히 감지한다", () => {
      const base = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12().slice(0, 2), { formatId: "kr-b5-tankobon" });
      const [first, second] = base.pages[0].placedPanels;
      const overlapped: readonly PlacedPrintPanel[] = [
        first,
        {
          ...second,
          rowIndex: first.rowIndex,
          slotFrameMm: {
            xMm: first.slotFrameMm.xMm + 5, yMm: first.slotFrameMm.yMm + 5,
            widthMm: first.slotFrameMm.widthMm, heightMm: first.slotFrameMm.heightMm,
          },
        },
      ];
      const check = verifyPageGazeFlow(overlapped, "rtl", 4.5);
      expect(check.overlapCount).toBe(1);
      expect(check.monotonicRowOrderValid).toBe(false);
      expect(check.smoothnessScore).toBeLessThan(50);
    });
  });

  describe("ePub3 Fixed-Layout OPF 및 인쇄 프리플라이트 SVG 출고", () => {
    it("일본 B6(RTL) ePub3 매니페스트는 page-progression-direction='rtl'과 정확한 좌/우 펼침 속성을 출력한다", () => {
      const rtlResult = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12(), { formatId: "jp-b6-manga" });
      const epub = buildEpubFixedLayoutManifest(rtlResult, {
        identifier: "urn:uuid:wave76-jp-b6-001", title: "별빛 검객 <제1권>", creator: "김작가",
      });
      expect(epub.pageProgressionDirection).toBe("rtl");
      expect(epub.language).toBe("ja");
      expect(epub.renditionLayout).toBe("pre-paginated");
      expect(epub.renditionSpread).toBe("landscape");
      expect(epub.opfXml).toContain('<spine page-progression-direction="rtl">');
      expect(epub.opfXml).toContain('<meta property="rendition:layout">pre-paginated</meta>');
      expect(epub.opfXml).toContain("&lt;제1권&gt;");
      expect(epub.spineItems[0].properties).toBe("page-spread-left");
      expect(epub.spineItems[1].properties).toBe("page-spread-right");
      expect(epub.manifestChecksum).toMatch(/^[0-9a-f]{16}$/);
    });

    it("한국 B5(LTR) ePub3 매니페스트는 ltr 방향과 홀수=right, 짝수=left 펼침 속성을 출력한다", () => {
      const ltrResult = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12(), { formatId: "kr-b5-tankobon" });
      const epub = buildEpubFixedLayoutManifest(ltrResult, {
        identifier: "urn:uuid:wave76-kr-b5-001", title: "서울 야행록", creator: "이작가", pageImageFormat: "webp",
      });
      expect(epub.pageProgressionDirection).toBe("ltr");
      expect(epub.opfXml).toContain('<spine page-progression-direction="ltr">');
      expect(epub.opfXml).toContain('media-type="image/webp"');
      expect(epub.spineItems[0].properties).toBe("page-spread-right");
      expect(epub.spineItems[1].properties).toBe("page-spread-left");
      expect(epub.pageDocuments[0].xhtml).toContain(
        `width=${ltrResult.format.trimWidthPx}, height=${ltrResult.format.trimHeightPx}`
      );
    });

    it("9:16 숏폼 ePub 매니페스트는 세로 고정(portrait, spread=none)과 결정론적 체크섬을 출력한다", () => {
      const shortResult = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12().slice(0, 4), {
        formatId: "shortform-9x16-storyboard",
      });
      const epubA = buildEpubFixedLayoutManifest(shortResult, {
        identifier: "urn:uuid:wave76-short-001", title: "숏폼 하이라이트", creator: "박작가",
      });
      const epubB = buildEpubFixedLayoutManifest(shortResult, {
        identifier: "urn:uuid:wave76-short-001", title: "숏폼 하이라이트", creator: "박작가",
      });
      expect(epubA.renditionOrientation).toBe("portrait");
      expect(epubA.renditionSpread).toBe("none");
      expect(epubA.manifestChecksum).toBe(epubB.manifestChecksum);
    });

    it("조판 매니페스트와 프리플라이트 SVG 오버레이가 재단선·레지스트레이션·컬러바를 NaN 없이 출력한다", () => {
      const b5Result = recomposeVerticalWebtoonToPages(makeStandardWebtoonPanels12(), { formatId: "kr-b5-tankobon" });
      const imposition = buildPrintImpositionManifest(b5Result, { documentTitle: "별빛 연대기 Vol.1" });
      expect(imposition.pages).toHaveLength(b5Result.pages.length);
      expect(imposition.impositionSheets.length).toBeGreaterThanOrEqual(2);

      for (let i = 0; i < b5Result.pages.length; i += 1) {
        const page = b5Result.pages[i];
        const impPage = imposition.pages[i];
        expect([impPage.cropMarks.length, impPage.bleedMarks.length, impPage.registrationMarks.length, impPage.colorBarPatches.length]).toEqual([
          8, 8, 4, 12,
        ]);
        const rendered = renderPrintPagePrepressSvg(page, impPage);
        expect(rendered.hasInvalidNumber).toBe(false);
        expect(rendered.panelTransformCount).toBe(page.placedPanels.length);
        expect(rendered.svgMarkup).toContain('data-layer="trim-box"');
        expect(rendered.svgMarkup).toContain('data-layer="bleed-box"');
        expect(rendered.svgMarkup).toContain('data-layer="live-safe-box"');
        expect(rendered.svgMarkup).toContain('data-layer="crop-and-registration-marks"');
        expect(rendered.svgMarkup).toContain('data-layer="cmyk-color-bar"');
        expect(rendered.svgMarkup).toContain('data-cmyk="0,0,0,100"');
        expect(rendered.svgMarkup).not.toMatch(/NaN|Infinity/);
      }
    });
  });
});
