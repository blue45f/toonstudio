import { describe, expect, it, vi } from "vitest";

import { studioAutosaveKey, type StudioAutosavePayload } from "../studio-autosave";
import type { PageState } from "../studio-page-state";
import { createStudioProjectDefinition } from "../studio-project-definition";
import { createStudioProjectDocument, readStudioProjectDocuments } from "../studio-project-document-store";
import { createStudioProject, markStudioProjectOpened, readStudioProjectLibrary, STUDIO_PROJECT_LIBRARY_STORAGE_KEY } from "../studio-project-library-store";

import { importedTestPorts, readImportedTestSnapshot } from "./studio-project-package-import-test-fixture";
import { copyStudioProjectWithLocalWorkspace } from "./studio-project-local-copy";
import { createDefaultStudioSaveProfile, readStudioSaveProfiles, STUDIO_SAVE_PROFILE_STORAGE_KEY, upsertStudioStorageBinding, writeStudioSaveProfiles } from "./studio-save-profile";

const NOW = "2026-11-21T00:00:00.000Z";
const originalArtwork = { id: "cut-1", type: "frame", x: 15, y: 20, width: 120, height: 160, bgColor: "#d03935" };
const sourceEditorial = {
  note: "개인 콘티 메모", dialogueI18n: { "cut-1": { en: "Original translation" } },
  review: { status: "changes-requested", locked: true, assignee: "QA 리뷰 담당자", note: "비공개 검토 메모" },
  dialogueReview: { "cut-1": { en: "approved" } },
} satisfies Pick<PageState, "note" | "dialogueI18n" | "review" | "dialogueReview">;
const originalSnapshot: StudioAutosavePayload = {
  version: 2, savedAt: NOW, currentPageId: "old-page-2",
  pagesList: [{ id: "old-page-1", elements: [originalArtwork], canvasH: 1200, ...sourceEditorial },
    { id: "old-page-2", elements: [], canvasH: 1200 }],
  title: "원고", sourceWorkId: "remote-work-id", sourceRevision: 9,
  comments: { entries: [{ id: "secret-review-comment" }] },
  writerRoom: { reviews: ["private-review"] },
  releaseSchedule: { state: "published" },
  publicationAnalytics: { visits: 10 },
  publishPack: { state: "published" }, linkedTitleId: "published-title",
  linkedSeriesId: "published-series", linkedChallengeId: "submitted-challenge",
};

function fixture(authUserId: string | null) {
  const map = new Map<string, string>();
  const storage: Storage = {
    get length() { return map.size; }, clear: () => map.clear(),
    getItem: (key) => map.get(key) ?? null, key: (index) => [...map.keys()][index] ?? null,
    removeItem: (key) => { map.delete(key); }, setItem: (key, value) => { map.set(key, value); },
  };
  const project = createStudioProject(storage, {
    id: "original", title: "원본 작품", kind: "webtoon", createdAt: NOW,
    definition: createStudioProjectDefinition({
      format: "vertical-webtoon", collaboration: "team", primaryWorkspace: "webtoon", enabledWorkspaces: ["webtoon"],
    }),
  });
  const doc = createStudioProjectDocument(storage, project.id, {
    id: "original-document", title: "본문", kind: "webtoon",
    defaultWorkspace: "comic", width: 800, height: 1200, pageCount: 2, createdAt: NOW,
  });
  markStudioProjectOpened(storage, project.id, doc.id, { at: NOW });
  writeStudioSaveProfiles(storage, {
    schemaVersion: 1, updatedAt: NOW, profiles: {
      [project.id]: { ...createDefaultStudioSaveProfile(project.id, { now: NOW }),
        accessMode: "public", distributionState: "published", lastPublicationAt: NOW },
    },
  });
  const sourceKey = studioAutosaveKey({ userId: authUserId, workId: doc.id });
  const read = vi.fn(async (key: string) => key === sourceKey ? {
    key, authority: "sqlite-fallback" as const, state: "snapshot" as const,
    savedAt: NOW, payload: originalSnapshot,
  } : null);
  let page = 0;
  const options = {
    storage, authUserId, now: NOW,
    reader: { read, dispose: async () => undefined },
    autosavePorts: importedTestPorts(storage),
    createProjectId: () => "project",
    createDocumentId: () => "manuscript",
    createPageId: () => `new-page-${++page}`,
  };
  return { storage, project, doc, sourceKey, read, options };
}

describe("로컬 원고 프로젝트 복제", () => {
  it.each([null, "artist-account"])("원래 원고와 분리된 복사본을 만들고 외부 권한·검토·발행을 옮기지 않는다 (%s)", async (authUserId) => {
    const { storage, project, doc, sourceKey, read, options } = fixture(authUserId);
    const originalDocs = readStudioProjectDocuments(storage, project.id);
    const originalProfile = readStudioSaveProfiles(storage).profiles[project.id];
    const originalJson = JSON.stringify(originalSnapshot);
    const copy = await copyStudioProjectWithLocalWorkspace(project.id, options);
    expect(copy.project).toMatchObject({ id: "copy-project", title: "원본 작품 복사본", definition: { collaboration: "solo" } });
    expect(copy.project.lastOpenedDocumentId).toBe("copy-document-manuscript");
    expect(copy.documents).toHaveLength(1);
    expect(copy.documents[0]).toMatchObject({ id: "copy-document-manuscript", projectId: "copy-project", width: 800, pageCount: 2 });
    expect(copy.href).toContain("copy-document-manuscript");
    expect(read).toHaveBeenCalledWith(sourceKey);
    expect(read).not.toHaveBeenCalledWith(studioAutosaveKey({ userId: authUserId, workId: project.id }));
    if (authUserId) expect(read).not.toHaveBeenCalledWith(studioAutosaveKey({ userId: null, workId: doc.id }));
    const key = studioAutosaveKey({ userId: authUserId, workId: "copy-document-manuscript" });
    const copied = (await readImportedTestSnapshot(storage, key))?.payload;
    expect(copied).toMatchObject({ currentPageId: "new-page-2", linkedSeriesId: null,
      pagesList: [{ id: "new-page-1", elements: [originalArtwork], note: sourceEditorial.note, dialogueI18n: sourceEditorial.dialogueI18n }, { id: "new-page-2", elements: [] }] });
    expect(copied?.pagesList[0]).not.toHaveProperty("review");
    expect(copied?.pagesList[0]).not.toHaveProperty("dialogueReview");
    expect(originalSnapshot.pagesList[0]).toMatchObject(sourceEditorial);
    for (const field of ["comments", "writerRoom", "releaseSchedule", "publicationAnalytics", "publishPack", "sourceWorkId", "sourceRevision"] as const) {
      expect(copied?.[field]).toBeUndefined();
    }
    expect(copy.restoredSubmissionCount).toBe(0);
    const profile = readStudioSaveProfiles(storage).profiles[copy.project.id];
    expect(profile).toMatchObject({ accessMode: "owner-only", distributionState: "none", lastPublicationAt: null });
    expect(profile?.bindings.every((binding) => binding.provider === "browser" && !binding.remotePath)).toBe(true);
    expect(readStudioSaveProfiles(storage).profiles[project.id]).toEqual(originalProfile);
    expect(readStudioProjectDocuments(storage, project.id)).toEqual(originalDocs);
    expect(JSON.stringify(originalSnapshot)).toBe(originalJson);
  });

  it("다른 프로젝트와 겹치는 원고 ID를 읽거나 복제하지 않는다", async () => {
    const { storage, project, doc, read, options } = fixture(null);
    const other = createStudioProject(storage, { id: "other", title: "다른 작품", kind: "webtoon" });
    createStudioProjectDocument(storage, other.id, {
      id: doc.id, title: "다른 원고", kind: "webtoon", defaultWorkspace: "comic",
    });
    await expect(copyStudioProjectWithLocalWorkspace(project.id, options)).rejects.toThrow("원고 ID가 겹쳐");
    expect(read).not.toHaveBeenCalled();
    expect(readStudioProjectLibrary(storage).projects.map(({ id }) => id).sort()).toEqual(["original", "other"].sort());
  });

  it("원본을 읽지 못하면 빈 복사본을 성공으로 표시하지 않는다", async () => {
    const { storage, project, read, options } = fixture(null);
    read.mockRejectedValue(new Error("원본 저널을 읽을 수 없습니다."));
    await expect(copyStudioProjectWithLocalWorkspace(project.id, options)).rejects.toThrow("원본 저널");
    expect(readStudioProjectLibrary(storage).projects.map((item) => item.id)).toEqual([project.id]);
  });

  it("원격 저장소의 원고를 기기에서 찾지 못하면 빈 복제본을 만들지 않는다", async () => {
    const { storage, project, read, options } = fixture("artist-account");
    read.mockResolvedValue(null);
    upsertStudioStorageBinding(storage, project.id, { id: "cloud-original", provider: "toonstudio-cloud", role: "canonical" }, { now: NOW });
    await expect(copyStudioProjectWithLocalWorkspace(project.id, options)).rejects.toThrow("이 기기에 없는 원고");
    expect(readStudioProjectLibrary(storage).projects.map((item) => item.id)).toEqual([project.id]);
  });

  it("복사본 메타데이터 쓰기 실패 시 원본 기록을 그대로 보존하고 복제본을 남기지 않는다", async () => {
    const { storage, project, options } = fixture(null);
    const originalLibrary = storage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY);
    const originalProfiles = storage.getItem(STUDIO_SAVE_PROFILE_STORAGE_KEY);
    const write = storage.setItem;
    storage.setItem = (key, value) => {
      if (key === STUDIO_SAVE_PROFILE_STORAGE_KEY && value.includes('"copy-project"')) throw new Error("용량 부족");
      write(key, value);
    };
    await expect(copyStudioProjectWithLocalWorkspace(project.id, options)).rejects.toThrow("용량 부족");
    expect(storage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY)).toBe(originalLibrary);
    expect(storage.getItem(STUDIO_SAVE_PROFILE_STORAGE_KEY)).toBe(originalProfiles);
    expect(readStudioProjectDocuments(storage, "copy-project").documents).toEqual([]);
    const key = studioAutosaveKey({ userId: null, workId: "copy-document-manuscript" });
    expect(await readImportedTestSnapshot(storage, key)).toBeNull();
  });
});
