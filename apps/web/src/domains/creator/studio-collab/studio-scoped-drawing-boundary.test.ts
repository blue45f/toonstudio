import { describe, expect, it } from "vitest";
import { bindStudioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { createStudioScopedWriteFixture } from "./studio-scoped-write.test-fixture";
import { canStartStudioScopedDrawing, scopedStudioDrawingContinuationLocked } from "./studio-scoped-drawing-boundary";

describe("실제 제한 그리기의 상위 입력 경계", () => {
  it("global 잠금 상태에서도 명시적으로 선택한 현재 페이지의 그리기만 허용한다", () => {
    const f = createStudioScopedWriteFixture(), owner = { current: { locked: true } }, boundary = { current: { pageId: "page-1", locked: false } };
    const unbind = bindStudioScopedWriteAuthority(owner, f.authority);
    try {
      expect(canStartStudioScopedDrawing(owner, boundary, "draw")).toBe(false); f.choose();
      expect(canStartStudioScopedDrawing(owner, boundary, "draw")).toBe(true);
      expect(canStartStudioScopedDrawing(owner, boundary, "select")).toBe(false);
      boundary.current.locked = true; expect(canStartStudioScopedDrawing(owner, boundary, "draw")).toBe(false);
      boundary.current = { pageId: "page-2", locked: false }; expect(canStartStudioScopedDrawing(owner, boundary, "draw")).toBe(false);
      expect(owner.current.locked).toBe(true);
    } finally { unbind(); }
  });
  it("원본 ticket이 있어도 검수·저장·페이지 전환 뒤 도착한 PNG는 적용하지 않는다", () => {
    const f = createStudioScopedWriteFixture(), owner = { current: { locked: true } }, boundary = { current: { pageId: "page-1", locked: false } };
    const unbind = bindStudioScopedWriteAuthority(owner, f.authority);
    try {
      f.choose(); f.authority.registerCreation(f.authority.captureDrawingTicket("page-1", null), "stroke", "own-stroke");
      expect(scopedStudioDrawingContinuationLocked(owner, "own-stroke", true, boundary)).toBe(false);
      boundary.current.locked = true; expect(scopedStudioDrawingContinuationLocked(owner, "own-stroke", true, boundary)).toBe(true);
      boundary.current = { pageId: "page-2", locked: false }; expect(scopedStudioDrawingContinuationLocked(owner, "own-stroke", true, boundary)).toBe(true);
      boundary.current.pageId = "page-1"; f.expire(); expect(scopedStudioDrawingContinuationLocked(owner, "own-stroke", true, boundary)).toBe(true);
    } finally { unbind(); }
  });
});
