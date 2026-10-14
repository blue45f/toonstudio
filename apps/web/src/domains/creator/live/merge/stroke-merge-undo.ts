/**
 * 실시간 동시 드로잉 병합 엔진 — 사용자별 undo/redo.
 *
 * 원리: undo는 특별한 병합 경로가 아니라 "내 op의 역연산인 새 op"다.
 * 그래서 undo op도 총순서를 받아 전 복제본에 같은 순서로 적용되고,
 * 남의 스트로크는 구조적으로 건드릴 수 없다(역연산은 내 op의 대상·키만 되돌린다).
 *
 * 의미론 (정직하게 고정):
 * - add의 undo는 tombstone remove다. payload가 남으므로 redo는 restore로 되살린다.
 * - setProps/transform의 undo는 op에 실린 prev(내가 덮기 직전 값)를 복원한다.
 *   그 사이 다른 사용자가 같은 키를 바꿨다면, 내 undo가 그 키를 내 prev로 덮는다
 *   (키 단위 LWW — 총순서가 순서를 정하므로 전 복제본 판정은 같다).
 * - 대상이 남에 의해 삭제된 뒤의 속성 undo는 tombstone에 적용돼 no-op이 된다.
 *   삭제 자체를 되돌리는 것은 그 삭제를 한 사용자의 undo 몫이다.
 * - undo op가 아직 미확정(pending)인 원본보다 먼저 서버에 닿지 않도록,
 *   클라이언트→서버 경로는 사용자 단위 FIFO를 전제한다 (HOST_INSERTION_SPEC 참조).
 */

import {
  computePropsInverse,
  currentTransform,
  type MergeState,
} from "./stroke-merge-core";
import type {
  StrokeDrawPayload,
  StrokeOp,
  StrokeOpBody,
} from "./stroke-merge-types";

export interface UndoHost {
  state(): MergeState;
  /** op를 만들어 낙관 적용+대기열에 넣는 클라이언트 진입점. */
  submit(body: StrokeOpBody): StrokeOp;
}

const EMPTY_PAYLOAD: StrokeDrawPayload = {
  version: 1,
  type: "draw",
  kind: "pen",
  mode: "pen",
  stroke: "#000000",
  strokeWidth: 1,
  points: [],
};

export class StrokeUndoManager {
  private undoStack: StrokeOpBody[] = [];
  private redoStack: StrokeOpBody[] = [];

  constructor(private readonly host: UndoHost) {}

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  /** 사용자의 일반 op 제출 직후에 호출한다. 새 작업은 redo를 비운다. */
  track(op: StrokeOp): void {
    this.undoStack.push(op.body);
    this.redoStack = [];
  }

  /** 내 마지막 op를 되돌리는 새 op를 제출한다. 되돌릴 게 없으면 null. */
  undo(): StrokeOp | null {
    const forward = this.undoStack.pop();
    if (!forward) return null;
    const inverse = this.buildInverse(forward);
    if (!inverse) return null;
    const op = this.host.submit(inverse);
    this.redoStack.push(forward);
    return op;
  }

  /** 마지막으로 undo한 op를 다시 적용하는 새 op를 제출한다. */
  redo(): StrokeOp | null {
    const forward = this.redoStack.pop();
    if (!forward) return null;
    const reapplied = this.buildReapply(forward);
    if (!reapplied) return null;
    const op = this.host.submit(reapplied);
    this.undoStack.push(reapplied);
    return op;
  }

  private payloadOf(strokeId: string): StrokeDrawPayload {
    return this.host.state().strokes.get(strokeId)?.payload ?? EMPTY_PAYLOAD;
  }

  private buildInverse(forward: StrokeOpBody): StrokeOpBody | null {
    switch (forward.kind) {
      case "add":
        return { kind: "remove", strokeId: forward.stroke.id };
      case "remove":
        return { kind: "restore", strokeId: forward.strokeId };
      case "restore":
        return { kind: "remove", strokeId: forward.strokeId };
      case "transform":
        return {
          kind: "transform",
          strokeId: forward.strokeId,
          transform: forward.prev,
          prev: currentTransform(this.payloadOf(forward.strokeId)),
        };
      case "setProps":
        return {
          kind: "setProps",
          strokeId: forward.strokeId,
          patch: forward.prev,
          prev: computePropsInverse(this.payloadOf(forward.strokeId), forward.prev),
        };
    }
  }

  private buildReapply(forward: StrokeOpBody): StrokeOpBody | null {
    switch (forward.kind) {
      case "add": {
        const state = this.host.state().strokes.get(forward.stroke.id);
        if (!state) return { kind: "add", stroke: forward.stroke, beforeStrokeId: forward.beforeStrokeId ?? null };
        if (state.placeholder) return { kind: "add", stroke: forward.stroke, beforeStrokeId: forward.beforeStrokeId ?? null };
        if (state.deleted) return { kind: "restore", strokeId: forward.stroke.id };
        return null; // 이미 살아 있다 — 다시 할 일이 없다
      }
      case "remove":
        return { kind: "remove", strokeId: forward.strokeId };
      case "restore":
        return { kind: "restore", strokeId: forward.strokeId };
      case "transform":
        return {
          kind: "transform",
          strokeId: forward.strokeId,
          transform: forward.transform,
          prev: currentTransform(this.payloadOf(forward.strokeId)),
        };
      case "setProps":
        return {
          kind: "setProps",
          strokeId: forward.strokeId,
          patch: forward.patch,
          prev: computePropsInverse(this.payloadOf(forward.strokeId), forward.patch),
        };
    }
  }
}
