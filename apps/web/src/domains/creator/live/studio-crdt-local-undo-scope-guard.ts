/**
 * 실시간 협업 Yjs 로컬 스코프 UndoManager 무결성 가드 (AC-009).
 *
 * 원격 피어 편집이나 초기 동기화(hydration) 트랜잭션이 로컬 사용자의 `Cmd+Z` 스택을
 * 오염시키지 않도록 `LOCAL_USER_ORIGIN`만 추적하는 순수 스코프 필터와 계약 검증기를 제공한다.
 */

export const LOCAL_USER_ORIGIN = "toonstudio:local-user" as const;
export const REMOTE_PEER_ORIGIN = "toonstudio:remote-peer" as const;
export const SYNC_HYDRATION_ORIGIN = "toonstudio:sync-hydration" as const;

export type CrdtTransactionOrigin =
  | typeof LOCAL_USER_ORIGIN
  | typeof REMOTE_PEER_ORIGIN
  | typeof SYNC_HYDRATION_ORIGIN
  | string;

export interface CrdtTrackedOperation {
  readonly id: string;
  readonly origin: CrdtTransactionOrigin;
  readonly summaryKo: string;
  readonly timestampMs: number;
}

export function isLocalUndoableOrigin(origin: unknown): boolean {
  return origin === LOCAL_USER_ORIGIN;
}

/**
 * 로컬 사용자 origin 트랜잭션만 undo/redo 스택에 적재하는 결정적 스코프 컨트롤러.
 * 실제 Y.UndoManager 바인딩 전후의 불변식을 단위 테스트로 보장한다.
 */
export class ScopedLocalUndoHistory {
  private readonly undoStack: CrdtTrackedOperation[] = [];
  private readonly redoStack: CrdtTrackedOperation[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 200) {
    this.maxDepth = Math.max(1, maxDepth);
  }

  record(op: CrdtTrackedOperation): boolean {
    if (!isLocalUndoableOrigin(op.origin)) {
      return false;
    }
    this.undoStack.push(op);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    return true;
  }

  undo(): CrdtTrackedOperation | null {
    const op = this.undoStack.pop() ?? null;
    if (op) this.redoStack.push(op);
    return op;
  }

  redo(): CrdtTrackedOperation | null {
    const op = this.redoStack.pop() ?? null;
    if (op) this.undoStack.push(op);
    return op;
  }

  getUndoDepth(): number {
    return this.undoStack.length;
  }

  getRedoDepth(): number {
    return this.redoStack.length;
  }
}
