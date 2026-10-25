import { describe, expect, it } from "vitest";

import {
  addBoardInkAnnotationToCard,
  buildStructuredLassoPayload,
  createExcerptReferenceCard,
  doLineSegmentsIntersect,
  extractLassoSelectionStrokes,
  instantiateStructuredLassoPayload,
  isPointInLassoPolygon,
  moveAndScaleReferenceCard,
  projectCardAnnotationToSourceCut,
  projectReferenceCardInkOverlay,
  type CanvasPoint2D,
  type LassoSelectableElement,
} from "./studio-spatial-reference-lasso-board";

const SAMPLE_POLYGON: readonly CanvasPoint2D[] = [
  { x: 100, y: 100 },
  { x: 300, y: 100 },
  { x: 300, y: 260 },
  { x: 100, y: 260 },
];

const SAMPLE_ELEMENTS: readonly LassoSelectableElement[] = [
  {
    id: "stroke-inside",
    kind: "stroke",
    role: "dialogue",
    points: [
      { x: 140, y: 150 },
      { x: 220, y: 165 },
    ],
    strokeWidth: 3,
    baselineAngleRad: 0.12,
    baselineCurvature: 0.001,
  },
  {
    id: "stroke-crossing",
    kind: "stroke",
    role: "sfx",
    points: [
      { x: 60, y: 180 },
      { x: 340, y: 180 },
    ],
    strokeWidth: 5,
    baselineAngleRad: 0,
  },
  {
    id: "box-inside",
    kind: "box",
    role: "outline",
    bounds: { x: 130, y: 120, width: 80, height: 50 },
    text: "대사 박스",
    baselineAngleRad: -0.05,
  },
  {
    id: "stroke-outside",
    kind: "stroke",
    role: "ink",
    points: [
      { x: 420, y: 400 },
      { x: 480, y: 430 },
    ],
    strokeWidth: 2,
  },
];

describe("studio-spatial-reference-lasso-board", () => {
  it("폴리곤 내부 점 판별(isPointInLassoPolygon)과 선분 교차(doLineSegmentsIntersect)를 정확히 수행한다", () => {
    expect(isPointInLassoPolygon({ x: 200, y: 180 }, SAMPLE_POLYGON)).toBe(true);
    expect(isPointInLassoPolygon({ x: 100, y: 150 }, SAMPLE_POLYGON)).toBe(true);
    expect(isPointInLassoPolygon({ x: 45, y: 45 }, SAMPLE_POLYGON)).toBe(false);

    expect(
      doLineSegmentsIntersect(
        { x: 50, y: 180 },
        { x: 150, y: 180 },
        { x: 100, y: 100 },
        { x: 100, y: 260 },
      ),
    ).toBe(true);
    expect(
      doLineSegmentsIntersect(
        { x: 10, y: 10 },
        { x: 40, y: 10 },
        { x: 100, y: 100 },
        { x: 100, y: 260 },
      ),
    ).toBe(false);
  });

  it("올가미 선택 모드(intersect vs contain)에 따라 교차·포함 스트로크와 박스를 구분 추출한다", () => {
    const intersected = extractLassoSelectionStrokes(
      SAMPLE_ELEMENTS,
      SAMPLE_POLYGON,
      "intersect",
    );
    expect(intersected.map((e) => e.id)).toEqual([
      "stroke-inside",
      "stroke-crossing",
      "box-inside",
    ]);

    const contained = extractLassoSelectionStrokes(
      SAMPLE_ELEMENTS,
      SAMPLE_POLYGON,
      "contain",
    );
    expect(contained.map((e) => e.id)).toEqual(["stroke-inside", "box-inside"]);
  });

  it("구조화 올가미 페이로드(buildStructuredLassoPayload)가 상대 좌표·레이어 역할·베이스라인 메타데이터를 보존하고 새 위치에 복원한다", () => {
    const payload = buildStructuredLassoPayload(
      SAMPLE_ELEMENTS,
      SAMPLE_POLYGON,
      "contain",
    );

    expect(payload.schema).toBe("toonstudio.structured-lasso-pasteboard.v1");
    expect(payload.items).toHaveLength(2);
    expect(payload.items[0]?.role).toBe("dialogue");
    expect(payload.items[0]?.baselineAngleRad).toBeCloseTo(0.12, 5);

    const targetAnchor = {
      x: payload.sourceAnchor.x + 200,
      y: payload.sourceAnchor.y + 100,
    };
    const pasted = instantiateStructuredLassoPayload(payload, targetAnchor, {
      scale: 2,
      rotationRad: 0.25,
      idPrefix: "dup",
    });

    expect(pasted).toHaveLength(2);
    const firstStroke = pasted[0]!;
    expect(firstStroke.kind).toBe("stroke");
    if (firstStroke.kind === "stroke") {
      expect(firstStroke.role).toBe("dialogue");
      expect(firstStroke.strokeWidth).toBeCloseTo(6, 5);
      expect(firstStroke.baselineAngleRad).toBeCloseTo(0.12 + 0.25, 5);
      expect(firstStroke.baselineCurvature).toBeCloseTo(0.0005, 6);
    }
  });

  it("Muse 공간 레퍼런스 카드 발췌 후 카드 이동·스케일 시 비파괴 주석이 동기화되고 원본 컷 좌표계로 정확히 역투영된다", () => {
    const card0 = createExcerptReferenceCard({
      id: "ref-card-1",
      sourceCutId: "cut-04",
      title: "4컷 표정 레퍼런스",
      sourceBounds: { x: 100, y: 100, width: 200, height: 160 },
      boardPosition: { x: 800, y: 300 },
      scale: 2,
      pinned: true,
      sourceElements: SAMPLE_ELEMENTS,
    });

    expect(card0.schema).toBe("com.meta.prototypes.endo.attachment-reference");
    expect(card0.excerptElements.length).toBeGreaterThanOrEqual(2);

    // 보드 좌표 (840, 360) -> (880, 400)에 주석 스트로크 추가
    // scale=2, boardPosition=(800, 300) 이므로 로컬 좌표는 (20, 30) -> (40, 50)
    const cardWithAnn = addBoardInkAnnotationToCard(card0, {
      id: "ann-1",
      boardPoints: [
        { x: 840, y: 360 },
        { x: 880, y: 400 },
      ],
      strokeWidth: 4,
      color: "#ff0055",
    });

    expect(cardWithAnn.inkAnnotations).toHaveLength(1);
    expect(cardWithAnn.inkAnnotations[0]!.localPoints).toEqual([
      { x: 20, y: 30 },
      { x: 40, y: 50 },
    ]);

    // 카드를 보드 위 새 위치 (1000, 500), scale=0.5로 이동·축소
    const movedCard = moveAndScaleReferenceCard(cardWithAnn, {
      boardPosition: { x: 1000, y: 500 },
      scale: 0.5,
    });

    const boardOverlay = projectReferenceCardInkOverlay(movedCard);
    expect(boardOverlay).toHaveLength(1);
    expect(boardOverlay[0]!.boardPoints).toEqual([
      { x: 1010, y: 515 },
      { x: 1020, y: 525 },
    ]);
    expect(boardOverlay[0]!.strokeWidth).toBeCloseTo(1, 5);

    // 카드가 어디로 이동·스케일되든 원본 컷(sourceBounds: 100, 100)으로 역투영하면 항상 (120, 130) -> (140, 150)
    const backProjected = projectCardAnnotationToSourceCut(movedCard);
    expect(backProjected).toHaveLength(1);
    expect(backProjected[0]!.sourceCutId).toBe("cut-04");
    expect(backProjected[0]!.sourcePoints).toEqual([
      { x: 120, y: 130 },
      { x: 140, y: 150 },
    ]);
    expect(backProjected[0]!.strokeWidth).toBeCloseTo(2, 5);
  });
});
