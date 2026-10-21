/**
 * C1 [P0] 동시 드로잉 — 과제 수준 2클라이언트 동기화 시나리오 (로컬 검증 전용 추가).
 *
 * 기존 스위트와의 역할 분담:
 * - `studio-crdt-convergence.property.test.ts`(F-754)는 무작위 프로퍼티·룸 바인딩·아웃박스를 본다.
 * - `merge/stroke-merge-convergence.test.ts`는 무작위 인터리빙 시뮬레이션을 본다.
 * - 이 파일은 결정적 시나리오로 "두 클라이언트가 같은 문서에 각자 스트로크를 적용 →
 *   병합 → 수렴 일치 → 재접속(새 인스턴스) 후 상태 복원"을 단계별로 고정한다.
 *   라이브 2계정 운영 검증이 아니라 로컬 문서·병합 계층만의 검증이다.
 */

import { describe, expect, it } from "vitest";

import { foldOps, hashMergeState } from "./merge/stroke-merge-core";
import { StrokeMergeSequencer } from "./merge/stroke-merge-server";
import { StrokeMergeClient } from "./merge/stroke-merge-sync";
import type { StrokeInput } from "./merge/stroke-merge-types";
import {
  canonicalStudioCrdtProjection,
  setDeterministicStudioCrdtClientId,
} from "./studio-crdt-convergence-property-helper";
import {
  StudioCrdtDocument,
  type StudioCrdtDrawStrokePayload,
} from "./studio-crdt-document";

function payload(x: number, color: string): StudioCrdtDrawStrokePayload {
  return {
    version: 1,
    type: "draw",
    kind: "freehand",
    mode: "pen",
    points: [x, x, x + 1, x + 1],
    pressures: [0.4, 0.9],
    stroke: color,
    strokeWidth: 3,
  };
}

function addStroke(document: StudioCrdtDocument, id: string, x: number, color: string): void {
  document.addStroke({ id, pageId: "page-a", layerId: "page-root", payload: payload(x, color) });
}

/** 상태 벡터 차분 동기화: source가 target이 모르는 만큼만 보내 서로에게 적용한다. */
function syncBothWays(a: StudioCrdtDocument, b: StudioCrdtDocument): void {
  const aDiff = a.encodeStateAsUpdate(b.encodeStateVector());
  const bDiff = b.encodeStateAsUpdate(a.encodeStateVector());
  b.applyUpdate(aDiff);
  a.applyUpdate(bDiff);
}

describe("C1 시나리오 — CRDT 문서 2클라이언트 동기화", () => {
  it("같은 베이스에서 출발한 두 클라이언트가 각자 스트로크를 그으면 병합 후 투영이 일치한다", () => {
    const clientA = new StudioCrdtDocument();
    const clientB = new StudioCrdtDocument();
    setDeterministicStudioCrdtClientId(clientA, 0x0c1a_0001);
    setDeterministicStudioCrdtClientId(clientB, 0x0c1a_0002);
    try {
      // 공통 베이스: A가 첫 획을 그리고 B가 그 상태를 받아 같은 문서에서 시작한다.
      addStroke(clientA, "base-stroke", 1, "#111111");
      clientB.applyUpdate(clientA.encodeStateAsUpdate());
      expect(canonicalStudioCrdtProjection(clientB)).toBe(canonicalStudioCrdtProjection(clientA));

      // 동시(서로 모르는 상태) 편집: A와 B가 각자 다른 획을 추가하고, A는 남의 획을 지운다.
      addStroke(clientA, "stroke-from-a", 10, "#aa0000");
      addStroke(clientB, "stroke-from-b", 20, "#0000aa");
      clientB.deleteStroke("base-stroke");
      expect(canonicalStudioCrdtProjection(clientA)).not.toBe(canonicalStudioCrdtProjection(clientB));

      // 병합: 상태 벡터 차분만 교환해도 양쪽이 같은 상태로 수렴한다.
      syncBothWays(clientA, clientB);
      const expected = canonicalStudioCrdtProjection(clientA);
      expect(canonicalStudioCrdtProjection(clientB)).toBe(expected);

      const strokesA = clientA.getStrokes({ includeDeleted: true });
      expect(strokesA.map((stroke) => stroke.id).sort()).toEqual([
        "base-stroke",
        "stroke-from-a",
        "stroke-from-b",
      ]);
      expect(strokesA.find((stroke) => stroke.id === "base-stroke")?.deleted).toBe(true);
      expect(clientB.getStroke("stroke-from-a")).not.toBeNull();
      expect(clientA.getStroke("stroke-from-b")).not.toBeNull();

      // 멱등성: 같은 업데이트를 다시 적용해도 상태는 변하지 않는다.
      const again = clientA.encodeStateAsUpdate();
      clientB.applyUpdate(again);
      clientB.applyUpdate(again);
      expect(canonicalStudioCrdtProjection(clientB)).toBe(expected);
    } finally {
      clientA.destroy();
      clientB.destroy();
    }
  });

  it("재접속 복원: 전체 상태를 새 문서 인스턴스에 실으면 투영이 같고, 복원본의 새 획도 다시 수렴한다", () => {
    const original = new StudioCrdtDocument();
    const peer = new StudioCrdtDocument();
    setDeterministicStudioCrdtClientId(original, 0x0c1b_0001);
    setDeterministicStudioCrdtClientId(peer, 0x0c1b_0002);
    let restored: StudioCrdtDocument | null = null;
    try {
      addStroke(original, "keep-1", 3, "#123456");
      addStroke(original, "keep-2", 4, "#654321");
      original.deleteStroke("keep-2");
      syncBothWays(original, peer);

      // 재접속/새로고침에 해당: 직렬화된 전체 상태로 새 인스턴스를 만든다.
      restored = new StudioCrdtDocument(original.encodeStateAsUpdate());
      expect(canonicalStudioCrdtProjection(restored)).toBe(canonicalStudioCrdtProjection(original));
      expect(restored.getStrokes({ includeDeleted: true })).toHaveLength(2);
      expect(restored.getStroke("keep-2", true)?.deleted).toBe(true);

      // 복원된 클라이언트가 이어서 그린 획이 기존 피어에도 전파돼 다시 수렴한다.
      addStroke(restored, "after-restore", 30, "#047857");
      peer.applyUpdate(restored.encodeStateAsUpdate(peer.encodeStateVector()));
      original.applyUpdate(restored.encodeStateAsUpdate(original.encodeStateVector()));
      expect(canonicalStudioCrdtProjection(peer)).toBe(canonicalStudioCrdtProjection(restored));
      expect(canonicalStudioCrdtProjection(original)).toBe(canonicalStudioCrdtProjection(restored));
    } finally {
      original.destroy();
      peer.destroy();
      restored?.destroy();
    }
  });
});

function mergeStrokeInput(id: string, x: number): StrokeInput {
  return {
    id,
    pageId: "page-a",
    layerId: "layer-1",
    payload: {
      version: 1,
      type: "draw",
      kind: "pen",
      mode: "pen",
      stroke: "#222222",
      strokeWidth: 3,
      points: [x, x, x + 1, x + 1],
    },
  };
}

/** 서버 확정분을 역순+중복으로 흘려보낸다. 간격이 남으면 since()로 메운다. */
function deliverShuffledWithDuplicates(
  server: StrokeMergeSequencer,
  client: StrokeMergeClient,
  ops: readonly ReturnType<StrokeMergeSequencer["submit"]>["op"][],
): void {
  const reversed = [...ops].reverse();
  for (const op of reversed) {
    client.receive(op);
    client.receive(op); // 중복 전달 — seq로 걸러져야 한다
  }
  for (const op of server.since(client.lastSeq)) client.receive(op);
}

describe("C1 시나리오 — 스트로크 병합 계층 2클라이언트 + 오프라인 재접속", () => {
  it("동시 제출·역순/중복 전달 뒤 두 클라이언트와 서버의 해시가 일치하고, 오프라인 클라이언트도 catch-up으로 수렴한다", () => {
    const server = new StrokeMergeSequencer({ snapshotDepth: 2 });
    const clientA = new StrokeMergeClient("actor-a");
    const clientB = new StrokeMergeClient("actor-b");

    // 1) 동시 제출: A와 B가 서로의 획을 모른 채 같은 페이지·레이어에 획을 만든다.
    const a1 = clientA.createOp({ kind: "add", stroke: mergeStrokeInput("a-1", 1), beforeStrokeId: null });
    const b1 = clientB.createOp({ kind: "add", stroke: mergeStrokeInput("b-1", 2), beforeStrokeId: null });
    const sequenced: ReturnType<StrokeMergeSequencer["submit"]>["op"][] = [];
    for (const op of clientA.outbox()) sequenced.push(server.submit(op).op);
    for (const op of clientB.outbox()) sequenced.push(server.submit(op).op);
    expect(server.lastSeq).toBe(2);
    expect(server.verifyIncrementalState()).toBe(true);

    deliverShuffledWithDuplicates(server, clientA, sequenced);
    deliverShuffledWithDuplicates(server, clientB, sequenced);

    const serverHash = hashMergeState(foldOps(server.since(0)));
    expect(clientA.pendingCount).toBe(0);
    expect(clientB.pendingCount).toBe(0);
    expect(hashMergeState(clientA.authoritativeState())).toBe(serverHash);
    expect(hashMergeState(clientB.authoritativeState())).toBe(serverHash);
    expect(hashMergeState(clientA.state)).toBe(serverHash);

    // 2) B가 오프라인인 동안 A가 3건을 더 확정한다 (snapshotDepth=2보다 많이 뒤처짐).
    clientB.createOp({ kind: "add", stroke: mergeStrokeInput("b-offline", 9), beforeStrokeId: null });
    expect(clientB.pendingCount).toBe(1); // 오프라인 획은 pending에 남아 있다
    const aMore: ReturnType<StrokeMergeSequencer["submit"]>["op"][] = [];
    for (const id of ["a-2", "a-3", "a-4"]) {
      const op = clientA.createOp({ kind: "add", stroke: mergeStrokeInput(id, 5), beforeStrokeId: null });
      void op;
    }
    for (const op of clientA.outbox()) aMore.push(server.submit(op).op);
    for (const op of aMore) clientA.receive(op);
    expect(clientA.lastSeq).toBe(server.lastSeq);

    // 3) B 재접속: syncFor가 스냅샷 경로를 주고, 스냅샷 채택 후 자기 pending을 재제출한다.
    const plan = server.syncFor(clientB.lastSeq);
    expect(plan.snapshot).toBeDefined();
    const covered = new Set(
      server.since(0).filter((op) => op.seq <= plan.snapshot!.seq).map((op) => op.opId),
    );
    clientB.adoptSnapshot(plan.snapshot!, covered);
    for (const op of plan.ops) clientB.receive(op);
    // 스냅샷에 없는 내 오프라인 획만 재제출한다 (서버 dedupe가 이중 반영을 막는다).
    const resubmitted = clientB.outbox().map((op) => server.submit(op).op);
    for (const op of resubmitted) {
      clientB.receive(op);
      clientA.receive(op);
    }
    for (const op of server.since(clientB.lastSeq)) clientB.receive(op);
    for (const op of server.since(clientA.lastSeq)) clientA.receive(op);

    const finalHash = hashMergeState(foldOps(server.since(0)));
    expect(server.verifyIncrementalState()).toBe(true);
    expect(clientB.pendingCount).toBe(0);
    expect(clientB.lastSeq).toBe(server.lastSeq);
    expect(hashMergeState(clientB.authoritativeState())).toBe(finalHash);
    expect(hashMergeState(clientA.authoritativeState())).toBe(finalHash);
    expect(clientA.state.strokes.get("b-offline")?.deleted).toBe(false);
    expect(clientB.state.strokes.size).toBe(6);
    void a1;
    void b1;
  });
});
