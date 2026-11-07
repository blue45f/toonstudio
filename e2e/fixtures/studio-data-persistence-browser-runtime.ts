import {
  CommandBus,
  createEmptyScene,
  projectDigest,
} from "@toonstudio/studio-project-model";

import {
  createStudioDrawingPointerTransportController,
} from "../../apps/web/src/domains/creator/brush/studio-drawing-pointer-transport";
import {
  buildStudioProjectPackage,
  chooseStudioProjectPackageSaveTarget,
  type StudioProjectPackageWritableFileHandle,
  writeStudioProjectPackageToTarget,
} from "../../apps/web/src/domains/creator/save-first/studio-project-package";
import {
  importStudioProjectPackage,
} from "../../apps/web/src/domains/creator/save-first/studio-project-package-import";
import {
  buildStudioProjectWorkspacePackageEntries,
  collectStudioProjectWorkspaceSnapshots,
} from "../../apps/web/src/domains/creator/save-first/studio-project-workspace-snapshots";
import {
  STUDIO_SAVE_PROFILE_STORAGE_KEY,
  studioSaveProfileForProject,
} from "../../apps/web/src/domains/creator/save-first/studio-save-profile";
import {
  STUDIO_SUBMISSION_STORAGE_KEY,
  studioSubmissionsForProject,
} from "../../apps/web/src/domains/creator/save-first/studio-submission-store";
import {
  readStudioAutosave,
  serializeStudioAutosave,
  studioAutosaveKey,
  StudioAutosaveUnsupportedVersionError,
  type StudioAutosavePayload,
} from "../../apps/web/src/domains/creator/studio-autosave";
import {
  createStudioAutosaveOpfsSession,
  openStudioAutosaveDocumentSession,
  persistStudioAutosaveWithOpfsPrimary,
  reconcileStudioAutosaveWithOpfsPrimary,
  reopenStudioAutosaveDocumentSessionForLeadership,
  StudioAutosaveDocumentBusyError,
  StudioAutosaveDurabilityError,
  withStudioAutosaveDocumentLeadership,
  type StudioAutosaveDocumentSession,
  type StudioAutosaveOpfsSession,
} from "../../apps/web/src/domains/creator/studio-autosave-opfs-session";
import {
  createStudioAutosaveSqliteStore,
  type StudioAutosaveSqlitePort,
} from "../../apps/web/src/domains/creator/studio-autosave-sqlite-store";
import { createEmptyStudioVersionCoordinates } from "../../apps/web/src/domains/creator/studio-foundation/studio-version-coordinates";
import {
  browserStudioOpfsDigest,
  createStudioOpfsAssetStore,
} from "../../apps/web/src/domains/creator/studio-opfs-asset-store";
import {
  createStudioOpfsNativeFileSystem,
  type StudioOpfsStorageManagerLike,
} from "../../apps/web/src/domains/creator/studio-opfs-filesystem";
import {
  restoreStudioAutosaveRecovery,
  type StudioAutosaveRestoreContext,
} from "../../apps/web/src/domains/creator/studio-page-autosave-runtime";
import {
  buildStudioProjectArchive,
  importStudioProjectArchive,
  resolveStudioProjectArchiveAttachment,
} from "../../apps/web/src/domains/creator/studio-project-archive";
import {
  readStudioProjectDocuments,
  studioProjectDocumentStorageKey,
} from "../../apps/web/src/domains/creator/studio-project-document-store";
import {
  readStudioProjectLibrary,
  writeStudioProjectLibrary,
} from "../../apps/web/src/domains/creator/studio-project-library-store";
import { sha256HexPortable } from "../../apps/web/src/domains/creator/studio-sha256";
import {
  buildStudioV12RecoveryPackage,
  createStudioV12RecoveryOpfsAttachmentTarget,
  importStudioV12RecoveryPackage,
  openStudioV12RecoveryPackage,
  restoreStudioV12RecoveryPackage,
  saveStudioV12RecoveryPackage,
} from "../../apps/web/src/domains/creator/studio-v12-recovery-package";
import {
  migrateStudioProjectSnapshotV2ToArchiveV3,
  projectStudioArchiveV3ToV2Snapshot,
  serializeStudioProjectArchiveV3,
  validateStudioProjectArchiveV3,
} from "../../apps/web/src/domains/creator/studio-workflow/studio-project-archive-v3";
import {
  forgetStoredFileHandle,
  loadStoredFileHandle,
  storeFileHandle,
  type FileSystemFileHandleLike,
} from "../../apps/web/src/shared/lib/file-system-access";

import {
  computeCanonicalFixtureDigest,
  createStudioDataPersistenceFixture,
  summarizeAutosavePayloadParity,
} from "./studio-data-persistence-fixture";

import type { StudioProjectSnapshot } from "../../apps/web/src/domains/creator/studio-project-snapshot";
import type {
  JournalEntryIR,
  JournalStore,
  SnapshotIR,
} from "@toonstudio/studio-project-model";

const IDB_KV_DB_NAME = "toonstudio-browser-harness-sqlite-kv-v1";
const IDB_KV_STORE_NAME = "kv";

async function closeDocumentSession(docSession: StudioAutosaveDocumentSession): Promise<void> {
  await docSession.session?.dispose().catch(() => undefined);
  await docSession.lease.release().catch(() => undefined);
}

/** 실제 브라우저 IndexedDB에 영속되는 KV 어댑터 (새로고침 후에도 SQLite envelope 유지). */
function createIndexedDbKvAdapter(dbName = IDB_KV_DB_NAME): {
  kvGet(namespace: string, key: string): Promise<string | null>;
  kvSet(namespace: string, key: string, value: string): Promise<void>;
} {
  function openDb(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const req = window.indexedDB.open(dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(IDB_KV_STORE_NAME)) {
          db.createObjectStore(IDB_KV_STORE_NAME);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    });
  }

  return {
    async kvGet(namespace, key) {
      const db = await openDb();
      try {
        return await new Promise<string | null>((resolve, reject) => {
          const tx = db.transaction(IDB_KV_STORE_NAME, "readonly");
          const req = tx.objectStore(IDB_KV_STORE_NAME).get(`${namespace}:${key}`);
          req.onsuccess = () => resolve(typeof req.result === "string" ? req.result : null);
          req.onerror = () => reject(req.error ?? new Error("IDB get failed"));
        });
      } finally {
        db.close();
      }
    },
    async kvSet(namespace, key, value) {
      const db = await openDb();
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = db.transaction(IDB_KV_STORE_NAME, "readwrite");
          tx.objectStore(IDB_KV_STORE_NAME).put(value, `${namespace}:${key}`);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error ?? new Error("IDB put failed"));
        });
      } finally {
        db.close();
      }
    },
  };
}

function createBrowserSqlitePort(dbName = IDB_KV_DB_NAME): StudioAutosaveSqlitePort {
  return createStudioAutosaveSqliteStore(createIndexedDbKvAdapter(dbName));
}

function createMemoryJournalStore(): JournalStore {
  const entries: JournalEntryIR[] = [];
  const snapshots: SnapshotIR[] = [];
  return {
    async append(entry) {
      entries.push(structuredClone(entry));
    },
    async readEntries() {
      return entries.map((item) => structuredClone(item));
    },
    async writeSnapshot(snapshot) {
      snapshots.splice(0, snapshots.length, structuredClone(snapshot));
    },
    async readSnapshots() {
      return snapshots.map((item) => structuredClone(item));
    },
  };
}

function seedFixtureStores(storage: Storage, fixture = createStudioDataPersistenceFixture()): void {
  writeStudioProjectLibrary(storage, {
    schemaVersion: 1,
    projects: [fixture.project],
    updatedAt: fixture.savedAt,
  });
  storage.setItem(
    studioProjectDocumentStorageKey(fixture.project.id),
    JSON.stringify({
      schemaVersion: 1,
      projectId: fixture.project.id,
      documents: fixture.documents,
      updatedAt: fixture.savedAt,
    }),
  );
  storage.setItem(
    STUDIO_SAVE_PROFILE_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      profiles: { [fixture.project.id]: fixture.profile },
      updatedAt: fixture.savedAt,
    }),
  );
  storage.setItem(
    STUDIO_SUBMISSION_STORAGE_KEY,
    JSON.stringify({
      schemaVersion: 1,
      submissions: fixture.submissions,
      updatedAt: fixture.savedAt,
    }),
  );
}

async function listOpfsAutosaveFiles(): Promise<string[]> {
  const opfsFs = createStudioOpfsNativeFileSystem(
    navigator.storage as unknown as StudioOpfsStorageManagerLike,
    "toonstudio-studio-autosave-v3",
  );
  const files = await opfsFs.list("recovery-journals");
  return [...files].sort();
}

function runRestoreWithRuntime(payload: StudioAutosavePayload, overrides: Partial<{
  preserveCurrentDocument: () => Promise<boolean>;
  throwOnCommentsSetter: boolean;
}> = {}) {
  const candidateRef = {
    current: {
      key: "studio-autosave:v1:anon:doc-ep-1",
      savedAt: payload.savedAt,
      sequence: 1,
      revision: 1,
      payload,
      authority: "opfs-journal" as const,
    },
  };
  let currentPages: unknown[] = [{ id: "initial-page", elements: [{ id: "initial-el", type: "rect" }], bg: "#ffffff", bgGrad: null, canvasH: 1080 }];
  let currentMaster: unknown = { elements: [] };
  let currentTitle = "초기 제목";
  let currentDescription = "초기 설명";
  let currentTags = "";
  let currentPageId = "initial-page";
  let currentTheme = "classic";
  let currentGutter = 24;
  let currentBible: unknown = { version: 1, characters: [] };
  let currentComments: unknown = { version: 1, threads: [] };
  let currentRefs: unknown = { version: 1, references: [] };
  let currentError: string | null = null;
  const pagesHistoryRef = { current: [structuredClone(currentPages)] as unknown[] };
  const pagesHiRef = { current: 0 };

  const ctx: StudioAutosaveRestoreContext = {
    preserveCurrentDocument: overrides.preserveCurrentDocument ?? (async () => true),
    autosaveRecoveryCandidateRef: candidateRef,
    canApplyStudioMutation: () => true,
    captureStudioMutationTicket: () => ({
      authScopeKey: null,
      workId: null,
      accessGeneration: 0,
      documentGeneration: 0,
    }),
    collaborationDocumentLocked: false,
    collaborationLockMessage: () => "Locked",
    drawingPointerTransportRef: { current: createStudioDrawingPointerTransportController() },
    drawingRef: { current: null },
    hydrateStudioSidecarDocuments: ({ characterBible }) => {
      currentBible = characterBible;
    },
    pages: currentPages as StudioAutosaveRestoreContext["pages"],
    pagesHiRef,
    pagesHistoryCommandJournalRef: { current: null },
    pagesHistoryRef: pagesHistoryRef as unknown as StudioAutosaveRestoreContext["pagesHistoryRef"],
    pendingStrokeCommitsRef: { current: null },
    prepareStudioDocumentReplacement: () => true,
    resetAdvancedFillForDocumentReplacement: () => undefined,
    resetStudioHistoryJournal: () => undefined,
    resetStudioHistoryRetention: () => undefined,
    setAiProvenance: () => undefined,
    setAutosaveRestoreBlockedReason: () => undefined,
    setCurrentPageId: (next) => { currentPageId = next; },
    setDescription: (next) => { currentDescription = next; },
    setError: (next) => { currentError = next; },
    setHasAutosave: () => undefined,
    setMaster: (next) => { currentMaster = next; },
    setPagesHi: () => undefined,
    setPagesHistory: (next) => {
      currentPages = next[0] ?? [];
    },
    setPanelGutter: (next) => { currentGutter = next; },
    setPublicationAnalytics: () => undefined,
    setPublishAiDisclosure: () => undefined,
    setPublishAiUsage: () => undefined,
    setPublishCompliance: () => undefined,
    setPublishPackageCredits: () => undefined,
    setPublishPackageSettings: () => undefined,
    setPublishProfile: () => undefined,
    setReferenceBoard: () => undefined,
    setReleaseSchedule: () => undefined,
    setScenarioImageReferenceDocumentState: (next) => { currentRefs = next; },
    setStudioComments: (next) => {
      if (overrides.throwOnCommentsSetter) {
        throw new Error("손상된 댓글 사이드카");
      }
      currentComments = next;
    },
    setTagsText: (next) => { currentTags = next; },
    setTitle: (next) => { currentTitle = next; },
    setWebtoonTheme: (next) => { currentTheme = next; },
    sharedDocument: null,
    workId: null,
  };

  return {
    candidateRef,
    pagesHistoryRef,
    pagesHiRef,
    getState: () => ({
      currentPages,
      currentMaster,
      currentTitle,
      currentDescription,
      currentTags,
      currentPageId,
      currentTheme,
      currentGutter,
      currentBible,
      currentComments,
      currentRefs,
      currentError,
    }),
    execute: async () => {
      await restoreStudioAutosaveRecovery(ctx);
      return candidateRef.current === null && currentError === null;
    },
  };
}

/** 실제 브라우저 탭 간 리더/팔로워 검증을 위한 세션 레지스트리. */
const tabSessions = new Map<string, {
  readonly key: string;
  readonly sqlite: StudioAutosaveSqlitePort;
  docSession: StudioAutosaveDocumentSession;
  opfsSession: StudioAutosaveOpfsSession | null;
}>();

export const studioDataPersistenceBrowserHarness = {
  async probeCapabilities() {
    const root = await navigator.storage.getDirectory();
    const probeHandle = await root.getFileHandle("capability-probe.bin", { create: true });
    const writable = await probeHandle.createWritable();
    await writable.write(new Blob([Uint8Array.from([1, 2, 3, 4])]));
    await writable.close();
    const probeFile = await probeHandle.getFile();
    const opfsByteLength = probeFile.size;

    const handleKey = "capability-probe:handle";
    const storedHandleOk = await storeFileHandle(
      handleKey,
      probeHandle as unknown as FileSystemFileHandleLike,
    );
    const loadedHandle = await loadStoredFileHandle(handleKey);
    const idbHandleRoundtripOk = storedHandleOk && loadedHandle !== null && loadedHandle.name === "capability-probe.bin";
    await forgetStoredFileHandle(handleKey);
    await root.removeEntry("capability-probe.bin");

    let webLocksSupported = false;
    await navigator.locks.request("toonstudio-capability-probe-lock", async (lock) => {
      webLocksSupported = lock !== null;
    });

    window.localStorage.setItem("toonstudio:capability-probe", "ok");
    const localStorageSupported = window.localStorage.getItem("toonstudio:capability-probe") === "ok";
    window.localStorage.removeItem("toonstudio:capability-probe");

    const digestBuffer = await crypto.subtle.digest("SHA-256", Uint8Array.from([9, 8, 7]).buffer);
    const webCryptoSha256Supported = digestBuffer.byteLength === 32;

    const nativeShowSaveFilePickerPresent = typeof (
      window as Window & { showSaveFilePicker?: unknown }
    ).showSaveFilePicker === "function";
    let unactivatedSavePickerConstraint: { blockedByUserGesture: boolean; errorName: string; message: string } | null = null;
    if (nativeShowSaveFilePickerPresent) {
      try {
        await chooseStudioProjectPackageSaveTarget("unactivated.toonstudio", window);
        unactivatedSavePickerConstraint = {
          blockedByUserGesture: false,
          errorName: "none",
          message: "succeeded without gesture",
        };
      } catch (cause) {
        const err = cause as { name?: unknown; message?: unknown };
        unactivatedSavePickerConstraint = {
          blockedByUserGesture: true,
          errorName: String(err?.name ?? "Error"),
          message: String(err?.message ?? ""),
        };
      }
    }

    return {
      userAgent: navigator.userAgent,
      indexedDbSupported: typeof window.indexedDB?.open === "function",
      idbFileHandlePersistenceSupported: idbHandleRoundtripOk,
      opfsSupported: opfsByteLength === 4,
      webLocksSupported,
      localStorageSupported,
      blobFileSupported: typeof Blob === "function" && typeof File === "function",
      webCryptoSha256Supported,
      nativeShowSaveFilePickerPresent,
      unactivatedSavePickerConstraint,
    };
  },

  async saveFixtureBeforeReload(runId: string) {
    window.localStorage.clear();
    const fixture = createStudioDataPersistenceFixture();
    seedFixtureStores(window.localStorage, fixture);

    const sqlite = createBrowserSqlitePort(`${IDB_KV_DB_NAME}-${runId}`);
    const primaryKey = studioAutosaveKey({ userId: null, workId: "doc-ep-1" });
    const projectFallbackKey = studioAutosaveKey({ userId: null, workId: fixture.project.id });
    const secondaryKey = studioAutosaveKey({ userId: null, workId: "doc-ep-2" });

    const primaryDocSession = await openStudioAutosaveDocumentSession(primaryKey);
    const projectDocSession = await openStudioAutosaveDocumentSession(projectFallbackKey);
    const secondaryDocSession = await openStudioAutosaveDocumentSession(secondaryKey);
    try {
      const primaryReceipt = await persistStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: primaryKey,
        payload: fixture.primaryAutosave,
        session: primaryDocSession.session,
        sqlite,
      });
      await persistStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: projectFallbackKey,
        payload: fixture.primaryAutosave,
        session: projectDocSession.session,
        sqlite,
      });
      const secondaryReceipt = await persistStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: secondaryKey,
        payload: fixture.secondaryAutosave,
        session: secondaryDocSession.session,
        sqlite,
      });
      const opfsFiles = await listOpfsAutosaveFiles();
      return {
        primaryKey,
        secondaryKey,
        primaryAuthority: primaryReceipt.authority,
        secondaryAuthority: secondaryReceipt.authority,
        primaryRole: primaryDocSession.role,
        opfsFilesCount: opfsFiles.length,
        hasCheckpointFile: opfsFiles.some((name) => name.includes("/cp-") && name.endsWith(".bin")),
        sourceDigest: fixture.sourceDigest,
        expectedParity: fixture.expectedParity,
      };
    } finally {
      await closeDocumentSession(primaryDocSession);
      await closeDocumentSession(projectDocSession);
      await closeDocumentSession(secondaryDocSession);
    }
  },

  async reopenAndVerifyRoundtripsAfterReload(runId: string) {
    const fixture = createStudioDataPersistenceFixture();
    const navEntry = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
    const navigationType = navEntry?.type ?? "navigate";

    const sqlite = createBrowserSqlitePort(`${IDB_KV_DB_NAME}-${runId}`);
    const primaryKey = studioAutosaveKey({ userId: null, workId: "doc-ep-1" });
    const reopenedDocSession = await openStudioAutosaveDocumentSession(primaryKey);
    let reconciledAuthority: string | null;
    let restoredParity: ReturnType<typeof summarizeAutosavePayloadParity> | null;
    let restoredPayload: StudioAutosavePayload | null;

    try {
      const reconciled = await reconcileStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: primaryKey,
        session: reopenedDocSession.session,
        sqlite,
      });
      if (!reconciled.candidate) throw new Error("재열기 후 OPFS 주 저장소에서 원고를 찾지 못했습니다.");
      reconciledAuthority = reconciled.authority;
      restoredPayload = reconciled.candidate.payload;

      const runtime = runRestoreWithRuntime(reconciled.candidate.payload);
      const restoredOk = await runtime.execute();
      if (!restoredOk) throw new Error("restoreStudioAutosaveRecovery 실행이 실패했습니다.");
      const state = runtime.getState();
      restoredParity = summarizeAutosavePayloadParity({
        ...reconciled.candidate.payload,
        title: state.currentTitle,
        description: state.currentDescription,
        tagsText: state.currentTags,
        currentPageId: state.currentPageId,
        webtoonTheme: state.currentTheme as StudioAutosavePayload["webtoonTheme"],
        panelGutter: state.currentGutter,
        pagesList: state.currentPages as StudioAutosavePayload["pagesList"],
        master: state.currentMaster as StudioAutosavePayload["master"],
        characterBible: state.currentBible as StudioAutosavePayload["characterBible"],
        comments: state.currentComments as StudioAutosavePayload["comments"],
        aiImageReferences: state.currentRefs as StudioAutosavePayload["aiImageReferences"],
      });
    } finally {
      await closeDocumentSession(reopenedDocSession);
    }

    // 1. .toonstudio 패키지: 실제 OPFS/SQLite/localStorage 스냅샷 수집 -> 실제 OPFS FileHandle(IndexedDB 저장 핸들 재사용) 스트림 쓰기 -> File 읽기 -> 새 스토리지 import
    const collectedSnapshots = await collectStudioProjectWorkspaceSnapshots({
      storage: window.localStorage,
      projectId: fixture.project.id,
      documents: fixture.documents,
      lastOpenedDocumentId: fixture.project.lastOpenedDocumentId,
    });
    const additionalEntries = buildStudioProjectWorkspacePackageEntries(
      fixture.documents,
      collectedSnapshots,
    );
    const builtPackage = buildStudioProjectPackage({
      project: fixture.project,
      documents: fixture.documents,
      profile: fixture.profile,
      submissions: fixture.submissions,
      exportedAt: "2026-09-20T10:00:00.000Z",
      additionalEntries,
    });

    const opfsRoot = await navigator.storage.getDirectory();
    const packageFileHandle = await opfsRoot.getFileHandle(`roundtrip-${runId}.toonstudio`, { create: true });
    const handleStorageKey = `project-package:${fixture.project.id}`;
    await storeFileHandle(
      handleStorageKey,
      packageFileHandle as unknown as FileSystemFileHandleLike,
    );
    const chosenTarget = await chooseStudioProjectPackageSaveTarget(
      builtPackage.fileName,
      window,
      handleStorageKey,
    );
    const writeMode = await writeStudioProjectPackageToTarget(builtPackage, chosenTarget);
    await forgetStoredFileHandle(handleStorageKey);

    const writtenDiskFile = await packageFileHandle.getFile();
    const packageFileForImport = new File(
      [await writtenDiskFile.arrayBuffer()],
      builtPackage.fileName,
      { type: builtPackage.blob.type },
    );
    await opfsRoot.removeEntry(`roundtrip-${runId}.toonstudio`);

    window.localStorage.clear();
    const importedPackage = await importStudioProjectPackage(packageFileForImport, {
      storage: window.localStorage,
      now: "2026-09-20T10:05:00.000Z",
      createProjectId: () => "imported-proj-1",
      createDocumentId: (() => {
        let seq = 0;
        return () => `imported-doc-${(seq += 1)}`;
      })(),
    });
    const importedPrimaryDoc = importedPackage.documents.find((doc) => doc.title === "1화: 시간의 서고");
    const importedSecondaryDoc = importedPackage.documents.find((doc) => doc.title.includes("2화:"));
    if (!importedPrimaryDoc || !importedSecondaryDoc) {
      throw new Error("가져온 .toonstudio 패키지에서 문서 목록이 누락되었습니다.");
    }
    const importedPrimaryAutosave = readStudioAutosave(
      window.localStorage,
      studioAutosaveKey({ userId: null, workId: importedPrimaryDoc.id }),
    );
    if (!importedPrimaryAutosave) {
      throw new Error("가져온 .toonstudio 패키지의 주 원고 자동저장이 복원되지 않았습니다.");
    }
    const importedPackageParity = summarizeAutosavePayloadParity(importedPrimaryAutosave.payload);
    const importedLibrary = readStudioProjectLibrary(window.localStorage);
    const importedDocsInStore = readStudioProjectDocuments(window.localStorage, importedPackage.project.id);
    const importedSaveProfile = studioSaveProfileForProject(window.localStorage, importedPackage.project.id);
    const importedSubmissions = studioSubmissionsForProject(window.localStorage, importedPackage.project.id);

    // 2. .toonproject.zip 아카이브: 내장 PNG dataURL + WAV 오디오 첨부 -> content-addressed ZIP 빌드 -> 재가져오기
    const archiveSourceProject = {
      ...restoredPayload!,
      pagesList: restoredPayload!.pagesList.map((page, index) =>
        index === 0
          ? {
              ...page,
              elements: [
                ...(page.elements ?? []),
                {
                  id: "audio-cue-1",
                  type: "custom",
                  audio: "pending-audio-ref",
                },
              ],
            }
          : page
      ),
    };
    const builtArchive = await buildStudioProjectArchive(
      {
        project: archiveSourceProject,
        attachments: [
          {
            kind: "audio",
            data: new Blob([Uint8Array.from(fixture.media.attachmentWavBytes)], { type: "audio/wav" }),
            mimeType: "audio/wav",
            documentReferences: [{ pointer: "/pagesList/0/elements/5/audio", usage: "audio" }],
          },
        ],
      },
      { crc32ExecutionMode: "direct-bounded" },
    );
    const importedArchiveRehydrated = await importStudioProjectArchive(builtArchive.blob, {
      rehydrateDataUrls: true,
    });
    const importedArchiveRefOnly = await importStudioProjectArchive(builtArchive.blob, {
      rehydrateDataUrls: false,
    });
    const rehydratedProject = importedArchiveRehydrated.project as unknown as StudioAutosavePayload;
    const rehydratedArchiveParity = summarizeAutosavePayloadParity(rehydratedProject);
    const refOnlyFirstPageElements = (
      importedArchiveRefOnly.project.pagesList[0]?.elements ?? []
    ) as Array<Record<string, unknown>>;
    const rasterRefUri = String(
      refOnlyFirstPageElements.find((el) => el.id === "image-raster-1")?.src ?? "",
    );
    const audioRefUri = String(
      refOnlyFirstPageElements.find((el) => el.id === "audio-cue-1")?.audio ?? "",
    );
    const resolvedRasterAttachment = resolveStudioProjectArchiveAttachment(
      importedArchiveRefOnly.attachments,
      rasterRefUri,
    );
    const resolvedAudioAttachment = resolveStudioProjectArchiveAttachment(
      importedArchiveRefOnly.attachments,
      audioRefUri,
    );
    const resolvedRasterSha256 = resolvedRasterAttachment
      ? sha256HexPortable(new Uint8Array(await resolvedRasterAttachment.blob.arrayBuffer()))
      : "";
    const resolvedAudioSha256 = resolvedAudioAttachment
      ? sha256HexPortable(new Uint8Array(await resolvedAudioAttachment.blob.arrayBuffer()))
      : "";

    // 3. .toonrecovery.zip V12 재해 복구 패키지: 실제 WebCrypto SHA-256 + 실제 OPFS CAS 자산 저장소 왕복
    const sourceHistory = createMemoryJournalStore();
    const { bus } = await CommandBus.open(sourceHistory, {
      snapshotEvery: 2,
      now: (() => {
        let tick = 1_000;
        return () => (tick += 10);
      })(),
    });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(720, 2400) });
    await bus.dispatch({
      type: "scene/set-background",
      color: { r: 0.12, g: 0.16, b: 0.23, a: 1 },
    });
    await bus.dispatch({
      type: "scene/set-background",
      color: { r: 0.22, g: 0.74, b: 0.97, a: 1 },
    });

    const builtV12 = await buildStudioV12RecoveryPackage(
      {
        project: {
          projectId: fixture.project.id,
          workspaceId: "draw",
          title: fixture.project.title,
        },
        history: sourceHistory,
        attachments: [
          {
            data: Uint8Array.from(fixture.media.primaryRasterBytes),
            mimeType: "image/png",
            rights: { owner: "합성작가", licenseSpdx: "CC0-1.0" },
            metadata: { name: "Primary Raster", kind: "raster", sourceFormat: "png" },
          },
          {
            data: Uint8Array.from(fixture.media.attachmentWavBytes),
            mimeType: "audio/wav",
            rights: { owner: "합성작가", licenseSpdx: "CC0-1.0" },
            metadata: { name: "Cue Audio", kind: "audio", sourceFormat: "wav" },
          },
        ],
        metadata: {
          title: fixture.project.title,
          description: fixture.project.description,
          tags: ["회귀검증", "복원"],
        },
      },
      {
        digest: browserStudioOpfsDigest(),
        crc32ExecutionMode: "direct-bounded",
      },
    );

    const recoveryFileHandle = await opfsRoot.getFileHandle(`recovery-${runId}.toonrecovery.zip`, {
      create: true,
    });
    await saveStudioV12RecoveryPackage(
      {
        async save(file) {
          const out = await recoveryFileHandle.createWritable();
          const buf = new ArrayBuffer(file.bytes.byteLength);
          new Uint8Array(buf).set(file.bytes);
          await out.write(new Blob([buf], { type: file.mimeType }));
          await out.close();
        },
      },
      "episode-backup.toonrecovery.zip",
      builtV12,
    );
    const openedV12 = await openStudioV12RecoveryPackage(
      {
        async open() {
          return await recoveryFileHandle.getFile();
        },
      },
      { digest: browserStudioOpfsDigest() },
    );
    await opfsRoot.removeEntry(`recovery-${runId}.toonrecovery.zip`);

    const opfsAssetFs = createStudioOpfsNativeFileSystem(
      navigator.storage as unknown as StudioOpfsStorageManagerLike,
      `toonstudio-recovery-assets-${runId}`,
    );
    const opfsAssetStore = createStudioOpfsAssetStore({
      fs: opfsAssetFs,
      digest: browserStudioOpfsDigest(),
      codec: undefined,
    } as Parameters<typeof createStudioOpfsAssetStore>[0]);
    const targetHistory = createMemoryJournalStore();
    const restoredV12 = await restoreStudioV12RecoveryPackage(openedV12, {
      history: targetHistory,
      attachments: createStudioV12RecoveryOpfsAttachmentTarget(opfsAssetStore),
    });
    const opfsStoredPng = await opfsAssetStore.get(`sha256:${fixture.media.primaryRasterSha256}`, {
      verify: true,
    });
    const opfsStoredWav = await opfsAssetStore.get(`sha256:${fixture.media.attachmentWavSha256}`, {
      verify: true,
    });

    // 4. V2 스냅샷 <-> Archive V3 마이그레이션·검증·역투영 왕복
    const v2Snapshot = {
      version: 2,
      savedAt: fixture.savedAt,
      title: fixture.primaryAutosave.title ?? "",
      description: fixture.primaryAutosave.description ?? "",
      tagsText: fixture.primaryAutosave.tagsText ?? "",
      linkedTitleId: null,
      linkedSeriesId: null,
      linkedChallengeId: null,
      pagesList: fixture.primaryAutosave.pagesList,
      master: fixture.primaryAutosave.master,
      characterBible: fixture.primaryAutosave.characterBible,
      writerRoom: undefined,
      aiProvenance: undefined,
      comments: fixture.primaryAutosave.comments,
      releaseSchedule: undefined,
      publicationAnalytics: undefined,
      referenceBoard: undefined,
      aiImageReferences: fixture.primaryAutosave.aiImageReferences,
      currentPageId: fixture.primaryAutosave.currentPageId ?? "page-2",
      webtoonTheme: typeof fixture.primaryAutosave.webtoonTheme === "string"
        ? fixture.primaryAutosave.webtoonTheme
        : "vivid",
      panelGutter: typeof fixture.primaryAutosave.panelGutter === "number"
        ? fixture.primaryAutosave.panelGutter
        : 32,
      publishPack: undefined,
    } as unknown as StudioProjectSnapshot;
    const migratedV3 = migrateStudioProjectSnapshotV2ToArchiveV3({
      snapshot: v2Snapshot,
      archiveId: "archive-v3-roundtrip-1",
      workScope: "work:doc-ep-1",
      createdAt: fixture.savedAt,
      sourceCoordinates: createEmptyStudioVersionCoordinates(),
      selectedElementIds: ["frame-panel-2"],
      primarySelectionId: "frame-panel-2",
      zoom: 1.25,
      panX: 16,
      panY: 32,
      activeTool: "draw",
    });
    const archiveV3Issues = validateStudioProjectArchiveV3(migratedV3.archive);
    const serializedV3 = serializeStudioProjectArchiveV3(migratedV3.archive);
    const projectedV2 = projectStudioArchiveV3ToV2Snapshot({
      archive: JSON.parse(serializedV3) as typeof migratedV3.archive,
      workspace: migratedV3.workspace,
    });
    const projectedV2Parity = summarizeAutosavePayloadParity(projectedV2 as unknown as StudioAutosavePayload);

    // 원본 불변성(source immutability) 확인
    const { sourceDigest: expectedDigest, ...rawFixtureWithoutDigest } = fixture;
    const afterRoundtripDigest = computeCanonicalFixtureDigest(rawFixtureWithoutDigest);

    return {
      navigationType,
      reconciledAuthority,
      restoredParity,
      expectedParity: fixture.expectedParity,
      toonstudioPackage: {
        writeMode,
        chosenTargetKind: chosenTarget.kind,
        importedProjectId: importedPackage.project.id,
        importedProjectTitle: importedPackage.project.title,
        thumbnailPreserved: importedPackage.project.thumbnailUrl === fixture.project.thumbnailUrl,
        definitionPreserved:
          JSON.stringify(importedPackage.project.definition) === JSON.stringify(fixture.project.definition),
        documentCount: importedDocsInStore.documents.length,
        archivedStatusPreserved: importedSecondaryDoc.status === "archived",
        saveProfileAccessMode: importedSaveProfile.accessMode,
        saveProfileDistributionState: importedSaveProfile.distributionState,
        submissionsCount: importedSubmissions.length,
        submissionPlatform: importedSubmissions[0]?.platform ?? null,
        parity: importedPackageParity,
        libraryCount: importedLibrary.projects.length,
      },
      toonprojectZipArchive: {
        attachmentCount: builtArchive.manifest.attachments.length,
        rehydratedParity: rehydratedArchiveParity,
        rasterRefUriValid: rasterRefUri.startsWith("toonstudio-asset://sha256/"),
        audioRefUriValid: audioRefUri.startsWith("toonstudio-asset://sha256/"),
        resolvedRasterSha256Matches: resolvedRasterSha256 === fixture.media.primaryRasterSha256,
        resolvedAudioSha256Matches: resolvedAudioSha256 === fixture.media.attachmentWavSha256,
      },
      v12RecoveryPackage: {
        seq: restoredV12.seq,
        issuesCount: restoredV12.recovery.issues.length,
        digestMatchesManifest:
          projectDigest(restoredV12.project) === openedV12.manifest.recovered.projectDigest,
        opfsPngSha256Matches:
          opfsStoredPng !== null && sha256HexPortable(opfsStoredPng) === fixture.media.primaryRasterSha256,
        opfsWavSha256Matches:
          opfsStoredWav !== null && sha256HexPortable(opfsStoredWav) === fixture.media.attachmentWavSha256,
      },
      archiveV3Roundtrip: {
        version: migratedV3.archive.version,
        issuesCount: archiveV3Issues.length,
        workspaceSeparated: !("currentPageId" in migratedV3.archive.content),
        projectedParity: projectedV2Parity,
      },
      sourceImmutability: {
        expectedDigest,
        afterRoundtripDigest,
        unchanged: expectedDigest === afterRoundtripDigest,
      },
    };
  },

  async verifyCancellationAndFailureIsolation(runId: string) {
    const fixture = createStudioDataPersistenceFixture();
    window.localStorage.clear();
    seedFixtureStores(window.localStorage, fixture);
    const baselineAutosaveKey = studioAutosaveKey({ userId: null, workId: "doc-ep-1" });
    window.localStorage.setItem(baselineAutosaveKey, serializeStudioAutosave(fixture.primaryAutosave));

    const builtPackage = buildStudioProjectPackage({
      project: fixture.project,
      documents: fixture.documents,
      profile: fixture.profile,
      submissions: fixture.submissions,
      exportedAt: fixture.savedAt,
    });
    const realPackageBytes = new Uint8Array(await builtPackage.blob.arrayBuffer());

    // 1. 실제 File slice 읽기 도중 AbortSignal 취소 (.toonstudio import)
    const packageAbortController = new AbortController();
    const midReadAbortingFile = new File([realPackageBytes], builtPackage.fileName, {
      type: builtPackage.blob.type,
    });
    const originalFileSlice = midReadAbortingFile.slice.bind(midReadAbortingFile);
    let packageSliceCount = 0;
    Object.defineProperty(midReadAbortingFile, "slice", {
      value: (start?: number, end?: number, contentType?: string) => {
        packageSliceCount += 1;
        const sliced = originalFileSlice(start, end, contentType);
        if (packageSliceCount >= 2) {
          packageAbortController.abort();
        }
        return sliced;
      },
    });

    let packageImportAbortCode: string | null = null;
    try {
      await importStudioProjectPackage(midReadAbortingFile, {
        storage: window.localStorage,
        signal: packageAbortController.signal,
      });
    } catch (cause) {
      const importErr = cause as { readonly code?: string } | null;
      if (importErr && typeof importErr.code === "string") {
        packageImportAbortCode = importErr.code;
      }
    }
    const projectsAfterPackageAbort = readStudioProjectLibrary(window.localStorage).projects;
    const baselineAfterPackageAbort = readStudioAutosave(window.localStorage, baselineAutosaveKey);

    // 2. 실제 Blob slice 읽기 도중 AbortSignal 취소 (.toonproject.zip import)
    const builtArchive = await buildStudioProjectArchive(
      { project: fixture.primaryAutosave },
      { crc32ExecutionMode: "direct-bounded" },
    );
    const archiveAbortController = new AbortController();
    const midReadAbortingArchiveBlob = builtArchive.blob;
    const originalBlobSlice = midReadAbortingArchiveBlob.slice.bind(midReadAbortingArchiveBlob);
    let archiveSliceCount = 0;
    Object.defineProperty(midReadAbortingArchiveBlob, "slice", {
      value: (start?: number, end?: number, contentType?: string) => {
        archiveSliceCount += 1;
        const sliced = originalBlobSlice(start, end, contentType);
        if (archiveSliceCount >= 2) {
          archiveAbortController.abort();
        }
        return sliced;
      },
    });
    let archiveImportAbortName: string | null = null;
    try {
      await importStudioProjectArchive(midReadAbortingArchiveBlob, {
        signal: archiveAbortController.signal,
      });
    } catch (cause) {
      archiveImportAbortName = (cause as { name?: string })?.name ?? "unknown";
    }

    // 3. .toonproject.zip 빌드 및 V12 복구 패키지 가져오기 취소 분리
    const preAbortedController = new AbortController();
    preAbortedController.abort();
    let archiveBuildAbortName: string | null = null;
    try {
      await buildStudioProjectArchive(
        { project: fixture.primaryAutosave },
        { signal: preAbortedController.signal, crc32ExecutionMode: "direct-bounded" },
      );
    } catch (cause) {
      archiveBuildAbortName = (cause as { name?: string })?.name ?? "unknown";
    }

    let v12ImportAbortName: string | null = null;
    try {
      await importStudioV12RecoveryPackage(new Uint8Array([1, 2, 3]), {
        signal: preAbortedController.signal,
        digest: browserStudioOpfsDigest(),
      });
    } catch (cause) {
      v12ImportAbortName = (cause as { name?: string })?.name ?? "unknown";
    }

    // 4. OPFS 주 자동저장 쓰기 도중 AbortSignal 취소 -> SQLite 폴백/열화 오판 없이 즉시 중단 + 직전 정상 스냅샷 보존
    const sqlite = createBrowserSqlitePort(`${IDB_KV_DB_NAME}-abort-${runId}`);
    const opfsKey = studioAutosaveKey({ userId: null, workId: `abort-doc-${runId}` });
    const docSession = await openStudioAutosaveDocumentSession(opfsKey);
    let opfsAutosaveAbortName: string | null = null;
    let degradedCalledOnAbort = false;
    let preservedAfterAutosaveAbort: StudioAutosavePayload | null;
    try {
      await persistStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: opfsKey,
        payload: fixture.primaryAutosave,
        session: docSession.session,
        sqlite,
      });
      const abortedPayload: StudioAutosavePayload = {
        ...fixture.primaryAutosave,
        savedAt: "2026-09-20T11:00:00.000Z",
        title: "취소되어 커밋되면 안 되는 제목",
      };
      try {
        await persistStudioAutosaveWithOpfsPrimary({
          storage: window.localStorage,
          key: opfsKey,
          payload: abortedPayload,
          session: docSession.session,
          sqlite,
          signal: preAbortedController.signal,
          onDurableAuthorityDegraded: () => {
            degradedCalledOnAbort = true;
          },
        });
      } catch (cause) {
        opfsAutosaveAbortName = (cause as { name?: string })?.name ?? "unknown";
      }
      const reconciled = await reconcileStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: opfsKey,
        session: docSession.session,
        sqlite,
      });
      preservedAfterAutosaveAbort = reconciled.candidate?.payload ?? null;
    } finally {
      await closeDocumentSession(docSession);
    }

    // 5. 복원(restoreStudioAutosaveRecovery) 중 취소 vs. 사이드카 예외 시 undo/redo 및 복원 후보 보존
    const cancelRestoreRuntime = runRestoreWithRuntime(fixture.primaryAutosave, {
      preserveCurrentDocument: async () => {
        throw new DOMException("사용자 복원 취소", "AbortError");
      },
    });
    const cancelRestoreResult = await cancelRestoreRuntime.execute();
    const cancelRestoreState = cancelRestoreRuntime.getState();

    const failRestoreRuntime = runRestoreWithRuntime(fixture.primaryAutosave, {
      throwOnCommentsSetter: true,
    });
    const failRestoreResult = await failRestoreRuntime.execute();
    const failRestoreState = failRestoreRuntime.getState();

    return {
      packageImportAbort: {
        code: packageImportAbortCode,
        sliceCount: packageSliceCount,
        projectsPreservedCount: projectsAfterPackageAbort.length,
        originalProjectIntact: projectsAfterPackageAbort[0]?.id === fixture.project.id,
        baselineAutosaveIntact: baselineAfterPackageAbort?.payload.title === fixture.primaryAutosave.title,
      },
      archiveImportAbort: {
        errorName: archiveImportAbortName,
        sliceCount: archiveSliceCount,
      },
      archiveBuildAbortName,
      v12ImportAbortName,
      opfsAutosaveAbort: {
        errorName: opfsAutosaveAbortName,
        degradedCalledOnAbort,
        preservedTitle: preservedAfterAutosaveAbort?.title ?? null,
        preservedSavedAt: preservedAfterAutosaveAbort?.savedAt ?? null,
      },
      restoreCancelAndFailure: {
        cancelReturnedFalse: cancelRestoreResult === false,
        cancelErrorIsNull: cancelRestoreState.currentError === null,
        cancelCandidatePreserved: cancelRestoreRuntime.candidateRef.current !== null,
        cancelUndoHistoryIntact:
          cancelRestoreRuntime.pagesHistoryRef.current.length === 1 &&
          cancelRestoreState.currentTitle === "초기 제목",
        failReturnedFalse: failRestoreResult === false,
        failErrorMessage: failRestoreState.currentError,
        failCandidatePreserved: failRestoreRuntime.candidateRef.current !== null,
        failUndoHistoryRolledBack:
          failRestoreRuntime.pagesHistoryRef.current.length === 1 &&
          (failRestoreRuntime.pagesHistoryRef.current[0] as Array<{ id?: string }>)?.[0]?.id === "initial-page" &&
          failRestoreRuntime.pagesHiRef.current === 0,
      },
    };
  },

  async verifyUnsupportedQuotaTornAndStaleRecovery(runId: string) {
    const fixture = createStudioDataPersistenceFixture();

    // 1. 미지원 저장소(Unsupported storage: getDirectory/locks 부재)
    const unsupportedSession = await createStudioAutosaveOpfsSession(
      `unsupported-key-${runId}`,
      { navigator: { storage: { getDirectory: undefined }, locks: undefined } },
    );
    const sqlite = createBrowserSqlitePort(`${IDB_KV_DB_NAME}-edge-${runId}`);
    const unsupportedKey = studioAutosaveKey({ userId: null, workId: `unsupported-doc-${runId}` });
    const sqliteFallbackReceipt = await persistStudioAutosaveWithOpfsPrimary({
      storage: window.localStorage,
      key: unsupportedKey,
      payload: fixture.primaryAutosave,
      session: null,
      sqlite,
    });
    let noAuthorityErrorCode: string | null = null;
    try {
      await persistStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: unsupportedKey,
        payload: fixture.primaryAutosave,
        session: null,
        sqlite: null,
      });
    } catch (cause) {
      if (cause instanceof StudioAutosaveDurabilityError) {
        noAuthorityErrorCode = cause.code;
      }
    }
    const unverifiedOnlyStorageKey = studioAutosaveKey({ userId: null, workId: `unverified-only-${runId}` });
    window.localStorage.setItem(unverifiedOnlyStorageKey, serializeStudioAutosave(fixture.primaryAutosave));
    const unverifiedReconcileResult = await reconcileStudioAutosaveWithOpfsPrimary({
      storage: window.localStorage,
      key: unverifiedOnlyStorageKey,
      session: null,
      sqlite: null,
    });

    // 2. 쿼터 초과(QuotaExceededError) 및 스트림 쓰기 실패 시 마지막 정상 문서 보존
    window.localStorage.clear();
    seedFixtureStores(window.localStorage, fixture);
    const baselineKey = studioAutosaveKey({ userId: null, workId: "doc-ep-1" });
    window.localStorage.setItem(baselineKey, serializeStudioAutosave(fixture.primaryAutosave));

    const builtPackage = buildStudioProjectPackage({
      project: fixture.project,
      documents: fixture.documents,
      profile: fixture.profile,
      submissions: fixture.submissions,
      exportedAt: fixture.savedAt,
      additionalEntries: buildStudioProjectWorkspacePackageEntries(fixture.documents, [
        {
          documentId: "doc-ep-1",
          key: baselineKey,
          authority: "opfs-journal",
          savedAt: fixture.primaryAutosave.savedAt,
          payload: fixture.primaryAutosave,
        },
      ]),
    });
    const packageFile = new File([builtPackage.blob], builtPackage.fileName, {
      type: builtPackage.blob.type,
    });

    const quotaFailingStorage: Storage = {
      get length() { return window.localStorage.length; },
      clear: () => window.localStorage.clear(),
      getItem: (k) => window.localStorage.getItem(k),
      key: (i) => window.localStorage.key(i),
      removeItem: (k) => window.localStorage.removeItem(k),
      setItem: (k, v) => {
        if (k.includes("autosave")) {
          throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        }
        window.localStorage.setItem(k, v);
      },
    };
    let quotaImportErrorCode: string | null = null;
    try {
      await importStudioProjectPackage(packageFile, {
        storage: quotaFailingStorage,
        now: "2026-09-20T12:00:00.000Z",
      });
    } catch (cause) {
      const importErr = cause as { readonly code?: string } | null;
      quotaImportErrorCode =
        (importErr && typeof importErr.code === "string" ? importErr.code : null) ??
        (cause as { name?: string })?.name ??
        null;
    }
    const libraryAfterQuotaFailure = readStudioProjectLibrary(window.localStorage);
    const baselineAfterQuotaFailure = readStudioAutosave(window.localStorage, baselineKey);

    let writableAbortedOnStreamError = false;
    const failingWritableHandle: StudioProjectPackageWritableFileHandle = {
      kind: "file",
      name: "quota-fail.toonstudio",
      async createWritable() {
        return {
          async write() {
            throw new DOMException("Disk full", "QuotaExceededError");
          },
          async close() {
            return undefined;
          },
          async abort() {
            writableAbortedOnStreamError = true;
          },
        };
      },
    };
    let streamWriteErrorName: string | null = null;
    try {
      await writeStudioProjectPackageToTarget(builtPackage, {
        kind: "file-handle",
        handle: failingWritableHandle,
      });
    } catch (cause) {
      streamWriteErrorName = (cause as { name?: string })?.name ?? "Error";
    }

    // 3. 중간 중단(Torn write): 실제 OPFS에서 rev-1(슬롯 a) 정상 커밋 후 rev-2(슬롯 b) 쓰기 도중 중단(손상된 head-b/manifest-b + 절단된 writer-lease.bin + 미커밋 청크 잔재) -> rev-1 복구 검증
    const tornKey = studioAutosaveKey({ userId: null, workId: `torn-doc-${runId}` });
    const rev1Payload: StudioAutosavePayload = {
      ...fixture.primaryAutosave,
      savedAt: "2026-09-20T09:30:00.000Z",
      title: "Rev1 정상 커밋 원고",
    };
    const rev2Payload: StudioAutosavePayload = {
      ...fixture.primaryAutosave,
      savedAt: "2026-09-20T09:45:00.000Z",
      title: "Rev2 최신 커밋 원고",
    };
    const tornWriterDocSession = await openStudioAutosaveDocumentSession(tornKey);
    try {
      await tornWriterDocSession.session!.write(rev1Payload);
    } finally {
      await closeDocumentSession(tornWriterDocSession);
    }

    // 실제 OPFS(toonstudio-studio-autosave-v3) 내 비활성 슬롯 b(head-b.bin / manifest-b.bin)에 부분 손상 쓰기 + writer-lease.bin 3바이트 절단 + 미커밋 청크 잔재 주입
    const opfsFs = createStudioOpfsNativeFileSystem(
      navigator.storage as unknown as StudioOpfsStorageManagerLike,
      "toonstudio-studio-autosave-v3",
    );
    const tornDocId = `autosave-${sha256HexPortable(new TextEncoder().encode(tornKey)).slice(0, 48)}`;
    const tornBasePath = `recovery-journals/${tornDocId}`;
    await opfsFs.write(`${tornBasePath}/manifest-b.bin`, new TextEncoder().encode("{\"corrupt-manifest-b"));
    await opfsFs.write(`${tornBasePath}/head-b.bin`, new TextEncoder().encode("{\"corrupt-head-b"));
    await opfsFs.write(`${tornBasePath}/writer-lease.bin`, Uint8Array.from([0x01, 0x02, 0x03]));
    await opfsFs.write(`${tornBasePath}/cp-000000000002-e2-c00000.bin`, new TextEncoder().encode("partial-staging"));

    const tornRecoveryDocSession = await openStudioAutosaveDocumentSession(tornKey);
    let recoveredAfterTornWrite: StudioAutosavePayload | null = null;
    try {
      const latestFromOpfs = await tornRecoveryDocSession.session!.readLatest();
      if (latestFromOpfs?.state === "snapshot") {
        recoveredAfterTornWrite = latestFromOpfs.payload;
      }
    } finally {
      await closeDocumentSession(tornRecoveryDocSession);
    }

    // 4. Stale revision / 구버전(v1->v2) 승격 / 미지원 미래 버전(v99) 거부 / 중복 import 격리
    const staleKey = studioAutosaveKey({ userId: null, workId: `stale-doc-${runId}` });
    const staleDocSession = await openStudioAutosaveDocumentSession(staleKey);
    let staleDidNotOverwrite: boolean;
    try {
      await persistStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: staleKey,
        payload: rev2Payload,
        session: staleDocSession.session,
        sqlite,
      });
      try {
        await persistStudioAutosaveWithOpfsPrimary({
          storage: window.localStorage,
          key: staleKey,
          payload: rev1Payload,
          session: staleDocSession.session,
          sqlite,
          isCurrent: () => false,
        });
      } catch {
        // Stale snapshot AbortError expected.
      }
      // localStorage에 구버전 타임스탬프가 남아 있어도 OPFS 최신본(rev2)이 우선해야 함
      window.localStorage.setItem(staleKey, serializeStudioAutosave(rev1Payload));
      const reconciled = await reconcileStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: staleKey,
        session: staleDocSession.session,
        sqlite,
      });
      staleDidNotOverwrite = reconciled.candidate?.payload.title === "Rev2 최신 커밋 원고";
    } finally {
      await closeDocumentSession(staleDocSession);
    }

    // 구버전 v1 -> v2 자동 승격 및 미래 버전 v99 거부
    const legacyV1Key = studioAutosaveKey({ userId: null, workId: `legacy-v1-${runId}` });
    window.localStorage.setItem(
      legacyV1Key,
      JSON.stringify({
        version: 1,
        savedAt: fixture.savedAt,
        title: "구버전 V1 원고",
        pagesList: fixture.primaryAutosave.pagesList,
      }),
    );
    const upgradedFromV1 = readStudioAutosave(window.localStorage, legacyV1Key);

    const futureV99Key = studioAutosaveKey({ userId: null, workId: `future-v99-${runId}` });
    const rawV99 = JSON.stringify({
      version: 99,
      savedAt: fixture.savedAt,
      title: "미래 버전 V99 원고",
      pagesList: fixture.primaryAutosave.pagesList,
    });
    window.localStorage.setItem(futureV99Key, rawV99);
    let futureVersionErrorDetected = false;
    try {
      readStudioAutosave(window.localStorage, futureV99Key);
    } catch (cause) {
      futureVersionErrorDetected = cause instanceof StudioAutosaveUnsupportedVersionError;
    }
    const futureRawPreservedInStorage = window.localStorage.getItem(futureV99Key) === rawV99;

    // 중복 import(3회 연속 동일 파일 import 시 ID 격리 및 기존 원고 보존)
    window.localStorage.clear();
    seedFixtureStores(window.localStorage, fixture);
    window.localStorage.setItem(baselineKey, serializeStudioAutosave(fixture.primaryAutosave));
    const duplicateProjectIds: string[] = [];
    for (let idx = 1; idx <= 3; idx += 1) {
      const imported = await importStudioProjectPackage(packageFile, {
        storage: window.localStorage,
        now: `2026-09-20T12:1${idx}:00.000Z`,
      });
      duplicateProjectIds.push(imported.project.id);
    }
    const allProjectsAfterDuplicateImports = readStudioProjectLibrary(window.localStorage).projects;
    const originalAutosaveAfterDuplicateImports = readStudioAutosave(window.localStorage, baselineKey);

    return {
      unsupportedStorage: {
        sessionIsNull: unsupportedSession === null,
        sqliteFallbackAuthority: sqliteFallbackReceipt.authority,
        noAuthorityErrorCode,
        unverifiedLocalStorageRejected: unverifiedReconcileResult.durability === "compatibility-only",
      },
      quotaAndWriteFailure: {
        quotaImportErrorCode,
        originalProjectPreserved:
          libraryAfterQuotaFailure.projects.length === 1 &&
          libraryAfterQuotaFailure.projects[0]?.id === fixture.project.id,
        lastKnownGoodAutosavePreserved:
          baselineAfterQuotaFailure?.payload.title === fixture.primaryAutosave.title,
        streamWriteErrorName,
        writableAbortedOnStreamError,
      },
      tornWriteRecovery: {
        recoveredTitle: recoveredAfterTornWrite?.title ?? null,
        recoveredSavedAt: recoveredAfterTornWrite?.savedAt ?? null,
        recoveredParityMatchesFixture:
          recoveredAfterTornWrite !== null &&
          JSON.stringify(summarizeAutosavePayloadParity(recoveredAfterTornWrite)) ===
            JSON.stringify({ ...fixture.expectedParity, title: "Rev1 정상 커밋 원고" }),
      },
      staleAndVersionChecks: {
        staleDidNotOverwrite,
        upgradedFromV1Version: upgradedFromV1?.payload.version ?? null,
        upgradedFromV1Title: upgradedFromV1?.payload.title ?? null,
        futureVersionErrorDetected,
        futureRawPreservedInStorage,
      },
      duplicateImports: {
        distinctImportedIdsCount: new Set(duplicateProjectIds).size,
        totalProjectsInLibrary: allProjectsAfterDuplicateImports.length,
        originalProjectStillPresent: allProjectsAfterDuplicateImports.some(
          (proj) => proj.id === fixture.project.id,
        ),
        originalAutosaveIntact:
          originalAutosaveAfterDuplicateImports?.payload.title === fixture.primaryAutosave.title,
      },
    };
  },

  async openTabAutosaveLeaderOrFollower(tabId: string, workId: string, runId: string) {
    const key = studioAutosaveKey({ userId: null, workId });
    const sqlite = createBrowserSqlitePort(`${IDB_KV_DB_NAME}-multitab-${runId}`);
    const docSession = await openStudioAutosaveDocumentSession(key);
    tabSessions.set(tabId, { key, sqlite, docSession, opfsSession: docSession.session });
    return {
      tabId,
      key,
      role: docSession.lease.role,
    };
  },

  async attemptTabAutosaveWrite(tabId: string, title: string, savedAt: string) {
    const entry = tabSessions.get(tabId);
    if (!entry) throw new Error(`Tab session not found: ${tabId}`);
    const fixture = createStudioDataPersistenceFixture();
    const payload: StudioAutosavePayload = {
      ...fixture.primaryAutosave,
      title,
      savedAt,
    };
    try {
      const receipt = await persistStudioAutosaveWithOpfsPrimary({
        storage: window.localStorage,
        key: entry.key,
        payload,
        session: entry.opfsSession,
        sqlite: withStudioAutosaveDocumentLeadership(entry.sqlite, entry.docSession.lease),
      });
      return {
        tabId,
        role: entry.docSession.lease.role,
        fenced: false,
        fencedCode: null,
        authority: receipt.authority,
        savedAt: payload.savedAt,
        title: payload.title,
      };
    } catch (cause) {
      if (cause instanceof StudioAutosaveDocumentBusyError) {
        return {
          tabId,
          role: entry.docSession.lease.role,
          fenced: true,
          fencedCode: cause.name,
          authority: null,
          savedAt: payload.savedAt,
          title: payload.title,
        };
      }
      throw cause;
    }
  },

  async promoteTabSessionIfLeader(tabId: string) {
    const entry = tabSessions.get(tabId);
    if (!entry) throw new Error(`Tab session not found: ${tabId}`);
    if (entry.docSession.lease.role === "leader") {
      entry.opfsSession = await reopenStudioAutosaveDocumentSessionForLeadership({
        session: entry.opfsSession,
        autosaveKey: entry.key,
        documentLease: entry.docSession.lease,
      });
    }
    return {
      tabId,
      role: entry.docSession.lease.role,
    };
  },

  async readTabReconciledAutosave(tabId: string) {
    const entry = tabSessions.get(tabId);
    if (!entry) throw new Error(`Tab session not found: ${tabId}`);
    const reconciled = await reconcileStudioAutosaveWithOpfsPrimary({
      storage: window.localStorage,
      key: entry.key,
      session: entry.opfsSession,
      sqlite: withStudioAutosaveDocumentLeadership(entry.sqlite, entry.docSession.lease),
    });
    return {
      tabId,
      role: entry.docSession.lease.role,
      authority: reconciled.authority ?? null,
      title: reconciled.candidate?.payload.title ?? null,
      savedAt: reconciled.candidate?.payload.savedAt ?? null,
    };
  },

  async closeTabAutosaveSession(tabId: string) {
    const entry = tabSessions.get(tabId);
    if (!entry) return false;
    tabSessions.delete(tabId);
    await entry.opfsSession?.dispose().catch(() => undefined);
    await entry.docSession.lease.release().catch(() => undefined);
    return true;
  },
};

declare global {
  interface Window {
    __studioDataPersistenceHarness?: typeof studioDataPersistenceBrowserHarness;
  }
}

if (typeof window !== "undefined") {
  window.__studioDataPersistenceHarness = studioDataPersistenceBrowserHarness;
}

