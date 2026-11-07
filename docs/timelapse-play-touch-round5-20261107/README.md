# GAP-R4-05 (TimelapseGalleryPage · PlayPage) 44px 터치 타깃 · 필터 그룹 역할 보강 증거 (Round 5 — 2026-11-07)

## 1. 작업 범위 및 소유 경계 확인

- **작업 브랜치**: `feat/timelapse-play-touch-round5-20261107` (최신 `origin/main` `22f91e9197` 기반 분기)
- **소유 파일 (로컬 2개 페이지 + 전용 단위 테스트 + 상대링크 증거 문서만 수정)**:
  - [TimelapseGalleryPage.tsx](../../apps/web/src/domains/community/TimelapseGalleryPage.tsx)
  - [TimelapseGalleryPage.test.tsx](../../apps/web/src/domains/community/TimelapseGalleryPage.test.tsx)
  - [PlayPage.tsx](../../apps/web/src/domains/play/PlayPage.tsx)
  - [PlayPage.test.tsx](../../apps/web/src/domains/play/PlayPage.test.tsx)
  - `docs/timelapse-play-touch-round5-20261107/README.md` (본 문서)
- **엄격 불변(비소유) 검증**:
  - 소유 해제한 카탈로그 파일(`TagsPage.tsx`, `catalog-status-i18n.ts`, `catalog-status-i18n-r3c08.test.ts`), `CutsFeedPage.test.tsx`, `PackagePanel`/`PackageDetail`, 메시지함, 서비스 상태 페이지: **무변경 (0줄 diff)**
  - 공유 CSS(`play-lab.css`, `globals.css`), 라우트, 공유 스토어, 재생 엔진, 미디어 자동재생 동작: **무변경 (0줄 diff)**
  - 새 메뉴·새 외부 API·유료 도구: **추가 없음**

---

## 2. 실제 결함 감사 및 최소 수정 내역 (`GAP-R4-05`)

### 2.1 `TimelapseGalleryPage` ([TimelapseGalleryPage.tsx](../../apps/web/src/domains/community/TimelapseGalleryPage.tsx))
1. **상단 필터·정렬·검색 그룹 역할 부여**:
   - 상단 컨트롤 컨테이너(`data-testid="timelapse-filter-controls"`)에 `role="group"` 및 `aria-label="타임랩스 목록 필터 및 검색"`을 부여했습니다.
   - 기존 REA 텔레메트리 바 내부의 `타임랩스 분석 모드`(`role="group"`) 및 `리플레이 배속`(`role="group"`)과 함께 모든 필터 묶음이 명시적 그룹 역할을 갖도록 정돈했습니다.
2. **44px 이상 터치 타깃 보장 (`min-h-11` + 인라인 `minHeight: "44px"`)**:
   - 데스크톱(`768px`, `1440px`) 루트 폰트 스케일링 환경에서도 `getBoundingClientRect().height >= 44px`(200% 확대 시 `88px`)를 보장하도록 상단 CTA 링크(`내 타임랩스 만들기`), 정렬 `<label>`, `"내 클립만"` 필터 칩(`data-testid="timelapse-filter-mine-chip"`), 검색 `<input type="search">`, 분석 모드 칩 3종(`timelapse-rea-mode-*`), 리플레이 배속 칩 3종(`timelapse-rea-speed-*`)에 `min-h-11`(`min-w-11`) 및 `style={{ minHeight: "44px" }}`(`minWidth: "44px"`)을 적용했습니다.
3. **선택 상태 계약·키보드 포커스·좁은 화면(320px) 간격·긴 한국어 라벨 줄바꿈**:
   - `"내 클립만"` 칩과 분석 모드·배속 칩에 `data-state="active" | "inactive"`, `aria-pressed`(버튼), `checked`(체크박스) 상태를 동기화했습니다.
   - 칩 그룹 내부에서 `ArrowRight`/`ArrowDown`, `ArrowLeft`/`ArrowUp`, `Home`, `End` 키로 인접 칩 포커스를 순환하는 `handleChipKeyDown`을 각 `<button>`에 연결하고 `focus-visible:outline` / `focus-within:outline` 및 `scroll-my-24`를 부여했습니다.
   - `gap-2`(`style={{ gap: "8px" }}`)와 `break-words [overflow-wrap:anywhere]`를 적용해 320px 뷰포트 및 초장문 한국어 라벨 주입 시에도 가로 오버플로(`0px`) 없이 줄바꿈되도록 보강했습니다.
   - 정렬 `<label>` 내부 `<select>`의 중복 영문 `aria-label`을 제거하고 `<span className="sr-only">` 단일 레이블로 통일해 Axe `label-content-name-mismatch` 위반을 해소했습니다.

### 2.2 `PlayPage` ([PlayPage.tsx](../../apps/web/src/domains/play/PlayPage.tsx))
1. **콘텐츠 분류 필터 칩 그룹 역할 및 선택 상태 정돈**:
   - `.play-filter-tabs` 컨테이너(`data-testid="play-filter-tabs"`)에 `role="group"`, `aria-label="콘텐츠 분류"`, `gap-2`(`style={{ gap: "8px" }}`)를 부여했습니다.
   - 최근 즐긴 콘텐츠 바로가기 묶음에도 `role="group"`(`aria-label="최근 즐긴 콘텐츠 바로가기"`)을 부여했습니다.
   - 6개 필터 칩(`전체`, `드로잉`, `스토리`, `색감`, `아케이드`, `즐겨찾기`)에 `data-testid="play-filter-chip-${id}"`, `aria-pressed={tab === id}`, `data-state={tab === id ? "active" : "inactive"}`를 부여하고, 클릭·키보드 조작 시 로컬 상태(`tab`, `query`)와 URL 쿼리 파라미터(`?tab=...&q=...`)가 같은 프레임에 즉시 동기화되도록 보강했습니다.
2. **44px 이상 터치 타깃·키보드 방향키 이동·긴 한국어 라벨 줄바꿈**:
   - 모든 `.play-chip` 버튼과 `.play-search` 레이블/입력창, 최근 콘텐츠 칩, 보조 텍스트 링크(`.play-text-link`, `.play-back`)에 `min-h-11` 및 `style={{ minHeight: "44px" }}`(칩 버튼 `minWidth: "44px"`)과 `scroll-my-24`를 적용했습니다.
   - 필터 칩 그룹에 `handleFilterChipKeyDown`(`ArrowRight`/`ArrowDown`/`ArrowLeft`/`ArrowUp`/`Home`/`End`)과 `focus-visible:outline`을 적용했습니다.
   - 칩 라벨과 추천 코스 카드에 `break-words [overflow-wrap:anywhere]`를 적용해 긴 한국어 라벨에서도 320px 가로 스크롤이 발생하지 않도록 처리했습니다.

---

## 3. 실제 브라우저(Chromium) 멀티 뷰포트 및 200% 확대 검증 결과

Playwright Chromium(`/usr/bin/chromium`)으로 `/community/timelapses`와 `/play`를 `320×640`, `390×844`, `768×1024`, `1440×900`, `1440×900 (200% 확대)` 5개 뷰포트에서 실제 렌더링하여 측정한 결과입니다.

### 3.1 `/community/timelapses` (`TimelapseGalleryPage`)
| 뷰포트 | 가로 오버플로 (`scrollWidth - clientWidth`) | 초장문 한국어 라벨 주입 후 오버플로 | 그룹 역할 (`filterControls` / `mode` / `speed`) | 칩 간격 (`rowGap / columnGap`) | 최소 터치 타깃 높이 (`minControlHeightPx`) | 방향키(`ArrowRight`) 이동 및 선택 상태 (`aria-pressed` / `data-state`) | 콘솔/페이지 오류 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` | `0px` | `0px` | `group` / `group` / `group` | `8px / 8px` | `44px` (`>= 44px` PASS) | `timelapse-rea-mode-layer-chronology` (`true` / `active`) | `0` |
| `390×844` | `0px` | `0px` | `group` / `group` / `group` | `8px / 8px` | `44px` (`>= 44px` PASS) | `timelapse-rea-mode-layer-chronology` (`true` / `active`) | `0` |
| `768×1024` | `0px` | `0px` | `group` / `group` / `group` | `8px / 8px` | `44px` (`>= 44px` PASS) | `timelapse-rea-mode-layer-chronology` (`true` / `active`) | `0` |
| `1440×900` | `0px` | `0px` | `group` / `group` / `group` | `8px / 8px` | `44px` (`>= 44px` PASS) | `timelapse-rea-mode-layer-chronology` (`true` / `active`) | `0` |
| `1440×900 (200% 확대)` | `0px` | `0px` | `group` / `group` / `group` | `8px / 8px` | `88px` (`>= 44px` PASS) | `timelapse-rea-mode-layer-chronology` (`true` / `active`) | `0` |

### 3.2 `/play` (`PlayPage`)
| 뷰포트 | 가로 오버플로 (`scrollWidth - clientWidth`) | 초장문 한국어 라벨 주입 후 오버플로 | 필터 탭 역할 (`role` / `aria-label`) | 칩 간격 (`rowGap / columnGap`) | 최소 칩 크기 (`height × width`) / 검색창 높이 | 방향키(`ArrowRight`) 이동 및 선택 상태 (`drawChipPressed` / `drawChipState`) | 콘솔/페이지 오류 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` | `0px` | `0px` | `group` / `콘텐츠 분류` | `8px / 8px` | `44px × 44px` / `46px` (input `44px`) | `play-filter-chip-draw` (`true` / `active`) | `0` |
| `390×844` | `0px` | `0px` | `group` / `콘텐츠 분류` | `8px / 8px` | `44px × 44px` / `46px` (input `44px`) | `play-filter-chip-draw` (`true` / `active`) | `0` |
| `768×1024` | `0px` | `0px` | `group` / `콘텐츠 분류` | `8px / 8px` | `44px × 45px` / `46px` (input `44px`) | `play-filter-chip-draw` (`true` / `active`) | `0` |
| `1440×900` | `0px` | `0px` | `group` / `콘텐츠 분류` | `8px / 8px` | `44px × 45px` / `46px` (input `44px`) | `play-filter-chip-draw` (`true` / `active`) | `0` |
| `1440×900 (200% 확대)` | `0px` | `0px` | `group` / `콘텐츠 분류` | `8px / 8px` | `88px × 90px` / `92px` (input `88px`) | `play-filter-chip-draw` (`true` / `active`) | `0` |

---

## 4. 테스트·타입·린트·소스 크기·문서 검증 결과

1. **직접 단위 테스트 및 기존 회귀 테스트 (`vitest`)**:
   - 실행 명령:
     ```bash
     npx vitest run \
       src/domains/community/TimelapseGalleryPage.test.tsx \
       src/domains/play/PlayPage.test.tsx \
       src/domains/play/play-status-i18n-r3c12.test.ts \
       src/domains/community/r4-cat1-status-i18n.test.ts \
       src/domains/play/lab/play-storage.test.tsx \
       src/domains/play/lab/creative-core.test.ts \
       src/domains/play/games/rps-logic.test.ts
     ```
   - 결과: **7개 테스트 파일, 56개 테스트 전수 PASS** (axe 접근성 검증 포함)
2. **루트 `tsconfig.json` 계약 범위 타입체크 (8GB 메모리 한계 고려 분할 검증)**:
   - `packages/core/src/index.ts`, `packages/core/src/types.ts` 및 소유 파일 4개 대상 `tsc --noEmit`: **0 errors PASS**
   - *(전체 저장소 단일 `pnpm typecheck`는 8GB 컨테이너 메모리 한계를 초과하므로, 전체 타입체크 통과로 과장하지 않고 루트 `tsconfig.json` 계약 포함 분할 타입검사로 정확히 보고합니다.)*
3. **변경 파일 린트 (`node scripts/lint-changed.mjs`)**:
   - 변경 파일 4개 검사: **0 errors, 0 warnings PASS**
4. **소스 파일 800줄 상한 (`node scripts/check-source-file-size.mjs`)**:
   - [TimelapseGalleryPage.tsx](../../apps/web/src/domains/community/TimelapseGalleryPage.tsx): **302줄** (`<= 800줄` PASS)
   - [TimelapseGalleryPage.test.tsx](../../apps/web/src/domains/community/TimelapseGalleryPage.test.tsx): **195줄** (`<= 800줄` PASS)
   - [PlayPage.tsx](../../apps/web/src/domains/play/PlayPage.tsx): **221줄** (`<= 800줄` PASS)
   - [PlayPage.test.tsx](../../apps/web/src/domains/play/PlayPage.test.tsx): **119줄** (`<= 800줄` PASS)
5. **아키텍처 경계 검증 (`node scripts/validate-app-boundaries.mjs`)**:
   - 모든 경계 규칙 `0/0` 위반 없음 (**PASS**)
