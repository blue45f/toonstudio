// @vitest-environment jsdom

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioGlobalReflowDnaPanel } from "./StudioGlobalReflowDnaPanel";
import {
  DEFAULT_SCROLL_WIDTH_PX,
  buildSyntheticPerspectivePairs,
  createDemoScrollCuts,
  mmToPx,
  reflowPrintPagesToScroll,
  reflowScrollToPrintPages,
  solvePerspectiveCameraFromTwoPairs,
  type PrintBookFormatId,
  type PrintPageInput,
  type ScrollCutInput,
  type SyntheticPerspectiveCameraSpec,
} from "./reflow-perspective-matcher";
import {
  auditCutAgainstStyleDna,
  buildInteractiveWebtoonHtmlBundle,
  createDemoAssistantCuts,
  createDemoInteractiveStoryGraph,
  createDemoStyleDnaSamples,
  extractWorkStyleDna,
  validateInteractiveStoryGraph,
  type InteractiveStoryGraph,
  type StyleDnaCutSample,
} from "./style-dna-and-interactive-branch";

afterEach(cleanup);

describe("세로 스크롤 ↔ 단행본 페이지 양방향 자동 리플로우", () => {
  it("B5·신국판·일본 신서판 300DPI·3mm 도련·페이지당 4~6컷·가독 최소 폭·말풍선 무손실을 보장한다", () => {
    const baseCuts = createDemoScrollCuts();
    // 말풍선이 컷 경계를 의도적으로 벗어난 극한 컷을 섞어도 잘림 0건을 보장해야 한다.
    const cutsWithExtremeBalloons: ScrollCutInput[] = baseCuts.map((cut, idx) =>
      idx === 0
        ? {
            ...cut,
            balloons: [
              { id: "edge-left", text: "왼쪽 경계 초근접", xNorm: -0.2, yNorm: -0.1, widthNorm: 0.55, heightNorm: 0.3 },
              { id: "edge-right", text: "오른쪽 하단 초과", xNorm: 0.85, yNorm: 0.88, widthNorm: 0.5, heightNorm: 0.35 },
            ],
          }
        : cut,
    );

    const formats: readonly { readonly id: PrintBookFormatId; readonly wMm: number; readonly hMm: number }[] = [
      { id: "b5", wMm: 182, hMm: 257 },
      { id: "shinkook", wMm: 152, hMm: 225 },
      { id: "jp-shinsho", wMm: 112, hMm: 174 },
    ];

    for (const fmt of formats) {
      const result = reflowScrollToPrintPages(cutsWithExtremeBalloons, { format: fmt.id });
      expect(result.dimensions.dpi).toBe(300);
      expect(result.dimensions.bleedMm).toBe(3);
      expect(result.dimensions.bleedPx).toBe(mmToPx(3, 300));
      expect(result.dimensions.trimWidthPx).toBe(mmToPx(fmt.wMm, 300));
      expect(result.dimensions.trimHeightPx).toBe(mmToPx(fmt.hMm, 300));
      expect(result.dimensions.fullWidthPx).toBe(mmToPx(fmt.wMm + 6, 300));
      expect(result.dimensions.fullHeightPx).toBe(mmToPx(fmt.hMm + 6, 300));

      expect(result.totalCuts).toBe(10);
      expect(result.allPagesInTargetRange).toBe(true);
      expect(result.readableWidthViolations).toBe(0);
      expect(result.clippedBalloonCount).toBe(0);
      expect(result.minPanelWidthMm).toBeGreaterThanOrEqual(result.minReadableWidthMm);

      for (const page of result.pages) {
        expect(page.cutCount).toBeGreaterThanOrEqual(4);
        expect(page.cutCount).toBeLessThanOrEqual(6);
        expect(page.clippedBalloonCount).toBe(0);
        for (const panel of page.panels) {
          expect(panel.readableWidthOk).toBe(true);
          for (const b of panel.balloons) {
            expect(b.clipped).toBe(false);
            expect(b.xMm).toBeGreaterThanOrEqual(panel.xMm);
            expect(b.yMm).toBeGreaterThanOrEqual(panel.yMm);
            expect(b.xMm + b.widthMm).toBeLessThanOrEqual(panel.xMm + panel.widthMm + 0.05);
            expect(b.yMm + b.heightMm).toBeLessThanOrEqual(panel.yMm + panel.heightMm + 0.05);
          }
        }
      }
    }

    // 12컷·15컷에서도 모든 페이지가 4~6컷 범위를 유지한다.
    const twelveCuts = [...baseCuts, ...baseCuts.slice(0, 2).map((c, i) => ({ ...c, id: `extra-${i}`, order: 11 + i }))];
    const twelveRes = reflowScrollToPrintPages(twelveCuts, { format: "b5" });
    expect(twelveRes.allPagesInTargetRange).toBe(true);
    expect(twelveRes.pages.every((p) => p.cutCount >= 4 && p.cutCount <= 6)).toBe(true);
  });

  it("일본(RTL)·한국(LTR) 출판 페이지를 800px 세로 스크롤 컷과 호흡 여백으로 정확히 역전개한다", () => {
    const samplePanels = [
      { id: "top-left", xMm: 10, yMm: 12, widthMm: 44, heightMm: 62, importance: "dialogue" as const, balloons: [{ id: "b1", text: "좌상", xMm: 14, yMm: 16, widthMm: 20, heightMm: 14 }] },
      { id: "top-right", xMm: 58, yMm: 12, widthMm: 44, heightMm: 62, importance: "dialogue" as const, balloons: [{ id: "b2", text: "우상", xMm: 62, yMm: 16, widthMm: 20, heightMm: 14 }, { id: "b2b", text: "우상2", xMm: 64, yMm: 40, widthMm: 18, heightMm: 14 }] },
      { id: "bot-left", xMm: 10, yMm: 80, widthMm: 44, heightMm: 74, importance: "action" as const, balloons: [] },
      { id: "bot-right", xMm: 58, yMm: 80, widthMm: 44, heightMm: 74, importance: "dialogue" as const, balloons: [{ id: "b4", text: "우하", xMm: 62, yMm: 86, widthMm: 22, heightMm: 16 }] },
    ];

    const rtlPage: PrintPageInput = { pageNumber: 1, readingDirection: "rtl", trimWidthMm: 112, trimHeightMm: 174, panels: samplePanels };
    const ltrPage: PrintPageInput = { pageNumber: 1, readingDirection: "ltr", trimWidthMm: 112, trimHeightMm: 174, panels: samplePanels };

    const rtlScroll = reflowPrintPagesToScroll([rtlPage]);
    const ltrScroll = reflowPrintPagesToScroll([ltrPage]);

    expect(rtlScroll.canvasWidthPx).toBe(DEFAULT_SCROLL_WIDTH_PX);
    expect(rtlScroll.cuts.map((c) => c.sourcePanelId)).toEqual(["top-right", "top-left", "bot-right", "bot-left"]);
    expect(ltrScroll.cuts.map((c) => c.sourcePanelId)).toEqual(["top-left", "top-right", "bot-left", "bot-right"]);
    expect(rtlScroll.clippedBalloonCount).toBe(0);

    // 대사 2개 컷의 호흡 여백(84px)이 페이지 전환 호흡 여백(160/220px)보다 짧다.
    expect(rtlScroll.cuts[0]?.breathingGapAfterPx).toBeLessThan(rtlScroll.cuts[3]?.breathingGapAfterPx ?? 0);

    // 모든 세로 스크롤 컷이 겹치지 않고 800px 폭으로 단조 증가 배치된다.
    for (let i = 0; i < rtlScroll.cuts.length; i += 1) {
      const cut = rtlScroll.cuts[i];
      const next = rtlScroll.cuts[i + 1];
      expect(cut?.widthPx).toBe(800);
      if (cut && next) {
        expect(next.yPx).toBe(cut.yPx + cut.heightPx + cut.breathingGapAfterPx);
      }
    }

    // 양방향 라운드트립: Scroll -> Print(RTL 신서판) -> Scroll 시 총 컷 수와 페이지 순서가 보존된다.
    const printRound = reflowScrollToPrintPages(createDemoScrollCuts(), { format: "jp-shinsho", readingDirection: "rtl" });
    const scrollBack = reflowPrintPagesToScroll(printRound.pages);
    expect(scrollBack.totalCuts).toBe(10);
    expect(scrollBack.clippedBalloonCount).toBe(0);
    expect(scrollBack.cuts[4]?.pacingReason).toBe("page-turn");
  });
});

describe("2D 투시선 2쌍 → 3D 카메라 소실점·지평선·FOV·Pitch/Yaw/Roll 수학 역산", () => {
  it("눈높이·부감(하이앵글)·앙각(로우앵글) 3D 카메라를 2쌍 투시선에서 0.05° 오차 이내로 역산한다", () => {
    const specs: readonly SyntheticPerspectiveCameraSpec[] = [
      { imageWidthPx: 1600, imageHeightPx: 900, fovDeg: 48, pitchDeg: 0, yawDeg: 32, rollDeg: 0 },
      { imageWidthPx: 1600, imageHeightPx: 900, fovDeg: 52, pitchDeg: -14, yawDeg: 28, rollDeg: 6 },
      { imageWidthPx: 1600, imageHeightPx: 900, fovDeg: 42, pitchDeg: 12, yawDeg: -35, rollDeg: -5 },
    ];

    for (const spec of specs) {
      const pairs = buildSyntheticPerspectivePairs(spec);
      const solved = solvePerspectiveCameraFromTwoPairs(pairs);
      const expectedFocal = (spec.imageHeightPx / 2) / Math.tan(((spec.fovDeg * Math.PI) / 180) / 2);

      expect(solved.status).toBe("solved");
      expect(solved.vp1).not.toBeNull();
      expect(solved.vp2).not.toBeNull();
      expect(solved.orthogonalityResidual).toBeLessThan(1e-4);
      expect(Math.abs(solved.focalLengthPx - expectedFocal)).toBeLessThan(0.5);
      expect(Math.abs(solved.fovDeg - spec.fovDeg)).toBeLessThan(0.05);
      expect(Math.abs(solved.pitchDeg - spec.pitchDeg)).toBeLessThan(0.05);
      expect(Math.abs(solved.yawDeg - spec.yawDeg)).toBeLessThan(0.05);
      expect(Math.abs(solved.rollDeg - spec.rollDeg)).toBeLessThan(0.05);

      // 지평선 중심 Y 검증: pitch=0, roll=0이면 정확히 imageHeightPx / 2
      if (spec.pitchDeg === 0 && spec.rollDeg === 0) {
        expect(Math.abs(solved.horizonYAtCenterPx - spec.imageHeightPx / 2)).toBeLessThan(0.1);
      }
      // 부감(pitch < 0)이면 지평선이 화면 중심 위쪽(y < cy), 앙각(pitch > 0)이면 아래쪽(y > cy)
      if (spec.pitchDeg < 0) expect(solved.horizonYAtCenterPx).toBeLessThan(spec.imageHeightPx / 2);
      if (spec.pitchDeg > 0) expect(solved.horizonYAtCenterPx).toBeGreaterThan(spec.imageHeightPx / 2);
    }
  });

  it("평행선(1점 투시 폴백) 및 퇴화 선분 입력을 NaN 없이 안전하게 처리한다", () => {
    const onePoint = solvePerspectiveCameraFromTwoPairs({
      imageWidthPx: 1280,
      imageHeightPx: 720,
      pairA: [
        { start: { x: 200, y: 600 }, end: { x: 420, y: 480 } },
        { start: { x: 1080, y: 600 }, end: { x: 860, y: 480 } },
      ],
      pairB: [
        { start: { x: 100, y: 500 }, end: { x: 500, y: 500 } },
        { start: { x: 100, y: 300 }, end: { x: 500, y: 300 } },
      ],
    });
    expect(onePoint.status).toBe("fallback-one-point");
    expect(Number.isFinite(onePoint.fovDeg)).toBe(true);
    expect(onePoint.warnings.length).toBeGreaterThan(0);

    const invalid = solvePerspectiveCameraFromTwoPairs({
      imageWidthPx: 1280,
      imageHeightPx: 720,
      pairA: [
        { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        { start: { x: 10, y: 10 }, end: { x: 10, y: 10 } },
      ],
      pairB: [
        { start: { x: 0, y: 0 }, end: { x: 0, y: 0 } },
        { start: { x: 20, y: 20 }, end: { x: 20, y: 20 } },
      ],
    });
    expect(invalid.status).toBe("invalid");
    expect(Number.isFinite(invalid.focalLengthPx)).toBe(true);
  });
});

describe("작품 전용 스타일 DNA 락(Style DNA Guard)", () => {
  it("대표 화 DNA 추출(OKLCH 순환 색조 포함), 일치/이탈 컷 변별 및 자동 보정 파라미터의 복원 효과를 검증한다", () => {
    // 0°/360° 경계 OKLCH 색조 순환 평균 검증 (356°와 4°의 평균은 180°가 아니라 0°/360° 근방)
    const wrapDna = extractWorkStyleDna("wrap-work", "Wrap Test", [
      {
        cutId: "wrap-1",
        strokeWidthsPx: [2.0, 2.1],
        shadowOklchSamples: [
          { l: 0.35, c: 0.08, h: 356 },
          { l: 0.35, c: 0.08, h: 4 },
        ],
        lightShadowContrastDeltaL: 0.4,
        shadowAreaRatio: 0.3,
        balloons: [{ fontFamily: "Pretendard", letterSpacingEm: 0, outlineWidthPx: 2 }],
      },
    ]);
    const distFromZero = Math.min(wrapDna.shadow.meanHueDeg, 360 - wrapDna.shadow.meanHueDeg);
    expect(distFromZero).toBeLessThan(0.5);

    // 실제 대표 화 DNA 추출 및 정상/이탈 어시스턴트 컷 대조
    const dna = extractWorkStyleDna("moonlit-clocktower", "자정의 시계탑", createDemoStyleDnaSamples());
    expect(dna.line.meanPx).toBeCloseTo(1.983, 2);
    expect(dna.shadow.temperatureTone).toBe("cool");
    expect(dna.balloon.primaryFontFamily).toBe("KoPubDotum");
    expect(dna.dnaFingerprint).toMatch(/^dna-v1-/);

    const { aligned, drifted } = createDemoAssistantCuts();
    const alignedAudit = auditCutAgainstStyleDna(dna, aligned);
    const driftedAudit = auditCutAgainstStyleDna(dna, drifted);

    expect(alignedAudit.passed).toBe(true);
    expect(alignedAudit.grade).toBe("locked-pass");
    expect(alignedAudit.consistencyScore).toBeGreaterThanOrEqual(92);
    expect(alignedAudit.deviations).toHaveLength(0);

    expect(driftedAudit.passed).toBe(false);
    expect(driftedAudit.grade).toBe("rejected-drift");
    expect(driftedAudit.consistencyScore).toBeLessThan(60);
    expect(driftedAudit.deviations.map((d) => d.category)).toEqual(
      expect.arrayContaining(["line-weight", "shadow-oklch", "balloon-typography"]),
    );

    // 자동 보정 파라미터를 이탈 컷에 적용하면 통일성 점수가 95점 이상으로 회복된다.
    const corr = driftedAudit.autoCorrectionParams;
    const correctedCut: StyleDnaCutSample = {
      cutId: "asst-cut-05-corrected",
      strokeWidthsPx: drifted.strokeWidthsPx.map((w) => {
        const mean = driftedAudit.measured.lineMeanPx;
        return mean * corr.strokeScaleMultiplier + (w - mean) * corr.strokePressureCurveGamma;
      }),
      shadowOklchSamples: drifted.shadowOklchSamples.map((s) => ({
        l: s.l + corr.shadowLightnessOffset,
        c: s.c + corr.shadowChromaOffset,
        h: (s.h + corr.shadowHueShiftDeg + 360) % 360,
      })),
      lightShadowContrastDeltaL: drifted.lightShadowContrastDeltaL * corr.contrastGainMultiplier,
      shadowAreaRatio: drifted.shadowAreaRatio,
      balloons: drifted.balloons.map((b) => ({
        ...b,
        fontFamily: corr.targetBalloonFontFamily,
        letterSpacingEm: b.letterSpacingEm + corr.balloonLetterSpacingOffsetEm,
        outlineWidthPx: corr.balloonOutlineWidthTargetPx,
      })),
    };
    const reAudit = auditCutAgainstStyleDna(dna, correctedCut);
    expect(reAudit.passed).toBe(true);
    expect(reAudit.consistencyScore).toBeGreaterThanOrEqual(95);
  });
});

describe("선택지 분기형 인터랙티브 웹툰 그래프 검증 & XSS-safe HTML5 번들", () => {
  it("정상 그래프는 통과하고, 고립 노드·데드엔드·순환·깨진 링크를 정확히 탐지한다", () => {
    const cleanReport = validateInteractiveStoryGraph(createDemoInteractiveStoryGraph("clean"));
    expect(cleanReport.valid).toBe(true);
    expect(cleanReport.unreachableNodeIds).toEqual([]);
    expect(cleanReport.deadEndNodeIds).toEqual([]);
    expect(cleanReport.cycles).toEqual([]);
    expect(cleanReport.endingNodeIds).toHaveLength(2);

    const defectReport = validateInteractiveStoryGraph(createDemoInteractiveStoryGraph("defective"));
    expect(defectReport.valid).toBe(false);
    expect(defectReport.unreachableNodeIds).toEqual(expect.arrayContaining(["scene-loop-a", "scene-loop-b"]));
    expect(defectReport.deadEndNodeIds).toContain("scene-roof");
    expect(defectReport.cycles.length).toBeGreaterThanOrEqual(1);
  });

  it("XSS 스크립트 탈출 시도와 javascript: URL을 무력화한 독립 단일 HTML5 번들을 생성한다", () => {
    const xssGraph: InteractiveStoryGraph = {
      workId: "xss-audit",
      title: '보안 테스트 </script><script>alert("xss")</script>',
      author: '<img src=x onerror="alert(1)">',
      locale: "ko",
      startNodeId: "n1",
      nodes: [
        {
          id: "n1",
          title: '장면 1 <script>alert(1)</script>',
          cutImageUrl: "javascript:alert('pwned')",
          caption: '설명 & "따옴표" </script>',
          dialogueSpeaker: "<b>화자</b>",
          dialogueText: "대사 </script><svg onload=alert(1)>",
          choices: [{ id: "c1", label: "엔딩으로 </script>", targetNodeId: "n2" }],
        },
        {
          id: "n2",
          title: "안전 엔딩",
          cutImageUrl: "https://cdn.toonstudio.cloud/sample.webp",
          caption: "정상 이미지 URL은 유지됩니다.",
          isEnding: true,
          endingTag: "SAFE END",
          choices: [],
        },
      ],
    };

    const bundle = buildInteractiveWebtoonHtmlBundle(xssGraph);
    expect(bundle.xssSafeVerified).toBe(true);
    expect(bundle.sanitizedUnsafeUrlCount).toBe(1);
    expect(bundle.html).toContain("<!doctype html>");
    expect(bundle.html).toContain("Content-Security-Policy");
    expect(bundle.html).not.toContain('</script><script>alert("xss")');
    expect(bundle.html).not.toContain("javascript:");
    expect(bundle.html).not.toContain("innerHTML");
    expect(bundle.html).not.toContain("localStorage");
    expect(bundle.html).toContain("https://cdn.toonstudio.cloud/sample.webp");
    expect(bundle.html).toContain("\\u003c/script\\u003e");
    expect(bundle.html).toContain("oklch(");
    expect(bundle.html.match(/<script\b/gi)?.length).toBe(2);
  });
});

describe("StudioGlobalReflowDnaPanel UI · 3탭 · KO/EN · Calm Atelier 위생 계약", () => {
  it("props 없이 마운트되며 3개 탭과 인터랙션·콜백이 정상 작동한다", () => {
    render(<StudioGlobalReflowDnaPanel />);
    expect(screen.getAllByRole("tab")).toHaveLength(3);
    cleanup();

    const onReflowComputed = vi.fn();
    const onCameraSolved = vi.fn();
    const onStyleAuditRun = vi.fn();
    const onBundleBuilt = vi.fn();

    render(
      <StudioGlobalReflowDnaPanel
        locale="ko"
        onReflowComputed={onReflowComputed}
        onCameraSolved={onCameraSolved}
        onStyleAuditRun={onStyleAuditRun}
        onBundleBuilt={onBundleBuilt}
      />,
    );

    // 탭 1: 양방향 리플로우
    expect(screen.getByTestId("reflow-print-summary").textContent).toContain("0건");
    fireEvent.click(screen.getByRole("button", { name: /일본 신서판/i }));
    expect(screen.getByTestId("reflow-print-summary").textContent).toContain("1394×2126px");
    fireEvent.click(screen.getByRole("button", { name: /단행본 → 800px 세로 스크롤/i }));
    expect(screen.getByTestId("reflow-scroll-summary").textContent).toContain("800px");
    fireEvent.click(screen.getByRole("button", { name: /양방향 리플로우 검증/i }));
    expect(onReflowComputed).toHaveBeenCalledTimes(1);

    // 탭 2: 2D→3D 소실점 역산 · 스타일 DNA 락
    fireEvent.click(screen.getByRole("tab", { name: /2D→3D 소실점 역산/i }));
    expect(screen.getByTestId("perspective-camera-readout").textContent).toContain("52.00°");
    fireEvent.click(screen.getByRole("button", { name: /앙각\(로우앵글\) 액션/i }));
    expect(screen.getByTestId("perspective-camera-readout").textContent).toContain("42.00°");
    fireEvent.click(screen.getByRole("button", { name: /역산 3D 카메라 씬 동기화/i }));
    expect(onCameraSolved).toHaveBeenCalledTimes(1);

    expect(screen.getByTestId("style-dna-score-card").textContent).toContain("rejected-drift");
    fireEvent.click(screen.getByRole("button", { name: /정상 컷 \(DNA 일치\)/i }));
    expect(screen.getByTestId("style-dna-score-card").textContent).toContain("locked-pass");
    fireEvent.click(screen.getByRole("button", { name: /스타일 DNA 자동 보정 리포트 확정/i }));
    expect(onStyleAuditRun).toHaveBeenCalledTimes(1);

    // 탭 3: 선택지 분기형 인터랙티브 웹툰
    fireEvent.click(screen.getByRole("tab", { name: /선택지 분기형 인터랙티브 웹툰/i }));
    expect(screen.getByTestId("interactive-graph-badge").textContent).toContain("검증 통과");
    fireEvent.click(screen.getByRole("button", { name: /청동 열쇠로 정문을 연다/i }));
    expect(screen.getByTestId("interactive-preview-stage").textContent).toContain("멈춘 진자의 홀");
    fireEvent.click(screen.getByRole("button", { name: /원본 기록을 들고 탈출한다/i }));
    expect(screen.getByTestId("interactive-preview-stage").textContent).toContain("TRUE ENDING");
    fireEvent.click(screen.getByRole("button", { name: /결함 진단/i }));
    expect(screen.getByTestId("interactive-graph-badge").textContent).toContain("데드엔드");
    fireEvent.click(screen.getByRole("button", { name: /독립 HTML5 번들 출고/i }));
    expect(onBundleBuilt).toHaveBeenCalledTimes(1);
  });

  it("영어(en) 로케일 렌더링 및 배럴 금지·줄 수 제한·원시 색상/localStorage/transition-all 금지 계약을 지킨다", () => {
    render(<StudioGlobalReflowDnaPanel locale="en" />);
    expect(screen.getByRole("tab", { name: "Scroll ↔ Print Reflow" })).toBeTruthy();
    expect(screen.getByTestId("reflow-print-summary").textContent).toContain("0 (Safe)");

    const dir = resolve(process.cwd(), "apps/web/src/domains/creator/global-reflow-dna");
    expect(existsSync(resolve(dir, "index.ts"))).toBe(false);
    expect(existsSync(resolve(dir, "index.tsx"))).toBe(false);

    const files = [
      { name: "reflow-perspective-matcher.ts", maxLines: 700 },
      { name: "style-dna-and-interactive-branch.ts", maxLines: 680 },
      { name: "StudioGlobalReflowDnaPanel.tsx", maxLines: 460 },
      { name: "global-reflow-dna.test.tsx", maxLines: 750 },
    ] as const;

    for (const file of files) {
      const source = readFileSync(resolve(dir, file.name), "utf8");
      const lineCount = source.split("\n").length - (source.endsWith("\n") ? 1 : 0);
      expect(lineCount).toBeLessThanOrEqual(file.maxLines);
      if (file.name !== "global-reflow-dna.test.tsx") {
        expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
        expect(source).not.toMatch(/\brgba?\s*\(/i);
        expect(source).not.toMatch(/\bhsla?\s*\(/i);
        expect(source).not.toContain("localStorage");
      }
      if (file.name === "StudioGlobalReflowDnaPanel.tsx") {
        expect(source).not.toContain("transition-all");
        expect(source).toContain("[word-break:keep-all]");
        expect(source).toContain("tabular-nums");
      }
    }
  });
});
