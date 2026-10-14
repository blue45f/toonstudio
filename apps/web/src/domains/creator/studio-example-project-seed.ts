import {
  ensureStudioSaveProfile,
  readStudioSaveProfiles,
  recordStudioManualSave,
} from "./save-first/studio-save-profile";
import { serializeStudioAutosave, studioAutosaveKey } from "./studio-autosave";
import {
  EXAMPLE_DOCUMENT_HEIGHT,
  EXAMPLE_DOCUMENT_ID,
  EXAMPLE_DOCUMENT_TITLE,
  EXAMPLE_DOCUMENT_WIDTH,
  EXAMPLE_EDITOR_HREF,
  EXAMPLE_PROJECT_DESCRIPTION,
  EXAMPLE_PROJECT_ID,
  EXAMPLE_PROJECT_TITLE,
  buildExampleProjectPage,
} from "./studio-example-project-content";
import {
  createStudioProjectDocument,
  readStudioProjectDocuments,
} from "./studio-project-document-store";
import { MAX_PROJECTS } from "./studio-project-library-reader";
import {
  createStudioProject,
  markStudioProjectOpened,
  readStudioProjectLibrary,
  type StudioProjectLibraryEntry,
  type StudioProjectLibraryEventTarget,
} from "./studio-project-library-store";

/**
 * 신규 계정(기기) 예제 프로젝트 시딩.
 *
 * 이 앱의 라이브러리는 로컬 우선(localStorage가 정본, 로그인 시 서버로 동기화)이라
 * "가입 직후 시딩"의 실제 자리는 계정 생성이 아니라 라이브러리 첫 진입이다.
 * 서버(studio-project-library.service)는 동기화 전용이라 서버에서 심으면
 * 다음 동기화 병합과 충돌한다 — 그래서 여기서 로컬 정본에 한 번만 심는다.
 *
 * 멱등 계약:
 * - 고정 id(`example-first-webtoon`)가 이미 있으면 다시 만들지 않는다.
 * - 사용자가 예제 원고를 고친 뒤에는 자동저장 키가 있으므로 절대 덮지 않는다.
 * - 사용자가 휴지통에 버린 예제는 되살리지 않는다(상태만 돌려준다).
 */

export interface StudioExampleSeedStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type ExampleProjectSeedResult =
  | {
      readonly status: "seeded" | "already-seeded";
      readonly project: StudioProjectLibraryEntry;
      readonly documentId: string;
      readonly editorHref: string;
    }
  | { readonly status: "trashed"; readonly project: StudioProjectLibraryEntry }
  | { readonly status: "full"; readonly project: null };

export function exampleProjectEditorHref(): string {
  return EXAMPLE_EDITOR_HREF;
}

function ensureExampleDocument(
  storage: StudioExampleSeedStorage,
  at: string,
  target?: StudioProjectLibraryEventTarget,
): string {
  const existing = readStudioProjectDocuments(storage, EXAMPLE_PROJECT_ID)
    .documents.find((document) => document.status === "active");
  if (existing) return existing.id;
  return createStudioProjectDocument(storage, EXAMPLE_PROJECT_ID, {
    id: EXAMPLE_DOCUMENT_ID,
    title: EXAMPLE_DOCUMENT_TITLE,
    kind: "webtoon",
    createdAt: at,
    width: EXAMPLE_DOCUMENT_WIDTH,
    height: EXAMPLE_DOCUMENT_HEIGHT,
    pageCount: 1,
  }, { target }).id;
}

/**
 * 예제는 시스템이 미리 저장해 둔 완성본이다. 사용자의 미저장 임시 작업으로
 * 분류되면 "정식 저장" 요구가 뜨고 임시 작업 섹션을 차지하므로, 브라우저
 * 저장 프로필에 수동 저장 기록까지 남겨 "프로젝트" 섹션에 자리하게 한다.
 * 이미 기록이 있으면(사용자가 이후 다른 목적지로 저장했어도) 건드리지 않는다.
 */
function ensureExampleSaveProfile(
  storage: StudioExampleSeedStorage,
  at: string,
  target?: StudioProjectLibraryEventTarget,
): void {
  const profile = readStudioSaveProfiles(storage).profiles[EXAMPLE_PROJECT_ID];
  if (profile?.lastManualSaveAt) return;
  if (!profile) ensureStudioSaveProfile(storage, EXAMPLE_PROJECT_ID, { provider: "browser", now: at });
  recordStudioManualSave(storage, EXAMPLE_PROJECT_ID, { now: at, target });
}

function ensureExampleAutosave(storage: StudioExampleSeedStorage, at: string): void {
  const key = studioAutosaveKey({ workId: EXAMPLE_DOCUMENT_ID });
  // 자동저장이 이미 있으면 사용자가 만진 원고다 — 시딩은 절대 덮지 않는다.
  if (storage.getItem(key) !== null) return;
  const page = buildExampleProjectPage();
  storage.setItem(key, serializeStudioAutosave({
    version: 2,
    savedAt: at,
    title: EXAMPLE_PROJECT_TITLE,
    currentPageId: page.id,
    pagesList: [page],
  }));
}

export function ensureExampleProjectSeeded(
  storage: StudioExampleSeedStorage,
  options: {
    readonly at?: string;
    readonly target?: StudioProjectLibraryEventTarget;
  } = {},
): ExampleProjectSeedResult {
  const at = options.at ?? new Date().toISOString();
  const current = readStudioProjectLibrary(storage);
  const existing = current.projects.find((project) => project.id === EXAMPLE_PROJECT_ID);

  if (existing) {
    if (existing.status === "trashed") return { status: "trashed", project: existing };
    const documentId = ensureExampleDocument(storage, at, options.target);
    ensureExampleAutosave(storage, at);
    ensureExampleSaveProfile(storage, at, options.target);
    const project = existing.lastOpenedDocumentId === documentId
      ? existing
      : markStudioProjectOpened(storage, EXAMPLE_PROJECT_ID, documentId, {
        at,
        target: options.target,
      });
    return { status: "already-seeded", project, documentId, editorHref: EXAMPLE_EDITOR_HREF };
  }

  if (current.projects.length >= MAX_PROJECTS) return { status: "full", project: null };

  // 순서가 중요하다: 원고 문서와 자동저장(그림)을 먼저 놓고, 마지막에 프로젝트를
  // 만들면서 UPDATED 이벤트를 쏘면 라이브러리가 썸네일까지 갖춘 채로 다시 읽는다.
  const documentId = ensureExampleDocument(storage, at, options.target);
  ensureExampleAutosave(storage, at);
  ensureExampleSaveProfile(storage, at, options.target);
  createStudioProject(storage, {
    id: EXAMPLE_PROJECT_ID,
    title: EXAMPLE_PROJECT_TITLE,
    kind: "webtoon",
    templateId: "example-first-webtoon",
    description: EXAMPLE_PROJECT_DESCRIPTION,
    primaryLocale: "ko-KR",
    createdAt: at,
  }, { target: options.target });
  const project = markStudioProjectOpened(storage, EXAMPLE_PROJECT_ID, documentId, {
    at,
    target: options.target,
  });
  return { status: "seeded", project, documentId, editorHref: EXAMPLE_EDITOR_HREF };
}
