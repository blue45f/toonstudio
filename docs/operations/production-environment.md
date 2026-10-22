# 운영 환경변수와 자격 증명

툰스튜디오 운영 자격 증명은 Git 저장소에 평문으로 저장하지 않는다. 정적 웹의 기본 권위는
Cloudflare Static Assets, 동적 Core API의 기본 권위는 Render `toonstudio-core-api`다. 실제
비밀값은 공급자의 encrypted environment, Render Secret File 또는 GitHub `production` Environment
Secrets에 보관하고 저장소에는 변수명·검증 규칙·자동화 코드만 둔다. Vercel 런타임과 배포 코드는
퇴역했으며 Cloudflare/Render 운영 경로에 포함하지 않는다.

## 운영 원칙

- 기존 운영 비밀을 자동으로 출력·회전·정규화하지 않는다.
- `main` push, scheduled data update, PR 생성은 어떤 공급자에도 자동 배포하지 않는다.
- 누락된 값만 추가하고 기존 값 변경은 별도 키 회전으로 취급한다.
- `DATABASE_URL`처럼 외부 시스템의 실제 연결 정보가 필요한 값은 임의 생성하지 않는다.
- 실제 API는 `AUTH_SESSION_SECRET`을 우선 사용하고 없으면 `AUTH_STATE_SECRET`을 세션 서명에 사용한다.
  둘 다 없으면 적용·배포를 중단한다.
- OAuth 인가 코드 공급자가 구성된 경우 `AUTH_STATE_SECRET`도 필요하다.
- 새 인증 비밀은 앞뒤 공백 없는 32 UTF-8 바이트 이상이어야 한다.
- 비밀값은 로그, GitHub Summary, PR 코멘트, 빌드 산출물과 채팅에 출력하지 않는다.
- `VITE_` 접두사에는 공개 가능한 URL만 넣고 토큰·비밀번호·DB URL을 넣지 않는다.
- 환경변수 변경 후에는 해당 runtime만 수동 재배포하고 readiness를 다시 검증한다.

## Render Core API

`render.yaml`의 `toonstudio-core-api`는 `API_RUNTIME_ROLE=full`인 기본 동적 권위다. 서비스는
`autoDeployTrigger: off`를 유지하며 build/start에서 migration을 실행하지 않는다.

필수값:

- `DATABASE_URL`
- `AUTH_SESSION_SECRET` 또는 `AUTH_STATE_SECRET`
- OAuth 인가 코드 공급자를 쓰는 경우 `AUTH_STATE_SECRET`
- `API_CORS_ALLOWED_ORIGINS=https://www.toonstudio.cloud,https://toonstudio.cloud`
- `OAUTH_REDIRECT_BASE_URL=https://www.toonstudio.cloud`
- `WEB_APP_BASE_URL=https://www.toonstudio.cloud`
- `CANONICAL_HOST=www.toonstudio.cloud`

기존 운영값을 옮길 때는 Render encrypted environment를 사용하거나 root `.env.local` Secret File로
주입한다. `apps/api/src/load-env.ts`는 프로세스 초기 import에서 이 파일을 읽는다. Secret File은
Render dashboard에서 암호화하여 저장하고 로컬 임시 파일은 전환 완료 후 삭제한다. 파일 내용이나
비밀값을 터미널에 출력하지 않는다.

선택적 공급자 값:

- 현재 API 공급자 설정에 맞는 `GOOGLE_OAUTH_*`, `KAKAO_*`, `NAVER_*`, `GITHUB_OAUTH_*`
- 개인 저장소 OAuth의 `GOOGLE_DRIVE_OAUTH_*`, `DROPBOX_OAUTH_*`, `ONEDRIVE_OAUTH_*`,
  `PERSONAL_CLOUD_OAUTH_STATE_SECRET`, `PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY`
- `KMAS_PRV_KEY` — 승인된 만화규장각 서버 전용 키; 브라우저 `VITE_*`에는 금지
- 사용자 키가 아닌 운영자 제공 AI 경로를 실제 활성화할 때만 해당 provider key
- `OPENAI_API_KEY`
- `OPENROUTER_API_KEY`
- `BLOB_READ_WRITE_TOKEN`
- `PRIVATE_OBJECT_STORAGE_ENABLED`, `PRIVATE_OBJECT_STORAGE_*_PROVIDER`,
  `PRIVATE_OBJECT_STORAGE_ROUTING_FINGERPRINT`
- `R2_OBJECT_STORAGE_*` — R2가 선택된 purpose만 구성
- `B2_OBJECT_STORAGE_*` — B2가 선택된 purpose만 구성
- `SUPABASE_OBJECT_STORAGE_*` — legacy 또는 선택된 Supabase purpose
- 기존 `R2_*`, `S3_*`, `CREATOR_ASSET_OBJECT_STORAGE_*` — 해당 레거시 코드가 실제 참조할 때만 유지
- `UPSTASH_COORDINATION_*`
- Cloudflare realtime ticket issuer·audience·secret·TTL

선택값이 없으면 해당 기능은 명시적으로 비활성 또는 구성되지 않음 상태를 표시해야 하며, 공개 페이지와
로컬 Studio 기능을 중단해서는 안 된다.

개인 저장소 공급자의 콘솔 등록값, 최소 scope, 운영·로컬 콜백은 [`personal-cloud-provider-registration.md`](./personal-cloud-provider-registration.md)를 따른다.

## 에지 출처 인증

상태: current (2026-10-16). Core API 원본(Render 주소)은 공개 주소입니다. `CLOUDFLARE_EDGE_ORIGIN_SECRET`을 설정하면 API는
`x-toonstudio-origin-secret` 헤더가 이 값과 같은 요청만 처리하고, Cloudflare 게이트웨이를 거치지 않은 직접 요청에는 HTTP 403
(`Trusted edge origin is required`)으로 답합니다. 게이트웨이 Worker는 같은 값을 `CORE_ORIGIN_SECRET`에서 읽어 원본으로 보내는
요청마다 헤더를 붙입니다.

| 항목 | 규칙 |
| --- | --- |
| 값 | API의 `CLOUDFLARE_EDGE_ORIGIN_SECRET`과 Worker의 `CORE_ORIGIN_SECRET`은 같은 값이며, 앞뒤 공백 없는 32 UTF-8 바이트 이상입니다. 저장소·로그·채팅에 출력하지 않습니다. |
| 비워 둘 때 | 선택 설정이라 부팅을 막지 않지만 원본이 직접 요청도 모두 처리합니다. production의 공개 웹 API 역할(`API_RUNTIME_ROLE=full`)이면 시작 때 오류 로그(보안 경고)를 남깁니다. `studio-live`·`capability-worker` 역할은 대상이 아닙니다. |
| 잘못된 값 | 32바이트 미만이거나 앞뒤에 공백이 있으면 API가 시작하지 못하고, Worker는 503(`CORE_API_UNAVAILABLE`)으로 닫습니다. |
| 비밀 없이 통과 | `GET`·`HEAD`의 `/api/health`, `/api/health/live`, `/api/health/ready`(플랫폼 헬스체크). |
| 회전 | 두 값을 함께 바꿔야 하고 새·옛 값을 겹쳐 허용하는 기능이 없어 짧은 오류 구간이 생길 수 있습니다. 무중단 회전 절차는 아직 정해지지 않았습니다. |

배포 후 확인(`DEPLOY.md` 5절과 같음):

1. `GET https://www.toonstudio.cloud/api/health/capabilities` 응답의 `edgeOriginAuth`가 `enforced`인지 봅니다.
2. Render 원본 주소로 직접 `GET /api/auth/providers`를 보내 HTTP 403이 오는지 봅니다.

### 클라이언트 IP 전달

상태: migration (2026-10-22, 기본은 꺼짐). onpod 같은 PaaS ingress는 `X-Forwarded-For`·`X-Real-IP`·`CF-Connecting-IP`를 앞단 주소로
덮어쓰고 소켓 피어 IP도 앱·호스트마다 달라 `AUTH_TRUSTED_PROXY_IPS`(정확한 IP 목록)를 유지할 수 없습니다. 임시 Worker 미리보기와 헤더
에코 앱으로 실측한 결과 Worker 경유 요청의 표준 IP 헤더 네 개(`x-forwarded-for`의 첫 값, `x-real-ip`, `cf-connecting-ip`,
`x-onpod-client-ip`)가 모두 Cloudflare 이그레스 주소(`2a06:98c0:3600::103`)였고, Worker가 보낸 커스텀 헤더 `x-toonstudio-client-ip`와
`x-toonstudio-origin-secret`은 값 그대로 도착했습니다. 이 상태에서는 인증 속도 제한이 사용자별이 아니라 하나의 공유 신원으로 동작합니다.

| 항목 | 규칙 |
| --- | --- |
| 게이트웨이 | Worker는 core로 보내는 요청에서 클라이언트가 보낸 `x-toonstudio-client-ip`를 항상 지우고, `CORE_ORIGIN_SECRET`이 있으며 접속자 IP(`cf-connecting-ip`)를 알 때만 그 값을 이 헤더에 싣습니다. public-read·대형 에셋·OG 경로에는 싣지 않습니다. |
| API | `AUTH_EDGE_CLIENT_IP_ENABLED=true`이면 같은 요청이 `x-toonstudio-origin-secret`을 증명할 때만 이 헤더의 단일 IP를 신뢰합니다. 비밀 불일치·누락, IP가 아닌 값, 목록 값이면 기존 신뢰 경계(`AUTH_TRUSTED_PROXY_*` 또는 소켓 주소)로 되돌아갑니다. 증명된 전용 헤더가 있으면 프록시 체인보다 먼저 씁니다. |
| 켜는 조건 | `CLOUDFLARE_EDGE_ORIGIN_SECRET`이 유효해야 합니다. 없거나 형식이 틀리면 API가 시작하지 못합니다(증명 수단 없이 헤더를 신뢰하지 않습니다). 꺼져 있으면(기본) 헤더가 있어도 무시합니다. |
| 배포 순서 | 1) Worker 릴리스(헤더를 싣습니다. 이전 API는 무시합니다) → 2) API 이미지 릴리스 → 3) 대상 환경에 `AUTH_EDGE_CLIENT_IP_ENABLED=true`. 되돌릴 때는 3)만 끕니다. |
| 확인 | 켠 뒤 서로 다른 두 네트워크에서 같은 속도 제한 경로를 호출해 한쪽의 제한이 다른 쪽으로 번지지 않는지 봅니다(API에 접속자 IP를 돌려주는 경로는 없습니다). 시험은 `apps/api/src/modules/auth/auth-client-ip.test.ts`와 `deploy/cloudflare-static/src/index.test.ts`가 맡습니다. |

### 상태 응답의 `edgeOriginAuth` 노출은 의도한 선택입니다

`GET /api/health/capabilities`는 인증 없이 읽을 수 있고 `Cache-Control: no-store`로 답합니다. 응답의 `edgeOriginAuth`
(`enforced` | `disabled`)는 누구에게나 "원본이 게이트웨이 밖의 직접 요청을 받아 주는지"(`disabled`)를 알려 줍니다. 이 노출을 알고
수용합니다.

- **보이는 정보**: 집행 여부 한 단어뿐입니다. 비밀 값, 길이, 형식 오류의 구체적 이유는 담지 않습니다. 형식이 잘못된 값은 서버가
  시작하지 못하므로 `disabled`는 "비어 있음"만 뜻합니다.
- **보는 사람**: 게이트웨이를 통해 이 경로를 부를 수 있는 누구나 봅니다. 집행 중이면 원본에 직접 부른 같은 경로는 403이라
  `enforced`도 게이트웨이 경유로만 보입니다.
- **수용하는 이유**: 원본 주소는 `render.yaml`·`DEPLOY.md`·`CORE_API_ORIGIN` 구성으로 이미 공개된 정보이고, 누구든 원본에 직접 요청
  하나를 보내면 같은 사실(집행 중이면 403)을 응답 코드로 알 수 있습니다. 이 필드가 공격자에게 주는 새 능력은 없습니다. 반대로
  운영자는 배포 직후 설정 누락을 요청 한 번(또는 모니터링의 `disabled` 알림)으로 확인합니다.
- **위험의 크기**: `disabled` 환경의 실제 문제는 원본 직접 접근이 열려 있다는 사실이고 필드는 그것을 알릴 뿐입니다. 해결은 비밀을
  설정하는 것이지 필드를 숨기는 것이 아닙니다.

필드를 지우거나 인증 뒤로 옮기면 배포 후 점검이 관리자 인증이나 로그 열람에 의존하게 됩니다. 노출 정책 변경은 별도 결정입니다.

## 단일 소유자 DB 옵트인

상태: migration (2026-10-22, 기본은 `separated`). 공식 설계는 마이그레이터(스키마 소유자)와 런타임 로그인 역할을 분리하고,
`/api/health/ready`는 마켓플레이스 표 여섯 개(`creator_marketplace_resource`·`…_library_item`·`…_package_moderation`·`…_publish_gate`·
`…_report`·`…_report_gate`)에서 연결 역할(`current_user`)이 최소 권한이며 `WITH GRANT OPTION`이 없는지 검사합니다. 표 소유자는
권한을 REVOKE해도 grant option을 항상 가져 이 검사를 통과할 수 없습니다(롤백 트랜잭션 실측). 별도 역할을 만들 수 없는 관리형 DB(예:
onpod dev 티어는 소유자 역할 하나뿐이고 `CREATEROLE`이 없다)에서는 `/api/health/ready`가 항상 503이 되고 DB 기반 기능이 모두
`unavailable`이 됩니다.

| 항목 | 규칙 |
| --- | --- |
| 설정 | `DATABASE_RUNTIME_ROLE_MODE=separated`(기본, 비워도 같음) \| `single-owner`. 알 수 없는 값은 API가 시작하지 못합니다. |
| `single-owner`의 효과 | `isSchemaReady()`가 위 여섯 ACL 비교(`ROLE_SEPARATION_ACL_FLAGS`)만 건너뜁니다. 나머지 플래그(트리거·인덱스·생성 열·`authRuntimeDmlReady` 등), 필수 관계 223개, 마이그레이션 마커는 그대로 요구합니다. |
| 약해지는 보장 | 런타임 역할이 스키마 소유자라 최소 권한·grant option 부재를 DB가 보장하지 않습니다. 앱 코드 결함이 곧 스키마 변경 권한으로 이어질 수 있습니다. 소유자 연결에서는 `creator_career_confirmation_*`(`*_require_ready()`가 "런타임은 스키마를 소유·프로비저닝하지 않는다"로 거부)도 쓸 수 없습니다. |
| 가시성 | 켜면 시작 때 한국어 경고(`[env] 보안 경고: DATABASE_RUNTIME_ROLE_MODE=single-owner …`)를 남깁니다. 공개 응답(`/api/health/capabilities`)에는 노출하지 않습니다. |
| 쓸 수 있는 곳 | 공식 운영 전이거나 별도 로그인 역할을 만들 수 없는 평가 환경. 비소유 로그인 역할을 확보하면 이 설정을 지우고 `--runtime-database-role`로 ACL을 적용합니다. |
| 시험 | `apps/api/src/modules/health/health-readiness.repository.test.ts`(기본 엄격 유지, 옵트인 시 여섯 개만 면제, 다른 플래그·관계·마커 누락은 여전히 거부), `health-readiness-role-separation.test.ts`(면제 판정 함수), `apps/api/src/config/database-role-mode.test.ts`. |

## Supabase 저장소 인증 형식

신규 서버 전용 키는 `SUPABASE_OBJECT_STORAGE_SECRET_KEY`로 주입한다. 새 키는 JWT가 아니므로
저장소 요청의 `apikey` 헤더에만 전달한다. 기존 `SUPABASE_OBJECT_STORAGE_SERVICE_ROLE_KEY`는
하위 호환을 위해 유지하며 기존 JWT는 `apikey`와 `Authorization: Bearer`를 함께 사용한다.
신규 이름이 명시됐으면 우선하며, 빈 값·공백·publishable key를 기존 키로 숨겨서 대체하지 않는다.
두 이름을 동시에 설정하거나 예제의 빈 신규 변수를 그대로 활성화하지 않는다.

활성화 전 기존 세 purpose 버킷의 실제 HTTP 응답과 비공개 여부를 확인한다. DB에서 버킷 행이
보이는 것만으로 인증 성공을 대신하지 않는다. 검증이 실패하면 저장소 활성화와 배포를 중단한다.
기존 키를 회전하지 않으며 토큰을 채팅, Git, 로그, 브라우저 번들에 넣지 않는다.

공급자 계약: <https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys>

## Render 전환 검증

환경 주입과 수동 deploy가 완료된 뒤 Cloudflare origin을 바꾸기 전에 다음을 실행한다.

```bash
RENDER_CORE_API_ORIGIN=https://toonstudio-core-api.onrender.com \
  pnpm run verify:render-core-origin
```

검증기는 다음을 요구한다.

1. HTTPS origin에 credential·path·query·fragment가 없음
2. `/api/health/live`가 redirect 없이 `200 {"status":"ok"}`
3. `/api/health/ready`가 redirect 없이 `200 {"status":"ready"}`
4. 응답에 `x-vercel-id`가 없음
5. 응답 본문이 제한된 크기의 JSON 계약과 일치함

무료 Render는 inactivity 후 cold start가 발생할 수 있으므로 충분한 timeout을 사용하지만 503 readiness나
DB schema 실패를 성공으로 취급하지 않는다.

## Cloudflare 운영 환경

기본 정적 릴리스는 다음 검증을 수행한다.

```bash
pnpm run validate:architecture
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run
```

Render 검증 후에만 다음 origin으로 수동 배포한다.

```bash
export CLOUDFLARE_CORE_API_ORIGIN=https://toonstudio-core-api.onrender.com
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
export TOONSPECTRUM_APPROVED_MAIN_SHA=<사용자가 승인한 main의 소문자 40자리 SHA>
pnpm run cloudflare:static:deploy
```

production 모드(`scripts/deploy-cloudflare-static.mjs --production`)는 승인 문구와 함께 소문자 40자리
`TOONSPECTRUM_APPROVED_MAIN_SHA`, 현재 브랜치 `main`, 깨끗한 작업 트리, `HEAD`와 승인 SHA의 일치를 모두
요구하며 하나라도 어긋나면 빌드 전에 중단한다. SHA 값은 비밀이 아니지만 승인 기록이므로 `HEAD`에서 자동으로
채우지 않고 승인된 값을 입력한다.

`/api/health`와 `/api/health/live`는 Cloudflare edge에서 응답하고 `/api/health/ready`만 Render의 DB·schema
readiness를 확인한다. 대형 파일은 Static Assets sidecar와 R2가 담당하며 Core API를 파일 fallback으로
사용하지 않는다.

## GitHub production environment secrets

운영 migration과 수동 자동화가 사용할 비밀은 GitHub 저장소의 `production` Environment에 등록한다.
Cloudflare token은 최소권한으로 제공하며 Core API origin은 비밀이 아닌 검토된 HTTPS origin이다.
DB migration용 direct URL과 runtime `DATABASE_URL`은 역할과 권한이 다른 값이어야 한다.

정상 릴리스에 필요한 secret만 유지한다. 퇴역한 `VERCEL_TOKEN`, `VERCEL_ORG_ID`,
`VERCEL_PROJECT_ID`는 GitHub Environment에서 삭제하고 다른 자동화가 참조하지 않는지 확인한다.

## 키 노출 대응

실제 키가 Git 이력, 빌드 로그, 이슈 또는 채팅에 노출된 경우 파일 삭제만으로 끝내지 않는다.

1. 해당 공급자에서 키를 즉시 폐기한다.
2. 새 키를 발급한다.
3. Render와 필요한 GitHub Environment Secret을 갱신한다.
4. 해당 runtime을 수동 재배포하고 readiness·로그인·OAuth를 검증한다.
5. 노출 기간의 접근 로그와 비용 사용량을 확인한다.
