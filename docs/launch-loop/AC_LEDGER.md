# ToonStudio 상용 출시 수용 기준 원장 (AC_LEDGER)

- 작성일: `2026-11-19` (최종 코드 고도화 갱신: `2026-11-20`)
- 상태 규약: `TODO` | `IN_PROGRESS` | `REJECTED` | `VERIFIED`
- 종료 규칙: 아래 표의 **모든 항목(`AC-001` ~ `AC-024`)이 로컬/CI 런타임 검증을 거쳐 `VERIFIED`**이고 최종 `pnpm verify:push`가 통과할 때만 루프를 종료한다.
- 불변 금지: 테스트 `.skip`/완화, `TODO`/`() => {}` 스텁, `any` 회피, 무단 운영 배포(`deploy:web`, `onpod`) 실행 금지.

## 수용 기준 요약 표 (Machine-Readable Ledger)

| AC-ID | Wave | Priority | Status | 제목 | 필수 검증 명령 |
| --- | --- | --- | --- | --- | --- |
| AC-001 | Wave 1 | P0 | IN_PROGRESS | 320/390px 드로잉·협업 HUD 가림 해소 구현 완료 (`StudioBrushHud.tsx` 즉시 장애물 갱신·하단 회피 + `studio-canvas-collaboration-disclosure.css` `z-index: 52`, 브라우저 실행 검증 대기) | `pnpm harness:verify && pnpm verify:studio-mobile-top` |
| AC-002 | Wave 1 | P0 | IN_PROGRESS | 1440px 소재 상세 Footer clip 해소 구현 완료 (`studio-unified-asset-workspace.css` 64rem 상세 패널 `max-block-size: min(64dvh, 43rem); overflow-y: auto` 적용, 브라우저 실행 검증 대기) | `pnpm harness:verify && pnpm verify:studio-asset-workspace` |
| AC-003 | Wave 1 | P0 | IN_PROGRESS | 320px 게시·출고 하단 탭 31px 겹침 및 폼 라벨·44px 터치 보강 완료 (`studio-upload-layout.ts`, `StudioUploadPublish.tsx`, `StudioProjectDeliveryPanel.tsx`, axe 검증 대기) | `pnpm harness:verify && pnpm test:a11y:editor` |
| AC-004 | Wave 1 | P0 | IN_PROGRESS | 로컬 mock 세션 인증 스모크 E2E(`e2e/auth-local-smoke.spec.ts`) 작성 완료 (Playwright 실행 검증 대기) | `pnpm harness:verify && pnpm verify:studio-launch` |
| AC-005 | Wave 1 | P0 | IN_PROGRESS | 모바일 제스처 Undo/Redo(`T1`) + 팜 리젝션(`T5`) 상태 머신(`studio-touch-gesture-guard.ts` -> `studio-touch-gesture-policy.ts` 실전 연결 완료, vitest 대기) | `pnpm harness:verify && pnpm test:studio-material-brush` |
| AC-006 | Wave 2 | P0 | IN_PROGRESS | AI 9상태 생성 큐(`AiCreativeDirectorPanel.tsx`에 `StudioAiJobQueuePanel` 실전 상태 전이 연결 완료, vitest·E2E 검증 대기) | `pnpm harness:verify && pnpm verify:studio-ai-quality` |
| AC-007 | Wave 2 | P0 | IN_PROGRESS | 저장 충돌 3선택 복구 UI(`StudioSaveSyncStatusCenter.tsx`에 `StudioSaveConflictResolutionDialog` 실전 연결 완료, OPFS 검증 대기) | `pnpm verify:studio-autosave-opfs && pnpm verify:studio-autosave-two-tab` |
| AC-008 | Wave 2 | P0 | IN_PROGRESS | 원스톱 출고 프리플라이트 + 4계층 PSD(`StudioExportPanel.tsx`에 스마트 컷 분할·`runCommercialPreflightGate`·`buildWebtoonPsdExportManifest` 실전 연결 완료, vitest 대기) | `pnpm verify:studio-manuscript-delivery-acceptance && pnpm test:creator-bundle-rights` |
| AC-009 | Wave 2 | P0 | IN_PROGRESS | 실시간 협업 로컬 스코프 Undo 가드(`studio-crdt-local-undo-scope-guard.ts` -> `stroke-merge-undo.ts` 실전 연결 완료, 장시간 안정성 게이트 대기) | `pnpm test:collab-stability && pnpm verify:collab-stability` |
| AC-010 | Wave 3 | P1 | IN_PROGRESS | F01: `rank-row.tsx` "Why This Rank" 중첩 카드 제거·스펙트럼 기여도 바 적용 완료 (vitest·브라우저 검증 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-011 | Wave 3 | P1 | IN_PROGRESS | F02: `DiscoverHubPage.tsx`에 5문항 취향 테스트 콜드스타트 배너(`/onboarding/taste`) 실전 마운트 완료 (vitest·E2E 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-012 | Wave 3 | P1 | IN_PROGRESS | F03: `TitleDetailPage.tsx`에 `PriceTransitionTimeline` 실전 마운트 및 Zustand 구독 알림 토글 연결 완료 (vitest·브라우저 검증 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-013 | Wave 3 | P1 | IN_PROGRESS | F04: 5종 읽기 상태(`ReadStateSelector`) + `PublicCollectionPage.tsx` 공개 공유 링크 복사·OG 메타 실전 연결 완료 (vitest 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-014 | Wave 3 | P1 | IN_PROGRESS | F05: `adaptation-graph.tsx` 노블코믹스 버전별 평점·완결 비교 매트릭스(`TitleDetailPage` 라이브 연결) 구현 완료 (vitest 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-015 | Wave 3 | P1 | IN_PROGRESS | F06: `TitleDetailPage.tsx` 리뷰 섹션에 `ReviewTrustCard` 실전 마운트 및 베이즈 신뢰 보정 연결 완료 (vitest·브라우저 검증 대기) | `pnpm harness:verify && pnpm test:fast` |
| AC-016 | Wave 3 | P1 | IN_PROGRESS | F07: `T2` QuickMenu·`T3` 압력 베지어·`T6` ColorDrop·`T7` QuickShape·`T9` 레이어 트리오 전수 구현 및 `StudioDrawingQuickErgonomicsBar.tsx`·`studio-layer-metadata-patch.ts` 실전 연결 완료 (vitest 대기) | `pnpm test:studio-material-brush && pnpm verify:studio-brushes` |
| AC-017 | Wave 3 | P1 | IN_PROGRESS | F08: `StudioBg3dProfessionalWorkspace.tsx`에 Live Ink `split-wipe` 슬라이더·원클릭 비파괴 원고 컷 굽기(`buildBakedManuscriptCutLayer`) 실전 마운트 완료 (WebGPU 순차 검증 대기) | `pnpm verify:studio-3d-professional-completion && pnpm verify:studio-3d-web-authoring` |
| AC-018 | Wave 3 | P1 | IN_PROGRESS | F10: `TitleDetailPage.tsx` 3컷 리믹스 브리지 + `studio-timelapse-and-psd-exporter.ts` WebM 타임랩스(`T11`) `StudioExportPanel.tsx` 실전 연결 완료 (vitest 대기) | `pnpm harness:verify && pnpm verify:studio-artist-journey` |
| AC-019 | Wave 4 | P2 | IN_PROGRESS | UI v2 에디터 크롬 계약(`studio-ui-v2-chrome-contract.ts` -> `studio-menubar-catalog.ts` 7대 표준 메뉴·시야 비율 계약 실전 연결 완료, 브라우저 검증 대기) | `pnpm verify:studio-menus && pnpm verify:studio-canvas-chrome` |
| AC-020 | Wave 4 | P2 | IN_PROGRESS | 표면 통합 거버넌스(`unified-surface-governance.ts` -> `ResearchNavigation.tsx` 5대 통합 핀보드 필터 투영 실전 연결 완료, vitest 대기) | `pnpm validate:architecture && pnpm verify:studio-wiring-reachability` |
| AC-021 | Wave 4 | P2 | IN_PROGRESS | 신규·수정 26개 모듈 전수 Starlight/Warm-Ink 의미 토큰 준수·원시 HEX/중첩 카드 0건 정적 검증 완료 (전체 사이트 시각 감사 실행 대기) | `pnpm audit:sitewide-visual-ux:all && pnpm audit:sitewide-visual-ux:forced-colors` |
| AC-022 | Wave 4 | P2 | IN_PROGRESS | 신규 19개 프로덕션 모듈 100%(19/19) 실전 호스트 임포트 연결 및 `web`/`admin-web`/`api` 교차 참조 0건 정적 검증 완료 (`check:unconnected-code:gate` 실행 대기) | `pnpm validate:architecture && pnpm check:unconnected-code:gate` |
| AC-023 | Wave 5 | P0 | TODO | 로컬 Node/pnpm 터미널에서 앱 내 전수 기능 스윕 + 접근성(axe) + 3D/2D 브라우저 E2E 순차 실행 | `pnpm verify:studio-inapp-feature-sweep && pnpm test:a11y && pnpm test:a11y:editor` |
| AC-024 | Wave 5 | P0 | TODO | 로컬 Node/pnpm 터미널에서 최종 상용 출시 게이트(`pnpm verify:push`) 실행 및 원격 푸시 확정 | `pnpm verify:push && pnpm harness:check` |

---

## 슬라이스별 필수 통과 계약 (모든 AC 공통)

1. **5대 UI 상태 완비**: `Loading`(Zero-CLS 스켈레톤 + 중복 제출 잠금), `Empty`(다음 행동 런처 CTA), `Error`(입력 보존 + 한국어 복구 안내 + 재시도), `Boundary`(0/null/대용량/한글 IME `isComposing`/320px·390px·1440px), `Success`(낙관적/동기화 갱신).
2. **영속성 왕복**: 생성/편집 -> 새로고침(또는 탭 재열기) -> 데이터·선택·Undo 스택 무손실 확인.
3. **실브라우저 적대적 QA**: `console.error` 0건, `pageerror` 0건, 예상치 못한 `4xx/5xx` 0건, 터치 타겟 `<44×44px` 0건, 텍스트 잘림·패널 겹침 0건.
4. **원자적 커밋**: 통과 직후 `<type>(<scope>): <한글 요약>` 형식의 로컬 체크포인트 커밋 생성 후 상태를 `VERIFIED`로 갱신.

## 거부(REJECTED) 및 수정 이력 로그

- (각 사이클에서 적대적 QA가 결함을 발견하면 `AC-ID | 발견 일시 | file:line 원인 | 수정 커밋` 형식으로 누적 기록한다.)
