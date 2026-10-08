import { t } from "./engineering-architecture-guide-kit";
import type { ArchitectureGuideSection } from "./engineering-architecture-guide-types";

/**
 * 아키텍처 해설 · 실행 구조 ① 브라우저 안의 작업실 ② 화면을 여는 순간.
 * 수치와 경로는 2026-10-08 기준으로 코드·설정에서 직접 확인했다(`engineering-architecture-guide-runtime.facts.test.ts` 가 일부를 다시 대조한다).
 */

/** 1) 브라우저 안의 작업실 — 사용자 기기 안의 층 구조. */
export const BROWSER_STUDIO_SECTION: ArchitectureGuideSection = {
  id: "browser-studio",
  group: "runtime",
  number: 1,
  title: t("브라우저 안의 작업실", "The studio inside your browser"),
  question: t("앱을 열면 내 기기 안에서 무엇이 일하나?", "When the app opens, what works inside my own device?"),
  oneLine: t(
    "그리는 일과 저장하는 일은 내 브라우저 안에서 끝나고, 서버는 그다음에 만납니다.",
    "Drawing and saving finish inside your browser; the server comes into play afterwards.",
  ),
  easy: t(
    "브라우저는 '내 책상 위 작업실'입니다. 화면 담당, 계산 담당, 서랍(저장) 담당이 한 방에 모여 있어서, 인터넷이 느려져도 그리는 일은 멈추지 않습니다.",
    "Think of the browser as a workshop on your own desk. The person who shows the page, the one who does the heavy math and the one who keeps the drawers all sit in one room, so drawing carries on even when the internet is slow.",
  ),
  diagram: {
    id: "browser-studio-diagram",
    kind: "layers",
    title: t("내 기기 안의 여섯 층", "Six layers inside your device"),
    caption: t(
      "아래로 갈수록 작품을 지키는 층입니다. 한 번 온라인으로 연 뒤에는 모두 서버 없이 내 기기 안에서 돕니다.",
      "The lower the layer, the closer it is to keeping your work safe, and after one online visit every layer runs on your device without a server.",
    ),
    alt: t(
      "맨 위는 화면과 입력이고 그 아래로 문서와 명령, 그리기·3D 엔진, 일꾼(Worker·WASM), 기기 저장소, 앱 셸을 보관하는 서비스 워커가 이어집니다. 작품은 직렬화되는 문서로 저장되고, 필터·PNG 같은 무거운 작업은 일꾼이 맡으며, 저장은 기기 안의 SQLite 와 OPFS 에 남습니다.",
      "From the top: screen and input, document and commands, drawing and 3D engines, workers and WASM, on-device storage, and a Service Worker that keeps the app shell. The work is stored as a serializable document, workers do heavy jobs such as filters and PNG encoding, and saving lands in on-device SQLite and OPFS.",
    ),
    layers: [
      {
        id: "ui",
        label: t("화면과 입력", "Screen and input"),
        sub: t("화면은 React, 문서 표시·펜 입력은 Konva", "React draws the app; Konva shows the document and takes pen input"),
        tone: "local",
        chips: ["React 19", "Konva", "Vite"],
      },
      {
        id: "document",
        label: t("문서와 명령", "Document and commands"),
        sub: t("직렬화되는 문서로 저장, 되돌리기는 편집 기록(스냅샷)", "Saved as a serializable document; undo runs on edit-history snapshots"),
        tone: "local",
        chips: ["studio-project-model", "command-registry"],
      },
      {
        id: "engines",
        label: t("그리기·3D 엔진", "Drawing and 3D engines"),
        sub: t("엔진마다 맡은 일을 코드 원장에 적고 테스트가 검사", "Each engine's job is written in a code ledger and checked by tests"),
        tone: "local",
        chips: ["Canvas2D", "Skia", "Pixi", "three.js"],
      },
      {
        id: "workers",
        label: t("일꾼 (Worker·WASM)", "Workers and WASM"),
        sub: t("필터·PNG 같은 무거운 일은 화면 밖에서 처리", "Heavy jobs such as filters and PNG encoding run off-screen"),
        tone: "local",
        chips: ["Web Worker", "Rust/WASM"],
      },
      {
        id: "storage",
        label: t("기기 저장소", "On-device storage"),
        sub: t("전용 Worker 의 SQLite WASM 과 OPFS 복구 저널", "SQLite WASM in a dedicated worker, plus an OPFS recovery journal"),
        tone: "local",
        chips: ["SQLite WASM", "OPFS", "Web Locks"],
      },
      {
        id: "shell",
        label: t("앱 셸 보관", "App-shell keeper"),
        sub: t("앱 셸을 보관해 오프라인에서도 열림", "A Service Worker keeps the app shell so it opens offline too"),
        tone: "local",
        chips: ["Service Worker", "Cache API"],
      },
    ],
    brackets: [
      {
        label: t("한 번 연 뒤 서버 없이 동작", "No server after one visit"),
        layerIds: ["ui", "document", "engines", "workers", "storage", "shell"],
      },
    ],
  },
  steps: [
    t("주소를 열면 React 앱이 뜨고, /studio 에서 Konva 캔버스가 작품을 보여 줍니다.", "Opening the address starts the React app, and on /studio a Konva canvas shows the work."),
    t("펜을 내릴 때 그릴 표면을 한 번 고릅니다. 필터·PNG 같은 무거운 일만 일꾼(Worker·WASM)이 맡습니다.", "The moment the pen goes down, one drawing surface is chosen. Only heavy jobs such as filters and PNG encoding go to workers (Worker and WASM); default-brush stroke math stays on the main thread."),
    t("작품은 직렬화되는 문서로 저장되고, 되돌리기는 편집 기록(스냅샷)으로 동작하며, 복구는 아래의 저널이 맡습니다.", "The work is stored as a serializable document, undo runs on edit-history snapshots, and recovery is handled by the journal below."),
    t("편집이 1.5초 멈추거나 펜을 뗄 때 OPFS 복구 저널에 자동 저장됩니다.", "When editing pauses for 1.5 seconds or the pen lifts, an autosave goes into the OPFS recovery journal."),
    t("카탈로그·설정은 전용 Worker 한 개가 쥔 SQLite WASM 에 두고, 같은 문서는 탭 하나만 저장을 맡습니다.", "Catalogs and settings live in SQLite WASM held by one dedicated worker, and only one tab saves a given document."),
    t("Service Worker 가 앱 셸을 보관해 한 번 열어 본 스튜디오는 오프라인에서도 열립니다.", "A Service Worker keeps the app shell, so a studio that was opened once can open offline."),
  ],
  background: [
    t(
      "보통의 웹 서비스는 화면만 브라우저에 있고 계산과 저장은 서버가 합니다. 그러면 연결이 느리거나 서버가 잠들 때 그리는 손이 멈춥니다. ToonStudio 의 스튜디오는 반대로 그리기·계산·임시 저장을 내 기기 안에 두고, 서버는 계정·공유·결제 같은 '여럿이 함께 믿어야 하는 일'을 주로 맡고, 상태 확인과 AI 호출 같은 일부 요청에도 쓰입니다.",
      "In a typical web service only the screen lives in the browser, while computing and saving happen on a server, so a slow connection or a sleeping server stops the drawing hand. The ToonStudio studio does the opposite: drawing, computing and temporary saving stay on your device, and the server mainly handles things many people must trust together, such as accounts, sharing and payments, and is also used for a few requests such as status checks and AI calls.",
    ),
    t(
      "구조는 여섯 층입니다. 화면은 React 와 Konva 가, 무거운 작업(필터 적용·PNG 만들기)은 화면 밖의 일꾼(Web Worker)과 미리 번역해 둔 WASM 이 맡고, 기본 붓의 획 계산은 화면 스레드에서 돕니다. 작품은 렌더러 객체가 아니라 직렬화되는 문서로 저장하고, 렌더러마다 '무엇을 맡는가'를 코드 한 곳(원장)에 적어 어긋나면 테스트가 실패합니다. 저장은 전용 Worker 의 SQLite 와 OPFS 복구 저널이 맡습니다.",
      "There are six layers. React and Konva handle the screen, while heavy jobs such as applying filters and encoding PNGs go to off-screen workers (Web Workers) and pre-compiled WASM, while stroke math for the default brush runs on the main thread. The work is saved as a serializable document rather than as renderer objects, and each renderer's responsibility is written in one code ledger, so a mismatch fails the tests. Saving is handled by SQLite in a dedicated worker and an OPFS recovery journal.",
    ),
    t(
      "대가도 있습니다. 브라우저 저장소는 백업이 아니라서 사이트 데이터를 지우거나 기기를 잃으면 함께 사라지고, 같은 문서는 탭 하나만 저장합니다. 첫 방문은 온라인이어야 하고, 공유 메모리를 쓰는 기능은 /studio 에만 거는 격리(COOP·COEP)가 켜져야 동작합니다. 격리 여부에 따라 한도를 달리 잡는 표는 코드에 있지만 아직 제품에 연결되지 않았습니다.",
      "There are costs too. Browser storage is not a backup, so clearing site data or losing the device removes it, and only one tab saves a given document. The first visit needs the internet, and features that use shared memory need the isolation headers (COOP and COEP) that /studio alone carries. A limits table that varies with isolation exists in code but is not yet wired into the product.",
    ),
  ],
  inService: [
    {
      what: t("캔버스·입력 (/studio)", "Canvas and input (/studio)"),
      role: t(
        "역할마다 소유자는 원장에 하나씩 적혀 있고, 문서 표시·펜 입력은 Konva, 래스터 획의 최종 커밋은 Canvas2D 가 맡음",
        "Each role has one owner in the ledger: Konva for document display and pen input, Canvas2D for the final commit of raster strokes",
      ),
      paths: ["packages/studio-engine-registry/src/renderer-roles.ts", "apps/web/src/domains/creator/canvas/StudioCanvasViewport.tsx"],
    },
    {
      what: t("획 시작과 표면 고정", "Stroke start and surface pinning"),
      role: t(
        "펜을 내릴 때 그릴 표면을 한 번 고르고 획이 끝날 때까지 바꾸지 않음(실패해도 몰래 갈아타지 않음)",
        "Picks one drawing surface at pen-down and keeps it until the stroke ends, never switching silently on failure",
      ),
      paths: ["apps/web/src/domains/creator/brush/studio-stroke-surface-route.ts"],
    },
    {
      what: t("로컬 DB와 자동 저장", "Local database and autosave"),
      role: t(
        "전용 Worker 의 SQLite WASM 과 OPFS 복구 저널이 작품 상태를 기기 안에 보관하고 크래시 뒤 복구",
        "SQLite WASM in a dedicated worker and an OPFS recovery journal keep the work state on the device and restore it after a crash",
      ),
      paths: [
        "apps/web/src/domains/creator/studio-local-database.ts",
        "apps/web/src/domains/creator/studio-opfs-recovery-journal.ts",
        "apps/web/src/domains/creator/studio-autosave-opfs-session.ts",
      ],
    },
    {
      what: t("Worker 일꾼 규약", "Worker conventions"),
      role: t(
        "무거운 일을 화면 밖으로 보내는 공통 규약(요청 번호·취소·제한 시간)이 있고 대부분의 일꾼이 따르며, 일부는 아직 제품에 연결되지 않음",
        "A shared convention (request ids, cancellation, time limits) sends heavy work off-screen and most workers follow it; a few are not yet wired into the product",
      ),
      paths: ["apps/web/src/domains/creator/studio-crc32-worker-client.ts", "apps/web/vite.config.ts"],
    },
    {
      what: t("서비스 워커 (앱 셸 보관)", "Service Worker (app shell)"),
      role: t(
        "요청을 10종류로 나눠 앱 셸을 보관하고, 새 버전은 저장이 끝난 뒤 사용자가 눌러야 적용",
        "Sorts requests into 10 classes to keep the app shell, and applies a new version only after saving ends and the user confirms",
      ),
      paths: ["apps/web/src/app/service-worker/studio-service-worker-policy.ts", "apps/web/src/app/main.tsx"],
    },
  ],
  decisions: [
    {
      choice: t("작품 원본을 서버가 아니라 내 기기에 둔다", "Keep the work's source on your device, not on a server"),
      because: t(
        "서버 비용 없이 오프라인·빠른 저장이 가능하고, 무료 서버가 잠들어도 그리는 일이 이어집니다.",
        "Saving is fast and works offline at no server cost, and drawing continues even when the free server is asleep.",
      ),
      cost: t(
        "브라우저 저장소는 백업이 아니라서 내보내기·개인 클라우드 사본이 필요하고, 같은 문서는 탭 하나만 저장합니다.",
        "Browser storage is not a backup, so export files or a personal-cloud copy are needed, and only one tab saves a given document.",
      ),
    },
    {
      choice: t("엔진마다 '맡은 일'을 코드 원장에 적는다", "Write each engine's job in a code ledger"),
      because: t(
        "렌더러가 열 개 넘게 공존해도 누가 무엇을 그리는지를 문서가 아니라 테스트가 지킵니다.",
        "Even with more than ten renderers side by side, tests rather than prose guard who draws what.",
      ),
      cost: t(
        "원장의 설명 문장은 사람이 쓰므로, 기계가 보증하는 것은 소유자 수·경로 실재 같은 구조까지입니다.",
        "The ledger's descriptive sentences are written by people, so machines only guarantee structure such as owner counts and existing paths.",
      ),
    },
    {
      choice: t("획이 시작될 때 그릴 표면을 한 번만 정한다", "Choose the drawing surface once, when a stroke starts"),
      because: t(
        "중간에 몰래 엔진을 바꾸면 표면마다 다른 픽셀이 나오고 장치 문제가 다른 엔진의 성공 뒤에 가려집니다.",
        "Switching engines mid-stroke would produce different pixels per surface and hide a device problem behind another engine's success.",
      ),
      cost: t(
        "지원되지 않는 기기에서는 대체 엔진 대신 기능이 꺼지므로 안내 화면이 꼭 필요합니다.",
        "On unsupported devices the feature turns off instead of falling back to another engine, so a clear notice screen is essential.",
      ),
    },
  ],
  pitfall: t(
    "'오프라인이면 다 된다'는 뜻이 아닙니다. 한 번 온라인으로 연 뒤의 그리기·저장까지이고 협업·AI·게시는 서버가 필요합니다. 브라우저별 실측(WebGPU·격리)은 이 페이지에서 확인하지 못했습니다.",
    "This does not mean everything works offline. It covers drawing and saving after one online visit, while collaboration, AI and publishing need the server. Per-browser measurements (WebGPU, isolation) were not verified for this page.",
  ),
  facts: [
    {
      value: "64",
      label: t("앱 코드의 Worker 스크립트(*.worker.ts) 파일 수", "Worker scripts (*.worker.ts) in the app code"),
      source: "apps/web/src",
    },
    {
      value: "v6",
      label: t("기기 안 SQLite 스키마 버전(마이그레이션 체인)", "On-device SQLite schema version (migration chain)"),
      source: "apps/web/src/domains/creator/studio-local-database.ts",
    },
    {
      value: "1.5 s",
      label: t("편집이 멈춘 뒤 자동 저장까지의 지연", "Delay from the last edit to the autosave"),
      source: "apps/web/src/domains/creator/StudioCuttoonEditorHost.tsx",
    },
    {
      value: "10",
      label: t("서비스 워커가 요청을 나누는 종류 수", "Request classes the Service Worker sorts into"),
      source: "apps/web/src/app/service-worker/studio-service-worker-policy.ts",
    },
  ],
  status: "live",
  atlasIds: [
    "renderer-role-ledger",
    "stroke-surface-route-pointerdown",
    "sqlite-wasm-opfs-sah-pool",
    "autosave-crash-recovery-journal",
    "worker-envelope-64-workers",
    "service-worker-app-shell-policy",
  ],
  chapterIds: ["architecture", "brush-render-authority", "storage", "worker-architecture", "pwa-continuity"],
  glossaryIds: ["renderer-role-ledger", "stroke-surface-route", "sqlite-wasm", "opfs", "web-worker", "service-worker"],
};

/** 2) 화면을 여는 순간 — 주소 입력부터 화면과 API 응답까지의 길. */
export const REQUEST_JOURNEY_SECTION: ArchitectureGuideSection = {
  id: "request-journey",
  group: "runtime",
  number: 2,
  title: t("화면을 여는 순간", "The moment a page opens"),
  question: t("주소를 치면 어떤 길을 지나 화면이 뜨나?", "Which route does a page take after you type an address?"),
  oneLine: t(
    "화면 파일은 Cloudflare 가 바로 내주고, 서버는 계산이 필요한 요청만 받습니다.",
    "Cloudflare hands out page files directly; the server only receives requests that need computing.",
  ),
  easy: t(
    "Cloudflare 는 건물 로비의 안내 데스크입니다. 미리 인쇄해 둔 안내문(화면 파일)은 데스크에서 바로 건네고, 상담이 필요한 일(로그인·저장)만 안쪽 사무실(서버)로 연결해 줍니다.",
    "Cloudflare is the information desk in the lobby. Pre-printed leaflets (page files) are handed over on the spot, and only matters that need a consultation (sign-in, saving) are connected to the office behind it (the server).",
  ),
  diagram: {
    id: "request-journey-diagram",
    kind: "sequence",
    title: t("주소를 친 뒤의 길", "The route after you type an address"),
    caption: t(
      "정적 화면은 Cloudflare 에서 끝나고, 동적 요청만 Core API 와 원장 DB 까지 갑니다.",
      "Static pages finish at Cloudflare; only dynamic requests travel on to the Core API and the ledger database.",
    ),
    alt: t(
      "브라우저가 화면 파일을 요청하면 Cloudflare 가 서버를 깨우지 않고 바로 응답합니다. 앱이 뜨면 로그인·저장 같은 /api 요청만 Cloudflare 의 Worker 가 받아 Core API 로 전달하고, Core API 는 권한을 확인한 뒤 서버 원장에서 읽거나 쓴 결과를 돌려줍니다.",
      "The browser asks for page files and Cloudflare answers directly without waking a server. Once the app runs, only /api requests such as sign-in and saving are received by the Cloudflare Worker and forwarded to the Core API, which checks permissions and returns the result of reading or writing the server ledger.",
    ),
    actors: [
      { id: "browser", label: t("브라우저", "Browser"), tone: "local" },
      { id: "edge", label: t("Cloudflare", "Cloudflare"), sub: t("Static Assets + Worker", "Static Assets + Worker"), tone: "edge" },
      { id: "api", label: t("Core API", "Core API"), sub: t("Render · NestJS", "Render, NestJS"), tone: "server" },
      { id: "db", label: t("서버 원장", "Server ledger"), sub: t("Supabase PostgreSQL", "Supabase PostgreSQL"), tone: "server" },
    ],
    messages: [
      { from: "browser", to: "edge", label: t("화면 파일 요청", "Ask for page files"), note: t("HTML · JS · 이미지", "HTML, JS, images") },
      { from: "edge", to: "browser", style: "dashed", label: t("바로 응답", "Answer directly"), note: t("Worker·서버를 깨우지 않음", "No Worker or server wakeup") },
      { from: "browser", to: "browser", label: t("앱 부팅 · 서비스 워커 등록", "Boot, register Service Worker"), note: t("첫 화면이 그려진 뒤", "After the first paint") },
      { from: "browser", to: "edge", label: t("/api 요청", "API request"), note: t("로그인·저장 같은 동적 요청", "Dynamic: sign-in, saving") },
      { from: "edge", to: "api", label: t("Core API 로 전달", "Forward to Core API"), note: t("비밀 헤더로 출처 확인(설정 시)", "Origin checked by secret header (if set)") },
      { from: "api", to: "db", label: t("권한 확인 뒤 읽기·쓰기", "Check access, read or write"), note: t("쓰기 권위는 원장 하나", "One write authority") },
      { from: "db", to: "api", style: "dashed", label: t("결과", "Result") },
      { from: "api", to: "browser", style: "dashed", label: t("응답 (Cloudflare 경유)", "Response via Cloudflare") },
    ],
  },
  steps: [
    t("주소를 열면 브라우저가 Cloudflare 에 화면 파일(HTML·JS·이미지)을 요청합니다.", "Opening the address makes the browser ask Cloudflare for the page files (HTML, JS, images)."),
    t("화면 파일은 Static Assets 가 Worker 실행 없이 바로 내줍니다. 서버는 깨어나지 않습니다.", "Static Assets serves the page files without running the Worker, so no server wakes up."),
    t("앱이 뜨면 필요한 코드를 더 받고, 첫 화면이 그려진 뒤 서비스 워커를 등록합니다.", "Once the app is up it loads more code and registers the Service Worker after the first paint."),
    t("로그인·저장처럼 계산이 필요한 /api 요청만 Worker 가 먼저 받아 Core API 로 전달합니다.", "Only /api requests that need computing, such as sign-in and saving, are taken by the Worker first and forwarded to the Core API."),
    t("Core API 는 (비밀 헤더를 설정했다면) Cloudflare 를 거친 요청만 받고, 권한을 본 뒤 서버 원장을 읽고 씁니다.", "The Core API, if a secret header is set, accepts only requests that came through Cloudflare, verifies permissions, then reads and writes the server ledger."),
    t("서버가 잠들어 있으면 첫 요청만 느리고, 브라우저는 처음 90초의 지연을 '연결 준비 중'으로 보여 줍니다.", "If the server is asleep only the first request is slow, and the browser shows delays in the first 90 seconds as 'getting connected'."),
  ],
  background: [
    t(
      "웹 주소를 치면 먼저 '화면을 담은 파일'을 받아 와야 합니다. 이 파일은 미리 만들어 두면 누구에게나 똑같으니 계산하는 서버가 매번 만들 필요가 없습니다. ToonStudio 는 이 점을 이용해 화면 파일은 Cloudflare 가 바로 내주고, 로그인·저장·커뮤니티처럼 사람마다 다른 일만 서버(Core API)로 보냅니다.",
      "Typing a web address first fetches the files that make up the page. Built in advance, those files are identical for everyone, so a computing server need not produce them each time. ToonStudio uses this: Cloudflare hands out page files directly, and only person-specific work such as sign-in, saving and community goes to the server (the Core API).",
    ),
    t(
      "Cloudflare 의 Static Assets 가 SPA 와 정적 카탈로그를 직접 응답하고, 얇은 Worker 는 지정한 26개 경로 패턴(API 4·링크 미리보기 16·대형 파일 6)만 먼저 받습니다. 동적 요청은 7갈래(코어·커뮤니티·플레이·관리자·실시간·공개 읽기·대형 파일) 중 한 곳으로만 전달하고, 필수 원점이 없으면 503 으로 닫고, 전용 원점이 없는 일부 갈래는 코어 원점으로 대체합니다.",
      "Cloudflare Static Assets answers the SPA and static catalogs itself, while a thin Worker takes only 26 listed path patterns first (4 API, 16 link-preview, 6 large-file). A dynamic request is forwarded to exactly one of seven routes (core, community, playground, admin, realtime, public read, large file), a missing required origin is closed with a 503, and some routes without a dedicated origin fall back to the core origin.",
    ),
    t(
      "대가는 서버 쪽에 있습니다. Core API 는 무료 플랜의 Render 서비스라 쉬는 동안 잠들 수 있어 깨우는 첫 요청이 느립니다. 그래서 생존 점검(live)은 Cloudflare 가 직접 답해 서버를 깨우지 않습니다. 다만 앱 안의 기능 배지는 capabilities 를 부르므로 화면을 열면 서버와 DB 가 깨어날 수 있습니다. 운영 대시보드의 실제 상태와 사용량은 이 페이지에서 확인하지 못했습니다.",
      "The cost sits on the server side. The Core API runs on a free-plan Render service that can fall asleep, so the first request that wakes it is slow. That is why the live health check is answered by Cloudflare itself without waking the server. The in-app feature badges call the capabilities endpoint, though, so opening a page can wake the server and the database. The real production dashboard state and usage were not verified for this page.",
    ),
  ],
  inService: [
    {
      what: t("화면 파일 서빙 (Cloudflare)", "Serving page files (Cloudflare)"),
      role: t(
        "Static Assets 가 SPA·카탈로그를 Worker 없이 응답하고, 지정한 경로만 Worker 가 먼저 처리",
        "Static Assets serves the SPA and catalogs without the Worker; only the listed paths run the Worker first",
      ),
      paths: ["deploy/cloudflare-static/wrangler.jsonc", "deploy/cloudflare-static/src/index.ts"],
    },
    {
      what: t("동적 요청 7갈래", "Seven dynamic routes"),
      role: t(
        "API·Socket.IO 요청을 7갈래로 나눠 허용된 원점으로만 전달하고, 필수 원점이 없으면 503 으로 닫음",
        "Sorts API and Socket.IO requests into seven routes, forwards only to allowed origins, and closes a missing required origin with a 503",
      ),
      paths: ["deploy/cloudflare-static/src/index.ts#classifyDynamicRoute"],
    },
    {
      what: t("Core API 서버", "Core API server"),
      role: t(
        "인증·권한·원장 트랜잭션을 맡는 NestJS. 무료 플랜이라 쉬는 동안 잠들 수 있음",
        "NestJS for authentication, permissions and ledger transactions; on a free plan it can sleep when idle",
      ),
      paths: ["render.yaml", "apps/api/src/main.ts"],
    },
    {
      what: t("상태 확인 3단", "Three-level health checks"),
      role: t(
        "live 는 DB 를 깨우지 않고, ready 는 배포 점검에 쓰이며, capabilities 는 기능별 상태 배지에 쓰이고 DB 를 확인하므로 화면을 열면 서버가 깨어날 수 있음",
        "live never wakes the database and ready serves release checks, while capabilities feeds per-feature status badges and checks the database, so opening a page can wake the server",
      ),
      paths: ["apps/api/src/modules/health/health.service.ts", "apps/web/src/platform/service-capability-state.ts"],
    },
    {
      what: t("대형 파일 배달", "Large-file delivery"),
      role: t(
        "25 MiB 를 넘는 WASM·모델 등 대형 파일(영상·GLB 포함)은 압축본·R2 에서 받아 Core API 를 깨우지 않음",
        "Large files over 25 MiB such as WASM and models (video and GLB included) come from compressed copies or R2 without waking the Core API",
      ),
      paths: ["deploy/cloudflare-static/src/large-static-assets.ts"],
    },
  ],
  decisions: [
    {
      choice: t("화면은 정적 호스팅이 곧장, Worker 는 필요한 경로만", "Static hosting serves pages; the Worker runs only on listed paths"),
      because: t(
        "무료 플랜의 호출 한도와 서버를 깨우는 일을 꼭 필요한 요청에만 씁니다.",
        "Free-plan call limits and server wakeups are spent only on requests that really need them.",
      ),
      cost: t(
        "먼저 실행할 경로가 늘수록 Worker 호출이 늘고, 경로 목록과 설정·문서를 함께 맞춰야 합니다.",
        "Every extra worker-first path adds Worker invocations, and the path list, configuration and docs must be kept in step.",
      ),
    },
    {
      choice: t("동적 서버는 Render 무료 플랜에 둔다", "Run the dynamic server on a Render free plan"),
      because: t(
        "비용 없이 동적 원장 서버를 운영하고, 정적 트래픽과 생존 점검(live)은 서버를 깨우지 않게 분리했습니다.",
        "A dynamic ledger server runs at no cost, and static traffic and the liveness check are separated so they do not wake it.",
      ),
      cost: t(
        "쉬는 동안 잠들어 깨우는 첫 요청이 느리고 가용성 약속(SLA)이 없습니다.",
        "It sleeps when idle, so the waking request is slow, and there is no availability guarantee (SLA).",
      ),
    },
  ],
  pitfall: t(
    "'정적 요청은 Worker 를 거치지 않는다'에는 예외가 있습니다(먼저 실행하는 26개 경로: 링크 미리보기 크롤러·대형 파일 등). 운영 대시보드와 실제 사용량은 확인하지 못했고 코드·설정만 근거입니다.",
    "'Static requests never touch the Worker' has exceptions: the 26 worker-first paths such as link-preview crawlers and large files. The production dashboard and real usage were not checked; only code and configuration back this section.",
  ),
  facts: [
    {
      value: "26",
      label: t("Worker 가 먼저 받는 경로 패턴(API 4·미리보기 16·대형 파일 6)", "Path patterns the Worker handles first (4 API, 16 preview, 6 large file)"),
      source: "deploy/cloudflare-static/wrangler.jsonc",
    },
    {
      value: "7",
      label: t("동적 요청 갈래 수", "Dynamic request routes"),
      source: "deploy/cloudflare-static/src/index.ts",
    },
    {
      value: "25 MiB",
      label: t("Static Assets 개별 파일 한도(코드 상수)", "Static Assets per-file limit (code constant)"),
      source: "deploy/cloudflare-static/src/large-static-assets.ts",
    },
    {
      value: "/api/health/live",
      label: t("Render 가 호출하는 상태 확인 경로(DB를 깨우지 않음)", "Health path Render calls (never wakes the database)"),
      source: "render.yaml",
    },
  ],
  status: "configured",
  atlasIds: [
    "static-first-edge-gateway",
    "health-live-ready-capabilities",
    "large-asset-delivery-r2-range",
    "edge-origin-auth-trusted-proxy",
    "server-down-fallback-deadline",
    "response-header-contract-csp",
  ],
  chapterIds: ["infrastructure", "cost-engineering", "pwa-continuity"],
  glossaryIds: ["health-live-ready", "csp", "hashed-name-immutable-cache", "offline-shell"],
};

export const ARCHITECTURE_RUNTIME_SECTIONS_A: readonly ArchitectureGuideSection[] = [BROWSER_STUDIO_SECTION, REQUEST_JOURNEY_SECTION];
