# 최소 비용·수동 전용 배포 정책

결정일: 2026-09-15 · 결정자: 저장소 소유자 · 범위: ToonStudio 운영 인프라 전체.
이 문서는 과거의 main 자동 배포, `[deploy]` 예외, Vercel 중심 릴리스 지침을 대체한다.

> **2026-10-23 컷오버 반영:** Core API·PostgreSQL 원장은 onpod 서울(`toonstudio-api`·`toonstudio-db`)로 옮겼고 Render `toonspectrum-core-api`와 과거 Neon 프로젝트는 삭제됐다.
> 현재 리소스·실행 절차와 승인 경계는 [인프라 지도](./infrastructure-map.md)가 정본이다.
> 자동 배포 금지·단일 쓰기 권위·유료 자동 승격 금지·동일 SHA 중복 배포 금지 원칙은 그대로 유지한다.

## 운영 권위

| 배포 단위 | 기본 운영 권위 | 비고 |
|---|---|---|
| SPA·정적 카탈로그·일반 에셋 | Cloudflare Static Assets | 정적 요청은 Worker 실행량을 사용하지 않는다. |
| 동적 경로 게이트웨이·edge liveness | Cloudflare Worker | `/api/health/live`는 Worker가 직접 응답하므로 Core API 생존 증거가 아니다. |
| 대형 불변 파일 | 압축 Static Assets + R2 | Range 요청만 R2 원본을 사용한다. |
| Core API | onpod `toonstudio-api`(서울) | `API_RUNTIME_ROLE=full`, GHCR 이미지 지정 수동 교체(`onpod app update --image`). 상시 승인 범위 밖이라 별도 명시 승인이 필요하다. |
| 임시 실시간 조정 | Cloudflare Durable Objects | presence·cursor·comment·signaling. |
| PostgreSQL 원장 | onpod `toonstudio-db`(서울; 과거 Supabase 미사용·과거 Neon 삭제) | migration은 단일 쓰기 경계로 검토한다. 정본은 [`canonical-database-topology.md`](./canonical-database-topology.md)의 컷오버 기록과 [인프라 지도](./infrastructure-map.md). |

## 변하지 않는 기본 원칙

PR 생성·병합·브랜치 정리는 배포 승인이 아니다. 사용자가 배포를 명시적으로 승인해야 한다. 2026-10-13 저장소 소유자 결정으로 `deploy/cloudflare-static/STANDING_APPROVAL.json`이 유효하면 정적 웹에 한해 env 명시 승인 없이 HEAD를 승인 SHA로 간주하며, 파일 삭제·파손 시 명시 승인 방식으로 fail-closed 복귀한다. onpod 단위는 상시 승인 범위 밖이다.
자동 Git 빌드, 운영 배포, Preview, Deploy Hook, push/cron/workflow_run 배포를 활성화하지 않는다.
각 workload는 하나의 쓰기 권위만 가지며 공급자 장애를 이유로 다른 DB나 API에 자동 이중 쓰기하지 않는다.
유료 플랜, 유료 failover, 상위 빌드 머신으로 자동 승격하지 않는다.

## 기본 수동 릴리스 순서

1. 승인한 정확한 40자리 `main` SHA, 직전 정상 롤백 대상(컷오버 `8d9e24ee` 이후 Cloudflare Worker 버전 ID, `toonstudio-api` 이미지 SHA), 변경 배포 단위를 기록한다.
2. 원격 보호 브랜치 `origin/main` 일치와 해당 SHA의 필수 CI(`core`·`verify`), 보안·라이선스 검증 녹색을 먼저 확인한다. 오프라인 preflight(`offline-contract-only`)나 계획 번들은 운영 배포 증거가 아니다.
3. API 코드가 변경된 경우 `api-container-release.yml`로 불변 GHCR 이미지(`ghcr.io/blue45f/toonspectrum-core-api:<sha>`)를 발행한 뒤, 사용자의 별도 명시 승인을 받아 `onpod app update toonstudio-api --image <이미지>`로만 교체한다. DB 비밀번호를 재발급하는 `--attach-db`와 환경변수 세대까지 되돌리는 `onpod app rollback`은 사용하지 않는다.
4. 다음 검증을 통과해야 정적 게이트웨이를 배포하거나 Core API 권위를 유지할 수 있다.

```bash
RENDER_CORE_API_ORIGIN=https://toonstudio-api.onpod.ai \
  pnpm run verify:render-core-origin
```

검증은 `/api/health/live`, `/api/health/ready`, JSON 계약, redirect 부재와 `x-vercel-id` 부재를 확인한다(스크립트 이름은 과거 호환용이며 실제 대상은 현행 onpod Core API origin이다).
무료 티어 인스턴스는 30분 무요청 시 절전 후 cold start가 있을 수 있으므로 timeout은 이를 허용하지만 readiness 실패를 성공으로 취급하지 않는다.

5. Cloudflare 정적 배포를 dry-run한 다음 검토된 Core origin으로 한 번만 배포한다.

```bash
pnpm run verify:free-infrastructure
pnpm run verify:cloudflare-static
pnpm run cloudflare:static:dry-run

export CLOUDFLARE_CORE_API_ORIGIN=https://toonstudio-api.onpod.ai
export TOONSPECTRUM_MANUAL_DEPLOY_APPROVAL=cloudflare-static-production
export TOONSPECTRUM_APPROVED_MAIN_SHA=<사용자가 승인한 main의 소문자 40자리 SHA>
pnpm run cloudflare:static:deploy
```

   production 모드(`scripts/deploy-cloudflare-static.mjs --production`)는 승인 문구(또는 유효한 상시 승인 파일), 소문자 40자리 SHA, 현재 브랜치 `main`, 깨끗한 작업 트리, `HEAD` 일치, 로컬 배포 원장(`.git/toonstudio-deploy-ledger`) 기준 동일 SHA 미배포 상태를 모두 요구한다. `--skip-build`를 사용할 때는 `dist/.vite/build-meta.json`의 `gitSha`가 현재 `HEAD`와 일치해야 하며, 불일치 시 빌드/배포 전에 즉시 중단한다.

6. 루트, Studio SPA(`crossOriginIsolated=true`), 정적 카탈로그, Core readiness(`/api/health/ready`), `edgeOriginAuth=enforced`, 로그인·OAuth callback, 권한이 필요한 API, R2 Range, realtime reconnect, 제품 투어 게이트를 검사한다.
7. 릴리스 ID, Worker version(`RELEASE_SHA` 포함), onpod 이미지 SHA, 롤백 대상과 스모크 결과를 기록한다.

## Core API 운영 경계 및 퇴역 Render 기록

- 현행 Core API는 서울 onpod `toonstudio-api`이며 build/start에서 migration이나 `drizzle-kit push`를 실행하지 않는다.
- 로컬 마스터 비밀 사본은 `.env.infrastructure.local`에 두며 터미널, PR, 로그, GitHub summary에 출력하지 않는다.
- `render.yaml`의 `toonspectrum-core-api`는 2026-10-23 삭제된 퇴역 Blueprint 기록이며, 재배포·폴백·롤백 대상으로 사용하지 않는다.
- 무료 인스턴스의 cold start와 메모리 한도는 운영 등급 제약이다. SLA나 상위 플랜 전환이 필요할 때만 별도 비용 승인을 받는다.

## Cloudflare 경계

- Static Assets가 가능한 요청을 Worker로 보내지 않는다.
- `/api/health`와 `/api/health/live`는 edge에서 `no-store`로 응답한다.
- `/api/health/ready`는 반드시 Core API의 DB/schema readiness를 확인한다.
- 대형 파일은 압축 sidecar와 R2가 모두 실패한 경우에만 명시적으로 설정한 HTTP fallback을 사용한다. `LARGE_ASSET_ORIGIN`이 비어 있으면 Core API를 파일 서버처럼 깨우지 않는다.
- 운영 배포는 검토된 `main`, clean worktree, 승인 조건과 동일 SHA 중복 배포 금지를 모두 충족해야 한다.

## Vercel 제거 상태

저장소의 Vercel 런타임, 서버리스 진입점, 퇴역 배포 구성, GitHub 배포 workflow와 관련 검증 코드는 제거되어 정상 배포나 비상 롤백에 사용되지 않는다. 컷오버(`8d9e24ee`) 이후 검증된 Cloudflare Worker 버전과 onpod의 검증된 이전 이미지 SHA가 각각의 롤백 단위다(컷오버 이전 Worker 버전 `70517470` 이하는 삭제된 퇴역 Render를 가리키므로 롤백 금지). 남아 있는 `origin.toonstudio.cloud` CNAME 및 Vercel 도메인 정리는 별도 승인된 운영 작업으로 수행한다.

## 실패·롤백

배포 실패를 반복 실행하지 말고 원인을 먼저 조사한다. API 장애 시 `onpod app update toonstudio-api --image <직전 정상 SHA 이미지>`로 이미지만 되돌리고(`onpod app rollback` 사용 금지), 정적 웹·Worker 장애 시 컷오버 이후 직전 정상 Worker version으로 롤백한다. DB migration, secret rotation, 데이터 삭제, DNSSEC·nameserver 변경은 일반 애플리케이션 배포 승인에 포함되지 않는다.

## 릴리스 기록

승인 시각·범위, 실행자, 정확한 40자리 SHA, 원격 필수 CI 결과, migration 상태, onpod 이미지 SHA, Worker version, R2 검증, 배포 후 smoke test, 롤백 대상과 재시도 여부를 남긴다. 비밀 값은 기록하지 않는다.
무료 플랜의 한도와 cold start를 수용하는 정책이며 무제한 트래픽·SLA·영구 0원을 보장한다는 뜻은 아니다.
