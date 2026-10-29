// @vitest-environment jsdom
import { webcrypto } from "node:crypto";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StudioMenubarContent } from "../StudioMenubarContent";
import { createHandlers, createProps } from "../StudioMenubarContent.test-fixture";
import { createStudioScopedWriteFixture } from "./studio-scoped-write.test-fixture";
import { StudioScopedWriteAuthorityContext } from "./studio-scoped-write-context";
import { decodeStudioScopedSavePending, studioScopedSavePendingRepository } from "./studio-scoped-save-pending";
import { studioScopedSaveMutationId } from "./studio-scoped-save-document";

vi.mock("../studio-page-lazy-ui", () => ({ StudioMainMenu: () => null, StudioExportMenuPanel: () => null, preloadStudioExportMenuPanel: () => undefined }));
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.spyOn(studioScopedSavePendingRepository, "load").mockResolvedValue(null); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("실제 저장 버튼의 제한 목적 소비", () => {
  it("담당 범위 선택 후 초안 저장만 열고 게시·global 권한 잠금과 만료 차단을 유지한다", async () => {
    const f = createStudioScopedWriteFixture(), stableHandlers = createHandlers(), props = createProps({ workId: "work-1", isMobile: true, collaborationDocumentLocked: true, stableHandlers });
    render(<StudioScopedWriteAuthorityContext.Provider value={f.authority}><StudioMenubarContent {...props} /></StudioScopedWriteAuthorityContext.Provider>);
    expect(screen.getByRole("button", { name: "초안 저장" }).matches(":disabled")).toBe(true);
    act(() => f.choose());
    const save = screen.getByRole("button", { name: "초안 저장" }); await waitFor(() => expect(save.matches(":disabled")).toBe(false));
    expect(screen.getByRole("button", { name: "공개 수정" }).matches(":disabled")).toBe(true); fireEvent.click(save);
    expect(stableHandlers.handleSave).toHaveBeenCalledTimes(1); expect(stableHandlers.handleSave).toHaveBeenLastCalledWith("draft"); expect(props.collaborationDocumentLocked).toBe(true);
    act(() => f.expire()); expect(screen.getByRole("button", { name: "초안 저장" }).matches(":disabled")).toBe(true);
  });
  it("배정이 회수돼도 실제 원문 digest를 검증한 같은 계정·작품의 저장 상태만 명시 확인한다", async () => {
    const f = createStudioScopedWriteFixture(), scope = { actorUserId: "actor-1", workId: "work-1" }, stableHandlers = createHandlers();
    f.authority.setPolicy({ ...f.policy, grants: f.policy.grants.map((grant) => ({ ...grant, revokedAt: "2026-10-29T01:00:00.000Z" })) });
    const body = { baseRevision: 3, crdtServerSequence: "7", doc: { pagesList: [] }, writeContext: { version: 1 as const, policyVersion: 1, grantIds: ["grant-1"], creations: [], restorations: [] } };
    const original = JSON.stringify({ version: 1, ...scope, body: { ...body, mutationId: await studioScopedSaveMutationId(scope.actorUserId, scope.workId, body) },
      snapshotDigest: "b".repeat(64), hasExcludedDraft: false, intentScope: { ownerId: scope.actorUserId, documentKey: "original-document" }, intent: null });
    vi.mocked(studioScopedSavePendingRepository.load).mockImplementation((requested) => decodeStudioScopedSavePending(original, requested));
    render(<StudioScopedWriteAuthorityContext.Provider value={f.authority}><StudioMenubarContent {...createProps({ workId: "work-1", isMobile: true, collaborationDocumentLocked: true, stableHandlers })} /></StudioScopedWriteAuthorityContext.Provider>);
    const confirm = await screen.findByRole("button", { name: "저장 상태 확인" }); expect(confirm.matches(":disabled")).toBe(false); fireEvent.click(confirm);
    expect(stableHandlers.handleSave).toHaveBeenCalledTimes(1); expect(stableHandlers.handleSave).toHaveBeenLastCalledWith("draft");
    expect(f.authority.drawingAllowed).toBe(false); expect(screen.getByRole("button", { name: "공개 수정" }).matches(":disabled")).toBe(true);
    act(() => { f.fence.authScopeKey = "actor-2"; f.authority.expire(); });
    expect(screen.queryByRole("button", { name: "저장 상태 확인" })).toBeNull(); expect(screen.getByRole("button", { name: "초안 저장" }).matches(":disabled")).toBe(true);
  });
  it("서버가 scoped 저장 이력이 없다고 확인한 full editor는 SQLite를 열지 않는다", () => {
    const f = createStudioScopedWriteFixture();
    f.authority.setPolicy({ ...f.policy, fullEdit: true, scopedWrite: false, grants: [], requiresScopedSaveReconciliation: false });
    render(<StudioScopedWriteAuthorityContext.Provider value={f.authority}><StudioMenubarContent {...createProps({ workId: "work-1", isMobile: true })} /></StudioScopedWriteAuthorityContext.Provider>);
    expect(screen.getByRole("button", { name: "초안 저장" }).matches(":disabled")).toBe(false); expect(studioScopedSavePendingRepository.load).not.toHaveBeenCalled();
  });
});
