# GAP-R6-04 채용 조건 검색(`HiringPositionsPage`) · 홍보 영상 제작(`StudioPromoPage`) 접근성 수정 및 실브라우저 검증 보고서 (Round 8 · 2026-11-07)

## 1. 작업 범위 및 소유 경계

- **감사 근거**: [Round 6 미커버 접근성 감사 보고서](../a11y-uncovered-round6-20261107/README.md) (`GAP-R6-04`)
- **독립 수정 대상 파일 (엄격 소유)**:
  - [HiringPositionsPage.tsx](../../apps/web/src/domains/collaboration/hiring/HiringPositionsPage.tsx) (`237줄 ≤ 800줄`)
  - [HiringPositionsPage.test.tsx](../../apps/web/src/domains/collaboration/hiring/HiringPositionsPage.test.tsx) (`182줄 ≤ 800줄`)
  - [StudioPromoPage.tsx](../../apps/web/src/domains/creator/promo/StudioPromoPage.tsx) (`503줄 ≤ 800줄`)
  - [StudioPromoPage.test.tsx](../../apps/web/src/domains/creator/promo/StudioPromoPage.test.tsx) (`185줄 ≤ 800줄`)
- **검증 스크립트 및 증거 산출물**:
  - [verify-hiring-promo-round8.mjs](./verify-hiring-promo-round8.mjs)
  - [before-report.json](./before-report.json) (수정 전 베이스라인 실브라우저 측정치)
  - [verification-report.json](./verification-report.json) (수정 후 실브라우저 측정치)
- **비침범 원칙 준수**:
  - `CreateStartPage.tsx` 및 `StudioProductionToolchainPage.tsx`(별도 탐색 세션 소유)는 일절 수정하지 않았습니다.
  - `App.tsx`, 공유 스토어, 스키마, 라우트, 전역 CSS(`app.css`, `sitewide-visual-ux.css`, `promo-studio.css`), 결제·공고 작성·지원·발행 API 및 사용자 데이터는 일절 변경하지 않았으며, 합성(synthetic) fixture만 사용해 검증했습니다.

---

## 2. 재현된 실제 접근성 결함 (Before) 및 최소 수정 내용 (After)

### 2.1 `HiringPositionsPage.tsx` (`/collaborate/positions`)

1. **`40px` 높이 및 `43px` 너비 미달 칩/버튼 → `>= 44×44px` 보장**:
   - **원인**: `#main-content :where(button, ...):where(:not([data-own-control-size] *))` 전역 규칙(`pointer: fine`)이 `min-height: 2.5rem (40px)`을 강제해 `tablet-768`·`pc-1440`에서 직무 단가 프리셋(`button[data-testid^="hiring-rea-role-"]`), 회차 컷수(`button[data-testid^="hiring-rea-cuts-"]`), 조건 필터 버튼이 `40px` 높이로 축소되었고, `hiring-rea-cuts-70`은 `px-2 py-1`로 인해 전 해상도에서 너비가 `43px`에 머물렀습니다.
   - **수정**: 네이티브 `<header>`, `<section data-testid="hiring-rea-rate-escrow-bar">`, `<section aria-label="공개 모집 조건">`에 `data-own-control-size=""`를 선언하고, 직무 단가 및 컷수 프리셋·필터·페이지네이션 버튼에 `min-h-11 min-w-11 px-3.5 py-2`를 적용하여 전 해상도에서 최소 `44×44px`(실측 `80.7~258px × 44~50px`)을 보장했습니다.
2. **모바일 화면 밀도 최적화 (`320px` / `390px`)**:
   - 직무 단가 프리셋 4개는 모바일에서 깔끔한 단일 열(`grid-cols-1 gap-2 sm:flex sm:flex-wrap`), 회차 컷수 3개(`60컷`/`70컷`/`85컷`)는 한 줄 3열(`grid-cols-3 gap-2 sm:flex`)로 정렬하고 추가 검색 조건 3개는 기본 접힘(`aria-expanded="false"`) 상태를 유지해 첫 화면 복잡도를 높이지 않았습니다.
3. **그룹 의미론(`role="group"` + `aria-label`) 및 키보드 `focus-visible`·긴 한영 제목 줄바꿈**:
   - 조건 필터 조작 영역(`조건 더 고르기`/`조건 접기`, `검색 조건 초기화`)에 `role="group" aria-label="조건 필터 동작"`을 부여하고, 모든 인터랙티브 버튼/링크에 `focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent` 및 공고 제목 `<h2>`에 `[overflow-wrap:anywhere] break-words`를 적용했습니다.

### 2.2 `StudioPromoPage.tsx` (`/showcase/promo`)

1. **`40px` 훅 프리셋·편집 버튼 및 `24px` 배포 링크 → `>= 44×44px` 보장**:
   - **원인**: `.promo-studio` 루트에 `data-own-control-size=""`가 없어 `pc-1440`에서 `button[data-testid^="studio-promo-rea-hook-"]` 등 28개 버튼이 `40px` 높이로 줄어들었고, 하단 `완성 영상 배포 동선` 내 2개 `<Link>`가 텍스트 링크(`height: 24px`)로 렌더링되었습니다. 또한 모바일(`<= 540px`)에서 `.promo-button-row button { flex: 1 }`(`flex-basis: 0%`) 때문에 내보내기 보조 버튼 6개가 한 줄에 끼어 `48.3px × 213px` 세로 기둥 형태로 찌그러졌습니다.
   - **수정**: `.promo-studio` 루트에 `data-own-control-size=""`와 `[&_.promo-button-row_button]:!basis-auto`를 적용하고, 3초 바이럴 훅 아키타입 버튼(`button[data-testid^="studio-promo-rea-hook-"]`)에 `min-h-11 min-w-11 px-3.5 py-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`를 부여했으며, 하단 배포 동선 `<Link>` 2개에 `promo-link-button min-h-11 min-w-11`을 적용해 모든 조작 타깃이 `>= 44×44px`을 충족하도록 개선했습니다.
2. **`aria-prohibited-attr` 해소 및 버튼 행 그룹 이름(`role="group"` + `aria-label`) 보강**:
   - `완성 영상 배포 동선` `<div className="promo-button-row">`에 누락되어 있던 `role="group"`을 추가해 `aria-prohibited-attr` 위반(5개 뷰포트 전체)을 `0건`으로 해소했습니다.
   - `콘티 편집 및 실행 취소 동작`, `로컬 합성 BGM 생성`, `자막·타임코드·프로젝트 파일 저장`, `완성 영상 배포 동선` 버튼 그룹에 명시적 `role="group"`과 한·영 `aria-label`을 부여했습니다.

---

## 3. 전후 실브라우저 측정 비교 (`before-report.json` vs `verification-report.json`)

| 측정 지표 | 수정 전 ([before-report.json](./before-report.json)) | 수정 후 ([verification-report.json](./verification-report.json)) |
| --- | --- | --- |
| `/collaborate/positions` 44×44px 미달 타깃 합계 (5개 뷰포트) | `12건` (`hiring-rea-cuts-70` 43px 너비 + 1440px 40px 높이 9건) | **`0건`** |
| `/showcase/promo` 44×44px 미달 타깃 합계 (5개 뷰포트) | `36건` (`24px` 배포 링크 + 1440px 40px 높이 30건) | **`0건`** |
| `/showcase/promo` `aria-prohibited-attr` (`div[aria-label]` role 누락) | `5건` (뷰포트당 1건) | **`0건`** |
| 전 뷰포트 가로 오버플로 (`maxHorizontalOverflowPx`) | `0px` | **`0px`** |
| 직무·컷수·조건필터·훅·내보내기 그룹 이름(`role="group"` + `aria-label`) | `false` (`filterActionsGroupLabel: null`, Promo 그룹 누락) | **`true`** (전 그룹 명시) |
| 긴 한·영 혼합 제목 줄바꿈 및 클리핑 없음 | `true` | **`true`** |

---

## 4. 뷰포트 및 테마/모션 모드별 스크린샷 증거 (상대 경로)

### 4.1 `/collaborate/positions` (`HiringPositionsPage.tsx`)
- `320×844` (Mobile): [수정 전](./screenshots/before-hiring-mobile-320.png) · [수정 후](./screenshots/after-hiring-mobile-320.png)
- `390×844` (Mobile): [수정 전](./screenshots/before-hiring-mobile-390.png) · [수정 후](./screenshots/after-hiring-mobile-390.png)
- `768×1024` (Tablet): [수정 전](./screenshots/before-hiring-tablet-768.png) · [수정 후](./screenshots/after-hiring-tablet-768.png)
- `1440×900` (Desktop): [수정 전](./screenshots/before-hiring-pc-1440.png) · [수정 후](./screenshots/after-hiring-pc-1440.png)
- `1440×900 @ 200% Zoom`: [수정 전](./screenshots/before-hiring-pc-1440-zoom-200.png) · [수정 후](./screenshots/after-hiring-pc-1440-zoom-200.png)
- 시각·모션 모드 (`light` / `dark` / `contrast` / `reduced-motion`):
  - [Light 모드](./screenshots/after-hiring-mode-light.png) · [Dark 모드](./screenshots/after-hiring-mode-dark.png) · [Contrast 모드](./screenshots/after-hiring-mode-contrast.png) · [Reduced-Motion 모드](./screenshots/after-hiring-mode-reduced-motion.png)

### 4.2 `/showcase/promo` (`StudioPromoPage.tsx`)
- `320×844` (Mobile): [수정 전](./screenshots/before-promo-mobile-320.png) · [수정 후](./screenshots/after-promo-mobile-320.png)
- `390×844` (Mobile): [수정 전](./screenshots/before-promo-mobile-390.png) · [수정 후](./screenshots/after-promo-mobile-390.png)
- `768×1024` (Tablet): [수정 전](./screenshots/before-promo-tablet-768.png) · [수정 후](./screenshots/after-promo-tablet-768.png)
- `1440×900` (Desktop): [수정 전](./screenshots/before-promo-pc-1440.png) · [수정 후](./screenshots/after-promo-pc-1440.png)
- `1440×900 @ 200% Zoom`: [수정 전](./screenshots/before-promo-pc-1440-zoom-200.png) · [수정 후](./screenshots/after-promo-pc-1440-zoom-200.png)
- 시각·모션 모드 (`light` / `dark` / `contrast` / `reduced-motion`):
  - [Light 모드](./screenshots/after-promo-mode-light.png) · [Dark 모드](./screenshots/after-promo-mode-dark.png) · [Contrast 모드](./screenshots/after-promo-mode-contrast.png) · [Reduced-Motion 모드](./screenshots/after-promo-mode-reduced-motion.png)
