// @vitest-environment jsdom
import {
  BRANCHING_CUTTOON_LIMITS,
  branchingGraphVersion,
  chooseBranch,
  isBranchingCuttoonPlayable,
  readerScene,
  startReading,
  validateBranchingCuttoon,
  type BranchingCuttoonGraph,
  type BranchingReaderState,
} from "./model";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createSampleBranchingGraph } from "./branching-cuttoon-sample";
import { tNow } from "./branching-cuttoon-test-kit";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});
afterEach(() => {
  useI18n.getState().setLang("ko");
});

function sample(): BranchingCuttoonGraph {
  return createSampleBranchingGraph(tNow);
}

describe("샘플 그래프 ‘빗속의 우산’", () => {
  it("오류 없이 읽을 수 있고 경고는 ‘되돌아가는 길’ 하나뿐이다", () => {
    const report = validateBranchingCuttoon(sample());
    expect(report.valid).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.warningCount).toBe(1);
    expect(report.issues.map((found) => found.code)).toEqual(["loop-back"]);
    expect(report.issues[0]?.nodeId).toBe("ignore");
    expect(report.issues[0]?.value).toBe("rain");
    expect(isBranchingCuttoonPlayable(sample())).toBe(true);
  });

  it("규모와 길이가 설명한 대로다(장면 8·결말 3·선택지 9·컷 12, 결말까지 4갈래, 가장 짧은 길 2번)", () => {
    const { stats } = validateBranchingCuttoon(sample());
    expect(stats.nodeCount).toBe(8);
    expect(stats.endingCount).toBe(3);
    expect(stats.choiceCount).toBe(9);
    expect(stats.cutCount).toBe(12);
    expect(stats.reachableNodeCount).toBe(8);
    expect(stats.loopBackCount).toBe(1);
    expect(stats.pathCountExact).toBe(true);
    expect(stats.pathCount).toBe(4);
    expect(stats.shortestPathSteps).toBe(2);
    expect(stats.longestPathSteps).toBe(4);
  });

  it("모든 결말에 닿을 수 있고 되돌아가는 길로 시작 장면에 다시 올 수 있다", () => {
    const graph = sample();
    let state: BranchingReaderState | null = startReading(graph);
    expect(state?.nodeId).toBe("rain");
    state = state ? chooseBranch(graph, state, "c2") : null;
    expect(state?.nodeId).toBe("ignore");
    state = state ? chooseBranch(graph, state, "c1") : null;
    expect(state?.nodeId).toBe("rain");
    expect(state?.visited).toEqual(["rain", "ignore"]);
    expect(state?.trail).toHaveLength(2);
    const scene = state ? readerScene(graph, state) : null;
    expect(scene?.choices).toHaveLength(2);
  });

  it("모든 컷이 어느 장면에선가 쓰이고, 컷 글은 비어 있지 않다", () => {
    const graph = sample();
    const used = new Set(graph.nodes.flatMap((node) => node.cutIds));
    expect(graph.cuts.map((cut) => cut.id).sort()).toEqual([...used].sort());
    for (const cut of graph.cuts) expect(cut.caption.trim().length, cut.id).toBeGreaterThan(0);
  });

  it("글은 번역 키로 만들어져 한도 안에 있고, 사용자에게 보이는 글에 키 이름이 새지 않는다", () => {
    for (const lang of ["ko", "en", "ja"]) {
      useI18n.getState().setLang(lang);
      const graph = sample();
      const texts = [graph.title, ...graph.cuts.map((cut) => cut.caption), ...graph.nodes.flatMap((node) => [node.title, ...node.choices.map((choice) => choice.label)])];
      for (const text of texts) {
        expect(text.trim().length, `${lang}: ${text}`).toBeGreaterThan(0);
        expect(text, lang).not.toContain("branchingCuttoon.");
        expect(text, lang).not.toMatch(/[{}]/u);
      }
      for (const cut of graph.cuts) expect(Array.from(cut.caption).length).toBeLessThanOrEqual(BRANCHING_CUTTOON_LIMITS.captionLength);
      expect(validateBranchingCuttoon(graph).valid, lang).toBe(true);
    }
  });

  it("언어가 달라도 장면과 선택지의 연결은 같다(판 지문이 같다)", () => {
    useI18n.getState().setLang("ko");
    const ko = sample();
    useI18n.getState().setLang("en");
    const en = sample();
    expect(ko.title).not.toBe(en.title);
    expect(branchingGraphVersion(ko)).toBe(branchingGraphVersion(en));
    expect(en.nodes.map((node) => node.id)).toEqual(ko.nodes.map((node) => node.id));
  });

  it("호출할 때마다 새 객체를 돌려줘서 한쪽을 바꿔도 다른 쪽이 변하지 않는다", () => {
    const first = sample();
    const second = sample();
    expect(first).not.toBe(second);
    expect(first.nodes).not.toBe(second.nodes);
    expect(first.nodes[0]?.cutIds).not.toBe(second.nodes[0]?.cutIds);
    expect(first).toEqual(second);
  });
});
