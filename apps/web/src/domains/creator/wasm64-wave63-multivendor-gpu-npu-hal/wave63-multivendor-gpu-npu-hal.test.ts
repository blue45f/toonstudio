import { describe, expect, it } from "vitest";

import {
  FSR_EASU_WGSL,
  FSR_RCAS_WGSL,
  LOW_LATENCY_STACK_CATALOG,
  NPU_ACCELERATOR_CATALOG,
  RADIANCE_CASCADES_25D_WGSL,
  SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL,
  UPSCALER_CAPABILITY_CATALOG,
  buildCursorFoveatedVrsTileMap,
  compositeSplitResWithNativeLineart,
  detectHardwareAccelerationProfile,
  planHeterogeneousMultiAcceleratorFrame,
  selectOptimalUpscalerAndLatencyStack,
  sharpenFsrRcasRgba,
  solve25dRadianceCascadesLighting,
  upscaleBilinearRgba,
  upscaleFsrEasuRgba,
  type RgbaImageBuffer,
} from "./index";

function createRgbaBuffer(
  width: number,
  height: number,
  fill: (x: number, y: number) => readonly [number, number, number, number],
): RgbaImageBuffer {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const [r, g, b, a] = fill(x, y);
      const idx = (y * width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = a;
    }
  }
  return { width, height, data };
}

function createLightingScene(width: number, height: number, gray = 200) {
  const emissiveRgba = new Uint8ClampedArray(width * height * 4);
  const albedoRgba = new Uint8ClampedArray(width * height * 4);
  const occluderMask = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i += 1) {
    albedoRgba[i * 4] = gray;
    albedoRgba[i * 4 + 1] = gray;
    albedoRgba[i * 4 + 2] = gray;
    albedoRgba[i * 4 + 3] = 255;
  }
  const fillRect = (
    buf: Uint8ClampedArray,
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    rgba: readonly [number, number, number, number],
  ) => {
    for (let y = y0; y <= y1; y += 1) {
      for (let x = x0; x <= x1; x += 1) {
        const idx = (y * width + x) * 4;
        buf[idx] = rgba[0];
        buf[idx + 1] = rgba[1];
        buf[idx + 2] = rgba[2];
        buf[idx + 3] = rgba[3];
      }
    }
  };
  return { emissiveRgba, albedoRgba, occluderMask, fillRect };
}

function measureMeanEdgeGradient(image: RgbaImageBuffer): number {
  let sum = 0;
  let count = 0;
  const luma = (px: number, py: number) => {
    const i = (py * image.width + px) * 4;
    return 0.299 * image.data[i] + 0.587 * image.data[i + 1] + 0.114 * image.data[i + 2];
  };
  for (let y = 1; y < image.height - 1; y += 1) {
    for (let x = 1; x < image.width - 1; x += 1) {
      const mag = Math.hypot(luma(x + 1, y) - luma(x - 1, y), luma(x, y + 1) - luma(x, y - 1));
      if (mag > 8) {
        sum += mag;
        count += 1;
      }
    }
  }
  return count > 0 ? sum / count : 0;
}

function assertValidWgslComputeShader(source: string): void {
  expect(source).toContain("@compute");
  expect(source).toContain("@workgroup_size(");
  expect(source).toContain("@builtin(global_invocation_id)");
  expect(source).toContain("fn main");
  expect(source).toContain("@group(0) @binding(0)");
  let braceDepth = 0;
  let parenDepth = 0;
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === "{") braceDepth += 1;
    else if (ch === "}") braceDepth -= 1;
    else if (ch === "(") parenDepth += 1;
    else if (ch === ")") parenDepth -= 1;
    expect(braceDepth).toBeGreaterThanOrEqual(0);
    expect(parenDepth).toBeGreaterThanOrEqual(0);
  }
  expect(braceDepth).toBe(0);
  expect(parenDepth).toBe(0);
}

describe("Wave-63 Multi-Vendor GPU Upscaler & Heterogeneous NPU HAL", () => {
  it("전 제조사 업스케일러·저지연·NPU 카탈로그가 6대 하드웨어 벤더와 웹 표준을 모두 포함한다", () => {
    expect(Object.keys(UPSCALER_CAPABILITY_CATALOG)).toEqual(
      expect.arrayContaining([
        "dlss-4", "dlss-3.5", "fsr-4", "fsr-3", "fsr-2", "fsr-1",
        "xess-2", "xess-1", "arm-nss", "arm-asr", "qualcomm-gsr-2",
        "metalfx-temporal", "metalfx-spatial", "webgpu-fsr1-easu-rcas",
        "webnn-ml-sr", "wasm64-simd128-easu-rcas",
      ]),
    );
    expect(Object.keys(LOW_LATENCY_STACK_CATALOG)).toEqual(
      expect.arrayContaining(["reflex-2", "reflex", "anti-lag-2", "xell", "webgpu-low-latency-queue"]),
    );
    expect(Object.keys(NPU_ACCELERATOR_CATALOG)).toEqual(
      expect.arrayContaining([
        "amd-xdna2", "nvidia-tensor-fp8-int4", "nvidia-nvenc-ofa",
        "intel-ai-boost-npu", "arm-ethos-u", "arm-kleidiai-sme2",
        "qualcomm-hexagon-htp", "apple-ane-coreml", "apple-amx-unified-zero-copy",
        "webnn-npu", "wasm64-simd128",
      ]),
    );
  });

  it("NVIDIA RTX 50 (Blackwell + DX12/Vulkan 네이티브)에서 DLSS 4 + Reflex 2 + Tensor FP8/OFA를 선택한다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "desktop-tauri-native",
      adapterVendor: "NVIDIA",
      adapterArchitecture: "Blackwell",
      adapterDeviceName: "NVIDIA GeForce RTX 5090",
      nativeApisAvailable: ["dx12", "vulkan"],
      webgpu: { available: true, supportsSubgroups: true, supportsShaderF16: true, supportsDp4a: true },
      hardwareHints: { supportsFp8: true, supportsInt4: true, supportsOpticalFlowEngine: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile, { qualityPreset: "quality" });
    expect(profile.primaryVendor).toBe("nvidia");
    expect(selection.activeUpscaler).toBe("dlss-4");
    expect(selection.activeLatencyStack).toBe("reflex-2");
    expect(selection.activeLatencySpec.supportsFrameWarp).toBe(true);
    expect(selection.multiFrameGenerationActive).toBe(true);
    expect(selection.primaryAiAccelerator).toBe("nvidia-tensor-fp8-int4");
    expect(profile.executableAccelerators).toContain("nvidia-nvenc-ofa");
    expect(selection.fallbackChain[selection.fallbackChain.length - 1]).toBe("wasm64-simd128-easu-rcas");
  });

  it("NVIDIA RTX 40 (Ada Lovelace 네이티브)에서는 DLSS 3.5 + Reflex를 선택한다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "native-dx12",
      adapterVendor: "NVIDIA",
      adapterArchitecture: "Ada",
      adapterDeviceName: "NVIDIA GeForce RTX 4080 Super",
      webgpu: { available: true, supportsShaderF16: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile);
    expect(selection.activeUpscaler).toBe("dlss-3.5");
    expect(selection.activeLatencyStack).toBe("reflex");
    expect(selection.activeUpscalerSpec.supportsRayReconstruction).toBe(true);
    expect(selection.multiFrameGenerationActive).toBe(false);
  });

  it("AMD RDNA 4 + Ryzen AI XDNA 2 NPU (네이티브)에서 FSR 4 + Anti-Lag 2 + XDNA 2를 선택한다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "desktop-tauri-native",
      adapterVendor: "AMD",
      adapterArchitecture: "RDNA 4",
      adapterDeviceName: "AMD Radeon RX 9070 XT",
      secondaryIgpuDeviceName: "AMD Radeon 890M",
      npuDeviceName: "AMD Ryzen AI XDNA 2 NPU",
      nativeApisAvailable: ["dx12", "vulkan"],
      webgpu: { available: true, supportsSubgroups: true, supportsShaderF16: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile);
    expect(profile.architectureTier).toBe("rdna4");
    expect(selection.activeUpscaler).toBe("fsr-4");
    expect(selection.activeLatencyStack).toBe("anti-lag-2");
    expect(selection.primaryAiAccelerator).toBe("amd-xdna2");
    expect(selection.frameGenerationActive).toBe(true);
  });

  it("AMD RDNA 3 (FP8 미지원 네이티브)에서는 FSR 3 + Anti-Lag 2로 내려간다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "native-vulkan",
      adapterVendor: "AMD",
      adapterArchitecture: "RDNA 3",
      adapterDeviceName: "AMD Radeon RX 7900 XTX",
      npuDeviceName: "AMD Ryzen AI XDNA",
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile);
    expect(selection.activeUpscaler).toBe("fsr-3");
    expect(selection.activeLatencyStack).toBe("anti-lag-2");
    expect(selection.primaryAiAccelerator).toBe("amd-xdna");
  });

  it("Intel Arc Battlemage + Intel AI Boost NPU (네이티브)에서 XeSS 2 + XeLL + AI Boost NPU를 선택한다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "desktop-tauri-native",
      adapterVendor: "Intel",
      adapterArchitecture: "Battlemage",
      adapterDeviceName: "Intel Arc B580",
      npuDeviceName: "Intel AI Boost NPU",
      nativeApisAvailable: ["dx12", "vulkan"],
      webgpu: { available: true, supportsDp4a: true, supportsShaderF16: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile);
    expect(selection.activeUpscaler).toBe("xess-2");
    expect(selection.activeLatencyStack).toBe("xell");
    expect(selection.primaryAiAccelerator).toBe("intel-ai-boost-npu");
    expect(selection.frameGenerationActive).toBe(true);
  });

  it("Apple M4 Max + Metal 3 네이티브에서 MetalFX Temporal + ANE + AMX 제로카피를 선택한다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "native-metal",
      adapterVendor: "Apple",
      adapterArchitecture: "apple-m4",
      adapterDeviceName: "Apple M4 Max",
      webgpu: { available: true, supportsSubgroups: true, supportsShaderF16: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile);
    expect(profile.zeroCopyUnifiedMemory).toBe(true);
    expect(selection.activeUpscaler).toBe("metalfx-temporal");
    expect(selection.activeLatencyStack).toBe("metal-low-latency-drawable");
    expect(selection.primaryAiAccelerator).toBe("apple-ane-coreml");
    expect(profile.executableAccelerators).toContain("apple-amx-unified-zero-copy");
  });

  it("Arm Immortalis + Ethos-U / KleidiAI SME2에서 Arm NSS와 Arm ASR을 정확히 구분 선택한다", () => {
    const nssProfile = detectHardwareAccelerationProfile({
      hostEnvironment: "mobile-native-vulkan",
      adapterVendor: "ARM",
      adapterDeviceName: "Arm Immortalis-G925",
      npuDeviceName: "Arm Ethos-U85 NPU",
      hardwareHints: { supportsArmNeuralGraphics: true, supportsArmSme2: true },
    });
    const nssSelection = selectOptimalUpscalerAndLatencyStack(nssProfile);
    expect(nssSelection.activeUpscaler).toBe("arm-nss");
    expect(nssSelection.primaryAiAccelerator).toBe("arm-ethos-u");
    expect(nssProfile.executableAccelerators).toContain("arm-kleidiai-sme2");

    const asrProfile = detectHardwareAccelerationProfile({
      hostEnvironment: "mobile-native-vulkan",
      adapterVendor: "ARM",
      adapterDeviceName: "Arm Mali-G720",
      hardwareHints: { supportsArmNeuralGraphics: false, supportsArmSme2: true },
    });
    expect(selectOptimalUpscalerAndLatencyStack(asrProfile).activeUpscaler).toBe("arm-asr");
  });

  it("Qualcomm Snapdragon Adreno + Hexagon HTP에서 GSR 2 + Hexagon NPU를 선택한다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "mobile-native-vulkan",
      adapterVendor: "Qualcomm",
      adapterDeviceName: "Qualcomm Adreno 830 Snapdragon 8 Elite",
      npuDeviceName: "Qualcomm Hexagon NPU HTP",
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile);
    expect(selection.activeUpscaler).toBe("qualcomm-gsr-2");
    expect(selection.primaryAiAccelerator).toBe("qualcomm-hexagon-htp");
  });

  it("웹 브라우저 환경에서는 RTX 5090에서도 네이티브 전용 SDK를 차단하고 WebGPU WGSL FSR + WebNN으로 정직하게 폴백한다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "browser-web",
      adapterVendor: "NVIDIA",
      adapterArchitecture: "Blackwell",
      adapterDeviceName: "NVIDIA GeForce RTX 5090",
      nativeApisAvailable: ["dx12", "vulkan"],
      webgpu: { available: true, supportsSubgroups: true, supportsShaderF16: true, supportsDp4a: true },
      webnn: { available: true, deviceTypes: ["npu", "gpu", "cpu"] },
      wasm: { memory64: true, simd128: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile);
    expect(profile.isBrowserSandboxed).toBe(true);
    expect(profile.nativeApisAvailable).toEqual([]);
    expect(profile.nativeOnlyHardwareBlockedByBrowser).toContain("nvidia-tensor-fp8-int4");
    expect(selection.activeUpscaler).toBe("webgpu-fsr1-easu-rcas");
    expect(selection.activeUpscalerSpec.browserExecutable).toBe(true);
    expect(selection.activeLatencyStack).toBe("webgpu-low-latency-queue");
    expect(selection.primaryAiAccelerator).toBe("webnn-npu");
    expect(selection.nativeBridgeUpgradePath).toBe("dlss-4");
    expect(
      selection.rejectedNativeCandidates.some(
        (c) => c.id === "dlss-4" && c.reason === "requires-native-bridge-dx12-vulkan-metal",
      ),
    ).toBe(true);
  });

  it("웹 브라우저에서 WebGPU 미지원 시 WebNN → WASM64 SIMD128 순으로 결정론적 폴백한다", () => {
    const webnnProfile = detectHardwareAccelerationProfile({
      hostEnvironment: "browser-web",
      adapterVendor: "Apple",
      adapterDeviceName: "Apple M4",
      webgpu: { available: false },
      webnn: { available: true, deviceTypes: ["gpu", "cpu"] },
    });
    expect(selectOptimalUpscalerAndLatencyStack(webnnProfile).activeUpscaler).toBe("webnn-ml-sr");

    const wasmProfile = detectHardwareAccelerationProfile({
      hostEnvironment: "browser-web",
      adapterVendor: "Software",
      webgpu: { available: false },
      webnn: { available: false },
    });
    const wasmSel = selectOptimalUpscalerAndLatencyStack(wasmProfile);
    expect(wasmSel.activeUpscaler).toBe("wasm64-simd128-easu-rcas");
    expect(wasmSel.primaryAiAccelerator).toBe("wasm64-simd128");
  });

  it("단일 프레임 이종 다중 가속기 DAG가 dGPU+iGPU+NPU+OFA+CPU 5개 레인으로 병렬 분할해 120Hz 예산을 맞춘다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "desktop-tauri-native",
      adapterVendor: "NVIDIA",
      adapterArchitecture: "Blackwell",
      adapterDeviceName: "NVIDIA GeForce RTX 5080",
      secondaryIgpuDeviceName: "AMD Radeon 890M",
      npuDeviceName: "AMD Ryzen AI XDNA 2 NPU",
      nativeApisAvailable: ["dx12", "vulkan"],
      webgpu: { available: true, supportsSubgroups: true, supportsShaderF16: true },
      hardwareHints: { unifiedMemory: false, supportsOpticalFlowEngine: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile, { qualityPreset: "balanced" });
    const plan = planHeterogeneousMultiAcceleratorFrame(profile, selection, {
      targetFrameBudgetMs: 8.33,
      canvasWidthPx: 2560,
      canvasHeightPx: 1440,
      enableRadianceCascades: true,
      enableSemanticNpuPass: true,
      enableOpticalFlowPass: true,
      enableSplitResNativeLineart: true,
    });

    expect(new Set(plan.nodes.map((n) => n.lane))).toEqual(
      new Set(["cpu-simd", "dgpu", "igpu", "npu", "optical-flow"]),
    );
    expect(plan.parallelSpeedupRatio).toBeGreaterThan(1.3);
    expect(plan.fitsFrameBudget).toBe(true);

    const nodeMap = new Map(plan.nodes.map((n) => [n.id, n]));
    for (const node of plan.nodes) {
      for (const depId of node.dependsOn) {
        const dep = nodeMap.get(depId);
        expect(dep).toBeDefined();
        if (dep) expect(node.startMs).toBeGreaterThanOrEqual(dep.endMs);
      }
    }
  });

  it("Apple Silicon 통합 메모리는 이종 레인 간 전송 오버헤드 0ms(Zero-Copy)로 스케줄링된다", () => {
    const profile = detectHardwareAccelerationProfile({
      hostEnvironment: "native-metal",
      adapterVendor: "Apple",
      adapterArchitecture: "apple-m4",
      adapterDeviceName: "Apple M4 Max",
      webgpu: { available: true, supportsShaderF16: true },
    });
    const selection = selectOptimalUpscalerAndLatencyStack(profile, { qualityPreset: "quality" });
    const plan = planHeterogeneousMultiAcceleratorFrame(profile, selection, {
      targetFrameBudgetMs: 8.33,
      canvasWidthPx: 2560,
      canvasHeightPx: 1440,
      enableRadianceCascades: true,
      enableSemanticNpuPass: true,
      enableOpticalFlowPass: false,
      enableSplitResNativeLineart: true,
    });
    expect(plan.memoryTransferOverheadMs).toBe(0);
    expect(plan.zeroCopyTransferCount).toBeGreaterThanOrEqual(3);
    expect(plan.fitsFrameBudget).toBe(true);
  });
});

describe("Wave-63 WebGPU WGSL Shaders & FSR EASU/RCAS Split-Resolution Pipeline", () => {
  it("4종의 WebGPU WGSL 컴퓨트 셰이더(EASU·RCAS·SplitRes·RadianceCascades)가 유효한 문법 계약을 만족한다", () => {
    assertValidWgslComputeShader(FSR_EASU_WGSL);
    assertValidWgslComputeShader(FSR_RCAS_WGSL);
    assertValidWgslComputeShader(SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL);
    assertValidWgslComputeShader(RADIANCE_CASCADES_25D_WGSL);
    expect(FSR_EASU_WGSL).toContain("easuAccumulateDir");
    expect(FSR_RCAS_WGSL).toContain("-0.1875");
    expect(SPLIT_RES_NATIVE_LINEART_COMPOSITE_WGSL).toContain("nativeLineartTex");
    expect(RADIANCE_CASCADES_25D_WGSL).toContain("upperCascadeBins");
  });

  it("FSR EASU 12-tap 방향성 업스케일이 대각선 에지에서 바이리니어보다 선명하고 오버슈트를 차단한다", () => {
    const src = createRgbaBuffer(24, 24, (x, y) =>
      x + y >= 24 ? [230, 220, 210, 255] : [20, 28, 42, 255],
    );
    const easu = upscaleFsrEasuRgba(src, 48, 48);
    const bilinear = upscaleBilinearRgba(src, 48, 48);

    expect(easu.tapCountPerPixel).toBe(12);
    expect(measureMeanEdgeGradient(easu.image)).toBeGreaterThan(measureMeanEdgeGradient(bilinear));
    for (let i = 0; i < easu.image.data.length; i += 4) {
      expect(easu.image.data[i]).toBeGreaterThanOrEqual(20);
      expect(easu.image.data[i]).toBeLessThanOrEqual(230);
    }
  });

  it("FSR EASU가 평탄한 단색 영역을 오차 없이 보존한다", () => {
    const flat = createRgbaBuffer(12, 12, () => [124, 168, 92, 255]);
    const upscaled = upscaleFsrEasuRgba(flat, 24, 24);
    for (let i = 0; i < upscaled.image.data.length; i += 4) {
      expect(upscaled.image.data[i]).toBe(124);
      expect(upscaled.image.data[i + 1]).toBe(168);
      expect(upscaled.image.data[i + 2]).toBe(92);
      expect(upscaled.image.data[i + 3]).toBe(255);
    }
  });

  it("FSR RCAS 5-tap 샤프닝이 중대비 디테일을 선명화하면서 고대비 계단 경계의 할로·링잉을 0으로 차단한다", () => {
    const img = createRgbaBuffer(24, 24, (x) => {
      if (x < 6) return [80, 80, 80, 255];
      if (x === 6) return [105, 105, 105, 255];
      if (x === 7) return [155, 155, 155, 255];
      if (x < 14) return [180, 180, 180, 255];
      return x < 18 ? [0, 0, 0, 255] : [255, 255, 255, 255];
    });
    const rcas = sharpenFsrRcasRgba(img, { sharpness: 0.9, denoise: false });
    expect(rcas.tapCountPerPixel).toBe(5);
    expect(rcas.maxChannelOvershoot).toBe(0);

    const midY = 12;
    const beforeDiff = img.data[(midY * 24 + 7) * 4] - img.data[(midY * 24 + 6) * 4];
    const afterDiff = rcas.image.data[(midY * 24 + 7) * 4] - rcas.image.data[(midY * 24 + 6) * 4];
    expect(afterDiff).toBeGreaterThan(beforeDiff);
    expect(rcas.image.data[(midY * 24 + 17) * 4]).toBe(0);
    expect(rcas.image.data[(midY * 24 + 18) * 4]).toBe(255);
  });

  it("FSR RCAS denoise 모드가 저대비 체커보드 노이즈 증폭을 억제한다", () => {
    const noisy = createRgbaBuffer(16, 16, (x, y) => {
      const n = (x + y) % 2 === 0 ? 124 : 132;
      return [n, n, n, 255];
    });
    const withDenoise = sharpenFsrRcasRgba(noisy, { sharpness: 1.0, denoise: true });
    const withoutDenoise = sharpenFsrRcasRgba(noisy, { sharpness: 1.0, denoise: false });
    const variance = (buf: RgbaImageBuffer): number => {
      let acc = 0;
      for (let i = 0; i < buf.data.length; i += 4) acc += (buf.data[i] - 128) ** 2;
      return acc / (buf.width * buf.height);
    };
    expect(variance(withDenoise.image)).toBeLessThanOrEqual(variance(withoutDenoise.image));
  });

  it("이중 해상도(Split-Res) 합성이 50% 채색 버퍼 위에서 100% 네이티브 2D 선화를 비트 단위 무손실 보존한다", () => {
    const lowResPaint = createRgbaBuffer(20, 20, (x, y) => [
      Math.round((x / 19) * 200 + 30),
      Math.round((y / 19) * 180 + 40),
      190,
      255,
    ]);
    const nativeLineart = createRgbaBuffer(40, 40, (x, y) => {
      if (x === y) return [18, 16, 22, 255];
      if (Math.abs(x - y) === 1) return [18, 16, 22, 128];
      return [0, 0, 0, 0];
    });
    const result = compositeSplitResWithNativeLineart({
      lowResPaint,
      nativeLineart,
      enableRcas: true,
    });

    expect(result.paintPixelReductionRatio).toBe(0.75);
    expect(result.opaqueLineartExactMatchRatio).toBe(1);
    for (let k = 0; k < 40; k += 1) {
      const idx = (k * 40 + k) * 4;
      expect([result.output.data[idx], result.output.data[idx + 1], result.output.data[idx + 2], result.output.data[idx + 3]]).toEqual([18, 16, 22, 255]);
    }
    const bgIdx = (5 * 40 + 30) * 4;
    expect(result.output.data[bgIdx]).toBe(result.upscaledPaint.data[bgIdx]);
    const aaIdx = (10 * 40 + 11) * 4;
    expect(result.output.data[aaIdx]).toBeGreaterThan(18);
    expect(result.output.data[aaIdx]).toBeLessThan(result.upscaledPaint.data[aaIdx]);
  });
});

describe("Wave-63 Cursor-Foveated VRS & 2.5D Radiance Cascades GI", () => {
  it("펜촉 중심 Foveated VRS가 1x1/2x2/4x4 3단계 타일을 생성하고 1080p에서 60%+ 연산량을 절감한다", () => {
    const vrs = buildCursorFoveatedVrsTileMap({
      canvasWidthPx: 1920,
      canvasHeightPx: 1080,
      cursorX: 960,
      cursorY: 540,
      tileSizePx: 16,
      innerFullResRadiusPx: 160,
      midResRadiusPx: 360,
    });
    expect(vrs.totalTiles).toBe(120 * 68);
    expect(vrs.fullRateTileCount).toBeGreaterThan(0);
    expect(vrs.halfRateTileCount).toBeGreaterThan(0);
    expect(vrs.quarterRateTileCount).toBeGreaterThan(vrs.fullRateTileCount);
    expect(vrs.shadingWorkReductionRatio).toBeGreaterThanOrEqual(0.6);
    expect(vrs.estimatedSpeedupFactor).toBeGreaterThan(2.5);
    expect(vrs.tileRateGrid[Math.floor(540 / 16) * vrs.tilesX + Math.floor(960 / 16)]).toBe(0);
    expect(vrs.tileRateGrid[0]).toBe(2);
  });

  it("스타일러스 이동 속도 벡터가 주어지면 Foveated VRS가 획 방향으로 1x1 포비얼 영역을 선행 확장한다", () => {
    const stationary = buildCursorFoveatedVrsTileMap({
      canvasWidthPx: 1024,
      canvasHeightPx: 1024,
      cursorX: 300,
      cursorY: 512,
      innerFullResRadiusPx: 96,
      midResRadiusPx: 220,
    });
    const fastRight = buildCursorFoveatedVrsTileMap({
      canvasWidthPx: 1024,
      canvasHeightPx: 1024,
      cursorX: 300,
      cursorY: 512,
      innerFullResRadiusPx: 96,
      midResRadiusPx: 220,
      stylusVelocityX: 6000,
      stylusVelocityY: 0,
      predictionLeadMs: 25,
    });
    const aheadTileIdx = Math.floor(512 / 16) * fastRight.tilesX + Math.floor(460 / 16);
    expect(stationary.tileRateGrid[aheadTileIdx]).toBe(1);
    expect(fastRight.tileRateGrid[aheadTileIdx]).toBe(0);
  });

  it("2.5D Radiance Cascades가 발광원으로부터의 거리에 따라 조도가 단조 감쇠함을 보장한다", () => {
    const { emissiveRgba, albedoRgba, occluderMask, fillRect } = createLightingScene(32, 24);
    fillRect(emissiveRgba, 2, 9, 4, 15, [255, 245, 220, 255]);
    const result = solve25dRadianceCascadesLighting({
      width: 32,
      height: 24,
      emissiveRgba,
      albedoRgba,
      occluderMask,
      cascadeCount: 3,
      baseAngularRays: 12,
    });
    const irrAt = (x: number, y: number) => result.irradianceRgb[(y * 32 + x) * 3];
    expect(result.cascadeLevels).toHaveLength(3);
    expect(irrAt(7, 12)).toBeGreaterThan(irrAt(15, 12));
    expect(irrAt(15, 12)).toBeGreaterThan(irrAt(26, 12));
    expect(irrAt(26, 12)).toBeGreaterThan(0);
  });

  it("2.5D Radiance Cascades가 불투명 벽면 뒤쪽에서 물리적 그림자 차폐(Shadow Occlusion)를 형성한다", () => {
    const { emissiveRgba, albedoRgba, occluderMask, fillRect } = createLightingScene(32, 32, 190);
    fillRect(emissiveRgba, 14, 14, 17, 17, [255, 255, 255, 255]);
    for (let y = 4; y <= 27; y += 1) {
      occluderMask[y * 32 + 20] = 255;
      occluderMask[y * 32 + 21] = 255;
    }
    const result = solve25dRadianceCascadesLighting({
      width: 32,
      height: 32,
      emissiveRgba,
      albedoRgba,
      occluderMask,
      cascadeCount: 3,
      baseAngularRays: 16,
      bounceReflectance: 0.2,
    });
    const openSide = result.irradianceRgb[(15 * 32 + 8) * 3];
    const shadowedSide = result.irradianceRgb[(15 * 32 + 24) * 3];
    expect(result.occludedRayFraction).toBeGreaterThan(0);
    expect(openSide).toBeGreaterThan(shadowedSide * 4);
  });

  it("2.5D Radiance Cascades가 붉은 벽면의 2차 반사광(Color Bleeding)을 인접 무채색 캐릭터로 전파한다", () => {
    const { emissiveRgba, albedoRgba, occluderMask, fillRect } = createLightingScene(28, 28, 36);
    fillRect(emissiveRgba, 6, 10, 9, 17, [255, 255, 255, 255]);
    fillRect(albedoRgba, 10, 6, 15, 21, [255, 10, 10, 255]);
    fillRect(albedoRgba, 17, 12, 20, 16, [190, 190, 190, 255]);
    const result = solve25dRadianceCascadesLighting({
      width: 28,
      height: 28,
      emissiveRgba,
      albedoRgba,
      occluderMask,
      cascadeCount: 3,
      baseAngularRays: 12,
      bounceReflectance: 0.85,
    });
    const charIdx = (14 * 28 + 18) * 3;
    expect(result.bounceContributionRgb[charIdx]).toBeGreaterThan(
      result.bounceContributionRgb[charIdx + 1] * 2.0,
    );
    expect(result.bounceContributionRgb[charIdx]).toBeGreaterThan(
      result.bounceContributionRgb[charIdx + 2] * 2.0,
    );
    const rgbaIdx = (14 * 28 + 18) * 4;
    expect(result.litRgba[rgbaIdx]).toBeGreaterThan(result.litRgba[rgbaIdx + 1]);
  });

  it("2.5D 높이 맵이 낮은 턱 위로 고도 광원을 통과시키고 높은 벽은 차단한다", () => {
    const { emissiveRgba, albedoRgba, occluderMask, fillRect } = createLightingScene(24, 24);
    fillRect(emissiveRgba, 3, 9, 5, 14, [255, 240, 200, 255]);
    const lowHeight = new Float32Array(24 * 24);
    const tallHeight = new Float32Array(24 * 24);
    for (let y = 3; y <= 20; y += 1) {
      occluderMask[y * 24 + 10] = 255;
      occluderMask[y * 24 + 11] = 255;
      lowHeight[y * 24 + 10] = 0.2;
      lowHeight[y * 24 + 11] = 0.2;
      tallHeight[y * 24 + 10] = 0.95;
      tallHeight[y * 24 + 11] = 0.95;
    }
    const overLow = solve25dRadianceCascadesLighting({
      width: 24,
      height: 24,
      emissiveRgba,
      albedoRgba,
      occluderMask,
      heightMap: lowHeight,
      emitterElevation: 0.7,
      cascadeCount: 3,
      baseAngularRays: 12,
    });
    const behindTall = solve25dRadianceCascadesLighting({
      width: 24,
      height: 24,
      emissiveRgba,
      albedoRgba,
      occluderMask,
      heightMap: tallHeight,
      emitterElevation: 0.7,
      cascadeCount: 3,
      baseAngularRays: 12,
    });
    const probeIdx = (12 * 24 + 16) * 3;
    expect(overLow.irradianceRgb[probeIdx]).toBeGreaterThan(behindTall.irradianceRgb[probeIdx] * 3);
  });

  it("동일 입력에 대해 Radiance Cascades 결과가 비트 단위로 100% 결정론적이다", () => {
    const { emissiveRgba, albedoRgba, occluderMask, fillRect } = createLightingScene(16, 16, 180);
    fillRect(emissiveRgba, 4, 7, 5, 9, [80, 230, 255, 255]);
    const runA = solve25dRadianceCascadesLighting({
      width: 16,
      height: 16,
      emissiveRgba,
      albedoRgba,
      occluderMask,
    });
    const runB = solve25dRadianceCascadesLighting({
      width: 16,
      height: 16,
      emissiveRgba,
      albedoRgba,
      occluderMask,
    });
    expect(Array.from(runA.litRgba)).toEqual(Array.from(runB.litRgba));
    expect(Array.from(runA.irradianceRgb)).toEqual(Array.from(runB.irradianceRgb));
  });
});
