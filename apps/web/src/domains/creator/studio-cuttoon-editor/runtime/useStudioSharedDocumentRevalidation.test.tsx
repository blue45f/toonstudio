// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { offlineWorkCacheKey } from "../../offline/studio-offline-owner-receipt";
import type { StudioSharedDocument } from "../../studio-shared-document-client";
import { useStudioSharedDocumentRevalidation } from "./useStudioSharedDocumentRevalidation";

const meta = vi.hoisted(() => vi.fn());
vi.mock("../../studio-shared-document-client", () => ({ getStudioSharedDocumentMeta: meta }));

const doc: StudioSharedDocument = {
  workId: "work-a", role: "owner", status: "active", capabilities: { view: true, edit: true },
  access: "edit", revision: 3, crdtServerSequence: "4", updatedAt: "2026-11-23T00:00:00Z",
  document: { titleId: null, title: "테스트", description: "", cover: "", tags: [], format: "cuttoon",
    pages: [], doc: {}, status: "draft", seriesId: null, episodeNo: null, challengeId: null, remixFromId: null },
};
const key = offlineWorkCacheKey(doc.workId);

function focusEditor() {
  const setSharedDocumentScope = vi.fn();
  const scopeRef = { current: { workId: doc.workId, authScopeKey: "owner-a" } };
  localStorage.setItem(key, "selector");
  renderHook(() => useStudioSharedDocumentRevalidation({
    currentDocumentScopeRef: scopeRef, documentRevalidateAbortRef: { current: null },
    editorMountedRef: { current: true }, lockMutations: vi.fn(), reportError: vi.fn(),
    setSharedDocumentScope, sharedDocument: doc, studioAuthUserId: "owner-a", studioTeamCanComment: true,
    workHydrated: true, workId: doc.workId,
  }));
  act(() => { window.dispatchEvent(new Event("focus")); });
  return { scopeRef, setSharedDocumentScope };
}

afterEach(() => { cleanup(); localStorage.clear(); meta.mockReset(); });

describe("원고 권한 재확인과 오프라인 열람 영수증", () => {
  it.each([401, 403, 404])("서버가 %i를 확인하면 영수증을 폐기한다", async status => {
    meta.mockRejectedValue(Object.assign(new Error("읽기 거부"), { status }));
    const { setSharedDocumentScope } = focusEditor();
    await waitFor(() => expect(setSharedDocumentScope).toHaveBeenCalled());
    expect(localStorage.getItem(key)).toBeNull();
  });

  it("편집이 가능하더라도 소유자가 아니면 영수증을 폐기한다", async () => {
    meta.mockResolvedValue({ ...doc, role: "editor" });
    const { setSharedDocumentScope } = focusEditor();
    await waitFor(() => expect(setSharedDocumentScope).toHaveBeenCalled());
    expect(localStorage.getItem(key)).toBeNull();
  });

  it.each([new TypeError("연결 끊김"), Object.assign(new Error("일시 장애"), { status: 503 })])(
    "일시적 통신 실패는 영수증을 보존한다", async error => {
      meta.mockRejectedValue(error);
      const { setSharedDocumentScope } = focusEditor();
      await waitFor(() => expect(setSharedDocumentScope).toHaveBeenCalled());
      expect(localStorage.getItem(key)).toBe("selector");
    },
  );

  it("계정을 바꾸기 전에 보낸 요청의 늦은 거부는 현재 영수증을 폐기하지 않는다", async () => {
    const late = Promise.withResolvers<never>();
    meta.mockReturnValue(late.promise);
    const { scopeRef, setSharedDocumentScope } = focusEditor();
    await waitFor(() => expect(meta).toHaveBeenCalled());
    scopeRef.current = { workId: doc.workId, authScopeKey: "owner-b" };
    await act(async () => { late.reject(Object.assign(new Error("읽기 거부"), { status: 403 })); });
    expect(localStorage.getItem(key)).toBe("selector");
    expect(setSharedDocumentScope).not.toHaveBeenCalled();
  });
});
