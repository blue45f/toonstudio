import { describe, expect, it } from "vitest";

import {
  readStudioAutosave,
  studioAutosaveKey,
  type StudioAutosavePayload,
} from "../studio-autosave";
import { createStudioProjectDefinition } from "../studio-project-definition";
import {
  readStudioProjectDocuments,
  type StudioProjectDocumentEntry,
} from "../studio-project-document-store";
import {
  readStudioProjectLibrary,
  type StudioProjectLibraryEntry,
} from "../studio-project-library-store";
import { buildStudioProjectPackage } from "./studio-project-package";
import { importStudioProjectPackage } from "./studio-project-package-import";
import { buildStudioProjectWorkspacePackageEntries } from "./studio-project-workspace-snapshots";
import {
  createDefaultStudioSaveProfile,
  studioSaveProfileForProject,
} from "./studio-save-profile";
import {
  readStudioSubmissions,
  studioSubmissionsForProject,
  type StudioSubmission,
} from "./studio-submission-store";

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

function allStorageText(target: Storage): string {
  const parts: string[] = [];
  for (let index = 0; index < target.length; index += 1) {
    const key = target.key(index);
    if (key) parts.push(target.getItem(key) ?? "");
  }
  return parts.join("\n");
}

const SOURCE_NOW = "2026-09-16T00:00:00.000Z";
const IMPORT_NOW = "2026-09-17T09:30:00.000Z";
const REIMPORT_NOW = "2026-09-18T12:00:00.000Z";

const sourceProject: StudioProjectLibraryEntry = Object.freeze({
  id: "source-project",
  title: "왕복 검증 웹툰 📚",
  kind: "webtoon",
  status: "active",
  statusBeforeTrash: null,
  templateId: "webtoon-vertical",
  description: "백업 왕복에서 한 글자도 바뀌면 안 되는 설명\n둘째 줄 — ünïcode",
  primaryLocale: "ko-KR",
  createdAt: SOURCE_NOW,
  updatedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedAt: "2026-09-16T00:30:00.000Z",
  lastOpenedDocumentId: "episode-2",
  thumbnailUrl: "https://example.invalid/roundtrip-thumb.png",
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

const sourceDocuments: readonly StudioProjectDocumentEntry[] = Object.freeze([
  Object.freeze({
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
    pageCount: 3,
    createdAt: SOURCE_NOW,
    updatedAt: "2026-09-16T00:30:00.000Z",
    lastOpenedAt: "2026-09-16T00:30:00.000Z",
  }),
  Object.freeze({
    id: "episode-2",
    projectId: sourceProject.id,
    title: "EP02 콘티",
    kind: "storyboard",
    status: "active",
    statusBeforeTrash: null,
    defaultWorkspace: "storyboard",
    allowedWorkspaces: ["storyboard", "draw", "motion", "review"] as const,
    width: 1920,
    height: 1080,
    pageCount: 1,
    createdAt: SOURCE_NOW,
    updatedAt: "2026-09-16T00:30:00.000Z",
    lastOpenedAt: "2026-09-16T00:30:00.000Z",
  }),
]);

const sourceSnapshots: Readonly<Record<string, StudioAutosavePayload>> = {
  "episode-1": {
    version: 2,
    savedAt: "2026-09-16T00:30:00.000Z",
    currentPageId: "page-2",
    pagesList: [
      {
        id: "page-1",
        canvasH: 1200,
        elements: [
          { id: "ink-1", type: "draw", points: [0.5, 1.25, 300.75, 1199.5], width: 3.5, opacity: 0.85, locked: false },
          { id: "line-1", type: "text", text: "대사 — “왕복해도 그대로”", fontSize: 21, color: "#112233" },
        ],
      },
      {
        id: "page-2",
        canvasH: 2400,
        elements: [
          { id: "tone-1", type: "shape", shape: "rect", x: 10, y: 20.5, w: 300, h: 400, fill: null, opacity: 0.35, visible: true },
          { id: "sfx-1", type: "text", text: "쾅!", rotation: -12.5, tags: ["효과음", "중요"] },
        ],
      },
    ],
  } as StudioAutosavePayload,
  "episode-2": {
    version: 2,
    savedAt: "2026-09-16T00:30:00.000Z",
    currentPageId: "board-1",
    pagesList: [
      {
        id: "board-1",
        canvasH: 1080,
        elements: [
          { id: "panel-1", type: "image", src: "asset://panel-1", x: 0, y: 0, w: 1920, h: 1080, memo: "카메라 고정" },
        ],
      },
    ],
  } as StudioAutosavePayload,
};

const sourceSubmission: StudioSubmission = Object.freeze({
  id: "submission-1",
  projectId: sourceProject.id,
  platform: "naver-webtoon",
  presetId: "webtoon-long-image",
  presetVersion: "3",
  sourceRevision: 7,
  status: "published",
  packageName: "ep01.zip",
  externalUrl: null,
  notes: "왕복 검증용 제출 기록",
  createdAt: SOURCE_NOW,
  updatedAt: "2026-09-16T00:30:00.000Z",
});

function sourcePackageFile(): File {
  const result = buildStudioProjectPackage({
    project: sourceProject,
    documents: sourceDocuments,
    profile: createDefaultStudioSaveProfile(sourceProject.id, {
      now: SOURCE_NOW,
      autoSave: false,
      createVersions: false,
    }),
    submissions: [sourceSubmission],
    exportedAt: "2026-09-16T01:00:00.000Z",
    additionalEntries: buildStudioProjectWorkspacePackageEntries(
      sourceDocuments,
      sourceDocuments.map((document) => ({
        documentId: document.id,
        key: `source-${document.id}`,
        authority: "memory-current" as const,
        savedAt: sourceSnapshots[document.id]!.savedAt,
        payload: sourceSnapshots[document.id]!,
      })),
    ),
  });
  return new File([result.blob], result.fileName, { type: result.blob.type });
}

function idFactory(prefix: string): () => string {
  let counter = 0;
  return () => `${prefix}-${(counter += 1)}`;
}

async function importInto(target: Storage, file: File, now: string, seed: string) {
  return importStudioProjectPackage(file, {
    storage: target,
    authUserId: "artist-1",
    now,
    createProjectId: idFactory(`${seed}-project`),
    createDocumentId: idFactory(`${seed}-document`),
  });
}

function canonicalProject(project: StudioProjectLibraryEntry) {
  return {
    title: project.title,
    kind: project.kind,
    status: project.status,
    statusBeforeTrash: project.statusBeforeTrash,
    templateId: project.templateId,
    description: project.description,
    primaryLocale: project.primaryLocale,
    thumbnailUrl: project.thumbnailUrl,
    definition: project.definition,
  };
}

function canonicalDocuments(documents: readonly StudioProjectDocumentEntry[]) {
  return documents
    .map((document) => ({
      title: document.title,
      kind: document.kind,
      status: document.status,
      statusBeforeTrash: document.statusBeforeTrash,
      defaultWorkspace: document.defaultWorkspace,
      allowedWorkspaces: [...document.allowedWorkspaces],
      width: document.width,
      height: document.height,
      pageCount: document.pageCount,
    }))
    .sort((left, right) => left.title.localeCompare(right.title));
}

describe("project package export → import roundtrip integrity", () => {
  it("preserves project, documents and manuscript payloads field-by-field", async () => {
    const target = storage();
    const result = await importInto(target, sourcePackageFile(), IMPORT_NOW, "rt1");

    // Project: content fields survive untouched; identity/time fields follow
    // the documented import contract (new id, import time, reopened state).
    expect(result.project.id).toBe("import-rt1-project-1");
    expect(canonicalProject(result.project)).toEqual(canonicalProject(sourceProject));
    expect(result.project.definition).toEqual(sourceProject.definition);
    expect(result.project.createdAt).toBe(IMPORT_NOW);
    expect(result.project.updatedAt).toBe(IMPORT_NOW);

    // Documents: both survive, ids remapped 1:1, geometry/workspaces intact.
    expect(result.documents).toHaveLength(2);
    expect(canonicalDocuments(result.documents)).toEqual(canonicalDocuments(sourceDocuments));
    expect(new Set(result.documents.map((document) => document.id)).size).toBe(2);
    for (const document of result.documents) {
      expect(document.projectId).toBe(result.project.id);
      expect(document.id.startsWith("import-document-")).toBe(true);
      expect(document.createdAt).toBe(IMPORT_NOW);
    }

    // lastOpenedDocumentId is remapped to the imported counterpart, and the
    // returned href opens that same document.
    const importedStoryboard = result.documents.find((document) => document.title === "EP02 콘티")!;
    expect(result.project.lastOpenedDocumentId).toBe(importedStoryboard.id);
    expect(result.href).toContain(`/studio/p/${result.project.id}/d/${importedStoryboard.id}`);

    // Manuscript payloads: deep-equal, not just "contains a marker string".
    expect(result.restoredSnapshotCount).toBe(2);
    for (const sourceDocument of sourceDocuments) {
      const imported = result.documents.find((document) => document.title === sourceDocument.title)!;
      const recovered = readStudioAutosave(target, studioAutosaveKey({
        userId: "artist-1",
        workId: imported.id,
      }));
      expect(recovered?.payload).toEqual(sourceSnapshots[sourceDocument.id]);
    }

    // Save profile preferences (the two fields the package carries) survive
    // with their non-default values, and the imported backup binding is synced.
    const profile = studioSaveProfileForProject(target, result.project.id);
    expect(profile.autoSave).toBe(false);
    expect(profile.createVersions).toBe(false);
    expect(profile.bindings.some((binding) => (
      binding.id === "local-file:imported" && binding.syncState === "synced"
    ))).toBe(true);
  });

  it("is stable across a second export → import roundtrip", async () => {
    const first = storage();
    const firstResult = await importInto(first, sourcePackageFile(), IMPORT_NOW, "rt1");

    const firstDocuments = readStudioProjectDocuments(first, firstResult.project.id).documents;
    const restoredSnapshots = firstDocuments.map((document) => {
      const recovered = readStudioAutosave(first, studioAutosaveKey({
        userId: "artist-1",
        workId: document.id,
      }));
      return {
        documentId: document.id,
        key: `restored-${document.id}`,
        authority: "memory-current" as const,
        savedAt: recovered!.payload.savedAt,
        payload: recovered!.payload,
      };
    });
    const repackaged = buildStudioProjectPackage({
      project: firstResult.project,
      documents: firstDocuments,
      profile: studioSaveProfileForProject(first, firstResult.project.id),
      exportedAt: "2026-09-18T11:00:00.000Z",
      additionalEntries: buildStudioProjectWorkspacePackageEntries(firstDocuments, restoredSnapshots),
    });

    const second = storage();
    const secondResult = await importInto(
      second,
      new File([repackaged.blob], repackaged.fileName, { type: repackaged.blob.type }),
      REIMPORT_NOW,
      "rt2",
    );

    expect(canonicalProject(secondResult.project)).toEqual(canonicalProject(firstResult.project));
    expect(canonicalDocuments(secondResult.documents)).toEqual(canonicalDocuments(firstResult.documents));
    expect(secondResult.restoredSnapshotCount).toBe(2);
    for (const sourceDocument of sourceDocuments) {
      const imported = secondResult.documents.find((document) => document.title === sourceDocument.title)!;
      const recovered = readStudioAutosave(second, studioAutosaveKey({
        userId: "artist-1",
        workId: imported.id,
      }));
      expect(recovered?.payload).toEqual(sourceSnapshots[sourceDocument.id]);
    }
  });

  it("rejects a byte-tampered package and leaves storage untouched", async () => {
    const file = sourcePackageFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const titleBytes = new TextEncoder().encode("왕복 검증");
    let titleOffset = -1;
    for (let index = 0; index + titleBytes.length <= bytes.length; index += 1) {
      if (titleBytes.every((byte, offset) => bytes[index + offset] === byte)) {
        titleOffset = index;
        break;
      }
    }
    expect(titleOffset).toBeGreaterThanOrEqual(0);
    bytes[titleOffset] = (bytes[titleOffset]! ^ 0xff) & 0xff;

    const target = storage();
    await expect(importInto(
      target,
      new File([bytes], file.name, { type: file.type }),
      IMPORT_NOW,
      "tampered",
    )).rejects.toThrow();
    expect(readStudioProjectLibrary(target).projects).toEqual([]);
    expect(allStorageText(target)).not.toContain("왕복");
  });

  it("rejects a truncated package and leaves storage untouched", async () => {
    const file = sourcePackageFile();
    const bytes = new Uint8Array(await file.arrayBuffer());
    const truncated = bytes.slice(0, Math.floor(bytes.length / 2));

    const target = storage();
    await expect(importInto(
      target,
      new File([truncated], file.name, { type: file.type }),
      IMPORT_NOW,
      "truncated",
    )).rejects.toThrow();
    expect(readStudioProjectLibrary(target).projects).toEqual([]);
  });

  it("restores distribution submissions re-linked to the imported project (C5 fix, 2026-10-22)", async () => {
    const target = storage();
    const result = await importInto(target, sourcePackageFile(), IMPORT_NOW, "rt1");
    // 예전에는 패키지가 제출 기록을 실어도 가져오기가 버렸다. 이제는 새
    // 프로젝트 id로 재연결해 되살리고, 내용 필드는 원본 그대로 보존한다.
    expect(result.restoredSubmissionCount).toBe(1);
    const restored = studioSubmissionsForProject(target, result.project.id);
    expect(restored).toHaveLength(1);
    expect(restored[0]).toEqual({
      ...sourceSubmission,
      projectId: result.project.id,
    });
    // 남의 프로젝트 기록으로는 붙지 않는다.
    expect(readStudioSubmissions(target).submissions.filter(
      (submission) => submission.projectId === sourceProject.id,
    )).toEqual([]);
  });

  it("re-importing the same package does not collide submission ids", async () => {
    const target = storage();
    const first = await importInto(target, sourcePackageFile(), IMPORT_NOW, "rt1");
    const second = await importInto(target, sourcePackageFile(), REIMPORT_NOW, "rt2");
    const all = readStudioSubmissions(target).submissions;
    expect(all).toHaveLength(2);
    expect(new Set(all.map((submission) => submission.id)).size).toBe(2);
    expect(studioSubmissionsForProject(target, first.project.id)).toHaveLength(1);
    expect(studioSubmissionsForProject(target, second.project.id)).toHaveLength(1);
  });

  it("does not restore a device-local blob: thumbnail", async () => {
    const blobProject: StudioProjectLibraryEntry = Object.freeze({
      ...sourceProject,
      thumbnailUrl: "blob:https://example.invalid/local-only",
    });
    const result = buildStudioProjectPackage({
      project: blobProject,
      documents: sourceDocuments,
      profile: createDefaultStudioSaveProfile(blobProject.id, { now: SOURCE_NOW }),
      exportedAt: "2026-09-16T01:00:00.000Z",
      additionalEntries: buildStudioProjectWorkspacePackageEntries(sourceDocuments, []),
    });
    const target = storage();
    const imported = await importInto(
      target,
      new File([result.blob], result.fileName, { type: result.blob.type }),
      IMPORT_NOW,
      "blobthumb",
    );
    // blob: 참조는 만든 기기 밖에서 깨진 링크가 되므로 null로 떨어진다.
    expect(imported.project.thumbnailUrl).toBeNull();
  });
});
