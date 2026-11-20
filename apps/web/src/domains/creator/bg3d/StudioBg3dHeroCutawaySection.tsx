import { ChevronDown, Eye, Layers, Smartphone } from "lucide-react";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import {
  translateBilingualValueForActiveLocale,
  useBilingualI18nRevision,
} from "@/shared/lib/i18n-bilingual-copy";
import { cn } from "@/shared/lib/utils";

import {
  STUDIO_BG3D_HERO_ALL_ENTRIES,
} from "./studio-bg3d-hero-v2-catalog-entries";
import {
  formatHeroBg3dDeliveryBadgeKo,
  formatHeroBg3dMegabytes,
  getHeroBg3dEntryByAssetId,
  isHeroV1CutawayCapableAsset,
  readBrowserHeroBg3dDeliveryContext,
  resolveHeroBg3dDeliveryAsset,
  type HeroBg3dDeliveryResolution,
  type StudioBg3dHeroSceneEntry,
} from "./studio-bg3d-hero-tier-selector";
import {
  DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  evaluateCameraWallCutaway,
  type Bg3dCutawayCameraInput,
  type Bg3dWallCutawayConfig,
  type Bg3dWallCutawayEvaluation,
} from "./studio-bg3d-wall-cutaway-runtime";

const LazyStudioBg3dWallCutawayToggle = lazy(() =>
  import("./StudioBg3dWallCutawayToggle").then((module) => ({
    default: module.StudioBg3dWallCutawayToggle,
  })),
);

const bi = <TKo, TEn>(ko: TKo, en: TEn): TKo =>
  translateBilingualValueForActiveLocale("StudioBg3dHeroCutawaySection", ko, en);

export interface StudioBg3dWallCutawayChangeEvent {
  readonly assetId: string;
  readonly cutawayCapable: boolean;
  readonly config: Bg3dWallCutawayConfig;
  readonly evaluation: Bg3dWallCutawayEvaluation;
}

export interface StudioBg3dHeroCutawaySectionProps {
  readonly activeAssetId?: string | null;
  readonly camera?: Bg3dCutawayCameraInput | null;
  readonly viewportWidthPx?: number;
  readonly deviceMemoryGb?: number;
  readonly defaultPreferMobileTier?: boolean;
  readonly onSelectHeroAsset?: (resolution: HeroBg3dDeliveryResolution) => void;
  readonly onWallCutawayChange?: (event: StudioBg3dWallCutawayChangeEvent) => void;
}

const DEFAULT_HERO_ENTRY: StudioBg3dHeroSceneEntry = STUDIO_BG3D_HERO_ALL_ENTRIES[0]!;

function readLiveViewportWidth(): number {
  if (typeof window !== "undefined" && Number.isFinite(window.innerWidth) && window.innerWidth > 0) {
    return window.innerWidth;
  }
  return 1280;
}

/**
 * 6종 `hero-v1` 3D 배경의 모바일 경량 GLB 자동 해석(-44% 용량 절감) 및
 * 8노드 앞벽 자동 투명화(`StudioBg3dWallCutawayToggle`)를 기본 접힘 `<details>`로 제공한다.
 */
export function StudioBg3dHeroCutawaySection({
  activeAssetId = null,
  camera = null,
  viewportWidthPx,
  deviceMemoryGb,
  defaultPreferMobileTier = false,
  onSelectHeroAsset,
  onWallCutawayChange,
}: StudioBg3dHeroCutawaySectionProps) {
  useBilingualI18nRevision();
  const [liveViewportWidth, setLiveViewportWidth] = useState<number>(() =>
    viewportWidthPx ?? readLiveViewportWidth(),
  );
  const [disclosureOpen, setDisclosureOpen] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string>(() =>
    activeAssetId && isHeroV1CutawayCapableAsset(activeAssetId)
      ? activeAssetId
      : DEFAULT_HERO_ENTRY.desktopAsset.id,
  );
  const [cameraPresetIndex, setCameraPresetIndex] = useState<number>(0);
  const [preferMobileTier, setPreferMobileTier] = useState<boolean>(defaultPreferMobileTier);
  const [cutawayConfig, setCutawayConfig] = useState<Bg3dWallCutawayConfig>(
    DEFAULT_BG3D_WALL_CUTAWAY_CONFIG,
  );

  useEffect(() => {
    if (viewportWidthPx !== undefined) {
      setLiveViewportWidth(viewportWidthPx);
      return undefined;
    }
    if (typeof window === "undefined") return undefined;
    const handleResize = () => setLiveViewportWidth(readLiveViewportWidth());
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [viewportWidthPx]);

  const effectiveAssetId = activeAssetId && isHeroV1CutawayCapableAsset(activeAssetId)
    ? activeAssetId
    : selectedAssetId;

  const deliveryContext = useMemo(
    () => readBrowserHeroBg3dDeliveryContext({
      viewportWidthPx: viewportWidthPx ?? liveViewportWidth,
      ...(deviceMemoryGb !== undefined ? { deviceMemoryGb } : {}),
      ...(preferMobileTier ? { preferMobileTier: true } : {}),
    }),
    [deviceMemoryGb, liveViewportWidth, preferMobileTier, viewportWidthPx],
  );

  const delivery = useMemo(
    () => resolveHeroBg3dDeliveryAsset(effectiveAssetId, deliveryContext),
    [deliveryContext, effectiveAssetId],
  );

  const activeEntry = delivery.heroEntry
    ?? getHeroBg3dEntryByAssetId(effectiveAssetId)
    ?? DEFAULT_HERO_ENTRY;
  const activeCameraPreset = activeEntry.cameraPresets[cameraPresetIndex] ?? activeEntry.cameraPresets[0];
  const effectiveCamera: Bg3dCutawayCameraInput = camera ?? activeCameraPreset.camera;
  const cutawayCapable = isHeroV1CutawayCapableAsset(effectiveAssetId);

  const roomBounds = useMemo(() => {
    const [width, height, depth] = activeEntry.desktopAsset.bounds;
    return {
      center: [0, height / 2, 0] as const,
      size: [width, height, depth] as const,
    };
  }, [activeEntry.desktopAsset.bounds]);

  const evaluation = useMemo(
    () => evaluateCameraWallCutaway({
      camera: effectiveCamera,
      room: roomBounds,
      config: cutawayConfig,
    }),
    [cutawayConfig, effectiveCamera, roomBounds],
  );

  const handleSelectScene = (entry: StudioBg3dHeroSceneEntry) => {
    setSelectedAssetId(entry.desktopAsset.id);
    setCameraPresetIndex(0);
    const nextResolution = resolveHeroBg3dDeliveryAsset(entry.desktopAsset.id, deliveryContext);
    onSelectHeroAsset?.(nextResolution);
  };

  const handleCutawayChange = (nextConfig: Bg3dWallCutawayConfig) => {
    setCutawayConfig(nextConfig);
    const nextEvaluation = evaluateCameraWallCutaway({
      camera: effectiveCamera,
      room: roomBounds,
      config: nextConfig,
    });
    onWallCutawayChange?.({
      assetId: delivery.asset?.id ?? effectiveAssetId,
      cutawayCapable,
      config: nextConfig,
      evaluation: nextEvaluation,
    });
  };

  const deliveryBadgeLabel = formatHeroBg3dDeliveryBadgeKo(delivery);
  const deliveredUrl = delivery.asset?.url ?? activeEntry.desktopAsset.url;

  return (
    <div className="shrink-0 border-b border-line bg-panel px-2.5 py-1.5">
      <details
        data-testid="bg3d-wall-cutaway-disclosure"
        data-bg3d-delivery-tier={delivery.tier}
        data-bg3d-delivery-url={deliveredUrl}
        data-bg3d-saved-bytes={delivery.savedBytes}
        data-bg3d-saved-percent={delivery.savedPercent}
        data-bg3d-cutaway-capable={cutawayCapable ? "true" : "false"}
        data-bg3d-cutaway-hidden-count={evaluation.hiddenWalls.length}
        className="group rounded-xl border border-line bg-card text-fg"
        onToggle={(event) => setDisclosureOpen(event.currentTarget.open)}
      >
        <summary
          data-testid="bg3d-wall-cutaway-summary"
          className="flex min-h-11 cursor-pointer list-none flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs font-semibold text-fg transition-colors hover:bg-raised focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent [word-break:keep-all]"
        >
          <span className="inline-flex min-w-0 items-center gap-2">
            <Eye size={14} className="shrink-0 text-accent" aria-hidden="true" />
            <span>{bi("앞벽 자동 투명화 · 히어로 배경", "Auto wall cutaway & hero scenes")}</span>
            <span className="hidden text-fg-3 sm:inline">·</span>
            <span className="hidden truncate font-medium text-fg-2 sm:inline">
              {evaluation.summaryKo}
            </span>
          </span>
          <span className="inline-flex flex-wrap items-center gap-1.5">
            <span
              data-testid="bg3d-hero-delivery-badge"
              className={cn(
                "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium tabular-nums",
                delivery.tier === "mobile"
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-line bg-raised text-fg-2",
              )}
            >
              {delivery.tier === "mobile" ? <Smartphone size={12} aria-hidden="true" /> : <Layers size={12} aria-hidden="true" />}
              <span>{deliveryBadgeLabel}</span>
            </span>
            <ChevronDown
              size={14}
              aria-hidden="true"
              className="shrink-0 text-fg-3 transition-transform duration-150 group-open:rotate-180 motion-reduce:transition-none"
            />
          </span>
        </summary>

        {disclosureOpen ? (
          <div className="grid gap-3 border-t border-line bg-panel/60 p-3 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
            <section
              aria-label={bi("히어로 3D 배경 전송 티어", "Hero 3D background delivery tier")}
              data-testid="bg3d-hero-delivery-panel"
              className="flex flex-col gap-2.5 rounded-lg border border-line bg-card p-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0 [word-break:keep-all]">
                  <p className="text-xs font-semibold text-fg">
                    {bi("12종 히어로 배경 · 자동 경량 선택", "12 hero scenes · auto lightweight tier")}
                  </p>
                  <p className="mt-0.5 text-xs text-fg-3 tabular-nums">
                    {delivery.tier === "mobile"
                      ? `모바일 4노드 적용 중 · ${formatHeroBg3dMegabytes(delivery.deliveredByteSize)} (원본 ${formatHeroBg3dMegabytes(delivery.desktopByteSize)} 대비 -${delivery.savedPercent.toFixed(1)}%)`
                      : `데스크톱 8노드 적용 중 · ${formatHeroBg3dMegabytes(delivery.deliveredByteSize)}`}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="bg3d-hero-prefer-mobile-toggle"
                  aria-pressed={preferMobileTier}
                  onClick={() => setPreferMobileTier((current) => !current)}
                  className={cn(
                    "inline-flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-xs font-semibold transition-colors [word-break:keep-all]",
                    preferMobileTier
                      ? "border-accent bg-accent-soft text-accent"
                      : "border-line bg-raised text-fg-2 hover:border-accent/60 hover:text-fg",
                  )}
                >
                  <Smartphone size={13} aria-hidden="true" />
                  <span>{bi("경량본 우선", "Prefer mobile GLB")}</span>
                </button>
              </div>

              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {STUDIO_BG3D_HERO_ALL_ENTRIES.map((entry) => {
                  const isSelected = entry.slug === activeEntry.slug;
                  const sceneDelivery = resolveHeroBg3dDeliveryAsset(entry.desktopAsset.id, deliveryContext);
                  return (
                    <button
                      key={entry.slug}
                      type="button"
                      data-testid={`bg3d-hero-scene-${entry.slug}`}
                      data-delivery-url={sceneDelivery.asset?.url ?? entry.desktopAsset.url}
                      aria-pressed={isSelected}
                      onClick={() => handleSelectScene(entry)}
                      className={cn(
                        "flex min-h-11 flex-col items-start justify-center rounded-lg border px-3 py-2 text-left transition-colors [word-break:keep-all]",
                        isSelected
                          ? "border-accent bg-accent-soft/60 text-fg"
                          : "border-line bg-panel text-fg-2 hover:border-accent/55 hover:bg-raised hover:text-fg",
                      )}
                    >
                      <span className="text-xs font-semibold text-fg">{entry.labelKo}</span>
                      <span className="mt-0.5 text-xs text-fg-3 tabular-nums">
                        {sceneDelivery.tier === "mobile"
                          ? `${formatHeroBg3dMegabytes(sceneDelivery.deliveredByteSize)} · -${sceneDelivery.savedPercent.toFixed(1)}% 절감`
                          : `${formatHeroBg3dMegabytes(sceneDelivery.deliveredByteSize)} · 8노드 컷어웨이`}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div
                role="group"
                aria-label={bi("히어로 배경 카메라 시점", "Hero scene camera viewpoints")}
                className="flex flex-wrap items-center gap-1.5 border-t border-line pt-2"
              >
                {activeEntry.cameraPresets.map((preset, index) => (
                  <button
                    key={preset.id}
                    type="button"
                    aria-pressed={cameraPresetIndex === index}
                    onClick={() => setCameraPresetIndex(index)}
                    className={cn(
                      "inline-flex min-h-11 items-center rounded-lg border px-3 text-xs font-medium transition-colors [word-break:keep-all]",
                      cameraPresetIndex === index
                        ? "border-accent bg-accent-soft text-accent"
                        : "border-line bg-raised text-fg-2 hover:border-accent/55 hover:text-fg",
                    )}
                  >
                    {preset.labelKo}
                  </button>
                ))}
              </div>
            </section>

            <Suspense
              fallback={(
                <div
                  role="status"
                  className="flex min-h-11 items-center rounded-lg border border-line bg-card px-3 py-2 text-xs text-fg-3"
                >
                  {bi("앞벽 투명화 도구를 불러오는 중…", "Loading wall cutaway controls…")}
                </div>
              )}
            >
              <LazyStudioBg3dWallCutawayToggle
                config={cutawayConfig}
                evaluation={evaluation}
                availableRoles={activeEntry.cutawayEnabledWalls}
                disabled={!cutawayCapable}
                onChange={handleCutawayChange}
              />
            </Suspense>
          </div>
        ) : null}
      </details>
    </div>
  );
}
