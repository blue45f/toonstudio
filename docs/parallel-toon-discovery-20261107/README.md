# ToonStudio 작품/콘텐츠 탐색 페이지 UI 개선 검증 보고서 (`parallel-toon-discovery-20261107`)

- **작성일**: 2026-11-07
- **작업 브랜치**: `feat/toon-discovery-ui-20261107`
- **소유 경계**: `apps/web/src/domains/catalog/**` (탐색 페이지 로컬 UI) 및 `docs/parallel-toon-discovery-20261107/**` (검증 증거)
- **비소유/불변 보장 영역**:
  - `data/**`, `apps/api/data/**`, `scripts/crawl*` (데이터·크롤러 변경 없음)
  - `apps/web/src/domains/catalog/DiscoverHomePreview.tsx` 및 프로젝트/마케팅 홈 (변경 없음)
  - `apps/web/src/shared/lib/store.ts`, 공유 라우터(`AppRouter.tsx`), 전역 테마·설정·공통 컴포넌트 (변경 없음)
  - 신규 외부 API 호출 없음 (`public/data/*.json` 로컬 크롤링 정적 스냅샷 기반 동작 우선)

---

## 1. 핵심 개선 사항 요약

### 1.1 간격(Spacing) 및 모바일/200% 확대 레이아웃 안정화
- **탐색 허브 (`/discover`)**:
  - `DiscoverHubPage.tsx` 및 `discover-hub-layout.css`: 히어로와 작품 레일 간 상단 간격을 `1.125rem`으로 정돈하고, 데스크톱 히어로 그리드 간격을 `1.5rem`으로 조정했습니다. `359px` 이하 초소형 뷰포트 및 `200%` 확대 시 검색 폼(`.discover-hub-search-form`)이 1열로 자연스럽게 줄바꿈되도록 미디어 쿼리를 보강했습니다.
  - `DiscoverShelves.tsx`: 레일 섹션 간 수직 간격을 과도한 `gap-12 sm:gap-14`에서 `gap-8 sm:gap-10`으로 조정하여 스크롤 피로를 줄이고 상하 리듬을 맞췄습니다.
  - `DiscoverSpotlight.tsx`: `320px` 모바일 및 `200%` 확대 환경에서 대표 작품 카드 패딩·간격(`gap-3.5 p-3.5 min-[360px]:gap-4 min-[360px]:p-4 sm:gap-5 sm:p-5`)과 포스터 폭(`w-24 min-[360px]:w-28 sm:w-36`)을 반응형으로 세분화했습니다.
- **조건 탐색 (`/explore`)**:
  - `explore-page-layout.css`: 모바일(`max-width: 639px`)에서 툴바 내 결과 내 검색창(`.explore-page-local-search`)이 전체 폭(`min-width: 100%`)을 확보하도록 구성했습니다.
- **통합 검색 (`/search`)**:
  - `search-page-layout.css`: 보조 도구 디스클로저(`summary.search-page-tools-summary`)에 `flex-wrap: wrap; min-width: 0; gap: 0.5rem 0.75rem;`를 부여해 `320px` 및 `200%` 확대에서도 가로 넘침(`0px`)을 보장했습니다.

### 1.2 검색(Search) — 외부 API 없는 로컬 크롤링 데이터 즉시 탐색
- **`local-catalog-fallback.ts`**:
  - `filterTitlesByLocalQuery`: 로컬 크롤링 `Title` 배열에서 외부 네트워크 요청 없이 `title`, `altTitles`, `author`, `artist`, `genres`, `tags`, `synopsis`를 NFC 정규화 + 다중 토큰 AND 매칭으로 즉시 필터링합니다.
  - `collectDiscoverLocalMatches`: `/discover`에 이미 로드된 `/data/home.json` 스냅샷에서 검색어와 일치하는 작품·장르·태그를 즉시 추출합니다.
  - `useLocalCatalogFallback`: 백엔드 API 미기동 또는 일시 지연 시 `/data/home.json`, `/data/catalog/00.json`, `/data/tags.json`, `/data/authors.json` 등 로컬 크롤링 정적 자산으로 자동 폴백하여 오프라인/정적 환경에서도 탐색 화면이 즉시 동작하도록 보장합니다(단위 테스트 `jsdom`의 동기 오류/로딩 상태 계약은 그대로 유지).
- **`ExplorePage.tsx`**:
  - 결과 툴바에 `결과 내 제목·작가·태그 필터`(`role="search"`, `<input type="search">`, `44px` 터치 타깃, 지우기 `X` 버튼 포함)를 추가하여 현재 조건 탐색 결과를 로컬에서 즉시 좁혀볼 수 있습니다.
- **`DiscoverHubPage.tsx`**:
  - 검색창 입력 시 로컬 스냅샷 기반 즉시 일치 프리뷰(`data-testid="discover-local-matches"`)와 검색어 지우기(`X`) 버튼을 제공합니다.
- **`AuthorsPage.tsx` & `AuthorPage.tsx`**:
  - `AuthorsPage`: 작가 이름뿐 아니라 주요 장르(`topGenres`)로도 로컬 검색이 가능하며, 검색어 지우기 버튼을 추가했습니다.
  - `AuthorPage`: 다작 작가(작품 5편 이상) 상세 화면에서 로컬 작품 필터 입력창을 제공합니다.

### 1.3 카드 밀도(Card Density) 및 가로 레일 폭 고정
- **`ExplorePage.tsx` & `explore-page-layout.css`**:
  - 결과 툴바에 카드 밀도 토글(`role="group" aria-label="카드 밀도"`, `표준`/`조밀`)을 추가했습니다.
  - `조밀`(`data-density="compact"`) 선택 시 `TitleCard`에 `size="sm"`과 `explore-card-compact` 클래스를 전달하고, CSS(`.explore-page-results[data-density="compact"] > div.grid`)를 통해 그리드 간격 축소(`0.625rem`/`0.75rem`), `xl` 6열 배치(`repeat(6, minmax(0, 1fr))`), 줄거리 2줄 요약 숨김을 적용하여 한 화면에서 더 많은 작품을 훑어볼 수 있습니다.
  - 전역 레이아웃 토큰 계약(`COVER_GRID` 문자열 2회 유지)을 100% 준수합니다.
- **`DiscoverShelves.tsx` & `DiscoverRecentShelf.tsx`**:
  - 가로 스크롤 `<Rail>` 내부의 `TitleCard`에 `size="sm" className="w-[150px] shrink-0 sm:w-[172px]"`를 지정하여 모바일 flex 컨테이너 안에서 카드가 찌그러지지 않고 일정한 밀도를 유지하도록 수정했습니다.
- **`ExploreVirtualGrid.tsx` & `AuthorPage.tsx` & `AuthorsPage.tsx`**:
  - `ExploreVirtualGrid`와 `AuthorPage` 작품 그리드에 `grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5` 반응형 열 밀도를 정합시켰고, `AuthorsPage`는 `<Container size="wide">`와 `xl:grid-cols-4` 및 초기 120명 렌더링 상한을 적용해 대량 로컬 데이터에서도 쾌적한 밀도를 유지합니다.

### 1.4 이미지 Fallback (깨진 일러스트·표지·아바타 방어)
- **`ExplorePage.tsx`**:
  - 빈 결과 안내 이미지(`<img src="/images/empty-generic.webp" />`)에 `onError` 및 초기 `complete && naturalWidth === 0` 감지 `ref`를 연결하여, 이미지 실패 시 깨진 아이콘을 숨기고 토큰 기반 안내 배지(`data-testid="explore-empty-art-fallback"`)를 노출합니다.
- **`DiscoverHubPage.tsx` & `DiscoverSpotlight.tsx`**:
  - 연재 트랙 스위처 및 탐색 도구 카드의 안내 일러스트에 `DiscoverCardArt` 컴포넌트(`data-testid="discover-art-fallback"`)를 적용해 이미지 로드 실패 시 트랙/도구 라벨 배지로 우아하게 대체합니다. 또한 `/calendar` 카드가 `/explore`와 동일한 이미지를 중복 사용하지 않도록 고유 아트워크를 매핑했습니다.
  - `DiscoverSpotlight`의 배경 장식 `<CoverImage>`에 명시적 `fallback` 블록을 추가했습니다.
- **`SearchPage.tsx`**:
  - 검색 보조 도구 요약부의 일러스트(`blank-canvas.webp`) 로드 실패 시 `data-fallback-active="true"` 전환과 함께 토큰 배지(`data-testid="search-tools-art-fallback"`)를 렌더링합니다(기존 DOM 계약 테스트 호환 유지).
- **`AuthorsPage.tsx`**:
  - 작가 대표 표지를 원시 `<img>` 대신 `<CoverImage>`와 작가 이니셜 그라디언트 폴백(`data-testid="author-avatar-fallback"`)으로 교체하여 표지 URL 누락·오류 시에도 깨진 이미지가 노출되지 않습니다.

---

## 2. 변경 파일 목록 (탐색 로컬 도메인 15개 파일)

| 파일 경로 | 구분 | 요약 |
| --- | --- | --- |
| `apps/web/src/domains/catalog/local-catalog-fallback.ts` | 신규 | 로컬 크롤링 정적 스냅샷 폴백 훅 및 무네트워크 다중 토큰 검색/프리뷰 유틸리티 |
| `apps/web/src/domains/catalog/ExplorePage.tsx` | 수정 | 결과 내 로컬 검색창, 표준/조밀 카드 밀도 토글, 빈 상태 이미지 에러 폴백, 로컬 카탈로그 폴백 연결 |
| `apps/web/src/domains/catalog/explore-page-layout.css` | 수정 | `data-density="compact"` 그리드·카드 스타일 및 모바일 검색창 폭 규칙 추가 (hex 색상 0건) |
| `apps/web/src/domains/catalog/ExploreVirtualGrid.tsx` | 수정 | 반응형 2~5열 그리드 밀도 및 행 높이 추정치 정합 |
| `apps/web/src/domains/catalog/DiscoverHubPage.tsx` | 수정 | 로컬 스냅샷 즉시 검색 프리뷰, 검색어 지우기 버튼, 트랙/카드 아트워크 에러 폴백(`DiscoverCardArt`) |
| `apps/web/src/domains/catalog/discover-hub-layout.css` | 수정 | 히어로·레일 간격 조정 및 `359px` 이하 검색 폼 1열 줄바꿈 대응 |
| `apps/web/src/domains/catalog/DiscoverShelves.tsx` | 수정 | 레일 간 수직 간격 조정(`gap-8 sm:gap-10`) 및 레일 내 `TitleCard` 폭(`w-[150px] shrink-0 sm:w-[172px]`) 고정 |
| `apps/web/src/domains/catalog/DiscoverRecentShelf.tsx` | 수정 | 로컬 카탈로그 폴백 연결 및 레일 내 `TitleCard` 폭 고정 |
| `apps/web/src/domains/catalog/DiscoverSpotlight.tsx` | 수정 | 배경 `CoverImage` 명시적 폴백 및 `320px` 뷰포트 패딩·포스터 폭 최적화 |
| `apps/web/src/domains/catalog/SearchPage.tsx` | 수정 | 보조 도구 안내 일러스트 로드 실패 시 폴백 배지(`search-tools-art-fallback`) 제공 |
| `apps/web/src/domains/catalog/search-page-layout.css` | 수정 | 보조 도구 요약 헤더 줄바꿈(`flex-wrap`) 및 간격 보강 (`animation`/`transition` 0건 유지) |
| `apps/web/src/domains/catalog/AuthorsPage.tsx` | 수정 | `<CoverImage>` + 작가 이니셜 폴백(`author-avatar-fallback`), 장르/이름 검색, `wide` 컨테이너 4열 그리드 |
| `apps/web/src/domains/catalog/AuthorPage.tsx` | 수정 | 로컬 카탈로그 폴백, 5열 반응형 작품 그리드, 다작 작가 작품 내 로컬 필터 |
| `apps/web/src/domains/catalog/TagsPage.tsx` | 수정 | 로컬 카탈로그 폴백 연결 |
| `apps/web/src/domains/catalog/discovery-ui-improvements.test.tsx` | 신규 | 로컬 검색, 카드 밀도 토글, 레일 카드 밀도, 이미지 에러 폴백 통합 회귀 테스트 (4개 시나리오) |

---

## 3. 다이나믹 병렬 검증 결과 (구현 / 독립 검증 분리)

### 3.1 독립 검증 서브에이전트 감사 (`f6b7a2229904348f214a1ed63af7dbbe`)
- **역할**: `Independent Discovery UI Auditor` (`research` 서브에이전트, 읽기 전용 독립 컨텍스트)
- **검증 항목 및 판정**:
  - 소유 경계 준수(`apps/web/src/domains/catalog/*` 외 변경 0건): **PASS**
  - 외부 API 무의존 및 로컬 크롤링 데이터 우선 동작: **PASS**
  - 간격·검색·카드 밀도·이미지 fallback 4대 요구사항 충족: **PASS**
  - 기존 레이아웃·토큰 계약(`COVER_GRID` 2회, `explore-page-layout.css` hex 0건, `search-page-layout.css` 모션 속성 0건, `#discover-track-panel` 링크 순서 보존): **PASS**

### 3.2 단위·기능회귀·레이아웃·계약 테스트 및 정적 분석
- **TypeScript (`tsc --noEmit`)**: `apps/web/src/domains/catalog/**` 대상 타입 검사 **0 errors (PASS)**
- **ESLint (`eslint`)**: 수정/신규 12개 `.ts`/`.tsx` 파일 검사 **0 errors, 0 warnings (PASS)**
- **Vitest 테스트 스위트**:
  - `apps/web/src/domains/catalog/discovery-ui-improvements.test.tsx` (4 tests) — **PASS**
  - `apps/web/src/domains/catalog/ExplorePage.layout.test.tsx` (16 tests) — **PASS**
  - `apps/web/src/domains/catalog/DiscoverHubPage.layout.test.tsx` (11 tests) — **PASS**
  - `apps/web/src/domains/catalog/DiscoverHubPage.test.tsx` (9 tests) — **PASS**
  - `apps/web/src/domains/catalog/SearchPage.layout.test.tsx` (7 tests) — **PASS**
  - `apps/web/src/domains/catalog/DiscoverSpotlight.test.tsx` (3 tests) — **PASS**
  - `apps/web/src/domains/catalog/DiscoverRecentShelf.test.tsx` (4 tests) — **PASS**
  - `apps/web/src/domains/catalog/TagsPage.test.tsx` (2 tests) — **PASS**
  - `apps/web/src/domains/catalog/SearchPage.navigation.test.tsx` & `SearchPage.fragment-navigation.test.tsx` — **PASS**
  - `apps/web/src/shared/components/sitewide-spacing.contract.test.ts` — **PASS**

### 3.3 실제 Chromium 브라우저 다중 뷰포트(320 / 390 / 768 / 1440 / 200% 확대) 실측 결과
Playwright + Chromium(`/usr/bin/chromium`)으로 실제 Vite 서버(`http://127.0.0.1:4179`)에서 5개 탐색 경로 × 6개 뷰포트/확대 조건(총 30개 케이스)을 실측했습니다.

| 경로 (`route`) | 뷰포트 (`320` / `390` / `768` / `1440` / `1440@200%` / `320@200%`) | 가로 넘침 (`horizontalOverflow`) | 깨진 노출 이미지 (`brokenRawImgs`) | 렌더링 카드/항목 수 (`cardCount`) | 확인된 제목 (`h1`) |
| --- | --- | --- | --- | --- | --- |
| `/discover` | 6개 전 뷰포트 모두 통과 | `0px` | `0` | `43` | `새로운 이야기를 발견하세요` |
| `/explore` | 6개 전 뷰포트 모두 통과 | `0px` | `0` | `40` | `조건으로 작품 찾기` |
| `/search?q=판타지` | 6개 전 뷰포트 모두 통과 | `0px` | `0` | `0` (도구 패널) | `작품을 바로 찾는 작업공간` |
| `/authors` | 6개 전 뷰포트 모두 통과 | `0px` | `0` | `120` | `작가별 보기` |
| `/tags` | 6개 전 뷰포트 모두 통과 | `0px` | `0` | `120` | `태그로 작품 찾기` |

#### 브라우저 상호작용 검증 (`interactionChecks`)
- `/explore` 초기 로컬 카탈로그 카드 렌더링: `initialExploreCards = 40`
- `/explore` 카드 밀도 `조밀` 버튼 클릭 시 `data-density="compact"` 및 `.explore-card-compact` 적용: `compactDensityAttr = "compact"`, `compactCardClassApplied = true`
- `/explore` 결과 내 검색(`"판타지"`) 즉시 필터링 동작: `filteredExploreCards = 5`
- `/explore` 빈 결과 이미지 에러 발생 시 대체 배지 노출: `exploreFallbackVisible = true`
- `/discover` 가로 레일 카드 `shrink-0` 폭 고정 적용: `railCardHasShrink0 = true`
- `/discover` 검색창 입력 시 로컬 스냅샷 즉시 일치 프리뷰 노출: `discoverLocalMatchesVisible = true`
