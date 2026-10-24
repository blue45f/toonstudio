import { useState } from "react";

import {
  STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1,
  STUDIO_BG3D_ENVIRONMENT_ASSETS_V6,
  STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES,
  buildStudioBg3dCyclesCompositorLayerPlan,
  getStudioBg3dEnvironmentCyclesPasses,
  resolveStudioBg3dCc0CounterpartEnvironment,
  type StudioBg3dCyclesCompositorLayerDescriptor,
  type StudioBg3dEnvironmentAsset,
  type StudioBg3dEnvironmentTheme,
} from "./studio-bg3d-environment-catalog";

import { cx } from "@/shared/lib/cx";

export interface StudioBg3dAuthoredEnvironmentCyclesPanelProps {
  readonly disabled?: boolean;
  readonly defaultExpanded?: boolean;
  readonly onAdd: (id: string) => void;
}

type PanelTab = "authored-v1" | "cycles-v6";
type CyclesPassKey = StudioBg3dCyclesCompositorLayerDescriptor["pass"];

const THEME_LABELS_KO: Readonly<Record<StudioBg3dEnvironmentTheme, string>> = Object.freeze({
  home: "주거·실내",
  hospitality: "카페·로비",
  urban: "도시·거리",
  education: "학교·캠퍼스",
  healthcare: "병원·의료",
  heritage: "전통·한옥",
  retail: "상점·매장",
  transit: "교통·역사",
  fantasy: "판타지",
  "science-fiction": "SF·연구소",
});

const AUTHORED_THEMES: readonly StudioBg3dEnvironmentTheme[] = Object.freeze(
  Array.from(new Set(STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1.map((asset) => asset.theme))),
);

const PASS_LABELS_KO: Readonly<Record<CyclesPassKey, string>> = Object.freeze({
  beauty: "Beauty (컬러 원화)",
  ao: "AO (접촉 그림자)",
  normal: "Normal (법선 조명 가이드)",
  depth: "Depth (깊이 안개 가이드)",
});

function formatKilobytes(bytes: number): string {
  return `${Math.round(bytes / 1024).toLocaleString("ko-KR")}KB`;
}

export function StudioBg3dAuthoredEnvironmentCyclesPanel({
  disabled = false,
  defaultExpanded = false,
  onAdd,
}: StudioBg3dAuthoredEnvironmentCyclesPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [activeTab, setActiveTab] = useState<PanelTab>("authored-v1");
  const [themeFilter, setThemeFilter] = useState<StudioBg3dEnvironmentTheme | "all">("all");
  const [selectedV6Id, setSelectedV6Id] = useState<string>(
    STUDIO_BG3D_ENVIRONMENT_ASSETS_V6[0]?.id ?? "ts-bg3d-compact_apartment_interior-v6",
  );
  const [activePass, setActivePass] = useState<CyclesPassKey>("beauty");
  const [lastAddedId, setLastAddedId] = useState<string | null>(null);

  const visibleAuthoredAssets = STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1.filter(
    (asset) => themeFilter === "all" || asset.theme === themeFilter,
  );

  const selectedV6Asset: StudioBg3dEnvironmentAsset | undefined =
    STUDIO_BG3D_ENVIRONMENT_ASSETS_V6.find((asset) => asset.id === selectedV6Id) ??
    STUDIO_BG3D_ENVIRONMENT_ASSETS_V6[0];

  const selectedCyclesPasses = selectedV6Asset
    ? getStudioBg3dEnvironmentCyclesPasses(selectedV6Asset.id)
    : null;
  const compositorPlan = selectedV6Asset
    ? buildStudioBg3dCyclesCompositorLayerPlan(selectedV6Asset.id)
    : null;
  const activeLayerDescriptor =
    compositorPlan?.find((layer) => layer.pass === activePass) ?? compositorPlan?.[0] ?? null;

  const handleAddEnvironment = (environmentId: string) => {
    if (disabled) return;
    setLastAddedId(environmentId);
    onAdd(environmentId);
  };

  return (
    <section
      data-testid="bg3d-authored-cycles-panel"
      aria-label="자체 제작 CC0 웹툰 배경 및 V6 Cycles 멀티패스 레퍼런스"
      className="mt-3 rounded-xl border border-line bg-card/60 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4 className="text-xs font-bold text-fg">
            자체 제작 CC0 웹툰 배경 ({STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1.length}종) · V6 Cycles 멀티패스 ({STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES.length}세트 · 48패스)
          </h4>
          <p className="mt-0.5 text-[0.62rem] text-fg-3">
            상업 배포 안전 CC0-1.0 환경 총 {STUDIO_BG3D_CC0_ENVIRONMENT_ASSETS.length}종 · Blender Cycles Beauty/AO/Normal/Depth 2D 합성 플랜
          </p>
        </div>
        <button
          type="button"
          disabled={disabled}
          aria-expanded={expanded}
          data-testid="bg3d-authored-cycles-toggle"
          onClick={() => setExpanded((prev) => !prev)}
          className="shrink-0 rounded-lg border border-line bg-panel px-2.5 py-1 text-[0.64rem] font-semibold text-fg-2 transition-colors hover:bg-raised hover:text-fg disabled:opacity-45"
        >
          {expanded ? "패널 접기" : "CC0 배경·멀티패스 열기"}
        </button>
      </div>

      {expanded ? (
        <div className="mt-2.5 space-y-2.5 border-t border-line/70 pt-2.5">
          {/* Mode Tabs */}
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="CC0 배경 및 멀티패스 탭">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "authored-v1"}
              data-testid="bg3d-tab-authored-v1"
              onClick={() => setActiveTab("authored-v1")}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-[0.64rem] font-bold transition-colors",
                activeTab === "authored-v1"
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              자체 제작 CC0 웹툰 배경 ({STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1.length}종)
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "cycles-v6"}
              data-testid="bg3d-tab-cycles-v6"
              onClick={() => setActiveTab("cycles-v6")}
              className={cx(
                "rounded-lg border px-2.5 py-1 text-[0.64rem] font-bold transition-colors",
                activeTab === "cycles-v6"
                  ? "border-accent/60 bg-accent-soft text-accent"
                  : "border-line bg-panel text-fg-2 hover:bg-raised hover:text-fg",
              )}
            >
              V6 Cycles 멀티패스 합성 가이드 ({STUDIO_BG3D_ENVIRONMENT_CYCLES_PASSES.length}종 · 48 PNG)
            </button>
          </div>

          {activeTab === "authored-v1" ? (
            <div className="space-y-2" data-testid="bg3d-authored-v1-section">
              <div className="flex flex-wrap gap-1" role="group" aria-label="자체 제작 CC0 배경 테마 필터">
                <button
                  type="button"
                  aria-pressed={themeFilter === "all"}
                  data-testid="bg3d-authored-theme-all"
                  onClick={() => setThemeFilter("all")}
                  className={cx(
                    "rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold transition-colors",
                    themeFilter === "all"
                      ? "border-accent/60 bg-accent-soft text-accent"
                      : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg",
                  )}
                >
                  전체 ({STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1.length})
                </button>
                {AUTHORED_THEMES.map((themeId) => {
                  const count = STUDIO_BG3D_ENVIRONMENT_ASSETS_AUTHORED_V1.filter(
                    (asset) => asset.theme === themeId,
                  ).length;
                  return (
                    <button
                      key={themeId}
                      type="button"
                      aria-pressed={themeFilter === themeId}
                      data-testid={`bg3d-authored-theme-${themeId}`}
                      onClick={() => setThemeFilter(themeId)}
                      className={cx(
                        "rounded-full border px-2.5 py-0.5 text-[0.6rem] font-semibold transition-colors",
                        themeFilter === themeId
                          ? "border-accent/60 bg-accent-soft text-accent"
                          : "border-line bg-panel text-fg-3 hover:bg-raised hover:text-fg",
                      )}
                    >
                      {THEME_LABELS_KO[themeId]} ({count})
                    </button>
                  );
                })}
              </div>

              <div className="grid max-h-64 grid-cols-2 gap-1.5 overflow-y-auto pr-1">
                {visibleAuthoredAssets.map((asset) => {
                  const counterpart = resolveStudioBg3dCc0CounterpartEnvironment(asset.fileName);
                  return (
                    <article
                      key={asset.id}
                      data-testid={`bg3d-authored-card-${asset.id}`}
                      className="flex flex-col justify-between gap-1.5 rounded-lg border border-line bg-panel p-2"
                    >
                      <div className="flex items-start gap-2">
                        <img
                          src={asset.thumbnailUrl}
                          alt={asset.name}
                          loading="lazy"
                          className="h-12 w-16 shrink-0 rounded border border-line/60 bg-card object-cover"
                        />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[0.64rem] font-bold text-fg">{asset.name}</p>
                          <p className="line-clamp-2 text-[0.55rem] leading-snug text-fg-3">
                            {asset.description}
                          </p>
                          <p className="mt-0.5 text-[0.52rem] text-fg-3">
                            {counterpart?.provenance.license ?? asset.provenance.license} ·{" "}
                            {formatKilobytes(asset.byteSize)} · FOV {asset.camera.fovDegrees}°
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={disabled}
                        data-testid={`bg3d-authored-add-${asset.id}`}
                        onClick={() => handleAddEnvironment(asset.id)}
                        className="w-full rounded border border-accent/50 bg-accent-soft px-2 py-1 text-[0.6rem] font-bold text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
                      >
                        {lastAddedId === asset.id ? "CC0 배경 배치됨" : "CC0 배경 장면에 배치"}
                      </button>
                    </article>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5" data-testid="bg3d-cycles-v6-section">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label
                  htmlFor="bg3d-cycles-v6-select"
                  className="text-[0.62rem] font-semibold text-fg-2"
                >
                  V6 Cycles 멀티패스 대상 환경 (12종)
                </label>
                {selectedV6Asset ? (
                  <button
                    type="button"
                    disabled={disabled}
                    data-testid="bg3d-cycles-v6-add-scene"
                    onClick={() => handleAddEnvironment(selectedV6Asset.id)}
                    className="rounded border border-accent/50 bg-accent-soft px-2.5 py-1 text-[0.6rem] font-bold text-accent transition-colors hover:bg-accent/20 disabled:opacity-45"
                  >
                    {lastAddedId === selectedV6Asset.id
                      ? "V6 3D 환경 배치됨"
                      : `${selectedV6Asset.name} 3D 장면에 배치`}
                  </button>
                ) : null}
              </div>

              <select
                id="bg3d-cycles-v6-select"
                data-testid="bg3d-cycles-v6-select"
                value={selectedV6Asset?.id ?? ""}
                onChange={(event) => setSelectedV6Id(event.target.value)}
                className="w-full rounded-lg border border-line bg-panel px-2.5 py-1.5 text-xs text-fg"
              >
                {STUDIO_BG3D_ENVIRONMENT_ASSETS_V6.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.name} ({asset.fileName.replace(/\.glb$/u, "")})
                  </option>
                ))}
              </select>

              {selectedCyclesPasses && compositorPlan && activeLayerDescriptor ? (
                <div className="space-y-2 rounded-lg border border-line bg-panel p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-1 text-[0.58rem] text-fg-3">
                    <span>
                      엔진: <strong className="text-fg">{selectedCyclesPasses.engine}</strong> ·{" "}
                      해상도: {selectedCyclesPasses.resolution[0]}×{selectedCyclesPasses.resolution[1]} ·{" "}
                      샘플: {selectedCyclesPasses.samples}spp
                    </span>
                    <span>
                      Depth [{selectedCyclesPasses.depthRange[0]}m~{selectedCyclesPasses.depthRange[1]}m] ·{" "}
                      Normal [{selectedCyclesPasses.normalRange[0]}~{selectedCyclesPasses.normalRange[1]}]
                    </span>
                  </div>

                  {/* Pass Selector Buttons */}
                  <div className="grid grid-cols-2 gap-1 sm:grid-cols-4" role="group" aria-label="Cycles 렌더 패스 전환">
                    {compositorPlan.map((layer) => (
                      <button
                        key={layer.pass}
                        type="button"
                        aria-pressed={activePass === layer.pass}
                        data-testid={`bg3d-cycles-pass-btn-${layer.pass}`}
                        onClick={() => setActivePass(layer.pass)}
                        className={cx(
                          "rounded border px-2 py-1 text-left text-[0.58rem] transition-colors",
                          activePass === layer.pass
                            ? "border-accent/60 bg-accent-soft font-bold text-accent"
                            : "border-line bg-card text-fg-2 hover:bg-raised hover:text-fg",
                        )}
                      >
                        <span className="block truncate">{PASS_LABELS_KO[layer.pass]}</span>
                        <span className="block text-[0.52rem] text-fg-3">
                          {layer.blendMode} · {Math.round(layer.opacity * 100)}% ·{" "}
                          {selectedCyclesPasses.colorDepth[layer.pass]}bit
                        </span>
                      </button>
                    ))}
                  </div>

                  {/* Active Pass Preview Image */}
                  <div
                    data-testid="bg3d-cycles-active-pass-preview"
                    className="overflow-hidden rounded border border-line/70 bg-card"
                  >
                    <img
                      src={activeLayerDescriptor.url}
                      alt={activeLayerDescriptor.label}
                      className="max-h-44 w-full object-contain"
                    />
                    <div className="flex items-center justify-between border-t border-line/60 px-2 py-1 text-[0.56rem] text-fg-3">
                      <span className="font-semibold text-fg">{activeLayerDescriptor.label}</span>
                      <span>
                        블렌드: {activeLayerDescriptor.blendMode} · 기본 불투명도:{" "}
                        {Math.round(activeLayerDescriptor.opacity * 100)}% · 기본 표시:{" "}
                        {activeLayerDescriptor.visible ? "켜짐" : "보조 가이드"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
    </section>
  );
}
