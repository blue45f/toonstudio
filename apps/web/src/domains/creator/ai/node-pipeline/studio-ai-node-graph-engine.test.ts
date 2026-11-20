import { describe, expect, it } from "vitest";

import {
  APP_MODE_PRIMARY_BUDGET_LIMIT,
  addGraphNode,
  connectGraphEdge,
  createAiNodeGraph,
  encapsulateSubgraph,
  evaluateGraphRightsGate,
  executeAiNodeGraphDryRun,
  expandSubgraph,
  projectGraphToAppMode,
  updateNodeParam,
  validateAndSortAiNodeGraph,
  type AiGraphNode,
  type AiNodeGraphDocument,
} from "./studio-ai-node-graph-engine";

function buildBasePipeline(): AiNodeGraphDocument {
  let g = createAiNodeGraph({
    id: "pipe-bg-tone",
    name: "배경 선화-채색 파이프라인",
    deterministicSeed: 7711,
    seedLocked: true,
    commercialExportMode: true,
  });

  const nodes: AiGraphNode[] = [
    {
      id: "n-in",
      kind: "canvas-layer-in",
      label: "원본 선화 입력",
      inputs: [],
      outputs: [{ id: "img", label: "이미지", dataType: "image" }],
      params: { layerRef: "lineart-01" },
      provenance: "creator-owned",
    },
    {
      id: "n-filter",
      kind: "deterministic-filter",
      label: "명도·톤 정규화",
      inputs: [{ id: "src", label: "입력", dataType: "image", required: true }],
      outputs: [{ id: "out", label: "보정 이미지", dataType: "image" }],
      params: { contrast: 1.15, gamma: 0.95 },
      controlMeta: [
        {
          key: "contrast",
          label: "대비 강도",
          controlType: "slider",
          min: 0.5,
          max: 2,
          step: 0.05,
          exposedInAppMode: true,
          priority: 1,
        },
      ],
      estimatedMs: 45,
    },
    {
      id: "n-gen",
      kind: "ai-generate",
      label: "배경 채색 생성",
      inputs: [{ id: "cond", label: "선화 조건", dataType: "image", required: true }],
      outputs: [{ id: "gen", label: "생성 이미지", dataType: "image" }],
      params: { prompt: "따뜻한 오후 교실 채색", strength: 0.6 },
      controlMeta: [
        {
          key: "prompt",
          label: "채색 지시문",
          controlType: "text",
          exposedInAppMode: true,
          priority: 2,
        },
        {
          key: "strength",
          label: "변형 강도",
          controlType: "slider",
          min: 0.1,
          max: 1,
          step: 0.05,
          exposedInAppMode: true,
          priority: 3,
        },
      ],
      provenance: "licensed-commercial",
      estimatedCredits: 3,
      estimatedMs: 1400,
    },
    {
      id: "n-rights",
      kind: "rights-gate",
      label: "출고 권리 검수",
      inputs: [{ id: "in", label: "후보 이미지", dataType: "image", required: true }],
      outputs: [{ id: "verified", label: "검증 완료", dataType: "image" }],
      params: { strictCommercial: true },
    },
    {
      id: "n-out",
      kind: "layer-out",
      label: "새 초안 레이어 삽입",
      inputs: [{ id: "img", label: "출력 이미지", dataType: "image", required: true }],
      outputs: [],
      params: { layerName: "AI 채색 초안" },
    },
  ];

  for (const node of nodes) g = addGraphNode(g, node);

  const edges = [
    { id: "e1", fromNodeId: "n-in", fromPortId: "img", toNodeId: "n-filter", toPortId: "src" },
    { id: "e2", fromNodeId: "n-filter", fromPortId: "out", toNodeId: "n-gen", toPortId: "cond" },
    { id: "e3", fromNodeId: "n-gen", fromPortId: "gen", toNodeId: "n-rights", toPortId: "in" },
    { id: "e4", fromNodeId: "n-rights", fromPortId: "verified", toNodeId: "n-out", toPortId: "img" },
  ];
  for (const edge of edges) {
    const res = connectGraphEdge(g, edge);
    expect(res.ok).toBe(true);
    if (res.ok) g = res.graph;
  }
  return g;
}

describe("studio-ai-node-graph-engine", () => {
  it("Kahn 위상 정렬로 결정적 실행 순서를 계산하고 순환 연결을 즉시 차단한다", () => {
    const graph = buildBasePipeline();
    const report = validateAndSortAiNodeGraph(graph);
    expect(report.ok).toBe(true);
    expect(report.topologicalOrder).toEqual([
      "n-in",
      "n-filter",
      "n-gen",
      "n-rights",
      "n-out",
    ]);

    // 뒤쪽 노드에서 앞쪽 노드로 역방향 연결을 시도하면 사이클로 차단된다.
    const cyclicGraph = addGraphNode(graph, {
      id: "n-loop-a",
      kind: "deterministic-filter",
      label: "루프 A",
      inputs: [{ id: "in", label: "입력", dataType: "image" }],
      outputs: [{ id: "out", label: "출력", dataType: "image" }],
      params: {},
    });
    const withLoopB = addGraphNode(cyclicGraph, {
      id: "n-loop-b",
      kind: "deterministic-filter",
      label: "루프 B",
      inputs: [{ id: "in", label: "입력", dataType: "image" }],
      outputs: [{ id: "out", label: "출력", dataType: "image" }],
      params: {},
    });
    const ab = connectGraphEdge(withLoopB, {
      id: "e-ab",
      fromNodeId: "n-loop-a",
      fromPortId: "out",
      toNodeId: "n-loop-b",
      toPortId: "in",
    });
    expect(ab.ok).toBe(true);
    if (!ab.ok) return;

    const ba = connectGraphEdge(ab.graph, {
      id: "e-ba",
      fromNodeId: "n-loop-b",
      fromPortId: "out",
      toNodeId: "n-loop-a",
      toPortId: "in",
    });
    expect(ba.ok).toBe(false);
    if (!ba.ok) {
      expect(ba.reasonKo).toContain("순환");
    }
  });

  it("서브그래프 캡슐화와 재전개(Expand) 시 경계 연결과 앱 모드 파라미터를 보존한다", () => {
    const graph = buildBasePipeline();
    const collapsed = encapsulateSubgraph(graph, ["n-filter", "n-gen"], {
      subgraphId: "sg-colorize",
      nodeId: "n-sg-colorize",
      name: "원클릭 배경 채색 모듈",
    });
    expect(collapsed.ok).toBe(true);
    if (!collapsed.ok) return;

    expect(collapsed.graph.nodes.map((n) => n.id)).toContain("n-sg-colorize");
    expect(collapsed.graph.nodes.map((n) => n.id)).not.toContain("n-filter");
    expect(validateAndSortAiNodeGraph(collapsed.graph).ok).toBe(true);

    // 서브그래프의 노출 파라미터를 수정한 뒤 펼치면 내부 노드 파라미터로 반영된다.
    const edited = updateNodeParam(collapsed.graph, "n-sg-colorize", "n-gen.strength", 0.85);
    const expanded = expandSubgraph(edited, "n-sg-colorize");
    expect(expanded.ok).toBe(true);
    if (!expanded.ok) return;

    const genNode = expanded.graph.nodes.find((n) => n.id === "n-gen");
    expect(genNode?.params.strength).toBe(0.85);
    expect(validateAndSortAiNodeGraph(expanded.graph).ok).toBe(true);
  });

  it("외부 노드를 거쳐 돌아오는 비볼록 서브그래프 선택을 거부한다", () => {
    const graph = buildBasePipeline();
    // n-in -> n-filter -> n-gen 에서 n-in과 n-gen만 묶으면 n-filter와 순환 발생
    const bad = encapsulateSubgraph(graph, ["n-in", "n-gen"], {
      subgraphId: "sg-bad",
      nodeId: "n-sg-bad",
      name: "잘못된 묶음",
    });
    expect(bad.ok).toBe(false);
  });

  it("노드 파라미터 변경 시 하위 노드만 증분 무효화하고 상위 노드는 캐시 적중한다", () => {
    const graph = buildBasePipeline();
    const firstRun = executeAiNodeGraphDryRun(graph);
    expect(firstRun.ok).toBe(true);
    expect(firstRun.cacheHits).toBe(0);
    expect(firstRun.executedCount).toBe(5);
    expect(firstRun.draftOutputs[0]?.insertMode).toBe("new-draft-layer");
    expect(firstRun.draftOutputs[0]?.overwritesOriginal).toBe(false);

    // n-gen의 강도만 수정하면 n-in, n-filter는 캐시 적중하고 n-gen/n-rights/n-out만 재실행된다.
    const modified = updateNodeParam(graph, "n-gen", "strength", 0.72);
    const secondRun = executeAiNodeGraphDryRun(modified, firstRun.nextCacheHashes);
    expect(secondRun.ok).toBe(true);
    expect(secondRun.cacheHits).toBe(2);
    expect(secondRun.executedCount).toBe(3);
  });

  it("Rights BOM 게이트가 opt-out 및 상업 출고 시 NC 에셋을 차단하고 앱 모드 9개 예산을 지킨다", () => {
    let graph = buildBasePipeline();
    // 컨트롤 12개를 노출해 9개 예산 초과 시 advancedControls로 접히는지 검증한다.
    const extraControls = Array.from({ length: 10 }, (_, idx) => ({
      key: `extra_${idx}`,
      label: `보조 옵션 ${idx + 1}`,
      controlType: "slider" as const,
      min: 0,
      max: 1,
      exposedInAppMode: true,
      priority: 10 + idx,
    }));
    const extraParams: Record<string, number> = {};
    extraControls.forEach((c) => {
      extraParams[c.key] = 0.5;
    });
    graph = addGraphNode(graph, {
      id: "n-extra-nc",
      kind: "canvas-layer-in",
      label: "비상업 참조 소스",
      inputs: [],
      outputs: [{ id: "pal", label: "팔레트", dataType: "palette" }],
      params: extraParams,
      controlMeta: extraControls,
      provenance: "non-commercial",
    });

    const rights = evaluateGraphRightsGate(graph);
    expect(rights.passed).toBe(false);
    expect(rights.blockedNodes[0]?.provenance).toBe("non-commercial");

    const projection = projectGraphToAppMode(graph);
    expect(projection.primaryControls.length).toBe(APP_MODE_PRIMARY_BUDGET_LIMIT);
    expect(projection.advancedControls.length).toBe(4);
    expect(projection.canRun).toBe(false);
    expect(projection.blockingReasonKo).toContain("비상업");

    const dryRun = executeAiNodeGraphDryRun(graph);
    expect(dryRun.ok).toBe(false);
    expect(dryRun.draftOutputs).toHaveLength(0);
  });
});
