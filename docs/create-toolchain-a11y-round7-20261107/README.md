# GAP-R6-04 (CreateStartPage · StudioProductionToolchainPage) 44px 토글 타깃 · 명시적 포커스 링 · 선택 상태 보강 증거 (Round 7 — 2026-11-07)

## 1. 작업 범위 및 소유 경계 확인

- **Round 6 감사 근거 확인 (`0dbc750223`)**:
  - `GAP-R6-04`: `/create`([CreateStartPage.tsx](../../apps/web/src/domains/creator/CreateStartPage.tsx))의 시작 화면 구역 전환 토글(`[role='group'][aria-label*='시작 화면'] button`)과 `/studio/toolchain`([StudioProductionToolchainPage.tsx](../../apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx))의 파이프라인 트랙 토글(`button[data-testid^='toolchain-rea-track-']`)이 PC(`1440×900`)에서 `40px` 높이로 측정(`44px` 미달)되고, `focus-visible:outline-*` 강조 클래스가 누락(`hasExplicitFocusVisibleClass: false`)되어 있던 결함을 확인했습니다.
- **작업 브랜치**: `feat/create-toolchain-a11y-round7-20261107` (최신 `origin/main` `3698e5162d` 기반 분기)
- **소유 파일 (로컬 2개 페이지 + 전용 단위 테스트 + 상대링크 증거 문서만 수정)**:
  - [CreateStartPage.tsx](../../apps/web/src/domains/creator/CreateStartPage.tsx) (`648`줄)
  - [CreateStartPage.test.tsx](../../apps/web/src/domains/creator/export/CreateStartPage.test.tsx) (`296`줄)
  - [StudioProductionToolchainPage.tsx](../../apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx) (`603`줄)
  - [StudioProductionToolchainPage.test.tsx](../../apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.test.tsx) (`147`줄)
  - `docs/create-toolchain-a11y-round7-20261107/README.md` (본 문서)
- **비소유·금지 범위 무변경 검증**:
  - 실제 창작 생성·삭제·출판/결제 로직, 엔진(`studio-production-toolchain.ts`, `useStudioToonBridgeConnection.ts`), 공유 스토어(`studio-project-library-store.ts`), 공유 CSS, 라우트: **무변경 (0줄 diff)**
  - 다른 페이지(`HiringPositionsPage.tsx`, `StudioPromoPage.tsx` 등) 및 CI 소유 카탈로그 3파일(`TagsPage.tsx`, `catalog-status-i18n.ts`, `catalog-status-i18n-r3c08.test.ts`): **무변경 (0줄 diff)**

---

## 2. 최소 수정 내역 (`GAP-R6-04`)

### 2.1 `CreateStartPage` ([CreateStartPage.tsx](../../apps/web/src/domains/creator/CreateStartPage.tsx))
1. **시작 화면 구역 보기 전환 토글 44px 타깃·포커스 링·선택 상태·방향키 이동**:
   - 상단 구역 전환 그룹(`role="group"`, `aria-label="시작 화면 구역 보기 전환"`, `data-testid="create-start-section-group"`)에 `gap-2`(`style={{ gap: "8px" }}`)를 적용했습니다.
   - 4개 구역 전환 버튼(`추천 시작`, `다른 시작 방법`, `주제 · 제작 도구`, `이어서 작업`)의 `min-h-9`를 `min-h-11 min-w-11`(`style={{ minHeight: "44px", minWidth: "44px" }}`)로 상향하고, `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`, `scroll-my-24`, `data-testid="create-start-section-${id}"`, `data-state={active ? "active" : "inactive"}`, `aria-pressed={active}`, `break-words [overflow-wrap:anywhere]`를 적용했습니다.
   - `handleSectionToggleKeyDown`을 통해 그룹 내 `ArrowRight`/`ArrowDown`/`ArrowLeft`/`ArrowUp`/`Home`/`End` 키보드 포커스 순환 이동을 지원하고, `selectSection` 호출 시 로컬 상태와 URL 쿼리(`?section=...`)가 즉시 동기화되도록 보강했습니다.
2. **페이지 내 보조 링크·요약 토글(`<summary>`) 44px 및 명시적 포커스 링 정돈**:
   - 상황별 추천 시작 카드, `<details><summary>`, 스마트 AI 창작 보조 허브 링크, 이야기 주제 알약 링크, 이어서 작업하기/갤러리 링크에 `min-h-11`(`style={{ minHeight: "44px" }}`), `scroll-my-24`, `focus-visible:outline`을 일관되게 적용했습니다.

### 2.2 `StudioProductionToolchainPage` ([StudioProductionToolchainPage.tsx](../../apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx))
1. **로컬 실행기 파이프라인 트랙 토글 44px 타깃·포커스 링·선택 상태·방향키 이동**:
   - 파이프라인 트랙 그룹(`role="group"`, `aria-label="로컬 실행기 파이프라인 트랙"`, `data-testid="toolchain-rea-track-group"`)에 `gap-2`(`style={{ gap: "8px" }}`)를 적용했습니다.
   - 4개 트랙 토글 버튼(`toolchain-rea-track-flamenco-render-queue`, `comfy-deterministic-seed`, `natron-opentoonz-comp`, `scribus-cmyk-preflight`)에 `min-h-11 min-w-11`(`style={{ minHeight: "44px", minWidth: "44px" }}`), `px-3.5 py-2`, `focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent`, `scroll-my-24`, `data-state={bridgeTrack === id ? "active" : "inactive"}`, `aria-pressed={bridgeTrack === id}`, `break-words [overflow-wrap:anywhere]`를 적용했습니다.
   - `handleToggleGroupKeyDown`을 연결해 `ArrowRight`/`ArrowDown`/`ArrowLeft`/`ArrowUp`/`Home`/`End` 키보드 포커스 순환 이동을 지원했습니다.
2. **설치·라이선스 상태(`StudioEngineCenterPage`) 필터 칩 및 검색창 정돈**:
   - `FilterChip`(`상태로 거르기` 그룹, `data-testid="toolchain-engine-status-group"`)과 도구 검색 입력창, 필터 초기화 버튼, 외부 라이선스 링크에도 `min-h-11`(`style={{ minHeight: "44px" }}`), `focus-visible:outline`, `data-state`, 방향키 이동(`handleToggleGroupKeyDown`)을 일관되게 적용했습니다.

---

## 3. 실제 브라우저(Chromium) 멀티 뷰포트 및 200% 확대 검증 결과

Playwright Chromium(`/usr/bin/chromium`)으로 `/create`와 `/studio/toolchain`을 `320×640`, `390×844`, `768×1024`, `1440×900`, `1440×900 (200% 확대)` 5개 뷰포트에서 실제 렌더링하여 측정한 결과입니다.

### 3.1 `/create` (`CreateStartPage`)
| 뷰포트 | 가로 오버플로 | 초장문 한국어 라벨 주입 후 오버플로 | 그룹 역할 / 간격 | 최소 토글 크기 (`height × width`) | `focus-visible:` 클래스 | 방향키(`ArrowRight`) 이동 및 선택 상태 (`aria-pressed` / `data-state` / URL) | 콘솔/페이지 오류 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 74px` (`>= 44px` PASS) | `true` | `create-start-section-lanes` (`true` / `active` / `?section=lanes`) | `0` |
| `390×844` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 74px` (`>= 44px` PASS) | `true` | `create-start-section-lanes` (`true` / `active` / `?section=lanes`) | `0` |
| `768×1024` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 74px` (`>= 44px` PASS) | `true` | `create-start-section-lanes` (`true` / `active` / `?section=lanes`) | `0` |
| `1440×900` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 74px` (`>= 44px` PASS) | `true` | `create-start-section-lanes` (`true` / `active` / `?section=lanes`) | `0` |
| `1440×900 (200% 확대)` | `0px` | `0px` | `group` / `8px / 8px` | `88px × 149px` (`>= 44px` PASS) | `true` | `create-start-section-lanes` (`true` / `active` / `?section=lanes`) | `0` |

### 3.2 `/studio/toolchain` (`StudioProductionToolchainPage`)
| 뷰포트 | 가로 오버플로 | 초장문 한국어 라벨 주입 후 오버플로 | 그룹 역할 / 간격 | 최소 트랙 토글 크기 (`height × width`) | `focus-visible:` 클래스 | 방향키(`ArrowRight`) 이동 및 선택 상태 (`aria-pressed` / `data-state` / 영수증 상태) | 콘솔/페이지 오류 |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `320×640` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 189px` (`>= 44px` PASS) | `true` | `toolchain-rea-track-comfy-deterministic-seed` (`true` / `active` / `ComfyUI`) | `0` |
| `390×844` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 189px` (`>= 44px` PASS) | `true` | `toolchain-rea-track-comfy-deterministic-seed` (`true` / `active` / `ComfyUI`) | `0` |
| `768×1024` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 189px` (`>= 44px` PASS) | `true` | `toolchain-rea-track-comfy-deterministic-seed` (`true` / `active` / `ComfyUI`) | `0` |
| `1440×900` | `0px` | `0px` | `group` / `8px / 8px` | `44px × 189px` (`>= 44px` PASS) | `true` | `toolchain-rea-track-comfy-deterministic-seed` (`true` / `active` / `ComfyUI`) | `0` |
| `1440×900 (200% 확대)` | `0px` | `0px` | `group` / `8px / 8px` | `88px × 378px` (`>= 44px` PASS) | `true` | `toolchain-rea-track-comfy-deterministic-seed` (`true` / `active` / `ComfyUI`) | `0` |

---

## 4. 테스트·타입·린트·소스 크기·문서 검증 결과

1. **직접 단위 테스트 및 기존 회귀 테스트 (`vitest`)**:
   - 실행 명령:
     ```bash
     npx vitest run \
       src/domains/creator/export/CreateStartPage.test.tsx \
       src/domains/creator/toolchain/StudioProductionToolchainPage.test.tsx \
       src/domains/creator/toolchain/studio-production-toolchain.test.ts
     ```
   - 결과: **3개 테스트 파일, 26개 테스트 전수 PASS** (`CreateStartPage.test.tsx` 16개, `StudioProductionToolchainPage.test.tsx` 6개, `studio-production-toolchain.test.ts` 4개)
2. **루트 `tsconfig.json` 계약 범위 분할 타입체크**:
   - `packages/core/src/index.ts`, `packages/core/src/types.ts` 및 소유 파일 4개 대상 `tsc --noEmit`: **0 errors PASS**
   - *(전체 저장소 단일 `pnpm typecheck`는 8GB 컨테이너 메모리 한계를 초과하므로 전체 타입체크 통과로 과장하지 않고 루트 `tsconfig.json` 계약 포함 분할 타입검사로 정확히 보고합니다.)*
3. **변경 파일 린트 (`node scripts/lint-changed.mjs`)**:
   - 변경 파일 4개 검사: **0 errors, 0 warnings PASS**
4. **소스 파일 800줄 상한 (`node scripts/check-source-file-size.mjs`)**:
   - [CreateStartPage.tsx](../../apps/web/src/domains/creator/CreateStartPage.tsx): **648줄** (`<= 800줄` PASS)
   - [CreateStartPage.test.tsx](../../apps/web/src/domains/creator/export/CreateStartPage.test.tsx): **296줄** (`<= 800줄` PASS)
   - [StudioProductionToolchainPage.tsx](../../apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.tsx): **603줄** (`<= 800줄` PASS)
   - [StudioProductionToolchainPage.test.tsx](../../apps/web/src/domains/creator/toolchain/StudioProductionToolchainPage.test.tsx): **147줄** (`<= 800줄` PASS)
5. **아키텍처 경계 검증 (`node scripts/validate-app-boundaries.mjs`)**:
   - 모든 경계 규칙 `0/0` 위반 없음 (**PASS**)
