import type { EngineeringAtlasEntry } from "./engineering-atlas-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 도감 · platform-ops 카테고리 — 백엔드 구조·인증 카드(NestJS 역할 런타임·세션/CSRF).
 * 사실은 2026-10-07 기준 코드·테스트로 확인했다. 비밀 값·키 값은 열람하지 않았고 환경변수는 이름만 적었다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

const NESTJS_ROLE_FROZEN_RUNTIME: EngineeringAtlasEntry = {
  id: "nestjs-role-frozen-runtime",
  category: "platform-ops",
  name: "One NestJS core, frozen by role",
  title: t("하나의 NestJS 코어를 역할(role)로 얼려 쓰는 서버", "One NestJS core, frozen into roles"),
  status: "live",
  tagline: t(
    "같은 NestJS 코드를 역할별로 열어 둘 길만 달리해 띄우고, 요청 파이프라인 순서를 테스트로 고정합니다.",
    "One NestJS codebase runs with a different set of open paths per role, and the pipeline order is pinned by a test.",
  ),
  background: [
    t(
      "서버를 용도마다 따로 만들면 코드도 따로 늘어납니다. ToonStudio는 NestJS(웹 서버 프레임워크) 코어 하나를 두고, 환경변수 API_RUNTIME_ROLE로 어떤 길을 열지만 바꿔 같은 빌드를 여러 모양으로 띄웁니다. 역할은 셋입니다. full은 모든 API, studio-live는 상태 확인과 Socket.IO만, capability-worker는 상태 확인과 고정 게이트웨이만 엽니다. 한 건물에 출입문이 여러 개 있어도 층마다 열어 둘 문을 정해 두는 것과 같습니다.",
      "Building a separate server per purpose multiplies code too. ToonStudio keeps one NestJS (a web-server framework) core and changes only which paths are open through the API_RUNTIME_ROLE environment variable, so one build runs in several shapes. There are three roles: full opens every API, studio-live opens only health checks and Socket.IO, and capability-worker opens only health and a fixed gateway. It is like a building with many doors where each floor decides which doors stay open.",
    ),
    t(
      "역할 밖의 길은 404 JSON('Route is not available on this runtime role')으로 닫힙니다. 이 가드가 필요한 이유는 코드 주석에 있습니다. 장기 실행 Socket.IO 호스트가 같은 모듈 그래프를 재사용하므로, 일반 HTTP API가 두 번째 오리진에 우연히 공개되지 않게 막아야 합니다. capability-worker는 아예 별도의 작은 모듈 그래프(CapabilityWorkerAppModule)로 뜨고, JSON을 읽기 전에 토큰과 선언된 바이트 크기부터 검사합니다.",
      "A path outside the role is closed with a 404 JSON ('Route is not available on this runtime role'). The reason for the guard is in a code comment: a long-running Socket.IO host reuses the same module graph, so the general HTTP API must not be exposed on a second origin by accident. capability-worker starts from a separate, smaller module graph (CapabilityWorkerAppModule) and checks the token and the declared byte size before reading any JSON.",
    ),
    t(
      "요청이 지나는 순서가 곧 정책입니다. main.ts는 ① 보안 헤더 ② 엣지 원점 인증 ③ CORS ④ 역할 가드 ⑤ 세션 검증 ⑥ CSRF ⑦ 본문 파서(JSON 16 MB) 순서로 미들웨어를 등록하고, 그 뒤에 전역 prefix(/api)와 Zod 검증 파이프를 붙입니다. 앞 단계가 거절하면 뒤 단계는 실행되지 않고, CSRF는 세션 단계가 정한 인증 출처(헤더/쿠키)를 읽기 때문에 순서를 바꾸면 우회가 생깁니다. runtime-boundary 테스트가 main.ts 안의 호출 위치를 비교해 순서가 뒤바뀌면 실패합니다.",
      "The order a request passes through is the policy. main.ts registers middleware as (1) security headers, (2) edge origin authentication, (3) CORS, (4) role guard, (5) session verification, (6) CSRF, (7) body parser (JSON, 16 MB), then adds the global /api prefix and the Zod validation pipe. If an earlier step rejects, later ones never run, and CSRF reads the authentication source (header or cookie) set by the session step, so swapping the order would open a bypass. The runtime-boundary test compares call positions inside main.ts and fails if the order flips.",
    ),
    t(
      "로그에는 허용 목록 방식을 씁니다. 요청은 메서드와 정규화한 경로만, 응답은 상태 코드만 남기고 헤더·IP·쿼리는 기록하지 않으며 pino redact를 함께 둡니다. 환경 검증은 Zod 스키마 위반을 경고만 하고 부팅을 막지 않지만, 운영의 인증 비밀(32바이트 이상)이 약하면 예외적으로 부팅을 막습니다. 한계: studio-live는 full과 같은 AppModule 그래프를 읽으므로 가드는 열린 표면을 줄일 뿐 부팅 비용까지 줄이지는 않습니다.",
      "Logging uses an allow list. A request logs only its method and normalized path and a response only its status code, with no headers, IPs or queries, and pino redact is added on top. Environment validation only warns on Zod schema violations and does not block boot, but weak production auth secrets (under 32 bytes) are the exception that stops it. A limit: studio-live loads the same AppModule graph as full, so the guard narrows the open surface without cutting boot cost.",
    ),
  ],
  keyPoints: [
    t("같은 빌드, 역할 3종: full · studio-live · capability-worker", "One build, three roles: full, studio-live, capability-worker"),
    t("역할 밖의 길은 404, 일반 API가 두 번째 오리진에 새지 않음", "Paths outside a role return 404; the general API cannot leak"),
    t("헤더→원점 인증→CORS→역할→세션→CSRF→본문 순서를 테스트로 고정", "Headers, origin auth, CORS, role, session, CSRF, body: pinned by a test"),
    t("로그는 허용 목록: 메서드·경로·상태 코드만", "Logs are an allow list: method, path and status code only"),
  ],
  diagram: {
    id: "nestjs-role-frozen-runtime-diagram",
    kind: "graph",
    title: t("요청이 컨트롤러에 닿기까지의 관문", "The gates before a request reaches a controller"),
    caption: t(
      "순서가 곧 정책이라서, 앞 관문이 거절하면 뒤 관문은 아예 실행되지 않습니다.",
      "The order is the policy: when an earlier gate rejects, later gates never run.",
    ),
    alt: t(
      "요청은 보안 헤더, 엣지 원점 인증, CORS, 역할 가드를 차례로 지난 뒤 아래 줄에서 세션 검증, CSRF, 본문 파서, Zod 검증을 거쳐 컨트롤러에 도착합니다. CSRF는 세션 검증이 정한 인증 출처를 읽기 때문에 세션 뒤에 있어야 하며, 이 순서는 테스트가 고정합니다.",
      "A request passes security headers, edge origin authentication, CORS and the role guard along the top row, then session verification, CSRF, the body parser and Zod validation along the bottom row before reaching a controller. CSRF reads the authentication source decided by the session step, so it must follow it, and a test pins this order.",
    ),
    nodes: [
      { id: "req", label: t("요청", "Request"), tone: "neutral", shape: "pill", at: [0, 0] },
      { id: "headers", label: t("보안 헤더", "Security headers"), sub: t("① 가장 먼저", "1: first"), tone: "server", at: [1, 0] },
      { id: "origin", label: t("원점 인증", "Origin auth"), sub: t("② Cloudflare 비밀", "2: edge secret"), tone: "edge", at: [2, 0] },
      { id: "cors", label: t("CORS", "CORS"), sub: t("③ 허용 Origin", "3: allowed origins"), tone: "server", at: [3, 0] },
      { id: "role", label: t("역할 가드", "Role guard"), sub: t("④ role 밖은 404", "4: 404 outside role"), tone: "warn", at: [4, 0] },
      { id: "session", label: t("세션 검증", "Session check"), sub: t("⑤ 서명 토큰 → 사용자", "5: signed token to user"), tone: "server", at: [4, 1] },
      { id: "csrf", label: t("CSRF", "CSRF"), sub: t("⑥ ⑤의 출처를 읽음", "6: reads 5's source"), tone: "server", at: [3, 1] },
      { id: "body", label: t("본문 파서", "Body parser"), sub: t("⑦ JSON 16 MB 상한", "7: JSON up to 16 MB"), tone: "server", at: [2, 1] },
      { id: "zod", label: t("Zod 검증", "Zod pipe"), sub: t("DTO만 검사", "Checks DTOs only"), tone: "server", at: [1, 1] },
      { id: "controller", label: t("컨트롤러", "Controller"), sub: t("기능 모듈", "Feature modules"), tone: "good", shape: "pill", at: [0, 1] },
    ],
    edges: [
      { from: "req", to: "headers" },
      { from: "headers", to: "origin" },
      { from: "origin", to: "cors" },
      { from: "cors", to: "role" },
      { from: "role", to: "session" },
      { from: "session", to: "csrf" },
      { from: "csrf", to: "body" },
      { from: "body", to: "zod" },
      { from: "zod", to: "controller" },
    ],
  },
  usage: [
    {
      feature: t("모든 API 호출의 공통 관문 (full 역할)", "The common gate for every API call (full role)"),
      role: t(
        "로그인·저장·커뮤니티·마켓·결제 요청은 모두 이 일곱 단계와 Zod 검증을 지나 기능 모듈 컨트롤러에 닿습니다.",
        "Sign-in, saving, community, market and payment requests all pass these seven steps and Zod validation before reaching a feature-module controller.",
      ),
      paths: [
        "apps/api/src/main.ts",
        "apps/api/src/app.module.ts",
        "apps/api/src/runtime/runtime-boundary.test.ts",
      ],
    },
    {
      feature: t("선택형 Socket.IO 서비스 (studio-live 역할)", "Optional Socket.IO service (studio-live role)"),
      role: t(
        "같은 빌드를 role=studio-live로 띄워 /api/health/live·ready와 /socket.io만 열고, 나머지는 404로 닫습니다.",
        "The same build runs with role studio-live, opening only /api/health/live and ready plus /socket.io and closing the rest with 404.",
      ),
      paths: ["apps/api/src/config/runtime-role.ts#isApiRuntimeRolePathAllowed", "render.yaml"],
    },
    {
      feature: t("작업 분배 워커 (capability-worker 역할, 기본 비활성)", "Work-distribution worker (capability-worker role, off by default)"),
      role: t(
        "별도 모듈 그래프에 상태 확인과 고정 게이트웨이만 열고, 본문을 읽기 전에 토큰과 선언 바이트를 검사합니다.",
        "Only health and a fixed gateway are opened on a separate module graph, and the token and declared bytes are checked before the body is read.",
      ),
      paths: [
        "apps/api/src/capability-worker-app.module.ts",
        "apps/api/src/config/api-body-parser-boundary.ts",
      ],
    },
    {
      feature: t("로그 속 쿠키·토큰 유입 차단", "Keeping cookies and tokens out of logs"),
      role: t(
        "요청과 응답을 허용 목록 직렬화기로 줄이고 pino redact를 겹쳐, 헤더에 실린 자격증명이 로그에 남지 않게 합니다.",
        "Requests and responses are cut down by allow-list serializers with pino redaction layered on, so credentials in headers do not reach the logs.",
      ),
      paths: [
        "apps/api/src/logging/http-log-serializers.ts",
        "apps/api/src/runtime/api-http-infrastructure.module.ts",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("역할별로 열어 둘 길을 정하는 가드", "A guard that decides which paths each role opens"),
      language: "ts",
      code: [
        'type Role = "full" | "studio-live" | "capability-worker";',
        'const STUDIO_LIVE_HTTP = new Set(["/api/health/live", "/api/health/ready"]);',
        "",
        "// full 은 전부, 나머지는 좁은 허용 목록만 연다(실제 코드는 워커의 게이트웨이 경로도 허용한다)",
        "export function isPathAllowed(role: Role, pathname: string, method: string): boolean {",
        '  if (role === "full") return true;',
        '  const read = method === "GET" || method === "HEAD";',
        '  if (role === "capability-worker") return pathname === "/api/health/live" && read;',
        "  if (STUDIO_LIVE_HTTP.has(pathname)) return read;",
        '  return pathname === "/socket.io" || pathname.startsWith("/socket.io/");',
        "}",
        "",
        "export function guard(role: Role, request: { path: string; method: string }): Response | undefined {",
        "  if (isPathAllowed(role, request.path, request.method)) return undefined; // 통과",
        '  return new Response(JSON.stringify({ message: "Route is not available on this runtime role" }), { status: 404 });',
        "}",
      ].join("\n"),
      codeEn: [
        'type Role = "full" | "studio-live" | "capability-worker";',
        'const STUDIO_LIVE_HTTP = new Set(["/api/health/live", "/api/health/ready"]);',
        "",
        "// full opens everything, the others a narrow allow list (the real code also allows the worker's gateway path)",
        "export function isPathAllowed(role: Role, pathname: string, method: string): boolean {",
        '  if (role === "full") return true;',
        '  const read = method === "GET" || method === "HEAD";',
        '  if (role === "capability-worker") return pathname === "/api/health/live" && read;',
        "  if (STUDIO_LIVE_HTTP.has(pathname)) return read;",
        '  return pathname === "/socket.io" || pathname.startsWith("/socket.io/");',
        "}",
        "",
        "export function guard(role: Role, request: { path: string; method: string }): Response | undefined {",
        "  if (isPathAllowed(role, request.path, request.method)) return undefined; // pass",
        '  return new Response(JSON.stringify({ message: "Route is not available on this runtime role" }), { status: 404 });',
        "}",
      ].join("\n"),
      explain: t(
        "허용 목록 방식이라 새 경로가 생겨도 기본은 닫혀 있습니다. 실제 코드는 Socket.IO 메서드를 GET·POST·OPTIONS로 제한하고 워커 게이트웨이 경로를 더합니다.",
        "Because it is an allow list, a new path starts closed by default. The real code limits Socket.IO methods to GET, POST and OPTIONS and adds the worker's gateway paths.",
      ),
      source: "apps/api/src/config/runtime-role.ts",
      verify: "types",
    },
    {
      kind: "teaching",
      title: t("거절하면 즉시 멈추는 직렬 파이프라인", "A serial pipeline that stops at the first rejection"),
      language: "ts",
      code: [
        "type Ctx = { path: string; method: string; headers: Record<string, string | undefined> };",
        "type Step = (ctx: Ctx) => Response | undefined;",
        "",
        "const reject = (status: number) => new Response(null, { status });",
        "",
        "/** 앞 단계가 거절하면 뒤 단계는 실행되지 않는다 */",
        "export const pipeline = (steps: readonly Step[]) => (ctx: Ctx): Response | undefined => {",
        "  for (const step of steps) {",
        "    const rejected = step(ctx);",
        "    if (rejected) return rejected;",
        "  }",
        "  return undefined;",
        "};",
        "",
        'const roleGuard: Step = (c) => (c.path.startsWith("/api/health/") ? undefined : reject(404));',
        'const csrf: Step = (c) => (c.method !== "GET" && c.headers["x-toonstudio-csrf"] !== "1" ? reject(403) : undefined);',
        "",
        "export const handle = pipeline([roleGuard, csrf]); // 순서가 곧 보안 정책이다",
      ].join("\n"),
      codeEn: [
        "type Ctx = { path: string; method: string; headers: Record<string, string | undefined> };",
        "type Step = (ctx: Ctx) => Response | undefined;",
        "",
        "const reject = (status: number) => new Response(null, { status });",
        "",
        "/** If an earlier step rejects, later steps never run */",
        "export const pipeline = (steps: readonly Step[]) => (ctx: Ctx): Response | undefined => {",
        "  for (const step of steps) {",
        "    const rejected = step(ctx);",
        "    if (rejected) return rejected;",
        "  }",
        "  return undefined;",
        "};",
        "",
        'const roleGuard: Step = (c) => (c.path.startsWith("/api/health/") ? undefined : reject(404));',
        'const csrf: Step = (c) => (c.method !== "GET" && c.headers["x-toonstudio-csrf"] !== "1" ? reject(403) : undefined);',
        "",
        "export const handle = pipeline([roleGuard, csrf]); // the order is the security policy",
      ].join("\n"),
      explain: t(
        "Express·Nest의 app.use 순서가 곧 실행 순서라는 사실을 단순화했습니다. 서로 의존하는 검사(세션 → CSRF)의 순서를 바꾸면 우회가 생기므로, 실제로는 순서를 테스트가 고정합니다.",
        "A simplification of the fact that app.use order in Express and Nest is execution order. Swapping dependent checks (session, then CSRF) opens a bypass, so in practice a test pins the order.",
      ),
      verify: "types",
    },
  ],
  links: [
    {
      title: "NestJS · Middleware",
      url: "https://docs.nestjs.com/middleware",
      kind: "docs",
      note: t("미들웨어가 라우트 핸들러보다 먼저 실행되는 방식", "How middleware runs before route handlers"),
    },
    {
      title: "NestJS · Guards",
      url: "https://docs.nestjs.com/guards",
      kind: "docs",
      note: t("요청을 통과시킬지 정하는 가드의 개념", "The concept of a guard that decides whether a request passes"),
    },
    {
      title: "NestJS · Pipes",
      url: "https://docs.nestjs.com/pipes",
      kind: "docs",
      note: t("입력 검증과 변환을 맡는 파이프", "Pipes that validate and transform input"),
    },
    {
      title: "nestjs-zod",
      url: "https://github.com/BenLorantfy/nestjs-zod",
      kind: "repo",
      note: t("Zod 스키마에서 DTO와 검증 파이프를 만드는 라이브러리", "A library that builds DTOs and validation pipes from Zod schemas"),
    },
    {
      title: "Martin Fowler · MonolithFirst",
      url: "https://martinfowler.com/bliki/MonolithFirst.html",
      kind: "article",
      note: t("모놀리스를 먼저 두고 필요할 때 나누는 접근", "Start with a monolith and split only when needed"),
    },
  ],
  chapterIds: ["architecture", "infrastructure"],
  talk: {
    pitch: t(
      "ToonStudio의 백엔드는 NestJS 코드 하나입니다. 환경변수 하나로 어떤 문을 열지만 바꿔서, 같은 빌드를 전체 API 서버로도, Socket.IO 전용 서버로도, 작업 분배 워커로도 띄웁니다. 그리고 요청이 지나는 순서를 보안 정책으로 보고 테스트로 고정합니다. 앞 관문이 거절하면 뒤 관문은 실행되지 않습니다.",
      "ToonStudio's backend is a single NestJS codebase. One environment variable decides which doors open, so the same build can run as the full API server, a Socket.IO-only server or a work-distribution worker. The order a request passes through is treated as security policy and pinned by a test: when an earlier gate rejects, later gates do not run.",
    ),
    analogy: t(
      "한 건물에 층마다 열어 두는 문이 다르고, 현관에서 신분증, 안내 데스크에서 방문증, 엘리베이터에서 층 확인 순서로 지나가는 것과 같습니다.",
      "Like one building where each floor opens different doors and you pass in a fixed order: ID at the entrance, a pass at the desk, floor check at the elevator.",
    ),
    questions: [
      {
        question: t("왜 마이크로서비스가 아닌가요?", "Why not microservices?"),
        answer: t(
          "소규모 팀과 무료 인프라에서는 배포 단위만 늘리고 코드·모듈 그래프는 하나로 두는 편이 단순합니다. ARCHITECTURE.md도 하나의 모듈형 Core API를 기본으로 설명합니다. 규모가 커지면 역할 분리가 서비스 분리의 첫걸음이 될 수 있습니다.",
          "For a small team on free infrastructure, adding deployment units while keeping one codebase and module graph is simpler. ARCHITECTURE.md also describes one modular Core API as the baseline. If scale grows, role separation can be the first step toward splitting services.",
        ),
      },
      {
        question: t("인증 미들웨어가 요청마다 DB를 조회하나요?", "Does the auth middleware query the database on every request?"),
        answer: t(
          "세션 버전과 계정 상태를 확인하되 프로세스 안 30초 캐시(최대 500건)를 쓰고, 로그아웃·역할 변경 때는 즉시 비웁니다. 인스턴스가 여러 개면 다른 인스턴스에는 최대 30초 늦게 반영될 수 있습니다(코드 기준 추론).",
          "It checks the session version and account state but uses a 30-second in-process cache (up to 500 entries), cleared immediately on logout or a role change. With several instances, another instance may see a change up to 30 seconds late (an inference from the code).",
        ),
      },
      {
        question: t("환경변수가 틀리면 서버가 안 뜨나요?", "If an environment variable is wrong, does the server fail to start?"),
        answer: t(
          "Zod 스키마 위반은 경고만 남기고 부팅을 계속합니다. 다만 운영에서 인증 비밀이 32바이트 미만이거나 설정되지 않으면 부팅이 멈추도록 먼저 검사합니다.",
          "Zod schema violations only produce warnings and boot continues. However, production boot is stopped first if an auth secret is under 32 bytes or unset.",
        ),
      },
    ],
    pitfall: t(
      "capability-worker는 코드와 배포 템플릿이 있지만 기본 비활성이라 '운영 중'이라고 말하지 마세요. 또 NestJS와 Socket.IO는 Core API의 구성이지만, 실제 운영의 실시간 권위는 Cloudflare Durable Objects와 선택형 studio-live 서비스로 나뉩니다. 환경 검증을 '전부 비치명'이라고 단정하는 것도 부정확합니다.",
      "capability-worker has code and a deployment template but is off by default, so do not call it operating. NestJS and Socket.IO make up the Core API, yet the real realtime authority is split between Cloudflare Durable Objects and the optional studio-live service. And saying environment validation is entirely non-fatal would be inaccurate.",
    ),
  },
  technologies: ["NestJS", "NestJS 11", "Socket.IO", "Zod", "nestjs-zod", "pino"],
  facts: [
    {
      value: "3",
      label: t("런타임 역할 수(full · studio-live · capability-worker)", "Runtime roles (full, studio-live, capability-worker)"),
      source: "apps/api/src/config/runtime-role.ts",
    },
    {
      value: "16 MB",
      label: t("JSON 본문 파서의 한도(full 역할)", "JSON body parser limit (full role)"),
      source: "apps/api/src/config/api-body-parser-boundary.ts",
    },
    {
      value: "^11.1.24",
      label: t("@nestjs/core 선언 버전", "Declared version of @nestjs/core"),
      source: "apps/api/package.json",
    },
  ],
  reviewedAt: "2026-10-07",
};

const SESSION_TOKEN_CSRF_OAUTH_COOKIE: EngineeringAtlasEntry = {
  id: "session-token-csrf-oauth-cookie",
  category: "platform-ops",
  name: "Session token, CSRF defense and scoped OAuth cookies",
  title: t("로그인을 지키는 세 겹: 버전이 붙은 토큰, CSRF 방어, 경로를 좁힌 쿠키", "Three layers guarding sign-in: versioned tokens, CSRF defense and path-scoped cookies"),
  status: "live",
  tagline: t(
    "토큰이 맞아도 DB의 세션 버전이 다르면 즉시 무효이고, 변경 요청은 헤더·Origin·Fetch Metadata로 확인합니다.",
    "A valid token is void at once if the database's session version differs, and writes are checked by header, Origin and Fetch Metadata.",
  ),
  background: [
    t(
      "로그인하면 서버는 '이 사람은 누구'라고 적힌 입장 팔찌(세션 토큰)를 브라우저에 쥐여 줍니다. 팔찌가 위조되지 않게 서버만 아는 열쇠로 서명하고(HS256, 알고리즘은 서버가 고정), 30일 뒤 만료시킵니다. 하지만 한 번 나간 팔찌는 서버가 회수하기 어렵습니다. 그래서 팔찌에 세션 버전(sv)이라는 번호를 새기고, 요청마다 DB에 적힌 번호와 계정 상태를 대조합니다. 로그아웃·정지·탈퇴 때 번호를 하나 올리면 이미 나간 30일짜리 팔찌가 한꺼번에 무효가 됩니다.",
      "On sign-in the server hands the browser an entry wristband (a session token) saying who the person is. It is signed with a key only the server knows (HS256, with the algorithm fixed by the server) and expires after 30 days. But once issued, a wristband is hard for the server to take back. So the token carries a session version number (sv), and on each request the server compares it with the number and account status in the database. Raising the number on logout, suspension or deletion voids every 30-day wristband already out there at once.",
    ),
    t(
      "CSRF(다른 사이트가 내 브라우저의 로그인 쿠키를 이용해 몰래 요청을 보내는 공격)는 세 겹으로 막습니다. ① 변경 요청(POST·PUT·PATCH·DELETE)은 x-toonstudio-csrf: 1 헤더가 있어야 하는데, 다른 사이트의 단순 폼은 이런 헤더를 붙일 수 없습니다. ② Origin이 같은 출처이거나 허용 목록에 있어야 합니다. ③ Origin이 없으면 Fetch Metadata(Sec-Fetch-Site가 same-origin이고 Sec-Fetch-Mode가 cors 또는 same-origin)일 때만 허용합니다. 서명 헤더로 인증한 CLI·서버 호출은 브라우저가 자동으로 보내는 자격이 아니라서 대상이 아니고, 쿠키 요청과 인증 엔드포인트 POST(로그인 CSRF 포함)는 반드시 검사합니다.",
      "CSRF (another site secretly sending requests with your browser's sign-in cookie) is blocked in three layers. (1) A write request (POST, PUT, PATCH, DELETE) must carry the header x-toonstudio-csrf: 1, which a plain form on another site cannot attach. (2) The Origin must be the same origin or on an allow list. (3) If there is no Origin, the request passes only with Fetch Metadata (Sec-Fetch-Site is same-origin and Sec-Fetch-Mode is cors or same-origin). CLI and server calls authenticated by a signed header are not ambient credentials sent automatically by a browser, so they are exempt, while cookie requests and POSTs to authentication endpoints (login CSRF included) are always checked.",
    ),
    t(
      "소셜 로그인 왕복(Google·Kakao·Naver·GitHub·Apple) 중에는 state와 링크 세션을(GitHub 는 PKCE verifier 도) 쿠키에 잠시 맡깁니다. 이 쿠키는 Path를 /api/auth/oauth/<공급자>로 좁히고 HttpOnly·Secure·10분 만료로 둬서 다른 공급자나 다른 요청에는 따라붙지 않습니다. Apple만 교차 사이트 form_post 콜백을 받아야 해서 SameSite=None이며, 이 콜백은 CSRF 검사의 유일한 예외로 서명된 state 쿠키와 ID 토큰 nonce로 따로 보호합니다.",
      "During a social sign-in round trip (Google, Kakao, Naver, GitHub, Apple), the state and the link session (plus the PKCE verifier for GitHub only) are briefly kept in cookies. Those cookies are narrowed to Path /api/auth/oauth/<provider> and set HttpOnly, Secure and 10-minute expiry, so they do not ride along to other providers or other requests. Only Apple must accept a cross-site form_post callback, so it uses SameSite=None, and that callback is the single exception to the CSRF check, protected separately by a signed state cookie and the ID-token nonce.",
    ),
    t(
      "대안은 서버 세션 저장소(Redis 등)나 짧은 JWT와 refresh 토큰입니다. 이 설계는 단일 정수 비교로 철회를 얻는 반(半) stateless 방식이라 요청마다 사용자 조회가 필요하고, 30초 캐시(최대 500건)로 줄입니다. 캐시가 프로세스 안에 있어 인스턴스가 여러 개면 다른 인스턴스에는 최대 30초 늦게 반영될 수 있습니다(코드 기준 추론). 서명 키 회전(kid)은 코드에서 확인하지 못했습니다.",
      "Alternatives are a server-side session store (Redis and the like) or a short-lived JWT with a refresh token. This design is semi-stateless: revocation comes from comparing a single integer, so each request needs a user lookup, trimmed by a 30-second cache (up to 500 entries). Because the cache lives in the process, another instance may see a change up to 30 seconds late (an inference from the code). Signing-key rotation (kid) was not found in the code.",
    ),
  ],
  keyPoints: [
    t("토큰이 맞아도 DB의 세션 버전이 다르면 즉시 무효", "A valid token is void at once if the DB's session version differs"),
    t("HS256 서명 · 30일 만료 · 운영 비밀은 32바이트 이상", "HS256 signature, 30-day expiry, production secret of 32+ bytes"),
    t("CSRF 3중: 커스텀 헤더 · Origin · Fetch Metadata", "Triple CSRF: custom header, Origin, Fetch Metadata"),
    t("OAuth 쿠키는 공급자별 경로로 좁히고 10분 뒤 만료", "OAuth cookies are scoped per provider path and expire in 10 minutes"),
  ],
  diagram: {
    id: "session-token-csrf-oauth-cookie-diagram",
    kind: "graph",
    title: t("변경 요청이 CSRF 검사를 통과하는 길", "How a write request passes the CSRF check"),
    caption: t(
      "서명 헤더는 곧장 통과하고, 쿠키와 인증 요청은 커스텀 헤더, Origin, Fetch Metadata 순서로 확인합니다.",
      "A signed header passes straight through; cookie and auth requests are checked by custom header, Origin, then Fetch Metadata.",
    ),
    alt: t(
      "변경 요청이 오면 먼저 인증 출처를 봅니다. 서명 헤더로 인증된 호출은 그대로 통과합니다. 쿠키나 인증 엔드포인트 요청은 x-toonstudio-csrf 헤더 값이 1인지 확인하고, 그다음 Origin이 같은 출처이거나 허용 목록에 있는지 봅니다. Origin이 없으면 Fetch Metadata가 same-origin일 때만 통과하며, 어느 단계든 실패하면 403으로 거절합니다.",
      "A write request first has its authentication source examined. A call authenticated by a signed header passes as is. A cookie or authentication-endpoint request must carry x-toonstudio-csrf set to 1, then its Origin must be the same origin or on the allow list. With no Origin, only Fetch Metadata saying same-origin passes, and a failure at any step is rejected with 403.",
    ),
    nodes: [
      { id: "req", label: t("변경 요청", "Write request"), sub: t("POST·PUT·PATCH·DELETE", "POST, PUT, PATCH, DELETE"), tone: "local", shape: "pill", at: [0, 1] },
      { id: "source", label: t("인증 출처?", "Auth source?"), sub: t("헤더 · 쿠키", "header, cookie"), tone: "neutral", shape: "diamond", at: [1, 1] },
      { id: "header", label: t("CSRF 헤더?", "CSRF header?"), sub: t("값이 1인가", "is it 1?"), tone: "neutral", shape: "diamond", at: [2, 1] },
      { id: "origin", label: t("Origin?", "Origin?"), sub: t("허용 목록", "allow list"), tone: "neutral", shape: "diamond", at: [3, 1] },
      { id: "meta", label: t("Fetch Metadata?", "Fetch Metadata?"), sub: t("same-origin", "same-origin"), tone: "neutral", shape: "diamond", at: [4, 1] },
      { id: "ok", label: t("통과", "Pass"), tone: "good", shape: "pill", at: [3, 0] },
      { id: "deny", label: t("403 거절", "403 reject"), sub: t("출처를 확인할 수 없음", "Origin cannot be verified"), tone: "warn", at: [3, 2] },
    ],
    edges: [
      { from: "req", to: "source" },
      { from: "source", to: "ok", label: t("서명 헤더", "signed header") },
      { from: "source", to: "header", label: t("쿠키·인증", "cookie, auth") },
      { from: "header", to: "origin", label: t("예", "yes") },
      { from: "header", to: "deny", label: t("아니오", "no") },
      { from: "origin", to: "ok", label: t("허용", "allowed") },
      { from: "origin", to: "deny", label: t("불허", "denied") },
      { from: "origin", to: "meta", label: t("없음", "none") },
      { from: "meta", to: "ok", label: t("예", "yes") },
      { from: "meta", to: "deny", label: t("아니오", "no") },
    ],
  },
  usage: [
    {
      feature: t("로그인 뒤 모든 화면의 '나는 누구인가'", "'Who am I' on every screen after sign-in"),
      role: t(
        "요청마다 헤더나 쿠키의 토큰을 서명·발급자·대상·만료·세션 버전 순으로 확인하고, 검증된 사용자 ID만 하위 컨트롤러에 넘깁니다.",
        "On each request the token in a header or cookie is checked for signature, issuer, audience, expiry and session version, and only the verified user ID is passed to controllers.",
      ),
      paths: [
        "apps/api/src/server/session.ts#verifySessionToken",
        "apps/api/src/session-middleware.ts",
        "apps/api/src/session-cookie.ts",
      ],
    },
    {
      feature: t("글쓰기·저장·결제 같은 모든 변경 요청의 출처 확인", "Origin checks on every write such as posting, saving and paying"),
      role: t(
        "API 미들웨어와 웹 클라이언트가 같은 계약 패키지의 헤더 이름과 보호 메서드 목록을 씁니다. API가 웹 소스를 import하지 않고도 같은 상수를 공유합니다.",
        "The API middleware and the web client use the same header name and protected-method list from a contracts package, so the API shares constants without importing web source.",
      ),
      paths: [
        "apps/api/src/csrf-middleware.ts",
        "packages/contracts/src/security/csrf.ts",
        "apps/web/src/shared/lib/csrf.ts",
      ],
    },
    {
      feature: t("소셜 로그인 왕복 (Google·Kakao·Naver·GitHub·Apple)", "Social sign-in round trips (Google, Kakao, Naver, GitHub, Apple)"),
      role: t(
        "state·링크 세션(GitHub 는 PKCE 도) 쿠키를 공급자별 경로로 좁혀 10분만 맡기고, Apple만 교차 사이트 POST 콜백을 위해 SameSite=None을 씁니다.",
        "State and link-session cookies (plus PKCE for GitHub) are narrowed to per-provider paths for 10 minutes, and only Apple uses SameSite=None for its cross-site POST callback.",
      ),
      paths: ["apps/api/src/oauth-state-cookie.ts"],
    },
    {
      feature: t("로그아웃·계정 정지·탈퇴·연동 해제", "Logout, suspension, deletion and unlink webhooks"),
      role: t(
        "세션 버전을 하나 올려 이미 발급된 토큰을 모두 무효로 만들고, 실시간 쪽에도 버전 철회를 알립니다.",
        "The session version is incremented to void every issued token, and the realtime side is told about the revoked version too.",
      ),
      paths: [
        "apps/api/src/server/user-lifecycle.ts#revokeUserSessions",
        "apps/api/src/modules/auth/auth.controller.ts",
      ],
    },
  ],
  samples: [
    {
      kind: "simplified",
      title: t("서명·만료·세션 버전을 차례로 확인하는 검증", "Verifying signature, expiry and session version in turn"),
      language: "ts",
      code: [
        "interface Claims { sub: string; sv: number; exp: number }",
        "",
        "const b64url = (bytes: ArrayBuffer): string =>",
        '  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\\+/gu, "-").replace(/\\//gu, "_").replace(/=+$/u, "");',
        "",
        "export async function verify(token: string, key: CryptoKey, currentSv: number, now = Date.now()): Promise<string | null> {",
        '  const [header, payload, signature] = token.split(".");',
        "  if (!header || !payload || !signature) return null;",
        "  // 알고리즘은 토큰이 아니라 서버가 고정한다: HS256 으로 다시 계산해 비교한다",
        '  const expected = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`)));',
        "  if (expected !== signature) return null; // 실제 코드는 상수 시간 비교(timingSafeEqual)를 쓴다",
        "  const claims = JSON.parse(atob(payload.replace(/-/gu, \"+\").replace(/_/gu, \"/\"))) as Claims;",
        "  if (claims.exp * 1000 <= now) return null; // 만료",
        "  return claims.sv === currentSv ? claims.sub : null; // 세션 버전이 다르면 즉시 무효",
        "}",
      ].join("\n"),
      codeEn: [
        "interface Claims { sub: string; sv: number; exp: number }",
        "",
        "const b64url = (bytes: ArrayBuffer): string =>",
        '  btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\\+/gu, "-").replace(/\\//gu, "_").replace(/=+$/u, "");',
        "",
        "export async function verify(token: string, key: CryptoKey, currentSv: number, now = Date.now()): Promise<string | null> {",
        '  const [header, payload, signature] = token.split(".");',
        "  if (!header || !payload || !signature) return null;",
        "  // the server fixes the algorithm, not the token: recompute with HS256 and compare",
        '  const expected = b64url(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${header}.${payload}`)));',
        "  if (expected !== signature) return null; // the real code uses a constant-time comparison (timingSafeEqual)",
        "  const claims = JSON.parse(atob(payload.replace(/-/gu, \"+\").replace(/_/gu, \"/\"))) as Claims;",
        "  if (claims.exp * 1000 <= now) return null; // expired",
        "  return claims.sv === currentSv ? claims.sub : null; // a different session version voids it at once",
        "}",
      ].join("\n"),
      explain: t(
        "여기서는 웹 표준 Web Crypto로 줄였지만, 실제 서버 코드는 node:crypto의 createHmac과 timingSafeEqual을 씁니다. 핵심은 서명, 만료, 세션 버전을 이 순서로 확인하고 하나라도 틀리면 null을 돌려준다는 점입니다.",
        "This is cut down to the Web Crypto standard, while the real server code uses createHmac and timingSafeEqual from node:crypto. The point is to check signature, expiry and session version in that order and return null on any mismatch.",
      ),
      source: "apps/api/src/server/session.ts",
      verify: "types",
    },
    {
      kind: "simplified",
      title: t("커스텀 헤더 → Origin → Fetch Metadata 순서의 CSRF 판정", "CSRF decision by custom header, Origin, then Fetch Metadata"),
      language: "ts",
      code: [
        'const CSRF_HEADER = "x-toonstudio-csrf";',
        'const PROTECTED = new Set(["POST", "PUT", "PATCH", "DELETE"]);',
        "",
        "interface Req { method: string; headers: Map<string, string>; host: string }",
        "",
        "export function csrfAllowed(req: Req, allowedOrigins: readonly string[]): boolean {",
        "  if (!PROTECTED.has(req.method.toUpperCase())) return true; // 읽기 요청은 대상이 아니다",
        '  if (req.headers.get(CSRF_HEADER) !== "1") return false; // ① 다른 사이트의 단순 폼은 이 헤더를 못 붙인다',
        '  const origin = req.headers.get("origin");',
        "  if (origin) {",
        "    // ② 같은 출처이거나 허용 목록에 있어야 한다",
        "    return new URL(origin).host === req.host || allowedOrigins.includes(origin);",
        "  }",
        "  // ③ Origin 이 없으면 Fetch Metadata 가 same-origin 일 때만 허용한다",
        '  const site = req.headers.get("sec-fetch-site");',
        '  const mode = req.headers.get("sec-fetch-mode");',
        '  return site === "same-origin" && (mode === "cors" || mode === "same-origin");',
        "}",
      ].join("\n"),
      codeEn: [
        'const CSRF_HEADER = "x-toonstudio-csrf";',
        'const PROTECTED = new Set(["POST", "PUT", "PATCH", "DELETE"]);',
        "",
        "interface Req { method: string; headers: Map<string, string>; host: string }",
        "",
        "export function csrfAllowed(req: Req, allowedOrigins: readonly string[]): boolean {",
        "  if (!PROTECTED.has(req.method.toUpperCase())) return true; // reads are out of scope",
        '  if (req.headers.get(CSRF_HEADER) !== "1") return false; // (1) a plain form on another site cannot attach this header',
        '  const origin = req.headers.get("origin");',
        "  if (origin) {",
        "    // (2) same origin or on the allow list",
        "    return new URL(origin).host === req.host || allowedOrigins.includes(origin);",
        "  }",
        "  // (3) with no Origin, allow only when Fetch Metadata says same-origin",
        '  const site = req.headers.get("sec-fetch-site");',
        '  const mode = req.headers.get("sec-fetch-mode");',
        '  return site === "same-origin" && (mode === "cors" || mode === "same-origin");',
        "}",
      ].join("\n"),
      explain: t(
        "실제 미들웨어는 서명 헤더로 인증한 호출을 먼저 통과시키고, Apple form_post 콜백을 예외로 두며, 인증 엔드포인트 POST에는 Origin을 필수로 요구합니다. 여기서는 세 겹의 순서만 남겼습니다.",
        "The real middleware first lets signed-header calls through, makes the Apple form_post callback the lone exception and requires an Origin on authentication-endpoint POSTs. Only the order of the three layers is kept here.",
      ),
      source: "apps/api/src/csrf-middleware.ts",
      verify: "types",
    },
  ],
  links: [
    {
      title: "OWASP · Cross-Site Request Forgery Prevention Cheat Sheet",
      url: "https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html",
      kind: "guide",
      note: t("커스텀 헤더와 Origin·Fetch Metadata 검증의 근거", "The basis for custom headers and Origin or Fetch Metadata checks"),
    },
    {
      title: "web.dev · Protect your resources from web attacks with Fetch Metadata",
      url: "https://web.dev/articles/fetch-metadata",
      kind: "guide",
      note: t("Sec-Fetch-* 헤더의 의미", "What the Sec-Fetch-* headers mean"),
    },
    {
      title: "RFC 7519 · JSON Web Token",
      url: "https://datatracker.ietf.org/doc/html/rfc7519",
      kind: "spec",
      note: t("sub·iss·aud·exp 같은 표준 클레임", "Standard claims such as sub, iss, aud and exp"),
    },
    {
      title: "RFC 7636 · PKCE",
      url: "https://datatracker.ietf.org/doc/html/rfc7636",
      kind: "spec",
      note: t("인가 코드 가로채기를 막는 OAuth 확장", "The OAuth extension that stops authorization-code interception"),
    },
    {
      title: "MDN · Set-Cookie (SameSite, Path)",
      url: "https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/Set-Cookie",
      kind: "docs",
      note: t("HttpOnly·Secure·SameSite·Path 속성", "The HttpOnly, Secure, SameSite and Path attributes"),
    },
  ],
  chapterIds: ["authentication", "social-identity-lifecycle"],
  talk: {
    pitch: t(
      "로그인 상태를 세 겹으로 지킵니다. 첫째, 세션 토큰에 버전 번호가 있어서 로그아웃하면 DB의 번호가 올라가 이미 나간 토큰이 한꺼번에 무효가 됩니다. 둘째, 글쓰기나 결제 같은 변경 요청은 전용 헤더와 Origin, Fetch Metadata를 차례로 확인해 다른 사이트의 몰래 요청을 거릅니다. 셋째, 소셜 로그인 중간 쿠키는 공급자별 경로로 좁혀 10분만 둡니다.",
      "Sign-in state is guarded in three layers. First, the session token carries a version number, so logging out raises the number in the database and every token already issued becomes void at once. Second, write requests such as posting or paying are checked in turn by a dedicated header, the Origin and Fetch Metadata to filter out covert requests from other sites. Third, the temporary cookies of a social sign-in are narrowed to a per-provider path and kept only 10 minutes.",
    ),
    analogy: t(
      "입장 팔찌에 '오늘의 색'이 새겨져 있고, 출입구 직원이 매번 오늘의 색을 확인합니다. 색을 바꾸면 이전 팔찌는 모두 쓸모없어집니다.",
      "An entry wristband is stamped with 'today's color' and the staff at the door check it every time; change the color and every earlier band is useless.",
    ),
    questions: [
      {
        question: t("JWT를 왜 직접 구현했나요?", "Why was JWT implemented in-house?"),
        answer: t(
          "외부 라이브러리 없이 node:crypto로 새 토큰은 HS256 JWT 로만 발급합니다. 이전에 발급된 레거시 v2 HMAC 토큰도 만료(최대 30일)까지는 계속 검증합니다. 알고리즘 협상이 없고 발급자·대상이 고정되며, 운영 비밀 길이를 강제합니다. 검토할 점으로, 키 회전 절차(kid)는 코드에서 확인하지 못했습니다.",
          "New tokens are issued only as HS256 JWTs through node:crypto with no external library, while legacy v2 HMAC tokens issued earlier still verify until they expire (up to 30 days): there is no algorithm negotiation, the issuer and audience are fixed and the production secret length is enforced. One thing to review: a key-rotation procedure (kid) was not found in the code.",
        ),
      },
      {
        question: t("x-user-id 헤더는 위조할 수 있지 않나요?", "Can't the x-user-id header be forged?"),
        answer: t(
          "헤더 값 자체가 서명된 토큰이고, 검증에 실패하면 서버가 헤더를 지워 익명으로 처리합니다. 인증 출처(헤더/쿠키)는 요청 객체 밖의 WeakMap에 따로 보관해, 다른 헤더로 출처를 속일 수 없습니다.",
          "The header value is itself a signed token, and on verification failure the server removes the header and treats the caller as anonymous. The authentication source (header or cookie) is kept in a WeakMap outside the request object, so another header cannot fake it.",
        ),
      },
      {
        question: t("Apple 로그인만 왜 예외인가요?", "Why is only Apple an exception?"),
        answer: t(
          "Apple은 이름·이메일 범위를 요청하면 인가 응답을 다른 사이트에서 form_post로 보냅니다. 그래서 그 콜백 하나만 CSRF 검사에서 빼고, 서명된 state 쿠키와 ID 토큰 nonce로 따로 보호합니다.",
          "When name and email scopes are requested, Apple sends the authorization response from another site as a form_post. So only that one callback is exempt from the CSRF check and is protected separately by a signed state cookie and the ID-token nonce.",
        ),
      },
    ],
    pitfall: t(
      "'모든 요청이 DB를 조회한다'와 '완전한 무상태'는 둘 다 부정확합니다. 사용자 조회에는 30초 프로세스 캐시가 있습니다. 공급자별 소셜 로그인이 운영에서 켜져 있는지는 render.yaml에 키 이름만 있고 값을 확인하지 못했습니다. 이 카드는 공급자 수명주기가 아니라 그 아래층의 세션·CSRF 메커니즘을 다룹니다.",
      "'Every request hits the database' and 'fully stateless' are both inaccurate: user lookups have a 30-second process cache. Whether each social provider is enabled in production is unknown, since render.yaml lists only key names. This card covers the session and CSRF mechanics beneath the provider lifecycle, not the lifecycle itself.",
    ),
  },
  technologies: ["OAuth 2.0", "NestJS", "HMAC", "JWT", "CSRF", "PKCE"],
  facts: [
    {
      value: "30 days",
      label: t("세션 토큰 유효 기간", "Session token lifetime"),
      source: "apps/api/src/server/session.ts",
    },
    {
      value: "30 s / 500",
      label: t("세션 사용자 조회 캐시의 TTL과 최대 항목 수", "TTL and maximum entries of the session user cache"),
      source: "apps/api/src/server/session.ts",
    },
    {
      value: "60 s",
      label: t("Studio live 입장 티켓의 유효 시간", "Lifetime of the Studio live admission ticket"),
      source: "packages/contracts/src/studio-live-auth-ticket.ts",
    },
    {
      value: "10 minutes",
      label: t("OAuth state·링크 세션·PKCE(GitHub) 쿠키의 유효 시간", "Lifetime of the OAuth state, link-session and PKCE (GitHub) cookies"),
      source: "apps/api/src/oauth-state-cookie.ts",
    },
  ],
  reviewedAt: "2026-10-07",
};

export const PLATFORM_OPS_BACKEND_CARDS: readonly EngineeringAtlasEntry[] = [
  NESTJS_ROLE_FROZEN_RUNTIME,
  SESSION_TOKEN_CSRF_OAUTH_COOKIE,
];
