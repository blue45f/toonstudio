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
- 다른 탭에서 저장본이 바뀌면 오래된 보드의 저장을 차단한다. 미저장 기록은 JSON으로 백업할 수 있고, 폐기 확인 후 최신 저장본을 다시 읽는다.
- Testifly는 `reference-only` 후보로 유지한다. 외부 QA 결과와 core·verify의 통계는 Vitest·Playwright 통계에 합산하지 않는다.
- 코드 수정·외부 배포·계정 설정 변경은 승인 대기 메모만 기록한다. 명령·CI 실행, 계정 연결, 유료 서비스 호출 기능은 없다.
- 서비스 워커는 이 페이지와 전용 자산을 네트워크에서만 요청하며 오프라인 Web 셸로 대체하지 않는다.

검증에는 `pnpm harness:verify`, `pnpm typecheck:admin`, `pnpm test:admin`, `pnpm build:admin`,
`pnpm test:admin:e2e`를 사용한다. 브라우저 테스트는 합성 관리자 응답과 로컬 기록을 사용하며 운영 계정·DB를 변경하지 않는다.
필수 CI의 타입 검사 작업과 브라우저 작업에도 연결되어 있다. 실제 실행 결과를 확인하기 전에는 검증 완료로 보고하지 않는다.

## NestJS·API 호환성 검증 보드

- 소스 구현 기준: 2026-11-18. 운영 배포와 운영 DB migration 적용은 별도 작업이다.
- 진입 경로는 `/admin/platform/quality/?view=nestjs`다. 같은 독립 Admin 산출물 안에서 NestJS 화면을 지연 로드하며, 기존 CI·QA의 5상태 모델과 브라우저 저장 기록은 변경하지 않는다.
- `CiQualityAccess`가 서버 관리자 신원을 확인한 뒤 화면을 연다. `admin`만 기록을 저장하고 `operator`는 조회·내보내기만 한다. 재확인 중에는 화면을 숨기되 같은 계정의 초안을 유지한다. 계정 전환·권한 거부 뒤에는 이전 계정 기록을 닫는다.
- 기록은 `GET /api/admin/quality/nestjs`에서 읽고 같은 경로의 CSRF 보호 `POST`로 저장한다. 서버 오류를 기본 seed나 localStorage 저장 성공으로 대체하지 않는다. 서버의 문서 버전과 mutation ID를 사용하여 충돌·통신 재시도를 처리한다.
- 6개 관리 상태와 실제 확인 결과를 분리한다. 패키지 선언·잠금·목표 버전, PR·커밋·CI, API·Socket.IO·PostgreSQL 경로, 시나리오의 전후 증거, `WsAdapter` 적용 판정, 확인일·검증일·다음 조치를 원본 형식으로 보존한다.
- 완료·보관 항목은 기본 작업 목록에서 숨긴다. 24시간이 지난 관측에는 재확인 안내를 표시하며 GitHub의 최신 상태로 자동 갱신했다고 표시하지 않는다.
- JSON 가져오기는 새 문서와 기존 Sites 내보내기를 지원한다. 전체 형식 검증, 변경·제거 항목 미리보기, 사용자 확인 후에만 서버 문서를 교체한다. 패키지·PR·CI·경로·정렬 순서의 편집도 이 흐름을 이용한다.
- JSON 내보내기에는 전체 문서와 서버 변경 이력 **요약**을 포함하며, 과거 서버 버전별 문서 전후 사본을 전부 내보내지는 않는다. 현재 문서의 시나리오 전후 증거는 포함한다. 가져온 원본 출처 이력은 서버가 기록한 감사 이력과 구분한다. 저장 충돌에는 초안을 내보내고 명시적으로 폐기한 뒤 최신 기록을 다시 읽는다.
- 서버 이력의 버전별 링크는 `GET /api/admin/quality/nestjs/history/:revision`의 문서 전후 사본을 새 창에서 연다. 해당 API도 서버 관리자 권한을 확인한다.
- 새 항목에서 코드 수정·PR 병합·배포 승인 필요 여부를 명시적으로 지정할 수 있다. 승인 항목은 승인 대기로 고정하고, 저장 이후 일반 편집 화면은 검토 메모만 저장한다. 기존 승인 항목의 삭제·해제는 가져오기에서도 차단한다. 코드 수정, CI 실행, PR 병합, 배포를 실행하는 기능은 없다.

`pnpm test:admin`은 API 클라이언트·권한·상태·저장 오류·JSON·초안 보존을 검증한다.
`pnpm test:admin:e2e`의 `tests/nestjs-quality.e2e.ts`는 합성 관리자·서버 응답으로 저장·재열기,
읽기 전용 권한, 403/409 복구, JSON 왕복과 390px 키보드 화면을 확인한다. 실제 PostgreSQL 저장과
서버 권한 경계는 API의 별도 통합 테스트가 담당한다.
