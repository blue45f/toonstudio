import { describe, expect, it } from "vitest";

import { choice, cut, deepFreeze, diamondChain, graphOf, loopGraph, node, validGraph } from "./__tests__/graph-fixtures";
import {
  BRANCHING_CUTTOON_LIMITS,
  BRANCHING_ISSUE_CODES,
  BRANCHING_ISSUE_SEVERITY,
  type BranchingCuttoonGraph,
  type BranchingIssueCode,
  type BranchingNode,
} from "./branching-cuttoon-types";
import { isBranchingCuttoonPlayable, validateBranchingCuttoon } from "./branching-cuttoon-validate";

function codes(graph: BranchingCuttoonGraph): BranchingIssueCode[] {
  return validateBranchingCuttoon(graph).issues.map((issue) => issue.code);
}

function issuesOf(graph: BranchingCuttoonGraph, code: BranchingIssueCode) {
  return validateBranchingCuttoon(graph).issues.filter((issue) => issue.code === code);
}

/** 기준 그래프의 시작 장면 선택지만 바꾼 그래프. */
function withStartChoices(choices: BranchingNode["choices"]): BranchingCuttoonGraph {
  const base = validGraph();
  return { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "start" ? { ...candidate, choices } : candidate)) };
}

function withNode(replacement: BranchingNode): BranchingCuttoonGraph {
  const base = validGraph();
  return { ...base, nodes: base.nodes.map((candidate) => (candidate.id === replacement.id ? replacement : candidate)) };
}

describe("기준 그래프", () => {
  it("흠이 없으면 오류도 경고도 없다", () => {
    const report = validateBranchingCuttoon(validGraph());
    expect(report.valid).toBe(true);
    expect(report.issues).toEqual([]);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(0);
  });

  it("통계를 센다", () => {
    expect(validateBranchingCuttoon(validGraph()).stats).toEqual({
      nodeCount: 5,
      endingCount: 2,
      choiceCount: 4,
      cutCount: 5,
      reachableNodeCount: 5,
      loopBackCount: 0,
      shortestPathSteps: 2,
      pathCount: 2,
      pathCountExact: true,
      longestPathSteps: 2,
    });
  });

  it("읽을 수 있다고 판정한다", () => {
    expect(isBranchingCuttoonPlayable(validGraph())).toBe(true);
  });
});

describe("시작 장면", () => {
  it("장면이 하나도 없으면 시작이 없다고만 알린다", () => {
    const report = validateBranchingCuttoon(graphOf([], { start: "" }));
    expect(report.issues.map((issue) => issue.code)).toEqual(["start-missing"]);
    expect(report.valid).toBe(false);
  });

  it("startNodeId 가 비어 있으면 시작이 없다", () => {
    const base = validGraph();
    expect(codes({ ...base, startNodeId: "" })).toContain("start-missing");
  });

  it("없는 장면을 가리키면 끊어진 시작이고, 모든 장면을 도달 불가로 몰아 알리지 않는다", () => {
    const base = validGraph();
    const report = validateBranchingCuttoon({ ...base, startNodeId: "없음" });
    expect(report.issues.map((issue) => issue.code)).toContain("start-dangling");
    expect(report.issues.filter((issue) => issue.code === "node-unreachable")).toEqual([]);
    expect(report.issues.find((issue) => issue.code === "start-dangling")?.value).toBe("없음");
  });

  it("시작 장면의 종류가 start 가 아니면 알린다", () => {
    const base = validGraph();
    const graph = { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "start" ? { ...candidate, kind: "scene" as const } : candidate)) };
    expect(issuesOf(graph, "start-kind-mismatch").map((issue) => issue.nodeId)).toEqual(["start"]);
  });

  it("start 종류가 둘이면 덜 중요한 쪽을 중복으로 알린다", () => {
    const base = validGraph();
    const graph = { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "a" ? { ...candidate, kind: "start" as const } : candidate)) };
    expect(issuesOf(graph, "start-duplicate").map((issue) => issue.nodeId)).toEqual(["a"]);
  });

  it("시작 지정이 일반 장면을 가리키면 불일치로 알리고, 원래 시작 장면은 닿을 수 없다고 알린다", () => {
    const base = validGraph();
    const graph = { ...base, startNodeId: "a" };
    expect(issuesOf(graph, "start-kind-mismatch").map((issue) => issue.nodeId)).toEqual(["a"]);
    expect(codes(graph)).not.toContain("start-duplicate");
    expect(issuesOf(graph, "node-unreachable").map((issue) => issue.nodeId)).toContain("start");
  });
});

describe("식별자", () => {
  it("같은 장면 식별자는 한 번만 알리고 개수를 싣는다", () => {
    const base = validGraph();
    const graph = { ...base, nodes: [...base.nodes, node("a", "scene", [choice("c1", "끝", "endA")])] };
    const found = issuesOf(graph, "node-id-duplicate");
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ nodeId: "a", count: 2 });
  });

  it.each([
    ["빈 식별자", ""],
    ["공백 포함", "a b"],
    ["한글", "장면"],
    ["49자", "x".repeat(49)],
    ["밑줄 시작", "_x"],
  ])("잘못된 장면 식별자(%s)", (_name, id) => {
    const base = validGraph();
    const graph = { ...base, nodes: [...base.nodes, node(id, "ending")] };
    expect(issuesOf(graph, "node-id-invalid").map((issue) => issue.nodeId)).toEqual([id]);
  });

  it("같은 장면 안의 선택지 식별자 중복", () => {
    const graph = withStartChoices([choice("c1", "왼쪽", "a"), choice("c1", "오른쪽", "b")]);
    expect(issuesOf(graph, "choice-id-duplicate")).toHaveLength(1);
  });

  it("다른 장면끼리는 같은 선택지 식별자를 써도 된다", () => {
    expect(codes(validGraph())).not.toContain("choice-id-duplicate");
  });

  it("잘못된 선택지 식별자", () => {
    const graph = withStartChoices([choice("c 1", "왼쪽", "a"), choice("c2", "오른쪽", "b")]);
    expect(issuesOf(graph, "choice-id-invalid").map((issue) => issue.choiceId)).toEqual(["c 1"]);
  });

  it("컷 식별자 중복과 형식", () => {
    const base = validGraph();
    const graph = { ...base, cuts: [...base.cuts, cut("k1", "다른 글"), cut("잘못 된")] };
    expect(issuesOf(graph, "cut-id-duplicate").map((issue) => issue.cutId)).toEqual(["k1"]);
    expect(issuesOf(graph, "cut-id-invalid").map((issue) => issue.cutId)).toEqual(["잘못 된"]);
  });
});

describe("끊어진 참조", () => {
  it("도착 장면을 고르지 않은 선택지", () => {
    const graph = withStartChoices([choice("c1", "왼쪽", ""), choice("c2", "오른쪽", "b")]);
    expect(issuesOf(graph, "choice-target-empty")).toEqual([
      expect.objectContaining({ nodeId: "start", choiceId: "c1", severity: "error" }),
    ]);
  });

  it("없는 장면을 가리키는 선택지", () => {
    const graph = withStartChoices([choice("c1", "왼쪽", "사라진"), choice("c2", "오른쪽", "b")]);
    expect(issuesOf(graph, "choice-target-dangling")).toEqual([
      expect.objectContaining({ nodeId: "start", choiceId: "c1", value: "사라진" }),
    ]);
  });

  it("컷 표에 없는 컷 참조", () => {
    const graph = withNode(node("a", "scene", [choice("c1", "끝으로", "endA")], ["k3", "없는컷"]));
    expect(issuesOf(graph, "cut-ref-dangling")).toEqual([expect.objectContaining({ nodeId: "a", cutId: "없는컷" })]);
  });

  it("같은 끊어진 컷 참조를 한 장면에서 여러 번 써도 한 번만 알린다", () => {
    const graph = withNode(node("a", "scene", [choice("c1", "끝으로", "endA")], ["없음", "없음"]));
    expect(issuesOf(graph, "cut-ref-dangling")).toHaveLength(1);
  });

  it("같은 컷을 한 장면에 두 번 넣으면 경고만 한다", () => {
    const graph = withNode(node("a", "scene", [choice("c1", "끝으로", "endA")], ["k3", "k3"]));
    const found = issuesOf(graph, "cut-ref-repeated");
    expect(found).toEqual([expect.objectContaining({ nodeId: "a", cutId: "k3", count: 2, severity: "warning" })]);
    expect(validateBranchingCuttoon(graph).valid).toBe(true);
  });
});

describe("선택지 라벨", () => {
  it.each([["빈 문자열", ""], ["공백뿐", "   "], ["탭과 공백", " \t "]])("비어 있는 라벨(%s)", (_name, label) => {
    const graph = withStartChoices([choice("c1", label, "a"), choice("c2", "오른쪽", "b")]);
    expect(issuesOf(graph, "choice-label-empty")).toEqual([expect.objectContaining({ nodeId: "start", choiceId: "c1" })]);
  });

  it("같은 라벨이 겹치면 뒤쪽을 알린다", () => {
    const graph = withStartChoices([choice("c1", "문을 연다", "a"), choice("c2", "문을 연다", "b")]);
    expect(issuesOf(graph, "choice-label-duplicate")).toEqual([expect.objectContaining({ choiceId: "c2", value: "문을 연다" })]);
  });

  it("공백·대소문자·전각 차이는 같은 라벨로 본다", () => {
    const graph = withStartChoices([choice("c1", "Open Door", "a"), choice("c2", "  open   door ", "b")]);
    expect(issuesOf(graph, "choice-label-duplicate")).toHaveLength(1);
    const wide = withStartChoices([choice("c1", "Open Door", "a"), choice("c2", "ＯＰＥＮ　ＤＯＯＲ", "b")]);
    expect(issuesOf(wide, "choice-label-duplicate")).toHaveLength(1);
  });

  it("다른 장면끼리 같은 라벨은 괜찮다", () => {
    const graph = withNode(node("a", "scene", [choice("c1", "왼쪽", "endA")]));
    expect(codes(graph)).not.toContain("choice-label-duplicate");
  });

  it("비어 있는 라벨은 겹침으로 세지 않는다", () => {
    const graph = withStartChoices([choice("c1", "", "a"), choice("c2", "", "b")]);
    expect(codes(graph)).not.toContain("choice-label-duplicate");
    expect(issuesOf(graph, "choice-label-empty")).toHaveLength(2);
  });
});

describe("도달 불가·막다른 길·결말", () => {
  it("시작에서 닿지 못하는 장면은 오류다", () => {
    const base = validGraph();
    const graph = { ...base, nodes: [...base.nodes, node("island", "scene", [choice("c1", "끝", "endA")])] };
    expect(issuesOf(graph, "node-unreachable").map((issue) => issue.nodeId)).toEqual(["island"]);
    expect(validateBranchingCuttoon(graph).valid).toBe(false);
  });

  it("결말이 아닌데 선택지가 없으면 막다른 길이다", () => {
    const graph = withNode(node("a", "scene", []));
    expect(issuesOf(graph, "dead-end").map((issue) => issue.nodeId)).toEqual(["a"]);
  });

  it("결말은 선택지가 없어도 막다른 길이 아니다", () => {
    expect(codes(validGraph())).not.toContain("dead-end");
  });

  it("선택지가 모두 끊어졌으면 갈 곳이 없어 막다른 길이다", () => {
    const graph = withNode(node("a", "scene", [choice("c1", "끝으로", "없음"), choice("c2", "다른", "")]));
    expect(issuesOf(graph, "dead-end").map((issue) => issue.nodeId)).toEqual(["a"]);
  });

  it("결말이 하나도 없으면 한 번만 알린다", () => {
    const graph = graphOf([node("start", "start", [choice("c1", "가", "a")]), node("a", "scene", [choice("c1", "돌아", "start")])]);
    expect(issuesOf(graph, "ending-missing")).toHaveLength(1);
    expect(codes(graph)).not.toContain("ending-unreachable");
  });

  it("출구 없는 순환은 그 안의 장면마다 결말에 닿지 못한다고 알린다", () => {
    const graph = graphOf([
      node("start", "start", [choice("c1", "가", "a")]),
      node("a", "scene", [choice("c1", "나", "b")]),
      node("b", "scene", [choice("c1", "다", "a")]),
      node("end", "ending"),
    ]);
    expect(issuesOf(graph, "ending-unreachable").map((issue) => issue.nodeId)).toEqual(["start", "a", "b"]);
    expect(issuesOf(graph, "node-unreachable").map((issue) => issue.nodeId)).toEqual(["end"]);
  });

  it("막다른 길 장면 자체는 결말 도달 불가로 겹쳐 알리지 않고, 거기로만 이어지는 앞 장면을 알린다", () => {
    const graph = graphOf([
      node("start", "start", [choice("c1", "가", "a")]),
      node("a", "scene", []),
      node("end", "ending"),
    ]);
    expect(issuesOf(graph, "dead-end").map((issue) => issue.nodeId)).toEqual(["a"]);
    expect(issuesOf(graph, "ending-unreachable").map((issue) => issue.nodeId)).toEqual(["start"]);
  });

  it("다른 길로 결말에 닿을 수 있으면 막다른 가지가 있어도 앞 장면은 결말 도달 불가가 아니다", () => {
    const graph = withNode(node("a", "scene", []));
    expect(issuesOf(graph, "dead-end").map((issue) => issue.nodeId)).toEqual(["a"]);
    expect(codes(graph)).not.toContain("ending-unreachable");
  });
});

describe("되돌아가는 길(경고)", () => {
  it("출구가 있는 순환은 경고이고 읽을 수 있다", () => {
    const report = validateBranchingCuttoon(loopGraph());
    expect(report.issues).toEqual([
      expect.objectContaining({ code: "loop-back", severity: "warning", nodeId: "a", choiceId: "c1", value: "start" }),
    ]);
    expect(report.valid).toBe(true);
    expect(report.warningCount).toBe(1);
    expect(report.stats.loopBackCount).toBe(1);
  });

  it("자기 자신으로 가는 선택지도 경고다", () => {
    const graph = graphOf([
      node("start", "start", [choice("c1", "다시", "start"), choice("c2", "끝", "end")]),
      node("end", "ending"),
    ]);
    expect(issuesOf(graph, "loop-back")).toHaveLength(1);
    expect(validateBranchingCuttoon(graph).valid).toBe(true);
  });

  it("순환 안에서 결말로 나갈 길이 없으면 경고가 아니라 오류가 함께 난다", () => {
    const graph = graphOf([
      node("start", "start", [choice("c1", "가", "a")]),
      node("a", "scene", [choice("c1", "돌아", "start")]),
      node("end", "ending"),
    ]);
    expect(codes(graph)).toContain("loop-back");
    expect(codes(graph)).toContain("ending-unreachable");
    expect(validateBranchingCuttoon(graph).valid).toBe(false);
  });
});

describe("경고만 있는 문제", () => {
  it("결말의 선택지는 경고이고, 결말에서 이어지는 길로는 닿은 것으로 치지 않는다", () => {
    const base = validGraph();
    const graph = {
      ...base,
      nodes: [
        ...base.nodes.map((candidate) => (candidate.id === "endB" ? { ...candidate, choices: [choice("c1", "숨은 길", "hidden")] } : candidate)),
        node("hidden", "ending"),
      ],
    };
    expect(issuesOf(graph, "ending-has-choices")).toEqual([expect.objectContaining({ nodeId: "endB", count: 1, severity: "warning" })]);
    expect(issuesOf(graph, "node-unreachable").map((issue) => issue.nodeId)).toEqual(["hidden"]);
  });

  it("장면 제목이 비어 있으면 경고만 한다", () => {
    const graph = withNode({ ...node("a", "scene", [choice("c1", "끝으로", "endA")]), title: "  " });
    expect(issuesOf(graph, "node-title-empty")).toEqual([expect.objectContaining({ nodeId: "a", severity: "warning" })]);
    expect(validateBranchingCuttoon(graph).valid).toBe(true);
  });
});

describe("안전하지 않은 문자", () => {
  it("라벨의 줄바꿈", () => {
    const graph = withStartChoices([choice("c1", "왼쪽\n오른쪽", "a"), choice("c2", "오른쪽", "b")]);
    expect(issuesOf(graph, "text-invalid-character")).toEqual([expect.objectContaining({ nodeId: "start", choiceId: "c1", value: "label" })]);
  });

  it("제목의 방향 덮어쓰기 문자", () => {
    const graph = withNode({ ...node("a", "scene", [choice("c1", "끝으로", "endA")]), title: "가‮나" });
    expect(issuesOf(graph, "text-invalid-character")).toEqual([expect.objectContaining({ nodeId: "a", value: "title" })]);
  });

  it("컷 캡션은 줄바꿈(LF)은 허용하고 CR 은 거절한다", () => {
    const base = validGraph();
    const ok = { ...base, cuts: base.cuts.map((candidate) => (candidate.id === "k1" ? cut("k1", "첫 줄\n둘째 줄") : candidate)) };
    expect(codes(ok)).not.toContain("text-invalid-character");
    const bad = { ...base, cuts: base.cuts.map((candidate) => (candidate.id === "k1" ? cut("k1", "첫 줄\r\n둘째 줄") : candidate)) };
    expect(issuesOf(bad, "text-invalid-character")).toEqual([expect.objectContaining({ cutId: "k1", nodeId: "start", value: "caption" })]);
  });

  it("작품 제목의 제어 문자", () => {
    expect(issuesOf({ ...validGraph(), title: "제목\u0007" }, "text-invalid-character")).toEqual([expect.objectContaining({ value: "graphTitle" })]);
  });

  it("이모지 결합 문자는 허용한다", () => {
    const graph = withStartChoices([choice("c1", "가족 👨‍👩‍👧", "a"), choice("c2", "오른쪽", "b")]);
    expect(codes(graph)).not.toContain("text-invalid-character");
  });
});

describe("한도", () => {
  const limits = BRANCHING_CUTTOON_LIMITS;

  it("한도 값", () => {
    expect(limits).toMatchObject({
      nodes: 200,
      choicesPerNode: 6,
      cutsPerNode: 30,
      cuts: 1000,
      graphTitleLength: 80,
      nodeTitleLength: 80,
      choiceLabelLength: 80,
      captionLength: 200,
      idLength: 48,
    });
  });

  it("장면 200개는 괜찮고 201개는 넘는다", () => {
    const build = (count: number) => graphOf([
      node("start", "start", [choice("c1", "가", "n1")]),
      ...Array.from({ length: count - 2 }, (_unused, position) => node(`n${position + 1}`, "scene", [choice("c1", "다음", position + 1 === count - 2 ? "end" : `n${position + 2}`)])),
      node("end", "ending"),
    ]);
    expect(codes(build(limits.nodes))).not.toContain("limit-exceeded");
    expect(issuesOf(build(limits.nodes + 1), "limit-exceeded")).toEqual([
      expect.objectContaining({ limit: "nodes", max: 200, actual: 201 }),
    ]);
  });

  it("선택지는 장면마다 6개까지", () => {
    const many = (count: number) => withStartChoices(Array.from({ length: count }, (_unused, position) => choice(`c${position}`, `선택 ${position}`, "a")));
    expect(codes(many(6))).not.toContain("limit-exceeded");
    expect(issuesOf(many(7), "limit-exceeded")).toEqual([
      expect.objectContaining({ limit: "choicesPerNode", nodeId: "start", max: 6, actual: 7 }),
    ]);
  });

  it("장면의 컷 참조는 30개까지", () => {
    const cuts = Array.from({ length: 31 }, (_unused, position) => cut(`z${position}`));
    const build = (count: number) => {
      const base = validGraph();
      return { ...base, cuts: [...base.cuts, ...cuts], nodes: base.nodes.map((candidate) => (candidate.id === "a" ? { ...candidate, cutIds: cuts.slice(0, count).map((item) => item.id) } : candidate)) };
    };
    expect(codes(build(30))).not.toContain("limit-exceeded");
    expect(issuesOf(build(31), "limit-exceeded")).toEqual([expect.objectContaining({ limit: "cutsPerNode", nodeId: "a", actual: 31 })]);
  });

  it("컷 표는 1000개까지", () => {
    const build = (count: number) => ({ ...validGraph(), cuts: Array.from({ length: count }, (_unused, position) => cut(`z${position}`)) });
    const over = issuesOf(build(1001), "limit-exceeded").filter((issue) => issue.limit === "cuts");
    expect(over).toEqual([expect.objectContaining({ max: 1000, actual: 1001 })]);
    expect(issuesOf(build(1000), "limit-exceeded").filter((issue) => issue.limit === "cuts")).toEqual([]);
  });

  it.each([
    ["choiceLabelLength", 80],
    ["nodeTitleLength", 80],
    ["captionLength", 200],
    ["graphTitleLength", 80],
  ] as const)("%s 는 %i자까지", (limit, max) => {
    const text = (count: number) => "가".repeat(count);
    const make = (count: number): BranchingCuttoonGraph => {
      const base = validGraph();
      if (limit === "choiceLabelLength") return withStartChoices([choice("c1", text(count), "a"), choice("c2", "오른쪽", "b")]);
      if (limit === "nodeTitleLength") return withNode({ ...node("a", "scene", [choice("c1", "끝으로", "endA")]), title: text(count) });
      if (limit === "captionLength") return { ...base, cuts: base.cuts.map((candidate) => (candidate.id === "k1" ? cut("k1", text(count)) : candidate)) };
      return { ...base, title: text(count) };
    };
    expect(issuesOf(make(max), "limit-exceeded")).toEqual([]);
    expect(issuesOf(make(max + 1), "limit-exceeded")).toEqual([expect.objectContaining({ limit, max, actual: max + 1 })]);
  });

  it("글자 수는 코드 포인트로 센다: 이모지 80개는 통과, 81개는 넘는다", () => {
    const label = (count: number) => "😀".repeat(count);
    expect(codes(withStartChoices([choice("c1", label(80), "a"), choice("c2", "오른쪽", "b")]))).not.toContain("limit-exceeded");
    expect(codes(withStartChoices([choice("c1", label(81), "a"), choice("c2", "오른쪽", "b")]))).toContain("limit-exceeded");
  });

  it("한도를 넘는 그래프는 읽을 수 없다", () => {
    expect(isBranchingCuttoonPlayable({ ...validGraph(), title: "가".repeat(81) })).toBe(false);
  });
});

describe("보고서 성질", () => {
  it("모든 코드는 심각도가 정해져 있고 코드 목록에 중복이 없다", () => {
    expect(new Set(BRANCHING_ISSUE_CODES).size).toBe(BRANCHING_ISSUE_CODES.length);
    expect(Object.keys(BRANCHING_ISSUE_SEVERITY).sort()).toEqual([...BRANCHING_ISSUE_CODES].sort());
  });

  it("경고는 되돌아가는 길·결말의 선택지·제목 없음·컷 반복뿐이다", () => {
    const warnings = BRANCHING_ISSUE_CODES.filter((code) => BRANCHING_ISSUE_SEVERITY[code] === "warning");
    expect(warnings).toEqual(["loop-back", "ending-has-choices", "node-title-empty", "cut-ref-repeated"]);
  });

  it("같은 입력이면 같은 보고서를 낸다", () => {
    const graph = withStartChoices([choice("c1", "", ""), choice("c1", "x", "없음")]);
    expect(validateBranchingCuttoon(graph)).toEqual(validateBranchingCuttoon(graph));
  });

  it("입력을 바꾸지 않는다", () => {
    const frozen = deepFreeze(withStartChoices([choice("c1", "", "없음"), choice("c1", "", "a")]));
    expect(() => validateBranchingCuttoon(frozen)).not.toThrow();
  });

  it("JSON 으로 직렬화했다 되돌려도 같다", () => {
    const report = validateBranchingCuttoon(loopGraph());
    expect(JSON.parse(JSON.stringify(report))).toEqual(report);
  });

  it("오류를 경고보다 먼저, 그래프 전체 문제를 장면 문제보다 먼저, 장면은 목록 순서로 낸다", () => {
    const graph: BranchingCuttoonGraph = {
      title: "x",
      startNodeId: "start",
      cuts: [],
      nodes: [
        node("start", "start", [choice("c1", "", "a"), choice("c2", "다시", "start")]),
        { ...node("a", "scene", [], []), title: "" },
      ],
    };
    const report = validateBranchingCuttoon(graph);
    const severities = report.issues.map((issue) => issue.severity);
    expect(severities).toEqual([...severities].sort((left, right) => (left === right ? 0 : left === "error" ? -1 : 1)));
    const firstNodeScoped = report.issues.findIndex((issue) => issue.nodeId !== undefined);
    const lastGraphScoped = report.issues.map((issue) => issue.nodeId === undefined).lastIndexOf(true);
    expect(lastGraphScoped).toBeLessThan(firstNodeScoped);
    const errorNodes = report.issues.filter((issue) => issue.severity === "error" && issue.nodeId).map((issue) => issue.nodeId);
    expect(errorNodes.indexOf("start")).toBeLessThan(errorNodes.indexOf("a"));
  });

  it("오류와 경고의 합이 전체 항목 수다", () => {
    const report = validateBranchingCuttoon(withStartChoices([choice("c1", "", "a"), choice("c2", "다시", "start")]));
    expect(report.errorCount + report.warningCount).toBe(report.issues.length);
    expect(report.errorCount).toBeGreaterThan(0);
    expect(report.warningCount).toBeGreaterThan(0);
  });

  it("보고서에 싣는 값은 길이를 자른다", () => {
    const graph = withStartChoices([choice("c1", "왼쪽", "x".repeat(5000)), choice("c2", "오른쪽", "b")]);
    const value = issuesOf(graph, "choice-target-dangling")[0]?.value ?? "";
    expect(Array.from(value).length).toBeLessThanOrEqual(61);
    expect(value.endsWith("…")).toBe(true);
  });

  it("그래프 판 지문을 보고서에 싣는다", () => {
    expect(validateBranchingCuttoon(validGraph()).graphVersion).toMatch(/^bt1-[0-9a-z]+$/u);
  });
});

describe("길 열거 상한과 통계", () => {
  it("길이 상한을 넘으면 정확하지 않다고 알린다", () => {
    const report = validateBranchingCuttoon(diamondChain(5), { pathLimits: { maxPaths: 4, maxDepth: 64, maxSteps: 10_000 } });
    expect(report.stats.pathCount).toBe(4);
    expect(report.stats.pathCountExact).toBe(false);
  });

  it("2^40 가지 길이 있는 그래프도 검증이 끝나고 오류가 없다", () => {
    const report = validateBranchingCuttoon(diamondChain(40));
    expect(report.valid).toBe(true);
    expect(report.stats.pathCountExact).toBe(false);
  });

  it("가장 짧은 길과 가장 긴 길을 센다", () => {
    const graph = graphOf([
      node("start", "start", [choice("c1", "바로", "end"), choice("c2", "돌아서", "a")]),
      node("a", "scene", [choice("c1", "계속", "b")]),
      node("b", "scene", [choice("c1", "끝", "end")]),
      node("end", "ending"),
    ]);
    const { stats } = validateBranchingCuttoon(graph);
    expect(stats.shortestPathSteps).toBe(1);
    expect(stats.longestPathSteps).toBe(3);
    expect(stats.pathCount).toBe(2);
  });

  it("결말에 닿을 수 없으면 가장 짧은 길이 없다", () => {
    const { stats } = validateBranchingCuttoon(graphOf([node("start", "start")]));
    expect(stats.shortestPathSteps).toBeNull();
    expect(stats.longestPathSteps).toBeNull();
    expect(stats.pathCount).toBe(0);
  });

  it("닿을 수 있는 장면 수를 센다", () => {
    const base = validGraph();
    const graph = { ...base, nodes: [...base.nodes, node("island", "scene")] };
    expect(validateBranchingCuttoon(graph).stats.reachableNodeCount).toBe(5);
  });
});

describe("규모", () => {
  it("한도 크기의 그래프(장면 200개, 장면마다 선택지 6개)도 즉시 검증한다", () => {
    const count = BRANCHING_CUTTOON_LIMITS.nodes;
    const nodes = Array.from({ length: count }, (_unused, position) => {
      if (position === count - 1) return node("end", "ending");
      const choices = Array.from({ length: BRANCHING_CUTTOON_LIMITS.choicesPerNode }, (_ignored, which) => {
        const target = Math.min(count - 1, position + 1 + which);
        return choice(`c${which}`, `선택 ${which}`, target === count - 1 ? "end" : `n${target}`);
      });
      return node(position === 0 ? "n0" : `n${position}`, position === 0 ? "start" : "scene", choices);
    });
    const report = validateBranchingCuttoon(graphOf(nodes, { start: "n0" }));
    expect(report.valid).toBe(true);
    expect(report.stats.pathCountExact).toBe(false);
  });
});
