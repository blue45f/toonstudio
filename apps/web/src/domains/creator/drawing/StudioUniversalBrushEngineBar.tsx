import { useEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, ReactElement } from "react";

import {
  applyGlfxFilterSuite,
  applyKlecksFilterAndVanishPointSuite,
  COMPETITOR_FILTER_PRESETS,
  COMPETITOR_QUALITY_BRUSH_PRESETS,
  COMPLETE_ECOSYSTEM_TOOL_PRESETS,
  COREL_PARTICLE_BRUSH_PRESETS,
  encodeCleanRoomBrushQrPayload,
  evaluateBrushLabToServicePromotionTelemetry,
  evaluateCompleteUnfragmentedStudioSummary,
  evaluateKlecksPrecisionSliderMapping,
  evaluateMonolithicTotalEngineTelemetry,
  evaluateMyPaintFullDynamicsStep,
  evaluateSculptGlQuarticFalloff01,
  evaluateStudioHolisticInspectorTelemetry,
  evaluateWebGpuHighSpeedArchitectureTelemetry,
  executeBooleanPolygonBrushClip,
  executeHarmonyProceduralBrush,
  executeKlecksBrushEngineSuite,
  fitSchneiderCubicBezierSpline,
  FREEHAND_ROUGH_BRUSH_PRESETS,
  HARMONY_BRUSH_KINDS,
  HOLISTIC_STUDIO_TOOL_PRESETS,
  IBIS_MEDIBANG_BRUSH_PRESETS,
  KLECKS_BRUSH_PRESETS,
  MONOLITHIC_TOTAL_TOOL_PRESETS,
  MYPAINT_BRUSH_PRESETS,
  queryStrokeSpatialRTreeBBox,
  simplifyStrokePolylineRdp,
  SKELETAL_ART_BRUSH_PRESETS,
  stepCorelPainterParticleBrush,
  stepPhotoshopMixerBrushReservoir,
  synthesizePerfectFreehandStrokeOutline,
  synthesizeRoughSketchyStrokeAndHachureFill,
  traceP5BrushFlowLine,
  warpSkeletalArtBrushAlongSpine,
  WEBGPU_HIGHSPEED_ARCHITECTURE_PRESETS,
  type ComicRibbonStampPresetId,
  type CompetitorFilterPresetId,
  type CompetitorQualityBrushPresetId,
  type CompleteEcosystemToolPresetId,
  type CorelParticlePresetId,
  type FreehandRoughPresetId,
  type HarmonyBrushKind,
  type HolisticLayerBlendMode,
  type HolisticStudioToolPresetId,
  type KlecksPresetId,
  type MonolithicTotalToolPresetId,
  type MyPaintPresetId,
  type SkeletalArtBrushPresetId,
  type WebGpuHighSpeedPresetId,
} from "./studio-universal-brush-taxonomy-engine";

export interface StudioUniversalBrushEngineBarProps {
  readonly tx: (source: string) => string;
}

type EngineWaveDockId = "all" | "wave21" | "wave22" | "wave23" | "wave24" | "wave25" | "wave26" | "wave28" | "wave29" | "wave30" | "wave33" | "wave35";

const ENGINE_WAVE_DOCK_TABS: readonly { readonly id: EngineWaveDockId; readonly labelKo: string }[] = [
  { id: "all", labelKo: "전체 통합 스튜디오" },
  { id: "wave21", labelKo: "절차·웹툰 브러시" },
  { id: "wave22", labelKo: "벡터 골격·입자" },
  { id: "wave23", labelKo: "베지어·자연매체" },
  { id: "wave24", labelKo: "MyPaint·분광안료" },
  { id: "wave25", labelKo: "프리핸드·해칭" },
  { id: "wave26", labelKo: "셰이더 필터·특수효과" },
  { id: "wave28", labelKo: "채우기·레이어·이젤" },
  { id: "wave29", labelKo: "FFD·선택·타이포·어니언" },
  { id: "wave30", labelKo: "만다라·칼레이도·벡터·엘보우" },
  { id: "wave33", labelKo: "WebGPU 초고속·Vello·Indirect" },
  { id: "wave35", labelKo: "브러시랩 최고품질(12)" },
];

const QUICK_W3C_BLEND_MODES: readonly {
  readonly id: HolisticLayerBlendMode;
  readonly labelKo: string;
}[] = [
  { id: "multiply", labelKo: "곱하기 (Multiply)" },
  { id: "screen", labelKo: "스크린 (Screen)" },
  { id: "overlay", labelKo: "오버레이 (Overlay)" },
  { id: "color-dodge", labelKo: "닷지 (Dodge)" },
  { id: "difference", labelKo: "차이 (Diff)" },
  { id: "luminosity", labelKo: "광도 (Luma)" },
];

function handleRovingRadioKeyDown<T>(
  e: KeyboardEvent<HTMLButtonElement>,
  idx: number,
  items: readonly T[],
  onSelect: (item: T) => void,
): void {
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey || items.length === 0) return;
  let nextIdx = -1;
  if (e.key === "ArrowRight" || e.key === "ArrowDown") {
    nextIdx = (idx + 1) % items.length;
  } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
    nextIdx = (idx - 1 + items.length) % items.length;
  } else if (e.key === "Home") {
    nextIdx = 0;
  } else if (e.key === "End") {
    nextIdx = items.length - 1;
  }
  if (nextIdx >= 0) {
    e.preventDefault();
    const target = items[nextIdx];
    if (target !== undefined) {
      onSelect(target);
      const container = e.currentTarget.parentElement;
      const buttons = container?.querySelectorAll<HTMLButtonElement>('[role="radio"]');
      const nextBtn = buttons?.[nextIdx];
      nextBtn?.focus();
      nextBtn?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
    }
  }
}

function radioButtonClassName(isSelected: boolean): string {
  return isSelected
    ? "rounded-full border border-accent bg-accent/20 px-2.5 py-0.5 text-[11px] font-semibold text-fg shadow-xs"
    : "rounded-full border border-line bg-raised/70 px-2.5 py-0.5 text-[11px] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg";
}

function PresetRadioGroup<Id extends string>({
  ariaLabel,
  items,
  selectedId,
  dataAttrName,
  onSelect,
  tx,
  searchQuery = "",
}: {
  readonly ariaLabel: string;
  readonly items: readonly { readonly id: Id; readonly labelKo: string }[];
  readonly selectedId: Id;
  readonly dataAttrName: string;
  readonly onSelect: (id: Id) => void;
  readonly tx: (source: string) => string;
  readonly searchQuery?: string;
}): ReactElement {
  const q = searchQuery.trim().toLowerCase();
  const visibleItems = q
    ? items.filter((p) => p.id === selectedId || p.id.toLowerCase().includes(q) || p.labelKo.toLowerCase().includes(q))
    : items;
  return (
    <div role="radiogroup" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      {visibleItems.map((preset, idx, arr) => {
        const isSelected = preset.id === selectedId;
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={isSelected}
            tabIndex={isSelected ? 0 : -1}
            {...{ [dataAttrName]: preset.id }}
            onClick={() => onSelect(preset.id)}
            onKeyDown={(e) => handleRovingRadioKeyDown(e, idx, arr, (t) => onSelect(t.id))}
            className={radioButtonClassName(isSelected)}
          >
            {tx(preset.labelKo)}
          </button>
        );
      })}
    </div>
  );
}

export function StudioUniversalBrushEngineBar({
  tx,
}: StudioUniversalBrushEngineBarProps): ReactElement {
  const barRef = useRef<HTMLDivElement | null>(null);
  const [activeWaveDock, setActiveWaveDock] = useState<EngineWaveDockId>("all");
  const [quickSearchQuery, setQuickSearchQuery] = useState<string>("");
  const [klecksSlider01, setKlecksSlider01] = useState<number>(0.5);
  const [isKlecksFineMode, setIsKlecksFineMode] = useState<boolean>(false);
  const [selectedHarmonyKind, setSelectedHarmonyKind] = useState<HarmonyBrushKind>("sketchy");
  const [selectedComicRibbonId, setSelectedComicRibbonId] = useState<ComicRibbonStampPresetId>("ribbon-petal-chain");
  const [selectedSkeletalId, setSelectedSkeletalId] = useState<SkeletalArtBrushPresetId>("katana-blade");
  const [selectedParticleId, setSelectedParticleId] = useState<CorelParticlePresetId>("silk-harmonic-spring");
  const [selectedKlecksId, setSelectedKlecksId] = useState<KlecksPresetId>("klecks-blend-watercolor");
  const [selectedMyPaintId, setSelectedMyPaintId] = useState<MyPaintPresetId>("mypaint-spectral-impasto");
  const [selectedFreehandRoughId, setSelectedFreehandRoughId] = useState<FreehandRoughPresetId>("pf-comic-gpen-taper");
  const [selectedCompetitorFilterId, setSelectedCompetitorFilterId] = useState<CompetitorFilterPresetId>("klecks-vanish-point-speedlines");
  const [selectedHolisticToolId, setSelectedHolisticToolId] = useState<HolisticStudioToolPresetId>("holistic-flood-fill-contiguous");
  const [selectedBlendMode, setSelectedBlendMode] = useState<HolisticLayerBlendMode>("multiply");
  const [selectedCompleteEcosystemId, setSelectedCompleteEcosystemId] = useState<CompleteEcosystemToolPresetId>("ecosystem-ffd-lattice-5x5");
  const [selectedMonolithicToolId, setSelectedMonolithicToolId] = useState<MonolithicTotalToolPresetId>("monolithic-kaleidoscope-polar");
  const [monolithicCategoryFilter, setMonolithicCategoryFilter] = useState<"all" | "brush" | "filter" | "vector" | "symmetry" | "whiteboard">("all");
  const [mandalaAxes, setMandalaAxes] = useState<number>(8);
  const [selectedWebGpuHighSpeedId, setSelectedWebGpuHighSpeedId] = useState<WebGpuHighSpeedPresetId>("webgpu-vello-euler-flatten-aa");
  const [webGpuIndirectCullEnabled, setWebGpuIndirectCullEnabled] = useState<boolean>(true);
  const [selectedCompetitorQualityId, setSelectedCompetitorQualityId] = useState<CompetitorQualityBrushPresetId>("brushlab-sumi-dual-tooth-coldpress");
  const [ghostWashFlow01, setGhostWashFlow01] = useState<number>(0.65);

  useEffect(() => {
    const root = barRef.current;
    if (!root) return;
    const onBeforeMatch = (evt: Event): void => {
      const target = evt.target as HTMLElement | null;
      const section = target?.closest<HTMLElement>("[data-studio-wave-section]");
      const waveId = section?.getAttribute("data-studio-wave-section") as EngineWaveDockId | null;
      if (waveId) setActiveWaveDock(waveId);
    };
    root.addEventListener("beforematch", onBeforeMatch);
    return () => root.removeEventListener("beforematch", onBeforeMatch);
  }, []);

  const activeUniversalTelemetry = useMemo(() => {
    const sampleStroke = Array.from({ length: 10 }, (_, idx) => ({
      x: 16 + idx * 14,
      y: 22 + Math.sin(idx * 0.7) * 9,
      pressure01: 0.82,
    }));
    const harmony = executeHarmonyProceduralBrush(selectedHarmonyKind, sampleStroke, { seed: 20261026 });
    const flow = traceP5BrushFlowLine({ presetId: "charcoal", fieldKind: "waves", startX: 20, startY: 20, lengthPx: 72, baseAngleDeg: 18 });
    const ribbonPreset = IBIS_MEDIBANG_BRUSH_PRESETS.find((item) => item.id === selectedComicRibbonId) ?? IBIS_MEDIBANG_BRUSH_PRESETS[0]!;
    const qrPayload = encodeCleanRoomBrushQrPayload({ presetId: ribbonPreset.id, baseDiameterPx: 24, opacity01: 0.9, spacingRatio: ribbonPreset.spacingRatio });
    const mixer = stepPhotoshopMixerBrushReservoir({ wet01: 0.75, load01: 0.65, mix01: 0.7, flow01: 0.88 }, [0.95, 0.82, 0.18], [0.18, 0.45, 0.92], [0.18, 0.45, 0.92]);
    const skeletalSamples = warpSkeletalArtBrushAlongSpine(selectedSkeletalId, sampleStroke, 1);
    const particleSegments = stepCorelPainterParticleBrush({ presetId: selectedParticleId, points: sampleStroke, radiusPx: 18, seed: 20261026 });
    const sculptQuarticMid = evaluateSculptGlQuarticFalloff01(0.5);
    const schneiderFit = fitSchneiderCubicBezierSpline(sampleStroke, 2.5);
    const klecks = executeKlecksBrushEngineSuite({ presetId: selectedKlecksId, points: sampleStroke, seed: 20261026 });
    const myPaintStep = evaluateMyPaintFullDynamicsStep({ presetId: selectedMyPaintId, x: 78, y: 22, pressure01: 0.82, directionAngleDeg: 28, tiltAscensionDeg: 12 });
    const klecksPrecision = evaluateKlecksPrecisionSliderMapping({
      slider01: klecksSlider01, min: 1, max: 120, exponent: 1.6,
      perpendicularDistancePx: isKlecksFineMode ? 110 : 0,
      isFineMode: isKlecksFineMode, swatchRgb01: myPaintStep.outputRgb01,
    });
    const booleanUnion = executeBooleanPolygonBrushClip({
      subject: [{ x: 165, y: 10 }, { x: 188, y: 10 }, { x: 188, y: 32 }, { x: 165, y: 32 }],
      clip: [{ x: 176, y: 14 }, { x: 202, y: 14 }, { x: 202, y: 36 }, { x: 176, y: 36 }],
      operation: "union",
    });
    const pfOutline = synthesizePerfectFreehandStrokeOutline({ presetId: selectedFreehandRoughId, points: sampleStroke });
    const roughSketch = synthesizeRoughSketchyStrokeAndHachureFill({ presetId: selectedFreehandRoughId, strokePoints: sampleStroke.slice(0, 5), seed: 20261026 });
    const rdpSimplified = simplifyStrokePolylineRdp(sampleStroke, 1.6);
    const rbushSpatial = queryStrokeSpatialRTreeBBox({
      items: [
        { id: "stroke-pf", minX: 16, minY: 12, maxX: 142, maxY: 32 },
        { id: "stroke-rough", minX: 120, minY: 8, maxX: 158, maxY: 36 },
      ],
      queryBox: { minX: 100, minY: 10, maxX: 160, maxY: 35 },
    });
    const filterPreset = COMPETITOR_FILTER_PRESETS.find((item) => item.id === selectedCompetitorFilterId) ?? COMPETITOR_FILTER_PRESETS[0]!;
    const glfxEval = applyGlfxFilterSuite({
      centerRgb01: [0.58, 0.42, 0.25],
      neighborSamplesRgb01: [[0.56, 0.43, 0.24], [0.61, 0.4, 0.27]],
      denoiseExponent: filterPreset.engineFamily === "glfx" ? filterPreset.primaryParam : 18,
      lensBlurRadiusPx: 12, lensBlurBrightness: 0.4, lensBlurAngleRad: 0.3,
      sampleX: 44, sampleY: 22, centerX: 32, centerY: 22, halftoneAngleRad: 0.26, halftoneSizePx: 6,
      inkBigAverageRgb01: [0.72, 0.72, 0.72], inkSmallAverageRgb01: [0.42, 0.42, 0.42], inkStrength01: 0.35,
      hexScalePx: 12, warpRadiusPx: 60, swirlAngleRad: 1.2, bulgeStrength: 0.4,
    });
    const klecksFilterEval = applyKlecksFilterAndVanishPointSuite({
      vanishCenterX: 110, vanishCenterY: 22,
      vanishLineCount: filterPreset.id === "klecks-vanish-point-speedlines" ? filterPreset.primaryParam : 16,
      vanishInnerHollowRadiusPx: 14, vanishOuterRayLengthPx: 95,
      distortX: 44, distortY: 22, distortStepSizePx: 4, distortType: 1,
      distortScaleX: 24, distortScaleY: 24, distortStrengthX: 8, distortStrengthY: 6,
      distortPhaseX: 0.25, distortPhaseY: 0.5, pixelRgba01: [0.15, 0.15, 0.15, 1],
      isInvertedToAlpha: true, replaceRgb01: [0.1, 0.2, 0.8],
      tiltStart: { x: 0, y: 22 }, tiltEnd: { x: 220, y: 22 }, tiltBlurRadiusPx: 16, tiltGradientRadiusPx: 48,
    });
    const holisticEval = evaluateStudioHolisticInspectorTelemetry({
      toolPresetId: selectedHolisticToolId,
      blendMode: selectedBlendMode,
      baseRgb01: myPaintStep.outputRgb01,
      strokePoints: sampleStroke,
    });
    const unfragmentedEval = evaluateCompleteUnfragmentedStudioSummary({
      presetId: selectedCompleteEcosystemId,
      sampleX: 44,
      sampleY: 22,
      rgb01: myPaintStep.outputRgb01,
    });
    const monolithicEval = evaluateMonolithicTotalEngineTelemetry({
      presetId: selectedMonolithicToolId,
      strength01: klecksSlider01,
      symmetryAxes: mandalaAxes,
    });
    const webgpuHighSpeedEval = evaluateWebGpuHighSpeedArchitectureTelemetry({
      presetId: selectedWebGpuHighSpeedId,
      indirectCullingEnabled: webGpuIndirectCullEnabled,
      strokeQuality01: klecksSlider01,
    });
    const competitorQualityEval = evaluateBrushLabToServicePromotionTelemetry({
      presetId: selectedCompetitorQualityId,
      impastoRoughness01: klecksSlider01,
      ghostWashFlow01,
      paperTooth01: 0.65,
    });

    const bezierSvgPath = schneiderFit.segments
      .map((seg, i) =>
        i === 0
          ? `M ${seg.p0.x.toFixed(1)} ${seg.p0.y.toFixed(1)} C ${seg.ctrl1.x.toFixed(1)} ${seg.ctrl1.y.toFixed(1)}, ${seg.ctrl2.x.toFixed(1)} ${seg.ctrl2.y.toFixed(1)}, ${seg.p3.x.toFixed(1)} ${seg.p3.y.toFixed(1)}`
          : `C ${seg.ctrl1.x.toFixed(1)} ${seg.ctrl1.y.toFixed(1)}, ${seg.ctrl2.x.toFixed(1)} ${seg.ctrl2.y.toFixed(1)}, ${seg.p3.x.toFixed(1)} ${seg.p3.y.toFixed(1)}`,
      )
      .join(" ");
    const booleanPolygonPoints = booleanUnion.vertices
      .map((v) => `${v.x.toFixed(1)},${v.y.toFixed(1)}`)
      .join(" ");

    return {
      harmony,
      flowCount: flow.length,
      ribbonPreset,
      qrLength: qrPayload.length,
      mixer,
      skeletalCount: skeletalSamples.length,
      particleSegments: particleSegments.slice(0, 12),
      particleSegmentCount: particleSegments.length,
      sculptQuarticMid,
      schneiderSegmentCount: schneiderFit.segments.length,
      klecksDabCount: klecks.dabCount,
      myPaintStep,
      klecksPrecision,
      booleanUnionVertexCount: booleanUnion.vertices.length,
      pfOutline,
      roughHachureSegments: roughSketch.hachureSegments.slice(0, 14),
      roughHachureTotalCount: roughSketch.hachureSegments.length,
      rdpPointCount: rdpSimplified.length,
      rbushHitCount: rbushSpatial.matchedIds.length,
      vanishRays: klecksFilterEval.vanishPointRays.slice(0, 16),
      vanishRayTotalCount: klecksFilterEval.vanishPointRays.length,
      halftoneCmykSum: glfxEval.halftoneCmyk01.reduce((a, b) => a + b, 0),
      floodFillCount: holisticEval.floodFillCount,
      curveLutMid: holisticEval.curveLutMid,
      dirtyTileCount: holisticEval.dirtyTileCount,
      ffdDisplacementPx: unfragmentedEval.ffdDisplacementPx,
      onionSkinAlpha01: unfragmentedEval.onionSkinAlpha01,
      monolithicEval,
      webgpuHighSpeedEval,
      competitorQualityEval,
      bezierSvgPath,
      booleanPolygonPoints,
    };
  }, [
    selectedHarmonyKind, selectedComicRibbonId, selectedSkeletalId, selectedParticleId,
    selectedKlecksId, selectedMyPaintId, selectedFreehandRoughId, selectedCompetitorFilterId,
    selectedHolisticToolId, selectedBlendMode, selectedCompleteEcosystemId, selectedMonolithicToolId,
    mandalaAxes, klecksSlider01, isKlecksFineMode, selectedWebGpuHighSpeedId, webGpuIndirectCullEnabled,
    selectedCompetitorQualityId, ghostWashFlow01,
  ]);

  const supportsBeforeMatch =
    typeof HTMLElement === "undefined" || "onbeforematch" in HTMLElement.prototype;
  const hasQuickSearch = quickSearchQuery.trim().length > 0;
  const showWave = (wave: EngineWaveDockId): boolean =>
    hasQuickSearch || activeWaveDock === "all" || activeWaveDock === wave || !supportsBeforeMatch;
  const hiddenUntilFound = (wave: EngineWaveDockId): boolean | undefined =>
    showWave(wave) ? undefined : ("until-found" as unknown as boolean);

  return (
    <div
      ref={barRef}
      style={{ containerType: "inline-size" }}
      className="studio-universal-engine-container @container mt-3 rounded-2xl border border-line bg-card/75 px-3.5 py-2.5 shadow-xs backdrop-blur-md"
      data-studio-universal-brush-bar="true"
    >
      <style>{`
        .studio-universal-engine-title { font-size: clamp(0.6875rem, 0.55rem + 1.4vw, 0.875rem); }
        @supports (font-size: 1cqi) {
          .studio-universal-engine-title { font-size: clamp(0.6875rem, 0.55rem + 1.4cqi, 0.875rem); }
        }
        .studio-universal-inspector-grid { display: flex; flex-direction: column; gap: 0.5rem; }
        @media (min-width: 640px) {
          .studio-universal-inspector-grid { flex-direction: row; align-items: center; justify-content: space-between; }
        }
        @supports (container-type: inline-size) {
          @media (min-width: 640px) {
            .studio-universal-inspector-grid { flex-direction: column; align-items: stretch; }
          }
          @container (min-width: 520px) {
            .studio-universal-inspector-grid { flex-direction: row; align-items: center; justify-content: space-between; }
          }
        }
      `}</style>

      {/* Wave 27 & 31: 워크스페이스 도크 탭 + 통합 퀵서치 필터 + Klecks 비선형 정밀 슬라이더 HUD */}
      <div
        className="mb-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-line/60 pb-2"
        data-studio-klecks-precision-hud="true"
      >
        <div
          role="group"
          aria-label={tx("범용 브러시 워크스페이스 도크 필터")}
          className="flex flex-wrap items-center gap-1"
        >
          {ENGINE_WAVE_DOCK_TABS.map((tab) => {
            const active = activeWaveDock === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                aria-pressed={active}
                data-studio-engine-wave-filter={tab.id}
                onClick={() => setActiveWaveDock(tab.id)}
                className={
                  active
                    ? "rounded-lg border border-accent bg-accent/20 px-2 py-0.5 text-[10px] font-bold text-fg"
                    : "rounded-lg border border-line/70 bg-raised/50 px-2 py-0.5 text-[10px] font-medium text-fg-2 transition-colors hover:bg-raised hover:text-fg"
                }
              >
                {tx(tab.labelKo)}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-line/70 bg-raised/50 px-2.5 py-1 text-[10px] text-fg-2">
          <input
            type="search"
            value={quickSearchQuery}
            onChange={(e) => setQuickSearchQuery(e.target.value)}
            placeholder={tx("전 기능 브러시·필터·PSD·색차 검색...")}
            aria-label={tx("전 기능 통합 브러시·필터 빠른 검색")}
            data-studio-monolithic-quick-search="true"
            className="w-36 rounded-md border border-line bg-card/80 px-2 py-0.5 text-[10px] text-fg placeholder:text-fg-3 focus:border-accent focus:outline-hidden"
          />
          <label className="inline-flex items-center gap-1.5">
            <span className="font-semibold text-accent">{tx("Klecks 비선형 곡선 크기")}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={klecksSlider01}
              onChange={(e) => setKlecksSlider01(Number(e.target.value))}
              data-studio-precision-slider="size"
              aria-label={tx("Klecks 비선형 곡선 브러시 크기 슬라이더")}
              className="h-1.5 w-20 cursor-pointer accent-accent"
            />
          </label>
          <span className="font-mono font-semibold text-fg" data-studio-precision-readout="true">
            {activeUniversalTelemetry.klecksPrecision.formattedDisplayValue}px
          </span>
          <button
            type="button"
            aria-pressed={isKlecksFineMode}
            data-studio-precision-fine-toggle="true"
            onClick={() => setIsKlecksFineMode((v) => !v)}
            className={
              isKlecksFineMode
                ? "rounded-md border border-accent bg-accent/25 px-1.5 py-0.5 font-mono text-[10px] font-bold text-fg"
                : "rounded-md border border-line bg-card/70 px-1.5 py-0.5 font-mono text-[10px] text-fg-3 hover:text-fg"
            }
          >
            {tx("수직 감쇠")}: {activeUniversalTelemetry.klecksPrecision.falloffFactor.toFixed(2)}×
          </button>
        </div>
      </div>

      <div data-studio-wave-section="wave21" hidden={hiddenUntilFound("wave21")}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="studio-universal-engine-title font-bold text-accent">
            {tx("범용 브러시 엔진 (Harmony 11 · 웹툰 리본):")}
          </span>
          <div
            role="radiogroup"
            aria-label={tx("Harmony 절차적 브러시 모드")}
            className="flex flex-wrap items-center gap-1.5"
          >
            {HARMONY_BRUSH_KINDS.map((kind, idx) => {
              const isSelected = kind === selectedHarmonyKind;
              return (
                <button
                  key={kind}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={isSelected ? 0 : -1}
                  data-studio-harmony-kind={kind}
                  onClick={() => setSelectedHarmonyKind(kind)}
                  onKeyDown={(e) =>
                    handleRovingRadioKeyDown(e, idx, HARMONY_BRUSH_KINDS, setSelectedHarmonyKind)
                  }
                  className={radioButtonClassName(isSelected)}
                >
                  {kind}
                </button>
              );
            })}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("웹툰 리본·멀티스탬프:")}</span>
          <PresetRadioGroup ariaLabel={tx("웹툰 리본 및 스탬프 브러시 프리셋")} items={IBIS_MEDIBANG_BRUSH_PRESETS.slice(11, 17)} selectedId={selectedComicRibbonId} dataAttrName="data-studio-comic-ribbon" onSelect={setSelectedComicRibbonId} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave22" hidden={hiddenUntilFound("wave22")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("벡터 골격·입자 물리:")}</span>
          <PresetRadioGroup ariaLabel={tx("벡터 골격 아트 브러시 프리셋")} items={SKELETAL_ART_BRUSH_PRESETS.slice(0, 4)} selectedId={selectedSkeletalId} dataAttrName="data-studio-skeletal-brush" onSelect={setSelectedSkeletalId} tx={tx} searchQuery={quickSearchQuery} />
          <PresetRadioGroup ariaLabel={tx("Corel 입자 물리 브러시 프리셋")} items={COREL_PARTICLE_BRUSH_PRESETS.slice(0, 3)} selectedId={selectedParticleId} dataAttrName="data-studio-particle-brush" onSelect={setSelectedParticleId} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave23" hidden={hiddenUntilFound("wave23")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("베지어 피팅·Klecks 자연매체:")}</span>
          <PresetRadioGroup ariaLabel={tx("Klecks 6종 및 베지어 곡선 브러시 프리셋")} items={KLECKS_BRUSH_PRESETS.slice(4, 10)} selectedId={selectedKlecksId} dataAttrName="data-studio-klecks-preset" onSelect={setSelectedKlecksId} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave24" hidden={hiddenUntilFound("wave24")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("MyPaint 46설정·38밴드 분광:")}</span>
          <PresetRadioGroup ariaLabel={tx("MyPaint 46설정 및 38밴드 분광 브러시 프리셋")} items={MYPAINT_BRUSH_PRESETS.slice(0, 6)} selectedId={selectedMyPaintId} dataAttrName="data-studio-mypaint-preset" onSelect={setSelectedMyPaintId} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave25" hidden={hiddenUntilFound("wave25")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("프리핸드 윤곽·Rough 해칭·공간 인덱스:")}</span>
          <PresetRadioGroup ariaLabel={tx("프리핸드 윤곽 및 Rough 해칭 프리셋")} items={FREEHAND_ROUGH_BRUSH_PRESETS.slice(0, 6)} selectedId={selectedFreehandRoughId} dataAttrName="data-studio-freehand-rough-preset" onSelect={setSelectedFreehandRoughId} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave26" hidden={hiddenUntilFound("wave26")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("셰이더 필터·집중선·하프톤:")}</span>
          <PresetRadioGroup ariaLabel={tx("경쟁사 필터 및 집중선·하프톤 프리셋")} items={COMPETITOR_FILTER_PRESETS.slice(0, 6)} selectedId={selectedCompetitorFilterId} dataAttrName="data-studio-competitor-filter-preset" onSelect={setSelectedCompetitorFilterId} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave28" hidden={hiddenUntilFound("wave28")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("채우기·변형·W3C 레이어·이젤:")}</span>
          <PresetRadioGroup ariaLabel={tx("통합 드로잉 파이프라인 도구 프리셋")} items={HOLISTIC_STUDIO_TOOL_PRESETS.slice(0, 6)} selectedId={selectedHolisticToolId} dataAttrName="data-studio-holistic-tool-preset" onSelect={setSelectedHolisticToolId} tx={tx} searchQuery={quickSearchQuery} />
          <PresetRadioGroup ariaLabel={tx("W3C 16모드 레이어 합성 블렌드 모드")} items={QUICK_W3C_BLEND_MODES} selectedId={selectedBlendMode} dataAttrName="data-studio-holistic-blend-mode" onSelect={setSelectedBlendMode} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave29" hidden={hiddenUntilFound("wave29")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("FFD 메쉬워프·다중선택·타이포·어니언스킨:")}</span>
          <PresetRadioGroup ariaLabel={tx("전 생태계 비분할 통합 도구 프리셋")} items={COMPLETE_ECOSYSTEM_TOOL_PRESETS.slice(0, 7)} selectedId={selectedCompleteEcosystemId} dataAttrName="data-studio-complete-ecosystem-preset" onSelect={setSelectedCompleteEcosystemId} tx={tx} searchQuery={quickSearchQuery} />
        </div>
      </div>

      <div data-studio-wave-section="wave30" hidden={hiddenUntilFound("wave30")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("만다라·칼레이도·Catmull벡터·PSD·색차·선화:")}</span>
          <div className="inline-flex flex-wrap items-center gap-1" role="group" aria-label={tx("모놀리식 도구 카테고리 필터")}>
            {(["all", "brush", "filter", "vector", "symmetry", "whiteboard"] as const).map((cat) => (
              <button
                key={cat}
                type="button"
                data-studio-monolithic-category-filter={cat}
                aria-pressed={monolithicCategoryFilter === cat}
                onClick={() => setMonolithicCategoryFilter(cat)}
                className={`rounded border px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
                  monolithicCategoryFilter === cat ? "border-accent bg-accent/20 text-fg" : "border-line/70 bg-canvas text-fg-3"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          <PresetRadioGroup
            ariaLabel={tx("767모듈 모놀리식 총망라 도구 프리셋")}
            items={
              monolithicCategoryFilter === "all"
                ? MONOLITHIC_TOTAL_TOOL_PRESETS
                : MONOLITHIC_TOTAL_TOOL_PRESETS.filter(
                    (item) => item.category === monolithicCategoryFilter || item.id === selectedMonolithicToolId,
                  )
            }
            selectedId={selectedMonolithicToolId}
            dataAttrName="data-studio-monolithic-tool-preset"
            onSelect={setSelectedMonolithicToolId}
            tx={tx}
            searchQuery={quickSearchQuery}
          />
          <button
            type="button"
            data-studio-mandala-axes-toggle="true"
            onClick={() => setMandalaAxes((prev) => (prev >= 16 ? 4 : prev + 4))}
            className="rounded-md border border-accent/60 bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-fg"
          >
            {tx("만다라 대칭축")}: {mandalaAxes}× ({activeUniversalTelemetry.monolithicEval.mandalaSymmetricCopyCount})
          </button>
        </div>
      </div>

      <div data-studio-wave-section="wave33" hidden={hiddenUntilFound("wave33")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("WebGPU 초고속·Vello·Indirect·RenderBundle·WASM:")}</span>
          <PresetRadioGroup
            ariaLabel={tx("WebGPU 초고속 아키텍처 브러시 프리셋")}
            items={WEBGPU_HIGHSPEED_ARCHITECTURE_PRESETS}
            selectedId={selectedWebGpuHighSpeedId}
            dataAttrName="data-studio-webgpu-highspeed-preset"
            onSelect={setSelectedWebGpuHighSpeedId}
            tx={tx}
            searchQuery={quickSearchQuery}
          />
          <button
            type="button"
            data-studio-webgpu-indirect-toggle="true"
            aria-pressed={webGpuIndirectCullEnabled}
            onClick={() => setWebGpuIndirectCullEnabled((prev) => !prev)}
            className="rounded-md border border-accent/60 bg-accent/15 px-2 py-0.5 font-mono text-[10px] font-semibold text-fg"
          >
            {tx("GPU Indirect 컬링")}: {webGpuIndirectCullEnabled ? "ON" : "OFF"} ({activeUniversalTelemetry.webgpuHighSpeedEval.indirectVisibleInstances}/{activeUniversalTelemetry.webgpuHighSpeedEval.indirectDrawCalls}콜)
          </button>
        </div>
      </div>

      <div data-studio-wave-section="wave35" hidden={hiddenUntilFound("wave35")}>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-fg-2">{tx("브러시랩 승격 최고품질(3D유화·GGX·와류수채·GhostWash·베지어):")}</span>
          <PresetRadioGroup
            ariaLabel={tx("브러시랩 승격 경쟁사 최고품질 브러시 프리셋")}
            items={COMPETITOR_QUALITY_BRUSH_PRESETS}
            selectedId={selectedCompetitorQualityId}
            dataAttrName="data-studio-competitor-quality-preset"
            onSelect={setSelectedCompetitorQualityId}
            tx={tx}
            searchQuery={quickSearchQuery}
          />
          <label className="inline-flex items-center gap-1 rounded-md border border-line/70 bg-raised/60 px-2 py-0.5 text-[10px] text-fg-2">
            <span className="font-semibold text-accent">{tx("GhostWash 유량")}</span>
            <input
              type="range"
              min={0.1}
              max={1}
              step={0.05}
              value={ghostWashFlow01}
              onChange={(e) => setGhostWashFlow01(Number(e.target.value))}
              data-studio-ghost-wash-flow-slider="true"
              aria-label={tx("Tegaki Ghost-Buffer 무탁점 유량 슬라이더")}
              className="h-1.5 w-16 cursor-pointer accent-accent"
            />
            <span className="font-mono text-fg" data-studio-ghost-wash-readout="true">
              {Math.round(ghostWashFlow01 * 100)}%
            </span>
          </label>
        </div>
      </div>

      <div className="studio-universal-inspector-grid mt-2.5 rounded-xl border border-line/70 bg-raised/40 px-2.5 py-1.5">
        <svg
          viewBox="0 0 220 44"
          className="h-9 w-52 shrink-0 rounded-lg border border-line/60 bg-canvas/80"
          style={{ aspectRatio: "5 / 1" }}
          aria-label={tx("범용 브러시 다중 레이어 실시간 스트로크 프리뷰")}
          data-studio-universal-brush-svg-preview="true"
        >
          {activeUniversalTelemetry.vanishRays.map((ray, idx) => (
            <line key={`v-${idx}`} x1={ray.x1} y1={ray.y1} x2={ray.x2} y2={ray.y2} className="text-fg-3" stroke="currentColor" strokeWidth={0.55} strokeOpacity={0.35} />
          ))}
          {activeUniversalTelemetry.pfOutline.svgPolygonPath ? (
            <path d={activeUniversalTelemetry.pfOutline.svgPolygonPath} className="text-warn" fill="currentColor" fillOpacity={0.22} stroke="currentColor" strokeWidth={0.7} />
          ) : null}
          {activeUniversalTelemetry.roughHachureSegments.map((seg, idx) => (
            <line key={`r-${idx}`} x1={seg.x1} y1={seg.y1} x2={seg.x2} y2={seg.y2} className="text-warn" stroke="currentColor" strokeWidth={0.85} strokeOpacity={0.65} />
          ))}
          {activeUniversalTelemetry.harmony.primitives.slice(0, 18).map((prim, idx) => (
            <line key={`h-${idx}`} x1={prim.x0} y1={prim.y0} x2={prim.x1} y2={prim.y1} stroke="currentColor" strokeWidth={1.1} strokeOpacity={Math.max(0.25, prim.alpha01)} />
          ))}
          {activeUniversalTelemetry.particleSegments.map((seg, idx) => (
            <line key={`p-${idx}`} x1={seg.x0} y1={seg.y0} x2={seg.x1} y2={seg.y1} className="text-cool" stroke="currentColor" strokeWidth={0.9} strokeOpacity={0.55} />
          ))}
          {activeUniversalTelemetry.bezierSvgPath ? (
            <path d={activeUniversalTelemetry.bezierSvgPath} fill="none" className="text-accent" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
          ) : null}
          <circle
            cx={activeUniversalTelemetry.myPaintStep.primaryDabX}
            cy={activeUniversalTelemetry.myPaintStep.primaryDabY}
            r={Math.min(11, Math.max(2.5, activeUniversalTelemetry.klecksPrecision.mappedValue * 0.14))}
            fill={`rgb(${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[0] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[1] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[2] * 255)})`}
            fillOpacity={activeUniversalTelemetry.myPaintStep.linearizedOpaque01}
          />
          {activeUniversalTelemetry.booleanPolygonPoints ? (
            <polygon points={activeUniversalTelemetry.booleanPolygonPoints} className="text-good" fill="currentColor" fillOpacity={0.28} stroke="currentColor" strokeWidth={1} />
          ) : null}
        </svg>
        <span className="inline-flex flex-wrap items-center gap-2 font-mono text-[10px] text-fg-3">
          <span
            aria-hidden="true"
            data-studio-klecks-contrast-swatch={
              activeUniversalTelemetry.klecksPrecision.isWhiteBestContrast ? "white" : "black"
            }
            className="inline-block h-2.5 w-2.5 rounded-full border border-line ring-1 ring-fg/70 ring-offset-1 ring-offset-canvas [forced-color-adjust:none]"
            style={{
              forcedColorAdjust: "none",
              backgroundColor: `rgb(${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[0] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[1] * 255)}, ${Math.round(activeUniversalTelemetry.myPaintStep.outputRgb01[2] * 255)})`,
            }}
          />
          <span>{tx("세그먼트")}: {activeUniversalTelemetry.harmony.primitiveCount}</span>
          <span>·</span>
          <span>{tx("코드 링크")}: {activeUniversalTelemetry.harmony.chordLinkCount}</span>
          <span>·</span>
          <span>{tx("골격 리본")}: {activeUniversalTelemetry.skeletalCount}</span>
          <span>·</span>
          <span>{tx("입자 궤적")}: {activeUniversalTelemetry.particleSegmentCount}</span>
          <span>·</span>
          <span>{tx("베지어 피팅")}: {activeUniversalTelemetry.schneiderSegmentCount}</span>
          <span>·</span>
          <span>{tx("Klecks 댑")}: {activeUniversalTelemetry.klecksDabCount}</span>
          <span>·</span>
          <span>{tx("MyPaint 선형알파")}: {activeUniversalTelemetry.myPaintStep.linearizedOpaque01.toFixed(3)}</span>
          <span>·</span>
          <span>{tx("PF 윤곽")}: {activeUniversalTelemetry.pfOutline.outlinePoints.length}</span>
          <span>·</span>
          <span>{tx("Rough 해칭")}: {activeUniversalTelemetry.roughHachureTotalCount}</span>
          <span>·</span>
          <span>{tx("집중선")}: {activeUniversalTelemetry.vanishRayTotalCount}</span>
          <span>·</span>
          <span>{tx("RDP·RTree")}: {activeUniversalTelemetry.rdpPointCount}/{activeUniversalTelemetry.rbushHitCount}</span>
          <span>·</span>
          <span>{tx("불리언 정점")}: {activeUniversalTelemetry.booleanUnionVertexCount}</span>
          <span>·</span>
          <span>{tx("플러드필·타일")}: {activeUniversalTelemetry.floodFillCount}/{activeUniversalTelemetry.dirtyTileCount}</span>
          <span>·</span>
          <span>{tx("톤커브 LUT")}: {activeUniversalTelemetry.curveLutMid}</span>
          <span>·</span>
          <span>{tx("FFD·어니언")}: {activeUniversalTelemetry.ffdDisplacementPx}px/{activeUniversalTelemetry.onionSkinAlpha01}</span>
          <span>·</span>
          <span>{tx("칼레이도·만다라")}: {activeUniversalTelemetry.monolithicEval.kaleidoscopeMirroredSector}/{activeUniversalTelemetry.monolithicEval.mandalaSymmetricCopyCount}</span>
          <span>·</span>
          <span>{tx("PSD·ΔE00·Otsu")}: {activeUniversalTelemetry.monolithicEval.psdCompressionRatio01.toFixed(2)}/{activeUniversalTelemetry.monolithicEval.ciede2000DeltaE.toFixed(1)}/{activeUniversalTelemetry.monolithicEval.otsuOptimalThreshold}</span>
          <span>·</span>
          <span>{tx("Crease·CatchUp")}: {activeUniversalTelemetry.monolithicEval.sculptCreaseZ.toFixed(2)}/{activeUniversalTelemetry.monolithicEval.klecksCatchUpX.toFixed(1)}</span>
          <span>·</span>
          <span>{tx("WebGPU Vello·Indirect·UBO")}: {activeUniversalTelemetry.webgpuHighSpeedEval.velloEulerSubdivisions}/{activeUniversalTelemetry.webgpuHighSpeedEval.indirectVisibleInstances}/{activeUniversalTelemetry.webgpuHighSpeedEval.uboBatchAlignedBytes}B</span>
          <span>·</span>
          <span data-studio-brushlab-quality-telemetry="true">{tx("GGX·GhostWash·와류·브러시랩")}: {activeUniversalTelemetry.competitorQualityEval.ggxSpecularBrdf.toFixed(2)}/{activeUniversalTelemetry.competitorQualityEval.mudEliminationGain01.toFixed(2)}/{activeUniversalTelemetry.competitorQualityEval.fluidVorticityForceMagnitude.toFixed(1)}/{activeUniversalTelemetry.competitorQualityEval.brushLabCompositeScore100}점</span>
          <span>·</span>
          <span>{tx("QR 바이트")}: {activeUniversalTelemetry.qrLength}B</span>
        </span>
      </div>
    </div>
  );
}
