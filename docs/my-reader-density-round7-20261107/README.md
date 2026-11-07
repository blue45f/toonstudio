# MySpace 허브 및 Spatial Reader 정보 밀도·필요 시 노출·대체 표시 명확화 보고서 (Round 7 — `2026-11-07`)

## 1. 목적 및 소유 범위

- **핵심 목표**: 사용자의 핵심 요구인 **"화면을 더 단순하게 유지할 것"**에 따라, Round 6(`06daf60e` / `f95f9e2a`)에서 추가된 검색 입력·작품 요약·상태/오류 배너가 이전 `main`(Round 5 `e111b9c0`)에 없던 상시 UI를 늘렸는지 먼저 비교하고, 정상 상태의 정보 밀도와 첫 주요 행동 도달 거리를 개선합니다.
- **소유 범위 (로컬 2개 페이지 및 직접 테스트 한정)**:
  - [`MySpaceHubPage.tsx`](../../apps/web/src/domains/account/MySpaceHubPage.tsx) (587줄 < 800줄)
  - [`MySpaceHubPage.test.tsx`](../../apps/web/src/domains/account/MySpaceHubPage.test.tsx) (277줄 < 800줄)
  - [`StudioSpatialReaderPage.tsx`](../../apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.tsx) (792줄 < 800줄)
  - [`StudioSpatialReaderPage.test.tsx`](../../apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.test.tsx) (306줄 < 800줄)
- **비소유 및 보호 범위 (수정 0건)**:
  - 공유 CSS(`apps/web/src/styles/`), 3D/WebXR 엔진(`SpatialReaderViewer.tsx`, `spatial-reader-engine.ts`), 읽기 데이터 원본(`book` 상태 및 `localStorage`), 공유 스토어/라우트/테마/설정, 다른 페이지 전체 수정 없음.
  - 데이터 원본 변경, 무의미한 성공 문구, 새로운 메뉴/삭제/결제/외부 공유 기능 추가 없음.

---

## 2. 이전 `main`(Round 5 `e111b9c0` vs Round 6 `06daf60e`) 상시 UI 비교 진단

| 페이지 | 이전 `main` (Round 5 `e111b9c0`) | Round 6 (`06daf60e`) 상시 노출 요소 | Round 7 개선 조치 (필요할 때만 노출) |
| --- | --- | --- | --- |
| **`/my` (`MySpaceHubPage.tsx`)** | `<h2>내 공간 바로가기</h2>`와 역할 필터 칩 4개만 표시 | 정상 상태에서도 보조 카운트 문구(`my-space-filter-status`, `"전체 보기 · 14 / 14"`) 1줄과 상시 검색 입력(`my-space-destination-search`)이 항상 노출되어 목적지 카드까지 세로 거리 **+72px** 증가 | 기본 `"all"` 정상 상태에서는 보조 문구와 검색 입력을 숨김. 역할 필터 변경 시에만 헤더 우측에 인라인 요약을 표시하고, `?q=` URL 파라미터·결과 0건·역할 칩에서 `/` 키 입력 시에만 검색 입력을 노출 (`Escape`로 즉시 닫기) |
| **`/read/spatial` (`StudioSpatialReaderPage.tsx`)** | 상단 로더 바 아래에 `<SpatialReaderViewer>`가 바로 배치됨 | 정상 3컷 샘플에서도 중복 작품 요약 카드(`spatial-reader-work-summary`), 상시 컷 필터 바(`spatial-reader-panel-filter-bar`), 무의미한 성공 문구(`"샘플 작품을 열었어요..."`), 빈 `<p role="status">`(`mb-5`)가 상시 노출되어 뷰어까지 세로 거리 **+234px** 증가 | 중복 작품 요약 카드 제거(`<SpatialReaderViewer>` 내부 `#spatial-reader-book-title`의 한·영 긴 제목 줄바꿈을 직접 보장). 6컷 이하 기본 작품에서는 컷 필터 바를 숨기고 7컷 이상이거나 `/` 키 입력 시에만 노출. 무의미한 성공 문구 및 빈 상태의 `<p role="status">` 마운트 제거 |

---

## 3. 320px / 390px 정상 상태 정보 밀도 및 첫 주요 행동 도달 거리 전후 비교

실제 Chromium 브라우저(`Playwright`)에서 측정한 `320×844` 및 `390×844` 정상 상태 비교 결과입니다 (상세 수치: [`browser-verification.json`](./browser-verification.json)).

### 3.1 `/my` (`MySpaceHubPage.tsx`)

| 지표 | `320×844` (Round 6) | `320×844` (Round 7) | 변화량 | `390×844` (Round 6) | `390×844` (Round 7) | 변화량 |
| --- | --- | --- | --- | --- | --- | --- |
| 첫 주요 행동(`Continue Reading`) 상단 Y | `2132px` | `2132px` | `0px` (동일) | `1851px` | `1851px` | `0px` (동일) |
| 첫 역할 필터 칩(`전체`) 상단 Y | `3015px` | `2987px` | **`-28px` 단축** | `2574px` | `2546px` | **`-28px` 단축** |
| 첫 목적지 카드 상단 Y | `3173px` | `3101px` | **`-72px` 단축** | `2732px` | `2660px` | **`-72px` 단축** |
| 정상 상태 상시 검색창 노출 | `true` | **`false`** | 상시 UI 제거 | `true` | **`false`** | 상시 UI 제거 |
| 정상 상태 상시 보조 문구 노출 | `true` | **`false`** | 상시 UI 제거 | `true` | **`false`** | 상시 UI 제거 |
| 바로가기 섹션 상시 인터랙티브 요소 수 | `19개` | **`18개`** | `-1개` (단순화) | `19개` | **`18개`** | `-1개` (단순화) |

### 3.2 `/read/spatial` (`StudioSpatialReaderPage.tsx`)

| 지표 | `320×844` (Round 6) | `320×844` (Round 7) | 변화량 | `390×844` (Round 6) | `390×844` (Round 7) | 변화량 |
| --- | --- | --- | --- | --- | --- | --- |
| 작품 열기 전 빈 `<p role="status">` 개수 | `1개` (`mb-5`) | **`0개`** | 빈 상태 줄 제거 | `1개` (`mb-5`) | **`0개`** | 빈 상태 줄 제거 |
| 샘플 로드 후 뷰어 제목(`#spatial-reader-book-title`) 상단 Y | `1455px` | `1221px` | **`-234px` 단축** | `1241px` | `1007px` | **`-234px` 단축** |
| 샘플 로드 후 첫 뷰어 주요 행동(시점/레이아웃 버튼) 상단 Y | `1500px` | `1266px` | **`-234px` 단축** | `1286px` | `1052px` | **`-234px` 단축** |
| 정상 3컷 상태 상시 필터 바 노출 | `true` | **`false`** | 상시 UI 제거 | `true` | **`false`** | 상시 UI 제거 |
| 중복 작품 요약 배너(`spatial-reader-work-summary`) 노출 | `true` | **`false`** | 중복 제거 | `true` | **`false`** | 중복 제거 |
| 무의미한 성공 문구(`"샘플 작품을 열었어요..."`) 노출 | `true` | **`false`** | 성공 문구 제거 | `true` | **`false`** | 성공 문구 제거 |

---

## 4. 오류 안내 및 깨진 이미지 대체 표시(Fallback) 원칙 검증

1. **실제 오류 상태에서만 안내 배너 표시**:
   - `/my`: 정상 표지 로드 시 `my-space-cover-fallback-notice`가 렌더링되지 않으며, 실제 `<img>` `onError` 발생 시에만 표시됩니다.
   - `/read/spatial`: 정상 작품 로드 시 `role="status"` 성공 문구와 `spatial-reader-broken-image-notice`가 모두 렌더링되지 않으며, 파일 파싱 실패·지원 형식 0건·깨진 컷 이미지 발생 시에만 안내가 표시됩니다.
2. **깨진 이미지를 정상 작품으로 오해시키지 않는 명시적 Fallback**:
   - `/my`: 깨진 표지 발생 시 이미지를 숨기고 텍스트 대체 카드를 노출하며, `img.alt`와 안내 배너에 `"일부 표지 이미지를 불러오지 못해 원본 표지 대신 텍스트 안내 카드로 대체 표시합니다."`를 명시합니다.
   - `/read/spatial`: Round 6의 1×1 투명 PNG 대신 [`fallbackPanelImage`](../../apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.tsx)가 `"이미지 로드 실패 · 원본 작품이 아닌 대체 표시"` 문구가 박힌 명시적 SVG 플레이스홀더를 반환하며, 깨진 `<img>`의 `alt` 앞에 `"[이미지 로드 실패 대체 표시] "` 접두어를 부여합니다.
3. **데이터 원본 무변경(Non-destructive) 재시도**:
   - `/read/spatial`의 깨진 이미지 복구 버튼(`data-testid="spatial-reader-broken-image-recover"`)은 기존처럼 `openSample()`을 호출해 사용자의 `book` 상태를 덮어쓰지 않고, `setBrokenPanelIds([])`만 초기화하여 **원본 작품 데이터를 100% 보존한 채 원본 이미지 URL을 다시 불러옵니다**.

---

## 5. 6개 뷰포트 실제 브라우저 측정 요약

모든 뷰포트에서 가로 스크롤(`horizontalOverflowPx: 0`)이 없고 주요 조작 버튼이 최소 `44×44px` 터치 영역을 충족함을 확인했습니다 (전체 측정 데이터: [`browser-verification.json`](./browser-verification.json)).

| 뷰포트 | 크기 / 배율 | `/my` 가로 넘침 | `/my` 역할 필터 칩 4종 (`min 44×44px`) | `/read/spatial` 가로 넘침 | `/read/spatial` 주요 버튼 (`min 44×44px`) |
| --- | --- | --- | --- | --- | --- |
| `mobile-320` | `320×844` (`1x`) | `0px` | PASS (`70~92 × 44px`) | `0px` | PASS (`133~153 × 44px`) |
| `mobile-390` | `390×844` (`1x`) | `0px` | PASS (`70~92 × 44px`) | `0px` | PASS (`133~153 × 44px`) |
| `tablet-768` | `768×1024` (`1x`) | `0px` | PASS (`70~92 × 44px`) | `0px` | PASS (`133~153 × 44px`) |
| `pc-1440` | `1440×900` (`1x`) | `0px` | PASS (`70~92 × 44px`) | `0px` | PASS (`133~153 × 44px`) |
| `pc-1440-zoom-200` | `1440×900` (`200%`) | `0px` | PASS (`144~190 × 88px`) | `0px` | PASS (`271~315 × 88px`) |
| `reflow-720-equiv200` | `720×450` (`1x`) | `0px` | PASS (`70~92 × 44px`) | `0px` | PASS (`133~153 × 44px`) |

### 스크린샷 증거 (상대 경로)

- `320px` `/my` 정상 상태 (상시 검색창/보조 문구 없음): [`./screenshots/my-space-normal-mobile-320.png`](./screenshots/my-space-normal-mobile-320.png)
- `390px` `/my` 정상 상태 (상시 검색창/보조 문구 없음): [`./screenshots/my-space-normal-mobile-390.png`](./screenshots/my-space-normal-mobile-390.png)
- `320px` `/read/spatial` 정상 상태 (중복 요약·3컷 필터 바·성공 문구 없음): [`./screenshots/spatial-reader-normal-mobile-320.png`](./screenshots/spatial-reader-normal-mobile-320.png)
- `390px` `/read/spatial` 정상 상태 (중복 요약·3컷 필터 바·성공 문구 없음): [`./screenshots/spatial-reader-normal-mobile-390.png`](./screenshots/spatial-reader-normal-mobile-390.png)
- `1440px @ 200%` `/read/spatial` 깨진 컷 이미지 명시적 대체 표시 및 원본 데이터 보존 재시도: [`./screenshots/spatial-reader-fallback-pc-1440-zoom-200.png`](./screenshots/spatial-reader-fallback-pc-1440-zoom-200.png)

---

## 6. 테스트·품질 게이트·독립 감사 결과

- **직접 회귀 단위 테스트 (`Vitest`)**:
  - [`MySpaceHubPage.test.tsx`](../../apps/web/src/domains/account/MySpaceHubPage.test.tsx): 7개 테스트 전체 PASS (정상 상태 상시 검색/보조 문구 숨김, `/` 키 및 `?q=` 필요 시 노출, 깨진 표지 명시적 대체 안내, 키보드 탐색 및 결과 0건 복원 검증)
  - [`StudioSpatialReaderPage.test.tsx`](../../apps/web/src/domains/creator/spatial-reader/StudioSpatialReaderPage.test.tsx): 9개 테스트 전체 PASS (정상 3컷 상태 필터 바/중복 요약/성공 문구 숨김, `/` 키 및 다수 컷 필터 노출, 명시적 SVG 대체 표시 및 `book` 원본 데이터 무변경 복구 검증)
- **정적 품질 게이트**:
  - `node scripts/agent-harness.mjs check`: PASS
  - `node scripts/verify-pnpm-lockfile.mjs`: PASS
  - `node scripts/lint-changed.mjs --base=origin/main`: PASS
  - `node scripts/secretlint-files.mjs --base=origin/main`: PASS
  - `node scripts/check-source-file-size.mjs`: PASS (`MySpaceHubPage.tsx` 587줄, `StudioSpatialReaderPage.tsx` 792줄)
- **독립 서브에이전트 감사 (`d2270323c38849709aee13f439dee6a9`)**:
  - 소유 범위 준수, 상시 UI 제거 및 필요 시 노출, 오류 전용 배너, 원본 데이터 불변성, 명시적 대체 표시, 800줄 이하 및 금지 패턴 0건 전 항목 **PASS**.
