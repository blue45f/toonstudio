/**
 * 툰스튜디오 패널 편집 가역 명령(Reversible Command) 정의 및 순수 실행기.
 *
 * 지원 명령:
 * 1. `panel.add`       — 지정 인덱스(또는 맨 뒤)에 새 패널 추가 (역명령: 해당 패널 삭제)
 * 2. `panel.remove`    — 지정 ID 의 패널 삭제 (역명령: 원래 인덱스 및 전체 데이터로 복원)
 * 3. `panel.reorder`   — 인덱스 이동(`fromIndex -> toIndex`) 또는 전체 `panelIds` 순열 재정렬
 *                        (역명령: 이전 패널 순서 순열로 정확히 복원)
 * 4. `panel.edit-text` — 단일 필드(`field` + `nextValue`) 또는 다중 필드(`patch`) 텍스트 수정
 *                        (역명령: 수정 이전 텍스트 상태로 정확히 복원)
 */

import {
  ToonCommandHistoryError,
  VALID_TEXT_FIELDS,
  deepFreezeClone,
  isValidPanelId,
  normalizeVirtualPanelDraft,
  reindexVirtualPanels,
} from "./virtual-panel-model.ts";

import type {
  VirtualPanel,
  VirtualPanelBoardState,
  VirtualPanelDraftInput,
  VirtualPanelTextContent,
  VirtualPanelTextField,
} from "./virtual-panel-model.ts";

export interface AddPanelCommand {
  readonly type: "panel.add";
  readonly panel: VirtualPanelDraftInput;
  /** 삽입할 0-based 위치. 생략하면 맨 끝(`panels.length`)에 추가한다. */
  readonly index?: number;
  readonly label?: string;
}

export interface RemovePanelCommand {
  readonly type: "panel.remove";
  readonly panelId: string;
  readonly label?: string;
}

export type ReorderPanelCommand =
  | {
      readonly type: "panel.reorder";
      readonly mode: "move-index";
      readonly fromIndex: number;
      readonly toIndex: number;
      readonly label?: string;
    }
  | {
      readonly type: "panel.reorder";
      readonly mode: "permutation";
      readonly panelIds: readonly string[];
      readonly label?: string;
    };

export type EditPanelTextCommand =
  | {
      readonly type: "panel.edit-text";
      readonly panelId: string;
      readonly field: VirtualPanelTextField;
      readonly nextValue: string;
      readonly label?: string;
    }
  | {
      readonly type: "panel.edit-text";
      readonly panelId: string;
      readonly patch: Partial<VirtualPanelTextContent>;
      readonly label?: string;
    };

export type PanelEditCommand =
  | AddPanelCommand
  | RemovePanelCommand
  | ReorderPanelCommand
  | EditPanelTextCommand;

/**
 * 실행 시점에 계산된 가역 명령 레코드.
 * 정방향(`forward`)과 역방향(`inverse`) 모두 결정론적으로 상태를 전이시킨다.
 */
export interface ReversibleAtomicStep {
  readonly kind: "atomic";
  readonly commandType: PanelEditCommand["type"];
  readonly label: string;
  readonly targetPanelIds: readonly string[];
  readonly forwardCommand: PanelEditCommand;
  readonly inverseCommand: PanelEditCommand;
  readonly beforeSnapshot: VirtualPanelBoardState;
  readonly afterSnapshot: VirtualPanelBoardState;
}

export interface ApplyPanelCommandResult {
  readonly nextState: VirtualPanelBoardState;
  readonly step: ReversibleAtomicStep;
}

function assertValidBoardState(state: VirtualPanelBoardState): void {
  if (!state || typeof state !== "object" || !Array.isArray(state.panels)) {
    throw new ToonCommandHistoryError(
      "INVALID_BOARD_SEED",
      "유효하지 않은 패널 보드 상태입니다.",
    );
  }
}

/**
 * 단일 패널 편집 명령을 검증하고 실행하여 다음 불변 상태와 가역 단계(`ReversibleAtomicStep`)를 반환한다.
 * 검증 실패 시 원본 `state` 는 전혀 수정되지 않으며 `ToonCommandHistoryError` 를 던진다.
 */
export function applyPanelEditCommand(
  state: VirtualPanelBoardState,
  command: PanelEditCommand,
): ApplyPanelCommandResult {
  assertValidBoardState(state);
  if (!command || typeof command !== "object" || typeof command.type !== "string") {
    throw new ToonCommandHistoryError(
      "INVALID_COMMAND_SHAPE",
      "명령은 유효한 type 문자열을 가진 객체여야 합니다.",
    );
  }

  switch (command.type) {
    case "panel.add":
      return applyAddPanel(state, command);
    case "panel.remove":
      return applyRemovePanel(state, command);
    case "panel.reorder":
      return applyReorderPanels(state, command);
    case "panel.edit-text":
      return applyEditPanelText(state, command);
    default: {
      const unknownType = (command as { readonly type?: unknown }).type;
      throw new ToonCommandHistoryError(
        "INVALID_COMMAND_SHAPE",
        `알 수 없는 패널 편집 명령 타입입니다: ${String(unknownType)}`,
        { type: unknownType },
      );
    }
  }
}

function applyAddPanel(
  state: VirtualPanelBoardState,
  command: AddPanelCommand,
): ApplyPanelCommandResult {
  const insertIndex = command.index ?? state.panels.length;
  if (
    typeof insertIndex !== "number" ||
    !Number.isSafeInteger(insertIndex) ||
    insertIndex < 0 ||
    insertIndex > state.panels.length
  ) {
    throw new ToonCommandHistoryError(
      "INDEX_OUT_OF_RANGE",
      `패널 추가 인덱스(${String(command.index)})가 허용 범위(0..${state.panels.length})를 벗어났습니다.`,
      { index: command.index, maxIndex: state.panels.length },
    );
  }

  const normalizedPanel = normalizeVirtualPanelDraft(command.panel, insertIndex);
  if (state.panels.some((existing) => existing.id === normalizedPanel.id)) {
    throw new ToonCommandHistoryError(
      "DUPLICATE_PANEL_ID",
      `이미 존재하는 패널 ID 입니다: ${normalizedPanel.id}`,
      { panelId: normalizedPanel.id },
    );
  }

  const nextPanels = [...state.panels];
  nextPanels.splice(insertIndex, 0, normalizedPanel);
  const reindexed = reindexVirtualPanels(nextPanels);

  const nextState: VirtualPanelBoardState = deepFreezeClone({
    ...state,
    revision: state.revision + 1,
    panels: reindexed,
  });

  const forwardCommand: AddPanelCommand = deepFreezeClone({
    type: "panel.add",
    index: insertIndex,
    panel: {
      id: normalizedPanel.id,
      kind: normalizedPanel.kind,
      text: normalizedPanel.text,
      characterTags: normalizedPanel.characterTags,
      estimatedHeightPx: normalizedPanel.estimatedHeightPx,
    },
    ...(command.label ? { label: command.label } : {}),
  });

  const inverseCommand: RemovePanelCommand = deepFreezeClone({
    type: "panel.remove",
    panelId: normalizedPanel.id,
    label: `패널 추가 취소 (${normalizedPanel.id})`,
  });

  return {
    nextState,
    step: deepFreezeClone({
      kind: "atomic",
      commandType: "panel.add",
      label: command.label ?? `패널 추가 (${normalizedPanel.id})`,
      targetPanelIds: [normalizedPanel.id],
      forwardCommand,
      inverseCommand,
      beforeSnapshot: state,
      afterSnapshot: nextState,
    }),
  };
}

function applyRemovePanel(
  state: VirtualPanelBoardState,
  command: RemovePanelCommand,
): ApplyPanelCommandResult {
  if (!isValidPanelId(command.panelId)) {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_ID",
      `삭제할 패널 ID 가 유효하지 않습니다: ${String(command.panelId)}`,
      { panelId: command.panelId },
    );
  }

  const targetIndex = state.panels.findIndex((panel) => panel.id === command.panelId);
  if (targetIndex === -1) {
    throw new ToonCommandHistoryError(
      "PANEL_NOT_FOUND",
      `삭제할 패널을 찾을 수 없습니다: ${command.panelId}`,
      { panelId: command.panelId },
    );
  }

  const removedPanel: VirtualPanel = state.panels[targetIndex]!;
  const remaining = state.panels.filter((panel) => panel.id !== command.panelId);
  const reindexed = reindexVirtualPanels(remaining);

  const nextState: VirtualPanelBoardState = deepFreezeClone({
    ...state,
    revision: state.revision + 1,
    panels: reindexed,
  });

  const forwardCommand: RemovePanelCommand = deepFreezeClone({
    type: "panel.remove",
    panelId: removedPanel.id,
    ...(command.label ? { label: command.label } : {}),
  });

  const inverseCommand: AddPanelCommand = deepFreezeClone({
    type: "panel.add",
    index: targetIndex,
    panel: {
      id: removedPanel.id,
      kind: removedPanel.kind,
      text: removedPanel.text,
      characterTags: removedPanel.characterTags,
      estimatedHeightPx: removedPanel.estimatedHeightPx,
    },
    label: `패널 삭제 복원 (${removedPanel.id})`,
  });

  return {
    nextState,
    step: deepFreezeClone({
      kind: "atomic",
      commandType: "panel.remove",
      label: command.label ?? `패널 삭제 (${removedPanel.id})`,
      targetPanelIds: [removedPanel.id],
      forwardCommand,
      inverseCommand,
      beforeSnapshot: state,
      afterSnapshot: nextState,
    }),
  };
}

function applyReorderPanels(
  state: VirtualPanelBoardState,
  command: ReorderPanelCommand,
): ApplyPanelCommandResult {
  const count = state.panels.length;
  const previousOrderIds = state.panels.map((panel) => panel.id);

  if (command.mode === "move-index") {
    const { fromIndex, toIndex } = command;
    if (
      typeof fromIndex !== "number" ||
      typeof toIndex !== "number" ||
      !Number.isSafeInteger(fromIndex) ||
      !Number.isSafeInteger(toIndex) ||
      fromIndex < 0 ||
      fromIndex >= count ||
      toIndex < 0 ||
      toIndex >= count
    ) {
      throw new ToonCommandHistoryError(
        "INDEX_OUT_OF_RANGE",
        `재정렬 인덱스(from=${String(fromIndex)}, to=${String(toIndex)})가 범위(0..${count - 1})를 벗어났습니다.`,
        { fromIndex, toIndex, panelCount: count },
      );
    }

    const working = [...state.panels];
    const [moved] = working.splice(fromIndex, 1);
    working.splice(toIndex, 0, moved!);
    const reindexed = reindexVirtualPanels(working);

    const nextState: VirtualPanelBoardState = deepFreezeClone({
      ...state,
      revision: state.revision + 1,
      panels: reindexed,
    });

    const forwardCommand: ReorderPanelCommand = deepFreezeClone({
      type: "panel.reorder",
      mode: "move-index",
      fromIndex,
      toIndex,
      ...(command.label ? { label: command.label } : {}),
    });

    const inverseCommand: ReorderPanelCommand = deepFreezeClone({
      type: "panel.reorder",
      mode: "move-index",
      fromIndex: toIndex,
      toIndex: fromIndex,
      label: `패널 순서 복원 (${moved!.id})`,
    });

    return {
      nextState,
      step: deepFreezeClone({
        kind: "atomic",
        commandType: "panel.reorder",
        label: command.label ?? `패널 순서 이동 (${moved!.id}: ${fromIndex} → ${toIndex})`,
        targetPanelIds: [moved!.id],
        forwardCommand,
        inverseCommand,
        beforeSnapshot: state,
        afterSnapshot: nextState,
      }),
    };
  }

  if (command.mode === "permutation") {
    if (!Array.isArray(command.panelIds)) {
      throw new ToonCommandHistoryError(
        "INVALID_REORDER_PERMUTATION",
        "재정렬 panelIds 는 배열이어야 합니다.",
      );
    }
    if (command.panelIds.length !== count) {
      throw new ToonCommandHistoryError(
        "INVALID_REORDER_PERMUTATION",
        `재정렬 panelIds 길이(${command.panelIds.length})가 현재 패널 수(${count})와 일치하지 않습니다.`,
        { expectedLength: count, actualLength: command.panelIds.length },
      );
    }

    const panelById = new Map<string, VirtualPanel>(
      state.panels.map((panel) => [panel.id, panel]),
    );
    const seen = new Set<string>();
    const reorderedPanels: VirtualPanel[] = [];

    for (const id of command.panelIds) {
      if (typeof id !== "string" || seen.has(id) || !panelById.has(id)) {
        throw new ToonCommandHistoryError(
          "INVALID_REORDER_PERMUTATION",
          "재정렬 panelIds 는 현재 보드 패널 ID 들의 정확한 1:1 순열이어야 합니다.",
          { invalidOrDuplicateId: id },
        );
      }
      seen.add(id);
      reorderedPanels.push(panelById.get(id)!);
    }

    const reindexed = reindexVirtualPanels(reorderedPanels);
    const nextState: VirtualPanelBoardState = deepFreezeClone({
      ...state,
      revision: state.revision + 1,
      panels: reindexed,
    });

    const forwardCommand: ReorderPanelCommand = deepFreezeClone({
      type: "panel.reorder",
      mode: "permutation",
      panelIds: [...command.panelIds],
      ...(command.label ? { label: command.label } : {}),
    });

    const inverseCommand: ReorderPanelCommand = deepFreezeClone({
      type: "panel.reorder",
      mode: "permutation",
      panelIds: previousOrderIds,
      label: "패널 순열 재정렬 복원",
    });

    return {
      nextState,
      step: deepFreezeClone({
        kind: "atomic",
        commandType: "panel.reorder",
        label: command.label ?? "패널 일괄 재정렬",
        targetPanelIds: [...command.panelIds],
        forwardCommand,
        inverseCommand,
        beforeSnapshot: state,
        afterSnapshot: nextState,
      }),
    };
  }

  throw new ToonCommandHistoryError(
    "INVALID_COMMAND_SHAPE",
    `지원하지 않는 재정렬 mode 입니다: ${String((command as { readonly mode?: unknown }).mode)}`,
  );
}

function applyEditPanelText(
  state: VirtualPanelBoardState,
  command: EditPanelTextCommand,
): ApplyPanelCommandResult {
  if (!isValidPanelId(command.panelId)) {
    throw new ToonCommandHistoryError(
      "INVALID_PANEL_ID",
      `텍스트를 수정할 패널 ID 가 유효하지 않습니다: ${String(command.panelId)}`,
      { panelId: command.panelId },
    );
  }

  const panelIndex = state.panels.findIndex((panel) => panel.id === command.panelId);
  if (panelIndex === -1) {
    throw new ToonCommandHistoryError(
      "PANEL_NOT_FOUND",
      `텍스트를 수정할 패널을 찾을 수 없습니다: ${command.panelId}`,
      { panelId: command.panelId },
    );
  }

  const targetPanel = state.panels[panelIndex]!;
  const previousPatch: Partial<Record<VirtualPanelTextField, string>> = {};
  const nextPatch: Partial<Record<VirtualPanelTextField, string>> = {};

  if ("field" in command) {
    if (!VALID_TEXT_FIELDS.has(command.field)) {
      throw new ToonCommandHistoryError(
        "INVALID_TEXT_FIELD",
        `유효하지 않은 텍스트 필드입니다: ${String(command.field)}`,
        { field: command.field },
      );
    }
    if (typeof command.nextValue !== "string") {
      throw new ToonCommandHistoryError(
        "INVALID_TEXT_VALUE",
        "수정할 텍스트 값(nextValue)은 문자열이어야 합니다.",
      );
    }
    previousPatch[command.field] = targetPanel.text[command.field];
    nextPatch[command.field] = command.nextValue;
  } else if ("patch" in command && command.patch && typeof command.patch === "object") {
    const keys = Object.keys(command.patch);
    if (keys.length === 0) {
      throw new ToonCommandHistoryError(
        "INVALID_TEXT_FIELD",
        "텍스트 수정 patch 객체에는 최소 1개 이상의 필드가 포함되어야 합니다.",
      );
    }
    for (const key of keys) {
      if (!VALID_TEXT_FIELDS.has(key as VirtualPanelTextField)) {
        throw new ToonCommandHistoryError(
          "INVALID_TEXT_FIELD",
          `유효하지 않은 텍스트 필드입니다: ${key}`,
          { field: key },
        );
      }
      const field = key as VirtualPanelTextField;
      const val = command.patch[field];
      if (typeof val !== "string") {
        throw new ToonCommandHistoryError(
          "INVALID_TEXT_VALUE",
          `텍스트 필드(${field})의 값은 문자열이어야 합니다.`,
          { field },
        );
      }
      previousPatch[field] = targetPanel.text[field];
      nextPatch[field] = val;
    }
  } else {
    throw new ToonCommandHistoryError(
      "INVALID_COMMAND_SHAPE",
      "panel.edit-text 명령은 (field, nextValue) 또는 patch 객체를 포함해야 합니다.",
    );
  }

  const updatedPanel: VirtualPanel = deepFreezeClone({
    ...targetPanel,
    text: {
      ...targetPanel.text,
      ...nextPatch,
    },
  });

  const nextPanels = state.panels.map((panel, idx) =>
    idx === panelIndex ? updatedPanel : panel,
  );

  const nextState: VirtualPanelBoardState = deepFreezeClone({
    ...state,
    revision: state.revision + 1,
    panels: nextPanels,
  });

  const forwardCommand: EditPanelTextCommand = deepFreezeClone({
    type: "panel.edit-text",
    panelId: targetPanel.id,
    patch: nextPatch,
    ...(command.label ? { label: command.label } : {}),
  });

  const inverseCommand: EditPanelTextCommand = deepFreezeClone({
    type: "panel.edit-text",
    panelId: targetPanel.id,
    patch: previousPatch,
    label: `패널 텍스트 복원 (${targetPanel.id})`,
  });

  return {
    nextState,
    step: deepFreezeClone({
      kind: "atomic",
      commandType: "panel.edit-text",
      label: command.label ?? `패널 텍스트 수정 (${targetPanel.id})`,
      targetPanelIds: [targetPanel.id],
      forwardCommand,
      inverseCommand,
      beforeSnapshot: state,
      afterSnapshot: nextState,
    }),
  };
}
