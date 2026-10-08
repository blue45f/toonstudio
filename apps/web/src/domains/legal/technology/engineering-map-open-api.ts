import {
  OPEN_API_ADAPTER_ROWS,
  OPEN_API_BROWSER_ROWS,
  OPEN_API_CONNECTOR_ROWS,
  OPEN_API_OURS_ROWS,
} from "./engineering-map-open-api-rows-other";
import { OPEN_API_ENGINE_ROWS, t } from "./engineering-map-open-api-rows";

import type { EngineeringDiagram } from "./engineering-diagram-types";
import type { EngineeringMap } from "./engineering-map-types";

/**
 * 기술 지도 · open-api — 서비스가 활용한 Open API 전체 지도.
 * 계약과 작성 규칙은 engineering-map-types.ts 를 따른다. 행은 engineering-map-open-api-rows*.ts 에 있다.
 * 기준: 2026-10-07 코드 읽기. 운영 서버의 키 등록·실호출 성공·남은 한도는 확인하지 못했다(미확인).
 */

/** 외부 API 응답이 화면에 오르기까지 거치는 공통 관문(서버 ResourceEngine 기준). */
const OPEN_API_GATE_DIAGRAM: EngineeringDiagram = {
  id: "open-api-gate-diagram",
  kind: "graph",
  title: t("외부 API 호출 공통 관문", "The common gate for outside APIs"),
  caption: t(
    "남의 데이터는 '검증 안 된 입력'이라 관문을 모두 통과해야 화면에 오릅니다.",
    "Outside data is unverified input, so it must pass every gate before it reaches the screen.",
  ),
  alt: t(
    "요청은 먼저 허용된 호스트인지 확인한 뒤, 공급자 API의 응답을 6초 안에 리디렉션 없이 2MiB 이하로만 받습니다. 받은 응답은 구조 검사와 권리 조건 검사를 거쳐 통과한 항목에만 출처 영수증을 붙여 화면에 올리고, 어느 단계에서든 어긋나면 빈 성공이 아니라 이용 불가 또는 부분 성공으로 알립니다.",
    "A request first checks that the host is allowed, then the provider's reply is taken within 6 seconds, without redirects and at no more than 2 MiB. Items that pass the structure check and the rights check get a source receipt and reach the screen; a failure at any step is reported as unavailable or partial, never as an empty success.",
  ),
  nodes: [
    {
      id: "request",
      label: t("외부 데이터 요청", "Data request"),
      sub: t("검색어·쪽수 먼저 검증", "Query and page checked first"),
      tone: "neutral",
      shape: "pill",
      at: [0, 0],
    },
    {
      id: "host",
      label: t("허용 호스트만", "Allowed hosts"),
      sub: t("주소는 서버 코드에 고정", "Hosts fixed in code"),
      tone: "server",
      at: [1, 0],
    },
    {
      id: "provider",
      label: t("공급자 API", "Provider API"),
      sub: t("6초·리디렉션 차단·2MiB", "6 s, no redirects, 2 MiB"),
      tone: "external",
      shape: "cloud",
      at: [2, 0],
    },
    {
      id: "shape",
      label: t("응답 모양 검사", "Shape guard"),
      sub: t("예상한 구조인지 확인", "Hand-written structure checks"),
      tone: "server",
      at: [3, 0],
    },
    {
      id: "rights",
      label: t("권리 승격", "Rights gate"),
      sub: t("맞아야 CC0, 아니면 제외", "CC0 only if all rules pass; else drop"),
      tone: "good",
      at: [4, 0],
    },
    {
      id: "fail",
      label: t("이용 불가로 알림", "Reported as unavailable"),
      sub: t("빈 성공으로 위장 안 함", "Never faked as an empty success"),
      tone: "warn",
      at: [3, 1],
    },
    {
      id: "receipt",
      label: t("출처 영수증", "Source receipt"),
      sub: t("출처·라이선스·조회 시각", "Source, license, time"),
      tone: "server",
      at: [4, 1],
    },
    {
      id: "screen",
      label: t("화면", "Screen"),
      sub: t("브라우저가 다시 검증", "Browser re-checks"),
      tone: "local",
      shape: "pill",
      at: [4, 2],
    },
  ],
  edges: [
    { from: "request", to: "host", label: t("검색어", "query") },
    { from: "host", to: "provider", label: t("허용 주소만", "allowed only") },
    { from: "provider", to: "shape", label: t("응답", "reply") },
    { from: "shape", to: "rights", label: t("구조 통과", "shape ok") },
    { from: "rights", to: "receipt", label: t("조건 충족", "rules met") },
    { from: "receipt", to: "screen", label: t("표시", "show") },
    { from: "host", to: "fail", style: "dashed", label: t("허용 밖", "not allowed") },
    { from: "provider", to: "fail", style: "dashed", label: t("시간·크기 초과", "limit hit") },
    { from: "shape", to: "fail", style: "dashed", label: t("구조 불일치", "bad shape") },
  ],
};

export const ENGINEERING_MAP_OPEN_API: EngineeringMap | null = {
  id: "open-api",
  title: t("서비스가 활용한 Open API 지도", "Open API map: what the service borrows"),
  intro: t(
    "Open API는 다른 기관이 '이 주소로 물어보면 데이터를 드립니다' 하고 열어 둔 창구입니다. 이 지도는 ToonStudio가 어떤 창구를 어느 기능에 쓰는지, 그리고 응답을 믿기 전에 어떤 보호 장치를 거치는지 한 표로 보여 줍니다.",
    "An Open API is a window another organization opens with the promise: ask at this address and we will hand over data. This map lists which windows ToonStudio uses, for which feature, and which safeguards a reply must pass before we trust it.",
  ),
  takeaway: t(
    "남의 데이터는 빌려 쓰는 것입니다. 정해진 시간·크기·출처 안에서만 받고, 권리가 확인된 것만 자유 이용으로 올립니다. 우리가 밖에 여는 개발자용 Open API는 아직 '계약 선언'까지입니다.",
    "Outside data is borrowed, not owned. We take it only within set time, size and source limits and promote only what passes the rights check. The developer Open API we offer to others is, so far, a published contract rather than a working product.",
  ),
  columns: [
    { id: "kind", label: t("종류", "Kind"), narrow: true },
    { id: "what", label: t("무엇을 가져오나", "What it brings in") },
    { id: "where", label: t("어느 기능에서 쓰이나", "Where it is used") },
    { id: "guard", label: t("보호 장치", "Safeguards") },
  ],
  rows: [
    ...OPEN_API_ENGINE_ROWS,
    ...OPEN_API_ADAPTER_ROWS,
    ...OPEN_API_BROWSER_ROWS,
    ...OPEN_API_CONNECTOR_ROWS,
    ...OPEN_API_OURS_ROWS,
  ],
  diagram: OPEN_API_GATE_DIAGRAM,
  notes: [
    t(
      "공급자는 언제든 바뀔 수 있어 이 지도는 확인 날짜(2026-10-07)와 함께 읽습니다. 상태는 코드 읽기 기준이며, 운영 서버의 키 등록·실제 호출 성공·남은 한도는 확인하지 못했습니다(미확인). 약관 검토일(2026-09-25)과 한도 수치는 저장소 기록을 그대로 옮겼습니다. CSP는 브라우저가 접속을 허락하는 주소 목록입니다. 로그인·결제·클라우드 백업·AI 공급자 연동은 이 지도 밖입니다.",
      "Providers can change at any time, so read this map together with its review date (2026-10-07). Statuses come from reading the code; key registration on the production server, real call success and remaining quotas were not verified. Terms-review dates (2026-09-25) and quota figures are copied from repository records. CSP is the list of addresses a browser is allowed to contact. Login, payment, cloud backup and AI-provider integrations are outside this map.",
    ),
    t(
      "권리 게이트: 공급자가 CC0(저작권을 내려놓아 누구나 자유롭게 쓸 수 있다는 표시)라고 적었다고 믿지 않고, 공급자별 조건·호스트·형식을 모두 통과한 항목만 CC0로 올립니다. 못 올리면 참고 전용·메타데이터 전용으로 내리고(메타데이터 전용이면 이미지 주소도 지워집니다), 이 등급과 출처·조회 시각을 '출처 영수증'에 적습니다. 다만 영수증 모양이 6종(엔진·Creator Intelligence·운세·KMAS·커넥터·Open Creation)으로 통일돼 있지 않고, 등급을 읽어 화면의 가져오기를 막는 코드도 아직 없습니다(코드 검색 기준).",
      "Rights gate: a provider's own CC0 label (the creator gave up copyright so anyone may use the work freely) is not taken on faith. Only items that pass the provider-specific rules, host and format checks are promoted to CC0; the rest are lowered to reference-only or metadata-only (metadata-only items lose their image address), and the grade, source and fetch time are written on a source receipt. The receipt has six different shapes (engine, Creator Intelligence, fortune, KMAS, connectors, Open Creation) that are not unified, and no code yet reads the grade to block an import button (by code search).",
    ),
    t(
      "표지 이미지 중계(GET /api/cover)는 데이터 API가 아니라 이미지 중계라 이 표에 넣지 않았습니다. 허용 호스트 33곳을 서버 상수로 고정하고, 리디렉션마다 다시 검사하며, 10MiB 상한·이미지 판별(헤더 또는 첫 바이트)·COVER_IMAGE_POLICY=off 킬스위치(404)를 둡니다. 사용자가 준 주소를 가져오는 곳(참조 이미지·운영 웹훅)은 별도로 공개 주소만 허용하고 DNS 확인 결과를 고정(핀닝)합니다.",
      "The cover-image relay (GET /api/cover) is an image relay rather than a data API, so it is not a row here. It fixes 33 allowed hosts as server constants, re-checks every redirect, caps images at 10 MiB, recognises images by header or first bytes, and has a COVER_IMAGE_POLICY=off kill switch (404). Places that fetch a user-supplied address (reference images, operator webhooks) separately accept public addresses only and pin the DNS result.",
    ),
    t(
      "기존 기술 자료에서 바로잡은 점. (1) AIC: '구조 변경·429는 항목 단위 제외'는 틀렸습니다. 항목 단위 제외는 권리·이미지 위반뿐이고, 구조 변경·한도 초과·시간 초과는 요청 전체가 '이용 불가'입니다. (2) Unsplash: 증거 경로는 free-ai-policy.ts가 아니라 studio-stock-image-client.ts이고, '공식 endpoint만 허용'은 코드가 아니라 CSP가 강제합니다. (3) Wikimedia: 한 항목에 서로 다른 API 3개(브라우저 Commons·서버 Pageviews·커넥터 Wikidata)가 섞여 있었습니다. (4) '검증된 Open API adapter 8'은 과소 표기입니다(서버 엔진만 26곳). (5) 개발자 포털의 '49개 공급자가 같은 안전 경계'는 과장입니다. 통합 카탈로그는 필수 환경변수만 채우면 ready로 판정하지만, 공급자별 코드 검색으로 센 바로는 49곳 중 약 20곳은 실행 코드가 없습니다(런타임 커넥터 11곳과 기존 모듈로 이어진 곳 밖이며, 정확한 목록은 저장소에 없습니다).",
      "Corrections to earlier material. (1) AIC: 'schema drift and 429 fail per item' was wrong. Only rights or image violations drop single items; a changed schema, a rate limit or a timeout makes the whole request unavailable. (2) Unsplash: the evidence file is studio-stock-image-client.ts, not free-ai-policy.ts, and 'official endpoint only' is enforced by the CSP, not by code. (3) Wikimedia: one entry mixed three different APIs (browser Commons, server Pageviews, connector Wikidata). (4) 'Verified Open API adapters: 8' undercounts (the server engine alone has 26). (5) The developer portal's '49 providers share the same safety boundary' overstates: the integration catalog marks an entry ready once its required environment variables exist, yet a provider-by-provider code search finds about 20 of the 49 entries with no execution code (outside the 11 runtime connectors and the entries tied to existing modules; the exact list is not in the repository).",
    ),
  ],
  reviewedAt: "2026-10-07",
};
