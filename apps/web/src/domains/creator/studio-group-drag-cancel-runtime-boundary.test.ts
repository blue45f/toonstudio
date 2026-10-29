import { describe, expect, it } from "vitest";

import { resolveStudioShortcutAnnouncement } from "./status-i18n/studio-producer-error-i18n-shortcut";
import { readStudioCuttoonEditorSource } from "./studio-cuttoon-editor/read-studio-cuttoon-editor-source";

const pageSource = readStudioCuttoonEditorSource();

function functionBody(name: string, nextName: string): string {
  const start = pageSource.indexOf(`function ${name}`);
  const end = pageSource.indexOf(`function ${nextName}`, start + 1);
  expect(start, `missing function ${name}`).toBeGreaterThanOrEqual(0);
  expect(end, `missing boundary ${nextName} after ${name}`).toBeGreaterThan(start);
  return pageSource.slice(start, end);
}

describe("Studio group drag cancellation runtime boundary", () => {
  it("restores the complete preview before invalidating and stopping the Konva drag", () => {
    const source = functionBody(
      "cancelCanvasGroupDrag",
      "liveCanvasElementRect",
    );
    const restore = source.indexOf("restoreGroupDragPreview(session, deltaX, deltaY)");
    const invalidate = source.indexOf("groupDragRef.current = null");
    const stop = source.indexOf("anchor?.stopDrag()");
    const release = source.indexOf("endLiveResourceEdit()");

    expect(source).toContain("const session = groupDragRef.current");
    expect(source).toContain("if (!session) return false");
    expect(restore).toBeGreaterThanOrEqual(0);
    expect(invalidate).toBeGreaterThan(restore);
    expect(stop).toBeGreaterThan(invalidate);
    expect(source).toContain("applyGuides([], [])");
    expect(source).toContain("applySmartGuides(EMPTY_SMART_GUIDE_OVERLAY)");
    expect(release).toBeGreaterThan(stop);
    expect(source).toContain("return true");
    expect(source).not.toContain("commit(");
    expect(source).not.toContain("patchEl(");
  });

  it("routes native pointer cancellation through the same group-drag seam", () => {
    const source = functionBody("onStagePointerCancel", "onStageUp");

    expect(source).toContain("if (cancelCanvasGroupDrag()) return");
    expect(source).not.toContain("restoreGroupDragPreview(");
    expect(source).not.toContain("groupDragRef.current = null");
  });

  it("consumes Escape for an active drag before drawing or selection Escape semantics run", () => {
    const start = pageSource.indexOf('} else if (e.key === "Escape") {');
    const end = pageSource.indexOf(
      "} else if (\n        !mod",
      start + 1,
    );
    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    const source = pageSource.slice(start, end);
    const resizeCancel = source.indexOf("cancelCanvasSelectionResize()");
    const dragCancel = source.indexOf("cancelCanvasGroupDrag()");
    const drawingCancel = source.indexOf("hasActiveDrawingPointerSession()");
    const internalGroupEscape = source.indexOf("activeGroupIdRef.current");
    const ordinarySelectionClear = source.indexOf("setSelectedId(null)");

    expect(resizeCancel).toBeGreaterThanOrEqual(0);
    expect(dragCancel).toBeGreaterThan(resizeCancel);
    expect(drawingCancel).toBeGreaterThan(dragCancel);
    expect(internalGroupEscape).toBeGreaterThan(dragCancel);
    expect(ordinarySelectionClear).toBeGreaterThan(dragCancel);
    expect(source.slice(dragCancel, drawingCancel)).toContain("e.preventDefault()");
    // 2026-10-23(4a59b310, A4 D4): 단축키 공지는 구조화 코드로 내고 Host 게시 지점이 같은 한글 원문으로 해석한다.
    expect(source.slice(dragCancel, drawingCancel)).toContain(
      'announceDrawingShortcut({ code: "groupMoveCancelled" })',
    );
    expect(resolveStudioShortcutAnnouncement({ code: "groupMoveCancelled" }))
      .toBe("그룹 이동을 취소했습니다");
  });
});
