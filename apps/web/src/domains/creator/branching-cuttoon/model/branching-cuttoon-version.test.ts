import { describe, expect, it } from "vitest";

import { choice, graphOf, loopGraph, node, validGraph } from "./__tests__/graph-fixtures";
import { branchingGraphVersion } from "./branching-cuttoon-version";

describe("그래프 판 지문", () => {
  it("같은 그래프는 언제나 같은 지문이다", () => {
    expect(branchingGraphVersion(validGraph())).toBe(branchingGraphVersion(validGraph()));
  });

  it("접두사 bt1- 뒤에 소문자 36진수가 온다", () => {
    expect(branchingGraphVersion(validGraph())).toMatch(/^bt1-[0-9a-z]+$/u);
  });

  it("제목·라벨·컷 글만 고치면 바뀌지 않는다", () => {
    const base = validGraph();
    const edited = {
      ...base,
      title: "전혀 다른 제목",
      cuts: base.cuts.map((candidate) => ({ ...candidate, caption: "다른 글" })),
      nodes: base.nodes.map((candidate) => ({
        ...candidate,
        title: "다른 제목",
        choices: candidate.choices.map((item) => ({ ...item, label: "다른 라벨" })),
      })),
    };
    expect(branchingGraphVersion(edited)).toBe(branchingGraphVersion(base));
  });

  it("컷 참조를 바꿔도 바뀌지 않는다", () => {
    const base = validGraph();
    const edited = { ...base, nodes: base.nodes.map((candidate) => ({ ...candidate, cutIds: [] })) };
    expect(branchingGraphVersion(edited)).toBe(branchingGraphVersion(base));
  });

  it("장면과 선택지의 순서만 바꿔도 바뀌지 않는다", () => {
    const base = validGraph();
    const reordered = {
      ...base,
      nodes: [...base.nodes].reverse().map((candidate) => ({ ...candidate, choices: [...candidate.choices].reverse() })),
    };
    expect(branchingGraphVersion(reordered)).toBe(branchingGraphVersion(base));
  });

  it("선택지의 도착 장면이 바뀌면 바뀐다", () => {
    const base = validGraph();
    const rewired = { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "a" ? { ...candidate, choices: [choice("c1", "끝으로", "endB")] } : candidate)) };
    expect(branchingGraphVersion(rewired)).not.toBe(branchingGraphVersion(base));
  });

  it("장면이 늘거나 줄면 바뀐다", () => {
    const base = validGraph();
    expect(branchingGraphVersion({ ...base, nodes: [...base.nodes, node("extra", "scene")] })).not.toBe(branchingGraphVersion(base));
    expect(branchingGraphVersion({ ...base, nodes: base.nodes.slice(0, -1) })).not.toBe(branchingGraphVersion(base));
  });

  it("장면 종류가 바뀌면 바뀐다", () => {
    const base = validGraph();
    const changed = { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "endB" ? { ...candidate, kind: "scene" as const } : candidate)) };
    expect(branchingGraphVersion(changed)).not.toBe(branchingGraphVersion(base));
  });

  it("시작 장면 지정이 바뀌면 바뀐다", () => {
    expect(branchingGraphVersion({ ...validGraph(), startNodeId: "a" })).not.toBe(branchingGraphVersion(validGraph()));
  });

  it("선택지 식별자가 바뀌면 바뀐다", () => {
    const base = validGraph();
    const renamed = { ...base, nodes: base.nodes.map((candidate) => (candidate.id === "a" ? { ...candidate, choices: [choice("x9", "끝으로", "endA")] } : candidate)) };
    expect(branchingGraphVersion(renamed)).not.toBe(branchingGraphVersion(base));
  });

  it("서로 다른 연결 구조는 서로 다른 지문을 가진다", () => {
    const graphs = [
      validGraph(),
      loopGraph(),
      graphOf([node("start", "start")]),
      graphOf([node("start", "start", [choice("c1", "가", "end")]), node("end", "ending")]),
      graphOf([node("start", "start", [choice("c1", "가", "end"), choice("c2", "나", "end")]), node("end", "ending")]),
    ];
    const versions = graphs.map((graph) => branchingGraphVersion(graph));
    expect(new Set(versions).size).toBe(versions.length);
  });

  it("구분자가 섞인 잘못된 식별자가 있어도 던지지 않고 지문을 낸다", () => {
    const messy = graphOf([node("a:b[c];d", "start", [choice("x>y,z", "x", "a:b[c];d")])], { start: "a:b[c];d" });
    expect(branchingGraphVersion(messy)).toMatch(/^bt1-/u);
  });
});
