# 운영 비용 0원 로컬 풀스택 테스트 인프라 가이드 (v2)

- 상태: **current**
- 기준일: **2026-11-21**
- 권위 구현:
  - [local-object-storage-emulator.mjs](../../scripts/local-object-storage-emulator.mjs) (로컬 S3/R2 호환 HTTP 오브젝트 스토리지 에뮬레이터)
  - [local-studio-seed-pack.mjs](../../scripts/local-studio-seed-pack.mjs) (6인 산업형 분업 스튜디오 로컬 시드 팩)
  - [local-test-stack.mjs](../../scripts/local-test-stack.mjs) (로컬 스택 실행기)
  - [verify-local-full-stack.mjs](../../scripts/verify-local-full-stack.mjs) (로컬 풀스택 통합 스모크 러너)
- 연관 문서: [local-fullstack-verification.md](./local-fullstack-verification.md) (인증·Playwright 전용 하네스)
- 운영 영향: **없음.** 모든 DB·오브젝트 스토리지·API·Web 프로세스는 `127.0.0.1` loopback에서만 동작하며 운영 DB·R2·도메인·클라우드 API 호출이 0건이다.

## 1. 목적과 설계 원칙

개발자 로컬 머신(macOS Apple Silicon 포함)에서 Docker Desktop이나 외부 클라우드 DB·R2 버킷 없이도
**로컬 S3/R2 호환 오브젝트 스토리지 에뮬레이터 + 로컬 PostgreSQL 17 + 스키마 부트스트랩/기본·6인 분업 시드 + NestJS API + Vite Web**
1세트를 원커맨드로 띄우고 바이너리 원고 왕복·DB 연동·인증·웹 프록시까지 끝까지 검증한다.

- **외부 의존성 0개 로컬 오브젝트 스토리지 에뮬레이터**: 순수 Node `node:http` + `node:fs` + `node:crypto`로 `127.0.0.1`(기본 포트 `59000`)에서 동작하며 `PUT`/`GET`/`HEAD`/`DELETE /objects/:bucket/*`, `GET /objects/:bucket(?prefix=)`, `GET /health`를 제공한다. 업로드 시 SHA-256 `ETag`/`X-Content-SHA256`를 반환하고, 원시 경로·파일시스템 `resolve` 이중 경로 탐색(`..`, `%2e%2e`, `\`, 제어문자) 차단과 단일 객체(`16 MiB`)·전체 누적(`128 MiB`) 용량 상한을 강제한다.
- **6인 산업형 분업 스튜디오 시드 팩**: `studio-pd`(PD)·`studio-ad`(AD)·`studio-line`(선화)·`studio-color`(채색)·`studio-bg3d`(3D배경)·`studio-letterer`(식자) 6인 팀과 샘플 3화(`studio-ep-1..3`), 겹침·누락 0건의 9개 컷 슬라이스(`1..25`, `26..50`, `51..75`), OKLCH 5색 아트바이블(`studio-art-bible-neon-seoul`)을 로컬 일회용 DB에 멱등 주입한다. 실제 DB의 `pg_catalog.pg_tables`와 `information_schema.columns`를 먼저 조회해 존재하는 테이블만 안전하게 채우며 기존 [seed.ts](../../apps/api/src/platform/database/seed.ts) 데이터와 충돌 없이 공존한다.
- **Docker 없이 macOS 네이티브 실행**: `/opt/homebrew/opt/postgresql@17/bin`(및 `@16`/`@18`, `/usr/local/opt/postgresql@17/bin`, `/opt/homebrew/bin`, `PATH`)에서 `initdb`·`pg_ctl`·`psql`을 자동 탐지하고, macOS `LC_ALL=C`/`LANG=C` 및 `initdb --locale=C -E UTF8` 고정으로 멀티스레드 시작 오류를 예방한다.
- **운영과 동일한 분리 역할 ACL 검증**: [bootstrap-empty-production-database.mjs](../../scripts/bootstrap-empty-production-database.mjs)를 `--allow-loopback` 모드로 실행해 `pg_trgm`, Drizzle 기본 DDL, 이력·선행 마이그레이션, 최소권한 런타임 역할(`toonstudio_runtime`) ACL까지 그대로 적용한다.
- **실행 후 누수 0건 정리**: 스모크 러너(`local:test:smoke`)는 정상 완료·실패·`SIGINT`/`SIGTERM` 어떤 경로로 끝나든 Web → API → 오브젝트 스토리지 에뮬레이터 → PostgreSQL 순으로 종료하고 임시 디렉터리(DB 클러스터·스토리지 저장소)를 100% 삭제한 뒤 4포트(`db`·`api`·`web`·`storage`) 해제를 모두 확인한다.

## 2. 명령어 요약

저장소 루트에서 실행한다.

| 명령어 | 동작 | 종료 방식 |
| --- | --- | --- |
| `pnpm run local:test` | 일회용 로컬 DB(`55432`) + 오브젝트 스토리지(`59000`) + NestJS API(`4001`) + Vite Web(`5173`) 기동(기존 기동 서버 재사용) | `Ctrl+C`까지 유지 |
| `pnpm run local:test:seed` | 일회용 로컬 DB 스키마 부트스트랩 + [seed.ts](../../apps/api/src/platform/database/seed.ts) 기본 시드 주입 후 스택 기동(`--studio-seed` 추가 시 6인 분업 시드 팩 포함) | `Ctrl+C`까지 유지 |
| `pnpm run local:test:seed -- --seed-only --studio-seed` | 일회용 로컬 DB 준비 + 기본 시드 + 6인 분업 시드 팩 주입만 수행 | 완료 즉시 종료(`exit 0`) |
| `pnpm run local:test:check` | 기동 없이 API(`/api/health/live`, `/api/health/ready`)·Web·Storage(`/health`)·로컬 PG 상태 점검(`--json` 지원) | 정상 시 `0`, 미기동 시 `1` |
| `pnpm run local:test:smoke` | 완전 격리 로컬 오브젝트 스토리지 + 로컬 PG + 스키마 + 기본/6인 분업 시드 + API/DB/인증 + Vite 프록시 일괄 검증 후 100% 정리 및 JSON 실측 리포트 출력 | 검증 통과 시 `0`, 실패 시 `1` |
| `node scripts/local-object-storage-emulator.mjs --port 59000` | 로컬 S3/R2 호환 오브젝트 스토리지 에뮬레이터 단독 기동(`--port 0` 동적 포트 지원) | `Ctrl+C` 시 임시 디렉터리 자동 삭제 |

### 주요 옵션

- `local-test-stack.mjs` (`local:test`, `local:test:seed`, `local:test:check`):
  - `--db-port N`, `--api-port N`, `--web-port N`, `--storage-port N`: 4종 포트 지정(하나라도 겹치면 즉시 오류). 기본값 외 `--db-port`를 쓰면 클러스터 경로와 Docker 컨테이너 이름도 포트별로 분리된다.
  - `--db-backend auto|local|docker`: 일회용 DB 백엔드 선택(기본 `auto` — Docker가 꺼져 있으면 Homebrew 로컬 클러스터 자동 사용).
  - `--seed`, `--studio-seed`, `--seed-only`: 스크립트가 직접 만든 로컬 일회용 DB(`127.0.0.1`)에만 기본 시드 및 6인 분업 스튜디오 시드 팩 주입.
  - `--reset-db`: 기존 일회용 DB 클러스터/컨테이너를 삭제하고 새로 초기화.
  - `--json`: 진행 로그는 `stderr`로 보내고 상태 요약 JSON만 `stdout`에 출력.
- `verify-local-full-stack.mjs` (`local:test:smoke`):
  - `--db-port N`, `--api-port N`, `--web-port N`, `--storage-port N`: 4종 포트 고정 지정(미지정 시 `55439`·`4019`·`5189`·`59019`부터 빈 포트 자동 탐색).
  - `--timeout-ms N`: API/Web 기동 대기 상한(ms, 기본 `180000`).
  - `--skip-web`: Vite Web 서버 검증 생략(스토리지 + DB + API 구간만 빠르게 점검).
  - `--json`: 진행 로그를 숨기고 최종 JSON 리포트만 `stdout`에 출력.

## 3. 절대 안전 경계 (FAIL-CLOSED)

1. **환경 파일 무접근**: `.env`와 `.env.infrastructure.local`을 읽거나 쓰거나 출력하지 않는다. 자식 API와 시드 프로세스에는 `API_LOCAL_ENV_FILE_ENABLED=false`를 강제해 `.env.local` 자동 로드도 차단한다.
2. **원격 DB 보호(`isRemoteDatabaseUrl`, `assertDisposableSeedAllowed`, `assertLocalStudioSeedAllowed`)**:
   - `127.0.0.1`, `localhost`, `[::1]` 외의 모든 호스트, 비-PostgreSQL 프로토콜, `?host=`/`?hostaddr=`/`?service=` 같은 libpq 호스트 우회 쿼리를 원격으로 판정해 차단한다.
   - 호출 셸에 외부 `DATABASE_URL`이 설정돼 있으면 원격·로컬 여부를 막론하고 `--seed`와 6인 분업 시드 팩을 즉시 거부한다.
3. **루프백 전용 스토리지 격리(`assertLoopbackStorageHost`, `parseRawObjectRequest`, `resolveConfinedPath`)**:
   - 오브젝트 스토리지 에뮬레이터는 `127.0.0.1` 바인딩만 허용하며 운영 R2/S3 자격증명을 주입하지 않는다(`buildDisposableApiEnv`는 `LOCAL_OBJECT_STORAGE_ENDPOINT`만 전달).
   - 원시 요청 경로의 `..`, `%2e%2e`, `\`, NUL 문자와 파일시스템 `resolve` 경계 이탈을 이중 차단하고, 단일 객체·총량 한도 초과 시 `413 Payload Too Large`로 거절한다.
4. **허용 목록 자식 환경(`buildIsolatedLocalEnv`)**: 호스트 셸의 클라우드·AI·OAuth·DB·R2 토큰은 자식 프로세스로 전달하지 않고 `PATH`·`HOME`·`TMPDIR` 등 최소 실행 변수와 로컬 일회용 설정만 주입한다.
5. **비밀값 미출력**: 세션 서명키·state 서명키는 실행 시 메모리에만 32바이트 난수로 생성하고, 로그인 스모크에서 발급된 HttpOnly 세션 쿠키 원문과 비밀번호는 로그·JSON 리포트에 기록하지 않는다.
6. **시드 불변식·멱등성 보정**: 기본 시드 직후 `creator_work_revision` 불변식을 멱등 보정하고, 6인 분업 시드 팩은 `ON CONFLICT DO NOTHING`과 스모크 내 2회 연속 적용으로 멱등성과 기존 시드 공존을 보장한다.

## 4. `local:test:smoke` 검증 단계와 항목 (v2)

| 순서 | 단계 | 검증 내용 |
| --- | --- | --- |
| 1 | `object_storage_startup` | `127.0.0.1:59019`에 임시 디렉터리(`<TMPDIR>/ts-pg-XXXXXX/obj`) 기반 로컬 S3/R2 에뮬레이터 기동 |
| 2 | `object_storage_verification` | `/health` 200, 원시 `..`/`%2e%2e` 경로 탐색 `400` 차단, 바이너리 PNG 원고(`2,112 B`) `PUT` → SHA-256 `ETag` 검증 → `HEAD` → `LIST(?prefix=)` → `GET` 바이트 일치·SHA-256 재계산 → `DELETE` → 삭제 후 `404` 확인 |
| 3 | `postgres_cluster` | Homebrew `postgresql@17`로 짧은 임시 경로(`<TMPDIR>/ts-pg-XXXXXX/pg`, macOS AF_UNIX 104B 제한 회피)에 `127.0.0.1` 전용 클러스터 기동 |
| 4 | `schema_bootstrap` | `db:bootstrap:production-empty --execute --allow-loopback`으로 289개 public 테이블·마이그레이션·`toonstudio_runtime` ACL 구성 |
| 5 | `local_seed` | `pnpm db:seed` + `creator_work_revision` 보정 + 6인 분업 스튜디오 시드 팩 2회 연속(멱등) 적용 후 핵심 시드 11종 테이블 행 수와 6인 팀(`studio-pd`~`studio-letterer`)·3화(`studio-ep-1..3`)·9개 컷 슬라이스·5색 OKLCH 아트바이블·기본 시드 공존 정합성 실측 확인 |
| 6 | `api_startup` | `toonstudio_runtime` 역할 + `LOCAL_OBJECT_STORAGE_ENDPOINT` 환경으로 NestJS API 기동 및 `/api/health/live` · `/api/health/ready` 200 확인 |
| 7 | `api_db_verification` | `/api/health/capabilities`, `/api/titles?limit=5`, `/api/creator/works`(`seed-work-1` 및 `studio-ep-1` 동시 확인), `/api/community/cafes`, `/api/auth/providers`, CSRF 미포함 로그인 403 차단, `tester@toonstudio.dev` 및 `studio-pd@toonstudio.dev` 로그인→HttpOnly 쿠키→세션 일치→로그아웃→세션 폐기 검증 |
| 8 | `web_startup` & `web_proxy_verification` | Vite 개발 서버를 `127.0.0.1` 전용으로 기동해 `/` HTML 200 및 프록시 `/api/health/live`·`/api/health/ready`·`/api/creator/works` 200 확인 |
| 9 | `cleanup` | Web·API 프로세스 그룹 종료, 오브젝트 스토리지 에뮬레이터 종료 및 임시 저장소 삭제(`storageRemoved: true`), `pg_ctl stop` 종료, 임시 루트 삭제(`clusterRemoved: true`), 4포트(`db`·`api`·`web`·`storage`) 해제 확인 후 JSON 리포트 출력 |

## 5. 실측 검증 근거 (2026-11-21)

- 환경: macOS Apple Silicon (`aarch64-apple-darwin25.6.0`), Node `v24.22.1`, pnpm `11.4.0`, Homebrew `PostgreSQL 17.11` (`/opt/homebrew/opt/postgresql@17/bin`), Docker Desktop 미실행 상태.
- 실행 명령: `pnpm run local:test:smoke`
- 종합 판정: **`ok: true` (`exit 0`, 총 43.4초 · 9/9 단계 PASS · 17/17 검증 항목 PASS · `zeroProductionCalls: true` · `loopbackOnly: true`)**
  - `object_storage_startup` / `object_storage_verification`: `2 ms` / `34 ms` (`127.0.0.1:59019`, `2,112 B` PNG SHA-256 `139b396ee00395f1d1d7eec085eeec5d975c3c99e7d4d6496a6820b7014eef74`, `traversalBlocked: true`, `deletedVerified: true`)
  - `postgres_cluster`: `1,123 ms` (`127.0.0.1:55439`)
  - `schema_bootstrap`: `25,593 ms` (`publicTableCount = 289`)
  - `local_seed`: `2,623 ms` (`user=15`, `creator_work=6`, `creator_work_revision=6`, `creator_series=2`, `community_cafe=2`, `fan_post=4`, `review=28`, `rating=51`, `collection=3`, `feedback_post=3`, `toonspectrum_schema_migration=13`; 6인 분업 시드 15개 테이블 적용 · `teamMemberCount=6` · `episodeCount=3` · `collaboratorCount=15` · `cutSliceCount=9` · `artBibleTokenCount=5` · `baseSeedCoexists=true` · `idempotentVerified=true` · 미생성 선택 테이블 `production_cut_slice` 안전 건너뜀)
  - `api_startup`: `10,067 ms` (`127.0.0.1:4019`)
  - `api_db_verification`: `219 ms` (10개 항목 전부 PASS, `seed-tester` 로그인 왕복 `95 ms`, `studio-pd` 로그인 왕복 `75 ms`)
  - `web_startup` / `web_proxy_verification`: `3,032 ms` / `312 ms` (`127.0.0.1:5189`, `/` HTML `10,356 B`, 프록시 3종 모두 200, `/api/creator/works` `workCount=4`)
  - `cleanup`: `clusterRemoved: true`, `storageRemoved: true`, `portsReleased: { db: true, api: true, web: true, storage: true }`

## 6. 기존 인증 하네스와의 역할 구분 및 장애 대응

- **역할 구분**:
  - `pnpm run local:test` / `local:test:seed` / `local:test:smoke`: macOS Homebrew PostgreSQL 17 또는 Docker 기반의 일상 개발·로컬 오브젝트 스토리지·6인 분업 시드·원커맨드 풀스택 스모크 용도. `.env.infrastructure.local`을 건드리지 않고 매 실행 완전 정리한다.
  - [local-fullstack-verification.md](./local-fullstack-verification.md) (`scripts/local-fullstack/cli.mjs`): Linux 임베디드 PostgreSQL + Playwright 브라우저 E2E + 누출 검사(`leakcheck`)까지 포함한 인증 심층 검증 하네스.
- **자주 만나는 오류와 조치**:
  - `로컬 PostgreSQL 바이너리(initdb/pg_ctl/psql)를 찾을 수 없습니다`: macOS에서는 `brew install postgresql@17` 후 재실행하거나 `POSTGRES_BIN_DIR=/opt/homebrew/opt/postgresql@17/bin`을 지정한다.
  - `포트 N이 이미 사용 중입니다`: `--db-port`/`--api-port`/`--web-port`/`--storage-port`로 빈 포트를 지정한다(`local:test:smoke`는 포트 미지정 시 빈 포트를 자동 선택한다).
  - `원격 DATABASE_URL에는 --seed를 실행할 수 없습니다`: 셸에서 `unset DATABASE_URL` 후 다시 실행한다.
