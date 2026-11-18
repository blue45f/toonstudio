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

## 클라우드 작업 보드

- 상태: **migration — 현재 소스 구현, 운영 DB 적용·배포 승인 대기** (2026-11-18).
- 진입 경로: `/admin/platform/quality/?view=cloud-work`. 기존 CI·QA 탭과 같은 셸을 사용하며 활성 `admin`만 이 탭과 API에 접근한다. `operator`는 기존 CI·QA 탭 권한을 유지한다.
- 프로젝트별 작업은 미확인·진행 중·검토 필요·승인 대기·검증 완료·main 머지 완료 여섯 상태로 관리한다. 전체 표·칸반, 로컬/원격/main 비교, 승인 대기, 저장 이력을 제공한다.
- 저장소·브랜치·PR·전체 SHA·CI·배포·마이그레이션·계정·인프라 상태와 담당자·범위·선행 조건·차단 요인·증빙·로그·다음 조치·확인 시각을 기록한다. 충돌·회귀·CI 실패·배포 차단은 별도 신호다.
- 최신 상태를 자동 조회하거나 GitHub·배포 서비스를 실행하지 않는다. 근거가 없으면 미확인이며 확인 시각은 편집 시각과 분리한다. SHA와 근거가 일치해야 검증·main 포함을 확정하고, 동일 PR·변경 식별자·커밋/배포 환경을 비교해 중복 후보를 표시한다.
- `GET/POST /api/admin/cloud-workboard`는 인증된 계정의 개인 보드를 PostgreSQL에 보관한다. 같은 계정의 여러 기기에서 공유하며 다른 관리자 보드는 조회하지 않는다. 최초 조회는 빈 보드를 반환하고 데이터를 생성하지 않는다.
- 저장은 revision 비교·행 잠금·동일 요청 ID의 재시도로 중복을 방지한다. 본문과 서버 감사 이력을 한 트랜잭션으로 저장한다. 오래된 요청의 재시도에는 현재 스냅샷을 반환하며 다른 기기의 편집을 되돌리지 않는다.
- 409 충돌에는 미저장 편집본의 내보내기를 제공하고 최신 내용을 다시 읽은 뒤 비교·가져오기를 통해 반영한다. 권한이 없어지면 개인 기록을 화면에서 제거한다.
- 기존 Sites 보드는 JSON을 내보내고 새 보드의 가져오기 미리보기에서 충돌을 검토해 병합한다. Sites 개인 작업·프로젝트명은 정적 번들에 포함하지 않는다. 가져온 감사 배열은 서버 감사 원장으로 등록하지 않는다.
- 코드 수정·외부 배포·계정/인프라 변경·운영 데이터 변경·원격 머지는 승인 대기 기록만 만든다. 보드에는 이 작업들을 실행하는 API나 버튼을 제공하지 않는다.

### 활성화·복구 조건

승인된 배포 담당자가 저장소의 정식 migration 절차로 `0122_admin_cloud_workboard.sql`과
지정 런타임 역할의 최소 ACL을 먼저 적용한 뒤 API/Admin을 배포한다. 이번 코드 머지는 이 운영 절차의 승인이 아니다.
준비되지 않은 저장소는 503으로 표시하고 요청 처리에서 DDL이나 임의 초기화를 실행하지 않는다.
성공 기준은 활성 관리자 조회·저장, 다른 계정 격리, 충돌 처리, migration 원장·readiness 확인이다.
코드를 롤백해도 추가된 테이블과 감사 이력은 유지한다. 데이터 삭제를 통한 롤백은 수행하지 않는다.

공용 계약 테스트, API 권한·입력 단위 테스트, 실제 분리 PostgreSQL의 동시 저장·재시도·감사 롤백·
비소유 런타임 ACL·migration 재적용 테스트, Admin의 저장 충돌·JSON 가져오기·권한·모바일 브라우저 테스트로 검증한다.
