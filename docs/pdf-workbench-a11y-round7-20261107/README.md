# Round 7 `GAP-R6-02` (`/studio/pdf-workbench`) 접근성 실제 수정 및 검증 보고서

## 1. 감사 근거 및 파일 소유 경계

- **감사 근거**: [`../a11y-uncovered-round6-20261107/README.md`](../a11y-uncovered-round6-20261107/README.md) (`GAP-R6-02`) 및 [`../a11y-uncovered-round6-20261107/browser-round6-report.json`](../a11y-uncovered-round6-20261107/browser-round6-report.json)
- **독점 소유 및 수정 파일**:
  - [`PdfWorkbenchPage.tsx`](../../apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.tsx) (`660줄` ≤ `800줄` 상한)
  - [`PdfWorkbenchPage.test.tsx`](../../apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.test.tsx) (`132줄` ≤ `800줄` 상한)
  - [`verify-pdf-workbench-round7.mjs`](./verify-pdf-workbench-round7.mjs)
  - 수정 전 실브라우저 측정 리포트: [`before-report.json`](./before-report.json)
  - 수정 후 실브라우저 측정 리포트: [`verification-report.json`](./verification-report.json)
- **변경 금지 보호 확인**:
  - PDF 생성(`buildMergedPdfBytes`, `buildSplitPdfFiles`) · 저장(`downloadBlob`) · 파일 삭제(`removeSource`, `clearAll`) · 페이지 순서/회전/제거(`movePdfPage`, `movePdfPageTo`, `rotatePdfPage`, `removePdfPage`) · 사용자 문서 속성(`PdfWorkbenchMetadataPanel`, `metadataFromFormValue`) 의미 및 데이터 처리 로직 무변경.
  - 공유 UI · 전역 CSS · 스토어 · 라우트 · 다른 페이지 무변경.

---

## 2. 실브라우저 재현 결함(`before`) 및 최소 수정(`after`) 요약

합성 2페이지 PDF(`synthetic-a11y-sample.pdf`)를 실제 Headless Chromium에서 업로드하여 `320×844`, `390×844`, `768×1024`, `1440×900`, `1440×900 @ 200%` 5개 뷰포트에서 전후 비교 측정했습니다.

| 검증 항목 | 수정 전 ([`before-report.json`](./before-report.json)) | 수정 후 ([`verification-report.json`](./verification-report.json)) | 최소 수정 내용 |
| :--- | :---: | :---: | :--- |
| 재단·도련 규격 프리셋 그룹 시맨틱 (`trimGroupRole` / `trimGroupAriaLabel`) | **`null` / `null`** | **`"group"` / `"재단 및 도련 규격 프리셋"`** (`en`: `"Trim & Bleed Spec Presets"`) | [`PdfWorkbenchPage.tsx`](../../apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.tsx) 프리셋 컨테이너에 `role="group"` 및 로케일별 `aria-label` 부여 |
| 잉크 프로파일 프리셋 그룹 시맨틱 (`inkGroupRole` / `inkGroupAriaLabel`) | **`null` / `null`** | **`"group"` / `"잉크 프로파일 프리셋"`** (`en`: `"Ink Profile Presets"`) | 잉크 프로파일 컨테이너에 `role="group"` 및 로케일별 `aria-label` 부여 |
| 프리셋 토글 버튼 6종 최소 `44×44px` & 포커스 가시성 (`allPresetsMeet44pxAndFocusVisible`) | **`false`** (PC `1440` 높이 `30px`~`40px`, `hasFocusVisibleClass: false`) | **`true`** (전 뷰포트 `>= 44×44px`, `focus-visible:outline-2`) | `min-h-11 min-w-11 px-3.5 py-2` 및 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent` 적용 |
| 추가된 파일 빼기(`X`) 버튼 최소 `44×44px` & 포커스 가시성 (`allRemoveSourceButtonsMeet44pxAndFocusVisible`) | **`false`** (`320px`: `20×44px`, `390px`: `28×44px`, `1440px`: `28×28px`, `hasFocusVisibleClass: false`) | **`true`** (전 뷰포트 **`44×44px`**, `focus-visible:outline-2`) | `size-7` → `size-11 min-h-11 min-w-11 shrink-0` 및 명시적 `focus-visible` 아웃라인 적용 |
| 페이지 조작 아이콘 버튼 4종(`앞으로`, `뒤로`, `시계 방향으로 회전`, `목록에서 제거`) 최소 `44×44px` & 포커스 가시성 (`allPageActionButtonsMeet44pxAndFocusVisible`) | **`false`** (`320px`: `25×44px`, `390px`: `32×44px`, `1440px`: `32×32px`, `hasFocusVisibleClass: false`) | **`true`** (전 뷰포트 8개 버튼 전부 **`44×44px`**, `role="group"` 및 `focus-visible:outline-2`) | `size-8` → `size-11 min-h-11 min-w-11 shrink-0`, 모바일(`320`/`390`) 가로 압축 방지를 위한 `grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5` 반응형 열 구성 |
| 전 뷰포트 가로 오버플로 `0px` (`allZeroHorizontalOverflow`) | `true` | `true` (`0px`) | 320/390/768/1440/200% 전 뷰포트 가로 스크롤 `0px` 유지 |
| 키보드 조작 및 PDF 기능 의미 보존 (`keyboardAndPdfSemanticsPreserved`) | `true` | `true` | 키보드 `Enter` 프리셋 전환, 페이지 회전(`90°`), 페이지 순서 이동(`원본 2페이지` 선두), 페이지 제거, 파일 빼기 상태 알림 검증 |

---

## 3. 5개 뷰포트 실브라우저 측정 매트릭스 (`before` vs `after`)

| 뷰포트 | 가로 오버플로 | 프리셋 그룹 `role` (`before` → `after`) | 프리셋 버튼 최소 크기 (`before` → `after`) | 파일 빼기 버튼 크기 (`before` → `after`) | 페이지 조작 버튼 4종 크기 (`before` → `after`) | `axe-core` 위반 (`PdfWorkbenchPage`) |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: |
| `mobile-320` (`320×844`) | `0px` | `null` → `"group"` | `108×44` (무링) → **`116×44`** (포커스링) | `20×44` → **`44×44`** | `25×44` → **`44×44`** | `0` |
| `mobile-390` (`390×844`) | `0px` | `null` → `"group"` | `108×44` (무링) → **`116×44`** (포커스링) | `28×44` → **`44×44`** | `32×44` → **`44×44`** | `0` |
| `tablet-768` (`768×1024`) | `0px` | `null` → `"group"` | `108×30` → **`116×44`** | `28×28` → **`44×44`** | `32×32` → **`44×44`** | `0` |
| `pc-1440` (`1440×900`) | `0px` | `null` → `"group"` | `108×30` → **`116×44`** | `28×28` → **`44×44`** | `32×32` → **`44×44`** | `0` |
| `pc-1440-zoom-200` (`1440×900 @ 200%`) | `0px` | `null` → `"group"` | `108×30` → **`116×44`** | `28×28` → **`44×44`** | `32×32` → **`44×44`** | `0` |

---

## 4. 기존 PDF 회귀 · 타입 · 린트 · 800줄 · 독립 감사 결과

1. **기존 PDF 워크벤치 전체 회귀 테스트 (`vitest`)**:
   - `apps/web/src/domains/creator/pdf-workbench/` 하위 **7개 테스트 파일 (72 tests) 전원 통과**:
     - [`PdfWorkbenchPage.test.tsx`](../../apps/web/src/domains/creator/pdf-workbench/PdfWorkbenchPage.test.tsx) (4 tests)
     - [`pdf-workbench-engine.test.ts`](../../apps/web/src/domains/creator/pdf-workbench/pdf-workbench-engine.test.ts) (8 tests)
     - [`pdf-workbench-model.test.ts`](../../apps/web/src/domains/creator/pdf-workbench/pdf-workbench-model.test.ts) (19 tests)
     - [`pdf-workbench-metadata.test.ts`](../../apps/web/src/domains/creator/pdf-workbench/pdf-workbench-metadata.test.ts) (17 tests)
     - [`pdf-workbench-outline.test.ts`](../../apps/web/src/domains/creator/pdf-workbench/pdf-workbench-outline.test.ts) (11 tests)
     - [`pdf-workbench-anchor.test.ts`](../../apps/web/src/domains/creator/pdf-workbench/pdf-workbench-anchor.test.ts) (7 tests)
     - [`pdf-workbench-comments.test.ts`](../../apps/web/src/domains/creator/pdf-workbench/pdf-workbench-comments.test.ts) (6 tests)
2. **타입 · 린트 · 800줄 상한 · 시크릿 검사**:
   - TypeScript (`ts.createProgram` with `tsconfig.json`): **0 diagnostics**
   - ESLint (`npx eslint`): **0 errors / 0 warnings**
   - 소스 파일 줄 수 상한 (`node scripts/check-source-file-size.mjs`): **PASS** (`PdfWorkbenchPage.tsx` 660줄, `PdfWorkbenchPage.test.tsx` 132줄 ≤ 800줄)
   - 시크릿 누출 검사 (`pnpm run quality:secrets:changed`): **PASS**
3. **독립 서브에이전트 감사 (`def94511ed94b3b7a489acf639114f9f`)**:
   - `GAP-R6-02` 그룹 시맨틱, `44×44px` 타깃 바닥선, 포커스 가시성, PDF 기능 불변성, 파일 소유 경계 및 800줄 상한 전 항목 **PASS**.
