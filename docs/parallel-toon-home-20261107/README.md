# ToonStudio 홈·프로젝트 목록 페이지 승인 시안 정합성 및 동선·모바일 검증 증거 (2026-11-07)

## 1. 작업 범위 및 소유권 경계 (Ownership Boundary)

본 작업은 **ToonStudio 홈/프로젝트 목록 페이지(`/studio`, `apps/web/src/domains/creator/studio-shell/*`)** 로컬 컴포넌트·스타일·단위/계약 테스트 및 본 증거 문서(`docs/parallel-toon-home-20261107/README.md`)만 단독 소유하여 수행되었습니다.

- **소유 및 변경 파일 목록 (`apps/web/src/domains/creator/studio-shell/`)**:
  - `StudioProjectLibraryManagementHeader.tsx` (348줄)
  - `StudioProjectLibraryManagementContent.tsx` (216줄)
  - `StudioProjectLibraryManagementUi.tsx` (440줄)
  - `StudioProjectCardThumbnail.tsx` (431줄)
  - `StudioProjectLibraryEmptyVisual.tsx` (101줄)
  - `StudioCreatorLobby.tsx` (775줄)
  - `StudioSaveFirstProjectLibraryPage.tsx` (709줄)
  - `studio-illustrated-project-surfaces.css` (196줄)
  - `StudioProjectLibraryPage.test.tsx` (549줄)
  - `StudioCreatorLobby.test.tsx` (269줄)
  - `StudioVisualIdentity.contract.test.ts` (89줄)
- **비소유 보호 검증**:
  - 드로잉(`drawing`), 프로덕션(`production`), 공통 셸·스토어(`shared shell/store`), 공유 라우트·테마·설정(`route/theme/config`) 및 타 페이지 수정 **0건**.

---

## 2. 핵심 개선 사항 요약

### 2.1 새 프로젝트 / 최근 작업 / 열기 동선 단순화
1. **상단 핵심 시작·열기 액션(`data-studio-primary-entry-actions="true"`)**:
   - `/studio` 진입 즉시 `<details>` 밖에 **새 작업**(`/create` 또는 `/studio/new`)과 **파일 가져오기**(`/studio/import`) 버튼을 1클릭 동선으로 고정 배치했습니다.
2. **최근 작업 빠른 이어하기 바(`data-studio-recent-work-bar="true"`)**:
   - 진행 중(`active`) 프로젝트가 존재할 때 헤더 직하단에 `role="region" aria-label="최근 작업 빠른 이어하기"` 바를 노출합니다.
   - 자동 시딩된 연습 예제(`EXAMPLE_PROJECT_ID`, `SAMPLE_PROJECT_ID`)보다 사용자의 실제 최근 작업을 우선 선택하여 제목(`data-studio-recent-work-title="true"`), 작품 형식·마지막 열람 시각, **최근 작업 열기**(`data-studio-recent-work-open="true"`), **.toonstudio 파일 열기**(`data-studio-open-package-shortcut="true"`) 바로가기를 1클릭으로 제공합니다.
3. **최근 작업 카드 강조(`data-recent-primary="true"`, `data-studio-recent-badge="true"`)**:
   - 목록 내 가장 최근 프로젝트 카드에 `최근 작업` 배지와 강조 테두리를 부여하여 재방문 시 시선 이동 없이 즉시 이어서 작업할 수 있게 했습니다.

### 2.2 긴 제목(`긴 제목`) 줄바꿈·말줄임 및 툴팁 보존
- 단일 줄 `truncate`로 인해 카드 제목이 잘리거나 좁은 폭에서 레이아웃을 밀어내던 문제를 해결하기 위해 `StudioProjectLibraryCard`, `StudioProjectLibraryRecoveryRow`, `StudioSaveFirstProjectLibraryPage`, `StudioLobbyProjectCard`의 제목 요소에 `line-clamp-2 break-words [overflow-wrap:anywhere]`, `title={project.title}`, `data-studio-project-title="true"`를 일관 적용했습니다.
- 120자 장문 한·영·숫자 혼합 제목에서도 가로 오버플로(`scrollWidth > clientWidth`) 없이 최대 2줄로 정돈되며 `title` 툴팁으로 전문을 확인할 수 있습니다.

### 2.3 커버 및 일러스트 이미지 로드 실패(`커버 이미지 실패`) 폴백
- **`StudioProjectCardThumbnail.tsx`**:
  - 저장된 썸네일(`storedThumbnail`) 로드 실패(`onError`) 시 `storedThumbnailFailed = true`로 전환하고, 기존의 로딩 스피너(`<PreviewLoading>`) 대기 상태를 즉시 우회하여 `<PreviewEmpty coverFailed variant={variant} />`를 렌더링합니다.
  - 루트 및 폴백 컨테이너에 `data-thumbnail-fallback="true"`와 `data-project-preview-state="fallback"`을 부여하고 `"표지 이미지를 불러오지 못해 기본 커버로 표시합니다."` 안내와 구조화된 포맷 커버 프리뷰를 노출합니다.
- **`StudioCreatorLobby.tsx` (`LobbyArtImage`)**:
  - 로비 히어로·빠른 시작·스타터·AI 디렉터 아바타 이미지가 로드 실패할 경우 깨진 브라우저 이미지 아이콘 대신 `<span data-lobby-art-fallback="true" aria-hidden="true" />` 그라디언트 서피스로 안전하게 대체합니다.
- **`StudioProjectLibraryEmptyVisual.tsx`**:
  - 빈 상태 일러스트 로드 실패 시 `data-empty-visual-fallback="true"` 타이포그래피·모티프 블록(`role="img"`)으로 즉시 전환합니다.

### 2.4 빈 상태(`빈상태`) 자체 완결 스타일 및 복구 동선
- `/studio` 직접 진입 시에도 `<StudioWorkspaceLibraryEmptyState />`(`.workspace-library-empty`)와 `<details class="workspace-library-personalize">`가 깨지지 않도록 `studio-illustrated-project-surfaces.css`에 자체 완결형 레이아웃·타이포그래피·44px 버튼 규칙을 추가했습니다.
- 활성 작업 없음(`active`), 검색 결과 없음(`data-studio-empty-state="search"`), 보관함 비어 있음(`data-studio-empty-state="archived"`), 휴지통 비어 있음(`data-studio-empty-state="trash"`) 모든 상태에서 명확한 안내 문구와 다음 행동 버튼(`새 작업 시작`, `.toonstudio 파일 열기`, `검색어 지우기`, `내 작업으로 돌아가기`, `백업 파일 열기`)을 제공합니다.

### 2.5 모바일 카드 간격 및 44px 터치 타깃(`모바일 카드 간격`)
- 모바일 카드 그리드 간격을 `gap-3.5 sm:gap-4` 및 `@media (max-width: 600px) { [data-studio-project-grid] { gap: .875rem; } }`(14px)로 정돈하고, 카드 내부 패딩(`p-3.5 sm:p-4`)과 메타데이터 그리드(`grid-cols-1 sm:grid-cols-2`)를 반응형으로 구성했습니다.
- 모바일 환경에서 모든 카드·헤더·빈 상태 주요/보조 액션 버튼(`새 작업`, `파일 가져오기`, `최근 작업 열기`, `이어서 작업`, `정식 저장`, `복제`, `프로젝트 관리`, `보관`, `휴지통`, `복원`, `완전 삭제`)에 최소 높이 `min-h-11`(44px)을 보장했습니다.

---

## 3. 실제 브라우저(Chromium) 반응형·확대 검증 결과

실제 Headless Chromium(`/usr/bin/chromium`)에서 120자 장문 제목 프로젝트와 깨진 커버 이미지(`thumbnailUrl: "data:image/png;base64,broken-thumbnail-payload"`) 및 다중 카드를 시딩한 뒤 `/studio` 페이지를 측정한 결과입니다.

| 뷰포트 / 조건 | 가로 오버플로 (`horizontalOverflowPx`) | 최근 작업 바 (`hasRecentBar`) | 장문 제목 오버플로 (`titleOverflow`) | 커버 폴백 (`fallbackThumbs`) | 최근 배지 (`recentBadges`) | 카드 간격 (`cardGapPx`) | 주요 버튼 높이 (`createBtnHeightPx`) | 판정 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Mobile 320 (`320×568`)** | `0px` | `true` | `false` | `2` | `1` | `14px` | `44px` | **PASS** |
| **Mobile 390 (`390×844`)** | `0px` | `true` | `false` | `2` | `1` | `14px` | `44px` | **PASS** |
| **Tablet 768 (`768×1024`)** | `0px` | `true` | `false` | `2` | `1` | `16px` | `44px` | **PASS** |
| **PC 1440 (`1440×900`)** | `0px` | `true` | `false` | `2` | `1` | `16px` | `44px` | **PASS** |
| **PC 1440 @ 200% 확대 (`zoom: 2`)** | `0px` | `true` | `false` | `2` | `1` | `32px` | `88px` | **PASS** |
| **200% Reflow (`720×450`)** | `0px` | `true` | `false` | `2` | `1` | `16px` | `44px` | **PASS** |

- **빈 상태 브라우저 검증 (`390×844`)**:
  - 검색 결과 없음 (`[data-studio-empty-state="search"]`): `1` (노출 및 1클릭 검색어 초기화 정상)
  - 보관함 빈 상태 (`[data-studio-empty-state="archived"]`): `1` (노출 및 내 작업/새 작업 이동 링크 정상)
  - 휴지통 빈 상태 (`[data-studio-empty-state="trash"]`): `1` (노출 및 내 작업/백업 파일 열기 링크 정상)

---

## 4. 자동화 테스트·린트·독립 감사 결과

1. **Vitest 단위·회귀·계약 테스트**:
   - `StudioProjectLibraryPage.test.tsx` (15 tests) — **PASS**
   - `StudioCreatorLobby.test.tsx` (10 tests) — **PASS**
   - `StudioVisualIdentity.contract.test.ts` (3 tests) — **PASS**
   - `studio-creator-lobby-layout.contract.test.ts` (7 tests) — **PASS**
   - `StudioFrontDoorPages.contract.test.ts` (8 tests) — **PASS**
   - `StudioQuickStart.test.tsx` (6 tests) — **PASS**
   - `StudioVisualGuidance.test.tsx` (3 tests) — **PASS**
   - `StudioCreatorLobbyRole.test.tsx` (2 tests) — **PASS**
   - `StudioWorkspaceRecentWorks.test.tsx` (7 tests) — **PASS**
   - `useStudioProjectThumbnailUrl.test.tsx` (4 tests) — **PASS**
   - `useStudioProjectLibrary.test.tsx` (9 tests) — **PASS**
   - `StudioTaskFlow.contract.test.ts` (5 tests) — **PASS**
   - 총 **12개 테스트 파일, 79개 테스트 전수 통과**.
2. **ESLint (`--max-warnings=0`)**:
   - 수정된 모든 `.ts`/`.tsx` 파일 대상 경고 `0건`, 오류 `0건` 통과.
3. **독립 서브에이전트 감사 (Independent Verification Audit)**:
   - 소유권 경계 준수(타 도메인/공통 파일 수정 0건), 800줄 제한 준수(최대 775줄), 금지 패턴(`as any`, `@ts-ignore`, `eslint-disable`) 0건, 기능·시각 요구사항 5대 항목 충족 독립 확인 완료.
