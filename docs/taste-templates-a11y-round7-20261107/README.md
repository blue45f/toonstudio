# Round 7 — `GAP-R6-03` 취향 온보딩(`TasteOnboardingPage`) 및 스튜디오 템플릿(`StudioTemplatesPage`) 접근성·터치 타깃·키보드 포커스 개선 증거

- **작업 일자**: 2026-11-07
- **대상 결함 ID**: `GAP-R6-03` (Round 6 미점검 secondary 화면 접근성 감사 재현 결함)
- **작업 브랜치**: `codex/taste-templates-a11y-round7-20261107`
- **소유 범위**:
  - [`apps/web/src/domains/engagement/TasteOnboardingPage.tsx`](../../apps/web/src/domains/engagement/TasteOnboardingPage.tsx) (`513`줄, `800`줄 상한 준수)
  - [`apps/web/src/domains/engagement/TasteOnboardingPage.test.tsx`](../../apps/web/src/domains/engagement/TasteOnboardingPage.test.tsx) (`197`줄, `800`줄 상한 준수)
  - [`apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx`](../../apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx) (`630`줄, `800`줄 상한 준수)
  - [`apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.test.tsx`](../../apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.test.tsx) (`133`줄, `800`줄 상한 준수)
  - [`./verification-report.json`](./verification-report.json)

---

## 1. Round 6 감사 근거(`GAP-R6-03`) 및 전·후 비교

| 측정 항목 | 수정 전 (Round 6 재현치) | 수정 후 (Round 7 실측치) | 판정 |
| --- | --- | --- | :---: |
| `/onboarding/taste` Step 2 감상 강도 컨테이너 `role` / `aria-label` | `null` / `"맞춤 추천 화면 안내"` | `role="group"` / `aria-label="감상 강도"` | **PASS** |
| `/onboarding/taste` Step 3 회피 태그 컨테이너 `role` / `aria-label` | `null` / `"맞춤 추천 화면 안내"` | `role="group"` / `aria-label="회피 태그"` | **PASS** |
| `/onboarding/taste` Step 3 회피 태그 버튼 높이 (`1440×900` 포함 전 뷰포트) | `40px` (`min-h-9 pointer-coarse:min-h-11` 미달) | **`44px`** (`min-h-11` + `style={{ minHeight: "44px" }}`, 8개 전수 `>= 44px`) | **PASS** |
| `/studio/templates` 상단 카테고리 필터 컨테이너 `role` / `aria-label` | `null` / `null` | `role="group"` / `aria-label="템플릿 카테고리 필터"` | **PASS** |
| `/studio/templates` 카테고리 필터·즐겨찾기 토글 버튼 높이 | `40px` (`min-h-10`) | **`44px`** (`min-h-11` + `style={{ minHeight: "44px" }}`, 7개 전수 `>= 44px`) | **PASS** |
| `/studio/templates` 판형 규격·목적 빠른 필터 버튼 높이 | `40px` (`min-h-8`) | **`44px`** (`min-h-11` + `style={{ minHeight: "44px" }}`, 5개 전수 `>= 44px`) | **PASS** |
| 키보드 `Tab` 포커스 링 (`focus-visible:outline-*`) | 일부 버튼 누락 | 전 토글·네비게이션·액션 버튼 명시적 `focus-visible:outline` 적용 | **PASS** |
| `GAP-R6-03` 재현 여부 (`reproduced`) | `true` | **`false`** | **PASS** |

---

## 2. 최소 코드 수정 요약 및 도메인 의미 불변성 검증

1. **[`TasteOnboardingPage.tsx`](../../apps/web/src/domains/engagement/TasteOnboardingPage.tsx)**:
   - Step 1 장르 그리드에 `role="group" aria-label="선호 장르"` 추가.
   - Step 2 감상 강도 토글 컨테이너에 `role="group" aria-label="감상 강도"` 추가(`style={{ minHeight: "80px" }}` 병행).
   - Step 3 회피 태그 토글 컨테이너에 `role="group" aria-label="회피 태그"` 추가 및 각 태그 버튼에 `min-h-11 rounded-full border px-3.5 py-2`와 `style={{ minHeight: "44px" }}`를 함께 적용해 데스크톱(`>= 768px`) 전역 `#main-content`의 `min-block-size: 2.5rem`(`40px`) 규칙 아래에서도 `>= 44px` 터치 타깃과 `focus-visible:outline` 포커스 링을 보장.
   - Step 4 선호 포맷·선호 상태 토글 컨테이너에 각각 `role="group" aria-label="선호 포맷"`, `role="group" aria-label="선호 상태"` 및 `min-h-11` + `style={{ minHeight: "44px" }}` 적용, 하단 이전/닫기/다음/완료 버튼에도 동일 적용.
   - **의미 불변성**: `setTastePreferences`, `setRating`, `setRead`, `/recommend` 쿼리 파라미터 이동 및 재방문 복원(`formTouchedRef`) 로직은 일절 변경하지 않았습니다.
2. **[`StudioTemplatesPage.tsx`](../../apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.tsx)**:
   - 상단 카테고리 필터 컨테이너에 `role="group" aria-label={bt("템플릿 카테고리 필터", "Template category filter")}` 추가.
   - 카테고리 필터 칩, 즐겨찾기 필터 칩, 하단 판형·목적 프리셋 칩(`[data-template-spec-preset]`)에 `min-h-11 rounded-full border px-3.5 py-2`, `style={{ minHeight: "44px" }}`, `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`를 일관 적용.
   - 카드 및 상세 미리보기의 즐겨찾기 토글(`size-11 min-h-11 min-w-11`, `style={{ minHeight: "44px", minWidth: "44px" }}`)과 `"구성 보기"`·`"이 템플릿으로 시작"` 버튼도 44px 타깃과 키보드 포커스 링을 보장.
   - **의미 불변성**: 템플릿 카탈로그 검색(`searchStudioTemplates`), 핸드오프(`writeStudioTemplateHandoff`), 즐겨찾기 저장(`writeStudioTemplateFavorites`), `/studio/new` 시작 동선은 일절 변경하지 않았습니다.

---

## 3. 정적 게이트 및 단위·통합 회귀 테스트 결과

- **Vitest (`2 files, 10 tests passed`)**:
  - [`TasteOnboardingPage.test.tsx`](../../apps/web/src/domains/engagement/TasteOnboardingPage.test.tsx): `5 passed` (기존 4건 + `GAP-R6-03` 그룹 역할·44px 타깃·포커스 클래스 회귀 1건)
  - [`StudioTemplatesPage.test.tsx`](../../apps/web/src/domains/creator/studio-shell/StudioTemplatesPage.test.tsx): `5 passed` (기존 4건 + `GAP-R6-03` 카테고리·판형 프리셋 그룹 역할·44px 타깃·포커스 클래스 회귀 1건)
- **TypeScript (`tsc --noEmit`)**: `0 errors`
- **ESLint & `node scripts/lint-changed.mjs --staged`**: `0 errors, 0 warnings`
- **Source File Size Ratchet (`node scripts/check-source-file-size.mjs`)**: `PASS (상한 800줄)`
- **Secretlint (`node scripts/secretlint-files.mjs`)**: `PASS`

---

## 4. 실제 브라우저(`320` / `390` / `768` / `1440` / `200%` 확대) 검증 및 스크린샷

상세 측정 데이터는 [`./verification-report.json`](./verification-report.json)에 수록되어 있습니다.

| 뷰포트 | Step 2 `role="group"` (`감상 강도`) | Step 3 `role="group"` (`회피 태그`) & 높이 | 템플릿 카테고리 `role="group"` & 높이 | 판형 프리셋 `role="group"` & 높이 | 가로 오버플로우 | Step 2 스크린샷 | Step 3 스크린샷 | 템플릿 필터 스크린샷 |
| --- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` (Mobile S) | PASS (`>= 80px`) | PASS (`44px`, 8/8) | PASS (`44px`, 7/7) | PASS (`44px`, 5/5) | `0px` | [taste-step2-320.png](./taste-step2-320.png) | [taste-step3-320.png](./taste-step3-320.png) | [studio-templates-320.png](./studio-templates-320.png) |
| `390×844` (Mobile M) | PASS (`>= 80px`) | PASS (`44px`, 8/8) | PASS (`44px`, 7/7) | PASS (`44px`, 5/5) | `0px` | [taste-step2-390.png](./taste-step2-390.png) | [taste-step3-390.png](./taste-step3-390.png) | [studio-templates-390.png](./studio-templates-390.png) |
| `768×1024` (Tablet) | PASS (`>= 80px`) | PASS (`44px`, 8/8) | PASS (`44px`, 7/7) | PASS (`44px`, 5/5) | `0px` | [taste-step2-768.png](./taste-step2-768.png) | [taste-step3-768.png](./taste-step3-768.png) | [studio-templates-768.png](./studio-templates-768.png) |
| `1440×900` (Desktop) | PASS (`>= 80px`) | PASS (`44px`, 8/8) | PASS (`44px`, 7/7) | PASS (`44px`, 5/5) | `0px` | [taste-step2-1440.png](./taste-step2-1440.png) | [taste-step3-1440.png](./taste-step3-1440.png) | [studio-templates-1440.png](./studio-templates-1440.png) |
| `720×450` (`200%` Zoom) | PASS (`>= 80px`) | PASS (`44px`, 8/8) | PASS (`44px`, 7/7) | PASS (`44px`, 5/5) | `0px` | [taste-step2-200pct.png](./taste-step2-200pct.png) | [taste-step3-200pct.png](./taste-step3-200pct.png) | [studio-templates-200pct.png](./studio-templates-200pct.png) |
