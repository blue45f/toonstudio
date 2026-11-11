# ToonStudio AI·운영자 정본 배포 안내 (Quickstart)

- 문서 상태: **current** — 다른 AI 에이전트와 운영자가 배포 환경·진입 명령·성공 판정·금지 사항을 한 번에 파악하기 위한 짧은 정본 안내서(2026-11-08).
- 권위 관계: 정책은 루트 [`AGENTS.md`](../../AGENTS.md) 8·9절, 자원·비밀 저장 위치와 2026-10-23 컷오버 기록은 [`infrastructure-map.md`](infrastructure-map.md), 변수·시크릿 짝 계약은 [`deployment-environment-contract.md`](deployment-environment-contract.md), 전체 배경은 [`DEPLOY.md`](../../DEPLOY.md)가 정본이다. 이 문서는 위 정본들과 모순 없이 실행 진입점만 압축한다.

## 1. 현행(Current) 환경과 퇴역(Retired)·미사용(Legacy Exception) 구분

2026-10-23 컷오버 이후 운영 권위는 **Cloudflare(웹 엣지·정적·R2·DO·D1)** 와 **서울 onpod(Core API·PostgreSQL)** 두 축뿐이다. 한 공급자가 다른 공급자의 자동 폴백이 되지 않는다.

| 구분 | 구성요소·식별자 | 위치·역할 | 승인 범위·주의 |
| --- | --- | --- | --- |
| **current** | 웹 정적 + 엣지 게이트웨이 `toonspectrum-web` | Cloudflare Workers Static Assets + Worker (`deploy/cloudflare-static`), `CORE_API_ORIGIN=https://toonstudio-api.onpod.ai`, 배포 시 `RELEASE_SHA` 바인딩 | 상시 승인(`deploy/cloudflare-static/STANDING_APPROVAL.json`) 유효 시 깨끗한 `main`에서 배포 가능. onpod 정적 호스팅으로 이전 불가(CSP·`crossOriginIsolated`·쓰기 프록시 제약) |
| **current** | 대형 공개 에셋 `toonspectrum-public-assets` | Cloudflare R2 (`LARGE_ASSETS` 바인딩) | 정적 웹 배포 파이프라인이 동기화. onpod 버킷은 GB당 과금이라 사용하지 않음 |
| **current** | Studio 실시간 조정 `realtime.toonstudio.cloud` | Cloudflare Worker + Durable Objects (`deploy/cloudflare-realtime`) | 임시 상태(presence·신호) 전용이며 영구 작품 원장이 아님 |
| **current** | 트래픽 분석 `toonspectrum-analytics` | Cloudflare Worker + D1 (`deploy/cloudflare-analytics`, `TRAFFIC_ANALYTICS_STORE=d1`) | Core API가 RPC로 기록. 별도 수동 승인 배포(`cloudflare-analytics-production`) |
| **current** | Apex 리다이렉트 | Cloudflare Worker (`deploy/cloudflare-apex-redirect`) | `toonstudio.cloud` → `https://www.toonstudio.cloud` 308 리다이렉트. 상시 승인 범위 포함 |
| **current** | **Core API** `toonstudio-api` | 서울 onpod 무료 단일 팟(`cpu_micro`, `https://toonstudio-api.onpod.ai`), 30분 무요청 시 절전 | **상시 승인 범위 밖 — 매회 사용자 별도 명시 승인 필수.** `DATABASE_RUNTIME_ROLE_MODE=single-owner`, `AUTH_EDGE_CLIENT_IP_ENABLED=true`. GHCR 이미지(`ghcr.io/blue45f/toonspectrum-core-api:<40자리-sha>`) 지정 교체만 사용 |
| **current** | **PostgreSQL 원장** `toonstudio-db` | 서울 onpod dev 플랜 PG 17 (내부 `toonstudio-db.db.onpod.local:5432`, 공개 5432 기본 IP 차단) | 단일 소유자 역할. 비밀 저장 위치 규칙은 [`infrastructure-map.md`](infrastructure-map.md) 5절을 따른다 |
| **retired** | Render (`toonspectrum-core-api`, 검증 정적 사이트 19개) | 2026-10-23 삭제 완료 (`toonspectrum-studio-live`는 생성 이력 없음) | `render.yaml`과 `STANDING_APPROVAL.json`의 `render-core-api-image-deploy`는 과거 퇴역 기록일 뿐 재배포·복구·승계 대상 아님 |
| **retired** | Vercel 런타임 및 `origin.toonstudio.cloud` CNAME 잔재 | 퇴역 완료 | Vercel 설정·워크플로·배포 재도입 금지. DNS 정리는 소유자 별도 승인 대기 |
| **retired** | Neon (`toonspectrum-production`) | 2026-10-22 소유자 삭제 완료(복구 안 함) | 과거 Neon·분리 역할 전제 워크플로(`production-database-migrations.yml`, `health-recovery-diagnostics.yml`의 비활성화된 `production-inspect`)를 onpod에 실행 금지 |
| **legacy exception** | Supabase (`toonspectrum-collaboration`) | 미사용(`SUPABASE_OBJECT_STORAGE_ENABLED=false`) | Core API가 사용하지 않음. 데이터 삭제는 소유자 대시보드 직접 처리 전까지 임의 연결·삭제 금지 |

## 2. 5단계 정본 진입 명령 · 성공 판정 · 금지 사항

모든 배포는 **검토된 `origin/main` 끝의 소문자 40자리 SHA 1개**만 대상으로 하며, 변경된 배포 단위만 수동 반영한다.

| 단계 | 정본 진입 명령 | 성공 판정 기준 | 금지 사항 |
| --- | --- | --- | --- |
| **1. 검증 (Verify)** | `pnpm run deploy:verify`<br>`pnpm run deploy:preflight`<br>(단위 지정 시: `pnpm run deploy:preflight --operation static-deploy --unit static-worker`) | - `deploy:verify`(무료 인프라 정책 + Cloudflare `static`·`apex-redirect`·`realtime`·`analytics` 규칙·타입·단위 테스트·드라이런) 종료 코드 `0`<br>- `deploy:preflight`가 계약 오류 없이 `status: "offline-contract-only"`(미주입 환경에서는 예상된 `MISSING_*`만 보고) 반환<br>- 대상 40자리 SHA가 원격 `origin/main`과 일치하고 GitHub Actions 필수 체크(`core`, `verify`)가 `completed` + `success`임이 확인됨 | - `offline-contract-only`(`deploymentAuthorized: false`)나 로컬 커밋만으로 배포 승인·원격 CI 통과를 주장 금지<br>- 원격 CI 미확인·실패 SHA를 통과로 간주하거나 `--no-verify`로 우회 금지 |
| **2. 빌드 (Build)** | - 웹: `pnpm run build` (타입체크 선행 시 `pnpm run build:bundle`) 후 `pnpm run check:studio-bundle && pnpm run check:product-tour-remotion-chunks`<br>- API 이미지: GitHub Actions [`api-container-release.yml`](../../.github/workflows/api-container-release.yml) 수동 실행(`ref=<40자리-sha>`) | - 웹: `dist/index.html`, `dist/sw.js`, `dist/.vite/build-meta.json`이 생성되고 `build-meta.json`의 `gitSha`가 현재 40자리 `HEAD` SHA와 정확히 일치<br>- API: 워크플로가 `$RELEASE_SHA`의 `core`·`verify` 녹색 및 GHCR 미존재를 확인한 뒤 `ghcr.io/blue45f/toonspectrum-core-api:<40자리-sha>` 이미지를 1회 발행(`image.txt`의 `production_deployed=false`) | - 다른 SHA에서 만든 구버전 `dist/`로 `--production --skip-build` 실행 금지(스크립트가 `build-meta.json` 불일치 시 즉시 차단)<br>- 동일 SHA 컨테이너 이미지 덮어쓰기 및 `:latest` 가변 태그 사용 금지<br>- 미승인 `turbo` 원격·동시 빌드 실행 금지 |
| **3. 배포 (Deploy)** | - 웹 드라이런: `pnpm run deploy:web:dry-run`<br>- 웹 운영 배포: `pnpm run deploy:web` (상시 승인 파일 부재 시 `TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production` 및 `TOONSPECTRUM_APPROVED_MAIN_SHA=<승인된-40자리-sha>` 설정 후 `pnpm run cloudflare:static:deploy`)<br>- Core API(**별도 승인 필수**): `onpod app update toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:<40자리-sha>` | - 웹: `main` 브랜치·깨끗한 작업트리·SHA 일치·중복 배포 원장 미존재 확인 후 R2 동기화 및 `toonspectrum-web` 배포가 종료 코드 `0`으로 완료되고, Worker `RELEASE_SHA` 바인딩과 `.git/toonstudio-deploy-ledger/cloudflare-static/<sha>.json` 기록이 생성됨<br>- API: 사용자 명시 승인 기록, 직전 정상 이미지 SHA 백업, `onpod logs toonstudio-api --tail 80` 기동 확인 완료 | - GitHub Actions/CI에서 운영 배포 실행 금지(`release-workflow-policy.mjs`가 Cloudflare·Vercel·Render·Onpod 변경 명령을 차단하며 `deploy-plan-preview.json`은 `deployed: false` 오프라인 계획서임)<br>- 동일 SHA 중복 배포·자동 재시도·배포 원장 임의 삭제 금지<br>- 일상 이미지 교체에 `--attach-db` 배포(DB 비밀번호 회전 유발) 및 `--env` 전체 덮어쓰기 사용 금지<br>- 로컬 비밀 원본 값 출력·복사·삭제 금지 |
| **4. 상태 확인 (Status)** | `pnpm run deploy:status:origin`<br>(웹 변경 시 추가: `pnpm run verify:product-tour-live`)<br>추가 HTTP 확인: `www` 경유 `GET /api/health/ready`, `GET /api/health/capabilities`, `GET /api/auth/providers` 및 원점 무인증 직접 호출 시 `403` 응답 확인 | - `deploy:status:origin`이 서울 onpod 원점 `/api/health/live`(`200 {"status":"ok"}`)와 `/api/health/ready`(`200 {"status":"ready"}`)를 모두 통과(절전 복귀 시 초기 503 후 약 30초 내 200)<br>- `www` 경유 `/api/health/capabilities`의 `edgeOriginAuth`가 `"enforced"`이고, 원점 무인증 직접 호출(`/api/auth/providers`)이 `403`으로 차단됨<br>- 웹 변경 시 `/studio` `crossOriginIsolated === true` 및 Remotion 제품 투어 실재생 게이트(G5-1·G5-2) 통과 | - `www` 도메인의 `/api/health/live` `200` 단독 응답을 Core API 생존·운영 반영 증거로 오인 보고 금지(Worker가 원점을 깨우지 않고 직접 응답하는 edge liveness임)<br>- 상시 모니터링에 `/api/health/ready`를 걸어 유휴 자원을 깨우는 행위 금지 |
| **5. 롤백 (Rollback)** | - Core API(사용자 승인 후): `onpod app update toonstudio-api --image ghcr.io/blue45f/toonspectrum-core-api:<컷오버-이후-직전-정상-40자리-sha>`<br>- 웹 Worker: `pnpm exec wrangler deployments list --name toonspectrum-web` 확인 후 `pnpm exec wrangler versions deploy <version-id>@100 --name toonspectrum-web --yes` | - 롤백 직후 4단계 `pnpm run deploy:status:origin`, `edgeOriginAuth === "enforced"`, 로그인·주요 경로 스모크가 정상 복구됨 | - `onpod app rollback` 사용 금지(환경변수 세대까지 함께 되돌려 출처 인증 시크릿 짝·회전된 DB 비밀번호를 파손할 위험)<br>- 컷오버 이전 Worker 버전(`70517470` 이하) 및 단일 소유자 준비성 반영(`4df6d1692...`) 이전 API 이미지로 롤백 금지(`8d9e24ee` 이후 Worker 버전만 선택)<br>- 삭제된 Render·퇴역 Neon·퇴역 Vercel로 복귀 시도 금지 |

## 3. package.json 배포·검증 스크립트 대응표

기존 CI·하네스·단위 검증이 참조하는 스크립트 이름을 보존하면서, 운영자·AI용 최상위 `deploy:*` 진입점을 제공한다.

| 목적 | 표준 진입 명령 (`deploy:*`) | 보존된 하위·호환 스크립트 |
| --- | --- | --- |
| 오프라인 환경 계약 점검 | `pnpm run deploy:preflight` | `node scripts/deployment-preflight.mjs --profile onpod-current --sha "$(git rev-parse HEAD)"` |
| 배포 전 통합 정책·Worker 검증 | `pnpm run deploy:verify` | `verify:free-infrastructure`, `verify:cloudflare-static`, `verify:cloudflare-apex-redirect`, `verify:cloudflare-realtime`, `verify:cloudflare-analytics` |
| 정적 웹 + R2 드라이런 | `pnpm run deploy:web:dry-run` | `cloudflare:static:dry-run`, `sync:cloudflare-r2-assets:dry-run`, `prepare:cloudflare-static-assets`, `generate:cloudflare-static-rules` |
| 정적 웹 운영 배포 | `pnpm run deploy:web` | `cloudflare:static:deploy`, `sync:cloudflare-r2-assets` |
| 서울 onpod 원점 상태 확인 | `pnpm run deploy:status:origin` | `verify:render-core-origin` (`--origin=https://toonstudio-api.onpod.ai`), `verify:product-tour-live` |

## 4. AI·운영자 완료 보고 원칙

작업·검증 결과를 보고할 때는 아래 단계를 섞지 않고 실제 확인된 단계만 완료로 적는다.

1. **로컬 수정**: 변경 파일과 동시 작업 세션 보호 여부
2. **로컬 검증**: 실제 실행한 명령과 종료 코드(미실행 도구는 미실행으로 명시)
3. **로컬 `main` 반영**: 로컬 커밋 SHA 및 작업 사본 정리 상태
4. **원격 `origin/main` 반영·필수 CI**: 푸시 여부와 해당 SHA의 `core`·`verify` 실제 상태(실패·미확인 알림을 통과로 간주 금지)
5. **빌드 산출물**: `dist/.vite/build-meta.json` `gitSha` 또는 GHCR `<40자리-sha>` 이미지 발행 여부
6. **운영 배포·사후 스모크**: 실제 배포 실행 여부, 배포 버전/이미지 ID, 원점 `ready` 200 확인 여부
