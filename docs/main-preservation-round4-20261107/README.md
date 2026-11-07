# Round 4 툰 통합 보존 읽기 전용 감사 보고서 (`2026-11-07`)

## 1. 감사 개요 및 운영 원칙 준수 현황

- **감사 식별자**: `main-preservation-round4-20261107`
- **감사 수행 시각 (UTC)**: `2026-11-07T12:20:14.663Z`
- **기준 원격 브랜치 (`origin/main` HEAD)**: `354af37afeb3feb0f700b5a472fcfb0e31292ae0` (`2026-11-07T09:39:18Z`)
- **독립 보존 브랜치**: `docs/main-preservation-round4-20261107`
- **포함 산출물**:
  - 감사 보고서: [`README.md`](./README.md)
  - 감사 기준 데이터 및 합성 픽스처 모듈: [`preservation-audit-data.mjs`](./preservation-audit-data.mjs)
  - 읽기 전용 보존·경계·브라우저 검증 도구: [`verify-main-preservation-round4.mjs`](./verify-main-preservation-round4.mjs)
  - 단위·계약 테스트: [`verify-main-preservation-round4.test.mjs`](./verify-main-preservation-round4.test.mjs)
  - 실행 검증 리포트: [`verification-report.json`](./verification-report.json)

### 엄격 준수 사항 점검

| 통제 항목 | 상태 | 비고 |
| --- | --- | --- |
| `main` 브랜치 직접 수정·병합 금지 | 준수 (`PASS`) | 로컬/원격 `main` 무변경, 독립 브랜치 `docs/main-preservation-round4-20261107`만 사용 |
| 기존 브랜치 삭제·작업 트리 정리 금지 | 준수 (`PASS`) | 원격·로컬 브랜치 및 타 세션 워킹트리 일절 삭제/정리하지 않음 |
| 기존 실행 프로세스 중단 금지 | 준수 (`PASS`) | 병렬 세션 프로세스 유지, 자체 헤드리스 브라우저·임시 서버만 종료 |
| PR `#2740` 범위(`PackagePanel.tsx`, `package-panel/PackageDetail.tsx`) 중복 수정 금지 | 준수 (`PASS`) | 읽기 전용 라인 수·CI 대조만 수행, 소스 수정 0건 |
| 공유 스토어·스키마·라우트·테마·타 앱 코드 수정 금지 | 준수 (`PASS`) | `docs/main-preservation-round4-20261107/` 외부 파일 수정 0건 |

---

## 2. `origin/main` HEAD (`354af37a`) 기존 5대 기능 실제 Ancestry 및 파일 트리 보존 검증

`git merge-base --is-ancestor <SHA> 354af37afeb3feb0f700b5a472fcfb0e31292ae0` 및 `git ls-tree --name-only`를 통해 검증한 결과, 5개 핵심 기능 커밋과 각각의 부모 기능 커밋이 모두 **실제 `origin/main` ancestry에 포함되어 있으며 81개 필수 파일 전수가 최신 트리에 보존**되어 있음을 확인했습니다.

| 기능 영역 | 대상 SHA (Full SHA) | 부모 기능 SHA (Full SHA) | 커밋 시각 (UTC) | 출처 브랜치 / 세션 ID | Ancestry 포함 | 트리 파일 보존 | 판정 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **드로잉 (Drawing)** | `3363492c` (`3363492c7ad1fa245d4e4303f9408d57f792845b`) | `e6fd98fe` (`e6fd98fe0e9465e000bc12c2389a34c10c5a5308`) | `2026-11-07T07:15:48Z` | `feat/toon-drawing-ui-density-20261107` / `7d851db3-f1eb-457b-9d16-8df8b8eb060f` | `true` | `9 / 9` | **보존 완료 (`PASS`)** |
| **브러시 (Brush)** | `5dcfe58d` (`5dcfe58dc00fd4de377e43235f05f3133b7796c4`) | `a37ee654` (`a37ee65444a27ccf1d5ddd16f8ee881051778a07`) | `2026-11-07T07:32:42Z` | `brush-journey-round2-20261107` / `dfdfe8db-da85-443d-b472-b1c959b1d4a0` | `true` | `12 / 12` | **보존 완료 (`PASS`)** |
| **탐색 (Discovery)** | `4c108a65` (`4c108a65cd70f5a14f850005a90f830b18adcd5e`) | `58ffe587` (`58ffe587643bd13408479a8e231e1b853bf608d9`) | `2026-11-07T08:39:46Z` | `feat/catalog-resilience-round2-20261107` / `341b9f1e-1d06-44eb-8267-a169a3ff9aa9` | `true` | `15 / 15` | **보존 완료 (`PASS`)** |
| **접근성 (Accessibility)** | `1692360d` (`1692360dbcd7dd89491fbd20021ee9c7da8da332`) | `1692360d` (`1692360dbcd7dd89491fbd20021ee9c7da8da332`) | `2026-11-07T09:24:12Z` | `fix/accessibility-fixes-round2-20261107` / `888069cd-fb24-46da-bd5f-17a3dd63307c` | `true` | `18 / 18` | **보존 완료 (`PASS`)** |
| **Character (Character Lab)** | `354af37a` (`354af37afeb3feb0f700b5a472fcfb0e31292ae0`) | `511fd1f8` (`511fd1f8d60e69b21a6e67bb4d85bf3535c668a0`) | `2026-11-07T09:39:18Z` | `feat/character-reuse-round2-20261107` / `e4e67646-ae06-4410-9a77-8353a2a190fe` | `true` (`HEAD`) | `27 / 27` | **보존 완료 (`PASS`)** |

---

## 3. 완료 보고·로컬 커밋만 있고 원격 보존이 없는 브랜치 및 세션 전수 조사

원격 에이전트 세션 로그(`/home/antigravity/.gemini/jetski/brain/v1/default/jetski_remote_agents_3p` 56개 세션 및 서브에이전트 88개 세션)와 `origin` 원격 참조를 전수 대조하여 **즉시 보고가 필요한 원격 미보존(유실/누락 위험) 커밋**과 **리베이스·패치 동등성으로 이미 보존된 커밋**을 분리했습니다.

### 3-1. 완료 보고 또는 로컬 커밋만 존재하고 `origin` 원격 보존이 없는 브랜치/세션 (즉시 보고 대상)

| 세션 ID | 로컬 브랜치명 | 로컬 커밋 SHA | 마지막 활동 시각 (UTC) | 원격 보존 여부 | 미보존 원인 및 권장 조치 |
| --- | --- | --- | --- | --- | --- |
| `86ad871b-d3dd-4bab-9b02-1f641ef2267f` | `qa/responsive-audit-20261107` (및 세션 로컬 `main`) | `d0f9aa0b`, `abebd404`, `2466becc`, `129fd16c` | `2026-11-07T03:42:46Z` | **미보존 (`false`)** | 세션 내부에서 로컬 `main` 병합 후 `git push origin main`을 실행했으나 `.husky/pre-push`의 `typecheck-shards.mjs --heap-mb 8192`가 8GB uVM 메모리 한도로 OOM(`exit code 137`) 종료되어 원격에 푸시되지 않음. 이후 병합된 `4c108a65`(탐색), `1692360d`(접근성), `ea1202e6`(홈)과 카탈로그·공통 UI 수정 범위가 일부 겹치므로 강제 병합하지 말고 필요 시 감사 문서만 별도 추출 권장. |
| `516daae4-99c9-4240-9146-9c80fc92c1fb` | `fix/studio-document-persistence-data-paths` (및 세션 로컬 `main`) | `1e7fbb0f`, `a9c8a001`, `904208d0` | `2026-11-07T04:15:43Z` | **미보존 (`false`, 후속 브랜치로 대체)** | 동일 세션의 후속 라운드 브랜치 `fix/studio-storage-resilience-20261107`(`e2584127` -> `55335f50`) 및 `fix/studio-autosave-20261107`(`04935cbd` -> `83611f23`)는 `origin/main`에 정상 병합·보존되었으나, 초기 브랜치 커밋 `1e7fbb0f`는 원격에 푸시되지 않음. 후속 커밋(`55335f50`, `83611f23`)에 포함되지 않은 테스트가 있는지 통합 담당 대조 권장. |
| `1f27490a-679c-49e8-84af-cb2e95206dc7` | 세션 로컬 `main` | `90d388f3`, `95069a90` | `2026-11-06T22:53:48Z` | **미보존 (`false`)** | `fix(creator): 작업실 인스펙터 레이어 선택과 캔버스 변형 기즈모 동기화` 로컬 커밋 생성 후 원격 푸시 없이 세션 종료. 필요 시 독립 복구 브랜치로 재검증 권장. |
| `d35c7d79-ca14-4d62-a2a0-49d72364a81f` | 세션 로컬 `main` | `85651398`, `36baced5` | `2026-11-06T08:49:29Z` | **미보존 (`false`)** | `fix(creator): 콘티/원고 컷 카드 및 스튜디오 인스펙터 문맥 액션 직관화` 로컬 커밋 생성 후 원격 미푸시. 최신 작업실 UI(`3363492c`, `37775f18`)와 대조 후 선별 반영 권장. |
| `9ad1e287-a8de-403e-be6c-e7dc7ed6d704` | 세션 로컬 `main` | `0798e876` | `2026-11-06T07:21:05Z` | **미보존 (`false`)** | `fix(creator): 3D 뷰어/배경 홀드아웃 마스크 편집 및 렌더 프리뷰 상태 동기화 개선` 로컬 커밋 생성 후 원격 미푸시. 3D 배경 담당 세션에서 독립 PR 분리 권장. |
| `b0194216-94fb-4dc7-b8ae-d5044d38daed` | 세션 로컬 `main` | `301b6708`, `585700f2` | `2026-11-06T05:54:37Z` | **미보존 (`false`)** | `fix(web): 비로그인/게스트 상태에서 제작·유통 스튜디오 진입 시 명확한 안내 배너 및 읽기 전용 탐색 제공` 로컬 커밋 생성 후 원격 미푸시. 최신 인증 가드(`5f51aa97`)와 대조 권장. |

### 3-2. 리베이스 또는 패치 동등(Patch-Equivalent)으로 이미 `origin/main`에 보존된 커밋 (유실 아님)

- **세션 `c1295b93-dd7f-4a1c-a3ac-097538ff1022` (`feat/parallel-toon-home-20261107`)**:
  - 리베이스 전 로컬 SHA `3bc4095b`는 리베이스 후 `b917f094461d98fc617cf6179546722d9ef9559b`로 변환되어 머지 커밋 `ea1202e6372eb522f262e388d92761c5c5048a10`으로 `origin/main`에 완전히 보존되어 있습니다.
- **원격 브랜치 `origin/audit/accessibility-sweep-20261107` (`a8614c5f37bfe928566f3458f76860b8c795feec`)**:
  - `git cherry origin/main a8614c5f37bfe928566f3458f76860b8c795feec` 실행 결과가 `- a8614c5f37bfe928566f3458f76860b8c795feec`이며, `origin/main` 내 `5eb3810b90837e5e02baddf4b0880acdad1d76e8` 커밋과 **패치 내용이 100% 동일**합니다.

### 3-3. 현재 병렬 진행 중인 Round 4 활성 세션 (중단·간섭 금지 대상)

| 세션 ID | 작업 브랜치 / 영역 | 기준 SHA | 최근 활동 시각 (UTC) | 소유 파일 범위 |
| --- | --- | --- | --- | --- |
| `e4e67646-ae06-4410-9a77-8353a2a190fe` | `docs/character-keyboard-round4-20261107` | `354af37a` | `2026-11-07T11:36:56Z` | `apps/character-lab/src/app/shell/CharacterLabShell.tsx`, `ShellHeader.tsx`, `ExpressionPanel.tsx`, `WardrobePanel.tsx` (`PackagePanel` 제외) |
| `888069cd-fb24-46da-bd5f-17a3dd63307c` | `audit/a11y-uncovered-round4-20261107` | `354af37a` | `2026-11-07T11:36:56Z` | `apps/web/src/domains/inbox/`, `apps/web/src/domains/community/`, `docs/a11y-uncovered-round4-20261107/` |
| `44c559e8-27a6-4090-a7d0-f12d6847bc41` | `ProductionScheduleViews.tsx` 구조 분해 | `354af37a` | `2026-11-07T11:36:55Z` | `apps/web/src/domains/creator/ProductionScheduleViews.tsx`, `apps/web/src/domains/creator/production-schedule/` |
| `dfdfe8db-da85-443d-b472-b1c959b1d4a0` | 브러시 프리셋 비교 바 개선 | `354af37a` | `2026-11-07T11:36:53Z` | `apps/brush-lab/src/app/PresetComparisonBar.tsx` |
| `341b9f1e-1d06-44eb-8267-a169a3ff9aa9` | 작가 페이지 복원력 확장 | `354af37a` | `2026-11-07T11:36:56Z` | `apps/web/src/domains/catalog/AuthorPage.tsx` |
| `c1295b93-dd7f-4a1c-a3ac-097538ff1022` | 홈 200개 시리즈 벤치마크 | `354af37a` | `2026-11-07T11:36:50Z` | `scripts/bench-toon-home-200.mjs`, `apps/web/src/domains/home/` |

---

## 4. 남은 원격 브랜치·오픈 PR `#2740` 및 CI 실패 경계 정밀 분석

### 4-1. 원격(`origin`) 미병합 브랜치 및 오픈 PR 현황

| 원격 브랜치 | HEAD SHA (Full SHA) | 커밋 시각 (UTC) | PR 번호 / 상태 | `origin/main` 대비 | 패치 동등 여부 | 처분 권고 |
| --- | --- | --- | --- | --- | --- | --- |
| `origin/codex/character-package-panel-modules-20261107` | `f508de8f` (`f508de8fd00b9bb6bb40efa85751c90a9dfd62b6`) | `2026-11-07T10:31:59Z` | **PR `#2740` (`OPEN`)** | `ahead 1, behind 4` (base: `1692360d`) | `false` (신규 모듈 분리) | **1순위 리베이스 후 병합 (`MERGE_FIRST`)** |
| `origin/audit/accessibility-sweep-20261107` | `a8614c5f` (`a8614c5f37bfe928566f3458f76860b8c795feec`) | `2026-11-07T02:27:43Z` | 없음 (`NONE`) | `ahead 1, behind 36` (base: `5f51aa97`) | `true` (`5eb3810b`와 동일) | **병합 금지 (`SKIP`, 이미 `5eb3810b`로 반영 완료)** |

### 4-2. `origin/main` CI 실패 원인 및 PR `#2740` 소유 범위 일치 증명

- **`origin/main` (`354af37afeb3feb0f700b5a472fcfb0e31292ae0`) CI 실행 결과**:
  - Workflow Run ID: `42360644304` (`2026-11-07T09:39:21Z` 시작 ~ `2026-11-07T10:05:56Z` 종료, 결론: `failure`)
  - 실패 Job 1: `Core preflight and application typecheck` (Job ID `128370368308`) — `Enforce 800-line ceiling on source files` 단계 실패
  - 실패 Job 2: `Core regression shard / product` (Job ID `128370368255`) — `check-source-file-size` 계약 검증 실패
  - **단일 실패 원인**: `511fd1f8`(`354af37a`에 병합된 Character 재사용 기능)에서 `apps/character-lab/src/app/shell/panels/PackagePanel.tsx`가 `672줄 -> 840줄`로 증가하여 **소스 파일 상한 800줄을 40줄 초과(`840줄 > 800줄`)**함.
- **오픈 PR `#2740` (`codex/character-package-panel-modules-20261107` @ `f508de8fd00b9bb6bb40efa85751c90a9dfd62b6`) CI 실행 결과**:
  - 수정 파일:
    - `apps/character-lab/src/app/shell/panels/PackagePanel.tsx` (`708줄`로 축소)
    - `apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx` (`161줄` 신규 분리)
  - Workflow Run ID:
    - `CI` (`42366301686`): **`SUCCESS`** (`2026-11-07T10:32:07Z` ~ `10:49:10Z`, 모든 샤드 통과)
    - `Architecture boundaries` (`42366301620`): **`SUCCESS`**
    - `CodeQL` (`42366301688`): **`SUCCESS`**
- **결론**: 현재 `origin/main`의 CI 차단은 이미 오픈 PR `#2740` 담당 범위에서 정확히 해결 및 검증 완료되었으므로, **타 세션의 `PackagePanel.tsx` 및 `package-panel/PackageDetail.tsx` 중복 수정은 엄격히 금지**됩니다.

---

## 5. 전체 통합 담당을 위한 안전한 순차 병합(Sequential Merge) 제안

파일 소유권 경계 충돌을 원천 차단하고 CI 게이트를 즉시 복구하기 위해 아래 **5단계 순차 병합 절차**를 제안합니다.

1. **Step 1 — PR `#2740` (`origin/codex/character-package-panel-modules-20261107` @ `f508de8f`) 리베이스 후 최우선 병합**
   - **대상 파일**: `apps/character-lab/src/app/shell/panels/PackagePanel.tsx`, `apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx`
   - **주의사항**: PR `#2740`의 분기점은 `1692360d`(`354af37a` 직전)이므로, `354af37a`(`511fd1f8`)에서 추가된 패키지 복구·재가져오기 UI 상태가 유실되지 않도록 반드시 `354af37a` 위로 리베이스한 뒤 `PackagePanel.tsx`가 800줄 이하임을 확인하고 `main`에 병합합니다.
2. **Step 2 — 본 읽기 전용 감사 브랜치 (`origin/docs/main-preservation-round4-20261107`) 병합**
   - **대상 파일**: `docs/main-preservation-round4-20261107/*` (신규 독립 폴더 5개 파일)
   - **근거**: 앱 코드·공유 스토어·라우트 수정이 전혀 없어 타 모든 브랜치와 파일 교집합이 `0건`입니다.
3. **Step 3 — `origin/audit/accessibility-sweep-20261107` (`a8614c5f`) 병합 제외 (`SKIP`)**
   - **근거**: 이미 `origin/main`의 `5eb3810b90837e5e02baddf4b0880acdad1d76e8` 커밋으로 동일 패치가 반영되어 있으므로 재병합하지 않습니다.
4. **Step 4 — 도메인 격리 Round 4 병렬 브랜치 순차 병합**
   - **대상 영역**: 탐색 작가 페이지(`AuthorPage.tsx`), 브러시 비교 바(`PresetComparisonBar.tsx`), 제작 일정 분해(`ProductionScheduleViews.tsx`), 홈 벤치마크(`scripts/bench-toon-home-200.mjs`)
   - **전제 조건**: 각 세션이 독립 브랜치 원격 푸시 후 `check:source-file-size`(800줄 상한), 관련 테스트, 브라우저 뷰포트 검증을 통과한 상태에서 1개씩 순차 병합합니다.
5. **Step 5 — UI 셸·라우트 인접 Round 4 브랜치 (`audit/a11y-uncovered-round4-20261107`, `docs/character-keyboard-round4-20261107`) 최종 병합**
   - **전제 조건**: Step 1(PR `#2740`) 병합 완료 후 최신 `origin/main` 위로 리베이스하고, `PackagePanel` 및 메시지함 별도 담당 범위와 파일 충돌이 0건인지 재확인한 뒤 병합합니다.

---

## 6. 읽기 전용 검증 도구 및 실제 브라우저 검증 결과

### 6-1. 재현 명령

```bash
# 읽기 전용 보존·CI 경계·순차 병합 계획·실제 브라우저(320/390/768/1440/200%) 통합 검증
node docs/main-preservation-round4-20261107/verify-main-preservation-round4.mjs --browser

# 단위·계약 테스트 실행
node --test docs/main-preservation-round4-20261107/verify-main-preservation-round4.test.mjs
```

### 6-2. 실제 헤드리스 Chromium 뷰포트 및 200% 확대 검증 결과

합성(synthetic) 검증 픽스처 대시보드를 대상으로 `320px`, `390px`, `768px`, `1440px` 및 `200%` 확대 조건에서 가로 오버플로우, 기능 카드 렌더링, 필터 전환 상호작용, 콘솔/런타임 에러를 측정한 결과 전 항목 통과했습니다.

| 뷰포트 / 배율 조건 | 해상도 (`W × H`) | 확대 배율 | `clientWidth` | `scrollWidth` | 가로 오버플로우 (`px`) | 필터 버튼 상호작용 | 콘솔 / 페이지 에러 | 결과 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `320px-mobile` | `320 × 640` | `100%` | `320` | `320` | `0px` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `390px-mobile` | `390 × 844` | `100%` | `390` | `390` | `0px` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `768px-tablet` | `768 × 1024` | `100%` | `768` | `768` | `0px` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `1440px-desktop` | `1440 × 900` | `100%` | `1440` | `1440` | `0px` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `1440px-zoom-200pct` | `1440 × 900` | `200%` | `1440` | `1440` | `0px` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
| `320px-zoom-200pct` | `320 × 640` | `200%` | `320` | `320` | `0px` | `PASS` | `0 / 0` | **통과 (`PASS`)** |
