# ToonStudio 드로잉 페이지 로컬 UI 작업영역 확보 및 메뉴 밀도 개선 증거 문서 (`2026-11-07`)

## 1. 개요 및 목표
- **목표**: ToonStudio 드로잉 페이지 로컬 UI(`StudioDrawingAppBar`, `StudioDrawOptionsBar`, `StudioMobileEditingDock`)의 캔버스 작업영역 확보 및 첫 화면 메뉴 밀도 개선.
- **핵심 요구사항**:
  1. **기본 도구만 우선 노출 · 고급 도구 접기(Disclosure)**: 첫 화면에는 드로잉 핵심 도구만 우선 배치하고 고급 설정·보조 컨트롤은 기본 접힘(`aria-expanded="false"`) 처리.
  2. **모바일 Panel Dismiss 및 키보드 포커스 복원**: 모바일 시트·스트립·색상 팝오버·고급 옵션 패널을 `Escape` 키, 외부 포인터(`pointerdown`), 닫기 버튼으로 닫을 수 있게 하고 닫힌 뒤 트리거/런처로 키보드 포커스를 결정론적으로 복원.
  3. **Canvas 가림 방지**: 상단 고급 옵션 패널이 캔버스 레이아웃을 밀어내지 않도록 오버레이로 렌더링하고 외부 탭 시 즉시 닫히며, 모바일 시트 활성 시 상단 빠른 스트립을 자동 숨김 처리하고, 모바일 색상 도구 열림 시 하단 선택 작업바 중첩을 차단.

---

## 2. 기존 `main` 완료분 확인 및 소유 파일 경계

### 2-1. 기존 `main` 완료 작업 확인 (중복 재구현 방지)
- `StudioWorkModeBar.tsx` (`563a79ba`): 작업 모드 바 접기/펼치기 및 기본 컨트롤 축소 이미 반영됨 → **재구현 제외**.
- `StudioCinematicCanvasWelcome.tsx`, `StudioCanvasStartMethods.tsx`, `StudioBrushHud.tsx` (`c21dfab3`, `cb38f5cc`, `9314ef6e`): 캔버스 시작 오버레이 축소 및 브러시 HUD 위치·밀도 최적화 이미 반영됨 → **재구현 제외**.
- `StudioOfflinePanel.tsx` (`ce0dd32b`): 오프라인 배너 슬림화 이미 반영됨 → **재구현 제외**.
- `StudioInspectorDrawingSection.tsx`: `studio-inspector-density.test.ts` 계약에 의해 기본 노출 섹션 예산(5~9개) 및 고급 섹션(`tool.line-correction`, `tool.brush-studio`, `tool.brush-engines`, `tool.symmetry`, `tool.rulers`) 기본 접힘 이미 적용됨 → **재구현 제외**.

### 2-2. 소유 파일 목록 및 금지 영역 비침범 증명
- **소유 및 변경한 드로잉 로컬 UI 파일 (총 6개 + 증거 문서)**:
  1. `apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingAppBar.tsx`
  2. `apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingAppBar.test.tsx`
  3. `apps/web/src/domains/creator/brush/StudioDrawOptionsBar.tsx`
  4. `apps/web/src/domains/creator/brush/StudioDrawOptionsBar.test.tsx`
  5. `apps/web/src/domains/creator/StudioMobileEditingDock.tsx`
  6. `apps/web/src/domains/creator/StudioMobileEditingDock.test.tsx`
  7. `docs/parallel-toon-drawing-20261107/` (본 증거 문서 및 브라우저 검증 스크립트·결과 JSON)
- **수정 금지 영역 변경 0건 확인**:
  - 브러시 엔진(`studio-brush-engine*`, `studio-living-ink*`, `studio-physics-particle-brush*` 등): **변경 0건**
  - 캐릭터랩(`character-platform`, `vrm`, `bg3d`, `scene-3d` 등): **변경 0건**
  - 공통 shell / store / route / theme / config / 데이터 저장·CRDT 로직: **변경 0건**

---

## 3. 상세 구현 내역

### 3-1. `StudioDrawingAppBar.tsx` (드로잉 앱 상단 툴바)
- **기본 핵심 도구 우선 노출**:
  - 상단 기본 행(`data-studio-appbar-core-controls="true"`)에 **브러시 라이브러리 선택, 브러시 크기 빠른 조절, 불투명도 빠른 조절, 현재 색상 스와치, 고급 드로잉 옵션 토글, 원고 동기화 상태**만 배치하고, 우측 영역에는 **실행 취소, 다시 실행, 컬러 휠, 좌·우 패널 토글, 캔버스만 보기, 모바일 빠른 스트립 토글**만 유지했습니다.
- **고급 옵션 기본 접힘 및 활성 개수 배지**:
  - **손떨림 보정, 대칭 그리기, 캔버스 좌우 반전, 브러시 랩, 빠른 도형 보정, 캔버스 배율 100% 초기화, 퀵 액세스, 단축키 및 입문 가이드, 전체 스튜디오 링크** 9종 컨트롤을 `data-testid="drawing-appbar-advanced-toggle"` (`aria-expanded="false"`, `aria-controls="studio-drawing-appbar-advanced-panel"`) 뒤로 기본 접힘 처리했습니다.
  - 접힌 상태에서도 비기본 고급 설정 활성 개수를 `data-testid="drawing-appbar-advanced-active-count"` 배지로 표시합니다.
- **오버레이 렌더링 · 외부 탭/Escape 닫기 · 포커스 복원**:
  - `#studio-drawing-appbar-advanced-panel`을 `absolute inset-x-0 top-full z-40` 오버레이로 열어 캔버스 레이아웃 리플로우(밀림)가 발생하지 않으며, 헤더 외부 `pointerdown` 입력 시 자동으로 닫힙니다.
  - `Escape` 키 또는 닫기 버튼(`drawing-appbar-advanced-close`) 입력 시 패널을 닫고 `advancedToggleRef`로 포커스를 복원합니다.
- **모바일 빠른 스트립(`#studio-drawing-mobile-quick-strip`) 접기 및 시트 연동 자동 숨김**:
  - 모바일 빠른 스트립에 접기/펼치기 토글(`drawing-appbar-mobile-strip-toggle`), 닫기 버튼(`drawing-appbar-mobile-strip-dismiss`), `Escape` 키 닫기 및 포커스 복원을 추가했습니다.
  - `s.mobileSheet` 또는 `s.canvasOnlyMode` 활성 시 모바일 빠른 스트립을 자동 숨김(`hidden`) 처리하여 모바일 320px/390px에서 상·하단 동시 캔버스 가림을 방지했습니다.

### 3-2. `StudioDrawOptionsBar.tsx` (통합 캔버스 드로잉 옵션바)
- `#studio-draw-advanced`(`role="toolbar"`, `aria-label="세부 그리기 옵션"`)가 열린 상태에서 `Escape` 키 입력 시 세부 옵션 행을 즉시 닫고 토글 버튼(`[data-studio-draw-advanced-toggle="true"]`)으로 키보드 포커스를 결정론적으로 복원하도록 구현했습니다.

### 3-3. `StudioMobileEditingDock.tsx` (모바일 하단 편집 도크 및 시트)
- **하단 다중 플로팅 바 중첩 및 캔버스 가림 방지**:
  - 브러시 색상 팝오버(`colorToolsOpen`)가 열린 동안 선택 빠른 작업바(`data-studio-mobile-selection-actions="true"`)를 숨겨 하단 플로팅 바 중첩으로 인한 캔버스 가림을 차단했습니다.
- **모바일 브러시 설정 시트(`#studio-mobile-draw-settings`) 및 색각 검수 시트(`section[aria-label="색각 검수"]`) Dismiss & 포커스 복원**:
  - 브러시 설정 시트에서 `Escape` 키 또는 닫기 버튼 입력 시 `dismissDrawSettings()`를 호출하여 시트를 닫고 활성 드로잉 도크 런처(`mobileBrushDockButtonRef` 또는 `[aria-controls="studio-mobile-draw-settings"]`)로 키보드 포커스를 복원합니다.
  - 색각 검수 시트 열림 상태에서 `Escape` 키 또는 닫기 버튼 입력 시 시트를 닫고 `[data-studio-color-vision-trigger="true"]` 또는 `workspaceToggleRef`로 포커스를 복원합니다.

---

## 4. 품질 게이트 및 테스트 검증 결과

| 검증 항목 | 실행 명령 / 대상 | 결과 |
| --- | --- | --- |
| 드로잉 앱바 단위·회귀 테스트 | `npx vitest run apps/web/src/domains/creator/studio-cuttoon-editor/StudioDrawingAppBar.test.tsx` | **PASS (11 / 11 통과)** |
| 드로잉 옵션바 단위·회귀 테스트 | `npx vitest run apps/web/src/domains/creator/brush/StudioDrawOptionsBar.test.tsx` | **PASS (35 / 35 통과)** |
| 모바일 도크 단위·회귀 테스트 | `npx vitest run apps/web/src/domains/creator/StudioMobileEditingDock.test.tsx` | **PASS (55 / 55 통과)** |
| 아키텍처·경계·힌트·다국어 계약 테스트 | `studio-mobile-editing-dock-boundary.test.ts` (6), `studio-options-bars-boundary.test.ts` (5), `studio-tool-hint-consumer-mappings.test.ts` (9), `StudioWorkModeBar.disclosure.test.tsx`, `studio-frozen5-status-i18n-r6frz5.test.ts` | **PASS (전수 통과)** |
| 소스 파일 크기 래칫 검사 | `node scripts/check-source-file-size.mjs` | **PASS (`StudioDrawOptionsBar.tsx` 1,387줄 ≤ 1,391줄 기준선, `StudioMobileEditingDock.tsx` 1,993줄 ≤ 1,994줄 기준선)** |
| Studio 정적 진입 그래프 래칫 | `pnpm run check:studio-eager-graph` | **PASS (1,675개 모듈, 19.54 MiB 허용 범위 내, 금지 도메인 증가 0)** |
| TypeScript 구문·의미 타입 검사 | 수정 6개 파일 및 전이 의존성 그래프(10,753개 모듈) `ts.createProgram` 검사 | **PASS (0 errors)** |
| ESLint 정적 분석 (`jsx-a11y` 포함) | `npx eslint` (수정된 6개 파일) | **PASS (0 errors, 0 warnings)** |
| 시크릿 노출 검사 | `pnpm run quality:secrets:changed` | **PASS (위반 0건)** |

---

## 5. 멀티 뷰포트(320 / 390 / 768 / 1440 / 200% 확대) 브라우저 검증
- **검증 스크립트**: `docs/parallel-toon-drawing-20261107/verify-drawing-ui.mjs`
- **검증 데이터 산출물**: `docs/parallel-toon-drawing-20261107/browser-verification.json`
- **검증 뷰포트**:
  - `mobile-320`: `320×568` (모바일 소형)
  - `mobile-390`: `390×844` (모바일 표준)
  - `tablet-768`: `768×1024` (태블릿)
  - `pc-1440`: `1440×900` (데스크톱 PC)
  - `pc-1440-zoom-200`: `1440×900` 200% 확대 (`720×450` 유효 CSS 픽셀, `deviceScaleFactor: 2`)
- **검증 항목**:
  - 모든 뷰포트에서 가로 오버플로 `docOverflowX === 0`
  - 캔버스 중앙 좌표(`elementFromPoint`) 비가림 확인(`canvasCenterUnoccluded === true`)
  - 첫 화면에서 고급 드로잉 옵션 기본 접힘(`defaultCollapsed === true`) 및 펼침 시 캔버스 레이아웃 밀림 0px(`zeroLayoutShiftOnOpen === true`)
  - `Escape` 키 및 외부 포인터(`pointerdown`)로 패널·시트·스트립 닫기 및 트리거 버튼 포커스 복원(`escapeClosedAndFocused === true`, `outsidePointerClosed === true`)
  - 모바일 시트 열림 시 상단 빠른 스트립 자동 숨김(`stripAutoHiddenWhileSheetOpen === true`)

---

## 6. 독립 검증 서브에이전트 감사 결과 (`Drawing UI Independent Auditor`)
- 독립 서브에이전트(`research` 역할, 대화 ID `efccb35cab1285f8483ce5f01a744773`)가 코드 변경분과 테스트를 별도 컨텍스트에서 전수 감사하여 다음 항목 모두 **PASS** 판정을 내렸습니다:
  1. **소유 경계 및 수정 금지 영역 준수**: 6개 드로잉 로컬 UI 및 테스트 파일 외 변경 0건, Brush engine / 캐릭터랩 / 공통 store·shell·저장 로직 침범 0건.
  2. **핵심 요구사항 3대 항목**: 기본 도구 우선·고급 접기, 모바일 panel dismiss 및 키보드 포커스 복원, canvas 가림 방지 로직 정상 동작.
  3. **단위 회귀 테스트 커버리지**: 3개 테스트 파일의 신규·수정 테스트가 모든 상호작용 계약을 검증함.
