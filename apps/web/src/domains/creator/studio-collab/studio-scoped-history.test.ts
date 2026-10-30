import { describe, expect, it, vi } from "vitest";
import type { PageState } from "../studio-page-state";
import { createStudioScopedWriteFixture } from "./studio-scoped-write.test-fixture";
import { bindStudioScopedWriteAuthority } from "./studio-scoped-write-authority";
import { createStudioScopedHistory } from "./studio-scoped-history";
import { admitStudioScopedDrawStart, admitStudioScopedPagesCommit } from "./studio-scoped-write-mutation";

function editor() {
  const f = createStudioScopedWriteFixture(), owner = { current: { locked: true } }, unbind = bindStudioScopedWriteAuthority(owner, f.authority);
  f.choose(); const reportError = vi.fn(), publish = vi.fn(() => true), page: PageState = { id: "page-1", elements: [], bg: "#fff", bgGrad: null, canvasH: 1000 };
  const own = admitStudioScopedDrawStart(owner, page.id, [], { id: "own", type: "draw", points: [1, 2, 3, 4], stroke: "#000", strokeWidth: 3 });
  const next = [{ ...page, elements: [own] }];
  expect(admitStudioScopedPagesCommit({ owner, previous: [page], next, reportError, lockMessage: () => "잠금" })).toBe(true);
  const state = { history: [[page], next] as readonly (readonly PageState[])[], index: 1, blocked: false, sidecar: false, pending: [own].slice(0, 0), flush: true };
  const history = createStudioScopedHistory({ owner, getHistory: () => state.history, getIndex: () => state.index, getPending: () => state.pending,
    flushPending: () => state.flush, blocked: () => state.blocked, entryKind: () => state.sidecar ? "sidecar" : "pages", publish, reportError,
    onApplied: (_direction, _next, index) => { state.index = index; } });
  return { f, state, page, own, next, history, publish, reportError, unbind };
}

describe("담당 원고의 실제 이력 port", () => {
  it("자기 이력 앞의 타인 작업·사이드카·공용 메타데이터를 되돌리지 않는다", () => {
    const e = editor();
    try {
      e.state.sidecar = true; expect(e.history.canUndo()).toBe(false); e.state.sidecar = false;
      e.state.history = [[e.page], [{ ...e.page, elements: [{ ...e.own, id: "foreign" }] }]];
      expect(e.history.undo()).toBe(false); expect(e.publish).not.toHaveBeenCalled();
      e.state.history = [[e.page], [{ ...e.page, name: "다른 작업자가 바꾼 페이지 이름", elements: [e.own] }]];
      expect(e.history.canUndo()).toBe(false);
    } finally { e.unbind(); }
  });
  it("문서 교체·현재 grant 회수 후 같은 target의 옛 이력을 재사용하지 않는다", () => {
    const e = editor();
    try {
      e.f.fence.documentGeneration++; expect(e.history.canUndo()).toBe(false); e.f.fence.documentGeneration--;
      e.f.authority.setPolicy({ ...e.f.policy, policyVersion: 2, grants: e.f.policy.grants.map((grant) => grant.id === "grant-1" ? { ...grant, revokedAt: "2026-10-29T01:00:00.000Z" } : grant) });
      expect(e.history.undo()).toBe(false); expect(e.publish).not.toHaveBeenCalled(); expect(e.state.index).toBe(1);
    } finally { e.unbind(); }
  });
  it("대기 획 flush나 발행이 실패하면 이력 인덱스와 원본 획을 보존한다", () => {
    const e = editor();
    try {
      e.state.pending = [e.own]; e.state.flush = false; expect(e.history.undo()).toBe(false); expect(e.state.pending).toEqual([e.own]);
      expect(e.publish).not.toHaveBeenCalled(); e.state.pending = []; e.publish.mockReturnValue(false);
      expect(e.history.undo()).toBe(false); expect(e.state.index).toBe(1); expect(e.state.history[1]).toBe(e.next);
    } finally { e.unbind(); }
  });
});
