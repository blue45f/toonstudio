# ToonStudio 프로젝트 Export/Import 데이터 무손실 독립 회귀 및 폴트 인젝션 감사 (`2026-11-07`)

## 1. 감사 목적 및 소유 경계 선언

본 문서는 `main` (`68018c7f`) 기준 ToonStudio 프로젝트 내보내기·가져오기·복원 경로에 대한 **2트랙 병렬 데이터 무손실 독립 회귀 및 폴트 인젝션 감사** 결과와 실행 가능한 회귀 하네스, 결정론적 재현 조건, **최소 패치(Minimal Patch) 제안**, 그리고 **검증 한계**를 기록한다.

### 독점 소유 및 READ-ONLY 경계

- **독점 작성 허용 경로**:
  - [run-audit.mjs](../../scripts/project-roundtrip-audit-20261107/run-audit.mjs)
  - [synthetic-fixtures.ts](../../scripts/project-roundtrip-audit-20261107/track-a-roundtrip-migration/synthetic-fixtures.ts)
  - [track-a-roundtrip-migration.test.ts](../../scripts/project-roundtrip-audit-20261107/track-a-roundtrip-migration/track-a-roundtrip-migration.test.ts)
  - [fault-harness.ts](../../scripts/project-roundtrip-audit-20261107/track-b-fault-injection/fault-harness.ts)
  - [track-b-fault-injection.test.ts](../../scripts/project-roundtrip-audit-20261107/track-b-fault-injection/track-b-fault-injection.test.ts)
  - [README.md](./README.md)
  - [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md)
  - [track-b-fault-injection.md](./track-b-fault-injection.md)
- **기존 소스 전체 READ-ONLY 준수**:
  - 다른 구현자가 복구(`recovery`) 및 관련 모듈을 수정 중이므로, `apps/**`, `packages/**`, `config/**`, `e2e/**`, 루트 설정 및 잠금 파일을 포함한 **기존 저장소 파일 전체를 단 1바이트도 수정하지 않았다** (`git diff main -- apps packages config e2e` 결과 `0`건).
- **데이터 보안 및 합성 픽스처 원칙**:
  - 실제 사용자 DB, 로컬 파일, 비밀키/토큰을 일절 열거나 참조하지 않고 결정론적 시드 기반 인메모리 합성 픽스처(한글 NFC/NFD/호환자모, 복합 Emoji, 16×16 합성 PNG, 22,050Hz 합성 PCM WAV)만 사용한다.

---

## 2. 2트랙 병렬 구성 및 실행 방법

| 트랙 | 범위 요약 | 테스트 및 픽스처 | 상세 보고서 |
| --- | --- | --- | --- |
| **Track A** (`track-a-roundtrip-migration`) | 합성 프로젝트 한글(NFC/NFD/자모)·복합 Emoji(ZWJ/피부톤/서로게이트)·중첩 `SceneIR`/`StudioLayers`·빈값·중복 ID 왕복 무손실 및 마이그레이션 입력 경계값 검증 | [synthetic-fixtures.ts](../../scripts/project-roundtrip-audit-20261107/track-a-roundtrip-migration/synthetic-fixtures.ts), [track-a-roundtrip-migration.test.ts](../../scripts/project-roundtrip-audit-20261107/track-a-roundtrip-migration/track-a-roundtrip-migration.test.ts) (`6`개 통합 스위트) | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| **Track B** (`track-b-fault-injection`) | Export/Import 중 `AbortSignal` 취소·`QuotaExceededError`·손상 아카이브(15종)·부분 저널/사이드카 실패 주입 시 호출자 원본 및 기존 사용자 스토리지 불변성 검증 | [fault-harness.ts](../../scripts/project-roundtrip-audit-20261107/track-b-fault-injection/fault-harness.ts), [track-b-fault-injection.test.ts](../../scripts/project-roundtrip-audit-20261107/track-b-fault-injection/track-b-fault-injection.test.ts) (`5`개 통합 스위트) | [track-b-fault-injection.md](./track-b-fault-injection.md) |

### 실행 명령

```bash
# 1. READ-ONLY 경계 확인 및 실행 계획 점검 (dry-run)
node scripts/project-roundtrip-audit-20261107/run-audit.mjs --dry-run

# 2. 2트랙 병렬 회귀 감사 전체 실행 (Track A + Track B 동시 실행)
node scripts/project-roundtrip-audit-20261107/run-audit.mjs

# 3. 개별 트랙 단독 실행
node scripts/project-roundtrip-audit-20261107/run-audit.mjs --track=a
node scripts/project-roundtrip-audit-20261107/run-audit.mjs --track=b

# 4. Vitest 직접 실행
pnpm exec vitest run --maxWorkers=2 \
  scripts/project-roundtrip-audit-20261107/track-a-roundtrip-migration/track-a-roundtrip-migration.test.ts \
  scripts/project-roundtrip-audit-20261107/track-b-fault-injection/track-b-fault-injection.test.ts
```

---

## 3. 감사 결과 요약 매트릭스

### 3.1 검증 통과 불변식 (Pass Invariants)

1. **한글·복합 Emoji 무손실 왕복 (`A-1`, `A-2`, `A-3`)**:
   - `.toonstudio`, `.toonproject.zip`, `.toonrecovery.zip`, `StudioProjectArchiveV3` 모두 ZIP General Purpose Bit 11(`0x0800`, UTF-8)을 설정하며, 한글 NFC/NFD/호환자모와 복합 Emoji(`👨‍👩‍👧‍👦`, `👩‍🎨`, `👍🏽`, `🏴‍☠️`, `🎨✨🦊`)가 프로젝트·문서·레이어·대사·코멘트·캐릭터 바이블·AI 참조·제출 이력에서 손실 없이 왕복한다.
   - `Object.freeze`된 원본 픽스처의 직렬화 SHA-256 다이제스트(`sourceDigest`)가 모든 내보내기·가져오기 전후에 100% 동일하게 유지된다.
2. **첨부 바이너리(PNG/WAV) 바이트 및 SHA-256 무결성 (`A-1`, `A-2`, `A-3`)**:
   - `.toonproject.zip`의 `assets/<hash>.png` 및 `assets/<hash>.wav`와 `.toonrecovery.zip`의 CAS 첨부 바이트가 SHA-256 해시까지 정확히 일치한다.
3. **중첩 `SceneIR` 및 `StudioLayers` 트리 보존 (`A-3`)**:
   - 3단계 재귀 `group` 노드(`clip`, `blend`, `opacity`, 자식 `stroke-path`/`text`)와 `buildLayerTree` 연속 그룹 블록·빈 그룹(`emptyGroupIds`)·클리핑 마스크(`itemBelowId`)가 정확히 복원된다.
4. **손상 아카이브 15종 Fail-Closed 및 일시적 쿼터 실패 원자적 롤백 (`B-1`, `B-2`, `B-3`, `B-4`)**:
   - `.toonstudio`(10종), `.toonproject.zip`(4종), `.toonrecovery.zip`(CRC 변조 + 비어 있지 않은 `JournalStore` `DESTINATION_NOT_EMPTY`) 모두 기존 스토리지에 단 1회의 쓰기(`setItem`/`removeItem`)도 발생시키지 않고 거부된다.
   - `.toonstudio` 가져오기 중 쓰기 단계 $k \in \{1..N\}$에서 일시적 `QuotaExceededError`가 발생하면 기존 로컬 스토리지 키 전체와 `:lifecycle` 사이드카 키가 기준 스냅샷(`baselineDigest`)과 바이트 단위로 100% 동일하게 롤백된다.

### 3.2 발견 및 재현된 결함 요약 (`GAP-A1..A9`, `GAP-B1..B6`)

| ID | 트랙 | 대상 파일 (`main` @ `68018c7f`) | 핵심 증상 및 재현 요약 | 상세 및 최소 패치 |
| --- | --- | --- | --- | --- |
| `GAP-A1` | Track A | `apps/web/src/domains/creator/save-first/studio-project-package-import.ts:383-398` | 휴지통(`status: "trashed"`) 프로젝트가 `.toonstudio` import 후 `"active"`로 풀리고 `statusBeforeTrash`가 유실됨 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A2` | Track A | `apps/web/src/domains/creator/save-first/studio-project-workspace-snapshots.ts:209,253`, `studio-project-package-import.ts:64,185` | 휴지통 문서의 캔버스 스냅샷이 패키지 수집에서 제외되며, 10,000번째 문서(`index=9999`) 경로 `document-10000.autosave.json`(5자리)이 4자리 정규식에 거부됨 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A3` | Track A | `apps/web/src/domains/creator/studio-autosave.ts:521-565,670` | `elements: []`이고 상단 제목/설명이 빈 다중 페이지 원고(페이지별 이름·배경색 보유)가 `studioAutosaveHasContent === false`로 판정되어 `readStudioAutosave` 시 `null` 반환 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A4` | Track A | `apps/web/src/domains/creator/studio-project-library-store.ts:201`, `studio-project-library-reader.ts:139` | `thumbnailUrl`이 `.slice(0, 2_048)`로 절단되어 2,048자를 넘는 `data:image/png;base64,...` 썸네일이 깨진 데이터 URL로 저장됨 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A5` | Track A | `apps/web/src/domains/creator/studio-workflow/studio-project-archive-v3.ts:171,238-245,263,415` | 한글 `page.id`(`"1페이지"`)가 `workspace.currentPageId`의 ASCII `SAFE_ID` 검사에서 거부되고, 밀리초 없는 ISO 시각(`"2026-11-06T12:00:00Z"`)이 소실됨 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A6` | Track A | `apps/web/src/domains/creator/studio-autosave.ts:302-308` | `parseStudioAutosave`가 음수·0·소수·문자열 버전(`-1`, `0`, `1.5`, `"99"`)을 `version: 2`로 수용하고 비정상 `savedAt` 문자열을 통과시킴 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A7` | Track A | `apps/web/src/domains/creator/studio-project-library-store.ts:38-43`, `studio-v12-recovery-package.ts:495-531` | NFC 정규화 전에 `.length > 120`을 검사하여 한글 60음절 제목이 NFC(60자)는 통과하나 NFD(180자)는 거부됨; V12 `tags`가 사전순 재정렬됨 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A8` | Track A | `packages/studio-project-model/src/command/reducer.ts:151-161`, `ir/comic.ts:127-185`, `studio-submission-store.ts:215-226` | `scene/add-node`가 중복 노드 ID를 허용하고, `validateComicGraph`가 `balloon`/`tone`/`effectLine` 중복 ID를 미검사하며, 중복 제출 ID가 드롭됨 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-A9` | Track A | `apps/web/src/domains/creator/studio-autosave.ts:302` vs `studio-project-file.ts:296-305` | `{ version: 1, pagesList: [...] }` 입력이 `parseStudioAutosave`에서는 v2로 승격되나 `parseStudioProjectFile`에서는 거부됨 | [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) |
| `GAP-B1` | Track B | `apps/web/src/domains/creator/studio-autosave-opfs-session.ts:744-786` | `persistStudioAutosaveWithOpfsPrimary`가 OPFS `session.write`의 `AbortError`를 일반 내구성 실패로 처리해 취소된 페이로드를 SQLite에 기록하고 로컬 호환 슬롯을 삭제함 | [track-b-fault-injection.md](./track-b-fault-injection.md) |
| `GAP-B2` | Track B | `apps/web/src/domains/creator/studio-autosave-opfs-session.ts:840-859` | `reconcileStudioAutosaveWithOpfsPrimary`가 OPFS `readLatest` 중 발생한 `AbortError`를 삼키고 하위 호환 후보로 진행함 | [track-b-fault-injection.md](./track-b-fault-injection.md) |
| `GAP-B3` | Track B | `apps/web/src/domains/creator/save-first/studio-project-package-import.ts:383-582` | 롤백 시 `STUDIO_SAVE_PROFILE_UPDATED_EVENT`·`STUDIO_SUBMISSION_UPDATED_EVENT`가 재발행되지 않으며, 영구 쿼터 포화 시 `restoreRaw`의 `setItem` 실패로 반쪽 프로젝트가 남음 | [track-b-fault-injection.md](./track-b-fault-injection.md) |
| `GAP-B4` | Track B | `apps/web/src/domains/creator/save-first/studio-project-package-import.ts:217,344`, `studio-project-archive.ts:302,2379` | `importStudioProjectPackage` 및 `importStudioProjectArchive`에 `signal?: AbortSignal` 옵션이 없어 `Blob.slice` 중 취소를 중단할 수 없음 | [track-b-fault-injection.md](./track-b-fault-injection.md) |
| `GAP-B5` | Track B | `apps/web/src/domains/creator/studio-v12-recovery-package.ts:1468-1495`, `studio-page-autosave-runtime.ts:342-375` | V12 `restoreStudioV12RecoveryPackage` 저널 append 실패 시 이미 기록된 스냅샷 때문에 재시도가 `DESTINATION_NOT_EMPTY`로 막히며, `restoreStudioAutosaveRecovery` 사이드카 예외 시 `pagesHistoryRef`가 부분 변이됨 | [track-b-fault-injection.md](./track-b-fault-injection.md) |
| `GAP-B6` | Track B | `apps/web/src/domains/creator/save-first/studio-project-package.ts:293,304-312` | 쓰기 완료 전에 파일 핸들이 IndexedDB에 캐시되며, `createWritable()` 실패 시 손상된 캐시 핸들을 무효화하지 않음 | [track-b-fault-injection.md](./track-b-fault-injection.md) |

---

## 4. 조정 담당(Coordinator) 순차 통합 가이드

1. 본 브랜치(`audit/project-roundtrip-20261107`)는 `scripts/project-roundtrip-audit-20261107/**`와 `docs/project-roundtrip-audit-20261107/**`만 추가하므로 다른 세션의 소스 변경과 충돌 없이 즉시 체리픽/병합할 수 있다.
2. 다른 복구(`recovery`) 담당 세션의 수정이 반영된 뒤, [track-a-roundtrip-migration.md](./track-a-roundtrip-migration.md) 및 [track-b-fault-injection.md](./track-b-fault-injection.md)에 수록된 파일별 최소 패치를 적용하고 `A-6` / `B-5`의 재현 단언(`expect(...)`)을 수정 후 목표 불변식 단언으로 전환하면 회귀 게이트로 즉시 활용된다.

---

## 5. 검증 한계 (Verification Limits)

- 본 감사는 Node.js(`v24`) + Vitest(`v4.1.12`) 환경에서 실제 프로덕션 순수 `.ts` 모듈과 인메모리 `Storage` / `JournalStore` / `File` / `Blob` / `SubtleCrypto`를 직접 구동하여 검증했다.
- 실제 Chromium/Firefox/WebKit 브라우저의 네이티브 OPFS `FileSystemSyncAccessHandle` 워커 잠금 경합, OS 파일 선택기(`showSaveFilePicker`) 권한 프롬프트, 실제 디스크 파티션 풀(OS-level `ENOSPC`), 그리고 외부 앱(Clip Studio Paint, Photoshop 등)과의 파일 호환성은 본 읽기 전용 단위/통합 감사 범위에 포함되지 않으므로 미검증 사항으로 분리 보고한다.
