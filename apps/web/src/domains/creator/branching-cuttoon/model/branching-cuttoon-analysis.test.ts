import { describe, expect, it } from "vitest";

import { choice, deepFreeze, diamondChain, graphOf, loopGraph, node, validGraph } from "./__tests__/graph-fixtures";
import {
  BRANCHING_PATH_LIMITS,
  distancesFromStart,
  enumerateEndingPaths,
  findBackEdges,
  indexBranchingGraph,
  nodesThatReachEnding,
} from "./branching-cuttoon-analysis";

describe("그래프 색인", () => {
  it("같은 식별자가 여럿이면 처음 장면이 주인이다", () => {
    const index = indexBranchingGraph(graphOf([node("start", "start"), node("a", "scene"), node("a", "scene")]));
    expect(index.nodeIndexById.get("a")).toBe(1);
    expect(index.startIndex).toBe(0);
  });

  it("시작 식별자가 없는 장면을 가리키면 startIndex 는 null 이다", () => {
    expect(indexBranchingGraph(graphOf([node("a", "scene")], { start: "zzz" })).startIndex).toBeNull();
  });

  it("도착 장면이 없는 선택지는 간선으로 세지 않는다", () => {
    const index = indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "가", "a"), choice("c2", "나", "없음"), choice("c3", "다", "")]),
      node("a", "ending"),
    ]));
    expect(index.outEdges[0]).toEqual([{ from: 0, choiceIndex: 0, to: 1 }]);
  });

  it("결말 장면의 선택지는 간선으로 세지 않는다", () => {
    const index = indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "가", "end")]),
      node("end", "ending", [choice("c1", "나", "start")]),
    ]));
    expect(index.outEdges[1]).toEqual([]);
  });

  it("입력 그래프를 바꾸지 않는다", () => {
    const frozen = deepFreeze(validGraph());
    expect(() => indexBranchingGraph(frozen)).not.toThrow();
  });
});

describe("시작에서의 거리", () => {
  it("선택 횟수로 센다", () => {
    const index = indexBranchingGraph(validGraph());
    expect(distancesFromStart(index)).toEqual([0, 1, 1, 2, 2]);
  });

  it("닿을 수 없는 장면은 -1 이다", () => {
    const index = indexBranchingGraph(graphOf([node("start", "start"), node("island", "scene")]));
    expect(distancesFromStart(index)).toEqual([0, -1]);
  });

  it("시작이 없으면 모두 -1 이다", () => {
    const index = indexBranchingGraph(graphOf([node("a", "scene")], { start: "" }));
    expect(distancesFromStart(index)).toEqual([-1]);
  });

  it("여러 길이 있으면 가장 짧은 거리를 쓴다", () => {
    const index = indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "멀리", "a"), choice("c2", "바로", "end")]),
      node("a", "scene", [choice("c1", "끝", "end")]),
      node("end", "ending"),
    ]));
    expect(distancesFromStart(index)[2]).toBe(1);
  });
});

describe("결말 도달 가능성", () => {
  it("모든 장면이 결말로 이어지는 그래프", () => {
    expect(nodesThatReachEnding(indexBranchingGraph(validGraph()))).toEqual([true, true, true, true, true]);
  });

  it("출구 없는 순환은 결말에 닿지 못한다", () => {
    const index = indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "가", "a")]),
      node("a", "scene", [choice("c1", "나", "b")]),
      node("b", "scene", [choice("c1", "다", "a")]),
      node("end", "ending"),
    ]));
    expect(nodesThatReachEnding(index)).toEqual([false, false, false, true]);
  });

  it("출구가 있는 순환은 결말에 닿는다", () => {
    expect(nodesThatReachEnding(indexBranchingGraph(loopGraph()))).toEqual([true, true, true]);
  });

  it("막다른 장면은 결말에 닿지 못한다", () => {
    const index = indexBranchingGraph(graphOf([node("start", "start", [choice("c1", "가", "a")]), node("a", "scene")]));
    expect(nodesThatReachEnding(index)).toEqual([false, false]);
  });
});

describe("되돌아가는 길", () => {
  it("순환이 없으면 없다", () => {
    expect(findBackEdges(indexBranchingGraph(validGraph()))).toEqual([]);
  });

  it("앞선 장면으로 가는 선택지 하나를 찾는다", () => {
    const edges = findBackEdges(indexBranchingGraph(loopGraph()));
    expect(edges).toEqual([{ from: 1, choiceIndex: 0, to: 0 }]);
  });

  it("자기 자신으로 가는 선택지도 되돌아가는 길이다", () => {
    const edges = findBackEdges(indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "다시", "start"), choice("c2", "끝", "end")]),
      node("end", "ending"),
    ])));
    expect(edges).toEqual([{ from: 0, choiceIndex: 0, to: 0 }]);
  });

  it("마름모(두 길이 다시 만남)는 되돌아가는 길이 아니다", () => {
    expect(findBackEdges(indexBranchingGraph(diamondChain(3)))).toEqual([]);
  });

  it("서로 다른 순환 둘을 모두 찾는다", () => {
    const edges = findBackEdges(indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "가", "a"), choice("c2", "나", "b")]),
      node("a", "scene", [choice("c1", "돌아", "start")]),
      node("b", "scene", [choice("c1", "돌아", "start"), choice("c2", "끝", "end")]),
      node("end", "ending"),
    ])));
    expect(edges.map((edge) => [edge.from, edge.to])).toEqual([[1, 0], [2, 0]]);
  });

  it("시작에서 닿지 못하는 순환은 찾지 않는다", () => {
    const edges = findBackEdges(indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "끝", "end")]),
      node("end", "ending"),
      node("x", "scene", [choice("c1", "y", "y")]),
      node("y", "scene", [choice("c1", "x", "x")]),
    ])));
    expect(edges).toEqual([]);
  });

  it("같은 입력이면 같은 간선을 같은 순서로 낸다", () => {
    const graph = loopGraph();
    expect(findBackEdges(indexBranchingGraph(graph))).toEqual(findBackEdges(indexBranchingGraph(graph)));
  });

  it("깊은 직선 그래프에서도 재귀 한도에 걸리지 않는다", () => {
    const depth = 5000;
    const nodes = Array.from({ length: depth }, (_unused, position) => (
      position === depth - 1
        ? node(`n${position}`, "ending")
        : node(`n${position}`, position === 0 ? "start" : "scene", [choice("c", "다음", `n${position + 1}`)])
    ));
    expect(findBackEdges(indexBranchingGraph(graphOf(nodes)))).toEqual([]);
  });
});

describe("결말까지 가는 길 열거", () => {
  it("선언 순서대로 열거한다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(validGraph()));
    expect(result).toEqual({
      paths: [["start", "a", "endA"], ["start", "b", "endB"]],
      complete: true,
      stoppedBy: null,
    });
  });

  it("순환이 있어도 같은 장면을 두 번 지나지 않는다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(loopGraph()));
    expect(result.paths).toEqual([["start", "a", "end"]]);
    expect(result.complete).toBe(true);
  });

  it("시작 장면이 결말이면 길이 하나다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(graphOf([node("only", "ending")], { start: "only" })));
    expect(result.paths).toEqual([["only"]]);
  });

  it("시작이 없으면 길이 없다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(graphOf([node("a", "scene")], { start: "" })));
    expect(result).toEqual({ paths: [], complete: true, stoppedBy: null });
  });

  it("결말에 닿지 못하는 가지는 길로 세지 않는다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(graphOf([
      node("start", "start", [choice("c1", "막다른", "dead"), choice("c2", "끝", "end")]),
      node("dead", "scene"),
      node("end", "ending"),
    ])));
    expect(result.paths).toEqual([["start", "end"]]);
  });

  it("길 수 상한: 정확히 상한만큼이면 완전하다", () => {
    const limits = { maxPaths: 2, maxDepth: 10, maxSteps: 1000 };
    expect(enumerateEndingPaths(indexBranchingGraph(validGraph()), limits).complete).toBe(true);
  });

  it("길 수 상한: 상한을 넘으면 앞부분만 주고 paths 로 멈춘다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(diamondChain(4)), { maxPaths: 5, maxDepth: 64, maxSteps: 100_000 });
    expect(result.paths).toHaveLength(5);
    expect(result.complete).toBe(false);
    expect(result.stoppedBy).toBe("paths");
  });

  it("간선 수 상한: 작업량을 고정한다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(diamondChain(18)), { maxPaths: 1_000_000, maxDepth: 200, maxSteps: 500 });
    expect(result.complete).toBe(false);
    expect(result.stoppedBy).toBe("steps");
  });

  it("깊이 상한: 너무 긴 길은 자르고 불완전으로 알린다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(diamondChain(5)), { maxPaths: 100, maxDepth: 4, maxSteps: 100_000 });
    expect(result.paths).toEqual([]);
    expect(result.complete).toBe(false);
    expect(result.stoppedBy).toBe("depth");
  });

  it("2^40 가지 길을 가진 그래프도 기본 상한 안에서 끝난다", () => {
    const result = enumerateEndingPaths(indexBranchingGraph(diamondChain(40)));
    expect(result.complete).toBe(false);
    expect(result.paths.length).toBeLessThanOrEqual(BRANCHING_PATH_LIMITS.maxPaths);
  });

  it("같은 입력이면 같은 길을 같은 순서로 낸다", () => {
    const index = indexBranchingGraph(diamondChain(6));
    expect(enumerateEndingPaths(index)).toEqual(enumerateEndingPaths(index));
  });

  it("기본 상한 값", () => {
    expect(BRANCHING_PATH_LIMITS).toEqual({ maxPaths: 200, maxDepth: 64, maxSteps: 20_000 });
  });
});
