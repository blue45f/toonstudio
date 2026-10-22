# ToonStudio 인프라 지도

- 문서 상태: **current** — 2026-10-23 컷오버를 마쳤다(Core API·DB가 onpod 서울에서 운영 트래픽을 받는다). 행마다 `current`(지금 동작·검증), `migration`(진행 중), `target`(승인 대기), `legacy exception`(퇴역 예정), `retired`(삭제됨)를 따로 적는다.
- 최종 갱신: 2026-10-23 (KST 05:25)
- 목적: 에이전트와 사람이 "무엇이 어디서 어떤 비용으로 도는지, 비밀값은 어디에 있는지, 어떻게 다시 만드는지"를 한 곳에서 본다. 이 문서는 정책을 바꾸지 않는다. 정책 정본은 루트 `AGENTS.md` 8·9절, 배포 절차는 `DEPLOY.md`다.
- 갱신 의무: 공급자·자원·도메인·비밀 저장 위치·연결 경로를 바꾸는 변경은 **같은 변경에서 이 문서를 고친다**. 날짜와 증거 표기를 함께 바꾼다.
- 증거 표기: **[직접]** 2026-10-22 이 Mac에서 직접 실행해 확인 · **[벤더]** 벤더 매뉴얼의 서술(저장소가 검증하지 않음) · **[저장소]** 저장소 파일 · **미확인**.
- 비밀값은 이 문서에 쓰지 않는다. 키 **이름**과 저장 위치만 적는다(`AGENTS.md` 9절).

## 0. 에이전트 시작 체크리스트

1. 인프라·배포·DB·도메인·비밀값을 건드리는 작업이면 이 문서를 먼저 읽고, 건드린 만큼 이 문서를 고친다.
2. 실제 비밀값은 `.env.infrastructure.local`(주 작업트리 루트, Git 무시, 권한 600)에만 둔다. 출력·로그·채팅에 값을 쓰지 않는다. 새로 발급·생성한 값은 **만든 즉시** 같은 파일에 저장한다.
3. onpod는 주입한 환경변수와 DB 비밀번호를 읽을 때 가려서 보여 준다. 로컬 파일이 **유일한 사본**이므로 삭제·재생성하지 않는다(5절).
4. `onpod app deploy --attach-db …`와 `onpod db rotate-password`는 DB 비밀번호를 새로 발급해 기존 값을 무효로 만든다. 실행한 뒤에는 반드시 6.4절 동기화를 실행한다.
5. 컷오버는 2026-10-23에 끝났다. onpod 앱 이미지 교체·환경변수 변경·DNS·자원 삭제·유료 전환은 여전히 사용자의 명시적 승인이 필요하다(3·8절). onpod 단위는 아직 상시 승인 범위(`deploy/STANDING_APPROVAL.json`) 밖이다.

## 1. 구성요소 지도

| 구성요소 | 위치 | 요금 | 상태 | 비고 |
| --- | --- | --- | --- | --- |
| 도메인 `toonstudio.cloud` | Cloudflare DNS(네임서버 `elsa`·`tom`) | 도메인 갱신비 | current | 소유자가 유지하기로 한 유일한 기존 자원(2026-10-22). `api.` 하위 레코드는 없다. 퇴역 Vercel을 가리키는 `origin.` CNAME과 Vercel 팀의 도메인 등록이 남아 있다(8절) [직접] |
| 웹 정적 + 엣지 게이트웨이 | Cloudflare Static Assets + Worker `toonspectrum-web`(`deploy/cloudflare-static`) | 무료 | current | 버전 `8d9e24ee`(main `38847c624`). onpod 정적으로 옮길 수 없다(7.1절) |
| 대형 에셋 | Cloudflare R2 `toonspectrum-public-assets` | 무료 한도 | current | 25 MiB 초과 파일. onpod 버킷은 GB당 과금이라 옮기지 않는다 |
| 실시간 조정 | Cloudflare Worker + Durable Objects, `realtime.toonstudio.cloud`(`deploy/cloudflare-realtime`) | 무료 | current | 방 단위 단일 기록자 의미를 onpod 무료 앱이 대신하지 못한다 |
| 트래픽 분석 | Cloudflare Worker `toonspectrum-analytics` + D1(`TRAFFIC_ANALYTICS_STORE=d1`) | 무료 | current | Core API가 RPC로 기록한다. onpod DB에는 분석 표가 없다(7.2절) |
| apex 리다이렉트 | Cloudflare Worker(`deploy/cloudflare-apex-redirect`) | 무료 | current | |
| **Core API** | onpod 앱 `toonstudio-api`, 서울, 무료 티어 | 0원 | **current** — 2026-10-23 05:14 KST 컷오버. 준비성 200(단일 소유자 옵트인, 7.3절) | `https://toonstudio-api.onpod.ai`. 이미지 `ghcr.io/blue45f/toonspectrum-core-api:4df6d16929171afb25fe866a009febf8a16ea9eb` |
| **PostgreSQL 원장** | onpod DB `toonstudio-db`, 서울, dev 플랜, PG 17.10 | 0원 | **current** — 스키마 113개 적용·검증 12/12 | 단일 소유자 역할(7.2절) |
| Core API (구) | Render 무료 `toonspectrum-core-api`(싱가포르) | — | **retired** — 2026-10-23 05:22 KST 삭제 | 2026-10-22 19:21 KST부터 DB 인증 실패(28P01)로 재시작을 반복했다. 삭제 전 환경변수 106개를 로컬에 백업했다(5절) [직접] |
| Render 검증용 정적 사이트 19개 | `toonstudio-*-20260909` | — | **retired** — 2026-10-23 04:09 KST 삭제 | 2026-09-09 CI·레이어 검증 산출물. 저장소 참조 없음 [직접] |
| studio-live | Render `toonspectrum-studio-live` | — | 없음 | `render.yaml`에 선언만 있고 Render에 만든 적이 없다 [직접] |
| DB (구) Supabase | 프로젝트 `toonspectrum-collaboration`(`ybsgfhofuvkhywbpytnl`, ap-northeast-2) | 무료 | legacy exception — 미사용 | 2026-10-23 03:51 KST에 `ACTIVE_HEALTHY`였다(2026-10-22에는 `INACTIVE`, 재개 주체 미확인). Core API는 더 이상 이 DB·저장소를 쓰지 않는다(`SUPABASE_OBJECT_STORAGE_ENABLED=false`). 삭제는 데이터 삭제라 소유자가 직접 한다(8절) |
| DB (구) Neon | 프로젝트 `toonspectrum-production`(`tiny-boat-52396217`) | — | **retired** — 2026-10-22 15:15 KST 소유자가 삭제(Neon 사용 중단 결정, 2026-10-23 대화로 확인) | 복구하지 않는다. 유예 기간(2026-10-29 15:15 KST)이 지나면 영구 삭제된다. 같은 결정으로 다른 제품의 Neon 프로젝트 4개도 삭제했다 |
| 웹 프로토타입 | onpod 정적 사이트 `ts-web-proto` | — | **retired** — 2026-10-23 04:09 KST 삭제 | 7.1절 측정용. 헤더 에코·탐침 팟(`ts-hdr-echo`, `tsprobe-app`) 레코드도 같은 시각 정리했다 |

소유자 결정(2026-10-22, 대화): 도메인만 유지하고 나머지를 새로 만든다. 공식 운영 전이라 이전할 의미 있는 데이터가 없다. onpod를 메인으로 쓰되 무료 한도 안에서 최적의 구성을 택한다. onpod에서 무료로 가능한 것은 onpod로 둔다.

2026-10-23 재검토(소유자 요청 "무료로 유지할 수 있는 자원은 onpod로"): onpod로 옮긴 것은 Core API와 DB 둘이다. 나머지는 옮기지 않는다. 웹 정적·엣지는 7.1절 측정으로 불가, 실시간 Durable Objects는 대체 수단이 없고, R2·버킷은 onpod가 GB당 과금이며, 트래픽 분석 D1과 apex 리다이렉트는 Cloudflare 무료에서 이미 0원으로 돈다.

## 2. 요청 경로

```text
브라우저 ─▶ Cloudflare(toonstudio.cloud) ─▶ Worker toonspectrum-web
              ├─ 정적·HTML·에셋 ─▶ Static Assets (+ R2)
              ├─ /api/health, /api/health/live ─▶ Worker가 직접 응답(edge liveness, Core API를 깨우지 않음)
              ├─ 그 밖의 /api/*, /socket.io ─▶ CORE_API_ORIGIN
              │      current(2026-10-23~): onpod  toonstudio-api.onpod.ai ─▶ toonstudio-db (내부 호스트)
              │      retired: Render toonspectrum-core-api.onrender.com (삭제됨)
              └─ realtime.toonstudio.cloud ─▶ 실시간 Worker(Durable Objects)
```

- Worker는 `x-toonstudio-origin-secret` 헤더로 Core API에 출처를 증명한다. Core API는 이 헤더가 없으면 `/api/health/live`·`/api/health/ready`를 뺀 모든 경로(측정: `/`, `/api/auth/session`, `/api/health/capabilities`)에 403 `Trusted edge origin is required`를 돌려준다 [직접: `toonstudio-api`].
- `www`의 `/api/health/live`가 200이어도 Core API가 살아 있다는 뜻이 아니다. 그 경로는 Worker가 직접 응답한다 [저장소: `deploy/cloudflare-static/README.md`].
- Worker는 클라이언트 IP를 `x-forwarded-for`와 전용 헤더 `x-toonstudio-client-ip`에 실어 보낸다(`deploy/cloudflare-static/src/index.ts`, 운영 반영은 2026-10-23 Worker 릴리스부터). onpod ingress는 표준 헤더를 덮어쓰고 전용 헤더만 보존한다. 근거는 7.3절에 있다.

## 3. 승인과 정책 위치

- 새 배포 단위(onpod 앱·DB)는 `AGENTS.md` 8절의 상시 승인 범위 밖이다. 2026-10-22 소유자가 대화에서 "이 안으로 진행해"로 D1 안(DB·Core API를 onpod 서울에, 웹 엣지는 Cloudflare 유지)을 승인했고, 이 문서와 `docs/adr/0030-seoul-origin-hybrid-infrastructure.md`가 그 근거다. `deploy/STANDING_APPROVAL.json`은 바뀌지 않았다.
- 2026-10-22에 소유자가 승인한 변경: `tsprobe-app`·`tsprobe-app-db` 삭제, `toonstudio-db` 생성, 스키마 적용, `toonstudio-api` 신규 배포(병렬 스테이징), 프로토타입 정적 사이트 생성과 측정.
- 2026-10-23 03:55 KST에 소유자가 대화에서 남은 단계를 일괄 승인했다("다 승인할게"): API 이미지 릴리스, Worker 릴리스, `toonstudio-api` 환경변수 추가, 원격 전용 비밀값 확보(방식은 에이전트가 Render API로 정함), 컷오버, 기존 자원 정리. 같은 대화에서 "무료로 유지할 수 있는 자원은 onpod로 옮기고 기존 자원을 정리"하라고 했다.
- 여전히 승인이 필요한 변경(8절): DNS 레코드, 데이터가 있는 DB 프로젝트 삭제(Supabase), 유료 플랜, 상시 승인 범위에 onpod 단위 추가, 앞으로의 onpod 앱 이미지 교체·환경변수 변경.

## 4. onpod 자원 대장 (조회: `onpod app ls`, `onpod static ls`, `onpod db ls`)

| 자원 | 값 | 비고 |
| --- | --- | --- |
| 계정 | 개인 workspace, 관리자 아님, 잔액 0원 | 전 자원이 무료다(2026-10 청구 ₩0). 유료 자원은 `402 insufficient_funds`로 막힌다 [직접] |
| 앱 `toonstudio-api` | 단일 팟, 무료 티어(`cpu_micro`), 포트 3000, 데이터 디스크 없음, 재시작 정책 `on-failure`, 30분 무요청 시 절전 | 첫 요청이 깨운다. 깨는 동안 ingress가 503을 돌려준 뒤 200이 된다. `onpod app rollback`은 직전 이미지와 직전 환경변수 세대로 되돌린다 [직접] |
| DB `toonstudio-db` | dev 플랜, PG 17.10, 서울, 디스크 39 GB(2026-10-23 사용률 9%), 계정당 1개 | 공개 호스트 `toonstudio-db.db.onpod.ai:5432`, 내부 호스트 `toonstudio-db.db.onpod.local:5432`. 백업 켜짐(PITR 7일·스냅숏 30일). 기록된 자동 백업은 2026-10-22 21:27 KST 1건이고 크기가 0 B로 표시돼 복구는 검증하지 않았다 |
| DB 자동 확장 상한 | 최대 플랜 `dev`, 최대 용량 39 GB | 2026-10-23 03:47 KST에 같은 계정 사용자가 `business`·1000 GB에서 낮췄다(에이전트 기록 없음). 유료 자동 승급을 막는 효과가 있고, 용량이 차면 자동 확장 대신 경고가 온다 [직접: `onpod activity`] |
| 정적 사이트·팟 레코드 | 없음 | `ts-web-proto`·`ts-hdr-echo`·`tsprobe-app`을 2026-10-23 04:09 KST에 정리했다. 정적 사이트 한도는 사이트당 약 100 MiB·5,000개 파일·월 100 GB |
| 확장 | `pg_trgm`, `pgcrypto`, `uuid-ossp`, `citext`, `vector`, `postgis` | 소유자 역할은 `CREATE EXTENSION` 권한이 없다. `onpod db extensions`가 대신 켠다 |
| 접속 허용 | 공개 5432는 IP 허용목록 기본 거부, 반영에 수십 초 | 작업할 때만 내 IP를 추가하고 끝나면 제거한다(6.2절) |

이미지는 공개 GHCR이라 레지스트리 자격이 필요 없다 [직접]. 앱의 환경변수 이름은 6.3절의 목록이 전부이며, 값은 5절의 파일에서 온다.

## 5. 비밀·자격증명 위치 (값은 적지 않는다)

주 저장소: `.env.infrastructure.local`(주 작업트리 루트). 현재 줄 수 286, 권한 600, `.gitignore`의 `.env*`로 무시된다 [직접].

같은 위치의 보조 파일(둘 다 권한 600, `.env*`로 무시):

- `.env.render-backup-20261023.local` — 2026-10-23 04:01 KST에 Render API로 받은 Render 서비스 환경변수 원본(`RENDER__<서비스>__<키>`, 113줄). Render를 삭제했으므로 **Render 값의 유일한 사본**이다. 지우지 않는다.
- `.env.infrastructure.local.bak-20261023-0408` — 같은 날 `ONPOD_API_ENV_*`를 늘리기 직전의 주 저장소 사본. 컷오버가 안정되면 지워도 된다.

| 키 이름 | 의미 | 바꾸면 생기는 일 |
| --- | --- | --- |
| `ONPOD_TOKEN` | onpod 전권 사용자 토큰(`op_u_`). `~/.onpod/config.json`에도 있다 | 폐기하면 CLI·MCP 로그인이 끊긴다. 위임·CI용은 `onpod key add --scope <resource:action> --expires-days <n>`로 범위·만료 키를 따로 만든다 |
| `ONPOD_DB_SLUG` | `toonstudio-db` | — |
| `ONPOD_DATABASE_URL` | 내부 호스트 DSN, `sslmode=no-verify` | **`--attach-db` 배포와 `rotate-password`마다 비밀번호가 바뀐다.** 6.4절로 동기화한다 |
| `ONPOD_DATABASE_URL_PUBLIC` | 같은 DB의 공개 호스트 DSN, `sslmode=require`(psql용) | 위와 같다 |
| `ONPOD_API_ENV_AUTH_SESSION_SECRET` | 세션 서명. 주입 시 `AUTH_SESSION_SECRET` | 바꾸면 모든 로그인 세션이 끊긴다 |
| `ONPOD_API_ENV_AUTH_STATE_SECRET` | OAuth state 서명. 주입 시 `AUTH_STATE_SECRET` | 진행 중인 OAuth 흐름이 무효가 된다 |
| `ONPOD_API_ENV_CLOUDFLARE_EDGE_ORIGIN_SECRET` | Worker↔Core API 출처 인증. 주입 시 `CLOUDFLARE_EDGE_ORIGIN_SECRET` | 컷오버 때 Worker 시크릿 `CORE_ORIGIN_SECRET`을 **같은 값**으로 맞춰야 한다. 한쪽만 바꾸면 모든 `/api/*`가 403이 된다 |
| `ONPOD_API_ENV_PERSONAL_CLOUD_OAUTH_STATE_SECRET`, `ONPOD_API_ENV_PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY` | 개인 클라우드 연동 | 암호화 키를 바꾸면 이미 저장된 토큰을 복호화하지 못한다 |

규칙: `ONPOD_API_ENV_<이름>` 키는 6.3절 스크립트가 `<이름>`으로 앱에 주입한다. 새 환경변수가 필요하면 같은 접두로 이 파일에 먼저 저장하고 배포한다. 2026-10-23 기준 88개다: 위 표의 onpod 자체 비밀 5개, Render `toonspectrum-core-api`에서 옮긴 81개(OAuth 4종·AI 무료 풀·TTS·실시간 티켓·참고 자료 API·KMAS·분석 D1·PG 풀 설정·운영 통합 설정·결제 스위치·`ADMIN_EMAILS` 등), 이관 플래그 2개(`DATABASE_RUNTIME_ROLE_MODE=single-owner`, `AUTH_EDGE_CLIENT_IP_ENABLED=true`). 비밀이 아닌 설정도 같은 접두로 둔다. 6.3절 재배포 때 함께 들어가게 하려는 것이다.

기존 키(모두 이름만): `B2_APPLICATION_KEY`·`B2_APPLICATION_KEY_ID`, `BACKEND_UPSTASH_QSTASH_AUTH_TOKEN`·`BACKEND_UPSTASH_QSTASH_PUBLISH_TOKEN`, `UPSTASH_COORDINATION_REST_TOKEN`, `CLOUDFLARE_WORKERS_AI_API_TOKEN`, `SUPABASE_ANON_KEY`·`SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY`(Supabase가 일시정지라 사실상 휴면), `NEON_DATABASE_URL`·`DATABASE_URL`(Neon, legacy), `VITE_KAKAO_JAVASCRIPT_KEY`, `MOBILE_QA_*_PASSWORD`. 다른 로컬 파일: `.env.local`(`STUDIO_AI_FREE_CLOUDFLARE_API_TOKEN` 등), `.env.mobile-qa.local`, `.env.production.local`.

셸 환경: `wrangler`는 셸에 설정된 `CLOUDFLARE_API_TOKEN`으로 인증한다(Account API Token, 2026-10-22 `wrangler whoami`로 확인). 값의 출처는 로컬 셸 설정이며 저장소 밖이다. Render CLI와 `gh`도 로그인되어 있다 [직접].

### 5.1 원격에만 있던 값 — 2026-10-23 확보 완료

Render MCP에는 환경변수 조회 도구가 없어서, 로그인된 Render CLI의 토큰으로 Render REST API(`GET /v1/services/{id}/env-vars`, Secret File·환경 그룹 포함)를 읽어 위 백업 파일에 저장했다. 값은 출력하지 않았다. `toonspectrum-core-api`에는 환경변수 106개가 있었고 Secret File과 환경 그룹은 없었다. 이 중 81개를 `ONPOD_API_ENV_*`로 옮겼다. 옮기지 않은 것은 Neon을 가리키던 `DATABASE_URL`, 이미지에 있는 `NODE_EXTRA_CA_CERTS`, onpod가 따로 가진 내부 비밀 5개, onpod 6.3절 고정 값과 같은 설정, Supabase 저장소 URL·버킷이다.

- `render.yaml`의 `sync: false` 키 63개 중 26개는 Render에도 처음부터 없었다. Apple 로그인 4개, Toss 결제 키 2개, Upstash 3개, Supabase service role 키, 무료 AI 공급자 키 대부분이 여기에 든다. 운영에서도 꺼져 있던 기능이라 확보할 값이 없다. 결제는 onpod에서도 `missing-keys`로 꺼져 있다(Render와 같다).
- `CLOUDFLARE_EDGE_ORIGIN_SECRET`은 onpod 자체 값을 유지하고, 컷오버 때 Worker `CORE_ORIGIN_SECRET`을 그 값으로 바꿨다. Render 값과 onpod 값은 서로 다르다.
- 실시간 티켓 비밀 `STUDIO_REALTIME_CLOUDFLARE_TICKET_SECRET`은 Render 값을 그대로 옮겼다. 실시간 Worker의 `REALTIME_TICKET_SECRET`과 짝이다. Worker 시크릿은 읽을 수 없어서 2026-10-23 04:46 KST에 같은 값을 실시간 Worker에 다시 넣어 짝을 확정했다(버전 `328327ec`, 코드는 기존 배포와 같다).

## 6. 절차 (복사해 쓸 수 있는 형태)

공통 전제: `onpod` CLI가 로그인되어 있고(`onpod whoami`), 환경변수 `ENVF`가 주 작업트리 루트의 `.env.infrastructure.local` 경로를 가리킨다. 출력에 비밀이 섞일 수 있는 명령은 아래처럼 마스킹을 거친다.

```sh
# 위치: 아무 디렉터리. 부작용: 없음(조회만).
export ONPOD_NO_ERROR_REPORT=1        # 선택: CLI 오류 보고를 onpod 운영팀에 보내지 않는다
onpod whoami && onpod app ls && onpod static ls && onpod db ls
```

### 6.1 마스킹 규칙

`onpod db create`·`onpod db url --rotate` 같은 명령은 비밀번호를 평문으로 출력한다. 출력은 파일로 받아 `sed -E 's#(://[^:/@ ]+:)[^@ ]+@#\1<masked>@#g'`로 가린 뒤에 읽는다. 한글 라벨(`비번:`·`사용자:`) 형태도 출력될 수 있으므로 원본을 채팅·로그에 붙이지 않는다. 2026-10-22에 이 규칙을 어겨 초기 비밀번호가 한 번 노출되어 회전했다.

### 6.2 DB에 직접 접속 (스키마 작업·점검 때만)

```sh
# 부작용: 공개 5432의 허용 범위가 넓어진다. 끝나면 --rm 으로 반드시 제거한다.
MYIP="$(curl -s ifconfig.me)/32"
onpod db allowlist toonstudio-db --add "$MYIP" --label agent       # 반영까지 수십 초. 직후 연결은 SSL EOF로 실패할 수 있다
psql "$(grep -E '^ONPOD_DATABASE_URL_PUBLIC=' "$ENVF" | cut -d= -f2-)" -c 'select now()'
onpod db allowlist toonstudio-db --rm "$MYIP"
```

- TLS는 1.3이지만 인증서가 자체 서명이고 CN이 호스트와 다르다. `verify-full`은 불가능하다. libpq는 `sslmode=require`, Node `pg`는 `sslmode=no-verify`를 쓴다.
- 허용목록은 평상시 **비어 있어야 정상**이다. 앱은 내부 호스트(`*.db.onpod.local`)로 붙으므로 허용목록이 필요 없다.

### 6.3 Core API 배포 (무료 티어, 서울)

전제: 5절의 `ONPOD_API_ENV_*` 키가 파일에 있다(없으면 먼저 `openssl rand -hex 32`로 만들어 저장). 부작용: 앱을 만들거나 교체하고, **DB 비밀번호를 새로 발급한다**. 성공 뒤 6.4절을 실행한다. `onpod app update --env`와 `--env-file`은 환경 전체를 교체하므로 아래 스크립트처럼 항상 전체 목록을 넘긴다.

```sh
#!/bin/sh
# 비밀은 임시 0600 파일(--env-file)로만 전달한다. 명령줄·출력에 값이 나오지 않는다.
set -eu
: "${ENVF:?주 작업트리 루트의 .env.infrastructure.local 경로}"
IMAGE=${IMAGE:-ghcr.io/blue45f/toonspectrum-core-api:4df6d16929171afb25fe866a009febf8a16ea9eb}
APP=${APP:-toonstudio-api}
for k in AUTH_SESSION_SECRET AUTH_STATE_SECRET CLOUDFLARE_EDGE_ORIGIN_SECRET; do
  grep -qE "^ONPOD_API_ENV_${k}=.+" "$ENVF" || { echo "누락: ONPOD_API_ENV_${k}" >&2; exit 2; }
done
umask 077
TMP=$(mktemp -d); trap 'rm -rf "$TMP"' EXIT
{
  cat <<'NONSECRET'
PORT=3000
NODE_ENV=production
API_RUNTIME_ROLE=full
NEST_API_HOST=0.0.0.0
TZ=Asia/Seoul
CATALOG_INGEST_MODE=off
API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud
CANONICAL_HOST=www.toonstudio.cloud
WEB_APP_BASE_URL=https://www.toonstudio.cloud
OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud
AUTH_TRUSTED_PROXY_ENABLED=false
AUTH_TRUSTED_CLIENT_IP_HEADER=x-forwarded-for
AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS=2
AUTH_RATE_LIMIT_MODE=single-instance-local
STUDIO_LIVE_CLUSTER_ADAPTER=memory
STUDIO_LIVE_VOICE_ENABLED=false
NONSECRET
  grep -E '^ONPOD_API_ENV_[A-Z0-9_]+=.+' "$ENVF" | sed 's/^ONPOD_API_ENV_//'
} > "$TMP/api.env"
onpod app deploy --name "$APP" --shape single --free-tier --wait \
  --image "$IMAGE" --port 3000 \
  --attach-db toonstudio-db --attach-db-ssl no-verify \
  --env-file "$TMP/api.env"
```

- `AUTH_TRUSTED_PROXY_ENABLED=true`로 켜면 `AUTH_TRUSTED_PROXY_IPS`(정확한 IP 목록)가 **필수**이고 없으면 앱이 부팅 중 `AuthClientIpConfigurationError`로 죽는다 [직접: 2026-10-22 첫 배포가 이 오류로 실패]. 지금은 끄고 7.3절의 결정이 날 때까지 둔다.
- `PORT=3000`이 필요하다. 이미지는 3000을 열고 앱은 `PORT`를 우선한다(`apps/api/src/main.ts`).
- 외부 연동 환경변수는 2026-10-23에 `ONPOD_API_ENV_*`로 넣었다(5·5.1절). 이 스크립트는 `--attach-db` 때문에 DB 비밀번호를 새로 발급하므로 **이미지만 바꿀 때는 쓰지 않는다**. 이미지 교체는 6.6절의 `onpod app update --image`, 환경변수 추가는 `onpod app env set`(값을 파일에서 읽어 인자로 넘기는 방식)을 쓰고, 같은 키를 이 파일에도 저장한다.

### 6.4 배포·회전 뒤 DB 접속 문자열 동기화

`--attach-db`는 새 비밀번호를 발급해 앱에 주입하고 기존 비밀번호를 무효로 만든다. 서버는 평문을 저장하지 않으므로 살아 있는 값은 **실행 중인 앱의 환경**에서만 읽을 수 있다. 읽은 값은 출력하지 않고 두 줄만 갱신한다.

```sh
# 부작용: $ENVF의 ONPOD_DATABASE_URL·ONPOD_DATABASE_URL_PUBLIC 두 줄만 바뀐다. 비밀번호 지문(sha256 앞 8자리)만 출력한다.
set -eu
LIVE=$(onpod exec toonstudio-api -- sh -c 'printf %s "$DATABASE_URL"')
LIVE="$LIVE" ENVF="$ENVF" python3 -I - <<'PY'
import os, re, hashlib, sys
live, envf = os.environ["LIVE"].strip(), os.environ["ENVF"]
m = re.match(r"^(postgres(?:ql)?)://([^:@/]+):([^@/]+)@([^:/]+):(\d+)/([^?]+)(\?.*)?$", live)
if not m or not m.group(4).endswith(".db.onpod.local"): sys.exit("예상과 다른 DATABASE_URL 형식이라 갱신하지 않는다")
scheme, user, pw, host, port, db, query = m.groups()
internal = f"{scheme}://{user}:{pw}@{host}:{port}/{db}{query or ''}"
public = f"{scheme}://{user}:{pw}@{host.replace('.db.onpod.local', '.db.onpod.ai')}:{port}/{db}?sslmode=require"
lines, seen = open(envf, encoding="utf-8").read().split("\n"), set()
for i, line in enumerate(lines):
    if line.startswith("ONPOD_DATABASE_URL="): lines[i] = "ONPOD_DATABASE_URL=" + internal; seen.add("i")
    elif line.startswith("ONPOD_DATABASE_URL_PUBLIC="): lines[i] = "ONPOD_DATABASE_URL_PUBLIC=" + public; seen.add("p")
if seen != {"i", "p"}: sys.exit("두 키가 모두 있어야 한다. 갱신하지 않는다")
open(envf, "w", encoding="utf-8").write("\n".join(lines)); os.chmod(envf, 0o600)
print("갱신 완료, 비밀번호 지문", hashlib.sha256(pw.encode()).hexdigest()[:8])
PY
```

### 6.5 배포 확인

```sh
A=https://toonstudio-api.onpod.ai
curl -sS -m 40 --retry 12 --retry-delay 4 --retry-all-errors "$A/api/health/live"        # 200 {"status":"ok"}. 절전에서 깰 때 첫 응답은 503일 수 있다
onpod logs toonstudio-api --tail 80                                                      # "Nest application successfully started" 확인
onpod exec toonstudio-api -- sh -c 'grep -E "VmRSS|VmHWM" /proc/1/status; cat /sys/fs/cgroup/memory.max /sys/fs/cgroup/memory.peak'
# 엣지 비밀이 필요한 경로는 헤더 파일로 전달한다(명령줄에 값을 쓰지 않는다)
umask 077; HF=$(mktemp); printf 'x-toonstudio-origin-secret: %s\n' "$(grep -E '^ONPOD_API_ENV_CLOUDFLARE_EDGE_ORIGIN_SECRET=' "$ENVF" | cut -d= -f2-)" > "$HF"
curl -sS -H @"$HF" "$A/api/health/capabilities"; rm -f "$HF"
```

### 6.6 롤백·철수

- 이미지만 되돌리기: `onpod app update toonstudio-api --image <이전 SHA 이미지>`(환경·데이터 보존). `app update --env`는 환경을 교체하므로 쓰지 않는다. 환경변수 한 개: `onpod app env set toonstudio-api KEY=값`(재시작 포함, 나머지 보존).
- 앱 철수: `onpod app rm toonstudio-api`(DB는 그대로). DB 삭제는 `onpod db rm toonstudio-db`이며 7일 유예 안에 `onpod db restore`로 복구한다. **둘 다 사용자 승인 없이 실행하지 않는다.**
- API 롤백: `onpod app rollback toonstudio-api`(직전 이미지 + 직전 환경변수 세대) 또는 위의 이미지 지정 교체. 컷오버 직전 정상 이미지는 `37b51837787ea67ee26b14358a1ac84664a7c584`다(단일 소유자 옵트인이 없어 준비성 503).
- Worker 롤백: `wrangler versions deploy <버전>@100 --name toonspectrum-web`. **컷오버 이전 버전(`70517470`까지)은 `CORE_API_ORIGIN`이 삭제된 Render를 가리키므로 되돌릴 대상이 아니다.** 컷오버 버전 `8d9e24ee` 이후 버전만 고른다.
- Render는 삭제됐다(2026-10-23). 되돌아갈 이전 원점은 없다.

## 7. 측정으로 확인한 제약과 함정 (2026-10-22)

### 7.1 onpod 정적 호스팅으로 웹 셸을 옮기면 깨지는 것 (`ts-web-proto`, 운영 빌드 산출물 2,386개·약 404 MB)

| 항목 | 결과 | 영향 |
| --- | --- | --- |
| 응답 헤더 | `_headers` 미지원. 자산이 `cache-control: no-cache, must-revalidate`로 나가고 압축은 gzip. 운영은 브로틀리와 1년 immutable | 보안 헤더(CSP·HSTS)·캐시 제어를 쓸 수 없다 [직접] |
| 교차 출처 격리 | `/studio`에서 `crossOriginIsolated=false`, `SharedArrayBuffer` 없음(운영은 둘 다 true). 스튜디오는 `sharedArrayBufferAvailable && crossOriginIsolated`로 기능 등급을 정한다 | 공유 포인터 링버퍼·SAB 워커 경로가 꺼져 등급이 내려간다. 렌더·필압 지연에 직접 닿는다 [직접, 저장소: `studio-capability-probe.ts`] |
| `/api/*` 쓰기 | `_redirects` 200 프록시는 GET·HEAD만 통과한다. `POST`·`PUT`·`PATCH`·`DELETE`·`OPTIONS`는 405 `allow: GET, HEAD`(`via: 1.1 Caddy`). 콘솔에서 `POST /api/analytics/traffic/*`가 405 | 모든 쓰기 API가 막힌다. 교차 출처 호출(CORS·쿠키·CSRF)로 재설계해야 한다 [직접] |
| 규칙 한도 | 사이트당 50개, `prefix/*` 또는 정확 경로만, 규칙이 같은 경로의 로컬 파일을 가린다 | 운영 게이트웨이의 27개 worker-first 패턴과 39개 헤더 규칙을 옮길 수 없다 [직접] |
| 용량 | 사이트당 약 100 MiB·5,000개·파일당 50 MB. 셸은 2,386개·약 404 MB(JS·CSS·mjs만 97.4 MiB) | 대형 에셋은 외부(Cloudflare)로 프록시해야 한다. Range 206 정상, 62.8 MB wasm 전송은 운영 직접 3.9초·프록시 2.6초 [직접] |
| 삽입 요소 | 우하단 고정 "Powered by Onpod" 배지(`z-index` 최대)와 JSON-LD가 자동 삽입된다 | UI를 가린다. 무료 플랜에서 끄는 방법은 미확인 [직접] |
| 지연·라우팅 | 한국에서 HTML 첫 바이트 0.29초(운영 0.21초). SPA 딥링크 200, 서비스 워커 `/sw.js` 등록·제어 정상 | 지연은 비슷하다 [직접] |

결론: 웹 정적·엣지 게이트웨이는 무료로는 옮길 수 없다. Cloudflare에 그대로 둔다. 이유는 위 표의 헤더·격리·메서드·용량 네 가지다.

### 7.2 onpod DB `toonstudio-db`의 제약

- **TLS**: 자체 서명 인증서라 `verify-full`이 불가능하다. 공식 마이그레이션 검증기 `scripts/validate-production-database-url.mjs`는 `verify-full`+`channel_binding=require`를 강제하므로 **공식 러너를 그대로 쓸 수 없다**. 앱 런타임은 `sslmode=no-verify`를 받는다(`pg-connection.ts`가 `require`·`prefer`·`verify-ca`를 `verify-full`로 올리므로 `no-verify`여야 한다).
- **단일 소유자 역할**: 접속 역할은 슈퍼유저가 아니고 `CREATEROLE`·`CREATEDB`가 없다. 별도 런타임 역할을 만들 수 없다. 이 때문에 공식 부트스트랩의 롤 생성·롤 ACL·롤 분리 점검 30문을 건너뛰었다(아래).
- **비밀번호**: 서버는 평문을 저장하지 않는다. `onpod db url`은 `{password}` 자리표시자만 보여 주고, 새 값은 `--rotate`·`rotate-password`·`--attach-db`로만 만들어지며 붙어 있는 앱의 기존 연결을 끊는다. 주입된 값은 읽을 때 가려진다. 로컬 파일이 유일한 사본이다(5절).
- **dev 티어**: 계정당 1개, 10 GB, 30일 유휴 시 자동 휴면. 백업·7일 PITR은 [벤더] 서술이며 복구 연습은 하지 않았다.
- **스키마 적용 방식**(2026-10-22, 기준 커밋 `37b51837787ea67ee26b14358a1ac84664a7c584`): 공식 `db:bootstrap:production-empty` 순서(pg_trgm → Drizzle 현재 스키마 838문·196표 → 0001~0019 구조 → 경계 → `adopt`로 원장·체크섬 채택과 0020~0113 적용 → `apply` 재실행으로 멱등 증명)를 그대로 재현하되 아래만 바꿨다. 도구와 diff는 `deploy/onpod/schema-apply/`에 있다.
  - 실행 SQL만 1건 치환: `0093_review_voice_note_constraints_repair`의 비한정 `CREATE OR REPLACE FUNCTION studio_review_voice_note_guard()`를 `public.` 한정으로 실행한다(파일은 불변이라 원장 체크섬은 원본과 같다). 원인은 0093의 `SET LOCAL search_path = pg_catalog, public` 뒤 비한정 CREATE가 `pg_catalog`에 만들어지려 해 비슈퍼유저가 거부당하는 것이다. **운영 마이그레이터가 슈퍼유저가 아니면 운영에서도 같은 실패가 난다.** 나머지 112개는 원문 그대로다.
  - 건너뜀(런타임 역할 불가): 롤 생성·NOLOGIN 게이트·`GRANT … TO 롤`·롤 분리 점검·원장 ACL의 롤 REVOKE·사후 롤 ACL/capability 30문, 마이그레이션 내부 롤 가드(0097·0098), 마지막 `verifyProductionDatabaseCapabilities`.
  - 환경 차이: TLS `require`+`channel_binding=require`(URL을 만들지 않고 `PG*` 환경변수 사용), `DROP EXTENSION pg_trgm` 제외, 사전점검이 PostGIS 객체를 "비어 있지 않음"으로 세어 `DROP SCHEMA public CASCADE`를 요구하는 부분을 "확장 소속 객체 제외"로 변경.
- **적용 결과**: 원장 114행(마이그레이션 113 + 마커 1, `applied` 전부, 체크섬 113/113 일치), 잠금 0행, 기준선 0001~0092 체크섬 92/92 일치, 필수 관계 223/223, `pg_trgm` 1.6, invalid 인덱스·NOT VALID 제약·비활성 트리거 0, 재실행 시 0 applied·113 skipped. 자체 검증 12/12 통과 [직접].
- **매니페스트 밖 표 4개**: `studio_3d_generation_jobs`·`_artifacts`·`_provider_identities`는 API가 런타임에 `CREATE TABLE IF NOT EXISTS`로 만든다(단일 역할이라 자동 생성). `traffic_web_vital`은 만들어지지 않아 웹 바이탈 수집이 실패한다. DDL은 `deploy/onpod/schema-apply/sql/40-out-of-manifest-objects.sql`에 있고 실행하지 않았다.

### 7.3 Core API `toonstudio-api`의 제약과 열린 문제

- **기동**: 이미지 그대로 부팅한다. `/api/health/live` 200, 인증 없는 `/api/auth/session`은 `{"authenticated":false}` 200. 직접 호출은 엣지 비밀이 없으면 403 [직접].
- **DB 준비성 — 2026-10-23 선택지 B로 해결**: 소유자가 B를 택했고 #2420이 병합됐다. 새 이미지 `4df6d1692`에 `DATABASE_RUNTIME_ROLE_MODE=single-owner`를 넣은 뒤 `/api/health/ready`가 200이 됐다(2026-10-23 04:41 KST) [직접]. 아래는 배경 기록이다. 비소유 역할(선택지 A)은 공식 운영 전 강화 과제로 남는다(8절).
- 배경(2026-10-22 측정): 단일 소유자 연결에서는 `/api/health/ready`가 503 `SERVICE_NOT_READY`이고 `/api/health/capabilities`가 `degraded`다. 상태는 `publicCatalog`·`studioLocalEditing`만 `available`, `authSession`·`serverAi` `degraded`, `communityRead`·`communityWrite`·`marketplaceRead`·`studioProjectRead`·`studioCloudSave`·`realtimeCollaboration`·`publishing`이 `unavailable`이다 [직접]. 원인은 `health-readiness.repository.ts`의 `isSchemaReady()`가 요구하는 26개 플래그 중 마켓플레이스 ACL 6개(`marketplaceResourceAclReady`·`…CloudLibraryAclReady`·`…PackageModerationAclReady`·`…PublishGateAclReady`·`…ReportAclReady`·`…ReportGateAclReady`)가 false인 것이다. 각 플래그는 "연결 역할(`current_user`)이 최소 권한이고 `WITH GRANT OPTION`이 없을 것"을 요구하는데 **표 소유자는 REVOKE해도 grant option을 항상 가진다**(롤백 트랜잭션 실측: `REVOKE ALL … FROM CURRENT_USER` 뒤에도 `DELETE WITH GRANT OPTION`이 true). 공식 마켓플레이스 ACL 빌더를 소유자에 적용해도 6개가 모두 false였다. 나머지 20개는 소유자로 true다. **SQL만으로는 풀 수 없고 비소유 로그인 역할이 필요하다.** 같은 이유로 `creator_career_confirmation_require_ready()`도 실패해 경력 확인 기능을 쓸 수 없다.
  - 선택지 A(권장, 코드 변경 없음): onpod가 같은 DB에 비소유 로그인 역할을 발급하게 한다(`onpod db`에는 역할 생성 명령이 없다 — 지원 문의). 역할이 생기면 소유자로 `GRANT CONNECT ON DATABASE … TO <역할>; GRANT USAGE ON SCHEMA public TO <역할>;`를 실행하고, `scripts/run-production-database-migrations.mjs --mode apply … --runtime-database-role <역할>`로 ACL 30문을 적용한 뒤 앱 `DATABASE_URL`을 그 역할로 바꾼다.
  - 선택지 B(옵트인 코드 변경 — **채택: [#2420](https://github.com/blue45f/toonstudio/pull/2420) 2026-10-23 02:41 KST 병합, 같은 날 운영 적용**): `DATABASE_RUNTIME_ROLE_MODE=single-owner`를 명시하면 `isSchemaReady()`가 여섯 비교(`ROLE_SEPARATION_ACL_FLAGS`)만 건너뛰고 나머지 20개 플래그·필수 관계·마이그레이션 마커는 그대로 요구한다. 기본(`separated`)은 지금과 같이 엄격하고, 알 수 없는 값은 부팅이 실패하며, 켜면 시작 시 한국어 경고를 남긴다([production-environment.md](production-environment.md#단일-소유자-db-옵트인)). 런타임 비소유 보장이 약해지므로 이 환경(공식 운영 전, 의미 있는 데이터 없음)에서만 쓴다. 새 이미지 릴리스(PR·CI·`api-container-release`) 뒤 `toonstudio-api`에 환경변수를 넣어야 적용된다. 소유자 연결에서는 `creator_career_confirmation_*` 기능이 여전히 쓸 수 없다.
- **클라이언트 IP — 2026-10-23 운영 적용**([#2419](https://github.com/blue45f/toonstudio/pull/2419) 병합 → Worker `8d9e24ee` 릴리스 → API 이미지 `4df6d1692` → `AUTH_EDGE_CLIENT_IP_ENABLED=true`): 표준 전달 헤더로는 onpod 뒤에서 실제 사용자 IP를 알 수 없다. 실측(2026-10-23, 임시 Worker 미리보기 + 헤더 에코 앱 `ts-hdr-echo`, 둘 다 삭제): ① 브라우저가 직접 접속하면 앱은 `x-forwarded-for`=`접속자, 프록시`를 받고 위조한 `X-Forwarded-For: 203.0.113.7`은 사라진다. ② **Worker를 거치면** `x-forwarded-for`의 첫 값·`x-real-ip`·`cf-connecting-ip`·`x-onpod-client-ip`가 모두 Cloudflare 이그레스 주소 `2a06:98c0:3600::103`이고 Worker가 보낸 위조 `x-forwarded-for`·`x-real-ip`는 보이지 않으며 소켓 피어는 `172.18.0.x`(앱·호스트마다 다름, 다른 앱에서 `172.31.x.x`도 관측)다. ③ 커스텀 헤더 `x-toonstudio-client-ip`·`x-toonstudio-origin-secret`은 두 경로 모두 값 그대로 도착한다. 그래서 `AUTH_TRUSTED_PROXY_*`(정확한 피어 IP 목록)로는 풀리지 않고, 그대로 컷오버하면 인증 속도 제한이 사용자별이 아닌 하나의 공유 신원이 된다. 구현: Worker가 core 요청에 접속자 IP를 전용 헤더 `x-toonstudio-client-ip`로 싣고(클라이언트 값은 항상 먼저 지움), API는 `AUTH_EDGE_CLIENT_IP_ENABLED=true`일 때 같은 요청이 에지 출처 비밀을 증명한 경우에만 그 헤더를 신뢰한다(규칙: [production-environment.md](production-environment.md#클라이언트-ip-전달)). **적용 순서의 원칙**: 헤더를 신뢰하는 API가 위조 헤더를 지우지 않는 옛 Worker의 요청을 받으면 안 된다. 이번에는 옛 Worker가 onpod 출처 비밀을 몰랐으므로(Render 값을 가짐) 환경변수를 먼저 넣고 새 Worker를 컷오버와 같은 배포로 올렸다.
- **메모리**: 컨테이너 한도 512 MiB(`memory.max`=536,870,912). 부팅 정점 `VmHWM` 494,108 kB(약 482 MiB), cgroup `memory.peak` 약 439 MiB, 안정 RSS 373,476 kB(약 365 MiB)다. 부팅 정점 여유가 약 30 MiB뿐이라 부하·캐시가 겹치면 OOM 재시작이 날 수 있다 [직접, 단일 측정]. 상시 가동 `hobby`도 같은 512 MB이므로 플랜 승급으로 풀리지 않는다. 재시작이 보이면 `NODE_OPTIONS=--max-old-space-size=…` 상한을 시험하거나 메모리가 더 큰 플랜(비용 승인 필요)을 쓴다.
- **절전·콜드 스타트**: 30분 무요청이면 절전한다. 재기동 뒤 `Nest application successfully started`까지 약 30초 이내(1회 측정)이고 그동안 ingress는 503을 돌려준다. 웹은 502/503/504를 "깨우는 중"으로 최대 90초 처리한다 [저장소 근거, 측정 전체는 미확인].
- **속도 제한 모드**: 단일 인스턴스라 `AUTH_RATE_LIMIT_MODE=single-instance-local`을 쓴다. 인스턴스를 늘리면 분산 모드(Upstash)가 필요하다.
- **호스트 제한**: 기본 주소 게이트웨이 응답 95초, WebSocket은 약 100초 무트래픽이면 끊긴다 [벤더]. `STUDIO_LIVE_CLUSTER_ADAPTER=memory`로 두었다.

### 7.4 이전 운영(Render)의 최종 상태 — 삭제됨

2026-10-17 05:21 KST부터 DB 경로가 503 `DATABASE_UNAVAILABLE`이었고, 2026-10-22 19:21 KST부터는 부팅마다 `toonspectrum_app` 역할 인증 실패(28P01)로 재시작을 반복했다(교체 인스턴스 24개). 런타임 `DATABASE_URL`은 2026-10-22 15:15 KST에 삭제된 Neon `toonspectrum-production`을 가리켰다. 컷오버 직전 `www`의 `/api/*`는 Render 원점이 응답하지 않아 100초 동안 바이트 하나 없이 끊겼다 [직접]. 환경변수를 백업한 뒤 2026-10-23 05:22 KST에 서비스를 삭제했다.

## 8. 열린 결정·승인 대기

| 항목 | 필요한 것 | 상태 |
| --- | --- | --- |
| 마켓플레이스 ACL 준비성(7.3절) | 선택지 B 채택·적용 | **완료**(2026-10-23) |
| 클라이언트 IP 전달(7.3절) | Worker 릴리스 → API 이미지 → 환경변수 | **완료**(2026-10-23) |
| 원격에만 있던 비밀값 확보(5.1절) | Render API로 백업 후 onpod 주입 | **완료**(2026-10-23) |
| 컷오버: Worker `CORE_API_ORIGIN`·`CORE_ORIGIN_SECRET` 전환 | 소유자 일괄 승인(2026-10-23 03:55 KST) | **완료**(05:14 KST) |
| Render 서비스 20개(Core API 1·검증용 정적 사이트 19) | 백업 후 삭제 | **완료**(2026-10-23) |
| `origin.toonstudio.cloud` CNAME(퇴역 Vercel, `DEPLOYMENT_NOT_FOUND`)과 Vercel 팀의 `toonstudio.cloud` 도메인 등록 | DNS 레코드 삭제의 명시 승인. 레코드를 먼저 지우고 Vercel 도메인을 지운다(순서가 바뀌면 남은 CNAME을 남이 가져갈 수 있다) | 대기 |
| Supabase `toonspectrum-collaboration` 정리 | 데이터 삭제라 소유자가 대시보드에서 직접 삭제(또는 일시정지) | 대기 |
| Neon `toonspectrum-production` | 소유자가 Neon 사용을 중단하며 2026-10-22에 삭제. 복구하지 않는다 | **완료** |
| 비소유 런타임 역할(선택지 A) | onpod 지원 문의(`support@onpod.ai`). 공식 운영 전 강화 과제 | 대기 |
| onpod 전권 토큰 → 범위·만료 키 | 소유자 결정(`onpod key add`). 계정의 키는 전권·무기한 1개다 | 대기 |
| 무료 티어 메모리 부족 시 유료 승급 | 비용 승인 | 조건부 |
| `AGENTS.md` 8절·`deploy/STANDING_APPROVAL.json`에 onpod 단위 반영, `config/free-infrastructure-policy.json` 등록 | 소유자(보호 파일). 이번에는 사실 서술만 고쳤고 상시 승인 범위는 넓히지 않았다 | 대기 |
| 0093 마이그레이션의 비한정 CREATE(7.2절) 수정 | 소유자 승인된 새 forward 마이그레이션 또는 파일 수정 | 대기 |
| 운영 DB 마이그레이션·진단 워크플로 대상 | `production-database-migrations.yml`·`health-recovery-diagnostics.yml`이 아직 Neon·Supabase를 가리킨다. onpod용 경로(`deploy/onpod/schema-apply`)로 바꿀지 결정 | 대기 |

## 9. 변경 이력

- 2026-10-22: 소유자가 도메인만 유지하고 재구축하기로 결정. onpod `toonstudio-db` 생성, 스키마 113개 적용·검증, `toonstudio-api` 병렬 스테이징 배포(DB 준비성 미충족), 웹 셸 프로토타입 측정, 이 문서와 ADR-0030 작성. 컷오버는 하지 않았다.
- 2026-10-23 새벽: Worker→onpod 헤더 체인 실측(임시 Worker 미리보기·에코 앱, 둘 다 삭제)과 클라이언트 IP 전용 헤더 구현·시험, #2419 병합(기본 꺼짐). 단일 소유자 준비성 옵트인 #2420 병합(02:41 KST).
- 2026-10-23 05:14 KST 컷오버: 소유자 일괄 승인(03:55 KST) 뒤 Render 환경변수 백업(04:01), onpod에 설정 병합(04:06), 검증용 자원 정리(04:09: Render 정적 사이트 19개, onpod `ts-web-proto`·정지 팟 2개), main 적색 수리 PR #2426, API 이미지 `4df6d1692` 릴리스와 `toonstudio-api` 교체(준비성 200), Worker `CORE_ORIGIN_SECRET` 교체와 `8d9e24ee` 릴리스(`CORE_API_ORIGIN=https://toonstudio-api.onpod.ai`), 스모크 후 Render `toonspectrum-core-api` 삭제(05:22). API 이미지(`4df6d1692`)와 웹·Worker(`38847c624`)의 SHA가 다른 것은 이미지를 만든 뒤 main에 PR 두 개(#2427 웹 인증, #2425 CI 보안)가 더 병합됐기 때문이다. 두 SHA 사이와 녹색이던 `937d71b16` 이후로 `apps/api` 변경은 없다(`git diff --stat` 비어 있음). Worker 배포 SHA `38847c624`는 core·verify 녹색을 확인했다.
- 2026-10-23 컷오버 뒤 점검(05:15~): 공개 경로 live·ready 200, 능력 11개 모두 `available`, `edgeOriginAuth=enforced`(원점 직접 호출 403), OAuth 시작 4종(Google·GitHub·Kakao·Naver) 302와 www 콜백, DB 읽기·익명 쓰기(page-view 202)·표지 프록시 200, `/studio`의 `crossOriginIsolated=true`, 제품 투어 실재생 게이트(G5-1·G5-2) 전체 통과. 서버 오류 로그 0건, OOM 0건. Apple 로그인은 Render 때와 같이 자격 증명이 없어 꺼져 있다.
- 2026-10-23 05:18 KST: 소유자 요청으로 `blue45f@gmail.com`(새 DB의 첫 계정)을 첫 관리자로 지정했다(`user.role=admin`, `admin_audit_logs`에 `USER_ROLE_CHANGE` 기록). 이메일 기반 관리자 부여는 코드에서 제거됐고 DB 역할만 권한을 정한다.
