# `config/` 인덱스 — 설정 · Playwright · 환경변수 템플릿 지도

상태: **current** · 갱신일: **2026-11-22**

> 두 설정 문서가 충돌할 때는 이 인덱스가 아니라 실제 로더 코드·검증 테스트·배포 현황([`docs/operations/infrastructure-map.md`](../docs/operations/infrastructure-map.md))을 정본으로 따른다.

## 1. 디렉터리 구조

| 경로 | 역할 | 비고 |
| --- | --- | --- |
| `config/playwright/` | 특화 Playwright E2E·회귀 설정 29종 | 기본 [`playwright.config.ts`](../playwright.config.ts)만 루트 유지 |
| `config/env/` | 기능·운영·배포용 Git 추적 환경변수 템플릿 5종 | 기본 [`.env.example`](../.env.example)·공개 [`.env.production`](../.env.production)만 루트 유지 |
| `config/deployment/` | 배포 환경 계약 JSON (`environment-contract.json`) | API `apps/api/src/config/env.ts`와 연동 |
| `config/blender/` | Blender 캐릭터 파이프라인 스키마·설정 | `avatar-orion-production.json`, `reference-character.json`, 스키마 |
| `config/*.json` | 아키텍처 래칫·헤더·문서 권위·무료 인프라·번들 권리 정책 | 아래 4절 표 참조 |

## 2. `config/playwright/` — 특화 Playwright 설정 (29개)

루트의 [`playwright.config.ts`](../playwright.config.ts)는 기본 진입점(`pnpm exec playwright test`, `pnpm run test:a11y`, `verify:studio-3d-visual`)을 담당한다.
나머지 29개 특화 설정(`playwright.*.config.{ts,mjs}`)은 `config/playwright/` 아래에 모아 관리한다.

- **경로 규칙**: Playwright는 `testDir`, `outputDir`, `globalSetup`, `reporter` 출력 경로와 `webServer.cwd`를 모두 **설정 파일이 있는 디렉터리(`config/playwright/`) 기준**으로 해석한다.
  - 따라서 `config/playwright/` 안의 모든 설정은 `testDir: "../../e2e"`(또는 `"../../apps/web/tools/browser-tests"`), `webServer.cwd: "../.."`(또는 `resolve(__dirname, "../..")`), 출력 경로 `"../../test-results/..."` / `"../../.qa/..."` / `"../../artifacts/..."`를 사용한다.
- **영역별 분류**:
  - **핵심 CI · 접근성 · 워크플로**: `playwright.a11y.config.ts`, `playwright.studio-editor-a11y.config.ts`, `playwright.production-workflows.config.ts`, `playwright.pigment-product.config.ts`, `playwright.non-studio.config.ts`, `playwright.feedback.config.ts`, `playwright.creator-hub.config.ts`, `playwright.references.config.ts`, `playwright.assets-layout.config.ts`, `playwright.promo.config.ts`
  - **스튜디오 3D · 런타임 · 회귀 게이트**: `playwright.bg3d-runtime.config.ts`, `playwright.hybrid-dcc-uv.config.ts`, `playwright.studio-3d-reference.config.ts`, `playwright.studio-3d-v31.config.ts`, `playwright.studio-mobile-authoring.config.ts`, `playwright.studio-production-followup.config.ts`, `playwright.studio-qa-helpers.config.ts`, `playwright.studio-web-authoring.config.ts`, `playwright.studio-data-persistence.config.ts`, `playwright.workspace.config.ts`
  - **마켓 · UX · 세미나 · 풀스택 스모크**: `playwright.market.config.ts`, `playwright.market-live.config.ts`, `playwright.mobile-ux.config.ts`, `playwright.sitewide-ux.config.ts`, `playwright.site-directory.config.ts`, `playwright.seminar.config.ts`, `playwright.title-reference.config.ts`, `playwright.usability.config.ts`, `playwright.local-fullstack.config.mjs`

## 3. `config/env/` — 환경변수 템플릿 지도 및 로컬 시크릿 정리 안내

### 3.1 Git 추적 템플릿 (비밀값 0개)

| 파일 | 위치 | 용도 |
| --- | --- | --- |
| [`.env.example`](../.env.example) | 루트 유지 | 로컬 개발 기본 전체 환경변수 템플릿 |
| [`.env.production`](../.env.production) | 루트 유지 | Vite(`envDir: repositoryRoot`)가 직접 읽는 공개 브라우저 origin·플래그 전용 파일 |
| [`config/env/production.env.example`](./env/production.env.example) | `config/env/` | 운영 Core API·Realtime·스토리지 전체 변수 계약 템플릿 (`generic-separated` target 기준) |
| [`config/env/deploy.env.example`](./env/deploy.env.example) | `config/env/` | 로컬 ↔ GitHub Actions `production-deploy` 클라우드 배포 변수·시크릿 이름 목록 |
| [`config/env/creator-resources.env.example`](./env/creator-resources.env.example) | `config/env/` | 크리에이터 리소스 외부 API 키(서버 전용) 템플릿 |
| [`config/env/fortune.env.example`](./env/fortune.env.example) | `config/env/` | 운세/공공데이터 연동 서버 전용 옵션 템플릿 |
| [`config/env/supporter.env.example`](./env/supporter.env.example) | `config/env/` | 자발적 운영비 후원 결제(Toss) fail-closed 옵션 템플릿 |
| `deploy/**/*.env.example` | 각 배포 단위 | 배포 단위별 전용 템플릿(`deploy/onpod/runtime.env.example`, `deploy/cloudflare-static/.env.example`, `deploy/backend-capabilities.env.example`, `deploy/integration-runtime-connectors.env.example`) |

### 3.2 로컬 비추적 시크릿 파일(`.env.*.local`) 수동 정리 가이드 (`AGENTS.md` §9)

로컬 비추적 `.env*` 파일은 `.gitignore`의 `.env*` 규칙으로 보호되며 자동화 도구가 삭제·수정·값 출력·Git 추가를 하지 않는다.
실제 파일 존재 여부와 정리는 소유자가 직접 주 작업트리 루트에서 아래 기준으로 판단한다(세부 키 역할 정본: [`docs/operations/infrastructure-map.md`](../docs/operations/infrastructure-map.md) 5절).

- **필수 보존 (절대 삭제 금지)**
  - `.env.infrastructure.local` — 운영 인프라·배포 비밀의 유일한 주 로컬 저장소(권한 `0600` 유지).
  - `.env.render-backup-20261023.local` — 2026-10-23 Render 삭제 전 백업 원본(퇴역 Render 값의 유일한 사본).
  - `.env.local` — 로컬 개발·AI 토큰용 환경변수.
  - `.env.production.local` — 로컬 Vite 프로덕션 빌드 보강 공개 변수(`scripts/lib/deploy-auth-env.mjs` 참조).
  - `.env.mobile-qa.local` — 모바일 QA 로컬 환경용.
- **수동 정리 검토 대상 (키 누락 없음 확인 후 소유자 판단)**
  - `.env.infrastructure.local.bak-20261023-0408` — 2026-10-23 onpod 컷오버 직전 주 저장소 사본. 값을 출력하지 않고 키 이름만 대조(`comm -23 <(grep -o '^[A-Z0-9_]*=' .env.infrastructure.local.bak-20261023-0408 | sort) <(grep -o '^[A-Z0-9_]*=' .env.infrastructure.local | sort)`)해 누락이 없으면 삭제하거나 오프라인 암호화 백업으로 이동할 수 있다.
  - `oauth-production.env`, `toonstudio-oauth-production.env` — 로컬 소셜 로그인 내보내기 파일이 남아 있다면 macOS Keychain 또는 `.env.infrastructure.local`에 반영됐는지 확인 후 삭제를 검토한다.

## 4. 루트 설정 파일 통합·유지 기준 (2026-11-22)

- **Knip 단일화**: [`knip.json`](../knip.json)으로 통합하고 미로드 중복 파일 `knip.jsonc`를 제거했다(Knip은 `knip.json`을 `knip.jsonc`보다 우선 로드하므로 기존 `knip.jsonc`는 적용되지 않았다). `rules.cycles: "warn"`과 WASM 생성물 `ignoreFiles`는 `knip.json`에 병합했다.
- **OpenCode 단일화**: [`opencode.json`](../opencode.json)으로 통합하고 미표준 도트파일 `.opencode.jsonc`의 `mcp`(`cloudflare`, `cloudflare-docs`) 블록을 `opencode.json`에 병합한 뒤 `.opencode.jsonc`를 제거했다.
- **퇴역 `render.yaml` 루트 유지 사유**: Render 서비스는 2026-10-23 퇴역·삭제되었으나, 현재 7개 Vitest 계약·사실 검증 테스트(`production-domain.test.ts`, `engineering-talk-deck-content.test.ts`, `engineering-architecture-guide-runtime.facts.test.ts`, `engineering-architecture-guide-delivery.test.ts`, `engineering-seminar-lessons.test.ts`, `engineering-seminar.test.ts`, `engineering-library-guide-areas-b.test.ts`)와 공개 기술 페이지 근거 경로가 [`render.yaml`](../render.yaml)을 직접 읽고 검증한다. 테스트 완화를 금지하는 정책에 따라 기술 페이지·계약 테스트의 onpod 이전이 완료될 때까지 역사 Blueprint 기록으로 루트에 유지한다.

## 5. `config/*.json` 정책·래칫 파일 목록

| 파일 | 역할 | 주의 사항 |
| --- | --- | --- |
| `architecture-boundary-ratchet.json` | 아키텍처 경계 래칫 | `scripts/validate-app-boundaries.mjs`와 함께 경계를 강제한다 |
| `architecture-source-ratchet.json` | 소스 레이아웃·경고 예산 래칫 | `scripts/validate-source-layout.mjs`의 기준 원장 |
| `http-response-headers.json` | HTTP 응답 헤더 정본 장부 | Cloudflare 정적 규칙 생성기의 단일 소스 |
| `documentation-authority.json` | 문서 권위·링크 검증 정책 | `scripts/validate-documentation.mjs`의 기준 원장 |
| `production-migration-baseline.json` | 운영 마이그레이션 체크섬 기준 | `scripts/verify-production-release-compatibility.mjs`가 검증 |
| `free-database-federation.json` | 무료 티어 데이터베이스 연합 정책 | `scripts/verify-free-database-federation.mjs`가 검증 |
| `free-infrastructure-policy.json` | 무료 티어 인프라 정책 | `scripts/verify-free-infrastructure-policy.mjs`가 검증 |
| `creator-bundle-*.json` | 크리에이터 번들 권리·인제스트·씬 레시피 | 권리 게이트(`verify:creator-bundle-pack-rights`) 연동 |
| `site-original-ost.production.json` | 사이트 OST 운영 설정 | 운영 오디오 매니페스트 기준 |
| `studio-plasticine-materials-source.json` | 플라스티신 재질 소스 레시피 | 해시·채널 메타데이터 관리 |
| `studio-production-toolchain.json` | 스튜디오 운영 툴체인 | `verify:toolchain-coverage` 연동 |
| `deployment/environment-contract.json` | 배포 프로파일별 환경 계약 | `local` / `onpod-current` / `generic-separated` |
| `blender/` | Blender 캐릭터 파이프라인 설정·스키마 | `avatar-orion-production.json`, `reference-character.json` |
