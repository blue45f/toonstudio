# ToonStudio 전수 UI/UX 고도화 시안 및 통합 개편 설계서 (v2 Blueprint)

- 문서 상태: **migration** (기준일: `2026-11-11` — Wave 1~4 핵심 진입·크롬·쉘프·필터·출고·어드민 `current` 코드 반영 완료, 나머지 화면군 점진 전환 `target` 규격 및 `legacy exception` 호환 경로 명시)
- 상위 정본: 제품 범위와 원칙은 [PRODUCT.md](../../PRODUCT.md), 시각·토큰·레이아웃 계약은 [DESIGN.md](../../DESIGN.md), 아키텍처 경계는 [ARCHITECTURE.md](../../ARCHITECTURE.md)를 따른다.

## 1. 개편 배경 및 모노레포 전수 감사 요약

모노레포 산하 **7개 애플리케이션(`web`, `api`, `admin-web`, `brush-lab`, `character-lab`, `mobile`, `desktop-sync`), 웹 라우트 24개 그룹(총 376개 경로·패턴·별칭), 스튜디오 문서 작업공간 13종, 에디터 메인 메뉴 18개 그룹, 3D 하이브리드 DCC 6대 전문 모드, 운영자 콘솔 16개 탭, 데스크톱 루프백 동기화 충돌 콘솔**을 전수 대조 감사한 결과 다음 4가지 핵심 사용성 병목이 확인되었다.

1. **진입 관문 중복(7개 홈·시작 화면 충돌) 및 초기 세션 대기 병목**: `/`(사이트 홈), `/home`(개인 작업 홈), `/hub`(둘러보기), `/create`(시작 시트), `/studio`(크리에이터 로비·내 작업), `/studio/new`(생성 폼), `/studio/p/:projectId/overview`(프로젝트 홈)가 중첩되고, 백엔드 콜드스타트 시 초기 세션 확인이 게스트 화면을 지연시킬 위험이 있었다.
2. **에디터 상단 크롬 과밀 및 공정 전환 탐색 비용**: 에디터 진입 시 다중 창·작업공간 드롭다운 깊숙이 13종 작업공간이 숨어 있어 콘티·3D·작화·식자·검수 5대 핵심 공정을 1클릭으로 오가기 어려웠다.
3. **페이지 단절형 제작·리서치 도구 배치**: 3D 배경(`/studio/bg3d`)에서 프리셋·캐릭터·조명을 찾으려면 외부 마켓·리서치로 이탈해야 했고, 공개 데이터 창작실(`/research/open-data` 14개 기관)에 창작 목적별 즉시 필터가 부재했다.
4. **출고·마켓·어드민 정보 밀도 분산**: 이미지 출고 요약에서 웹툰 규격 슬라이스·Rights BOM 점검 상태를 한눈에 보기 어렵고, 마켓 상세에서 Rights BOM 출처 보존 상태 및 스튜디오 에셋 허브 복귀 동선이 약했으며, Admin 16개 평면 메뉴는 도메인별 접기 제어가 없었다.

## 2. 16대 전수 화면군 UI/UX 디자인 시안 체계 (시안 A ~ 시안 P, 누락 0건)

모노레포 내 **단 한 개의 누락된 라우트·모달·폴백·서브 앱 화면도 없도록** 전체 376개 라우트 패턴과 7개 앱을 **16개 표준 화면군(시안 A ~ 시안 P)**으로 100% 매핑한다. 모든 시안은 [DESIGN.md](../../DESIGN.md)의 양축 표면 체계(축 A 스타라이트 창작 작업대 / 축 B 웜잉크 읽기·문서 표면), OKLCH 의미 토큰, 중첩 카드 금지, `44px`(`min-h-11`) 터치 타깃, 실루엣 스켈레톤 로딩 규칙을 준수한다.

| 시안 ID | 대상 화면군 및 포괄 라우트·앱 (전수) | 핵심 UI/UX 개편 설계 요지 | 구현 상태 (`2026-11-11`) |
| :--- | :--- | :--- | :--- |
| **시안 A** | **통합 크리에이터 홈 & 1초 시작 허브**<br>`/studio`, `/home`, `/create`, `/create/:id`, `/create/series/:id`, `/create/challenges`, `/create/promo`, `/studio/new`, `/studio/import`, `/studio/templates`, `/make` | 상단 **[최근 작업 빠른 이어하기]**(오프라인 자동저장/정식 저장 안전 배지 + `작품 단계`·`최근 작업 열기` 직행) 및 **[1초 포맷 빠른 시작 Bento 4종]**(세로 웹툰·4컷 만화·3D 배경/캐릭터·PSD/CLIP 원고 변환) 전면 배치 | **current 반영 완료**<br>(`StudioProjectLibraryManagementHeader.tsx`, `StudioProjectLibraryFastStartStrip.tsx`) |
| **시안 B** | **단일 44px 바 2D 웹툰 에디터**<br>`/studio/p/:id/d/:docId`, `/studio/draft/:draftId`, `/studio/canvas`, `/studio/comic`, `/studio/compose/:sessionId`, `/canvas` | 상단 크롬에 **5단계 제작 공정 스위처(`1. 콘티 · 2. 3D·배경 · 3. 작화·채색 · 4. 식자 · 5. 검수·출고`)** 1클릭 피일 바 결합 및 18개 메뉴의 7대 표준 역할군 수렴 | **current 핵심 반영**<br>(`StudioDocumentStagePillBar.tsx`, `StudioDocumentWindowHub.tsx`) |
| **시안 C** | **통합 3D 세트·캐릭터·선화 스튜디오**<br>`/studio/bg3d`, `/studio/poser`, `/shaper`, `/studio/lift3d`, `/studio/character-convert`, `/studio/assets/3d`, `/studio/assets/characters`, `/studio/assets/characters/new`, `apps/character-lab` | Blender 4.x UX 차용: 상단 프리셋(`장면·캐릭터·출력·집중`) + 하단 접이식 **3D 에셋 쉘프(`공간 프리셋 · 가구/소품 · 캐릭터/포즈 · 조명/선화`)** 원클릭 호출 | **current 핵심 반영**<br>(`StudioBg3dAssetShelf.tsx`, `StudioBg3dProfessionalWorkspace.tsx`) |
| **시안 D** | **모바일 한손 에디터 & 원스톱 출고 프리플라이트**<br>`apps/mobile/shell/index.html`, 모바일 웹 에디터, `/studio/publish`, `/studio/p/:id/export`, `/studio/review` | 하단 Thumb-Arc 한손 독 및 출고 요약 내 **웹툰 규격 슬라이스 적합성 + Rights BOM 출처 자동 점검** 실시간 프리플라이트 행 제공 | **current 프리플라이트 반영**<br>(`StudioExportOutputSummary.tsx`) |
| **시안 E** | **공개 정문 & 탐색(Spectrum) 슈퍼 허브**<br>`/`, `/discover`, `/discover/works`, `/explore`, `/search`, `/recommend`, `/ranking`, `/calendar`, `/tags`, `/compare`, `/random`, `/title/:slug`, `/author/:name`, `/authors`, `/news`, `/guide`, `/insights`, `/cuts`, `/cuts/studio`, `/cuts/rewards` | `/discover` 최상단 **스펙트럼 패싯 빠른 이동 바(`탐색 홈 · 장르/필터 · 취향 추천 · 인기 차트 · 요일 연재표 · 컷츠 피드`)** 및 **`이 감성으로 3컷 창작`** 창작 브리지 일체화 | **current 핵심 반영**<br>(`DiscoverFacetTabStrip.tsx`, `DiscoverHubPage.tsx`) |
| **시안 F** | **통합 프로젝트 워크스페이스 & 팀 프로덕션 칸반**<br>`/studio/p/:projectId/*`(`overview`, `story`, `production`, `assets`, `review`, `export`, `settings`, `space`), `/production`, `/production/projects/:projectId/*`(14개 하위 경로), `/production/workspaces/*`, `/production/review/:projectId/:reviewId`, `/production/pinned-review`, `/share/version/:token`, `/team/*` | 개인 프로젝트(8탭)와 팀 프로덕션(14탭)을 6대 표준 공정 섹션으로 정렬하고 회차별 5열 칸반·버전 계보(`ShotGrid` 스타일)·인계(`handoff`) 연결 | **target** (기존 8탭·14탭 URL 100% 보존) |
| **시안 G** | **소재 마켓(인라인 Fit & Rights BOM) · 수익 · 지갑**<br>`/market/*`(14개 경로), `/marketplace`, `/asset-points`, `/account/points`, `/creator/revenue`, `/creator/early-access`, `/creator/membership`, `/memberships`, `/membership`, `/membership/usage`, `/usage`, `/pricing`, `/studio/analytics`, `/studio/growth`, `/studio/growth-ip` | 마켓 리소스 상세 상단에 **`Rights BOM 출처·사용권 자동 보존` 녹색 배지 + `원고 위 시험 (Fit Lab)` + `Studio 에셋 허브 열기`** 44px 빠른 실행 바 통합 | **current 핵심 반영**<br>(`MarketResourceDetailPage.tsx`) |
| **시안 H** | **28개 기관 통합 레퍼런스 핀보드 & 실습형 배우기**<br>`/research`, `/research/open-data/*`(14개 기관), `/research/*`(14개 전문 보드), `/references`, `/creator-hub`, `/creator-hub/references`, `/insights/resources`, `/story-lab`, `/learn/*`, `/learn/education`, `/learn/recipes`, `/studio/manual`, `/studio/manual/:articleId`, `/ecosystem/*`, `/studio/ecosystem/*`, `/help` | 공개 데이터 창작실(`/research/open-data`)에 **창작 목적별 6종 필터(`전체 · 시대/역사/고증 · 배경/3D/장소 · 복식/생물/과학 · 어휘/음악/학교 · 가입/키 없음 즉시`)** 및 키워드 즉시 검색 바 결합 | **current 핵심 반영**<br>(`OpenDataPurposeFilterBar.tsx`, `OpenDataLabPage.tsx`) |
| **시안 I** | **창작 커뮤니티 · 쇼케이스 · 구인 · 캐릭터챗**<br>`/showcase/*`(7개 경로), `/challenges`, `/community/*`(13개 경로), `/pencafe/:name`, `/reviews`, `/collaborate/*`(8개 경로), `/team/recruiting`, `/opportunities`, `/events`, `/events/beta-open`, `/newsletter`, `/newsletter/compose`, `/character-chat`, `/character-chat/manage` | 작품 쇼케이스·챌린지·팬카페·타임랩스·팀원 구인을 4탭 소셜 허브로 정돈하고 공인 스토리바이블 기반 캐릭터 토크 양방향 유입 강화 | **target** |
| **시안 J** | **전문 크리에이터 보조 도구 스위트 (브러시·오디오·AI)**<br>`/brush-lab`, `/studio/brush-lab`, `/studio/brushes`, `/studio/assets/brushes/*`, `/studio/work/:workId/brush-lab`, `/studio/remix/:sourceWorkId/brush-lab`, `apps/brush-lab`, `/music`, `/studio/assets/audio`, `/motion-webtoon`, `/studio/motion-webtoon`, `/studio/generate`, `/studio/ai-lab`, `/studio/ai-runtime`, `/studio/ai-settings`, `/studio/environment`, `/studio/engines`, `/studio/jobs` | 브러시 랩 V6 실시간 시필 패드, 세로 스크롤 연동 오디오·모션 타임라인, 비파괴 초안 전용 Luna AI 및 로컬 엔진 상태 큐 일원화 | **target** |
| **시안 K** | **통합 내 공간 · AI 키 볼트 · ⌘K 전체 디렉터리**<br>`/my`, `/me`, `/u/:userId`, `/creators`, `/library`, `/messages`, `/messages/new`, `/messages/:threadId`, `/notifications`, `/settings`, `/settings/ai`, `/settings/role`, `/settings/notifications`, `/settings/integrations`, `/settings/api-keys`, `/automation`, `/developers`, `/sitemap`, `/more`, `/fortune/*`(9개 경로), `/play`, `/now`, `/install`, `/offline` | `/my`를 유일한 개인 허브 정본으로 수렴하고 AI API 키 볼트·직군 맞춤 설정·전체 사이트맵·휴식 코너(`운세·놀이터·지금`)를 명확히 구획 | **target** |
| **시안 L** | **운영자 Admin 콘솔 & 가상 스튜디오 · Labs**<br>`/admin`, `/admin/*`(16개 경로), `apps/admin-web`, `/studio/space`, `/studio/immersive`, `/studio/anchor-lab`, `/studio/branching-cuttoon`, `/about`, `/about/studio`, `/ir`, `/ir/present`, `/business-plan`, `/promo-library`, `/status` | Admin 사이드바 **도메인 그룹 아코디언 접기/펼치기** 및 상단 **`Edge Gate 보호`** 보안 상태 배지 고정; 실험 표면에 명확한 `LABS` 경계 부여 | **current 핵심 반영**<br>(`AdminShell.tsx`) |
| **시안 M** | **인증 · 취향/직군 온보딩 · 복구 금고 · 404/오프라인/폴백**<br>`/auth/:action`, `/onboarding/taste`, `/onboarding/character`, `/studio/recovery`, `/studio/trash`, `/studio/join`, `*`(`NotFoundPage`), `RouteFallback`, `ErrorBoundary`, `apps/mobile/shell/offline.html` | **3초 비차단 게스트 세션 개방(`INITIAL_SESSION_READY_DEADLINE_MS = 3_000`)**, 패스키/소셜 로그인 시트, 3초 취향·직군 온보딩, OPFS 원고 복구 금고, 오프라인 안전 폴백 통일 | **current 핵심 반영**<br>(`auth-session.tsx`, `UX_FLOW_BACKLOG.md`) |
| **시안 N** | **몰입형 웹툰 세로·공간 뷰어 · 큐레이션 서가 · 제품 투어**<br>`/title/:slug/episodes`, `/title/:slug/read/:episode`, `/read/spatial`, `/lists`, `/lists/:slug`, `/product-tour`, `/brand-film`, `/features`, `/tour` | 자동 숨김 상단 바·장면 BGM 싱크·컷 반응 토글·다음 화 무중단 브리지를 갖춘 세로/공간 리더 및 Remotion 인터랙티브 제품 투어 | **target** |
| **시안 O** | **3D 하이브리드 DCC 6대 전문 모드 · 컴패니언 · `desktop-sync`**<br>`/studio/3d/dcc/build`, `/studio/3d/dcc/model`, `/studio/3d/dcc/sculpt`, `/studio/3d/dcc/material`, `/studio/3d/dcc/cad`, `/studio/3d/dcc/shot`, `/studio/color`, `/studio/storyworld`, `/studio/present`, `/studio/companion/:surface`, `apps/desktop-sync`(`conflict-server.ts`) | 6대 DCC 전문 서브모드 상단 피일 일원화, 아이패드·모바일 보조 컨트롤러(`companion`), 데스크톱 루프백 **양방향 SHA-256 해시·래스터 미리보기 충돌 병합 콘솔** 표준화 | **target** (`desktop-sync` 루프백 서버 가동 중) |
| **시안 P** | **엔지니어링 기술 아틀라스(12종) · 외부 발행 · 후원·신뢰 센터**<br>`/about/technology/*`(12개 경로), `/about/crawler`, `/about/data`, `/about/principles`, `/about/workflow`, `/design`, `/principles`, `/story`, `/publish`, `/publishing`, `/support`, `/support-creators`, `/support-us`, `/creator-support`, `/studio/support`, `/accessibility`, `/business`, `/contact`, `/copyright`, `/feedback`, `/privacy`, `/terms` | 12종 기술 아틀라스 좌측 목차 리더, 스튜디오 내부 출고(`/studio/publish`)와 구분된 외부 채널 피드 발행 센터(`/publish`), 투명한 창작자 후원·권리·접근성 약속 허브 | **target** |

## 3. 모노레포 24개 라우트 그룹 · 7개 앱 전수 무누락 검증 매트릭스

아래 표는 실제 코드베이스의 모든 라우트 정의 파일과 독립 앱 엔트리를 시안 A~P에 1:1 대조한 전수 검증 결과다(누락 경로 **0건**).

| 구분 | 소스 파일 / 앱 경로 | 등록 경로·화면 수 | 매핑 시안 | 무손실 호환 상태 |
| :--- | :--- | :---: | :---: | :--- |
| 웹 라우트 01 | `apps/web/src/app/routes/groups/account.routes.tsx` | 15 | 시안 G · K · M | 100% 보존 (`/my` 정본 + `/auth/:action` 포함) |
| 웹 라우트 02 | `apps/web/src/app/routes/groups/admin.routes.tsx` + `admin-route-manifest.ts` | 17 | 시안 L | 16개 운영 탭 + 아코디언 + Edge Gate 배지 반영 |
| 웹 라우트 03 | `apps/web/src/app/routes/groups/catalog.routes.tsx` | 19 | 시안 E · N | `/discover` 패싯 바 반영 + 리더(`/title/:slug/read/:episode`) 매핑 |
| 웹 라우트 04 | `apps/web/src/app/routes/groups/character-chat.routes.tsx` | 2 | 시안 I | 공식 스토리바이블 범위 캐릭터 토크 보존 |
| 웹 라우트 05 | `apps/web/src/app/routes/groups/community.routes.tsx` | 24 | 시안 I | 커뮤니티·팬카페·협업 구인 24개 경로 전수 포함 |
| 웹 라우트 06 | `apps/web/src/app/routes/groups/creator-resources.routes.tsx` | 52 | 시안 H · P | 14개 오픈데이터 목적별 필터 반영 + 전체 리서치 보드 보존 |
| 웹 라우트 07 | `apps/web/src/app/routes/groups/creator-showcase-routes.tsx` | 12 | 시안 A · I | `/create/*` 및 `/showcase/*` 전수 포함 |
| 웹 라우트 08 | `apps/web/src/app/routes/groups/creator.routes.tsx` + `studio-route-registry.ts` | 65 | 시안 A · B · C · J · O | 스튜디오 13종 작업공간·6종 3D DCC·컴패니언 전수 포함 |
| 웹 라우트 09 | `apps/web/src/app/routes/groups/cuts.routes.tsx` | 3 | 시안 E | `/cuts`, `/cuts/studio`, `/cuts/rewards` 전수 포함 |
| 웹 라우트 10 | `apps/web/src/app/routes/groups/engagement.routes.tsx` | 3 | 시안 K · M · N | `/lists/:slug`, `/notifications`, `/onboarding/taste` 포함 |
| 웹 라우트 11 | `apps/web/src/app/routes/groups/experience.routes.tsx` | 10 | 시안 K | `/fortune/*` 9종 + `/play` 휴식 코너 포함 |
| 웹 라우트 12 | `apps/web/src/app/routes/groups/integrations.routes.tsx` | 5 | 시안 K · P | `/settings/integrations`, `/settings/api-keys`, `/automation`, `/publish`, `/developers` |
| 웹 라우트 13 | `apps/web/src/app/routes/groups/labs.routes.tsx` | 1 | 시안 L | `/studio/branching-cuttoon` LABS 분리 |
| 웹 라우트 14 | `apps/web/src/app/routes/groups/legacy.routes.tsx` | 7 | 시안 B · G · K · N · P | `/canvas`, `/marketplace`, `/more`, `/new`, `/principles`, `/story`, `/tour` 리다이렉트 보존 |
| 웹 라우트 15 | `apps/web/src/app/routes/groups/legal.routes.tsx` | 33 | 시안 H · L · P | `/about/technology/*` 12종 + 후원·약관·개인정보·접근성 전수 포함 |
| 웹 라우트 16 | `apps/web/src/app/routes/groups/market.routes.tsx` | 14 | 시안 G | 인라인 Rights BOM 배지 + Fit Lab + Studio 에셋 허브 연결 반영 |
| 웹 라우트 17 | `apps/web/src/app/routes/groups/marketing.routes.tsx` | 15 | 시안 A · G · L · N | `/home`, `/hub`, `/product-tour`, `/brand-film`, `/ir/*` 전수 포함 |
| 웹 라우트 18 | `apps/web/src/app/routes/groups/monetization.routes.tsx` | 4 | 시안 G | 작가 수익·멤버십·얼리액세스 4종 전수 포함 |
| 웹 라우트 19 | `apps/web/src/app/routes/groups/newsletter.routes.tsx` | 2 | 시안 I | `/newsletter`, `/newsletter/compose` 포함 |
| 웹 라우트 20 | `apps/web/src/app/routes/groups/not-found.route.tsx` + `route-fallback.tsx` | 2+ | 시안 M | `*` 404 복구 허브 + 경로별 실루엣 스켈레톤 폴백 포함 |
| 웹 라우트 21 | `apps/web/src/app/routes/groups/production.routes.tsx` | 30 | 시안 F | 팀 프로덕션 14탭·워크스페이스·공유 리뷰 토큰 전수 포함 |
| 웹 라우트 22 | `apps/web/src/app/routes/groups/pwa.routes.tsx` + `reference.routes.tsx` | 3 | 시안 H · K | `/install`, `/offline`, `/references` 포함 |
| 독립 앱 01~06 | `admin-web`, `brush-lab`, `character-lab`, `mobile`, `desktop-sync`, `api` | 전수 | 시안 C · D · J · L · M · O | 6개 서브 앱·루프백 충돌 해결 UI·오프라인 셸 전수 포함 |

## 4. Wave 1 ~ Wave 4 실제 코드 구현 내역 및 검증 기준 (`2026-11-11`)

아키텍처 래칫(`validate:architecture`), 소스 줄 수 상한(`check:source-file-size` <= 800줄), 스튜디오 초기 번들 그래프(`check:studio-eager-graph`), ESLint 10 + React Compiler(`--max-warnings=0`), 웹·API 전체 타입체크(`pnpm run typecheck`)를 준수하여 아래 4개 웨이브 핵심 표면을 코드와 단위 테스트로 실제 구현했다.

| 웨이브 | 실제 구현 완료 모듈 (`current`) | 동반 단위 테스트 | 핵심 개선 효과 |
| :--- | :--- | :--- | :--- |
| **Wave 1: 비차단 게스트 세션 & 1초 시작 로비** | • `apps/web/src/domains/auth/public/session/auth-session.tsx` (`INITIAL_SESSION_READY_DEADLINE_MS = 3_000`)<br>• `StudioProjectLibraryFastStartStrip.tsx`<br>• `StudioProjectLibraryManagementHeader.tsx`<br>• `UX_FLOW_BACKLOG.md` (P1 해결 기록) | • `auth-session.test.tsx`<br>• `StudioProjectLibraryFastStartStrip.test.tsx` | 백엔드 콜드스타트·네트워크 행 시에도 3초 내 게스트·캐시 화면 즉시 개방; `/studio` 상단 저장 안전 배지·작품 단계·4대 포맷 1초 시작 타일 제공 |
| **Wave 2: 에디터 5단계 공정 바 & 스펙트럼 패싯** | • `StudioDocumentStagePillBar.tsx`<br>• `StudioDocumentWindowHub.tsx`<br>• `DiscoverFacetTabStrip.tsx`<br>• `DiscoverHubPage.tsx` | • `StudioDocumentWindowHub.test.tsx`<br>• `DiscoverFacetTabStrip.test.tsx` | 에디터 상단에서 `콘티→3D·배경→작화·채색→식자→검수·출고` 1클릭 전환; `/discover` 상단 스펙트럼 패싯 및 `3컷 창작` 직행 브리지 제공 |
| **Wave 3: 3D 접이식 에셋 쉘프 & 오픈데이터 목적 필터** | • `StudioBg3dAssetShelf.tsx`<br>• `StudioBg3dProfessionalWorkspace.tsx`<br>• `OpenDataPurposeFilterBar.tsx`<br>• `OpenDataLabPage.tsx` | • `StudioBg3dProfessionalWorkspace.test.tsx`<br>• `OpenDataLabPage.test.tsx` | 3D 작업공간 하단 접이식 에셋 쉘프(공간·가구·캐릭터·조명) 즉시 호출; 14개 공식 오픈데이터 기관의 창작 목적별·키워드별 즉시 필터링 |
| **Wave 4: 출고 프리플라이트 · 마켓 Rights BOM · Admin 아코디언** | • `StudioExportOutputSummary.tsx`<br>• `MarketResourceDetailPage.tsx`<br>• `AdminShell.tsx` | • `StudioExportBasicOptions.summary.test.tsx`<br>• `MarketResourceDetailPage.test.tsx`<br>• `AdminShell.test.tsx` | 다운로드 전 웹툰 슬라이스 규격·Rights BOM 자동 점검 요약 노출; 마켓 상세 Rights BOM 배지·에셋 허브 직행; Admin 도메인 그룹 접기 및 `Edge Gate 보호` 배지 표시 |
