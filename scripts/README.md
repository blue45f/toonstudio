# ToonStudio 자동화 스크립트 유지보수 인덱스

기준일: `2026-11-22` (현재 상태)

이 디렉터리는 ToonStudio 저장소의 하네스·아키텍처 검증, 빌드/타입체크, 단위·통합·브라우저 QA, 스튜디오 2D/3D 엔진 검증, 자산·라이선스 거버넌스, 배포 사전 점검 스크립트를 보관한다. 새 스크립트를 추가하거나 기존 스크립트를 수정할 때는 [scripts/AGENTS.md](./AGENTS.md)와 루트 [AGENTS.md](../AGENTS.md)를 함께 따른다.

## 1. 디렉터리 구조

| 경로 | 역할 | 비고 |
| --- | --- | --- |
| `scripts/` (최상위) | `package.json`·GitHub Actions·운영 수동 실행용 CLI 진입점과 정책 단위 테스트 | 1회성 소스 패치·개인 경로 스크립트 금지 |
| `scripts/lib/` | 여러 스크립트가 공유하는 순수 헬퍼·리포지토리 경로·브라우저 하네스 유틸리티 | 직접 실행보다 모듈 재사용 중심 |
| `scripts/blender/` | Blender 3D 자산 생성·정규화·시각 검증 파이프라인 | [source_assets/README.md](./blender/source_assets/README.md) 참고 |
| `scripts/ux-audit/` | 멀티 라우트 시각·접근성·카피 UX 감사 모듈 | [ux-audit/README.md](./ux-audit/README.md) 참고 |
| `scripts/local-fullstack/` | 격리 PostgreSQL/API/Web 로컬 풀스택 기동·시드·스모크 러너 | `pnpm run local:test*` 연결 |
| `scripts/crawlers/` | 수동 카탈로그/연관 정보 수집 모듈 | 자동 스케줄 수집 워크플로 금지 |
| `scripts/seed/` | 개발·페르소나·마켓플레이스 시드 스크립트 | `pnpm run seed:market:dev` 등 |
| `scripts/dontdraw/` | 승인 자산 인테이크 및 검증 스크립트 | 권리·무결성 경계 테스트 포함 |
| `scripts/qa/` | 장시간 소크·크로스 브라우저 QA 설정과 러너 | 일회성 결과물은 저장소 커밋 금지 |
| `scripts/accessibility-sweep-20261107/` | 라우트 접근성 인벤토리·계약 회귀 스위트 | `scripts/ci-required-vitest-targets.txt`에 등록된 회귀 자산 |
| `scripts/project-roundtrip-audit-20261107/` | 프로젝트 왕복 마이그레이션·장애 주입 회귀 테스트 | Vitest 수집 대상 유지 |
| `scripts/studio-quality-assets-20260913/` | 2026-09-13 2D/3D 자산 출처 원장·검증 도우미 | 이력·재현성 보존 |
| `scripts/experiments/` | 2026-09-08 복구 실험 아카이브(`historical`) | [recovered-20260908/README.md](./experiments/recovered-20260908/README.md) 참고 |
| `scripts/__tests__/`, `scripts/tests/`, `scripts/fixtures/`, `scripts/data/`, `scripts/types/` | Node/Vitest/Pytest 보조 테스트, 픽스처, 정적 데이터, 공용 `.d.ts` | 테스트·타입체크 지원 |

## 2. 도메인별 `package.json` 유지보수 인덱스

루트 [package.json](../package.json)의 스크립트(335개)는 아래 7개 운영 도메인으로 나뉜다.

### 2.1 하네스 · 아키텍처 · 저장소 위생
- `pnpm run harness:doctor` / `pnpm run harness:check` / `pnpm run harness:verify` — 에이전트 하네스 구조·변경 범위 검증 (`scripts/agent-harness.mjs`)
- `pnpm run validate:architecture` — 아키텍처·문서·레이아웃·앱 경계·파일 크기·스튜디오 즉시 로드 그래프 통합 검증 (`scripts/validate-architecture.mjs`)
- `pnpm run validate:source-layout` / `pnpm run validate:app-boundaries` / `pnpm run validate:documentation` — 소스 레이아웃 래칫, 앱 간 import 경계, 문서 링크·언어 검증
- `pnpm run check:source-file-size` / `pnpm run check:studio-eager-graph` / `pnpm run check:unconnected-code:gate` — 800줄 상한, 즉시 번들 그래프, 미연결 프로덕션 코드 게이트
- `pnpm run audit:repo-hygiene` / `pnpm run audit:repo-hygiene:check` / `pnpm run test:repo-hygiene` — 임시·디버그·개인경로 파일, 루트 설정 난립, 죽은/중복 `package.json` 스크립트, 죽은 고아 스크립트, 껍데기 테스트 자동 감사 (`scripts/audit-repo-hygiene.mjs`)

### 2.2 빌드 · 타입체크 · 린트 · 보안
- `pnpm run build` / `pnpm run build:bundle` / `pnpm run build:all` — 웹·워크스페이스 빌드 및 정적 CSP/제3자 고지 후처리
- `pnpm run typecheck` / `pnpm run typecheck:web` — 샤드 타입체크 (`scripts/typecheck-shards.mjs`) 및 API 타입체크
- `pnpm run lint` / `pnpm run lint:quick` / `pnpm run lint:strict` — 전체·변경분·경고 상한 린트 (`scripts/lint-changed.mjs`)
- `pnpm run quality:secrets` / `pnpm run quality:secrets:changed` / `pnpm run audit:security` / `pnpm run audit:licenses` — Secretlint, 보안 권고 예외 검증, 제3자 라이선스 고지 검증

### 2.3 테스트 · 통합 · 접근성 · 로컬 풀스택
- `pnpm run test` / `pnpm run test:root` / `pnpm run test:perf` / `pnpm run test:fast` — Vitest 루트·성능 스위트
- `pnpm run test:postgres:integration` / `pnpm run test:redis:integration` — 격리 DB·Redis 통합 테스트 러너
- `pnpm run local:test` / `pnpm run local:test:check` / `pnpm run local:test:seed` / `pnpm run local:test:smoke` — 로컬 풀스택 환경 점검·시드·스모크
- `pnpm run test:a11y` / `pnpm run test:a11y:editor` / `pnpm run test:collab-stability` / `pnpm run test:production-toolchain` — 접근성, 협업 장시간 안정성, 제작 툴체인 스위트

### 2.4 스튜디오 2D · 브러시 · 렌더 엔진 검증
- `pnpm run verify:studio-launch` / `pnpm run verify:studio-menus` / `pnpm run verify:studio-icons` / `pnpm run verify:studio-canvas-chrome` / `pnpm run verify:studio-inapp-feature-sweep` — 에디터 기동·크롬·메뉴·기능 스윕
- `pnpm run verify:studio-brushes` / `pnpm run verify:studio-brush-media` / `pnpm run verify:studio-brush-latency` / `pnpm run verify:studio-long-stroke` / `pnpm run test:studio-material-brush` — 브러시 품질·지연·장획·머티리얼 회귀
- `pnpm run verify:studio-engine` / `pnpm run verify:studio-engine-webgpu-*` / `pnpm run verify:studio-hokusai-wasm` / `pnpm run verify:studio-living-ink-*` — WebGPU·WASM·Living Ink 패리티
- `pnpm run verify:studio-autosave-opfs` / `pnpm run verify:studio-autosave-two-tab` — OPFS 자동저장·2탭 리더 복구 검증

### 2.5 스튜디오 3D · BG3D · VRM · 외부 3D CLI
- `pnpm run verify:studio-3d-web-authoring` / `pnpm run verify:studio-3d-professional-foundation` / `pnpm run verify:studio-3d-professional-completion` — 3D/BG3D 핵심 단위·계약 게이트
- `pnpm run verify:studio-3d-specialists` / `pnpm run verify:studio-3d-inplace` / `pnpm run verify:studio-3d-tiled` / `pnpm run verify:studio-bg3d-webgpu-engine` — 3D 스페셜리스트·인플레이스·타일·WebGPU 검증
- `pnpm run repair:studio-vrm-assets` / `pnpm run check:studio-vrm-assets` / `pnpm run studio:avatar-reference-catalogue:check` — VRM 자산 무결성·카탈로그 점검
- `pnpm run varco3d` / `pnpm run tripo3d` / `pnpm run studio:upload-assets:dry-run` — 외부 3D 생성 CLI 및 자산 업로드 드라이런

### 2.6 카탈로그 · i18n · 번들 권리 · 자산 품질
- `pnpm run catalog:gen` / `pnpm run i18n:builtins:gen` / `pnpm run verify:i18n-builtins` — 정적 카탈로그 및 내장 번역 산출물 생성·검증
- `pnpm run verify:creator-bundle-pack-rights` / `pnpm run verify:creator-bundle-render-rights` / `pnpm run test:creator-bundle-rights` — 크리에이터 번들 권리·출처 게이트
- `pnpm run plan:creator-bundle-deploy` / `pnpm run verify:asset-postcuration` / `pnpm run verify:studio-virtual-art` — 번들 배포 계획·큐레이션 품질·가상스튜디오 아트 검증
- `pnpm run manual:gen` / `pnpm run verify:studio-manual-docs` — 스튜디오 매뉴얼 동기화 확인

### 2.7 배포 · 인프라 · 데이터베이스 운영
- `pnpm run deploy:preflight` / `pnpm run deploy:verify` / `pnpm run deploy:doctor` / `pnpm run deploy:info` — 배포 사전 점검 및 상태 진단 (세부 절차는 [DEPLOY.md](../DEPLOY.md) 참고)
- `pnpm run deploy:web:dry-run` / `pnpm run deploy:web` / `pnpm run deploy:cloud` — Cloudflare 정적 웹 수동 배포 및 클라우드 워크플로 디스패치
- `pnpm run deploy:auth:check` / `pnpm run deploy:auth:sync` — 로컬 `.env.infrastructure.local` 기준 최소권한 배포 환경 확인·동기화
- `pnpm run verify:free-infrastructure` / `pnpm run verify:cloudflare-static` / `pnpm run verify:cloudflare-apex-redirect` / `pnpm run verify:cloudflare-realtime` / `pnpm run verify:cloudflare-analytics` — 인프라 정책·엣지 워커 계약 검증

## 3. 스크립트 위생 유지 원칙

1. **1회성 패치·개인 경로 금지**: 특정 PR/릴리스에서 한 번 적용하고 끝난 소스 문자열 치환 패처나 `/Users/<이름>/.gemini/...` 같은 개인 경로를 하드코딩한 스크립트는 커밋하지 않는다.
2. **표준 진입점 연결**: 재사용할 검증·운영 CLI는 `package.json` 또는 워크플로에 연결하고, 단독 수동 실행 도구라면 파일 상단 주석에 용도와 실행 명령을 명시한다.
3. **사전 위생 점검**: 스크립트나 `package.json`을 변경한 뒤에는 `pnpm run audit:repo-hygiene:check`와 `pnpm run test:repo-hygiene`로 죽은 경로·중복 별칭·고아 패처·껍데기 테스트가 없는지 확인한다.
