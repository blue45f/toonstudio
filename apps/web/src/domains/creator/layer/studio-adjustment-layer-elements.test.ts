import { describe, expect, it } from "vitest";

import type { El } from "../studio-element-model";

import {
  adjustmentSpecFromEl,
  createAdjustmentEl,
  insertAdjustmentLayer,
  isAdjustmentEl,
  moveAdjustmentLayer,
  patchAdjustmentLayer,
  planAdjustmentComposite,
  removeAdjustmentLayer,
  stackEntriesFromElements,
} from "./studio-adjustment-layer-elements";

function drawEl(id: string): El {
  return {
    id,
    type: "draw",
    x: 0,
    y: 0,
    width: 10,
    height: 10,
    rotation: 0,
  } as unknown as El;
}

function adjustmentEl(id: string, patch?: Parameters<typeof patchAdjustmentLayer>[2]): El {
  const base = createAdjustmentEl({ id, kind: "levels", pageWidth: 720, pageHeight: 1200 });
  return patch ? (patchAdjustmentLayer([base], id, patch)[0] as El) : base;
}

describe("createAdjustmentEl + adjustmentSpecFromEl", () => {
  it("페이지 경계 지오메트리와 종류별 기본 이름으로 만든다", () => {
    const el = createAdjustmentEl({ id: "adj1", kind: "curves", pageWidth: 720, pageHeight: 1200 });
    expect(isAdjustmentEl(el)).toBe(true);
    if (!isAdjustmentEl(el)) throw new Error("unreachable");
    expect(el.width).toBe(720);
    expect(el.height).toBe(1200);
    expect(el.clipToBelow).toBe(false);
    const spec = adjustmentSpecFromEl(el);
    expect(spec.name).toBe("곡선 조정 레이어");
    expect(spec.enabled).toBe(true);
    expect(spec.opacity).toBe(1);
    expect(spec.blendMode).toBe("source-over");
  });

  it("메타데이터(hidden/opacity/blendMode)가 spec으로 정확히 넘어간다", () => {
    const el = adjustmentEl("adj1", { enabled: false, opacity: 0.4, blendMode: "multiply" });
    if (!isAdjustmentEl(el)) throw new Error("unreachable");
    const spec = adjustmentSpecFromEl(el);
    expect(spec.enabled).toBe(false);
    expect(spec.opacity).toBe(0.4);
    expect(spec.blendMode).toBe("multiply");
  });

  it("저장/재열기(JSON 왕복) 후에도 조정 레이어로 복원된다", () => {
    const el = adjustmentEl("adj1", { clipToBelow: true, opacity: 0.7 });
    const revived = JSON.parse(JSON.stringify(el)) as El;
    expect(isAdjustmentEl(revived)).toBe(true);
    if (!isAdjustmentEl(revived)) throw new Error("unreachable");
    expect(revived.clipToBelow).toBe(true);
    expect(adjustmentSpecFromEl(revived).opacity).toBe(0.7);
  });
});

describe("패널 조작", () => {
  it("생성은 맨 위, 삭제는 조정 레이어만, 일반 요소 삭제 요청은 무시한다", () => {
    const base: El[] = [drawEl("a"), drawEl("b")];
    const withAdj = insertAdjustmentLayer(base, adjustmentEl("adj1"));
    expect(withAdj.map((el) => el.id)).toEqual(["a", "b", "adj1"]);
    expect(removeAdjustmentLayer(withAdj, "adj1").map((el) => el.id)).toEqual(["a", "b"]);
    expect(removeAdjustmentLayer(withAdj, "a")).toBe(withAdj);
    expect(base).toHaveLength(2); // 원본 불변
  });

  it("순서 이동은 인접 교환이고 경계에서 멈춘다", () => {
    const els: El[] = [drawEl("a"), adjustmentEl("adj1"), drawEl("b")];
    expect(moveAdjustmentLayer(els, "adj1", "up").map((el) => el.id)).toEqual(["a", "b", "adj1"]);
    expect(moveAdjustmentLayer(els, "adj1", "down").map((el) => el.id)).toEqual(["adj1", "a", "b"]);
    const top: El[] = [drawEl("a"), adjustmentEl("adj1")];
    expect(moveAdjustmentLayer(top, "adj1", "up")).toBe(top);
  });

  it("클립 패치가 spec까지 닿는다", () => {
    const els = patchAdjustmentLayer([adjustmentEl("adj1")], "adj1", { clipToBelow: true });
    const first = els[0] as El;
    if (!isAdjustmentEl(first)) throw new Error("unreachable");
    expect(adjustmentSpecFromEl(first).clipToBelow).toBe(true);
  });
});

describe("planAdjustmentComposite", () => {
  it("일반 구간과 조정 단계를 아래→위 순서로 만들고 그래프가 검증기를 통과한다", () => {
    const els: El[] = [drawEl("a"), drawEl("b"), adjustmentEl("adj1"), drawEl("c")];
    const steps = planAdjustmentComposite(els, {
      graphIdPrefix: "doc1:page1",
      revision: 3,
      compositeSourceHashFor: () => "hash-below",
    });
    expect(steps.map((s) => s.type)).toEqual(["elements", "adjustment", "elements"]);
    const adj = steps[1];
    if (!adj || adj.type !== "adjustment") throw new Error("unreachable");
    expect(adj.graph.id).toBe("doc1:page1:adj1");
    expect(adj.graph.nodes.map((n) => n.kind)).toEqual(["source", "adjustment", "output"]);
    // 비클립 조정은 아래 레이어 a·b에 닿고 위의 c에는 닿지 않는다.
    expect(adj.affectingLayerIds).toEqual(["a", "b"]);
    expect(adj.clipTargetLayerId).toBeNull();
  });

  it("클립 조정은 바로 아래 레이어에만 닿고 clipTarget이 그 레이어다", () => {
    const clipped = adjustmentEl("adj1", { clipToBelow: true });
    const els: El[] = [drawEl("a"), drawEl("b"), clipped, drawEl("c")];
    const steps = planAdjustmentComposite(els, {
      graphIdPrefix: "doc1:page1",
      revision: 1,
      compositeSourceHashFor: () => "hash-below",
    });
    const adj = steps.find((s) => s.type === "adjustment");
    if (!adj || adj.type !== "adjustment") throw new Error("unreachable");
    expect(adj.affectingLayerIds).toEqual(["b"]);
    expect(adj.clipTargetLayerId).toBe("b");
  });

  it("스택 항목 변환은 요소 순서를 그대로 보존한다", () => {
    const els: El[] = [drawEl("a"), adjustmentEl("adj1")];
    const stack = stackEntriesFromElements(els);
    expect(stack.map((e) => e.type)).toEqual(["layer", "adjustment"]);
  });
});
