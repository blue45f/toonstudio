# 배포 환경 계약 변경 보고서

상태: **current** — 2026-11-05 독립 checkout의 코드·문서 변경 결과.
최초 조사 SHA: `8d315c85d6fde4a3a30255612c756d3e299a95b0`.
후속 병합 지시에 따라 origin/main을 fetch하고 `63dcf937ca8658fbae52396595416daa1a796043`로 fast-forward했다. 변경 대상 source·문서에 중복·충돌은 없었고 같은 focused 검사를 다시 통과했다. 공급자 직접 확인일은 인프라 지도의 2026-10-29 기록이며 이 작업에서 갱신하지 않았다.

## 결과

- `config/deployment/environment-contract.json`: 목적·type·기본값·조건부 필수·공개 구분·단위·profile·secret 짝·IaC/source 참조를 가진 비밀 없는 배포 경계 계약.
- `scripts/deployment-preflight.mjs` / `.test.mjs`: Node 내장 runner로 검사. 기존 DB URL validator와 API 비밀 목록을 재사용한다.
- `deploy/onpod/runtime.env.example`: current 기록의 공개 origin/flag만 표현. `.env.production.example`은 generic-separated target으로 명시했다.
- `.github/workflows/ci.yml`: 의존성 설치 전 Node 검사에 preflight 테스트를 연결했다.
- `.env.example`, `DEPLOY.md`, `deploy/onpod/README.md`: profile 선택과 한글 runbook 링크.
- `deploy/cloudflare-static/README.md`: Render origin과 rollback 안내를 현재 정본 기준으로 수정했다.
- `docs/operations/production-environment.md`: edge IP와 single-owner의 적용 완료 상태를 정정했다.
- `docs/operations/deployment-environment-contract.md`: 클라우드 주입·승인·실패·복구·목적별 최소 권한 설명.
- `.env.deployment-reference.local`: 이 환경에 새로 만든 값 없는 참조, ignored·0600. patch에는 포함하지 않는다. 기존 operator env·credential은 읽거나 바꾸지 않았다.

기본 목적은 runtime-config이며 API/Worker/build 한 단위만 요구한다. container-release/onpod-image-update/static-deploy/r2-assets는 목적별 provider 인증 이름만 요구하고 DB/Auth/OAuth 비밀을 요구하지 않는다.
secret 짝은 이름·목적지 계약이며 비교를 위해 원문을 클라우드에 모으지 않는다. 양쪽이 이미 명시적으로 제공된 경우만 비교한다.
모든 성공은 `offline-contract-only`이고 `deploymentAuthorized=false`다. 원격 인증·runtime·secret 짝·CI/승인은 미확인으로 남긴다.

## 검증

| 실행 | 결과 |
| --- | --- |
| `node --test scripts/deployment-preflight.test.mjs` | 14/14 통과 |
| `node --test scripts/agent-harness.test.mjs` | 6/6 통과 |
| `node scripts/agent-harness.mjs check` | 통과 |
| `node scripts/verify-pnpm-lockfile.mjs` | 20 importers 통과 |
| 새 mjs 두 파일 `node --check` | 통과 |
| 기존 `validate-production-database-url.test.mjs` | 저장소 Vitest 4.1.12에서 27/27 통과; 임시 Vitest 검사도 통과 |
| 변경 파일 Secretlint | 저장소 harness의 13개 변경 파일 검사 통과; 임시 13.0.7 검사도 통과 |
| `pnpm harness:verify` | 최신 main 기반 구조·하네스·lockfile·변경 ESLint·Secretlint 전체 통과 |
| CI 설치 전 mandatory Node 검사와 새 preflight 테스트 | 155/155 통과 |
| 저장소 custom GitHub secret pattern 검사 | 변경 파일 대상 통과 |
| `git diff --check` 및 patch whitespace 검사 | 통과 |
| secret 없는 실제 CLI | local은 offline 계약만 통과, onpod-current는 필수 이름 누락으로 blocked |

최초 기존 validator 테스트를 Node 내장 runner와 함께 실행한 명령은 `vitest` 미설치로 실패했다. 이후 임시 경로의 올바른 runner에서 위 27개를 재검증했다.
최초 Secretlint에서 합성 basic-auth URL literal 1건을 탐지했고 중립 fixture 조립으로 수정한 뒤 통과했다.

최초 `harness:verify`는 base 참조·의존성 경로 부재로 실패했다. 이후 origin/main을 fetch하고
`XDG_DATA_HOME=/tmp/toonstudio-xdg-data PNPM_HOME=/tmp/toonstudio-pnpm-home pnpm install --frozen-lockfile --ignore-scripts --store-dir /tmp/toonstudio-pnpm-store`로 기존 lockfile의 의존성을 준비한 뒤 전체 harness와 변경 ESLint를 통과했다.
저장소 package/lockfile 변경은 없다. 전체 제품 build/typecheck는 JS·문서 변경의 필수 게이트가 아니므로 실행하지 않았다.
앱 통합 테스트·원격 인증/운영 검증도 실행하지 않았다.

## 남은 확인·승인

- 게시 이후 정확한 head SHA의 원격 필수 CI 결과와 최신 main 변동을 확인한다. main 병합은 조정자의 순서 배정 후 진행한다.
- API의 일반 선택 변수·숫자 범위 전체 검증은 기존 runtime source가 정본이다. 이 preflight는 배포 경계 계약이며 전체 API schema 검증기를 대체하지 않는다.
- runtime-config 검사가 필요할 때만 선택 단위의 필요한 이름을 승인된 환경에 주입한다. 이미지-only 작업을 위해 runtime secret을 옮기지 않는다.
- Cloudflare/onpod/GitHub 작업용 provider 인증의 정확한 리소스·지원 scope·기간·등록 목적지는 소유자가 검토·승인한다. 이번 작업에서는 발급·등록하지 않았다.
- R2 REST 경로에 S3 bucket-only credential을 그대로 쓸 수 있다고 보증하지 않는다. S3 전환과 per-Worker 권한의 실제 호환성은 별도 검토한다.
- onpod DB migration과 퇴역 recovery workflow는 계속 미지원으로 닫힌다. TLS·역할 검사와 기존 배포 승인 정책은 변경하지 않았다.

후속 사용자 지시에 따라 코드 커밋·push·draft PR 게시까지 허용되었다. 이 문서 작성 시점의 운영 배포는 없으며 main 병합은 조정자의 순서 배정 뒤 진행한다. 최종 Git/PR 상태는 작업 결과에 기록한다. 운영 API/DB/console 조회, DNS/runtime env 변경, 자원 생성·삭제, 키 발급·복사·등록·회전 없음.
도구 승인 거부 또는 결과 불명인 운영 작업은 없다. 미완료 항목은 원격 CI·병합 순서와 별도 승인 대상이다.
