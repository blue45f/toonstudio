# SitemapPage 접근성·탐색성 개선 검증 보고서 (`GAP-R6-05` · Round 7 · 2026-11-07)

- **작성일**: `2026-11-07`
- **상태**: `current` (검증 완료 후보 · 브랜치 `feat/sitemap-ux-round7-20261107`)
- **대상 결함**: `GAP-R6-05` ([`docs/a11y-uncovered-round6-20261107/README.md`](../a11y-uncovered-round6-20261107/README.md) §3.5 — `SitemapPage` 내 `min-h-7`(28px) 허브 칩 링크 37개 및 `min-h-9`(36px) 홍보관 CTA 링크 1개의 44px 터치 타깃 미달과 첫 화면 링크 과밀)
- **소유 및 변경 파일 범위 (3개 파일만 변경)**:
  - [`apps/web/src/domains/legal/SitemapPage.tsx`](../../apps/web/src/domains/legal/SitemapPage.tsx) (`564 lines` ≤ `800 lines`)
  - [`apps/web/src/domains/legal/SitemapPage.test.ts`](../../apps/web/src/domains/legal/SitemapPage.test.ts) (`305 lines` ≤ `800 lines`)
  - [`docs/sitemap-ux-round7-20261107/README.md`](./README.md)
- **비간섭 보호 범위**:
  - 공용 내비게이션([`site-navigation.ts`](../../apps/web/src/shared/components/site-navigation.ts), [`site-contextual-subnav.tsx`](../../apps/web/src/shared/components/site-contextual-subnav.tsx)), 라우트 그룹, `App.tsx`, 공유 스토어/스키마, 전역 CSS, 기존 Mac 담당 이관 대상인 Home Round 4(`457a6e7bdc289ae088be283a62844545f8e07444`) 및 Pricing Round 5(`0c34247d42f19a8204f2a1fa96c7b51b86d58cb8`) 관련 파일은 일절 수정하지 않았다.

---

## 1. 문제 재현 및 원인 분석 (`GAP-R6-05`)

1. **터치 타깃 44px 미달 (`28px` / `36px`)**:
   - [`apps/web/src/domains/legal/SitemapPage.tsx`](../../apps/web/src/domains/legal/SitemapPage.tsx)의 `[data-testid="sitemap-rea-hub-architecture"]` 영역에서 6대 맥락 허브(`CONTEXTUAL_SUBNAV_GROUPS`) 안의 칩 링크 37개가 `min-h-7 px-2.5 py-0.5 text-[11px]`로 선언되어 실측 높이가 **`28px`**였고, 우상단 영상 홍보관 CTA 링크(`href="/promo-library"`)가 `size="sm" min-h-9`로 선언되어 실측 높이가 **`36px`**였다.
2. **첫 화면 링크 밀도 과다**:
   - 검색창(`#sitemap-directory`) 위에 위치한 `[data-testid="sitemap-rea-hub-architecture"]` 섹션이 홍보관 CTA(1개) + 6대 허브 칩(37개) + 6단계 창작-홍보 파이프라인 카드(6개) 총 **44개 링크를 항상 펼친 상태**로 렌더링하고 있었다.
   - 단순히 44개 링크의 높이를 `44px` 이상으로 키우기만 하면 첫 화면 세로 길이와 시각적 링크 밀도가 과도하게 증가해 핵심 디렉터리 검색(`#sitemap-directory`) 진입을 방해한다.
3. **좁은 폭(`320px`) 및 `200%` 확대·긴 한영 제목 대응**:
   - 상단 규모 요약(`<dl className="grid grid-cols-3 gap-3">`)이 `320px` 뷰포트에서 열당 폭 약 `77px`로 좁아져 한글 라벨 줄바꿈이 빡빡해졌고, 전체 디렉터리(`SITEMAP_EXTENDED_DESTINATION_GROUPS`)의 항목 제목이 `truncate`로 한 줄 말줄임 처리되어 긴 한영 제목 전체를 읽기 어려웠다.

---

## 2. 최소 응집 수정 내역

1. **모바일·데스크톱 전 구간 `≥ 44×44px` 터치 타깃 보장 (`min-h-11 min-w-11`)**:
   - 홍보관 CTA 링크(`[data-testid="sitemap-promo-hub-cta"]`, `href="/promo-library"`)를 `size: "md"`, `h-auto min-h-11 min-w-11 px-4 py-2.5`로 상향(`36px` → **`44px`**).
   - 6대 맥락 허브의 모든 칩 링크(`[data-testid^="sitemap-hub-chip-"]`, 37개)를 `min-h-11 min-w-11 rounded-xl px-3.5 py-2 text-xs`로 상향(`28px` → **`44px`**).
   - 6단계 창작-홍보 파이프라인 단계 링크(`[data-testid^="sitemap-pipeline-step-"]`, 6개)에 `min-h-11 min-w-11 p-3`를 적용(실측 최소 높이 **`90px`** 이상).
   - `SitemapPage.tsx` 내 `min-h-7`, `min-h-9` 클래스를 전수 제거(`0건`).
2. **첫 화면 링크 밀도 절제 — 그룹 접기(`<details>` / `<summary>`)와 명확한 제목**:
   - 6대 맥락 허브(`CONTEXTUAL_SUBNAV_GROUPS`) 각각을 `<details open={hubIndex === 0} data-testid="sitemap-hub-group-${hub.id}">`로 구조화해 첫 화면에서는 대표 1번 허브(`01 · Promo Video & Cuts Hub`, 7개 링크)만 기본 펼침 상태로 두고, 나머지 5개 허브(`02`~`06`)는 번호·영문 아이브로·한영 제목·항목 수 배지(`{hub.items.length}`)·열림 표식(`＋`)을 갖춘 `min-h-11` `<summary>`로 접어 두었다.
   - 6단계 창작-홍보 파이프라인(`CREATOR_STUDIO_PIPELINE_STEPS`)도 `<details data-testid="sitemap-pipeline-group">`으로 묶어 명확한 제목(`CREATOR WORKFLOW · 6 STEPS` / `6단계 창작-홍보 파이프라인`)과 단계 수 배지(`6`)를 제공했다.
   - 이로써 모든 목적지 `href`(44개)를 DOM에 그대로 유지하면서도 초기 화면에 노출되는 허브 영역 링크 수를 **44개 → 8개(-81.8%)**로 줄였다.
3. **긴 한영 제목 줄바꿈(`0px` 오버플로)·키보드 포커스·모션 축소**:
   - 디렉터리 규모 요약 `<dl>`을 `grid-cols-1 gap-3 min-[420px]:grid-cols-3`으로 반응형 전환하고, 모든 제목·라벨·확장 디렉터리 항목에 `min-w-0`와 `break-words`를 적용해 긴 한영 제목에서도 가로 오버플로(`0px`)와 말줄임 잘림 없이 읽히도록 개선했다.
   - 모든 `<summary>`와 `<Link>`에 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent focus-visible:ring-2`를 명시하고, 회전·이동 아이콘에 `motion-reduce:transition-none`을 추가했다.

---

## 3. 전후 정량 비교 및 실브라우저(`Chromium`) 실측 증거

| 지표 | 수정 전 (`Round 6` 감사) | 수정 후 (`Round 7` 실측) | 판정 |
| --- | --- | --- | --- |
| 홍보관 CTA 링크 높이 (`[data-testid="sitemap-promo-hub-cta"]`) | `36px` (`min-h-9`) | **`44px`** (`200%` 확대 시 `88px`) | PASS (`≥ 44px`) |
| 맥락 허브 칩 링크 최소 높이 (`[data-testid^="sitemap-hub-chip-"]`, 37개) | `28px` (`min-h-7`) | **`44px`** (`200%` 확대 시 `88px`) | PASS (`≥ 44px`) |
| 6단계 파이프라인 카드 최소 높이 (`[data-testid^="sitemap-pipeline-step-"]`, 6개) | `74px` | **`90px ~ 801px`** | PASS (`≥ 44px`) |
| `SitemapPage` 내 `min-h-7` / `min-h-9` 잔존 수 | `37건` / `1건` | **`0건` / `0건`** | PASS |
| `SitemapPage` 컨테이너 내 44px 미만 링크·`<summary>` 수 (전수 326개 펼침 기준) | `38건` | **`0건`** (`326/326` 통과) | PASS |
| 허브 섹션 첫 화면 초기 가시 링크 수 (DOM 전체 목적지 44개 보존) | `44개` (전체 상시 노출) | **`8개`** (대표 허브 1개만 초기 펼침, 나머지 `<details>` 접기) | PASS (`-81.8%` 밀도 완화) |
| 가로 오버플로 (`320` / `390` / `768` / `1440` / `200%` 확대, 한·영 + 장문 합성 제목) | `0px` | **`0px`** (전 구간 `0px`) | PASS |
| 키보드 `<summary>` 토글 (`Enter`) 및 검색 0건 초기화 복구 | 수동 확인 필요 | 허브·파이프라인 `<details>` `Enter` 펼침 동작, 검색 0건 초기화 후 `""` 복구 확인 | PASS |
| `@axe-core/playwright` (`main` 영역) 접근성 위반 수 | `0건` | **`0건`** | PASS |

### 뷰포트 × 로케일 매트릭스 실측 (`Chromium`, 초기 상태 및 전체 펼침 + 합성 장문 제목 주입)

| 로케일 | 뷰포트 | 초기 가시 허브 링크 (`DOM` 총계) | 홍보관 CTA (`W×H`) | 허브 칩 최소 높이 | 파이프라인 최소 높이 | 기본 가로 오버플로 | 장문 제목 전체 펼침 오버플로 | 44px 미달 타깃 (`326`개 중) |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `ko` | `320×844` | `8` (`44`) | `132×44px` | `44px` | `108px` | `0px` | `0px` | `0` |
| `ko` | `390×844` | `8` (`44`) | `132×44px` | `44px` | `90px` | `0px` | `0px` | `0` |
| `ko` | `768×1024` | `8` (`44`) | `132×44px` | `44px` | `97px` | `0px` | `0px` | `0` |
| `ko` | `1440×900` | `8` (`44`) | `132×44px` | `44px` | `161px` | `0px` | `0px` | `0` |
| `ko` | `1440×900 @ 200%` | `8` (`44`) | `264×88px` | `88px` | `577px` | `0px` | `0px` | `0` |
| `en` | `320×844` | `8` (`44`) | `132×44px` | `44px` | `108px` | `0px` | `0px` | `0` |
| `en` | `390×844` | `8` (`44`) | `132×44px` | `44px` | `90px` | `0px` | `0px` | `0` |
| `en` | `768×1024` | `8` (`44`) | `132×44px` | `44px` | `97px` | `0px` | `0px` | `0` |
| `en` | `1440×900` | `8` (`44`) | `132×44px` | `44px` | `193px` | `0px` | `0px` | `0` |
| `en` | `1440×900 @ 200%` | `8` (`44`) | `264×88px` | `88px` | `801px` | `0px` | `0px` | `0` |

---

## 4. 정적·단위·아키텍처 게이트 검증 명령 및 결과

1. **단위 및 디렉터리·라우터 계약 테스트 (`Vitest`)**:
   ```bash
   pnpm exec vitest run \
     apps/web/src/domains/legal/SitemapPage.test.ts \
     apps/web/src/domains/legal/SiteDirectorySearch.test.tsx \
     apps/web/src/domains/legal/site-directory-search.test.ts \
     apps/web/src/shared/navigation/webtoon-platform-router-ux-model.test.tsx
   ```
   - 결과: **4 test files passed, 34 tests passed (`0 failed`)**.
2. **ESLint (`--max-warnings=0`) 및 TypeScript (`tsc --noEmit`)**:
   ```bash
   pnpm exec eslint --max-warnings=0 \
     apps/web/src/domains/legal/SitemapPage.tsx \
     apps/web/src/domains/legal/SitemapPage.test.ts
   ```
   - ESLint 결과: **`0 errors, 0 warnings`**.
   - TypeScript (`tsc -p /tmp/tsconfig.sitemap-r7.json --noEmit` — `SitemapPage.tsx`, `SitemapPage.test.ts`, `vite.config.ts`, `vite-env.d.ts` 포함): **`0 errors` (`TSC_EXIT=0`)**.
3. **소스 파일 800줄 제한 및 아키텍처·문서·시크릿 게이트**:
   - [`apps/web/src/domains/legal/SitemapPage.tsx`](../../apps/web/src/domains/legal/SitemapPage.tsx): `564 lines` (`≤ 800`)
   - [`apps/web/src/domains/legal/SitemapPage.test.ts`](../../apps/web/src/domains/legal/SitemapPage.test.ts): `305 lines` (`≤ 800`)
   - `node scripts/check-source-file-size.mjs`: **PASS**
   - `node scripts/validate-architecture.mjs`: **PASS**
   - `node scripts/validate-documentation.mjs`: **PASS**
   - `node scripts/validate-source-layout.mjs`: **PASS**
   - `node scripts/validate-app-boundaries.mjs`: **PASS**
   - `pnpm exec secretlint "apps/web/src/domains/legal/SitemapPage.tsx" "apps/web/src/domains/legal/SitemapPage.test.ts" "docs/sitemap-ux-round7-20261107/README.md"`: **PASS**

