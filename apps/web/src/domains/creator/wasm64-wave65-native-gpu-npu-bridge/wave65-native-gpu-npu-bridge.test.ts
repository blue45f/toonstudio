import { describe, expect, it } from "vitest";

import {
  BUILTIN_STUDIO_BRUSH_SHADERS,
  IPC_FLAGS,
  IPC_HEADER_BYTES,
  IPC_MIN_PACKET_BYTES,
  IPC_PROTOCOL_VERSION,
  IpcProtocolError,
  NativeBridgeIpcClient,
  StudioGpuNpuBridgeRuntime,
  WebGpuShaderPsoPrewarmer,
  computeCrc32Ieee,
  computePsoCacheKey,
  decodeIpcFramePacket,
  encodeIpcFramePacket,
  formatHostProbeDescriptor,
  negotiateNativeBridgeSession,
  type HostHardwareProbe,
  type IpcFramePacket,
  type NativeBridgeTransport,
  type PsoShaderDescriptor,
  type WebGpuDeviceLike,
} from "./index";

function createBaseProbe(overrides: Partial<HostHardwareProbe> = {}): HostHardwareProbe {
  return {
    os: "windows",
    vendor: "nvidia",
    deviceName: "Test GPU",
    driverVersion: "1.0.0",
    vramMb: 16_384,
    unifiedMemory: false,
    targetFps: 120,
    allowMultiFrameGen: true,
    ...overrides,
  };
}

interface MockWebGpuDeviceController {
  readonly device: WebGpuDeviceLike;
  readonly compiledLabels: string[];
  compileCount: number;
}

function createMockWebGpuDevice(options?: {
  readonly simulatedCompileCostMs?: number;
  readonly onAdvanceClock?: (ms: number) => void;
}): MockWebGpuDeviceController {
  const compiledLabels: string[] = [];
  const controller: MockWebGpuDeviceController = {
    compiledLabels,
    compileCount: 0,
    device: {
      createShaderModule(descriptor) {
        return { label: descriptor.label };
      },
      async createRenderPipelineAsync(descriptor) {
        controller.compileCount += 1;
        compiledLabels.push(descriptor.label ?? "render");
        if (options?.onAdvanceClock && options.simulatedCompileCostMs) {
          options.onAdvanceClock(options.simulatedCompileCostMs);
        }
        return { label: descriptor.label };
      },
      async createComputePipelineAsync(descriptor) {
        controller.compileCount += 1;
        compiledLabels.push(descriptor.label ?? "compute");
        if (options?.onAdvanceClock && options.simulatedCompileCostMs) {
          options.onAdvanceClock(options.simulatedCompileCostMs);
        }
        return { label: descriptor.label };
      },
    },
  };
  return controller;
}

function createEchoNativeTransport(actualLatencyUs = 1_850): NativeBridgeTransport {
  return {
    async sendFrame(packetBytes) {
      const req = decodeIpcFramePacket(packetBytes);
      return encodeIpcFramePacket({
        ...req,
        kind: "frame-complete",
        actualLatencyUs,
        payload: new Uint8Array([0x4f, 0x4b]),
      });
    },
  };
}

describe("wasm64-wave65-native-gpu-npu-bridge", () => {
  describe("6대 벤더 결정론적 세션 협상 및 브라우저 샌드박스 폴백", () => {
    it("Apple Silicon(macOS)에서 Metal 3 + MetalFX Temporal + CoreML ANE + UMA Zero-Copy를 협상한다", () => {
      const plan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "macos",
          vendor: "apple",
          deviceName: "Apple M4 Max",
          unifiedMemory: true,
          supportsMetal3: true,
          supportsMetalFxTemporal: true,
          supportsMetalFxSpatial: true,
          supportsAppleAne: true,
        }),
      );
      expect(plan.graphicsBackend).toBe("metal3");
      expect(plan.upscaler).toBe("metalfx-temporal");
      expect(plan.lowLatency).toBe("apple-metal-direct-present");
      expect(plan.npuBackend).toBe("apple-coreml-ane");
      expect(plan.transport).toBe("apple-uma-iosurface");
      expect(plan.isNativeAccelerated).toBe(true);
      expect(plan.zeroCopyEnabled).toBe(true);
      expect(plan.frameBudgetUs).toBe(8_333);
      expect(plan.recommendedFlags & IPC_FLAGS.ZERO_COPY_SHM).not.toBe(0);
      expect(plan.recommendedFlags & IPC_FLAGS.NPU_ASSISTED).not.toBe(0);
    });

    it("Apple 환경에서 Temporal 미지원 시 MetalFX Spatial로 안전하게 하향 협상한다", () => {
      const plan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "ios",
          vendor: "apple",
          unifiedMemory: true,
          supportsMetal3: true,
          supportsMetalFxTemporal: false,
          supportsMetalFxSpatial: true,
          supportsAppleAne: true,
        }),
      );
      expect(plan.upscaler).toBe("metalfx-spatial");
      expect(plan.npuBackend).toBe("apple-coreml-ane");
      expect(plan.zeroCopyEnabled).toBe(true);
    });

    it("NVIDIA RTX 50-시리즈에서 DLSS 4 Transformer MFG + Reflex 2 + Tensor FP8/INT4 + OFA를 협상한다", () => {
      const plan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "windows",
          vendor: "nvidia",
          deviceName: "NVIDIA GeForce RTX 5090",
          targetFps: 240,
          allowMultiFrameGen: true,
          supportsDlss4Transformer: true,
          supportsDlss35: true,
          supportsReflex2FrameWarp: true,
          supportsTensorFp8Int4: true,
          supportsNvidiaOfa: true,
        }),
      );
      expect(plan.graphicsBackend).toBe("directx12");
      expect(plan.upscaler).toBe("dlss4-transformer-mfg");
      expect(plan.lowLatency).toBe("nvidia-reflex2-frame-warp");
      expect(plan.npuBackend).toBe("nvidia-tensor-fp8-int4-ofa");
      expect(plan.transport).toBe("windows-dxgi-shared-handle");
      expect(plan.frameBudgetUs).toBe(4_166);
      expect(plan.recommendedFlags & IPC_FLAGS.MULTI_FRAME_GEN).not.toBe(0);
    });

    it("NVIDIA Linux 및 MFG 비활성/DLSS 3.5 조건에서 Vulkan 1.3 + DMA-BUF와 적절한 DLSS 단계를 선택한다", () => {
      const dlss4Sr = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "linux",
          vendor: "nvidia",
          allowMultiFrameGen: false,
          supportsDlss4Transformer: true,
          supportsTensorFp8Int4: true,
        }),
      );
      expect(dlss4Sr.graphicsBackend).toBe("vulkan13");
      expect(dlss4Sr.upscaler).toBe("dlss4-transformer-sr");
      expect(dlss4Sr.transport).toBe("linux-dmabuf-fd");
      expect(dlss4Sr.recommendedFlags & IPC_FLAGS.MULTI_FRAME_GEN).toBe(0);

      const dlss35 = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "linux",
          vendor: "nvidia",
          supportsDlss4Transformer: false,
          supportsDlss35: true,
          supportsTensorFp8Int4: true,
          supportsNvidiaOfa: false,
        }),
      );
      expect(dlss35.upscaler).toBe("dlss35-ray-reconstruction");
      expect(dlss35.npuBackend).toBe("nvidia-tensor-fp8-int4");
    });

    it("AMD RDNA 4 + Ryzen AI에서 FSR 4.1 INT8 Full + Anti-Lag 2 + XDNA 2 NPU를 협상한다", () => {
      const plan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "windows",
          vendor: "amd",
          amdFsr: "fsr4.1-int8-full",
          supportsAntiLag2: true,
          amdXdnaGeneration: 2,
        }),
      );
      expect(plan.upscaler).toBe("fsr4.1-int8-full");
      expect(plan.lowLatency).toBe("amd-radeon-anti-lag2");
      expect(plan.npuBackend).toBe("amd-ryzen-ai-xdna2");
      expect(plan.zeroCopyEnabled).toBe(true);
    });

    it("AMD FSR 4.1 INT8 Lite / FSR 3 / FSR 2 / FSR 1 및 XDNA 1 단계별 캐스케이드를 지원한다", () => {
      const matrix = [
        ["fsr4.1-int8-lite", "fsr4.1-int8-lite"],
        ["fsr3", "fsr3-frame-gen"],
        ["fsr2", "fsr2-temporal"],
        ["fsr1", "fsr1-spatial"],
      ] as const;
      for (const [amdFsr, expected] of matrix) {
        const plan = negotiateNativeBridgeSession(
          createBaseProbe({
            os: "linux",
            vendor: "amd",
            amdFsr,
            amdXdnaGeneration: 1,
          }),
        );
        expect(plan.upscaler).toBe(expected);
        expect(plan.npuBackend).toBe("amd-ryzen-ai-xdna1");
      }
    });

    it("Intel Arc / Core Ultra에서 XeSS 2(XMX+FG / DP4a) + XeSS 1 + XeLL + AI Boost NPU를 협상한다", () => {
      const xmxPlan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "windows",
          vendor: "intel",
          intelXess: "xess2-xmx-fg",
          supportsXeLl: true,
          supportsIntelAiBoost: true,
        }),
      );
      expect(xmxPlan.upscaler).toBe("xess2-xmx-fg");
      expect(xmxPlan.lowLatency).toBe("intel-xell");
      expect(xmxPlan.npuBackend).toBe("intel-ai-boost-npu");

      const dp4aPlan = negotiateNativeBridgeSession(
        createBaseProbe({ os: "windows", vendor: "intel", intelXess: "xess2-dp4a" }),
      );
      expect(dp4aPlan.upscaler).toBe("xess2-dp4a");

      const xess1Plan = negotiateNativeBridgeSession(
        createBaseProbe({ os: "windows", vendor: "intel", intelXess: "xess1" }),
      );
      expect(xess1Plan.upscaler).toBe("xess1");
    });

    it("Arm에서 Arm NSS/ASR + KleidiAI SME2 / Ethos-U 및 Android HardwareBuffer를 협상한다", () => {
      const nssPlan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "android",
          vendor: "arm",
          supportsArmNss: true,
          supportsArmAsr: true,
          supportsArmKleidiAiSme2: true,
          supportsArmEthosU: true,
        }),
      );
      expect(nssPlan.graphicsBackend).toBe("vulkan13");
      expect(nssPlan.upscaler).toBe("arm-nss");
      expect(nssPlan.npuBackend).toBe("arm-kleidiai-sme2");
      expect(nssPlan.transport).toBe("android-hardware-buffer");

      const asrPlan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "android",
          vendor: "arm",
          supportsArmNss: false,
          supportsArmAsr: true,
          supportsArmKleidiAiSme2: false,
          supportsArmEthosU: true,
        }),
      );
      expect(asrPlan.upscaler).toBe("arm-asr");
      expect(asrPlan.npuBackend).toBe("arm-ethos-u");
    });

    it("Qualcomm Snapdragon에서 Snapdragon GSR 2 + Hexagon NPU(QNN/HTP)를 협상한다", () => {
      const plan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "android",
          vendor: "qualcomm",
          supportsSnapdragonGsr2: true,
          supportsHexagonQnnHtp: true,
        }),
      );
      expect(plan.upscaler).toBe("snapdragon-gsr2");
      expect(plan.lowLatency).toBe("qualcomm-frame-pacing");
      expect(plan.npuBackend).toBe("qualcomm-hexagon-qnn-htp");
      expect(plan.zeroCopyEnabled).toBe(true);
    });

    it("브라우저 샌드박스 환경에서는 네이티브 기능 플래그가 있어도 안전한 WebGPU WGSL로 자동 폴백한다", () => {
      const plan = negotiateNativeBridgeSession(
        createBaseProbe({
          os: "browser-sandbox",
          vendor: "nvidia",
          supportsDlss4Transformer: true,
          supportsReflex2FrameWarp: true,
          supportsTensorFp8Int4: true,
        }),
      );
      expect(plan.vendor).toBe("webgpu-fallback");
      expect(plan.graphicsBackend).toBe("webgpu-wgsl");
      expect(plan.upscaler).toBe("webgpu-wgsl-bicubic-cas");
      expect(plan.npuBackend).toBe("webgpu-compute-fallback");
      expect(plan.isNativeAccelerated).toBe(false);
      expect(plan.zeroCopyEnabled).toBe(false);
      expect(plan.recommendedFlags & IPC_FLAGS.FALLBACK_WEBGPU).not.toBe(0);
      expect(plan.fallbackReason).toBe("browser-sandbox-webgpu-fallback");
    });

    it("프로브 서술자 직렬화가 Rust `parse_host_probe_descriptor` 규격 키를 정확히 출력한다", () => {
      const formatted = formatHostProbeDescriptor(
        createBaseProbe({
          os: "macos",
          vendor: "apple",
          unifiedMemory: true,
          supportsMetal3: true,
          supportsAppleAne: true,
        }),
      );
      expect(formatted).toContain("os=macos");
      expect(formatted).toContain("vendor=apple");
      expect(formatted).toContain("metal3=true");
      expect(formatted).toContain("apple_ane=true");
      expect(formatted).toContain("unified_memory=true");
    });
  });

  describe("바이너리 IPC 프레임 프로토콜·CRC32·시퀀스·타임아웃·서킷브레이커", () => {
    it("IEEE 802.3 CRC-32가 표준 골든 테스트 벡터('123456789' -> 0xcbf43926)와 일치한다", () => {
      const sample = new Uint8Array([0x31, 0x32, 0x33, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39]);
      expect(computeCrc32Ieee(sample)).toBe(0xcbf43926);
      expect(computeCrc32Ieee(new Uint8Array(0))).toBe(0);
    });

    it("64비트 시퀀스 및 Zero-Copy 공유 메모리 핸들을 포함한 IPC 패킷 왕복 인코딩/디코딩이 정확하다", () => {
      const packet: IpcFramePacket = {
        version: IPC_PROTOCOL_VERSION,
        kind: "frame-submit",
        vendor: "nvidia",
        sequence: BigInt(7),
        shm: {
          handleId: BigInt("0x1122334455667788"),
          byteOffset: 256,
          byteLength: 65_536,
        },
        flags: IPC_FLAGS.ZERO_COPY_SHM | IPC_FLAGS.MULTI_FRAME_GEN,
        frameBudgetUs: 8_333,
        actualLatencyUs: 2_400,
        payload: new Uint8Array([0x57, 0x36, 0x35]),
      };
      const encoded = encodeIpcFramePacket(packet);
      expect(encoded.byteLength).toBe(IPC_MIN_PACKET_BYTES + 3);
      expect(Array.from(encoded.slice(0, 4))).toEqual([0x54, 0x53, 0x4e, 0x42]);
      // 리틀 엔디언 u64 handleId 바이트 배치 검증 (Rust to_le_bytes와 동일)
      expect(Array.from(encoded.slice(16, 24))).toEqual([
        0x88, 0x77, 0x66, 0x55, 0x44, 0x33, 0x22, 0x11,
      ]);
      const decoded = decodeIpcFramePacket(encoded);
      expect(decoded).toEqual(packet);
    });

    it("IPC 패킷의 헤더·페이로드·CRC 어느 위치든 1바이트 오염을 즉시 적발한다", () => {
      const valid = encodeIpcFramePacket({
        version: IPC_PROTOCOL_VERSION,
        kind: "frame-complete",
        vendor: "apple",
        sequence: BigInt(42),
        shm: { handleId: BigInt(1001), byteOffset: 0, byteLength: 8_192 },
        flags: IPC_FLAGS.ZERO_COPY_SHM,
        frameBudgetUs: 8_333,
        actualLatencyUs: 1_900,
        payload: new Uint8Array([10, 20, 30, 40, 50]),
      });

      // 페이로드 1바이트 오염
      const badPayload = valid.slice();
      badPayload[IPC_HEADER_BYTES + 2] ^= 0x01;
      expect(() => decodeIpcFramePacket(badPayload)).toThrowError(IpcProtocolError);
      try {
        decodeIpcFramePacket(badPayload);
      } catch (err) {
        expect((err as IpcProtocolError).code).toBe("crc-mismatch");
      }

      // 헤더 지연 필드 1바이트 오염
      const badHeader = valid.slice();
      badHeader[40] ^= 0x80;
      expect(() => decodeIpcFramePacket(badHeader)).toThrowError(IpcProtocolError);

      // 트레일러 CRC 1바이트 오염
      const badTrailer = valid.slice();
      badTrailer[badTrailer.length - 1] ^= 0x04;
      expect(() => decodeIpcFramePacket(badTrailer)).toThrowError(IpcProtocolError);
    });

    it("잘린 패킷·매직 불일치·버전 불일치·잘못된 Zero-Copy 핸들 메타데이터를 거부한다", () => {
      expect(() => decodeIpcFramePacket(new Uint8Array(10))).toThrowError(IpcProtocolError);
      expect(() =>
        encodeIpcFramePacket({
          version: IPC_PROTOCOL_VERSION,
          kind: "frame-submit",
          vendor: "amd",
          sequence: BigInt(1),
          shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 4_096 },
          flags: IPC_FLAGS.ZERO_COPY_SHM,
          frameBudgetUs: 8_333,
          actualLatencyUs: 0,
          payload: new Uint8Array(0),
        }),
      ).toThrowError(IpcProtocolError);

      const good = encodeIpcFramePacket({
        version: IPC_PROTOCOL_VERSION,
        kind: "heartbeat",
        vendor: "intel",
        sequence: BigInt(1),
        shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
        flags: 0,
        frameBudgetUs: 8_333,
        actualLatencyUs: 100,
        payload: new Uint8Array(0),
      });
      const wrongVersion = good.slice();
      wrongVersion[4] = 9;
      expect(() => decodeIpcFramePacket(wrongVersion)).toThrowError(IpcProtocolError);
    });

    it("응답 시퀀스 단조성 위반(역행 또는 이전 시퀀스 재사용)을 탐지해 폴백으로 전환한다", async () => {
      let responseSeq = BigInt(1);
      const transport: NativeBridgeTransport = {
        async sendFrame(packetBytes) {
          const req = decodeIpcFramePacket(packetBytes);
          const replySeq = responseSeq;
          // 두 번째 호출에서도 시퀀스 1을 재전송하여 단조성 위반 유발
          responseSeq = BigInt(1);
          return encodeIpcFramePacket({
            ...req,
            kind: "frame-complete",
            sequence: replySeq,
          });
        },
      };

      const client = new NativeBridgeIpcClient({ transport, failureThreshold: 3 });
      const first = await client.sendPacket({
        kind: "frame-submit",
        vendor: "apple",
        shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
        flags: 0,
        frameBudgetUs: 8_333,
        actualLatencyUs: 0,
        payload: new Uint8Array(0),
      });
      expect(first.ok).toBe(true);

      const second = await client.sendPacket({
        kind: "frame-submit",
        vendor: "apple",
        shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
        flags: 0,
        frameBudgetUs: 8_333,
        actualLatencyUs: 0,
        payload: new Uint8Array(0),
      });
      expect(second.ok).toBe(false);
      if (!second.ok) {
        expect(second.reason).toBe("sequence-regression");
        expect(second.fallbackToWebGpu).toBe(true);
      }
    });

    it("IPC 타임아웃 초과 시 호출을 차단하고 안전한 WebGPU 폴백 결과를 반환한다", async () => {
      const slowTransport: NativeBridgeTransport = {
        sendFrame() {
          return new Promise<Uint8Array>(() => {
            // 의도적으로 응답하지 않아 타임아웃 가드를 검증한다.
          });
        },
      };
      const client = new NativeBridgeIpcClient({ transport: slowTransport, timeoutMs: 15 });
      const result = await client.sendPacket({
        kind: "frame-submit",
        vendor: "nvidia",
        shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
        flags: 0,
        frameBudgetUs: 8_333,
        actualLatencyUs: 0,
        payload: new Uint8Array(0),
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.reason).toBe("timeout");
        expect(result.fallbackToWebGpu).toBe(true);
      }
    });

    it("서킷브레이커가 3회 연속 실패 시 회로를 열어 즉시 우회하고, 쿨다운 후 half-open으로 복구한다", async () => {
      let clockMs = 1_000;
      let shouldFail = true;
      let transportCalls = 0;

      const flakyTransport: NativeBridgeTransport = {
        async sendFrame(packetBytes) {
          transportCalls += 1;
          if (shouldFail) {
            throw new Error("desktop-ipc-pipe-broken");
          }
          const req = decodeIpcFramePacket(packetBytes);
          return encodeIpcFramePacket({
            ...req,
            kind: "frame-complete",
            actualLatencyUs: 1_500,
          });
        },
      };

      const client = new NativeBridgeIpcClient({
        transport: flakyTransport,
        failureThreshold: 3,
        cooldownMs: 2_000,
        nowMs: () => clockMs,
      });

      const baseReq = {
        kind: "frame-submit" as const,
        vendor: "amd" as const,
        shm: { handleId: BigInt(0), byteOffset: 0, byteLength: 0 },
        flags: 0,
        frameBudgetUs: 8_333,
        actualLatencyUs: 0,
        payload: new Uint8Array(0),
      };

      // 1, 2회 실패: 아직 closed
      const r1 = await client.sendPacket(baseReq);
      const r2 = await client.sendPacket(baseReq);
      expect(r1.ok).toBe(false);
      expect(r2.ok).toBe(false);
      expect(client.getCircuitState()).toBe("closed");

      // 3회 실패: 회로 open
      const r3 = await client.sendPacket(baseReq);
      expect(r3.ok).toBe(false);
      expect(client.getCircuitState()).toBe("open");
      expect(transportCalls).toBe(3);

      // 4회 호출: open 상태이므로 transport 호출 없이 즉시 우회
      const r4 = await client.sendPacket(baseReq);
      expect(r4.ok).toBe(false);
      if (!r4.ok) {
        expect(r4.reason).toBe("circuit-open");
      }
      expect(transportCalls).toBe(3);

      // 쿨다운 경과 후 half-open → 정상 응답 시 closed 복구
      clockMs += 2_500;
      expect(client.getCircuitState()).toBe("half-open");
      shouldFail = false;
      const r5 = await client.sendPacket(baseReq);
      expect(r5.ok).toBe(true);
      expect(client.getCircuitState()).toBe("closed");
      expect(client.getDiagnostics().totalCircuitTrips).toBe(1);
    });
  });

  describe("WebGPU PSO 프리워머·LRU 캐시 및 StudioGpuNpuBridgeRuntime 통합", () => {
    it("내장 스튜디오 브러시 셰이더 전체 프리워밍 후 모든 브러시 선택에서 캐시 히트율 100% 및 0ms 끊김을 달성한다", async () => {
      const mock = createMockWebGpuDevice();
      const prewarmer = new WebGpuShaderPsoPrewarmer({ device: mock.device, maxCacheSize: 16 });
      prewarmer.enqueue(BUILTIN_STUDIO_BRUSH_SHADERS);

      const batch = await prewarmer.prewarmAll();
      expect(batch.compiledShaderIds.length).toBe(BUILTIN_STUDIO_BRUSH_SHADERS.length);
      expect(mock.compileCount).toBe(BUILTIN_STUDIO_BRUSH_SHADERS.length);

      for (const shader of BUILTIN_STUDIO_BRUSH_SHADERS) {
        const acquired = await prewarmer.acquirePipeline(shader);
        expect(acquired.cacheHit).toBe(true);
        expect(acquired.hitchMs).toBe(0);
        expect(acquired.avoidedHitchMs).toBe(shader.estimatedColdCompileMs);
      }

      const stats = prewarmer.getStats();
      expect(stats.hitRate).toBe(1);
      expect(stats.misses).toBe(0);
      expect(stats.hits).toBe(BUILTIN_STUDIO_BRUSH_SHADERS.length);
      expect(stats.totalAvoidedHitchMs).toBeGreaterThanOrEqual(1_800);
    });

    it("우선순위 스케줄러(critical -> high -> normal -> low)와 유휴 슬라이스 시간 예산 제한을 준수한다", async () => {
      let clockMs = 0;
      const mock = createMockWebGpuDevice({
        simulatedCompileCostMs: 3,
        onAdvanceClock: (delta) => {
          clockMs += delta;
        },
      });
      const prewarmer = new WebGpuShaderPsoPrewarmer({
        device: mock.device,
        nowMs: () => clockMs,
      });

      const shaders: PsoShaderDescriptor[] = [
        { ...BUILTIN_STUDIO_BRUSH_SHADERS[0], shaderId: "s-low", priority: "low" },
        { ...BUILTIN_STUDIO_BRUSH_SHADERS[1], shaderId: "s-normal", priority: "normal" },
        { ...BUILTIN_STUDIO_BRUSH_SHADERS[2], shaderId: "s-critical", priority: "critical" },
        { ...BUILTIN_STUDIO_BRUSH_SHADERS[3], shaderId: "s-high", priority: "high" },
      ];
      prewarmer.enqueue(shaders);

      // 5ms 예산 → 3ms짜리 2개(critical, high)까지만 컴파일하고 나머지 2개는 다음 유휴 슬라이스로 이월
      const slice1 = await prewarmer.prewarmBatch({ budgetMs: 5 });
      expect(slice1.compiledShaderIds).toEqual(["s-critical", "s-high"]);
      expect(slice1.remainingQueueSize).toBe(2);

      const slice2 = await prewarmer.prewarmBatch({ budgetMs: 10 });
      expect(slice2.compiledShaderIds).toEqual(["s-normal", "s-low"]);
      expect(slice2.remainingQueueSize).toBe(0);
    });

    it("LRU 캐시가 용량 초과 시 가장 오래 미사용된 PSO를 정확히 축출한다", async () => {
      const mock = createMockWebGpuDevice();
      const evictedIds: string[] = [];
      const prewarmer = new WebGpuShaderPsoPrewarmer({
        device: mock.device,
        maxCacheSize: 2,
        onEvict: (entry) => evictedIds.push(entry.shaderId),
      });

      const s1 = BUILTIN_STUDIO_BRUSH_SHADERS[0];
      const s2 = BUILTIN_STUDIO_BRUSH_SHADERS[1];
      const s3 = BUILTIN_STUDIO_BRUSH_SHADERS[2];

      await prewarmer.acquirePipeline(s1);
      await prewarmer.acquirePipeline(s2);
      // s1을 다시 접근하여 MRU로 승격 → s2가 LRU가 된다.
      await prewarmer.acquirePipeline(s1);
      await prewarmer.acquirePipeline(s3);

      expect(evictedIds).toEqual([s2.shaderId]);
      expect(prewarmer.hasCached(s1)).toBe(true);
      expect(prewarmer.hasCached(s2)).toBe(false);
      expect(prewarmer.hasCached(s3)).toBe(true);
      expect(prewarmer.getStats().evictions).toBe(1);
    });

    it("동일 셰이더에 대한 동시 컴파일 요청을 1회 GPU 컴파일로 인플라이트 중복제거한다", async () => {
      const mock = createMockWebGpuDevice();
      const prewarmer = new WebGpuShaderPsoPrewarmer({ device: mock.device });
      const target = BUILTIN_STUDIO_BRUSH_SHADERS[0];

      const [a, b, c] = await Promise.all([
        prewarmer.acquirePipeline(target),
        prewarmer.acquirePipeline(target),
        prewarmer.acquirePipeline(target),
      ]);

      expect(mock.compileCount).toBe(1);
      expect(a.entry.cacheKey).toBe(b.entry.cacheKey);
      expect(b.entry.cacheKey).toBe(c.entry.cacheKey);
      expect(prewarmer.getStats().inflightDedupCount).toBe(2);
    });

    it("WGSL 소스가 변경되면 PSO 캐시 키가 달라져 이전 캐시를 안전하게 무효화한다", () => {
      const original = BUILTIN_STUDIO_BRUSH_SHADERS[0];
      const modified: PsoShaderDescriptor = {
        ...original,
        wgslSource: `${original.wgslSource}\n// sharpness tweak`,
      };
      expect(computePsoCacheKey(original)).not.toBe(computePsoCacheKey(modified));
    });

    it("StudioGpuNpuBridgeRuntime이 정상 네이티브 경로와 3회 연속 IPC 장애 시 무중단 WebGPU 전환을 완주한다", async () => {
      let clockMs = 5_000;
      let failNative = false;
      const mock = createMockWebGpuDevice();

      const dynamicTransport: NativeBridgeTransport = {
        async sendFrame(packetBytes) {
          if (failNative) {
            throw new Error("native-gpu-device-reset");
          }
          return createEchoNativeTransport(1_420).sendFrame(packetBytes, 12);
        },
      };

      const runtime = new StudioGpuNpuBridgeRuntime({
        device: mock.device,
        transport: dynamicTransport,
        failureThreshold: 3,
        cooldownMs: 3_000,
        nowMs: () => clockMs,
      });

      const plan = await runtime.initialize(
        createBaseProbe({
          os: "macos",
          vendor: "apple",
          unifiedMemory: true,
          supportsMetal3: true,
          supportsMetalFxTemporal: true,
          supportsAppleAne: true,
        }),
      );
      expect(plan.upscaler).toBe("metalfx-temporal");

      // 정상 네이티브 경로 프레임 + 프리워밍 히트
      const nativeFrame = await runtime.dispatchFrame({
        brushShaderId: "brush-ink-sdf-aa",
        shm: { handleId: BigInt(777), byteOffset: 0, byteLength: 65_536 },
        requireNpuAssist: true,
      });
      expect(nativeFrame.executionPath).toBe("native-bridge");
      expect(nativeFrame.brushPipeline.cacheHit).toBe(true);
      expect(nativeFrame.brushPipeline.hitchMs).toBe(0);
      expect(nativeFrame.nativeLatencyUs).toBe(1_420);

      // 네이티브 IPC 3회 연속 장애 → 매 프레임이 예외 없이 WebGPU WGSL 폴백으로 무중단 렌더되며 회로가 열림
      failNative = true;
      for (let i = 0; i < 3; i += 1) {
        const degraded = await runtime.dispatchFrame({ brushShaderId: "brush-wet-impasto-km" });
        expect(degraded.executionPath).toBe("webgpu-wgsl-fallback");
        expect(degraded.brushPipeline.cacheHit).toBe(true);
        expect(degraded.fallbackUpscalerPipeline?.cacheHit).toBe(true);
      }

      const midTelemetry = runtime.getRuntimeTelemetry();
      expect(midTelemetry.activeExecutionPath).toBe("webgpu-wgsl-fallback");
      expect(midTelemetry.ipcDiagnostics?.circuitState).toBe("open");
      expect(midTelemetry.nativeFramesDispatched).toBe(1);
      expect(midTelemetry.fallbackFramesDispatched).toBe(3);

      // 쿨다운 이후 네이티브 브릿지가 복구되면 자동으로 네이티브 경로로 귀환한다
      clockMs += 3_500;
      failNative = false;
      const recovered = await runtime.dispatchFrame({ brushShaderId: "brush-ink-sdf-aa" });
      expect(recovered.executionPath).toBe("native-bridge");
      expect(recovered.circuitState).toBe("closed");
      expect(runtime.getRuntimeTelemetry().psoStats.hitRate).toBe(1);
    });
  });
});
