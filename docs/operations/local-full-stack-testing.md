# 운영 비용 0원 로컬 풀스택 테스트 인프라 가이드

- 상태: **current**
- 기준일: **2026-11-21**
- 권위 구현: [local-test-stack.mjs](../../scripts/local-test-stack.mjs), [verify-local-full-stack.mjs](../../scripts/verify-local-full-stack.mjs)
- 연관 문서: [local-fullstack-verification.md](./local-fullstack-verification.md) (인증·Playwright 전용 하네스)
- 운영 영향: **없음.** 모든 DB·API·Web 프로세스는 `127.0.0.1` loopback에서만 동작하며 운영 DB·도메인·클라우드 API 호출이 0건이다.

## 1. 목적과 설계 원칙

개발자 로컬 머신(macOS Apple Silicon 포함)에서 Docker Desktop이나 외부 클라우드 DB 없이도
**로컬 PostgreSQL 17 + 스키마 부트스트랩/시드 + NestJS API + Vite Web** 1세트를 원커맨드로 띄우고
실제 DB 연동과 프록시까지 끝까지 검증한다.

- **Docker 없이 macOS 네이티브 실행**: `/opt/homebrew/opt/postgresql@17/bin`(및 `@16`/`@18`, `/usr/local/opt/postgresql@17/bin`, `/opt/homebrew/bin`, `PATH`)에서 `initdb`·`pg_ctl`·`psql`을 자동 탐지한다.
- **macOS PostgreSQL 17 안정화**: macOS(Darwin 25+)에서 `LC_ALL` 미설정 시 발생하는 `postmaster became multithreaded during startup` 오류를 막기 위해 `initdb --locale=C -E UTF8`과 `LC_ALL=C`/`LANG=C`로 클러스터를 초기화·기동한다.
- **운영과 동일한 분리 역할 ACL 검증**: [bootstrap-empty-production-database.mjs](../../scripts/bootstrap-empty-production-database.mjs)를 `--allow-loopback` 모드로 실행해 `pg_trgm`, Drizzle 기본 DDL, 이력·선행 마이그레이션, 최소권한 런타임 역할(`toonstudio_runtime`) ACL까지 그대로 적용한다.
- **실행 후 누수 0건 정리**: 스모크 러너(`local:test:smoke`)는 정상 완료·실패·`SIGINT`/`SIGTERM` 어떤 경로로 끝나든 Web → API → PostgreSQL 프로세스 그룹을 종료하고 임시 디렉터리를 삭제한 뒤 세 포트(`DB`·`API`·`Web`)가 모두 해제됐는지 확인한다.

## 2. 명령어 요약

저장소 루트에서 실행한다.

| 명령어 | 동작 | 종료 방식 |
| --- | --- | --- |
| `pnpm run local:test` | 일회용 로컬 DB(55432) + NestJS API(4001) + Vite Web(5173) 기동(기존 기동 서버는 재사용) | `Ctrl+C`까지 유지 |
| `pnpm run local:test:seed` | 일회용 로컬 DB 스키마 부트스트랩 + [seed.ts](../../apps/api/src/platform/database/seed.ts) 샘플 시드 1회 주입 후 API + Web 기동 | `Ctrl+C`까지 유지 |
| `pnpm run local:test:seed -- --seed-only` | 일회용 로컬 DB 준비 + 스키마 부트스트랩 + 샘플 시드 주입만 수행 | 완료 즉시 종료(`exit 0`) |
| `pnpm run local:test:check` | 기동 없이 API(`/api/health/live`, `/api/health/ready`)·Web·로컬 PG 상태 점검(`--json` 지원) | 정상 시 `0`, 미기동 시 `1` |
| `pnpm run local:test:smoke` | 완전 격리 일회용 로컬 PG + 스키마 + 시드 + API + DB 조회/인증 + Vite 프록시 일괄 검증 후 100% 정리 및 JSON 실측 리포트 출력 | 검증 통과 시 `0`, 실패 시 `1` |

### 주요 옵션

- `local-test-stack.mjs` (`local:test`, `local:test:seed`, `local:test:check`):
  - `--db-port N`, `--api-port N`, `--web-port N`: 포트 충돌 회피용 커스텀 포트 지정(서로 겹치면 즉시 오류). 기본값 외 `--db-port`를 쓰면 클러스터 경로와 Docker 컨테이너 이름도 포트별로 분리된다.
  - `--db-backend auto|local|docker`: 일회용 DB 백엔드 선택(기본 `auto` — Docker가 꺼져 있으면 Homebrew 로컬 클러스터 자동 사용).
  - `--seed`, `--seed-only`: 스크립트가 직접 만든 로컬 일회용 DB(`127.0.0.1`)에만 시드 주입.
  - `--reset-db`: 기존 일회용 DB 클러스터/컨테이너를 삭제하고 새로 초기화.
  - `--json`: 진행 로그는 `stderr`로 보내고 상태 요약 JSON만 `stdout`에 출력.
- `verify-local-full-stack.mjs` (`local:test:smoke`):
  - `--db-port N`, `--api-port N`, `--web-port N`: 포트 고정 지정(미지정 시 `55439`·`4019`·`5189`부터 빈 포트 자동 탐색).
  - `--timeout-ms N`: API/Web 기동 대기 상한(ms, 기본 `180000`).
  - `--skip-web`: DB + API 구간만 빠르게 점검.
  - `--json`: 진행 로그를 생략하고 최종 JSON 리포트만 `stdout`에 출력.

## 3. 절대 안전 경계 (FAIL-CLOSED)

1. **환경 파일 무접근**: `.env`와 `.env.infrastructure.local`을 읽거나 쓰거나 출력하지 않는다. 자식 API와 시드 프로세스에는 `API_LOCAL_ENV_FILE_ENABLED=false`를 강제해 `.env.local` 자동 로드도 차단한다.
2. **원격 DB 보호(`isRemoteDatabaseUrl`, `assertDisposableSeedAllowed`)**:
   - `127.0.0.1`, `localhost`, `[::1]` 외의 모든 호스트, 비-PostgreSQL 프로토콜, `?host=`/`?hostaddr=`/`?service=` 같은 libpq 호스트 우회 쿼리를 원격으로 판정해 차단한다.
   - 호출 셸에 외부 `DATABASE_URL`이 설정돼 있으면 원격·로컬 여부를 막론하고 `--seed`를 즉시 거부한다.
3. **허용 목록 자식 환경(`buildIsolatedLocalEnv`)**: 호스트 셸의 클라우드·AI·OAuth·DB 토큰은 자식 프로세스로 전달하지 않고 `PATH`·`HOME`·`TMPDIR` 등 최소 실행 변수와 로컬 일회용 설정만 주입한다.
4. **비밀값 미출력**: 세션 서명키·state 서명키는 실행 시 메모리에만 32바이트 난수로 생성하고, 로그인 스모크에서 발급된 HttpOnly 세션 쿠키 원문과 비밀번호는 로그·JSON 리포트에 기록하지 않는다.
5. **시드 불변식 보정**: `seedDisposableDatabase`는 `pnpm db:seed` 직후 `creator_work` 행에 대응하는 `creator_work_revision` 레코드를 멱등(`ON CONFLICT DO NOTHING`)으로 보정해 최소권한 `toonstudio_runtime` 역할이 런타임 DDL 보정을 시도하지 않도록 보장한다.

## 4. `local:test:smoke` 검증 단계와 항목

| 순서 | 단계 | 검증 내용 |
| --- | --- | --- |
| 1 | `postgres_cluster` | Homebrew `postgresql@17`로 짧은 임시 경로(`<TMPDIR>/ts-pg-XXXXXX/pg`, macOS AF_UNIX 104B 제한 회피)에 `127.0.0.1` 전용 클러스터 기동 |
| 2 | `schema_bootstrap` | `db:bootstrap:production-empty --execute --allow-loopback`으로 289개 public 테이블·마이그레이션·`toonstudio_runtime` ACL 구성 및 capability 검증 |
| 3 | `local_seed` | `pnpm db:seed` + `creator_work_revision` 보정 후 `psql`로 전체 테이블 수와 핵심 시드 테이블 11종 행 수(`> 0`) 실측 확인 |
| 4 | `api_startup` | `toonstudio_runtime` 역할로 NestJS API 기동 및 `/api/health/live` 200 · `/api/health/ready` 200 확인 |
| 5 | `api_db_verification` | `/api/health/capabilities`, `/api/titles?limit=5`, `/api/creator/works`, `/api/community/cafes`, `/api/auth/providers`, CSRF 미포함 로그인 403 차단, 시드 계정(`tester@toonstudio.dev`) 로그인 → HttpOnly 쿠키 → `/api/auth/session` 일치 → 로그아웃 → 세션 폐기 검증 |
| 6 | `web_startup` & `web_proxy_verification` | Vite 개발 서버를 `127.0.0.1` 전용으로 기동해 `/` HTML 200 및 프록시 `/api/health/live`·`/api/health/ready`·`/api/creator/works` 200 확인 |
| 7 | `cleanup` | Web·API 프로세스 그룹 종료, `pg_ctl stop` 종료, 임시 디렉터리 삭제, DB·API·Web 세 포트 해제 확인 후 JSON 리포트 출력 |

## 5. 실측 검증 근거 (2026-11-21)

- 환경: macOS Apple Silicon (`aarch64-apple-darwin25.6.0`), Node `v24.22.1`, pnpm `11.4.0`, Homebrew `PostgreSQL 17.11` (`/opt/homebrew/opt/postgresql@17/bin`), Docker Desktop 미실행 상태.
- 실행 명령: `pnpm run local:test:smoke`
- 종합 판정: **`ok: true` (`exit 0`, 총 71.1초 · 7/7 단계 PASS · 14/14 검증 항목 PASS · 운영 호출 0건)**
  - `postgres_cluster`: `1,877 ms`
  - `schema_bootstrap`: `35,885 ms` (`publicTableCount = 289`)
  - `local_seed`: `5,083 ms` (`user=9`, `creator_work=3`, `creator_work_revision=3`, `creator_series=1`, `community_cafe=2`, `fan_post=4`, `review=28`, `rating=51`, `collection=3`, `feedback_post=3`, `toonspectrum_schema_migration=13`)
  - `api_startup`: `19,473 ms` (`127.0.0.1:4019`)
  - `api_db_verification`: `367 ms` (9개 항목 전부 PASS, 로그인→세션→로그아웃 209 ms)
  - `web_startup`: `5,057 ms` (`127.0.0.1:5189`)
  - `web_proxy_verification`: `1,641 ms` (`/` HTML 10,356 B, 프록시 3종 모두 200)
  - `cleanup`: `clusterRemoved: true`, `portsReleased: { db: true, api: true, web: true }`

## 6. 기존 인증 하네스와의 역할 구분 및 장애 대응

- **역할 구분**:
  - `pnpm run local:test` / `local:test:seed` / `local:test:smoke`: macOS Homebrew PostgreSQL 17 또는 Docker 기반의 일상 개발·원커맨드 풀스택 스모크 용도. `.env.infrastructure.local`을 건드리지 않고 매 실행 완전 정리한다.
  - [local-fullstack-verification.md](./local-fullstack-verification.md) (`scripts/local-fullstack/cli.mjs`): Linux 임베디드 PostgreSQL + Playwright 브라우저 E2E + 누출 검사(`leakcheck`)까지 포함한 인증 심층 검증 하네스.
- **자주 만나는 오류와 조치**:
  - `로컬 PostgreSQL 바이너리(initdb/pg_ctl/psql)를 찾을 수 없습니다`: macOS에서는 `brew install postgresql@17` 후 재실행하거나 `POSTGRES_BIN_DIR=/opt/homebrew/opt/postgresql@17/bin`을 지정한다.
  - `포트 N이 이미 사용 중입니다`: `--db-port`/`--api-port`/`--web-port`로 빈 포트를 지정한다(`local:test:smoke`는 포트 미지정 시 빈 포트를 자동 선택한다).
  - `원격 DATABASE_URL에는 --seed를 실행할 수 없습니다`: 셸에서 `unset DATABASE_URL` 후 다시 실행한다.
