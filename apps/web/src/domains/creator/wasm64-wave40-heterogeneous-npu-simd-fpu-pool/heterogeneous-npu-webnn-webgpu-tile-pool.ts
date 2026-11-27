/**
 * Wave 40 — 온디바이스 신경망 그래프 파티셔너, WebNN(NPU) · ONNX Runtime Web · WebGPU · WASM SIMD
 * 이기종 하드웨어 가속 풀 및 헤일로 패딩(Halo Overlap) + 2D Hann/코사인 블렌딩 무경계 타일 파이프라인.
 */

export type AcceleratorBackendKind = "webnn-npu" | "onnx-runtime-web" | "webgpu-compute" | "wasm-simd128" | "cpu-scalar";
export type ComputePrecisionProfile = "int4" | "int8" | "fp16" | "bf16" | "fp32";
export type NeuralOperatorKind =
  | "Conv2D"
  | "DepthwiseConv2D"
  | "MatMul"
  | "Attention"
  | "LayerNorm"
  | "Gelu"
  | "CustomPostProcess"
  | "ResizeBlend";
export type DeviceThermalState = "nominal" | "fair" | "serious" | "critical";
export type DeviceMemoryPressure = "normal" | "moderate" | "critical";
export type TileBlendWindowKind = "hann" | "cosine";

export interface NeuralGraphNodeSpec {
  readonly id: string;
  readonly op: NeuralOperatorKind;
  readonly estimatedMacs: number;
  readonly workspaceMb: number;
  readonly supportsQuantizedInt8?: boolean;
  readonly supportsQuantizedInt4?: boolean;
  readonly preferredPrecision?: ComputePrecisionProfile;
}

export interface AcceleratorHardwareCapabilities {
  readonly webnnNpu: boolean;
  readonly webnnInt8Supported?: boolean;
  readonly onnxRuntimeWeb: boolean;
  readonly webgpuCompute: boolean;
  readonly webgpuShaderF16?: boolean;
  readonly wasmSimd128: boolean;
}

export interface HardwarePoolRuntimeStatus {
  readonly capabilities: AcceleratorHardwareCapabilities;
  readonly thermalState: DeviceThermalState;
  readonly memoryPressure: DeviceMemoryPressure;
  readonly availableMemoryMb: number;
  readonly lostBackends?: readonly AcceleratorBackendKind[];
}

export interface RoutedNeuralNodeAssignment {
  readonly nodeId: string;
  readonly op: NeuralOperatorKind;
  readonly primaryBackend: AcceleratorBackendKind;
  readonly precision: ComputePrecisionProfile;
  readonly fallbackChain: readonly AcceleratorBackendKind[];
  readonly routingReason: string;
}

export interface NeuralSubgraphPartition {
  readonly partitionIndex: number;
  readonly backend: AcceleratorBackendKind;
  readonly precision: ComputePrecisionProfile;
  readonly fallbackChain: readonly AcceleratorBackendKind[];
  readonly nodeIds: readonly string[];
  readonly totalEstimatedMacs: number;
  readonly peakWorkspaceMb: number;
}

export interface NeuralGraphPartitionPlan {
  readonly assignments: readonly RoutedNeuralNodeAssignment[];
  readonly partitions: readonly NeuralSubgraphPartition[];
  readonly crossBackendTransfers: number;
  readonly thermalThrottled: boolean;
  readonly memoryConstrained: boolean;
}

export interface BackendFailoverEvent {
  readonly partitionIndex: number;
  readonly failedBackend: AcceleratorBackendKind;
  readonly fallbackBackend: AcceleratorBackendKind;
  readonly errorMessage: string;
}

export interface PartitionExecutionContext {
  readonly partition: NeuralSubgraphPartition;
  readonly activeBackend: AcceleratorBackendKind;
  readonly activePrecision: ComputePrecisionProfile;
}

export type BackendPartitionExecutor<TResult> = (ctx: PartitionExecutionContext) => Promise<TResult> | TResult;

export interface HeterogeneousExecutionResult<TResult> {
  readonly outputs: readonly TResult[];
  readonly executedBackends: readonly AcceleratorBackendKind[];
  readonly failoverEvents: readonly BackendFailoverEvent[];
  readonly updatedLostBackends: readonly AcceleratorBackendKind[];
  readonly uninterrupted: boolean;
}

export interface HaloTileDescriptor {
  readonly tileIndex: number;
  readonly gridX: number;
  readonly gridY: number;
  readonly coreX0: number;
  readonly coreY0: number;
  readonly coreWidth: number;
  readonly coreHeight: number;
  readonly extractX0: number;
  readonly extractY0: number;
  readonly extractWidth: number;
  readonly extractHeight: number;
  readonly innerOffsetX: number;
  readonly innerOffsetY: number;
}

export interface HaloTiledCanvasConfig {
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly coreTileSize: number;
  readonly haloPx: number;
  readonly windowKind?: TileBlendWindowKind;
  readonly seamJumpThreshold?: number;
}

export type AsyncTileInferenceRunner = (patchData: Float32Array, descriptor: HaloTileDescriptor) => Promise<Float32Array> | Float32Array;

export interface HaloTiledInferenceResult {
  readonly output: Float32Array;
  readonly width: number;
  readonly height: number;
  readonly channels: number;
  readonly tileCount: number;
  readonly windowKind: TileBlendWindowKind;
  readonly seamArtifactCount: number;
  readonly maxBoundaryStepJump: number;
  readonly minWeightCoverage: number;
}

const TENSOR_HEAVY_OPS: ReadonlySet<NeuralOperatorKind> = new Set(["Conv2D", "DepthwiseConv2D", "MatMul", "Attention"]);
const CUSTOM_POST_OPS: ReadonlySet<NeuralOperatorKind> = new Set(["CustomPostProcess", "ResizeBlend"]);

function buildHealthyBackendSet(status: HardwarePoolRuntimeStatus): Set<AcceleratorBackendKind> {
  const lost = new Set<AcceleratorBackendKind>(status.lostBackends ?? []);
  const healthy = new Set<AcceleratorBackendKind>(["cpu-scalar"]);
  if (status.capabilities.wasmSimd128 && !lost.has("wasm-simd128")) healthy.add("wasm-simd128");
  if (status.capabilities.webgpuCompute && !lost.has("webgpu-compute") && status.thermalState !== "critical") healthy.add("webgpu-compute");
  if (status.capabilities.onnxRuntimeWeb && !lost.has("onnx-runtime-web")) healthy.add("onnx-runtime-web");
  if (status.capabilities.webnnNpu && !lost.has("webnn-npu")) healthy.add("webnn-npu");
  return healthy;
}

function selectPrecisionForNode(
  node: NeuralGraphNodeSpec,
  backend: AcceleratorBackendKind,
  status: HardwarePoolRuntimeStatus,
): ComputePrecisionProfile {
  const memoryTight = status.memoryPressure !== "normal" || node.workspaceMb > status.availableMemoryMb * 0.5;
  const thermallyConstrained = status.thermalState === "serious" || status.thermalState === "critical";
  if (status.memoryPressure === "critical" && node.supportsQuantizedInt4) return "int4";
  if ((memoryTight || thermallyConstrained) && node.supportsQuantizedInt8) {
    if (backend !== "webnn-npu" || (status.capabilities.webnnInt8Supported ?? true)) return "int8";
  }
  if (backend === "webnn-npu") return node.preferredPrecision === "int8" && (status.capabilities.webnnInt8Supported ?? true) ? "int8" : "fp16";
  if (backend === "webgpu-compute") return (status.capabilities.webgpuShaderF16 ?? true) ? "fp16" : "fp32";
  if (backend === "onnx-runtime-web") return node.supportsQuantizedInt8 && memoryTight ? "int8" : "fp16";
  return node.preferredPrecision === "bf16" ? "bf16" : "fp32";
}

function buildOrderedCandidates(
  node: NeuralGraphNodeSpec,
  previousBackend: AcceleratorBackendKind | null,
  status: HardwarePoolRuntimeStatus,
  healthy: ReadonlySet<AcceleratorBackendKind>,
): { readonly chain: AcceleratorBackendKind[]; readonly reason: string } {
  if (node.workspaceMb > status.availableMemoryMb) {
    const lowMem: AcceleratorBackendKind[] = ["onnx-runtime-web", "wasm-simd128", "cpu-scalar"];
    return { chain: lowMem.filter((b) => healthy.has(b)), reason: "가용 메모리 상한 초과로 스트리밍 ONNX/SIMD 백엔드로 우회" };
  }
  if (TENSOR_HEAVY_OPS.has(node.op)) {
    const order: AcceleratorBackendKind[] =
      status.thermalState === "serious"
        ? ["webnn-npu", "onnx-runtime-web", "wasm-simd128", "webgpu-compute", "cpu-scalar"]
        : ["webnn-npu", "onnx-runtime-web", "webgpu-compute", "wasm-simd128", "cpu-scalar"];
    return {
      chain: order.filter((b) => healthy.has(b)),
      reason: status.thermalState === "critical" ? "열 스로틀링 critical 상태로 고발열 GPU를 배제하고 저전력 NPU/SIMD로 라우팅" : "고밀도 텐서 연산 NPU 최우선 배치",
    };
  }
  if (CUSTOM_POST_OPS.has(node.op)) {
    const order: AcceleratorBackendKind[] = ["webgpu-compute", "wasm-simd128", "onnx-runtime-web", "cpu-scalar"];
    return { chain: order.filter((b) => healthy.has(b)), reason: "커스텀 후처리·블렌딩 커널을 WebGPU Compute / WASM SIMD에 배치" };
  }
  const sticky: AcceleratorBackendKind[] = previousBackend
    ? [previousBackend, "webnn-npu", "onnx-runtime-web", "webgpu-compute", "wasm-simd128", "cpu-scalar"]
    : ["onnx-runtime-web", "webnn-npu", "webgpu-compute", "wasm-simd128", "cpu-scalar"];
  const deduped: AcceleratorBackendKind[] = [];
  for (const candidate of sticky) {
    if (healthy.has(candidate) && !deduped.includes(candidate)) deduped.push(candidate);
  }
  return { chain: deduped, reason: "디바이스 간 텐서 복사 최소화를 위한 인접 백엔드 융합 배치" };
}

export function partitionAndRouteNeuralGraph(
  nodes: readonly NeuralGraphNodeSpec[],
  status: HardwarePoolRuntimeStatus,
): NeuralGraphPartitionPlan {
  const healthy = buildHealthyBackendSet(status);
  const assignments: RoutedNeuralNodeAssignment[] = [];
  const partitions: NeuralSubgraphPartition[] = [];
  let prevBackend: AcceleratorBackendKind | null = null;

  for (const node of nodes) {
    const { chain, reason } = buildOrderedCandidates(node, prevBackend, status, healthy);
    const primaryBackend = chain[0] ?? "cpu-scalar";
    const precision = selectPrecisionForNode(node, primaryBackend, status);
    const fallbackChain = chain.length > 0 ? chain : (["cpu-scalar"] as const);
    assignments.push({ nodeId: node.id, op: node.op, primaryBackend, precision, fallbackChain, routingReason: reason });

    const last = partitions[partitions.length - 1];
    if (last && last.backend === primaryBackend && last.precision === precision) {
      partitions[partitions.length - 1] = {
        ...last,
        nodeIds: [...last.nodeIds, node.id],
        totalEstimatedMacs: last.totalEstimatedMacs + node.estimatedMacs,
        peakWorkspaceMb: Math.max(last.peakWorkspaceMb, node.workspaceMb),
      };
    } else {
      partitions.push({
        partitionIndex: partitions.length,
        backend: primaryBackend,
        precision,
        fallbackChain,
        nodeIds: [node.id],
        totalEstimatedMacs: node.estimatedMacs,
        peakWorkspaceMb: node.workspaceMb,
      });
    }
    prevBackend = primaryBackend;
  }

  return {
    assignments,
    partitions,
    crossBackendTransfers: Math.max(0, partitions.length - 1),
    thermalThrottled: status.thermalState === "serious" || status.thermalState === "critical",
    memoryConstrained: status.memoryPressure !== "normal",
  };
}

export async function executeHeterogeneousGraphWithFallback<TResult>(
  plan: NeuralGraphPartitionPlan,
  status: HardwarePoolRuntimeStatus,
  executor: BackendPartitionExecutor<TResult>,
): Promise<HeterogeneousExecutionResult<TResult>> {
  const lostSet = new Set<AcceleratorBackendKind>(status.lostBackends ?? []);
  const outputs: TResult[] = [];
  const executedBackends: AcceleratorBackendKind[] = [];
  const failoverEvents: BackendFailoverEvent[] = [];

  for (const partition of plan.partitions) {
    const filtered = partition.fallbackChain.filter((b) => b === "cpu-scalar" || !lostSet.has(b));
    const effectiveChain: readonly AcceleratorBackendKind[] = filtered.length > 0 ? filtered : ["cpu-scalar"];
    let succeeded = false;
    let lastError: unknown = null;

    for (let idx = 0; idx < effectiveChain.length; idx += 1) {
      const candidate = effectiveChain[idx] ?? "cpu-scalar";
      const activePrecision: ComputePrecisionProfile = candidate === "wasm-simd128" || candidate === "cpu-scalar" ? "fp32" : partition.precision;
      try {
        outputs.push(await executor({ partition, activeBackend: candidate, activePrecision }));
        executedBackends.push(candidate);
        succeeded = true;
        break;
      } catch (error) {
        lastError = error;
        if (candidate !== "cpu-scalar") lostSet.add(candidate);
        const nextBackend = effectiveChain[idx + 1];
        if (nextBackend) {
          failoverEvents.push({
            partitionIndex: partition.partitionIndex,
            failedBackend: candidate,
            fallbackBackend: nextBackend,
            errorMessage: error instanceof Error ? error.message : String(error),
          });
        }
      }
    }
    if (!succeeded) {
      throw lastError instanceof Error ? lastError : new Error(`파티션 ${partition.partitionIndex} 모든 폴백 백엔드 실행 실패`);
    }
  }
  return { outputs, executedBackends, failoverEvents, updatedLostBackends: [...lostSet], uninterrupted: outputs.length === plan.partitions.length };
}

function reflectClampCoord(coord: number, limit: number): number {
  if (limit <= 1) return 0;
  let c = coord < 0 ? -coord : coord;
  if (c >= limit) c = 2 * limit - 2 - c;
  return c < 0 ? 0 : c >= limit ? limit - 1 : c;
}

function evaluateTaperWeight(u: number, windowKind: TileBlendWindowKind): number {
  const clamped = u <= 0 ? 0 : u >= 1 ? 1 : u;
  return windowKind === "hann" ? 0.5 * (1 - Math.cos(Math.PI * clamped)) : Math.sin(0.5 * Math.PI * clamped);
}

function compute1DTileAxisWeight(
  canvasCoord: number,
  coreStart: number,
  coreEnd: number,
  canvasLimit: number,
  blendHalo: number,
  windowKind: TileBlendWindowKind,
): number {
  if (blendHalo <= 0) return canvasCoord >= coreStart && canvasCoord < coreEnd ? 1 : 0;
  let w = 1;
  if (coreStart > 0 && canvasCoord < coreStart + blendHalo) {
    w *= evaluateTaperWeight((canvasCoord + 0.5 - (coreStart - blendHalo)) / (2 * blendHalo), windowKind);
  }
  if (coreEnd < canvasLimit && canvasCoord >= coreEnd - blendHalo) {
    w *= evaluateTaperWeight((coreEnd + blendHalo - (canvasCoord + 0.5)) / (2 * blendHalo), windowKind);
  }
  return w;
}

export function buildHaloTileGrid(config: HaloTiledCanvasConfig): readonly HaloTileDescriptor[] {
  const width = Math.max(1, Math.trunc(config.width));
  const height = Math.max(1, Math.trunc(config.height));
  const coreTileSize = Math.max(4, Math.trunc(config.coreTileSize));
  const haloPx = Math.max(0, Math.trunc(config.haloPx));
  const descriptors: HaloTileDescriptor[] = [];
  let tileIndex = 0;

  for (let gridY = 0, coreY0 = 0; coreY0 < height; gridY += 1, coreY0 += coreTileSize) {
    const coreHeight = Math.min(coreTileSize, height - coreY0);
    for (let gridX = 0, coreX0 = 0; coreX0 < width; gridX += 1, coreX0 += coreTileSize) {
      const coreWidth = Math.min(coreTileSize, width - coreX0);
      descriptors.push({
        tileIndex,
        gridX,
        gridY,
        coreX0,
        coreY0,
        coreWidth,
        coreHeight,
        extractX0: coreX0 - haloPx,
        extractY0: coreY0 - haloPx,
        extractWidth: coreWidth + haloPx * 2,
        extractHeight: coreHeight + haloPx * 2,
        innerOffsetX: haloPx,
        innerOffsetY: haloPx,
      });
      tileIndex += 1;
    }
  }
  return descriptors;
}

function measureTileBoundaryStepArtifacts(
  image: Float32Array,
  width: number,
  height: number,
  channels: number,
  coreTileSize: number,
  seamJumpThreshold: number,
): { readonly seamArtifactCount: number; readonly maxBoundaryStepJump: number } {
  let seamArtifactCount = 0;
  let maxBoundaryStepJump = 0;

  for (let seamX = coreTileSize; seamX < width - 1; seamX += coreTileSize) {
    if (seamX < 2) continue;
    for (let c = 0; c < channels; c += 1) {
      let bSum = 0;
      let iSum = 0;
      for (let y = 0; y < height; y += 1) {
        const pL2 = image[(y * width + (seamX - 2)) * channels + c] ?? 0;
        const pL1 = image[(y * width + (seamX - 1)) * channels + c] ?? 0;
        const pR0 = image[(y * width + seamX) * channels + c] ?? 0;
        const pR1 = image[(y * width + (seamX + 1)) * channels + c] ?? 0;
        bSum += Math.abs(pR0 - pL1);
        iSum += 0.5 * (Math.abs(pL1 - pL2) + Math.abs(pR1 - pR0));
      }
      const excess = Math.max(0, bSum / height - (iSum / height) * 1.35);
      if (excess > maxBoundaryStepJump) maxBoundaryStepJump = excess;
      if (excess > seamJumpThreshold) seamArtifactCount += 1;
    }
  }

  for (let seamY = coreTileSize; seamY < height - 1; seamY += coreTileSize) {
    if (seamY < 2) continue;
    for (let c = 0; c < channels; c += 1) {
      let bSum = 0;
      let iSum = 0;
      for (let x = 0; x < width; x += 1) {
        const pT2 = image[((seamY - 2) * width + x) * channels + c] ?? 0;
        const pT1 = image[((seamY - 1) * width + x) * channels + c] ?? 0;
        const pB0 = image[(seamY * width + x) * channels + c] ?? 0;
        const pB1 = image[((seamY + 1) * width + x) * channels + c] ?? 0;
        bSum += Math.abs(pB0 - pT1);
        iSum += 0.5 * (Math.abs(pT1 - pT2) + Math.abs(pB1 - pB0));
      }
      const excess = Math.max(0, bSum / width - (iSum / width) * 1.35);
      if (excess > maxBoundaryStepJump) maxBoundaryStepJump = excess;
      if (excess > seamJumpThreshold) seamArtifactCount += 1;
    }
  }
  return { seamArtifactCount, maxBoundaryStepJump };
}

export async function executeHaloTiledCanvasInference(
  canvasData: Float32Array,
  config: HaloTiledCanvasConfig,
  inferTile: AsyncTileInferenceRunner,
): Promise<HaloTiledInferenceResult> {
  const width = Math.max(1, Math.trunc(config.width));
  const height = Math.max(1, Math.trunc(config.height));
  const channels = Math.max(1, Math.trunc(config.channels));
  const coreTileSize = Math.max(4, Math.trunc(config.coreTileSize));
  const haloPx = Math.max(0, Math.trunc(config.haloPx));
  const windowKind: TileBlendWindowKind = config.windowKind ?? "hann";
  const seamJumpThreshold = config.seamJumpThreshold ?? 0.025;
  const receptiveGuardPx = haloPx >= 4 ? Math.floor(haloPx / 2) : 0;
  const blendHalo = Math.min(haloPx - receptiveGuardPx, Math.floor(coreTileSize / 2));
  const descriptors = buildHaloTileGrid({ width, height, channels, coreTileSize, haloPx, windowKind });

  const inferredPatches = await Promise.all(
    descriptors.map(async (desc) => {
      const patch = new Float32Array(desc.extractWidth * desc.extractHeight * channels);
      for (let py = 0; py < desc.extractHeight; py += 1) {
        const srcY = reflectClampCoord(desc.extractY0 + py, height);
        for (let px = 0; px < desc.extractWidth; px += 1) {
          const srcBase = (srcY * width + reflectClampCoord(desc.extractX0 + px, width)) * channels;
          const dstBase = (py * desc.extractWidth + px) * channels;
          for (let c = 0; c < channels; c += 1) patch[dstBase + c] = canvasData[srcBase + c] ?? 0;
        }
      }
      return inferTile(patch, desc);
    }),
  );

  const pixelTotal = width * height;
  const weightedAccum = new Float64Array(pixelTotal * channels);
  const weightSum = new Float64Array(pixelTotal);

  for (let t = 0; t < descriptors.length; t += 1) {
    const desc = descriptors[t];
    const patchOut = inferredPatches[t];
    if (!desc || !patchOut) continue;
    const coreXEnd = desc.coreX0 + desc.coreWidth;
    const coreYEnd = desc.coreY0 + desc.coreHeight;
    const activeX0 = Math.max(0, desc.coreX0 - blendHalo);
    const activeX1 = Math.min(width, coreXEnd + blendHalo);
    const activeY0 = Math.max(0, desc.coreY0 - blendHalo);
    const activeY1 = Math.min(height, coreYEnd + blendHalo);

    for (let cy = activeY0; cy < activeY1; cy += 1) {
      const wy = compute1DTileAxisWeight(cy, desc.coreY0, coreYEnd, height, blendHalo, windowKind);
      if (wy <= 0) continue;
      const patchY = cy - desc.extractY0;
      for (let cx = activeX0; cx < activeX1; cx += 1) {
        const w = compute1DTileAxisWeight(cx, desc.coreX0, coreXEnd, width, blendHalo, windowKind) * wy;
        if (w <= 0) continue;
        const patchBase = (patchY * desc.extractWidth + (cx - desc.extractX0)) * channels;
        const pixelIdx = cy * width + cx;
        const canvasBase = pixelIdx * channels;
        weightSum[pixelIdx] = (weightSum[pixelIdx] ?? 0) + w;
        for (let c = 0; c < channels; c += 1) {
          weightedAccum[canvasBase + c] = (weightedAccum[canvasBase + c] ?? 0) + (patchOut[patchBase + c] ?? 0) * w;
        }
      }
    }
  }

  const output = new Float32Array(pixelTotal * channels);
  let minWeightCoverage = Number.POSITIVE_INFINITY;
  for (let i = 0; i < pixelTotal; i += 1) {
    const sumW = weightSum[i] ?? 0;
    if (sumW < minWeightCoverage) minWeightCoverage = sumW;
    const invW = sumW > 1e-12 ? 1 / sumW : 0;
    const base = i * channels;
    for (let c = 0; c < channels; c += 1) output[base + c] = (weightedAccum[base + c] ?? 0) * invW;
  }

  const seamStats = measureTileBoundaryStepArtifacts(output, width, height, channels, coreTileSize, seamJumpThreshold);
  return {
    output,
    width,
    height,
    channels,
    tileCount: descriptors.length,
    windowKind,
    seamArtifactCount: seamStats.seamArtifactCount,
    maxBoundaryStepJump: seamStats.maxBoundaryStepJump,
    minWeightCoverage: Number.isFinite(minWeightCoverage) ? minWeightCoverage : 0,
  };
}
