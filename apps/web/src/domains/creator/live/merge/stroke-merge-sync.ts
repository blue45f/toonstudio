/**
 * 실시간 동시 드로잉 병합 엔진 — 클라이언트 세션.
 *
 * 상태 구성: `snapshotState(스냅샷 기준점) + base(확정 로그) + pending(내 미확정 op)`.
 * 화면 상태는 항상 이 셋을 접은 값이다(낙관 적용). 확정 op가 도착하면 base로 옮겨
 * 다시 접으므로, 서버가 내 op 순서를 바꿔 배열했어도 권위 순서로 조정된다.
 *
 * 수신 규칙:
 * - seq <= lastSeq: 중복 — 버린다.
 * - seq == lastSeq + 1: 확정 — base에 넣고, 버퍼를 이어 비운다. 내 op면 pending에서 제거(ack).
 * - seq > lastSeq + 1: 간격 — 버퍼에 넣고 catch-up이 필요하다고 표시한다.
 * 재접속 규칙: 먼저 syncFor(lastSeq)로 누락분을 받고, 그 뒤에도 pending에 남은
 * 내 op(서버가 못 본 것)만 재제출한다. 서버 dedupe(opId)가 이중 반영을 막는다.
 */

import {
  applyOpToState,
  cloneMergeState,
  createMergeState,
  foldOps,
  type MergeState,
} from "./stroke-merge-core";
import { stateFromSnapshot } from "./stroke-merge-server";
import type {
  MergeSnapshot,
  SequencedStrokeOp,
  StrokeOp,
  StrokeOpBody,
} from "./stroke-merge-types";

export type ReceiveOutcome = "applied" | "duplicate" | "gap";

export class StrokeMergeClient {
  readonly actorId: string;
  private counter = 0;
  private lamport = 0;
  private snapshotState: MergeState = createMergeState();
  private snapshotSeq = 0;
  private base: SequencedStrokeOp[] = [];
  private pending: StrokeOp[] = [];
  private buffered = new Map<number, SequencedStrokeOp>();
  private view: MergeState = createMergeState();

  constructor(actorId: string) {
    this.actorId = actorId;
  }

  /** 마지막으로 확정 반영한 seq. */
  get lastSeq(): number {
    return this.snapshotSeq + this.base.length;
  }

  /** 아직 seq를 못 받은 내 op 수. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /** catch-up이 필요한 seq 간격이 있는가. */
  get hasGap(): boolean {
    return this.buffered.size > 0;
  }

  /** 현재 화면 상태 (기준점 + 확정 + 낙관). */
  get state(): MergeState {
    return this.view;
  }

  /** 확정분만 접은 상태 (권위 상태 — 수렴 비교용). */
  authoritativeState(): MergeState {
    const state = cloneMergeState(this.snapshotState);
    for (const op of this.base) applyOpToState(state, op);
    return state;
  }

  /**
   * 내 op를 만든다. 본문만 주면 봉투(opId·lamport·baseSeq)를 채우고
   * 낙관 적용 + 전송 대기열(outbox = pending)에 넣는다.
   */
  createOp(body: StrokeOpBody): StrokeOp {
    this.counter += 1;
    this.lamport += 1;
    const op: StrokeOp = {
      opId: `${this.actorId}:${this.counter}`,
      actorId: this.actorId,
      lamport: this.lamport,
      baseSeq: this.lastSeq,
      body,
    };
    this.pending.push(op);
    this.refold();
    return op;
  }

  /** 아직 서버에 못 보낸(또는 ack가 유실된) 내 op 전부. 전송층이 꺼내 보낸다. */
  outbox(): StrokeOp[] {
    return [...this.pending];
  }

  /** 확정 op 수신. 브로드캐스트와 catch-up 응답이 같은 길을 쓴다. */
  receive(op: SequencedStrokeOp): ReceiveOutcome {
    this.lamport = Math.max(this.lamport, op.lamport);
    if (op.seq <= this.lastSeq) {
      // 이미 반영된 seq라도, ack 유실로 pending에 남은 내 op이면 여기서 정리한다
      // (재제출 dedupe 응답·스냅샷 이후 재동기화가 이 경로로 들어온다).
      const pendingIndex = this.pending.findIndex((p) => p.opId === op.opId);
      if (pendingIndex >= 0) {
        this.pending.splice(pendingIndex, 1);
        this.refold();
      }
      return "duplicate";
    }
    if (op.seq > this.lastSeq + 1) {
      this.buffered.set(op.seq, op);
      return "gap";
    }
    this.acceptSequenced(op);
    // 버퍼에 이어지는 seq가 있으면 연속으로 비운다.
    for (;;) {
      const next = this.buffered.get(this.lastSeq + 1);
      if (!next) break;
      this.buffered.delete(next.seq);
      this.acceptSequenced(next);
    }
    this.refold();
    return "applied";
  }

  /**
   * 스냅샷 채택. 스냅샷 seq보다 확정된 것은 버리고, 그보다 큰 seq의
   * 버퍼·확정분은 유지한다. pending 중 스냅샷에 이미 반영된 내 op는 제거한다.
   */
  adoptSnapshot(snapshot: MergeSnapshot, snapshotOpIds: ReadonlySet<string>): void {
    if (snapshot.seq < this.lastSeq) return; // 나보다 뒤처진 스냅샷은 무시
    this.snapshotState = stateFromSnapshot(snapshot);
    this.snapshotSeq = snapshot.seq;
    this.base = this.base.filter((op) => op.seq > snapshot.seq);
    for (const seq of [...this.buffered.keys()]) {
      if (seq <= snapshot.seq) this.buffered.delete(seq);
    }
    // 스냅샷보다 큰 seq로 버퍼에 있던 op는 연속되는 만큼 바로 확정으로 잇는다.
    for (;;) {
      const next = this.buffered.get(this.lastSeq + 1);
      if (!next) break;
      this.buffered.delete(next.seq);
      this.acceptSequenced(next);
    }
    this.pending = this.pending.filter((op) => !snapshotOpIds.has(op.opId));
    this.refold();
  }

  private acceptSequenced(op: SequencedStrokeOp): void {
    this.base.push(op);
    const pendingIndex = this.pending.findIndex((p) => p.opId === op.opId);
    if (pendingIndex >= 0) this.pending.splice(pendingIndex, 1);
  }

  private refold(): void {
    const state = cloneMergeState(this.snapshotState);
    for (const op of this.base) applyOpToState(state, op);
    for (const op of this.pending) applyOpToState(state, op);
    this.view = state;
  }
}

/** foldOps 재노출 (테스트·도구용). */
export { foldOps };
