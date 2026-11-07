# Brush Lab R&D 결과 비교 가독성 개선 증거 (`brush-comparison-round4-20261107`)

## 1. 작업 범위 및 소유권 경계

- **소유 및 수정 파일 (`apps/brush-lab` 로컬 UI 및 직접 테스트 한정)**:
  - `apps/brush-lab/src/app/ui/PresetComparisonBar.tsx` (신규 — 동일 샘플 획 기준 프리셋 A/B 선택·비교 순서·스키마 파라미터 차이·설정 되돌리기 요약 바)
  - `apps/brush-lab/src/app/views/CompareView.tsx` (비교 요약 바 연결 및 실행 전 빈 비교 상태 안내 배너 추가)
  - `apps/brush-lab/src/app/ui/PresetCard.tsx` (갤러리 카드 `기준 A` / `비교 대상 B` 선택 배지·강조 테두리 및 `비교 B로 지정` 버튼 추가)
  - `apps/brush-lab/src/app/ui/FamilyGallery.tsx` (동일 샘플 획 `zigzag 256²` 기준 프리셋 A/B 비교 바, 파라미터 차이 칩, 필터 변경 시 결과·순서 보존 안내 추가)
  - `apps/brush-lab/src/app/ui/RecommendedCombos.tsx` (추천 조합 상단 측정 기준 및 출처 안내 기본 접힘 `<details>` 처리)
  - `apps/brush-lab/src/app/ui/LaneCanvas.tsx` (캔버스 캡션 상태 배지 `완료`/`결과 없음` 추가 및 `pixelHash`·영수증 고급 진단 기본 접힘 `<details>` 처리)
  - `apps/brush-lab/src/app/styles/brush-lab.css` (`<figure class="lab-canvas-frame">` 기본 브라우저 좌우 여백 `margin: 0` 초기화, 작은 화면 카드 패딩·간격 보정, `.lab-card--selected` 및 `.lab-button[aria-pressed="true"]` 선택 강조 스타일 추가)
  - `apps/brush-lab/src/app/views/CompareView.test.tsx`, `apps/brush-lab/src/app/views/GalleryView.test.tsx` (직접 연결된 회귀·단위 테스트)
- **비수정 경계 준수**:
  - `DrawView` 엔진, 공유 브러시 모델, 공유 스토어/스키마/라우트/테마(`lab-store.ts`, `draw-store.ts`, `run-compare.ts`, `engine/**`, `lanes/**`, `platform/**`, `packages/**`, `apps/web/**`) 수정 **0건**.
  - 타 CI 담당 소유인 `PackagePanel` 및 `package-panel`/`PackageDetail` 수정 **0건**.
  - 수치 추정·성능 효과 과장 문구 **0건** (`BrushProgram` 스키마의 실제 필드 값만 대조하여 표시).

---

## 2. 재현된 결함 및 최소 수정 내역

1. **동일 샘플 획 프리셋 A/B 선택·비교 순서·파라미터 차이 가시성 부족**:
   - **재현**: `CompareView`와 `FamilyGallery`에서 현재 선택된 프리셋이 기준 A인지 비교 대상 B인지, 두 프리셋 간 어떤 스키마 파라미터(`sizePx`, `hardness`, `spacing`, `opacity`, `flow`, `scatterPx`, `kind`, `filter`, `grain`, `wetBeta`, `kmBeta`)가 다른지 한눈에 대조하기 어려웠음.
   - **최소 수정**: `PresetComparisonBar.tsx`와 `FamilyGallery.tsx` 상단에 동일 샘플 획 배지(`내장 zigzag 256² · 시드 42` 또는 캡처 획 표본 정보), 비교 순서(`기준 A [...] → 비교 B [...]`, `레인 순서: A [...] → B [...]`), `프리셋 A ↔ B 순서 바꾸기`, `레인 A ↔ B 순서 바꾸기`, 실제 스키마 파라미터 차이 칩 목록(`computePresetParameterDiff`)을 표시하고, `PresetCard.tsx`에 `.lab-card--selected` 및 `선택됨 · 기준 A` / `비교 대상 B` 배지를 추가함.
2. **되돌리기·필터 변경·긴 이름에서 실험 결과 보존 및 확인성**:
   - **재현**: 프리셋·오버라이드·레인 순서를 바꾼 뒤 직전 비교 설정으로 되돌릴 때 이미 실행된 `results`·`reports`·`gallery.entries`가 유지되는지 UI 상에서 즉시 확인하기 어려웠고, 긴 영문 ID(`screentone-halftone`, `texture-canvas-stamp`) 선택 시 작은 화면에서 배지 줄바꿈이 넘칠 수 있었음.
   - **최소 수정**: `WeakMap<LabStore, CompareUiRecord>` 기반 설정 히스토리(최대 10단계 `undoCompareConfig`)를 제공하여 `results`·`reports`를 건드리지 않고 `{ presetId, comparePresetBId, overrides, laneA, laneB }`만 복원하며, `lab-compare-result-preserved` 및 `lab-gallery-filter-preserved-note`로 실험 결과 보존 상태를 명시함. 모든 비교 카드·칩에 `min-width: 0; overflow-wrap: anywhere;`를 적용함.
3. **작은 화면(320px/390px) 비교 카드 간격·선택 표시·고급 정보 접기·빈 비교 상태**:
   - **재현**:
     - `LaneCanvas`와 `DiffHeatmap`의 루트 요소가 `<figure class="lab-canvas-frame">`인데 `.lab-canvas-frame`에 `margin: 0`이 없어 브라우저 기본 UA 스타일(`margin: 1em 40px`, 좌우 총 `80px`)이 적용되어 320px/390px 화면에서 비교 카드 폭을 과도하게 압박함.
     - `.lab-button[aria-pressed="true"]` 스타일이 없어 빠른 시나리오 버튼의 선택 여부를 시각적으로 구분하기 어려웠음.
     - `LaneCanvas` 하단 `pixelHash` 및 `ReceiptMapping` 표, `RecommendedCombos` 출처 문단이 항상 펼쳐져 있어 작은 화면에서 핵심 캔버스·지표 비교 동선이 길어졌음.
     - `A/B 실행` 전이나 `결과 지우기` 직후 빈 캔버스만 표시되어 실행 준비 상태 안내가 부족했음.
   - **최소 수정**:
     - `.lab-canvas-frame`에 `margin: 0; padding: 12px;` (600px 이하 `padding: 10px; gap: 8px;`)를 적용해 UA 기본 여백을 제거함.
     - `.lab-button[aria-pressed="true"]` 및 `.lab-card--selected` 강조 스타일을 추가함.
     - `LaneCanvas`의 `pixelHash`·영수증(`lab-stage-diag-A/B`)과 `RecommendedCombos`의 출처 문단(`lab-recommended-provenance`)을 기본 접힘(`<details>`)으로 정리함.
     - 결과가 없을 때 `lab-compare-empty-state` 배너와 `지금 A/B 실행 (단축키 R)` 버튼(`lab-compare-empty-run-btn`)을 노출함.

---

## 3. 검증 증거 요약

### 3.1 단위·통합·경계 테스트 및 정적 검사
- `pnpm typecheck:brush-lab`: **PASS** (오류 0건)
- `pnpm exec eslint --max-warnings=0 apps/brush-lab/src/app/ui apps/brush-lab/src/app/views apps/brush-lab/src/app/shell`: **PASS** (오류 0건, 경고 0건)
- `node scripts/check-source-file-size.mjs`: **PASS** (모든 수정/신규 TS/TSX 파일 440줄 이하, 상한 800줄 준수)
- `pnpm --filter @toonstudio/brush-lab exec vitest run --pool=forks --maxWorkers=1 src/app/views/CompareView.test.tsx src/app/views/GalleryView.test.tsx src/app/ui/RecommendedCombos.test.tsx src/boundary.test.ts`: **PASS** (4개 테스트 파일, 66개 테스트 전원 통과)
- `pnpm build:brush-lab`: **PASS**

### 3.2 실제 브라우저(Headless Chromium) 320 / 390 / 768 / 1440 / 200% 확대 검증
상세 측정 JSON은 [`browser-verification.json`](./browser-verification.json)에 기록되어 있다.

| 뷰포트 / 배율 | 해상도 | Compare 가로 오버플로 | Gallery 가로 오버플로 | `.lab-canvas-frame` 좌우 마진 | `.lab-canvas-frame` 패딩 | 선택 카드 테두리 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: |
| `mobile-320` | `320×568` (100%) | `0px` | `0px` | `0px / 0px` | `10px` | `rgb(143, 126, 255)` |
| `mobile-390` | `390×844` (100%) | `0px` | `0px` | `0px / 0px` | `10px` | `rgb(143, 126, 255)` |
| `tablet-768` | `768×1024` (100%) | `0px` | `0px` | `0px / 0px` | `12px` | `rgb(143, 126, 255)` |
| `pc-1440` | `1440×900` (100%) | `0px` | `0px` | `0px / 0px` | `12px` | `rgb(143, 126, 255)` |
| `pc-1440-zoom200` | `1440×900` (200% zoom) | `0px` | `0px` | `0px / 0px` | `12px` | `rgb(143, 126, 255)` |
| `reflow-720-equiv200` | `720×450` (WCAG 200% reflow) | `0px` | `0px` | `0px / 0px` | `12px` | `rgb(143, 126, 255)` |

- 합성 fixture(`zigzag`, `256×256`, 시드 `42`) 기준 빈 비교 상태 배너 확인 → `지금 A/B 실행` → 긴 이름 프리셋(`texture-canvas-stamp`) 대조 → `프리셋 A ↔ B 순서 바꾸기` → `레인 A ↔ B 순서 바꾸기` → `이전 설정으로 되돌리기` 2회 → 갤러리 탭 전환·필터 변경·검색·초기화 → 비교 탭 복귀 전 과정에서 페이지 런타임 오류 **0건**(`pageErrors: []`) 및 실험 결과·리포트 100% 보존 확인.
- 검증 완료 후 자체 실행한 로컬 정적 서버 및 Headless Chromium 인스턴스를 즉시 종료·정리함.

### 3.3 독립 서브에이전트 감사 결과
- `research` 서브에이전트(`Round 4 Brush Comparison Independent Auditor`) 독립 감사 결과:
  1. **범위 및 소유권 준수**: **PASS** (`apps/brush-lab` 로컬 UI 및 직접 테스트만 변경, 엔진/공통/타 페이지/`PackagePanel` 변경 0건)
  2. **기능 및 비교 가독성 요구사항**: **PASS** (동일 샘플 획 A/B 선택·순서·스키마 파라미터 차이·되돌리기/필터/긴 이름 결과 보존·작은 화면 간격·고급 정보 접기·빈 비교 상태 모두 충족)
  3. **코드 품질 및 `AGENTS.md` 준수**: **PASS** (한글 전용, `any`/`@ts-ignore`/빈 `catch`/`.skip` 0건, 800줄 제한 준수)
