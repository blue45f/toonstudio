/**
 * Wave 131 — 만화·웹툰 사선/찢김 컷 경계 돌출 동적 레이아웃 &
 * 인접 컷 무침범 Z-오더 합성 컴파일러 결정론적 Vitest 검증 스위트 (34건).
 */

import { describe, expect, it } from "vitest";

import {
  PANEL_FRAME_STYLE_IDS,
  auditBreakoutCollisions,
  buildComicPanelFramePolygon,
  buildPanelBreakoutStencilWgsl,
  clipPolygonSutherlandHodgman,
  compilePanelBreakoutCompositor,
  computeBreakoutLayoutSha256Hex,
  computePolygonArea,
  isPointInsideOrOnPolygon,
  rectToPolygon,
  renderPanelBreakoutLayoutSvg,
  sha256Utf8Hex,
  solveCollisionFreeBreakoutLayout,
  summarizePanelBreakoutLayoutKo,
  validatePanelBreakoutStencilWgsl,
  type BreakoutMode,
  type BreakoutSubjectInput,
  type BreakoutSubjectKind,
  type ComicPanelInput,
  type CriticalZoneKind,
  type PanelBreakoutDocument,
  type PanelCriticalZoneInput,
  type PanelFrameStyleId,
  type Rect2D,
  type Vec2,
} from "./index";

function boxPoly(x: number, y: number, w: number, h: number): readonly Vec2[] {
  return [{ x, y }, { x: x + w, y }, { x: x + w, y: y + h }, { x, y: y + h }];
}

function makeSub(
  subjectId: string,
  labelKo: string,
  kind: BreakoutSubjectKind,
  breakoutMode: BreakoutMode,
  polygon: readonly Vec2[],
): BreakoutSubjectInput {
  return { subjectId, labelKo, kind, breakoutMode, polygon };
}

function makeZone(
  zoneId: string,
  labelKo: string,
  kind: CriticalZoneKind,
  bounds: Rect2D,
): PanelCriticalZoneInput {
  return { zoneId, labelKo, kind, bounds };
}

function makePanel(
  panelId: string,
  titleKo: string,
  style: PanelFrameStyleId,
  bounds: Rect2D,
  extra?: Partial<Omit<ComicPanelInput, "panelId" | "titleKo" | "style" | "bounds">>,
): ComicPanelInput {
  return { panelId, titleKo, style, bounds, ...extra };
}

function makeActionShowcaseDocument(): PanelBreakoutDocument {
  return {
    documentId: "ep131-climax-duel",
    titleKo: "결투 클라이맥스 사선 돌출 시퀀스",
    canvasWidthPx: 800,
    minGutterPx: 32,
    maxHorizontalClipRatio: 0.1,
    panels: [
      makePanel("p1-establish", "1컷: 전신 대치", "classic-rect", { x: 40, y: 24, width: 720, height: 260 }, {
        baseArtBounds: { x: 10, y: 0, width: 780, height: 310 },
        breakoutSubjects: [makeSub("s1-bg-aura", "내부 집중선 기류", "sfx-polygon", "clipped-inside", boxPoly(0, 0, 800, 320))],
        criticalZones: [makeZone("z1-hero-face", "주인공 얼굴", "character-face", { x: 180, y: 80, width: 120, height: 120 })],
      }),
      makePanel("p2-slash", "2컷: 사선 검격", "diagonal-slash-cut", { x: 48, y: 316, width: 704, height: 260 }, {
        slashTopSkewPx: 36,
        slashBottomSkewPx: -34,
        breakoutSubjects: [
          makeSub("s2-blade-breakout", "검날 돌출", "blade", "gutter-breakout", [
            { x: 460, y: 420 }, { x: 560, y: 440 }, { x: 540, y: 690 }, { x: 440, y: 660 },
          ]),
        ],
      }),
      makePanel("p3-shatter", "3컷: 파열 정타", "impact-shattered-border", { x: 56, y: 610, width: 688, height: 250 }, {
        shatterTeethPerEdge: 3,
        shatterDepthRatio: 0.08,
        shatterSeed: 42,
        breakoutSubjects: [makeSub("s3-fist-overflow", "강타 주먹 돌출", "fist", "gutter-breakout", boxPoly(670, 680, 210, 110))],
        criticalZones: [
          makeZone("z3-rival-face", "라이벌 피격 얼굴", "character-face", { x: 430, y: 635, width: 130, height: 115 }),
          makeZone("z3-dialogue", "핵심 대사 말풍선", "speech-balloon", { x: 110, y: 650, width: 170, height: 90 }),
        ],
      }),
      makePanel("p4-bleed", "4컷: 무테 여운", "borderless-full-bleed", { x: 30, y: 900, width: 700, height: 240 }, {
        breakoutSubjects: [
          makeSub("s4-bridge-slash", "컷 관통 참격", "blade", "cross-panel-bridge", [
            { x: 250, y: 840 }, { x: 340, y: 840 }, { x: 310, y: 1170 }, { x: 220, y: 1170 },
          ]),
        ],
      }),
      makePanel("p5-inset", "5컷: 눈동자 인셋", "inset-floating-overlay", { x: 520, y: 1165, width: 220, height: 130 }, {
        chamferSizePx: 14,
        criticalZones: [makeZone("z5-eye-close", "눈동자 클로즈업", "character-face", { x: 550, y: 1190, width: 160, height: 80 })],
      }),
    ],
  };
}

describe("Wave 131 — 5종 만화 컷 프레임 기하 생성", () => {
  it("5종 스타일 모두 닫힌 유효 양수 면적 다각형을 생성한다", () => {
    for (const style of PANEL_FRAME_STYLE_IDS) {
      const frame = buildComicPanelFramePolygon({
        panelId: `panel-${style}`,
        style,
        bounds: { x: 40, y: 30, width: 640, height: 240 },
        canvasWidthPx: 800,
      });
      expect(frame.vertices.length).toBeGreaterThanOrEqual(4);
      expect(frame.areaPx2).toBeGreaterThan(10000);
      expect(frame.signedAreaPx2).toBeGreaterThan(0);
      expect(Number.isFinite(frame.centroid.x)).toBe(true);
      expect(Number.isFinite(frame.centroid.y)).toBe(true);
    }
  });

  it("CW와 CCW 와인딩 방향 요청이 부호 있는 면적에 정확히 반영된다", () => {
    const cw = buildComicPanelFramePolygon({
      panelId: "p-cw", style: "diagonal-slash-cut", bounds: { x: 50, y: 40, width: 600, height: 220 }, winding: "cw",
    });
    const ccw = buildComicPanelFramePolygon({
      panelId: "p-ccw", style: "diagonal-slash-cut", bounds: { x: 50, y: 40, width: 600, height: 220 }, winding: "ccw",
    });
    expect(cw.signedAreaPx2).toBeGreaterThan(0);
    expect(ccw.signedAreaPx2).toBeLessThan(0);
    expect(Math.abs(cw.areaPx2 - ccw.areaPx2)).toBeLessThan(1e-3);
  });

  it("diagonal-slash-cut은 극단 기울기 입력에서도 자기교차 없이 볼록을 유지한다", () => {
    const frame = buildComicPanelFramePolygon({
      panelId: "p-slash", style: "diagonal-slash-cut", bounds: { x: 60, y: 100, width: 680, height: 200 },
      slashTopSkewPx: 999, slashBottomSkewPx: -999,
    });
    expect(frame.vertices).toHaveLength(4);
    expect(frame.isConvex).toBe(true);
    expect(frame.areaPx2).toBeGreaterThan(20000);
  });

  it("impact-shattered-border는 4변 파열 톱니 정점과 비볼록 형상을 결정론적으로 생성한다", () => {
    const f1 = buildComicPanelFramePolygon({
      panelId: "p-shatter", style: "impact-shattered-border", bounds: { x: 60, y: 100, width: 600, height: 240 },
      shatterTeethPerEdge: 4, shatterDepthRatio: 0.09, shatterSeed: 77,
    });
    const f2 = buildComicPanelFramePolygon({
      panelId: "p-shatter", style: "impact-shattered-border", bounds: { x: 60, y: 100, width: 600, height: 240 },
      shatterTeethPerEdge: 4, shatterDepthRatio: 0.09, shatterSeed: 77,
    });
    expect(f1.vertices.length).toBeGreaterThanOrEqual(20);
    expect(f1.isConvex).toBe(false);
    expect(f1.areaPx2).toBeGreaterThan(100000);
    expect(f1.vertices).toEqual(f2.vertices);
  });

  it("borderless-full-bleed는 캔버스 전폭 [0, canvasWidthPx]을 채우고 테두리 두께 0을 강제한다", () => {
    const frame = buildComicPanelFramePolygon({
      panelId: "p-bleed", style: "borderless-full-bleed", bounds: { x: 120, y: 40, width: 400, height: 300 },
      canvasWidthPx: 800, borderStrokeWidthPx: 6,
    });
    expect(frame.bounds.minX).toBe(0);
    expect(frame.bounds.maxX).toBe(800);
    expect(frame.borderStrokeWidthPx).toBe(0);
    expect(frame.areaPx2).toBeCloseTo(800 * 300, 1);
  });

  it("inset-floating-overlay는 모따기 8각형 볼록 프레임으로 생성된다", () => {
    const frame = buildComicPanelFramePolygon({
      panelId: "p-inset", style: "inset-floating-overlay", bounds: { x: 500, y: 120, width: 220, height: 140 },
      chamferSizePx: 16,
    });
    expect(frame.vertices).toHaveLength(8);
    expect(frame.isConvex).toBe(true);
    expect(frame.areaPx2).toBeCloseTo(220 * 140 - 2 * 16 * 16, 1);
  });

  it("classic-rect의 무게중심은 직사각형 중앙과 일치한다", () => {
    const frame = buildComicPanelFramePolygon({
      panelId: "p-center", style: "classic-rect", bounds: { x: 100, y: 200, width: 400, height: 300 },
    });
    expect(frame.centroid.x).toBeCloseTo(300, 3);
    expect(frame.centroid.y).toBeCloseTo(350, 3);
  });
});

describe("Wave 131 — Sutherland-Hodgman 2D 클리핑 & Z-오더 합성 컴파일러", () => {
  it("Sutherland-Hodgman 클리핑이 볼록 사선 컷 밖으로 넘친 다각형을 정확히 절단한다", () => {
    const frame = buildComicPanelFramePolygon({
      panelId: "p-diag", style: "diagonal-slash-cut", bounds: { x: 100, y: 100, width: 400, height: 200 },
      slashTopSkewPx: 40, slashBottomSkewPx: -40,
    });
    const oversized = rectToPolygon({ x: 50, y: 50, width: 500, height: 300 });
    const clipped = clipPolygonSutherlandHodgman(oversized, frame.vertices);

    expect(clipped.length).toBeGreaterThanOrEqual(4);
    expect(computePolygonArea(clipped)).toBeCloseTo(frame.areaPx2, 1);
    expect(computePolygonArea(clipped)).toBeLessThan(computePolygonArea(oversized));
    for (const pt of clipped) {
      expect(isPointInsideOrOnPolygon(pt, frame.vertices, 0.2)).toBe(true);
    }
  });

  it("clipped-inside 피사체는 면적이 줄고 모든 정점이 컷 경계 내부에 놓이며 borderStrokeZ 아래에 배치된다", () => {
    const compiled = compilePanelBreakoutCompositor(makeActionShowcaseDocument());
    const p1 = compiled.panels[0];
    const s1 = p1?.subjects[0];
    expect(s1?.breakoutMode).toBe("clipped-inside");
    expect(s1?.promotedAboveBorder).toBe(false);
    expect(s1?.zIndex).toBeLessThan(p1?.borderStrokeZ ?? 0);
    expect(s1?.renderAreaPx2).toBeLessThan(s1?.originalAreaPx2 ?? 0);
    expect(s1?.breakoutOverflowAreaPx2).toBe(0);
    expect(s1?.allRenderVerticesInsideFrame).toBe(true);
  });

  it("impact-shattered-border(비볼록 컷) 내부의 baseArtBounds와 clipped-inside가 찢김 경계 안쪽으로 클리핑된다", () => {
    const compiled = compilePanelBreakoutCompositor({
      documentId: "shatter-clip", titleKo: "파열 클리핑 검증", canvasWidthPx: 800,
      panels: [
        makePanel("p-shatter", "파열 컷", "impact-shattered-border", { x: 100, y: 80, width: 500, height: 240 }, {
          baseArtBounds: { x: 40, y: 20, width: 620, height: 360 },
          breakoutSubjects: [makeSub("s-in", "내부 효과선", "sfx-polygon", "clipped-inside", boxPoly(40, 20, 620, 360))],
        }),
      ],
    });
    const panel = compiled.panels[0];
    const sub = panel?.subjects[0];
    expect(panel?.baseArtClippedAreaPx2 ?? 0).toBeLessThan(panel?.baseArtOriginalAreaPx2 ?? 0);
    expect(panel?.baseArtClippedAreaPx2 ?? 0).toBeCloseTo(panel?.frame.areaPx2 ?? 0, 0);
    expect(sub?.allRenderVerticesInsideFrame).toBe(true);
    expect(sub?.renderAreaPx2 ?? 0).toBeLessThan(sub?.originalAreaPx2 ?? 0);
  });

  it("gutter-breakout 피사체는 borderStrokeZ 위로 승격되고 양수 돌출 면적을 실측한다", () => {
    const compiled = compilePanelBreakoutCompositor(makeActionShowcaseDocument());
    const p2 = compiled.panels[1];
    const blade = p2?.subjects[0];
    expect(blade?.promotedAboveBorder).toBe(true);
    expect(blade?.zIndex).toBeGreaterThan(p2?.borderStrokeZ ?? 0);
    expect(blade?.breakoutOverflowAreaPx2 ?? 0).toBeGreaterThan(5000);
    expect(blade?.allRenderVerticesInsideFrame).toBe(false);
  });

  it("cross-panel-bridge 피사체는 모든 컷의 borderStrokeZ보다 높은 최상위 Z-오더로 승격된다", () => {
    const compiled = compilePanelBreakoutCompositor(makeActionShowcaseDocument());
    const maxBorderZ = Math.max(...compiled.panels.map((p) => p.borderStrokeZ));
    const bridge = compiled.panels[3]?.subjects[0];
    expect(bridge?.breakoutMode).toBe("cross-panel-bridge");
    expect(bridge?.zIndex).toBeGreaterThan(maxBorderZ);
    expect(bridge?.breakoutOverflowAreaPx2 ?? 0).toBeGreaterThan(2000);
  });

  it("Z-오더 스택은 오름차순으로 정렬되며 동일 컷에서 배경 < 원화 < 테두리 < 돌출 순을 지킨다", () => {
    const compiled = compilePanelBreakoutCompositor(makeActionShowcaseDocument());
    for (let i = 1; i < compiled.zStack.length; i += 1) {
      expect(compiled.zStack[i]?.zIndex ?? 0).toBeGreaterThanOrEqual(compiled.zStack[i - 1]?.zIndex ?? 0);
    }
    const p2Kinds = compiled.zStack.filter((l) => l.panelId === "p2-slash").map((l) => l.kind);
    expect(p2Kinds.indexOf("panel-background")).toBeLessThan(p2Kinds.indexOf("base-art"));
    expect(p2Kinds.indexOf("base-art")).toBeLessThan(p2Kinds.indexOf("panel-border-stroke"));
    expect(p2Kinds.indexOf("panel-border-stroke")).toBeLessThan(p2Kinds.indexOf("gutter-breakout-subject"));
  });
});

describe("Wave 131 — 인접 컷 침범·캔버스 잘림 감사 & 무침범 자동 솔버", () => {
  it("인접 컷 얼굴 보호 영역을 찌르는 돌출 검날을 정확히 검출한다", () => {
    const audit = auditBreakoutCollisions(compilePanelBreakoutCompositor(makeActionShowcaseDocument()));
    expect(audit.passed).toBe(false);
    expect(audit.verdict).toBe("fail");
    const faceHit = audit.neighborCriticalZoneCollisions.find(
      (c) => c.subjectId === "s2-blade-breakout" && c.zoneId === "z3-rival-face",
    );
    expect(faceHit).toBeDefined();
    expect(faceHit?.overlapAreaPx2 ?? 0).toBeGreaterThan(1000);
    expect(faceHit?.penetrationDepthPx ?? 0).toBeGreaterThan(10);
  });

  it("오목 돌출 효과음 다각형이 인접 컷 말풍선과 교차할 때도 SAT 삼각분할로 정확히 잡아낸다", () => {
    const concaveSfx: readonly Vec2[] = [
      { x: 200, y: 240 }, { x: 260, y: 240 }, { x: 260, y: 310 },
      { x: 350, y: 310 }, { x: 350, y: 360 }, { x: 200, y: 360 },
    ];
    const compiled = compilePanelBreakoutCompositor({
      documentId: "concave-balloon-hit", titleKo: "오목 효과음 충돌", canvasWidthPx: 800,
      panels: [
        makePanel("p-top", "상단 컷", "classic-rect", { x: 40, y: 20, width: 720, height: 240 }, {
          breakoutSubjects: [makeSub("s-concave", "ㄱ자 효과음", "sfx-polygon", "gutter-breakout", concaveSfx)],
        }),
        makePanel("p-bottom", "하단 컷", "classic-rect", { x: 40, y: 300, width: 720, height: 240 }, {
          criticalZones: [makeZone("z-balloon", "비명 말풍선", "speech-balloon", { x: 290, y: 320, width: 150, height: 80 })],
        }),
      ],
    });
    const audit = auditBreakoutCollisions(compiled);
    expect(audit.neighborCriticalZoneCollisionCount).toBe(1);
    expect(audit.neighborCriticalZoneCollisions[0]?.zoneKind).toBe("speech-balloon");
    expect(audit.neighborCriticalZoneCollisions[0]?.overlapAreaPx2).toBeCloseTo(60 * 40, 0);
  });

  it("자기 자신의 컷 내부 criticalZone이나 clipped-inside 레이어는 인접 침범으로 오탐하지 않는다", () => {
    const compiled = compilePanelBreakoutCompositor({
      documentId: "self-zone-safe", titleKo: "동일 컷 내부 안전", canvasWidthPx: 800,
      panels: [
        makePanel("p1", "1컷", "classic-rect", { x: 40, y: 20, width: 720, height: 260 }, {
          breakoutSubjects: [
            makeSub("s-own", "주인공 상반신 돌출", "character-torso", "gutter-breakout", boxPoly(220, 120, 180, 190)),
            makeSub("s-clip", "내부 클립 그림자", "prop", "clipped-inside", boxPoly(200, 100, 300, 400)),
          ],
          criticalZones: [makeZone("z-own", "자기 컷 얼굴", "character-face", { x: 250, y: 140, width: 100, height: 100 })],
        }),
        makePanel("p2", "2컷", "classic-rect", { x: 40, y: 340, width: 720, height: 240 }, {
          criticalZones: [makeZone("z-p2", "하단 컷 얼굴", "character-face", { x: 250, y: 380, width: 120, height: 100 })],
        }),
      ],
    });
    const audit = auditBreakoutCollisions(compiled);
    expect(audit.neighborCriticalZoneCollisionCount).toBe(0);
    expect(audit.canvasHorizontalClipViolationCount).toBe(0);
    expect(audit.passed).toBe(true);
  });

  it("좌우 800px 캔버스 밖 10% 초과 이탈 피사체를 검출하고 10% 이하 미세 이탈은 허용한다", () => {
    const compiled = compilePanelBreakoutCompositor({
      documentId: "canvas-clip-check", titleKo: "좌우 캔버스 잘림 점검", canvasWidthPx: 800, maxHorizontalClipRatio: 0.1,
      panels: [
        makePanel("p1", "1컷", "classic-rect", { x: 40, y: 20, width: 720, height: 240 }, {
          breakoutSubjects: [
            makeSub("s-right", "우측 30% 잘림", "fist", "gutter-breakout", boxPoly(660, 80, 200, 100)),
            makeSub("s-left", "좌측 25% 잘림", "blade", "gutter-breakout", boxPoly(-50, 90, 200, 80)),
            makeSub("s-ok", "미세 8% 여백 이탈", "prop", "gutter-breakout", boxPoly(708, 190, 100, 60)),
          ],
        }),
      ],
    });
    const audit = auditBreakoutCollisions(compiled);
    expect(audit.canvasHorizontalClipViolationCount).toBe(2);
    const ids = audit.canvasHorizontalClipViolations.map((v) => v.subjectId);
    expect(ids).toContain("s-right");
    expect(ids).toContain("s-left");
    expect(ids).not.toContain("s-ok");
  });

  it("solveCollisionFreeBreakoutLayout 적용 후 인접 컷 충돌 0건 및 캔버스 잘림 0건을 보장한다", () => {
    const solved = solveCollisionFreeBreakoutLayout(makeActionShowcaseDocument(), {
      safetyPaddingPx: 18, canvasSafeMarginPx: 10,
    });
    expect(solved.beforeAudit.passed).toBe(false);
    expect(solved.beforeAudit.neighborCriticalZoneCollisionCount).toBeGreaterThan(0);
    expect(solved.beforeAudit.canvasHorizontalClipViolationCount).toBeGreaterThan(0);
    expect(solved.solved).toBe(true);
    expect(solved.afterAudit.passed).toBe(true);
    expect(solved.afterAudit.neighborCriticalZoneCollisionCount).toBe(0);
    expect(solved.afterAudit.canvasHorizontalClipViolationCount).toBe(0);
    expect(solved.totalAddedGutterPx).toBeGreaterThan(0);
    expect(solved.gutterShifts.length).toBeGreaterThan(0);
    expect(solved.horizontalClamps.length).toBeGreaterThan(0);
  });

  it("하단 컷의 역방향 상단 돌출이 상단 컷 얼굴을 침범해도 거터 확장으로 0건 해소한다", () => {
    const doc: PanelBreakoutDocument = {
      documentId: "upward-breakout", titleKo: "역방향 상단 돌출", canvasWidthPx: 800,
      panels: [
        makePanel("p-upper", "상단 컷", "classic-rect", { x: 40, y: 30, width: 720, height: 240 }, {
          criticalZones: [makeZone("z-upper-face", "상단 얼굴", "character-face", { x: 300, y: 150, width: 150, height: 100 })],
        }),
        makePanel("p-lower", "하단 컷", "diagonal-slash-cut", { x: 40, y: 300, width: 720, height: 240 }, {
          breakoutSubjects: [makeSub("s-up", "어퍼컷 주먹", "fist", "gutter-breakout", boxPoly(320, 190, 120, 180))],
        }),
      ],
    };
    const solved = solveCollisionFreeBreakoutLayout(doc);
    expect(solved.beforeAudit.neighborCriticalZoneCollisionCount).toBe(1);
    expect(solved.solved).toBe(true);
    expect(solved.afterAudit.neighborCriticalZoneCollisionCount).toBe(0);
    expect(solved.afterAudit.canvasHorizontalClipViolationCount).toBe(0);
  });

  it("cross-panel-bridge 참격이 하단 컷 말풍선을 가릴 때도 자동 거터 확장으로 충돌 0건을 달성한다", () => {
    const doc: PanelBreakoutDocument = {
      documentId: "bridge-collision", titleKo: "컷 관통 참격 보정", canvasWidthPx: 800,
      panels: [
        makePanel("p1", "1컷", "diagonal-slash-cut", { x: 40, y: 20, width: 720, height: 240 }, {
          breakoutSubjects: [makeSub("s-bridge", "관통 검기", "blade", "cross-panel-bridge", boxPoly(200, 140, 140, 250))],
        }),
        makePanel("p2", "2컷", "classic-rect", { x: 40, y: 290, width: 720, height: 240 }, {
          criticalZones: [makeZone("z-speech", "핵심 대사", "speech-balloon", { x: 180, y: 320, width: 180, height: 90 })],
        }),
      ],
    };
    const solved = solveCollisionFreeBreakoutLayout(doc);
    expect(solved.beforeAudit.neighborCriticalZoneCollisionCount).toBe(1);
    expect(solved.solved).toBe(true);
    expect(solved.afterAudit.neighborCriticalZoneCollisionCount).toBe(0);
  });

  it("캔버스 폭 800px 자체를 초과하는 초대형 돌출 피사체도 수평 축소·클램핑으로 0% 이탈을 달성한다", () => {
    const doc: PanelBreakoutDocument = {
      documentId: "ultra-wide-sfx", titleKo: "초광폭 효과음 보정", canvasWidthPx: 800,
      panels: [
        makePanel("p1", "1컷", "impact-shattered-border", { x: 50, y: 40, width: 700, height: 260 }, {
          breakoutSubjects: [makeSub("s-wide", "콰아앙 효과음", "sfx-polygon", "gutter-breakout", boxPoly(-140, 110, 1080, 120))],
        }),
      ],
    };
    const solved = solveCollisionFreeBreakoutLayout(doc);
    expect(solved.beforeAudit.canvasHorizontalClipViolationCount).toBe(1);
    expect(solved.solved).toBe(true);
    expect(solved.afterAudit.canvasHorizontalClipViolationCount).toBe(0);
    expect(solved.horizontalClamps[0]?.scaleX ?? 1).toBeLessThan(1);
    expect(solved.horizontalClamps[0]?.afterClipRatio).toBe(0);
  });

  it("이미 충돌 없는 문서는 솔버가 불필요한 거터 이동 없이 0회 반복으로 즉시 통과한다", () => {
    const cleanDoc: PanelBreakoutDocument = {
      documentId: "clean-pass", titleKo: "무충돌 클린 시퀀스", canvasWidthPx: 800,
      panels: [
        makePanel("p1", "1컷", "classic-rect", { x: 60, y: 20, width: 680, height: 220 }, {
          breakoutSubjects: [makeSub("s1-clean", "안전 주먹", "fist", "gutter-breakout", boxPoly(540, 180, 120, 95))],
        }),
        makePanel("p2", "2컷", "classic-rect", { x: 60, y: 320, width: 680, height: 220 }, {
          criticalZones: [makeZone("z2-face", "하단 얼굴", "character-face", { x: 160, y: 360, width: 120, height: 110 })],
        }),
      ],
    };
    const res = solveCollisionFreeBreakoutLayout(cleanDoc);
    expect(res.solved).toBe(true);
    expect(res.iterationsUsed).toBe(0);
    expect(res.totalAddedGutterPx).toBe(0);
    expect(res.gutterShifts).toHaveLength(0);
    expect(res.horizontalClamps).toHaveLength(0);
  });

  it("나란히 배치된 부유 인셋 컷과 충돌해도 솔버가 충돌 0건으로 수렴한다", () => {
    const doc: PanelBreakoutDocument = {
      documentId: "side-by-side-inset", titleKo: "부유 인셋 겹침 해소", canvasWidthPx: 800,
      panels: [
        makePanel("p-main", "메인 액션 컷", "classic-rect", { x: 40, y: 40, width: 460, height: 280 }, {
          breakoutSubjects: [makeSub("s-side", "우측 검격", "blade", "gutter-breakout", boxPoly(400, 120, 260, 80))],
        }),
        makePanel("p-inset-right", "우측 인셋", "inset-floating-overlay", { x: 520, y: 90, width: 220, height: 160 }, {
          criticalZones: [makeZone("z-eye", "리액션 얼굴", "character-face", { x: 550, y: 115, width: 150, height: 100 })],
        }),
      ],
    };
    const solved = solveCollisionFreeBreakoutLayout(doc);
    expect(solved.beforeAudit.neighborCriticalZoneCollisionCount).toBe(1);
    expect(solved.solved).toBe(true);
    expect(solved.afterAudit.neighborCriticalZoneCollisionCount).toBe(0);
    expect(solved.afterAudit.canvasHorizontalClipViolationCount).toBe(0);
  });
});

describe("Wave 131 — FIPS 180-4 SHA-256 결정론 및 비정상 입력 안전 처리", () => {
  it("순수 ES2017 SHA-256이 공식 NIST FIPS 180-4 테스트 벡터와 정확히 일치한다", () => {
    expect(sha256Utf8Hex("")).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
    expect(sha256Utf8Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    expect(sha256Utf8Hex("abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq")).toBe(
      "248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1",
    );
  });

  it("computeBreakoutLayoutSha256Hex는 결정론적이며 기하 변경 시 즉시 지문이 달라진다", () => {
    const doc = makeActionShowcaseDocument();
    const c1 = compilePanelBreakoutCompositor(doc);
    const c2 = compilePanelBreakoutCompositor(doc);
    expect(c1.manifestSha256Hex).toMatch(/^[0-9a-f]{64}$/);
    expect(c1.manifestSha256Hex).toBe(c2.manifestSha256Hex);
    expect(computeBreakoutLayoutSha256Hex(doc)).toBe(computeBreakoutLayoutSha256Hex(doc));
    const solved = solveCollisionFreeBreakoutLayout(doc);
    expect(solved.afterCompiled.manifestSha256Hex).not.toBe(c1.manifestSha256Hex);
  });

  it("빈 컷 목록과 NaN/Infinity 비정상 좌표를 안전하게 정규화하며 NaN/Infinity를 방출하지 않는다", () => {
    const emptyCompiled = compilePanelBreakoutCompositor({
      documentId: "empty-doc", titleKo: "빈 문서", canvasWidthPx: Number.NaN, panels: [],
    });
    expect(emptyCompiled.panels).toHaveLength(0);
    expect(emptyCompiled.canvasWidthPx).toBe(800);
    expect(auditBreakoutCollisions(emptyCompiled).passed).toBe(true);

    const dirtyCompiled = compilePanelBreakoutCompositor({
      documentId: "dirty-coords", titleKo: "비정상 좌표", canvasWidthPx: Number.POSITIVE_INFINITY,
      panels: [
        makePanel("p-dirty", "오염 컷", "classic-rect", {
          x: Number.NaN, y: Number.NEGATIVE_INFINITY, width: -100, height: Number.NaN,
        }, {
          breakoutSubjects: [makeSub("s-deg", "퇴화", "prop", "gutter-breakout", [{ x: Number.NaN, y: 10 }, { x: 20, y: Number.POSITIVE_INFINITY }])],
          criticalZones: [makeZone("z-zero", "영면적", "caption-safe", { x: 10, y: 10, width: 0, height: 0 })],
        }),
      ],
    });
    const svg = renderPanelBreakoutLayoutSvg(dirtyCompiled, auditBreakoutCollisions(dirtyCompiled));
    expect(Number.isFinite(dirtyCompiled.contentHeightPx)).toBe(true);
    expect(svg).not.toMatch(/NaN|Infinity/);
  });

  it("돌출 모드이지만 컷 경계 안에 완전히 머무른 피사체는 warn 상태와 zeroOverflow 경고를 기록한다", () => {
    const compiled = compilePanelBreakoutCompositor({
      documentId: "zero-overflow", titleKo: "돌출 미발생", canvasWidthPx: 800,
      panels: [
        makePanel("p1", "1컷", "classic-rect", { x: 40, y: 20, width: 720, height: 280 }, {
          breakoutSubjects: [makeSub("s-stayed", "내부 정지 피사체", "prop", "gutter-breakout", boxPoly(200, 80, 120, 100))],
        }),
      ],
    });
    const audit = auditBreakoutCollisions(compiled);
    expect(audit.passed).toBe(true);
    expect(audit.verdict).toBe("warn");
    expect(audit.zeroOverflowBreakoutSubjectIds).toEqual(["s-stayed"]);
  });
});

describe("Wave 131 — WebGPU WGSL 스텐실-돌출 마스크 컴포지터", () => {
  it("유효한 64B 16바이트 정렬 유니폼과 @compute/@vertex/@fragment WGSL을 생성·검증한다", () => {
    const artifact = buildPanelBreakoutStencilWgsl({
      workgroupSizeX: 8, workgroupSizeY: 8, borderAntiAliasPx: 1.5, enableCollisionDebugOverlay: true,
    });
    const validation = validatePanelBreakoutStencilWgsl(artifact);
    expect(validation.valid).toBe(true);
    expect(validation.errors).toEqual([]);
    expect(validation.bindingCount).toBe(4);
    expect(artifact.uniformBufferByteLength).toBe(64);
    expect(artifact.edgeSegmentStrideBytes % 16).toBe(0);
    expect(artifact.breakoutMaskStrideBytes % 16).toBe(0);
    expect(artifact.tileStateStrideBytes % 16).toBe(0);
    expect(artifact.entryPoints).toEqual([
      "cs_panel_stencil_breakout_mask",
      "vs_panel_breakout_quad",
      "fs_panel_breakout_composite",
    ]);
  });

  it("빈 문자열·괄호 불균형·바인딩 누락 WGSL을 정확히 거부한다", () => {
    expect(validatePanelBreakoutStencilWgsl("").valid).toBe(false);
    const artifact = buildPanelBreakoutStencilWgsl();
    const brokenBrace = validatePanelBreakoutStencilWgsl({ ...artifact, wgsl: `${artifact.wgsl}\nfn bad( {` });
    expect(brokenBrace.valid).toBe(false);
    expect(brokenBrace.errors.some((e) => e.includes("Unbalanced"))).toBe(true);

    const missingBinding = validatePanelBreakoutStencilWgsl({
      ...artifact,
      wgsl: artifact.wgsl.replace("@group(0) @binding(2)", "@group(0) @binding(9)"),
    });
    expect(missingBinding.valid).toBe(false);
    expect(missingBinding.errors.some((e) => e.includes("@binding(2)"))).toBe(true);
  });

  it("GLSL 금지어(gl_FragColor, texture2D, dFdx 등)와 비정렬 유니폼·NaN 토큰을 거부한다", () => {
    const artifact = buildPanelBreakoutStencilWgsl();
    const withGlsl = validatePanelBreakoutStencilWgsl({ ...artifact, wgsl: `${artifact.wgsl}\n// gl_FragColor texture2D dFdx varying` });
    expect(withGlsl.valid).toBe(false);
    expect(withGlsl.errors.some((e) => e.includes("GLSL"))).toBe(true);

    const misaligned = validatePanelBreakoutStencilWgsl({ ...artifact, uniformBufferByteLength: 52 });
    expect(misaligned.valid).toBe(false);
    expect(misaligned.errors.some((e) => e.includes("64 bytes"))).toBe(true);

    const withNaN = validatePanelBreakoutStencilWgsl({ ...artifact, wgsl: `${artifact.wgsl}\n// NaN` });
    expect(withNaN.valid).toBe(false);
    expect(withNaN.errors.some((e) => e.includes("non-finite"))).toBe(true);
  });
});

describe("Wave 131 — 순수 OKLCH 다중 컷 SVG & 자연스러운 한국어 컷 연출 브리프", () => {
  it("라이트/다크 테마 SVG 모두 순수 oklch(...) 색상만 사용하고 원시 hex/rgb/hsl 및 NaN이 0건이다", () => {
    const solved = solveCollisionFreeBreakoutLayout(makeActionShowcaseDocument());
    const lightSvg = renderPanelBreakoutLayoutSvg(solved.afterCompiled, solved.afterAudit, { theme: "light" });
    const darkSvg = renderPanelBreakoutLayoutSvg(solved.afterCompiled, solved.afterAudit, { theme: "dark" });

    for (const svg of [lightSvg, darkSvg]) {
      expect(svg.startsWith("<svg ")).toBe(true);
      expect(svg.endsWith("</svg>")).toBe(true);
      expect(svg).toContain("oklch(");
      expect(svg).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(svg).not.toMatch(/\b(?:rgb|rgba|hsl|hsla)\s*\(/i);
      expect(svg).not.toMatch(/\b(?:NaN|Infinity)\b/);
      expect(svg).toContain('data-layer-kind="panel-border-stroke"');
      expect(svg).toContain('data-layer-kind="gutter-breakout-subject"');
      expect(svg).toContain('data-layer-kind="cross-panel-bridge-subject"');
    }
  });

  it("SVG 내 사용자 제목·피사체·보호 영역 이름의 XML 특수문자(<, >, &, \", ')를 완전히 이스케이프한다", () => {
    const xssDoc: PanelBreakoutDocument = {
      documentId: "xss-test", titleKo: `안전 <script>alert("x")</script> & '컷'`, canvasWidthPx: 800,
      panels: [
        makePanel(`p<1>&"a"`, `1컷 <tag>`, "classic-rect", { x: 40, y: 20, width: 720, height: 220 }, {
          breakoutSubjects: [makeSub("s-xss", `<img src=x onerror='1'> & "주먹"`, "fist", "gutter-breakout", boxPoly(400, 180, 120, 100))],
          criticalZones: [makeZone("z-xss", `얼굴 <safe> & '보호'`, "character-face", { x: 100, y: 60, width: 120, height: 100 })],
        }),
      ],
    };
    const compiled = compilePanelBreakoutCompositor(xssDoc);
    const svg = renderPanelBreakoutLayoutSvg(compiled, auditBreakoutCollisions(compiled), {
      title: `제목 <script> & "test" 'quote'`,
    });
    expect(svg).not.toContain("<script>");
    expect(svg).not.toContain("<img ");
    expect(svg).toContain("&lt;script&gt;");
    expect(svg).toContain("&amp;");
    expect(svg).toContain("&quot;");
    expect(svg).toContain("&apos;");
  });

  it("SVG 페인트 순서에서 돌출 피사체 경로가 해당 컷 테두리 선 경로보다 뒤에(위 레이어에) 렌더링된다", () => {
    const compiled = compilePanelBreakoutCompositor(makeActionShowcaseDocument());
    const svg = renderPanelBreakoutLayoutSvg(compiled, auditBreakoutCollisions(compiled));
    const borderPos = svg.indexOf('data-layer-kind="panel-border-stroke" data-panel-id="p2-slash"');
    const breakoutPos = svg.indexOf('data-layer-kind="gutter-breakout-subject"');
    expect(borderPos).toBeGreaterThan(0);
    expect(breakoutPos).toBeGreaterThan(borderPos);
  });

  it("한국어 컷 연출 브리프는 통과·교정 필요 상태를 정확히 요약하고 번역투 표현을 배제한다", () => {
    const solved = solveCollisionFreeBreakoutLayout(makeActionShowcaseDocument());
    const failBrief = summarizePanelBreakoutLayoutKo(solved.beforeCompiled, solved.beforeAudit);
    const passBrief = summarizePanelBreakoutLayoutKo(solved.afterCompiled, solved.afterAudit, solved);

    expect(failBrief.verdictKo).toBe("교정 필요");
    expect(failBrief.actionLinesKo.length).toBeGreaterThanOrEqual(2);
    expect(passBrief.verdictKo).toBe("통과");
    expect(passBrief.solverSummaryLineKo).toContain("자동 거터 확장");
    expect(passBrief.fullTextKo).toContain("침범 0건");

    const forbidden = [
      "하는 것을 가능하게 합니다",
      "직관적인 경험을 제공합니다",
      "원활한 워크플로우를 보장합니다",
      "획기적으로 향상시킵니다",
    ];
    for (const phrase of forbidden) {
      expect(failBrief.fullTextKo).not.toContain(phrase);
      expect(passBrief.fullTextKo).not.toContain(phrase);
    }
  });
});
