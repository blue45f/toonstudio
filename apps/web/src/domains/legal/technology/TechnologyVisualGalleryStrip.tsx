import { Film, Layers, ShieldCheck } from "lucide-react";
import { useId, useState } from "react";

import { cx } from "@/shared/lib/cx";
import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("TechnologyVisualGalleryStrip", ko, en);

export interface TechnologyVisualGalleryStripProps {
  readonly id?: string;
  readonly className?: string;
}

type GenrePlateId = "joseon" | "murim" | "noir" | "fantasy";

interface GenrePlateSpec {
  readonly id: GenrePlateId;
  readonly src: string;
  readonly genre: { readonly ko: string; readonly en: string };
  readonly title: { readonly ko: string; readonly en: string };
  readonly sceneNote: { readonly ko: string; readonly en: string };
  readonly pipelines: readonly {
    readonly name: { readonly ko: string; readonly en: string };
    readonly evidence: string;
  }[];
}

interface StackMatrixRow {
  readonly id: string;
  readonly liveFoundation: { readonly ko: string; readonly en: string };
  readonly liveScope: { readonly ko: string; readonly en: string };
  readonly wavesExtension: { readonly ko: string; readonly en: string };
  readonly extensionStatus: "experimental" | "live";
  readonly evidencePath: string;
}

const MEDALLIONS = [
  {
    id: "icon-rust-wasm64",
    src: "/assets/technology-showcase/icon-rust-wasm64.webp",
    title: { ko: "Rust WASM64 캔버스 커널", en: "Rust WASM64 Canvas Kernel" },
    role: { ko: "SIMD 타일 합성 · 무손실 원고 아카이브", en: "SIMD tile compositing & lossless archiving" },
    metric: "19.82× WASM",
  },
  {
    id: "icon-webgpu-3d",
    src: "/assets/technology-showcase/icon-webgpu-3d.webp",
    title: { ko: "WebGPU 3D · NPR 공간 엔진", en: "WebGPU 3D & NPR Spatial Engine" },
    role: { ko: "Split CSM 그림자 · 2.5D 실내·대기 산란", en: "Split CSM shadows, 2.5D interior & fog" },
    metric: "WebGPU",
  },
  {
    id: "icon-ondevice-ai",
    src: "/assets/technology-showcase/icon-ondevice-ai.webp",
    title: { ko: "온디바이스 시맨틱 AI 도우미", en: "On-Device Semantic AI Assistant" },
    role: { ko: "NF4 KV 페이저 · 자모 BM25F · 로어 린터", en: "NF4 KV pager, Jamo BM25F & lore linter" },
    metric: "로컬 색인",
  },
  {
    id: "icon-zero-trust-p2p",
    src: "/assets/technology-showcase/icon-zero-trust-p2p.webp",
    title: { ko: "제로트러스트 CRDT · P2P 협업", en: "Zero-Trust CRDT & P2P Co-Editing" },
    role: { ko: "Yjs · ECDH 종단 암호화 · WOTS+ 출고 봉인", en: "Yjs, ECDH E2EE & WOTS+ provenance seal" },
    metric: "3f+1 BFT",
  },
] as const;

const DOMAIN_BADGES = [
  { id: "rust-simd-badge", src: "/assets/technology-showcase/rust-simd-badge.svg", ko: "Rust WASM64 · SIMD 벡터", en: "Rust WASM64 · SIMD Vector" },
  { id: "webgpu-compute-badge", src: "/assets/technology-showcase/webgpu-compute-badge.svg", ko: "WebGPU 컴퓨트 · 3D NPR", en: "WebGPU Compute · 3D NPR" },
  { id: "sqlite-opfs-badge", src: "/assets/technology-showcase/sqlite-opfs-badge.svg", ko: "SQLite WASM · OPFS 정본", en: "SQLite WASM · OPFS Authority" },
  { id: "crdt-p2p-badge", src: "/assets/technology-showcase/crdt-p2p-badge.svg", ko: "Yjs CRDT · P2P 동시 편집", en: "Yjs CRDT · P2P Collaboration" },
  { id: "cmyk-print-badge", src: "/assets/technology-showcase/cmyk-print-badge.svg", ko: "CMYK TAC≤300% · 단행본 조판", en: "CMYK TAC≤300% · Print Prep" },
  { id: "wcag-a11y-badge", src: "/assets/technology-showcase/wcag-a11y-badge.svg", ko: "WCAG 2.2 AA · 44px 촉각 기준", en: "WCAG 2.2 AA · 44px Hit Target" },
] as const;

const GENRE_PLATES: readonly GenrePlateSpec[] = [
  {
    id: "joseon",
    src: "/assets/technology-showcase/plate-joseon-royal-moonlight-courtyard.webp",
    genre: { ko: "사극 월야 궁궐", en: "Joseon Moonlight Courtyard" },
    title: { ko: "근정전 회랑 달빛과 청사초롱 반사광", en: "Moonlit Royal Corridor & Lantern Bounce" },
    sceneNote: {
      ko: "2.5D 화면 공간 라디오시티로 청사초롱 난색 반사광을 돌리고, 꺾인 기둥·회랑 벽면에는 소실점 동차좌표 그림자와 G펜 예각 먹물 맺힘을 적용합니다.",
      en: "Applies 2.5D screen-space radiosity for warm lantern bounce alongside homogeneous bent-wall perspective shadows and G-pen ink-trap linework.",
    },
    pipelines: [
      { name: { ko: "2.5D 화면 공간 라디오시티 (2.5D Radiosity)", en: "2.5D Screen-Space Radiosity" }, evidence: "wasm64-wave16-mastery/radiosity-inktrap-catchlight.ts" },
      { name: { ko: "꺾인 벽 원근 그림자 (Bent-Wall Perspective Shadow)", en: "Bent-Wall Perspective Shadow" }, evidence: "wasm64-wave22-ultragap/perspective-shadow-opfs-scrubber.ts" },
      { name: { ko: "탄성 갈필 · 먹물 고임 (Split-Bristle Ink)", en: "Split-Bristle Sumi-e Ink" }, evidence: "wasm64-wave14-masterpiece/sss-skin-bristle-cinema-halation.ts" },
    ],
  },
  {
    id: "murim",
    src: "/assets/technology-showcase/plate-murim-misty-cliff-pavilion.webp",
    genre: { ko: "무협 운해 정자", en: "Murim Misty Cliff Pavilion" },
    title: { ko: "기암절벽 새벽 운무와 장풍 기류 연출", en: "Dawn Cliff Sea-of-Clouds & Curl-Wind Flow" },
    sceneNote: {
      ko: "깊이 버퍼 기반 Rayleigh-Mie 대기 산란 안개로 원경 절벽의 공기원근법을 계산하고, 무발산 컬-노이즈 바람장과 곡률 안전 리본 브러시로 도포 자락을 제어합니다.",
      en: "Computes depth-aware Rayleigh-Mie aerial fog across distant cliffs while driving robes and sashes with divergence-free curl-noise wind and ribbon brushes.",
    },
    pipelines: [
      { name: { ko: "Rayleigh-Mie 대기 산란 안개 (Aerial Fog)", en: "Rayleigh-Mie Aerial Fog" }, evidence: "wasm64-wave15-structural/kajiya-hair-aerial-progressive-codec.ts" },
      { name: { ko: "무발산 컬-노이즈 바람장 (∇·v = 0 Curl Wind)", en: "Divergence-Free Curl-Noise Wind" }, evidence: "wasm64-wave10-omega/thinlens-bokeh-curl-wind.ts" },
      { name: { ko: "곡률 안전 리본 브러시 (r·κ < 0.85)", en: "Curvature-Safe Ribbon Brush" }, evidence: "wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts" },
    ],
  },
  {
    id: "noir",
    src: "/assets/technology-showcase/plate-cyberpunk-industrial-noir-alley.webp",
    genre: { ko: "근미래 인더스트리얼 누아르", en: "Industrial Noir Alley" },
    title: { ko: "텅스텐 증기 골목과 아나모픽 보케 · HDR 게인맵", en: "Tungsten Steam Alley, CoC Bokeh & HDR Gain-Map" },
    sceneNote: {
      ko: "박막 렌즈 착란원(CoC) 공식으로 전경 번짐 없는 아나모픽 보케를 합성하고, 확산 백색 203 nits 고정 위에서 간판·증기 하이라이트만 SMPTE ST.2084 PQ HDR 게인맵으로 승격합니다.",
      en: "Synthesizes bleed-free thin-lens anamorphic CoC bokeh while promoting practical highlights via SMPTE ST.2084 PQ & ISO-21496-1 HDR gain-maps.",
    },
    pipelines: [
      { name: { ko: "박막 렌즈 아나모픽 보케 (Thin-Lens CoC Bokeh)", en: "Thin-Lens Anamorphic CoC Bokeh" }, evidence: "wasm64-wave10-omega/thinlens-bokeh-curl-wind.ts" },
      { name: { ko: "PQ · ISO-21496-1 HDR 게인맵 (HDR Gain-Map)", en: "SMPTE ST.2084 HDR Gain-Map" }, evidence: "wasm64-wave22-ultragap/hdr-pq-ribbon-brush-lookat.ts" },
      { name: { ko: "슐릭 프레넬 빗물 웅덩이 반사 (Puddle Fresnel)", en: "Schlick Fresnel Puddle Reflection" }, evidence: "wasm64-wave18-cinema-polish/puddle-reflection-impact-crowd.ts" },
    ],
  },
  {
    id: "fantasy",
    src: "/assets/technology-showcase/plate-fantasy-cathedral-library.webp",
    genre: { ko: "판타지 대서고", en: "Fantasy Cathedral Library" },
    title: { ko: "성당형 천창 조도장과 단행본 별색 박 분판", en: "Cathedral Skylight SH Irradiance & Foil Plates" },
    sceneNote: {
      ko: "32KiB 미만의 반정밀도 4D 구면 조화(SH) 프로브와 코시 파장 분산 프리즘으로 시간대별 채광을 바꾸고, 단행본 출고 시 CMYK TAC≤300% 및 ±0.1mm 금·은박 별색 판을 분리합니다.",
      en: "Relights time-of-day skylights via <32 KiB 4D SH probes and Cauchy prism dispersion, then separates CMYK TAC<=300% and ±0.1 mm gold/silver foil plates.",
    },
    pipelines: [
      { name: { ko: "<32KiB 4D 구면 조화 조도장 (4D SH Lightfield)", en: "<32 KiB 4D SH Lightfield Cache" }, evidence: "wasm64-wave5-frontier/acoustic-raymarch-irradiance.ts" },
      { name: { ko: "2-삼각형 실내 매핑 · 프리즘 분광", en: "2-Triangle Interior & Cauchy Prism" }, evidence: "wasm64-wave19-atelier-perfection/analog-manuscript-prism-interior.ts" },
      { name: { ko: "CMYK TAC≤300% · ±0.1mm 금/은박 분판", en: "CMYK Gamut & ±0.1 mm Foil Plates" }, evidence: "wasm64-wave21-horizon/wang-tile-assistant-sheet-spot-foil.ts" },
    ],
  },
];

const STACK_MATRIX_ROWS: readonly StackMatrixRow[] = [
  {
    id: "sqlite-opfs",
    liveFoundation: { ko: "SQLite WASM + OPFS 로컬 정본", en: "SQLite WASM + OPFS Local Authority" },
    liveScope: { ko: "오프라인 원고 DB · 로컬 파일 권위 유지", en: "Offline manuscript DB & local file authority" },
    wavesExtension: { ko: "Waves 5·6·10·11·22: 64KiB mmap 페이저 · FastCDC 델타 · GF(256) 복구 · .tsarc 10년 카트리지 · 유휴 2ms 머클 자가치유", en: "Waves 5·6·10·11·22: 64 KiB mmap pager, FastCDC delta, GF(256) Reed-Solomon, .tsarc cartridge & <=2 ms idle Merkle scrubber" },
    extensionStatus: "experimental",
    evidencePath: "apps/web/src/domains/creator/wasm64-wave22-ultragap/opfs-merkle-scrubber.ts",
  },
  {
    id: "yjs-crdt-p2p",
    liveFoundation: { ko: "Yjs CRDT + WebRTC P2P 협업", en: "Yjs CRDT + WebRTC P2P Collaboration" },
    liveScope: { ko: "실시간 동시 편집 · 시그널링 티켓 격리", en: "Live co-editing & room-ticket signaling" },
    wavesExtension: { ko: "Waves 5·7·8·9·20: ddmin 수렴 퍼저 · HLC 시공간 CRDT · 무묘비 RGA · ECDH 암호화 · M-of-N 다중서명 · 10,000 bps 정산 · WOTS+ 봉인", en: "Waves 5·7·8·9·20: ddmin CRDT fuzzer, HLC spacetime CRDT, tombstoneless RGA, ECDH E2EE, M-of-N co-sign, 10,000 bps split & WOTS+ seal" },
    extensionStatus: "experimental",
    evidencePath: "apps/web/src/domains/creator/wasm64-wave20-grand-finale/omnichannel-master-release-gate.ts",
  },
  {
    id: "opencascade-manifold",
    liveFoundation: { ko: "OpenCascade · Manifold 3D CAD", en: "OpenCascade · Manifold 3D CAD" },
    liveScope: { ko: "정밀 불리언 기하 · 수밀 솔리드 세트 검증", en: "Exact boolean CSG & watertight set validation" },
    wavesExtension: { ko: "Waves 5·7·19·20: RANSAC 1·2·3점 소실점 복원 · 2-삼각형 의사 3D 실내 외벽 · 수밀 2-다양체 3D 한글 효과음 메쉬 빌더", en: "Waves 5·7·19·20: RANSAC 1/2/3-pt perspective, 2-triangle pseudo-3D interior mapping & watertight 2-manifold 3D Korean SFX mesh" },
    extensionStatus: "experimental",
    evidencePath: "apps/web/src/domains/creator/wasm64-wave20-grand-finale/perspective-sfx-3d-mesh.ts",
  },
  {
    id: "three-vrm-dqs",
    liveFoundation: { ko: "Three.js · VRM 1.0 · 듀얼 쿼터니언 스키닝", en: "Three.js · VRM 1.0 · Dual-Quaternion Skinning" },
    liveScope: { ko: "웹 3D 무대 · 표준 휴머노이드 포즈·표정", en: "Web 3D stage & humanoid pose/expression rig" },
    wavesExtension: { ko: "Waves 7·9·10·13·17·20·22·23: 관절 한계 가드 · DQS 부피 보존 0.000% + RBF · 15-DOF 손 파지 IK · 안구-두부 협응 · 측지선 의복 래핑", en: "Waves 7·9·10·13·17·20·22·23: swing-twist guard, 0.000% volume-loss DQS+RBF, 15-DOF hand IK, oculo-cephalic gaze & geodesic wrap" },
    extensionStatus: "experimental",
    evidencePath: "apps/web/src/domains/creator/wasm64-wave13-continuum/dqs-psd-neural-skinning.ts",
  },
  {
    id: "mediapipe-onnx-ai",
    liveFoundation: { ko: "MediaPipe · ONNX · 9-풀 무비용 AI 라우터", en: "MediaPipe · ONNX · 9-Pool Zero-Cost AI Router" },
    liveScope: { ko: "동의·예산 기반 작업 계약 · BYOK · 로컬 추론", en: "Consent/budget work contracts, BYOK & local inference" },
    wavesExtension: { ko: "Waves 4·8·19·20·23: WebGPU NF4 KV 페이저 · 음성→52 VRM 표정 · O(N) 가이드 매트 · 한국어 조사 로어 린터 · 초성·자모 BM25F <1ms 검색", en: "Waves 4·8·19·20·23: WebGPU NF4 KV pager, voice-to-52 VRM, O(N) guided matte, Korean Josa lore linter & <1 ms Jamo BM25F search" },
    extensionStatus: "experimental",
    evidencePath: "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/korean-jamo-bm25f-manuscript-search.ts",
  },
  {
    id: "drizzle-pg-onpod",
    liveFoundation: { ko: "Drizzle · PostgreSQL 17 · 서울 onpod API", en: "Drizzle · PostgreSQL 17 · Seoul onpod API" },
    liveScope: { ko: "계정·결제·권리 원장 · expand/contract 마이그레이션", en: "Account/billing/rights ledger & expand/contract SQL" },
    wavesExtension: { ko: "Waves 7·8·16·18·21: B4/A4 톰보·책등 크리프 검수 · CoW 타일 스냅샷 · SHA-256 CAS 정합 · 60컷 OKLCH 컬러 스크립트 바코드", en: "Waves 7·8·16·18·21: B4/A4 crop-mark & spine creep preflight, CoW tile snapshots, SHA-256 CAS sync & 60-cut OKLCH color-script" },
    extensionStatus: "experimental",
    evidencePath: "apps/web/src/domains/creator/wasm64-wave23-autonomous-cadence/episode-oklch-color-script.ts",
  },
  {
    id: "cloudflare-edge-shield",
    liveFoundation: { ko: "Cloudflare Static · R2 · 4-레인 엣지 실드", en: "Cloudflare Static · R2 · 4-Lane Edge Shield" },
    liveScope: { ko: "정적 번들 불변 캐시 · 공개 읽기 캐시 실드", en: "Immutable static bundles & public-read cache shield" },
    wavesExtension: { ko: "운영 가동(Live): edge-api-lane-router.mjs 4-레인 분리(공개 읽기 · AI 보조 · 실시간 DO · 서울 코어) 및 인증·세션 요청 100% private/no-store 우회", en: "Live in edge router: 4-lane split (public-read, AI-assist, realtime-DO, core-onpod) with fail-closed private/no-store auth bypass" },
    extensionStatus: "live",
    evidencePath: "deploy/cloudflare-static/edge-api-lane-router.mjs",
  },
  {
    id: "playwright-axe-harness",
    liveFoundation: { ko: "Playwright · Axe WCAG 2.2 AA · 30.5K 샤드 하네스", en: "Playwright · Axe WCAG 2.2 AA · 30.5K Shard Harness" },
    liveScope: { ko: "자동 접근성 게이트 · 적응형 힙 샤드 타입체크", en: "Automated a11y gate & adaptive-heap shard typecheck" },
    wavesExtension: { ko: "Waves 6·11·12·21·24 + 모놀리스 감사: Girvan-Newman 경계 분해 · 9:16 숏폼 디렉터 · 마르코프 ≤2ms 프리페치 · Fitts 44px 방사형 HUD", en: "Waves 6·11·12·21·24 + monolith audit: Girvan-Newman decomposition, 9:16 shortform director, <=2 ms Markov prefetch & 44 px Fitts HUD" },
    extensionStatus: "experimental",
    evidencePath: "apps/web/src/domains/creator/wasm64-wave24-master-orchestrator/fitts-radial-hud-chord-optimizer.ts",
  },
];

export function TechnologyVisualGalleryStrip({
  id = "technology-visual-gallery-strip",
  className,
}: TechnologyVisualGalleryStripProps) {
  useBilingualI18nRevision();
  const baseId = useId();
  const headingId = `${baseId}-visual-gallery-title`;
  const [selectedGenre, setSelectedGenre] = useState<GenrePlateId>("joseon");
  const activePlate = GENRE_PLATES.find((plate) => plate.id === selectedGenre) ?? GENRE_PLATES[0]!;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-technology-visual-gallery=""
      className={cx("grid gap-6 pb-10 sm:pb-12", className)}
    >
      <header className="rounded-3xl border border-line/75 bg-panel/70 px-5 py-5 shadow-sm sm:px-7 sm:py-6">
        <p className="inline-flex items-center gap-1.5 font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
          <Film size={14} aria-hidden="true" />
          {bi("ATELIER VISUAL PLATES · ENGINE LINEAGE", "ATELIER VISUAL PLATES · ENGINE LINEAGE")}
        </p>
        <h2 id={headingId} className="mt-2 text-balance break-keep text-2xl font-black tracking-tight text-fg sm:text-3xl">
          {bi(
            "4대 장르 프로덕션 플레이트와 운영 기반 × 1~24웨이브 기술 계보",
            "Four Genre Production Plates & Live Stack × Waves 1–24 Lineage",
          )}
        </h2>
        <p className="mt-2.5 max-w-3xl break-keep text-sm leading-7 text-fg-2">
          {bi(
            "사극·무협·누아르·판타지 각 장면이 실제로 어떤 광학·기하·인쇄 커널에 대응하는지 짝지었습니다. 현재 서비스에서 가동 중인 운영 스택(Live)과 단위 검증을 마치고 스튜디오 연결을 앞둔 차세대 커널(Experimental)을 구분해 공개합니다.",
            "Pairs historical, murim, noir and fantasy production plates with their exact optical, geometric and print kernels, separating Live production systems from unit-verified Experimental Wave 1–24 modules.",
          )}
        </p>

        <ul className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label={bi("코어 기술 엠블럼 4종", "Four core engine medallions")}>
          {MEDALLIONS.map((item) => (
            <li key={item.id} className="flex items-center gap-3.5 rounded-2xl border border-line/70 bg-card/80 p-3.5">
              <img
                src={item.src}
                alt={bi(item.title.ko, item.title.en)}
                width={64}
                height={64}
                loading="lazy"
                decoding="async"
                className="size-16 shrink-0 rounded-2xl bg-panel object-contain p-1.5 outline-1 -outline-offset-1 outline-line/60"
              />
              <div className="min-w-0">
                <span className="inline-block rounded-md bg-accent-soft px-2 py-0.5 font-mono text-[0.68rem] font-bold tabular-nums text-accent">
                  {item.metric}
                </span>
                <p className="mt-1 break-keep text-sm font-black text-fg">{bi(item.title.ko, item.title.en)}</p>
                <p className="mt-0.5 break-keep text-xs leading-5 text-fg-2">{bi(item.role.ko, item.role.en)}</p>
              </div>
            </li>
          ))}
        </ul>

        <ul className="mt-4 flex flex-wrap gap-2" aria-label={bi("도메인 기술 배지 6종", "Six domain technology badges")}>
          {DOMAIN_BADGES.map((badge) => (
            <li key={badge.id} className="inline-flex items-center gap-2 rounded-xl border border-line/70 bg-card/70 px-3 py-1.5">
              <img
                src={badge.src}
                alt=""
                width={28}
                height={28}
                loading="lazy"
                decoding="async"
                className="size-7 shrink-0 rounded-lg bg-panel p-0.5 outline-1 -outline-offset-1 outline-line/60"
              />
              <span className="break-keep text-xs font-bold text-fg-2">{bi(badge.ko, badge.en)}</span>
            </li>
          ))}
        </ul>
      </header>

      <div className="rounded-3xl border border-line/75 bg-card/65 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="break-keep text-lg font-black text-fg">
              {bi("장르별 제작 플레이트와 구동 파이프라인", "Genre Production Plates & Active Pipelines")}
            </h3>
            <p className="mt-1 break-keep text-xs leading-5 text-fg-2">
              {bi(
                "장르 버튼을 눌러 해당 장면의 핵심 광학·기하·조판 모듈 경로를 확인하세요 (1536×1024 WebP).",
                "Select a genre plate to inspect its optical, geometric and print module paths (1536×1024 WebP).",
              )}
            </p>
          </div>
          <div role="group" aria-label={bi("장르 플레이트 선택", "Select genre production plate")} className="flex flex-wrap gap-2">
            {GENRE_PLATES.map((plate) => {
              const selected = plate.id === activePlate.id;
              return (
                <button
                  key={plate.id}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setSelectedGenre(plate.id)}
                  className={cx(
                    "inline-flex min-h-11 items-center rounded-xl border px-3.5 py-2 text-xs font-bold break-keep",
                    "transition-colors duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent",
                    selected
                      ? "border-accent bg-accent text-on-accent"
                      : "border-line-strong bg-panel text-fg-2 hover:border-accent/50 hover:text-fg",
                  )}
                >
                  {bi(plate.genre.ko, plate.genre.en)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          {GENRE_PLATES.map((plate) => {
            const selected = plate.id === activePlate.id;
            return (
              <article
                key={plate.id}
                data-genre-plate={plate.id}
                data-selected={selected ? "true" : "false"}
                className={cx(
                  "flex flex-col overflow-hidden rounded-2xl border p-3 transition-colors duration-150 motion-reduce:transition-none",
                  selected ? "border-accent bg-accent-soft/35" : "border-line/70 bg-panel/55",
                )}
              >
                <div className="overflow-hidden rounded-xl bg-panel outline-1 -outline-offset-1 outline-line/60">
                  <img
                    src={plate.src}
                    alt={`${bi(plate.genre.ko, plate.genre.en)} — ${bi(plate.title.ko, plate.title.en)}`}
                    width={1536}
                    height={1024}
                    loading="lazy"
                    decoding="async"
                    className="aspect-[3/2] w-full object-cover"
                  />
                </div>
                <div className="mt-3 flex flex-1 flex-col gap-2 px-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-black text-accent">{bi(plate.genre.ko, plate.genre.en)}</span>
                    <span className="rounded-full border border-line bg-card px-2 py-0.5 font-mono text-[0.65rem] tabular-nums text-fg-3">
                      1536×1024 WebP
                    </span>
                  </div>
                  <h4 className="break-keep text-base font-black text-fg">{bi(plate.title.ko, plate.title.en)}</h4>
                  <p className="break-keep text-xs leading-6 text-fg-2">{bi(plate.sceneNote.ko, plate.sceneNote.en)}</p>
                  <ul className="mt-auto grid gap-1.5 border-t border-line/60 pt-2.5">
                    {plate.pipelines.map((pipe) => (
                      <li key={pipe.evidence} className="flex flex-wrap items-baseline justify-between gap-2 text-xs">
                        <span className="break-keep font-bold text-fg">{bi(pipe.name.ko, pipe.name.en)}</span>
                        <code className="rounded bg-card px-1.5 py-0.5 font-mono text-[0.66rem] text-fg-3">{pipe.evidence}</code>
                      </li>
                    ))}
                  </ul>
                </div>
              </article>
            );
          })}
        </div>
      </div>

      <div className="rounded-3xl border border-line/75 bg-panel/65 p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="inline-flex items-center gap-1.5 font-display text-[0.68rem] font-black uppercase tracking-[0.16em] text-accent">
              <Layers size={14} aria-hidden="true" />
              {bi("FOUNDATIONAL LIVE STACK × WAVES 1–24", "FOUNDATIONAL LIVE STACK × WAVES 1–24")}
            </p>
            <h3 className="mt-1 break-keep text-lg font-black text-fg sm:text-xl">
              {bi(
                "8대 핵심 운영 기반(Live)과 Waves 1~24 검증 엔진 정합 매트릭스",
                "8-Pillar Foundational Live Stack × Waves 1–24 Engine Matrix",
              )}
            </h3>
          </div>
          <p className="inline-flex items-center gap-1.5 rounded-xl border border-line bg-card px-3 py-1.5 text-xs font-semibold text-fg-2">
            <ShieldCheck size={14} className="shrink-0 text-accent" aria-hidden="true" />
            {bi("초기 번들 유입 0B · 온디맨드 지연 로드", "0 B eager bundle · lazy on-demand load")}
          </p>
        </div>

        <div className="mt-4 overflow-x-auto rounded-2xl border border-line/70">
          <table className="w-full min-w-[54rem] border-collapse bg-card/70 text-left">
            <caption className="sr-only">
              {bi("운영 스택과 Waves 1~24 확장 엔진 대조표", "Live foundational stack versus Waves 1–24 engines")}
            </caption>
            <thead>
              <tr className="border-b border-line/70 bg-panel/85 text-xs font-black text-fg-2">
                <th scope="col" className="px-4 py-3">{bi("운영 기반 ( 현재 운영 · Live )", "Foundational Stack (Live)")}</th>
                <th scope="col" className="px-4 py-3">{bi("현재 맡는 권위", "Live Responsibility")}</th>
                <th scope="col" className="px-4 py-3">{bi("Waves 1–24 초격차 확장 엔진", "Waves 1–24 Verified Engines")}</th>
                <th scope="col" className="px-4 py-3">{bi("상태 · 대표 근거", "Status & Evidence")}</th>
              </tr>
            </thead>
            <tbody>
              {STACK_MATRIX_ROWS.map((row) => (
                <tr key={row.id} className="border-b border-line/50 last:border-0">
                  <th scope="row" className="px-4 py-3.5 align-top text-xs font-black break-keep text-fg">
                    <span className="inline-flex items-center gap-1.5">
                      <span className="rounded-full border border-accent/35 bg-accent-soft px-2 py-0.5 text-[0.65rem] font-black text-accent">
                        Live
                      </span>
                      {bi(row.liveFoundation.ko, row.liveFoundation.en)}
                    </span>
                  </th>
                  <td className="px-4 py-3.5 align-top text-xs leading-5 break-keep text-fg-2">{bi(row.liveScope.ko, row.liveScope.en)}</td>
                  <td className="px-4 py-3.5 align-top text-xs leading-5 break-keep text-fg-2">{bi(row.wavesExtension.ko, row.wavesExtension.en)}</td>
                  <td className="px-4 py-3.5 align-top text-xs">
                    <span
                      className={cx(
                        "inline-block rounded-full border px-2.5 py-0.5 text-[0.66rem] font-black break-keep",
                        row.extensionStatus === "live"
                          ? "border-accent/35 bg-accent-soft text-accent"
                          : "border-warn/45 bg-warning-soft text-fg",
                      )}
                    >
                      {row.extensionStatus === "live"
                        ? bi("현재 운영 (Live)", "Live in Production")
                        : bi("단위 검증 완료 · 스튜디오 직결 예정 (Experimental)", "Unit-Verified · Studio Wiring Target (Experimental)")}
                    </span>
                    <code className="mt-1.5 block font-mono text-[0.65rem] text-fg-3">{row.evidencePath}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
