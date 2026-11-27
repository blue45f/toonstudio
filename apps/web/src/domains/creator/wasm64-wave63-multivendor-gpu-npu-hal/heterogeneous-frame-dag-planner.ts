/**
 * Wave-63: 단일 프레임 이종 다중 가속기(dGPU + iGPU + NPU + Optical Flow + CPU SIMD)
 * 병렬 작업 분할(Heterogeneous Frame DAG) 스케줄러.
 */

import {
  NPU_ACCELERATOR_CATALOG,
  type AcceleratorBackendId,
  type HeterogeneousExecutionLane,
} from "./hardware-capability-catalog";
import type {
  HardwareAccelerationProfile,
  UpscalerAndLatencySelection,
} from "./multivendor-upscaler-npu-hal";

/** 이종 다중 가속기 프레임 워크로드 입력. */
export interface HeterogeneousFrameWorkloadInput {
  readonly targetFrameBudgetMs: number;
  readonly canvasWidthPx: number;
  readonly canvasHeightPx: number;
  readonly enableRadianceCascades: boolean;
  readonly enableSemanticNpuPass: boolean;
  readonly enableOpticalFlowPass: boolean;
  readonly enableSplitResNativeLineart: boolean;
}

/** 단일 프레임 DAG 내 작업 노드. */
export interface HeterogeneousFrameTaskNode {
  readonly id: string;
  readonly label: string;
  readonly lane: HeterogeneousExecutionLane;
  readonly backendId: AcceleratorBackendId;
  readonly dependsOn: readonly string[];
  readonly estimatedDurationMs: number;
  readonly startMs: number;
  readonly endMs: number;
  readonly transferOverheadMs: number;
}

/** 단일 프레임 이종 병렬 스케줄링 결과. */
export interface HeterogeneousFramePlan {
  readonly targetFrameBudgetMs: number;
  readonly nodes: readonly HeterogeneousFrameTaskNode[];
  readonly parallelWaves: readonly (readonly string[])[];
  readonly laneBusyMs: Readonly<Record<HeterogeneousExecutionLane, number>>;
  readonly criticalPathMs: number;
  readonly sequentialBaselineMs: number;
  readonly parallelSpeedupRatio: number;
  readonly fitsFrameBudget: boolean;
  readonly memoryTransferOverheadMs: number;
  readonly zeroCopyTransferCount: number;
}

interface DraftTaskSpec {
  readonly id: string;
  readonly label: string;
  readonly lane: HeterogeneousExecutionLane;
  readonly dependsOn: readonly string[];
  readonly estimatedDurationMs: number;
  readonly crossLaneRead: boolean;
}

function resolveLaneBackend(
  profile: HardwareAccelerationProfile,
  selection: UpscalerAndLatencySelection,
  lane: HeterogeneousExecutionLane,
): AcceleratorBackendId {
  if (lane === "npu") {
    const npuPriority: readonly AcceleratorBackendId[] = [
      "amd-xdna2",
      "qualcomm-hexagon-htp",
      "intel-ai-boost-npu",
      "apple-ane-coreml",
      "arm-ethos-u",
      "amd-xdna",
      "webnn-npu",
      "webnn-gpu",
      "wasm64-simd128",
    ];
    for (const id of npuPriority) {
      if (profile.executableAccelerators.includes(id)) return id;
    }
    return selection.primaryAiAccelerator;
  }
  if (lane === "optical-flow") {
    if (profile.executableAccelerators.includes("nvidia-nvenc-ofa")) return "nvidia-nvenc-ofa";
    if (profile.executableAccelerators.includes("webgpu-compute-dp4a-fp16")) {
      return "webgpu-compute-dp4a-fp16";
    }
    return "wasm64-simd128";
  }
  if (lane === "cpu-simd") {
    if (profile.executableAccelerators.includes("apple-amx-unified-zero-copy")) {
      return "apple-amx-unified-zero-copy";
    }
    if (profile.executableAccelerators.includes("arm-kleidiai-sme2")) return "arm-kleidiai-sme2";
    return "wasm64-simd128";
  }
  if (lane === "igpu") {
    if (profile.executableAccelerators.includes("webgpu-compute-dp4a-fp16")) {
      return "webgpu-compute-dp4a-fp16";
    }
    if (profile.executableAccelerators.includes("webnn-gpu")) return "webnn-gpu";
    return "wasm64-simd128";
  }
  if (profile.executableAccelerators.includes("nvidia-tensor-fp8-int4")) {
    return "nvidia-tensor-fp8-int4";
  }
  if (profile.executableAccelerators.includes("webgpu-compute-dp4a-fp16")) {
    return "webgpu-compute-dp4a-fp16";
  }
  return "wasm64-simd128";
}

/**
 * dGPU + iGPU + NPU + Optical Flow + CPU SIMD를 단일 프레임 DAG 안에서 병렬 분할 스케줄링한다.
 */
export function planHeterogeneousMultiAcceleratorFrame(
  profile: HardwareAccelerationProfile,
  selection: UpscalerAndLatencySelection,
  workload: HeterogeneousFrameWorkloadInput,
): HeterogeneousFramePlan {
  const pixelScale = Math.max(
    0.25,
    (workload.canvasWidthPx * workload.canvasHeightPx) / (2560 * 1440),
  );
  const paintRenderScaleArea = selection.renderScale * selection.renderScale;
  const gpuSpeedFactor = profile.webgpuAvailable || !profile.isBrowserSandboxed ? 1.0 : 2.6;
  const lineartLane: HeterogeneousExecutionLane =
    profile.hasDiscreteGpu && profile.hasIntegratedGpu && !profile.zeroCopyUnifiedMemory
      ? "igpu"
      : "dgpu";
  const hasDedicatedNpu = profile.executableAccelerators.some(
    (id) => NPU_ACCELERATOR_CATALOG[id].lane === "npu",
  );
  const npuLane: HeterogeneousExecutionLane = hasDedicatedNpu ? "npu" : "cpu-simd";
  const ofaLane: HeterogeneousExecutionLane =
    profile.supportsOpticalFlow && (!profile.isBrowserSandboxed || profile.webgpuAvailable)
      ? "optical-flow"
      : "dgpu";

  const draftTasks: DraftTaskSpec[] = [
    {
      id: "stylus-vrs-schedule",
      label: "펜촉 예측 및 Foveated VRS 타일 맵 생성",
      lane: "cpu-simd",
      dependsOn: [],
      estimatedDurationMs: Number((0.45 * Math.sqrt(pixelScale)).toFixed(3)),
      crossLaneRead: false,
    },
    {
      id: "lowres-paint-3d-pass",
      label: `분할 해상도(${Math.round(selection.renderScale * 100)}%) 채색·3D 배경 렌더`,
      lane: "dgpu",
      dependsOn: ["stylus-vrs-schedule"],
      estimatedDurationMs: Number(
        (2.4 * pixelScale * paintRenderScaleArea * gpuSpeedFactor).toFixed(3),
      ),
      crossLaneRead: true,
    },
  ];

  if (workload.enableSemanticNpuPass) {
    draftTasks.push({
      id: "npu-semantic-flatting-denoise",
      label: "NPU 시맨틱 채색 마스크·노이즈 추론",
      lane: npuLane,
      dependsOn: ["stylus-vrs-schedule"],
      estimatedDurationMs: Number((hasDedicatedNpu ? 1.35 : 2.8).toFixed(3)),
      crossLaneRead: true,
    });
  }
  if (workload.enableOpticalFlowPass) {
    draftTasks.push({
      id: "optical-flow-motion-vectors",
      label: "광학 흐름(OFA) 프레임 모션 벡터 추정",
      lane: ofaLane,
      dependsOn: ["stylus-vrs-schedule"],
      estimatedDurationMs: Number((ofaLane === "optical-flow" ? 0.85 : 1.55).toFixed(3)),
      crossLaneRead: true,
    });
  }
  if (workload.enableRadianceCascades) {
    draftTasks.push({
      id: "radiance-cascades-gi-25d",
      label: "2.5D Radiance Cascades 실시간 간접광 솔브",
      lane: "dgpu",
      dependsOn: ["lowres-paint-3d-pass"],
      estimatedDurationMs: Number(
        (1.25 * pixelScale * paintRenderScaleArea * gpuSpeedFactor).toFixed(3),
      ),
      crossLaneRead: false,
    });
  }

  const upscaleDeps: string[] = [
    workload.enableRadianceCascades ? "radiance-cascades-gi-25d" : "lowres-paint-3d-pass",
  ];
  if (workload.enableOpticalFlowPass) upscaleDeps.push("optical-flow-motion-vectors");
  draftTasks.push({
    id: "upscale-super-resolution",
    label: `${selection.activeUpscalerSpec.displayName} 업스케일·RCAS`,
    lane: "dgpu",
    dependsOn: upscaleDeps,
    estimatedDurationMs: Number(
      (selection.activeUpscalerSpec.estimatedUpscaleCostMs1440p * pixelScale).toFixed(3),
    ),
    crossLaneRead: workload.enableOpticalFlowPass,
  });

  if (workload.enableSplitResNativeLineart) {
    draftTasks.push({
      id: "native-2d-lineart-raster",
      label: "100% 네이티브 해상도 2D 잉크 선화 래스터",
      lane: lineartLane,
      dependsOn: ["stylus-vrs-schedule"],
      estimatedDurationMs: Number((1.15 * pixelScale).toFixed(3)),
      crossLaneRead: lineartLane !== "dgpu",
    });
  }

  const compositeDeps: string[] = ["upscale-super-resolution"];
  if (workload.enableSplitResNativeLineart) compositeDeps.push("native-2d-lineart-raster");
  if (workload.enableSemanticNpuPass) compositeDeps.push("npu-semantic-flatting-denoise");
  draftTasks.push({
    id: "split-res-composite-present",
    label: `Split-Res 선화 무손실 합성 + ${selection.activeLatencySpec.displayName}`,
    lane: "dgpu",
    dependsOn: compositeDeps,
    estimatedDurationMs: Number((0.45 * Math.sqrt(pixelScale)).toFixed(3)),
    crossLaneRead: workload.enableSemanticNpuPass || lineartLane !== "dgpu",
  });

  const laneAvailableAt: Record<HeterogeneousExecutionLane, number> = {
    dgpu: 0,
    igpu: 0,
    npu: 0,
    "optical-flow": 0,
    "cpu-simd": 0,
  };
  const laneBusyMs: Record<HeterogeneousExecutionLane, number> = {
    dgpu: 0,
    igpu: 0,
    npu: 0,
    "optical-flow": 0,
    "cpu-simd": 0,
  };
  const completedEndMs = new Map<string, number>();
  const completedWaveIdx = new Map<string, number>();
  const waveBuckets = new Map<number, string[]>();
  const nodes: HeterogeneousFrameTaskNode[] = [];

  let totalTransferMs = 0;
  let zeroCopyTransferCount = 0;
  let sequentialBaselineMs = 0;

  for (const task of draftTasks) {
    let depReadyAt = 0;
    let maxParentWave = -1;
    for (const depId of task.dependsOn) {
      const depEnd = completedEndMs.get(depId) ?? 0;
      if (depEnd > depReadyAt) depReadyAt = depEnd;
      const depWave = completedWaveIdx.get(depId) ?? 0;
      if (depWave > maxParentWave) maxParentWave = depWave;
    }

    const backendId = resolveLaneBackend(profile, selection, task.lane);
    const isZeroCopy =
      profile.zeroCopyUnifiedMemory || NPU_ACCELERATOR_CATALOG[backendId].zeroCopyWithGpu;
    const transferOverheadMs = !task.crossLaneRead ? 0 : isZeroCopy ? 0 : 0.22;
    if (task.crossLaneRead && isZeroCopy) zeroCopyTransferCount += 1;
    totalTransferMs += transferOverheadMs;

    const startMs = Number(
      Math.max(depReadyAt + transferOverheadMs, laneAvailableAt[task.lane]).toFixed(3),
    );
    const endMs = Number((startMs + task.estimatedDurationMs).toFixed(3));
    laneAvailableAt[task.lane] = endMs;
    laneBusyMs[task.lane] = Number((laneBusyMs[task.lane] + task.estimatedDurationMs).toFixed(3));
    completedEndMs.set(task.id, endMs);

    const waveIndex = maxParentWave + 1;
    completedWaveIdx.set(task.id, waveIndex);
    const bucket = waveBuckets.get(waveIndex) ?? [];
    bucket.push(task.id);
    waveBuckets.set(waveIndex, bucket);
    sequentialBaselineMs += task.estimatedDurationMs + transferOverheadMs;

    nodes.push({
      id: task.id,
      label: task.label,
      lane: task.lane,
      backendId,
      dependsOn: task.dependsOn,
      estimatedDurationMs: task.estimatedDurationMs,
      startMs,
      endMs,
      transferOverheadMs,
    });
  }

  let criticalPathMs = 0;
  for (const node of nodes) {
    if (node.endMs > criticalPathMs) criticalPathMs = node.endMs;
  }
  const parallelWaves = Array.from(waveBuckets.keys())
    .sort((a, b) => a - b)
    .map((key) => waveBuckets.get(key) ?? []);

  return {
    targetFrameBudgetMs: workload.targetFrameBudgetMs,
    nodes,
    parallelWaves,
    laneBusyMs,
    criticalPathMs: Number(criticalPathMs.toFixed(3)),
    sequentialBaselineMs: Number(sequentialBaselineMs.toFixed(3)),
    parallelSpeedupRatio:
      criticalPathMs > 0 ? Number((sequentialBaselineMs / criticalPathMs).toFixed(3)) : 1,
    fitsFrameBudget: criticalPathMs <= workload.targetFrameBudgetMs,
    memoryTransferOverheadMs: Number(totalTransferMs.toFixed(3)),
    zeroCopyTransferCount,
  };
}
