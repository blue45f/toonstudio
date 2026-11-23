/**
 * IT 개발자·기획자용 차세대 웹·Remotion·AI 하네스 기술 쇼케이스 정본 데이터 (`/tech`).
 *
 * 실제 저장소 경로·스크립트·패키지 구조(`packages/product-tour-film`, `tools/media/brand-film`,
 * `packages/studio-hokusai-wasm`, `AGENTS.md`, `deploy/DEPLOY_MANIFEST.json`)에 근거해 작성하며
 * 미실측 수치나 미구현 기능 과장을 금지한다.
 */

import type { BilingualText } from "./competitor-benchmark-data";

export type TechTabId = "architecture" | "remotion" | "ai-skills" | "chrome-apis";

export interface TechArchitectureCard {
  readonly id: string;
  readonly indexLabel: string;
  readonly title: BilingualText;
  readonly subtitle: BilingualText;
  readonly whyInteresting: BilingualText;
  readonly status: "current" | "expanding";
  readonly stackTags: readonly string[];
  readonly repoPaths: readonly string[];
  readonly spritePath?: string;
}

export interface RemotionPipelineStep {
  readonly step: string;
  readonly title: BilingualText;
  readonly detail: BilingualText;
}

export interface RemotionCodeRecipe {
  readonly id: string;
  readonly title: BilingualText;
  readonly subtitle: BilingualText;
  readonly language: "tsx" | "bash";
  readonly sourceRef: string;
  readonly code: string;
}

export interface AiHarnessPillar {
  readonly id: string;
  readonly title: BilingualText;
  readonly command: string;
  readonly detail: BilingualText;
}

export interface ChromeNextGenApiSpec {
  readonly id:
    | "view-transitions"
    | "speculation-rules"
    | "scroll-driven"
    | "anchor-popover"
    | "webgpu"
    | "opfs"
    | "eyedropper"
    | "hardware-io";
  readonly name: string;
  readonly chromeSince: string;
  readonly useInToonStudio: BilingualText;
  readonly fallbackStrategy: BilingualText;
}

export interface NextGenApiProbeItem extends ChromeNextGenApiSpec {
  readonly supported: boolean;
  readonly detail: string;
}

export interface BrowserHardwareSnapshot {
  readonly cores: number | null;
  readonly maxTouchPoints: number;
  readonly prefersReducedMotion: boolean;
  readonly forcedColors: boolean;
  readonly computePressure: boolean;
  readonly viewportSegments: boolean;
  readonly webXr: boolean;
  readonly webAudio: boolean;
}

export interface NextGenWebApiProbeReport {
  readonly items: readonly NextGenApiProbeItem[];
  readonly supportedCount: number;
  readonly totalCount: number;
  readonly readinessTier: "nextgen-ready" | "progressive" | "baseline";
  readonly hardware: BrowserHardwareSnapshot;
}

export interface BrowserProbeEnv {
  readonly windowObj?: {
    readonly EyeDropper?: unknown;
    readonly PressureObserver?: unknown;
    readonly AudioContext?: unknown;
    readonly webkitAudioContext?: unknown;
    readonly viewport?: { readonly segments?: readonly unknown[] };
    readonly matchMedia?: (query: string) => { readonly matches: boolean };
  };
  readonly documentObj?: {
    readonly startViewTransition?: unknown;
  };
  readonly navigatorObj?: {
    readonly gpu?: unknown;
    readonly storage?: { readonly getDirectory?: unknown };
    readonly hid?: unknown;
    readonly requestMIDIAccess?: unknown;
    readonly getGamepads?: unknown;
    readonly xr?: unknown;
    readonly hardwareConcurrency?: number;
    readonly maxTouchPoints?: number;
  };
  readonly cssSupports?: (property: string, value?: string) => boolean;
  readonly scriptSupports?: (type: string) => boolean;
  readonly popoverSupported?: boolean;
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

export const TECH_ARCHITECTURE_CARDS: readonly TechArchitectureCard[] = [
  {
    id: "webgpu-wasm64",
    indexLabel: "01 · GPU & WASM",
    title: bi("WebGPU 타일 브러시 & Rust/WASM 파이프라인", "WebGPU Tile Brush & Rust/WASM Pipeline"),
    subtitle: bi("브라우저 탭에서 7-band Kubelka-Munk 분광 혼색을 연산", "7-band Kubelka-Munk spectral pigment mixing right inside a browser tab"),
    whyInteresting: bi(
      "단순 RGB 알파 블렌딩은 파랑+노랑을 섞으면 탁한 회색이 됩니다. ToonStudio는 자체 7-band 분광 코어와 Rust/WASM 타일 엔진(Skia·Vello·Hokusai 계층)을 조합하고, GPU 미지원 환경에서는 CPU 경로로 자동 폴백합니다.",
      "Naive RGB blending turns blue + yellow into muddy gray. ToonStudio pairs a 7-band spectral core with Rust/WASM tile engines and falls back cleanly when WebGPU is absent.",
    ),
    status: "current",
    stackTags: ["WebGPU WGSL", "Rust WASM", "KM7 Spectral", "Canvas2D Fallback"],
    repoPaths: [
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      "packages/studio-hokusai-wasm",
      "packages/studio-engine-vello",
    ],
    spritePath: "/assets/studio/vibrant-sprites/tech-webgpu.webp",
  },
  {
    id: "sqlite-opfs",
    indexLabel: "02 · LOCAL-FIRST DB",
    title: bi("SQLite WASM + OPFS 로컬 정본 아키텍처", "SQLite WASM + OPFS Local Authority"),
    subtitle: bi("설치 없는 웹앱에서도 네이티브급 무손실 자동 저장과 ₩0 서버 저장비", "Crash-resilient local persistence with zero cloud storage lock-in"),
    whyInteresting: bi(
      "브라우저 전용 비공개 파일시스템(OPFS) 위에 SQLite 저널과 콘텐츠 주소 저장소(CAS)를 얹었습니다. 탭이 갑자기 닫혀도 작업이 살아남고, 대용량 레이어를 매 스트로크마다 서버로 올리지 않아 단위경제가 가볍습니다.",
      "Runs a SQLite journal and content-addressed store over Origin Private File System (OPFS), surviving crashes while avoiding costly per-stroke cloud uploads.",
    ),
    status: "current",
    stackTags: ["OPFS", "SQLite WASM", "CAS Storage", "Multi-Tab Leader"],
    repoPaths: [
      "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
      "apps/web/src/domains/creator/studio-workflow/studio-runtime-ownership.ts",
    ],
  },
  {
    id: "yjs-webrtc",
    indexLabel: "03 · REALTIME CRDT",
    title: bi("Yjs CRDT + WebRTC P2P 실시간 협업", "Yjs CRDT + WebRTC P2P Collaboration"),
    subtitle: bi("충돌 없는 오프라인 병합과 Cloudflare 엣지 시그널링", "Conflict-free offline merges paired with Cloudflare edge signaling"),
    whyInteresting: bi(
      "작가·어시스턴트·PD가 같은 원고를 열어도 중앙 잠금 없이 CRDT 상태 벡터로 병합합니다. 장기 세션 메모리 팽창을 막기 위한 주기적 스냅샷 컴팩션 테스트까지 CI에 고정돼 있습니다.",
      "Merges concurrent edits via CRDT state vectors without lock contention, backed by automated long-session compaction tests in CI.",
    ),
    status: "expanding",
    stackTags: ["Yjs CRDT", "WebRTC P2P", "Cloudflare Durable Objects", "Compaction"],
    repoPaths: [
      "apps/web/src/domains/creator/live/studio-crdt-compaction.test.ts",
      "deploy/cloudflare-realtime",
    ],
  },
  {
    id: "remotion-pipeline",
    indexLabel: "04 · VIDEO AS CODE",
    title: bi("Remotion 웹툰 애니매틱 · 쇼츠 결정론적 렌더링", "Remotion Webtoon Animatics & Deterministic Shorts"),
    subtitle: bi("같은 React 컴포지션으로 브라우저 <Player>와 Headless MP4를 동시에", "One React composition powers both live browser <Player> and Headless MP4"),
    whyInteresting: bi(
      "웹툰 컷·말풍선·자막·카메라 패닝을 타임라인 영상 편집기가 아니라 순수 React 함수(`frame => JSX`)로 선언합니다. 코드 수정 즉시 16:9·9:16·1:1 포맷과 자막 VTT가 결정론적으로 재생성됩니다.",
      "Declares comic panels, captions and camera pans as pure React functions (`frame => JSX`), generating 16:9, 9:16, 1:1 MP4s and VTT subtitles deterministically.",
    ),
    status: "current",
    stackTags: ["Remotion 4", "@remotion/player", "React 19", "Headless H.264"],
    repoPaths: [
      "packages/product-tour-film/src/ProductTourFilm.tsx",
      "tools/media/brand-film/src/index.tsx",
      "apps/web/src/domains/marketing/ProductTourPlayer.tsx",
    ],
    spritePath: "/assets/studio/vibrant-sprites/tech-remotion.webp",
  },
  {
    id: "ai-agent-harness",
    indexLabel: "05 · AGENT HARNESS",
    title: bi("AI 에이전트 하네스 & 병렬 워크트리 스웜", "AI Agent Harness & Parallel Worktree Swarms"),
    subtitle: bi("문서·아키텍처·린트·미연결 코드까지 기계가 자동 검증하는 개발 체계", "Automated architecture, lint, file-size and unconnected-code ratchets"),
    whyInteresting: bi(
      "AGENTS.md를 단일 정본 계약으로 삼고, 여러 AI 워커가 서로 다른 Git worktree에서 파일 충돌 0%로 병렬 작업합니다. 커밋 전 `validate:architecture`와 `check:unconnected-code:gate`가 고아 코드 유입을 차단합니다.",
      "Uses AGENTS.md as one canonical contract while parallel Git worktree workers build disjoint slices gated by architecture and unconnected-code checks.",
    ),
    status: "current",
    stackTags: ["AGENTS.md", "Git Worktree Swarm", "Ratchet Gates", "Ghidra REA"],
    repoPaths: [
      "AGENTS.md",
      "scripts/agent-harness.mjs",
      "scripts/validate-architecture.mjs",
      "scripts/check-unconnected-code.mjs",
    ],
  },
  {
    id: "multi-device-io",
    indexLabel: "06 · PERIPHERAL I/O",
    title: bi("멀티 디바이스 & 주변기기 웹 I/O 생태계", "Multi-Device & Peripheral Web I/O"),
    subtitle: bi("디지타이저 필압부터 WebHID 다이얼·워치·TV 10ft 포커스까지", "From stylus pressure & tilt to WebHID dials, watch & 10ft TV focus"),
    whyInteresting: bi(
      "PointerEvent의 pressure·tilt·twist를 우선 소비하고, 지원 브라우저에서는 WebHID·WebMIDI·Gamepad·BroadcastChannel을 점진 연결해 별도 드라이버 없이 왼손 컨트롤러와 보조 화면을 엮습니다.",
      "Consumes PointerEvent pressure/tilt/twist first and progressively layers WebHID, WebMIDI, Gamepad and BroadcastChannel companions.",
    ),
    status: "expanding",
    stackTags: ["PointerEvent", "WebHID", "WebMIDI", "BroadcastChannel"],
    repoPaths: [
      "apps/web/src/domains/creator/studio-workspace-device-signals.ts",
      "apps/web/src/domains/showcase/competitor-benchmark-data.ts",
    ],
  },
  {
    id: "webaudio-foley",
    indexLabel: "07 · PROCEDURAL AUDIO",
    title: bi("Web Audio 물리 모델링 Foley & 햅틱 피드백", "Procedural Web Audio Foley & Haptic Feedback"),
    subtitle: bi("MP3 샘플 용량 없이 필터·공진기로 펜촉과 종이 마찰음을 실시간 합성", "Synthesizing nib-on-paper acoustics in real time with zero MP3 asset bloat"),
    whyInteresting: bi(
      "고정 효과음 파일을 반복 재생하면 금방 기계적으로 들립니다. 브라우저 Web Audio API의 화이트/핑크 노이즈와 바이쿼드 필터 컷오프를 펜 속도와 필압에 연동하면 매 스트로크가 자연스럽게 반응합니다.",
      "Modulating filtered noise via Web Audio API against stroke velocity and pressure creates organic tactile acoustics without shipping heavy audio banks.",
    ),
    status: "expanding",
    stackTags: ["Web Audio API", "BiquadFilter", "Vibration API", "Zero Asset Bloat"],
    repoPaths: ["apps/web/src/shared/lib/site-background-music.ts"],
  },
  {
    id: "chrome-nextgen-apis",
    indexLabel: "08 · NEXT-GEN CHROME",
    title: bi("차세대 크롬 웹 플랫폼 API 8선 점진적 적용", "8 Next-Gen Chrome Web Platform APIs (Progressive)"),
    subtitle: bi("View Transitions · Speculation Rules · Scroll-Driven CSS를 폴백과 함께", "View Transitions, Speculation Rules & Scroll-Driven CSS with safe fallbacks"),
    whyInteresting: bi(
      "최신 크롬에서는 앱 전환 수준의 View Transition과 프리페치, GPU 컴포지터 스크롤 모션을 제공하고, 미지원 브라우저나 `prefers-reduced-motion` 환경에서는 즉시 무중단 폴백으로 동일 기능을 보장합니다.",
      "Unlocks smooth View Transitions, Speculation prefetch and compositor scroll motion on modern Chrome while preserving full functionality on every fallback browser.",
    ),
    status: "current",
    stackTags: ["View Transitions", "Speculation Rules", "Scroll-Driven CSS", "Anchor + Popover"],
    repoPaths: [
      "apps/web/src/domains/showcase/nextgen-web-platform-enhancer.ts",
      "apps/web/src/domains/showcase/showcase-nextgen-motion.css",
    ],
  },
];

export const REMOTION_PIPELINE_STEPS: readonly RemotionPipelineStep[] = [
  {
    step: "STEP 01",
    title: bi("웹툰 컷·챕터 데이터 선언", "Declare Panel & Chapter Data"),
    detail: bi("컷 이미지, 말풍선 텍스트, 3박자 비트, 챕터 타임코드를 타입 안전 객체로 정의", "Define cut assets, captions, beats and timecodes as typed data"),
  },
  {
    step: "STEP 02",
    title: bi("React 프레임 함수 합성", "Compose Pure Frame Function"),
    detail: bi("useCurrentFrame · spring · interpolate로 패닝·등장·자막 싱크를 결정론적 계산", "Compute pans, springs and kinetic captions deterministically from frame index"),
  },
  {
    step: "STEP 03",
    title: bi("브라우저 <Player> 즉시 프리뷰", "Live Browser <Player> Preview"),
    detail: bi("@remotion/player로 /product-tour에서 실시간 재생하고 실패 시 MP4 폴백 전환", "Stream interactively in /product-tour with automatic MP4 fallback"),
  },
  {
    step: "STEP 04",
    title: bi("Headless 멀티포맷 MP4 출력", "Headless Multi-Format Render"),
    detail: bi("16:9 · 9:16 · 1:1 H.264 MP4, 포스터 JPG, KO/EN VTT, SHA-256 매니페스트 일괄 생성", "Render 16:9, 9:16, 1:1 H.264 MP4s, posters, VTT & SHA-256 manifest"),
  },
];

export const REMOTION_CODE_RECIPES: readonly RemotionCodeRecipe[] = [
  {
    id: "webtoon-cut-composition",
    title: bi("레시피 1 · 웹툰 컷 카메라 패닝 + 말풍선 스프링", "Recipe 1 · Comic Panel Pan & Balloon Spring"),
    subtitle: bi("세로 컷 원고를 30fps 쇼츠 장면으로 변환하는 핵심 컴포지션 패턴", "Core pattern turning a vertical comic cut into a 30fps animatic scene"),
    language: "tsx",
    sourceRef: "packages/product-tour-film/src/ProductTourFilm.tsx",
    code: `import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";

export function WebtoonCutScene({ panelSrc, caption }: { panelSrc: string; caption: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // 세로 원고 컷을 위→아래로 부드럽게 패닝
  const panY = interpolate(frame, [0, 120], [0, -180], { extrapolateRight: "clamp" });
  // 말풍선 팝업 스프링 (결정론적 프레임 물리)
  const bubbleScale = spring({ frame: Math.max(0, frame - 18), fps, config: { damping: 14, stiffness: 180 } });

  return (
    <AbsoluteFill>
      <Img src={staticFile(panelSrc)} style={{ transform: \`translateY(\${panY}px)\` }} />
      <div style={{ transform: \`scale(\${bubbleScale})\`, opacity: bubbleScale }}>
        {caption}
      </div>
    </AbsoluteFill>
  );
}`,
  },
  {
    id: "browser-player-fallback",
    title: bi("레시피 2 · 웹앱 <Player> 실시간 합성 + MP4 폴백", "Recipe 2 · In-App <Player> + MP4 Fallback"),
    subtitle: bi("실제 /product-tour에서 쓰는 실시간 Remotion 플레이어와 안전 폴백 구조", "Real pattern used in /product-tour to embed Remotion safely"),
    language: "tsx",
    sourceRef: "apps/web/src/domains/marketing/ProductTourPlayer.tsx",
    code: `import { Player } from "@remotion/player";
import { PRODUCT_TOUR_DURATION_SECONDS, PRODUCT_TOUR_FPS, ToonStudioProductTour } from "@toonstudio/product-tour-film";

export function LiveProductTourStage({ fallbackToMp4 }: { fallbackToMp4: boolean }) {
  if (fallbackToMp4) {
    return <video controls playsInline src="/brand/toonstudio-product-tour.mp4" />;
  }
  return (
    <Player
      component={ToonStudioProductTour}
      compositionWidth={1280}
      compositionHeight={720}
      fps={PRODUCT_TOUR_FPS}
      durationInFrames={PRODUCT_TOUR_DURATION_SECONDS * PRODUCT_TOUR_FPS}
      controls
    />
  );
}`,
  },
  {
    id: "cli-deterministic-render",
    title: bi("레시피 3 · 로컬 스튜디오 프리뷰 & 멀티 포맷 렌더 CLI", "Recipe 3 · Local Remotion Studio & Multi-Format CLI"),
    subtitle: bi("저장소 `tools/media/brand-film`에서 실제로 실행 가능한 검증·렌더 명령", "Real runnable commands from tools/media/brand-film/package.json"),
    language: "bash",
    sourceRef: "tools/media/brand-film/package.json",
    code: `# 1. 의존성 설치 및 타입 검증
npm --prefix tools/media/brand-film ci
npm --prefix tools/media/brand-film run typecheck

# 2. 브라우저 인터랙티브 Remotion Studio 프리뷰 열기
npm --prefix tools/media/brand-film run studio

# 3. 16:9 / 9:16 / 1:1 / 헤더 MP4 + VTT + SHA-256 매니페스트 렌더
npm --prefix tools/media/brand-film run render -- landscape
npm --prefix tools/media/brand-film run render:product-tour`,
  },
];

export const AI_HARNESS_PILLARS: readonly AiHarnessPillar[] = [
  {
    id: "single-contract",
    title: bi("단일 계약 AGENTS.md + 하네스 무결성 검사", "Single Contract AGENTS.md + Harness Check"),
    command: "pnpm run harness:check",
    detail: bi(
      "Claude·Codex·Gemini·Cursor 어댑터가 복제 없이 루트 AGENTS.md를 단일 정본으로 참조하며, 스크립트가 드리프트를 자동 차단합니다.",
      "All AI tool adapters point to one canonical AGENTS.md verified automatically by harness scripts.",
    ),
  },
  {
    id: "architecture-ratchets",
    title: bi("아키텍처·파일 크기·진입 그래프 래칫 게이트", "Architecture, File Size & Eager-Graph Ratchets"),
    command: "pnpm run validate:architecture",
    detail: bi(
      "앱 경계 침범, 800줄 초과 거대 파일 증가, Studio 진입 번들에 3D/VRM/마켓 정적 유입을 CI에서 자동으로 막습니다.",
      "Blocks cross-app imports, >800-line file bloat, and static 3D/VRM leakage into the Studio entry graph.",
    ),
  },
  {
    id: "unconnected-code-gate",
    title: bi("미연결·고아 컴포넌트 0건 차단 게이트", "Unconnected & Orphan Component Gate"),
    command: "pnpm run check:unconnected-code:gate",
    detail: bi(
      "만들어 두고 라우터나 화면에 마운트하지 않은 죽은 컴포넌트를 정적 그래프 분석으로 즉시 잡아냅니다.",
      "Catches exported components or modules that are never mounted in non-test production code.",
    ),
  },
  {
    id: "strict-zero-raw-color",
    title: bi("원시 색상 0건 OKLCH 디자인 토큰 린트", "Zero Raw Colors OKLCH Token Lint"),
    command: "pnpm exec eslint --max-warnings=0 <changed-files>",
    detail: bi(
      "하드코딩 hex/rgb 대신 DESIGN.md OKLCH 시맨틱 토큰만 허용해 라이트·다크·고대비 9개 테마를 깨짐 없이 유지합니다.",
      "Enforces DESIGN.md OKLCH semantic tokens across all 9 themes including high-contrast mode.",
    ),
  },
  {
    id: "i18n-builtin-sync",
    title: bi("다국어 내장 사전·레거시 자산 자동 동기화", "Automated i18n Legacy & Builtin Sync"),
    command: "node scripts/sync-i18n-legacy-assets.mjs --check && node scripts/generate-i18n-builtins.mjs --check",
    detail: bi(
      "ko/en 라우트 키 추가 시 전 로케일 폴백 자산과 앱 셸 번들을 결정론적으로 동기화하고 stale 상태를 실패 처리합니다.",
      "Keeps all locale packs and generated builtin bundles deterministically synchronized in CI.",
    ),
  },
  {
    id: "cleanroom-ghidra-rea",
    title: bi("병렬 워크트리 스웜 & 클린룸 Ghidra REA", "Parallel Worktree Swarms & Clean-Room Ghidra REA"),
    command: "REA_ANALYSIS_PROVIDER=ghidra (오픈소스 강제 · 파일 소유권 분리)",
    detail: bi(
      "트랙별 전용 Git worktree와 겹치지 않는 파일 소유권으로 병렬 구현하고, 공개 UX 벤치마킹 시 오픈소스 Ghidra만 허용합니다.",
      "Disjoint file ownership across parallel Git worktrees plus strict open-source Ghidra clean-room policy.",
    ),
  },
];

export const NEXTGEN_CHROME_API_SPECS: readonly ChromeNextGenApiSpec[] = [
  {
    id: "view-transitions",
    name: "View Transitions API",
    chromeSince: "Chrome 111+",
    useInToonStudio: bi("페르소나 필터·기술 탭 전환 시 DOM 스냅샷 간 180ms 부드러운 크로스페이드", "180ms smooth cross-fade when switching persona filters & showcase tabs"),
    fallbackStrategy: bi("미지원 브라우저 및 모션 감소 설정 시 즉시 동기 상태 갱신", "Falls back to instant synchronous state update when unsupported or reduced-motion"),
  },
  {
    id: "speculation-rules",
    name: "Speculation Rules API",
    chromeSince: "Chrome 109+",
    useInToonStudio: bi("/compare/studio · /tech · /studio/new 간 moderate 프리페치로 탐색 체감 지연 축소", "Moderate prefetch between /compare/studio, /tech & /studio/new for snappy navigation"),
    fallbackStrategy: bi("HTMLScriptElement.supports 확인 후 미지원 시 일반 SPA 지연 로딩 유지", "Checks HTMLScriptElement.supports and relies on standard SPA lazy loading"),
  },
  {
    id: "scroll-driven",
    name: "CSS Scroll-Driven Animations",
    chromeSince: "Chrome 115+",
    useInToonStudio: bi("메인 스레드 JS 스크롤 리스너 없이 GPU 컴포지터에서 카드 리빌 처리", "Compositor-driven section reveal with zero JS scroll event listeners"),
    fallbackStrategy: bi("@supports (animation-timeline: view()) 가드로 미지원 시 즉시 불투명 표시", "Guarded by @supports (animation-timeline: view()); visible immediately otherwise"),
  },
  {
    id: "anchor-popover",
    name: "CSS Anchor Positioning + Popover API",
    chromeSince: "Chrome 125+",
    useInToonStudio: bi("Top-Layer 팝오버와 자동 화면 경계 회피로 툴바 겹침 0% 유지", "Top-layer popovers with viewport-edge flip to keep zero HUD overlap"),
    fallbackStrategy: bi("좌표 기반 고정 레이어 및 일반 dialog/button 상태 토글로 폴백", "Falls back to deterministic positioned overlays and standard toggle state"),
  },
  {
    id: "webgpu",
    name: "WebGPU (navigator.gpu)",
    chromeSince: "Chrome 113+",
    useInToonStudio: bi("7-band 분광 브러시 컴퓨트 셰이더와 실시간 3D 배경 스테이지 가속", "Accelerates 7-band spectral brush compute shaders & 3D background stage"),
    fallbackStrategy: bi("WebGL2 및 CPU WASM 래스터 경로로 무중단 폴백", "Falls back cleanly to WebGL2 / CPU WASM raster pipelines"),
  },
  {
    id: "opfs",
    name: "Origin Private File System (OPFS)",
    chromeSince: "Chrome 102+",
    useInToonStudio: bi("SQLite WASM 로컬 정본 DB와 대용량 원고 타일 CAS 고속 저장", "Backs the local SQLite WASM authority DB and high-speed tile CAS"),
    fallbackStrategy: bi("미지원 환경에서는 명시적 안내와 파일 내보내기 안전 경로 제공", "Surfaces an explicit status notice and direct file-export safety path"),
  },
  {
    id: "eyedropper",
    name: "EyeDropper API",
    chromeSince: "Chrome 95+",
    useInToonStudio: bi("브라우저 밖 레퍼런스 창 색상까지 픽셀 단위로 바로 채집", "Samples reference colors even outside the browser viewport"),
    fallbackStrategy: bi("캔버스 내부 픽셀 샘플러 및 OKLCH 색상 휠로 폴백", "Falls back to in-canvas pixel sampling and the OKLCH color wheel"),
  },
  {
    id: "hardware-io",
    name: "WebHID · WebMIDI · Gamepad API",
    chromeSince: "Chrome 89+",
    useInToonStudio: bi("TourBox·Loupedeck·MIDI 노브·조이콘 왼손 단축 다이얼 직접 연결", "Connects dial pads, MIDI knobs & handheld controllers directly from web"),
    fallbackStrategy: bi("표준 키보드 단축키·PointerEvent·터치 제스처로 100% 동일 조작 보장", "Full parity via standard keyboard shortcuts, PointerEvent & touch gestures"),
  },
];

export function probeBrowserNextGenWebApis(env?: BrowserProbeEnv): NextGenWebApiProbeReport {
  const win = env?.windowObj ?? (typeof window !== "undefined" ? (window as unknown as BrowserProbeEnv["windowObj"]) : undefined);
  const doc = env?.documentObj ?? (typeof document !== "undefined" ? (document as unknown as BrowserProbeEnv["documentObj"]) : undefined);
  const nav = env?.navigatorObj ?? (typeof navigator !== "undefined" ? (navigator as unknown as BrowserProbeEnv["navigatorObj"]) : undefined);

  const cssSupports =
    env?.cssSupports
    ?? ((property: string, value?: string): boolean => {
      if (typeof CSS === "undefined" || typeof CSS.supports !== "function") return false;
      try {
        return value === undefined ? CSS.supports(property) : CSS.supports(property, value);
      } catch {
        return false;
      }
    });

  const scriptSupports =
    env?.scriptSupports
    ?? ((type: string): boolean => {
      if (typeof HTMLScriptElement === "undefined") return false;
      const supportsFn = (HTMLScriptElement as unknown as { supports?: (candidate: string) => boolean }).supports;
      if (typeof supportsFn !== "function") return false;
      try {
        return supportsFn.call(HTMLScriptElement, type);
      } catch {
        return false;
      }
    });

  const popoverSupported =
    env?.popoverSupported
    ?? (typeof HTMLElement !== "undefined" && "popover" in HTMLElement.prototype);

  const supportMap: Record<ChromeNextGenApiSpec["id"], { supported: boolean; detail: string }> = {
    "view-transitions": {
      supported: typeof doc?.startViewTransition === "function",
      detail: typeof doc?.startViewTransition === "function" ? "document.startViewTransition()" : "Sync DOM fallback",
    },
    "speculation-rules": {
      supported: scriptSupports("speculationrules"),
      detail: scriptSupports("speculationrules") ? "script[type=speculationrules]" : "SPA lazy route fallback",
    },
    "scroll-driven": {
      supported: cssSupports("animation-timeline", "view()"),
      detail: cssSupports("animation-timeline", "view()") ? "animation-timeline: view()" : "Instant static visibility",
    },
    "anchor-popover": {
      supported: cssSupports("anchor-name", "--ts-anchor") && popoverSupported,
      detail:
        cssSupports("anchor-name", "--ts-anchor") && popoverSupported
          ? "anchor-name + Top-Layer popover"
          : popoverSupported
            ? "Popover only (positioned fallback)"
            : "Positioned overlay fallback",
    },
    webgpu: {
      supported: Boolean(nav?.gpu),
      detail: nav?.gpu ? "navigator.gpu active" : "WebGL2 / CPU fallback",
    },
    opfs: {
      supported: typeof nav?.storage?.getDirectory === "function",
      detail: typeof nav?.storage?.getDirectory === "function" ? "navigator.storage.getDirectory()" : "Explicit export fallback",
    },
    eyedropper: {
      supported: typeof win?.EyeDropper === "function",
      detail: typeof win?.EyeDropper === "function" ? "window.EyeDropper()" : "Canvas sampler fallback",
    },
    "hardware-io": {
      supported: Boolean(nav?.hid || nav?.requestMIDIAccess || nav?.getGamepads),
      detail: [
        nav?.hid ? "WebHID" : null,
        nav?.requestMIDIAccess ? "WebMIDI" : null,
        nav?.getGamepads ? "Gamepad" : null,
      ]
        .filter(Boolean)
        .join(" · ") || "Keyboard & PointerEvent fallback",
    },
  };

  const items: NextGenApiProbeItem[] = NEXTGEN_CHROME_API_SPECS.map((spec) => ({
    ...spec,
    supported: supportMap[spec.id].supported,
    detail: supportMap[spec.id].detail,
  }));

  const supportedCount = items.filter((item) => item.supported).length;
  const totalCount = items.length;
  const readinessTier: NextGenWebApiProbeReport["readinessTier"] =
    supportedCount >= 6 ? "nextgen-ready" : supportedCount >= 3 ? "progressive" : "baseline";

  const matchMediaSafe = (query: string): boolean => {
    try {
      return Boolean(win?.matchMedia?.(query).matches);
    } catch {
      return false;
    }
  };

  const hardware: BrowserHardwareSnapshot = {
    cores: typeof nav?.hardwareConcurrency === "number" ? nav.hardwareConcurrency : null,
    maxTouchPoints: typeof nav?.maxTouchPoints === "number" ? nav.maxTouchPoints : 0,
    prefersReducedMotion: matchMediaSafe("(prefers-reduced-motion: reduce)"),
    forcedColors: matchMediaSafe("(forced-colors: active)"),
    computePressure: typeof win?.PressureObserver === "function",
    viewportSegments:
      Array.isArray(win?.viewport?.segments) || cssSupports("(horizontal-viewport-segments: 2)"),
    webXr: Boolean(nav?.xr),
    webAudio: typeof win?.AudioContext === "function" || typeof win?.webkitAudioContext === "function",
  };

  return {
    items,
    supportedCount,
    totalCount,
    readinessTier,
    hardware,
  };
}
