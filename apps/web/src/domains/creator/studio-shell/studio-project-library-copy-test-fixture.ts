import { waitFor } from "@testing-library/react";
import { expect, vi } from "vitest";

import * as localProjectCopy from "../save-first/studio-project-local-copy";
import { importedTestPorts, importedTestSqlite } from "../save-first/studio-project-package-import-test-fixture";
import type { StudioProjectWorkspaceSnapshotReader } from "../save-first/studio-project-workspace-snapshots";
import { studioAutosaveKey, type StudioAutosavePayload } from "../studio-autosave";
import { createStudioProjectDocument, readStudioProjectDocuments } from "../studio-project-document-store";
import { createStudioProject, markStudioProjectOpened, readStudioProjectLibrary } from "../studio-project-library-store";

const CREATED_AT = "2026-09-12T00:00:00.000Z";
const SOURCE_PAYLOAD: StudioAutosavePayload = {
  version: 2, savedAt: CREATED_AT, currentPageId: "source-page-2",
  pagesList: [
    { id: "source-page-1", canvasH: 1200, elements: [
      { id: "original-frame", type: "frame", x: 15, y: 20, width: 120, height: 160, bgColor: "#d03935" },
    ] },
    { id: "source-page-2", canvasH: 1200, elements: [] },
  ],
};

/** 원고 복제 구현은 실제로 실행하고 외부 저장소 I/O만 같은 SQLite codec의 메모리 KV로 제공한다. */
export async function prepareStudioProjectLibraryCopyFixture(storage: Storage) {
  const source = createStudioProject(storage, {
    id: "series-alpha", title: "작품 A", kind: "webtoon", createdAt: CREATED_AT,
  });
  const sourceDocument = createStudioProjectDocument(storage, source.id, {
    id: "source-copy-document", title: "원본 원고", kind: "webtoon",
    defaultWorkspace: "comic", width: 800, height: 1200, pageCount: 2, createdAt: CREATED_AT,
  });
  markStudioProjectOpened(storage, source.id, sourceDocument.id, { at: CREATED_AT });
  const sqlite = importedTestSqlite(storage);
  const sourceKey = studioAutosaveKey({ userId: null, workId: sourceDocument.id });
  await sqlite.write(sourceKey, SOURCE_PAYLOAD);
  const reader: StudioProjectWorkspaceSnapshotReader = {
    read: async (key) => {
      const result = await sqlite.read(key);
      return result ? {
        key, authority: "sqlite-fallback", state: result.state, savedAt: result.savedAt,
        payload: result.state === "snapshot" ? result.payload : null,
      } : null;
    },
    dispose: async () => undefined,
  };
  const copyActual = localProjectCopy.copyStudioProjectWithLocalWorkspace;
  const copyOperation = vi.spyOn(localProjectCopy, "copyStudioProjectWithLocalWorkspace")
    .mockImplementation((sourceId, options) => copyActual(sourceId, {
      ...options, reader, autosavePorts: importedTestPorts(storage),
    }));

  const readOriginal = async () => ({
    project: readStudioProjectLibrary(storage).projects.find(({ id }) => id === source.id),
    documents: readStudioProjectDocuments(storage, source.id),
    snapshot: await sqlite.read(sourceKey),
  });

  return {
    source,
    readOriginal,
    verifyCopy: async (original: Awaited<ReturnType<typeof readOriginal>>) => {
      await waitFor(() => { expect(copyOperation).toHaveBeenCalledTimes(1); });
      const operation = copyOperation.mock.results[0];
      if (operation?.type !== "return") throw new Error("원고 복제 작업이 시작되지 않았습니다.");
      const committed = await operation.value;
      await waitFor(() => {
        expect(readStudioProjectLibrary(storage).projects
          .filter(({ title }) => title.startsWith(source.title))).toHaveLength(2);
      });
      const copy = readStudioProjectLibrary(storage).projects.find(({ id, title }) => (
        id !== source.id && title === `${source.title} 복사본`
      ));
      if (!copy) throw new Error("사용 가능한 원고 복사본이 라이브러리에 없습니다.");
      expect(copy.id).toBe(committed.project.id);
      const copiedDocuments = readStudioProjectDocuments(storage, copy.id).documents;
      expect(copiedDocuments).toHaveLength(1);
      const [copiedDocument] = copiedDocuments;
      if (!copiedDocument) throw new Error("복제된 원고가 없습니다.");
      expect(copiedDocument).toMatchObject({ projectId: copy.id, pageCount: 2, width: 800, height: 1200 });
      expect(copiedDocument.id).not.toBe(sourceDocument.id);
      const copiedKey = studioAutosaveKey({ userId: null, workId: copiedDocument.id });
      const reopened = await sqlite.read(copiedKey);
      if (reopened?.state !== "snapshot") throw new Error("복제본의 원고를 내구 저장소에서 다시 읽을 수 없습니다.");
      const ids = reopened.payload.pagesList.map(({ id }) => id);
      expect(new Set(ids).size).toBe(2);
      expect(ids.every((id) => !SOURCE_PAYLOAD.pagesList.some((page) => page.id === id))).toBe(true);
      expect(reopened.payload.currentPageId).toBe(ids[1]);
      expect(reopened.payload.pagesList.map(({ elements, canvasH }) => ({ elements, canvasH })))
        .toEqual(SOURCE_PAYLOAD.pagesList.map(({ elements, canvasH }) => ({ elements, canvasH })));
      expect(await readOriginal()).toEqual(original);
      expect(copyOperation).toHaveBeenCalledTimes(1);
      expect(copyOperation).toHaveBeenCalledWith(source.id, expect.objectContaining({ storage, authUserId: null }));
      return { project: copy, document: copiedDocument };
    },
  };
}
