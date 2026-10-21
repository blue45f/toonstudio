import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideArea } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 영역 7 "서버와 데이터".
 * 사실의 정본은 docs/operations/canonical-database-topology.md(Supabase PostgreSQL 이 현재 권위, Neon 은 legacy 보존),
 * docs/operations/minimum-cost-deployment-policy.md, 오픈소스 지도(nestjs-drizzle·zod 행), render.yaml,
 * deploy/cloudflare-static/wrangler.jsonc 와 코드다. 서비스(PostgreSQL·Cloudflare·Render)는 설치본이 없어 license 를 "Service terms" 로 적는다.
 * DB 접속값은 비밀이라 저장소로 확인하지 못하며, 운영 정본 문서와 코드가 일치하는 범위만 쓴다. 기준일 2026-10-08.
 */

const API = "apps/api/src";

export const LIBRARY_AREA_SERVER_DATA: LibraryGuideArea = {
  id: "server-data",
  number: 7,
  title: t("서버와 데이터", "Server and data"),
  question: t("서버·원장·파일은 무엇으로 만들었나?", "What are the server, the ledger and the files built with?"),
  oneLine: t(
    "정적 화면은 Cloudflare가 곧장 내주고, 원장(회원·작품·결제)은 NestJS 서버가 Supabase PostgreSQL 한 곳에만 씁니다.",
    "Cloudflare serves static screens directly, and the NestJS server writes the ledger (members, works, payments) to Supabase PostgreSQL alone.",
  ),
  easy: t(
    "편의점에 비유합니다. 진열대의 물건(화면 파일)은 점원을 부르지 않고 집어 가고, 계산대(API 서버)는 장부 한 권(원장 DB)에만 적습니다. 장부가 하나라서 두 곳이 서로 다른 말을 하지 않고, 계산대 점원이 쉴 때도 진열대는 열려 있습니다.",
    "Think of a convenience store. Shoppers take goods off the shelf (screen files) without calling a clerk, and the checkout (the API server) writes in a single ledger (the ledger database). With one ledger, two books never disagree, and the shelves stay open even while the checkout clerk is resting.",
  ),
  designWhy: [
    {
      title: t("정적은 서버를 깨우지 않는다", "Static files never wake the server"),
      body: t(
        "화면 파일은 Cloudflare Static Assets가 코드 실행 없이 내주고, Worker는 지정한 26개 경로(API·링크 미리보기·대형 파일)만 먼저 받습니다. 방문자가 늘어도 Worker 호출과 잠든 API 서버를 깨우는 일은 동적 요청으로만 한정됩니다.",
        "Cloudflare Static Assets serves screen files without running code, and the Worker first receives only 26 listed path patterns (API, link previews, large files). Even with more visitors, Worker calls and wake-ups of the sleeping API server stay limited to dynamic requests.",
      ),
    },
    {
      title: t("데이터마다 쓰기 권위는 하나만 둔다", "One write authority per kind of data"),
      body: t(
        "원장 DB는 Supabase PostgreSQL 하나가 현재 권위이고 Neon은 legacy로 보존만 합니다. 이중 쓰기와 장애 시 자동 failover는 두지 않으며, 2026-09-26 Neon 무료 한도에 막히자 사람이 승인해 새 DB에서 시작했습니다.",
        "Supabase PostgreSQL is the one current write authority for the ledger, and Neon is only kept as legacy. There is no double write or automatic failover; when the Neon free limit blocked access on 2026-09-26, a person approved starting fresh on a new database.",
      ),
    },
    {
      title: t("하나의 코어를 역할로 나눠 연다", "One core, opened by role"),
      body: t(
        "같은 NestJS 빌드를 환경변수 API_RUNTIME_ROLE이 정하는 역할 3가지 중 full·studio-live 두 모양(Render 서비스 2개)으로 띄웁니다. capability-worker는 별도 모듈 그래프와 배포 틀이 준비돼 있으나 기본은 꺼져 있습니다. 역할 밖 경로는 404로 닫고 미들웨어 순서는 테스트가 고정합니다.",
        "The same NestJS build runs in two of its three roles, full and studio-live (two Render services), chosen by the API_RUNTIME_ROLE environment variable. capability-worker is prepared with its own small module graph and deployment template but is off by default. Paths outside a role return 404, and a test pins the middleware order.",
      ),
    },
    {
      title: t("입구에서 검사하고, 바꾼 SQL은 지문으로 잠근다", "Check at the door, lock changed SQL by fingerprint"),
      body: t(
        "DTO(createZodDto)로 정의한 요청은 컨트롤러에 닿기 전에 Zod 파이프가 검사하고, 본문을 unknown으로 받는 핸들러는 서비스 안에서 따로 검증합니다. 이미 배포한 SQL은 SHA-256 지문을 기록해 두고 빌드가 원문이 바뀌면 실패시키며, 운영 빌드·시작 명령에서 drizzle-kit push는 쓰지 않습니다.",
        "A request defined as a DTO (createZodDto) is checked by the Zod pipe before it reaches a controller, while handlers that take the body as unknown validate it themselves inside the service. Already deployed SQL has a recorded SHA-256 fingerprint and the build fails if the text changes, and drizzle-kit push is never run in production build or start commands.",
      ),
    },
  ],
  diagram: {
    id: "server-data-diagram",
    kind: "layers",
    title: t("요청이 원장에 닿기까지의 층", "The layers from request to ledger"),
    caption: t(
      "화면은 Cloudflare가 곧장 내주고, 원장 기록은 NestJS 서버를 거쳐 한 곳의 DB에만 쓰이며, 작업 중인 원본은 기기가 먼저 받습니다.",
      "Cloudflare serves screens directly, ledger records pass the NestJS server into a single database, and the device receives working originals first.",
    ),
    alt: t(
      "위에서 아래로 여섯 층입니다. Cloudflare가 화면 파일은 곧장 내주고, API·링크 미리보기·대형 파일의 지정 경로 26개만 Worker가 먼저 받습니다. 그 뒤 Render에서 도는 NestJS 서버가 Zod로 요청 모양을 검사하고, Drizzle ORM과 pg로 Supabase PostgreSQL 원장에 씁니다. 옛 Neon은 legacy로 보존만 합니다. 맨 아래 층은 기기가 먼저 받는 것으로, 작업 중인 원본은 내 기기의 OPFS에 먼저 쓰이고 서버 저장은 별도 단계입니다.",
      "Six layers from top to bottom. Cloudflare serves screen files directly, and the Worker first receives only 26 listed paths for API, link previews and large files. Then the NestJS server running on Render checks each request shape with Zod and writes to the Supabase PostgreSQL ledger through Drizzle ORM and pg. The old Neon is only kept as legacy. The bottom layer is what the device receives first: working originals are written to OPFS on your device before, and separately from, any server save.",
    ),
    layers: [
      {
        id: "edge",
        label: t("엣지: 정적은 곧장", "Edge: static goes straight"),
        sub: t("화면 파일은 곧장, 지정한 26개 경로만 Worker가 먼저", "Screens go straight; only 26 listed paths meet the Worker"),
        tone: "edge",
        chips: ["Cloudflare Workers", "Static Assets", "R2"],
      },
      {
        id: "api",
        label: t("API 서버: 코어 하나, 켜는 역할 둘", "API server: one core, two roles running"),
        sub: t("NestJS가 REST와 Socket.IO를 모듈로 나눠 처리", "NestJS splits REST and Socket.IO into modules"),
        tone: "server",
        chips: ["NestJS", "Express", "Render"],
      },
      {
        id: "validate",
        label: t("입구 검사", "Checking at the door"),
        sub: t("DTO로 정의한 요청은 컨트롤러에 닿기 전에 Zod로 모양을 확인", "Zod checks DTO-defined requests before a controller runs"),
        tone: "good",
        chips: ["Zod", "nestjs-zod"],
      },
      {
        id: "access",
        label: t("DB 접근과 구조 변경", "Database access and changes"),
        sub: t("Drizzle ORM·pg, 배포한 SQL은 지문으로 잠금", "Drizzle ORM, pg; deployed SQL locked by hash"),
        tone: "server",
        chips: ["Drizzle ORM", "pg", "SQL migrations"],
      },
      {
        id: "ledger",
        label: t("원장 DB: 쓰기 권위는 하나", "Ledger DB: one write authority"),
        sub: t("권위는 Supabase 하나, Neon은 legacy 보존", "Supabase is the authority; Neon kept as legacy"),
        tone: "server",
        chips: ["PostgreSQL", "Supabase", "Neon (legacy)"],
      },
      {
        id: "device",
        label: t("기기가 먼저 받는 것", "What the device receives first"),
        sub: t("작업 중인 원본은 OPFS에 먼저, 서버 저장은 별도", "Originals go to OPFS first; server save is separate"),
        tone: "local",
        chips: ["OPFS"],
      },
    ],
    brackets: [{ label: t("서버 쪽이 맡는 것", "Handled on the server side"), layerIds: ["edge", "api", "validate", "access", "ledger"] }],
  },
  libraries: [
    {
      id: "nestjs",
      name: "NestJS",
      kind: "library",
      package: "@nestjs/core",
      oneLine: t("서버 코드를 모듈로 나눠 짜는 Node.js 웹 서버 틀", "A Node.js web-server framework that splits server code into modules"),
      usedFor: t(
        "로그인·카탈로그·협업을 맡는 Core API 서버의 틀입니다. 같은 빌드를 환경변수로 full·studio-live 역할로 띄우고 capability-worker는 별도 모듈로 준비돼 있습니다.",
        "The frame of the Core API server that handles sign-in, catalog and collaboration. One build runs as full or studio-live through an environment variable, and capability-worker is prepared as a separate module.",
      ),
      why: t(
        "REST와 Socket.IO 게이트웨이를 한 틀에서 도메인 모듈로 나누고, 같은 코드를 환경변수 API_RUNTIME_ROLE로 역할만 바꿔 띄워 서버 코드를 늘리지 않습니다. 요청이 지나는 순서는 테스트로 고정합니다.",
        "REST and the Socket.IO gateway are split into domain modules in one frame, and the same code is started in different roles through API_RUNTIME_ROLE, so server code does not multiply. A test pins the order a request passes through.",
      ),
      cost: t(
        "무료 Render에서 한동안 요청이 없으면 절전해 첫 응답이 느립니다. studio-live 역할도 같은 모듈 그래프를 읽어 가드는 열린 표면만 줄입니다. NestJS를 다른 프레임워크와 비교한 문서는 찾지 못했습니다.",
        "On the free Render plan the server sleeps after a while without requests, so the first reply is slow. The studio-live role loads the same module graph, so the guard only narrows the open surface. We found no document comparing NestJS with other frameworks.",
      ),
      paths: [`${API}/main.ts`, `${API}/app.module.ts`, `${API}/config/runtime-role.ts`],
      license: "MIT",
      status: "live",
      mapRowId: "nestjs-drizzle",
      atlasIds: ["nestjs-role-frozen-runtime"],
    },
    {
      id: "supabase-postgresql",
      name: "Supabase PostgreSQL",
      kind: "service",
      oneLine: t("서비스의 '기록'(회원·작품·결제)을 보관하는 원장 데이터베이스", "The ledger database that keeps the service's records (members, works, payments)"),
      usedFor: t(
        "회원·세션·작품·커뮤니티·결제·협업 기록을 보관합니다. 지금 쓰기 권위는 Supabase PostgreSQL 하나이고 Neon은 legacy로 보존만 합니다.",
        "Keeps records of members, sessions, works, community, payments and collaboration. Supabase PostgreSQL is the only write authority today, and Neon is only kept as legacy.",
      ),
      why: t(
        "데이터마다 쓰기 권위를 하나로 두려고 이중 쓰기와 자동 failover를 두지 않습니다. 2026-09-26 Neon 무료 한도에 막히자 사람이 승인해 Supabase에서 새로 시작했고, 옛 Neon은 legacy로 보존합니다.",
        "To keep one write authority per kind of data there is no double write or automatic failover. When the Neon free limit blocked access on 2026-09-26, a person approved a fresh start on Supabase, and the old Neon is kept as legacy.",
      ),
      alternatives: t(
        "무료 DB 여러 곳으로 나누는 연합 계획이 있으나 기본이 꺼져 있고 운영 처리량으로 세지 않습니다. 지금 원장은 하나뿐입니다.",
        "A federation plan to spread data over several free databases exists, but it is off by default and not counted as production capacity. Today there is a single ledger.",
      ),
      cost: t(
        "연결 풀은 기본 3개(환경변수로 1~50 조정)로 작게 둡니다. 운영 접속 정보는 비밀이라 저장소로 확인하지 못했고, 위 서술은 운영 정본 문서(2026-09-29)와 코드가 일치하는 범위입니다.",
        "The connection pool defaults to 3 (adjustable from 1 to 50 by an environment variable) and is kept small. The real connection details are secret and cannot be checked from the repository; the text covers what the canonical operations document (2026-09-29) and the code agree on.",
      ),
      paths: [
        `${API}/platform/database/pg-connection.ts`,
        `${API}/platform/database/index.ts`,
        "docs/operations/canonical-database-topology.md",
      ],
      license: "Service terms",
      status: "live",
      atlasIds: ["supabase-single-writer-authority", "federated-free-data-plane"],
    },
    {
      id: "drizzle-orm",
      name: "Drizzle ORM",
      kind: "library",
      package: "drizzle-orm",
      oneLine: t("코드로 DB 표(스키마)를 적고 SQL을 타입 안전하게 부르는 도구", "A tool to write the database schema in code and call SQL in a type-safe way"),
      usedFor: t(
        "Core API가 PostgreSQL과 대화하는 길 중 하나입니다(pg 드라이버 위, 일부는 pg 직접 SQL). 스키마는 TypeScript 파일로 두고, 구조 변경은 SQL 마이그레이션 파일로 적용합니다.",
        "One of the paths the Core API uses to talk to PostgreSQL (on top of the pg driver; some modules use raw pg SQL directly). The schema lives in TypeScript files, and structure changes are applied as SQL migration files.",
      ),
      why: t(
        "스키마를 TypeScript로 적어 서버 코드와 한곳에서 타입을 맞춥니다. 빈 DB를 세울 때는 drizzle-kit push 대신 generate를 두 번 돌려 같은 DDL이 나오는지 비교한 뒤 한 트랜잭션으로 적용합니다.",
        "Writing the schema in TypeScript keeps types aligned with server code in one place. To build an empty database, generate runs twice instead of drizzle-kit push, the two outputs are compared, and the DDL is applied in one transaction.",
      ),
      alternatives: t(
        "운영 빌드·시작 명령에서 drizzle-kit push를 실행하지 않고 구조 변경은 승인형 마이그레이션 워크플로로 적용합니다(DEPLOY.md·최소 비용 정책). 일부 기능에는 멱등 스키마 보수 코드가 남아 있습니다.",
        "drizzle-kit push is never run in production build or start commands, and structure changes are applied through the approval-gated migration workflow (DEPLOY.md and the minimum-cost policy). Some features still carry idempotent schema-repair code.",
      ),
      cost: t(
        "적용한 SQL은 고칠 수 없고(지문 기록) 새 번호 파일을 더해야 합니다. 스키마 파일과 SQL 마이그레이션 두 곳을 맞춰야 하고, pg 풀은 기본 최대 3개 연결로 작게 둡니다.",
        "Applied SQL cannot be edited (its fingerprint is recorded); a new numbered file must be added. The schema files and SQL migrations must be kept in step, and the pg pool is kept small at 3 connections by default.",
      ),
      paths: [
        `${API}/platform/database/index.ts`,
        "apps/api/drizzle.config.ts",
        ".github/workflows/production-database-migrations.yml",
      ],
      license: "Apache-2.0",
      status: "live",
      mapRowId: "nestjs-drizzle",
      atlasIds: ["checksum-migration-ledger"],
    },
    {
      id: "zod",
      name: "Zod",
      kind: "library",
      package: "zod",
      oneLine: t("'이 데이터가 약속한 모양인가'를 검사하는 도구", "A tool that checks whether data has the shape it promised"),
      usedFor: t(
        "프로젝트 문서 형식, API 요청 본문, 환경변수, 로그인 폼 입력을 같은 방식으로 검증합니다. 서버는 nestjs-zod 파이프로 DTO 요청을 입구에서 검사합니다.",
        "Validates the project document format, API request bodies, environment variables and sign-in form input in the same way. The server checks DTO requests at the door with a nestjs-zod pipe.",
      ),
      why: t(
        "화면과 서버가 공용 계약 패키지(@toonstudio/contracts)의 모양 정의를 함께 쓰도록 같은 버전으로 고정합니다. DTO로 정의한 요청은 컨트롤러에 닿기 전에 검증되고 오류는 메시지 목록으로 돌려줍니다.",
        "The screen and the server share shape definitions from the common contracts package (@toonstudio/contracts), so one exact version is pinned. A DTO-defined request is validated before it reaches a controller and errors come back as a list of messages.",
      ),
      cost: t(
        "8개 워크스페이스가 같은 버전(4.4.3)에 묶이고 릴리스 검사는 그중 6곳을 확인합니다. 환경변수는 스키마 위반이면 경고만 하지만, 운영의 로그인 서명 비밀이 32바이트 미만이면 부팅이 멈춥니다. 검증 도구 비교 문서는 못 찾았습니다.",
        "8 workspaces pin the same version (4.4.3) and the release check covers six of them. Environment schema violations only warn, but in production a sign-in signing secret under 32 bytes stops boot. We found no document comparing validators.",
      ),
      paths: [
        `${API}/platform/http/zod-validation.pipe.ts`,
        `${API}/config/env.ts`,
        "scripts/verify-production-release-compatibility.mjs",
      ],
      license: "MIT",
      status: "live",
      mapRowId: "zod",
      atlasIds: ["nestjs-role-frozen-runtime"],
    },
    {
      id: "cloudflare-workers",
      name: "Cloudflare Workers",
      kind: "service",
      oneLine: t("화면 파일은 곧장 내주고 지정한 26개 경로만 먼저 받는 Cloudflare 문지기", "A Cloudflare gatekeeper that serves screen files directly and takes only 26 listed paths first"),
      usedFor: t(
        "화면(SPA)과 카탈로그 JSON은 Static Assets가 코드 실행 없이 내주고, Worker는 지정한 26개 경로(API·링크 미리보기·대형 파일)만 먼저 받아 알맞은 서버로 보냅니다.",
        "Static Assets serve the app (SPA) and catalog JSON without running code, and the Worker first takes only 26 listed paths (API, link previews, large files) and forwards them to the right server.",
      ),
      why: t(
        "방문자가 늘어도 정적 요청이 Worker 호출량과 잠든 API 서버를 깨우지 않게 하려는 최소 비용 정책(2026-09-15)에 맞습니다. /api/health/live는 엣지가 직접 답해 서버를 깨우지 않습니다.",
        "It fits the minimum-cost policy (2026-09-15): static requests neither use Worker invocations nor wake the sleeping API server, however many visitors arrive. The edge answers /api/health/live itself without waking the server.",
      ),
      alternatives: t(
        "모든 요청을 Worker 하나가 프록시하면 파일마다 Worker 호출이 되어 무료 한도에 빨리 닿고, 직접 운영하는 리버스 프록시는 서버를 따로 관리해야 합니다.",
        "A single Worker proxying every request turns each file into a Worker invocation and reaches the free allowance quickly, and a self-run reverse proxy means managing another server.",
      ),
      cost: t(
        "먼저 실행 목록(26개)은 사람이 관리하고, 넓히면 정적 트래픽이 Worker 호출량이 됩니다. SPA 모드는 없는 파일도 200으로 답해 sw.js 누락 같은 사고를 배포 전 검사가 막아야 합니다.",
        "The worker-first list (26 patterns) is maintained by people, and widening it turns static traffic into Worker invocations. SPA mode answers 200 even for a missing file, so a pre-deploy check must stop releases missing sw.js.",
      ),
      paths: [
        "deploy/cloudflare-static/wrangler.jsonc",
        "deploy/cloudflare-static/src/index.ts",
        "deploy/cloudflare-static/README.md",
      ],
      license: "Service terms",
      status: "live",
      atlasIds: ["static-first-edge-gateway", "large-asset-delivery-r2-range"],
    },
    {
      id: "render",
      name: "Render",
      kind: "service",
      oneLine: t("Core API 서버를 무료 웹 서비스로 돌리는 호스팅", "Hosting that runs the Core API server as a free web service"),
      usedFor: t(
        "Core API(로그인·권한·결제·원장 트랜잭션)와 선택형 실시간 서버(studio-live)를 무료 플랜으로 돌립니다. 자동 배포는 꺼 두고 승인한 커밋만 손으로 올립니다.",
        "Runs the Core API (sign-in, permissions, payments, ledger transactions) and the optional realtime server (studio-live) on the free plan. Auto-deploy is off and only an approved commit is released by hand.",
      ),
      why: t(
        "최소 비용 정책에 따라 유료 승격 없이 무료 인스턴스로 운영합니다. 정적 화면과 생존 확인은 Cloudflare가 답하므로 이 서버가 잠들어도 화면은 열립니다.",
        "Under the minimum-cost policy it runs on free instances with no paid upgrade. Cloudflare answers the static screens and liveness checks, so the screens open even while this server sleeps.",
      ),
      alternatives: t(
        "과거의 main 자동 배포와 Vercel 중심 릴리스 지침은 이 정책으로 대체됐고, 배포는 승인한 40자리 main SHA만 수동으로 올립니다.",
        "The earlier main auto-deploy and Vercel-centered release guidance were replaced by this policy, and only an approved 40-character main SHA is released manually.",
      ),
      cost: t(
        "무료 인스턴스는 한동안 요청이 없으면 절전해 첫 응답이 느립니다(DEPLOY.md 기록: 15분·약 1분). 인스턴스 1개·월 사용 시간 제한이 있고, SLA가 필요하면 별도 승인으로 승격합니다.",
        "A free instance sleeps after a while without requests, so the first reply is slow (DEPLOY.md records 15 minutes and about one minute). It has one instance and a monthly hour limit, and an SLA would need a separately approved upgrade.",
      ),
      paths: [
        "render.yaml",
        "docs/operations/minimum-cost-deployment-policy.md",
        "apps/web/src/platform/service-capability-state.ts",
      ],
      license: "Service terms",
      status: "live",
      atlasIds: ["manual-sha-release-gate", "health-live-ready-capabilities"],
    },
  ],
  pitfall: t(
    "서버가 쓰는 DB 접속 정보는 비밀이라 이 저장소로 확인할 수 없고, 위 서술은 운영 정본 문서(2026-09-29)와 코드가 일치하는 범위입니다. 옛 Neon은 legacy로 보존만 하며 쓰기 권위가 아닙니다.",
    "Where the server's database connection really points is a secret that cannot be checked from this repository; the text covers only what the canonical operations document (2026-09-29) and the code agree on. The old Neon is kept as legacy and is not a write authority.",
  ),
  status: "live",
  atlasIds: [
    "static-first-edge-gateway",
    "nestjs-role-frozen-runtime",
    "supabase-single-writer-authority",
    "checksum-migration-ledger",
    "health-live-ready-capabilities",
    "manual-sha-release-gate",
  ],
  chapterIds: ["infrastructure", "architecture", "cost-engineering", "delivery"],
  glossaryIds: [
    "data-authority-ledger",
    "migration-checksum-ledger",
    "advisory-lock",
    "expand-contract",
    "idempotency-key",
    "health-live-ready",
    "durable-objects",
    "hashed-name-immutable-cache",
    "manual-sha-release",
  ],
};
