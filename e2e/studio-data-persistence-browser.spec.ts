import http from "node:http";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";
import { build as buildViteBundle } from "vite";

import type { AddressInfo } from "node:net";

const HARNESS_PATH = "/studio-data-persistence-harness";
const HARNESS_SCRIPT_PATH = "/studio-data-persistence-harness.js";
const HARNESS_HTML = `<!doctype html>
<html lang="ko">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>ToonStudio 데이터 영속성 실제 브라우저 검증 하네스</title>
  </head>
  <body>
    <main id="harness-status">ready</main>
    <script type="module" src="${HARNESS_SCRIPT_PATH}"></script>
  </body>
</html>`;

let httpServer: http.Server | null = null;
let harnessUrl = "";
let bundledScriptCode = "";

test.beforeAll(async () => {
  const repoRoot = process.cwd();
  const buildOutput = await buildViteBundle({
    configFile: false,
    root: repoRoot,
    logLevel: "error",
    resolve: {
      alias: {
        "@": path.join(repoRoot, "apps/web/src"),
      },
    },
    build: {
      write: false,
      minify: false,
      sourcemap: false,
      target: "esnext",
      rollupOptions: {
        input: path.join(repoRoot, "e2e/fixtures/studio-data-persistence-browser-runtime.ts"),
        output: {
          format: "es",
          codeSplitting: false,
          entryFileNames: "studio-data-persistence-harness.js",
        },
      },
    },
  });

  const outputs = Array.isArray(buildOutput) ? buildOutput : [buildOutput];
  for (const out of outputs) {
    if ("output" in out) {
      for (const chunk of out.output) {
        if (chunk.type === "chunk" && chunk.isEntry) {
          bundledScriptCode = chunk.code;
          break;
        }
      }
    }
  }
  if (!bundledScriptCode) {
    throw new Error("Failed to bundle studio-data-persistence-browser-runtime.ts");
  }

  httpServer = http.createServer((req, res) => {
    const url = req.url ?? "/";
    if (url === HARNESS_PATH || url.startsWith(`${HARNESS_PATH}?`)) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.end(HARNESS_HTML);
      return;
    }
    if (url === HARNESS_SCRIPT_PATH) {
      res.statusCode = 200;
      res.setHeader("Content-Type", "application/javascript; charset=utf-8");
      res.end(bundledScriptCode);
      return;
    }
    if (url === "/favicon.ico") {
      res.statusCode = 204;
      res.end();
      return;
    }
    res.statusCode = 404;
    res.end("Not found");
  });

  await new Promise<void>((resolve) => {
    httpServer!.listen(0, "127.0.0.1", () => resolve());
  });
  const address = httpServer.address() as AddressInfo;
  harnessUrl = `http://127.0.0.1:${address.port}${HARNESS_PATH}`;
});

test.afterAll(async () => {
  if (httpServer) {
    await new Promise<void>((resolve) => httpServer!.close(() => resolve()));
    httpServer = null;
  }
});

async function openHarnessPage(page: Page): Promise<void> {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => {
    pageErrors.push(error.stack ?? error.message);
  });
  await page.goto(harnessUrl);
  if (pageErrors.length > 0) {
    throw new Error(`Browser pageerror during harness boot: ${pageErrors.join("\n")}`);
  }
  await page.waitForFunction(
    () => typeof window.__studioDataPersistenceHarness === "object",
    undefined,
    { timeout: 15_000 },
  );
  expect(pageErrors).toEqual([]);
}

test.describe("Studio 데이터 영속성 실제 브라우저 통합 검증 (data-persistence)", () => {
  test("1. 실제 브라우저 저장소(IndexedDB/OPFS/Web Locks/localStorage/Blob/File) 지원 및 네이티브 파일 선택기 제스처 경계 확인", async ({
    page,
  }) => {
    await openHarnessPage(page);
    const capabilities = await page.evaluate(async () => {
      return await window.__studioDataPersistenceHarness!.probeCapabilities();
    });

    expect(capabilities.userAgent).toContain("Chrome/");
    expect(capabilities.indexedDbSupported).toBe(true);
    expect(capabilities.idbFileHandlePersistenceSupported).toBe(true);
    expect(capabilities.opfsSupported).toBe(true);
    expect(capabilities.webLocksSupported).toBe(true);
    expect(capabilities.localStorageSupported).toBe(true);
    expect(capabilities.blobFileSupported).toBe(true);
    expect(capabilities.webCryptoSha256Supported).toBe(true);

    // 헤드리스/비활성화 상태에서 window.showSaveFilePicker 직접 호출은 네이티브 파일 대화상자/제스처 제약(SecurityError 또는 헤드리스 AbortError)으로 차단됨을 구분 기록
    if (capabilities.nativeShowSaveFilePickerPresent) {
      expect(capabilities.unactivatedSavePickerConstraint?.blockedByUserGesture).toBe(true);
      expect(["SecurityError", "AbortError"]).toContain(
        capabilities.unactivatedSavePickerConstraint?.errorName,
      );
    }
  });

  test("2. 합성 픽스처 문서 저장 -> 실제 페이지 새로고침(재열기) -> 복원 -> 내보내기 -> 가져오기 왕복 무결성 및 원본 불변성 검증", async ({
    page,
  }) => {
    await openHarnessPage(page);
    const runId = "roundtrip-1";

    const saved = await page.evaluate(async (id) => {
      return await window.__studioDataPersistenceHarness!.saveFixtureBeforeReload(id);
    }, runId);

    expect(saved.primaryRole).toBe("leader");
    expect(saved.primaryAuthority).toBe("opfs-journal");
    expect(saved.secondaryAuthority).toBe("opfs-journal");
    expect(saved.hasCheckpointFile).toBe(true);
    expect(saved.opfsFilesCount).toBeGreaterThanOrEqual(3);

    // 실제 브라우저 페이지 닫기/새로고침 수행
    await page.reload();
    await page.waitForFunction(
      () => typeof window.__studioDataPersistenceHarness === "object",
      undefined,
      { timeout: 15_000 },
    );

    const roundtrip = await page.evaluate(async (id) => {
      return await window.__studioDataPersistenceHarness!.reopenAndVerifyRoundtripsAfterReload(id);
    }, runId);

    expect(roundtrip.navigationType).toBe("reload");
    expect(roundtrip.reconciledAuthority).toBe("opfs-journal");
    expect(roundtrip.restoredParity).toEqual(saved.expectedParity);

    // .toonstudio 패키지 왕복 검증 (페이지/레이어 순서, ID, 크기, 필수 메타데이터, 썸네일, 보관 문서 상태, 제출/프로필 보존)
    expect(roundtrip.toonstudioPackage).toMatchObject({
      writeMode: "file-picker",
      chosenTargetKind: "file-handle",
      importedProjectId: "import-imported-proj-1",
      importedProjectTitle: "별빛 기록보관소 에피소드",
      thumbnailPreserved: true,
      definitionPreserved: true,
      documentCount: 2,
      archivedStatusPreserved: true,
      saveProfileAccessMode: "collaborators",
      saveProfileDistributionState: "submitted",
      submissionsCount: 1,
      submissionPlatform: "naver-webtoon",
      libraryCount: 1,
    });
    expect(roundtrip.toonstudioPackage.parity).toEqual(saved.expectedParity);

    // .toonproject.zip 아카이브 왕복 검증 (래스터 PNG 바이트/해시 및 WAV 오디오 첨부 참조/해시 일치)
    expect(roundtrip.toonprojectZipArchive).toMatchObject({
      attachmentCount: 2,
      rasterRefUriValid: true,
      audioRefUriValid: true,
      resolvedRasterSha256Matches: true,
      resolvedAudioSha256Matches: true,
    });
    expect(roundtrip.toonprojectZipArchive.rehydratedParity).toEqual({
      ...saved.expectedParity,
      layerOrderByPage: {
        ...saved.expectedParity.layerOrderByPage,
        "page-1": [...saved.expectedParity.layerOrderByPage["page-1"]!, "audio-cue-1"],
      },
      layerTypesByPage: {
        ...saved.expectedParity.layerTypesByPage,
        "page-1": [...saved.expectedParity.layerTypesByPage["page-1"]!, "custom"],
      },
    });

    // .toonrecovery.zip V12 재해 복구 패키지 및 실제 OPFS 자산 CAS 복원 검증
    expect(roundtrip.v12RecoveryPackage).toEqual({
      seq: 3,
      issuesCount: 0,
      digestMatchesManifest: true,
      opfsPngSha256Matches: true,
      opfsWavSha256Matches: true,
    });

    // V2 <-> Archive V3 마이그레이션 및 역투영 무결성 검증
    expect(roundtrip.archiveV3Roundtrip).toEqual({
      version: 3,
      issuesCount: 0,
      workspaceSeparated: true,
      projectedParity: saved.expectedParity,
    });

    // 원본 불변성(source immutability) 검증
    expect(roundtrip.sourceImmutability).toEqual({
      expectedDigest: saved.sourceDigest,
      afterRoundtripDigest: saved.sourceDigest,
      unchanged: true,
    });
  });

  test("3. 실제 Blob/File 읽기 취소, OPFS 자동저장 취소, 복원 취소 및 실패 시 정상 문서·undo/redo·복원 후보 보존 검증", async ({
    page,
  }) => {
    await openHarnessPage(page);
    const result = await page.evaluate(async () => {
      return await window.__studioDataPersistenceHarness!.verifyCancellationAndFailureIsolation(
        "cancel-1",
      );
    });

    expect(result.packageImportAbort).toEqual({
      code: "ABORTED",
      sliceCount: 2,
      projectsPreservedCount: 1,
      originalProjectIntact: true,
      baselineAutosaveIntact: true,
    });
    expect(result.archiveImportAbort).toEqual({
      errorName: "AbortError",
      sliceCount: 2,
    });
    expect(result.archiveBuildAbortName).toBe("AbortError");
    expect(result.v12ImportAbortName).toBe("AbortError");
    expect(result.opfsAutosaveAbort).toEqual({
      errorName: "AbortError",
      degradedCalledOnAbort: false,
      preservedTitle: "1화: 시간의 서고",
      preservedSavedAt: "2026-09-20T09:30:00.000Z",
    });
    expect(result.restoreCancelAndFailure).toEqual({
      cancelReturnedFalse: true,
      cancelErrorIsNull: true,
      cancelCandidatePreserved: true,
      cancelUndoHistoryIntact: true,
      failReturnedFalse: true,
      failErrorMessage: "이전 그림을 열지 못했어요.",
      failCandidatePreserved: true,
      failUndoHistoryRolledBack: true,
    });
  });

  test("4. 미지원 저장소·쿼터/쓰기 실패·중간 중단(Torn write)·Stale revision·구버전/부분 손상·중복 import 격리 검증", async ({
    page,
  }) => {
    await openHarnessPage(page);
    const result = await page.evaluate(async () => {
      return await window.__studioDataPersistenceHarness!.verifyUnsupportedQuotaTornAndStaleRecovery(
        "edge-1",
      );
    });

    expect(result.unsupportedStorage).toEqual({
      sessionIsNull: true,
      sqliteFallbackAuthority: "sqlite-fallback",
      noAuthorityErrorCode: "durabilityFailed",
      unverifiedLocalStorageRejected: true,
    });
    expect(result.quotaAndWriteFailure).toEqual({
      quotaImportErrorCode: "QuotaExceededError",
      originalProjectPreserved: true,
      lastKnownGoodAutosavePreserved: true,
      streamWriteErrorName: "QuotaExceededError",
      writableAbortedOnStreamError: true,
    });
    expect(result.tornWriteRecovery).toEqual({
      recoveredTitle: "Rev1 정상 커밋 원고",
      recoveredSavedAt: "2026-09-20T09:30:00.000Z",
      recoveredParityMatchesFixture: true,
    });
    expect(result.staleAndVersionChecks).toEqual({
      staleDidNotOverwrite: true,
      upgradedFromV1Version: 2,
      upgradedFromV1Title: "구버전 V1 원고",
      futureVersionErrorDetected: true,
      futureRawPreservedInStorage: true,
    });
    expect(result.duplicateImports).toEqual({
      distinctImportedIdsCount: 3,
      totalProjectsInLibrary: 4,
      originalProjectStillPresent: true,
      originalAutosaveIntact: true,
    });
  });

  test("5. 실제 두 브라우저 탭(Tab A / Tab B) 간 겹친 자동저장 Web Locks 리더/팔로워 펜싱 및 리더 종료 후 승격 검증", async ({
    context,
  }) => {
    const pageA = await context.newPage();
    const pageB = await context.newPage();
    try {
      await openHarnessPage(pageA);
      await openHarnessPage(pageB);

      const runId = "multitab-1";
      const workId = "shared-doc-multitab-1";

      const tabAOpen = await pageA.evaluate(
        async ({ id, work }) =>
          await window.__studioDataPersistenceHarness!.openTabAutosaveLeaderOrFollower(
            "tab-a",
            work,
            id,
          ),
        { id: runId, work: workId },
      );
      const tabBOpen = await pageB.evaluate(
        async ({ id, work }) =>
          await window.__studioDataPersistenceHarness!.openTabAutosaveLeaderOrFollower(
            "tab-b",
            work,
            id,
          ),
        { id: runId, work: workId },
      );

      expect(tabAOpen.role).toBe("leader");
      expect(tabBOpen.role).toBe("follower");

      // 리더 탭(Tab A)은 OPFS 주 저장소에 직접 기록하고, 팔로워 탭(Tab B)은 OPFS/SQLite 덮어쓰기 펜싱(StudioAutosaveDocumentBusyError)으로 차단됨
      const writeA = await pageA.evaluate(
        async () =>
          await window.__studioDataPersistenceHarness!.attemptTabAutosaveWrite(
            "tab-a",
            "탭 A 리더 원고",
            "2026-09-20T10:00:00.000Z",
          ),
      );
      const writeB = await pageB.evaluate(
        async () =>
          await window.__studioDataPersistenceHarness!.attemptTabAutosaveWrite(
            "tab-b",
            "탭 B 팔로워 차단 대상 원고",
            "2026-09-20T10:05:00.000Z",
          ),
      );

      expect(writeA).toMatchObject({
        role: "leader",
        fenced: false,
        authority: "opfs-journal",
        title: "탭 A 리더 원고",
      });
      expect(writeB).toMatchObject({
        role: "follower",
        fenced: true,
        fencedCode: "StudioAutosaveDocumentBusyError",
        authority: null,
      });

      // 리더 탭(Tab A) 세션 종료 시 팔로워 탭(Tab B)이 Web Lock을 승계해 leader로 승격되고 직전 리더 원고를 OPFS에서 읽은 뒤 새 OPFS 쓰기 가능
      await pageA.evaluate(
        async () => await window.__studioDataPersistenceHarness!.closeTabAutosaveSession("tab-a"),
      );

      await expect
        .poll(
          async () => {
            const state = await pageB.evaluate(
              async () =>
                await window.__studioDataPersistenceHarness!.promoteTabSessionIfLeader("tab-b"),
            );
            return state.role;
          },
          { timeout: 10_000 },
        )
        .toBe("leader");

      const reconciledOnPromotedTabB = await pageB.evaluate(
        async () => await window.__studioDataPersistenceHarness!.readTabReconciledAutosave("tab-b"),
      );
      expect(reconciledOnPromotedTabB).toEqual({
        tabId: "tab-b",
        role: "leader",
        authority: "opfs-journal",
        title: "탭 A 리더 원고",
        savedAt: "2026-09-20T10:00:00.000Z",
      });

      const writeBAsPromotedLeader = await pageB.evaluate(
        async () =>
          await window.__studioDataPersistenceHarness!.attemptTabAutosaveWrite(
            "tab-b",
            "탭 B 승격 후 OPFS 직기록 원고",
            "2026-09-20T10:10:00.000Z",
          ),
      );
      expect(writeBAsPromotedLeader).toMatchObject({
        role: "leader",
        fenced: false,
        authority: "opfs-journal",
        title: "탭 B 승격 후 OPFS 직기록 원고",
      });

      await pageB.evaluate(
        async () => await window.__studioDataPersistenceHarness!.closeTabAutosaveSession("tab-b"),
      );
    } finally {
      await pageA.close();
      await pageB.close();
    }
  });
});
