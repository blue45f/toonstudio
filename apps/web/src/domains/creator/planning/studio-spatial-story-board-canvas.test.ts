import { describe, expect, it } from "vitest";

import {
  countNodesInSubtree,
  createNestedSubBoard,
  createSpatialStoryBoardDocument,
  getBoardBreadcrumbPath,
  resolveQuickArrowGeometry,
  snapCardWithElasticGuides,
  type SpatialBoardNode,
} from "./studio-spatial-story-board-canvas";

describe("studio-spatial-story-board-canvas", () => {
  it("manages nested sub-board trees, breadcrumbs, and recursive node counts", () => {
    let doc = createSpatialStoryBoardDocument("로판 1화 기획");
    doc = createNestedSubBoard(doc, {
      parentBoardId: doc.rootBoardId,
      subBoardId: "board-act1",
      portalNodeId: "portal-act1",
      titleKo: "1막 무도회",
      x: 100,
      y: 120,
    });
    doc = createNestedSubBoard(doc, {
      parentBoardId: "board-act1",
      subBoardId: "board-balcony",
      portalNodeId: "portal-balcony",
      titleKo: "발코니 독대 씬",
      x: 80,
      y: 80,
    });
    const note: SpatialBoardNode = {
      id: "note-1",
      boardId: "board-balcony",
      kind: "scene-card",
      titleKo: "달빛 클로즈업",
      bodyKo: "여주 독백",
      x: 20,
      y: 20,
      width: 200,
      height: 100,
      tags: ["클로즈업"],
    };
    doc = { ...doc, nodes: [...doc.nodes, note] };

    const crumbs = getBoardBreadcrumbPath(doc, "board-balcony");
    expect(crumbs.map((b) => b.id)).toEqual(["board-root", "board-act1", "board-balcony"]);
    expect(countNodesInSubtree(doc, "board-root")).toBe(3);
  });

  it("auto-binds Quick Arrows to exact card perimeter points and snaps cards elastically", () => {
    const nodeA: SpatialBoardNode = {
      id: "card-a",
      boardId: "board-root",
      kind: "scene-card",
      titleKo: "컷 1",
      bodyKo: "",
      x: 0,
      y: 0,
      width: 200,
      height: 100,
      tags: [],
    };
    const nodeB: SpatialBoardNode = {
      id: "card-b",
      boardId: "board-root",
      kind: "scene-card",
      titleKo: "컷 2",
      bodyKo: "",
      x: 400,
      y: 0,
      width: 200,
      height: 100,
      tags: [],
    };

    const arrowGeom = resolveQuickArrowGeometry(
      { id: "arr-1", boardId: "board-root", fromNodeId: "card-a", toNodeId: "card-b" },
      [nodeA, nodeB],
    );
    expect(arrowGeom).not.toBeNull();
    // card-a 우측 변(200 + 4px padding)에서 card-b 좌측 변(400 - 4px padding)으로 최단 연결
    expect(arrowGeom!.start[0]).toBeCloseTo(204, 4);
    expect(arrowGeom!.start[1]).toBeCloseTo(50, 4);
    expect(arrowGeom!.end[0]).toBeCloseTo(396, 4);
    expect(arrowGeom!.end[1]).toBeCloseTo(50, 4);

    // card-a 우측 24px 간격(x=224) 근처(x=229, y=4)로 끌면 정확히 (224, 0)에 스냅
    const snap = snapCardWithElasticGuides(
      { id: "card-c", boardId: "board-root", width: 200, height: 100 },
      229,
      4,
      [nodeA, nodeB],
      { snapThresholdPx: 10, preferredGapPx: 24 },
    );
    expect(snap.snappedX).toBe(true);
    expect(snap.snappedY).toBe(true);
    expect(snap.x).toBe(224);
    expect(snap.y).toBe(0);
    expect(snap.guides).toHaveLength(2);
  });
});
