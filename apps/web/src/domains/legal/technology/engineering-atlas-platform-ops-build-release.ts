import { codePair, t } from "./engineering-atlas-platform-ops-build-kit";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · platform-ops 카테고리 — 프런트·백엔드 정합 카드 중 전달·어긋남·릴리스 3장
 * (해시 이름과 캐시 계약, 버전 어긋남 복구, 릴리스 순서와 롤백). engineering-atlas-platform-ops-build.ts 가 가져다 쓴다.
 * 사실은 2026-10-08 기준 코드·시험·문서와 공식 문서로 확인했고, 운영 응답 헤더와 대시보드는 열람하지 않았다.
 */

const HASHED_ASSETS_CACHE_CONTRACT: EngineeringAtlasEntry = {
  id: "hashed-assets-cache-contract",
  category: "platform-ops",
  name: "Hashed assets and Cache-Control",
  title: t(
    "이름이 곧 버전이라 1년 캐시: 바뀔 수 있는 파일은 매번 확인",
    "The name is the version, so cache for a year; always recheck what can change",
  ),
  status: "live",
  tagline: t(
    "해시가 붙은 파일은 1년 immutable, sw.js와 HTML은 매번 확인하도록 응답 규칙을 맞춥니다.",
    "Hashed files are cached for a year as immutable, while sw.js and HTML are always rechecked, by one set of response rules.",
  ),
  background: [
    t(
      "웹사이트를 열 때마다 모든 파일을 새로 받으면 느리고, 반대로 오래 붙들면 새 버전이 보이지 않습니다. 해법은 파일 이름에 내용의 지문(해시)을 넣는 것입니다. 내용이 바뀌면 이름도 바뀌므로, 이름이 같은 파일은 영원히 같은 파일이라 믿고 1년 동안 다시 묻지 않아도 됩니다. 계좌번호처럼 번호가 같으면 같은 계좌입니다. 대신 '지금 어떤 이름을 쓰라'고 알려 주는 안내문(HTML)은 매번 확인해야 새 배포가 닿습니다.",
      "Fetching every file anew each time a site opens is slow, while holding on for long hides new versions. The fix is to put a fingerprint (a hash) of the content in the file name. When the content changes the name changes, so a file with the same name is the same file forever and need not be asked about for a year. Like an account number, the same number is the same account. The notice that says which names to use now (the HTML) must be checked every time for a new deploy to reach people.",
    ),
    t(
      "규칙은 config/http-response-headers.json 한 곳에 있고, 스크립트가 _headers 파일로 만들어 Static Assets가 적용합니다. /assets/*는 public, max-age=31536000, immutable(1년, 바뀌지 않음)이고, /i18n/*와 /data/*는 브라우저 10분·CDN 하루·낡은 응답 허용 7일, /sw.js는 no-cache입니다. HTML에는 규칙이 없어 Static Assets 기본값(max-age=0, must-revalidate와 ETag)이 적용되므로 늘 확인하되 같으면 다시 받지 않습니다. 서비스 워커도 같은 구분을 따라 /assets는 cache-first, HTML은 network-first, sw.js는 건드리지 않습니다.",
      "The rules live in one place, config/http-response-headers.json, and a script turns them into a _headers file that Static Assets applies. /assets/* gets public, max-age=31536000, immutable (one year, never changes), /i18n/* and /data/* get 10 minutes in the browser, one day in the CDN and 7 days of stale allowance, and /sw.js gets no-cache. HTML has no rule, so the Static Assets default (max-age=0, must-revalidate with an ETag) applies: it is always checked but not downloaded again if unchanged. The service worker follows the same split: cache-first for /assets, network-first for HTML, and hands-off for sw.js.",
    ),
    t(
      "해시가 없는 파일이 걸림돌입니다. Vite는 코드에서 import한 자산에만 해시를 붙이고 public 폴더 파일은 이름을 그대로 둡니다. /assets 아래의 공개 파일은 폴더 이름에 날짜·버전을 붙인 경우가 많아(cc0-20260906, refined-v6 같은 이름) 이 관례가 '이름이 곧 버전'을 받치는 것으로 보입니다. 제자리에서 바뀌는 CC0 매니페스트는 헤더 규칙과 서비스 워커 분류(catalog-data) 양쪽에 예외로 적혀 있고, 바뀌는 OST 목록(/audio/playlist.json)은 no-store이며 시험이 고정합니다.",
      "Files without a hash are the snag. Vite hashes only assets imported from code and leaves public-folder files under their own names. Public files under /assets often carry a date or version in the folder name (names such as cc0-20260906 and refined-v6), and that convention appears to be what keeps 'the name is the version' true. The CC0 manifest, which changes in place, is written as an exception in both the header rules and the service-worker classification (catalog-data), and the changing OST list (/audio/playlist.json) is no-store, pinned by a test.",
    ),
    t(
      "한계: 두 가지를 확인하지 못했습니다. 첫째, Cloudflare 문서에 따르면 _headers에서 여러 규칙이 맞는 경로는 모든 규칙의 헤더를 물려받고 같은 헤더는 쉼표로 합쳐집니다. /assets/*와 CC0 매니페스트 규칙이 둘 다 맞는 경로가 하나 있는데, 운영 응답이 실제로 어떤 Cache-Control로 나가는지는 받아 보지 못했습니다. 둘째, 헤더 규칙과 서비스 워커 분류가 서로 맞는지 직접 대조하는 단위 시험은 찾지 못했고, 같은 규칙으로 dist를 서빙해 보는 실브라우저 점검(verify:studio-service-worker)이 대신합니다.",
      "Two things were not confirmed. First, per Cloudflare's documentation a path matched by several _headers rules inherits the headers of all of them, and the same header is joined with commas. One path is matched by both the /assets/* rule and the CC0 manifest rule, and the Cache-Control that production actually sends for it was not fetched. Second, no unit test that directly cross-checks the header rules against the service-worker classification was found; a real-browser check that serves dist with the same rules (verify:studio-service-worker) stands in for it.",
    ),
  ],
  keyPoints: [
    t("해시 이름 파일은 immutable 1년, 이름이 바뀌면 새 파일", "Hashed files are immutable for a year; a new name means a new file"),
    t("sw.js와 HTML은 매번 확인: no-cache, must-revalidate", "sw.js and HTML are rechecked every time: no-cache, must-revalidate"),
    t("규칙은 JSON 한 곳, 서비스 워커 분류도 같은 구분을 따름", "Rules live in one JSON, and the worker's classes follow the same split"),
    t("제자리에서 바뀌는 파일은 예외로 적고 시험으로 고정", "Files that change in place are listed as exceptions and pinned by tests"),
  ],
  diagram: {
    id: "hashed-assets-cache-contract-diagram",
    kind: "graph",
    title: t("요청 하나가 어떤 보관 규칙을 만나는가", "Which keeping rule a request meets"),
    caption: t(
      "경로가 무엇이냐에 따라 오래 보관하거나 매번 확인하며, 서비스 워커도 같은 갈래를 따릅니다.",
      "Depending on the path it is kept long or rechecked every time, and the service worker follows the same branches.",
    ),
    alt: t(
      "요청 URL이 들어오면 경로를 보고 다섯 갈래로 나뉩니다. 해시 이름의 /assets 파일은 1년 immutable이고 서비스 워커는 cache-first입니다. 번역·카탈로그 JSON은 10분과 CDN 하루에 낡은 응답을 허용하며 서비스 워커는 stale-while-revalidate입니다. HTML은 기본값으로 매번 재확인하고 서비스 워커는 network-first입니다. sw.js는 no-cache이고 서비스 워커도 건드리지 않습니다. 제자리에서 바뀌는 파일은 예외로 max-age=0이나 no-store를 씁니다.",
      "A request URL is split into five branches by its path. Hashed /assets files are immutable for a year and the worker serves them cache-first. Translation and catalog JSON get 10 minutes plus a day in the CDN with stale allowance, and the worker uses stale-while-revalidate. HTML is rechecked every time by default and the worker goes network-first. sw.js is no-cache and the worker leaves it alone. Files that change in place are exceptions using max-age=0 or no-store.",
    ),
    nodes: [
      { id: "req", label: t("요청 URL", "Request URL"), tone: "local", shape: "pill", at: [0, 2] },
      { id: "kind", label: t("무엇인가?", "What is it?"), sub: t("경로로 분류", "by path"), tone: "neutral", shape: "diamond", at: [1, 2] },
      { id: "hashed", label: t("해시 이름 파일", "Hashed file"), sub: t("immutable 1년 · SW cache-first", "immutable 1 yr · SW cache-first"), tone: "good", at: [2, 0], span: 2 },
      { id: "data", label: t("번역·카탈로그", "Strings, catalog"), sub: t("10분·CDN 1일 · SW SWR", "10 min, CDN 1 day, SW SWR"), tone: "edge", at: [2, 1], span: 2 },
      { id: "html", label: t("HTML 문서", "HTML document"), sub: t("기본값 재확인 · SW network-first", "default recheck, SW network-first"), tone: "local", at: [2, 2], span: 2 },
      { id: "sw", label: t("/sw.js", "/sw.js"), sub: t("no-cache · SW도 통과", "no-cache, SW passes it"), tone: "warn", at: [2, 3], span: 2 },
      { id: "exception", label: t("제자리 바뀌는 파일", "Changes in place"), sub: t("max-age=0 · no-store 예외", "max-age=0 or no-store"), tone: "warn", at: [2, 4], span: 2 },
    ],
    edges: [
      { from: "req", to: "kind" },
      { from: "kind", to: "hashed", label: t("/assets/", "/assets/") },
      { from: "kind", to: "data", label: t("/i18n·/data", "/i18n, /data") },
      { from: "kind", to: "html", label: t("화면 문서", "pages") },
      { from: "kind", to: "sw", label: t("워커", "worker") },
      { from: "kind", to: "exception", label: t("예외 목록", "exceptions") },
    ],
  },
  usage: [
    {
      feature: t("모든 정적 응답의 캐시 규칙", "Cache rules for every static response"),
      role: t(
        "Cache-Control 규칙을 JSON 한 곳에 두고 스크립트가 _headers를 생성합니다. 생성물이 어긋나면 --check 검증이 실패합니다.",
        "Cache-Control rules live in one JSON, and a script generates _headers; the --check verification fails if the generated file drifts.",
      ),
      paths: [
        "config/http-response-headers.json",
        "apps/web/public/_headers",
        "scripts/cloudflare-static-rules.mjs",
        "scripts/cloudflare-static-rules.test.mjs",
      ],
    },
    {
      feature: t("재방문 때 앱 셸 즉시 열기", "Opening the app shell instantly on a revisit"),
      role: t(
        "서비스 워커가 요청을 분류해 /assets는 cache-first, HTML은 network-first, 바뀌는 JSON은 stale-while-revalidate로 다루고 /sw.js는 가로채지 않습니다.",
        "The service worker classifies requests: cache-first for /assets, network-first for HTML, stale-while-revalidate for changing JSON, and it never intercepts /sw.js.",
      ),
      paths: [
        "apps/web/src/app/service-worker/studio-service-worker-policy.ts#classifyStudioServiceWorkerRequest",
        "docs/studio-service-worker.md",
      ],
      route: "/studio",
    },
    {
      feature: t("새 배포가 사용자에게 닿는 길", "How a new deploy reaches users"),
      role: t(
        "빌드가 출력 폴더를 비우므로 dist에는 이번 빌드의 파일만 있고, 늘 재확인되는 HTML이 그 해시 이름을 가리킵니다. 정적 자산은 SPA 모드로 없는 경로에 index.html을 돌려줍니다.",
        "The build empties the output folder, so dist holds only this build's files, and the always-rechecked HTML points to their hashed names. Static Assets run in SPA mode and answer a missing path with index.html.",
      ),
      paths: ["apps/web/vite.config.ts", "deploy/cloudflare-static/wrangler.jsonc"],
    },
    {
      feature: t("규칙이 지켜지는지 보는 점검", "Checks that the rules hold"),
      role: t(
        "단위 시험은 바뀌는 OST 목록이 no-store임을 고정하고, 실브라우저 점검은 같은 헤더 규칙으로 dist를 서빙하며 워커의 오프라인·업데이트 동작을 확인합니다.",
        "A unit test pins the changing OST list to no-store, and the real-browser check serves dist with the same header rules while verifying the worker's offline and update behavior.",
      ),
      paths: ["scripts/cloudflare-static-rules.test.mjs", "scripts/verify-studio-service-worker.mts"],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("겹치는 규칙의 헤더가 합쳐지는 모습", "How headers of overlapping rules get combined"),
      language: "ts",
      ...codePair(`
interface Rule {
  prefix?: string; //~ 이 접두사로 시작하는 경로 ## paths starting with this prefix
  exact?: string; //~ 정확히 이 경로 ## exactly this path
  headers: Record<string, string>;
}

//~ Cloudflare _headers 문서의 설명: 맞는 규칙을 모두 물려받고, 같은 이름은 쉼표로 합쳐진다 ## Per the Cloudflare _headers docs: every matching rule is inherited and the same name is joined with commas
export function mergedHeaders(path: string, rules: readonly Rule[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const rule of rules) {
    const hit = rule.exact !== undefined
      ? path === rule.exact
      : rule.prefix !== undefined && path.startsWith(rule.prefix);
    if (!hit) continue;
    for (const [name, value] of Object.entries(rule.headers)) {
      out[name] = name in out ? out[name] + ", " + value : value;
    }
  }
  return out;
}

//~ 넓은 규칙에 Cache-Control 을 넣으면 좁은 예외가 그 값에 덧붙는다: 그래서 /audio/* 에는 넣지 않는다 ## A Cache-Control on a broad rule gets the narrow exception appended to it, which is why /audio/* has none
`),
      explain: t(
        "겹침을 계산해 보는 교육용 코드입니다. 저장소의 /audio/* 규칙에는 일부러 Cache-Control이 없고(시험이 고정) 좁은 규칙만 값을 갖습니다. /assets/*와 CC0 매니페스트 규칙은 둘 다 Cache-Control을 가지는데, 운영에서 어떻게 나가는지는 확인하지 못했습니다.",
        "This is teaching code that computes overlaps. The repository's /audio/* rule deliberately has no Cache-Control (a test pins this) and only the narrow rule carries a value. The /assets/* rule and the CC0 manifest rule both carry Cache-Control, and how that goes out in production was not confirmed.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("서비스 워커가 경로로 보관 방식을 고르는 법", "How the service worker picks a strategy from the path"),
      language: "ts",
      ...codePair(`
type RouteClass = "navigation" | "immutable-asset" | "catalog-data" | "sw-runtime" | "passthrough";
type Strategy = "network-first" | "cache-first" | "stale-while-revalidate" | "network-only";

const SW_RUNTIME = new Set(["/sw.js", "/manifest.webmanifest"]);

export function classify(pathname: string, isNavigation: boolean): RouteClass {
  if (SW_RUNTIME.has(pathname)) return "sw-runtime"; //~ 워커 스크립트는 캐시하지 않는다 ## never cache the worker script
  if (pathname === "/audio/playlist.json") return "passthrough"; //~ 바뀌는 목록은 건드리지 않는다 ## leave a changing list alone
  if (isNavigation) return "navigation";
  if (pathname === "/assets/studio/cc0-20260906/manifest.json") return "catalog-data"; //~ 제자리에서 바뀌는 예외 ## the exception that changes in place
  if (pathname.startsWith("/assets/")) return "immutable-asset"; //~ URL 이 곧 버전 ## the URL is the version
  if (pathname.startsWith("/data/") || pathname.startsWith("/i18n/")) return "catalog-data";
  return "passthrough";
}

export function strategy(kind: RouteClass): Strategy {
  switch (kind) {
    case "immutable-asset": return "cache-first"; //~ 맞으면 틀릴 수 없으니 다시 묻지 않는다 ## a hit cannot be wrong, so no revalidation
    case "catalog-data": return "stale-while-revalidate"; //~ 빨리 주고 뒤에서 새로 받는다 ## serve fast, refresh behind
    case "navigation": return "network-first"; //~ 새 배포가 다음 접속에 바로 닿는다 ## a new deploy reaches the next visit
    default: return "network-only";
  }
}
`),
      explain: t(
        "실제 정책은 분류가 10가지(heavy-asset·static-media·cover-image·api 등)이고 쓰기·Range·교차 출처 요청은 통과시킵니다. 순수 함수라 브라우저 없이 시험할 수 있고, 같은 예외(CC0 매니페스트)가 헤더 JSON에도 있습니다.",
        "The real policy has ten classes (heavy-asset, static-media, cover-image, api and more) and passes through writes, range and cross-origin requests. Being pure functions they are testable without a browser, and the same exception (the CC0 manifest) also appears in the header JSON.",
      ),
      source: "apps/web/src/app/service-worker/studio-service-worker-policy.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "MDN · Cache-Control",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cache-Control",
      kind: "docs",
      note: t("immutable·no-cache·must-revalidate 등 지시어의 뜻", "Meaning of directives such as immutable, no-cache and must-revalidate"),
    },
    {
      title: "RFC 8246 · HTTP Immutable Responses",
      url: "https://www.rfc-editor.org/rfc/rfc8246",
      kind: "spec",
      note: t("바뀌지 않는 응답을 다시 확인하지 않게 하는 immutable 표준", "The standard for immutable: do not revalidate responses that never change"),
    },
    {
      title: "RFC 9111 · HTTP Caching",
      url: "https://www.rfc-editor.org/rfc/rfc9111",
      kind: "spec",
      note: t("캐시가 응답을 보관·재사용하는 규칙의 표준", "The standard for how caches store and reuse responses"),
    },
    {
      title: "RFC 5861 · stale-while-revalidate",
      url: "https://www.rfc-editor.org/rfc/rfc5861",
      kind: "spec",
      note: t("낡은 응답을 먼저 주고 뒤에서 갱신하는 확장", "The extension that serves a stale reply first and refreshes behind"),
    },
    {
      title: "Cloudflare · Static Assets headers",
      url: "https://developers.cloudflare.com/workers/static-assets/headers/",
      kind: "docs",
      note: t("기본 헤더와 _headers 규칙이 겹칠 때의 동작", "Default headers and what happens when _headers rules overlap"),
    },
    {
      title: "Vite · Static Asset Handling",
      url: "https://vite.dev/guide/assets.html",
      kind: "docs",
      note: t("import한 자산은 해시 이름, public 폴더는 이름 그대로", "Imported assets get hashed names; the public folder keeps names as they are"),
    },
  ],
  chapterIds: ["delivery", "performance"],
  talk: {
    pitch: t(
      "파일 이름에 내용 지문을 넣으면 이름이 같은 파일은 영원히 같은 파일이라, 1년 동안 다시 묻지 않고 보관해도 됩니다. ToonStudio는 해시 이름의 /assets 파일을 1년 immutable로, 서비스 워커 스크립트와 HTML은 매번 확인하도록 응답 규칙을 JSON 한 곳에 적고 서비스 워커도 같은 구분을 따르게 했습니다. 그래서 새 배포는 늘 확인되는 HTML을 통해 새 이름의 파일로 이어집니다. 예외 규칙이 겹칠 때의 실제 응답은 아직 확인하지 못했습니다.",
      "Put a content fingerprint in a file name and a file with the same name is the same file forever, so it can be kept for a year without asking again. ToonStudio writes its response rules in one JSON: hashed /assets files are immutable for a year, and the service-worker script and HTML are rechecked every time, with the service worker following the same split. A new deploy therefore reaches users through the always-checked HTML and its new file names. What production actually sends where exception rules overlap has not been confirmed yet.",
    ),
    analogy: t(
      "도서관 책의 청구기호와 같습니다. 청구기호가 같으면 같은 책이라 다시 확인하지 않고, 새 판이 나오면 새 청구기호를 달고, 서가 안내판(HTML)만 매번 새로 읽습니다.",
      "It works like a library call number: the same number means the same book, so no recheck; a new edition gets a new number; and only the shelf directory (the HTML) is read afresh each time.",
    ),
    questions: [
      {
        question: t("새 버전이 나와도 옛 파일을 1년 들고 있나요?", "Does the browser hold old files for a year even after a new version?"),
        answer: t(
          "옛 파일은 옛 이름으로만 쓰입니다. 새 HTML은 새 이름을 가리키므로 새 파일을 받고, 옛 이름 파일은 더는 요청되지 않습니다. 오래 열려 있던 옛 탭이 옛 이름의 청크를 뒤늦게 요청하면 실패할 수 있고, 그 복구는 '옛 탭이 새 배포를 만났을 때' 카드가 다룹니다.",
          "Old files are used only under old names. The new HTML points to new names, so new files are fetched and old-name files are no longer requested. An old tab that stayed open may later request an old-name chunk and fail, and recovery for that is on the 'When an old tab meets a new deploy' card.",
        ),
      },
      {
        question: t("HTML도 캐시하면 더 빠르지 않나요?", "Wouldn't caching HTML be faster?"),
        answer: t(
          "HTML을 오래 붙들면 새 배포가 보이지 않습니다. 대신 Static Assets 기본값은 ETag로 같으면 다시 받지 않으므로 확인 비용이 작습니다. 서비스 워커도 HTML은 network-first로 두어 수정 배포가 다음 온라인 접속에 닿게 합니다(문서가 1차 복구 경로라고 적습니다).",
          "Holding HTML for long hides new deploys. The Static Assets default uses an ETag so an unchanged page is not downloaded again, which keeps the check cheap. The service worker also keeps HTML network-first so a fix reaches the next online visit (the doc calls this the first recovery path).",
        ),
      },
      {
        question: t("운영에서 실제 헤더를 확인했나요?", "Did you check the real headers in production?"),
        answer: t(
          "아니요. 이 카드는 JSON 원천, 생성된 _headers, 시험과 공식 문서를 읽은 것입니다. 특히 /assets/*와 CC0 매니페스트 규칙이 겹치는 경로의 실제 Cache-Control은 받아 보지 못했습니다.",
          "No. This card is based on the JSON source, the generated _headers, tests and official documentation. In particular the real Cache-Control for the path matched by both the /assets/* and CC0 manifest rules was not fetched.",
        ),
      },
    ],
    pitfall: t(
      "'/assets 아래는 전부 해시 이름이라 안전하다'고 말하지 마세요. public 폴더 파일은 해시가 붙지 않아 폴더 이름의 날짜·버전 관례에 기댑니다. 이 관례를 강제하는 자동 검사는 찾지 못했습니다. 또 겹치는 예외 규칙의 운영 응답과 헤더·워커 분류의 직접 대조 시험은 확인하지 못했습니다.",
      "Do not say everything under /assets is hashed and therefore safe. Public-folder files carry no hash and rely on the date or version convention in folder names, and no automatic check enforcing that convention was found. The production response for overlapping exception rules, and a direct test comparing headers with worker classes, were not confirmed either.",
    ),
  },
  technologies: ["Cache-Control", "Vite", "Service Worker", "Cloudflare Static Assets", "Cache Storage"],
  facts: [
    {
      value: "31536000",
      label: t("/assets/* 의 max-age(초, 1년)", "max-age of /assets/* in seconds (one year)"),
      source: "config/http-response-headers.json",
    },
    {
      value: "no-cache",
      label: t("/sw.js 의 Cache-Control", "Cache-Control of /sw.js"),
      source: "config/http-response-headers.json",
    },
  ],
  reviewedAt: "2026-10-08",
};

const VERSION_SKEW_CHUNK_RELOAD_RECOVERY: EngineeringAtlasEntry = {
  id: "version-skew-chunk-reload-recovery",
  category: "platform-ops",
  name: "Version skew recovery",
  title: t(
    "옛 탭이 새 배포를 만났을 때: 한 번만 새로고침하고, 실시간 서버는 옛 버전을 거절합니다",
    "When an old tab meets a new deploy: reload once, and the realtime server refuses old versions",
  ),
  status: "live",
  tagline: t(
    "사라진 청크는 세션당 한 번만 새로고침해 복구하고, 실시간 서버는 다른 버전의 메시지를 거절합니다.",
    "A vanished chunk is recovered with one reload per session, and the realtime server refuses messages of another version.",
  ),
  background: [
    t(
      "웹앱은 서버와 달리 사용자의 브라우저 탭 안에서 오래 살아 있습니다. 어제 연 탭이 오늘 배포된 서버와 대화하면, 탭은 옛 코드인데 서버는 새 규칙을 쓰는 '버전 어긋남'(version skew)이 생깁니다. 지난주 메뉴판을 든 손님이 오늘 바뀐 주방에 주문하는 셈입니다. ToonStudio는 이 어긋남을 세 방향에서 다룹니다. 옛 파일이 사라진 경우, 옛 클라이언트가 서버에 말을 거는 경우, 서버가 먼저 바뀌는 경우입니다.",
      "Unlike a server, a web app lives long inside a user's browser tab. When a tab opened yesterday talks to a server deployed today, version skew appears: the tab runs old code while the server follows new rules, like a guest holding last week's menu ordering from a kitchen that changed today. ToonStudio handles this skew from three directions: the old file has vanished, an old client talks to the server, and the server changes first.",
    ),
    t(
      "첫째, 새 배포의 dist에는 이번 빌드의 해시 이름 파일만 있으므로(빌드가 출력 폴더를 비웁니다) 옛 탭이 나중에 요청하는 지연 로딩 청크는 없습니다. 요청은 404나 index.html로 끝나 동적 import가 실패하고, 코드는 이 오류 문구를 chunk_load로 분류합니다. 화면 전체가 무너지면 오류 경계가 세션당 한 번만 자동 새로고침하고, 편집 중 개별 import는 청크마다 sessionStorage 표식을 남겨 한 번만 새로고침합니다. 저장소가 막혀 표식을 못 남기면 새로고침이 반복되지 않도록 복구를 포기합니다(fail-closed).",
      "First, the dist of a new deploy contains only this build's hashed files (the build empties the output folder), so a lazily loaded chunk that an old tab requests later is gone. The request ends as a 404 or index.html, the dynamic import fails, and the code classifies that error text as chunk_load. If the whole screen breaks, the error boundary reloads automatically once per session, and an individual import during editing leaves a sessionStorage mark per chunk and reloads once. If storage is blocked and no mark can be kept, recovery is skipped so reloads cannot repeat (fail-closed).",
    ),
    t(
      "둘째, 옛 클라이언트가 서버에 말을 거는 경우입니다. 실시간 협업은 어긋남을 조용히 섞지 않고 거절합니다. 방 프로토콜 버전 8은 stroke payload v6(엔진 프로그램)을 받는 첫 버전이라, 서버가 z.literal(8)로 v1~v7 메시지를 거절해 옛 탭이 재질 획을 몰래 빠뜨리는 일을 막습니다(코드 주석). 일반 HTTP API에는 클라이언트 버전 헤더나 426 응답 같은 장치를 찾지 못했습니다. 셋째, 서버가 먼저 바뀌는 경우는 문서 정책이 맡습니다. 마이그레이션이 있는 릴리스를 expand(옛·새 런타임이 모두 쓸 수 있는 추가만)와 contract(옛 바이너리가 사라진 뒤 삭제) 두 번으로 나눕니다.",
      "Second, an old client talks to the server. Realtime collaboration refuses skew rather than mixing it silently: room protocol version 8 is the first to accept stroke payload v6 (engine programs), so the server rejects v1 to v7 messages with z.literal(8) to stop old tabs from silently dropping material strokes (per a code comment). No client-version header or 426 response was found for the ordinary HTTP API. Third, when the server changes first, a documented policy applies: a release with a migration is split into expand (additions that both old and new runtimes can use) and contract (deletions after the old binary is gone).",
    ),
    t(
      "브라우저 쪽 업데이트(새 서비스 워커를 대기시키고 저장 뒤 사용자가 누를 때만 교체)는 '저장이 끝나야 눌리는 업데이트 버튼' 카드가 다룹니다. 한계는 분명합니다. 서버가 응답 필드를 지우거나 이름을 바꾸면 옛 탭의 Zod 검사가 실패할 수 있는데 이를 자동으로 잡는 장치는 찾지 못했고, 옛 탭을 얼마나 오래 지원하는지 정한 기록도 없습니다. expand/contract 순서는 코드가 강제하지 않는 문서 정책입니다. Vite가 권하는 vite:preloadError 리스너는 쓰지 않고 오류 경계와 import 래퍼에 의존합니다.",
      "The browser-side update (park a new service worker and swap only when the user presses the button after saving) is covered by the 'An update button that unlocks only after saving' card. The limits are plain. If the server deletes or renames a response field, an old tab's Zod check can fail and no mechanism catching that automatically was found, nor any record of how long old tabs are supported. The expand/contract order is a documented policy that code does not enforce. The vite:preloadError listener Vite recommends is not used; the code relies on the error boundary and an import wrapper.",
    ),
  ],
  keyPoints: [
    t("사라진 청크: 오류 분류 후 세션당 한 번만 자동 새로고침", "A vanished chunk: classify the error, reload automatically once per session"),
    t("저장소가 막혀 표식을 못 남기면 새로고침하지 않음", "If storage blocks the mark, no reload happens"),
    t("실시간 프로토콜 8: z.literal로 옛 탭 메시지를 거절", "Realtime protocol 8: z.literal refuses old-tab messages"),
    t("서버 변경은 expand 먼저: 문서 정책이며 코드 강제는 아님", "Server changes go expand first: a documented policy, not code-enforced"),
  ],
  diagram: {
    id: "version-skew-chunk-reload-recovery-diagram",
    kind: "sequence",
    title: t("어제 연 탭이 오늘의 배포를 만나는 순서", "What happens when yesterday's tab meets today's deploy"),
    caption: t(
      "사라진 파일은 한 번의 새로고침으로, 서버와의 어긋남은 거절로 다룹니다.",
      "A vanished file is handled with one reload, and a mismatch with the server with a refusal.",
    ),
    alt: t(
      "어제 연 탭이 지연 로딩 청크를 옛 이름으로 요청하면 정적 호스트는 404나 index.html로 답합니다. 탭의 import가 실패하면 복구 코드가 오류를 chunk_load로 분류하고 세션 표식을 확인한 뒤 전체 새로고침을 한 번 합니다. 새 HTML과 새 번들이 도착합니다. 새로고침 전의 옛 탭이 실시간 서버에 버전 7 메시지를 보내면 서버는 버전 불일치로 거절합니다. 새로고침 뒤에도 실패하면 자동 새로고침 대신 버튼을 보여 줍니다.",
      "When a tab opened yesterday requests a lazily loaded chunk under its old name, the static host answers 404 or index.html. When the import fails, the recovery code classifies the error as chunk_load, checks the session mark and reloads the page once. The new HTML and new bundle arrive. If the old tab, before reloading, sends a version-7 message to the realtime server, the server refuses it for the version mismatch. If it still fails after a reload, a button is shown instead of another automatic reload.",
    ),
    actors: [
      { id: "tab", label: t("옛 탭", "Old tab"), sub: t("어제 연 번들", "Yesterday's bundle"), tone: "local" },
      { id: "host", label: t("정적 호스트", "Static host"), sub: t("새 배포: 새 해시 이름", "New deploy, new hashes"), tone: "edge" },
      { id: "guard", label: t("복구 코드", "Recovery code"), sub: t("오류 경계·import 래퍼", "Error boundary, wrapper"), tone: "warn" },
      { id: "api", label: t("실시간 서버", "Realtime server"), sub: t("프로토콜 버전 8", "Protocol version 8"), tone: "server" },
    ],
    messages: [
      { from: "tab", to: "host", label: t("지연 로딩 청크 요청", "Request a lazy chunk"), note: t("옛 해시 이름(어제 번들 기준)", "Old hashed name from yesterday's bundle") },
      { from: "host", to: "tab", label: t("404 또는 index.html", "404 or index.html"), style: "dashed", note: t("새 배포에는 옛 파일이 없음", "The new deploy has no old file") },
      { from: "tab", to: "guard", label: t("import 실패를 알림", "Report the import failure"), note: t("오류 문구를 chunk_load로 분류", "Message classified as chunk_load") },
      { from: "guard", to: "guard", label: t("세션 표식 확인", "Check the session mark"), note: t("sessionStorage, 없으면 기록", "sessionStorage; write it if absent") },
      { from: "guard", to: "host", label: t("전체 새로고침 (1회)", "Full reload (once)"), note: t("새 HTML이 새 해시를 가리킴", "New HTML points at new hashes") },
      { from: "host", to: "tab", label: t("새 HTML과 새 번들", "New HTML and bundle"), style: "dashed" },
      { from: "tab", to: "api", label: t("실시간 메시지 (버전 7)", "Realtime message (version 7)"), note: t("새로고침 전의 옛 탭이라면", "If it is an old tab before reloading") },
      { from: "api", to: "tab", label: t("거절: 버전 불일치", "Refused: version mismatch"), style: "dashed", note: t("z.literal(8), 조용히 섞지 않음", "z.literal(8); never mixed silently") },
      { from: "guard", to: "tab", label: t("또 실패하면 버튼 표시", "On a repeat failure, show a button"), style: "dashed", note: t("자동 새로고침은 세션당 1회", "One automatic reload per session") },
    ],
  },
  usage: [
    {
      feature: t("화면 전체 오류 복구 (오류 경계)", "Whole-screen error recovery (error boundary)"),
      role: t(
        "chunk_load 오류면 세션당 한 번 자동 새로고침하고, 이미 시도했으면 사용자에게 '새로고침' 버튼을 보여 줍니다. 앱이 하는 새로고침으로 표시해 이탈 확인은 건너뜁니다.",
        "For a chunk_load error it reloads automatically once per session, and if that was already tried it shows a Reload button. It marks the reload as the app's own, which skips the leave confirmation.",
      ),
      paths: [
        "apps/web/src/app/errors/error-boundary.tsx",
        "apps/web/src/platform/browser/runtime-error-classification.ts",
        "apps/web/src/app/errors/chunk-reload-guard.ts",
      ],
      route: "/",
    },
    {
      feature: t("스튜디오 편집 중 지연 로딩 import", "Lazy imports while editing in the Studio"),
      role: t(
        "팀 코멘트 저장이나 서버 리비전 복원처럼 이벤트로 불러오는 청크는 청크별 표식으로 한 번만 복구합니다. 평범한 reload라 저장 안 된 작업이 있으면 이탈 확인이 뜨고, 취소하면 요청을 대기 상태로 둡니다.",
        "Chunks loaded from events, such as saving a team comment or restoring a server revision, recover once through a per-chunk mark. It is a plain reload, so unsaved work raises the leave confirmation and cancelling leaves the request pending.",
      ),
      paths: [
        "apps/web/src/shared/lib/chunk-load-recovery.ts",
        "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
      ],
      route: "/studio",
    },
    {
      feature: t("실시간 협업 프로토콜 버전 문", "The realtime collaboration protocol version gate"),
      role: t(
        "서버가 프로토콜 8이 아닌 메시지를 거절하고, 웹은 같은 상수를 선언하며, 통합 시험이 두 값이 같다고 단언합니다.",
        "The server refuses messages that are not protocol 8, the web declares the same constant, and an integration test asserts the two values are equal.",
      ),
      paths: [
        "apps/api/src/modules/creator/studio-live.protocol.ts",
        "apps/web/src/domains/creator/live/studio-crdt-protocol.ts",
        "tests/integration/api-web/api/modules/creator/studio-live.protocol.test.ts",
      ],
    },
    {
      feature: t("서버가 먼저 바뀌는 릴리스", "Releases where the server changes first"),
      role: t(
        "옛 런타임과 호환되는 추가 전용 변경을 먼저 내고 삭제는 별도 릴리스로 미룹니다. 롤링 배포용 스위치는 모든 노드가 새 버전이 된 뒤에만 켭니다.",
        "Additions compatible with the old runtime ship first and deletions wait for a separate release. A rolling-deploy switch is turned on only after every node runs the new version.",
      ),
      paths: ["DEPLOY.md", ".env.example"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("실패하면 한 번만 새로고침하는 import 래퍼", "An import wrapper that reloads once when it fails"),
      language: "ts",
      ...codePair(`
const tried = (key: string): boolean => {
  try { return sessionStorage.getItem(key) !== null; } catch { return true; } //~ 저장소가 막히면 '이미 했다'로 본다 ## Blocked storage counts as 'already tried'
};
const mark = (key: string): boolean => {
  try { sessionStorage.setItem(key, "1"); return true; } catch { return false; }
};
const clearMark = (key: string): void => {
  try { sessionStorage.removeItem(key); } catch { return; } //~ 막혀도 로딩 결과는 그대로 돌려준다 ## The load result is returned even if storage is blocked
};

export async function loadWithReloadOnce<T>(load: () => Promise<T>, chunkId: string): Promise<T> {
  const key = "chunk-reload:" + chunkId;
  try {
    const loaded = await load();
    clearMark(key); //~ 성공하면 표식을 지워 다음 배포 때 다시 복구한다 ## On success clear the mark so the next deploy can recover again
    return loaded;
  } catch (error) {
    if (tried(key) || !mark(key)) throw error; //~ 한 번 해도 실패하면 사용자에게 알린다 ## Still failing after one try: tell the user
    location.reload(); //~ 새 HTML 이 새 해시 이름을 가리킨다 ## The new HTML points at the new hashed names
    return new Promise<never>(() => undefined); //~ 화면이 바뀔 때까지 대기 상태로 둔다 ## Stay pending until the page is replaced
  }
}
`),
      explain: t(
        "실제 코드는 청크마다 표식을 두는 것 외에 오류 경계와 공유하는 세션 전체 표식과 '소유자' 표식도 관리해, 서로 다른 import가 복구를 가로채 새로고침이 반복되지 않게 합니다. 여기서는 한 번만, 저장소가 막히면 포기한다는 핵심만 남겼습니다.",
        "The real code also manages a session-wide mark shared with the error boundary and an 'owner' mark, so unrelated imports cannot claim a recovery and reloads cannot repeat. This keeps only the core: once, and give up when storage is blocked.",
      ),
      source: "apps/web/src/shared/lib/chunk-load-recovery.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("사라진 청크 오류를 알아보는 분류기", "A classifier that recognizes the vanished-chunk error"),
      language: "ts",
      ...codePair(`
type ErrorKind = "chunk_load" | "network" | "general";

//~ 새 배포 뒤 사라진 청크를 가리키는 오류 문구를 한 곳에서 분류한다 ## Classify in one place the messages that mean a chunk vanished after a deploy
export function classifyRuntimeError(error: unknown): ErrorKind {
  const err = error instanceof Error ? error : new Error(String(error));
  const message = err.message.toLowerCase();
  if (
    message.includes("failed to fetch dynamically imported module") ||
    message.includes("loading chunk") ||
    message.includes("error loading dynamically imported module") ||
    err.name.toLowerCase().includes("chunkloaderror")
  ) {
    return "chunk_load";
  }
  if (message.includes("networkerror") || message.includes("failed to fetch")) return "network";
  return "general";
}

//~ 오류 경계의 결정: chunk_load 이고 아직 시도 전일 때만 자동으로 새로고침한다 ## The boundary's decision: reload automatically only for chunk_load and only if not yet tried
export const shouldAutoReload = (kind: ErrorKind, alreadyTried: boolean): boolean =>
  kind === "chunk_load" && !alreadyTried;
`),
      explain: t(
        "오류 문구 분류는 브라우저가 내는 문자열에 의존하므로, 새 브라우저가 다른 문구를 쓰면 놓칠 수 있습니다. 실제 분류기는 호환성·일반 오류도 구분합니다.",
        "Classifying by message text depends on strings that browsers produce, so a browser using different wording could be missed. The real classifier also tells compatibility and general errors apart.",
      ),
      source: "apps/web/src/platform/browser/runtime-error-classification.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "Vite · Building for Production (Load Error Handling)",
      url: "https://vite.dev/guide/build.html",
      kind: "docs",
      note: t("배포 뒤 옛 청크가 사라져 생기는 import 오류와 vite:preloadError", "The import error from chunks that vanish after a deploy, and vite:preloadError"),
    },
    {
      title: "web.dev · The service worker lifecycle",
      url: "https://web.dev/articles/service-worker-lifecycle",
      kind: "guide",
      note: t("새 워커가 대기하는 이유와 교체 시점", "Why a new worker waits and when it takes over"),
    },
    {
      title: "MDN · Window: sessionStorage",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/sessionStorage",
      kind: "docs",
      note: t("탭 단위로 남는 표식을 두는 저장소", "The storage for marks that live per tab"),
    },
    {
      title: "MDN · Location: reload()",
      url: "https://developer.mozilla.org/en-US/docs/Web/API/Location/reload",
      kind: "docs",
      note: t("현재 문서를 다시 불러오는 메서드", "The method that loads the current document again"),
    },
    {
      title: "Martin Fowler · Parallel Change",
      url: "https://martinfowler.com/bliki/ParallelChange.html",
      kind: "article",
      note: t("expand와 contract로 호환을 지키며 바꾸는 방법", "Changing safely with expand and contract"),
    },
  ],
  chapterIds: ["pwa-continuity", "delivery"],
  talk: {
    pitch: t(
      "웹앱은 어제 열어 둔 탭이 오늘 배포된 서버와 만날 수 있습니다. 그때 두 가지가 어긋납니다. 하나는 옛 탭이 찾는 파일이 새 배포에서 사라지는 일인데, 오류를 알아본 코드가 세션당 한 번만 새로고침해 새 버전으로 갈아탑니다. 다른 하나는 옛 탭이 서버와 대화하는 일인데, 실시간 서버는 프로토콜 버전이 다르면 아예 거절합니다. 서버를 바꿀 때는 옛 버전과 함께 쓸 수 있는 추가를 먼저 내는 순서를 문서로 지킵니다.",
      "A tab left open yesterday can meet a server deployed today, and two things can drift. One is that the file the old tab looks for vanishes in the new deploy: the code that recognizes the error reloads once per session to switch to the new version. The other is that the old tab talks to the server: the realtime server flatly refuses a different protocol version. When the server changes, the order of shipping additions that work with the old version first is kept by documented policy.",
    ),
    analogy: t(
      "지난주 메뉴판을 든 손님이 왔을 때 메뉴가 바뀐 것을 알리고 새 메뉴판을 한 번만 건네는 것과 같습니다. 건네도 계속 틀리면 손님에게 직접 확인해 달라고 합니다.",
      "It is like telling a guest with last week's menu that the menu changed and handing over the new one just once; if it still goes wrong, the guest is asked to check in person.",
    ),
    questions: [
      {
        question: t("새로고침하다 작업이 날아가지 않나요?", "Could the reload lose my work?"),
        answer: t(
          "스튜디오 편집 중 개별 import 실패는 평범한 새로고침이라 저장 안 된 작업이 있으면 이탈 확인이 뜨고, 취소하면 요청을 대기 상태로 둡니다. 화면 전체가 오류 경계로 떨어진 경우는 확인 없이 한 번 자동 새로고침하며, 로컬 우선 자동저장이 받쳐 줍니다. 이번에 두 경로를 브라우저에서 시험하지는 않았습니다.",
          "A single failed import while editing in the Studio is a plain reload, so unsaved work raises the leave confirmation and cancelling leaves the request pending. If the whole screen falls into the error boundary, it reloads once without a prompt, backed by local-first autosave. Neither path was exercised in a browser for this card.",
        ),
      },
      {
        question: t("서버가 응답 모양을 바꾸면 옛 탭은요?", "What about old tabs if the server changes a response shape?"),
        answer: t(
          "HTTP API에는 클라이언트 버전을 확인하는 장치를 찾지 못했습니다. 서버 변경은 추가 전용(expand)을 먼저 내고 삭제(contract)는 별도 릴리스로 미루는 문서 정책으로 다루며, 이 순서를 코드가 강제하지는 않습니다.",
          "No mechanism checking the client version was found for the HTTP API. Server changes follow a documented policy of shipping additions (expand) first and deferring deletions (contract) to a separate release, and code does not enforce that order.",
        ),
      },
      {
        question: t("옛 탭을 얼마나 오래 지원하나요?", "How long are old tabs supported?"),
        answer: t(
          "호환 창의 길이를 정한 기록은 찾지 못했습니다. 실시간 프로토콜은 8이 아닌 메시지를 바로 거절합니다.",
          "No record fixing the length of a compatibility window was found. The realtime protocol rejects any message that is not version 8 at once.",
        ),
      },
    ],
    pitfall: t(
      "'버전이 달라도 자동으로 맞춰진다'고 말하면 과장입니다. 자동 복구는 사라진 청크 한 경우에 한 번뿐이고, 서버 응답 모양이 바뀌는 경우는 정책과 리뷰에 의존합니다. 이 카드는 코드·시험·문서를 읽어 확인했으며 실제 배포 중인 탭으로 재현해 보지는 않았습니다.",
      "Saying that mismatched versions fix themselves would be an exaggeration. Automatic recovery covers one case, a vanished chunk, and only once; changed server response shapes rely on policy and review. This card was checked by reading code, tests and docs and was not reproduced with a tab left open across a real deploy.",
    ),
  },
  technologies: ["Vite", "Service Worker", "Zod", "Cloudflare Static Assets", "React"],
  facts: [
    {
      value: "8",
      label: t("서버가 요구하는 실시간 CRDT 프로토콜 버전", "Realtime CRDT protocol version the server requires"),
      source: "apps/api/src/modules/creator/studio-live.protocol.ts",
    },
    {
      value: "5",
      label: t("서비스 워커 캐시 계약 버전(응답을 재생할 수 없게 될 때만 올림)", "Service-worker cache contract version (raised only when replay breaks)"),
      source: "apps/web/src/app/service-worker/studio-service-worker-policy.ts",
    },
  ],
  reviewedAt: "2026-10-08",
};

const RELEASE_ORDER_EXPAND_CONTRACT_ROLLBACK: EngineeringAtlasEntry = {
  id: "release-order-expand-contract-rollback",
  category: "platform-ops",
  name: "Release order and rollback",
  title: t(
    "무엇을 먼저 올리나: DB → API → 정적 웹, 되돌릴 단위는 따로",
    "What ships first: database, API, then static site, each with its own rollback unit",
  ),
  status: "configured",
  tagline: t(
    "순서는 사람이 따르는 절차이고 단계마다 관문은 코드입니다. 되돌릴 단위는 서비스마다 다릅니다.",
    "The order is a human procedure with a coded gate at each step, and every service has its own rollback unit.",
  ),
  background: [
    t(
      "프런트와 백엔드가 따로 올라가는 서비스에서는 '무엇을 먼저 올리나'가 곧 호환 정책입니다. 새 화면이 먼저 나가면 아직 없는 API를 부르고, 서버가 먼저 나가면 열려 있는 옛 화면이 새 규칙에 부딪힙니다. ToonStudio의 문서 순서는 DB 마이그레이션, Core API 검증, 정적 웹 순서입니다. 이 순서는 사람이 따르는 절차이고, 세 단계를 한 번에 이어 실행하는 스크립트는 없으며 순서를 어기면 막는 코드도 찾지 못했습니다.",
      "In a service whose front end and back end ship separately, what goes first is the compatibility policy. If a new screen ships first it calls an API that does not exist yet, and if the server ships first the old screens still open meet new rules. ToonStudio's documented order is database migration, Core API verification, then the static site. The order is a procedure people follow: no script runs the three steps in one go, and no code that blocks a wrong order was found.",
    ),
    t(
      "단계마다 관문은 코드입니다. ① 승인한 40자리 main SHA와 바뀐 배포 단위를 기록합니다. ② DB 변경이 있으면 승인형 워크플로가 먼저 돌며, release_sha가 origin/main의 조상이어야 하고 기존 Studio 쓰기를 비웠다는 확인 문구가 필요합니다. ③ Render Core API를 수동 배포하되 Cloudflare의 CORE_API_ORIGIN은 아직 바꾸지 않고 verify:render-core-origin으로 live·ready 응답 계약을 확인합니다. ④ 정적 웹을 dry-run한 뒤 배포하며, 번들에 굽는 VITE_* 값과 Worker에 꽂는 변수는 같은 실행에서 나옵니다. ⑤ 로그인, OAuth 콜백, 업로드, 실시간 재연결, 링크 미리보기를 점검합니다.",
      "Each step has a coded gate. (1) Record the approved 40-character main SHA and the deploy units that changed. (2) If there is a database change, the approval-gated workflow runs first: release_sha must be an ancestor of origin/main and a confirmation phrase says existing Studio writers were drained. (3) Deploy the Render Core API by hand without yet changing Cloudflare's CORE_API_ORIGIN, and check the live and ready reply contract with verify:render-core-origin. (4) Dry-run, then deploy the static site; the VITE_* values baked into the bundle and the variables set on the Worker come from the same run. (5) Check sign-in, the OAuth callback, upload, realtime reconnect and link previews.",
    ),
    t(
      "서버를 먼저 올리면 열려 있는 옛 탭이 새 서버를 만나므로, 마이그레이션이 있는 릴리스는 두 번으로 나눕니다. expand는 옛 런타임과 새 런타임이 모두 쓸 수 있는 추가 전용 변경(삭제·이름 변경·더 엄격한 제약 제외)을 먼저 냅니다. contract는 옛 바이너리가 완전히 사라진 뒤에만 별도 릴리스로 냅니다. 롤링 배포 스위치도 같은 발상입니다. STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED는 모든 API 노드가 새 버전을 실행한 뒤에만 true로 바꾸라고 .env.example에 적혀 있습니다.",
      "Shipping the server first means tabs left open meet the new server, so a release with a migration is split in two. Expand ships additions that both the old and the new runtime can use (no deletions, renames or stricter constraints) first. Contract ships only after the old binary has completely disappeared, as a separate release. A rolling-deploy switch follows the same idea: .env.example says to set STUDIO_LIVE_POSTGRES_INLINE_BINARY_ENABLED to true only after every API node runs the new version.",
    ),
    t(
      "되돌릴 단위는 따로입니다. 정적 웹은 직전에 검증한 SHA를 같은 절차로 다시 배포하고, Core API는 Render의 직전 검증 version, Worker는 직전 Worker version입니다. Core API 전환이 실패하면 CORE_API_ORIGIN만 직전 검증 origin으로 되돌리고 정적·R2 계층은 유지합니다. DB는 자동으로 되돌리지 않습니다. 한계: 현재 운영의 SHA와 버전은 릴리스 기록과 대시보드로만 알 수 있고 이번에 열람하지 않았으며, 문서의 배포 명령 예시에는 승인 SHA 변수가 빠져 있어 스크립트 코드를 기준으로 삼았습니다.",
      "Rollback units differ. The static site is rolled back by redeploying the previous verified SHA through the same procedure, the Core API by Render's previous verified version and the Worker by its previous Worker version. If switching to a Core API fails, only CORE_API_ORIGIN is returned to the previous verified origin while the static and R2 layers stay. The database is not rolled back automatically. A limit: the SHA and version currently in production can be learned only from release records and dashboards, which were not opened for this card, and the docs' deploy command examples omit the approved-SHA variable, so the script code was taken as the reference.",
    ),
  ],
  keyPoints: [
    t("순서: DB 마이그레이션 → Core API 검증 → 정적 웹 (절차)", "Order: migration, Core API verification, static site (a procedure)"),
    t("서버 변경은 expand 먼저, contract는 옛 바이너리 소멸 뒤", "Server changes ship expand first and contract after the old binary is gone"),
    t("롤백 단위: 직전 SHA(정적), 직전 version(API·Worker)", "Rollback units: previous SHA (static), previous version (API, Worker)"),
    t("순서를 어기면 막는 코드는 찾지 못함", "No code that blocks a wrong order was found"),
  ],
  diagram: {
    id: "release-order-expand-contract-rollback-diagram",
    kind: "graph",
    title: t("올리는 순서와 관문, 되돌리는 길", "The release order, its gates and the way back"),
    caption: t(
      "DB, Core API 검증, 정적 웹 순서로 올리고, 문제가 생기면 단위마다 직전 SHA나 version으로 돌아갑니다.",
      "Ship the database, verify the Core API, then the static site; if something breaks each unit returns to its previous SHA or version.",
    ),
    alt: t(
      "승인한 SHA를 기록한 뒤 DB 변경이 먼저 나가고, 이때 변경은 옛 런타임과 호환되는 expand 단계입니다. 다음으로 Core API를 수동 배포하고 origin 검증을 통과해야 정적 웹을 올립니다. 정적 웹 뒤에는 로그인과 업로드 같은 배포 후 점검을 하고, 옛 바이너리가 사라진 뒤에야 contract 릴리스를 냅니다. 정적 웹에 문제가 생기면 직전 SHA나 version으로 롤백합니다.",
      "After the approved SHA is recorded, the database change ships first, and it is the expand step that stays compatible with the old runtime. The Core API is then deployed by hand and must pass origin verification before the static site ships. After the static site come post-release checks such as sign-in and upload, and the contract release comes only after the old binary is gone. If the static site misbehaves, it rolls back to the previous SHA or version.",
    ),
    nodes: [
      { id: "rec", label: t("승인 SHA 기록", "Record SHA"), sub: t("40자리 · 바뀐 단위", "40 chars, changed units"), tone: "warn", shape: "pill", at: [0, 1] },
      { id: "exp", label: t("expand 먼저", "Expand first"), sub: t("옛·새 런타임 모두 호환", "Old and new compatible"), tone: "server", at: [1, 0] },
      { id: "mig", label: t("① DB 변경", "1 Database"), sub: t("승인형 워크플로", "Approval workflow"), tone: "server", at: [1, 1] },
      { id: "api", label: t("② Core API", "2 Core API"), sub: t("Render 수동 배포", "Manual Render deploy"), tone: "server", at: [2, 1] },
      { id: "verify", label: t("origin 검증", "Origin check"), sub: t("live·ready", "live, ready"), tone: "good", shape: "diamond", at: [3, 1] },
      { id: "web", label: t("③ 정적 웹", "3 Static site"), sub: t("dry-run 뒤 배포", "Dry run, then ship"), tone: "edge", at: [4, 1] },
      { id: "smoke", label: t("배포 후 점검", "Post-release"), sub: t("로그인·업로드·실시간", "Sign-in, upload, realtime"), tone: "local", at: [5, 1] },
      { id: "contract", label: t("contract 나중에", "Contract later"), sub: t("옛 바이너리 소멸 뒤", "After old binary is gone"), tone: "neutral", at: [5, 0] },
      { id: "rollback", label: t("롤백", "Rollback"), sub: t("직전 SHA·version", "Previous SHA, version"), tone: "warn", at: [4, 2] },
    ],
    edges: [
      { from: "rec", to: "mig" },
      { from: "exp", to: "mig", label: t("추가만", "additive") },
      { from: "mig", to: "api" },
      { from: "api", to: "verify" },
      { from: "verify", to: "web", label: t("통과", "pass") },
      { from: "web", to: "smoke" },
      { from: "smoke", to: "contract", style: "dashed", label: t("관찰 뒤", "later") },
      { from: "web", to: "rollback", style: "dashed", label: t("문제 시", "if broken") },
    ],
  },
  usage: [
    {
      feature: t("정적 웹 수동 배포 스크립트", "Manual deploy script for the static site"),
      role: t(
        "승인 SHA·main·깨끗한 작업 폴더·HEAD 일치를 확인한 뒤 같은 실행 안에서 규칙 검사, 빌드, 에셋 준비, 서비스 워커 점검, R2 동기화, wrangler 배포를 순서대로 돌립니다. 한 단계가 실패하면 뒤 단계는 실행되지 않습니다(시험이 고정).",
        "After checking the approved SHA, main, a clean working folder and HEAD, it runs the rules check, build, asset preparation, service-worker check, R2 sync and wrangler deploy in order in one run. A failed step stops the later ones (pinned by a test).",
      ),
      paths: [
        "scripts/deploy-cloudflare-static.mjs",
        "scripts/deploy-cloudflare-static.test.mjs",
        "deploy/cloudflare-static/README.md",
      ],
    },
    {
      feature: t("승인형 DB 마이그레이션", "Approval-gated database migration"),
      role: t(
        "release_sha가 origin/main의 조상인지 확인하고, 구조·권한 검증이 끝난 뒤에야 다음 단계로 넘어갑니다. 원장에 releaseSha가 남습니다.",
        "It checks that release_sha is an ancestor of origin/main and moves on only after structure and permission verification. The releaseSha stays in the ledger.",
      ),
      paths: [
        ".github/workflows/production-database-migrations.yml",
        "scripts/run-production-database-migrations.mjs",
        "scripts/verify-production-database-capabilities.mjs",
      ],
    },
    {
      feature: t("Core API 전환 전 검증과 Render 설정", "Core API check before switching, and Render settings"),
      role: t(
        "Render 서비스의 자동 배포는 꺼져 있고, 전환 전에 live·ready 응답이 계약대로인지(리다이렉트 없음 포함) 확인합니다.",
        "Auto-deploy is off for the Render services, and before switching it checks that the live and ready replies follow the contract (including no redirects).",
      ),
      paths: ["render.yaml", "scripts/verify-render-core-origin.mjs"],
    },
    {
      feature: t("릴리스 순서와 롤백 문서", "Release-order and rollback documents"),
      role: t(
        "expand/contract, 변경된 단위만 배포, 릴리스 기록 항목(SHA·deploy ID·Worker version·롤백 대상)을 정합니다.",
        "They define expand/contract, deploying only changed units, and the release record items (SHA, deploy ID, Worker version, rollback target).",
      ),
      paths: ["DEPLOY.md", "docs/operations/minimum-cost-deployment-policy.md", "deploy/cloudflare-static/README.md"],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("DB를 바꿀 수 있는 커밋을 세 가지로 좁히기", "Narrowing which commits may change the database to three conditions"),
      language: "ts",
      ...codePair(`
type Git = (...args: string[]) => { status: number; out: string };

//~ 마이그레이션 워크플로의 확인 세 가지를 git 호출 주입 형태로 줄인 것 ## The workflow's three checks in a git-injected form
export function assertMigrationRelease(sha: string, git: Git): void {
  if (!/^[0-9a-f]{40}$/u.test(sha)) throw new Error("release_sha must be 40 lowercase hex characters");
  //~ 체크아웃한 HEAD 가 승인한 SHA 와 같아야 한다 ## The checked-out HEAD must equal the approved SHA
  if (git("rev-parse", "HEAD").out !== sha) throw new Error("HEAD differs from release_sha");
  //~ 보호된 main 에 이미 들어간 커밋만 DB 를 바꿀 수 있다 ## Only a commit already in the protected main may change the database
  if (git("merge-base", "--is-ancestor", sha, "origin/main").status !== 0) {
    throw new Error("release_sha is not an ancestor of origin/main");
  }
}
`),
      explain: t(
        "실제 워크플로는 bash로 같은 세 가지(형식, HEAD 일치, main의 조상)를 확인한 뒤 확인 문구와 writer 비움 문구까지 요구합니다. 정적 웹 배포 스크립트는 별도로 main 브랜치와 깨끗한 작업 폴더도 확인합니다.",
        "The real workflow checks the same three things (format, HEAD match, ancestor of main) in bash and then also requires a confirmation phrase and a writers-drained phrase. The static-site deploy script separately checks the main branch and a clean working folder.",
      ),
      source: ".github/workflows/production-database-migrations.yml",
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("expand와 contract: 두 번에 나눠 바꾸기", "Expand and contract: changing in two releases"),
      language: "sql",
      ...codePair(
        `
#~ expand 릴리스: 추가만 한다. 옛 런타임은 title 만, 새 런타임은 둘 다 읽으므로 옛 화면과 함께 쓸 수 있다 ## expand release: additions only. The old runtime reads title, the new one reads both, so the old screens keep working
ALTER TABLE creator_work ADD COLUMN display_title text;
UPDATE creator_work SET display_title = title WHERE display_title IS NULL;
#~ 새 런타임은 display_title 을 먼저 읽고 없으면 title 을 읽는다: 두 이름을 모두 읽는 동안은 되돌려도 안전하다 ## The new runtime reads display_title first and falls back to title: rolling back is safe while both names are read

#~ contract 릴리스는 옛 바이너리가 완전히 사라진 뒤 별도 릴리스로만 낸다: 되돌리기 어려운 변경은 맨 마지막이다 ## The contract release comes only after the old binary is gone, as its own release: the hard-to-undo change is last
-- ALTER TABLE creator_work DROP COLUMN title;
`,
        "--",
      ),
      explain: t(
        "표와 열 이름은 설명용이며 저장소의 실제 마이그레이션이 아닙니다. 요점은 순서입니다. 삭제·이름 변경·더 엄격한 제약은 옛 런타임을 깨므로 expand 단계에 넣지 않고, 롤백 안전은 expand SQL이 옛 런타임과 호환되는지에 달려 있습니다.",
        "The table and column names are illustrative and not a real migration from the repository. The point is the order: deletions, renames and stricter constraints break the old runtime, so they stay out of the expand step, and rollback safety depends on the expand SQL being compatible with the old runtime.",
      ),
      verify: "none",
    },
  ],
  links: [
    {
      title: "Martin Fowler · Parallel Change",
      url: "https://martinfowler.com/bliki/ParallelChange.html",
      kind: "article",
      note: t("expand와 contract로 호환을 지키며 바꾸는 방법", "Changing safely with expand and contract"),
    },
    {
      title: "Git · git-merge-base (--is-ancestor)",
      url: "https://git-scm.com/docs/git-merge-base",
      kind: "docs",
      note: t("커밋이 다른 브랜치의 조상인지 확인하는 명령", "The command that checks whether a commit is an ancestor of a branch"),
    },
    {
      title: "GitHub Docs · Events that trigger workflows",
      url: "https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows",
      kind: "docs",
      note: t("사람이 직접 입력해 실행하는 workflow_dispatch", "workflow_dispatch, which a person starts with typed inputs"),
    },
    {
      title: "Cloudflare · Workers rollbacks",
      url: "https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/",
      kind: "docs",
      note: t("Worker를 직전 version으로 되돌리는 방법", "How to return a Worker to a previous version"),
    },
    {
      title: "Render · Deploys",
      url: "https://render.com/docs/deploys",
      kind: "docs",
      note: t("자동 배포를 끄는 법과 이전 배포로 되돌리기", "Turning auto-deploy off and rolling back to an earlier deploy"),
    },
  ],
  chapterIds: ["delivery", "cost-engineering"],
  talk: {
    pitch: t(
      "프런트와 백엔드를 어떤 순서로 올리느냐가 곧 호환 정책입니다. ToonStudio는 DB 변경을 먼저, 그다음 Core API를 검증한 뒤, 마지막에 정적 웹을 올리고, 서버 변경은 옛 화면과도 함께 쓸 수 있는 추가부터 냅니다. 각 단계에는 SHA 확인이나 응답 계약 검사 같은 코드 관문이 있고, 문제가 생기면 단위마다 직전에 검증한 SHA나 버전으로 돌아갑니다. 다만 순서 자체는 사람이 따르는 절차이고, 어기면 막는 코드는 아직 찾지 못했습니다.",
      "The order in which front and back are shipped is the compatibility policy. ToonStudio ships the database change first, then verifies the Core API, and ships the static site last, and a server change starts with additions the old screens can also use. Each step has a coded gate such as a SHA check or a reply-contract check, and if something breaks each unit returns to its previously verified SHA or version. The order itself is a procedure people follow, though, and no code that blocks a wrong order has been found.",
    ),
    analogy: t(
      "공사 현장의 순서와 같습니다. 배관(DB)을 먼저 놓고, 수도(API)를 시험한 다음, 마지막에 수도꼭지(화면)를 답니다. 문제가 생기면 직전 도면대로 되돌립니다.",
      "It is the order of a building site: lay the pipes (database) first, test the water supply (API), and fit the taps (screens) last. If something goes wrong, go back to the previous plan.",
    ),
    questions: [
      {
        question: t("프런트만 바뀌어도 이 순서를 따르나요?", "Does a front-end-only change follow this order?"),
        answer: t(
          "DB와 실시간 계약을 건드리지 않는 순수 프런트 릴리스는 검증된 SHA를 정적 배포만 합니다(DEPLOY.md). 그래도 자동 배포가 아니라 수동 절차입니다.",
          "A pure front-end release that touches neither the database nor the realtime contract only deploys the verified SHA to the static site (DEPLOY.md), and even then it is a manual procedure, not an automatic deploy.",
        ),
      },
      {
        question: t("지금 운영에 어떤 SHA가 떠 있는지 어떻게 아나요?", "How do you know which SHA is live now?"),
        answer: t(
          "코드에는 운영 사이트에서 SHA를 읽는 장치가 없습니다. 릴리스 기록(승인 시각, SHA, Render deploy ID, Worker version), DB 원장의 releaseSha, 대시보드의 배포 이력으로 확인해야 하며 이번에 대시보드는 열람하지 않았습니다.",
          "The code has no mechanism for reading the SHA from the production site. It must be checked in the release record (approval time, SHA, Render deploy ID, Worker version), the ledger's releaseSha and the dashboards' deploy history; the dashboards were not opened for this card.",
        ),
      },
      {
        question: t("DB를 되돌릴 수 있나요?", "Can the database be rolled back?"),
        answer: t(
          "마이그레이션을 자동으로 되돌리는 절차는 찾지 못했습니다. 정책은 추가 전용(expand)을 먼저 내고 삭제(contract)는 별도 릴리스로 미루는 것이라, 롤백 안전은 그 호환성 검토에 달려 있습니다.",
          "No procedure that rolls a migration back automatically was found. The policy ships additions (expand) first and defers deletions (contract) to a separate release, so rollback safety depends on that compatibility review.",
        ),
      },
    ],
    pitfall: t(
      "'한 번 누르면 DB, API, 웹이 같은 SHA로 순서대로 올라간다'고 말하면 틀립니다. 세 단계는 각각 수동 절차이고, 정적 웹은 CI의 dist를 올리지 않고 운영자 환경에서 다시 빌드합니다. 이 카드는 스크립트·워크플로·문서를 읽은 것이며, 운영 대시보드의 현재 SHA와 배포 이력은 열람하지 않았고 Render가 소스 빌드인지 이미지인지도 저장소만으로는 확정하지 못했습니다.",
      "It would be wrong to say one press ships the database, API and web in order with the same SHA. The three steps are separate manual procedures, and the static site is rebuilt in the operator's environment rather than uploaded from CI's dist. This card is based on reading scripts, workflows and docs; the dashboards' current SHA and deploy history were not opened, and whether Render runs a source build or an image cannot be settled from the repository alone.",
    ),
  },
  technologies: ["Cloudflare Workers", "Render", "GitHub Actions", "Wrangler", "PostgreSQL"],
  facts: [
    {
      value: "6",
      label: t("정적 배포 스크립트의 실행 단계 수(시험이 순서를 고정)", "Steps the static deploy script runs (a test pins the order)"),
      source: "scripts/deploy-cloudflare-static.test.mjs",
    },
    {
      value: "2",
      label: t("autoDeployTrigger를 끈 Render 서비스 수", "Render services with autoDeployTrigger turned off"),
      source: "render.yaml",
    },
  ],
  reviewedAt: "2026-10-08",
};

export const PLATFORM_OPS_BUILD_RELEASE_CARDS: readonly EngineeringAtlasEntry[] = [
  HASHED_ASSETS_CACHE_CONTRACT,
  VERSION_SKEW_CHUNK_RELOAD_RECOVERY,
  RELEASE_ORDER_EXPAND_CONTRACT_ROLLBACK,
];
