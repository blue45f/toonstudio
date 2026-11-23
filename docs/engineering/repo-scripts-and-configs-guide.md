# 저장소 스크립트(336개) · 루트 설정 파일 · ENV 그룹핑 가이드

- **문서 상태**: `current` (2026-11-23 저장소 실측 기준)
- **권위 관계**: 실행 스크립트의 단일 정본은 [`package.json`](../../package.json), 배포 인프라·승인 범위는 [`deploy/DEPLOY_MANIFEST.json`](../../deploy/DEPLOY_MANIFEST.json) 및 [`AGENTS.md`](../../AGENTS.md) §8~§9, `config/` 하부 인덱스는 [`config/README.md`](../../config/README.md)가 정본이다.
- **호환성 보호 원칙**: CI·Git 훅·계약 테스트 호환성을 지키기 위해 기존 `package.json` 스크립트 이름 삭제·개명과 루트 설정 파일 임의 이동은 금지한다. 대신 `pnpm run scripts:help` CLI와 이 문서로 10대 한글 그룹핑 및 빠른 진입점을 제공한다.

---

## 1. 자주 쓰는 핵심 10줄 퀵스타트 (개발 · 빌드 · 배포 1줄 명령)

> **실행 위치**: 저장소 루트 · **전제 조건**: Node.js `>=24.16.0`, `pnpm@11.4.0` (`pnpm install` 완료)

| # | 용도 | 바로 복사할 명령 | 실행 성격 · 부작용 |
| --- | --- | --- | --- |
| 1 | **로컬 개발 서버** | `pnpm run dev` | 읽기+로컬 서버(`apps/web` Vite, 카탈로그·i18n 사전 생성 포함) |
| 2 | **배포 상태·범위 JSON 브리핑** | `pnpm run deploy:doctor -- --json` | 읽기 전용(현역 인프라·변경 범위·다음 1줄 명령 출력, 시크릿 미출력) |
| 3 | **클라우드 1줄 스마트 배포** | `gh workflow run cloud-production-deploy.yml -f mode=smart-release` | GitHub Actions 수동 배포 실행(onpod 반영 시 `-f onpod_confirm=CONFIRM-ONPOD-TOONSTUDIO-API` 필수) |
| 4 | **로컬 정적 웹 1줄 배포** | `pnpm run deploy:web` | Cloudflare Static+R2 운영 반영(셸 `CLOUDFLARE_API_TOKEN` 충돌 시 `env -u CLOUDFLARE_API_TOKEN pnpm run deploy:web -- --wrangler-oauth`) |
| 5 | **프로덕션 전체 빌드** | `pnpm run build` | 웹 타입체크 → `dist/` 번들 생성 → 제3자 고지서·CSP 검증 |
| 6 | **변경 파일 빠른 린트** | `pnpm run lint:quick` | 읽기 전용(변경된 JS/TS 파일만 ESLint 점검) |
| 7 | **전체 타입체크(웹+API)** | `pnpm run typecheck` | 읽기 전용(웹 샤드 + Core API TypeScript 검증) |
| 8 | **아키텍처·문서·래칫 일괄 검증** | `pnpm run validate:architecture` | 읽기 전용(문서 링크·레이아웃·앱 경계·800줄 파일 크기·Studio 진입 그래프) |
| 9 | **핵심 단위 테스트 빠른 실행** | `pnpm run test:fast` | 읽기 전용(Vitest 단위 테스트 스위트) |
| 10 | **에이전트 하네스 변경 검증** | `pnpm run harness:verify` | 읽기 전용(변경 범위에 맞춘 필수 게이트 자동 선별) |

### 배포 전·후 안전 체크리스트 (최소 루틴)

```bash
# 실행 위치: 저장소 루트 (읽기 전용 사전 점검, 부작용 없음)
pnpm run deploy:doctor -- --json     # 1) 현재 SHA · CI · 인증 · 변경 범위 확인
pnpm run deploy:verify               # 2) 무료 인프라 정책 · Cloudflare 4대 Worker 사전 검증
pnpm run deploy:web:dry-run          # 3) 정적 웹 + R2 드라이런 (운영 반영 없음)

# 운영 반영 후 스모크 (읽기 전용 HTTP 점검)
pnpm run deploy:status:origin
node scripts/verify-production-post-deploy-smoke.mjs
```

- 세부 승인 범위(상시 승인: Cloudflare 정적 웹·Apex 리다이렉트·GHCR API 이미지 / 별도 명시 승인 필수: 서울 onpod `toonstudio-api` 교체·DB·도메인·시크릿·유료 플랜)와 롤백 절차는 [AI·운영자 정본 배포 안내](../operations/ai-deployment-quickstart.md)와 [인프라 정본 지도](../operations/infrastructure-map.md)를 따른다.

---

## 2. `pnpm run scripts:help` 대화형 카탈로그 CLI (`current`)

336개 전체 `package.json` 스크립트를 터미널에서 즉시 그룹별·키워드별로 찾아볼 수 있는 무의존성 CLI([`scripts/repo-scripts-catalog.mjs`](../../scripts/repo-scripts-catalog.mjs))와 단위 테스트([`scripts/repo-scripts-catalog.test.mjs`](../../scripts/repo-scripts-catalog.test.mjs))를 제공한다.

```bash
# 실행 위치: 저장소 루트 (읽기 전용, 부작용 없음)
pnpm run scripts:help                     # 핵심 10줄 퀵스타트 + 10대 한글 그룹 요약
pnpm run scripts:help -- --group deploy   # 특정 그룹 전체 목록 (키: dev/build/deploy/lint-arch 등 또는 번호 1~10)
pnpm run scripts:help -- --group 3        # 번호(3) 또는 한글명(--group 배포)으로도 조회 가능
pnpm run scripts:help -- --search webgpu  # 스크립트명·명령어·한글 설명 통합 검색
pnpm run scripts:help -- --all            # 336개 전체 스크립트 한 번에 펼치기
pnpm run scripts:help -- --json           # 자동화·도구 연동용 구조화 JSON 출력
```

---

## 3. `package.json` 336개 스크립트 10대 한글 그룹 총람 (`current`)

> 재현 명령: `node scripts/repo-scripts-catalog.mjs --json` (2026-11-23 실측, 기존 335개 + `scripts:help` 1개 = **336개 100% 배정**)

| 번호 | 그룹 키 | 한글 그룹명 | 스크립트 수 | 대표 명령 | 핵심 역할 |
| --- | --- | --- | ---: | --- | --- |
| 1 | `dev` | **1. 개발·실행** | 18 | `dev`, `dev:api`, `dev:all`, `dev:admin`, `dev:brush-lab`, `preview` | 로컬 웹·API·실험 앱 실행, 빌드 미리보기, 모바일·3D/음악 생성 CLI |
| 2 | `build` | **2. 빌드·번들·프리캐시** | 24 | `build`, `build:bundle`, `build:all`, `check:studio-bundle`, `check:product-tour-remotion-chunks`, `lhci:autorun` | 프로덕션 Vite/워크스페이스 빌드, 번들·Remotion G5 청크 게이트, 모바일 패키징 |
| 3 | `deploy` | **3. 배포·클라우드(1줄 명령)** | 50 | `deploy:doctor`, `deploy:cloud`, `deploy:web`, `deploy:verify`, `deploy:preflight`, `deploy:auth:sync` | Cloudflare Static/R2/Apex/Realtime/Analytics·서울 onpod·GCP 무료 데이터 플레인 수동 배포·진단 |
| 4 | `lint-arch` | **4. 타입·린트·아키텍처** | 34 | `typecheck`, `typecheck:web`, `lint:quick`, `lint:strict`, `validate:architecture`, `check:source-file-size`, `check:studio-eager-graph` | 샤드 타입체크, ESLint 무경고, 800줄·진입 그래프·앱 경계·고아 코드·Knip 래칫 |
| 5 | `test-core` | **5. 핵심 단위/통합 테스트** | 24 | `test`, `test:fast`, `test:perf`, `test:coverage`, `test:a11y`, `test:collab-stability`, `ci`, `verify:push` | Vitest 단위/성능/커버리지, 접근성, 마켓 E2E, 협업 안정성, 전체 CI 게이트 |
| 6 | `studio-3d` | **6. 스튜디오·브러시·3D 검증** | 119 | `verify:studio-engine`, `verify:studio-brushes`, `verify:studio-hokusai-wasm`, `verify:studio-3d-web-authoring`, `bench:studio-engine` | WebGPU·Hokusai WASM·Vello·ThorVG·브러시·필터·BG3D·VRM·가상 스튜디오 품질 검증 및 내구 벤치 |
| 7 | `docs-i18n` | **7. 문서·i18n·카탈로그** | 15 | `validate:documentation`, `manual:gen`, `i18n:builtins:gen`, `verify:i18n-builtins`, `catalog:gen` | 1,210+ 관리 문서 링크·권위 검증, Studio 매뉴얼 생성, 내장 다국어 사전, 작품 카탈로그 |
| 8 | `security-audit` | **8. 보안·라이선스·감사** | 24 | `audit:security`, `audit:licenses`, `quality:secrets`, `verify:csp`, `audit:sitewide-visual-ux`, `audit:repo-hygiene:check` | 취약점·시크릿·CSP·제3자 라이선스(mixbox 차단)·번들 권리·시각 UX·저장소 위생 감사 |
| 9 | `db-local` | **9. DB·API·로컬스택** | 16 | `db:push`, `db:seed`, `local:test`, `local:test:smoke`, `test:postgres:integration`, `test:redis:integration` | Drizzle 스키마 푸시, 운영 빈 DB 부트스트랩, 시드, PostgreSQL/Redis 통합·로컬 풀스택 |
| 10 | `harness-tools` | **10. 하네스·기타 도구** | 12 | `scripts:help`, `harness:doctor`, `harness:check`, `harness:verify`, `toonbridge`, `studio:mcp`, `studio:cli` | 에이전트 하네스 무결성, Husky Git 훅, ToonBridge 로컬 브리지, MCP/CLI 및 카탈로그 |

---

## 4. 루트 및 워크스페이스 설정 파일 그룹핑 맵 (`current`)

루트 디렉터리에 설정 파일이 많아 보이는 이유는 TypeScript 프로파일 분리, 성능 직렬 테스트 격리, 툴체인 표준 위치 제약 때문이다. 아래 7개 그룹으로 나누어 보면 각 파일의 소유자와 역할이 즉시 드러난다.

### 4.1 TypeScript 설정 (`tsconfig*.json`)

| 파일 | 역할 및 범위 | 사용 명령 |
| --- | --- | --- |
| [`tsconfig.json`](../../tsconfig.json) | 모노레포 루트 기준 TypeScript 설정(`strict: true`, `verbatimModuleSyntax`, `bundler` 해석) | `pnpm run typecheck:web` |
| [`tsconfig.packages.json`](../../tsconfig.packages.json) | `packages/` 공용 패키지 6종 Project References 집계 | 패키지 증분 점검 |
| [`tsconfig.toonstudio-core.json`](../../tsconfig.toonstudio-core.json) | Studio 핵심 비-UI 도메인(아카이브·프리플라이트·로컬라이제이션 등) 집중 검증 | 스튜디오 코어 타깃 검증 |
| [`tsconfig.toonstudio-ui.json`](../../tsconfig.toonstudio-ui.json) | Studio 셸·AI 핸드오프·내보내기 UI 컴포넌트 집중 검증 | 스튜디오 UI 타깃 검증 |
| [`tsconfig.bg3d-runtime.json`](../../tsconfig.bg3d-runtime.json) | BG3D WebGPU 기즈모 런타임 Playwright·리포터 전용 검증 | `verify:studio-bg3d-webgpu-rotation` |
| [`tsconfig.learning.json`](../../tsconfig.learning.json) | 학습·교실 도메인(`apps/web/src/domains/learn/**`) 집중 검증 | 학습 도메인 타깃 검증 |
| [`tsconfig.market-scope.json`](../../tsconfig.market-scope.json) | 마켓플레이스 판매자·공동구매 스코프 집중 검증 | 마켓 도메인 타깃 검증 |
| [`tsconfig.type-coverage.json`](../../tsconfig.type-coverage.json) | `type-coverage --at-least 95` 측정 전용(테스트·생성물 제외) | `pnpm run check:type-coverage` |
| `apps/*/tsconfig.json` · `packages/*/tsconfig.json` | 각 앱(`apps/api`, `admin-web`, `brush-lab`, `character-lab`)과 패키지 독립 설정 | `pnpm run typecheck` |

### 4.2 Vite · CSS · 모노레포 빌드 설정

| 파일 | 역할 및 소유자 | 비고 |
| --- | --- | --- |
| [`apps/web/vite.config.ts`](../../apps/web/vite.config.ts) | 메인 웹 앱 프로덕션·개발 Vite 설정 정본(`envDir` 루트, COOP/COEP, 프리캐시) | 루트 `vite.config.ts` 금지(앱 소유 강제) |
| [`apps/web/config/vite-manual-chunks.ts`](../../apps/web/config/vite-manual-chunks.ts) | 대형 라이브러리(Three/Babylon/Skia/Remotion 등) 수동 청크 분할 규칙 | `check:studio-bundle`과 연동 |
| [`vite.feedback-review.config.ts`](../../vite.feedback-review.config.ts) | 피드백 리뷰 하네스 전용 경량 Vite 서버 설정 | `playwright.feedback.config.ts` 연동 |
| `apps/{admin-web,brush-lab,character-lab}/vite.config.ts` | 관리자 웹 및 2개 실험 앱 독립 Vite 설정 | `dev:admin`·`dev:brush-lab`·`dev:character-lab` |
| [`postcss.config.mjs`](../../postcss.config.mjs) | Tailwind CSS v4(`@tailwindcss/postcss`) 포스트프로세서 설정 | 전역 스타일 빌드 |
| [`pnpm-workspace.yaml`](../../pnpm-workspace.yaml) · [`turbo.json`](../../turbo.json) | pnpm 워크스페이스 멤버 정의 및 Turborepo 로컬 태스크 의존 그래프 | 유료 원격 캐시·무승인 동시 빌드 금지 |

### 4.3 Vitest · Playwright 테스트 설정

| 파일 | 역할 및 범위 | 사용 명령 |
| --- | --- | --- |
| [`vitest.config.ts`](../../vitest.config.ts) | 기본 단위·컴포넌트 테스트 설정(성능 예산 직렬 파일 제외) | `pnpm run test:root`, `pnpm run test:fast` |
| [`vitest.setup.ts`](../../vitest.setup.ts) | 테스트 실행 전 Studio/App 다국어 사전(i18n JSON) 로드 및 공통 훅 설정 | 모든 Vitest 스위트 자동 로드 |
| [`vitest.perf.config.ts`](../../vitest.perf.config.ts) | 단일 워커 직렬 실행 성능 예산 전용 설정 | `pnpm run test:perf` |
| [`vitest.perf-budget-files.mjs`](../../vitest.perf-budget-files.mjs) · [`vitest.serial-test-files.mjs`](../../vitest.serial-test-files.mjs) | 병렬 부하 간섭을 피해야 하는 성능·직렬 테스트 파일 목록 단일 원장 | `vitest.config.ts`·`vitest.perf.config.ts` 공유 |
| [`vitest.sonar.config.ts`](../../vitest.sonar.config.ts) | SonarQube용 V8 LCOV 커버리지(`coverage/sonar`) 전용 설정 | `pnpm run sonar` 사전 단계 |
| [`playwright.config.ts`](../../playwright.config.ts) | 루트 기본 E2E 진입점(SwiftShader 소프트웨어 GPU · 3D/접근성 스모크) | `pnpm run test:a11y`, `verify:studio-3d-visual` |
| `config/playwright/*.config.{ts,mjs}` (29종) | 마켓·접근성·BG3D·웹 오서링·모바일·프로모·풀스택 등 영역별 특화 E2E 설정 | [`config/README.md`](../../config/README.md) §2 참조 |

### 4.4 ESLint · 정적 품질 · Git 훅 설정

| 파일 | 역할 | 비고 |
| --- | --- | --- |
| [`eslint.config.mjs`](../../eslint.config.mjs) | Flat ESLint 10 정본(`@heejun/eslint-config`, React 19 Compiler, `@shadcn/lint` OKLCH 토큰 검사, 경계 규칙) | `pnpm run lint:strict` |
| [`eslint.legacy-exceptions.json`](../../eslint.legacy-exceptions.json) | React Compiler opt-out·클로저 백 예외 파일 단방향 하향 래칫 원장 | `scripts/eslint-legacy-exceptions.test.mjs` 검증 |
| [`knip.json`](../../knip.json) | 미사용 파일·export·의존성·순환 참조(`cycles: "warn"`) 검사 설정 | `quality:deadcode`·`quality:imports`·`quality:cycles` |
| [`lighthouserc.json`](../../lighthouserc.json) | 성능 `>=0.9`, CLS `<=0.1` 등 Lighthouse CI 예산 기준 | `pnpm run lhci:autorun` |
| [`.secretlintrc.json`](../../.secretlintrc.json) · [`commitlint.config.cjs`](../../commitlint.config.cjs) | 자격증명 유출 차단 규칙 및 한글 Conventional Commits 커밋 메시지 검증 | `.husky/pre-commit`, `.husky/commit-msg` |
| [`sonar-project.properties`](../../sonar-project.properties) · [`.coderabbit.yaml`](../../.coderabbit.yaml) · [`opencode.json`](../../opencode.json) | SonarQube 프로젝트 설정, CodeRabbit PR 리뷰 규칙, OpenCode MCP 설정 | 자동 리뷰·정적 분석 연동 |

### 4.5 배포 · 인프라 · 정책 설정

| 파일 | 상태 | 역할 |
| --- | --- | --- |
| [`deploy/DEPLOY_MANIFEST.json`](../../deploy/DEPLOY_MANIFEST.json) | `current` | 현역 인프라(Cloudflare 4대 Worker+R2 · 서울 onpod API/PG 17), 퇴역 목록, 금지 명령, 1줄 표준 명령 정본 |
| [`deploy/STANDING_APPROVAL.json`](../../deploy/STANDING_APPROVAL.json) | `current` | 상시 승인 범위(정적 웹·Apex·GHCR 이미지)와 명시 승인 경계 정책 |
| `deploy/cloudflare-{static,apex-redirect,realtime}/wrangler.jsonc` | `current` | Cloudflare Workers 정적·리다이렉트·Durable Objects 바인딩 설정 |
| [`config/deployment/environment-contract.json`](../../config/deployment/environment-contract.json) | `current` | 프로파일별(`local`/`onpod-current`/`generic-separated`) 환경변수 계약 |
| `config/*.json` (20종) | `current` | 문서 권위([`documentation-authority.json`](../../config/documentation-authority.json)), 아키텍처·소스 래칫, HTTP 헤더, 무료 인프라, 번들 권리 원장 |
| [`render.yaml`](../../render.yaml) | `retired` (역사 유지) | Render는 2026-10-23 퇴역·삭제되었으나, 7개 계약·사실 검증 테스트가 역사 Blueprint 경로를 참조하므로 테스트 완화 금지 원칙에 따라 루트 유지([`config/README.md`](../../config/README.md) §4) |

### 4.6 ENV 환경변수 파일 지도 (`AGENTS.md` §9 시크릿 보호 정책)

> **절대 원칙**: 실제 비밀값·토큰·DB 자격증명은 코드·문서·로그·테스트·Git에 절대 기록하거나 출력하지 않는다. 아래 표는 **파일 역할과 위치 지도**만 안내한다.

| 구분 | 파일 경로 | Git 추적 | 용도 및 보호 규칙 |
| --- | --- | --- | --- |
| **공개·템플릿** (`current`) | [`.env.example`](../../.env.example) | 추적(비밀값 0) | 로컬 개발 기본 전체 변수 이름 템플릿(DB·API·OAuth·Realtime·결제 옵션 키 목록) |
| **공개 브라우저 플래그** (`current`) | [`.env.production`](../../.env.production) | 추적(공개 값 전용) | Vite가 읽는 공개 `VITE_*` 오리진·실시간 프로바이더·오프라인 브랜치 플래그만 포함 |
| **영역별 템플릿** (`current`) | [`config/env/deploy.env.example`](../../config/env/deploy.env.example) · [`config/env/production.env.example`](../../config/env/production.env.example) 외 3종 | 추적(비밀값 0) | 배포·운영 API·크리에이터 리소스·후원 결제 변수 계약 템플릿 |
| **로컬 전용 시크릿** (`current`, 로컬) | `.env.infrastructure.local`, `.env.local`, `.env.production.local` | **비추적(`.gitignore`)** | 운영 인프라·배포 비밀의 유일한 로컬 저장소(`chmod 600` 유지). GitHub Environment 동기화는 반드시 `pnpm run deploy:auth:sync`로 최소권한 키만 단계별 주입 |

---

## 5. `scripts/` 디렉터리 구조 요약 (`current`)

> 재현 명령: `git ls-files scripts/ | wc -l` · `git ls-files scripts/ | grep -v '/.*/' | wc -l` (2026-11-23 기준 **전체 1,641개 파일** = 최상위 **1,033개** + 19개 하위 디렉터리 **608개**)

### 5.1 최상위 스크립트 접두사별 분류 (`scripts/*`, 1,033개)

| 접두사 | 파일 수(2026-11-23) | 주요 역할 | 대표 진입점 |
| --- | ---: | --- | --- |
| `verify-*` | 353 | 브러시·WebGPU·3D·VRM·Cloudflare·인프라·릴리스 자동 검증 | `verify-studio-engine.mjs`, `verify-free-infrastructure-policy.mjs` |
| `studio-*` | 161 | Studio 에셋 파이프라인, 브러시·3D·VRM 생성/벤치/진단 도구 | `studio-asset-release.ts`, `studio-toolchain-check.ts` |
| `generate-*` | 50 | 렌더러 역할 원장, 고지서, i18n 내장 사전, Cloudflare 규칙, 가상 아트 생성 | `generate-third-party-notices.mjs`, `generate-i18n-builtins.mjs` |
| `ci-*` · `run-*` | 53 | CI 샤드 분배, 변경 파일 테스트, PG/Redis 통합 러너 | `run-changed-unit-tests.mjs`, `run-postgres-integration-tests.mjs` |
| `audit-*` · `check-*` · `validate-*` | 61 | 파일 크기·진입 그래프·고아 코드·문서·앱 경계·시각 UX·위생 감사 | `validate-architecture.mjs`, `validate-documentation.mjs`, `check-source-file-size.mjs` |
| `deploy-*` · `cloudflare-*` · `production-*` · `local-*` | 34 | 수동 배포 디스패치, 프리플라이트, 인증 동기화, 로컬 풀스택 | `dispatch-cloud-deploy.mjs`, `deploy-cloudflare-static.mjs`, `local-test-stack.mjs` |
| 기타 (`repo-*`, `agent-harness*`, `creator-*`, `prepare-*`, `build-*` 등) | 321 | 에이전트 하네스, 스크립트 카탈로그 CLI, 크리에이터 번들 권리, 타입체크 샤드 | [`repo-scripts-catalog.mjs`](../../scripts/repo-scripts-catalog.mjs), `agent-harness.mjs` |

### 5.2 주요 하위 디렉터리 (19개 폴더 · 608개)

- **`scripts/lib/` (315개)**: 배포·래칫·번들·아키텍처 스크립트가 공유하는 재사용 라이브러리 모듈
- **`scripts/blender/` (105개)**: Blender 5.x 헤드리스 캐릭터·배경·UV·GLB 파이프라인 스크립트
- **`scripts/ux-audit/` (33개)** · **`scripts/local-fullstack/` (28개)** · **`scripts/experiments/` (29개)**: 시각 UX 감사, 로컬 풀스택 스모크, 역사적 엔진 실험 기록
- **`scripts/crawlers/` (16개)** · **`scripts/seed/` (9개)** · **`scripts/__tests__/` & `scripts/tests/` (22개)**: 수동 카탈로그 도구, 개발 DB 시드, 스크립트 테스트

---

## 6. 연관 정본 문서

- **차세대 웹 엔지니어링 기술 백서**: [ToonStudio 차세대 웹 엔지니어링 기술 백서](../tech/toonstudio-nextgen-engineering-whitepaper.md) (§9~§10.5 발표용 총괄·클린룸 전략·설정 맵)
- **코드 구조 & 번들 가드레일**: [코드 구조와 번들 경계 패턴](./code-structure-and-bundle-patterns.md)
- **배포 5단계 퀵스타트**: [ToonStudio AI·운영자 정본 배포 안내](../operations/ai-deployment-quickstart.md)
- **`config/` 인덱스**: [`config/README.md`](../../config/README.md)
