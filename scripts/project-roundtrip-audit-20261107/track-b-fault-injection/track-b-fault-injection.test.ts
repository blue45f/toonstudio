import {
  CommandBus,
  createEmptyScene,
  type JournalEntryIR,
  type JournalStore,
  type SnapshotIR,
} from "@toonstudio/studio-project-model";
import { describe, expect, it } from "vitest";

import {
  createStudioDrawingPointerTransportController,
} from "../../../apps/web/src/domains/creator/brush/studio-drawing-pointer-transport";
import {
  buildStudioProjectPackage,
  chooseStudioProjectPackageSaveTarget,
  type StudioProjectPackageWritableFileHandle,
  writeStudioProjectPackageToTarget,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-package";
import {
  importStudioProjectPackage,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-package-import";
import {
  buildStudioProjectWorkspacePackageEntries,
} from "../../../apps/web/src/domains/creator/save-first/studio-project-workspace-snapshots";
import {
  STUDIO_SAVE_PROFILE_UPDATED_EVENT,
} from "../../../apps/web/src/domains/creator/save-first/studio-save-profile";
import {
  STUDIO_SUBMISSION_UPDATED_EVENT,
} from "../../../apps/web/src/domains/creator/save-first/studio-submission-store";
import {
  serializeStudioAutosave,
  studioAutosaveKey,
} from "../../../apps/web/src/domains/creator/studio-autosave";
import {
  persistStudioAutosaveWithOpfsPrimary,
  reconcileStudioAutosaveWithOpfsPrimary,
  type StudioAutosaveOpfsSession,
} from "../../../apps/web/src/domains/creator/studio-autosave-opfs-session";
import {
  browserStudioOpfsDigest,
} from "../../../apps/web/src/domains/creator/studio-opfs-asset-store";
import {
  restoreStudioAutosaveRecovery,
  type StudioAutosaveRestoreContext,
} from "../../../apps/web/src/domains/creator/studio-page-autosave-runtime";
import {
  buildStudioProjectArchive,
  importStudioProjectArchive,
} from "../../../apps/web/src/domains/creator/studio-project-archive";
import {
  STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
} from "../../../apps/web/src/domains/creator/studio-project-document-store";
import {
  readStudioProjectLibrary,
  STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
} from "../../../apps/web/src/domains/creator/studio-project-library-store";
import {
  buildStudioV12RecoveryPackage,
  importStudioV12RecoveryPackage,
  restoreStudioV12RecoveryPackage,
} from "../../../apps/web/src/domains/creator/studio-v12-recovery-package";
import {
  canonicalJsonDigest,
  createMemoryStorage,
  createTrackASyntheticFixture,
  snapshotStorageState,
} from "../track-a-roundtrip-migration/synthetic-fixtures";

import {
  attachMidReadAbortOnSlice,
  buildFaultInjectedZipBytes,
  createEventRecordingTarget,
  createQuotaFaultStorage,
  createSeededBaselineEnvironment,
  flipFirstZipEntryPayloadByte,
} from "./fault-harness";

const TEXT_ENCODER = new TextEncoder();

function createMemoryJournalStore(): JournalStore {
  const entries: JournalEntryIR[] = [];
  const snapshots: SnapshotIR[] = [];
  return {
    async append(entry) {
      entries.push(entry);
    },
    async readEntries() {
      return [...entries];
    },
    async writeSnapshot(snapshot) {
      snapshots.push(snapshot);
    },
    async readSnapshots() {
      return [...snapshots];
    },
  };
}

function buildValidPackageFile() {
  const fixture = createTrackASyntheticFixture();
  const additionalEntries = buildStudioProjectWorkspacePackageEntries(fixture.documents, [
    {
      documentId: "doc-main-1",
      key: studioAutosaveKey({ userId: null, workId: "doc-main-1" }),
      authority: "opfs-journal",
      savedAt: fixture.primarySnapshot.savedAt,
      payload: fixture.primarySnapshot,
    },
    {
      documentId: "doc-archived-empty-2",
      key: studioAutosaveKey({ userId: null, workId: "doc-archived-empty-2" }),
      authority: "opfs-journal",
      savedAt: fixture.archivedEmptyElementsSnapshot.savedAt,
      payload: fixture.archivedEmptyElementsSnapshot,
    },
  ]);
  const built = buildStudioProjectPackage({
    project: fixture.project,
    documents: fixture.documents,
    profile: fixture.profile,
    submissions: fixture.submissions,
    exportedAt: fixture.savedAt,
    additionalEntries,
  });
  return {
    fixture,
    built,
    file: new File([built.blob], built.fileName, { type: built.blob.type }),
  };
}

describe("Track B: export/import 중 abort·quota 오류·손상 archive에서 사용자 원본 불변성 fault injection 감사", () => {
  it("B-1. 내보내기(buildStudioProjectPackage / buildStudioProjectArchive / buildStudioV12RecoveryPackage) 중 정상·취소·오류 상황에서 호출자 원본 객체와 스토리지가 절대 변이되지 않는다", async () => {
    const env = createSeededBaselineEnvironment();
    const { fixture } = env;
    const fixtureDigestBefore = fixture.sourceDigest;

    // 1. .toonstudio 패키지 빌드
    const builtPkg = buildStudioProjectPackage({
      project: fixture.project,
      documents: fixture.documents,
      profile: fixture.profile,
      submissions: fixture.submissions,
      exportedAt: fixture.savedAt,
    });
    expect(builtPkg.blob.size).toBeGreaterThan(0);

    // 2. .toonproject.zip 빌드 중 AbortSignal 취소 주입
    const preAborted = new AbortController();
    preAborted.abort();
    await expect(
      buildStudioProjectArchive(
        { project: fixture.primarySnapshot },
        { signal: preAborted.signal, crc32ExecutionMode: "direct-bounded" },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    // 3. .toonrecovery.zip 빌드 중 AbortSignal 취소 및 손상 히스토리 주입
    const history = createMemoryJournalStore();
    const { bus } = await CommandBus.open(history);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(720, 2400) });
    const entriesBefore = await history.readEntries();
    const snapshotsBefore = await history.readSnapshots();

    await expect(
      buildStudioV12RecoveryPackage(
        {
          project: {
            projectId: fixture.project.id,
            workspaceId: "draw",
            title: fixture.project.title,
          },
          history,
        },
        {
          signal: preAborted.signal,
          digest: browserStudioOpfsDigest(),
          crc32ExecutionMode: "direct-bounded",
        },
      ),
    ).rejects.toMatchObject({ name: "AbortError" });

    expect(await history.readEntries()).toEqual(entriesBefore);
    expect(await history.readSnapshots()).toEqual(snapshotsBefore);

    // 4. 호출자 원본 픽스처 및 기준 스토리지 바이트 단위 불변 확인
    const fixtureDigestAfter = canonicalJsonDigest({
      savedAt: fixture.savedAt,
      hangulNfcText: fixture.hangulNfcText,
      hangulNfdText: fixture.hangulNfdText,
      hangulJamoText: fixture.hangulJamoText,
      emojiComplexText: fixture.emojiComplexText,
      project: fixture.project,
      documents: fixture.documents,
      profile: fixture.profile,
      submissions: fixture.submissions,
      primarySnapshot: fixture.primarySnapshot,
      archivedEmptyElementsSnapshot: fixture.archivedEmptyElementsSnapshot,
      rasterBytes: [...fixture.rasterBytes],
      rasterSha256: fixture.rasterSha256,
      rasterDataUrl: fixture.rasterDataUrl,
      wavBytes: [...fixture.wavBytes],
      wavSha256: fixture.wavSha256,
    });
    expect(fixtureDigestAfter).toBe(fixtureDigestBefore);
    expect(canonicalJsonDigest(snapshotStorageState(env.storage))).toBe(env.baselineDigest);
  });

  it("B-2. 손상된 아카이브 15종 폴트 인젝션(.toonstudio / .toonproject.zip / .toonrecovery.zip) 시 기존 사용자 스토리지·저널이 단 1바이트도 변경되지 않는다", async () => {
    const env = createSeededBaselineEnvironment();
    const { built: validPkg } = buildValidPackageFile();
    const validPkgBytes = new Uint8Array(await validPkg.blob.arrayBuffer());

    // 1. .toonstudio 손상 벡터 10종
    const corruptedPackageVectors: ReadonlyArray<{ readonly name: string; readonly bytes: Uint8Array }> = [
      {
        name: "절단된 EOCD (10바이트 절단)",
        bytes: validPkgBytes.slice(0, validPkgBytes.byteLength - 10),
      },
      {
        name: "첫 엔트리 페이로드 1바이트 변조 (CRC32 불일치)",
        bytes: flipFirstZipEntryPayloadByte(validPkgBytes),
      },
      {
        name: "경로 순회(../evil.json) 엔트리 주입",
        bytes: buildFaultInjectedZipBytes([
          { name: "../evil.json", bytes: TEXT_ENCODER.encode("{}") },
        ]),
      },
      {
        name: "심볼릭 링크(0120000 << 16) 외부 속성 주입",
        bytes: buildFaultInjectedZipBytes([
          {
            name: "manifest.json",
            bytes: TEXT_ENCODER.encode("{}"),
            externalAttributes: (0o120777 << 16) >>> 0,
          },
        ]),
      },
      {
        name: "비-UTF8 플래그(0x0000) + 상위 바이트 경로 주입",
        bytes: buildFaultInjectedZipBytes([
          {
            name: "한글경로.json",
            bytes: TEXT_ENCODER.encode("{}"),
            flags: 0x0000,
          },
        ]),
      },
      {
        name: "선언된 압축 해제 크기 위조 (Zip Bomb / 크기 불일치)",
        bytes: buildFaultInjectedZipBytes([
          {
            name: "manifest.json",
            bytes: TEXT_ENCODER.encode("{}"),
            overrideUncompressedSize: 99_999,
          },
        ]),
      },
      {
        name: "허용되지 않은 추가 엔트리(workspace/documents/evil.json) 포함",
        bytes: buildFaultInjectedZipBytes([
          {
            name: "manifest.json",
            bytes: TEXT_ENCODER.encode(
              JSON.stringify({
                format: "toonstudio-project",
                formatVersion: 1,
                entryNames: ["manifest.json", "workspace/documents/evil.json"],
              }),
            ),
          },
          {
            name: "workspace/documents/evil.json",
            bytes: TEXT_ENCODER.encode("{}"),
          },
        ]),
      },
      {
        name: "필수 엔트리(project/documents.json) 누락",
        bytes: buildFaultInjectedZipBytes([
          {
            name: "manifest.json",
            bytes: TEXT_ENCODER.encode(
              JSON.stringify({
                format: "toonstudio-project",
                formatVersion: 1,
                entryNames: ["manifest.json"],
              }),
            ),
          },
        ]),
      },
      {
        name: "지원하지 않는 formatVersion: 99",
        bytes: buildFaultInjectedZipBytes([
          {
            name: "manifest.json",
            bytes: TEXT_ENCODER.encode(
              JSON.stringify({
                format: "toonstudio-project",
                formatVersion: 99,
                entryNames: ["manifest.json"],
              }),
            ),
          },
        ]),
      },
      {
        name: "손상된 JSON 구문 (manifest.json)",
        bytes: buildFaultInjectedZipBytes([
          {
            name: "manifest.json",
            bytes: TEXT_ENCODER.encode("{corrupted-json"),
          },
        ]),
      },
    ];

    for (const vector of corruptedPackageVectors) {
      const faultStorage = createQuotaFaultStorage(env.storage, {});
      const badFile = new File([new Uint8Array(vector.bytes)], "corrupted.toonstudio", {
        type: validPkg.blob.type,
      });
      await expect(
        importStudioProjectPackage(badFile, { storage: faultStorage.storage }),
      ).rejects.toThrow();
      // 스토리지 쓰기/삭제 호출이 단 1회도 발생하지 않았음을 확인
      expect(faultStorage.getSetItemCallCount()).toBe(0);
      expect(faultStorage.getRemoveItemCallCount()).toBe(0);
      expect(canonicalJsonDigest(snapshotStorageState(env.storage))).toBe(env.baselineDigest);
    }

    // 2. .toonproject.zip 손상 벡터 (절단, CRC32 불일치, 경로 순회)
    const builtArchive = await buildStudioProjectArchive(
      { project: env.fixture.primarySnapshot },
      { crc32ExecutionMode: "direct-bounded" },
    );
    const archiveBytes = new Uint8Array(await builtArchive.blob.arrayBuffer());
    await expect(
      importStudioProjectArchive(new Blob([archiveBytes.slice(0, archiveBytes.byteLength - 12)])),
    ).rejects.toThrow();
    await expect(
      importStudioProjectArchive(
        new Blob([new Uint8Array(flipFirstZipEntryPayloadByte(archiveBytes))]),
      ),
    ).rejects.toThrow();

    // 3. .toonrecovery.zip 손상 벡터 및 비어 있지 않은 기존 JournalStore 덮어쓰기 차단(DESTINATION_NOT_EMPTY)
    const existingHistory = createMemoryJournalStore();
    const { bus } = await CommandBus.open(existingHistory);
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(720, 2400) });
    const builtV12 = await buildStudioV12RecoveryPackage(
      {
        project: {
          projectId: env.fixture.project.id,
          workspaceId: "draw",
          title: env.fixture.project.title,
        },
        history: existingHistory,
      },
      { digest: browserStudioOpfsDigest(), crc32ExecutionMode: "direct-bounded" },
    );

    await expect(
      importStudioV12RecoveryPackage(flipFirstZipEntryPayloadByte(builtV12.bytes), {
        digest: browserStudioOpfsDigest(),
      }),
    ).rejects.toThrow();

    const validImportedV12 = await importStudioV12RecoveryPackage(builtV12.bytes, {
      digest: browserStudioOpfsDigest(),
    });
    const historyEntriesBeforeRestore = await existingHistory.readEntries();
    await expect(
      restoreStudioV12RecoveryPackage(validImportedV12, {
        history: existingHistory,
      }),
    ).rejects.toMatchObject({ code: "DESTINATION_NOT_EMPTY" });
    expect(await existingHistory.readEntries()).toEqual(historyEntriesBeforeRestore);
    expect(canonicalJsonDigest(snapshotStorageState(env.storage))).toBe(env.baselineDigest);
  });

  it("B-3. .toonstudio 가져오기 중 모든 쓰기 단계(step 1..N)별 일시적 QuotaExceededError 주입 시 기존 로컬 스토리지가 100% 원상 복구된다", async () => {
    const { file } = buildValidPackageFile();

    // 먼저 정상 import 시 총 setItem 호출 횟수(totalWrites)를 측정한다
    const probeEnv = createSeededBaselineEnvironment();
    const probeController = createQuotaFaultStorage(probeEnv.storage, {});
    await importStudioProjectPackage(file, {
      storage: probeController.storage,
      now: "2026-11-06T13:00:00.000Z",
    });
    const totalWrites = probeController.getSetItemCallCount();
    expect(totalWrites).toBeGreaterThanOrEqual(8);

    // 각 쓰기 단계 k = 1 .. totalWrites 마다 QuotaExceededError를 주입하고 롤백 무결성을 확인한다
    for (let step = 1; step <= totalWrites; step += 1) {
      const stepEnv = createSeededBaselineEnvironment();
      const faultController = createQuotaFaultStorage(stepEnv.storage, {
        failOnCallNumber: step,
        persistentFailureAfterTrigger: false,
      });

      let docSeq = 0;
      await expect(
        importStudioProjectPackage(file, {
          storage: faultController.storage,
          now: "2026-11-06T13:00:00.000Z",
          createProjectId: () => `quota-step-${step}`,
          createDocumentId: () => `quota-doc-${step}-${++docSeq}`,
        }),
      ).rejects.toThrow(/quota/iu);

      const snapshotAfterRollback = snapshotStorageState(stepEnv.storage);
      expect(snapshotAfterRollback).toEqual(stepEnv.baselineSnapshot);
      expect(canonicalJsonDigest(snapshotAfterRollback)).toBe(stepEnv.baselineDigest);
    }
  });

  it("B-4. 파일 핸들 스트림 쓰기/닫기 중 QuotaExceededError 및 파일 선택기 사용자 취소 시 writable.abort() 호출 및 원본 보호를 검증한다", async () => {
    const { built } = buildValidPackageFile();

    // 1. writable.write() 중 QuotaExceededError -> writable.abort() 호출 확인
    let abortedOnWriteError = false;
    const writeFailingHandle: StudioProjectPackageWritableFileHandle = {
      kind: "file",
      name: "write-quota.toonstudio",
      async createWritable() {
        return {
          async write() {
            throw new DOMException("Disk full on write", "QuotaExceededError");
          },
          async close() {
            return undefined;
          },
          async abort() {
            abortedOnWriteError = true;
          },
        };
      },
    };
    await expect(
      writeStudioProjectPackageToTarget(built, {
        kind: "file-handle",
        handle: writeFailingHandle,
      }),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(abortedOnWriteError).toBe(true);

    // 2. writable.close() 중 I/O 오류 -> writable.abort() 호출 및 예외 전파 확인
    let abortedOnCloseError = false;
    const closeFailingHandle: StudioProjectPackageWritableFileHandle = {
      kind: "file",
      name: "close-quota.toonstudio",
      async createWritable() {
        return {
          async write() {
            return undefined;
          },
          async close() {
            throw new DOMException("Disk full on flush/close", "QuotaExceededError");
          },
          async abort() {
            abortedOnCloseError = true;
          },
        };
      },
    };
    await expect(
      writeStudioProjectPackageToTarget(built, {
        kind: "file-handle",
        handle: closeFailingHandle,
      }),
    ).rejects.toMatchObject({ name: "QuotaExceededError" });
    expect(abortedOnCloseError).toBe(true);

    // 3. showSaveFilePicker 사용자 취소(AbortError) 시 AbortError 전파 및 캐시 미저장
    const cancellingWindow = {
      showSaveFilePicker: async () => {
        throw new DOMException("The user aborted a request.", "AbortError");
      },
    } as unknown as Window;
    await expect(
      chooseStudioProjectPackageSaveTarget(
        built.fileName,
        cancellingWindow,
        "proj-cancel-1",
      ),
    ).rejects.toMatchObject({ name: "AbortError" });
  });

  it("B-5. OPFS AbortError 전파·패키지 롤백 이벤트 복원·중간 읽기 AbortSignal 중단·복원 사이드카 실패 롤백 및 저널·영구 쿼터 경계를 검증한다", async () => {
    const env = createSeededBaselineEnvironment();
    const { file } = buildValidPackageFile();

    // [GAP-B1 회귀 게이트] persistStudioAutosaveWithOpfsPrimary는 OPFS 쓰기 AbortError 시 SQLite 폴백 쓰기나 localStorage 삭제 없이 AbortError를 즉시 전파함
    const abortingOpfsSession = {
      write: async () => {
        throw new DOMException("Aborted by signal", "AbortError");
      },
      readLatest: async () => null,
      dispose: async () => undefined,
    } as unknown as StudioAutosaveOpfsSession;
    const sqliteWrites: string[] = [];
    const mockSqlite = {
      write: async (key: string) => {
        sqliteWrites.push(key);
      },
      read: async () => null,
      clear: async () => undefined,
      delete: async () => undefined,
    };
    const abortController = new AbortController();
    abortController.abort();
    const initialSerializedSnapshot = serializeStudioAutosave(env.fixture.primarySnapshot);
    const opfsAbortStore = createMemoryStorage({
      [env.mainAutosaveKey]: initialSerializedSnapshot,
    });

    let degradedCalledOnAbort = false;
    await expect(
      persistStudioAutosaveWithOpfsPrimary({
        storage: opfsAbortStore,
        key: env.mainAutosaveKey,
        payload: env.fixture.primarySnapshot,
        session: abortingOpfsSession,
        sqlite: mockSqlite,
        signal: abortController.signal,
        onDurableAuthorityDegraded: () => {
          degradedCalledOnAbort = true;
        },
      }),
    ).rejects.toMatchObject({ name: "AbortError" });
    expect(sqliteWrites).toEqual([]);
    expect(opfsAbortStore.getItem(env.mainAutosaveKey)).toBe(initialSerializedSnapshot);
    expect(degradedCalledOnAbort).toBe(false);

    // [GAP-B2 회귀 게이트] reconcileStudioAutosaveWithOpfsPrimary는 OPFS readLatest 중 발생한 AbortError를 삼키지 않고 전파함
    const reconcileAbortSession = {
      write: async () => {
        throw new Error("not used");
      },
      readLatest: async () => {
        throw new DOMException("Aborted during OPFS readLatest", "AbortError");
      },
      dispose: async () => undefined,
    } as unknown as StudioAutosaveOpfsSession;
    await expect(
      reconcileStudioAutosaveWithOpfsPrimary({
        storage: env.storage,
        key: env.mainAutosaveKey,
        session: reconcileAbortSession,
        sqlite: null,
        signal: abortController.signal,
      }),
    ).rejects.toMatchObject({ name: "AbortError" });

    // [GAP-B3 회귀 게이트 + 영구 쿼터 경계]
    // (1) 마지막 쓰기 단계에서 실패할 때 STUDIO_SAVE_PROFILE_UPDATED_EVENT와 STUDIO_SUBMISSION_UPDATED_EVENT까지 원본으로 재발행됨
    const eventEnv = createSeededBaselineEnvironment();
    const eventRecorder = createEventRecordingTarget();
    const probeEnv = createSeededBaselineEnvironment();
    const probeFault = createQuotaFaultStorage(probeEnv.storage, {});
    await importStudioProjectPackage(file, { storage: probeFault.storage });
    const finalStep = probeFault.getSetItemCallCount();

    const finalStepFault = createQuotaFaultStorage(eventEnv.storage, {
      failOnCallNumber: finalStep,
    });
    await expect(
      importStudioProjectPackage(file, {
        storage: finalStepFault.storage,
        target: eventRecorder.target,
        createProjectId: () => "event-gap-proj",
      }),
    ).rejects.toThrow(/quota/iu);

    const eventTypes = eventRecorder.events.map((e) => e.type);
    expect(eventTypes.slice(-4)).toEqual([
      STUDIO_SAVE_PROFILE_UPDATED_EVENT,
      STUDIO_SUBMISSION_UPDATED_EVENT,
      STUDIO_PROJECT_LIBRARY_UPDATED_EVENT,
      STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT,
    ]);
    const lastProfileDetail = eventRecorder.latestDetailByType.get(
      STUDIO_SAVE_PROFILE_UPDATED_EVENT,
    ) as { profiles?: Record<string, unknown> } | undefined;
    expect(Boolean(lastProfileDetail?.profiles?.["import-event-gap-proj"])).toBe(true);
    const lastSubmissionDetail = eventRecorder.latestDetailByType.get(
      STUDIO_SUBMISSION_UPDATED_EVENT,
    ) as { submissions?: Array<{ projectId?: string }> } | undefined;
    expect(
      lastSubmissionDetail?.submissions?.some((sub) => sub.projectId === "import-event-gap-proj"),
    ).toBe(true);

    // (2) 스냅샷 쓰기 시점에 영구 QuotaExceededError(persistentFailureAfterTrigger: true)가 발생하면 restoreRaw의 setItem도 실패하여 라이브러리에 반쪽 프로젝트가 남는 경계 재현
    const persistentQuotaEnv = createSeededBaselineEnvironment();
    const persistentFault = createQuotaFaultStorage(persistentQuotaEnv.storage, {
      failWhenKeyIncludes: "autosave",
      persistentFailureAfterTrigger: true,
    });
    await expect(
      importStudioProjectPackage(file, {
        storage: persistentFault.storage,
        createProjectId: () => "persistent-quota-proj",
      }),
    ).rejects.toThrow(/quota/iu);
    const projectsAfterPersistentQuota = readStudioProjectLibrary(persistentQuotaEnv.storage).projects;
    expect(projectsAfterPersistentQuota.some((p) => p.id === "import-persistent-quota-proj")).toBe(
      true,
    );

    // [GAP-B4 회귀 게이트] importStudioProjectPackage와 importStudioProjectArchive가 mid-read Blob.slice 취소를 즉시 감지하여 AbortError로 중단함
    const midAbortEnv = createSeededBaselineEnvironment();
    const midAbortFile = attachMidReadAbortOnSlice(
      new File([await file.arrayBuffer()], file.name, { type: file.type }),
      2,
    );
    await expect(
      importStudioProjectPackage(midAbortFile.target, {
        storage: midAbortEnv.storage,
        signal: midAbortFile.controller.signal,
        createProjectId: () => "aborted-proj",
      }),
    ).rejects.toThrow(/취소|abort/iu);
    expect(midAbortFile.controller.signal.aborted).toBe(true);
    expect(canonicalJsonDigest(snapshotStorageState(midAbortEnv.storage))).toBe(
      midAbortEnv.baselineDigest,
    );

    const builtArchive = await buildStudioProjectArchive(
      { project: env.fixture.primarySnapshot },
      { crc32ExecutionMode: "direct-bounded" },
    );
    const midAbortArchive = attachMidReadAbortOnSlice(builtArchive.blob, 2);
    await expect(
      importStudioProjectArchive(midAbortArchive.target, {
        signal: midAbortArchive.controller.signal,
      }),
    ).rejects.toThrow(/취소|abort/iu);
    expect(midAbortArchive.controller.signal.aborted).toBe(true);

    // [GAP-B5] (1) restoreStudioV12RecoveryPackage 중간 실패 시 빈 JournalStore에 부분 스냅샷이 남아 재시도 시 DESTINATION_NOT_EMPTY 발생 경계 재현
    const sourceHistory = createMemoryJournalStore();
    const { bus } = await CommandBus.open(sourceHistory, { snapshotEvery: 2 });
    await bus.dispatch({ type: "scene/init", scene: createEmptyScene(720, 2400) });
    await bus.dispatch({
      type: "scene/set-background",
      color: { r: 0.1, g: 0.2, b: 0.3, a: 1 },
    });
    await bus.dispatch({
      type: "scene/set-background",
      color: { r: 0.4, g: 0.5, b: 0.6, a: 1 },
    });
    const builtV12 = await buildStudioV12RecoveryPackage(
      {
        project: {
          projectId: env.fixture.project.id,
          workspaceId: "draw",
          title: env.fixture.project.title,
        },
        history: sourceHistory,
      },
      { digest: browserStudioOpfsDigest(), crc32ExecutionMode: "direct-bounded" },
    );
    const importedV12 = await importStudioV12RecoveryPackage(builtV12.bytes, {
      digest: browserStudioOpfsDigest(),
    });

    let appendCount = 0;
    const partialTargetHistory: JournalStore = {
      ...createMemoryJournalStore(),
      async append(entry) {
        appendCount += 1;
        if (appendCount === 1) {
          throw new Error("Simulated journal append failure on entry #1");
        }
        return entry && undefined;
      },
    };
    await expect(
      restoreStudioV12RecoveryPackage(importedV12, {
        history: partialTargetHistory,
      }),
    ).rejects.toThrow(/history 복원이 중단됐습니다/u);
    expect((await partialTargetHistory.readSnapshots()).length).toBeGreaterThanOrEqual(1);
    await expect(
      restoreStudioV12RecoveryPackage(importedV12, {
        history: partialTargetHistory,
      }),
    ).rejects.toMatchObject({ code: "DESTINATION_NOT_EMPTY" });

    // (2) [회귀 게이트] restoreStudioAutosaveRecovery에서 setStudioComments가 예외를 던질 때 pagesHistoryRef와 복원 후보가 초기 상태로 원자적 롤백됨
    const initialPages = [{ id: "initial-page", canvasH: 1200, elements: [] }];
    const pagesHistoryRef = { current: [initialPages] as unknown[] };
    const pagesHiRef = { current: 0 };
    const candidateRef = {
      current: {
        key: env.mainAutosaveKey,
        authority: "opfs-journal" as const,
        savedAt: env.fixture.savedAt,
        sequence: 1,
        revision: 1,
        payload: env.fixture.primarySnapshot,
      },
    };
    const restoreCtx = {
      preserveCurrentDocument: async () => true,
      autosaveRecoveryCandidateRef: candidateRef,
      canApplyStudioMutation: () => true,
      captureStudioMutationTicket: () => ({ id: 1 }),
      collaborationDocumentLocked: false,
      collaborationLockMessage: () => "locked",
      drawingPointerTransportRef: {
        current: createStudioDrawingPointerTransportController(),
      },
      drawingRef: { current: null },
      hydrateStudioSidecarDocuments: () => undefined,
      pages: initialPages,
      pagesHiRef,
      pagesHistoryCommandJournalRef: { current: null },
      pagesHistoryRef,
      pendingStrokeCommitsRef: { current: 0 },
      prepareStudioDocumentReplacement: () => true,
      resetAdvancedFillForDocumentReplacement: () => undefined,
      resetStudioHistoryJournal: () => undefined,
      resetStudioHistoryRetention: () => undefined,
      setAiProvenance: () => undefined,
      setAutosaveRestoreBlockedReason: () => undefined,
      setCurrentPageId: () => undefined,
      setDescription: () => undefined,
      setError: () => undefined,
      setHasAutosave: () => undefined,
      setMaster: () => undefined,
      setPagesHi: () => undefined,
      setPagesHistory: () => undefined,
      setPanelGutter: () => undefined,
      setPublicationAnalytics: () => undefined,
      setPublishAiDisclosure: () => undefined,
      setPublishAiUsage: () => undefined,
      setPublishCompliance: () => undefined,
      setPublishPackageCredits: () => undefined,
      setPublishPackageSettings: () => undefined,
      setPublishProfile: () => undefined,
      setReferenceBoard: () => undefined,
      setReleaseSchedule: () => undefined,
      setScenarioImageReferenceDocumentState: () => undefined,
      setStudioComments: () => {
        throw new Error("Simulated comments sidecar setter failure");
      },
      setTagsText: () => undefined,
      setTitle: () => undefined,
      setWebtoonTheme: () => undefined,
      sharedDocument: null,
      workId: null,
    } as unknown as StudioAutosaveRestoreContext;

    await restoreStudioAutosaveRecovery(restoreCtx);
    const firstPageAfterFailedRestore = (
      pagesHistoryRef.current[0] as Array<{ id?: string }>
    )?.[0]?.id;
    expect(firstPageAfterFailedRestore).toBe("initial-page");
    expect(candidateRef.current).not.toBeNull();
  });
});
