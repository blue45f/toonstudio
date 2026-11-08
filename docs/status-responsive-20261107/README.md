# 서비스 상태 페이지 반응형·복구 동선 검증

- 상태: current. 로컬 구현·페이지 검증·최종 전체 하네스 완료. main 통합·원격 CI·배포 완료를 뜻하지 않는다.
- 기준일: 2026-11-07 UTC.
- 시작 기준: origin/main d823079b2f.
- 범위: /status의 ServiceStatusPage.tsx, 전용 CSS·단위 테스트와 이 검증 자료.
- 공통 상태 런타임, 공통 헤더, 라우트, App.tsx, 운영 환경은 수정하지 않았다.

## 기존 디자인과 실제 구현

기존 SitePageHeader, /status 전용 배정 아트, 남색·보라색 테마 토큰을 재사용했다. 새 시안이나 이미지는 생성하지 않았다.

기존 근거:
- ../design/illustrated-ui-route-coverage-20260928.json: /status 모바일·데스크톱 검토 및 starlight-mobile-_status.png, starlight-desktop-_status.png 이름이 기록되어 있다. 해당 PNG 자체는 현재 추적 파일에서 확인되지 않았다.
- ../design/reference-design-audit-20260928.md: 공통 남색 표면과 보라색·청록색 강조 방향.
- 기존 ServiceStatusPage 및 public/site-page-header-art.ts: 실제 구현과 아트 배정.
- 별도의 /status 태블릿 시안이나 3기기 독립 시안은 접근 가능한 추적 파일에서 확인하지 못했다. 외부 시안 저장소 전체에 대한 부재 판정은 아니다.
- screenshots는 승인된 사전 시안이 아니라 실제 로컬 구현의 검증 캡처다.

## 개선 내용

- 모바일에서 장식 그림을 숨겨 상태·재확인 행동을 먼저 보여 준다. 태블릿·PC 아트는 보존했다.
- 상태·최근 성공 시각·장애 ID를 구분한다. 긴 식별자는 생략하거나 숨기지 않고 줄바꿈한다.
- 기능 카드의 설명을 배지 옆 좁은 칸에서 분리하고 전체 폭으로 표시한다. 320/390px은 1열, 768px은 2열, 1440px은 3열이다.
- 상태는 색뿐 아니라 아이콘과 글자로도 전달한다. 설명 글자와 배지의 대비를 기존 전경 토큰으로 맞췄다.
- 마지막 확인 실패를 11개 카드 위에 두고 이전 확인 결과라는 안내·재시도·도움말 경로를 제공한다.
- 재확인 중에는 기존 11개 결과를 유지하고 중복 요청을 막는다. 재시도 실패 또는 복구로 버튼이 비활성화·제거된 뒤 잃은 키보드 초점을 적절한 버튼으로 돌린다. 다른 링크로 이동한 초점은 빼앗지 않는다.
- 전역 데스크톱 컨트롤 40px 규칙을 페이지의 기존 data-own-control-size 계약으로 분리하고 실제 행동 높이 48px을 유지한다. 200% CSS 확대에서는 96px이다.
- reduced motion에서는 확인 아이콘의 회전 애니메이션을 끈다.

## 실행한 검증

### 단위·상태 계약
- ServiceStatusPage.test.tsx 9개, service-capability-state.test.ts 2개: 총 11개 통과.
- 초기 미확인, 초기 로딩, 기능 11개·시각·ID 보존, 반복 요청 차단, 오류 위치, 재시도/도움말, 성공·재실패 후 초점, 다른 행동의 초점 보존.
- pnpm harness:doctor 통과.
- 최종 pnpm harness:verify exit 0. 웹 26,348/26,348파일 진단 0, API TypeScript 검사 3종 통과. 하네스 무결성·lockfile·변경 lint·Secretlint·아키텍처·문서·앱 경계·파일 크기·Studio 진입 그래프 게이트도 통과했다. 입력 fingerprint와 소스 SHA-256은 validation-summary.json에 기록했다.

### 실제 Chromium 브라우저
verify-status.mjs 11조건 통과:
- 320×844, 390×844, 768×1024, 1440×900
- 데스크톱 CSS zoom 2
- 모바일 light, contrast, forced-colors
- reduced motion
- 320px 영어 긴 문구
- 이미지 요청 실패

모든 조건에서 가로 넘침·텍스트 잘림 0, 기능 11개 보존, 행동 최소 44px 이상, 키보드 초점 표시, axe WCAG 2 A/AA·2.1 AA·2.2 AA 위반 0, 런타임 오류 0을 확인했다. 정확한 측정은 browser-report.json에 있다.

390px/1440px에서 추가로 실제 검증:
1. 상태 재확인 → 503 실패. 기존 결과 11개와 긴 요청 ID를 보존한다.
2. 도움말 링크 → 실제 도움말 제목 표시 → 뒤로/앞으로/뒤로 복귀.
3. 지연된 재시도 중 Enter·Space 반복 입력 → 상태 요청 1회만 발생.
4. 재시도 재실패 → 재시도 버튼 초점 복구.
5. 재시도 성공 → 오류 패널 제거·정상 상태 표시·헤더 재확인 버튼 초점 복구.
6. 문제 제보 링크 → 실제 제보 페이지 제목 표시 → 뒤로 복귀. 제보 제출은 하지 않았다.

verify-status-initial.mjs는 390px/1440px에서 최초 응답 대기와 보고서가 없는 실패 상태를 별도로 검증했다. 실제 인트로가 끝난 뒤 캡처했으며, 대기 표시·회전 감쇠·비활성 버튼·미확인 안내·재시도 가능·axe 위반 0을 확인했다.

### 발견 후 수정한 회귀
- 기존 화면에서 긴 장애 ID가 헤더 overflow 안에서 잘렸다. 문서 전체 가로 넘침만 검사하면 놓치는 문제여서 요소별 잘림 검사도 추가했다.
- Chromium은 비활성화된 재시도 버튼의 초점을 잃었다. 실패·성공 모두 복구하고 단위/브라우저 테스트로 고정했다.
- 태블릿·PC 전역 min-block-size가 페이지 min-height를 40px로 덮었다. 공통 CSS를 수정하지 않고 페이지의 명시적 크기 소유권으로 해결했다.
- 중간 전체 타입 검사는 소스 수정 감지로 중단되었다. 이후 미완료 실행은 성공으로 계산하지 않고 최종 고정 소스로 다시 실행했다.

## 재현

실행 위치: 저장소 루트. 이 worktree는 pnpm install --offline --frozen-lockfile로 독립 의존성을 설치했다.

1. pnpm exec vitest run apps/web/src/domains/legal/ServiceStatusPage.test.tsx apps/web/src/platform/service-capability-state.test.ts
2. node node_modules/vite/bin/vite.js --config apps/web/vite.config.ts --host 127.0.0.1 --port 4198 --strictPort
3. node docs/status-responsive-20261107/verify-status.mjs
4. node docs/status-responsive-20261107/verify-status-initial.mjs
5. pnpm harness:verify

STATUS_QA_BASE는 localhost/127.0.0.1만 허용한다. STATUS_QA_SCREENSHOTS=0은 일반 조건 캡처 갱신만 생략한다. STATUS_QA_ONLY는 한 조건의 진단용이며 전체 검증을 대체하지 않는다. capture-before.mjs와 before-mobile-english.png는 시작 기준 소스에서 확보한 비교 자료다.

모든 API 응답은 격리 브라우저의 fixture다. 상태 API만 성공·실패·복구를 제어하고 다른 API는 503으로 막았다. 실제 사용자 계정·서버 데이터·글 작성·결제·배포는 사용하지 않았다.

## 미검증·통합·정리

- 실기기 Safari, VoiceOver/TalkBack, 실제 브라우저 메뉴 200% 확대는 미검증이다.
- 실제 운영 서버 장애·복구, 계정 로그인, 문의/제보 제출은 미검증이다.
- 전체 production build, 원격 CI, main 통합, 운영 배포는 이 작업에서 하지 않았다.
- 테스트 브라우저는 finally에서 모두 종료했다. 캡처 검토 후 localhost:4198 서버도 종료하고 PID·리스너 없음을 확인했다. 다른 담당자의 프로세스는 종료하지 않았다.
