import { hasStudioBg3dSixPassAutosaveMarkers } from "../studio-cuttoon-editor/runtime/bg3d-six-pass/studio-bg3d-six-pass-persistence-markers";
import { createSecureRandomUuid } from "@/shared/lib/secure-random-id";

import {
  parseStudioAutosave,
  studioAutosaveKey,
  studioLifecycleAutosaveSidecarKey,
  writeStudioLifecycleAutosave,
  type StudioAutosavePayload,
} from "../studio-autosave";
import {
  archiveStudioProjectDocument,
  createStudioProjectDocument,
  readStudioProjectDocuments,
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
  studioDocumentWorkspaces,
  studioProjectDocumentHref,
  studioProjectDocumentStorageKey,
  trashStudioProjectDocument,
  type StudioDocumentKind,
  type StudioDocumentWorkspace,
  type StudioProjectDocumentEntry,
} from "../studio-project-document-store";
import {
  archiveStudioProject,
  createStudioProject,
  markStudioProjectOpened,
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_STORAGE_KEY,
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
  updateStudioProjectThumbnailUrl,
  type StudioProjectKind,
  type StudioProjectLibraryEntry,
} from "../studio-project-library-store";
import { readStudioZipArchive } from "../studio-zip-reader";
import {
  ensureStudioSaveProfile,
  markStudioStorageBindingSynced,
  readStudioSaveProfiles,
  recordStudioManualSave,
  STUDIO_SAVE_PROFILE_STORAGE_KEY,
  upsertStudioStorageBinding,
  writeStudioSaveProfiles,
  type StudioAccessMode,
  type StudioDistributionState,
} from "./studio-save-profile";
import {
  restoreStudioSubmissionsForImportedProject,
  STUDIO_SUBMISSION_STORAGE_KEY,
} from "./studio-submission-store";
import {
  STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY,
} from "./studio-project-workspace-snapshots";

const REQUIRED_ENTRIES = Object.freeze([
  "manifest.json",
  "project/project.json",
  "project/documents.json",
  "storage/profile.json",
  "distribution/submissions.json",
  "README.txt",
  `workspace/${STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY}`,
]);
const PACKAGE_ENTRY_PATTERN = /^(?:manifest\.json|README\.txt|project\/(?:project|documents)\.json|storage\/profile\.json|distribution\/submissions\.json|workspace\/documents\/(?:index\.json|document-\d{4}\.autosave\.json))$/u;
const decoder = new TextDecoder("utf-8", { fatal: true });
const VALID_ACCESS_MODES = new Set<StudioAccessMode>([
  "owner-only",
  "collaborators",
  "review-link",
  "public",
]);
const VALID_DISTRIBUTION_STATES = new Set<StudioDistributionState>([
  "none",
  "exported",
  "submitted",
  "published",
]);

interface PackageManifest {
  readonly format: "toonstudio-project";
  readonly formatVersion: 1;
  readonly entryNames: readonly string[];
}

interface WorkspaceIndexItem {
  readonly documentId: string;
  readonly entry: string | null;
}

interface WorkspaceIndex {
  readonly format: "toonstudio-project-workspace";
  readonly formatVersion: 1;
  readonly documents: readonly WorkspaceIndexItem[];
}

interface ParsedProjectPackage {
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly snapshots: ReadonlyMap<string, StudioAutosavePayload>;
  readonly autoSave: boolean;
  readonly createVersions: boolean;
  readonly accessMode: StudioAccessMode;
  readonly distributionState: StudioDistributionState;
  readonly revision: number;
  readonly lastExportAt: string | null;
  readonly lastSubmissionAt: string | null;
  readonly lastPublicationAt: string | null;
  /** distribution/submissions.json 원본 항목 — 복원은 기록 스토어가 검증·재연결한다. */
  readonly submissions: readonly unknown[];
}

export interface StudioProjectPackageImportResult {
  readonly project: StudioProjectLibraryEntry;
  readonly documents: readonly StudioProjectDocumentEntry[];
  readonly restoredSnapshotCount: number;
  /** 되살린 제출 기록 수 (C5 왕복 무결성 — 예전에는 0으로 버려졌다). */
  readonly restoredSubmissionCount: number;
  readonly href: string;
}

export interface StudioProjectPackageImportOptions {
  readonly storage: Storage;
  readonly target?: EventTarget;
  readonly authUserId?: string | null;
  readonly now?: string;
  readonly createProjectId?: () => string;
  readonly createDocumentId?: () => string;
  readonly signal?: AbortSignal;
}

function throwIfImportAborted(signal?: AbortSignal): void {
  if (!signal?.aborted) return;
  const reason = signal.reason;
  if (
    reason
    && typeof reason === "object"
    && (
      ("name" in reason && (reason as { name?: unknown }).name === "AbortError")
      || ("code" in reason && (reason as { code?: unknown }).code === "ABORTED")
    )
  ) {
    throw reason;
  }
  throw new DOMException("ToonStudio 프로젝트 패키지 가져오기가 취소되었습니다.", "AbortError");
}

function record(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("ToonStudio 프로젝트 패키지의 JSON 구조가 올바르지 않습니다.");
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`ToonStudio 프로젝트 패키지의 ${label} 값이 올바르지 않습니다.`);
  }
  return value;
}

function optionalIsoTimestamp(value: unknown): string | null {
  return typeof value === "string" && Number.isFinite(Date.parse(value)) ? value : null;
}

function jsonValue(bytes: Uint8Array, path: string): unknown {
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch {
    throw new Error(`${path} JSON을 안전하게 읽지 못했습니다.`);
  }
}

function parseManifest(value: unknown): PackageManifest {
  const input = record(value);
  if (input.format !== "toonstudio-project" || input.formatVersion !== 1) {
    throw new Error("지원하지 않는 ToonStudio 프로젝트 패키지 버전입니다.");
  }
  if (!Array.isArray(input.entryNames) || input.entryNames.some((entry) => typeof entry !== "string")) {
    throw new Error("ToonStudio 프로젝트 패키지 manifest의 파일 목록이 올바르지 않습니다.");
  }
  return Object.freeze({
    format: "toonstudio-project",
    formatVersion: 1,
    entryNames: Object.freeze([...input.entryNames] as string[]),
  });
}

function parseWorkspaceIndex(value: unknown): WorkspaceIndex {
  const input = record(value);
  if (input.format !== "toonstudio-project-workspace" || input.formatVersion !== 1) {
    throw new Error("지원하지 않는 ToonStudio 원고 저장 형식입니다.");
  }
  if (!Array.isArray(input.documents)) {
    throw new Error("ToonStudio 원고 index에 문서 목록이 없습니다.");
  }
  const documents = input.documents.map((item) => {
    const entry = record(item);
    const documentId = stringValue(entry.documentId, "원고 문서 ID");
    const snapshotEntry = entry.entry === null
      ? null
      : stringValue(entry.entry, "원고 스냅샷 경로");
    if (snapshotEntry && !/^documents\/document-\d{4}\.autosave\.json$/u.test(snapshotEntry)) {
      throw new Error("ToonStudio 원고 스냅샷 경로가 허용된 형식이 아닙니다.");
    }
    return Object.freeze({ documentId, entry: snapshotEntry });
  });
  if (new Set(documents.map((document) => document.documentId)).size !== documents.length) {
    throw new Error("ToonStudio 원고 index에 중복 문서가 있습니다.");
  }
  return Object.freeze({
    format: "toonstudio-project-workspace",
    formatVersion: 1,
    documents: Object.freeze(documents),
  });
}

function importedProject(value: unknown): StudioProjectLibraryEntry {
  const project = record(value);
  stringValue(project.id, "프로젝트 ID");
  return project as unknown as StudioProjectLibraryEntry;
}

function importedDocuments(value: unknown): readonly StudioProjectDocumentEntry[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error("ToonStudio 프로젝트 패키지에 작업 문서가 없습니다.");
  }
  return Object.freeze(value.map((item) => {
    const doc = record(item);
    stringValue(doc.id, "원고 문서 ID");
    return doc as unknown as StudioProjectDocumentEntry;
  }));
}

async function parseStudioProjectPackage(
  file: File,
  signal?: AbortSignal,
): Promise<ParsedProjectPackage> {
  throwIfImportAborted(signal);
  const archive = await readStudioZipArchive(file, {
    signal,
    limits: {
      maxArchiveBytes: 520_000_000,
      maxEntries: 2_048,
      maxEntryCompressedBytes: 256_000_000,
      maxEntryUncompressedBytes: 256_000_000,
      maxTotalUncompressedBytes: 512_000_000,
      maxCentralDirectoryBytes: 16_000_000,
      maxPathBytes: 1_024,
      maxCompressionRatio: 100,
      maxCommentBytes: 65_535,
    },
  });
  const actualNames = archive.entries.filter((entry) => !entry.directory).map((entry) => entry.path);
  const manifest = parseManifest(jsonValue(await archive.readEntry("manifest.json", { signal }), "manifest.json"));
  if (new Set(actualNames).size !== actualNames.length) {
    throw new Error("ToonStudio 프로젝트 패키지에 중복 파일이 있습니다.");
  }
  if (manifest.entryNames.length !== actualNames.length) {
    throw new Error("ToonStudio 프로젝트 패키지 manifest와 실제 파일 수가 일치하지 않습니다.");
  }
  const manifestNames = new Set(manifest.entryNames);
  for (const name of actualNames) {
    if (!manifestNames.has(name) || !PACKAGE_ENTRY_PATTERN.test(name)) {
      throw new Error(`ToonStudio 프로젝트 패키지에 허용되지 않은 파일이 있습니다: ${name}`);
    }
  }
  for (const name of REQUIRED_ENTRIES) {
    if (!manifestNames.has(name) || !archive.getEntry(name)) {
      throw new Error(`ToonStudio 프로젝트 패키지에 필수 파일이 없습니다: ${name}`);
    }
  }

  const project = importedProject(jsonValue(
    await archive.readEntry("project/project.json", { signal }),
    "project/project.json",
  ));
  const documents = importedDocuments(jsonValue(
    await archive.readEntry("project/documents.json", { signal }),
    "project/documents.json",
  ));
  const profile = record(jsonValue(
    await archive.readEntry("storage/profile.json", { signal }),
    "storage/profile.json",
  ));
  const submissionsRaw = jsonValue(
    await archive.readEntry("distribution/submissions.json", { signal }),
    "distribution/submissions.json",
  );
  if (!Array.isArray(submissionsRaw)) {
    throw new Error("ToonStudio 프로젝트 패키지의 제출 기록이 배열이 아닙니다.");
  }
  const index = parseWorkspaceIndex(jsonValue(
    await archive.readEntry(`workspace/${STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY}`, { signal }),
    `workspace/${STUDIO_PROJECT_WORKSPACE_INDEX_ENTRY}`,
  ));
  const documentIds = new Set(documents.map((document) => document.id));
  if (documentIds.size !== documents.length) {
    throw new Error("ToonStudio 프로젝트 패키지에 중복 문서 ID가 있습니다.");
  }
  if (index.documents.some((document) => !documentIds.has(document.documentId))) {
    throw new Error("ToonStudio 원고 index가 존재하지 않는 문서를 가리킵니다.");
  }

  const snapshots = new Map<string, StudioAutosavePayload>();
  for (const item of index.documents) {
    throwIfImportAborted(signal);
    if (!item.entry) continue;
    const path = `workspace/${item.entry}`;
    if (!manifestNames.has(path) || !archive.getEntry(path)) {
      throw new Error(`ToonStudio 프로젝트 패키지에 원고 스냅샷이 없습니다: ${path}`);
    }
    const bytes = await archive.readEntry(path, { signal });
    const snapshot = parseStudioAutosave(decoder.decode(bytes));
    if (!snapshot) throw new Error(`ToonStudio 원고 스냅샷이 손상되었습니다: ${path}`);
    if (hasStudioBg3dSixPassAutosaveMarkers(snapshot)) {
      throw new Error("6패스 묶음의 본문을 포함하지 않는 .toonstudio 파일은 가져올 수 없습니다. 원본 원고에서 .toonproject.zip으로 내보낸 파일을 사용해 주세요.");
    }
    snapshots.set(item.documentId, snapshot);
  }
  throwIfImportAborted(signal);
  return Object.freeze({
    project,
    documents,
    snapshots,
    autoSave: profile.autoSave !== false,
    createVersions: profile.createVersions !== false,
    accessMode: VALID_ACCESS_MODES.has(profile.accessMode as StudioAccessMode)
      ? (profile.accessMode as StudioAccessMode)
      : "owner-only",
    distributionState: VALID_DISTRIBUTION_STATES.has(profile.distributionState as StudioDistributionState)
      ? (profile.distributionState as StudioDistributionState)
      : "none",
    revision: Number.isSafeInteger(profile.revision) && Number(profile.revision) >= 0
      ? Number(profile.revision)
      : 0,
    lastExportAt: optionalIsoTimestamp(profile.lastExportAt),
    lastSubmissionAt: optionalIsoTimestamp(profile.lastSubmissionAt),
    lastPublicationAt: optionalIsoTimestamp(profile.lastPublicationAt),
    submissions: Object.freeze([...submissionsRaw]),
  });
}

function generatedImportProjectId(factory: () => string): string {
  return `import-${factory()}`.slice(0, 160);
}

function generatedImportDocumentId(factory: () => string): string {
  return `import-document-${factory()}`.slice(0, 160);
}

function restoreRaw(storage: Storage, key: string, value: string | null): void {
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  } catch {
    // 롤백 중 스토리지 할당량 예외가 다른 키 복원을 중단시키지 않도록 방어한다.
  }
}

function removeKeySafely(storage: Storage, key: string): void {
  try {
    storage.removeItem(key);
  } catch {
    // 무시하고 다음 키 정리를 진행한다.
  }
}

export async function importStudioProjectPackage(
  file: File,
  options: StudioProjectPackageImportOptions,
): Promise<StudioProjectPackageImportResult> {
  throwIfImportAborted(options.signal);
  if (!(file instanceof File) || file.size <= 0 || !file.name.toLowerCase().endsWith(".toonstudio")) {
    throw new Error("유효한 .toonstudio 프로젝트 파일을 선택해 주세요.");
  }
  const parsed = await parseStudioProjectPackage(file, options.signal);
  throwIfImportAborted(options.signal);
  const now = options.now ?? new Date().toISOString();
  const createProjectId = options.createProjectId
    ?? (() => createSecureRandomUuid("프로젝트 가져오기 ID를 안전하게 만들 수 없습니다."));
  const createDocumentId = options.createDocumentId
    ?? (() => createSecureRandomUuid("원고 가져오기 ID를 안전하게 만들 수 없습니다."));
  const current = readStudioProjectLibrary(options.storage);
  let projectId = generatedImportProjectId(createProjectId);
  for (let attempt = 0; current.projects.some((project) => project.id === projectId); attempt += 1) {
    if (attempt >= 10) throw new Error("가져온 프로젝트의 고유 ID를 만들지 못했습니다.");
    projectId = generatedImportProjectId(createProjectId);
  }

  const occupiedDocumentIds = new Set(current.projects.flatMap((project) => (
    readStudioProjectDocuments(options.storage, project.id).documents.map((document) => document.id)
  )));
  const documentIdBySource = new Map<string, string>();
  for (const sourceDocument of parsed.documents) {
    let documentId = generatedImportDocumentId(createDocumentId);
    for (let attempt = 0; occupiedDocumentIds.has(documentId); attempt += 1) {
      if (attempt >= 10) throw new Error("가져온 원고의 고유 ID를 만들지 못했습니다.");
      documentId = generatedImportDocumentId(createDocumentId);
    }
    occupiedDocumentIds.add(documentId);
    documentIdBySource.set(sourceDocument.id, documentId);
  }

  const libraryBefore = options.storage.getItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY);
  const profilesBefore = options.storage.getItem(STUDIO_SAVE_PROFILE_STORAGE_KEY);
  const submissionsBefore = options.storage.getItem(STUDIO_SUBMISSION_STORAGE_KEY);
  const createdAutosaveKeys: string[] = [];
  try {
    throwIfImportAborted(options.signal);
    let project = createStudioProject(options.storage, {
      id: projectId,
      title: parsed.project.title,
      kind: parsed.project.kind as StudioProjectKind,
      templateId: parsed.project.templateId,
      description: parsed.project.description,
      primaryLocale: parsed.project.primaryLocale,
      definition: parsed.project.definition,
      createdAt: now,
    }, { target: options.target });
    if (parsed.project.status === "archived") {
      project = archiveStudioProject(options.storage, project.id, {
        at: now,
        target: options.target,
      });
    }
    // 썸네일 왕복 (C5): createStudioProject는 썸네일을 항상 null로 시작하므로
    // 패키지에 실린 값을 별도 갱신으로 되살린다. 단 blob: 같은 기기 로컬 참조는
    // 다른 기기에서 깨진 링크가 되므로(음성 해설 blob 정책과 동일) 복원하지 않는다.
    const sourceThumbnail = parsed.project.thumbnailUrl;
    if (
      typeof sourceThumbnail === "string"
      && (sourceThumbnail.startsWith("https://") || sourceThumbnail.startsWith("data:image/"))
    ) {
      updateStudioProjectThumbnailUrl(options.storage, project.id, sourceThumbnail, {
        target: options.target,
      });
    }
    const restoredDocuments = parsed.documents.map((sourceDocument) => {
      const kind = sourceDocument.kind as StudioDocumentKind;
      const allowedWorkspaces = studioDocumentWorkspaces(kind) ?? [];
      const defaultWorkspace = allowedWorkspaces.includes(sourceDocument.defaultWorkspace as StudioDocumentWorkspace)
        ? (sourceDocument.defaultWorkspace as StudioDocumentWorkspace)
        : allowedWorkspaces[0];
      let document = createStudioProjectDocument(
        options.storage,
        project.id,
        {
          id: documentIdBySource.get(sourceDocument.id),
          title: sourceDocument.title,
          kind,
          defaultWorkspace,
          width: sourceDocument.width,
          height: sourceDocument.height,
          pageCount: sourceDocument.pageCount,
          createdAt: now,
        },
        { target: options.target },
      );
      if (sourceDocument.status === "archived") {
        document = archiveStudioProjectDocument(options.storage, project.id, document.id, {
          at: now,
          target: options.target,
        });
      } else if (sourceDocument.status === "trashed") {
        if (sourceDocument.statusBeforeTrash === "archived") {
          document = archiveStudioProjectDocument(options.storage, project.id, document.id, {
            at: now,
            target: options.target,
          });
        }
        document = trashStudioProjectDocument(options.storage, project.id, document.id, {
          at: now,
          target: options.target,
        });
      }
      return {
        sourceDocumentId: sourceDocument.id,
        document,
      };
    });
    const documents = restoredDocuments.map((restored) => restored.document);
    const opened = restoredDocuments.find((restored) => (
      restored.sourceDocumentId === parsed.project.lastOpenedDocumentId
      && restored.document.status !== "trashed"
    ))?.document
      ?? documents.find((document) => document.status === "active")
      ?? documents.find((document) => document.status !== "trashed")
      ?? null;
    if (opened) {
      markStudioProjectOpened(options.storage, project.id, opened.id, {
        at: now,
        target: options.target,
      });
    }

    for (const restored of restoredDocuments) {
      const snapshot = parsed.snapshots.get(restored.sourceDocumentId);
      if (!snapshot) continue;
      const key = studioAutosaveKey({
        userId: options.authUserId ?? null,
        workId: restored.document.id,
      });
      createdAutosaveKeys.push(key);
      writeStudioLifecycleAutosave(options.storage, key, snapshot, { preservePrimary: false });
    }

    ensureStudioSaveProfile(options.storage, project.id, {
      provider: "browser",
      autoSave: parsed.autoSave,
      createVersions: parsed.createVersions,
      now,
      target: options.target,
    });
    upsertStudioStorageBinding(options.storage, project.id, {
      id: "local-file:imported",
      provider: "local-file",
      role: "backup",
      label: file.name,
      syncState: "pending",
    }, { now, target: options.target });
    const saved = recordStudioManualSave(options.storage, project.id, {
      now,
      target: options.target,
    });
    const targetRevision = Math.max(saved.revision, parsed.revision);
    markStudioStorageBindingSynced(
      options.storage,
      project.id,
      "local-file:imported",
      {
        remotePath: file.name,
        byteLength: file.size,
        revision: targetRevision,
      },
      { now, target: options.target },
    );
    // 제출 기록 왕복 (C5): 패키지에 실린 기록을 새 프로젝트 id로 재연결해 되살린다.
    const restoredSubmissions = restoreStudioSubmissionsForImportedProject(
      options.storage,
      {
        sourceProjectId: parsed.project.id,
        importedProjectId: project.id,
        entries: parsed.submissions,
      },
      { now, target: options.target },
    );
    const profileState = readStudioSaveProfiles(options.storage);
    const currentProfile = profileState.profiles[project.id];
    if (currentProfile) {
      writeStudioSaveProfiles(options.storage, Object.freeze({
        schemaVersion: 1,
        profiles: Object.freeze({
          ...profileState.profiles,
          [project.id]: Object.freeze({
            ...currentProfile,
            accessMode: parsed.accessMode,
            distributionState: parsed.distributionState,
            revision: targetRevision,
            lastExportAt: parsed.lastExportAt ?? currentProfile.lastExportAt,
            lastSubmissionAt: parsed.lastSubmissionAt ?? currentProfile.lastSubmissionAt,
            lastPublicationAt: parsed.lastPublicationAt ?? currentProfile.lastPublicationAt,
            updatedAt: now,
          }),
        }),
        updatedAt: now,
      }), options.target);
    }
    const openedWorkspace = opened
      ? (opened.allowedWorkspaces.includes(opened.defaultWorkspace)
        ? opened.defaultWorkspace
        : opened.allowedWorkspaces[0])
      : undefined;
    return Object.freeze({
      project: readStudioProjectLibrary(options.storage).projects.find(
        (candidate) => candidate.id === project.id,
      ) ?? project,
      documents: Object.freeze(documents),
      restoredSnapshotCount: createdAutosaveKeys.length,
      restoredSubmissionCount: restoredSubmissions.length,
      href: opened
        ? studioProjectDocumentHref(opened, openedWorkspace)
        : `/studio/p/${encodeURIComponent(project.id)}/overview`,
    });
  } catch (cause) {
    removeKeySafely(options.storage, studioProjectDocumentStorageKey(projectId));
    for (const key of createdAutosaveKeys) {
      removeKeySafely(options.storage, key);
      removeKeySafely(options.storage, studioLifecycleAutosaveSidecarKey(key));
    }
    restoreRaw(options.storage, STUDIO_PROJECT_LIBRARY_STORAGE_KEY, libraryBefore);
    restoreRaw(options.storage, STUDIO_SAVE_PROFILE_STORAGE_KEY, profilesBefore);
    restoreRaw(options.storage, STUDIO_SUBMISSION_STORAGE_KEY, submissionsBefore);
    const rollbackTarget = options.target ?? (typeof window !== "undefined" ? window : undefined);
    try {
      rollbackTarget?.dispatchEvent(
        new CustomEvent(STUDIO_PROJECT_LIBRARY_UPDATED_EVENT, {
          detail: readStudioProjectLibrary(options.storage),
        }),
      );
      rollbackTarget?.dispatchEvent(
        new CustomEvent(STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT, {
          detail: readStudioProjectDocuments(options.storage, projectId),
        }),
      );
    } catch {
      // 이벤트 발행 실패는 원래 예외 전파를 막지 않는다.
    }
    throw cause;
  }
}
