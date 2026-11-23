import { Brush, Hand, Move, ShieldCheck } from "lucide-react";
import { lazy, Suspense, useId, useState } from "react";

import { useI18n } from "@/shared/lib/i18n";

const LazyPuppetWarpStudioPanel = lazy(() =>
  import("../csp-puppet-warp/PuppetWarpStudioPanel").then((m) => ({
    default: m.PuppetWarpStudioPanel,
  })),
);
const LazyModel3dSurfacePaintPanel = lazy(() =>
  import("../model3d-surface-paint/Model3dSurfacePaintPanel").then((m) => ({
    default: m.Model3dSurfacePaintPanel,
  })),
);
const LazyModel3dHandCustomizerPanel = lazy(() =>
  import("../model3d-hand-customizer/Model3dHandCustomizerPanel").then((m) => ({
    default: m.Model3dHandCustomizerPanel,
  })),
);
const LazyCspWatermarkVelocityPanel = lazy(() =>
  import("../csp-watermark-velocity/CspWatermarkVelocityPanel").then((m) => ({
    default: m.CspWatermarkVelocityPanel,
  })),
);

type Csp3dTabId = "puppet" | "surface3d" | "hand3d" | "watermark";

const CSP3D_TABS: readonly {
  readonly id: Csp3dTabId;
  readonly labelKo: string;
  readonly labelEn: string;
}[] = [
  { id: "puppet", labelKo: "2D 퍼펫 변형 (MLS 강체)", labelEn: "2D Puppet Warp (MLS)" },
  { id: "surface3d", labelKo: "3D 표면 직접 페인팅·4층 UV", labelEn: "3D Surface Paint · 4-Layer UV" },
  { id: "hand3d", labelKo: "15관절 3D 손·가중치·STL·LOD", labelEn: "15-Joint 3D Hand · Weights · STL · LOD" },
  { id: "watermark", labelKo: "비가시 워터마크·속도곡선·경계블러", labelEn: "Anti-AI Watermark · Velocity · Safe Blur" },
];

function Csp3dIcon({ id }: { readonly id: Csp3dTabId }) {
  switch (id) {
    case "puppet":
      return <Move size={15} aria-hidden="true" />;
    case "surface3d":
      return <Brush size={15} aria-hidden="true" />;
    case "hand3d":
      return <Hand size={15} aria-hidden="true" />;
    case "watermark":
      return <ShieldCheck size={15} aria-hidden="true" />;
  }
}

export function Csp3dUpgradeHubPanel() {
  const lang = useI18n((state) => state.lang);
  const isEn = lang === "en";
  const baseId = useId();
  const [active, setActive] = useState<Csp3dTabId>("puppet");

  return (
    <section
      className="flex flex-col gap-3 rounded-2xl border border-line bg-card p-3"
      aria-label={isEn ? "CSP 4.0-5.0 and High-Craft 3D Customizer Hub" : "클립스튜디오 4.0~5.0 내재화 및 고품질 3D 커스텀 허브"}
      data-testid="csp-3d-upgrade-hub-panel"
    >
      <div role="tablist" aria-label={isEn ? "CSP 4-5 and 3D customizer engines" : "CSP 4~5 및 3D 커스텀 엔진 선택"} className="flex flex-wrap gap-2">
        {CSP3D_TABS.map((tab) => {
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
              <Csp3dIcon id={tab.id} />
              <span>{isEn ? tab.labelEn : tab.labelKo}</span>
            </button>
          );
        })}
      </div>

      <div id={`${baseId}-panel-${active}`} role="tabpanel" aria-labelledby={`${baseId}-tab-${active}`}>
        <Suspense
          fallback={
            <p className="p-4 text-xs text-fg-2">
              {isEn ? "Loading 3D & CSP Pro studio engine..." : "3D 커스텀·CSP 프로 엔진을 불러오는 중입니다…"}
            </p>
          }
        >
          {active === "puppet" ? <LazyPuppetWarpStudioPanel /> : null}
          {active === "surface3d" ? <LazyModel3dSurfacePaintPanel /> : null}
          {active === "hand3d" ? <LazyModel3dHandCustomizerPanel /> : null}
          {active === "watermark" ? <LazyCspWatermarkVelocityPanel /> : null}
        </Suspense>
      </div>
    </section>
  );
}
