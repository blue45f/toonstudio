// @vitest-environment jsdom
import {
  addChoice,
  addNode,
  chooseBranch,
  startReading,
  stepBack,
  updateNode,
  type BranchingCuttoonGraph,
  type BranchingReaderState,
} from "./model";
import { beforeEach, describe, expect, it } from "vitest";

import { useI18n } from "@/shared/lib/i18n";

import { createSampleBranchingGraph } from "./branching-cuttoon-sample";
import {
  BRANCHING_DRAFT_STORAGE_KEY,
  branchingWorkKey,
  progressStorageKey,
  readDraft,
  readProgress,
  writeDraft,
  writeProgress,
} from "./branching-cuttoon-storage";
import { accepted, blockedStorage, memoryStore, missingStorage, tNow } from "./branching-cuttoon-test-kit";

beforeEach(() => {
  useI18n.getState().setLang("ko");
});

function sample(): BranchingCuttoonGraph {
  return createSampleBranchingGraph(tNow);
}

function must<T>(value: T | null | undefined): T {
  if (value === null || value === undefined) throw new Error("시험 준비 단계가 실패했어요.");
  return value;
}

/** 샘플에서 "우산을 건네요 → 열쇠에 대해 물어봐요" 두 번 고른 상태. */
function readTwoSteps(graph: BranchingCuttoonGraph): BranchingReaderState {
  const first = must(chooseBranch(graph, must(startReading(graph)), "c1"));
  return must(chooseBranch(graph, first, "c1"));
}

describe("작품 식별자와 저장 키", () => {
  it("키에 쓸 수 있는 식별자만 그대로 쓰고, 나머지는 draft 로 돌린다", () => {
    expect(branchingWorkKey("episode-1")).toBe("episode-1");
    expect(branchingWorkKey("A_b-9")).toBe("A_b-9");
    for (const bad of ["", " ", "a b", "a/b", "../x", "_x", "-x", "가나", "x".repeat(49), "__proto__"]) {
      expect(branchingWorkKey(bad), JSON.stringify(bad)).toBe("draft");
    }
    expect(branchingWorkKey("x".repeat(48))).toBe("x".repeat(48));
  });

  it("읽던 위치의 키는 작품 단위이고 판 번호(v1)를 담는다", () => {
    expect(progressStorageKey("ep1")).toBe("toonstudio.branching-cuttoon.progress.v1.ep1");
    expect(progressStorageKey("a/b")).toBe("toonstudio.branching-cuttoon.progress.v1.draft");
    expect(BRANCHING_DRAFT_STORAGE_KEY).toBe("toonstudio.branching-cuttoon.draft.v1");
  });
});

describe("초안 저장과 복원", () => {
  it("저장한 초안을 그대로 되살린다", () => {
    const store = memoryStore();
    const graph = sample();
    expect(writeDraft(store.resolve, graph)).toBe(true);
    const result = readDraft(store.resolve);
    expect(result.kind).toBe("restored");
    if (result.kind === "restored") expect(result.graph).toEqual(graph);
  });

  it("저장된 값이 없으면 none 이다", () => {
    expect(readDraft(memoryStore().resolve)).toEqual({ kind: "none" });
  });

  it("값이 있는데 읽을 수 없으면 unreadable 이다(깨진 JSON, 다른 형식, 모양이 틀린 파일)", () => {
    const shapeless = JSON.stringify({ format: "toonstudio.branching-cuttoon", schemaVersion: 1 });
    for (const raw of ["{", "[]", "null", "\"문자열\"", JSON.stringify({ format: "other", schemaVersion: 1 }), shapeless]) {
      const store = memoryStore({ [BRANCHING_DRAFT_STORAGE_KEY]: raw });
      expect(readDraft(store.resolve), raw).toEqual({ kind: "unreadable" });
    }
  });

  it("읽을 수 없는 초안을 두고 새로 저장해도 던지지 않는다", () => {
    const store = memoryStore({ [BRANCHING_DRAFT_STORAGE_KEY]: "깨진 값" });
    expect(writeDraft(store.resolve, sample())).toBe(true);
    expect(readDraft(store.resolve).kind).toBe("restored");
  });

  it("저장소가 막혀 있거나 없으면 읽기는 none, 쓰기는 false 이고 던지지 않는다", () => {
    expect(readDraft(blockedStorage)).toEqual({ kind: "none" });
    expect(readDraft(missingStorage)).toEqual({ kind: "none" });
    expect(writeDraft(blockedStorage, sample())).toBe(false);
    expect(writeDraft(missingStorage, sample())).toBe(false);
  });

  it("용량이 가득 차 쓰기가 실패하면 false 이고 이전에 잘 저장된 초안을 그대로 둔다", () => {
    const store = memoryStore();
    const first = sample();
    expect(writeDraft(store.resolve, first)).toBe(true);
    store.failWrites = true;
    const changed = accepted(addNode(first, "scene", "새 장면"));
    expect(writeDraft(store.resolve, changed.graph)).toBe(false);
    store.failWrites = false;
    const restored = readDraft(store.resolve);
    expect(restored.kind === "restored" ? restored.graph : null).toEqual(first);
  });

  it("가져오기 상한(1MiB)을 넘는 초안은 다음에 읽을 수 없으므로 쓰지 않는다", () => {
    const store = memoryStore();
    const good = sample();
    expect(writeDraft(store.resolve, good)).toBe(true);
    const attemptsBefore = store.writeAttempts();
    const huge: BranchingCuttoonGraph = { ...good, cuts: [{ id: "k1", caption: "가".repeat(1_100_000) }] };
    expect(writeDraft(store.resolve, huge)).toBe(false);
    expect(store.writeAttempts()).toBe(attemptsBefore);
    const restored = readDraft(store.resolve);
    expect(restored.kind === "restored" ? restored.graph : null).toEqual(good);
  });
});

describe("읽던 위치 저장과 복원", () => {
  it("저장한 위치를 되살린다(현재 장면, 가 본 장면, 지나온 선택)", () => {
    const store = memoryStore();
    const graph = sample();
    const state = readTwoSteps(graph);
    expect(writeProgress(store.resolve, "ep1", graph, state)).toBe(true);
    const result = readProgress(store.resolve, "ep1", graph);
    expect(result.outcome).toBe("resumed");
    expect(result.state).toEqual(state);
    expect(state.nodeId).toBe("key");
    expect(state.trail).toHaveLength(2);
  });

  it("기록이 없으면 none 이고 상태는 null 이다", () => {
    expect(readProgress(memoryStore().resolve, "ep1", sample())).toEqual({ state: null, outcome: "none" });
  });

  it("아직 한 장면도 넘기지 않은 기록은 none 으로 알린다(이어 읽는다는 안내를 띄우지 않는다)", () => {
    const store = memoryStore();
    const graph = sample();
    writeProgress(store.resolve, "ep1", graph, must(startReading(graph)));
    const result = readProgress(store.resolve, "ep1", graph);
    expect(result.outcome).toBe("none");
    expect(result.state?.nodeId).toBe(graph.startNodeId);
  });

  it("한 걸음 되돌아간 위치도 저장되고 복원된다", () => {
    const store = memoryStore();
    const graph = sample();
    const back = must(stepBack(readTwoSteps(graph)));
    writeProgress(store.resolve, "ep1", graph, back);
    const result = readProgress(store.resolve, "ep1", graph);
    expect(result.state).toEqual(back);
    expect(result.state?.nodeId).toBe("share");
  });

  it("작품마다 기록이 따로 있다", () => {
    const store = memoryStore();
    const graph = sample();
    writeProgress(store.resolve, "ep1", graph, readTwoSteps(graph));
    expect(readProgress(store.resolve, "ep2", graph).outcome).toBe("none");
    expect(readProgress(store.resolve, "ep1", graph).outcome).toBe("resumed");
  });

  it("글(제목·컷·선택지 이름)만 고친 그래프는 같은 판이라 이어 읽는다", () => {
    const store = memoryStore();
    const graph = sample();
    writeProgress(store.resolve, "ep1", graph, readTwoSteps(graph));
    const retitled = accepted(updateNode(graph, "share", { title: "바뀐 제목" }));
    expect(readProgress(store.resolve, "ep1", retitled.graph).outcome).toBe("resumed");
  });

  it("장면·선택지의 연결이 바뀌면 판이 달라서 기록을 되살리지 않고 처음부터 시작하게 한다(reset)", () => {
    const store = memoryStore();
    const graph = sample();
    writeProgress(store.resolve, "ep1", graph, readTwoSteps(graph));

    const withNode = accepted(addNode(graph, "scene", "끼어든 장면"));
    const withChoice = accepted(addChoice(withNode.graph, "walk", ""));

    const result = readProgress(store.resolve, "ep1", withChoice.graph);
    expect(result).toEqual({ state: null, outcome: "reset" });
  });

  it("깨진 기록(JSON 아님, 모양 틀림, 없는 장면)은 reset 이고 던지지 않는다", () => {
    const graph = sample();
    const key = progressStorageKey("ep1");
    for (const raw of ["{", "[]", "null", "7", JSON.stringify({ v: 1, graphVersion: "x", nodeId: "rain", visited: [], trail: [] }), JSON.stringify({ v: 9 })]) {
      const store = memoryStore({ [key]: raw });
      expect(readProgress(store.resolve, "ep1", graph), raw).toEqual({ state: null, outcome: "reset" });
    }
  });

  it("저장소가 막혀 있거나 없으면 읽기는 none, 쓰기는 false 이다", () => {
    const graph = sample();
    const state = readTwoSteps(graph);
    expect(readProgress(blockedStorage, "ep1", graph)).toEqual({ state: null, outcome: "none" });
    expect(readProgress(missingStorage, "ep1", graph)).toEqual({ state: null, outcome: "none" });
    expect(writeProgress(blockedStorage, "ep1", graph, state)).toBe(false);
    expect(writeProgress(missingStorage, "ep1", graph, state)).toBe(false);
  });

  it("쓰기가 실패해도 던지지 않고 false 만 돌려준다", () => {
    const store = memoryStore();
    store.failWrites = true;
    const graph = sample();
    expect(writeProgress(store.resolve, "ep1", graph, readTwoSteps(graph))).toBe(false);
    expect(store.data.size).toBe(0);
  });
});
