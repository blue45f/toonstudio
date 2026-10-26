# 글로벌 웹툰·창작·에셋 플랫폼 13종 REA 라우터·동선 역공학 및 UI/UX 고도화 설계서

- **작성일**: `2026-10-26`
- **상태**: `current`
- **증거 번들**: [`docs/evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json`](../evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json)
- **클린룸 구현 모듈**:
  - [`apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts`](../../apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts)
  - [`apps/web/src/shared/components/site-contextual-subnav.tsx`](../../apps/web/src/shared/components/site-contextual-subnav.tsx)
  - [`apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx`](../../apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx)
  - [`apps/web/src/domains/cuts/CutsStudioPage.tsx`](../../apps/web/src/domains/cuts/CutsStudioPage.tsx)

## 1. 목적 및 배경

글로벌 주요 웹툰·만화·창작·에셋 플랫폼 13종(**NAVER WEBTOON**, **KakaoPage**, **WEBTOON Global**, **Tapas**, **Lezhin Comics**, **Pixiv Comic**, **RIDI Webtoon**, **Kakao Webtoon**, **Postype**, **Manta**, **CLIP STUDIO**, **ACON3D**, **Manga Plus by SHUEISHA**)의 실제 프로덕션 웹 애플리케이션을 REA(`reverse-engineer-anything`) MCP 도구(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`)로 캡처·역공학하여 라우터 계층, GNB/서브탭/LNB/푸터 동선, 뷰 스위처, 창작 파이프라인, 필터 아키텍처, UI/UX 디자인 토큰을 도출하고 ToonStudio에 클린룸 내재화하였다.

## 2. REA 역공학 증거 원장 (13개 플랫폼 · 40개 Evidence ID)

| 플랫폼 | 대상 URL | 버전 / 라우터 | `capture_browser_scenario` | `export_web_scripts` | `analyze_javascript_application` | 스크립트 / AST 노드 |
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

## 3. 플랫폼별 핵심 발견 사항 및 내재화 설계

### 3.1 NAVER WEBTOON & Manta: 6단계 창작·변환·숏폼·배포 통합 파이프라인
- **관찰된 사실 (`observedFacts`)**:
  - **NAVER WEBTOON** (`router-394efe0e852153c2d1ea.js`): 일반 웹툰 관리(`/creators/manage/title/{new,edit}`, `/creators/manage/article/{new,edit}`)와 숏폼 **Cuts** 관리(`/creators/manage/cuts/title/{new,edit}`, `/creators/manage/cuts/article`)가 대칭 트리를 형성.
  - **Manta** (`_buildManifest.js`): `/creator/apply` → `/creator/studio` → `/creator/studio/series/new` → `/creator/studio/series/[seriesId]/episodes/{new,[episodeId]/edit}` → `/preview/episodes/[episodeId]` 및 출판만화·웹소설 자동 변환(`/uot-printcomic-v2`, `/uot-printnovel-v2`), 캠페인 투표(`/campaigns/voting`)로 이어지는 전주기 창작자 라우터를 보유.
- **내재화 (`internalization`)**:
  - `CREATOR_STUDIO_PIPELINE_STEPS` 6단계 파이프라인(`01 창작 시작 /create` → `02 신작 개설 /studio/new` → `03 원고 작화 /studio/comic` → `04 출판만화·스크롤 변환 /studio/import` → `05 예고편·숏폼 컷츠 /showcase/promo` → `06 연재 배포·독자 홍보 /community/promote`)과 `studio-hub` 서브탭 그룹을 내재화하고 `CutsStudioPage.tsx` 및 `PromoVideoLibraryPage.tsx`에 연결.

### 3.2 KakaoPage & Kakao Webtoon: 3-Mode 뷰 스위처 및 월요일 시작 타임테이블 리졸버
- **관찰된 사실 (`observedFacts`)**:
  - **KakaoPage**: `/landing/series/{card,list,poster}/[[...pathParams]]` 3-Mode 뷰 스위처 및 `/cms/short-vod-viewer-preview`, `depth: 2` 스티키 서브탭(`h-57pxr`).
  - **Kakao Webtoon** (`v5.12.1`, `source-13-89cae4c1decd50887cbf2f5bfd05957c3e68b79ab1548c434f55a5e9ef5b7c27.js`): `/[[...home]]` 라우터가 `(weekday + 6) % 7` 수식으로 월요일 기준(`mon`~`sun`) 활성 요일을 결정하고 `bmFilterKey`로 타임테이블을 즉시 필터링.
- **내재화 (`internalization`)**:
  - `resolveMondayFirstWeekdayIndex`, `resolveActiveWeekdayKey`, `SERIES_LANDING_VIEW_MODES` (`card | poster | list`)를 구현.

### 3.3 Postype, Tapas, CLIP STUDIO, Manga Plus: 6대 맥락형 허브 및 탐색 프리셋
- **관찰된 사실 (`observedFacts`)**:
  - **Postype**: `/library/{view,purchases,likes,collections}` 4-Tab 개인 서재 및 `/studio` ↔ `/editor` 브리지.
  - **Manga Plus** (`app.41982a95.js`): `/manga_list/{all,ongoing,completed,one_shot,browser_a,browser_z,updated}` 및 `/ranking/{hottest,trending,completed}` 3축 랭킹 라우터.
  - **CLIP STUDIO**: 드로잉 엔진과 소재 마켓(ASSETS)·강좌(TIPS)의 창작 단계별 결합.
- **내재화 (`internalization`)**:
  - `CONTEXTUAL_SUBNAV_GROUPS`를 6대 핵심 허브(`promo-cuts-hub`, `discover-hub`, `community-hub`, `studio-hub`, `market-hub`, `personal-library-hub`)로 확장하고 `PERSONAL_LIBRARY_SEGMENTS`와 `COMPETITOR_DISCOVERY_ROUTER_PRESETS`를 구축.
