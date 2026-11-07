# 컷츠 스튜디오(`/cuts/studio`) · 따라 그리기(`/learn/trace`) 활성 칩 명도 대비 및 44px 터치 타깃 보강 보고서 (Round 7 · GAP-R6-01)

## 1. 배경 및 재현 결함 요약

Round 6 미커버 화면 접근성 실브라우저 감사([`docs/a11y-uncovered-round6-20261107/README.md`](../a11y-uncovered-round6-20261107/README.md))에서 `GAP-R6-01`(심각도: **High**)로 식별된 두 화면의 접근성 결함을 최소 범위로 수정하고 검증했습니다.

1. **다크·고대비 테마 활성 토글 칩 명도 대비 미달 (`text-white` 하드코딩)**:
   - [`apps/web/src/domains/cuts/CutsStudioPage.tsx`](../../apps/web/src/domains/cuts/CutsStudioPage.tsx)의 렌더 엔진(`[data-testid^="cuts-studio-rea-engine-"]`)·목표 프레임레이트(`[data-testid^="cuts-studio-rea-fps-"]`) 활성 토글 칩과 [`apps/web/src/domains/learn/TracePracticePage.tsx`](../../apps/web/src/domains/learn/TracePracticePage.tsx)의 드릴 프리셋(`[data-testid^="trace-practice-rea-drill-"]`)·가이드 농도(`[data-testid^="trace-practice-rea-opacity-"]`) 활성 토글 칩이 `bg-accent` 배경 위에 의미 토큰 `text-on-accent` 대신 `text-white`를 하드코딩해 다크 테마에서 명도 대비가 `1.88:1`(WCAG AA `4.5:1` 미달)로 떨어졌습니다.
2. **토글 칩 높이 `40px`(`< 44px`) 및 포커스 링·모션 감쇠 누락**:
   - 두 화면의 REA 프리셋·커브·오토더킹·드릴·농도 토글 버튼이 `px-2.5 py-1` 또는 `px-2 py-0.5`로 선언되어 최소 터치 타깃(`44×44px`)에 미달했으며, `focus-visible:outline-2` 및 `motion-reduce:transition-none` 유틸리티가 일관되게 지정되지 않았습니다.

---

## 2. 최소 변경 내역

- [`apps/web/src/domains/cuts/CutsStudioPage.tsx`](../../apps/web/src/domains/cuts/CutsStudioPage.tsx):
  - 렌더 엔진(`cuts-studio-rea-engine-*`) 및 목표 프레임레이트(`cuts-studio-rea-fps-*`) 활성 상태 클래스를 `border-accent bg-accent text-on-accent`로 정합화하고, 모든 프리셋·카메라 커브(`cuts-studio-rea-curve-*`)·오토더킹(`cuts-studio-rea-duck-*`) 토글 버튼에 `inline-flex min-h-11 items-center`, `px-3 py-1.5`, `motion-reduce:transition-none`, `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`를 적용했습니다.
- [`apps/web/src/domains/learn/TracePracticePage.tsx`](../../apps/web/src/domains/learn/TracePracticePage.tsx):
  - 드릴 타이머 프리셋(`trace-practice-rea-drill-*`) 및 어니언스킨 가이드 농도(`trace-practice-rea-opacity-*`) 활성 상태 클래스를 `border-accent bg-accent text-on-accent`로 교체하고, 공통 클래스에 `inline-flex min-h-11 items-center`, `px-3 py-1.5`, `motion-reduce:transition-none`, `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`를 적용했습니다.
- 단위 회귀 테스트 보강:
  - [`apps/web/src/domains/cuts/CutsStudioPage.test.tsx`](../../apps/web/src/domains/cuts/CutsStudioPage.test.tsx)
  - [`apps/web/src/domains/learn/TracePracticePage.test.tsx`](../../apps/web/src/domains/learn/TracePracticePage.test.tsx)

---

## 3. 실브라우저 및 단위 테스트 검증 결과

| 검증 항목 | 수정 전 (`Round 6`) | 수정 후 (`Round 7`) | 판정 |
| --- | --- | --- | --- |
| 활성 토글 칩 전경색 토큰 | `text-white` (`1.88:1`) | **`text-on-accent` (`7.94:1`)** | PASS |
| `@axe-core/playwright` `color-contrast` (`dark` / `light` / `contrast`) | `2건` 위반 | **`0건`** | PASS |
| 5개 뷰포트(`320×844` ~ `1440×900`, `200%` 확대) 최소 타깃 높이 | `40px` (`< 44px`) | **`44px` (`200%` 확대 시 `88px`)** | PASS |
| `prefers-reduced-motion: reduce` 전환 시간 | `0.15s` | **`<= 0.01ms` (`motion-reduce:transition-none`)** | PASS |
| 키보드 `Space` / `Enter` 토글 및 `2px` 포커스 링 | 포커스 링 누락 | **`aria-pressed` 전환 및 `2px` 포커스 링 보존** | PASS |
| 단위 테스트 (`CutsStudioPage.test.tsx`, `TracePracticePage.test.tsx`) | 기존 5개 통과 | **7개 통과 (`0 failed`)** | PASS |
