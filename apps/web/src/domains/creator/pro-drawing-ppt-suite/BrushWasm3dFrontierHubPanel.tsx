import { Box, Cpu, Layers, Sparkles, Wand2 } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

const LazyStudioBrushPhysicsProPanel = lazy(() =>
  import("../brush-physics-pro/StudioBrushPhysicsProPanel").then((m) => ({
    default: m.StudioBrushPhysicsProPanel,
  })),
);
const LazyStudioWasm64EngineHubPanel = lazy(() =>
  import("../wasm64-drawing-engine/StudioWasm64EngineHubPanel").then((m) => ({
    default: m.StudioWasm64EngineHubPanel,
  })),
);
const LazyStudio3dWasm64LookdevPanel = lazy(() =>
  import("../scene3d-wasm64-npr/Studio3dWasm64LookdevPanel").then((m) => ({
    default: m.Studio3dWasm64LookdevPanel,
  })),
);
const LazyStudioNextgenDrawingFrontierPanel = lazy(() =>
  import("../nextgen-drawing-frontier/StudioNextgenDrawingFrontierPanel").then((m) => ({
    default: m.StudioNextgenDrawingFrontierPanel,
  })),
);

type FrontierTabId = "brushPhysics" | "wasm64Core" | "scene3dNpr" | "drawingFrontier" | "liveOracle";

interface OracleLiveSnapshot {
  readonly catalogBrushes: number;
  readonly namingParityPct: number;
  readonly kmGreenRgb: string;
  readonly soakAllPassed: boolean;
  readonly soakMaxP95Ms: number;
}

const FRONTIER_TABS: readonly {
  readonly id: FrontierTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "brushPhysics", labelKo: "물리 브러시·종이 높이장·임파스토", labelEn: "Physical Brush · Paper · Impasto" },
  { id: "wasm64Core", labelKo: "Rust + Wasm64(memory64) 코어", labelEn: "Rust + Wasm64 Core Engine" },
  { id: "scene3dNpr", labelKo: "3D Wasm64 BVH·LOD·NPR 룩뎁", labelEn: "3D Wasm64 BVH · LOD · NPR" },
  { id: "drawingFrontier", labelKo: "하이브리드 획·건조기·HDR·심의", labelEn: "Hybrid Stroke · Dryer · HDR" },
  { id: "liveOracle", labelKo: "실시간 엔진 오라클 (194종·KM·GPU)", labelEn: "Live Engine Oracle (194 · KM · GPU)" },
];

function FrontierIcon({ id }: { readonly id: FrontierTabId }) {
  switch (id) {
    case "brushPhysics":
      return <Sparkles size={15} aria-hidden="true" />;
    case "wasm64Core":
      return <Cpu size={15} aria-hidden="true" />;
    case "scene3dNpr":
      return <Box size={15} aria-hidden="true" />;
    case "drawingFrontier":
      return <Wand2 size={15} aria-hidden="true" />;
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
      const [atlasMod, auditMod, gpuMod] = await Promise.all([
        import("../brush-baked-cache/real-media-tip-atlas"),
        import("../brush-master-audit/brush-catalog-visual-dedupe-audit"),
        import("../webgpu-zero-copy-studio/drawing-tools-perf-soak-harness"),
      ]);
      const km = atlasMod.mixPigmentsKubelkaMunk({ r: 20, g: 61, b: 199 }, { r: 250, g: 214, b: 23 }, 0.5);
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
                  <dt className="text-fg-2">{isEn ? "KM Blue+Yellow" : "KM 파랑+노랑 혼색"}</dt>
                  <dd className="mt-1 font-mono text-xs font-semibold text-fg">{oracleSnapshot.kmGreenRgb}</dd>
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
            {active === "wasm64Core" ? <LazyStudioWasm64EngineHubPanel /> : null}
            {active === "scene3dNpr" ? <LazyStudio3dWasm64LookdevPanel /> : null}
            {active === "drawingFrontier" ? <LazyStudioNextgenDrawingFrontierPanel /> : null}
          </Suspense>
        )}
      </div>
    </section>
  );
}
