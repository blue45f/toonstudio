import { LIBRARY_GROUP_SCREEN, LIBRARY_GROUP_SHARE, LIBRARY_GROUP_TOOLS } from "./engineering-library-guide-groups";
import { t } from "./engineering-library-guide-kit";
import type { LibraryGuideOverview } from "./engineering-library-guide-types";

/**
 * 라이브러리 해설 · 한 장 요약. 전체 스택 도식 한 장, 라이브러리를 고르는 원칙, 이 페이지를 읽는 법.
 * 원칙은 모두 코드·ADR·번들 검사·테스트로 근거를 댈 수 있는 것만 적는다(근거는 각 문장 뒤 괄호).
 * 기준일 2026-10-08.
 */
/** 이 페이지의 사실을 코드·설치본·문서와 마지막으로 대조한 날짜. */
export const LIBRARY_GUIDE_REVIEWED_AT = "2026-10-08";

export const LIBRARY_GUIDE_OVERVIEW: LibraryGuideOverview = {
  diagram: {
    id: "library-overview-diagram",
    kind: "layers",
    title: t("라이브러리 스택 한눈에", "The library stack at a glance"),
    caption: t(
      "그리기·3D·편집 화면은 내 기기(브라우저) 안에서 돌고, 서버와 Cloudflare는 협업·권한·원장을 맡습니다.",
      "Drawing, 3D and the editing screens run inside your own browser, while the server and Cloudflare handle collaboration, permissions and the ledger.",
    ),
    alt: t(
      "위에서 아래로 일곱 층입니다. 브러시 엔진, VRM·3D·캐릭터, 2D 편집과 가상 스튜디오가 작업 화면을 만드는 부품입니다. 함께 작업하기, 저장과 기기 안의 AI, 서버와 데이터가 함께 작업하고 보관하는 부품입니다. 맨 아래는 만들기·검사·내보내기 도구입니다. 층마다 대표 라이브러리를 칩으로 보여 주며, 층 번호는 이 페이지의 영역 번호와 같습니다.",
      "Seven layers from top to bottom. Brush engines, VRM, 3D and characters, and 2D editing with the virtual studio are the parts that make the working screen. Collaboration, storage and on-device AI, and server and data are the parts that work together and keep things. At the bottom are the tools for building, checking and exporting. Each layer shows its representative libraries as chips, and layer numbers match the area numbers on this page.",
    ),
    layers: [
      {
        id: "brush",
        label: t("1 · 브러시 엔진", "1 · Brush engines"),
        sub: t("펜 한 획이 선·물감·자연매체가 되는 계산", "The math that turns a pen stroke into lines, paint and natural media"),
        tone: "local",
        chips: ["Hokusai", "perfect-freehand", "CanvasKit", "Vello", "p5.brush", "Mixbox"],
      },
      {
        id: "three-d",
        label: t("2 · VRM·3D·캐릭터", "2 · VRM, 3D, characters"),
        sub: t("3D 장면, 캐릭터 뼈대와 표정, 모델 가공", "3D scenes, character bones and expressions, model processing"),
        tone: "local",
        chips: ["three.js", "three-vrm", "R3F", "Babylon.js", "glTF Transform", "Rapier"],
      },
      {
        id: "canvas",
        label: t("3 · 2D 편집·가상 스튜디오", "3 · 2D editing, virtual studio"),
        sub: t("편집 캔버스, 2D 월드, 화면 UI와 상태", "The editing canvas, the 2D world, screen UI and state"),
        tone: "local",
        chips: ["React", "Konva", "PixiJS", "Phaser", "Zustand", "Tailwind CSS"],
      },
      {
        id: "collab",
        label: t("4 · 함께 작업하기", "4 · Working together"),
        sub: t("동시 편집과 실시간 연결(일부는 운영 설정이 필요)", "Concurrent editing and realtime links (some need operations setup)"),
        tone: "edge",
        chips: ["Yjs", "Socket.IO", "WebRTC", "Durable Objects", "TURN"],
      },
      {
        id: "device",
        label: t("5·6 · 기기 안의 저장과 AI", "5-6 · On-device storage and AI"),
        sub: t("서버 없이 저장하고 AI를 돌립니다", "Stores work and runs AI without a server"),
        tone: "local",
        chips: ["SQLite WASM", "OPFS", "Service Worker", "ONNX Runtime Web", "MediaPipe", "Transformers.js"],
      },
      {
        id: "server",
        label: t("7 · 서버와 데이터", "7 · Server and data"),
        sub: t("로그인·권한·원장은 서버가, 정적 배포는 Cloudflare가", "The server keeps sign-in, permissions and the ledger; Cloudflare serves static files"),
        tone: "server",
        chips: ["NestJS", "Drizzle ORM", "PostgreSQL", "Zod", "Cloudflare", "Render"],
      },
      {
        id: "build",
        label: t("8 · 만들기·검사·내보내기", "8 · Build, check, export"),
        sub: t("빌드, 테스트, 파일 형식과 영상 출력", "Builds, tests, file formats and video output"),
        tone: "neutral",
        chips: ["Vite", "Vitest", "Playwright", "wasm-vips", "ag-psd", "pdf-lib"],
      },
    ],
    // 괄호 이름은 화면의 영역 묶음(영역 바로가기·목차)과 같은 상수의 짧은 이름을 쓴다.
    brackets: [
      { label: LIBRARY_GROUP_SCREEN.diagramLabel, layerIds: ["brush", "three-d", "canvas"] },
      { label: LIBRARY_GROUP_SHARE.diagramLabel, layerIds: ["collab", "device", "server"] },
      { label: LIBRARY_GROUP_TOOLS.diagramLabel, layerIds: ["build"] },
    ],
  },
  principles: [
    {
      title: t("한 가지 일에는 주인이 한 명", "One owner for each job"),
      body: t(
        "화면 표시·획 확정·자연매체·3D처럼 일마다 주인 엔진을 하나만 둡니다. 역할을 코드의 원장에 적어 두고 어긋나면 테스트가 실패합니다(ADR-0003·0019).",
        "Each job, such as display, stroke commit, natural media or 3D, has exactly one owning engine. Roles are written in a code ledger, and drift fails a test (ADR-0003, 0019).",
      ),
    },
    {
      title: t("무거운 부품은 필요할 때만", "Heavy parts only when needed"),
      body: t(
        "큰 엔진은 쓰는 화면에서 불러오도록 나눴습니다. 3D·CRDT·Babylon이 첫 화면 번들로 돌아오면 번들 검사(check-studio-bundle)가 빌드를 실패시킵니다.",
        "Large engines are split so they load on the screen that uses them. If 3D, CRDT or Babylon creep back into the first-screen bundle, the bundle check (check-studio-bundle) fails the build.",
      ),
    },
    {
      title: t("실패를 다른 엔진 뒤에 숨기지 않는다", "Never hide a failure behind another engine"),
      body: t(
        "작업을 시작하기 전에 엔진을 하나 고르고, 실패해도 몰래 다른 엔진으로 갈아타지 않습니다. 안 되는 이유를 화면에 알립니다(ADR-0018).",
        "An engine is chosen before the work starts, and a failure never silently switches to another one. The screen says why it cannot run (ADR-0018).",
      ),
    },
    {
      title: t("가능한 한 브라우저 안에서", "In the browser whenever possible"),
      body: t(
        "저장은 SQLite WASM, AI는 ONNX Runtime Web처럼 서버 없이 기기 안에서 끝내는 쪽을 먼저 봅니다. 단 일부 AI 모델 파일은 실행할 때 내려받습니다.",
        "Storage with SQLite WASM and AI with ONNX Runtime Web are done on the device first, without a server. Some AI model files are, however, downloaded at run time.",
      ),
    },
    {
      title: t("라이선스 조건을 숨기지 않는다", "Never hide a license condition"),
      body: t(
        "MIT·Apache 같은 허용형은 직접 번들하고, LGPL·비상업(CC BY-NC) 같은 까다로운 조건은 표시해 별도 확인 대상으로 남깁니다(ADR-0008). 빌드가 고지문을 만들고 허용 목록 밖 라이선스를 걸러냅니다.",
        "Permissive licenses such as MIT and Apache are bundled directly, while demanding terms such as LGPL or non-commercial (CC BY-NC) are flagged for separate review (ADR-0008). The build generates notices and screens out licenses outside the allowlist.",
      ),
    },
    {
      title: t("버전을 고정하고 고친 곳을 남긴다", "Pin versions and record what we changed"),
      body: t(
        "핵심 엔진은 정확한 버전으로 고정하고(CanvasKit 0.41.1 등), 직접 빌드한 WASM은 해시로 봉인합니다. 고쳐 쓴 곳은 pnpm 패치 7개와 포크 2개(wgpu-toon·braces)로 남아 있습니다.",
        "Core engines are pinned to exact versions (CanvasKit 0.41.1 and others), WASM we build is sealed by hash, and what we modified remains as 7 pnpm patches and 2 forks (wgpu-toon and braces).",
      ),
    },
  ],
  howToRead: [
    t(
      "먼저 위 도식으로 여덟 영역이 어떻게 쌓이는지 봅니다. 위에서 아래로 읽으면 이 페이지의 순서와 같습니다.",
      "Start with the diagram above to see how the eight areas stack. Reading it top to bottom matches the order of this page.",
    ),
    t(
      "영역마다 ① 이 영역이 푸는 문제 → ② 부품이 맞물리는 도식 → ③ 왜 이런 설계인가 → ④ 라이브러리 카드 순서입니다. 발표라면 영역 하나가 약 3분입니다.",
      "Each area runs: 1) the problem it solves, 2) a diagram of how the parts mesh, 3) why the design looks this way, 4) library cards. In a talk, one area takes about three minutes.",
    ),
    t(
      "카드를 펼치면 하는 일·왜 골랐나·검토한 대안·대가·쓰는 곳(파일)이 나옵니다. 상태와 라이선스는 접힌 상태에서도 보입니다.",
      "Opening a card shows what it does, why we chose it, the alternatives we weighed, the cost and where it is used (files). Status and license stay visible even when it is closed.",
    ),
    t(
      "문서에서 근거를 찾지 못한 이유는 쓰지 않았습니다. 더 깊은 근거는 영역 아래의 도감·제작 스토리·용어집 링크로 내려갑니다.",
      "Reasons we could not find in the documents are not written down. Deeper evidence is a click away through the atlas, story and glossary links under each area.",
    ),
  ],
};
