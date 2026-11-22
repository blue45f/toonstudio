# UX 플로우 백로그 (2026-10-01 · 2026-11-21 정비)

> **문서 상태: 역사 자료 (`archive`)** — P1·P2·P3 전 항목이 `2026-11-21` 기준 해소·검증되어 `2026-11-22` 저장소 루트(`UX_FLOW_BACKLOG.md`)에서 이 경로로 아카이브 이동했습니다.

전 기능 안정성 점검 과정에서 발견한 구조적 개선 항목. 실제 구현·검증된 사실과 잔여 항목을 구분해 기록한다.

## P1 — 백엔드 다운 시 초기 로딩 행(hang) (2026-11-11 해결 완료 · 2026-11-21 E2E 고정)

- **현상**: E2E에서 API 백엔드(4001) 없이 `/market`, `/market/browse` 진입 시 페이지 로딩이 120초 타임아웃까지 멈춤.
- **원인 추정**: 앱 셸이 `/api/auth/session`, `/api/health/capabilities` 등 초기 호출에 의존. 마켓 리소스 훅 자체는 AbortController·캐시 폴백·재시도 UI가 잘 되어 있으나, 페이지 셸 레벨의 초기 게이트가 실패를 우아하게 처리하지 못함.
- **게스트-퍼스트 관점**: 로그인 없이 둘러보기가 핵심 가치인데, 백엔드 장애 시 공개 페이지마저 먹통이 되면 안 됨.
- **해결 조치 (2026-11-11)**: `apps/web/src/domains/auth/public/session/auth-session.tsx`에 `INITIAL_SESSION_READY_DEADLINE_MS = 3_000` 비차단 기한 타이머를 도입해 백엔드 콜드스타트·네트워크 행 상태에서도 3초 안에 게스트·로컬 캐시 프로필로 즉시 렌더링을 개방하고, 백그라운드 응답 도착 시 세션을 무중단 갱신하도록 개선함(`auth-session.test.tsx` 검증).
- **브라우저 E2E 고정 (2026-11-21)**: `e2e/auth-local-smoke.spec.ts` 시나리오 1에서 `/api/auth/session` 6초 지연 및 `503` 상황에서 `<= 3.5s` 내 `/studio`·`/market` `<main>` 헤딩과 게스트 CTA 노출을 `vite preview`로 실측 통과 확인.

## P2 — E2E 로컬 실행 환경 (2026-11-21 옵션·가이드 정비 완료)

- **현상**: `apps/web/config/`가 sparse-checkout에서 빠져 있어 vite 기동 불가. 로컬/VM dev 서버 실행 시 inotify 와처 고갈(`ENOSPC`)로 dev 서버 크래시 발생.
- **조치 (2026-11-21)**:
  - **worktree sparse-checkout 필수 패턴**: E2E용 sparse-checkout 워크트리 구성 시 `apps/web/config/`(청크·오프라인 HTML·컴파일러 인터롭 모듈 포함)를 반드시 포함한다.
    ```bash
    git sparse-checkout add apps/web/config
    ```
  - **로컬/VM dev 서버 와처 한도(`ENOSPC`) 회피**: `apps/web/vite.config.ts`에 `TOONSTUDIO_VITE_DISABLE_WATCH=1` opt-in 분기(`server.watch: null`)를 추가했다.
    ```bash
    TOONSTUDIO_VITE_DISABLE_WATCH=1 pnpm exec playwright test <spec>
    ```
  - **프로덕션 번들 프리뷰(`vite preview`) E2E 실행 권장**: `playwright.config.ts`에 `TOONSTUDIO_E2E_PREVIEW=1` 모드를 추가했다. 사전 빌드된 `dist/`를 파일 와처 없이 `vite preview`로 서빙하며, 서비스워커 캐시 간섭을 차단(`serviceWorkers: "block"`)한다.
    ```bash
    TOONSTUDIO_E2E_PREVIEW=1 pnpm exec playwright test e2e/auth-local-smoke.spec.ts
    TOONSTUDIO_E2E_PREVIEW=1 pnpm exec playwright test e2e/studio-full-journey-100.spec.ts
    ```
  - **전체 제작 여정 프로덕션 프리뷰 실측 (2026-11-21)**: `e2e/studio-full-journey-100.spec.ts`(게스트 진입 → 프로젝트 생성 → 2D 드로잉·Undo/Redo → 3D 배경·캐릭터 → 소재 탐색 → 오프라인 편집·재연결·리로드 복원 → 통합 프리플라이트 → PNG·PSD·ZIP/CBZ 내보내기) — **1/1 통과 (2.0m)**.

## P3 — 인증 E2E의 로컬 커버리지 부재 (2026-11-21 해결 완료)

- **현상**: `e2e/auth-account-matrix.spec.ts`는 live 게이트(`TOONSPECTRUM_MARKET_LIVE_E2E=1`)로 로컬에서 스킵. 로컬에서 돌릴 수 있는 인증 플로우(가입 검증·로그인·로그아웃·세션 만료·오프라인 재연결) E2E가 없었음.
- **해결 조치 (2026-11-21)**: `e2e/auth-local-smoke.spec.ts`를 `TOONSPECTRUM_MARKET_LIVE_E2E` 없이 로컬 `vite preview`에서 동작하는 mock 세션 API(`page.route("**/api/**")`) 기반 7대 시나리오로 전면 격상함.
  1. 게스트 3초 비차단(P1: 세션 6초 지연 및 `503`에서 `<= 3.5s` 내 `<main>` 헤딩·게스트 CTA 노출)
  2. 로그인 유도(게스트 트리거 클릭 → `role="dialog"` 열림·접근성 이름·이메일 포커스 이동·Escape 복귀)
  3. 가입 입력 검증(클라이언트 짧은 비밀번호 + mock `POST /api/auth/signup` `400` 한글 인라인 `role="alert"`·비인증 유지)
  4. 로그인 성공·반영(mock `POST /api/auth/login` `200` + `GET /api/auth/session` authenticated 전환 및 `reload()` 유지)
  5. 로그아웃·복귀(mock `POST /api/auth/logout` `200` 후 인증 UI 해제 및 게스트 버튼 복귀)
  6. 세션 만료(`401 SESSION_EXPIRED`) 안전 폴백(`pageerror` 0건 + 게스트 복구·로컬 스튜디오 접근 유지)
  7. 오프라인→온라인 재연결(`setOffline(true)` 중 폴링 폭주 0건 + 온라인 복귀 시 유한 재동기화)
- **실측 검증 (2026-11-21)**: `TOONSTUDIO_E2E_PREVIEW=1 pnpm exec playwright test e2e/auth-local-smoke.spec.ts` — **7/7 통과 (34.3s)**.

## 확인 완료 (수정 불필요)

- 에러 바운더리: 라우트 레벨 + 스튜디오 서피스 레벨 모두 동작 (vitest 7/7 통과).
- 마켓 리소스 훅: AbortController·stale 캐시 폴백·재시도 UI 완비 (vitest 7/7 통과).
- 라이브 협업 재연결: 지수 백오프(2s/5s/10s) 후 exhausted 상태로 중단, offline/visibility 존중.
- 초대 링크 복사 UI: `StudioLiveCollaborationPanel`에 이미 존재.
- 라우트 폴백: 4.5초 지연 시 설명 + 빠른 이동 링크 제공.
- CRDT 문서 동기화: 52/52 테스트 통과.
