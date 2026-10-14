import { describe, expect, it } from "vitest";

import {
  buildStudioEffectGraphEdgeIndex,
  classifyStudioPsdEffectNode,
  planStudioEffectGraphRender,
  redoStudioEffectGraphTransaction,
  transactStudioEffectGraph,
  undoStudioEffectGraphTransaction,
  validateStudioAdjustmentEffectGraph,
  type StudioAdjustmentEffectGraph,
} from "./studio-adjustment-effect-graph";

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
      parameters: { black: 10, white: 245, gamma: 1.1 },
      colorSpace: "linear-srgb",
    },
    {
      id: "mask",
      kind: "mask",
      enabled: true,
      opacity: 1,
      blendMode: "normal",
      maskHash: "mask-sha256",
      inverted: false,
      featherPx: 2,
    },
    {
      id: "glow",
      kind: "live-effect",
      enabled: true,
      opacity: 0.8,
      blendMode: "screen",
      effect: "glow",
      parameters: { radius: 8 },
      preferredBackend: "auto",
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
    { from: "levels", to: "glow", input: "source" },
    { from: "mask", to: "glow", input: "mask" },
    { from: "glow", to: "output", input: "source" },
  ],
};

describe("studio adjustment/effect graph", () => {
  it("validates a reachable acyclic graph and builds a shared preview/export plan", () => {
    const validation = validateStudioAdjustmentEffectGraph(graph);
    expect(validation.order.indexOf("source")).toBeLessThan(validation.order.indexOf("output"));
    const preview = planStudioEffectGraphRender({
      graph,
      purpose: "preview",
      webGpuAvailable: true,
      sourceColorSpace: "srgb",
    });
    const exported = planStudioEffectGraphRender({
      graph,
      purpose: "export",
      webGpuAvailable: false,
      sourceColorSpace: "srgb",
    });
    expect(preview.steps.find((step) => step.nodeId === "glow")?.backend).toBe("webgpu");
    expect(exported.steps.find((step) => step.nodeId === "glow")?.backend).toBe("cpu");
    expect(preview.steps.find((step) => step.nodeId === "glow")?.maskNodeIds).toEqual(["mask"]);
  });

  it("rejects cycles and enabled unreachable nodes", () => {
    expect(() =>
      validateStudioAdjustmentEffectGraph({
        ...graph,
        edges: [...graph.edges, { from: "output", to: "source", input: "source" }],
      }),
    ).toThrow(/cycle/u);
    expect(() =>
      validateStudioAdjustmentEffectGraph({
        ...graph,
        nodes: [
          ...graph.nodes,
          {
            id: "orphan",
            kind: "live-effect",
            enabled: true,
            opacity: 1,
            blendMode: "normal",
            effect: "blur",
            parameters: {},
            preferredBackend: "cpu",
          },
        ],
      }),
    ).toThrow(/unreachable/u);
  });

  it("records multi-mutation graph edits as one undoable transaction", () => {
    const entry = transactStudioEffectGraph(graph, "tx-1", [
      { type: "patch-node", nodeId: "glow", patch: { opacity: 0.25 } },
      { type: "patch-node", nodeId: "levels", patch: { enabled: false } },
    ]);
    expect(entry.after.revision).toBe(2);
    expect(entry.beforeHash).not.toBe(entry.afterHash);
    expect(undoStudioEffectGraphTransaction(entry)).toBe(graph);
    expect(redoStudioEffectGraphTransaction(entry)).toBe(entry.after);
  });

  it("classifies PSD preservation without pretending unsupported effects stay editable", () => {
    expect(classifyStudioPsdEffectNode(graph.nodes[1]!)).toBe("editable");
    expect(classifyStudioPsdEffectNode(graph.nodes[3]!)).toBe("editable");
    expect(
      classifyStudioPsdEffectNode({
        id: "distort",
        kind: "live-effect",
        enabled: true,
        opacity: 1,
        blendMode: "normal",
        effect: "distort",
        parameters: {},
        preferredBackend: "auto",
      }),
    ).toBe("flattened");
  });
});

describe("간선 인덱스 맵 (렌더 계획 O(N·E) 스캔 제거)", () => {
  it("인덱스 버킷은 원본 edges 순서와 동일하고 filter 결과와 일치한다", () => {
    const index = buildStudioEffectGraphEdgeIndex(graph.edges);
    for (const node of graph.nodes) {
      expect(index.incomingByNodeId.get(node.id) ?? []).toEqual(
        graph.edges.filter((edge) => edge.to === node.id),
      );
      expect(index.outgoingByNodeId.get(node.id) ?? []).toEqual(
        graph.edges.filter((edge) => edge.from === node.id),
      );
    }
  });

  it("큰 그래프에서도 렌더 계획의 입력·마스크 순서가 전체 스캔 기준과 동일하다", () => {
    const nodes: StudioAdjustmentEffectGraph["nodes"][number][] = [
      { id: "src", kind: "source", enabled: true, opacity: 1, blendMode: "normal", sourceHash: "h", embedded: true },
    ];
    const edges: StudioAdjustmentEffectGraph["edges"][number][] = [];
    let prev = "src";
    for (let i = 0; i < 60; i += 1) {
      const id = `adj-${i}`;
      nodes.push({
        id, kind: "adjustment", enabled: true, opacity: 1, blendMode: "normal",
        adjustment: "levels", parameters: { black: i }, colorSpace: "srgb",
      });
      edges.push({ from: prev, to: id, input: "source" });
      edges.push({ from: "src", to: id, input: "backdrop" });
      prev = id;
    }
    nodes.push({ id: "out", kind: "output", enabled: true, opacity: 1, blendMode: "normal", outputColorSpace: "srgb" });
    edges.push({ from: prev, to: "out", input: "source" });
    const big: StudioAdjustmentEffectGraph = {
      version: 1, id: "big", revision: 3, outputNodeId: "out", nodes, edges,
    };
    const plan = planStudioEffectGraphRender({
      graph: big, purpose: "export", webGpuAvailable: false, sourceColorSpace: "srgb",
    });
    expect(plan.steps).toHaveLength(nodes.length);
    for (const step of plan.steps) {
      const expected = edges.filter((edge) => edge.to === step.nodeId);
      expect(step.inputNodeIds).toEqual(expected.filter((e) => e.input !== "mask").map((e) => e.from));
      expect(step.maskNodeIds).toEqual(expected.filter((e) => e.input === "mask").map((e) => e.from));
    }
  });
});
