import { describe, expect, it } from "vitest";

import { isStudioJoinedLiveJamRoom, shouldRequireStudioLiveServer } from "../live/studio-live-jam-session";
import { projectStudioCollaborationAccessPolicy } from "../studio-cuttoon-editor/runtime/studio-collaboration-access-policy";

import {
  resolveStudioDccRouteAccess,
  type StudioDccRouteAccessInput,
} from "./studio-dcc-route-access";

const editableSavedWork: StudioDccRouteAccessInput = {
  collaborationOperationSyncPending: false,
  documentReloadRequired: false,
  expectsSharedDocument: true,
  liveRoom: false,
  liveRoomEditAuthorityReady: false,
  remixId: null,
  sharedDocumentAccess: "edit",
  sharedDocumentCanView: true,
  sharedDocumentStatus: "active",
  studioAuthReady: true,
  studioAuthUserId: "author-1",
  workHydrated: true,
  workHydrationFailed: false,
  workHydrationUnsupportedFormat: false,
  workId: "work-1",
};

describe("Studio DCC route access", () => {
  it("keeps a saved-work deep link pending until auth and hydration are authoritative", () => {
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      studioAuthReady: false,
      studioAuthUserId: null,
      workHydrated: false,
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
    })).toBe("pending");
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      workHydrated: false,
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
    })).toBe("pending");
    expect(resolveStudioDccRouteAccess(editableSavedWork)).toBe("allowed");
  });

  it("denies unauthenticated, read-only, failed, and reload-required saved work", () => {
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      studioAuthUserId: null,
    })).toBe("denied");
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      sharedDocumentAccess: "view",
    })).toBe("denied");
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      workHydrationFailed: true,
    })).toBe("denied");
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      documentReloadRequired: true,
    })).toBe("denied");
  });

  it("suspends editing during a transient collaboration frontier without denying the route", () => {
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      collaborationOperationSyncPending: true,
    })).toBe("pending");
  });

  it("uses the reconciled durable room authority when no saved-work document exists", () => {
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      expectsSharedDocument: true,
      liveRoom: true,
      liveRoomEditAuthorityReady: false,
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
      workId: null,
    })).toBe("pending");
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      expectsSharedDocument: true,
      liveRoom: true,
      liveRoomEditAuthorityReady: true,
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
      workId: null,
    })).toBe("allowed");
  });

  it("does not let a hydrated remix bypass its live-room durable authority", () => {
    const roomRemix = {
      ...editableSavedWork,
      expectsSharedDocument: true,
      liveRoom: true,
      remixId: "source-1",
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
      workId: null,
    } satisfies StudioDccRouteAccessInput;

    expect(resolveStudioDccRouteAccess({
      ...roomRemix,
      liveRoomEditAuthorityReady: false,
    })).toBe("pending");
    expect(resolveStudioDccRouteAccess({
      ...roomRemix,
      liveRoomEditAuthorityReady: true,
    })).toBe("allowed");
  });

  it("waits for a remix source before treating it as an editable draft", () => {
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      expectsSharedDocument: false,
      remixId: "source-1",
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
      workHydrated: false,
      workId: null,
    })).toBe("pending");
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      expectsSharedDocument: false,
      remixId: "source-1",
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
      workId: null,
    })).toBe("allowed");
  });

  it("keeps an unsaved local draft available without inventing server authority", () => {
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      expectsSharedDocument: false,
      liveRoom: false,
      liveRoomEditAuthorityReady: false,
      remixId: null,
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
      studioAuthReady: false,
      studioAuthUserId: null,
      workHydrated: true,
      workId: null,
    })).toBe("allowed");
  });

  it.each([
    ["새 로컬 owner는 CRDT 준비 전에도 열림", null, "editor", false, null, true, false, "allowed"],
    ["서버 participant가 없는 로컬 owner도 열림", null, null, false, null, true, false, "allowed"],
    ["자기 published room owner도 CRDT 준비 전 열림", "instant-owner", "editor", false, null, true, false, "allowed"],
    ["다른 room editor는 최초 frontier를 기다림", "instant-other", "editor", false, null, true, false, "pending"],
    ["다른 room editor는 수렴 뒤 열림", "instant-other", "editor", true, null, true, false, "allowed"],
    ["수렴한 viewer에게 편집 권한을 부여하지 않음", "instant-other", "viewer", true, null, true, false, "pending"],
    ["수렴한 commenter에게 편집 권한을 부여하지 않음", "instant-other", "commenter", true, null, true, false, "pending"],
    ["로컬 remix도 원본 hydration을 기다림", null, "editor", false, "source-1", false, false, "pending"],
    ["로컬 owner도 reload 요구를 우회하지 않음", null, "editor", false, null, true, true, "denied"],
  ] as const)("%s", (_label, roomId, role, documentReady, remixId, workHydrated, documentReloadRequired, expected) => {
    const realtimeSession = shouldRequireStudioLiveServer({
      expectsSharedDocument: false, draftCollaborationReady: false, liveJam: true,
    });
    const joinedLiveJam = isStudioJoinedLiveJamRoom({ roomId, instantWorkId: "instant-owner" });
    const policy = projectStudioCollaborationAccessPolicy({
      expectsSharedDocument: false, joinedLiveJam, realtimeSession,
      participantCanEdit: role === "editor", documentReady, editsDurablyProtected: false,
      documentAccessLocked: documentReloadRequired || !workHydrated || (joinedLiveJam && role !== "editor"),
    });
    expect(realtimeSession).toBe(true);
    expect(policy.operationSyncPending).toBe(role === "editor" && !documentReady);
    expect(resolveStudioDccRouteAccess({
      ...editableSavedWork,
      collaborationOperationSyncPending: policy.operationSyncPending,
      documentReloadRequired,
      expectsSharedDocument: false,
      liveRoom: joinedLiveJam,
      liveRoomEditAuthorityReady: realtimeSession && role === "editor" && policy.operationSyncReady,
      remixId,
      sharedDocumentAccess: null,
      sharedDocumentCanView: false,
      sharedDocumentStatus: null,
      studioAuthUserId: null,
      workHydrated,
      workId: null,
    })).toBe(expected);
  });
});
