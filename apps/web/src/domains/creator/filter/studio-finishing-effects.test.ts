import { describe, expect, it } from "vitest";

import {
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
} from "./studio-adjustment-effect-graph";
import {
  STUDIO_FINISHING_EFFECT_PRESETS,
  applyStudioFinishingEffect,
  buildStudioFinishingComparePreview,
  describeStudioFinishingEffectChanges,
  isStudioFinishingEffectApplied,
  removeStudioFinishingEffect,
  toggleStudioFinishingEffect,
} from "./studio-finishing-effects";

const graph: StudioAdjustmentEffectGraph = {
  version: 1,
  id: "graph-1",
  revision: 0,
  outputNodeId: "output",
  nodes: [
    {
      id: "source",
      kind: "source",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      sourceHash: "source-sha256",
      embedded: true,
    },
    {
      id: "levels",
      kind: "adjustment",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      adjustment: "levels",
      parameters: { black: 10, white: 245 },
      colorSpace: "srgb",
    },
    {
      id: "output",
      kind: "output",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      outputColorSpace: "srgb",
    },
  ],
  edges: [
    { from: "source", to: "levels", input: "source" },
    { from: "levels", to: "output", input: "source" },
  ],
};

describe("studio finishing effects (원터치 마감 효과)", () => {
  it("프리셋 3종은 글로우·그림자·부풀림이며 노드 id가 겹치지 않는다", () => {
    expect(STUDIO_FINISHING_EFFECT_PRESETS.map((preset) => preset.effect)).toEqual([
      "glow",
      "drop-shadow",
      "inflate",
    ]);
    expect(new Set(STUDIO_FINISHING_EFFECT_PRESETS.map((preset) => preset.nodeId)).size).toBe(3);
  });

  it("적용하면 출력 직전 체인에 끼워지고 그래프 검증을 통과한다", () => {
    const entry = applyStudioFinishingEffect(graph, "glow", "tx-1");
    expect(isStudioFinishingEffectApplied(entry.after, "glow")).toBe(true);
    expect(entry.after.edges).toContainEqual({ from: "levels", to: "finishing-glow", input: "source" });
    expect(entry.after.edges).toContainEqual({ from: "finishing-glow", to: "output", input: "source" });
    expect(entry.after.edges).not.toContainEqual({ from: "levels", to: "output", input: "source" });
    expect(() => validateStudioAdjustmentEffectGraph(entry.after)).not.toThrow();
    // 입력 그래프 불변
    expect(graph.nodes.some((node) => node.id === "finishing-glow")).toBe(false);
  });

  it("같은 효과를 다시 적용해도 노드가 중복되지 않고 프리셋 값으로 복원된다", () => {
    const once = applyStudioFinishingEffect(graph, "drop-shadow", "tx-1").after;
    const twice = applyStudioFinishingEffect(once, "drop-shadow", "tx-2").after;
    expect(twice.nodes.filter((node) => node.id === "finishing-drop-shadow")).toHaveLength(1);
  });

  it("3종을 모두 적용하면 체인이 쌓이고 해제하면 원래 간선으로 돌아온다", () => {
    let next = graph;
    for (const preset of STUDIO_FINISHING_EFFECT_PRESETS) {
      next = toggleStudioFinishingEffect(next, preset.id, `tx-${preset.id}`);
    }
    expect(next.nodes).toHaveLength(graph.nodes.length + 3);
    expect(() => validateStudioAdjustmentEffectGraph(next)).not.toThrow();
    for (const preset of STUDIO_FINISHING_EFFECT_PRESETS) {
      next = toggleStudioFinishingEffect(next, preset.id, `tx-off-${preset.id}`);
    }
    expect(next.nodes.map((node) => node.id)).toEqual(graph.nodes.map((node) => node.id));
    expect(next.edges).toEqual(graph.edges);
  });

  it("적용되지 않은 효과 해제는 null이다", () => {
    expect(removeStudioFinishingEffect(graph, "inflate", "tx-x")).toBeNull();
    expect(isStudioFinishingEffectApplied(graph, "inflate")).toBe(false);
  });

  it("비교 미리보기는 추가 단계와 효과 차이를 알려준다", () => {
    const after = applyStudioFinishingEffect(graph, "glow", "tx-1").after;
    const preview = buildStudioFinishingComparePreview({
      before: graph,
      after,
      webGpuAvailable: false,
      sourceColorSpace: "srgb",
    });
    expect(preview.addedStepNodeIds).toEqual(["finishing-glow"]);
    expect(preview.removedStepNodeIds).toEqual([]);
    expect(preview.afterPlan.steps.length).toBe(preview.beforePlan.steps.length + 1);
    expect(describeStudioFinishingEffectChanges(graph, after)).toEqual([
      { id: "glow", label: "글로우", change: "added" },
      { id: "drop-shadow", label: "그림자", change: "unchanged" },
      { id: "inflate", label: "부풀림", change: "unchanged" },
    ]);
  });
});
