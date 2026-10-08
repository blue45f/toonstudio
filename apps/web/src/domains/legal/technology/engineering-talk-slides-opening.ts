import type { EngineeringDiagram } from "./engineering-diagram-types";
import { BENCHMARKS, BENCHMARK_LEAD, BENCHMARK_PLAN, BENCHMARK_TITLE } from "./engineering-talk-benchmarks";
import {
  TALK_DEMO_FALLBACK_SECONDS,
  TALK_DEMO_STEP_SECONDS,
  sourcedTable,
  statusCell,
  t,
  type TalkTableSources,
} from "./engineering-talk-kit";
import type { TalkSlide } from "./engineering-talk-types";

/**
 * 세미나 발표 앞부분: 문제 정의 → 제품과 데모 동선 → 전체 아키텍처(9장, 610초).
 *
 * - 모든 기술 주장은 저장소의 실제 파일·설정으로 확인한 것만 쓴다(`evidence` 경로).
 * - 상태(운영/설정/실험)는 슬라이드가 아니라 `chapterId`가 가리키는 기술 스토리 챕터나 도감 카드·지도 행이 소유한다.
 * - 표(`table`)의 내용은 기술 지도 행에서 옮겨 와 칸만 줄여 썼다. 행마다 근거 id 를 `sourcedTable` 로 붙였다.
 */

/* ── 책임 분담 도식(직접 쓴 도식) ──────────────────────────────────────────────── */

const AUTHORITY_DIAGRAM: EngineeringDiagram = {
  id: "talk-authority-diagram",
  kind: "layers",
  title: t("데이터마다 주인은 하나", "One owner per kind of data"),
  caption: t(
    "한 공급자가 다른 공급자의 전체 폴백이 되지 않도록, 작업 종류마다 권위를 하나로 정했습니다.",
    "No provider silently becomes another's full fallback; each kind of work has one authority.",
  ),
  alt: t(
    "위에서 아래로 네 계층입니다. 사용자 기기가 작품 원본을, 브라우저 사이 WebRTC가 음성과 영상을, Cloudflare Durable Objects가 접속 상태 같은 임시 신호를, Core API와 Supabase PostgreSQL이 계정·권한·거래 원장을 맡습니다.",
    "Four layers from top to bottom: the user's device owns the artwork sources, browser-to-browser WebRTC owns voice and video, Cloudflare Durable Objects owns transient signals such as presence, and the Core API with Supabase PostgreSQL owns accounts, permissions and ledgers.",
  ),
  layers: [
    {
      id: "device",
      label: t("사용자 기기", "User's device"),
      sub: t("작품 원본(레이어·타일) → OPFS", "Artwork sources (layers, tiles) → OPFS"),
      tone: "local",
      chips: ["OPFS", "SQLite WASM"],
    },
    {
      id: "p2p",
      label: t("브라우저 ↔ 브라우저", "Browser ↔ browser"),
      sub: t("음성·영상 → WebRTC 직접 연결, 서버에 저장 안 함", "Voice and video → direct WebRTC, never stored on servers"),
      tone: "local",
      chips: ["WebRTC"],
    },
    {
      id: "edge",
      label: t("Cloudflare 엣지", "Cloudflare edge"),
      sub: t("접속 상태·커서·화면 공유 신호 → 임시 상태", "Presence, cursors, screen-share signals → transient state"),
      tone: "edge",
      chips: ["Durable Objects"],
    },
    {
      id: "server",
      label: t("서버 원장", "Server ledger"),
      sub: t("계정·권한·거래 → Core API + Supabase PostgreSQL", "Accounts, permissions, ledgers → Core API + Supabase PostgreSQL"),
      tone: "server",
      chips: ["NestJS", "PostgreSQL"],
    },
  ],
};

/* ── 오픈소스 · 가져다 쓴 것 ─────────────────────────────────────────────────── */

const OPEN_SOURCE = sourcedTable(
  [t("오픈소스", "Open source"), t("맡은 일", "Role"), t("라이선스", "License"), t("상태", "Status")],
  [
    ["react", t("React · React Router · React Compiler", "React · React Router · React Compiler"), t("모든 화면을 그리는 UI 뼈대", "The UI skeleton that draws every screen"), t("MIT", "MIT"), statusCell("live")],
    ["yjs-automerge", t("Yjs · Automerge", "Yjs · Automerge"), t("동시 편집을 합치는 CRDT", "The CRDT that merges concurrent edits"), t("MIT", "MIT"), statusCell("live")],
    ["sqlite-wasm", t("SQLite WASM", "SQLite WASM"), t("브라우저 안의 작은 데이터베이스", "A small database inside the browser"), t("Apache-2.0", "Apache-2.0"), statusCell("live")],
    ["three-js", t("three.js · three-vrm · React Three Fiber", "three.js · three-vrm · React Three Fiber"), t("3D 장면과 VRM 캐릭터", "3D scenes and VRM characters"), t("MIT", "MIT"), statusCell("live")],
    ["canvaskit", t("CanvasKit (Skia)", "CanvasKit (Skia)"), t("정밀 벡터·글자 렌더(WASM)", "Precise vector and text rendering (WASM)"), t("BSD-3-Clause", "BSD-3-Clause"), statusCell("live")],
    ["onnxruntime-web", t("ONNX Runtime Web", "ONNX Runtime Web"), t("AI 모델을 내 기기에서 실행", "Runs AI models on the user's device"), t("MIT (모델은 파일별)", "MIT (models per file)"), statusCell("live")],
    ["google-ink", t("Google Ink", "Google Ink"), t("WASM 직접 빌드 — 확정 획엔 미연결, 예측 꼬리 미리보기 접점만", "In-house WASM — not in committed strokes, only a predicted-tail preview hook"), t("Apache-2.0", "Apache-2.0"), statusCell("experimental")],
    ["mixbox", t("Mixbox", "Mixbox"), t("물감처럼 섞이는 혼색", "Pigment-like color mixing"), t("CC-BY-NC-4.0 · 별도 확인", "CC-BY-NC-4.0 · check separately"), statusCell("live")],
  ],
  t(
    "직접 가져다 쓴 117곳 중 대표 8곳 · 라이선스는 지도의 기록을 옮긴 것이며 의미는 판단하지 않습니다",
    "8 of the 117 direct dependencies · licenses are transcribed from the map, with no legal judgment",
  ),
);

export const OPENING_TABLE_SOURCES = {
  "talk-benchmarks": { kind: "map-grouped", mapId: "competitors", groupCell: "domain" },
  "talk-open-source": { kind: "map", mapId: "open-source", rowIds: OPEN_SOURCE.sourceIds },
} as const satisfies TalkTableSources;

export const OPENING_SLIDES = [
  {
    id: "talk-cover",
    section: "opening",
    layout: "cover",
    eyebrow: t("TOONSTUDIO 기술 세미나", "TOONSTUDIO ENGINEERING SEMINAR"),
    title: t("브라우저 하나로 웹툰을 그리고, 함께 만들기까지", "Drawing and co-creating webtoons in one browser tab"),
    lead: t(
      "드로잉·로컬 저장·실시간 협업·가상 스튜디오·3D·AI를 하나의 제작 흐름으로 연결한 과정을, 코드 근거와 함께 공유합니다.",
      "How drawing, local-first storage, realtime collaboration, a virtual studio, 3D and AI were connected into one production flow, with code evidence.",
    ),
    points: [
      t("30분 발표(질의응답 포함)", "A 30-minute talk, Q&A included"),
      t("실제 코드·설정으로 확인한 사실만", "Only facts verified in code and config"),
      t("운영 중·설정 필요·실험을 구분", "Live, configured and experimental kept apart"),
    ],
    art: {
      src: "/brand/illustrated-20260928/hero-640.webp",
      alt: t("브랜드 콘셉트 아트: 네온 도시의 웹툰 주인공", "Brand concept art: a webtoon heroine in a neon city"),
    },
    notes: t(
      "인사와 짧은 소개 뒤, 오늘의 약속 세 가지를 말합니다. 모든 주장은 저장소의 파일과 설정으로 확인했고, 운영 중·설정 필요·실험을 섞지 않으며, 질문은 마지막 QR로 기술 도감에서 이어 갑니다.\n비유: 레시피와 영수증을 함께 보여 주는 요리 시연입니다. 먼저 오늘의 순서입니다.",
      "Greet briefly, then make three promises: every claim is backed by repository files and configuration; live, configured and experimental are never mixed; and questions continue through the closing QR code into the tech atlas.\nAnalogy: a cooking demo that shows the recipe and the receipt together. First, today's route.",
    ),
    seconds: 40,
  },
  {
    id: "talk-agenda",
    section: "opening",
    layout: "agenda",
    eyebrow: t("오늘의 순서", "TODAY'S ROUTE"),
    title: t("문제에서 시작해 한계로 끝나는 30분", "30 minutes from the problem to the limits"),
    lead: t(
      "기술 목록을 읽지 않고, 한 컷이 만들어지는 흐름을 따라 필요한 기술을 설명합니다.",
      "Instead of reading a technology list, we follow one panel being made and explain the technology it needs.",
    ),
    points: [],
    notes: t(
      "화면의 구간과 시간을 가리키며 25초 안에 흐름을 설명합니다. 데모는 제품 구간에서 한 번만 하고, 핵심 기술은 구간마다 도감 도식 한 장씩이며, 지도 표는 대표 행만 짚는다고 알립니다.\n용어가 막히면 바로 손을 들어 달라고 요청한 뒤 문제부터 시작합니다.",
      "Point at the sections and timings and explain the route in 25 seconds. The live demo happens once in the product section, each core technology gets one atlas diagram, and the map tables show only representative rows.\nInvite the audience to raise a hand if a term is unclear, then start with the problem.",
    ),
    seconds: 40,
  },
  {
    id: "talk-problem",
    section: "opening",
    layout: "statement",
    eyebrow: t("01 · 문제 정의", "01 · THE PROBLEM"),
    title: t("웹툰 한 화는 여러 도구를 거치며 맥락을 잃습니다", "One webtoon episode loses context across many tools"),
    lead: t(
      "대본·콘티·드로잉·3D 밑그림·검수·연재가 서로 다른 도구와 파일에 흩어지면, 수정할 때마다 어느 버전이 원본인지부터 다시 확인해야 합니다.",
      "When script, boards, drawing, 3D underdrawing, review and release live in different tools and files, every revision starts by asking which version is the source.",
    ),
    points: [
      t("도구를 옮길 때마다 레이어·버전·의도가 끊깁니다", "Layers, versions and intent break at every tool handoff"),
      t("함께 작업하면 ‘누가 무엇을 확정했는가’가 흐려집니다", "In teams, who committed what becomes unclear"),
      t("설치·라이선스·고사양 장비가 시작의 장벽이 됩니다", "Installs, licenses and high-end hardware block the first step"),
    ],
    question: t("그리던 파일을 다른 도구로 옮기다 레이어를 잃은 적 있으신가요?", "Have you ever lost layers moving a file between tools?"),
    art: {
      src: "/brand/illustrated-20260928/storyboard-640.webp",
      alt: t("브랜드 콘셉트 아트: 흑백 콘티 예시", "Brand concept art: a monochrome storyboard example"),
    },
    notes: t(
      "먼저 화면의 질문을 던지고 손을 들게 합니다. 수치로 과장하지 않고 경험으로 공감을 만듭니다.\n웹툰 한 화는 대본·콘티·드로잉·3D 밑그림·검수·연재를 거치는데, 도구를 옮길 때마다 ‘어느 파일이 원본인가’를 다시 확인하게 됩니다. 이삿짐을 옮길 때마다 상자 이름표가 지워지는 것과 같습니다.\n핵심 문장은 이것입니다. ‘기획부터 배포까지를 하나의 작업 흐름으로 잇되, 구현이 불확실한 기능은 완성된 것처럼 말하지 않는다.’ 근거는 PRODUCT.md입니다.\n다음은 그 연결을 이루는 여섯 개 작업 공간입니다. 질문이 나오면 ‘Web App Manifest’ 카드를 엽니다.",
      "First ask the question on screen and let people raise hands. Build empathy from experience, not exaggerated numbers.\nOne episode passes through script, boards, drawing, 3D underdrawing, review and release, and every tool change forces you to ask which file is the source. It is like moving house and finding the box labels wiped each time.\nThe key line: ‘Connect planning to release in one workflow, and never present an uncertain feature as finished.’ The basis is PRODUCT.md.\nNext, the six workspaces that make up that connection. If asked, open the ‘Web App Manifest’ card.",
    ),
    chapterId: "product-intent",
    evidence: ["apps/web/src/app/routes", "PRODUCT.md"],
    relatedAtlasIds: ["web-app-manifest-install-identity", "service-worker-app-shell-policy", "server-down-fallback-deadline"],
    seconds: 100,
  },
  {
    id: "talk-product",
    section: "product",
    layout: "modules",
    eyebrow: t("02 · 제품 한 장 요약", "02 · THE PRODUCT ON ONE PAGE"),
    title: t("ToonStudio: 브라우저 안의 웹툰 제작실", "ToonStudio: a webtoon studio inside the browser"),
    lead: t(
      "기획부터 발행까지 한 프로젝트 안에서 이어지도록 여섯 개 작업 공간을 연결했습니다.",
      "Six workspaces are connected so a project flows from planning to publishing in one place.",
    ),
    points: [],
    modules: [
      { id: "canvas", icon: "canvas", title: t("캔버스 편집기", "Canvas editor"), body: t("브러시·레이어·컷·말풍선으로 원고 작업", "Brushes, layers, panels and balloons"), href: "/studio/new", stack: ["Pointer Events", "CanvasKit (Skia)", "WebGPU"] },
      { id: "character", icon: "character", title: t("캐릭터 셰이퍼", "Character shaper"), body: t("3D 체형·포즈로 그리기 위한 밑그림", "3D body and pose as underdrawing"), href: "/studio/assets/characters/new", stack: ["three.js", "@pixiv/three-vrm"] },
      { id: "space", icon: "space", title: t("가상 스튜디오", "Virtual studio"), body: t("아바타로 걷고 만나는 2D 협업 공간", "A 2D space to walk and meet as avatars"), href: "/studio/space", stack: ["Phaser 3", "WebRTC"] },
      { id: "collab", icon: "collab", title: t("실시간 협업", "Realtime collaboration"), body: t("같은 문서 편집·접속 상태·근접 허들", "Shared editing, presence and huddles"), stack: ["Yjs", "Cloudflare Durable Objects"] },
      { id: "ai", icon: "ai", title: t("AI 보조", "AI assistance"), body: t("제안은 AI, 확정은 사람", "AI proposes, people decide"), stack: ["onnxruntime-web", "MediaPipe"] },
      { id: "publish", icon: "publish", title: t("발행·공유", "Publish and share"), body: t("내보내기·공유 링크·미리보기", "Export, share links and previews"), stack: ["WebCodecs"] },
    ],
    notes: t(
      "6개 공간을 왼쪽 위부터 한 문장씩 소개합니다. 각각이 별도 앱이 아니라 같은 프로젝트·권한·저장 계약을 공유한다는 점이 핵심입니다. 타일 아래 칩은 그 공간을 떠받치는 기술이고, 근거는 studio-route-registry.ts입니다.\n비유: 한 건물 안의 6개 방입니다. 다음은 우리와 비슷한 제품들에게서 배운 점입니다. 질문이 나오면 ‘Renderer role ledger’ 카드를 엽니다.",
      "Introduce the six spaces one sentence each, starting top-left. The key point: they are not separate apps; they share one project, permission and storage contract. The chips under each tile are the technology behind that space, and the basis is studio-route-registry.ts.\nAnalogy: six rooms in one building. Next, what we learned from similar products. If asked, open the ‘Renderer role ledger’ card.",
    ),
    chapterId: "product-intent",
    evidence: ["apps/web/src/domains/creator/studio-route-registry.ts", "apps/web/src/app/routes/groups/creator.routes.tsx"],
    relatedAtlasIds: ["renderer-role-ledger", "yjs-crdt-document", "ai-proposal-not-commit", "export-engine-deterministic-pdf"],
    seconds: 55,
  },
  {
    id: "talk-benchmarks",
    section: "product",
    layout: "table",
    eyebrow: t("02 · 벤치마크 지도", "02 · BENCHMARK MAP"),
    title: BENCHMARK_TITLE,
    lead: BENCHMARK_LEAD,
    points: [],
    table: BENCHMARKS.table,
    notes: t(
      `벤치마크한 제품 ${BENCHMARK_PLAN.studied}곳을 영역별로 묶은 지도입니다. 기준은 ‘무엇을 배우고 무엇을 다르게 했는가’이며 우열과 가격은 말하지 않습니다.\nKrita는 GPL이라 코어 코드는 참고만 했고, Figma의 CRDT는 ‘Figma 수준’이라 주장하지 않습니다. 선배 가게를 구경해도 레시피는 베끼지 않는 셈입니다. 근거는 engineering-map-competitors.ts입니다. 다음은 데모입니다. 질문이 나오면 ‘Hokusai’ 카드를 엽니다.`,
      `This map groups all ${BENCHMARK_PLAN.studied} benchmarked products by area. The test is what we learned and what we did differently; no rankings or prices.\nKrita is GPL, so its core code was only read for reference, and Figma's CRDT is never claimed to be at Figma's level. It is touring older shops without copying their recipes. The basis is engineering-map-competitors.ts. Next, the demo. If asked, open the ‘Hokusai’ card.`,
    ),
    chapterId: "product-intent",
    evidence: [
      "apps/web/src/domains/legal/technology/engineering-map-competitors.ts",
      "apps/web/src/domains/legal/technology/engineering-map-competitors-rows.ts",
    ],
    relatedAtlasIds: ["hokusai-wasm-natural-media", "webrtc-datachannel-direct-lane", "proximity-video-capacity-chain", "vrm-humanoid-rig"],
    seconds: 55,
  },
  {
    id: "talk-demo",
    section: "product",
    layout: "demo",
    eyebrow: t("02 · 데모 동선", "02 · DEMO ROUTE"),
    title: t("한 컷이 만들어지는 라이브 데모", "Live demo: one panel being made"),
    lead: t(
      `네 단계를 단계당 ${TALK_DEMO_STEP_SECONDS}초 안에 시연하고, 한 단계가 실패하면 ${TALK_DEMO_FALLBACK_SECONDS}초 안에 예비 화면으로 넘어갑니다.`,
      `Four steps at ${TALK_DEMO_STEP_SECONDS} seconds each; if one fails, switch to its fallback within ${TALK_DEMO_FALLBACK_SECONDS} seconds and state exactly what was verified.`,
    ),
    points: [],
    demoSteps: [
      {
        href: "/studio/new",
        action: t("새 작품 만들기에서 결과물 형식 고르기", "Pick an output format in Create new"),
        expected: t("형식을 고르면 작품 구조와 작업실이 함께 준비됩니다", "Choosing a format prepares the work structure and workspace"),
        fallback: t("제품 투어 영상의 제작 시작 장면을 대신 보여 주기", "Use the getting-started chapter of the product tour"),
      },
      {
        href: "/studio",
        action: t("선을 그린 뒤 새로고침해 복구 확인", "Draw a few strokes, reload and confirm recovery"),
        expected: t("브라우저 로컬 저장(OPFS)에서 작업이 돌아옵니다", "Work returns from browser-local storage (OPFS)"),
        fallback: t("로컬 우선 저장 슬라이드로 설명을 이어가기", "Continue with the local-first storage slide"),
      },
      {
        href: "/studio/assets/characters/new",
        action: t("캐릭터 셰이퍼에서 체형·포즈 조정", "Adjust body and pose in the character shaper"),
        expected: t("3D 뷰포트에서 캐릭터가 바로 반응합니다", "The character reacts instantly in the 3D viewport"),
        fallback: t("기술 스토리의 3D 챕터를 대신 보여 주기", "Use the 3D chapter of the engineering story"),
      },
      {
        href: "/studio/space",
        action: t("가상 스튜디오에 입장해 이동하기", "Enter the virtual studio and walk around"),
        expected: t("아바타가 걷고, 근처 채팅은 가까운 사람에게만 닿습니다", "The avatar walks, and nearby chat reaches only people close by"),
        fallback: t("가상 스튜디오 슬라이드의 도식으로 설명", "Explain with the virtual studio diagram slide"),
      },
    ],
    notes: t(
      `데모 탭 네 개를 미리 열어 둡니다. 각 단계는 ${TALK_DEMO_STEP_SECONDS}초 안에 끝내고, 실패하면 ${TALK_DEMO_FALLBACK_SECONDS}초 안에 예비 화면으로 넘어갑니다. 네 단계 100초에 여유 20초라서 한 번 틀려도 일정은 유지됩니다.\n기능을 나열하지 말고 관찰 포인트 네 가지만 말합니다. 형식을 고르면 작업실이 준비됨, 새로고침해도 남는 작업, 3D가 그리기 재료가 됨, 공간에서 만남입니다.\n로그인 전에도 탐색과 로컬 작업은 바로 되지만 협업은 서버 연결이 필요하다는 점도 함께 말합니다. 근거는 studio-opfs-filesystem.ts와 autosave 검증 스크립트입니다.\n다음은 이 데모 뒤에서 무엇이 돌고 있는지, 전체 구조입니다. 질문이 나오면 ‘OPFS recovery journal’ 카드를 엽니다.`,
      `Pre-open the four demo tabs. Finish each step within ${TALK_DEMO_STEP_SECONDS} seconds and switch to the fallback within ${TALK_DEMO_FALLBACK_SECONDS} seconds on failure. Four steps take 100 seconds and 20 seconds remain as slack, so one miss does not break the schedule.\nDo not list features; narrate four observations only: a format prepares the workspace, work survives a reload, 3D becomes drawing material, and people meet in space.\nSay that browsing and local work are available before sign-in while collaboration needs a server connection. The basis is studio-opfs-filesystem.ts and the autosave verification script.\nNext, what runs behind this demo: the whole architecture. If asked, open the ‘OPFS recovery journal’ card.`,
    ),
    chapterId: "storage",
    evidence: [
      "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
      "scripts/verify-studio-autosave-opfs-session.mts",
      "apps/web/src/domains/creator/virtual-space/studio-virtual-space-chat.ts",
    ],
    relatedAtlasIds: ["autosave-crash-recovery-journal", "vrm-humanoid-rig", "virtual-studio-architecture-overview", "opfs-content-addressed-store"],
    seconds: 120,
  },
  {
    id: "talk-architecture",
    section: "architecture",
    layout: "diagram",
    eyebrow: t("03 · 전체 아키텍처", "03 · ARCHITECTURE"),
    title: t("원본은 기기에, 원장은 서버에, 실시간은 엣지에", "Sources on the device, ledgers on the server, realtime at the edge"),
    lead: t(
      "브라우저·Cloudflare·Render·PostgreSQL이 각자 한 가지 권위만 가지도록 나눴습니다.",
      "Browser, Cloudflare, Render and PostgreSQL each own exactly one kind of authority.",
    ),
    points: [],
    notes: t(
      "왼쪽 브라우저부터 봅니다. 그림 원본과 무거운 계산은 사용자 기기에 있습니다.\n가운데 Cloudflare는 정적 화면을 직접 내주고, Worker가 먼저 받는 경로 26개만 따로 처리합니다. Durable Objects는 접속 상태·커서·화면 공유 신호 같은 임시 상태를 맡습니다.\n오른쪽 Core API는 Render 무료 플랜에서 권한과 원장 트랜잭션을 맡고, 원장 DB는 Supabase PostgreSQL이 현재 권위이며 Neon은 legacy로 보존합니다. 비유하면 집은 기기, 우체국은 엣지, 금고는 원장입니다. 근거는 canonical-database-topology.md입니다. 다음은 이 구조의 원칙입니다. 질문이 나오면 ‘Static-first edge gateway’ 카드를 엽니다.",
      "Start with the browser on the left: artwork sources and heavy computation live on the user's device.\nIn the middle, Cloudflare serves the static app directly and handles only the 26 worker-first paths. Durable Objects hold transient state such as presence, cursors and screen-share signals.\nOn the right, the Core API on Render's free plan owns permissions and ledger transactions; for the ledger database, Supabase PostgreSQL is the current authority and Neon is kept as legacy. Analogy: the house is the device, the post office the edge, the vault the ledger. The basis is canonical-database-topology.md. Next, the principle behind this structure. If asked, open the ‘Static-first edge gateway’ card.",
    ),
    chapterId: "architecture",
    evidence: [
      "DEPLOY.md",
      "render.yaml",
      "deploy/cloudflare-realtime/wrangler.jsonc",
      "deploy/cloudflare-static/wrangler.jsonc",
      "docs/operations/canonical-database-topology.md",
      "apps/api/package.json",
    ],
    relatedAtlasIds: ["static-first-edge-gateway", "supabase-single-writer-authority", "durable-objects-realtime", "module-boundary-ratchet"],
    seconds: 90,
  },
  {
    id: "talk-authority",
    section: "architecture",
    layout: "diagram",
    eyebrow: t("03 · 설계 원칙", "03 · DESIGN PRINCIPLE"),
    title: t("모든 데이터에는 주인이 하나뿐입니다", "Every piece of data has exactly one owner"),
    lead: AUTHORITY_DIAGRAM.caption,
    points: [],
    diagram: AUTHORITY_DIAGRAM,
    notes: t(
      "집마다 문패가 하나이듯 데이터마다 주인도 하나입니다. 이 4개 계층 덕분에 협업·오프라인·AI가 서로를 망가뜨리지 않습니다.\n서버가 잠들어도 그림은 기기에서 계속되고, 원장 DB의 쓰기 권위는 Supabase 하나입니다. 근거는 DEPLOY.md입니다. 다음은 오픈소스입니다. 질문이 나오면 ‘Single-writer database authority’ 카드를 엽니다.",
      "Like one nameplate per house, each kind of data has one owner. Thanks to these 4 layers, collaboration, offline work and AI cannot break each other.\nEven when the server sleeps, drawing continues on the device, and the ledger database has a single writer, Supabase. The basis is DEPLOY.md. Next, the open source behind this. If asked, open the ‘Single-writer database authority’ card.",
    ),
    chapterId: "infrastructure",
    evidence: [
      "DEPLOY.md",
      "docs/operations/canonical-database-topology.md",
      "apps/web/src/domains/creator/live/huddle/studio-p2p-huddle-controller.ts",
    ],
    relatedAtlasIds: ["supabase-single-writer-authority", "durable-objects-realtime", "world-authority-cas-projection", "web-locks-broadcastchannel-single-author"],
    seconds: 50,
  },
  {
    id: "talk-open-source",
    section: "architecture",
    layout: "table",
    eyebrow: t("03 · 오픈소스 지도", "03 · OPEN-SOURCE MAP"),
    title: t("이 구조를 떠받치는 오픈소스", "The open source this structure stands on"),
    lead: t(
      "직접 가져다 쓴 오픈소스 117개(2026-10-07 설치본 기준) 중 역할이 큰 8곳입니다. 라이선스는 지도의 기록만 옮겼습니다.",
      "Eight of the 117 direct dependencies (installed set of 2026-10-07) with the biggest roles. Licenses are transcribed from the map.",
    ),
    points: [],
    table: OPEN_SOURCE.table,
    notes: t(
      "직접 쓰는 오픈소스 117개 중 역할이 큰 8개만 봅니다. 라이선스는 지도의 기록을 옮겼고, 비상업 조건의 Mixbox는 ‘별도 확인’입니다.\n비유: 레고 상자입니다. 고쳐 쓴 블록은 pnpm 패치와 포크로 기록합니다. 근거는 engineering-map-open-source.ts이고, 손으로 쓴 THIRD_PARTY_NOTICES.md는 일부만 담은 목록입니다. 다음은 핵심 기술입니다. 질문이 나오면 ‘Third-party notices’ 카드를 엽니다.",
      "Of the 117 open-source packages we use directly, we look at the 8 with the biggest roles. Licenses are transcribed from the map, and Mixbox, which has non-commercial terms, is marked ‘check separately’.\nAnalogy: a box of Lego, where every block we modified is recorded as a pnpm patch or a fork. The basis is engineering-map-open-source.ts; the hand-written THIRD_PARTY_NOTICES.md is only a partial list. Next, the core technology. If asked, open the ‘Third-party notices’ card.",
    ),
    chapterId: "open-source",
    evidence: [
      "apps/web/src/domains/legal/technology/engineering-map-open-source.ts",
      "apps/web/src/domains/legal/technology/engineering-map-open-source-rows.ts",
      "apps/web/src/domains/creator/brush/studio-ink-mesh-live-preview.ts",
      "THIRD_PARTY_NOTICES.md",
    ],
    relatedAtlasIds: ["oss-license-notice-pipeline", "oss-supply-chain-pinning", "oss-pnpm-patches-no-unsafe-eval", "oss-fork-wgpu-toon"],
    seconds: 60,
  },
] as const satisfies readonly TalkSlide[];
