# Round 5 접근성 결함 수정 및 멀티 뷰포트 실증 보고서 (`GAP-R4-05`: `HelpCenterPage.tsx` · `MarketQuickPreviewDialog.tsx`)

- **작성일**: 2026-11-07
- **대상 결함 ID**: `GAP-R4-05` ([Round 4 미검증 표면 감사 보고서](../a11y-uncovered-round4-20261107/README.md) · [카탈로그 정의](../a11y-uncovered-round4-20261107/uncovered-surface-catalog.ts))
- **소유 및 수정 파일**:
  - [apps/web/src/domains/legal/HelpCenterPage.tsx](../../apps/web/src/domains/legal/HelpCenterPage.tsx) (447줄 ≤ 800줄 상한)
  - [apps/web/src/domains/legal/HelpCenterPage.test.tsx](../../apps/web/src/domains/legal/HelpCenterPage.test.tsx) (180줄 ≤ 800줄 상한)
  - [apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx) (408줄 ≤ 800줄 상한)
  - [apps/web/src/domains/market/components/MarketQuickPreviewDialog.test.tsx](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.test.tsx) (154줄 ≤ 800줄 상한)
- **검증 스크립트 및 실측 리포트**:
  - [verify-help-market-a11y.mjs](./verify-help-market-a11y.mjs)
  - [verification-report.json](./verification-report.json)

---

## 1. 소유 경계 및 비침범 원칙 준수

| 구분 | 경로 / 범위 | 변경 여부 |
| --- | --- | --- |
| 소유 대상 컴포넌트 | [HelpCenterPage.tsx](../../apps/web/src/domains/legal/HelpCenterPage.tsx), [MarketQuickPreviewDialog.tsx](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx) | 수정 완료 |
| 소유 대상 단위 테스트 | [HelpCenterPage.test.tsx](../../apps/web/src/domains/legal/HelpCenterPage.test.tsx), [MarketQuickPreviewDialog.test.tsx](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.test.tsx) | 회귀 테스트 추가 완료 |
| 소유 대상 증거 문서 | [README.md](./README.md), [verify-help-market-a11y.mjs](./verify-help-market-a11y.mjs), [verification-report.json](./verification-report.json) | 작성 완료 |
| 변경 금지 영역 | 드로잉 로컬 UI, 공유 UI(`src/shared/components/ui/**`), 결제/구매/가격/라이선스 정책 로직, 라우트, 스토어, 타 페이지 | **0줄 변경 (비침범)** |

---

## 2. 재현된 실제 접근성 결함(`GAP-R4-05`)과 최소 수정 내역

### 2.1 [HelpCenterPage.tsx](../../apps/web/src/domains/legal/HelpCenterPage.tsx) (`/help`)

1. **도움말 인기 검색 필터 칩 · 검색어 지우기 버튼 · FAQ 링크 44×44px 터치 타깃 확보**:
   - 인기 검색어 필터(`POPULAR_TERMS`) 버튼과 빈 결과 화면의 `검색어 지우기` 버튼에 `inline-flex min-h-11 min-w-11 items-center justify-center`를 부여하고, 상위 컨테이너에 `data-own-control-size=""`를 선언하여 데스크톱(`@media (min-width: 768px)`) `#main-content` 특이도 규칙(`min-block-size: 2.5rem`)이 44px(`2.75rem`) 높이를 40px로 축소하지 않도록 보장했습니다.
   - FAQ `<summary>`(`min-h-11`) 및 펼쳐진 FAQ 내부 이동 `<Link>`(`inline-flex min-h-11 min-w-11 items-center`)에 44×44px 최소 타깃과 `focus-visible:ring-2` 포커스 링을 적용했습니다.
2. **320px 초소형 모바일 뷰포트 토픽 카드 그리드 리플로 개선**:
   - 기존 `grid-cols-2 gap-3 lg:grid-cols-4`는 `320px` 뷰포트에서 카드 폭이 약 `140px`로 좁아져 한글 제목·설명이 과도하게 줄바꿈되는 문제가 있었습니다.
   - `grid grid-cols-1 gap-2.5 min-[380px]:grid-cols-2 sm:gap-3 lg:grid-cols-4`로 수정하여 `320px`에서는 1열(`273px` 폭)로 여유 있게 읽히고, `390px` 이상에서는 2열(`167px` 폭), `1440px`에서는 4열(`305px` 폭)로 자연스럽게 반응하도록 개선했습니다.
3. **`prefers-reduced-motion` 대응**:
   - 인기 검색 필터 버튼, `검색어 지우기` 버튼, FAQ `<summary>` 회전 화살표(`›`)에 `motion-reduce:transition-none`을 명시했습니다.

### 2.2 [MarketQuickPreviewDialog.tsx](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx) (`/market` · `/market/browse` 빠른 미리보기 모달)

1. **모달 초점 진입 · 내부 `Tab` / `Shift+Tab` 초점 순환(Focus Trap) · 닫기 시 트리거 초점 복귀**:
   - 모달이 열리기 직전 `document.activeElement`가 모달 외부 유효 엘리먼트이면 `triggerRef.current`에 저장하고, 오픈 직후 닫기 버튼(`closeButtonRef.current`, `aria-label="빠른 미리보기 닫기"`)으로 초기 초점을 이동합니다.
   - `<dialog>`의 `keydown` 핸들러에서 `Tab` 및 `Shift+Tab` 입력 시 모달 내부 포커스 가능 요소 목록의 첫 요소 ↔ 마지막 요소 간 초점이 순환하도록 제어하여 배경 문서로 포커스가 새어나가지 않게 했습니다.
   - `Escape` 키, 닫기 버튼 클릭, 백드롭 외부 클릭, 또는 `record={null}` 전환으로 모달이 닫힐 때 `restoreTriggerFocus()`를 호출해 원래 미리보기를 열었던 카드 버튼으로 초점을 복귀합니다.
2. **모달 내부 모든 버튼·태그·하단 CTA 44×44px 터치 타깃 보장**:
   - `<dialog>` 루트에 `data-own-control-size=""`와 `aria-modal={record ? "true" : undefined}`를 부여했습니다.
   - 우측 상단 닫기 버튼(`size-11 min-h-11 min-w-11`), 배급자 링크(`min-h-11 min-w-11`), 찜하기 버튼(`min-h-11 min-w-11`), 비교 토글 래퍼(`[&_button]:min-h-11 [&_button]:min-w-11`), `#tag` 검색 링크(`min-h-11 min-w-11`), 하단 액션 링크 3종(`원고 위 시험 (Fit Lab)`, `Studio에서 열기`, `상세 페이지 보기` — 모두 `min-h-11 min-w-11`)이 전 뷰포트에서 최소 `44×44px` 이상으로 측정됩니다.
3. **모바일(320px/390px) 간격 및 배지 겹침 방지**:
   - 커버 상단 배지 영역을 `left-3 right-16 top-3`으로 배치하여 우측 상단 `44×44px` 닫기 버튼(`right-3 top-3 size-11`)과 절대 겹치지 않도록 분리했습니다.
   - 모바일 본문 패딩(`p-4 sm:p-6`), 태그 간격(`gap-2`), 하단 CTA 스택 간격(`flex-col gap-2.5 ... sm:flex-row`)을 적용해 터치 간섭과 가로 넘침(`docOverflowX = 0`)을 방지했습니다.

---

## 3. 실제 브라우저 멀티 뷰포트(`320` / `390` / `768` / `1440` / `200%` 확대) 검증 결과

[verify-help-market-a11y.mjs](./verify-help-market-a11y.mjs)를 통해 Chromium 실브라우저에서 측정한 [verification-report.json](./verification-report.json) 요약입니다.

### 3.1 `/help` ([HelpCenterPage.tsx](../../apps/web/src/domains/legal/HelpCenterPage.tsx))

| 뷰포트 | 가로 넘침 (`docOverflowX`) | 인기 필터 최소 크기 (`W×H`) | 토픽 카드 첫 항목 폭 | 빈 검색 `검색어 지우기` 크기 | `motion-reduce` 적용 |
| --- | --- | --- | --- | --- | --- |
| `320×568` (`mobile-320`) | `0px` | `51×44px` (4개 전원 ≥44px) | `273px` (1열 리플로) | `110×44px` | PASS |
| `390×844` (`mobile-390`) | `0px` | `51×44px` (4개 전원 ≥44px) | `167px` (2열 리플로) | 측정 통과 | PASS |
| `768×1024` (`tablet-768`) | `0px` | `51×44px` (4개 전원 ≥44px) | `347px` (2열 리플로) | 측정 통과 | PASS |
| `1440×900` (`desktop-1440`) | `0px` | `51×44px` (4개 전원 ≥44px) | `305px` (4열 리플로) | 측정 통과 | PASS |
| `1440×900 @ 200%` (`zoom200`) | `0px` | `51×44px` (4개 전원 ≥44px) | `153px` (200% 확대) | 측정 통과 | PASS |

### 3.2 `/market` 빠른 미리보기 모달 ([MarketQuickPreviewDialog.tsx](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.tsx))

| 뷰포트 | 가로 넘침 | 닫기 버튼 크기 | 배지-닫기버튼 비겹침 | 모달 내 전체 컨트롤(12개) 최소 크기 | 오픈 시 닫기버튼 자동 초점 | `Shift+Tab` / `Tab` 순환 트랩 | `Escape` 닫기 및 트리거 초점 복귀 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `320×568` (`mobile-320`) | `0px` | `44×44px` | PASS | `47×44px` (12/12 ≥44px) | PASS | PASS (`상세 페이지 보기` ↔ `빠른 미리보기 닫기`) | PASS |
| `390×844` (`mobile-390`) | `0px` | `44×44px` | PASS | `47×44px` (12/12 ≥44px) | PASS | PASS (`상세 페이지 보기` ↔ `빠른 미리보기 닫기`) | PASS |
| `768×1024` (`tablet-768`) | `0px` | `44×44px` | PASS | `47×44px` (12/12 ≥44px) | PASS | PASS (`상세 페이지 보기` ↔ `빠른 미리보기 닫기`) | PASS |
| `1440×900` (`desktop-1440`) | `0px` | `44×44px` | PASS | `47×44px` (12/12 ≥44px) | PASS | PASS (`상세 페이지 보기` ↔ `빠른 미리보기 닫기`) | PASS |
| `1440×900 @ 200%` (`zoom200`) | `0px` | `44×44px` | PASS | `47×44px` (12/12 ≥44px) | PASS | PASS (`상세 페이지 보기` ↔ `빠른 미리보기 닫기`) | PASS |

---

## 4. 단위 테스트 · 타입 · 린트 · 800줄 상한 · 독립 감사 결과

- **단위 및 회귀 테스트 (`vitest`)**:
  - [HelpCenterPage.test.tsx](../../apps/web/src/domains/legal/HelpCenterPage.test.tsx): 17개 테스트 전원 통과
  - [MarketQuickPreviewDialog.test.tsx](../../apps/web/src/domains/market/components/MarketQuickPreviewDialog.test.tsx): 3개 테스트 전원 통과 (총 20/20 통과)
- **Round 4 카탈로그 호환성 테스트 (`node --test`)**:
  - [uncovered-surface-catalog.test.ts](../a11y-uncovered-round4-20261107/uncovered-surface-catalog.test.ts): 통과
- **정적 분석 및 품질 게이트**:
  - TypeScript(`tsconfig.json` 기반 `ts.createProgram`): 오류 0건
  - ESLint(`npx eslint`): 오류 0건, 경고 0건
  - 소스 파일 800줄 크기 상한(`scripts/check-source-file-size.mjs`): 통과 (`HelpCenterPage.tsx` 447줄, `MarketQuickPreviewDialog.tsx` 408줄)
  - 시크릿 스캔(`pnpm run quality:secrets:changed`): 통과
  - 독립 감사 서브에이전트 검증: 파일 소유 경계, 800줄 제한, `GAP-R4-05` 접근성 요구사항, 카탈로그 호환성 전 항목 PASS
