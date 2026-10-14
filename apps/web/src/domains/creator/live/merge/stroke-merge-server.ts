/**
 * 실시간 동시 드로잉 병합 엔진 — 서버 총순서(sequencer) 참조 구현.
 *
 * 전송·프레임워크 비의존 코어다. 프로덕션에서는 apps/api의 Socket.IO 게이트웨이
 * (`studio-live.gateway.ts`) 핸들러가 이 계약을 감싼다 — HOST_INSERTION_SPEC.md 참조.
 * 서버의 일은 네 가지뿐이다:
 *  1. 제출된 op에 총순서 seq를 부여한다 (단일 부여 지점 = 단일 순서).
 *  2. opId로 dedupe해 재제출을 멱등하게 받는다 (ack 유실 후 재시도 안전).
 *  3. 로그를 영속하고 since(seq)/snapshot으로 catch-up을 제공한다.
 *  4. 접힌 상태를 유지해 신규 접속자에게 스냅샷을 준다.
 * 서버는 스트로크 의미를 해석하지 않는다 — 순서만 정한다. 의미는 전 복제본이
 * 같은 코어(applyOpToState)로 접어 결정한다.
 */

import {
  applyOpToState,
  cloneMergeState,
  createMergeState,
  deserializeMergeState,
  foldOps,
  hashMergeState,
  serializeMergeState,
  type MergeState,
} from "./stroke-merge-core";
import type {
  MergeSnapshot,
  SequencedStrokeOp,
  StrokeOp,
} from "./stroke-merge-types";

export interface SubmitResult {
  seq: number;
  /** 이미 본 opId의 재제출이면 true. seq는 최초 부여값과 같다. */
  duplicate: boolean;
  op: SequencedStrokeOp;
}

export interface StrokeMergeServerOptions {
  /** 이 seq 깊이보다 뒤처진 접속자는 로그 대신 스냅샷부터 받는다. */
  snapshotDepth?: number;
}

const DEFAULT_SNAPSHOT_DEPTH = 500;

export class StrokeMergeSequencer {
  private readonly log: SequencedStrokeOp[] = [];
  private readonly seqByOpId = new Map<string, number>();
  private state: MergeState = createMergeState();
  private readonly snapshotDepth: number;

  constructor(options: StrokeMergeServerOptions = {}) {
    this.snapshotDepth = options.snapshotDepth ?? DEFAULT_SNAPSHOT_DEPTH;
  }

  get lastSeq(): number {
    return this.log.length;
  }

  get foldedState(): MergeState {
    return cloneMergeState(this.state);
  }

  /**
   * op를 받아 seq를 부여하고 로그·상태에 반영한다.
   * 같은 opId 재제출은 새 seq를 만들지 않고 최초 결과를 돌려준다.
   */
  submit(op: StrokeOp): SubmitResult {
    const existingSeq = this.seqByOpId.get(op.opId);
    if (existingSeq !== undefined) {
      const existing = this.log[existingSeq - 1];
      return { seq: existingSeq, duplicate: true, op: existing };
    }
    const sequenced: SequencedStrokeOp = { ...op, seq: this.log.length + 1 };
    this.log.push(sequenced);
    this.seqByOpId.set(op.opId, sequenced.seq);
    applyOpToState(this.state, sequenced);
    return { seq: sequenced.seq, duplicate: false, op: sequenced };
  }

  /** sinceSeq 이후의 확정 op 전부. 재접속 catch-up의 기본 경로. */
  since(sinceSeq: number): SequencedStrokeOp[] {
    if (sinceSeq >= this.log.length) return [];
    return this.log.slice(Math.max(0, sinceSeq));
  }

  /** 현재 확정 상태 스냅샷. */
  snapshot(): MergeSnapshot {
    return { seq: this.lastSeq, state: serializeMergeState(this.state) };
  }

  /**
   * 접속자 동기화 계획: 뒤처진 정도가 snapshotDepth 이내면 누락 op만,
   * 그 이상이면 스냅샷 + 그 이후 꼬리로 답한다.
   */
  syncFor(clientSeq: number): { snapshot?: MergeSnapshot; ops: SequencedStrokeOp[] } {
    if (clientSeq >= this.lastSeq) return { ops: [] };
    if (this.lastSeq - clientSeq <= this.snapshotDepth) {
      return { ops: this.since(clientSeq) };
    }
    const snapshot = this.snapshot();
    return { snapshot, ops: [] };
  }

  /** 검증용: 증분 상태가 로그 전체 접기와 같은지 (서버 내부 정합). */
  verifyIncrementalState(): boolean {
    const folded = foldOps(this.log);
    return hashMergeState(folded) === hashMergeState(this.state);
  }
}

/** 스냅샷을 받는 쪽 상태로 되돌린다 (클라이언트 catch-up 공용). */
export function stateFromSnapshot(snapshot: MergeSnapshot): MergeState {
  return deserializeMergeState(snapshot.state);
}
