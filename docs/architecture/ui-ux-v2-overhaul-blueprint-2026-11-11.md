# ToonStudio 전수 UI/UX 고도화 시안 및 통합 개편 설계서 (v2 Blueprint)

- 문서 상태: **current + migration** (기준일: `2026-11-11` — **데스크톱 16대 전수 화면군 `시안 A ~ 시안 P` + 모바일 전수 화면군 `모바일 시안 M1 ~ M4` 100% 코드·단위 테스트·자동 품질 게이트 반영 완료**, 기존 북마크·외부 공유 URL 호환을 위한 레거시 별칭 경로는 `legacy exception`으로 100% 무손실 보존)
- 시각 시안 아틀라스 및 아트보드 번들: [Starlight Atelier v2.6 디자인 시안 패키지](../design/starlight-atelier-v2-mockups-2026-11-11/README.md) · [인터랙티브 HTML 시안 갤러리](../design/starlight-atelier-v2-mockups-2026-11-11/starlight-atelier-interactive-gallery.html) · [정밀 토큰 원장](../design/starlight-atelier-v2-mockups-2026-11-11/starlight-atelier-design-tokens.json)
- 상위 정본: 제품 범위와 원칙은 [PRODUCT.md](../../PRODUCT.md), 시각·토큰·레이아웃 계약은 [DESIGN.md](../../DESIGN.md), 아키텍처 경계는 [ARCHITECTURE.md](../../ARCHITECTURE.md), 품질 게이트 정책은 [quality-gates-policy.md](../operations/quality-gates-policy.md)를 따른다.

## 1. 개편 배경 및 모노레포 전수 감사 요약

모노레포 산하 **7개 애플리케이션(`web`, `api`, `admin-web`, `brush-lab`, `character-lab`, `mobile`, `desktop-sync`), 웹 라우트 24개 그룹(총 376개 경로·패턴·별칭), 스튜디오 문서 작업공간 13종, 에디터 메인 메뉴 18개 그룹, 3D 하이브리드 DCC 6대 전문 모드, 운영자 콘솔 16개 탭, 데스크톱 루프백 동기화 충돌 콘솔, 모바일 네이티브 런처/오프라인 셸**을 전수 대조 감사하여 Wave 1 ~ Wave 7에 걸쳐 코드와 자동 품질 게이트로 완비했다.

1. **진입 관문 중복 및 초기 세션 대기 병목 해소**: `/studio` 상단 1초 포맷 스타터 Bento + 최근 작업 오프라인 안전 배지를 배치하고, 백엔드 콜드스타트 시에도 3초 내(`INITIAL_SESSION_READY_DEADLINE_MS = 3_000`) 게스트·로컬 화면이 즉시 열리도록 비차단 세션을 적용했다.
2. **에디터 상단 크롬 및 모바일 한손 조작 고도화**: 에디터 상단에 `콘티·3D·작화·식자·검수` 5단계 제작 공정 1클릭 스냅 피일 바(`44px` 모바일 터치 보장)를 결합하고, 모바일 에디터 하단 6슬롯 Thumb-Arc 독·왼손/오른손 전환(`mobileControlSide`)·선택 문맥 빠른 작업 바를 정렬했다.
3. **페이지 단절 없는 제작·리서치·소재·아틀라스 동선**: 3D 배경(`/studio/bg3d`) 접이식 에셋 쉘프 및 6대 DCC 전문 모드 바, 에셋 허브 보조 도구 스위트, 오픈데이터 14개 기관 목적별 6종 필터, 마켓 목록 카드·상세의 인라인 `Rights BOM 자동 보존` 배지, 작품 상세 `이 연출 템플릿으로 3컷 시작` 창작 브리지, 12종 기술 아틀라스 좌측 고정 목차(`xl:sticky`) + 모바일 접이식 목차를 모두 구현했다.
4. **독립 서브 앱 및 품질 게이트 현실화**: `apps/mobile/shell` 회전 스피너를 전면 제거하고 실루엣 스켈레톤·Starlight OKLCH 토큰·로컬 원고 보호 배지로 개편했으며, `apps/admin-web`과 `apps/desktop-sync`를 Starlight OKLCH 및 `>=44px` 터치 타깃으로 통일하고, `verify-ui-ux-v2-contracts.mjs` 및 `run-changed-unit-tests.mjs`를 `validate:architecture`·`pre-push`에 연결했다.

## 2. 데스크톱 16대 전수 화면군 시안 체계 (시안 A ~ 시안 P, 16/16 코드 반영)

| 시안 ID | 대상 화면군 및 포괄 라우트·앱 (전수) | 핵심 UI/UX 개편 설계 및 실제 반영 모듈 (`current`) |
| :--- | :--- | :--- |
| **시안 A** | **통합 크리에이터 홈 & 1초 시작 허브**<br>`/studio`, `/home`, `/create/*`, `/studio/new`, `/studio/import`, `/studio/templates`, `/make` | 최근 작업 이어하기(오프라인 자동저장 안전 배지 + `작품 단계`) + 1초 포맷 Bento 4종<br>→ `StudioProjectLibraryManagementHeader.tsx`, `StudioProjectLibraryFastStartStrip.tsx` |
| **시안 B** | **단일 44px 바 2D 웹툰 에디터**<br>`/studio/p/:id/d/:docId`, `/studio/draft/:draftId`, `/studio/canvas`, `/studio/comic`, `/canvas` | 5단계 제작 공정 스위처(`콘티 · 3D·배경 · 작화·채색 · 식자 · 검수·출고`) + `고급 도구 펼치기 (도구 막대)`<br>→ `StudioDocumentStagePillBar.tsx`, `StudioDocumentWindowHub.tsx`, `studio-ui-density.ts` |
| **시안 C** | **통합 3D 세트·캐릭터·선화 스튜디오**<br>`/studio/bg3d`, `/studio/poser`, `/shaper`, `/studio/lift3d`, `/studio/character-convert`, `apps/character-lab` | 하단 접이식 3D 에셋 쉘프(`공간 프리셋 · 가구/소품 · 캐릭터/포즈 · 조명/선화`) 및 `character-lab` 5단계 가이드 스텝퍼<br>→ `StudioBg3dAssetShelf.tsx`, `StudioBg3dProfessionalWorkspace.tsx`, `apps/character-lab/src/app/shell/TopBar.tsx` |
| **시안 D** | **모바일 한손 에디터 & 원스톱 출고 프리플라이트**<br>`apps/mobile/shell/*`, 모바일 에디터 독, `/studio/publish`, `/studio/p/:id/export`, `/studio/review` | 6슬롯 Thumb-Arc 한손 독 + 출고 요약 내 웹툰 규격 슬라이스·Rights BOM 출처 자동 점검 행<br>→ `StudioMobileEditingDock.tsx`, `StudioExportOutputSummary.tsx`, `apps/mobile/shell/*` |
| **시안 E** | **공개 정문 & 탐색(Spectrum) 슈퍼 허브**<br>`/`, `/discover`, `/explore`, `/search`, `/recommend`, `/ranking`, `/calendar`, `/title/:slug`, `/cuts/*` | `/discover` 스펙트럼 패싯 바 + 작품 상세 `"어디서 봐"` 비교 카드 및 `이 연출 템플릿으로 3컷 시작`·`2.5D 공간 리더` 브리지<br>→ `DiscoverFacetTabStrip.tsx`, `DiscoverHubPage.tsx`, `TitleDetailCreationBridgeCard.tsx`, `TitleDetailPage.tsx` |
| **시안 F** | **통합 프로젝트 워크스페이스 & 팀 프로덕션 칸반**<br>`/studio/p/:projectId/*`, `/production`, `/production/projects/:projectId/*`, `/share/version/:token`, `/team/*` | 개인 프로젝트 셸 ↔ 팀 프로덕션 5열 공정 칸반·공정 인계(`handoff`)·권리 BOM 원장 직행 브리지 및 ShotGrid/Kitsu DAG 밸런서<br>→ `StudioProjectTeamKanbanBridge.tsx`, `StudioProjectShellPage.tsx`, `ProductionHubPage.tsx` |
| **시안 G** | **소재 마켓(인라인 Fit & Rights BOM) · 수익 · 지갑**<br>`/market/*`, `/asset-points`, `/creator/revenue`, `/memberships`, `/pricing`, `/studio/growth*` | 마켓 목록 카드 및 상세 상단에 `Rights BOM 자동 보존` 녹색 배지 + `44px` `원고 위 시험 (Fit Lab)` + `Studio 에셋 허브 열기` 통합<br>→ `MarketResourceCard.tsx`, `MarketResourceDetailPage.tsx` |
| **시안 H** | **28개 기관 통합 레퍼런스 핀보드 & 실습형 배우기**<br>`/research`, `/research/open-data/*`(14개 기관), `/references`, `/story-lab`, `/learn/*`, `/studio/manual*`, `/help` | 공개 데이터 창작실 목적별 6종 필터(`전체 · 역사/고증 · 배경/3D · 복식/과학 · 어휘/음악 · 가입없음 즉시`) + 키워드 즉시 검색<br>→ `OpenDataPurposeFilterBar.tsx`, `OpenDataLabPage.tsx` |
| **시안 I** | **창작 커뮤니티 · 쇼케이스 · 구인 · 캐릭터챗**<br>`/showcase/*`, `/challenges`, `/community/*`, `/pencafe/:name`, `/collaborate/*`, `/newsletter*`, `/character-chat*` | 쇼케이스 상단 창작 소셜 4탭(`작품 갤러리 · 팬카페/리뷰 · 작화 타임랩스 · 팀원 구인`) + 공식 스토리바이블 캐릭터 토크 직행 바<br>→ `publishing/ShowcaseSocialHubBar.tsx`, `ShowcasePage.tsx` |
| **시안 J** | **전문 크리에이터 보조 도구 스위트 (브러시·오디오·AI)**<br>`/brush-lab`, `apps/brush-lab`, `/music`, `/motion-webtoon`, `/studio/generate`, `/studio/ai-*`, `/studio/engines`, `/studio/jobs` | 에셋 허브 전문 보조 도구 스위트 바(`브러시 랩 V6 · 사운드/BGM · 모션 웹툰 · 비파괴 초안 AI · 엔진/작업 큐`) 및 `brush-lab` 4단계 워크플로 바<br>→ `StudioSpecialistSuiteBar.tsx`, `StudioAssetHubPage.tsx`, `apps/brush-lab/src/app/shell/BrushLabApp.tsx` |
| **시안 K** | **통합 내 공간 · AI 키 볼트 · ⌘K 전체 디렉터리**<br>`/my`, `/me`, `/library`, `/messages*`, `/notifications`, `/settings/*`, `/sitemap`, `/fortune/*`, `/play`, `/now` | `/my` 개인 정본 허브 내 통합 API 키 볼트·원고 복구 금고·전체 사이트맵 및 쉬어가기 코너(`창작 운세 · 미니 놀이터 · 지금 영감`) 분리<br>→ `MySpaceVaultAndRestBar.tsx`, `MySpaceHubPage.tsx` |
| **시안 L** | **운영자 Admin 콘솔 & 가상 스튜디오 · Labs**<br>`/admin/*`(16개 경로), `apps/admin-web`, `/studio/space`, `/studio/immersive`, `/studio/branching-cuttoon`, `/ir*`, `/status` | 웹 Admin 도메인 그룹 아코디언 + `Edge Gate 보호` 배지, 독립 `admin-web` Starlight OKLCH 토큰·44px 터치 타깃·`Edge Gate 보호` 배지 정렬<br>→ `AdminShell.tsx`, `apps/admin-web/src/app/shell/AdminApp.tsx`, `apps/admin-web/src/app/styles/admin.css` |
| **시안 M** | **인증 · 온보딩 · 복구 금고 · 404/오프라인/폴백**<br>`/auth/:action`, `/onboarding/*`, `/studio/recovery`, `/studio/trash`, `*`(`NotFoundPage`), `apps/mobile/shell/offline.html` | 3초 비차단 게스트 세션(`auth-session.tsx`), 404 작품 검색 복구 허브(`NotFoundPage.tsx`), 모바일 오프라인 무스피너 스켈레톤·원고 보호 배지<br>→ `auth-session.tsx`, `NotFoundPage.tsx`, `apps/mobile/shell/offline.html` |
| **시안 N** | **몰입형 웹툰 세로·공간 뷰어 · 큐레이션 서가 · 제품 투어**<br>`/title/:slug/episodes`, `/title/:slug/read/:episode`, `/read/spatial`, `/lists*`, `/product-tour`, `/brand-film` | 다크/OLED/세피아/종이 톤 뷰어 + 하단 `2.5D 공간 리더 체험 · 이 감성으로 3컷 창작 · 인터랙티브 제품 투어` 44px 몰입 전환 바<br>→ `TitleReaderImmersiveCreationBar.tsx`, `TitleReaderPage.tsx` |
| **시안 O** | **3D 하이브리드 DCC 6대 전문 모드 · 컴패니언 · `desktop-sync`**<br>`/studio/3d/dcc/*`(6종), `/studio/color`, `/studio/storyworld`, `/studio/companion/:surface`, `apps/desktop-sync` | 3D 쉘프 내 6대 전문 DCC 모드(`build · model · sculpt · material · cad · shot`) + 컴패니언 + 스토리월드 바 및 `desktop-sync` OKLCH·44px 충돌 해결 콘솔<br>→ `StudioBg3dAssetShelf.tsx`, `apps/desktop-sync/src/conflict-server.ts` |
| **시안 P** | **엔지니어링 기술 아틀라스(12종) · 외부 발행 · 후원·신뢰 센터**<br>`/about/technology/*`(12종), `/publish`, `/creator-support`, `/accessibility`, `/copyright`, `/privacy`, `/terms` | 12종 기술 아틀라스 좌측 고정 목차(`xl:sticky`) + 모바일 접이식 목차 및 `/publish`↔`/studio/publish`·기술 아틀라스·신뢰 허브 교차 브리지<br>→ `EngineeringStoryUi.tsx`, `PublishSurfaceCrossBridge.tsx`, `PublishCenterPage.tsx` |

## 3. 모바일 전수 화면군 시안 체계 (모바일 시안 M1 ~ M4, `<768px` 전수 반영)

모바일 웹 뷰포트(`<768px`)와 네이티브 래퍼(`apps/mobile`) 전 구간을 4대 모바일 전용 시안 보드로 정의하고 코드 계약을 일치시켰다.

| 모바일 시안 ID | 포괄 모바일 화면군 | 모바일 전용 UI/UX 핵심 구현 (`current`) |
| :--- | :--- | :--- |
| **모바일 시안 M1** | **모바일 전역 하단 독 · 1초 크리에이터 로비 · 공정 칸반 · 네이티브 오프라인 스켈레톤 셸** | • 전역 모바일 하단 4~5탭 내비게이션(`site-header-mobile-nav.tsx`, `min-h-[3.75rem]`, `safe-area-inset-bottom` 반영)<br>• `/studio` 모바일 2×2 포맷 Bento + 오프라인 안전 배지(`StudioProjectLibraryFastStartStrip.tsx`)<br>• 프로젝트 셸 5열 공정 칸반·인계 44px 브리지(`StudioProjectTeamKanbanBridge.tsx`)<br>• `apps/mobile/shell/{index,offline}.html` + `mobile.css`: 회전 스피너 전면 제거, 실루엣 스켈레톤 쉬머(`data-mobile-skeleton`), 로컬 원고 보호 배지, `48px` 버튼, Starlight OKLCH 적용 |
| **모바일 시안 M2** | **모바일 한손 엄지 2D 에디터(Thumb-Arc) · 3D 스냅 시트 · 모바일 출고 프리플라이트** | • 상단 5단계 공정 가로 스냅 피일 바(`StudioDocumentStagePillBar.tsx`, `snap-x max-sm:min-h-11`)<br>• 모바일 에디터 하단 6슬롯 고정 엄지 독(`펜 · 지우개 · 색상 · 되돌리기 · 다시 · 작업 메뉴`), 선택 문맥 빠른 작업 바, 브러시 compact 스냅 시트, 왼손/오른손 슬롯 전환(`mobileControlSide`, `StudioMobileEditingDock.tsx`)<br>• 모바일 3D 작업공간 `peek(112px)/half/full` 스냅 바텀시트 및 가로 터치 2열 배치(`studio-bg3d-mobile-workspace.css`)<br>• 출고 프리플라이트 슬라이스 적합성 + Rights BOM 점검 요약(`StudioExportOutputSummary.tsx`) |
| **모바일 시안 M3** | **모바일 스펙트럼 탐색 · 작품 상세 · 몰입형 세로/2.5D 공간 리더** | • `/discover` 상단 가로 스크롤 패싯 스트립 + `이 감성으로 3컷 창작` 44px 버튼(`DiscoverFacetTabStrip.tsx`)<br>• `/title/:slug` 모바일 1열 스택 `"어디서 볼 수 있나요"` 가격 라우터 + `이 연출 템플릿으로 3컷 시작`·`2.5D 공간 리더`·`캐릭터와 대화하기` 44px 브리지(`TitleDetailCreationBridgeCard.tsx`)<br>• `/title/:slug/read/:ep` 하단 안전 영역(`--site-float-base`) 보존 회차 이동 바 + 톤/폭 44px 칩 + `2.5D 공간 리더` 몰입 바(`TitleReaderPage.tsx`, `TitleReaderImmersiveCreationBar.tsx`) |
| **모바일 시안 M4** | **모바일 소재 마켓 Fit Lab · 공공 오픈데이터 · 내 공간 볼트 · 모바일 Admin/충돌 콘솔 · 아틀라스 목차** | • 마켓 카드 인라인 `Rights BOM 자동 보존` 배지 + `min-h-11`(`44px`) `원고 위 시험 (Fit Lab)` 버튼(`MarketResourceCard.tsx`)<br>• 오픈데이터 창작 목적 6종 44px 필터 칩(`OpenDataPurposeFilterBar.tsx`)<br>• `/my` 역할 필터(`2.75rem`) + 통합 API 키 볼트·원고 복구 금고·쉬어가기 1열 반응형 카드(`MySpaceVaultAndRestBar.tsx`)<br>• 기술 아틀라스 모바일 전용 접이식 12종 목차 드로어(`engineering-atlas-mobile-toc`, `EngineeringStoryUi.tsx`)<br>• 모바일 Admin 도메인 아코디언 드로어(`AdminShell.tsx`), `admin-web` 44px 터치 보정, `desktop-sync` `@media(max-width:760px)` 1열 충돌 비교 카드(`conflict-server.ts`) |

## 4. 모노레포 24개 라우트 그룹 · 7개 앱 전수 무누락 검증 매트릭스

| 구분 | 소스 파일 / 앱 경로 | 등록 경로·화면 수 | 매핑 시안 (데스크톱 / 모바일) | 코드 반영 및 호환 상태 |
| :--- | :--- | :---: | :--- | :--- |
| 웹 라우트 01 | `account.routes.tsx` | 15 | 시안 G · K · M / M1 · M4 | 100% 보존 (`/my` 볼트·복구·쉬어가기 + 3초 비차단 세션 반영) |
| 웹 라우트 02 | `admin.routes.tsx` + `admin-route-manifest.ts` | 17 | 시안 L / M4 | 16개 운영 탭 + 도메인 아코디언 + Edge Gate 배지 반영 |
| 웹 라우트 03 | `catalog.routes.tsx` | 19 | 시안 E · N / M3 | `/discover` 패싯 + `/title/:slug` 창작 브리지 + 리더 공간 뷰어 바 반영 |
| 웹 라우트 04 | `character-chat.routes.tsx` | 2 | 시안 I / M3 | 쇼케이스 및 작품 상세 내 스토리바이블 캐릭터 토크 유입 연결 |
| 웹 라우트 05 | `community.routes.tsx` | 24 | 시안 I / M4 | 쇼케이스 4탭 소셜 허브 바 연결 + 24개 경로 전수 보존 |
| 웹 라우트 06 | `creator-resources.routes.tsx` | 52 | 시안 H · P / M4 | 14개 오픈데이터 목적별 6종 필터 반영 + 전체 리서치 보드 보존 |
| 웹 라우트 07 | `creator-showcase-routes.tsx` | 12 | 시안 A · I / M1 | `/create/*` 및 `/showcase/*` 소셜 허브 바 반영 |
| 웹 라우트 08 | `creator.routes.tsx` + `studio-route-registry.ts` | 65 | 시안 A · B · C · F · J · O / M1 · M2 | 5단계 스냅 공정 바 · 3D 쉘프/6모드 DCC · 팀 칸반 브리지 · 보조 도구 스위트 반영 |
| 웹 라우트 09 | `cuts.routes.tsx` | 3 | 시안 E / M3 | `/discover` 패싯 및 작품 상세 내 `/cuts` 직행 반영 |
| 웹 라우트 10 | `engagement.routes.tsx` | 3 | 시안 K · M · N / M3 · M4 | `/lists/:slug`, `/notifications`, `/onboarding/taste` 보존 |
| 웹 라우트 11 | `experience.routes.tsx` | 10 | 시안 K / M4 | `/my` 쉬어가기 코너(`/fortune`, `/play`, `/now`) 직행 반영 |
| 웹 라우트 12 | `integrations.routes.tsx` | 5 | 시안 K · P / M2 · M4 | `/publish` 교차 브리지 + `/my` API 키 볼트 직행 반영 |
| 웹 라우트 13 | `labs.routes.tsx` | 1 | 시안 L / M4 | `/studio/branching-cuttoon` LABS 분리 |
| 웹 라우트 14 | `legacy.routes.tsx` | 7 | 시안 B · G · K · N · P | `/canvas`, `/marketplace`, `/more`, `/new`, `/principles`, `/story`, `/tour` 보존 |
| 웹 라우트 15 | `legal.routes.tsx` | 33 | 시안 H · L · P / M4 | 12종 `/about/technology/*` 좌측 고정·모바일 접이식 목차 + 신뢰 브리지 반영 |
| 웹 라우트 16 | `market.routes.tsx` | 14 | 시안 G / M4 | 마켓 카드·상세 모두 `Rights BOM 자동 보존` 배지 + 44px Fit Lab 연결 반영 |
| 웹 라우트 17 | `marketing.routes.tsx` | 15 | 시안 A · G · L · N / M3 | 리더 내 `/product-tour` 브리지 + `/home`, `/hub`, `/brand-film`, `/ir/*` 보존 |
| 웹 라우트 18 | `monetization.routes.tsx` | 4 | 시안 G / M4 | 작가 수익·멤버십·얼리액세스 4종 전수 포함 |
| 웹 라우트 19 | `newsletter.routes.tsx` | 2 | 시안 I / M4 | `/newsletter`, `/newsletter/compose` 포함 |
| 웹 라우트 20 | `not-found.route.tsx` + `route-fallback.tsx` | 2+ | 시안 M / M1 | `*` 404 작품 검색 복구 허브 + 경로별 실루엣 스켈레톤 폴백 포함 |
| 웹 라우트 21 | `production.routes.tsx` | 30 | 시안 F / M1 | 개인 프로젝트 셸 ↔ 팀 프로덕션 칸반·인계·권리 원장 브리지 + DAG 밸런서 반영 |
| 웹 라우트 22 | `pwa.routes.tsx` + `reference.routes.tsx` | 3 | 시안 H · K / M1 · M4 | `/install`, `/offline`, `/references` 포함 |
| 독립 앱 01~06 | `admin-web`, `brush-lab`, `character-lab`, `mobile`, `desktop-sync`, `api` | 전수 | 시안 C · D · J · L · M · O / M1 · M2 · M4 | `mobile` 무스피너 스켈레톤·OKLCH, `admin-web` OKLCH·44px·Edge Gate 배지, `desktop-sync` OKLCH·44px 반영 |
