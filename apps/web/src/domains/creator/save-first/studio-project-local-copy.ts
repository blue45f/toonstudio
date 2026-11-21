import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

import type { StudioAutosavePayload } from "../studio-autosave";
import type { PageState } from "../studio-page-state";
import { readStudioProjectDocuments } from "../studio-project-document-store";
import { readStudioProjectLibrary } from "../studio-project-library-store";

import { commitStudioLocalProjectCopy, type StudioProjectPackageImportOptions } from "./studio-project-package-import";
import { readStudioSaveProfiles } from "./studio-save-profile";
import { collectStudioProjectWorkspaceSnapshots, type StudioProjectWorkspaceSnapshotReader } from "./studio-project-workspace-snapshots";

/** 원고 내용은 복제하되 외부 공유, 검토, 제출, 라이브 협업의 정체성이나 권위를 옮기지 않는다. */
export function localStudioCopyPayload(
  source: StudioAutosavePayload,
  savedAt: string,
  newPageId: () => string = () => createSecureRandomUuid("복제본 페이지 ID를 안전하게 만들 수 없습니다."),
): StudioAutosavePayload {
  const ids = new Map<unknown, string>();
  const used = new Set<unknown>(source.pagesList.map((page) => page.id));
  const pagesList = source.pagesList.map((sourcePage) => {
    const id = newPageId();
    if (!id || used.has(id)) throw new Error("복제본 페이지의 고유 ID를 만들지 못했습니다.");
    used.add(id);
    if (typeof sourcePage.id === "string") {
      if (ids.has(sourcePage.id)) throw new Error("원고에 중복된 페이지 ID가 있습니다.");
      ids.set(sourcePage.id, id);
    }
    const copy: typeof sourcePage & Pick<PageState, "review" | "dialogueReview"> = { ...sourcePage, id };
    delete copy.review;
    delete copy.dialogueReview;
    return copy;
  });
  return {
    version: source.version,
    savedAt,
    pagesList,
    currentPageId: ids.get(source.currentPageId) ?? pagesList[0]?.id,
    master: source.master,
    characterBible: source.characterBible,
    referenceBoard: source.referenceBoard,
    aiProvenance: source.aiProvenance,
    aiImageReferences: source.aiImageReferences,
    title: source.title,
    description: source.description,
    tagsText: source.tagsText,
    linkedTitleId: null,
    linkedSeriesId: null,
    linkedChallengeId: null,
    webtoonTheme: source.webtoonTheme,
    panelGutter: source.panelGutter,
  };
}

interface StudioProjectLocalCopyOptions extends StudioProjectPackageImportOptions {
  readonly reader?: StudioProjectWorkspaceSnapshotReader;
  readonly createPageId?: () => string;
}

export async function copyStudioProjectWithLocalWorkspace(
  sourceId: string,
  options: StudioProjectLocalCopyOptions,
) {
  const { storage, authUserId = null, reader } = options;
  const projects = readStudioProjectLibrary(storage).projects;
  const source = projects.find((project) => project.id === sourceId);
  if (source?.status !== "active") throw new Error("복제할 진행 중인 작업을 찾을 수 없습니다.");
  const documents = readStudioProjectDocuments(storage, source.id).documents
    .filter((document) => document.status !== "trashed");
  const sourceDocumentIds = new Set(documents.map(({ id }) => id));
  if (projects.some((project) => project.id !== source.id &&
    readStudioProjectDocuments(storage, project.id).documents.some(({ id }) => sourceDocumentIds.has(id)))) {
    throw new Error("다른 프로젝트와 원고 ID가 겹쳐 복제할 수 없습니다.");
  }
  // 프로젝트 ID로 공유하던 레거시 키는 문서 소유권이 모호하므로 원고 복제에서 읽지 않는다.
  const snapshots = await collectStudioProjectWorkspaceSnapshots({
    storage, projectId: source.id, documents,
    authUserId,
    // 로그인한 계정 키를 사용하는 호출에도 로그아웃/게스트 원고를 읽지 않는다.
    allowGuestFallback: false, requireReadableSource: true,
  }, reader);
  const profile = readStudioSaveProfiles(storage).profiles[source.id];
  const usesRemoteStorage = profile?.bindings.some((binding) => (
    binding.provider !== "browser" && binding.provider !== "local-file"
  ));
  if (usesRemoteStorage && (snapshots.length === 0 || snapshots.length < documents.length)) {
    throw new Error("이 기기에 없는 원고는 복제할 수 없습니다. 원고를 열어 기기에 저장한 후 다시 시도해 주세요.");
  }
  const now = options.now ?? new Date().toISOString();
  const copySuffix = " 복사본";
  let titleStem = "";
  for (const char of source.title) {
    if (titleStem.length + char.length > 120 - copySuffix.length) break;
    titleStem += char;
  }
  const title = titleStem.trimEnd() + copySuffix;
  const localProject = {
    ...source,
    title,
    thumbnailUrl: null,
    definition: source.definition ? { ...source.definition, collaboration: "solo" as const } : source.definition,
  };
  return commitStudioLocalProjectCopy(localProject, documents, new Map(
    snapshots.map(({ documentId, payload }) => [documentId, localStudioCopyPayload(payload, now, options.createPageId)]),
  ), { ...options, now });
}
