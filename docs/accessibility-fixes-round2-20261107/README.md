# ToonStudio 접근성 후속 최소 수정 및 전후 검증 보고서 (2026-11-07)

본 문서는 1차 전페이지 접근성 독립 감사(`main` 커밋 `5eb3810b90837e5e02baddf4b0880acdad1d76e8`)에서 실제 재현된 5건의 접근성 결함(`GAP-A11Y-01` ~ `GAP-A11Y-05`)을 지정된 5개 로컬 UI 컴포넌트와 직접 단위 회귀 테스트 범위 내에서 최소 수정하고, `320×844` · `390×844` · `768×1024` · `1440×900` · `200%` 확대 · `prefers-reduced-motion: reduce` 실제 Chromium 브라우저 및 단위 테스트로 전후 비교 검증한 결과를 기록합니다.

---

## 1. 소유 경계 및 충돌 방지 원칙 준수

### 1.1 독립 소유 및 수정 파일 (UI 5종 + 직접 단위 회귀 테스트 5종 + 신규 검증 문서 디렉터리)

| 구분 | 경로 | 역할 |
| :--- | :--- | :--- |
| UI 구현 (01) | [`apps/web/src/shared/components/LanguagePicker.tsx`](../../apps/web/src/shared/components/LanguagePicker.tsx) | `GAP-A11Y-01` 최소 수정 |
| 직접 회귀 테스트 (01) | [`apps/web/src/shared/components/LanguagePicker.test.tsx`](../../apps/web/src/shared/components/LanguagePicker.test.tsx) | 닫기 버튼·빈 검색 `Escape` 닫기 및 트리거 초점 복귀·이벤트 전파 차단 검증 |
| UI 구현 (02) | [`apps/web/src/shared/components/FloatingControls.tsx`](../../apps/web/src/shared/components/FloatingControls.tsx) | `GAP-A11Y-02` 최소 수정 |
| 직접 회귀 테스트 (02) | [`apps/web/src/shared/components/FloatingControls.test.tsx`](../../apps/web/src/shared/components/FloatingControls.test.tsx) | 모바일 펼침 시 DOM 정방향 배치(`flex-col-reverse`)·`Tab` 진입·`Escape` 초점 복귀 검증 |
| UI 구현 (03) | [`apps/web/src/domains/legal/AccessibilityLab.tsx`](../../apps/web/src/domains/legal/AccessibilityLab.tsx) | `GAP-A11Y-03` 최소 수정 |
| 직접 회귀 테스트 (03) | [`apps/web/src/domains/legal/AccessibilityPage.test.tsx`](../../apps/web/src/domains/legal/AccessibilityPage.test.tsx) | 글자 크기 `200%` 상한 및 `role="switch"` + `aria-checked` 검증 |
| UI 구현 (04) | [`apps/web/src/shared/components/appearance/AppearanceTrigger.tsx`](../../apps/web/src/shared/components/appearance/AppearanceTrigger.tsx) | `GAP-A11Y-04` 최소 수정 |
| 직접 회귀 테스트 (04) | [`apps/web/src/shared/components/appearance/AppearanceSettings.test.tsx`](../../apps/web/src/shared/components/appearance/AppearanceSettings.test.tsx) | `aria-controls="appearance-settings-dialog"` 및 클릭된 트리거 단일 `aria-expanded="true"` 검증 |
| UI 구현 (05) | [`apps/web/src/domains/creator/studio-chrome-ui.tsx`](../../apps/web/src/domains/creator/studio-chrome-ui.tsx) | `GAP-A11Y-05` 최소 수정 |
| 직접 회귀 테스트 (05) | [`apps/web/src/domains/creator/studio-cuttoon-editor/studio-chrome-ui.test.tsx`](../../apps/web/src/domains/creator/studio-cuttoon-editor/studio-chrome-ui.test.tsx) | `StudioAppMenubar` 중첩 `role="banner"` 제거(`role="region"`) 및 작동하는 스킵 링크(`#studio-canvas-workspace`) 검증 |
| 후속 브라우저 검증 | [`docs/accessibility-fixes-round2-20261107/verify-fixes-browser.mjs`](./verify-fixes-browser.mjs) | 5대 결함 전후 비교 및 뷰포트 매트릭스 실제 브라우저 재현 스크립트 |
| 후속 검증 리포트 | [`docs/accessibility-fixes-round2-20261107/verification-report.json`](./verification-report.json) | 실제 Chromium 실행 측정치 JSON |

### 1.2 수정 금지 경로 보호 확인 (`0`건 변경)

- `scripts/accessibility-sweep-20261107/**` (`browser-accessibility-sweep.mjs`, `route-inventory-audit.ts`, `route-inventory-audit.test.ts` 포함) 및 `docs/accessibility-sweep-20261107/**`: 별도 모듈 분리 작업 보호를 위해 수정·이동·포맷 `0`건 유지.
- 카탈로그·드로잉 툴바·랩 엔진·공유 스토어(`appearance-dialog-store.ts`, `theme.ts`, `i18n.ts` 등): 수정 `0`건 유지.

---

## 2. `감사재현PASS` vs `실제수정PASS` 구분

1차 감사(`5eb3810b`)의 정적 감사 스크립트와 본 2차 후속 구현의 검증 기준은 목적이 서로 반대이므로 명확히 구분하여 판정합니다.

| 구분 | 기준 커밋 / 스크립트 | 판정 의미 | 결과 |
| :--- | :--- | :--- | :--- |
| **감사재현PASS** (`5eb3810b`) | 1차 읽기 전용 감사 (`5eb3810b` 시점 상태) | 수정 전 코드베이스에서 `GAP-A11Y-01`~`05` 결함이 실제로 존재·재현됨(`reproduced === true`)을 입증 | 1차 감사 커밋 `5eb3810b`에서 5건 전수 재현 입증 완료 |
| **실제수정PASS** (본 후속 구현) | 5종 직접 단위 회귀 테스트 + [`verify-fixes-browser.mjs`](./verify-fixes-browser.mjs) | 최소 수정 적용 후 실제 Chromium 브라우저와 jsdom 단위 회귀 테스트에서 5건 결함이 모두 해소되어 정상 동작함을 입증 | **5건 전수 `실제수정PASS` (단위 테스트 67건 PASS + 실제 브라우저 검증 전수 PASS)** |

---

## 3. 결함별 최소 수정 내용 및 전후 비교 검증 (`GAP-A11Y-01` ~ `GAP-A11Y-05`)

### 3.1 `GAP-A11Y-01` — `LanguagePicker` 닫기 버튼·빈 검색 결과 포커스에서도 `Escape` 닫기 및 트리거 복귀

- **대상 파일**: [`apps/web/src/shared/components/LanguagePicker.tsx`](../../apps/web/src/shared/components/LanguagePicker.tsx)
- **원인 (수정 전 `5eb3810b`)**:
  - `Escape` 키 핸들러가 검색 `<input>`과 `<button role="option">`에만 개별 연결되어 있어, 대화상자 내부의 닫기 버튼(`언어 선택 닫기`)에 초점이 있거나 검색 결과가 `0`건일 때 `Escape`로 닫히지 않았고 모바일에서는 상위 `FloatingControls` 패널까지 닫히는 현상이 발생했습니다.
- **최소 수정 내용**:
  - `<section role="dialog" id={dialogId}>` 컨테이너의 `onKeyDown` 및 대화상자 열림 동안의 캡처 단계 `keydown` 리스너에서 `Escape` 입력 시 `event.preventDefault()`와 `event.stopPropagation()`을 호출하고 `close(true)`를 실행하여 트리거 버튼(`triggerRef.current`)으로 즉시 초점을 복귀시켰습니다.
  - 검색 결과가 `0`건일 때 빈 `role="listbox"`(`tabIndex={0}`)에서도 `Escape` 닫기 및 트리거 초점 복귀가 동작하도록 보강하고, 트리거 버튼에 `aria-controls={open ? dialogId : undefined}`를 연결했습니다.
- **전후 검증 결과**:
  - 수정 전(`5eb3810b`): `closedFromCloseBtn: false`, `closedFromEmptyListbox: false` (`감사재현PASS`)
  - 수정 후: `closedFromCloseBtn: true`, `focusReturnedFromCloseBtn: true`, `closedFromEmptyListbox: true`, `focusReturnedFromEmptyListbox: true` (**`실제수정PASS`**)
  - 스크린샷 증거: [`screenshots/fix-gap-a11y-01-language-picker-close-focus.png`](./screenshots/fix-gap-a11y-01-language-picker-close-focus.png)

### 3.2 `GAP-A11Y-02` — 모바일 `FloatingControls` 펼침 후 정방향 `Tab` 패널 진입과 `Escape` 복귀

- **대상 파일**: [`apps/web/src/shared/components/FloatingControls.tsx`](../../apps/web/src/shared/components/FloatingControls.tsx)
- **원인 (수정 전 `5eb3810b`)**:
  - 모바일 접힘 래퍼(`md:hidden`)에서 `{open && (...)}` 패널이 토글 버튼(`[data-floating-controls-toggle]`)보다 DOM 앞쪽에 렌더링되어, 토글을 `Enter`/`Space`로 펼친 직후 정방향 `Tab`을 누르면 열린 패널로 들어가지 못하고 외부로 초점이 이탈했습니다.
- **최소 수정 내용**:
  - 모바일 접힘 컨테이너에 `flex-col-reverse`를 적용하고 DOM 순서를 `[data-floating-controls-toggle]` 버튼 → `{open && (<div id={mobilePanelId}>...)}` 순으로 배치하여, 시각적 상하 배치(패널이 토글 버튼 위)는 그대로 유지하면서 정방향 `Tab`이 열린 패널의 첫 컨트롤(`주간 모드 전환`)로 자연스럽게 진입하도록 수정했습니다.
  - 내부 대화상자(`[role="dialog"]`)가 열려 있을 때는 부모 패널이 `Escape`를 가로채지 않도록 보호하고, 패널 상태에서 `Escape` 입력 시 패널을 닫고 토글 버튼으로 초점을 복귀시켰습니다.
- **전후 검증 결과**:
  - 수정 전(`5eb3810b`): `floatingForwardTabStayedInside: false` (`감사재현PASS`)
  - 수정 후(`320×844` & `390×844`): `insideFloatingControls: true`, `ariaLabel: "주간 모드 전환"`, `expandedAfterEscape: "false"`, `focusReturnedToToggle: true` (**`실제수정PASS`**)
  - 스크린샷 증거: [`screenshots/fix-gap-a11y-02-mobile-390-floating-tab.png`](./screenshots/fix-gap-a11y-02-mobile-390-floating-tab.png)

### 3.3 `GAP-A11Y-03` — `AccessibilityLab` 텍스트 `200%` 확대 지원 및 올바른 `switch` 의미론 적용

- **대상 파일**: [`apps/web/src/domains/legal/AccessibilityLab.tsx`](../../apps/web/src/domains/legal/AccessibilityLab.tsx)
- **원인 (수정 전 `5eb3810b`)**:
  - `#accessibility-text-scale` 슬라이더의 `max`가 `"160"`으로 제한되어 WCAG 2.1 SC 1.4.4 기준인 `200%` 텍스트 확대를 시험할 수 없었고, 시각적 스위치(`SwitchIndicator`)를 렌더링하는 `PreferenceToggle`이 `role="switch"` + `aria-checked` 대신 `aria-pressed`를 사용했습니다.
- **최소 수정 내용**:
  - `#accessibility-text-scale`의 `max`를 `"200"`으로 상향했습니다.
  - `PreferenceToggle` 버튼에 `role="switch"`와 `aria-checked={pressed}`를 적용했습니다.
- **전후 검증 결과**:
  - 수정 전(`5eb3810b`): `sliderMax: "160"`, `switchRoleCountInLab: 0`, `toggleButtonCountUsingAriaPressed: 2` (`감사재현PASS`)
  - 수정 후: `sliderMax: "200"`, `switchRoleCountInLab: 2`, `legacyAriaPressedCount: 0`, `previewFontSize: "200%"`, `firstSwitchAriaChecked: "true"` (**`실제수정PASS`**)
  - 스크린샷 증거: [`screenshots/fix-gap-a11y-03-accessibility-lab-200.png`](./screenshots/fix-gap-a11y-03-accessibility-lab-200.png)

### 3.4 `GAP-A11Y-04` — `AppearanceTrigger` `aria-controls` 연결 및 트리거별 `aria-expanded` 정합성

- **대상 파일**: [`apps/web/src/shared/components/appearance/AppearanceTrigger.tsx`](../../apps/web/src/shared/components/appearance/AppearanceTrigger.tsx)
- **원인 (수정 전 `5eb3810b`)**:
  - `expanded` 상태가 `state.scope === scope`만으로 계산되어 동일 `scope`를 가진 모든 `AppearanceTrigger`가 동시에 `aria-expanded="true"`로 노출되었고, 대화상자와 연결되는 `aria-controls` 속성이 없었습니다.
- **최소 수정 내용**:
  - 각 `AppearanceTrigger` 인스턴스의 `buttonRef`와 `state.returnFocusElement`를 대조하여 실제로 대화상자를 연 트리거 인스턴스만 `aria-expanded="true"`가 되도록 수정했습니다.
  - `aria-controls="appearance-settings-dialog"`를 부여하고, 대화상자 열림/닫힘 상태에 따라 `#appearance-settings-dialog` ID가 항상 유효한 단일 DOM 대상을 가리키도록 동기화하여 `axe-core`의 `aria-valid-attr-value` 규칙까지 `0`건 위반으로 충족했습니다.
- **전후 검증 결과**:
  - 수정 전(`5eb3810b`): `expandedTriggerCount: 3`, `allHaveAriaControls: false` (`감사재현PASS`)
  - 수정 후: 복수 트리거(`totalTriggerCount: 2`) 마운트 상태에서 클릭한 트리거만 `expandedTriggerCount: 1`, `allHaveAriaControls: true`, `dialogIdMatchesAriaControls: true`, `appearanceFocusReturned: true` (**`실제수정PASS`**)
  - 스크린샷 증거: [`screenshots/fix-gap-a11y-04-appearance-trigger.png`](./screenshots/fix-gap-a11y-04-appearance-trigger.png)

### 3.5 `GAP-A11Y-05` — `StudioAppMenubar` `<main>` 내부 중첩 `banner` 제거 및 실제 작동하는 스킵 링크 제공

- **대상 파일**: [`apps/web/src/domains/creator/studio-chrome-ui.tsx`](../../apps/web/src/domains/creator/studio-chrome-ui.tsx)
- **원인 (수정 전 `5eb3810b`)**:
  - `<main id="main-content">` 내부에서 렌더링되는 `StudioAppMenubar`(`#studio-menubar`)가 `role="banner"`를 선언하여 중첩 배너 랜드마크 위반(`nestedBannerInMainCount: 1`)이 발생했고, 드로잉 앱 프레젠테이션 모드에서 스킵 링크가 누락되었습니다.
- **최소 수정 내용**:
  - `StudioAppMenubar`의 `role="banner"`를 `role="region"`(`aria-label="문서 메뉴"` 유지)으로 변경하여 `<main>` 내부 중첩 배너를 제거했습니다.
  - `StudioAppMenubar` 상단에 키보드 초점 시 노출되는 스킵 링크(`<a href="#studio-canvas-workspace" data-studio-skip-link="true">캔버스로 이동</a>`)를 추가하여 활성화 시 `#studio-canvas-workspace`로 즉시 초점을 이동시켰습니다.
- **전후 검증 결과**:
  - 수정 전(`5eb3810b`): `menubarRole: "banner"`, `nestedBannerInMainCount: 1`, `skipLinkCount: 0` (`감사재현PASS`)
  - 수정 후(`1440×900` & `390×844` `/studio/canvas`): `menubarRole: "region"`, `nestedBannerInMainCount: 0`, `focusedIdAfterSkip: "studio-canvas-workspace"` (**`실제수정PASS`**)
  - 스크린샷 증거: [`screenshots/fix-gap-a11y-05-studio-skiplink.png`](./screenshots/fix-gap-a11y-05-studio-skiplink.png)
