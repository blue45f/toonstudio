import type { EngineeringMapRow } from "./engineering-map-types";
import type { LocalizedText } from "./engineering-story-content";

/**
 * 기술 지도 · open-source 의 행 데이터. 지도 본체는 engineering-map-open-source.ts.
 *
 * 작성 기준(2026-10-07):
 * - 버전·SPDX 는 설치본 `node_modules/<pkg>/package.json` 과 대조했다(직접 런타임 의존성 117개).
 * - `status` 는 앱 진입점(apps/web/src/app/main.tsx)에서 import 그래프를 따라가 도달하는지로 확인했다.
 *   도달하지 않으면 live 로 쓰지 않는다(예: xatlasjs, three-mesh-bvh, resvg provider, HarfBuzz provider).
 * - 법률 판단은 하지 않는다. 저장소가 기록한 라이선스 라벨과 처리 방식만 적는다.
 */

const t = (ko: string, en: string): LocalizedText => ({ ko, en });
const same = (value: string): LocalizedText => ({ ko: value, en: value });
const AS_OF = "2026-10-07";

/** 앱 기반 → 협업·저장 */
const APP_AND_STORAGE_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "react",
    name: "React · React Router · React Compiler",
    status: "live",
    link: { title: "React", url: "https://react.dev/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "모든 화면을 그리는 UI 뼈대(React 19), 주소에 따라 화면을 바꾸는 라우터(React Router), 빌드할 때 불필요한 다시 그리기를 자동으로 줄여 주는 변환(React Compiler).",
        "The UI skeleton that draws every screen (React 19), the router that swaps screens by address (React Router), and a build-time transform that trims needless re-rendering (React Compiler).",
      ),
      license: same("MIT"),
      mode: t("런타임 · 정적", "Runtime · static"),
      note: t(
        "설치본은 React 19.2.7, Compiler 1.0.0. 린트 플러그인(eslint-plugin-react-compiler)은 아직 RC(19.1.0-rc.2)다. 개발 서버용 런타임 shim은 Vite 8.2.0 이상으로 고정되면 제거한다고 주석에 적혀 있다.",
        "Installed: React 19.2.7 and Compiler 1.0.0. The lint plugin (eslint-plugin-react-compiler) is still a release candidate (19.1.0-rc.2). A code comment says the dev-server runtime shim goes away once Vite is locked at 8.2.0 or later.",
      ),
    },
    evidence: ["package.json", "apps/web/src/app/main.tsx", "apps/web/src/app/routes/AppRouter.tsx", "apps/web/vite.config.ts"],
  },
  {
    id: "ui-kit",
    name: "Tailwind CSS · Radix UI · cmdk",
    status: "live",
    link: { title: "Tailwind CSS", url: "https://tailwindcss.com" },
    asOf: AS_OF,
    cells: {
      role: t(
        "화면 스타일(Tailwind CSS), 키보드·스크린리더를 지원하는 대화상자·메뉴·선택 상자(Radix UI), ⌘K 명령 팔레트(cmdk). 아이콘(lucide)·애니메이션(motion)·캐러셀(Embla)·긴 목록(TanStack Virtual)도 이 부류다.",
        "Styling (Tailwind CSS), dialogs, menus and selects with keyboard and screen-reader support (Radix UI), and the ⌘K command palette (cmdk). Icons (lucide), animation (motion), carousels (Embla) and long-list virtualization (TanStack Virtual) belong here too.",
      ),
      license: same("MIT · ISC"),
      mode: t("런타임 · 빌드(CSS)", "Runtime · build (CSS)"),
      note: t(
        "Tailwind 4.3.0은 PostCSS 플러그인으로 빌드할 때만 돈다. lucide-react만 ISC이고 나머지는 MIT다. 연령 확인 창은 Radix Dialog 위에 만들었다.",
        "Tailwind 4.3.0 runs only at build time, as a PostCSS plugin. Only lucide-react is ISC; the rest are MIT. The age-gate window is built on Radix Dialog.",
      ),
    },
    evidence: ["package.json", "postcss.config.mjs", "apps/web/src/shared/components/age-gate-modal.tsx", "apps/web/src/shared/components/command-palette.tsx"],
  },
  {
    id: "zustand",
    name: "Zustand",
    status: "live",
    link: { title: "Zustand", url: "https://github.com/pmndrs/zustand" },
    asOf: AS_OF,
    cells: {
      role: t(
        "여러 화면이 함께 쓰는 작은 상태(컷 목록·평점·참여·언어와 모드 등)를 담는 가벼운 저장소. 일부는 IndexedDB(브라우저 안 데이터베이스)에 이어 저장한다.",
        "A lightweight store for small bits of state that several screens share (cuts, ratings, engagement, language and mode). Some of it is persisted to IndexedDB, the browser's built-in database.",
      ),
      license: same("MIT"),
      mode: t("런타임 · 정적", "Runtime · static"),
      note: t(
        "설치본 5.0.14. 테스트를 뺀 소스 17개 파일이 쓴다(2026-10-07 import 스캔). 다른 상태 라이브러리와 비교한 문서는 찾지 못했다.",
        "Installed 5.0.14, used by 17 non-test source files (import scan, 2026-10-07). We found no document comparing it with other state libraries.",
      ),
    },
    evidence: ["package.json", "apps/web/src/domains/cuts/cuts-store.ts", "apps/web/src/shared/lib/idb-json-storage.ts"],
  },
  {
    id: "zod",
    name: "Zod",
    status: "live",
    link: { title: "Zod", url: "https://zod.dev" },
    asOf: AS_OF,
    cells: {
      role: t(
        "'이 데이터가 약속한 모양인가'를 검사하는 도구. 프로젝트 문서 형식, API 요청 본문, 환경변수, 로그인 폼 입력을 같은 방식으로 검증한다.",
        "Checks whether data has the shape it promised. One tool validates the project document format, API request bodies, environment variables and sign-in form input.",
      ),
      license: same("MIT"),
      mode: t("런타임 · 서버·웹 공용", "Runtime · server and web"),
      note: t(
        "8개 워크스페이스가 같은 4.4.3으로 정확히 고정한다. 폼 쪽은 React Hook Form과 @hookform/resolvers/zod로 이어 쓴다.",
        "Eight workspaces pin the exact same version, 4.4.3. On forms it connects to React Hook Form through @hookform/resolvers/zod.",
      ),
    },
    evidence: ["package.json", "apps/api/src/config/env.ts", "apps/web/src/domains/auth/components/auth-form.tsx"],
  },
  {
    id: "vite-vitest-playwright",
    name: "Vite · Vitest · Playwright · TypeScript",
    status: "live",
    link: { title: "Vite", url: "https://vite.dev" },
    asOf: AS_OF,
    cells: {
      role: t(
        "소스를 브라우저가 받을 파일로 묶는 빌드(Vite 8), 타입 검사(TypeScript), 단위 테스트(Vitest), 실제 브라우저로 화면·접근성을 확인하는 E2E 테스트(Playwright). 제품 번들에는 들어가지 않는 개발 도구다.",
        "The build that packs sources into files the browser downloads (Vite 8), type checking (TypeScript), unit tests (Vitest) and end-to-end tests that check screens and accessibility in a real browser (Playwright). Development tools, not shipped in the product bundle.",
      ),
      license: same("MIT · Apache-2.0"),
      mode: t("빌드 · 개발 전용", "Build · dev only"),
      note: t(
        "Vite 8의 번들러는 Rolldown 1.0.3(전이 의존성). 3D·CRDT 같은 무거운 엔진이 첫 화면 번들로 돌아오면 번들 검사(check-studio-bundle.mjs)가 실패한다. 접근성 검사 axe-core/playwright는 MPL-2.0(개발 전용).",
        "Vite 8 bundles with Rolldown 1.0.3 (a transitive dependency). If heavy engines such as 3D or CRDT creep back into the first-screen bundle, the bundle check (check-studio-bundle.mjs) fails. The accessibility checker axe-core/playwright is MPL-2.0 (dev only).",
      ),
    },
    evidence: ["package.json", "apps/web/vite.config.ts", "apps/web/config/vite-manual-chunks.ts", "scripts/check-studio-bundle.mjs"],
  },
  {
    id: "nestjs-drizzle",
    name: "NestJS · Drizzle ORM",
    status: "live",
    link: { title: "NestJS", url: "https://nestjs.com" },
    asOf: AS_OF,
    cells: {
      role: t(
        "로그인·카탈로그·협업·실시간을 맡는 Core API 서버의 틀(NestJS 11, Express 4)과, 서버가 PostgreSQL 데이터베이스와 대화하는 도구(Drizzle ORM, pg 드라이버).",
        "The frame of the Core API server that handles sign-in, catalog, collaboration and realtime (NestJS 11, Express 4), and the tools the server uses to talk to a PostgreSQL database (Drizzle ORM, the pg driver).",
      ),
      license: same("MIT · Apache-2.0"),
      mode: t("서버(Node)", "Server (Node)"),
      note: t(
        "Render 무료 web service에 수동 release로만 배포한다(자동 배포 off). Express는 4.22.2이고, 전역 8.x 강제는 Express 4 API를 깨뜨린다는 overrides 주석에 따라 path-to-regexp는 버전 계열별로 따로 고정한다. DB 마이그레이션은 별도 체크섬 워크플로로만 실행한다.",
        "Deployed to a free Render web service by manual release only (auto-deploy off). Express is 4.22.2, and an overrides comment says forcing path-to-regexp 8.x globally would break Express 4's API, so it is pinned separately per version line. DB migrations run only through a separate checksum-led workflow.",
      ),
    },
    evidence: ["apps/api/package.json", "apps/api/src/main.ts", "apps/api/src/app.module.ts", "apps/api/drizzle.config.ts", "render.yaml", ".github/workflows/production-database-migrations.yml"],
  },
  {
    id: "socket-io",
    name: "Socket.IO",
    status: "configured",
    link: { title: "Socket.IO", url: "https://socket.io/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "스튜디오 실시간 협업의 서버 전송 통로. 브라우저(socket.io-client)와 NestJS 게이트웨이가 websocket으로 이어지고, 서버가 여러 대일 때를 위한 PostgreSQL 어댑터도 있다.",
        "The server transport for Studio realtime collaboration. The browser (socket.io-client) and a NestJS gateway talk over websocket, and a PostgreSQL adapter exists for multi-server setups.",
      ),
      license: same("MIT"),
      mode: t("websocket · 서버/브라우저", "WebSocket · server and browser"),
      note: t(
        "코드 주석에 따르면 운영에서는 장기 연결 origin을 명시해야만 소켓을 만든다. Render 무료 단일 인스턴스 설정은 클러스터 어댑터를 memory로 둔다. Cloudflare 실시간 경로는 그 위에 목적별로 얹힌다.",
        "A code comment says production creates the socket only when a long-running origin is set explicitly. The Render free single-instance config sets the cluster adapter to memory. The Cloudflare realtime path layers on top by purpose.",
      ),
    },
    evidence: [
      "apps/api/src/modules/creator/studio-live.gateway.ts",
      "apps/api/src/realtime/studio-postgres-io.adapter.ts",
      "apps/web/src/domains/creator/live/studio-live-socket-connection-factory.ts",
      "render.yaml",
    ],
  },
  {
    id: "yjs-automerge",
    name: "Yjs · Automerge",
    status: "live",
    link: { title: "Yjs", url: "https://docs.yjs.dev/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "여러 사람이 같은 컷을 동시에 고쳐도 충돌 없이 합쳐 주는 공동 편집 기술(CRDT). Yjs가 정본이고, Automerge는 오프라인에서 한 변경을 '제안 기록'으로 모으는 선택형 도구다.",
        "Collaborative-editing technology (CRDT) that merges simultaneous edits without conflicts. Yjs is the canonical copy; Automerge only collects offline changes into an optional proposal journal.",
      ),
      license: same("MIT"),
      mode: t("서버·브라우저 · 지연 로드", "Server and browser · lazy"),
      note: t(
        "ADR-0025가 'Yjs가 정본, Automerge는 선택형 오프라인 제안 저널'로 못 박았다. CRDT 런타임이 Studio 첫 화면 번들로 돌아오면 번들 검사가 실패한다. 큰 래스터 이미지는 CRDT에 맞지 않아 따로 저장하는 것이 전제다.",
        "ADR-0025 fixes the split: Yjs canonical, Automerge an optional offline proposal journal. The bundle check fails if the CRDT runtime returns to the Studio first-screen bundle. Large raster images do not suit CRDT and need separate storage.",
      ),
    },
    evidence: [
      "apps/api/src/modules/creator/studio-crdt.service.ts",
      "apps/web/src/domains/creator/live/studio-crdt-document-host.ts",
      "apps/web/src/domains/creator/offline-branch/studio-offline-branch-automerge.ts",
      "docs/adr/0025-skia-retained-document-migration.md",
    ],
  },
  {
    id: "sqlite-wasm",
    name: "SQLite WASM",
    status: "live",
    link: { title: "SQLite WASM", url: "https://sqlite.org/wasm/doc/trunk/index.md" },
    asOf: AS_OF,
    cells: {
      role: t(
        "브라우저 안에 들어 있는 작은 데이터베이스(SQLite). 브러시·필터 라이브러리, 저널·스냅샷, 번역 메모리를 서버 없이 기기 안에 저장하고 검색한다.",
        "A small database that lives inside the browser (SQLite). Brush and filter libraries, journals, snapshots and translation memory are stored and searched on the device without a server.",
      ),
      license: same("Apache-2.0"),
      mode: same("WASM · Worker · OPFS"),
      note: t(
        "패키지는 Apache-2.0, SQLite 본체는 퍼블릭 도메인으로 기록돼 있다. 전용 Worker 한 곳에서 OPFS의 SAH-pool 방식만 켜고 opfs·opfs-wl 설치는 끈다. 'OPFS는 백업이 아니다'라고 조사 문서가 적었다.",
        "The package is Apache-2.0 and the SQLite core is recorded as public domain. A single dedicated Worker enables only the OPFS SAH-pool mode and switches off the opfs and opfs-wl installers. The survey states that OPFS is not a backup.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-local-database.ts",
      "apps/web/src/domains/creator/studio-local-database.worker.ts",
      "apps/web/src/domains/creator/studio-local-database-worker-sqlite-loader.ts",
      "docs/candidates/translation-memory-sqlite/license-deployment.md",
    ],
  },
  {
    id: "multiformats",
    name: "multiformats",
    status: "live",
    link: { title: "js-multiformats", url: "https://github.com/multiformats/js-multiformats" },
    asOf: AS_OF,
    cells: {
      role: t(
        "파일의 '내용 지문'(CID)을 계산하고, 공개 IPFS 게이트웨이에서 받은 바이트가 같은 지문인지 직접 대조한다. 통합 센터의 IPFS 콘텐츠 주소 패널이 쓴다.",
        "Computes a file's content fingerprint (CID) and checks that bytes fetched from a public IPFS gateway match it. The IPFS content-address panel in the integration center uses it.",
      ),
      license: same("Apache-2.0 OR MIT"),
      mode: t("런타임 · 브라우저", "Runtime · browser"),
      note: t(
        "Helia(@helia/verified-fetch)는 전이 의존성 보안 권고가 풀리지 않아 쓰지 않는다 — 지금은 multiformats + 게이트웨이 fetch + 해시 대조다. CID는 raw 단일 블록 주소라 UnixFS 주소와 호환되지 않는다. 게이트웨이가 운영 CSP에서 허용되는지는 확인하지 못했다.",
        "Helia (@helia/verified-fetch) is not used: its transitive security advisories were unresolved. Today it is multiformats plus a gateway fetch plus a hash check. The CID is a raw single-block address and is not compatible with UnixFS addresses. Whether the production CSP allows the gateways is unverified.",
      ),
    },
    evidence: [
      "apps/web/src/domains/integrations/ipfs-content-address.ts",
      "apps/web/src/domains/integrations/IpfsContentAddressPanel.tsx",
      "package.json",
    ],
  },
];

/** 2D 편집·렌더 */
const TWO_D_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "konva",
    name: "Konva · react-konva",
    status: "live",
    link: { title: "Konva", url: "https://konvajs.org/docs/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "편집 캔버스의 '무대'. 레이어·말풍선·텍스트를 고르고 옮기고 변형하는 화면과 포인터 입력을 맡는다(문서 표시·입력·선택 크롬의 단독 소유자).",
        "The stage of the editing canvas. It handles the view where layers, speech bubbles and text are picked, moved and transformed, plus pointer input (sole owner of document display, input and selection chrome).",
      ),
      license: same("MIT"),
      mode: t("런타임 · 정적(전용 청크)", "Runtime · static (own chunk)"),
      note: t(
        "Fabric.js는 Konva와 장면 모델이 겹쳐 도입하지 않았다(README). 캔버스 글자는 폰트가 바뀐 것을 스스로 알아채지 못해, 폰트가 로드되면 다시 그리는 훅이 필요하다(index.html 주석).",
        "Fabric.js was not adopted because its scene model overlaps with Konva (README). Canvas text cannot notice a font swap on its own, so a redraw hook runs after fonts load (index.html comment).",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/canvas/StudioCanvasViewport.tsx",
      "docs/engines/renderer-roles.md",
      "README.md",
      "apps/web/index.html",
    ],
  },
  {
    id: "canvaskit",
    name: "CanvasKit (Skia)",
    status: "live",
    link: { title: "CanvasKit", url: "https://skia.org/docs/user/modules/canvaskit/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "Google의 Skia 그래픽 엔진을 웹용으로 컴파일한 것. 정밀한 벡터 경로 연산·글자·출판급 렌더에 쓰고, 문서의 벡터 영역(WebGL2 표면)을 그린다.",
        "Google's Skia graphics engine compiled for the web. It does precise vector path operations, text and publishing-grade rendering, and draws the document's vector island (a WebGL2 surface).",
      ),
      license: same("BSD-3-Clause"),
      mode: t("WASM · 지연 로드 · Worker", "WASM · lazy · Worker"),
      note: t(
        "wasm 약 7.2MB. 0.41.1로 고정하고 ADR 개정 없이 올리지 않는다(ADR-0004). 조사 문서의 4K 전체 체인 측정(p50 34.3ms)은 60fps 기준에 못 미쳤다 — 측정 환경은 그 문서 참고.",
        "The wasm is about 7.2 MB. Pinned at 0.41.1 and not upgraded without an ADR revision (ADR-0004). The survey's 4K full-chain measurement (p50 34.3 ms) missed the 60 fps gate; see that document for the setup.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/render/studio-canvaskit-quality-engine.ts",
      "packages/studio-engine-skia/src/document-renderer.ts",
      "docs/adr/0004-2d-baseline-canvaskit-plus-vello-cpu.md",
      "docs/candidates/engine-portfolio/capability-survey.md",
    ],
  },
  {
    id: "pixijs",
    name: "PixiJS",
    status: "live",
    link: { title: "PixiJS", url: "https://pixijs.com/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "Konva 위에 투명 캔버스를 겹쳐, 선택 영역 오버레이(마우스 올림 강조·클릭 영역·변형 핸들)를 GPU로 그린다.",
        "A transparent canvas layered over Konva that draws the selection overlay (hover highlight, hit areas, transform handles) on the GPU.",
      ),
      license: same("MIT"),
      mode: t("런타임 · 지연 로드", "Runtime · lazy"),
      note: t(
        "문서·브러시 픽셀의 권위는 없고 '선택 오버레이 섬'만 단독 소유한다(렌더러 역할 원장). 같은 권위를 두 엔진이 나눠 갖지 않는 것이 이 저장소의 규칙이다(ADR-0003).",
        "It has no authority over document or brush pixels; it is the sole owner of just one thing, the selection-overlay island (renderer role ledger). Never letting two engines share one authority is a rule of this repository (ADR-0003).",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/render/studio-pixi-scene-provider.ts",
      "apps/web/src/domains/creator/StudioPixiSceneOverlayHost.tsx",
      "docs/engines/renderer-roles.md",
      "docs/adr/0003-one-primary-surface-owner.md",
    ],
  },
  {
    id: "perfect-freehand-lazy-brush",
    name: "perfect-freehand · lazy-brush",
    status: "live",
    link: { title: "perfect-freehand", url: "https://github.com/steveruizok/perfect-freehand" },
    asOf: AS_OF,
    cells: {
      role: t(
        "펜 압력과 속도로 굵기가 달라지는 잉크 선의 윤곽을 계산하고(perfect-freehand), 손떨림을 줄여 선이 끈에 끌려오듯 따라오게 한다(lazy-brush).",
        "Computes the outline of an ink line whose width follows pen pressure and speed (perfect-freehand), and smooths hand tremor so the line trails the pen as if pulled on a string (lazy-brush).",
      ),
      license: same("MIT"),
      mode: t("런타임 · 정적", "Runtime · static"),
      note: t(
        "ADR-0009: 출하 잉킹 레인은 Perfect Freehand + Kurbo 프록시이고 Google Ink는 후보다. 연필·수채 같은 자연매체나 복합 브러시를 대신하지는 못한다(조사 문서 E10). lazy-brush는 마우스·펜·터치별로 켜고 끈다.",
        "ADR-0009: the shipping inking lane is Perfect Freehand plus a Kurbo proxy, with Google Ink as a candidate. It cannot replace natural media such as pencil or watercolor, or compound brushes (survey E10). lazy-brush can be toggled per mouse, pen or touch.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-perfect-freehand.ts",
      "apps/web/src/domains/creator/studio-lazy-brush-stabilizer.ts",
      "docs/adr/0009-google-ink-poc-gate-and-fallback.md",
      "docs/candidates/engine-portfolio/capability-survey.md",
    ],
  },
  {
    id: "hokusai",
    name: "Hokusai",
    status: "live",
    link: { title: "Hokusai (reearth)", url: "https://github.com/reearth/hokusai" },
    asOf: AS_OF,
    cells: {
      role: t(
        "연필·목탄·수채·유화처럼 번지고 겹치는 '자연매체' 브러시를 계산하는 Rust 엔진(reearth/hokusai 0.3.0). 얇은 Rust 래퍼를 직접 만들어 WASM으로 빌드하고 Worker에서 돌린다.",
        "A Rust engine (reearth/hokusai 0.3.0) that computes natural-media brushes that blend and layer, such as pencil, charcoal, watercolor and oil. We wrote a thin Rust wrapper, build it to WASM and run it in a Worker.",
      ),
      license: same("MIT OR Apache-2.0"),
      mode: same("Rust → WASM · Worker"),
      note: t(
        "libmypaint와 풀사이즈로 비교한 실측(2026-08-09)에서 수채는 품질 gate를 통과하지 못했고 처리량은 libmypaint의 0.318배(수채)·0.097배(잉크)였다 — 우열을 말하지 않는다. 상류 wasm 래퍼는 흰 바탕 합성 때문에 쓰지 않았다.",
        "In a full-size comparison with libmypaint (2026-08-09) the watercolor profile failed the quality gate and throughput was 0.318x (wash) and 0.097x (ink) of libmypaint's, so we claim no winner. The upstream wasm wrapper is not used because it composites over white.",
      ),
    },
    evidence: [
      "packages/studio-hokusai-wasm/Cargo.toml",
      "packages/studio-hokusai-wasm/README.md",
      "apps/web/src/domains/creator/render/studio-hokusai-natural-media.worker.ts",
      "docs/candidates/engine-portfolio/capability-survey.md",
      "docs/adr/0011-v12-frontier-quarantine-ledger.md",
    ],
  },
  {
    id: "libmypaint",
    name: "libmypaint",
    status: "reference-only",
    link: { title: "libmypaint", url: "https://github.com/mypaint/libmypaint" },
    asOf: AS_OF,
    cells: {
      role: t(
        "오래 쓰여 온 오픈소스 브러시 엔진(MyPaint). 편집기의 기본 그리기 엔진이 아니라, Hokusai 결과를 견주는 '기준선'(parity·golden)과 브러시 스튜디오의 엔진 시험 패널에서만 쓴다.",
        "A long-established open-source brush engine (MyPaint). It is not the editor's default drawing engine; it is the baseline (parity and golden images) for judging Hokusai output and runs in the Brush Studio engine-test panel.",
      ),
      license: same("ISC"),
      mode: t("WASM · 비교·시험 전용", "WASM · comparison and test only"),
      note: t(
        "v1.6.1을 직접 컴파일한 약 83KB wasm이다. 렌더러 역할 원장은 '비교 전용'으로 분류하고 호출부 0건이라 적지만, 엔진 시험 패널의 Worker가 loadLibMypaint를 기본 선택값으로 불러 그 비고와 어긋난다.",
        "A wasm of about 83 KB compiled directly from v1.6.1. The renderer role ledger classes it as comparison-only and notes zero call sites, but the engine-test panel's Worker calls loadLibMypaint for its default choice, which contradicts that note.",
      ),
    },
    evidence: [
      "packages/studio-brush-platform/src/libmypaint/index.ts",
      "apps/web/src/domains/creator/brush/studio-native-brush-probe.worker.ts",
      "apps/web/src/domains/creator/brush/StudioNativeBrushEngineProbe.tsx",
      "docs/engines/renderer-roles.md",
      "docs/adr/0011-v12-frontier-quarantine-ledger.md",
    ],
  },
  {
    id: "vello-thorvg",
    name: "Vello · ThorVG",
    status: "configured",
    link: { title: "Vello", url: "https://github.com/linebender/vello" },
    asOf: AS_OF,
    cells: {
      role: t(
        "Rust로 만든 GPU 벡터 그래픽 엔진 Vello와 SVG·Lottie 전문 엔진 ThorVG. SVG는 그리기 전에 한쪽을 골라 맡기고, 실패해도 다른 엔진으로 자동 전환하지 않는다.",
        "Vello, a GPU vector-graphics engine written in Rust, and ThorVG, a specialist for SVG and Lottie. An SVG is assigned to one of them before drawing, and a failure never triggers an automatic switch to the other engine.",
      ),
      license: same("Apache-2.0 OR MIT · MIT"),
      mode: t("Rust·C++ → WASM · 지연 로드", "Rust and C++ to WASM · lazy"),
      note: t(
        "Vello는 알파 단계라 '명시 선택형' provider이고 /studio의 문서 표시는 Skia WebGL2가 맡는다. Velato(Lottie)는 제품 호출부 0건인 lab이다. ThorVG wasm은 npm 바이트를 그대로 복사해 INTEGRITY.sha256로 고정했다.",
        "Vello is alpha-stage, so it is an explicit-choice provider, and Skia WebGL2 owns document display in /studio. Velato (Lottie) is a lab with zero product call sites. The ThorVG wasm is a byte copy of the npm package, pinned by INTEGRITY.sha256.",
      ),
    },
    evidence: [
      "docs/engines/renderer-roles.md",
      "docs/engines/vello-baseline.md",
      "crates/studio-engine-vello",
      "packages/studio-engine-thorvg/wasm/INTEGRITY.sha256",
      "apps/web/src/domains/creator/studio-svg-product-provider-plan.ts",
    ],
  },
  {
    id: "p5-brush",
    name: "p5.brush",
    status: "configured",
    link: { title: "p5.brush", url: "https://github.com/acamposuribe/p5.brush" },
    asOf: AS_OF,
    cells: {
      role: t(
        "수채 번짐·flow-field(흐름선)·해칭 같은 절차적 아티스틱 브러시. 전용 Worker 안의 숨은 캔버스에서 그린 뒤 결과만 가져온다.",
        "Procedural artistic brushes such as watercolor fills, flow fields and hatching. It draws on a hidden canvas inside a dedicated Worker and hands back only the result.",
      ),
      license: same("MIT"),
      mode: t("Worker · OffscreenCanvas", "Worker · OffscreenCanvas"),
      note: t(
        "p5 본체(LGPL-2.1)는 번들하지 않고 p5.brush/standalone만 쓴다. pnpm 패치 1개로, 같은 시드인데 소프트웨어 WebGL에서 픽셀이 달라지던 비결정성을 없앴다. 모듈 전역 상태 때문에 모든 호출을 한 줄로 세운다.",
        "The p5 core (LGPL-2.1) is not bundled; only p5.brush/standalone is used. One pnpm patch removed nondeterminism that made pixels differ in software WebGL with the same seed. Module-level global state forces every call into a single queue.",
      ),
    },
    evidence: [
      "patches/p5.brush@2.2.1.patch",
      "apps/web/src/domains/creator/brush/studio-p5-brush-standalone-runtime-adapter.ts",
      "scripts/verify-studio-p5-brush-real-runtime.test.ts",
      "docs/engines/renderer-roles.md",
    ],
  },
  {
    id: "mixbox",
    name: "Mixbox",
    status: "live",
    link: { title: "Mixbox", url: "https://scrtwpns.com/mixbox" },
    asOf: AS_OF,
    cells: {
      role: t(
        "물감처럼 섞이는 색 혼합(파랑 + 노랑 = 초록)을 계산하는 안료 혼색 엔진. 브러시 스튜디오 V6의 혼색 provider(mixbox-js-v2) 하나로 쓰인다.",
        "A pigment-mixing engine that blends colors like paint (blue + yellow = green). It serves as one color-mixing provider (mixbox-js-v2) in Brush Studio V6.",
      ),
      license: same("CC-BY-NC-4.0"),
      mode: t("런타임 · 정적 import", "Runtime · static import"),
      note: t(
        "비상업(NC) 라이선스. 저장소의 처리: provider 권리 라벨 noncommercial, 기본 프로파일 noncommercial-full, 2.0.0만 허용하는 감사 핀. 상용 빌드는 제거·비활성 또는 상업 라이선스가 필요하다고 기록했다. 같은 계약의 MIT 대안은 spectral.js·colormix.",
        "Non-commercial (NC) license. The repository's handling: provider rights label noncommercial, default profile noncommercial-full, and an audit pin that allows only 2.0.0. Commercial builds must remove or disable it or buy a commercial license. MIT alternatives behind the same contract: spectral.js and colormix.",
      ),
    },
    evidence: [
      "third_party/mixbox/README.md",
      "apps/web/src/domains/creator/brush-lab/brush-studio-v6-pigment-provider.ts",
      "apps/web/src/domains/creator/brush-lab/brush-studio-v6-license-profile.ts",
      "scripts/generate-third-party-notices.mjs",
      "config/studio-production-toolchain.json",
    ],
  },
  {
    id: "google-ink",
    name: "Google Ink",
    status: "experimental",
    link: { title: "Google Ink", url: "https://github.com/google/ink" },
    asOf: AS_OF,
    cells: {
      role: t(
        "구글의 잉크 브러시 라이브러리. 입력 점을 매끈하게 다듬는 모델러와, 획을 삼각형 메시로 만드는 부분을 WASM으로 직접 빌드해 라이브 잉크 미리보기 코드에 연결했다.",
        "Google's ink-brush library. We build its input modeler, which smooths input points, and its mesh generator, which turns strokes into triangle meshes, to WASM ourselves and wire them into the live ink preview code.",
      ),
      license: same("Apache-2.0"),
      mode: t("C++ → WASM · 자체 빌드", "C++ to WASM · self-built"),
      note: t(
        "레지스트리 판정은 'PoC 후 주력 후보'이고 ADR-0009도 PoC 게이트 뒤 후보로 둔다. 업스트림이 Bazel 전용이라 76개 소스를 em++로 직접 빌드하며, 재빌드에는 저장소 밖 ~/toolchains/ink 클론이 필요해 저장소만으로는 재현되지 않는다.",
        "The registry verdict is 'main candidate after PoC', and ADR-0009 also keeps it a candidate behind a PoC gate. Upstream is Bazel-only, so 76 translation units are built directly with em++, and a rebuild needs a clone at ~/toolchains/ink outside the repository, so it is not reproducible from the repo alone.",
      ),
    },
    evidence: [
      "packages/studio-brush-platform/src/ink-mesh/README.md",
      "packages/studio-brush-platform/src/ink-modeler/README.md",
      "docs/adr/0009-google-ink-poc-gate-and-fallback.md",
      "packages/studio-engine-registry/src/manifest/providers.json",
    ],
  },
  {
    id: "vector-geometry",
    name: "Paper.js · Rough.js · polygon-clipping",
    status: "live",
    link: { title: "Paper.js", url: "https://paperjs.org/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "벡터 도형을 계산하는 수학 도구 모음: 경로 합치기·평탄화(Paper.js), 도형 겹침 연산(polygon-clipping), 곡선 맞춤·단순화(bezier-js·fit-curve·simplify-js), 손으로 그린 듯한 도형(Rough.js).",
        "A kit of vector math: merging and flattening paths (Paper.js), shape overlap operations (polygon-clipping), curve fitting and simplification (bezier-js, fit-curve, simplify-js) and hand-drawn-looking shapes (Rough.js).",
      ),
      license: same("MIT · BSD-2-Clause"),
      mode: t("런타임 · 지연 로드", "Runtime · lazy"),
      note: t(
        "Paper.js는 PaperScope 하나에 가두고 작업마다 Project를 만들어 끝나면 지워, 라이브러리 객체가 경계 밖으로 나가지 않는다. Rough.js는 도형의 '스케치 표현'을 단독으로 맡는다(원장).",
        "Paper.js is confined to one PaperScope, and each job creates and then removes a Project, so library objects never cross the boundary. Rough.js solely owns the sketch presentation of shapes (ledger).",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/render/studio-engine-vector-geometry-provider.ts",
      "apps/web/src/domains/creator/studio-path-boolean.ts",
      "apps/web/src/domains/creator/studio-vector-ink-geometry.ts",
      "apps/web/src/domains/creator/studio-rough-shape.ts",
    ],
  },
  {
    id: "phaser",
    name: "Phaser",
    status: "live",
    link: { title: "Phaser", url: "https://phaser.io/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "가상 스튜디오(2D 월드)의 이동·카메라·충돌·말 걸기를 맡는 2D 게임 엔진. 월드 내용은 Tiled JSON과 WorldManifest로 분리해 둔다.",
        "A 2D game engine for movement, camera, collisions and interactions in the virtual studio (a 2D world). World content is kept apart in Tiled JSON and a WorldManifest.",
      ),
      license: same("MIT"),
      mode: t("런타임 · 동적 import", "Runtime · dynamic import"),
      note: t(
        "문서는 'Phaser는 표시만' 맡는다고 못 박고 권한·승인은 별도 시스템(ADR-0022)이 가진다. 렌더러 역할 원장의 범위 밖이다.",
        "The docs state that Phaser only displays; permissions and approvals belong to a separate system (ADR-0022). It sits outside the renderer role ledger.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/virtual-space/StudioVirtualSpacePhaserCanvas.tsx",
      "docs/studio/virtual-studio-world-authoring.md",
      "docs/studio/virtual-studio-benchmark-20260920.md",
    ],
  },
];

/** 3D */
const THREE_D_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "three-js",
    name: "three.js · three-vrm · React Three Fiber",
    status: "live",
    link: { title: "three.js", url: "https://threejs.org/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "브라우저에서 3D 장면(배경·마네킹·포즈)을 그리는 라이브러리(three.js), VRM 캐릭터 파일을 읽어 표정·뼈대를 움직이는 부품(three-vrm), 이를 React 방식으로 쓰게 해 주는 R3F와 drei.",
        "A library that draws 3D scenes in the browser (backgrounds, mannequins, poses), the part that reads VRM character files and drives expressions and bones (three-vrm), and R3F with drei, which let React drive it.",
      ),
      license: same("MIT"),
      mode: t("지연 로드 · WebGL2", "Lazy · WebGL2"),
      note: t(
        "3D 런타임이 Studio 첫 화면 번들로 돌아오면 번들 검사가 실패한다. 캐릭터 경로는 MToon 색 차이(최대 125/255) 때문에 WebGL2로 고정했다(ADR-0026). R3F는 pnpm 패치를 받았다. 번들 VRM 모델은 각자 이용조건이 LICENSES.md에 있다.",
        "The bundle check fails if the 3D runtime returns to the Studio first-screen bundle. The character path is pinned to WebGL2 because MToon colors differ by up to 125/255 between WebGPU and WebGL2 (ADR-0026). R3F carries a pnpm patch. Each bundled VRM model lists its own terms in LICENSES.md.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/bg3d/studio-bg3d-shared-vrm-runtime.ts",
      "apps/web/src/domains/creator/vrm/StudioVrmPoserViewport.tsx",
      "apps/web/public/vrm/LICENSES.md",
      "docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md",
      "patches/@react-three__fiber@9.6.1.patch",
      "scripts/check-studio-bundle.mjs",
    ],
  },
  {
    id: "babylon-js",
    name: "Babylon.js",
    status: "live",
    link: { title: "Babylon.js", url: "https://www.babylonjs.com/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "또 하나의 3D 엔진. 제품에서는 배경 3D의 법선(표면 방향) 맵과 산출물을 뽑는 '스페셜리스트'로만 쓰고, 실험 앱 character-lab에서는 주 엔진이다.",
        "A second 3D engine. In the product it is used only as a specialist that extracts normal maps (surface direction) and output artifacts for the 3D background; in the experimental character-lab app it is the main engine.",
      ),
      license: same("Apache-2.0"),
      mode: t("지연 로드 · 단일 청크", "Lazy · single chunk"),
      note: t(
        "번들 검사가 앱 진입점·Studio 경로·배경 3D 편집기에 Babylon이 정적으로 들어오는 것을 막는다. 실험 앱은 운영 배포 대상이 아니며 ADR-0026은 Proposed 상태다. 비교 대상 PlayCanvas가 운영 산출물에 섞여도 번들 검사가 실패한다.",
        "The bundle check blocks Babylon from entering the app entry, Studio routes or the 3D background editor statically. The experimental app is not a production deploy target and ADR-0026 is Proposed. The bundle check also fails if the evaluated engine PlayCanvas leaks into production output.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/bg3d/studio-bg3d-babylon-specialist-entry.ts",
      "scripts/check-studio-bundle.mjs",
      "apps/web/config/vite-manual-chunks.ts",
      "docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md",
      "docs/reports/character-lab-engine-alternatives-2026-10-01.md",
    ],
  },
  {
    id: "gltf-transform-stack",
    name: "glTF Transform · meshoptimizer · ktx2-encoder",
    status: "live",
    link: { title: "glTF Transform", url: "https://gltf-transform.dev/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "3D 모델 파일(GLB)을 가볍게 만드는 도구들: 구조 편집·압축(glTF Transform), 멀리 있는 물체를 단순하게 보이는 단계별 모델(LOD)과 압축(meshoptimizer), 텍스처 압축(KTX2). BG3D 프로 스위트의 에셋 도구 패널에서 Worker로 돌린다.",
        "Tools that slim down 3D model files (GLB): structure editing and compression (glTF Transform), distance-based simplified versions (LOD) and compression (meshoptimizer), and texture compression (KTX2). They run in a Worker from the asset tools panel of the BG3D Pro suite.",
      ),
      license: same("MIT"),
      mode: t("Worker · 작업마다 1개", "Worker · one per job"),
      note: t(
        "pnpm 패치 2개: glTF Transform은 Function()을 쓰는 이미지 커널을 호출할 때 불러오게 미루고, ktx2-encoder는 new Function 2곳을 걷어냈다(운영 CSP에 unsafe-eval이 없다). 실측은 합성 샘플 기준이라 임의 자산으로 일반화하지 않는다.",
        "Two pnpm patches: glTF Transform defers an image kernel that uses Function() until it is called, and ktx2-encoder drops two new Function sites (production CSP has no unsafe-eval). Measurements use synthetic samples and must not be generalized to arbitrary assets.",
      ),
    },
    evidence: [
      "patches/@gltf-transform__functions@4.4.2.patch",
      "patches/ktx2-encoder@0.6.0.patch",
      "apps/web/src/domains/creator/scene3d/specialists/specialist-assets.ts",
      "apps/web/src/domains/creator/scene3d/specialists/specialist.worker.ts",
      "docs/reports/studio-scene3d-specialist-toolchain-2026-09-19.md",
    ],
  },
  {
    id: "manifold-csg",
    name: "Manifold · three-bvh-csg",
    status: "live",
    link: { title: "Manifold", url: "https://github.com/elalish/manifold" },
    asOf: AS_OF,
    cells: {
      role: t(
        "3D 도형을 합치고 빼고 겹친 부분만 남기는 불리언 연산. 빠른 미리보기는 three-bvh-csg, 구멍 없이 단단한 결과가 필요하면 Manifold(WASM)를 쓴다.",
        "Boolean operations that merge, subtract or intersect 3D shapes. three-bvh-csg gives a fast preview; Manifold (WASM) is used when a watertight, solid result is needed.",
      ),
      license: same("Apache-2.0 · MIT"),
      mode: t("WASM · Worker", "WASM · Worker"),
      note: t(
        "manifold-3d는 pnpm 패치로 new Function 2곳을 정적 코드로 바꿔(패치 전 2건, 후 0건) unsafe-eval 없이 돈다. 운영 CSP가 허용하는 것은 wasm-unsafe-eval뿐이기 때문이다.",
        "A pnpm patch replaces two new Function sites in manifold-3d with static code (2 before, 0 after), so it runs without unsafe-eval. The production CSP allows only wasm-unsafe-eval.",
      ),
    },
    evidence: [
      "patches/manifold-3d@3.5.1.patch",
      "apps/web/src/domains/creator/studio-manifold-mesh-provider.ts",
      "apps/web/src/domains/creator/scene3d/specialists/specialist-csg.ts",
      "apps/web/public/_headers",
    ],
  },
  {
    id: "rapier-recast-ik",
    name: "Rapier · recast-navigation · closed-chain-ik",
    status: "live",
    link: { title: "Rapier", url: "https://rapier.rs/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "3D 속 움직임 계산: 충돌·중력 같은 물리(Rapier), 걸어 다닐 수 있는 길 만들기(recast-navigation), 관절을 자연스럽게 구부려 자세를 맞추는 IK 풀이(closed-chain-ik).",
        "Motion math in 3D: physics such as collisions and gravity (Rapier), generating walkable paths (recast-navigation) and IK solving that bends joints naturally to reach a pose (closed-chain-ik).",
      ),
      license: same("Apache-2.0 · MIT"),
      mode: t("WASM · Worker", "WASM · Worker"),
      note: t(
        "Rapier는 결정성과 WASM 내장을 갖춘 deterministic-compat 변형이다. ADR-0026은 캐릭터 물리의 1급 엔진을 자체 PBD/XPBD 솔버로 두고 Rapier는 소품·접지 보조로 한정한다(ADR 상태 Proposed).",
        "Rapier is the deterministic-compat variant with embedded WASM. ADR-0026 makes our own PBD/XPBD solver the first-class character physics and limits Rapier to props and ground contact (the ADR is Proposed).",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/bg3d/studio-bg3d-physics.worker.ts",
      "apps/web/src/domains/creator/scene3d/specialists/specialist-navigation.ts",
      "apps/web/src/domains/creator/scene3d/specialists/specialist-ik.ts",
      "docs/adr/0026-labs-experimental-apps-engine-selection-and-promotion.md",
    ],
  },
  {
    id: "cad-model-importers",
    name: "rhino3dm · web-ifc · openskp · Spark",
    status: "live",
    link: { title: "rhino3dm", url: "https://github.com/mcneel/rhino3dm" },
    asOf: AS_OF,
    cells: {
      role: t(
        "다른 프로그램의 3D 파일을 열어 쓰기: Rhino(3DM·NURBS), 건축 모델(IFC), SketchUp(.skp를 GLB로 변환), 그리고 가우시안 스플랫(사진을 3D 점구름처럼 보여 주는 방식) 참고 뷰어(Spark).",
        "Opening 3D files from other programs: Rhino (3DM, NURBS), architectural models (IFC), SketchUp (.skp converted to GLB), and a reference viewer for Gaussian splats, a way of showing photos as a 3D point cloud (Spark).",
      ),
      license: same("MIT · MPL-2.0"),
      mode: t("WASM · 지연 로드", "WASM · lazy"),
      note: t(
        "web-ifc는 MPL-2.0이라 파일 단위로 공개 의무가 붙는다. 수정하지 않고 쓰며, 수정 여부를 기록하고 소스 제공 의무를 배포 전에 확인한다고 설계 문서가 적었다. Spark는 참고 뷰어로만 연결돼 있다.",
        "web-ifc is MPL-2.0, whose disclosure duty applies per file. It is used unmodified, and the design doc says to record whether MPL files were modified and to check source-availability duties before release. Spark is wired only as a reference viewer.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-rhino3dm-nurbs.ts",
      "apps/web/src/domains/creator/studio-web-ifc-city.ts",
      "apps/web/src/domains/creator/bg3d/studio-bg3d-skp-converter.ts",
      "apps/web/src/domains/creator/scene3d/specialists/splat-reference-runtime.ts",
      "docs/studio-hybrid-dcc-engine-architecture-2026-08-02.md",
    ],
  },
  {
    id: "opencascade-js",
    name: "opencascade.js",
    status: "live",
    link: { title: "opencascade.js", url: "https://github.com/donalffons/opencascade.js" },
    asOf: AS_OF,
    cells: {
      role: t(
        "산업용 CAD 엔진(OpenCascade)을 WASM으로 옮긴 것. 정밀한 불리언·질량 계산이 필요할 때만 쓰는 선택형 provider로, 하이브리드 DCC 작업공간이 지연 로드한다.",
        "The industrial CAD engine OpenCascade compiled to WASM. An optional provider for precise booleans and mass properties, lazy-loaded by the hybrid DCC workspace.",
      ),
      license: same("LGPL-2.1-only"),
      mode: t("WASM · 지연 로드 · 비수정", "WASM · lazy · unmodified"),
      note: t(
        "LGPL이라 비수정 npm 아티팩트를 독립 모듈로 두고 교체·재빌드 절차를 문서에 적었다. wasm이 약 65.9MB라 정적 자산 한도(25MiB)를 넘어 R2에서 압축 서빙한다. 문서에 '법무 최종 확인 대기'가 적혀 있다.",
        "Because it is LGPL, the unmodified npm artifact stays an independent module and the docs record how to replace or rebuild it. The wasm is about 65.9 MB, over the 25 MiB static-asset limit, so it is served compressed from R2. The doc says legal review is pending final counsel confirmation.",
      ),
    },
    evidence: [
      "docs/third-party/opencascade-lgpl.md",
      "apps/web/src/domains/creator/studio-occt-wasm-facade.ts",
      "deploy/cloudflare-static/README.md",
    ],
  },
  {
    id: "bvh-xatlas-unconnected",
    name: "three-mesh-bvh · xatlasjs",
    status: "experimental",
    link: { title: "three-mesh-bvh", url: "https://github.com/gkjohnson/three-mesh-bvh" },
    asOf: AS_OF,
    cells: {
      role: t(
        "3D 광선 맞추기 가속(three-mesh-bvh)과 UV 자동 펼치기(xatlas — 3D 표면을 2D 그림판 위로 펴는 일). 둘 다 provider와 테스트까지 만들었지만 제품 화면에는 아직 연결하지 않았다.",
        "Ray-casting acceleration for 3D (three-mesh-bvh) and automatic UV unwrapping (xatlas, which flattens a 3D surface onto a 2D sheet). Both have providers and tests, but neither is wired into a product screen yet.",
      ),
      license: same("MIT"),
      mode: t("Worker · 제품 미연결", "Worker · not wired in"),
      note: t(
        "앱 진입점에서 import를 따라가도 닿지 않는다(2026-10-07 스캔). three-mesh-bvh는 테스트·벤치마크 하니스만, xatlas는 자기 폴더 안에서만 쓰인다. 그래서 '쓰고 있다'고 말하지 않는다.",
        "Following imports from the app entry never reaches them (scan of 2026-10-07). three-mesh-bvh appears only in tests and a benchmark harness, and xatlas only inside its own folder. So we do not say they are in use.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-three-mesh-bvh-provider.ts",
      "apps/web/src/domains/creator/xatlas-uv/studio-xatlas-uv-provider.ts",
      "apps/web/src/domains/creator/xatlas-uv/studio-xatlas-uv-provider.worker.ts",
    ],
  },
];

/** AI·비전 */
const AI_VISION_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "onnxruntime-web",
    name: "ONNX Runtime Web",
    status: "live",
    link: { title: "ONNX Runtime Web", url: "https://onnxruntime.ai/docs/tutorials/web/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "AI 모델을 서버 없이 내 기기에서 실행하는 엔진. 배경 제거(U-2-Netp), 선화 채색(Tag2Pix), 업스케일(Real-ESRGAN), 윤곽 추출(TEED), 애니풍 변환(AnimeGANv2)에 쓴다.",
        "An engine that runs AI models on your own device without a server: background removal (U-2-Netp), line-art colorizing (Tag2Pix), upscaling (Real-ESRGAN), edge extraction (TEED) and anime-style conversion (AnimeGANv2).",
      ),
      license: t("MIT (모델은 파일별)", "MIT (models: per file)"),
      mode: t("WASM·WebGPU · 지연 로드", "WASM and WebGPU · lazy"),
      note: t(
        "모델 파일 6개(합계 119,438,571B)가 저장소 안에 있고, 바이트 길이와 SHA-256을 확인한 뒤 실행한다. 모델별 원본·라이선스·학습 데이터는 *.LICENSE.md에 기록했다. WebGPU 또는 WASM(CPU)으로 돌고 결과에 어느 쪽인지 남긴다.",
        "Six model files (119,438,571 bytes in total) live in the repository and run only after their byte length and SHA-256 are checked. Each model's origin, license and training data are recorded in a *.LICENSE.md. It runs on WebGPU or WASM (CPU) and the result records which one.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-onnx-runtime-assets.ts",
      "apps/web/src/domains/creator/studio-onnx-inference-provider.ts",
      "apps/web/src/domains/creator/assets/u2netp.LICENSE.md",
      "apps/web/src/domains/creator/assets/tag2pix.LICENSE.md",
    ],
  },
  {
    id: "transformers-js",
    name: "Transformers.js",
    status: "configured",
    link: { title: "Transformers.js", url: "https://github.com/huggingface/transformers.js" },
    asOf: AS_OF,
    cells: {
      role: t(
        "한글 검색어를 영어로 번역하는 작은 언어 모델(OPUS-MT)을 브라우저에서 돌린다. 해외 소재 검색의 '모델 단계'이고, 모델이 없으면 사전과 원문으로 대신한다.",
        "Runs a small translation model (OPUS-MT) in the browser to turn Korean search words into English. It is the model step of the overseas-asset search, and without the model the search falls back to a dictionary and the original text.",
      ),
      license: same("Apache-2.0"),
      mode: t("WASM · 지연 로드 · 자체 호스팅", "WASM · lazy · self-hosted"),
      note: t(
        "모델 약 123MB는 저장소에 없고 배포할 때 dist/models/Xenova/opus-mt-ko-en/에 두어야 켜진다. 배치 스크립트를 저장소에서 찾지 못해, 실제 배포에서 켜져 있는지는 확인하지 못했다.",
        "The model (about 123 MB) is not in the repository and only turns on when placed under dist/models/Xenova/opus-mt-ko-en/ at deploy time. We found no placement script, so whether it is on in the real deployment is unverified.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator-resources/research-query-mt.ts",
      "apps/web/src/domains/creator-resources/research-query-translation.ts",
      "package.json",
    ],
  },
  {
    id: "mediapipe",
    name: "MediaPipe Tasks Vision",
    status: "live",
    link: { title: "MediaPipe", url: "https://developers.google.com/edge/mediapipe/solutions/guide" },
    asOf: AS_OF,
    cells: {
      role: t(
        "웹캠으로 얼굴·손·자세를 읽어 VRM 마네킹을 움직이고, 사진에서 배경을 분리하고(selfie segmenter), 아바타 참고 이미지를 숫자 벡터(임베딩)로 바꿔 비슷한 것을 찾는다.",
        "Reads face, hands and pose from a webcam to drive a VRM mannequin, separates backgrounds in photos (selfie segmenter), and turns avatar reference images into number vectors (embeddings) to find similar ones.",
      ),
      license: same("Apache-2.0"),
      mode: t("WASM · 지연 로드 · 모델 다운로드", "WASM · lazy · model download"),
      note: t(
        "WASM은 같은 출처의 해시 자산이지만 모델 파일은 Google 스토리지에서 런타임에 내려받는다. SHA-256으로 고정된 것은 임베더 1개뿐이고 배경 분리 모델은 latest 리비전이라, '전부 로컬'이라고 말할 수 없다.",
        "The WASM is a same-origin hashed asset, but model files are downloaded from Google storage at runtime. Only the embedder is pinned by SHA-256, and the background-segmentation model uses the latest revision, so we cannot say everything is local.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-mediapipe-vision-assets.ts",
      "apps/web/src/domains/creator/studio-bg-remove.ts",
      "apps/web/src/domains/creator/vrm/studio-vrm-webcam-tracking.ts",
    ],
  },
  {
    id: "opencv-js",
    name: "OpenCV.js",
    status: "live",
    link: { title: "OpenCV.js", url: "https://github.com/TechStark/opencv-js" },
    asOf: AS_OF,
    cells: {
      role: t(
        "널리 쓰이는 컴퓨터 비전 도구 OpenCV를 WASM으로 옮긴 것. 마스크에서 윤곽선을 찾아 경로(벡터)로 바꾸는 이미지→벡터 변환에 쓴다.",
        "The widely used computer-vision toolkit OpenCV compiled to WASM. It finds contours in a mask and converts them into vector paths for image-to-vector conversion.",
      ),
      license: same("Apache-2.0"),
      mode: t("WASM · 지연 로드", "WASM · lazy"),
      note: t(
        "OpenCV 객체(Embind 핸들)를 만든 역순으로 모두 지워 메모리 누수를 막고, 입력은 가로세로 8,192px로 제한한다. 스마트 선택용 Worker 경로는 제품 화면에 연결되지 않았다. 설치본 opencv.js는 약 13.3MB.",
        "Every OpenCV object (Embind handle) is deleted in reverse creation order to prevent memory leaks, and input is capped at 8,192 px per side. The Worker path for smart selection is not wired into a product screen. The installed opencv.js is about 13.3 MB.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-opencv-selection.ts",
      "apps/web/src/domains/creator/studio-image-trace.ts",
      "apps/web/src/domains/creator/StudioRasterVectorizeButton.tsx",
    ],
  },
];

/** 출력·변환 */
const OUTPUT_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "wasm-vips",
    name: "wasm-vips",
    status: "live",
    link: { title: "wasm-vips", url: "https://github.com/kleisauke/wasm-vips" },
    asOf: AS_OF,
    cells: {
      role: t(
        "libvips(이미지 처리 라이브러리)를 WASM으로 옮긴 것. 한 변이 8192px를 넘고 16,384² 화소 이내인 초대형 페이지를 최종 내보낼 때 Lanczos3 방식으로 줄이는 데 쓴다.",
        "libvips (an image-processing library) compiled to WASM. It downsizes very large pages, over 8192 px on a side and within 16,384² pixels, with the Lanczos3 kernel during final export.",
      ),
      license: t("MIT (내장 libvips는 LGPL)", "MIT (bundled libvips: LGPL)"),
      mode: t("WASM · 지연 로드 · 내보내기", "WASM · lazy · export"),
      note: t(
        "래퍼는 MIT지만 내장 libvips·libheif 등은 LGPL이다. 고지 생성기는 THIRD-PARTY-NOTICES.md를 수집하지 않아 생성 고지에는 MIT로만 나온다. 레지스트리는 'LGPL 격리 필수·dev-only 후보'인데 코드상 내보내기에서 도달한다.",
        "The wrapper is MIT, but the bundled libvips, libheif and others are LGPL. The notice generator does not collect THIRD-PARTY-NOTICES.md, so the generated notice shows MIT only. The registry says LGPL isolation is required and it is a dev-only candidate, yet export code can reach it.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/export/studio-vips-export.ts",
      "apps/web/src/domains/creator/render/studio-raster-export-orchestration-runtime.ts",
      "packages/studio-engine-registry/src/filter-providers.ts",
      "scripts/generate-third-party-notices.mjs",
    ],
  },
  {
    id: "psd-pdf-formats",
    name: "ag-psd · pdf-lib · pdf.js",
    status: "live",
    link: { title: "ag-psd", url: "https://github.com/Agamnentzar/ag-psd" },
    asOf: AS_OF,
    cells: {
      role: t(
        "다른 프로그램과 주고받는 파일: Photoshop PSD 레이어 내보내기·가져오기와 ABR 브러시 가져오기(ag-psd), PDF 조립·편집(pdf-lib), PDF 보기·썸네일(pdf.js).",
        "Files exchanged with other programs: Photoshop PSD layer export and import plus ABR brush import (ag-psd), PDF assembly and editing (pdf-lib), and PDF viewing and thumbnails (pdf.js).",
      ),
      license: same("MIT · Apache-2.0"),
      mode: t("런타임 · 지연 로드", "Runtime · lazy"),
      note: t(
        "ag-psd는 pnpm 패치 1개로 ABR 오류 경로의 Node 전용 require('util')를 걷어냈다(브라우저 호환). 이 패치의 전용 회귀 테스트는 찾지 못했다.",
        "One pnpm patch removes a Node-only require('util') from ag-psd's ABR error path (browser compatibility). We found no dedicated regression test for that patch.",
      ),
    },
    evidence: [
      "patches/ag-psd@31.0.1.patch",
      "apps/web/src/domains/creator/export/studio-psd-export.ts",
      "apps/web/src/domains/creator/studio-abr-import.ts",
      "apps/web/src/domains/creator/pdf-workbench/pdf-workbench-engine.ts",
    ],
  },
  {
    id: "remotion",
    name: "Remotion",
    status: "live",
    link: { title: "Remotion", url: "https://www.remotion.dev/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "React로 영상을 만드는 도구. 공개 '제품 투어' 영상을 웹에서 재생하고(@remotion/player), 홍보·브랜드 영상을 렌더하는 별도 도구에도 쓴다.",
        "A tool for making video with React. It plays the public product-tour video on the web (@remotion/player) and also powers a separate tool that renders promo and brand films.",
      ),
      license: t("Remotion License(SPDX 아님)", "Remotion License (not an SPDX ID)"),
      mode: t("런타임 · 마케팅 페이지", "Runtime · marketing page"),
      note: t(
        "자격 조건에 따라 무료 사용 또는 Company License가 필요한 자체 라이선스다. 저장소는 패키지·버전·라이선스 문구 해시를 고정해 감시하지만, 배포 법인이 대상인지는 저장소로 확인할 수 없다.",
        "A custom license: free use depending on eligibility, otherwise a Company License. The repository pins the package, version and license-text hash and audits them, but whether the distributing entity qualifies cannot be verified from the repository.",
      ),
    },
    evidence: [
      "THIRD_PARTY_NOTICES.md",
      "apps/web/src/domains/marketing/ProductTourPlayer.tsx",
      "scripts/generate-third-party-notices.mjs",
    ],
  },
  {
    id: "resvg-harfbuzz",
    name: "resvg · HarfBuzz",
    status: "experimental",
    link: { title: "resvg", url: "https://github.com/linebender/resvg" },
    asOf: AS_OF,
    cells: {
      role: t(
        "SVG 그림을 픽셀로 바꾸는 엔진(resvg)과 한글·세로쓰기 글자 모양을 잡는 엔진(HarfBuzz). 각각을 감싸는 provider 모듈과 테스트까지 만들었다.",
        "An engine that turns SVG drawings into pixels (resvg) and one that shapes Korean and vertical-writing glyphs (HarfBuzz). Each has a wrapping provider module and tests.",
      ),
      license: same("MPL-2.0 · MIT"),
      mode: t("WASM · 제품 미연결", "WASM · not wired in"),
      note: t(
        "제품 코드가 이 provider들을 import하지 않는다(2026-10-07 스캔). SVG는 Vello 또는 ThorVG를 사전 계획으로 고르고, resvg는 시각 비교용 QA 기준일 뿐이다. HarfBuzz는 나중에 따로 고를 수 있는 후보로 주석에 적혀 있다.",
        "Product code does not import these providers (scan of 2026-10-07). An SVG is planned onto Vello or ThorVG beforehand, and resvg is only a QA reference for visual comparison. A code comment lists HarfBuzz as a candidate that could be selected separately later.",
      ),
    },
    evidence: [
      "apps/web/src/domains/creator/studio-resvg-svg-provider.ts",
      "apps/web/src/domains/creator/studio-harfbuzz-shaping-provider.ts",
      "apps/web/src/domains/creator/studio-interchange-capabilities.ts",
      "apps/web/src/domains/creator/render/studio-canvaskit-quality-engine.ts",
    ],
  },
];

/** 패치·포크·자체 기여 */
const PATCH_FORK_OWN_ROWS: readonly EngineeringMapRow[] = [
  {
    id: "pnpm-patches-overrides",
    name: "pnpm patches · overrides",
    status: "live",
    link: { title: "pnpm patch", url: "https://pnpm.io/cli/patch" },
    asOf: AS_OF,
    cells: {
      role: t(
        "설치된 라이브러리를 정확한 버전에 묶어 고쳐 쓴 기록(패치 8개)과, 하위 의존성의 버전을 강제로 정한 규칙(override 50개 — 대부분 보안 권고 대응, 일부는 도구 버전 통일). 설치할 때 pnpm이 자동으로 적용한다.",
        "Records of installed libraries edited at exact versions (8 patches) and rules that force sub-dependency versions (50 overrides, mostly answering security advisories and some aligning tool versions). pnpm applies both automatically at install time.",
      ),
      license: t("원본 라이선스를 따름", "Follows each original"),
      mode: t("설치 단계(pnpm)", "Install step (pnpm)"),
      note: t(
        "패치 8개: 운영 CSP 호환 3(glTF Transform·manifold-3d·ktx2-encoder), 브라우저 호환 1(ag-psd), R3F 1, 결정성 1(p5.brush), 보안 호환 2(braces·minimatch). 상류에 낸 PR은 저장소에서 찾지 못했다.",
        "The 8 patches: production-CSP compatibility 3 (glTF Transform, manifold-3d, ktx2-encoder), browser compatibility 1 (ag-psd), R3F 1, determinism 1 (p5.brush) and security compatibility 2 (braces, minimatch). We found no upstream PR in the repository.",
      ),
    },
    evidence: [
      "pnpm-workspace.yaml",
      "patches/@react-three__fiber@9.6.1.patch",
      "patches/minimatch@3.1.5.patch",
      "scripts/minimatch-security-compat.test.mjs",
    ],
  },
  {
    id: "wgpu-toon",
    name: "wgpu-toon",
    status: "configured",
    link: { title: "wgpu", url: "https://github.com/gfx-rs/wgpu" },
    asOf: AS_OF,
    cells: {
      role: t(
        "Rust 그래픽 라이브러리 wgpu 29.0.4에 패치 1개를 얹은 벤더 포크. 페이지가 이미 가진 GPU 장치를 wgpu가 넘겨받게 해, 그림 데이터를 CPU로 되읽지 않고 같은 장치 안에서 쓴다.",
        "A vendored fork of the Rust graphics library wgpu 29.0.4 with one patch. It lets wgpu adopt the GPU device the page already owns, so image data is used on the same device instead of being read back to the CPU.",
      ),
      license: same("MIT OR Apache-2.0"),
      mode: t("Rust · 벤더 포크 · 피처 뒤", "Rust · vendored fork · behind a feature"),
      note: t(
        "변경은 모두 toon-fabric 피처 뒤에 있다. 실측(2026-08-08, Chromium 140 headless): 교환 비용 1.89~2.43배 개선, 읽은 바이트는 기존 경로와 일치. 상류 PR 후보로만 기록했고 실제 제출 근거는 못 찾았다.",
        "Every change sits behind the toon-fabric feature. Measured on 2026-08-08 in Chromium 140 headless: exchange cost improved 1.89x to 2.43x and the bytes read matched the old path. It is recorded only as an upstream PR candidate; we found no evidence it was submitted.",
      ),
    },
    evidence: [
      "crates/vendor/wgpu-toon/PATCHES/0001-webgpu-handle-adoption.patch",
      "crates/vendor/wgpu-toon/UPSTREAM.sha256",
      "docs/engines/vello-baseline.md",
      "tests/benchmarks/results/toon-vello-fork.json",
      "crates/studio-engine-vello/tests/vendor_patch_parity.rs",
    ],
  },
  {
    id: "own-wasm-builds",
    name: "Emscripten · wasm-pack builds",
    status: "live",
    link: { title: "Emscripten", url: "https://emscripten.org/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "직접 컴파일한 WASM들. Google Ink·libmypaint는 C++를 Emscripten으로, Hokusai 래퍼·Vello 어댑터는 Rust를 wasm-pack으로 빌드했고, ThorVG는 npm의 wasm을 바이트 그대로 복사했다.",
        "WASM binaries we compile ourselves: Google Ink and libmypaint from C++ with Emscripten, and the Hokusai wrapper and Vello adapter from Rust with wasm-pack, while ThorVG's wasm is a byte-for-byte copy from npm.",
      ),
      license: t("원본 따름(Apache-2.0·ISC·MIT 등)", "Per upstream (Apache-2.0, ISC, MIT, ...)"),
      mode: t("빌드 · 해시 고정", "Build · hash-pinned"),
      note: t(
        "산출물마다 INTEGRITY.sha256를 두고 verify-studio-engine.mjs가 검증하며, Hokusai는 --rebuild로 바이트가 같은지까지 확인한다. 다만 Ink 재빌드는 저장소 밖 ~/toolchains/ink가 있어야 해 저장소만으로는 재현되지 않는다.",
        "Each artifact has an INTEGRITY.sha256 checked by verify-studio-engine.mjs, and Hokusai is also rebuilt with --rebuild to confirm identical bytes. The Ink rebuild, however, needs ~/toolchains/ink outside the repository, so it is not reproducible from the repo alone.",
      ),
    },
    evidence: [
      "packages/studio-hokusai-wasm/pkg/INTEGRITY.sha256",
      "packages/studio-engine-thorvg/wasm/INTEGRITY.sha256",
      "scripts/verify-studio-engine.mjs",
      "scripts/verify-studio-hokusai-wasm.mjs",
      "packages/studio-brush-platform/src/ink-mesh/README.md",
    ],
  },
  {
    id: "hand-ported-code",
    name: "dli/paint · croquis.js · Klecks · open-km",
    status: "live",
    link: { title: "dli/paint", url: "https://github.com/dli/paint" },
    asOf: AS_OF,
    cells: {
      role: t(
        "MIT 오픈소스의 알고리즘을 우리 환경(TypeScript·WGSL)에 맞게 손으로 옮기거나 다시 구현한 코드: 물감 셰이더, 캡슐 펜, 필터 커널, 혼색 수학. 원문 라이선스는 고지에 그대로 내장한다.",
        "Code where we hand-ported or reimplemented algorithms from MIT-licensed open source for our own environment (TypeScript and WGSL): paint shaders, a capsule pen, filter kernels and color-mixing math. The original license texts are embedded in the notices.",
      ),
      license: t("MIT (원문 내장)", "MIT (text embedded)"),
      mode: t("자체 코드 · 고지 내장", "In-house code · notice embedded"),
      note: t(
        "Krita 분무 수식은 'math only, no code copy'로 GPL 코드를 가져오지 않았다. inkwash는 소유자 허락만 있고 근거 기록은 TODO라 '이식 안 함, 연구만'으로 적혀 있다. WebGL-Fluid-Simulation 원문은 third_party에 있으나 고지 내장 목록에는 없다.",
        "The Krita spray formula is 'math only, no code copy', so no GPL code was taken. For inkwash only the owner's permission exists and the evidence record is a TODO, so it is listed as research only, nothing ported. The WebGL-Fluid-Simulation license text sits in third_party but not in the embedded notice list.",
      ),
    },
    evidence: [
      "third_party/dli-paint/LICENSE",
      "scripts/generate-third-party-notices.mjs",
      "apps/web/src/domains/creator/studio-oss-brush-kernels.ts",
      "third_party/inkwash/README.md",
      "third_party/webgl-fluid-simulation/LICENSE",
    ],
  },
  {
    id: "toonbridge",
    name: "Local ToonBridge",
    status: "configured",
    asOf: AS_OF,
    cells: {
      role: t(
        "G'MIC·GEGL·Blender·Inkscape·FFmpeg 같은 외부 프로그램 25종을 서비스에 넣지 않고, 사용자가 자기 PC에 설치한 것을 로컬 브리지로만 호출하는 연결 장치.",
        "A connector that never ships 25 external programs such as G'MIC, GEGL, Blender, Inkscape and FFmpeg; it only calls the copies users installed on their own PC through a local bridge.",
      ),
      license: t("혼합(GPL·AGPL·LGPL 등)", "Mixed (GPL, AGPL, LGPL, ...)"),
      mode: t("별도 프로세스 · 로컬 브리지", "Separate process · local bridge"),
      note: t(
        "설치·재배포하지 않고 shell:false와 허용된 작업 목록으로만 실행한다. 문서는 이것이 '기술적 격리 경계이지 법적 결론이 아님'이라 밝힌다. 사용자가 프로그램을 설치해야 동작한다.",
        "Nothing is installed or redistributed; programs run only with shell:false and an allowlist of operations. The docs say this is a technical isolation boundary, not a legal conclusion. It works only if the user installs the programs.",
      ),
    },
    evidence: ["tools/toonbridge/README.md", "config/studio-production-toolchain.json", "docs/studio/production-toolchain.md"],
  },
  {
    id: "notice-generator",
    name: "generate-third-party-notices",
    status: "live",
    link: { title: "SPDX License List", url: "https://spdx.org/licenses/" },
    asOf: AS_OF,
    cells: {
      role: t(
        "빌드할 때 모든 의존성의 라이선스 고지를 자동으로 만들고 검사하는 우리 스크립트. 허용 목록에 없는 라이선스가 들어오면 감사가 실패하고, 앱 안 도움말의 라이선스 화면이 이 결과를 보여 준다.",
        "Our script that generates and checks license notices for every dependency at build time. A license outside the allowlist fails the audit, and the license screen in the in-app help shows its output.",
      ),
      license: same("—"),
      mode: t("빌드 · postbuild", "Build · postbuild"),
      note: t(
        "이번 점검에서 감사는 통과했다(pnpm 584건, Vello CPU 85·GPU 137 crate, 불투명 WASM 3종). 다만 THIRD-PARTY-NOTICES.md 같은 이름의 파일은 수집하지 않아 wasm-vips가 MIT로만 나온다.",
        "The audit passed in this review (584 pnpm entries, 85 Vello CPU and 137 GPU crates, 3 opaque WASM inventories). But files named like THIRD-PARTY-NOTICES.md are not collected, so wasm-vips shows up as MIT only.",
      ),
    },
    evidence: [
      "scripts/generate-third-party-notices.mjs",
      "THIRD_PARTY_NOTICES.md",
      "apps/web/src/domains/creator/studio-third-party-notices.ts",
      "apps/web/src/domains/creator/StudioHelpCenterDialog.tsx",
    ],
  },
];

export const OPEN_SOURCE_ROWS: readonly EngineeringMapRow[] = [
  ...APP_AND_STORAGE_ROWS,
  ...TWO_D_ROWS,
  ...THREE_D_ROWS,
  ...AI_VISION_ROWS,
  ...OUTPUT_ROWS,
  ...PATCH_FORK_OWN_ROWS,
];
