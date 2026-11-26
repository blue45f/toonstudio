import { sampleSource, t } from "./engineering-atlas-web-platform-helpers";

import type { EngineeringAtlasEntry } from "./engineering-atlas-types";

/**
 * 기술 도감 · drawing · 초기 로컬 우선 아키텍처에서 Konva Phase 0→1-2 Vello 런타임 브리지·Wave 1–2 분리까지의 현대화 계보 카드.
 * 계약과 작성 규칙은 engineering-atlas-types.ts 를 따른다.
 */
export const ENGINEERING_ATLAS_DRAWING_LINEAGE: readonly EngineeringAtlasEntry[] = [
  {
    id: "konva-vello-lineage-phase12-bridge",
    category: "drawing",
    name: "Architecture Lineage & Vello Phase 1-2 Bridge",
    title: t("초기 로컬 권위에서 Konva→Vello 브리지까지 계보", "Foundational local authority to Konva→Vello Phase 1-2 lineage"),
    status: "experimental",
    tagline: t(
      "OPFS·Rights BOM·82% 뷰포트 기반 위에 Konva 59→1 분리와 피처 플래그 Vello 브리지를 세웠습니다.",
      "Builds Konva 59→1 decoupling and a feature-flagged Vello bridge on OPFS, Rights BOM and an 82% canvas.",
    ),
    background: [
      t(
        "ToonStudio 의 초기 아키텍처는 세 가지 바닥 원칙으로 시작했습니다. 첫째, SQLite WASM + OPFS 복구 저널이 기기 로컬 권위(Local-First Authority)를 맡아 서버 장애에도 원고가 남습니다. 둘째, Rights BOM 출판 전 라이선스 게이트(rights-bom-validator.ts)가 폰트·3D·소재 권리를 내보내기 전에 점검합니다. 셋째, 로그인 없이 곧장 그리는 비차단 게스트 진입과 캔버스 뷰포트 82% 이상(단일 44px 컨텍스트 바·7개 메뉴 예산)을 유지했습니다.",
        "ToonStudio began with three foundational pillars: SQLite WASM + OPFS recovery journals holding local-first authority so drafts survive outages, a Rights BOM pre-export license gate (rights-bom-validator.ts) checking fonts, 3D and asset rights before shipping, and non-blocking guest entry preserving at least 82% canvas viewport with a single 44 px context bar.",
      ),
      t(
        "이 토대 위에서 렌더링 현대화는 한 번에 갈아엎는 빅뱅 방식 대신 단계적 분리로 진행했습니다. Konva Phase 0 에서는 studio-stage-handle-types.ts 중립 스테이지·레이어·포인터 계약을 도입해 비-JSX 런타임 파일의 Konva 직접 결합을 59개에서 1개로(98.3%) 줄였습니다. 동시에 Wave 1–2 중복 JS/WASM(18.88 MiB 축소 여지와 opencv-js·pixi.js)을 네이티브 선택·오버레이 경계(studio-native-selection-runtime.ts, studio-native-scene-overlay-provider.ts)로 분리했습니다.",
        "Rather than a risky rewrite, rendering modernization proceeded in stages. Konva Phase 0 introduced neutral stage, layer and pointer contracts (studio-stage-handle-types.ts), reducing direct Konva coupling in non-JSX runtime files from 59 to 1 (98.3%). In parallel, Wave 1–2 decoupled redundant JS/WASM packages (18.88 MiB plus opencv-js and pixi.js) behind native selection and overlay boundaries.",
      ),
      t(
        "Phase 1–2 에서는 가이드·격자·투시 자·스냅·마키·8-핸들 변형 상자(studio-vello-phase1-overlay-adapter.ts)와 한국어 가로쓰기(HTB)·전통 세로쓰기(TTB) 말풍선·꼬리·금칙 처리(studio-vello-phase2-balloon-text-adapter.ts)를 단일 브리지(studio-vello-viewport-runtime-bridge.ts)에 묶었습니다. 기본값은 studioVelloPhase12Enabled=false 이며, Vello 초기화·제출 실패나 GPU 디바이스 유실 시 즉시 Konva 로 자동 폴백해 빈 화면과 작업 중단을 막습니다.",
        "Phases 1–2 unified guides, grids, perspective rulers, snap, marquee and 8-handle transform boxes (studio-vello-phase1-overlay-adapter.ts) plus Korean horizontal (HTB) and vertical (TTB) balloons, tails and kinsoku rules (studio-vello-phase2-balloon-text-adapter.ts) inside studio-vello-viewport-runtime-bridge.ts. Defaulting to studioVelloPhase12Enabled=false, any init/submit failure or GPU loss falls back immediately to Konva.",
      ),
      t(
        "현재 구현(Current)과 확장 로드맵(Target)을 구분합니다. OPFS/SQLite 로컬 권위·Rights BOM 게이트·비차단 게스트 82% 뷰포트는 운영 중(live)이며, Konva Phase 0 98.3% 분리·Wave 1–2 분리·Phase 1-2 Vello 런타임 브리지와 120Hz 로드 밸런서 연동은 2026-11-26 기준 코드·단위 테스트로 검증됐습니다. 브리지의 기본 활성화와 남은 React Konva JSX 레이어의 전면 교체는 브라우저 회귀 검증 뒤 단계적으로 진행합니다.",
        "Current vs Roadmap: OPFS/SQLite local authority, Rights BOM gates and non-blocking 82% guest entry are live; Konva Phase 0 (98.3%), Wave 1–2 decoupling and the feature-flagged Phase 1-2 Vello bridge with 120 Hz load balancing are verified by unit tests (2026-11-26). Turning the bridge on by default and retiring remaining Konva JSX layers remain phased targets.",
      ),
    ],
    keyPoints: [
      t("초기 기반(live): OPFS·SQLite·Rights BOM·게스트 82% 뷰포트", "Live base: OPFS/SQLite, Rights BOM & 82% guest canvas"),
      t("Konva Phase 0 중립 계약 59→1파일(98.3%) + Wave 1–2 분리", "Konva Phase 0 neutral contract 59→1 (98.3%) + Wave 1–2"),
      t("Phase 1-2 가이드·말풍선·세로쓰기 Vello 브리지(기본 false)", "Phase 1-2 guide, balloon & vertical-text Vello bridge"),
      t("초기화·제출 오류·GPU 손실 시 즉시 Konva 자동 폴백", "Instant Konva fallback on init/submit error or GPU loss"),
    ],
    diagram: {
      id: "konva-vello-lineage-phase12-bridge-diagram",
      kind: "layers",
      title: t("초기 로컬 기반에서 Phase 1-2 Vello 브리지까지 계보", "Lineage from local-first base to Phase 1-2 Vello bridge"),
      caption: t(
        "로컬 권위와 권리 게이트를 건드리지 않고, 중립 계약과 피처 플래그 뒤에서 렌더링 엔진만 안전하게 진화시킵니다.",
        "Evolves rendering behind neutral contracts and feature flags without disturbing local authority or rights gates.",
      ),
      alt: t(
        "가장 아래 1층에는 운영 중인 SQLite WASM·OPFS 로컬 권위와 Rights BOM 게이트·게스트 82% 뷰포트가 있고, 2층에는 Konva Phase 0 중립 핸들(59에서 1파일 분리)과 Wave 1–2 중복 JS/WASM 분리가 놓입니다. 3층에는 가이드·격자·말풍선·한국어 세로쓰기 Vello Phase 1-2 어댑터가 있으며, 최상단 브리지가 피처 플래그와 장애 시 자동 Konva 폴백을 제어합니다.",
        "Layer 1 holds the live SQLite WASM + OPFS authority, Rights BOM gate and 82% guest viewport; Layer 2 decouples Konva Phase 0 neutral handles (59 to 1 file) and Wave 1–2 redundant JS/WASM; Layer 3 adapts Phase 1-2 guides, balloons and Korean vertical text to Vello; the top bridge enforces feature-flag gating and automatic Konva fallback.",
      ),
      layers: [
        {
          id: "bridge",
          label: t("4. Vello 런타임 브리지", "4. Vello runtime bridge"),
          sub: t("studioVelloPhase12Enabled=false · 장애 시 Konva 폴백", "Flag default false; instant Konva fallback on error"),
          tone: "good",
          chips: ["Feature Flag", "GPU-Lost Fallback", "120Hz Balancer"],
        },
        {
          id: "phase12",
          label: t("3. Phase 1-2 Vello 어댑터", "3. Phase 1-2 Vello adapters"),
          sub: t("가이드·스냅·투시 자 + 말풍선·한국어 세로쓰기(TTB)", "Guides, snap, rulers + balloons & Korean vertical TTB"),
          tone: "local",
          chips: ["SceneIR", "Phase 1 Overlay", "Phase 2 TTB"],
        },
        {
          id: "phase0",
          label: t("2. Phase 0 · Wave 1–2 분리", "2. Phase 0 & Wave 1–2"),
          sub: t("Konva 59→1(98.3%) · 18.88 MiB + opencv/pixi 분리", "Konva 59→1 (98.3%); 18.88 MiB + opencv/pixi split"),
          tone: "neutral",
          chips: ["Neutral Handles", "Native Selection", "Native Overlay"],
        },
        {
          id: "foundation",
          label: t("1. 초기 운영 기반 (live)", "1. Live foundation"),
          sub: t("SQLite WASM+OPFS · Rights BOM · 게스트 82% 뷰포트", "SQLite WASM+OPFS, Rights BOM & 82% guest viewport"),
          tone: "local",
          chips: ["OPFS + SQLite", "Rights BOM", "Guest >=82%"],
        },
      ],
      brackets: [
        { label: t("무중단 렌더링 현대화 계층", "Zero-downtime render migration"), layerIds: ["bridge", "phase12", "phase0"] },
      ],
    },
    usage: [
      {
        feature: t("초기 로컬 권위 · Rights BOM · 게스트 뷰포트", "Local authority, Rights BOM & guest viewport"),
        role: t(
          "SQLite WASM + OPFS 로컬 원고 저장, 출판 전 라이선스 BOM 검증, 비차단 게스트 82% 캔버스 진입을 지킵니다.",
          "Maintains SQLite WASM + OPFS local manuscripts, pre-export Rights BOM checks and non-blocking 82% guest canvas entry.",
        ),
        paths: [
          "PRODUCT.md",
          "apps/web/src/domains/creator/studio-local-database.ts",
          "apps/web/src/domains/creator/delivery-pack/rights-bom-validator.ts",
        ],
        route: "/studio",
      },
      {
        feature: t("Konva Phase 0 중립 계약 & Wave 1–2 분리", "Konva Phase 0 neutral contract & Wave 1–2 decoupling"),
        role: t(
          "비-JSX 파일의 Konva 타입 결합을 59→1개로 줄이고 opencv-js·pixi.js 및 중복 18.88 MiB 경로를 네이티브 경계로 분리했습니다.",
          "Cut non-JSX Konva coupling from 59 to 1 file and separated opencv-js, pixi.js and 18.88 MiB redundant JS paths behind native boundaries.",
        ),
        paths: [
          "apps/web/src/domains/creator/canvas/studio-stage-handle-types.ts",
          "apps/web/src/domains/creator/selection/studio-native-selection-runtime.ts",
          "apps/web/src/domains/creator/render/studio-native-scene-overlay-provider.ts",
        ],
      },
      {
        feature: t("Phase 1-2 가이드·말풍선·세로쓰기 Vello 브리지", "Phase 1-2 guide, balloon & vertical-text Vello bridge"),
        role: t(
          "피처 플래그가 켜진 경우에만 Vello SceneIR 로 오버레이·말풍선을 제출하고, 초기화·GPU 오류 시 Konva 로 즉시 되돌립니다.",
          "Submits overlay and balloon SceneIR to Vello only when feature-flagged on, reverting to Konva immediately on init or GPU loss.",
        ),
        paths: [
          "apps/web/src/domains/creator/canvas/studio-vello-viewport-runtime-bridge.ts",
          "apps/web/src/domains/creator/canvas/studio-vello-phase1-overlay-adapter.ts",
          "apps/web/src/domains/creator/lettering/studio-vello-phase2-balloon-text-adapter.ts",
        ],
      },
    ],
    samples: [
      {
        kind: "simplified",
        title: t("피처 플래그 + 장애 시 자동 Konva 폴백 라우팅", "Feature-flagged Vello bridge with instant Konva fallback"),
        language: "ts",
        ...sampleSource([
          ['type ActiveBackend = "vello" | "konva";'],
          ["interface BridgeState { enabled: boolean; gpuLost: boolean; submitFailed: boolean; }"],
          [""],
          ["export function resolvePhase12Backend(state: BridgeState): ActiveBackend {"],
          ['  if (!state.enabled) return "konva";', "기본값 false: 기존 Konva 경로 유지", "safe default false keeps Konva active"],
          ['  if (state.gpuLost || state.submitFailed) return "konva";', "GPU 유실·제출 오류 시 즉시 폴백", "instant fallback on GPU loss or error"],
          ['  return "vello";', "가이드·말풍선·세로쓰기 Vello 제출", "routes guides, balloons & TTB to Vello"],
          ["}"],
        ]),
        explain: t(
          "실제 studio-vello-viewport-runtime-bridge.ts 는 비상 비활성화 플래그, 120Hz 로드 밸런서 압박 감지, 레이어 소유권 분리(konvaShouldRenderOverlays/Balloons)까지 함께 판단합니다.",
          "The production studio-vello-viewport-runtime-bridge.ts also evaluates emergency disable flags, 120 Hz load-balancer pressure and per-layer ownership.",
        ),
        source: "apps/web/src/domains/creator/canvas/studio-vello-viewport-runtime-bridge.ts",
        verify: "types",
      },
    ],
    links: [
      {
        title: "Linebender · Vello 2D GPU Vector Renderer",
        url: "https://github.com/linebender/vello",
        kind: "repo",
        note: t("GPU 컴퓨트 기반 2D 벡터·텍스트 렌더러", "GPU compute-driven 2D vector and text renderer"),
      },
      {
        title: "W3C · CSS Writing Modes Level 4 (Vertical Text)",
        url: "https://www.w3.org/TR/css-writing-modes-4/",
        kind: "spec",
        note: t("세로쓰기(vertical-rl)와 종중횡조(tate-chu-yoko) 조판 기준", "Vertical writing (vertical-rl) and tate-chu-yoko typography spec"),
      },
    ],
    chapterIds: ["architecture", "brush-render-authority", "storage"],
    talk: {
      pitch: t(
        "초기 SQLite+OPFS 로컬 권위·Rights BOM·게스트 82% 뷰포트 위에, Konva 결합을 59→1파일(98.3%)로 줄이고 Wave 1–2 중복 18.88 MiB 와 opencv/pixi 를 분리한 뒤, 장애 시 즉시 Konva 로 되돌아가는 피처 플래그 Vello Phase 1-2 브리지까지 단계적으로 구축했습니다.",
        "On top of live SQLite+OPFS authority, Rights BOM and an 82% guest canvas, we cut Konva type coupling from 59 to 1 file (98.3%), decoupled 18.88 MiB plus opencv/pixi, and built a feature-flagged Phase 1-2 Vello bridge with automatic Konva fallback.",
      ),
      analogy: t(
        "낡은 다리를 한 번에 부수지 않고, 기둥(로컬 저장·권리 게이트)은 그대로 둔 채 옆에 새 교량(Vello)을 놓고 이상이 생기면 즉시 기존 차선(Konva)으로 돌리는 무중단 교체 공사입니다.",
        "Like building a new bridge beside the old one on the same pillars (local authority and rights gates) while keeping instant traffic redirection to the old lane if anything faults.",
      ),
      questions: [
        {
          question: t("왜 98.3% 분리라고 하면서 아직 Konva 가 남아 있나요?", "Why is Konva still present if 98.3% was decoupled?"),
          answer: t(
            "비-JSX 런타임·헬퍼 59파일 중 58파일을 중립 계약으로 옮긴 수치이며, 실제 화면을 그리는 React Konva JSX 레이어는 Phase 1-2 브리지가 브라우저 회귀 검증을 마칠 때까지 안전 폴백으로 유지합니다.",
            "58 of 59 non-JSX runtime/helper files moved onto neutral contracts, while React Konva JSX layers remain as the live safety fallback until Phase 1-2 browser regression passes.",
          ),
        },
        {
          question: t("게스트 진입과 Rights BOM 이 렌더링 현대화와 무슨 관계가 있나요?", "How do guest entry and Rights BOM relate to renderer modernization?"),
          answer: t(
            "브리지와 WASM 확장 모듈을 초기 진입 그래프에서 0바이트로 격리해야 로그인 없는 게스트 82% 뷰포트가 느려지지 않으며, 어느 렌더러로 내보내든 Rights BOM 게이트가 출판 전 권리를 동일하게 검증합니다.",
            "Keeping bridges and WASM modules at zero bytes in the eager entry graph preserves fast guest entry, and Rights BOM validates export rights uniformly regardless of renderer.",
          ),
        },
      ],
      pitfall: t(
        "Phase 1-2 Vello 브리지는 현재 안전 기본값(false) 뒤에서 단위·계약 테스트로 검증된 단계이며, 본편 스튜디오 기본 렌더러 전면 전환은 아직 확장 로드맵입니다.",
        "The Phase 1-2 Vello bridge defaults to false and is unit-verified; switching the main studio renderer by default remains on the staged roadmap.",
      ),
    },
    technologies: ["Vello", "Konva", "SQLite WASM", "OPFS", "Rust / WASM"],
    facts: [
      {
        value: "59 → 1 (98.3%)",
        label: t("Konva Phase 0 비-JSX 런타임 중립 계약 분리 비율", "Konva Phase 0 non-JSX neutral interface decoupling ratio"),
        source: "apps/web/src/domains/creator/canvas/studio-stage-handle-types.ts",
      },
      {
        value: ">= 82% / 0-block",
        label: t("비차단 게스트 즉시 진입 캔버스 뷰포트 · 44px 단일 바", "Non-blocking guest canvas viewport & 44 px single bar"),
        source: "PRODUCT.md",
      },
      {
        value: "default: false",
        label: t("Phase 1-2 Vello 브리지 안전 기본값 · 오류 시 Konva 폴백", "Phase 1-2 Vello bridge safe default with Konva fallback"),
        source: "apps/web/src/domains/creator/canvas/studio-vello-viewport-runtime-bridge.ts",
      },
      {
        value: "18.88 MiB + 2",
        label: t("Wave 1–2 중복 JS/WASM + opencv-js·pixi.js 경계 분리", "Wave 1–2 redundant JS/WASM + opencv-js & pixi.js decoupling"),
        source: "apps/web/src/domains/creator/selection/studio-native-selection-runtime.ts",
      },
    ],
    reviewedAt: "2026-11-26",
  },
];
