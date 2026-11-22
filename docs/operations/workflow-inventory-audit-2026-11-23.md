# GitHub Actions 워크플로 106개 전수 감사표 (2026-11-23)

- **문서 상태**: `current` (2026-11-23 실측 읽기 전용 감사 — `.github/workflows/*.yml` 변경 없음)
- **감사 범위**: 저장소 `.github/workflows/*.yml` 전수 스캔 (총 **106개** 워크플로, 총 **151개** 잡 정의)
- **원칙**: 모든 수치는 2026-11-23 기준 실제 워크플로 YAML 파일 파싱 실측치이며, 추정 수치나 미검증 실행 이력을 혼합하지 않습니다. 워크플로 삭제·통합·트리거 수정은 별도 PR과 소유자 승인 대상입니다.

## 1. 총괄 요약 (2026-11-23 실측)

| 항목 | 실측 수량 | 비중 / 비고 |
| --- | ---: | --- |
| 전체 워크플로 파일 | 106 | `.github/workflows/*.yml` 전수 |
| 전체 정의 잡(`jobs.*`) 합계 | 151 | 파일당 평균 1.42개 |
| `concurrency` 선언 워크플로 | 106 / 106 | 100% 적용 완료 |
| `workflow_dispatch` 지원 | 98 | 수동 단독 **10개**, 타 트리거 병행 88개 |
| `pull_request` 트리거 | 80 | `paths` 필터 있음 76개, 무필터 **4개** |
| `push` 트리거 | 47 | 과거 2026-09 브랜치 잔존 **23개**(그중 과거 브랜치 단독 **14개**), 태그 1개 |
| `schedule` 트리거 | 33 | 매시간 1개 · 일간 5개 · 주간 27개 |
| `workflow_call` 트리거 | 6 | 저장소 내부 호출자 0건 **6개**(단독 고아 **1개**) |
| `merge_group` 트리거 | 1 | [ci.yml](../../.github/workflows/ci.yml) 단독 |
| `if: false` 비활성 잡 포함 | 1 | [health-recovery-diagnostics.yml](../../.github/workflows/health-recovery-diagnostics.yml) (`production-inspect`) |

## 2. 비활성·고아·과거 브랜치 트리거 감사 (실측)

### 2.1 완전 고아 재사용 워크플로 및 미호출 `workflow_call` (6개)

저장소 `.github/workflows/*.yml` 전체에서 `uses: ./.github/workflows/...` 호출을 전수 스캔한 결과 호출자가 **0건**인 워크플로는 6개입니다.

| 워크플로 | 선언 트리거 | 내부 호출자 수 | 판정 |
| --- | --- | ---: | --- |
| [character-contact-naturalness.yml](../../.github/workflows/character-contact-naturalness.yml) | `pull_request, push, workflow_call, workflow_dispatch` | 0 | 미사용 workflow_call 선언(타 트리거로만 실행) |
| [creator-resources.yml](../../.github/workflows/creator-resources.yml) | `pull_request, push, workflow_call, workflow_dispatch` | 0 | 미사용 workflow_call 선언(타 트리거로만 실행) |
| [feedback-community-validation.yml](../../.github/workflows/feedback-community-validation.yml) | `pull_request, push, workflow_call, workflow_dispatch` | 0 | 미사용 workflow_call 선언(타 트리거로만 실행) |
| [sonarqube.yml](../../.github/workflows/sonarqube.yml) | `workflow_call` | 0 | 완전 고아(자동/수동 실행 경로 없음) |
| [studio-collaboration-sync.yml](../../.github/workflows/studio-collaboration-sync.yml) | `pull_request, push, workflow_call, workflow_dispatch` | 0 | 미사용 workflow_call 선언(타 트리거로만 실행) |
| [studio-discovery-ux.yml](../../.github/workflows/studio-discovery-ux.yml) | `pull_request, push, workflow_call, workflow_dispatch` | 0 | 미사용 workflow_call 선언(타 트리거로만 실행) |

### 2.2 `if: false` 영구 비활성 잡 (1개)

- [health-recovery-diagnostics.yml](../../.github/workflows/health-recovery-diagnostics.yml): `production-inspect` 잡에 `if: false`가 고정되어 있으며, 2026-10-22 퇴역·삭제된 Neon DB 호스트를 참조하는 구 복구 진단 잡이 남아 있습니다(`verify` 잡은 정상 활성).

### 2.3 과거 2026-09 브랜치에 고정된 비활성 `push.branches` 트리거 (23개)

`push.branches`에 `main` 이외의 2026-09 작업·릴리스 브랜치가 남아 있는 워크플로는 **23개**이며, 그중 **14개**는 `main` 없이 과거 브랜치만 지정해 사실상 `push` 트리거가 비활성 상태입니다.

| 워크플로 | `push.branches` 선언 값 | 비활성 여부 |
| --- | --- | --- |
| [api-runtime-release.yml](../../.github/workflows/api-runtime-release.yml) | `work/api-runtime-followup-20260912` | 과거 브랜치 단독(push 비활성) |
| [blender-character-pipeline.yml](../../.github/workflows/blender-character-pipeline.yml) | `feat/blender-character-quality-pipeline-20260904` | 과거 브랜치 단독(push 비활성) |
| [character-merge-validation.yml](../../.github/workflows/character-merge-validation.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [creator-portable-quality.yml](../../.github/workflows/creator-portable-quality.yml) | `feat/offline-inference-spatial-20260913` | 과거 브랜치 단독(push 비활성) |
| [creator-runtime-quality.yml](../../.github/workflows/creator-runtime-quality.yml) | `feat/offline-inference-spatial-20260913` | 과거 브랜치 단독(push 비활성) |
| [feedback-community-validation.yml](../../.github/workflows/feedback-community-validation.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [non-studio-experience-audit.yml](../../.github/workflows/non-studio-experience-audit.yml) | `codex/non-studio-experience-20260913` | 과거 브랜치 단독(push 비활성) |
| [nonstudio-journey-audit.yml](../../.github/workflows/nonstudio-journey-audit.yml) | `feat/nonstudio-luminous-journeys-20260913` | 과거 브랜치 단독(push 비활성) |
| [nonstudio-merge-regressions.yml](../../.github/workflows/nonstudio-merge-regressions.yml) | `feat/nonstudio-luminous-journeys-20260913` | 과거 브랜치 단독(push 비활성) |
| [studio-2d-asset-quality.yml](../../.github/workflows/studio-2d-asset-quality.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [studio-asset-curation-pilot.yml](../../.github/workflows/studio-asset-curation-pilot.yml) | `feat/studio-curated-assets-quality-20260906` | 과거 브랜치 단독(push 비활성) |
| [studio-brush-filter-stability.yml](../../.github/workflows/studio-brush-filter-stability.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [studio-finishing-quality.yml](../../.github/workflows/studio-finishing-quality.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [studio-gpu-soak-repro.yml](../../.github/workflows/studio-gpu-soak-repro.yml) | `release/salvage-integration-20260908` | 과거 브랜치 단독(push 비활성) |
| [studio-hyper3d-live-acceptance-v2.yml](../../.github/workflows/studio-hyper3d-live-acceptance-v2.yml) | `codex/studio-large-epics-closure-20260909` | 과거 브랜치 단독(push 비활성) |
| [studio-manual.yml](../../.github/workflows/studio-manual.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [studio-manuscript-delivery-acceptance.yml](../../.github/workflows/studio-manuscript-delivery-acceptance.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [studio-mesh-sync-repair.yml](../../.github/workflows/studio-mesh-sync-repair.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [studio-production-integrity.yml](../../.github/workflows/studio-production-integrity.yml) | `main, release/salvage-integration-20260908` | main 병행 + 과거 브랜치 잔존 |
| [studio-soak-10h.yml](../../.github/workflows/studio-soak-10h.yml) | `qa/studio-soak-10h-20260902` | 과거 브랜치 단독(push 비활성) |
| [studio-wearable-quality-audit.yml](../../.github/workflows/studio-wearable-quality-audit.yml) | `fix/studio-wearable-quality-audit-20260906` | 과거 브랜치 단독(push 비활성) |
| [webgpu-brush-phase2.yml](../../.github/workflows/webgpu-brush-phase2.yml) | `feat/webgpu-brush-phase2-sparse-tiles-20260904` | 과거 브랜치 단독(push 비활성) |
| [webgpu-tile-provider-v2-atlas.yml](../../.github/workflows/webgpu-tile-provider-v2-atlas.yml) | `feat/webgpu-tile-provider-v2-atlas-clean-20260904` | 과거 브랜치 단독(push 비활성) |

## 3. 중복·유사 도메인 워크플로 군집 분석 (실측)

| 군집 | 대상 워크플로 | 중복·겹침 사실 (파일 기준) | 정비 우선순위 |
| --- | --- | --- | --- |
| 병합 브랜치 정리 | [cleanup-merged-branches.yml](../../.github/workflows/cleanup-merged-branches.yml), [cleanup-merged-pr-branches.yml](../../.github/workflows/cleanup-merged-pr-branches.yml) | 두 파일 모두 `scripts/cleanup-merged-branches.mjs --apply`를 호출하며, 전자는 `7 * * * *`(24회/일)+`push(main)`, 후자는 `pull_request(types: [closed])`에서 중복 실행 | P0 (통합 검토) |
| 전체 테스트·진단 | [ci.yml](../../.github/workflows/ci.yml), [full-test-diagnostic.yml](../../.github/workflows/full-test-diagnostic.yml), [main-full-qa-fast-diagnostics.yml](../../.github/workflows/main-full-qa-fast-diagnostics.yml), [main-full-qa-studio.yml](../../.github/workflows/main-full-qa-studio.yml) | `full-test-diagnostic.yml`이 무필터 `pull_request`에서 90분 제한으로 전수 테스트 실행(필수 체크는 `ci.yml`의 `core`/`verify`) | P0 (PR 트리거 라벨/수동 전환 검토) |
| Non-Studio 품질 | [non-studio-experience-quality.yml](../../.github/workflows/non-studio-experience-quality.yml), [non-studio-experience-audit.yml](../../.github/workflows/non-studio-experience-audit.yml), [nonstudio-journey-audit.yml](../../.github/workflows/nonstudio-journey-audit.yml), [nonstudio-merge-regressions.yml](../../.github/workflows/nonstudio-merge-regressions.yml), [public-site-experience.yml](../../.github/workflows/public-site-experience.yml) | 5개 워크플로로 분산, 3개는 2026-09 작업 브랜치 `push` 잔존 | P1 (단일 Non-Studio 게이트 통합 검토) |
| Studio 브러시·필터 | [studio-brush-filter-stability.yml](../../.github/workflows/studio-brush-filter-stability.yml), [studio-brush-quality-portfolio.yml](../../.github/workflows/studio-brush-quality-portfolio.yml), [studio-brush-semantic-quality.yml](../../.github/workflows/studio-brush-semantic-quality.yml), [webgpu-brush-phase2.yml](../../.github/workflows/webgpu-brush-phase2.yml), [webgpu-dab-tile-binning-compute.yml](../../.github/workflows/webgpu-dab-tile-binning-compute.yml), [webgpu-tile-provider-v2-atlas.yml](../../.github/workflows/webgpu-tile-provider-v2-atlas.yml) | `verify:studio-brushes`·`build:bundle`·`typecheck-shards.mjs`가 다수 워크플로에 중복 배치 | P1 (공통 재사용 워크플로화 검토) |
| Studio 장시간 소크 | [studio-five-hour-soak.yml](../../.github/workflows/studio-five-hour-soak.yml), [studio-soak-10h.yml](../../.github/workflows/studio-soak-10h.yml), [studio-gpu-soak-repro.yml](../../.github/workflows/studio-gpu-soak-repro.yml) | `studio-five-hour-soak.yml`은 일간 예약(17:30 UTC), `studio-soak-10h.yml`(최대 355분)·`studio-gpu-soak-repro.yml`은 과거 2026-09 브랜치 고정 | P1 (과거 브랜치 정리·수동 단일화) |
| 마켓 CC0 전달·인계 | [market-cc0-delivery.yml](../../.github/workflows/market-cc0-delivery.yml), [market-cc0-handoff.yml](../../.github/workflows/market-cc0-handoff.yml), [studio-cc0-library.yml](../../.github/workflows/studio-cc0-library.yml) | `market-cc0-handoff.yml`(110분)은 `workflow_dispatch` 없이 `pull_request`+`push`만 선언 | P2 (중복 경로 정비) |
| 영상 렌더링 (수동) | [creator-brand-film.yml](../../.github/workflows/creator-brand-film.yml), [technology-story-film.yml](../../.github/workflows/technology-story-film.yml), [studio-promo-video.yml](../../.github/workflows/studio-promo-video.yml) | 앞 2개는 수동 전용, `studio-promo-video.yml`은 PR 경로 검증 | P2 (현행 유지 가능) |

공통 명령 중복 호출 실측(106개 워크플로 본문 기준): `pnpm run build:bundle` **25개**, `pnpm run typecheck` **8개**, `pnpm run check:studio-bundle` **8개**, `pnpm run validate:architecture` **7개**, `pnpm run build` **7개**, `scripts/typecheck-shards.mjs` **6개**.

## 4. PR 팬아웃(Fan-out) 핫스팟 분석

총 **80개** 워크플로가 `pull_request`에 연결되어 있습니다.

### 4.1 `paths` 필터가 없는 무필터 PR 워크플로 (4개)

| 워크플로 | 비고 | 최대 `timeout-minutes` |
| --- | --- | ---: |
| [ci.yml](../../.github/workflows/ci.yml) | 필수 머지 게이트(`core`, `verify`) | 110 |
| [cleanup-merged-pr-branches.yml](../../.github/workflows/cleanup-merged-pr-branches.yml) | `types: [closed]` 전용(머지 닫힘 시에만 실행) | 20 |
| [codeql.yml](../../.github/workflows/codeql.yml) | 5개 언어 CodeQL 분석(정본 보안 게이트) | 180 |
| [full-test-diagnostic.yml](../../.github/workflows/full-test-diagnostic.yml) | 매 PR 전수 루트+PostgreSQL+성능 스위트 실행(비필수 진단) | 90 |

### 4.2 경로별 최다 PR 팬아웃 패턴 (상위 12개)

| 변경 경로 패턴 (`pull_request.paths`) | 일치 워크플로 수 | 무필터 상시 PR(3개) 합산 시 동시 기동 |
| --- | ---: | ---: |
| `package.json` | 18 | 최대 21개 |
| `pnpm-lock.yaml` | 17 | 최대 20개 |
| `apps/web/src/domains/creator/**` | 6 | 최대 9개 |
| `apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx` | 6 | 최대 9개 |
| `apps/web/vite.config.ts` | 6 | 최대 9개 |
| `scripts/ci-enospc-followup-policy.test.mjs` | 6 | 최대 9개 |
| `apps/web/src/domains/market/**` | 4 | 최대 7개 |
| `scripts/lib/repo-paths.mjs` | 4 | 최대 7개 |
| `scripts/verify-typechecked-build-inputs.mjs` | 4 | 최대 7개 |
| `scripts/verify-typechecked-build-inputs.test.mjs` | 4 | 최대 7개 |
| `apps/web/src/app/routes/**` | 3 | 최대 6개 |
| `apps/web/src/app/routes/groups/**` | 3 | 최대 6개 |

## 5. 스케줄(`schedule`, 33개) 실행 밀도 감사

예약 실행 워크플로는 총 **33개**입니다(매시간 **1개**, 일간 **5개**, 주간 **27개**).

| 워크플로 | Cron (UTC) | 주기 | 병행 트리거 | 최대 timeout(분) |
| --- | --- | --- | --- | ---: |
| [acon-asset-intake.yml](../../.github/workflows/acon-asset-intake.yml) | `19 21 * * 0` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 5 |
| [brand-icon-quality.yml](../../.github/workflows/brand-icon-quality.yml) | `29 20 * * 3` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 20 |
| [bundle-visualizer.yml](../../.github/workflows/bundle-visualizer.yml) | `11 16 * * 1` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 30 |
| [cleanup-merged-branches.yml](../../.github/workflows/cleanup-merged-branches.yml) | `7 * * * *` | 매시간(24회/일) | `push, schedule, workflow_dispatch` | 8 |
| [codeql.yml](../../.github/workflows/codeql.yml) | `17 3 * * 4` | 주간(1회/주) | `pull_request, push, schedule` | 180 |
| [creator-home-quality.yml](../../.github/workflows/creator-home-quality.yml) | `23 16 * * 3` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 24 |
| [dontdraw-intake.yml](../../.github/workflows/dontdraw-intake.yml) | `23 21 * * 1` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 5 |
| [legal-policy-recovery.yml](../../.github/workflows/legal-policy-recovery.yml) | `31 21 * * 3` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 15 |
| [lighthouse-ci.yml](../../.github/workflows/lighthouse-ci.yml) | `13 15 * * 1` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 30 |
| [main-full-qa-fast-diagnostics.yml](../../.github/workflows/main-full-qa-fast-diagnostics.yml) | `37 17 * * *` | 일간(1회/일) | `schedule, workflow_dispatch` | 100 |
| [main-full-qa-studio.yml](../../.github/workflows/main-full-qa-studio.yml) | `17 19 * * *` | 일간(1회/일) | `schedule, workflow_dispatch` | 240 |
| [market-cc0-delivery.yml](../../.github/workflows/market-cc0-delivery.yml) | `17 20 * * 1` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 35 |
| [multi-cloud-local-dynamic-deploy.yml](../../.github/workflows/multi-cloud-local-dynamic-deploy.yml) | `13 20 * * 0` | 주간(1회/주) | `schedule, workflow_dispatch` | - |
| [openssf-scorecard.yml](../../.github/workflows/openssf-scorecard.yml) | `23 20 * * 0` | 주간(1회/주) | `schedule, workflow_dispatch` | 15 |
| [openwiki-update.yml](../../.github/workflows/openwiki-update.yml) | `30 18 * * 0` | 주간(1회/주) | `schedule, workflow_dispatch` | - |
| [reference-rebuild.yml](../../.github/workflows/reference-rebuild.yml) | `29 21 * * 2` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 5 |
| [studio-3d-production-visual-audit.yml](../../.github/workflows/studio-3d-production-visual-audit.yml) | `17 18 * * *` | 일간(1회/일) | `schedule, workflow_dispatch` | 30 |
| [studio-asset-browser.yml](../../.github/workflows/studio-asset-browser.yml) | `23 15 * * 4` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 25 |
| [studio-asset-library-regression.yml](../../.github/workflows/studio-asset-library-regression.yml) | `29 16 * * 4` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 20 |
| [studio-asset-upload-integrity.yml](../../.github/workflows/studio-asset-upload-integrity.yml) | `31 20 * * 4` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 15 |
| [studio-brush-quality-portfolio.yml](../../.github/workflows/studio-brush-quality-portfolio.yml) | `17 15 * * 2` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 45 |
| [studio-brush-semantic-quality.yml](../../.github/workflows/studio-brush-semantic-quality.yml) | `19 16 * * 2` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 35 |
| [studio-editor-client-runtime.yml](../../.github/workflows/studio-editor-client-runtime.yml) | `7 16 * * 0` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 65 |
| [studio-five-hour-soak.yml](../../.github/workflows/studio-five-hour-soak.yml) | `30 17 * * *` | 일간(1회/일) | `schedule, workflow_dispatch` | 35 |
| [studio-interaction-integrity.yml](../../.github/workflows/studio-interaction-integrity.yml) | `31 16 * * 5` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 15 |
| [studio-local-document-regressions.yml](../../.github/workflows/studio-local-document-regressions.yml) | `29 15 * * 5` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 15 |
| [studio-menu-viewport.yml](../../.github/workflows/studio-menu-viewport.yml) | `37 20 * * 5` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 15 |
| [studio-premium-assets-quality.yml](../../.github/workflows/studio-premium-assets-quality.yml) | `37 21 * * 4` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 20 |
| [studio-raster-snapshot-stability.yml](../../.github/workflows/studio-raster-snapshot-stability.yml) | `11 15 * * 0` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 20 |
| [studio-retouch-gesture-stability.yml](../../.github/workflows/studio-retouch-gesture-stability.yml) | `23 20 * * 2` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 20 |
| [webgpu-dab-tile-binning-compute.yml](../../.github/workflows/webgpu-dab-tile-binning-compute.yml) | `19 15 * * 3` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 45 |
| [webtoon-assistant-regression.yml](../../.github/workflows/webtoon-assistant-regression.yml) | `41 21 * * 5` | 주간(1회/주) | `pull_request, schedule, workflow_dispatch` | 15 |
| [webtoon-ci-failure-summary.yml](../../.github/workflows/webtoon-ci-failure-summary.yml) | `17 0 * * *` | 일간(1회/일) | `pull_request, schedule, workflow_dispatch` | 20 |

## 6. 수동 전용(`workflow_dispatch` 단독, 10개) 인벤토리

| 워크플로 | 이름 | 잡 수 | 최대 timeout(분) | 역할 구분 |
| --- | --- | ---: | ---: | --- |
| [api-container-release.yml](../../.github/workflows/api-container-release.yml) | API container release | 1 | 45 | 운영 배포·이미지·마이그레이션 |
| [ci-throughput-validation.yml](../../.github/workflows/ci-throughput-validation.yml) | CI throughput validation | 1 | 25 | 운영 감사·검증 |
| [cloud-production-deploy.yml](../../.github/workflows/cloud-production-deploy.yml) | Cloud production deploy | 6 | 45 | 운영 배포·이미지·마이그레이션 |
| [creator-brand-film.yml](../../.github/workflows/creator-brand-film.yml) | Render ToonStudio brand films | 1 | 30 | 브랜드·엔지니어링 영상 렌더 |
| [onpod-admin-readonly-audit.yml](../../.github/workflows/onpod-admin-readonly-audit.yml) | Onpod admin read-only audit | 1 | 10 | 운영 감사·검증 |
| [production-database-migrations.yml](../../.github/workflows/production-database-migrations.yml) | Approved production database migrations | 1 | 45 | 운영 배포·이미지·마이그레이션 |
| [production-readiness.yml](../../.github/workflows/production-readiness.yml) | Production readiness (audit only) | 1 | 30 | 운영 감사·검증 |
| [studio-asset-upload.yml](../../.github/workflows/studio-asset-upload.yml) | Studio 3D Asset Batch Upload | 1 | 60 | 3D 에셋 일괄 업로드 |
| [studio-discovery-contracts.yml](../../.github/workflows/studio-discovery-contracts.yml) | Studio discovery contracts | 1 | 15 | 운영 감사·검증 |
| [technology-story-film.yml](../../.github/workflows/technology-story-film.yml) | Render ToonStudio engineering story films | 1 | 45 | 브랜드·엔지니어링 영상 렌더 |

## 7. 전체 106개 워크플로 전수 인벤토리

| # | 워크플로 | 이름 | 트리거 | PR `paths` | Cron (UTC) | 잡 수 | 최대 timeout(분) | 분류 |
| ---: | --- | --- | --- | --- | --- | ---: | ---: | --- |
| 1 | [acon-asset-intake.yml](../../.github/workflows/acon-asset-intake.yml) | ACON authorized asset intake | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `19 21 * * 0` | 1 | 5 | PR 경로 + 주간/일간 예약 |
| 2 | [admin-hardening-regression.yml](../../.github/workflows/admin-hardening-regression.yml) | Admin hardening regression | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 45 | PR 경로 검증 |
| 3 | [api-container-release.yml](../../.github/workflows/api-container-release.yml) | API container release | `workflow_dispatch` | 해당 없음 | - | 1 | 45 | 수동 전용 |
| 4 | [api-runtime-release.yml](../../.github/workflows/api-runtime-release.yml) | API runtime release verification | `push, workflow_dispatch` | 해당 없음 | - | 1 | 35 | 과거 브랜치 push + 수동 |
| 5 | [architecture-boundaries.yml](../../.github/workflows/architecture-boundaries.yml) | Architecture boundaries | `pull_request, push` | 있음(undefined) | - | 1 | - | PR 경로 검증 |
| 6 | [blender-character-pipeline.yml](../../.github/workflows/blender-character-pipeline.yml) | Blender character pipeline | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 2 | 75 | PR 경로 + 과거 브랜치 push |
| 7 | [brand-icon-quality.yml](../../.github/workflows/brand-icon-quality.yml) | Brand icon quality | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `29 20 * * 3` | 1 | 20 | PR 경로 + 주간/일간 예약 |
| 8 | [bundle-visualizer.yml](../../.github/workflows/bundle-visualizer.yml) | Bundle visualizer | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `11 16 * * 1` | 1 | 30 | PR 경로 + 주간/일간 예약 |
| 9 | [character-contact-naturalness.yml](../../.github/workflows/character-contact-naturalness.yml) | Character contact naturalness | `pull_request, push, workflow_call, workflow_dispatch` | 있음(undefined) | - | 2 | 20 | PR 경로 검증 |
| 10 | [character-merge-validation.yml](../../.github/workflows/character-merge-validation.yml) | Character merge validation | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 25 | PR/main + 과거 브랜치 잔존 |
| 11 | [character-shaper-discovery-quality.yml](../../.github/workflows/character-shaper-discovery-quality.yml) | Character Shaper discovery quality | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 25 | PR 경로 검증 |
| 12 | [ci-throughput-validation.yml](../../.github/workflows/ci-throughput-validation.yml) | CI throughput validation | `workflow_dispatch` | 해당 없음 | - | 1 | 25 | 수동 전용 |
| 13 | [ci.yml](../../.github/workflows/ci.yml) | CI | `merge_group, pull_request, push, workflow_dispatch` | 없음(전수) | - | 9 | 110 | 필수 CI 게이트 |
| 14 | [cleanup-merged-branches.yml](../../.github/workflows/cleanup-merged-branches.yml) | Cleanup merged branches and stale Actions runs | `push, schedule, workflow_dispatch` | 해당 없음 | `7 * * * *` | 1 | 8 | 중복 후보(브랜치 정리) |
| 15 | [cleanup-merged-pr-branches.yml](../../.github/workflows/cleanup-merged-pr-branches.yml) | Cleanup merged PR branches | `pull_request, workflow_dispatch` | closed 전용 | - | 1 | 20 | 중복 후보(브랜치 정리) |
| 16 | [cloud-production-deploy.yml](../../.github/workflows/cloud-production-deploy.yml) | Cloud production deploy | `workflow_dispatch` | 해당 없음 | - | 6 | 45 | 수동 전용 |
| 17 | [codeql.yml](../../.github/workflows/codeql.yml) | CodeQL | `pull_request, push, schedule` | 없음(전수) | `17 3 * * 4` | 1 | 180 | 보안 스캔(CodeQL) |
| 18 | [creator-brand-film.yml](../../.github/workflows/creator-brand-film.yml) | Render ToonStudio brand films | `workflow_dispatch` | 해당 없음 | - | 1 | 30 | 수동 전용 |
| 19 | [creator-flagship-quality.yml](../../.github/workflows/creator-flagship-quality.yml) | Creator flagship quality | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 45 | PR 경로 검증 |
| 20 | [creator-hiring-platform.yml](../../.github/workflows/creator-hiring-platform.yml) | Creator hiring platform | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 20 | PR 경로 검증 |
| 21 | [creator-home-quality.yml](../../.github/workflows/creator-home-quality.yml) | Creator homepage quality | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `23 16 * * 3` | 1 | 24 | PR 경로 + 주간/일간 예약 |
| 22 | [creator-portable-quality.yml](../../.github/workflows/creator-portable-quality.yml) | Creator portable drawing quality | `pull_request, push` | 있음(undefined) | - | 1 | 10 | PR 경로 + 과거 브랜치 push |
| 23 | [creator-promotion-validation.yml](../../.github/workflows/creator-promotion-validation.yml) | Creator hub validation | `pull_request, workflow_dispatch` | 있음(undefined) | - | 2 | 25 | PR 경로 검증 |
| 24 | [creator-resources.yml](../../.github/workflows/creator-resources.yml) | Creator resources verification | `pull_request, push, workflow_call, workflow_dispatch` | 있음(undefined) | - | 2 | 45 | PR 경로 검증 |
| 25 | [creator-runtime-quality.yml](../../.github/workflows/creator-runtime-quality.yml) | Creator runtime quality | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 2 | 45 | PR 경로 + 과거 브랜치 push |
| 26 | [desktop-sync-release.yml](../../.github/workflows/desktop-sync-release.yml) | Desktop sync release | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 45 | PR 경로 검증 |
| 27 | [dontdraw-intake.yml](../../.github/workflows/dontdraw-intake.yml) | Dontdraw intake regression | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `23 21 * * 1` | 1 | 5 | PR 경로 + 주간/일간 예약 |
| 28 | [feedback-community-validation.yml](../../.github/workflows/feedback-community-validation.yml) | Feedback community validation | `pull_request, push, workflow_call, workflow_dispatch` | 있음(undefined) | - | 1 | 150 | PR/main + 과거 브랜치 잔존 |
| 29 | [full-test-diagnostic.yml](../../.github/workflows/full-test-diagnostic.yml) | Full Test Diagnostic | `pull_request, workflow_dispatch` | 없음(전수) | - | 1 | 90 | 무필터 PR 실행 |
| 30 | [health-recovery-diagnostics.yml](../../.github/workflows/health-recovery-diagnostics.yml) | Health recovery diagnostics | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 2 | 20 | 비활성 잡(if: false) 포함 |
| 31 | [integration-runtime-connectors.yml](../../.github/workflows/integration-runtime-connectors.yml) | Integration runtime connectors | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 65 | PR 경로 검증 |
| 32 | [kmas-reference-library.yml](../../.github/workflows/kmas-reference-library.yml) | KMAS reference library | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 20 | PR 경로 검증 |
| 33 | [learning-quality.yml](../../.github/workflows/learning-quality.yml) | Learning quality | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 45 | PR 경로 검증 |
| 34 | [legal-policy-recovery.yml](../../.github/workflows/legal-policy-recovery.yml) | Legal policy recovery | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `31 21 * * 3` | 1 | 15 | PR 경로 + 주간/일간 예약 |
| 35 | [lighthouse-ci.yml](../../.github/workflows/lighthouse-ci.yml) | Lighthouse CI | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `13 15 * * 1` | 1 | 30 | PR 경로 + 주간/일간 예약 |
| 36 | [main-full-qa-fast-diagnostics.yml](../../.github/workflows/main-full-qa-fast-diagnostics.yml) | Main full QA · isolated diagnostics | `schedule, workflow_dispatch` | 해당 없음 | `37 17 * * *` | 6 | 100 | 예약+수동 감사 |
| 37 | [main-full-qa-studio.yml](../../.github/workflows/main-full-qa-studio.yml) | Main full QA · Studio exhaustive | `schedule, workflow_dispatch` | 해당 없음 | `17 19 * * *` | 2 | 240 | 예약+수동 감사 |
| 38 | [market-cc0-delivery.yml](../../.github/workflows/market-cc0-delivery.yml) | Market CC0 delivery | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `17 20 * * 1` | 1 | 35 | PR 경로 + 주간/일간 예약 |
| 39 | [market-cc0-handoff.yml](../../.github/workflows/market-cc0-handoff.yml) | Market CC0 handoff | `pull_request, push` | 있음(undefined) | - | 1 | 110 | PR 경로 검증 |
| 40 | [marketplace-authoring.yml](../../.github/workflows/marketplace-authoring.yml) | Marketplace authoring | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 2 | 35 | PR 경로 검증 |
| 41 | [marketplace-integrity.yml](../../.github/workflows/marketplace-integrity.yml) | Marketplace integrity | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 25 | PR 경로 검증 |
| 42 | [multi-cloud-local-dynamic-deploy.yml](../../.github/workflows/multi-cloud-local-dynamic-deploy.yml) | Multi-Cloud & Local Dynamic Matrix Plan (Offline Preview) | `schedule, workflow_dispatch` | 해당 없음 | `13 20 * * 0` | 3 | - | 예약+수동 감사 |
| 43 | [non-studio-experience-audit.yml](../../.github/workflows/non-studio-experience-audit.yml) | Non-studio experience audit | `push, workflow_dispatch` | 해당 없음 | - | 1 | 25 | 과거 브랜치 push + 수동 |
| 44 | [non-studio-experience-quality.yml](../../.github/workflows/non-studio-experience-quality.yml) | Non-studio experience quality | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 45 | PR 경로 검증 |
| 45 | [nonstudio-journey-audit.yml](../../.github/workflows/nonstudio-journey-audit.yml) | Non-studio journey audit | `pull_request, push` | 있음(undefined) | - | 2 | 20 | PR 경로 + 과거 브랜치 push |
| 46 | [nonstudio-merge-regressions.yml](../../.github/workflows/nonstudio-merge-regressions.yml) | Non-studio merge regressions | `pull_request, push` | 있음(undefined) | - | 1 | 20 | PR 경로 + 과거 브랜치 push |
| 47 | [onpod-admin-readonly-audit.yml](../../.github/workflows/onpod-admin-readonly-audit.yml) | Onpod admin read-only audit | `workflow_dispatch` | 해당 없음 | - | 1 | 10 | 수동 전용 |
| 48 | [openssf-scorecard.yml](../../.github/workflows/openssf-scorecard.yml) | OpenSSF Scorecard & Solo Commercial Readiness | `schedule, workflow_dispatch` | 해당 없음 | `23 20 * * 0` | 2 | 15 | 예약+수동 감사 |
| 49 | [openwiki-update.yml](../../.github/workflows/openwiki-update.yml) | OpenWiki update | `schedule, workflow_dispatch` | 해당 없음 | `30 18 * * 0` | 1 | - | 예약+수동 감사 |
| 50 | [production-database-migrations.yml](../../.github/workflows/production-database-migrations.yml) | Approved production database migrations | `workflow_dispatch` | 해당 없음 | - | 1 | 45 | 수동 전용 |
| 51 | [production-readiness.yml](../../.github/workflows/production-readiness.yml) | Production readiness (audit only) | `workflow_dispatch` | 해당 없음 | - | 1 | 30 | 수동 전용 |
| 52 | [public-site-experience.yml](../../.github/workflows/public-site-experience.yml) | Public site experience | `pull_request, workflow_dispatch` | 있음(undefined) | - | 2 | 45 | PR 경로 검증 |
| 53 | [reference-rebuild.yml](../../.github/workflows/reference-rebuild.yml) | Reference-rebuilt scene pack | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `29 21 * * 2` | 1 | 5 | PR 경로 + 주간/일간 예약 |
| 54 | [sitewide-theme-exhaustive-matrix.yml](../../.github/workflows/sitewide-theme-exhaustive-matrix.yml) | Sitewide theme exhaustive matrix | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 180 | PR 경로 검증 |
| 55 | [sonarqube.yml](../../.github/workflows/sonarqube.yml) | SonarQube | `workflow_call` | 해당 없음 | - | 1 | 45 | 고아 workflow_call(비활성) |
| 56 | [studio-2d-asset-quality.yml](../../.github/workflows/studio-2d-asset-quality.yml) | Studio 2D asset quality | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 20 | PR/main + 과거 브랜치 잔존 |
| 57 | [studio-3d-production-visual-audit.yml](../../.github/workflows/studio-3d-production-visual-audit.yml) | Studio 3D production visual audit | `schedule, workflow_dispatch` | 해당 없음 | `17 18 * * *` | 1 | 30 | 예약+수동 감사 |
| 58 | [studio-ai-comic-director-complete.yml](../../.github/workflows/studio-ai-comic-director-complete.yml) | Studio AI comic director complete | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 25 | PR 경로 검증 |
| 59 | [studio-approachable-ux.yml](../../.github/workflows/studio-approachable-ux.yml) | Studio approachable UX | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 20 | PR 경로 검증 |
| 60 | [studio-asset-browser.yml](../../.github/workflows/studio-asset-browser.yml) | Studio asset browser | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `23 15 * * 4` | 2 | 25 | PR 경로 + 주간/일간 예약 |
| 61 | [studio-asset-curation-pilot.yml](../../.github/workflows/studio-asset-curation-pilot.yml) | Studio asset curation pilot | `push, workflow_dispatch` | 해당 없음 | - | 1 | 12 | 과거 브랜치 push + 수동 |
| 62 | [studio-asset-library-regression.yml](../../.github/workflows/studio-asset-library-regression.yml) | Studio asset library regression | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `29 16 * * 4` | 1 | 20 | PR 경로 + 주간/일간 예약 |
| 63 | [studio-asset-upload-integrity.yml](../../.github/workflows/studio-asset-upload-integrity.yml) | Studio asset upload integrity | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `31 20 * * 4` | 1 | 15 | PR 경로 + 주간/일간 예약 |
| 64 | [studio-asset-upload.yml](../../.github/workflows/studio-asset-upload.yml) | Studio 3D Asset Batch Upload | `workflow_dispatch` | 해당 없음 | - | 1 | 60 | 수동 전용 |
| 65 | [studio-brush-filter-stability.yml](../../.github/workflows/studio-brush-filter-stability.yml) | Studio brush and filter stability | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 2 | 100 | PR/main + 과거 브랜치 잔존 |
| 66 | [studio-brush-quality-portfolio.yml](../../.github/workflows/studio-brush-quality-portfolio.yml) | Studio brush quality portfolio | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `17 15 * * 2` | 1 | 45 | PR 경로 + 주간/일간 예약 |
| 67 | [studio-brush-semantic-quality.yml](../../.github/workflows/studio-brush-semantic-quality.yml) | Studio brush semantic quality | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `19 16 * * 2` | 1 | 35 | PR 경로 + 주간/일간 예약 |
| 68 | [studio-cc0-library.yml](../../.github/workflows/studio-cc0-library.yml) | Studio CC0 library regression | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 25 | PR 경로 검증 |
| 69 | [studio-collaboration-sync.yml](../../.github/workflows/studio-collaboration-sync.yml) | Studio collaboration document sync | `pull_request, push, workflow_call, workflow_dispatch` | 있음(undefined) | - | 1 | 35 | PR 경로 검증 |
| 70 | [studio-competitor-replacement-certification.yml](../../.github/workflows/studio-competitor-replacement-certification.yml) | Studio competitor replacement certification | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 45 | PR 경로 검증 |
| 71 | [studio-discovery-contracts.yml](../../.github/workflows/studio-discovery-contracts.yml) | Studio discovery contracts | `workflow_dispatch` | 해당 없음 | - | 1 | 15 | 수동 전용 |
| 72 | [studio-discovery-ux.yml](../../.github/workflows/studio-discovery-ux.yml) | Studio discovery UX | `pull_request, push, workflow_call, workflow_dispatch` | 있음(undefined) | - | 3 | 45 | PR 경로 검증 |
| 73 | [studio-editor-client-runtime.yml](../../.github/workflows/studio-editor-client-runtime.yml) | Studio editor client runtime | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `7 16 * * 0` | 1 | 65 | PR 경로 + 주간/일간 예약 |
| 74 | [studio-environment-pack-validation.yml](../../.github/workflows/studio-environment-pack-validation.yml) | Studio environment pack validation | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 2 | 75 | PR 경로 검증 |
| 75 | [studio-exhaustive-regressions.yml](../../.github/workflows/studio-exhaustive-regressions.yml) | Studio exhaustive regressions | `pull_request, workflow_dispatch` | 있음(undefined) | - | 2 | 15 | PR 경로 검증 |
| 76 | [studio-finishing-quality.yml](../../.github/workflows/studio-finishing-quality.yml) | Studio finishing quality regression | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 2 | 120 | PR/main + 과거 브랜치 잔존 |
| 77 | [studio-five-hour-soak.yml](../../.github/workflows/studio-five-hour-soak.yml) | Studio 5h stability soak | `schedule, workflow_dispatch` | 해당 없음 | `30 17 * * *` | 2 | 35 | 예약+수동 감사 |
| 78 | [studio-gpu-soak-repro.yml](../../.github/workflows/studio-gpu-soak-repro.yml) | Studio GPU soak reproductions | `push, workflow_dispatch` | 해당 없음 | - | 1 | 25 | 과거 브랜치 push + 수동 |
| 79 | [studio-hyper3d-live-acceptance-v2.yml](../../.github/workflows/studio-hyper3d-live-acceptance-v2.yml) | Studio Hyper3D live acceptance v2 | `push, workflow_dispatch` | 해당 없음 | - | 1 | 50 | 과거 브랜치 push + 수동 |
| 80 | [studio-interaction-integrity.yml](../../.github/workflows/studio-interaction-integrity.yml) | Studio interaction integrity | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `31 16 * * 5` | 1 | 15 | PR 경로 + 주간/일간 예약 |
| 81 | [studio-local-document-regressions.yml](../../.github/workflows/studio-local-document-regressions.yml) | Studio local document regressions | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `29 15 * * 5` | 1 | 15 | PR 경로 + 주간/일간 예약 |
| 82 | [studio-manual.yml](../../.github/workflows/studio-manual.yml) | Studio manual | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 25 | PR/main + 과거 브랜치 잔존 |
| 83 | [studio-manuscript-delivery-acceptance.yml](../../.github/workflows/studio-manuscript-delivery-acceptance.yml) | Studio manuscript delivery acceptance | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 20 | PR/main + 과거 브랜치 잔존 |
| 84 | [studio-material-morphology.yml](../../.github/workflows/studio-material-morphology.yml) | Studio material morphology | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 35 | PR 경로 검증 |
| 85 | [studio-menu-viewport.yml](../../.github/workflows/studio-menu-viewport.yml) | Studio menu viewport integrity | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `37 20 * * 5` | 1 | 15 | PR 경로 + 주간/일간 예약 |
| 86 | [studio-mesh-sync-repair.yml](../../.github/workflows/studio-mesh-sync-repair.yml) | Studio collaboration synchronization | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 3 | 110 | PR/main + 과거 브랜치 잔존 |
| 87 | [studio-music-regression.yml](../../.github/workflows/studio-music-regression.yml) | Studio music regression | `pull_request` | 있음(undefined) | - | 1 | 15 | PR 경로 검증 |
| 88 | [studio-premium-assets-quality.yml](../../.github/workflows/studio-premium-assets-quality.yml) | Studio premium asset quality | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `37 21 * * 4` | 1 | 20 | PR 경로 + 주간/일간 예약 |
| 89 | [studio-production-integrity.yml](../../.github/workflows/studio-production-integrity.yml) | Studio production integrity | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 25 | PR/main + 과거 브랜치 잔존 |
| 90 | [studio-promo-video.yml](../../.github/workflows/studio-promo-video.yml) | Studio promo video quality | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 20 | PR 경로 검증 |
| 91 | [studio-raster-snapshot-stability.yml](../../.github/workflows/studio-raster-snapshot-stability.yml) | Studio raster snapshot stability | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `11 15 * * 0` | 1 | 20 | PR 경로 + 주간/일간 예약 |
| 92 | [studio-retouch-gesture-stability.yml](../../.github/workflows/studio-retouch-gesture-stability.yml) | Studio retouch gesture stability | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `23 20 * * 2` | 1 | 20 | PR 경로 + 주간/일간 예약 |
| 93 | [studio-scene3d-next.yml](../../.github/workflows/studio-scene3d-next.yml) | Studio Scene3D next platform | `pull_request, workflow_dispatch` | 있음(undefined) | - | 3 | 120 | PR 경로 검증 |
| 94 | [studio-soak-10h.yml](../../.github/workflows/studio-soak-10h.yml) | Studio 10h Soak QA | `push, workflow_dispatch` | 해당 없음 | - | 2 | 355 | 과거 브랜치 push + 수동 |
| 95 | [studio-vrm-asset-quality.yml](../../.github/workflows/studio-vrm-asset-quality.yml) | Studio VRM asset quality | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 35 | PR 경로 검증 |
| 96 | [studio-wearable-quality-audit.yml](../../.github/workflows/studio-wearable-quality-audit.yml) | Studio wearable quality audit | `push, workflow_dispatch` | 해당 없음 | - | 1 | 40 | 과거 브랜치 push + 수동 |
| 97 | [technology-story-film.yml](../../.github/workflows/technology-story-film.yml) | Render ToonStudio engineering story films | `workflow_dispatch` | 해당 없음 | - | 1 | 45 | 수동 전용 |
| 98 | [toonstudio-feature-reachability.yml](../../.github/workflows/toonstudio-feature-reachability.yml) | ToonStudio feature reachability | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 10 | PR 경로 검증 |
| 99 | [toonstudio-integration.yml](../../.github/workflows/toonstudio-integration.yml) | ToonStudio integration | `pull_request, workflow_dispatch` | 있음(undefined) | - | 2 | 24 | PR 경로 검증 |
| 100 | [toonstudio-qa-stabilization-regressions.yml](../../.github/workflows/toonstudio-qa-stabilization-regressions.yml) | QA stabilization regressions | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | 15 | PR 경로 검증 |
| 101 | [toonstudio-session-goals.yml](../../.github/workflows/toonstudio-session-goals.yml) | ToonStudio session goals | `pull_request, workflow_dispatch` | 있음(undefined) | - | 1 | - | PR 경로 검증 |
| 102 | [webgpu-brush-phase2.yml](../../.github/workflows/webgpu-brush-phase2.yml) | WebGPU brush phase 2 | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 30 | PR 경로 + 과거 브랜치 push |
| 103 | [webgpu-dab-tile-binning-compute.yml](../../.github/workflows/webgpu-dab-tile-binning-compute.yml) | WebGPU dab tile binning compute | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `19 15 * * 3` | 1 | 45 | PR 경로 + 주간/일간 예약 |
| 104 | [webgpu-tile-provider-v2-atlas.yml](../../.github/workflows/webgpu-tile-provider-v2-atlas.yml) | WebGPU tile provider V2 atlas | `pull_request, push, workflow_dispatch` | 있음(undefined) | - | 1 | 30 | PR 경로 + 과거 브랜치 push |
| 105 | [webtoon-assistant-regression.yml](../../.github/workflows/webtoon-assistant-regression.yml) | Webtoon assistant regression | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `41 21 * * 5` | 1 | 15 | PR 경로 + 주간/일간 예약 |
| 106 | [webtoon-ci-failure-summary.yml](../../.github/workflows/webtoon-ci-failure-summary.yml) | CI failure analytics | `pull_request, schedule, workflow_dispatch` | 있음(undefined) | `17 0 * * *` | 1 | 20 | PR 경로 + 주간/일간 예약 |

## 8. 향후 정비 권고 (별도 PR·승인 대상)

- **P0 (즉시 러너 낭비 절감)**: `full-test-diagnostic.yml`의 무필터 `pull_request` 트리거를 라벨 기반 또는 `workflow_dispatch`/야간 스케줄로 전환하고, `cleanup-merged-branches.yml`의 매시간 크론(`7 * * * *`)과 `cleanup-merged-pr-branches.yml` 이중 구성을 단일화합니다.
- **P1 (비활성·고아 정리)**: 호출자 0건인 `sonarqube.yml` 보존 여부를 확정하고, `health-recovery-diagnostics.yml`의 퇴역 Neon `if: false` 잡과 23개 워크플로에 잔존한 2026-09 완료 브랜치 `push.branches` 선언을 정리합니다.
- **P2 (PR 팬아웃 상한 관리)**: `package.json`/`pnpm-lock.yaml` 변경 시 최대 21개 워크플로가 동시 기동하는 구조를 공통 재사용 검증 워크플로로 점진 통합하되, 필수 머지 게이트(`ci.yml`의 `core`·`verify`)와 `codeql.yml` 분석 범위는 유지합니다.
