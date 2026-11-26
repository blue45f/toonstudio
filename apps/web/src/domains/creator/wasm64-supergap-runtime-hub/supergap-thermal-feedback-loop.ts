/**
 * 열·배터리 적응형 GPU/물리 폐루프 피드백 컨트롤러 (`ThermalAdaptiveRuntimeLoop`, ₩0 로컬).
 *
 * `AutonomousFrameTelemetryGate`(120Hz 프레임·힙·VRAM 계측)
 * → `ThermalBatteryAdaptivePacer`(열 드리프트 조기 예측 & 품질 프로파일 히스테리시스)
 * → 실시간 협조 제어:
 *   1) WebGPU 타일 VRS(`classifyVrsTileRatesCpu`): 프로파일별 엣지/기울기 임계치 동적 조정(선화/얼굴 1×1 보호)
 *   2) WebGPU SVT(`SparseVirtualTextureSystem`): `svtMipBias` 및 프레임당 업로드 상한 동적 연동
 *   3) 120Hz XPBD 의상/헤어 물리(`XpbdClothHairSolver`): `xpbdSubsteps` 상한 실시간 스로틀링
 *   4) 포비에이티드 타일 우선순위(`computeFoveatedTilePrioritySchedule`): 포비얼 반경·즉시 예산 동적 스케일링
 *   5) WebGPU 멀티패스 렌더 그래프(`WebGpuMultiPassRenderGraph`): 일시 VRAM 예산 및 가상 타일 배치 강제
 *
 * Studio 초기 진입 그래프에 정적 import하지 않고, 지연 로드(0B eager impact)로만 사용한다.
 */

import {
  createClothGridAsset,
  XpbdClothHairSolver,
  type XpbdStepMetrics,
} from "../wasm64-3d-neural-sim";
import {
  computeFoveatedTilePrioritySchedule,
  type FoveatedTilePrioritySchedule,
} from "../wasm64-foveated-haptic-narrative";
import {
  AutonomousFrameTelemetryGate,
  DEFAULT_VRAM_BUDGET_BYTES,
  TARGET_120HZ_FRAME_BUDGET_MS,
  type FrameTelemetryGateOptions,
  type FrameTelemetryGateReport,
} from "../wasm64-grid-brush-parallax-telemetry";
import {
  createWebtoonMultiPassPipeline,
  type CompiledRenderGraph,
  type VirtualTileBudgetPlan,
  type WebGpuMultiPassRenderGraph,
} from "../wasm64-multipass-copilot-ledger";
import {
  classifyVrsTileRatesCpu,
  VRS_DEFAULT_HIGH_DETAIL_EDGE_DENSITY,
  VRS_DEFAULT_HIGH_DETAIL_MEAN_GRADIENT,
  VRS_DEFAULT_MID_DETAIL_MEAN_GRADIENT,
  VRS_MASK_ALL_PROTECTED,
  type VrsClassificationResult,
} from "../wasm64-multiwindow-msdf-vrs-cad";
import {
  SparseVirtualTextureSystem,
  type SvtConfig,
  type SvtRuntimeMetrics,
  type SvtStreamFrameResult,
  type SvtViewportRect,
} from "../wasm64-ondevice-ai-svt";
import {
  ThermalBatteryAdaptivePacer,
  type DeviceThermalState,
  type FramePacerDirective,
  type ThermalPacerOptions,
  type ThermalQualityProfileId,
  type VrsShadingRate,
} from "../wasm64-publish-continuity-resilience";

export interface ThermalAdaptiveLoopOptions {
  readonly telemetryOptions?: FrameTelemetryGateOptions;
  readonly pacerOptions?: ThermalPacerOptions;
  readonly svtConfig?: SvtConfig;
  readonly renderGraphWidthPx?: number;
  readonly renderGraphHeightPx?: number;
  readonly baseTransientVramBudgetBytes?: number;
  readonly canvasWidthPx?: number;
  readonly canvasHeightPx?: number;
  readonly xpbdSolver?: XpbdClothHairSolver;
}

export interface ThermalFeedbackFrameInput {
  readonly cutId: string;
  readonly frameMs: number;
  readonly cpuMs?: number;
  readonly gpuMs?: number;
  readonly heapUsedBytes: number;
  readonly vramUsedBytes: number;
  readonly timestampMs: number;
  readonly batteryLevel?: number;
  readonly charging?: boolean;
  readonly lowPowerMode?: boolean;
  readonly thermalState?: DeviceThermalState;
  readonly focusX?: number;
  readonly focusY?: number;
  readonly stylusVelocityX?: number;
  readonly stylusVelocityY?: number;
  readonly viewportWidthPx?: number;
  readonly viewportHeightPx?: number;
  readonly svtViewport?: Omit<SvtViewportRect, "mipBias">;
  readonly vrsSampleTile?: {
    readonly width: number;
    readonly height: number;
    readonly rgba: Uint8Array | Uint8ClampedArray;
    readonly semanticMask?: Uint8Array | Uint32Array;
  };
}

export interface ThermalLiveControlOutputs {
  readonly profileId: ThermalQualityProfileId;
  readonly targetFps: number;
  readonly vrsRate: VrsShadingRate;
  readonly svtMipBias: number;
  readonly xpbdSubsteps: number;
  readonly postProcessEnabled: boolean;
  readonly fovealRadiusScale: number;
  readonly maxImmediateTiles: number;
  readonly vramBudgetScale: number;
  readonly effectiveTransientVramBudgetBytes: number;
}

export interface ThermalFeedbackCycleResult {
  readonly cycleIndex: number;
  readonly telemetryGate: FrameTelemetryGateReport;
  readonly pacerDirective: FramePacerDirective;
  readonly liveControls: ThermalLiveControlOutputs;
  readonly vrsResult: VrsClassificationResult;
  readonly svtFrame: SvtStreamFrameResult;
  readonly svtMetrics: SvtRuntimeMetrics;
  readonly xpbdMetrics: XpbdStepMetrics;
  readonly foveatedSchedule: FoveatedTilePrioritySchedule;
  readonly renderGraphBudget: {
    readonly activePassCount: number;
    readonly culledPassCount: number;
    readonly aliasingReductionPercent: number;
    readonly virtualTilePlan: VirtualTileBudgetPlan;
  };
  readonly elapsedMs: number;
  readonly serverCostKrw: 0;
}

interface ProfileScalingPreset {
  readonly vrsThresholdMultiplier: number;
  readonly svtMaxUploadsPerFrame: number;
  readonly fovealRadiusScale: number;
  readonly maxImmediateTiles: number;
  readonly vramBudgetScale: number;
}

const PROFILE_SCALING_PRESETS: Readonly<Record<ThermalQualityProfileId, ProfileScalingPreset>> = {
  "ultra-120hz": {
    vrsThresholdMultiplier: 1.0,
    svtMaxUploadsPerFrame: 16,
    fovealRadiusScale: 1.0,
    maxImmediateTiles: 24,
    vramBudgetScale: 1.0,
  },
  "balanced-90hz": {
    vrsThresholdMultiplier: 1.35,
    svtMaxUploadsPerFrame: 10,
    fovealRadiusScale: 0.85,
    maxImmediateTiles: 16,
    vramBudgetScale: 0.85,
  },
  "cool-60hz": {
    vrsThresholdMultiplier: 1.85,
    svtMaxUploadsPerFrame: 6,
    fovealRadiusScale: 0.68,
    maxImmediateTiles: 10,
    vramBudgetScale: 0.7,
  },
  "battery-saver-45hz": {
    vrsThresholdMultiplier: 2.5,
    svtMaxUploadsPerFrame: 3,
    fovealRadiusScale: 0.52,
    maxImmediateTiles: 6,
    vramBudgetScale: 0.55,
  },
};

function nowMs(): number {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function createDefaultVrsTile(): {
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly semanticMask: Uint8Array;
} {
  const width = 64;
  const height = 64;
  const rgba = new Uint8ClampedArray(width * height * 4);
  const semanticMask = new Uint8Array(width * height);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const idx = y * width + x;
      const off = idx * 4;
      // 좌상단 16×16: 보호 선화·얼굴 마스크, 우하단: 완만한 하늘 그라데이션
      const isLineZone = x < 16 && y < 16;
      const isMidDetail = x >= 16 && x < 32 && y < 32;
      if (isLineZone) {
        const ink = ((x + y) & 1) === 0 ? 20 : 235;
        rgba[off] = ink;
        rgba[off + 1] = ink;
        rgba[off + 2] = ink;
        rgba[off + 3] = 255;
        semanticMask[idx] = VRS_MASK_ALL_PROTECTED;
      } else if (isMidDetail) {
        const tone = 110 + ((x * 5 + y * 3) % 40);
        rgba[off] = tone;
        rgba[off + 1] = tone + 8;
        rgba[off + 2] = tone + 16;
        rgba[off + 3] = 255;
      } else {
        const sky = 210 + Math.floor((y / height) * 14);
        rgba[off] = sky - 12;
        rgba[off + 1] = sky - 4;
        rgba[off + 2] = Math.min(255, sky + 8);
        rgba[off + 3] = 255;
      }
    }
  }
  return { width, height, rgba, semanticMask };
}

function escalateThermalStateForVram(
  reported: DeviceThermalState | undefined,
  vramPressure: "healthy" | "warning" | "critical",
): DeviceThermalState | undefined {
  if (vramPressure === "critical") {
    return reported === "critical" ? "critical" : "serious";
  }
  if (vramPressure === "warning" && (reported === undefined || reported === "nominal")) {
    return "fair";
  }
  return reported;
}

/**
 * 120Hz 실프레임 텔레메트리 → 발열/배터리 페이서 → VRS·SVT·XPBD·포비에이티드·멀티패스 VRAM 예산
 * 폐루프 피드백 오케스트레이터.
 */
export class ThermalAdaptiveRuntimeLoop {
  readonly telemetryGate: AutonomousFrameTelemetryGate;
  readonly pacer: ThermalBatteryAdaptivePacer;
  readonly svt: SparseVirtualTextureSystem;
  readonly xpbdSolver: XpbdClothHairSolver;
  readonly renderGraph: WebGpuMultiPassRenderGraph;
  private readonly compiledGraph: CompiledRenderGraph;
  private readonly baseTransientVramBudgetBytes: number;
  private readonly canvasWidthPx: number;
  private readonly canvasHeightPx: number;
  private readonly defaultVrsTile: ReturnType<typeof createDefaultVrsTile>;
  private cycleCount = 0;

  constructor(options: ThermalAdaptiveLoopOptions = {}) {
    this.telemetryGate = new AutonomousFrameTelemetryGate({
      frameBudgetMs: TARGET_120HZ_FRAME_BUDGET_MS,
      vramBudgetBytes: DEFAULT_VRAM_BUDGET_BYTES,
      ...options.telemetryOptions,
    });
    this.pacer = new ThermalBatteryAdaptivePacer(options.pacerOptions);
    this.svt = new SparseVirtualTextureSystem(
      options.svtConfig ?? {
        virtualWidth: 16384,
        virtualHeight: 16384,
        tileSize: 256,
        tileBorderPx: 4,
        physicalAtlasTilesX: 8,
        physicalAtlasTilesY: 8,
        feedbackWidth: 16,
        feedbackHeight: 16,
      },
    );
    this.xpbdSolver =
      options.xpbdSolver ??
      new XpbdClothHairSolver(
        createClothGridAsset({
          kind: "cape",
          columns: 4,
          rows: 4,
          widthMeters: 0.6,
          heightMeters: 0.8,
        }),
        { substepHz: 120, maxSubstepsPerStep: 8, constraintIterations: 2 },
      );

    const graphW = options.renderGraphWidthPx ?? 2048;
    const graphH = options.renderGraphHeightPx ?? 2048;
    this.renderGraph = createWebtoonMultiPassPipeline({
      width: graphW,
      height: graphH,
      includeUnusedDebugPass: true,
    });
    this.compiledGraph = this.renderGraph.compile();
    this.baseTransientVramBudgetBytes = Math.max(
      16 * 1024 * 1024,
      options.baseTransientVramBudgetBytes ?? 256 * 1024 * 1024,
    );
    this.canvasWidthPx = Math.max(256, options.canvasWidthPx ?? 4096);
    this.canvasHeightPx = Math.max(256, options.canvasHeightPx ?? 4096);
    this.defaultVrsTile = createDefaultVrsTile();
  }

  /** 단일 실프레임 텔레메트리를 수집해 전 GPU·물리 서브시스템 제어값을 실시간 갱신한다. */
  public stepFrame(input: ThermalFeedbackFrameInput): ThermalFeedbackCycleResult {
    const t0 = nowMs();
    this.cycleCount += 1;

    // 1) 120Hz 프레임/힙/VRAM 텔레메트리 기록 및 게이트 판정
    this.telemetryGate.recordFrame({
      cutId: input.cutId,
      frameMs: input.frameMs,
      cpuMs: input.cpuMs,
      gpuMs: input.gpuMs,
      heapUsedBytes: input.heapUsedBytes,
      vramUsedBytes: input.vramUsedBytes,
      timestampMs: input.timestampMs,
    });
    const telemetryGate = this.telemetryGate.evaluateGate();

    // 2) 발열/배터리/VRAM 압력을 종합해 페이서 품질 프로파일 결정
    const effectiveThermal = escalateThermalStateForVram(
      input.thermalState,
      telemetryGate.vram.pressureLevel,
    );
    const pacerDirective = this.pacer.recordFrame({
      frameTimeMs: input.frameMs,
      batteryLevel: input.batteryLevel,
      charging: input.charging,
      lowPowerMode: input.lowPowerMode,
      thermalState: effectiveThermal,
    });

    const scaling = PROFILE_SCALING_PRESETS[pacerDirective.profileId];
    const effectiveTransientVramBudgetBytes = Math.max(
      8 * 1024 * 1024,
      Math.round(this.baseTransientVramBudgetBytes * scaling.vramBudgetScale),
    );

    // 3) VRS 타일 분류기: 열 티어가 내려갈수록 비보호 배경의 2×2/4×4 절감 폭을 확대
    const vrsTile = input.vrsSampleTile ?? this.defaultVrsTile;
    const vrsResult = classifyVrsTileRatesCpu({
      width: vrsTile.width,
      height: vrsTile.height,
      rgba: vrsTile.rgba,
      semanticMask: vrsTile.semanticMask,
      highDetailEdgeDensity: VRS_DEFAULT_HIGH_DETAIL_EDGE_DENSITY * scaling.vrsThresholdMultiplier,
      highDetailMeanGradient: VRS_DEFAULT_HIGH_DETAIL_MEAN_GRADIENT * scaling.vrsThresholdMultiplier,
      midDetailMeanGradient: VRS_DEFAULT_MID_DETAIL_MEAN_GRADIENT * scaling.vrsThresholdMultiplier,
    });

    // 4) SVT 희소 가상 텍스처: pacerDirective.svtMipBias 및 업로드 예산 실시간 주입
    const vpW = Math.max(64, input.viewportWidthPx ?? 1280);
    const vpH = Math.max(64, input.viewportHeightPx ?? 720);
    const svtViewport: SvtViewportRect = {
      minU: input.svtViewport?.minU ?? 0.25,
      minV: input.svtViewport?.minV ?? 0.25,
      spanU: input.svtViewport?.spanU ?? 0.25,
      spanV: input.svtViewport?.spanV ?? 0.25,
      screenWidthPx: input.svtViewport?.screenWidthPx ?? vpW,
      screenHeightPx: input.svtViewport?.screenHeightPx ?? vpH,
      mipBias: pacerDirective.svtMipBias,
    };
    const svtFrame = this.svt.streamResolveFrame(svtViewport, {
      maxUploadsPerFrame: scaling.svtMaxUploadsPerFrame,
      sampleWidth: 8,
      sampleHeight: 8,
    });
    const svtMetrics = this.svt.getMetrics();

    // 5) XPBD 의상/헤어 물리: 서브스텝 상한을 페이서 지시에 맞춰 라이브 스로틀링
    this.xpbdSolver.setMaxSubstepsPerStep(pacerDirective.xpbdSubsteps);
    const safeFrameDtSec =
      Number.isFinite(input.frameMs) && input.frameMs > 0
        ? Math.min(0.05, Math.max(1 / 240, input.frameMs / 1000))
        : 1 / pacerDirective.targetFps;
    const xpbdMetrics = this.xpbdSolver.step(safeFrameDtSec, pacerDirective.xpbdSubsteps);

    // 6) 포비에이티드 타일 우선순위: 포비얼 반경과 즉시 렌더링 타일 예산을 동적 축소/확장
    const minDim = Math.min(vpW, vpH);
    const foveatedSchedule = computeFoveatedTilePrioritySchedule({
      viewportWidthPx: vpW,
      viewportHeightPx: vpH,
      focusX: input.focusX ?? vpW * 0.5,
      focusY: input.focusY ?? vpH * 0.5,
      tileSizePx: 128,
      fovealRadiusPx: minDim * 0.2 * scaling.fovealRadiusScale,
      parafovealRadiusPx: minDim * 0.45 * scaling.fovealRadiusScale,
      velocityX: input.stylusVelocityX ?? 0,
      velocityY: input.stylusVelocityY ?? 0,
      maxImmediateTiles: scaling.maxImmediateTiles,
    });

    // 7) 멀티패스 WebGPU 렌더 그래프 가상 타일 VRAM 예산 강제
    const virtualTilePlan = this.renderGraph.enforceVirtualTileBudget(this.compiledGraph, {
      canvasWidthPx: this.canvasWidthPx,
      canvasHeightPx: this.canvasHeightPx,
      maxTransientVramBytes: effectiveTransientVramBudgetBytes,
      tileSizePx: 1024,
    });

    const liveControls: ThermalLiveControlOutputs = {
      profileId: pacerDirective.profileId,
      targetFps: pacerDirective.targetFps,
      vrsRate: pacerDirective.vrsTileRate,
      svtMipBias: pacerDirective.svtMipBias,
      xpbdSubsteps: pacerDirective.xpbdSubsteps,
      postProcessEnabled: pacerDirective.postProcessEnabled,
      fovealRadiusScale: scaling.fovealRadiusScale,
      maxImmediateTiles: scaling.maxImmediateTiles,
      vramBudgetScale: scaling.vramBudgetScale,
      effectiveTransientVramBudgetBytes,
    };

    return {
      cycleIndex: this.cycleCount,
      telemetryGate,
      pacerDirective,
      liveControls,
      vrsResult,
      svtFrame,
      svtMetrics,
      xpbdMetrics,
      foveatedSchedule,
      renderGraphBudget: {
        activePassCount: this.compiledGraph.scheduledPasses.length,
        culledPassCount: this.compiledGraph.culledPasses.length,
        aliasingReductionPercent: this.compiledGraph.memoryPlan.reductionPercent,
        virtualTilePlan,
      },
      elapsedMs: Math.max(0, Number((nowMs() - t0).toFixed(3))),
      serverCostKrw: 0,
    };
  }
}

/**
 * 일련의 실프레임 샘플에 대해 열·배터리 적응형 GPU/물리 피드백 루프를 일괄 실행한다.
 */
export function runThermalAdaptiveFeedbackCycle(
  frames: readonly ThermalFeedbackFrameInput[],
  options: ThermalAdaptiveLoopOptions = {},
): {
  readonly cycles: readonly ThermalFeedbackCycleResult[];
  readonly finalCycle: ThermalFeedbackCycleResult | null;
  readonly transitionCount: number;
  readonly totalElapsedMs: number;
  readonly serverCostKrw: 0;
} {
  const t0 = nowMs();
  const loop = new ThermalAdaptiveRuntimeLoop(options);
  const cycles: ThermalFeedbackCycleResult[] = [];
  for (let i = 0; i < frames.length; i += 1) {
    cycles.push(loop.stepFrame(frames[i]));
  }
  return {
    cycles,
    finalCycle: cycles.length > 0 ? cycles[cycles.length - 1] : null,
    transitionCount: loop.pacer.getTransitionCount(),
    totalElapsedMs: Math.max(0, Number((nowMs() - t0).toFixed(3))),
    serverCostKrw: 0,
  };
}
