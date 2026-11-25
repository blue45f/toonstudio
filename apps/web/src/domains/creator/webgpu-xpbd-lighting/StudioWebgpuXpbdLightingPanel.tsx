/**
 * Wave 37D — WebGPU 컴퓨트 XPBD 헤어·의상 물리 충돌 + 2D/3D SDF 광원 일치 베이크 스튜디오 패널.
 *
 * - Calm Atelier 시맨틱 토큰 전용(TSX 내 원시 색상 0건 · 명시적 transition 속성만 사용 · Web Storage 비의존).
 * - 바람 세기·방향·돌풍 난류·천/헤어 강성과 광원 방위각·고도각·색온도(K)·셀 단계를 실시간 제어하고
 *   인터랙티브 `<canvas>`에서 헤어 가닥 물리 시뮬레이션과 2D/3D 광원 일치 결과를 즉시 확인한다.
 */

import {
  CheckCircle2,
  Code2,
  Compass,
  Eye,
  EyeOff,
  Pause,
  Play,
  RotateCcw,
  ShieldCheck,
  SlidersHorizontal,
  StepForward,
  Sun,
  Wind,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type PointerEvent,
  type ReactElement,
} from "react";

import {
  DEFAULT_PHYSICAL_LIGHT_INPUT,
  TOON_LIGHTING_PRESETS,
  TOON_SDF_RAYMARCH_WGSL,
  bakeToonSdfLighting,
  formatOklch,
  renderXpbdLightingPreviewCanvas,
  type PhysicalLightRigInput,
  type ToonLightingPreset,
  type Unified2d3dLightRigResult,
} from "./webgpu-toon-lighting-baker";
import {
  DEFAULT_XPBD_CONFIG,
  XPBD_HAIR_CLOTH_WGSL,
  createDefaultXpbdRigState,
  stepXpbdSimulation,
  validateWgslComputeShader,
  type XpbdSimulationConfig,
  type XpbdStepResult,
} from "./webgpu-xpbd-solver";

export interface StudioWebgpuXpbdLightingPanelProps {
  readonly initialPresetId?: ToonLightingPreset["id"];
  readonly initialAutoPlay?: boolean;
  readonly className?: string;
  readonly onMetricsChange?: (snapshot: {
    readonly physics: XpbdStepResult["metrics"];
    readonly lighting: Unified2d3dLightRigResult["alignmentMetrics"];
  }) => void;
}

const FOCUS_RING =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
const BTN_PRIMARY = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg bg-accent px-3.5 py-2 text-xs font-semibold text-on-accent transition-colors motion-reduce:transition-none hover:bg-accent-2 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_OUTLINE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-line bg-card px-3 py-2 text-xs font-semibold text-fg transition-colors motion-reduce:transition-none hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS_RING} [word-break:keep-all]`;
const BTN_CHIP_ACTIVE = `inline-flex min-h-11 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-accent bg-accent-soft px-3 py-2 text-xs font-semibold text-accent transition-colors motion-reduce:transition-none ${FOCUS_RING} [word-break:keep-all]`;

interface RangeControlProps {
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

function RangeControl({
  id,
  testId,
  label,
  valueText,
  value,
  min,
  max,
  step,
  onChange,
}: RangeControlProps): ReactElement {
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
        onChange={(event) => onChange(Number(event.target.value))}
        className={`h-2 w-full cursor-pointer accent-accent ${FOCUS_RING}`}
      />
    </div>
  );
}

function drawLightingSwatchCanvas(
  canvas: HTMLCanvasElement,
  lightRig: Unified2d3dLightRigResult,
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const w = canvas.width || 320;
  const h = canvas.height || 36;
  ctx.clearRect(0, 0, w, h);

  const bands = [
    ...lightRig.celRamp.map((b) => b.colorOklch),
    lightRig.rimLightOklch,
    lightRig.floorBounceOklch,
  ];
  const segW = w / Math.max(1, bands.length);
  bands.forEach((color, idx) => {
    ctx.fillStyle = formatOklch(color);
    ctx.fillRect(Math.floor(idx * segW), 0, Math.ceil(segW) + 1, h);
  });
}

const FALLBACK_PRESET: ToonLightingPreset = {
  id: "morning-atelier",
  labelKo: "오전 채광",
  descriptionKo: "5200K 자연광 · 46° 부드러운 창가 채광",
  light: DEFAULT_PHYSICAL_LIGHT_INPUT,
};

function findPresetById(id?: ToonLightingPreset["id"]): ToonLightingPreset {
  return TOON_LIGHTING_PRESETS.find((item) => item.id === id) ?? TOON_LIGHTING_PRESETS[0] ?? FALLBACK_PRESET;
}

export function StudioWebgpuXpbdLightingPanel({
  initialPresetId = "morning-atelier",
  initialAutoPlay = false,
  className,
  onMetricsChange,
}: StudioWebgpuXpbdLightingPanelProps): ReactElement {
  const uid = useId();
  const initialPreset = findPresetById(initialPresetId);

  // 물리 파라미터 상태
  const [windStrengthMps, setWindStrengthMps] = useState<number>(DEFAULT_XPBD_CONFIG.wind.strengthMps);
  const [windAzimuthDeg, setWindAzimuthDeg] = useState<number>(DEFAULT_XPBD_CONFIG.wind.azimuthDeg);
  const [gustTurbulencePct, setGustTurbulencePct] = useState<number>(
    Math.round(DEFAULT_XPBD_CONFIG.wind.gustTurbulence * 100),
  );
  const [clothStiffnessPct, setClothStiffnessPct] = useState<number>(
    Math.round(DEFAULT_XPBD_CONFIG.clothStiffness * 100),
  );
  const [showColliders, setShowColliders] = useState<boolean>(true);
  const [isPlaying, setIsPlaying] = useState<boolean>(initialAutoPlay);
  const [showWgslInspector, setShowWgslInspector] = useState<boolean>(false);

  // 2D/3D 단일 물리 광원 리그 상태
  const [activePresetId, setActivePresetId] = useState<ToonLightingPreset["id"]>(initialPreset.id);
  const [lightAzimuthDeg, setLightAzimuthDeg] = useState<number>(initialPreset.light.azimuthDeg);
  const [lightElevationDeg, setLightElevationDeg] = useState<number>(
    initialPreset.light.elevationDeg,
  );
  const [colorTempKelvin, setColorTempKelvin] = useState<number>(
    initialPreset.light.colorTempKelvin,
  );
  const [celStepCount, setCelStepCount] = useState<2 | 3 | 4>(
    initialPreset.light.celStepCount ?? DEFAULT_PHYSICAL_LIGHT_INPUT.celStepCount,
  );

  // 결정론적 XPBD 시뮬레이션 상태 (초기 1스텝 수행해 실제 지표로 시작)
  const [simResult, setSimResult] = useState<XpbdStepResult>(() =>
    stepXpbdSimulation(createDefaultXpbdRigState(), DEFAULT_XPBD_CONFIG),
  );

  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const swatchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const isDraggingLightRef = useRef<boolean>(false);

  const activeConfig: XpbdSimulationConfig = useMemo(
    () => ({
      ...DEFAULT_XPBD_CONFIG,
      clothStiffness: clothStiffnessPct / 100,
      hairStiffness: Math.min(1, Math.max(0.15, (clothStiffnessPct - 6) / 100)),
      wind: {
        ...DEFAULT_XPBD_CONFIG.wind,
        strengthMps: windStrengthMps,
        azimuthDeg: windAzimuthDeg,
        gustTurbulence: gustTurbulencePct / 100,
      },
    }),
    [clothStiffnessPct, gustTurbulencePct, windAzimuthDeg, windStrengthMps],
  );

  const activePreset = findPresetById(activePresetId);

  const lightInput: PhysicalLightRigInput = useMemo(
    () => ({
      azimuthDeg: lightAzimuthDeg,
      elevationDeg: lightElevationDeg,
      colorTempKelvin,
      keyIntensity: activePreset.light.keyIntensity ?? 1.0,
      floorAlbedoOklch:
        activePreset.light.floorAlbedoOklch ?? DEFAULT_PHYSICAL_LIGHT_INPUT.floorAlbedoOklch,
      skyFillRatio: activePreset.light.skyFillRatio ?? DEFAULT_PHYSICAL_LIGHT_INPUT.skyFillRatio,
      celStepCount,
      shadowSoftness:
        activePreset.light.shadowSoftness ?? DEFAULT_PHYSICAL_LIGHT_INPUT.shadowSoftness,
    }),
    [activePreset.light, celStepCount, colorTempKelvin, lightAzimuthDeg, lightElevationDeg],
  );

  const lightRig = useMemo(
    () =>
      bakeToonSdfLighting(lightInput, {
        colliders: simResult.state.colliders,
        gridSize: 18,
      }),
    [lightInput, simResult.state.colliders],
  );

  const xpbdWgslAudit = useMemo(() => validateWgslComputeShader(XPBD_HAIR_CLOTH_WGSL), []);
  const sdfWgslAudit = useMemo(() => validateWgslComputeShader(TOON_SDF_RAYMARCH_WGSL), []);

  const stepOnce = useCallback((): void => {
    setSimResult((prev) => stepXpbdSimulation(prev.state, activeConfig));
  }, [activeConfig]);

  // 재생 중일 때 reduced-motion 설정을 존중하며 프레임 루프 실행
  useEffect(() => {
    if (!isPlaying || typeof window === "undefined") return;
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) return;

    let rafId = 0;
    const tick = (): void => {
      setSimResult((prev) => stepXpbdSimulation(prev.state, activeConfig));
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [activeConfig, isPlaying]);

  // 캔버스 프리뷰 및 OKLCH 스워치 동기화
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (canvas) {
      renderXpbdLightingPreviewCanvas(canvas, simResult.state, lightRig, {
        showColliders,
        wind: activeConfig.wind,
      });
    }
    const swatch = swatchCanvasRef.current;
    if (swatch) {
      drawLightingSwatchCanvas(swatch, lightRig);
    }
  }, [activeConfig.wind, lightRig, showColliders, simResult.state]);

  // 상위 지표 콜백 전달
  useEffect(() => {
    onMetricsChange?.({
      physics: simResult.metrics,
      lighting: lightRig.alignmentMetrics,
    });
  }, [lightRig.alignmentMetrics, onMetricsChange, simResult.metrics]);

  const applyPreset = (preset: ToonLightingPreset): void => {
    setActivePresetId(preset.id);
    setLightAzimuthDeg(preset.light.azimuthDeg);
    setLightElevationDeg(preset.light.elevationDeg);
    setColorTempKelvin(preset.light.colorTempKelvin);
    setCelStepCount(preset.light.celStepCount ?? 3);
  };

  const handleReset = (): void => {
    const basePreset = findPresetById("morning-atelier");
    setIsPlaying(false);
    setWindStrengthMps(DEFAULT_XPBD_CONFIG.wind.strengthMps);
    setWindAzimuthDeg(DEFAULT_XPBD_CONFIG.wind.azimuthDeg);
    setGustTurbulencePct(Math.round(DEFAULT_XPBD_CONFIG.wind.gustTurbulence * 100));
    setClothStiffnessPct(Math.round(DEFAULT_XPBD_CONFIG.clothStiffness * 100));
    setShowColliders(true);
    applyPreset(basePreset);
    setSimResult(stepXpbdSimulation(createDefaultXpbdRigState(), DEFAULT_XPBD_CONFIG));
  };

  const updateLightFromCanvasPointer = (event: PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const nx = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    const ny = Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height));
    const nextAzimuth = Math.round(nx * 360);
    const nextElevation = Math.round(85 - ny * 75);
    setLightAzimuthDeg(nextAzimuth);
    setLightElevationDeg(nextElevation);
  };

  const penetrationPass = simResult.metrics.penetrationMm === 0;
  const lightAlignedPass =
    lightRig.alignmentMetrics.azimuthMismatchDeg === 0 &&
    lightRig.alignmentMetrics.elevationMismatchDeg === 0 &&
    lightRig.alignmentMetrics.kelvinMismatchK === 0;

  return (
    <section
      data-testid="studio-webgpu-xpbd-lighting-panel"
      aria-label="CPU XPBD 물리·SDF 광원 프리뷰와 WGSL 구조 검사"
      className={`rounded-xl border border-line bg-raised p-4 text-fg [word-break:keep-all] ${className ?? ""}`}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-line pb-3">
        <div className="space-y-0.5">
          <div className="flex items-center gap-1.5 text-sm font-bold text-fg">
            <Sun className="h-4 w-4 text-accent" aria-hidden="true" />
            <h2>CPU XPBD 물리·SDF 광원 프리뷰 · WGSL 구조 검사</h2>
          </div>
          <p className="text-xs text-fg-2">
            예제 리그의 물리와 광원을 CPU에서 계산합니다. 실제 VRM·원고에는 반영하지 않으며 GPU 셰이더는 실행하지 않습니다.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span
            data-testid="xpbd-penetration-badge"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
              penetrationPass
                ? "border-good/40 bg-good-soft text-good"
                : "border-bad/40 bg-bad-soft text-bad"
            }`}
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>관통 {simResult.metrics.penetrationMm.toFixed(2)}mm</span>
          </span>
          <span
            data-testid="lighting-harmony-badge"
            className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-semibold tabular-nums ${
              lightAlignedPass
                ? "border-good/40 bg-good-soft text-good"
                : "border-warn/40 bg-warning-soft text-warn"
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>계산된 광원 설정 일치 {lightRig.alignmentMetrics.harmonyScore}/100</span>
          </span>
        </div>
      </header>

      {/* 장면 광원 프리셋 & 실행 제어 바 */}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="2D/3D 광원 프리셋">
          {TOON_LIGHTING_PRESETS.map((preset) => {
            const active = preset.id === activePresetId;
            return (
              <button
                key={preset.id}
                type="button"
                data-testid={`lighting-preset-${preset.id}`}
                aria-pressed={active}
                onClick={() => applyPreset(preset)}
                className={active ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
              >
                {preset.labelKo}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="xpbd-toggle-play"
            aria-pressed={isPlaying}
            onClick={() => setIsPlaying((prev) => !prev)}
            className={isPlaying ? BTN_CHIP_ACTIVE : BTN_PRIMARY}
          >
            {isPlaying ? (
              <>
                <Pause className="h-3.5 w-3.5" aria-hidden="true" />
                <span>일시정지</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5" aria-hidden="true" />
                <span>물리 재생</span>
              </>
            )}
          </button>
          <button
            type="button"
            data-testid="xpbd-step-once"
            onClick={stepOnce}
            className={BTN_OUTLINE}
          >
            <StepForward className="h-3.5 w-3.5" aria-hidden="true" />
            <span>1스텝</span>
          </button>
          <button
            type="button"
            data-testid="xpbd-toggle-colliders"
            aria-pressed={showColliders}
            onClick={() => setShowColliders((prev) => !prev)}
            className={showColliders ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
          >
            {showColliders ? (
              <Eye className="h-3.5 w-3.5" aria-hidden="true" />
            ) : (
              <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            <span>콜라이더</span>
          </button>
          <button
            type="button"
            data-testid="xpbd-lighting-reset"
            onClick={handleReset}
            className={BTN_OUTLINE}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            <span>초기화</span>
          </button>
        </div>
      </div>

      {/* 본문 2열 레이아웃: 좌측 인터랙티브 프리뷰 캔버스 / 우측 물리·광원 컨트롤 */}
      <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="space-y-3 lg:col-span-7">
          <div className="overflow-hidden rounded-lg border border-line bg-canvas">
            <canvas
              ref={previewCanvasRef}
              data-testid="xpbd-lighting-preview-canvas"
              width={560}
              height={340}
              aria-label="헤어·의상 XPBD 물리 충돌 및 2D/3D 광원 일치 실시간 프리뷰"
              onPointerDown={(event) => {
                isDraggingLightRef.current = true;
                updateLightFromCanvasPointer(event);
              }}
              onPointerMove={(event) => {
                if (!isDraggingLightRef.current) return;
                updateLightFromCanvasPointer(event);
              }}
              onPointerUp={() => {
                isDraggingLightRef.current = false;
              }}
              onPointerLeave={() => {
                isDraggingLightRef.current = false;
              }}
              className="block h-auto w-full cursor-crosshair bg-canvas text-fg"
            />
          </div>

          {/* 툰 셀 램프 · 림라이트 · OKLCH 바닥 바운스 스워치 바 */}
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-semibold text-fg">
                OKLCH 셀 램프 ({lightRig.celRamp.length}단) · 림라이트 · 바닥 바운스
              </span>
              <span className="text-fg-2 tabular-nums">
                투영 그림자 {Math.round(lightRig.projectedShadowAngleDeg)}° (길이비{" "}
                {lightRig.projectedShadowLengthRatio.toFixed(2)}x)
              </span>
            </div>
            <canvas
              ref={swatchCanvasRef}
              data-testid="lighting-oklch-swatch-canvas"
              width={360}
              height={28}
              aria-label="베이크된 OKLCH 셀 램프와 림라이트·바닥 바운스 팔레트"
              className="mt-2 block h-7 w-full rounded-md border border-line bg-canvas"
            />
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-fg-2 sm:grid-cols-4">
              <div className="rounded-md border border-line bg-canvas px-2 py-1.5">
                <div className="text-[11px] text-fg-3">주광원 OKLCH</div>
                <div className="font-semibold text-fg tabular-nums">
                  L{lightRig.keyLightOklch.l.toFixed(2)} · H{Math.round(lightRig.keyLightOklch.h)}°
                </div>
              </div>
              <div className="rounded-md border border-line bg-canvas px-2 py-1.5">
                <div className="text-[11px] text-fg-3">림라이트 OKLCH</div>
                <div className="font-semibold text-fg tabular-nums">
                  L{lightRig.rimLightOklch.l.toFixed(2)} · C{lightRig.rimLightOklch.c.toFixed(2)}
                </div>
              </div>
              <div className="rounded-md border border-line bg-canvas px-2 py-1.5">
                <div className="text-[11px] text-fg-3">바닥 바운스</div>
                <div className="font-semibold text-fg tabular-nums">
                  L{lightRig.floorBounceOklch.l.toFixed(2)} · H
                  {Math.round(lightRig.floorBounceOklch.h)}°
                </div>
              </div>
              <div className="rounded-md border border-line bg-canvas px-2 py-1.5">
                <div className="text-[11px] text-fg-3">2D↔3D 오차</div>
                <div data-testid="lighting-mismatch-summary" className="font-semibold text-good tabular-nums">
                  {lightRig.alignmentMetrics.azimuthMismatchDeg}° / {lightRig.alignmentMetrics.kelvinMismatchK}K
                </div>
              </div>
            </div>
          </div>

          {/* 실측 물리 계측 스트립 */}
          <div
            data-testid="xpbd-telemetry-strip"
            className="grid grid-cols-2 gap-2 rounded-lg border border-line bg-card p-3 text-xs sm:grid-cols-4"
          >
            <div>
              <div className="text-[11px] text-fg-3">스텝 / 접촉 수</div>
              <div className="font-semibold text-fg tabular-nums">
                #{simResult.metrics.stepIndex} · {simResult.metrics.contactCount}건
              </div>
            </div>
            <div>
              <div className="text-[11px] text-fg-3">최대 신장률</div>
              <div className="font-semibold text-fg tabular-nums">
                {simResult.metrics.maxStretchRatioObserved.toFixed(3)}x
              </div>
            </div>
            <div>
              <div className="text-[11px] text-fg-3">평균 끝단 변위</div>
              <div data-testid="xpbd-tip-displacement" className="font-semibold text-fg tabular-nums">
                {simResult.metrics.meanTipDisplacementMm.toFixed(1)}mm
              </div>
            </div>
            <div>
              <div className="text-[11px] text-fg-3">운동 에너지</div>
              <div className="font-semibold text-fg tabular-nums">
                {(simResult.metrics.kineticEnergyJ * 1000).toFixed(2)}mJ
              </div>
            </div>
          </div>
        </div>

        {/* 우측 파라미터 제어 칼럼 */}
        <div className="space-y-3 lg:col-span-5">
          {/* ① XPBD 헤어·의상 물리 제어 */}
          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Wind className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <h3>XPBD 헤어·의상 물리 &amp; 캡슐 충돌</h3>
            </div>
            <RangeControl
              id={`${uid}-wind-strength`}
              testId="slider-wind-strength"
              label="바람 세기"
              valueText={`${windStrengthMps.toFixed(1)} m/s`}
              value={windStrengthMps}
              min={0}
              max={18}
              step={0.5}
              onChange={(next) => {
                setWindStrengthMps(next);
                setSimResult((prev) =>
                  stepXpbdSimulation(prev.state, {
                    ...activeConfig,
                    wind: { ...activeConfig.wind, strengthMps: next },
                  }),
                );
              }}
            />
            <RangeControl
              id={`${uid}-wind-azimuth`}
              testId="slider-wind-azimuth"
              label="바람 방향(방위각)"
              valueText={`${Math.round(windAzimuthDeg)}°`}
              value={windAzimuthDeg}
              min={0}
              max={360}
              step={5}
              onChange={(next) => {
                setWindAzimuthDeg(next);
                setSimResult((prev) =>
                  stepXpbdSimulation(prev.state, {
                    ...activeConfig,
                    wind: { ...activeConfig.wind, azimuthDeg: next },
                  }),
                );
              }}
            />
            <RangeControl
              id={`${uid}-gust-turbulence`}
              testId="slider-gust-turbulence"
              label="돌풍 난류(컬 임펄스)"
              valueText={`${gustTurbulencePct}%`}
              value={gustTurbulencePct}
              min={0}
              max={100}
              step={5}
              onChange={(next) => setGustTurbulencePct(next)}
            />
            <RangeControl
              id={`${uid}-cloth-stiffness`}
              testId="slider-cloth-stiffness"
              label="의상·헤어 강성"
              valueText={`${clothStiffnessPct}%`}
              value={clothStiffnessPct}
              min={10}
              max={100}
              step={5}
              onChange={(next) => setClothStiffnessPct(next)}
            />
          </div>

          {/* ② 2D/3D SDF 물리 광원 리그 제어 */}
          <div className="space-y-3 rounded-lg border border-line bg-card p-3">
            <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
              <Compass className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
              <h3>2D 배경 · 3D VRM 단일 광원 리그</h3>
            </div>
            <RangeControl
              id={`${uid}-light-azimuth`}
              testId="slider-light-azimuth"
              label="광원 방위각"
              valueText={`${Math.round(lightAzimuthDeg)}°`}
              value={lightAzimuthDeg}
              min={0}
              max={360}
              step={2}
              onChange={(next) => setLightAzimuthDeg(next)}
            />
            <RangeControl
              id={`${uid}-light-elevation`}
              testId="slider-light-elevation"
              label="광원 고도각"
              valueText={`${Math.round(lightElevationDeg)}°`}
              value={lightElevationDeg}
              min={10}
              max={85}
              step={1}
              onChange={(next) => setLightElevationDeg(next)}
            />
            <RangeControl
              id={`${uid}-color-temp`}
              testId="slider-color-temp"
              label="색온도(Kelvin)"
              valueText={`${colorTempKelvin}K`}
              value={colorTempKelvin}
              min={2200}
              max={9500}
              step={100}
              onChange={(next) => setColorTempKelvin(next)}
            />
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="inline-flex items-center gap-1 font-medium text-fg-2">
                  <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>툰 셀 램프 단계</span>
                </span>
                <span className="font-semibold text-fg tabular-nums">{celStepCount}단계</span>
              </div>
              <div className="grid grid-cols-3 gap-1.5" role="group" aria-label="툰 셀 램프 단계 선택">
                {([2, 3, 4] as const).map((steps) => (
                  <button
                    key={steps}
                    type="button"
                    data-testid={`cel-steps-${steps}`}
                    aria-pressed={celStepCount === steps}
                    onClick={() => setCelStepCount(steps)}
                    className={celStepCount === steps ? BTN_CHIP_ACTIVE : BTN_OUTLINE}
                  >
                    {steps}단 셀
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* ③ WebGPU WGSL 컴퓨트 셰이더 계약 진단 */}
          <div className="rounded-lg border border-line bg-card p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-xs font-bold text-fg">
                <Code2 className="h-3.5 w-3.5 text-accent" aria-hidden="true" />
                <span>WGSL 구조 검사 (컴파일·실행 미검증)</span>
              </div>
              <button
                type="button"
                data-testid="toggle-wgsl-inspector"
                aria-expanded={showWgslInspector}
                onClick={() => setShowWgslInspector((prev) => !prev)}
                className={BTN_OUTLINE}
              >
                {showWgslInspector ? "접기" : "계약 보기"}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div className="rounded-md border border-line bg-canvas p-2">
                <div className="text-[11px] text-fg-3">XPBD 솔버 WGSL</div>
                <div className="font-semibold text-good">
                  {xpbdWgslAudit.valid ? "구조 확인" : "오류"} · {xpbdWgslAudit.entryPoints.length}패스 · CPU 물리 실행
                </div>
              </div>
              <div className="rounded-md border border-line bg-canvas p-2">
                <div className="text-[11px] text-fg-3">SDF 광원 베이크 WGSL</div>
                <div className="font-semibold text-good">
                  {sdfWgslAudit.valid ? "구조 확인" : "오류"} · CPU SDF 실행
                </div>
                <div className="text-fg-3">{lightRig.webGpuApiAvailable ? "WebGPU API 있음 · GPU 실행 안 함" : "WebGPU API 없음 · GPU 실행 안 함"}</div>
              </div>
            </div>
            {showWgslInspector ? (
              <pre
                data-testid="wgsl-contract-summary"
                className="mt-2 max-h-40 overflow-auto rounded-md border border-line bg-canvas p-2 text-[11px] text-fg-2"
              >
                {`[XPBD] entry: ${xpbdWgslAudit.entryPoints.join(", ")} (bindings: ${xpbdWgslAudit.bindings.length})\n[SDF]  entry: ${sdfWgslAudit.entryPoints.join(", ")} (bindings: ${sdfWgslAudit.bindings.length})\n[HASH] physics=${simResult.metrics.stateHashHex} light=${lightRig.bakeHashHex}`}
              </pre>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}
