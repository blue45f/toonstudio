/**
 * GPU 컴퓨트 6평면 Gribb-Hartmann 절두체 컬링 + 계층적 깊이(Hi-Z) 차폐 컬링 +
 * 카메라 거리 기반 자동 LOD 선택 및 20바이트 WebGPU `DrawIndexedIndirect` 패커.
 */

import type { GiGpuBufferLike, GiGpuDeviceLike, Vec3Tuple } from "./webgpu-gi-bvh-types-wgsl";
import {
  CULL_INSTANCE_STRIDE_BYTES,
  CULL_UNIFORM_BYTES,
  DRAW_INDEXED_INDIRECT_BYTES,
  HI_Z_CULL_WORKGROUP_SIZE,
  HI_Z_INDIRECT_BUFFER_USAGE,
  MAX_LOD_TIERS,
  WGSL_HI_Z_FRUSTUM_CULL,
  extractFrustumPlanesGribbHartmann,
  type Frustum6Planes,
  type HiZPyramidData,
} from "./webgpu-frustum-hi-z-wgsl";

export {
  CULL_INSTANCE_STRIDE_BYTES,
  CULL_UNIFORM_BYTES,
  DRAW_INDEXED_INDIRECT_BYTES,
  HI_Z_CULL_WORKGROUP_SIZE,
  HI_Z_INDIRECT_BUFFER_USAGE,
  MAX_LOD_TIERS,
  WGSL_HI_Z_FRUSTUM_CULL,
  buildHiZPyramid,
  createLookAtMatrix,
  createPerspectiveMatrixWebGpu,
  extractFrustumPlanesGribbHartmann,
  multiplyMat4,
  validateHiZFrustumCullWgsl,
  type Frustum6Planes,
  type FrustumPlane,
  type HiZCullWgslValidation,
  type HiZMipLevel,
  type HiZPyramidData,
} from "./webgpu-frustum-hi-z-wgsl";

/** 단일 LOD 단계의 인덱스 버퍼 범위 및 최대 유효 거리(m). */
export interface LodLevelRange {
  readonly lodIndex: number;
  readonly indexCount: number;
  readonly firstIndex: number;
  readonly baseVertex: number;
  readonly maxDistanceMeters: number;
}

/** 컬링 대상 3D 인스턴스 바운딩 정보(월드 공간 미터 단위). */
export interface CullableInstance3d {
  readonly instanceId: number;
  readonly meshGroupId?: number;
  readonly aabbMin: Vec3Tuple;
  readonly aabbMax: Vec3Tuple;
  readonly flags?: number;
}

/** WebGPU `renderPassEncoder.drawIndexedIndirect` 20바이트(5×32bit) 커맨드 레코드. */
export interface DrawIndexedIndirectCommand {
  readonly meshGroupId: number;
  readonly lodIndex: number;
  readonly indexCount: number;
  readonly instanceCount: number;
  readonly firstIndex: number;
  readonly baseVertex: number;
  readonly firstInstance: number;
}

export interface VisibleLodAssignment {
  readonly instanceId: number;
  readonly meshGroupId: number;
  readonly distanceMeters: number;
  readonly lodRange: LodLevelRange;
}

export interface PackedLodIndirectResult {
  readonly commands: readonly DrawIndexedIndirectCommand[];
  readonly drawIndirectBuffer: ArrayBuffer;
  readonly drawIndirectU32: Uint32Array;
  readonly visibleInstanceIds: Uint32Array;
  readonly lodInstanceCounts: readonly [number, number, number, number];
  readonly totalByteLength: number;
}

export interface FrustumHiZCullConfig {
  readonly viewProjectionMatrix: Float32Array;
  readonly cameraPosition: Vec3Tuple;
  readonly hiZPyramid?: HiZPyramidData | null;
  readonly ndcDepthZeroToOne?: boolean;
  readonly hiZDepthBias?: number;
  readonly lodBias?: number;
  readonly lodLevels: readonly LodLevelRange[];
  readonly lodLevelsByGroup?: ReadonlyMap<number, readonly LodLevelRange[]>;
}

export interface FrustumHiZCullMetrics {
  readonly totalInstances: number;
  readonly visibleInstances: number;
  readonly frustumCulledCount: number;
  readonly hiZCulledCount: number;
  readonly lodDistribution: readonly [number, number, number, number];
  readonly baselineTriangles: number;
  readonly renderedTriangles: number;
  readonly polygonReductionRatio: number;
  readonly instanceReductionRatio: number;
  readonly indirectCommandCount: number;
  readonly indirectBufferBytes: number;
}

export interface FrustumHiZCullCpuResult {
  readonly backend: "cpu-fallback";
  readonly frustum: Frustum6Planes;
  readonly packed: PackedLodIndirectResult;
  readonly metrics: FrustumHiZCullMetrics;
}

export interface HiZCullDispatchInput {
  readonly device?: GiGpuDeviceLike | null;
  readonly instances: readonly CullableInstance3d[];
  readonly config: FrustumHiZCullConfig;
  readonly label?: string;
}

export interface HiZCullDispatchResult {
  readonly backend: "webgpu-compute" | "cpu-fallback";
  readonly workgroupCountX: number;
  readonly gpuIndirectBuffer: GiGpuBufferLike | null;
  readonly cpuResult: FrustumHiZCullCpuResult | null;
  readonly fallbackReasonKo: string | null;
}

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function testAabbAgainstFrustum(frustum: Frustum6Planes, bmin: Vec3Tuple, bmax: Vec3Tuple): boolean {
  const p = frustum.packedF32;
  for (let i = 0; i < 6; i += 1) {
    const a = p[i * 4]; const b = p[i * 4 + 1]; const c = p[i * 4 + 2]; const d = p[i * 4 + 3];
    const px = a >= 0 ? bmax[0] : bmin[0];
    const py = b >= 0 ? bmax[1] : bmin[1];
    const pz = c >= 0 ? bmax[2] : bmin[2];
    if (a * px + b * py + c * pz + d < 0) return false;
  }
  return true;
}

function sampleHiZMipCpu(hiz: HiZPyramidData, mipIdx: number, u: number, v: number): number {
  const lvl = hiz.levels[Math.min(hiz.mipCount - 1, Math.max(0, mipIdx))];
  const tx = Math.min(lvl.width - 1, Math.max(0, Math.floor(u * lvl.width)));
  const ty = Math.min(lvl.height - 1, Math.max(0, Math.floor(v * lvl.height)));
  return hiz.data[lvl.offset + ty * lvl.width + tx];
}

function testAabbHiZVisible(
  hiz: HiZPyramidData,
  viewProj: Float32Array,
  bmin: Vec3Tuple,
  bmax: Vec3Tuple,
  depthBias: number,
): boolean {
  let minNdcX = 2; let maxNdcX = -2;
  let minNdcY = 2; let maxNdcY = -2;
  let minNdcZ = 1;
  for (let c = 0; c < 8; c += 1) {
    const cx = (c & 1) !== 0 ? bmax[0] : bmin[0];
    const cy = (c & 2) !== 0 ? bmax[1] : bmin[1];
    const cz = (c & 4) !== 0 ? bmax[2] : bmin[2];
    const clipX = viewProj[0] * cx + viewProj[4] * cy + viewProj[8] * cz + viewProj[12];
    const clipY = viewProj[1] * cx + viewProj[5] * cy + viewProj[9] * cz + viewProj[13];
    const clipZ = viewProj[2] * cx + viewProj[6] * cy + viewProj[10] * cz + viewProj[14];
    const clipW = viewProj[3] * cx + viewProj[7] * cy + viewProj[11] * cz + viewProj[15];
    if (clipW <= 1e-4) return true;
    const invW = 1 / clipW;
    const nx = clipX * invW; const ny = clipY * invW; const nz = clipZ * invW;
    if (nx < minNdcX) minNdcX = nx;
    if (nx > maxNdcX) maxNdcX = nx;
    if (ny < minNdcY) minNdcY = ny;
    if (ny > maxNdcY) maxNdcY = ny;
    if (nz < minNdcZ) minNdcZ = nz;
  }

  const uMin = clampNum(minNdcX * 0.5 + 0.5, 0, 1);
  const uMax = clampNum(maxNdcX * 0.5 + 0.5, 0, 1);
  const vMin = clampNum(0.5 - maxNdcY * 0.5, 0, 1);
  const vMax = clampNum(0.5 - minNdcY * 0.5, 0, 1);
  const maxSpan = Math.max((uMax - uMin) * hiz.baseWidth, (vMax - vMin) * hiz.baseHeight, 1);
  const mip = Math.min(hiz.mipCount - 1, Math.max(0, Math.ceil(Math.log2(maxSpan))));

  const hizMax = Math.max(
    sampleHiZMipCpu(hiz, mip, uMin, vMin),
    sampleHiZMipCpu(hiz, mip, uMax, vMin),
    sampleHiZMipCpu(hiz, mip, uMin, vMax),
    sampleHiZMipCpu(hiz, mip, uMax, vMax),
  );
  return minNdcZ <= hizMax + depthBias;
}

/** 카메라 거리에 따라 가장 적합한 LOD 단계를 선택한다. */
export function selectDistanceLodRange(
  distanceMeters: number,
  lodLevels: readonly LodLevelRange[],
  lodBias: number = 1.0,
): LodLevelRange {
  if (lodLevels.length === 0) throw new RangeError("lodLevels는 최소 1개 이상이어야 합니다.");
  const effectiveDist = Math.max(0, distanceMeters) * Math.max(0.05, lodBias);
  for (let i = 0; i < lodLevels.length; i += 1) {
    if (effectiveDist <= lodLevels[i].maxDistanceMeters) return lodLevels[i];
  }
  return lodLevels[lodLevels.length - 1];
}

/** 가시 인스턴스 목록을 `(meshGroupId, lodIndex)`별 20바이트 WebGPU `DrawIndexedIndirect` 버퍼로 패킹한다. */
export function packDistanceLodCommands(assignments: readonly VisibleLodAssignment[]): PackedLodIndirectResult {
  const buckets = new Map<string, { readonly meshGroupId: number; readonly lodRange: LodLevelRange; readonly instanceIds: number[] }>();
  const lodCounts: [number, number, number, number] = [0, 0, 0, 0];

  for (let i = 0; i < assignments.length; i += 1) {
    const a = assignments[i];
    lodCounts[Math.min(MAX_LOD_TIERS - 1, Math.max(0, a.lodRange.lodIndex))] += 1;
    const key = `${a.meshGroupId}:${a.lodRange.lodIndex}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = { meshGroupId: a.meshGroupId, lodRange: a.lodRange, instanceIds: [] };
      buckets.set(key, bucket);
    }
    bucket.instanceIds.push(a.instanceId);
  }

  const sorted = Array.from(buckets.values()).sort(
    (a, b) => a.meshGroupId - b.meshGroupId || a.lodRange.lodIndex - b.lodRange.lodIndex,
  );
  const commands: DrawIndexedIndirectCommand[] = [];
  const visibleInstanceIds = new Uint32Array(assignments.length);
  const drawIndirectBuffer = new ArrayBuffer(sorted.length * DRAW_INDEXED_INDIRECT_BYTES);
  const view = new DataView(drawIndirectBuffer);

  let cursor = 0;
  for (let b = 0; b < sorted.length; b += 1) {
    const bucket = sorted[b];
    const firstInstance = cursor;
    for (let k = 0; k < bucket.instanceIds.length; k += 1) {
      visibleInstanceIds[cursor] = bucket.instanceIds[k] >>> 0;
      cursor += 1;
    }
    const cmd: DrawIndexedIndirectCommand = {
      meshGroupId: bucket.meshGroupId,
      lodIndex: bucket.lodRange.lodIndex,
      indexCount: Math.max(0, Math.floor(bucket.lodRange.indexCount)) >>> 0,
      instanceCount: bucket.instanceIds.length >>> 0,
      firstIndex: Math.max(0, Math.floor(bucket.lodRange.firstIndex)) >>> 0,
      baseVertex: Math.trunc(bucket.lodRange.baseVertex),
      firstInstance: firstInstance >>> 0,
    };
    commands.push(cmd);
    const off = b * DRAW_INDEXED_INDIRECT_BYTES;
    view.setUint32(off + 0, cmd.indexCount, true);
    view.setUint32(off + 4, cmd.instanceCount, true);
    view.setUint32(off + 8, cmd.firstIndex, true);
    view.setInt32(off + 12, cmd.baseVertex, true);
    view.setUint32(off + 16, cmd.firstInstance, true);
  }

  return {
    commands,
    drawIndirectBuffer,
    drawIndirectU32: new Uint32Array(drawIndirectBuffer),
    visibleInstanceIds,
    lodInstanceCounts: lodCounts,
    totalByteLength: drawIndirectBuffer.byteLength,
  };
}

/** 절두체(6평면) + Hi-Z 차폐 컬링 + 거리 기반 LOD 배칭을 CPU에서 결정적으로 수행한다. */
export function cullAndPackInstancesCpu(
  instances: readonly CullableInstance3d[],
  config: FrustumHiZCullConfig,
): FrustumHiZCullCpuResult {
  const frustum = extractFrustumPlanesGribbHartmann(config.viewProjectionMatrix, config.ndcDepthZeroToOne ?? true);
  const depthBias = clampNum(config.hiZDepthBias ?? 0.002, 0, 0.1);
  const lodBias = clampNum(config.lodBias ?? 1.0, 0.05, 10.0);
  const [camX, camY, camZ] = config.cameraPosition;
  const hiz = config.hiZPyramid ?? null;

  const visibleAssignments: VisibleLodAssignment[] = [];
  let frustumCulledCount = 0;
  let hiZCulledCount = 0;
  let baselineTriangles = 0;
  let renderedTriangles = 0;

  for (let i = 0; i < instances.length; i += 1) {
    const inst = instances[i];
    const groupId = inst.meshGroupId ?? 0;
    const chain = config.lodLevelsByGroup?.get(groupId) ?? config.lodLevels;
    if (chain.length === 0) throw new RangeError(`메쉬 그룹 ${groupId}에 유효한 LOD 체인이 없습니다.`);
    baselineTriangles += Math.floor(chain[0].indexCount / 3);

    if (!testAabbAgainstFrustum(frustum, inst.aabbMin, inst.aabbMax)) { frustumCulledCount += 1; continue; }
    if (hiz && !testAabbHiZVisible(hiz, config.viewProjectionMatrix, inst.aabbMin, inst.aabbMax, depthBias)) {
      hiZCulledCount += 1; continue;
    }

    const cx = (inst.aabbMin[0] + inst.aabbMax[0]) * 0.5;
    const cy = (inst.aabbMin[1] + inst.aabbMax[1]) * 0.5;
    const cz = (inst.aabbMin[2] + inst.aabbMax[2]) * 0.5;
    const dist = Math.hypot(cx - camX, cy - camY, cz - camZ);
    const lodRange = selectDistanceLodRange(dist, chain, lodBias);
    renderedTriangles += Math.floor(lodRange.indexCount / 3);
    visibleAssignments.push({ instanceId: inst.instanceId, meshGroupId: groupId, distanceMeters: dist, lodRange });
  }

  const packed = packDistanceLodCommands(visibleAssignments);
  const totalInstances = instances.length;
  const visibleInstances = visibleAssignments.length;
  return {
    backend: "cpu-fallback",
    frustum,
    packed,
    metrics: {
      totalInstances,
      visibleInstances,
      frustumCulledCount,
      hiZCulledCount,
      lodDistribution: packed.lodInstanceCounts,
      baselineTriangles,
      renderedTriangles,
      polygonReductionRatio: baselineTriangles > 0 ? 1 - renderedTriangles / baselineTriangles : 0,
      instanceReductionRatio: totalInstances > 0 ? 1 - visibleInstances / totalInstances : 0,
      indirectCommandCount: packed.commands.length,
      indirectBufferBytes: packed.totalByteLength,
    },
  };
}

/** WebGPU 디바이스가 있으면 GPU Hi-Z 컬링 패스를 디스패치하고, 없으면 CPU 동치 패커를 실행한다. */
export async function dispatchHiZFrustumCull(input: HiZCullDispatchInput): Promise<HiZCullDispatchResult> {
  const count = input.instances.length;
  const workgroupCountX = count === 0 ? 0 : Math.ceil(count / HI_Z_CULL_WORKGROUP_SIZE);
  const device = input.device ?? null;
  if (!device) {
    return {
      backend: "cpu-fallback", workgroupCountX, gpuIndirectBuffer: null,
      cpuResult: cullAndPackInstancesCpu(input.instances, input.config),
      fallbackReasonKo: "WebGPU 디바이스가 없어 CPU 절두체·Hi-Z 컬링 및 LOD Indirect 패커로 실행했습니다.",
    };
  }

  const frustum = extractFrustumPlanesGribbHartmann(input.config.viewProjectionMatrix, input.config.ndcDepthZeroToOne ?? true);
  const hiz = input.config.hiZPyramid ?? null;
  const uniformBuf = new ArrayBuffer(CULL_UNIFORM_BYTES);
  const uF32 = new Float32Array(uniformBuf);
  const uU32 = new Uint32Array(uniformBuf);
  uF32.set(frustum.packedF32, 0);
  uF32.set(input.config.viewProjectionMatrix.subarray(0, 16), 24);
  uF32[40] = input.config.cameraPosition[0]; uF32[41] = input.config.cameraPosition[1];
  uF32[42] = input.config.cameraPosition[2]; uF32[43] = clampNum(input.config.hiZDepthBias ?? 0.002, 0, 0.1);
  uU32[44] = hiz ? hiz.baseWidth : 1; uU32[45] = hiz ? hiz.baseHeight : 1;
  uU32[46] = hiz ? hiz.mipCount : 0; uU32[47] = count >>> 0;
  for (let t = 0; t < MAX_LOD_TIERS; t += 1) {
    const tier = input.config.lodLevels[Math.min(t, input.config.lodLevels.length - 1)];
    uF32[48 + t] = tier ? tier.maxDistanceMeters : 1e6;
  }

  const instBufData = new ArrayBuffer(Math.max(1, count) * CULL_INSTANCE_STRIDE_BYTES);
  const instView = new DataView(instBufData);
  for (let i = 0; i < count; i += 1) {
    const inst = input.instances[i];
    const base = i * CULL_INSTANCE_STRIDE_BYTES;
    const cx = (inst.aabbMin[0] + inst.aabbMax[0]) * 0.5;
    const cy = (inst.aabbMin[1] + inst.aabbMax[1]) * 0.5;
    const cz = (inst.aabbMin[2] + inst.aabbMax[2]) * 0.5;
    instView.setFloat32(base + 0, inst.aabbMin[0], true); instView.setFloat32(base + 4, inst.aabbMin[1], true);
    instView.setFloat32(base + 8, inst.aabbMin[2], true); instView.setUint32(base + 12, inst.instanceId >>> 0, true);
    instView.setFloat32(base + 16, inst.aabbMax[0], true); instView.setFloat32(base + 20, inst.aabbMax[1], true);
    instView.setFloat32(base + 24, inst.aabbMax[2], true); instView.setUint32(base + 28, (inst.meshGroupId ?? 0) >>> 0, true);
    instView.setFloat32(base + 32, cx, true); instView.setFloat32(base + 36, cy, true);
    instView.setFloat32(base + 40, cz, true);
    instView.setFloat32(base + 44, Math.hypot(inst.aabbMax[0] - cx, inst.aabbMax[1] - cy, inst.aabbMax[2] - cz), true);
  }

  const indirectTemplate = new ArrayBuffer(MAX_LOD_TIERS * DRAW_INDEXED_INDIRECT_BYTES);
  const indView = new DataView(indirectTemplate);
  for (let t = 0; t < MAX_LOD_TIERS; t += 1) {
    const tier = input.config.lodLevels[Math.min(t, input.config.lodLevels.length - 1)];
    const off = t * DRAW_INDEXED_INDIRECT_BYTES;
    indView.setUint32(off + 0, tier ? tier.indexCount >>> 0 : 0, true);
    indView.setUint32(off + 4, 0, true);
    indView.setUint32(off + 8, tier ? tier.firstIndex >>> 0 : 0, true);
    indView.setInt32(off + 12, tier ? Math.trunc(tier.baseVertex) : 0, true);
    indView.setUint32(off + 16, 0, true);
  }

  const label = input.label ?? "toonstudio-hiz-frustum-cull";
  const hizData = hiz ? hiz.data : new Float32Array(1).fill(1);
  const hizMeta = hiz ? hiz.mipMetaU32 : new Uint32Array([1, 1, 0, 0]);
  const gpuUniform = device.createBuffer({ size: CULL_UNIFORM_BYTES, usage: HI_Z_INDIRECT_BUFFER_USAGE.UNIFORM | HI_Z_INDIRECT_BUFFER_USAGE.COPY_DST, label: `${label}-uniforms` });
  const gpuInst = device.createBuffer({ size: instBufData.byteLength, usage: HI_Z_INDIRECT_BUFFER_USAGE.STORAGE | HI_Z_INDIRECT_BUFFER_USAGE.COPY_DST, label: `${label}-instances` });
  const gpuHiz = device.createBuffer({ size: hizData.byteLength, usage: HI_Z_INDIRECT_BUFFER_USAGE.STORAGE | HI_Z_INDIRECT_BUFFER_USAGE.COPY_DST, label: `${label}-hiz` });
  const gpuHizMeta = device.createBuffer({ size: hizMeta.byteLength, usage: HI_Z_INDIRECT_BUFFER_USAGE.STORAGE | HI_Z_INDIRECT_BUFFER_USAGE.COPY_DST, label: `${label}-hiz-meta` });
  const gpuIndirect = device.createBuffer({
    size: indirectTemplate.byteLength,
    usage: HI_Z_INDIRECT_BUFFER_USAGE.STORAGE | HI_Z_INDIRECT_BUFFER_USAGE.INDIRECT | HI_Z_INDIRECT_BUFFER_USAGE.COPY_DST | HI_Z_INDIRECT_BUFFER_USAGE.COPY_SRC,
    label: `${label}-indirect`,
  });
  const gpuVisIds = device.createBuffer({ size: Math.max(4, count * 4), usage: HI_Z_INDIRECT_BUFFER_USAGE.STORAGE | HI_Z_INDIRECT_BUFFER_USAGE.COPY_SRC, label: `${label}-visible-ids` });
  const gpuStats = device.createBuffer({ size: 32, usage: HI_Z_INDIRECT_BUFFER_USAGE.STORAGE | HI_Z_INDIRECT_BUFFER_USAGE.COPY_SRC, label: `${label}-stats` });

  device.queue.writeBuffer(gpuUniform, 0, uniformBuf);
  device.queue.writeBuffer(gpuInst, 0, instBufData);
  device.queue.writeBuffer(gpuHiz, 0, hizData);
  device.queue.writeBuffer(gpuHizMeta, 0, hizMeta);
  device.queue.writeBuffer(gpuIndirect, 0, indirectTemplate);

  const shaderModule = device.createShaderModule({ code: WGSL_HI_Z_FRUSTUM_CULL, label: `${label}-wgsl` });
  const pipelineDesc = { label: `${label}-pipeline`, layout: "auto" as const, compute: { module: shaderModule, entryPoint: "main" as const } };
  const pipeline = device.createComputePipelineAsync
    ? await device.createComputePipelineAsync(pipelineDesc)
    : device.createComputePipeline ? device.createComputePipeline(pipelineDesc) : null;

  const tempBuffers = [gpuUniform, gpuInst, gpuHiz, gpuHizMeta, gpuVisIds, gpuStats];
  if (!pipeline) {
    for (const buf of tempBuffers) buf.destroy();
    gpuIndirect.destroy();
    return {
      backend: "cpu-fallback", workgroupCountX, gpuIndirectBuffer: null,
      cpuResult: cullAndPackInstancesCpu(input.instances, input.config),
      fallbackReasonKo: "GPUDevice 컴퓨트 파이프라인 미지원으로 CPU 컬링 폴백으로 전환했습니다.",
    };
  }

  const bindGroup = device.createBindGroup({
    label: `${label}-bind-group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: gpuUniform, offset: 0, size: CULL_UNIFORM_BYTES } },
      { binding: 1, resource: { buffer: gpuInst, offset: 0, size: instBufData.byteLength } },
      { binding: 2, resource: { buffer: gpuHiz, offset: 0, size: hizData.byteLength } },
      { binding: 3, resource: { buffer: gpuHizMeta, offset: 0, size: hizMeta.byteLength } },
      { binding: 4, resource: { buffer: gpuIndirect, offset: 0, size: indirectTemplate.byteLength } },
      { binding: 5, resource: { buffer: gpuVisIds, offset: 0, size: gpuVisIds.size } },
      { binding: 6, resource: { buffer: gpuStats, offset: 0, size: 32 } },
    ],
  });

  const encoder = device.createCommandEncoder({ label: `${label}-encoder` });
  const pass = encoder.beginComputePass({ label: `${label}-pass` });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  if (workgroupCountX > 0) pass.dispatchWorkgroups(workgroupCountX, 1, 1);
  pass.end();
  device.queue.submit([encoder.finish({ label: `${label}-cmd` })]);
  for (const buf of tempBuffers) buf.destroy();

  return { backend: "webgpu-compute", workgroupCountX, gpuIndirectBuffer: gpuIndirect, cpuResult: null, fallbackReasonKo: null };
}
