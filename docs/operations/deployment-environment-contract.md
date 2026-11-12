# 로컬·클라우드 배포 환경 계약

상태: **current** — 저장소의 설정 참조와 오프라인 점검 절차(2026-11-05).
공급자 현재 사실의 근거는 [인프라 지도](infrastructure-map.md)의 **2026-10-29 직접 확인 기록**이다.
이 작업에서 운영 API·DB·provider console에 접속하지 않았으며 인증·비밀 유효성을 확인하지 않았다.

## 어디를 수정하는가

[environment-contract.json](../../config/deployment/environment-contract.json)은 배포 경계 변수의 이름,
목적, type/허용값, 소스 기본값, 필수 조건, 공개 범위, 프로필별 기대값, secret 짝을 표현한다.
`default: null`은 안전한 공통 기본값이 없다는 뜻이다. 기본값과 프로필은 설명용이며 **환경에 주입하지 않는다**.
`server-config`도 브라우저에 공개해도 된다는 뜻이 아니다. 명시적으로 `public`인 항목만 공개 빌드 후보이다.

전체 API 세부 변수와 숫자 범위의 정본은 [API env.ts](../../apps/api/src/config/env.ts)와 해당 소비자다.
preflight는 이를 대체하거나 전체 API 설정이 유효하다고 보증하지 않는다. 비밀 이름은 이 파일의 `SECRET_KEYS`를
읽어 재사용하고, 배포 enum은 focused test로 source와 대조한다. Worker의 binding·자원·운영 한도 기본값은
manifest의 `iac` 참조가 정본이다. R2, Durable Objects, D1 binding은 문자열 env만으로 재생성되지 않는다.
분석 Worker는 현재 저장소에 wrangler 설정이 없으므로 `src/index.ts`의 `ANALYTICS_DB` binding 계약과 인프라 지도를 함께 확인한다.

API `validateEnv()`는 일반 schema 실패 시 경고 후 null을 반환하지만, **production 인증 HMAC 검사에서 먼저 throw할 수 있다**.
누락·공백 패딩·32 UTF-8 byte 미만인 session/state secret은 부팅을 막는다. source의 “절대 throw하지 않는다” 주석은
이 예외를 반영하지 못한다. 제품 코드 변경과 중복 검증은 이 작업 범위에 포함하지 않았다.
배포 계약은 실수 방지를 위해 production에서 session/state 모두 명시하도록 더 보수적으로 요구한다.
런타임의 state fallback 허용을 제거하는 변경은 아니다.

## 프로필을 먼저 고른다

| 프로필 | 상태 | 파일/용도 | DB·인증 제한·분석 |
| --- | --- | --- | --- |
| `local` | current | `.env.example`, 로컬 개발 참조 | separated 기본, 개발 제한 자동 선택, postgres 기본 |
| `onpod-current` | current 기록 | `deploy/onpod/runtime.env.example` | single-owner, single-instance-local, d1, memory adapter, 증명된 edge IP 활성 |
| `generic-separated` | target | `.env.production.example`, 일반 분리 역할 설계 예제 | separated, distributed + Upstash 필수, postgres, memory adapter |
| Render/Vercel/Neon runtime | retired | 과거 기록만 | 배포·fallback·rollback 대상으로 선택하지 않는다 |

current 기록의 API origin은 `https://toonstudio-api.onpod.ai`, 내부 DB host는 `toonstudio-db.db.onpod.local`이다.
onpod의 단일 소유자 모드는 최소 권한 역할 분리 보장을 제공하지 않고 준비성의 ACL 비교 여섯 개만 면제한다.
단일 프로세스 인증 제한과 memory adapter도 다중 인스턴스 안전성을 제공하지 않는다. 예제를 다중 인스턴스에 그대로 쓰지 않는다.
프로필 변경은 설정 주입·운영 변경 승인이 아니며 실제 변경은 별도 검토한다.

`production-database-migrations.yml`은 verify-full/channel binding과 dedicated runtime role을 요구한다.
`health-recovery-diagnostics.yml`의 `production-inspect`는 삭제된 Neon hostname/neondb와 분리 역할을 고정한다.
두 workflow는 secret만 교체해 onpod에 실행할 수 없다. preflight는 onpod DDL과 퇴역 recovery를 차단한다.
`deploy/onpod/schema-apply`는 2026-10-22 고정 SHA의 재현 기록이며 현행 배포 자동화로 연결하지 않는다.
기존 TLS·역할 검증을 완화하거나 workflow의 대상을 몰래 바꾸지 않는다.

## 값 없는 로컬 참조와 클라우드 입력

이 환경의 `.env.deployment-reference.local`은 Git ignored, 0600인 **빈 대입 목록**이다. 기존 env 파일은 수정하지 않았다.
주 macOS checkout의 `.env.infrastructure.local`은 다른 파일이며 이 클라우드에서 자동으로 보이지 않는다.
Wrangler 암호화 파일·macOS Keychain 로그인도 전달되지 않는다. 로컬 파일 metadata 확인은 값의 존재·유효성 보장이 아니다.

클라우드 작업은 승인된 secret store에서 **해당 작업에 필요한 이름만** session 환경에 명시적으로 주입받아야 한다.
preflight는 dotenv 파일을 찾거나 source하지 않으며 `ONPOD_API_ENV_*`를 자동 변환하지 않는다.
인프라 지도의 로컬 `ONPOD_API_ENV_<이름>`은 공급자용 보관 이름이고 API runtime은 `<이름>`을 소비한다.
Worker의 `CORE_ORIGIN_SECRET`과 API의 `CLOUDFLARE_EDGE_ORIGIN_SECRET`은 별도 목적지에서 관리하는 같은 값이다.
실시간 ticket/control 및 analytics RPC도 manifest `pairs`의 이름·목적지 계약을 따른다. ticket과 control은 서로 달라야 한다.
모든 공급자 비밀을 API runtime에 한꺼번에 넣지 않는다. 검사는 `--unit api|static-worker|realtime-worker|analytics-worker|build` 중 한 목적지를 선택한다.
짝의 원문 값을 검사 목적으로 클라우드에 모으지 않는다. 양쪽이 이미 승인된 동일 환경에 명시적으로 제공된 경우에만 비교한다.
한 목적지 검사에서는 상대 목적지의 비밀을 요구하지 않는다. 세션은 작업 종료 후 폐기한다.

## 오프라인 preflight

저장소 루트 또는 다른 디렉터리에서 Node 24로 실행한다. Git/파일 읽기만 수행한다.
명시적으로 승인받은 secret 주입이 없다면 production은 `blocked`로 끝나는 것이 정상이다.
아래 예시는 값을 넣지 않으며 배포를 시작하지 않는다.

```sh
cd /workspace/toonstudio
node scripts/deployment-preflight.mjs --profile local --sha "$(git rev-parse HEAD)"
node scripts/deployment-preflight.mjs --profile onpod-current --sha "$(git rev-parse HEAD)"
# 기존 workflow 호환성만 확인: onpod에서는 반드시 blocked
node scripts/deployment-preflight.mjs --profile onpod-current --sha "$(git rev-parse HEAD)" --operation database-migrations
```

기본 목적은 `--operation runtime-config --unit api`이다. runtime-config는 선택 단위의 명시적 설정만 검사한다.
다른 목적은 `container-release`, `onpod-image-update`, `static-deploy`, `r2-assets`, `database-migrations`,
`health-recovery`이다. 이미지 생성·onpod 이미지 교체·정적 코드·R2 작업에는 DB/Auth/OAuth runtime 비밀을 요구하지 않는다.
각 목적의 `providerAuth`는 인증 변수 이름의 존재만 검사하며 scope·권한·유효성은 미확인이다.
이 경로는 현재 cloud session의 토큰 방식만 다룬다. 로컬 Wrangler OAuth를 클라우드에 전달하거나 추출하지 않는다.
일반 DB migration 목적만 직접 연결 secret과 분리 runtime 역할을 요구하며 onpod는 계속 차단한다.

출력은 허용된 변수 이름·설정 유무·오류 코드·정확한 SHA뿐이다. 값·DSN·쿠키·사용자 식별자·원문 예외는 출력하지 않는다.
종료 코드 0은 `offline-contract-only`, 1은 계약 오류, 2는 CLI/저장소 오류이다.
인자 오류도 입력 원문을 재출력하지 않는다. 검사에 secret을 명령행 인자로 전달하지 않는다.
`REMOTE_AUTH_UNVERIFIED`, `REMOTE_RUNTIME_UNVERIFIED`, `REMOTE_SECRET_PAIRS_UNVERIFIED`, `LOCAL_ENV_NOT_LOADED`, `RELEASE_CI_APPROVAL_UNVERIFIED`는 항상 남긴다.
변경된 작업트리는 `WORKTREE_DIFF_NOT_COVERED_BY_SHA`를 남긴다. SHA 일치는 로컬 checkout 확인일 뿐,
protected main 소속·CI 통과·배포 산출물 일치·운영 반영을 증명하지 않는다.

`MISSING_REQUIRED`/`MISSING_PROFILE_SETTING`은 이름만 확인하고 승인된 주입을 요청한다.
`PROFILE_DRIFT`는 선택 프로필과 설정이 다르다는 뜻이다. 운영 값을 자동 수정하지 않는다.
`SECRET_PAIR_MISMATCH`는 두 목적지 값을 함께 검토해야 한다. 자동 회전·덮어쓰기는 하지 않는다.
`SERVER_SECRET_IN_PUBLIC_ENV`/`SERVER_SECRET_VALUE_IN_PUBLIC_ENV`는 공개 빌드를 중단하고 변수 경계를 수정한다.
짝의 원문을 모으라는 요구가 아니다. 원격 secret을 읽어 비교하지 않으므로 주입된 짝의 일치는 원격 두 저장소의 일치 증명이 아니다.
onpod runtime DSN 형식 점검은 원격 TLS 검증이 아니며 일반 DDL validator를 우회하는 허가가 아니다.

## 승인 뒤 가능한 최소 비밀 주입 경로

이 작업에서 발급·복사·등록·OAuth grant는 실행하지 않았다. 아래는 사용자 검토를 위한 대상 명세다.
provider별 세부 권한의 실제 지원 여부·정확한 resource ID는 소유자가 확인해야 한다.

| 목적 | 변수/목적지 | 최소 범위·기간 | 승인 항목 |
| --- | --- | --- | --- |
| 오프라인 설정 검토 | 선택한 runtime 단위 변수만 사용자 소유 session secret 입력 → 격리 cloud session env | provider 토큰 불필요, 해당 세션만 | 값별 사용 목적·세션·폐기 시점 |
| API 실행 설정 | `DATABASE_URL`, `AUTH_SESSION_SECRET`, `AUTH_STATE_SECRET`, edge·realtime·analytics 비밀 → onpod `toonstudio-api` runtime secret store | runtime 서비스만, 지속 보관 | 대상 앱·환경·각 이름·기존 값 유지/변경·회전 영향 |
| Worker 실행 설정 | `CORE_ORIGIN_SECRET` → `toonspectrum-web`; `REALTIME_TICKET_SECRET`/`REALTIME_CONTROL_SECRET` → realtime; `ANALYTICS_RPC_TOKEN` → analytics Worker secret store | 해당 Worker만, 지속 보관 | 비밀 짝·목적지·기존 세션/티켓 영향 |
| 향후 Cloudflare 배포 | 사용자 소유 CI environment/session의 `CLOUDFLARE_API_TOKEN`, account 식별 설정 | 현재 코드가 지원하는 API 토큰; Worker 배포와 R2 REST 권한은 별도 검토; 작업 종료 만료 | 리소스·scope·만료·지속 여부; 이 작업에는 불필요 |
| 향후 onpod 이미지 작업 | 사용자 소유 제한 키를 격리 배포 session의 `ONPOD_TOKEN`으로 주입 | 가능하면 앱 조회·이미지 교체만, 단기 만료 | 정확한 앱·동작·기간; 전권 사용자 토큰 사용 금지 |
| 향후 generic DB DDL | `PRODUCTION_DATABASE_DIRECT_URL`, `PRODUCTION_RUNTIME_DATABASE_ROLE` → 사용자 소유 GitHub `production-database` Environment | 승인 reviewer, 직접 연결·분리 역할, 필요 기간만; onpod 미지원 | 새 target 검증·TLS·역할·IP·추가형 migration·롤백 |

세션 한정 접근은 격리 작업 종료와 함께 제거한다. 지속 자동화는 사용자 소유 environment의 reviewer·접근자·만료/회수 절차를
먼저 정하고 등록한다. 클라우드에 local env 전체 복사, 전권 토큰 추출, Keychain export를 하지 않는다.
기존 유일 사본일 수 있는 로컬 비밀을 읽거나 이동하지 않는다.
onpod 이미지-only 교체는 기존 remote env를 보존하므로 runtime secret 재주입을 요구하지 않는다.
Static Worker의 `keep_vars: true`는 저장소에서 확인했다. secret을 보존하는 코드 배포 경로를 검토할 때
기존 `CORE_ORIGIN_SECRET` 원문을 다시 클라우드에 모으지 않는다. 실제 remote secret 존재는 미확인으로 둔다.
현재 R2 동기화는 Cloudflare REST API와 `CLOUDFLARE_API_TOKEN`을 사용한다. S3용 bucket-scoped Object Read & Write
credential을 현재 REST 코드에 그대로 사용할 수 있다고 가정하지 않는다. bucket-only 권한이 필요하면 S3 전환을 별도 검토한다.
per-Worker Editor token은 최소 권한 후보지만 정확한 지원 scope와 현재 배포 호출의 권한 호환성은 이번 오프라인 작업에서 확인하지 않았다. 필요한 값이 없으면 이름·목적지만 보고하고 중단한다.
`--attach-db`, `rotate-password`는 기존 credential을 무효화하므로 이 절차에서 사용하지 않는다.

## 배포·실패·복구 경계

실제 배포는 기존 단위별 승인 정책(유효한 checked-in standing approval의 대체 경로 포함), 정확한 main SHA, clean worktree, 필수 CI, 산출물 검증, 컷오버 이후 정상 rollback 후보가 필요하다. 매 릴리스 수동 승인 sentinel이 항상 필요하다고 해석하지 않는다.
preflight 성공은 승인 대체가 아니다. onpod는 상시 승인 범위 밖이다. 실패 시 설정을 자동 수정하지 않고 원인을 보고한다.
퇴역 Render나 pre-cutover Worker로 롤백하지 않는다. onpod 복구는 상시 승인 범위 밖이므로 사용자의 별도 명시 승인을 받은 뒤
`onpod app update toonstudio-api --image <컷오버-이후-직전-정상-이미지>`로 이미지만 교체한다.
`onpod app rollback`은 환경변수 세대까지 되돌려 API·Worker secret 짝과 DB credential을 파손할 수 있으므로 사용하지 않는다.
문서·계약 변경 자체의 복구는 이 diff를 되돌리는 것이며 운영 영향은 없다.
