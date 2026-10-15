/**
 * 컷 편집 모델 — 자동 감지 결과를 사용자가 고치는 순수 상태 전이.
 *
 * 상태는 불변이다. 모든 함수는 새 상태를 돌려주며, 거절된 편집(너무 작음, 없는 컷 등)은 같은 객체를 그대로 돌려준다
 * (호출자는 `next === state` 로 변화 없음을 알 수 있다). 컷은 항상 이미지 안에 있고, 변 길이는 PANEL_EDIT_MIN_SIDE 이상이다.
 *
 * 읽기 순서: 기본은 자동 정렬이다(편집 뒤에도 sortPanelsByReadingOrder 로 다시 정렬). 사용자가 순서를 직접 바꾸면
 * manualOrder 가 켜져 이후 편집이 순서를 건드리지 않는다. 읽기 순서 방식을 다시 고르면 자동 정렬로 돌아간다.
 */

import { sortPanelsByReadingOrder } from "./panel-detect-order";

import type {
  PanelDetectResult,
  PanelReadingOrder,
  PanelRect,
  PanelWarningCode,
} from "./panel-detect-types";

/** 컷 한 변의 최소 길이(px). */
export const PANEL_EDIT_MIN_SIDE = 8;
export const PANEL_EDIT_MAX_PANELS = 200;
const HISTORY_LIMIT = 100;

export type PanelEditOrigin = "detected" | "user";

export interface EditablePanel extends PanelRect {
  readonly id: string;
  readonly origin: PanelEditOrigin;
  /** 자동 감지 신뢰도. 사용자가 만든 컷은 null. */
  readonly confidence: number | null;
  readonly warnings: readonly PanelWarningCode[];
}

export interface PanelEditState {
  readonly imageWidth: number;
  readonly imageHeight: number;
  readonly readingOrder: PanelReadingOrder;
  /** 읽기 순서(= 재배열 순서)대로 정렬된 컷. */
  readonly panels: readonly EditablePanel[];
  readonly manualOrder: boolean;
  /** 다음 사용자 컷 id 번호. */
  readonly nextId: number;
}

export type PanelEdge = "left" | "right" | "top" | "bottom";
export type PanelSplitOrientation = "horizontal" | "vertical";

export function createPanelEditState(result: PanelDetectResult): PanelEditState {
  return {
    imageWidth: result.width,
    imageHeight: result.height,
    readingOrder: result.readingOrder,
    panels: result.panels.map((panel): EditablePanel => ({
      id: panel.id,
      x: panel.x,
      y: panel.y,
      width: panel.width,
      height: panel.height,
      origin: "detected",
      confidence: panel.confidence,
      warnings: panel.warnings,
    })),
    manualOrder: false,
    nextId: 1,
  };
}

/** 감지 결과 없이(예: 컷을 하나도 못 찾았을 때) 빈 편집 상태로 시작한다. */
export function createEmptyPanelEditState(
  imageWidth: number,
  imageHeight: number,
  readingOrder: PanelReadingOrder,
): PanelEditState {
  return { imageWidth, imageHeight, readingOrder, panels: [], manualOrder: false, nextId: 1 };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** 이미지 안으로 넣고 정수로 맞춘다. 최소 크기를 만들 수 없으면 null. */
export function normalizePanelRect(rect: PanelRect, imageWidth: number, imageHeight: number): PanelRect | null {
  if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite)) return null;
  const x0 = clamp(Math.round(rect.x), 0, imageWidth);
  const y0 = clamp(Math.round(rect.y), 0, imageHeight);
  const x1 = clamp(Math.round(rect.x + rect.width), 0, imageWidth);
  const y1 = clamp(Math.round(rect.y + rect.height), 0, imageHeight);
  if (x1 - x0 < PANEL_EDIT_MIN_SIDE || y1 - y0 < PANEL_EDIT_MIN_SIDE) return null;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

function reorder(state: PanelEditState, panels: readonly EditablePanel[]): PanelEditState {
  return {
    ...state,
    panels: state.manualOrder ? panels : sortPanelsByReadingOrder(panels, state.readingOrder),
  };
}

function findPanel(state: PanelEditState, id: string): EditablePanel | undefined {
  return state.panels.find((panel) => panel.id === id);
}

function replacePanel(state: PanelEditState, id: string, next: EditablePanel): PanelEditState {
  const panels = state.panels.map((panel) => (panel.id === id ? next : panel));
  return reorder(state, panels);
}

function sameRect(a: PanelRect, b: PanelRect): boolean {
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** 컷 사각형을 직접 지정한다(숫자 입력·끌기). 편집한 컷은 신뢰도 표시를 잃지 않지만 경고는 지운다. */
export function setPanelRect(state: PanelEditState, id: string, rect: PanelRect): PanelEditState {
  const panel = findPanel(state, id);
  const normalized = normalizePanelRect(rect, state.imageWidth, state.imageHeight);
  if (!panel || !normalized || sameRect(panel, normalized)) return state;
  return replacePanel(state, id, { ...panel, ...normalized, warnings: [] });
}

/** 컷을 통째로 옮긴다. 이미지 밖으로는 나가지 않는다. */
export function movePanelBy(state: PanelEditState, id: string, dx: number, dy: number): PanelEditState {
  const panel = findPanel(state, id);
  if (!panel || !Number.isFinite(dx) || !Number.isFinite(dy)) return state;
  const x = clamp(panel.x + Math.round(dx), 0, state.imageWidth - panel.width);
  const y = clamp(panel.y + Math.round(dy), 0, state.imageHeight - panel.height);
  return setPanelRect(state, id, { x, y, width: panel.width, height: panel.height });
}

/** 한 변을 절대 좌표 position 으로 옮긴다. 반대편 변을 넘거나 최소 크기보다 작아지면 거기서 멈춘다. */
export function resizePanelEdge(
  state: PanelEditState,
  id: string,
  edge: PanelEdge,
  position: number,
): PanelEditState {
  const panel = findPanel(state, id);
  if (!panel || !Number.isFinite(position)) return state;
  const target = Math.round(position);
  let { x, y, width, height } = panel;
  if (edge === "left") {
    const right = panel.x + panel.width;
    x = clamp(target, 0, right - PANEL_EDIT_MIN_SIDE);
    width = right - x;
  } else if (edge === "right") {
    width = clamp(target, panel.x + PANEL_EDIT_MIN_SIDE, state.imageWidth) - panel.x;
  } else if (edge === "top") {
    const bottom = panel.y + panel.height;
    y = clamp(target, 0, bottom - PANEL_EDIT_MIN_SIDE);
    height = bottom - y;
  } else {
    height = clamp(target, panel.y + PANEL_EDIT_MIN_SIDE, state.imageHeight) - panel.y;
  }
  return setPanelRect(state, id, { x, y, width, height });
}

function userPanel(state: PanelEditState, rect: PanelRect): { panel: EditablePanel; nextId: number } {
  return {
    panel: { id: `user-${state.nextId}`, ...rect, origin: "user", confidence: null, warnings: [] },
    nextId: state.nextId + 1,
  };
}

/** 새 컷을 추가한다(그려서 추가·제외 조각 채택·검출 불가 영역 채택). */
export function addPanel(state: PanelEditState, rect: PanelRect): PanelEditState {
  const normalized = normalizePanelRect(rect, state.imageWidth, state.imageHeight);
  if (!normalized || state.panels.length >= PANEL_EDIT_MAX_PANELS) return state;
  const { panel, nextId } = userPanel(state, normalized);
  return reorder({ ...state, nextId }, [...state.panels, panel]);
}

export function removePanel(state: PanelEditState, id: string): PanelEditState {
  if (!findPanel(state, id)) return state;
  return { ...state, panels: state.panels.filter((panel) => panel.id !== id) };
}

/**
 * 컷을 선 하나로 둘로 나눈다(경계 추가). horizontal 은 y=position 인 가로선, vertical 은 x=position 인 세로선.
 * gap 만큼은 두 컷 사이에 비워 둔다. 어느 한쪽이라도 최소 크기보다 작으면 거절한다.
 */
export function splitPanel(
  state: PanelEditState,
  id: string,
  orientation: PanelSplitOrientation,
  position: number,
  gap = 0,
): PanelEditState {
  const panel = findPanel(state, id);
  if (!panel || !Number.isFinite(position) || !Number.isFinite(gap) || gap < 0) return state;
  if (state.panels.length >= PANEL_EDIT_MAX_PANELS) return state;
  const at = Math.round(position);
  const before = Math.floor(gap / 2);
  const after = Math.ceil(gap / 2);
  let first: PanelRect;
  let second: PanelRect;
  if (orientation === "horizontal") {
    first = { x: panel.x, y: panel.y, width: panel.width, height: at - before - panel.y };
    second = { x: panel.x, y: at + after, width: panel.width, height: panel.y + panel.height - (at + after) };
  } else {
    first = { x: panel.x, y: panel.y, width: at - before - panel.x, height: panel.height };
    second = { x: at + after, y: panel.y, width: panel.x + panel.width - (at + after), height: panel.height };
  }
  const a = normalizePanelRect(first, state.imageWidth, state.imageHeight);
  const b = normalizePanelRect(second, state.imageWidth, state.imageHeight);
  if (!a || !b) return state;
  const created = userPanel(state, a);
  const createdSecond = userPanel({ ...state, nextId: created.nextId }, b);
  const index = state.panels.indexOf(panel);
  const panels = [
    ...state.panels.slice(0, index),
    created.panel,
    createdSecond.panel,
    ...state.panels.slice(index + 1),
  ];
  return reorder({ ...state, nextId: createdSecond.nextId }, panels);
}

/** 둘 이상의 컷을 하나로 합친다(경계 삭제). 합친 컷은 포함 사각형이다. */
export function mergePanels(state: PanelEditState, ids: readonly string[]): PanelEditState {
  const targets = state.panels.filter((panel) => ids.includes(panel.id));
  if (targets.length < 2) return state;
  const x0 = Math.min(...targets.map((panel) => panel.x));
  const y0 = Math.min(...targets.map((panel) => panel.y));
  const x1 = Math.max(...targets.map((panel) => panel.x + panel.width));
  const y1 = Math.max(...targets.map((panel) => panel.y + panel.height));
  const { panel, nextId } = userPanel(state, { x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
  const first = state.panels.indexOf(targets[0]);
  const remaining = state.panels.filter((candidate) => !ids.includes(candidate.id));
  const insertAt = state.panels.slice(0, first).filter((candidate) => !ids.includes(candidate.id)).length;
  const panels = [...remaining.slice(0, insertAt), panel, ...remaining.slice(insertAt)];
  return reorder({ ...state, nextId }, panels);
}

/** 읽기 순서 안에서 컷의 위치를 바꾼다. 사용자가 순서를 직접 정한 것으로 기록한다. */
export function reorderPanel(state: PanelEditState, id: string, toIndex: number): PanelEditState {
  const index = state.panels.findIndex((panel) => panel.id === id);
  if (index < 0 || !Number.isInteger(toIndex)) return state;
  const target = clamp(toIndex, 0, state.panels.length - 1);
  if (target === index) return state;
  const panels = [...state.panels];
  const [moved] = panels.splice(index, 1);
  panels.splice(target, 0, moved);
  return { ...state, panels, manualOrder: true };
}

export function movePanelInOrder(state: PanelEditState, id: string, direction: -1 | 1): PanelEditState {
  const index = state.panels.findIndex((panel) => panel.id === id);
  return index < 0 ? state : reorderPanel(state, id, index + direction);
}

/** 읽기 순서 방식을 바꾸고 자동 정렬로 되돌린다. */
export function applyReadingOrder(state: PanelEditState, readingOrder: PanelReadingOrder): PanelEditState {
  return {
    ...state,
    readingOrder,
    manualOrder: false,
    panels: sortPanelsByReadingOrder(state.panels, readingOrder),
  };
}

/** 편집 상태가 불변식을 지키는지(테스트·방어용): id 유일, 이미지 안, 최소 크기. */
export function validatePanelEditState(state: PanelEditState): boolean {
  const ids = new Set<string>();
  for (const panel of state.panels) {
    if (ids.has(panel.id)) return false;
    ids.add(panel.id);
    if (
      !Number.isInteger(panel.x) || !Number.isInteger(panel.y)
      || !Number.isInteger(panel.width) || !Number.isInteger(panel.height)
      || panel.x < 0 || panel.y < 0
      || panel.width < PANEL_EDIT_MIN_SIDE || panel.height < PANEL_EDIT_MIN_SIDE
      || panel.x + panel.width > state.imageWidth
      || panel.y + panel.height > state.imageHeight
    ) return false;
  }
  return true;
}

// ── 되돌리기/다시하기 ─────────────────────────────────────────────────────

export interface PanelEditHistory {
  readonly past: readonly PanelEditState[];
  readonly present: PanelEditState;
  readonly future: readonly PanelEditState[];
}

export function createPanelEditHistory(present: PanelEditState): PanelEditHistory {
  return { past: [], present, future: [] };
}

/** 새 상태를 기록한다. 바뀐 게 없으면 같은 기록을 돌려준다. */
export function commitPanelEdit(history: PanelEditHistory, next: PanelEditState): PanelEditHistory {
  if (next === history.present) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: [],
  };
}

export function undoPanelEdit(history: PanelEditHistory): PanelEditHistory {
  const previous = history.past[history.past.length - 1];
  if (!previous) return history;
  return {
    past: history.past.slice(0, -1),
    present: previous,
    future: [history.present, ...history.future],
  };
}

export function redoPanelEdit(history: PanelEditHistory): PanelEditHistory {
  const next = history.future[0];
  if (!next) return history;
  return {
    past: [...history.past, history.present].slice(-HISTORY_LIMIT),
    present: next,
    future: history.future.slice(1),
  };
}
