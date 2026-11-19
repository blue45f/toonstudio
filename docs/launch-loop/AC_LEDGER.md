# ToonStudio 상용 출시 수용 기준 원장 (AC_LEDGER)

- 작성일: `2026-11-19`
- 상태 규약: `TODO` | `IN_PROGRESS` | `REJECTED` | `VERIFIED`
- 종료 규칙: 아래 표의 **모든 항목(`AC-001` ~ `AC-024`)이 `VERIFIED`**이고 최종 `pnpm verify:push`가 통과할 때만 루프를 종료한다.
- 불변 금지: 테스트 `.skip`/완화, `TODO`/`() => {}` 스텁, `any` 회피, 무단 운영 배포(`deploy:web`, `onpod`) 실행 금지.

## 수용 기준 요약 표 (Machine-Readable Ledger)

| AC-ID | Wave | Priority | Status | 제목 | 필수 검증 명령 |
| --- | --- | --- | --- | --- | --- |
| AC-001 | Wave 1 | P0 | TODO | 320/390px 드로잉·협업 HUD 가림 재검증 및 마감 (`StudioBrushHud.tsx`, `StudioCanvasCollaborationDisclosure.tsx`) | `pnpm harness:verify && pnpm verify:studio-mobile-top` |
| AC-002 | Wave 1 | P0 | TODO | 1440px 소재 상세 Footer clip 해소 및 삽입→Undo→재열기 완주 | `pnpm harness:verify && pnpm verify:studio-asset-workspace` |
| AC-003 | Wave 1 | P0 | TODO | 320px 게시·출고 하단 탭 겹침 및 폼 라벨 axe 위반 0 해소 | `pnpm harness:verify && pnpm test:a11y:editor` |
| AC-004 | Wave 1 | P0 | IN_PROGRESS | 로컬 mock 세션 인증 스모크 E2E(`e2e/auth-local-smoke.spec.ts`) 작성 완료(로컬 Playwright 실행 검증 대기) | `pnpm harness:verify && pnpm verify:studio-launch` |
| AC-005 | Wave 1 | P0 | IN_PROGRESS | 모바일 제스처 Undo/Redo(`T1`) + 팜 리젝션(`T5`) 상태 머신(`studio-touch-gesture-guard.ts` + 테스트 구현 완료, 캔버스 포인터 연결·vitest 대기) | `pnpm harness:verify && pnpm test:studio-material-brush` |
| AC-006 | Wave 2 | P0 | IN_PROGRESS | AI 9상태 생성 큐(`studio-ai-job.ts`) 정본 모델 UI 연결(`StudioAiJobQueuePanel.tsx` + 테스트 작성 완료, 로컬 vitest·호스트 마운트 검증 대기) | `pnpm harness:verify && pnpm verify:studio-ai-quality` |
| AC-007 | Wave 2 | P0 | IN_PROGRESS | 저장 충돌 3선택 복구 UI(`StudioSaveConflictResolutionDialog.tsx` + 테스트 작성 완료, 기본 UI 내부 용어 잔존 점검·OPFS 검증 대기) | `pnpm verify:studio-autosave-opfs && pnpm verify:studio-autosave-two-tab` |
| AC-008 | Wave 2 | P0 | IN_PROGRESS | 원스톱 출고 프리플라이트(`studio-commercial-preflight-gate.ts` + 테스트 구현 완료, 375px 가독성·스마트 컷 슬라이싱·Rights BOM NC/GPL 차단 UI 연결·vitest 대기) | `pnpm verify:studio-manuscript-delivery-acceptance && pnpm test:creator-bundle-rights` |
| AC-009 | Wave 2 | P0 | TODO | 실시간 협업 장시간 안정성 및 로컬 스코프 `Y.UndoManager` 무결성 검증 | `pnpm test:collab-stability && pnpm verify:collab-stability` |
| AC-010 | Wave 3 | P1 | IN_PROGRESS | F01: `rank-row.tsx` "Why This Rank" 중첩 카드 제거·스펙트럼 바 적용 완료(로컬 vitest·브라우저 검증 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-011 | Wave 3 | P1 | TODO | F02: `TasteOnboardingPage.tsx` 첫 진입 온보딩 연결 및 `recommend.ts` 실시간 추천 전환 E2E 완성 | `pnpm harness:verify && pnpm test:fast` |
| AC-012 | Wave 3 | P1 | IN_PROGRESS | F03: 스냅샷 Diff 무료전환·가격변동 타임라인(`pricing-transition-timeline.ts` + UI + 테스트 작성 완료, 작품 상세 마운트·vitest 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-013 | Wave 3 | P1 | TODO | F04: 5종 읽기 상태(`hiatus` 포함) + 공개 컬렉션 공유 URL | `pnpm harness:verify && pnpm test:fast` |
| AC-014 | Wave 3 | P1 | IN_PROGRESS | F05: `adaptation-graph.tsx` 노블코믹스 버전별 평점·완결 비교 매트릭스 구현 완료(로컬 vitest·브라우저 검증 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-015 | Wave 3 | P1 | IN_PROGRESS | F06: `review-trust-engine.ts` + `review-trust-card.tsx` 구현 완료(작품 상세 마운트·키워드 파인더·vitest 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-016 | Wave 3 | P1 | IN_PROGRESS | F07: `T3` 압력 베지어·`T6` ColorDrop·`T9` 레이어 트리오 제스처(`studio-layer-trio-gestures.ts`) + 테스트 전수 구현 완료(호스트 연결·vitest 대기) | `pnpm test:studio-material-brush && pnpm verify:studio-brushes` |
| AC-017 | Wave 3 | P1 | IN_PROGRESS | F08: `studio-bg3d-live-ink-bake-bridge.ts` 원클릭 3D→2D 비파괴 컷 굽기·Split-Wipe·Rights BOM 승계 + 테스트 구현 완료(WebGPU 순차 검증 대기) | `pnpm verify:studio-3d-professional-completion && pnpm verify:studio-3d-web-authoring` |
| AC-018 | Wave 3 | P1 | IN_PROGRESS | F10: `title-to-three-cut-remix-bridge.ts` 탐색→3컷 리믹스 브리지 구현 완료(상세 UI CTA 연결·타임랩스 WebM 검증 대기) | `pnpm harness:verify && pnpm verify:studio-artist-journey` |
| AC-019 | Wave 4 | P2 | TODO | UI v2 에디터 크롬 정합(44px 상단바·18→7 메뉴·82%+ 캔버스·모바일 88%+ Thumb-Arc) | `pnpm verify:studio-menus && pnpm verify:studio-canvas-chrome` |
| AC-020 | Wave 4 | P2 | IN_PROGRESS | 표면 통합 거버넌스(`unified-surface-governance.ts` + 테스트 구현 완료: 28개 리서치 핀보드 투영·프로젝트 6→8탭·Admin 4그룹, 라우터 연결·vitest 대기) | `pnpm validate:architecture && pnpm verify:studio-wiring-reachability` |
| AC-021 | Wave 4 | P2 | TODO | 전 화면 디자인 토큰·중첩카드 0·스켈레톤 100%·축소모션·고대비 강제색상 감사 통과 | `pnpm audit:sitewide-visual-ux:all && pnpm audit:sitewide-visual-ux:forced-colors` |
| AC-022 | Wave 4 | P2 | TODO | 미연결 코드(Dead/Unconnected) 0 및 앱 경계(`web`/`admin-web`/`api`) 위반 0 | `pnpm validate:architecture && pnpm check:unconnected-code:gate` |
| AC-023 | Wave 5 | P0 | TODO | 앱 내 전수 기능 스윕 + 접근성(axe) + 3D/2D 브라우저 E2E 순차 통과 | `pnpm verify:studio-inapp-feature-sweep && pnpm test:a11y && pnpm test:a11y:editor` |
| AC-024 | Wave 5 | P0 | TODO | 최종 상용 출시 게이트(`pnpm verify:push`) 전수 통과 및 릴리스 리포트 확정 | `pnpm verify:push && pnpm harness:check` |

---

## 슬라이스별 필수 통과 계약 (모든 AC 공통)

1. **5대 UI 상태 완비**: `Loading`(Zero-CLS 스켈레톤 + 중복 제출 잠금), `Empty`(다음 행동 런처 CTA), `Error`(입력 보존 + 한국어 복구 안내 + 재시도), `Boundary`(0/null/대용량/한글 IME `isComposing`/320px·390px·1440px), `Success`(낙관적/동기화 갱신).
2. **영속성 왕복**: 생성/편집 -> 새로고침(또는 탭 재열기) -> 데이터·선택·Undo 스택 무손실 확인.
3. **실브라우저 적대적 QA**: `console.error` 0건, `pageerror` 0건, 예상치 못한 `4xx/5xx` 0건, 터치 타겟 `<44×44px` 0건, 텍스트 잘림·패널 겹침 0건.
4. **원자적 커밋**: 통과 직후 `<type>(<scope>): <한글 요약>` 형식의 로컬 체크포인트 커밋 생성 후 상태를 `VERIFIED`로 갱신.

## 거부(REJECTED) 및 수정 이력 로그

- (아직 실행 전 — 각 사이클에서 적대적 QA가 결함을 발견하면 `AC-ID | 발견 일시 | file:line 원인 | 수정 커밋` 형식으로 누적 기록한다.)
