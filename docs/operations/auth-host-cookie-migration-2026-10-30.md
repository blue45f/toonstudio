# 인증 쿠키의 호스트 격리 전환

상태: **migration**. 2026-10-30 구현 후보의 계약이며 운영 배포 완료 기록이 아니다.

## 구현 계약

운영(`NODE_ENV=production`) API는 세션과 OAuth의 state·PKCE verifier·계정 연결 세션 쿠키를
`__Host-` 이름으로 발급하고 같은 이름만 읽고 삭제한다. 모든 운영 인증 쿠키는 `Secure`,
`HttpOnly`, `Path=/`를 사용하고 `Domain`을 설정하지 않는다. 세션과 일반 OAuth의 `SameSite=Lax`,
Apple POST callback의 `SameSite=None` 정책과 기존 만료 시간은 유지한다.

하위 도메인의 응답이나 JavaScript는 상위 `Domain`에 예전 이름의 쿠키를 추가할 수 있다.
더 긴 Path를 지정하면 요청 헤더에서 먼저 전송될 수도 있다. 운영 parser는 그 값을 인증에
사용하지 않는다. 브라우저는 `Domain`이 붙은 `__Host-` 쿠키를 거부하므로 하위 도메인이
실제 운영 호스트의 인증 쿠키를 같은 방식으로 덮어쓸 수 없다.

개발·테스트의 세션 이름과 HTTP용 `Secure=false`는 유지한다. 개발 OAuth 쿠키도 기존 이름과
공급자별 Path를 유지하며 기존 `Secure=true` 정책은 바꾸지 않는다. 로컬 격리 QA 도구의
기존 쿠키 이름은 이 환경 계약을 따른다.

## 사용자 영향과 배포 순서

이 후보를 운영에 배포하면 이전 이름으로 로그인한 브라우저는 다시 로그인해야 한다.
전환 전에 시작한 OAuth 흐름도 다시 시작해야 한다. 레거시 이름을 함께 읽는 호환 경로는
하위 도메인이 주입한 쿠키도 다시 받아들이므로 제공하지 않는다. 기존 사용자·프로젝트·DB
데이터와 서버의 세션 서명 형식은 변경하지 않는다.

PR 병합만으로 배포하지 않는다. 별도 운영 릴리스에서 검증한 한 SHA로 API 인스턴스를
일치시킨다. 구버전과 신버전 API가 섞이면 쿠키 이름이 달라 세션 확인과 OAuth callback이
실패할 수 있다. 배포 전 재로그인 영향과 현재 롤백 대상을 기록하고, 배포 후 새 로그인·세션
조회·로그아웃 및 공급자별 OAuth 시작 응답을 확인한다. 이 변경에는 DB migration이 없다.

이전 API로 롤백하면 새 이름의 세션이 읽히지 않아 다시 로그인이 필요하다. 이전 이름의 쿠키가
브라우저에 남아 있다면 이전 API는 그 쿠키를 다시 읽을 수 있다. 쿠키 격리를 해제하는 롤백은
보안 영향을 검토한 뒤 결정하며, 조용한 dual-read 전환으로 대체하지 않는다.

## 검증 경계

- 단위 테스트: 운영·개발별 이름, 필수 속성, 동일 삭제 범위, 5개 OAuth 공급자의 state·PKCE·계정 연결 쿠키.
- 실제 HTTP 테스트: 서명된 레거시 쿠키만 보냈을 때 인증 거부, 레거시 쿠키가 앞에 와도 호스트 쿠키의 사용자만 인증.
- AuthController 테스트: 레거시 state/PKCE 거부, 호스트 이름으로 발급·로그아웃.
- Chromium 테스트: 격리한 하위 도메인 iframe에서 상위 Domain 쿠키를 주입한 뒤 운영 parser와 브라우저 쿠키 저장소 확인. 모든 페이지와 API 요청은 테스트 route로 처리한다.
- 운영 OAuth 점검 스크립트의 단위 테스트: 예전 이름, Domain 설정, 잘못된 Path를 실제 점검 코드가 거부하는지 확인.

저장소 루트에서 `pnpm exec vitest run apps/api/src/session-cookie.test.ts apps/api/src/oauth-state-cookie.test.ts apps/api/src/session-middleware.test.ts apps/api/src/session-cookie.http.integration.test.ts apps/api/src/modules/auth/auth.controller.session.test.ts apps/api/src/modules/auth/auth.controller.oauth-google.test.ts scripts/verify-social-login-production.test.mjs`와
`pnpm exec playwright test e2e/auth-session-cookie-isolation.spec.ts`로 회귀를 실행한다.
운영 OAuth 점검은 `pnpm verify:social-login-production`을 별도 운영 검증 절차에서 실행한다.
이 문서에 운영 점검이나 실제 로그인 완료를 추정해 기록하지 않는다.
