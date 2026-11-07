# ToonStudio Character Lab — Round 4 키보드 전용 회귀 QA 및 200% 확대·화면 회전 감사 보고서 (`2026-11-07`)

## 1. 감사 개요 및 소유 경계 (Scope & Ownership)

- **목적**: `apps/character-lab`에서 마우스/포인터 없이 **키보드만으로** `포즈 프리셋 선택 → 관절 선택 → 값 변경 → Undo/Redo → 내보내기 → 취소` 전체 여정을 실제 브라우저(Playwright + Chromium)에서 수행하고, **`200%` 확대 및 화면 회전(`320×640 ↔ 640×320`, `390×844 ↔ 844×390`, `768×1024 ↔ 1024×768`, `1440×900`, `1440×900 @ 200%`)** 환경에서 초점(`document.activeElement` / `:focus-visible`)·선택 요약(`pose-active-selection-summary`, `export-experiment-summary`)·실험 결과 보존 여부를 검증한다. 또한 실제 사용자 여정에서 발생하는 **숨은 조작(Hidden Controls)**, **포커스 트랩/탭 병목(Focus Trap & Tab Bottlenecks)**, **리그 미지원/미로드 안내(Rig Unsupported/Unloaded Guidance)** 결함을 재현하고 정확한 파일·라인 번호·스크린샷·최소 패치 diff를 제안한다.
- **읽기 전용(Read-Only) 소유 경계 준수**:
  - 소유 경로: `docs/character-keyboard-round4-20261107/**` (문서, 실측 JSON 리포트, 스크린샷 14종만 생성)
  - 수정 금지 경로(무변경 검증 완료): PR `#2740` (`apps/character-lab/src/app/shell/panels/PackagePanel.tsx`, `apps/character-lab/src/app/shell/panels/package-panel/PackageDetail.tsx`, `PackageDetail.test.tsx`)을 포함한 모든 `apps/character-lab/**` 앱 소스, 리깅 엔진, 공유 `packages/**`, 스토어, 스키마, 라우트, 테마, 다른 앱은 **단 1줄도 수정하지 않음(`0` files modified outside `docs/character-keyboard-round4-20261107/**`)**.

---

## 2. 키보드 전용 End-to-End 사용자 여정 실측 결과

실측 데이터 원본은 [verification-report.json](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/verification-report.json)에 기록되어 있으며, 전 과정에서 브라우저 콘솔 에러 `0`건(`consoleErrorCount: 0`), 페이지 런타임 예외 `0`건(`pageErrorCount: 0`)을 확인했다.

| 단계 | 키보드 입력 시퀀스 | 초점(`activeElement`) 및 `:focus-visible` 상태 | 선택 요약 및 실험 결과 보존 확인 | 결과 |
| --- | --- | --- | --- | --- |
| **Step 0: 초기 부팅 & 리그 전환** | `Tab` → `3`(포즈 탭 단축키) → `Tab`×`68`(`#cl-tab-pose`) → `Tab`×`7`(`리그·패키지 선택`) → `Enter` → `#cl-tab-package`에서 `Tab`×`7`(`절차 소스로 전환`) → `Enter` → `Shift+Tab`(`포즈 탭으로 이동`) → `Enter` | 초기 부팅(`DEFAULT_BOOT_SOURCE = "kit"`, 엔진 `idle`) 시 포즈 패널 내 42개 컨트롤이 `disabled`되어 포커스 가능한 요소는 3개뿐임. 키보드로 절차 소스로 전환 후 포즈 컨트롤 활성화 확인(단, 탭 전환 버튼 클릭 시 `activeElement`가 `BODY`로 유실되는 결함 `KBD-02` 재현). | `활성 리그: 모듈식 키트 (toonstudio-kit-v1 · 여성 베이스)` → `활성 리그: 절차적 휴머노이드`, `선택 상태: 기본 자세(Rest · 프리셋: A 포즈)` | **재현 및 전환 통과** ([keyboard-step0-initial-kit-unloaded-pose-disabled.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step0-initial-kit-unloaded-pose-disabled.png)) |
| **Step 1: 포즈 프리셋 선택** | `#cl-tab-pose`에서 `Tab`×`17` → `[data-preset-id="pose/wave"]`(`손 흔들기`) → `Enter` | `matchesFocusVisible: true`, 외곽선 `2px solid rgb(124, 104, 236)`, `aria-pressed="true"` | `선택 상태: 손 흔들기 (편집된 본 7개)` | **통과 (PASS)** ([keyboard-step1-pose-preset-selected.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step1-pose-preset-selected.png)) |
| **Step 2: 관절 선택 & 값 변경** | `Tab`×`19` → `.cl-pose-ik select`(`부위`) → `ArrowDown`×`2`(`leftArm` → `rightArm` → `leftLeg` `왼발`) → `Tab` → `목표 X (<input type="number">)` `ArrowUp`(`0.090` → `0.1`) → `Tab`×`3` → `위로 +10cm` `Enter` → `Tab`×`5` → `IK 적용` `Enter` | 각 컨트롤 이동 시 `:focus-visible === true` 유지. (단, 3D 뷰포트 SVG 관절 핸들은 `tabIndex` 미지원으로 키보드 접근 불가 — `KBD-03` 재현) | `.cl-pose-ik-status`: `왼발 목표 도달 (오차 0.0 mm)`, `pose-active-selection-summary`: `선택 상태: 손 흔들기 (편집된 본 9개)`, 히스토리 `깊이 3 · rev 3` | **통과 (PASS)** ([keyboard-step2-joint-ik-applied.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step2-joint-ik-applied.png)) |
| **Step 3: Undo / Redo** | ① `Shift+Tab`으로 `목표 Z (<input type="number">)` 포커스 중 `Ctrl+Z` 입력 → ② `Tab`으로 `IK 적용` 버튼 포커스 이동 후 `Ctrl+Z`×`2` → `Ctrl+Y` → `Ctrl+Shift+Z` | ① `<input type="number">` 포커스 중에는 `isEditableTarget` 가드로 인해 전역 Undo가 차단됨(`ctrlZBlockedOnNumberInput: true`, `KBD-03` 재현). ② `<button>` 포커스 중에는 `Ctrl+Z`/`Ctrl+Y`/`Ctrl+Shift+Z` 정상 작동. | Undo 1회: `손 흔들기 (편집된 본 7개)` (`깊이 2 · rev 4`) → Undo 2회: `기본 자세(Rest · 프리셋: A 포즈)` (`깊이 1 · rev 5`) → Redo 1회(`Ctrl+Y`): `손 흔들기 (편집된 본 7개)` → Redo 2회(`Ctrl+Shift+Z`): `손 흔들기 (편집된 본 9개)` (`깊이 3 · rev 7`) | **통과 / 입력란 차단 결함 재현** ([keyboard-step3-undo-redo-verified.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step3-undo-redo-verified.png)) |
| **Step 4: 내보내기 & 취소(Esc / 파일 선택 취소)** | `내보내기·보존` `Enter` → `#cl-tab-export`에서 `Tab`×`13` → `레시피 저장` `Enter` → `?`로 단축키 가이드 열기 후 `Escape` 닫기 → `레시피 불러오기`(`input[type="file"]`) 포커스 후 빈 파일 `change`(취소) 발생 | `레시피 저장` 버튼 `:focus-visible === true`. `Escape`로 도움말 닫기 시 패널은 닫히나 포커스가 `BODY`로 유실됨(`KBD-02`). `input[type="file"]` 포커스 시 부모 `<label class="cl-export-file">` 외곽선 미표시(`KBD-03`). | `export-experiment-summary`: `활성 소스: 절차적 휴머노이드 / 실험 포즈: 손 흔들기 (본 9개 · 손 relaxed) · 레시피 #4815c165`. 저장 영수증 `저장됨: character-4815c165-20261107.character.json (4,431 B · 4 ms)` 및 실험 요약이 `Escape` 취소·파일 선택 취소 후에도 100% 보존됨(`receiptPreservedAfterCancel: true`, `summaryPreservedAfterCancel: true`). | **통과 (PASS)** ([keyboard-step4-export-and-cancel.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step4-export-and-cancel.png)) |

---

## 3. `200%` 확대 및 화면 회전(Portrait ↔ Landscape) 검증 매트릭스

포즈 프리셋(`손 흔들기`, `[data-preset-id="pose/wave"]`)에 키보드 초점을 두고 관절 IK까지 적용한 상태(`편집된 본 9개`)에서 8개 뷰포트·회전·확대 조건을 연속 전환하며 측정한 결과는 다음과 같다.

| 뷰포트 / 회전·확대 조건 | 해상도 (`zoom`) | 가로 오버플로 (`px`) | 초점 보존 (`pose/wave` `:focus-visible`) | 선택 요약 및 실험 결과 보존 (`본 9개`) | `.cl-workbench-main` Sticky 비율 (`높이 / 창 높이`) | 포즈 편집 중 3D 뷰포트 가시성 (`mainRectTopPx`) | 스크린샷 증거 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| **모바일 S 세로 (Portrait)** | `320×640` (`100%`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | `45.0%` (`288px / 640px`) | `false` (`-2464px`, sticky 무효화) | [viewport-mobile-320x640-portrait.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-320x640-portrait.png) |
| **모바일 S 가로 회전 (Landscape)** | `640×320` (`100%`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | **`81.3%`** (`260px / 320px`, 잔여 `60px`) | `false` (`-2232px`, sticky 무효화) | [viewport-mobile-640x320-landscape-rotated.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-640x320-landscape-rotated.png) |
| **모바일 M 세로 (Portrait)** | `390×844` (`100%`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | `45.0%` (`380px / 844px`) | `false` (`-1863px`, sticky 무효화) | [viewport-mobile-390x844-portrait.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-390x844-portrait.png) |
| **모바일 M 가로 회전 (Landscape)** | `844×390` (`100%`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | **`66.7%`** (`260px / 390px`, 잔여 `130px`) | `false` (`-2011px`, sticky 무효화) | [viewport-mobile-844x390-landscape-rotated.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-844x390-landscape-rotated.png) |
| **태블릿 세로 (Portrait)** | `768×1024` (`100%`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | `45.0%` (`461px / 1024px`) | `false` (`-1736px`, sticky 무효화) | [viewport-tablet-768x1024-portrait.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-tablet-768x1024-portrait.png) |
| **태블릿 가로 회전 (Landscape)** | `1024×768` (`100%`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | `45.0%` (`346px / 768px`) | `false` (`-2090px`, sticky 무효화) | [viewport-tablet-1024x768-landscape-rotated.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-tablet-1024x768-landscape-rotated.png) |
| **PC 데스크톱 기본 (`100%`)** | `1440×900` (`100%`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | 3열 독립 스크롤 (`718px / 900px`) | **`true`** (`+158px`, 좌·중·우 동시 가시) | [viewport-desktop-1440x900-100pct.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-desktop-1440x900-100pct.png) |
| **PC 데스크톱 `200%` 확대** | `1440×900 @ 200%` (`720×450`, `zoom: 2`) | `0px` | `true` (`true`) | `손 흔들기 (편집된 본 9개)` (`true`) | **`115.6%`** (`520px / 450px`) | `false` (`-4788px`, sticky 무효화) | [viewport-desktop-1440x900-200pct-zoom.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-desktop-1440x900-200pct-zoom.png) |

---

## 4. 재현된 키보드 UX·접근성 결함 상세 및 최소 패치 제안 (Minimal Patch Proposals)

### 결함 KBD-01 [포커스 트랩 / 탭 이동 병목] — 다중 `role="tablist"`의 Roving `tabIndex` 미구현 및 숫자 단축키(`1`~`9`) 포커스 미이동으로 인한 `68`회 `Tab` 병목

- **재현 현상**:
  1. 앱 루트([`CharacterLabApp.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/CharacterLabApp.tsx#L59-L63))에 건너뛰기 링크(`skip link`)가 없고(`skipLinkCount: 0`), 좌측 [`SlotRail.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/SlotRail.tsx#L26-L61)(15개 버튼) + [`SlotPanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/SlotPanel.tsx#L211-L237)(`role="tablist"`, 15개 탭) + 우측 [`InspectorTabs.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/InspectorTabs.tsx#L38-L54)(`role="tablist"`, 9개 탭)의 모든 `<button role="tab">`이 기본 `tabIndex={0}`으로 렌더링된다(`slotPanelUsesRovingTabIndex: false`, `inspectorUsesRovingTabIndex: false`).
  2. `#cl-tab-pose`에서 `ArrowRight` 키를 눌러도 WAI-ARIA Tabs 표준 동작(인접 탭 이동)이 전혀 발생하지 않으며(`afterArrowRightOnInspectorTab: { activeId: "cl-tab-pose", selectedTabId: "cl-tab-pose" }`), 키보드 사용자가 상단 바에서 우측 포즈 탭(`#cl-tab-pose`)까지 도달하려면 **`68`회의 `Tab` 입력**(포즈 패널 본문 첫 버튼까지 총 **`75`회 `Tab`**)을 반복해야 한다.
  3. [`TopBar.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/TopBar.tsx#L103-L109)의 숫자 단축키 `1`~`9` 핸들러는 `setInspectorTab(tab)`만 호출하고 초점(`focus()`)을 해당 탭이나 탭패널로 옮기지 않는다. 따라서 `WebGPU` 버튼에 포커스가 있는 상태에서 `3`을 눌러 포즈 탭을 열어도 `document.activeElement`는 상단 바에 그대로 남아(`inTopBar: true, inPosePanel: false`), 다시 `68`회 `Tab`을 눌러야 포즈 패널에 진입할 수 있다.
- **정확한 파일 및 라인**:
  - [`apps/character-lab/src/app/shell/InspectorTabs.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/InspectorTabs.tsx#L38-L54)
  - [`apps/character-lab/src/app/shell/panels/SlotPanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/SlotPanel.tsx#L211-L237)
  - [`apps/character-lab/src/app/shell/TopBar.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/TopBar.tsx#L103-L109)
- **최소 패치 제안 (Diff)**:

```diff
--- a/apps/character-lab/src/app/shell/InspectorTabs.tsx
+++ b/apps/character-lab/src/app/shell/InspectorTabs.tsx
@@ -33,6 +33,21 @@ export function InspectorTabs({ panels }: InspectorTabsProps) {
   const ui = useUiState();
   const { setInspectorTab } = useUiActions();
   const Panel = panelForTab(panels, ui.inspectorTab);
+  const onTabKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
+    let nextIndex = index;
+    if (event.key === "ArrowRight") nextIndex = (index + 1) % INSPECTOR_TAB_IDS.length;
+    else if (event.key === "ArrowLeft") nextIndex = (index - 1 + INSPECTOR_TAB_IDS.length) % INSPECTOR_TAB_IDS.length;
+    else if (event.key === "Home") nextIndex = 0;
+    else if (event.key === "End") nextIndex = INSPECTOR_TAB_IDS.length - 1;
+    else return;
+    event.preventDefault();
+    const nextTab = INSPECTOR_TAB_IDS[nextIndex];
+    if (!nextTab) return;
+    setInspectorTab(nextTab);
+    requestAnimationFrame(() => {
+      document.getElementById(`cl-tab-${nextTab}`)?.focus();
+    });
+  };
   return (
     <div className="cl-inspector">
       <div className="cl-inspector-tabs" role="tablist" aria-label="인스펙터">
-        {INSPECTOR_TAB_IDS.map((tab) => (
+        {INSPECTOR_TAB_IDS.map((tab, index) => (
           <button
             key={tab}
             type="button"
             role="tab"
             id={`cl-tab-${tab}`}
             className="cl-inspector-tab"
             aria-selected={ui.inspectorTab === tab}
+            tabIndex={ui.inspectorTab === tab ? 0 : -1}
             aria-controls={`cl-tabpanel-${tab}`}
             data-missing={panelForTab(panels, tab) ? undefined : "true"}
             onClick={() => setInspectorTab(tab)}
+            onKeyDown={(event) => onTabKeyDown(event, index)}
           >
             {INSPECTOR_TAB_LABELS_KO[tab]}
           </button>
```

```diff
--- a/apps/character-lab/src/app/shell/TopBar.tsx
+++ b/apps/character-lab/src/app/shell/TopBar.tsx
@@ -105,6 +105,9 @@ export function TopBar() {
         if (tab) {
           event.preventDefault();
           setInspectorTab(tab);
+          requestAnimationFrame(() => {
+            document.getElementById(`cl-tab-${tab}`)?.focus();
+          });
         }
       }
     };
```

---

### 결함 KBD-02 [포커스 트랩 / 초점 유실] — 패널 내부 탭 전환 버튼 및 단축키 도움말 `Escape` 닫기 시 `document.body`로 초점 추락

- **재현 현상**:
  1. [`PosePanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/PosePanel.tsx#L439-L455)의 `리그·패키지 선택`(`pose-switch-to-package-tab`), `내보내기·보존`(`pose-switch-to-export-tab`) 또는 [`ExportPanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/ExportPanel.tsx#L353-L369)의 `패키지 선택 탭으로`, `포즈 실험 탭으로` 버튼에서 `Enter`를 누르면 현재 탭패널 컴포넌트가 즉시 언마운트된다. 이때 포커스를 가지고 있던 `<button>`이 DOM에서 제거되면서 브라우저가 **`document.activeElement`를 `document.body`로 초기화(`activeAfterCrossTabButton.isBody: true`, `activeAfterSwitchToExport.isBody: true`)**한다.
  2. 그 결과 사용자가 다음 조작을 위해 `Tab`을 누르면 포커스가 새로 열린 탭패널이 아니라 **페이지 최상단(`TopBar`의 `WebGPU` 버튼)으로 되돌아가 다시 `68`회 이상 `Tab`을 눌러야 하는 순환 루프(유사 포커스 트랩)**에 빠진다.
  3. 마찬가지로 [`TopBar.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/TopBar.tsx#L99-L102)에서 `?`로 단축키 가이드를 열고 내부 `닫기` 버튼에 포커스가 있을 때 `Escape` 또는 `Enter`로 닫으면 `[data-testid="topbar-help-toggle"]` 버튼으로 초점이 복귀하지 않고 `document.body`로 유실된다(`activeAfterHelpEsc.isBody: true`).
- **정확한 파일 및 라인**:
  - [`apps/character-lab/src/app/shell/panels/PosePanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/PosePanel.tsx#L439-L455)
  - [`apps/character-lab/src/app/shell/panels/ExportPanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/ExportPanel.tsx#L353-L369)
  - [`apps/character-lab/src/app/shell/TopBar.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/TopBar.tsx#L99-L102) (`:246-270`)
- **최소 패치 제안 (Diff)**:

```diff
--- a/apps/character-lab/src/app/shell/panels/PosePanel.tsx
+++ b/apps/character-lab/src/app/shell/panels/PosePanel.tsx
@@ -215,6 +215,12 @@ export function PosePanel() {
   const store = useLabStore();
   const dispatch = useDispatch();
   const { setInspectorTab } = useUiActions();
+  const switchInspectorTabWithFocus = (targetTab: "package" | "export"): void => {
+    setInspectorTab(targetTab);
+    requestAnimationFrame(() => {
+      document.getElementById(`cl-tab-${targetTab}`)?.focus();
+    });
+  };
@@ -440,15 +446,15 @@ export function PosePanel() {
           <button
             type="button"
             className="cl-button cl-pose-rig-switch"
             data-testid="pose-switch-to-package-tab"
-            onClick={() => setInspectorTab("package")}
+            onClick={() => switchInspectorTabWithFocus("package")}
           >
             리그·패키지 선택
           </button>
           <button
             type="button"
             className="cl-button cl-pose-rig-switch"
             data-testid="pose-switch-to-export-tab"
-            onClick={() => setInspectorTab("export")}
+            onClick={() => switchInspectorTabWithFocus("export")}
           >
             내보내기·보존
           </button>
```

---

### 결함 KBD-03 [숨은 조작] — ① 뷰포트 SVG 관절 핸들 키보드 접근 불가, ② 숫자 입력란(`<input type="number">`) 포커스 중 `Ctrl+Z` 전역 Undo 차단, ③ 파일 입력 라벨(`cl-export-file`) `:focus-within` 외곽선 누락

- **재현 현상**:
  1. **뷰포트 관절 핸들 포인터 전용 제한**: [`ViewportPane.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/ViewportPane.tsx#L709-L729)의 `<circle className="cl-viewport-handle">`는 `onPointerDown`/`onPointerMove`/`onPointerUp`만 바인딩되어 있고 `tabIndex`나 `onKeyDown`이 없어 키보드만으로는 3D 뷰포트 위에서 관절 핸들을 직접 선택하거나 회전시킬 수 없다(키보드 사용자는 반드시 우측 `PosePanel` 하단 `IK 목표` 필드셋으로 우회해야 함).
  2. **숫자 입력란 포커스 중 `Ctrl+Z` 레시피 Undo 차단**: [`TopBar.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/TopBar.tsx#L42-L45)(`:74`) 및 [`ViewportPane.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/ViewportPane.tsx#L317)의 `isEditableTarget(event.target)` 함수가 모든 `INPUT`·`SELECT`·`TEXTAREA`에서 전역 `Ctrl+Z` / `Ctrl+Y` 단축키를 조기 반환(`return`)한다. 그 결과 사용자가 `PosePanel`의 `부위 (<select>)`나 `목표 X/Y/Z (<input type="number">)`에서 화살표 키로 값을 바꾼 직후 `Ctrl+Z`를 눌러도 레시피 히스토리 Undo(`history/undo`)가 실행되지 않는다(`ctrlZBlockedOnNumberInput: true`).
  3. **파일 입력 라벨 외곽 포커스 링 누락**: [`ExportPanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/ExportPanel.tsx#L454-L468)의 `<label className="cl-export-file">레시피 불러오기<input type="file" ... /></label>`에서 키보드 `Tab`으로 파일 입력에 포커스하면 내부 네이티브 `<input>`에만 외곽선이 그려지고 카드형 `<label className="cl-export-file">` 자체에는 `:focus-within` 외곽선 규칙이 없어(`labelHasFocusWithinRule: false`, [keyboard-step4-export-and-cancel.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step4-export-and-cancel.png) 우측 하단 참조) 인접 버튼들과 포커스 표현이 불일치한다.
- **정확한 파일 및 라인**:
  - [`apps/character-lab/src/app/shell/TopBar.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/TopBar.tsx#L42-L45)
  - [`apps/character-lab/src/app/shell/panels/ViewportPane.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/ViewportPane.tsx#L317) (`:709-729`)
  - [`apps/character-lab/src/app/styles/character-lab.css`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/styles/character-lab.css#L149-L153)
- **최소 패치 제안 (Diff)**:

```diff
--- a/apps/character-lab/src/app/shell/TopBar.tsx
+++ b/apps/character-lab/src/app/shell/TopBar.tsx
@@ -41,7 +41,11 @@ export function detectQualityPreset(profile: ShadingProfile): QualityPresetId |
 
 function isEditableTarget(target: EventTarget | null): boolean {
   if (!(target instanceof HTMLElement)) return false;
-  return target.isContentEditable || target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT";
+  if (target.isContentEditable || target.tagName === "TEXTAREA") return true;
+  if (target instanceof HTMLInputElement) {
+    return target.type === "text" || target.type === "search" || target.type === "url" || target.type === "email" || target.type === "password";
+  }
+  return false;
 }
```

```diff
--- a/apps/character-lab/src/app/styles/character-lab.css
+++ b/apps/character-lab/src/app/styles/character-lab.css
@@ -146,7 +146,8 @@ p,
 }
 
 /* 키보드 포커스: 모든 대화형 요소 공통(색만으로 구분하지 않는다) */
-:where(button, input, select, textarea, summary, a, [tabindex]):focus-visible {
+:where(button, input, select, textarea, summary, a, [tabindex]):focus-visible,
+.cl-export-file:focus-within {
   outline: 2px solid var(--lab-accent);
   outline-offset: 2px;
   box-shadow: 0 0 0 3px rgba(124, 104, 236, 0.32);
```

---

### 결함 KBD-04 [숨은 조작 / 화면 회전·200% 확대 레이아웃] — 조상 `overflow-x: hidden`으로 인한 Sticky 뷰포트 무효화 및 가로 회전 시 `81.3%` 화면 잠식 위험

- **재현 현상**:
  1. [`character-lab.css`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/styles/character-lab.css#L400-L414)는 `@media (max-width: 1180px)`에서 `.cl-workbench-main`에 `order: -1; position: sticky; top: 0; z-index: 5;`를 지정해 작은 화면에서도 스크롤 중 3D 캐릭터 뷰포트가 상단에 고정되도록 설계했다.
  2. 그러나 상위 조상인 `body`([`character-lab.css:32`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/styles/character-lab.css#L32))와 `#root, .cl-app`([`character-lab.css:36-43`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/styles/character-lab.css#L36-L43))에 `overflow-x: hidden`이 선언되어 있어, CSS Overflow 명세에 따라 `overflow-y`가 `auto`로 계산되면서 `.cl-app`이 `position: sticky`의 기준 스크롤 컨테이너가 된다. `.cl-app`은 `height` 제한 없이 `min-height: 100vh`로 전체 콘텐츠 높이(`~3,000px`)만큼 늘어나므로 **`position: sticky`가 완전히 무효화**된다.
  3. 실측 결과, `320×640`, `640×320`, `390×844`, `844×390`, `768×1024`, `1024×768`, `1440×900 @ 200%` 모든 단일 열 뷰포트에서 키보드로 `PosePanel`에 포커스했을 때 `.cl-workbench-main`의 상단 좌표(`mainRectTopPx`)가 **`-1,736px` ~ `-4,788px` 화면 밖으로 밀려나(`mainViewportVisibleWhileEditingPose: false`)**, 사용자가 포즈를 바꾸거나 Undo/Redo를 수행하는 동안 3D 캐릭터 뷰포트를 전혀 볼 수 없다.
  4. 또한 `overflow-x: clip`으로 sticky를 복원할 경우, `.cl-workbench` 첫 행이 `minmax(260px, 45vh)`([`character-lab.css:403`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/styles/character-lab.css#L403))로 고정되어 있어 가로 회전(`640×320`: `260px / 320px = 81.3%`, 하단 가시 영역 단 `60px`; `844×390`: `260px / 390px = 66.7%`, 하단 가시 영역 `130px`) 및 `1440×900 @ 200%`(`520px / 450px = 115.6%`)에서 sticky 뷰포트가 하단 인스펙터의 포커스 요소를 덮어버리는 **초점 가림(WCAG 2.4.11 Focus Not Obscured 위반)**이 발생한다.
- **정확한 파일 및 라인**:
  - [`apps/character-lab/src/app/styles/character-lab.css`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/styles/character-lab.css#L27-L43) (`:400-414`)
- **최소 패치 제안 (Diff)**:

```diff
--- a/apps/character-lab/src/app/styles/character-lab.css
+++ b/apps/character-lab/src/app/styles/character-lab.css
@@ -29,16 +29,16 @@ body {
   min-width: 320px;
   max-width: 100vw;
   min-height: 100vh;
-  overflow-x: hidden;
+  overflow-x: clip;
   background: var(--lab-canvas);
 }
 
 #root,
 .cl-app {
   min-height: 100vh;
   max-width: 100vw;
-  overflow-x: hidden;
+  overflow-x: clip;
   display: flex;
   flex-direction: column;
 }
@@ -400,7 +400,8 @@ p,
 @media (max-width: 1180px) {
   .cl-workbench {
     grid-template-columns: minmax(0, 1fr);
-    grid-template-rows: minmax(260px, 45vh) auto auto;
+    grid-template-rows: minmax(180px, 38vh) auto auto;
+    scroll-padding-top: min(38vh, 260px);
   }
 
   /* 좁은 폭(H-02): 뷰포트를 맨 위에 두고 스크롤해도 화면 위에 고정한다(이전: 슬롯 목록 아래 y≈1400 px라 스크롤해야 캐릭터가 보였다). */
@@ -413,6 +414,15 @@ p,
     border-bottom: 1px solid var(--lab-line);
   }
 
+  @media (max-height: 500px) {
+    .cl-workbench {
+      grid-template-rows: minmax(140px, 32vh) auto auto;
+    }
+    .cl-workbench-main {
+      position: relative;
+    }
+  }
+
   .cl-workbench-left,
   .cl-workbench-right {
     border: 0;
```

---

### 결함 KBD-05 [리그 미지원·미로드 안내] — 미로드 리그를 `"스켈레톤 없음(정적 메시)"`로 오분류하는 안내 모순 및 비활성 컨트롤 건너뜀 시 `aria-describedby` 연결 부재

- **재현 현상**:
  1. 초기 부팅(`활성 리그: 모듈식 키트 (toonstudio-kit-v1 · 여성 베이스)`, 엔진 미선택) 또는 미로드 제작 패키지 레시피(`synthetic-unloaded-rig-qa.character.json`)를 불러온 상태에서 `capabilities.pose`는 `{ status: "unavailable", reasonKo: "캐릭터 소스가 아직 로드되지 않았습니다." }`이다([keyboard-step0-initial-kit-unloaded-pose-disabled.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step0-initial-kit-unloaded-pose-disabled.png), [keyboard-step5-unloaded-package-notice.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step5-unloaded-package-notice.png)).
  2. 그러나 [`PosePanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/PosePanel.tsx#L247)의 `const hasEmptySkeleton = (poseDisabled || hasEmptyEngineSkeleton) && !rigCorrupted;` 식이 `poseDisabled`(소스가 아직 로드되지 않은 상태)를 `hasEmptySkeleton = true`로 묶어버린다.
  3. 그 결과 이미 리깅된 모듈식 키트(`toonstudio-kit-v1`)가 활성 리그로 선택되어 있음에도:
     - `pose-active-selection-summary`([`PosePanel.tsx:253-254`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/PosePanel.tsx#L253-L254))에 **`선택 상태: 스켈레톤 없음(정적 메시)`**라는 잘못된 상태 요약이 표시되고,
     - `pose-empty-skeleton-notice`([`PosePanel.tsx:468-470`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/PosePanel.tsx#L468-L470))에 **`"스켈레톤이 없는 정적 메시이거나 포즈 본이 비어 있어 관절 회전·IK를 조작할 수 없습니다. 제작 패키지 탭에서 리깅된 캐릭터나 모듈식 키트를 선택하세요."`**라는 모순된 안내문이 출력된다.
  4. 또한 `poseBlocked === true`일 때 `PosePanel` 내 42개 컨트롤이 모두 `disabled` 처리되어 키보드 `Tab` 탐색에서 완전히 건너뛰어지며, 패널 내에서 유일하게 포커스를 받을 수 있는 3개 요소(`리그·패키지 선택`, `내보내기·보존`, `고급 진단 <summary>`) 중 어느 것도 `aria-describedby`로 미지원/미로드 사유 문구와 연결되어 있지 않아(`anyButtonLinksToNoticeViaAriaDescribedBy: false`), 키보드·스크린리더 사용자가 왜 포즈 프리셋과 관절 컨트롤이 건너뛰어졌는지 포커스 경로 상에서 안내받지 못한다.
- **정확한 파일 및 라인**:
  - [`apps/character-lab/src/app/shell/panels/PosePanel.tsx`](file:///home/antigravity/blue45f/toonstudio/apps/character-lab/src/app/shell/panels/PosePanel.tsx#L241-L261) (`:439-471`)
- **최소 패치 제안 (Diff)**:

```diff
--- a/apps/character-lab/src/app/shell/panels/PosePanel.tsx
+++ b/apps/character-lab/src/app/shell/panels/PosePanel.tsx
@@ -244,14 +244,17 @@ export function PosePanel() {
   const handDisabled = handCapability.status === "unavailable";
   const poseBlocked = poseDisabled || rigCorrupted || hasEmptyEngineSkeleton;
   const handBlocked = handDisabled || rigCorrupted || hasEmptyEngineSkeleton;
-  const hasEmptySkeleton = (poseDisabled || hasEmptyEngineSkeleton) && !rigCorrupted;
+  const hasEmptySkeleton = hasEmptyEngineSkeleton && !rigCorrupted;
+  const isRigUnloaded = poseDisabled && !hasEmptyEngineSkeleton && !rigCorrupted;
   const unsupportedPose = plan?.unsupported.find((item) => item.slot === "pose");
   const unsupportedHand = plan?.unsupported.find((item) => item.slot === "hand-pose");
   const violations = useMemo(() => poseLimitViolations(recipe.pose, safeSkeleton), [recipe.pose, safeSkeleton]);
   const boneCount = Object.keys(recipe.pose).length;
   const selectedPreset = POSE_PRESETS.find((item) => item.id === recipe.slots.pose);
   const selectedPoseSummaryKo = hasEmptySkeleton
     ? "스켈레톤 없음(정적 메시)"
+    : isRigUnloaded
+      ? `리그 미로드(${poseCapability.reasonKo ?? "엔진 시작 또는 패키지 불러오기 필요"})`
     : rigCorrupted
       ? "손상된 스켈레톤 차단됨"
       : boneCount === 0
@@ -440,6 +443,7 @@ export function PosePanel() {
           <button
             type="button"
             className="cl-button cl-pose-rig-switch"
             data-testid="pose-switch-to-package-tab"
+            aria-describedby={poseBlocked ? `${ids}-pose-blocked-reason` : undefined}
             onClick={() => setInspectorTab("package")}
           >
             리그·패키지 선택
@@ -460,12 +464,12 @@ export function PosePanel() {
         </p>
       ) : null}
       {poseCapability.status !== "available" ? (
-        <p className="cl-pose-reason" role="note">
+        <p id={`${ids}-pose-blocked-reason`} className="cl-pose-reason" role="note">
           포즈 슬롯 {poseCapability.status === "partial" ? "부분 지원" : "미지원"}: {poseCapability.reasonKo ?? "사유 없음"}
         </p>
       ) : null}
-      {hasEmptySkeleton ? (
-        <p className="cl-pose-empty-state" role="note" data-testid="pose-empty-skeleton-notice">
+      {hasEmptySkeleton || isRigUnloaded ? (
+        <p id={poseCapability.status === "available" ? `${ids}-pose-blocked-reason` : undefined} className="cl-pose-empty-state" role="note" data-testid="pose-empty-skeleton-notice">
-          스켈레톤이 없는 정적 메시이거나 포즈 본이 비어 있어 관절 회전·IK를 조작할 수 없습니다. 제작 패키지 탭에서 리깅된 캐릭터나 모듈식 키트를 선택하세요.
+          {hasEmptySkeleton
+            ? "스켈레톤이 없는 정적 메시이거나 포즈 본이 비어 있어 관절 회전·IK를 조작할 수 없습니다. 제작 패키지 탭에서 리깅된 캐릭터나 모듈식 키트를 선택하세요."
+            : "현재 선택된 캐릭터 소스가 아직 로드되지 않아 포즈·관절 조작이 비활성화되어 있습니다. 상단에서 엔진(WebGPU/WebGL2)을 시작하거나 제작 패키지 탭에서 패키지를 불러오거나 절차 소스로 전환하세요."}
         </p>
       ) : null}
```

---

## 5. 아티팩트 목록 (`docs/character-keyboard-round4-20261107/`)

- [README.md](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/README.md) — 본 감사 보고서 및 최소 패치 제안
- [verification-report.json](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/verification-report.json) — 실제 브라우저 키보드 여정·뷰포트 회전·200% 확대·리그 미지원 감사 원시 측정 JSON
- 키보드 여정 단계별 스크린샷:
  - [keyboard-step0-initial-kit-unloaded-pose-disabled.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step0-initial-kit-unloaded-pose-disabled.png)
  - [keyboard-step1-pose-preset-selected.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step1-pose-preset-selected.png)
  - [keyboard-step2-joint-ik-applied.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step2-joint-ik-applied.png)
  - [keyboard-step3-undo-redo-verified.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step3-undo-redo-verified.png)
  - [keyboard-step4-export-and-cancel.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step4-export-and-cancel.png)
  - [keyboard-step5-unloaded-package-notice.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/keyboard-step5-unloaded-package-notice.png)
- 반응형·화면 회전(`Portrait ↔ Landscape`)·`200%` 확대 스크린샷:
  - [viewport-mobile-320x640-portrait.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-320x640-portrait.png)
  - [viewport-mobile-640x320-landscape-rotated.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-640x320-landscape-rotated.png)
  - [viewport-mobile-390x844-portrait.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-390x844-portrait.png)
  - [viewport-mobile-844x390-landscape-rotated.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-mobile-844x390-landscape-rotated.png)
  - [viewport-tablet-768x1024-portrait.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-tablet-768x1024-portrait.png)
  - [viewport-tablet-1024x768-landscape-rotated.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-tablet-1024x768-landscape-rotated.png)
  - [viewport-desktop-1440x900-100pct.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-desktop-1440x900-100pct.png)
  - [viewport-desktop-1440x900-200pct-zoom.png](file:///home/antigravity/blue45f/toonstudio/docs/character-keyboard-round4-20261107/viewport-desktop-1440x900-200pct-zoom.png)
