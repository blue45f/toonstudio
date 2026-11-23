/**
 * 3D Wasm64(memory64) BVH·Auto-LOD·GPU Instancing 및 WebGPU NPR/SSAO/DoF·컬러 그레이딩 룩뎁 패널.
 * Calm Atelier 시맨틱 토큰 전용 (원시 색상 미사용 · 명시적 transition 속성만 사용 · 460줄 이하 · KO/EN 지원).
 */

import { Cpu, Layers, Palette, Sparkles, Sun } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import { useI18n } from "@/shared/lib/i18n";

import {
  DEFAULT_DEMO_3D_CAMERA,
  SCENE3D_DEFAULT_VRAM_BUDGET_MIB,
  Scene3dWasm64MemoryPool,
  buildScene3dBvh,
  createDemoWebtoonCityScene,
  cullFrustumAndSelectLod,
  planGpuInstancedBatches,
  planProgressive3dAssetStream,
  type FrustumLodSelectionResult,
  type GpuInstancingPlan,
  type Progressive3dAssetStreamPlan,
  type Scene3dWasm64PoolTelemetry,
} from "./wasm64-3d-bvh-lod-instancing";
import {
  DEFAULT_NPR_OUTLINE_CONFIG,
  DEFAULT_SSAO_DOF_CONFIG,
  TIME_OF_DAY_GRADING_PRESETS,
  createDemo2dCutReferenceBuffer,
  createDemoScene3dGBuffer,
  runFullWebgpuNprPipeline,
  type FullWebgpuNprPipelineResult,
  type TimeOfDayPresetId,
} from "./webgpu-npr-ssao-colorgrading";

export interface Studio3dWasm64LookdevSnapshot {
  readonly lodAggressiveness: number;
  readonly instancingEnabled: boolean;
  readonly outlineWidthPx: number;
  readonly halftoneEnabled: boolean;
  readonly ssaoStrength: number;
  readonly dofAperture: number;
  readonly timeOfDay: TimeOfDayPresetId;
  readonly autoMatch2dEnabled: boolean;
  readonly poolTelemetry: Scene3dWasm64PoolTelemetry;
  readonly lodSelection: FrustumLodSelectionResult;
  readonly instancingPlan: GpuInstancingPlan;
  readonly streamPlan: Progressive3dAssetStreamPlan;
  readonly pipelineResult: FullWebgpuNprPipelineResult;
}

export interface Studio3dWasm64LookdevPanelProps {
  readonly initialObjectCount?: number;
  readonly initialLodAggressiveness?: number;
  readonly initialTimeOfDay?: TimeOfDayPresetId;
  readonly initialAutoMatch2d?: boolean;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  readonly onLookdevChange?: (snapshot: Studio3dWasm64LookdevSnapshot) => void;
}

const PREVIEW_W = 72;
const PREVIEW_H = 48;
const FOCUS_RING = "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent";
const BTN_TOGGLE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const PRESET_BTN = `inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border px-2.5 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

const TIME_PRESET_ITEMS: readonly { readonly id: TimeOfDayPresetId; readonly ko: string; readonly en: string }[] = [
  { id: "daylight", ko: "낮", en: "Daylight" },
  { id: "sunset", ko: "노을", en: "Sunset" },
  { id: "night", ko: "밤", en: "Night" },
  { id: "indoor-fluorescent", ko: "실내 형광등", en: "Indoor" },
];

interface LookdevSliderProps {
  readonly id: string;
  readonly label: string;
  readonly valueText: string;
  readonly valueTestId?: string;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly value: number;
  readonly onChange: (next: number) => void;
}

function LookdevSlider({ id, label, valueText, valueTestId, min, max, step, value, onChange }: LookdevSliderProps): ReactElement {
  return (
    <div className="space-y-1.5 rounded-xl border border-line bg-card p-3 text-xs">
      <div className="flex items-center justify-between gap-2 text-fg-2">
        <label htmlFor={id} className="font-medium">{label}</label>
        <span data-testid={valueTestId} className="tabular-nums font-semibold text-fg">{valueText}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`w-full accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

/** 3D Wasm64(memory64) BVH·오토 LOD·GPU Instancing · WebGPU NPR/SSAO/DoF·2D↔3D 컬러 매칭 룩뎁 패널. */
export function Studio3dWasm64LookdevPanel({
  initialObjectCount = 1000,
  initialLodAggressiveness = 0.5,
  initialTimeOfDay = "sunset",
  initialAutoMatch2d = true,
  locale,
  className,
  onLookdevChange,
}: Studio3dWasm64LookdevPanelProps = {}): ReactElement {
  const uid = useId();
  const storeLang = useI18n((state) => state.lang);
  const isKo = (locale ?? (storeLang.toLowerCase().startsWith("ko") ? "ko" : "en")) === "ko";
  const pick = (ko: string, en: string): string => (isKo ? ko : en);

  const [lodAggressiveness, setLodAggressiveness] = useState<number>(initialLodAggressiveness);
  const [instancingEnabled, setInstancingEnabled] = useState<boolean>(true);
  const [outlineWidthPx, setOutlineWidthPx] = useState<number>(DEFAULT_NPR_OUTLINE_CONFIG.outlineWidthPx);
  const [halftoneEnabled, setHalftoneEnabled] = useState<boolean>(true);
  const [ssaoStrength, setSsaoStrength] = useState<number>(DEFAULT_SSAO_DOF_CONFIG.ssaoStrength);
  const [dofAperture, setDofAperture] = useState<number>(DEFAULT_SSAO_DOF_CONFIG.dofAperture);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDayPresetId>(initialTimeOfDay);
  const [autoMatch2dEnabled, setAutoMatch2dEnabled] = useState<boolean>(initialAutoMatch2d);

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const sceneObjects = useMemo(() => createDemoWebtoonCityScene(initialObjectCount), [initialObjectCount]);
  const sceneBvh = useMemo(() => buildScene3dBvh(sceneObjects), [sceneObjects]);
  const demoGBuffer = useMemo(() => createDemoScene3dGBuffer(PREVIEW_W, PREVIEW_H), []);
  const cut2dReference = useMemo(
    () => createDemo2dCutReferenceBuffer(PREVIEW_W, PREVIEW_H, timeOfDay),
    [timeOfDay],
  );

  const geometryState = useMemo(() => {
    const pool = new Scene3dWasm64MemoryPool({ initialPages: 2 });
    pool.writeObjectAabbs(sceneObjects);
    const lodSelection = cullFrustumAndSelectLod(sceneBvh, DEFAULT_DEMO_3D_CAMERA, lodAggressiveness);
    const instancingPlan = planGpuInstancedBatches(lodSelection, { memoryPool: pool, maxDrawCalls: 12 });
    const streamPlan = planProgressive3dAssetStream(lodSelection, SCENE3D_DEFAULT_VRAM_BUDGET_MIB);
    return { poolTelemetry: pool.getTelemetry(), lodSelection, instancingPlan, streamPlan };
  }, [lodAggressiveness, sceneBvh, sceneObjects]);

  const pipelineResult = useMemo(
    () =>
      runFullWebgpuNprPipeline(demoGBuffer, {
        npr: {
          ...DEFAULT_NPR_OUTLINE_CONFIG,
          outlineWidthPx,
          halftoneStrength: halftoneEnabled ? DEFAULT_NPR_OUTLINE_CONFIG.halftoneStrength : 0,
        },
        ssaoDof: { ...DEFAULT_SSAO_DOF_CONFIG, ssaoStrength, dofAperture },
        grading: TIME_OF_DAY_GRADING_PRESETS[timeOfDay],
        match2dCutRgba: autoMatch2dEnabled ? cut2dReference : null,
        match2dStrength: 0.92,
      }),
    [autoMatch2dEnabled, cut2dReference, demoGBuffer, dofAperture, halftoneEnabled, outlineWidthPx, ssaoStrength, timeOfDay],
  );

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas || typeof ImageData === "undefined") return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.putImageData(new ImageData(new Uint8ClampedArray(pipelineResult.rgba), PREVIEW_W, PREVIEW_H), 0, 0);
  }, [pipelineResult.rgba]);

  useEffect(() => {
    onLookdevChange?.({
      lodAggressiveness,
      instancingEnabled,
      outlineWidthPx,
      halftoneEnabled,
      ssaoStrength,
      dofAperture,
      timeOfDay,
      autoMatch2dEnabled,
      poolTelemetry: geometryState.poolTelemetry,
      lodSelection: geometryState.lodSelection,
      instancingPlan: geometryState.instancingPlan,
      streamPlan: geometryState.streamPlan,
      pipelineResult,
    });
  }, [
    autoMatch2dEnabled, dofAperture, geometryState, halftoneEnabled, instancingEnabled,
    lodAggressiveness, onLookdevChange, outlineWidthPx, pipelineResult, ssaoStrength, timeOfDay,
  ]);

  const { poolTelemetry, lodSelection, instancingPlan, streamPlan } = geometryState;
  const activeDrawCalls = instancingEnabled ? instancingPlan.instancedDrawCalls : instancingPlan.naiveDrawCalls;
  const drawCallSavingPct = instancingEnabled ? instancingPlan.drawCallReductionVsTotal01 * 100 : 0;
  const triSavingPct = lodSelection.triangleReductionRatio01 * 100;
  const vramAllocatedMiB = streamPlan.allocatedVramBytes / (1024 * 1024);
  const vramBudgetMiB = streamPlan.vramBudgetBytes / (1024 * 1024);
  const topBatch = instancingPlan.batches[0];

  return (
    <section
      aria-label={pick("3D Wasm64 성능·WebGPU NPR 룩뎁 패널", "3D Wasm64 Performance & WebGPU NPR Lookdev Panel")}
      data-testid="studio-3d-wasm64-lookdev-panel"
      className={`rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>
              {poolTelemetry.isMemory64
                ? pick("Wasm64 (memory64) 가동 · 웹 네이티브 경량 3D", "Wasm64 (memory64) Active · Web-Native 3D")
                : pick("Wasm32 호환 폴백 · 웹 네이티브 경량 3D", "Wasm32 Fallback · Web-Native 3D")}
            </span>
          </div>
          <h2 className="text-base font-bold text-fg">
            {pick("3D Wasm64 가속 · WebGPU NPR 툰 룩뎁", "3D Wasm64 Acceleration · WebGPU NPR Lookdev")}
          </h2>
          <p className="text-xs text-fg-2">
            {pick(
              "SAH BVH·오토 LOD·GPU Instancing으로 드로우콜을 압축하고 깊이 가변 윤곽선·SSAO·DoF·3D LUT로 2D 컷과 색감을 맞춥니다.",
              "Compresses draw calls with SAH BVH, Auto-LOD & GPU Instancing while matching 3D NPR, SSAO, DoF & 3D LUT color to 2D cuts.",
            )}
          </p>
        </div>
        <span
          data-testid="wasm64-address-mode-badge"
          className="inline-flex items-center rounded-lg border border-good/40 bg-good-soft px-2.5 py-1 text-[11px] font-bold tabular-nums text-good"
        >
          {poolTelemetry.isMemory64 ? "Wasm64 · i64" : "Wasm32 · i32"}
        </span>
      </header>

      {/* 실시간 Wasm64 · BVH · GPU Instancing · VRAM 텔레메트리 카드 */}
      <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">{pick("GPU 드로우콜 압축", "Draw Call Compression")}</div>
          <div data-testid="telemetry-draw-calls" className="mt-1 text-base font-bold tabular-nums text-good">
            {activeDrawCalls} DC
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-fg-3">
            {pick(`${instancingPlan.totalSceneObjects.toLocaleString("en-US")}개 → -${drawCallSavingPct.toFixed(1)}%`, `${instancingPlan.totalSceneObjects.toLocaleString("en-US")} objs · -${drawCallSavingPct.toFixed(1)}%`)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">{pick("SAH BVH · Auto-LOD", "SAH BVH · Auto-LOD")}</div>
          <div data-testid="telemetry-effective-triangles" className="mt-1 text-base font-bold tabular-nums text-fg">
            {lodSelection.effectiveLodTriangles.toLocaleString("en-US")} △
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-fg-3">
            {pick(`컬링 ${lodSelection.culledCount}개 · -${triSavingPct.toFixed(1)}%`, `Culled ${lodSelection.culledCount} · -${triSavingPct.toFixed(1)}%`)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">{pick("Wasm64 선형 메모리", "Wasm64 Linear Pool")}</div>
          <div data-testid="telemetry-wasm-used" className="mt-1 text-base font-bold tabular-nums text-fg">
            {(poolTelemetry.usedBytes / 1024).toFixed(1)} KiB
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-fg-3">
            {pick(`${poolTelemetry.committedPages.toString()}p · ${poolTelemetry.storedInstanceCount} inst`, `${poolTelemetry.committedPages.toString()}p · ${poolTelemetry.storedInstanceCount} inst`)}
          </div>
        </div>
        <div className="rounded-xl border border-line bg-card p-3">
          <div className="text-[11px] text-fg-3">{pick("KTX2·Meshopt VRAM", "KTX2·Meshopt VRAM")}</div>
          <div data-testid="telemetry-vram-usage" className="mt-1 text-base font-bold tabular-nums text-fg">
            {vramAllocatedMiB.toFixed(1)} / {vramBudgetMiB.toFixed(0)} MiB
          </div>
          <div className="mt-0.5 text-[11px] tabular-nums text-fg-3">
            {pick(`압축 절감 ${(streamPlan.ktx2MeshoptSavingsRatio01 * 100).toFixed(0)}%`, `Saved ${(streamPlan.ktx2MeshoptSavingsRatio01 * 100).toFixed(0)}%`)}
          </div>
        </div>
      </div>

      {/* 라이브 WebGPU NPR 룩뎁 프리뷰 + GPU Instancing 배칭 요약 */}
      <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-12">
        <div className="flex flex-col justify-between rounded-xl border border-line bg-canvas p-3 sm:col-span-5">
          <div className="flex items-center justify-between gap-2 text-[11px] text-fg-2">
            <span className="inline-flex items-center gap-1 font-semibold">
              <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              {pick("NPR · SSAO · 3D LUT 프리뷰", "NPR · SSAO · 3D LUT Preview")}
            </span>
            <span className="tabular-nums text-fg-3">
              {pipelineResult.backend.shaderCount} WGSL
            </span>
          </div>
          <canvas
            ref={previewCanvasRef}
            width={PREVIEW_W}
            height={PREVIEW_H}
            aria-label={pick("3D 웹툰 NPR 룩뎁 미리보기", "3D Webtoon NPR Lookdev Preview")}
            className="mt-2 h-28 w-full rounded-lg border border-line bg-card object-cover"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-1 text-[11px] tabular-nums text-fg-3">
            <span>
              {pick(`실루엣 ${pipelineResult.nprPass.silhouettePixelCount}px · 주름 ${pipelineResult.nprPass.creasePixelCount}px`, `Sil ${pipelineResult.nprPass.silhouettePixelCount}px · Crease ${pipelineResult.nprPass.creasePixelCount}px`)}
            </span>
            <span data-testid="telemetry-palette-match">
              {pipelineResult.paletteMatch
                ? pick(`2D 색차 -${(pipelineResult.paletteMatch.colorGapReductionRatio01 * 100).toFixed(0)}%`, `2D Gap -${(pipelineResult.paletteMatch.colorGapReductionRatio01 * 100).toFixed(0)}%`)
                : pick("2D 매칭 꺼짐", "2D Match Off")}
            </span>
          </div>
        </div>

        {/* 핵심 슬라이더 컨트롤 (4종) */}
        <div className="grid grid-cols-1 gap-2 sm:col-span-7 sm:grid-cols-2">
          <LookdevSlider
            id={`${uid}-lod`}
            label={pick("Auto-LOD 공격도", "Auto-LOD Aggressiveness")}
            valueText={`${Math.round(lodAggressiveness * 100)}%`}
            valueTestId="value-lod-aggressiveness"
            min={0} max={1} step={0.05} value={lodAggressiveness} onChange={setLodAggressiveness}
          />
          <LookdevSlider
            id={`${uid}-outline`}
            label={pick("NPR 가변 윤곽선 굵기", "NPR Variable Outline")}
            valueText={`${outlineWidthPx.toFixed(1)} px`}
            valueTestId="value-outline-width"
            min={0.6} max={2.8} step={0.1} value={outlineWidthPx} onChange={setOutlineWidthPx}
          />
          <LookdevSlider
            id={`${uid}-ssao`}
            label={pick("SSAO 접촉 그림자", "SSAO Contact Shadow")}
            valueText={`${Math.round(ssaoStrength * 100)}%`}
            valueTestId="value-ssao-strength"
            min={0} max={1} step={0.05} value={ssaoStrength} onChange={setSsaoStrength}
          />
          <LookdevSlider
            id={`${uid}-dof`}
            label={pick("피사계 심도 (DoF)", "Depth of Field (DoF)")}
            valueText={`${Math.round(dofAperture * 100)}%`}
            valueTestId="value-dof-aperture"
            min={0} max={1} step={0.05} value={dofAperture} onChange={setDofAperture}
          />
        </div>
      </div>

      {/* 시간대 컬러 그레이딩 프리셋 (4종) */}
      <div className="mt-3 rounded-xl border border-line bg-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <span className="inline-flex items-center gap-1.5 font-semibold text-fg">
            <Sun className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            {pick("시간대 3D LUT 컬러 그레이딩", "Time-of-Day 3D LUT Color Grading")}
          </span>
          <span className="tabular-nums text-[11px] text-fg-3">
            {pick(
              `LOD 분포 L0:${lodSelection.lodCounts[0]} / L1:${lodSelection.lodCounts[1]} / L2:${lodSelection.lodCounts[2]} / L3:${lodSelection.lodCounts[3]}`,
              `LOD L0:${lodSelection.lodCounts[0]} / L1:${lodSelection.lodCounts[1]} / L2:${lodSelection.lodCounts[2]} / L3:${lodSelection.lodCounts[3]}`,
            )}
          </span>
        </div>
        <div role="radiogroup" aria-label={pick("시간대 컬러 그레이딩 프리셋", "Time-of-day grading presets")} className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TIME_PRESET_ITEMS.map((item) => {
            const active = timeOfDay === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setTimeOfDay(item.id)}
                className={`${PRESET_BTN} ${active ? "border-accent bg-accent text-on-accent" : "border-line bg-canvas text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"}`}
              >
                {pick(item.ko, item.en)}
              </button>
            );
          })}
        </div>
      </div>

      {/* 하단 3대 핵심 토글 (GPU Instancing · 하프톤 스크린톤 · 2D↔3D 자동 매칭) */}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <button
          type="button"
          aria-pressed={instancingEnabled}
          onClick={() => setInstancingEnabled((prev) => !prev)}
          className={`${BTN_TOGGLE} ${instancingEnabled ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"}`}
        >
          <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>
            {instancingEnabled
              ? pick(`GPU Instancing ON (${instancingPlan.instancedDrawCalls}배치)`, `GPU Instancing ON (${instancingPlan.instancedDrawCalls} batches)`)
              : pick("GPU Instancing OFF (개별 드로우)", "GPU Instancing OFF (Naive)")}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={halftoneEnabled}
          onClick={() => setHalftoneEnabled((prev) => !prev)}
          className={`${BTN_TOGGLE} ${halftoneEnabled ? "border-accent bg-accent-soft text-fg" : "border-line bg-card text-fg-2 hover:bg-raised"}`}
        >
          <Sparkles className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
          <span>
            {halftoneEnabled
              ? pick("3단 셀 · 하프톤 스크린톤 ON", "3-Band Cel & Halftone ON")
              : pick("3단 셀 · 하프톤 스크린톤 OFF", "3-Band Cel & Halftone OFF")}
          </span>
        </button>

        <button
          type="button"
          aria-pressed={autoMatch2dEnabled}
          onClick={() => setAutoMatch2dEnabled((prev) => !prev)}
          className={`${BTN_TOGGLE} ${autoMatch2dEnabled ? "border-good bg-good-soft text-good" : "border-line bg-card text-fg-2 hover:bg-raised"}`}
        >
          <Palette className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {autoMatch2dEnabled
              ? pick("2D↔3D 색감 자동 매칭 ON", "2D↔3D Auto Color Match ON")
              : pick("2D↔3D 색감 자동 매칭 OFF", "2D↔3D Auto Color Match OFF")}
          </span>
        </button>
      </div>

      {topBatch && (
        <p className="mt-2.5 text-[11px] tabular-nums text-fg-3">
          {pick(
            `최다 인스턴스 배치: ${topBatch.assetId} (${topBatch.instanceCount}개 통합 · SAH BVH ${sceneBvh.nodeCount}노드 / 깊이 ${sceneBvh.maxDepth})`,
            `Top instanced batch: ${topBatch.assetId} (${topBatch.instanceCount} instances · SAH BVH ${sceneBvh.nodeCount} nodes / depth ${sceneBvh.maxDepth})`,
          )}
        </p>
      )}
    </section>
  );
}
