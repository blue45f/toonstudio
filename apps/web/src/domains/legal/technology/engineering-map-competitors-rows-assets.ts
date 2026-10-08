import { D, row, t } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 마켓·소재·창작자 지원 영역 중 ‘소재 마켓과 소재 라이브러리’.
 * 학습·조사·의뢰·보조 도구 같은 창작자 지원은 engineering-map-competitors-rows-creator-support.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 *
 * 마켓 문서의 ‘적용’ 칸은 ToonStudio의 설계 판단이지 경쟁 품질의 순위가 아니다. 수수료율·할인율 같은 수치는 자체 설계값이라 싣지 않는다.
 * 무료 소재 라이브러리(Poly Haven·ambientCG)의 연동 행은 오픈 데이터·API 지도에 따로 있다.
 */

const FIT = "docs/benchmarks/market-production-fit-2026-09-09.md";
const SOCIAL = "docs/benchmarks/marketplace-social-studio-integration-2026-09-04.md";
const ECOSYSTEM = "docs/webtoon-marketplace-ecosystem-benchmark-2026-09-03.md";
const QUALITY = "docs/studio-asset-quality-benchmark-20260906.md";
const LIBRARY_UPGRADE = "docs/studio-asset-library-upgrade-20260913.md";
const DOMAIN_SPEC = "docs/superpowers/specs/2026-08-23-market-domain-design.md";
const EXPERIENCE = "docs/reports/market-assets-experience-20260928.md";
const COMPETITOR_REGISTRY = "docs/benchmarks/studio-competitor-registry.json";
const MARKET = "apps/web/src/domains/market";

export const COMPETITOR_ROWS_ASSETS: readonly EngineeringMapRow[] = [
  row({
    id: "clip-studio-assets",
    name: "Clip Studio Assets",
    domain: D.market,
    url: "https://assets.clip-studio.com/",
    what: t(
      "Clip Studio용 소재(브러시·3D 등)를 받는 마켓입니다. 팔레트·소재 종류에 맞춘 탐색, 즐겨찾기와 재다운로드, 지원 버전 확인이 비교 대상이었고, Unity Asset Store·Fab·3D Warehouse도 같은 문서에서 비교했습니다.",
      "A marketplace for Clip Studio materials such as brushes and 3D assets. Browsing by palette and material kind, favorites and re-download, and supported-version checks were compared, alongside Unity Asset Store, Fab and 3D Warehouse in the same document.",
    ),
    learned: t(
      "배움: 쓰는 환경(버전·렌더러)을 먼저 밝히고 카드와 상세에서 같은 판정을 재사용. 안 한 점: 패스포트가 설치 성공·적법성을 보증한다고 말하지 않고, 다운로드·변환·삽입 일괄 처리는 후속으로 남김.",
      "Learned: declare the target Studio version and renderer first, and reuse one verdict on cards and detail pages. Not adopted: a passport is not a guarantee of installation or legality, and one-step download, convert and insert is left for later.",
    ),
    overlap: t("마켓의 제작 적합성 패스포트와 제작 적합성 랩.", "Market production-fit passport and fit lab."),
    evidence: [FIT, SOCIAL, QUALITY, DOMAIN_SPEC, `${MARKET}/models/market-production-fit.ts`],
  }),
  row({
    id: "unity-asset-store",
    name: "Unity Asset Store",
    domain: D.market,
    url: "https://assetstore.unity.com/",
    what: t(
      "Unity용 에셋 마켓입니다. 저장소 문서는 내 에셋 검색·필터, 다운로드와 가져오기의 분리, 항목 선택 가져오기, 진행 중 일시정지·재개·취소, 업데이트 확인, 게시자 검증 도구를 비교했습니다.",
      "The asset marketplace for Unity. The repository compared My Assets search and filters, splitting download from import, selective import, pause, resume and cancel in progress, update checks and publisher validation tools.",
    ),
    learned: t(
      "배움: 획득·적용 전에 manifest 검사를 명시적으로 분리하고, 게시자 권한은 서버에서 도출. 안 한 점: 다운로드·변환·삽입을 묶는 원자 트랜잭션은 후속으로 남기고 완료된 것처럼 표시하지 않음.",
      "Learned: separate the manifest check explicitly before acquiring or applying, and derive publisher authority on the server. Not adopted: an atomic download, convert and insert transaction is left for later and is not shown as done.",
    ),
    overlap: t("상세의 제작 적합성 사전 점검, 게시자 답변·신고.", "The production-fit preflight on detail pages, and publisher replies and reports."),
    evidence: [FIT, SOCIAL, `${MARKET}/models/market-production-fit.ts`, `${MARKET}/components/MarketProductionFitWorkbench.tsx`],
  }),
  row({
    id: "fab",
    name: "Fab",
    domain: D.market,
    url: "https://www.fab.com/",
    what: t(
      "Epic Games의 에셋 마켓입니다. 저장소 문서는 웹·런처·엔진을 잇는 탐색, 파일 형식 선택, 자산 유형별 동작(다운로드·프로젝트에 추가·플러그인 설치), 다운로드 관리자, 변경 기록·평점·댓글을 정리했습니다.",
      "Epic Games' asset marketplace. The repository noted browsing across web, launcher and engine, file-format choice, actions per asset type (download, add to project, install plugin), a download manager, changelogs, ratings and comments.",
    ),
    learned: t(
      "배움: 전달 방식(builtin-ref, portable-json, procedural-recipe)을 판정 근거로 드러내고 독립 portable 패키지만 허용하는 제작 정책을 제공. 미리보기·사양·소장·릴리스 이력·신고·Studio 연결을 한 상세 동선에 둠.",
      "Learned: expose the delivery mode (builtin-ref, portable-json, procedural-recipe) as evidence in the verdict and offer a portable-only policy. Preview, spec, library, release history, reporting and Studio hand-off sit in one detail journey.",
    ),
    overlap: t("마켓 상세의 제작 적합성 판정, 3D 스펙 검사기와 뷰어.", "The production-fit verdict on market detail pages, and the 3D spec inspector and viewer."),
    evidence: [FIT, SOCIAL, ECOSYSTEM, EXPERIENCE, `${MARKET}/models/market-webtoon-spec-inspector.ts`, `${MARKET}/components/MarketWebtoon3dViewerModal.tsx`],
  }),
  row({
    id: "sketchup-3d-warehouse",
    name: "SketchUp 3D Warehouse",
    domain: D.market,
    url: "https://3dwarehouse.sketchup.com/",
    what: t(
      "SketchUp의 3D 모델 공유 저장소입니다. 저장소 문서는 컬렉션과 카탈로그로 반복 탐색하고 카탈로그 수준에서 콘텐츠를 관리·분석하는 방식을 비교했습니다.",
      "SketchUp's 3D model sharing repository. The repository compared repeat browsing through collections and catalogs, and catalog-level content management and analytics.",
    ),
    learned: t(
      "배움: 목록을 최신순으로만 두지 않고 사용자가 선언한 제작 조건으로 재정렬하며 상태 필터로 반복 탐색. 안 한 점: 팀 컬렉션과 권한 공유는 후속 범위(MKT-08)로 남김.",
      "Learned: do not stop at newest-first; re-rank by declared production conditions and revisit with status filters. Not adopted: team collections and permission sharing stay in a later scope (MKT-08).",
    ),
    overlap: t("마켓의 제작 조건 재정렬(/market/fit).", "Re-ranking by production conditions in the market (/market/fit)."),
    evidence: [FIT, `${MARKET}/models/market-production-fit.ts`],
  }),
  row({
    id: "sketchfab",
    name: "Sketchfab",
    domain: D.market,
    url: "https://sketchfab.com/",
    what: t(
      "3D 모델을 올리고 돌려 보는 마켓·뷰어 서비스입니다. 레지스트리는 3D 마켓·뷰어·다운로드·라이선스·PBR에 주목했고, 마켓 문서는 Fab·Unity Asset Store와 묶어 회전 뷰어와 기술 사양 보기를 정리했습니다.",
      "A market and viewer service for 3D models. The registry noted 3D market, viewer, download, license and PBR, and the market document grouped it with Fab and Unity Asset Store for rotating viewers and technical-spec views.",
    ),
    learned: t(
      "배움(제품군 기록): 360도 회전·와이어프레임 보기와 삼각형·정점 수, 텍스처 해상도 같은 기술 사양을 상세에서 보여 줌. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (group-level record): show a 360-degree turntable, wireframe view and technical specs such as triangle and vertex counts and texture resolution on the detail page. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("마켓 3D 뷰어 모달과 스펙 검사기.", "The market 3D viewer modal and spec inspector."),
    evidence: [ECOSYSTEM, COMPETITOR_REGISTRY, `${MARKET}/components/MarketWebtoon3dViewerModal.tsx`, `${MARKET}/models/market-webtoon-spec-inspector.ts`],
  }),
  row({
    id: "artstation",
    name: "ArtStation",
    domain: D.market,
    url: "https://www.artstation.com/marketplace",
    urlTitle: "ArtStation Marketplace",
    what: t(
      "아트 포트폴리오와 마켓을 가진 서비스입니다. 레지스트리는 마켓(창작자 마켓·브러시·3D·튜토리얼·라이선스)을 감시 목록에 올렸고, 프로필 벤치마크는 대표 작품 패턴의 예로 들었습니다.",
      "A service with art portfolios and a marketplace. The registry lists its marketplace (creator market, brushes, 3D, tutorials, licenses) on the watch list, and the profile benchmark cites it as an example of the featured-work pattern.",
    ),
    learned: t(
      "배움(프로필): 대표 작품을 공개 참여도로 최대 3개 자동 선정하고, 반복되는 태그에서 전문 분야 칩을 뽑음. 마켓 쪽은 감시 목록(우선순위 P1) 수준이며 직접 비교한 기록은 없음.",
      "Learned (profiles): pick up to three featured works from public engagement and derive specialty chips from recurring tags. The marketplace side is only on the watch list (priority P1) with no direct comparison on record.",
    ),
    overlap: t("크리에이터 프로필의 대표 작품·전문 분야 칩.", "Featured works and specialty chips on creator profiles."),
    evidence: ["docs/profile-benchmark-2026-09.md", COMPETITOR_REGISTRY, "apps/web/src/domains/account/creator-profile-showcase.ts"],
  }),
  row({
    id: "blenderkit",
    name: "BlenderKit",
    domain: D.market,
    url: "https://www.blendkit.com/",
    what: t(
      "Blender 안에서 검색·획득·삽입까지 하는 3D 모델·재질 마켓입니다. 저장소 문서는 평점에 품질과 절약한 작업 시간을 담는 점, 제작자가 댓글과 검증 피드백을 받는 점, CC0와 로열티 프리 구분을 비교했습니다.",
      "A 3D model and material marketplace used from inside Blender. The repository compared ratings that capture quality and time saved, creators receiving comments and validation feedback, and the CC0 versus royalty-free split.",
    ),
    learned: t(
      "배움: 실제 Studio 설치 확인을 리뷰 자격의 가장 강한 조건으로 삼고 토론을 릴리스가 바뀌어도 패키지 단위로 이음. 로열티 프리 상품은 자동 재배포하지 않고 소재별 권리를 표시.",
      "Learned: treat an actual Studio install confirmation as the strongest reviewer qualification and keep discussion at package level across releases. Royalty-free items are not redistributed automatically and rights are shown per asset.",
    ),
    overlap: t("마켓 리뷰·댓글과 설치 확인 동선.", "Market reviews, comments and the install-confirmation journey."),
    evidence: [SOCIAL, QUALITY, LIBRARY_UPGRADE, `${MARKET}/components/MarketReviewsSection.tsx`, `${MARKET}/components/MarketInstallJourney.tsx`],
  }),
  row({
    id: "blender-market",
    name: "Blender Market",
    domain: D.market,
    url: "https://superhivemarket.com/",
    urlTitle: "Superhive Market (formerly Blender Market)",
    what: t(
      "Blender 소재를 파는 유료 마켓입니다. 마켓 설계 문서가 ‘Gumroad/Blender Market’이라고 묶어 적었으며, 지금 공식 주소는 Superhive Market으로 이어집니다.",
      "A paid marketplace for Blender assets. The market design document names it together with Gumroad, and its official address now leads to Superhive Market.",
    ),
    learned: t(
      "결론: 유료 결제는 마켓 1차 범위에서 제외(백엔드가 무료 접근으로 고정). 도입하지 않음.",
      "Conclusion: paid checkout is out of the market's first scope (the backend fixes access to free). Not adopted.",
    ),
    overlap: t("겹치는 기능 없음(1차 범위 제외 사례로만 기록).", "No overlapping feature (recorded only as an out-of-scope case)."),
    evidence: [DOMAIN_SPEC],
  }),
  row({
    id: "poly-haven",
    name: "Poly Haven",
    domain: D.market,
    url: "https://polyhaven.com/",
    what: t(
      "CC0(저작권 포기) 3D 모델·재질·HDRI를 모은 무료 라이브러리입니다. 저장소 문서는 자산 제작 기준과, 사이트 콘텐츠와 API 약관이 따로 있다는 점을 정리했습니다.",
      "A free library of CC0 (public-domain dedication) 3D models, materials and HDRIs. The repository noted its asset-making standards and that site content and API terms are separate.",
    ),
    learned: t(
      "채택: CC0 소재의 취득원으로 쓰되 사이트를 긁어 오지 않고 API 약관을 따로 확인, 미리보기·메타데이터만 저장. 실사 자산은 웹툰 선화·셰이딩 검증 뒤에 사용.",
      "Adopted: used as a CC0 source without scraping the site, with API terms checked separately and only previews and metadata stored. Photoreal assets are used only after line-art and shading checks for webtoons.",
    ),
    overlap: t("소재 라이브러리의 CC0 3D·재질(PolyHaven 제공자).", "CC0 3D and materials in the asset library (the Poly Haven provider)."),
    evidence: [QUALITY, LIBRARY_UPGRADE, "apps/web/src/domains/creator-resources/polyhaven-resource.ts", "apps/api/src/modules/creator-resources/polyhaven-provider.ts"],
  }),
  row({
    id: "ambientcg",
    name: "ambientCG",
    domain: D.market,
    url: "https://ambientcg.com/",
    what: t(
      "CC0 PBR 재질을 여러 해상도와 구성 맵으로 내려받게 하는 무료 라이브러리입니다.",
      "A free library of CC0 PBR materials offered in several resolutions and component maps.",
    ),
    learned: t(
      "배움: 재질의 실제 반복 크기·이음새·모아레를 검수하고 여러 맵을 하나의 소재로 셈. 채택: 2K 재질 두 개(Wood095·Fabric066)를 격리 수집 대상으로 골랐고 연동 제공자도 있음.",
      "Learned: review a material's real tile size, seams and moire, and count the maps as one asset. Adopted: two 2K materials (Wood095, Fabric066) were chosen for quarantined collection, and a provider exists.",
    ),
    overlap: t("에셋 확보 기준의 격리 수집기와 ambientCG 제공자.", "The quarantined collector from the asset-sourcing standard, and the ambientCG provider."),
    evidence: [QUALITY, LIBRARY_UPGRADE, "apps/api/src/modules/creator-resources/ambientcg-provider.ts", "scripts/acquire_studio_asset_pilot.py"],
  }),
  row({
    id: "kenney",
    name: "Kenney",
    domain: D.market,
    url: "https://kenney.nl/",
    what: t(
      "일관된 단순화 3D 소품과 효과 마스크를 내는 무료 에셋 사이트입니다.",
      "A free asset site offering consistent, simplified 3D props and effect masks.",
    ),
    learned: t(
      "배움: 저폴리 소품은 제한된 스타일 컬렉션의 보조 재료로만 쓰고 웹툰 대표 품질로 삼지 않음. 가구·음식·파티클 세 팩을 소규모 격리 수집 대상으로 골랐고, 512px 파티클은 작은 효과용으로만 표시.",
      "Learned: use low-poly props only as supporting material in a limited style collection, not as the webtoon quality bar. Three packs (furniture, food, particles) were chosen for small quarantined collection, and 512px particles are labelled small-effect only.",
    ),
    overlap: t("에셋 확보 기준의 격리 수집 계획.", "The quarantined collection plan of the asset-sourcing standard."),
    evidence: [QUALITY, LIBRARY_UPGRADE, "data/studio-assets/acquisition-plan.json"],
  }),
  row({
    id: "quaternius",
    name: "Quaternius",
    domain: D.market,
    url: "https://quaternius.com/",
    what: t(
      "스타일이 통일된 자연·모듈형 건축·장르별 팩과 모듈형 캐릭터를 내는 무료 에셋 사이트입니다.",
      "A free asset site offering style-consistent nature, modular architecture and genre packs, plus modular characters.",
    ),
    learned: t(
      "채택: 모듈형 판타지 캐릭터에 VRM 메타데이터를 입혀 번들한 카탈로그가 있음. 무료 판만 쓰고 유료 팩은 구입하지 않음.",
      "Adopted: a catalog bundles its modular fantasy characters with added VRM metadata. Only the free edition is used and paid packs are not purchased.",
    ),
    overlap: t("VRM 모듈형 캐릭터 카탈로그(quaternius-modular-catalog).", "The VRM modular character catalog (quaternius-modular-catalog)."),
    evidence: [QUALITY, "apps/web/src/domains/creator/vrm/quaternius-modular-catalog.ts", "scripts/package-quaternius-fantasy-vrm-v1.mjs"],
  }),
  row({
    id: "gumroad",
    name: "Gumroad",
    domain: D.market,
    url: "https://gumroad.com/",
    what: t(
      "창작자가 디지털 상품을 직접 파는 서비스입니다. 마켓 문서는 정산 계산기의 벤치마크로 포스타입과 함께 적었고, 마켓 설계 1차에서는 유료 결제를 제외했습니다.",
      "A service where creators sell digital goods directly. The market document named it with Postype as the benchmark for the payout calculator, while the first market design excluded paid checkout.",
    ),
    learned: t(
      "배움: 판매자가 플랫폼·결제 수수료와 세금을 뺀 실수령액을 미리 계산해 보는 투명한 정산. 주의: 계산기의 수수료율은 ToonStudio가 정한 설계값이며 이 서비스의 실제 요율이 아님.",
      "Learned: transparent payouts where sellers preview take-home pay after platform and payment fees and tax. Caution: the calculator's rates are ToonStudio's own design values, not this service's real rates.",
    ),
    overlap: t("마켓 크리에이터 정산 계산기(market-creator-revenue-calculator).", "The market creator payout calculator (market-creator-revenue-calculator)."),
    evidence: [ECOSYSTEM, DOMAIN_SPEC, `${MARKET}/models/market-creator-revenue-calculator.ts`],
  }),
  row({
    id: "figma-community",
    name: "Figma Community",
    domain: D.market,
    url: "https://www.figma.com/community",
    what: t(
      "Figma 사용자가 템플릿과 컴포넌트를 공유하는 곳입니다. 저장소 문서는 리소스 종류 탭, 미리보기 카드 그리드, 창작자 귀속, ‘앱에서 사용’이 첫 행동인 구성을 비교했습니다.",
      "Where Figma users share templates and components. The repository compared its resource-type tabs, preview card grid, creator attribution and 'use in the app' as the primary action.",
    ),
    learned: t(
      "배움: 리소스마다 라이선스가 다르다는 점을 상세에 드러내고 레이어·컴포넌트 구조와 편집성을 기준으로 삼음. 가져온 SVG의 출처만으로 네이티브 편집성을 주장하지 않음.",
      "Learned: show on the detail page that each resource has its own license, and judge by layer and component structure and editability. An imported SVG's origin alone is never claimed as native editability.",
    ),
    overlap: t("마켓 카드·상세의 라이선스·출처 표시와 ‘앱으로 열기’ 동선.", "License and attribution display on market cards and detail pages, and the open-in-app journey."),
    evidence: [DOMAIN_SPEC, QUALITY, `${MARKET}/components/MarketResourceCard.tsx`, `${MARKET}/components/MarketResourceDetailArticle.tsx`],
  }),
  row({
    id: "pixiv-booth",
    name: "Pixiv BOOTH",
    domain: D.market,
    url: "https://booth.pm/ja",
    urlTitle: "BOOTH",
    what: t(
      "픽시브의 창작물 판매 서비스입니다. 마켓 문서는 판매자가 실수령액을 미리 계산해 보는 투명 정산, 구매자가 얹는 후원금(팁), VRM 아바타·포즈 소재의 유통을 정리했습니다.",
      "Pixiv's storefront for creative goods. The market document noted transparent payout previews for sellers, tips buyers can add, and distribution of VRM avatars and pose assets.",
    ),
    learned: t(
      "배움: 후원금을 플랫폼 수수료 없이 작가에게 전달하는 개념과 용도별 라이선스 티어. 주의: 문서의 수수료·세금 수치는 ToonStudio가 정한 설계값이며 BOOTH의 실제 요율이 아님.",
      "Learned: tips pass to the author without a platform fee, plus per-use license tiers. Caution: the fee and tax figures in the document are ToonStudio's own design values, not BOOTH's real rates.",
    ),
    overlap: t("마켓 웹툰 라이선스 티어와 정산 계산기.", "The market webtoon license tiers and payout calculator."),
    evidence: [ECOSYSTEM, `${MARKET}/models/market-webtoon-licensing.ts`, `${MARKET}/models/market-creator-revenue-calculator.ts`],
  }),
  row({
    id: "postype",
    name: "Postype",
    domain: D.market,
    url: "https://www.postype.com/",
    what: t(
      "국내 창작자 콘텐츠·후원 플랫폼(한글 상호 ‘포스타입’)입니다. 마켓 문서는 정산·후원 구조를, 창작자 허브 문서는 외부 영상 연결과 임베드 제한 시 원본 링크로 보내는 방식을 비교했습니다.",
      "A Korean creator content and support platform (known in Korean as 'Postype'). The market document compared its payout and support structure, and the creator-hub document its external video links and falling back to the original link when embedding is restricted.",
    ),
    learned: t(
      "배움: 임베드가 막히면 원본 서비스 링크로 이동. 업로드 규격(postype)은 1차 출처를 찾지 못해 값을 지어내지 않고 미검증으로 표시.",
      "Learned: link to the original service when embedding is blocked. Its upload spec (postype) had no primary source, so no value was invented and it is marked unverified.",
    ),
    overlap: t("홍보 커뮤니티의 영상 링크(PromotionVideo)와 규격 검사기(postype).", "Video links in the promotion community (PromotionVideo) and the spec validator (postype)."),
    evidence: [
      ECOSYSTEM,
      "docs/creator-hub-implementation-20260913.md",
      "docs/webtoon-companion-apps-benchmark-2026-09-03.md",
      "apps/web/src/domains/promotion/PromotionVideo.tsx",
    ],
  }),
  row({
    id: "itch-io",
    name: "itch.io",
    domain: D.market,
    url: "https://itch.io/",
    what: t(
      "인디 게임·창작물 배포 마켓입니다. 저장소 문서는 계정 기반 댓글 스레드, 투표, 프로젝트 커뮤니티, 창작자가 독자 피드백을 받는 방식을 비교했습니다.",
      "A marketplace for indie games and creative works. The repository compared account-based comment threads, voting, project communities and creators receiving audience feedback.",
    ),
    learned: t(
      "배움: 로그인한 계정으로만 쓰는 상품 Q&A(한 단계 답글), 지속되는 반응, 게시자 배지. 닉네임만 입력하면 구매자처럼 보이던 브라우저 로컬 댓글은 서버 기반으로 바꿈.",
      "Learned: product Q&A written only by signed-in accounts (one reply level), persistent reactions and publisher badges. Browser-local comments, where a typed nickname could look like a buyer, were replaced by server-backed ones.",
    ),
    overlap: t("마켓 댓글·리뷰 섹션의 서버 계정 작성자와 배지.", "Server-account authorship and badges in market comments and reviews."),
    evidence: [SOCIAL, `${MARKET}/components/MarketCommentsSection.tsx`, `${MARKET}/components/MarketReviewsSection.tsx`],
  }),
  row({
    id: "cgtrader",
    name: "CGTrader",
    domain: D.market,
    url: "https://www.cgtrader.com/",
    what: t(
      "3D 모델 마켓입니다. 저장소 문서는 구매한 사용자만 긍정·부정 리뷰를 남기고 판매자가 피드백을 운영에 쓰는 방식을 비교했습니다.",
      "A 3D model marketplace. The repository compared purchasers leaving positive or negative reviews and sellers using the feedback operationally.",
    ),
    learned: t(
      "배움: 점수마다 제목과 실질적인 본문을 요구하고 운영 노출을 유지하며, 점수 집계와 제목 있는 리뷰를 따로 보여 줌.",
      "Learned: require a title and a substantive body for every score, keep moderation visibility, and show aggregate signals apart from titled reviews.",
    ),
    overlap: t("마켓 리뷰 섹션의 점수·본문 규칙.", "Score and body rules in the market reviews section."),
    evidence: [SOCIAL, `${MARKET}/components/MarketReviewsSection.tsx`],
  }),
  row({
    id: "eagle",
    name: "Eagle",
    domain: D.market,
    url: "https://en.eagle.cool/",
    what: t(
      "에셋을 수집·분류·검색·미리보기하는 라이브러리 관리 앱입니다.",
      "A library-management app for collecting, sorting, searching and previewing assets.",
    ),
    learned: t(
      "배움: 이름·종류·패키지·버전 검색, 상태별 빠른 필터, 정렬, 카드·목록 보기를 내 에셋 탐색에 적용. 외형 복제나 기능 전체 구현은 주장하지 않음.",
      "Learned: name, kind, package and version search, quick status filters, sorting and card or list views for browsing one's own assets. No copied look or full feature parity is claimed.",
    ),
    overlap: t("내 에셋 라이브러리 탐색(market-library-explorer).", "Browsing one's own asset library (market-library-explorer)."),
    evidence: [EXPERIENCE, `${MARKET}/models/market-library-explorer.ts`, `${MARKET}/components/MarketLibraryExplorerToolbar.tsx`],
  }),
];
