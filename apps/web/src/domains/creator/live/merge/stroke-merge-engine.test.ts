/**
 * 병합 엔진 의미론 단위 테스트.
 * 실행: vitest (로컬 검증 절차는 폴더 NOTES.md 참조).
 */

import { describe, expect, it } from "vitest";

import {
  foldOps,
  hashMergeState,
} from "./stroke-merge-core";
import { StrokeMergeSequencer } from "./stroke-merge-server";
import { StrokeMergeClient } from "./stroke-merge-sync";
import { StrokeUndoManager } from "./stroke-merge-undo";
import type {
  StrokeInput,
  StrokeOp,
  StrokeOpBody,
} from "./stroke-merge-types";

function strokeInput(id: string, width = 3, pageId = "p1", layerId = "l1"): StrokeInput {
  return {
    id,
    pageId,
    layerId,
    payload: {
      version: 1,
      type: "draw",
      kind: "pen",
      mode: "pen",
      stroke: "#111111",
      strokeWidth: width,
      points: [0, 0, 0.5, 0.5, 1, 1],
    },
  };
}

interface Rig {
  client: StrokeMergeClient;
  undo: StrokeUndoManager;
  act: (body: StrokeOpBody) => StrokeOp;
}

function makeClient(actorId: string): Rig {
  const client = new StrokeMergeClient(actorId);
  const undo = new StrokeUndoManager({
    state: () => client.state,
    submit: (body) => client.createOp(body),
  });
  const act = (body: StrokeOpBody) => {
    const op = client.createOp(body);
    undo.track(op);
    return op;
  };
  return { client, undo, act };
}

/** 전 클라이언트의 outbox를 서버로 보내고 확정분을 전원에게 방송하는 단순 동기화. */
function syncAll(server: StrokeMergeSequencer, rigs: Rig[]): void {
  for (let guard = 0; guard < 200; guard += 1) {
    let moved = false;
    for (const rig of rigs) {
      for (const op of rig.client.outbox()) {
        const result = server.submit(op);
        for (const target of rigs) target.client.receive(result.op);
        moved = true;
      }
    }
    for (const rig of rigs) {
      for (const op of server.since(rig.client.lastSeq)) rig.client.receive(op);
    }
    if (!moved && rigs.every((r) => r.client.pendingCount === 0)) return;
  }
  throw new Error("syncAll이 정지하지 않았습니다");
}

describe("코어 접기 — tombstone과 순서", () => {
  it("remove가 add보다 로그에서 먼저 접혀도 삭제가 이긴다 (자리표시 tombstone)", () => {
    const a = new StrokeMergeClient("a");
    const add = a.createOp({ kind: "add", stroke: strokeInput("s1") });
    const b = new StrokeMergeClient("b");
    const remove = b.createOp({ kind: "remove", strokeId: "s1" });
    const state = foldOps([remove, add]);
    const stroke = state.strokes.get("s1");
    expect(stroke?.deleted).toBe(true);
    expect(stroke?.placeholder).toBe(false);
    expect(stroke?.payload.points.length).toBe(6);
  });

  it("z-order는 beforeStrokeId 힌트를 총순서 접기로 결정한다", () => {
    const a = new StrokeMergeClient("a");
    const ops = [
      a.createOp({ kind: "add", stroke: strokeInput("s1") }),
      a.createOp({ kind: "add", stroke: strokeInput("s2") }),
      a.createOp({ kind: "add", stroke: strokeInput("s3"), beforeStrokeId: "s2" }),
    ];
    const state = foldOps(ops);
    expect(state.order.get("p1\u0000l1")).toEqual(["s1", "s3", "s2"]);
  });

  it("remove 뒤 restore는 payload와 순서를 그대로 되살린다", () => {
    const a = new StrokeMergeClient("a");
    const ops = [
      a.createOp({ kind: "add", stroke: strokeInput("s1", 7) }),
      a.createOp({ kind: "remove", strokeId: "s1" }),
      a.createOp({ kind: "restore", strokeId: "s1" }),
    ];
    const stroke = foldOps(ops).strokes.get("s1");
    expect(stroke?.deleted).toBe(false);
    expect(stroke?.payload.strokeWidth).toBe(7);
  });
});

describe("서버 총순서와 조정(reconcile)", () => {
  it("낙관 순서와 서버 순서가 다르면 서버 순서로 조정된다", () => {
    const server = new StrokeMergeSequencer();
    const rigA = makeClient("a");
    rigA.act({ kind: "add", stroke: strokeInput("s1", 3) });
    syncAll(server, [rigA]);

    const op1 = rigA.act({
      kind: "setProps",
      strokeId: "s1",
      patch: { set: { strokeWidth: 5 }, unset: [] },
      prev: { set: { strokeWidth: 3 }, unset: [] },
    });
    const op2 = rigA.act({
      kind: "setProps",
      strokeId: "s1",
      patch: { set: { strokeWidth: 9 }, unset: [] },
      prev: { set: { strokeWidth: 5 }, unset: [] },
    });
    // 낙관 상태는 내 제출 순서: 9
    expect(rigA.client.state.strokes.get("s1")?.payload.strokeWidth).toBe(9);

    // 서버에는 역순으로 도착한다 (네트워크 재배열).
    const seq2 = server.submit(op2).op;
    const seq1 = server.submit(op1).op;
    rigA.client.receive(seq2);
    rigA.client.receive(seq1);

    expect(rigA.client.pendingCount).toBe(0);
    // 권위 순서는 op2(9) 다음 op1(5) — 최종값은 5여야 한다.
    expect(rigA.client.state.strokes.get("s1")?.payload.strokeWidth).toBe(5);
    expect(hashMergeState(rigA.client.authoritativeState())).toBe(
      hashMergeState(server.foldedState),
    );
  });

  it("같은 op를 두 번 제출해도 seq는 하나만 부여된다", () => {
    const server = new StrokeMergeSequencer();
    const a = new StrokeMergeClient("a");
    const op = a.createOp({ kind: "add", stroke: strokeInput("s1") });
    const first = server.submit(op);
    const second = server.submit(op);
    expect(first.seq).toBe(second.seq);
    expect(second.duplicate).toBe(true);
    expect(server.lastSeq).toBe(1);
  });

  it("중복 수신과 순서 뒤바뀜(seq 간격 버퍼)을 견딘다", () => {
    const server = new StrokeMergeSequencer();
    const rigA = makeClient("a");
    const rigB = makeClient("b");
    rigA.act({ kind: "add", stroke: strokeInput("s1") });
    rigA.act({ kind: "add", stroke: strokeInput("s2") });
    rigA.act({ kind: "add", stroke: strokeInput("s3") });
    const sequenced = rigA.client.outbox().map((op) => server.submit(op).op);

    // B는 3번부터 거꾸로 받는다.
    expect(rigB.client.receive(sequenced[2])).toBe("gap");
    expect(rigB.client.state.strokes.size).toBe(0);
    expect(rigB.client.receive(sequenced[0])).toBe("applied");
    expect(rigB.client.receive(sequenced[0])).toBe("duplicate");
    expect(rigB.client.receive(sequenced[1])).toBe("applied"); // 버퍼의 3번이 이어서 확정
    expect(rigB.client.lastSeq).toBe(3);
    expect(hashMergeState(rigB.client.authoritativeState())).toBe(
      hashMergeState(server.foldedState),
    );
  });
});

describe("사용자별 undo", () => {
  it("내 undo는 내 스트로크만 지우고 남의 스트로크는 건드리지 않는다", () => {
    const server = new StrokeMergeSequencer();
    const rigA = makeClient("a");
    const rigB = makeClient("b");
    rigA.act({ kind: "add", stroke: strokeInput("a-s1") });
    rigB.act({ kind: "add", stroke: strokeInput("b-s1") });
    rigB.act({
      kind: "setProps",
      strokeId: "a-s1",
      patch: { set: { strokeWidth: 8 }, unset: [] },
      prev: { set: { strokeWidth: 3 }, unset: [] },
    });
    syncAll(server, [rigA, rigB]);

    rigA.undo.undo(); // A의 add 취소
    syncAll(server, [rigA, rigB]);

    const state = rigB.client.state;
    expect(state.strokes.get("a-s1")?.deleted).toBe(true);
    expect(state.strokes.get("b-s1")?.deleted).toBe(false);

    rigA.undo.redo(); // restore로 되살아난다 ( payload 보존 )
    syncAll(server, [rigA, rigB]);
    expect(rigB.client.state.strokes.get("a-s1")?.deleted).toBe(false);
    expect(rigB.client.state.strokes.get("a-s1")?.payload.strokeWidth).toBe(8);
  });

  it("속성 undo는 prev 값을 복원하고, 남이 지운 뒤의 속성 undo는 부활시키지 않는다", () => {
    const server = new StrokeMergeSequencer();
    const rigA = makeClient("a");
    const rigB = makeClient("b");
    rigA.act({ kind: "add", stroke: strokeInput("s1", 3) });
    syncAll(server, [rigA, rigB]);

    rigA.act({
      kind: "setProps",
      strokeId: "s1",
      patch: { set: { strokeWidth: 12 }, unset: [] },
      prev: { set: { strokeWidth: 3 }, unset: [] },
    });
    syncAll(server, [rigA, rigB]);
    rigA.undo.undo();
    syncAll(server, [rigA, rigB]);
    expect(rigB.client.state.strokes.get("s1")?.payload.strokeWidth).toBe(3);

    // B가 지운 뒤 A가 예전 transform을 undo해도 부활하지 않는다.
    rigA.act({
      kind: "transform",
      strokeId: "s1",
      transform: { dx: 0.1, dy: 0, scale: 1, rotation: 0 },
      prev: { dx: 0, dy: 0, scale: 1, rotation: 0 },
    });
    syncAll(server, [rigA, rigB]);
    rigB.act({ kind: "remove", strokeId: "s1" });
    syncAll(server, [rigA, rigB]);
    rigA.undo.undo();
    syncAll(server, [rigA, rigB]);
    expect(rigB.client.state.strokes.get("s1")?.deleted).toBe(true);
    expect(hashMergeState(rigA.client.state)).toBe(hashMergeState(rigB.client.state));
  });
});

describe("오프라인·재동기화·스냅샷", () => {
  it("오프라인 중 만든 op는 재접속 catch-up 뒤에도 하나도 잃지 않는다", () => {
    const server = new StrokeMergeSequencer();
    const rigA = makeClient("a");
    const rigB = makeClient("b");
    rigA.act({ kind: "add", stroke: strokeInput("s1") });
    syncAll(server, [rigA, rigB]);

    // B 오프라인: 두 개를 그리고, 그동안 A는 하나를 더 그린다.
    rigB.act({ kind: "add", stroke: strokeInput("b-off1") });
    rigB.act({ kind: "add", stroke: strokeInput("b-off2") });
    rigA.act({ kind: "add", stroke: strokeInput("a-live1") });
    syncAll(server, [rigA]);
    expect(rigB.client.pendingCount).toBe(2);

    // B 재접속: 내 op부터 제출(서버 dedupe)하고, 누락분은 since로 catch-up.
    for (const op of rigB.client.outbox()) {
      rigB.client.receive(server.submit(op).op);
    }
    for (const op of server.since(rigB.client.lastSeq)) rigB.client.receive(op);

    expect(rigB.client.pendingCount).toBe(0);
    expect(rigB.client.lastSeq).toBe(server.lastSeq);
    expect(rigB.client.state.strokes.get("b-off1")?.deleted).toBe(false);
    expect(rigB.client.state.strokes.get("b-off2")?.deleted).toBe(false);
    expect(hashMergeState(rigB.client.authoritativeState())).toBe(
      hashMergeState(server.foldedState),
    );
  });

  it("뒤늦게 합류한 클라이언트는 스냅샷으로 따라잡는다", () => {
    const server = new StrokeMergeSequencer({ snapshotDepth: 2 });
    const rigA = makeClient("a");
    for (const id of ["s1", "s2", "s3", "s4", "s5"]) {
      rigA.act({ kind: "add", stroke: strokeInput(id) });
    }
    syncAll(server, [rigA]);
    expect(server.lastSeq).toBe(5);

    const plan = server.syncFor(0);
    expect(plan.snapshot).toBeDefined();
    const late = new StrokeMergeClient("late");
    const covered = new Set(server.since(0).map((op) => op.opId));
    late.adoptSnapshot(plan.snapshot!, covered);
    expect(late.lastSeq).toBe(5);
    expect(hashMergeState(late.state)).toBe(hashMergeState(server.foldedState));

    // 스냅샷 이후의 신규 op도 이어서 수렴한다.
    rigA.act({ kind: "add", stroke: strokeInput("s6") });
    for (const op of rigA.client.outbox()) {
      const sequenced = server.submit(op).op;
      rigA.client.receive(sequenced);
      late.receive(sequenced);
    }
    expect(late.lastSeq).toBe(6);
    expect(hashMergeState(late.state)).toBe(hashMergeState(server.foldedState));
  });

  it("ack가 유실돼도 스냅샷 채택이 pending을 정리한다", () => {
    const server = new StrokeMergeSequencer();
    const rigA = makeClient("a");
    const op = rigA.act({ kind: "add", stroke: strokeInput("s1") });
    server.submit(op); // 서버는 받았지만 방송(ack)이 유실된 상황
    expect(rigA.client.pendingCount).toBe(1);

    const snapshot = server.snapshot();
    rigA.client.adoptSnapshot(snapshot, new Set([op.opId]));
    expect(rigA.client.pendingCount).toBe(0);
    expect(rigA.client.lastSeq).toBe(1);
    expect(hashMergeState(rigA.client.state)).toBe(hashMergeState(server.foldedState));
  });

  it("서버 증분 상태는 항상 로그 전체 접기와 같다", () => {
    const server = new StrokeMergeSequencer();
    const rigA = makeClient("a");
    const rigB = makeClient("b");
    rigA.act({ kind: "add", stroke: strokeInput("s1") });
    rigB.act({ kind: "add", stroke: strokeInput("s2") });
    rigA.act({ kind: "remove", strokeId: "s2" });
    rigB.act({ kind: "restore", strokeId: "s2" });
    syncAll(server, [rigA, rigB]);
    expect(server.verifyIncrementalState()).toBe(true);
    expect(server.foldedState.strokes.get("s2")?.deleted).toBe(false);
  });
});
