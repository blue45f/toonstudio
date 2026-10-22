import { describe, expect, it } from "vitest";

import { choice, cut, graphOf, loopGraph, node, validGraph } from "./__tests__/graph-fixtures";
import {
  canStepBack,
  chooseBranch,
  readerScene,
  restoreReaderState,
  startReading,
  stepBack,
  toProgressRecord,
  type BranchingReaderState,
} from "./branching-cuttoon-reader";
import { BRANCHING_TRAIL_LIMIT } from "./branching-cuttoon-types";

function mustStart(graph = validGraph()): BranchingReaderState {
  const state = startReading(graph);
  if (!state) throw new Error("시작 상태가 없다");
  return state;
}

function mustChoose(graph: ReturnType<typeof validGraph>, state: BranchingReaderState, choiceId: string): BranchingReaderState {
  const next = chooseBranch(graph, state, choiceId);
  if (!next) throw new Error(`선택지 ${choiceId} 를 누를 수 없다`);
  return next;
}

describe("읽기 시작", () => {
  it("시작 장면에서 시작하고 이력은 시작 장면 하나다", () => {
    expect(mustStart()).toEqual({ nodeId: "start", visited: ["start"], trail: [] });
  });

  it("시작 장면을 찾을 수 없으면 null 이다", () => {
    expect(startReading({ ...validGraph(), startNodeId: "없음" })).toBeNull();
    expect(startReading(graphOf([], { start: "" }))).toBeNull();
  });
});

describe("선택지 누르기", () => {
  const graph = validGraph();

  it("도착 장면으로 가고 지나온 선택과 방문 이력을 쌓는다", () => {
    const next = mustChoose(graph, mustStart(), "c1");
    expect(next).toEqual({ nodeId: "a", visited: ["start", "a"], trail: [{ nodeId: "start", choiceId: "c1" }] });
  });

  it("끝까지 가면 결말에 닿는다", () => {
    const end = mustChoose(graph, mustChoose(graph, mustStart(), "c2"), "c1");
    expect(end.nodeId).toBe("endB");
    expect(end.trail.map((step) => step.nodeId)).toEqual(["start", "b"]);
  });

  it("없는 선택지는 null 이고 상태를 바꾸지 않는다", () => {
    const state = mustStart();
    expect(chooseBranch(graph, state, "없음")).toBeNull();
    expect(state).toEqual({ nodeId: "start", visited: ["start"], trail: [] });
  });

  it("결말에서는 누를 수 없다", () => {
    const end = mustChoose(graph, mustChoose(graph, mustStart(), "c1"), "c1");
    expect(chooseBranch(graph, end, "c1")).toBeNull();
  });

  it("도착 장면이 없는 선택지는 null 이다", () => {
    const broken = graphOf([node("start", "start", [choice("c1", "가", "없음")])]);
    expect(chooseBranch(broken, mustStart(broken), "c1")).toBeNull();
  });

  it("현재 장면이 그래프에 없으면 null 이다", () => {
    expect(chooseBranch(graph, { nodeId: "없음", visited: [], trail: [] }, "c1")).toBeNull();
  });

  it("입력 상태를 바꾸지 않는다", () => {
    const state = Object.freeze(mustStart());
    expect(() => chooseBranch(graph, state, "c1")).not.toThrow();
  });

  it("같은 장면을 다시 가도 방문 이력에는 한 번만 남고 지나온 길은 늘어난다", () => {
    const loop = loopGraph();
    let state = mustStart(loop);
    state = mustChoose(loop, state, "c1");
    state = mustChoose(loop, state, "c1");
    state = mustChoose(loop, state, "c1");
    expect(state.visited).toEqual(["start", "a"]);
    expect(state.trail).toHaveLength(3);
    expect(state.nodeId).toBe("a");
  });

  it("지나온 길은 상한(400)을 넘으면 오래된 쪽부터 버린다", () => {
    const loop = loopGraph();
    let state = mustStart(loop);
    for (let turn = 0; turn < BRANCHING_TRAIL_LIMIT + 50; turn += 1) {
      state = mustChoose(loop, state, "c1");
    }
    expect(state.trail).toHaveLength(BRANCHING_TRAIL_LIMIT);
    expect(state.visited).toHaveLength(2);
  });
});

describe("한 걸음 되돌아가기", () => {
  const graph = validGraph();

  it("직전 선택을 되돌려 이전 장면으로 간다", () => {
    const moved = mustChoose(graph, mustStart(), "c1");
    expect(stepBack(moved)).toEqual({ nodeId: "start", visited: ["start", "a"], trail: [] });
  });

  it("방문 이력은 되돌아가도 지우지 않는다", () => {
    const back = stepBack(mustChoose(graph, mustStart(), "c1"));
    expect(back?.visited).toEqual(["start", "a"]);
  });

  it("되돌릴 선택이 없으면 null 이다", () => {
    expect(stepBack(mustStart())).toBeNull();
    expect(canStepBack(mustStart())).toBe(false);
  });

  it("되돌린 뒤 다른 선택을 하면 다른 길로 간다", () => {
    const back = stepBack(mustChoose(graph, mustStart(), "c1"));
    const other = back && chooseBranch(graph, back, "c2");
    expect(other?.nodeId).toBe("b");
    expect(other?.trail).toEqual([{ nodeId: "start", choiceId: "c2" }]);
  });

  it("끝까지 갔다가 모두 되돌릴 수 있다", () => {
    let state = mustChoose(graph, mustChoose(graph, mustStart(), "c1"), "c1");
    expect(canStepBack(state)).toBe(true);
    for (let turn = 0; turn < 2; turn += 1) {
      const back = stepBack(state);
      if (!back) throw new Error("되돌릴 수 있어야 한다");
      state = back;
    }
    expect(state.nodeId).toBe("start");
    expect(canStepBack(state)).toBe(false);
  });

  it("입력 상태를 바꾸지 않는다", () => {
    const moved = Object.freeze(mustChoose(graph, mustStart(), "c1"));
    expect(() => stepBack(moved)).not.toThrow();
    expect(moved.trail).toHaveLength(1);
  });
});

describe("장면 한 개 그리기", () => {
  it("컷은 컷 표의 글로 풀고 선택지를 그대로 준다", () => {
    const graph = validGraph();
    const scene = readerScene(graph, mustStart(graph));
    expect(scene?.isEnding).toBe(false);
    expect(scene?.cuts).toEqual([{ id: "k1", caption: "컷 k1" }, { id: "k2", caption: "컷 k2" }]);
    expect(scene?.choices.map((item) => item.id)).toEqual(["c1", "c2"]);
  });

  it("결말 장면은 선택지를 보이지 않는다", () => {
    const graph = graphOf(
      [node("start", "start", [choice("c1", "가", "end")]), node("end", "ending", [choice("c9", "숨음", "start")], ["k1"])],
      { cuts: [cut("k1", "끝났다")] },
    );
    const end = mustChoose(graph, mustStart(graph), "c1");
    const scene = readerScene(graph, end);
    expect(scene?.isEnding).toBe(true);
    expect(scene?.choices).toEqual([]);
  });

  it("컷 표에 없는 참조는 caption 이 null 이다", () => {
    const graph = graphOf([node("start", "start", [], ["없음"])]);
    expect(readerScene(graph, mustStart(graph))?.cuts).toEqual([{ id: "없음", caption: null }]);
  });

  it("현재 장면이 없으면 null 이다", () => {
    expect(readerScene(validGraph(), { nodeId: "없음", visited: [], trail: [] })).toBeNull();
  });
});

describe("진행 기록 저장과 복원", () => {
  const graph = validGraph();
  const walked = mustChoose(graph, mustStart(graph), "c2");

  it("기록은 JSON 을 거쳐도 같은 상태로 복원된다", () => {
    const record: unknown = JSON.parse(JSON.stringify(toProgressRecord(graph, walked)));
    expect(restoreReaderState(graph, record)).toEqual(walked);
  });

  it("기록에는 그래프 판 지문이 들어 있다", () => {
    expect(toProgressRecord(graph, walked).graphVersion).toMatch(/^bt1-/u);
  });

  it("처음 상태도 복원된다", () => {
    const initial = mustStart(graph);
    expect(restoreReaderState(graph, toProgressRecord(graph, initial))).toEqual(initial);
  });

  it("글(제목·라벨·캡션)만 고친 그래프에서는 읽던 위치가 유지된다", () => {
    const record = toProgressRecord(graph, walked);
    const edited = {
      ...graph,
      title: "다른 제목",
      cuts: graph.cuts.map((candidate) => ({ ...candidate, caption: `${candidate.caption} (수정)` })),
      nodes: graph.nodes.map((candidate) => ({ ...candidate, title: `${candidate.title}!`, choices: candidate.choices.map((item) => ({ ...item, label: `${item.label}?` })) })),
    };
    expect(restoreReaderState(edited, record)).toEqual(walked);
  });

  it("선택지의 연결이 바뀌면 처음부터다", () => {
    const record = toProgressRecord(graph, walked);
    const rewired = { ...graph, nodes: graph.nodes.map((candidate) => (candidate.id === "b" ? { ...candidate, choices: [choice("c1", "끝으로", "endA")] } : candidate)) };
    expect(restoreReaderState(rewired, record)).toBeNull();
  });

  it("장면이 사라지면 처음부터다", () => {
    const record = toProgressRecord(graph, walked);
    const smaller = { ...graph, nodes: graph.nodes.filter((candidate) => candidate.id !== "endA") };
    expect(restoreReaderState(smaller, record)).toBeNull();
  });

  it("장면 종류가 바뀌면 처음부터다", () => {
    const record = toProgressRecord(graph, walked);
    const changed = { ...graph, nodes: graph.nodes.map((candidate) => (candidate.id === "b" ? { ...candidate, kind: "ending" as const } : candidate)) };
    expect(restoreReaderState(changed, record)).toBeNull();
  });

  it.each([
    ["null", null],
    ["문자열", "x"],
    ["배열", []],
    ["빈 객체", {}],
  ])("기록이 %s 이면 null 이다", (_name, record) => {
    expect(restoreReaderState(graph, record)).toBeNull();
  });

  it("기록 판 번호가 다르면 null 이다", () => {
    expect({ ...toProgressRecord(graph, walked), v: 2 }).not.toEqual(toProgressRecord(graph, walked));
    expect(restoreReaderState(graph, { ...toProgressRecord(graph, walked), v: 2 })).toBeNull();
  });

  it.each([
    ["현재 장면이 없다", { nodeId: "없음" }],
    ["현재 장면이 문자열이 아니다", { nodeId: 3 }],
    ["방문 이력에 없는 장면이 있다", { visited: ["start", "b", "사라진"] }],
    ["방문 이력이 겹친다", { visited: ["start", "b", "b"] }],
    ["방문 이력이 배열이 아니다", { visited: "start,b" }],
    ["현재 장면이 방문 이력에 없다", { visited: ["start"] }],
    ["지나온 선택이 없는 선택지다", { trail: [{ nodeId: "start", choiceId: "c9" }] }],
    ["지나온 선택이 다음 장면으로 이어지지 않는다", { trail: [{ nodeId: "start", choiceId: "c1" }] }],
    ["지나온 선택의 모양이 틀리다", { trail: [{ nodeId: "start" }] }],
    ["지나온 선택이 결말에서 시작한다", { trail: [{ nodeId: "endA", choiceId: "c1" }] }],
    ["지나온 선택이 없는 장면에서 시작한다", { trail: [{ nodeId: "없음", choiceId: "c1" }] }],
  ])("%s", (_name, patch) => {
    const record = { ...toProgressRecord(graph, walked), ...patch };
    expect(restoreReaderState(graph, record)).toBeNull();
  });

  it("지나온 길이 상한(400)보다 길면 null 이다", () => {
    const trail = Array.from({ length: BRANCHING_TRAIL_LIMIT + 1 }, () => ({ nodeId: "start", choiceId: "c2" }));
    expect(restoreReaderState(graph, { ...toProgressRecord(graph, walked), trail })).toBeNull();
  });

  it("지나온 길이 잘린 기록도 이어지면 복원된다", () => {
    const loop = loopGraph();
    let state = mustStart(loop);
    for (let turn = 0; turn < BRANCHING_TRAIL_LIMIT + 10; turn += 1) state = mustChoose(loop, state, "c1");
    const restored = restoreReaderState(loop, JSON.parse(JSON.stringify(toProgressRecord(loop, state))));
    expect(restored).toEqual(state);
  });
});
