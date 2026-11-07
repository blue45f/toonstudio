# Round 8 — MySpace (`/my`) 모바일 첫 화면 주요 행동 가시성 및 단계적 공개 개선 증거 (`docs/my-first-action-round8-20261107`)

## 1. 개요 및 이전 Round 7 원격 `origin/main` 반영 확인

- **이전 Round 7 커밋 반영 확인**:
  - Round 7 구현 커밋: `ecc103605d80ad00dd8bb294b911e781450c4386`
  - Round 7 `origin/main` 병합 커밋: `3698e5162db8d20afefe15c15994dd9e2d7fa777`
  - 검증 명령: `git merge-base --is-ancestor ecc103605d80ad00dd8bb294b911e781450c4386 origin/main` → **PASS (`true`)**
- **소유 범위 준수**:
  - 코드 수정은 오직 [`MySpaceHubPage.tsx`](../../apps/web/src/domains/account/MySpaceHubPage.tsx) (661줄, `< 800`줄) 및 직접 단위 테스트 [`MySpaceHubPage.test.tsx`](../../apps/web/src/domains/account/MySpaceHubPage.test.tsx) (317줄, `< 800`줄)에만 국한되었습니다.
  - `App.tsx`, 공유 스토어/스키마/라우트/전역 CSS, `StudioSpatialReaderPage.tsx`, Home 프로젝트 라이브러리, Pricing, About, 메시지함 등 타 담당 및 공유 파일은 일절 수정하지 않았습니다.

---

## 2. 문제 원인 및 단계적 공개(Progressive Disclosure) 해결 요약

### 2.1 Round 7 기준 지연 원인
Round 7(`ecc10360`)에서는 상시 검색창을 접었으나, 모바일 `320×844` / `390×844` 뷰포트에서 주요 행동 섹션(`data-my-space-next-action="true"`) 위에 아래 블록들이 상시 적재되어 있었습니다.
1. `SiteContextualSubNav` (~160px)
2. `SitePageHeader size="hero"` + 긴 본문 설명 + 브라우저 저장 안내 박스 (~380px)
3. `SiteArtSurfaceSpotlight` 대형 아트워크 배너 (~850px)
4. 최근 작업 카드 내부에서도 긴 설명·경로·단계 칩이 CTA 버튼 위에 배치되어 첫 주요 행동이 `320px`에서 **`Y = 2004~2233px`**, `390px`에서 **`Y = 1707~2015px`**에 위치했고, 목적지 카드(`#my-space-destinations`)는 `data-my-space-activity-summary`, `빠른 확인`, `FriendlyQuickGuide` 뒤에 밀려 **`Y = 2853~3338px` (`320px`) / `Y = 2468~2912px` (`390px`)**에서 시작되었습니다.

### 2.2 Round 8 단계적 공개(Progressive Disclosure) 및 터치 검색 개선
기능·경로·데이터를 단 하나도 삭제하지 않고 기존 14개 바로가기, 3개 빠른 확인 링크, 최근 작업 복귀/빈 상태 경로를 모두 보존하면서 화면 상단 우선순위를 재구성했습니다.
1. **컴팩트 헤더 전환**: `<Container className="py-2 sm:py-6 lg:py-8">` 및 `<SitePageHeader size="default" surface="plain">`을 적용하여 상단 여백을 압축했습니다.
2. **첫 주요 행동 최상단 배치 (`data-my-space-next-action="true"`)**:
   - 헤더 바로 아래(`mt-2.5`)에 배치했습니다.
   - **최근 작업/이어 읽기 상태(`recent`)**: 제목(`<h2>`) 바로 아래에 주요 행동 CTA(`data-testid="my-space-primary-action"`, `이어서 작업`/`이어서 보기` 및 `모든 프로젝트`)를 배치하고(데스크톱 `lg:row-span-2` 우측 정렬), 긴 설명·경로·단계 칩은 CTA 아래에 배치하여 200자 이상의 초장문 제목/설명에서도 주요 행동 CTA의 Y 좌표가 밀리지 않도록 고정했습니다.
   - **빈 데이터 상태(`!recent`)**: `<ActionableEmptyState art="none">` 및 모바일 컴팩트 패딩을 적용해 `첫 프로젝트 만들기` CTA(`data-testid="my-space-primary-action"`)가 첫 화면 중앙에 즉시 노출되도록 개선했습니다.
3. **내 공간 바로가기 섹션(`#my-space-destinations`) 직결 배치**:
   - 주요 행동 섹션 바로 다음(`mt-3.5`)에 목적지 그리드와 역할 필터 칩(`전체` / `창작·스튜디오` / `읽기·발견` / `계정·지원`)을 배치하여 `320×844` 및 `390×844` 첫 화면 하단(`Y = 733~828px`)에서 첫 목적지 카드가 바로 시작되도록 단축했습니다.
4. **터치 사용자용 검색 진입점 (`data-testid="my-space-search-toggle"`)**:
   - 기존 키보드 `/` 단축키를 유지하면서, 역할 필터 그룹 옆에 `44×44px` 이상(`min-h-11 min-w-11`, `[min-block-size:2.75rem]! [min-inline-size:2.75rem]!`)의 작고 명확한 `검색` 토글 버튼을 추가했습니다.
   - 터치 1회 탭(`clicksToTouchSearch = 1`)으로 검색창(`id="my-space-destination-search"`)이 열리며 즉시 포커스되고, 다시 탭하거나 `초기화`/`Escape` 시 닫히고 필터가 복원됩니다.
5. **보조 목록 하단 배치 및 장식·안내 블록 단계적 공개 (`<details data-testid="my-space-more-details">`)**:
   - 활동 요약(`data-my-space-activity-summary`), 빠른 확인(`/notifications`, `/learn`, `/market/library`), 빠른 시작 가이드(`FriendlyQuickGuide`)는 목적지 그리드 아래로 이동했습니다.
   - 페이지 상세 안내(`copy.body`), 기기 저장 안내(`syncCopy`), 보조 탐색(`SiteContextualSubNav`), 시각 스포트라이트(`SiteArtSurfaceSpotlight`)는 기본 접힘 상태인 `<details data-testid="my-space-more-details">` 내부에 보존하여 필요할 때 1회 탭으로 펼쳐볼 수 있게 했습니다.

---

## 3. 시나리오·뷰포트별 전후(Before vs After) 실측 비교

> 전체 원본 JSON 데이터: [`before-round7-baseline.json`](./before-round7-baseline.json), [`browser-verification.json`](./browser-verification.json)

### 3.1 모바일 `320×844` 및 `390×844` 전후 비교 (첫 주요 행동 Y · 첫 목적지 카드 Y · 클릭 수)

| 시나리오 | 뷰포트 | Before 주요 행동 Top..Bottom (px) | After 주요 행동 Top..Bottom (px) | 첫 화면(`≤844px`) 가시성 (Before → After) | Before 첫 목적지 카드 Y (px) | After 첫 목적지 카드 Y (px) | 주요 행동 클릭 수 | 역할 필터 목적지 클릭 수 | 터치 검색 열기 클릭 수 | 가로 오버플로 (px) | 44×44px 터치 타깃 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **빈 데이터 (`empty-ko`)** | `320×844` | `2132..2176` | **`461..505`** (`-1671px`) | `false` → **`true`** | `3101` | **`828`** (`-2273px`) | `1` | `2` | `1` | `0` | `true` |
| **빈 데이터 (`empty-ko`)** | `390×844` | `1851..1895` | **`425..469`** (`-1426px`) | `false` → **`true`** | `2660` | **`740`** (`-1920px`) | `1` | `2` | `1` | `0` | `true` |
| **창작 역할 (`creator-recent-ko`)** | `320×844` | `2004..2048` | **`452..496`** (`-1552px`) | `false` → **`true`** | `2873` | **`793`** (`-2080px`) | `1` | `2` | `1` | `0` | `true` |
| **창작 역할 (`creator-recent-ko`)** | `390×844` | `1727..1771` | **`407..451`** (`-1320px`) | `false` → **`true`** | `2488` | **`749`** (`-1739px`) | `1` | `2` | `1` | `0` | `true` |
| **읽기 역할 (`reader-recent-ko`)** | `320×844` | `1984..2028` | **`452..496`** (`-1532px`) | `false` → **`true`** | `2853` | **`777`** (`-2076px`) | `1` | `2` | `1` | `0` | `true` |
| **읽기 역할 (`reader-recent-ko`)** | `390×844` | `1707..1751` | **`407..451`** (`-1300px`) | `false` → **`true`** | `2468` | **`733`** (`-1735px`) | `1` | `2` | `1` | `0` | `true` |
| **긴 한·영 제목 (`long-title-ko`)** | `320×844` | `2004..2048` | **`452..496`** (`-1552px`) | `false` → **`true`** | `2873` | **`793`** (`-2080px`) | `1` | `2` | `1` | `0` | `true` |
| **긴 한·영 제목 (`long-title-ko`)** | `390×844` | `1727..1771` | **`407..451`** (`-1320px`) | `false` → **`true`** | `2488` | **`749`** (`-1739px`) | `1` | `2` | `1` | `0` | `true` |
| **영문 로케일 (`en-locale`)** | `320×844` | `2233..2277` | **`510..554`** (`-1723px`) | `false` → **`true`** | `3338` | **`868`** (`-2470px`) | `1` | `2` | `1` | `0` | `true` |
| **영문 로케일 (`en-locale`)** | `390×844` | `2015..2059` | **`427..471`** (`-1588px`) | `false` → **`true`** | `2912` | **`769`** (`-2143px`) | `1` | `2` | `1` | `0` | `true` |

### 3.2 태블릿(`768×1024`), 데스크톱(`1440×900`), 200% 확대(`pc-1440-zoom-200` 및 `reflow-720-equiv200`) 비교

| 시나리오 | 뷰포트 | Before 주요 행동 Top..Bottom (px) | After 주요 행동 Top..Bottom (px) | Before 첫 목적지 카드 Y (px) | After 첫 목적지 카드 Y (px) | 가로 오버플로 (px) | 44×44px 터치 타깃 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **창작 역할 (`creator-recent-ko`)** | `768×1024` (`tablet-768`) | `1508..1552` (`in1st: false`) | **`450..494`** (`in1st: true`) | `2071` | **`690`** | `0` | `true` |
| **창작 역할 (`creator-recent-ko`)** | `1440×900` (`pc-1440`) | `1168..1212` (`in1st: false`) | **`592..636`** (`in1st: true`) | `1685` | **`789`** | `0` | `true` |
| **빈 데이터 (`empty-ko`)** | `720×450` (`reflow-720-equiv200`) | `1498..1542` | **`432..476`** (`-1066px`) | `1967` | **`569`** (`-1398px`) | `0` | `true` |
| **창작 역할 (`creator-recent-ko`)** | `720×450` (`reflow-720-equiv200`) | `1417..1461` | **`417..461`** (`-1000px`) | `1888` | **`621`** (`-1267px`) | `0` | `true` |
| **읽기 역할 (`reader-recent-ko`)** | `720×450` (`reflow-720-equiv200`) | `1417..1461` | **`417..461`** (`-1000px`) | `1888` | **`621`** (`-1267px`) | `0` | `true` |
| **긴 한·영 제목 (`long-title-ko`)** | `720×450` (`reflow-720-equiv200`) | `1417..1461` | **`417..461`** (`-1000px`) | `1888` | **`621`** (`-1267px`) | `0` | `true` |
| **영문 로케일 (`en-locale`)** | `720×450` (`reflow-720-equiv200`) | `1631..1675` | **`437..481`** (`-1194px`) | `2174` | **`677`** (`-1497px`) | `0` | `true` |
| **빈 데이터 (`empty-ko`)** | `1440×900` CSS `zoom:200%` | `9917..10005` | **`1926..2014`** (`-7991px`) | `11675` | **`2496`** (`-9179px`) | `0` | `true` |
| **창작 역할 (`creator-recent-ko`)** | `1440×900` CSS `zoom:200%` | `9397..9485` | **`1818..1906`** (`-7579px`) | `11307` | **`2451`** (`-8856px`) | `0` | `true` |
| **읽기 역할 (`reader-recent-ko`)** | `1440×900` CSS `zoom:200%` | `9377..9465` | **`1774..1862`** (`-7603px`) | `11267` | **`2363`** (`-8904px`) | `0` | `true` |
| **긴 한·영 제목 (`long-title-ko`)** | `1440×900` CSS `zoom:200%` | `9397..9485` | **`1818..1906`** (`-7579px`) | `11307` | **`2451`** (`-8856px`) | `0` | `true` |
| **영문 로케일 (`en-locale`)** | `1440×900` CSS `zoom:200%` | `18305..18393` | **`3049..3137`** (`-15256px`) | `22314` | **`3714`** (`-18600px`) | `0` | `true` |

### 3.3 인터랙션 플로우 검증 결과
- **터치 검색 플로우 (`touchSearchFlow`)**:
  - `tappedToggleOpenedInput: true` (`data-testid="my-space-search-toggle"` 1회 탭 시 검색 입력 노출)
  - `searchFocusedOnTouch: true` (열림과 동시에 입력 포커스)
  - `filteredStatusText: "창작·스튜디오 · 1 / 14"` (역할 필터 + 검색어 조합 정상 동작)
  - `searchClosedOnSecondTap: true` (재탭 시 검색 닫힘 및 전체 목록 복원)
  - 스크린샷: [`after-touch-search-open-mobile-320.png`](./screenshots/after-touch-search-open-mobile-320.png)
- **단계적 공개 상세 접기/펼치기 (`progressiveDisclosureFlow`)**:
  - `defaultOpen: false` (초기 진입 시 접힘 상태)
  - `openedOnSummaryTap: true` (요약 헤더 1회 탭 시 안내·보조 탐색·시각 스포트라이트 정상 펼침)
- **콘솔/페이지 런타임 오류**: `pageErrors: []` (0건)

---

## 4. 전후(Before / After) 스크린샷 증거 목록

- **빈 데이터 (`empty-ko`)**:
  - `320×844`: [Before](./screenshots/before-empty-ko-mobile-320.png) → [After](./screenshots/after-empty-ko-mobile-320.png)
  - `390×844`: [Before](./screenshots/before-empty-ko-mobile-390.png) → [After](./screenshots/after-empty-ko-mobile-390.png)
- **창작 역할 (`creator-recent-ko`)**:
  - `320×844`: [Before](./screenshots/before-creator-recent-ko-mobile-320.png) → [After](./screenshots/after-creator-recent-ko-mobile-320.png)
  - `390×844`: [Before](./screenshots/before-creator-recent-ko-mobile-390.png) → [After](./screenshots/after-creator-recent-ko-mobile-390.png)
  - `200% 확대`: [Before zoom 200%](./screenshots/before-creator-recent-ko-pc-1440-zoom-200.png) → [After zoom 200%](./screenshots/after-creator-recent-ko-pc-1440-zoom-200.png)
- **읽기 역할 (`reader-recent-ko`)**:
  - `320×844`: [Before](./screenshots/before-reader-recent-ko-mobile-320.png) → [After](./screenshots/after-reader-recent-ko-mobile-320.png)
  - `390×844`: [Before](./screenshots/before-reader-recent-ko-mobile-390.png) → [After](./screenshots/after-reader-recent-ko-mobile-390.png)
- **긴 한·영 제목 (`long-title-ko`)**:
  - `320×844`: [Before](./screenshots/before-long-title-ko-mobile-320.png) → [After](./screenshots/after-long-title-ko-mobile-320.png)
  - `390×844`: [Before](./screenshots/before-long-title-ko-mobile-390.png) → [After](./screenshots/after-long-title-ko-mobile-390.png)
- **영문 로케일 (`en-locale`)**:
  - `320×844`: [Before](./screenshots/before-en-locale-mobile-320.png) → [After](./screenshots/after-en-locale-mobile-320.png)
  - `390×844`: [Before](./screenshots/before-en-locale-mobile-390.png) → [After](./screenshots/after-en-locale-mobile-390.png)
- **터치 검색 오픈 상태 (`touch-search`)**:
  - `320×844`: [After Touch Search Open](./screenshots/after-touch-search-open-mobile-320.png)

---

## 5. 품질 게이트 및 독립 감사 결과

- **단위 테스트 (`vitest`)**: `pnpm exec vitest run --pool=forks --maxWorkers=1 apps/web/src/domains/account/MySpaceHubPage.test.tsx` → **8 passed (8)**
- **타입 검사 (`TypeScript`)**: `MySpaceHubPage.tsx` 및 `MySpaceHubPage.test.tsx` semantic diagnostics **0건**
- **변경 파일 린트 (`lint-changed.mjs`)**: `node scripts/lint-changed.mjs --base=origin/main` → **PASS**
- **소스 파일 800줄 제한 (`check-source-file-size.mjs`)**: `MySpaceHubPage.tsx` (661줄), `MySpaceHubPage.test.tsx` (317줄) → **PASS**
- **독립 서브에이전트 감사**: 소유 범위, 단계적 공개, 터치 검색 접근성, 800줄 제한 모두 **PASS**
