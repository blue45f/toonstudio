# 요금제(`/pricing`) `GAP-R4-03` 접근성 결함 최소 수정 및 실브라우저 검증 보고서 (Round 5)

- **작성일**: 2026-11-07
- **대상 결함**: [`GAP-R4-03`](../a11y-uncovered-round4-20261107/README.md) (`/pricing` 추천 배지 하드코딩 `text-white` 고대비 테마 명도 대비 미달 및 FAQ `<summary>` 마커·포커스 링 누락)
- **소유 범위**:
  - [pricing-page.tsx](../../apps/web/src/app/routes/pricing-page.tsx)
  - [pricing-page.test.tsx](../../apps/web/src/app/routes/pricing-page.test.tsx)
  - [README.md](./README.md)
- **비소유/불변 준수**:
  - 요금·플랜·결제/구독/약관/프로모션 문구 및 정책 데이터(`MEMBERSHIP_PLAN_POLICIES`, `MEMBERSHIP_ECONOMY_POLICY`) 변경 없음
  - 공유 테마(`globals.css`, `design-themes.css`, `unified-theme-contract.css`), 라우트 설정, 다른 페이지 파일 변경 없음

---

## 1. 재현된 접근성 결함 (`GAP-R4-03`) 및 최소 수정 내역

### 1.1 Pro 플랜 추천 배지 하드코딩 `text-white` → 의미 토큰 `text-on-accent` 정합화
- **원인**: [pricing-page.tsx](../../apps/web/src/app/routes/pricing-page.tsx)의 Pro 플랜 상단 `추천` 배지가 `bg-accent` 배경 위에 `text-white`를 하드코딩하여, 밝은 황색 액센트(`--color-accent: oklch(0.89 0.14 100)`)를 사용하는 `contrast` 테마에서 전경·배경 명도 대비가 **1.38:1**(WCAG 1.4.3 최소 기준 4.5:1 미달)로 떨어졌고, 기본 `dark` 테마(`--color-accent: oklch(0.72 0.185 42)`)에서도 **2.67:1**에 그쳤습니다.
- **최소 수정**: 배지 전경 클래스를 기존 의미 토큰 `text-on-accent`로 교체했습니다.

### 1.2 FAQ `<summary>` 대체 열림 아이콘(`ChevronDown`) · 키보드 `focus-visible` 링 · 44px 터치 타깃 보장
- **원인**: [pricing-page.tsx](../../apps/web/src/app/routes/pricing-page.tsx) 하단 자주 묻는 질문(`#faq`)의 `<summary>` 요소가 `list-none [&::-webkit-details-marker]:hidden`으로 브라우저 기본 삼각형 마커를 숨기면서 대체 열림/접힘 표시 아이콘과 명시적 `focus-visible` 외곽선/링 클래스를 누락했습니다.
- **최소 수정**:
  - `<summary>`에 `min-h-11`(44px 최소 터치 높이)과 함께 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:ring-2 focus-visible:ring-accent/70`을 부여했습니다.
  - 질문 텍스트 우측에 `aria-hidden="true"` 속성의 `ChevronDown` 아이콘을 배치하고 `group-open:rotate-180 group-open:text-accent motion-reduce:transition-none`으로 열림 상태 시각 피드백과 동작 줄이기(`prefers-reduced-motion: reduce`) 대응을 함께 보장했습니다.

---

## 2. 테마별(`light` / `dark` / `contrast`) 추천 배지 실제 명도 대비 실측

실제 Chromium 브라우저(`1440×900`)에서 `<canvas>` 1×1 픽셀 sRGB 샘플링으로 측정한 `bg-accent` 대비 전경색 명도 대비(WCAG 2.1 상대 휘도 공식) 비교 결과입니다.

| 테마 (`data-theme` / `data-design-theme`) | 배지 배경 (`bg-accent` sRGB) | 배지 전경 (`text-on-accent` sRGB) | 수정 전 (`text-white`) 명도 대비 | 수정 후 (`text-on-accent`) 명도 대비 | WCAG 1.4.3 (4.5:1) 판정 |
| --- | --- | --- | ---: | ---: | --- |
| **`light` (`light` / `light`)** | `rgb(183, 66, 13)` | `rgb(253, 252, 249)` | `6.53:1` | **`6.33:1`** | **PASS** (≥ 4.5:1) |
| **`dark` (`dark` / `dark`)** | `rgb(239, 129, 62)` | `rgb(26, 20, 15)` | `2.67:1` (FAIL) | **`6.78:1`** | **PASS** (≥ 4.5:1) |
| **`contrast` (`dark` / `contrast`)** | `rgb(239, 224, 128)` | `rgb(15, 15, 15)` | `1.38:1` (FAIL) | **`13.91:1`** | **PASS** (AAA ≥ 7.0:1) |

---

## 3. 멀티 뷰포트(`320` / `390` / `768` / `1440` / `200% 확대`) × 3개 테마 실브라우저 검증 매트릭스

| 뷰포트 | 테마 | 가로 오버플로 (`px`) | 배지 `text-on-accent` 적용 | 배지 명도 대비 | FAQ `<summary>` 높이 (`px`) | 44px 터치 보장 | 대체 SVG 아이콘 (`aria-hidden`) | `#plans`·`#faq` Axe 위반 수 |
| --- | --- | ---: | --- | ---: | --- | --- | --- | ---: |
| **Mobile 320 (`320×844`)** | `light` / `dark` / `contrast` | `0` | `true` | `6.33` / `6.78` / `13.91` | `[44, 44, 44, 44]` | `true` | `true` | `0` |
| **Mobile 390 (`390×844`)** | `light` / `dark` / `contrast` | `0` | `true` | `6.33` / `6.78` / `13.91` | `[44, 44, 44, 44]` | `true` | `true` | `0` |
| **Tablet 768 (`768×1024`)** | `light` / `dark` / `contrast` | `0` | `true` | `6.33` / `6.78` / `13.91` | `[44, 44, 44, 44]` | `true` | `true` | `0` |
| **PC 1440 (`1440×900`)** | `light` / `dark` / `contrast` | `0` | `true` | `6.33` / `6.78` / `13.91` | `[44, 44, 44, 44]` | `true` | `true` | `0` |
| **PC 1440 200% 확대 (`zoom: 2`)** | `light` / `dark` / `contrast` | `0` | `true` | `6.33` / `6.78` / `13.91` | `[88, 88, 88, 88]` | `true` | `true` | `0` |

---

## 4. 키보드 내비게이션 및 정적·단위 검증 결과

- **키보드 FAQ 조작 (`desktop-1440`, `contrast` 테마)**:
  - 직전 플랜 카드 CTA에서 `Tab` 입력 시 첫 번째 FAQ `<summary>`(`"정말 무료인가요?"`)로 즉시 포커스 도달 (`tabReachedFirstSummary: true`)
  - `:focus-visible` 매칭 확인 (`matchesFocusVisible: true`, `outlineStyle: "solid"`, `outlineWidth: "3px"`, `outlineColor: "oklch(0.89 0.14 100)"`)
  - `Enter` 입력 시 `<details open>` 펼침(`openedWithEnter: true`), `Space` 입력 시 다시 접힘(`closedWithSpace: true`) 확인
- **`GAP-R4-03` 재현 조건 재검증**:
  - `usesHardcodedTextWhiteOnAccent: false`
  - `summaryHidesMarkerWithoutIcon: false`
  - `reproduced: false`
- **테스트·린트·타입·파일 크기 검증**:
  - `pnpm exec vitest run apps/web/src/app/routes/pricing-page.test.tsx apps/web/src/domains/marketing/pricing-page.contract.test.ts`: **2개 파일, 16 / 16 테스트 통과**
  - `pnpm exec eslint --max-warnings=0 apps/web/src/app/routes/pricing-page.tsx apps/web/src/app/routes/pricing-page.test.tsx`: **에러 0, 경고 0**
  - TypeScript(`pricing-page.tsx`, `pricing-page.test.tsx`): **에러 0**
  - 소스 파일 줄 수: [pricing-page.tsx](../../apps/web/src/app/routes/pricing-page.tsx) `360줄`, [pricing-page.test.tsx](../../apps/web/src/app/routes/pricing-page.test.tsx) `139줄` (800줄 상한 준수)
