# ToonStudio 홈·프로젝트 목록 로컬 UI 후속 (Round 4 — 200개 프로젝트 확장성·필터 응답·키보드 선택·작품 열기 동선) 증거 문서 (`2026-11-07`)

## 1. 작업 개요 및 소유 경계

- **목표**: 200개 합성 프로젝트(`200개 프로젝트`), 긴 한글 제목(`긴한글제목`), 커버 이미지 로드 실패(`커버실패`), 최근 작업순 정렬(`최근정렬`), 한글 IME 조합 검색(`검색IME`) 조건에서 **첫 화면 렌더 비용·필터 응답·키보드 선택·작품 열기 동선**을 실측하여 **재현된 결함만 최소 수정**.
- **UX 원칙**:
  - 사용자가 중요한 액션(`새 작업`, `파일 가져오기`, `최근 작업 열기`, 카드별 `이어서 작업`)을 첫눈에 식별하도록 유지하되, **상단 메뉴·버튼을 중복 적층하지 않음**(최근 작업 바 내부의 중복 `.toonstudio 파일 열기` 제거 및 검색 입력 중 최근 작업 바 비표시로 검색 결과·0결과 복구 동선 즉시 노출).
  - 검색 0결과(`data-studio-empty-state="search"`)에서 `검색어 지우기` 클릭 시 검색어를 초기화하고 **검색 입력창으로 키보드 포커스를 즉시 복귀**시켜 재검색·이탈 없이 회복 가능하게 개선.
  - 프로젝트 카드 제목(`h3 > a[data-studio-card-title-link="true"]`)과 주 액션 버튼(`이어서 작업`) 모두에서 작품을 바로 열 수 있도록 동선 단순화.
- **소유 및 변경 파일 (로컬 UI·전용 테스트·증거 문서만 수정)**:
  - `apps/web/src/domains/creator/studio-shell/studio-project-library-management-model.ts` (158줄)
  - `apps/web/src/domains/creator/studio-shell/useStudioProjectLibraryManagementController.ts` (483줄)
  - `apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementHeader.tsx` (359줄)
  - `apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementContent.tsx` (286줄)
  - `apps/web/src/domains/creator/studio-shell/StudioProjectLibraryManagementUi.tsx` (471줄)
  - `apps/web/src/domains/creator/studio-shell/StudioProjectCardThumbnail.tsx` (434줄)
  - `apps/web/src/domains/creator/studio-shell/StudioCreatorLobby.tsx` (785줄)
  - `apps/web/src/domains/creator/studio-shell/StudioProjectLibraryPage.test.tsx` (689줄)
  - `docs/toon-home-scale-round4-20261107/README.md`
- **불변 경계 준수**:
  - 저장/삭제/복구 모델(`studio-project-library-store.ts`, `studio-save-profile.ts`, `studio-project-package*`, `studio-autosave*`), 라우트, 공유 스토어/스키마/테마, 다른 앱·패키지, `PackagePanel`/`package-panel`/`PackageDetail` 범위 **0건 수정**.
  - 모든 검증은 사용자 원본 데이터 대신 100% **합성 픽스처(200개 합성 프로젝트)**로 수행.

---

## 2. 실측 재현 결함 및 최소 수정 내역

| 영역 | 실측으로 재현된 결함 (Before) | 최소 수정 내용 (After) |
| :--- | :--- | :--- |
| **첫 화면 렌더 비용 (`첫화면 렌더 비용`)** | 1) 200개 프로젝트 시드 시 초기 화면에서 202개 카드 전체를 한꺼번에 마운트(`renderedCardCount: 202`, `totalDomNodes: 10,417`).<br>2) `StudioProjectLibraryManagementContent`가 카드마다 `projectResumeTarget(project)`와 `continueProjectHref(project)`를 중복 호출하여 매 렌더마다 404회씩 `localStorage.getItem` + `JSON.parse` 수행.<br>3) `StudioProjectCardThumbnail`의 `bt(\`${project.title} 최근 작업 미리보기\`, ...)` 동적 키 등록과 `translateCurrentStaticSourceText(..., "en", ...)` 호출이 결합되어 로케일 번들 재계산 및 연쇄 리렌더 유발(`initialStorageGetReads: 82,321`, `firstScreenRenderMs: 26,026ms`).<br>4) `studioProjectLibraryDateLabel` 호출마다 `new Intl.DateTimeFormat` 인스턴스 재생성 및 `sortStudioProjectLibraryProjects` 비교자 내부에서 반복 `Date.parse` 수행. | 1) 섹션별 초기 노출 카드 수를 12개(`임시 작업 12 + 프로젝트 12 = 초기 24개`)로 윈도잉하고 섹션 하단에 단일 인라인 `더 보기 ({남은 개수}개 남음)` 버튼(`data-studio-load-more`) 제공.<br>2) `useStudioProjectLibraryManagementController`에서 프로젝트 버전별 `projectResumeTarget` 결과를 메모이제이션하고 `StudioProjectLibraryManagementContent`/`Header`에서 `resumeTarget.href`를 직접 재사용.<br>3) `StudioProjectCardThumbnail`의 미리보기 라벨을 정적 템플릿 키(`formatI18nTemplate(bt("{value0} 최근 작업 미리보기", ...))`)로 전환하고 URL/상수 문자열의 불필요한 `translateCurrentStaticSourceText` 호출 제거.<br>4) 로케일별 `Intl.DateTimeFormat` 캐시 및 정렬 시 타임스탬프 사전 계산 적용. |
| **필터 응답 및 한글 IME 검색 (`필터 응답 · 검색IME · 검색0결과 회복`)** | 1) 한글 IME 조합(`ㅎ`→`하`→`합`→`합성`→`합성1`→`합성19`→`합성199`) 입력 시 매 키 입력마다 200개 프로젝트의 `studioProjectLibrarySearchText` 및 임시/저장 프로필 판별(`createDefaultStudioSaveProfile`)을 재실행하고, 필터링 중 `localStorage`를 4,380회 재조회(`totalFilterMs: 1,024.11ms`, `maxStepMs: 526.58ms`).<br>2) 검색 중에도 상단 `최근 작업` 바가 그대로 남아 검색 결과·0결과 화면이 아래로 밀림.<br>3) 검색 0결과에서 `검색어 지우기` 클릭 시 검색 입력창 포커스가 유실됨(`isSearchInputFocused: false`). | 1) `[listedProjects, locale]` 기준 NFC 정규화 검색 인덱스(`searchIndexByProjectId`)와 `temporaryProjectIdSet`을 `useMemo`로 사전 계산하고, `StudioCreatorLobby`의 `recentProjects`/`temporaryCount`도 메모이제이션하여 7단계 IME 필터 비용을 `506.69ms`(`maxStepMs: 153.59ms`, 필터 중 `storageReadsDuringFilter: 50`)로 단축.<br>2) 검색어 입력 중(`query.trim().length > 0`)에는 `최근 작업` 바를 숨겨 검색 결과와 0결과 복구 화면을 검색창 바로 아래에 노출.<br>3) 검색창에서 `Escape`(IME 조합 중이 아닐 때)로 검색어 즉시 초기화, `Enter`로 첫 결과 카드의 `이어서 작업` 링크 포커스 이동, 0결과 `검색어 지우기` 클릭 시 검색 입력창 자동 포커스 복구(`isSearchInputFocused: true`). |
| **키보드 선택 (`키보드 선택`)** | 1) 카드 선택 체크박스(`StudioProjectSelectionCheckbox`)가 `size-8`(32×32px)로 모바일 44px 터치 타깃 미달.<br>2) 체크박스 간 키보드 방향키 이동 및 `Escape` 선택 해제가 지원되지 않음. | 1) 체크박스 크기를 `size-11 sm:size-9`(모바일 320/390px에서 `44×44px`, 태블릿/PC에서 `36×40px`, 200% 확대에서 `72×80px`)로 개선.<br>2) 체크박스 포커스 상태에서 `ArrowDown`/`ArrowRight`/`ArrowUp`/`ArrowLeft`/`Home`/`End` 키로 카드 간 선택 포커스 순환 이동 지원 및 모달이 없을 때 `Escape` 키로 다중 선택 즉시 해제. |
| **작품 열기 동선 (`작품 열기 동선 · 메뉴 미적층`)** | 1) 상단 헤더의 `파일 가져오기` 바로 아래 `최근 작업` 바 내부에 `.toonstudio 파일 열기`가 중복 배치되어 상단 액션이 겹침.<br>2) 프로젝트 카드의 제목(`h3`)을 클릭해도 작품이 열리지 않고 하단 `이어서 작업` 버튼만 동작. | 1) `최근 작업` 바 내부의 중복 `.toonstudio 파일 열기` 링크를 제거해 상단에서는 `[새 작업] [파일 가져오기]`와 `[최근 작업 열기]`만 첫눈에 식별되도록 정리.<br>2) 카드 제목(`h3`) 내부에 `<Link href={continueHref} onClick={onTouch}>`를 연결해 제목 클릭과 `이어서 작업` 버튼 클릭 모두 동일하게 최근 작업 위치로 즉시 진입(`titleLinksCount: 24`). |

---

## 3. 전후(Before / After) 실브라우저 성능·동작 비교 (Chromium, 200개 합성 프로젝트)

동일한 200개 합성 프로젝트 픽스처(임시 작업 100개 + 정식 저장 프로젝트 100개, 3개 중 1개 초장문 한글 제목, 4개 중 1개 깨진 SVG 커버 데이터 URL, 최근 열람 시각 역순 정렬, 각 프로젝트별 문서·정확한 이어하기 컨텍스트 포함)를 시드한 뒤 Headless Chromium(`/usr/bin/chromium`)에서 Vite 모듈 캐시 예열 후 측정한 결과입니다.

| 측정 항목 | 개선 전 (Before) | 개선 후 (After) | 변화율 / 결과 |
| :--- | ---: | ---: | :--- |
| **첫 화면 렌더 소요 (`firstScreenRenderMs`)** | `26,026 ms` | **`3,760 ms`** | **-85.5% (6.92배 단축)** |
| **첫 화면 초기 마운트 카드 수 (`renderedCardCount`)** | `202 개` | **`24 개`** (`임시 12 + 저장 12` + `더 보기 2개`) | **-88.1%** |
| **첫 화면 총 DOM 노드 수 (`totalDomNodes`)** | `10,417 개` | **`2,186 개`** | **-79.0%** |
| **초기 렌더 `localStorage.getItem` 호출 수 (`initialStorageGetReads`)** | `82,321 회` | **`629 회`** | **-99.2%** |
| **7단계 한글 IME 조합 검색 총 소요 (`imeFilter.totalFilterMs`)** | `1,024.11 ms` | **`506.69 ms`** | **-50.5%** |
| **7단계 한글 IME 단계별 평균 / 최대 (`avgStepMs` / `maxStepMs`)** | `146.30 ms` / `526.58 ms` | **`72.38 ms` / `153.59 ms`** | **최대 지연 -70.8%** |
| **7단계 한글 IME 필터 중 `localStorage.getItem` 호출 (`storageReadsDuringFilter`)** | `4,380 회` | **`50 회`** | **-98.9%** |
| **검색 중 상단 `최근 작업` 바 중복 노출 (`recentBarVisibleDuringSearch`)** | `true` (결과 위 적층) | **`false`** (검색 결과 즉시 노출) | **개선 완료** |
| **최근 작업 바 내 중복 `.toonstudio` 버튼 수 (`recentBarOpenFileButtons`)** | `1 개` (링크 중복) | **`0 개`** (단일 주 액션만 유지) | **메뉴 적층 제거** |
| **검색 0결과 `검색어 지우기` 후 검색창 포커스 복구 (`isSearchInputFocused`)** | `false` | **`true`** | **포커스 복구 완료** |
| **카드 제목 직접 열기 링크 수 (`titleLinksCount`)** | `0 개` | **`24 개`** (노출 카드 전수) | **작품 열기 동선 단축** |

---

## 4. 실제 브라우저 반응형 및 200% 확대 검증 (320 / 390 / 768 / 1440 / 200% Zoom)

200개 합성 프로젝트(초장문 한글 제목 + 커버 로드 실패 포함) 상태에서 Chromium 실측 결과:

| 뷰포트 / 배율 | 가로 오버플로 (`horizontalOverflowPx`) | 카드 이탈 (`cardOverflowCount`) | 긴 한글 제목 이탈 (`titleOverflowCount`) | 깨진 이미지 방치 (`brokenImgCount`) | 선택 체크박스 크기 (`checkboxWidth × checkboxHeight`) | 판정 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| **Mobile 320px (`320×640`)** | `0 px` | `0` | `0` | `0` | `44 × 44 px` | **PASS** |
| **Mobile 390px (`390×844`)** | `0 px` | `0` | `0` | `0` | `44 × 44 px` | **PASS** |
| **Tablet 768px (`768×1024`)** | `0 px` | `0` | `0` | `0` | `36 × 40 px` | **PASS** |
| **Desktop 1440px (`1440×900`)** | `0 px` | `0` | `0` | `0` | `36 × 40 px` | **PASS** |
| **200% 확대 (`1440×900 @ zoom: 2`)** | `0 px` | `0` | `0` | `0` | `72 × 80 px` | **PASS** |

---

## 5. 단위·회귀 테스트, 타입체크, 린트 및 파일 크기 검증

- **Vitest 전용·회귀 테스트 (5개 파일 47개 테스트 전수 통과)**:
  - `StudioProjectLibraryPage.test.tsx` (16개 테스트 통과 — 200개 합성 프로젝트 윈도잉 렌더, `더 보기` 확장, 한글 IME 검색, 검색 0결과 포커스 복구, 키보드 화살표/Escape 선택 해제 회귀 테스트 포함)
  - `StudioCreatorLobby.test.tsx` (10개 테스트 통과)
  - `StudioFrontDoorPages.contract.test.ts` (8개 테스트 통과)
  - `useStudioProjectLibrary.test.tsx` (9개 테스트 통과)
  - `useStudioProjectThumbnailUrl.test.tsx` (4개 테스트 통과)
- **ESLint (`--max-warnings=0`)**: 에러 0, 경고 0.
- **TypeScript (`tsc --noEmit`)**: 에러 0.
- **소스 파일 크기 (`scripts/check-source-file-size.mjs`)**: 변경된 모든 파일이 800줄 제한 이내임을 확인 (`StudioCreatorLobby.tsx` 785줄, `StudioProjectLibraryPage.test.tsx` 689줄, `useStudioProjectLibraryManagementController.ts` 483줄, `StudioProjectLibraryManagementUi.tsx` 471줄, `StudioProjectCardThumbnail.tsx` 434줄, `StudioProjectLibraryManagementHeader.tsx` 359줄, `StudioProjectLibraryManagementContent.tsx` 286줄, `studio-project-library-management-model.ts` 158줄).
