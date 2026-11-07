# ToonStudio 탐색 크롤링 데이터 신뢰성 UI 감사 및 최소 보정 보고서 (Round 4 — 2026-11-07)

## 1. 작업 범위 및 소유권 원칙

- **작업 브랜치**: `feat/catalog-provenance-round4-20261107` (기준 `origin/main` = `354af37af`)
- **소유 및 변경 허용 범위 (`apps/web/src/domains/catalog/*` 및 본 문서)**:
  - `apps/web/src/domains/catalog/local-catalog-sanitize.ts`
  - `apps/web/src/domains/catalog/local-catalog-fallback.ts`
  - `apps/web/src/domains/catalog/ExplorePage.tsx`
  - `apps/web/src/domains/catalog/AuthorsPage.tsx`
  - `apps/web/src/domains/catalog/AuthorPage.tsx`
  - `apps/web/src/domains/catalog/TitleDetailHero.tsx`
  - `apps/web/src/domains/catalog/TitleEpisodeSection.tsx`
  - `apps/web/src/domains/catalog/TitleDetailPage.tsx`
  - `apps/web/src/domains/catalog/TagsPage.tsx`
  - `apps/web/src/domains/catalog/discovery-ui-improvements.test.tsx`
  - `apps/web/src/domains/catalog/TitleDetailHero.test.tsx`
  - `docs/catalog-provenance-round4-20261107/README.md`
- **불변 보호 범위 (`변경 0건` 확인)**:
  - 수집 원본 데이터(`data/`, `apps/api/data/`, `apps/web/public/data/`) 및 크롤러(`scripts/crawl*`)
  - 공유 코어 타입(`packages/core/*`), 공유 스토어(`apps/web/src/shared/lib/store.ts`), 라우트, 테마, 메시지함
  - 타 CI 담당 소유 범위(`PackagePanel`, `package-panel`, `PackageDetail`)

---

## 2. 로컬 크롤링 스냅샷 신뢰성(Provenance) 감사 및 결함 수정 요약

### 2.1 감사 발견 사항 및 최소 보정

1. **로컬 폴백 스냅샷의 허위 실시간 시각(`new Date().toISOString()`) 제거**:
   - **결함**: `local-catalog-fallback.ts`의 `loadLightweightLocalPool()` 및 `resolveFromLocalStaticCatalog()`가 `/data/home.json`의 실제 스냅샷 생성 시각(`generatedAt`)을 버리고 `new Date().toISOString()`을 반환하여, 정적 크롤링 스냅샷이 마치 방금 생성된 실시간 API 응답처럼 표시될 수 있었음.
   - **수정**: `/data/home.json`의 실제 `generatedAt` 문자열을 `LightweightLocalPool`에 보존하여 `/api/explore`, `/api/search`, `/api/authors`, `/api/authors/:name`, `/api/titles/:slug` 로컬 폴백 응답에 그대로 전달(`generatedAt`이 없을 때만 `undefined` 처리).
2. **과하지 않은(Non-intrusive) 출처·수집시점·누락정보 표시**:
   - `DiscoverPage.tsx`: 하단 메타 푸터에서 실제 `data?.generatedAt` 기준일과 `data?.source === "local-static-fallback"` 여부에 따른 정적 스냅샷 출처를 표시(기존 정상 동작 유지).
   - `ExplorePage.tsx`: 상단 툴바 상태 요약줄(`data-testid="catalog-provenance-meta"`)에 `snapshotDateLabel(data.generatedAt)`(`YYYY-MM-DD 기준 공개 스냅샷`)과 로컬 정적 스냅샷 여부를 한 줄 보조 메타로 표시.
   - `TitleDetailPage.tsx`: 연재/구매처 섹션(`#title-availability`) 헤더(`data-testid="catalog-provenance-meta"`)에 스냅샷 기준일(`YYYY-MM-DD`), 출처(`공개 카탈로그 스냅샷` / `로컬 정적 스냅샷`), 추정 지표 포함 여부(`statsAreEstimated !== false`), 원출처 링크 준비 중 항목 유무를 실제 데이터에 근거해 간결하게 표시. 또한 `TitleDetailPage`의 `useApiResource`에 `useLocalCatalogFallback`을 연결하여 API 오프라인 시에도 로컬 스냅샷에서 작품 상세를 복구하도록 보강.
   - `AuthorPage.tsx`: 작가 헤더 메타 영역(`data-testid="catalog-provenance-meta"`)에 스냅샷 기준일, 로컬 정적 스냅샷 여부, `참여작 집계(추정 지표 포함)` 안내를 표시.
3. **작가 → 작품 → 원출처 연결 및 플랫폼 필터 결함 수정**:
   - **빈 작가·미상 작가(`"미상"`, `"작가 미상"`, `"익명"`, `"unknown"`, `""`) 방어**:
     - `isPlaceholderAuthorName()` 및 `primaryAuthorName()`을 도입하여 `/api/authors` 목록(`AuthorsPage.tsx`), 작품 상세 히어로(`TitleDetailHero.tsx`), 에피소드 빈 상태 작가 링크(`TitleEpisodeSection.tsx`), 같은 작가 작품 레일(`TitleDetailPage.tsx`)에서 깨진 `/author/작가%20미상` 링크가 생성되지 않고 안전한 텍스트 배지/폴백으로 렌더링되도록 수정.
   - **다중 작가(`"채은, 고다고"`, `"작가A / 작가B"`) 역참조 복원**:
     - `splitAuthorNames()`를 통해 `local-catalog-fallback.ts`의 `/api/authors/:name` 폴백이 쉼표/슬래시로 구분된 공동 작가의 개별 작가 페이지에서도 해당 작품을 누락 없이 조회하도록 보정.
   - **원출처 URL(`availability.url`) 검증 및 중복 플랫폼 제거**:
     - `sanitizeExternalCatalogUrl()`로 유효한 `https:` URL(자격증명 미포함)만 허용하고 비보안 `http:` 또는 손상된 URL은 `undefined`로 정규화하여 UI에서 `"링크 준비 중"` 배지로 안전하게 안내.
     - `deduplicateAvailability()`로 작품별 중복 플랫폼 항목을 정규화된 `platformId` 기준으로 병합(유효 `url`, `isOriginal`, 유리한 `pricing` 우선 보존).
   - **플랫폼 필터(`ExplorePage`, `SearchPage`) `undefined`/빈값/중복 방어**:
     - `computeLocalPlatformCoverage()` 및 `sanitizePlatformCoverageList()`로 `undefined`, 빈 문자열, 알 수 없는 플랫폼 ID, `count <= 0` 항목을 제거하고 별칭(`"naver" -> "naver-webtoon"`, `"kakao" -> "kakao-page"`)을 병합.
     - `ExplorePage.tsx`의 `platformOptions`가 손상된 `platformCoverage`에서도 중복/빈값을 제거하고, 결과가 비어 있을 때 `undefined`로 폴백하여 `TitleFilterPanel`의 기본 플랫폼 필터 버튼이 사라지지 않도록 보장.

---

## 3. 정적 검증 및 단위/통합 테스트 증거

### 3.1 Catalog 도메인 전체 Vitest 테스트 (37개 파일, 297개 테스트 전수 통과)

- 실행 명령:
  ```bash
  pnpm --filter @toonstudio/web exec vitest run src/domains/catalog
  ```
- 결과: **37 test files passed, 297 tests passed (0 failures)**
- Round 4 신규 검증 케이스 (`discovery-ui-improvements.test.tsx`, `TitleDetailHero.test.tsx`):
  - 로컬 정적 폴백이 `new Date().toISOString()` 대신 `/data/home.json`의 실제 `generatedAt`을 보존하는지 검증
  - 중복 플랫폼(`naver` + `naver-webtoon`), `undefined` 플랫폼, 비보안 `http://` URL, 빈/미상 작가(`"작가 미상"`), 다중 작가(`"채은, 고다고"`) 정규화 검증
  - `ExplorePage`에서 손상된 `platformCoverage` 주입 시 플랫폼 필터 복원 및 스냅샷 기준일(`2026-11-07 기준 공개 스냅샷`) 표시 검증
  - `AuthorPage` → 작품 카드 → `TitleDetailPage` → `/api/go/:platformId` 원출처 링크 연결 및 `"링크 준비 중"` 상태 표시 검증
  - `TitleDetailHero`에서 `"작가 미상"` 플레이스홀더 작가의 깨진 `/author/` 링크 미생성 검증
  - 1,000작품 합성 표본에서 긴 이름·이미지 불가·중복 플랫폼·빈 작가를 포함한 필터링 및 한글 IME 조합(`"달ㅂ"`) 응답성(`elapsedMs < 500ms`) 검증

### 3.2 Root 타입 계약 및 정적 게이트 검사

| 검증 항목 | 실행 명령 | 결과 |
| --- | --- | --- |
| Root `tsconfig.json` 계약 기반 타입체크 (`catalog` + `packages/core`) | `node` TypeScript compiler API (`tsconfig.json` root options + `packages/core/src/**/*` + `apps/web/src/domains/catalog/**/*`) | **PASS (0 errors)** |
| 변경 파일 ESLint 검사 (`--max-warnings=0`) | `node scripts/lint-changed.mjs` | **PASS (11 files, 0 warnings, 0 errors)** |
| 소스 파일 크기 제한 검사 (`<= 800 lines`) | `node scripts/check-source-file-size.mjs` | **PASS (최대 800 lines 이하)** |
| 앱/도메인 경계 검증 | `node scripts/validate-app-boundaries.mjs` | **PASS (0 violations)** |

> **참고**: 8GB 컨테이너 환경의 OOM 방지를 위해 모노레포 전체 `pnpm typecheck` 대신 Root `tsconfig.json` 컴파일러 옵션과 `packages/core/src/**/*` + `apps/web/src/domains/catalog/**/*` 전체 파일을 함께 로드하는 분할 타입체크를 수행하였으며, 이를 모노레포 전체 타입체크 통과로 과장하지 않습니다.

---

## 4. 실제 Chromium 브라우저 검증 (320 / 390 / 768 / 1440 및 200% 확대)

### 4.1 1,000작품 합성 표본 + 경계 조건 + 한글 IME 조합 응답성 검증

실제 `/usr/bin/chromium` 헤드리스 브라우저에서 1,000작품 합성 표본(초장문 제목/작가명, 깨진 커버 이미지 URL `http://127.0.0.1:4179/broken-cover-404.webp`, 중복/누락 플랫폼, 빈 작가/미상 작가 포함)을 `/api/explore`에 주입하고, 각 뷰포트 및 200% 확대 상태에서 가로 넘침(`horizontalOverflow`), 스냅샷 출처 표시(`provenanceText`), 한글 IME 조합 중(`"달ㅂ"`) 검색 응답 시간을 측정하였습니다.

| 뷰포트 | 해상도 / 배율 | `scrollWidth` / `innerWidth` | 가로 넘침 (`horizontalOverflow`) | 출처/시점 메타 (`catalog-provenance-meta`) | 1,000작품 한글 IME (`"달ㅂ"`) 응답 시간 | 매칭 렌더 카드 수 | 런타임 에러 (`pageErrorCount`) |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `mobile-320` | `320×640` (`1x`) | `305 / 320` | `0px` | `2026-11-07 기준 공개 스냅샷` | `806ms` | `40` (1페이지) | `0` |
| `mobile-390` | `390×844` (`1x`) | `375 / 390` | `0px` | `2026-11-07 기준 공개 스냅샷` | `665ms` | `40` (1페이지) | `0` |
| `tablet-768` | `768×1024` (`1x`) | `753 / 768` | `0px` | `2026-11-07 기준 공개 스냅샷` | `784ms` | `40` (1페이지) | `0` |
| `pc-1440` | `1440×900` (`1x`) | `1425 / 1440` | `0px` | `2026-11-07 기준 공개 스냅샷` | `891ms` | `40` (1페이지) | `0` |
| `pc-1440-zoom200` | `1440×900` (`200%`) | `1425 / 1440` | `0px` | `2026-11-07 기준 공개 스냅샷` | `1636ms` | `40` (1페이지) | `0` |

### 4.2 API 오프라인(503) 시 로컬 크롤링 스냅샷 폴백 및 작가 → 작품 → 원출처 동선 검증

`/api/**`(단, `/api/go/*` 제외) 요청을 모두 HTTP `503`으로 차단한 실제 Chromium 브라우저 환경에서 로컬 크롤링 스냅샷(`/data/*.json`) 폴백 동작과 출처 표시, 작가 → 작품 → 원출처 이동 동선을 검증하였습니다.

- `/discover`: 실제 스냅샷 날짜(`2026-11-07`) 및 `"데이터 출처"` 안내 노출 확인 (`discoverHasSnapshotDate: true`)
- `/explore`: `2026-11-07 기준 공개 스냅샷` 노출 및 필터 패널 오픈 시 플랫폼·장르 필터 버튼 정상 렌더링 (`platformChipCountInPanel: 68`)
- `/authors`: 플레이스홀더 작가 노출 없이 실제 작가 디렉터리 렌더링 (`firstDirectoryAuthor: "넥스트북 살롱"`)
- `/title/nw-20853`: API 503 상태에서 로컬 스냅샷 폴백으로 작품 상세 정상 렌더링, `2026-11-07 기준 공개 카탈로그 스냅샷 · 추정 지표 포함` 노출, 히어로 작가 링크(`["조석"]`) 및 외부 원출처 이동 링크(`a[href^="/api/go/"]` 4건) 정상 작동
- `/author/조석`: 히어로 작가 링크 클릭 시 작가 상세 페이지로 이동하며 `2026-11-07 기준 공개 카탈로그 스냅샷 · 참여작 집계(추정 지표 포함)` 정상 노출 (`pageErrorCount: 0`)
