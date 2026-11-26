/**
 * 차세대 무서버 비용(₩0) 3D 전역 조명(SSGI) · 접촉 경화 소프트 그림자(PCSS) ·
 * SAH BVH 레이트레이싱 반사/굴절 WebGPU 컴퓨트(`@workgroup_size(16, 16)`) 실행 파이프라인.
 *
 * - 64바이트 정렬 유니폼 패커(`pack3dGiRaytraceUniforms`) 및 워크그룹 그리드 산출
 * - 무GPU/헤드리스 환경용 결정적 CPU 동치 커널(`trace3dGiShadowCpu`)
 * - WebGPU 디바이스 유무에 따라 GPU 컴퓨트 또는 CPU 폴백을 자동 선택하는 디스패처(`dispatch3dGiShadowRaytrace`)
 */

import {
  BVH_TRIANGLE_STRIDE_BYTES,
  GI_RT_FLAGS,
  GI_RT_GPU_BUFFER_USAGE,
  GI_RT_MAX_BVH_STACK,
  GI_RT_UNIFORM_BYTES,
  GI_RT_WORKGROUP_X,
  GI_RT_WORKGROUP_Y,
  SAH_BVH_NODE_BYTES,
  WGSL_3D_GI_SHADOW_RAYTRACE,
  type GiGpuBufferLike,
  type GiGpuDeviceLike,
  type GiGpuPipelineDescriptor,
  type PackedSahBvh3d,
  type Vec3Tuple,
} from "./webgpu-gi-bvh-types-wgsl";

export {
  BVH_TRIANGLE_STRIDE_BYTES,
  GI_RT_FLAGS,
  GI_RT_GPU_BUFFER_USAGE,
  GI_RT_MAX_BVH_STACK,
  GI_RT_UNIFORM_BYTES,
  GI_RT_WORKGROUP_X,
  GI_RT_WORKGROUP_Y,
  SAH_BVH_NODE_BYTES,
  WGSL_3D_GI_SHADOW_RAYTRACE,
  buildPackedSahBvh3d,
  packSahBvhNodes32B,
  validate3dGiRaytraceWgsl,
  type GiGpuBindGroupLayoutLike,
  type GiGpuBindGroupLike,
  type GiGpuBufferLike,
  type GiGpuCommandBufferLike,
  type GiGpuCommandEncoderLike,
  type GiGpuDeviceLike,
  type GiGpuPassEncoderLike,
  type GiGpuPipelineDescriptor,
  type GiGpuPipelineLike,
  type GiGpuShaderModuleLike,
  type GiRaytraceWgslValidation,
  type PackedSahBvh3d,
  type RaytraceTriangle3d,
  type SahBvhNode3d,
  type Vec3Tuple,
} from "./webgpu-gi-bvh-types-wgsl";

export interface GiShadowRaytraceConfig {
  readonly width: number;
  readonly height: number;
  readonly frameIndex?: number;
  readonly shadowMapSize?: number;
  readonly lightDirection?: Vec3Tuple;
  readonly lightSize?: number;
  readonly giIntensity?: number;
  readonly giRadiusPx?: number;
  readonly temporalWeight?: number;
  readonly shadowBias?: number;
  readonly ior?: number;
  readonly reflectionStrength?: number;
  readonly refractionStrength?: number;
  readonly bvhNodeCount?: number;
  readonly enableSsgi?: boolean;
  readonly enablePcss?: boolean;
  readonly enableReflection?: boolean;
  readonly enableRefraction?: boolean;
  readonly enableTemporalAccum?: boolean;
}

export interface ResolvedGiShadowUniforms {
  readonly width: number;
  readonly height: number;
  readonly frameIndex: number;
  readonly flags: number;
  readonly shadowMapSize: number;
  readonly packedFlagsAndShadowSize: number;
  readonly lightDirX: number;
  readonly lightDirY: number;
  readonly lightDirZ: number;
  readonly lightSize: number;
  readonly giIntensity: number;
  readonly giRadiusPx: number;
  readonly temporalWeight: number;
  readonly shadowBias: number;
  readonly ior: number;
  readonly reflectionStrength: number;
  readonly refractionStrength: number;
  readonly bvhNodeCount: number;
}

export interface PackedGiShadowUniforms {
  readonly buffer: ArrayBuffer;
  readonly bytes: Uint8Array;
  readonly u32View: Uint32Array;
  readonly f32View: Float32Array;
  readonly byteLength: typeof GI_RT_UNIFORM_BYTES;
  readonly resolved: ResolvedGiShadowUniforms;
}

export interface GiRaytraceWorkgroupGrid {
  readonly x: number;
  readonly y: number;
  readonly z: 1;
  readonly workgroupSize: readonly [16, 16, 1];
  readonly totalWorkgroups: number;
  readonly totalInvocations: number;
}

export interface GiShadowTraceInput {
  readonly albedoRgba: Uint8ClampedArray | Uint8Array;
  /** 픽셀당 4개 f32: `[nx, ny, nz, linearDepth]`. `linearDepth <= 0`이면 배경 픽셀. */
  readonly normalDepthF32: Float32Array;
  /** 픽셀당 4개 f32: `[roughness, metallic, transmission, ao]`. */
  readonly materialF32: Float32Array;
  readonly shadowDepthMap?: Float32Array;
  readonly historyRgba?: Uint8ClampedArray | Uint8Array;
  readonly bvh?: PackedSahBvh3d | null;
  readonly config: GiShadowRaytraceConfig;
}

export interface GiShadowCpuStats {
  readonly shadedPixelCount: number;
  readonly averageGiLuminance: number;
  readonly averageShadowVisibility: number;
  readonly contactHardenedPixels: number;
  readonly softPenumbraPixels: number;
  readonly reflectionHitCount: number;
  readonly refractionHitCount: number;
  readonly totalBvhNodesVisited: number;
  readonly totalTrianglesTested: number;
}

export interface GiShadowCpuResult {
  readonly backend: "cpu-fallback";
  readonly width: number;
  readonly height: number;
  readonly rgba: Uint8ClampedArray;
  readonly giLuminance: Float32Array;
  readonly shadowVisibility: Float32Array;
  readonly uniforms: PackedGiShadowUniforms;
  readonly stats: GiShadowCpuStats;
}

export interface GiShadowDispatchInput extends GiShadowTraceInput {
  readonly device?: GiGpuDeviceLike | null;
  readonly label?: string;
}

export interface GiShadowDispatchResult {
  readonly backend: "webgpu-compute" | "cpu-fallback";
  readonly workgroups: GiRaytraceWorkgroupGrid;
  readonly uniforms: PackedGiShadowUniforms;
  readonly gpuOutputBuffer: GiGpuBufferLike | null;
  readonly cpuResult: GiShadowCpuResult | null;
  readonly fallbackReasonKo: string | null;
}

const DEFAULT_LIGHT_DIR: Vec3Tuple = [0.45, 0.72, 0.53];
const VOGEL_OFFSETS: readonly (readonly [number, number])[] = Array.from({ length: 8 }, (_, i) => {
  const r = Math.sqrt((i + 0.5) / 8);
  const theta = i * 2.39996323;
  return [Math.cos(theta) * r, Math.sin(theta) * r] as const;
});

function clampNum(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return value < min ? min : value > max ? max : value;
}

function fract(x: number): number {
  return x - Math.floor(x);
}

function ignHash(px: number, py: number, frame: number): number {
  const f = frame & 63;
  return fract(52.9829189 * fract(0.06711056 * (px + f * 5.588238) + 0.00583715 * (py + f * 7.123457)));
}

function normalize3(x: number, y: number, z: number, fallback: Vec3Tuple): Vec3Tuple {
  const len = Math.hypot(x, y, z);
  return Number.isFinite(len) && len > 1e-6 ? [x / len, y / len, z / len] : fallback;
}

/** 64바이트 정렬 `GiShadowRaytraceUniforms` 바이너리 버퍼를 패킹한다. */
export function pack3dGiRaytraceUniforms(config: GiShadowRaytraceConfig): PackedGiShadowUniforms {
  const width = Math.max(0, Math.floor(config.width));
  const height = Math.max(0, Math.floor(config.height));
  const frameIndex = Math.max(0, Math.floor(config.frameIndex ?? 0)) >>> 0;
  const shadowMapSize = Math.min(65535, Math.max(0, Math.floor(config.shadowMapSize ?? 0)));

  let flags = 0;
  if (config.enableSsgi ?? true) flags |= GI_RT_FLAGS.ENABLE_SSGI;
  if (config.enablePcss ?? true) flags |= GI_RT_FLAGS.ENABLE_PCSS;
  if (config.enableReflection ?? true) flags |= GI_RT_FLAGS.ENABLE_RT_REFLECTION;
  if (config.enableRefraction ?? true) flags |= GI_RT_FLAGS.ENABLE_RT_REFRACTION;
  if (config.enableTemporalAccum ?? false) flags |= GI_RT_FLAGS.ENABLE_TEMPORAL_ACCUM;
  const packedFlagsAndShadowSize = (((shadowMapSize & 0xffff) << 16) | (flags & 0xffff)) >>> 0;

  const rawLight = config.lightDirection ?? DEFAULT_LIGHT_DIR;
  const [lx, ly, lz] = normalize3(rawLight[0], rawLight[1], rawLight[2], DEFAULT_LIGHT_DIR);
  const lightDirX = Math.fround(lx);
  const lightDirY = Math.fround(ly);
  const lightDirZ = Math.fround(lz);
  const lightSize = Math.fround(clampNum(config.lightSize ?? 0.08, 0.005, 0.5));
  const giIntensity = Math.fround(clampNum(config.giIntensity ?? 0.65, 0.0, 4.0));
  const giRadiusPx = Math.fround(clampNum(config.giRadiusPx ?? 6.0, 1.0, 64.0));
  const temporalWeight = Math.fround(clampNum(config.temporalWeight ?? 0.35, 0.0, 0.95));
  const shadowBias = Math.fround(clampNum(config.shadowBias ?? 0.004, 0.0001, 0.1));
  const ior = Math.fround(clampNum(config.ior ?? 1.5, 1.01, 3.0));
  const reflectionStrength = Math.fround(clampNum(config.reflectionStrength ?? 0.75, 0.0, 1.0));
  const refractionStrength = Math.fround(clampNum(config.refractionStrength ?? 0.85, 0.0, 1.0));
  const bvhNodeCount = Math.max(0, Math.floor(config.bvhNodeCount ?? 0)) >>> 0;

  const buffer = new ArrayBuffer(GI_RT_UNIFORM_BYTES);
  const view = new DataView(buffer);
  view.setUint32(0, width, true); view.setUint32(4, height, true);
  view.setUint32(8, frameIndex, true); view.setUint32(12, packedFlagsAndShadowSize, true);
  view.setFloat32(16, lightDirX, true); view.setFloat32(20, lightDirY, true);
  view.setFloat32(24, lightDirZ, true); view.setFloat32(28, lightSize, true);
  view.setFloat32(32, giIntensity, true); view.setFloat32(36, giRadiusPx, true);
  view.setFloat32(40, temporalWeight, true); view.setFloat32(44, shadowBias, true);
  view.setFloat32(48, ior, true); view.setFloat32(52, reflectionStrength, true);
  view.setFloat32(56, refractionStrength, true); view.setUint32(60, bvhNodeCount, true);

  return {
    buffer,
    bytes: new Uint8Array(buffer),
    u32View: new Uint32Array(buffer),
    f32View: new Float32Array(buffer),
    byteLength: GI_RT_UNIFORM_BYTES,
    resolved: {
      width, height, frameIndex, flags, shadowMapSize, packedFlagsAndShadowSize,
      lightDirX, lightDirY, lightDirZ, lightSize, giIntensity, giRadiusPx,
      temporalWeight, shadowBias, ior, reflectionStrength, refractionStrength, bvhNodeCount,
    },
  };
}

export function compute3dGiRaytraceWorkgroups(width: number, height: number): GiRaytraceWorkgroupGrid {
  const safeW = Math.max(0, Math.floor(width));
  const safeH = Math.max(0, Math.floor(height));
  const x = safeW === 0 ? 0 : Math.ceil(safeW / GI_RT_WORKGROUP_X);
  const y = safeH === 0 ? 0 : Math.ceil(safeH / GI_RT_WORKGROUP_Y);
  const totalWorkgroups = x * y;
  return {
    x, y, z: 1,
    workgroupSize: [GI_RT_WORKGROUP_X, GI_RT_WORKGROUP_Y, 1],
    totalWorkgroups,
    totalInvocations: totalWorkgroups * GI_RT_WORKGROUP_X * GI_RT_WORKGROUP_Y,
  };
}

function rayAabbSlabCpu(
  ox: number, oy: number, oz: number,
  ix: number, iy: number, iz: number,
  bmin: Vec3Tuple, bmax: Vec3Tuple, tMax: number,
): number {
  const tx0 = (bmin[0] - ox) * ix; const tx1 = (bmax[0] - ox) * ix;
  const ty0 = (bmin[1] - oy) * iy; const ty1 = (bmax[1] - oy) * iy;
  const tz0 = (bmin[2] - oz) * iz; const tz1 = (bmax[2] - oz) * iz;
  const tEnter = Math.max(Math.min(tx0, tx1), Math.min(ty0, ty1), Math.min(tz0, tz1), 1e-4);
  const tExit = Math.min(Math.max(tx0, tx1), Math.max(ty0, ty1), Math.max(tz0, tz1), tMax);
  return tExit < tEnter ? -1 : tEnter;
}

interface CpuBvhHit {
  readonly hit: boolean;
  readonly albedo: Vec3Tuple;
  readonly nodesVisited: number;
  readonly trianglesTested: number;
}

function traceSahBvhCpu(
  bvh: PackedSahBvh3d,
  triF32: Float32Array,
  ox: number, oy: number, oz: number,
  dxRaw: number, dyRaw: number, dzRaw: number,
  maxDist: number,
): CpuBvhHit {
  if (bvh.nodeCount === 0) return { hit: false, albedo: [0, 0, 0], nodesVisited: 0, trianglesTested: 0 };
  const [dx, dy, dz] = normalize3(dxRaw, dyRaw, dzRaw, [0, 0, -1]);
  const ix = Math.abs(dx) < 1e-7 ? 1e9 : 1 / dx;
  const iy = Math.abs(dy) < 1e-7 ? 1e9 : 1 / dy;
  const iz = Math.abs(dz) < 1e-7 ? 1e9 : 1 / dz;

  let bestT = maxDist;
  let hit = false;
  let hitR = 0; let hitG = 0; let hitB = 0;
  let nodesVisited = 0;
  let trianglesTested = 0;

  if (rayAabbSlabCpu(ox, oy, oz, ix, iy, iz, bvh.nodes[0].boundsMin, bvh.nodes[0].boundsMax, bestT) < 0) {
    return { hit: false, albedo: [0, 0, 0], nodesVisited: 1, trianglesTested: 0 };
  }

  const stack = new Uint32Array(GI_RT_MAX_BVH_STACK);
  let sp = 1;
  stack[0] = 0;

  while (sp > 0) {
    sp -= 1;
    const node = bvh.nodes[stack[sp]];
    nodesVisited += 1;
    if (node.triCount > 0) {
      const first = node.leftOrFirst;
      for (let k = 0; k < node.triCount; k += 1) {
        trianglesTested += 1;
        const tb = bvh.primIndices[first + k] * 16;
        const v0x = triF32[tb]; const v0y = triF32[tb + 1]; const v0z = triF32[tb + 2];
        const e1x = triF32[tb + 4] - v0x; const e1y = triF32[tb + 5] - v0y; const e1z = triF32[tb + 6] - v0z;
        const e2x = triF32[tb + 8] - v0x; const e2y = triF32[tb + 9] - v0y; const e2z = triF32[tb + 10] - v0z;
        const px = dy * e2z - dz * e2y; const py = dz * e2x - dx * e2z; const pz = dx * e2y - dy * e2x;
        const det = e1x * px + e1y * py + e1z * pz;
        if (Math.abs(det) < 1e-7) continue;
        const invDet = 1 / det;
        const tx = ox - v0x; const ty = oy - v0y; const tz = oz - v0z;
        const u = (tx * px + ty * py + tz * pz) * invDet;
        if (u < 0 || u > 1) continue;
        const qx = ty * e1z - tz * e1y; const qy = tz * e1x - tx * e1z; const qz = tx * e1y - ty * e1x;
        const v = (dx * qx + dy * qy + dz * qz) * invDet;
        if (v < 0 || u + v > 1) continue;
        const t = (e2x * qx + e2y * qy + e2z * qz) * invDet;
        if (t > 1e-4 && t < bestT) {
          bestT = t; hit = true;
          hitR = triF32[tb + 12]; hitG = triF32[tb + 13]; hitB = triF32[tb + 14];
        }
      }
    } else {
      const lc = node.leftOrFirst;
      const rc = lc + 1;
      const tl = rayAabbSlabCpu(ox, oy, oz, ix, iy, iz, bvh.nodes[lc].boundsMin, bvh.nodes[lc].boundsMax, bestT);
      const tr = rayAabbSlabCpu(ox, oy, oz, ix, iy, iz, bvh.nodes[rc].boundsMin, bvh.nodes[rc].boundsMax, bestT);
      if (tl >= 0 && tr >= 0) {
        if (sp < GI_RT_MAX_BVH_STACK - 1) {
          stack[sp] = tl <= tr ? rc : lc;
          stack[sp + 1] = tl <= tr ? lc : rc;
          sp += 2;
        }
      } else if (tl >= 0 && sp < GI_RT_MAX_BVH_STACK) {
        stack[sp] = lc; sp += 1;
      } else if (tr >= 0 && sp < GI_RT_MAX_BVH_STACK) {
        stack[sp] = rc; sp += 1;
      }
    }
  }
  return { hit, albedo: [hitR, hitG, hitB], nodesVisited, trianglesTested };
}

function sampleShadowMapCpu(map: Float32Array, dim: number, u: number, v: number): number {
  const sx = Math.min(dim - 1, Math.max(0, Math.floor(u * dim)));
  const sy = Math.min(dim - 1, Math.max(0, Math.floor(v * dim)));
  return map[sy * dim + sx];
}

function refractVec3(ix: number, iy: number, iz: number, nx: number, ny: number, nz: number, eta: number): Vec3Tuple | null {
  const dotNI = nx * ix + ny * iy + nz * iz;
  const k = 1 - eta * eta * (1 - dotNI * dotNI);
  if (k < 0) return null;
  const f = eta * dotNI + Math.sqrt(k);
  return [eta * ix - f * nx, eta * iy - f * ny, eta * iz - f * nz];
}

/** WebGPU 미지원·헤드리스 환경용 결정적 CPU 동치 커널(`WGSL_3D_GI_SHADOW_RAYTRACE`와 수식 1:1 일치). */
export function trace3dGiShadowCpu(input: GiShadowTraceInput): GiShadowCpuResult {
  const bvh = input.bvh ?? null;
  const shadowDim = input.shadowDepthMap
    ? input.config.shadowMapSize ?? Math.floor(Math.sqrt(input.shadowDepthMap.length))
    : 0;
  const uniforms = pack3dGiRaytraceUniforms({
    ...input.config,
    shadowMapSize: shadowDim,
    bvhNodeCount: bvh ? bvh.nodeCount : 0,
  });
  const p = uniforms.resolved;
  const pixelCount = p.width * p.height;
  const expectedRgba = pixelCount * 4;
  if (input.albedoRgba.length !== expectedRgba) {
    throw new RangeError(`albedoRgba 길이 불일치: 기대 ${expectedRgba}B, 실제 ${input.albedoRgba.length}B`);
  }
  if (input.normalDepthF32.length !== expectedRgba || input.materialF32.length !== expectedRgba) {
    throw new RangeError(`G-Buffer 길이 불일치: 기대 ${expectedRgba} 요소`);
  }

  const out = new Uint8ClampedArray(expectedRgba);
  const giLuminance = new Float32Array(pixelCount);
  const shadowVisibility = new Float32Array(pixelCount).fill(1);
  const triF32 = bvh ? new Float32Array(bvh.triangleBuffer) : new Float32Array(0);
  const inv255 = 1 / 255;

  let shadedPixelCount = 0; let giLumaSum = 0; let shadowVisSum = 0;
  let contactHardenedPixels = 0; let softPenumbraPixels = 0;
  let reflectionHitCount = 0; let refractionHitCount = 0;
  let totalBvhNodesVisited = 0; let totalTrianglesTested = 0;

  const enableSsgi = (p.flags & GI_RT_FLAGS.ENABLE_SSGI) !== 0;
  const enablePcss = (p.flags & GI_RT_FLAGS.ENABLE_PCSS) !== 0 && Boolean(input.shadowDepthMap) && shadowDim > 0;
  const enableRefl = (p.flags & GI_RT_FLAGS.ENABLE_RT_REFLECTION) !== 0 && p.reflectionStrength > 0.001 && bvh !== null && bvh.nodeCount > 0;
  const enableRefr = (p.flags & GI_RT_FLAGS.ENABLE_RT_REFRACTION) !== 0 && p.refractionStrength > 0.001 && bvh !== null && bvh.nodeCount > 0;
  const enableTemporal = (p.flags & GI_RT_FLAGS.ENABLE_TEMPORAL_ACCUM) !== 0 && p.temporalWeight > 0.001 && input.historyRgba !== undefined && input.historyRgba.length === expectedRgba;

  const f0 = Math.pow((1 - p.ior) / (1 + p.ior), 2);
  const eta = 1 / Math.max(p.ior, 1.01);

  for (let py = 0; py < p.height; py += 1) {
    for (let px = 0; px < p.width; px += 1) {
      const idx = py * p.width + px;
      const off = idx * 4;
      const ar = input.albedoRgba[off] * inv255;
      const ag = input.albedoRgba[off + 1] * inv255;
      const ab = input.albedoRgba[off + 2] * inv255;
      const aa = input.albedoRgba[off + 3] * inv255;
      const depth = input.normalDepthF32[off + 3];
      if (depth <= 0 || aa <= 0.002) {
        out[off] = input.albedoRgba[off]; out[off + 1] = input.albedoRgba[off + 1];
        out[off + 2] = input.albedoRgba[off + 2]; out[off + 3] = input.albedoRgba[off + 3];
        continue;
      }

      shadedPixelCount += 1;
      const [nx, ny, nz] = normalize3(input.normalDepthF32[off], input.normalDepthF32[off + 1], input.normalDepthF32[off + 2], [0, 0, 1]);
      const roughness = clampNum(input.materialF32[off], 0, 1);
      const metallic = clampNum(input.materialF32[off + 1], 0, 1);
      const transmission = clampNum(input.materialF32[off + 2], 0, 1);
      const ao = clampNum(input.materialF32[off + 3], 0, 1);
      const u = (px + 0.5) / p.width;
      const v = (py + 0.5) / p.height;
      const rot = ignHash(px, py, p.frameIndex) * Math.PI * 2;
      const cosR = Math.cos(rot);
      const sinR = Math.sin(rot);

      let shadowVis = 1;
      if (enablePcss && input.shadowDepthMap) {
        const texel = 1 / shadowDim;
        const searchR = Math.max(p.lightSize * 0.25, texel * 1.5);
        let blockerSum = 0; let blockerCnt = 0;
        for (let i = 0; i < 8; i += 1) {
          const [ox, oy] = VOGEL_OFFSETS[i];
          const sd = sampleShadowMapCpu(input.shadowDepthMap, shadowDim, u + (ox * cosR - oy * sinR) * searchR, v + (ox * sinR + oy * cosR) * searchR);
          if (sd + p.shadowBias < depth) { blockerSum += sd; blockerCnt += 1; }
        }
        if (blockerCnt > 0) {
          const avgBlocker = Math.max(blockerSum / blockerCnt, 1e-4);
          const penumbraRatio = Math.max(depth - avgBlocker, 0) / avgBlocker;
          const filterR = clampNum(penumbraRatio * p.lightSize, texel * 0.5, 0.12);
          let litSum = 0;
          for (let j = 0; j < 8; j += 1) {
            const [ox, oy] = VOGEL_OFFSETS[j];
            const sd = sampleShadowMapCpu(input.shadowDepthMap, shadowDim, u + (ox * cosR - oy * sinR) * filterR, v + (ox * sinR + oy * cosR) * filterR);
            if (depth <= sd + p.shadowBias) litSum += 1;
          }
          shadowVis = litSum * 0.125;
          if (shadowVis < 0.99) {
            if (penumbraRatio < 0.25) contactHardenedPixels += 1;
            else softPenumbraPixels += 1;
          }
        }
      }
      shadowVisibility[idx] = shadowVis;
      shadowVisSum += shadowVis;

      let giR = 0; let giG = 0; let giB = 0;
      if (enableSsgi) {
        const radius = Math.max(p.giRadiusPx, 1);
        let wSum = 0;
        for (let i = 0; i < 8; i += 1) {
          const [ox, oy] = VOGEL_OFFSETS[i];
          const d2x = ox * cosR - oy * sinR;
          const d2y = ox * sinR + oy * cosR;
          const sx = Math.min(p.width - 1, Math.max(0, px + Math.round(d2x * radius)));
          const sy = Math.min(p.height - 1, Math.max(0, py + Math.round(d2y * radius)));
          const sOff = (sy * p.width + sx) * 4;
          const sDepth = input.normalDepthF32[sOff + 3];
          if (sDepth <= 0) continue;
          const dz = depth - sDepth;
          const [hx, hy, hz] = normalize3(d2x, -d2y, Math.max(dz * 2.5 + 0.35, 0.08), [0, 0, 1]);
          const w = Math.max(nx * hx + ny * hy + nz * hz, 0) * Math.exp(-Math.abs(dz) * 4);
          giR += input.albedoRgba[sOff] * inv255 * w;
          giG += input.albedoRgba[sOff + 1] * inv255 * w;
          giB += input.albedoRgba[sOff + 2] * inv255 * w;
          wSum += w;
        }
        if (wSum > 1e-5) {
          const scale = p.giIntensity / wSum;
          giR *= scale; giG *= scale; giB *= scale;
        }
      }
      const giLuma = giR * 0.299 + giG * 0.587 + giB * 0.114;
      giLuminance[idx] = giLuma;
      giLumaSum += giLuma;

      const direct = Math.max(nx * p.lightDirX + ny * p.lightDirY + nz * p.lightDirZ, 0) * shadowVis;
      let litR = ar * (0.14 * ao + direct + giR);
      let litG = ag * (0.15 * ao + direct + giG);
      let litB = ab * (0.18 * ao + direct + giB);

      const worldX = u * 2 - 1; const worldY = 1 - v * 2; const worldZ = -depth * 10;
      const fresnel = f0 + (1 - f0) * Math.pow(1 - Math.max(nz, 0), 5);
      const reflX = 2 * nz * nx; const reflY = 2 * nz * ny; const reflZ = -1 + 2 * nz * nz;

      if (enableRefl && bvh) {
        const rHit = traceSahBvhCpu(bvh, triF32, worldX + nx * 0.01, worldY + ny * 0.01, worldZ + nz * 0.01, reflX, reflY, reflZ, 40);
        totalBvhNodesVisited += rHit.nodesVisited;
        totalTrianglesTested += rHit.trianglesTested;
        if (rHit.hit) reflectionHitCount += 1;
        const rColR = rHit.hit ? rHit.albedo[0] : 0.55;
        const rColG = rHit.hit ? rHit.albedo[1] : 0.68;
        const rColB = rHit.hit ? rHit.albedo[2] : 0.88;
        const reflW = clampNum((fresnel + metallic * 0.65) * (1 - roughness * 0.85) * p.reflectionStrength, 0, 1);
        litR = litR * (1 - reflW) + rColR * reflW;
        litG = litG * (1 - reflW) + rColG * reflW;
        litB = litB * (1 - reflW) + rColB * reflW;
      }

      if (enableRefr && transmission > 0.01 && bvh) {
        const refrVec = refractVec3(0, 0, -1, nx, ny, nz, eta) ?? [reflX, reflY, reflZ];
        const tHit = traceSahBvhCpu(bvh, triF32, worldX - nx * 0.01, worldY - ny * 0.01, worldZ - nz * 0.01, refrVec[0], refrVec[1], refrVec[2], 40);
        totalBvhNodesVisited += tHit.nodesVisited;
        totalTrianglesTested += tHit.trianglesTested;
        if (tHit.hit) refractionHitCount += 1;
        const tColR = tHit.hit ? tHit.albedo[0] : 0.45;
        const tColG = tHit.hit ? tHit.albedo[1] : 0.58;
        const tColB = tHit.hit ? tHit.albedo[2] : 0.78;
        const refrW = clampNum((1 - fresnel) * transmission * p.refractionStrength, 0, 1);
        litR = litR * (1 - refrW) + tColR * refrW;
        litG = litG * (1 - refrW) + tColG * refrW;
        litB = litB * (1 - refrW) + tColB * refrW;
      }

      if (enableTemporal && input.historyRgba) {
        const tw = clampNum(p.temporalWeight, 0, 0.95);
        litR = litR * (1 - tw) + input.historyRgba[off] * inv255 * tw;
        litG = litG * (1 - tw) + input.historyRgba[off + 1] * inv255 * tw;
        litB = litB * (1 - tw) + input.historyRgba[off + 2] * inv255 * tw;
      }

      out[off] = Math.round(clampNum(litR, 0, 1) * 255);
      out[off + 1] = Math.round(clampNum(litG, 0, 1) * 255);
      out[off + 2] = Math.round(clampNum(litB, 0, 1) * 255);
      out[off + 3] = Math.round(clampNum(aa, 0, 1) * 255);
    }
  }

  return {
    backend: "cpu-fallback", width: p.width, height: p.height, rgba: out, giLuminance, shadowVisibility, uniforms,
    stats: {
      shadedPixelCount,
      averageGiLuminance: shadedPixelCount > 0 ? giLumaSum / shadedPixelCount : 0,
      averageShadowVisibility: shadedPixelCount > 0 ? shadowVisSum / shadedPixelCount : 1,
      contactHardenedPixels, softPenumbraPixels, reflectionHitCount, refractionHitCount,
      totalBvhNodesVisited, totalTrianglesTested,
    },
  };
}

/** WebGPU 디바이스가 있으면 3D GI/PCSS/BVH 컴퓨트 패스를 디스패치하고, 없으면 CPU 결정적 폴백으로 전환한다. */
export async function dispatch3dGiShadowRaytrace(input: GiShadowDispatchInput): Promise<GiShadowDispatchResult> {
  const bvh = input.bvh ?? null;
  const shadowDim = input.shadowDepthMap
    ? input.config.shadowMapSize ?? Math.floor(Math.sqrt(input.shadowDepthMap.length))
    : 0;
  const uniforms = pack3dGiRaytraceUniforms({
    ...input.config,
    shadowMapSize: shadowDim,
    bvhNodeCount: bvh ? bvh.nodeCount : 0,
  });
  const workgroups = compute3dGiRaytraceWorkgroups(uniforms.resolved.width, uniforms.resolved.height);
  const device = input.device ?? null;
  if (!device) {
    return {
      backend: "cpu-fallback", workgroups, uniforms, gpuOutputBuffer: null,
      cpuResult: trace3dGiShadowCpu(input),
      fallbackReasonKo: "WebGPU 디바이스가 없어 3D SSGI·PCSS·BVH 결정적 CPU 커널로 실행했습니다.",
    };
  }

  const label = input.label ?? "toonstudio-3d-gi-shadow-rt";
  const rgbaBytes = Math.max(4, input.albedoRgba.byteLength);
  const combinedRgba = new Uint8Array(rgbaBytes * 2);
  combinedRgba.set(input.albedoRgba, 0);
  combinedRgba.set(
    input.historyRgba && input.historyRgba.byteLength === input.albedoRgba.byteLength ? input.historyRgba : input.albedoRgba,
    rgbaBytes,
  );
  const shadowData = input.shadowDepthMap && input.shadowDepthMap.length > 0 ? input.shadowDepthMap : new Float32Array(1).fill(1);
  const bvhNodeData = bvh && bvh.nodeBytes.byteLength > 0 ? bvh.nodeBytes : new Uint8Array(SAH_BVH_NODE_BYTES);
  const bvhPrimData = bvh && bvh.primIndices.byteLength > 0 ? bvh.primIndices : new Uint32Array(1);
  const bvhTriData = bvh && bvh.triangleBytes.byteLength > 0 ? bvh.triangleBytes : new Uint8Array(BVH_TRIANGLE_STRIDE_BYTES);

  const mkStorage = (size: number, suffix: string): GiGpuBufferLike =>
    device.createBuffer({ size, usage: GI_RT_GPU_BUFFER_USAGE.STORAGE | GI_RT_GPU_BUFFER_USAGE.COPY_DST, label: `${label}-${suffix}` });
  const uniformBuf = device.createBuffer({
    size: GI_RT_UNIFORM_BYTES, usage: GI_RT_GPU_BUFFER_USAGE.UNIFORM | GI_RT_GPU_BUFFER_USAGE.COPY_DST, label: `${label}-uniforms`,
  });
  const albedoHistBuf = mkStorage(combinedRgba.byteLength, "albedo-history");
  const normalDepthBuf = mkStorage(Math.max(16, input.normalDepthF32.byteLength), "normal-depth");
  const materialBuf = mkStorage(Math.max(16, input.materialF32.byteLength), "material");
  const shadowBuf = mkStorage(shadowData.byteLength, "shadow");
  const bvhNodeBuf = mkStorage(bvhNodeData.byteLength, "bvh-nodes");
  const bvhPrimBuf = mkStorage(bvhPrimData.byteLength, "bvh-prims");
  const bvhTriBuf = mkStorage(bvhTriData.byteLength, "bvh-tris");
  const dstBuf = device.createBuffer({
    size: rgbaBytes, usage: GI_RT_GPU_BUFFER_USAGE.STORAGE | GI_RT_GPU_BUFFER_USAGE.COPY_SRC, label: `${label}-dst`,
  });

  device.queue.writeBuffer(uniformBuf, 0, uniforms.bytes);
  device.queue.writeBuffer(albedoHistBuf, 0, combinedRgba);
  device.queue.writeBuffer(normalDepthBuf, 0, input.normalDepthF32);
  device.queue.writeBuffer(materialBuf, 0, input.materialF32);
  device.queue.writeBuffer(shadowBuf, 0, shadowData);
  device.queue.writeBuffer(bvhNodeBuf, 0, bvhNodeData);
  device.queue.writeBuffer(bvhPrimBuf, 0, bvhPrimData);
  device.queue.writeBuffer(bvhTriBuf, 0, bvhTriData);

  const shaderModule = device.createShaderModule({ code: WGSL_3D_GI_SHADOW_RAYTRACE, label: `${label}-wgsl` });
  const pipelineDesc: GiGpuPipelineDescriptor = {
    label: `${label}-pipeline`, layout: "auto", compute: { module: shaderModule, entryPoint: "main" },
  };
  const pipeline = device.createComputePipelineAsync
    ? await device.createComputePipelineAsync(pipelineDesc)
    : device.createComputePipeline ? device.createComputePipeline(pipelineDesc) : null;

  const staging = [uniformBuf, albedoHistBuf, normalDepthBuf, materialBuf, shadowBuf, bvhNodeBuf, bvhPrimBuf, bvhTriBuf];
  if (!pipeline) {
    for (const buf of staging) buf.destroy();
    dstBuf.destroy();
    return {
      backend: "cpu-fallback", workgroups, uniforms, gpuOutputBuffer: null,
      cpuResult: trace3dGiShadowCpu(input),
      fallbackReasonKo: "GPUDevice 컴퓨트 파이프라인 생성 불가로 CPU 폴백으로 전환했습니다.",
    };
  }

  const bindGroup = device.createBindGroup({
    label: `${label}-bind-group`,
    layout: pipeline.getBindGroupLayout(0),
    entries: [
      { binding: 0, resource: { buffer: uniformBuf, offset: 0, size: GI_RT_UNIFORM_BYTES } },
      { binding: 1, resource: { buffer: albedoHistBuf, offset: 0, size: combinedRgba.byteLength } },
      { binding: 2, resource: { buffer: normalDepthBuf, offset: 0, size: normalDepthBuf.size } },
      { binding: 3, resource: { buffer: materialBuf, offset: 0, size: materialBuf.size } },
      { binding: 4, resource: { buffer: shadowBuf, offset: 0, size: shadowData.byteLength } },
      { binding: 5, resource: { buffer: bvhNodeBuf, offset: 0, size: bvhNodeData.byteLength } },
      { binding: 6, resource: { buffer: bvhPrimBuf, offset: 0, size: bvhPrimData.byteLength } },
      { binding: 7, resource: { buffer: bvhTriBuf, offset: 0, size: bvhTriData.byteLength } },
      { binding: 8, resource: { buffer: dstBuf, offset: 0, size: rgbaBytes } },
    ],
  });
  const encoder = device.createCommandEncoder({ label: `${label}-encoder` });
  const pass = encoder.beginComputePass({ label: `${label}-pass` });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  if (workgroups.x > 0 && workgroups.y > 0) pass.dispatchWorkgroups(workgroups.x, workgroups.y, workgroups.z);
  pass.end();
  device.queue.submit([encoder.finish({ label: `${label}-cmd` })]);
  for (const buf of staging) buf.destroy();

  return { backend: "webgpu-compute", workgroups, uniforms, gpuOutputBuffer: dstBuf, cpuResult: null, fallbackReasonKo: null };
}
