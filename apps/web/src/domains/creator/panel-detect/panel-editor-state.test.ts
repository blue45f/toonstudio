import { describe, expect, it } from "vitest";

import { addPanel, createEmptyPanelEditState, mergePanels, removePanel } from "./panel-detect-edit";
import {
  PANEL_ZOOM_STEPS,
  canRedoPanelEdit,
  canUndoPanelEdit,
  createPanelEditorState,
  hasPanelEdits,
  panelEditorReducer,
  type PanelEditorAction,
  type PanelEditorState,
} from "./panel-editor-state";

function twoPanels(): PanelEditorState {
  let state = createPanelEditorState(createEmptyPanelEditState(800, 1200, "webtoon"));
  state = panelEditorReducer(state, { type: "edit", apply: (edit) => addPanel(edit, { x: 10, y: 10, width: 300, height: 200 }) });
  state = panelEditorReducer(state, { type: "edit", apply: (edit) => addPanel(edit, { x: 10, y: 300, width: 300, height: 200 }) });
  return state;
}

const reduce = (state: PanelEditorState, ...actions: PanelEditorAction[]): PanelEditorState => actions.reduce(panelEditorReducer, state);

describe("컷 편집 화면 상태", () => {
  it("편집마다 이력에 한 번 쌓고, 바뀐 게 없으면 상태 객체를 그대로 둔다", () => {
    const start = createPanelEditorState(createEmptyPanelEditState(800, 1200, "webtoon"));
    expect(hasPanelEdits(start)).toBe(false);
    expect(panelEditorReducer(start, { type: "edit", apply: (edit) => edit })).toBe(start);
    const edited = twoPanels();
    expect(edited.history.present.panels).toHaveLength(2);
    expect(edited.history.past).toHaveLength(2);
    expect(hasPanelEdits(edited)).toBe(true);
    expect(canUndoPanelEdit(edited)).toBe(true);
    expect(canRedoPanelEdit(edited)).toBe(false);
  });

  it("되돌리기·다시하기는 이력을 오가고, 사라진 컷의 선택과 체크를 정리한다", () => {
    const edited = twoPanels();
    const [first, second] = edited.history.present.panels;
    const picked = reduce(edited, { type: "select", id: second.id }, { type: "toggle-checked", id: first.id }, { type: "toggle-checked", id: second.id });
    expect(picked.selectedId).toBe(second.id);
    expect(picked.checkedIds).toEqual([first.id, second.id]);
    const undone = panelEditorReducer(picked, { type: "undo", announce: "되돌렸어요" });
    expect(undone.history.present.panels).toHaveLength(1);
    expect(undone.selectedId).toBeNull();
    expect(undone.checkedIds).toEqual([]);
    expect(undone.announcement).toBe("되돌렸어요");
    expect(canRedoPanelEdit(undone)).toBe(true);
    const redone = panelEditorReducer(undone, { type: "redo" });
    expect(redone.history.present.panels).toHaveLength(2);
    // 되돌릴 이력이 없으면 상태 객체를 그대로 돌려준다.
    const untouched = createPanelEditorState(createEmptyPanelEditState(10, 10, "comic"));
    expect(panelEditorReducer(untouched, { type: "undo" })).toBe(untouched);
    expect(panelEditorReducer(untouched, { type: "redo" })).toBe(untouched);
  });

  it("컷을 지우면 선택과 체크에서도 빠지고, 합치면 새 컷을 고를 수 있다", () => {
    const edited = twoPanels();
    const [first, second] = edited.history.present.panels;
    const picked = reduce(edited, { type: "select", id: first.id }, { type: "toggle-checked", id: first.id });
    const removed = panelEditorReducer(picked, { type: "edit", apply: (edit) => removePanel(edit, first.id), announce: "삭제" });
    expect(removed.selectedId).toBeNull();
    expect(removed.checkedIds).toEqual([]);
    expect(removed.history.present.panels.map((panel) => panel.id)).toEqual([second.id]);
    const merged = panelEditorReducer(edited, {
      type: "edit",
      apply: (edit) => mergePanels(edit, [first.id, second.id]),
      select: (next) => next.panels[0]?.id ?? null,
    });
    expect(merged.history.present.panels).toHaveLength(1);
    expect(merged.selectedId).toBe(merged.history.present.panels[0].id);
  });

  it("도구·확대·체크 해제는 이력에 영향을 주지 않는다", () => {
    const edited = twoPanels();
    const next = reduce(edited, { type: "set-tool", tool: "draw" }, { type: "set-zoom", zoom: PANEL_ZOOM_STEPS[2] }, { type: "toggle-checked", id: "x" }, { type: "clear-checked" });
    expect(next.tool).toBe("draw");
    expect(next.zoom).toBe(2);
    expect(next.checkedIds).toEqual([]);
    expect(next.history).toBe(edited.history);
    expect(panelEditorReducer(next, { type: "set-tool", tool: "draw" })).toBe(next);
    expect(panelEditorReducer(next, { type: "set-zoom", zoom: 2 })).toBe(next);
    expect(panelEditorReducer(next, { type: "clear-checked" })).toBe(next);
    expect(panelEditorReducer(next, { type: "select", id: null })).toBe(next);
  });
});
