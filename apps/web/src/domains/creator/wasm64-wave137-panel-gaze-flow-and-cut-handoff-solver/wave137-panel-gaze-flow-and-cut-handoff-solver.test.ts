/**
 * Wave 137 — 웹툰 컷 내 독자 시선 동선(Z/F/S-Curve Gaze Flow)·시각적 무게중심 및
 * 컷 전환 시선 연속성(Gaze Hand-off) 솔버 결정론적 Vitest 스위트 (40개 테스트).
 */

import { describe, expect, it } from "vitest";
import {
  ELEMENT_VISUAL_WEIGHT_MULTIPLIER,
  auditEpisodeGazeFlow,
  auditSinglePanelGazeFlow,
  computePanelVisualMass,
  computeVisualWeight,
  detectBalloonReadingOrderReversals,
  escapeGazeFlowXml,
  estimateVisualReadingOrder,
  findSegmentIntersection2D,
  normalizeGazePanel,
  optimizeBalloonPositionsForGazeFlow,
  rectsOverlapWithGap,
  renderEpisodeGazeFlowSvg,
  sha256GazeUtf8Hex,
  summarizeEpisodeGazeFlowKo,
  type GazeEpisodeInput,
  type GazePanelElementInput,
  type GazePanelInput,
} from "./index";

function makeBalloon(
  id: string,
  x: number,
  y: number,
  scriptOrder: number,
  w = 0.24,
  h = 0.14,
  extra?: Partial<GazePanelElementInput>,
): GazePanelElementInput {
  return {
    elementId: id,
    kind: "dialogue-balloon",
    labelKo: `대사 ${scriptOrder}`,
    x,
    y,
    width: w,
    height: h,
    scriptOrder,
    ...extra,
  };
}

function makeFace(
  id: string,
  x: number,
  y: number,
  gazeDir?: { readonly dx: number; readonly dy: number },
  w = 0.24,
  h = 0.24,
): GazePanelElementInput {
  return { elementId: id, kind: "character-face", labelKo: "주인공 얼굴", x, y, width: w, height: h, gazeDir };
}

function makePanel(
  panelId: string,
  elements: readonly GazePanelElementInput[],
  extra?: Partial<GazePanelInput>,
): GazePanelInput {
  return { panelId, widthPx: 800, heightPx: 1100, elements, ...extra };
}

describe("Wave 137 — 시각적 무게중심(Visual Weight & Balance)", () => {
  it("1. computeVisualWeight는 면적 × 대비 × 요소 유형 가중치를 정확히 곱한다", () => {
    const w = computeVisualWeight({
      elementId: "face-1", kind: "character-face", x: 0.2, y: 0.2, width: 0.25, height: 0.4, contrast: 0.8,
    });
    expect(w.areaNorm).toBeCloseTo(0.1, 4);
    expect(w.weight).toBeCloseTo(0.1 * 0.8 * ELEMENT_VISUAL_WEIGHT_MULTIPLIER["character-face"], 4);
  });

  it("2. 같은 면적·대비라면 얼굴이 말풍선·유도선보다 시각적 무게가 크다", () => {
    const base = { x: 0.1, y: 0.1, width: 0.2, height: 0.2, contrast: 0.85 };
    const face = computeVisualWeight({ ...base, elementId: "f", kind: "character-face" });
    const balloon = computeVisualWeight({ ...base, elementId: "b", kind: "dialogue-balloon" });
    const arrow = computeVisualWeight({ ...base, elementId: "a", kind: "lead-line-arrow" });
    expect(face.weight).toBeGreaterThan(balloon.weight);
    expect(balloon.weight).toBeGreaterThan(arrow.weight);
  });

  it("3. 좌우 대칭 배치 시 무게중심이 x=0.5, visualBalanceScore가 100이다", () => {
    const p = normalizeGazePanel(
      makePanel("p-sym", [
        makeBalloon("b1", 0.1, 0.2, 1, 0.2, 0.2, { contrast: 0.9 }),
        makeBalloon("b2", 0.7, 0.2, 2, 0.2, 0.2, { contrast: 0.9 }),
      ]),
      0,
    );
    const mass = computePanelVisualMass(p.elements);
    expect(mass.centerOfVisualMass.x).toBeCloseTo(0.5, 4);
    expect(mass.horizontalBias).toBeCloseTo(0, 4);
    expect(mass.leftWeightRatio).toBeCloseTo(0.5, 4);
    expect(mass.visualBalanceScore).toBe(100);
  });

  it("4. 우측 편중 배치 시 horizontalBias 양수 및 낮은 균형 점수를 반환한다", () => {
    const p = normalizeGazePanel(
      makePanel("p-right", [
        makeFace("f-r", 0.72, 0.35, { dx: -1, dy: 0 }, 0.24, 0.3),
        makeBalloon("b-r", 0.7, 0.1, 1, 0.26, 0.16),
      ]),
      0,
    );
    const mass = computePanelVisualMass(p.elements);
    expect(mass.centerOfVisualMass.x).toBeGreaterThan(0.8);
    expect(mass.horizontalBias).toBeGreaterThan(0.6);
    expect(mass.rightWeightRatio).toBe(1);
    expect(mass.visualBalanceScore).toBeLessThan(30);
  });

  it("5. 중앙선(x=0.5)에 걸친 요소는 좌우 면적 비례로 무게를 분할한다", () => {
    const p = normalizeGazePanel(makePanel("p-mid", [makeFace("f-mid", 0.3, 0.3, undefined, 0.4, 0.4)]), 0);
    const mass = computePanelVisualMass(p.elements);
    expect(mass.centerOfVisualMass.x).toBeCloseTo(0.5, 4);
    expect(mass.leftWeightRatio).toBeCloseTo(0.5, 4);
    expect(mass.visualBalanceScore).toBe(100);
  });

  it("6. 빈 컷과 비정상 NaN/Infinity 입력도 유한 수치로 안전 보정된다", () => {
    const emptyMass = computePanelVisualMass([]);
    expect(emptyMass.centerOfVisualMass).toEqual({ x: 0.5, y: 0.5 });
    expect(emptyMass.visualBalanceScore).toBe(100);

    const weird = normalizeGazePanel(
      {
        panelId: " ",
        widthPx: Number.NaN,
        heightPx: Number.POSITIVE_INFINITY,
        elements: [
          { elementId: "", kind: "sfx-lettering", x: Number.NaN, y: -5, width: Number.POSITIVE_INFINITY, height: -2, contrast: Number.NaN },
        ],
      },
      2,
    );
    expect(weird.panelId).toBe("panel-3");
    expect(Number.isFinite(weird.aspectRatio)).toBe(true);
    expect(Number.isFinite(weird.elements[0]?.cx ?? Number.NaN)).toBe(true);
  });
});

describe("Wave 137 — 3종 읽기 방향 시각 순서 추정 및 말풍선 역독 탐지", () => {
  it("7. 웹툰 세로 LTR: 같은 높이에서 우측 1번·좌측 2번이면 말풍선 역독을 탐지한다", () => {
    const p = normalizeGazePanel(
      makePanel("w-rev", [makeBalloon("b1-r", 0.68, 0.16, 1), makeBalloon("b2-l", 0.08, 0.19, 2)], { heightPx: 1200 }),
      0,
    );
    const order = estimateVisualReadingOrder(p.elements, "vertical-webtoon-ltr");
    expect(order.map((o) => o.elementId)).toEqual(["b2-l", "b1-r"]);
    const rev = detectBalloonReadingOrderReversals(order);
    expect(rev).toHaveLength(1);
    expect(rev[0]?.earlierVisualId).toBe("b2-l");
  });

  it("8. 웹툰 세로 LTR: 세로 간격이 충분하면 상단 우측 1번→하단 좌측 2번은 정상이다", () => {
    const p = normalizeGazePanel(
      makePanel("w-ok", [
        makeBalloon("b1", 0.66, 0.08, 1),
        makeBalloon("b2", 0.08, 0.36, 2),
        makeBalloon("b3", 0.64, 0.72, 3),
      ], { heightPx: 1200 }),
      0,
    );
    const order = estimateVisualReadingOrder(p.elements, "vertical-webtoon-ltr");
    expect(order.map((o) => o.elementId)).toEqual(["b1", "b2", "b3"]);
    expect(detectBalloonReadingOrderReversals(order)).toHaveLength(0);
  });

  it("9. 출판 만화 LTR: 상단 좌→우, 하단 좌→우 순서는 역독 0건이다", () => {
    const p = normalizeGazePanel(
      makePanel("c-ltr-ok", [
        makeBalloon("b1", 0.08, 0.08, 1),
        makeBalloon("b2", 0.66, 0.12, 2),
        makeBalloon("b3", 0.1, 0.68, 3),
        makeBalloon("b4", 0.68, 0.72, 4),
      ], { widthPx: 720, heightPx: 540 }),
      0,
    );
    const order = estimateVisualReadingOrder(p.elements, "page-comic-ltr");
    expect(order.map((o) => o.elementId)).toEqual(["b1", "b2", "b3", "b4"]);
    expect(detectBalloonReadingOrderReversals(order)).toHaveLength(0);
  });

  it("10. 출판 만화 LTR: 상단 우측 1번·좌측 2번(같은 행 밴드)이면 역독을 탐지한다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("c-ltr-rev", [makeBalloon("b1-tr", 0.68, 0.1, 1), makeBalloon("b2-tl", 0.08, 0.16, 2)], { widthPx: 720, heightPx: 540 }),
      0,
      "page-comic-ltr",
    );
    expect(audit.reversals).toHaveLength(1);
    expect(audit.violations.some((v) => v.code === "balloon-reading-order-reversal")).toBe(true);
  });

  it("11. 일본식 만화 RTL: 우→좌는 정상, 좌→우는 역독으로 판별한다", () => {
    const rtlOk = auditSinglePanelGazeFlow(
      makePanel("rtl-ok", [
        makeBalloon("b1-tr", 0.68, 0.08, 1),
        makeBalloon("b2-tl", 0.08, 0.14, 2),
        makeBalloon("b3-br", 0.66, 0.64, 3),
        makeBalloon("b4-bl", 0.1, 0.7, 4),
      ], { widthPx: 640, heightPx: 880 }),
      0,
      "manga-rtl",
    );
    expect(rtlOk.reversals).toHaveLength(0);
    expect(rtlOk.visualReadingOrder.map((v) => v.elementId)).toEqual(["b1-tr", "b2-tl", "b3-br", "b4-bl"]);

    const rtlRev = auditSinglePanelGazeFlow(
      makePanel("rtl-rev", [makeBalloon("b1-tl", 0.08, 0.1, 1), makeBalloon("b2-tr", 0.68, 0.15, 2)], { widthPx: 640, heightPx: 880 }),
      0,
      "manga-rtl",
    );
    expect(rtlRev.reversals).toHaveLength(1);
    expect(rtlRev.reversals[0]?.earlierVisualId).toBe("b2-tr");
  });

  it("12. 입력 요소 배열 순서를 뒤섞어도 시각 읽기 순서는 100% 동일하다", () => {
    const els: GazePanelElementInput[] = [
      makeBalloon("b3", 0.1, 0.65, 3),
      makeBalloon("b1", 0.1, 0.1, 1),
      makeFace("f1", 0.42, 0.35),
      makeBalloon("b2", 0.68, 0.12, 2),
      makeBalloon("b4", 0.68, 0.68, 4),
    ];
    const pA = normalizeGazePanel(makePanel("p", els), 0);
    const pB = normalizeGazePanel(makePanel("p", els.slice().reverse()), 0);
    expect(estimateVisualReadingOrder(pA.elements, "page-comic-ltr").map((e) => e.elementId)).toEqual(
      estimateVisualReadingOrder(pB.elements, "page-comic-ltr").map((e) => e.elementId),
    );
  });
});

describe("Wave 137 — 2D 선분 교차 탐지 및 동선 패턴(Z/S/수직/대각/엉킴) 분류", () => {
  it("13. findSegmentIntersection2D가 X자 교차점과 평행 비중첩을 정확히 판정한다", () => {
    const cross = findSegmentIntersection2D({ x: 0.1, y: 0.1 }, { x: 0.9, y: 0.9 }, { x: 0.9, y: 0.1 }, { x: 0.1, y: 0.9 });
    expect(cross?.x).toBeCloseTo(0.5, 4);
    expect(cross?.y).toBeCloseTo(0.5, 4);
    expect(findSegmentIntersection2D({ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.2 }, { x: 0.1, y: 0.6 }, { x: 0.9, y: 0.6 })).toBeNull();
  });

  it("14. findSegmentIntersection2D가 공선 중첩(collinear overlap)을 교차로 탐지한다", () => {
    const hit = findSegmentIntersection2D({ x: 0.1, y: 0.5 }, { x: 0.6, y: 0.5 }, { x: 0.4, y: 0.5 }, { x: 0.9, y: 0.5 });
    expect(hit?.x).toBeCloseTo(0.5, 4);
    expect(hit?.y).toBeCloseTo(0.5, 4);
  });

  it("15. X자 엉킴 배치(TL→BR→TR→BL)에서 self-intersecting-gaze-path와 tangled-zigzag를 탐지한다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-x", [
        makeBalloon("b1", 0.08, 0.1, 1),
        makeBalloon("b2", 0.68, 0.72, 2),
        makeBalloon("b3", 0.68, 0.1, 3),
        makeBalloon("b4", 0.08, 0.72, 4),
      ]),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.intersections.length).toBeGreaterThanOrEqual(1);
    expect(audit.pattern).toBe("tangled-zigzag");
    expect(audit.backtrackingRatio).toBeGreaterThan(0.2);
    expect(audit.violations.some((v) => v.code === "self-intersecting-gaze-path")).toBe(true);
  });

  it("16. 전형적인 4점 Z자 배치(TL→TR→BL→BR)를 z-flow로 분류한다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-z", [
        makeBalloon("b1", 0.08, 0.08, 1),
        makeBalloon("b2", 0.68, 0.09, 2),
        makeBalloon("b3", 0.08, 0.72, 3),
        makeBalloon("b4", 0.68, 0.73, 4),
      ], { heightPx: 900 }),
      0,
      "page-comic-ltr",
    );
    expect(audit.pattern).toBe("z-flow");
    expect(audit.reversals).toHaveLength(0);
    expect(audit.intersections).toHaveLength(0);
    expect(audit.panelFlowScore).toBeGreaterThanOrEqual(85);
  });

  it("17. 완만한 세로 곡선 파동 배치를 s-flow로 분류한다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-s", [
        makeBalloon("b1", 0.1, 0.06, 1, 0.22, 0.1),
        makeFace("f1", 0.64, 0.26, { dx: -0.6, dy: 0.8 }, 0.22, 0.14),
        makeBalloon("b2", 0.12, 0.54, 2, 0.22, 0.1),
        makeBalloon("b3", 0.66, 0.78, 3, 0.22, 0.1),
      ], { heightPx: 1400 }),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.pattern).toBe("s-flow");
    expect(audit.intersections).toHaveLength(0);
    expect(audit.reversals).toHaveLength(0);
  });

  it("18. 중앙 수직 정렬 배치를 vertical-drop으로 분류한다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-vert", [
        makeBalloon("b1", 0.38, 0.08, 1),
        makeFace("f1", 0.38, 0.4, { dx: 0, dy: 1 }),
        makeBalloon("b2", 0.38, 0.78, 2),
      ], { heightPx: 1400 }),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.pattern).toBe("vertical-drop");
    expect(audit.meanTurnAngleDeg).toBeLessThanOrEqual(15);
  });

  it("19. 좌상단에서 우하단으로 일직선 절단 배치를 diagonal-slash로 분류한다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-diag", [
        makeBalloon("b1", 0.06, 0.08, 1, 0.2, 0.12),
        { elementId: "act-1", kind: "action-focal", x: 0.4, y: 0.44, width: 0.2, height: 0.14 },
        { elementId: "sfx-1", kind: "sfx-lettering", x: 0.74, y: 0.78, width: 0.2, height: 0.14 },
      ], { heightPx: 900 }),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.pattern).toBe("diagonal-slash");
    expect(audit.meanTurnAngleDeg).toBeLessThan(20);
  });

  it("20. 컷 내부 역주행(위로 되짚기)이 발생하면 backtrackingRatio가 양수로 집계된다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-back", [makeBalloon("b1-bot", 0.38, 0.76, 1), makeBalloon("b2-top", 0.38, 0.1, 2)]),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.reversals).toHaveLength(1);
    expect(audit.backtrackingDistanceNorm).toBeGreaterThan(0.5);
    expect(audit.backtrackingRatio).toBeGreaterThan(0.9);
    expect(audit.pattern).toBe("tangled-zigzag");
  });
});

describe("Wave 137 — 외곽 시선 이탈 및 연속 컷 시선 핸드오프(Gaze Hand-off)", () => {
  it("21. 웹툰 컷 우측 가장자리 캐릭터가 밖(우측)을 바라보면 outward-gaze-leak을 탐지한다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-leak", [makeBalloon("b1", 0.1, 0.1, 1), makeFace("f-edge", 0.72, 0.42, { dx: 1, dy: 0 }, 0.22, 0.24)]),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.outwardLeaks).toHaveLength(1);
    expect(audit.outwardLeaks[0]?.leakEdge).toBe("right");
    expect(audit.violations.some((v) => v.code === "outward-gaze-leak")).toBe(true);
  });

  it("22. 캐릭터 시선이 같은 컷 내부의 다른 요소를 향하면 outward-gaze-leak이 아니다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-anchor", [
        makeFace("f-l", 0.1, 0.4, { dx: 1, dy: 0.05 }, 0.22, 0.22),
        makeFace("f-r", 0.68, 0.42, { dx: -1, dy: 0 }, 0.22, 0.22),
      ]),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.outwardLeaks).toHaveLength(0);
  });

  it("23. 웹툰 컷 하단 얼굴이 아래(다음 컷 방향)를 바라보면 외곽 이탈로 오탐하지 않는다", () => {
    const audit = auditSinglePanelGazeFlow(
      makePanel("p-down", [makeFace("f-bot", 0.4, 0.7, { dx: 0, dy: 1 }, 0.2, 0.22)]),
      0,
      "vertical-webtoon-ltr",
    );
    expect(audit.outwardLeaks).toHaveLength(0);
  });

  it("24. 일본 만화 RTL에서 좌측 출구 시선은 허용하고 우측 외곽 시선은 이탈로 탐지한다", () => {
    const okLeft = auditSinglePanelGazeFlow(
      makePanel("rtl-l", [makeFace("f-l", 0.08, 0.42, { dx: -1, dy: 0.1 }, 0.2, 0.2)], { widthPx: 640, heightPx: 880 }),
      0,
      "manga-rtl",
    );
    expect(okLeft.outwardLeaks).toHaveLength(0);

    const leakRight = auditSinglePanelGazeFlow(
      makePanel("rtl-r", [makeFace("f-r", 0.74, 0.42, { dx: 1, dy: 0 }, 0.2, 0.2)], { widthPx: 640, heightPx: 880 }),
      0,
      "manga-rtl",
    );
    expect(leakRight.outwardLeaks).toHaveLength(1);
    expect(leakRight.outwardLeaks[0]?.leakEdge).toBe("right");
  });

  it("25. 연속 컷 출구(우측 끝)→진입(좌측 끝) 수평 급도약 시 abrupt-handoff-jump를 탐지한다", () => {
    const audit = auditEpisodeGazeFlow({
      episodeId: "ep-jump",
      readingDirection: "vertical-webtoon-ltr",
      panels: [
        makePanel("cut-1", [makeBalloon("c1-b1", 0.12, 0.12, 1, 0.22, 0.12), makeBalloon("c1-b2", 0.74, 0.78, 2, 0.22, 0.12)]),
        makePanel("cut-2", [makeBalloon("c2-b1", 0.04, 0.1, 1, 0.2, 0.12), makeFace("c2-f1", 0.35, 0.55, { dx: 0, dy: 1 })]),
      ],
    });
    expect(audit.handoffs).toHaveLength(1);
    expect(audit.handoffs[0]?.horizontalJumpRatio).toBeGreaterThan(0.65);
    expect(audit.handoffs[0]?.abruptJumpDetected).toBe(true);
    expect(audit.violationCounts["abrupt-handoff-jump"]).toBe(1);
  });

  it("26. 출구점과 다음 진입점 수평 좌표가 근접하고 유도선 방향이 일치하면 높은 핸드오프 점수를 얻는다", () => {
    const audit = auditEpisodeGazeFlow({
      episodeId: "ep-smooth",
      readingDirection: "vertical-webtoon-ltr",
      panels: [
        makePanel("cut-1", [
          makeBalloon("c1-b1", 0.12, 0.1, 1, 0.22, 0.12),
          { elementId: "c1-arr", kind: "lead-line-arrow", x: 0.62, y: 0.78, width: 0.16, height: 0.14, gazeDir: { dx: 0.02, dy: 1 } },
        ]),
        makePanel("cut-2", [makeBalloon("c2-b1", 0.6, 0.08, 1, 0.22, 0.12), makeFace("c2-f1", 0.38, 0.52, { dx: 0, dy: 1 })]),
      ],
    });
    expect(audit.handoffs[0]?.abruptJumpDetected).toBe(false);
    expect(audit.handoffs[0]?.horizontalJumpRatio).toBeLessThan(0.08);
    expect(audit.handoffs[0]?.exitVectorAlignment).toBeGreaterThan(0.95);
    expect(audit.handoffs[0]?.handoffScore).toBeGreaterThan(90);
  });

  it("27. 출판 만화 LTR 같은 행 인접 컷에서는 우측 출구→좌측 진입이 자연스러운 핸드오프로 평가된다", () => {
    const audit = auditEpisodeGazeFlow({
      episodeId: "ep-page-row",
      readingDirection: "page-comic-ltr",
      panels: [
        makePanel("p1", [
          makeBalloon("p1-b1", 0.1, 0.12, 1),
          { elementId: "p1-arr", kind: "lead-line-arrow", x: 0.74, y: 0.52, width: 0.18, height: 0.14, gazeDir: { dx: 1, dy: 0 } },
        ], { widthPx: 600, heightPx: 500, pageRow: 0, pageCol: 0 }),
        makePanel("p2", [makeBalloon("p2-b1", 0.08, 0.5, 1), makeFace("p2-f1", 0.55, 0.55)], { widthPx: 600, heightPx: 500, pageRow: 0, pageCol: 1 }),
      ],
    });
    expect(audit.handoffs[0]?.isSameHorizontalRow).toBe(true);
    expect(audit.handoffs[0]?.abruptJumpDetected).toBe(false);
    expect(audit.handoffs[0]?.handoffScore).toBeGreaterThan(75);
  });
});

describe("Wave 137 — 말풍선 자동 교정 솔버(optimizeBalloonPositionsForGazeFlow)", () => {
  it("28. 웹툰 세로 LTR X자 교차+역독 컷을 자동 교정해 역독 0건·교차 0건 및 점수 향상을 증명한다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow({
      episodeId: "ep-fix-webtoon",
      titleKo: "제7화 옥상 대치",
      readingDirection: "vertical-webtoon-ltr",
      panels: [
        makePanel("cut-tangled", [
          makeFace("hero-face", 0.36, 0.36, { dx: 0, dy: 1 }, 0.28, 0.24),
          makeBalloon("b1", 0.08, 0.1, 1, 0.24, 0.12),
          makeBalloon("b2", 0.68, 0.76, 2, 0.24, 0.12),
          makeBalloon("b3", 0.68, 0.1, 3, 0.24, 0.12),
          makeBalloon("b4", 0.08, 0.76, 4, 0.24, 0.12),
        ], { heightPx: 1200 }),
      ],
    });
    expect(outcome.beforeAudit.violationCounts["balloon-reading-order-reversal"]).toBeGreaterThan(0);
    expect(outcome.beforeAudit.violationCounts["self-intersecting-gaze-path"]).toBeGreaterThan(0);
    expect(outcome.remainingReversals).toBe(0);
    expect(outcome.remainingIntersections).toBe(0);
    expect(outcome.allFacesCleared).toBe(true);
    expect(outcome.allInsideSafeMargin).toBe(true);
    expect(outcome.scoreDelta).toBeGreaterThan(25);
  });

  it("29. 자동 교정 후 모든 말풍선이 캐릭터 얼굴과 겹치지 않고 말풍선끼리도 겹치지 않는다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow(
      {
        episodeId: "ep-face-safe",
        readingDirection: "vertical-webtoon-ltr",
        panels: [
          makePanel("cut-crowded", [
            makeFace("face-a", 0.34, 0.28, { dx: 0, dy: 1 }, 0.32, 0.26),
            makeFace("face-b", 0.36, 0.62, { dx: 0, dy: 1 }, 0.28, 0.22),
            makeBalloon("b1", 0.66, 0.78, 1, 0.22, 0.11),
            makeBalloon("b2", 0.08, 0.12, 2, 0.22, 0.11),
            makeBalloon("b3", 0.66, 0.12, 3, 0.22, 0.11),
          ], { heightPx: 1200 }),
        ],
      },
      { safeMarginNorm: 0.04 },
    );
    expect(outcome.remainingReversals).toBe(0);
    expect(outcome.remainingIntersections).toBe(0);
    expect(outcome.allFacesCleared).toBe(true);
    expect(outcome.allInsideSafeMargin).toBe(true);

    const optPanel = outcome.afterAudit.panels[0]?.panel;
    const faces = optPanel?.elements.filter((e) => e.kind === "character-face") ?? [];
    const balloons = optPanel?.elements.filter((e) => e.kind === "dialogue-balloon") ?? [];
    for (const b of balloons) {
      for (const f of faces) expect(rectsOverlapWithGap(b, f, 0)).toBe(false);
    }
    for (let i = 0; i < balloons.length; i += 1) {
      for (let j = i + 1; j < balloons.length; j += 1) {
        const a = balloons[i];
        const b = balloons[j];
        if (a && b) expect(rectsOverlapWithGap(a, b, 0)).toBe(false);
      }
    }
  });

  it("30. 일본식 만화 RTL 역독 컷을 우→좌 규칙에 맞춰 자동 교정해 역독·교차 0건을 달성한다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow({
      episodeId: "ep-rtl-fix",
      readingDirection: "manga-rtl",
      panels: [
        makePanel("rtl-cut-1", [
          makeFace("face-center", 0.36, 0.36, { dx: -0.5, dy: 0.86 }, 0.26, 0.24),
          makeBalloon("b1", 0.08, 0.1, 1, 0.24, 0.12),
          makeBalloon("b2", 0.68, 0.12, 2, 0.24, 0.12),
          makeBalloon("b3", 0.08, 0.74, 3, 0.24, 0.12),
          makeBalloon("b4", 0.68, 0.76, 4, 0.24, 0.12),
        ], { widthPx: 680, heightPx: 920 }),
      ],
    });
    expect(outcome.beforeAudit.violationCounts["balloon-reading-order-reversal"]).toBeGreaterThan(0);
    expect(outcome.remainingReversals).toBe(0);
    expect(outcome.remainingIntersections).toBe(0);
    expect(outcome.allFacesCleared).toBe(true);
    expect(outcome.allInsideSafeMargin).toBe(true);
    expect(outcome.scoreDelta).toBeGreaterThan(20);
  });

  it("31. 출판 만화 LTR 역독 컷도 자동 교정 후 역독·교차 0건으로 수렴한다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow({
      episodeId: "ep-ltr-fix",
      readingDirection: "page-comic-ltr",
      panels: [
        makePanel("ltr-cut-1", [
          makeFace("f-mid", 0.38, 0.38, { dx: 0.8, dy: 0.6 }, 0.24, 0.22),
          makeBalloon("b1", 0.68, 0.1, 1, 0.22, 0.12),
          makeBalloon("b2", 0.08, 0.12, 2, 0.22, 0.12),
          makeBalloon("b3", 0.68, 0.74, 3, 0.22, 0.12),
        ], { widthPx: 760, heightPx: 580 }),
      ],
    });
    expect(outcome.beforeAudit.violationCounts["balloon-reading-order-reversal"]).toBeGreaterThan(0);
    expect(outcome.remainingReversals).toBe(0);
    expect(outcome.remainingIntersections).toBe(0);
    expect(outcome.allFacesCleared).toBe(true);
    expect(outcome.allInsideSafeMargin).toBe(true);
  });

  it("32. 이미 정상인 컷은 기본 모드에서 불필요하게 말풍선을 이동하지 않는다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow({
      episodeId: "ep-clean",
      readingDirection: "vertical-webtoon-ltr",
      panels: [
        makePanel("clean-1", [
          makeBalloon("b1", 0.08, 0.08, 1),
          makeFace("f1", 0.38, 0.38, { dx: 0, dy: 1 }),
          makeBalloon("b2", 0.64, 0.76, 2),
        ]),
      ],
    });
    expect(outcome.adjustments).toHaveLength(0);
    expect(outcome.optimizedPanelIds).toHaveLength(0);
    expect(outcome.scoreDelta).toBe(0);
  });

  it("33. locked=true로 고정된 말풍선은 자동 교정 중 좌표가 변하지 않는다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow({
      episodeId: "ep-locked",
      readingDirection: "vertical-webtoon-ltr",
      panels: [
        makePanel("cut-lock", [
          makeBalloon("b1-fixed", 0.08, 0.08, 1, 0.24, 0.12, { locked: true }),
          makeBalloon("b2", 0.66, 0.74, 2, 0.24, 0.12),
          makeBalloon("b3", 0.1, 0.36, 3, 0.24, 0.12),
        ], { heightPx: 1200 }),
      ],
    });
    const b1After = outcome.afterAudit.panels[0]?.panel.elements.find((e) => e.elementId === "b1-fixed");
    expect(b1After?.x).toBeCloseTo(0.08, 4);
    expect(b1After?.y).toBeCloseTo(0.08, 4);
    expect(outcome.remainingReversals).toBe(0);
  });

  it("34. 멀티 컷 에피소드 자동 교정 시 깨진 컷만 정확히 수정하고 정상 컷은 보존한다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow({
      episodeId: "ep-multi-fix",
      readingDirection: "vertical-webtoon-ltr",
      panels: [
        makePanel("ok-cut", [makeBalloon("a1", 0.1, 0.1, 1), makeBalloon("a2", 0.64, 0.72, 2)]),
        makePanel("bad-cut", [
          makeFace("f-mid", 0.36, 0.36, { dx: 0, dy: 1 }, 0.26, 0.24),
          makeBalloon("b1", 0.68, 0.74, 1, 0.22, 0.12),
          makeBalloon("b2", 0.08, 0.1, 2, 0.22, 0.12),
          makeBalloon("b3", 0.68, 0.12, 3, 0.22, 0.12),
        ]),
      ],
    });
    expect(outcome.optimizedPanelIds).toEqual(["bad-cut"]);
    expect(outcome.remainingReversals).toBe(0);
    expect(outcome.remainingIntersections).toBe(0);
    expect(outcome.allFacesCleared).toBe(true);
    expect(outcome.scoreDelta).toBeGreaterThan(15);
  });
});

describe("Wave 137 — 순수 OKLCH SVG, XSS 이스케이프, 한국어 브리프 및 SHA-256 결정론", () => {
  const cut1 = makePanel(
    "cut-1",
    [
      makeBalloon("b1", 0.08, 0.08, 1, 0.24, 0.12, { labelKo: `"멈춰!"` }),
      makeFace("f1", 0.72, 0.42, { dx: 1, dy: 0 }, 0.22, 0.22),
      makeBalloon("b2", 0.68, 0.78, 2, 0.24, 0.12),
    ],
    { titleKo: `옥상 <script>alert(1)</script>` },
  );
  const cut2 = makePanel(
    "cut-2",
    [
      makeBalloon("b3", 0.06, 0.1, 1, 0.24, 0.12),
      { elementId: "act-1", kind: "action-focal", labelKo: "검격", x: 0.44, y: 0.48, width: 0.26, height: 0.2 },
    ],
    { titleKo: "반격 컷" },
  );
  const sampleEpisode: GazeEpisodeInput = {
    episodeId: "ep-137-render",
    titleKo: `제12화 <각성> & "결전"`,
    readingDirection: "vertical-webtoon-ltr",
    panels: [cut1, cut2],
  };

  it("35. renderEpisodeGazeFlowSvg는 순수 oklch(...)만 사용하고 원시 hex/rgb/hsl이 0건이다", () => {
    const svg = renderEpisodeGazeFlowSvg(auditEpisodeGazeFlow(sampleEpisode));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg.endsWith("</svg>")).toBe(true);
    expect(svg).toContain("oklch(");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(svg).not.toMatch(/\brgba?\s*\(/i);
    expect(svg).not.toMatch(/\bhsla?\s*\(/i);
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("36. SVG 출력에서 악성 <script>·따옴표·앰퍼샌드가 완전히 XML 이스케이프된다", () => {
    const svg = renderEpisodeGazeFlowSvg(auditEpisodeGazeFlow(sampleEpisode));
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(escapeGazeFlowXml(`<tag a="1" b='2'>&`)).toBe("&lt;tag a=&quot;1&quot; b=&apos;2&apos;&gt;&amp;");
  });

  it("37. SVG에 무게중심 십자선, 컷 전환 핸드오프 브리지, 위반 뱃지가 포함된다", () => {
    const svg = renderEpisodeGazeFlowSvg(auditEpisodeGazeFlow(sampleEpisode));
    expect(svg).toContain(`data-role="center-of-visual-mass"`);
    expect(svg).toContain(`data-handoff="cut-1-&gt;cut-2"`);
    expect(svg).toContain("외곽 시선 이탈");
    expect(svg).toContain("급도약");
  });

  it("38. RTL 출판 만화 SVG도 정상 렌더링되고 원시 색상이 전혀 포함되지 않는다", () => {
    const svg = renderEpisodeGazeFlowSvg(
      auditEpisodeGazeFlow({
        episodeId: "ep-rtl-svg",
        titleKo: "일본어 단행본 3권",
        readingDirection: "manga-rtl",
        panels: [
          makePanel("r1", [makeBalloon("rb1", 0.68, 0.1, 1), makeBalloon("rb2", 0.08, 0.72, 2)], { widthPx: 640, heightPx: 880 }),
          makePanel("r2", [makeBalloon("rb3", 0.66, 0.12, 1)], { widthPx: 640, heightPx: 880 }),
        ],
      }),
    );
    expect(svg).toContain("일본식 만화 페이지 (우→좌)");
    expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
  });

  it("39. summarizeEpisodeGazeFlowKo는 번역투 없는 자연스러운 한국어 QA 브리프를 생성한다", () => {
    const outcome = optimizeBalloonPositionsForGazeFlow({
      episodeId: "ep-brief",
      titleKo: "제3화 추격전",
      readingDirection: "vertical-webtoon-ltr",
      panels: [
        makePanel("c1", [
          makeFace("f1", 0.38, 0.4, { dx: 0, dy: 1 }, 0.24, 0.22),
          makeBalloon("b1", 0.68, 0.12, 1),
          makeBalloon("b2", 0.08, 0.14, 2),
        ], { titleKo: "골목 진입" }),
      ],
    });
    const brief = summarizeEpisodeGazeFlowKo(outcome.beforeAudit, outcome);
    expect(brief).toContain("[연출 시선 동선 QA 브리프]");
    expect(brief).toContain("말풍선 자동 교정 결과");
    expect(brief).toContain("잔여 역독 0건");
    expect(brief).toContain("매니페스트 지문(SHA-256):");
    expect(brief).not.toContain("하는 것을 가능하게 합니다");
    expect(brief).not.toContain("직관적인 경험을 제공합니다");
  });

  it("40. FIPS 180-4 SHA-256 테스트 벡터(빈 문자열·abc) 및 에피소드 지문 결정론을 검증한다", () => {
    expect(sha256GazeUtf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256GazeUtf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");

    const a1 = auditEpisodeGazeFlow(sampleEpisode);
    const a2 = auditEpisodeGazeFlow(sampleEpisode);
    expect(a1.manifestSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(a1.manifestSha256).toBe(a2.manifestSha256);

    const movedCut1: GazePanelInput = {
      ...cut1,
      elements: [
        makeBalloon("b1", 0.18, 0.08, 1, 0.24, 0.12, { labelKo: `"멈춰!"` }),
        makeFace("f1", 0.72, 0.42, { dx: 1, dy: 0 }, 0.22, 0.22),
        makeBalloon("b2", 0.68, 0.78, 2, 0.24, 0.12),
      ],
    };
    const a3 = auditEpisodeGazeFlow({ ...sampleEpisode, panels: [movedCut1, cut2] });
    expect(a3.manifestSha256).not.toBe(a1.manifestSha256);
  });
});
