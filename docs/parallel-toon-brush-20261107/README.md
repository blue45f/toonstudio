# ToonStudio Brush Labs 조작 패널 로컬 UI 개선 검증 보고서 (`parallel-toon-brush-20261107`)

- **작성일**: 2026-11-07
- **작업 브랜치**: `feat/brush-lab-panel-ui-20261107` (기준 `origin/main` `e48cdc2563`)
- **소유 범위**: `apps/brush-lab/src/app/{ui,views,styles,shell}` 로컬 조작 패널 UI·스타일 및 단위 테스트, `docs/parallel-toon-brush-20261107/**` 증거 문서
- **변경 금지 준수**:
  - 캔버스 래스터/롤백 엔진(`apps/brush-lab/src/engine/**`, `apps/brush-lab/src/lanes/**`, `apps/brush-lab/src/platform/**`) **무변경**
  - 공통 패키지(`packages/**`) 및 메인 드로잉 앱(`apps/web/**`) **무변경**
  - 공유 라우트/스토어 계약/테마/설정(`package.json`, `pnpm-lock.yaml`, `vite.config.ts`, `tsconfig.json`, `draw-store.ts`, `lab-store.ts`) **무변경**

---

## 1. 핵심 개선 사항 요약

### 1.1 프리셋 탐색 동선 정리 (`DrawBrushPicker.tsx`, `FamilyGallery.tsx`, `PresetCard.tsx`, `DrawView.tsx`)
1. **작업자 중심 조작 패널 배치 (`DrawView.tsx`)**:
   - 우측 설정 패널(`aside#lab-draw-side`)의 섹션 순서를 기존 `엔진(레인) → 브러시 → 파라미터`에서 **`① 브러시 탐색(DrawBrushPicker) → ② 현재 브러시 설정(DrawParamPanel) → ③ 엔진(레인) 선택(DrawLaneSelect)`** 순으로 재배치하여 가장 빈번한 프리셋 탐색과 브러시 조정 동선을 최상단에 배치했습니다.
   - 상단 툴바 상태 배지(`data-testid="lab-draw-brush-pill"`)에 현재 선택된 브러시 이름(`{preset.name} · 브러시 {size}px · 안정화 {mode}`)을 함께 표시하여 모바일/확대 환경에서 설정 패널을 접은 상태에서도 현재 브러시와 크기를 즉시 파악할 수 있습니다.
2. **탐색 결과 수 표시 및 필터·검색 원클릭 초기화 (`DrawBrushPicker.tsx`)**:
   - 섹션 헤더에 실시간 필터 결과 카운터(`data-testid="lab-draw-filter-summary"`, `표시 N/31종`)를 추가했습니다.
   - 검색어 입력 시 즉시 지울 수 있는 **`검색 지우기`** 버튼(`data-testid="lab-draw-search-clear"`)을 제공합니다.
   - 가족 칩이나 검색 필터가 활성화된 경우 상태 안내 바(`data-testid="lab-draw-filter-bar"`)와 **`탐색 필터 초기화`** 버튼(`data-testid="lab-draw-filter-reset"`)을 노출하여 한 번의 클릭으로 전체 목록(`all` + 빈 검색어)으로 복귀할 수 있습니다.
3. **갤러리 프리셋 탐색 → 그리기 샌드박스 즉시 시험 동선 (`FamilyGallery.tsx`, `PresetCard.tsx`)**:
   - 갤러리 탭의 각 프리셋 카드에 기존 `A/B 비교에서 열기` 버튼 외에 **`그리기에서 시험`** 버튼(`data-testid="lab-preset-draw-${preset.id}"`)을 추가하여, 카탈로그 탐색 중 원하는 프리셋을 클릭 한 번으로 그리기 탭에 적용해 바로 그려볼 수 있습니다.
   - `brush-lab.css`에 누락되어 있던 갤러리 매체군 필터 칩(`.lab-chip-row`, `.lab-chip`) 및 검색 입력창(`.lab-input`) 스타일을 정의하여 일관된 다크 UI와 포커스·활성 상태를 제공합니다.

### 1.2 현재 브러시 설정·미리보기·초기화 동선 정리 (`DrawBrushPicker.tsx`, `DrawParamPanel.tsx`)
1. **상단 고정 '현재 선택 브러시 요약·미리보기 카드' (`DrawBrushPicker.tsx`)**:
   - 브러시 탐색 섹션 최상단에 `data-testid="lab-draw-current-brush"` 요약 카드를 고정 배치했습니다.
   - 다른 매체군 칩이나 검색어로 목록을 필터링해 현재 브러시가 목록 밖으로 벗어나더라도, 상단 카드에서 **현재 브러시의 128×128 Worker 미리보기 썸네일(`ImageCanvas`), 한글 이름, 매체군 배지, 프리셋 ID, 설명, 기본 크기·불투명도·흐름**을 항상 확인할 수 있습니다.
   - 미리보기 지연 렌더링 큐에서 현재 선택된 브러시(`presetId`)가 필터 여부와 무관하게 항상 최우선으로 요청되도록 보장했습니다.
2. **현재 브러시 설정 상태 배지 및 상단 즉시 초기화 바 (`DrawParamPanel.tsx`)**:
   - 파라미터 섹션 최상단에 현재 설정 요약 바(`data-testid="lab-draw-param-summary"`)와 상태 배지(`data-testid="lab-draw-param-status"`)를 배치했습니다.
   - 프리셋 기본 상태일 때는 녹색 **`프리셋 기본값`** 배지를, 크기·불투명도·흐름·종이·입력 보정 등 오버라이드가 적용되면 황색 **`사용자 조정 N개`** 배지를 실시간으로 표시합니다.
   - 기존 패널 최하단까지 스크롤해야 했던 **`브러시 기본값으로`** 초기화 버튼(`data-testid="lab-draw-reset-params"`)을 상단 요약 바로 끌어올려 원클릭 초기화 동선을 단축했습니다.

### 1.3 고급 진단 접기 (`CapabilityBanner.tsx`, `DrawParamPanel.tsx`, `DrawLaneSelect.tsx`, `DrawHud.tsx`, `PresetCard.tsx`)
- ADR-0018(무음 대체 금지)에 따라 오류 알림(`role="alert"`), 미지원 사유 배지, 핵심 상태 요약은 항상 눈에 보이게 유지하면서, 화면 면적을 크게 차지하던 상세 기술 진단 영역 5곳을 기본 접힘(`<details>`) 구조로 정리했습니다:
  1. **상단 레인 능력 배너 (`CapabilityBanner.tsx`)**: `probe X/Y` 요약 문구와 앱 오류 목록은 상시 노출하고, 13개 레인별 상세 probe 목록은 `data-testid="lab-capability-details"` (`고급 진단 · 레인별 상세 probe 결과 보기 (지원 X · 불가 Y / 전체 13)`) 안에 기본 접힘으로 수납했습니다.
  2. **파라미터 패널 (`DrawParamPanel.tsx`)**: `configHash(fnv1a64)`(`data-testid="lab-draw-config-hash"`)와 `@toonstudio/*` import 경계 규칙 설명을 `data-testid="lab-draw-param-diagnostics"` (`고급 진단 · 설정 해시(configHash) 및 경계 규칙`) 안에 기본 접힘으로 수납했습니다(스키마 범위 오류 `lab-draw-program-error`는 즉시 노출 유지).
  3. **엔진(레인) 선택 패널 (`DrawLaneSelect.tsx`)**: 레인 드롭다운·능력 배지·초기화/오류 알림은 상단에 유지하고, 레인 선택 원칙(`lab-draw-lane-origin`) 및 문서 수명주기 안내는 `data-testid="lab-draw-lane-diagnostics"` 안에 기본 접힘으로 수납했습니다.
  4. **하단 표시·성능 HUD (`DrawHud.tsx`)**: 현재 레인·브러시·문서 크기·준비 상태(`lab-draw-status`)·첫 획 온보딩 안내·경고 배지는 상시 노출하고, 프레임당 `addSamples p50/p95`, `endStroke`, `readback`, `dab 수`, `비닝 초과 dab`, `ReceiptMapping`은 `data-testid="lab-draw-hud-details"` 안에 기본 접힘으로 수납했습니다.
  5. **갤러리 프리셋 카드 (`PresetCard.tsx`)**: 썸네일·이름·매체군·실행 버튼은 상시 노출하고, 픽셀 결정성 해시(`pixelHash`) 및 가족 지표 판정 목록은 `data-testid="lab-preset-diag-${preset.id}"` 안에 기본 접힘으로 수납했습니다.

### 1.4 반응형 레이아웃 및 가로 오버플로 결함 수정 (`brush-lab.css`)
- 기존 `brush-lab.css`에서 `@media (min-width: 420px)`일 때 `.lab-draw-recent`(최근 색 8칸)가 `repeat(8, 44px)`(총 폭 `394px`)로 고정되어 PC(1440px) 우측 사이드바(`300px~400px`, 내부 가용 폭 약 `340px`) 밖으로 가로 오버플로되던 결함을 `repeat(4, minmax(36px, 44px))` 유연 그리드로 수정했습니다.
- `.lab-grid-2`, `.lab-grid-3`, `.lab-form-grid`, `.lab-input`에 `min(100%, ...)` 기반 반응형 최소 폭을 적용하여 `320px` 초소형 모바일 뷰포트와 `200%` 확대에서도 가로 스크롤(`horizontalOverflowPx === 0`)이 발생하지 않도록 개선했습니다.

---

## 2. 다이나믹 워크플로우: 병렬 독립 검증 결과

### 2.1 독립 서브에이전트 감사 (`research` 에이전트)
- **감사 범위**: 소유권 경계 준수, 요구사항 3대 축(프리셋 탐색 / 현재 브러시 설정·미리보기·초기화 / 고급 진단 접기) 충족 여부, `AGENTS.md` 및 `apps/brush-lab/AGENTS.md` 정적 규칙(`any`·`@ts-ignore`·빈 `catch`·`.skip` 금지, `import-x/order`, ADR-0018 무음 대체 금지, 반응형 CSS).
- **감사 판정**: **전 항목 통과 (PASS)** — 변경 파일 12개 모두 허용된 로컬 UI/스타일/테스트 범위 내에 있으며 금지 경로 침범 0건 확인.

### 2.2 실제 브라우저(Playwright Chromium) 뷰포트 & 200% 확대 검증 매트릭스

프로덕션 빌드(`pnpm build:brush-lab`) 후 `vite preview` 서버를 띄워 실제 Chromium 브라우저(`/usr/bin/chromium`)에서 측정한 결과입니다:

| 뷰포트 구분 | 해상도 / 배율 | `clientWidth` | `scrollWidth` | 가로 오버플로 (`px`) | 최근 색 8칸 패널 내부 수납 | 고급 진단 4종 기본 접힘 (`open=false`) | 페이지 오류 | 판정 |
| :--- | :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **모바일 320** | `320 × 568` (100%) | 320 | 320 | `0` | `true` | `true` | `0` | **PASS** |
| **모바일 390** | `390 × 844` (100%) | 390 | 390 | `0` | `true` | `true` | `0` | **PASS** |
| **태블릿 768** | `768 × 1024` (100%) | 768 | 768 | `0` | `true` | `true` | `0` | **PASS** |
| **PC 1440** | `1440 × 900` (100%) | 1440 | 1440 | `0` | `true` | `true` | `0` | **PASS** |
| **PC 1440 (200% 확대)** | `1440 × 900` (`zoom: 2`) | 1440 | 1440 | `0` | `true` | `true` | `0` | **PASS** |
| **200% 리플로 등가** | `720 × 450` (100%) | 720 | 720 | `0` | `true` | `true` | `0` | **PASS** |

### 2.3 브라우저 E2E 인터랙션 및 실제 캔버스 드로잉 회귀 검증

| 검증 시나리오 | 실측 결과 | 판정 |
| :--- | :--- | :---: |
| 초기 현재 브러시 요약 카드 표시 (`lab-draw-current-brush`) | `"현재 브러시 연필 HB 연필 pencil-hb ... 기본 크기 6px · 불투명도 100% · 흐름 55%"` | **PASS** |
| 초기 설정 상태 배지 (`lab-draw-param-status`) | `"프리셋 기본값"` | **PASS** |
| 수채 칩 + `"수채"` 검색 필터 적용 (`lab-draw-filter-summary` / `lab-draw-filter-bar`) | `"표시 2/31종"` / `"현재 선택 브러시가 필터 밖에 있습니다(상단 카드에서 확인 가능) 탐색 필터 초기화"` | **PASS** |
| `탐색 필터 초기화` 원클릭 복원 (`lab-draw-filter-reset`) | `"표시 31/31종"` | **PASS** |
| 빠른 크기 칩(`태필 32px`) 클릭 시 상태 배지·툴바 배지 갱신 | `"사용자 조정 1개"` / `"연필 HB · 브러시 32px · 안정화 one-euro"` | **PASS** |
| 상단 `브러시 기본값으로` 클릭 시 초기화 (`lab-draw-reset-params`) | `"프리셋 기본값"` 복귀 | **PASS** |
| 고급 진단(`lab-draw-param-diagnostics`) 펼치기/접기 토글 | 펼침 시 `open=true`, `configHash(fnv1a64): 807ba270fe710af5` 노출 확인 후 다시 접기 동작 | **PASS** |
| 갤러리 탭 `연필 6B` 카드에서 `그리기에서 시험` 클릭 (`lab-preset-draw-pencil-6b`) | 그리기 탭 자동 전환 + 상단 현재 브러시 카드 `"현재 브러시 연필 6B ..."` 즉시 반영 | **PASS** |
| 실제 캔버스 포인터 드로잉(`lab-draw-stage` 마우스 다운·무브·업) | 획 합성 완료 및 `lab-draw-hud-strokes` = `"1"` 갱신 확인 | **PASS** |

---

## 3. 정적 분석·단위 테스트·경계 테스트 결과

| 검증 항목 | 실행 명령 | 결과 |
| :--- | :--- | :--- |
| **TypeScript 타입체크** | `pnpm typecheck:brush-lab` | **PASS** (오류 0건) |
| **ESLint (`--max-warnings=0`)** | `pnpm exec eslint --max-warnings=0 apps/brush-lab/src/app/{ui,views,shell}/**/*.{ts,tsx}` | **PASS** (오류 0건, 경고 0건) |
| **프로덕션 빌드** | `pnpm build:brush-lab` | **PASS** (`dist/` 번들 생성 완료) |
| **아키텍처 경계 및 UI 단위 테스트** | `pnpm --filter @toonstudio/brush-lab exec vitest run --maxWorkers=1 src/app src/boundary.test.ts` | **PASS** (23개 테스트 파일, **270개 테스트 전원 통과**) |

---

## 4. 변경 파일 목록

- `apps/brush-lab/src/app/styles/brush-lab.css`
- `apps/brush-lab/src/app/ui/CapabilityBanner.tsx`
- `apps/brush-lab/src/app/ui/DrawBrushPicker.tsx`
- `apps/brush-lab/src/app/ui/DrawHud.tsx`
- `apps/brush-lab/src/app/ui/DrawLaneSelect.tsx`
- `apps/brush-lab/src/app/ui/DrawParamPanel.tsx`
- `apps/brush-lab/src/app/ui/FamilyGallery.tsx`
- `apps/brush-lab/src/app/ui/PresetCard.tsx`
- `apps/brush-lab/src/app/views/DrawView.tsx`
- `apps/brush-lab/src/app/views/DrawView.test.tsx`
- `apps/brush-lab/src/app/views/GalleryView.test.tsx`
- `apps/brush-lab/src/app/shell/BrushLabApp.test.tsx`
- `docs/parallel-toon-brush-20261107/README.md`
