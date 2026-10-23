import { describe, expect, it } from "vitest";

import { cut, deepFreeze, graphOf, node, validGraph } from "./__tests__/graph-fixtures";
import {
  addChoice,
  addCut,
  addNode,
  createBranchingGraph,
  moveChoice,
  moveCutRef,
  removeChoice,
  removeCutRef,
  removeNode,
  setGraphTitle,
  setStartNode,
  updateChoice,
  updateCutCaption,
  updateNode,
  type BranchingEditResult,
} from "./branching-cuttoon-edit";
import { BRANCHING_CUTTOON_LIMITS, type BranchingCuttoonGraph } from "./branching-cuttoon-types";
import { validateBranchingCuttoon } from "./branching-cuttoon-validate";

type OkResult<T extends object> = { readonly ok: true; readonly graph: BranchingCuttoonGraph } & T;

/** 거절되지 않았음을 확인하고 성공 결과(그래프와 덧붙은 값)를 돌려준다. */
function ok<T extends object>(result: BranchingEditResult<T>): OkResult<T> {
  if (!result.ok) throw new Error(`편집이 거절됐다: ${result.reason}`);
  return result;
}

/** 성공한 편집의 그래프. */
function g<T extends object>(result: BranchingEditResult<T>): BranchingCuttoonGraph {
  return ok(result).graph;
}

const fresh = () => createBranchingGraph({ title: "t", startTitle: "s" });

describe("새 그래프", () => {
  it("시작 장면 하나만 가진다", () => {
    expect(createBranchingGraph({ title: "새 이야기", startTitle: "시작" })).toEqual({
      title: "새 이야기",
      startNodeId: "start",
      cuts: [],
      nodes: [{ id: "start", kind: "start", title: "시작", cutIds: [], choices: [] }],
    });
  });

  it("아직 읽을 수 없다는 것을 검증기가 알린다(결말과 갈 곳이 없다)", () => {
    const report = validateBranchingCuttoon(fresh());
    expect(report.valid).toBe(false);
    expect(report.issues.map((issue) => issue.code)).toEqual(["ending-missing", "dead-end"]);
  });

  it("작품 제목을 바꾼다", () => {
    expect(setGraphTitle(validGraph(), "새 제목").title).toBe("새 제목");
  });
});

describe("장면 더하기", () => {
  it("n1, n2 순서로 식별자를 만든다", () => {
    const first = ok(addNode(fresh(), "scene", "첫 장면"));
    const second = ok(addNode(first.graph, "ending", "결말"));
    expect(first.nodeId).toBe("n1");
    expect(second.nodeId).toBe("n2");
    expect(second.graph.nodes.map((candidate) => candidate.kind)).toEqual(["start", "scene", "ending"]);
  });

  it("비어 있는 번호를 먼저 채운다", () => {
    const graph = graphOf([node("start", "start"), node("n2", "scene")]);
    expect(ok(addNode(graph, "scene", "x")).nodeId).toBe("n1");
  });

  it("장면 한도(200)에서는 거절한다", () => {
    const full = graphOf(Array.from({ length: BRANCHING_CUTTOON_LIMITS.nodes }, (_unused, position) => (
      node(position === 0 ? "start" : `n${position}`, position === 0 ? "start" : "scene")
    )));
    expect(addNode(full, "scene", "x")).toEqual({ ok: false, reason: "node-limit" });
  });

  it("입력 그래프를 바꾸지 않는다", () => {
    const frozen = deepFreeze(validGraph());
    expect(() => addNode(frozen, "scene", "x")).not.toThrow();
    expect(frozen.nodes).toHaveLength(5);
  });
});

describe("장면 고치기", () => {
  it("제목을 바꾼다", () => {
    expect(g(updateNode(validGraph(), "a", { title: "새 제목" })).nodes[1]?.title).toBe("새 제목");
  });

  it("scene 과 ending 을 오갈 수 있다", () => {
    const toEnding = g(updateNode(validGraph(), "a", { kind: "ending" }));
    expect(toEnding.nodes[1]?.kind).toBe("ending");
    expect(g(updateNode(toEnding, "a", { kind: "scene" })).nodes[1]?.kind).toBe("scene");
  });

  it("시작 장면의 종류는 바꿀 수 없다", () => {
    expect(updateNode(validGraph(), "start", { kind: "scene" })).toEqual({ ok: false, reason: "start-protected" });
  });

  it("시작 장면의 제목은 바꿀 수 있다", () => {
    expect(g(updateNode(validGraph(), "start", { title: "새 시작" })).nodes[0]?.title).toBe("새 시작");
  });

  it("없는 장면이면 거절한다", () => {
    expect(updateNode(validGraph(), "없음", { title: "x" })).toEqual({ ok: false, reason: "node-not-found" });
  });
});

describe("시작 장면 지정", () => {
  it("새 시작 장면이 start 가 되고 이전 시작 장면은 scene 이 된다", () => {
    const graph = g(setStartNode(validGraph(), "a"));
    expect(graph.startNodeId).toBe("a");
    expect(graph.nodes.filter((candidate) => candidate.kind === "start").map((candidate) => candidate.id)).toEqual(["a"]);
    expect(graph.nodes[0]?.kind).toBe("scene");
  });

  it("결말을 시작 장면으로 지정하면 start 로 바뀐다", () => {
    expect(g(setStartNode(validGraph(), "endA")).nodes[3]?.kind).toBe("start");
  });

  it("같은 장면을 다시 지정해도 그대로다", () => {
    expect(g(setStartNode(validGraph(), "start"))).toEqual(validGraph());
  });

  it("없는 장면이면 거절한다", () => {
    expect(setStartNode(validGraph(), "없음")).toEqual({ ok: false, reason: "node-not-found" });
  });
});

describe("장면 지우기", () => {
  it("그 장면으로 오던 선택지도 함께 지운다", () => {
    const result = ok(removeNode(validGraph(), "a"));
    expect(result.graph.nodes.map((candidate) => candidate.id)).toEqual(["start", "b", "endA", "endB"]);
    expect(result.graph.nodes[0]?.choices.map((item) => item.id)).toEqual(["c2"]);
    expect(result.removedChoiceCount).toBe(1);
  });

  it("쓰이지 않게 된 컷은 컷 표에서도 지운다", () => {
    const graph = g(removeNode(validGraph(), "a"));
    expect(graph.cuts.map((item) => item.id)).not.toContain("k3");
    expect(graph.cuts.map((item) => item.id)).toContain("k4");
  });

  it("다른 장면이 쓰는 컷은 남긴다", () => {
    const base = validGraph();
    const shared = { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "b" ? { ...candidate, cutIds: ["k3"] } : candidate)) };
    expect(g(removeNode(shared, "a")).cuts.map((item) => item.id)).toContain("k3");
  });

  it("시작 장면은 지울 수 없다", () => {
    expect(removeNode(validGraph(), "start")).toEqual({ ok: false, reason: "start-protected" });
  });

  it("없는 장면이면 거절한다", () => {
    expect(removeNode(validGraph(), "없음")).toEqual({ ok: false, reason: "node-not-found" });
  });

  it("들어오는 선택지가 없던 장면을 지우면 지운 선택지 수는 0 이다", () => {
    const base = validGraph();
    const graph = { ...base, nodes: [...base.nodes, node("island", "scene")] };
    expect(ok(removeNode(graph, "island")).removedChoiceCount).toBe(0);
  });
});

describe("선택지", () => {
  it("c1, c2 순서로 식별자를 만들고 도착 장면은 비워 둔다", () => {
    const first = ok(addChoice(fresh(), "start", "선택"));
    const second = ok(addChoice(first.graph, "start", "또 다른 선택", "start"));
    expect(first.choiceId).toBe("c1");
    expect(second.choiceId).toBe("c2");
    expect(second.graph.nodes[0]?.choices).toEqual([
      { id: "c1", label: "선택", targetNodeId: "" },
      { id: "c2", label: "또 다른 선택", targetNodeId: "start" },
    ]);
  });

  it("장면마다 6개까지만 더한다", () => {
    let graph = fresh();
    for (let count = 0; count < BRANCHING_CUTTOON_LIMITS.choicesPerNode; count += 1) graph = g(addChoice(graph, "start", `선택 ${count}`));
    expect(addChoice(graph, "start", "일곱째")).toEqual({ ok: false, reason: "choice-limit" });
  });

  it("라벨과 도착 장면을 따로 고친다", () => {
    const labelled = g(updateChoice(validGraph(), "start", "c1", { label: "새 라벨" }));
    expect(labelled.nodes[0]?.choices[0]).toEqual({ id: "c1", label: "새 라벨", targetNodeId: "a" });
    const retargeted = g(updateChoice(labelled, "start", "c1", { targetNodeId: "b" }));
    expect(retargeted.nodes[0]?.choices[0]).toEqual({ id: "c1", label: "새 라벨", targetNodeId: "b" });
  });

  it("선택지를 지운다", () => {
    expect(g(removeChoice(validGraph(), "start", "c1")).nodes[0]?.choices.map((item) => item.id)).toEqual(["c2"]);
  });

  it("없는 장면·없는 선택지는 거절한다", () => {
    expect(addChoice(validGraph(), "없음", "x")).toEqual({ ok: false, reason: "node-not-found" });
    expect(updateChoice(validGraph(), "없음", "c1", {})).toEqual({ ok: false, reason: "node-not-found" });
    expect(updateChoice(validGraph(), "start", "c9", {})).toEqual({ ok: false, reason: "choice-not-found" });
    expect(removeChoice(validGraph(), "start", "c9")).toEqual({ ok: false, reason: "choice-not-found" });
    expect(removeChoice(validGraph(), "없음", "c1")).toEqual({ ok: false, reason: "node-not-found" });
  });

  it("선택지를 위아래로 옮긴다", () => {
    const down = g(moveChoice(validGraph(), "start", "c1", 1));
    expect(down.nodes[0]?.choices.map((item) => item.id)).toEqual(["c2", "c1"]);
    const up = g(moveChoice(down, "start", "c1", -1));
    expect(up.nodes[0]?.choices.map((item) => item.id)).toEqual(["c1", "c2"]);
  });

  it("끝에서 더 옮기면 아무 일도 하지 않는다", () => {
    expect(g(moveChoice(validGraph(), "start", "c1", -1))).toEqual(validGraph());
    expect(g(moveChoice(validGraph(), "start", "c2", 1))).toEqual(validGraph());
  });

  it("없는 선택지는 옮길 수 없다", () => {
    expect(moveChoice(validGraph(), "start", "c9", 1)).toEqual({ ok: false, reason: "choice-not-found" });
    expect(moveChoice(validGraph(), "없음", "c1", 1)).toEqual({ ok: false, reason: "node-not-found" });
  });

  it("입력 그래프를 바꾸지 않는다", () => {
    const frozen = deepFreeze(validGraph());
    expect(() => removeChoice(frozen, "start", "c1")).not.toThrow();
    expect(() => moveChoice(frozen, "start", "c1", 1)).not.toThrow();
    expect(() => updateChoice(frozen, "start", "c1", { label: "x" })).not.toThrow();
  });
});

describe("컷", () => {
  it("새 컷을 만들어 장면 끝에 붙인다", () => {
    const first = ok(addCut(fresh(), "start", "첫 컷"));
    const second = ok(addCut(first.graph, "start", "둘째 컷"));
    expect([first.cutId, second.cutId]).toEqual(["k1", "k2"]);
    expect(second.graph.nodes[0]?.cutIds).toEqual(["k1", "k2"]);
    expect(second.graph.cuts).toEqual([{ id: "k1", caption: "첫 컷" }, { id: "k2", caption: "둘째 컷" }]);
  });

  it("장면마다 30개까지만 더한다", () => {
    let graph = fresh();
    for (let count = 0; count < BRANCHING_CUTTOON_LIMITS.cutsPerNode; count += 1) graph = g(addCut(graph, "start", `컷 ${count}`));
    expect(addCut(graph, "start", "서른한째")).toEqual({ ok: false, reason: "cut-limit" });
  });

  it("컷 표는 1000개까지만 키운다", () => {
    const cuts = Array.from({ length: BRANCHING_CUTTOON_LIMITS.cuts }, (_unused, position) => cut(`k${position + 1}`));
    const graph = graphOf([node("start", "start")], { cuts });
    expect(addCut(graph, "start", "x")).toEqual({ ok: false, reason: "cut-table-limit" });
  });

  it("없는 장면에는 컷을 붙일 수 없다", () => {
    expect(addCut(validGraph(), "없음", "x")).toEqual({ ok: false, reason: "node-not-found" });
  });

  it("컷 글을 고친다", () => {
    expect(g(updateCutCaption(validGraph(), "k1", "고친 글")).cuts[0]).toEqual({ id: "k1", caption: "고친 글" });
    expect(updateCutCaption(validGraph(), "없음", "x")).toEqual({ ok: false, reason: "cut-not-found" });
  });

  it("컷 참조를 빼면 컷이 어디에도 쓰이지 않을 때 컷 표에서도 지운다", () => {
    const graph = g(removeCutRef(validGraph(), "start", 0));
    expect(graph.nodes[0]?.cutIds).toEqual(["k2"]);
    expect(graph.cuts.map((item) => item.id)).not.toContain("k1");
  });

  it("다른 장면도 쓰는 컷은 컷 표에 남긴다", () => {
    const base = validGraph();
    const shared = { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "a" ? { ...candidate, cutIds: ["k1"] } : candidate)) };
    expect(g(removeCutRef(shared, "start", 0)).cuts.map((item) => item.id)).toContain("k1");
  });

  it("범위를 벗어난 위치나 없는 장면은 거절한다", () => {
    expect(removeCutRef(validGraph(), "start", 5)).toEqual({ ok: false, reason: "cut-not-found" });
    expect(removeCutRef(validGraph(), "start", -1)).toEqual({ ok: false, reason: "cut-not-found" });
    expect(removeCutRef(validGraph(), "없음", 0)).toEqual({ ok: false, reason: "node-not-found" });
    expect(moveCutRef(validGraph(), "start", 9, 1)).toEqual({ ok: false, reason: "cut-not-found" });
    expect(moveCutRef(validGraph(), "없음", 0, 1)).toEqual({ ok: false, reason: "node-not-found" });
  });

  it("컷 참조를 위아래로 옮긴다", () => {
    expect(g(moveCutRef(validGraph(), "start", 0, 1)).nodes[0]?.cutIds).toEqual(["k2", "k1"]);
    expect(g(moveCutRef(validGraph(), "start", 1, -1)).nodes[0]?.cutIds).toEqual(["k2", "k1"]);
  });

  it("끝에서 더 옮기면 아무 일도 하지 않는다", () => {
    expect(g(moveCutRef(validGraph(), "start", 0, -1))).toEqual(validGraph());
    expect(g(moveCutRef(validGraph(), "start", 1, 1))).toEqual(validGraph());
  });
});

describe("편집한 결과의 검증", () => {
  it("결말과 길을 더해 가면 읽을 수 있는 그래프가 된다", () => {
    const withEnding = ok(addNode(fresh(), "ending", "결말"));
    const graph = g(addChoice(withEnding.graph, "start", "끝으로 간다", withEnding.nodeId));
    const report = validateBranchingCuttoon(graph);
    expect(report.issues).toEqual([]);
    expect(report.valid).toBe(true);
  });

  it("장면을 지워도 끊어진 선택지가 남지 않는다", () => {
    const graph = g(removeNode(validGraph(), "endA"));
    expect(validateBranchingCuttoon(graph).issues.map((issue) => issue.code)).not.toContain("choice-target-dangling");
  });
});
