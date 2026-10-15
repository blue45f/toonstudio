import { describe, expect, it } from "vitest";

import {
  classifyStudioPsdEffectNode,
  type StudioAdjustmentKind,
} from "../filter/studio-adjustment-effect-graph";

import {
  ADJUSTMENT_LAYER_KIND_OPTIONS,
  STUDIO_ADJUSTMENT_KIND_LABELS,
  buildStudioAdjustmentLayerGraph,
  type StudioAdjustmentLayerSpec,
} from "./studio-adjustment-layer";

function specFor(adjustment: StudioAdjustmentKind): StudioAdjustmentLayerSpec {
  return {
    id: `adj-${adjustment}`,
    name: STUDIO_ADJUSTMENT_KIND_LABELS[adjustment],
    adjustment,
    parameters: {},
    enabled: true,
    opacity: 1,
    blendMode: "source-over",
    clipToBelow: false,
  };
}

/** 라벨 표는 `Record<StudioAdjustmentKind, string>` 이라 모든 종류를 빠짐없이 가진다. */
const ALL_ADJUSTMENT_KINDS = Object.keys(STUDIO_ADJUSTMENT_KIND_LABELS).filter(
  (key): key is StudioAdjustmentKind => key in STUDIO_ADJUSTMENT_KIND_LABELS,
);

describe("buildStudioAdjustmentLayerGraph — 조정 종류 전수", () => {
  it.each(ALL_ADJUSTMENT_KINDS)(
    "%s: 조정 레이어 그래프가 자기 검증을 통과해 source → adjustment → output 으로 이어진다",
    (kind) => {
      const graph = buildStudioAdjustmentLayerGraph({
        spec: specFor(kind),
        compositeSourceHash: "composite-sha",
        graphId: `graph-${kind}`,
        revision: 0,
      });
      const adjustmentNode = graph.nodes.find((node) => node.kind === "adjustment");
      expect(adjustmentNode).toMatchObject({ kind: "adjustment", adjustment: kind });
      expect(graph.edges).toEqual([
        { from: `adj-${kind}:source`, to: `adj-${kind}:adjustment`, input: "source" },
        { from: `adj-${kind}:adjustment`, to: `adj-${kind}:output`, input: "source" },
      ]);
    },
  );

  it("생성 메뉴에 올라간 모든 종류는 라벨 표에 있고 그래프를 만들 수 있다", () => {
    expect(ADJUSTMENT_LAYER_KIND_OPTIONS.length).toBeGreaterThan(0);
    for (const kind of ADJUSTMENT_LAYER_KIND_OPTIONS) {
      expect(ALL_ADJUSTMENT_KINDS).toContain(kind);
      expect(() =>
        buildStudioAdjustmentLayerGraph({
          spec: specFor(kind),
          compositeSourceHash: "composite-sha",
          graphId: `menu-${kind}`,
          revision: 1,
        }),
      ).not.toThrow();
    }
  });

  it("PSD 전수 대응 4종도 PSD 보존 분류는 편집 가능 조정 레이어다", () => {
    for (const kind of ["black-white", "photo-filter", "selective-color", "color-lookup"] as const) {
      const graph = buildStudioAdjustmentLayerGraph({
        spec: specFor(kind),
        compositeSourceHash: "composite-sha",
        graphId: `psd-${kind}`,
        revision: 0,
      });
      const node = graph.nodes.find((entry) => entry.kind === "adjustment");
      expect(node).toBeDefined();
      expect(node === undefined ? null : classifyStudioPsdEffectNode(node)).toBe("editable");
    }
  });
});
