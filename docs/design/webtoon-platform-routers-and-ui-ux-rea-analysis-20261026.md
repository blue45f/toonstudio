# 유사 웹툰·창작 플랫폼 7종 REA 라우터·페이지 구조 역공학 및 UI/UX 고도화 설계서

- **작성일**: `2026-10-26`
- **상태**: `current`
- **증거 번들**: [`docs/evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json`](../evidence/rea-webtoon-platform-routers-and-ui-ux-20261026.json)
- **클린룸 구현 모듈**:
  - [`apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts`](../../apps/web/src/shared/navigation/webtoon-platform-router-ux-model.ts)
  - [`apps/web/src/shared/components/site-contextual-subnav.tsx`](../../apps/web/src/shared/components/site-contextual-subnav.tsx)
  - [`apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx`](../../apps/web/src/domains/marketing/PromoVideoLibraryPage.tsx)

## 1. 목적 및 배경

글로벌 주요 웹툰·만화·창작 플랫폼 7종(**NAVER WEBTOON**, **KakaoPage**, **WEBTOON Global**, **Tapas**, **Lezhin Comics**, **Pixiv Comic**, **RIDI Webtoon**)의 실제 프로덕션 웹 애플리케이션을 REA(`reverse-engineer-anything`) MCP 도구(`capture_browser_scenario`, `export_web_scripts`, `analyze_javascript_application`)로 캡처·역공학하여 라우터 계층, GNB/서브탭/LNB/푸터 동선, 뷰 스위처, 필터 아키텍처, UI/UX 디자인 토큰을 도출하고 ToonStudio에 클린룸 내재화하였다.

## 2. REA 역공학 증거 원장 (21개 Evidence ID)

| 플랫폼 | 대상 URL | 버전 / 라우터 | `capture_browser_scenario` | `export_web_scripts` | `analyze_javascript_application` | 스크립트 / AST 노드 |
| --- | --- | --- | --- | --- | --- | --- |
| **NAVER WEBTOON** | `https://comic.naver.com/index` | React Router v6 (44 routes) | `ev_559fd63b85ab64546f20cc5e607ed81fa9b9b45406e9da7e37a50fa69408b86e` | `ev_1a784b9c27c37fca96c271d4317fac660a8a1ddff1b61974466913d3a5b31cb7` | `ev_258bfdd5a04aa96486680a11f6d034716d64240b53fd7e127d407c896f81b1c5` | 8 files / 59,852 nodes |
| **KakaoPage** | `https://page.kakao.com/` | Next.js `v2.43.1-pc-ko` (152 routes) | `ev_6f6aa106e603e822d7af0706866296f9d414428009956062faf73d75fdb24722` | `ev_0feeb788c3e88366a84e2f00c28217cff883974368dbf55c660ffe3c101de0bb` | `ev_bdef249b6a4ff2e27ca8061ecf6bd031b293f83daca0ec5f734205aa1f72b173` | 16 files / 47,135 nodes |
| **WEBTOON Global** | `https://www.webtoons.com/en/` | Hybrid SSR + Webpack (28 routes) | `ev_98317ae85066c238eccda4c1f0cfacd4b8e041586595c08f14e43df37be1e16c` | `ev_7e323239eb335e22b01f487423ba8f0f1d07b6a8979f7bb6ef9b20c3ecb7a16a` | `ev_b882700c129e5e6755bcdcf8a0ef825286aa894bca7da6197df43aeb4d4c07cf` | 16 files / 150,354 nodes |
| **Tapas** | `https://tapas.io/` | Next.js `v7.8.2` (55 routes) | `ev_1ec34b24fd3e43cbbb237351c8ede37c1a42de1fa02408b1cbb2418d3a5c14fd` | `ev_cc2a18023e114a0d8450f59e3605bc55c3560eab469ea4dc8f47fc798a1e4100` | `ev_f9364850b854aa96a9810d45eadfb020156b998f7ab742e79f084953c24c05b2` | 35 files / 167,085 nodes |
| **Lezhin Comics** | `https://www.lezhin.com/ko` | Next.js App Router (38 routes) | `ev_64f618fc3e2734111941444d47bfbb5cdd4a7740980a8fa06de08f814991b87f` | `ev_88ccde2265b0819463b65ce41763c2ae26c767664c11c085409de3e169e9bf61` | `ev_81ff8ffef66c3eb7ae1a371da33901dfaf73dc2fe9e0b20b8a9cec80d1be5c80` | 35 files / 137,631 nodes |
| **Pixiv Comic** | `https://comic.pixiv.net/` | Next.js Pages Router (111 routes) | `ev_b4781757598d3aab579b2f4d3b5215ed1b2a31da40911e58cf4dd4f4986ea57a` | `ev_943b64b03822fc79a2b4d8e7fcd89a195bff5929b5be7f26fd129f95a929c967` | `ev_2e78b819f376bdf3a9ab2041042be3d32b284d258b7b0a5541954b0edc6273c6` | 20 files / 142,720 nodes |
| **RIDI Webtoon** | `https://ridibooks.com/webtoon/recommendation` | Cloudflare Turnstile 경계 | `ev_c4dd1056f8442aa4db1b37cfda305018a202f046b82a217232ad7ae25f9f5b32` | `ev_21c888f2b1a769d1362520f8e2ff4c0f8b677e5382f484b25fbbed2b5b66c50f` | `ev_2099d4bc73f672aec5d9b3c252fd83ad7a2e39a04704836c682c3322eeb4a1a4` | 2 files / 1,214 nodes |

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
