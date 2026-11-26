import { describe, expect, it } from "vitest";
import {
  AUDIO_REACTIVE_FLAGS,
  AUDIO_REACTIVE_UNIFORM_BYTES,
  AudioReactive3dStageEngine,
  DRAW_INDEXED_INDIRECT_BYTES,
  GI_RT_FLAGS,
  GI_RT_UNIFORM_BYTES,
  HI_Z_INDIRECT_BUFFER_USAGE,
  SAH_BVH_NODE_BYTES,
  WGSL_3D_GI_SHADOW_RAYTRACE,
  WGSL_AUDIO_REACTIVE_STAGE_UNIFORMS,
  WGSL_HI_Z_FRUSTUM_CULL,
  buildHiZPyramid,
  buildPackedSahBvh3d,
  compute3dGiRaytraceWorkgroups,
  computeRadix2FftMagnitude,
  createLookAtMatrix,
  createPerspectiveMatrixWebGpu,
  cullAndPackInstancesCpu,
  dispatch3dGiShadowRaytrace,
  dispatchHiZFrustumCull,
  extract5BandSpectrumEnergies,
  extractFrustumPlanesGribbHartmann,
  generateProceduralColonnadePillar,
  generateProceduralRoomShell,
  generateProceduralStaircase,
  generateProceduralStudioWindowFrame,
  generateProceduralStylizedTree,
  inspectProceduralMeshQuality,
  multiplyMat4,
  pack3dGiRaytraceUniforms,
  packDistanceLodCommands,
  packSahBvhNodes32B,
  synthesizeProceduralPbrTextures,
  trace3dGiShadowCpu,
  validate3dGiRaytraceWgsl,
  validateHiZFrustumCullWgsl,
  type CullableInstance3d,
  type GiGpuBufferLike,
  type GiGpuDeviceLike,
  type LodLevelRange,
  type ProceduralMaterialKind,
  type RaytraceTriangle3d,
} from "./index";

interface MockGpuStats {
  createdBuffers: { readonly size: number; readonly usage: number; readonly label?: string; destroyed: boolean }[];
  writeCalls: number;
  dispatches: readonly [number, number, number][];
  submissions: number;
}

function createMockGpuDevice(): { readonly device: GiGpuDeviceLike; readonly stats: MockGpuStats } {
  const createdBuffers: { readonly size: number; readonly usage: number; readonly label?: string; destroyed: boolean }[] = [];
  const dispatches: [number, number, number][] = [];
  const stats: MockGpuStats = { createdBuffers, writeCalls: 0, dispatches, submissions: 0 };

  const device: GiGpuDeviceLike = {
    queue: {
      writeBuffer: () => {
        stats.writeCalls += 1;
      },
      submit: () => {
        stats.submissions += 1;
      },
    },
    createShaderModule: (desc) => ({ label: desc.label }),
    createBuffer: (desc): GiGpuBufferLike => {
      const rec = { size: desc.size, usage: desc.usage, label: desc.label, destroyed: false };
      createdBuffers.push(rec);
      return {
        size: desc.size,
        usage: desc.usage,
        destroy: () => {
          rec.destroyed = true;
        },
      };
    },
    createComputePipelineAsync: async (desc) => ({
      label: desc.label,
      getBindGroupLayout: () => ({ label: "layout-0" }),
    }),
    createBindGroup: (desc) => ({ label: desc.label }),
    createCommandEncoder: () => ({
      beginComputePass: () => ({
        setPipeline: () => undefined,
        setBindGroup: () => undefined,
        dispatchWorkgroups: (x, y = 1, z = 1) => {
          dispatches.push([x, y, z]);
        },
        end: () => undefined,
      }),
      finish: (desc) => ({ label: desc?.label }),
    }),
  };

  return { device, stats };
}

function makeFlatGBuffer(width: number, height: number): {
  readonly albedo: Uint8ClampedArray;
  readonly normalDepth: Float32Array;
  readonly material: Float32Array;
} {
  const n = width * height;
  const albedo = new Uint8ClampedArray(n * 4);
  const normalDepth = new Float32Array(n * 4);
  const material = new Float32Array(n * 4);
  for (let i = 0; i < n; i += 1) {
    const o = i * 4;
    albedo[o] = 220;
    albedo[o + 1] = 220;
    albedo[o + 2] = 220;
    albedo[o + 3] = 255;
    normalDepth[o] = 0;
    normalDepth[o + 1] = 0;
    normalDepth[o + 2] = 1;
    normalDepth[o + 3] = 0.5;
    material[o] = 0.5;
    material[o + 1] = 0.0;
    material[o + 2] = 0.0;
    material[o + 3] = 1.0;
  }
  return { albedo, normalDepth, material };
}

function makeSinePcm(freqHz: number, length: number, sampleRate: number, amplitude: number = 1.0): Float32Array {
  const out = new Float32Array(length);
  const omega = (2 * Math.PI * freqHz) / sampleRate;
  for (let i = 0; i < length; i += 1) {
    out[i] = Math.sin(omega * i) * amplitude;
  }
  return out;
}

describe("wasm64-3d-nextgen-render: 1. WebGPU GI + PCSS + Wave-2 SAH BVH RT 파이프라인", () => {
  it("WGSL 컴퓨트 셰이더 정적 검증(@workgroup_size(16,16) · 32B SahBvhNode3D · 9바인딩) 통과", () => {
    const val = validate3dGiRaytraceWgsl(WGSL_3D_GI_SHADOW_RAYTRACE);
    expect(val.valid).toBe(true);
    expect(val.errors).toEqual([]);
    expect(val.entryPoint).toBe("main");
    expect(val.workgroupSize).toEqual([16, 16, 1]);
    expect(val.bindings.length).toBe(9);
    expect(val.hasUniformStruct).toBe(true);
    expect(val.hasSahBvhNodeStruct).toBe(true);
    expect(val.hasSsgiBounce).toBe(true);
    expect(val.hasPcssPenumbra).toBe(true);
    expect(val.hasBvhRayTraversal).toBe(true);
    expect(val.hasSnellRefraction).toBe(true);
    expect(val.usesWorkgroupBarrier).toBe(true);
  });

  it("64바이트 정렬 유니폼 패킹 및 워크그룹 그리드 계산 검증", () => {
    const packed = pack3dGiRaytraceUniforms({
      width: 320,
      height: 180,
      frameIndex: 7,
      shadowMapSize: 512,
      lightDirection: [3, 4, 0],
      lightSize: 0.12,
      giIntensity: 0.9,
      giRadiusPx: 8,
      temporalWeight: 0.4,
      shadowBias: 0.003,
      ior: 1.52,
      reflectionStrength: 0.8,
      refractionStrength: 0.9,
      bvhNodeCount: 25,
      enableTemporalAccum: true,
    });
    expect(packed.byteLength).toBe(GI_RT_UNIFORM_BYTES);
    expect(packed.bytes.byteLength).toBe(64);
    const dv = new DataView(packed.buffer);
    expect(dv.getUint32(0, true)).toBe(320);
    expect(dv.getUint32(4, true)).toBe(180);
    expect(dv.getUint32(8, true)).toBe(7);
    const flagsWord = dv.getUint32(12, true);
    expect(flagsWord & 0xffff).toBe(
      GI_RT_FLAGS.ENABLE_SSGI |
        GI_RT_FLAGS.ENABLE_PCSS |
        GI_RT_FLAGS.ENABLE_RT_REFLECTION |
        GI_RT_FLAGS.ENABLE_RT_REFRACTION |
        GI_RT_FLAGS.ENABLE_TEMPORAL_ACCUM,
    );
    expect((flagsWord >>> 16) & 0xffff).toBe(512);
    expect(dv.getFloat32(16, true)).toBeCloseTo(0.6, 5);
    expect(dv.getFloat32(20, true)).toBeCloseTo(0.8, 5);
    expect(dv.getFloat32(48, true)).toBeCloseTo(1.52, 4);
    expect(dv.getUint32(60, true)).toBe(25);

    const grid = compute3dGiRaytraceWorkgroups(320, 180);
    expect(grid.x).toBe(20);
    expect(grid.y).toBe(12);
    expect(grid.totalInvocations).toBe(20 * 12 * 256);
  });

  it("Wave-2 32바이트 SAH BVH 노드 바이너리 패킹 레이아웃 호환성 검증", () => {
    const tris: RaytraceTriangle3d[] = [];
    for (let i = 0; i < 12; i += 1) {
      const x = i * 1.5;
      tris.push({
        v0: [x, 0, -2],
        v1: [x + 1, 0, -2],
        v2: [x + 0.5, 1, -2],
        albedo: [0.1, 0.85, 0.2],
      });
    }
    const bvh = buildPackedSahBvh3d(tris, 2);
    expect(bvh.nodeCount).toBeGreaterThan(1);
    expect(bvh.nodeBuffer.byteLength).toBe(bvh.nodeCount * SAH_BVH_NODE_BYTES);
    expect(bvh.triangleBuffer.byteLength).toBe(12 * 64);

    // 루트 노드(32B) 직접 바이너리 언팩 검증
    const repacked = packSahBvhNodes32B(bvh.nodes);
    expect(repacked.byteLength).toBe(bvh.nodeCount * 32);
    const dv = new DataView(repacked);
    expect(dv.getFloat32(0, true)).toBeCloseTo(0, 5);
    expect(dv.getFloat32(16, true)).toBeCloseTo(17.5, 5);
    expect(dv.getUint32(28, true)).toBe(0); // 내부 노드 tri_count === 0
    expect(dv.getUint32(12, true)).toBe(1); // 왼쪽 자식 === 1
  });

  it("CPU 동치 커널: SSGI 색상 번짐 · 시간적 누적 · PCSS 접촉 경화 · BVH 반사/굴절 검증", () => {
    const w = 16;
    const h = 16;
    const gbuf = makeFlatGBuffer(w, h);
    // 왼쪽 절반을 강한 적색 발광/알베도 벽으로 설정 -> 중앙 우측 중성면으로 적색 SSGI 번짐 유도
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < 7; x += 1) {
        const o = (y * w + x) * 4;
        gbuf.albedo[o] = 255;
        gbuf.albedo[o + 1] = 20;
        gbuf.albedo[o + 2] = 20;
      }
    }

    // 1) SSGI 색상 번짐(직접광을 사선으로 낮춰 포화 없이 간접광 적색 번짐 계측)
    for (let y = 0; y < h; y += 1) {
      for (let x = 7; x < w; x += 1) {
        const o = (y * w + x) * 4;
        gbuf.albedo[o] = 150;
        gbuf.albedo[o + 1] = 150;
        gbuf.albedo[o + 2] = 150;
      }
    }
    const ssgiRes = trace3dGiShadowCpu({
      albedoRgba: gbuf.albedo,
      normalDepthF32: gbuf.normalDepth,
      materialF32: gbuf.material,
      config: {
        width: w,
        height: h,
        lightDirection: [0.92, 0.3, 0.22],
        giIntensity: 1.0,
        giRadiusPx: 5,
        enablePcss: false,
        enableReflection: false,
        enableRefraction: false,
      },
    });
    expect(ssgiRes.stats.averageGiLuminance).toBeGreaterThan(0.2);
    // 경계 인접 중성 픽셀 (x=8, y=8)에서 Red > Blue 간접광 번짐 확인
    const probeOff = (8 * w + 8) * 4;
    expect(ssgiRes.rgba[probeOff]).toBeGreaterThan(ssgiRes.rgba[probeOff + 2] + 10);

    // 2) 시간적 누적(Temporal Accumulation) 검증
    const brightHistory = new Uint8ClampedArray(w * h * 4).fill(250);
    const tempRes = trace3dGiShadowCpu({
      albedoRgba: gbuf.albedo,
      normalDepthF32: gbuf.normalDepth,
      materialF32: gbuf.material,
      historyRgba: brightHistory,
      config: {
        width: w,
        height: h,
        enableTemporalAccum: true,
        temporalWeight: 0.5,
        enablePcss: false,
        enableReflection: false,
        enableRefraction: false,
      },
    });
    expect(tempRes.rgba[probeOff + 2]).toBeGreaterThan(ssgiRes.rgba[probeOff + 2]);

    // 3) PCSS 접촉 경화(근거리 블로커 vs 원거리 블로커) 검증
    const sDim = 16;
    const nearShadowMap = new Float32Array(sDim * sDim).fill(0.9);
    const farShadowMap = new Float32Array(sDim * sDim).fill(0.9);
    for (let y = 4; y < 12; y += 1) {
      for (let x = 4; x < 12; x += 1) {
        nearShadowMap[y * sDim + x] = 0.46; // receiver(0.50)에 근접 -> 접촉 경화
        farShadowMap[y * sDim + x] = 0.14; // receiver(0.50)에서 멀리 -> 넓은 반음영
      }
    }
    const pcssNear = trace3dGiShadowCpu({
      albedoRgba: gbuf.albedo,
      normalDepthF32: gbuf.normalDepth,
      materialF32: gbuf.material,
      shadowDepthMap: nearShadowMap,
      config: {
        width: w,
        height: h,
        shadowMapSize: sDim,
        lightSize: 0.14,
        enableSsgi: false,
        enableReflection: false,
        enableRefraction: false,
      },
    });
    const pcssFar = trace3dGiShadowCpu({
      albedoRgba: gbuf.albedo,
      normalDepthF32: gbuf.normalDepth,
      materialF32: gbuf.material,
      shadowDepthMap: farShadowMap,
      config: {
        width: w,
        height: h,
        shadowMapSize: sDim,
        lightSize: 0.14,
        enableSsgi: false,
        enableReflection: false,
        enableRefraction: false,
      },
    });
    expect(pcssNear.stats.contactHardenedPixels).toBeGreaterThan(0);
    expect(pcssFar.stats.softPenumbraPixels).toBeGreaterThan(0);
    expect(pcssNear.stats.averageShadowVisibility).toBeLessThan(0.95);

    // 4) BVH 레이트레이싱 반사(녹색 전면 패널) 및 Snell 굴절(시안 후면 패널) 검증
    const bvhScene = buildPackedSahBvh3d([
      // 반사 타겟: z = -1.5 (world_pos z = -5.0에서 +Z 방향 반사광이 적중)
      { v0: [-4, -4, -1.5], v1: [4, -4, -1.5], v2: [4, 4, -1.5], albedo: [0.05, 0.95, 0.1] },
      { v0: [-4, -4, -1.5], v1: [4, 4, -1.5], v2: [-4, 4, -1.5], albedo: [0.05, 0.95, 0.1] },
      // 굴절 타겟: z = -9.0 (world_pos z = -5.0에서 -Z 방향 굴절광이 적중)
      { v0: [-4, -4, -9.0], v1: [4, -4, -9.0], v2: [4, 4, -9.0], albedo: [0.05, 0.85, 0.98] },
      { v0: [-4, -4, -9.0], v1: [4, 4, -9.0], v2: [-4, 4, -9.0], albedo: [0.05, 0.85, 0.98] },
    ]);

    const rtBuf = makeFlatGBuffer(8, 8);
    // 왼쪽 절반: 저러프니스 금속 거울, 오른쪽 절반: 투과성 유리(transmission=0.9)
    for (let y = 0; y < 8; y += 1) {
      for (let x = 0; x < 8; x += 1) {
        const o = (y * 8 + x) * 4;
        if (x < 4) {
          rtBuf.material[o] = 0.05; // roughness
          rtBuf.material[o + 1] = 0.95; // metallic
          rtBuf.material[o + 2] = 0.0; // transmission
        } else {
          rtBuf.material[o] = 0.1;
          rtBuf.material[o + 1] = 0.0;
          rtBuf.material[o + 2] = 0.92; // glass transmission
        }
      }
    }

    const rtRes = trace3dGiShadowCpu({
      albedoRgba: rtBuf.albedo,
      normalDepthF32: rtBuf.normalDepth,
      materialF32: rtBuf.material,
      bvh: bvhScene,
      config: {
        width: 8,
        height: 8,
        enableSsgi: false,
        enablePcss: false,
        reflectionStrength: 0.95,
        refractionStrength: 0.95,
        ior: 1.5,
      },
    });
    expect(rtRes.stats.reflectionHitCount).toBe(64);
    expect(rtRes.stats.refractionHitCount).toBe(32);
    expect(rtRes.stats.totalBvhNodesVisited).toBeGreaterThan(64);
    // 금속 거울 픽셀(x=1, y=4): 녹색 우세
    const mirrorOff = (4 * 8 + 1) * 4;
    expect(rtRes.rgba[mirrorOff + 1]).toBeGreaterThan(rtRes.rgba[mirrorOff] + 40);
    // 투과 유리 픽셀(x=6, y=4): 시안(B/G) 우세
    const glassOff = (4 * 8 + 6) * 4;
    expect(rtRes.rgba[glassOff + 2]).toBeGreaterThan(rtRes.rgba[glassOff] + 40);
  });

  it("WebGPU 모의 디바이스 디스패치 및 null 디바이스 CPU 폴백 검증", async () => {
    const gbuf = makeFlatGBuffer(32, 16);
    const { device, stats } = createMockGpuDevice();
    const gpuRes = await dispatch3dGiShadowRaytrace({
      device,
      albedoRgba: gbuf.albedo,
      normalDepthF32: gbuf.normalDepth,
      materialF32: gbuf.material,
      config: { width: 32, height: 16 },
    });
    expect(gpuRes.backend).toBe("webgpu-compute");
    expect(gpuRes.gpuOutputBuffer).not.toBeNull();
    expect(stats.dispatches).toEqual([[2, 1, 1]]);
    expect(stats.submissions).toBe(1);
    expect(stats.createdBuffers.filter((b) => b.destroyed).length).toBe(8);

    const cpuRes = await dispatch3dGiShadowRaytrace({
      device: null,
      albedoRgba: gbuf.albedo,
      normalDepthF32: gbuf.normalDepth,
      materialF32: gbuf.material,
      config: { width: 32, height: 16 },
    });
    expect(cpuRes.backend).toBe("cpu-fallback");
    expect(cpuRes.cpuResult?.rgba.length).toBe(32 * 16 * 4);
  });
});

describe("wasm64-3d-nextgen-render: 2. WebGPU 절두체 + Hi-Z 컬링 및 LOD Indirect 패커", () => {
  const defaultLods: readonly LodLevelRange[] = [
    { lodIndex: 0, indexCount: 6000, firstIndex: 0, baseVertex: 0, maxDistanceMeters: 12 },
    { lodIndex: 1, indexCount: 2400, firstIndex: 6000, baseVertex: 0, maxDistanceMeters: 26 },
    { lodIndex: 2, indexCount: 720, firstIndex: 8400, baseVertex: 0, maxDistanceMeters: 50 },
    { lodIndex: 3, indexCount: 180, firstIndex: 9120, baseVertex: 0, maxDistanceMeters: 160 },
  ];

  it("WGSL Hi-Z 절두체 컬링 셰이더 정적 검증 통과", () => {
    const val = validateHiZFrustumCullWgsl(WGSL_HI_Z_FRUSTUM_CULL);
    expect(val.valid).toBe(true);
    expect(val.errors).toEqual([]);
    expect(val.workgroupSize).toBe(64);
    expect(val.bindings.length).toBe(7);
    expect(val.hasDrawIndirectStruct).toBe(true);
    expect(val.hasFrustumTest).toBe(true);
    expect(val.hasHiZTest).toBe(true);
    expect(val.hasLodSelect).toBe(true);
  });

  it("Gribb-Hartmann 6평면 추출 및 홀수 해상도 보수적 Hi-Z 피라미드 불변식 검증", () => {
    const proj = createPerspectiveMatrixWebGpu(Math.PI / 3, 16 / 9, 0.5, 120);
    const view = createLookAtMatrix([0, 2, 0], [0, 2, -10]);
    const vp = multiplyMat4(proj, view);
    const frustum = extractFrustumPlanesGribbHartmann(vp, true);
    expect(frustum.packedF32.length).toBe(24);
    // 모든 평면 법선은 단위 길이
    for (let i = 0; i < 6; i += 1) {
      const len = Math.hypot(frustum.packedF32[i * 4], frustum.packedF32[i * 4 + 1], frustum.packedF32[i * 4 + 2]);
      expect(len).toBeCloseTo(1, 5);
    }

    // 17×13 홀수 해상도 Hi-Z 피라미드에서 최상위 1×1 밉이 전체 최대 깊이를 보수적으로 보존
    const w = 17;
    const h = 13;
    const depth = new Float32Array(w * h).fill(0.35);
    depth[(h - 1) * w + (w - 1)] = 0.91;
    const pyramid = buildHiZPyramid(depth, w, h);
    expect(pyramid.mipCount).toBeGreaterThanOrEqual(5);
    const topMip = pyramid.levels[pyramid.mipCount - 1];
    expect(topMip.width).toBe(1);
    expect(topMip.height).toBe(1);
    expect(pyramid.data[topMip.offset]).toBeCloseTo(0.91, 5);
  });

  it("혼합 3D 스테이지(화면 밖 · 벽 뒤 차폐 · 원거리 LOD)에서 >80% 폴리곤 절감 및 20B Indirect 패킹 입증", () => {
    const proj = createPerspectiveMatrixWebGpu(Math.PI / 3, 16 / 9, 0.5, 120);
    const camPos: readonly [number, number, number] = [0, 2, 0];
    const view = createLookAtMatrix(camPos, [0, 2, -10]);
    const vp = multiplyMat4(proj, view);

    // 화면 왼쪽 절반(u < 0.5)에 z = -6m 대형 차폐벽 배치 -> WebGPU NDC 깊이 ≈ (120*(6-0.5))/(6*(120-0.5)) ≈ 0.9205
    const hizW = 64;
    const hizH = 64;
    const baseDepth = new Float32Array(hizW * hizH).fill(1.0);
    const wallNdcZ = (120 * (6 - 0.5)) / (6 * (120 - 0.5));
    for (let y = 8; y < 56; y += 1) {
      for (let x = 4; x < 34; x += 1) {
        baseDepth[y * hizW + x] = wallNdcZ;
      }
    }
    const hiZPyramid = buildHiZPyramid(baseDepth, hizW, hizH);

    const instances: CullableInstance3d[] = [];
    let nextId = 1;
    // 1) 카메라 뒤/좌우 화면 밖 인스턴스 110개 -> 절두체 컬링
    for (let i = 0; i < 60; i += 1) {
      instances.push({ instanceId: nextId++, aabbMin: [-1, 0, 5 + i], aabbMax: [1, 2, 7 + i] });
    }
    for (let i = 0; i < 50; i += 1) {
      instances.push({ instanceId: nextId++, aabbMin: [45 + i, 0, -12], aabbMax: [47 + i, 2, -10] });
    }
    // 2) 왼쪽 차폐벽 뒤(z = -24m, x ∈ [-5, -1]) 인스턴스 70개 -> Hi-Z 차폐 컬링
    for (let i = 0; i < 70; i += 1) {
      const x = -4.5 + (i % 7) * 0.5;
      const z = -22 - Math.floor(i / 7) * 1.2;
      instances.push({ instanceId: nextId++, aabbMin: [x - 0.25, 1.2, z - 0.25], aabbMax: [x + 0.25, 2.2, z + 0.25] });
    }
    // 3) 오른쪽 개방 영역 원거리(z = -60..-95m) 인스턴스 45개 -> LOD3 저폴리곤 선택
    for (let i = 0; i < 45; i += 1) {
      const x = 6 + (i % 5) * 2.2;
      const z = -60 - Math.floor(i / 5) * 3.5;
      instances.push({ instanceId: nextId++, aabbMin: [x - 0.5, 0.5, z - 0.5], aabbMax: [x + 0.5, 2.5, z + 0.5] });
    }
    // 4) 오른쪽 근거리(z = -8..-10m) 가시 영웅 소품 10개 -> LOD0
    for (let i = 0; i < 10; i += 1) {
      const x = 1.2 + (i % 5) * 0.7;
      const z = -8 - Math.floor(i / 5) * 1.5;
      instances.push({ instanceId: nextId++, aabbMin: [x - 0.25, 1.0, z - 0.25], aabbMax: [x + 0.25, 2.0, z + 0.25] });
    }

    const result = cullAndPackInstancesCpu(instances, {
      viewProjectionMatrix: vp,
      cameraPosition: camPos,
      hiZPyramid,
      lodLevels: defaultLods,
    });

    expect(result.metrics.totalInstances).toBe(235);
    expect(result.metrics.frustumCulledCount).toBe(110);
    expect(result.metrics.hiZCulledCount).toBe(70);
    expect(result.metrics.visibleInstances).toBe(55);
    expect(result.metrics.lodDistribution[0]).toBe(10);
    expect(result.metrics.lodDistribution[3]).toBe(45);
    expect(result.metrics.polygonReductionRatio).toBeGreaterThan(0.8);

    // 20바이트 WebGPU DrawIndexedIndirect 바이너리 레이아웃 검증
    expect(result.packed.totalByteLength).toBe(result.packed.commands.length * DRAW_INDEXED_INDIRECT_BYTES);
    const dv = new DataView(result.packed.drawIndirectBuffer);
    let totalPackedInstances = 0;
    for (let c = 0; c < result.packed.commands.length; c += 1) {
      const cmd = result.packed.commands[c];
      const off = c * DRAW_INDEXED_INDIRECT_BYTES;
      expect(dv.getUint32(off + 0, true)).toBe(cmd.indexCount);
      expect(dv.getUint32(off + 4, true)).toBe(cmd.instanceCount);
      expect(dv.getUint32(off + 8, true)).toBe(cmd.firstIndex);
      expect(dv.getInt32(off + 12, true)).toBe(cmd.baseVertex);
      expect(dv.getUint32(off + 16, true)).toBe(cmd.firstInstance);
      totalPackedInstances += cmd.instanceCount;
    }
    expect(totalPackedInstances).toBe(55);

    // packDistanceLodCommands 직접 패킹 시 다중 그룹 정렬 검증
    const directPack = packDistanceLodCommands([
      { instanceId: 9, meshGroupId: 2, distanceMeters: 5, lodRange: defaultLods[0] },
      { instanceId: 3, meshGroupId: 0, distanceMeters: 80, lodRange: defaultLods[3] },
    ]);
    expect(directPack.commands.length).toBe(2);
    expect(directPack.commands[0].meshGroupId).toBe(0);
    expect(directPack.commands[1].meshGroupId).toBe(2);
  });

  it("WebGPU 모의 디바이스 Hi-Z 컬링 디스패치 시 INDIRECT 플래그 버퍼 생성 검증", async () => {
    const proj = createPerspectiveMatrixWebGpu(Math.PI / 3, 16 / 9, 0.5, 100);
    const view = createLookAtMatrix([0, 2, 0], [0, 2, -10]);
    const vp = multiplyMat4(proj, view);
    const { device, stats } = createMockGpuDevice();
    const instances: CullableInstance3d[] = [
      { instanceId: 1, aabbMin: [-1, 0, -10], aabbMax: [1, 2, -8] },
      { instanceId: 2, aabbMin: [-1, 0, 10], aabbMax: [1, 2, 12] },
    ];
    const res = await dispatchHiZFrustumCull({
      device,
      instances,
      config: { viewProjectionMatrix: vp, cameraPosition: [0, 2, 0], lodLevels: defaultLods },
    });
    expect(res.backend).toBe("webgpu-compute");
    expect(res.workgroupCountX).toBe(1);
    expect(res.gpuIndirectBuffer).not.toBeNull();
    expect((res.gpuIndirectBuffer?.usage ?? 0) & HI_Z_INDIRECT_BUFFER_USAGE.INDIRECT).toBe(
      HI_Z_INDIRECT_BUFFER_USAGE.INDIRECT,
    );
    expect(stats.dispatches).toEqual([[1, 1, 1]]);
  });
});

describe("wasm64-3d-nextgen-render: 3. 제로-스토리지 절차적 3D 메쉬 및 PBR 텍스처 합성기", () => {
  it("5종 건축·소품 메쉬 전체 수밀 2-매니폴드 · 퇴화 0 · minY===0 · 유효 법선/UV 불변식 통과", () => {
    const meshes = [
      generateProceduralStaircase({ stepCount: 10, widthMeters: 1.4 }),
      generateProceduralColonnadePillar({ heightMeters: 3.6, radialSegments: 24 }),
      generateProceduralStudioWindowFrame({ widthMeters: 2.0, heightMeters: 2.2 }),
      generateProceduralRoomShell({ widthMeters: 6.0, heightMeters: 3.2, depthMeters: 5.0 }),
      generateProceduralStylizedTree({ heightMeters: 4.5, radialSegments: 16, canopySubdivisions: 4 }),
    ];

    for (const mesh of meshes) {
      const report = inspectProceduralMeshQuality(mesh);
      expect(report.triangleCount).toBeGreaterThan(20);
      expect(report.degenerateTriangleCount).toBe(0);
      expect(report.looseVertexCount).toBe(0);
      expect(report.nonManifoldEdgeCount).toBe(0);
      expect(report.boundaryEdgeCount).toBe(0);
      expect(report.isWatertightManifold).toBe(true);
      expect(report.isGroundedAtZero).toBe(true);
      expect(report.boundsMin[1]).toBe(0);
      expect(report.heightMeters).toBeGreaterThan(1.0);
      expect(report.hasValidNormals).toBe(true);
      expect(report.hasValidUvs).toBe(true);
      expect(report.degenerateUvTriangleCount).toBe(0);
    }

    // 결정적 재현성 검증
    const treeA = generateProceduralStylizedTree({ seed: 77 });
    const treeB = generateProceduralStylizedTree({ seed: 77 });
    expect(treeA.positions).toEqual(treeB.positions);
    expect(treeA.indices).toEqual(treeB.indices);
  });

  it("4종 절차적 PBR 텍스처(알베도 · 탄젠트 노멀 · 러프니스) 결정성 및 물리 유효성 검증", () => {
    const materials: readonly ProceduralMaterialKind[] = [
      "concrete",
      "wood-grain",
      "brick-wall",
      "manga-screentone",
    ];
    const width = 64;
    const height = 64;
    const expectedLen = width * height * 4;

    for (const material of materials) {
      const texA = synthesizeProceduralPbrTextures({ material, width, height, seed: 2026 });
      const texB = synthesizeProceduralPbrTextures({ material, width, height, seed: 2026 });
      expect(texA.albedoRgba.length).toBe(expectedLen);
      expect(texA.normalRgba.length).toBe(expectedLen);
      expect(texA.roughnessRgba.length).toBe(expectedLen);
      expect(texA.albedoRgba).toEqual(texB.albedoRgba);
      expect(texA.normalRgba).toEqual(texB.normalRgba);
      expect(texA.stats.meanNormalZ).toBeGreaterThan(0.75);
      expect(texA.stats.minNormalZ).toBeGreaterThan(0.1);
      expect(texA.stats.albedoStdDev).toBeGreaterThan(0.02);
      expect(texA.stats.meanRoughness).toBeGreaterThan(0.25);
      expect(texA.stats.meanRoughness).toBeLessThan(0.98);

      // 샘플 노멀맵 디코딩 시 단위 법선 및 +Z 외향성 확인
      for (let i = 0; i < expectedLen; i += 64) {
        const nx = (texA.normalRgba[i] / 255) * 2 - 1;
        const ny = (texA.normalRgba[i + 1] / 255) * 2 - 1;
        const nz = (texA.normalRgba[i + 2] / 255) * 2 - 1;
        expect(nz).toBeGreaterThan(0.05);
        expect(Math.hypot(nx, ny, nz)).toBeCloseTo(1, 1);
        expect(texA.albedoRgba[i + 3]).toBe(255);
      }
    }

    // 재질별 고유 색/대비 특성 구분 확인
    const brick = synthesizeProceduralPbrTextures({ material: "brick-wall", width: 64, height: 64, seed: 99 });
    const screentone = synthesizeProceduralPbrTextures({ material: "manga-screentone", width: 64, height: 64, seed: 99 });
    let brickRedSum = 0;
    let brickBlueSum = 0;
    for (let i = 0; i < brick.albedoRgba.length; i += 4) {
      brickRedSum += brick.albedoRgba[i];
      brickBlueSum += brick.albedoRgba[i + 2];
    }
    expect(brickRedSum).toBeGreaterThan(brickBlueSum * 1.4);
    expect(screentone.stats.albedoStdDev).toBeGreaterThan(0.18);
  });
});

describe("wasm64-3d-nextgen-render: 4. 오디오 반응형 3D 스테이지 엔진(Radix-2 FFT + 비트 검출 + 64B 유니폼)", () => {
  it("Radix-2 FFT 440Hz 정밀 피크 검출 및 5대역 주파수 분리 검증", () => {
    const sr = 48_000;
    const fftSize = 2048;
    const sine440 = makeSinePcm(440, fftSize, sr, 1.0);
    const fft = computeRadix2FftMagnitude(sine440, sr, fftSize);
    expect(Math.abs(fft.peakFrequencyHz - 440)).toBeLessThan(fft.binHz);
    expect(fft.peakMagnitude).toBeGreaterThan(0.85);
    expect(() => computeRadix2FftMagnitude(sine440, sr, 1000)).toThrow(RangeError);

    const bandCases: readonly { readonly freq: number; readonly expected: "subBass" | "bass" | "mid" | "presence" | "brilliance" }[] = [
      { freq: 42, expected: "subBass" },
      { freq: 130, expected: "bass" },
      { freq: 950, expected: "mid" },
      { freq: 3800, expected: "presence" },
      { freq: 10500, expected: "brilliance" },
    ];
    for (const tc of bandCases) {
      const res = extract5BandSpectrumEnergies(computeRadix2FftMagnitude(makeSinePcm(tc.freq, fftSize, sr, 0.9), sr, fftSize));
      const scores = {
        subBass: res.subBass,
        bass: res.bass,
        mid: res.mid,
        presence: res.presence,
        brilliance: res.brilliance,
      };
      expect(scores[tc.expected]).toBeGreaterThan(0.65);
      for (const [k, v] of Object.entries(scores)) {
        if (k !== tc.expected) {
          expect(scores[tc.expected]).toBeGreaterThan(v + 0.35);
        }
      }
    }
  });

  it("Wave-3 평면 스테레오 120 BPM 킥 트레인 비트 온셋 검출 · BPM 추정 · 64B GPU 유니폼 패킹 검증", () => {
    const sr = 48_000;
    const hop = 1024; // ≈ 21.33 ms / frame
    const totalFrames = 140; // ≈ 2.99 sec
    const engine = new AudioReactive3dStageEngine({
      sampleRate: sr,
      fftSize: 1024,
      maxCameraShakeMeters: 0.04,
    });

    const onsetTimes: number[] = [];
    let maxLightScale = 0;
    let maxRimPulse = 0;
    let maxSpeedline = 0;
    let lastPacked = engine.processFrame(new Float32Array(hop));
    engine.reset();

    for (let f = 0; f < totalFrames; f += 1) {
      const tStart = (f * hop) / sr;
      const left = new Float32Array(hop);
      const right = new Float32Array(hop);
      // 0.50초 간격(120 BPM)으로 킥 드럼(65Hz~130Hz) + 하이햇 어택 합성
      const beatPhase = tStart % 0.5;
      const isKickWindow = tStart >= 0.45 && beatPhase < 0.045;
      for (let i = 0; i < hop; i += 1) {
        const t = tStart + i / sr;
        let s = Math.sin(2 * Math.PI * 220 * t) * 0.03; // 약한 배경 드론
        if (isKickWindow) {
          const env = Math.exp(-((beatPhase + i / sr) * 45));
          s += (Math.sin(2 * Math.PI * 75 * t) * 0.85 + Math.sin(2 * Math.PI * 3200 * t) * 0.3) * env;
        }
        left[i] = s;
        right[i] = s * 0.98;
      }

      lastPacked = engine.processFrame({
        left,
        right,
        sampleRate: sr,
        integratedLufs: -14.2,
        truePeakLinear: isKickWindow ? 0.92 : 0.04,
      });

      if (lastPacked.state.isBeatOnset) {
        onsetTimes.push(lastPacked.state.stageTimeSec);
      }
      maxLightScale = Math.max(maxLightScale, lastPacked.state.lightIntensityScale);
      maxRimPulse = Math.max(maxRimPulse, lastPacked.state.celRimPulse);
      maxSpeedline = Math.max(maxSpeedline, lastPacked.state.speedlineDensity);
      expect(Math.abs(lastPacked.state.cameraShakeX)).toBeLessThanOrEqual(0.0401);
      expect(Math.abs(lastPacked.state.cameraShakeY)).toBeLessThanOrEqual(0.0301);
    }

    expect(onsetTimes.length).toBeGreaterThanOrEqual(4);
    expect(lastPacked.state.estimatedBpm).toBeGreaterThanOrEqual(108);
    expect(lastPacked.state.estimatedBpm).toBeLessThanOrEqual(132);
    expect(maxLightScale).toBeGreaterThan(1.35);
    expect(maxRimPulse).toBeGreaterThan(0.45);
    expect(maxSpeedline).toBeGreaterThan(0.45);

    // 64바이트 WebGPU 유니폼 버퍼 오프셋 & WGSL 구조체 정합성 검증
    expect(WGSL_AUDIO_REACTIVE_STAGE_UNIFORMS).toContain("struct AudioReactiveStageUniforms");
    expect(lastPacked.byteLength).toBe(AUDIO_REACTIVE_UNIFORM_BYTES);
    expect(lastPacked.bytes.byteLength).toBe(64);
    const dv = new DataView(lastPacked.buffer);
    expect(dv.getFloat32(0, true)).toBeCloseTo(lastPacked.state.bands.subBass, 5);
    expect(dv.getFloat32(28, true)).toBeCloseTo(lastPacked.state.estimatedBpm, 4);
    expect(dv.getFloat32(32, true)).toBeCloseTo(lastPacked.state.lightIntensityScale, 5);
    expect(dv.getFloat32(48, true)).toBeCloseTo(lastPacked.state.speedlineDensity, 5);
    expect(dv.getUint32(56, true)).toBe(totalFrames - 1);
    expect(dv.getUint32(60, true)).toBe(lastPacked.state.flags);
    expect(AUDIO_REACTIVE_FLAGS.IS_BEAT_ONSET).toBe(1);
  });
});
