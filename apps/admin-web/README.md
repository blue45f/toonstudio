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

## 사업계획·운영 통합 작업실

- 상태: **migration — 소스 구현, 운영 적용은 별도 승인 대상** (2026-11-18).
- 진입 경로: `/admin/workspace/`. 사업계획·제출, 클라우드, NestJS, 의존성·CI, AI·무료 운영을 함께 관리한다.
- 활성 관리자는 편집하고 운영자는 조회한다. 공통 계약 검증과 revision 충돌 검사 후 서버 DB에 저장한다.
- 주장별 근거·최신성, 작업/제출 문서 비교, 멘토 요청, 누락 점검과 승인 대기를 제공한다.
- 기존 Sites JSON의 원문과 출처를 가져올 수 있다. 비공개 데이터는 정적 번들에 포함하지 않는다.
- [통합 작업실 계약과 운영 반영 절차](../../docs/features/admin-integrated-workspace.md)에 저장·가져오기·권한·DB 변경 범위를 기록한다.

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

### 의존성·회귀 검토

`CI·QA 검증`의 **의존성·회귀** 탭은 Remotion 버전 분기와 deepmerge 소비 경로를 별도 원인으로
관리한다. 원인 2개, 독립 검사 5개, 승인 대기 4개와 PR #2789 완료 보관 항목을 연결하며,
의존성 선언·잠금 해석·workspace, PR의 base/head/merge/확인된 checkout SHA와 CI 링크를 대조한다.

- 기존 CI·QA v1의 12개 검사와 저장 키는 유지한다. 새 기록은 인증된 관리자별
  `toonstudio:admin:dependency-review:v1:<user>` 키에 별도로 저장한다.
- 작업 상태 6단계와 원본 관측 결과·수동 검사 결과를 구분한다. 과거 SHA 성공이나 수정의
  main 포함은 현재 검사의 성공이 아니다. 기준 SHA는 고정된 수집 스냅샷이고 자동 갱신하지 않는다.
- Sites의 실제 의존성 보드 JSON 및 이 탭의 백업을 검토 후 가져올 수 있다. 같은 원본은 중복
  적용하지 않고 로컬 편집 충돌은 기본 보존한다. 가져오기 원본의 전체 JSON도 내보내기에 포함한다.
- 가져온 완료 주장은 원본 상태로 보존하며 재검토 대상으로 표시한다. 기존 기준 커밋·의존성·PR
  표는 가져오기로 덮어쓰지 않는다. 메모 편집은 원본 SHA나 검증일을 갱신하지 않는다.
- 손상된 저장본을 자동 초기화하지 않는다. 저장 실패·다른 탭 변경에는 초안을 보존하고 JSON
  백업과 명시적인 최신 저장본 다시 읽기를 제공한다. 서버·다른 기기와의 공동 저장 기능은 없다.
- 코드 수정·푸시·PR 병합·배포는 승인 대기 메모만 관리한다. 패치·명령은 텍스트와 복사 기능으로만
  제공하며 GitHub 실행·설정 변경·유료 호출 기능은 없다.

## 사업계획서 고도화·제출 준비 보드

- 상태: **현재 소스 구현, 운영 DB 적용·배포 전** (2026-11-18).
- 진입 경로: `/admin/growth/business-plan/`. Web 관리자 성장 메뉴와 운영 화면에서 전체 문서 탐색으로 연다.
- 독립 Admin 빌드를 Web 출력 폴더의 같은 경로에 조립한다. 서비스 워커는 페이지·전용 자산을 캐시하지 않는다.
- `GET /api/admin/me`와 보드 API가 모두 활성 `admin`을 확인한다. `operator`는 접근할 수 없다.
  같은 관리자의 재검사 중에는 초안을 숨겨 보존하고, 다른 계정·로그아웃·401/403에는 화면 기록을 제거한다.
- 11개 기본 작업의 6상태, 주장별 사실 확인과 최신성, 원문·교차검증·전망 가정과 산식,
  문서 변경 전후·작업용·제출용 사본, 멘토 요청, 수동·자동 제출 점검을 한 화면에서 관리한다.
- 수치·시장 규모·비교표는 필수 근거가 확인되지 않으면 `미확인`으로 표시한다. 검증한 매출 전망도
  `가정·산식 검토`로 표시한다. 출처 링크나 JSON 형식 통과만으로 사실 확인을 완료하지 않는다.
- 실제 사업 문단·멘토 원문·개인 링크·확인되지 않은 수치는 공개 소스에 넣지 않는다. 처음에는 빈 양식을
  표시하며, Sites 보드의 `schemaVersion: 1` JSON은 검토와 현재 기록 백업 후 가져올 수 있다.
- `GET /api/admin/business-plan`은 저장된 정본과 서버 revision을 읽는다. 최초 빈 응답만 새 양식으로
  처리하며 읽기 실패·손상 데이터·미적용 migration을 정상 빈 기록으로 대체하지 않는다.
- `POST /api/admin/business-plan/save`는 명시적 저장이다. 2MiB 이하 JSON과 모든 참조·상태를 검사하고,
  `expectedRevision` 충돌을 409로 거부한다. 실패한 요청은 같은 `mutationId`와 본문으로 재시도하며,
  그 뒤 추가한 편집은 재시도 성공 후 별도로 저장한다. 충돌에는 JSON 백업과 최신본 읽기를 제공한다.
- 관리자용 공용 보드의 정본·불변 버전·감사 digest·멱등 영수증을 별도 테이블에 원자적으로 저장한다.
  이력의 actor와 시각은 서버에서 결정한다. 임의 `x-user-id`를 인증 주체로 사용하지 않는다.
- 코드 수정·외부 제출·계정 설정 변경·외부 배포는 고정 `승인 대기` 메모만 관리한다. 실행 API가 없다.

### DB 적용과 실패 처리

`0123_admin_business_plan.sql`은 새 테이블·인덱스·제약만 추가하며 실행 이력을 보존한다.
기존 테이블이나 사용자 역할을 변경하지 않는다. 배포 담당자는 별도 승인된 SHA와 인프라 지도에 따라
정식 migration 절차를 수행한 뒤 API·정적 웹을 배포해야 한다. 이 문서와 코드 병합은 그 실행 승인이 아니다.

적용하지 않은 DB에서는 API가 503을 반환하고 UI는 기존 기록을 초기화하지 않는다. 장애 시 이전 앱 이미지로
돌아가거나 기능 진입을 중단하며, 추가된 테이블과 기존 보드 이력은 유지한다. 자동 DROP·역방향 migration은 없다.
재적용 검증은 분리된 테스트 DB에서만 수행한다. 실제 사업자료 이전은 인증된 화면의 JSON 가져오기를 사용한다.

검증 명령은 저장소 루트에서 `pnpm typecheck:admin`, `pnpm build:admin`,
`pnpm exec vitest run apps/admin-web/src packages/contracts/src/business-plan apps/api/src/modules/business-plan/business-plan.test.ts`,
`pnpm test:admin:e2e`다. API의 `business-plan.integration.test.ts`는 분리된 PostgreSQL의
`TEST_DATABASE_URL`이 필요하며 실제 잠금·동시 저장·멱등 재시도·migration 재실행을 검증한다.
