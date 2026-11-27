/**
 * Wave 65 멀티 벤더(Apple·NVIDIA·AMD·Intel·Arm·Qualcomm) 하드웨어 프로브 서술자 및
 * 결정론적 네이티브 브릿지 세션 협상기.
 *
 * Rust 크레이트(`crates/studio-native-gpu-npu-bridge/src/vendors.rs`)와 동일한 규칙으로
 * 최적 네이티브 업스케일러·저지연·NPU·Zero-Copy 조합을 협상하며, 브라우저 샌드박스에서는
 * 안전하게 WebGPU WGSL 경로로 폴백한다.
 */

import { IPC_FLAGS, computeCrc32Ieee, type GpuVendor } from "./native-bridge-ipc-protocol";

export type HostOs = "macos" | "windows" | "linux" | "android" | "ios" | "browser-sandbox";

export type AmdFsrCapability =
  | "none"
  | "fsr1"
  | "fsr2"
  | "fsr3"
  | "fsr4.1-int8-lite"
  | "fsr4.1-int8-full";

export type IntelXessCapability = "none" | "xess1" | "xess2-dp4a" | "xess2-xmx-fg";

export type GraphicsBackend = "metal3" | "directx12" | "vulkan13" | "webgpu-wgsl";

export type UpscalerKind =
  | "metalfx-temporal"
  | "metalfx-spatial"
  | "dlss4-transformer-mfg"
  | "dlss4-transformer-sr"
  | "dlss35-ray-reconstruction"
  | "fsr4.1-int8-full"
  | "fsr4.1-int8-lite"
  | "fsr3-frame-gen"
  | "fsr2-temporal"
  | "fsr1-spatial"
  | "xess2-xmx-fg"
  | "xess2-xmx-sr"
  | "xess2-dp4a"
  | "xess1"
  | "arm-nss"
  | "arm-asr"
  | "snapdragon-gsr2"
  | "webgpu-wgsl-bicubic-cas";

export type LowLatencyKind =
  | "apple-metal-direct-present"
  | "nvidia-reflex2-frame-warp"
  | "amd-radeon-anti-lag2"
  | "intel-xell"
  | "arm-frame-pacing"
  | "qualcomm-frame-pacing"
  | "webgpu-queue-pacing";

export type NpuBackend =
  | "apple-coreml-ane"
  | "nvidia-tensor-fp8-int4-ofa"
  | "nvidia-tensor-fp8-int4"
  | "amd-ryzen-ai-xdna2"
  | "amd-ryzen-ai-xdna1"
  | "intel-ai-boost-npu"
  | "arm-kleidiai-sme2"
  | "arm-ethos-u"
  | "qualcomm-hexagon-qnn-htp"
  | "webgpu-compute-fallback";

export type ZeroCopyTransport =
  | "apple-uma-iosurface"
  | "windows-dxgi-shared-handle"
  | "linux-dmabuf-fd"
  | "android-hardware-buffer"
  | "browser-arraybuffer-copy";

export interface HostHardwareProbe {
  readonly os: HostOs;
  readonly vendor: GpuVendor;
  readonly deviceName: string;
  readonly driverVersion: string;
  readonly vramMb: number;
  readonly unifiedMemory: boolean;
  readonly targetFps: number;
  readonly allowMultiFrameGen: boolean;
  readonly supportsMetal3?: boolean;
  readonly supportsMetalFxTemporal?: boolean;
  readonly supportsMetalFxSpatial?: boolean;
  readonly supportsAppleAne?: boolean;
  readonly supportsDlss4Transformer?: boolean;
  readonly supportsDlss35?: boolean;
  readonly supportsReflex2FrameWarp?: boolean;
  readonly supportsTensorFp8Int4?: boolean;
  readonly supportsNvidiaOfa?: boolean;
  readonly amdFsr?: AmdFsrCapability;
  readonly supportsAntiLag2?: boolean;
  readonly amdXdnaGeneration?: number;
  readonly intelXess?: IntelXessCapability;
  readonly supportsXeLl?: boolean;
  readonly supportsIntelAiBoost?: boolean;
  readonly supportsArmAsr?: boolean;
  readonly supportsArmNss?: boolean;
  readonly supportsArmEthosU?: boolean;
  readonly supportsArmKleidiAiSme2?: boolean;
  readonly supportsSnapdragonGsr2?: boolean;
  readonly supportsHexagonQnnHtp?: boolean;
}

export interface NativeBridgeSessionPlan {
  readonly vendor: GpuVendor;
  readonly os: HostOs;
  readonly graphicsBackend: GraphicsBackend;
  readonly upscaler: UpscalerKind;
  readonly lowLatency: LowLatencyKind;
  readonly npuBackend: NpuBackend;
  readonly transport: ZeroCopyTransport;
  readonly isNativeAccelerated: boolean;
  readonly zeroCopyEnabled: boolean;
  readonly frameBudgetUs: number;
  readonly recommendedFlags: number;
  readonly estimatedSpeedupX100: number;
  readonly fallbackReason: string | null;
  readonly sessionFingerprint: number;
}

const UPSCALER_SPEEDUP_X100: Readonly<Record<UpscalerKind, number>> = {
  "dlss4-transformer-mfg": 360,
  "dlss4-transformer-sr": 240,
  "dlss35-ray-reconstruction": 210,
  "fsr4.1-int8-full": 235,
  "fsr4.1-int8-lite": 205,
  "fsr3-frame-gen": 250,
  "fsr2-temporal": 185,
  "fsr1-spatial": 145,
  "metalfx-temporal": 220,
  "metalfx-spatial": 160,
  "xess2-xmx-fg": 260,
  "xess2-xmx-sr": 205,
  "xess2-dp4a": 175,
  xess1: 155,
  "arm-nss": 200,
  "arm-asr": 165,
  "snapdragon-gsr2": 180,
  "webgpu-wgsl-bicubic-cas": 115,
};

function defaultNativeBackend(os: HostOs): GraphicsBackend {
  if (os === "macos" || os === "ios") return "metal3";
  if (os === "windows") return "directx12";
  if (os === "linux" || os === "android") return "vulkan13";
  return "webgpu-wgsl";
}

function defaultNativeTransport(os: HostOs, unifiedMemory: boolean): ZeroCopyTransport {
  if (os === "macos" || os === "ios") {
    return unifiedMemory ? "apple-uma-iosurface" : "browser-arraybuffer-copy";
  }
  if (os === "windows") return "windows-dxgi-shared-handle";
  if (os === "linux") return "linux-dmabuf-fd";
  if (os === "android") return "android-hardware-buffer";
  return "browser-arraybuffer-copy";
}

function encodeAsciiBytes(text: string): Uint8Array {
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i += 1) {
    bytes[i] = text.charCodeAt(i) & 0xff;
  }
  return bytes;
}

/** 호스트 하드웨어 프로브 서술자를 Rust `parse_host_probe_descriptor` 호환 문자열로 직렬화한다. */
export function formatHostProbeDescriptor(probe: HostHardwareProbe): string {
  return [
    `os=${probe.os}`,
    `vendor=${probe.vendor}`,
    `device_name=${probe.deviceName}`,
    `driver_version=${probe.driverVersion}`,
    `vram_mb=${probe.vramMb}`,
    `unified_memory=${String(probe.unifiedMemory)}`,
    `target_fps=${probe.targetFps}`,
    `allow_multi_frame_gen=${String(probe.allowMultiFrameGen)}`,
    `metal3=${String(Boolean(probe.supportsMetal3))}`,
    `metalfx_temporal=${String(Boolean(probe.supportsMetalFxTemporal))}`,
    `metalfx_spatial=${String(Boolean(probe.supportsMetalFxSpatial))}`,
    `apple_ane=${String(Boolean(probe.supportsAppleAne))}`,
    `dlss4=${String(Boolean(probe.supportsDlss4Transformer))}`,
    `dlss35=${String(Boolean(probe.supportsDlss35))}`,
    `reflex2=${String(Boolean(probe.supportsReflex2FrameWarp))}`,
    `tensor_fp8_int4=${String(Boolean(probe.supportsTensorFp8Int4))}`,
    `nvidia_ofa=${String(Boolean(probe.supportsNvidiaOfa))}`,
    `amd_fsr=${probe.amdFsr ?? "none"}`,
    `anti_lag2=${String(Boolean(probe.supportsAntiLag2))}`,
    `amd_xdna=${probe.amdXdnaGeneration ?? 0}`,
    `intel_xess=${probe.intelXess ?? "none"}`,
    `xell=${String(Boolean(probe.supportsXeLl))}`,
    `intel_ai_boost=${String(Boolean(probe.supportsIntelAiBoost))}`,
    `arm_asr=${String(Boolean(probe.supportsArmAsr))}`,
    `arm_nss=${String(Boolean(probe.supportsArmNss))}`,
    `arm_ethos_u=${String(Boolean(probe.supportsArmEthosU))}`,
    `arm_kleidiai_sme2=${String(Boolean(probe.supportsArmKleidiAiSme2))}`,
    `snapdragon_gsr2=${String(Boolean(probe.supportsSnapdragonGsr2))}`,
    `hexagon_qnn_htp=${String(Boolean(probe.supportsHexagonQnnHtp))}`,
  ].join(";");
}

/** Rust `negotiate_native_bridge_session`과 동일한 규칙으로 6대 벤더·브라우저 폴백 세션을 협상한다. */
export function negotiateNativeBridgeSession(probe: HostHardwareProbe): NativeBridgeSessionPlan {
  if (!Number.isInteger(probe.targetFps) || probe.targetFps < 15 || probe.targetFps > 480) {
    throw new RangeError(`목표 FPS는 15..=480 범위여야 합니다(입력: ${probe.targetFps}).`);
  }
  const frameBudgetUs = Math.floor(1_000_000 / probe.targetFps);

  if (probe.os === "browser-sandbox" || probe.vendor === "webgpu-fallback") {
    const reason =
      probe.os === "browser-sandbox"
        ? "browser-sandbox-webgpu-fallback"
        : "vendor-unspecified-webgpu-fallback";
    const fingerprint = computeCrc32Ieee(
      encodeAsciiBytes(`webgpu-fallback|${probe.os}|webgpu-wgsl|${frameBudgetUs}`),
    );
    return {
      vendor: "webgpu-fallback",
      os: probe.os,
      graphicsBackend: "webgpu-wgsl",
      upscaler: "webgpu-wgsl-bicubic-cas",
      lowLatency: "webgpu-queue-pacing",
      npuBackend: "webgpu-compute-fallback",
      transport: "browser-arraybuffer-copy",
      isNativeAccelerated: false,
      zeroCopyEnabled: false,
      frameBudgetUs,
      recommendedFlags: IPC_FLAGS.FALLBACK_WEBGPU,
      estimatedSpeedupX100: UPSCALER_SPEEDUP_X100["webgpu-wgsl-bicubic-cas"],
      fallbackReason: reason,
      sessionFingerprint: fingerprint,
    };
  }

  let graphicsBackend: GraphicsBackend = defaultNativeBackend(probe.os);
  let upscaler: UpscalerKind = "webgpu-wgsl-bicubic-cas";
  let lowLatency: LowLatencyKind = "webgpu-queue-pacing";
  let npuBackend: NpuBackend = "webgpu-compute-fallback";
  let transport: ZeroCopyTransport = defaultNativeTransport(probe.os, probe.unifiedMemory);
  let fallbackReason: string | null = null;

  if (probe.vendor === "apple") {
    const canMetal3 = Boolean(probe.supportsMetal3) && (probe.os === "macos" || probe.os === "ios");
    graphicsBackend = canMetal3 ? "metal3" : "webgpu-wgsl";
    if (canMetal3) {
      upscaler = probe.supportsMetalFxTemporal
        ? "metalfx-temporal"
        : probe.supportsMetalFxSpatial
          ? "metalfx-spatial"
          : "webgpu-wgsl-bicubic-cas";
      lowLatency = "apple-metal-direct-present";
    } else {
      transport = "browser-arraybuffer-copy";
      fallbackReason = "apple-metal3-unavailable-webgpu-fallback";
    }
    npuBackend = probe.supportsAppleAne ? "apple-coreml-ane" : "webgpu-compute-fallback";
  } else if (probe.vendor === "nvidia") {
    if (probe.supportsDlss4Transformer) {
      upscaler = probe.allowMultiFrameGen ? "dlss4-transformer-mfg" : "dlss4-transformer-sr";
    } else if (probe.supportsDlss35) {
      upscaler = "dlss35-ray-reconstruction";
    }
    lowLatency = probe.supportsReflex2FrameWarp
      ? "nvidia-reflex2-frame-warp"
      : "webgpu-queue-pacing";
    if (probe.supportsTensorFp8Int4 && probe.supportsNvidiaOfa) {
      npuBackend = "nvidia-tensor-fp8-int4-ofa";
    } else if (probe.supportsTensorFp8Int4) {
      npuBackend = "nvidia-tensor-fp8-int4";
    }
  } else if (probe.vendor === "amd") {
    const fsr = probe.amdFsr ?? "none";
    if (fsr === "fsr4.1-int8-full") upscaler = "fsr4.1-int8-full";
    else if (fsr === "fsr4.1-int8-lite") upscaler = "fsr4.1-int8-lite";
    else if (fsr === "fsr3") upscaler = probe.allowMultiFrameGen ? "fsr3-frame-gen" : "fsr2-temporal";
    else if (fsr === "fsr2") upscaler = "fsr2-temporal";
    else if (fsr === "fsr1") upscaler = "fsr1-spatial";
    lowLatency = probe.supportsAntiLag2 ? "amd-radeon-anti-lag2" : "webgpu-queue-pacing";
    const xdna = probe.amdXdnaGeneration ?? 0;
    if (xdna >= 2) npuBackend = "amd-ryzen-ai-xdna2";
    else if (xdna === 1) npuBackend = "amd-ryzen-ai-xdna1";
  } else if (probe.vendor === "intel") {
    const xess = probe.intelXess ?? "none";
    if (xess === "xess2-xmx-fg") {
      upscaler = probe.allowMultiFrameGen ? "xess2-xmx-fg" : "xess2-xmx-sr";
    } else if (xess === "xess2-dp4a") {
      upscaler = "xess2-dp4a";
    } else if (xess === "xess1") {
      upscaler = "xess1";
    }
    lowLatency = probe.supportsXeLl ? "intel-xell" : "webgpu-queue-pacing";
    npuBackend = probe.supportsIntelAiBoost ? "intel-ai-boost-npu" : "webgpu-compute-fallback";
  } else if (probe.vendor === "arm") {
    upscaler = probe.supportsArmNss
      ? "arm-nss"
      : probe.supportsArmAsr
        ? "arm-asr"
        : "webgpu-wgsl-bicubic-cas";
    lowLatency = "arm-frame-pacing";
    npuBackend = probe.supportsArmKleidiAiSme2
      ? "arm-kleidiai-sme2"
      : probe.supportsArmEthosU
        ? "arm-ethos-u"
        : "webgpu-compute-fallback";
  } else if (probe.vendor === "qualcomm") {
    upscaler = probe.supportsSnapdragonGsr2 ? "snapdragon-gsr2" : "webgpu-wgsl-bicubic-cas";
    lowLatency = "qualcomm-frame-pacing";
    npuBackend = probe.supportsHexagonQnnHtp ? "qualcomm-hexagon-qnn-htp" : "webgpu-compute-fallback";
  }

  const isNativeAccelerated =
    graphicsBackend !== "webgpu-wgsl" &&
    (upscaler !== "webgpu-wgsl-bicubic-cas" || npuBackend !== "webgpu-compute-fallback");
  const zeroCopyEnabled = isNativeAccelerated && transport !== "browser-arraybuffer-copy";
  const usesMfg =
    upscaler === "dlss4-transformer-mfg" ||
    upscaler === "fsr3-frame-gen" ||
    upscaler === "xess2-xmx-fg";

  let recommendedFlags = 0;
  if (zeroCopyEnabled) recommendedFlags |= IPC_FLAGS.ZERO_COPY_SHM;
  if (lowLatency !== "webgpu-queue-pacing") recommendedFlags |= IPC_FLAGS.LOW_LATENCY_MARK;
  if (npuBackend !== "webgpu-compute-fallback") recommendedFlags |= IPC_FLAGS.NPU_ASSISTED;
  if (usesMfg) recommendedFlags |= IPC_FLAGS.MULTI_FRAME_GEN;
  if (!isNativeAccelerated) recommendedFlags |= IPC_FLAGS.FALLBACK_WEBGPU;

  const sessionFingerprint = computeCrc32Ieee(
    encodeAsciiBytes(
      `${probe.vendor}|${probe.os}|${graphicsBackend}|${upscaler}|${lowLatency}|${npuBackend}|${transport}|${frameBudgetUs}`,
    ),
  );

  return {
    vendor: probe.vendor,
    os: probe.os,
    graphicsBackend,
    upscaler,
    lowLatency,
    npuBackend,
    transport,
    isNativeAccelerated,
    zeroCopyEnabled,
    frameBudgetUs,
    recommendedFlags,
    estimatedSpeedupX100: UPSCALER_SPEEDUP_X100[upscaler],
    fallbackReason,
    sessionFingerprint,
  };
}
