import { describe, expect, it, vi } from "vitest";
import { StudioCrdtDocument } from "./studio-crdt-document";
import { bindStudioCrdtWriteBoundary, captureStudioCrdtWriteContext } from "./studio-crdt-write-context";
import { createStudioScopedWriteFixture } from "../studio-collab/studio-scoped-write.test-fixture";

describe("전체 편집과 제한 편집의 CRDT 문맥 선택", () => {
  it("전체 편집은 opt-in 변경 문맥만 소비하고 기존 제한 편집 문맥을 차용하지 않는다", () => {
    const document = new StudioCrdtDocument(), context = { version: 1 as const, policyVersion: 3, grantIds: ["grant"], creations: [], restorations: [] };
    const publisher = { captureWriteContext: vi.fn(() => context), captureFullEditWriteContext: vi.fn(() => undefined), bindFlushBoundary: () => () => {} };
    try {
      expect(captureStudioCrdtWriteContext(publisher, true, document)).toBeUndefined();
      expect(publisher.captureWriteContext).not.toHaveBeenCalled();
      expect(captureStudioCrdtWriteContext(publisher, false, document)).toBe(context);
      expect(publisher.captureWriteContext).toHaveBeenCalledTimes(1);
    } finally { document.destroy(); }
  });
  it("현재 room의 살아있는 실제 ID와 undo tombstone·계정·해제를 대조하고 같은 문서의 세대 전진을 보존한다", () => {
    const f = createStudioScopedWriteFixture(), document = new StudioCrdtDocument(); f.choose();
    const unbind = bindStudioCrdtWriteBoundary(f.authority, document, () => {});
    try {
      document.addStroke({ id: "live-id", pageId: "page-1", layerId: "page-root", payload: { version: 1, type: "draw", kind: "freehand", mode: "pen", stroke: "#000", strokeWidth: 3, points: [1, 2, 3, 4] } });
      expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(true);
      expect(f.authority.hasCurrentLiveEntity("stroke", "live-id", "target-2")).toBe(false);
      document.deleteStroke("live-id"); expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(false);
      document.restoreStroke("live-id"); expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(true);
      f.fence.documentGeneration++; expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(true);
      f.fence.accessGeneration++; expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(true);
      f.fence.authScopeKey = "other-actor"; expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(false); f.fence.authScopeKey = "actor-1";
      unbind?.(); expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(false);
    } finally { unbind?.(); document.destroy(); }
  });
  it("살아있는 ID를 대조하는 도중 문서 세대가 바뀌면 그 조회를 사용하지 않는다", () => {
    const f = createStudioScopedWriteFixture(); f.choose();
    const unbind = f.authority.bindEntityPresence(() => { f.fence.documentGeneration++; return true; });
    try { expect(f.authority.hasCurrentLiveEntity("stroke", "live-id")).toBe(false); }
    finally { unbind(); }
  });
  it("이전 room의 해제가 교체한 현재 문서 binding을 지우지 않는다", () => {
    const f = createStudioScopedWriteFixture(), first = new StudioCrdtDocument(), current = new StudioCrdtDocument(); f.choose();
    const unbindFirst = bindStudioCrdtWriteBoundary(f.authority, first, () => {}), unbindCurrent = bindStudioCrdtWriteBoundary(f.authority, current, () => {});
    try {
      current.addStroke({ id: "current-id", pageId: "page-1", layerId: "page-root", payload: { version: 1, type: "draw", kind: "freehand", mode: "pen", stroke: "#000", strokeWidth: 3, points: [1, 2] } });
      unbindFirst?.(); expect(f.authority.hasCurrentLiveEntity("stroke", "current-id")).toBe(true);
      unbindCurrent?.(); expect(f.authority.hasCurrentLiveEntity("stroke", "current-id")).toBe(false);
    } finally { unbindFirst?.(); unbindCurrent?.(); first.destroy(); current.destroy(); }
  });
});
