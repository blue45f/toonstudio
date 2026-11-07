# 전페이지 접근성 회귀 결함 분석 및 최소 패치 제안 (2026-11-07)

- 상태: 각 결함의 코드 위치·브라우저 재현 결과는 `origin/main`(`e48cdc2563227ba5dd10bd491b54977ce92b4afa`) 기준 확인된 사실(**current**)이며, 제시된 통합 diff 코드 블록은 담당 페이지/공통 컴포넌트 소유자가 충돌 없이 반영할 수 있도록 분리한 최소 패치 후보(**target**)다.
- 기준 일자: `2026-11-07`
- 소유 경계: 본 감사는 앱 구현(`apps/**`, `packages/**`, `config/**`, `e2e/**`)을 **READ-ONLY(0바이트 수정)** 로 유지하며, 재현 스크립트([route-inventory-audit.ts](../../scripts/accessibility-sweep-20261107/route-inventory-audit.ts), [browser-accessibility-sweep.mjs](../../scripts/accessibility-sweep-20261107/browser-accessibility-sweep.mjs))와 본 문서의 최소 패치 제안만 독점 경로에 기록한다.

---

## 1. 결함 요약 매트릭스 (`current`)

| 결함 ID | 심각도 | 검증 축 | 대상 파일 (READ-ONLY) | WCAG 2.1 / 2.2 기준 | 재현 방법 |
| --- | --- | --- | --- | --- | --- |
| `GAP-A11Y-01` | High | 키보드 `Escape` · 포커스 트랩 · 단일 탭스톱 | [LanguagePicker.tsx](../../apps/web/src/shared/components/LanguagePicker.tsx) | SC 2.1.1 Keyboard (A), SC 2.4.3 Focus Order (A) | 언어 선택 대화상자 열기 → 닫기 버튼(`언어 선택 닫기`)으로 초점 이동 또는 검색어 무일치 상태 → `Escape` 입력 시 대화상자 미닫힘 |
| `GAP-A11Y-02` | High | 모바일(`320px`/`390px`) DOM 포커스 순서 | [FloatingControls.tsx](../../apps/web/src/shared/components/FloatingControls.tsx) | SC 2.4.3 Focus Order (A), SC 2.1.1 Keyboard (A) | 모바일 뷰포트(`320×844`, `390×844`)에서 `화면·언어·OST 설정` 버튼 `Enter` 실행 → 정방향 `Tab` 입력 시 펼쳐진 패널로 진입하지 못하고 외부로 이탈 |
| `GAP-A11Y-03` | High | `200%` 확대 · `reduced-motion` · `role="switch"` | [AccessibilityLab.tsx](../../apps/web/src/domains/legal/AccessibilityLab.tsx) | SC 1.4.4 Resize Text (AA), SC 2.3.3 Animation, SC 4.1.2 Name, Role, Value (A) | `/accessibility`의 `#accessibility-text-scale` 슬라이더가 `max="160"`(160%)으로 제한되어 200% 확대를 지원하지 않으며, `PreferenceToggle`이 `SwitchIndicator`를 쓰면서 `role="switch" aria-checked` 대신 `aria-pressed`를 사용 |
| `GAP-A11Y-04` | Medium | `aria-expanded` · `aria-controls` 상태 계약 | [AppearanceTrigger.tsx](../../apps/web/src/shared/components/appearance/AppearanceTrigger.tsx), [AppearanceDialog.tsx](../../apps/web/src/shared/components/appearance/AppearanceDialog.tsx) | SC 4.1.2 Name, Role, Value (A) | 헤더에서 `디자인 테마` 대화상자를 열면 동일 `scope`를 공유하는 플로팅 컨트롤의 `AppearanceTrigger`까지 동시에 `aria-expanded="true"`가 되며 `aria-controls` 연결이 없음 |
| `GAP-A11Y-05` | Medium | 스튜디오 편집기 랜드마크 · 모바일 `<h1>` · 스킵 순서 | [studio-chrome-ui.tsx](../../apps/web/src/domains/creator/studio-chrome-ui.tsx), [StudioOfflinePanel.tsx](../../apps/web/src/domains/creator/offline/StudioOfflinePanel.tsx) | SC 1.3.1 Info and Relationships (A), SC 2.4.1 Bypass Blocks (A) | `/studio/canvas`에서 `<main>` 내부에 `StudioAppMenubar`(`role="banner"`)가 중첩되고, 모바일 편집기 셸에 `<h1>`이 없으며 오프라인 배너 `<summary>`가 스킵 링크보다 먼저 초점을 받음 |

---

## 2. 결함별 상세 원인·증거 및 최소 패치 제안 (`current` 분석 / `target` 패치)

### 2.1 `GAP-A11Y-01` — `LanguagePicker` 대화상자 `Escape` 닫기 누락 및 옵션 목록 탭 순서 (`High`)

#### 현상 및 코드 원인 (`current`)
- 위치: [LanguagePicker.tsx](../../apps/web/src/shared/components/LanguagePicker.tsx) 158~255행
- `<section role="dialog" aria-labelledby={titleId}>` 루트 요소에 `onKeyDown` 핸들러가 없고, `<input ref={searchRef}>`(199~206행)와 `<button role="option">`(111~125행)에만 개별적으로 `if (event.key === "Escape") close()`가 바인딩되어 있다.
- 그 결과:
  1. 사용자가 `Shift+Tab`으로 `언어 선택 닫기` 버튼(177~184행)에 초점을 옮긴 뒤 `Escape`를 누르면 데스크톱에서는 대화상자가 닫히지 않으며, 모바일에서는 이벤트가 상위로 전파되어 부모 `FloatingControls` 클러스터만 닫히고 `LanguagePicker` 내부 `open` 상태가 정합성을 잃는다.
  2. 검색어 입력 후 일치하는 언어가 0건(`visibleOptions.options.length === 0`)일 때 입력창 밖으로 초점이 이동하면 `Escape`로 닫을 수 없다.
- 증거 스크린샷: `docs/accessibility-sweep-20261107/screenshots/defect-gap-a11y-01-language-picker-escape.png`

#### 최소 패치 제안 (`target`)
`<section role="dialog">` 컨테이너에 상위 `onKeyDownCapture` / `onKeyDown` 핸들러를 추가하여 대화상자 내부 어디에 초점이 있든 `Escape` 입력 시 `event.stopPropagation()`과 함께 `close()`가 호출되어 트리거 버튼으로 초점이 복귀하도록 한다.

```diff
--- a/apps/web/src/shared/components/LanguagePicker.tsx
+++ b/apps/web/src/shared/components/LanguagePicker.tsx
@@ -158,6 +158,13 @@ export function LanguagePicker({
         <section
           role="dialog"
           aria-labelledby={titleId}
+          onKeyDown={(event) => {
+            if (event.key === "Escape") {
+              event.preventDefault();
+              event.stopPropagation();
+              close();
+            }
+          }}
           className={cx(
             "absolute bottom-[calc(100%+0.5rem)] right-0 z-[80] w-[min(22rem,calc(100vw-2rem))] rounded-2xl border border-line bg-panel p-3 text-left shadow-2xl",
             panelClassName,
```

---

### 2.2 `GAP-A11Y-02` — 모바일(`320px`/`390px`) `FloatingControls` 펼침 시 역순 DOM 배치로 인한 `Tab` 초점 이탈 (`High`)

#### 현상 및 코드 원인 (`current`)
- 위치: [FloatingControls.tsx](../../apps/web/src/shared/components/FloatingControls.tsx) 268~306행
- 모바일 뷰포트(`< 768px`, `320×844` 및 `390×844`)에서 `[data-floating-controls-toggle]` 버튼을 눌러 `open = true`가 되면, 새로 렌더링되는 하위 컨트롤 묶음(`{open && (<div ...>{renderControls(true)}...</div>)}`)이 토글 버튼 **앞쪽(DOM 선행 위치)** 에 마운트된다.
- 시각적으로는 토글 버튼 위쪽에 펼쳐지므로 자연스럽지만, DOM 순서가 토글 버튼보다 앞이고 열릴 때 첫 번째 컨트롤로 초점을 이동시키지 않기 때문에 사용자가 토글 버튼에서 `Enter`를 누른 직후 정방향 `Tab`을 누르면 펼쳐진 컨트롤들을 모두 건너뛰고 페이지 바깥(`document.body` 또는 다음 요소)으로 초점이 이탈한다.
- 증거 스크린샷: `docs/accessibility-sweep-20261107/screenshots/defect-gap-a11y-02-mobile-floating-controls.png`

#### 최소 패치 제안 (`target`)
모바일 컨테이너에 `flex-col-reverse`를 적용하고 토글 버튼을 DOM상 앞에 두어(시각적 배치는 동일하게 유지하면서) 토글 버튼에서 정방향 `Tab` 입력 시 곧바로 펼쳐진 하위 컨트롤로 초점이 진입하도록 교정한다.

```diff
--- a/apps/web/src/shared/components/FloatingControls.tsx
+++ b/apps/web/src/shared/components/FloatingControls.tsx
@@ -266,7 +266,23 @@ export function FloatingControls({
 
       {/* 모바일(접힘형만): 단일 토글 — 콘텐츠를 가리지 않게 면적 최소화. 탭하면 위로 펼침. */}
       {collapsible && (
-        <div className="flex flex-col items-end gap-2 md:hidden">
+        <div className="flex flex-col-reverse items-end gap-2 md:hidden">
+          <button
+            ref={toggleRef}
+            type="button"
+            data-floating-controls-toggle
+            onClick={() => setOpen((value) => !value)}
+            aria-expanded={open}
+            aria-label={open ? t("control.settings.close") : bt("화면·언어·OST 설정", "Display, language and OST settings")}
+            title={open ? t("control.settings.close") : t("control.cluster.open")}
+            className={cx(
+              PILL,
+              "size-12",
+              open ? "ts-float-active" : "text-fg-2 hover:text-fg"
+            )}
+          >
+            {open ? <X size={18} aria-hidden="true" /> : <Settings2 size={18} aria-hidden="true" />}
+          </button>
           {open && (
             <div className="flex flex-col items-center gap-2 motion-safe:animate-fade-up">
               {renderControls(true)}
@@ -286,22 +302,6 @@ export function FloatingControls({
               </button>
             </div>
           )}
-          <button
-            ref={toggleRef}
-            type="button"
-            data-floating-controls-toggle
-            onClick={() => setOpen((value) => !value)}
-            aria-expanded={open}
-            aria-label={open ? t("control.settings.close") : bt("화면·언어·OST 설정", "Display, language and OST settings")}
-            title={open ? t("control.settings.close") : t("control.cluster.open")}
-            className={cx(
-              PILL,
-              "size-12",
-              open ? "ts-float-active" : "text-fg-2 hover:text-fg"
-            )}
-          >
-            {open ? <X size={18} aria-hidden="true" /> : <Settings2 size={18} aria-hidden="true" />}
-          </button>
         </div>
       )}
     </div>
```

---

### 2.3 `GAP-A11Y-03` — `AccessibilityLab` 글자 크기 `200%` 상한 미달(`160%`) 및 스위치 ARIA 역할(`role="switch"`) 불일치 (`High`)

#### 현상 및 코드 원인 (`current`)
- 위치: [AccessibilityLab.tsx](../../apps/web/src/domains/legal/AccessibilityLab.tsx) 90~99행 및 163~184행
- `#accessibility-text-scale` `<input type="range">`의 `max` 속성이 `"160"`으로 하드코딩되어 있어 WCAG 2.1 SC 1.4.4(Resize Text)가 요구하는 `200%` 글자 확대를 조율실에서 시험할 수 없다.
- 또한 `PreferenceToggle`(163~184행)은 내부에 시각적 스위치 컴포넌트(`<SwitchIndicator checked={pressed} />`)를 렌더링하면서도 버튼에는 `role="switch" aria-checked={pressed}` 대신 `aria-pressed={pressed}`를 부여하여([SettingsPage.tsx](../../apps/web/src/domains/account/SettingsPage.tsx)의 스위치 패턴과 불일치) 스크린리더에 토글 스위치 역할이 전달되지 않는다.
- 증거 스크린샷: `docs/accessibility-sweep-20261107/screenshots/defect-gap-a11y-03-accessibility-lab.png`

#### 최소 패치 제안 (`target`)

```diff
--- a/apps/web/src/domains/legal/AccessibilityLab.tsx
+++ b/apps/web/src/domains/legal/AccessibilityLab.tsx
@@ -91,7 +91,7 @@ export function AccessibilityLab() {
               id="accessibility-text-scale"
               type="range"
               min="100"
-              max="160"
+              max="200"
               step="10"
               value={textScale}
               onChange={(event) => setTextScale(Number(event.target.value))}
@@ -173,7 +173,8 @@ function PreferenceToggle({
   return (
     <button
       type="button"
-      aria-pressed={pressed}
+      role="switch"
+      aria-checked={pressed}
       onClick={onToggle}
       className="flex min-h-11 w-full items-center justify-between rounded-xl border border-line bg-panel px-3 text-sm font-bold text-fg-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/70"
     >
```

---

### 2.4 `GAP-A11Y-04` — `AppearanceTrigger` 복수 인스턴스 동시 `aria-expanded="true"` 및 `aria-controls` 누락 (`Medium`)

#### 현상 및 코드 원인 (`current`)
- 위치: [AppearanceTrigger.tsx](../../apps/web/src/shared/components/appearance/AppearanceTrigger.tsx) 12~24행, [AppearanceDialog.tsx](../../apps/web/src/shared/components/appearance/AppearanceDialog.tsx) 30~42행
- `const expanded = useAppearanceDialog((state) => state.scope === scope);`는 어떤 버튼이 대화상자를 열었는지(`returnFocusEl`)를 구분하지 않고 `scope`만 비교한다. 따라서 헤더의 `.appearance-trigger`로 대화상자를 열어도 화면 하단 `FloatingControls` 내부의 `.appearance-trigger`까지 동시에 `aria-expanded="true"`가 된다.
- 또한 열린 `AppearanceDialog`의 DOM ID를 가리키는 `aria-controls` 속성이 없다.
- 증거 스크린샷: `docs/accessibility-sweep-20261107/screenshots/pc-1440-appearance-dialog.png`

#### 최소 패치 제안 (`target`)

```diff
--- a/apps/web/src/shared/components/appearance/AppearanceTrigger.tsx
+++ b/apps/web/src/shared/components/appearance/AppearanceTrigger.tsx
@@ -1,4 +1,5 @@
 import { Palette } from "lucide-react";
+import { useRef } from "react";
 
 import { useAppearanceDialog } from "./appearance-dialog-store";
 
@@ -10,13 +11,18 @@ export function AppearanceTrigger({
   className = "",
   compact = false,
 }: AppearanceTriggerProps) {
-  const expanded = useAppearanceDialog((state) => state.scope === scope);
+  const buttonRef = useRef<HTMLButtonElement | null>(null);
+  const expanded = useAppearanceDialog(
+    (state) => state.scope === scope && state.returnFocusEl === buttonRef.current,
+  );
   const label = scope === "studio" ? "스튜디오 테마 설정" : "화면 테마 설정";
   return (
     <button
+      ref={buttonRef}
       type="button"
       aria-label={label}
       aria-haspopup="dialog"
       aria-expanded={expanded}
+      aria-controls={expanded ? "appearance-settings-dialog" : undefined}
       title={`${label} · 라이트, 다크, 고대비 팔레트`}
       onClick={(event) => useAppearanceDialog.getState().open(scope, event.currentTarget)}
```

```diff
--- a/apps/web/src/shared/components/appearance/AppearanceDialog.tsx
+++ b/apps/web/src/shared/components/appearance/AppearanceDialog.tsx
@@ -34,6 +34,7 @@ export function AppearanceDialog({
       <div className="appearance-overlay" onClick={onClose} aria-hidden="true" />
       <div
         ref={dialogRef}
+        id="appearance-settings-dialog"
         role="dialog"
         aria-modal="true"
         aria-labelledby={titleId}
```

---

### 2.5 `GAP-A11Y-05` — 스튜디오 편집기 `<main>` 내부 `role="banner"` 중첩 및 모바일 `<h1>`·스킵 링크 순서 (`Medium`)

#### 현상 및 코드 원인 (`current`)
- 위치: [studio-chrome-ui.tsx](../../apps/web/src/domains/creator/studio-chrome-ui.tsx) 296~350행 (`StudioAppMenubar`), [StudioOfflinePanel.tsx](../../apps/web/src/domains/creator/offline/StudioOfflinePanel.tsx)
- `StudioAppMenubar`(317행)가 `<main id="main-content">` 자손이면서도 `role="banner"`를 선언하여 HTML/ARIA 명세상 문서 최상위에만 허용되는 배너 랜드마크 규칙(`landmark-banner-is-top-level`)에 위배된다.
- 모바일 뷰포트(`320×844`, `390×844`) 편집기 셸에서는 시각적 공간을 아끼기 위해 제목 요소가 생략되어 `<h1>`이 존재하지 않으며(`page-has-heading-one`), 오프라인 상태 안내(`StudioOfflinePanel`)의 `<summary>`가 `nav[aria-label="작업 영역 바로가기"]` 스킵 링크보다 먼저 Tab 초점을 받는다.

#### 최소 패치 제안 (`target`)
`StudioAppMenubar`의 `role="banner"`를 `role="region"`(또는 `role="toolbar"`)으로 전환해 `<main>` 내부 랜드마크 중첩 위반을 제거하고, 편집기 셸 상단 스킵 링크 바로 뒤에 `.sr-only` `<h1>`을 제공하여 모바일·데스크톱 모두에서 문서 제목 계층을 보장한다.

```diff
--- a/apps/web/src/domains/creator/studio-chrome-ui.tsx
+++ b/apps/web/src/domains/creator/studio-chrome-ui.tsx
@@ -314,7 +314,7 @@ export function StudioAppMenubar({
   return (
     <div
       id={id}
-      role="banner"
+      role="region"
       tabIndex={-1}
       aria-label={ariaLabel}
       data-testid="studio-menubar"
```
