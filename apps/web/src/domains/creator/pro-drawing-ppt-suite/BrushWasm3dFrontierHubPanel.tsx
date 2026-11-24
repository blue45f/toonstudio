import { Box, Cpu, Eye, Layers, Palette, SlidersHorizontal, Sparkles, Wand2, Zap } from "lucide-react";
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

type FrontierTabId =
  | "brushPhysics"
  | "brushCustomLab"
  | "wasm64Core"
  | "wasm64Hotpath"
  | "scene3dNpr"
  | "vrmAutoShader"
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
  { id: "wasm64Core", labelKo: "Rust + Wasm64(memory64) 코어", labelEn: "Rust + Wasm64 Core Engine" },
  { id: "wasm64Hotpath", labelKo: "실물 Rust .wasm 핫패스", labelEn: "Live Rust .wasm Hotpath" },
  { id: "scene3dNpr", labelKo: "3D Wasm64 BVH·LOD·NPR 룩뎁", labelEn: "3D Wasm64 BVH · LOD · NPR" },
  { id: "vrmAutoShader", labelKo: "VRM 재질 DNA 상속 · 깊이 분리", labelEn: "VRM Shader DNA · Depth Split" },
  { id: "drawingFrontier", labelKo: "하이브리드 획·건조기·HDR·심의", labelEn: "Hybrid Stroke · Dryer · HDR" },
  { id: "visualOracle", labelKo: "시각 무결성 오라클 (SSIM·ΔE)", labelEn: "Visual Integrity Oracle (SSIM·ΔE)" },
  { id: "nocodeShaderGrid", labelKo: "노코드 WGSL · 분산 그리드", labelEn: "No-Code WGSL · Tile Grid" },
  { id: "liveOracle", labelKo: "실시간 엔진 오라클 (194종·KM·GPU)", labelEn: "Live Engine Oracle (194 · KM · GPU)" },
];

function FrontierIcon({ id }: { readonly id: FrontierTabId }) {
  switch (id) {
    case "brushPhysics":
      return <Sparkles size={15} aria-hidden="true" />;
    case "brushCustomLab":
      return <SlidersHorizontal size={15} aria-hidden="true" />;
    case "wasm64Core":
      return <Cpu size={15} aria-hidden="true" />;
    case "wasm64Hotpath":
      return <Zap size={15} aria-hidden="true" />;
    case "scene3dNpr":
      return <Box size={15} aria-hidden="true" />;
    case "vrmAutoShader":
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
            {active === "wasm64Core" ? <LazyStudioWasm64EngineHubPanel /> : null}
            {active === "wasm64Hotpath" ? <LazyStudioWasm64HotpathPanel /> : null}
            {active === "scene3dNpr" ? <LazyStudio3dWasm64LookdevPanel /> : null}
            {active === "vrmAutoShader" ? <LazyStudioVrmAutoShaderTransferPanel /> : null}
            {active === "drawingFrontier" ? <LazyStudioNextgenDrawingFrontierPanel /> : null}
            {active === "visualOracle" ? <LazyStudioVisualIntegrityOraclePanel /> : null}
            {active === "nocodeShaderGrid" ? <LazyStudioNoCodeShaderGridPanel /> : null}
          </Suspense>
        )}
      </div>
    </section>
  );
}
