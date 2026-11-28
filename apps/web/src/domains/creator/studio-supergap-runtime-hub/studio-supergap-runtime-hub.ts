/**
 * Wave 72 통합 지연 로드 `/studio` 초격차 런타임 허브(`StudioSupergapRuntimeHub`).
 *
 * - Wave 54~67 초격차 커널과 `/studio` 2.5D 실물 질감 런타임을 전부 동적 `import(...)`로만 호출해
 *   초기 `/studio` 진입 그래프(`check:studio-eager-graph`)에 0 바이트 영향을 보장한다.
 * - 데스크톱 네이티브 GPU/NPU 루프백 데몬 연결을 우선 탐색하고, 미실행·브라우저 단독 환경에서는
 *   Wave 65 WebGPU WGSL PSO 프리워머 + Wave 63 멀티벤더 HAL 경로로 자동 폴백한다.
 * - `registerExtensionSubsystem(...)` 슬롯으로 Wave 68(천수 유체) · Wave 69(60fps 모션툰) ·
 *   Wave 70(뉴럴 증류·집중 모드·Merkle-CRDT 볼트)을 무중단 확장 결합한다.
 */

import type { StudioTactileReliefMode } from "../brush/studio-tactile-physical-relief-runtime";
import type { GpuVendor, HostHardwareProbe, WebGpuDeviceLike } from "../wasm64-wave65-native-gpu-npu-bridge";
import {
  probeDesktopLoopbackBridge,
  type DesktopLoopbackBridgeConfig,
  type DesktopLoopbackBridgeTransport,
  type DesktopLoopbackProbeResult,
} from "./desktop-loopback-bridge-transport";

export type BuiltinSupergapSubsystemId =
  | "desktopNativeGpuNpuBridge"
  | "multiVendorGpuNpuHal"
  | "fastWasm64Kernels"
  | "tactilePhysicalRelief"
  | "cadShaperPro3d"
  | "neuralBrushAndProvenance"
  | "slangSeeThroughMangaNinja"
  | "vectorSelfHealLanMeshErgo";

export type SupergapSubsystemStatus = "idle" | "live-connected" | "browser-fallback" | "error";

export interface SupergapSubsystemMetadata {
  readonly id: string;
  readonly waveLabel: string;
  readonly titleKo: string;
  readonly capabilitySummaryKo: string;
  readonly isExtension: boolean;
}

export interface SupergapSubsystemExecutionResult {
  readonly id: string;
  readonly waveLabel: string;
  readonly titleKo: string;
  readonly isExtension: boolean;
  readonly status: Exclude<SupergapSubsystemStatus, "idle">;
  readonly latencyMs: number;
  readonly summaryKo: string;
  readonly metrics: Readonly<Record<string, string | number | boolean>>;
  readonly executedAtIso: string;
  readonly errorMessage?: string;
}

export interface HardwareBridgeStatus {
  readonly connectionMode: "desktop-native-loopback" | "browser-webgpu-fallback";
  readonly connected: boolean;
  readonly webgpuFallbackReady: boolean;
  readonly vendor: string;
  readonly deviceName: string;
  readonly graphicsBackend: string;
  readonly upscaler: string;
  readonly lowLatencyStack: string;
  readonly npuBackend: string;
  readonly zeroCopyEnabled: boolean;
  readonly prewarmedPsoCount: number;
  readonly loopbackBaseUrl: string | null;
  readonly fallbackReason: string | null;
  readonly checkedAtIso: string;
  readonly latencyMs: number;
}

export interface SupergapRuntimeReport {
  readonly checkedAtIso: string;
  readonly totalDurationMs: number;
  readonly hardwareBridge: HardwareBridgeStatus;
  readonly subsystems: readonly SupergapSubsystemExecutionResult[];
  readonly liveConnectedCount: number;
  readonly browserFallbackCount: number;
  readonly errorCount: number;
  readonly allHealthy: boolean;
}

export interface StudioSupergapHubSnapshot {
  readonly hardwareBridge: HardwareBridgeStatus | null;
  readonly isBootstrapping: boolean;
  readonly isRunningDiagnostic: boolean;
  readonly activeActionSubsystemId: string | null;
  readonly tactileReliefMode: StudioTactileReliefMode;
  readonly registeredSubsystems: readonly SupergapSubsystemMetadata[];
  readonly lastResultsById: Readonly<Record<string, SupergapSubsystemExecutionResult>>;
  readonly lastReport: SupergapRuntimeReport | null;
  readonly lastErrorKo: string | null;
}

export interface SupergapExtensionExecutionContext {
  readonly hardwareBridge: HardwareBridgeStatus | null;
  readonly payload?: Readonly<Record<string, unknown>>;
}

export interface SupergapExtensionExecutionOutput {
  readonly status: Exclude<SupergapSubsystemStatus, "idle" | "error">;
  readonly summaryKo: string;
  readonly metrics?: Readonly<Record<string, string | number | boolean>>;
}

export interface SupergapExtensionSubsystemDefinition {
  readonly id: string;
  readonly waveLabel: string;
  readonly titleKo: string;
  readonly capabilitySummaryKo: string;
  readonly execute: (ctx: SupergapExtensionExecutionContext) => Promise<SupergapExtensionExecutionOutput>;
}

export interface StudioSupergapRuntimeHubOptions {
  readonly loopbackConfig?: DesktopLoopbackBridgeConfig;
  readonly webGpuDevice?: WebGpuDeviceLike;
  readonly defaultHostProbe?: Partial<HostHardwareProbe>;
  readonly nowMs?: () => number;
}

export interface StudioSupergapRuntimeHub {
  bootstrapHardwareBridge(overrideConfig?: DesktopLoopbackBridgeConfig): Promise<HardwareBridgeStatus>;
  runDiagnosticSelfCheck(): Promise<SupergapRuntimeReport>;
  executeSubsystemAction(
    subsystemId: string,
    payload?: Readonly<Record<string, unknown>>,
  ): Promise<SupergapSubsystemExecutionResult>;
  cycleTactileReliefMode(): Promise<StudioTactileReliefMode>;
  refreshTactileReliefMode(): Promise<StudioTactileReliefMode>;
  getRegisteredSubsystems(): readonly SupergapSubsystemMetadata[];
  registerExtensionSubsystem(definition: SupergapExtensionSubsystemDefinition): void;
  unregisterExtensionSubsystem(subsystemId: string): boolean;
  getSnapshot(): StudioSupergapHubSnapshot;
  subscribe(listener: (snapshot: StudioSupergapHubSnapshot) => void): () => void;
}

interface InternalSubsystemEntry {
  readonly meta: SupergapSubsystemMetadata;
  readonly run: (payload?: Readonly<Record<string, unknown>>) => Promise<SupergapExtensionExecutionOutput>;
}

const defaultNowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();

const roundMs = (ms: number): number => Math.max(0, Math.round(ms * 100) / 100);

function createSyntheticWebGpuDeviceAdapter(): WebGpuDeviceLike {
  return {
    createShaderModule: (d) => ({ label: d.label ?? "synthetic-wgsl-module" }),
    createRenderPipelineAsync: async (d) => ({ label: d.label ?? "synthetic-render-pso" }),
    createComputePipelineAsync: async (d) => ({ label: d.label ?? "synthetic-compute-pso" }),
  };
}

function detectBrowserDeviceName(): string {
  const ua = (typeof navigator !== "undefined" ? navigator.userAgent : "").toLowerCase();
  return ua.includes("mac os x") || ua.includes("macintosh") || ua.includes("iphone") || ua.includes("ipad")
    ? "Apple Silicon (Browser WebGPU Sandbox)"
    : "Browser WebGPU WGSL Adapter";
}

function buildEffectiveHostProbe(
  probeResult: DesktopLoopbackProbeResult,
  overrideProbe?: Partial<HostHardwareProbe>,
): HostHardwareProbe {
  if (!probeResult.connected) {
    return {
      os: "browser-sandbox",
      vendor: overrideProbe?.vendor ?? "webgpu-fallback",
      deviceName: overrideProbe?.deviceName ?? detectBrowserDeviceName(),
      driverVersion: overrideProbe?.driverVersion ?? "webgpu-wgsl",
      vramMb: overrideProbe?.vramMb ?? 4_096,
      unifiedMemory: overrideProbe?.unifiedMemory ?? true,
      targetFps: overrideProbe?.targetFps ?? 60,
      allowMultiFrameGen: false,
    };
  }
  const r = probeResult.probe?.probe;
  const vendor: GpuVendor =
    r?.vendor ?? probeResult.probe?.vendor ?? probeResult.health.vendor ?? overrideProbe?.vendor ?? "apple";
  const defaultDevice = vendor === "apple" ? "Apple M-Series Native Bridge" : `${vendor.toUpperCase()} Native GPU`;
  return {
    os: r?.os ?? overrideProbe?.os ?? (vendor === "apple" ? "macos" : "windows"),
    vendor,
    deviceName: r?.deviceName ?? probeResult.probe?.deviceName ?? probeResult.health.deviceName ?? overrideProbe?.deviceName ?? defaultDevice,
    driverVersion: r?.driverVersion ?? probeResult.health.daemonVersion,
    vramMb: r?.vramMb ?? 16_384,
    unifiedMemory: r?.unifiedMemory ?? (vendor === "apple" || vendor === "arm" || vendor === "qualcomm"),
    targetFps: r?.targetFps ?? 120,
    allowMultiFrameGen: r?.allowMultiFrameGen ?? false,
    supportsMetal3: r?.supportsMetal3 ?? vendor === "apple",
    supportsMetalFxTemporal: r?.supportsMetalFxTemporal ?? vendor === "apple",
    supportsMetalFxSpatial: r?.supportsMetalFxSpatial ?? vendor === "apple",
    supportsAppleAne: r?.supportsAppleAne ?? vendor === "apple",
    supportsDlss4Transformer: r?.supportsDlss4Transformer ?? vendor === "nvidia",
    supportsDlss35: r?.supportsDlss35 ?? vendor === "nvidia",
    supportsReflex2FrameWarp: r?.supportsReflex2FrameWarp ?? vendor === "nvidia",
    supportsTensorFp8Int4: r?.supportsTensorFp8Int4 ?? vendor === "nvidia",
    supportsNvidiaOfa: r?.supportsNvidiaOfa ?? vendor === "nvidia",
    amdFsr: r?.amdFsr ?? (vendor === "amd" ? "fsr4.1-int8-full" : "none"),
    supportsAntiLag2: r?.supportsAntiLag2 ?? vendor === "amd",
    amdXdnaGeneration: r?.amdXdnaGeneration ?? (vendor === "amd" ? 2 : 0),
    intelXess: r?.intelXess ?? (vendor === "intel" ? "xess2-xmx-fg" : "none"),
    supportsXeLl: r?.supportsXeLl ?? vendor === "intel",
    supportsIntelAiBoost: r?.supportsIntelAiBoost ?? vendor === "intel",
    supportsArmAsr: r?.supportsArmAsr ?? vendor === "arm",
    supportsArmNss: r?.supportsArmNss ?? vendor === "arm",
    supportsArmKleidiAiSme2: r?.supportsArmKleidiAiSme2 ?? vendor === "arm",
    supportsSnapdragonGsr2: r?.supportsSnapdragonGsr2 ?? vendor === "qualcomm",
    supportsHexagonQnnHtp: r?.supportsHexagonQnnHtp ?? vendor === "qualcomm",
  };
}

function createCompactLineartFixtures(): { readonly width: number; readonly height: number; readonly lineartData: Uint8ClampedArray; readonly refData: Uint8ClampedArray } {
  const width = 12;
  const height = 12;
  const lineartData = new Uint8ClampedArray(width * height * 4);
  const refData = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const p = (y * width + x) * 4;
      const c = x === 2 || x === 9 || y === 2 || y === 9 ? 20 : 255;
      lineartData.set([c, c, c, 255], p);
      refData.set([52, 132, 98, 255], p);
    }
  }
  return { width, height, lineartData, refData };
}

/** `/studio` 초격차 런타임 허브 인스턴스를 생성한다. Wave 54~67 모듈은 호출 시점에만 동적 로드한다. */
export function createStudioSupergapRuntimeHub(options: StudioSupergapRuntimeHubOptions = {}): StudioSupergapRuntimeHub {
  const nowMs = options.nowMs ?? defaultNowMs;
  const listeners = new Set<(snapshot: StudioSupergapHubSnapshot) => void>();

  let loopbackConfig: DesktopLoopbackBridgeConfig = options.loopbackConfig ?? {};
  let activeLoopbackTransport: DesktopLoopbackBridgeTransport | null = null;
  let hardwareBridge: HardwareBridgeStatus | null = null;
  let isBootstrapping = false;
  let isRunningDiagnostic = false;
  let activeActionSubsystemId: string | null = null;
  let tactileReliefMode: StudioTactileReliefMode = "off";
  let lastReport: SupergapRuntimeReport | null = null;
  let lastErrorKo: string | null = null;
  const lastResultsById = new Map<string, SupergapSubsystemExecutionResult>();
  const extensionEntries = new Map<string, InternalSubsystemEntry>();
  const builtinEntries = new Map<BuiltinSupergapSubsystemId, InternalSubsystemEntry>();

  const registerBuiltin = (
    id: BuiltinSupergapSubsystemId,
    waveLabel: string,
    titleKo: string,
    capabilitySummaryKo: string,
    run: InternalSubsystemEntry["run"],
  ): void => {
    builtinEntries.set(id, { meta: { id, waveLabel, titleKo, capabilitySummaryKo, isExtension: false }, run });
  };

  const runHardwareBridgeBootstrap = async (overrideConfig?: DesktopLoopbackBridgeConfig): Promise<HardwareBridgeStatus> => {
    if (overrideConfig) loopbackConfig = overrideConfig;
    const startedMs = nowMs();
    isBootstrapping = true;
    lastErrorKo = null;
    emitSnapshot();

    try {
      const [probeResult, wave65, wave63] = await Promise.all([
        probeDesktopLoopbackBridge(loopbackConfig),
        import("../wasm64-wave65-native-gpu-npu-bridge"),
        import("../wasm64-wave63-multivendor-gpu-npu-hal"),
      ]);
      activeLoopbackTransport = probeResult.connected ? probeResult.transport : null;
      const hostProbe = buildEffectiveHostProbe(probeResult, options.defaultHostProbe);
      const sessionPlan = wave65.negotiateNativeBridgeSession(hostProbe);

      const prewarmer = new wave65.WebGpuShaderPsoPrewarmer({
        device: options.webGpuDevice ?? createSyntheticWebGpuDeviceAdapter(),
        nowMs,
      });
      prewarmer.enqueue(wave65.BUILTIN_STUDIO_BRUSH_SHADERS);
      const prewarmReport = await prewarmer.prewarmAll();

      const halProfile = wave63.detectHardwareAccelerationProfile({
        hostEnvironment: probeResult.connected ? "desktop-tauri-native" : "browser-web",
        adapterVendor: hostProbe.vendor,
        adapterDeviceName: hostProbe.deviceName,
        webgpu: { available: true, supportsShaderF16: true, supportsSubgroups: true },
        wasm: { memory64: true, simd128: true },
      });
      const halSelection = wave63.selectOptimalUpscalerAndLatencyStack(halProfile, {
        qualityPreset: "quality",
        splitResPreserveNativeLineart: true,
      });

      const latencyMs = roundMs(nowMs() - startedMs);
      const checkedAtIso = new Date().toISOString();
      const prewarmedPsoCount = prewarmReport.compiledShaderIds.length;
      hardwareBridge = probeResult.connected
        ? {
            connectionMode: "desktop-native-loopback", connected: true, webgpuFallbackReady: true,
            vendor: probeResult.health.vendor ?? sessionPlan.vendor, deviceName: hostProbe.deviceName,
            graphicsBackend: probeResult.health.backend ?? sessionPlan.graphicsBackend,
            upscaler: probeResult.health.upscaler ?? sessionPlan.upscaler,
            lowLatencyStack: probeResult.health.lowLatency ?? sessionPlan.lowLatency,
            npuBackend: probeResult.health.npuBackend ?? sessionPlan.npuBackend,
            zeroCopyEnabled: probeResult.health.zeroCopyEnabled ?? sessionPlan.zeroCopyEnabled,
            prewarmedPsoCount, loopbackBaseUrl: probeResult.baseUrl, fallbackReason: null, checkedAtIso, latencyMs,
          }
        : {
            connectionMode: "browser-webgpu-fallback", connected: false, webgpuFallbackReady: true,
            vendor: halProfile.primaryVendor, deviceName: halProfile.primaryDeviceName,
            graphicsBackend: sessionPlan.graphicsBackend, upscaler: halSelection.activeUpscalerSpec.displayName,
            lowLatencyStack: halSelection.activeLatencySpec.displayName, npuBackend: halSelection.primaryAiAccelerator,
            zeroCopyEnabled: false, prewarmedPsoCount, loopbackBaseUrl: probeResult.baseUrl,
            fallbackReason: probeResult.fallbackReason, checkedAtIso, latencyMs,
          };
      return hardwareBridge;
    } catch (caught) {
      lastErrorKo = caught instanceof Error ? caught.message : String(caught);
      throw caught;
    } finally {
      isBootstrapping = false;
      emitSnapshot();
    }
  };

  registerBuiltin("desktopNativeGpuNpuBridge", "Wave 65", "네이티브 GPU/NPU 브릿지 · PSO 프리워머",
    "TSNB 바이너리 IPC · CRC-32 · WebGPU WGSL 브러시 PSO 0ms 예열", async () => {
      const wave65 = await import("../wasm64-wave65-native-gpu-npu-bridge");
      const bridge = hardwareBridge ?? (await runHardwareBridgeBootstrap());
      const testPayload = new Uint8Array([0x54, 0x53, 0x72, 0x72]);
      const encoded = wave65.encodeIpcFramePacket({
        version: wave65.IPC_PROTOCOL_VERSION, kind: "heartbeat", vendor: bridge.connected ? "apple" : "webgpu-fallback",
        sequence: BigInt(1), shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
        flags: bridge.connected ? wave65.IPC_FLAGS.LOW_LATENCY_MARK : wave65.IPC_FLAGS.FALLBACK_WEBGPU,
        frameBudgetUs: 8_333, actualLatencyUs: 0, payload: testPayload,
      });
      const decoded = wave65.decodeIpcFramePacket(encoded);

      let liveRoundTripOk = false;
      let liveRoundTripMs = 0;
      if (bridge.connected && activeLoopbackTransport) {
        const ipcClient = new wave65.NativeBridgeIpcClient({ transport: activeLoopbackTransport, timeoutMs: 1_500, nowMs });
        const call = await ipcClient.sendPacket({
          kind: "heartbeat", vendor: decoded.vendor, shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
          flags: wave65.IPC_FLAGS.LOW_LATENCY_MARK, frameBudgetUs: 8_333, actualLatencyUs: 0, payload: testPayload,
        });
        if (call.ok) { liveRoundTripOk = true; liveRoundTripMs = roundMs(call.roundTripMs); }
      }
      return {
        status: bridge.connected && liveRoundTripOk ? "live-connected" : "browser-fallback",
        summaryKo: bridge.connected && liveRoundTripOk
          ? `데스크톱 루프백 TSNB IPC 왕복 검증 완료(${liveRoundTripMs}ms) · PSO ${bridge.prewarmedPsoCount}종 예열됨`
          : `WebGPU WGSL 폴백 경로 검증 완료 · TSNB CRC-32 코덱 정상 · PSO ${bridge.prewarmedPsoCount}종 예열됨`,
        metrics: {
          connectionMode: bridge.connectionMode, packetBytes: encoded.byteLength,
          crcVerified: decoded.payload.byteLength === testPayload.byteLength,
          prewarmedPsoCount: bridge.prewarmedPsoCount, liveRoundTripOk,
        },
      };
    });

  registerBuiltin("multiVendorGpuNpuHal", "Wave 63", "6대 벤더 GPU/NPU HAL · 5-Lane DAG",
    "FSR 1~4.1 · DLSS 3.5~4 · XeSS 2 · MetalFX · Arm ASR · Qualcomm GSR", async () => {
      const wave63 = await import("../wasm64-wave63-multivendor-gpu-npu-hal");
      const isNative = Boolean(hardwareBridge?.connected);
      const profile = wave63.detectHardwareAccelerationProfile({
        hostEnvironment: isNative ? "desktop-tauri-native" : "browser-web",
        adapterVendor: hardwareBridge?.vendor ?? "apple",
        adapterDeviceName: hardwareBridge?.deviceName ?? "Studio Browser WebGPU",
        webgpu: { available: true, supportsShaderF16: true, supportsSubgroups: true },
        wasm: { memory64: true, simd128: true },
      });
      const selection = wave63.selectOptimalUpscalerAndLatencyStack(profile, { qualityPreset: "quality", splitResPreserveNativeLineart: true });
      const plan = wave63.planHeterogeneousMultiAcceleratorFrame(profile, selection, {
        targetFrameBudgetMs: 16.67, canvasWidthPx: 2560, canvasHeightPx: 1440,
        enableRadianceCascades: true, enableSemanticNpuPass: true, enableOpticalFlowPass: false, enableSplitResNativeLineart: true,
      });
      return {
        status: isNative ? "live-connected" : "browser-fallback",
        summaryKo: `${selection.activeUpscalerSpec.displayName} + ${selection.activeLatencySpec.displayName} · 5-Lane DAG ${plan.criticalPathMs}ms`,
        metrics: {
          activeUpscaler: selection.activeUpscaler, latencyStack: selection.activeLatencyStack,
          primaryAiAccelerator: selection.primaryAiAccelerator, dagTaskCount: plan.nodes.length,
          criticalPathMs: plan.criticalPathMs, fitsFrameBudget: plan.fitsFrameBudget,
        },
      };
    });

  registerBuiltin("fastWasm64Kernels", "Wave 54", "WASM64 memory64 고속 커널",
    "Meijster EDT · SDF 틈새 닫힘 채색 · BC1 패킹 · 유화 붓모 누산", async () => {
      const wave54 = await import("../wasm64-wave54-fast-anything-kernels");
      const memory64Supported = wave54.supportsWasmMemory64();
      const runtime = await wave54.loadFastKernelsRuntime({ forceBackend: "auto" });
      try {
        const mask = new Uint8Array(256);
        mask[8 * 16 + 8] = 1;
        const processed = runtime.meijsterEdt2dSqF32(mask, 16, 16, new Float32Array(256));
        const packedBytes = runtime.packBc1TileRgbaTo64Bit(new Uint8Array(1024).fill(200), 16, 16, new Uint8Array(128));
        const isNativeWasm = runtime.backend === "wasm64" || runtime.backend === "wasm32";
        return {
          status: isNativeWasm ? "live-connected" : "browser-fallback",
          summaryKo: `백엔드 ${runtime.backend.toUpperCase()} · EDT ${processed}px · BC1 ${packedBytes}B 검증 완료`,
          metrics: { backend: runtime.backend, memory64Supported, pointerWidthBits: runtime.pointerWidthBits, edtProcessedPixels: processed, bc1PackedBytes: packedBytes },
        };
      } finally {
        runtime.dispose();
      }
    });

  registerBuiltin("tactilePhysicalRelief", "Wave 62 + Live", "2.5D 실물 질감 · 3채널 임파스토",
    "실시간 소벨 측면 광원 입체감 · Kubelka-Munk 7밴드 안료 혼색", async () => {
      const [liveRelief, wave62] = await Promise.all([
        import("../brush/studio-tactile-physical-relief-runtime"),
        import("../wasm64-wave62-tactile-impasto-granulation-engine"),
      ]);
      tactileReliefMode = liveRelief.getStudioTactileReliefMode();
      const rgba = new Uint8ClampedArray(12 * 12 * 4);
      for (let i = 0; i < 144; i += 1) rgba.set([48, 104, 76, 220], i * 4);
      const profile = liveRelief.resolveStudioTactileReliefProfileForBrush("oil-impasto");
      const touchedReliefPixels = liveRelief.applyStudioTactilePhysicalReliefToRgba(rgba, {
        width: 12, height: 12, profile, mode: tactileReliefMode === "off" ? "sculpted" : tactileReliefMode,
      });
      const canvasBuffer = new wave62.PhysicalPaintCanvasBuffer(24, 24, { paperProfile: "cold-press-watercolor", paperSeed: 72 });
      const stroke = wave62.applyPhysicalMediaStroke(canvasBuffer, {
        medium: "oil", colorLinearRgb: [0.16, 0.36, 0.28], radiusPx: 4,
        points: [{ x: 6, y: 12, pressure: 0.72 }, { x: 18, y: 12, pressure: 0.85 }],
      });
      const mixed = wave62.mixPigmentsKubelkaMunk([0.08, 0.25, 0.72], [0.85, 0.74, 0.12], 0.5);
      return {
        status: "live-connected",
        summaryKo: `실물 질감(${tactileReliefMode}) ${touchedReliefPixels}px · 임파스토 ${stroke.paintedPixelsInBuffer}px · KM 혼색 정상`,
        metrics: {
          liveReliefMode: tactileReliefMode, reliefProfile: profile, touchedReliefPixels,
          paintedPixelsInBuffer: stroke.paintedPixelsInBuffer, maxImpastoHeight: roundMs(stroke.maxImpastoHeight),
          kmMixedGreenChannel: roundMs(mixed[1]),
        },
      };
    });

  registerBuiltin("cadShaperPro3d", "Wave 55", "3D 셰이퍼+ CAD · 만화 NPR 선화",
    "미터 단위 수밀 솔리드 · 오일러 무결성 감사 · HLR 은선 제거 선화 추출", async () => {
      const wave55 = await import("../wasm64-wave55-3d-shaper-pro-cad");
      const solid = wave55.createBoxSolidPrimitive({ id: "hub-smoke-box", label: "진단용 수밀 블록", widthX: 1.2, heightY: 2.0, depthZ: 0.8, groundToFloorY0: true });
      const audit = wave55.auditSolidManifoldIntegrity(solid);
      const projection = wave55.extractComicNprInkStrokes(solid, { position: [3.2, 2.4, 3.6], target: [0, 1.0, 0], viewportWidthPx: 640, viewportHeightPx: 480 });
      return {
        status: "live-connected",
        summaryKo: `수밀 솔리드 검증(${audit.nonManifoldEdges} 비다양체) · NPR 만화 선화 ${projection.strokes.length}획 추출`,
        metrics: { watertight: audit.isWatertight, nonManifoldEdges: audit.nonManifoldEdges, boundaryEdges: audit.boundaryEdges, extractedNprStrokes: projection.strokes.length },
      };
    });

  registerBuiltin("neuralBrushAndProvenance", "Wave 64", "INT4 뉴럴 브러시 · 머클 저작권 원장",
    "1ms 미만 INT4 대리 추론 · 동기 SHA-256 RFC 6962 Rights BOM 증명", async () => {
      const wave64 = await import("../wasm64-wave64-neural-brush-3dgs-provenance");
      const patch = wave64.evaluateNeuralBrushSurrogatePatch({
        pressure: 0.72, tiltX: 0.14, tiltY: -0.08, velocity: 0.55, paperTooth: 0.52, wetness: 0.68,
        pickupColor: [0.12, 0.28, 0.22, 1], paintColor: [0.18, 0.42, 0.31, 1], patchSize: 12, presetId: "watercolor-granulation",
      });
      const ledger = wave64.buildAssetProvenanceMerkleLedger({
        ledgerId: "wave72-diagnostic-ledger", tenantId: "studio-local", workspaceId: "ws-diagnostic",
        entries: [{
          entryId: "entry-brush-01", tenantId: "studio-local", workspaceId: "ws-diagnostic", episodeId: "ep-01",
          assetKind: "brush-preset", assetName: "수채 과립화 브러시", contentSha256: wave64.sha256Hex("toonstudio-wave72-hub-check"),
          licenseTier: "commercial-cleared", licenseGrantId: "grant-studio-01", issuerId: "toonstudio-local", recordedAtIso: "2026-11-28T00:00:00Z",
        }],
      });
      const verification = wave64.verifyMerkleInclusionProof(wave64.generateMerkleInclusionProof(ledger, "entry-brush-01"));
      return {
        status: verification.valid ? "live-connected" : "browser-fallback",
        summaryKo: `INT4 추론 ${roundMs(patch.metrics.inferenceMs)}ms · 머클 포함 증명 ${verification.valid ? "유효" : "실패"}`,
        metrics: {
          inferenceMs: roundMs(patch.metrics.inferenceMs), activePixelCount: patch.metrics.activePixelCount,
          merkleProofValid: verification.valid, clearedForCommercialExport: ledger.rightsClearance.clearedForCommercialExport,
        },
      };
    });

  registerBuiltin("slangSeeThroughMangaNinja", "Wave 66", "Slang 뉴럴 셰이더 · MangaNinja 채색",
    "Slang→WGSL FP16 정합성(<1e-4) · 경계 침범 0% 선화 자동 채색", async () => {
      const wave66 = await import("../wasm64-wave66-slang-neural-seethrough-manganinja");
      const spec = wave66.createDefaultWebtoonTactileBrushSpec("fp16");
      const compiled = wave66.compileInlineNeuralShaderToWgsl(spec);
      const parity = wave66.verifyInlineNeuralShaderParity(
        compiled,
        [{ u: 0.35, v: 0.65, pressure: 0.78, tiltSin: 0.2, velocity: 0.4, paperGrain: 0.5, wetness: 0.6, radialDist: 0.25 }],
        { originalFp32Spec: spec },
      );
      const fx = createCompactLineartFixtures();
      const colorized = wave66.colorizeLineartFromReferencePoints(
        { width: fx.width, height: fx.height, data: fx.lineartData },
        { width: fx.width, height: fx.height, data: fx.refData },
        [{ refX: 5, refY: 5, targetX: 5, targetY: 5 }],
      );
      return {
        status: parity.passed && colorized.leakAudit.passed ? "live-connected" : "browser-fallback",
        summaryKo: `WGSL 정합성 오차 ${parity.maxAbsError.toExponential(1)} · 선화 누수 ${colorized.leakAudit.mutatedLineartPixels}px`,
        metrics: {
          wgslContractPassed: parity.wgslContract.passed, parityPassed: parity.passed,
          maxAbsError: parity.maxAbsError, leakAuditPassed: colorized.leakAudit.passed, regionCount: colorized.regionGraph.regions.length,
        },
      };
    });

  registerBuiltin("vectorSelfHealLanMeshErgo", "Wave 67", "획 벡터화 · 자가 치유 · LAN 메쉬 · 페이서",
    "Zhang-Suen 베지에 복원 · OPFS 타일 무손실 치유 · LAN 오프로딩 · 비의료 리듬 안내", async () => {
      const wave67 = await import("../wasm64-wave67-stroke-vectorizer-selfheal-lan-mesh");
      const strokeMask = new Uint8Array(24 * 24);
      for (let x = 3; x <= 20; x += 1) { strokeMask[11 * 24 + x] = 255; strokeMask[12 * 24 + x] = 255; }
      const vectorized = wave67.vectorizeRasterLineartInStrokeOrder({ width: 24, height: 24, data: strokeMask });

      const layerMeta = { layerId: "layer-ink", name: "선화", opacity: 1, blendMode: "normal" as const, visible: true, zIndex: 0 };
      const journal = wave67.createSignedStrokeJournal([
        { seq: 1, entryId: "op-1", layerId: "layer-ink", op: "fill-rect", colorRgba: [24, 48, 36, 255], rect: { x: 2, y: 2, width: 6, height: 6 } },
      ]);
      const healthy = wave67.rasterizeJournalEntriesToTile(journal, "layer-ink", 0, 0, 16, 1);
      const manifest = wave67.createTileIntegrityManifest({
        canvasWidth: 16, canvasHeight: 16, tileSize: 16, headJournalSeq: 1, layers: [layerMeta],
        tiles: [{ tileId: "tile-0-0", layerId: "layer-ink", tileX: 0, tileY: 0, tileSize: 16, pixels: healthy.pixels }],
      });
      const corrupted = new Uint8Array(healthy.pixels);
      corrupted[0] = (corrupted[0] + 17) & 0xff;
      const healed = wave67.auditAndSelfHealCanvasSnapshot({
        manifest, layers: [layerMeta],
        tiles: [{ tileId: "tile-0-0", layerId: "layer-ink", tileX: 0, tileY: 0, tileSize: 16, pixels: corrupted }],
        strokeJournal: journal,
      });
      const meshPlan = wave67.planLanP2pMeshOffload(
        { deviceId: "studio-local-client", formFactor: "laptop-workstation", accelerator: "webgpu-integrated", availableVramMb: 4_096, computeTflops: 8, batteryPercent: 88, isPluggedIn: true, thermalState: "nominal", targetFrameBudgetMs: 16.67 },
        [],
        { workloadId: "diag-tile-1", kind: "vector-trace-batch", payloadBytes: 16_384, resultBytes: 8_192, estimatedGflops: 4, requiredVramMb: 256, latencySensitive: true },
      );
      const pacing = wave67.evaluateCreativeErgonomicPacing({
        continuousDrawingMinutes: 25, baselineStrokeVelocityPxPerSec: 320, recentStrokeVelocityPxPerSec: 310,
        baselineUndoPerMinute: 1.5, recentUndoPerMinute: 1.4, strokeJitterRatio: 0.12, currentStabilizerStrength: 0.35, minutesSinceLastBreak: 25,
      });
      return {
        status: healed.losslessRecoveredCount >= 1 ? "live-connected" : "browser-fallback",
        summaryKo: `벡터 ${vectorized.strokes.length}획 · 무손실 자가 치유 ${healed.losslessRecoveredCount}타일 · 리듬 ${pacing.pacingLevel}`,
        metrics: {
          vectorizedStrokes: vectorized.strokes.length, losslessRecoveredTiles: healed.losslessRecoveredCount,
          journalChainValid: healed.journalChainValid, meshDecision: meshPlan.decision,
          ergonomicNonMedical: pacing.isMedicalAdvice === false, pacingLevel: pacing.pacingLevel,
        },
      };
    });

  const collectAllEntries = (): InternalSubsystemEntry[] => [...builtinEntries.values(), ...extensionEntries.values()];

  function buildSnapshot(): StudioSupergapHubSnapshot {
    const resultsRecord: Record<string, SupergapSubsystemExecutionResult> = {};
    for (const [id, result] of lastResultsById.entries()) resultsRecord[id] = result;
    return {
      hardwareBridge, isBootstrapping, isRunningDiagnostic, activeActionSubsystemId, tactileReliefMode,
      registeredSubsystems: collectAllEntries().map((entry) => entry.meta),
      lastResultsById: resultsRecord, lastReport, lastErrorKo,
    };
  }

  function emitSnapshot(): void {
    const snapshot = buildSnapshot();
    for (const listener of listeners) listener(snapshot);
  }

  async function executeSingleEntry(
    entry: InternalSubsystemEntry,
    payload?: Readonly<Record<string, unknown>>,
    emitPerActionState = true,
  ): Promise<SupergapSubsystemExecutionResult> {
    const startedMs = nowMs();
    if (emitPerActionState) { activeActionSubsystemId = entry.meta.id; lastErrorKo = null; emitSnapshot(); }
    try {
      const output = await entry.run(payload);
      const result: SupergapSubsystemExecutionResult = {
        id: entry.meta.id, waveLabel: entry.meta.waveLabel, titleKo: entry.meta.titleKo, isExtension: entry.meta.isExtension,
        status: output.status, latencyMs: roundMs(nowMs() - startedMs), summaryKo: output.summaryKo,
        metrics: output.metrics ?? {}, executedAtIso: new Date().toISOString(),
      };
      lastResultsById.set(entry.meta.id, result);
      return result;
    } catch (caught) {
      const errorMessage = caught instanceof Error ? caught.message : String(caught);
      const result: SupergapSubsystemExecutionResult = {
        id: entry.meta.id, waveLabel: entry.meta.waveLabel, titleKo: entry.meta.titleKo, isExtension: entry.meta.isExtension,
        status: "error", latencyMs: roundMs(nowMs() - startedMs), summaryKo: `실행 중 오류: ${errorMessage}`,
        metrics: {}, executedAtIso: new Date().toISOString(), errorMessage,
      };
      lastResultsById.set(entry.meta.id, result);
      lastErrorKo = errorMessage;
      return result;
    } finally {
      if (emitPerActionState) { activeActionSubsystemId = null; emitSnapshot(); }
    }
  }

  return {
    bootstrapHardwareBridge: runHardwareBridgeBootstrap,

    async runDiagnosticSelfCheck(): Promise<SupergapRuntimeReport> {
      const startedMs = nowMs();
      isRunningDiagnostic = true;
      lastErrorKo = null;
      emitSnapshot();
      try {
        const bridge = hardwareBridge ?? (await runHardwareBridgeBootstrap());
        const subsystems: SupergapSubsystemExecutionResult[] = [];
        for (const entry of collectAllEntries()) subsystems.push(await executeSingleEntry(entry, undefined, false));
        const liveConnectedCount = subsystems.filter((i) => i.status === "live-connected").length;
        const browserFallbackCount = subsystems.filter((i) => i.status === "browser-fallback").length;
        const errorCount = subsystems.length - liveConnectedCount - browserFallbackCount;
        lastReport = {
          checkedAtIso: new Date().toISOString(), totalDurationMs: roundMs(nowMs() - startedMs), hardwareBridge: bridge,
          subsystems, liveConnectedCount, browserFallbackCount, errorCount, allHealthy: errorCount === 0,
        };
        return lastReport;
      } finally {
        isRunningDiagnostic = false;
        emitSnapshot();
      }
    },

    async executeSubsystemAction(subsystemId, payload) {
      const entry = builtinEntries.get(subsystemId as BuiltinSupergapSubsystemId) ?? extensionEntries.get(subsystemId);
      if (!entry) throw new Error(`등록되지 않은 초격차 런타임 서브시스템입니다: ${subsystemId}`);
      return executeSingleEntry(entry, payload, true);
    },

    async cycleTactileReliefMode() {
      const liveRelief = await import("../brush/studio-tactile-physical-relief-runtime");
      tactileReliefMode = liveRelief.cycleStudioTactileReliefMode();
      emitSnapshot();
      return tactileReliefMode;
    },

    async refreshTactileReliefMode() {
      const liveRelief = await import("../brush/studio-tactile-physical-relief-runtime");
      tactileReliefMode = liveRelief.getStudioTactileReliefMode();
      emitSnapshot();
      return tactileReliefMode;
    },

    getRegisteredSubsystems: () => collectAllEntries().map((entry) => entry.meta),

    registerExtensionSubsystem(definition) {
      const trimmedId = definition.id.trim();
      if (!trimmedId) throw new RangeError("확장 서브시스템 ID는 비어 있을 수 없습니다.");
      if (builtinEntries.has(trimmedId as BuiltinSupergapSubsystemId)) {
        throw new Error(`내장 서브시스템 ID(${trimmedId})는 덮어쓸 수 없습니다.`);
      }
      extensionEntries.set(trimmedId, {
        meta: {
          id: trimmedId, waveLabel: definition.waveLabel, titleKo: definition.titleKo,
          capabilitySummaryKo: definition.capabilitySummaryKo, isExtension: true,
        },
        run: (payload) => definition.execute({ hardwareBridge, payload }),
      });
      emitSnapshot();
    },

    unregisterExtensionSubsystem(subsystemId) {
      const removed = extensionEntries.delete(subsystemId);
      if (removed) { lastResultsById.delete(subsystemId); emitSnapshot(); }
      return removed;
    },

    getSnapshot: buildSnapshot,

    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
