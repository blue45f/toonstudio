/** CPU에서 준비하는 WebGPU 버퍼 계약. 이 모듈은 GPU 제출·완료를 수행하지 않는다. */
import {
  CROWD_BASE_SILHOUETTE_INDEX_COUNT,
  CROWD_INSTANCE_STRIDE_BYTES,
  CROWD_INSTANCE_STRIDE_FLOATS,
  type CrowdAgentInstance,
  type CrowdInstanceBufferPack,
  type CrowdPresetSpec,
  type ResolvedCrowdGenerationOptions,
} from "./crowd-presets-and-wgsl";

/**
 * WebGPU 호스트용 group 0 레이아웃. visibility 4=COMPUTE, 1=VERTEX이며
 * CPU 계약 검사에서도 읽을 수 있도록 GPUShaderStage 전역을 참조하지 않는다.
 * 동일 visible-index GPUBuffer(STORAGE)를 compute binding 2와 render binding 4에
 * 각각 연결한다. compute pass 종료 후 render pass에서 읽으며 writable alias를
 * render bind group에 넣지 않는다. indirect buffer는 STORAGE | INDIRECT가 필요하다.
 * 빈 CPU pack도 GPU 버퍼를 만들 때는 각 minBindingSize 이상으로 할당한다.
 */
export const CROWD_GPU_BIND_GROUP_LAYOUTS = {
  compute: {
    entries: [
      { binding: 0, visibility: 4, buffer: { type: "uniform", minBindingSize: 64 } },
      { binding: 1, visibility: 4, buffer: { type: "read-only-storage", minBindingSize: 64 } },
      { binding: 2, visibility: 4, buffer: { type: "storage", minBindingSize: 4 } },
      { binding: 3, visibility: 4, buffer: { type: "storage", minBindingSize: 20 } },
    ],
  },
  render: {
    entries: [
      { binding: 0, visibility: 1, buffer: { type: "uniform", minBindingSize: 64 } },
      { binding: 1, visibility: 1, buffer: { type: "read-only-storage", minBindingSize: 64 } },
      { binding: 4, visibility: 1, buffer: { type: "read-only-storage", minBindingSize: 4 } },
    ],
  },
} satisfies Record<"compute" | "render", GPUBindGroupLayoutDescriptor>;

export interface CrowdIndirectDrawSubmission {
  readonly commandEncoded: boolean;
  readonly executedOnGpu: false;
  readonly indexCount: number;
  /** 컬링 결과는 GPU readback 없이는 알 수 없다. */
  readonly instanceCount: number | null;
  readonly indirectByteOffset: number;
  readonly drawCallCount: number;
}

/**
 * CPU 초기 상태를 재설정한다. GPU 재사용 시 이 배열을 다시 업로드하거나
 * frameDispatch.resetEntryPoint를 별도 dispatch한 뒤 cull → draw 순서로 실행한다.
 * 여러 workgroup 안에서 counter reset과 cull을 동시에 수행하면 안 된다.
 */
export function resetCrowdIndirectFrame(pack: CrowdInstanceBufferPack): void {
  const culled = pack.drawMode === "compute-culled";
  pack.indirectArgs[1] = culled ? 0 : pack.instanceCount;
  for (let i = 0; i < pack.instanceCount; i += 1) {
    pack.visibleIndices[i] = culled ? 0xffffffff : i;
  }
}

/** 기본 모드는 compute 없이 identity 인덱스를 그리는 uncull 계약이다. */
export function packCrowdInstanceBuffers(
  agents: readonly CrowdAgentInstance[],
  preset: CrowdPresetSpec,
  options: ResolvedCrowdGenerationOptions,
  drawMode: CrowdInstanceBufferPack["drawMode"] = "unculled",
): CrowdInstanceBufferPack {
  const count = agents.length;
  const instanceData = new Float32Array(count * CROWD_INSTANCE_STRIDE_FLOATS);
  for (let i = 0; i < count; i += 1) {
    const agent = agents[i];
    if (!agent) continue;
    const base = i * CROWD_INSTANCE_STRIDE_FLOATS;
    instanceData[base] = agent.worldX;
    instanceData[base + 1] = agent.worldY;
    instanceData[base + 2] = agent.worldZ;
    instanceData[base + 3] = agent.perspectiveScale;
    instanceData[base + 4] = agent.headYawRad;
    instanceData[base + 5] = agent.bodyYawRad;
    instanceData[base + 6] = agent.depth;
    instanceData[base + 7] = agent.atmosphericFade;
    instanceData[base + 8] = agent.fillOklch.l;
    instanceData[base + 9] = agent.fillOklch.c;
    instanceData[base + 10] = agent.fillOklch.h;
    instanceData[base + 11] = agent.opacity;
    instanceData[base + 12] = agent.strokeWidthPx;
    instanceData[base + 13] = agent.lodTier;
    instanceData[base + 14] = agent.propVariant + (agent.seated ? 4 : 0);
    instanceData[base + 15] = agent.stridePhase;
  }
  const pack: CrowdInstanceBufferPack = {
    instanceStrideBytes: CROWD_INSTANCE_STRIDE_BYTES,
    instanceStrideFloats: CROWD_INSTANCE_STRIDE_FLOATS,
    instanceCount: count,
    instanceData,
    drawMode,
    visibleIndices: new Uint32Array(count),
    indirectArgs: new Uint32Array([CROWD_BASE_SILHOUETTE_INDEX_COUNT, 0, 0, 0, 0]),
    cameraUniform: new Float32Array([
      options.canvasWidth, options.canvasHeight, options.horizonRatio, options.vanishingX,
      options.focalPointX, options.focalPointY, preset.nearDistanceM, preset.farDistanceM,
      options.nearStrokeWidthPx, options.farStrokeWidthPx, options.strokeAttenuation,
      options.focalAttention, options.maxAtmosphericFade, count, preset.index,
      drawMode === "compute-culled" ? 1 : 0, // sceneMeta.w: compute 컬링 모드
    ]),
    frameDispatch: {
      resetEntryPoint: "reset_crowd_indirect",
      resetWorkgroupCount: Math.max(1, Math.ceil(count / 64)),
      cullEntryPoint: drawMode === "compute-culled" ? "cull_and_build_indirect" : null,
      cullWorkgroupCount: drawMode === "compute-culled" ? Math.ceil(count / 64) : 0,
    },
  };
  resetCrowdIndirectFrame(pack);
  return pack;
}

/** 명령 기록과 GPU 실행·완료를 구분하고 인코딩 여부만 반환한다. */
export function encodeCrowdDrawIndexedIndirect(
  renderPass: Pick<GPURenderPassEncoder, "drawIndexedIndirect"> | null | undefined,
  indirectBuffer: GPUBuffer | null | undefined,
  gpuBuffers: CrowdInstanceBufferPack,
  indirectByteOffset = 0,
): CrowdIndirectDrawSubmission {
  const commandEncoded = Boolean(renderPass && indirectBuffer);
  if (renderPass && indirectBuffer) {
    renderPass.drawIndexedIndirect(indirectBuffer, indirectByteOffset);
  }
  return {
    commandEncoded,
    executedOnGpu: false,
    indexCount: gpuBuffers.indirectArgs[0] ?? CROWD_BASE_SILHOUETTE_INDEX_COUNT,
    instanceCount: gpuBuffers.drawMode === "compute-culled" ? null : gpuBuffers.instanceCount,
    indirectByteOffset,
    drawCallCount: commandEncoded ? 1 : 0,
  };
}
