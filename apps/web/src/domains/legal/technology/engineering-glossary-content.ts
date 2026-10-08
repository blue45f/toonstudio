import { ENGINEERING_GLOSSARY_MORE } from "./engineering-glossary-more";
import type { LocalizedText } from "./engineering-story-content";

const t = (ko: string, en: string): LocalizedText => ({ ko, en });

export type GlossaryCategoryId =
  | "brush"
  | "web"
  | "spatial"
  | "collab"
  | "sound"
  | "ai"
  | "craft"
  | "input"
  | "data"
  | "oss";

export interface GlossaryCategory {
  readonly id: GlossaryCategoryId;
  readonly label: LocalizedText;
  readonly hint: LocalizedText;
}

export const GLOSSARY_CATEGORIES: readonly GlossaryCategory[] = [
  {
    id: "brush",
    label: t("브러시 · 렌더링", "Brush · Rendering"),
    hint: t("펜의 움직임이 화면의 선이 되기까지", "From pen movement to pixels"),
  },
  {
    id: "web",
    label: t("웹 플랫폼", "Web platform"),
    hint: t("브라우저의 한계를 넘는 방법", "Pushing past browser limits"),
  },
  {
    id: "spatial",
    label: t("3D · 공간", "3D · Space"),
    hint: t("입체 장면과 캐릭터", "Scenes and characters in 3D"),
  },
  {
    id: "collab",
    label: t("협업 · 연결", "Collaboration · Connectivity"),
    hint: t("함께 작업하고 밖에 공유하기", "Working together and sharing out"),
  },
  {
    id: "sound",
    label: t("사운드 · 모션", "Sound · Motion"),
    hint: t("들리는 분위기와 움직이는 설명", "Atmosphere you hear, explanations that move"),
  },
  {
    id: "ai",
    label: t("AI", "AI"),
    hint: t("기계가 돕고 사람이 정하는 일", "Machines propose, humans decide"),
  },
  {
    id: "craft",
    label: t("개발 문화 · 배포", "Craft · Delivery"),
    hint: t("팀이 코드를 다루는 방식", "How the team treats code"),
  },
  {
    id: "input",
    label: t("입력 · 상호작용", "Input · Interaction"),
    hint: t("손과 키보드의 움직임이 동작이 되기까지", "From hand and keyboard to action"),
  },
  {
    id: "data",
    label: t("저장 · 백엔드 · 보안", "Data · Backend · Security"),
    hint: t("작품이 안전하게 남고 오가는 방법", "How work is stored safely and moves around"),
  },
  {
    id: "oss",
    label: t("오픈소스 · Open API", "Open source · Open APIs"),
    hint: t("남의 코드와 데이터를 안전하게 쓰는 법", "Using others' code and data safely"),
  },
];

export interface GlossaryTerm {
  readonly id: string;
  readonly category: GlossaryCategoryId;
  readonly term: LocalizedText;
  /** 한 줄 정의 — 사전처럼 짧게 */
  readonly definition: LocalizedText;
  /** 쉬운 비유 — 청중이 바로 그릴 수 있는 그림 */
  readonly analogy: LocalizedText;
  /** 툰스튜디오에서는 — 실제 파일·숫자·선택 이야기 */
  readonly inToonstudio: LocalizedText;
  /** 더 읽을 챕터 id */
  readonly chapters: readonly string[];
  /** 같은 대상을 깊게 설명하는 기술 도감 카드 id(실제로 있는 카드만 — 테스트가 확인) */
  readonly atlasIds?: readonly string[];
}

/**
 * 발표 Q&A 방어용 기술 용어집.
 * 규칙: 정의는 한 줄, 비유는 일상 사물, "툰스튜디오에서는"은 실제 파일명·숫자·선택 이유.
 * 지어낸 내용은 넣지 않는다 — inToonstudio는 코드에서 확인된 것만.
 */
const BASE_GLOSSARY: readonly GlossaryTerm[] = [
  // ── 브러시 · 렌더링 ──────────────────────────────────────────────
  {
    id: "wasm",
    category: "brush",
    term: t("WASM (WebAssembly)", "WASM (WebAssembly)"),
    definition: t(
      "C·Rust 같은 언어로 짠 빠른 코드를 브라우저에서 거의 네이티브 속도로 돌리는 실행 형식입니다.",
      "An execution format that runs fast compiled code (C, Rust, …) in the browser at near-native speed.",
    ),
    analogy: t(
      "외국어 통역사가 아니라, 미리 번역해 둔 책을 읽는 것과 같습니다. 번역(Rust→WASM)은 한 번만 하고, 읽기는 매번 빠릅니다.",
      "Like reading a pre-translated book instead of hiring a live interpreter. Translate once (Rust → WASM), read fast every time.",
    ),
    inToonstudio: t(
      "packages/studio-hokusai-wasm — 외부 Rust crate Hokusai 0.3.0을 감싼 수채화·자연매체 렌더러를 WASM으로 묶었습니다. 무거운 픽셀 연산은 여기서 돌리고, 화면 일꾼(Worker)과 함께 써서 UI를 막지 않습니다.",
      "packages/studio-hokusai-wasm — the watercolor / natural-media renderer built on the external Rust crate Hokusai 0.3.0, shipped as WASM. Heavy pixel math runs here, alongside a Worker, so the UI never stalls.",
    ),
    chapters: ["brush-engine", "worker-architecture"],
  },
  {
    id: "rust",
    category: "brush",
    term: t("Rust", "Rust"),
    definition: t(
      "메모리 실수를 컴파일 단계에서 잡아내는 시스템 프로그래밍 언어입니다. 느린 가비지 컬렉터가 없습니다.",
      "A systems language that catches memory mistakes at compile time. No slow garbage collector.",
    ),
    analogy: t(
      "요리 전에 식재료를 전부 손질해 두는 주방과 같습니다. 손님이 온 뒤(실행 중)에 당황할 일이 없습니다.",
      "Like a kitchen that preps every ingredient before service — no surprises once guests (users) arrive.",
    ),
    inToonstudio: t(
      "Hokusai 렌더러와 Vello 크레이트, 먹물 커널의 언어입니다. 우리 래퍼 크레이트(studio-hokusai-wasm)의 릴리스 빌드는 LTO·panic=abort로 바이트까지 다이어트하고 unsafe_code를 금지(forbid)합니다. 이 금지는 래퍼 코드에만 적용되고 외부 crate 내부까지 보증하지는 않습니다.",
      "The language of the Hokusai renderer, the Vello crate and the sumi kernel. Release builds of our wrapper crate (studio-hokusai-wasm) use LTO and panic=abort for a lean binary and forbid unsafe_code; that ban covers the wrapper code only and does not vouch for the external crates inside.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "hokusai",
    category: "brush",
    term: t("Hokusai (자연매체 렌더러)", "Hokusai (natural-media renderer)"),
    definition: t(
      "수채화·잉크 같은 아날로그 재료의 번짐·농도·종이 반응을 시뮬레이션하는 렌더링 엔진입니다.",
      "A rendering engine that simulates analog materials — watercolor bleeding, ink density, paper response.",
    ),
    analogy: t(
      "물감을 '칠하는' 게 아니라 '젖은 종이에 떨어뜨리는' 엔진입니다. 색을 입히는 게 아니라 재료의 반응을 계산합니다.",
      "It doesn't paint color on — it drops pigment onto wet paper. It computes the material's reaction, not just the color.",
    ),
    inToonstudio: t(
      "Hokusai 0.3.0을 정확히 고정(=0.3.0)해서 씁니다. 외부 crate라서 투명도 처리가 핵심인 우리 쪽은 upstream 래퍼 대신 직접 래퍼를 만들었고, 렌더러 역할 원장에서 자연매체 authority의 primary입니다. 바뀐 영역만 다시 그리는 dirty-bounds 방식으로 64px 타일 단위로 갱신합니다. libmypaint와의 풀사이즈 벤치마크에서는 처리량이 0.318배·0.097배였고 품질 동등 게이트를 통과하지 못했습니다. 그래서 ADR-0011 은 자동 제품 경로를 열지 않고 명시 선택(실험)으로 두었으며, 원장의 ‘primary’는 자연매체 역할의 단독 소유자라는 뜻이지 기본 경로라는 뜻이 아닙니다.",
      "Pinned to exactly Hokusai 0.3.0. Because it is an external crate and transparency handling is critical for us, we wrote our own wrapper instead of the upstream one, and it is the primary owner of the natural-media authority in the renderer role ledger. Only changed regions are repainted via dirty-bounds in 64 px tiles. In the full-size benchmark against libmypaint its throughput was 0.318x and 0.097x and the quality-parity gate did not pass. So ADR-0011 opens no automatic product route and keeps it an explicit, experimental choice; ‘primary’ in the ledger means sole owner of the natural-media role, not the default path.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "libmypaint",
    category: "brush",
    term: t("MyPaint / libmypaint", "MyPaint / libmypaint"),
    definition: t(
      "오픈소스 드로잉 프로그램 MyPaint의 브러시 엔진. 수백 가지 브러시 설정을 숫자(세팅 값)로 표현합니다.",
      "The brush engine of the open-source painting app MyPaint. Hundreds of brush behaviors expressed as numeric settings.",
    ),
    analogy: t(
      "붓 한 자루가 아니라 '붓 공장'입니다. 같은 엔진에 다른 숫자 처방전(.myb)을 넣으면 전혀 다른 붓이 됩니다.",
      "Not one brush but a brush factory — feed the same engine a different numeric recipe (.myb) and you get a different brush.",
    ),
    inToonstudio: t(
      "libmypaint v1.6.1을 WASM으로 컴파일해 두었고, 렌더러 역할 원장에서는 reference(비교 기준선)이며 제품 fallback이 아닙니다. 다만 Studio 인스펙터의 '선택 획 네이티브 변환'에서는 기본 엔진으로 불려 그 결과가 문서에 들어갑니다(ADR-0011). .myb 문서를 파싱해 주입(injection) 방식으로만 세팅을 넣고, 문서가 가진 값은 하나도 조용히 버리지 않는다는 '정직 계약'을 벤치마크 하니스가 검사합니다.",
      "Compiled to WASM as libmypaint v1.6.1, and in the renderer role ledger it is a reference (comparison baseline), not a product fallback. The Studio Inspector's native stroke conversion does call it as the default engine, though, and its result goes into the document (ADR-0011). Settings go in only through injection from parsed .myb documents, and the benchmark harness checks the honesty contract: no document value is silently dropped.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "stabilizer",
    category: "brush",
    term: t("스트로크 스태빌라이저 (손떨림 보정)", "Stroke stabilizer"),
    definition: t(
      "손의 미세한 떨림을 걸러내 매끈한 선을 만드는 필터입니다. 강할수록 매끈하지만 펜을 늦게 따라옵니다.",
      "A filter that smooths hand jitter into clean lines. Stronger means smoother — but the line trails the pen more.",
    ),
    analogy: t(
      "줄에 매달린 추와 같습니다. 손이 흔들려도 추는 관성 때문에 부드럽게 따라오죠. 대신 손을 멈추면 추가 조금 더 미끄러집니다.",
      "Like a weight on a string: it glides smoothly despite a shaky hand, but slides a little past where you stop.",
    ),
    inToonstudio: t(
      "캔버스의 라이브 스태빌라이저(studio-stroke-stabilizer.ts)는 세 모드입니다. standard(고정 주기)는 보정 0이면 입력을 즉시 반영하고 0보다 크면 5ms 단계식 필터를 쓰며, adaptive(속도 적응)는 느린 선은 더 안정시키고 빠른 플릭은 지연을 줄이고, precision(정밀 추적)은 펜 끝을 가상의 끈으로 뒤따라 긴 선화와 곡선을 다듬습니다. 펜을 뗄 때는 flush가 지연을 실제 끝점까지 따라잡아 '펜을 뗀 자리에서 정확히 끝나야 한다'는 끝점 계약을 지킵니다. ema·spring 백엔드는 브러시 플랫폼 패키지의 별도 stabilizer provider에 있습니다.",
      "The canvas's live stabilizer (studio-stroke-stabilizer.ts) has three modes. Standard (fixed rate) applies input immediately at zero strength and a 5 ms stepped filter above zero; adaptive stabilizes slow lines more and cuts latency on fast flicks; precision trails the pen tip with a virtual string to refine long linework and curves. On pen-up, flush catches the delay up to the real endpoint, keeping the endpoint contract that the line must end exactly where the pen lifted. The ema and spring backends live in the separate stabilizer provider of the brush platform package.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "skia-canvaskit",
    category: "brush",
    term: t("Skia / CanvasKit", "Skia / CanvasKit"),
    definition: t(
      "구글 크롬·안드로이드가 쓰는 2D 그래픽 엔진 Skia를 웹(WASM)에서 돌리는 묶음입니다.",
      "CanvasKit brings Skia — the 2D graphics engine inside Chrome and Android — to the web via WASM.",
    ),
    analogy: t(
      "크롬이 그림을 그리는 '손'을 빌려오는 것입니다. 브라우저마다 손재주가 달라도, 같은 손을 쓰면 같은 그림이 나옵니다.",
      "Borrowing Chrome's own drawing hand. Different browsers have different skills, but the same hand draws the same picture.",
    ),
    inToonstudio: t(
      "렌더러 역할 원장에서 경로 연산 품질(path-ops-quality) authority의 primary이고, Skia 문서 벡터 섬(document-vector-island)도 따로 primary로 선언돼 있습니다. 원장에 '누가 어떤 결과를 만들 수 있는지' 적어 두고, 엔진은 작업 전에 하나를 정하며 실패 뒤 다른 엔진으로 자동 전환하지 않습니다(ADR-0018).",
      "In the renderer role ledger it is the primary owner of the path-ops-quality authority, and a separate Skia document-vector-island surface is also declared primary. The ledger records who can produce which results; an engine is chosen before the job and never switched automatically after a failure (ADR-0018).",
    ),
    chapters: ["brush-render-authority"],
  },
  {
    id: "vello",
    category: "brush",
    term: t("Vello", "Vello"),
    definition: t(
      "GPU에서 벡터 그래픽을 그리는 차세대 렌더러입니다. CPU가 아니라 그래픽카드가 곡선을 계산합니다.",
      "A next-generation vector renderer that draws on the GPU — the graphics card computes the curves, not the CPU.",
    ),
    analogy: t(
      "손으로 한 장씩 뜨개질하던 걸 기계 편직기로 바꾸는 것과 같습니다. 복잡한 곡선이 많아질수록 차이가 벌어집니다.",
      "Like switching from hand-knitting to a machine loom: the more complex the curves, the bigger the gap.",
    ),
    inToonstudio: t(
      "ADR-0018은 Vello(WebGPU/WASM)를 2D 문서 픽셀 권한의 목표 엔진으로 정했지만, 현재 /studio 문서 표시 슬롯은 ADR-0025의 Skia CanvasKit WebGL2 보존 표면이 맡습니다. 원장에서 Vello Classic·Hybrid GPU는 명시 선택하는 provider, Vello CPU는 비교 전용 reference이며, Vello가 아직 표현하지 못하는 텍스트·이미지·일부 필터는 작업 전에 선언되는 legacy 경계입니다. 'WebGPU를 썼다'는 말 자체가 품질 보증이 아니라는 원칙 아래 출력 특성·메모리·색을 따로 측정합니다.",
      "ADR-0018 names Vello (WebGPU/WASM) the target engine for 2D document pixel authority, but today the /studio document display slot belongs to the retained Skia CanvasKit WebGL2 surface of ADR-0025. In the ledger the Vello Classic and Hybrid GPU lanes are explicitly selected providers and Vello CPU is a comparison-only reference, while text, images and some filters Vello cannot yet express are a legacy boundary declared before the job. Under the principle that 'uses WebGPU' is not itself a quality guarantee, output, memory and color are measured separately.",
    ),
    chapters: ["brush-render-authority"],
  },
  {
    id: "thorvg",
    category: "brush",
    term: t("ThorVG", "ThorVG"),
    definition: t(
      "가볍고 빠른 벡터 그래픽 라이브러리입니다. 저사양 기기에서도 벡터를 그릴 수 있게 설계됐습니다.",
      "A lightweight, fast vector graphics library designed to render vectors even on low-end devices.",
    ),
    analogy: t(
      "연비 좋은 경차와 같습니다. 고속도로(고성능 GPU)가 없어도 목적지(벡터 렌더링)까지 갑니다.",
      "Like a fuel-efficient compact car: it reaches the destination (vector rendering) without needing a highway (high-end GPU).",
    ),
    inToonstudio: t(
      "Vello가 표현하지 못하는 안전한 filter·mask·text 같은 SVG 자산을 위해 작업 전에 명시 선택하는 전문 provider입니다. 문서 권위가 아니며 Vello 실패 뒤 대신 실행되는 엔진도 아니고, 지원 범위를 명시합니다.",
      "A specialist provider chosen before the job for SVG assets with safe filters, masks and text that Vello cannot express. It is neither document authority nor an engine that runs after Vello fails, and its supported scope is stated explicitly.",
    ),
    chapters: ["brush-render-authority"],
  },
  {
    id: "dirty-bounds",
    category: "brush",
    term: t("Dirty bounds (바뀐 영역만 다시 그리기)", "Dirty bounds"),
    definition: t(
      "화면 전체가 아니라 실제로 바뀐 사각형 영역만 다시 그리는 최적화입니다.",
      "An optimization that repaints only the changed rectangle instead of the whole screen.",
    ),
    analogy: t(
      "벽지 전체를 다시 바르는 게 아니라, 낙서된 부분만 도배하는 것과 같습니다.",
      "Like re-wallpapering only the scribbled patch instead of the whole wall.",
    ),
    inToonstudio: t(
      "Hokusai 래퍼가 dirtyFrame()으로 바뀐 영역을 64px 타일 단위로 반환합니다. 지우개로 투명해진 픽셀까지 포함하도록 보수적으로 잡습니다.",
      "The Hokusai wrapper returns changed regions via dirtyFrame() in 64 px tiles — conservatively including pixels erased back to transparent.",
    ),
    chapters: ["brush-engine"],
  },
  // ── 웹 플랫폼 ──────────────────────────────────────────────────
  {
    id: "pwa",
    category: "web",
    term: t("PWA (프로그레시브 웹 앱)", "PWA (Progressive Web App)"),
    definition: t(
      "웹사이트를 앱처럼 설치·실행하게 만드는 기술 묶음입니다. 오프라인 동작과 홈 화면 설치가 핵심입니다.",
      "A bundle of techniques that lets a website install and run like an app — offline support and home-screen install at its core.",
    ),
    analogy: t(
      "푸드트럭이 단골 자리에 가게를 차리는 것과 같습니다. 길(웹)에서 시작했지만, 이제는 자리(홈 화면)가 있습니다.",
      "Like a food truck opening a permanent spot: it started on the road (the web) but now has its own place (the home screen).",
    ),
    inToonstudio: t(
      "오프라인 드로잉 구조와 함께 씁니다. '오프라인 = 전부 된다'가 아니라, 그림 그리기처럼 미리 준비된 범위만 보장한다는 원칙입니다.",
      "Used together with the offline drawing structure. The principle: offline is a prepared scope — like drawing — not a blanket promise.",
    ),
    chapters: ["pwa-continuity", "pwa-safe-update"],
  },
  {
    id: "service-worker",
    category: "web",
    term: t("Service Worker", "Service Worker"),
    definition: t(
      "브라우저가 페이지와 별도로 띄우는 백그라운드 일꾼입니다. 네트워크 요청을 가로채 캐시를 서빙합니다.",
      "A background worker the browser runs separately from pages. It intercepts network requests and serves caches.",
    ),
    analogy: t(
      "가게 앞에 서 있는 점원과 같습니다. 손님(페이지 요청)이 오면 창고(캐시)에 있는 걸 먼저 내주고, 없으면 본사(서버)에 주문합니다.",
      "Like a clerk at the shop entrance: serves from the stockroom (cache) first, orders from HQ (server) only when it's missing.",
    ),
    inToonstudio: t(
      "src/app/service-worker/ — GET 자산만 캐시하고, 업데이트는 사용자 동의 없이 밀어내지 않습니다. 원고 작업 중 업데이트가 덮어쓰는 사고를 막는 게 핵심 설계입니다.",
      "src/app/service-worker/ — caches only GET assets and never pushes updates without consent. The core design goal: an update must never displace an active manuscript.",
    ),
    chapters: ["pwa-continuity", "pwa-safe-update"],
  },
  {
    id: "offline-shell",
    category: "web",
    term: t("오프라인 셸 · 긴급 드로잉", "Offline shell · emergency drawing"),
    definition: t(
      "인터넷이 끊겨도 최소 기능(그리기)이 돌아가도록 미리 저장해 둔 독립 실행 화면입니다.",
      "A self-contained screen saved in advance so core features (drawing) keep working with no internet.",
    ),
    analogy: t(
      "비상용 랜턴과 같습니다. 정전(네트워크 단절) 때 집 전체를 밝힐 순 없지만, 당장 필요한 불은 켤 수 있습니다.",
      "Like an emergency lantern: it won't light the whole house during a blackout, but it lights what you need right now.",
    ),
    inToonstudio: t(
      "/offline-draw/index.html — 서비스워커가 미리 받아 두는 독립 HTML입니다. 로컬 드로잉 구조(local drawing rescue)와 연결돼 작업 중인 그림을 지킵니다.",
      "/offline-draw/index.html — a standalone HTML the service worker precaches, wired to the local drawing rescue so work-in-progress survives.",
    ),
    chapters: ["pwa-continuity"],
  },
  {
    id: "opfs",
    category: "web",
    term: t("OPFS", "OPFS (Origin Private File System)"),
    definition: t(
      "웹사이트 전용 로컬 파일 공간입니다. 브라우저 안에 있지만 파일처럼 읽고 쓸 수 있습니다.",
      "Private local file space for one website. Lives in the browser but reads/writes like files.",
    ),
    analogy: t(
      "호텔 금고와 같습니다. 그 호텔(사이트) 투숙객만 열 수 있고, 체크아웃(데이터 삭제)하면 사라집니다.",
      "Like a hotel safe: only that hotel's (site's) guest opens it, and checkout (data deletion) clears it.",
    ),
    inToonstudio: t(
      "원고·에셋의 로컬 저장소입니다. OPFS 복구 journal과 로컬 SQLite Worker가 이 공간을 씁니다. 단, 다운로드 폴더나 영구 백업이 아니라는 점을 사용자에게 숨기지 않습니다.",
      "Local storage for manuscripts and assets: the OPFS recovery journal and the local SQLite worker use this space — with the honest caveat that it is not the Downloads folder or a permanent backup.",
    ),
    chapters: ["storage", "browser-local-first"],
  },
  {
    id: "web-worker",
    category: "web",
    term: t("Web Worker", "Web Worker"),
    definition: t(
      "화면(UI) 스레드와 별도로 돌아가는 자바스크립트 일꾼입니다. 무거운 계산을 옮겨 화면 멈춤을 막습니다.",
      "A JavaScript worker running off the UI thread. Moves heavy computation so the screen never freezes.",
    ),
    analogy: t(
      "주방 보조와 같습니다. 홀(화면)은 손님 응대에 집중하고, 무거운 설거지(연산)는 뒤에서 보조가 합니다.",
      "Like a kitchen assistant: the dining room (UI) serves guests while heavy dishwashing (computation) happens backstage.",
    ),
    inToonstudio: t(
      "렌더·연산·저장을 작업별 Worker로 분리합니다. 단, '보냈다 = 끝났다'가 아니라 작업 ID·문서 버전·취소 처리를 묶은 완료 계약을 둡니다.",
      "Rendering, compute and persistence each get their own worker — bound by a completion contract of job IDs, document versions and cancellation, because sent ≠ done.",
    ),
    chapters: ["worker-architecture", "worker-job-boundary"],
  },
  {
    id: "offscreen-canvas",
    category: "web",
    term: t("OffscreenCanvas", "OffscreenCanvas"),
    definition: t(
      "화면에 붙지 않은 캔버스를 Worker에서 직접 그릴 수 있게 하는 API입니다.",
      "An API that lets a worker draw directly onto a canvas detached from the visible page.",
    ),
    analogy: t(
      "무대 뒤에서 그림을 그려 완성된 것만 무대에 올리는 것과 같습니다. 관객(사용자)은 붓질 과정을 보지 않습니다.",
      "Like painting backstage and revealing only the finished piece — the audience never sees the brushwork.",
    ),
    inToonstudio: t(
      "apps/web/src 의 비테스트 22개 파일이 new OffscreenCanvas(로 화면에 붙지 않은 캔버스를 만들고, 그중 8개가 *.worker.ts입니다(절차형 브러시의 WebGL2 표면, GPU 브리슬·네이티브 브러시 시험의 WebGPU 표면, Hokusai·VRM·3D 샷의 PNG 인코딩 등). 화면에 보이는 캔버스를 Worker로 넘기는 transferControlToOffscreen은 쓰지 않습니다(0건).",
      "In apps/web/src, 22 non-test files create detached canvases with new OffscreenCanvas(, and 8 of them are *.worker.ts files (the procedural brush WebGL2 surface, WebGPU surfaces for the GPU bristle and native-brush probes, PNG encoding for Hokusai, VRM and 3D shots, and more). transferControlToOffscreen, which hands the visible canvas to a worker, is not used (zero occurrences).",
    ),
    chapters: ["worker-architecture", "brush-render-authority"],
  },
  {
    id: "webgpu",
    category: "web",
    term: t("WebGPU", "WebGPU"),
    definition: t(
      "브라우저에서 GPU에 직접 그래픽·연산 작업을 시키는 최신 API입니다. WebGL의 후계자입니다.",
      "The modern API for GPU graphics and compute in the browser — WebGL's successor.",
    ),
    analogy: t(
      "자전거(WebGL)에서 오토바이(WebGPU)로 바꾸는 것과 같습니다. 빠르지만 면허(장치 지원 확인)와 안전장비(메모리·품질 검증)가 필요합니다.",
      "Like upgrading from bicycle (WebGL) to motorcycle (WebGPU): faster, but you need a license (capability checks) and safety gear (memory/quality validation).",
    ),
    inToonstudio: t(
      "'WebGPU를 썼다'는 사실 자체를 품질 주장으로 쓰지 않습니다. 장치 지원·메모리·출력 색을 경로마다 따로 측정합니다.",
      "We never use 'uses WebGPU' as a quality claim by itself. Capability, memory and output color are measured per path.",
    ),
    chapters: ["brush-render-authority"],
  },
  // ── 3D · 공간 ──────────────────────────────────────────────────
  {
    id: "threejs",
    category: "spatial",
    term: t("Three.js", "Three.js"),
    definition: t(
      "브라우저 3D의 사실상 표준 라이브러리입니다. 장면·카메라·조명·재질을 코드로 다룹니다.",
      "The de-facto standard library for 3D in the browser — scenes, cameras, lights and materials in code.",
    ),
    analogy: t(
      "3D 영화 촬영 세트와 같습니다. 카메라 위치, 조명, 소품을 코드로 배치하고 렌더링 버튼을 누릅니다.",
      "Like a film set: place cameras, lights and props in code, then hit render.",
    ),
    inToonstudio: t(
      "3D 씬의 기반입니다. VRM 마네킹·Magic Poser 스타일 포즈 도구, 3D 배경(bg3d), 공간 웹툰 리더가 Three.js 위에서 돕니다. 가상 스튜디오 월드는 Phaser 2D 장면이라 Three.js 를 쓰지 않습니다.",
      "The foundation of 3D scenes. The VRM mannequin and Magic Poser-style posing tools, the 3D backgrounds (bg3d) and the spatial webtoon reader run on Three.js. The virtual-studio world is a Phaser 2D scene and does not use Three.js.",
    ),
    chapters: ["web-3d-engine", "threejs-r3f"],
  },
  {
    id: "r3f",
    category: "spatial",
    term: t("R3F (React Three Fiber)", "R3F (React Three Fiber)"),
    definition: t(
      "Three.js를 React 컴포넌트처럼 쓰게 해주는 다리입니다. 3D 장면을 JSX로 선언합니다.",
      "A bridge for using Three.js as React components — declare 3D scenes in JSX.",
    ),
    analogy: t(
      "외국 영화에 자막을 입히는 것과 같습니다. 내용(Three.js)은 그대로, 말하는 방식(React)만 바꿉니다.",
      "Like subtitling a foreign film: the content (Three.js) stays, only the language (React) changes.",
    ),
    inToonstudio: t(
      "3D UI를 React 상태와 자연스럽게 묶기 위해 씁니다. 화면(UI) 상태와 3D 장면 상태가 따로 놀지 않게 합니다.",
      "Used to bind 3D UI to React state naturally, so UI state and 3D scene state never drift apart.",
    ),
    chapters: ["threejs-r3f", "web-3d-engine"],
  },
  {
    id: "vrm",
    category: "spatial",
    term: t("VRM", "VRM"),
    definition: t(
      "3D 캐릭터(아바타) 파일의 공개 규격입니다. 누가 만들어도 같은 뼈대 구조를 따릅니다.",
      "An open specification for 3D character (avatar) files — same bone structure no matter who authored it.",
    ),
    analogy: t(
      "캐릭터계의 USB 규격과 같습니다. 어느 회사 옷(VRM 파일)을 입혀도 몸(앱)에 맞습니다.",
      "Like USB for characters: any brand's outfit (VRM file) fits the body (the app).",
    ),
    inToonstudio: t(
      "VRM 포즈 도구·아바타 포지·3D 배경 마네킹·웹캠 추적이 쓰는 캐릭터 규격입니다. 표정·시선·포즈를 표준 휴머노이드 뼈대로 주고받습니다(가상 스튜디오 아바타는 VRM 이 아니라 2D 스프라이트 시트와 SVG 피규어).",
      "The character spec used by the VRM posing tools, the avatar forge, the 3D-background mannequin and webcam tracking. Expressions, gaze and poses travel on a standard humanoid skeleton (virtual-studio avatars are 2D sprite sheets and SVG figures, not VRM).",
    ),
    chapters: ["vrm-standard", "web-3d-engine"],
  },
  {
    id: "gltf",
    category: "spatial",
    term: t("glTF / GLB", "glTF / GLB"),
    definition: t(
      "3D 장면·모델을 주고받는 표준 파일 형식입니다. '3D계의 JPEG'이라 불립니다.",
      "The standard file format for exchanging 3D scenes and models — called the 'JPEG of 3D'.",
    ),
    analogy: t(
      "3D 프린터용 설계도 봉투와 같습니다. 봉투 안에 재료(텍스처)·조립도(씬 구조)가 함께 들어 있습니다.",
      "Like an envelope of blueprints for 3D printing: materials (textures) and assembly instructions (scene graph) inside.",
    ),
    inToonstudio: t(
      "에셋 입출력 형식입니다. 확장 기능·텍스처·스케일 호환성은 glTF Transform 같은 도구로 검사합니다.",
      "The asset interchange format. Extensions, textures and scale compatibility are inspected with tools like glTF Transform.",
    ),
    chapters: ["web-3d-dcc-pipeline"],
  },
  {
    id: "lt-conversion",
    category: "spatial",
    term: t("LT 변환 (Lineart Tone)", "LT conversion"),
    definition: t(
      "3D 렌더를 만화의 선화·톤 느낌으로 바꾸는 변환입니다. 3D를 밑그림으로 쓰는 핵심 기술입니다.",
      "Converts a 3D render into comic-style lineart and tones — the key tech for using 3D as drawing reference.",
    ),
    analogy: t(
      "사진을 먹선 드로잉으로 바꿔주는 필터가 아니라, '밑그림 생성기'입니다. 작가가 그 위에 바로 펜을 댈 수 있습니다.",
      "Not a photo filter but an underdrawing generator — the artist can ink directly on top.",
    ),
    inToonstudio: t(
      "3D 배경·소품을 웹툰 작화 파이프라인에 넣는 연결점입니다. 3D를 보여주기용이 아니라 '그릴 수 있는 재료'로 씁니다.",
      "The joint where 3D backgrounds and props enter the webtoon pipeline — 3D as drawable material, not decoration.",
    ),
    chapters: ["web-3d-engine"],
  },
  {
    id: "ik",
    category: "spatial",
    term: t("IK (역운동학)", "IK (Inverse Kinematics)"),
    definition: t(
      "손·발의 목표 위치를 정하면 팔·다리 관절 각도를 역으로 계산하는 방법입니다.",
      "Given a target for the hand or foot, computes the arm/leg joint angles backwards.",
    ),
    analogy: t(
      "인형의 손을 잡아끌면 팔꿈치가 알아서 구부러지는 것과 같습니다. 어깨부터 정하는 게 아니라 손 위치부터 정합니다.",
      "Like pulling a doll's hand and watching the elbow bend on its own — you set the hand first, not the shoulder.",
    ),
    inToonstudio: t(
      "포즈 도구의 핵심입니다. 작가가 손 위치만 찍으면 자연스러운 팔 자세가 계산됩니다.",
      "The core of the posing tool: the artist places the hand, and a natural arm pose is computed.",
    ),
    chapters: ["vrm-standard"],
  },
  // ── 협업 · 연결 ────────────────────────────────────────────────
  {
    id: "webrtc",
    category: "collab",
    term: t("WebRTC", "WebRTC"),
    definition: t(
      "브라우저끼리 서버를 거치지 않고 음성·영상·데이터를 직접 주고받는 표준입니다.",
      "The standard for browsers to exchange voice, video and data directly, without a server in the middle.",
    ),
    analogy: t(
      "전화 교환원을 거치지 않는 직통 전화와 같습니다. 연결만 도와주면(시그널링), 통화는 둘 사이에서 오갑니다.",
      "Like a direct line with no operator: help with the connection (signaling), then the call flows peer to peer.",
    ),
    inToonstudio: t(
      "가상 스튜디오의 음성·화면 공유용입니다. 허들의 SDP·ICE와 채팅은 DataChannel 직접 레인(studio-direct-v1)으로 오가고, 방 서버는 입장·presence·화면 공유 신호와 직통 통로를 처음 여는 신호를 맡습니다. '대화 연결'과 '문서 동기화'는 같은 선이 아니며 문서는 별도 채널·권한으로 다룹니다.",
      "For voice and screen share in the virtual studio. Huddle SDP, ICE and chat travel over the DataChannel direct lane (studio-direct-v1) while the room server handles admission, presence, screen-share signals and the first signal that opens the direct channel. The call connection is not the document sync channel — documents travel separately with their own authority.",
    ),
    chapters: ["webrtc-media-authority", "webrtc-standard"],
  },
  {
    id: "crdt",
    category: "collab",
    term: t("CRDT", "CRDT"),
    definition: t(
      "여러 사람이 동시에 고쳐도 정해진 규칙으로 자동 병합되는 데이터 구조입니다.",
      "A data structure that merges simultaneous edits by fixed rules, automatically.",
    ),
    analogy: t(
      "구글 문서의 '충돌 없는 합치기' 뒤에 있는 수학과 같습니다. 누가 먼저 썼는지 따지지 않고 규칙대로 합칩니다.",
      "The math behind Google Docs' conflict-free merging: no arguing over who wrote first, just merge by rule.",
    ),
    inToonstudio: t(
      "협업 편집의 병합 규칙용입니다. 다만 CRDT가 권한(누가 볼 수 있나)이나 모든 파일 충돌을 해결해주지는 않습니다. 의미적 범위를 정해 둡니다.",
      "Used for merge rules in collaborative editing — scoped honestly: it doesn't solve authorization or every file conflict.",
    ),
    chapters: ["collaborative-crdt-boundary", "crdt-semantic-scope"],
  },
  {
    id: "virtual-studio",
    category: "collab",
    term: t("가상 스튜디오", "Virtual studio"),
    definition: t(
      "아바타로 모여 회의·협업하는 2D/3D 가상 공간입니다. Gather·oVice류의 방식입니다.",
      "A 2D/3D virtual space where avatars meet and collaborate — in the style of Gather or oVice.",
    ),
    analogy: t(
      "화상회의가 '전화'라면 가상 스튜디오는 '사무실'입니다. 옆 사람에게 걸어가 말을 거는 식의 거리가 있습니다.",
      "If video calls are phone calls, the virtual studio is an office — you walk over to someone to talk.",
    ),
    inToonstudio: t(
      "8방향 스프라이트·관성 물리·근접 음성·NPC가 들어간 협업 공간입니다. 회의실 입장 시 자동 '회의 중' 전환, 화이트보드·이젤 상호작용이 있습니다.",
      "A collaboration space with 8-direction sprites, inertial physics, proximity voice and NPCs — auto 'in meeting' on room entry, whiteboard/easel interactions.",
    ),
    chapters: ["virtual-studio-world-authority", "spatial-collaboration-products"],
  },
  {
    id: "oauth",
    category: "collab",
    term: t("OAuth · SNS 로그인", "OAuth · Social login"),
    definition: t(
      "구글·카카오 같은 기존 계정으로 로그인하는 표준입니다. 비밀번호를 우리 서버에 주지 않습니다.",
      "The standard for 'log in with Google/Kakao'. Your password never reaches our server.",
    ),
    analogy: t(
      "호텔 프런트에 신분증을 맡기는 것과 같습니다. 방 키(토큰)는 받지만, 집 열쇠(비밀번호)는 주지 않습니다.",
      "Like leaving an ID at a hotel front desk: you get a room key (token) without handing over your house key (password).",
    ),
    inToonstudio: t(
      "소셜 계정 생명주기(연결·해제·탈퇴 시 처리)를 따로 설계했습니다. 로그인 성공 뒤에도 작품 접근 권한은 계속 확인합니다.",
      "The social-account lifecycle (link, unlink, withdrawal) is designed separately. Authorization checks continue even after a successful login.",
    ),
    chapters: ["social-identity-lifecycle", "authentication"],
  },
  {
    id: "share",
    category: "collab",
    term: t("SNS 공유하기", "Social sharing"),
    definition: t(
      "작품을 외부 SNS에 퍼뜨리는 기능입니다. 미리보기 카드(OG 태그)가 클릭을 좌우합니다.",
      "Sharing works to external social apps. The preview card (OG tags) decides the click.",
    ),
    analogy: t(
      "책 표지와 같습니다. 내용이 좋아도 표지(미리보기)가 별로면 집어 들지 않습니다.",
      "Like a book cover: great content still needs a cover (preview card) people want to pick up.",
    ),
    inToonstudio: t(
      "공유 경계(어디까지 내보낼 수 있나)와 원본 권리를 분리합니다. 공유된 이미지가 원본 문서의 권한을 바꾸지 않습니다.",
      "The share boundary (what may leave) is separate from source rights — a shared image never changes the source document's permissions.",
    ),
    chapters: ["share-distribution", "share-distribution-boundary"],
  },
  // ── 사운드 · 모션 ──────────────────────────────────────────────
  {
    id: "procedural-bgm",
    category: "sound",
    term: t("프로시저럴 BGM", "Procedural BGM"),
    definition: t(
      "음악 파일을 재생하는 게 아니라, 코드가 실시간으로 작곡·연주하는 배경음악입니다.",
      "Background music composed and performed live by code — no audio files played back.",
    ),
    analogy: t(
      "CD를 트는 게 아니라 피아니스트를 앉혀 두는 것과 같습니다. 분위기(무드)가 바뀌면 연주도 바뀝니다.",
      "Like seating a pianist instead of playing a CD: when the mood changes, the performance changes.",
    ),
    inToonstudio: t(
      "Web Audio API의 오실레이터+생성형 리버브만 쓰는 엔진(shared/bgm/bgm-engine.ts)이 있고, 모션 웹툰 재생에서 씁니다. 페이지 무드(home/studio/draw…)마다 스케일·템포 프리셋이 바뀝니다. 사이트 전체 배경음악 플레이어는 이 엔진이 아니라 승인된 오리지널 OST 15곡(ACE-Step으로 생성한 MP3, provenance 기록)을 재생하고 합성음으로 대체하지 않습니다.",
      "An engine built only on Web Audio oscillators and generative reverb (shared/bgm/bgm-engine.ts) exists and is used for motion-webtoon playback, with scale and tempo presets per page mood (home, studio, draw, …). The site-wide background-music player does not use it: it plays 15 approved original OST tracks (MP3s generated with ACE-Step, provenance recorded) and never substitutes synthesized sound.",
    ),
    chapters: ["delivery"],
  },
  {
    id: "web-audio",
    category: "sound",
    term: t("Web Audio API", "Web Audio API"),
    definition: t(
      "브라우저에서 소리를 합성·가공하는 표준 API입니다. 오실레이터·필터·이펙트를 노드 그래프로 연결합니다.",
      "The standard API for synthesizing and processing sound in the browser — oscillators, filters and effects wired as a node graph.",
    ),
    analogy: t(
      "모듈러 신디사이저와 같습니다. 소리 나는 상자, 깎는 필터, 울림 통을 케이블로 연결합니다.",
      "Like a modular synthesizer: wire up sound boxes, carving filters and echo chambers with cables.",
    ),
    inToonstudio: t(
      "프로시저럴 BGM 엔진(shared/bgm/bgm-engine.ts)의 바탕입니다. 자동재생 정책 때문에 AudioContext는 반드시 사용자 클릭/탭 안에서 생성하고, 음성 안내가 나오면 BGM을 살짝 낮추는 덕킹(voice-bgm-ducking.ts)을 겁니다.",
      "The basis of the procedural BGM engine (shared/bgm/bgm-engine.ts). Autoplay policy forces AudioContext creation inside a user gesture, and voice guidance ducks the BGM down (voice-bgm-ducking.ts).",
    ),
    chapters: ["delivery"],
  },
  {
    id: "remotion",
    category: "sound",
    term: t("Remotion", "Remotion"),
    definition: t(
      "React 코드로 영상을 만드는 프레임워크입니다. 디자인을 코드로 짜면 MP4로 렌더링됩니다.",
      "A framework for making videos with React code — design in code, render to MP4.",
    ),
    analogy: t(
      "파워포인트가 아니라 '영상용 프로그래밍'입니다. 슬라이드를 손으로 배치하는 대신, 움직임을 수식으로 씁니다.",
      "Not PowerPoint but programming for video: write motion as formulas instead of placing slides by hand.",
    ),
    inToonstudio: t(
      "브랜드·기술 영상 패키지(tools/media/brand-film)의 제작 파이프라인이고, 웹 앱의 제품 투어(/product-tour) 재생기도 remotion·@remotion/player runtime을 씁니다. 프레임·재생 제어·오디오를 코드로 동기화해 같은 구성을 반복해서 뽑아내지만, 바이트 단위로 동일한지는 검증한 적이 없습니다. Remotion은 자체 라이선스라 조직·렌더 방식별 자격은 저장소로 확인할 수 없습니다.",
      "The production pipeline for the brand and technology film packages (tools/media/brand-film), and the web app's product-tour (/product-tour) player also uses the remotion and @remotion/player runtime. Frames, playback and audio are synced in code so the same composition can be rendered repeatedly, but byte-identical output has never been verified. Remotion has its own license, and eligibility by organization and render mode cannot be confirmed from the repository.",
    ),
    chapters: ["delivery"],
  },
  // ── AI ─────────────────────────────────────────────────────────
  {
    id: "ai-routing",
    category: "ai",
    term: t("AI 라우팅 (비용 라우터)", "AI routing (cost router)"),
    definition: t(
      "작업 의도를 공급자 API와 분리하고, 허용된 무료 경로부터 순서대로 시도하되 유료 경로는 사용자가 승인해야만 쓰는 분기 장치입니다.",
      "A dispatcher that separates task intent from provider APIs, tries allowlisted free paths in order and uses paid paths only with user approval.",
    ),
    analogy: t(
      "심부름을 맡길 사람을 정하는 반장과 같습니다. 먼저 무료로 도와줄 사람을 찾고, 돈이 드는 전문가는 허락을 받은 뒤에만 부릅니다.",
      "Like a class rep assigning errands: first find someone who helps for free, and call a paid specialist only after getting permission.",
    ),
    inToonstudio: t(
      "'무료 우선 설계'의 핵심입니다. 돈이 드는 지점을 숨기지 않고 드러내며, AI 제안과 사람 확정을 나눕니다.",
      "The heart of free-first design: cost boundaries stay visible, and AI proposals stay separate from human approval.",
    ),
    chapters: ["free-ai-routing", "free-ai-cost-router", "cost-engineering"],
  },
  {
    id: "local-ai",
    category: "ai",
    term: t("브라우저 로컬 AI", "In-browser AI"),
    definition: t(
      "서버가 아니라 사용자 브라우저 안에서 직접 돌리는 AI입니다. 입력 데이터는 서버로 보내지 않지만 모델 파일은 따로 내려받아야 합니다.",
      "AI that runs inside the user's browser, not on a server. Input data is not sent to a server, but the model files still have to be downloaded.",
    ),
    analogy: t(
      "집에서 요리하는 것과 같습니다. 식당(서버)에 재료를 맡기지 않으니 빠르고 비밀도 지켜집니다.",
      "Like cooking at home: no handing ingredients to a restaurant (server) — faster and private.",
    ),
    inToonstudio: t(
      "ONNX Runtime Web과 MediaPipe를 실제로 씁니다. ONNX는 기능 5종, 모델 파일 6개(AnimeGAN만 파일 2개, 합계 119,438,571바이트, 파일은 모두 sha256 고정)로 자체 배포 자산이고, MediaPipe 모델은 storage.googleapis.com에서 런타임에 내려받으며 배경 제거 모델은 latest 리비전을 따라갑니다. 포즈 스캔 같은 가벼운 비전 작업을 브라우저 안에서 처리합니다.",
      "ONNX Runtime Web and MediaPipe are actually in use. ONNX covers five features with six model files (only AnimeGAN has two files, 119,438,571 bytes in total, every file pinned by sha256) shipped as our own assets, while MediaPipe models are downloaded at runtime from storage.googleapis.com and the background-removal model tracks a floating latest revision. Light vision tasks such as pose scanning run inside the browser.",
    ),
    chapters: ["browser-local-compute"],
  },
  {
    id: "onnx",
    category: "ai",
    term: t("ONNX Runtime Web", "ONNX Runtime Web"),
    definition: t(
      "학습된 AI 모델을 브라우저에서 돌리는 실행기입니다. 파이썬 서버 없이 추론이 됩니다.",
      "A runner for trained AI models in the browser — inference with no Python server.",
    ),
    analogy: t(
      "게임 카트리지를 가정용 게임기에 꽂는 것과 같습니다. 개발기(학습 서버) 없이도 집에서 돌아갑니다.",
      "Like slotting a game cartridge into a home console: it runs at home without the dev kit (training server).",
    ),
    inToonstudio: t(
      "선화 채색·엣지 추출·업스케일·배경 분리·애니메이션풍 변환 기능 5종(모델 파일 6개, AnimeGAN만 파일 2개, 파일은 모두 sha256 고정)이 실제로 이 실행기 위에서 돕니다. 모델 크기·WASM/GPU 실행 제공자·첫 실행 대기시간을 함께 봅니다.",
      "Five features—line-art colorizing, edge extraction, upscaling, background separation and anime-style conversion—actually run on this runtime, with six model files (only AnimeGAN has two files, every file pinned by sha256). Model size, WASM/GPU execution providers and first-run latency are evaluated together.",
    ),
    chapters: ["browser-local-compute"],
  },
  {
    id: "mediapipe",
    category: "ai",
    term: t("MediaPipe", "MediaPipe"),
    definition: t(
      "구글의 실시간 비전 AI 파이프라인입니다. 손·얼굴·포즈 추적 등을 브라우저에서도 돌릴 수 있습니다.",
      "Google's real-time vision AI pipeline — hand, face and pose tracking, runnable in the browser.",
    ),
    analogy: t(
      "웹캠을 '보는 눈'으로 바꾸는 안경과 같습니다. 화면 속 사람의 관절 위치를 숫자로 읽어냅니다.",
      "Glasses that turn a webcam into seeing eyes — reading a person's joint positions as numbers.",
    ),
    inToonstudio: t(
      "웹캠 포즈·손·얼굴 추적과 배경 제거, 아바타 참조 추천에 쓰는 비전 백엔드입니다. 카메라 앞에서 포즈를 잡으면 3D 캐릭터 뼈대에 매핑합니다. 모델 파일은 storage.googleapis.com에서 런타임에 내려받고, 배경 제거 모델만 latest 리비전을 따라갑니다.",
      "The vision backend for webcam pose, hand and face tracking, background removal and avatar-reference recommendation: strike a pose in front of the camera and it is mapped onto a 3D character's bones. Model files are downloaded at runtime from storage.googleapis.com, and only the background-removal model follows a floating latest revision.",
    ),
    chapters: ["browser-local-compute", "vrm-standard"],
  },
  // ── 개발 문화 · 배포 ───────────────────────────────────────────
  {
    id: "adr",
    category: "craft",
    term: t("ADR (아키텍처 결정 기록)", "ADR (Architecture Decision Record)"),
    definition: t(
      "'왜 이렇게 만들었나'를 짧게 남기는 문서입니다. 코드가 이유를 말해주지 않기 때문입니다.",
      "A short note on 'why we built it this way' — because code never explains its reasons.",
    ),
    analogy: t(
      "요리 레시피 옆에 붙은 메모와 같습니다. '소금을 나중에 넣는 이유: …'가 없으면 다음 사람이 함부로 바꿉니다.",
      "Like a margin note on a recipe: without 'why salt goes in late', the next cook changes it carelessly.",
    ),
    inToonstudio: t(
      "스태빌라이저(ADR 0005), libmypaint 레인(ADR-0011)처럼 번호를 붙여 관리합니다. 발표의 '왜 이 기술을 골랐나' 이야기는 승인된(Accepted) ADR에서 가져오고, Proposed 상태인 ADR은 구현으로 소개하지 않습니다.",
      "Numbered and maintained — stabilizer (ADR 0005), the libmypaint lane (ADR-0011). The 'why this tech' stories in the talk come from Accepted ADRs, and ADRs still Proposed are not presented as implemented.",
    ),
    chapters: ["ai-assisted-engineering"],
  },
  {
    id: "monorepo",
    category: "craft",
    term: t("모노레포", "Monorepo"),
    definition: t(
      "여러 패키지·앱을 하나의 저장소에서 함께 관리하는 방식입니다.",
      "Managing multiple packages and apps together in one repository.",
    ),
    analogy: t(
      "각자 다른 건물에 사는 대신 한 아파트 단지에 사는 것과 같습니다. 엘리베이터(공유 패키지)로 오가기 쉽습니다.",
      "Like living in one apartment complex instead of separate buildings — easy to visit via the elevator (shared packages).",
    ),
    inToonstudio: t(
      "apps/web(앱)와 packages/studio-*(엔진들)가 한 저장소입니다. 브러시 엔진을 고치면 앱에서 바로 검증할 수 있습니다.",
      "apps/web and packages/studio-* live in one repo, so a brush-engine fix can be verified in the app immediately.",
    ),
    chapters: ["architecture"],
  },
  {
    id: "reproducible-build",
    category: "craft",
    term: t("재현 가능 빌드", "Reproducible build"),
    definition: t(
      "누가·언제 빌드해도 바이트 단위로 똑같은 결과물이 나오는 빌드입니다.",
      "A build that produces byte-identical output no matter who builds it or when.",
    ),
    analogy: t(
      "금고 지문과 같습니다. 결과물의 해시(INTEGRITY.sha256)가 하나라도 다르면 '누군가 손댔다'는 증거가 됩니다.",
      "Like a safe's fingerprint: if the artifact hash (INTEGRITY.sha256) differs by one bit, something was tampered with.",
    ),
    inToonstudio: t(
      "Hokusai WASM은 상용 릴리스에서 두 번 독립 빌드해 바이트 일치를 강제합니다. 툴체인·시간·로케일까지 고정합니다.",
      "Hokusai WASM release builds run twice independently and must match byte-for-byte — toolchain, timestamps and locale all pinned.",
    ),
    chapters: ["brush-engine"],
  },
  {
    id: "i18n",
    category: "craft",
    term: t("i18n (국제화)", "i18n (Internationalization)"),
    definition: t(
      "한 코드로 여러 언어를 지원하는 설계입니다. 한국어·영어 문구를 코드와 분리해 관리합니다.",
      "Designing one codebase to serve many languages — Korean/English copy kept separate from code.",
    ),
    analogy: t(
      "자막 파일과 같습니다. 영화(코드)는 하나, 자막(문구)만 갈아끼웁니다.",
      "Like subtitle files: one movie (code), swappable subtitles (copy).",
    ),
    inToonstudio: t(
      "기술 페이지 전체가 한·영 이중 언어로 쓰여 있습니다. 용어집의 모든 항목도 ko/en 쌍으로 관리됩니다.",
      "Every technology page ships in Korean and English. All glossary entries are maintained as ko/en pairs.",
    ),
    chapters: ["architecture"],
  },
  {
    id: "ci-cd",
    category: "craft",
    term: t("CI / CD", "CI / CD"),
    definition: t(
      "CI(지속 통합)는 코드를 합칠 때마다 자동 검사, CD(지속 배포)는 검사를 통과하면 자동 배포입니다.",
      "CI auto-tests every merge; CD auto-deploys what passes.",
    ),
    analogy: t(
      "공장 컨베이어벨트 위 검수원과 같습니다. 불량이면 벨트가 멈추고, 통과해야 다음 공정(배포)으로 갑니다.",
      "Like inspectors on a factory conveyor: defects stop the belt, only passing goods move to shipping (deploy).",
    ),
    inToonstudio: t(
      "main 머지 전 검증 파이프라인(CI)이 돕니다. 용어집·발표 자료를 고쳐도 테스트·타입검사가 깨지면 합쳐지지 않습니다. 다만 CD는 자동이 아닙니다. 머지는 배포 승인이 아니며, 운영 배포는 승인한 40자리 SHA 하나만 수동으로 올립니다(AGENTS.md).",
      "A verification pipeline (CI) guards the main branch — glossary or deck edits that break tests or typechecks don't merge. CD here is not automatic, though: a merge is not a deployment approval, and production ships only one approved 40-character SHA by manual release (AGENTS.md).",
    ),
    chapters: ["quality"],
  },
  {
    id: "oss-license",
    category: "craft",
    term: t("오픈소스 라이선스", "Open-source licenses"),
    definition: t(
      "오픈소스를 쓸 때 지켜야 하는 이용 조건입니다. MIT·Apache는 관대하고, GPL은 전염성이 있습니다.",
      "Usage terms for open source. MIT/Apache are permissive; GPL is contagious.",
    ),
    analogy: t(
      "레시피 공유 조건과 같습니다. '출처만 밝혀라'(MIT)와 '네 레시피도 공개해라'(GPL)는 전혀 다릅니다.",
      "Like recipe-sharing terms: 'credit me' (MIT) vs 'publish your recipe too' (GPL) are worlds apart.",
    ),
    inToonstudio: t(
      "/about/technology/licenses에 그룹별 의무·주의사항을 공개합니다. '오픈소스'라는 한 단어로 묶지 않고 도구마다 따로 검토합니다.",
      "Obligations and cautions per license group are published at /about/technology/licenses — reviewed tool by tool, never lumped as 'open source'.",
    ),
    chapters: ["licenses"],
  },
];

/** 기본 용어 + 확장 용어(engineering-glossary-more.ts)를 한 목록으로 합친다. */
export const ENGINEERING_GLOSSARY: readonly GlossaryTerm[] = [...BASE_GLOSSARY, ...ENGINEERING_GLOSSARY_MORE];

export const GLOSSARY_TERM_COUNT = ENGINEERING_GLOSSARY.length;
