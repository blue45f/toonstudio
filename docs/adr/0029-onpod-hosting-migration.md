# ADR-0029: onpod.ai 무료 플랜으로의 호스팅 이전 평가와 단계 계획

- 상태: Proposed
- 날짜: 2026-10-22
- 범위: Core API 런타임, 정적 웹·엣지 게이트웨이, 실시간 조정자, 대형 에셋, DB의 호스팅 위치. 제품 기능과 데이터 모델은 범위 밖이다.
- 관련: [최소 비용·수동 전용 배포 정책](../operations/minimum-cost-deployment-policy.md), [운영 DB / 데이터 플레인 정본](../operations/canonical-database-topology.md), [`DEPLOY.md`](../../DEPLOY.md), [`deploy/STANDING_APPROVAL.json`](../../deploy/STANDING_APPROVAL.json), [`render.yaml`](../../render.yaml), [정적 에셋 게이트웨이](../../deploy/cloudflare-static/README.md), [`config/free-infrastructure-policy.json`](../../config/free-infrastructure-policy.json)
- 문서 상태: 맥락의 현재 상태는 `current`, 결정은 `target`(제안)이다. 이 문서는 **제안만** 한다. 소유자가 수용하기 전에는 운영 배포·환경 변수·도메인·비밀값을 바꾸지 않는다.

## 맥락

요청(2026-10-22)은 "<https://onpod.ai/#free> 로 인프라를 모두 옮겼으면 한다"였다. 결론을 정해 두지 않고 onpod의 공개 문서(`onpod.ai`, `console.onpod.ai/docs`, `api.onpod.ai/v1/manual`·`/v1/openapi.json`, 이용약관)를 2026-10-22에 읽고 현재 구성과 맞대어 보았다. 조회한 사실과 읽지 못한 사실을 구분해 적는다.

현재 상태(`current`):

| 영역 | 현재 위치 | 근거 |
| --- | --- | --- |
| 정적 웹·카탈로그·일반 에셋 | Cloudflare Static Assets (`public/`은 3.5 GB, 15,553개 파일) | 정적 에셋 게이트웨이 문서 |
| 동적 경로 게이트웨이·edge liveness·NEIS 키 프록시·보안 헤더 | Cloudflare Worker (`deploy/cloudflare-static/src` 1,879줄 + 시험 1,951줄) | 같은 문서 |
| apex 리다이렉트 | Cloudflare Worker (`deploy/cloudflare-apex-redirect`) | 같은 디렉터리 |
| 25 MiB 초과 파일 | 압축 Static Assets + R2 | 같은 문서 |
| 실시간 조정(presence·커서·댓글 알림·화면 공유 신호) | Cloudflare Durable Objects (`deploy/cloudflare-realtime/src` 7,306줄 + 시험 3,762줄) | 같은 디렉터리 |
| 분석 버퍼 | Cloudflare D1 | 운영 DB 정본 |
| Core API | Render 무료 `toonspectrum-core-api`(싱가포르), 이미지 `ghcr.io/blue45f/toonspectrum-core-api:<40자리 SHA>` | `render.yaml`, `api-container-release.yml` |
| PostgreSQL 원장 | Supabase PostgreSQL 17(정본). 운영 런타임 `DATABASE_URL`은 아직 Neon을 가리킨다(별도 정합 과제) | 운영 DB 정본 |
| 그 밖의 data plane | 정책 파일이 workload별 공급자 37곳을 고정한다(CockroachDB·TiDB·Turso·Cosmos·DynamoDB·Firestore·MongoDB·Upstash 등) | `free-infrastructure-policy.json` |

이 구성은 소유자가 정한 `free-strict` 정책(자동 배포 금지, 자동 유료 승격 금지, workload마다 쓰기 권위 하나)을 따른다.

## onpod에서 확인한 것

무료로 쓸 수 있다고 문서에 적힌 것(2026-10-22 조회):

| 항목 | 무료 한도·성질 | 출처 |
| --- | --- | --- |
| 정적 사이트 | 계정당 10개, 사이트당 100 MB, 파일당 50 MB, 한 번 배포에 5,000개 파일, 월 트래픽 100 GB(넘으면 다음 달 1일까지 일시 중지, 자동 과금 없음) | 콘솔 문서 `website`, 매뉴얼 |
| 정적 사이트 기능 | 사용자 도메인(apex·www)과 자동 HTTPS 무료, `_redirects`/`onpod.json` 경로 프록시(대상은 공개 HTTPS), SPA fallback. 응답 헤더(CSP 등)와 캐시 제어는 문서에 없다. 같은 이름의 에셋은 최대 1시간 낡을 수 있다 | 같은 문서 |
| 서버 앱 무료(`--free-tier`) | 메모리 512 MB, 30분 무방문 시 절전, 방문하면 몇 초 안에 기동, 디스크 없음(`--persistent` 불가), 웹 앱 하나(`--port`)만 가능하고 봇·워커는 불가 | 콘솔 문서 `app`, 매뉴얼 |
| 서버 앱 시간 한도 | 기본 주소 게이트웨이 95초, 사용자 도메인 300초, 기본 주소에서 WebSocket은 약 100초 무트래픽이면 끊긴다(20~30초 하트비트 권장) | 콘솔 문서 `app` |
| 이미지 배포 | `ghcr.io`·`docker.io` 등 허용 목록의 레지스트리 이미지를 `--image`로 배포한다. 비공개 이미지만 `onpod registry add`로 자격 증명을 등록하는 것으로 적혀 있고, 공개 이미지는 등록 없이 배포하는 것으로 읽힌다(시험 배포로 확인한다) | 매뉴얼 |
| 개발용 Postgres | 계정당 1개, 크기 한도 문서에 없음, 서울 기본, 매분 백업 + 일일 스냅샷 + 7일 시점 복구, pgvector·PostGIS·pgcrypto·pg_trgm 자동. **TLS는 자체 서명 인증서**라 Node `pg`는 `sslmode=no-verify`가 필요하다. 외부 접속은 IP 허용 목록이 있어야 한다 | 콘솔 문서 `db` |

무료가 아닌 것: 상시 가동 Hobby(0.5 vCPU·512 MB)는 월 9,450원. 오브젝트 스토리지는 월 GB당 45원, 공개 CDN 버킷은 월 GB당 60원(전송 무료).

문서에 없거나 읽지 못한 것: 무료 플랜의 CPU·디스크·앱 개수, 무료 DB의 크기·연결 수, 무료 플랜의 상업적 이용 허락과 가용성 보증(이용약관은 무료 플랜을 다루지 않고 상업적 이용을 명시적으로 허락하지 않는다. 가용성 수치는 없고, 손해배상은 직전 3개월 지급 요금이 상한이라 무료 이용자에게는 사실상 0원으로 읽힌다), 유휴 삭제 정책, 데이터 내보내기 절차. 랜딩 페이지는 "상업용까지 전부 무료"라고 적었지만 약관 문구가 아니므로 계약상 근거로 보지 않는다.

onpod 자신의 매뉴얼도 **회사 서비스·납품물에는 `--free-tier`를 권하지 않는다**(30분 유휴 뒤 첫 방문자가 콜드 스타트를 겪는다). 무료 경로는 임시 데모·실험용이고, 상시 운영은 유료 상시 가동을 권한다.

## 판정

| 구성요소 | 판정 | 근거 |
| --- | --- | --- |
| Core API 런타임 | **이전 가능(1단계 제안)** | 이미지가 이미 공개 GHCR에 있어 그대로 배포할 수 있다. 무료 절전형(서울)은 현재 Render 무료(싱가포르)와 같은 성격이고, 절전에서 깨어나는 데 "몇 초"라고 문서에 적혀 있다(실측은 하지 않았다). 기존 수동 릴리스 순서와 롤백(Cloudflare `CORE_API_ORIGIN` 되돌림)이 그대로 적용된다 |
| 정적 웹·카탈로그·에셋 | **이전 불가(무료 한도)** | 3.5 GB·15,553개 파일 대 사이트당 100 MB·5,000개 파일×10곳(합계 1 GB·5만 개)이다. i18n 하나만 7,220개 파일이라 한 사이트의 파일 수 한도를 넘는다 |
| 엣지 게이트웨이(보안 헤더·API 프록시·liveness·OG·NEIS·Range) | **이전 불가(대체물 없음)** | 정적 호스팅은 응답 헤더 제어가 문서에 없다. 같은 일을 하려면 Node 서버를 직접 세워야 하고, 정문이 절전하면 모든 방문자가 콜드 스타트를 겪는다 |
| 실시간 조정자 | **이전 보류** | Durable Objects의 방 단위 단일 기록자 의미를 무료 서버 앱(절전·WebSocket 100초 끊김·단일 인스턴스)이 대신하지 못한다. 7천 줄 규모의 재작성이다 |
| PostgreSQL 원장 | **이전하지 않음(권고)** | 소유자가 Supabase를 정본으로 정했다. onpod 무료 DB는 계정당 1개·크기 미명시·자체 서명 TLS라 현재 `sslmode=verify-full` 계약을 낮춰야 한다. 2026-09-29 확인 기준 데이터 양(계정 1, 작품 1 수준)이 작아 나중에 옮기는 일 자체는 어렵지 않다 |
| 그 밖의 연합 data plane(~40곳) | **범위 밖** | 단일 공급자로 합치면 정책 파일의 workload별 권위 구조를 바꾸는 일이다. 호스팅 이전이 아니다 |

따라서 "모두"를 **무료 한도 안에서, 지금 구조 그대로** 옮기는 것은 불가능하다. 억지로 하면 정문이 절전형이 되고 보안 헤더·대형 파일·실시간이 사라진다. 유료 상시 가동과 재작성을 받아들이면 옮길 수 있는지는 아래 결정 4와 [인수인계](#인수인계-신규-세션용)의 검증 항목으로 다시 판정한다. 이 판정은 공개 문서와 한도 수치만으로 한 1차 평가이고 시험 배포로 확인하지 않았다.

## 결정(제안)

1. **1단계: Core API만 onpod 무료 절전형으로 옮긴다.** 비용 0원, 서울 리전, 공개 GHCR 이미지 그대로, 롤백은 Cloudflare 변수 되돌림. 기존 `core-api-container-release`·`render-core-api-image-deploy` 상시 승인 범위를 같은 모양으로 쓰되, onpod는 새 배포 단위이므로 **소유자의 명시 승인**을 받는다.
2. **정적 웹·엣지·R2·Durable Objects·D1·DNS는 Cloudflare에 둔다.** 이쪽이 이미 무료이며 한도와 기능이 맞는다.
3. **DB는 Supabase를 유지한다.** 이전하는 김에 런타임 `DATABASE_URL`이 Neon을 가리키는 불일치만 바로잡는다(소유자 승인 필요).
4. 전체 이전은 다음 조건을 **모두** 소유자가 받아들일 때만 다시 연다: 월 약 9,700원(상시 가동 게이트웨이 9,450 + 3.5 GB 공개 버킷 약 210) 이상의 비용, 엣지 Worker와 실시간 조정자의 재작성(약 9천 줄 + 시험), 약관상 상업적 이용·가용성 보증이 없다는 사실.

## 1단계 절차 (수동 릴리스 순서에 맞춤)

1. **사전(소유자)**: onpod 가입(Google 로그인과 약관 동의는 소유자만 할 수 있다) → 콘솔에서 API 키 발급 → 클라우드 환경 설정에 환경 변수 `ONPOD_TOKEN`으로 저장한다(새 세션부터 적용). 대화에 붙여 넣지 않는다. 토큰을 쓰지 않는 길도 있다: claude.ai 커넥터에 사용자 지정 URL `https://api.onpod.ai/mcp`를 추가하면 OAuth로 로그인하고 배포할 프로젝트를 고른다(매뉴얼). 기본 발급물은 계정 전권 토큰(`op_u_…`)이다. 범위를 좁힌 `opk_` 키는 기업 계정용으로 적혀 있으므로, 발급할 수 있다면 `pods:write`·`domains:write`·`registry:read` 정도로 좁힌다.
2. **약관 확인(소유자)**: 무료 플랜의 상업적 이용 허락과 유휴 삭제 정책을 onpod에 서면으로 확인한다. 답을 받기 전에는 4번(전환)을 하지 않는다.
3. **앱 생성**: `onpod app deploy --shape single --free-tier --name toonstudio-core-api --image ghcr.io/blue45f/toonspectrum-core-api:<승인한 40자리 SHA> --port 3000 --env PORT=3000 --env …`. 앱은 `PORT`가 있으면 그 값을, 없으면 `NEST_API_PORT`, 그것도 없으면 4001을 연다([`apps/api/src/main.ts`](../../apps/api/src/main.ts)). 이미지는 3000을 열어 두므로 `--port`와 `PORT`를 같은 값으로 준다. 환경 변수 이름은 [`render.yaml`](../../render.yaml)의 `envVars`와 같다. 비공개 값(`DATABASE_URL`, `AUTH_SESSION_SECRET`, `AUTH_STATE_SECRET`, `CLOUDFLARE_EDGE_ORIGIN_SECRET` 등)은 Render 대시보드의 암호화 값이라 사람이 옮기려면 번거롭다. 이 세션 환경에는 로컬 전용 저장소(`.env.infrastructure.local`)에 Render API 키가 있어, 소유자가 승인하면 값을 화면·로그·저장소에 내보내지 않고 메모리에서만 읽어 onpod에 주입할 수 있다. 승인하지 않으면 소유자가 직접 주입하거나 새 값을 발급한다(모든 로그인 세션이 무효가 된다).
4. **검증 후 전환**: `RENDER_CORE_API_ORIGIN=https://toonstudio-core-api.onpod.ai pnpm run verify:render-core-origin`이 통과해야 한다(스크립트는 공급자와 무관하게 HTTPS origin의 `/api/health/live`·`/ready` 계약을 본다). 통과하면 Cloudflare 정적 Worker의 `CORE_API_ORIGIN`을 새 origin으로 바꿔 `cloudflare-static-production` 절차로 배포한다. 환경 변수 변경이므로 이 시점에도 소유자 확인을 한 번 받는다.
5. **관찰(24~72시간)**: 콜드 스타트 시간, 512 MB에서의 메모리 부족 재시작, Socket.IO가 기본 주소에서 100초 무트래픽에 끊기는지(끊기면 하트비트 또는 `*.direct.onpod.ai` 사용), 요청 본문·시간 한도. 신뢰 프록시 홉 수(`AUTH_TRUSTED_PROXY_MAX_FORWARDED_HOPS=2`)는 Cloudflare Worker → onpod 게이트웨이 → 앱 경로에서 맞는지 요청 한 건으로 앱이 본 클라이언트 IP를 대조해 확인한다. 어긋나면 IP 기반 속도 제한이 틀어진다.
6. **롤백**: Worker 변수를 이전 Render origin으로 되돌려 재배포한다. 앱 자체는 `onpod app rollback`으로 직전 이미지·환경으로 되돌린다. Render 서비스는 안정이 확인될 때까지 멈추기만 하고 지우지 않는다.
7. **정리**: [최소 비용 정책](../operations/minimum-cost-deployment-policy.md)의 운영 권위 표와 [`DEPLOY.md`](../../DEPLOY.md)를 갱신한다. Render에는 Core API 외에 2026-09-09 검증용 정적 사이트가 19개 이상 남아 있다(2026-10-22 조회). 삭제는 별도 승인 항목으로 둔다.

## 위험

- 무료 절전형은 첫 방문자가 콜드 스타트를 겪는다. Cloudflare가 정적 요청과 liveness를 대신 답하므로 영향은 동적 요청에 한정된다(현재 Render 무료와 같은 구조).
- 계약상 가용성·상업적 이용 보증이 없다. 서비스가 갑자기 바뀌거나 사라지면 Render 서비스를 남겨 둔 상태에서 변수 하나로 돌아올 수 있어야 한다.
- 비공개 값의 이전 경로가 소유자에게 달려 있다. 값이 채팅·로그·저장소에 남지 않게 한다([`AGENTS.md`](../../AGENTS.md) 로컬 시크릿 정책).
- 무료 DB를 쓰지 않으므로 TLS 검증을 낮추는 일은 하지 않는다.

## 열린 결정

1. 위 1~3번 범위로 진행해도 되는가, 아니면 4번 조건을 받아들여 전체 이전을 설계하는가.
2. 상업적 이용·유휴 삭제 확인 전에 시험 배포(전환 없음)를 해도 되는가.
3. 비공개 값 이전을 (a) 이 세션이 값을 노출하지 않고 메모리에서만 옮기는 방식으로 하는가, (b) 소유자가 직접 하는가, (c) 새로 발급하는가.

## 인수인계 (신규 세션용)

2026-10-22 소유자가 "왜 불가능한가, 어떻게 구성할지 상세히 검토하라"고 물은 뒤, 이 이전 작업을 **이 세션에서는 중지하고 신규 세션에서 이어가라**고 지시했다. 이 세션이 onpod에서 한 일은 설치 스크립트 검토·CLI 설치·로그인·**읽기 전용 조회**뿐이다. 앱·정적 사이트·DB·버킷을 만들지 않았고, Render·Cloudflare·Supabase는 건드리지 않았다.

### 이 세션에서 실측한 계정 사실 (`onpod plans`·`whoami`·`key ls`·`ls`, 2026-10-22)

- 위 "onpod에서 확인한 것"의 일부를 바로잡는다: 개발용 Postgres는 **10 GB·만든 사람당 1개·30일 무사용 시 절전**이다(크기 미명시가 아니다). 상시 가동 앱 요금은 Hobby 0.5 vCPU·512 MB 월 약 9,449원, Standard 1 vCPU·2 GB 약 33,750원, Pro 2 vCPU·4 GB 약 66,149원이다. 관리형 Postgres Basic(8 GB RAM·50 GB 디스크)은 월 약 19,710원이다. 정적 사이트는 무료로 10개·100 MB·월 100 GB이고 사용자 도메인이 무료다. 오브젝트 스토리지는 GB당 월 45원(다운로드 무료)이다.
- 계정은 개인 작업 공간이고 **잔액이 0원**이다. 그래서 유료 자원은 충전 없이는 만들 수 없을 것으로 보인다(시도하지 않았고, 카드 등록 여부도 조회하지 않았다). 기본 지출 상한은 앱당 월 20만 원·계정 월 100만 원이다. 떠 있는 자원(앱·정적 사이트·DB·버킷)은 없다.
- 발급된 API 키는 하나이고 **전권(`*`)·만료 없음**이다. 이 키는 대화에 노출되었으므로 신규 세션 전에 폐기하고, 가능하면 범위를 좁히거나 만료를 둔 키로 새로 발급한다.
- 설치 스크립트(`https://onpod.ai/install.sh`)는 읽어 본 뒤 실행했다. `https://onpod.ai/cli/onpod-<os>-<arch>`를 받아 같은 폴더의 `sha256sums.txt`와 대조하고 `/usr/local/bin` 또는 `~/.local/bin`에 둘 뿐이다. 설치된 버전은 0.7.142다.

### 신규 세션을 시작하는 법

1. 키를 **환경 변수 `ONPOD_TOKEN`** 으로 클라우드 환경 설정에 등록한다(세션 제목줄의 환경 메뉴 → Edit → Network secrets 또는 환경 변수). 대화에 붙여 넣지 않는다. 이 세션이 저장한 로컬 전용 `.env.infrastructure.local`(저장소 밖 무시 파일)은 이 컨테이너의 파일이므로 새 세션에 넘어간다고 가정하지 않는다.
2. 이 문서가 있는 브랜치(`claude/stoic-wright-qe9yjc`, PR [#2397](https://github.com/blue45f/toonstudio/pull/2397))를 읽고 시작한다.
3. `onpod login --url https://api.onpod.ai --token "$ONPOD_TOKEN"` 뒤 `onpod manual --brief`와 `onpod manual --lang ko`를 읽는다.

### 신규 세션이 실측해야 할 항목 (판정을 고치는 근거)

1. **실제 배포물 크기**: 3.5 GB·15,553개는 `public/` 원본 합계다. 정적 배포 대상(`build:bundle` 산출물)의 총 크기·파일 수·25 MiB 초과 파일 수를 다시 센다. 무료 정적 사이트 합계(1 GB·사이트당 5,000개)를 넘는지가 정적 이전 가능 여부를 가른다.
2. **정적 호스팅의 응답 헤더**: CSP·COOP/COEP·캐시 제어를 `onpod.json`/`_headers`로 줄 수 있는지 시험 사이트로 확인한다. 안 되면 엣지 게이트웨이(보안 헤더·API 프록시)가 대체물 없이 남는다.
3. **무료 서버 앱**: 공개 GHCR 이미지를 등록 없이 배포하는지, 콜드 스타트 시간, 512 MB에서의 메모리, 기본 주소에서 WebSocket 100초 끊김을 시험 배포(전환 없음)로 잰다.
4. **사용자 도메인**: Cloudflare DNS 위에서 apex·www를 연결하고 인증서가 발급되는지, 무료 플랜에서 되는지 확인한다.
5. **비용 경계**: 공개 에셋 3.5 GB는 오브젝트 스토리지(월 약 160~210원)가 필요하고 잔액이 0원이라 충전 없이는 만들 수 없다. "비용 0원" 지시와 충돌하므로 소유자 확인이 먼저다.
6. **재작성 범위**: 엣지 Worker(1,879줄)와 실시간 조정자(7,306줄)를 Node 서버로 옮기는 설계안과, 그 서버를 유료 상시 가동(월 약 9,449원~)으로 둘 때의 총비용을 산출한다. Durable Objects의 방 단위 단일 기록자 의미를 어떻게 지킬지(단일 인스턴스 + Postgres advisory lock 등)가 핵심이다.

### 구성안 (신규 세션에서 확정)

| 안 | 구성 | 월 비용 | 재작성 | 판단 |
| --- | --- | --- | --- | --- |
| A (현재 제안) | Core API만 onpod 무료(서울), 나머지는 Cloudflare·Supabase 유지 | 0원 | 없음 | 즉시 가능. 위 1단계 절차 |
| B (전부 onpod, 최소 유료) | 정적·게이트웨이·실시간·Core API를 onpod 앱 + 공개 버킷으로, DB는 Supabase 유지 | 약 1만~2만 원(상시 가동 앱 1~2개 + 버킷) | 엣지 Worker·실시간 약 9천 줄 + 시험 | 소유자의 충전·재작성 수용이 필요. 실측 후 확정 |
| C (전부 무료) | 무료 정적·무료 앱·개발 DB만 | 0원 | 있음 | 1 GB 한도·헤더·실시간 때문에 지금 구조로는 담기지 않음(실측 1·2번으로 재확인) |
