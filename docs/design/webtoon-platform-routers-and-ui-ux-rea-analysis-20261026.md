# 유사 웹툰·3D 캐릭터·스튜디오 플랫폼 12종 REA 라우터·동선 역공학 및 UI/UX 고도화 설계서

- **작성일**: `2026-10-26`
- **상태**: `current`
- **증거 번들**: [`docs/evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json`](../evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json)
- **클린룸 구현 모듈**:
  - [`apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts`](../../apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts)
  - [`apps/web/src/shared/components/site-contextual-subnav.tsx`](../../apps/web/src/shared/components/site-contextual-subnav.tsx)
  - [`apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx`](../../apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx)
  - [`apps/web/src/domains/creator/character-platform/ui/CharacterPlatformWorkbench.tsx`](../../apps/web/src/domains/creator/character-platform/ui/CharacterPlatformWorkbench.tsx)
  - [`apps/character-lab/src/app/shell/ui-state.ts`](../../apps/character-lab/src/app/shell/ui-state.ts)
  - [`apps/character-lab/src/app/shell/TopBar.tsx`](../../apps/character-lab/src/app/shell/TopBar.tsx)

## 1. 목적 및 배경

글로벌 주요 웹툰·만화 플랫폼 7종(**NAVER WEBTOON**, **KakaoPage**, **WEBTOON Global**, **Tapas**, **Lezhin Comics**, **Pixiv Comic**, **RIDI Webtoon**)에 더해, 3D 캐릭터·아바타·웹툰 소재 스튜디오 경쟁 플랫폼 5종(**VRoid Hub**, **VRoid Studio**, **Clip Studio Paint & Assets**, **BOOTH 3D Models**, **ACON3D**)까지 총 12종의 프로덕션 웹 애플리케이션을 REA(`reverse-engineer-anything`) MCP 도구(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`)로 캡처·역공학하여 라우터 계층, GNB/서브탭/LNB/푸터 동선, 3D 캐릭터 뷰어/포토부스/트래킹 하위 라우트, VRM 라이선스·이용권한 매트릭스, 5단계 가이드 창작 스테퍼, 사후 연관 동선 브리지(Onward Route Bridge)를 도출하고 `apps/web` 및 `apps/character-lab`에 클린룸 내재화하였다.

## 2. REA 역공학 증거 원장 (12개 플랫폼 · 36개 Evidence ID)

| 플랫폼 | 대상 URL | 버전 / 라우터 | `capture_browser_scenario` | `export_web_scripts` | `analyze_javascript_application` / `inspect_analysis_view` | 스크립트 / AST 노드 |
| --- | --- | --- | --- | --- | --- | --- |
| **NAVER WEBTOON** | `https://comic.naver.com/index` | React Router v6 (44 routes) | `ev_559fd63b85ab64546f20cc5e607ed81fa9b9b45406e9da7e37a50fa69408b86e` | `ev_1a784b9c27c37fca96c271d4317fac660a8a1ddff1b61974466913d3a5b31cb7` | `ev_258bfdd5a04aa96486680a11f6d034716d64240b53fd7e127d407c896f81b1c5` | 8 files / 59,852 nodes |
| **KakaoPage** | `https://page.kakao.com/` | Next.js `v2.43.1-pc-ko` (152 routes) | `ev_6f6aa106e603e822d7af0706866296f9d414428009956062faf73d75fdb24722` | `ev_0feeb788c3e88366a84e2f00c28217cff883974368dbf55c660ffe3c101de0bb` | `ev_bdef249b6a4ff2e27ca8061ecf6bd031b293f83daca0ec5f734205aa1f72b173` | 16 files / 47,135 nodes |
| **WEBTOON Global** | `https://www.webtoons.com/en/` | Hybrid SSR + Webpack (28 routes) | `ev_98317ae85066c238eccda4c1f0cfacd4b8e041586595c08f14e43df37be1e16c` | `ev_7e323239eb335e22b01f487423ba8f0f1d07b6a8979f7bb6ef9b20c3ecb7a16a` | `ev_b882700c129e5e6755bcdcf8a0ef825286aa894bca7da6197df43aeb4d4c07cf` | 16 files / 150,354 nodes |
| **Tapas** | `https://tapas.io/` | Next.js `v7.8.2` (55 routes) | `ev_1ec34b24fd3e43cbbb237351c8ede37c1a42de1fa02408b1cbb2418d3a5c14fd` | `ev_cc2a18023e114a0d8450f59e3605bc55c3560eab469ea4dc8f47fc798a1e4100` | `ev_f9364850b854aa96a9810d45eadfb020156b998f7ab742e79f084953c24c05b2` | 35 files / 167,085 nodes |
| **Lezhin Comics** | `https://www.lezhin.com/ko` | Next.js App Router (38 routes) | `ev_64f618fc3e2734111941444d47bfbb5cdd4a7740980a8fa06de08f814991b87f` | `ev_88ccde2265b0819463b65ce41763c2ae26c767664c11c085409de3e169e9bf61` | `ev_81ff8ffef66c3eb7ae1a371da33901dfaf73dc2fe9e0b20b8a9cec80d1be5c80` | 35 files / 137,631 nodes |
| **Pixiv Comic** | `https://comic.pixiv.net/` | Next.js Pages Router (111 routes) | `ev_b4781757598d3aab579b2f4d3b5215ed1b2a31da40911e58cf4dd4f4986ea57a` | `ev_943b64b03822fc79a2b4d8e7fcd89a195bff5929b5be7f26fd129f95a929c967` | `ev_2e78b819f376bdf3a9ab2041042be3d32b284d258b7b0a5541954b0edc6273c6` | 20 files / 142,720 nodes |
| **RIDI Webtoon** | `https://ridibooks.com/webtoon/recommendation` | Cloudflare Turnstile 경계 | `ev_c4dd1056f8442aa4db1b37cfda305018a202f046b82a217232ad7ae25f9f5b32` | `ev_21c888f2b1a769d1362520f8e2ff4c0f8b677e5382f484b25fbbed2b5b66c50f` | `ev_2099d4bc73f672aec5d9b3c252fd83ad7a2e39a04704836c682c3322eeb4a1a4` | 2 files / 1,214 nodes |
| **VRoid Hub** | `https://hub.vroid.com/en` | Next.js Pages Router (65 routes) | `ev_f1ecf030b5868731e6c636e8702158468243d88596307ecacfe9ad9086906f83` | `ev_90e7d9c6f7f335eb4f098a8e855bf4d38111c439f5927620b0e75a875a001e57` | `ev_309f1dae9b7d104a3fb0a85120b6b316b8a75927843da580ce5c23d4d473f0fa` | 5 files / 7,217 nodes |
| **VRoid Studio** | `https://vroid.com/en/studio` | Next.js Pages Router (26 routes) | `ev_0e79c9c80a9d191d54632087ba929765c32165e8b771b2f7f36e8fdbe9eb1228` | `ev_39c57cd108aab1b19c587b4143f7c2c43e27a38d2110e141ceb060f05378e5f8` | `ev_7c4e50edf71d08c8d335702fd41056723e71528178828138abbf0dd18b256643` | 10 files / 24,680 nodes |
| **Clip Studio Paint & Assets** | `https://www.clipstudio.net/kr/` | Cross-Subdomain Studio + Assets (24 routes) | `ev_8f03af4a349b97ad4b4ff25a9e918393457671077cceeb742753eab28335704a` | `ev_16939e377aa98224da3d756888afe41d9a2697eda7f4eadaf69ceb5446d2b185` | `ev_c31892f55e2c633d0c4389762bb42bc136d827b89dad070cb7dc5fd40f906671` | 23 files / 86,203 nodes |
| **BOOTH 3D Models** | `https://booth.pm/ko/browse/3D%20Models` | Multi-Origin Marketplace Router (19 routes) | `ev_e42d625e48b74db8cd12e65ab7876aed389056d762c6922385352ec8045d7895` | `ev_aa51dc986add3d5b81c53a00aaab77b7a23703492a41517ae098c6138818017d` | `ev_061939e46eb35dee70bc518584053adda8b7fe90886977e1483b4e6304a53ed5` | 10 files / 36,633 nodes |
| **ACON3D** | `https://www.acon3d.com/ko` | Cloudflare Bot Verification 경계 | `ev_dacd9f842ffd038a4695af1bcc43ddd8fbdcb4b86170b730fd582d6b0acf996d` | `ev_4b27c4f89c63a75f7295c076b9d1d5f119384376f0abcb004735e1f86be6121d` | `ev_30db3935ab8540e7e350c0082d689a72e2e82ea7ab98a7815c6ce376b5227067` | 1 file / 84 nodes |

## 3. 플랫폼별 핵심 발견 사항 및 내재화 설계

### 3.1 NAVER WEBTOON (`router-394efe0e852153c2d1ea.js`)

- **관찰된 사실 (`observedFacts`)**:
  - 최상위 라우터가 `/proposal/business/*` (7개 IP 비즈니스 하위 경로), `/creators/article/preview`, `/creators/welcome`, `/creators/community`, `/creators/*`, `/navercontest/*`, `/*` 7개 분기로 구성됨.
  - `/creators/*` 내부에서 일반 웹툰 관리(`/creators/manage/title/{new,edit}`, `/creators/manage/article/{new,edit}`)와 숏폼 **Cuts** 관리(`/creators/manage/cuts/title/{new,edit}`, `/creators/manage/cuts/article`)가 완전한 대칭 트리를 이룸.
- **내재화 (`internalization`)**:
  - `CONTEXTUAL_SUBNAV_GROUPS`의 `promo-cuts-hub`에서 `/promo-library` ↔ `/showcase/promo` ↔ `/community/promote` ↔ `/cuts` ↔ `/cuts/studio` ↔ `/brand-film` ↔ `/product-tour`를 대칭형 허브 서브탭으로 통합 연결.

### 3.2 KakaoPage (`_buildManifest.js` 152 routes & `pages/index-2890639f35c99101.js`)

- **관찰된 사실 (`observedFacts`)**:
  - `/menu/[menuUid]/screen/[screenUid]` 동적 라우터와 `depth: 2` 스티키 서브탭 바(`h-57pxr bg-theme-bg-base`)를 통해 GNB 아래에서 하위 화면을 즉시 전환.
  - 시리즈 랜딩을 3가지 뷰 모드(`/landing/series/card/[[...pathParams]]`, `/landing/series/list/[[...pathParams]]`, `/landing/series/poster/[[...pathParams]]`)로 제공하며, 숏폼 홍보 영상을 위한 `/cms/short-vod-viewer-preview` 라우트를 보유.
- **내재화 (`internalization`)**:
  - `SERIES_LANDING_VIEW_MODES` (`"card" | "poster" | "list"`)와 화면 비율 필터(`"all" | "landscape-16-9" | "vertical-9-16" | "square-1-1"`), 키워드 실시간 검색을 `PromoVideoLibraryPage.tsx`에 적용하고 `runSameDocumentViewTransition`으로 전환 애니메이션을 연결.

### 3.3 WEBTOON Global, Tapas, Lezhin Comics, Pixiv Comic

- **관찰된 사실 (`observedFacts`)**:
  - **WEBTOON Global**: 장르별 동적 색상 액센트(`genreCssCode`)와 작품·작가 이원 검색.
  - **Tapas v7.8.2**: `/dev/design-system/bar/{navigation,tab}` 및 `/dev/design-system/common/{badge,ranking}` 디자인 시스템 프리미티브 분리.
  - **Lezhin Comics**: 다크 캔버스 기반 고대비 카드와 직행 프로모션 탭.
  - **Pixiv Comic**: 표지 비주얼 탐색(`/search/cover`), 컬러 테마(`/mypage/color_theme`), 열람 직후 연관 동선 브리지(`/finish_reading/[sku]`).
- **내재화 (`internalization`)**:
  - `SiteContextualSubNav`에 지각 균일 `oklch()` 허브 액센트 토큰과 Tapas 스타일 배지(`SHORT-VOD`, `AI STUDIO`, `UP`, `NEW`, `GALLERY`), Forced-Colors 고대비 안전 경계를 적용.

### 3.4 VRoid Hub, VRoid Studio, Clip Studio Paint & Assets, BOOTH 3D Models, ACON3D

- **관찰된 사실 (`observedFacts`)**:
  - **VRoid Hub (`_buildManifest.js` 65 routes)**: `/characters/[characterId]/models/[modelId]` 하위에 `/edit`, `/embed`, `/photobooth`, `/tracking` 서브 라우트와 `/license`, `/model_assets/[modelAssetId]`, `/apps/[id]/character_models`를 분리하여 3D 뷰어·포토부스·트래킹·VRM 라이선스 조건(아바타 사용, 폭력/선정성 표현, 법인/개인 상업 이용, 개작·재배포 권한)을 즉시 검증할 수 있는 라우터 계층을 구성.
  - **VRoid Studio (`_buildManifest.js` 26 routes)**: `/studio`, `/studio/releases`, `/studio/guidelines`, `/mobile`, `/wear`, `/special/shooting_studio/vko_ar`로 이어지는 프리셋 우선 진입(`Pick items -> Adjust parameters -> Draw hair bundles -> Shooting Studio / Export`) 동선을 제공.
  - **Clip Studio Paint & Assets (`23 JS files / 86,203 AST nodes`)**: 스튜디오 본체(`/kr/`, `/kr/function/`)에서 소재 카탈로그(`assets.clip-studio.com/q/search?type=3dhead%2Cother_3dmodel&order=dl`, `?type=brush&order=dl`) 및 4단계 가이드 튜토리얼(`3D 두상 모델 #11034`, `체형 커스터마이즈 #9936`, `3D 소재 조합 #8416`, `퍼펫 변형 #10496`, `3D에 직접 그리기 #10495`)로 딥링크 브리지를 제공.
  - **BOOTH 3D Models (`10 JS files / 36,633 AST nodes`)**: `/ko/browse/3D%20Models` 하위에 `3D Characters`, `3D Tools & Systems`, `3D Motion & Animation` 분류 칩과 `?tags[]=VRChat`, `?in_stock=true` 필터 및 원클릭 `Reset` 동선을 배치.
  - **ACON3D**: 헤드리스 브라우저 접근 시 Cloudflare 보안 검증(`Performing security verification`, Ray ID `a50910fcaabbba04`)이 관찰되어 REA 인식론 규율에 따라 `bounded-by-bot-challenge`로 정직하게 기록.
- **내재화 (`internalization`)**:
  - `CONTEXTUAL_SUBNAV_GROUPS`에 미완성이던 `studio-hub`(`/studio`, `/character-shaper`, `/studio/assets/characters/new`, `/character-lab`)와 `market-hub`(`/marketplace`, `/assets`, `/library`, `/brushes`)를 완성하여 사이트 전역 서브탭 라우팅을 일원화.
  - `VRM_CHARACTER_SUB_ROUTES`(`overview`, `edit`, `photobooth`, `tracking`, `embed`, `license`), `VrmUsageConditionMatrix` 및 `summarizeVrmUsageMatrix`, `CREATOR_GUIDED_WORKFLOW_STAGES`(5단계 가이드 창작 스테퍼), `resolveCreatorPostActionBridgeRoutes`(창작 단계 완료 후 컷츠·소재실·홍보 영상실 연관 동선 브리지)를 `webtoon-platform-router-ux-model.ts`와 `CharacterPlatformWorkbench.tsx`, `apps/character-lab` 상단 워크플로 바 및 URL 쿼리 라우터 동기화에 내재화.
