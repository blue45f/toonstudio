import { z } from "zod";

import type { ClaudeTokenUsage } from "@/shared/ai/claude/claude-models";
import type { ClaudeCreatorTaskId, ClaudeCreatorTaskProfile } from "./claude-creator-model-router";

/* ============================================================================
 * 0. 39대 웹툰·스토리보드·3D·드로잉 AI 보조 플랫폼 REA 정본 카탈로그 및 UI/UX 디자인 토큰 스키마
 *    (하위 호환을 위해 REA15_* 와 REA39_* 식별자를 동시에 노출합니다)
 * ============================================================================ */

export const REA15_PLATFORM_IDS = [
  // Wave 1 (15개 플랫폼)
  "glimnavi",
  "snaptoon",
  "kaistory",
  "ggooming",
  "plask-motion",
  "manhwa-ai",
  "komiko-ai",
  "anifusion",
  "katalist-ai",
  "novelai",
  "mootion",
  "skyreels",
  "frameo",
  "naver-webtoon-shaper",
  "posemaniacs",
  // Wave 2 (12개 플랫폼)
  "llamagen",
  "dashtoon",
  "ltx-studio",
  "boords",
  "magic-poser",
  "posemy-art",
  "cascadeur",
  "krea",
  "leonardo-ai",
  "gentoon",
  "tootoon",
  "tooning-plus",
  // Wave 3 (12개 플랫폼)
  "enkava",
  "jitter",
  "lumiere-graphics",
  "graphite-editor",
  "pixieditor",
  "spline",
  "rive",
  "medibang-paint",
  "ibispaint",
  "clip-studio-paint",
  "acon3d",
  "webtoon-canvas",
] as const;

export const REA39_PLATFORM_IDS = REA15_PLATFORM_IDS;

export type Rea15PlatformId = (typeof REA15_PLATFORM_IDS)[number];
export type Rea39PlatformId = Rea15PlatformId;

export interface Rea15PlatformUiThemeSpec {
  readonly platformId: Rea15PlatformId;
  readonly nameKo: string;
  readonly originUrl: string;
  readonly reaEvidenceId: string;
  readonly scenarioSha256: string;
  readonly surfaceHex: string;
  readonly panelHex: string;
  readonly borderHex: string;
  readonly textPrimaryHex: string;
  readonly textMutedHex: string;
  readonly accentPrimaryHex: string;
  readonly accentSecondaryHex: string;
  readonly borderRadiusPx: number;
  readonly fontStack: string;
  readonly coreWorkflowKo: string;
  readonly keyRoutes: readonly string[];
}

export const REA15_PLATFORM_UI_THEME_CATALOG: Readonly<
  Record<Rea15PlatformId, Rea15PlatformUiThemeSpec>
> = Object.freeze({
  glimnavi: {
    platformId: "glimnavi",
    nameKo: "그림나비 (GlimNavi Studio v2.3)",
    originUrl: "https://glimnavi.com/function-step3.html",
    reaEvidenceId: "ev_f2c78ddd17640152c0ce5ea59a6634cd0f7029fe29a852251b9147d1e60e3570",
    scenarioSha256: "3ac6113ac3d149b37ff9863b5deb6a7d8ff15ccfb597457ca150a6e9a98f60d1",
    surfaceHex: "#f6f7fb",
    panelHex: "#ffffff",
    borderHex: "#e5e7eb",
    textPrimaryHex: "#111827",
    textMutedHex: "#6b7280",
    accentPrimaryHex: "#00a8c2",
    accentSecondaryHex: "#3b82f6",
    borderRadiusPx: 14,
    fontStack: "Pretendard Variable, sans-serif",
    coreWorkflowKo:
      "5단계(기획·각색→콘티→선화 v1.0~v2.3→자동채색→AI 그림자·조명·명암 Relight) + 컬러 레이어 분리 + PSD 출력",
    keyRoutes: ["/", "/function-step3.html", "/plan.html", "/tutorial.html"],
  },
  snaptoon: {
    platformId: "snaptoon",
    nameKo: "스냅툰 · 스냅보드 (Snaptoon & Snapboard)",
    originUrl: "https://snaptoon.co.kr/",
    reaEvidenceId: "ev_b1e4285baa78b85f3ad6b72dd54277f72ecff570448402bebd87070fac64a8c3",
    scenarioSha256: "f05844d786ada6594f200e5398c9081345085acd0152146d0111169592e13acb",
    surfaceHex: "#FAF8F5",
    panelHex: "#F2EFEA",
    borderHex: "#E8E5E0",
    textPrimaryHex: "#1A1A1A",
    textMutedHex: "#6B6B6B",
    accentPrimaryHex: "#1E3A5F",
    accentSecondaryHex: "#2A5285",
    borderRadiusPx: 12,
    fontStack: "Pretendard, Noto Serif KR, EB Garamond",
    coreWorkflowKo: "스냅툰 3D 실시간 렌더링 → 스냅보드 AI 창작·변환 → 스냅툰 웨어하우스 3D 소재",
    keyRoutes: ["/", "/en/"],
  },
  kaistory: {
    platformId: "kaistory",
    nameKo: "카이스토리 · 카이툰 (KAISTORY & KAITOON)",
    originUrl: "https://kaistory.net/",
    reaEvidenceId: "ev_76255f44204c56a3615ba3ed1dd0f8a5f1cf15aaf954649b456e50cc80824613",
    scenarioSha256: "4a783a2b5bd2aa91f0b3c076bce1bb3bb6c1c8f7d84d54742a53493c0bcced7d",
    surfaceHex: "#f6f7fb",
    panelHex: "#ffffff",
    borderHex: "#e7e8f0",
    textPrimaryHex: "#1a1c2b",
    textMutedHex: "#5c6178",
    accentPrimaryHex: "#16168f",
    accentSecondaryHex: "#ff5a4d",
    borderRadiusPx: 14,
    fontStack: "Pretendard, sans-serif",
    coreWorkflowKo:
      "단일 프로젝트 데이터 엔벨로프(conti→design→editor→story) + 화자별 TTS + KAION 학습카드·문제 생성",
    keyRoutes: [
      "https://conti.kaistory.net",
      "https://design.kaistory.net",
      "https://editor.kaistory.net",
      "https://story.kaistory.net",
    ],
  },
  ggooming: {
    platformId: "ggooming",
    nameKo: "꾸밍 (GGOOMING)",
    originUrl: "https://www.ggooms.com/",
    reaEvidenceId: "ev_28d88e317e86129ace97da5ecc1aa6be41335b246956741190f7f5416fc37e32",
    scenarioSha256: "912a469864405fc70aa12501c5f0fa64108ae1b49ca11702696dc6b98fd258aa",
    surfaceHex: "#eff6ff",
    panelHex: "#ffffff",
    borderHex: "#bfdbfe",
    textPrimaryHex: "#1e3ad4",
    textMutedHex: "#3f3f3f",
    accentPrimaryHex: "#274bff",
    accentSecondaryHex: "#4980ff",
    borderRadiusPx: 12,
    fontStack: "Geist, Geist Mono, sans-serif",
    coreWorkflowKo: "인스타툰·브랜드 콜라보 고속 컷 생성 및 캐릭터 화풍 일관성 락",
    keyRoutes: ["/", "/dashboard", "/dashboard/projects", "/dashboard/projects/new"],
  },
  "plask-motion": {
    platformId: "plask-motion",
    nameKo: "플라스크 모션 (Plask Motion)",
    originUrl: "https://plask.ai/",
    reaEvidenceId: "ev_e4c693a8ddd64ef1def91fcb5c6fc6fec52335a136eb945fbe376747ead4c7cb",
    scenarioSha256: "12062ecfeaed08c6dda16eee9ad9531e6d5982b08267f72947e57b6564756e1f",
    surfaceHex: "#0a0a0a",
    panelHex: "#171717",
    borderHex: "#333333",
    textPrimaryHex: "#ededed",
    textMutedHex: "#a0a0a0",
    accentPrimaryHex: "#0467DF",
    accentSecondaryHex: "#06C755",
    borderRadiusPx: 10,
    fontStack: "var(--font-plask-latin), var(--font-plask-cjk)",
    coreWorkflowKo: "단일 카메라 영상 AI 모션 캡처 → VRM/FBX 리타게팅 → 키프레임 스무딩 & DOF/모션블러",
    keyRoutes: ["/"],
  },
  "manhwa-ai": {
    platformId: "manhwa-ai",
    nameKo: "ManhwaAI",
    originUrl: "https://www.manhwaai.net/",
    reaEvidenceId: "ev_0a8511a3646c5da383e58a2b265eb450df9661c4601ca6414526ebeab5cfaee3",
    scenarioSha256: "d1cf486502398a0d6d77151a5219a8b55d4c0bc7395c6652f98c97b787dfe809",
    surfaceHex: "#17131e",
    panelHex: "#1d1825",
    borderHex: "#241925",
    textPrimaryHex: "#f8f4ee",
    textMutedHex: "#766b7d",
    accentPrimaryHex: "#7b5cff",
    accentSecondaryHex: "#e83f69",
    borderRadiusPx: 12,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "6대 만화 화풍 프리셋(full-color, black-and-white 등) + 5대 톤 오버레이(FocusingLine, SpeedLine, Tone 등)",
    keyRoutes: ["/manhwa-character-generator", "/manhwa-editor", "/comic-editor", "/gallery/manhwa"],
  },
  "komiko-ai": {
    platformId: "komiko-ai",
    nameKo: "Komiko AI",
    originUrl: "https://komiko.app/",
    reaEvidenceId: "ev_a6091c8e574902740961b2395722ee6d65d22ef730bf05408d69f249434dc3ea",
    scenarioSha256: "c0bd29800afafd282dee7defc4aadfa39a40f051351063644c1d674d68500c5c",
    surfaceHex: "#0f101a",
    panelHex: "#181926",
    borderHex: "#2a2c42",
    textPrimaryHex: "#f3f4f6",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#7C5CFA",
    accentSecondaryHex: "#FF4D9D",
    borderRadiusPx: 12,
    fontStack: "Plus Jakarta Sans, Inter, sans-serif",
    coreWorkflowKo:
      "OC 캐릭터 메이커 + 선화 채색 + 스케치 단순화 + 레이어 분리기(/layer_splitter) + 인비트윈(/inbetween)",
    keyRoutes: [
      "/oc-maker",
      "/ai-comic-generator",
      "/line_art_colorization",
      "/sketch_simplification",
      "/layer_splitter",
      "/inbetween",
      "/voice/generate",
    ],
  },
  anifusion: {
    platformId: "anifusion",
    nameKo: "Anifusion",
    originUrl: "https://anifusion.ai/",
    reaEvidenceId: "ev_01828021391fc904afa8460e67291e1e0cedeb7bddfa084da1a92fe64adff8c8",
    scenarioSha256: "841e3a9d62df517833baa136eddc61ede2f971f8a63f6406c864202fdc4ca2fa",
    surfaceHex: "#1a1b1e",
    panelHex: "#25262b",
    borderHex: "#373a40",
    textPrimaryHex: "#fcfcfc",
    textMutedHex: "#858585",
    accentPrimaryHex: "#2196f3",
    accentSecondaryHex: "#4dabf7",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "노드 플로우(/dashboard/flow/) + 무한 캔버스(/dashboard/canvas/) + 캐릭터 시트(/dashboard/character-sheets/)",
    keyRoutes: [
      "/dashboard/flow/",
      "/dashboard/canvas/",
      "/dashboard/character-sheets/",
      "/dashboard/comic-presets/",
      "/dashboard/sketch/",
      "/editor/",
    ],
  },
  "katalist-ai": {
    platformId: "katalist-ai",
    nameKo: "Katalist AI",
    originUrl: "https://www.katalist.ai/",
    reaEvidenceId: "ev_6a2f91553a83af023e5531e399a40b2a077eb8dbdf3345f8d1d8af3ec6d23cc5",
    scenarioSha256: "33f0829eb08241e561a034d42f0889221b1d91989ce511b784d2d87590da1ae7",
    surfaceHex: "#0f172a",
    panelHex: "#1e293b",
    borderHex: "#334155",
    textPrimaryHex: "#f8fafc",
    textMutedHex: "#94a3b8",
    accentPrimaryHex: "#38bdf8",
    accentSecondaryHex: "#818cf8",
    borderRadiusPx: 12,
    fontStack: "Familjen Grotesk, Crimson Pro, Geist, Inter",
    coreWorkflowKo: "스크립트 자동 샷 분해 → 캐릭터·배경 고정 스토리보드 → 프레임별 포즈·앵글 직접 조작",
    keyRoutes: ["/"],
  },
  novelai: {
    platformId: "novelai",
    nameKo: "NovelAI",
    originUrl: "https://novelai.net/",
    reaEvidenceId: "ev_ed7b1d3017d19c852444e210f9905a7784dbf6ebd46e3e06e91c6d3f6e2e9633",
    scenarioSha256: "ee8200a356f72e7929601f8bae3c21373a2545bfb8a7caecccba1e179bd2ebc8",
    surfaceHex: "#0e0f21",
    panelHex: "#13152c",
    borderHex: "#252849",
    textPrimaryHex: "#f5f3c2",
    textMutedHex: "#e6e6e6",
    accentPrimaryHex: "#DCA7D7",
    accentSecondaryHex: "#5D69DE",
    borderRadiusPx: 8,
    fontStack: "Inter, Source Sans Pro, serif",
    coreWorkflowKo: "로어북 서사 메모리(/stories) + 다중 캐릭터 좌표 분리 & Vibe Transfer(/image)",
    keyRoutes: ["/stories", "/image", "/user/subscription", "/user/inventory"],
  },
  mootion: {
    platformId: "mootion",
    nameKo: "Mootion",
    originUrl: "https://www.mootion.com/",
    reaEvidenceId: "ev_0a0286dd2b8b2c4d017d08fb7af0cb82d91266b998ea37464fcb8ce43ac93e78",
    scenarioSha256: "d787a0537e1bddb33799f194acf0ab144b6add9c10185879cba21c07755585da",
    surfaceHex: "#0e1d47",
    panelHex: "#211f2c",
    borderHex: "#3021d9",
    textPrimaryHex: "#fafafa",
    textMutedHex: "#9a9a9a",
    accentPrimaryHex: "#4c33ff",
    accentSecondaryHex: "#a846ee",
    borderRadiusPx: 12,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "프롬프트·대본 → 스토리보드 → 3D/비디오 애니매틱 시퀀스 자동 변환",
    keyRoutes: ["/"],
  },
  skyreels: {
    platformId: "skyreels",
    nameKo: "SkyReels",
    originUrl: "https://www.skyreels.ai/",
    reaEvidenceId: "ev_5b2e30d22a2b9ca1e351d56b727f16a800309bc25a07351272cca8048b87aeca",
    scenarioSha256: "86c5cc6fe9d8b1e50abf26cf1b8037fed348b5afbfe5de110f4b559fe246e75c",
    surfaceHex: "#1a1a1a",
    panelHex: "#262626",
    borderHex: "#3f3f46",
    textPrimaryHex: "#ffffff",
    textMutedHex: "#a1a1aa",
    accentPrimaryHex: "#FFCF00",
    accentSecondaryHex: "#efcf14",
    borderRadiusPx: 10,
    fontStack: "Plus Jakarta Sans, Poppins, sans-serif",
    coreWorkflowKo: "세로형 숏드라마·웹툰 릴스 에피소드 비디오 생성(/createVideo)",
    keyRoutes: ["/createVideo", "/dev/api-keys"],
  },
  frameo: {
    platformId: "frameo",
    nameKo: "Frameo AI",
    originUrl: "https://frameo.ai/",
    reaEvidenceId: "ev_1b43ad4a78636801dfd2660774f04d7ce09f826e64a2fccfdd9d0ba60f87ab5a",
    scenarioSha256: "7575ac64bb5935480f6a7ce31920c371e4cd3257c68c28bd102d4923a43cadea",
    surfaceHex: "#09090b",
    panelHex: "#18181b",
    borderHex: "#27272a",
    textPrimaryHex: "#f5f5f7",
    textMutedHex: "#a1a1aa",
    accentPrimaryHex: "#423be5",
    accentSecondaryHex: "#c084fc",
    borderRadiusPx: 8,
    fontStack: "Geist, Averia Serif Libre, Manrope",
    coreWorkflowKo:
      "AI 스토리보드·스크립트 투 비디오(/ai-storyboard-generator, /use-veo3) + 스포트라이트 콘 셰이더(--cursor-angle, --cone-spread)",
    keyRoutes: ["/ai-storyboard-generator", "/script-to-video", "/story-to-video", "/use-veo3"],
  },
  "naver-webtoon-shaper": {
    platformId: "naver-webtoon-shaper",
    nameKo: "NAVER WEBTOON SHAPER (셰이퍼)",
    originUrl: "https://shaper.webtoons.com/",
    reaEvidenceId: "ev_b31cfbe08e61ccbdb81f0bc2104108e580b7a7c5d3602039136136f7a999bdda",
    scenarioSha256: "7d3810f2fac29eda33110c99652642a4e483932ec41ee8d5298f3579feb87b1c",
    surfaceHex: "#0a0a0a",
    panelHex: "#222222",
    borderHex: "#333333",
    textPrimaryHex: "#ededed",
    textMutedHex: "#d3d3d3",
    accentPrimaryHex: "#00ff74",
    accentSecondaryHex: "#3b6cef",
    borderRadiusPx: 12,
    fontStack: "Volte, Pretendard, sans-serif",
    coreWorkflowKo:
      "3D 웹툰 캐릭터 프리셋 조합 + 3D 모델 표면 직접 드로잉 + AI 레퍼런스 프리셋 추천·포즈 캡처 + 레이어 PSD 출력",
    keyRoutes: ["/"],
  },
  posemaniacs: {
    platformId: "posemaniacs",
    nameKo: "Posemaniacs",
    originUrl: "https://www.posemaniacs.com/",
    reaEvidenceId: "ev_da8dc6db9a1253ca2e1c2bc2ae6b410e3f76ffbbc86f44ab797b83415afb284e",
    scenarioSha256: "6673b4de778f27a4331726e2ba610bfa1aca85610731a7f47c05c685908bd281",
    surfaceHex: "#111827",
    panelHex: "#1f2937",
    borderHex: "#414141",
    textPrimaryHex: "#f9fafb",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#2563EB",
    accentSecondaryHex: "#EF4444",
    borderRadiusPx: 8,
    fontStack: "Roboto, Google Sans Text, sans-serif",
    coreWorkflowKo: "3D 에코르셰(근육) 해부학 회전 뷰어 + 핸드/표정 레퍼런스 + 오늘의 포즈 드로잉",
    keyRoutes: ["/poses", "/tools", "/faces", "/generated-photos", "/pose-of-the-day"],
  },
  llamagen: {
    platformId: "llamagen",
    nameKo: "LlamaGen AI",
    originUrl: "https://llamagen.ai/",
    reaEvidenceId: "ev_5d6e3e4aab21c7ff11fdddfa7d4d30d44627b638626558de15fb02c60e7b2c57",
    scenarioSha256: "4bbf2d622452a1b98ef744cf5f307b1bdf1d989a5eedf2b272b7166cff158c8f",
    surfaceHex: "#0D0C22",
    panelHex: "#171713",
    borderHex: "#4F5263",
    textPrimaryHex: "#F7F7F8",
    textMutedHex: "#7B7194",
    accentPrimaryHex: "#f3ad22",
    accentSecondaryHex: "#524B63",
    borderRadiusPx: 12,
    fontStack: "Inter, Plus Jakarta Sans, sans-serif",
    coreWorkflowKo:
      "AI 코믹 스트립(/new/ai-comic-strips) + 에이전트 멀티패널 워크플로우(/agents, /workflows, /draw, /story)",
    keyRoutes: ["/new/ai-comic-strips", "/agents", "/draw", "/workflows", "/story"],
  },
  dashtoon: {
    platformId: "dashtoon",
    nameKo: "Dashtoon Studio",
    originUrl: "https://dashtoon.com/",
    reaEvidenceId: "ev_c9f6c0db817e24eb5a604fd1da1112281d7e765b0846f1e9aa17caa2434eaf3c",
    scenarioSha256: "880e084418ad76b288336cb5134f64b275edaa5f06bbcd5f2e08218abdffd194",
    surfaceHex: "#111214",
    panelHex: "#1a1b1e",
    borderHex: "#2B2B2B",
    textPrimaryHex: "#e5e7eb",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#3090FC",
    accentSecondaryHex: "#60A5FA",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "세로 스크롤 웹툰 제작(/create) + 포토 투 코믹 변환(/api/v2/ai-apps/photo-to-comic) + 글로벌 연재(/comics)",
    keyRoutes: ["/comics", "/create", "/api/v2/ai-apps/photo-to-comic", "/api/v2/ai-apps/photo-to-comic/poll"],
  },
  "ltx-studio": {
    platformId: "ltx-studio",
    nameKo: "LTX Studio (Lightricks)",
    originUrl: "https://ltx.studio/",
    reaEvidenceId: "ev_47dd3a8e80ef7b298a798ce6610a116d5e64904937c128c8f4c53190c9425ad0",
    scenarioSha256: "eb2f2d23e2fa72dd4dc010a5b64bb2ef898addec6667fd1f2122458bdd76d9f6",
    surfaceHex: "#0f1115",
    panelHex: "#181b22",
    borderHex: "#2c323d",
    textPrimaryHex: "#fafafa",
    textMutedHex: "#aaadb0",
    accentPrimaryHex: "#3898ec",
    accentSecondaryHex: "#ea384c",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "시나리오 → 샷별 프리비즈 스토리보드 → 카메라 모션·캐릭터 일관성 애니매틱 디렉팅",
    keyRoutes: ["/", "/pricing", "/lead-survey"],
  },
  boords: {
    platformId: "boords",
    nameKo: "Boords AI Storyboard",
    originUrl: "https://boords.com/",
    reaEvidenceId: "ev_45aab73c640e451a57e56d4f59d3a56365d00d8ce4845861d685cd5cc3779853",
    scenarioSha256: "6591c40a8c78780e637d868476b2936243ed17a3e7511d4992ffd4a215dc03ec",
    surfaceHex: "#120e0b",
    panelHex: "#211c19",
    borderHex: "#453d37",
    textPrimaryHex: "#D5D5CC",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#FF2D8D",
    accentSecondaryHex: "#D97757",
    borderRadiusPx: 12,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "대본 기반 프레임별 스토리보드 & 보이스오버 타임라인 애니매틱 시퀀서",
    keyRoutes: ["/", "/offer", "/docs"],
  },
  "magic-poser": {
    platformId: "magic-poser",
    nameKo: "Magic Poser",
    originUrl: "https://magicposer.com/",
    reaEvidenceId: "ev_0340777a4ef59f77df35658b8b4cea7c996b4cd19a9826d9d93985294c590161",
    scenarioSha256: "718afbeb1b9bc87923a8ab22458d97e1258812646c6f3a8386393211d40408d2",
    surfaceHex: "#12121C",
    panelHex: "#24262D",
    borderHex: "#383B47",
    textPrimaryHex: "#F8F8F8",
    textMutedHex: "#D8D8D8",
    accentPrimaryHex: "#00B7FD",
    accentSecondaryHex: "#F45253",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "웹툰·만화 특화 다중 인체 물리 관절 드래그 포징(--mp-dark-blue: #00B7FD) + 원근 투시 및 방향성 조명 스튜디오",
    keyRoutes: ["/"],
  },
  "posemy-art": {
    platformId: "posemy-art",
    nameKo: "PoseMy.Art",
    originUrl: "https://posemy.art/",
    reaEvidenceId: "ev_abdd16e2770ee661c9bb1b1b803bf8c9b7940249f13e797ed82638533bcb71c5",
    scenarioSha256: "d82bc95e815514a87ab82c07db2c82e08825a640d34bf7470ab8eab37976c173",
    surfaceHex: "#463853",
    panelHex: "#5A5563",
    borderHex: "#726B7D",
    textPrimaryHex: "#FBFBFD",
    textMutedHex: "#eafeff",
    accentPrimaryHex: "#ff30b2",
    accentSecondaryHex: "#7de5da",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "브라우저 즉시 구동 3D 마네킹·블록 메쉬·애니메이션 포즈 씬 빌더",
    keyRoutes: ["/", "/track"],
  },
  cascadeur: {
    platformId: "cascadeur",
    nameKo: "Cascadeur AI Physics Rigging",
    originUrl: "https://cascadeur.com/",
    reaEvidenceId: "ev_71b8739079fbf7ee061823ba33f787549a304e36c9394624d4899f8d781ef6f5",
    scenarioSha256: "f28f6adbfbdffb7e51c0d9cc0afd8fe8d30501eadcf6ed4fa6b7fcc09a645b7f",
    surfaceHex: "#030303",
    panelHex: "#14181f",
    borderHex: "#2F96B4",
    textPrimaryHex: "#ffffff",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#009ee8",
    accentSecondaryHex: "#80fff2",
    borderRadiusPx: 8,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "AutoPosing AI 관절 자동 추론 + AutoPhysics 무게중심(Center of Mass)·각운동량·탄도 궤적 물리 보정",
    keyRoutes: ["/", "/creative/list", "/preview"],
  },
  krea: {
    platformId: "krea",
    nameKo: "Krea AI Realtime Director",
    originUrl: "https://www.krea.ai/",
    reaEvidenceId: "ev_3fbbde1134e1842d9c5306aa04efaab4604118ad3f3a9452245fcccceda86af9",
    scenarioSha256: "bd928d2c4b5440618916390f1b17eca190c8445bb0982caf39b1d75c210b8440",
    surfaceHex: "#050505",
    panelHex: "#0a0a0a",
    borderHex: "#262626",
    textPrimaryHex: "#f5f5f5",
    textMutedHex: "#646464",
    accentPrimaryHex: "#c4956a",
    accentSecondaryHex: "#6b9e7a",
    borderRadiusPx: 12,
    fontStack: "Inter, Geist, sans-serif",
    coreWorkflowKo:
      "실시간 도형·3D·브러시 캔버스 → AI 즉시 합성(/realtime, /realtime-director) + 업스케일·디테일 강화(/apps/enhance, /apps/image/flux-krea)",
    keyRoutes: ["/realtime", "/realtime-director", "/apps/image/flux-krea", "/apps/enhance", "/image", "/video"],
  },
  "leonardo-ai": {
    platformId: "leonardo-ai",
    nameKo: "Leonardo.Ai Canvas & Flow",
    originUrl: "https://leonardo.ai/",
    reaEvidenceId: "ev_aba9a01e0b16e259d691e1c2b1a8a07555a0fb6123a613e7e4d2e52b5c65271b",
    scenarioSha256: "eafbf44f53c4c57edb70bd4fee34aa9afe3ac4905aa059e3c4fde5e618d24de3",
    surfaceHex: "#0d0f17",
    panelHex: "#171a26",
    borderHex: "#313131",
    textPrimaryHex: "#f3f4f6",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#8b5cf6",
    accentSecondaryHex: "#ec4899",
    borderRadiusPx: 12,
    fontStack: "Plus Jakarta Sans, Inter, sans-serif",
    coreWorkflowKo: "Realtime Canvas 인페인팅·아웃페인팅 + Character Reference/Style Reference 멀티 가중치 제어",
    keyRoutes: ["/"],
  },
  gentoon: {
    platformId: "gentoon",
    nameKo: "GenToon (젠툰)",
    originUrl: "https://www.gentoon.ai/",
    reaEvidenceId: "ev_e62beed518f1e75ad009869facc63f7acfee12f6116364a44b714551e07027de",
    scenarioSha256: "622b3fbbab14dcc8705ea68c675d65b1f4615f06ad7367f1a23e121f9b51711f",
    surfaceHex: "#f4ebfc",
    panelHex: "#e7d7f6",
    borderHex: "#6f5486",
    textPrimaryHex: "#40215f",
    textMutedHex: "#6f5486",
    accentPrimaryHex: "#7646bd",
    accentSecondaryHex: "#ffe9a4",
    borderRadiusPx: 14,
    fontStack: "Pretendard, sans-serif",
    coreWorkflowKo:
      "읽기 방향 제어(--reading-direction:1, --paper:#f4ebfc, --ink:#40215f) 웹툰 뷰어(/view) + 서포터즈·굿즈 주문·크리에이터 정산(/supporters, /goods/orders, /creator-hub/earnings)",
    keyRoutes: ["/view", "/supporters", "/goods/orders", "/creator-hub/earnings", "/achievements"],
  },
  tootoon: {
    platformId: "tootoon",
    nameKo: "TooToon (투툰 · Onoma AI)",
    originUrl: "https://tootoon.ai/",
    reaEvidenceId: "ev_ed83b1f1e6e9d943e547c3e705e1bec9ed1149c34e008ac9526cc99e9d0986bf",
    scenarioSha256: "0fd9e464f594a4dba361c16012e16908c9d945f3c12e12502e05e9f2fca53d72",
    surfaceHex: "#121212",
    panelHex: "#1F1F1F",
    borderHex: "#333333",
    textPrimaryHex: "#ffffff",
    textMutedHex: "#B3B3B3",
    accentPrimaryHex: "#363cff",
    accentSecondaryHex: "#4285F4",
    borderRadiusPx: 12,
    fontStack: "Pretendard, Inter, sans-serif",
    coreWorkflowKo:
      "5대 전문 스튜디오 모듈: Fabulator(/fabulator 스토리) → Character Studio(/character-studio) → Visual Studio(/visual-studio 콘티) → Artifex(/artifex 작화) → Emporium(/emporium 에셋 마켓) & Anima 피드(/anima/feed/list)",
    keyRoutes: [
      "/fabulator",
      "/character-studio",
      "/visual-studio",
      "/artifex",
      "/emporium",
      "/anima/feed/list",
    ],
  },
  "tooning-plus": {
    platformId: "tooning-plus",
    nameKo: "Tooning Plus (투닝 플러스)",
    originUrl: "https://tooning.io/",
    reaEvidenceId: "ev_fb15db7d87f332c7a168570f1ae75041b2dffb840b74dd24ea17286716434865",
    scenarioSha256: "64e77ab9486e3fb6f873d2aff54cb139f970068916557440a4b4cae3352f7eeb",
    surfaceHex: "#f7f7f7",
    panelHex: "#ffffff",
    borderHex: "#eaeaea",
    textPrimaryHex: "#424242",
    textMutedHex: "#969696",
    accentPrimaryHex: "#3b82f6",
    accentSecondaryHex: "#c1c4cd",
    borderRadiusPx: 12,
    fontStack: "Pretendard, sans-serif",
    coreWorkflowKo:
      "6부위 모듈형 캐릭터 빌더(/character-make-basic, -face, -body, -hand, -hair, -etc) + 커스텀 에셋 업로드(/etcUpload-make-addOrSet) + /100x 고속 컷 제작",
    keyRoutes: [
      "/100x",
      "/character-make-basic",
      "/character-make-face",
      "/character-make-body",
      "/character-make-hand",
      "/character-make-hair",
      "/character-make-etc",
    ],
  },
  enkava: {
    platformId: "enkava",
    nameKo: "Enkava (엔카바)",
    originUrl: "https://enkava.com/",
    reaEvidenceId: "ev_bd2f37c70899ba98a372d30c7fa86b64247954bc03156764a19d7b88de10d1b6",
    scenarioSha256: "6ab5faccdeda58e09d95097208c57124389672f69b465e805f8087340d0a119a",
    surfaceHex: "#101218",
    panelHex: "#181c24",
    borderHex: "#2a303c",
    textPrimaryHex: "#f3f4f6",
    textMutedHex: "#9ca3af",
    accentPrimaryHex: "#6366f1",
    accentSecondaryHex: "#22d3ee",
    borderRadiusPx: 10,
    fontStack: "Pretendard, Inter, sans-serif",
    coreWorkflowKo: "국내 서브컬처·웹툰 창작자 에셋 & 커미션·협업 스테이지",
    keyRoutes: ["/"],
  },
  jitter: {
    platformId: "jitter",
    nameKo: "Jitter Motion Design",
    originUrl: "https://jitter.video/",
    reaEvidenceId: "ev_2d1aa187b94021f527b0d3ac70f50d79b4b747935d04c55d4f5dd1b2fcd69a91",
    scenarioSha256: "90e125c7bb09b1c1e9bc3788c7a437cce97de4d1f4f2449d0c26e92e78cfc31d",
    surfaceHex: "#19171C",
    panelHex: "#232028",
    borderHex: "#36313d",
    textPrimaryHex: "#FFFFFF",
    textMutedHex: "#b3b3b3",
    accentPrimaryHex: "#7A40ED",
    accentSecondaryHex: "#a855f7",
    borderRadiusPx: 12,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "레이어드 아트보드 → 모션 프리셋 애니메이션 → 무손실 4K/Lottie/무빙툰 루프 익스포트",
    keyRoutes: ["/"],
  },
  "lumiere-graphics": {
    platformId: "lumiere-graphics",
    nameKo: "Lumiere Graphics WebGPU Shaders",
    originUrl: "https://lumiere.graphics/",
    reaEvidenceId: "ev_1b6dac1de41311e357dbbcffe8ac3a0152ac8a38566670b69e64cce0c2819387",
    scenarioSha256: "a8299ab08f35cbf13becd96d6b8e267a570eacdec7010f1c015f5ce299e160b1",
    surfaceHex: "#0e0c13",
    panelHex: "#181520",
    borderHex: "#2d273b",
    textPrimaryHex: "#f8fafc",
    textMutedHex: "#a1a1aa",
    accentPrimaryHex: "#ff5a31",
    accentSecondaryHex: "#9a86fc",
    borderRadiusPx: 10,
    fontStack: "Geist, Inter, sans-serif",
    coreWorkflowKo:
      "실시간 WebGPU 비파괴 포스트프로세싱: Kuwahara 회화 필터 · 필름 Halation · 아나모픽 Glare · CRT/디더링 셰이더 체인",
    keyRoutes: ["/", "/changelog", "/roadmap"],
  },
  "graphite-editor": {
    platformId: "graphite-editor",
    nameKo: "Graphite Procedural Node Editor",
    originUrl: "https://graphite.rs/",
    reaEvidenceId: "ev_635a2c265c07c191273b2a7a893507c0495e7b3498aedfdc6f91471adfaa2f86",
    scenarioSha256: "db99212fb5132845e7743ddaefe217063847e305b61d23ea8c1464d53914e39b",
    surfaceHex: "#111111",
    panelHex: "#222222",
    borderHex: "#333333",
    textPrimaryHex: "#dddddd",
    textMutedHex: "#888888",
    accentPrimaryHex: "#e08838",
    accentSecondaryHex: "#4992d6",
    borderRadiusPx: 6,
    fontStack: "Source Sans Pro, Inter, sans-serif",
    coreWorkflowKo: "Rust/WASM 기반 비파괴 벡터·래스터 하이브리드 노드 그래프 컴포지터",
    keyRoutes: ["/", "/api/event"],
  },
  pixieditor: {
    platformId: "pixieditor",
    nameKo: "PixiEditor Universal 2D",
    originUrl: "https://pixieditor.net/",
    reaEvidenceId: "ev_beb60ae9754671115d8cea321a358724b7601c0967065663192d4d6435f9b919",
    scenarioSha256: "1e017e75b925ae2fd960d81fe79c01e787e3bc5da2350c8d241eaf727a572cae",
    surfaceHex: "#111214",
    panelHex: "#15171a",
    borderHex: "#23262b",
    textPrimaryHex: "#DCDCDC",
    textMutedHex: "#80848E",
    accentPrimaryHex: "#F3C31A",
    accentSecondaryHex: "#302c24",
    borderRadiusPx: 8,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo:
      "노드 그래프 + 레이어 스택 + 프레임 바이 프레임 애니메이션 + 커스텀 셰이더를 통합한 범용 2D 파이프라인",
    keyRoutes: ["/docs", "/extensions", "/colorpicker", "/download"],
  },
  spline: {
    platformId: "spline",
    nameKo: "Spline 3D & Hana",
    originUrl: "https://spline.design/",
    reaEvidenceId: "ev_3171b5f912972cab97571d062102a47b20a00293a0d49b5c5b272001a948b32f",
    scenarioSha256: "773b0e108cf1f9f9a73bf9f4d3d2963f107cfda96c63d8538516f3b847940e2b",
    surfaceHex: "#000000",
    panelHex: "#121316",
    borderHex: "#363636",
    textPrimaryHex: "#ffffff",
    textMutedHex: "#e0e0e0",
    accentPrimaryHex: "#5865F2",
    accentSecondaryHex: "#38E2B3",
    borderRadiusPx: 12,
    fontStack: "Spline Sans, Inter, sans-serif",
    coreWorkflowKo:
      "브라우저 실시간 3D 디자인(/3d-design) + AI 3D 생성(/ai-generate) + AI 스타일 트랜스퍼(/ai-style-transfer) + Hana 2D/3D 인터랙티브 캔버스(/hana) + MCP 연동(/mcp)",
    keyRoutes: ["/3d-design", "/hana", "/ai-generate", "/ai-style-transfer", "/mcp"],
  },
  rive: {
    platformId: "rive",
    nameKo: "Rive Interactive State Machine",
    originUrl: "https://rive.app/",
    reaEvidenceId: "ev_0694fab590921fecb24ca0a5ebddb7cadf52273043897a3ef0dfabf38c70b4b7",
    scenarioSha256: "2b2493ee53f3ffc4f86ffb3665abf059724e92366389224402a5fad471c3e721",
    surfaceHex: "#070708",
    panelHex: "#0d0d0f",
    borderHex: "#222328",
    textPrimaryHex: "#FFFFFF",
    textMutedHex: "#a5a5a5",
    accentPrimaryHex: "#0099FF",
    accentSecondaryHex: "#FF483C",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "2D 본·메쉬 디포메이션 리그 + 스크롤/터치 입력 반응형 인터랙티브 상태머신(State Machine)",
    keyRoutes: ["/"],
  },
  "medibang-paint": {
    platformId: "medibang-paint",
    nameKo: "MediBang Paint",
    originUrl: "https://medibangpaint.com/",
    reaEvidenceId: "ev_2a409645bc383af67c30cc72cde5c63397b4dce431ece4ff762d8e022ec1f6a4",
    scenarioSha256: "718f21e20611bef71c3c1d6a04536e0c716759221cfce38899c30ac2bd3fb636",
    surfaceHex: "#313131",
    panelHex: "#242424",
    borderHex: "#444444",
    textPrimaryHex: "#ffffff",
    textMutedHex: "#cccccc",
    accentPrimaryHex: "#007cba",
    accentSecondaryHex: "#7a00df",
    borderRadiusPx: 8,
    fontStack: "Noto Sans JP, Pretendard, sans-serif",
    coreWorkflowKo: "만화 컷 칼날 분할 + 클라우드 스크린톤/브러시 동기화 + 스냅 가이드 자(Ruler)",
    keyRoutes: ["/"],
  },
  ibispaint: {
    platformId: "ibispaint",
    nameKo: "ibisPaint",
    originUrl: "https://ibispaint.com/",
    reaEvidenceId: "ev_75aa161f8a02eefbfba96631394b51d6a228d049f24e13988c400022dd674eab",
    scenarioSha256: "b69e291c96ef70a7ee63d76f2ea642246f5c888efe04ba4d28e883f8efae4b4a",
    surfaceHex: "#dbe2e7",
    panelHex: "#FFFFFF",
    borderHex: "#CCCCCC",
    textPrimaryHex: "#525559",
    textMutedHex: "#666666",
    accentPrimaryHex: "#006699",
    accentSecondaryHex: "#ff6699",
    borderRadiusPx: 10,
    fontStack: "Inter, sans-serif",
    coreWorkflowKo: "타임랩스 작화 리플레이 기록 + 만화 배경 필터(Anime Background) + 손떨림 보정 스트로크 안정화",
    keyRoutes: ["/"],
  },
  "clip-studio-paint": {
    platformId: "clip-studio-paint",
    nameKo: "Clip Studio Paint",
    originUrl: "https://www.clipstudio.net/en/",
    reaEvidenceId: "ev_6ef8739eb39c554d45fe2735be7bec6323b81dd6636cecd4de13ff339dff673d",
    scenarioSha256: "b8006fa8e94809251353b459d1490ccd467cbc285116d0d0eb3494ae1b68aa2d",
    surfaceHex: "#1B1E24",
    panelHex: "#262930",
    borderHex: "#3a3f4a",
    textPrimaryHex: "#f4f4f4",
    textMutedHex: "#b7b7b7",
    accentPrimaryHex: "#0B96E3",
    accentSecondaryHex: "#61B001",
    borderRadiusPx: 6,
    fontStack: "Inter, Pretendard, sans-serif",
    coreWorkflowKo: "벡터 지우개 교차점 절단 + 참조 레이어 틈새 닫기 채우기 + 3D 데생 인형/음영 어시스트",
    keyRoutes: ["/", "/releases/v"],
  },
  acon3d: {
    platformId: "acon3d",
    nameKo: "ACON3D (에이콘3D)",
    originUrl: "https://www.acon3d.com/",
    reaEvidenceId: "ev_c58fac87f1de010c366346d3f144baed81b0de4a7ae5e310fa4ace18c1ae617b",
    scenarioSha256: "9af0c6f2143b88c164e34c7f65f3abfd3fe5e153c6b847f325f511421094ec38",
    surfaceHex: "#18181b",
    panelHex: "#27272a",
    borderHex: "#313131",
    textPrimaryHex: "#f4f4f5",
    textMutedHex: "#a1a1aa",
    accentPrimaryHex: "#6366f1",
    accentSecondaryHex: "#ec4899",
    borderRadiusPx: 10,
    fontStack: "Pretendard, sans-serif",
    coreWorkflowKo: "웹툰 전용 스케치업·블렌더·스냅툰 3D 배경 카탈로그 & 동적 컴포넌트(문/창문/조명) 제어",
    keyRoutes: ["/"],
  },
  "webtoon-canvas": {
    platformId: "webtoon-canvas",
    nameKo: "WEBTOON CANVAS",
    originUrl: "https://www.webtoons.com/en/canvas",
    reaEvidenceId: "ev_054b1489efcd0052fd9893f98109861b735650a268d87a777e36a0de7fb781c3",
    scenarioSha256: "6250ba8e36382b5015267440225dcaaf359e101aae6e4e939656f3112cba9b0f",
    surfaceHex: "#121212",
    panelHex: "#1e1e1e",
    borderHex: "#2e2e2e",
    textPrimaryHex: "#ffffff",
    textMutedHex: "#999999",
    accentPrimaryHex: "#00dc64",
    accentSecondaryHex: "#00ff74",
    borderRadiusPx: 8,
    fontStack: "Pretendard, Hind, sans-serif",
    coreWorkflowKo:
      "800×1280px 세로 슬라이스 20MB 규격 검수 + 에피소드 썸네일/시리즈 배너 패키징 + 글로벌 독자 퍼블리싱",
    keyRoutes: ["/en/canvas", "/creative/list", "/preview"],
  },
});

export const REA39_PLATFORM_UI_THEME_CATALOG = REA15_PLATFORM_UI_THEME_CATALOG;

/* ============================================================================
 * 1. GlimNavi Studio v2.3 — 5종 선화 워크플로우 · 6종 표현 프리셋 · 컬러 레이어 분리 · Relight
 * ============================================================================ */

export const GLIMNAVI_LINEART_VERSIONS = [
  "v1.0-basic",
  "v2.0-preserve-original",
  "v2.1-precision",
  "v2.2-learned",
  "v2.3-balanced",
] as const;

export const GLIMNAVI_LINEART_PRESETS = [
  "thin-line",
  "face-preserve",
  "shading-keep",
  "fast-convert",
  "clean-line",
  "detail-preserve",
] as const;

export const GLIMNAVI_CANVAS_PRESETS = [
  "800x600",
  "1024x768",
  "1280x720",
  "1920x1080",
  "2560x1440",
] as const;

export const GlimnaviRelightAndLineartV23Schema = z.object({
  studioStageSummaryKo: z.string(),
  selectedLineartVersion: z.enum(GLIMNAVI_LINEART_VERSIONS),
  selectedLineartPreset: z.enum(GLIMNAVI_LINEART_PRESETS),
  canvasBaseSize: z.enum(GLIMNAVI_CANVAS_PRESETS),
  colorLayerSeparationEnabled: z.boolean(),
  nonDestructiveProposalId: z.string(),
  separatedColorLayers: z.array(
    z.object({
      layerId: z.string(),
      layerNameKo: z.string(),
      dominantHex: z.string(),
      blendMode: z.enum(["normal", "multiply", "screen", "overlay", "soft-light"]),
      opacityPct: z.number(),
      strokeGapTolerancePx: z.number(),
    }),
  ),
  relightPass: z.object({
    aiShadowDirectionDeg: z.number(),
    aiShadowSoftnessPct: z.number(),
    lightingKelvin: z.number(),
    rimLightHex: z.string(),
    ambientOcclusionIntensityPct: z.number(),
    shadingContrastBoostPct: z.number(),
    relightDirectiveKo: z.string(),
  }),
  exportReadiness: z.object({
    downloadCanvasReady: z.boolean(),
    downloadAllLayersZipReady: z.boolean(),
    downloadPsdReady: z.boolean(),
  }),
});

export type GlimnaviRelightAndLineartV23Report = z.infer<
  typeof GlimnaviRelightAndLineartV23Schema
>;

/* ============================================================================
 * 2. KAISTORY — 4단계 단일 프로젝트 데이터 엔벨로프 & KAION 학습카드·독자 퀴즈
 * ============================================================================ */

export const KaistorySingleEnvelopeAndKaionSchema = z.object({
  envelopeSummaryKo: z.string(),
  projectEnvelopeVersion: z.string(),
  offlineFirstSyncStatus: z.enum(["synced-local-authoritative", "pending-delta", "conflict-free-merged"]),
  subdomainStages: z.array(
    z.object({
      subdomain: z.enum([
        "conti.kaistory.net",
        "design.kaistory.net",
        "editor.kaistory.net",
        "story.kaistory.net",
      ]),
      stageNameKo: z.string(),
      derivedRevisionHash: z.string(),
      keyOutputSummaryKo: z.string(),
    }),
  ),
  speakerTtsAndMultilingualTracks: z.array(
    z.object({
      speakerName: z.string(),
      voicePresetId: z.string(),
      koLine: z.string(),
      enLine: z.string(),
      jaLine: z.string(),
      estimatedDurationMs: z.number(),
    }),
  ),
  kaionLearningCards: z.array(
    z.object({
      cardId: z.string(),
      titleKo: z.string(),
      narrativeConceptKo: z.string(),
      quizQuestionKo: z.string(),
      choicesKo: z.array(z.string()),
      correctChoiceIndex: z.number(),
      explanationKo: z.string(),
      rewardBadgeNameKo: z.string(),
    }),
  ),
});

export type KaistorySingleEnvelopeAndKaionReport = z.infer<
  typeof KaistorySingleEnvelopeAndKaionSchema
>;

/* ============================================================================
 * 3. Snaptoon · Frameo · NAVER SHAPER · Plask · Posemaniacs 3D & 스포트라이트 콘 디렉터
 * ============================================================================ */

export const SnaptoonFrameoShaper3dDirectorSchema = z.object({
  directorSummaryKo: z.string(),
  snaptoonBridge: z.object({
    themeMode: z.enum(["paper-warm-FAF8F5", "dark-studio-0A0A0A"]),
    warehouseScenePresetNameKo: z.string(),
    cameraFocalLengthMm: z.number(),
    snapboardAiTransformStrengthPct: z.number(),
    preservedLineFidelityPct: z.number(),
  }),
  frameoSpotlightShader: z.object({
    cursorAngleDeg: z.number(),
    coneSpreadDeg: z.number(),
    edgeSensitivity: z.number(),
    colorSensitivity: z.number(),
    glowPrimaryHex: z.string(),
    glowSecondaryHex: z.string(),
    shortDramaTransitionRuleKo: z.string(),
  }),
  shaperAndPoseRig: z.object({
    shaperPresetComboKo: z.string(),
    surfaceDirectDrawLayerCount: z.number(),
    posemaniacsEcorcheCameraPitchDeg: z.number(),
    posemaniacsHandRigPresetKo: z.string(),
    plaskMocapFootLockConfidencePct: z.number(),
    layeredPsdPassNames: z.array(z.string()),
  }),
});

export type SnaptoonFrameoShaper3dDirectorReport = z.infer<
  typeof SnaptoonFrameoShaper3dDirectorSchema
>;

/* ============================================================================
 * 4. ManhwaAI · Komiko AI · Anifusion 통합 화풍·효과톤·레이어 분리기·노드 플로우 디렉터
 * ============================================================================ */

export const MANHWAAI_STYLE_PRESETS = [
  "full-color",
  "black-and-white",
  "grayscale",
  "monochrome",
  "sketch",
  "watercolor",
] as const;

export const MANHWAAI_TONE_OVERLAYS = [
  "FocusingLine",
  "SpeedLine",
  "Tone",
  "ToneNoise",
  "ToneSnow",
] as const;

export const ManhwaKomikoAnifusionFlowSchema = z.object({
  pipelineSummaryKo: z.string(),
  manhwaStylePreset: z.enum(MANHWAAI_STYLE_PRESETS),
  activeToneOverlays: z.array(
    z.object({
      toneType: z.enum(MANHWAAI_TONE_OVERLAYS),
      targetCutNumber: z.number(),
      opacityPct: z.number(),
      angleDeg: z.number(),
      dramaticPurposeKo: z.string(),
    }),
  ),
  komikoLayerSplitterAndInbetween: z.object({
    ocAnchorId: z.string(),
    splitParts: z.array(z.string()),
    inbetweenFrameCount: z.number(),
    motionCurveType: z.enum(["ease-in-out", "anticipation-snap", "impact-hold", "linear"]),
  }),
  anifusionNodeFlowGraph: z.array(
    z.object({
      nodeId: z.string(),
      nodeType: z.enum([
        "UniversalPromptEditor",
        "CharacterSheetAnchor",
        "FlowImageSelector",
        "ComicPresetStylizer",
        "LayerSplitterOutput",
      ]),
      upstreamNodeIds: z.array(z.string()),
      outputSummaryKo: z.string(),
    }),
  ),
});

export type ManhwaKomikoAnifusionFlowReport = z.infer<
  typeof ManhwaKomikoAnifusionFlowSchema
>;

/* ============================================================================
 * 5. [창의적 AI 특화] 웹툰 독자 도파민·스크롤 정지 히트맵 시뮬레이터 & 15대 UI/UX 테마 합성기
 * ============================================================================ */

export const CreativeDopamineAndUxSynthesizerSchema = z.object({
  executiveSummaryKo: z.string(),
  overallDopaminePeakScore: z.number(),
  predictedEpisodeCompletionRatePct: z.number(),
  cliffhangerHookPowerPct: z.number(),
  cutScrollHeatmap: z.array(
    z.object({
      cutNumber: z.number(),
      narrativeBeatKo: z.string(),
      predictedDwellTimeMs: z.number(),
      scrollVelocityPxPerSec: z.number(),
      dopamineSpikePct: z.number(),
      recommendedVisualAmplifierKo: z.string(),
    }),
  ),
  synthesizedUiUxTheme: z.object({
    themeTitleKo: z.string(),
    primarySourcePlatform: z.enum(REA15_PLATFORM_IDS),
    secondarySourcePlatform: z.enum(REA15_PLATFORM_IDS),
    surfaceHex: z.string(),
    panelHex: z.string(),
    accentPrimaryHex: z.string(),
    accentSecondaryHex: z.string(),
    textPrimaryHex: z.string(),
    borderRadiusPx: z.number(),
    recommendedFontPairKo: z.string(),
    wcagContrastRatio: z.number(),
    designRationaleKo: z.string(),
  }),
});

export type CreativeDopamineAndUxSynthesizerReport = z.infer<
  typeof CreativeDopamineAndUxSynthesizerSchema
>;

/* ============================================================================
 * 6. TooToon 5-Studio(fabulator~emporium) · GenToon 뷰어/굿즈 · Tooning Plus 6부위 캐릭터 디렉터
 * ============================================================================ */

export const TOOTOON_STUDIO_MODULES = [
  "fabulator",
  "character-studio",
  "visual-studio",
  "artifex",
  "emporium",
] as const;

export const TOONING_CHARACTER_PART_ROUTES = [
  "/character-make-basic",
  "/character-make-face",
  "/character-make-body",
  "/character-make-hand",
  "/character-make-hair",
  "/character-make-etc",
] as const;

export const TootoonGentoonTooningKrSuiteSchema = z.object({
  suiteSummaryKo: z.string(),
  tootoonFiveStudios: z.array(
    z.object({
      moduleId: z.enum(TOOTOON_STUDIO_MODULES),
      routePath: z.string(),
      stageTitleKo: z.string(),
      deliverableSummaryKo: z.string(),
    }),
  ),
  gentoonReaderAndCommerce: z.object({
    readingDirection: z.enum(["vertical-scroll-1", "paged-ltr-0", "paged-rtl-2"]),
    paperHex: z.string(),
    inkHex: z.string(),
    violetAccentHex: z.string(),
    recommendedGoodsItems: z.array(
      z.object({
        skuId: z.string(),
        goodsNameKo: z.string(),
        targetSupporterTierKo: z.string(),
        estimatedMarginPct: z.number(),
      }),
    ),
  }),
  tooningSixPartCharacterRecipe: z.array(
    z.object({
      partRoute: z.enum(TOONING_CHARACTER_PART_ROUTES),
      partLabelKo: z.string(),
      selectedPresetSummaryKo: z.string(),
      consistencyLockScorePct: z.number(),
    }),
  ),
});

export type TootoonGentoonTooningKrSuiteReport = z.infer<
  typeof TootoonGentoonTooningKrSuiteSchema
>;

/* ============================================================================
 * 7. Krea 실시간 디렉터 · Spline 3D/Hana 스타일 전이 · Lumiere/Graphite/PixiEditor 셰이더 디렉터
 * ============================================================================ */

export const KreaSplineLumiereRealtimeShaderSchema = z.object({
  realtimePipelineSummaryKo: z.string(),
  kreaRealtimeDirector: z.object({
    activeRoute: z.enum(["/realtime", "/realtime-director", "/apps/image/flux-krea", "/apps/enhance"]),
    i2iDenoiseStrength: z.number(),
    enhanceUpscaleFactor: z.number(),
    blockingPrimitiveCount: z.number(),
    directorCoachingKo: z.string(),
  }),
  spline3dAndHanaBridge: z.object({
    activeRoute: z.enum(["/3d-design", "/hana", "/ai-generate", "/ai-style-transfer", "/mcp"]),
    styleTransferPresetKo: z.string(),
    cameraOrbitAzimuthDeg: z.number(),
    cameraOrbitElevationDeg: z.number(),
    interactiveStateTriggerKo: z.string(),
  }),
  lumiereAndNodeGraphShaders: z.object({
    kuwaharaPaintRadiusPx: z.number(),
    filmHalationIntensityPct: z.number(),
    anamorphicGlareStreakPct: z.number(),
    graphiteProceduralNodeCount: z.number(),
    pixiEditorFrameLoopCount: z.number(),
    compositeShaderNoteKo: z.string(),
  }),
});

export type KreaSplineLumiereRealtimeShaderReport = z.infer<
  typeof KreaSplineLumiereRealtimeShaderSchema
>;

/* ============================================================================
 * 8. LTX Studio · Boords 애니매틱 · Cascadeur 물리 오토포징 · Rive/Jitter 상태머신 디렉터
 * ============================================================================ */

export const LtxBoordsCascadeurRiveAnimaticSchema = z.object({
  animaticExecutiveSummaryKo: z.string(),
  ltxAndBoordsAnimaticShots: z.array(
    z.object({
      shotNumber: z.number(),
      cameraMove: z.enum([
        "dolly-in",
        "whip-pan",
        "crane-up",
        "dutch-tilt-push",
        "tracking-orbit",
      ]),
      durationMs: z.number(),
      voiceoverBeatKo: z.string(),
      visualTransitionKo: z.string(),
    }),
  ),
  cascadeurPhysicsRig: z.object({
    autoPosingConfidencePct: z.number(),
    centerOfMassHeightCm: z.number(),
    ballisticTrajectoryArcKo: z.string(),
    angularMomentumTorqueNm: z.number(),
    secondaryClothHairFollowThroughKo: z.string(),
  }),
  riveAndJitterStateMachine: z.object({
    stateMachineName: z.string(),
    scrollTriggerThresholdPct: z.number(),
    states: z.array(
      z.object({
        stateName: z.string(),
        triggerConditionKo: z.string(),
        meshDeformationSummaryKo: z.string(),
        loopFps: z.number(),
      }),
    ),
  }),
});

export type LtxBoordsCascadeurRiveAnimaticReport = z.infer<
  typeof LtxBoordsCascadeurRiveAnimaticSchema
>;

/* ============================================================================
 * 공통 실행 엔벨로프 및 통합 번들
 * ============================================================================ */

export interface Rea15ExecutionMeta {
  readonly taskId: ClaudeCreatorTaskId;
  readonly taskProfile: ClaudeCreatorTaskProfile;
  readonly routedModel: string;
  readonly modelUsed: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedCostUsd: number;
  readonly fallbackReason?: string;
}

export interface Rea15Envelope<T> {
  readonly source: "claude-live" | "local-fallback";
  readonly report: T;
  readonly modelUsed: string;
  readonly usage: ClaudeTokenUsage;
  readonly estimatedCostUsd: number;
  readonly taskProfile: ClaudeCreatorTaskProfile;
  readonly routedModel: string;
  readonly fallbackReason?: string;
  readonly meta: Rea15ExecutionMeta;
}

export interface Rea15FullSuiteBundle {
  readonly generatedAtIso: string;
  readonly totalEstimatedCostUsd: number;
  readonly liveEngineCount: number;
  readonly fallbackEngineCount: number;
  readonly glimnaviRelightLineart: Rea15Envelope<GlimnaviRelightAndLineartV23Report>;
  readonly kaistoryEnvelopeKaion: Rea15Envelope<KaistorySingleEnvelopeAndKaionReport>;
  readonly snaptoonFrameoShaper3d: Rea15Envelope<SnaptoonFrameoShaper3dDirectorReport>;
  readonly manhwaKomikoAnifusionFlow: Rea15Envelope<ManhwaKomikoAnifusionFlowReport>;
  readonly creativeDopamineUxSynthesizer: Rea15Envelope<CreativeDopamineAndUxSynthesizerReport>;
  readonly tootoonGentoonTooningKrSuite: Rea15Envelope<TootoonGentoonTooningKrSuiteReport>;
  readonly kreaSplineLumiereRealtimeShader: Rea15Envelope<KreaSplineLumiereRealtimeShaderReport>;
  readonly ltxBoordsCascadeurRiveAnimatic: Rea15Envelope<LtxBoordsCascadeurRiveAnimaticReport>;
}
