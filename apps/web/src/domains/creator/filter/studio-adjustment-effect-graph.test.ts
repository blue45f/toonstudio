import { describe, expect, it } from "vitest";

import {
  buildStudioEffectGraphEdgeIndex,
  classifyStudioPsdEffectNode,
  mutateStudioAdjustmentEffectGraph,
  planStudioEffectGraphRender,
  redoStudioEffectGraphTransaction,
  serializeStudioAdjustmentEffectGraph,
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

// ---------------------------------------------------------------------------
// 파라미터 검증 확장 (2026-10-15): 경계값·NaN/Infinity·잘못된 타입·연결 오류.
// 조정 실행기(studio-adjustment-executor)가 실행 시점에 값을 클램프하므로,
// 그래프 검증의 계약은 "유한한 숫자·올바른 타입·열거형"까지이며 명목 범위를
// 벗어난 유한 숫자는 거부하지 않는다 — 그 경계를 아래 케이스로 고정한다.
// ---------------------------------------------------------------------------

type AnyNode = StudioAdjustmentEffectGraph["nodes"][number];

function patchNode(graphIn: StudioAdjustmentEffectGraph, nodeId: string, patch: Record<string, unknown>): StudioAdjustmentEffectGraph {
  return {
    ...graphIn,
    nodes: graphIn.nodes.map((node) => (node.id === nodeId ? ({ ...node, ...patch } as AnyNode) : node)),
  };
}

function expectInvalid(graphIn: StudioAdjustmentEffectGraph, pattern?: RegExp): void {
  if (pattern) expect(() => validateStudioAdjustmentEffectGraph(graphIn)).toThrow(pattern);
  else expect(() => validateStudioAdjustmentEffectGraph(graphIn)).toThrow();
}

describe("파라미터 검증 확장 — 그래프 헤더 경계값", () => {
  it.each([2, 0, "1", Number.NaN])("version %s 는 거부된다", (version) => {
    expectInvalid({ ...graph, version: version as never });
  });

  it.each([-1, 0.5, Number.NaN, Number.POSITIVE_INFINITY, 2 ** 53])(
    "revision %s 는 거부된다",
    (revision) => {
      expectInvalid({ ...graph, revision }, /revision/u);
    },
  );

  it.each(["", "   ", "has space", "bang!", "한글id", "a".repeat(241)])(
    "graph id %j 는 거부된다",
    (id) => {
      expectInvalid({ ...graph, id });
    },
  );

  it("graph id 240자와 revision 0은 경계 안쪽으로 통과한다", () => {
    expect(() => validateStudioAdjustmentEffectGraph({ ...graph, id: "a".repeat(240), revision: 0 })).not.toThrow();
  });

  it("노드가 1개뿐이거나 비어 있으면 예산 아래로 거부된다", () => {
    expectInvalid({ ...graph, nodes: [graph.nodes[4]!] }, /node count/u);
    expectInvalid({ ...graph, nodes: [] }, /node count/u);
  });

  it("간선이 8193개면 중복 검사보다 먼저 예산 초과로 거부된다", () => {
    const edges = Array.from({ length: 8_193 }, () => graph.edges[0]!);
    expectInvalid({ ...graph, edges }, /edge count/u);
  });

  it("노드 2048개 체인은 통과하고 2049개는 거부된다", () => {
    const buildChain = (adjustments: number): StudioAdjustmentEffectGraph => {
      const nodes: AnyNode[] = [
        { id: "src", kind: "source", enabled: true, opacity: 1, blendMode: "normal", sourceHash: "h", embedded: true },
      ];
      const edges: StudioAdjustmentEffectGraph["edges"][number][] = [];
      let prev = "src";
      for (let i = 0; i < adjustments; i += 1) {
        const id = `adj-${i}`;
        nodes.push({
          id, kind: "adjustment", enabled: true, opacity: 1, blendMode: "normal",
          adjustment: "levels", parameters: { black: i }, colorSpace: "srgb",
        });
        edges.push({ from: prev, to: id, input: "source" });
        prev = id;
      }
      nodes.push({ id: "out", kind: "output", enabled: true, opacity: 1, blendMode: "normal", outputColorSpace: "srgb" });
      edges.push({ from: prev, to: "out", input: "source" });
      return { version: 1, id: "chain", revision: 0, outputNodeId: "out", nodes, edges };
    };
    // src + 조정 2046 + out = 2048 (상한)
    expect(() => validateStudioAdjustmentEffectGraph(buildChain(2_046))).not.toThrow();
    // src + 조정 2047 + out = 2049 (상한 바로 밖)
    expectInvalid(buildChain(2_047), /node count/u);
  });
});

describe("파라미터 검증 확장 — 노드 스칼라 경계값", () => {
  it.each([0, 0.5, 1])("opacity %s 는 통과한다", (opacity) => {
    expect(() => validateStudioAdjustmentEffectGraph(patchNode(graph, "glow", { opacity }))).not.toThrow();
  });

  it.each([-0.0001, 1.0001, -1, 2, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, "0.5", null])(
    "opacity %s 는 거부된다",
    (opacity) => {
      expectInvalid(patchNode(graph, "glow", { opacity }), /opacity/u);
    },
  );

  it.each(["", "   ", "has space", "a".repeat(241)])("node id %j 는 거부된다", (id) => {
    const renamed = patchNode(graph, "glow", { id });
    expectInvalid({
      ...renamed,
      edges: graph.edges.map((edge) => ({
        ...edge,
        from: edge.from === "glow" ? id : edge.from,
        to: edge.to === "glow" ? id : edge.to,
      })),
    });
  });

  it("node id 의 점·콜론·대시·언더스코어는 통과한다", () => {
    const id = "fx.glow:v2_final-1";
    const renamed = patchNode(graph, "glow", { id });
    expect(() =>
      validateStudioAdjustmentEffectGraph({
        ...renamed,
        edges: graph.edges.map((edge) => ({
          ...edge,
          from: edge.from === "glow" ? id : edge.from,
          to: edge.to === "glow" ? id : edge.to,
        })),
      }),
    ).not.toThrow();
  });

  it.each([
    ["blendMode", ""],
    ["blendMode", "   "],
    ["blendMode", 123],
  ])("%s = %j (source 노드) 는 거부된다", (field, value) => {
    expectInvalid(patchNode(graph, "source", { [field]: value }));
  });

  it.each(["", "   ", 42])("sourceHash %j 는 거부된다", (sourceHash) => {
    expectInvalid(patchNode(graph, "source", { sourceHash }));
  });

  it.each([0, 1, 10_000])("featherPx %s 는 통과한다", (featherPx) => {
    expect(() => validateStudioAdjustmentEffectGraph(patchNode(graph, "mask", { featherPx }))).not.toThrow();
  });

  it.each([-1, 10_001, Number.NaN, Number.POSITIVE_INFINITY, "2"])("featherPx %s 는 거부된다", (featherPx) => {
    expectInvalid(patchNode(graph, "mask", { featherPx }), /featherPx/u);
  });
});

describe("파라미터 검증 확장 — parameters 값 타입·유한성", () => {
  it("문자열·불리언·유한 숫자·유한 숫자 배열 파라미터는 통과한다", () => {
    const patched = patchNode(graph, "levels", {
      parameters: { label: "warm", useLegacy: true, gamma: 0, points: [0, 128, 255], empty: [] },
    });
    expect(() => validateStudioAdjustmentEffectGraph(patched)).not.toThrow();
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["null", null],
    ["undefined", undefined],
    ["plain object", { nested: 1 }],
    ["array with NaN", [1, Number.NaN]],
    ["array with string", [1, "2"]],
    ["array with nested array", [[1]]],
    ["array with null", [null]],
  ])("adjustment parameters 값 %s 는 거부된다", (_label, value) => {
    expectInvalid(patchNode(graph, "levels", { parameters: { gamma: value } }), /parameters\.gamma/u);
  });

  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["object", { r: 1 }],
  ])("live-effect parameters 값 %s 는 거부된다", (_label, value) => {
    expectInvalid(patchNode(graph, "glow", { parameters: { radius: value } }), /parameters\.radius/u);
  });

  it.each([null, [1, 2], "gamma=1", 42])("parameters 자체가 %j 면 거부된다", (parameters) => {
    expectInvalid(patchNode(graph, "levels", { parameters }), /parameters is invalid/u);
  });

  it("명목 범위를 벗어난 유한 숫자는 그래프 단계에서 거부하지 않는다(실행기 클램프 계약)", () => {
    expect(() =>
      validateStudioAdjustmentEffectGraph(patchNode(graph, "levels", { parameters: { gamma: -5, black: 99_999 } })),
    ).not.toThrow();
    expect(() =>
      validateStudioAdjustmentEffectGraph(patchNode(graph, "glow", { parameters: { radius: -100 } })),
    ).not.toThrow();
  });
});

describe("파라미터 검증 확장 — 열거형·불리언 (캐스트 유입 차단)", () => {
  it.each([
    ["adjustment", { adjustment: "bogus" }, "levels"],
    ["adjustment", { adjustment: "" }, "levels"],
    ["adjustment", { colorSpace: "bogus" }, "levels"],
    ["adjustment", { colorSpace: "cmyk" }, "levels"],
    ["live-effect", { effect: "bogus" }, "glow"],
    ["live-effect", { preferredBackend: "bogus" }, "glow"],
    ["live-effect", { preferredBackend: "gpu" }, "glow"],
    ["output", { outputColorSpace: "bogus" }, "output"],
    ["output", { outputColorSpace: "lab" }, "output"],
  ])("%s 노드 %j 는 거부된다", (_kind, patch, nodeId) => {
    expectInvalid(patchNode(graph, nodeId, patch as Record<string, unknown>));
  });

  it.each(["srgb", "linear-srgb", "display-p3", "lab"])("adjustment colorSpace %s 는 통과한다", (colorSpace) => {
    expect(() => validateStudioAdjustmentEffectGraph(patchNode(graph, "levels", { colorSpace }))).not.toThrow();
  });

  it.each(["auto", "webgpu", "cpu"])("preferredBackend %s 는 통과한다", (preferredBackend) => {
    expect(() => validateStudioAdjustmentEffectGraph(patchNode(graph, "glow", { preferredBackend }))).not.toThrow();
  });

  it("알 수 없는 노드 종류는 거부된다", () => {
    expectInvalid(patchNode(graph, "glow", { kind: "bogus" }), /kind is invalid/u);
  });

  it.each([
    ["source", { enabled: "yes" }, "source"],
    ["source", { embedded: 1 }, "source"],
    ["source", { sourceRevision: 7 }, "source"],
    ["mask", { inverted: "no" }, "mask"],
    ["mask", { maskHash: "" }, "mask"],
    ["mask", { maskHash: "   " }, "mask"],
  ])("%s 노드 불리언/해시 %j 는 거부된다", (_kind, patch, nodeId) => {
    expectInvalid(patchNode(graph, nodeId, patch as Record<string, unknown>));
  });

  it("blend 노드의 clipping/isolate 가 불리언이 아니면 거부된다", () => {
    const withBlend: StudioAdjustmentEffectGraph = {
      ...graph,
      nodes: [
        ...graph.nodes.slice(0, 4),
        { id: "blend", kind: "blend", enabled: false, opacity: 1, blendMode: "normal", clipping: false, isolate: false },
        graph.nodes[4]!,
      ],
    };
    expect(() => validateStudioAdjustmentEffectGraph(withBlend)).not.toThrow();
    expectInvalid(patchNode(withBlend, "blend", { clipping: 0 }), /clipping/u);
    expectInvalid(patchNode(withBlend, "blend", { isolate: "yes" }), /isolate/u);
  });
});

describe("파라미터 검증 확장 — 간선·구조 오류", () => {
  it("없는 노드를 참조하는 간선은 거부된다", () => {
    expectInvalid({ ...graph, edges: [...graph.edges, { from: "ghost", to: "output", input: "source" }] }, /unknown node/u);
    expectInvalid({ ...graph, edges: [...graph.edges, { from: "glow", to: "ghost", input: "source" }] }, /unknown node/u);
  });

  it("자기 참조 간선은 거부된다", () => {
    expectInvalid({ ...graph, edges: [...graph.edges, { from: "glow", to: "glow", input: "source" }] }, /self/u);
  });

  it("완전히 같은 간선(from·to·input)의 중복은 거부되지만 input이 다르면 허용된다", () => {
    expectInvalid({ ...graph, edges: [...graph.edges, graph.edges[2]!] }, /duplicate graph edge/u);
    const differentInput: StudioAdjustmentEffectGraph = {
      ...graph,
      edges: [...graph.edges, { from: "mask", to: "glow", input: "backdrop" }],
    };
    expect(() => validateStudioAdjustmentEffectGraph(differentInput)).not.toThrow();
  });

  it("알 수 없는 edge input 종류는 거부된다", () => {
    expectInvalid(
      { ...graph, edges: graph.edges.map((edge, i) => (i === 0 ? { ...edge, input: "bogus" as never } : edge)) },
      /edge input/u,
    );
  });

  it("중복 노드 id는 거부된다", () => {
    expectInvalid({ ...graph, nodes: [...graph.nodes, graph.nodes[1]!] }, /Duplicate graph node id/u);
  });

  it.each(["ghost", "levels", "source"])("outputNodeId %s (없거나 output이 아님)는 거부된다", (outputNodeId) => {
    expectInvalid({ ...graph, outputNodeId }, /outputNodeId/u);
  });

  it("두 노드 사이 작은 사이클도 거부된다", () => {
    const cyclic: StudioAdjustmentEffectGraph = {
      version: 1, id: "cyc", revision: 0, outputNodeId: "out",
      nodes: [
        { id: "a", kind: "adjustment", enabled: true, opacity: 1, blendMode: "normal", adjustment: "levels", parameters: {}, colorSpace: "srgb" },
        { id: "b", kind: "adjustment", enabled: true, opacity: 1, blendMode: "normal", adjustment: "hsl", parameters: {}, colorSpace: "srgb" },
        { id: "out", kind: "output", enabled: true, opacity: 1, blendMode: "normal", outputColorSpace: "srgb" },
      ],
      edges: [
        { from: "a", to: "b", input: "source" },
        { from: "b", to: "a", input: "source" },
        { from: "b", to: "out", input: "source" },
      ],
    };
    expectInvalid(cyclic, /cycle/u);
  });

  it("비활성 고립 노드는 허용되고 활성 고립 노드만 거부된다", () => {
    const orphan = {
      id: "orphan", kind: "live-effect", enabled: false, opacity: 1, blendMode: "normal",
      effect: "blur", parameters: {}, preferredBackend: "cpu",
    } as AnyNode;
    expect(() => validateStudioAdjustmentEffectGraph({ ...graph, nodes: [...graph.nodes, orphan] })).not.toThrow();
    expectInvalid({ ...graph, nodes: [...graph.nodes, { ...orphan, enabled: true }] }, /unreachable/u);
  });
});

describe("파라미터 검증 확장 — 변이(mutation) 경로 검증 전파", () => {
  it.each([
    ["opacity 범위 밖", { type: "patch-node", nodeId: "glow", patch: { opacity: 2 } }],
    ["opacity NaN", { type: "patch-node", nodeId: "glow", patch: { opacity: Number.NaN } }],
    ["parameters NaN", { type: "patch-node", nodeId: "levels", patch: { parameters: { gamma: Number.NaN } } }],
    ["featherPx 음수", { type: "patch-node", nodeId: "mask", patch: { featherPx: -1 } }],
    ["blendMode 빈 값", { type: "patch-node", nodeId: "glow", patch: { blendMode: "" } }],
  ])("patch-node %s 는 변이 단계에서 거부된다", (_label, mutation) => {
    expect(() => mutateStudioAdjustmentEffectGraph(graph, mutation as never)).toThrow();
  });

  it("add-node 중복 id와 add-edge 자기참조·미지 참조는 거부된다", () => {
    expect(() => mutateStudioAdjustmentEffectGraph(graph, { type: "add-node", node: graph.nodes[1]! })).toThrow(/Duplicate/u);
    expect(() =>
      mutateStudioAdjustmentEffectGraph(graph, { type: "add-edge", edge: { from: "glow", to: "glow", input: "source" } }),
    ).toThrow(/self/u);
    expect(() =>
      mutateStudioAdjustmentEffectGraph(graph, { type: "add-edge", edge: { from: "ghost", to: "output", input: "source" } }),
    ).toThrow(/unknown node/u);
  });

  it("set-output을 output이 아닌 노드나 없는 노드로 바꾸면 거부된다", () => {
    expect(() => mutateStudioAdjustmentEffectGraph(graph, { type: "set-output", nodeId: "levels" })).toThrow(/outputNodeId/u);
    expect(() => mutateStudioAdjustmentEffectGraph(graph, { type: "set-output", nodeId: "ghost" })).toThrow(/outputNodeId/u);
  });

  it("output 노드를 제거하면 dangling outputNodeId로 거부된다", () => {
    expect(() => mutateStudioAdjustmentEffectGraph(graph, { type: "remove-node", nodeId: "output" })).toThrow(/outputNodeId/u);
  });

  it("유효한 patch는 revision만 올리고 직렬화는 결정론적이다", () => {
    const next = mutateStudioAdjustmentEffectGraph(graph, { type: "patch-node", nodeId: "glow", patch: { opacity: 0 } });
    expect(next.revision).toBe(graph.revision + 1);
    expect(serializeStudioAdjustmentEffectGraph(graph)).toBe(serializeStudioAdjustmentEffectGraph(graph));
    expect(() => serializeStudioAdjustmentEffectGraph(patchNode(graph, "glow", { opacity: 9 }))).toThrow();
  });
});
