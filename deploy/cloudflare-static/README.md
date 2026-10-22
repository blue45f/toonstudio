# Cloudflare Static Assets gateway

이 배포 단위는 ToonStudio 웹 앱을 **정적 에셋 우선**으로 제공하고, 동적 요청만 기능별 무료 인프라 권위로 전달한다. 정적 HTML, JS, CSS, 카탈로그, 브러시 manifest는 Static Assets가 직접 처리하므로 Worker 호출량을 사용하지 않는다.

Cloudflare 배포 빌드는 별도 지정이 없으면 `VITE_CATALOG_SOURCE=static`을 사용한다. 따라서 홈·랭킹·검색·작품 카탈로그의 대부분은 생성된 JSON과 브라우저 정적 엔진에서 처리되고, 동적 public-read origin 풀은 정적 모드로 해결할 수 없는 호환·점진 전환 경로로만 남는다. 검토된 롤백이 필요할 때만 `VITE_CATALOG_SOURCE=api`를 명시한다.

Worker는 다음 동적 경로에만 먼저 실행된다.

- `/api`, `/api/*`
- `/socket.io`, `/socket.io/*`
- 정확히 한 slug를 가진 `/title/:slug`
- `/market`, `/market/browse`, 정확히 한 ID를 가진 `/market/resource/:resourceId`

`/market/library`, `/market/publish` 같은 앱 화면은 Static Assets의 SPA fallback이 처리한다. Worker-first 범위를 넓혀 정적 트래픽을 유료·제한형 실행 요청으로 바꾸지 않는다.

## 무료 인프라 연합 라우팅

동적 요청은 경로와 메서드에 따라 다음 권위로 분리한다.

| workload | 경로 | Worker 변수 | 실패·폴백 정책 |
|---|---|---|---|
| edge liveness | `/api/health`, `/api/health/live`의 `GET`/`HEAD` | Worker 자체 | Core API를 깨우지 않고 `no-store`로 `status=ok` 응답 |
| NEIS 창작 자료 | `/api/creator-resources/search?provider=neis` | Worker secret `NEIS_API_KEY` | 키를 우선 사용하고 공급자 오류 시 공식 무키 샘플 5건으로 축소 폴백, 15분 캐시·호출 제한 적용 |
| core | 나머지 `/api/*`, OG crawler 경로, `/api/catalog/*`, `/api/health/ready`, `/api/config` | `CORE_API_ORIGIN` | 단일 권위, 자동 write failover 없음 |
| public read | 안전한 `GET`/`HEAD`/`OPTIONS`의 `/api/random`, `/api/home`, `/api/calendar`, `/api/insights`, `/api/ranking`, `/api/explore`, `/api/tags`, `/api/search`, `/api/titles/*`, `/api/authors/*`, `/api/kmas/book-webtoons`, `/api/cover`, `/api/public/*` | `PUBLIC_READ_API_ORIGINS` | 최대 8개 동일 계약 origin에 결정적 분산, `502`/`503`/`504`와 네트워크 오류만 다음 origin 재시도 |
| social | `/api/community`, `/api/reviews` | `SOCIAL_API_ORIGIN` | 미설정 시 core, 명시한 설정이 잘못되면 fail closed |
| playground | `/api/fortune`, `/api/play` | `PLAYGROUND_API_ORIGIN` | 미설정 시 core, 명시한 설정이 잘못되면 fail closed |
| admin | `/api/admin` | `ADMIN_API_ORIGIN` | 단일 권위, 자동 failover 없음 |
| realtime | `/socket.io`, `/api/realtime`, `/api/studio-live` | `REALTIME_API_ORIGIN` | 단일 권위, WebSocket handle 그대로 전달 |
| large asset | Static Assets의 25 MiB 제한을 넘는 검토된 WASM/GLB 경로 | 압축 Static Assets + R2 `LARGE_ASSETS` binding | 일반 읽기는 Brotli/gzip sidecar, Range·압축 미지원은 R2, 두 계층 누락/장애 시 명시한 `LARGE_ASSET_ORIGIN`만 사용 |

공개 읽기 풀은 `cf-ray + path + query`를 affinity key로 사용해 동일 요청을 안정적으로 origin에 배치한다. 첫 origin이 일시적으로 실패한 경우에만 다음 읽기 origin을 시도한다. `POST`, `PUT`, `PATCH`, `DELETE`와 기타 권위 요청은 복수 공급자에 재전송하지 않는다. 이 규칙은 무료 한도를 병렬로 활용하면서 중복 쓰기와 split-brain을 방지한다.

readiness, runtime config, 관리자 경로처럼 운영 상태나 기준 권위를 나타내는 경로는 메서드가 읽기여도 공개 replica 풀에 포함하지 않는다. 공개 읽기 allowlist는 실제 API controller와 함께 검토하며, 새로운 prefix를 포괄적으로 자동 분산하지 않는다.

### 공개 replica 보안 경계

공개 읽기 origin은 사용자별 권위를 갖지 않는다. Worker는 public-read 요청에서 다음 정보를 제거한 뒤 replica로 전달한다.

- `Authorization`, `Proxy-Authorization`, `Cookie`
- `x-user-*`, `x-admin-*`, `x-csrf-*`, `x-session-*`
- 클라이언트가 직접 보낸 `Forwarded`, `X-Forwarded-For`, `X-Real-IP`, `True-Client-IP`

core·social·playground·admin·realtime 요청의 전달 IP는 클라이언트 입력을 신뢰하지 않고 Cloudflare가 제공한 bounded `CF-Connecting-IP`만 `X-Forwarded-For`로 다시 구성한다. public-read replica에는 IP도 전달하지 않는다. 재시도 대상 응답의 body는 취소해 연결·메모리 자원을 회수한다.

`CORE_ORIGIN_SECRET`이 설정된 core 요청에는 같은 접속자 IP를 전용 헤더 `x-toonstudio-client-ip`에도 싣는다(클라이언트가 보낸 값은 항상 먼저 지운다). onpod 같은 PaaS ingress는 `X-Forwarded-For`·`X-Real-IP`·`CF-Connecting-IP`를 앞단 주소로 덮어써서(2026-10-22 실측: Worker 경유 요청이 모두 Cloudflare 이그레스 주소로 보인다) 표준 헤더만으로는 API가 실제 접속자를 알 수 없지만, 커스텀 헤더는 그대로 통과한다. Core API는 `AUTH_EDGE_CLIENT_IP_ENABLED=true`일 때 같은 요청이 `x-toonstudio-origin-secret`을 증명한 경우에만 이 헤더를 신뢰한다. public-read·대형 에셋·OG 경로와 출처 비밀이 없는 요청에는 싣지 않는다. 규칙은 [`docs/operations/production-environment.md`](../../docs/operations/production-environment.md#클라이언트-ip-전달)를 따른다.

각 upstream 요청에는 다음 관측 헤더가 추가된다.

- `x-toonstudio-edge: cloudflare-static-gateway-v2`
- `x-toonstudio-edge-route: core | public-read | social | playground | admin | realtime | large-asset`
- `x-toonstudio-edge-attempt: 0..n`
- 대형 파일 응답의 `x-toonstudio-large-asset-source: static-br | static-gzip | r2`

사용자 credential을 Worker 변수에 저장하지 않는다. `NEIS_API_KEY`는 사용자 계정 토큰이 아닌 서버 전용 제공처 키이며, 평문 `vars`나 저장소 파일이 아니라 Wrangler secret으로만 등록한다. 키 호출이 실패하면 같은 요청에서 비밀값 없이 공식 샘플 조회로 전환하고, 이후 10분 동안 실패한 키를 다시 호출하지 않는다.

## Origin 설정 계약

모든 origin은 다음 조건을 만족해야 한다.

- 절대 `https://` origin
- username/password 없음
- path, query, fragment 없음
- 공개 읽기 풀에서는 중복 origin 금지
- 공개 읽기 풀 최대 8개
- 현재 정적 gateway 자신을 가리키는 origin 금지

공개 읽기 풀의 **일부라도** 현재 gateway를 가리키면 해당 origin만 제거하고 진행하지 않고 전체 구성을 fail closed 한다. 잘못된 풀 일부를 숨긴 채 재귀 프록시가 발생하는 상황을 방지하기 위한 규칙이다.

`CORE_API_ORIGIN`은 동적 원장의 필수 권위다. 나머지 기능별 origin이 비어 있으면 해당 요청은 core로 유지되므로 기능을 단계적으로 분리할 수 있다. 반대로 변수가 존재하지만 유효하지 않으면 조용히 core로 우회하지 않고 `503 CORE_API_UNAVAILABLE`로 닫힌다. 대형 파일만 예외로, sidecar와 R2가 실패해도 `LARGE_ASSET_ORIGIN`을 명시하지 않았다면 Core API를 파일 서버로 깨우지 않고 `503 LARGE_ASSET_UNAVAILABLE`을 반환한다.

예시는 [`.env.example`](./.env.example)을 참고한다.

## 검증

```bash
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run
```

검증 범위에는 다음이 포함된다.

- 정적 요청이 Worker를 통과하지 않는지
- Cloudflare build가 기본적으로 static catalog를 사용하는지
- core·social·playground·admin·realtime 경로 격리
- 공개 읽기의 결정적 분산과 안전한 재시도
- 공개 replica에 세션·사용자·IP credential이 전달되지 않는지
- catalog ingest·readiness·runtime config가 core에 남는지
- write 요청이 replica 풀로 전달되지 않는지
- 잘못된·중복된·일부 자기참조 origin fail-closed
- POST body stream을 손상하지 않는 URL rewrite
- OG route mapping과 WebSocket passthrough
- provider-neutral 보안 헤더 계약과 Cloudflare 동적 응답 동기화
- NEIS 키 우선 검색, 무키 5건 폴백, 캐시·회로차단·호출 제한과 출처 영수증
- R2 대형 파일의 전체·HEAD·Range·ETag 응답과 원본 fallback

`dry-run`은 로컬 프로덕션 빌드를 만든 뒤 Wrangler 번들·Static Assets 구성과 모든 origin 변수를 검사하지만 원격에 배포하지 않는다.

### 25 MiB 초과 정적 파일

Cloudflare Static Assets의 개별 파일 한도는 25 MiB다. 배포 전에 `prepare:cloudflare-static-assets`가 `dist` 전체를 검사하고, 검토된 OpenCascade WASM·Godot 공간/재단 wasm(`godot-space/index.wasm`, `play-godot/index.wasm`, `cuts-godot/index.wasm`)·modular street seating GLB의 Brotli(`.br`)·gzip(`.gz`) sidecar를 생성한다. 원본 대형 파일만 `.assetsignore`에서 제외하고, sidecar가 25 MiB를 넘거나 새로운 미검토 파일이 한도를 넘으면 배포를 중단한다. 세 Godot wasm 경로(`godot-space/index.wasm`, `play-godot/index.wasm`, `cuts-godot/index.wasm`)는 `wrangler.jsonc`의 `run_worker_first`에 반드시 유지한다. 빠지면 Static Assets가 원본 대신 SPA `index.html`을 200 `text/html`로 돌려줘 엔진 부팅이 깨진다(2026-10-13 운영 실측). 무대 문서 6경로(`/godot-space`, `/godot-space/index.html`, `/cuts-godot`, `/cuts-godot/index.html`, `/play-godot`, `/play-godot/index.html`)도 `run_worker_first`에 유지한다. Static Assets는 매칭 `_headers` 규칙을 전부 병합하므로 전역·무대 CSP가 두 장으로 겹쳐 인라인 부트스트랩이 막히는데, Worker가 이 문서들을 직접 서빙하며 framing 헤더를 한 벌로 접어준다(2026-10-13 운영 실측).

이어서 `scripts/verify-static-service-worker.mjs`가 `dist/sw.js`를 확인한다. Static Assets는 없는 경로에 SPA `index.html`을 200으로 돌려주므로, 워커 파일이 빠진 채 배포되면 `/sw.js`가 HTML로 응답하고 브라우저의 업데이트 확인이 조용히 실패해 "새 버전이 준비됐습니다" 안내가 사라진다. 앱이 등록 코드를 싣는 빌드에서 `sw.js`가 없거나, HTML이거나, precache 매니페스트(`buildId`)가 없으면 배포를 중단한다.

일반 GET·HEAD는 R2 원본을 그대로 돌려주고 압축은 엣지에 맡긴다. Worker가 압축 sidecar를 `content-encoding`과 함께 돌려주면 엣지가 한 겹 더 압축해 단일 라벨 이중 압축이 되었고(2026-10-13 운영 실측: 전 경로 이중 brotli), 어떤 클라이언트도 해제하지 못했다. 두 객체의 원본은 Standard 클래스 R2 버킷 `toonspectrum-public-assets`에 동일 key로 저장하며 Worker의 `LARGE_ASSETS` binding으로 직접 읽는다. byte Range, HEAD와 `If-None-Match`를 처리하고 1년 immutable 캐시(`s-maxage=0`으로 엣지 재검증 강제) 및 원본 MIME을 적용한다. R2가 없거나 일시적으로 읽히지 않을 때만 명시적으로 설정한 `LARGE_ASSET_ORIGIN`으로 폴백하며 Authorization, Cookie, 사용자·관리자·세션 헤더는 전달하지 않는다. 변수를 생략하면 Core API fallback을 추론하지 않는다.

`/assets/studio/bundle-v2/*`(Creator Bundle 구매 번들 GLB와 배포 인덱스)는 위 R2 경로의 예외다. 독립 파일 재배포 제한이 있는 구매 라이선스(웹 서비스 안 서빙 범위는 제작사 확인 대기)라 교차 출처 CORS를 열지 않는다: `access-control-allow-origin`·`access-control-expose-headers`를 달지 않고 `Vary: Sec-Fetch-Site`를 붙이며, 브라우저가 보낸 `Sec-Fetch-Site`가 `same-origin`이 아니면(`same-site`·`cross-site`·`none` 포함) R2에 닿기 전에 `403 BUNDLE_ASSET_SAME_ORIGIN_ONLY`로 거부한다(`no-store`). R2에 객체가 없어도 `LARGE_ASSET_ORIGIN` 폴백 없이 `503 LARGE_ASSET_UNAVAILABLE`로 닫는다. 헤더가 없는 호출(curl·구형 브라우저)은 허용하므로 핫링크 억제책일 뿐 접근 통제가 아니다. 이 경로의 R2 키는 에셋 sha256(`<sha256>.glb`)이고 Worker는 이 형식(소문자 hex 64자 + `.glb`)만 서빙한다(원본 경로 키로 올라간 객체는 열리지 않는다). Worker는 권리 원장을 읽지 않으며 업로드 대상을 원장이 allow한 팩으로 제한하는 일은 배포 플래너가 맡는다. 이미 올라간 객체는 권리를 철회해도 R2에서 삭제하기 전까지 서빙된다(`docs/studio/creator-bundle-theme-packs-20261021.md`). 다른 R2 경로의 응답은 바꾸지 않는다.

`sync:cloudflare-r2-assets:dry-run`은 빌드 산출물과 허용 목록을 검증하고 원격 쓰기를 하지 않는다. 운영 배포에서는 `prepare:cloudflare-static-assets`가 sidecar를 만든 뒤 `sync:cloudflare-r2-assets`가 승인된 원본 초과 파일을 R2에 먼저 업로드하고 Worker를 배포한다.

### R2 미디어 이관 (2026-10-23)

Static Assets 무료 플랜은 배포 버전당 파일 **20,000개**가 한도다. 2026-10-23 빌드가 18,273개에 이르러, 3D 모델·캐릭터·텍스처 같은 바이너리 미디어를 R2로 옮겼다.

- 대상: `/assets/studio/cc0-20260906/`, `/assets/virtual-studio/`, `/assets/3d/`, `/vrm/` 아래의 `glb`·`vrm`·`png`·`jpg`·`webp`·`hdr`·`ogg`(약 7,160개·3 GB). 정본은 `src/large-static-assets.ts`의 `CLOUDFLARE_R2_MEDIA_PREFIXES`다. JSON 매니페스트·라이선스 텍스트는 경로별 헤더 규칙 때문에 Static Assets에 남는다.
- 서빙: 경로와 R2 키가 같아서 앱 코드·CSP·DNS는 바뀌지 않는다. `run_worker_first`를 배열로 쓰면 Cloudflare는 `Sec-Fetch-Mode`로 탐색 요청을 가르지 않고, 목록에 없고 Static Assets에도 없는 경로를 Worker 대신 SPA `index.html`(200)로 답한다. 그래서 미디어 경로를 `CLOUDFLARE_R2_MEDIA_WORKER_FIRST_PATTERNS`(접두 4 × 확장자 7 = 28개, 예: `/assets/3d/*.glb`, `*`는 하위 경로까지 맞는다)로 `run_worker_first`에 넣는다. 2026-10-23 첫 배포는 이 항목 없이 나가 미디어 7,158개가 HTML로 응답됐고 약 2분 만에 직전 버전으로 롤백했다. 매니페스트 JSON은 확장자 패턴에 걸리지 않아 지금처럼 Static Assets가 경로별 헤더와 함께 내준다. `/assets/*`는 Static Assets 규칙처럼 CORS 없이 `Cross-Origin-Resource-Policy: same-origin`을, `/vrm/*`는 `Access-Control-Allow-Origin: *`를 붙인다. R2에 객체가 없으면 Static Assets로 폴백하고, SPA 폴백 HTML이 오면 404로 바꾼다.
- 배포 순서: `prepare:cloudflare-static-assets`가 `.assetsignore`에 미디어 패턴을 쓰고, `sync:cloudflare-r2-assets`가 R2 목록(etag = MD5)과 로컬 파일을 비교해 **바뀐 파일만** 병렬로 올린 뒤 Worker를 배포한다. 동기화가 실패하면 배포가 멈추므로 R2에 없는 미디어가 운영에 나가지 않는다. 25 MiB 초과 대형 에셋도 같은 비교로 매번 다시 올리지 않는다. R2 REST API는 계정 전체에 5분당 1,200건 한도가 있고 넘으면 5분 동안 모든 API 호출이 429로 막히므로, 업로드 시작을 초당 3건으로 벌리고 429는 `Retry-After`만큼 기다린다. 버킷을 처음부터 채우면 약 7,160개에 40분쯤 걸리니 배포 전에 `pnpm run sync:cloudflare-r2-assets`로 미리 올린다.
- 인증: 셸의 `CLOUDFLARE_API_TOKEN`(R2 편집 권한)과, 계정이 여럿 보이면 `CLOUDFLARE_ACCOUNT_ID`.
- 비용: R2 무료 한도(저장 10 GB·월, 읽기 1,000만 회·월, 송신 무료) 안이다. Worker 요청 수가 늘어나는 점(무료 하루 10만 회)은 이관 경로의 실제 요청량을 보며 관찰한다.

## 수동 운영 배포

자동 Git 배포는 허용하지 않는다. 검토된 `main`의 깨끗한 worktree에서만 다음 명령을 실행한다.

```bash
export CLOUDFLARE_CORE_API_ORIGIN=https://toonspectrum-core-api.onrender.com
export CLOUDFLARE_PUBLIC_READ_API_ORIGINS=https://<read-a>,https://<read-b>
export CLOUDFLARE_SOCIAL_API_ORIGIN=https://<social-origin>
export CLOUDFLARE_PLAYGROUND_API_ORIGIN=https://<playground-origin>
export CLOUDFLARE_ADMIN_API_ORIGIN=https://<admin-origin>
export CLOUDFLARE_REALTIME_API_ORIGIN=https://<realtime-origin>
# 선택적 R2 장애 fallback
export CLOUDFLARE_LARGE_ASSET_ORIGIN=https://<immutable-origin>
export VITE_CATALOG_SOURCE=static
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
export TOONSPECTRUM_APPROVED_MAIN_SHA=<사용자가 승인한 main의 소문자 40자리 SHA>
# 최초 등록·교체 때만 대화형 입력으로 저장한다. 값은 shell history에 쓰지 않는다.
pnpm exec wrangler secret put NEIS_API_KEY --config deploy/cloudflare-static/wrangler.jsonc
pnpm run cloudflare:static:deploy
```

production 모드(`scripts/deploy-cloudflare-static.mjs --production`)는 빌드와 배포를 시작하기 전에 다음을 모두 요구하고 하나라도 어긋나면 중단한다.

- `TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production` (사용자의 별도 명시적 승인 뒤에만 설정)
- `TOONSPECTRUM_APPROVED_MAIN_SHA`: 사용자가 승인한 `main` 커밋의 소문자 40자리 16진수 SHA. `HEAD`에서 자동으로 채우지 않고 승인된 값을 그대로 입력한다.
- 현재 브랜치가 `main`이고 `git status --porcelain`이 비어 있다.
- `git rev-parse HEAD`가 `TOONSPECTRUM_APPROVED_MAIN_SHA`와 같다.

`dry-run`은 이 승인 조건을 요구하지 않는다.

`VITE_CATALOG_SOURCE`를 생략해도 `static`이 기본이다. `api`는 정적 카탈로그에 문제가 발생했을 때 검토자가 선택하는 호환 롤백 모드이며, 다른 값은 배포 전에 거부된다.

분리하지 않은 선택 origin은 설정하지 않는다. 배포 스크립트가 모든 값을 HTTPS origin으로 정규화한 뒤 Wrangler `--var`로 전달한다. Wrangler 인증은 로컬 로그인 또는 별도 운영 secret으로 제공한다.

## 커스텀 도메인 전환

`workers_dev` URL은 배포 후 독립 canary로 유지한다. 이 Static Assets Worker는 Cloudflare 영역 라우트 `www.toonstudio.cloud/*`만 담당하며 실패 모드는 fail-open이다. apex `toonstudio.cloud/*`는 [`../cloudflare-apex-redirect`](../cloudflare-apex-redirect/)의 초소형 `308` Worker가 별도로 담당한다. 이 분리는 apex 정본화 때문에 모든 정적 파일 요청을 Worker 코드로 통과시키는 비용·장애 결합을 피한다. `origin.toonstudio.cloud`와 퇴역 Vercel project domain은 정상 Worker 변수와 프록시 체인에서 제외한다. DNS·project 연결 삭제는 별도 운영 변경으로 수행한다. 도메인·라우트 변경은 Wrangler 토큰 권한과 별도로 Cloudflare Dashboard에서 검증한다.

## 헤더 계약

`apps/web/public/_headers`는 `config/http-response-headers.json`의 공급자 중립 보안·캐시 계약에서 생성한다. Vite가 이를 `dist/_headers`로 복사하고 Static Assets가 정적 응답에 적용한다.

```bash
pnpm run generate:cloudflare-static-rules
pnpm run generate:cloudflare-static-rules -- --check
```

동적 Worker 응답에는 동일한 공통 보안 헤더를 직접 추가한다. Cloudflare Web Analytics를 활성화한 운영 영역은 script origin `https://static.cloudflareinsights.com`과 beacon origin `https://cloudflareinsights.com`만 CSP에 허용하며 wildcard나 broad `https:`는 허용하지 않는다. 헤더가 바뀌면 생성 파일과 Worker 테스트가 함께 실패하도록 유지한다.

## 롤백과 장애 격리

- 정적 릴리스는 직전 검증 SHA로 다시 수동 배포한다.
- 공개 읽기 replica 장애는 안전한 읽기 요청 안에서만 다른 replica를 시도한다.
- core·social·playground·admin·realtime 권위는 임의의 다른 공급자로 자동 write failover하지 않는다.
- 특정 기능 권위가 중단되어도 정적 앱과 로컬 OPFS 프로젝트는 계속 사용할 수 있어야 한다.
- Vercel fallback은 제거되었으며 Cloudflare Worker/Static Assets와 Render의 직전 검증 version으로만 롤백한다.
- 사용자 프로젝트 원본은 이 정적 배포 단위에 저장하지 않는다.
- 사용 금지된 퇴역 공급자는 운영·fallback·복구 경로에 포함하지 않는다.
