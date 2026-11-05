// @vitest-environment jsdom
import { cleanup, renderHook } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { studioAutosaveKey } from "../../studio-autosave";
import { studioCheckpointKey } from "../../studio-checkpoint-loader";
import { StudioDocumentLayoutContext, type StudioDocumentLayoutRuntime } from "../../studio-router/studio-document-layout-context";
import { useStudioDocumentAccessRuntime } from "./useStudioDocumentAccessRuntime";

const services = vi.hoisted(() => ({
  draft: vi.fn(() => ({ draftCollaboration: null })),
  collaboration: vi.fn(() => ({ collaborationDocumentLocked: false })),
  mutation: vi.fn((options: { studioAuthUserId: string | null; workId: string | null }) => ({
    markStudioDocumentChanged: () => true,
    collaborationAccessRef: { current: { authScopeKey: options.studioAuthUserId, workId: options.workId,
      locked: false, accessGeneration: 0, documentGeneration: 0 } },
  })),
  scoped: vi.fn(() => ({ authority: null, policy: null, loading: false, error: null, refresh: async () => null })),
}));
vi.mock("./useStudioDraftCollaborationRuntime", () => ({ useStudioDraftCollaborationRuntime: services.draft }));
vi.mock("./useStudioCollaborationAccessRuntime", () => ({ useStudioCollaborationAccessRuntime: services.collaboration }));
vi.mock("./useStudioMutationAuthorityRuntime", () => ({ useStudioMutationAuthorityRuntime: services.mutation }));
vi.mock("./useStudioScopedWriteRuntime", () => ({ useStudioScopedWriteRuntime: services.scoped }));
vi.mock("./useStudioLayerLiftRuntime", () => ({ useStudioLayerLiftRuntime: () => ({}) }));

type Options = Parameters<typeof useStudioDocumentAccessRuntime>[0];
function options(workId: string | null, remixId: string | null = null): Options {
  const noop = () => undefined;
  return {
    announce: noop, getProjectSnapshot: () => ({}), instantWorkId: "instant-owner",
    liveInviteRole: null,
    liveRoomQueryParam: null, onAcceptedMutation: noop, remixId, reportError: noop,
    sessionDisplayName: "Test owner", setStudioWorkAssetLimitExceeded: noop,
    setStudioWorkAssetReferences: noop, studioAuthUserId: "owner-1",
    studioCrdtDocument: null, studioCrdtDocumentRef: { current: null },
    studioCrdtReconciledDocument: null, studioCrdtSceneRuntimeRef: { current: null },
    studioWorkAssetHydrator: {} as Options["studioWorkAssetHydrator"], workId,
  };
}

function layout(documentId: string): StudioDocumentLayoutRuntime {
  return {
    documentKey: `project:project-1:document:${documentId}`, projectId: "project-1",
    documentId, draftId: null, documentWorkspace: "draw", draftSessionEpoch: 0,
    instantWorkId: "instant-owner", liveInviteRoleParam: null, liveRoomParam: null, remixId: null, workId: documentId,
  };
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("document persistence and source access wiring", () => {
  it("로컬 원점 복구 전후의 룸이 달라도 문서의 자동 저장·체크포인트 키와 기존 복구본은 유지한다", () => {
    const documentId = "ep01-six-pages";
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StudioDocumentLayoutContext value={layout(documentId)}>{children}</StudioDocumentLayoutContext>
    );
    const initialProps: { instantWorkId: string; liveRoomQueryParam: string | null } = {
      instantWorkId: "work-instant-fresh-5678", liveRoomQueryParam: null,
    };
    const { result, rerender } = renderHook((room) => useStudioDocumentAccessRuntime({ ...options(null), ...room }), { wrapper, initialProps });
    const key = result.current.autosaveKey;
    const checkpoint = result.current.checkpointKey;
    localStorage.setItem(key, "기존 여섯 페이지 복구본");
    rerender({ instantWorkId: "work-instant-prev-1234", liveRoomQueryParam: "work-instant-prev-1234" });
    expect(result.current.autosaveKey).toBe(key);
    expect(result.current.checkpointKey).toBe(checkpoint);
    expect(localStorage.getItem(key)).toBe("기존 여섯 페이지 복구본");
    localStorage.removeItem(key);
  });

  it("preserves local recovery keys while all server access services receive a null workId", () => {
    const documentId = "ep01-existing";
    const wrapper = ({ children }: { children: ReactNode }) => (
      <StudioDocumentLayoutContext value={layout(documentId)}>{children}</StudioDocumentLayoutContext>
    );
    const { result } = renderHook(() => useStudioDocumentAccessRuntime(options(null)), { wrapper });
    const previousScope = { userId: "owner-1", workId: documentId, remixId: null };
    expect(result.current.autosaveKey).toBe(studioAutosaveKey(previousScope));
    expect(result.current.checkpointKey).toBe(studioCheckpointKey(previousScope));
    expect(services.draft).toHaveBeenLastCalledWith(expect.objectContaining({ workId: null, autosaveKey: studioAutosaveKey(previousScope) }));
    expect(services.collaboration).toHaveBeenLastCalledWith(expect.objectContaining({ workId: null }));
    expect(services.mutation).toHaveBeenLastCalledWith(expect.objectContaining({ workId: null }));
    expect(services.scoped).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: "owner-1", workId: null,
      accessRef: { current: expect.objectContaining({ authScopeKey: "owner-1", workId: null }) } }));
  });

  it.each([
    ["server-work", null],
    [null, "remix-source"],
    [null, null],
  ] as const)("retains legacy recovery and source scopes for work=%s remix=%s", (workId, remixId) => {
    const { result } = renderHook(() => useStudioDocumentAccessRuntime(options(workId, remixId)));
    const scope = { userId: "owner-1", workId, remixId };
    expect(result.current.autosaveKey).toBe(studioAutosaveKey(scope));
    expect(result.current.checkpointKey).toBe(studioCheckpointKey(scope));
    expect(services.collaboration).toHaveBeenLastCalledWith(expect.objectContaining({ workId, remixId }));
    expect(services.scoped).toHaveBeenLastCalledWith(expect.objectContaining({ actorId: "owner-1", workId,
      accessRef: { current: expect.objectContaining({ authScopeKey: "owner-1", workId }) } }));
  });
});
