import {
  ensureStudioSaveProfile,
  readStudioSaveProfiles,
  recordStudioManualSave,
} from "./save-first/studio-save-profile";
import type { StudioSeedAutosave } from "./save-first/studio-seed-autosave-durable";
import { parseStudioAutosave, studioAutosaveKey } from "./studio-autosave";
import type { El } from "./studio-element-model";
import type { LayerGroup } from "./studio-layers";
import type { PageState } from "./studio-page-state";
import {
  SAMPLE_DOCUMENT_HEIGHT,
  SAMPLE_DOCUMENT_ID,
  SAMPLE_DOCUMENT_TITLE,
  SAMPLE_DOCUMENT_WIDTH,
  SAMPLE_EDITOR_HREF,
  SAMPLE_PRACTICE_PROJECT_ID_PREFIX,
  SAMPLE_PRACTICE_STUDY_TITLE,
  SAMPLE_PRACTICE_TEMPLATE_IDS,
  SAMPLE_PRACTICE_TITLE,
  SAMPLE_PROJECT_DESCRIPTION,
  SAMPLE_PROJECT_ID,
  SAMPLE_PROJECT_TITLE,
  buildSampleManuscriptPages,
  samplePracticeEditorHref,
} from "./studio-sample-manuscript-content";
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
 * 연습용 샘플 원고 시딩 + 연습 사본 생성.
 *
 * 원본 샘플은 "구조를 뜯어보는" 기준본이라 사용자가 연습으로 망가뜨리면 안 된다.
 * 그래서 동선은 둘로 갈린다.
 *  1. 원본: 라이브러리에 한 번 심어 두고(예제 시딩과 같은 멱등 계약), 열어서
 *     레이어·톤·말풍선 구조를 확인하는 용도로만 쓴다.
 *  2. 연습 사본: 버튼을 누를 때만 새로 만드는 별도 프로젝트. 원본 자동저장은
 *     읽기만 하고 절대 쓰지 않으므로, 사본에서 무엇을 해도 원본은 그대로다.
 *     - trace(따라 그리기): 원본 요소 전부를 잠그고 흐리게 깐 위에 빈
 *       "내 연습" 그룹을 얹는다. 원본을 밑그림 삼아 겹쳐 그리는 전용 사본.
 *     - study(구조 복습): 잠금 없는 온전한 복제본. 그룹을 지우고 되돌리며
 *       구조 자체를 실험하는 사본.
 */

export interface StudioSampleManuscriptStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export type SampleManuscriptSeedResult =
  | {
      readonly status: "seeded" | "already-seeded";
      readonly project: StudioProjectLibraryEntry;
      readonly documentId: string;
      readonly editorHref: string;
      /** 편집기가 열 수 있는 내구 저장소에 심어야 할 초안(호출자가 persistSeedAutosaveDurably 로 심는다). */
      readonly autosave: StudioSeedAutosave;
    }
  | { readonly status: "trashed"; readonly project: StudioProjectLibraryEntry }
  | { readonly status: "full"; readonly project: null };

export type SamplePracticeMode = keyof typeof SAMPLE_PRACTICE_TEMPLATE_IDS;

export interface SamplePracticeCopyRef {
  readonly project: StudioProjectLibraryEntry;
  readonly documentId: string;
  readonly editorHref: string;
  readonly mode: SamplePracticeMode;
}

export type SamplePracticeCopyResult =
  | ({
      readonly status: "created" | "already-created";
      /** 사본 초안. 이미 있는 사본도 내구 저장소에 기록이 없으면 복구되도록 함께 돌려준다. */
      readonly autosave: StudioSeedAutosave;
    } & SamplePracticeCopyRef)
  | { readonly status: "sample-trashed" }
  | { readonly status: "full" };

/** 따라 그리기 사본에서 원본 요소에 곱하는 불투명도 상한. 밑그림으로 비치되 그림을 방해하지 않는 수준. */
export const SAMPLE_TRACE_OPACITY_CAP = 0.45;
/** 따라 그리기 사본의 "내 연습" 그룹 id 접미사(사본 프로젝트 id가 뒤에 붙는다). */
export const SAMPLE_PRACTICE_GROUP_ID = "sample-g-practice";

function ensureSampleDocument(
  storage: StudioSampleManuscriptStorage,
  at: string,
  target?: StudioProjectLibraryEventTarget,
): string {
  const existing = readStudioProjectDocuments(storage, SAMPLE_PROJECT_ID)
    .documents.find((document) => document.status === "active");
  if (existing) return existing.id;
  return createStudioProjectDocument(storage, SAMPLE_PROJECT_ID, {
    id: SAMPLE_DOCUMENT_ID,
    title: SAMPLE_DOCUMENT_TITLE,
    kind: "webtoon",
    createdAt: at,
    width: SAMPLE_DOCUMENT_WIDTH,
    height: SAMPLE_DOCUMENT_HEIGHT,
    pageCount: 2,
  }, { target }).id;
}

/** 샘플도 완성본이므로 예제 시딩과 같은 이유로 저장 프로필+수동 저장 기록을 함께 남긴다. */
function ensureSavedProfile(
  storage: StudioSampleManuscriptStorage,
  projectId: string,
  at: string,
  target?: StudioProjectLibraryEventTarget,
): void {
  const profile = readStudioSaveProfiles(storage).profiles[projectId];
  if (profile?.lastManualSaveAt) return;
  if (!profile) ensureStudioSaveProfile(storage, projectId, { provider: "browser", now: at });
  recordStudioManualSave(storage, projectId, { now: at, target });
}

function sampleSeedAutosave(documentId: string): StudioSeedAutosave {
  return {
    workId: documentId,
    build: () => {
      const pages = buildSampleManuscriptPages();
      return {
        version: 2,
        savedAt: new Date().toISOString(),
        title: SAMPLE_PROJECT_TITLE,
        currentPageId: pages[0]?.id,
        pagesList: pages,
      };
    },
  };
}

export function ensureSampleManuscriptSeeded(
  storage: StudioSampleManuscriptStorage,
  options: {
    readonly at?: string;
    readonly target?: StudioProjectLibraryEventTarget;
  } = {},
): SampleManuscriptSeedResult {
  const at = options.at ?? new Date().toISOString();
  const current = readStudioProjectLibrary(storage);
  const existing = current.projects.find((project) => project.id === SAMPLE_PROJECT_ID);

  if (existing) {
    if (existing.status === "trashed") return { status: "trashed", project: existing };
    const documentId = ensureSampleDocument(storage, at, options.target);
    ensureSavedProfile(storage, SAMPLE_PROJECT_ID, at, options.target);
    const project = existing.lastOpenedDocumentId === documentId
      ? existing
      : markStudioProjectOpened(storage, SAMPLE_PROJECT_ID, documentId, {
        at,
        target: options.target,
      });
    return {
      status: "already-seeded",
      project,
      documentId,
      editorHref: SAMPLE_EDITOR_HREF,
      autosave: sampleSeedAutosave(documentId),
    };
  }

  if (current.projects.length >= MAX_PROJECTS) return { status: "full", project: null };

  const documentId = ensureSampleDocument(storage, at, options.target);
  ensureSavedProfile(storage, SAMPLE_PROJECT_ID, at, options.target);
  createStudioProject(storage, {
    id: SAMPLE_PROJECT_ID,
    title: SAMPLE_PROJECT_TITLE,
    kind: "webtoon",
    templateId: "sample-manuscript-trace",
    description: SAMPLE_PROJECT_DESCRIPTION,
    primaryLocale: "ko-KR",
    createdAt: at,
  }, { target: options.target });
  const project = markStudioProjectOpened(storage, SAMPLE_PROJECT_ID, documentId, {
    at,
    target: options.target,
  });
  return {
    status: "seeded",
    project,
    documentId,
    editorHref: SAMPLE_EDITOR_HREF,
    autosave: sampleSeedAutosave(documentId),
  };
}

/* ------------------------------------------------------------------ */
/* 연습 사본                                                              */
/* ------------------------------------------------------------------ */

/** 이미 만들어 둔 연습 사본(활성 상태)이 있으면 모드와 함께 돌려준다. */
export function findSampleManuscriptPracticeCopy(
  storage: StudioSampleManuscriptStorage,
): SamplePracticeCopyRef | null {
  const library = readStudioProjectLibrary(storage);
  for (const mode of Object.keys(SAMPLE_PRACTICE_TEMPLATE_IDS) as SamplePracticeMode[]) {
    const project = library.projects.find(
      (entry) => entry.templateId === SAMPLE_PRACTICE_TEMPLATE_IDS[mode] && entry.status === "active",
    );
    if (!project) continue;
    const document = readStudioProjectDocuments(storage, project.id)
      .documents.find((entry) => entry.status === "active");
    if (!document) continue;
    return {
      project,
      documentId: document.id,
      editorHref: samplePracticeEditorHref(project.id, document.id),
      mode,
    };
  }
  return null;
}

function nextPracticeProjectId(storage: StudioSampleManuscriptStorage): string {
  const used = new Set(readStudioProjectLibrary(storage).projects.map((project) => project.id));
  let n = 1;
  while (used.has(`${SAMPLE_PRACTICE_PROJECT_ID_PREFIX}${n}`)) n += 1;
  return `${SAMPLE_PRACTICE_PROJECT_ID_PREFIX}${n}`;
}

/** 원본 페이지(자동저장)를 읽는다. 깨졌거나 없으면 정본 빌더로 되살린다 — 사본 생성이 원본 상태에 막히지 않게. */
function readSamplePages(storage: StudioSampleManuscriptStorage): PageState[] {
  const raw = storage.getItem(studioAutosaveKey({ workId: SAMPLE_DOCUMENT_ID }));
  const parsed = parseStudioAutosave(raw);
  const pages = (parsed?.pagesList ?? []) as unknown as PageState[];
  const usable = pages.length > 0
    && pages.every((page) => page && Array.isArray(page.elements) && typeof page.id === "string");
  return usable ? pages : buildSampleManuscriptPages();
}

function traceOpacity(current: number | undefined): number {
  const base = typeof current === "number" && Number.isFinite(current) ? current : 1;
  return Math.min(SAMPLE_TRACE_OPACITY_CAP, base * SAMPLE_TRACE_OPACITY_CAP);
}

/**
 * 페이지를 사본용으로 복제한다. id는 전부 사본 접미사로 갈아끼워 원본과 충돌하지
 * 않게 하고, 그룹 연속성(같은 그룹 = 연속 구간)은 입력 순서를 유지해 보존한다.
 */
export function buildPracticeCopyPages(
  sourcePages: readonly PageState[],
  copyProjectId: string,
  mode: SamplePracticeMode,
): PageState[] {
  const suffix = `--${copyProjectId}`;
  return sourcePages.map((page, pageIndex) => {
    const sourceGroups = page.groups ?? [];
    const groups: LayerGroup[] = sourceGroups.map((group) => ({
      ...group,
      id: `${group.id}${suffix}`,
      ...(mode === "trace" ? { locked: true } : {}),
    }));
    const elements: El[] = page.elements.map((element) => {
      const cloned: El = {
        ...element,
        id: `${element.id}${suffix}`,
        ...(element.groupId ? { groupId: `${element.groupId}${suffix}` } : {}),
      };
      if (mode === "trace") {
        cloned.locked = true;
        cloned.opacity = traceOpacity(element.opacity);
      }
      return cloned;
    });
    if (mode === "trace") {
      const practiceGroupId = `${SAMPLE_PRACTICE_GROUP_ID}${suffix}`;
      groups.push({
        id: practiceGroupId,
        name: "내 연습 · 여기에 그리기",
        collapsed: false,
        hidden: false,
        locked: false,
      });
      if (pageIndex === 0) {
        elements.push({
          id: `sample-practice-guide${suffix}`,
          type: "text",
          name: "연습 안내",
          text: "원본은 흐리게 잠겨 있어요. 이 층에 따라 그어 보세요.",
          x: 56,
          y: 6,
          width: 608,
          fontSize: 20,
          fill: "#5a6b84",
          rotation: 0,
          align: "center",
          groupId: practiceGroupId,
        });
      }
    }
    return {
      ...page,
      id: `${page.id}${suffix}`,
      name: page.name
        ? `${page.name} · ${mode === "trace" ? "따라 그리기" : "복습"}`
        : mode === "trace" ? "따라 그리기" : "복습",
      groups,
      elements,
    };
  });
}

function practiceCopyAutosave(
  storage: StudioSampleManuscriptStorage,
  copyProjectId: string,
  copyDocumentId: string,
  mode: SamplePracticeMode,
): StudioSeedAutosave {
  const copyTitle = mode === "trace" ? SAMPLE_PRACTICE_TITLE : SAMPLE_PRACTICE_STUDY_TITLE;
  return {
    workId: copyDocumentId,
    build: () => {
      const pages = buildPracticeCopyPages(readSamplePages(storage), copyProjectId, mode);
      return {
        version: 2,
        savedAt: new Date().toISOString(),
        title: copyTitle,
        currentPageId: pages[0]?.id,
        pagesList: pages,
      };
    },
  };
}

export function createSampleManuscriptPracticeCopy(
  storage: StudioSampleManuscriptStorage,
  options: {
    readonly at?: string;
    readonly target?: StudioProjectLibraryEventTarget;
    readonly mode?: SamplePracticeMode;
  } = {},
): SamplePracticeCopyResult {
  const mode = options.mode ?? "trace";
  const at = options.at ?? new Date().toISOString();

  const seeded = ensureSampleManuscriptSeeded(storage, { at, target: options.target });
  if (seeded.status === "trashed") return { status: "sample-trashed" };
  if (seeded.status === "full") return { status: "full" };

  const existing = findSampleManuscriptPracticeCopy(storage);
  if (existing && existing.mode === mode) {
    return {
      status: "already-created",
      ...existing,
      autosave: practiceCopyAutosave(storage, existing.project.id, existing.documentId, mode),
    };
  }

  if (readStudioProjectLibrary(storage).projects.length >= MAX_PROJECTS) {
    return { status: "full" };
  }

  const copyProjectId = nextPracticeProjectId(storage);
  const copyDocumentId = `${copyProjectId}-ep01`;
  const copyTitle = mode === "trace" ? SAMPLE_PRACTICE_TITLE : SAMPLE_PRACTICE_STUDY_TITLE;
  const pages = buildPracticeCopyPages(readSamplePages(storage), copyProjectId, mode);

  createStudioProjectDocument(storage, copyProjectId, {
    id: copyDocumentId,
    title: SAMPLE_DOCUMENT_TITLE,
    kind: "webtoon",
    createdAt: at,
    width: SAMPLE_DOCUMENT_WIDTH,
    height: SAMPLE_DOCUMENT_HEIGHT,
    pageCount: pages.length,
  }, { target: options.target });
  ensureSavedProfile(storage, copyProjectId, at, options.target);
  createStudioProject(storage, {
    id: copyProjectId,
    title: copyTitle,
    kind: "webtoon",
    templateId: SAMPLE_PRACTICE_TEMPLATE_IDS[mode],
    description: mode === "trace"
      ? "샘플 원고를 흐리게 깔고 그 위에서 따라 그리는 연습 사본입니다. 원본 샘플은 바뀌지 않습니다."
      : "샘플 원고의 레이어 구조를 자유롭게 뜯어보는 복습 사본입니다. 원본 샘플은 바뀌지 않습니다.",
    primaryLocale: "ko-KR",
    createdAt: at,
  }, { target: options.target });
  const project = markStudioProjectOpened(storage, copyProjectId, copyDocumentId, {
    at,
    target: options.target,
  });
  return {
    status: "created",
    project,
    documentId: copyDocumentId,
    editorHref: samplePracticeEditorHref(copyProjectId, copyDocumentId),
    mode,
    autosave: practiceCopyAutosave(storage, copyProjectId, copyDocumentId, mode),
  };
}
