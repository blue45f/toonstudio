/**
 * 유사 웹툰·창작·3D 캐릭터 스튜디오 플랫폼 12종 REA(Reverse-Engineer-Anything) 라우터·동선 및 UI/UX 아키텍처 엔진.
 *
 * 분석 기준일: 2026-10-26
 * 분석 대상:
 * 1. NAVER WEBTOON (https://comic.naver.com/index)
 * 2. KakaoPage (https://page.kakao.com/, v2.43.1-pc-ko)
 * 3. WEBTOON Global (https://www.webtoons.com/en/)
 * 4. Tapas (https://tapas.io/, v7.8.2)
 * 5. Lezhin Comics (https://www.lezhin.com/ko)
 * 6. Pixiv Comic (https://comic.pixiv.net/)
 * 7. RIDI Webtoon (https://ridibooks.com/webtoon/recommendation)
 * 8. VRoid Hub (https://hub.vroid.com/en)
 * 9. VRoid Studio (https://vroid.com/en/studio)
 * 10. Clip Studio Paint & Assets (https://www.clipstudio.net/kr/)
 * 11. BOOTH 3D Models (https://booth.pm/ko/browse/3D%20Models)
 * 12. ACON3D (https://www.acon3d.com/ko)
 *
 * 이 모듈은 REA MCP(capture_browser_scenario, export_web_scripts, analyze_javascript_application, inspect_analysis_view)로
 * 추출·검증한 실제 프로덕션 라우터 트리와 UI/UX 패턴을 클린룸 데이터 계약 및 순수 함수로 내재화한다.
 */

import { canonicalSitePath } from "@/shared/lib/site-route-authority";

export type CompetitorPlatformId =
  | "naver-webtoon"
  | "kakaopage"
  | "webtoons-global"
  | "tapas"
  | "lezhin-comics"
  | "pixiv-comic"
  | "ridi-webtoon"
  | "vroid-hub"
  | "vroid-studio"
  | "clip-studio"
  | "booth-3d"
  | "acon3d";

export interface CompetitorPlatformReaEvidence {
  readonly id: CompetitorPlatformId;
  readonly name: string;
  readonly targetUrl: string;
  readonly appVersion: string;
  readonly routerFramework: string;
  readonly captureEvidenceId: string;
  readonly exportScriptsEvidenceId: string;
  readonly astAnalysisViewEvidenceId: string;
  readonly rootSha256: string;
  readonly scriptCount: number;
  readonly totalBytes: number;
  readonly astNodeCount: number;
  readonly findingCount: number;
  readonly moduleCount: number;
  readonly routeCount: number;
  readonly keyRouterPatterns: readonly string[];
  readonly keyUiUxPatterns: readonly string[];
  readonly epistemicStatus: "verified" | "bounded-by-bot-challenge";
}

export const COMPETITOR_PLATFORM_REA_LEDGER: readonly CompetitorPlatformReaEvidence[] = Object.freeze([
  {
    id: "naver-webtoon",
    name: "NAVER WEBTOON",
    targetUrl: "https://comic.naver.com/index",
    appVersion: "react-router-v6-webpack5",
    routerFramework: "React Router v6 (createBrowserRouter / nested children)",
    captureEvidenceId: "ev_559fd63b85ab64546f20cc5e607ed81fa9b9b45406e9da7e37a50fa69408b86e",
    exportScriptsEvidenceId: "ev_1a784b9c27c37fca96c271d4317fac660a8a1ddff1b61974466913d3a5b31cb7",
    astAnalysisViewEvidenceId: "ev_258bfdd5a04aa96486680a11f6d034716d64240b53fd7e127d407c896f81b1c5",
    rootSha256: "d173fd1ddedd33c6b14a690c79eb12fec5b5ddfa5496344dd57982a3cf0aa034",
    scriptCount: 8,
    totalBytes: 211138,
    astNodeCount: 59852,
    findingCount: 173,
    moduleCount: 26,
    routeCount: 44,
    keyRouterPatterns: [
      "/proposal/business/* (home, entertainment, licensingMerchandising, publishing, game, promotions, contact)",
      "/creators/manage/title/{new,edit} & /creators/manage/article/{new,edit}",
      "/creators/manage/cuts/title/{new,edit} & /creators/manage/cuts/article (숏폼 Cuts 대칭 라우팅)",
      "/creators/article/preview & /creators/community",
      "/index, /webtoon, /webtoon/list, /bestChallenge, /challenge, /mypage/{favorite,recently,bookmark}",
    ],
    keyUiUxPatterns: [
      "2단 GNB + 서브 내비게이션 및 우측Creator Studio(크리에이터스) 즉시 진입 CTA",
      "시그니처 그린(--color-webtoon-green: #00dc64) 및 프로모션 배너(--color-solid-promotion-bar: #e5fbef)",
      "1190px 컨테이너(840px 메인 그리드 + 우측 실시간 랭킹·공지 어사이드 레일)",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "kakaopage",
    name: "KakaoPage",
    targetUrl: "https://page.kakao.com/",
    appVersion: "v2.43.1-pc-ko",
    routerFramework: "Next.js Pages Router (_buildManifest.js 152 routes)",
    captureEvidenceId: "ev_6f6aa106e603e822d7af0706866296f9d414428009956062faf73d75fdb24722",
    exportScriptsEvidenceId: "ev_0feeb788c3e88366a84e2f00c28217cff883974368dbf55c660ffe3c101de0bb",
    astAnalysisViewEvidenceId: "ev_bdef249b6a4ff2e27ca8061ecf6bd031b293f83daca0ec5f734205aa1f72b173",
    rootSha256: "f942ff97342c622329bd040a0fdf5e5932bf55920f99d4dcbbb1008e88c7a982",
    scriptCount: 16,
    totalBytes: 175108,
    astNodeCount: 47135,
    findingCount: 585,
    moduleCount: 81,
    routeCount: 152,
    keyRouterPatterns: [
      "/menu/[menuUid]/screen/[screenUid] (동적 Menu/Screen 조합 라우터)",
      "/landing/series/card/[[...pathParams]] (와이드 카드·트레일러 뷰)",
      "/landing/series/list/[[...pathParams]] (컴팩트 메타데이터 리스트 뷰)",
      "/landing/series/poster/[[...pathParams]] (고밀도 포스터·쇼츠 그리드 뷰)",
      "/cms/short-vod-viewer-preview & /cms/text-viewer-preview (숏폼 홍보 VOD·뷰어 CMS 프리뷰)",
    ],
    keyUiUxPatterns: [
      "depth: 2 스티키 서브탭 바(h-57pxr bg-theme-bg-base) 및 MainAndSub 반응형 헤더 계약",
      "3-Mode 뷰 스위처(Card / List / Poster) 및 7축 다중 필터(Category, Genre, BM, Day, Sort, Completed, TabType)",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "webtoons-global",
    name: "WEBTOON Global",
    targetUrl: "https://www.webtoons.com/en/",
    appVersion: "global-pc-2026",
    routerFramework: "Hybrid SSR + Webpack GNB/Home Controller",
    captureEvidenceId: "ev_98317ae85066c238eccda4c1f0cfacd4b8e041586595c08f14e43df37be1e16c",
    exportScriptsEvidenceId: "ev_7e323239eb335e22b01f487423ba8f0f1d07b6a8979f7bb6ef9b20c3ecb7a16a",
    astAnalysisViewEvidenceId: "ev_b882700c129e5e6755bcdcf8a0ef825286aa894bca7da6197df43aeb4d4c07cf",
    rootSha256: "2572587de0bcdb68ba9d2f4ab41d0d718a086cd2dd192c465de22fe35e788811",
    scriptCount: 16,
    totalBytes: 593353,
    astNodeCount: 150354,
    findingCount: 611,
    moduleCount: 83,
    routeCount: 28,
    keyRouterPatterns: [
      "/[locale]/originals, /[locale]/canvas, /[locale]/genres, /[locale]/popular, /[locale]/creators101",
      "/search?keyword= & /search?searchMode=AUTHOR&keyword= (작품·작가 이원 검색)",
    ],
    keyUiUxPatterns: [
      "장르별 동적 컬러 액센트 토큰(genreCssCode, genreName) 및 카드 호버 플립 요약",
      "독자·창작자 통합 계정 팝오버(Dashboard, My Series, Subscribed, Comments, Creators 101)",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "tapas",
    name: "Tapas",
    targetUrl: "https://tapas.io/",
    appVersion: "v7.8.2",
    routerFramework: "Next.js Pages Router (_buildManifest.js 55 routes)",
    captureEvidenceId: "ev_1ec34b24fd3e43cbbb237351c8ede37c1a42de1fa02408b1cbb2418d3a5c14fd",
    exportScriptsEvidenceId: "ev_cc2a18023e114a0d8450f59e3605bc55c3560eab469ea4dc8f47fc798a1e4100",
    astAnalysisViewEvidenceId: "ev_f9364850b854aa96a9810d45eadfb020156b998f7ab742e79f084953c24c05b2",
    rootSha256: "89246a38198add73be52bed43de868aaff075484247b7a944adc8ff24dd395b5",
    scriptCount: 35,
    totalBytes: 565750,
    astNodeCount: 167085,
    findingCount: 884,
    moduleCount: 161,
    routeCount: 55,
    keyRouterPatterns: [
      "/static-landing/{daily,free,genre,new,original,ranking} (6대 정적 랜딩 택소노미)",
      "/library/{reading-list,recent,subscribed,unlocked}",
      "/dev/design-system/bar/{navigation,tab} & /dev/design-system/common/{badge,ranking}",
    ],
    keyUiUxPatterns: [
      "NavigationBar / TabBar 디자인 시스템 프리미티브 분리 및 UP·NEW·EVENT 배지 규격화",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "lezhin-comics",
    name: "Lezhin Comics",
    targetUrl: "https://www.lezhin.com/ko",
    appVersion: "nextjs-app-router-2026",
    routerFramework: "Next.js App Router (RSC / [language] dynamic segment)",
    captureEvidenceId: "ev_64f618fc3e2734111941444d47bfbb5cdd4a7740980a8fa06de08f814991b87f",
    exportScriptsEvidenceId: "ev_88ccde2265b0819463b65ce41763c2ae26c767664c11c085409de3e169e9bf61",
    astAnalysisViewEvidenceId: "ev_81ff8ffef66c3eb7ae1a371da33901dfaf73dc2fe9e0b20b8a9cec80d1be5c80",
    rootSha256: "656ac519a55786950ed0fc59ec7aadd21a4807834f72e9b686d861ffb5ef883f",
    scriptCount: 35,
    totalBytes: 486892,
    astNodeCount: 137631,
    findingCount: 1345,
    moduleCount: 403,
    routeCount: 38,
    keyRouterPatterns: [
      "/[language]/{scheduled,ranking,free,sale,presents,bookshome,genreplus}",
      "/[language]/library & /[language]/account",
    ],
    keyUiUxPatterns: [
      "다크 캔버스 기반 고대비 포스터 카드 및 상단 선물함(presents)·무료(free) 프로모션 직행 탭",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "pixiv-comic",
    name: "Pixiv Comic",
    targetUrl: "https://comic.pixiv.net/",
    appVersion: "nextjs-pages-2026",
    routerFramework: "Next.js Pages Router (_buildManifest.js 111 routes)",
    captureEvidenceId: "ev_b4781757598d3aab579b2f4d3b5215ed1b2a31da40911e58cf4dd4f4986ea57a",
    exportScriptsEvidenceId: "ev_943b64b03822fc79a2b4d8e7fcd89a195bff5929b5be7f26fd129f95a929c967",
    astAnalysisViewEvidenceId: "ev_2e78b819f376bdf3a9ab2041042be3d32b284d258b7b0a5541954b0edc6273c6",
    rootSha256: "ea2567463d60bba34694f25f77d3af29751b1b0431ce5c15503e577ea5f63879",
    scriptCount: 20,
    totalBytes: 514805,
    astNodeCount: 142720,
    findingCount: 290,
    moduleCount: 30,
    routeCount: 111,
    keyRouterPatterns: [
      "/search/cover (표지 이미지 기반 시각 탐색 라우트)",
      "/mypage/color_theme (사용자 정의 테마 컬러 설정 라우트)",
      "/finish_reading/[sku] (열람 직후 연관 작품·후원·댓글 연결 브리지 라우트)",
      "/magazines/[magazineId] & / rankings / /genres / /tags",
    ],
    keyUiUxPatterns: [
      "표지 그리드 비주얼 서치(/search/cover) 및 완독 후 브리지 페이지(/finish_reading/[sku])",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "ridi-webtoon",
    name: "RIDI Webtoon",
    targetUrl: "https://ridibooks.com/webtoon/recommendation",
    appVersion: "cloudflare-turnstile-edge",
    routerFramework: "Next.js Edge (Cloudflare Turnstile Challenge Observed)",
    captureEvidenceId: "ev_c4dd1056f8442aa4db1b37cfda305018a202f046b82a217232ad7ae25f9f5b32",
    exportScriptsEvidenceId: "ev_21c888f2b1a769d1362520f8e2ff4c0f8b677e5382f484b25fbbed2b5b66c50f",
    astAnalysisViewEvidenceId: "ev_2099d4bc73f672aec5d9b3c252fd83ad7a2e39a04704836c682c3322eeb4a1a4",
    rootSha256: "c85322cebeeb53da5c4814ef15e2a17f5f2ce7cb6fd25be9c355616ef3ca761f",
    scriptCount: 2,
    totalBytes: 17118,
    astNodeCount: 1214,
    findingCount: 12,
    moduleCount: 2,
    routeCount: 0,
    keyRouterPatterns: [
      "/cdn-cgi/challenge-platform/h/b/orchestrate/chl_page/v1 (Cloudflare Turnstile 봇 방어 경계 확인)",
    ],
    keyUiUxPatterns: [
      "REA 인식론적 규율에 따라 봇 챌린지 뒤의 번들은 추측하지 않고 unknowns로 기록",
    ],
    epistemicStatus: "bounded-by-bot-challenge",
  },
  {
    id: "vroid-hub",
    name: "VRoid Hub",
    targetUrl: "https://hub.vroid.com/en",
    appVersion: "nextjs-7O1MwYwwRlg80I--EEiL8",
    routerFramework: "Next.js Pages Router (_buildManifest.js 65 routes)",
    captureEvidenceId: "ev_f1ecf030b5868731e6c636e8702158468243d88596307ecacfe9ad9086906f83",
    exportScriptsEvidenceId: "ev_90e7d9c6f7f335eb4f098a8e855bf4d38111c439f5927620b0e75a875a001e57",
    astAnalysisViewEvidenceId: "ev_309f1dae9b7d104a3fb0a85120b6b316b8a75927843da580ce5c23d4d473f0fa",
    rootSha256: "bc847a0eb1532258545218e685b1a0c41a98c2159ebd6c6a54bcdd24e29e9445",
    scriptCount: 5,
    totalBytes: 73757,
    astNodeCount: 7217,
    findingCount: 9,
    moduleCount: 2,
    routeCount: 65,
    keyRouterPatterns: [
      "/characters/[characterId]/models/[modelId]/{edit,embed,photobooth,tracking} (3D 모델 서브 라우트 분리)",
      "/model_assets/[modelAssetId], /license, /content-protection-policy, /guidelines",
      "/models, /models/followings, /artworks, /hearts, /search/[query]/{artworks,creators}, /apps/[id]/character_models",
    ],
    keyUiUxPatterns: [
      "듀얼 포트레이트·전신 썸네일 카드(300x400) + 원클릭 하트(/hearts) + 3D 뷰어/포토부스/트래킹 서브탭",
      "VRM 이용 조건 매트릭스(아바타 사용, 폭력·선정성 표현, 법인·개인 상업 이용, 개작·재배포 권한 배지)",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "vroid-studio",
    name: "VRoid Studio",
    targetUrl: "https://vroid.com/en/studio",
    appVersion: "nextjs-X3VkFB2zRKGJg3S3P8tDQ-v2.14.0",
    routerFramework: "Next.js Pages Router (_buildManifest.js 26 routes)",
    captureEvidenceId: "ev_0e79c9c80a9d191d54632087ba929765c32165e8b771b2f7f36e8fdbe9eb1228",
    exportScriptsEvidenceId: "ev_39c57cd108aab1b19c587b4143f7c2c43e27a38d2110e141ceb060f05378e5f8",
    astAnalysisViewEvidenceId: "ev_7c4e50edf71d08c8d335702fd41056723e71528178828138abbf0dd18b256643",
    rootSha256: "dd8286d1a04fac852921f1274edb8603f67cb31995ae05ad103deca50b947a34",
    scriptCount: 10,
    totalBytes: 151626,
    astNodeCount: 24680,
    findingCount: 162,
    moduleCount: 46,
    routeCount: 26,
    keyRouterPatterns: [
      "/studio, /studio/_beta_releases_container, /studio/guidelines, /studio/notice/[noticeId], /studio/releases",
      "/mobile, /wear/{chloma,eiji-kotouge,levis}, /special/shooting_studio/vko_ar",
    ],
    keyUiUxPatterns: [
      "프리셋 우선 온보딩(프리셋 선택 -> 파라미터 조절 -> 3D 헤어 번들 직접 드로잉 -> 포토부스/VRM 내보내기)",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "clip-studio",
    name: "Clip Studio Paint & Assets",
    targetUrl: "https://www.clipstudio.net/kr/",
    appVersion: "csp-kr-2026",
    routerFramework: "Cross-Subdomain Studio + Assets Deep-Link Router",
    captureEvidenceId: "ev_8f03af4a349b97ad4b4ff25a9e918393457671077cceeb742753eab28335704a",
    exportScriptsEvidenceId: "ev_16939e377aa98224da3d756888afe41d9a2697eda7f4eadaf69ceb5446d2b185",
    astAnalysisViewEvidenceId: "ev_c31892f55e2c633d0c4389762bb42bc136d827b89dad070cb7dc5fd40f906671",
    rootSha256: "5837e57c21a0c3c3b44e4c4c7a6fef976490a6f115b260e3e1e7b743fdd02eb8",
    scriptCount: 23,
    totalBytes: 301556,
    astNodeCount: 86203,
    findingCount: 233,
    moduleCount: 4,
    routeCount: 24,
    keyRouterPatterns: [
      "/kr/, /kr/function/, /kr/dl/, /kr/purchase/",
      "assets.clip-studio.com/q/search?type=3dhead%2Cother_3dmodel&order=dl & ?type=brush&order=dl",
      "tips.clip-studio.com/q/articles/{11034#h01(3D 두상),9936#h01(체형),8416(3D 소재 조합),10496(퍼펫 변형),10495(3D 직접 그리기)}",
    ],
    keyUiUxPatterns: [
      "4단계 프로급 제작 가이드 스테퍼 + 3D 두상·체형·소재조합·3D 직접 그리기 직행 딥링크",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "booth-3d",
    name: "BOOTH 3D Models",
    targetUrl: "https://booth.pm/ko/browse/3D%20Models",
    appVersion: "booth-ch-token-v2",
    routerFramework: "Multi-Origin Marketplace Router (booth.pm / accounts.booth.pm / manage.booth.pm)",
    captureEvidenceId: "ev_e42d625e48b74db8cd12e65ab7876aed389056d762c6922385352ec8045d7895",
    exportScriptsEvidenceId: "ev_aa51dc986add3d5b81c53a00aaab77b7a23703492a41517ae098c6138818017d",
    astAnalysisViewEvidenceId: "ev_061939e46eb35dee70bc518584053adda8b7fe90886977e1483b4e6304a53ed5",
    rootSha256: "a9d9a22f5704592520b242af5a98b46b30502c42f9b73d35132333b7eb1cbc5c",
    scriptCount: 10,
    totalBytes: 126286,
    astNodeCount: 36633,
    findingCount: 218,
    moduleCount: 34,
    routeCount: 19,
    keyRouterPatterns: [
      "/ko/browse/3D%20Models, /ko/browse/3D%20Characters, /ko/browse/3D%20Tools%20&%20Systems, /ko/browse/3D%20Motion%20&%20Animation",
      "/ko/items/[id], /ko/items?tags[]=VRChat, /ko/events/bf-vrchat, accounts.booth.pm/library, manage.booth.pm/items",
    ],
    keyUiUxPatterns: [
      "3D 서브카테고리 칩(Characters / Tools & Systems / Motion & Animation) + 호환 태그 배지 + 위시리스트 카운터",
    ],
    epistemicStatus: "verified",
  },
  {
    id: "acon3d",
    name: "ACON3D",
    targetUrl: "https://www.acon3d.com/ko",
    appVersion: "cloudflare-challenge-edge",
    routerFramework: "Cloudflare Bot Security Verification Observed",
    captureEvidenceId: "ev_dacd9f842ffd038a4695af1bcc43ddd8fbdcb4b86170b730fd582d6b0acf996d",
    exportScriptsEvidenceId: "ev_4b27c4f89c63a75f7295c076b9d1d5f119384376f0abcb004735e1f86be6121d",
    astAnalysisViewEvidenceId: "ev_30db3935ab8540e7e350c0082d689a72e2e82ea7ab98a7815c6ce376b5227067",
    rootSha256: "c2a77bdbd02faa7b0a8ff2e7a1fdbc367f88692135d6fd8444598e3e93e12162",
    scriptCount: 1,
    totalBytes: 291,
    astNodeCount: 84,
    findingCount: 0,
    moduleCount: 0,
    routeCount: 0,
    keyRouterPatterns: [
      "Cloudflare Performing security verification (Ray ID a50910fcaabbba04)",
    ],
    keyUiUxPatterns: [
      "REA 인식론적 규율에 따라 봇 검증 뒤의 클라이언트 라우트는 추측하지 않고 bounded-by-bot-challenge로 기록",
    ],
    epistemicStatus: "bounded-by-bot-challenge",
  },
]);

/**
 * KakaoPage `/landing/series/{card,list,poster}/[[...pathParams]]` 및
 * Pixiv Comic `/search/cover`에서 검증된 3-Mode 뷰 스위처 타입.
 */
export type SeriesLandingViewMode = "card" | "list" | "poster";

export interface SeriesLandingViewModeSpec {
  readonly id: SeriesLandingViewMode;
  readonly koLabel: string;
  readonly enLabel: string;
  readonly koDescription: string;
  readonly enDescription: string;
  readonly kakaopageRoutePattern: string;
}

export const SERIES_LANDING_VIEW_MODES: readonly SeriesLandingViewModeSpec[] = Object.freeze([
  {
    id: "card",
    koLabel: "카드 뷰",
    enLabel: "Card view",
    koDescription: "미리보기 영상·설명·활용처를 한눈에 비교하는 와이드 카드 레이아웃",
    enDescription: "Wide card layout with video preview, description and usage context",
    kakaopageRoutePattern: "/landing/series/card/[[...pathParams]]",
  },
  {
    id: "poster",
    koLabel: "포스터·쇼츠 그리드",
    enLabel: "Poster & Shorts grid",
    koDescription: "표지·썸네일과 규격 중심으로 빠르게 훑어보는 고밀도 그리드 레이아웃",
    enDescription: "High-density visual grid focused on covers, thumbnails and aspect ratios",
    kakaopageRoutePattern: "/landing/series/poster/[[...pathParams]]",
  },
  {
    id: "list",
    koLabel: "컴팩트 리스트",
    enLabel: "Compact list",
    koDescription: "제목·규격·길이·쓰는 곳·내려받기를 한 줄씩 빠르게 탐색하는 목록 레이아웃",
    enDescription: "Compact row layout for scanning title, spec, duration, usage and download",
    kakaopageRoutePattern: "/landing/series/list/[[...pathParams]]",
  },
]);

/**
 * 홍보 영상·쇼츠 자료실 및 시리즈 탐색을 위한 화면 비율(Aspect Ratio) 필터.
 * NAVER WEBTOON `/creators/manage/cuts/*`(9:16 숏폼) 및 KakaoPage `/cms/short-vod-viewer-preview` 대응.
 */
export type MediaAspectFilter = "all" | "landscape-16-9" | "vertical-9-16" | "square-1-1";

export interface PromoMediaFilterState {
  readonly viewMode: SeriesLandingViewMode;
  readonly aspectFilter: MediaAspectFilter;
  readonly categoryFilter: string;
  readonly searchQuery: string;
}

export const DEFAULT_PROMO_MEDIA_FILTER_STATE: PromoMediaFilterState = Object.freeze({
  viewMode: "card",
  aspectFilter: "all",
  categoryFilter: "all",
  searchQuery: "",
});

export function classifyMediaAspectRatio(width: number, height: number): Exclude<MediaAspectFilter, "all"> {
  if (height > width) return "vertical-9-16";
  if (width === height) return "square-1-1";
  return "landscape-16-9";
}

export function matchesPromoMediaFilter(
  item: {
    readonly categoryId?: string;
    readonly category?: string;
    readonly width: number;
    readonly height: number;
    readonly ko: { readonly title: string; readonly body: string };
    readonly en: { readonly title: string; readonly body: string };
    readonly usage: { readonly ko: string; readonly en: string };
  },
  filter: PromoMediaFilterState,
): boolean {
  const itemCategory = item.categoryId ?? item.category ?? "";
  if (filter.categoryFilter !== "all" && itemCategory !== filter.categoryFilter) {
    return false;
  }
  if (filter.aspectFilter !== "all" && classifyMediaAspectRatio(item.width, item.height) !== filter.aspectFilter) {
    return false;
  }
  const q = filter.searchQuery.trim().toLowerCase();
  if (q.length > 0) {
    const haystack = [
      item.ko.title,
      item.ko.body,
      item.en.title,
      item.en.body,
      item.usage.ko,
      item.usage.en,
    ]
      .join(" ")
      .toLowerCase();
    return haystack.includes(q);
  }
  return true;
}

/**
 * NAVER WEBTOON 2단 서브 내비게이션 + KakaoPage `depth: 2` Subtab (`h-57pxr`) +
 * Tapas `bar/tab` 프리미티브를 결합한 맥락형 허브 서브탭 모델.
 */
export type ContextualHubBadge = "UP" | "NEW" | "SHORT-VOD" | "AI STUDIO" | "GALLERY";

export interface ContextualSubNavItem {
  readonly id: string;
  readonly href: string;
  readonly koLabel: string;
  readonly enLabel: string;
  readonly badge?: ContextualHubBadge;
  readonly exact?: boolean;
}

export interface ContextualSubNavGroup {
  readonly id: "promo-cuts-hub" | "discover-hub" | "community-hub" | "studio-hub" | "market-hub";
  readonly koTitle: string;
  readonly enTitle: string;
  readonly accentToken: string;
  readonly items: readonly ContextualSubNavItem[];
}

export const CONTEXTUAL_SUBNAV_GROUPS: readonly ContextualSubNavGroup[] = Object.freeze([
  {
    id: "promo-cuts-hub",
    koTitle: "영상 · 홍보 · 컷츠 허브",
    enTitle: "Promo Video & Cuts Hub",
    accentToken: "oklch(0.72 0.17 154)",
    items: [
      { id: "promo-library", href: "/promo-library", koLabel: "홍보 영상 자료실 (204편)", enLabel: "Promo Video Library (204)", badge: "SHORT-VOD", exact: true },
      { id: "showcase-promo", href: "/showcase/promo", koLabel: "홍보 영상 스튜디오", enLabel: "Promo Video Studio", badge: "AI STUDIO" },
      { id: "community-promote", href: "/community/promote", koLabel: "신작·작가 홍보 게시판", enLabel: "Creator Promo Board", badge: "UP" },
      { id: "cuts-feed", href: "/cuts", koLabel: "숏폼 컷츠 피드", enLabel: "Short-form Cuts", badge: "NEW", exact: true },
      { id: "cuts-studio", href: "/cuts/studio", koLabel: "컷츠 스튜디오", enLabel: "Cuts Studio" },
      { id: "brand-film", href: "/brand-film", koLabel: "브랜드 필름", enLabel: "Brand Film" },
      { id: "product-tour", href: "/product-tour", koLabel: "제품 투어", enLabel: "Product Tour" },
    ],
  },
  {
    id: "discover-hub",
    koTitle: "작품 탐색 · 큐레이션",
    enTitle: "Discover & Curation",
    accentToken: "oklch(0.68 0.16 245)",
    items: [
      { id: "discover", href: "/discover", koLabel: "통합 탐색", enLabel: "Discover", exact: true },
      { id: "explore", href: "/explore", koLabel: "장르·태그", enLabel: "Genres & Tags" },
      { id: "ranking", href: "/ranking", koLabel: "실시간 랭킹", enLabel: "Rankings", badge: "UP" },
      { id: "calendar", href: "/calendar", koLabel: "연재 캘린더", enLabel: "Release Calendar" },
      { id: "recommend", href: "/recommend", koLabel: "맞춤 추천", enLabel: "For You", badge: "NEW" },
      { id: "cuts", href: "/cuts", koLabel: "숏폼 컷츠", enLabel: "Cuts", badge: "SHORT-VOD" },
    ],
  },
  {
    id: "community-hub",
    koTitle: "커뮤니티 · 갤러리 · 홍보",
    enTitle: "Community & Showcase",
    accentToken: "oklch(0.7 0.17 42)",
    items: [
      { id: "community", href: "/community", koLabel: "커뮤니티 홈", enLabel: "Community", exact: true },
      { id: "community-promote", href: "/community/promote", koLabel: "작품·작가 홍보", enLabel: "Promote Work", badge: "UP" },
      { id: "showcase", href: "/showcase", koLabel: "창작 갤러리", enLabel: "Showcase", badge: "GALLERY", exact: true },
      { id: "showcase-promo", href: "/showcase/promo", koLabel: "예고편 제작", enLabel: "Trailer Maker", badge: "AI STUDIO" },
      { id: "reviews", href: "/reviews", koLabel: "독자 리뷰", enLabel: "Reviews" },
      { id: "collaborate", href: "/collaborate", koLabel: "구인·의뢰", enLabel: "Collaborate" },
    ],
  },
  {
    id: "studio-hub",
    koTitle: "창작 스튜디오 · 3D 캐릭터 허브",
    enTitle: "Creator Studio & 3D Character Hub",
    accentToken: "oklch(0.71 0.16 290)",
    items: [
      { id: "studio-home", href: "/studio", koLabel: "통합 스튜디오", enLabel: "Studio Home", exact: true },
      { id: "character-shaper", href: "/studio/assets/characters/new", koLabel: "3D 캐릭터 셰이퍼", enLabel: "3D Character Shaper", badge: "AI STUDIO" },
      { id: "cuts-studio", href: "/cuts/studio", koLabel: "컷츠 · 콘티 연출", enLabel: "Cuts & Storyboard", badge: "SHORT-VOD" },
      { id: "promo-library", href: "/promo-library", koLabel: "홍보 · 연출 자료실", enLabel: "Promo & Stage Library", badge: "NEW" },
    ],
  },
  {
    id: "market-hub",
    koTitle: "3D 모델 · 웹툰 소재 마켓 허브",
    enTitle: "3D Model & Webtoon Asset Market Hub",
    accentToken: "oklch(0.73 0.15 80)",
    items: [
      { id: "marketplace", href: "/marketplace", koLabel: "3D · 웹툰 소재 마켓", enLabel: "Asset Marketplace", exact: true },
      { id: "market-3d-characters", href: "/studio/assets/characters/new", koLabel: "3D 캐릭터 · 두상 프리셋", enLabel: "3D Characters & Heads", badge: "NEW" },
      { id: "market-promo-kits", href: "/promo-library", koLabel: "트레일러 · 쇼츠 키트", enLabel: "Trailer & Shorts Kits", badge: "SHORT-VOD" },
      { id: "market-showcase", href: "/showcase", koLabel: "소재 활용 쇼케이스", enLabel: "Asset Showcase", badge: "GALLERY" },
    ],
  },
]);

const SUBNAV_PATHS_PROMO = new Set(["/promo-library", "/showcase/promo", "/community/promote", "/cuts", "/cuts/studio", "/brand-film", "/product-tour"]);
const SUBNAV_PATHS_DISCOVER = new Set(["/discover", "/explore", "/ranking", "/calendar", "/recommend"]);
const SUBNAV_PATHS_COMMUNITY = new Set(["/community", "/showcase", "/reviews", "/collaborate"]);
const SUBNAV_PATHS_STUDIO = new Set(["/studio", "/studio/character", "/studio/assets/characters/new", "/character-shaper", "/character-lab"]);
const SUBNAV_PATHS_MARKET = new Set(["/marketplace", "/assets", "/library", "/brushes"]);

export function resolveContextualSubNavForPath(rawPathname: string): ContextualSubNavGroup | null {
  const pathname = canonicalSitePath(rawPathname);
  if (SUBNAV_PATHS_PROMO.has(pathname)) return CONTEXTUAL_SUBNAV_GROUPS[0] ?? null;
  if (SUBNAV_PATHS_DISCOVER.has(pathname)) return CONTEXTUAL_SUBNAV_GROUPS[1] ?? null;
  if (SUBNAV_PATHS_COMMUNITY.has(pathname)) return CONTEXTUAL_SUBNAV_GROUPS[2] ?? null;
  if (SUBNAV_PATHS_STUDIO.has(pathname)) return CONTEXTUAL_SUBNAV_GROUPS[3] ?? null;
  if (SUBNAV_PATHS_MARKET.has(pathname)) return CONTEXTUAL_SUBNAV_GROUPS[4] ?? null;
  return null;
}

/**
 * VRoid Hub `/characters/[characterId]/models/[modelId]/{edit,photobooth,tracking,embed}` + `/license`
 * 서브 라우트 계층을 내재화한 3D 캐릭터 모델 인스펙터 서브 라우트 명세.
 */
export type VrmCharacterSubRouteId = "overview" | "edit" | "photobooth" | "tracking" | "embed" | "license";

export interface VrmCharacterSubRouteSpec {
  readonly id: VrmCharacterSubRouteId;
  readonly vroidRoutePattern: string;
  readonly koLabel: string;
  readonly enLabel: string;
  readonly workbenchTab: "quality" | "presets" | "pose" | "groom" | "ink" | "render" | "runtime";
}

export const VRM_CHARACTER_SUB_ROUTES: readonly VrmCharacterSubRouteSpec[] = Object.freeze([
  { id: "overview", vroidRoutePattern: "/characters/[characterId]/models/[modelId]", koLabel: "3D 모델 개요", enLabel: "3D Overview", workbenchTab: "quality" },
  { id: "edit", vroidRoutePattern: "/characters/[characterId]/models/[modelId]/edit", koLabel: "체형·의상·헤어 편집", enLabel: "Edit Parts & Groom", workbenchTab: "presets" },
  { id: "photobooth", vroidRoutePattern: "/characters/[characterId]/models/[modelId]/photobooth", koLabel: "포토부스·툰 렌더", enLabel: "Photobooth & Toon Render", workbenchTab: "render" },
  { id: "tracking", vroidRoutePattern: "/characters/[characterId]/models/[modelId]/tracking", koLabel: "AI 포즈·시선 트래킹", enLabel: "Pose & Gaze Tracking", workbenchTab: "pose" },
  { id: "embed", vroidRoutePattern: "/characters/[characterId]/models/[modelId]/embed", koLabel: "3D 서피스 펜선·오버레이", enLabel: "3D Surface Pen & Overlay", workbenchTab: "ink" },
  { id: "license", vroidRoutePattern: "/license", koLabel: "VRM 이용권한·웹툰 연재 라이선스", enLabel: "VRM Usage & Serial License", workbenchTab: "runtime" },
]);

/**
 * VRoid Hub `/license` & BOOTH 3D Models 이용 조건 매트릭스.
 */
export interface VrmUsageConditionMatrix {
  readonly presetId: "webtoon-serial-ready" | "open-cc-by" | "personal-noncommercial" | "studio-exclusive";
  readonly koTitle: string;
  readonly enTitle: string;
  readonly avatarUse: "everyone" | "author-only";
  readonly commercialWebtoonSerial: boolean;
  readonly corporateCommercialUse: boolean;
  readonly violentSceneAllowed: boolean;
  readonly modificationAllowed: boolean;
  readonly redistributionAllowed: boolean;
  readonly creditRequired: boolean;
}

export const VRM_LICENSE_PRESETS: readonly VrmUsageConditionMatrix[] = Object.freeze([
  {
    presetId: "webtoon-serial-ready",
    koTitle: "웹툰 상업 연재 표준 (권장)",
    enTitle: "Commercial Webtoon Serial Standard",
    avatarUse: "everyone",
    commercialWebtoonSerial: true,
    corporateCommercialUse: true,
    violentSceneAllowed: true,
    modificationAllowed: true,
    redistributionAllowed: false,
    creditRequired: false,
  },
  {
    presetId: "open-cc-by",
    koTitle: "크리에이터 공유 (출처 표기·개작 허용)",
    enTitle: "Creator Open Share (Attribution)",
    avatarUse: "everyone",
    commercialWebtoonSerial: true,
    corporateCommercialUse: false,
    violentSceneAllowed: true,
    modificationAllowed: true,
    redistributionAllowed: true,
    creditRequired: true,
  },
  {
    presetId: "personal-noncommercial",
    koTitle: "개인 비상업·습작 전용",
    enTitle: "Personal Non-Commercial Study",
    avatarUse: "everyone",
    commercialWebtoonSerial: false,
    corporateCommercialUse: false,
    violentSceneAllowed: false,
    modificationAllowed: true,
    redistributionAllowed: false,
    creditRequired: true,
  },
  {
    presetId: "studio-exclusive",
    koTitle: "스튜디오 독점 캐릭터 (본인 전용)",
    enTitle: "Studio Exclusive (Author Only)",
    avatarUse: "author-only",
    commercialWebtoonSerial: true,
    corporateCommercialUse: true,
    violentSceneAllowed: true,
    modificationAllowed: true,
    redistributionAllowed: false,
    creditRequired: false,
  },
]);

export function summarizeVrmUsageMatrix(matrix: VrmUsageConditionMatrix): readonly {
  readonly id: string;
  readonly koLabel: string;
  readonly allowed: boolean;
}[] {
  return [
    { id: "serial", koLabel: matrix.commercialWebtoonSerial ? "상업 웹툰 연재 허용" : "비상업 습작 전용", allowed: matrix.commercialWebtoonSerial },
    { id: "corp", koLabel: matrix.corporateCommercialUse ? "프로덕션·법인 사용 가능" : "개인 작가 한정", allowed: matrix.corporateCommercialUse },
    { id: "mod", koLabel: matrix.modificationAllowed ? "체형·리깅·펜선 개작 허용" : "원본 유지 필수", allowed: matrix.modificationAllowed },
    { id: "action", koLabel: matrix.violentSceneAllowed ? "액션·전투 연출 허용" : "전투·폭력 연출 제한", allowed: matrix.violentSceneAllowed },
    { id: "credit", koLabel: matrix.creditRequired ? "크레딧 표기 필수" : "크레딧 표기 면제", allowed: !matrix.creditRequired },
  ];
}

/**
 * Pixiv Comic `/finish_reading/[sku]` + Clip Studio 4단계 제작 가이드 + VRoid Studio 온보딩을 결합한
 * 단계별 연관 동선 브리지(Onward Route Bridge).
 */
export type CreatorWorkflowStageId = "preset" | "groom" | "pose" | "ink" | "render";

export interface CreatorOnwardBridgeRoute {
  readonly id: string;
  readonly href: string;
  readonly koLabel: string;
  readonly enLabel: string;
  readonly competitorInspiration: CompetitorPlatformId;
}

export function resolveCreatorPostActionBridgeRoutes(stage: CreatorWorkflowStageId): readonly CreatorOnwardBridgeRoute[] {
  switch (stage) {
    case "preset":
      return [
        { id: "to-groom", href: "/studio/assets/characters/new?editor=open&stage=groom", koLabel: "헤어 번들 식모로 이동", enLabel: "Next: Hair Bundle Grooming", competitorInspiration: "vroid-studio" },
        { id: "to-market", href: "/marketplace", koLabel: "BOOTH·3D 캐릭터 소재 탐색", enLabel: "Browse 3D Character Assets", competitorInspiration: "booth-3d" },
      ];
    case "groom":
      return [
        { id: "to-pose", href: "/studio/assets/characters/new?editor=open&stage=pose", koLabel: "AI 24관절 포즈 트래킹으로 이동", enLabel: "Next: 24-Joint Pose Tracking", competitorInspiration: "vroid-hub" },
        { id: "to-ink", href: "/studio/assets/characters/new?editor=open&stage=ink", koLabel: "3D 서피스 직접 펜선 그리기", enLabel: "Draw 3D Surface Pen Lines", competitorInspiration: "clip-studio" },
      ];
    case "pose":
      return [
        { id: "to-ink", href: "/studio/assets/characters/new?editor=open&stage=ink", koLabel: "3D 서피스 펜선·의상 마스킹", enLabel: "Next: 3D Surface Ink & Masking", competitorInspiration: "clip-studio" },
        { id: "to-cuts", href: "/cuts/studio", koLabel: "컷츠 스튜디오에 포즈 배치", enLabel: "Send Pose to Cuts Studio", competitorInspiration: "naver-webtoon" },
      ];
    case "ink":
      return [
        { id: "to-render", href: "/studio/assets/characters/new?editor=open&stage=render", koLabel: "포토부스·레이어 PSD 내보내기", enLabel: "Next: Photobooth & Layered PSD", competitorInspiration: "vroid-hub" },
        { id: "to-studio", href: "/studio", koLabel: "원고 캔버스에 컷 삽입", enLabel: "Insert into Webtoon Canvas", competitorInspiration: "clip-studio" },
      ];
    case "render":
      return [
        { id: "to-studio", href: "/studio", koLabel: "본편 원고 스튜디오로 삽입", enLabel: "Open in Main Webtoon Studio", competitorInspiration: "clip-studio" },
        { id: "to-cuts", href: "/cuts/studio", koLabel: "숏폼 컷츠 예고편 제작", enLabel: "Create Short-form Cuts Trailer", competitorInspiration: "naver-webtoon" },
        { id: "to-showcase", href: "/showcase", koLabel: "창작 갤러리에 캐릭터 공개", enLabel: "Publish to Creator Showcase", competitorInspiration: "pixiv-comic" },
      ];
  }
}

/**
 * Modern Web Guidance (`same-document-transitions`):
 * `document.startViewTransition`을 점진적 향상(Progressive Enhancement)으로 감싸고
 * `prefers-reduced-motion: reduce` 환경을 존중한다.
 */
export function runSameDocumentViewTransition(updateCallback: () => void): void {
  if (typeof document === "undefined") {
    updateCallback();
    return;
  }
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    updateCallback();
    return;
  }
  const docWithTransition = document as Document & {
    startViewTransition?: (callback: () => void) => unknown;
  };
  if (typeof docWithTransition.startViewTransition === "function") {
    docWithTransition.startViewTransition(() => {
      updateCallback();
    });
    return;
  }
  updateCallback();
}
