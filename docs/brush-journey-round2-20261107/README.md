# Brush Labs 연속 사용자 흐름 회귀 및 미완 UI 마감 증거 (Round 2: `brush-journey-round2-20261107`)

## 1. 작업 개요 및 범위 준수

- **기준 브랜치**: 통합 `main` (`ea1202e`, 1차 로컬 UI 개선 커밋 `b4fd2280` / 병합 커밋 `a4c5848` 포함 확인)
- **작업 브랜치**: `feat/brush-journey-round2-20261107`
- **목표**: 1차 완료 구현(`b4fd2280`/`a4c5848`)을 재작업하지 않고, 실제 사용자의 긴 연속 작업 흐름(**`프리셋 검색 → 갤러리 시험 → 파라미터 조정 → 그리기 → 탭전환 → 복귀 → 초기화`**)과 **`좁은 화면(320/390px) · 200% 확대 · 키보드 · reduced-motion`** 연속 시나리오에서 발견된 잔여 결함만 `apps/brush-lab` 로컬 UI·스타일 범위 안에서 수정 및 회귀 검증.
- **소유 경계 준수**:
  - 수정 파일(총 10개): 모두 `apps/brush-lab/src/app/{ui,views,styles}` 및 뷰 단위 테스트(`DrawView.test.tsx`, `GalleryView.test.tsx`)로 한정.
  - 금지 범위 무변경 확인: `apps/brush-lab/src/{engine,lanes,platform,state}`, `packages/**`, `apps/web/**`, 루트 설정(`package.json`, `pnpm-lock.yaml`, `tsconfig.json` 등) 수정 0건.

---

## 2. 발견된 잔여 결함 및 로컬 UI 수정 내역

| 구분 | 발견된 잔여 결함 (Round 1 이후 연속 흐름 감사) | 로컬 UI 수정 파일 및 해결 방법 |
| --- | --- | --- |
| **1. 갤러리 탭 상단 진입 동선** | `GalleryView.tsx`에서 `추천 조합` 표가 `브러시 가족 갤러리`보다 위에 배치되어, 320/390px 좁은 화면이나 200% 확대에서 `갤러리` 탭 전환 시 프리셋 검색·카드가 화면 아래로 밀려남 | `apps/brush-lab/src/app/views/GalleryView.tsx`: `브러시 가족 갤러리`(`<FamilyGallery />`) 섹션을 최상단으로 배치하고 `<RecommendedCombos />`를 하단으로 이동 |
| **2. 갤러리 검색·필터 피드백 및 빈 결과 복구** | `FamilyGallery.tsx`에 현재 표시 프리셋 개수 배지, 통합 필터 초기화 버튼, `Escape` 키 검색 지우기, 빈 검색 결과(`0건`) 시 복구 안내가 없었음 | `apps/brush-lab/src/app/ui/FamilyGallery.tsx`: `lab-gallery-filter-summary`(`표시 N/31종`), `lab-gallery-filter-reset`(`탐색 필터 초기화`), 검색창 `Escape` 단축키, 빈 결과 상태 배너(`lab-gallery-empty` + `전체 프리셋 보기` 복구 버튼) 추가 |
| **3. 갤러리 → 그리기 전환 시 접힌 패널 및 프리셋 동기화** | 좁은 화면에서 설정 패널(`#lab-draw-side`)을 접은 상태로 `갤러리` 탭에서 `'그리기에서 시험'`을 누르면, `그리기` 탭 복귀 후에도 패널이 닫혀 있어 곧바로 파라미터 조정을 이어갈 수 없었고 `A/B 비교` 프리셋과도 분리되어 있었음 | `apps/brush-lab/src/app/ui/FamilyGallery.tsx`: `tryInDraw(presetId)`에서 `actions.setPreset(presetId)`, `drawActions.setPreset(presetId)`, `drawActions.setPanelOpen(true)`, `actions.setTab("draw")`를 함께 호출하도록 보강 |
| **4. 그리기 탭 필터 밖 현재 브러시 안내 및 `Escape` 지우기** | 갤러리에서 새 브러시를 골라 돌아왔을 때 기존 그리기 탭의 가족·검색 필터 때문에 현재 브러시가 아래 목록에 보이지 않는 이유가 상단 요약 카드에 표시되지 않았음 | `apps/brush-lab/src/app/ui/DrawBrushPicker.tsx`: 현재 선택 브러시가 필터 결과 밖에 있을 때 `lab-draw-current-brush` 카드 안에 `목록 필터 밖`(`lab-draw-current-filtered-badge`) 경고 배지를 표시하고, `#lab-draw-search` 입력창에 `Escape` 키 즉시 지우기 추가 |
| **5. 종이 종류 변경 시 조정 개수 중복 집계** | `DrawParamPanel.tsx`에서 종이 종류를 `rough` 등으로 바꾸면 `setPaperKind`가 자동으로 `overrides.grain = true`를 설정해 `사용자 조정 2개`로 중복 집계됨 | `apps/brush-lab/src/app/ui/DrawParamPanel.tsx`: `paperKind !== "preset"`일 때 자동 활성화된 `grain: true`를 중복 카운트에서 제외하고 요약줄(`lab-draw-param-summary`)에 `· 종이 {paperKind}`를 명시 |
| **6. 탭 전환·복귀 시 획수 확인 및 좁은 화면 빠른 초기화** | `그리기 → 탭 전환 → 복귀` 시 캔버스 획수가 보존되었는지 상단 툴바에서 즉시 확인하기 어려웠고, 320/390px 좁은 화면에서 설정 패널을 접은 상태에서는 파라미터 초기화를 위해 패널을 다시 열어야 했음 | `apps/brush-lab/src/app/views/DrawView.tsx`: 상단 툴바 상태 배지(`lab-draw-brush-pill`)에 `· {strokes}획`을 표시하고, 사용자 조정이 있을 때 상단 툴바에 `설정 초기화`(`lab-draw-toolbar-reset`) 빠른 초기화 버튼을 노출 |
| **7. A/B 비교 탭 파라미터 상태 배지 일관성** | `그리기` 탭과 달리 `A/B 비교` 탭의 `BrushParamPanel` 하단에는 현재 오버라이드 상태 배지가 없었음 | `apps/brush-lab/src/app/ui/BrushParamPanel.tsx`: `lab-param-status`(`프리셋 기본값` / `사용자 조정 N개`) 배지 추가 |
| **8. 전 탭(그리기·갤러리·A/B 비교·리포트) 320px/200%/reduced-motion 레이아웃 보호** | `RecommendedCombos.tsx`의 `.lab-table`에 `.lab-table-wrap`이 없어 320/390/768px에서 가로 스크롤이 발생했고, `.lab-shell`/`.lab-tabpanel`/`.lab-banner`/`.lab-check`에 그리드 최소폭 제한이 없어 긴 식별자가 열 폭을 넓힐 수 있었음 | `apps/brush-lab/src/app/ui/RecommendedCombos.tsx`에 `lab-recommended-table-wrap` 추가, `apps/brush-lab/src/app/styles/brush-lab.css`에 `grid-template-columns: minmax(0, 1fr)`, `min-width: 0`, `overflow-wrap: anywhere` 및 `@media (prefers-reduced-motion: reduce)`의 `scroll-behavior: auto !important` 추가 |

---

## 3. 실제 브라우저(Playwright Chromium) 4개 탭 × 전 뷰포트 매트릭스 검증

- **실행 환경**: 헤드리스 Chromium (`/usr/bin/chromium`) + `vite preview` 프로덕션 번들
- **원시 결과 파일**: [`docs/brush-journey-round2-20261107/browser-verification.json`](./browser-verification.json)

| 뷰포트 / 조건 | 해상도 (`zoom`) | `reduced-motion` | `그리기` 가로 오버플로 | `갤러리` 가로 오버플로 | `A/B 비교` 가로 오버플로 | `리포트` 가로 오버플로 | `transitionDuration` | 판정 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| **Mobile 320** | `320 × 568` (`1x`) | `no-preference` | `0px` (`320/320`) | `0px` (`320/320`) | `0px` (`320/320`) | `0px` (`320/320`) | `0s` | **PASS** |
| **Mobile 390** | `390 × 844` (`1x`) | `no-preference` | `0px` (`390/390`) | `0px` (`390/390`) | `0px` (`390/390`) | `0px` (`390/390`) | `0s` | **PASS** |
| **Tablet 768** | `768 × 1024` (`1x`) | `no-preference` | `0px` (`768/768`) | `0px` (`768/768`) | `0px` (`768/768`) | `0px` (`768/768`) | `0s` | **PASS** |
| **PC 1440** | `1440 × 900` (`1x`) | `no-preference` | `0px` (`1440/1440`) | `0px` (`1440/1440`) | `0px` (`1440/1440`) | `0px` (`1440/1440`) | `0s` | **PASS** |
| **PC 1440 @ 200% 확대** | `1440 × 900` (`2x`) | `no-preference` | `0px` (`1440/1440`) | `0px` (`1440/1440`) | `0px` (`1440/1440`) | `0px` (`1440/1440`) | `0s` | **PASS** |
| **Reflow 720 (200% 등가)** | `720 × 900` (`1x`) | `no-preference` | `0px` (`720/720`) | `0px` (`720/720`) | `0px` (`720/720`) | `0px` (`720/720`) | `0s` | **PASS** |
| **Mobile 320 + Reduced Motion** | `320 × 568` (`1x`) | `reduce` | `0px` (`320/320`) | `0px` (`320/320`) | `0px` (`320/320`) | `0px` (`320/320`) | `0s` | **PASS** |

---

## 4. 연속 사용자 흐름 7단계 시나리오 검증 결과 (`320×720` · `reduced-motion: reduce` · 키보드 병행)

1. **1단계 (프리셋 검색 · 키보드 지우기 · 좁은 화면 패널 접기)**:
   - `#lab-draw-search`에 `"수채"` 입력 → `lab-draw-filter-summary`가 `"표시 2/31종"` 표시 확인.
   - `Escape` 키 입력 → 검색어 즉시 초기화(`""`), `수채` 가족 필터 선택 후 좁은 화면 캔버스 확보를 위해 `lab-draw-panel-toggle`로 설정 패널 접기(`step1PanelClosed: true`).
2. **2단계 (키보드 탭 전환 → 갤러리 검색 · 빈 결과 복구 → '그리기에서 시험')**:
   - `#lab-tab-draw`에서 `ArrowRight` 키로 `갤러리` 탭 이동 → 최상단 `<h2>`가 `"브러시 가족 갤러리"`임을 확인.
   - `"없는브러시이름"` 검색 시 빈 상태 안내(`lab-gallery-empty`, `emptyVisible: true`) 확인 후 `Escape` 키로 복구.
   - `"pencil-6b"` 검색(`표시 1/31종`) 후 카드에서 `'그리기에서 시험'`(`lab-preset-draw-pencil-6b`) 클릭.
3. **3단계 (그리기 자동 복귀 · 접힌 패널 자동 펼침 · 목록 필터 밖 안내 해소)**:
   - `그리기` 탭 자동 복귀와 동시에 접혀 있던 `#lab-draw-side`가 자동으로 열림(`step3PanelReopened: true`).
   - 기존 `수채` 필터로 인해 상단 현재 브러시 카드(`연필 6B`)에 `"목록 필터 밖"`(`lab-draw-current-filtered-badge`) 배지가 표시됨을 확인하고, `탐색 필터 초기화`(`lab-draw-filter-reset`) 클릭 시 배지가 즉시 사라짐(`step3BadgeGone: true`).
4. **4단계 (파라미터 조정 · 키보드 단축키)**:
   - `종이 종류`를 `"rough"`로 변경 → `grain` 자동 활성화가 중복 합산되지 않고 `"사용자 조정 1개"` 및 요약줄 `"크기 10px · 불투명도 100% · 흐름 85% · 보정 one-euro · 종이 rough"` 표시 확인.
   - 캔버스 포커스 후 키보드 `]` 단축키 입력 → 크기가 `12px`로 증가하고 `"사용자 조정 2개"`로 갱신.
5. **5단계 (그리기 실행)**:
   - `lab-draw-stage`에 포인터 드로잉 1획 수행 → 상단 툴바 배지(`lab-draw-brush-pill`)가 `"연필 6B · 브러시 12px · 안정화 one-euro · 1획"`으로 갱신.
6. **6단계 (탭 전환 → 복귀 연속성)**:
   - `A/B 비교` 탭 클릭(`lab-param-status`: `"프리셋 기본값"`, 프리셋 `pencil-6b` 동기화 확인) → 키보드 `ArrowRight`로 `리포트` 탭 이동 → 키보드 `Home`으로 `그리기` 탭 복귀.
   - 복귀 후에도 동일한 캔버스 세션과 `"연필 6B · 브러시 12px · 안정화 one-euro · 1획"` 상태가 그대로 유지됨.
7. **7단계 (좁은 화면 패널 접힘 상태에서 툴바 빠른 초기화)**:
   - 320px 화면에서 `lab-draw-panel-toggle`로 설정 패널을 접은 뒤, 상단 툴바에 노출된 `'설정 초기화'`(`lab-draw-toolbar-reset`) 클릭.
   - 그린 획(`1획`)은 그대로 보존(`"연필 6B · 브러시 10px · 안정화 one-euro · 1획"`)되면서 브러시 파라미터만 기본값(`"프리셋 기본값"`)으로 즉시 복원됨(`pageErrors: []`).

---

## 5. 독립 감사 · 정적 분석 · 단위/경계 테스트 결과

- **독립 서브에이전트 감사 (`research` subagent)**: 소유권 경계, 연속 사용자 흐름 7단계, 반응형·키보드·reduced-motion, `AGENTS.md` 코드 품질 전 항목 **PASS**.
- **타입체크**: `pnpm typecheck:brush-lab` — 오류 0건 (**PASS**)
- **ESLint**: `pnpm exec eslint --max-warnings=0 apps/brush-lab/src/app/ui apps/brush-lab/src/app/views apps/brush-lab/src/app/shell` — 경고/오류 0건 (**PASS**)
- **단위 및 경계 테스트**:
  - `DrawView.test.tsx` (40 tests, 연속 작업 흐름 회귀 테스트 포함) — **PASS**
  - `GalleryView.test.tsx` (4 tests, 필터 배지·빈 결과 복구·추천 조합 테이블 래퍼·프리셋 동기화 포함) — **PASS**
  - `CompareView.test.tsx` (8 tests) — **PASS**
  - `BrushLabApp.test.tsx` (7 tests) — **PASS**
  - `RecommendedCombos.test.tsx` (2 tests) — **PASS**
  - `boundary.test.ts` (51 tests) — **PASS**
- **프로덕션 빌드**: `pnpm build:brush-lab` — **PASS**
