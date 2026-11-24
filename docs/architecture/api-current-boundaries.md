# API 현재 폴더 경계

> 현재 기준일: 2026-11-24

## 목표

`apps/api/src`는 HTTP 진입점과 도메인 모듈, 런타임 플랫폼을 분리한다.

```text
apps/api/src/
├── app.ts / app.module.ts / main.ts
├── modules/                 # 도메인·기능별 Nest 모듈
├── platform/
│   ├── http/                # 예외 필터, validation, 요청 경계
│   ├── adapters/            # 외부 서비스·스토리지·큐·capability adapter
│   ├── database/            # Drizzle schema, migration, DB connection
│   └── federated-data-plane/
├── runtime/                 # 프로세스 런타임 조립
├── realtime/                # realtime transport
└── server/                  # 아직 도메인별 모듈 전환이 필요한 legacy service
```

## 금지되는 신규 루트

- `src/common`
- `src/infrastructure`
- `src/db`

새 공통 HTTP/플랫폼 코드는 `platform` 아래에 둔다. DB migration과 schema는 `platform/database`가 단일 소유권이다.

## 관리자 DB 스키마 (current, 2026-11-18)

`platform/database/schema/admin.schema.ts`는 관리자 테이블과 NestJS 검증 보드·변경 이력의
Drizzle 정의를 소유한다. 같은 파일의 `ADMIN_SCHEMA_COLUMNS_SQL`·`ADMIN_SCHEMA_INDEXES_SQL`은
기존 관리자 테이블의 읽기 전용 정합성 검사이며, health readiness·DB 통합 테스트·운영 migration의
권한 검사 스크립트가 함께 소비한다. 보드의 권한·이력 불변성 검사는 전용 DB 계약을 유지한다.
DDL은 기존과 같이 `platform/database/migrations`의 순차 migration으로만 적용한다.

## 1R 최종 제출 점검 저장 (migration, 2026-11-24)

`modules/final-submission`은 현재 활성 관리자·운영자의 개인 보드 접근과 저장을 소유한다.
본문·불변 감사·멱등 영수증의 세 테이블은 추가형
`platform/database/migrations/0134_admin_final_submission.sql`이 선언한다.
운영 migration 러너와 배포 전 드리프트 검사는 이 정본 디렉터리의 순서·전수 목록을 강제하므로,
파일 수를 줄이기 위해 SQL을 도메인 모듈로 옮기거나 기존 migration에 합치지 않는다.

사용자가 요청한 전용 영속 저장에 필요한 불변 SQL 한 파일만 파일 수 원장의
`apiDatabaseFiles`에 185→186으로 반영한다. 기존 SQL `0001`~`0133`과 체크섬, 다른 예산과
검증 기준은 유지한다. CI 리뷰 DB 준비에도 migration과 여섯 이력 보호 트리거를 등록한다.
소스 통합·격리 DB 검증 이후 운영 DB 적용과 onpod 이미지 교체는 별도 승인 대기이며,
요청 처리나 앱 시작에서 DDL을 실행하지 않는다.

## 남은 server 전환

`src/server`의 파일(2026-10-08 기준 `.ts` 67개, 그중 테스트 19개)은 인증·creator·community·catalog 등 여러 도메인의 서비스가 혼합되어 있어 일괄 이동하지 않는다. 각 도메인 모듈이 해당 서비스의 유일한 소비자가 된 뒤 파일 단위로 `modules/<domain>`으로 이전한다.

## Core 경계

`packages/core/src/server`는 서버 전용 계층이 아니라 브라우저/API가 공유하는 catalog read-model이었다. 현재 `packages/core/src/catalog`으로 통합했으며 소비자는 `@toonstudio/core/catalog`을 사용한다.

## 검증

```bash
node scripts/validate-source-layout.mjs
node scripts/validate-app-boundaries.mjs
./node_modules/.bin/tsc -p apps/api/tsconfig.json --pretty false
```
