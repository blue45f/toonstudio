/**
 * 범용 9-LLM CLI · MCP · REST API 가이드 + CS/그래픽스 논문 근거 + 전 페이지 UI/UX 동선 블루프린트 데이터.
 *
 * `scripts/toonstudio-llm-mcp-cli.mjs` 및 실제 저장소 모듈 경로와 1:1 정합을 유지하며,
 * 현재 구현(`current`)과 점진 R&D(`expanding`)를 엄격히 분리한다.
 */

import type { BilingualText } from "./competitor-benchmark-data";

export interface UniversalLlmClientProfile {
  readonly id:
    | "gemini-cli"
    | "claude-code"
    | "codex-cli"
    | "meta-llama"
    | "mistral-muse"
    | "cursor"
    | "windsurf"
    | "openrouter-bridge"
    | "ollama-local";
  readonly vendor: string;
  readonly protocol: "mcp-stdio-jsonrpc-2.0" | "mcp-streamable-http" | "openai-compatible-cli" | "openai-compatible-local";
  readonly configPath: string;
  readonly freeTierBadge: BilingualText;
  readonly summary: BilingualText;
}

export interface ShowcaseMcpApiEndpoint {
  readonly name: string;
  readonly category: "canvas" | "pm-ops" | "assets" | "3d-vrm" | "video" | "delivery" | "performance";
  readonly readOnly: boolean;
  readonly restMirror: string;
  readonly summary: BilingualText;
  readonly sampleRequestJson: string;
  readonly sampleDryRunJson: string;
}

export interface ResearchPaperArchitectureCard {
  readonly id: string;
  readonly citation: string;
  readonly year: number;
  readonly domain: "spectral" | "local-first" | "crdt" | "gpu-perf" | "input-math";
  readonly status: "current" | "expanding";
  readonly title: BilingualText;
  readonly takeaway: BilingualText;
  readonly repoModules: readonly string[];
}

export interface SitewideUxMotionAxis {
  readonly id: string;
  readonly area: BilingualText;
  readonly currentState: BilingualText;
  readonly upgradeDirection: BilingualText;
  readonly status: "current" | "expanding";
  readonly repoAnchor: string;
}

const bi = (ko: string, en: string): BilingualText => ({ ko, en });

export const UNIVERSAL_LLM_CLIENTS: readonly UniversalLlmClientProfile[] = [
  {
    id: "gemini-cli",
    vendor: "Google Gemini CLI / Antigravity",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.gemini/settings.json",
    freeTierBadge: bi("1순위 무료 티어", "Priority 1 Free Tier"),
    summary: bi(
      "Gemini 무료 최상위 티어 우선 연결 및 표준 JSON-RPC 2.0 stdio MCP 도구 호출",
      "Priority free-tier Gemini binding over standard JSON-RPC 2.0 stdio MCP.",
    ),
  },
  {
    id: "claude-code",
    vendor: "Anthropic Claude Code / Desktop",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.claude.json",
    freeTierBadge: bi("표준 MCP 직결", "Native MCP Stdio"),
    summary: bi(
      "Claude Code와 Claude Desktop에서 컷·레이어 조회, 8단계 공정 핸드오프, 권리 BOM QC 실행",
      "Connects Claude Code & Desktop directly to canvas inspection, handoff gates and Rights BOM QC.",
    ),
  },
  {
    id: "codex-cli",
    vendor: "OpenAI Codex CLI / GPT",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.codex/config.toml",
    freeTierBadge: bi("Codex · GPT 브리지", "Codex & GPT Bridge"),
    summary: bi(
      "OpenAI Codex CLI 및 GPT 함수 호출 파이프라인과 10종 ToonStudio MCP 도구 연결",
      "Bridges OpenAI Codex CLI and GPT tool calling to all 10 ToonStudio MCP operations.",
    ),
  },
  {
    id: "meta-llama",
    vendor: "Meta Llama (Llama Stack)",
    protocol: "mcp-streamable-http",
    configPath: "~/.llama/mcp-servers.json",
    freeTierBadge: bi("오픈웨이트 HTTP", "Open-Weight HTTP"),
    summary: bi(
      "사내·로컬 Llama Stack 에이전트를 Streamable HTTP MCP 엔드포인트로 연결",
      "Connects self-hosted or studio-local Llama Stack agents via Streamable HTTP MCP.",
    ),
  },
  {
    id: "mistral-muse",
    vendor: "Mistral / Muse Creative",
    protocol: "mcp-streamable-http",
    configPath: "~/.config/muse-mcp/servers.json",
    freeTierBadge: bi("크리에이티브 HTTP", "Creative HTTP"),
    summary: bi(
      "Mistral API 및 Muse 계열 크리에이티브 어시스턴트와 대본·말풍선·SFX 워크플로 연동",
      "Links Mistral and Muse creative assistants to script, balloon and SFX workflows.",
    ),
  },
  {
    id: "cursor",
    vendor: "Cursor IDE",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: ".cursor/mcp.json",
    freeTierBadge: bi("워크스페이스 단위", "Workspace Scoped"),
    summary: bi(
      "저장소 루트 `.cursor/mcp.json`으로 팀원 전원에게 동일한 스튜디오 CLI/MCP 도구 배포",
      "Distributes identical Studio CLI/MCP tools per repository via `.cursor/mcp.json`.",
    ),
  },
  {
    id: "windsurf",
    vendor: "Windsurf IDE",
    protocol: "mcp-stdio-jsonrpc-2.0",
    configPath: "~/.codeium/windsurf/mcp_config.json",
    freeTierBadge: bi("Cascade 연동", "Cascade Ready"),
    summary: bi(
      "Windsurf Cascade에서 VRM 매니폴드 진단·Remotion 렌더 계획·정산 dry-run 자동 실행",
      "Runs VRM manifold audits, Remotion render plans and settlement dry-runs from Cascade.",
    ),
  },
  {
    id: "openrouter-bridge",
    vendor: "OpenRouter Multi-Model",
    protocol: "openai-compatible-cli",
    configPath: "~/.toonstudio/openrouter-cli.json",
    freeTierBadge: bi("2순위 무료 폴백", "Priority 2 Free Fallback"),
    summary: bi(
      "무료 고성능 모델 자동 워터폴 라우팅 및 토큰 소진 시 BYOK 키 등록 안내",
      "Automatic free high-quality waterfall with graceful BYOK prompt on quota exhaustion.",
    ),
  },
  {
    id: "ollama-local",
    vendor: "Local Ollama (₩0 Offline)",
    protocol: "openai-compatible-local",
    configPath: "~/.toonstudio/ollama-local.json",
    freeTierBadge: bi("₩0 완전 오프라인", "KRW 0 Offline"),
    summary: bi(
      "인터넷 단절 환경이나 민감 원고에서 외부 전송 0바이트로 동작하는 로컬 추론 폴백",
      "Zero-egress local inference fallback for air-gapped rooms and confidential manuscripts.",
    ),
  },
];

export const SHOWCASE_MCP_API_ENDPOINTS: readonly ShowcaseMcpApiEndpoint[] = [
  {
    name: "studio_canvas_inspect",
    category: "canvas",
    readOnly: true,
    restMirror: "GET /api/studio/v1/cuts/{cutId}/inspect",
    summary: bi(
      "현재 컷의 레이어 트리, `@캐릭터` 바이블 참조, 권리 BOM 라이선스 상태를 읽기 전용으로 조회",
      "Read-only inspection of the active cut layer tree, `@character` bible refs and Rights BOM.",
    ),
    sampleRequestJson: `{ "tool": "studio_canvas_inspect", "args": { "cutId": "ep12-cut04", "includeRightsBom": true } }`,
    sampleDryRunJson: `{ "cutId": "ep12-cut04", "layers": 14, "canonLocked": ["@seoyeon", "@jinho"], "rightsBomStatus": "commercial-safe" }`,
  },
  {
    name: "studio_canvas_apply_action",
    category: "canvas",
    readOnly: false,
    restMirror: "POST /api/studio/v1/cuts/{cutId}/actions?dryRun=true",
    summary: bi(
      "말풍선 배치, 팔레트 적용, 3D 카메라 앵글 전환, 수정 핀 등록을 dry-run 검증 후 실행",
      "Applies balloon placement, palette updates, 3D camera angles or review pins with dry-run validation.",
    ),
    sampleRequestJson: `{ "tool": "studio_canvas_apply_action", "args": { "cutId": "ep12-cut04", "action": "add-review-pin", "dryRun": true } }`,
    sampleDryRunJson: `{ "applied": false, "dryRun": true, "predictedDiff": { "pinsAdded": 1, "undoCheckpoint": "opfs-wal-882" } }`,
  },
  {
    name: "studio_pm_conveyor_status",
    category: "pm-ops",
    readOnly: true,
    restMirror: "GET /api/studio/v1/series/{seriesId}/conveyor",
    summary: bi(
      "3~4화차 동시 로테이션 컨베이어의 병목 공정과 도미노 지연 위험을 즉시 계산",
      "Computes 3-4 episode parallel conveyor bottlenecks and domino deadline risk.",
    ),
    sampleRequestJson: `{ "tool": "studio_pm_conveyor_status", "args": { "seriesId": "starlight-academy" } }`,
    sampleDryRunJson: `{ "activeEpisodes": [12, 13, 14, 15], "bottleneckStage": "bg3d-lighting", "dominoRiskHours": 6.5 }`,
  },
  {
    name: "studio_pm_handoff_cut",
    category: "pm-ops",
    readOnly: false,
    restMirror: "POST /api/studio/v1/cuts/{cutId}/handoff",
    summary: bi(
      "8단계 공정 바통 터치 게이트를 검증하고 이전 단계 읽기 전용 잠금을 안전 전환",
      "Validates 8-stage baton-touch gates and locks completed upstream layers read-only.",
    ),
    sampleRequestJson: `{ "tool": "studio_pm_handoff_cut", "args": { "cutId": "ep12-cut04", "from": "lineart", "to": "flat-color", "dryRun": true } }`,
    sampleDryRunJson: `{ "gatePassed": true, "lockedUpstreamRole": "lineart", "nextAssigneeRole": "flat-color" }`,
  },
  {
    name: "studio_settlement_preview",
    category: "pm-ops",
    readOnly: true,
    restMirror: "POST /api/studio/v1/settlement/preview",
    summary: bi(
      "컷 난이도 가중치와 3.3% 원천징수·10% 사업자 세금계산서 정산서를 dry-run 산출",
      "Generates difficulty-weighted cut settlement previews for 3.3% freelancer or 10% VAT tax invoices.",
    ),
    sampleRequestJson: `{ "tool": "studio_settlement_preview", "args": { "episodeId": "ep12", "taxProfile": "freelancer-3.3" } }`,
    sampleDryRunJson: `{ "cuts": 68, "weightedUnits": 84.5, "withholdingRate": 0.033, "dryRun": true }`,
  },
  {
    name: "studio_asset_smart_search",
    category: "assets",
    readOnly: true,
    restMirror: "POST /api/studio/v1/assets/smart-search",
    summary: bi(
      "자연어·3획 실루엣·색상 무드·카메라 앵글·Rights BOM 상업 안전 조건 5축 통합 검색",
      "5-axis search across natural language, 3-stroke silhouette, palette mood, camera angle and Rights BOM safety.",
    ),
    sampleRequestJson: `{ "tool": "studio_asset_smart_search", "args": { "query": "rainy rooftop railing low-angle", "commercialSafeOnly": true } }`,
    sampleDryRunJson: `{ "hits": 12, "allCommercialSafe": true, "topMatch": "bg3d-rooftop-rain-lowangle.glb" }`,
  },
  {
    name: "studio_vrm_autofit_audit",
    category: "3d-vrm",
    readOnly: true,
    restMirror: "POST /api/studio/v1/vrm/autofit-audit",
    summary: bi(
      "42-소켓 본 자동 밀착, 1.5~3mm Anti-Clip 오프셋, 매니폴드 0결함 위상을 사전 검증",
      "Audits 42-socket bone binding, 1.5-3mm anti-clip offset and 0-defect manifold topology.",
    ),
    sampleRequestJson: `{ "tool": "studio_vrm_autofit_audit", "args": { "asset": "cloak-winter.glb", "socket": "upperChest" } }`,
    sampleDryRunJson: `{ "nonManifoldEdges": 0, "antiClipOffsetMm": 2.1, "layersReady": ["lineart", "shading", "mask"] }`,
  },
  {
    name: "studio_remotion_render_plan",
    category: "video",
    readOnly: true,
    restMirror: "POST /api/studio/v1/remotion/render-plan",
    summary: bi(
      "완성 화차에서 16:9·9:16·1:1 결정론적 Remotion 숏폼 트레일러 컴포지션 계획 생성",
      "Builds deterministic 16:9, 9:16 and 1:1 Remotion trailer plans from completed webtoon cuts.",
    ),
    sampleRequestJson: `{ "tool": "studio_remotion_render_plan", "args": { "episodeId": "ep12", "aspect": "9:16", "seconds": 30 } }`,
    sampleDryRunJson: `{ "fps": 30, "frames": 900, "cutsSelected": 12, "audioDuckingEnabled": true }`,
  },
  {
    name: "studio_export_platform_qc",
    category: "delivery",
    readOnly: true,
    restMirror: "POST /api/studio/v1/export/platform-qc",
    summary: bi(
      "네이버·카카오·글로벌 연재 규격, Rights BOM, 스텔스 포렌식 워터마크 출고 전 일괄 검사",
      "Pre-submission QC covering Naver/Kakao/Global slice specs, Rights BOM and stealth forensic watermarks.",
    ),
    sampleRequestJson: `{ "tool": "studio_export_platform_qc", "args": { "episodeId": "ep12", "platforms": ["naver", "kakao", "global"] } }`,
    sampleDryRunJson: `{ "widthPx": 1600, "rightsViolations": 0, "forensicWatermark": "ready", "passed": true }`,
  },
  {
    name: "studio_stroke_endurance_bench",
    category: "performance",
    readOnly: true,
    restMirror: "CLI: node scripts/toonstudio-llm-mcp-cli.mjs --bench-stroke --strokes 10000",
    summary: bi(
      "10,000획 장시간 드로잉 고정 링버퍼·256px Dirty-Tile LRU·OPFS Undo 스필 메모리 평탄화 실측",
      "Measures 10,000-stroke fixed ring-buffer, 256px Dirty-Tile LRU and OPFS Undo spill memory plateau.",
    ),
    sampleRequestJson: `{ "tool": "studio_stroke_endurance_bench", "args": { "strokes": 10000, "pointsPerStroke": 32 } }`,
    sampleDryRunJson: `{ "p95Ms": 0.005, "residentTileCount": 128, "inMemoryUndoDepth": 20, "spilledUndoToOpfs": 9980, "passed": true }`,
  },
];

export const SHOWCASE_MCP_RESOURCES: readonly {
  readonly uri: string;
  readonly purpose: BilingualText;
}[] = [
  {
    uri: "toon://series/{seriesId}/canon-bible",
    purpose: bi("작품 세계관·`@캐릭터` 시트·고정 팔레트·연출 금지 규칙 정본", "Canonical series bible, `@character` sheets and locked palettes"),
  },
  {
    uri: "toon://episode/{episodeId}/conveyor-status",
    purpose: bi("3~4화차 동시 공정 진행률·담당자 배정·도미노 지연 경보", "Multi-episode conveyor progress, role assignees and domino alerts"),
  },
  {
    uri: "toon://episode/{episodeId}/rights-bom",
    purpose: bi("사용 폰트·3D 배경·브러시·오디오 라이선스 출고 증빙 원장", "Export-ready license ledger for fonts, 3D assets, brushes and audio"),
  },
  {
    uri: "toon://cut/{cutId}/layers",
    purpose: bi("컷 단위 벡터·래스터·3D·말풍선 레이어 트리와 잠금 상태", "Cut-level vector, raster, 3D and balloon layer tree with lock states"),
  },
  {
    uri: "toon://studio/capabilities/nextgen-web",
    purpose: bi("WebGPU·OPFS·Wasm64·WebHID·차세대 크롬 API 런타임 진단 스냅샷", "Runtime probe snapshot for WebGPU, OPFS, Wasm64, WebHID and Chrome APIs"),
  },
];

export const RESEARCH_PAPERS_ARCHITECTURE: readonly ResearchPaperArchitectureCard[] = [
  {
    id: "kubelka-munk-1931",
    citation: "Kubelka, P. & Munk, F. (1931) · Zeitschrift für Technische Physik",
    year: 1931,
    domain: "spectral",
    status: "current",
    title: bi("7밴드 감산 분광 혼색 (Kubelka-Munk 이론)", "7-Band Subtractive Spectral Mixing (Kubelka-Munk)"),
    takeaway: bi(
      "제3자 비상업 LUT 없이 420~670nm 7파장 기저와 유리화 역공식을 WGSL vec4 SIMD 2레지스터로 직접 구현해 파랑+노랑이 맑은 녹색으로 섞입니다.",
      "Clean-room 420-670nm 7-band basis and rationalized inverse formula in 2-register WGSL SIMD so blue + yellow mixes cleanly into vivid green.",
    ),
    repoModules: [
      "apps/web/src/domains/creator/render/studio-webgpu-km7-spectral-core.ts",
      "apps/web/src/domains/creator/render/studio-webgpu-km7-compute-wgsl.ts",
    ],
  },
  {
    id: "ink-switch-local-first-2019",
    citation: "Kleppmann, M. et al. · Ink & Switch (Onward! 2019)",
    year: 2019,
    domain: "local-first",
    status: "current",
    title: bi("로컬-퍼스트 소프트웨어 (Local-First Software)", "Local-First Software Architecture"),
    takeaway: bi(
      "서버가 아니라 기기 OPFS 위 SQLite WASM을 1차 권위로 두어 오프라인 0ms 자동 저장, 비정상 종료 WAL 복구, 월 ₩0 단위경제를 동시 달성합니다.",
      "Places SQLite WASM over OPFS as primary write authority for 0ms local saves, WAL self-healing and zero cloud storage lock-in.",
    ),
    repoModules: [
      "apps/web/src/domains/creator/studio-opfs-filesystem.ts",
      "apps/web/src/domains/creator/runtime-resilience/sqlite-opfs-wal-scrubber.ts",
    ],
  },
  {
    id: "yata-yjs-2016",
    citation: "Nicolaescu, P. et al. (GROUP 2016) · YATA CRDT Algorithm",
    year: 2016,
    domain: "crdt",
    status: "current",
    title: bi("충돌 없는 실시간 분산 병합 (YATA / Yjs CRDT)", "Conflict-Free Shared Editing (YATA / Yjs CRDT)"),
    takeaway: bi(
      "작가·어시스턴트·PD가 오프라인과 온라인을 오가며 동시 편집해도 잠금 없이 결정론적으로 수렴하며, 장기 세션 컴팩션 테스트로 메모리 팽창을 막습니다.",
      "Deterministic lock-free convergence across offline and live collaborators backed by automated long-session compaction tests.",
    ),
    repoModules: [
      "packages/contracts/src/studio-crdt-authoring.ts",
      "apps/web/src/domains/creator/live/studio-crdt-compaction.test.ts",
    ],
  },
  {
    id: "centripetal-catmull-rom-2011",
    citation: "Yuksel, C., Schaefer, S. & Keyser, J. (CAD 2011)",
    year: 2011,
    domain: "input-math",
    status: "current",
    title: bi("구심 Catmull-Rom 곡선 기반 120~240Hz 스타일러스 예측", "Centripetal Catmull-Rom 120-240Hz Stylus Prediction"),
    takeaway: bi(
      "α=0.5 구심 매개변수화로 고속 펜 획의 고리(cusp)·오버슈트를 없애고, `predicted-preview` 권위를 확정 획과 분리해 체감 지연을 1프레임 앞당깁니다.",
      "Eliminates cusps and overshoot with α=0.5 parameterization while isolating predicted preview strokes from committed ink.",
    ),
    repoModules: [
      "apps/web/src/domains/creator/render/gpu-next/gpu-stylus-subpixel-predictor.ts",
    ],
  },
  {
    id: "neural-texture-compression-2023",
    citation: "Vaidyanathan, K. et al. · NVIDIA Research (SIGGRAPH 2023)",
    year: 2023,
    domain: "gpu-perf",
    status: "expanding",
    title: bi("랜덤 액세스 뉴럴 텍스처 압축(NTC) & WebGPU 타일 LRU", "Random-Access Neural Texture Compression & WebGPU Tile LRU"),
    takeaway: bi(
      "현재 256px Dirty-Tile 128 MiB LRU 캐시와 뷰포트 컬링을 실가동 중이며, 차기 트랙으로 8K PBR·배경 텍스처의 WebGPU 뉴럴 디코드 R&D를 연계합니다.",
      "Active 256px 128 MiB Dirty-Tile LRU & viewport culling today, paving the roadmap toward WebGPU random-access neural texture decoding.",
    ),
    repoModules: [
      "apps/web/src/domains/creator/render/studio-webgpu-tile-runtime.ts",
      "apps/web/src/domains/creator/render/studio-webgpu-tile-viewport-culling.ts",
    ],
  },
  {
    id: "wasm64-compute-pressure-2025",
    citation: "W3C WebAssembly Memory64 & Compute Pressure API Specs (2024–2026)",
    year: 2025,
    domain: "gpu-perf",
    status: "current",
    title: bi("Wasm64 4 GiB+ 선형 주소 공간 & 열 압력 동적 LOD", "Wasm64 Linear Memory & Thermal Compute Pressure LOD"),
    takeaway: bi(
      "32비트 WASM 한계를 넘는 8K 아레나·1 GiB 로컬 3D 임포트 거버너와 CPU 열 압력 4단계(`nominal→critical`) 자동 프레임 양보를 통합했습니다.",
      "Unlocks 8K arenas and 1 GiB local 3D imports beyond 32-bit WASM limits paired with 4-tier thermal LOD scaling.",
    ),
    repoModules: [
      "apps/web/src/domains/creator/nextgen-perf-engine/",
      "apps/web/src/domains/creator/studio-wasm64-memory-governor.ts",
    ],
  },
  {
    id: "ring-buffer-opfs-spill-2026",
    citation: "ToonStudio Internal Endurance Spec · Zero-Allocation Ring & OPFS Spill",
    year: 2026,
    domain: "gpu-perf",
    status: "current",
    title: bi("장시간 10,000획 GC 제로 링버퍼 & OPFS Undo 스필", "10,000-Stroke Zero-Alloc Ring Buffer & OPFS Undo Spill"),
    takeaway: bi(
      "고정 Float32Array 링버퍼, 128타일 LRU 상한, 메모리 Undo 20단계 초과분 OPFS 스필로 장시간 드로잉에서도 프레임과 힙을 평탄하게 유지합니다.",
      "Combines a fixed Float32Array ring buffer, 128-tile LRU cap and 20-step OPFS Undo spill to keep long sessions flat in memory.",
    ),
    repoModules: [
      "scripts/toonstudio-llm-mcp-cli.mjs",
      "apps/web/src/domains/creator/studio-freehand-input-binary-spool-opfs-store.ts",
    ],
  },
];

export const SITEWIDE_UX_MOTION_AXES: readonly SitewideUxMotionAxis[] = [
  {
    id: "gnb-ink-ribbon",
    area: bi("① 전역 GNB · 44px 컨텍스트 리본", "1. Global GNB & 44px Context Ribbon"),
    currentState: bi(
      "잉크 밑줄 인디케이터, `⌘K` 한국어 초성 검색, 단일 `/create` 시작 CTA 및 모바일 하단 탭(1180px 경계) 운영",
      "Active ink underline indicator, `⌘K` command search, single `/create` CTA and 1180px mobile bottom tabs.",
    ),
    upgradeDirection: bi(
      "비교(`/compare/studio`)·기술(`/tech`) 직행 링크와 Speculation Rules moderate 프리페치 결합으로 1~2클릭 도착 단축",
      "Direct `/compare/studio` & `/tech` access paired with moderate Speculation Rules prefetch for 1-2 click arrival.",
    ),
    status: "current",
    repoAnchor: "apps/web/src/shared/components/site-header.tsx",
  },
  {
    id: "lnb-journey-bar",
    area: bi("② LNB 작업공간 레일 · 5단계 여정 바", "2. Workspace LNB Rail & 5-Stage Journey Bar"),
    currentState: bi(
      "96px 아이콘 레일 / 216px 행 레일, 5단계 창작 여정 바(`PageRoleAndJourneyNavigator`), `⌘⇧K` 전역 소재 팔레트 연결",
      "96px icon / 216px row rail, 5-stage creation journey bar and `⌘⇧K` global asset palette.",
    ),
    upgradeDirection: bi(
      "12종 한국 웹툰 직무 필터와 최근 작업 컷 점프 칩으로 기획→콘티→드로잉→출고 간 문맥 손실 제로화",
      "12-role studio presets and active-cut jump chips eliminate context switching from script to export.",
    ),
    status: "current",
    repoAnchor: "apps/web/src/shared/components/workspace/WorkspaceTaskFrame.tsx",
  },
  {
    id: "canvas-chrome-space",
    area: bi("③ 드로잉 캔버스 공간 · 캡슐 크롬", "3. Drawing Canvas Space & Capsule Chrome"),
    currentState: bi(
      "캔버스 ≥82% 확보, 44종 주얼 아틀리에 컬러 스프라이트, Z-레이어 0px² HUD 비겹침, 초소형 캡슐형 오프라인 배지",
      "≥82% canvas budget, 44 Jewel Atelier color sprites, 0px² HUD overlap and compact capsule offline badge.",
    ),
    upgradeDirection: bi(
      "갤러리 매트 프레임 고도화와 720ms 스페큘러 쉬머(모션 축소 존중)로 도구 선택 즉각 피드백 강화",
      "Gallery mat frame elevation and 720ms specular sheen (reduced-motion safe) sharpen active tool feedback.",
    ),
    status: "current",
    repoAnchor: "apps/web/src/domains/creator/offline/StudioOfflinePanel.tsx",
  },
  {
    id: "footer-wayfinder",
    area: bi("④ 공통 푸터 · 다음 여정 웨이파인더", "4. Unified Footer & Onward Wayfinder"),
    currentState: bi(
      "접이식 서비스 디렉터리, 정책 상시 노출, OST·플로팅 도크 안전 여백 자동 계산, 44px 터치 타깃 통일",
      "Collapsible directory, always-visible policies, automatic OST/dock clearance and unified 44px touch targets.",
    ),
    upgradeDirection: bi(
      "푸터 메타 레일에 `/compare/studio`와 `/tech` 정본 진입점을 추가해 모든 공개 페이지 하단에서 기술·비교 허브 즉시 연결",
      "Adds canonical `/compare/studio` and `/tech` links in the footer meta rail across every public route.",
    ),
    status: "current",
    repoAnchor: "apps/web/src/shared/components/site-footer.tsx",
  },
  {
    id: "tone-visual-identity",
    area: bi("⑤ 전 페이지 톤앤매너 · 44종 스프라이트 통일", "5. Sitewide Tone & 44-Sprite Visual Identity"),
    currentState: bi(
      "OKLCH 시맨틱 토큰(엄격 린트 원시색 0건), 9종 테마(고대비 포함), 8대 핵심 허브 아이소메트릭 디오라마 배너",
      "Zero-raw-color OKLCH tokens across 9 themes including high contrast, plus isometric banners on 8 core hubs.",
    ),
    upgradeDirection: bi(
      "`word-break: keep-all`·`tabular-nums`·동심원 라운드(`outer = inner + pad`) 규칙을 신규 비교·기술·에디터 패널 전면 통일",
      "Enforces `keep-all`, `tabular-nums` and concentric radii consistently across benchmark, tech and studio chrome.",
    ),
    status: "current",
    repoAnchor: "apps/web/src/shared/ui/vibrant-identity/VibrantPageIdentityBanner.tsx",
  },
  {
    id: "route-transition-choreography",
    area: bi("⑥ 페이지 이동 전환 연출 · GPU 컴포지터 모션", "6. Route Transition Choreography & GPU Motion"),
    currentState: bi(
      "Web Animations API 본문 전환(`RouteEnterMotion`), `@starting-style` 다이얼로그/팝오버, View Transitions & Scroll-Driven CSS",
      "WAAPI content transitions, `@starting-style` dialogs/popovers, View Transitions and Scroll-Driven CSS.",
    ),
    upgradeDirection: bi(
      "경로 이동 시 상단 2px 잉크 도착 헤어라인과 미세 깊이 스케일(0.996→1) 적용, 고대비·모션축소 시 즉시 비활성화",
      "Adds a 2px GPU-composited top ink arrival hairline and subtle depth scale, auto-disabled on reduced motion or high contrast.",
    ),
    status: "current",
    repoAnchor: "apps/web/src/app/RouteEnterMotion.tsx",
  },
];

export function buildShowcaseClientMcpConfig(clientId: UniversalLlmClientProfile["id"]): string {
  const client = UNIVERSAL_LLM_CLIENTS.find((entry) => entry.id === clientId) ?? UNIVERSAL_LLM_CLIENTS[0]!;
  const serverEntry =
    client.protocol === "mcp-stdio-jsonrpc-2.0"
      ? {
          command: "node",
          args: ["scripts/toonstudio-llm-mcp-cli.mjs", "--mcp-manifest"],
          env: {
            TOONSTUDIO_MCP_DRY_RUN: "1",
            TOONSTUDIO_LLM_TARGET: client.id,
          },
        }
      : {
          transport: client.protocol,
          endpoint: "http://127.0.0.1:4319/mcp",
          dryRunDefault: true,
          llmTarget: client.id,
        };

  return JSON.stringify(
    {
      configFile: client.configPath,
      mcpServers: {
        toonstudio: serverEntry,
      },
    },
    null,
    2,
  );
}
