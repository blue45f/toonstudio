# ToonStudio 로컬 크롤링 카탈로그 오프라인·손상 데이터 복원력 및 계약 정합 검증 보고서 (`catalog-resilience-round2-20261107`)

- **작성일**: 2026-11-07
- **작업 브랜치**: `feat/catalog-resilience-round2-20261107`
- **통합 기준 커밋**: `c864b251` / `18c8a298` 포함 최신 `main` (`3363492c`)
- **소유 경계**:
  - `apps/web/src/domains/catalog/**` (탐색·카탈로그 로컬 UI 및 단위/통합 회귀 테스트)
  - `docs/catalog-resilience-round2-20261107/**` (Round 2 검증 증거 문서)
- **비소유/불변 보장 영역**:
  - `data/**`, `apps/api/data/**`, `apps/web/public/data/**`, `scripts/crawl*` (기존 수집 데이터·크롤러 불변)
  - `apps/web/src/shared/lib/store.ts` 및 공유 라우터·플랫폼 클라이언트 (불변)
  - 모든 실패 상황은 테스트 fixture 및 Playwright 네트워크 인터셉트(`page.route`)로만 주입

---

## 1. 통합 검증 결함(`TS2551` 및 `AuthorPage` `platforms` 계약 불일치) 수정

### 1.1 원인 분석
- **결함 위치**: `apps/web/src/domains/catalog/local-catalog-fallback.ts` (구 266행 `/api/authors/:name` 로컬 폴백 분기)
- **증상**:
  1. `(w.availability ?? []).map((a) => a.platform)`가 `packages/core/src/types.ts:45`의 `Availability` 인터페이스 계약(`readonly platformId: PlatformId`)과 불일치하여 `TS2551: Property 'platform' does not exist on type 'Availability'. Did you mean 'platformId'?` 타입 오류가 발생했습니다.
  2. 런타임에도 `a.platform`이 `undefined`로 평가되어 `/author/:name` 상세 폴백 응답의 `platforms` 배열에 `[undefined]`가 유입되고, `AuthorPage.tsx` 및 `AvailabilityDots`에서 플랫폼 배지 누락 또는 미등록 키 참조 오류를 유발할 수 있었습니다.
- **Round 1 임시 scoped 타입체크에서 누락되었던 이유**:
  - Round 1 당시 `/tmp/tsconfig.catalog.json`을 저장소 외부(`/tmp`)에 생성해 실행하면서 상대 경로 해석 차이로 인해 일부 공유 타입 계약 진단을 놓쳤습니다.
  - Round 2에서는 루트 `tsconfig.json`의 컴파일러 옵션을 그대로 로드하는 TypeScript Compiler API(`ts.createProgram`) 분할 검증을 구성하여, 8GB 컨테이너 OOM을 피하면서도(`RSS ~748 MB`) 수정 전 `TS2551`을 정확히 재현하고 수정 후 `0 diagnostics`를 검증했습니다. (※ 본 검증은 루트 `tsconfig.json` 옵션을 적용한 카탈로그 도메인 프로그램 검증이며, 8GB 힙 한계로 uVM에서 직접 완주할 수 없는 저장소 전체 샤드 타입체크 `typecheck-shards.mjs` 전체 통과로 과장하지 않고 구분하여 보고합니다.)

### 1.2 최소 보정 내용
- `normalizePlatformId(value: unknown): PlatformId | null` 도입:
  - `packages/core/src/platforms.ts`의 20개 유효 `PlatformId` 집합(`VALID_PLATFORM_IDS`) 및 레거시 축약 별칭(`"naver" -> "naver-webtoon"`, `"kakao" -> "kakao-page"`)만 허용하고, `undefined`/`null`/미등록 문자열(`"legacy"` 등)은 `null`로 걸러냅니다.
- `/api/authors/:name` 폴백(`resolveFromLocalStaticCatalog` 및 `sanitizeCatalogApiData`) 정합화:
  - `(w.availability ?? []).map((a) => normalizePlatformId(a?.platformId)).filter((id): id is PlatformId => id !== null)`로 `platforms: PlatformId[]`를 생성하여 `TS2551`을 해소하고 `undefined` 유입 가능성을 원천 차단했습니다.
  - `packages/core/src/catalog/author.ts` 및 `AuthorPage.tsx`의 응답 계약(`author: authorName`, `works`, `totalViews`, `totalLikes`, `avg`, `avgRating`, `genres`, `tags`, `platforms`, `generatedAt`, `source`)에 맞춰 필드를 정합화했습니다.

---

## 2. 8대 오프라인·손상 데이터·검색 회귀 시나리오 보강 요약

1. **API 연결 실패 및 재시도 복구 (`local-catalog-fallback.ts`)**:
   - `/api/*` 실패 시 `/data/home.json`, `/data/catalog/00.json`, `/data/tags.json`, `/data/authors.json`으로 즉시 폴백합니다.
   - 모든 정적 소스까지 동시에 실패한 완전 오프라인 상태(`anySourceLoaded === false`)에서는 빈 배열을 영구 캐시하지 않고 `null`을 반환하여 `ErrorState`(`재시도` 버튼)가 명확히 노출되게 했으며, `reload()` 호출 시 `resetLocalCatalogFallbackCache()`로 캐시를 비워 네트워크 복구 직후 정상 데이터를 다시 불러옵니다.
   - `SearchPage.tsx`에 `useInstallLocalSearchBridge()`를 연결해 브라우저에서 `/api/search` 또는 `/api/titles` 실패 시 공유 `SearchExplorer` 수정 없이 로컬 크롤링 풀로 응답합니다.
2. **빈 카탈로그 상태 및 복구 동선 (`ExplorePage.tsx`, `DiscoverShelves.tsx`, `AuthorsPage.tsx`, `AuthorPage.tsx`, `TagsPage.tsx`)**:
   - `/explore`에서 필터 없이 결과가 0건인 빈 카탈로그 상태일 때 `"다시 시도"`(`reload`) 버튼과 `"작품 탐색 허브로 이동"`(`/discover`) 링크를 제공합니다.
   - `/discover`에서 모든 추천 레일이 비어 있을 때 `data-testid="discover-shelves-empty"` 안내 블록과 `"다시 시도"` 버튼 및 `/explore` 이동 링크를 노출합니다.
   - `/authors`, `/tags`, `/author/:name`에서도 빈 카탈로그 `"다시 시도"` 버튼 및 참여작 내 검색 결과 없음(`data-testid="author-works-search-empty"`, `"참여작 검색 초기화"`) 복구 동선을 보장합니다.
3. **JSON 일부 누락·손상 방어 (`local-catalog-fallback.ts`, `discover-home.ts`, `discover-shelf-copy.ts`, `DiscoverSpotlight.tsx`, `DiscoverHubPage.tsx`)**:
   - `sanitizeTitleRecord`, `sanitizeDiscoverHomeSnapshot`, `sanitizeCatalogApiData`를 통해 배열 내 `null`/`{}` 원소, 누락된 `stats`/`genres`/`tags`/`cover`/`availability`, 비정상 숫자(`NaN`, 음수)를 안전하게 기본값으로 정규화합니다.
   - 특히 손상된 `availability` 항목에서 `PLATFORMS` 사전에 없는 플랫폼 ID가 유입되어 `AvailabilityDots`가 `TypeError: Cannot read properties of undefined (reading 'name')`로 크래시하는 경로를 `normalizePlatformId`로 차단했습니다.
4. **이미지 404 폴백 (`DiscoverHubPage.tsx`, `ExplorePage.tsx`, `SearchPage.tsx`, `AuthorsPage.tsx`, `TagsPage.tsx`)**:
   - 포스터(`CoverImage`), 탐색 허브 카드(`discover-art-fallback`), 조건 탐색 빈 결과 일러스트(`explore-empty-art-fallback`), 통합 검색 도구 일러스트(`search-tools-art-fallback`), 작가 아바타(`author-avatar-fallback`)에 더해 `AuthorsPage`·`TagsPage` 헤더의 `<SectionArt>` 이미지 404 시 `data-testid="catalog-section-art-fallback"` 배지로 전환되도록 보강했습니다.
5. **한글 2벌식 조합 중 검색 (`local-catalog-fallback.ts`, `tag-directory.ts`, `AuthorsPage.tsx`, `AuthorPage.tsx`)**:
   - `matchesHangulAwareQuery` 및 `decomposeHangulText`를 구현하여 초성 검색(`"ㅍ"`, `"ㅍㅌㅈ"`)뿐 아니라 한글 IME 조합 중간 단계(`"판ㅌ"`, `"판타ㅈ"`, `"달ㅂ"`, `"추ㄱ"`, `"회ㄱ"`)와 겹받침 전이 상태(`"닯"` → `"달빛..."`)까지 음절 경계 기준으로 정확히 매칭합니다.
   - `tag-directory.ts`에서 `NFKC` 정규화가 호환 자모(`ㄱ` `\u3131`)를 첫가끝 초성(`\u1100`)으로 변환해 조합 매칭을 방해하던 문제를 수정하여 원본 자모 토큰(`rawNeedle`)을 `matchesHangulAwareQuery`에 전달했습니다.
   - `/api/explore` 로컬 폴백이 결과를 상위 240편으로 조기 절단하여 전체 로컬 풀(3,815편) 내 작품(`'달빛세면소'` 등)이 결과 내 검색에서 누락되던 문제를 발견해, `results`에는 전체 매칭 풀(`matched`)을 반환하고 초기 DOM 렌더링만 `shown`(`40`편)으로 유지하도록 개선했습니다.
6. **빠른 검색 전환 및 불필요한 서버 재호출 방지 (`ExplorePage.tsx`)**:
   - 로컬 검색어(`q`) 입력 시 URL 쿼리는 `replace: true`로 동기화하되, 서버 `/api/explore` 요청 URL 생성 시에는 `q`를 제외하여 연속 타이핑 중 불필요한 API 재요청이나 이전 응답 역전(race condition)이 발생하지 않습니다.
7. **브라우저 뒤로가기/앞으로가기 검색 상태 복원 (`ExplorePage.tsx`, `DiscoverHubPage.tsx`, `AuthorsPage.tsx`)**:
   - 로컬 검색어 상태를 URL `searchParams`의 `q` 파라미터와 양방향 동기화하여, 작품 상세 페이지 이동 후 브라우저 `뒤로가기(Back)` 실행 시 이전 검색어와 필터링된 카드 목록이 그대로 복원됩니다.
8. **200% 확대 및 다중 뷰포트(`320` / `390` / `768` / `1440`) 레이아웃 보호**:
   - 새로 추가된 복구 버튼·폴백 배지 모두 `flex-wrap`, `min-w-0`, `min-h-11`(44px 터치 타깃) 규칙을 준수하여 초소형 모바일(`320px`) 및 `200%` 확대에서도 가로 넘침(`0px`)을 유지합니다.

---

## 3. 실제 Chromium 브라우저 검증 결과 (`http://127.0.0.1:4173`)

Playwright + 시스템 Chromium(`/usr/bin/chromium`)으로 실제 Vite 서버(`http://127.0.0.1:4173`)에서 8대 시나리오 및 30개 뷰포트/확대 조합을 실측하여 전 항목 **PASS**를 확인했습니다.

### 3.1 8대 회귀 시나리오 실측 요약

| 시나리오 키 | 판정 | 핵심 실측 지표 | 페이지 런타임 오류 (`pageErrors`) |
| --- | --- | --- | --- |
| `apiConnectionFailure` | **PASS** | `/api/**` 500 시 로컬 폴백 카드 `40`개 즉시 렌더; `/api/**`+`/data/**` 동시 차단 시 `ErrorState`(`재시도`) 노출 후 차단 해제·클릭 시 `40`개 카드 복구 | `0건` (`[]`) |
| `emptyCatalog` | **PASS** | `/explore` 빈 응답 시 `다시 시도` 버튼 및 `작품 탐색 허브로 이동` 링크 노출 (`true`); `/discover` 빈 스냅샷 시 `discover-shelves-empty` 및 `다시 시도` 노출 (`true`) | `0건` (`[]`) |
| `partialJsonMissing` | **PASS** | `null`/`{}`/손상 필드 포함 응답에서 `손상데이터 복구 테스트작` 정상 렌더 (`true`); `/author/넥스트북 살롱` 폴백 시 `undefined` 문자열 노출 `false` | `0건` (`[]`) |
| `image404` | **PASS** | 전 이미지 404 시 `discoverArtFallbacks: 4`, `exploreEmptyFallback: true`, `searchToolsFallback: 1`, `authorsSectionFallback: true`, `authorAvatarFallbacks: 120`, `tagsSectionFallback: true` | `0건` (`[]`) |
| `hangulCompositionSearch` | **PASS** | `/explore` 조합 중 검색 결과: `"ㅍ": 40`, `"판ㅌ": 40`, `"판타ㅈ": 40`, `"달ㅂ": 3`, `"닯": 3`, `"산": 40`, `"추ㄱ": 12`, `"회ㄱ": 21`, `"ㅍㅌㅈ": 40`; `/tags` `"회ㄱ": 120` | `0건` (`[]`) |
| `rapidSearchSwitching` | **PASS** | `["ㅍ", "판ㅌ", "판타지", "로맨스", "없는검색어xyz999", "액션", "달ㅂ", ""]` 고속 전환 후 기준 카드 수(`40`개)와 최종 카드 수(`40`개) 100% 일치 | `0건` (`[]`) |
| `backNavigation` | **PASS** | `/explore?q=판타지`(`40`개) → 첫 작품 상세(`/title/...`) 클릭 이동 → `page.goBack()` 후 검색창 값 `"판타지"` 및 카드 수 `40`개 정확히 복원 | `0건` (`[]`) |
| `zoom200AndViewports` | **PASS** | `/discover`, `/explore`, `/search?q=판타지`, `/authors`, `/tags` × `320`, `390`, `768`, `1440`, `1440@200%`, `320@200%` (총 30개 조합) `maxOverflow: 0px`, `totalBrokenImgs: 0` | `0건` (`[]`) |

---

## 4. 분할 정적 분석·단위 테스트 및 게이트 검증 결과

- **루트 `tsconfig.json` 옵션 기반 카탈로그 도메인 타입검사 (`ts.createProgram`)**:
  - 검사 대상: `apps/web/src/domains/catalog/**` 및 프로젝트 전역 `.d.ts` (총 94개 루트 파일 + 의존 그래프)
  - 수정 전: `local-catalog-fallback.ts:266:94 - TS2551: Property 'platform' does not exist on type 'Availability'. Did you mean 'platformId'?` 재현 확인
  - 수정 후: **0 diagnostics (PASS, RSS ~748 MB)**
- **ESLint (`node ./scripts/lint-changed.mjs`)**: **0 errors, 0 warnings (PASS)**
- **Vitest 카탈로그 테스트 스위트**:
  - `apps/web/src/domains/catalog/discovery-ui-improvements.test.tsx` (10 tests) — **PASS**
  - `apps/web/src/domains/catalog/DiscoverHubPage.test.tsx` (9 tests) — **PASS**
  - `apps/web/src/domains/catalog/ExplorePage.layout.test.tsx` (16 tests) — **PASS**
  - `apps/web/src/domains/catalog/SearchPage.layout.test.tsx` (7 tests) — **PASS**
  - `apps/web/src/domains/catalog/discover-home.test.ts` (9 tests) — **PASS**
- **저장소 구조·경계·락파일 게이트**:
  - `node --test ./scripts/agent-harness.test.mjs` — **PASS**
  - `node ./scripts/verify-pnpm-lockfile.mjs` — **PASS**
  - `node ./scripts/check-source-file-size.mjs` — **PASS**
  - `node ./scripts/validate-app-boundaries.mjs` — **PASS**
