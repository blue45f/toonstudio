// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { STUDIO_EXACT_RESUME_UPDATED_EVENT, readStudioExactResumeContext, studioExactResumeStorageKey, writeStudioExactResumeContext } from "../studio-exact-resume-context";
import { ensureInitialStudioProjectDocument } from "../studio-project-document-store";
import { STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT } from "../studio-project-document-reader";
import { createStudioProject } from "../studio-project-library-store";
import { createStudioProjectLibraryResumeCache } from "./studio-project-library-resume-cache";

const DATE = "2026-11-07T00:00:00.000Z";
const detachments: Array<() => void> = [];
beforeEach(() => window.localStorage.clear());
afterEach(() => { for (const detach of detachments.splice(0)) detach(); window.localStorage.clear(); Reflect.deleteProperty(document, "visibilityState"); vi.restoreAllMocks(); });

function fixture() {
  const projects = ["first", "second"].map((id) => createStudioProject(window.localStorage, { id, title: id, kind: "webtoon", createdAt: DATE }));
  const documents = projects.map((project) => ensureInitialStudioProjectDocument(window.localStorage, { projectId: project.id, projectTitle: project.title, projectKind: project.kind, createdAt: DATE }));
  const store = createStudioProjectLibraryResumeCache({ projects, locale: "ko", readStorage: () => window.localStorage, host: window });
  const notify = vi.fn();
  const detach = store.subscribe(notify);
  detachments.push(detach);
  return { projects, documents, store, notify, detach };
}

describe("목록 이어하기 읽기 캐시", () => {
  it("같은 프로젝트를 재사용하고 다른 프로젝트 이벤트는 캐시를 버리지 않는다", async () => {
    const { projects, store, notify } = fixture();
    const reads = vi.spyOn(Storage.prototype, "getItem");
    const first = store.resolve(projects[0]);
    const count = reads.mock.calls.length;
    expect(store.resolve(projects[0])).toBe(first);
    expect(reads.mock.calls.length).toBe(count);
    window.dispatchEvent(new CustomEvent(STUDIO_EXACT_RESUME_UPDATED_EVENT, { detail: { projectId: "other" } }));
    window.dispatchEvent(new CustomEvent(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, { detail: { projectId: "other" } }));
    window.dispatchEvent(new StorageEvent("storage", { key: "unrelated", storageArea: window.localStorage }));
    await Promise.resolve();
    expect(store.resolve(projects[0])).toBe(first);
    expect(notify).not.toHaveBeenCalled();
    expect(reads.mock.calls.length).toBe(count);
  });

  it("연속 이어하기 변경을 묶고 해당 프로젝트만 새로 읽는다", async () => {
    const { projects, documents, store, notify } = fixture();
    const first = store.resolve(projects[0]);
    const second = store.resolve(projects[1]);
    for (const [pageId, zoom] of [["page-2", 1.25], ["page-3", 1.5]] as const) {
      writeStudioExactResumeContext(window.localStorage, { projectId: projects[0].id, documentId: documents[0].id, workspace: "comic", pageId, zoom, updatedAt: DATE }, window);
    }
    await Promise.resolve();
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.resolve(projects[0])).not.toBe(first);
    expect(store.resolve(projects[0])).toMatchObject({ documentId: documents[0].id, exact: true, summary: "최근 페이지 · 확대 150%" });
    expect(store.resolve(projects[0]).summary).not.toMatch(/page-[23]/u);
    expect(readStudioExactResumeContext(window.localStorage, projects[0].id, documents[0].id)).toMatchObject({ pageId: "page-3", zoom: 1.5 });
    expect(store.resolve(projects[1])).toBe(second);
  });

  it("마지막 열람 문서 ID가 없어도 실제 선택된 문서의 storage 이벤트를 반영한다", () => {
    const { projects, documents, store, notify } = fixture();
    expect(projects[0].lastOpenedDocumentId).toBeNull();
    const first = store.resolve(projects[0]);
    const key = studioExactResumeStorageKey(projects[0].id, documents[0].id);
    window.dispatchEvent(new StorageEvent("storage", { key, storageArea: window.sessionStorage }));
    expect(store.resolve(projects[0])).toBe(first);
    window.dispatchEvent(new StorageEvent("storage", { key, storageArea: window.localStorage }));
    expect(notify).toHaveBeenCalledTimes(1);
    expect(store.resolve(projects[0])).not.toBe(first);
  });

  it("포커스·페이지 복귀·가시성 복귀에서 갱신하고 해제 후 예약 알림도 막는다", async () => {
    const { projects, store, notify, detach } = fixture();
    for (const event of ["focus", "pageshow"]) {
      const before = store.resolve(projects[0]);
      window.dispatchEvent(new Event(event));
      expect(store.resolve(projects[0])).not.toBe(before);
    }
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    const before = store.resolve(projects[0]);
    document.dispatchEvent(new Event("visibilitychange"));
    expect(store.resolve(projects[0])).toBe(before);
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
    document.dispatchEvent(new Event("visibilitychange"));
    expect(store.resolve(projects[0])).not.toBe(before);
    expect(notify).toHaveBeenCalledTimes(3);
    window.dispatchEvent(new CustomEvent(STUDIO_EXACT_RESUME_UPDATED_EVENT));
    detach();
    await Promise.resolve();
    window.dispatchEvent(new Event("focus"));
    expect(notify).toHaveBeenCalledTimes(3);
    Reflect.deleteProperty(document, "visibilityState");
  });

  it("구독 전 저장소 변경을 놓치지 않고 읽기 실패는 개요로 안전하게 돌아간다", () => {
    const { projects, documents } = fixture();
    const store = createStudioProjectLibraryResumeCache({ projects, locale: "ko", readStorage: () => window.localStorage, host: window });
    store.resolve(projects[0]);
    writeStudioExactResumeContext(window.localStorage, { projectId: projects[0].id, documentId: documents[0].id, workspace: "comic", pageId: "page-gap", selectedElementIds: ["panel-kept"], updatedAt: DATE });
    detachments.push(store.subscribe(vi.fn()));
    expect(store.resolve(projects[0])).toMatchObject({ documentId: documents[0].id, exact: true, summary: "최근 페이지 · 확대 100% · 선택 1개" });
    expect(store.resolve(projects[0]).summary).not.toContain("page-gap");
    expect(readStudioExactResumeContext(window.localStorage, projects[0].id, documents[0].id)).toMatchObject({ pageId: "page-gap", selectedElementIds: ["panel-kept"] });
    const unavailable = createStudioProjectLibraryResumeCache({ projects, locale: "ko", readStorage: () => { throw new Error("합성 저장소 접근 실패"); } });
    expect(unavailable.resolve(projects[0]).href).toBe("/studio/p/first/overview");
  });
});
