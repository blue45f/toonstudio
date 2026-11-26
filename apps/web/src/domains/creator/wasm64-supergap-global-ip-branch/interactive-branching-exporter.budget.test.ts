import { describe, expect, it } from "vitest";
import {
  InteractiveBranchingWebtoonExporter,
  simulateBranchingPlaythrough,
  type BranchingEpisodeGraph,
} from "./interactive-branching-exporter";

function linearGraph(nodeCount: number): BranchingEpisodeGraph {
  return {
    episodeId: "long-episode",
    title: "긴 원고",
    author: "테스트 작가",
    version: "1.0.0",
    startNodeId: "cut-0",
    nodes: Array.from({ length: nodeCount }, (_, index) => ({
      id: `cut-${index}`,
      title: `${index + 1}컷`,
      kind: index === nodeCount - 1 ? "ending" : "cut",
      imageAssetPath: `./cut-${index}.webp`,
      ...(index === nodeCount - 1 ? { endingCode: "END" } : { nextNodeId: `cut-${index + 1}` }),
    })),
  };
}

describe("분기 원고 탐색 예산과 도달 가능성", () => {
  it("기본 설정에서 유효한 66컷 원고를 끝까지 검증하고 실행 가능한 번들로 내보낸다", () => {
    const result = new InteractiveBranchingWebtoonExporter().exportStaticBundle(linearGraph(66));

    expect(result.ok).toBe(true);
    expect(result.validation).toMatchObject({
      explorationComplete: true,
      exploredStateCount: 66,
      maxDepth: 65,
      reachableEndingIds: ["cut-65"],
      unreachableEndingIds: [],
      issues: [],
    });
    expect(result.standaloneHtml).toContain("<!doctype html>");
    expect(simulateBranchingPlaythrough(result.manifest, [])).toMatchObject({
      ok: true,
      reachedEnding: true,
      finalNodeId: "cut-65",
      endingCode: "END",
    });
  });

  it("명시한 깊이 한도에 도달하면 미검증 오류로 차단하고 도달 불가 엔딩으로 오진하지 않는다", () => {
    const result = new InteractiveBranchingWebtoonExporter({ maxExplorationDepth: 64 })
      .exportStaticBundle(linearGraph(66));

    expect(result.ok).toBe(false);
    expect(result.standaloneHtml).toBe("");
    expect(result.validation).toMatchObject({
      explorationComplete: false,
      exploredStateCount: 65,
      maxDepth: 64,
      unreachableEndingIds: [],
    });
    expect(result.validation.issues).toEqual([
      expect.objectContaining({ code: "EXPLORATION_LIMIT_EXCEEDED", severity: "error" }),
    ]);
  });

  it("상태 예산을 넘으면 검사를 중단하고 남은 노드를 도달 불가로 분류하지 않는다", () => {
    const result = new InteractiveBranchingWebtoonExporter({ maxExploredStates: 2 })
      .exportStaticBundle(linearGraph(4));

    expect(result.ok).toBe(false);
    expect(result.standaloneHtml).toBe("");
    expect(result.validation).toMatchObject({
      explorationComplete: false,
      exploredStateCount: 2,
      unreachableNodeIds: [],
      unreachableEndingIds: [],
    });
    expect(result.validation.issues).toEqual([
      expect.objectContaining({ code: "EXPLORATION_LIMIT_EXCEEDED", severity: "error" }),
    ]);
  });

  it("필요한 상태 수와 깊이가 한도에 정확히 맞으면 검증을 완료한다", () => {
    const result = new InteractiveBranchingWebtoonExporter({
      maxExploredStates: 66,
      maxExplorationDepth: 65,
    }).exportStaticBundle(linearGraph(66));

    expect(result.ok).toBe(true);
    expect(result.validation.explorationComplete).toBe(true);
    expect(result.validation.issues).toEqual([]);
  });

  it("완전 탐색 후 실제로 연결되지 않은 엔딩은 계속 오류로 차단한다", () => {
    const graph = linearGraph(2);
    const result = new InteractiveBranchingWebtoonExporter().exportStaticBundle({
      ...graph,
      nodes: [...graph.nodes, {
        id: "disconnected-ending",
        title: "연결되지 않은 엔딩",
        kind: "ending",
        endingCode: "UNREACHABLE",
        imageAssetPath: "./disconnected.webp",
      }],
    });

    expect(result.ok).toBe(false);
    expect(result.standaloneHtml).toBe("");
    expect(result.validation.explorationComplete).toBe(true);
    expect(result.validation.unreachableEndingIds).toEqual(["disconnected-ending"]);
    expect(result.validation.issues).toContainEqual(expect.objectContaining({
      code: "UNREACHABLE_ENDING",
      severity: "error",
      nodeId: "disconnected-ending",
    }));
  });

  it("탐색 한도 밖의 끊어진 참조도 정적 그래프 검사에서 계속 거절한다", () => {
    const graph = linearGraph(66);
    const result = new InteractiveBranchingWebtoonExporter({ maxExplorationDepth: 2 })
      .exportStaticBundle({
        ...graph,
        nodes: graph.nodes.map((node) => node.id === "cut-64" ? { ...node, nextNodeId: "missing" } : node),
      });

    expect(result.ok).toBe(false);
    expect(result.standaloneHtml).toBe("");
    expect(result.validation.explorationComplete).toBe(false);
    expect(result.validation.issues).toContainEqual(expect.objectContaining({
      code: "BROKEN_TARGET_REF",
      severity: "error",
      nodeId: "cut-64",
    }));
    expect(result.validation.issues).toContainEqual(expect.objectContaining({
      code: "EXPLORATION_LIMIT_EXCEEDED",
      severity: "error",
    }));
  });
});
