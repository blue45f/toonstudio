import { describe, expect, it } from "vitest";

import { planPanelReflow } from "../panel-detect/panel-reflow-plan";

import { analyzeEyeFlowAndTailGuard } from "./studio-eyeflow-geometry";
import {
  analyzeReaderPagesEyeFlow,
  applyRhythmPresetToEyeFlowPage,
  computeStudioPageRhythmPlan,
  type EyeFlowPageLike,
} from "./studio-eyeflow-page-adapter";
import {
  computeAutoCutRhythmPlan,
  computeMobileViewportCanvasSpanPx,
  detectMobileViewportSpoilerRisks,
  type AutoCutRhythmInput,
} from "./studio-eyeflow-rhythm-solver";

describe("자동 컷 리듬 & 시선 동선 솔버 (#121–#125)", () => {
  const sampleCuts: readonly AutoCutRhythmInput[] = [
    {
      id: "cut-1",
      bounds: { x: 20, y: 0, width: 680, height: 420 },
      visualDensity01: 0.35,
      dialogueCharCount: 14,
      balloonCount: 1,
      balloons: [
        { id: "b1", readingOrder: 1, text: "잠깐, 저 문 뒤를 봐.", bounds: { x: 60, y: 280, width: 200, height: 80 }, cutId: "cut-1" },
      ],
    },
    {
      id: "cut-2",
      bounds: { x: 20, y: 500, width: 680, height: 420 },
      visualDensity01: 0.72,
      dialogueCharCount: 42,
      balloonCount: 1,
      balloons: [
        { id: "b2", readingOrder: 2, text: "설마 아까 사라진 열쇠가 저기 놓여 있던 거야?", bounds: { x: 420, y: 560, width: 220, height: 90 }, cutId: "cut-2" },
      ],
    },
    {
      id: "cut-3",
      bounds: { x: 20, y: 1_000, width: 680, height: 520 },
      visualDensity01: 0.88,
      dialogueCharCount: 12,
      balloonCount: 1,
      isClimaxBeat: true,
      climaxIntensity01: 1,
      balloons: [
        { id: "b3", readingOrder: 3, text: "범인은 너였어!", bounds: { x: 240, y: 1_060, width: 220, height: 86 }, cutId: "cut-3" },
      ],
    },
    {
      id: "cut-4",
      bounds: { x: 20, y: 1_620, width: 680, height: 400 },
      visualDensity01: 0.25,
      dialogueCharCount: 0,
      balloonCount: 0,
      balloons: [],
    },
  ];

  it("컷 밀도·대사 글자 수·클라이맥스 비트가 거터 높이에 결정적으로 반영된다", () => {
    const plan = computeAutoCutRhythmPlan({
      canvasWidth: 720,
      cuts: sampleCuts,
      preset: "tension-escalation",
      enableMobileSpoilerGuard: false,
    });

    expect(plan.gutters).toHaveLength(3);
    // 클라이맥스(cut-3) 진입 거터가 일반 컷 전환보다 극적으로 넓어진다.
    const normalGap = plan.gutters[0]!;
    const climaxEntryGap = plan.gutters[1]!;
    expect(climaxEntryGap.climaxDeltaPx).toBeGreaterThan(normalGap.climaxDeltaPx);
    expect(climaxEntryGap.rhythmGutterPx).toBeGreaterThan(normalGap.rhythmGutterPx);
    expect(climaxEntryGap.reasonKo).toContain("클라이맥스 비트");
  });

  it("1클릭 3종 리듬 변환(긴장 고조 / 코미디 템포 / 감정 여운)이 서로 구별되는 페이싱을 생성한다", () => {
    const quietAndDialogueCuts: readonly AutoCutRhythmInput[] = [
      { id: "c1", bounds: { x: 0, y: 0, width: 720, height: 420 }, visualDensity01: 0.4, dialogueCharCount: 16, balloonCount: 1 },
      { id: "c2", bounds: { x: 0, y: 500, width: 720, height: 420 }, visualDensity01: 0.4, dialogueCharCount: 16, balloonCount: 1 },
      { id: "c3", bounds: { x: 0, y: 1_000, width: 720, height: 420 }, visualDensity01: 0.3, dialogueCharCount: 0, balloonCount: 0 },
    ];

    const comedy = computeAutoCutRhythmPlan({
      canvasWidth: 720,
      cuts: quietAndDialogueCuts,
      preset: "comedy-tempo",
      enableMobileSpoilerGuard: false,
    });
    const tension = computeAutoCutRhythmPlan({
      canvasWidth: 720,
      cuts: quietAndDialogueCuts,
      preset: "tension-escalation",
      enableMobileSpoilerGuard: false,
    });
    const emotional = computeAutoCutRhythmPlan({
      canvasWidth: 720,
      cuts: quietAndDialogueCuts,
      preset: "emotional-lingering",
      enableMobileSpoilerGuard: false,
    });

    expect(comedy.presetLabelKo).toBe("코미디 템포");
    expect(tension.presetLabelKo).toBe("긴장 고조");
    expect(emotional.presetLabelKo).toBe("감정 여운");
    expect(comedy.averageGutterPx).toBeLessThan(tension.averageGutterPx);
    expect(tension.averageGutterPx).toBeLessThan(emotional.averageGutterPx);
  });

  it("390×844 모바일 1뷰포트 스포일러 방지 가드(#125)가 연속 대사 말풍선 2개의 동시 노출을 0건으로 차단한다", () => {
    // 1) 390px 기준 캔버스 (1뷰포트 = 정확히 844px)
    const mobileSpan390 = computeMobileViewportCanvasSpanPx(390);
    expect(mobileSpan390).toBe(844);

    const compactMobileCuts: readonly AutoCutRhythmInput[] = [
      {
        id: "m-cut-1",
        bounds: { x: 0, y: 0, width: 390, height: 400 },
        visualDensity01: 0.5,
        dialogueCharCount: 10,
        balloonCount: 1,
        balloons: [
          { id: "mb-1", readingOrder: 1, text: "진실을 말해줘.", bounds: { x: 20, y: 260, width: 180, height: 80 }, cutId: "m-cut-1" },
        ],
      },
      {
        id: "m-cut-2",
        bounds: { x: 0, y: 480, width: 390, height: 400 },
        visualDensity01: 0.5,
        dialogueCharCount: 12,
        balloonCount: 1,
        balloons: [
          { id: "mb-2", readingOrder: 2, text: "사실 네 형이...", bounds: { x: 180, y: 520, width: 180, height: 80 }, cutId: "m-cut-2" },
        ],
      },
    ];

    const guarded390 = computeAutoCutRhythmPlan({
      canvasWidth: 390,
      cuts: compactMobileCuts,
      preset: "comedy-tempo",
      enableMobileSpoilerGuard: true,
    });

    expect(guarded390.spoilerRisksBeforeCount).toBe(1);
    expect(guarded390.spoilerRisksAfterCount).toBe(0);
    expect(guarded390.gutters[0]!.spoilerGuardAddedPx).toBeGreaterThan(0);

    const b1After = guarded390.repositionedBalloons[0]!;
    const b2After = guarded390.repositionedBalloons[1]!;
    // 어떤 스크롤 위치에서도 b1과 b2가 390×844 1화면에 동시에 들어올 수 없음을 수학적으로 검증
    const gapAfter390 = b2After.bounds.y - (b1After.bounds.y + b1After.bounds.height);
    expect(gapAfter390).toBeGreaterThanOrEqual(844);

    // 2) 720px 웹툰 캔버스 (390×844 폭 맞춤 시 1뷰포트 = 1559px)
    const guarded720 = computeAutoCutRhythmPlan({
      canvasWidth: 720,
      cuts: sampleCuts,
      preset: "tension-escalation",
      enableMobileSpoilerGuard: true,
    });
    expect(guarded720.viewportSpanCanvasPx).toBe(1_559);
    expect(guarded720.spoilerRisksBeforeCount).toBe(2);
    expect(guarded720.spoilerRisksAfterCount).toBe(0);

    for (let i = 0; i < guarded720.repositionedBalloons.length - 1; i += 1) {
      const prev = guarded720.repositionedBalloons[i]!;
      const next = guarded720.repositionedBalloons[i + 1]!;
      const verticalGap = next.bounds.y - (prev.bounds.y + prev.bounds.height);
      expect(verticalGap).toBeGreaterThanOrEqual(guarded720.viewportSpanCanvasPx);
    }

    // 재배치된 컷 거터를 panel-detect 리플로우 계획(cutGaps)에 그대로 연결할 수 있다.
    const reflowPlan = planPanelReflow(
      sampleCuts.map((c) => ({ id: c.id, ...c.bounds })),
      {
        targetWidth: 720,
        gap: 80,
        scaleMode: "fit-width",
        cutGaps: guarded720.gutters.map((g) => g.finalGutterPx),
      },
    );
    expect(reflowPlan.placements).toHaveLength(sampleCuts.length);
  });

  it("S-패턴 시선 역행 및 말풍선 꼬리 X-교차를 정확히 검출하고 공유 끝점은 오탐하지 않는다", () => {
    // 1) 정상 S-패턴(1행 좌→우, 2행 우→좌 사행)은 역행 0건
    const naturalS = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      patternMode: "s-pattern",
      balloons: [
        { id: "s1", readingOrder: 1, bounds: { x: 40, y: 80, width: 160, height: 70 } },
        { id: "s2", readingOrder: 2, bounds: { x: 480, y: 90, width: 160, height: 70 } },
        { id: "s3", readingOrder: 3, bounds: { x: 460, y: 340, width: 160, height: 70 } },
        { id: "s4", readingOrder: 4, bounds: { x: 60, y: 350, width: 160, height: 70 } },
      ],
      faces: [],
    });
    expect(naturalS.detectedPattern).toBe("s-pattern");
    expect(naturalS.reversals).toHaveLength(0);

    // 2) S-패턴 2행에서 다시 좌→우로 역주행하면 s-pattern-backtrack 경고
    const reversedS = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      patternMode: "s-pattern",
      balloons: [
        { id: "s1", readingOrder: 1, bounds: { x: 40, y: 80, width: 160, height: 70 } },
        { id: "s2", readingOrder: 2, bounds: { x: 480, y: 90, width: 160, height: 70 } },
        { id: "s3", readingOrder: 3, bounds: { x: 60, y: 340, width: 160, height: 70 } },
        { id: "s4", readingOrder: 4, bounds: { x: 480, y: 350, width: 160, height: 70 } },
      ],
      faces: [],
    });
    expect(reversedS.reversals.some((r) => r.reason === "s-pattern-backtrack")).toBe(true);

    // 3) 두 말풍선 꼬리가 X자로 교차하면 tailCrossings에 교차점과 함께 보고된다.
    const crossedTails = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "left-b",
          readingOrder: 1,
          bounds: { x: 40, y: 80, width: 160, height: 70 },
          tailBase: { x: 160, y: 150 },
          tailTip: { x: 520, y: 360 },
        },
        {
          id: "right-b",
          readingOrder: 2,
          bounds: { x: 480, y: 80, width: 160, height: 70 },
          tailBase: { x: 520, y: 150 },
          tailTip: { x: 160, y: 360 },
        },
      ],
      faces: [],
    });
    expect(crossedTails.tailCrossings).toHaveLength(1);
    expect(crossedTails.tailCrossings[0]?.severity).toBe("critical");
    expect(crossedTails.tailCrossings[0]?.intersectionPoint.x).toBeCloseTo(340, 0);
    expect(crossedTails.tailCrossings[0]?.intersectionPoint.y).toBeCloseTo(255, 0);
    expect(crossedTails.status).toBe("blocked");

    // 4) 같은 화자 입 끝점(t=1)을 공유하는 두 꼬리는 교차 오탐 없이 통과한다.
    const sharedSpeaker = analyzeEyeFlowAndTailGuard({
      canvasWidth: 720,
      canvasHeight: 1_280,
      balloons: [
        {
          id: "b1",
          readingOrder: 1,
          bounds: { x: 40, y: 80, width: 160, height: 70 },
          tailBase: { x: 160, y: 150 },
          tailTip: { x: 340, y: 360 },
        },
        {
          id: "b2",
          readingOrder: 2,
          bounds: { x: 480, y: 80, width: 160, height: 70 },
          tailBase: { x: 520, y: 150 },
          tailTip: { x: 340, y: 360 },
        },
      ],
      faces: [],
    });
    expect(sharedSpeaker.tailCrossings).toHaveLength(0);
  });

  it("applyRhythmPresetToEyeFlowPage가 실제 ToonStudio 페이지에 리듬 변환과 스포일러 가드를 비파괴 적용한다", () => {
    const page: EyeFlowPageLike = {
      id: "ep1-p1",
      name: "1페이지",
      canvasW: 720,
      canvasH: 1_600,
      elements: [
        { id: "cut-1", type: "frame", x: 20, y: 20, width: 680, height: 480 },
        { id: "b1", type: "bubble", x: 60, y: 320, width: 200, height: 80, text: "첫 번째 대사" },
        { id: "cut-2", type: "frame", x: 20, y: 580, width: 680, height: 480, isClimaxBeat: true },
        { id: "b2", type: "bubble", x: 420, y: 640, width: 200, height: 80, text: "충격적인 반전!" },
      ],
    };

    const beforeSummary = analyzeReaderPagesEyeFlow([page]);
    expect(beforeSummary.spoilerRiskCount).toBe(1);
    expect(beforeSummary.rhythmPreviews).toHaveLength(3);

    const { page: transformed, plan } = applyRhythmPresetToEyeFlowPage(
      page,
      "emotional-lingering",
      { enableMobileSpoilerGuard: true },
    );
    expect(plan.spoilerRisksAfterCount).toBe(0);
    expect(transformed.canvasH).toBeGreaterThan(page.canvasH);
    // 원본 페이지는 불변
    expect(page.elements[2]?.y).toBe(580);

    const afterSummary = analyzeReaderPagesEyeFlow([transformed]);
    expect(afterSummary.spoilerRiskCount).toBe(0);

    const pagePlan = computeStudioPageRhythmPlan(transformed, "comedy-tempo");
    expect(pagePlan.spoilerRisksBeforeCount).toBe(0);
    expect(detectMobileViewportSpoilerRisks({
      canvasWidth: 720,
      nodes: afterSummary.byPageId.get("ep1-p1")!.nodes,
      cuts: [
        { id: "cut-1", bounds: { x: 20, y: transformed.elements[0]!.y!, width: 680, height: 480 } },
        { id: "cut-2", bounds: { x: 20, y: transformed.elements[2]!.y!, width: 680, height: 480 } },
      ],
    })).toHaveLength(0);
  });
});
