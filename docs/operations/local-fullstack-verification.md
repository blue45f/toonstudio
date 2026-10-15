# 로컬 풀스택 인증 검증 하네스

- 상태: **current**
- 기준일: **2026-10-15**
- 권위 구현: `scripts/local-fullstack/` (소스·테스트가 우선, 사용법 상세는 `scripts/local-fullstack/README.md`)
- 운영 영향: **없음.** 운영 DB·도메인·환경변수·배포에 접속하거나 변경하지 않으므로 운영 배포 승인 절차와 무관하다.

## 목적

이메일 로그인·세션·로그아웃·레이트리밋 같은 인증 흐름과 API 준비 상태(`/api/health/ready`)를 **내 컴퓨터의 로컬 풀스택**에서
반복 가능하게 검증한다. 임베디드 PostgreSQL, Nest API, Vite 웹을 127.0.0.1 에만 띄우고, 이메일 인증이 끝난 시드 테스트
계정 1명으로 API 스모크(PASS/FAIL 표)와 브라우저 스모크(Playwright)를 실행한다.

## 배경과 한계: 운영에는 이메일 테스트 계정을 만들 수 없다

2026-10-15 확인 기준 운영 `/api/auth/providers` 는 `email.available=false`(`reason=disabled`)이고 로그인은
Google·GitHub·Kakao·Naver OAuth 뿐이다. 이메일 모드는 `disabled`, `resend` 두 가지뿐이며(`apps/api/src/server/auth-email.ts`),
가입 핸들러는 이메일 발송이 설정되지 않으면 거부한다(`apps/api/src/modules/auth/auth.controller.ts`의
`signup`, `assertAuthEmailDeliveryConfigured`). 그래서 운영에 가입으로 테스트 계정을 만들 수 없고, 인증 흐름은 로컬에서 검증한다.

이 하네스는 **운영 검증을 대체하지 않는다.** 로컬 검증이 보장하는 것은 현재 소스의 인증 코드 경로, 마이그레이션 적용 결과,
런타임 역할 ACL 이다. 보장하지 않는 것은 다음과 같다.

| 운영과 다른 점(하네스 설정) | 검증하지 못하는 것 |
| --- | --- |
| `NODE_ENV=development`, HTTP, 세션 쿠키 `Secure` 없음 | 운영의 HTTPS 전용 쿠키·`Secure` 속성·엄격한 운영 env 검증 |
| 로컬 단일 인스턴스 레이트리밋(`AUTH_RATE_LIMIT_MODE=single-instance-local`), loopback 프록시 신뢰 | Upstash 분산 레이트리밋, Cloudflare 엣지의 `cf-connecting-ip` 신뢰 경계 |
| 이메일 발송 비활성(`AUTH_EMAIL_PROVIDER=disabled`), 소셜 제공자 미설정 | Resend 발송·인증 메일 링크, Google/GitHub/Kakao/Naver 실제 OAuth |
| 임베디드 PostgreSQL 17(소유자/런타임 역할 분리 부트스트랩) | 운영 DB 토폴로지(Supabase)·네트워크·백업·실제 데이터 |
| Vite 개발 서버 프록시, 객체 스토리지·실시간 클러스터(메모리) 비활성 | Cloudflare 정적 배포, CSP, Render 런타임 |

## 전제

- Node 24 이상, 저장소 루트에서 `pnpm install` 완료, `psql`·`git`·`npm` 설치.
- Linux x64 에서 검증했다. macOS 는 코드 경로만 있고 미검증, Windows 는 지원하지 않는다.
- root 로 실행하면 PostgreSQL 이 거부하므로 `unshare -U`(사용자 네임스페이스)로 비root uid 에 매핑한다. 불가한 환경이면 `check` 가 알려 준다.
- 처음 한 번 npm 레지스트리에서 `embedded-postgres@17.10.0-beta.17` 을 스택 디렉터리에 설치한다(저장소 `package.json`·lockfile 불변).
- 브라우저 스모크는 Chromium 이 필요하다(`pnpm exec playwright install chromium` 또는 `PLAYWRIGHT_EXECUTABLE_PATH`).

## 명령

저장소 루트에서 실행한다. 부작용은 모두 스택 디렉터리(기본 `<tmp>/toonstudio-local-fullstack`)와 `.env.infrastructure.local` 에 한정된다.

```bash
node scripts/local-fullstack/cli.mjs check        # 사전 점검, 읽기 전용
node scripts/local-fullstack/cli.mjs up           # 전체 시작(설치·초기화·스키마·시드·API·웹)
node scripts/local-fullstack/cli.mjs smoke        # API 인증 스모크
node scripts/local-fullstack/cli.mjs e2e          # 브라우저 인증 스모크
node scripts/local-fullstack/cli.mjs leakcheck --path <실행 기록 파일>   # 비밀 누출 검사
node scripts/local-fullstack/cli.mjs down         # 중지(데이터 보존)
node scripts/local-fullstack/cli.mjs reset --yes  # DB 데이터 삭제(다시 처음부터)
```

- `up --dry-run`, `down --dry-run`, `reset --dry-run` 은 아무것도 만들지 않고 계획만 보여 준다.
- 포트 기본값은 PostgreSQL 55452, API 4101, 웹 5273 이다(`--pg-port` `--api-port` `--web-port`).
- 자격증명은 `.env.infrastructure.local` 의 `TOONSTUDIO_LOCAL_TEST_EMAIL`, `TOONSTUDIO_LOCAL_TEST_PASSWORD`,
  `TOONSTUDIO_LOCAL_TEST_USER_ID` 이고 DB URL·서명키·origin 키도 같은 파일에 있다. **값은 터미널·로그·문서·커밋에 출력하지 않는다.**
  갱신 규칙(이미 있는 유효한 값은 덮어쓰지 않음 등)은 `scripts/local-fullstack/README.md` 의 해당 절을 따른다.
- 컨테이너/샌드박스가 사라지면 `.env.infrastructure.local` 과 기본 스택 디렉터리(DB 데이터·설치된 바이너리)도 함께 사라진다.
  다시 `up` 하면 새 비밀값과 새 계정으로 처음부터 만든다.

## 성공 기준

| 단계 | 성공 기준 |
| --- | --- |
| `up` | 종료 코드 0. `/api/health/live`·`/api/health/ready` 가 모두 200, 웹 `/` 와 프록시 `/api/health/live` 가 200 |
| 스키마 | 운영 부트스트랩이 "checksum-ledgered and capability-verified" 로 끝나고 `ready` 가 200(소유자/런타임 역할 ACL 포함) |
| 시드 | `user` 에 `emailVerified` 가 있고 `role=user`·`status=active` 인 계정 1명, 비밀번호는 앱의 `hashPassword` 결과 |
| `smoke` | 12개 항목 모두 PASS(FAIL 0). 종료 코드 0. 표에 이메일·비밀번호·사용자 ID·쿠키 값이 없다 |
| `e2e` | 1 passed: 로그인 UI → "이미 로그인되어 있어요" → 계정 메뉴 → 로그아웃 → 로그인 버튼 복귀, 세션 폐기 |
| `leakcheck` | 로그·상태 파일·실행 기록에서 비밀값 일치 0건 |
| `down` | 웹·API·PostgreSQL 이 모두 정상 종료되고 남은 프로세스가 없다 |

스모크 12개 항목은 헬스 live/ready, 이메일 가입 비활성 확인, 익명 세션, CSRF 경계(403), 잘못된 비밀번호(401·일반화된 문구),
시드 계정 로그인(HttpOnly·SameSite=Lax 쿠키), 로그인 세션의 사용자 일치, 로그아웃, 로그아웃 후 폐기된 쿠키 거부, 레이트리밋 429
응답 형태, Vite 프록시 경유 확인이다.

## 실패 시 조치

| 증상 | 원인 | 조치 |
| --- | --- | --- |
| 종료 코드 3, "운영 보호로 중단합니다" | 비밀 파일·환경변수의 DB URL·origin 이 127.0.0.1/localhost 가 아니거나, 호출 셸의 `DATABASE_URL` 류가 로컬이 아님(메시지에 변수 이름이 나온다) | 셸 변수는 `unset <이름>`, 비밀 파일 값은 고치거나 지운 뒤 다시 실행. 하네스는 그 값으로 접속·전송하지 않았다 |
| `사전 조건을 만족하지 못해 시작하지 않습니다` | psql·npm·unshare·tsx·vite 누락 | 안내된 항목 설치, `pnpm install`, `cli.mjs check` 로 재확인 |
| PostgreSQL 비밀번호 불일치 | 비밀 파일이 새로 만들어졌거나 바뀜(데이터 디렉터리는 이전 비밀번호) | `reset --yes` 후 `up` |
| `DB 에 객체가 있지만 스키마 준비 완료 기록이 없습니다` | 이전 스키마 준비가 중단됨 | `reset --yes` 후 `up` |
| `ready` 503 | 스키마·ACL 불일치(브랜치 변경 등) | `logs/api.log` 의 readiness 진단 확인, 지문 경고가 있으면 `reset --yes` 후 `up` |
| 포트 사용 중 | 다른 프로세스 점유 | `--pg-port`/`--api-port`/`--web-port` 지정 또는 점유 프로세스 정리 |
| 로그인 스모크 429 | 시드 이메일 레이트리밋 버킷 소진(10회/10분) | 10분 대기 또는 `api:stop` → `api:start` |
| 브라우저 스모크 시간 초과 | 첫 로딩의 Vite 의존성 최적화 또는 Chromium 부재 | 재시도(두 번째부터 빠름), Chromium 설치/경로 지정 |
| 누출 검사 일치 > 0 | 로그에 비밀값 | 해당 로그를 삭제하고 출력 경로를 수정(원인 보고 후 값 교체: `reset --yes --rotate-secrets`) |

## 보안 경계

- **loopback 만 접속한다.** DB URL 은 호스트가 정확히 `127.0.0.1`/`localhost` 여야 하고, 호스트를 덮어쓸 수 있는 쿼리 파라미터·userinfo·접미사
  위장을 거부한다. 로그인 자격증명을 보내는 스모크·브라우저 스모크도 API·웹 origin 이 로컬이 아니면 요청 전에 중단한다.
  위반은 어떤 파일·프로세스·접속도 만들기 전에 종료 코드 3 으로 끝난다(`cli.test.mjs`, `guard.test.mjs`).
- **호출 셸의 DB 환경변수도 시작 전에 확인한다.** `DATABASE_URL`·`MIGRATION_DATABASE_URL`·`PRODUCTION_DATABASE_DIRECT_URL`·`TEST_DATABASE_URL` 등
  (전체 목록은 `lib/guard.mjs` 의 `FOREIGN_DATABASE_ENV_NAMES`)에 로컬이 아닌 호스트가 있으면, 하네스가 그 값을 쓰지 않더라도 종료 코드 3 으로
  즉시 중단한다. 메시지에는 변수 이름과 `unset` 안내만 있고 URL·사용자·비밀번호는 없다. `up`·`db:start`·`schema`·`seed`·`api:start`·`web:start`·
  `status`·`smoke`·`e2e` 가 대상이며, 정리 전용인 `down`·`db:stop`·`api:stop`·`web:stop`·`reset`·`leakcheck` 는 막지 않고 `check` 는 FAIL 행으로만 보고한다.
- **자식 프로세스 환경은 허용 목록이다.** 호출 셸의 `DATABASE_URL`·클라우드·GitHub 토큰은 API·웹·마이그레이션·시드·npm 으로 전달하지 않는다.
  API 는 `.env.local` 자동 로드를 끄고(`API_LOCAL_ENV_FILE_ENABLED=false`) loopback 에만 바인딩한다.
- **비밀은 로컬 파일 하나에만 둔다.** `.env.infrastructure.local` 은 umask 077 로 만들고 권한 600, git 무시 여부를 `git check-ignore` 로
  확인한 뒤에만 쓴다. 다른 서비스의 키·주석은 보존한다. 출력에는 키 이름과 길이만 쓴다.
- **운영 코드를 바꾸지 않는다.** 스키마 준비는 기존 운영 부트스트랩(`scripts/bootstrap-empty-production-database.mjs`)을 일회용 loopback
  모드(`--allow-loopback`)로 호출하며, 이 스크립트와 마이그레이션 러너·`apps/*`·`package.json`·lockfile 은 수정하지 않는다.
- **일회용 DB 다.** `fsync=off` 로 띄우므로 데이터 보존용으로 쓰지 않는다. 마이그레이션 SQL 파일을 새로 만들지 않는다.

## 검증 근거 (2026-10-15 실제 실행)

환경: Node v24.21.0, Linux x64 샌드박스(root → `unshare -U` 우회), 임베디드 PostgreSQL 17.10, Playwright 1.62.1 + Chromium 141
(`PLAYWRIGHT_EXECUTABLE_PATH`). 머신 부하(load average 약 10 이상)가 큰 상태에서 측정한 값이라 시간은 상한에 가깝다. 계정·비밀값은 기록하지 않는다.

| 시나리오 | 실제 결과 |
| --- | --- |
| 처음부터(스택 디렉터리·비밀 파일·설치 바이너리를 모두 지운 뒤) `up` | 종료 코드 0, 54초. npm 으로 `embedded-postgres` 설치 → initdb → 스키마 → 시드 → API → 웹. 부트스트랩 출력 "19 adopted, 93 applied, 20 checksum-verified skips", "Production database capabilities: verified", `/api/health/ready` 200 |
| 스키마·시드 사후 확인 | 공개 테이블 257개. 마이그레이션 역할만 superuser 이고 런타임 역할은 비-superuser. 시드 행은 `role=user`·`status=active`·`emailVerified` 있음·비밀번호 해시 `scrypt$v2`, 이메일·사용자 ID 가 비밀 파일 값과 일치 |
| `smoke` | 12/12 PASS, FAIL 0, SKIP 0 — 처음부터 실행 직후 2회, 재시작 후 1회, 비밀값 회전 후 1회 모두 동일 |
| `e2e` | 1 passed — 처음부터 실행 직후 50초(첫 Vite 의존성 최적화 포함), 재시작 후 22초, 회전 후 1.1분 |
| 재시작 | `down` 정상 종료(웹·API·PostgreSQL 모두 "정상 종료", 남은 프로세스 없음) → `up` 16초(데이터 보존, 스키마·시드는 재사용) |
| 비밀값 회전 | `reset --yes --rotate-secrets` 후 비밀번호·세션/state 서명키·DB URL 2종 등 5개 키가 변경되고 이메일·사용자 ID·origin·스택 경로는 유지, 파일 권한 600 유지. 이어서 `up` 40초, `smoke` 12/12, `e2e` 1 passed |
| 드라이런 | `up --dry-run`·`down --dry-run`·`reset --dry-run` 은 종료 코드 0 이고 파일·프로세스를 만들지 않음 |
| 비밀 누출 | `leakcheck`(비밀 9종 × 로그·상태·실행 기록)와, 별도로 `grep -rlF -f <(비밀값)` 으로 하네스 로그·상태 파일·실행 기록·이 세션의 명령 출력 기록·커밋 대상 파일을 검사해 이메일·사용자 ID·비밀번호·서명키 2종·DB URL 2종(전체 문자열과 URL 안의 비밀번호) 일치 0건(고정 기본값인 DB 역할 이름은 소스 상수·로그에 있는 것이 정상이라 비밀로 보지 않는다). 비밀 파일 권한 600, `.gitignore:36 (.env*)` 로 무시됨, 메인 작업트리 `git status` 에 나타나지 않음 |
| 운영 보호(호출 셸) | 호출 셸에 로컬이 아닌 호스트(`.invalid` 예약 도메인)의 가짜 `DATABASE_URL` 을 둔 실제 실행: `up`(`--dry-run` 포함)·`db:start`·`schema`·`seed`·`api:start`·`web:start`·`status`·`smoke`·`e2e` 10개 모두 종료 코드 3. 메시지에 호스트 이름만 있고 사용자·비밀번호는 없음, 접속·DNS 오류 출력 없음(가드가 먼저 종료), 비밀 파일과 스택 디렉터리의 파일 목록·mtime 불변. 다른 변수 이름(`MIGRATION_DATABASE_URL`·`PRODUCTION_DATABASE_DIRECT_URL`·`TEST_DATABASE_URL`·`STUDIO_LIVE_POSTGRES_URL`)과 형식이 잘못된 값도 종료 코드 3, 로컬 호스트 값은 통과. 같은 환경에서 `down --dry-run`·`reset --dry-run`·`leakcheck` 는 종료 코드 0, `check` 는 "환경변수 DB 설정" FAIL 행 |
| 최종 코드 재확인 | 위 보호 장치를 넣은 최종 코드로 `up` 18초(종료 코드 0, 데이터 보존 재시작) → `smoke` 12/12 PASS → `e2e` 1 passed(21초) → `leakcheck` 누출 없음 → `down` 3초(웹·API·PostgreSQL 정상 종료, 남은 프로세스·열린 포트 없음) |
| 단위 테스트 | `node --test scripts/local-fullstack/lib/*.test.mjs scripts/local-fullstack/*.test.mjs` 11개 파일 160건 통과(운영 호스트 가드·쿼리 우회·userinfo 위장·호출 셸 환경변수 가드·환경 허용 목록·reset·leakcheck·스모크 판정 포함) |
| 저장소 검증 | `pnpm harness:check`·`pnpm harness:verify`(변경이 `.mjs`·`.md` 뿐이라 typecheck 분류 아님: 하네스 무결성, 하네스 테스트 5건, lockfile 무결성, 변경 파일 27개 lint) 통과. `harness:verify` 의 Secretlint 단계는 대상 파일이 없다고 보고해서, 새 파일 29개를 `node scripts/secretlint-files.mjs -- <파일>` 로 따로 검사해 통과했다. `package.json`·`pnpm-lock.yaml`·`pnpm-workspace.yaml` 무변경 |
| 문서 검증 | 이 문서가 있는 sparse worktree 에서 `node scripts/validate-documentation.mjs` 를 실행하면 15건이 실패하지만 모두 다른 문서가 가리키는 `apps/web/public/*` 링크(sparse 체크아웃에서 제외된 경로)이고 이 문서·README 관련 항목은 없다. 이 문서가 없는 비-sparse 메인 트리에서는 921개 문서가 통과한다. 이 문서를 포함한 전체 트리 검증은 실행하지 않았다 |

## 남은 한계

- 기본 CI 와 `package.json` 스크립트에 연결하지 않았다(저장소 `package.json` 변경 금지 범위). 단위 테스트는
  `node --test scripts/local-fullstack/lib/*.test.mjs scripts/local-fullstack/*.test.mjs` 또는 루트 `vitest` 로 실행한다.
- 브라우저 스모크 스펙은 `.ts` 변경이 `pnpm harness:verify` 의 전체 typecheck 분류를 일으키지 않도록 `.mjs` 로 두었다.
- Linux x64 외 플랫폼, 번들 Chromium 설치 경로, 장시간 안정성(수 시간 연속 실행)은 검증하지 않았다.
- `pnpm local:test`(`scripts/local-test-stack.mjs`)와 기능이 일부 겹치지만 서로 수정하지 않았고, 두 도구를 하나로 합치는 정리는 하지 않았다.
