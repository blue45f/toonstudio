import { describe, expect, it } from "vitest";

import {
  alignedSoAToInterleavedRgba,
  bfloat16BitsToFloat32,
  compositeAlignedSoATilesPremultipliedFma,
  convertBfloat16ToFloat32Batch,
  convertFloat16ToFloat32Batch,
  convertFloat32ToBfloat16Batch,
  convertFloat32ToFloat16Batch,
  createAlignedSoATileBuffer,
  detectCpuIsaCapabilities,
  executeDepthwiseSeparableConv2d,
  executeDirectConv2d3x3Reference,
  executeHaloTiledCanvasInference,
  executeHeterogeneousGraphWithFallback,
  executeWinogradConv2d3x3,
  float16BitsToFloat32,
  float32ToBfloat16Bits,
  float32ToFloat16Bits,
  interleavedRgbaToAlignedSoA,
  MAX_SOA_SCALAR_EQUIVALENCE_EPSILON,
  partitionAndRouteNeuralGraph,
  probeWasmInstructionSupport,
  pruneConv2dOutputChannelsStructured,
  quantizeAndAuditTensor,
  selectOptimalSimdKernelDispatch,
  SIMD_CACHE_LINE_BYTES,
  verifySoAFmaKernelEquivalence,
  type HardwarePoolRuntimeStatus,
  type NeuralGraphNodeSpec,
} from "./index";

function makeDeterministicTensor(length: number, seed = 17): Float32Array {
  const out = new Float32Array(length);
  let state = seed >>> 0;
  for (let i = 0; i < length; i += 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    out[i] = Math.fround(((state / 0xffffffff) * 2 - 1) * 1.75);
  }
  return out;
}

describe("wasm64-wave40-heterogeneous-npu-simd-fpu-pool", () => {
  it("1. 런타임 WASM 엔진에서 simd128 및 relaxed-simd 명령어 유효성을 결정론적으로 탐지한다", () => {
    const support = probeWasmInstructionSupport();
    expect(support.simd128).toBe(true);
    expect(typeof support.relaxedFmaF32x4).toBe("boolean");
    expect(typeof support.relaxedDotI8x16I7x16AddS).toBe("boolean");
    expect(typeof support.relaxedLaneSelect).toBe("boolean");
  });

  it("2. 호스트 CPU 아키텍처 힌트별로 최적 레인 폭(4/8/16)과 FMA·VNNI 디스패치 계획을 수립한다", () => {
    const armCaps = detectCpuIsaCapabilities({
      arch: "arm64",
      userAgent: "AppleSilicon",
      hardwareConcurrency: 10,
      wasmOverride: { simd128: true, relaxedFmaF32x4: true, relaxedDotI8x16I7x16AddS: true, relaxedLaneSelect: true },
    });
    expect(armCaps.hostArchHint).toBe("arm64-neon-amx");
    const armPlan = selectOptimalSimdKernelDispatch(armCaps, 4096);
    expect(armPlan.tier).toBe("wasm-relaxed-simd-fma");
    expect(armPlan.laneWidth).toBe(16);
    expect(armPlan.useFmaPipeline).toBe(true);
    expect(armPlan.useInt8DotProduct).toBe(true);

    const avx512Caps = detectCpuIsaCapabilities({
      arch: "x86_64",
      cpuFlags: ["avx512f", "avx512_vnni"],
      hardwareConcurrency: 16,
      wasmOverride: { simd128: true, relaxedFmaF32x4: false },
    });
    expect(avx512Caps.hostArchHint).toBe("x86_64-avx512-vnni");
    expect(selectOptimalSimdKernelDispatch(avx512Caps, 512).laneWidth).toBe(16);

    const avx2Caps = detectCpuIsaCapabilities({
      arch: "x64",
      cpuFlags: ["avx2", "fma"],
      hardwareConcurrency: 8,
      wasmOverride: { simd128: true, relaxedFmaF32x4: true, relaxedDotI8x16I7x16AddS: false },
    });
    expect(avx2Caps.hostArchHint).toBe("x86_64-avx2-fma");
    expect(selectOptimalSimdKernelDispatch(avx2Caps, 256).laneWidth).toBe(8);
  });

  it("3. WASM SIMD 미지원 환경에서는 scalar-ieee754 티어로 안전하게 폴백한다", () => {
    const scalarCaps = detectCpuIsaCapabilities({
      arch: "arm64",
      hardwareConcurrency: 4,
      wasmOverride: { simd128: false, relaxedFmaF32x4: true, relaxedDotI8x16I7x16AddS: true, relaxedLaneSelect: true },
    });
    expect(scalarCaps.hostArchHint).toBe("scalar-ieee754");
    expect(scalarCaps.relaxedSimd).toBe(false);
    const plan = selectOptimalSimdKernelDispatch(scalarCaps, 4096);
    expect(plan.tier).toBe("scalar-ieee754");
    expect(plan.useFmaPipeline).toBe(false);
    expect(plan.useInt8DotProduct).toBe(false);
  });

  it("4. IEEE-754 FP16 변환기가 부호 있는 영, 정규수, 비정규수, 무한대, NaN을 정확히 처리한다", () => {
    expect(float32ToFloat16Bits(0)).toBe(0x0000);
    expect(Object.is(float16BitsToFloat32(0x0000), 0)).toBe(true);
    expect(float32ToFloat16Bits(-0)).toBe(0x8000);
    expect(Object.is(float16BitsToFloat32(0x8000), -0)).toBe(true);
    expect(float32ToFloat16Bits(1.0)).toBe(0x3c00);
    expect(float16BitsToFloat32(0x3c00)).toBe(1.0);
    expect(float32ToFloat16Bits(-2.0)).toBe(0xc000);
    expect(float16BitsToFloat32(0xc000)).toBe(-2.0);
    expect(float32ToFloat16Bits(2 ** -24)).toBe(0x0001);
    expect(float16BitsToFloat32(0x0001)).toBe(2 ** -24);
    expect(float32ToFloat16Bits(Number.POSITIVE_INFINITY)).toBe(0x7c00);
    expect(float32ToFloat16Bits(Number.NEGATIVE_INFINITY)).toBe(0xfc00);
    expect(float16BitsToFloat32(0x7c00)).toBe(Number.POSITIVE_INFINITY);
    expect(float16BitsToFloat32(0xfc00)).toBe(Number.NEGATIVE_INFINITY);
    const nanBits = float32ToFloat16Bits(Number.NaN);
    expect(Number.isNaN(float16BitsToFloat32(nanBits))).toBe(true);
  });

  it("5. IEEE-754 FP16 변환기가 Round-to-Nearest-Even 짝수 반올림과 오버플로 경계를 지킨다", () => {
    expect(float32ToFloat16Bits(1 + 2 ** -11)).toBe(0x3c00);
    expect(float32ToFloat16Bits(1 + 2 ** -10 + 2 ** -11)).toBe(0x3c02);
    expect(float32ToFloat16Bits(2 ** -25)).toBe(0x0000);
    expect(float32ToFloat16Bits(2 ** -25 * 1.01)).toBe(0x0001);
    expect(float32ToFloat16Bits(65504)).toBe(0x7bff);
    expect(float16BitsToFloat32(0x7bff)).toBe(65504);
    expect(float32ToFloat16Bits(65520)).toBe(0x7c00);
  });

  it("6. IEEE-754 BF16 변환기가 RNE 짝수 반올림 및 하위 비트 신호 NaN의 Quiet NaN 보존을 보장한다", () => {
    expect(float32ToBfloat16Bits(1.0)).toBe(0x3f80);
    expect(bfloat16BitsToFloat32(0x3f80)).toBe(1.0);
    expect(float32ToBfloat16Bits(-0)).toBe(0x8000);
    expect(Object.is(bfloat16BitsToFloat32(0x8000), -0)).toBe(true);
    expect(float32ToBfloat16Bits(1 + 2 ** -8)).toBe(0x3f80);
    expect(float32ToBfloat16Bits(1 + 2 ** -7 + 2 ** -8)).toBe(0x3f82);

    const rawBuf = new ArrayBuffer(4);
    new Uint32Array(rawBuf)[0] = 0x7f800001;
    const bf16Nan = float32ToBfloat16Bits(new Float32Array(rawBuf)[0] ?? Number.NaN);
    expect(bf16Nan).not.toBe(0x7f80);
    expect(Number.isNaN(bfloat16BitsToFloat32(bf16Nan))).toBe(true);
  });

  it("7. FP16·BF16 일괄 변환기가 비정렬 subarray 입력에서도 단건 변환과 정확히 일치한다", () => {
    const unalignedSrc = new Float32Array(new ArrayBuffer(64), 4, 9);
    const sample = [-12.5, -0.0, 0.0, 2 ** -20, 0.33333334, 1.5, 42.25, Number.POSITIVE_INFINITY, Number.NaN];
    unalignedSrc.set(sample);

    const fp16Batch = convertFloat32ToFloat16Batch(unalignedSrc);
    const fp16Roundtrip = convertFloat16ToFloat32Batch(fp16Batch);
    const bf16Batch = convertFloat32ToBfloat16Batch(unalignedSrc);
    const bf16Roundtrip = convertBfloat16ToFloat32Batch(bf16Batch);

    for (let i = 0; i < sample.length; i += 1) {
      expect(fp16Batch[i]).toBe(float32ToFloat16Bits(unalignedSrc[i] ?? 0));
      expect(bf16Batch[i]).toBe(float32ToBfloat16Bits(unalignedSrc[i] ?? 0));
      if (Number.isNaN(sample[i] ?? 0)) {
        expect(Number.isNaN(fp16Roundtrip[i] ?? 0)).toBe(true);
        expect(Number.isNaN(bf16Roundtrip[i] ?? 0)).toBe(true);
      } else {
        expect(Object.is(fp16Roundtrip[i], float16BitsToFloat32(fp16Batch[i] ?? 0))).toBe(true);
        expect(Object.is(bf16Roundtrip[i], bfloat16BitsToFloat32(bf16Batch[i] ?? 0))).toBe(true);
      }
    }
  });

  it("8. 64바이트 캐시라인 정렬 SoA 타일 버퍼가 모든 평면 오프셋 정렬과 무손실 왕복 변환을 보장한다", () => {
    const tile = createAlignedSoATileBuffer(13, 7);
    expect(tile.paddedLength).toBe(96);
    expect(tile.r.byteOffset % SIMD_CACHE_LINE_BYTES).toBe(0);
    expect(tile.g.byteOffset % SIMD_CACHE_LINE_BYTES).toBe(0);
    expect(tile.b.byteOffset % SIMD_CACHE_LINE_BYTES).toBe(0);
    expect(tile.a.byteOffset % SIMD_CACHE_LINE_BYTES).toBe(0);

    const rgba = makeDeterministicTensor(13 * 7 * 4, 99);
    expect(alignedSoAToInterleavedRgba(interleavedRgbaToAlignedSoA(rgba, 13, 7))).toEqual(rgba);
  });

  it("9. 4·8·16-레인 SoA 브러시 감쇠 FMA 커널이 스칼라 기준 구현과 오차 <= 1e-6 이내로 일치한다", () => {
    const base = makeDeterministicTensor(32 * 32 * 4, 2026).map((v) => Math.abs(v) * 0.4);
    const dab = { centerX: 15.25, centerY: 16.75, radiusPx: 12.5, hardness: 0.45, opacity: 0.82, colorR: 0.91, colorG: 0.34, colorB: 0.18 };
    for (const laneWidth of [4, 8, 16] as const) {
      const report = verifySoAFmaKernelEquivalence(32, 32, dab, laneWidth, base);
      expect(report.passed).toBe(true);
      expect(report.cacheLineAligned).toBe(true);
      expect(report.maxAbsError).toBeLessThanOrEqual(MAX_SOA_SCALAR_EQUIVALENCE_EPSILON);
    }
  });

  it("10. 프리멀티플라이 SoA 타일 Source-Over FMA 합성이 정확한 색·알파 누적을 수행한다", () => {
    const dst = interleavedRgbaToAlignedSoA(new Float32Array([0.2, 0.4, 0.6, 0.5, 0, 0, 0, 0]), 2, 1);
    const src = interleavedRgbaToAlignedSoA(new Float32Array([0.4, 0.2, 0.1, 0.5, 0.8, 0.6, 0.2, 1.0]), 2, 1);
    compositeAlignedSoATilesPremultipliedFma(dst, src, 1.0, 4);
    const out = alignedSoAToInterleavedRgba(dst);
    expect(out[0]).toBeCloseTo(0.5, 6);
    expect(out[1]).toBeCloseTo(0.4, 6);
    expect(out[2]).toBeCloseTo(0.4, 6);
    expect(out[3]).toBeCloseTo(0.75, 6);
    expect(out[4]).toBeCloseTo(0.8, 6);
    expect(out[7]).toBeCloseTo(1.0, 6);
  });

  it("11. 이기종 신경망 파티셔너가 정상 상태에서 연산자 특성별로 NPU와 WebGPU에 최적 배치한다", () => {
    const nodes: NeuralGraphNodeSpec[] = [
      { id: "conv1", op: "Conv2D", estimatedMacs: 8e8, workspaceMb: 32, supportsQuantizedInt8: true },
      { id: "gelu1", op: "Gelu", estimatedMacs: 1e6, workspaceMb: 8, supportsQuantizedInt8: true },
      { id: "attn1", op: "Attention", estimatedMacs: 1.2e9, workspaceMb: 64, supportsQuantizedInt8: true },
      { id: "post1", op: "CustomPostProcess", estimatedMacs: 2e7, workspaceMb: 16 },
    ];
    const status: HardwarePoolRuntimeStatus = {
      capabilities: { webnnNpu: true, webnnInt8Supported: true, onnxRuntimeWeb: true, webgpuCompute: true, webgpuShaderF16: true, wasmSimd128: true },
      thermalState: "nominal",
      memoryPressure: "normal",
      availableMemoryMb: 512,
    };
    const plan = partitionAndRouteNeuralGraph(nodes, status);
    expect(plan.assignments[0]?.primaryBackend).toBe("webnn-npu");
    expect(plan.assignments[0]?.precision).toBe("fp16");
    expect(plan.assignments[1]?.primaryBackend).toBe("webnn-npu");
    expect(plan.assignments[2]?.primaryBackend).toBe("webnn-npu");
    expect(plan.assignments[3]?.primaryBackend).toBe("webgpu-compute");
    expect(plan.partitions).toHaveLength(2);
    expect(plan.crossBackendTransfers).toBe(1);
  });

  it("12. 열 스로틀링(critical) 및 메모리 압박 시 WebGPU를 배제하고 INT8/INT4 저전력 정밀도로 전환한다", () => {
    const nodes: NeuralGraphNodeSpec[] = [
      { id: "matmul_q", op: "MatMul", estimatedMacs: 5e8, workspaceMb: 48, supportsQuantizedInt8: true, supportsQuantizedInt4: true },
      { id: "post_blend", op: "ResizeBlend", estimatedMacs: 1e7, workspaceMb: 12 },
    ];
    const plan = partitionAndRouteNeuralGraph(nodes, {
      capabilities: { webnnNpu: true, webnnInt8Supported: true, onnxRuntimeWeb: true, webgpuCompute: true, wasmSimd128: true },
      thermalState: "critical",
      memoryPressure: "critical",
      availableMemoryMb: 256,
    });
    expect(plan.thermalThrottled).toBe(true);
    expect(plan.memoryConstrained).toBe(true);
    expect(plan.assignments[0]?.primaryBackend).toBe("webnn-npu");
    expect(plan.assignments[0]?.precision).toBe("int4");
    expect(plan.assignments[1]?.primaryBackend).toBe("wasm-simd128");
  });

  it("13. WebNN NPU 및 WebGPU 디바이스 손실 발생 시 ONNX -> SIMD 체인으로 무중단 폴백 실행한다", async () => {
    const nodes: NeuralGraphNodeSpec[] = [
      { id: "conv_main", op: "Conv2D", estimatedMacs: 4e8, workspaceMb: 24, supportsQuantizedInt8: true },
      { id: "post_fx", op: "CustomPostProcess", estimatedMacs: 2e7, workspaceMb: 12 },
    ];
    const status: HardwarePoolRuntimeStatus = {
      capabilities: { webnnNpu: true, onnxRuntimeWeb: true, webgpuCompute: true, wasmSimd128: true },
      thermalState: "nominal",
      memoryPressure: "normal",
      availableMemoryMb: 512,
    };
    const plan = partitionAndRouteNeuralGraph(nodes, status);
    const result = await executeHeterogeneousGraphWithFallback(plan, status, (ctx) => {
      if (ctx.activeBackend === "webnn-npu") throw new Error("MLContext lost: NPU driver reset");
      if (ctx.activeBackend === "webgpu-compute") throw new Error("GPUDevice lost: context destroyed");
      return `${ctx.partition.partitionIndex}:${ctx.activeBackend}:${ctx.activePrecision}`;
    });
    expect(result.uninterrupted).toBe(true);
    expect(result.outputs).toEqual(["0:onnx-runtime-web:fp16", "1:wasm-simd128:fp32"]);
    expect(result.failoverEvents).toHaveLength(2);
    expect(result.updatedLostBackends).toEqual(["webnn-npu", "webgpu-compute"]);
  });

  it("14. 헤일로 패딩 + 2D Hann 블렌딩 파이프라인이 연속 기울기 영상에서 경계선 아티팩트 0건을 달성한다", async () => {
    const width = 96;
    const height = 80;
    const canvas = new Float32Array(width * height * 3);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const base = (y * width + x) * 3;
        canvas[base] = x / width;
        canvas[base + 1] = y / height;
        canvas[base + 2] = 0.5 + 0.3 * Math.sin((x + y) * 0.08);
      }
    }
    const res = await executeHaloTiledCanvasInference(
      canvas,
      { width, height, channels: 3, coreTileSize: 32, haloPx: 8, windowKind: "hann" },
      (patch) => patch.map((v) => v * 0.85 + 0.05),
    );
    expect(res.tileCount).toBe(9);
    expect(res.seamArtifactCount).toBe(0);
    expect(res.minWeightCoverage).toBeGreaterThan(0.999);
    for (let i = 0; i < canvas.length; i += 1) {
      expect(res.output[i]).toBeCloseTo((canvas[i] ?? 0) * 0.85 + 0.05, 5);
    }
  });

  it("15. 타일별 정밀도 편차가 있을 때 무패딩 타일은 경계 단차가 생기지만 2D Hann·코사인 헤일로는 0건을 달성한다", async () => {
    const canvas = new Float32Array(96 * 96).fill(0.5);
    const driftRunner = (patch: Float32Array, desc: { readonly gridX: number; readonly gridY: number }) => {
      const drift = ((desc.gridX + desc.gridY) & 1) === 0 ? 0.015 : -0.015;
      return patch.map((v) => v + drift);
    };
    const unblended = await executeHaloTiledCanvasInference(
      canvas,
      { width: 96, height: 96, channels: 1, coreTileSize: 32, haloPx: 0, seamJumpThreshold: 0.01 },
      driftRunner,
    );
    const hannRes = await executeHaloTiledCanvasInference(
      canvas,
      { width: 96, height: 96, channels: 1, coreTileSize: 32, haloPx: 12, windowKind: "hann", seamJumpThreshold: 0.01 },
      driftRunner,
    );
    const cosineRes = await executeHaloTiledCanvasInference(
      canvas,
      { width: 96, height: 96, channels: 1, coreTileSize: 32, haloPx: 12, windowKind: "cosine", seamJumpThreshold: 0.01 },
      driftRunner,
    );
    expect(unblended.seamArtifactCount).toBeGreaterThan(0);
    expect(hannRes.seamArtifactCount).toBe(0);
    expect(cosineRes.seamArtifactCount).toBe(0);
  });

  it("16. 반사 헤일로 패딩 타일 3×3 평균 필터 추론이 전체 캔버스 단일 필터링과 정확히 일치한다", async () => {
    const width = 48;
    const height = 40;
    const canvas = makeDeterministicTensor(width * height, 4040);
    const boxFilter3x3 = (src: Float32Array, w: number, h: number): Float32Array => {
      const out = new Float32Array(w * h);
      const reflect = (c: number, lim: number): number => (c < 0 ? -c : c >= lim ? 2 * lim - 2 - c : c);
      for (let y = 0; y < h; y += 1) {
        for (let x = 0; x < w; x += 1) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              sum += src[reflect(y + dy, h) * w + reflect(x + dx, w)] ?? 0;
            }
          }
          out[y * w + x] = sum / 9;
        }
      }
      return out;
    };
    const fullExpected = boxFilter3x3(canvas, width, height);
    const tiled = await executeHaloTiledCanvasInference(
      canvas,
      { width, height, channels: 1, coreTileSize: 16, haloPx: 8, windowKind: "hann" },
      (patch, desc) => boxFilter3x3(patch, desc.extractWidth, desc.extractHeight),
    );
    let maxDiff = 0;
    for (let i = 0; i < fullExpected.length; i += 1) {
      maxDiff = Math.max(maxDiff, Math.abs((tiled.output[i] ?? 0) - (fullExpected[i] ?? 0)));
    }
    expect(maxDiff).toBeLessThan(1e-6);
    expect(tiled.seamArtifactCount).toBe(0);
  });

  it("17. 그룹 크기(32/64/128) 대칭·비대칭 동적 INT8 양자화기가 높은 SQNR과 메모리 절감을 달성한다", () => {
    const weights = makeDeterministicTensor(1024, 808);
    for (const groupSize of [32, 64, 128] as const) {
      for (const mode of ["symmetric", "asymmetric"] as const) {
        const { report, reconstructed } = quantizeAndAuditTensor(weights, { bits: 8, mode, groupSize });
        expect(reconstructed).toHaveLength(weights.length);
        expect(report.sqnrDb).toBeGreaterThan(40);
        expect(report.payloadSavingsRatio).toBeCloseTo(0.75, 5);
        expect(report.totalMemorySavingsRatio).toBeGreaterThan(0.55);
      }
    }
  });

  it("18. 니블 패킹 INT4(Uint8Array당 2가중치) 양자화기가 홀수 길이 텐서 복원 및 80%+ 절감률을 달성한다", () => {
    const oddWeights = makeDeterministicTensor(1025, 404);
    const sym = quantizeAndAuditTensor(oddWeights, { bits: 4, mode: "symmetric", groupSize: 64 });
    const asym = quantizeAndAuditTensor(oddWeights.map((v) => v + 2.0), { bits: 4, mode: "asymmetric", groupSize: 128 });
    expect(sym.packet.packedData.byteLength).toBe(Math.ceil(1025 / 2));
    expect(sym.reconstructed).toHaveLength(1025);
    expect(sym.report.sqnrDb).toBeGreaterThan(16);
    expect(sym.report.payloadSavingsRatio).toBeGreaterThan(0.87);
    expect(sym.report.totalMemorySavingsRatio).toBeGreaterThan(0.8);
    expect(asym.report.sqnrDb).toBeGreaterThan(20);
    expect(asym.report.totalMemorySavingsRatio).toBeGreaterThan(0.84);
  });

  it("19. 영(0) 텐서 양자화 시 NaN/Infinity 없이 유한한 SQNR 상한(120 dB)과 무오차 복원을 반환한다", () => {
    const { reconstructed, report } = quantizeAndAuditTensor(new Float32Array(128), { bits: 4, mode: "symmetric", groupSize: 32 });
    expect(report.maxAbsError).toBe(0);
    expect(report.sqnrDb).toBe(120);
    expect(reconstructed.every((v) => v === 0)).toBe(true);
  });

  it("20. L1 중요도 기반 구조적 채널 가지치기가 상위 채널·편향을 보존하고 SIMD 배수 정렬을 지킨다", () => {
    const weights = new Float32Array(8 * 2 * 9);
    const bias = new Float32Array(8);
    for (let oc = 0; oc < 8; oc += 1) {
      weights.fill(oc % 2 === 1 ? (oc + 2) * 1.5 : 0.02, oc * 18, (oc + 1) * 18);
      bias[oc] = oc * 0.1;
    }
    const pruned = pruneConv2dOutputChannelsStructured({
      weights,
      outChannels: 8,
      inChannels: 2,
      kernelH: 3,
      kernelW: 3,
      bias,
      targetPruneRatio: 0.5,
      channelMultiple: 4,
    });
    expect(pruned.keptOutChannels).toBe(4);
    expect([...pruned.keptChannelIndices]).toEqual([1, 3, 5, 7]);
    expect([...pruned.prunedChannelIndices]).toEqual([0, 2, 4, 6]);
    expect(pruned.prunedBias?.[0]).toBeCloseTo(0.1, 6);
    expect(pruned.retainedImportanceRatio).toBeGreaterThan(0.98);
  });

  it("21. Winograd F(2×2, 3×3) 합성곱이 다채널·편향·활성함수 조건에서 직접 합성곱과 수치 일치한다", () => {
    const input = makeDeterministicTensor(4 * 8 * 8, 301);
    const weights = makeDeterministicTensor(6 * 4 * 9, 302);
    const bias = makeDeterministicTensor(6, 303);
    for (const activation of ["none", "relu", "gelu"] as const) {
      const winograd = executeWinogradConv2d3x3({ input, inChannels: 4, height: 8, width: 8, weights, outChannels: 6, bias, padding: 1, activation });
      const reference = executeDirectConv2d3x3Reference({ input, inChannels: 4, height: 8, width: 8, weights, outChannels: 6, bias, padding: 1, activation });
      expect(winograd.totalTiles).toBe(16);
      for (let i = 0; i < reference.length; i += 1) {
        expect(Math.abs((winograd.output[i] ?? 0) - (reference[i] ?? 0))).toBeLessThan(1e-5);
      }
    }
  });

  it("22. Winograd F(2×2, 3×3) 가속기가 홀수 해상도(7×9) 및 padding=0 조건에서도 직접 합성곱과 일치한다", () => {
    const input = makeDeterministicTensor(3 * 7 * 9, 501);
    const weights = makeDeterministicTensor(5 * 3 * 9, 502);
    for (const padding of [1, 0] as const) {
      const winograd = executeWinogradConv2d3x3({ input, inChannels: 3, height: 7, width: 9, weights, outChannels: 5, padding });
      const reference = executeDirectConv2d3x3Reference({ input, inChannels: 3, height: 7, width: 9, weights, outChannels: 5, padding });
      for (let i = 0; i < reference.length; i += 1) {
        expect(Math.abs((winograd.output[i] ?? 0) - (reference[i] ?? 0))).toBeLessThan(1e-5);
      }
    }
  });

  it("23. 공간 희소 마스크 적용 시 비활성 2×2 타일을 스킵하며 마스크 직접 합성곱과 일치한다", () => {
    const input = makeDeterministicTensor(2 * 64, 701);
    const weights = makeDeterministicTensor(3 * 2 * 9, 702);
    const bias = new Float32Array([0.1, -0.2, 0.3]);
    const spatialMask = new Uint8Array(64);
    for (let y = 0; y < 4; y += 1) {
      for (let x = 0; x < 4; x += 1) spatialMask[y * 8 + x] = 1;
    }
    const winograd = executeWinogradConv2d3x3({ input, inChannels: 2, height: 8, width: 8, weights, outChannels: 3, bias, spatialMask });
    const reference = executeDirectConv2d3x3Reference({ input, inChannels: 2, height: 8, width: 8, weights, outChannels: 3, bias, spatialMask });
    expect(winograd.executedTiles).toBe(4);
    expect(winograd.skippedSparseTiles).toBe(12);
    expect(winograd.tileSparsityRatio).toBeCloseTo(0.75, 6);
    for (let i = 0; i < reference.length; i += 1) {
      expect(Math.abs((winograd.output[i] ?? 0) - (reference[i] ?? 0))).toBeLessThan(1e-5);
    }
  });

  it("24. 깊이별 분리 합성곱(Depthwise-Separable Conv2D)이 2단계 직접 기준 구현과 일치한다", () => {
    const input = makeDeterministicTensor(4 * 36, 901);
    const dwWeights = makeDeterministicTensor(4 * 9, 902);
    const dwBias = makeDeterministicTensor(4, 903);
    const pwWeights = makeDeterministicTensor(6 * 4, 904);
    const pwBias = makeDeterministicTensor(6, 905);
    const spatialMask = new Uint8Array(36).fill(1);
    spatialMask[28] = 0;
    spatialMask[29] = 0;
    spatialMask[34] = 0;
    spatialMask[35] = 0;

    const actual = executeDepthwiseSeparableConv2d({
      input,
      inChannels: 4,
      height: 6,
      width: 6,
      depthwiseWeights3x3: dwWeights,
      depthwiseBias: dwBias,
      pointwiseWeights1x1: pwWeights,
      outChannels: 6,
      pointwiseBias: pwBias,
      depthwiseActivation: "relu",
      pointwiseActivation: "gelu",
      spatialMask,
    });
    const dwRef = new Float32Array(4 * 36);
    for (let ch = 0; ch < 4; ch += 1) {
      dwRef.set(
        executeDirectConv2d3x3Reference({
          input: input.subarray(ch * 36, (ch + 1) * 36),
          inChannels: 1,
          height: 6,
          width: 6,
          weights: dwWeights.subarray(ch * 9, (ch + 1) * 9),
          outChannels: 1,
          bias: dwBias.subarray(ch, ch + 1),
          activation: "relu",
          spatialMask,
        }),
        ch * 36,
      );
    }
    expect(actual.skippedDepthwiseTiles).toBe(1);
    expect(actual.skippedPointwisePixels).toBe(4);
    for (let idx = 0; idx < 36; idx += 1) {
      for (let oc = 0; oc < 6; oc += 1) {
        if (spatialMask[idx] === 0) {
          expect(actual.output[oc * 36 + idx]).toBe(0);
          continue;
        }
        let sum = pwBias[oc] ?? 0;
        for (let ic = 0; ic < 4; ic += 1) sum += (dwRef[ic * 36 + idx] ?? 0) * (pwWeights[oc * 4 + ic] ?? 0);
        const expected = 0.5 * sum * (1 + Math.tanh(0.7978845608028654 * (sum + 0.044715 * sum * sum * sum)));
        expect(Math.abs((actual.output[oc * 36 + idx] ?? 0) - expected)).toBeLessThan(1e-5);
      }
    }
  });
});
