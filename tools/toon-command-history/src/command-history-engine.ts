/**
 * 툰스튜디오 패널 편집 Undo/Redo 명령 히스토리 엔진 (`ToonPanelCommandHistoryEngine`).
 *
 * 핵심 책임:
 * - 추가(`panel.add`), 삭제(`panel.remove`), 재정렬(`panel.reorder`), 텍스트 수정(`panel.edit-text`) 가역 실행
 * - 트랜잭션 그룹핑(`beginTransaction` / `commitTransaction` / `rollbackTransaction` / `runTransaction`):
 *   여러 명령을 하나의 원자적 Undo/Redo 단위로 묶고, 실행 중 오류 또는 롤백 시 트랜잭션 시작 전 상태로 완벽히 복원
 * - Redo 초기화: Undo 이후 새로운 유효 명령(또는 유효 트랜잭션 커밋)이 실행되면 기존 Redo 스택을 즉시 초기화
 * - 히스토리 용량 제한(`maxHistoryCapacity`): 용량 초과 시 가장 오래된 Undo 엔트리부터 FIFO 방식으로 퇴출
 * - 불변 원본 보장: 초기 상태, 스냅샷, 히스토리 조회 반환값 모두 깊은 동결(`deepFreezeClone`)을 적용해 외부 변조 차단
 * - 잘못된 명령 방어: 유효하지 않은 명령이나 실패한 트랜잭션은 상태·히스토리·Redo 스택을 전혀 오염시키지 않음
 */

import { applyPanelEditCommand } from "./panel-commands.ts";
import { ToonCommandHistoryError, deepFreezeClone } from "./virtual-panel-model.ts";

import type {
  AddPanelCommand,
  EditPanelTextCommand,
  PanelEditCommand,
  RemovePanelCommand,
  ReorderPanelCommand,
  ReversibleAtomicStep,
} from "./panel-commands.ts";
import type {
  VirtualPanelBoardState,
  VirtualPanelDraftInput,
  VirtualPanelTextContent,
  VirtualPanelTextField,
} from "./virtual-panel-model.ts";

export const DEFAULT_HISTORY_CAPACITY = 100;

export interface HistoryTransactionRecord {
  readonly kind: "transaction";
  readonly id: string;
  readonly label: string;
  readonly steps: readonly ReversibleAtomicStep[];
  readonly beforeSnapshot: VirtualPanelBoardState;
  readonly afterSnapshot: VirtualPanelBoardState;
}

export interface HistoryAtomicRecord {
  readonly kind: "atomic";
  readonly id: string;
  readonly label: string;
  readonly step: ReversibleAtomicStep;
  readonly beforeSnapshot: VirtualPanelBoardState;
  readonly afterSnapshot: VirtualPanelBoardState;
}

export type HistoryRecord = HistoryAtomicRecord | HistoryTransactionRecord;

export interface HistoryEntrySummary {
  readonly id: string;
  readonly kind: "atomic" | "transaction";
  readonly label: string;
  readonly stepCount: number;
  readonly commandTypes: readonly PanelEditCommand["type"][];
  readonly targetPanelIds: readonly string[];
  readonly beforeRevision: number;
  readonly afterRevision: number;
}

export interface ToonCommandHistoryOptions {
  /** 최대 Undo 히스토리 보관 개수 (기본값: 100, 1 이상의 안전 정수). */
  readonly maxHistoryCapacity?: number;
}

export interface HistoryTransitionResult {
  readonly changed: boolean;
  readonly state: VirtualPanelBoardState;
  readonly entry: HistoryEntrySummary | null;
  readonly undoCount: number;
  readonly redoCount: number;
}

interface ActiveTransactionBuffer {
  readonly id: string;
  readonly label: string;
  readonly baseState: VirtualPanelBoardState;
  workingState: VirtualPanelBoardState;
  readonly steps: ReversibleAtomicStep[];
}

function summarizeRecord(record: HistoryRecord): HistoryEntrySummary {
  if (record.kind === "atomic") {
    return deepFreezeClone({
      id: record.id,
      kind: "atomic",
      label: record.label,
      stepCount: 1,
      commandTypes: [record.step.commandType],
      targetPanelIds: [...record.step.targetPanelIds],
      beforeRevision: record.beforeSnapshot.revision,
      afterRevision: record.afterSnapshot.revision,
    });
  }

  const commandTypes = record.steps.map((s) => s.commandType);
  const targetPanelIds = [
    ...new Set(record.steps.flatMap((s) => s.targetPanelIds)),
  ];
  return deepFreezeClone({
    id: record.id,
    kind: "transaction",
    label: record.label,
    stepCount: record.steps.length,
    commandTypes,
    targetPanelIds,
    beforeRevision: record.beforeSnapshot.revision,
    afterRevision: record.afterSnapshot.revision,
  });
}

function validateCapacity(capacity: number): number {
  if (
    typeof capacity !== "number" ||
    !Number.isSafeInteger(capacity) ||
    capacity < 1
  ) {
    throw new ToonCommandHistoryError(
      "INVALID_CAPACITY",
      `히스토리 용량(maxHistoryCapacity)은 1 이상의 정수여야 합니다: ${String(capacity)}`,
      { maxHistoryCapacity: capacity },
    );
  }
  return capacity;
}

export class ToonPanelCommandHistoryEngine {
  private readonly initialOriginState: VirtualPanelBoardState;
  private currentState: VirtualPanelBoardState;
  private maxCapacity: number;
  private readonly undoStack: HistoryRecord[] = [];
  private readonly redoStack: HistoryRecord[] = [];
  private activeTransaction: ActiveTransactionBuffer | null = null;
  private sequenceCounter = 0;
  private evictedCount = 0;

  constructor(
    initialState: VirtualPanelBoardState,
    options: ToonCommandHistoryOptions = {},
  ) {
    if (
      !initialState ||
      typeof initialState !== "object" ||
      typeof initialState.boardId !== "string" ||
      !Array.isArray(initialState.panels)
    ) {
      throw new ToonCommandHistoryError(
        "INVALID_BOARD_SEED",
        "엔진 초기화에는 유효한 VirtualPanelBoardState 가 필요합니다.",
      );
    }
    this.maxCapacity = validateCapacity(
      options.maxHistoryCapacity ?? DEFAULT_HISTORY_CAPACITY,
    );
    // 원본 객체를 깊게 복제 및 동결하여 외부 변경으로부터 완전히 격리한다.
    const frozenInitial = deepFreezeClone(initialState);
    this.initialOriginState = frozenInitial;
    this.currentState = frozenInitial;
  }

  /**
   * 엔진에 주입된 최초 원본 상태를 반환한다(불변).
   */
  getInitialState(): VirtualPanelBoardState {
    return this.initialOriginState;
  }

  /**
   * 현재 패널 보드 상태를 반환한다(트랜잭션 진행 중이면 트랜잭션 내부 작업 상태).
   */
  getState(): VirtualPanelBoardState {
    return this.activeTransaction
      ? this.activeTransaction.workingState
      : this.currentState;
  }

  /**
   * 마지막으로 확정(commit)된 보드 상태를 반환한다.
   */
  getCommittedState(): VirtualPanelBoardState {
    return this.currentState;
  }

  getCapacity(): number {
    return this.maxCapacity;
  }

  /**
   * 실행 중 히스토리 최대 용량을 동적으로 조정한다.
   * 기존 Undo 스택이 새 용량을 초과하면 가장 오래된 항목부터 즉시 퇴출한다.
   */
  setCapacity(nextCapacity: number): void {
    this.maxCapacity = validateCapacity(nextCapacity);
    this.enforceCapacity();
  }

  getUndoCount(): number {
    return this.undoStack.length;
  }

  getRedoCount(): number {
    return this.redoStack.length;
  }

  getEvictedCount(): number {
    return this.evictedCount;
  }

  canUndo(): boolean {
    return this.activeTransaction === null && this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.activeTransaction === null && this.redoStack.length > 0;
  }

  isTransactionActive(): boolean {
    return this.activeTransaction !== null;
  }

  getUndoHistory(): readonly HistoryEntrySummary[] {
    return deepFreezeClone(this.undoStack.map(summarizeRecord));
  }

  getRedoHistory(): readonly HistoryEntrySummary[] {
    return deepFreezeClone(
      [...this.redoStack].reverse().map(summarizeRecord),
    );
  }

  /**
   * 단일 패널 편집 명령을 실행한다.
   * - 트랜잭션 외부: 즉시 실행하여 Undo 스택에 적재하고 Redo 스택을 초기화한다.
   * - 트랜잭션 내부: 현재 열린 트랜잭션 버퍼에 단계를 누적한다(커밋 시점에 Redo 초기화 및 히스토리 적재).
   * - 잘못된 명령: 예외를 던지고 기존 상태와 Undo/Redo 스택을 완벽히 보존한다.
   */
  execute(command: PanelEditCommand): VirtualPanelBoardState {
    if (this.activeTransaction !== null) {
      const { nextState, step } = applyPanelEditCommand(
        this.activeTransaction.workingState,
        command,
      );
      this.activeTransaction.workingState = nextState;
      this.activeTransaction.steps.push(step);
      return nextState;
    }

    const { nextState, step } = applyPanelEditCommand(this.currentState, command);
    this.sequenceCounter += 1;
    const record: HistoryAtomicRecord = deepFreezeClone({
      kind: "atomic",
      id: `cmd-${this.sequenceCounter}`,
      label: step.label,
      step,
      beforeSnapshot: this.currentState,
      afterSnapshot: nextState,
    });

    this.currentState = nextState;
    // 새로운 유효 명령이 실행되면 Redo 분기는 즉시 폐기된다.
    this.redoStack.length = 0;
    this.undoStack.push(record);
    this.enforceCapacity();
    return this.currentState;
  }

  /**
   * 편의 메서드: 패널 추가
   */
  addPanel(
    panel: VirtualPanelDraftInput,
    options: { readonly index?: number; readonly label?: string } = {},
  ): VirtualPanelBoardState {
    const cmd: AddPanelCommand = {
      type: "panel.add",
      panel,
      ...(options.index !== undefined ? { index: options.index } : {}),
      ...(options.label !== undefined ? { label: options.label } : {}),
    };
    return this.execute(cmd);
  }

  /**
   * 편의 메서드: 패널 삭제
   */
  removePanel(
    panelId: string,
    options: { readonly label?: string } = {},
  ): VirtualPanelBoardState {
    const cmd: RemovePanelCommand = {
      type: "panel.remove",
      panelId,
      ...(options.label !== undefined ? { label: options.label } : {}),
    };
    return this.execute(cmd);
  }

  /**
   * 편의 메서드: 인덱스 기반 패널 이동 재정렬
   */
  movePanel(
    fromIndex: number,
    toIndex: number,
    options: { readonly label?: string } = {},
  ): VirtualPanelBoardState {
    const cmd: ReorderPanelCommand = {
      type: "panel.reorder",
      mode: "move-index",
      fromIndex,
      toIndex,
      ...(options.label !== undefined ? { label: options.label } : {}),
    };
    return this.execute(cmd);
  }

  /**
   * 편의 메서드: 패널 ID 순열 기반 일괄 재정렬
   */
  reorderPanels(
    panelIds: readonly string[],
    options: { readonly label?: string } = {},
  ): VirtualPanelBoardState {
    const cmd: ReorderPanelCommand = {
      type: "panel.reorder",
      mode: "permutation",
      panelIds,
      ...(options.label !== undefined ? { label: options.label } : {}),
    };
    return this.execute(cmd);
  }

  /**
   * 편의 메서드: 패널 텍스트 수정 (단일 필드 또는 다중 필드 패치)
   */
  editPanelText(
    panelId: string,
    fieldOrPatch: VirtualPanelTextField | Partial<VirtualPanelTextContent>,
    nextValueOrOptions?: string | { readonly label?: string },
    maybeOptions?: { readonly label?: string },
  ): VirtualPanelBoardState {
    if (typeof fieldOrPatch === "string") {
      const cmd: EditPanelTextCommand = {
        type: "panel.edit-text",
        panelId,
        field: fieldOrPatch,
        nextValue: nextValueOrOptions as string,
        ...(maybeOptions?.label !== undefined ? { label: maybeOptions.label } : {}),
      };
      return this.execute(cmd);
    }

    const opts =
      typeof nextValueOrOptions === "object" && nextValueOrOptions !== null
        ? nextValueOrOptions
        : undefined;
    const cmd: EditPanelTextCommand = {
      type: "panel.edit-text",
      panelId,
      patch: fieldOrPatch,
      ...(opts?.label !== undefined ? { label: opts.label } : {}),
    };
    return this.execute(cmd);
  }

  /**
   * 트랜잭션 그룹핑을 시작한다.
   * 이후 `commitTransaction()` 전까지 실행되는 모든 명령은 하나의 히스토리 엔트리로 묶인다.
   */
  beginTransaction(label = "패널 복합 편집 트랜잭션"): void {
    if (this.activeTransaction !== null) {
      throw new ToonCommandHistoryError(
        "TRANSACTION_ALREADY_ACTIVE",
        "이미 진행 중인 트랜잭션이 있습니다. 중첩 트랜잭션은 허용되지 않습니다.",
        { activeLabel: this.activeTransaction.label },
      );
    }
    if (typeof label !== "string" || label.trim() === "") {
      throw new ToonCommandHistoryError(
        "INVALID_COMMAND_SHAPE",
        "트랜잭션 레이블은 비어 있지 않은 문자열이어야 합니다.",
      );
    }
    this.sequenceCounter += 1;
    this.activeTransaction = {
      id: `tx-${this.sequenceCounter}`,
      label: label.trim(),
      baseState: this.currentState,
      workingState: this.currentState,
      steps: [],
    };
  }

  /**
   * 현재 열린 트랜잭션을 커밋하여 단일 Undo/Redo 항목으로 확정한다.
   * 트랜잭션 내부에서 실행된 명령이 0개이면(빈 트랜잭션) 히스토리나 Redo 스택을 건드리지 않고 종료한다.
   */
  commitTransaction(): HistoryEntrySummary | null {
    if (this.activeTransaction === null) {
      throw new ToonCommandHistoryError(
        "TRANSACTION_NOT_ACTIVE",
        "커밋할 활성 트랜잭션이 없습니다.",
      );
    }

    const tx = this.activeTransaction;
    this.activeTransaction = null;

    if (tx.steps.length === 0) {
      return null;
    }

    const record: HistoryTransactionRecord = deepFreezeClone({
      kind: "transaction",
      id: tx.id,
      label: tx.label,
      steps: tx.steps,
      beforeSnapshot: tx.baseState,
      afterSnapshot: tx.workingState,
    });

    this.currentState = tx.workingState;
    this.redoStack.length = 0;
    this.undoStack.push(record);
    this.enforceCapacity();

    return summarizeRecord(record);
  }

  /**
   * 현재 열린 트랜잭션을 취소하고 트랜잭션 시작 전 상태로 되돌린다.
   * 기존 Undo/Redo 스택은 전혀 변경되지 않는다.
   */
  rollbackTransaction(): VirtualPanelBoardState {
    if (this.activeTransaction === null) {
      throw new ToonCommandHistoryError(
        "TRANSACTION_NOT_ACTIVE",
        "롤백할 활성 트랜잭션이 없습니다.",
      );
    }
    const restored = this.activeTransaction.baseState;
    this.activeTransaction = null;
    this.currentState = restored;
    return this.currentState;
  }

  /**
   * 콜백 안에서 여러 명령을 하나의 트랜잭션으로 실행한다.
   * 콜백 실행 중 예외가 발생하면 자동으로 `rollbackTransaction()` 을 수행하여
   * 부분 적용된 변경을 모두 폐기하고 원래 예외를 다시 던진다.
   */
  runTransaction(
    label: string,
    work: (engine: ToonPanelCommandHistoryEngine) => void,
  ): HistoryEntrySummary | null {
    this.beginTransaction(label);
    try {
      work(this);
      return this.commitTransaction();
    } catch (error) {
      if (this.activeTransaction !== null) {
        this.rollbackTransaction();
      }
      throw error;
    }
  }

  /**
   * 직전 명령 또는 트랜잭션 그룹 전체를 역순으로 가역 실행하여 이전 상태로 되돌린다.
   */
  undo(): HistoryTransitionResult {
    if (this.activeTransaction !== null) {
      throw new ToonCommandHistoryError(
        "TRANSACTION_ALREADY_ACTIVE",
        "트랜잭션 진행 중에는 undo 를 호출할 수 없습니다. 먼저 commit 또는 rollback 하세요.",
      );
    }

    const record = this.undoStack.pop();
    if (!record) {
      return deepFreezeClone({
        changed: false,
        state: this.currentState,
        entry: null,
        undoCount: this.undoStack.length,
        redoCount: this.redoStack.length,
      });
    }

    if (record.kind === "atomic") {
      const { nextState } = applyPanelEditCommand(
        this.currentState,
        record.step.inverseCommand,
      );
      this.currentState = deepFreezeClone({
        ...nextState,
        revision: record.beforeSnapshot.revision,
      });
    } else {
      let working = this.currentState;
      for (let i = record.steps.length - 1; i >= 0; i -= 1) {
        const step = record.steps[i]!;
        working = applyPanelEditCommand(working, step.inverseCommand).nextState;
      }
      this.currentState = deepFreezeClone({
        ...working,
        revision: record.beforeSnapshot.revision,
      });
    }

    this.redoStack.push(record);

    return deepFreezeClone({
      changed: true,
      state: this.currentState,
      entry: summarizeRecord(record),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    });
  }

  /**
   * 방금 되돌린 명령 또는 트랜잭션 그룹 전체를 정방향으로 다시 실행한다.
   */
  redo(): HistoryTransitionResult {
    if (this.activeTransaction !== null) {
      throw new ToonCommandHistoryError(
        "TRANSACTION_ALREADY_ACTIVE",
        "트랜잭션 진행 중에는 redo 를 호출할 수 없습니다. 먼저 commit 또는 rollback 하세요.",
      );
    }

    const record = this.redoStack.pop();
    if (!record) {
      return deepFreezeClone({
        changed: false,
        state: this.currentState,
        entry: null,
        undoCount: this.undoStack.length,
        redoCount: this.redoStack.length,
      });
    }

    if (record.kind === "atomic") {
      const { nextState } = applyPanelEditCommand(
        this.currentState,
        record.step.forwardCommand,
      );
      this.currentState = deepFreezeClone({
        ...nextState,
        revision: record.afterSnapshot.revision,
      });
    } else {
      let working = this.currentState;
      for (let i = 0; i < record.steps.length; i += 1) {
        const step = record.steps[i]!;
        working = applyPanelEditCommand(working, step.forwardCommand).nextState;
      }
      this.currentState = deepFreezeClone({
        ...working,
        revision: record.afterSnapshot.revision,
      });
    }

    this.undoStack.push(record);
    this.enforceCapacity();

    return deepFreezeClone({
      changed: true,
      state: this.currentState,
      entry: summarizeRecord(record),
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
    });
  }

  /**
   * 히스토리(Undo/Redo 스택)를 비우고 현재 상태를 유지한다.
   */
  clearHistory(): void {
    if (this.activeTransaction !== null) {
      throw new ToonCommandHistoryError(
        "TRANSACTION_ALREADY_ACTIVE",
        "트랜잭션 진행 중에는 히스토리를 초기화할 수 없습니다.",
      );
    }
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }

  private enforceCapacity(): void {
    while (this.undoStack.length > this.maxCapacity) {
      this.undoStack.shift();
      this.evictedCount += 1;
    }
  }
}
