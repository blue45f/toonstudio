/**
 * Wave 50: 복합 매크로 원자 실행·자동 전량 롤백 및 1클릭 되돌리기 저널.
 *
 * - 실행 전 상태 해시와 변경 스텝 델타를 단일 스냅샷 그룹(`MacroTransactionSnapshot`)으로 묶는다.
 * - 중간 단계 실패 시 앞선 변경을 전량 롤백(All-or-Nothing)해 실행 전 해시와 완전히 일치시키며,
 *   정상 완료된 복합 매크로는 `Ctrl+Z` 1회(`undoLastMacroTransaction`)로 원복한다.
 */

import type { CanvasLayerRole } from "./context-reactive-tool-orchestrator";
import type {
  AtmospherePresetKind,
  DynamicMacroPlan,
  DynamicMacroStep,
  LayerOwnerFilter,
  MacroPlanSource,
} from "./voice-and-pen-macro-compiler";

export const DEFAULT_MAX_MACRO_HISTORY = 50 as const;

export interface StudioCutMacroState {
  readonly cutNumber: number;
  readonly dialogueScalePercent: number;
  readonly whiteSpecCount: number;
  readonly lineartOvershootCount: number;
  readonly atmospherePreset: AtmospherePresetKind | "none";
  readonly rimBacklightIntensity: number;
  readonly brushRadiusPx: number;
}

export interface StudioLayerComparisonState {
  readonly enabled: boolean;
  readonly ownerFilter: LayerOwnerFilter;
  readonly layerRole: CanvasLayerRole | "all";
  readonly isolateOnly: boolean;
  readonly comparisonMode: "split_diff" | "toggle_blink";
}

export interface StudioMacroDocumentState {
  readonly revision: number;
  readonly activeCutNumber: number;
  readonly cuts: Readonly<Record<number, StudioCutMacroState>>;
  readonly layerComparison: StudioLayerComparisonState;
  readonly quickBalloonTags: readonly string[];
}

export type MacroStepDeltaStatus = "applied" | "failed" | "rolled_back";

export interface MacroStepDelta {
  readonly stepId: string;
  readonly order: number;
  readonly opcode: DynamicMacroStep["opcode"];
  readonly labelKo: string;
  readonly beforeStateHash: string;
  readonly afterStateHash: string;
  readonly changedFields: readonly string[];
  readonly status: MacroStepDeltaStatus;
  readonly errorMessageKo?: string;
}

export interface MacroTransactionSnapshot {
  readonly transactionId: string;
  readonly planId: string;
  readonly groupLabelKo: string;
  readonly source: MacroPlanSource;
  readonly executedAtMs: number;
  readonly preStateHash: string;
  readonly postStateHash: string;
  readonly preStateSnapshot: StudioMacroDocumentState;
  readonly postStateSnapshot: StudioMacroDocumentState;
  readonly stepDeltas: readonly MacroStepDelta[];
  readonly status: "committed" | "rolled_back";
  readonly failedStepIndex?: number;
  readonly failureReasonKo?: string;
}

export type MacroStepExecutor = (
  state: StudioMacroDocumentState,
  step: DynamicMacroStep,
  stepIndex: number,
) => StudioMacroDocumentState;

export interface ExecuteMacroOptions {
  readonly executedAtMs?: number;
  readonly stepExecutor?: MacroStepExecutor;
}

export interface MacroExecutionResult {
  readonly ok: boolean;
  readonly rolledBackAll: boolean;
  readonly stateRestoredExactly: boolean;
  readonly transaction: MacroTransactionSnapshot | null;
  readonly state: StudioMacroDocumentState;
  readonly currentStateHash: string;
  readonly messageKo: string;
}

export interface MacroUndoRedoResult {
  readonly ok: boolean;
  readonly restoredStateHash: string;
  readonly affectedStepCount: number;
  readonly groupLabelKo: string | null;
  readonly state: StudioMacroDocumentState;
  readonly messageKo: string;
}

/** 컷 단위 기본 매크로 상태를 생성한다. */
export function createDefaultCutMacroState(
  cutNumber: number,
  overrides: Partial<Omit<StudioCutMacroState, "cutNumber">> = {},
): StudioCutMacroState {
  return {
    cutNumber,
    dialogueScalePercent: overrides.dialogueScalePercent ?? 100,
    whiteSpecCount: overrides.whiteSpecCount ?? 14,
    lineartOvershootCount: overrides.lineartOvershootCount ?? 9,
    atmospherePreset: overrides.atmospherePreset ?? "none",
    rimBacklightIntensity: overrides.rimBacklightIntensity ?? 0,
    brushRadiusPx: overrides.brushRadiusPx ?? 12,
  };
}

/** 문서 초기 상태를 생성한다. */
export function createStudioMacroDocumentState(
  cutNumbers: readonly number[] = [1, 2, 3],
  activeCutNumber = 1,
): StudioMacroDocumentState {
  const cuts: Record<number, StudioCutMacroState> = {};
  for (const cutNumber of cutNumbers) cuts[cutNumber] = createDefaultCutMacroState(cutNumber);
  return {
    revision: 0,
    activeCutNumber,
    cuts,
    layerComparison: { enabled: false, ownerFilter: "all", layerRole: "all", isolateOnly: false, comparisonMode: "split_diff" },
    quickBalloonTags: [],
  };
}

function cloneDocumentState(state: StudioMacroDocumentState): StudioMacroDocumentState {
  const clonedCuts: Record<number, StudioCutMacroState> = {};
  for (const key of Object.keys(state.cuts)) {
    const cutNum = Number(key);
    const cut = state.cuts[cutNum];
    if (cut) clonedCuts[cutNum] = { ...cut };
  }
  return {
    revision: state.revision,
    activeCutNumber: state.activeCutNumber,
    cuts: clonedCuts,
    layerComparison: { ...state.layerComparison },
    quickBalloonTags: [...state.quickBalloonTags],
  };
}

/** 문서 상태를 정규화 직렬화해 결정론적 FNV-1a 해시를 계산한다. */
export function computeDocumentStateHash(state: StudioMacroDocumentState): string {
  const sortedCuts = Object.keys(state.cuts)
    .map(Number)
    .sort((a, b) => a - b)
    .map((cutNum) => state.cuts[cutNum]);
  const canonical = JSON.stringify({
    revision: state.revision,
    activeCutNumber: state.activeCutNumber,
    cuts: sortedCuts,
    layerComparison: state.layerComparison,
    quickBalloonTags: state.quickBalloonTags,
  });
  let hash = 2166136261;
  for (let i = 0; i < canonical.length; i += 1) {
    hash ^= canonical.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function updateCuts(
  state: StudioMacroDocumentState,
  cutNumbers: readonly number[],
  updater: (cut: StudioCutMacroState) => StudioCutMacroState,
): StudioMacroDocumentState {
  const next = cloneDocumentState(state);
  const mutableCuts: Record<number, StudioCutMacroState> = { ...next.cuts };
  for (const cutNumber of cutNumbers) {
    mutableCuts[cutNumber] = updater(mutableCuts[cutNumber] ?? createDefaultCutMacroState(cutNumber));
  }
  return { ...next, cuts: mutableCuts };
}

/** 단일 매크로 스텝을 문서 상태에 순수 함수로 적용한다. */
export function applyDefaultDynamicMacroStep(
  state: StudioMacroDocumentState,
  step: DynamicMacroStep,
): StudioMacroDocumentState {
  switch (step.opcode) {
    case "apply_atmosphere_grade":
      return updateCuts(state, step.params.cutNumbers, (cut) => ({ ...cut, atmospherePreset: step.params.preset }));
    case "apply_rim_backlight":
      return updateCuts(state, step.params.cutNumbers, (cut) => ({
        ...cut,
        atmospherePreset: cut.atmospherePreset === "none" ? step.params.preset : cut.atmospherePreset,
        rimBacklightIntensity: Number(Math.min(1, Math.max(0, step.params.intensity)).toFixed(3)),
      }));
    case "scale_dialogue_text":
      return updateCuts(state, step.params.cutNumbers, (cut) => ({
        ...cut,
        dialogueScalePercent: Math.round(Math.max(40, Math.min(300, cut.dialogueScalePercent * step.params.scaleFactor))),
      }));
    case "fill_white_specs":
      return updateCuts(state, step.params.cutNumbers, (cut) => ({ ...cut, whiteSpecCount: 0 }));
    case "trim_lineart_overshoots":
      return updateCuts(state, step.params.cutNumbers, (cut) => ({ ...cut, lineartOvershootCount: 0 }));
    case "adjust_brush_radius":
      return updateCuts(state, step.params.cutNumbers, (cut) => ({
        ...cut,
        brushRadiusPx: Math.max(1, Math.min(200, cut.brushRadiusPx + step.params.deltaPx)),
      }));
    case "compare_filtered_layers":
      return {
        ...cloneDocumentState(state),
        layerComparison: {
          enabled: true,
          ownerFilter: step.params.ownerFilter,
          layerRole: step.params.layerRole,
          isolateOnly: step.params.isolateOnly,
          comparisonMode: step.params.comparisonMode,
        },
      };
    case "draft_quick_balloon": {
      const next = cloneDocumentState(state);
      return { ...next, quickBalloonTags: [...next.quickBalloonTags, step.params.labelTag] };
    }
  }
}

function collectChangedFields(before: StudioMacroDocumentState, after: StudioMacroDocumentState): readonly string[] {
  const changed: string[] = [];
  const allCuts = new Set([...Object.keys(before.cuts).map(Number), ...Object.keys(after.cuts).map(Number)]);
  for (const cutNum of [...allCuts].sort((a, b) => a - b)) {
    if (JSON.stringify(before.cuts[cutNum]) !== JSON.stringify(after.cuts[cutNum])) changed.push(`cuts.${cutNum}`);
  }
  if (JSON.stringify(before.layerComparison) !== JSON.stringify(after.layerComparison)) changed.push("layerComparison");
  if (JSON.stringify(before.quickBalloonTags) !== JSON.stringify(after.quickBalloonTags)) changed.push("quickBalloonTags");
  return changed;
}

/** 복합 매크로 원자 실행, 중간 실패 시 자동 전량 롤백, 1클릭 Ctrl+Z 원복을 보장하는 저널. */
export class AtomicMacroRollbackJournal {
  private currentState: StudioMacroDocumentState;
  private readonly undoStack: MacroTransactionSnapshot[] = [];
  private readonly redoStack: MacroTransactionSnapshot[] = [];
  private readonly rollbackAuditLog: MacroTransactionSnapshot[] = [];
  private readonly maxHistory: number;
  private txSequence = 0;

  public constructor(
    initialState: StudioMacroDocumentState = createStudioMacroDocumentState(),
    maxHistory: number = DEFAULT_MAX_MACRO_HISTORY,
  ) {
    this.currentState = cloneDocumentState(initialState);
    this.maxHistory = Math.max(1, Math.trunc(maxHistory));
  }

  public getCurrentState(): StudioMacroDocumentState {
    return cloneDocumentState(this.currentState);
  }

  public getCurrentStateHash(): string {
    return computeDocumentStateHash(this.currentState);
  }

  public getUndoStack(): readonly MacroTransactionSnapshot[] {
    return [...this.undoStack];
  }

  public getRedoStack(): readonly MacroTransactionSnapshot[] {
    return [...this.redoStack];
  }

  public getRollbackAuditLog(): readonly MacroTransactionSnapshot[] {
    return [...this.rollbackAuditLog];
  }

  public executeMacroPlan(plan: DynamicMacroPlan, options: ExecuteMacroOptions = {}): MacroExecutionResult {
    const executedAtMs = options.executedAtMs ?? 0;
    const executor = options.stepExecutor ?? applyDefaultDynamicMacroStep;

    if (!plan.isExecutable || plan.steps.length === 0) {
      return { ok: false, rolledBackAll: false, stateRestoredExactly: true, transaction: null, state: this.getCurrentState(), currentStateHash: this.getCurrentStateHash(), messageKo: "실행 가능한 단계가 없어 매크로를 건너뛰었습니다." };
    }

    const preStateSnapshot = cloneDocumentState(this.currentState);
    const preStateHash = computeDocumentStateHash(preStateSnapshot);
    const deltas: MacroStepDelta[] = [];
    let workingState = cloneDocumentState(preStateSnapshot);
    this.txSequence += 1;
    const transactionId = `macro-tx-${this.txSequence}`;

    for (let index = 0; index < plan.steps.length; index += 1) {
      const step = plan.steps[index];
      if (!step) continue;
      const beforeStepHash = computeDocumentStateHash(workingState);
      try {
        const nextWorkingState = executor(workingState, step, index);
        deltas.push({
          stepId: step.stepId,
          order: step.order,
          opcode: step.opcode,
          labelKo: step.labelKo,
          beforeStateHash: beforeStepHash,
          afterStateHash: computeDocumentStateHash(nextWorkingState),
          changedFields: collectChangedFields(workingState, nextWorkingState),
          status: "applied",
        });
        workingState = nextWorkingState;
      } catch (error) {
        const failureReasonKo = error instanceof Error ? error.message : "알 수 없는 단계 오류가 발생했습니다.";
        const rolledBackDeltas: MacroStepDelta[] = [
          ...deltas.map((delta): MacroStepDelta => ({ ...delta, status: "rolled_back" })),
          { stepId: step.stepId, order: step.order, opcode: step.opcode, labelKo: step.labelKo, beforeStateHash: beforeStepHash, afterStateHash: beforeStepHash, changedFields: [], status: "failed", errorMessageKo: failureReasonKo },
        ];
        this.currentState = cloneDocumentState(preStateSnapshot);
        const restoredHash = computeDocumentStateHash(this.currentState);
        const failedSnapshot: MacroTransactionSnapshot = {
          transactionId,
          planId: plan.planId,
          groupLabelKo: plan.atomicGroupLabelKo,
          source: plan.source,
          executedAtMs,
          preStateHash,
          postStateHash: restoredHash,
          preStateSnapshot,
          postStateSnapshot: cloneDocumentState(preStateSnapshot),
          stepDeltas: rolledBackDeltas,
          status: "rolled_back",
          failedStepIndex: index,
          failureReasonKo,
        };
        this.rollbackAuditLog.push(failedSnapshot);
        return {
          ok: false,
          rolledBackAll: true,
          stateRestoredExactly: restoredHash === preStateHash,
          transaction: failedSnapshot,
          state: this.getCurrentState(),
          currentStateHash: restoredHash,
          messageKo: `${step.order}단계(${step.labelKo}) 실패로 앞선 변경을 전량 롤백했습니다.`,
        };
      }
    }

    const committedState: StudioMacroDocumentState = { ...workingState, revision: preStateSnapshot.revision + 1 };
    const postStateHash = computeDocumentStateHash(committedState);
    const committedSnapshot: MacroTransactionSnapshot = {
      transactionId,
      planId: plan.planId,
      groupLabelKo: plan.atomicGroupLabelKo,
      source: plan.source,
      executedAtMs,
      preStateHash,
      postStateHash,
      preStateSnapshot,
      postStateSnapshot: cloneDocumentState(committedState),
      stepDeltas: deltas,
      status: "committed",
    };

    this.currentState = committedState;
    this.undoStack.push(committedSnapshot);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack.length = 0;

    return {
      ok: true,
      rolledBackAll: false,
      stateRestoredExactly: false,
      transaction: committedSnapshot,
      state: this.getCurrentState(),
      currentStateHash: postStateHash,
      messageKo: `${plan.summaryKo} (${plan.steps.length}단계를 1개 되돌리기 그룹으로 완료)`,
    };
  }

  /** 마지막 복합 매크로 그룹 전체를 단일 `Ctrl+Z` 동작으로 원복한다. */
  public undoLastMacroTransaction(): MacroUndoRedoResult {
    const latest = this.undoStack.pop();
    if (!latest) {
      return { ok: false, restoredStateHash: this.getCurrentStateHash(), affectedStepCount: 0, groupLabelKo: null, state: this.getCurrentState(), messageKo: "되돌릴 매크로 이력이 없습니다." };
    }
    this.currentState = cloneDocumentState(latest.preStateSnapshot);
    const restoredStateHash = computeDocumentStateHash(this.currentState);
    this.redoStack.push(latest);
    return { ok: restoredStateHash === latest.preStateHash, restoredStateHash, affectedStepCount: latest.stepDeltas.length, groupLabelKo: latest.groupLabelKo, state: this.getCurrentState(), messageKo: `${latest.groupLabelKo} ${latest.stepDeltas.length}단계를 한 번에 되돌렸습니다.` };
  }

  /** 되돌린 복합 매크로 그룹 전체를 단일 `Ctrl+Shift+Z` 동작으로 다시 적용한다. */
  public redoLastMacroTransaction(): MacroUndoRedoResult {
    const next = this.redoStack.pop();
    if (!next) {
      return { ok: false, restoredStateHash: this.getCurrentStateHash(), affectedStepCount: 0, groupLabelKo: null, state: this.getCurrentState(), messageKo: "다시 실행할 매크로 이력이 없습니다." };
    }
    this.currentState = cloneDocumentState(next.postStateSnapshot);
    const restoredStateHash = computeDocumentStateHash(this.currentState);
    this.undoStack.push(next);
    return { ok: restoredStateHash === next.postStateHash, restoredStateHash, affectedStepCount: next.stepDeltas.length, groupLabelKo: next.groupLabelKo, state: this.getCurrentState(), messageKo: `${next.groupLabelKo} ${next.stepDeltas.length}단계를 다시 적용했습니다.` };
  }
}
