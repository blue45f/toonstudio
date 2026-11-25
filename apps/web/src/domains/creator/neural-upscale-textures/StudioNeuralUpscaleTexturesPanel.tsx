/**
 * Wave 40C — CPU 엣지 보존 합성 예제 + 6종 절차적 심리스 PBR·망점 텍스처 통합 워크벤치.
 *
 * - Calm Atelier 시맨틱 토큰 전용 (원시 hex/rgb/hsl 0건 · Web Storage 0건 · props `= {}` 미사용)
 * - Tab 1: 2×/4× 웹툰 선화·셀채색 엣지 보존 업스케일러 비교(분할 뷰·PSNR·할로 측정·WGSL 텍스트 검사기)
 * - Tab 2: 6종 토러스 매핑 심리스 텍스처(Albedo + Sobel Normal + Roughness R + 2×2 타일 검증)
 */

import {
  CheckCircle2,
  Code2,
  Cpu,
  Eye,
  Grid2x2,
  Layers,
  Maximize2,
  RefreshCw,
  ScanLine,
  SlidersHorizontal,
} from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type ReactElement } from "react";

import {
  DEFAULT_UPSCALE_OPTIONS,
  DEMO_WEBTOON_SCENE_PRESETS,
  WEBGPU_EDGE_UPSCALE_WGSL,
  createDemoWebtoonSampleBuffer,
  upscaleWebtoonBuffer,
  validateUpscalerWgsl,
  type DemoWebtoonSceneId,
  type RgbaImageBuffer,
  type UpscaleFactor,
  type WebtoonUpscaleResult,
} from "./edge-preserving-upscaler";
import {
  PROCEDURAL_MATERIAL_PRESETS,
  roughnessToRgbaBuffer,
  synthesizeProceduralTexture,
  type ProceduralMaterialId,
  type ProceduralTextureResult,
} from "./procedural-texture-synth";
import { useExampleResultNotification } from "./use-example-result-notification";

export type NeuralUpscaleTexturesTabId = "upscaler" | "textures";
export type UpscalerPreviewMode = "split" | "edge-preserving" | "bilinear";
export type TexturePreviewChannel = "albedo" | "normal" | "roughness" | "tiled-2x2";

export interface StudioNeuralUpscaleTexturesPanelProps {
  readonly initialTab?: NeuralUpscaleTexturesTabId;
  readonly locale?: "ko" | "en";
  readonly className?: string;
  /** 결과 변경 알림이며 실제 원고 적용·저장 완료 응답이 아니다. */
  readonly onUpscaleComplete?: (result: WebtoonUpscaleResult) => void | Promise<void>;
  readonly onTextureSynthesized?: (result: ProceduralTextureResult) => void | Promise<void>;
}

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1 focus-visible:ring-offset-canvas";
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised ${FOCUS_RING}`;
const BTN_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING}`;
const TAB_BASE = `inline-flex min-h-11 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors motion-reduce:transition-none ${FOCUS_RING}`;

interface RangeSliderProps {
  readonly id: string;
  readonly testId: string;
  readonly label: string;
  readonly valueText: string;
  readonly value: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly onChange: (next: number) => void;
}

function RangeSlider(props: RangeSliderProps): ReactElement {
  const { id, testId, label, valueText, value, min, max, step, onChange } = props;
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between gap-2 text-xs">
        <label htmlFor={id} className="font-medium text-fg-2">
          {label}
        </label>
        <span className="font-semibold text-fg tabular-nums">{valueText}</span>
      </div>
      <input
        id={id}
        data-testid={testId}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

interface MetricTileProps {
  readonly label: string;
  readonly value: string;
  readonly testId?: string;
  readonly toneClass?: string;
}

function MetricTile(props: MetricTileProps): ReactElement {
  const { label, value, testId, toneClass = "text-fg" } = props;
  return (
    <div className="rounded-lg border border-line bg-raised p-2.5">
      <div className="text-[11px] text-fg-3">{label}</div>
      <div data-testid={testId} className={`mt-0.5 text-sm font-bold tabular-nums ${toneClass}`}>
        {value}
      </div>
    </div>
  );
}

function paintRgbaBuffer(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx || typeof ctx.createImageData !== "function") return;
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
  const img = ctx.createImageData(width, height);
  img.data.set(rgba);
  ctx.putImageData(img, 0, 0);
}

function paintUpscaleComparison(
  canvas: HTMLCanvasElement | null,
  upscaled: RgbaImageBuffer,
  bilinear: RgbaImageBuffer,
  mode: UpscalerPreviewMode,
  splitPercent: number,
): void {
  if (!canvas) return;
  if (mode === "edge-preserving") {
    paintRgbaBuffer(canvas, upscaled.data, upscaled.width, upscaled.height);
    return;
  }
  if (mode === "bilinear") {
    paintRgbaBuffer(canvas, bilinear.data, bilinear.width, bilinear.height);
    return;
  }
  const { width: w, height: h } = upscaled;
  const splitX = Math.round((w * splitPercent) / 100);
  const merged = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y += 1) {
    const rowOff = y * w;
    for (let x = 0; x < w; x += 1) {
      const k = (rowOff + x) * 4;
      const src = x < splitX ? bilinear.data : upscaled.data;
      merged[k] = src[k] ?? 0;
      merged[k + 1] = src[k + 1] ?? 0;
      merged[k + 2] = src[k + 2] ?? 0;
      merged[k + 3] = src[k + 3] ?? 255;
    }
  }
  paintRgbaBuffer(canvas, merged, w, h);
}

function paintTiled2x2(
  canvas: HTMLCanvasElement | null,
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): void {
  const tw = width * 2;
  const th = height * 2;
  const tiled = new Uint8ClampedArray(tw * th * 4);
  for (let y = 0; y < th; y += 1) {
    const sy = y % height;
    for (let x = 0; x < tw; x += 1) {
      const s = (sy * width + (x % width)) * 4;
      const d = (y * tw + x) * 4;
      tiled[d] = rgba[s] ?? 0;
      tiled[d + 1] = rgba[s + 1] ?? 0;
      tiled[d + 2] = rgba[s + 2] ?? 0;
      tiled[d + 3] = rgba[s + 3] ?? 255;
    }
  }
  paintRgbaBuffer(canvas, tiled, tw, th);
}

/** Wave 40C 2탭 실시간 엣지보존 업스케일러 + 절차적 심리스 PBR·망점 텍스처 워크벤치. */
export function StudioNeuralUpscaleTexturesPanel(
  props: StudioNeuralUpscaleTexturesPanelProps,
): ReactElement {
  const {
    initialTab = "upscaler",
    locale = "ko",
    className,
    onUpscaleComplete,
    onTextureSynthesized,
  } = props;
  const uid = useId();
  const isEn = locale === "en";
  const pick = (ko: string, en: string): string => (isEn ? en : ko);

  const [activeTab, setActiveTab] = useState<NeuralUpscaleTexturesTabId>(initialTab);
  const [sceneId, setSceneId] = useState<DemoWebtoonSceneId>("ink-lineart");
  const [scaleFactor, setScaleFactor] = useState<UpscaleFactor>(DEFAULT_UPSCALE_OPTIONS.scaleFactor);
  const [edgeSharpen, setEdgeSharpen] = useState<number>(DEFAULT_UPSCALE_OPTIONS.edgeSharpenStrength);
  const [lineThinness, setLineThinness] = useState<number>(DEFAULT_UPSCALE_OPTIONS.lineThinnessStrength);
  const [antiRinging, setAntiRinging] = useState<number>(DEFAULT_UPSCALE_OPTIONS.antiRingingStrength);
  const [previewMode, setPreviewMode] = useState<UpscalerPreviewMode>("split");
  const [splitPercent, setSplitPercent] = useState<number>(50);
  const [showWgslSource, setShowWgslSource] = useState<boolean>(false);

  const [materialId, setMaterialId] = useState<ProceduralMaterialId>("hanji-fiber");
  const [seed, setSeed] = useState<number>(42);
  const [tileScale, setTileScale] = useState<number>(2);
  const [normalStrength, setNormalStrength] = useState<number>(1.8);
  const [roughnessBias, setRoughnessBias] = useState<number>(0);
  const [channelView, setChannelView] = useState<TexturePreviewChannel>("tiled-2x2");

  const upscaleCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const textureMainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const albedoThumbRef = useRef<HTMLCanvasElement | null>(null);
  const normalThumbRef = useRef<HTMLCanvasElement | null>(null);
  const roughnessThumbRef = useRef<HTMLCanvasElement | null>(null);

  const sourceBuffer = useMemo(() => createDemoWebtoonSampleBuffer(sceneId, 64, 64), [sceneId]);
  const upscaleResult = useMemo(
    () =>
      upscaleWebtoonBuffer(sourceBuffer, {
        scaleFactor,
        edgeSharpenStrength: edgeSharpen,
        lineThinnessStrength: lineThinness,
        antiRingingStrength: antiRinging,
      }),
    [sourceBuffer, scaleFactor, edgeSharpen, lineThinness, antiRinging],
  );
  const wgslValidation = useMemo(() => validateUpscalerWgsl(WEBGPU_EDGE_UPSCALE_WGSL), []);

  const textureResult = useMemo(
    () =>
      synthesizeProceduralTexture(materialId, {
        width: 96,
        height: 96,
        seed,
        tileScale,
        normalStrength,
        roughnessBias,
      }),
    [materialId, seed, tileScale, normalStrength, roughnessBias],
  );
  const roughnessRgba = useMemo(
    () => roughnessToRgbaBuffer(textureResult.roughnessR, textureResult.width, textureResult.height),
    [textureResult],
  );
  const activeMaterialPreset = useMemo(
    () => PROCEDURAL_MATERIAL_PRESETS.find((item) => item.id === materialId) ?? PROCEDURAL_MATERIAL_PRESETS[0]!,
    [materialId],
  );

  const upscaleNotification = useExampleResultNotification(upscaleResult, onUpscaleComplete);
  const textureNotification = useExampleResultNotification(textureResult, onTextureSynthesized);

  useEffect(() => {
    if (activeTab !== "upscaler") return;
    paintUpscaleComparison(
      upscaleCanvasRef.current,
      upscaleResult.output,
      upscaleResult.bilinearBaseline,
      previewMode,
      splitPercent,
    );
  }, [activeTab, upscaleResult, previewMode, splitPercent]);

  useEffect(() => {
    if (activeTab !== "textures") return;
    const { width, height, albedoRgba, normalRgba } = textureResult;
    if (channelView === "tiled-2x2") paintTiled2x2(textureMainCanvasRef.current, albedoRgba, width, height);
    else if (channelView === "normal") paintRgbaBuffer(textureMainCanvasRef.current, normalRgba, width, height);
    else if (channelView === "roughness") paintRgbaBuffer(textureMainCanvasRef.current, roughnessRgba, width, height);
    else paintRgbaBuffer(textureMainCanvasRef.current, albedoRgba, width, height);
    paintRgbaBuffer(albedoThumbRef.current, albedoRgba, width, height);
    paintRgbaBuffer(normalThumbRef.current, normalRgba, width, height);
    paintRgbaBuffer(roughnessThumbRef.current, roughnessRgba, width, height);
  }, [activeTab, textureResult, roughnessRgba, channelView]);

  const handleSelectMaterial = (nextId: ProceduralMaterialId): void => {
    setMaterialId(nextId);
    const preset = PROCEDURAL_MATERIAL_PRESETS.find((item) => item.id === nextId);
    if (preset) {
      setTileScale(preset.defaultTileScale);
      setNormalStrength(preset.defaultNormalStrength);
      setRoughnessBias(preset.defaultRoughnessBias);
    }
  };

  const tabs: readonly { readonly id: NeuralUpscaleTexturesTabId; readonly label: string; readonly shortLabel: string; readonly icon: ReactElement }[] = [
    {
      id: "upscaler",
      label: pick("2×/4× 엣지보존 업스케일러", "2×/4× Edge Upscaler"), shortLabel: pick("이미지 확대", "Upscale"),
      icon: <Maximize2 className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />,
    },
    {
      id: "textures",
      label: pick("6종 심리스 PBR·망점 텍스처", "6 Seamless PBR & Halftone"), shortLabel: pick("텍스처", "Textures"),
      icon: <Grid2x2 className="hidden h-3.5 w-3.5 sm:block" aria-hidden="true" />,
    },
  ];

  const haloZero = upscaleResult.metrics.haloOvershootCount === 0;
  const seamlessPass = textureResult.seamReport.isSeamless;

  return (
    <section
      data-testid="neural-upscale-textures-panel"
      aria-label={pick(
        "CPU 합성 샘플 업스케일·텍스처 예제",
        "Real-time Edge-Preserving Upscaler & Procedural Seamless PBR Texture Workbench",
      )}
      className={`space-y-4 rounded-2xl border border-line bg-panel p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-1">
          <div className="inline-flex items-center gap-1.5 rounded-full border border-line bg-card px-2.5 py-0.5 text-[11px] font-semibold text-fg-2">
            <Cpu className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
            <span>{pick("Wave 40C · CPU 합성 샘플 · 절차적 텍스처", "Wave 40C · CPU Synthetic Samples · Procedural Textures")}</span>
          </div>
          <h2 className="text-base font-bold text-fg">
            {pick("CPU 엣지 보존 업스케일 · 절차적 텍스처 예제", "Edge-Preserving Upscaler · Procedural Seamless Texture Synth")}
          </h2>
        </div>
        <div
          data-testid="upscaler-backend-badge"
          className="inline-flex items-center gap-1.5 rounded-lg border border-good/40 bg-good-soft px-2.5 py-1.5 text-xs font-semibold text-good tabular-nums"
        >
          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
          <span>
            {pick("CPU 계산 · GPU·ML 미실행", "CPU Calculation · GPU / ML Not Run")}
          </span>
        </div>
      </header>
      <p data-testid="upscaler-scope-notice" className="text-xs text-fg-2">
        {pick("고정 합성 샘플을 CPU·2D Canvas로 비교합니다. 사용자 원고·3D 씬·기기 저장·내보내기는 바뀌지 않습니다. 수치는 이 예제 계산 결과이며 실제 GPU·ML 품질 검증이 아닙니다.", "Fixed synthetic samples use CPU and 2D Canvas. Manuscripts, 3D scenes, device storage and exports are unchanged. Metrics describe this example, not GPU or ML quality validation.")}
        {upscaleResult.metrics.gpuCapability === "api-present-unverified"
          ? pick(" WebGPU API 존재만 확인했으며 장치·컴파일·실행은 미검증입니다.", " WebGPU API present; device, compilation and execution unverified.")
          : pick(" WebGPU API 없음.", " WebGPU API unavailable.")}
      </p>
      {([["upscale", upscaleNotification], ["texture", textureNotification]] as const).map(([kind, status]) => status === "failed" || status === "pending" ? (
        <p key={kind} role={status === "failed" ? "alert" : "status"} data-testid={`${kind}-notification-status`} className="text-xs text-fg-2">
          {kind === "upscale" ? pick("업스케일", "Upscale") : pick("텍스처", "Texture")} · {status === "failed" ? pick("예제 결과 알림 실패. 실제 적용·저장 완료가 아니며 결과를 바꾸면 새로 알립니다.", "Example result notification failed. No apply or save confirmed; changing the result sends a new notification.") : pick("예제 결과 알림 처리 중 · 실제 적용·저장 완료 아님", "Example result notification pending; no apply or save confirmed")}
        </p>
      ) : null)}

      <div role="tablist" aria-label={pick("워크벤치 탭", "Workbench Tabs")} className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const selected = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              id={`${uid}-tab-${tab.id}`}
              data-testid={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-label={tab.label} title={tab.label} aria-controls={`${uid}-panel-${tab.id}`}
              onClick={() => setActiveTab(tab.id)}
              className={`${TAB_BASE} ${selected ? "border-accent bg-accent text-on-accent" : "border-line bg-card text-fg-2 hover:border-line-strong hover:bg-raised hover:text-fg"}`}
            >
              {tab.icon}
              <span>{tab.shortLabel}</span>
            </button>
          );
        })}
      </div>

      {activeTab === "upscaler" && (
        <div id={`${uid}-panel-upscaler`} role="tabpanel" aria-labelledby={`${uid}-tab-upscaler`} className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <ScanLine className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{pick("이중선형 vs 엣지보존 실시간 비교", "Bilinear vs Edge-Preserving")}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["split", pick("분할 비교", "Split")],
                      ["edge-preserving", pick("엣지보존", "Edge-Safe")],
                      ["bilinear", pick("이중선형", "Bilinear")],
                    ] as const
                  ).map(([mode, label]) => (
                    <button
                      key={mode}
                      data-testid={`preview-mode-${mode}`}
                      type="button"
                      aria-pressed={previewMode === mode}
                      onClick={() => setPreviewMode(mode)}
                      className={previewMode === mode ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="relative overflow-hidden rounded-xl border border-line bg-canvas">
                <canvas
                  ref={upscaleCanvasRef}
                  data-testid="upscaler-preview-canvas"
                  width={upscaleResult.output.width}
                  height={upscaleResult.output.height}
                  role="img"
                  aria-label={pick("웹툰 엣지 보존 업스케일러 비교 미리보기 캔버스", "Webtoon edge-preserving upscaler comparison preview canvas")}
                  className="mx-auto block aspect-square w-full max-w-[320px] [image-rendering:pixelated]"
                />
                {previewMode === "split" && (
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-y-0 w-0.5 bg-accent"
                    style={{ left: `${splitPercent}%` }}
                  />
                )}
              </div>

              {previewMode === "split" && (
                <RangeSlider
                  id={`${uid}-split-pos`}
                  testId="upscaler-split-slider"
                  label={pick("비교 경계선 위치 (좌: 이중선형 · 우: 엣지보존)", "Split Position (L: Bilinear · R: Edge-Safe)")}
                  valueText={`${splitPercent}%`}
                  value={splitPercent}
                  min={10}
                  max={90}
                  step={1}
                  onChange={setSplitPercent}
                />
              )}

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <MetricTile
                  label={pick("출력 해상도", "Output Size")}
                  value={`${upscaleResult.metrics.outputWidth}×${upscaleResult.metrics.outputHeight}`}
                  testId="upscale-resolution-readout"
                />
                <MetricTile
                  label={pick("라운드트립 PSNR", "Round-Trip PSNR")}
                  value={`${upscaleResult.metrics.roundTripPsnrDb.toFixed(2)} dB`}
                  testId="upscale-psnr-readout"
                  toneClass="text-cool"
                />
                <MetricTile
                  label={pick("엣지 선명도 개선", "Edge Gain")}
                  value={`+${upscaleResult.metrics.edgeSharpnessGainPercent.toFixed(1)}%`}
                  testId="upscale-sharpness-gain"
                  toneClass="text-accent"
                />
                <MetricTile
                  label={pick("할로 오버슈트", "Halo Overshoot")}
                  value={`${(upscaleResult.metrics.haloOvershootRate * 100).toFixed(2)}%`}
                  testId="upscale-halo-readout"
                  toneClass={haloZero ? "text-good" : "text-warn"}
                />
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                <SlidersHorizontal className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>{pick("업스케일 배율 · 합성 샘플 · 파라미터", "Scale · Sample Cut · Controls")}</span>
              </div>

              <div className="flex flex-wrap gap-2">
                {([2, 4] as const).map((factor) => (
                  <button
                    key={factor}
                    data-testid={`scale-factor-${factor}x`}
                    type="button"
                    aria-pressed={scaleFactor === factor}
                    onClick={() => setScaleFactor(factor)}
                    className={`flex-1 ${scaleFactor === factor ? BTN_ACTIVE : BTN_OUTLINE}`}
                  >
                    <span className="tabular-nums">{factor}×</span>
                    <span>{pick("업스케일", "Upscale")}</span>
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {DEMO_WEBTOON_SCENE_PRESETS.map((scene) => (
                  <button
                    key={scene.id}
                    data-testid={`scene-preset-${scene.id}`}
                    type="button"
                    aria-pressed={sceneId === scene.id}
                    onClick={() => setSceneId(scene.id)}
                    className={sceneId === scene.id ? BTN_ACTIVE : BTN_OUTLINE}
                  >
                    {isEn ? scene.labelEn : scene.labelKo}
                  </button>
                ))}
              </div>

              <div className="space-y-3 border-t border-line pt-3">
                <RangeSlider
                  id={`${uid}-edge-sharpen`}
                  testId="edge-sharpen-slider"
                  label={pick("Sobel 직교 엣지 선명화", "Sobel Orthogonal Sharpening")}
                  valueText={edgeSharpen.toFixed(2)}
                  value={edgeSharpen}
                  min={0}
                  max={1.5}
                  step={0.05}
                  onChange={setEdgeSharpen}
                />
                <RangeSlider
                  id={`${uid}-line-thinness`}
                  testId="line-thinness-slider"
                  label={pick("선화 굵기 보존 (잉크 팽창 억제)", "Line-Thinness Preservation")}
                  valueText={`${Math.round(lineThinness * 100)}%`}
                  value={lineThinness}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={setLineThinness}
                />
                <RangeSlider
                  id={`${uid}-anti-ringing`}
                  testId="anti-ringing-slider"
                  label={pick("안티-링잉 로컬 클램프", "Anti-Ringing Local Clamp")}
                  valueText={`${Math.round(antiRinging * 100)}%`}
                  value={antiRinging}
                  min={0}
                  max={1}
                  step={0.05}
                  onChange={setAntiRinging}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line bg-raised px-3 py-2 text-xs">
                <span className="text-fg-2">
                  {pick("선화 면적 보존율", "Ink Width Ratio")}:{" "}
                  <strong data-testid="line-width-ratio-readout" className="text-fg tabular-nums">
                    {(upscaleResult.metrics.lineWidthPreservationRatio * 100).toFixed(1)}%
                  </strong>
                </span>
                <span className="text-fg-3 tabular-nums">{upscaleResult.metrics.processingTimeMs.toFixed(2)} ms</span>
              </div>

              <div className="space-y-2 border-t border-line pt-3">
                <button
                  data-testid="toggle-wgsl-source-btn"
                  type="button"
                  aria-expanded={showWgslSource}
                  onClick={() => setShowWgslSource((prev) => !prev)}
                  className={`w-full justify-between ${BTN_OUTLINE}`}
                >
                  <span className="inline-flex items-center gap-1.5">
                    <Code2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>{pick("미연결 WGSL 참고 코드 · 텍스트 검사", "Unconnected WGSL Reference · Text Check")}</span>
                  </span>
                  <span className="text-[11px] text-good tabular-nums">
                    {wgslValidation.valid
                      ? pick(`${wgslValidation.entryPoints.length}개 선언 · 컴파일 미검증`, `${wgslValidation.entryPoints.length} declarations · Not compiled`)
                      : pick("오류", "Error")}
                  </span>
                </button>
                {showWgslSource && (
                  <pre
                    data-testid="wgsl-source-preview"
                    className="max-h-48 overflow-auto rounded-lg border border-line bg-canvas p-3 font-mono text-[11px] leading-relaxed text-fg-2"
                  >
                    {WEBGPU_EDGE_UPSCALE_WGSL.trim()}
                  </pre>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === "textures" && (
        <div id={`${uid}-panel-textures`} role="tabpanel" aria-labelledby={`${uid}-tab-textures`} className="space-y-4">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
            {PROCEDURAL_MATERIAL_PRESETS.map((mat) => {
              const isSelected = mat.id === materialId;
              return (
                <button
                  key={mat.id}
                  data-testid={`material-btn-${mat.id}`}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => handleSelectMaterial(mat.id)}
                  className={`${isSelected ? BTN_ACTIVE : BTN_OUTLINE} flex-col gap-0.5 py-2`}
                >
                  <span>{isEn ? mat.labelEn : mat.labelKo}</span>
                  <span className="text-[10px] font-medium text-fg-3">{isEn ? mat.categoryEn : mat.categoryKo}</span>
                </button>
              );
            })}
          </div>

          <div className="grid gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                  <Eye className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                  <span>{isEn ? activeMaterialPreset.labelEn : activeMaterialPreset.labelKo}</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {(
                    [
                      ["tiled-2x2", pick("2×2 타일 검증", "2×2 Tiled")],
                      ["albedo", "Albedo"],
                      ["normal", "Normal"],
                      ["roughness", "Roughness"],
                    ] as const
                  ).map(([ch, label]) => (
                    <button
                      key={ch}
                      data-testid={`channel-view-${ch}`}
                      type="button"
                      aria-pressed={channelView === ch}
                      onClick={() => setChannelView(ch)}
                      className={channelView === ch ? BTN_ACTIVE : BTN_OUTLINE}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-xl border border-line bg-canvas p-2">
                <canvas
                  ref={textureMainCanvasRef}
                  data-testid="texture-main-canvas"
                  width={channelView === "tiled-2x2" ? textureResult.width * 2 : textureResult.width}
                  height={channelView === "tiled-2x2" ? textureResult.height * 2 : textureResult.height}
                  role="img"
                  aria-label={pick(`${activeMaterialPreset.labelKo} 절차적 심리스 텍스처 프리뷰`, `${activeMaterialPreset.labelEn} procedural seamless texture preview`)}
                  className="mx-auto block aspect-square w-full max-w-[300px] rounded-lg"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    [albedoThumbRef, "texture-thumb-albedo", "Albedo RGBA", pick("Albedo 맵 썸네일", "Albedo map thumbnail")],
                    [normalThumbRef, "texture-thumb-normal", "Sobel Normal", pick("Sobel Normal 맵 썸네일", "Sobel normal map thumbnail")],
                    [roughnessThumbRef, "texture-thumb-roughness", "Roughness R", pick("Roughness R 채널 썸네일", "Roughness R channel thumbnail")],
                  ] as const
                ).map(([refObj, tid, caption, aria]) => (
                  <div key={tid} className="space-y-1 rounded-lg border border-line bg-raised p-2 text-center">
                    <canvas
                      ref={refObj}
                      data-testid={tid}
                      width={textureResult.width}
                      height={textureResult.height}
                      role="img"
                      aria-label={aria}
                      className="mx-auto block aspect-square w-full max-w-[84px] rounded border border-line"
                    />
                    <div className="text-[11px] font-semibold text-fg-2">{caption}</div>
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-3 rounded-xl border border-line bg-card p-3.5">
              <div className="flex items-start justify-between gap-2">
                <div className="space-y-0.5">
                  <div className="inline-flex items-center gap-1.5 text-xs font-semibold text-fg">
                    <Layers className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                    <span>{pick("토러스 주기 노이즈 파라미터", "Torus Periodic Noise Controls")}</span>
                  </div>
                  <p className="text-xs text-fg-2">
                    {isEn ? activeMaterialPreset.descriptionEn : activeMaterialPreset.descriptionKo}
                  </p>
                </div>
                <button
                  data-testid="randomize-seed-btn"
                  type="button"
                  onClick={() => setSeed((prev) => ((prev * 37 + 17) % 997) + 1)}
                  className={BTN_OUTLINE}
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{pick("시드 변경", "New Seed")}</span>
                </button>
              </div>

              <div className="space-y-3 border-t border-line pt-3">
                <RangeSlider
                  id={`${uid}-tile-scale`}
                  testId="texture-tile-scale-slider"
                  label={pick("패턴 정수 반복 배율", "Integer Pattern Scale")}
                  valueText={`${tileScale}×`}
                  value={tileScale}
                  min={1}
                  max={4}
                  step={1}
                  onChange={setTileScale}
                />
                <RangeSlider
                  id={`${uid}-normal-strength`}
                  testId="texture-normal-strength-slider"
                  label={pick("Sobel 노멀 기복 강도", "Sobel Normal Strength")}
                  valueText={normalStrength.toFixed(1)}
                  value={normalStrength}
                  min={0.5}
                  max={4.5}
                  step={0.1}
                  onChange={setNormalStrength}
                />
                <RangeSlider
                  id={`${uid}-roughness-bias`}
                  testId="texture-roughness-bias-slider"
                  label={pick("거칠기 R 채널 보정", "Roughness R Bias")}
                  valueText={`${roughnessBias >= 0 ? "+" : ""}${roughnessBias.toFixed(2)}`}
                  value={roughnessBias}
                  min={-0.25}
                  max={0.25}
                  step={0.01}
                  onChange={setRoughnessBias}
                />
                <RangeSlider
                  id={`${uid}-tex-seed`}
                  testId="texture-seed-slider"
                  label={pick("결정론적 노이즈 시드", "Deterministic Noise Seed")}
                  valueText={`Seed ${seed}`}
                  value={seed}
                  min={1}
                  max={999}
                  step={1}
                  onChange={setSeed}
                />
              </div>

              <div className="grid grid-cols-2 gap-2 border-t border-line pt-3">
                <MetricTile
                  label={pick("심리스 연속성 판정", "Seam Continuity")}
                  value={`${textureResult.seamReport.continuityScore.toFixed(1)}% · ${seamlessPass ? pick("심리스 통과", "Seamless") : pick("경계 불연속", "Seam Error")}`}
                  testId="texture-seam-status"
                  toneClass={seamlessPass ? "text-good" : "text-bad"}
                />
                <MetricTile
                  label={pick("토러스 주기 경계 오차", "Periodic Edge Error")}
                  value={textureResult.metadata.periodicBoundaryError.toFixed(6)}
                  testId="texture-periodic-error"
                  toneClass="text-good"
                />
                <MetricTile
                  label={pick("경계/내부 스텝 비율", "Seam/Interior Ratio")}
                  value={`${textureResult.seamReport.seamToInteriorRatio.toFixed(2)}×`}
                  testId="texture-seam-ratio"
                />
                <MetricTile
                  label={pick("평균 거칠기 · 합성 시간", "Mean Roughness · Time")}
                  value={`${textureResult.metadata.meanRoughness.toFixed(2)} · ${textureResult.metadata.generationTimeMs.toFixed(1)} ms`}
                  testId="texture-roughness-readout"
                  toneClass="text-cool"
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
