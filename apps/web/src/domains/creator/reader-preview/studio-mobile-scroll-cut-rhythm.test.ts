import { describe, expect, it } from "vitest";

import {
  analyzeStudioPagesMobileCutRhythm,
  extractMobileScrollCutsFromPages,
} from "./studio-mobile-scroll-cut-adapter";
import {
  MOBILE_SCROLL_VIEWPORT_HEIGHT_PX,
  MOBILE_SCROLL_VIEWPORT_WIDTH_PX,
  analyzeMobileScrollCutRhythm,
  type MobileScrollCutInput,
} from "./studio-mobile-scroll-cut-rhythm";

describe("studio-mobile-scroll-cut-rhythm", () => {
  it("returns a clean baseline report when no cuts are provided", () => {
    const report = analyzeMobileScrollCutRhythm([]);
    expect(report.cutCount).toBe(0);
    expect(report.viewportWidthPx).toBe(MOBILE_SCROLL_VIEWPORT_WIDTH_PX);
    expect(report.viewportHeightPx).toBe(MOBILE_SCROLL_VIEWPORT_HEIGHT_PX);
    expect(report.overallScore).toBe(100);
    expect(report.grade).toBe("A");
    expect(report.feedbacks).toHaveLength(0);
    expect(Object.isFrozen(report)).toBe(true);
  });

  it("detects a suffocating dense dialogue zone and emits exact Korean gap feedback", () => {
    const cuts: readonly MobileScrollCutInput[] = [
      { heightPx: 360, gapAfterPx: 140, dialogueCharCount: 18, cutType: "static" },
      { heightPx: 380, gapAfterPx: 140, dialogueCharCount: 20, cutType: "static" },
      // 3~4컷: 정적 컷 사이 여백 40px(기준 80px 미만) + 합산 대사 80자 → +40px 권장
      { heightPx: 360, gapAfterPx: 40, dialogueCharCount: 42, cutType: "static" },
      { heightPx: 360, gapAfterPx: 140, dialogueCharCount: 38, cutType: "static" },
    ];

    const report = analyzeMobileScrollCutRhythm(cuts);
    expect(report.suffocatingZones).toHaveLength(1);
    expect(report.suffocatingZones[0]?.startCut).toBe(3);
    expect(report.suffocatingZones[0]?.endCut).toBe(4);
    expect(report.suffocatingZones[0]?.recommendedAddGapPx).toBe(40);
    expect(report.suffocatingZones[0]?.feedbackKo).toBe(
      "3~4컷 사이 여백을 40px 넓히면 대사 호흡이 살아납니다",
    );
    expect(report.densityBreathScore).toBeLessThan(100);
    expect(report.feedbacks.some((fb) => fb.category === "suffocating")).toBe(true);
  });

  it("allows brisk gutters between light-dialogue action cuts without false suffocation alerts", () => {
    const cuts: readonly MobileScrollCutInput[] = [
      { heightPx: 380, gapAfterPx: 50, dialogueCharCount: 0, cutType: "action" },
      { heightPx: 400, gapAfterPx: 50, dialogueCharCount: 6, cutType: "action" },
      { heightPx: 420, gapAfterPx: 160, dialogueCharCount: 8, cutType: "action" },
    ];

    const report = analyzeMobileScrollCutRhythm(cuts);
    expect(report.suffocatingZones).toHaveLength(0);
    expect(report.draggingVoidZones).toHaveLength(0);
    expect(report.densityBreathScore).toBe(100);
    expect(report.overallScore).toBeGreaterThanOrEqual(88);
    expect(report.grade).toBe("A");
  });

  it("flags action cuts when heavy dialogue is crammed into an ultra-tight gutter", () => {
    const cuts: readonly MobileScrollCutInput[] = [
      { heightPx: 380, gapAfterPx: 24, dialogueCharCount: 50, cutType: "action" },
      { heightPx: 380, gapAfterPx: 120, dialogueCharCount: 40, cutType: "action" },
    ];

    const report = analyzeMobileScrollCutRhythm(cuts);
    expect(report.suffocatingZones).toHaveLength(1);
    expect(report.suffocatingZones[0]?.recommendedAddGapPx).toBe(40);
  });

  it("detects dragging void gaps and escalates gaps exceeding a full 844px mobile screen to critical", () => {
    const cuts: readonly MobileScrollCutInput[] = [
      // 1~2컷: 정상 장면 전환(340px) → 통과
      { heightPx: 380, gapAfterPx: 340, dialogueCharCount: 15, cutType: "static" },
      // 2~3컷: 늘어지는 빈 여백(640px) → warning
      { heightPx: 380, gapAfterPx: 640, dialogueCharCount: 15, cutType: "static" },
      // 3~4컷: 모바일 1화면(844px) 초과 빈 여백(920px) → critical
      { heightPx: 380, gapAfterPx: 920, dialogueCharCount: 10, cutType: "static" },
      { heightPx: 400, gapAfterPx: 120, dialogueCharCount: 12, cutType: "static" },
    ];

    const report = analyzeMobileScrollCutRhythm(cuts);
    expect(report.draggingVoidZones).toHaveLength(2);
    expect(report.draggingVoidZones[0]?.fromCut).toBe(2);
    expect(report.draggingVoidZones[0]?.toCut).toBe(3);
    expect(report.draggingVoidZones[0]?.severity).toBe("warning");
    expect(report.draggingVoidZones[0]?.exceedsFullMobileScreen).toBe(false);
    expect(report.draggingVoidZones[0]?.feedbackKo).toContain("640px");

    expect(report.draggingVoidZones[1]?.fromCut).toBe(3);
    expect(report.draggingVoidZones[1]?.toCut).toBe(4);
    expect(report.draggingVoidZones[1]?.severity).toBe("critical");
    expect(report.draggingVoidZones[1]?.exceedsFullMobileScreen).toBe(true);
    expect(report.draggingVoidZones[1]?.feedbackKo).toContain("모바일 1화면(844px)을 넘습니다");

    // critical 피드백이 warning보다 먼저 정렬된다.
    expect(report.feedbacks[0]?.severity).toBe("critical");
    expect(report.voidBalanceScore).toBeLessThan(60);
  });

  it("scores mobile 1-screen (844px) cut density and flags 4+ cuts crammed into a single viewport", () => {
    // 4개 컷 총 높이 = 170*4 + 30*3 = 770px <= 844px (한 화면에 4컷 동시 노출)
    const crowdedCuts: readonly MobileScrollCutInput[] = [
      { heightPx: 170, gapAfterPx: 30, dialogueCharCount: 10, cutType: "action" },
      { heightPx: 170, gapAfterPx: 30, dialogueCharCount: 10, cutType: "action" },
      { heightPx: 170, gapAfterPx: 30, dialogueCharCount: 10, cutType: "action" },
      { heightPx: 170, gapAfterPx: 140, dialogueCharCount: 10, cutType: "action" },
    ];

    const report = analyzeMobileScrollCutRhythm(crowdedCuts);
    expect(report.screenDensity.maxCutsPerScreen).toBe(4);
    expect(report.screenDensityScore).toBe(62);
    expect(report.screenDensity.crowdedWindows).toHaveLength(1);
    expect(report.screenDensity.crowdedWindows[0]?.startCut).toBe(1);
    expect(report.screenDensity.crowdedWindows[0]?.endCut).toBe(4);
    expect(report.screenDensity.crowdedWindows[0]?.feedbackKo).toContain("1~4컷(4컷)");
  });

  it("flags 3 cuts in one 844px screen when combined dialogue load is heavy", () => {
    const cuts: readonly MobileScrollCutInput[] = [
      { heightPx: 220, gapAfterPx: 85, dialogueCharCount: 35, cutType: "static" },
      { heightPx: 220, gapAfterPx: 85, dialogueCharCount: 35, cutType: "static" },
      { heightPx: 220, gapAfterPx: 160, dialogueCharCount: 30, cutType: "static" },
    ];

    const report = analyzeMobileScrollCutRhythm(cuts);
    expect(report.screenDensity.maxCutsPerScreen).toBe(3);
    expect(report.screenDensityScore).toBe(72);
    expect(report.screenDensity.crowdedWindows).toHaveLength(1);
    expect(report.screenDensity.crowdedWindows[0]?.feedbackKo).toContain("대사 100자");
  });

  it("extracts cuts from Studio 720px pages, ignores hidden elements, and projects onto 390x844", () => {
    const pages = [
      {
        id: "page-1",
        canvasH: 1_280,
        elements: [
          { id: "f1", type: "frame", y: 40, height: 500 },
          {
            id: "b1",
            type: "bubble",
            y: 120,
            height: 120,
            text: "지금 당장 문 밖으로 나가지 않으면 늦어 버립니다 서둘러요",
          },
          { id: "hidden-b", type: "bubble", y: 120, height: 80, text: "숨김 대사", hidden: true },
          // 2번 컷과 40px 간격(720px 기준 → 390px에서 21.7px!)
          { id: "f2", type: "frame", y: 580, height: 520 },
          {
            id: "b2",
            type: "bubble",
            y: 660,
            height: 120,
            text: "알았어 지금 바로 따라갈 테니까 먼저 계단 아래로 내려가 있어",
          },
        ],
      },
      {
        id: "page-2",
        canvasH: 1_280,
        elements: [
          { id: "f3", type: "frame", y: 120, height: 700 },
          { id: "sfx1", type: "sfx", y: 260, height: 120, text: "콰앙!" },
        ],
      },
    ];

    const cuts = extractMobileScrollCutsFromPages(pages, { pageGapPx: 24 });
    expect(cuts).toHaveLength(3);
    expect(cuts[0]?.cutType).toBe("static");
    expect(cuts[0]?.dialogueCharCount).toBeGreaterThan(25);
    expect(cuts[2]?.cutType).toBe("action");
    expect(cuts[2]?.dialogueCharCount).toBe(0);

    const report = analyzeStudioPagesMobileCutRhythm(pages, { pageGapPx: 24 });
    expect(report.mobileScale).toBeCloseTo(390 / 720, 3);
    expect(report.suffocatingZones).toHaveLength(1);
    expect(report.suffocatingZones[0]?.startCut).toBe(1);
    expect(report.suffocatingZones[0]?.endCut).toBe(2);
    expect(report.suffocatingZones[0]?.pageId).toBe("page-1");
  });
});
