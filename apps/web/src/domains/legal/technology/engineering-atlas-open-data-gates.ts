import { codePair, t } from "./engineering-atlas-open-data-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * open-data 카드 1: 서버 ResourceEngine 의 공통 계약 · 권리 승격과 출처 영수증 · 함수 주입형 어댑터.
 * 사실 근거는 카드마다 usage.paths 와 facts.source 에 둔 파일이다(2026-10-07 코드와 대조).
 */
export const OPEN_DATA_GATE_CARDS: readonly EngineeringAtlasEntry[] = [
  {
    id: "resource-engine-one-contract",
    category: "open-data",
    name: "ResourceEngine",
    title: t("26개 공급자를 한 계약으로 묶는 자료 엔진", "One engine and one contract for 26 data providers"),
    status: "live",
    tagline: t("미술관·도서·공공데이터 API를 서버 한 곳에서 같은 규칙으로 호출합니다.", "Museum, book and public-data APIs are all called from one server place under the same rules."),
    background: [
      t(
        "외부 Open API는 공급자마다 주소·응답 모양·호출 한도가 제각각입니다. 화면이 직접 부르면 느린 응답 하나, 모양이 바뀐 데이터 하나가 화면 전체를 흔듭니다. ToonStudio는 이를 택배 검수대처럼 풀었습니다. 모든 요청이 서버의 ResourceEngine(자료 엔진) 한 곳을 지나고, 같은 검수를 통과한 결과만 화면에 올라갑니다.",
        "Every open API has its own address, response shape and call limit. If the screen called them directly, one slow reply or one changed payload could shake the whole page. ToonStudio treats it like a parcel inspection desk: every request goes through one server-side ResourceEngine, and only results that pass the same inspection reach the screen.",
      ),
      t(
        "요청 한 건은 관문 다섯 개를 지납니다. ① 입력 검증(공급자 목록, 검색어 2~80자, 페이지 1~20) ② 한도(클라이언트당 분당 20회, 호스트별·전역 상한, 429/503 쿨다운) ③ 호출(6초 타임아웃, 리디렉션 차단, 쿠키 미전송) ④ 응답 검사(2MiB 상한, JSON 형식, 호스트별 모양 검사) ⑤ 정규화(parseResource가 권리와 출처 호스트 확인). 어느 관문에서 실패해도 빈 성공이 아니라 '불러오지 못함'으로 알립니다.",
        "A request crosses five gates: 1 input validation (known provider, 2-80 character query, page 1-20); 2 limits (20 per minute per client, per-host and global ceilings, a 429/503 cooldown); 3 the call (6 s timeout, redirects refused, no cookies); 4 response checks (2 MiB cap, JSON type, per-host shape guard); 5 normalization (parseResource verifies rights and source hosts). A failure at any gate is reported as unavailable, never as an empty success.",
      ),
      t(
        "대안은 공급자마다 SDK나 스키마 라이브러리를 두는 방식입니다. 이 프로젝트는 공급자 파일에 'URL 만들기 + 응답 모양 검사 + 변환'만 두고, 네트워크·예산·캐시는 엔진이 한 번만 구현하게 했습니다. 모양 검사는 라이브러리가 아니라 호스트·경로별로 손으로 쓴 type guard입니다. 필요한 필드만 보는 작은 검사라 가볍지만, 공급자를 늘릴 때마다 직접 써야 하는 것이 대가입니다.",
        "The alternative is an SDK or schema library per provider. Here each provider file only builds the URL, checks the response shape and converts it, while the engine implements network, budget and cache once. The shape check is a hand-written type guard per host and path rather than a library: light because it only reads the fields it needs, but every new provider means writing one more guard.",
      ),
      t(
        "한도와 캐시는 서버 프로세스 메모리 안에서만 셉니다. 서버가 여러 대로 늘면 한도도 그만큼 늘어나고, 재시작하면 캐시가 비워집니다. 여러 서버가 함께 지켜야 하는 분산 한도와 서킷은 운세·유료 승인 경로에만 따로 있고(Upstash), 이 엔진에는 연결돼 있지 않습니다.",
        "Limits and cache count only inside one server process: with more servers the ceilings multiply, and a restart empties the cache. Distributed limits and circuit breakers that several servers must share exist only on the fortune and paid-approval paths (Upstash) and are not wired into this engine.",
      ),
    ],
    keyPoints: [
      t("검수대 하나: 모든 공급자가 같은 관문 5개를 지난다", "One desk: every provider crosses the same five gates"),
      t("실패는 빈 성공이 아니라 '불러오지 못함'으로 표시", "Failures show as unavailable, never as an empty success"),
      t("한도·캐시는 프로세스 메모리 기준(분산 아님)", "Limits and cache live in process memory (not distributed)"),
    ],
    diagram: {
      id: "resource-engine-one-contract-diagram",
      kind: "graph",
      title: t("요청이 지나는 관문 5개", "The five gates a request crosses"),
      caption: t("공급자 26곳이 달라도 모든 검색은 같은 관문 다섯 개를 지나야 화면에 닿습니다.", "Whatever the provider, every search crosses the same five gates before reaching the screen."),
      alt: t(
        "검색 요청이 입력 검증, 한도와 쿨다운, 외부 호출, 응답 검사, 권리 승격 순서로 관문을 지나 화면 결과가 됩니다. 외부 호출에는 6초 제한과 리디렉션 차단이 붙습니다. 어느 관문에서든 실패하면 빈 성공 대신 불러오지 못함으로 표시됩니다.",
        "A search request crosses input validation, limits and cooldown, the external call, the response check and rights promotion before it becomes a result on screen. The external call has a six-second limit and refuses redirects. A failure at any gate is shown as unavailable instead of an empty success.",
      ),
      nodes: [
        { id: "req", label: t("검색 요청", "Search request"), sub: t("브라우저 → 서버 API", "Browser to server API"), tone: "local", shape: "pill", at: [0, 0] },
        { id: "g1", label: t("① 입력 검증", "1 Validate input"), sub: t("검색어 2~80자·페이지 1~20", "Query 2-80 chars, page 1-20"), tone: "server", at: [1, 0] },
        { id: "g2", label: t("② 한도·쿨다운", "2 Limits"), sub: t("클라이언트당 분당 20회", "20 per minute per client"), tone: "server", at: [2, 0] },
        { id: "g3", label: t("③ 호출", "3 Call"), sub: t("6초 제한·리디렉션 차단", "6 s limit, no redirects"), tone: "server", at: [3, 0] },
        { id: "ext", label: t("외부 공급자", "Providers"), sub: t("26곳(키 필요 10곳)", "26 (10 need keys)"), tone: "external", shape: "cloud", at: [4, 0] },
        { id: "g4", label: t("④ 응답 검사", "4 Check response"), sub: t("2MiB 상한·모양 검사", "2 MiB cap, shape guard"), tone: "server", at: [4, 1] },
        { id: "g5", label: t("⑤ 권리 승격", "5 Promote rights"), sub: t("parseResource", "parseResource"), tone: "good", at: [3, 1] },
        { id: "out", label: t("화면 결과", "Result on screen"), sub: t("브라우저가 한 번 더 검사", "Browser re-checks it"), tone: "local", shape: "pill", at: [2, 1] },
      ],
      edges: [
        { from: "req", to: "g1", label: t("검색어", "query") },
        { from: "g1", to: "g2", label: t("통과", "pass") },
        { from: "g2", to: "g3", label: t("허용", "allowed") },
        { from: "g3", to: "ext", label: t("GET", "GET") },
        { from: "ext", to: "g4", label: t("JSON", "JSON") },
        { from: "g4", to: "g5", label: t("검증됨", "checked") },
        { from: "g5", to: "out", label: t("정규화", "normalized") },
      ],
    },
    usage: [
      {
        feature: t("자료 조사 · 참고 자료 검색", "Research · reference search"),
        role: t("브라우저가 /api/creator-resources/search 를 부르면 엔진이 공급자별 URL 을 만들고 같은 관문으로 호출·검사합니다.", "When the browser calls /api/creator-resources/search, the engine builds the provider URL and calls and checks it through the same gates."),
        paths: ["apps/api/src/modules/creator-resources/resource-engine.ts", "apps/api/src/modules/creator-resources/creator-resources.module.ts"],
        route: "/research/assets",
      },
      {
        feature: t("자료 조사 · 3D·재질·폰트 등 공급자별 화면", "Research · per-provider pages (3D, materials, fonts)"),
        role: t("화면도 같은 core 파서로 응답을 다시 검사하고, 항목 하나라도 어긋나면 결과 전체를 거절합니다.", "The page re-checks the response with the same core parser and rejects the whole result if a single item fails."),
        paths: ["apps/web/src/domains/creator-resources/ResourceSearchPage.tsx", "packages/core/src/creator-resources.ts#parseSearchResult"],
        route: "/research/3d-assets",
      },
      {
        feature: t("공급자 모듈", "Provider modules"),
        role: t("공급자 파일은 URL 만들기·모양 검사·변환만 맡고, 네트워크와 예산은 엔진에 맡깁니다.", "Provider files only build URLs, check shapes and convert; network and budgets belong to the engine."),
        paths: ["apps/api/src/modules/creator-resources/open-art-providers.ts", "apps/api/src/modules/creator-resources/polyhaven-provider.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("한 함수에 모은 호출 경계", "The call boundary in one function"),
        language: "ts",
        ...codePair(`
const MAX_BYTES = 2 * 1024 * 1024; //~ 응답 본문 상한(2 MiB) ## Response body cap (2 MiB)

async function boundedJson(url: string, ms = 6000): Promise<unknown> {
  const res = await fetch(url, {
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(ms), //~ 늦으면 포기한다 ## give up when it is slow
    redirect: "error", //~ 다른 호스트로 끌려가지 않는다 ## never follow a redirect elsewhere
    credentials: "omit", //~ 쿠키를 보내지 않는다 ## send no cookies
  });
  const type = res.headers.get("content-type") ?? "";
  const declared = Number(res.headers.get("content-length"));
  if (!res.ok || !type.includes("json") || declared > MAX_BYTES) {
    await res.body?.cancel();
    throw new Error("upstream_response");
  }
  const reader = res.body?.getReader();
  if (!reader) throw new Error("upstream_body");
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("upstream_size"); } //~ 길이를 속여도 실제 읽은 양으로 막는다 ## counts bytes actually read, so a false length does not help
    text += decoder.decode(value, { stream: true });
  }
  return JSON.parse(text + decoder.decode());
}
`),
        explain: t(
          "외부 응답은 검증되지 않은 입력입니다. 타임아웃·리디렉션 차단·쿠키 미전송·크기 상한·형식 확인을 한 함수에 모아, 어떤 공급자도 이 경계를 건너뛰지 못하게 합니다. 실제 엔진은 여기에 호스트별 쿨다운과 캐시를 더합니다.",
          "An external response is untrusted input. Timeout, refused redirects, no cookies, a size cap and a type check live in one function so no provider can skip the boundary. The real engine adds per-host cooldown and caching on top.",
        ),
        source: "apps/api/src/modules/creator-resources/resource-engine.ts",
        verify: "types",
      },
      {
        kind: "simplified",
        title: t("손으로 쓴 모양 검사(기본은 거절)", "A hand-written shape guard (reject by default)"),
        language: "ts",
        ...codePair(`
const isCount = (v: unknown): v is number => typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const record = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

//~ 필요한 모양만 확인한다. 모르는 호스트는 기본 거절이다. ## Check only the shape we need. Unknown hosts are rejected by default.
function validShape(host: string, value: unknown): boolean {
  const data = record(value);
  if (!Array.isArray(data.data)) return false;
  if (host === "api.artic.edu") return isCount(record(data.pagination).total);
  if (host === "openaccess-api.clevelandart.org") return isCount(record(data.info).total);
  return false;
}

//~ 어긋나면 빈 목록을 성공으로 돌려주지 않고 실패로 알린다. ## On a mismatch report failure instead of returning an empty list as success.
function assertShape(host: string, value: unknown): void {
  if (!validShape(host, value)) throw new Error("upstream_schema");
}
`),
        explain: t(
          "validUpstreamShape 의 축소판입니다. 호스트마다 '이 필드가 이 모양이어야 한다'만 확인하고, 아는 호스트가 아니면 false 를 돌려 통과시키지 않습니다. 통과하지 못하면 upstream_schema 오류가 되어 응답이 '불러오지 못함'으로 바뀝니다.",
          "A reduced form of validUpstreamShape. For each host it checks only that the fields it needs have the expected shape and returns false for any unknown host. A failure becomes an upstream_schema error and the response turns into unavailable.",
        ),
        source: "apps/api/src/modules/creator-resources/open-art-providers.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "OWASP API Security Top 10 2023 · API10 Unsafe Consumption of APIs", url: "https://api-security.owasp.org/editions/2023/en/0xaa-unsafe-consumption-of-apis/", kind: "guide", note: t("외부 API 응답을 믿지 않는 이유", "Why third-party API responses are not trusted") },
      { title: "MDN · AbortSignal.timeout()", url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortSignal/timeout_static", kind: "docs" },
      { title: "MDN · fetch() redirect option", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/fetch", kind: "docs", note: t("redirect: 'error' 가 하는 일", "What redirect: 'error' does") },
      { title: "MDN · Retry-After", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Retry-After", kind: "docs" },
      { title: "MDN · ReadableStream", url: "https://developer.mozilla.org/en-US/docs/Web/API/ReadableStream", kind: "docs", note: t("본문을 조금씩 읽으며 상한을 세는 법", "Reading a body piece by piece to enforce a cap") },
    ],
    chapterIds: ["open-api-data"],
    talk: {
      pitch: t(
        "화면은 외부 공공 API를 직접 부르지 않습니다. 서버의 엔진 하나가 모든 요청을 받아, 6초 안에 못 오면 포기하고, 리디렉션은 막고, 2MiB 넘는 응답은 버리고, 모양이 틀리면 '불러오지 못함'으로 알립니다. 그래서 공급자가 26곳이어도 화면은 같은 규칙을 통과한 데이터만 받습니다.",
        "The screen never calls the public APIs directly. One server engine receives every request, gives up after six seconds, refuses redirects, drops replies over 2 MiB and reports unavailable when the shape is wrong. So with 26 providers the screen still only gets data that passed the same rules.",
      ),
      analogy: t(
        "택배 검수대입니다. 보내는 곳이 26곳이어도 상자는 검수대 하나에서 크기·내용물·송장을 확인한 뒤에야 가게 진열대에 오릅니다.",
        "It is a parcel inspection desk. Even if boxes come from 26 senders, each one is checked for size, contents and label at a single desk before it reaches the shelf.",
      ),
      questions: [
        {
          question: t("공급자 API가 갑자기 응답 모양을 바꾸면요?", "What if a provider suddenly changes its response shape?"),
          answer: t(
            "모양 검사에서 걸러 '불러오지 못함'으로 표시합니다. 빈 목록을 성공처럼 보여주지 않습니다. 대신 새 모양에 맞춰 공급자 모듈을 고치는 일은 사람이 해야 합니다.",
            "The shape guard catches it and the result shows as unavailable; an empty list is never presented as success. A person still has to update the provider module to the new shape.",
          ),
        },
        {
          question: t("한도를 넘으면 어떻게 되나요?", "What happens when a limit is exceeded?"),
          answer: t(
            "클라이언트당 분당 20회를 넘기면 429로 거절합니다. 공급자가 429·503을 보내면 Retry-After(1~120초, 없으면 30초) 동안 그 호스트 호출을 멈춥니다. 이 한도는 서버 프로세스 메모리에만 있습니다.",
            "More than 20 searches a minute per client gets a 429. If a provider answers 429 or 503, calls to that host pause for its Retry-After (1-120 s, 30 s when absent). These limits exist only in server process memory.",
          ),
        },
        {
          question: t("왜 zod 같은 스키마 라이브러리를 안 쓰나요?", "Why not use a schema library such as zod?"),
          answer: t(
            "필요한 필드만 확인하는 작은 검사라 손으로 썼습니다. 공급자가 늘수록 직접 써야 하는 부담이 있고, 그것이 이 설계의 대가입니다.",
            "Each check only reads the few fields it needs, so it is hand-written. The cost is writing one more guard per provider, and that is the trade-off of this design.",
          ),
        },
      ],
      pitfall: t(
        "운영에서 실제 호출이 성공하는지, 키가 필요한 10곳의 키가 등록됐는지는 코드로 확인하지 못했습니다. 한도는 서버 한 대의 메모리 기준이라 '분산 한도'라고 말하지 마세요. 클라이언트 식별에 req.ip 를 쓰므로 프록시 뒤에서 사용자별 한도가 공유될 수 있는지는 미확인입니다.",
        "Whether live calls succeed in production and whether the keys for the 10 key-gated providers are registered could not be confirmed from code. The limits are per server memory, so do not call them distributed. The client id is req.ip, and whether per-user limits are shared behind a proxy is unconfirmed.",
      ),
    },
    technologies: ["AbortController", "NestJS", "Fetch API", "Retry-After"],
    facts: [
      { value: "26", label: t("한 계약으로 묶은 공급자 수", "Providers under one contract"), source: "packages/core/src/creator-resources.ts" },
      { value: "6s", label: t("외부 호출 타임아웃", "External call timeout"), source: "apps/api/src/modules/creator-resources/resource-engine.ts" },
      { value: "2 MiB", label: t("응답 본문 상한", "Response body cap"), source: "apps/api/src/modules/creator-resources/resource-engine.ts" },
      { value: "20/min", label: t("클라이언트당 검색 한도(서버 메모리)", "Per-client search limit (server memory)"), source: "apps/api/src/modules/creator-resources/resource-engine.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "rights-provenance-receipt",
    category: "open-data",
    name: "ResourceProvenanceReceipt",
    title: t("권리를 통과한 자료만 올리고 출처 영수증을 붙인다", "Admit only rights-checked items and attach a provenance receipt"),
    status: "live",
    tagline: t("공급자가 자유롭게 써도 된다고 해도, 우리 규칙을 모두 통과해야 올립니다.", "Even when a provider says an item is free to use, it must pass our own checks first."),
    background: [
      t(
        "남의 작품을 참고 자료로 쓸 때 가장 위험한 일은 출처를 잃어버리는 것입니다. 어디서 가져왔고 어떤 조건이었는지 모르면 나중에 쓸 수 없습니다. 그래서 자료를 올릴 때마다 영수증을 함께 붙입니다. 마트 영수증에 가게·날짜·품목이 적히듯, 출처 영수증에는 원문 주소, 라이선스, 확인한 시각, 반입 가능 범위가 적힙니다.",
        "The riskiest thing when using someone else's work as a reference is losing its source: without knowing where it came from and under what terms, it cannot be used later. So every item is stored with a receipt. Like a shop receipt lists store, date and goods, the provenance receipt records the source URL, license, the time it was checked and the allowed import scope.",
      ),
      t(
        "방식은 '승격'입니다. 공급자 응답은 가장 낮은 등급(metadata-only, 제목과 링크만)에서 시작하고, 공급자별 조건을 모두 통과해야 올라갑니다. 예를 들어 시카고 미술관(AIC)은 is_public_domain 이 true 이고, copyright_notice 가 비어 있고, 이미지 ID 가 정해진 형식일 때만 CC0 가 됩니다. 이미지 주소의 호스트도 코드에 고정된 허용 목록과 맞아야 합니다. 어긋난 항목만 빠지고 나머지는 partial(일부 성공)로 보여줍니다.",
        "The method is promotion. A provider response starts at the lowest grade (metadata-only: title and link) and climbs only after passing every provider-specific condition. The Art Institute of Chicago item, for example, becomes CC0 only if is_public_domain is true, copyright_notice is empty and the image id has the expected format; the image host must also match an allowlist fixed in code. Failing items are dropped and the rest is shown as partial.",
      ),
      t(
        "등급은 CC0(바로 반입 가능) > reference-only(참고 링크만) > metadata-only(제목과 링크만) > blocked(막음) 순입니다. 대안은 공급자가 준 라이선스 표시를 그대로 믿는 것이지만, 표시가 틀렸거나 이미지가 다른 호스트에 있는 경우를 막지 못합니다. 그래서 공급자별 판정 조건, 출처·이미지 호스트 허용 목록, 서버와 브라우저 양쪽의 재검증을 겹쳐 씁니다.",
        "The grades run CC0 (direct import) > reference-only (link for reference) > metadata-only (title and link) > blocked. The alternative is to trust the license label a provider sends, but that cannot stop a wrong label or an image on another host. So three layers overlap: provider-specific conditions, allowlists for source and image hosts, and re-validation on both server and browser.",
      ),
      t(
        "정직하게 말할 한계가 둘 있습니다. 하나, 반입 가능 범위(importPermission)를 읽어 버튼을 막는 화면 로직은 아직 없고 지금은 출처 기록 Markdown 에 적히는 데 쓰입니다. 둘, 출처 모델이 통일돼 있지 않습니다. 검색 자료의 영수증 외에 Creator Intelligence(rightsStatus), 운세(policyRevision), KMAS(source·fetchedAt), 연동 실행 영수증, 브라우저 OpenReference 까지 모두 6종이 따로 있습니다.",
        "Two limits deserve honesty. First, no screen logic reads importPermission to disable a button; today it only appears in the exported attribution Markdown. Second, the provenance model is not unified: besides the search receipt there are Creator Intelligence (rightsStatus), fortune (policyRevision), KMAS (source, fetchedAt), the integration execution receipt and the browser-side OpenReference, six shapes in all.",
      ),
    ],
    keyPoints: [
      t("기본 등급은 '제목과 링크만', 조건을 통과해야 승격", "Default grade is title and link only; promotion needs proof"),
      t("조건·호스트·형식을 모두 통과해야 CC0 로 올린다", "Conditions, host and format must all pass for CC0"),
      t("출처 모델은 6종이며 하나로 통일돼 있지 않다", "There are six provenance shapes, not one unified model"),
    ],
    diagram: {
      id: "rights-provenance-receipt-diagram",
      kind: "sequence",
      title: t("권리 승격 흐름", "The rights promotion flow"),
      caption: t("공급자의 말은 입력일 뿐이고, 서버가 조건을 확인한 항목에만 영수증을 붙여 돌려줍니다.", "A provider's claim is only input; the server returns items with a receipt only after verifying the conditions."),
      alt: t(
        "브라우저가 검색을 요청하면 엔진이 공급자 API를 부르고, 받은 JSON을 모양 검사와 항목별 권리 조건 검사, parseResource 승격으로 걸러 영수증을 붙입니다. 결과는 탈락 항목이 빠진 채 브라우저로 돌아오고, 브라우저가 같은 파서로 한 번 더 검사합니다.",
        "The browser asks for a search and the engine calls the provider API. The returned JSON passes a shape check, per-item rights conditions and parseResource promotion, which attaches a receipt. Results return to the browser without the dropped items, and the browser re-checks them with the same parser.",
      ),
      actors: [
        { id: "web", label: t("브라우저", "Browser"), tone: "local" },
        { id: "eng", label: t("ResourceEngine", "ResourceEngine"), sub: t("공급자 모듈+parseResource", "provider module + parseResource"), tone: "server" },
        { id: "api", label: t("공급자 API", "Provider API"), sub: t("예: 시카고 미술관", "e.g. Art Institute of Chicago"), tone: "external" },
      ],
      messages: [
        { from: "web", to: "eng", label: t("검색 요청", "Search request"), note: t("공급자·검색어·페이지", "provider, query, page") },
        { from: "eng", to: "api", label: t("공개 도메인만 요청", "Ask for public domain only"), note: t("서버가 만든 고정 URL", "URL built by the server") },
        { from: "api", to: "eng", label: t("JSON 응답", "JSON reply"), style: "dashed", note: t("아직 믿지 않는다", "not trusted yet") },
        { from: "eng", to: "eng", label: t("모양 검사", "Shape check"), note: t("어긋나면 응답 전체 실패", "a mismatch fails the whole reply") },
        { from: "eng", to: "eng", label: t("항목별 권리 조건 검사", "Per-item rights checks"), note: t("공개 도메인·고지 없음·ID 형식", "public domain, no notice, id format") },
        { from: "eng", to: "eng", label: t("parseResource 승격", "parseResource promotion"), note: t("호스트 허용 목록+영수증 생성", "host allowlist + receipt") },
        { from: "eng", to: "web", label: t("items + 영수증", "items + receipt"), style: "dashed", note: t("탈락 항목은 빠지고 partial 표시", "dropped items vanish, status partial") },
        { from: "web", to: "web", label: t("같은 파서로 재검증", "Re-check with the same parser"), note: t("하나라도 어긋나면 결과 전체 거절", "one bad item rejects the result") },
      ],
    },
    usage: [
      {
        feature: t("자료 조사 · 미술관 CC0 참고 자료", "Research · museum CC0 references"),
        role: t("AIC·Cleveland 응답을 권리 조건으로 걸러 CC0 로 확인된 것만 이미지와 함께 올립니다.", "Filters AIC and Cleveland responses by rights conditions and surfaces only items confirmed as CC0, with their images."),
        paths: ["apps/api/src/modules/creator-resources/open-art-providers.ts", "packages/core/src/creator-resources.ts#parseResource"],
        route: "/research/assets",
      },
      {
        feature: t("출처 기록 내보내기", "Attribution export"),
        role: t("저장한 자료마다 이용조건·반입 범위·권리 메모·조회일을 Markdown 출처 기록으로 내보냅니다.", "Exports each saved item's terms, import scope, rights note and fetch date as an attribution Markdown file."),
        paths: ["packages/core/src/creator-resources.ts#attributionMarkdown"],
        route: "/research/assets",
      },
      {
        feature: t("권리 판정 회귀 시험", "Rights regression tests"),
        role: t("공급자가 reference-only 라고 주장해도 위조된 썸네일 호스트의 이미지는 버리는지 확인합니다.", "Checks that an image from a forged thumbnail host is dropped even when the provider claims reference-only."),
        paths: ["apps/api/src/modules/creator-resources/open-reference-providers.test.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("조건을 모두 통과해야 승격 + 영수증", "Promote only when every condition passes, with a receipt"),
        language: "ts",
        ...codePair(`
interface Provenance { sourceUrl: string; license: "CC0"; fetchedAt: string; attribution: string }
interface Artwork { id: string; title: string; imageUrl: string; provenance: Provenance }

//~ 공급자 응답을 바로 쓰지 않는다. 모든 조건을 만족한 항목만 내부 모델로 올리고 영수증을 붙인다. ## Never use a provider response as-is. Promote only items meeting every condition and attach a receipt.
function toArtwork(raw: Record<string, unknown>, fetchedAt: string): Artwork | null {
  if (raw.is_public_domain !== true) return null; //~ 공개 도메인이라고 명시되어야 한다 ## must be explicitly public domain
  if (typeof raw.copyright_notice === "string" && raw.copyright_notice.trim()) return null; //~ 권리 고지가 있으면 제외 ## a rights notice excludes it
  const imageId = String(raw.image_id ?? "");
  if (!/^[a-zA-Z0-9-]{8,100}$/u.test(imageId)) return null; //~ 경로 조작 불가: 형식 고정 ## format is fixed, so the path cannot be tampered with
  const id = Number(raw.id);
  if (!Number.isSafeInteger(id) || id <= 0 || typeof raw.title !== "string") return null;
  return {
    id: "aic:" + id,
    title: raw.title.slice(0, 300),
    imageUrl: "https://www.artic.edu/iiif/2/" + imageId + "/full/843,/0/default.jpg", //~ 이미지 호스트는 코드에 고정 ## the image host is fixed in code
    provenance: {
      sourceUrl: "https://www.artic.edu/artworks/" + id,
      license: "CC0",
      fetchedAt, //~ 언제 확인한 권리인가 ## when the rights were checked
      attribution: String(raw.credit_line ?? "Art Institute of Chicago").slice(0, 500),
    },
  };
}
`),
        explain: t(
          "open-art-providers 의 AIC 판정을 줄인 것입니다. 조건 하나라도 어긋나면 null 이라 그 항목만 빠지고, 통과한 항목에는 출처 주소·라이선스·확인 시각이 든 영수증이 붙습니다.",
          "A reduced form of the AIC decision in open-art-providers. Any failed condition returns null so only that item disappears, and each passing item carries a receipt with source URL, license and check time.",
        ),
        source: "apps/api/src/modules/creator-resources/open-art-providers.ts",
        verify: "types",
      },
      {
        kind: "teaching",
        title: t("기본은 낮은 등급, 증거가 있어야 승격", "Default to the low grade; promote on evidence"),
        language: "ts",
        ...codePair(`
type Permission = "direct" | "reference-only" | "metadata-only" | "blocked";
const CC0_PROVIDERS = new Set(["met", "aic", "cleveland"]);
const IMAGE_HOSTS: Record<string, readonly string[]> = { aic: ["www.artic.edu"] };

function hostOf(url: string): string {
  try { return new URL(url).hostname; } catch { return ""; }
}

//~ 기본값은 가장 낮은 등급이다. 공급자 목록·주장·이미지 호스트가 모두 맞아야 올라간다. ## The default is the lowest grade; provider list, claim and image host must all match to climb.
function promote(provider: string, claimed: string, imageUrl: string): { permission: Permission; imageUrl: string } {
  if (!CC0_PROVIDERS.has(provider) || claimed !== "CC0") return { permission: "metadata-only", imageUrl: "" };
  const trusted = IMAGE_HOSTS[provider]?.includes(hostOf(imageUrl)) ?? false;
  return trusted ? { permission: "direct", imageUrl } : { permission: "metadata-only", imageUrl: "" };
}
`),
        explain: t(
          "parseResource 의 승격 규칙을 아이디어만 남겨 보인 예제입니다. 공급자가 CC0 라고 주장해도 허용 목록에 없는 이미지 호스트라면 이미지를 버리고 제목과 링크만 남깁니다.",
          "The promotion rule of parseResource reduced to its idea. Even when a provider claims CC0, an image on a host outside the allowlist is dropped and only title and link remain.",
        ),
        verify: "types",
      },
    ],
    links: [
      { title: "Creative Commons · CC0 1.0 Universal", url: "https://creativecommons.org/publicdomain/zero/1.0/", kind: "spec", note: t("CC0 공식 안내", "The official CC0 page") },
      { title: "SPDX · CC0-1.0", url: "https://spdx.org/licenses/CC0-1.0.html", kind: "spec", note: t("라이선스 표준 식별자", "The standard license identifier") },
      { title: "W3C · PROV-Overview", url: "https://www.w3.org/TR/prov-overview/", kind: "spec", note: t("출처(provenance) 기록을 표준으로 보는 법", "Provenance records as a standard") },
      { title: "Art Institute of Chicago · API documentation", url: "https://api.artic.edu/docs/", kind: "docs" },
      { title: "The Met · Open Access API", url: "https://metmuseum.github.io/", kind: "docs" },
    ],
    chapterIds: ["open-api-data", "licenses"],
    talk: {
      pitch: t(
        "자료를 가져올 때마다 영수증을 붙입니다. 공급자가 공개 도메인이라고 해도 공급자별 조건, 이미지 주소, 형식을 모두 통과해야 CC0 로 올리고, 하나라도 어긋나면 그 항목만 뺍니다. 그래서 이 이미지를 어디서 왜 써도 되는지 나중에 되짚을 수 있습니다.",
        "Every item gets a receipt when it is fetched. Even if a provider says public domain, the provider-specific conditions, the image address and the format must all pass before it counts as CC0, and a single failure removes just that item. That lets us trace later where an image came from and why it was usable.",
      ),
      analogy: t(
        "중고 거래 영수증과 같습니다. 판매자가 정품이라고 말해도 어디서·언제·어떤 조건이었는지 기록을 남겨 두면, 문제가 생겼을 때 되짚을 수 있습니다.",
        "It works like a receipt for second-hand goods. Even if the seller says it is genuine, a record of where, when and on what terms lets you trace it if something goes wrong.",
      ),
      questions: [
        {
          question: t("CC0 면 아무 데나 써도 되나요?", "If it is CC0, can it be used anywhere?"),
          answer: t(
            "코드가 기본으로 넣는 권리 문구는 '초상권·상표권 등 별도 권리 확인'입니다. 저작권 표시 외의 권리는 별개라는 뜻이고, 법률 판단은 이 카드의 범위가 아닙니다.",
            "The default rights statement in code says to check other rights such as portrait and trademark rights separately. Legal judgment is outside the scope of this card.",
          ),
        },
        {
          question: t("공급자가 잘못 표시하면요?", "What if a provider labels an item wrongly?"),
          answer: t(
            "표시만으로는 올리지 않습니다. 호스트 허용 목록과 형식 검사를 함께 통과해야 하고, 위조된 썸네일 호스트는 reference-only 라고 주장해도 이미지를 버리는 시험이 있습니다. 다만 공급자가 권리 자체를 잘못 적은 경우까지 찾아내지는 못합니다.",
            "A label alone never promotes an item. The host allowlist and format checks must pass too, and a test confirms that a forged thumbnail host loses its image even when it claims reference-only. Errors in the provider's own rights data cannot be detected, though.",
          ),
        },
        {
          question: t("출처 모델이 왜 6개나 되죠?", "Why are there six provenance models?"),
          answer: t(
            "기능마다 필요한 정보가 달라 따로 자랐습니다. 하나로 통일하면 좋지만 아직 하지 않았다고 솔직히 말합니다.",
            "Each feature needed different information and grew its own. Unifying them would be better, and we say plainly that it has not been done yet.",
          ),
        },
      ],
      pitfall: t(
        "모든 자료가 권리 검증을 통과한다고 말하지 마세요. 권리 게이트는 정규화 시점에 작동하고, 반입 가능 범위를 읽어 화면을 막는 로직은 아직 없습니다. 약관 재검토 날짜(termsReviewedAt)도 일부 공급자에만 기록돼 있습니다.",
        "Do not say every item is rights-verified. The gate acts at normalization time, and no screen logic yet blocks actions based on the import scope. The terms review date (termsReviewedAt) is also recorded for only some providers.",
      ),
    },
    technologies: ["CC0 1.0", "SPDX", "Provenance receipt", "parseResource"],
    facts: [
      { value: "4", label: t("반입 범위 등급(direct·reference-only·metadata-only·blocked)", "Import grades (direct, reference-only, metadata-only, blocked)"), source: "packages/core/src/creator-resources.ts" },
      { value: "6", label: t("서로 다른 출처 기록 모델", "Distinct provenance shapes"), source: "apps/api/src/modules/creator-intelligence/creator-intelligence-core.ts" },
    ],
    reviewedAt: "2026-10-07",
  },
  {
    id: "injected-fetch-adapters",
    category: "open-data",
    name: "Injected fetch adapter",
    title: t("함수를 꽂아 외부 API를 시험 가능하게 만든다", "Plug in the network so external APIs become testable"),
    status: "live",
    tagline: t("진짜 fetch 대신 가짜 fetch 를 꽂아 권리·캐시·쿨다운을 네트워크 없이 시험합니다.", "Swap in a fake fetch to test rights, cache and cooldown without any network."),
    background: [
      t(
        "외부 API를 부르는 코드를 시험하려면 진짜 인터넷이 필요할 것 같지만, 그러면 시험이 느리고 불안정하며 공급자의 호출 한도까지 씁니다. 해결책은 전원 플러그를 바꿔 끼우는 구조입니다. 엔진은 fetch(네트워크 호출 함수)를 직접 쓰지 않고 바깥에서 받아 씁니다. 운영에서는 진짜 fetch를, 시험에서는 미리 짜 둔 응답을 돌려주는 함수를 꽂습니다.",
        "Testing code that calls external APIs seems to need the real internet, but that makes tests slow, flaky and burns the provider's call limits. The fix is to make the power plug swappable. The engine does not use fetch (the network call function) directly; it receives it from outside. Production plugs in the real fetch, tests plug in a function that returns prepared replies.",
      ),
      t(
        "ResourceEngine 은 createResourceEngine({ fetch, env, now }) 로 만들어집니다. fetch 는 네트워크, env 는 환경변수(키), now 는 시계입니다. 공급자 모듈에는 request(url) 함수 하나만 넘겨 URL 만들기·모양 검사·변환에 집중하게 합니다. 시계도 주입되므로 Retry-After 10초 뒤 같은 시간 흐름을 실제로 기다리지 않고 재현합니다.",
        "ResourceEngine is built with createResourceEngine({ fetch, env, now }): fetch is the network, env the environment variables (keys) and now the clock. Provider modules get only a request(url) function, so they focus on building URLs, checking shapes and converting. Because the clock is injected too, time flows such as ten seconds of Retry-After are replayed without waiting.",
      ),
      t(
        "이 방식은 포트와 어댑터(헥사고날) 설계의 작은 버전입니다. 대안인 모듈 모킹은 import 를 가로채므로 코드 구조에 덜 민감하지만 무엇이 가짜인지가 숨습니다. 주입은 호출처에서 보이는 대신 생성 인자가 늘어나는 비용이 있습니다. 같은 생각이 곳곳에 반복됩니다. 날씨 위젯은 fetchJson·now·타이머를 한 묶음으로 받고, SSRF 방어용 DNS 조회와 HTTP 요청도 NestJS 토큰으로 갈아 끼웁니다.",
        "This is a small version of the ports-and-adapters (hexagonal) design. Module mocking, the alternative, intercepts imports and is less sensitive to code structure, but hides what is fake. Injection shows it at the call site at the price of more constructor arguments. The idea repeats elsewhere: the weather widget takes fetchJson, now and timers as one bundle, and the SSRF defence swaps its DNS lookup and HTTP request through NestJS tokens.",
      ),
    ],
    keyPoints: [
      t("엔진은 fetch·env·now 를 인자로 받는다", "The engine receives fetch, env and now as arguments"),
      t("운영은 진짜를, 시험은 스텁을 꽂는다", "Production plugs in the real thing, tests plug in stubs"),
      t("시계도 주입해 10초 쿨다운을 기다리지 않고 시험", "An injected clock tests a 10 s cooldown instantly"),
    ],
    diagram: {
      id: "injected-fetch-adapters-diagram",
      kind: "layers",
      title: t("누가 무엇을 소유하는가: 꽂는 구멍과 부품", "Who owns what: slots and plug-in parts"),
      caption: t("엔진은 구멍만 갖고, 구멍에 꽂는 부품은 운영과 시험이 각자 고릅니다.", "The engine owns only the slots; production and tests each choose the parts that plug into them."),
      alt: t(
        "맨 위에는 컨트롤러와 시험이 엔진을 부르는 층이 있고, 그 아래 엔진은 fetch·env·now 세 개의 구멍을 가집니다. 다음 층은 구멍에 꽂는 어댑터로, 운영에서는 진짜 fetch와 process.env, 시험에서는 스텁 fetch와 고정 시계입니다. 맨 아래가 공급자 API와 실제 시계 같은 바깥 세계이며, 시험에서는 아래 두 층이 가짜로 바뀝니다.",
        "At the top, controllers and tests call the engine. Below it the engine owns three slots: fetch, env and now. The next layer holds the adapters that plug into them: the real fetch and process.env in production, a stub fetch and a fixed clock in tests. The bottom layer is the outside world of provider APIs and the real clock, and in tests the lower two layers are replaced by fakes.",
      ),
      layers: [
        { id: "caller", label: t("호출하는 쪽", "Callers"), sub: t("운영: NestJS 컨트롤러 · 시험: Vitest", "Production: NestJS controller. Tests: Vitest"), tone: "local", chips: ["NestJS", "Vitest"] },
        { id: "engine", label: t("엔진 (구멍 세 개)", "Engine (three slots)"), sub: t("createResourceEngine({ fetch, env, now })", "createResourceEngine({ fetch, env, now })"), tone: "server", chips: ["ResourceEngine"] },
        { id: "adapter", label: t("꽂는 부품 (어댑터)", "Plug-in parts (adapters)"), sub: t("운영: 진짜 fetch·process.env / 시험: 스텁 fetch·고정 시계", "Production: real fetch and process.env. Tests: stub fetch and fixed clock"), tone: "good" },
        { id: "world", label: t("바깥 세계", "The outside world"), sub: t("공급자 API · 실제 시계 · 환경변수", "Provider APIs, the real clock, environment variables"), tone: "external" },
      ],
      brackets: [{ label: t("시험에서는 이 두 층이 가짜로 바뀐다", "In tests these two layers become fakes"), layerIds: ["adapter", "world"] }],
    },
    usage: [
      {
        feature: t("자료 조사 · 서버 배선", "Research · server wiring"),
        role: t("운영 모듈이 진짜 fetch 와 process.env 를 엔진에 꽂습니다.", "The production module plugs the real fetch and process.env into the engine."),
        paths: ["apps/api/src/modules/creator-resources/creator-resources.module.ts", "apps/api/src/modules/creator-resources/resource-engine.ts#createResourceEngine"],
      },
      {
        feature: t("공급자 회귀 시험", "Provider regression tests"),
        role: t("스텁 fetch 와 고정 시계로 권리 게이트·요청 합치기·429 쿨다운·클라이언트 한도를 네트워크 없이 시험합니다.", "Tests rights gates, request coalescing, 429 cooldown and client limits with a stub fetch and a fixed clock, no network."),
        paths: ["tests/creator-resources-cases.ts", "tests/creator-resource-workflow-cases.ts", "apps/api/src/modules/creator-resources/open-reference-providers.test.ts"],
      },
      {
        feature: t("배경 날씨 위젯", "Ambient weather widget"),
        role: t("fetchJson·now·타이머를 묶은 의존성 객체를 받아 위치 권한과 갱신 주기를 시험합니다.", "Takes a dependency bundle of fetchJson, now and timers so permission handling and refresh cycles can be tested."),
        paths: ["apps/web/src/shared/ambient/ambient-weather.ts#AmbientWeatherDependencies"],
      },
      {
        feature: t("참조 이미지 가져오기 방어", "Reference-image fetch defence"),
        role: t("DNS 조회와 HTTP 요청을 NestJS 토큰으로 주입해 사설 주소 차단을 가짜 DNS 로 시험합니다.", "Injects DNS lookup and HTTP requests through NestJS tokens so private-address blocking can be tested with a fake DNS."),
        paths: ["apps/api/src/modules/creator/studio-remote-reference-image.network.ts", "apps/api/src/modules/creator/studio-remote-reference-image.network.test.ts"],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("스텁 fetch 와 손으로 돌리는 시계로 429 쿨다운 시험", "Test a 429 cooldown with a stub fetch and a hand-turned clock"),
        language: "ts",
        ...codePair(`
type Fetcher = (url: string) => Promise<Response>;

//~ 엔진은 fetch 와 시계를 인자로 받는다. 운영에서는 진짜, 시험에서는 스텁을 꽂는다. ## The engine receives fetch and a clock. Production plugs in the real ones, tests plug in stubs.
function createClient(deps: { fetch: Fetcher; now: () => number }) {
  const blockedUntil = new Map<string, number>(); //~ 호스트별 쿨다운 ## per-host cooldown
  return async (url: string): Promise<"ok" | "cooldown"> => {
    const host = new URL(url).hostname;
    if (deps.now() < (blockedUntil.get(host) ?? 0)) return "cooldown"; //~ 네트워크를 건드리지 않고 거절 ## refuse without touching the network
    const res = await deps.fetch(url);
    if (res.status === 429) {
      blockedUntil.set(host, deps.now() + Number(res.headers.get("retry-after") ?? 30) * 1000);
      return "cooldown";
    }
    return "ok";
  };
}

//~ 시험: 첫 호출만 429 를 돌려주는 스텁. 10초를 실제로 기다리지 않는다. ## Test: a stub that answers 429 only once. We never wait the real ten seconds.
let time = 0;
let calls = 0;
const search = createClient({
  now: () => time,
  fetch: async () => (++calls === 1 ? new Response("busy", { status: 429, headers: { "Retry-After": "10" } }) : Response.json({ total: 0 })),
});
const first = await search("https://api.test/a"); //~ 429 를 받는다 ## gets the 429
time += 9_999;
const during = await search("https://api.test/b"); //~ 아직 쿨다운: calls 는 그대로 1 ## still cooling down: calls stays 1
time += 2;
const after = await search("https://api.test/c"); //~ 쿨다운이 끝나 다시 호출한다 ## cooldown over, the call goes out again
console.log(first, during, after, calls); //~ cooldown cooldown ok 2 ## cooldown cooldown ok 2
`),
        explain: t(
          "tests/creator-resource-workflow-cases.ts 의 'upstream 429 stops repeated calls until Retry-After elapses' 시험을 줄인 것입니다. 실제 엔진도 호스트별 쿨다운 맵과 주입된 시계를 쓰므로, 진짜 서버 없이 시간만 돌려 같은 시나리오를 확인합니다.",
          "A reduction of the test 'upstream 429 stops repeated calls until Retry-After elapses' in tests/creator-resource-workflow-cases.ts. The real engine also uses a per-host cooldown map and an injected clock, so the same scenario is checked by turning time alone, without any server.",
        ),
        source: "tests/creator-resource-workflow-cases.ts",
        verify: "types",
      },
    ],
    links: [
      { title: "MDN · Fetch API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Fetch_API", kind: "docs" },
      { title: "MDN · Response.json() static method", url: "https://developer.mozilla.org/en-US/docs/Web/API/Response/json_static", kind: "docs", note: t("가짜 응답을 만들 때 쓰는 표준 메서드", "The standard way to build a fake reply") },
      { title: "Vitest · Mocking", url: "https://vitest.dev/guide/mocking.html", kind: "guide", note: t("모킹과 주입을 비교해 보기", "Compare mocking with injection") },
      { title: "Alistair Cockburn · Hexagonal architecture", url: "https://alistair.cockburn.us/hexagonal-architecture/", kind: "article", note: t("포트와 어댑터의 원전", "The original ports-and-adapters text") },
    ],
    chapterIds: ["open-api-data", "quality"],
    talk: {
      pitch: t(
        "엔진이 인터넷을 직접 쓰지 않고 fetch·환경변수·시계를 인자로 받습니다. 운영에서는 진짜를, 시험에서는 미리 짠 응답을 꽂으니 429 쿨다운이나 권리 게이트를 실제 네트워크 없이 몇 초 만에 확인합니다.",
        "The engine does not touch the internet directly; it receives fetch, environment variables and a clock as arguments. Production plugs in the real ones and tests plug in prepared replies, so a 429 cooldown or a rights gate is checked in seconds with no network.",
      ),
      analogy: t(
        "전기 플러그와 멀티탭입니다. 가전(엔진)은 그대로 두고 콘센트에 진짜 전원이나 시험용 전원을 번갈아 꽂습니다.",
        "It is a plug and a power strip. The appliance (the engine) stays the same while the outlet gets either mains power or a test supply.",
      ),
      questions: [
        {
          question: t("가짜 응답만으로 시험하면 진짜 API 변화를 못 잡지 않나요?", "Doesn't testing against fake replies miss real API changes?"),
          answer: t(
            "맞습니다. 이 시험은 우리 코드의 규칙을 확인하는 것이고 공급자가 실제로 바뀌었는지는 잡지 못합니다. 운영 실호출은 이 카드에서 확인하지 못했습니다.",
            "Correct. These tests verify our own rules and cannot tell whether a provider really changed. Live production calls were not verified for this card.",
          ),
        },
        {
          question: t("모킹 라이브러리와 무엇이 다른가요?", "How is this different from a mocking library?"),
          answer: t(
            "모킹은 import 를 가로채고, 주입은 만들 때 인자로 받습니다. 주입은 어디가 가짜인지 호출처에서 보이는 대신 인자가 늘어납니다.",
            "Mocking intercepts imports; injection takes the part as an argument at construction. Injection shows what is fake right where it is used, at the price of more arguments.",
          ),
        },
      ],
      pitfall: t(
        "모든 공급자를 시험한다고 말하지 마세요. 시험 파일은 일부 공급자의 대표 시나리오를 다룹니다. 실제 공급자 서버를 부르는 통합 시험은 이 카드에서 확인하지 못했습니다.",
        "Do not claim every provider is tested. The test files cover representative scenarios for some providers, and integration tests against real provider servers were not verified for this card.",
      ),
    },
    technologies: ["Vitest", "NestJS", "Fetch API", "Hexagonal architecture"],
    reviewedAt: "2026-10-07",
  },
];
