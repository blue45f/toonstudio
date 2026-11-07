# ToonStudio 전페이지 접근성 독립 회귀 테스트 종합 보고서 (2026-11-07)

> **문서 상태 라벨**:
> - **`current`**: `2026-11-07` 기준 최신 `main` 브랜치에서 계측·검증된 전페이지 라우트 인벤토리(`314`개 선언 / `441`개 구체화 경로)와 실제 Chromium 브라우저 기반 키보드(`Tab` / `Shift+Tab` / `Escape`), 포커스 복귀(`Focus Restoration`), `aria-label` / 역할 / 상태 계약, 멀티 뷰포트(`320×844`, `390×844`, `768×1024`, `1440×900`), `200%` 확대(`zoom: 2`), `prefers-reduced-motion: reduce` 검증 결과.
> - **`target`**: 본 문서 및 [결함 상세 및 최소 패치 제안서](./findings-and-minimal-patches.md)에 수록된 5건의 최소 unified diff 패치가 순차 반영된 이후 달성할 무결함 접근성 목표 상태.
> - **`legacy exception`**: `apps/**`, `packages/**`, `config/**`, `e2e/**` 등 애플리케이션 구현 트리는 다른 페이지 구현 담당과의 병합 충돌을 원천 차단하기 위해 본 작업에서 **엄격한 READ-ONLY(수정 0건)** 로 유지하며, 재현 스크립트(`scripts/accessibility-sweep-20261107/**`)와 증거·패치 문서(`docs/accessibility-sweep-20261107/**`)만 독점 소유한다.

---

## 1. 작업 범위 및 소유권 경계 (`current`)

| 구분 | 경로 | 소유 및 변경 정책 | 검증 상태 |
| --- | --- | --- | --- |
| 신규 독점 스크립트 | [`scripts/accessibility-sweep-20261107/run-audit.mjs`](../../scripts/accessibility-sweep-20261107/run-audit.mjs), [`route-inventory-audit.ts`](../../scripts/accessibility-sweep-20261107/route-inventory-audit.ts), [`route-inventory-audit.test.ts`](../../scripts/accessibility-sweep-20261107/route-inventory-audit.test.ts), [`browser-accessibility-sweep.mjs`](../../scripts/accessibility-sweep-20261107/browser-accessibility-sweep.mjs) | 본 작업 단독 생성·소유 | `readOnlyBoundaryOk: true` |
| 신규 독점 문서 및 증거 | [`docs/accessibility-sweep-20261107/README.md`](./README.md), [`route-inventory-and-coverage.md`](./route-inventory-and-coverage.md), [`findings-and-minimal-patches.md`](./findings-and-minimal-patches.md), [`browser-sweep-report.json`](./browser-sweep-report.json), [`screenshots/`](./screenshots/) | 본 작업 단독 생성·소유 | `readOnlyBoundaryOk: true` |
| 앱 구현 및 공유 설정 | `apps/**`, `packages/**`, `config/**`, `e2e/**`, 루트 설정 파일 | **READ-ONLY (수정 0바이트)** | `violationCount: 0` |
| 데이터 및 보안 경계 | 합성 게스트/오프라인 픽스처만 사용 | 개인정보·실데이터·시크릿·유료 API 미사용 | `secretlint` 통과 |

---

## 2. 전페이지 라우트 인벤토리 요약 (`current`)

상세 인벤토리 및 패밀리별 전수 매핑은 [전페이지 라우트 인벤토리 및 접근성 검증 범위 매트릭스](./route-inventory-and-coverage.md)에서 확인할 수 있다.

| 라우트 권위 소스 (Authority) | 기준 파일 | 선언 경로 수 | 구체화(Expanded) 경로 수 | 비고 |
| --- | --- | ---: | ---: | --- |
| **`appRoutes` 통합 그룹** | [`apps/web/src/app/routes/groups/app-routes.tsx`](../../apps/web/src/app/routes/groups/app-routes.tsx) 외 11개 그룹 파일 | `314` (`309` 정적/동적 + `5` 위임) | `309` | `:id`, `:slug`, `:workId` 등 결정론적 합성 샘플 치환 |
| **Studio Route Registry** | [`apps/web/src/domains/creator/studio-route-registry.ts`](../../apps/web/src/domains/creator/studio-route-registry.ts) | `57` | `55` (고유 구체 경로) | `/studio/*` 하위 3D·2D·보조 워크스페이스 |
| **Studio Route Manifest** | [`apps/web/src/domains/creator/studio-router/studio-route-manifest.ts`](../../apps/web/src/domains/creator/studio-router/studio-route-manifest.ts) | `47` | `47` | 워크스페이스 매니페스트 정합성 검증 |
| **Admin Route Authority** | [`apps/web/src/domains/admin/router/admin-route-manifest.ts`](../../apps/web/src/domains/admin/router/admin-route-manifest.ts) | `15` (`6` 정식 + `9` 별칭) | `15` | `/admin/*` 권한 및 리다이렉트 경로 |
| **Learning Sub-Router** | [`apps/web/src/domains/learn/LearnPage.tsx`](../../apps/web/src/domains/learn/LearnPage.tsx), [`LearnContent.tsx`](../../apps/web/src/domains/learn/LearnContent.tsx), [`learning-content.ts`](../../apps/web/src/domains/learn/learning-content.ts), [`learning-paths.ts`](../../apps/web/src/domains/learn/learning-paths.ts) | `60` | `60` | `40`개 레슨 + `7`개 러닝패스 + 퀴즈/인덱스 |
| **전체 고유 구체화 라우트 합계** | 17개 라우트 소스 파일 | **`314` (`appRoutes`)** | **`441` (고유 구체 경로)** | 와일드카드 위임 `5`개(`/learn/*`, `/studio/*` x2, `/admin/*`, `*`) 별도 검증 |

---

## 3. 실제 브라우저 검증 매트릭스 (`current`)

[`scripts/accessibility-sweep-20261107/browser-accessibility-sweep.mjs`](../../scripts/accessibility-sweep-20261107/browser-accessibility-sweep.mjs)를 통해 실제 헤드리스 Chromium에서 다음 6개 뷰포트·환경 조건과 대화형 위젯 계약을 실행 및 검증하였다.

### 3.1 멀티 뷰포트 · 200% 확대 · Reduced Motion 검증 결과

| 뷰포트 / 환경 | 해상도 및 조건 | 대표 검증 경로 | 스킵 링크 & `<main id="main-content">` | 포커스 링 시인성 | 가로 오버플로 (`<= 2px`) | 대표 스크린샷 증거 |
| --- | --- | --- | --- | --- | --- | --- |
| **모바일 320** (`mobile-320`) | `320×844` (`isMobile: true`) | `/`, `/discover`, `/accessibility`, `/settings`, `/studio` | PASS (`#main-content` 포커스 이동 확인) | PASS (`2px solid`) | PASS (`overflowPx: 0`) | [`mobile-320-home.png`](./screenshots/mobile-320-home.png), [`mobile-320-accessibility.png`](./screenshots/mobile-320-accessibility.png) |
| **모바일 390** (`mobile-390`) | `390×844` (`isMobile: true`) | `/`, `/discover`, `/accessibility`, `/settings`, `/studio` | PASS | PASS | PASS (`overflowPx: 0`) | [`mobile-390-home.png`](./screenshots/mobile-390-home.png), [`mobile-390-studio.png`](./screenshots/mobile-390-studio.png) |
| **태블릿 768** (`tablet-768`) | `768×1024` (`isMobile: false`) | `/`, `/discover`, `/accessibility`, `/settings`, `/studio` | PASS | PASS | PASS (`overflowPx: 0`) | [`tablet-768-home.png`](./screenshots/tablet-768-home.png) |
| **PC 1440** (`pc-1440`) | `1440×900` (`isMobile: false`) | `/`, `/discover`, `/community`, `/learn`, `/accessibility`, `/settings`, `/studio`, `/admin/overview` | PASS (단, 스튜디오 크롬 중첩 배너 `GAP-A11Y-05` 존재) | PASS | PASS (`overflowPx: 0`) | [`pc-1440-home.png`](./screenshots/pc-1440-home.png), [`pc-1440-studio.png`](./screenshots/pc-1440-studio.png) |
| **PC 1440 + 200% 확대** (`pc-1440-zoom-200`) | `1440×900` + `document.documentElement.style.zoom = "2"` | `/`, `/discover`, `/accessibility`, `/settings` | PASS | PASS | PASS (수평 클리핑 없음, 단 `/accessibility` 내부 슬라이더 상한은 `160%`로 제한됨 → `GAP-A11Y-03`) | [`pc-1440-zoom-200-home.png`](./screenshots/pc-1440-zoom-200-home.png), [`pc-1440-zoom-200-accessibility.png`](./screenshots/pc-1440-zoom-200-accessibility.png) |
| **Reduced Motion** (`pc-1440-reduced-motion`) | `1440×900` + `reducedMotion: "reduce"` | `/`, `/discover`, `/accessibility`, `/settings` | PASS | PASS | PASS (`transitionDuration: 0.01ms` 강제 단축 확인) | [`pc-1440-reduced-motion-home.png`](./screenshots/pc-1440-reduced-motion-home.png) |

---

### 3.2 키보드 `Tab` / `Escape` / 포커스 복귀(`Focus Restoration`) 실제 검증 결과

| 검증 시나리오 | 동작 절차 | 기대 계약 (`target`) | 실제 측정 결과 (`current`) | 판정 | 관련 증거 |
| --- | --- | --- | --- | --- | --- |
| **스킵 네비게이션 (`SkipLinks`)** | 페이지 진입 후 첫 `Tab` → `Enter` | `#main-content`(`tabIndex={-1}`)로 포커스 이동 | 일반 페이지에서 첫 `Tab`이 `본문으로 건너뛰기` 또는 상단 첫 대화형 요소(`2px solid` 포커스 링)에 도달하며 `#main-content` 랜드마크 제공 | **PASS** (일반 라우트) / **GAP-A11Y-05** (에디터 셸) | [`browser-sweep-report.json`](./browser-sweep-report.json) |
| **헤더 드롭다운 (`NavigationDropdown`)** | 트리거 포커스/키보드 오픈 → 내부 이동 → `Escape` | 드롭다운 닫힘(`aria-expanded="false"`) + 트리거로 포커스 복귀 | `aria-expanded: "false"`, `headerDropdownFocusReturn: true` | **PASS** | [`browser-sweep-report.json`](./browser-sweep-report.json) |
| **커맨드 팔레트 (`CommandPalette`)** | `button.site-header__search` 실행 → 검색창 자동 포커스 → `Escape` | 다이얼로그 닫힘 + 헤더 검색 트리거로 포커스 복귀 | `commandPaletteFocusReturn: true` | **PASS** | [`browser-sweep-report.json`](./browser-sweep-report.json) |
| **모바일 전체 메뉴 (`MobileHeaderNavigation`)** | `390×844`에서 `전체 메뉴` 오픈 → 내부 `Tab` 순환 → `Escape` | 모달 닫힘 + `전체 메뉴` 버튼으로 포커스 복귀 | `mobileMenuFocusReturn: true` | **PASS** | [`mobile-390-all-menu-dialog.png`](./screenshots/mobile-390-all-menu-dialog.png) |
| **화면 표시 설정 (`AppearanceDialog`)** | `.appearance-trigger` 오픈 → `Escape` 닫기 | 다이얼로그 닫힘 + 호출한 트리거로 포커스 복귀 + 단일 활성 트리거 `aria-expanded` + `aria-controls` | 포커스 복귀(`appearanceDialogFocusReturn: true`)는 정상이나, `appearanceTriggerHasAriaControls: false` 및 동일 `scope` 다중 트리거 동시 활성 문제 존재 | **GAP-A11Y-04** | [`pc-1440-appearance-dialog.png`](./screenshots/pc-1440-appearance-dialog.png) |
| **언어 선택기 (`LanguagePicker`)** | 트리거 오픈 → 닫기 버튼(`언어 선택 닫기`) 또는 빈 검색 결과 상태에서 `Escape` | 어느 내부 요소에 포커스가 있든 `Escape` 입력 시 다이얼로그 닫힘 + 트리거 복귀 | 검색창에서 `Escape`는 닫히고 복귀(`langEscapeFromInputCloses: true`, `langEscapeFromInputRestoresFocus: true`)하나, 닫기 버튼 포커스 상태에서 `Escape` 입력 시 **다이얼로그가 닫히지 않음** (`langEscapeFromCloseButtonCloses: false`) | **FAIL (`GAP-A11Y-01`)** | [`defect-gap-a11y-01-language-picker-escape.png`](./screenshots/defect-gap-a11y-01-language-picker-escape.png) |
| **모바일 플로팅 컨트롤 (`FloatingControls`)** | `390×844`에서 `[data-floating-controls-toggle]`에 키보드 포커스 → `Enter`로 펼침 → `Tab` | 새로 펼쳐진 하위 컨트롤(화면 설정/언어 선택/OST)로 포커스 진입 | 하위 패널이 토글 버튼 **앞(DOM 이전 위치)** 에 마운트되어 정방향 `Tab` 입력 시 패널로 진입하지 못하고 바깥으로 이탈 (`floatingForwardTabStayedInside: false`) | **FAIL (`GAP-A11Y-02`)** | [`defect-gap-a11y-02-mobile-floating-controls.png`](./screenshots/defect-gap-a11y-02-mobile-floating-controls.png) |
| **접근성 연구소 (`/accessibility`) 컨트롤** | 텍스트 배율 슬라이더 및 토글 스위치 점검 | 슬라이더 최대 `200%` 지원 + 시각적 스위치(`SwitchIndicator`)와 `role="switch"` 정합성 | 슬라이더 `max="160"` 제한(`sliderMax: "160"`, `supports200PercentInSlider: false`) 및 시각적 스위치에 `aria-pressed` 혼용(`toggleButtonCountUsingAriaPressed: 2`, `switchRoleCountInLab: 0`) | **FAIL (`GAP-A11Y-03`)** | [`defect-gap-a11y-03-accessibility-lab.png`](./screenshots/defect-gap-a11y-03-accessibility-lab.png) |

---

## 4. 발견 결함 요약 및 최소 패치 제안 (`current` -> `target`)

모든 결함의 상세 원인 분석, 재현 절차, 그리고 담당자가 충돌 없이 즉시 적용(`git apply`)할 수 있는 최소 unified diff 패치는 [전페이지 접근성 결함 상세 보고서 및 최소 패치 제안서](./findings-and-minimal-patches.md)에 수록되어 있다.

| 결함 ID | 심각도 | 대상 파일 (READ-ONLY) | 핵심 현상 (`current`) | 최소 패치 요약 (`target`) |
| --- | --- | --- | --- | --- |
| **`GAP-A11Y-01`** | **High** | [`apps/web/src/shared/components/LanguagePicker.tsx`](../../apps/web/src/shared/components/LanguagePicker.tsx) | 닫기 버튼 포커스 또는 검색 결과 0건 상태에서 `Escape`가 동작하지 않으며, 모바일에서는 부모 플로팅 클러스터까지 닫힘 | `<section role="dialog">` 컨테이너에 `onKeyDown`(`Escape` 시 `stopPropagation()` + `close()`) 추가 및 `aria-controls="language-picker-dialog"` 연결 |
| **`GAP-A11Y-02`** | **High** | [`apps/web/src/shared/components/FloatingControls.tsx`](../../apps/web/src/shared/components/FloatingControls.tsx) | 모바일에서 플로팅 컨트롤 펼침 후 정방향 `Tab` 시 패널 내부로 진입 불가 (역순 DOM 마운트) | 펼쳐진 패널을 토글 버튼 뒤(DOM 후행 위치)에 배치하고 시각적 배치는 `flex-col-reverse`로 유지, 오픈 시 첫 컨트롤 포커스 이동 |
| **`GAP-A11Y-03`** | **Medium** | [`apps/web/src/domains/legal/AccessibilityLab.tsx`](../../apps/web/src/domains/legal/AccessibilityLab.tsx) | `#accessibility-text-scale` 상한이 `160%`로 제한되어 `200%` 텍스트 확대 미달, 스위치 UI에 `aria-pressed` 사용 | 슬라이더 `max={200}` 및 `aria-valuetext` 보강, `PreferenceToggle`에 `role="switch"` + `aria-checked={pressed}` 적용 |
| **`GAP-A11Y-04`** | **Low** | [`apps/web/src/shared/components/appearance/AppearanceTrigger.tsx`](../../apps/web/src/shared/components/appearance/AppearanceTrigger.tsx) 외 2개 파일 | 동일 `scope`의 모든 `AppearanceTrigger`가 동시에 `aria-expanded="true"`로 표시되며 `aria-controls` 누락 | `state.returnFocusElement` 일치 여부로 `aria-expanded="true"`를 좁히고 `aria-controls="appearance-settings-dialog"` 부여 |
| **`GAP-A11Y-05`** | **Medium** | [`apps/web/src/domains/creator/studio-chrome-ui.tsx`](../../apps/web/src/domains/creator/studio-chrome-ui.tsx) | `<main>` 내부 중첩 `role="banner"`(`landmark-banner-is-top-level` 위반) 및 몰입형 스튜디오 셸 본문 스킵 링크 부재 | `StudioAppMenubar`의 중첩 `role="banner"`를 `role="region"`으로 교체하고 스튜디오 셸 상단 스킵 링크 제공 |

---

## 5. 재현 및 독립 검증 실행 방법 (`current`)

본 스위프의 모든 검사는 외부 유료 도구 없이 로컬/CI에서 단일 명령으로 즉시 재현할 수 있다.

```bash
# 1. 드라이런 (실행 계획 및 소유권 경계 설정 확인)
node scripts/accessibility-sweep-20261107/run-audit.mjs --dry-run

# 2. 트랙 A: 전페이지 라우트 인벤토리 (314 선언 / 441 구체화) 및 READ-ONLY 경계 단위 테스트
node scripts/accessibility-sweep-20261107/run-audit.mjs --track=inventory

# 3. 트랙 B: 실제 헤드리스 Chromium 멀티 뷰포트·키보드·포커스 복귀·200%·reduced-motion 검증
node scripts/accessibility-sweep-20261107/run-audit.mjs --track=browser

# 4. 전 트랙 통합 실행
node scripts/accessibility-sweep-20261107/run-audit.mjs --track=all
```

---

## 6. 관련 문서 링크 (`current`)

- [전페이지 라우트 인벤토리 및 접근성 검증 범위 매트릭스 (`route-inventory-and-coverage.md`)](./route-inventory-and-coverage.md)
- [전페이지 접근성 결함 상세 보고서 및 최소 패치 제안서 (`findings-and-minimal-patches.md`)](./findings-and-minimal-patches.md)
- [실제 브라우저 접근성 계측 원본 리포트 (`browser-sweep-report.json`)](./browser-sweep-report.json)
