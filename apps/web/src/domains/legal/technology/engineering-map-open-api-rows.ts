import type { EngineeringMapLink, EngineeringMapRow } from "./engineering-map-types";
import type { EngineeringStatus, LocalizedText } from "./engineering-story-content";

/**
 * 기술 지도 · open-api 의 행 공통 도구와 "서버 ResourceEngine 공급자 26곳" 행.
 * 상태·한도 표기는 2026-10-07 코드 읽기 기준이다(운영 키 등록·실호출 성공은 미확인).
 * 나머지 행(독립 어댑터·브라우저 직접 호출·런타임 커넥터·우리가 제공)은 engineering-map-open-api-rows-other.ts.
 */

export const t = (ko: string, en: string): LocalizedText => ({ ko, en });

/** 열 `kind` 의 값. 지도의 행 종류 5가지. */
export const OPEN_API_KIND = {
  engine: t("서버 엔진 공급자", "Server engine provider"),
  adapter: t("서버 어댑터", "Server adapter"),
  browser: t("브라우저 직접 호출", "Direct from browser"),
  connector: t("런타임 커넥터", "Runtime connector"),
  ours: t("우리가 제공", "We provide"),
} as const;

interface OpenApiRowInput {
  readonly id: string;
  readonly name: string;
  readonly kind: LocalizedText;
  readonly what: LocalizedText;
  readonly where: LocalizedText;
  readonly guard: LocalizedText;
  readonly status: EngineeringStatus;
  readonly link?: EngineeringMapLink;
  readonly evidence: readonly string[];
  readonly asOf?: string;
}

export function openApiRow(input: OpenApiRowInput): EngineeringMapRow {
  return {
    id: input.id,
    name: input.name,
    cells: { kind: input.kind, what: input.what, where: input.where, guard: input.guard },
    status: input.status,
    ...(input.link ? { link: input.link } : {}),
    evidence: input.evidence,
    ...(input.asOf ? { asOf: input.asOf } : {}),
  };
}

const ENGINE = "apps/api/src/modules/creator-resources/resource-engine.ts";
const ENGINE_CASES = "tests/creator-resources-cases.ts";
const ART = "apps/api/src/modules/creator-resources/open-art-providers.ts";
const ART_TEST = "tests/integration/api-web/api/modules/creator-resources/open-art-providers.test.ts";
const EXPANSION_TEST = "apps/api/src/modules/creator-resources/open-api-expansion.test.ts";
const REFERENCE_TEST = "apps/api/src/modules/creator-resources/open-reference-providers.test.ts";
const FREE_TEST = "apps/api/src/modules/creator-resources/free-resource-providers.test.ts";
const INTERNATIONAL = "apps/api/src/modules/creator-resources/international-discovery-providers.ts";
const INTERNATIONAL_TEST = "apps/api/src/modules/creator-resources/international-discovery-providers.test.ts";
const KOREAN = "apps/api/src/modules/creator-resources/korean-open-data-providers.ts";
const REGISTER = "docs/operations/free-api-access-register-2026-09-15.md";
const SOURCES = "apps/web/src/domains/creator-resources/sources.ts";

/** 서버 `GET /api/creator-resources/search` 를 지나는 공급자 26곳. 공통 관문은 resource-engine.ts 한 곳이 소유한다. */
export const OPEN_API_ENGINE_ROWS: readonly EngineeringMapRow[] = [
  openApiRow({
    id: "met",
    name: "The Met",
    kind: OPEN_API_KIND.engine,
    what: t(
      "뉴욕 메트로폴리탄 미술관 소장품 검색. 작품 번호 목록을 먼저 받고, 번호마다 상세 정보를 한 번 더 조회한다.",
      "Search of the Metropolitan Museum of Art collection. It fetches a list of object IDs first, then looks each object up again for details.",
    ),
    where: t(
      "창작 레퍼런스 아틀라스(/research/assets), 콘텐츠 팩(/research/packs)",
      "Reference atlas (/research/assets) and content packs (/research/packs)",
    ),
    guard: t(
      "검색 목록의 표시는 믿지 않고 상세에서 '공개 도메인·권리 제한 문구 없음·이미지 호스트 일치'를 다시 확인한다. 상세는 3건씩 조회하고, 일부만 실패하면 '부분 성공'으로 알린다.",
      "Search flags are not trusted: the detail reply must say public domain, carry no rights restriction and use the expected image host. Details load three at a time, and partial failures are reported as partial.",
    ),
    status: "live",
    link: { title: "The Met Collection API", url: "https://metmuseum.github.io/" },
    evidence: [ENGINE, ENGINE_CASES],
  }),
  openApiRow({
    id: "aic",
    name: "Art Institute of Chicago",
    kind: OPEN_API_KIND.engine,
    what: t(
      "시카고 미술관 작품 검색. 공개 도메인 작품만 요청하고, 이미지 주소는 받은 값이 아니라 작품 이미지 번호로 우리가 규칙대로 조립한다.",
      "Search of the Art Institute of Chicago. It asks for public-domain works only and builds the image address itself from the image ID instead of trusting a received URL.",
    ),
    where: t(
      "콘텐츠 팩(/research/packs), 연구 대시보드의 미술 참고. 같은 기관을 브라우저가 직접 부르는 길은 아래 Open Creation 행",
      "Content packs (/research/packs) and the research dashboard. The browser-direct route to the same museum is the Open Creation row below",
    ),
    guard: t(
      "공개 도메인 표시·저작권 고지 없음·이미지 번호 형식이 모두 맞는 항목만 CC0로 올린다. 위반 항목만 빼고(부분 성공), 구조 변경·한도 초과·시간 초과는 빈 성공 대신 '이용 불가'로 알린다.",
      "Only items with a public-domain flag, no copyright notice and a well-formed image ID become CC0. Rule-breaking items are dropped (partial); a changed schema, a rate limit or a timeout is reported as unavailable, not as an empty success.",
    ),
    status: "live",
    link: { title: "Art Institute of Chicago API", url: "https://api.artic.edu/docs/" },
    evidence: [ART, ART_TEST],
  }),
  openApiRow({
    id: "cleveland",
    name: "Cleveland Museum of Art",
    kind: OPEN_API_KIND.engine,
    what: t(
      "클리블랜드 미술관 Open Access 검색. CC0 필터와 '이미지 있음' 조건을 걸어 요청한다.",
      "Search of the Cleveland Museum of Art Open Access collection, requested with a CC0 filter and an has-image condition.",
    ),
    where: t(
      "콘텐츠 팩(/research/packs), 연구 대시보드의 미술 참고",
      "Content packs (/research/packs) and the research dashboard",
    ),
    guard: t(
      "공급자 표시가 CC0이고 저작권 칸이 비어 있으며 이미지 호스트가 맞는 항목만 올린다. 표시·저작권 칸·호스트가 하나라도 어긋난 항목은 제외하고, 응답 구조 자체가 다르면 '이용 불가'로 알린다.",
      "An item is promoted only when the provider says CC0, the copyright field is empty and the image host matches. Any mismatch drops the item; a wholly different response structure is reported as unavailable.",
    ),
    status: "live",
    link: { title: "Cleveland Museum of Art Open Access API", url: "https://openaccess-api.clevelandart.org/" },
    evidence: [ART, ART_TEST],
  }),
  openApiRow({
    id: "polyhaven",
    name: "Poly Haven",
    kind: OPEN_API_KIND.engine,
    what: t(
      "무료(CC0) 3D 모델·HDRI(360도 조명 사진)·텍스처 목록. 한 번의 검색에 3가지 목록을 받아 우리가 걸러 보여 준다.",
      "Free CC0 3D models, HDRIs (360-degree lighting photos) and textures. One search pulls three catalogs and we filter them ourselves.",
    ),
    where: t(
      "무료 3D·HDRI·텍스처 재료실(/research/3d-assets), 배경·소품 제작 브리프",
      "Free 3D, HDRI and texture bench (/research/3d-assets) and background or prop briefs",
    ),
    guard: t(
      "썸네일은 cdn.polyhaven.com만, 출처 주소는 polyhaven.com만 허용한다. 3가지 목록 중 일부만 실패하면 '부분 성공'. 미리보기·메타데이터만 저장하고 큰 파일은 원문에서 받게 한다.",
      "Thumbnails are allowed only from cdn.polyhaven.com and source links only on polyhaven.com. If just some of the three catalogs fail, the result is partial. Only previews and metadata are stored; big files are fetched at the source.",
    ),
    status: "live",
    link: { title: "Poly Haven API", url: "https://polyhaven.com/our-api" },
    evidence: ["apps/api/src/modules/creator-resources/polyhaven-provider.ts", FREE_TEST],
  }),
  openApiRow({
    id: "ambientcg",
    name: "ambientCG",
    kind: OPEN_API_KIND.engine,
    what: t(
      "PBR 재질(표면 질감 세트)·HDRI·데칼·3D 모델·지형 검색(API v3).",
      "Search of PBR materials (surface texture sets), HDRIs, decals, 3D models and terrain through API v3.",
    ),
    where: t(
      "CC0 PBR·3D 소재 검색(/research/material-assets)",
      "CC0 PBR and 3D material search (/research/material-assets)",
    ),
    guard: t(
      "썸네일 호스트(acg-media…)와 출처 주소를 고정 검사한다. CC0 표기는 코드가 일괄 부여하므로 공급자 정책이 바뀌면 다시 대조해야 한다. 응답 구조가 다르면 '이용 불가'.",
      "Thumbnail host and source link are checked against fixed values. The CC0 label is assigned by our code, so it must be re-checked if the provider's policy changes. A different response structure means unavailable.",
    ),
    status: "live",
    link: { title: "ambientCG API v3", url: "https://docs.ambientcg.com/api/v3/" },
    evidence: ["apps/api/src/modules/creator-resources/ambientcg-provider.ts", REFERENCE_TEST, EXPANSION_TEST],
  }),
  openApiRow({
    id: "nasa",
    name: "NASA Images",
    kind: OPEN_API_KIND.engine,
    what: t(
      "NASA 이미지 라이브러리의 이미지 메타데이터와 작은 미리보기.",
      "Image metadata and small previews from the NASA image library.",
    ),
    where: t(
      "NASA 우주·과학 레퍼런스(/research/space-assets)",
      "NASA space and science references (/research/space-assets)",
    ),
    guard: t(
      "항목별 권리를 응답만으로 확정할 수 없어 '참고 전용(reference-only)'으로만 올린다. 이미지는 images-assets.nasa.gov만 허용하고, 원본은 가져오지 않는다.",
      "Per-item rights cannot be settled from the reply alone, so items are promoted only as reference-only. Images are allowed only from images-assets.nasa.gov, and originals are not fetched.",
    ),
    status: "live",
    link: { title: "NASA Images API docs (PDF)", url: "https://images.nasa.gov/docs/images.nasa.gov_api_docs.pdf" },
    evidence: ["apps/api/src/modules/creator-resources/reference-media-providers.ts", REFERENCE_TEST],
  }),
  openApiRow({
    id: "vam",
    name: "V&A Collections",
    kind: OPEN_API_KIND.engine,
    what: t(
      "런던 빅토리아앤앨버트 박물관의 소장품(복식·직물·가구·디자인) 검색.",
      "Search of the Victoria and Albert Museum collection in London: costume, textiles, furniture and design.",
    ),
    where: t(
      "V&A 패션·디자인 자료실(/research/vam)",
      "V&A fashion and design library (/research/vam)",
    ),
    guard: t(
      "작품별 이미지 조건이 달라 '참고 전용'으로만 올린다. 썸네일은 framemark.vam.ac.uk, 출처 링크는 collections.vam.ac.uk만 허용하고, 위조된 미리보기 호스트는 버린다(테스트).",
      "Image terms differ per work, so items are promoted only as reference-only. Thumbnails are allowed from framemark.vam.ac.uk and source links from collections.vam.ac.uk; a forged preview host is discarded (tested).",
    ),
    status: "live",
    link: { title: "V&A API developers", url: "https://developers.vam.ac.uk/" },
    evidence: ["apps/api/src/modules/creator-resources/reference-media-providers.ts", REFERENCE_TEST],
  }),
  openApiRow({
    id: "rijksmuseum",
    name: "Rijksmuseum",
    kind: OPEN_API_KIND.engine,
    what: t(
      "네덜란드 국립미술관의 Linked Open Data 검색. 제목으로 찾은 첫 100건 안에서 작품마다 상세(제작자·시대·설명·권리 표시)를 확인한다.",
      "Linked Open Data search of the Rijksmuseum. Within the first 100 title matches, each work's detail record (maker, period, description, rights mark) is checked.",
    ),
    where: t(
      "Rijksmuseum 고증 자료실(/research/rijksmuseum)",
      "Rijksmuseum research room (/research/rijksmuseum)",
    ),
    guard: t(
      "상세 레코드에 CC0 주소가 있으면 CC0, 없으면 '참고 전용'. 이미지는 보존하지 않는다. 상세는 3건씩 조회하고 하나라도 실패하면 '부분 성공'으로 알린다.",
      "A record that carries the CC0 URI is CC0; otherwise it is reference-only. Images are not kept. Details load three at a time, and any failure makes the result partial.",
    ),
    status: "live",
    link: { title: "Rijksmuseum Data Services search", url: "https://data.rijksmuseum.nl/docs/search" },
    evidence: ["apps/api/src/modules/creator-resources/rijksmuseum-provider.ts", REFERENCE_TEST],
  }),
  openApiRow({
    id: "gbif",
    name: "GBIF",
    kind: OPEN_API_KIND.engine,
    what: t(
      "전 세계 생물 종 관찰 기록. 이름으로 종을 먼저 맞춰 본 뒤, 사진이 붙은 관찰 기록을 가져온다.",
      "Worldwide species observation records. The name is matched to a species first, then observation records that carry photos are fetched.",
    ),
    where: t(
      "생물·크리처 디자인 도감(/research/creatures)",
      "Creature design reference (/research/creatures)",
    ),
    guard: t(
      "메타데이터만 저장한다(사진 권리는 기록·저작자마다 달라 원문 확인). 종 매칭과 관찰 검색 두 응답 모두 모양 검사를 통과해야 하고, 일부 항목이 어긋나면 '부분 성공'.",
      "Only metadata is stored (photo rights differ per record and author, so they are checked at the source). Both the species match and the observation reply must pass shape checks; odd items make the result partial.",
    ),
    status: "live",
    link: { title: "GBIF API docs", url: "https://techdocs.gbif.org/en/openapi/" },
    evidence: ["apps/api/src/modules/creator-resources/gbif-provider.ts", EXPANSION_TEST],
  }),
  openApiRow({
    id: "musicbrainz",
    name: "MusicBrainz",
    kind: OPEN_API_KIND.engine,
    what: t(
      "음악가·그룹의 국가·활동 기간·동명이인 정보(음원 파일은 없음).",
      "Artist and group facts: country, active years and name disambiguation. No audio files.",
    ),
    where: t(
      "음악가·BGM 메타데이터(/research/music-metadata)",
      "Artist and BGM metadata (/research/music-metadata)",
    ),
    guard: t(
      "공급자 규칙에 맞춰 호출 사이를 1.1초 이상 벌려 순서대로 보낸다. 음악 사용 허가가 아니므로 '메타데이터 전용'으로만 저장한다.",
      "Calls are queued at least 1.1 seconds apart to respect the provider's rule. It grants no right to use music, so results are stored as metadata-only.",
    ),
    status: "live",
    link: { title: "MusicBrainz API", url: "https://musicbrainz.org/doc/MusicBrainz_API" },
    evidence: ["apps/api/src/modules/creator-resources/open-catalog-providers.ts", ENGINE, EXPANSION_TEST],
  }),
  openApiRow({
    id: "internetarchive",
    name: "Internet Archive",
    kind: OPEN_API_KIND.engine,
    what: t(
      "역사 도서·잡지·영상·음원 항목의 메타데이터와 원문 링크(고급 검색 API).",
      "Metadata and source links for historic books, magazines, video and audio (advanced search API).",
    ),
    where: t(
      "역사 자료 아카이브(/research/archive)",
      "Historic archive (/research/archive)",
    ),
    guard: t(
      "컬렉션·파일마다 권리가 달라 파일은 가져오지 않고 '메타데이터 전용'으로 저장한다. 항목 식별자는 영숫자와 . _ - 만 통과시키고, 응답은 15분 캐시한다.",
      "Rights differ per collection and file, so no files are fetched and results are metadata-only. Item identifiers may contain only letters, digits and . _ - ; replies are cached for 15 minutes.",
    ),
    status: "live",
    link: { title: "Internet Archive developer APIs", url: "https://archive.org/developers/index-apis.html" },
    evidence: ["apps/api/src/modules/creator-resources/open-catalog-providers.ts", EXPANSION_TEST],
  }),
  openApiRow({
    id: "metweather",
    name: "MET Norway Weather",
    kind: OPEN_API_KIND.engine,
    what: t(
      "노르웨이 기상청의 위치별 날씨 예보(기온·구름·습도·바람·강수). 도시 이름 몇 개 또는 위도·경도를 받는다.",
      "Location forecasts from the Norwegian Meteorological Institute: temperature, cloud, humidity, wind and rain. It takes a few city names or latitude and longitude.",
    ),
    where: t(
      "날씨·빛 연출 도우미(/research/weather-light)",
      "Weather and light helper (/research/weather-light)",
    ),
    guard: t(
      "좌표를 소수 4자리까지만 보내고 응답은 30분 캐시한다. 권리 등급은 CC BY 4.0(출처표시)로 올리고 '장면 연출 참고용, 안전 판단 아님'이라고 알린다.",
      "Coordinates are sent with at most four decimals and replies are cached for 30 minutes. Items carry CC BY 4.0 (attribution) and are labelled as scene reference, not for safety decisions.",
    ),
    status: "live",
    link: { title: "MET Norway Weather API", url: "https://api.met.no/" },
    evidence: ["apps/api/src/modules/creator-resources/met-weather-provider.ts", ENGINE],
  }),
  openApiRow({
    id: "kheritage",
    name: "Korea Heritage Service",
    kind: OPEN_API_KIND.engine,
    what: t(
      "국가유산청 공식 Open API의 국가유산 명칭·분류·지역·관리기관·좌표(XML 응답).",
      "Heritage names, categories, regions, managing bodies and coordinates from the Korea Heritage Service open API (XML replies).",
    ),
    where: t(
      "국가유산 고증 검색(/research/open-data/kheritage)",
      "Heritage research search (/research/open-data/kheritage)",
    ),
    guard: t(
      "XML을 엔티티 처리 없이 해석하고 2MiB 이하만 받는다. 키가 필요 없는 공개 API라 '메타데이터 전용'으로만 저장하며, 사진·해설의 공공누리 유형은 원문에서 확인하게 한다.",
      "XML is parsed with entity expansion off and only up to 2 MiB is accepted. It is a keyless public API, so results are metadata-only; photo and commentary licences are checked at the source.",
    ),
    status: "live",
    link: {
      title: "Korea Heritage Service open API guide",
      url: "https://www.khs.go.kr/html/HtmlPage.do?mn=NS_04_04_03&pg=%2Fpublicinfo%2Fpbinfo3_0201.jsp",
    },
    evidence: [KOREAN, EXPANSION_TEST],
  }),
  openApiRow({
    id: "openlibrary",
    name: "Open Library",
    kind: OPEN_API_KIND.engine,
    what: t(
      "공개 도서 목록 검색: 제목·저자·초판 연도·판본 수·ISBN.",
      "Public book catalog search: title, author, first-publication year, edition count and ISBN.",
    ),
    where: t(
      "글로벌 만화·도서 판본 탐색(/research/books)",
      "Global comic and book editions (/research/books)",
    ),
    guard: t(
      "작품 키 형식(/works/…)을 정규식으로 검사하고 ISBN은 체크섬까지 확인한다. 표지·본문 권리는 승계하지 않는 '메타데이터 전용'이며, 대량 수집에는 공식 데이터 덤프를 쓰라고 안내한다.",
      "Work keys are matched against a pattern and ISBNs are checksum-verified. Cover and text rights are not inherited (metadata-only), and bulk collection is steered to the official data dumps.",
    ),
    status: "live",
    link: { title: "Open Library developers", url: "https://openlibrary.org/developers/api" },
    evidence: [ENGINE, ENGINE_CASES],
  }),
  openApiRow({
    id: "openbd",
    name: "openBD",
    kind: OPEN_API_KIND.engine,
    what: t(
      "일본 도서의 ISBN 정확 조회(서지 정보).",
      "Exact ISBN lookup for Japanese books (bibliographic data).",
    ),
    where: t(
      "글로벌 만화·도서 판본 탐색(/research/books)",
      "Global comic and book editions (/research/books)",
    ),
    guard: t(
      "ISBN-10/13 체크섬이 맞을 때만 조회한다. 도서 소개·홍보 목적, 원본 임의 변경 금지 조건을 지키는 'book-promotion' 등급으로만 저장한다.",
      "A lookup is sent only when the ISBN-10 or ISBN-13 checksum is valid. Results are stored under a book-promotion grade that respects the introduction-only use and no-alteration terms.",
    ),
    status: "live",
    link: { title: "openBD", url: "https://openbd.jp/" },
    evidence: [ENGINE, SOURCES],
  }),
  openApiRow({
    id: "wikimedia-pageviews",
    name: "Wikimedia Pageviews",
    kind: OPEN_API_KIND.engine,
    what: t(
      "한국어 위키백과 문서의 최근 30일 일별 조회수. 작품·소재에 대한 관심 신호로 쓴다.",
      "Daily views over the last 30 days for a Korean Wikipedia article, used as an interest signal for a work or topic.",
    ),
    where: t(
      "백과 조회 관심 신호(/research/open-data/wikimedia), 소재·장르 관심 레이더",
      "Encyclopedia interest signal (/research/open-data/wikimedia) and the topic radar",
    ),
    guard: t(
      "일별 시계열 한 점이라도 형식이 어긋나면 응답 전체를 버린다. 독자 수·매출·작품 성공 가능성과 합산하지 않는 '관심 참고 신호'로만 표시한다.",
      "If even one daily point is malformed the whole reply is discarded. The number is shown only as an interest hint and is never added to readers, sales or success odds.",
    ),
    status: "live",
    link: { title: "Wikimedia Analytics (Pageviews) API", url: "https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/" },
    evidence: [INTERNATIONAL, INTERNATIONAL_TEST],
  }),
  openApiRow({
    id: "googlebooks",
    name: "Google Books",
    kind: OPEN_API_KIND.engine,
    what: t(
      "구글 도서 검색의 판본·ISBN 메타데이터(표지·미리보기·본문은 제외).",
      "Edition and ISBN metadata from Google Books, without covers, previews or text.",
    ),
    where: t(
      "글로벌 만화·도서 판본 탐색(/research/books)",
      "Global comic and book editions (/research/books)",
    ),
    guard: t(
      "서버 키(GOOGLE_BOOKS_API_KEY)는 요청 헤더로만 보내고 주소·응답에 남기지 않는다. 키가 없으면 호출 없이 '미설정'으로 답한다. 운영 등록은 대장 기록상 대기(미확인).",
      "The server key (GOOGLE_BOOKS_API_KEY) travels only in a request header, never in the URL or reply. Without a key the call is skipped and reported as not configured. Production registration is pending in the register (unverified).",
    ),
    status: "configured",
    link: { title: "Google Books API guide", url: "https://developers.google.com/books/docs/v1/using" },
    evidence: ["apps/api/src/modules/creator-resources/google-books-provider.ts", FREE_TEST, REGISTER],
  }),
  openApiRow({
    id: "googlefonts",
    name: "Google Fonts",
    kind: OPEN_API_KIND.engine,
    what: t(
      "구글 폰트 디렉터리(글꼴 가족·굵기·한글 지원 여부). 목록을 한 번 받아 서버에서 걸러 낸다.",
      "The Google Fonts directory: families, weights and Korean support. The full list is fetched once and filtered on the server.",
    ),
    where: t(
      "레터링·폰트 매처(/research/fonts)",
      "Lettering and font matcher (/research/fonts)",
    ),
    guard: t(
      "키는 헤더로만 보내고, 목록(대장 실측 1,955개 가족·약 61만 바이트)은 2MiB 안에서 모양 검사 뒤 캐시한다. 글꼴별 라이선스는 가져오지 않고 상세 페이지 확인을 안내한다. 운영 등록은 대기(미확인).",
      "The key travels only in a header; the list (1,955 families, about 614 KB as measured in the register) is shape-checked within 2 MiB and cached. Per-font licences are not fetched; users are pointed to the detail page. Production registration is pending (unverified).",
    ),
    status: "configured",
    link: { title: "Google Fonts Developer API", url: "https://developers.google.com/fonts/docs/developer_api" },
    evidence: ["apps/api/src/modules/creator-resources/google-fonts-provider.ts", REFERENCE_TEST, REGISTER],
    asOf: "2026-09-25",
  }),
  openApiRow({
    id: "neis",
    name: "NEIS (API server)",
    kind: OPEN_API_KIND.engine,
    what: t(
      "교육부 NEIS 교육정보 개방 포털의 학교 기본정보(학교명·학교급·설립구분·주소). XML로 받는다.",
      "School basics from the Ministry of Education NEIS portal: name, level, founding type and address. Replies arrive as XML.",
    ),
    where: t(
      "학교물 배경 설정(/research/open-data/neis). 같은 검색이 Cloudflare 엣지에서도 처리된다(아래 NEIS 엣지 행)",
      "School-story setup (/research/open-data/neis). The same search is also handled at the Cloudflare edge (see the NEIS edge row)",
    ),
    guard: t(
      "키는 쿼리(KEY)로만 보내고 캐시 키·응답·로그에서 뺀다. XML을 엔티티 처리 없이 해석하고 결과 코드·건수까지 맞는지 본다. 학사일정·시간표는 가져오지 않는다. 대장 기록: 운영 키 등록 완료(운영 호출은 미확인).",
      "The key goes only in the KEY query parameter and is kept out of cache keys, replies and logs. XML is parsed with entities off and the result code and counts must agree. Timetables and school calendars are not fetched. The register records the production key as registered (live calls unverified).",
    ),
    status: "configured",
    link: { title: "NEIS open API guide", url: "https://open.neis.go.kr/portal/guide/apiGuidePage.do" },
    evidence: [KOREAN, EXPANSION_TEST, REGISTER],
  }),
  openApiRow({
    id: "tourapi",
    name: "TourAPI",
    kind: OPEN_API_KIND.engine,
    what: t(
      "한국관광공사 TourAPI의 관광지·문화시설 주소와 좌표(키워드 검색).",
      "Addresses and coordinates of tourist spots and cultural venues from Korea Tourism Organization TourAPI (keyword search).",
    ),
    where: t(
      "한국 장소 장면 설계(/research/open-data/tourapi)",
      "Korean place and scene planning (/research/open-data/tourapi)",
    ),
    guard: t(
      "서비스 키를 풀어서 한 번만 인코딩해 보내고(이중 인코딩 방지) 응답·로그에 남기지 않는다. 결과 코드가 0000일 때만 쓰고 '메타데이터 전용'으로 저장하며, 사진 이용조건은 원문 확인. 대장 기록: 키 등록 대기.",
      "The service key is decoded and then encoded exactly once (no double encoding) and never echoed or logged. A reply counts only if its result code is 0000; items are metadata-only and photo terms are checked at the source. The register lists the key as awaiting registration.",
    ),
    status: "configured",
    link: { title: "Korea Tourism Organization data portal", url: "https://api.visitkorea.or.kr/" },
    evidence: [KOREAN, EXPANSION_TEST, REGISTER],
  }),
  openApiRow({
    id: "korean-dictionary",
    name: "Korean Standard Dictionary",
    kind: OPEN_API_KIND.engine,
    what: t(
      "국립국어원 표준국어대사전의 표제어·품사·뜻풀이.",
      "Headwords, parts of speech and definitions from the National Institute of Korean Language standard dictionary.",
    ),
    where: t(
      "한국어 대사·말투 연구(/research/open-data/korean)",
      "Korean dialogue and speech-style research (/research/open-data/korean)",
    ),
    guard: t(
      "키는 쿼리로만 보내고 캐시 키에서 뺀다. 결과 건수와 항목 목록이 맞아야 쓴다. 사전 문장을 작품 대사로 베끼지 않도록 안내하며 '메타데이터 전용'으로만 저장한다. 대장 기록: 키 등록 대기.",
      "The key goes only in the query and is excluded from cache keys; the reported total must match the item list. Users are told not to copy dictionary text into dialogue, and items are metadata-only. The register lists the key as awaiting registration.",
    ),
    status: "configured",
    link: { title: "Standard Korean Dictionary open API", url: "https://stdict.korean.go.kr/openapi/openApiInfo.do" },
    evidence: [KOREAN, EXPANSION_TEST, REGISTER],
  }),
  openApiRow({
    id: "smithsonian",
    name: "Smithsonian Open Access",
    kind: OPEN_API_KIND.engine,
    what: t(
      "스미소니언 박물관군의 레코드 메타데이터(2D·3D 포함) 검색.",
      "Search of Smithsonian record metadata, including 2D and 3D objects.",
    ),
    where: t(
      "Smithsonian 문화유산 검색(/research/open-data/smithsonian)",
      "Smithsonian heritage search (/research/open-data/smithsonian)",
    ),
    guard: t(
      "레코드의 CC0 '메타데이터' 표시와 이미지·3D·상표 등 '미디어 권리'를 분리해 기록하고, 약관 검토일(2026-09-25)을 영수증에 남긴다. 대장 기록상 키 발급·서버 등록 완료, 운영 호출은 미확인.",
      "The record's CC0 metadata mark is kept apart from media rights (images, 3D, trademarks), and the terms-review date (2026-09-25) is written on the receipt. The register notes the key is issued and registered; live calls are unverified.",
    ),
    status: "configured",
    link: { title: "Smithsonian Open Access developer tools", url: "https://www.si.edu/openaccess/devtools" },
    evidence: [INTERNATIONAL, INTERNATIONAL_TEST, REGISTER],
    asOf: "2026-09-25",
  }),
  openApiRow({
    id: "europeana",
    name: "Europeana",
    kind: OPEN_API_KIND.engine,
    what: t(
      "유럽 박물관·도서관·아카이브의 통합 메타데이터 검색.",
      "Unified metadata search across European museums, libraries and archives.",
    ),
    where: t(
      "Europeana 문화유산 통합검색(/research/open-data/europeana)",
      "Europeana heritage search (/research/open-data/europeana)",
    ),
    guard: t(
      "각 제공기관이 붙인 권리 문구(rights)를 그대로 영수증에 싣고, 이미지는 가져오지 않는다. 대장 기록상 키는 가입 대기 — 키가 없으면 호출 없이 '미설정'으로 답한다.",
      "Each institution's own rights statement is copied onto the receipt, and images are not fetched. The register says the key awaits sign-up; without a key the call is skipped and reported as not configured.",
    ),
    status: "configured",
    link: { title: "Europeana APIs", url: "https://pro.europeana.eu/page/apis" },
    evidence: [INTERNATIONAL, INTERNATIONAL_TEST, REGISTER],
    asOf: "2026-09-25",
  }),
  openApiRow({
    id: "dpla",
    name: "DPLA",
    kind: OPEN_API_KIND.engine,
    what: t(
      "미국 디지털 공공도서관(DPLA)의 도서관·박물관·아카이브 통합 메타데이터 검색.",
      "Unified metadata search across US libraries, museums and archives through the Digital Public Library of America.",
    ),
    where: t(
      "DPLA 역사 자료 통합검색(/research/open-data/dpla)",
      "DPLA historic material search (/research/open-data/dpla)",
    ),
    guard: t(
      "항목 번호는 32자리 16진수만 통과시키고 메타데이터만 저장하며, 원 제공기관의 현재 권리를 확인하라고 안내한다. 키는 쿼리로 보내고 캐시 키에서 뺀다. 대장 기록상 키 발급·서버 등록 완료.",
      "Item IDs must be 32 hexadecimal characters, only metadata is stored, and users are told to check the source institution's current rights. The key is excluded from cache keys. The register records the key as issued and registered.",
    ),
    status: "configured",
    link: { title: "DPLA developers", url: "https://pro.dp.la/developers" },
    evidence: [INTERNATIONAL, INTERNATIONAL_TEST, REGISTER],
    asOf: "2026-09-25",
  }),
  openApiRow({
    id: "kakao-books",
    name: "Kakao Book Search",
    kind: OPEN_API_KIND.engine,
    what: t(
      "카카오 책 검색: 만화 단행본·작법서·참고 도서 메타데이터(웹툰 전용 API는 아니다).",
      "Kakao book search: metadata for comic volumes, how-to books and reference books (not a webtoon-specific API).",
    ),
    where: t(
      "만화·작법서 탐색(/discover/works)",
      "Comic and craft-book search (/discover/works)",
    ),
    guard: t(
      "REST 키는 Authorization 헤더로만 보내고, 출처 링크는 daum 도메인만 허용한다. 같은 제목을 같은 작품으로 자동 병합하지 않는다. 대장 기록상 키 미발급 — 키가 없으면 '미설정'.",
      "The REST key goes only in the Authorization header and source links are limited to daum domains. Equal titles are never auto-merged into one work. The register says no key is issued yet; without one the result is not configured.",
    ),
    status: "configured",
    link: { title: "Kakao Developers: book search", url: "https://developers.kakao.com/docs/ko/daum-search/dev-guide" },
    evidence: [ENGINE, ENGINE_CASES, REGISTER],
  }),
  openApiRow({
    id: "bizinfo",
    name: "Bizinfo",
    kind: OPEN_API_KIND.engine,
    what: t(
      "기업마당 지원사업 공고(최근 최대 100건): 마감일·신청 대상.",
      "Support-program notices from Bizinfo, the latest 100 at most, with deadlines and eligibility.",
    ),
    where: t(
      "작가 기회센터(/opportunities), 마감일 일정 파일(.ics)",
      "Creator opportunity center (/opportunities) and deadline calendar files (.ics)",
    ),
    guard: t(
      "서버 키로 최근 100건만 받아 우리 쪽에서 검색어로 거른다. 모호한 기간은 마감일을 만들지 않고 신청 자격은 '원문 확인'으로 둔다. 대장 기록상 키 신청 대기.",
      "Only the latest 100 notices are fetched with a server key and filtered by query on our side. Vague periods never become a deadline, and eligibility stays 'check the notice'. The register says the key application is pending.",
    ),
    status: "configured",
    link: { title: "Bizinfo open API", url: "https://www.bizinfo.go.kr/apiDetail.do?id=bizinfoApi" },
    evidence: [ENGINE, ENGINE_CASES, REGISTER],
  }),
];
