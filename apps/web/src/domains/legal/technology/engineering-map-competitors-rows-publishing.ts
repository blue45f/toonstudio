import { CREATOR, D, row, t, watch } from "./engineering-map-competitors-kit";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 경쟁·참고 제품 지도의 행 — 웹툰 유통·생태계 영역의 추가분(국내 발행 플랫폼, 발견·기록 서비스, 해외 플랫폼).
 * 앞부분의 WEBTOON CANVAS·Tapas·Laftel·AniList·Letterboxd·Trakt 등은 engineering-map-competitors-rows-market.ts 에 있다.
 * 쓰는 규칙은 engineering-map-competitors-kit.ts 머리말을 따른다.
 *
 * 국내 플랫폼은 경쟁 분석 문서가 ‘경쟁자가 아니라 데이터 소스이자 연결 대상’으로 정리한 곳이다.
 * 근거 문서(competitor-analysis)는 2026-05 기준이라 ‘참고한 것’으로만 읽어야 하며,
 * 문서가 적은 시장 평가(별점이 무너졌다 등)는 이 지도에 옮기지 않는다.
 */

const ANALYSIS = "docs/competitor-analysis.md";
const DIFFERENTIATION = "DIFFERENTIATION.md";
const COMPANION = "docs/webtoon-companion-apps-benchmark-2026-09-03.md";
const PLATFORMS = "packages/core/src/platforms.ts";
const VALIDATOR = `${CREATOR}/assistant/webtoon-platform-spec-validator.ts`;
const CATALOG = "apps/web/src/domains/catalog";

export const COMPETITOR_ROWS_PUBLISHING: readonly EngineeringMapRow[] = [
  row({
    id: "naver-webtoon",
    name: "NAVER WEBTOON",
    domain: D.publishing,
    url: "https://comic.naver.com/",
    what: t(
      "국내 웹툰 플랫폼입니다. 저장소 경쟁 분석은 이를 경쟁자가 아니라 데이터 소스이자 ‘어디서 볼지’ 연결 대상으로 두고, 요일별 연재·도전만화·화별 댓글 문화를 정리했습니다.",
      "A Korean webtoon platform. The repository's competitor analysis treats it as a data source and where-to-read link target rather than a rival, and noted weekday serials, the challenge-comics entry path and per-episode comments.",
    ),
    learned: t(
      "배움: 업로드 규격 검사기에 넣되 공식 페이지를 열람하지 못해, 폭 690px·JPG만 공모전 자료로 교차 확인하고 나머지는 ‘저신뢰’로 표시. 별점 신뢰 같은 시장 평가는 옮기지 않음.",
      "Learned: fed into the upload-spec validator; because the official page could not be read, only the 690px width and JPG were cross-checked against contest material and the rest is labelled low-confidence. Market judgments such as rating trust are not repeated.",
    ),
    overlap: t("플랫폼 규격 검사기(naver-webtoon)와 내보내기 프리셋.", "The platform spec validator (naver-webtoon) and the export presets."),
    evidence: [ANALYSIS, COMPANION, VALIDATOR, PLATFORMS],
  }),
  row({
    id: "naver-series",
    name: "Naver Series",
    domain: D.publishing,
    url: "https://series.naver.com/",
    what: t(
      "네이버의 만화·웹소설·전자책 스토어입니다. 경쟁 분석은 같은 작품의 원작 소설과 웹툰이 한 스토어에 있는 점, 화당 별점, 시간 단위 급상승 랭킹을 정리했습니다.",
      "Naver's store for comics, web novels and e-books. The competitor analysis noted original novels and webtoons of the same work under one roof, per-episode ratings and hourly rising rankings.",
    ),
    learned: t(
      "배움: 원작 소설·웹툰판·영상화의 관계를 데이터로 드러내는 각색 그래프의 필요(이곳은 같은 IP를 입점시키지만 관계를 데이터로 노출하지는 않는다고 문서가 적음). 근거는 2026-05 문서.",
      "Learned: the need for an adaptation graph that exposes source novel, webtoon and screen versions as data (the document says it hosts the same IP but does not expose the relation as data). Source is the 2026-05 document.",
    ),
    overlap: t("원작-각색 관계 그래프(adaptation-graph).", "The adaptation graph (adaptation-graph)."),
    evidence: [ANALYSIS, DIFFERENTIATION, "apps/web/src/shared/components/adaptation-graph.tsx", PLATFORMS],
  }),
  row({
    id: "kakaopage",
    name: "KakaoPage",
    domain: D.publishing,
    url: "https://page.kakao.com/",
    what: t(
      "카카오의 웹툰·웹소설 통합 서비스입니다. 경쟁 분석은 ‘기다리면 무료’ 모델(작품별 시간마다 무료 충전)이 대표적이라고 정리했습니다.",
      "Kakao's combined webtoon and web-novel service. The competitor analysis noted its wait-for-free model, in which each work recharges free access over time.",
    ),
    learned: t(
      "배움: 무료·기다무·대여·소장 같은 제공 형태를 작품 단위로 보여 주는 안내. 규격: 폭 720px는 외부 정리본이고 세로 길이는 사내 프리셋과 달라 두 값을 모두 보존.",
      "Learned: show access modes such as free, wait-for-free, rental and ownership per work. Spec: the 720px width comes from an outside summary and the height differs from the in-house preset, so both values are kept.",
    ),
    overlap: t("작품 상세의 제공처 표시와 플랫폼 규격 검사기(kakao-page).", "Where-to-read on work pages and the platform spec validator (kakao-page)."),
    evidence: [ANALYSIS, COMPANION, VALIDATOR, "apps/web/src/shared/components/availability.tsx"],
  }),
  row({
    id: "kakao-webtoon",
    name: "Kakao Webtoon",
    domain: D.publishing,
    url: "https://webtoon.kakao.com/",
    what: t(
      "카카오의 웹툰 전용 서비스(옛 다음웹툰)입니다. 경쟁 분석은 #키워드 태그 탐색 도입과, 별점을 없애고 AI 추천으로 바꾼 점을 정리했습니다.",
      "Kakao's webtoon-only service (formerly Daum Webtoon). The competitor analysis noted its #keyword tag browsing and the switch from star ratings to AI recommendations.",
    ),
    learned: t(
      "배움: 같은 작품이 카카오페이지에도 동시에 연재되므로, 작품 하나를 한 항목으로 병합(이형 제목·연재처)하는 통합 작품 정본이 필요하다는 판단. 근거는 2026-05 문서.",
      "Learned: the same work is serialized on KakaoPage too, so one work must merge into one entry (variant titles, serial locations). Source is the 2026-05 document.",
    ),
    overlap: t("통합 카탈로그의 작품 병합과 제공처 표시.", "Work merging and where-to-read in the unified catalog."),
    evidence: [ANALYSIS, DIFFERENTIATION, PLATFORMS, "apps/web/src/shared/components/availability.tsx"],
  }),
  row({
    id: "ridi",
    name: "Ridi",
    domain: D.publishing,
    url: "https://ridibooks.com/comics/ebook",
    urlTitle: "Ridi comics",
    what: t(
      "웹툰·만화·웹소설·전자책 서비스입니다. 경쟁 분석은 장르·배경·소재·관계·분위기로 찾는 키워드 검색을 가장 눈에 띄는 차별점으로 적었습니다.",
      "A service for webtoons, comics, web novels and e-books. The competitor analysis called its keyword search by genre, setting, theme, relationship and mood the most distinctive point.",
    ),
    learned: t(
      "배움: 키워드 파인더 구조를 한 플랫폼에 가두지 않고 전 플랫폼 작품에 같은 태그 체계로 넓히는 방향. 근거는 2026-05 문서이며 이용 비율 같은 수치는 옮기지 않음.",
      "Learned: widen the keyword-finder structure beyond one platform with one tag system across all platforms. Source is the 2026-05 document, and usage-rate figures are not repeated.",
    ),
    overlap: t("태그 탐색 화면(TagsPage).", "The tag browsing page (TagsPage)."),
    evidence: [ANALYSIS, DIFFERENTIATION, `${CATALOG}/TagsPage.tsx`],
  }),
  row({
    id: "munpia",
    name: "Munpia",
    domain: D.publishing,
    url: "https://www.munpia.com/",
    what: t(
      "남성향 웹소설 연재 플랫폼입니다. 경쟁 분석은 자유연재에서 베스트리그, 작가 등용으로 이어지는 흐름과 선호작 수·조회·베스트 기반 랭킹 지표를 정리했습니다.",
      "A web-novel serialization platform led by male-oriented genres. The competitor analysis noted its path from free serial to best league to author recruitment, and rankings based on favorites, views and best lists.",
    ),
    learned: t(
      "배움: 플랫폼마다 다른 랭킹 지표를 한곳에서 견주되 산식을 공개하는 통합 랭킹의 필요. 근거는 2026-05 문서.",
      "Learned: the need for a unified ranking that compares each platform's different ranking signals in one place while publishing the formula. Source is the 2026-05 document.",
    ),
    overlap: t("투명 산식 다축 랭킹(RankingPage).", "The multi-axis ranking with a published formula (RankingPage)."),
    evidence: [ANALYSIS, DIFFERENTIATION, PLATFORMS, `${CATALOG}/RankingPage.tsx`],
  }),
  row({
    id: "joara",
    name: "Joara",
    domain: D.publishing,
    url: "https://www.joara.com/",
    what: t(
      "무료 연재로 오래된 웹소설 플랫폼입니다. 경쟁 분석은 팬픽·패러디·GL·로판·BL 같은 서브컬처 친화와 선호작·조회 기반 베스트를 정리했습니다.",
      "A long-running free web-novel platform. The competitor analysis noted its friendliness to subcultures such as fan fiction, parody, GL, romance fantasy and BL, and bests based on favorites and views.",
    ),
    learned: t(
      "배움(제품군 기록): 장르·연재 상태 중심 탐색을 통합 카탈로그 분류에 반영. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (group-level record): reflect genre and serial-status browsing in the unified catalog's classification. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("통합 카탈로그의 장르·연재 상태 탐색.", "Genre and serial-status browsing in the unified catalog."),
    evidence: [ANALYSIS, PLATFORMS],
  }),
  row({
    id: "novelpia",
    name: "Novelpia",
    domain: D.publishing,
    url: "https://novelpia.com/",
    what: t(
      "웹소설 플랫폼입니다. 경쟁 분석은 자체 태그 체계와, 화면에 보이는 조회수와 랭킹에 쓰는 정산 조회수가 달라 산식이 불투명하다는 점을 정리했습니다.",
      "A web-novel platform. The competitor analysis noted its own tag system and that displayed views differ from the settlement views used for ranking, which makes the formula opaque.",
    ),
    learned: t(
      "배움: 화면에 보이는 값과 순위 계산에 쓰는 값을 같게 하고 산식을 공개해 투명성을 신뢰 자산으로 삼음. 근거는 2026-05 문서.",
      "Learned: make displayed values and ranking inputs the same and publish the formula, so transparency becomes a trust asset. Source is the 2026-05 document.",
    ),
    overlap: t("랭킹 화면의 산식 공개(RankingPage, ranking.ts).", "Formula disclosure on the ranking page (RankingPage, ranking.ts)."),
    evidence: [ANALYSIS, DIFFERENTIATION, PLATFORMS, "apps/web/src/shared/lib/ranking.ts"],
  }),
  row({
    id: "bookcube",
    name: "BookCube",
    domain: D.publishing,
    url: "https://www.bookcube.com/main.asp",
    urlTitle: "BookCube",
    what: t(
      "중견 웹소설·전자책 플랫폼입니다. 경쟁 분석은 장르·랭킹 중심의 전형적인 스토어 구조를 정리했습니다.",
      "A mid-size web-novel and e-book platform. The competitor analysis noted a typical store structure organized by genre and ranking.",
    ),
    learned: t(
      "배움: 규모가 작은 플랫폼일수록 통합 검색에서 빠지기 쉬워, 롱테일 커버리지에 가치가 있다는 판단.",
      "Learned: smaller platforms are the easiest to miss in a unified search, so long-tail coverage has value.",
    ),
    overlap: t("통합 카탈로그의 플랫폼 커버리지.", "Platform coverage of the unified catalog."),
    evidence: [ANALYSIS, PLATFORMS],
  }),
  row({
    id: "lezhin-comics",
    name: "Lezhin Comics",
    domain: D.publishing,
    url: "https://www.lezhin.com/ko",
    urlTitle: "Lezhin Comics",
    what: t(
      "웹툰 플랫폼입니다. 저장소 규격 검사기는 2025 공모전 제출 규격에서 가져온 폭 1440px를 외부 출처 값으로 쓰고, 이전 안내의 1280px도 함께 보존합니다.",
      "A webtoon platform. The repository's spec validator uses the 1440px width from its 2025 contest submission rules as an outside-source value and also keeps the earlier 1280px guidance.",
    ),
    learned: t(
      "배움: 문서마다 어긋나는 값은 한쪽을 고르지 않고 두 값을 모두 ‘충돌’로 남김. 외부 출처 하나뿐인 값은 교차 확인 전에는 경고까지만 냄.",
      "Learned: when documents disagree, keep both values as a conflict rather than picking one. A value from a single outside source raises only a warning until it is cross-checked.",
    ),
    overlap: t("플랫폼 규격 검사기(lezhin-comics)와 내보내기 프리셋.", "The platform spec validator (lezhin-comics) and the export presets."),
    evidence: [COMPANION, VALIDATOR, `${CREATOR}/save-first/studio-export-presets.ts`],
  }),
  row({
    id: "toptoon",
    name: "Toptoon",
    domain: D.publishing,
    url: "https://toptoon.com/",
    what: t(
      "웹툰 플랫폼입니다. 저장소 규격 검사기에는 기존 폭 값이 있지만 1차 출처를 찾지 못해 모든 항목을 ‘미검증’으로 표시합니다.",
      "A webtoon platform. The repository's spec validator keeps an existing width value but marks every item unverified because no primary source was found.",
    ),
    learned: t(
      "배움: 출처를 못 찾은 규격은 값을 지어내지 않고 기존 값을 두되 미검증으로 표시하며, 공식 규격 확인 전에는 실패 판정을 내지 않음.",
      "Learned: when no source is found, do not invent values; keep the existing one marked unverified, and raise no failure until an official spec is confirmed.",
    ),
    overlap: t("플랫폼 규격 검사기(toptoon).", "The platform spec validator (toptoon)."),
    evidence: [COMPANION, VALIDATOR],
  }),
  row({
    id: "comico",
    name: "Comico",
    domain: D.publishing,
    what: t(
      "NHN이 서비스하는 일본발 글로벌 웹툰·웹소설 플랫폼이라고 경쟁 분석이 적었습니다. 오리지널과 글로벌 동시 연재를 정리했습니다.",
      "A global webtoon and web-novel platform that the competitor analysis describes as run by NHN and of Japanese origin. It noted originals and simultaneous global serials.",
    ),
    learned: t(
      "배움: 일본·태국 등으로 커버리지를 넓힐 때 데이터 소스로서 가치가 있다는 판단. 직접 비교한 기록은 없음(미확인).",
      "Learned: it has value as a data source when coverage widens to Japan, Thailand and beyond. No direct comparison is on record (unconfirmed).",
    ),
    overlap: t("통합 카탈로그의 플랫폼 커버리지.", "Platform coverage of the unified catalog."),
    evidence: [ANALYSIS, PLATFORMS],
  }),
  row({
    id: "webtoon-guide",
    name: "Webtoon Guide",
    domain: D.publishing,
    url: "https://www.webtoonguide.com/",
    what: t(
      "웹툰 전문 매체입니다. 경쟁 분석은 웹툰 통계 서비스 WAS가 종료돼 B2B 데이터 솔루션 COCODA로 바뀌었고, 플랫폼과 무관한 통합 순위(WPI)가 있었다고 적었습니다.",
      "A webtoon-focused media outlet. The competitor analysis says its WAS statistics service ended and became the B2B data solution COCODA, and that it offered a platform-independent unified ranking (WPI).",
    ),
    learned: t(
      "배움: ‘플랫폼 무관 통합 순위’를 일반 독자용 투명 산식 랭킹으로 다시 만드는 방향. 근거는 2026-05 문서이고 방문자 수 같은 수치는 옮기지 않음.",
      "Learned: rebuild the platform-independent unified ranking as a reader-facing ranking with a published formula. Source is the 2026-05 document, and visitor figures are not repeated.",
    ),
    overlap: t("다축 랭킹과 ‘why this rank’ 산식 분해(RankingPage).", "The multi-axis ranking and the 'why this rank' breakdown (RankingPage)."),
    evidence: [ANALYSIS, DIFFERENTIATION, `${CATALOG}/RankingPage.tsx`],
  }),
  row({
    id: "myanimelist",
    name: "MyAnimeList",
    domain: D.publishing,
    url: "https://myanimelist.net/",
    what: t(
      "애니메이션·만화 데이터베이스입니다. 경쟁 분석은 방대한 DB와 전통적인 10점 점수, 포럼을 커뮤니티 평점의 기준점으로 봤습니다.",
      "An anime and manga database. The competitor analysis took its large database, traditional ten-point score and forum as a baseline for community ratings.",
    ),
    learned: t(
      "배움: 방대한 DB의 정본(canonical) 메타데이터 신뢰성. 다르게 한 점: 플랫폼별 점수를 따로 두지 않고 작품 한 항목에 모으는 방향.",
      "Learned: the trustworthiness of canonical metadata in a large database. Done differently: ratings are gathered onto one work entry rather than kept per platform.",
    ),
    overlap: t("통합 작품 정본(1작품 1항목).", "The unified canonical work record (one work, one entry)."),
    evidence: [ANALYSIS, DIFFERENTIATION],
  }),
  row({
    id: "mangaupdates",
    name: "MangaUpdates",
    domain: D.publishing,
    url: "https://www.mangaupdates.com/",
    what: t(
      "만화 릴리스 추적 서비스입니다. 경쟁 분석은 시리즈 DB, 신규 화 알림, Reading·Wish·Complete·Unfinished·On Hold의 다섯 상태 리스트를 정리했습니다.",
      "A manga release-tracking service. The competitor analysis noted its series database, new-chapter alerts, and five status lists: Reading, Wish, Complete, Unfinished and On Hold.",
    ),
    learned: t(
      "배움(‘훔칠 것’으로 적힘): 신규 화 알림과 다섯 상태 리스트. 전략 문서는 연재 알림이 로컬 토글뿐이고 실제 발송은 없다고 정직하게 적음.",
      "Learned (listed as 'what to take'): new-chapter alerts and five status lists. The strategy document honestly records that serial alerts are only a local toggle with no real delivery.",
    ),
    overlap: t("연재 캘린더(CalendarPage)와 내 서재 상태(LibraryPage).", "The release calendar (CalendarPage) and library statuses (LibraryPage)."),
    evidence: [ANALYSIS, DIFFERENTIATION, `${CATALOG}/CalendarPage.tsx`, `${CATALOG}/LibraryPage.tsx`],
  }),
  row({
    id: "goodreads",
    name: "Goodreads",
    domain: D.publishing,
    url: "https://www.goodreads.com/",
    what: t(
      "책 기록 서비스입니다. 경쟁 분석은 맞춤 서가, 별점과 리뷰, 스포일러 태그, 연간 독서 챌린지, 친구 피드를 정리했습니다.",
      "A book-tracking service. The competitor analysis noted custom shelves, star ratings and reviews, spoiler tags, an annual reading challenge and friend feeds.",
    ),
    learned: t(
      "배움(‘훔칠 것’으로 적힘): 맞춤 서가, 스포일러 표시, 연간 챌린지. 이 제품만의 적용 위치는 문서에 따로 없음(미확인).",
      "Learned (listed as 'what to take'): custom shelves, spoiler marking and an annual challenge. No product-specific place of adoption is recorded (unconfirmed).",
    ),
    overlap: t("내 서재(LibraryPage)와 서재 일기(LibraryDiaryTab).", "The personal library (LibraryPage) and the library diary (LibraryDiaryTab)."),
    evidence: [ANALYSIS, DIFFERENTIATION, `${CATALOG}/LibraryPage.tsx`, "apps/web/src/domains/engagement/LibraryDiaryTab.tsx"],
  }),
  row({
    id: "tmdb",
    name: "TMDB",
    domain: D.publishing,
    url: "https://www.themoviedb.org/",
    what: t(
      "커뮤니티가 가꾸는 영상 메타데이터 데이터베이스로, API가 열려 있습니다. 경쟁 분석은 다국어·구조화·기여 모델을 정본 작품 DB의 설계 기준으로 적었습니다.",
      "A community-maintained video metadata database with an open API. The competitor analysis took its multilingual, structured and contribution model as a design baseline for the canonical work database.",
    ),
    learned: t(
      "배움: 개방형·구조화·다국어 메타데이터 모델. 채택하지 않음: 상업 사용 계약을 확인하기 전에는 발급·연동을 진행하지 않았고 소스 표에는 ‘상업 라이선스 문의’로 적음.",
      "Learned: an open, structured, multilingual metadata model. Not adopted: no key was issued or connection made before its commercial terms are confirmed; the source table lists it as 'commercial license inquiry'.",
    ),
    overlap: t("통합 작품 정본과 외부 소스 표(상업 이용 조건 표기).", "The canonical work record and the external source table (commercial-use conditions)."),
    evidence: [ANALYSIS, "docs/operations/free-api-access-register-2026-09-15.md", "apps/web/src/domains/creator-resources/sources.ts"],
  }),
  row({
    id: "justwatch",
    name: "JustWatch",
    domain: D.publishing,
    url: "https://www.justwatch.com/",
    what: t(
      "영상 시청 가능처를 모아 보여 주는 서비스입니다. 경쟁 분석은 Trakt가 이 서비스와 제휴해 시청처와 딥링크를 보여 준다고 적었습니다.",
      "A service that aggregates where video can be watched. The competitor analysis says Trakt partners with it to show watch locations and deep links.",
    ),
    learned: t(
      "배움: ‘작품 → 어디서 볼 수 있나 + 딥링크’ 구조를 크로스플랫폼 ‘어디서 읽나’로 옮기는 발상(최우선 기능으로 기록). 외부 플랫폼의 유료 본문은 호스팅하지 않고 연결만 함.",
      "Learned: carry the 'work to where it can be watched plus deep link' structure over to cross-platform where-to-read (recorded as the top feature). Paid text of outside platforms is not hosted; users are only linked out.",
    ),
    overlap: t("작품 상세의 제공처(어디서 볼지) 표시.", "Where-to-read availability on work pages."),
    evidence: [ANALYSIS, DIFFERENTIATION, "apps/web/src/shared/components/availability.tsx"],
  }),
  row({
    id: "globalcomix",
    name: "GlobalComix",
    domain: D.publishing,
    url: "https://globalcomix.com/",
    what: t(
      "만화 게시·구독 플랫폼입니다. 저장소 문서는 즉시·예약 게시, 세로 스크롤과 전통식 레이아웃 지원, 독자 알림·분석, 그리고 구인/구직을 나눈 인재(Talent) 게시판을 정리했습니다.",
      "A platform for publishing and following comics. The repository noted immediate and scheduled publishing, vertical-scroll and traditional layouts, reader alerts and analytics, and a Talent board that separates hiring from job seeking.",
    ),
    learned: t(
      "배움: 즉시·예약 공개와 세로·페이지 독서 형식을 게시 설정의 1급 값으로 두고, 용역·팀원 모집을 역할·보수·일정으로 구조화. 외부 게시를 자동으로 한다고는 주장하지 않음.",
      "Learned: make immediate versus scheduled release and vertical versus paged reading first-class publication settings, and structure hiring by role, pay and schedule. No automatic external publishing is claimed.",
    ),
    overlap: t("게시 센터의 예약·독서 형식 설정, 협업 게시판(CollaborationBoardPage), GlobalComix 내보내기 프리셋.", "The publishing center's schedule and reading-format settings, the collaboration board, and the GlobalComix export preset."),
    evidence: [
      "docs/studio-publishing-command-center.md",
      "docs/creator-hub-implementation-20260913.md",
      "docs/creator-promotion-community-20260913.md",
      `${CREATOR}/save-first/studio-export-presets.ts`,
      "apps/web/src/domains/collaboration/CollaborationBoardPage.tsx",
    ],
  }),
  row({
    id: "pixiv",
    name: "Pixiv",
    domain: D.publishing,
    url: "https://www.pixiv.net/en/",
    what: t(
      "일러스트·만화를 올리고 팔로우하는 서비스입니다. 저장소 프로필 벤치마크는 ‘팔로우와 창작자 활동’ 패턴의 예로 들었고, 팬 멤버십 모델의 머리말은 pixiv FANBOX를 본보기로 적었습니다.",
      "A service for posting and following illustrations and comics. The repository's profile benchmark cites it as an example of the follow-and-creator-activity pattern, and the fan-membership model's header names pixiv FANBOX as its model.",
    ),
    learned: t(
      "배움: 팔로워·작품·시리즈·팔로우 상태는 이미 있다고 판단해 새로 만들지 않고, 월 구독 티어형 팬 멤버십의 개념을 참고(Patreon과 함께).",
      "Learned: followers, works, series and follow state already exist, so nothing new was built; the idea of monthly-tier fan memberships was referenced (together with Patreon).",
    ),
    overlap: t("크리에이터 프로필의 팔로우·작품 집계와 팬 멤버십 모델.", "Follow and work aggregates on creator profiles, and the fan-membership model."),
    evidence: [
      "docs/profile-benchmark-2026-09.md",
      "apps/web/src/domains/monetization/membership/models/membership-model.ts",
      "apps/web/src/domains/account/creator-profile-showcase.ts",
    ],
  }),
  watch({
    id: "kaistory",
    name: "KAISTORY",
    domain: D.publishing,
    url: "https://kaistory.net/",
    registry: "webtoon",
    category: "webtoon-production-and-distribution",
    priority: "P0",
    focus: t(
      "오프라인 우선 콘티, 하나의 프로젝트 데이터 모델, 레이어 PSD, 다국어 번역, 화자별 음성(TTS), 브라우저 원본 해상도 내보내기, 글로벌 유통",
      "offline-first storyboards, one project data model, layered PSD, multi-language translation, per-speaker TTS, full-resolution browser export and global distribution",
    ),
    note: t(
      "콘티부터 게시까지 버전 있는 프로젝트 하나로 잇고 로컬 복구를 정본으로 둘 것.",
      "Link storyboard to publish in one versioned project and keep local-first recovery authoritative.",
    ),
  }),
];
