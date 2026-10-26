import { describe, expect, it } from "vitest";

import {
  CHARACTER_LAB_WORKFLOW_STAGES,
  DEFAULT_UI_STATE,
  INSPECTOR_TAB_IDS,
  INSPECTOR_TAB_LABELS_KO,
  createUiStateStore,
  isInspectorTabId,
  parseLabRouteSearchParams,
  resolveActiveWorkflowStageId,
  serializeLabRouteSearchParams,
} from "./ui-state";

describe("app/shell/ui-state", () => {
  it("탭 9개가 한글 라벨을 가진다", () => {
    expect(INSPECTOR_TAB_IDS).toHaveLength(9);
    for (const id of INSPECTOR_TAB_IDS) expect(INSPECTOR_TAB_LABELS_KO[id]).toMatch(/[가-힣]/u);
    expect(isInspectorTabId("param")).toBe(true);
    expect(isInspectorTabId("nope")).toBe(false);
  });

  it("값이 바뀔 때만 구독자에게 알린다", () => {
    const store = createUiStateStore();
    let calls = 0;
    const unsubscribe = store.subscribe(() => {
      calls += 1;
    });
    expect(store.getState()).toEqual(DEFAULT_UI_STATE);
    store.setActiveSlot("face-shape");
    expect(calls).toBe(0);
    store.setActiveSlot("hair");
    store.setInspectorTab("pose");
    store.setDrawingMode(true);
    expect(calls).toBe(3);
    expect(store.getState()).toEqual({ activeSlot: "hair", inspectorTab: "pose", drawingMode: true });
    unsubscribe();
    store.setDrawingMode(false);
    expect(calls).toBe(3);
  });

  it("5단계 가이드 창작 스테퍼와 URL 쿼리 라우터 동기화(parse/serialize)가 정확히 동작한다", () => {
    expect(CHARACTER_LAB_WORKFLOW_STAGES).toHaveLength(5);
    expect(resolveActiveWorkflowStageId(DEFAULT_UI_STATE)).toBe("1-proportion");
    expect(resolveActiveWorkflowStageId({ activeSlot: "hair", inspectorTab: "physics", drawingMode: false })).toBe("2-wardrobe-groom");
    expect(resolveActiveWorkflowStageId({ activeSlot: "pose", inspectorTab: "pose", drawingMode: false })).toBe("3-pose-gaze");
    expect(resolveActiveWorkflowStageId({ activeSlot: "face-shape", inspectorTab: "paint", drawingMode: true })).toBe("4-ink-paint");
    expect(resolveActiveWorkflowStageId({ activeSlot: "lighting", inspectorTab: "export", drawingMode: false })).toBe("5-render-export");

    const parsed = parseLabRouteSearchParams("?stage=4-ink-paint");
    expect(parsed).toEqual({
      activeSlot: "face-shape",
      inspectorTab: "paint",
      drawingMode: true,
    });

    const serialized = serializeLabRouteSearchParams({
      activeSlot: "pose",
      inspectorTab: "pose",
      drawingMode: false,
    });
    expect(serialized).toBe("?stage=3-pose-gaze&slot=pose&tab=pose");
  });
});
