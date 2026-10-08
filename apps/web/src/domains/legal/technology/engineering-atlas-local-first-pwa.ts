import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import { sampleLines, t } from "./engineering-atlas-local-first-kit";

/**
 * 기술 도감 · local-first 카드 (2) 오프라인 앱 셸: Service Worker 정책·업데이트·서버 장애 폴백·프리캐시 예산.
 * Service Worker 는 Cache API 로 앱 셸만 다룬다. 작품 데이터(OPFS·SQLite)는 건드리지 않는다.
 */

const SW = "apps/web/src/app/service-worker";
const CREATOR = "apps/web/src/domains/creator";

export const SERVICE_WORKER_APP_SHELL_POLICY: EngineeringAtlasEntry = {
  id: "service-worker-app-shell-policy",
  category: "local-first",
  name: "Service Worker",
  title: t("요청을 10종류로 나누는 오프라인 안내 데스크", "An offline help desk that sorts requests into ten classes"),
  status: "live",
  tagline: t(
    "요청의 종류를 순수 함수가 정하고, 종류가 캐시 전략과 버킷을 결정합니다. 작품 데이터는 건드리지 않습니다.",
    "A pure function sorts each request, and the class decides strategy and bucket. Artwork data is never touched.",
  ),
  background: [
    t(
      "Service Worker는 사이트와 네트워크 사이에 앉은 ‘안내 데스크’ 같은 브라우저 안의 프로그램입니다. 인터넷이 끊기거나 서버가 느릴 때도 이미 받아 둔 화면(앱 셸)을 대신 내줄 수 있습니다. 문제는 아무 요청이나 캐시하면 오래된 화면과 새 코드가 섞여 앱이 깨질 수 있다는 점입니다. ToonStudio는 ‘이 요청은 어떤 종류이고 어떻게 다룰까’를 한 장의 표로 정해 두고, 작품 데이터는 아예 건드리지 않습니다.",
      "A Service Worker is a program inside the browser that sits like a help desk between the site and the network. When the internet drops or the server is slow it can hand back a screen (the app shell) that was already downloaded. The risk is that caching everything can mix an old screen with new code and break the app. ToonStudio fixes ‘what kind of request is this and how do we treat it’ in a single table, and it never touches artwork data.",
    ),
    t(
      "요청이 오면 먼저 순수 함수가 10개 종류 중 하나로 분류합니다. 쓰기(POST 등)·Range 요청·다른 출처는 항상 그대로 통과시키고, 이름에 해시가 붙은 파일은 캐시 우선, HTML 문서는 네트워크 우선, 카탈로그 JSON은 ‘캐시를 먼저 주고 뒤에서 갱신’합니다. 캐시 바구니(버킷)는 종류별로 나뉘어 개수 상한이 있고, 25번 저장할 때마다 오래된 것부터 정리하며, 저장 공간 사용률이 85%를 넘으면 상한을 줄입니다.",
      "When a request arrives, a pure function first assigns it one of ten classes. Writes (POST and the like), Range requests and other origins always pass straight through; files with a hash in their name are served cache-first, HTML documents network-first, and catalog JSON ‘cache first, refresh in the background’. Cache buckets are split by class with entry limits, are trimmed oldest-first every 25 writes, and shrink their limits when storage use passes 85%.",
    ),
    t(
      "캐시를 무효화하는 축을 둘로 나눈 것이 핵심입니다. 앱 셸 프리캐시는 빌드 ID로 배포마다 새로 만들고, 런타임 버킷은 ‘응답 형태 계약 버전(현재 5)’으로만 바꿉니다. 그래서 배포할 때마다 아직 유효한 해시 파일 수 MB를 버리지 않습니다. 보안 헤더(CORP)가 빠진 옛 워커 스크립트가 캐시에 남아 있으면 ‘없는 것’으로 보고 지워 스스로 고칩니다. Workbox 같은 라이브러리 없이 이 정책을 직접 구현했습니다.",
      "The core idea is two separate axes of invalidation. The app-shell precache is rebuilt per deploy under a build ID, while runtime buckets change only with a ‘response-shape contract version’ (currently 5). A deploy therefore never throws away megabytes of hashed files that are still valid. If an old Worker script without the CORP security header is found in the cache it is treated as missing and deleted, so the cache heals itself. The policy is implemented directly rather than with a library such as Workbox.",
    ),
    t(
      "한계: 첫 방문의 오프라인은 보장하지 않습니다(한 번 온라인으로 열어 둬야 함). 캐시된 응답은 저장 당시 헤더 그대로 재생되므로 COOP/COEP 같은 격리 헤더도 캐시 계약의 일부입니다. 큰 WASM·ONNX 파일(코드 주석 기준 빌드 합계 약 123 MB)은 프리캐시에서는 빼지만, 런타임에서는 heavy 버킷(64개)에 캐시 우선으로 담깁니다. 푸시 알림도 같은 워커 파일이 처리합니다.",
      "Limits: offline on a first visit is not guaranteed (the app must have been opened online once). A cached response is replayed with the headers it was stored with, so isolation headers such as COOP/COEP are part of the cache contract. Large WASM and ONNX files (about 123 MB in total per a code comment) are left out of the precache but are stored cache-first in the runtime heavy bucket (64 entries). Push notifications are handled by the same Worker file.",
    ),
  ],
  keyPoints: [
    t("분류는 브라우저 없이 테스트되는 순수 함수", "Classification is a pure function, testable without a browser"),
    t("쓰기·Range·다른 출처 요청은 가로채지 않음", "Writes, Range and cross-origin requests are not intercepted"),
    t("무효화 축 둘: 프리캐시는 빌드 ID, 런타임은 계약 버전", "Two invalidation axes: build ID for precache, contract version for runtime"),
    t("해로운 캐시는 스스로 지우는 자가 치유", "Harmful cache entries delete themselves (self-healing)"),
  ],
  diagram: {
    id: "service-worker-app-shell-policy-diagram",
    kind: "graph",
    title: t("요청이 분류되고 전략에 배정되기까지", "From a request to a class, a strategy and a bucket"),
    caption: t(
      "요청마다 ‘어떤 종류인가’만 순수 함수가 정하고, 그 종류가 전략과 캐시 버킷을 정합니다.",
      "Only the request’s class is decided by a pure function, and the class decides strategy and bucket.",
    ),
    alt: t(
      "요청이 도착하면 분류 함수가 종류를 정합니다. api나 쓰기는 network-only로 통과하고, HTML 문서는 network-first로 precache에, 해시 자산과 WASM, 미디어, 표지는 cache-first로 해시 자산 버킷에, 카탈로그 JSON은 stale-while-revalidate로 data 버킷에 담깁니다. 캐시에서 읽을 때 헤더가 불완전한 워커 스크립트는 재생 대신 지우고 다시 받습니다.",
      "A request arrives and the classifier decides its class. API calls and writes go network-only; HTML documents go network-first into the precache; hashed assets, WASM, media and covers go cache-first into the hashed-asset bucket; catalog JSON goes stale-while-revalidate into the data bucket. When reading from cache, a Worker script with incomplete headers is deleted and re-downloaded instead of replayed.",
    ),
    nodes: [
      { id: "req", label: t("요청 도착", "Request arrives"), sub: t("fetch 이벤트", "fetch event"), tone: "local", shape: "pill", at: [0, 2] },
      { id: "classify", label: t("분류 함수", "Classifier"), sub: t("순수 함수", "Pure function"), tone: "local", shape: "diamond", at: [1, 2] },
      { id: "netonly", label: t("network-only", "network-only"), sub: t("api · 쓰기 · 워커 스크립트", "API, writes, worker script"), tone: "neutral", at: [2, 0] },
      { id: "netfirst", label: t("network-first", "network-first"), sub: t("HTML 문서 2종", "Two kinds of HTML"), tone: "local", at: [2, 1] },
      { id: "cachefirst", label: t("cache-first", "cache-first"), sub: t("해시 자산·WASM·미디어·표지", "Hashed assets, WASM, media, covers"), tone: "local", at: [2, 2] },
      { id: "swr", label: t("stale-while-revalidate", "stale-while-revalidate"), sub: t("카탈로그 JSON", "Catalog JSON"), tone: "local", at: [2, 3] },
      { id: "pre", label: t("precache", "precache"), sub: t("이름에 빌드 ID", "Build ID in the name"), tone: "local", shape: "cylinder", at: [3, 1] },
      { id: "assets", label: t("해시 자산 버킷", "Hashed-asset bucket"), sub: t("immutable 600 · heavy 64", "immutable 600, heavy 64"), tone: "local", shape: "cylinder", at: [3, 2] },
      { id: "data", label: t("data 버킷", "data bucket"), sub: t("최대 80개", "Up to 80 entries"), tone: "local", shape: "cylinder", at: [3, 3] },
      { id: "usable", label: t("다시 써도 되나?", "Safe to replay?"), tone: "warn", shape: "diamond", at: [4, 2] },
      { id: "miss", label: t("지우고 다시 받기", "Delete and refetch"), sub: t("CORP 없는 워커 스크립트", "Worker script without CORP"), tone: "warn", shape: "pill", at: [5, 2] },
    ],
    edges: [
      { from: "req", to: "classify" },
      { from: "classify", to: "netonly", label: t("API·쓰기", "API, writes") },
      { from: "classify", to: "netfirst", label: t("문서", "document") },
      { from: "classify", to: "cachefirst", label: t("해시 URL", "hashed URL") },
      { from: "classify", to: "swr", label: t("JSON", "JSON") },
      { from: "netfirst", to: "pre", label: t("셸 저장", "keep shell") },
      { from: "cachefirst", to: "assets", label: t("저장", "store") },
      { from: "swr", to: "data", label: t("저장", "store") },
      { from: "assets", to: "usable", label: t("읽을 때", "on read") },
      { from: "usable", to: "miss", label: t("아니오", "no"), style: "dashed" },
    ],
    groups: [{ id: "cache-storage", label: t("Cache Storage", "Cache Storage"), tone: "local", nodeIds: ["pre", "assets", "data"] }],
  },
  usage: [
    {
      feature: t("스튜디오 · 오프라인에서도 열리는 에디터", "Studio · an editor that opens offline"),
      role: t(
        "한 번 온라인으로 연 /studio가 네트워크가 끊겨도 앱 셸과 해시 번들로 부팅하도록 요청을 분류하고 캐시합니다.",
        "Classifies and caches requests so a /studio that was opened online once boots from the app shell and hashed bundles with no network.",
      ),
      paths: [`${SW}/studio-service-worker-policy.ts#classifyStudioServiceWorkerRequest`, `${SW}/studio-service-worker-entry.ts`],
      route: "/studio",
    },
    {
      feature: t("전 사이트 · 배포 직후의 안정성", "Whole site · stability right after a deploy"),
      role: t(
        "HTML은 network-first라 수정 배포가 다음 온라인 접속에 바로 닿고, 오래된 HTML과 새 청크가 섞이지 않게 합니다. 등록은 첫 화면이 그려진 뒤 load 시점에 합니다.",
        "HTML is network-first so a fixed deploy reaches users on their next online visit and old HTML never mixes with new chunks. Registration happens at load, after first paint.",
      ),
      paths: ["apps/web/vite.config.ts#studioServiceWorkerPlugin", "apps/web/src/app/main.tsx"],
    },
    {
      feature: t("AI·3D · 큰 모델 파일", "AI and 3D · large model files"),
      role: t(
        ".wasm·.onnx는 heavy 버킷(64개)에 캐시 우선으로 따로 담아, 작은 청크가 많아져도 먼저 밀려나지 않게 합니다.",
        ".wasm and .onnx files go cache-first into their own heavy bucket (64 entries) so a flood of small chunks does not evict them first.",
      ),
      paths: [`${SW}/studio-service-worker-policy.ts#STUDIO_SERVICE_WORKER_RUNTIME_LIMITS`],
    },
    {
      feature: t("품질 게이트 · 정책 단위 테스트와 실브라우저 검증", "Quality gate · policy unit tests and real-browser check"),
      role: t(
        "정책 함수와 실제 워커 모듈(인메모리 Cache API)을 단위 테스트하고, 운영 헤더로 빌드 결과를 서빙해 실브라우저에서 검증합니다.",
        "Unit-tests the policy functions and the real Worker module (in-memory Cache API), and checks the built output in a real browser served with production headers.",
      ),
      paths: [`${SW}/studio-service-worker-policy.test.ts`, `${SW}/studio-service-worker-entry.test.ts`, "scripts/verify-studio-service-worker.mts"],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("요청 분류와 전략 표", "Request classes and the strategy table"),
      language: "ts",
      ...sampleLines([
        'type RouteClass = "passthrough" | "navigation" | "immutable" | "heavy" | "catalog" | "api";',
        'type Strategy = "network-only" | "network-first" | "cache-first" | "stale-while-revalidate";',
        "",
        "export function classify(url: URL, method: string, mode: string, hasRange: boolean): RouteClass {",
        ['  if (method !== "GET" || hasRange) return "passthrough"; // 쓰기와 Range 요청은 절대 가로채지 않는다', '  if (method !== "GET" || hasRange) return "passthrough"; // never intercept writes or Range requests'],
        '  if (mode === "navigate") return "navigation";',
        '  if (url.pathname.startsWith("/assets/")) return /\\.(wasm|onnx)$/.test(url.pathname) ? "heavy" : "immutable";',
        '  if (url.pathname.startsWith("/api/")) return "api";',
        '  if (/^\\/(data|i18n|catalog)\\//.test(url.pathname)) return "catalog";',
        '  return "passthrough";',
        "}",
        "",
        ["// 종류가 곧 전략이다: 해시 URL은 URL 자체가 버전이라 캐시 우선이 안전하다.", "// The class is the strategy: a hashed URL is its own version, so cache-first is safe."],
        "export const strategy: Record<RouteClass, Strategy> = {",
        '  passthrough: "network-only", api: "network-only", navigation: "network-first",',
        '  immutable: "cache-first", heavy: "cache-first", catalog: "stale-while-revalidate",',
        "};",
      ]),
      explain: t(
        "분류가 URL·메서드·요청 모드만 보는 순수 함수라서 브라우저 없이 단위 테스트할 수 있습니다. 실제 코드는 여기에 다른 출처 거르기, 개별 예외 경로, 표지 이미지 등 10개 종류를 더 다룹니다.",
        "Because classification only looks at the URL, method and request mode, it can be unit-tested without a browser. The real code adds the cross-origin check, a few special paths and cover images, ten classes in total.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("자가 치유와 저장 공간 압박 보정", "Self-healing and storage-pressure limits"),
      language: "ts",
      source: `${SW}/studio-service-worker-policy.ts`,
      ...sampleLines([
        ["// 캐시에서 읽은 응답을 다시 써도 되는가? CORP 헤더가 없는 워커 스크립트는 miss 로 본다.", "// May a cached response be replayed? A Worker script without a CORP header counts as a miss."],
        "export function usable(cached: { status: number; url: string; corp: string | null }): boolean {",
        "  if (cached.status < 200 || cached.status >= 400) return false;",
        "  const isWorker = /assets\\/studio-[^/]+\\.worker-[\\w-]+\\.js$/.test(new URL(cached.url).pathname);",
        "  return !isWorker || Boolean(cached.corp);",
        "}",
        "",
        ["// 저장 공간이 차면 버킷 상한을 줄인다.", "// When storage fills up, shrink the bucket limit."],
        "export function pressureLimit(base: number, usage: number, quota: number): number {",
        "  const ratio = quota > 0 ? usage / quota : 0;",
        "  if (ratio >= 0.95) return Math.max(1, Math.floor(base * 0.5));",
        "  if (ratio >= 0.85) return Math.max(1, Math.floor(base * 0.75));",
        "  return base;",
        "}",
        "",
        ["// 키는 넣은 순서대로 나오므로 앞쪽 초과분을 지우면 LRU에 가깝다.", "// Keys come back in insertion order, so dropping the excess head approximates LRU."],
        "export const trimPlan = <K>(keys: readonly K[], limit: number): K[] => keys.slice(0, Math.max(0, keys.length - limit));",
      ]),
      explain: t(
        "저장 시각을 따로 기록하지 않고도 오래된 것부터 지우는 근사 방법입니다. 워커 스크립트의 CORP 검사는 상수를 올리지 않아도 오래된 잘못된 캐시를 스스로 고치게 합니다.",
        "It approximates oldest-first eviction without storing timestamps. The CORP check on Worker scripts repairs stale, broken cache entries without bumping any constant.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · Service Worker API", url: "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API", kind: "docs" },
    { title: "MDN · Using Service Workers", url: "https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers", kind: "guide" },
    { title: "MDN · Cache", url: "https://developer.mozilla.org/en-US/docs/Web/API/Cache", kind: "docs", note: t("캐시 저장·조회 API", "The cache read and write API") },
    { title: "web.dev · The service worker lifecycle", url: "https://web.dev/articles/service-worker-lifecycle", kind: "guide", note: t("install → waiting → activate", "install, waiting, activate") },
    { title: "web.dev · The Offline Cookbook", url: "https://web.dev/articles/offline-cookbook", kind: "guide", note: t("cache-first·stale-while-revalidate 같은 전략 모음", "A catalog of strategies like cache-first and stale-while-revalidate") },
    { title: "MDN · Cross-Origin-Embedder-Policy", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Cross-Origin-Embedder-Policy", kind: "docs", note: t("캐시 재생과 격리 헤더의 관계", "Why isolation headers matter for replayed responses") },
  ],
  chapterIds: ["pwa-continuity"],
  talk: {
    pitch: t(
      "Service Worker는 사이트와 네트워크 사이의 안내 데스크입니다. ToonStudio는 이 안내 데스크의 판단을 ‘요청을 10종류로 나누는 표’로 만들어 브라우저 없이도 테스트합니다. 해시가 붙은 파일은 캐시 우선, HTML은 네트워크 우선이라 새 배포가 바로 닿고, 쓰기 요청과 작품 데이터는 절대 건드리지 않습니다. 한 번 온라인으로 연 스튜디오는 오프라인에서도 열립니다.",
      "A Service Worker is a help desk between the site and the network. ToonStudio turns that desk’s judgment into a table that sorts requests into ten classes, which can be tested without a browser. Hashed files are cache-first and HTML is network-first so a new deploy arrives at once, and writes and artwork data are never touched. A studio opened online once opens offline too.",
    ),
    analogy: t(
      "도서관 사서의 규칙집입니다. 책등에 고유 번호(해시)가 붙은 책은 서가에서 바로 꺼내 주고, 신문(HTML)은 먼저 최신호가 왔는지 확인합니다. 대출·반납(쓰기)은 사서가 손대지 않고 본관 창구로 보냅니다.",
      "It is a librarian’s rulebook. A book with a unique number on its spine (the hash) is pulled straight from the shelf, a newspaper (HTML) is first checked for a newer issue, and loans and returns (writes) are not handled by the librarian but sent to the main counter.",
    ),
    questions: [
      {
        question: t("Workbox 같은 라이브러리는 안 쓰나요?", "Why not a library like Workbox?"),
        answer: t(
          "직접 구현했습니다. 라우팅 판단을 의존성 없는 순수 함수로 두어 브라우저 없이 단위 테스트할 수 있고, 격리 헤더 검증·자가 치유·원자적 프리캐시를 직접 통제합니다. 다만 라이브러리를 고르지 않은 이유를 적은 문서는 저장소에서 찾지 못했습니다.",
          "It is implemented directly. Keeping routing as dependency-free pure functions makes it unit-testable without a browser and keeps isolation-header checks, self-healing and the atomic precache under our control. I did not find a document that records why a library was not chosen.",
        ),
      },
      {
        question: t("배포하면 사용자의 캐시가 다 날아가나요?", "Does a deploy wipe the user’s cache?"),
        answer: t(
          "아니요. 런타임 버킷 이름은 계약 버전(현재 5)에만 묶여 있어 해시가 붙은 파일은 배포마다 버리지 않습니다. 빌드 ID로 바뀌는 것은 앱 셸 프리캐시뿐입니다.",
          "No. Runtime bucket names depend only on the contract version (currently 5), so hashed files survive deploys. Only the app-shell precache changes with the build ID.",
        ),
      },
      {
        question: t("작품 데이터도 캐시되나요?", "Is artwork data cached too?"),
        answer: t(
          "아닙니다. Service Worker는 Cache API로 앱 셸만 다루고, 작품은 OPFS 저널과 SQLite에 있습니다. 쓰기 요청과 /api/ 호출은 캐시하지 않으며, 표지 이미지 프록시만 따로 캐시합니다.",
          "No. The Service Worker handles only the app shell through the Cache API, while artwork lives in the OPFS journal and SQLite. Writes and /api/ calls are not cached; only the cover-image proxy has its own bucket.",
        ),
      },
      {
        question: t("큰 모델 파일은 어떻게 하나요?", "What about large model files?"),
        answer: t(
          "프리캐시에서는 빼지만 런타임에서는 heavy 버킷(64개)에 캐시 우선으로 담습니다. ‘대형 WASM 제외’는 프리캐시에만 해당하는 말입니다.",
          "They are excluded from the precache but stored cache-first in the runtime heavy bucket (64 entries). ‘Large WASM excluded’ applies to the precache only.",
        ),
      },
    ],
    pitfall: t(
      "‘대형 WASM은 캐시하지 않는다’고 말하지 마세요. 프리캐시에서만 빠지고 런타임 heavy 버킷에는 담깁니다. docs/studio-service-worker.md의 ‘critical 10 URL / 975 KiB’는 낡은 수치이고 코드의 예산은 2.25 MiB, 정적 critical URL은 23개입니다. 첫 방문 오프라인은 지원하지 않으며, Service Worker는 운영 빌드에서만 등록됩니다.",
      "Do not say ‘large WASM is not cached’: it is left out of the precache only and does land in the runtime heavy bucket. The ‘critical 10 URLs / 975 KiB’ in docs/studio-service-worker.md is stale; the code budget is 2.25 MiB with 23 static critical URLs. Offline on a first visit is unsupported, and the Service Worker registers only in production builds.",
    ),
  },
  technologies: ["Service Worker", "Cache Storage", "Navigation Preload", "Vite"],
  facts: [
    { value: "10", label: t("요청 분류 클래스 수", "Number of request classes"), source: `${SW}/studio-service-worker-policy.ts` },
    { value: "5", label: t("캐시 계약 버전(런타임 버킷 이름에 포함)", "Cache contract version (part of runtime bucket names)"), source: `${SW}/studio-service-worker-policy.ts` },
    { value: "600 · 64 · 120 · 80 · 300", label: t("런타임 버킷 상한: immutable · heavy · media · data · cover", "Runtime bucket limits: immutable, heavy, media, data, cover"), source: `${SW}/studio-service-worker-policy.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const USER_APPROVED_UPDATE_KILL_SWITCH: EngineeringAtlasEntry = {
  id: "user-approved-update-kill-switch",
  category: "local-first",
  name: "Update safety registry",
  title: t("저장이 끝나야 눌리는 업데이트 버튼", "An update button that unlocks only after saving"),
  status: "live",
  tagline: t(
    "새 버전은 뒤에서 받아 두고, 저장·동기화가 끝난 뒤 사용자가 누를 때만 바꿉니다. 4단 킬 스위치가 받칩니다.",
    "A new version waits in the background and is applied only when the user presses the button after saving. Four kill switches stand behind it.",
  ),
  background: [
    t(
      "그리는 도중에 앱이 새 버전으로 바뀌면 작업이 날아가면 안 됩니다. 일반 웹사이트는 새 버전이 나오면 바로 갈아끼우지만, 편집기에서 그렇게 하면 열려 있는 화면의 코드와 새로 받은 파일이 어긋나 ‘chunk 404’ 같은 오류가 나거나 저장되지 않은 획이 사라질 수 있습니다. ToonStudio는 새 버전을 뒤에서 받아 ‘대기’시킨 채 사용자가 누를 때만 바꾸고, 그것도 저장이 끝난 뒤에만 버튼이 눌리게 했습니다.",
      "An app must not swap versions in the middle of a drawing. Ordinary websites swap as soon as a new version exists, but in an editor the running screen’s code can then disagree with newly downloaded files, causing ‘chunk 404’ errors or losing unsaved strokes. ToonStudio downloads the new version in the background, parks it in ‘waiting’, switches only when the user presses the button, and enables that button only after saving is done.",
    ),
    t(
      "동작은 네 단계입니다. ① 새 워커가 설치되면 waiting에서 기다립니다(skipWaiting을 부르지 않음). ② 화면 하단 카드가 알립니다(닫을 수 있음). ③ 저장·동기화 모듈이 ‘지금 안전한가?’를 함수로 등록해 두고(update-safety 레지스트리), 카드는 이를 1초마다 다시 계산해 버튼을 켜고 끕니다. ④ 클릭하면 안전을 다시 확인한 뒤 워커에 메시지를 보내 교체하고 평범한 새로고침을 합니다. 평가 중 오류가 나면 ‘안전하지 않음’으로 봅니다(fail-closed).",
      "It works in four steps. ① A newly installed Worker waits in ‘waiting’ (skipWaiting is not called). ② A card at the bottom of the screen announces it and can be dismissed. ③ Save and sync modules register ‘is it safe right now?’ as functions (the update-safety registry), and the card re-evaluates them every second to enable or disable the button. ④ On click, safety is checked again, the Worker is messaged to take over, and a plain reload follows. If an evaluation throws, the answer is ‘not safe’ (fail-closed).",
    ),
    t(
      "킬 스위치(문제가 생기면 끄는 장치)는 4단입니다. ① 아무것도 안 해도: HTML이 network-first라 수정 배포가 다음 온라인 접속에 바로 닿습니다. ② URL 뒤에 ?__toonspectrumSwReset=1: 모든 워커 해제 + 이 앱의 캐시 삭제 + 한 번만 새로고침(sessionStorage로 반복 방지). ③ 개발자 도구 콘솔의 reset()과 inspect(). ④ 최후: sw.js를 스스로 해제하는 파일로 교체해 배포. 어느 경로도 OPFS·SQLite의 작품 데이터는 건드리지 않습니다.",
      "There are four kill switches. ① Do nothing: HTML is network-first, so a fixed deploy reaches the next online visit. ② Append ?__toonspectrumSwReset=1 to the URL: all Workers are unregistered, this app’s caches deleted, and the page reloads once (sessionStorage prevents loops). ③ reset() and inspect() in the DevTools console. ④ Last resort: deploy a sw.js that unregisters itself. None of these paths touches artwork data in OPFS or SQLite.",
    ),
    t(
      "일반적인 skipWaiting()+clients.claim() 즉시 전환은 단순한 사이트엔 편하지만, 지연 로딩 청크가 있는 편집기에는 위험합니다. 그래서 SW 활성화를 배포 문제가 아니라 사용자 트랜잭션의 경계로 다룹니다. 한계는 레지스트리가 같은 탭 안의 상태만 안다는 점입니다. 다른 탭의 미저장 작업은 문서 리더 락과 브라우저의 beforeunload 확인이 지킵니다.",
      "The common pattern of calling skipWaiting() and clients.claim() at once is convenient for simple sites but risky for an editor with lazily loaded chunks, so Service Worker activation is treated as a boundary of the user’s transaction rather than a deployment detail. The limit is that the registry knows only the state inside its own tab; unsaved work in other tabs is protected by the document leader lock and the browser’s beforeunload confirmation.",
    ),
  ],
  keyPoints: [
    t("새 워커는 waiting에 주차, 강제 교체 없음", "The new Worker parks in waiting; no forced swap"),
    t("저장·동기화 모듈이 ‘지금 안전한가’를 함수로 등록", "Save and sync modules register ‘is it safe now?’ as functions"),
    t("평가 오류는 ‘안전하지 않음’(fail-closed)", "An evaluation error means ‘not safe’ (fail-closed)"),
    t("킬 스위치 4단, 작품 데이터는 건드리지 않음", "Four kill switches, none touching artwork data"),
  ],
  diagram: {
    id: "user-approved-update-kill-switch-diagram",
    kind: "sequence",
    title: t("업데이트 승인 흐름", "The update approval flow"),
    caption: t(
      "새 워커는 기다리기만 하고, 저장이 끝난 것을 확인한 사용자의 클릭이 있어야 교체됩니다.",
      "The new Worker only waits; a swap happens only after the user clicks once saving is confirmed.",
    ),
    alt: t(
      "새 워커가 설치되어 waiting에 대기하면 페이지가 사용자에게 업데이트 카드를 보여 줍니다. 페이지는 안전 레지스트리를 1초마다 확인해 미저장·저장 중·동기화 대기 상태면 버튼을 비활성화합니다. 사용자가 클릭하면 안전을 다시 확인하고 새 워커에게 적용 메시지를 보내며, 새 워커가 skipWaiting을 한 뒤 페이지가 평범하게 새로고침합니다.",
      "A new Worker installs and waits; the page shows the user an update card. The page checks the safety registry every second and disables the button while work is unsaved, saving or waiting on sync. When the user clicks, safety is checked again, an apply message goes to the new Worker, which calls skipWaiting, and the page does a plain reload.",
    ),
    actors: [
      { id: "worker", label: t("새 워커", "New Worker"), sub: t("waiting에 주차", "Parked in waiting"), tone: "edge" },
      { id: "page", label: t("업데이트 카드", "Update card"), sub: t("페이지 안", "In the page"), tone: "local" },
      { id: "safety", label: t("안전 레지스트리", "Safety registry"), sub: t("저장·동기화가 등록", "Sources register"), tone: "warn" },
      { id: "user", label: t("사용자", "User"), tone: "neutral" },
    ],
    messages: [
      { from: "worker", to: "page", label: t("설치 완료, waiting", "Installed, waiting"), style: "dashed", note: t("skipWaiting을 부르지 않음", "skipWaiting is not called") },
      { from: "page", to: "user", label: t("새 버전 카드 표시", "Show the new-version card"), note: t("닫을 수 있음, 강제 아님", "Dismissible, not forced") },
      { from: "page", to: "safety", label: t("지금 안전한가? (1초마다)", "Safe now? (every second)") },
      { from: "safety", to: "page", label: t("미저장·저장 중이면 불가", "Not safe while unsaved"), style: "dashed", note: t("버튼 비활성, 이유 표시", "Button disabled with a reason") },
      { from: "user", to: "page", label: t("‘지금 업데이트’ 클릭", "Click ‘Update now’"), note: t("사용자 제스처", "A user gesture") },
      { from: "page", to: "safety", label: t("클릭 직전 안전 재확인", "Re-check safety on click"), note: t("평가 오류는 불안전", "An error counts as unsafe") },
      { from: "page", to: "worker", label: t("apply-update 메시지", "apply-update message"), note: t("5초 안에 응답 대기", "Waits up to 5 seconds") },
      { from: "worker", to: "worker", label: t("skipWaiting()", "skipWaiting()") },
      { from: "page", to: "page", label: t("평범한 location.reload()", "A plain location.reload()"), note: t("beforeunload 가드가 마지막 방어", "beforeunload is the last guard") },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 새 버전 알림 카드", "Studio · new-version card"),
      role: t(
        "Shadow DOM 카드로 새 버전을 알리고, 안전 상태에 따라 버튼을 켜고 끄며, 30분 주기와 탭 복귀·포커스·온라인 복귀 때 업데이트를 확인합니다.",
        "Announces the new version in a Shadow DOM card, enables or disables its button by safety state, and checks for updates every 30 minutes and on tab return, focus and coming back online.",
      ),
      paths: [`${SW}/studio-service-worker-registration.ts#applyStudioServiceWorkerUpdate`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 편집기 저장 상태 등록", "Studio · editor registers its save state"),
      role: t(
        "편집기는 미저장 작업, 저장 영수증 대기, 공동 편집 동기화 대기, 다른 창 작업공간 변경 확인 중인 상태를 안전 소스로 등록합니다.",
        "The editor registers unsaved work, a save receipt in flight, pending co-editing sync and a pending workspace change from another window as safety sources.",
      ),
      paths: [`${CREATOR}/studio-update-safety.ts`, `${CREATOR}/use-studio-editor-update-safety.ts`, `${CREATOR}/StudioCuttoonEditorHost.tsx`],
      route: "/studio",
    },
    {
      feature: t("게시 지휘소 · 게시 작업 보호", "Publishing command center · protecting a publish run"),
      role: t(
        "게시 지휘소도 같은 레지스트리에 소스를 등록해, 미저장·저장 중·복구 처리 중이면 업데이트 버튼이 잠깁니다.",
        "The publishing command center registers a source with the same registry, so the update button stays locked while work is unsaved, being saved or being recovered.",
      ),
      paths: [`${CREATOR}/StudioPublishingCommandCenter.tsx`],
    },
    {
      feature: t("현장 복구 · 킬 스위치", "Field recovery · kill switches"),
      role: t(
        "URL 스위치, 개발자 도구 reset()/inspect(), 워커 쪽 kill 메시지로 나쁜 워커를 해제하고 이 앱의 캐시만 지웁니다.",
        "A URL switch, DevTools reset()/inspect() and a Worker-side kill message remove a bad Worker and delete only this app’s caches.",
      ),
      paths: [`${SW}/studio-service-worker-registration.ts#resetStudioServiceWorker`, `${SW}/studio-service-worker-entry.ts`, "docs/studio-service-worker.md"],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("안전 소스 레지스트리와 승인형 적용", "A safety-source registry and approved apply"),
      language: "ts",
      ...sampleLines([
        "type Source = () => { safe: boolean; message?: string };",
        "const sources = new Map<string, Source>();",
        "",
        "export function registerSource(id: string, source: Source): () => void {",
        ["  sources.set(id, source); // 저장·동기화 모듈이 ‘지금 안전한가?’를 스스로 선언한다", "  sources.set(id, source); // each save or sync module declares ‘is it safe now?’ itself"],
        "  return () => void sources.delete(id);",
        "}",
        "",
        "export function canApplyUpdate(): { safe: boolean; message: string } {",
        "  for (const read of sources.values()) {",
        "    try {",
        "      const state = read();",
        ['      if (!state.safe) return { safe: false, message: state.message ?? "저장이 끝난 뒤 업데이트하세요" };', '      if (!state.safe) return { safe: false, message: state.message ?? "Update after saving finishes" };'],
        "    } catch {",
        ['      return { safe: false, message: "작업 상태를 확인하지 못했습니다" }; // 오류는 불안전(fail-closed)', '      return { safe: false, message: "Could not check work state" }; // an error is unsafe (fail-closed)'],
        "    }",
        "  }",
        '  return { safe: true, message: "" };',
        "}",
        "",
        "export function applyUpdate(waiting: ServiceWorker): void {",
        '  if (!canApplyUpdate().safe) throw new Error("update blocked");',
        '  waiting.postMessage({ type: "apply-update" }); // 워커가 skipWaiting() 을 부른다',
        ["  location.reload(); // 사용자 제스처에서 나온 평범한 reload → beforeunload 가드도 그대로 동작", "  location.reload(); // a plain reload from a user gesture, so the beforeunload guard still works"],
        "}",
      ]),
      explain: t(
        "React 상태의 복사본을 믿지 않고, 호출하는 순간마다 모든 소스를 직접 평가합니다. 하나라도 불안전하거나 평가 중 예외가 나면 적용하지 않고, 적용은 사용자 클릭에서만 일어납니다.",
        "It never trusts a copy of React state: every source is evaluated at the moment of the call. If any is unsafe or throws, nothing is applied, and applying happens only from a user click.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("URL 킬 스위치: 한 번만 리로드", "URL kill switch: reload only once"),
      language: "ts",
      source: `${SW}/studio-service-worker-registration.ts`,
      ...sampleLines([
        'const RESET_QUERY = "__toonspectrumSwReset";',
        'const GUARD_KEY = "toonspectrum:sw-reset:v1";',
        "",
        "export async function resetWorkers(): Promise<void> {",
        "  const registrations = await navigator.serviceWorker.getRegistrations();",
        "  await Promise.all(registrations.map((entry) => entry.unregister()));",
        ["  // 이 앱이 소유한 캐시만 지운다 — 작품 데이터는 Cache API에 없다.", "  // Delete only caches this app owns; artwork data is not in the Cache API."],
        "  const keys = await caches.keys();",
        '  await Promise.all(keys.filter((key) => key.startsWith("toonstudio-")).map((key) => caches.delete(key)));',
        "}",
        "",
        "export function consumeResetRequest(): boolean {",
        "  const url = new URL(location.href);",
        '  if (url.searchParams.get(RESET_QUERY) !== "1") return false;',
        "  url.searchParams.delete(RESET_QUERY);",
        ["  if (sessionStorage.getItem(GUARD_KEY) === \"done\") return true; // 이미 한 번 했다 → 루프 방지", "  if (sessionStorage.getItem(GUARD_KEY) === \"done\") return true; // already done once: no reload loop"],
        '  sessionStorage.setItem(GUARD_KEY, "done");',
        "  void resetWorkers().finally(() => location.replace(url.toString()));",
        "  return true;",
        "}",
      ]),
      explain: t(
        "주소 뒤에 ?__toonspectrumSwReset=1만 붙이면 워커 해제와 캐시 삭제 뒤 쿼리를 지운 주소로 한 번만 이동합니다. sessionStorage 표식이 있어 재설정이 안 먹혀도 무한 새로고침에 빠지지 않습니다.",
        "Adding ?__toonspectrumSwReset=1 unregisters the Workers, deletes the caches and moves once to the address without the query. A sessionStorage marker keeps a reset that does not stick from becoming an endless reload loop.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "web.dev · The service worker lifecycle", url: "https://web.dev/articles/service-worker-lifecycle", kind: "guide", note: t("waiting 과 skipWaiting 의 의미", "What waiting and skipWaiting mean") },
    { title: "MDN · ServiceWorkerGlobalScope.skipWaiting()", url: "https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/skipWaiting", kind: "docs" },
    { title: "MDN · ServiceWorkerRegistration.update()", url: "https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerRegistration/update", kind: "docs" },
    { title: "MDN · Clients.claim()", url: "https://developer.mozilla.org/en-US/docs/Web/API/Clients/claim", kind: "docs" },
    { title: "MDN · beforeunload event", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event", kind: "docs", note: t("마지막 방어선이 되는 이탈 확인", "The leave confirmation that is the last guard") },
  ],
  chapterIds: ["pwa-continuity", "browser-local-compute"],
  talk: {
    pitch: t(
      "새 버전을 몰래 갈아끼우면 그리던 작업이 위험합니다. 그래서 ToonStudio는 새 버전을 뒤에서 받아 두고, 저장과 동기화가 끝났다고 각 모듈이 말해야만 ‘지금 업데이트’ 버튼이 눌리게 했습니다. 클릭하면 평범한 새로고침이라 브라우저의 이탈 확인이 마지막 방어선으로 남습니다. 문제가 생기면 주소 뒤에 reset 쿼리를 붙이는 킬 스위치가 있고, 이 경로는 작품 데이터를 건드리지 않습니다.",
      "Quietly swapping in a new version would endanger work in progress. So ToonStudio downloads the new version in the background and enables the ‘Update now’ button only when every module says saving and syncing are done. The click is a plain reload, so the browser’s leave confirmation remains the last guard. If something goes wrong, a reset query on the URL acts as a kill switch, and that path never touches artwork data.",
    ),
    analogy: t(
      "공연 중인 무대의 장치 교체입니다. 새 장치는 무대 옆에 준비해 두고, 막이 내려서 모든 배우가 안전하다고 신호할 때만 교체합니다. 문제가 생기면 비상 스위치로 새 장치를 치워도 배우의 소품(작품)은 그대로입니다.",
      "Think of swapping stage equipment mid-show. The new gear waits in the wings and is swapped in only when the curtain is down and every actor signals that it is safe. If something goes wrong, an emergency switch removes the new gear without touching the actors’ props (the artwork).",
    ),
    questions: [
      {
        question: t("사용자가 계속 안 누르면요?", "What if the user never presses it?"),
        answer: t(
          "강제하지 않습니다. ‘나중에’로 닫을 수 있고, 새 워커는 아무것도 제어하지 않고 아무 캐시도 지우지 않으므로 실행 중인 빌드는 이미 가진 청크로 계속 동작합니다.",
          "Nothing is forced. The card can be dismissed, and the waiting Worker controls nothing and deletes no cache, so the running build keeps working with the chunks it already has.",
        ),
      },
      {
        question: t("다른 탭에 저장 안 된 작업이 있으면요?", "What about unsaved work in another tab?"),
        answer: t(
          "레지스트리는 같은 탭 안의 상태만 압니다. 다른 탭의 작업은 문서 리더 락과 브라우저의 beforeunload 이탈 확인이 지킵니다.",
          "The registry only knows its own tab. Work in other tabs is protected by the document leader lock and the browser’s beforeunload confirmation.",
        ),
      },
      {
        question: t("킬 스위치를 쓰면 작품이 지워지나요?", "Does a kill switch delete artwork?"),
        answer: t(
          "아닙니다. 킬 스위치는 워커 등록 해제와 이 앱이 소유한 Cache API 항목 삭제만 합니다. 작품은 OPFS와 SQLite에 있어 영향이 없습니다.",
          "No. A kill switch only unregisters Workers and deletes cache entries this app owns. Artwork lives in OPFS and SQLite and is unaffected.",
        ),
      },
    ],
    pitfall: t(
      "‘controllerchange에서 한 번 새로고침하는 가드가 있다’는 서술은 코드와 다릅니다. controllerchange는 상태 표시만 바꾸고, 새로고침은 사용자 승인 경로에서만 일어납니다. docs/studio-service-worker.md의 ‘에디터 상태에 별도 결합이 없다’는 문장도 낡았습니다. 지금은 update-safety 레지스트리가 결합돼 있습니다. 업데이트·킬 스위치의 실브라우저 검증(pnpm verify:studio-service-worker)은 야간·수동 워크플로에서 돕니다.",
      "A description that says ‘a guard reloads once on controllerchange’ does not match the code: controllerchange only updates the status, and the reload happens only on the user-approved path. The sentence ‘no coupling to editor state’ in docs/studio-service-worker.md is also stale, since the update-safety registry now couples them. The real-browser check of updates and kill switches (pnpm verify:studio-service-worker) runs in the nightly and manual workflow.",
    ),
  },
  technologies: ["Service Worker", "Cache Storage", "Web Locks"],
  facts: [
    { value: "30분 · 1초", label: t("업데이트 확인 주기 · 안전 상태 재평가 주기", "Update check interval · safety re-evaluation interval"), source: `${SW}/studio-service-worker-registration.ts` },
    { value: "5,000 ms", label: t("워커에게 적용 메시지를 보낸 뒤 기다리는 시간", "Wait after sending the apply message to the Worker"), source: `${SW}/studio-service-worker-registration.ts` },
    { value: "4", label: t("안전하지 않음 사유 종류(미저장·저장 중·동기화 대기·복합)", "Kinds of unsafe reasons (unsaved, saving, sync pending, multiple)"), source: `${CREATOR}/studio-update-safety.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const SERVER_DOWN_FALLBACK_DEADLINE: EngineeringAtlasEntry = {
  id: "server-down-fallback-deadline",
  category: "local-first",
  name: "Offline shell fallback",
  title: t("서버가 죽어도 열리는 화면", "A screen that opens even when the server is down"),
  status: "live",
  tagline: t(
    "응답을 4초까지만 기다리고, 실패하면 3단 폴백으로 같은 스튜디오 화면을 대신 엽니다.",
    "It waits at most 4 seconds, then a three-step fallback opens the same studio screen instead.",
  ),
  background: [
    t(
      "서버가 죽었거나 인터넷이 느릴 때 ‘하얀 화면’이 뜨면 작업자는 아무것도 할 수 없습니다. ToonStudio는 /studio를 열 때 네트워크 응답을 4초까지만 기다리고, 그 안에 정상 응답이 없으면 이미 기기에 준비해 둔 같은 스튜디오 화면을 대신 보여 줍니다. 그것조차 없으면 마지막 수단으로 아주 작은 ‘긴급 복구 드로잉’ 앱을 엽니다.",
      "If the server is down or the network is slow and a blank white screen appears, an artist can do nothing. When /studio is opened, ToonStudio waits at most four seconds for the network and, without a good answer in time, shows the same studio screen already prepared on the device. If even that is missing, a tiny ‘emergency drawing’ app opens as the last resort.",
    ),
    t(
      "순서는 3단 폴백입니다. ① 오프라인 팩 전체 검증을 통과한 ‘준비된 셸’ ② 팩 검증이 덜 끝났어도 같은 Studio 셸(다른 편집기로 보내지 않음) ③ 둘 다 없을 때만 긴급 복구 드로잉. 폴백으로 바꾸는 경우는 네트워크 예외, 4초 초과, 408과 5xx뿐이고 401·403·404·429는 진짜 서버 응답이므로 숨기지 않습니다. 셸은 COOP/COEP 격리 헤더까지 맞는 응답만 인정해, 격리가 꺼진 화면을 내주지 않습니다.",
      "The order is a three-step fallback. ① The ‘prepared shell’ that passed full offline-pack verification. ② The same Studio shell even if pack verification is incomplete (the artist is not redirected to a different editor). ③ Only if neither exists, the emergency drawing app. It switches only on a network error, a timeout beyond four seconds, 408 or 5xx; 401, 403, 404 and 429 are real server answers and are not hidden. A shell counts only if its COOP/COEP isolation headers are right, so a non-isolated page is never served.",
    ),
    t(
      "‘연결 없음’만이 아니라 ‘연결은 있는데 서버가 느리거나 죽은’ 상태(lie-fi)가 더 흔해서, navigator.onLine 같은 신호 대신 시간 제한(데드라인)으로 판단합니다. 긴급 복구 드로잉은 메인 앱과 파일·저장소(IndexedDB)를 따로 둔 독립 앱이라 메인 번들이 깨져도 열립니다. 폴백 응답에는 Server-Timing 표식(cached-shell)을 덧붙이는데, 이는 진단용일 뿐 ‘저장됐다’는 뜻이 아닙니다.",
      "Not only ‘no connection’ but ‘connected yet the server is slow or down’ (lie-fi) is common, so the decision uses a deadline rather than signals like navigator.onLine. The emergency drawing app keeps its files and storage (IndexedDB) separate from the main app, so it can open even if the main bundle is broken. Fallback responses carry a Server-Timing marker (cached-shell) that is diagnostic only and does not mean anything was saved.",
    ),
    t(
      "한계: 오프라인이라고 모든 것이 되는 것은 아닙니다. 첫 방문 오프라인은 지원하지 않고, 협업·AI·게시는 서버가 필요합니다. 긴급 복구 드로잉의 작품은 메인 원고와 형식이 달라 PNG나 원고 파일로 내보내 이어 작업해야 합니다. 긴급 앱은 두 종류(/offline-drawing: 서비스 워커가 최후 폴백으로 제공, /offline-draw/: 오프라인 안내 페이지의 버튼이 여는 독립 앱)이므로 구분해서 말해야 합니다.",
      "Limits: offline does not mean everything works. A first visit offline is unsupported, and co-editing, AI and publishing need the server. Work in the emergency drawing app has a different format from a main manuscript, so it must be exported as PNG or a manuscript file to continue. There are two emergency apps (/offline-drawing, served by the Service Worker as the last fallback, and /offline-draw/, a standalone app opened from the offline notice page), so keep them distinct when speaking.",
    ),
  ],
  keyPoints: [
    t("4초 데드라인 안에 정상 응답이 없을 때만 폴백", "Fall back only when no good answer arrives within 4 seconds"),
    t("3단: 준비된 셸 → 같은 Studio 셸 → 긴급 복구 드로잉", "Three steps: prepared shell, same Studio shell, emergency drawing"),
    t("401·403·404·429는 진짜 응답이라 숨기지 않음", "401, 403, 404 and 429 are real answers and stay visible"),
  ],
  diagram: {
    id: "server-down-fallback-deadline-diagram",
    kind: "graph",
    title: t("4초 데드라인과 3단 폴백", "The 4-second deadline and three fallback steps"),
    caption: t(
      "서버가 못 답하면 같은 스튜디오 셸을 먼저 열고, 그것도 없을 때만 긴급 복구 드로잉으로 내려갑니다.",
      "When the server cannot answer, the same studio shell opens first, and only if that is missing does the emergency drawing app take over.",
    ),
    alt: t(
      "Studio 문서 요청이 4초 데드라인을 가진 네트워크 응답을 기다립니다. 정상이거나 401·404 같은 진짜 서버 응답이면 그대로 전달합니다. 네트워크 예외나 408·5xx면 준비된 셸, 같은 Studio 셸, 긴급 복구 드로잉 순서로 폴백하고 화면이 열립니다.",
      "A Studio document request waits for the network under a four-second deadline. A good response or a real server answer such as 401 or 404 is passed through. On a network error, 408 or 5xx it falls back in order to the prepared shell, the same Studio shell and the emergency drawing app, and the screen opens.",
    ),
    nodes: [
      { id: "start", label: t("Studio 문서 요청", "Studio document request"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "deadline", label: t("4초 데드라인", "4-second deadline"), sub: t("프리로드 또는 fetch", "Preload or fetch"), tone: "local", at: [1, 1] },
      { id: "status", label: t("응답은?", "Response?"), tone: "warn", shape: "diamond", at: [2, 1] },
      { id: "pass", label: t("응답 그대로", "Pass it through"), sub: t("서버의 진짜 답은 숨기지 않음", "Real server answers stay visible"), tone: "good", at: [3, 0] },
      { id: "tier1", label: t("① 준비된 셸", "① Prepared shell"), sub: t("오프라인 팩 전체 검증 통과", "Full offline pack verified"), tone: "local", at: [3, 1] },
      { id: "tier2", label: t("② 같은 Studio 셸", "② Same Studio shell"), sub: t("팩 검증이 덜 끝나도 사용", "Used even if the audit is partial"), tone: "local", at: [3, 2] },
      { id: "tier3", label: t("③ 긴급 복구 드로잉", "③ Emergency drawing"), sub: t("셸이 전혀 없을 때만", "Only if no shell survives"), tone: "warn", at: [3, 3] },
      { id: "open", label: t("화면 열림", "Screen opens"), tone: "good", shape: "pill", at: [4, 2] },
    ],
    edges: [
      { from: "start", to: "deadline" },
      { from: "deadline", to: "status" },
      { from: "status", to: "pass", label: t("정상·401/404", "OK, 401/404") },
      { from: "status", to: "tier1", label: t("실패", "fail"), style: "dashed" },
      { from: "tier1", to: "tier2", label: t("없으면", "if none"), style: "dashed" },
      { from: "tier2", to: "tier3", label: t("없으면", "if none"), style: "dashed" },
      { from: "tier1", to: "open" },
      { from: "tier2", to: "open" },
      { from: "tier3", to: "open" },
    ],
  },
  usage: [
    {
      feature: t("스튜디오 · 서버 장애 시 같은 화면 열기", "Studio · opening the same screen during an outage"),
      role: t(
        "408·5xx이거나 4초 안에 응답이 없으면 준비된 셸을 대신 열고, Server-Timing 표식(cached-shell)으로 진단 표시를 남깁니다.",
        "On 408, 5xx or no answer in four seconds it opens the prepared shell instead and leaves a Server-Timing marker (cached-shell) for diagnostics.",
      ),
      paths: [`${SW}/studio-service-worker-navigation.ts#resolveStudioNavigation`, `${SW}/studio-service-worker-entry.ts#handleNavigation`],
      route: "/studio",
    },
    {
      feature: t("긴급 복구 드로잉 (/offline-drawing)", "Emergency drawing (/offline-drawing)"),
      role: t(
        "서비스 워커 설치 때 파일 4개(합계 30,472 B)를 형식·크기 검사 후 한꺼번에 캐시해 두었다가, 셸이 없을 때 최후 폴백으로 엽니다.",
        "At Service Worker install, four files (30,472 B in total) are validated for type and size and cached together, then opened as the last fallback when no shell exists.",
      ),
      paths: [`${SW}/studio-local-drawing-rescue.ts`, "apps/web/public/offline-drawing.html", "apps/web/public/offline-drawing/app.js"],
      route: "/offline-drawing",
    },
    {
      feature: t("독립 긴급 앱 (/offline-draw/)", "Standalone emergency app (/offline-draw/)"),
      role: t(
        "자체 서비스 워커와 IndexedDB를 가진 독립 드로잉 앱으로, 오프라인 안내 페이지의 버튼으로 엽니다.",
        "A standalone drawing app with its own Service Worker and IndexedDB, opened by a button on the offline notice page.",
      ),
      paths: ["apps/web/public/offline-draw/index.html", "apps/web/public/offline-draw/storage.js", "apps/web/src/shared/pwa/PwaOfflinePage.tsx", `${SW}/emergency-drawing.ts`],
      route: "/offline-draw/",
    },
    {
      feature: t("품질 게이트 · 오프라인 복원력 검증", "Quality gate · offline resilience checks"),
      role: t(
        "순수 헬퍼 테스트는 코어 회귀 샤드에서 돌고, 실브라우저 시나리오(오프라인 리로드·503·IDB 포크)는 수동 릴리스 게이트입니다.",
        "Pure-helper tests run in the core regression shard, while the real-browser scenarios (offline reload, 503, IDB fork) are a manual release gate.",
      ),
      paths: ["scripts/studio-offline-resilience.test.mjs", "scripts/verify-local-first-browser.mjs", "docs/studio-offline-resilience-2026-09-13.md"],
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("데드라인 + 408/5xx만 폴백", "A deadline, falling back only on 408 and 5xx"),
      language: "ts",
      ...sampleLines([
        "export async function navigate(request: Request, readShell: () => Promise<Response | undefined>): Promise<Response> {",
        "  const controller = new AbortController();",
        ["  const timer = setTimeout(() => controller.abort(), 4000); // 4초 데드라인", "  const timer = setTimeout(() => controller.abort(), 4000); // a 4-second deadline"],
        "  try {",
        "    const response = await fetch(request, { signal: controller.signal });",
        ["    // 408/5xx만 캐시 셸로 대체한다. 401/403/404는 진짜 서버 응답이므로 숨기지 않는다.", "    // Only 408/5xx are replaced by the cached shell; 401/403/404 are real answers and stay visible."],
        "    if (response.status === 408 || response.status >= 500) return (await readShell()) ?? response;",
        "    return response;",
        "  } catch (cause) {",
        ["    const shell = await readShell(); // 네트워크 예외·타임아웃", "    const shell = await readShell(); // a network error or the timeout"],
        "    if (shell) return shell;",
        "    throw cause;",
        "  } finally {",
        "    clearTimeout(timer);",
        "  }",
        "}",
      ]),
      explain: t(
        "fetch는 서버가 500을 줘도 예외를 던지지 않으므로 상태 코드를 직접 봐야 합니다. 폴백이 있으면 쓰고, 없으면 원래 응답이나 예외를 그대로 돌려줘 오류를 가리지 않습니다.",
        "fetch does not throw when a server answers 500, so the status code has to be checked. A fallback is used when present; otherwise the original response or error is returned unchanged so failures are not masked.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("3단 폴백 고르기", "Choosing among the three fallback steps"),
      language: "ts",
      source: `${SW}/studio-service-worker-navigation.ts`,
      ...sampleLines([
        "type Reader = () => Promise<Response | undefined>;",
        "",
        ["// 격리 문서(Studio)의 셸은 COOP/COEP 헤더가 맞아야 쓸 수 있다.", "// A Studio (isolated) shell is usable only with the right COOP/COEP headers."],
        "function usableShell(response: Response, isolated: boolean): boolean {",
        '  if (response.status !== 200 || response.redirected) return false;',
        '  if (!response.headers.get("content-type")?.includes("text/html")) return false;',
        '  return !isolated || (response.headers.get("cross-origin-opener-policy") === "same-origin"',
        '    && ["credentialless", "require-corp"].includes(response.headers.get("cross-origin-embedder-policy") ?? ""));',
        "}",
        "",
        "export async function pickFallback(prepared: Reader, shell: Reader, rescue: Reader): Promise<Response | undefined> {",
        "  const first = await prepared().catch(() => undefined);",
        ["  if (first && usableShell(first, true)) return first; // ① 팩 검증을 통과한 셸", "  if (first && usableShell(first, true)) return first; // ① the verified shell"],
        "  const second = await shell().catch(() => undefined);",
        ["  if (second && usableShell(second, true)) return second; // ② 같은 Studio 셸", "  if (second && usableShell(second, true)) return second; // ② the same Studio shell"],
        "  const third = await rescue().catch(() => undefined);",
        ["  return third && usableShell(third, false) ? third : undefined; // ③ 최후: 긴급 복구 드로잉", "  return third && usableShell(third, false) ? third : undefined; // ③ last resort: the emergency drawing app"],
        "}",
      ]),
      explain: t(
        "각 단계는 저장소 접근이 거부되어도 예외 대신 ‘없음’으로 처리합니다. 폴백이 없을 때 원래 HTTP 응답을 캐시 예외로 바꾸지 않기 위해서입니다.",
        "Each step treats a denied storage read as ‘nothing’ instead of an exception, so a real HTTP response is never replaced by a cache error when no fallback exists.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · NavigationPreloadManager", url: "https://developer.mozilla.org/en-US/docs/Web/API/NavigationPreloadManager", kind: "docs", note: t("서비스 워커 부팅과 네트워크 요청을 병렬로", "Runs the network request in parallel with Worker startup") },
    { title: "MDN · AbortController", url: "https://developer.mozilla.org/en-US/docs/Web/API/AbortController", kind: "docs", note: t("데드라인에 쓰는 취소 신호", "The cancel signal behind the deadline") },
    { title: "MDN · Server-Timing", url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Server-Timing", kind: "docs" },
    { title: "MDN · Navigator.onLine", url: "https://developer.mozilla.org/en-US/docs/Web/API/Navigator/onLine", kind: "docs", note: t("온라인 신호의 한계 설명", "Explains why the online signal is not enough") },
    { title: "MDN · Offline and background operation", url: "https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Offline_and_background_operation", kind: "guide" },
  ],
  chapterIds: ["pwa-continuity"],
  talk: {
    pitch: t(
      "서버가 느리거나 죽었을 때 하얀 화면 대신 작업이 이어지도록, 스튜디오를 열 때 응답을 4초까지만 기다립니다. 시간이 넘거나 서버가 5xx를 주면 기기에 준비해 둔 같은 스튜디오 화면을 열고, 그것도 없으면 아주 작은 긴급 복구 드로잉을 엽니다. 단 404나 권한 오류 같은 진짜 서버 응답은 숨기지 않습니다. 오프라인에서 되는 것은 미리 준비된 범위, 즉 그리기까지입니다.",
      "So that work continues instead of a blank screen when the server is slow or down, opening the studio waits at most four seconds. After that, or on a 5xx, the same studio screen prepared on the device opens, and failing that a tiny emergency drawing app. Real server answers such as 404 or permission errors are never hidden. What works offline is only the prepared scope: drawing.",
    ),
    analogy: t(
      "택시를 4분만 기다려 보고 안 오면 미리 알아 둔 지하철로 갈아타는 것과 같습니다. 지하철도 끊기면 마지막으로 걸어서라도 갈 수 있는 비상 지도를 꺼냅니다.",
      "It is like waiting four minutes for a taxi and, if none comes, taking the subway you had checked beforehand. If even the subway is down, you pull out an emergency map for walking.",
    ),
    questions: [
      {
        question: t("왜 navigator.onLine을 안 쓰나요?", "Why not use navigator.onLine?"),
        answer: t(
          "‘연결은 됐는데 서버가 죽은’ 상태는 onLine이 true라 감지하지 못합니다. 그래서 시간 제한과 응답 상태 코드로 판단합니다.",
          "A device that is connected while the server is dead still reports onLine as true, so it cannot detect that case. The decision uses a time limit and the response status instead.",
        ),
      },
      {
        question: t("폴백 화면에서 저장한 작업은 어디로 가나요?", "Where does work saved on the fallback screen go?"),
        answer: t(
          "같은 Studio 셸이 열린 경우에는 평소처럼 기기 안 OPFS 저널과 SQLite에 기록됩니다. 긴급 복구 드로잉은 별도 형식·별도 저장소(IndexedDB)라 메인 원고와 자동으로 합쳐지지 않으며 PNG나 원고 파일로 내보내 이어서 작업합니다.",
          "When the same Studio shell opens, work is recorded in the on-device OPFS journal and SQLite as usual. The emergency drawing app uses its own format and storage (IndexedDB), is never merged with the main manuscript automatically, and is continued by exporting a PNG or manuscript file.",
        ),
      },
      {
        question: t("서버가 정말 복구되면 자동으로 돌아오나요?", "Does it return automatically when the server recovers?"),
        answer: t(
          "다음 내비게이션에서 다시 네트워크를 먼저 시도하는 network-first 구조라 서버가 살아 있으면 정상 화면으로 돌아옵니다. 정상 응답이 오면 쿼리 없는 정규 셸만 새 셸로 갱신합니다.",
          "Navigation is network-first, so the next navigation tries the network again and returns to the normal screen once the server is alive. On a good response only the query-free canonical shell is refreshed.",
        ),
      },
    ],
    pitfall: t(
      "‘오프라인이면 다 된다’고 말하지 마세요. 첫 방문 오프라인은 불가하고 협업·AI·게시는 서버가 필요합니다. 긴급 앱이 두 종류(/offline-drawing, /offline-draw/)라는 점을 섞지 마세요. 실브라우저 시나리오(scripts/verify-local-first-browser.mjs)는 package.json과 CI에 연결돼 있지 않은 수동 릴리스 게이트이며, 이 문서를 쓴 시점에 실행한 결과는 확인하지 못했습니다.",
      "Do not say ‘everything works offline’: a first visit offline is impossible and co-editing, AI and publishing need the server. Do not mix up the two emergency apps (/offline-drawing and /offline-draw/). The real-browser scenarios (scripts/verify-local-first-browser.mjs) are a manual release gate that is not wired into package.json or CI, and I could not confirm a run result.",
    ),
  },
  technologies: ["Service Worker", "Cache Storage", "Navigation Preload", "AbortController", "IndexedDB"],
  facts: [
    { value: "4,000 ms", label: t("내비게이션 응답 데드라인", "Navigation response deadline"), source: `${SW}/studio-service-worker-navigation.ts` },
    { value: "30,472 B", label: t("긴급 복구 드로잉(/offline-drawing) 파일 4개 합계", "Total of the four /offline-drawing files"), source: "apps/web/public/offline-drawing.html" },
    { value: "96 KiB", label: t("긴급 복구 드로잉 파일 하나당 검증 상한", "Per-file validation limit for the emergency drawing files"), source: `${SW}/studio-local-drawing-rescue.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const PRECACHE_BUDGET_OFFLINE_CORE: EngineeringAtlasEntry = {
  id: "precache-budget-offline-core",
  category: "local-first",
  name: "Precache budget",
  title: t("예산을 넘으면 빌드가 멈추는 오프라인 코어", "An offline core that stops the build when over budget"),
  status: "live",
  tagline: t(
    "미리 받을 양은 숫자로 고정해 넘으면 빌드 실패, 코어 팩은 한가할 때 스스로 준비합니다.",
    "The amount to pre-download is fixed in numbers and fails the build when exceeded; the core pack prepares itself when idle.",
  ),
  background: [
    t(
      "‘앱을 통째로 미리 내려받아 두자’는 단순해 보이지만 위험합니다. 이 앱의 빌드 폴더(dist/assets)는 코드 주석 기준 약 240 MB라서, 구경하러 온 방문자에게 몇 MB를 조용히 실어 보내면 첫 방문이 느려집니다. ToonStudio는 반대로 ‘첫 방문자에게 미리 내려받게 할 양’에 예산 숫자를 정하고, 넘으면 배포가 아니라 빌드가 실패하게 만들었습니다.",
      "‘Just pre-download the whole app’ looks simple but is risky. This app’s build folder (dist/assets) is about 240 MB according to a code comment, so quietly shipping megabytes to a visitor who only came to browse slows the first visit. ToonStudio does the opposite: it sets budget numbers for how much a first-time visitor pre-downloads, and going over fails the build, not the deployment.",
    ),
    t(
      "동작은 두 갈래입니다. 빌드 시점: 앱 시작 파일의 정적 import 묶음과 고정 파일 23개를 critical(2.25 MiB 이하), 번역 사전 52개를 warm(512 KiB 이하)으로 계획하고, 스튜디오 전용 ‘오프라인 드로잉 팩’은 1,024개·32 MiB 이하여야 합니다. 하나라도 넘으면 빌드가 실패합니다. 사용 시점: 스튜디오를 한 번 연 뒤 브라우저가 한가할 때 조건(온라인·보이는 탭·데이터 절약 꺼짐·저장 공간 90% 미만)이 맞으면 팩을 하나씩 내려받고, 다 쓴 뒤 전체를 다시 읽어 확인합니다.",
      "It works on two fronts. At build time: the static import closure of the app entry plus 23 fixed files form the critical tier (at most 2.25 MiB) and 52 translation dictionaries the warm tier (at most 512 KiB), while the studio-only ‘offline drawing pack’ must stay within 1,024 files and 32 MiB. Exceeding any limit fails the build. At run time: once the studio has been opened, when the browser is idle and conditions hold (online, visible tab, data saver off, storage under 90%), the pack is downloaded one file at a time and then the whole set is read back to verify it.",
    ),
    t(
      "업계 관행은 ‘앱 셸만 프리캐시하고 나머지는 쓰면서 캐시’입니다. 이 경계를 문서가 아니라 숫자로 못 박아 두면 여러 커밋에 걸친 조용한 증가가 빌드에서 드러납니다. 실제로 코드 주석에는 2026-10-01 측정에서 시작 파일 묶음이 기존 2 MiB 한도를 0.11% 넘어(2,099,509 B) 한도를 2.25 MiB로 조정한 기록이 있습니다. 빌드 ID도 시계가 아니라 내용 해시라서, 달라진 것이 없으면 같은 워커를 다시 설치하지 않습니다.",
      "The common practice is to precache only the app shell and cache the rest as it is used. Pinning that boundary in numbers rather than prose makes a quiet increase over many commits show up in the build. A code comment records that a 2026-10-01 measurement put the entry closure 0.11% over the old 2 MiB limit (2,099,509 B), and the limit was set to 2.25 MiB. The build ID is also a content hash, not a clock, so nothing is reinstalled when nothing changed.",
    ),
    t(
      "한계: 첫 방문 오프라인은 지원하지 않고, 모든 브러시·폰트·3D 모델이 오프라인으로 준비되는 것은 아닙니다. ‘팩 준비 완료’는 앱 코드가 기기에 있다는 뜻이지 ‘작품이 저장됐다’는 뜻이 아닙니다. 그리고 이 팩은 브라우저 저장소 안에 있으므로, 사이트 데이터를 지우면 함께 사라지고 다시 준비해야 합니다.",
      "Limits: offline on a first visit is unsupported, and not every brush, font or 3D model is prepared for offline use. ‘Pack ready’ means the app code is on the device, not that any artwork has been saved. The pack lives in browser storage, so clearing site data removes it and it must be prepared again.",
    ),
  ],
  keyPoints: [
    t("critical ≤ 2.25 MiB, warm ≤ 512 KiB, 팩 ≤ 32 MiB", "critical ≤ 2.25 MiB, warm ≤ 512 KiB, pack ≤ 32 MiB"),
    t("한도를 넘으면 배포가 아니라 빌드가 실패", "Going over fails the build, not the deployment"),
    t("준비 조건 판단은 순수 함수, 완료는 전체 재읽기로 확인", "Readiness is a pure function; completion is verified by re-reading everything"),
  ],
  diagram: {
    id: "precache-budget-offline-core-diagram",
    kind: "graph",
    title: t("빌드의 예산 게이트와 기기에서의 자동 준비", "The build budget gate and automatic preparation on the device"),
    caption: t(
      "예산은 빌드에서 고정하고, 기기에서는 조건이 맞을 때만 한가한 시간에 코어 팩을 준비합니다.",
      "The budget is pinned at build time, and on the device the core pack is prepared only when conditions allow, during idle time.",
    ),
    alt: t(
      "Vite 빌드 결과에서 계획 단계가 critical, warm, 오프라인 팩을 고르고 예산 게이트가 검사합니다. 초과하면 빌드가 실패하고, 통과하면 sw.js가 내용 해시 빌드 ID와 함께 만들어집니다. 사용자 기기에서는 설치 때 critical을 원자적으로 받고, 한가할 때 조건을 판단해 팩을 준비하거나 건너뜁니다.",
      "From the Vite build output a planning step selects the critical, warm and offline-pack lists and a budget gate checks them. Over budget fails the build; otherwise sw.js is produced with a content-hash build ID. On the user’s device the critical set is fetched atomically at install, and when idle the conditions are judged to either prepare the pack or skip.",
    ),
    nodes: [
      { id: "build", label: t("Vite 빌드", "Vite build"), sub: t("manifest.json", "manifest.json"), tone: "neutral", shape: "pill", at: [0, 0] },
      { id: "plan", label: t("계획 함수", "Planning function"), sub: t("critical·warm·팩 선택", "Pick critical, warm, pack"), tone: "neutral", at: [1, 0] },
      { id: "gate", label: t("예산 안인가?", "Within budget?"), tone: "warn", shape: "diamond", at: [2, 0] },
      { id: "sw", label: t("sw.js 생성", "Emit sw.js"), sub: t("빌드 ID = 내용 해시", "Build ID = content hash"), tone: "neutral", at: [3, 0] },
      { id: "fail", label: t("빌드 실패", "Build fails"), tone: "warn", shape: "pill", at: [2, 1] },
      { id: "install", label: t("설치 때 critical", "critical at install"), sub: t("addAll, 원자적", "addAll, all-or-nothing"), tone: "local", at: [3, 2] },
      { id: "decide", label: t("지금 받아도 되나?", "Download now?"), tone: "local", shape: "diamond", at: [4, 2] },
      { id: "prepare", label: t("코어 팩 준비", "Prepare core pack"), sub: t("순차 다운로드 · 전체 재읽기", "Sequential, then full re-read"), tone: "local", at: [5, 2] },
      { id: "skip", label: t("건너뜀", "Skip"), sub: t("오프라인·숨김·절약·90%", "Offline, hidden, saver, 90%"), tone: "neutral", shape: "pill", at: [4, 3] },
    ],
    edges: [
      { from: "build", to: "plan" },
      { from: "plan", to: "gate" },
      { from: "gate", to: "sw", label: t("통과", "pass") },
      { from: "gate", to: "fail", label: t("초과", "over"), style: "dashed" },
      { from: "sw", to: "install", label: t("배포 후", "after deploy") },
      { from: "install", to: "decide" },
      { from: "decide", to: "prepare", label: t("유휴·조건 충족", "idle, OK") },
      { from: "decide", to: "skip", label: t("조건 미달", "not met"), style: "dashed" },
    ],
    groups: [
      { id: "build-time", label: t("빌드 시점", "Build time"), tone: "neutral", nodeIds: ["build", "plan", "gate", "sw"] },
      { id: "device", label: t("사용자 기기", "User's device"), tone: "local", nodeIds: ["install", "decide", "prepare", "skip"] },
    ],
  },
  usage: [
    {
      feature: t("빌드 · 서비스 워커 생성 플러그인", "Build · the Service Worker plugin"),
      role: t(
        "Vite 매니페스트에서 critical·warm·오프라인 팩을 계획하고, 예산을 넘으면 오류로 빌드를 중단하며, 내용 해시 빌드 ID를 넣어 sw.js를 만듭니다.",
        "Plans critical, warm and offline-pack lists from the Vite manifest, aborts the build with an error when over budget, and emits sw.js with a content-hash build ID.",
      ),
      paths: [`${SW}/studio-service-worker-precache-plan.ts#planStudioServiceWorkerPrecache`, "apps/web/vite.config.ts#studioServiceWorkerPlugin"],
    },
    {
      feature: t("스튜디오 · 오프라인 드로잉 팩", "Studio · the offline drawing pack"),
      role: t(
        "라우터·인스펙터·자동저장·SQLite Worker/WASM 등 그리기에 필요한 15개 뿌리 모듈의 묶음을 팩으로 정하고, 런타임 정리에서 밀려나지 않게 프리캐시에 고정합니다.",
        "Defines the pack from fifteen root modules (router, inspector, autosave, SQLite Worker and WASM and more) needed for drawing, and pins it in the precache so runtime trimming cannot evict it.",
      ),
      paths: [`${SW}/studio-service-worker-drawing-plan.ts`, `${SW}/studio-service-worker-offline.ts#prepareStudioOfflineResources`],
      route: "/studio",
    },
    {
      feature: t("스튜디오 · 자동 준비와 오프라인 패널", "Studio · automatic preparation and the offline panel"),
      role: t(
        "모든 /studio 경로에서 조건을 순수 함수로 판단해 준비하거나 건너뛰고, 패널에서 상태·진단·수동 재시도를 보여 줍니다.",
        "On every /studio path a pure function decides to prepare or skip, and the panel shows status, diagnostics and a manual retry.",
      ),
      paths: [`${CREATOR}/offline/studio-offline-automation.ts#decideStudioOfflineAutomaticPreparation`, `${CREATOR}/offline/StudioOfflineRuntime.tsx`, `${CREATOR}/offline/StudioOfflinePanel.tsx`],
      route: "/studio",
    },
  ],
  samples: [
    {
      kind: "teaching",
      title: t("예산 게이트: 넘으면 빌드를 멈춘다", "A budget gate: stop the build when over"),
      language: "ts",
      ...sampleLines([
        ["const BUDGET = { criticalBytes: 9 * 256 * 1024, warmBytes: 512 * 1024 } as const; // 2.25 MiB · 512 KiB", "const BUDGET = { criticalBytes: 9 * 256 * 1024, warmBytes: 512 * 1024 } as const; // 2.25 MiB and 512 KiB"],
        "",
        "export function checkBudget(critical: number, warm: number): string[] {",
        "  const violations: string[] = [];",
        '  if (critical > BUDGET.criticalBytes) violations.push("critical " + critical + " > " + BUDGET.criticalBytes);',
        '  if (warm > BUDGET.warmBytes) violations.push("warm " + warm + " > " + BUDGET.warmBytes);',
        "  return violations;",
        "}",
        "",
        ["// 빌드 단계: 위반이 하나라도 있으면 배포가 아니라 빌드가 멈춘다.", "// Build step: any violation stops the build, not the deployment."],
        "export function assertBudget(critical: number, warm: number): void {",
        "  const violations = checkBudget(critical, warm);",
        '  if (violations.length > 0) throw new Error("precache plan rejected: " + violations.join(", "));',
        "}",
      ]),
      explain: t(
        "예산을 ‘문서의 권고’가 아니라 실패하는 코드로 두면, 여러 커밋에 걸쳐 조금씩 늘어난 크기도 빌드에서 바로 드러납니다. 실제 코드는 위반 목록을 모아 한 번에 오류로 던집니다.",
        "Making the budget failing code rather than advice in a document exposes size creeping up over many commits right in the build. The real code collects the violations and throws them as one error.",
      ),
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("자동 준비 결정: 순수 함수", "Automatic preparation decision: a pure function"),
      language: "ts",
      source: `${CREATOR}/offline/studio-offline-automation.ts`,
      ...sampleLines([
        "type Decision =",
        '  | "prepare" | "skip:unsupported" | "skip:uncontrolled" | "skip:already-ready"',
        '  | "skip:offline" | "skip:document-hidden" | "skip:data-saver" | "skip:storage-pressure";',
        "interface Input {",
        "  supported: boolean; controlled: boolean; ready: boolean | null; online: boolean;",
        "  visible: boolean; saveData: boolean; usage: number | null; quota: number | null;",
        "}",
        "",
        "export function decide(input: Input): Decision {",
        '  if (!input.supported) return "skip:unsupported";',
        '  if (!input.controlled) return "skip:uncontrolled";',
        '  if (input.ready === true) return "skip:already-ready";',
        '  if (!input.online) return "skip:offline";',
        '  if (!input.visible) return "skip:document-hidden";',
        ['  if (input.saveData) return "skip:data-saver"; // 사용자가 데이터 절약을 켰다', '  if (input.saveData) return "skip:data-saver"; // the user turned data saver on'],
        '  const ratio = input.usage !== null && input.quota ? input.usage / input.quota : null;',
        '  if (ratio !== null && ratio >= 0.9) return "skip:storage-pressure";',
        ['  return "prepare"; // 한가한 때에만 한정된 코어 팩을 내려받는다', '  return "prepare"; // only when idle, and only a bounded core pack'],
        "}",
      ]),
      explain: t(
        "브라우저 API를 직접 부르지 않고 입력 값만 보는 함수라서 모든 경우를 단위 테스트로 확인할 수 있습니다. 건너뛴 이유는 사용자에게 패널에서 설명됩니다.",
        "Because the function reads only its input and calls no browser API, every case can be unit-tested. The reason for skipping is explained to the user in the panel.",
      ),
      verify: "types",
    },
  ],
  links: [
    { title: "MDN · Window.requestIdleCallback()", url: "https://developer.mozilla.org/en-US/docs/Web/API/Window/requestIdleCallback", kind: "docs", note: t("한가한 시간에 작업을 시작하는 방법", "How to start work during idle time") },
    { title: "MDN · NetworkInformation.saveData", url: "https://developer.mozilla.org/en-US/docs/Web/API/NetworkInformation/saveData", kind: "docs" },
    { title: "Vite · Backend Integration (build.manifest)", url: "https://vite.dev/guide/backend-integration", kind: "docs", note: t("빌드 매니페스트로 파일 목록을 얻는 방법", "How the build manifest yields file lists") },
    { title: "MDN · Cache.addAll()", url: "https://developer.mozilla.org/en-US/docs/Web/API/Cache/addAll", kind: "docs", note: t("하나라도 실패하면 전체 실패(원자적)", "Fails as a whole if any request fails") },
    { title: "Chrome · workbox-precaching", url: "https://developer.chrome.com/docs/workbox/modules/workbox-precaching", kind: "guide", note: t("프리캐시 개념 비교용", "For comparison with the precache concept") },
  ],
  chapterIds: ["pwa-continuity", "performance"],
  talk: {
    pitch: t(
      "오프라인을 위해 앱을 통째로 미리 받게 하면 구경하러 온 사람의 첫 방문이 무거워집니다. 그래서 미리 받을 양에 숫자 예산을 두었고, 넘으면 배포가 아니라 빌드가 실패합니다. 스튜디오를 한 번 열면 브라우저가 한가할 때 그리기에 필요한 코어 팩이 스스로 준비되고, 다 받은 뒤에는 전체를 다시 읽어 빠진 것이 없는지 확인합니다. 데이터 절약 모드나 저장 공간이 90% 이상이면 자동 다운로드를 멈춥니다.",
      "Making everyone pre-download the whole app for offline use would weigh down a casual visitor’s first visit. So the amount to pre-download has numeric budgets, and exceeding them fails the build, not the deployment. After the studio is opened once, the browser prepares the core pack needed for drawing when idle and, once downloaded, reads everything back to confirm nothing is missing. Data saver mode, or storage at 90% or more, stops the automatic download.",
    ),
    analogy: t(
      "이삿짐에 무게 한도를 정해 두는 것과 같습니다. 한도를 넘으면 트럭이 출발하지 못하고, 도착한 짐은 한가한 시간에 한 상자씩 풀어 빠진 게 없는지 목록과 대조합니다.",
      "Like setting a weight limit for moving boxes: over the limit the truck does not leave, and once it arrives the boxes are unpacked one at a time during quiet hours and checked against the list.",
    ),
    questions: [
      {
        question: t("왜 스튜디오 전체를 프리캐시하지 않나요?", "Why not precache the entire studio?"),
        answer: t(
          "코드 주석에는 스튜디오 라우트 묶음이 약 5.4 MB, 청크 194개이고 스튜디오로 이동할 때 브라우저가 어차피 전부 받는다고 적혀 있어, 미리 받으면 중복입니다. 대신 cache-first가 그것을 런타임 버킷에 담아 한 번 열면 오프라인에서도 열립니다. 이 수치는 이번 검토에서 다시 재지 않았습니다.",
          "A code comment says the studio route closure is about 5.4 MB in 194 chunks and the browser downloads all of it anyway when navigating to the studio, so pre-downloading would duplicate it. Instead cache-first stores it in a runtime bucket, so one visit is enough for offline use. I did not re-measure these figures in this review.",
        ),
      },
      {
        question: t("‘준비 완료’ 표시가 거짓일 수 있지 않나요?", "Could the ‘ready’ flag be false?"),
        answer: t(
          "쓰기가 끝난 뒤 전체 목록을 다시 읽어 빠진 것이 있으면 완료로 보고하지 않습니다. 저장 공간 부족으로 일부가 밀려나도 ‘완료’가 되지 않도록 한 설계입니다.",
          "After writing, the whole list is read again, and anything missing means it is not reported as complete. Even if low storage evicts part of the pack, it will not be reported as ‘complete’.",
        ),
      },
      {
        question: t("데이터 요금이 걱정되는 사용자는요?", "What about users worried about data costs?"),
        answer: t(
          "데이터 절약(saveData)이 켜져 있거나, 탭이 숨겨져 있거나, 저장 공간이 90% 이상이면 자동 다운로드를 건너뜁니다. 수동 재시도 버튼은 복구용이고 정상 사용의 선행 절차가 아닙니다.",
          "Automatic download is skipped when data saver is on, the tab is hidden, or storage is at 90% or more. The manual retry button is for recovery, not a required step of normal use.",
        ),
      },
    ],
    pitfall: t(
      "수치는 코드가 기준입니다: critical 예산 2.25 MiB, 정적 critical URL 23개(docs/studio-service-worker.md의 ‘10 URL / 975 KiB’는 낡음). ‘스튜디오 라우트 5.4 MB / 194 청크’와 ‘dist/assets 약 240 MB’는 코드 주석에서 가져온 값이며 이번 검토에서 재측정하지 못했습니다. 큰 WASM은 프리캐시에서 빠질 뿐 런타임 heavy 버킷에는 담깁니다. 자동 준비를 건너뛰는 사유는 코드 기준 7가지입니다.",
      "Numbers follow the code: a critical budget of 2.25 MiB and 23 static critical URLs (the ‘10 URLs / 975 KiB’ in docs/studio-service-worker.md is stale). ‘Studio route 5.4 MB / 194 chunks’ and ‘dist/assets about 240 MB’ come from code comments and were not re-measured in this review. Large WASM leaves the precache but does land in the runtime heavy bucket. By the code there are seven reasons for skipping automatic preparation.",
    ),
  },
  technologies: ["Service Worker", "Cache Storage", "Vite", "WASM"],
  facts: [
    { value: "2.25 MiB · 512 KiB", label: t("critical · warm 프리캐시 예산(초과 시 빌드 실패)", "critical and warm precache budgets (build fails when exceeded)"), source: `${SW}/studio-service-worker-precache-plan.ts` },
    { value: "23", label: t("정적 critical URL 수", "Number of static critical URLs"), source: `${SW}/studio-service-worker-precache-plan.ts` },
    { value: "1,024개 · 32 MiB", label: t("오프라인 드로잉 팩 상한(초과 시 빌드 실패)", "Offline drawing pack limit (build fails when exceeded)"), source: "apps/web/vite.config.ts" },
    { value: "90%", label: t("저장 공간 사용률이 이 값 이상이면 자동 준비를 건너뜀", "Automatic preparation is skipped at or above this storage use"), source: `${CREATOR}/offline/studio-offline-automation.ts` },
  ],
  reviewedAt: "2026-10-07",
};

export const ENGINEERING_ATLAS_LOCAL_FIRST_PWA: readonly EngineeringAtlasEntry[] = [
  SERVICE_WORKER_APP_SHELL_POLICY,
  USER_APPROVED_UPDATE_KILL_SWITCH,
  SERVER_DOWN_FALLBACK_DEADLINE,
  PRECACHE_BUDGET_OFFLINE_CORE,
];
