# Track B 상세 보고서: Export/Import 중 Abort·Quota 오류·손상 Archive 원본 불변성 Fault Injection 감사

- **연결 문서**: [감사 종합 요약 (README.md)](./README.md) | [Track A 왕복·마이그레이션 보고서](./track-a-roundtrip-migration.md)
- **실행 테스트**: [track-b-fault-injection.test.ts](../../scripts/project-roundtrip-audit-20261107/track-b-fault-injection/track-b-fault-injection.test.ts)
- **폴트 인젝션 하네스**: [fault-harness.ts](../../scripts/project-roundtrip-audit-20261107/track-b-fault-injection/fault-harness.ts)

---

## 1. 검증 범위 및 통과 불변식 (`B-1` ~ `B-4`)

### 1.1 내보내기(Export) 중 취소 및 오류 시 원본 불변성 (`B-1`, `B-4`)
- `buildStudioProjectPackage`, `buildStudioProjectArchive`, `buildStudioV12RecoveryPackage`는 정상 완료, 사전 `AbortSignal` 취소, 비정상 인자 오류 중 어떤 경우에도 호출자의 입력 객체 및 `Storage`/`JournalStore`를 변이시키지 않는다.
- `writeStudioProjectPackageToTarget`([studio-project-package.ts](../../apps/web/src/domains/creator/save-first/studio-project-package.ts))은 `writable.write()` 또는 `writable.close()`에서 `QuotaExceededError`가 발생할 때 반드시 `writable.abort()`를 호출하여 반쪽짜리 로컬 파일이 커밋되지 않게 막는다.

### 1.2 손상된 아카이브 15종 폴트 인젝션 시 무변이 거부 (`B-2`)
- **검증 벡터**:
  1. `not-a-zip` 평문 바이트
  2. `truncated-eocd` (EOCD 절단)
  3. `entry-count-exceeded` (엔트리 개수 65개 초과)
  4. `compression-deflate` (`compressionMethod=8` 비-STORE 압축)
  5. `crc-mismatch` (첫 번째 엔트리 페이로드 1비트 플립)
  6. `path-traversal-dotdot` (`project/../evil.json`)
  7. `missing-manifest` (`manifest.json` 누락)
  8. `future-format-version` (`formatVersion: 999`)
  9. `unexpected-entry` (`workspace/evil-unlisted.json` 포함)
  10. `six-pass-marker-in-package` (`.toonstudio` 내부에 6-pass 번들 마커 주입)
  11. `.toonproject.zip` CRC 불일치, `manifest.json` 손상, `project.json` 미래 버전(`99`), 누락된 에셋 해시 참조
  12. `.toonrecovery.zip` CRC 변조 및 비어 있지 않은 `JournalStore` 대상 `DESTINATION_NOT_EMPTY` 거부
- **결과**: 모든 벡터에서 기존 `Storage`에 대한 `setItem`/`removeItem`/`clear` 호출 횟수가 **`0`회**이며, 기준 다이제스트(`baselineDigest`)가 100% 보존된다.

### 1.3 일시적 `QuotaExceededError` 단계별(Step $1..N$) 주입 시 원자적 롤백 (`B-3`)
- `.toonstudio` 가져오기(`importStudioProjectPackage`)가 수행하는 총 $N=6$회의 `storage.setItem` 호출에 대해, $k=1$부터 $k=6$까지 매 단계마다 `QuotaExceededError`를 주입한 결과 모든 단계에서 기존 로컬 스토리지 키(`STUDIO_PROJECT_LIBRARY_STORAGE_KEY`, `STUDIO_SAVE_PROFILE_STORAGE_KEY`, `STUDIO_SUBMISSION_STORAGE_KEY`, 문서 목록 키, 자동저장 및 `:lifecycle` 키)가 `baselineSnapshot`으로 100% 원상 복구된다.

---

## 2. 재현된 폴트 인젝션 결함 및 최소 Patch 제안 (`GAP-B1` ~ `GAP-B6`)

### `GAP-B1`: `persistStudioAutosaveWithOpfsPrimary`가 OPFS `AbortError`를 내구성 장애로 오판해 취소된 쓰기를 SQLite에 커밋하고 로컬 슬롯을 삭제함
- **위치**: [studio-autosave-opfs-session.ts](../../apps/web/src/domains/creator/studio-autosave-opfs-session.ts) (744~786행)
- **재현 조건**: OPFS `session.write(payload, signal)` 도중 `AbortSignal`이 abort되어 `DOMException("...", "AbortError")`가 던져지면, `catch (cause)` 블록이 `AbortError`를 재던지지 않고 `durableFailure = cause`로 잡아먹는다. 그 결과:
  1. `sqlite` 폴백이 있으면 **사용자가 취소한 페이로드를 SQLite에 기록**하고 `deleteCompatibilityStorageKeys`를 호출해 기존 `localStorage` 원본을 삭제한다.
  2. `sqlite`가 `null`이면 `onDurableAuthorityDegraded` 콜백을 오발동시키고 `StudioAutosaveDurabilityError`를 던진다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-autosave-opfs-session.ts
+++ b/apps/web/src/domains/creator/studio-autosave-opfs-session.ts
@@ -743,6 +743,7 @@ export async function persistStudioAutosaveWithOpfsPrimary(
   if (input.session) {
     try {
       const receipt = await input.session.write(input.payload, input.signal);
       ...
     } catch (cause) {
+      if (isAbortError(cause)) throw cause;
       durableFailure = cause;
     }
   }
@@ -760,6 +761,7 @@ export async function persistStudioAutosaveWithOpfsPrimary(
   if (input.sqlite) {
     try {
       await input.sqlite.save(input.key, serialized, input.payload.savedAt, input.signal);
       ...
     } catch (cause) {
+      if (isAbortError(cause)) throw cause;
       durableFailure = durableFailure ?? cause;
     }
   }
```

### `GAP-B2`: `reconcileStudioAutosaveWithOpfsPrimary`가 OPFS `readLatest` 중 발생한 `AbortError`를 삼키고 하위 호환 후보로 진행함
- **위치**: [studio-autosave-opfs-session.ts](../../apps/web/src/domains/creator/studio-autosave-opfs-session.ts) (840~859행)
- **재현 조건**: `input.session.readLatest(input.signal)`이 `AbortError`를 던지면 855행 `catch` 블록이 `StudioAutosaveUnsupportedVersionError`만 재던지고 `AbortError`는 무시하여, 최신 OPFS 저널 대신 구버전 `browser-storage-compatibility` 후보를 승자로 반환한다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-autosave-opfs-session.ts
+++ b/apps/web/src/domains/creator/studio-autosave-opfs-session.ts
@@ -834,6 +834,7 @@ export async function reconcileStudioAutosaveWithOpfsPrimary(
     } catch (cause) {
+      if (isAbortError(cause)) throw cause;
       if (cause instanceof StudioAutosaveUnsupportedVersionError) throw cause;
       // 손상/개방 실패 SQLite 행은 덮어쓰지 않고 다른 권위로 복구한다.
     }
@@ -855,6 +856,7 @@ export async function reconcileStudioAutosaveWithOpfsPrimary(
     } catch (cause) {
+      if (isAbortError(cause)) throw cause;
       if (cause instanceof StudioAutosaveUnsupportedVersionError) throw cause;
       // SQLite와 브라우저 슬롯을 계속 평가한다.
     }
```

### `GAP-B3`: `importStudioProjectPackage` 롤백 시 프로필·제출 이벤트 미발행 및 영구 쿼터 포화 시 반쪽 프로젝트 잔류
- **위치**: [studio-project-package-import.ts](../../apps/web/src/domains/creator/save-first/studio-project-package-import.ts) (383~582행)
- **재현 조건**:
  1. `importStudioProjectPackage`는 성공 경로에서 `STUDIO_SAVE_PROFILE_UPDATED_EVENT`와 `STUDIO_SUBMISSION_UPDATED_EVENT`를 발행한 뒤 `writeStudioLifecycleAutosave`를 수행한다. 이때 마지막 자동저장 쓰기에서 예외가 나면 `catch` 블록이 스토리지 값은 롤백하지만 `STUDIO_PROJECT_LIBRARY_UPDATED_EVENT`와 `STUDIO_PROJECT_DOCUMENTS_UPDATED_EVENT`만 발행하여, 프로필·제출 리스너는 롤백된 프로젝트 데이터를 계속 들고 있게 된다.
  2. 대용량 스냅샷(`createdAutosaveKeys`)보다 프로젝트 메타데이터(`STUDIO_PROJECT_LIBRARY_STORAGE_KEY`)를 먼저 쓰기 때문에, 스토리지 용량이 영구 포화된 상태에서는 `restoreRaw`의 `storage.setItem(STUDIO_PROJECT_LIBRARY_STORAGE_KEY, libraryBefore)`도 `QuotaExceededError`로 실패하여 반쪽짜리 프로젝트가 라이브러리에 남는다.
- **최소 Patch 제안**:
  - 롤백 시 `createdAutosaveKeys`를 먼저 `removeItem`으로 비워 쿼터 여유를 확보한 뒤 `libraryBefore`/`profileBefore`/`submissionsBefore`를 복원하고, `STUDIO_SAVE_PROFILE_UPDATED_EVENT` 및 `STUDIO_SUBMISSION_UPDATED_EVENT`도 함께 재발행한다.
```diff
--- a/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
+++ b/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
@@ -540,12 +540,12 @@ export async function importStudioProjectPackage(
   } catch (error) {
+    for (const key of createdAutosaveKeys) {
+      try {
+        removeStorageKey(storage, key);
+        removeStorageKey(storage, `${key}:lifecycle`);
+      } catch {
+        // Best-effort cleanup of newly created keys first to free quota before restoring baseline keys.
+      }
+    }
     restoreRaw(storage, STUDIO_PROJECT_LIBRARY_STORAGE_KEY, libraryBefore);
     restoreRaw(storage, STUDIO_SAVE_PROFILE_STORAGE_KEY, profileBefore);
     restoreRaw(storage, STUDIO_SUBMISSION_STORAGE_KEY, submissionsBefore);
     if (documentsKey && documentsBefore === null) {
       removeStorageKey(storage, documentsKey);
     } else if (documentsKey) {
       restoreRaw(storage, documentsKey, documentsBefore);
     }
```

### `GAP-B4`: `importStudioProjectPackage` 및 `importStudioProjectArchive`의 `AbortSignal` 미지원
- **위치**:
  - [studio-project-package-import.ts](../../apps/web/src/domains/creator/save-first/studio-project-package-import.ts) (217행, 344행)
  - [studio-project-archive.ts](../../apps/web/src/domains/creator/studio-project-archive.ts) (302행, 2379행)
- **재현 조건**: 대용량 `.toonstudio` 또는 `.toonproject.zip` 파일을 읽는 도중 사용자가 작업을 취소해도 `options.signal`을 받지 않아 `Blob.slice()` 및 `storage.setItem()`이 끝까지 실행된다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
+++ b/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
@@ -221,2 +221,3 @@ export interface StudioProjectPackageImportOptions {
   readonly now?: string;
+  readonly signal?: AbortSignal;
   readonly createProjectId?: () => string;
@@ -349,4 +350,6 @@ export async function importStudioProjectPackage(
   options: StudioProjectPackageImportOptions = {},
 ): Promise<StudioProjectPackageImportResult> {
+  options.signal?.throwIfAborted();
   const parsed = await parseStudioProjectPackageFile(file);
+  options.signal?.throwIfAborted();
```

### `GAP-B5`: V12 `restoreStudioV12RecoveryPackage` 저널 append 실패 시 스냅샷 잔류 및 `restoreStudioAutosaveRecovery` 사이드카 예외 시 `pagesHistoryRef` 부분 변이
- **위치**:
  - [studio-v12-recovery-package.ts](../../apps/web/src/domains/creator/studio-v12-recovery-package.ts) (1468~1495행)
  - [studio-page-autosave-runtime.ts](../../apps/web/src/domains/creator/studio-page-autosave-runtime.ts) (342~375행)
- **재현 조건**:
  1. `restoreStudioV12RecoveryPackage`에서 `writeSnapshot` 성공 후 `history.append`가 첫 엔트리에서 실패하면, 대상 `JournalStore`에 스냅샷이 남아 같은 스토어에 대한 재시도가 `DESTINATION_NOT_EMPTY`로 영구 차단된다.
  2. `restoreStudioAutosaveRecovery`에서 342행 `pagesHistoryRef.current = [restoredPages]` 실행 후 `setStudioComments` 등 후속 사이드카 setter가 예외를 던지면 `pagesHistoryRef.current`와 `pagesHiRef.current`가 롤백되지 않는다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-page-autosave-runtime.ts
+++ b/apps/web/src/domains/creator/studio-page-autosave-runtime.ts
@@ -339,6 +339,8 @@ export function restoreStudioAutosaveRecovery(
+  const prevHistory = input.pagesHistoryRef.current;
+  const prevHi = input.pagesHiRef.current;
+  try {
     input.setPagesList(restoredPages);
     input.pagesHistoryRef.current = [restoredPages];
     input.pagesHiRef.current = 0;
     ...
+  } catch (error) {
+    input.pagesHistoryRef.current = prevHistory;
+    input.pagesHiRef.current = prevHi;
+    throw error;
+  }
```

### `GAP-B6`: `chooseStudioProjectPackageSaveTarget`의 선행 핸들 캐싱 및 `createWritable()` 실패 시 손상 핸들 미제거
- **위치**: [studio-project-package.ts](../../apps/web/src/domains/creator/save-first/studio-project-package.ts) (293행, 304~312행)
- **재현 조건**: `chooseStudioProjectPackageSaveTarget`이 실제 패키지 쓰기가 성공하기 전에 IndexedDB에 파일 핸들을 먼저 저장하며, 이후 `writeStudioProjectPackageToTarget`에서 `target.handle.createWritable()`이 실패해도 캐시된 핸들을 무효화하지 않아 다음 저장 시에도 깨진 핸들이 재사용된다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/save-first/studio-project-package.ts
+++ b/apps/web/src/domains/creator/save-first/studio-project-package.ts
@@ -302,6 +302,7 @@ export async function writeStudioProjectPackageToTarget(
   result: StudioProjectPackageResult,
   target: StudioProjectPackageSaveTarget,
+  handleKey?: string,
 ): Promise<"file-picker" | "download"> {
   if (target.kind === "file-handle") {
-    const writable = await target.handle.createWritable();
+    const writable = await target.handle.createWritable().catch(async (err) => {
+      if (handleKey) await forgetStoredFileHandle(handleKey).catch(() => undefined);
+      throw err;
+    });
```
