import { describe, expect, it } from "vitest";

import { rgbToHex } from "../studio-color-harmony-engine";
import { studioPathSignedArea } from "../studio-path-boolean";

import {
  createLiveBooleanGroup,
  createLiveBooleanLeaf,
  evaluateLiveBooleanGroup,
  findLiveBooleanNode,
  flattenLiveBooleanGroupToDrawElSeeds,
  hashLiveBooleanNode,
  insertLiveBooleanChild,
  offsetPlanarRing,
  removeLiveBooleanChild,
  reorderLiveBooleanChild,
  toggleLiveBooleanNodeVisibility,
  updateLiveBooleanNode,
} from "./studio-live-boolean-group";

function makeRectLeaf(id: string, x: number, y: number, w: number, h: number) {
  return createLiveBooleanLeaf({
    id,
    name: id,
    shape: { kind: "rect", points: [x, y, x + w, y + h] },
    style: { stroke: rgbToHex(30, 35, 45), strokeWidth: 2, fill: rgbToHex(240, 200, 120) },
  });
}

describe("studio-live-boolean-group", () => {
  it("중첩 비파괴 불리언 트리 (A union B) subtract C 를 평가하고 자식 편집 시 즉시 재평가한다", async () => {
    const unionSub = createLiveBooleanGroup({
      id: "grp-union",
      name: "기저 합집합",
      op: "union",
      children: [
        makeRectLeaf("a", 0, 0, 100, 100),
        makeRectLeaf("b", 50, 0, 100, 100),
      ],
    });
    const cutter = makeRectLeaf("c", 60, 20, 30, 60);
    const root = createLiveBooleanGroup({
      id: "grp-root",
      name: "최종 실루엣",
      op: "subtract",
      children: [unionSub, cutter],
    });

    const eval1 = await evaluateLiveBooleanGroup(root);
    expect(eval1.ok).toBe(true);
    if (!eval1.ok) return;
    expect(eval1.evaluatedLeafCount).toBe(3);
    expect(eval1.bounds).toEqual({ x: 0, y: 0, width: 150, height: 100 });
    // 합집합 면적 15,000 - 구멍 면적 1,800 = 13,200 (내부 구멍 1개)
    expect(eval1.output.pieces[0]?.holeCount).toBe(1);

    // 비파괴 편집: 커터를 숨기면 원본 트리는 보존되면서 구멍이 사라진다
    const hiddenCutterRoot = toggleLiveBooleanNodeVisibility(root, "c");
    expect(findLiveBooleanNode(hiddenCutterRoot, "c")?.visible).toBe(false);
    expect(hashLiveBooleanNode(hiddenCutterRoot)).not.toBe(eval1.fingerprint);

    const eval2 = await evaluateLiveBooleanGroup(hiddenCutterRoot);
    expect(eval2.ok).toBe(true);
    if (!eval2.ok) return;
    expect(eval2.skippedHiddenCount).toBe(1);
    expect(eval2.output.pieces[0]?.holeCount).toBe(0);
  });

  it("liveOffsetPx 확장·수축과 로컬 이동 변환을 비파괴로 반영한다", async () => {
    const expandedRing = offsetPlanarRing(
      [
        [0, 0],
        [100, 0],
        [100, 100],
        [0, 100],
      ],
      10,
    );
    expect(Math.abs(studioPathSignedArea(expandedRing.flat()))).toBeCloseTo(14_400, 0);

    const baseGroup = createLiveBooleanGroup({
      id: "grp-offset",
      name: "오프셋 그룹",
      op: "union",
      liveOffsetPx: 5,
      children: [makeRectLeaf("sq", 10, 10, 40, 40)],
    });
    const evaluated = await evaluateLiveBooleanGroup(baseGroup);
    expect(evaluated.ok).toBe(true);
    if (!evaluated.ok) return;
    expect(evaluated.bounds.width).toBeCloseTo(50, 0);
    expect(evaluated.bounds.height).toBeCloseTo(50, 0);

    const moved = updateLiveBooleanNode(baseGroup, "sq", (node) => ({
      ...node,
      transform: { tx: 20, ty: 15, rotationDeg: 0, scaleX: 1, scaleY: 1 },
    }));
    const movedEval = await evaluateLiveBooleanGroup(moved);
    expect(movedEval.ok).toBe(true);
    if (!movedEval.ok) return;
    expect(movedEval.bounds.x).toBeCloseTo(25, 0);
    expect(movedEval.bounds.y).toBeCloseTo(20, 0);
  });

  it("자식 삽입·순서 변경·제거 및 Flatten DrawEl 시드 변환을 지원한다", async () => {
    let group = createLiveBooleanGroup({
      id: "grp-ops",
      name: "교차·제외",
      op: "intersect",
      children: [makeRectLeaf("r1", 0, 0, 100, 100)],
    });
    group = insertLiveBooleanChild(group, "grp-ops", makeRectLeaf("r2", 40, 40, 100, 100));
    expect(group.children.map((c) => c.id)).toEqual(["r1", "r2"]);

    group = reorderLiveBooleanChild(group, "grp-ops", 0, 1);
    expect(group.children.map((c) => c.id)).toEqual(["r2", "r1"]);

    const flattened = await flattenLiveBooleanGroupToDrawElSeeds(group);
    expect(flattened.ok).toBe(true);
    if (!flattened.ok) return;
    expect(flattened.seeds).toHaveLength(1);
    expect(flattened.seeds[0]?.type).toBe("draw");
    expect(flattened.evaluation.bounds).toEqual({ x: 40, y: 40, width: 60, height: 60 });

    const trimmed = removeLiveBooleanChild(group, "r2");
    expect(trimmed.children.map((c) => c.id)).toEqual(["r1"]);
  });
});
