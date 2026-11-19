# ToonStudio 장시간 자율 루프 누적 메모리 (MEMORY)

- 초기화 일시: `2026-11-19`
- 목적: Fresh-Context로 재시작되는 매 사이클의 에이전트가 이전 사이클에서 발견한 근본 원인, 환경 함정, 성능 측정치, 검증 통과 이력을 즉시 이어받기 위한 디스크 메모리.

## 기준선 환경 사실 (`2026-11-19`)

- **현재 브랜치**: `feat/studio-assistant-router-workflow-packs-20261119` (기준 HEAD: `9fb467d90`)
- **패키지 매니저 / 런타임**: `pnpm@11.4.0`, `node >= 24.16.0`
- **핵심 설치 엔진**: `canvaskit-wasm`, `@sqlite.org/sqlite-wasm`, `yjs`, `@babylonjs/core`, `three`, `@pixiv/three-vrm`, `openskp`, `manifold-3d`, `ag-psd`, `es-hangul`, `harfbuzzjs`, `spectral.js`, `motion`, `@radix-ui/*`
- **알려진 로컬 환경 함정**:
  - worktree에서 E2E 기동 시 `apps/web/config/` sparse-checkout 누락 및 inotify 와처 한도(`ENOSPC`) 주의 (`UX_FLOW_BACKLOG.md` P2).
  - WebGPU/3D 브라우저 테스트(`verify:studio-3d-*`, `verify:studio-bg3d-*`)는 병렬 실행 시 GPU 컨텍스트 충돌이 발생하므로 반드시 순차 실행.
  - `AGENTS.md` §8에 따라 `deploy:web`, `onpod`, `cloudflare:static:deploy` 등 운영 배포 스크립트는 무인 루프에서 실행 금지.

## 사이클별 누적 학습 로그

- `[2026-11-19 Wave 0]` `GAP_AUDIT.md`, `AC_LEDGER.md`(24개 AC), `PLAN.md`, `MEMORY.md`, `CYCLE_PROMPT.md`, `scripts/launch-loop-runner.sh` 구축 및 드라이런 검증 완료.
- `[2026-11-19 Wave 0.5 소스 실사]` `AGENTS.md` §1(source/tests 우선) 기준으로 실제 구현 파일 대조 완료:
  - **이미 구현되어 중복 작성 금지 · 실브라우저 재검증/연결 보강 대상**:
    - `AC-001`: `apps/web/src/domains/creator/brush/StudioBrushHud.tsx:209`, `apps/web/src/domains/creator/canvas/StudioCanvasCollaborationDisclosure.tsx`, `studio-mobile-immersive.test.ts:208` 존재 → 프로덕션 번들 320/390px 실브라우저 재검증 및 잔여 엣지케이스 마감 집중.
    - `AC-011`: `apps/web/src/domains/engagement/TasteOnboardingPage.tsx` (26KB), `taste-spectrum-bar.tsx` 존재 → 첫 진입 온보딩 연결 및 추천 피드 전환 E2E 마감 집중.
    - `AC-016`: `drawing/quick-shape.ts`, `StudioQuickShapeGuide.tsx`, `StudioDrawingQuickErgonomicsBar.tsx`, `StudioQuickAccessPalette.tsx` 존재 → 중복 재구현 금지, 미연결 `T3` 압력 커브·`T6` ColorDrop·`T9` 레이어 제스처 및 터치 E2E 마감 집중.
    - `AC-018`: `drawing/studio-timelapse.ts`, `StudioTimelapsePanel.tsx`, `timelapse-share/StudioTimelapseShareDialog.tsx` 존재 → WebM 내보내기 마감 및 `/title/:slug` → 3컷 리믹스 브리지 연결 집중.
  - **신규 구현 집중 대상**:
    - `AC-010`: `apps/web/src/shared/components/ranking-method.tsx`는 축별 일반 산식 설명만 제공 → `ranking-board.tsx` 개별 작품 행에서 클릭 시 해당 작품의 `rawScore` 기여도를 스펙트럼 바로 분해하는 인터랙션 구현 집중.
  - **실행 환경 참고**: 대화 샌드박스 셸(`PATH=/usr/bin:/bin:/usr/sbin:/sbin`)에는 `node`/`pnpm`/에이전트 CLI가 격리되어 있으므로, 실제 20시간 무인 실행은 사용자 Mac 터미널에서 `./scripts/launch-loop-runner.sh`로 기동한다.
