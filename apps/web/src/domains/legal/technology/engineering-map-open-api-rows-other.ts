import { OPEN_API_KIND, openApiRow, t } from "./engineering-map-open-api-rows";

import type { EngineeringMapRow } from "./engineering-map-types";

/**
 * 기술 지도 · open-api 의 나머지 행: 독립 서버 어댑터 7종, 브라우저 직접 호출 5곳, 런타임 커넥터 4묶음, 우리가 제공하는 선언 1행.
 * 서버 엔진 공급자 26곳은 engineering-map-open-api-rows.ts. 상태는 2026-10-07 코드 읽기 기준이다.
 */

const HEADERS = "config/http-response-headers.json";
const REGISTER = "docs/operations/free-api-access-register-2026-09-15.md";
const RUNTIME = "apps/api/src/modules/integration-platform/integration-runtime.providers.ts";
const RUNTIME_TRANSPORT = "apps/api/src/modules/integration-platform/integration-runtime.transport.ts";
const RUNTIME_SERVICE = "apps/api/src/modules/integration-platform/integration-runtime.service.ts";
const RUNTIME_DOC = "docs/integration-runtime-connectors.md";
const RUNTIME_TEST = "apps/api/src/modules/integration-platform/integration-runtime.providers.test.ts";
const RUNTIME_ENTRY = t(
  "통합 연동 센터의 연동 실행 워크벤치(/settings/integrations), 프로젝트 권한 필요",
  "The integration runtime workbench in the integration center (/settings/integrations); project permission required",
);

/** 서버 안에서 따로 호출하는 독립 어댑터. 엔진의 공통 관문 밖이라 행마다 보호 장치가 다르다. */
export const OPEN_API_ADAPTER_ROWS: readonly EngineeringMapRow[] = [
  openApiRow({
    id: "kmas-strict",
    name: "KMAS (strict path)",
    kind: OPEN_API_KIND.adapter,
    what: t(
      "한국만화영상진흥원 만화규장각(KMAS)의 만화·웹툰 서지: 제목·작가·출판사·플랫폼·ISBN·줄거리·연령. 표지 이미지는 이 경로의 계약에서 뺐다.",
      "Comic and webtoon bibliography from the KMAS manhwa archive: title, creators, publisher, platform, ISBN, synopsis and age rating. Cover images are left out of this path's contract.",
    ),
    where: t(
      "만화 레퍼런스(/references) ← GET /api/kmas/references",
      "Comic references (/references) via GET /api/kmas/references",
    ),
    guard: t(
      "허용 주소는 kmas.or.kr 도메인(HTTPS)만. 8초·2MiB, 캐시 미스 분당 30회·동시 4건이며 키를 바꾸면 캐시를 비운다. 모르는 질의 항목은 거절하고 오류에 주소(=키)를 싣지 않는다. 승인키 일 1,000회 한도는 대장 기록.",
      "Only the kmas.or.kr domain over HTTPS. 8 s and 2 MiB, 30 cache misses a minute and 4 at once; the cache is flushed when the key changes. Unknown query fields are refused and errors never carry the URL (it holds the key). The 1,000-calls-a-day quota is from the register.",
    ),
    status: "configured",
    link: { title: "KMAS open API guide", url: "https://www.kmas.or.kr/guide/openapi" },
    evidence: [
      "apps/api/src/server/kmas-reference.ts",
      "packages/contracts/src/kmas-reference.ts",
      "apps/api/src/modules/catalog/kmas-reference.controller.ts",
      "tests/integration/web-api/shared/lib/__tests__/kmas-reference.test.ts",
      REGISTER,
    ],
    asOf: "2026-09-25",
  }),
  openApiRow({
    id: "kmas-legacy",
    name: "KMAS (legacy path)",
    kind: OPEN_API_KIND.adapter,
    what: t(
      "같은 KMAS 서지를 카탈로그 작품 정보에 덧입히는 오래된 경로: 제목·시놉시스·연령 등을 메모리 카탈로그에 병합하고 표지 주소를 돌려준다.",
      "An older route that overlays the same KMAS records onto catalog titles: title, synopsis and age rating are merged into the in-memory catalog and cover URLs are returned.",
    ),
    where: t(
      "사이트 첫 진입 때 한 번 부르는 POST /api/kmas/merge-on-access, 홈·랭킹·탐색 응답 보강, GET /api/kmas/book-webtoons",
      "POST /api/kmas/merge-on-access fired once on first site entry, response enrichment for home, ranking and explore, and GET /api/kmas/book-webtoons",
    ),
    guard: t(
      "조회 캐시 24시간·동시 3건이 기본입니다. 엄격 경로(references)만큼의 보호 장치는 갖추지 않은 오래된 경로라 엄격 경로로 정리할 대상으로 봅니다. 키가 있으면 KMAS_MERGE_ON_ACCESS 를 끄기 전까지 기본 켜짐.",
      "Defaults are a 24-hour lookup cache and 3 concurrent calls. It is an older route without the full protections of the strict references path, so it is treated as a candidate for consolidation onto that path. With a key it is on until KMAS_MERGE_ON_ACCESS is switched off.",
    ),
    status: "configured",
    link: { title: "KMAS open API guide", url: "https://www.kmas.or.kr/guide/openapi" },
    evidence: [
      "apps/api/src/server/kmas.ts",
      "apps/api/src/modules/catalog/catalog.controller.ts",
      "apps/api/src/modules/catalog/catalog.service.ts",
      "apps/web/src/app/App.tsx",
      "docs/kmas-integration.md",
    ],
  }),
  openApiRow({
    id: "kasi-free-horoscope",
    name: "KASI + Free Horoscope",
    kind: OPEN_API_KIND.adapter,
    what: t(
      "한국천문연구원(KASI)의 음양력 달력·특일(공휴일·절기)과 영문 별자리 운세(Free Horoscope). 운세 화면의 달력을 외부 값과 교차 확인한다.",
      "The lunar-solar calendar and special days (holidays, solar terms) from the Korea Astronomy and Space Science Institute (KASI), plus English zodiac text from Free Horoscope. The fortune calendar is cross-checked against the external values.",
    ),
    where: t(
      "운세 화면(/fortune): 달력 교차 확인, 특일 목록, 별자리 보강",
      "Fortune page (/fortune): calendar cross-check, special-day list and zodiac enrichment",
    ),
    guard: t(
      "기본 꺼짐(운영자 플래그). 하루 호출 예산과 연속 3회 실패 시 60초 차단을 서버들이 공유하고, 2.5초·128KiB·XML 방어, 로컬 계산과 대조. 별자리는 권리 승인·정책 리비전이 없으면 '권리 대기'. 자동 유료 전환 없음.",
      "Off by default (operator flags). A daily call budget and a 60-second pause after 3 straight failures are shared across servers; 2.5 s, 128 KiB, XML hardening and a cross-check against local math. Zodiac text stays 'rights pending' without a rights approval and policy revision. No automatic paid fallback.",
    ),
    status: "configured",
    link: { title: "KASI lunar-solar calendar on data.go.kr", url: "https://www.data.go.kr/data/15012679/openapi.do" },
    evidence: [
      "apps/api/src/modules/fortune/fortune-enrichment.provider.ts",
      "apps/api/src/modules/fortune/fortune-enrichment.service.ts",
      "apps/api/src/modules/fortune/fortune-special-days.provider.ts",
      "apps/api/src/modules/fortune/fortune-enrichment.test.ts",
      "docs/fortune-api-enrichment.md",
    ],
  }),
  openApiRow({
    id: "data4library",
    name: "Data4Library",
    kind: OPEN_API_KIND.adapter,
    what: t(
      "도서관 정보나루: ISBN으로 그 책을 소장한 공공도서관 목록(이름·주소·전화·홈페이지·좌표).",
      "Data4Library: the public libraries that hold a given ISBN, with name, address, phone, homepage and coordinates.",
    ),
    where: t(
      "만화 서재의 소장 도서관 찾기(/ecosystem/library ← GET /api/creator-ecosystem/library/holdings)",
      "Finding libraries that hold a book in the comic library (/ecosystem/library via GET /api/creator-ecosystem/library/holdings)",
    ),
    guard: t(
      "ISBN-13 검사, 10초 타임아웃, 선언 길이 2MiB 확인 뒤 본문을 다 읽고 파싱 때 바이트를 다시 잰다. XML 선언 거부·깊이 16·최대 100곳. 키가 없으면 공식 링크만 준다(대장은 키 미신청으로 기록).",
      "ISBN-13 is validated, with a 10-second timeout and a declared-length check at 2 MiB; the body is read in full and its bytes re-measured at parse time. XML declarations are refused, depth is capped at 16 and results at 100. Without a key only an official link is returned (the register lists the key as not applied for).",
    ),
    status: "configured",
    link: { title: "Data4Library API usage", url: "https://www.data4library.kr/apiUtilization" },
    evidence: [
      "apps/api/src/modules/creator-ecosystem/creator-ecosystem.service.ts",
      "apps/api/src/modules/creator-ecosystem/library-holdings-xml.ts",
      "apps/api/src/modules/creator-ecosystem/library-holdings-xml.test.ts",
      REGISTER,
    ],
  }),
  openApiRow({
    id: "youtube-search",
    name: "YouTube Data API",
    kind: OPEN_API_KIND.adapter,
    what: t(
      "YouTube Data API v3 검색(search.list): 웹툰 제작 강좌·자료 영상의 제목·채널·썸네일·링크.",
      "YouTube Data API v3 search (search.list): titles, channels, thumbnails and links of webtoon-making lessons and videos.",
    ),
    where: t(
      "강좌·자료 라이브러리의 영상 검색(/learn/resources ← GET /api/learning/youtube/search)",
      "Video search in the lesson and resource library (/learn/resources via GET /api/learning/youtube/search)",
    ),
    guard: t(
      "키는 서버에만 두고 임베드 가능한 영상·보통 안전검색·한국어로 좁혀 요청한다. 6초 타임아웃, 메모리 캐시 10분·100건. 실패하면 YouTube 검색 링크로 대신한다. 사용자별 호출 한도는 코드에 없다.",
      "The key stays on the server and requests are narrowed to embeddable videos, moderate safe-search and Korean. 6-second timeout and an in-memory cache of 10 minutes and 100 entries. On failure a plain YouTube search link is offered. There is no per-user call limit in code.",
    ),
    status: "configured",
    link: { title: "YouTube Data API: Search.list", url: "https://developers.google.com/youtube/v3/docs/search/list" },
    evidence: [
      "apps/api/src/modules/learning/learning.module.ts",
      "apps/api/src/modules/learning/learning.module.test.ts",
      "apps/web/src/domains/learn/learning-resource-client.ts",
      REGISTER,
    ],
  }),
  openApiRow({
    id: "creator-intelligence",
    name: "Creator Intelligence data",
    kind: OPEN_API_KIND.adapter,
    what: t(
      "스튜디오 참고 검색: Openverse(키 없음)·Pexels·Pixabay의 이미지·영상 참고와 DeepL·LibreTranslate 번역 초안. AniList·Freesound·서버 날씨는 기본 꺼짐.",
      "Studio reference search: image and video references from Openverse (keyless), Pexels and Pixabay, plus DeepL and LibreTranslate translation drafts. AniList, Freesound and server-side weather are off by default.",
    ),
    where: t(
      "스튜디오의 Creator Intelligence 패널(GET /api/creator-intelligence/references 등)",
      "The Studio Creator Intelligence panel (GET /api/creator-intelligence/references and its siblings)",
    ),
    guard: t(
      "10초·2MiB·리디렉션 차단. 결과에 '가져오기 불가(importable:false)'와 권리 상태를 붙이고 Pexels 6시간·Pixabay 24시간 캐시. 준비/미설정/비활성을 구분해 알린다. 조회 GET에는 사용자별 한도 코드가 없다.",
      "10 s, 2 MiB and no redirects. Results are tagged non-importable (importable:false) with a rights status; Pexels is cached for 6 hours and Pixabay for 24. Ready, not configured and disabled are reported separately. The read-only GET routes have no per-user limit in code.",
    ),
    status: "configured",
    link: { title: "Openverse API", url: "https://api.openverse.org/v1/" },
    evidence: [
      "apps/api/src/modules/creator-intelligence/creator-intelligence-core.ts",
      "apps/api/src/modules/creator-intelligence/creator-intelligence.module.ts",
      "apps/api/src/modules/creator-intelligence/creator-intelligence-core.test.ts",
      "apps/web/src/domains/creator/creator-intelligence/studio-creator-intelligence-client.ts",
    ],
  }),
  openApiRow({
    id: "neis-edge",
    name: "NEIS (Cloudflare edge)",
    kind: OPEN_API_KIND.adapter,
    what: t(
      "같은 NEIS 학교 검색을 Cloudflare Worker가 가로채 직접 처리한다. 무료 빌드 시간이 소진된 동안에도 검색이 이어지도록 둔 우회로다(대장 기록).",
      "A Cloudflare Worker intercepts the same NEIS school search and answers it directly, so search keeps working while the free build time is used up (per the register).",
    ),
    where: t(
      "학교물 배경 설정(/research/open-data/neis)과 같은 검색 주소 /api/creator-resources/search?provider=neis",
      "School-story setup (/research/open-data/neis) through the same search address, /api/creator-resources/search?provider=neis",
    ),
    guard: t(
      "6초, 응답 2MiB(본문을 다 읽은 뒤 검사), 사용자 분당 5회·전체 분당 30회, 15분 캐시. 키가 실패하면 10분 쉬고 키 없는 공개 샘플 5건으로 줄여 답하며 헤더(keyed/sample)로 표시한다.",
      "6 s, a 2 MiB reply cap (checked after reading the whole body), 5 requests per user and 30 overall per minute, and a 15-minute cache. If the key fails it rests for 10 minutes and answers from the keyless public sample of 5 records, flagged in a header (keyed or sample).",
    ),
    status: "configured",
    link: { title: "NEIS open API guide", url: "https://open.neis.go.kr/portal/guide/apiGuidePage.do" },
    evidence: [
      "deploy/cloudflare-static/src/neis-creator-resource-edge.ts",
      "deploy/cloudflare-static/src/index.ts",
      "deploy/cloudflare-static/README.md",
      REGISTER,
    ],
  }),
];

/** 방문자 브라우저가 서버를 거치지 않고 부르는 곳. 허용 범위는 CSP connect-src 와 코드 상수가 함께 정한다. */
export const OPEN_API_BROWSER_ROWS: readonly EngineeringMapRow[] = [
  openApiRow({
    id: "open-creation",
    name: "Open Creation (browser)",
    kind: OPEN_API_KIND.browser,
    what: t(
      "방문자 브라우저가 서버를 거치지 않고 직접 묻는다: 시카고·클리블랜드 미술관의 CC0 작품, Wikimedia Commons의 CC0 이미지, 한국어 위키백과 문서 제목·링크.",
      "The visitor's browser asks the providers directly: CC0 works from the Chicago and Cleveland museums, CC0 images from Wikimedia Commons, and Korean Wikipedia titles and links.",
    ),
    where: t(
      "Open Creation(/research/open-creation): 자료 보드와 창작 브리프(4컷 콘티 등)",
      "Open Creation (/research/open-creation): reference board and creation briefs such as four-panel outlines",
    ),
    guard: t(
      "15초 중단·쿠키 미전송·리디렉션 차단·응답 2MiB(스트림 검사)·24시간 로컬 캐시(새로 못 받으면 '최신 아님' 안내). Commons는 CC0·출처표시 불필요·제한 없음·썸네일 호스트가 모두 맞는 파일만 통과한다.",
      "15-second abort, no cookies, no redirects, a 2 MiB cap read as a stream, and a 24-hour local cache (a failed refresh is labelled 'not the latest'). A Commons file passes only if it is CC0, needs no attribution, has no restriction and uses an approved thumbnail host.",
    ),
    status: "live",
    link: { title: "MediaWiki Action API", url: "https://www.mediawiki.org/wiki/API:Main_page" },
    evidence: [
      "apps/web/src/domains/creator-resources/open-creation.ts",
      "apps/web/src/domains/creator-resources/open-creation-transport.ts",
      "apps/web/src/domains/creator-resources/OpenCreationPage.tsx",
      "apps/web/src/domains/creator-resources/open-creation.test.ts",
      HEADERS,
    ],
  }),
  openApiRow({
    id: "unsplash",
    name: "Unsplash",
    kind: OPEN_API_KIND.browser,
    what: t(
      "Unsplash 사진 검색 API. 사용자가 자기 Access Key를 넣으면 브라우저가 api.unsplash.com 에 직접 묻는다(BYOK: 내 키를 내가 가져오기).",
      "Unsplash photo search. When users enter their own Access Key, the browser queries api.unsplash.com directly (BYOK: bring your own key).",
    ),
    where: t(
      "스튜디오 스톡 사진 패널, 연동 키 화면(/settings/api-keys)",
      "The Studio stock-photo panel and the API-key screen (/settings/api-keys)",
    ),
    guard: t(
      "키는 이 탭의 sessionStorage에만 두고 서버로 보내지 않는다. 주소는 코드 상수와 CSP 허용 목록이 정한다. 크레딧 링크(UTM)와 download_location 호출 의무는 지키지만 fetch 타임아웃은 없고 download_location은 응답 값을 그대로 부른다.",
      "The key lives only in this tab's sessionStorage and never reaches our server. Addresses come from code constants and the CSP allowlist. Credit links (UTM) and the download_location call are honoured, but fetches have no timeout and download_location is called exactly as the reply gives it.",
    ),
    status: "configured",
    link: { title: "Unsplash API documentation", url: "https://unsplash.com/documentation" },
    evidence: [
      "apps/web/src/domains/creator/studio-stock-image-client.ts",
      "apps/web/src/domains/creator/StudioStockImagePanel.tsx",
      "apps/web/src/domains/integrations/api-key-hub/UnsplashKeyConnectCard.tsx",
      "apps/web/src/domains/creator/studio-stock-image-client.test.ts",
      HEADERS,
    ],
  }),
  openApiRow({
    id: "open-meteo-ambient",
    name: "Open-Meteo (ambient weather)",
    kind: OPEN_API_KIND.browser,
    what: t(
      "Open-Meteo의 현재 기온·날씨 코드. 사이트 배경 효과(비·눈·햇살)와 가상 스튜디오 날씨에 쓴다. 기본 위치는 서울.",
      "Current temperature and weather code from Open-Meteo, used for the site's background effects (rain, snow, sunshine) and the virtual studio weather. The default location is Seoul.",
    ),
    where: t(
      "사이트 전역 배경 효과(ambient), 가상 스튜디오 날씨",
      "Site-wide ambient background effects and the virtual studio weather",
    ),
    guard: t(
      "10초·쿠키 미전송, 사이트 배경은 좌표를 0.01도(약 1km)로 반올림. 운영 헤더가 위치 권한을 막아 사실상 서울 고정. 레지스트리는 '상업 플랜 필요·운영 비활성'인데 브라우저는 무료 공개 주소를 직접 부른다 — 약관 대조 미조사.",
      "10-second limit, no cookies, and the site background rounds coordinates to 0.01 degree (about 1 km). The production header blocks location access, so it is effectively fixed to Seoul. The registry says a commercial plan is needed and the adapter is off, yet the browser calls the free public endpoint directly; the terms were not checked.",
    ),
    status: "live",
    link: { title: "Open-Meteo terms of use", url: "https://open-meteo.com/en/terms" },
    evidence: [
      "apps/web/src/shared/ambient/ambient-weather.ts",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-weather.ts",
      "apps/web/src/domains/creator-resources/sources.ts",
      HEADERS,
    ],
  }),
  openApiRow({
    id: "mymemory",
    name: "MyMemory",
    kind: OPEN_API_KIND.browser,
    what: t(
      "MyMemory 번역 API. 번역본이 없는 화면 문구를 다른 언어로 자동 번역해 채운다(기계 번역).",
      "MyMemory translation API. Interface strings that lack a translation are machine-translated into the visitor's language.",
    ),
    where: t(
      "화면 언어를 바꿀 때 번역이 비어 있는 문구(런타임 번역)",
      "Interface text without a translation when the visitor switches language (runtime translation)",
    ),
    guard: t(
      "8초 중단·24시간 캐시·동시 8건. {개수} 같은 자리표시자가 사라진 번역은 버린다. 이 호스트는 CSP 허용 목록에 없어 운영 브라우저에서 막힐 수 있다(미확인).",
      "8-second abort, 24-hour cache and 8 requests at once. A translation that loses a {placeholder} is discarded. This host is not in the CSP allowlist, so a production browser may block it (unverified).",
    ),
    status: "configured",
    link: { title: "MyMemory API specification", url: "https://mymemory.translated.net/doc/spec.php" },
    evidence: ["apps/web/src/shared/lib/i18n-runtime-translation.ts", HEADERS],
  }),
  openApiRow({
    id: "ipfs-gateways",
    name: "IPFS public gateways",
    kind: OPEN_API_KIND.browser,
    what: t(
      "IPFS 공개 게이트웨이(trustless-gateway.link·ipfs.io·dweb.link)에서 CID(내용으로 정해지는 주소)로 파일을 받아 온다.",
      "Files are fetched by CID (an address derived from the content) from public IPFS gateways: trustless-gateway.link, ipfs.io and dweb.link.",
    ),
    where: t(
      "통합 연동 센터의 IPFS 콘텐츠 주소 패널(/settings/integrations)",
      "The IPFS content-address panel in the integration center (/settings/integrations)",
    ),
    guard: t(
      "받은 바이트를 CID 해시와 대조해 다르면 거부한다(raw·sha2-256만). 15초 타임아웃은 있으나 응답 크기 상한은 없다. CSP 허용 목록에 없어 운영 브라우저에서 막힐 수 있다(미확인). @helia/verified-fetch는 쓰지 않는다.",
      "Downloaded bytes are hashed and compared with the CID, and a mismatch is rejected (raw codec and sha2-256 only). There is a 15-second timeout but no response size cap. The gateways are not in the CSP allowlist, so a production browser may block them (unverified). @helia/verified-fetch is not used.",
    ),
    status: "configured",
    link: { title: "IPFS gateways", url: "https://docs.ipfs.tech/concepts/ipfs-gateway/" },
    evidence: [
      "apps/web/src/domains/integrations/ipfs-content-address.ts",
      "apps/web/src/domains/integrations/IpfsContentAddressPanel.tsx",
      "apps/web/src/domains/integrations/ipfs-content-address.test.ts",
      HEADERS,
    ],
  }),
];

/** 서버가 운영자 토큰·웹훅으로 외부 서비스를 부르는 11개 커넥터를 성격별로 4묶음으로 보였다. 공통 관문은 transport·service 가 소유한다. */
export const OPEN_API_CONNECTOR_ROWS: readonly EngineeringMapRow[] = [
  openApiRow({
    id: "runtime-work-tools",
    name: "Notion · Linear · Jira · Trello",
    kind: OPEN_API_KIND.connector,
    what: t(
      "프로젝트의 할 일을 외부 작업 도구에 만들거나 고친다(task.upsert). 운영자가 넣은 토큰으로 호출하고, 사용자 비밀번호는 받지 않는다.",
      "Creates or updates a project task in an outside work tool (task.upsert). Calls use operator-provided tokens; user passwords are never accepted.",
    ),
    where: RUNTIME_ENTRY,
    guard: t(
      "모의 실행(dryRun)과 확정(confirm)을 나누고, 요청 ID(UUID)와 SHA-256 지문으로 같은 요청이 한 번만 실행된다. 사용자당 하루 100회(기본), 요청 128KiB·응답 1MiB·15초, 허용 호스트만(Jira는 .atlassian.net).",
      "Dry run and confirmation are separate steps, and a request ID (UUID) plus SHA-256 digest makes a repeated request run only once. 100 runs per user per day by default, 128 KiB requests, 1 MiB replies, 15 s, and allowed hosts only (Jira: .atlassian.net).",
    ),
    status: "configured",
    link: { title: "Notion API reference", url: "https://developers.notion.com/reference/intro" },
    evidence: [RUNTIME, RUNTIME_TRANSPORT, RUNTIME_SERVICE, RUNTIME_DOC, RUNTIME_TEST],
  }),
  openApiRow({
    id: "runtime-messages",
    name: "Slack · Microsoft Teams · Zoom",
    kind: OPEN_API_KIND.connector,
    what: t(
      "알림 메시지를 Slack·Teams 웹훅으로 보내고, Zoom에는 검토 회의를 만든다. 회의는 참석 URL만 남긴다.",
      "Sends notification messages to Slack and Teams webhooks and creates review meetings in Zoom. Only the attendee URL of a meeting is kept.",
    ),
    where: RUNTIME_ENTRY,
    guard: t(
      "공통 커넥터 관문(HTTPS·허용 호스트·리디렉션 차단·1MiB)에 웹훅 응답 64KiB 상한을 더한다. 결과가 불확실하면(시간 초과 등) 자동 재실행하지 않고 'uncertain' 영수증을 남긴다.",
      "The shared connector gate (HTTPS, allowed hosts, no redirects, 1 MiB) plus a 64 KiB cap on webhook replies. When an outcome is uncertain, for example after a timeout, nothing is retried automatically and an 'uncertain' receipt is stored.",
    ),
    status: "configured",
    link: {
      title: "Slack incoming webhooks",
      url: "https://docs.slack.dev/messaging/sending-messages-using-incoming-webhooks/",
    },
    evidence: [RUNTIME, RUNTIME_TRANSPORT, RUNTIME_SERVICE, RUNTIME_DOC, RUNTIME_TEST],
  }),
  openApiRow({
    id: "runtime-figma",
    name: "Figma",
    kind: OPEN_API_KIND.connector,
    what: t(
      "Figma 파일·노드를 읽어 출처가 보존된 인계 요약을 만든다(design.inspect, 읽기 전용).",
      "Reads a Figma file or nodes and builds a source-preserving handoff summary (design.inspect, read-only).",
    ),
    where: RUNTIME_ENTRY,
    guard: t(
      "읽기 전용이라 프로젝트 '보기' 권한으로 충분하다(쓰기 커넥터는 '편집' 권한). api.figma.com만 허용하고, 서명이 붙은 이미지 주소는 영수증에 저장하지 않는다.",
      "Read-only, so project view permission is enough (write connectors need edit permission). Only api.figma.com is allowed, and signed image URLs are not stored in the receipt.",
    ),
    status: "configured",
    link: { title: "Figma REST API", url: "https://developers.figma.com/docs/rest-api/" },
    evidence: [RUNTIME, RUNTIME_SERVICE, RUNTIME_DOC, RUNTIME_TEST],
  }),
  openApiRow({
    id: "runtime-signals",
    name: "Naver DataLab · Wikidata · Google Books (connector)",
    kind: OPEN_API_KIND.connector,
    what: t(
      "작품 관련 관심 신호와 공개 메타데이터를 읽는다(trends.read): 네이버 검색 관심도 추이, Wikidata 개체 검색, Google Books 도서 검색.",
      "Reads interest signals and public metadata (trends.read): Naver search-interest trends, Wikidata entity search and Google Books volume search.",
    ),
    where: RUNTIME_ENTRY,
    guard: t(
      "읽기 전용. Wikidata·Google Books는 키 없이도 도는 공개 프로토콜이고 네이버는 운영자 토큰이 필요하다. 이 경로는 Google Books 키를 주소 쿼리로 보낸다 — 엔진 경로(헤더)와 다르다. 관심 신호끼리 합산하지 않는다.",
      "Read-only. Wikidata and Google Books run as public protocols without keys, while Naver needs an operator token. This path sends the Google Books key in the query string, unlike the engine path (header). Interest signals are never added together.",
    ),
    status: "configured",
    link: {
      title: "Naver DataLab search trend API",
      url: "https://developers.naver.com/docs/serviceapi/datalab/search/search.md",
    },
    evidence: [RUNTIME, RUNTIME_TRANSPORT, RUNTIME_DOC, RUNTIME_TEST],
  }),
];

/** 우리가 밖에 여는 개발자용 Open API. 실행 장치가 아니라 계약 선언까지만 있다. */
export const OPEN_API_OURS_ROWS: readonly EngineeringMapRow[] = [
  openApiRow({
    id: "developer-manifest",
    name: "ToonStudio developer manifest",
    kind: OPEN_API_KIND.ours,
    what: t(
      "외부 개발자를 위한 '계약 선언' JSON 1개: 권한 범위(scope) 10개, 이벤트 14개, 액션 14개, 서명 웹훅 규격, 안전 규칙, 공급자 수 49.",
      "One published contract JSON for outside developers: 10 permission scopes, 14 events, 14 actions, the signed-webhook format, safety rules and a provider count of 49.",
    ),
    where: t(
      "개발자 포털(/developers): 시작 안내와 JSON 내려받기 ← 공개 GET /api/integrations/developer-manifest",
      "Developer portal (/developers): start guide and JSON download, served by the public GET /api/integrations/developer-manifest",
    ),
    guard: t(
      "공개 GET이며 5분 캐시. 아직 없는 것: 외부 개발자용 API 키·OAuth 앱·scope 강제·OpenAPI 문서·개발자별 웹훅 구독·버전 정책. 선언의 timestamp 헤더명도 실제 송신 헤더와 다르다.",
      "A public GET cached for 5 minutes. Not built yet: API keys for outside developers, OAuth apps, scope enforcement, OpenAPI docs, per-developer webhook subscriptions and a versioning policy. The declared timestamp header name also differs from the header actually sent.",
    ),
    status: "documented",
    evidence: [
      "apps/api/src/modules/integration-platform/integration-platform.controller.ts",
      "apps/api/src/modules/integration-platform/integration-platform.service.ts",
      "apps/api/src/modules/integration-platform/integration-platform.catalog.ts",
      "apps/web/src/domains/integrations/DeveloperPlatformPage.tsx",
      "apps/api/src/modules/production-collaboration/production-notification-provider.ts",
      "docs/integration-platform.md",
    ],
  }),
];
