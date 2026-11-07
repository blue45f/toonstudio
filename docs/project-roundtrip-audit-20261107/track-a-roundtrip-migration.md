# Track A 상세 보고서: 합성 프로젝트 한글/Emoji·중첩 Scene/Layer·빈값·중복 ID 왕복 및 마이그레이션 경계값 감사

- **연결 문서**: [감사 종합 요약 (README.md)](./README.md) | [Track B 폴트 인젝션 보고서](./track-b-fault-injection.md)
- **실행 테스트**: [track-a-roundtrip-migration.test.ts](../../scripts/project-roundtrip-audit-20261107/track-a-roundtrip-migration/track-a-roundtrip-migration.test.ts)
- **합성 픽스처**: [synthetic-fixtures.ts](../../scripts/project-roundtrip-audit-20261107/track-a-roundtrip-migration/synthetic-fixtures.ts)

---

## 1. 검증 범위 및 통과 불변식 (`A-1` ~ `A-5`)

### 1.1 한글(NFC/NFD/호환자모) 및 복합 Emoji 왕복 (`A-1`, `A-2`)
- **검증 문자열**:
  - 한글 NFC: `"별빛 서고의 비밀 기록 1화 — 수정본"`
  - 한글 NFD: `"별빛 서고의 비밀 기록 1화 — 수정본".normalize("NFD")`
  - 호환 자모 및 옛한글 자모: `"ㄱㄴㄷㄹ ㅎㅎ ㅠㅠ ㅥ ㆎ"`
  - 복합 Emoji: `"👨‍👩‍👧‍👦 👩‍🎨 👍🏽 🏴‍☠️ 🇰🇷 🎨✨🦊"`
- **결과**:
  - `.toonstudio` 패키지([studio-project-package.ts](../../apps/web/src/domains/creator/save-first/studio-project-package.ts))의 모든 로컬/중앙 디렉터리 헤더에 UTF-8 비트(`0x0800`)가 기록되고, `importStudioProjectPackage`([studio-project-package-import.ts](../../apps/web/src/domains/creator/save-first/studio-project-package-import.ts)) 후 프로젝트/문서 메타데이터, 레이어 이름, 텍스트 대사, 코멘트, 캐릭터 바이블, AI 이미지 참조, 제출 노트에서 코드포인트 손실 없이 복원된다.
  - `.toonproject.zip` 아카이브([studio-project-archive.ts](../../apps/web/src/domains/creator/studio-project-archive.ts))에서 합성 16×16 PNG 및 22,050Hz PCM WAV 오디오 바이트가 SHA-256 해시까지 일치하며, 호출자 입력 픽스처(`deepFreeze`)는 변이되지 않는다.

### 1.2 중첩 `SceneIR` 및 `StudioLayers` 그룹 트리 왕복 (`A-3`)
- **결과**:
  - `SceneIR`([scene.ts](../../packages/studio-project-model/src/ir/scene.ts))의 3단계 재귀 `group`(`grp-root-panel` -> `grp-character-rig` -> `grp-face-detail` -> `stroke-eye-highlight`, `text-dialogue-nested`)이 `CommandBus` 저널과 `.toonrecovery.zip`([studio-v12-recovery-package.ts](../../apps/web/src/domains/creator/studio-v12-recovery-package.ts))을 거쳐 동일한 `projectDigest`로 복원된다.
  - `buildLayerTree`([studio-layers.ts](../../apps/web/src/domains/creator/studio-layers.ts))에서 연속 그룹 블록, 미사용 빈 그룹(`emptyGroupIds`), 클리핑 마스크 베이스(`itemBelowId`)가 정확히 계산된다.

### 1.3 빈값 및 마이그레이션 입력 경계값 (`A-4`, `A-5`)
- **결과**:
  - `pagesList: []` 거부, 공백 전용 제목(`"   \t\n  "`) 거부, `elements: []` 페이지 및 빈 `master` 보존, `thumbnailUrl: null` 보존이 정상 동작한다.
  - `parseStudioAutosave`의 `v1 -> v2` 승격 및 미래 버전(`version: 99`) `StudioAutosaveUnsupportedVersionError` 거부, `createStudioProjectDocument`의 `width`/`height`(`1..1,000,000`) 및 `pageCount`(`1..100,000`) 경계, `ArchiveV3`의 비정상 `zoom`(`0`, `-1`, `NaN`, `Infinity`)/`pan`(`NaN`, `±Infinity`) 거부가 정상 동작한다.

---

## 2. 재현된 순수 데이터 결함 및 최소 Patch 제안 (`GAP-A1` ~ `GAP-A9`)

### `GAP-A1`: 휴지통(`status: "trashed"`) 프로젝트가 `.toonstudio` 가져오기 후 `"active"`로 초기화됨
- **위치**: [studio-project-package-import.ts](../../apps/web/src/domains/creator/save-first/studio-project-package-import.ts) (383~398행)
- **재현 조건**: `trashStudioProject`로 휴지통에 넣은 프로젝트(`status: "trashed"`, `statusBeforeTrash: "archived"`)를 패키지로 내보낸 뒤 `importStudioProjectPackage`로 가져오면, 프로젝트 상태 분기가 `project.status === "archived"`만 처리하고 `"trashed"`를 누락하여 `status: "active"`, `statusBeforeTrash: null`로 초기화된다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
+++ b/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
@@ -395,6 +395,16 @@ export async function importStudioProjectPackage(
     if (parsed.project.status === "archived") {
       createdProject = archiveStudioProject(storage, createdProject.id, { at: now });
+    } else if (parsed.project.status === "trashed") {
+      if (parsed.project.statusBeforeTrash === "archived") {
+        createdProject = archiveStudioProject(storage, createdProject.id, { at: now });
+      }
+      createdProject = trashStudioProject(storage, createdProject.id, {
+        at: parsed.project.trashedAt ?? now,
+      });
     }
```

### `GAP-A2`: 휴지통 문서 스냅샷 수집 누락 및 10,000번째 문서(`index=9999`) 파일명 정규식 불일치
- **위치**:
  - [studio-project-workspace-snapshots.ts](../../apps/web/src/domains/creator/save-first/studio-project-workspace-snapshots.ts) (209행, 253행)
  - [studio-project-package-import.ts](../../apps/web/src/domains/creator/save-first/studio-project-package-import.ts) (64행, 185행)
- **재현 조건**:
  1. `document.status === "trashed"`인 문서는 `collectStudioProjectWorkspaceSnapshots`와 `buildStudioProjectWorkspacePackageEntries`에서 건너뛰어져, 패키지 import 후 휴지통에서 문서를 복원해도 캔버스 그림이 사라진다.
  2. `MAX_DOCUMENTS_PER_PROJECT = 10_000`에서 10,000번째 문서(`indexPosition = 9999`)는 `String(9999 + 1).padStart(4, "0")`에 의해 `documents/document-10000.autosave.json`(5자리)을 생성하나, `PACKAGE_ENTRY_PATTERN`은 `document-\d{4}\.autosave\.json`(4자리)만 허용하여 패키지가 거부된다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
+++ b/apps/web/src/domains/creator/save-first/studio-project-package-import.ts
@@ -62,3 +62,3 @@ const PACKAGE_ENTRY_PATTERN =
-  /^workspace\/(?:autosave\.json|documents\/document-\d{4}\.autosave\.json|snapshots\/[A-Za-z0-9._-]{1,120}\.json)$/u;
+  /^workspace\/(?:autosave\.json|documents\/document-\d{4,5}\.autosave\.json|snapshots\/[A-Za-z0-9._-]{1,120}\.json)$/u;
@@ -183,3 +183,3 @@ function extractWorkspaceSnapshots(
-    const indexedMatch = /^workspace\/documents\/document-(\d{4})\.autosave\.json$/u.exec(name);
+    const indexedMatch = /^workspace\/documents\/document-(\d{4,5})\.autosave\.json$/u.exec(name);
```

### `GAP-A3`: `elements: []`인 다중 페이지 원고가 `writeStudioLifecycleAutosave` 직후 `readStudioAutosave`에서 `null`로 증발함
- **위치**: [studio-autosave.ts](../../apps/web/src/domains/creator/studio-autosave.ts) (521~565행, 670행)
- **재현 조건**: 2개 이상의 페이지를 가지며 페이지별 커스텀 `name`·`bg`·`canvasH`가 설정되어 있으나 `elements: []`이고 상단 `title`/`description`/`tagsText`가 빈 문자열인 원고는 `studioAutosaveHasContent(payload)`가 `false`를 반환하여 `readStudioAutosave`가 `null`을 반환한다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-autosave.ts
+++ b/apps/web/src/domains/creator/studio-autosave.ts
@@ -525,6 +525,11 @@ export function studioAutosaveHasContent(payload: StudioAutosavePayload): boolea
+  if (payload.pagesList.length > 1) return true;
   const hasPageElements = payload.pagesList.some(
     (page) =>
       (Array.isArray(page.elements) && page.elements.length > 0) ||
+      (typeof page.name === "string" && page.name.trim().length > 0) ||
+      (typeof page.note === "string" && page.note.trim().length > 0) ||
+      (Array.isArray(page.groups) && page.groups.length > 0) ||
+      Boolean(page.shared3dStage) ||
       hasCuttoonData(page.cuttoon),
   );
```

### `GAP-A4`: `data:image/...` 프로젝트 썸네일 URL이 2,048자에서 강제 절단되어 손상됨
- **위치**:
  - [studio-project-library-store.ts](../../apps/web/src/domains/creator/studio-project-library-store.ts) (201행)
  - [studio-project-library-reader.ts](../../apps/web/src/domains/creator/studio-project-library-reader.ts) (139행)
- **재현 조건**: 캔버스 썸네일 `data:image/png;base64,...` 문자열이 2,048자를 넘으면 `.slice(0, 2_048)`로 잘려 불완전한 base64 데이터 URL이 저장된다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-project-library-store.ts
+++ b/apps/web/src/domains/creator/studio-project-library-store.ts
@@ -199,5 +199,6 @@ export function updateStudioProjectThumbnailUrl(
+  const MAX_THUMBNAIL_URL_LENGTH = 262_144;
   const normalizedUrl =
-    typeof thumbnailUrl === "string" && thumbnailUrl.trim() ? thumbnailUrl.trim().slice(0, 2_048) : null;
+    typeof thumbnailUrl === "string" && thumbnailUrl.trim() && thumbnailUrl.trim().length <= MAX_THUMBNAIL_URL_LENGTH
+      ? thumbnailUrl.trim()
+      : null;
```

### `GAP-A5`: Archive V3 승격 시 한글 `page.id` 거부 및 밀리초 없는 ISO 타임스탬프 유실
- **위치**: [studio-project-archive-v3.ts](../../apps/web/src/domains/creator/studio-workflow/studio-project-archive-v3.ts) (171행, 238~245행, 263행)
- **재현 조건**: `pagesList`의 `page.id` 및 `currentPageId`가 `"1페이지"`(한글)일 때 `validateWorkspaceState`가 ASCII 전용 `SAFE_ID` 정규식으로 검사하여 예외를 던지며, `validTimestamp`가 `.toISOString() === value`를 요구하여 `"2026-11-06T12:00:00Z"` 같은 유효한 ISO 문자열을 버린다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-workflow/studio-project-archive-v3.ts
+++ b/apps/web/src/domains/creator/studio-workflow/studio-project-archive-v3.ts
@@ -170,3 +170,3 @@ function validTimestamp(value: unknown): value is string {
-  return typeof value === "string" && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
+  return typeof value === "string" && value.length <= 64 && Number.isFinite(Date.parse(value));
 }
@@ -262,3 +262,3 @@ export function validateStudioWorkspaceStateV1(value: unknown): readonly string[
-  if (record.currentPageId !== null && !validSafeId(record.currentPageId)) {
+  if (record.currentPageId !== null && (typeof record.currentPageId !== "string" || record.currentPageId.trim().length === 0 || record.currentPageId.length > 240)) {
     issues.push("currentPageId must be a safe identifier or null.");
   }
```

### `GAP-A6`: `parseStudioAutosave`의 비정상 버전(`0`, `-1`, `1.5`, `"99"`) 및 비정상 `savedAt` 수용
- **위치**: [studio-autosave.ts](../../apps/web/src/domains/creator/studio-autosave.ts) (302~308행)
- **재현 조건**: `record.version`이 `-1`, `0`, `1.5`, `"99"`일 때 `record.version > 6` 조건만 검사하여 모두 `version: 2`로 통과시키며, `savedAt: "not-a-valid-iso-date"`도 그대로 보존한다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-autosave.ts
+++ b/apps/web/src/domains/creator/studio-autosave.ts
@@ -301,6 +301,9 @@ export function parseStudioAutosave(raw: string | null): StudioAutosavePayload |
+    if (
+      record.version !== undefined &&
+      record.version !== "1.0" &&
+      (typeof record.version !== "number" || !Number.isInteger(record.version) || record.version < 1 || record.version > 6)
+    ) {
+      return null;
+    }
```

### `GAP-A7`: 한글 제목 NFC/NFD 길이 판정 불일치 (`60`음절 NFD 거부)
- **위치**: [studio-project-library-store.ts](../../apps/web/src/domains/creator/studio-project-library-store.ts) (38~43행)
- **재현 조건**: `"한".repeat(60)`은 NFC에서 60 코드유닛으로 통과하지만, macOS 등에서 전달되는 동일 문자열의 NFD(`"한".repeat(60).normalize("NFD")`)는 180 코드유닛이어서 `"Project title is too long."` 예외가 발생한다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-project-library-store.ts
+++ b/apps/web/src/domains/creator/studio-project-library-store.ts
@@ -38,5 +38,5 @@ function normalizedTitle(value: string): string {
-  const title = value.trim();
+  const title = value.normalize("NFC").trim();
   if (!title) throw new Error("Project title is required.");
   if (title.length > 120) throw new Error("Project title is too long.");
   return title;
 }
```

### `GAP-A8`: `SceneIR` `scene/add-node` 중복 노드 ID 미차단 및 `validateComicGraph` 말풍선/톤/효과선 중복 ID 미검사
- **위치**:
  - [reducer.ts](../../packages/studio-project-model/src/command/reducer.ts) (151~161행)
  - [comic.ts](../../packages/studio-project-model/src/ir/comic.ts) (127~185행)
- **재현 조건**: `applyCommand`로 동일한 `node.id`(`"dup-node-1"`)를 두 번 `scene/add-node`하면 중복 ID 노드가 그대로 삽입되어 `findNode`/`deleteNode`가 첫 번째 노드만 조작하게 된다.
- **최소 Patch 제안**:
```diff
--- a/packages/studio-project-model/src/command/reducer.ts
+++ b/packages/studio-project-model/src/command/reducer.ts
@@ -152,4 +152,9 @@ function applySceneCommand(scene: SceneIR, command: SceneCommandIR): SceneIR {
   switch (command.type) {
     case "scene/add-node": {
+      if (findNode(scene, command.node.id) !== null) {
+        throw new CommandApplyError(
+          `scene/add-node duplicate node id: ${command.node.id}`,
+          command,
+        );
+      }
       if (!command.parentId) {
```

### `GAP-A9`: `{ version: 1, pagesList: [...] }` 구버전 파일의 `parseStudioAutosave` vs `parseStudioProjectFile` 스키마 비대칭
- **위치**: [studio-project-file.ts](../../apps/web/src/domains/creator/studio-project-file.ts) (104~113행, 296~308행)
- **재현 조건**: `{ version: 1, pagesList: [...] }` 구조는 `parseStudioAutosave`에서 `version: 2`로 정상 승격되나, `LegacyProjectSchema`는 `pages`만 허용하고 `pagesList`를 허용하지 않아 `parseStudioProjectFile`에서 거부된다.
- **최소 Patch 제안**:
```diff
--- a/apps/web/src/domains/creator/studio-project-file.ts
+++ b/apps/web/src/domains/creator/studio-project-file.ts
@@ -104,6 +104,7 @@ const LegacyProjectSchema = z
   .object({
     version: z.union([z.literal("1.0"), z.literal(1)]).optional(),
     title: z.string().max(200).default(""),
-    pages: z.array(ProjectPageSchema).min(1).max(STUDIO_PROJECT_MAX_PAGES),
+    pages: z.array(ProjectPageSchema).min(1).max(STUDIO_PROJECT_MAX_PAGES).optional(),
+    pagesList: z.array(ProjectPageSchema).min(1).max(STUDIO_PROJECT_MAX_PAGES).optional(),
     master: z.unknown().optional(),
```
