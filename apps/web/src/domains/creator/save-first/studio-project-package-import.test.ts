import { describe, expect, it } from "vitest";

import {
  readStudioAutosave,
  studioAutosaveKey,
  writeStudioLifecycleAutosave,
  type StudioAutosavePayload,
} from "../studio-autosave";
import {
  readStudioProjectDocuments,
  type StudioProjectDocumentEntry,
} from "../studio-project-document-store";
import {
  readStudioProjectLibrary,
  type StudioProjectLibraryEntry,
} from "../studio-project-library-store";
import { buildStudioProjectPackage } from "./studio-project-package";
import { createStudioProjectDefinition } from "../studio-project-definition";
import { importedTestPorts, importedTestSqlite, readImportedTestSnapshot } from "./studio-project-package-import-test-fixture";
import { importStudioProjectPackage } from "./studio-project-package-import";
import {
  buildStudioProjectWorkspacePackageEntries,
} from "./studio-project-workspace-snapshots";
import {
  createDefaultStudioSaveProfile,
  studioSaveProfileForProject,
  studioSaveProfileNeedsDestination,
} from "./studio-save-profile";

function storage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    clear: () => values.clear(),
    getItem: (key) => values.get(key) ?? null,
    key: (index) => [...values.keys()][index] ?? null,
    removeItem: (key) => { values.delete(key); },
    setItem: (key, value) => { values.set(key, value); },
  };
}

const sourceProject: StudioProjectLibraryEntry = Object.freeze({
  id: "source-project",
  title: "복원할 웹툰",
  kind: "webtoon",
  status: "active",
  statusBeforeTrash: null,
  templateId: "webtoon-vertical",
  description: "원고가 포함된 프로젝트",
  primaryLocale: "ko-KR",
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedDocumentId: "episode-1",
  thumbnailUrl: null,
  definition: createStudioProjectDefinition({
    format: "vertical-webtoon",
    purpose: "serial",
    startPoint: "script",
    collaboration: "team",
    primaryWorkspace: "webtoon",
    enabledWorkspaces: ["webtoon", "storyboard", "design", "review"],
    deliveryProfileIds: ["webtoon-long-image", "episode-package"],
  }),
});

const sourceDocument: StudioProjectDocumentEntry = Object.freeze({
  id: "episode-1",
  projectId: sourceProject.id,
  title: "EP01 원고",
  kind: "webtoon",
  status: "active",
  statusBeforeTrash: null,
  defaultWorkspace: "comic",
  allowedWorkspaces: ["comic", "draw", "image", "localization", "review"] as const,
  width: 800,
  height: 1200,
  pageCount: 1,
  createdAt: "2026-09-16T00:00:00.000Z",
  updatedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedAt: "2026-09-16T00:30:00.000Z",
});

const sourceSnapshot: StudioAutosavePayload = {
  version: 2,
  savedAt: "2026-09-16T00:30:00.000Z",
  currentPageId: "page-1",
  pagesList: [{
    id: "page-1",
    canvasH: 1200,
    elements: [{ id: "ink-1", type: "draw", points: [1, 2, 3, 4] }],
  }],
} as StudioAutosavePayload;

function packageFile(withWorkspace = true): File {
  const result = buildStudioProjectPackage({
    project: sourceProject,
    documents: [sourceDocument],
    profile: createDefaultStudioSaveProfile(sourceProject.id, {
      now: sourceProject.createdAt,
    }),
    exportedAt: "2026-09-16T01:00:00.000Z",
    additionalEntries: withWorkspace
      ? buildStudioProjectWorkspacePackageEntries([sourceDocument], [{
          documentId: sourceDocument.id,
          key: "source-autosave",
          authority: "memory-current",
          savedAt: sourceSnapshot.savedAt,
          payload: sourceSnapshot,
        }])
      : undefined,
  });
  return new File([result.blob], result.fileName, { type: result.blob.type });
}

describe("ToonStudio project package import", () => {
  it.each([
    ["Atelier.toonstudio 2", ""],
    ["Atelier", "application/vnd.toonstudio.package+zip"],
  ])("파일 선택에서 인식한 작업 파일 %s의 본문도 복원한다", async (name, mime) => {
    const target = storage();
    const archive = new File([packageFile()], name, { type: mime });
    const result = await importStudioProjectPackage(archive, {
      storage: target, autosavePorts: importedTestPorts(target),
    });
    const key = studioAutosaveKey({ userId: null, workId: result.documents[0]!.id });
    expect((await readImportedTestSnapshot(target, key))?.payload.currentPageId).toBe("page-1");
  });

  it("실행 파일 이름은 프로젝트 MIME을 지정해도 가져오지 않는다", async () => {
    const target = storage();
    const archive = new File([packageFile()], "Atelier.toonstudio 2.exe", { type: "application/vnd.toonstudio.package+zip" });
    await expect(importStudioProjectPackage(archive, { storage: target })).rejects.toThrow("유효한 .toonstudio");
    expect(target.length).toBe(0);
  });

  it("restores a package as a new local project without overwriting a colliding autosave", async () => {
    const target = storage();
    const collidingKey = studioAutosaveKey({ userId: "artist-1", workId: sourceDocument.id });
    const existingSnapshot = {
      ...sourceSnapshot,
      savedAt: "2026-09-16T01:30:00.000Z",
      currentPageId: "existing-page",
      pagesList: [{ id: "existing-page", canvasH: 1200, elements: [{ id: "existing-ink", type: "draw" }] }],
    } as StudioAutosavePayload;
    writeStudioLifecycleAutosave(target, collidingKey, existingSnapshot, { preservePrimary: false });

    const result = await importStudioProjectPackage(packageFile(), {
      storage: target, autosavePorts: importedTestPorts(target),
      authUserId: "artist-1",
      now: "2026-09-16T02:00:00.000Z",
      createProjectId: () => "fixed-id",
      createDocumentId: () => "fixed-id",
    });

    const importedDocumentId = "import-document-fixed-id";
    expect(result.project.id).toBe("import-fixed-id");
    expect(result.restoredSnapshotCount).toBe(1);
    expect(result.href).toContain(`/studio/p/import-fixed-id/d/${importedDocumentId}`);
    expect(readStudioProjectLibrary(target).projects).toHaveLength(1);
    expect(result.project.definition).toEqual(sourceProject.definition);
    expect(readStudioProjectDocuments(target, result.project.id).documents[0]).toMatchObject({
      id: importedDocumentId,
      projectId: result.project.id,
      title: sourceDocument.title,
    });
    const recovered = await readImportedTestSnapshot(target, studioAutosaveKey({
      userId: "artist-1",
      workId: importedDocumentId,
    }));
    expect(recovered?.payload.currentPageId).toBe("page-1");
    expect(JSON.stringify(recovered?.payload)).toContain("ink-1");
    expect(readStudioAutosave(target, collidingKey)?.payload.currentPageId).toBe("existing-page");
    const profile = studioSaveProfileForProject(target, result.project.id);
    expect(studioSaveProfileNeedsDestination(profile)).toBe(false);
    expect(profile.bindings.some((binding) => (
      binding.id === "local-file:imported" && binding.syncState === "synced"
    ))).toBe(true);
  });

  it("rejects old metadata-only project files instead of presenting an empty restored canvas", async () => {
    const target = storage();
    await expect(importStudioProjectPackage(packageFile(false), {
      storage: target, autosavePorts: importedTestPorts(target),
      createProjectId: () => "fixed-id",
      createDocumentId: () => "fixed-id",
    })).rejects.toThrow(/필수 파일|원고/u);
    expect(readStudioProjectLibrary(target).projects).toEqual([]);
  });

  it("preserves archived/trashed statuses, skips trashed documents when selecting initial href, and restores profile fields", async () => {
    const target = storage();
    const trashedDoc: StudioProjectDocumentEntry = {
      ...sourceDocument,
      id: "episode-1",
      status: "trashed",
      statusBeforeTrash: "archived",
    };
    const archivedDoc: StudioProjectDocumentEntry = {
      ...sourceDocument,
      id: "episode-2",
      title: "EP02 보관 원고",
      status: "archived",
      statusBeforeTrash: null,
      defaultWorkspace: "3d" as StudioProjectDocumentEntry["defaultWorkspace"],
      allowedWorkspaces: ["draw", "comic"] as const,
    };
    const archivedProject: StudioProjectLibraryEntry = {
      ...sourceProject,
      status: "archived",
      lastOpenedDocumentId: trashedDoc.id,
    };
    const baseProfile = {
      ...createDefaultStudioSaveProfile(sourceProject.id, { now: sourceProject.createdAt }),
      accessMode: "collaborators" as const,
      distributionState: "published" as const,
      revision: 7,
      lastExportAt: "2026-09-16T00:40:00.000Z",
    };
    const pkg = buildStudioProjectPackage({
      project: archivedProject,
      documents: [trashedDoc, archivedDoc],
      profile: baseProfile,
      exportedAt: "2026-09-16T01:00:00.000Z",
      additionalEntries: buildStudioProjectWorkspacePackageEntries([trashedDoc, archivedDoc], [
        {
          documentId: trashedDoc.id,
          key: "trashed-autosave",
          authority: "memory-current",
          savedAt: sourceSnapshot.savedAt,
          payload: sourceSnapshot,
        },
        {
          documentId: archivedDoc.id,
          key: "archived-autosave",
          authority: "memory-current",
          savedAt: sourceSnapshot.savedAt,
          payload: sourceSnapshot,
        },
      ]),
    });
    const file = new File([pkg.blob], pkg.fileName, { type: pkg.blob.type });
    let docSeq = 0;
    const result = await importStudioProjectPackage(file, {
      storage: target, autosavePorts: importedTestPorts(target),
      authUserId: "artist-1",
      now: "2026-09-16T02:00:00.000Z",
      createProjectId: () => "archived-proj",
      createDocumentId: () => `doc-${++docSeq}`,
    });

    expect(result.project.status).toBe("archived");
    expect(result.project.lastOpenedDocumentId).toBe("import-document-doc-2");
    expect(result.href).toContain("/studio/p/import-archived-proj/d/import-document-doc-2?workspace=comic");
    const docs = readStudioProjectDocuments(target, result.project.id).documents;
    expect(docs.find((d) => d.id === "import-document-doc-1")).toMatchObject({
      status: "trashed",
      statusBeforeTrash: "archived",
    });
    expect(docs.find((d) => d.id === "import-document-doc-2")).toMatchObject({
      status: "archived",
      defaultWorkspace: "comic",
    });
    const restoredProfile = studioSaveProfileForProject(target, result.project.id);
    expect(restoredProfile.accessMode).toBe("collaborators");
    expect(restoredProfile.distributionState).toBe("published");
    expect(restoredProfile.revision).toBe(7);
  });

  it("rolls back newly created keys and restores previous storage when a write fails mid-import", async () => {
    const base = storage();
    let failWrites = false;
    const quotaStorage: Storage = {
      get length() { return base.length; },
      clear: () => base.clear(),
      getItem: (k) => base.getItem(k),
      key: (i) => base.key(i),
      removeItem: (k) => base.removeItem(k),
      setItem: (k, v) => {
        if (failWrites && k.includes("save-profile")) {
          const err = new Error("QuotaExceededError");
          err.name = "QuotaExceededError";
          throw err;
        }
        base.setItem(k, v);
      },
    };
    failWrites = true;
    await expect(importStudioProjectPackage(packageFile(), {
      storage: quotaStorage, autosavePorts: importedTestPorts(quotaStorage),
      authUserId: "artist-1",
      createProjectId: () => "rollback-id",
      createDocumentId: () => "rollback-doc",
    })).rejects.toThrow(/QuotaExceededError/);
    expect(readStudioProjectLibrary(base).projects).toEqual([]);
    expect(await importedTestSqlite(quotaStorage).read(studioAutosaveKey({ userId: "artist-1", workId: "import-document-rollback-doc" }))).toMatchObject({ state: "cleared" });
    expect(readStudioProjectDocuments(base, "import-rollback-id").documents).toEqual([]);
  });

  it("Blob/File 읽기 도중 AbortSignal이 취소되면 ABORTED/AbortError로 분리하고 기존 프로젝트를 보존한다", async () => {
    const store = storage();
    await importStudioProjectPackage(packageFile(), {
      storage: store, autosavePorts: importedTestPorts(store),
      authUserId: "artist-1",
      createProjectId: () => "existing-project",
      createDocumentId: () => "existing-doc",
    });
    const beforeProjects = readStudioProjectLibrary(store).projects;
    expect(beforeProjects).toHaveLength(1);

    const controller = new AbortController();
    const file = packageFile();
    const originalSlice = file.slice.bind(file);
    let sliceCalls = 0;
    Object.defineProperty(file, "slice", {
      value: (start?: number, end?: number, contentType?: string) => {
        sliceCalls += 1;
        if (sliceCalls >= 2) {
          controller.abort();
        }
        return originalSlice(start, end, contentType);
      },
    });

    await expect(
      importStudioProjectPackage(file, {
        storage: store, autosavePorts: importedTestPorts(store),
        authUserId: "artist-1",
        signal: controller.signal,
        createProjectId: () => "aborted-project",
        createDocumentId: () => "aborted-doc",
      }),
    ).rejects.toMatchObject({ code: "ABORTED" });

    expect(readStudioProjectLibrary(store).projects).toEqual(beforeProjects);
    expect(readStudioProjectDocuments(store, "import-aborted-project").documents).toEqual([]);
  });

  it("distinguishes incompatible future snapshot versions from corruption while keeping existing projects untouched", async () => {
    const store = storage();
    await importStudioProjectPackage(packageFile(), {
      storage: store, autosavePorts: importedTestPorts(store),
      authUserId: "artist-1",
      createProjectId: () => "existing-project",
      createDocumentId: () => "existing-doc",
    });
    const beforeProjects = readStudioProjectLibrary(store).projects;

    const futureSnapshotPkg = buildStudioProjectPackage({
      project: sourceProject,
      documents: [sourceDocument],
      profile: createDefaultStudioSaveProfile(sourceProject.id, { now: sourceProject.createdAt }),
      exportedAt: "2026-09-16T01:00:00.000Z",
      additionalEntries: buildStudioProjectWorkspacePackageEntries([sourceDocument], [{
        documentId: sourceDocument.id,
        key: "future-autosave",
        authority: "memory-current",
        savedAt: sourceSnapshot.savedAt,
        payload: { ...sourceSnapshot, version: 99 } as unknown as StudioAutosavePayload,
      }]),
    });
    const futureFile = new File([futureSnapshotPkg.blob], futureSnapshotPkg.fileName, {
      type: futureSnapshotPkg.blob.type,
    });

    await expect(
      importStudioProjectPackage(futureFile, {
        storage: store, autosavePorts: importedTestPorts(store),
        authUserId: "artist-1",
        createProjectId: () => "future-project",
        createDocumentId: () => "future-doc",
      }),
    ).rejects.toThrow(/지원하지 않는 상위 버전.*v99/u);
    expect(readStudioProjectLibrary(store).projects).toEqual(beforeProjects);
  });
});

