# ToonStudio 품질 게이트 및 현실적 품질 보증 정책 (Quality Gates v2.4)

- 문서 상태: **current** (개편 기준일: `2026-11-11`)
- 상위 정본: 아키텍처 불변식은 [`ARCHITECTURE.md`](../../ARCHITECTURE.md), 디자인·반응형·접근성 규약은 [`DESIGN.md`](../../DESIGN.md), 운영 배포 절차는 [`ai-deployment-quickstart.md`](./ai-deployment-quickstart.md)를 따른다.

## 1. 정책 현실화 배경 및 핵심 원칙

대규모 모노레포(7개 애플리케이션, 웹 24개 라우트 그룹, 멀티엔진 2D·3D 런타임)에서 모든 검증을 단일 훅에 몰아넣으면 두 가지 부작용이 발생한다.

1. **과잉 로컬 블로킹**: 커밋·푸시마다 전체 Vitest 수천 개와 외부 네트워크 의존 감사(`pnpm audit`)를 강제하면 수십 분이 소요되어 오프라인 작업과 빠른 반복이 멈춘다.
2. **검증 사각지대**: 반대로 로컬 훅에서 단위 테스트와 UI/UX 디자인 계약을 완전히 빼버리면, 깨진 컴포넌트 단위 테스트나 모바일 스피너·저대비·미달 터치 타깃·레거시 별칭 링크 회귀가 원격 CI 이후에야 뒤늦게 발견된다.

따라서 ToonStudio는 **검증 비용과 결함 조기 탐지 효율을 현실적으로 맞춘 4단계 계층형 품질 게이트(4-Tier Realistic Quality Gate)**를 정본 정책으로 운영한다.

## 2. 4단계 계층형 품질 게이트 구조

| 계층 | 실행 시점 및 진입점 | 목표 소요 시간 | 필수 강제 항목 | 제외·이관 원칙 (현실화 기준) |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 1: Staged Gate** | `.husky/pre-commit`<br>`pnpm run harness:check` | **5초 이내** | • 에이전트 하네스 무결성(`agent-harness.mjs check`)<br>• `pnpm-lock.yaml` 정합성(`verify-pnpm-lockfile.mjs`)<br>• 스테이징 파일 한정 `eslint --max-warnings=0` + `secretlint`<br>• UI/UX v2.4 계약 게이트(`verify-ui-ux-v2-contracts.mjs`) 및 자체 테스트 | 커밋과 무관한 파일의 타입체크나 전체 테스트로 로컬 체크포인트 커밋을 막지 않는다. 비로그인 GUI/에이전트 셸에서도 실제 사용자 홈(`REAL_HOME`) 기준 Node·pnpm 경로를 자동 탐색한다. |
| **Tier 2: Changed-Scope Push Gate** | `.husky/pre-push`<br>`pnpm run harness:verify` | **25초 이내** | • 정적 검증 4종 병렬 실행(`validate:architecture`, `typecheck`, `lint-changed`, `secretlint`)<br>• **UI/UX v2.4 데스크톱·모바일·서브앱·32대 허브 디자인 계약(`verify-ui-ux-v2-contracts.mjs`)**<br>• **변경 모듈 경량 짝 단위 테스트(`run-changed-unit-tests.mjs`, `--pool=threads`, 상한 10개)** | 의존성 매니페스트(`package.json`, `pnpm-lock.yaml`)가 바뀌지 않은 일반 코드 푸시에서는 네트워크 의존 `audit:security`와 중량 통합 테스트를 Tier 3 CI로 이관해 MCP·IDE 푸시 타임아웃 없이 고속 검증한다. |
| **Tier 3: Full Regression CI Gate** | GitHub Actions (`core`, `verify` 등) | 병렬 샤드 실행 | • 전체 Vitest 샤드 회귀 및 PostgreSQL/Redis 통합 검증<br>• Playwright 전수 시각·접근성(`audit:sitewide-visual-ux`, `forced-colors`, `prefers-contrast`)<br>• 프로덕션 번들·Remotion 청크·스튜디오 워커 예산 검증 | 브라우저 기동, DB 컨테이너, 전체 번들 컴파일은 로컬 훅 대신 클라우드 병렬 러너에서 1회 정확히 지불한다. |
| **Tier 4: Release & Live Origin Gate** | 로컬 워크스테이션 수동 배포 (`deploy:verify` → `deploy:web` → `deploy:status:origin`) | 배포 시 1회 | • 무료 인프라 한도 및 Worker 4종 드라이런(`deploy:verify`)<br>• `main` 클린 트리 · 40자리 SHA 일치 · 중복 배포 원장 차단<br>• 배포 후 서울 `onpod` 원점 `live`/`ready` 200 및 `edgeOriginAuth === "enforced"` 확인 | GitHub Actions에서의 자동 운영 배포는 `release-workflow-policy.mjs`로 영구 차단하며, 로컬 비밀 원문 출력·복사를 엄격히 금지한다. |

## 3. UI/UX v2.4 디자인·모바일·경로 자동 품질 게이트 (`verify-ui-ux-v2-contracts.mjs`)

`DESIGN.md`와 [`ui-ux-v2-overhaul-blueprint-2026-11-11.md`](../architecture/ui-ux-v2-overhaul-blueprint-2026-11-11.md)의 핵심 약속이 문서에만 머물지 않도록 다음 5가지를 코드 레벨에서 상시 검증한다.

1. **전수 시안 동기화**: 데스크톱 16대 화면군(`시안 A` ~ `시안 P`)과 모바일 전수 화면군(`모바일 시안 M1` ~ `모바일 시안 M4`)이 정본 설계서와 누락 없이 일치해야 한다.
2. **7대 서브앱 무스피너 · Starlight OKLCH · 접근성 보장**: `apps/mobile/shell`, `apps/admin-web`, `apps/desktop-sync`, `apps/brush-lab`, `apps/character-lab`을 포함한 모든 독립 셸에서 회전 스피너(`.spinner`) 재도입을 차단하고, Starlight OKLCH 의미 토큰, `prefers-reduced-motion: reduce`, `forced-colors: active`, 최소 `44px`(`2.75rem`) 터치 타깃을 강제한다.
3. **3초 비차단 게스트 진입 수호**: 백엔드 지연·콜드스타트 시에도 3초(`INITIAL_SESSION_READY_DEADLINE_MS <= 3_500`) 안에 게스트·로컬 캐시 화면이 열리는 불변식이 깨지지 않도록 감시한다.
4. **32대 핵심 허브 정본 경로(Canonical Route) 및 44px Tailwind 타깃 강제**: 루트 정문(`ReferenceCreatorDashboard`), 크리에이터 스튜디오(`StudioProjectLibraryManagementHeader`, `StudioProjectLibraryFastStartStrip`, `StudioDocumentWindowHub`, `StudioDocumentStagePillBar`, `StudioBg3dAssetShelf`), 스펙트럼 카탈로그(`DiscoverHubPage`, `DiscoverFacetTabStrip`, `RankingPage`, `ExplorePage`, `ExploreReaDirectoryBar`, `CalendarPage`, `CalendarFilters`), 소재 마켓(`MarketHomePage`, `MarketResourceCard`), 오픈데이터(`OpenDataPurposeFilterBar`), 커뮤니티(`CommunityPage`, `PencafePage`), 캐릭터 토크(`CharacterChatPage`), 공간 리더(`StudioSpatialReaderPage`), 창작 시작점(`CreateStartPage`), 내 공간(`MySpaceVaultAndRestBar`) 등 32대 핵심 화면에서 레거시 리다이렉트 별칭(`/shaper`, `/brush-lab`, `/studio/brush-lab`, `/marketplace`, `/new`)과 44px 미만 Tailwind 최소 높이(`min-h-6` ~ `min-h-10`) 유입을 즉시 차단한다.
5. **27대 핵심 Starlight Atelier 시각·동선 앵커 보존**: 루트 정문 18종 스펙트럼 리본(`rd-v2-spectrum-ribbon`), `/studio` 2열 아틀리에 벤토(`data-studio-atelier-bento`), 단일 44px 에디터 바 및 자동저장 볼트 인디케이터(`data-studio-autosave-dot`), 3D Live Ink 쉘프(`studio-bg3d-bake-to-panel-cta`), 탐색 18종 스펙트럼 리본(`data-discover-spectrum-ribbon`), 출고 Rights BOM 요약, 작품 상세 창작 브리지, 5열 에피소드 칸반 브리지, 마켓 인라인 Rights BOM 배지, 오픈데이터 목적 필터, 기술 아틀라스 12종 좌측 고정/모바일 목차 등 핵심 UI 앵커가 제거되지 않도록 보호한다.

## 4. 코드 구조 및 경고 예산 래칫 운영 원칙

- **파일 크기 래칫 (`check:source-file-size`)**: 모든 신규 파일과 기준선 밖 파일은 **800줄 이하**를 유지한다. 기존 대형 파일(`scripts/source-file-size-baseline.json`)은 줄 수가 늘어나면 즉시 차단하고, 리팩터링으로 줄 수가 줄어들면 `--tighten`으로 상한만 단방향 하향 조정한다.
- **디렉터리 경계 래칫 (`validate:source-layout`)**: 도메인 루트 파일 무분별 증식(`creatorRootFiles` 등 `config/architecture-source-ratchet.json`)을 차단하여 신규 컴포넌트가 적절한 하위 도메인 폴더(`studio-shell/`, `publishing/`, `bg3d/` 등)에 응집되도록 유도한다.
- **엄격한 신규 무경고 원칙**: 레거시 전역 경고 예산(`lintStrictMaxWarnings`)은 상향 금지 래칫으로 묶어 두되, 수정·스테이징되는 모든 파일에는 `eslint --max-warnings=0`과 `@ts-nocheck` 추가 금지를 적용해 코드 수정 시마다 기술 부채가 자연 감소하도록 운영한다.
