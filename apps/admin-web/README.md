# ToonStudio Admin Web

`apps/admin-web`은 독립 빌드 가능한 관리자 브라우저 애플리케이션이다. pnpm workspace 이름은
`@toonstudio/admin-web`이며 source와 빌드 설정을 이 디렉터리가 소유한다.

## 명령

```sh
pnpm --filter @toonstudio/admin-web dev
pnpm --filter @toonstudio/admin-web typecheck
pnpm --filter @toonstudio/admin-web test
pnpm --filter @toonstudio/admin-web build
pnpm --filter @toonstudio/admin-web test:e2e
```

생성물은 `apps/admin-web/dist/`에 쓴다. 빌드와 머지는 운영 배포 승인이 아니다.

## 소유권

```text
src/app       bootstrap, provider, route, shell, 전역 스타일
src/domains   업무 책임별 관리자 capability
src/platform  HTTP, 인증, telemetry, browser/runtime adapter
src/shared    domain 의존성이 없는 Admin 전용 UI·순수 helper
```

Admin은 `apps/web`이나 `apps/api` source를 import하지 않는다. 실행 환경에 중립적인 안정된 DTO·schema는
실제 두 번째 소비자가 생긴 뒤 `packages/contracts`로 승격한다. 기존 Web 관리자 console은 기능
단위로 이전하며 Admin의 공유 source로 사용하지 않는다.

## CI·QA 검증 보드

- 상태: **현재 소스 구현, 운영 배포 전** (2026-11-12).
- 진입 경로: `/admin/platform/quality/`. 기존 Web 관리자 운영 화면의 링크는 전체 문서 탐색으로 이 경로를 연다.
- Web Vite 빌드는 독립 Admin 설정을 사용해 실제 Web 출력 폴더의 `admin/platform/quality/`에 산출물을 조립한다. 앱 소스를 교차 import하지 않으며, Admin 빌드 실패도 전체 빌드를 실패시킨다.
- 페이지를 열거나 다른 창에서 돌아오면 `GET /api/admin/me`로 관리자 역할(`admin`, `operator`)을 확인한다. 실패·거부·잘못된 응답에는 보드와 저장된 기록을 표시하지 않는다.
- 12개 기본 검사와 추가 전용 게이트를 5상태로 추적한다. 완료 표시와 SHA·실행 시각·TTL·범위·로그에 따른 근거 유효성은 별도로 계산한다.
- 기본 SHA는 2026-11-12에 관측한 스냅샷이다. GitHub Actions에 자동 연결하지 않으며 실행 결과·통계는 미확인으로 시작한다. 최신 커밋과 실제 결과는 수동 기록하거나 JSON으로 가져온다.
- 검증 결과·실패 분석·CI 요약 JSON·외부 QA 참고 결과·승인 메모·로컬 이력을 인증된 관리자별 **브라우저 저장소**에 보관한다. 서버·다른 기기와 공유하거나 서버 감사 원장을 대체하지 않는다.
- JSON은 전체 검증·검토·대체 확인 후에만 가져온다. 손상된 저장본은 자동 초기화하지 않으며 저장 실패에는 내보내기·재시도를 제공한다.
- Testifly는 `reference-only` 후보로 유지한다. 외부 QA 결과와 core·verify의 통계는 Vitest·Playwright 통계에 합산하지 않는다.
- 코드 수정·외부 배포·계정 설정 변경은 승인 대기 메모만 기록한다. 명령·CI 실행, 계정 연결, 유료 서비스 호출 기능은 없다.
- 서비스 워커는 이 페이지와 전용 자산을 네트워크에서만 요청하며 오프라인 Web 셸로 대체하지 않는다.

검증에는 `pnpm harness:verify`, `pnpm typecheck:admin`, `pnpm test:admin`, `pnpm build:admin`,
`pnpm test:admin:e2e`를 사용한다. 브라우저 테스트는 합성 관리자 응답과 로컬 기록을 사용하며 운영 계정·DB를 변경하지 않는다.
필수 CI의 타입 검사 작업과 브라우저 작업에도 연결되어 있다. 실제 실행 결과를 확인하기 전에는 검증 완료로 보고하지 않는다.
