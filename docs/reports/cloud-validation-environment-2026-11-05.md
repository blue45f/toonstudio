# 클라우드 검증 환경·env 경로 인벤토리 — 2026-11-05

상태: **current / 읽기 전용 확인**. 이 인벤토리 때문에 인증·배포·추가 빌드를 시작하지 않았다.
실제 env·secret store 내용을 읽거나 비밀값을 복사·전송·재발급하지 않았다.

## 환경과 번들 기준

- 선택 환경: `ccarenv_b64_Y2NhcmVudl9mZmMwODZhYjcwNzQ4MTkxYWRhZmVjMDRiYjZhMTJmMA`.
  Codex 관리 Linux x86_64 실행 환경이며 물리적 클라우드 공급자는 독립 확인하지 않았다.
  운영 onpod 호스트 또는 사용자의 로컬 개발 PC라고 간주하지 않는다.
- Node 24.19.0, pnpm 11.25.0, TypeScript 6.0.3. cgroup 메모리 제한은 16GiB다.
- 원본 checkout `/workspace/toonstudio`: HEAD `8d315c85d6fde4a3a30255612c756d3e299a95b0`,
  기존 작업을 dirty 상태로 보존한다. 그 디렉터리의 이전 dist는 초기 단계 산출물이므로 현재 기준이 아니다.
- 현재 검증 번들: `/workspace/scratch/toonstudio-commercial-main-validation/dist`.
  별도 detached worktree의 기준은 main `2c626df4000fcfc32318faa793a61bea3ef0901b`이고,
  여기에 미커밋 교체·고지·검증 수정이 적용되어 있다. 순수 main SHA만의 빌드라고 표시하지 않는다.
- 해당 전체 프로그램 fingerprint는
  `0a2a58e565069979a257b124fe95c8f213606c4ba74c5aad61470bd8c4f96b91`이며 빌드 뒤에도 일치했다.
- 문서에 명시된 주소: 웹 `https://www.toonstudio.cloud`, apex `https://toonstudio.cloud`,
  Core API `https://toonstudio-api.onpod.ai`, realtime `https://realtime.toonstudio.cloud`.
  주소는 정본 문서 기준이며 이번 작업에서 운영 연결을 확인한 것은 아니다.

## 실행한 검증과 저장소 CI 명령

실행: 관련 Vitest 277개, Node 정책·검사기 12개, 전체 웹 타입 26,231개와 API·도구 3프로젝트,
Vite·postbuild 고지/CSP·bundle 구조, Chromium native export, license/security audit,
architecture·변경 lint·Secretlint·하네스 구조 검사. 자세한 결과는 후속 검증 보고서를 따른다.

정상 타입 명령은 `pnpm typecheck`이며 workspace link → 메모리 제한 `typecheck:web` → API 순서다.
`pnpm build`는 웹 타입 검사 뒤 Vite를 실행한다. 검증 실행에서는 prebuild → 전체 typecheck → Vite →
postbuild를 순차 수행했고 무거운 검사를 병렬 실행하지 않았다.
전체 CI 진입점은 `pnpm ci`, `pnpm verify:push`; 하네스는 `pnpm harness:check`,
`pnpm harness:verify --base=HEAD`; 그 외 `pnpm validate:architecture`, `pnpm audit:licenses`,
`pnpm audit:security`, `pnpm audit:restricted-models`가 있다. 전체 ci/verify:push를 실행했다고
주장하지 않으며, restricted-models는 현재 모델 3개 때문에 예상대로 exit 1이다.

## env 예제와 실제 store 경로

추적 중인 예제는 `.env.example`, `.env.production.example`, `.env.creator-resources.example`,
`.env.fortune.example`, `.env.supporter.example`, `deploy/backend-capabilities.env.example`,
`deploy/cloudflare-static/.env.example`, `deploy/integration-runtime-connectors.env.example`,
`tools/toonbridge/.env.example`의 9개다. 각 변수의 **이름만** 추출한 전체 목록은
`docs/evidence/commercial-audit-2026-11-05/cloud-environment-inventory.json`에 있다.

저장소 정책의 로컬 secret store는 `.env.infrastructure.local`이다. `.env`, `.env.local`,
`apps/api/.env`, `apps/api/.env.local`, `apps/api/.env.integration.local` 등도 ignore 대상이다.
통합 worktree의 위 경로는 모두 존재하지 않는다. 원본 checkout에서도 확인한 해당 env/store 경로는
존재하지 않았다. 경로 존재·ignore 여부만 확인했으며 내용을 읽지 않았다.
`/workspace/.aws`, `/workspace/.codex`는 관리 디렉터리의 존재 메타데이터만 확인했고 내부 내용은 읽지 않았다.
다른 세션·로컬 PC·관리형 connector의 자격증명이 없다는 결론으로 확대하지 않는다.

클라우드 원본과 통합 worktree 각각에 **주석만 있는** `.env.deployment-reference.local`을 새로
작성했다. 기존 파일이 없는 것을 확인한 후 exclusive 생성했고, `git check-ignore`가 `.env*` 규칙을
적용하는 것과 파일 권한 **600**, Git 미추적 상태를 확인했다. 실제 env/store를 덮어쓰지 않았다.
이 파일은 runtime 설정으로 사용하지 않으며 값·token·secret·개인 키를 포함하지 않는다.
생성/ignore/권한 증거는 `deployment-reference-file-receipt.json`에 있다.

필요 변수는 기능별로 다르며 모든 예제의 키가 이 정적 검증에 필요한 것은 아니다.
Core API 예제에는 `DATABASE_URL`, `AUTH_SESSION_SECRET`, `AUTH_STATE_SECRET`,
`PERSONAL_CLOUD_OAUTH_STATE_SECRET`, `PERSONAL_CLOUD_TOKEN_ENCRYPTION_KEY` 등이 있다.
정적 배포 예제에는 `CLOUDFLARE_CORE_API_ORIGIN`, `CLOUDFLARE_ADMIN_API_ORIGIN`,
`CLOUDFLARE_LARGE_ASSET_ORIGIN`, `CLOUDFLARE_REALTIME_API_ORIGIN`, `VITE_CATALOG_SOURCE` 등이 있다.
인프라 지도는 `CLOUDFLARE_API_TOKEN`/`CF_API_TOKEN`, `ONPOD_TOKEN`, `ONPOD_DATABASE_URL` 등을
언급한다. 별칭·legacy·접두부도 문서에 함께 있으므로 이 목록만으로 현재 배포 필수 키를 확정하지 않는다.
실제 배포에는 정본 지도·해당 배포 스크립트의 조건을 적용해야 한다. 값은 수집하지 않았다.

## 운영 접근 여부

`blue45f/toonstudio`의 GitHub fetch/read는 성공했다. 쓰기·push 권한은 시험하지 않았다.
Cloudflare/onpod 로그인·credential 유효성·운영 네트워크·컨테이너·DB 접근은 시험하지 않았으므로
현재 실행 환경이 운영 배포에 접근 가능하다고 확인할 수 없다. 도구나 경로가 있다는 사실은 인증
성공의 증거가 아니다. 운영의 실제 배포 SHA도 조회하지 않았다.

설정 사실의 정본은 이 checkout의 `docs/operations/infrastructure-map.md`와 `DEPLOY.md`다.
부모 스레드가 조사하는 원격 문서와 분리해, 이 보고서는 위 기준 SHA의 파일과 현재 cloud checkout
메타데이터에 한정한다. 이 작업에서 배포·PR·push·main 병합은 수행하지 않았다.

## 두 프로젝트의 확인 범위와 다음 승인 경계

ToonStudio의 저장소·선택 checkout·기준 SHA·문서상 주소·명령·예제 이름은 위와 같이 확인했다.
Pilates Flow는 사용자에게 받은 프로젝트명만 확인됐고 이 선택 환경에서 저장소·운영 주소·checkout·
소스 SHA·실제 CI/env 변수명을 검증하지 않았다. 참조 파일의 해당 항목은 미확인으로 남겼으며
`blue45f/...` 형태의 저장소명이나 주소를 추측하지 않았다. 로컬 문서화 담당 스레드의 정본과 대조할
정보이며, 이 요청으로 별도 checkout·인증·로컬 작업·빌드·배포를 시작하지 않았다.

| 구분 | 상태 |
| --- | --- |
| 읽기 확인 | ToonStudio GitHub fetch, 추적 예제·정본 문서, local 파일 존재/ignore/권한 메타데이터 |
| 미확인 | 실제 운영 배포 SHA, provider 자격증명 유효성, 운영 DB/컨테이너 연결, Pilates Flow 세부 정보 |
| 인증 차단 | 새 인증을 시도하지 않았으므로 거부/실패가 발생했다고 주장하지 않음 |
| 별도 승인 필요 | 실제 secret 값 이동·복사·환경 간 전송·등록, 신규 token/login·영구 접근 설정 |
| 이번 세션에서 미수행 | 배포·push·PR·main 병합; standing approval 문서가 있어도 현재 요청의 비배포 제한을 우선 |

필요 값과 목적지만 제시했다. 실제 값을 참조 파일에 채우거나 다른 환경으로 옮기지 않았다.
