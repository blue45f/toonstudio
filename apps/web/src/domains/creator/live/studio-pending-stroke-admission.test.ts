import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPendingStrokeAdmissionQueue } from "./studio-pending-stroke-admission";

import type { DrawEl } from "../studio-element-model";
import type { StudioPendingStrokeScope } from "./studio-pending-stroke-admission";

const scope: StudioPendingStrokeScope = { documentKey: "doc", pageId: "page", generation: 1, accessGeneration: 0 };
function stroke(id: string): DrawEl {
  return { id, type: "draw", mode: "pen", kind: "freehand", brush: "watercolor", points: [1, 2], pressures: [0.17], tiltXs: [12], tiltYs: [-20], sampleTimeOffsets: [0], stroke: "#112233", strokeWidth: 23 };
}

describe("같은 provider의 입력 준비 대기열", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("준비 전의 좌표·필압·기울기와 브러시를 유지하고 준비되면 한 번만 재개한다", () => {
    let ready = false;
    const admit = vi.fn(() => ready);
    const recover = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => "a" });
    queue.defer({ stroke: stroke("a"), scope, admit, recover });
    queue.update({ ...stroke("a"), points: [1, 2, 3, 4], pressures: [0.17, 0.91], tiltXs: [12, 45], tiltYs: [-20, 5], sampleTimeOffsets: [0, 17] });
    vi.advanceTimersByTime(32);
    expect(queue.has("a")).toBe(true);
    ready = true;
    vi.advanceTimersByTime(32);
    expect(admit).toHaveBeenLastCalledWith(expect.objectContaining({ points: [1, 2, 3, 4], pressures: [0.17, 0.91], tiltXs: [12, 45], tiltYs: [-20, 5], sampleTimeOffsets: [0, 17], brush: "watercolor", strokeWidth: 23 }), false, undefined);
    const calls = admit.mock.calls.length;
    vi.advanceTimersByTime(1_000);
    expect(admit).toHaveBeenCalledTimes(calls);
    expect(queue.size).toBe(0);
    expect(recover).not.toHaveBeenCalled();
    queue.dispose();
  });

  it("여러 완성 획은 입력 순서로 기존 finish 경로에 한 번씩 전달한다", () => {
    let ready = false;
    const completed: string[] = [];
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    for (const id of ["a", "b", "c"]) {
      queue.defer({ stroke: stroke(id), scope, recover: vi.fn(), admit: (source, complete) => {
        if (!ready) return false;
        expect(complete).toBe(true);
        completed.push(source.id);
        return true;
      } });
      queue.complete(stroke(id));
    }
    vi.advanceTimersByTime(64);
    expect(completed).toEqual([]);
    ready = true;
    vi.advanceTimersByTime(256);
    expect(completed).toEqual(["a", "b", "c"]);
    expect(queue.size).toBe(0);
    queue.dispose();
  });

  it.each(["pageId", "generation", "documentKey", "accessGeneration"] as const)("%s가 바뀌면 다른 문서에 넣지 않고 원래 복구 콜백에 보관한다", (field) => {
    let current = scope;
    const recover = vi.fn();
    const admit = vi.fn(() => true);
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => current, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("a"), scope, admit, recover });
    queue.complete(stroke("a"));
    current = { ...scope, [field]: typeof scope[field] === "number" ? 2 : "other" };
    queue.pump();
    expect(admit).not.toHaveBeenCalled();
    expect(recover).toHaveBeenCalledOnce();
    expect(queue.size).toBe(0);
    queue.dispose();
  });

  it("먼저 그린 획의 실제 커밋만 따라 다음 두 입력을 원래 좌표와 필압으로 재생한다", () => {
    let current = scope;
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => current, activeStrokeId: () => null });
    const recover = vi.fn();
    const replayed: DrawEl[] = [];
    for (const id of ["b", "c"]) {
      const source = { ...stroke(id), points: [1, 2, 3, 4], pressures: [0.17, 0.91], tiltXs: [12, 45] };
      queue.defer({ stroke: source, scope, pendingStrokeIds: ["a"], recover,
        admit: (input, complete) => { expect(complete).toBe(true); replayed.push(input); return true; } });
      queue.complete(source);
    }
    current = { ...scope, generation: 3 };
    queue.noteCommittedPredecessors("page", [stroke("a")], 1);
    expect(queue.canResume("b")).toBe(true);
    queue.pump();
    current = { ...scope, generation: 5 };
    queue.noteCommittedPredecessors("page", [stroke("b")], 3);
    queue.pump();
    expect(replayed.map(s => [s.id, s.points, s.pressures, s.tiltXs])).toEqual(
      ["b", "c"].map(id => [id, [1, 2, 3, 4], [0.17, 0.91], [12, 45]]),
    );
    expect(recover).not.toHaveBeenCalled();
    expect(queue.size).toBe(0);
  });

  it.each(["원격 수정이 먼저", "원격 수정이 나중", "다른 획", "섞인 배치", "접근 권한 변경", "페이지 변경", "문서 변경"])(
    "%s인 경우 선행 커밋을 근거로 종전 입력을 승인하지 않는다", reason => {
      let current = scope;
      const recover = vi.fn(), admit = vi.fn(() => true);
      const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => current, activeStrokeId: () => null });
      queue.defer({ stroke: stroke("b"), scope, pendingStrokeIds: ["a"], recover, admit });
      queue.complete(stroke("b"));
      current = { ...scope, generation: 3 };
      if (reason === "접근 권한 변경") current = { ...current, accessGeneration: 2 };
      if (reason === "페이지 변경") current = { ...current, pageId: "other" };
      if (reason === "문서 변경") current = { ...current, documentKey: "other" };
      const ids = reason === "다른 획" ? ["peer"] : reason === "섞인 배치" ? ["a", "peer"] : ["a"];
      queue.noteCommittedPredecessors("page", ids.map(stroke), reason === "원격 수정이 먼저" ? 2 : 1);
      if (reason === "원격 수정이 나중") current = { ...current, generation: 4 };
      expect(queue.canResume("b")).toBe(false);
      queue.pump();
      expect(admit).not.toHaveBeenCalled();
      expect(recover).toHaveBeenCalledExactlyOnceWith(stroke("b"), expect.any(String));
    },
  );

  it("실패와 시간 초과에는 다른 provider로 바꾸지 않고 완성 획 전부를 보관한다", () => {
    const recover = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null, timeoutMs: 100 });
    for (let index = 0; index < 12; index += 1) {
      queue.defer({ stroke: stroke(String(index)), scope, admit: () => false, recover });
      queue.complete(stroke(String(index)));
    }
    vi.advanceTimersByTime(1_000);
    expect(recover).toHaveBeenCalledTimes(12);
    expect(queue.size).toBe(0);
    queue.dispose();
  });

  it("다른 접촉을 수집하는 동안 과거 획 재생이 현재 샘플러를 덮지 않는다", () => {
    const admit = vi.fn(() => true);
    let active: string | null = "new";
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => active });
    queue.defer({ stroke: stroke("old"), scope, admit, recover: vi.fn() });
    queue.complete(stroke("old"));
    queue.pump();
    expect(admit).not.toHaveBeenCalled();
    active = null;
    queue.pump();
    expect(admit).toHaveBeenCalledOnce();
    queue.dispose();
  });

  it("완료 원본은 후속 샘플 변화와 분리하며 원래 release 콜백을 한 번 전달한다", () => {
    const source = stroke("a");
    const finish = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: source, scope, recover: vi.fn(), admit: (saved, complete, release) => {
      expect(saved.points).toEqual([1, 2]);
      expect(complete).toBe(true);
      release?.();
      return true;
    } });
    queue.complete(source, finish);
    source.points.push(3, 4);
    vi.advanceTimersByTime(128);
    expect(finish).toHaveBeenCalledOnce();
    queue.dispose();
  });

  it("provider 예외와 편집기 종료는 원본을 복구하고 타이머를 남기지 않는다", () => {
    const recover = vi.fn();
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("failed"), scope, recover, admit: () => { throw new Error("worker failed"); } });
    queue.defer({ stroke: stroke("closing"), scope, recover, admit: () => false });
    queue.pump();
    expect(recover).toHaveBeenCalledWith(expect.objectContaining({ id: "failed" }), "worker failed");
    queue.dispose();
    expect(recover).toHaveBeenCalledTimes(2);
    expect(recover).toHaveBeenLastCalledWith(expect.objectContaining({ id: "closing" }), expect.stringContaining("편집기가 닫혀"));
    vi.advanceTimersByTime(100_000);
    expect(recover).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });


  it("기존 Worker 초기화 허용 시간 동안 기다린 완성 획도 준비 후 자동 재생한다", () => {
    let ready = false;
    const recover = vi.fn();
    const accepted: string[] = [];
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("slow-worker"), scope, recover, admit: (saved) => {
      if (!ready) return false;
      accepted.push(saved.id);
      return true;
    } });
    queue.complete(stroke("slow-worker"));
    vi.advanceTimersByTime(29_000);
    expect(queue.size).toBe(1);
    expect(recover).not.toHaveBeenCalled();
    ready = true;
    vi.advanceTimersByTime(32);
    expect(accepted).toEqual(["slow-worker"]);
    queue.dispose();
  });


  it("완성 입력을 admission 전에 체크포인트로 보내고 수락 뒤 한 번만 확정 통보한다", () => {
    const calls: string[] = [];
    const queue = new StudioPendingStrokeAdmissionQueue({ currentScope: () => scope, activeStrokeId: () => null });
    queue.defer({ stroke: stroke("durable"), scope, recover: vi.fn(),
      checkpoint: (saved) => { expect(saved.points).toEqual([1, 2]); calls.push("checkpoint"); },
      admit: () => { calls.push("admit"); return true; },
      settled: (_saved, accepted) => { expect(accepted).toBe(true); calls.push("accepted"); },
    });
    queue.complete(stroke("durable"));
    expect(calls).toEqual(["checkpoint"]);
    queue.pump();
    queue.dispose();
    expect(calls).toEqual(["checkpoint", "admit", "accepted"]);
  });

});
