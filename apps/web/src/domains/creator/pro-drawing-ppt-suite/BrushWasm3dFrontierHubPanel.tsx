import { Box, Cpu, Eye, Layers, Palette, PenTool, Scissors, Server, SlidersHorizontal, Sparkles, Wand2, Zap } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

const LazyStudioBrushPhysicsProPanel = lazy(() =>
  import("../brush-physics-pro/StudioBrushPhysicsProPanel").then((m) => ({
    default: m.StudioBrushPhysicsProPanel,
  })),
);
const LazyStudioBrushCustomLabPanel = lazy(async () => {
  await import("../brush-custom-lab");
  const m = await import("../brush-custom-lab/StudioBrushCustomLabPanel");
  return { default: m.StudioBrushCustomLabPanel };
});
const LazyStudioWasm64EngineHubPanel = lazy(() =>
  import("../wasm64-drawing-engine/StudioWasm64EngineHubPanel").then((m) => ({
    default: m.StudioWasm64EngineHubPanel,
  })),
);
const LazyStudioWasm64HotpathPanel = lazy(async () => {
  await import("../wasm64-runtime-bridge");
  const m = await import("../wasm64-runtime-bridge/StudioWasm64HotpathPanel");
  return { default: m.StudioWasm64HotpathPanel };
});
const LazyStudio3dWasm64LookdevPanel = lazy(() =>
  import("../scene3d-wasm64-npr/Studio3dWasm64LookdevPanel").then((m) => ({
    default: m.Studio3dWasm64LookdevPanel,
  })),
);
const LazyStudioVrmAutoShaderTransferPanel = lazy(async () => {
  await import("../vrm-auto-shader-transfer");
  const m = await import("../vrm-auto-shader-transfer/StudioVrmAutoShaderTransferPanel");
  return { default: m.StudioVrmAutoShaderTransferPanel };
});
const LazyStudioNextgenDrawingFrontierPanel = lazy(() =>
  import("../nextgen-drawing-frontier/StudioNextgenDrawingFrontierPanel").then((m) => ({
    default: m.StudioNextgenDrawingFrontierPanel,
  })),
);
const LazyStudioVisualIntegrityOraclePanel = lazy(async () => {
  await import("../visual-integrity-oracle");
  const m = await import("../visual-integrity-oracle/StudioVisualIntegrityOraclePanel");
  return { default: m.StudioVisualIntegrityOraclePanel };
});
const LazyStudioNoCodeShaderGridPanel = lazy(async () => {
  await import("../nocode-shader-grid");
  const m = await import("../nocode-shader-grid/StudioNoCodeShaderGridPanel");
  return { default: m.StudioNoCodeShaderGridPanel };
});
const LazyStudioVectorInkProjectionPanel = lazy(async () => {
  await import("../vector-ink-projection");
  const m = await import("../vector-ink-projection/StudioVectorInkProjectionPanel");
  return { default: m.StudioVectorInkProjectionPanel };
});
const LazyStudioVrmHairTransplantPanel = lazy(async () => {
  await import("../vrm-hair-transplant");
  const m = await import("../vrm-hair-transplant/StudioVrmHairTransplantPanel");
  return { default: m.StudioVrmHairTransplantPanel };
});
const LazyStudioWebGpuNextgenRuntimePanel = lazy(async () => {
  await import("../webgpu-nextgen-runtime");
  const m = await import("../webgpu-nextgen-runtime/StudioWebGpuNextgenRuntimePanel");
  return { default: m.StudioWebGpuNextgenRuntimePanel };
});
const LazyStudioWebnnPigmentDirectorPanel = lazy(async () => {
  await import("../webnn-pigment-director");
  const m = await import("../webnn-pigment-director/StudioWebnnPigmentDirectorPanel");
  return { default: m.StudioWebnnPigmentDirectorPanel };
});
const LazyStudioWebgpuXpbdLightingPanel = lazy(async () => {
  await import("../webgpu-xpbd-lighting");
  const m = await import("../webgpu-xpbd-lighting/StudioWebgpuXpbdLightingPanel");
  return { default: m.StudioWebgpuXpbdLightingPanel };
});
const LazyStudioVrmLookdevGoldenPanel = lazy(async () => {
  await import("../vrm-lookdev-golden");
  const m = await import("../vrm-lookdev-golden/StudioVrmLookdevGoldenPanel");
  return { default: m.StudioVrmLookdevGoldenPanel };
});
const LazyStudioBrush3dExtremePanel = lazy(async () => {
  await import("../brush-3d-extreme-lab");
  const m = await import("../brush-3d-extreme-lab/StudioBrush3dExtremePanel");
  return { default: m.StudioBrush3dExtremePanel };
});
const LazyStudioWebgpuCrowdDirectorPanel = lazy(async () => {
  await import("../webgpu-crowd-director");
  const m = await import("../webgpu-crowd-director/StudioWebgpuCrowdDirectorPanel");
  return { default: m.StudioWebgpuCrowdDirectorPanel };
});

type FrontierTabId =
  | "brushPhysics"
  | "brushCustomLab"
  | "brush3dExtreme"
  | "wasm64Core"
  | "wasm64Hotpath"
  | "scene3dNpr"
  | "vrmAutoShader"
  | "vrmHairTransplant"
  | "vrmLookdevGolden"
  | "vectorInkProj"
  | "webgpuNextgen"
  | "webgpuXpbdLight"
  | "webgpuCrowd"
  | "webnnPigment"
  | "drawingFrontier"
  | "visualOracle"
  | "nocodeShaderGrid"
  | "liveOracle";

interface OracleLiveSnapshot {
  readonly catalogBrushes: number;
  readonly namingParityPct: number;
  readonly kmGreenRgb: string;
  readonly liveCommitDiffMax: number;
  readonly soakAllPassed: boolean;
  readonly soakMaxP95Ms: number;
}

const FRONTIER_TABS: readonly {
  readonly id: FrontierTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "brushPhysics", labelKo: "물리 브러시·종이 높이장·임파스토", labelEn: "Physical Brush · Paper · Impasto" },
  { id: "brushCustomLab", labelKo: "커스텀 브러시 랩 · .tsbrush", labelEn: "Custom Brush Lab · .tsbrush" },
  { id: "brush3dExtreme", labelKo: "극한 2.5D 임파스토·Face SDF·6패스·IK", labelEn: "2.5D Impasto · Face SDF · 6-Pass · IK" },
  { id: "wasm64Core", labelKo: "Rust + Wasm64(memory64) 코어", labelEn: "Rust + Wasm64 Core Engine" },
  { id: "wasm64Hotpath", labelKo: "실물 Rust .wasm 핫패스", labelEn: "Live Rust .wasm Hotpath" },
  { id: "scene3dNpr", labelKo: "3D Wasm64 BVH·LOD·NPR 룩뎁", labelEn: "3D Wasm64 BVH · LOD · NPR" },
  { id: "vrmAutoShader", labelKo: "VRM 재질 DNA 상속 · 깊이 분리", labelEn: "VRM Shader DNA · Depth Split" },
  { id: "vrmHairTransplant", labelKo: "헤어 정렬 계획·VRM 이식 엔진", labelEn: "Hair Alignment Plan · VRM Transplant Engine" },
  { id: "vrmLookdevGolden", labelKo: "RGBA SSIM·헤어·3면 시트 예제", labelEn: "RGBA SSIM · Hair · Example Turnaround" },
  { id: "vectorInkProj", labelKo: "3D → G펜 벡터 잉크 투영", labelEn: "3D → G-Pen Vector Ink" },
  { id: "webgpuNextgen", labelKo: "제로카피 · LOD · P2P · 카나리", labelEn: "Zero-Copy · LOD · P2P · Canary" },
  { id: "webgpuXpbdLight", labelKo: "XPBD 물리·CPU 광원 베이크", labelEn: "XPBD Physics · CPU Light Bake" },
  { id: "webgpuCrowd", labelKo: "군중 배치 CPU 미리보기·GPU 계약", labelEn: "CPU Crowd Preview · GPU Contract" },
  { id: "webnnPigment", labelKo: "CPU 선화·안료 혼색·컷 규칙", labelEn: "CPU Lineart · Pigment Mix · Cut Rules" },
  { id: "drawingFrontier", labelKo: "하이브리드 획·건조기·HDR·심의", labelEn: "Hybrid Stroke · Dryer · HDR" },
  { id: "visualOracle", labelKo: "시각 무결성 오라클 (SSIM·ΔE)", labelEn: "Visual Integrity Oracle (SSIM·ΔE)" },
  { id: "nocodeShaderGrid", labelKo: "노코드 WGSL · 분산 그리드", labelEn: "No-Code WGSL · Tile Grid" },
  { id: "liveOracle", labelKo: "실시간 엔진 오라클 (194종·KM·GPU)", labelEn: "Live Engine Oracle (194 · KM · GPU)" },
];

const ATELIER_PREBAKED_ASSET_GROUPS: readonly {
  readonly id: string;
  readonly titleKo: string;
  readonly titleEn: string;
  readonly items: readonly { readonly src: string; readonly labelKo: string; readonly labelEn: string }[];
}[] = [
  {
    id: "media",
    titleKo: "실물 화구 매크로 6종",
    titleEn: "6 Physical Media Macros",
    items: [
      { src: "/assets/atelier/media/gpen-ink.webp", labelKo: "G펜 스틸 닙", labelEn: "G-Pen Steel Nib" },
      { src: "/assets/atelier/media/graphite-pencil.webp", labelKo: "4B 흑연 연필", labelEn: "4B Graphite Pencil" },
      { src: "/assets/atelier/media/watercolor-sable.webp", labelKo: "세이블 수채 붓", labelEn: "Sable Watercolor" },
      { src: "/assets/atelier/media/alcohol-marker.webp", labelKo: "알코올 마커", labelEn: "Alcohol Marker" },
      { src: "/assets/atelier/media/oil-impasto.webp", labelKo: "유화 나이프", labelEn: "Impasto Knife" },
      { src: "/assets/atelier/media/charcoal-pastel.webp", labelKo: "목탄·황목지", labelEn: "Vine Charcoal" },
    ],
  },
  {
    id: "papers",
    titleKo: "종이결 매크로 4종",
    titleEn: "4 Paper Substrates",
    items: [
      { src: "/assets/atelier/papers/manga-kent.webp", labelKo: "만화 켄트지", labelEn: "Manga Kent" },
      { src: "/assets/atelier/papers/cold-press-watercolor.webp", labelKo: "수채 황목지", labelEn: "Cold-Press Cotton" },
      { src: "/assets/atelier/papers/linen-canvas.webp", labelKo: "벨기에 린넨", labelEn: "Belgian Linen" },
      { src: "/assets/atelier/papers/korean-hanji.webp", labelKo: "전통 한지", labelEn: "Korean Hanji" },
    ],
  },
  {
    id: "spaces",
    titleKo: "가상 스튜디오 6종 디오라마",
    titleEn: "6 Virtual Studio Dioramas",
    items: [
      { src: "/assets/atelier/spaces/wood-atelier.webp", labelKo: "목재 웹툰 공방", labelEn: "Wood Atelier" },
      { src: "/assets/atelier/spaces/rooftop-terrace.webp", labelKo: "노을 루프탑 테라스", labelEn: "Rooftop Terrace" },
      { src: "/assets/atelier/spaces/midnight-manga-cafe.webp", labelKo: "심야 만화 북카페", labelEn: "Midnight Manga Café" },
      { src: "/assets/atelier/spaces/reference-library.webp", labelKo: "정숙 자료실", labelEn: "Reference Library" },
      { src: "/assets/atelier/spaces/fantasy-guild-hall.webp", labelKo: "판타지 길드홀", labelEn: "Fantasy Guild Hall" },
      { src: "/assets/atelier/spaces/comic-gallery.webp", labelKo: "웹툰 전시 갤러리", labelEn: "Comic Gallery" },
    ],
  },
  {
    id: "onboarding",
    titleKo: "아틀리에 온보딩 일러스트 4종",
    titleEn: "4 Atelier Onboarding Cards",
    items: [
      { src: "/assets/atelier/onboarding/first-cut-desk.webp", labelKo: "첫 컷 작화 데스크", labelEn: "First Cut Desk" },
      { src: "/assets/atelier/onboarding/character-sculpt.webp", labelKo: "3D 캐릭터 조형", labelEn: "3D Character Sculpt" },
      { src: "/assets/atelier/onboarding/virtual-collab.webp", labelKo: "가상 스튜디오 합작", labelEn: "Virtual Studio Collab" },
      { src: "/assets/atelier/onboarding/episode-publish.webp", labelKo: "회차·단행본 출고", labelEn: "Episode Publish" },
    ],
  },
  {
    id: "jewels",
    titleKo: "주얼 아틀리에 3D 에나멜 도구 아이콘 6종",
    titleEn: "6 Jewel Atelier 3D Enamel Tool Icons",
    items: [
      { src: "/assets/atelier/jewels/jewel-drawing-nib.webp", labelKo: "드로잉 잉크 닙", labelEn: "Drawing Ink Nib" },
      { src: "/assets/atelier/jewels/jewel-pigment-cup.webp", labelKo: "광학 안료 혼색", labelEn: "Optical Pigment" },
      { src: "/assets/atelier/jewels/jewel-character-bust.webp", labelKo: "3D 캐릭터 셰이퍼", labelEn: "3D Character Shaper" },
      { src: "/assets/atelier/jewels/jewel-studio-cube.webp", labelKo: "가상 스튜디오·배경", labelEn: "Virtual Studio" },
      { src: "/assets/atelier/jewels/jewel-acoustic-fork.webp", labelKo: "물리 음향·Foley", labelEn: "Physical Audio" },
      { src: "/assets/atelier/jewels/jewel-reels-slate.webp", labelKo: "4K 무빙툰·출고", labelEn: "4K Reels & Export" },
    ],
  },
  {
    id: "backgrounds",
    titleKo: "웹툰 3D 배경 쇼케이스 4종",
    titleEn: "4 Webtoon 3D Background Showcases",
    items: [
      { src: "/assets/atelier/backgrounds/bg-seoul-crosswalk.webp", labelKo: "노을 도심 횡단보도", labelEn: "Golden Crosswalk" },
      { src: "/assets/atelier/backgrounds/bg-school-hallway.webp", labelKo: "햇살 고교 복도", labelEn: "Sunlit School Hallway" },
      { src: "/assets/atelier/backgrounds/bg-fantasy-courtyard.webp", labelKo: "판타지 석조 아치", labelEn: "Fantasy Courtyard" },
      { src: "/assets/atelier/backgrounds/bg-rainy-bookstore.webp", labelKo: "비 오는 밤 서점 골목", labelEn: "Rainy Night Alley" },
    ],
  },
];

function FrontierIcon({ id }: { readonly id: FrontierTabId }) {
  switch (id) {
    case "brushPhysics":
      return <Sparkles size={15} aria-hidden="true" />;
    case "brushCustomLab":
      return <SlidersHorizontal size={15} aria-hidden="true" />;
    case "brush3dExtreme":
      return <PenTool size={15} aria-hidden="true" />;
    case "wasm64Core":
      return <Cpu size={15} aria-hidden="true" />;
    case "wasm64Hotpath":
      return <Zap size={15} aria-hidden="true" />;
    case "scene3dNpr":
      return <Box size={15} aria-hidden="true" />;
    case "vrmAutoShader":
      return <Palette size={15} aria-hidden="true" />;
    case "vrmHairTransplant":
      return <Scissors size={15} aria-hidden="true" />;
    case "vrmLookdevGolden":
      return <Eye size={15} aria-hidden="true" />;
    case "vectorInkProj":
      return <PenTool size={15} aria-hidden="true" />;
    case "webgpuNextgen":
      return <Server size={15} aria-hidden="true" />;
    case "webgpuXpbdLight":
      return <Zap size={15} aria-hidden="true" />;
    case "webgpuCrowd":
      return <Layers size={15} aria-hidden="true" />;
    case "webnnPigment":
      return <Palette size={15} aria-hidden="true" />;
    case "drawingFrontier":
      return <Wand2 size={15} aria-hidden="true" />;
    case "visualOracle":
      return <Eye size={15} aria-hidden="true" />;
    case "nocodeShaderGrid":
      return <Layers size={15} aria-hidden="true" />;
    case "liveOracle":
      return <Layers size={15} aria-hidden="true" />;
  }
}

export function BrushWasm3dFrontierHubPanel() {
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const baseId = useId();
  const [active, setActive] = useState<FrontierTabId>("brushPhysics");
  const [oracleBusy, setOracleBusy] = useState(false);
  const [oracleSnapshot, setOracleSnapshot] = useState<OracleLiveSnapshot | null>(null);

  const runLiveEngineOracle = async () => {
    setOracleBusy(true);
    try {
      const [atlasMod, bakerMod, deltaMod, auditMod, gpuMod] = await Promise.all([
        import("../brush-baked-cache/real-media-tip-atlas"),
        import("../brush-baked-cache/layer-stroke-bitmap-baker"),
        import("../brush-baked-cache/incremental-delta-stroke-buffer"),
        import("../brush-master-audit/brush-catalog-visual-dedupe-audit"),
        import("../webgpu-zero-copy-studio/drawing-tools-perf-soak-harness"),
      ]);
      const km = atlasMod.mixPigmentsKubelkaMunk({ r: 20, g: 61, b: 199 }, { r: 250, g: 214, b: 23 }, 0.5);
      const baker = new bakerMod.LayerStrokeBitmapBaker({ maxMemoryBytes: 8 * 1024 * 1024 });
      const liveBuf = new deltaMod.IncrementalDeltaStrokeBuffer();
      liveBuf.beginStroke({ strokeId: "oracle-1", tipId: "graphite-pencil-6b", color: { r: 30, g: 34, b: 40 }, radiusPx: 10 });
      liveBuf.appendPoints([{ x: 16, y: 24, pressure: 0.45 }, { x: 48, y: 36, pressure: 0.82 }, { x: 80, y: 24, pressure: 0.35 }]);
      const livePreview = liveBuf.composePreviewRegion(baker, "L0", 0, 0, 96, 64);
      liveBuf.commitToBaker(baker, "L0");
      const committed = baker.readRegion("L0", 0, 0, 96, 64);
      const parityDiff = deltaMod.computeRgbaRegionDiff(livePreview, committed);
      baker.dispose();

      const audit = auditMod.runFullBrushCatalogAudit();
      const soak = gpuMod.runFullDrawingToolsSoakBenchmark({ soakTicks: 180 });
      const maxP95 = Math.max(
        soak.mixed12Brushes.timing.p95Ms,
        soak.composite10Filters.timing.p95Ms,
        soak.multiObject500Arap.timing.p95Ms,
        soak.multiUser8Crdt.timing.p95Ms,
        soak.simulated30MinSoak.timing.p95Ms,
      );
      setOracleSnapshot({
        catalogBrushes: audit.totalBrushes,
        namingParityPct: Number((audit.namingParityRate01 * 100).toFixed(1)),
        kmGreenRgb: `rgb(${km.r}, ${km.g}, ${km.b})`,
        liveCommitDiffMax: parityDiff.maxAbsDiff,
        soakAllPassed: soak.allPassed,
        soakMaxP95Ms: Number(maxP95.toFixed(2)),
      });
    } finally {
      setOracleBusy(false);
    }
  };

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3"
      aria-label={isEn ? "Brush Physics, Rust Wasm64, and 3D NPR Frontier Hub" : "물리 브러시 · Rust Wasm64 · 3D NPR 차세대 엔진 허브"}
      data-testid="brush-wasm-3d-frontier-hub"
    >
      <div role="tablist" aria-label={isEn ? "Frontier engine modules" : "차세대 코어 엔진 선택"} className="flex flex-wrap gap-2">
        {FRONTIER_TABS.map((tab) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              id={`${baseId}-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              onClick={() => setActive(tab.id)}
              className={`inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold [word-break:keep-all] transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] motion-reduce:transition-none motion-reduce:transform-none ${
                selected
                  ? "border-accent bg-accent text-on-accent"
                  : "border-line bg-panel text-fg-2 hover:border-line-strong hover:text-fg"
              }`}
            >
              <FrontierIcon id={tab.id} />
              <span>{isEn ? tab.labelEn : tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel-${active}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`}>
        {active === "liveOracle" ? (
          <div className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-semibold text-fg [word-break:keep-all]">
                {isEn
                  ? "Run Live Browser Benchmark (194 Brushes · Kubelka-Munk · WebGPU Soak)"
                  : "내 브라우저에서 직접 실행하는 실측 오라클 (194종 브러시 · Kubelka-Munk · WebGPU 소크)"}
              </p>
              <button
                type="button"
                disabled={oracleBusy}
                onClick={() => void runLiveEngineOracle()}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-accent bg-accent px-3 py-2 text-xs font-semibold text-on-accent transition-[background-color,border-color,color,transform] duration-150 enabled:active:scale-[0.98] disabled:opacity-60 motion-reduce:transition-none"
              >
                <Sparkles size={14} aria-hidden="true" />
                <span>{oracleBusy ? (isEn ? "Running..." : "측정 중…") : isEn ? "Run Live Oracle" : "실시간 오라클 실행"}</span>
              </button>
            </div>
            {oracleSnapshot ? (
              <dl className="grid grid-cols-2 gap-2 text-xs tabular-nums sm:grid-cols-4">
                <div className="rounded-lg border border-line bg-card p-2.5">
                  <dt className="text-fg-2">{isEn ? "Audited Brushes" : "전수 감사 브러시"}</dt>
                  <dd className="mt-1 text-base font-bold text-fg">{oracleSnapshot.catalogBrushes}</dd>
                </div>
                <div className="rounded-lg border border-line bg-card p-2.5">
                  <dt className="text-fg-2">{isEn ? "Name↔Texture Parity" : "이름↔질감 정합률"}</dt>
                  <dd className="mt-1 text-base font-bold text-fg">{oracleSnapshot.namingParityPct}%</dd>
                </div>
                <div className="rounded-lg border border-line bg-card p-2.5">
                  <dt className="text-fg-2">{isEn ? "KM Mix · Live=Commit" : "KM 혼색 · 라이브=커밋"}</dt>
                  <dd className="mt-1 font-mono text-xs font-semibold text-fg">
                    {oracleSnapshot.kmGreenRgb} · Δ={oracleSnapshot.liveCommitDiffMax}
                  </dd>
                </div>
                <div className="rounded-lg border border-line bg-card p-2.5">
                  <dt className="text-fg-2">{isEn ? "5-Axis Soak p95" : "5축 소크 최대 p95"}</dt>
                  <dd className="mt-1 text-base font-bold text-fg">
                    {oracleSnapshot.soakMaxP95Ms} ms ({oracleSnapshot.soakAllPassed ? "PASS" : "CHECK"})
                  </dd>
                </div>
              </dl>
            ) : (
              <p className="text-xs text-fg-2 [word-break:keep-all]">
                {isEn
                  ? "Click Run Live Oracle to execute real-time catalog audit, 16-band Kubelka-Munk optical mix, and 5-axis zero-copy soak directly in your browser."
                  : "버튼을 누르면 현재 브라우저에서 194종 브러시 정합 감사, 16파장 Kubelka-Munk 광학 혼색, 5축 제로카피 소크 벤치마크를 직접 실행해 실측합니다."}
              </p>
            )}
          </div>
        ) : (
          <Suspense
            fallback={
              <p className="p-4 text-xs text-fg-2">
                {isEn ? "Loading next-gen studio engine..." : "차세대 드로잉·Wasm64 엔진을 불러오는 중입니다…"}
              </p>
            }
          >
            {active === "brushPhysics" ? <LazyStudioBrushPhysicsProPanel /> : null}
            {active === "brushCustomLab" ? <LazyStudioBrushCustomLabPanel /> : null}
            {active === "brush3dExtreme" ? <LazyStudioBrush3dExtremePanel /> : null}
            {active === "wasm64Core" ? <LazyStudioWasm64EngineHubPanel /> : null}
            {active === "wasm64Hotpath" ? <LazyStudioWasm64HotpathPanel /> : null}
            {active === "scene3dNpr" ? <LazyStudio3dWasm64LookdevPanel /> : null}
            {active === "vrmAutoShader" ? <LazyStudioVrmAutoShaderTransferPanel /> : null}
            {active === "vrmHairTransplant" ? <LazyStudioVrmHairTransplantPanel /> : null}
            {active === "vrmLookdevGolden" ? <LazyStudioVrmLookdevGoldenPanel /> : null}
            {active === "vectorInkProj" ? <LazyStudioVectorInkProjectionPanel /> : null}
            {active === "webgpuNextgen" ? <LazyStudioWebGpuNextgenRuntimePanel /> : null}
            {active === "webgpuXpbdLight" ? <LazyStudioWebgpuXpbdLightingPanel /> : null}
            {active === "webgpuCrowd" ? <LazyStudioWebgpuCrowdDirectorPanel /> : null}
            {active === "webnnPigment" ? <LazyStudioWebnnPigmentDirectorPanel /> : null}
            {active === "drawingFrontier" ? <LazyStudioNextgenDrawingFrontierPanel /> : null}
            {active === "visualOracle" ? <LazyStudioVisualIntegrityOraclePanel /> : null}
            {active === "nocodeShaderGrid" ? <LazyStudioNoCodeShaderGridPanel /> : null}
          </Suspense>
        )}
      </div>

      <details className="rounded-xl border border-line bg-panel p-3" data-testid="atelier-prebaked-assets-drawer">
        <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 text-xs font-semibold text-fg [word-break:keep-all]">
          <span>
            {isEn
              ? "Pre-Baked Atelier Visual Pack (Physical Media · Paper · 6 Spaces · Onboarding)"
              : "아틀리에 실물 화구 · 종이결 · 가상 스튜디오 6종 · 온보딩 비주얼 팩"}
          </span>
          <span className="rounded-full border border-line bg-card px-2 py-0.5 text-[11px] font-semibold tabular-nums text-fg-2">
            30 WebP
          </span>
        </summary>
        <div className="mt-3 flex flex-col gap-3">
          {ATELIER_PREBAKED_ASSET_GROUPS.map((group) => (
            <div key={group.id} className="flex flex-col gap-1.5">
              <p className="text-[11px] font-semibold text-fg-2">{isEn ? group.titleEn : group.titleKo}</p>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
                {group.items.map((item) => (
                  <figure
                    key={item.src}
                    className="flex flex-col gap-1 rounded-lg border border-line bg-card p-1.5"
                  >
                    <img
                      src={item.src}
                      alt={isEn ? item.labelEn : item.labelKo}
                      loading="lazy"
                      decoding="async"
                      className="aspect-square w-full rounded object-cover outline-1 -outline-offset-1 outline-border"
                    />
                    <figcaption className="truncate text-center text-[11px] font-medium text-fg [word-break:keep-all]">
                      {isEn ? item.labelEn : item.labelKo}
                    </figcaption>
                  </figure>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </section>
  );
}
