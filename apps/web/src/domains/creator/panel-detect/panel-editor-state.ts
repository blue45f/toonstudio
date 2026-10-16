/**
 * 컷 편집 화면의 상태 — 편집 이력(되돌리기/다시하기)과 선택·합치기 체크·도구·확대·안내 문구를 한 reducer 에 둔다.
 *
 * 컷 사각형 자체의 규칙은 panel-detect-edit 의 순수 함수가 맡고, 여기서는 "이력에 한 번 쌓는다 · 사라진 컷은 선택/체크에서
 * 뺀다" 같은 화면 상태 규칙만 다룬다. 화면은 문구를 만들어 action 에 실어 보내고(announce), reducer 는 저장만 한다.
 */

import {
  commitPanelEdit,
  createPanelEditHistory,
  redoPanelEdit,
  undoPanelEdit,
  type PanelEditHistory,
  type PanelEditState,
} from "./panel-detect-edit";

export type PanelEditTool = "select" | "draw" | "split-horizontal" | "split-vertical";

export const PANEL_ZOOM_STEPS = [1, 1.5, 2, 3] as const;

export interface PanelEditorState {
  readonly history: PanelEditHistory;
  readonly selectedId: string | null;
  /** 합치기 대상으로 체크한 컷 id(읽기 순서와 무관한 집합). */
  readonly checkedIds: readonly string[];
  readonly tool: PanelEditTool;
  readonly zoom: number;
  /** 화면 낭독용 마지막 작업 안내. */
  readonly announcement: string;
}

/** 편집 뒤 어떤 컷을 선택할지: id, null(선택 해제), undefined(그대로 유지). */
export type PanelEditSelect = (next: PanelEditState, previous: PanelEditState) => string | null | undefined;

export type PanelEditorAction =
  | { readonly type: "select"; readonly id: string | null }
  | { readonly type: "toggle-checked"; readonly id: string }
  | { readonly type: "clear-checked" }
  | { readonly type: "set-tool"; readonly tool: PanelEditTool }
  | { readonly type: "set-zoom"; readonly zoom: number }
  | { readonly type: "edit"; readonly apply: (state: PanelEditState) => PanelEditState; readonly announce?: string; readonly select?: PanelEditSelect }
  | { readonly type: "undo"; readonly announce?: string }
  | { readonly type: "redo"; readonly announce?: string };

export function createPanelEditorState(initial: PanelEditState): PanelEditorState {
  return { history: createPanelEditHistory(initial), selectedId: null, checkedIds: [], tool: "select", zoom: 1, announcement: "" };
}

/** 이력 현재 상태에 없는 컷은 선택·체크에서 뺀다. */
function pruned(state: PanelEditorState, history: PanelEditHistory, announcement: string): PanelEditorState {
  const alive = new Set(history.present.panels.map((panel) => panel.id));
  return {
    ...state,
    history,
    selectedId: state.selectedId !== null && alive.has(state.selectedId) ? state.selectedId : null,
    checkedIds: state.checkedIds.filter((id) => alive.has(id)),
    announcement,
  };
}

export function panelEditorReducer(state: PanelEditorState, action: PanelEditorAction): PanelEditorState {
  switch (action.type) {
    case "select":
      return state.selectedId === action.id ? state : { ...state, selectedId: action.id };
    case "toggle-checked":
      return {
        ...state,
        checkedIds: state.checkedIds.includes(action.id)
          ? state.checkedIds.filter((id) => id !== action.id)
          : [...state.checkedIds, action.id],
      };
    case "clear-checked":
      return state.checkedIds.length === 0 ? state : { ...state, checkedIds: [] };
    case "set-tool":
      return state.tool === action.tool ? state : { ...state, tool: action.tool };
    case "set-zoom":
      return state.zoom === action.zoom ? state : { ...state, zoom: action.zoom };
    case "edit": {
      const previous = state.history.present;
      const next = action.apply(previous);
      if (next === previous) return state;
      const history = commitPanelEdit(state.history, next);
      const chosen = action.select?.(next, previous);
      const moved = pruned(state, history, action.announce ?? "");
      return chosen === undefined ? moved : { ...moved, selectedId: chosen };
    }
    case "undo": {
      const history = undoPanelEdit(state.history);
      return history === state.history ? state : { ...pruned(state, history, action.announce ?? ""), checkedIds: [] };
    }
    case "redo": {
      const history = redoPanelEdit(state.history);
      return history === state.history ? state : { ...pruned(state, history, action.announce ?? ""), checkedIds: [] };
    }
  }
}

export function canUndoPanelEdit(state: PanelEditorState): boolean {
  return state.history.past.length > 0;
}

export function canRedoPanelEdit(state: PanelEditorState): boolean {
  return state.history.future.length > 0;
}

/** 감지 이후 사용자가 한 번이라도 고쳤는가(다시 찾기 전에 경고할 때 쓴다). */
export function hasPanelEdits(state: PanelEditorState): boolean {
  return state.history.past.length > 0;
}
