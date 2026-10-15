# 로컬 풀스택 하네스 (`scripts/local-fullstack`)

상태: **current** (2026-10-15 기준, Linux x64 샌드박스에서 실제 실행으로 검증)

임베디드 PostgreSQL + API(Nest) + 웹(Vite)을 **내 컴퓨터의 127.0.0.1 에만** 띄우고, 이메일 인증이 끝난 시드
테스트 계정으로 로그인 흐름을 검증한다. 운영 DB·운영 도메인에는 접속하지 않으며, 운영 검증을 대체하지 않는다.
상세 목적·성공 기준·실패 조치는 [`docs/operations/local-fullstack-verification.md`](../../docs/operations/local-fullstack-verification.md)를 본다.

## 왜 필요한가

- 운영 `/api/auth/providers` 는 `email.available=false`(`reason=disabled`)이고 로그인은 Google/GitHub/Kakao/Naver
  OAuth 뿐이라 운영에 이메일 테스트 계정을 만들 수 없다. 이메일 모드는 `disabled | resend` 두 가지뿐이며
  가입 핸들러는 발송 설정이 없으면 거부한다(`apps/api/src/server/auth-email.ts`, `auth.controller.ts`).
- 도커 데몬이 없는 환경(샌드박스·CI 러너)에서도 같은 절차로 인증 흐름과 안정성을 검증할 수 있어야 한다.

`pnpm local:test`(`scripts/local-test-stack.mjs`)와의 차이: 그쪽은 docker 또는 시스템 `initdb` 가 있어야 하고
고정 비밀번호를 쓰며 시드를 하지 않는다. 이 하네스는 npm 의 `embedded-postgres` 바이너리를 스택 디렉터리에만
설치해 쓰고, 비밀값을 무작위로 만들어 `.env.infrastructure.local` 에 저장하며, 시드 계정과 인증 스모크까지 포함한다.
두 도구는 서로 수정하지 않으며 같은 운영 부트스트랩 경로(`--allow-loopback`)를 쓴다.

## 전제

| 항목 | 내용 |
| --- | --- |
| Node.js | 24 이상(`package.json` engines) |
| 의존성 | 저장소 루트에서 `pnpm install` 완료 |
| 도구 | `psql`(PostgreSQL 클라이언트), `git`, `npm`(embedded-postgres 설치용) |
| 플랫폼 | Linux x64 에서 검증. macOS 는 코드 경로만 있고 미검증, Windows 는 미지원 |
| root 실행 | PostgreSQL 은 root 로 실행되지 않는다. root 이면 `unshare -U`(사용자 네임스페이스)로 비root uid 에 매핑해 실행한다. `unshare` 가 없거나 막혀 있으면 `check` 가 FAIL 로 알려 준다 |
| 네트워크 | 처음 한 번 `embedded-postgres@17.10.0-beta.17` 설치 시 npm 레지스트리 접근 필요(프록시·CA 설정은 허용 목록으로 전달) |

## 빠른 시작

```bash
# 저장소 루트에서
node scripts/local-fullstack/cli.mjs check          # 사전 점검(읽기 전용)
node scripts/local-fullstack/cli.mjs up             # DB 설치·기동 → 스키마 → 시드 계정 → API → 웹 → 헬스 대기
node scripts/local-fullstack/cli.mjs smoke          # API 인증 스모크: PASS/FAIL 표
node scripts/local-fullstack/cli.mjs e2e            # 브라우저 인증 스모크(Playwright, 선택)
node scripts/local-fullstack/cli.mjs down           # 웹·API·PostgreSQL 중지(데이터 보존)
```

- 이미 `up` 한 뒤 다시 쓸 때도 같은 명령이다. 떠 있는 구성요소는 재사용하고, 데이터는 `down` 후에도 남는다.
- 처음부터 다시 만들려면 `node scripts/local-fullstack/cli.mjs reset --yes` 후 `up` 한다.
- 모든 쓰기 명령은 `--dry-run`(up·down·reset)으로 계획만 확인할 수 있다.
- 브라우저 스모크는 Chromium 이 필요하다. 번들 Chromium 은 `pnpm exec playwright install chromium`, 이미지에 고정된
  Chromium 은 `PLAYWRIGHT_EXECUTABLE_PATH=/경로/chromium node scripts/local-fullstack/cli.mjs e2e` 로 지정한다
  (`PLAYWRIGHT_CHANNEL=chrome` 도 가능).

## 명령

| 명령 | 동작 |
| --- | --- |
| `check` | Node·psql·git·npm·`unshare`·tsx·vite·비밀 파일 권한·git 무시 여부·가드(origin·DB URL·호출 셸의 DB 환경변수)·포트를 점검(읽기 전용) |
| `up` | 전체 시작. 단계: ① 비밀 파일 기록 ② embedded-postgres 설치 ③ 클러스터 초기화·기동 ④ 스키마 ⑤ 시드 ⑥ API+헬스 ⑦ 웹+프록시 확인 |
| `down` | 웹 → API → PostgreSQL 순으로 중지. PID 재사용을 막으려고 명령줄을 확인한 뒤에만 종료 신호를 보낸다 |
| `status` | 구성요소 실행 여부·PID·포트·헬스, 기록된 비밀 키 개수(값 없음) |
| `reset --yes` | 중지 후 임베디드 DB 데이터(`pg/data`)와 스키마·시드 기록 삭제. 표식 파일이 있는 스택에서만 동작. `--rotate-secrets` 를 더하면 비밀값을 새로 만든다 |
| `smoke` | API 인증 스모크. 옵션: `--skip-web`, `--no-ratelimit-probe`, `--ratelimit-probe`, `--json` |
| `e2e` | 브라우저 스모크(`playwright.local-fullstack.config.mjs`). `--` 뒤 인자는 Playwright 로 전달 |
| `leakcheck` | 로그·상태 파일(과 `--path` 로 준 대상)에 비밀값이 남았는지 검사. 값은 출력하지 않고 키 이름·건수만 보고 |
| `db:start` `db:stop` `schema` `seed` `api:start` `api:stop` `web:start` `web:stop` | `up` 의 단계를 개별 실행 |

옵션: `--pg-port` `--api-port` `--web-port`(기본 55452 · 4101 · 5273), `--no-web`, `--dry-run`, `--yes`, `--rotate-secrets`.
종료 코드: 0 성공, 1 실패, 2 사용법 오류, 3 운영 보호 가드 중단.

## 위치와 상태

| 대상 | 위치 |
| --- | --- |
| 비밀 파일 | 주 작업트리의 `.env.infrastructure.local`(링크된 worktree 에서 실행해도 git 공통 디렉터리를 따라 같은 파일). `TOONSTUDIO_LOCAL_ENV_FILE` 로 변경 |
| 스택 디렉터리 | 기본 `<os.tmpdir()>/toonstudio-local-fullstack`. `TOONSTUDIO_LOCAL_STACK_DIR` 로 변경(값은 비밀 파일에도 기록되어 다음 실행이 같은 곳을 쓴다) |
| 설치된 PostgreSQL 바이너리 | `<스택>/tools`(`npm --prefix`. 저장소 `package.json`·lockfile 은 변경하지 않음) |
| DB 데이터 | `<스택>/pg/data`(127.0.0.1 listen, unix 소켓 없음, scram-sha-256) |
| 상태·로그 | `<스택>/state.json`(PID·포트·시각·스키마 지문만, 비밀 없음), `<스택>/logs/{postgres-initdb,postgres,api,web,schema,seed,e2e}.log`(0600) |
| 브라우저 산출물 | `<스택>/browser`(실패 시 스크린샷) |

PostgreSQL 은 일회용 로컬 DB 이므로 `fsync=off` 로 띄운다(비정상 종료 시 데이터가 깨질 수 있으며 `reset` 으로 다시 만든다).

## `.env.infrastructure.local` 키와 갱신 규칙

값은 터미널·로그·문서·커밋에 출력하지 않는다(루트 `AGENTS.md` §9). 출력은 키 이름과 길이만 쓴다.

| 키 | 용도 | 민감 |
| --- | --- | --- |
| `TOONSTUDIO_LOCAL_TEST_EMAIL` | 시드 계정 이메일(`local-qa-<hex>@toonstudio-local.test`) | 예(계정 식별자) |
| `TOONSTUDIO_LOCAL_TEST_PASSWORD` | 시드 계정 비밀번호(무작위 32자, 앱 정책 통과) | 예 |
| `TOONSTUDIO_LOCAL_TEST_USER_ID` | 시드 사용자 UUID | 예(계정 식별자) |
| `TOONSTUDIO_LOCAL_DATABASE_URL` | API 런타임 역할 DB URL(소유자가 아닌 최소 권한 역할) | 예 |
| `TOONSTUDIO_LOCAL_MIGRATION_DATABASE_URL` | 마이그레이션(소유자) 역할 DB URL. 스키마·시드 전용 | 예 |
| `TOONSTUDIO_LOCAL_AUTH_SESSION_SECRET` `TOONSTUDIO_LOCAL_AUTH_STATE_SECRET` | API 세션 JWT·OAuth state 서명키(로컬 전용 무작위 값) | 예 |
| `TOONSTUDIO_LOCAL_API_ORIGIN` `TOONSTUDIO_LOCAL_WEB_ORIGIN` | 로컬 origin(`http://127.0.0.1:포트`) | 아니오 |
| `TOONSTUDIO_LOCAL_STACK_DIR` | 스택 디렉터리 | 아니오 |

갱신 규칙:

1. 파일이 없으면 `umask 077` 로 만들고 권한 600 을 확인한다. `git check-ignore` 로 무시됨을 확인하지 못하면 쓰지 않고 중단한다.
2. **이미 있는 유효한 값은 덮어쓰지 않는다.** 없거나 형식이 깨진(너무 짧은 비밀번호 등) 키만 새로 만든다.
3. 포트를 바꾸면(`--pg-port` 등) URL·origin 의 포트만 갱신하고 비밀번호는 유지한다.
4. 다른 서비스의 키·주석은 바이트 그대로 보존한다. 이 하네스의 키는 `# --- ToonStudio 로컬 풀스택 하네스 ... ---` 블록 아래에 추가한다. 쓰기는 같은 디렉터리의 임시 파일(0600) → rename 이다.
5. 비밀값을 새로 만들려면 `reset --yes --rotate-secrets` 후 `up`(DB 데이터가 지워지므로 일관됨). 계정 이메일·사용자 ID 는 유지한다.
6. 프로세스 환경변수 `TOONSTUDIO_LOCAL_*` 는 파일보다 우선한다. 값이 로컬이 아니면 가드가 중단한다.
7. 값이 없는 상태로 DB 데이터만 남은 경우(파일 삭제 등)에는 비밀번호를 알 수 없어 `reset` 이 필요하다. `up` 이 안내한다.

한계: 이 파일과 기본 스택 디렉터리는 컨테이너/샌드박스 파일시스템에 있다. **컨테이너가 사라지면 `.env.infrastructure.local` 도, 임베디드 DB 데이터와 설치된 바이너리도 함께 사라진다.**
다시 `up` 하면 새 비밀값·새 계정으로 처음부터 만든다.

## 스키마 준비 방식

운영 부트스트랩 스크립트(`scripts/bootstrap-empty-production-database.mjs`)를 **수정하지 않고** 일회용 loopback 모드
(`--allow-loopback`)로 호출한다. 번호 SQL 마이그레이션만 적용하는 별도 러너를 만들지 않은 이유:

- 0001~0019 는 Drizzle 기준 스키마에 이미 반영된 기준선이라, 빈 DB 에 번호 SQL 만 적용하면 `user`·`account` 같은
  기준 테이블이 없어 실패한다. 부트스트랩이 `drizzle-kit` 으로 기준 스키마를 만든 뒤 `production-database-migrations.manifest`
  순서로 이후 마이그레이션을 적용하고 체크섬 원장에 기록한다.
- `/api/health/ready` 는 런타임 역할이 소유자가 아니며 테이블별 최소 권한만 가진다는 ACL 까지 검사한다
  (`health-readiness.repository.ts`). 그래서 소유자 역할과 런타임 역할을 분리하는 경로가 필요하다.

API 가 부팅 시 만드는 테이블은 그대로 둔다. 이미 스키마가 있으면 다시 적용하지 않고 지문(스키마·마이그레이션 파일의 sha256)만
비교해 브랜치가 바뀌었으면 경고한다(그 경우 `reset` 후 `up`).

## 시드 테스트 계정

`seed-runner.mjs` 가 tsx 로더로 앱 모듈을 그대로 import 해 `hashPassword`, `passwordPolicyError`, `isValidSignupEmail`
(`apps/api`)을 사용한다. `user` 테이블에 `emailVerified=now()`, `role=user`, `status=active` 인 일반 사용자 1명을 만든다.
이미 있으면 정상 상태(인증 완료·활성·비밀번호 일치)인지 확인하고 아니면 보정한다. 이메일 가입 경로는 운영과 같이 꺼 둔 채
(`AUTH_EMAIL_PROVIDER=disabled`) DB 에 직접 만드는 것이다.

## 인증 스모크(`smoke`)

| # | 항목 | 확인 내용 |
| --- | --- | --- |
| 1 | `GET /api/health/live` | 200, `{status:"ok"}` |
| 2 | `GET /api/health/ready` | 200, `{status:"ready"}`(DB·스키마·ACL) |
| 3 | `GET /api/auth/providers` | `email.available=false`(`reason=disabled`)로 운영과 같은 상태 |
| 4 | 익명 `GET /api/auth/session` | `authenticated=false` |
| 5 | CSRF 경계 | 헤더·Origin 없는 로그인 POST 는 403 이고 쿠키 없음 |
| 6 | 잘못된 비밀번호 | 401, 일반화된 오류 문구, 쿠키 없음 |
| 7 | 시드 계정 로그인 | 2xx, HttpOnly·SameSite=Lax 세션 쿠키 발급 |
| 8 | 로그인 세션 | `GET /api/auth/session` 이 시드 사용자(이메일·ID 일치, `role=user`)를 반환 |
| 9 | 로그아웃 | 2xx, 쿠키 만료 지시 |
| 10 | 로그아웃 후 | 이전 쿠키로 `authenticated=false`(서버 측 세션 폐기) |
| 11 | 레이트리밋 | 반복 로그인 실패가 10회 401 후 11번째에 429 `{error}`, 쿠키 없음 |
| 12 | 웹 프록시 | Vite `/api` 프록시 경유 `live`·익명 `session` 이 정상 |

출력은 PASS/FAIL/SKIP 표이며 이메일·비밀번호·사용자 ID·쿠키 값은 어디에도 출력하지 않는다. FAIL 이 하나라도 있으면 종료 코드 1 이다.

로그인 레이트리밋은 IP·이메일별 10회/10분이다(`auth-rate-limit.ts`). 스모크는 loopback 프록시의 `X-Forwarded-For`(RFC 5737 문서용
주소)로 IP 버킷을 격리해, 429 확인이 다른 로그인을 막지 않고 반복 실행해도 안전하다. 이 하네스가 띄운 API 는 loopback 프록시만
신뢰하도록 설정되어 있다(`AUTH_TRUSTED_PROXY_*`). 다만 시드 계정 이메일 버킷은 한 번 실행에 2회(잘못된 비밀번호 + 로그인)와 브라우저
스모크 1회를 쓰므로 10분 안에 4~5번 넘게 연속 실행하면 429 가 날 수 있다. 그때는 10분을 기다리거나 `api:stop` → `api:start` 로
프로세스 메모리 카운터를 초기화한다.

## 브라우저 스모크(`e2e`)

`e2e/local-fullstack-auth.spec.mjs`: 로그인 UI(`/auth/login`) → "이미 로그인되어 있어요" 상태 표시 → 서버 세션이 시드 사용자임을
쿠키로 확인 → `/help` 헤더의 계정 메뉴 → 로그아웃 → 로그인 버튼 복귀와 세션 폐기. `TOONSTUDIO_LOCAL_FULLSTACK_E2E=1` 이 아니면
전체가 skip 되므로 기본 CI(`playwright.config.ts`)에서는 실행되지 않는다. 이 값은 `e2e` 명령만 설정하며, 스펙은 웹 origin 이
loopback 이 아니면 자격증명을 입력하기 전에 실패한다. 스펙을 `.mjs` 로 둔 것은 `.ts` 변경이 `pnpm harness:verify` 의 전체 typecheck
분류를 일으키지 않게 하기 위해서다. 실패하면 스크린샷이 `<스택>/browser/results` 에 남는다. 열린 계정 메뉴에는 계정 이메일이
보일 수 있으나 스택 디렉터리는 저장소 밖이라 커밋 대상이 아니다. Playwright 출력은 비밀값을 줄 단위로 가린 뒤 표시·저장한다.

## 보안 경계

- **loopback 만**: DB URL 은 호스트가 정확히 `127.0.0.1`/`localhost` 이고 포트가 명시되어야 하며, 호스트를 덮어쓸 수 있는
  쿼리(`host`·`hostaddr`·`port`·`service`·`sslmode` 등 — `sslmode=disable` 만 허용)와 userinfo·접미사 위장을 거부한다. 스모크·e2e 는 로그인
  자격증명을 보내므로 API·웹 origin 도 같은 규칙을 적용한다. 위반하면 어떤 파일·프로세스·접속도 만들기 전에 종료 코드 3 으로 중단한다
  (`lib/guard.mjs`, 테스트 `cli.test.mjs`).
- **호출 셸의 DB 환경변수 점검**: 하네스는 `DATABASE_URL` 류를 자식 프로세스에 넘기지 않지만, 운영 DB 를 가리키는 셸에서 DB 를 다루는 도구를
  띄우는 실수를 막으려고 시작 전에 한 번 더 본다. `DATABASE_URL`·`MIGRATION_DATABASE_URL`·`PRODUCTION_DATABASE_DIRECT_URL`·`TEST_DATABASE_URL`·
  `STUDIO_LIVE_POSTGRES_URL`·`STUDIO_LIVE_POSTGRES_INTEGRATION_URL`·`STUDIO_TEAM_COMMENT_POSTGRES_INTEGRATION_URL` 중 값이 있는 것이
  호스트 `127.0.0.1`/`localhost` 가 아니거나 형식이 잘못됐으면 종료 코드 3 으로 중단한다(메시지에는 변수 이름과 `unset` 안내만 있고
  URL·사용자·비밀번호는 없다). 값이 비어 있거나 로컬이면 통과한다(포트·자격증명은 요구하지 않는다). 대상은 `up`·`db:start`·`schema`·`seed`·
  `api:start`·`web:start`·`status`·`smoke`·`e2e` 이고, 접속하지 않고 정리만 하는 `down`·`db:stop`·`api:stop`·`web:stop`·`reset`·`leakcheck` 는
  막지 않는다. `check` 는 중단하지 않고 "환경변수 DB 설정" 행으로 PASS/FAIL 만 보고한다.
- **환경 허용 목록**: API·웹·마이그레이션·시드·npm 프로세스에는 `PATH`·`HOME`·로케일·(npm 은 프록시·CA)만 전달한다. 호출한 셸에
  `DATABASE_URL`·클라우드/GitHub 토큰이 있어도 새지 않는다. API 는 `API_LOCAL_ENV_FILE_ENABLED=false` 로 `.env.local` 을 읽지 않고
  `NEST_API_HOST=127.0.0.1` 에만 바인딩한다.
- **비밀 출력 금지**: 자식 프로세스 출력은 알려진 비밀값(원문·URL 인코딩)과 postgres URL 자격증명을 가린 뒤 출력·저장한다.
  `leakcheck` 로 로그·상태 파일·실행 기록에 비밀이 남았는지 키 이름·건수로 검사한다.
- **운영 코드 불변**: 운영 부트스트랩·마이그레이션 러너, `apps/*`, `package.json`, lockfile 을 수정하지 않는다.

## 테스트

```bash
node --test scripts/local-fullstack/lib/*.test.mjs scripts/local-fullstack/*.test.mjs
```

가드(운영 호스트·쿼리 우회·userinfo 위장·호출 셸의 DB 환경변수), 비밀 파일 병합·권한, 갱신 규칙, 프로세스 종료, 스모크 판정(모의 API 로
결함 주입), CLI 의 운영 보호(부작용 없이 종료 코드 3)·reset·leakcheck 를 검증한다.

이 파일들은 `node:test` 와 `vitest` 양쪽에서 실행된다. 루트 `vitest.config.ts` 의 수집 루트에 `scripts` 가 들어 있어서 루트 단위 테스트
실행(`pnpm test:root`, 곧 `vitest run`)에도 자동으로 포함된다. 루트 설정으로 `pnpm exec vitest run scripts/local-fullstack` 를 실행해
11개 파일 160건 통과를 확인했다. 테스트는 실제 PostgreSQL 기동이나 npm 설치 없이 임시 디렉터리·loopback 모의 서버·합성 값만 쓴다.
하네스 자체(`up`·`smoke`·`e2e`)는 `package.json` 스크립트나 CI 작업에 연결하지 않았다(저장소 `package.json` 변경 금지 범위).
브라우저 스펙(`e2e/`)은 루트 vitest 에서 제외되어 있다.

## 문제 해결

| 증상 | 조치 |
| --- | --- |
| `운영 보호로 중단합니다` (exit 3) | 환경변수나 `.env.infrastructure.local` 의 `TOONSTUDIO_LOCAL_*` 가 로컬이 아닌 호스트를 가리키거나, 호출 셸의 `DATABASE_URL` 류가 로컬이 아니다(메시지에 변수 이름이 나온다). 해당 셸 변수는 `unset <이름>`, 비밀 파일 값은 고치거나 해당 줄을 지운 뒤 다시 실행 |
| 포트 사용 중 | `--pg-port`/`--api-port`/`--web-port` 로 다른 포트 지정(비밀 파일의 URL·origin 포트가 갱신된다) 또는 점유 프로세스 정리 |
| `관리자 비밀번호가 데이터 디렉터리와 맞지 않습니다` | 비밀 파일이 새로 만들어졌거나 바뀌었다. `reset --yes` 후 `up` |
| `DB 에 객체가 있지만 스키마 준비 완료 기록이 없습니다` | 이전 스키마 준비가 중단됐다. `reset --yes` 후 `up` |
| `/api/health/ready` 가 503 | `logs/api.log` 의 readiness 진단을 확인. 브랜치가 바뀌었다면 스키마 지문 경고가 함께 나오며 `reset --yes` 후 `up` |
| root 에서 PostgreSQL 이 시작되지 않음 | `check` 로 `unshare -U` 지원 확인(`user.max_user_namespaces`). 불가하면 비root 사용자로 실행 |
| 첫 브라우저 로딩이 오래 걸림 | Vite 의존성 최적화(최초 1회, 수십 초). e2e 타임아웃은 이를 고려해 길게 잡혀 있다 |
| `429` 로 로그인 스모크 실패 | 이메일 버킷 소진(위 레이트리밋 절). 10분 대기 또는 `api:stop` → `api:start` |
