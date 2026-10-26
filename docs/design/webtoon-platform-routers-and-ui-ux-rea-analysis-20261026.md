# 글로벌 웹툰·창작·3D 캐릭터·에셋 플랫폼 23종 REA 라우터·동선 역공학 및 전 허브 UI/UX 고도화 설계서

- **작성일**: `2026-10-26`
- **상태**: `current`
- **증거 번들**: [`docs/evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json`](../evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json)
- **클린룸 구현 모듈**:
  - [`apps/web/src/shared/navigation/webtoon-platform-rea-ledger.ts`](../../apps/web/src/shared/navigation/webtoon-platform-rea-ledger.ts)
  - [`apps/web/src/shared/navigation/webtoon-platform-rea-surface-presets.ts`](../../apps/web/src/shared/navigation/webtoon-platform-rea-surface-presets.ts)
  - [`apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts`](../../apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts)
  - [`apps/web/src/shared/components/site-contextual-subnav.tsx`](../../apps/web/src/shared/components/site-contextual-subnav.tsx)
  - [`apps/web/src/domains/catalog/DiscoverHubPage.tsx`](../../apps/web/src/domains/catalog/DiscoverHubPage.tsx)
  - [`apps/web/src/domains/catalog/RankingPage.tsx`](../../apps/web/src/domains/catalog/RankingPage.tsx)
  - [`apps/web/src/domains/catalog/CalendarPage.tsx`](../../apps/web/src/domains/catalog/CalendarPage.tsx)
  - [`apps/web/src/domains/catalog/ExplorePage.tsx`](../../apps/web/src/domains/catalog/ExplorePage.tsx)
  - [`apps/web/src/domains/catalog/LibraryPage.tsx`](../../apps/web/src/domains/catalog/LibraryPage.tsx)
  - [`apps/web/src/domains/market/pages/MarketHomePage.tsx`](../../apps/web/src/domains/market/pages/MarketHomePage.tsx)
  - [`apps/web/src/domains/community/CommunityPage.tsx`](../../apps/web/src/domains/community/CommunityPage.tsx)
  - [`apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx`](../../apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx)
  - [`apps/web/src/domains/cuts/CutsStudioPage.tsx`](../../apps/web/src/domains/cuts/CutsStudioPage.tsx)
  - [`apps/web/src/domains/legal/SitemapPage.tsx`](../../apps/web/src/domains/legal/SitemapPage.tsx)
  - [`apps/web/src/domains/creator/character-platform/ui/CharacterPlatformWorkbench.tsx`](../../apps/web/src/domains/creator/character-platform/ui/CharacterPlatformWorkbench.tsx)
  - [`apps/character-lab/src/app/shell/ui-state.ts`](../../apps/character-lab/src/app/shell/ui-state.ts)
  - [`apps/character-lab/src/app/shell/TopBar.tsx`](../../apps/character-lab/src/app/shell/TopBar.tsx)

## 1. 목적 및 배경

글로벌 주요 웹툰·만화·오픈연재·창작·3D 캐릭터·2D/3D 에셋 플랫폼 23종(**NAVER WEBTOON**, **KakaoPage**, **WEBTOON Global**, **Tapas**, **Lezhin Comics**, **Pixiv Comic**, **RIDI Webtoon**, **Kakao Webtoon**, **Postype**, **Manta**, **CLIP STUDIO**, **ACON3D**, **Manga Plus by SHUEISHA**, **VRoid Hub**, **VRoid Studio**, **BOOTH 3D Models**, **NAVER Best Challenge**, **WEBTOON Global CANVAS**, **Pixiv BOOTH**, **MrBlue Webtoon**, **Bomtoon**, **Sketchfab 3D Models**, **Toomics**)의 프로덕션 웹 애플리케이션을 REA(`reverse-engineer-anything`) MCP 도구(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`, `inspect_analysis_view`)로 일괄 캡처·역공학하여 라우터 계층, GNB/서브탭/LNB/푸터 동선, 뷰 스위처, 3D 캐릭터 뷰어/포토부스/트래킹 하위 라우트, VRM 라이선스·이용권한 매트릭스, 창작 파이프라인, 오픈연재 승격 리그, BM·태그 필터 아키텍처, UI/UX 디자인 토큰을 도출하고 ToonStudio 전 허브 및 `apps/character-lab`에 클린룸 내재화하였다.

## 2. REA 역공학 증거 원장 (23개 플랫폼/서피스 · 70개 Evidence ID)

| 플랫폼 / 서피스 | 대상 URL | 버전 / 라우터 | `capture_browser_scenario` | `export_web_scripts` | `analyze_javascript_application` / `inspect_analysis_view` | 스크립트 / AST 노드 |
| --- | --- | --- | --- | --- | --- | --- |
| **NAVER WEBTOON** | `https://comic.naver.com/index` | React Router v6 (44 routes) | `ev_559fd63b85ab64546f20cc5e607ed81fa9b9b45406e9da7e37a50fa69408b86e` | `ev_1a784b9c27c37fca96c271d4317fac660a8a1ddff1b61974466913d3a5b31cb7` | `ev_258bfdd5a04aa96486680a11f6d034716d64240b53fd7e127d407c896f81b1c5` | 8 files / 59,852 nodes |
| **KakaoPage** | `https://page.kakao.com/` | Next.js `v2.43.1-pc-ko` (152 routes) | `ev_6f6aa106e603e822d7af0706866296f9d414428009956062faf73d75fdb24722` | `ev_0feeb788c3e88366a84e2f00c28217cff883974368dbf55c660ffe3c101de0bb` | `ev_bdef249b6a4ff2e27ca8061ecf6bd031b293f83daca0ec5f734205aa1f72b173` | 16 files / 47,135 nodes |
| **WEBTOON Global** | `https://www.webtoons.com/en/` | Hybrid SSR + Webpack (28 routes) | `ev_98317ae85066c238eccda4c1f0cfacd4b8e041586595c08f14e43df37be1e16c` | `ev_7e323239eb335e22b01f487423ba8f0f1d07b6a8979f7bb6ef9b20c3ecb7a16a` | `ev_b882700c129e5e6755bcdcf8a0ef825286aa894bca7da6197df43aeb4d4c07cf` | 16 files / 150,354 nodes |
| **Tapas** | `https://tapas.io/` | Next.js `v7.8.2` (55 routes) | `ev_1ec34b24fd3e43cbbb237351c8ede37c1a42de1fa02408b1cbb2418d3a5c14fd` | `ev_cc2a18023e114a0d8450f59e3605bc55c3560eab469ea4dc8f47fc798a1e4100` | `ev_f9364850b854aa96a9810d45eadfb020156b998f7ab742e79f084953c24c05b2` | 35 files / 167,085 nodes |
| **Lezhin Comics** | `https://www.lezhin.com/ko` | Next.js App Router (38 routes) | `ev_64f618fc3e2734111941444d47bfbb5cdd4a7740980a8fa06de08f814991b87f` | `ev_88ccde2265b0819463b65ce41763c2ae26c767664c11c085409de3e169e9bf61` | `ev_81ff8ffef66c3eb7ae1a371da33901dfaf73dc2fe9e0b20b8a9cec80d1be5c80` | 35 files / 137,631 nodes |
| **Pixiv Comic** | `https://comic.pixiv.net/` | Next.js Pages Router (111 routes) | `ev_b4781757598d3aab579b2f4d3b5215ed1b2a31da40911e58cf4dd4f4986ea57a` | `ev_943b64b03822fc79a2b4d8e7fcd89a195bff5929b5be7f26fd129f95a929c967` | `ev_2e78b819f376bdf3a9ab2041042be3d32b284d258b7b0a5541954b0edc6273c6` | 20 files / 142,720 nodes |
| **RIDI Webtoon** | `https://ridibooks.com/webtoon/recommendation` | Cloudflare Turnstile 경계 | `ev_c4dd1056f8442aa4db1b37cfda305018a202f046b82a217232ad7ae25f9f5b32` | `ev_21c888f2b1a769d1362520f8e2ff4c0f8b677e5382f484b25fbbed2b5b66c50f` | `ev_2099d4bc73f672aec5d9b3c252fd83ad7a2e39a04704836c682c3322eeb4a1a4` | 2 files / 1,214 nodes |
| **Kakao Webtoon** | `https://webtoon.kakao.com/` | Next.js `v5.12.1` (80 routes) | `ev_c6a1431dc4229fa786363a233867ae53b980a8b1249e7e1a09f8eebbe618728c` | `ev_bb8ae6bf5ab5beae17ed3cacbb31b2d6169b90f02a9879e49cc3b0fb01dd079a` | `ev_80c23cf54c9491d42c4c161fe13e576596300750a16357c9c309a1b5c12c26d5` | 14 files / 73,293 nodes |
| **Postype** | `https://www.postype.com/` | Next.js App Router (32 routes) | `ev_19ccd9e17aeef7d1cc49e76de06b6632d4be2a5f921ba0ea1b7cf5f6b927e833` | `ev_2513ce480ba89cae5d10d18496f51a107371a595aec0d7bc661afbe2009f6ba9` | `ev_b5025b619c348cf7c99cb3f9e7967fd035bfb4ed50faed503aca68cf6de0f79c` | 54 files / 357,650 nodes |
| **Manta** | `https://manta.net/en` | Next.js Pages Router (55 routes) | `ev_1661c6b127c94c6b952cf8a24285c46e972313059781e122578592a3f7ba8735` | `ev_e67622ca1075c3b096e3fe83d4abec8b38793e38325454cebf76c473496624d4` | `ev_8e497bdbd7ab1e304f3d48d5f6bc00b30384ef13c0123bd35c5b7caa24bad2fa` | 24 files / 95,468 nodes |
| **CLIP STUDIO** | `https://www.clipstudio.net/kr/` | Hybrid Web + Asset Hub (24 routes) | `ev_9c7f31b4d9b547b9d1e10a7803e03d389dc030a3a2c0b9d24d74156a822e687f` | `ev_774bf741e3b15aee8ae917ef44dcb68e76228c7f572fe857fc8a7790f8567545` | `ev_d83fbd1f28c39b2a77bbc594354a4bbec7a486d7a83ca611fbd7dd770f1e0701` | 23 files / 86,203 nodes |
| **ACON3D** | `https://www.acon3d.com/ko` | Cloudflare Turnstile 경계 | `ev_4197631fc9cedfbe4b2f7d9e854e61baf25ecdfee5842f08c3ea308a5bac174b` | `ev_8dd35a6f70ff6e2786c21c2eb567698f9ceb4db853cb0dd2bc5208393d0ea3d2` | `ev_e2eb55f9bd5563f090b59d25985920ecf25a04cba5800af7b98dde26eb9e2b7e` | 4 files / 336 nodes |
| **Manga Plus** | `https://mangaplus.shueisha.co.jp/updates` | Vue Router (`app.41982a95.js`, 36 routes) | `ev_8e22c5f6215ef0e8189d1d6f643648272c8a029c8ea99eb580cf6669aafa50a9` | `ev_abb29088cb2dcd559c734d3bc69744fe7ccfce4f152ca5a16432c7024c402cd2` | `ev_0b6aa7c4ab507ae8278742a6616c6ac5ec06ebf1aa7915302f2e1016b4636b82` | 3 files / 202,081 nodes |
| **VRoid Hub** | `https://hub.vroid.com/en` | Next.js Pages Router (65 routes) | `ev_f1ecf030b5868731e6c636e8702158468243d88596307ecacfe9ad9086906f83` | `ev_90e7d9c6f7f335eb4f098a8e855bf4d38111c439f5927620b0e75a875a001e57` | `ev_309f1dae9b7d104a3fb0a85120b6b316b8a75927843da580ce5c23d4d473f0fa` | 5 files / 7,217 nodes |
| **VRoid Studio** | `https://vroid.com/en/studio` | Next.js Pages Router (26 routes) | `ev_0e79c9c80a9d191d54632087ba929765c32165e8b771b2f7f36e8fdbe9eb1228` | `ev_39c57cd108aab1b19c587b4143f7c2c43e27a38d2110e141ceb060f05378e5f8` | `ev_7c4e50edf71d08c8d335702fd41056723e71528178828138abbf0dd18b256643` | 10 files / 24,680 nodes |
| **BOOTH 3D Models** | `https://booth.pm/ko/browse/3D%20Models` | Multi-Origin Marketplace Router (19 routes) | `ev_e42d625e48b74db8cd12e65ab7876aed389056d762c6922385352ec8045d7895` | `ev_aa51dc986add3d5b81c53a00aaab77b7a23703492a41517ae098c6138818017d` | `ev_061939e46eb35dee70bc518584053adda8b7fe90886977e1483b4e6304a53ed5` | 10 files / 36,633 nodes |
| **NAVER Best Challenge** | `https://comic.naver.com/bestChallenge` | React Router v6 (37 routes) | `ev_66013c0d071ebb31cbac9e4692bf44e8c5788772ea8c8c5596648923a45956f1` | `ev_3e3f2546d69526fd42013dc99e67563beb7cc79c270ee88d299131f4d47fde87` | `ev_903bf4d25b5b9c4507059b98d70d3917389ac854d8dbbe6bcce699bc584a6aee` | 9 files / 61,986 nodes |
| **WEBTOON Global CANVAS** | `https://www.webtoons.com/en/canvas` | `challengeHome` + Webpack (12 routes) | `ev_f2b608242098851dc63309d9d7c5af94dbc7bf0395c2de90629f17fe220e4e51` | `ev_e080c59a87eed963bbad65fb7617607dd9c27f6d533f722d57377e9c0a162979` | `ev_27abcc6c1aabd09ac3f6fc10cab8d6ddb8ad729c15c55590342aa0a85ee30f59` | 6 files / 35,300 nodes |
| **Pixiv BOOTH** | `https://booth.pm/ko` | Creator Asset Market + Autosuggest | `ev_4885b79c74bb7e6e13af894f9d2e4ceb8f7d349583617d70cc6697492e3c0195` | `ev_4d8df7c16200249cf4f98ff7ac46b9952e8eef626c6debe17f3b8dfef8e8388c` | `ev_73aad89b609189452b4ba5c1351f903b2506628fb26ae5696ff529d5ccdfcf0a` | 12 files / 42,610 nodes |
| **MrBlue Webtoon** | `https://www.mrblue.com/webtoon` | Virtual Layer + Zzim/Ticket Router | `ev_1798820ae7a425d4704b4198f979a49514ca71c7212d4b469a725d671f793918` | `ev_0e1eb10fcd3556021ebfa626f9956ed87860c4f7bbc5cd7dabd10cea6da5c24d` | `ev_bc6e080bd12ed4600593e21ca700676062016b25c1b8be4a5bf309d219171250` | 23 files / 71,232 nodes |
| **Bomtoon** | `https://www.bomtoon.com/` | Next.js `5WWxOnDBPisKWwWSNIVO6` (125 routes) | `ev_a190688ff032060b7351baa85103f514dbcc0d9e440d501bd17e1296c0e88859` | `ev_e86e9eb3d50b3c4347179cb3fc39de9510bf113a27bb29077c19ed543b79de53` | `ev_2079960ca21702d3b690e7a81f2c6770558d7b1532da2267e2a89b69564d4feb` | 29 files / 145,615 nodes |
| **Sketchfab 3D Models** | `https://sketchfab.com/3d-models` | WebGL 3D Inspector + Collections | `ev_0c1b5badc807214c7520facd40c5a5992e98af7075b08591b97c2270f8dd6da3` | `ev_3bb063dc68ce8733a9fc0a3144705cf31a98ab162d59896be868176eb99d1abb` | `ev_3207d32b972cdfc12a43d62aca2dc4b480141ebff55f3d4eae662c1edb9455c3` | 26 files / 97,764 nodes |
| **Toomics** | `https://www.toomics.com/ko` | `web_v4` + Cross-Device QR Continuation | `ev_d6dd968aa244bc8656ed4382076cfa3a0a04bef39fc9b2390a51301be62f444f` | `ev_47d469e9515ed5280670f6ea7cc17ec5573e1512780e39d0691026a4ff324c25` | `ev_f254846e117cafdd01f6fde5ff0a98d5eb57708a0a190f31ad023cc710835d24` | 15 files / 63,723 nodes |

## 3. 플랫폼별 핵심 발견 사항 및 전 서피스 내재화 설계

### 3.1 NAVER WEBTOON, NAVER Best Challenge, WEBTOON CANVAS, Manta: 창작 6단계 파이프라인 & 오픈연재 승격 리그
- **관찰된 사실 (`observedFacts`)**:
  - **NAVER WEBTOON & Best Challenge** (`router-394efe0e852153c2d1ea.js`): 일반 웹툰(`/creators/manage/title/{new,edit}`)과 숏폼 **Cuts**(`/creators/manage/cuts/title/{new,edit}`) 대칭 트리 및 `/challenge` → `/bestChallenge` → `/webtoon` 3단계 승격 리그, `/proposal/business/{home,entertainment,licensingMerchandising,publishing,game,promotions,contact}` IP 사업화 라우트.
  - **WEBTOON Global CANVAS** (`challengeHome-765622cb46e92f0800ce.js`): `window.__challengeHomeState__` 기반 장르별 Rising/Popular 큐레이션과 `/mycreator`, `/creative/list`, `/preview` 원클릭 창작자 대시보드.
  - **Manta** (`_buildManifest.js`): `/creator/apply` → `/creator/studio` → `/creator/studio/series/new` → `/uot-printcomic-v2` 출판만화 변환 → `/preview/episodes/[episodeId]` 전주기 창작자 라우터.
- **내재화 (`internalization`)**:
  - `DiscoverHubPage.tsx`, `CommunityPage.tsx`, `CutsStudioPage.tsx`, `PromoVideoLibraryPage.tsx`, `StudioPromoPage.tsx`, `PromotionBoardPage.tsx`에 6단계 창작-홍보 파이프라인과 `도전만화 Challenge → 베스트도전 Best Challenge → 정식 연재 Originals → Creator 101 수익화·IP 사업화` 승격 트랙을 내재화.

### 3.2 KakaoPage, Kakao Webtoon, MrBlue, Bomtoon, Manga Plus: 탐색·랭킹·요일·BM·취향태그 아키텍처
- **관찰된 사실 (`observedFacts`)**:
  - **KakaoPage**: `/landing/series/{card,list,poster}/[[...pathParams]]` 3-Mode 뷰 스위처 및 `/cms/short-vod-viewer-preview`, `depth: 2` 스티키 서브탭(`h-57pxr`).
  - **Kakao Webtoon & MrBlue**: `(weekday + 6) % 7` 월요일 시작 타임테이블 수식, `bmFilterKey` (`전체 / 기다무 WUF / 무료 / 신작 / 완결`), `/Zzim/List`·`/popup/TicketInfo`·`/virtual/mylibrary` 가상 드로어.
  - **Bomtoon** (`_buildManifest.js` 125 routes): `/search/preference/tag` 다중 취향 태그 조합기, `/home/short/[key]`·`/play/hotclip` 숏폼 허브, `/my/library/{recent,favorite,download,myFolder,secret}` 8분류 내 서재.
  - **Manga Plus** (`app.41982a95.js`): `/manga_list/{all,ongoing,completed,one_shot,browser_a,browser_z,updated}` 7종 디렉터리 및 `/ranking/{hottest,trending,completed}` 3축 랭킹 라우터.
- **내재화 (`internalization`)**:
  - `DiscoverHubPage.tsx`: 연재 트랙 스위처(`전체 / 정식 연재 Originals / 오픈 캔버스·베스트도전 / 기다무·WUF / 숏폼 컷츠`) 및 6단계 파이프라인 배너 탑재.
  - `RankingPage.tsx`: 4대 스트림 랭킹 프리셋(`실시간 Hottest / 급상승 Trending / 완결 명작 Completed / 오픈연재 라이징 Canvas`) 및 `SiteContextualSubNav` 장착.
  - `CalendarPage.tsx`: 월요일 시작(`getMondayFirstWeekdayIndex`) 요일 탭과 결합된 BM·연재 필터 바(`전체 / 기다무·WUF / 무료 공개 / 신작 UP / 완결 정주행`) 장착.
  - `ExplorePage.tsx`: Manga Plus 7-Way 디렉터리 프리셋 바 + Bomtoon 취향 태그 조합기 + NAVER/KakaoPage 3-Mode 뷰 스위처(`카드형 / 포스터형 / 리스트형`) 장착.

### 3.3 Postype, CLIP STUDIO, Pixiv BOOTH, Sketchfab 3D: 4-Pillar 내 서재 & 2D/3D 에셋 즉시 장착 생태계
- **관찰된 사실 (`observedFacts`)**:
  - **Postype & Bomtoon**: `/library/{view,purchases,likes,collections}` 및 `/my/library/{recent,favorite,download,myFolder}` 4대 서재 축과 `/studio` ↔ `/editor` 브리지.
  - **CLIP STUDIO, Pixiv BOOTH, Sketchfab 3D**: `/autocomplete/tag.json` 기반 2D 브러시·톤·식자 및 3D 배경·캐릭터·포즈 컬렉션(`/collections/popular`)과 3D 뷰포트 인스펙터 연동.
- **내재화 (`internalization`)**:
  - `CONTEXTUAL_SUBNAV_GROUPS`를 6대 핵심 허브(`promo-cuts-hub`, `discover-hub`, `community-hub`, `studio-hub`, `market-hub`, `personal-library-hub`)로 확장하고 `PERSONAL_LIBRARY_SEGMENTS`와 `COMPETITOR_DISCOVERY_ROUTER_PRESETS`를 구축.
  - `SiteContextualSubNav`에 지각 균일 `oklch()` 허브 액센트 토큰과 Tapas 스타일 배지(`SHORT-VOD`, `AI STUDIO`, `UP`, `NEW`, `GALLERY`), Forced-Colors 고대비 안전 경계를 적용.
  - `LibraryPage.tsx`: `SiteContextualSubNav` 및 4-Pillar 개인 서재 요약 카드(`최근 감상 View / 소장·대여 Purchases / 찜·좋아요 Likes / 내 컬렉션 Collections`) + 스튜디오 바로가기 탑재.
  - `MarketHomePage.tsx`: `SiteContextualSubNav` 및 에셋 생태계 6대 퀵 프리셋(`전체 소재 / 2D 브러시·펜 / 3D 배경·스테이지 / 3D 캐릭터·포즈 / 식자·효과음·보정 / 무료·포인트 소재`) + `Studio 1-Click 즉시 장착` 워크플로 바 탑재.
  - `SitemapPage.tsx`: 23개 REA 역공학 플랫폼 원장 요약 및 6대 허브 · 6단계 창작-홍보 파이프라인 인터랙티브 아키텍처 맵 탑재.

### 3.4 VRoid Hub, VRoid Studio, Clip Studio Paint & Assets, BOOTH 3D Models, ACON3D

- **관찰된 사실 (`observedFacts`)**:
  - **VRoid Hub (`_buildManifest.js` 65 routes)**: `/characters/[characterId]/models/[modelId]` 하위에 `/edit`, `/embed`, `/photobooth`, `/tracking` 서브 라우트와 `/license`, `/model_assets/[modelAssetId]`, `/apps/[id]/character_models`를 분리하여 3D 뷰어·포토부스·트래킹·VRM 라이선스 조건(아바타 사용, 폭력/선정성 표현, 법인/개인 상업 이용, 개작·재배포 권한)을 즉시 검증할 수 있는 라우터 계층을 구성.
  - **VRoid Studio (`_buildManifest.js` 26 routes)**: `/studio`, `/studio/releases`, `/studio/guidelines`, `/mobile`, `/wear`, `/special/shooting_studio/vko_ar`로 이어지는 프리셋 우선 진입(`Pick items -> Adjust parameters -> Draw hair bundles -> Shooting Studio / Export`) 동선을 제공.
  - **Clip Studio Paint & Assets (`23 JS files / 86,203 AST nodes`)**: 스튜디오 본체(`/kr/`, `/kr/function/`)에서 소재 카탈로그(`assets.clip-studio.com/q/search?type=3dhead%2Cother_3dmodel&order=dl`, `?type=brush&order=dl`) 및 4단계 가이드 튜토리얼(`3D 두상 모델 #11034`, `체형 커스터마이즈 #9936`, `3D 소재 조합 #8416`, `퍼펫 변형 #10496`, `3D에 직접 그리기 #10495`)로 딥링크 브리지를 제공.
  - **BOOTH 3D Models (`10 JS files / 36,633 AST nodes`)**: `/ko/browse/3D%20Models` 하위에 `3D Characters`, `3D Tools & Systems`, `3D Motion & Animation` 분류 칩과 `?tags[]=VRChat`, `?in_stock=true` 필터 및 원클릭 `Reset` 동선을 배치.
  - **ACON3D**: 헤드리스 브라우저 접근 시 Cloudflare 보안 검증(`Performing security verification`, Ray ID `a50910fcaabbba04`)이 관찰되어 REA 인식론 규율에 따라 `bounded-by-bot-challenge`로 정직하게 기록.
- **내재화 (`internalization`)**:
  - `VRM_CHARACTER_SUB_ROUTES`(`overview`, `edit`, `photobooth`, `tracking`, `embed`, `license`), `VrmUsageConditionMatrix` 및 `summarizeVrmUsageMatrix`, `CREATOR_GUIDED_WORKFLOW_STAGES`(5단계 가이드 창작 스테퍼), `resolveCreatorPostActionBridgeRoutes`(창작 단계 완료 후 컷츠·소재실·홍보 영상실 연관 동선 브리지)를 `webtoon-platform-router-ux-model.ts`와 `CharacterPlatformWorkbench.tsx`, `apps/character-lab` 상단 워크플로 바 및 URL 쿼리 라우터 동기화에 내재화.
