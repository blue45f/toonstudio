// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { resetStudioTactileReliefRuntimeForTests } from "../brush/studio-tactile-physical-relief-runtime";
import {
  IPC_FLAGS,
  IPC_PROTOCOL_VERSION,
  NativeBridgeIpcClient,
  decodeIpcFramePacket,
  encodeIpcFramePacket,
} from "../wasm64-wave65-native-gpu-npu-bridge";

import {
  DEFAULT_DESKTOP_LOOPBACK_PORT,
  DesktopLoopbackBridgeTransport,
  LOOPBACK_HEALTH_ENDPOINT_PATH,
  LOOPBACK_IPC_ENDPOINT_PATH,
  LOOPBACK_PROBE_ENDPOINT_PATH,
  LoopbackBridgeSecurityError,
  LoopbackBridgeTransportError,
  StudioSupergapStatusDrawer,
  assertValidLoopbackBaseUrl,
  createFullStudioSupergapRuntimeHub,
  createStudioSupergapRuntimeHub,
  probeDesktopLoopbackBridge,
} from "./index";
import { StudioSupergapRuntimeHubLazyHost } from "../runtime-leaves/studio-supergap-runtime-hub-lazy";
import {
  closeStudioSupergapRuntimeHub,
  toggleStudioSupergapRuntimeHub,
} from "../runtime-leaves/studio-supergap-runtime-hub-lazy-bridge";

afterEach(() => {
  cleanup();
  resetStudioTactileReliefRuntimeForTests();
});

function createMockBinaryResponse(bytes: Uint8Array, status = 200): Response {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  return {
    ok: status >= 200 && status < 300,
    status,
    arrayBuffer: async () => copy.buffer,
    json: async () => ({}),
  } as unknown as Response;
}

function createMockJsonResponse(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
    arrayBuffer: async () => new ArrayBuffer(0),
  } as unknown as Response;
}

function createConnectedLoopbackFetchMock(expectedToken: string): typeof fetch {
  return vi.fn(async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const headers = (init?.headers ?? {}) as Record<string, string>;

    if (url.endsWith(LOOPBACK_HEALTH_ENDPOINT_PATH)) {
      if (headers.Authorization !== `Bearer ${expectedToken}`) {
        return createMockJsonResponse({ error: "unauthorized" }, 401);
      }
      return createMockJsonResponse({
        status: "ok",
        daemonVersion: "1.2.0",
        protocolVersion: IPC_PROTOCOL_VERSION,
        vendor: "apple",
        backend: "metal3",
        upscaler: "metalfx-temporal",
        lowLatency: "apple-metal-direct-present",
        npuBackend: "apple-coreml-ane",
        deviceName: "Apple M4 Max Studio",
        zeroCopyEnabled: true,
        uptimeMs: 12_345,
      });
    }

    if (url.endsWith(LOOPBACK_PROBE_ENDPOINT_PATH)) {
      return createMockJsonResponse({
        vendor: "apple",
        deviceName: "Apple M4 Max Studio",
        graphicsBackend: "metal3",
        upscaler: "metalfx-temporal",
        npuBackend: "apple-coreml-ane",
        zeroCopyEnabled: true,
        probe: {
          os: "macos",
          vendor: "apple",
          deviceName: "Apple M4 Max Studio",
          driverVersion: "Metal-3.2",
          vramMb: 36_864,
          unifiedMemory: true,
          targetFps: 120,
          allowMultiFrameGen: false,
          supportsMetal3: true,
          supportsMetalFxTemporal: true,
          supportsAppleAne: true,
        },
      });
    }

    if (url.endsWith(LOOPBACK_IPC_ENDPOINT_PATH)) {
      expect(headers.Authorization).toBe(`Bearer ${expectedToken}`);
      expect(headers["Content-Type"]).toBe("application/octet-stream");
      const rawBody = init?.body;
      expect(rawBody).toBeInstanceOf(Uint8Array);
      const reqPacket = decodeIpcFramePacket(rawBody as Uint8Array);
      const replyBytes = encodeIpcFramePacket({
        version: IPC_PROTOCOL_VERSION,
        kind: reqPacket.kind === "frame-submit" ? "frame-complete" : "heartbeat",
        vendor: reqPacket.vendor,
        sequence: reqPacket.sequence,
        shm: reqPacket.shm,
        flags: reqPacket.flags,
        frameBudgetUs: reqPacket.frameBudgetUs,
        actualLatencyUs: 420,
        payload: reqPacket.payload,
      });
      return createMockBinaryResponse(replyBytes, 200);
    }

    return createMockJsonResponse({ error: "not-found" }, 404);
  }) as unknown as typeof fetch;
}

describe("desktop-loopback-bridge-transport 보안 및 IPC 왕복", () => {
  it("127.0.0.1 및 localhost http URL을 정규화해 허용한다", () => {
    expect(assertValidLoopbackBaseUrl("http://127.0.0.1:48123")).toBe("http://127.0.0.1:48123");
    expect(assertValidLoopbackBaseUrl("http://localhost:48123/")).toBe("http://localhost:48123");
    expect(assertValidLoopbackBaseUrl("HTTP://LOCALHOST:9000")).toBe("http://localhost:9000");
  });

  it("외부 도메인(https://evil.com) 및 비루프백 IP(192.168.1.5)를 Fail-Closed 차단한다", () => {
    expect(() => assertValidLoopbackBaseUrl("https://evil.com")).toThrow(LoopbackBridgeSecurityError);
    expect(() => assertValidLoopbackBaseUrl("http://evil.com:48123")).toThrow(
      LoopbackBridgeSecurityError,
    );
    expect(() => assertValidLoopbackBaseUrl("http://192.168.1.5:48123")).toThrow(
      LoopbackBridgeSecurityError,
    );
    expect(() => assertValidLoopbackBaseUrl("http://10.0.0.2:48123")).toThrow(
      LoopbackBridgeSecurityError,
    );
  });

  it("HTTPS 프로토콜·URL 내 자격증명·잘못된 URL을 차단한다", () => {
    expect(() => assertValidLoopbackBaseUrl("https://127.0.0.1:48123")).toThrow(
      LoopbackBridgeSecurityError,
    );
    const credentialedUrl = ["http://", "demo-user", ":", "demo-pass", "@127.0.0.1:48123"].join("");
    expect(() => assertValidLoopbackBaseUrl(credentialedUrl)).toThrow(
      LoopbackBridgeSecurityError,
    );
    expect(() => assertValidLoopbackBaseUrl("not-a-valid-url")).toThrow(
      LoopbackBridgeSecurityError,
    );
    expect(() => new DesktopLoopbackBridgeTransport({ port: 70_000 })).toThrow(
      LoopbackBridgeSecurityError,
    );
  });

  it("비루프백 URL로 probeDesktopLoopbackBridge를 호출해도 fetch 없이 즉시 보안 오류를 던진다", async () => {
    const fetchSpy = vi.fn();
    await expect(
      probeDesktopLoopbackBridge({
        baseUrl: "https://evil.com",
        token: "top-secret-local-token",
        fetchImpl: fetchSpy as unknown as typeof fetch,
      }),
    ).rejects.toThrow(LoopbackBridgeSecurityError);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("Wave 65 TSNB 바이너리 프레임을 Authorization 헤더와 함께 송수신하고 CRC-32를 검증한다", async () => {
    const token = "wave72-local-token";
    const mockFetch = createConnectedLoopbackFetchMock(token);
    const transport = new DesktopLoopbackBridgeTransport({
      baseUrl: `http://127.0.0.1:${DEFAULT_DESKTOP_LOOPBACK_PORT}`,
      token,
      fetchImpl: mockFetch,
    });
    const ipcClient = new NativeBridgeIpcClient({
      transport,
      timeoutMs: 500,
    });

    const payload = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const result = await ipcClient.sendPacket({
      kind: "frame-submit",
      vendor: "apple",
      shm: { handleId: BigInt(7), byteOffset: 0, byteLength: 4096 },
      flags: IPC_FLAGS.ZERO_COPY_SHM | IPC_FLAGS.LOW_LATENCY_MARK,
      frameBudgetUs: 8_333,
      actualLatencyUs: 0,
      payload,
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.response.kind).toBe("frame-complete");
      expect(result.response.actualLatencyUs).toBe(420);
      expect(Array.from(result.response.payload)).toEqual([1, 2, 3, 4, 5, 6]);
    }
  });

  it("데몬 미응답(ECONNREFUSED) 시 예외 없이 webgpuFallbackReady=true 폴백 결과를 반환한다", async () => {
    const unreachableFetch = vi.fn(async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:48123");
    }) as unknown as typeof fetch;

    const result = await probeDesktopLoopbackBridge({
      host: "127.0.0.1",
      port: 48123,
      fetchImpl: unreachableFetch,
    });

    expect(result.connected).toBe(false);
    if (!result.connected) {
      expect(result.webgpuFallbackReady).toBe(true);
      expect(result.fallbackReason).toContain("ECONNREFUSED");
    }
  });

  it("데몬이 살아 있으면 connected=true와 health/probe/transport를 반환한다", async () => {
    const token = "alive-token";
    const result = await probeDesktopLoopbackBridge({
      baseUrl: "http://localhost:48123",
      token,
      fetchImpl: createConnectedLoopbackFetchMock(token),
    });

    expect(result.connected).toBe(true);
    if (result.connected) {
      expect(result.health.status).toBe("ok");
      expect(result.health.vendor).toBe("apple");
      expect(result.probe?.deviceName).toBe("Apple M4 Max Studio");
    }
  });

  it("HTTP 500 오류 응답 시 LoopbackBridgeTransportError(http-error)를 던진다", async () => {
    const failFetch = vi.fn(async () => createMockJsonResponse({}, 500)) as unknown as typeof fetch;
    const transport = new DesktopLoopbackBridgeTransport({
      baseUrl: "http://127.0.0.1:48123",
      fetchImpl: failFetch,
    });

    await expect(transport.sendFrame(new Uint8Array([1, 2, 3]), 300)).rejects.toMatchObject({
      name: "LoopbackBridgeTransportError",
      code: "http-error",
      status: 500,
    });
  });

  it("AbortSignal 타임아웃 발생 시 LoopbackBridgeTransportError(timeout)로 변환한다", async () => {
    const slowFetch = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("The operation was aborted.");
          err.name = "AbortError";
          reject(err);
        });
      });
    }) as unknown as typeof fetch;

    const transport = new DesktopLoopbackBridgeTransport({
      baseUrl: "http://127.0.0.1:48123",
      timeoutMs: 50,
      fetchImpl: slowFetch,
    });

    await expect(transport.sendFrame(new Uint8Array([1, 2, 3]), 20)).rejects.toBeInstanceOf(
      LoopbackBridgeTransportError,
    );
  });
});

describe("StudioSupergapRuntimeHub 통합 실행 및 확장성", () => {
  const unreachableFetch = vi.fn(async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  it("내장 초격차 서브시스템 8종이 기본 등록된다", () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    const list = hub.getRegisteredSubsystems();
    expect(list.length).toBeGreaterThanOrEqual(8);
    expect(list.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "desktopNativeGpuNpuBridge",
        "multiVendorGpuNpuHal",
        "fastWasm64Kernels",
        "tactilePhysicalRelief",
        "cadShaperPro3d",
        "neuralBrushAndProvenance",
        "slangSeeThroughMangaNinja",
        "vectorSelfHealLanMeshErgo",
      ]),
    );
  });

  it("데몬 미연결 시 bootstrapHardwareBridge가 WebGPU PSO 프리워머 + Wave 63 HAL 폴백으로 초기화된다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    const bridge = await hub.bootstrapHardwareBridge();

    expect(bridge.connected).toBe(false);
    expect(bridge.connectionMode).toBe("browser-webgpu-fallback");
    expect(bridge.webgpuFallbackReady).toBe(true);
    expect(bridge.prewarmedPsoCount).toBeGreaterThanOrEqual(6);
    expect(bridge.graphicsBackend).toBe("webgpu-wgsl");
  });

  it("데스크톱 루프백 데몬 연결 시 Apple Metal 3 / MetalFX / ANE 네이티브 상태로 부트스트랩한다", async () => {
    const token = "apple-studio-token";
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: {
        baseUrl: "http://127.0.0.1:48123",
        token,
        fetchImpl: createConnectedLoopbackFetchMock(token),
      },
    });
    const bridge = await hub.bootstrapHardwareBridge();

    expect(bridge.connected).toBe(true);
    expect(bridge.connectionMode).toBe("desktop-native-loopback");
    expect(bridge.vendor).toBe("apple");
    expect(bridge.graphicsBackend).toBe("metal3");
    expect(bridge.upscaler).toBe("metalfx-temporal");
    expect(bridge.npuBackend).toBe("apple-coreml-ane");
    expect(bridge.zeroCopyEnabled).toBe(true);
  });

  it("runDiagnosticSelfCheck가 실제 Wave 54·55·62·63·64·65·66·67 모듈을 오류 0건으로 끝까지 실행한다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    const report = await hub.runDiagnosticSelfCheck();

    expect(report.allHealthy).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.subsystems.length).toBeGreaterThanOrEqual(8);
    expect(report.liveConnectedCount + report.browserFallbackCount).toBe(report.subsystems.length);

    const byId = new Map(report.subsystems.map((item) => [item.id, item]));
    expect(byId.get("cadShaperPro3d")?.metrics.watertight).toBe(true);
    expect(byId.get("cadShaperPro3d")?.metrics.nonManifoldEdges).toBe(0);
    expect(byId.get("neuralBrushAndProvenance")?.metrics.merkleProofValid).toBe(true);
    expect(byId.get("slangSeeThroughMangaNinja")?.metrics.parityPassed).toBe(true);
    expect(byId.get("slangSeeThroughMangaNinja")?.metrics.leakAuditPassed).toBe(true);
    expect(byId.get("vectorSelfHealLanMeshErgo")?.metrics.losslessRecoveredTiles).toBe(1);
    expect(byId.get("vectorSelfHealLanMeshErgo")?.metrics.ergonomicNonMedical).toBe(true);
  });

  it("네이티브 루프백 연결 상태에서 Wave 65 진단이 실제 TSNB IPC 왕복을 성공시킨다", async () => {
    const token = "native-roundtrip-token";
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: {
        baseUrl: "http://127.0.0.1:48123",
        token,
        fetchImpl: createConnectedLoopbackFetchMock(token),
      },
    });
    await hub.bootstrapHardwareBridge();
    const res = await hub.executeSubsystemAction("desktopNativeGpuNpuBridge");

    expect(res.status).toBe("live-connected");
    expect(res.metrics.liveRoundTripOk).toBe(true);
    expect(res.metrics.crcVerified).toBe(true);
  });

  it("executeSubsystemAction으로 개별 Wave 모듈(54·62·63)을 온디맨드 실행하고 지연시간을 기록한다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });

    const w54 = await hub.executeSubsystemAction("fastWasm64Kernels");
    expect(w54.metrics.edtProcessedPixels).toBeGreaterThan(0);
    expect(w54.metrics.bc1PackedBytes).toBeGreaterThan(0);

    const w62 = await hub.executeSubsystemAction("tactilePhysicalRelief");
    expect(w62.status).toBe("live-connected");
    expect(w62.metrics.touchedReliefPixels).toBeGreaterThan(0);
    expect(w62.metrics.paintedPixelsInBuffer).toBeGreaterThan(0);

    const w63 = await hub.executeSubsystemAction("multiVendorGpuNpuHal");
    expect(w63.metrics.dagTaskCount).toBeGreaterThan(0);
  });

  it("미등록 서브시스템 실행 시 명확한 한국어 오류를 던진다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    await expect(hub.executeSubsystemAction("non-existent-wave")).rejects.toThrow(
      "등록되지 않은 초격차 런타임 서브시스템",
    );
  });

  it("registerExtensionSubsystem 슬롯으로 Wave 68·69·70 확장을 무중단 플러그인 등록·실행·해제한다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });

    hub.registerExtensionSubsystem({
      id: "wave68ShallowWaterFluid",
      waveLabel: "Wave 68",
      titleKo: "천수 방정식 수채 유체 엔진",
      capabilitySummaryKo: "실시간 모세관 확산 · 건조 엣지 시뮬레이션",
      async execute(ctx) {
        return {
          status: "live-connected",
          summaryKo: `천수 유체 커널 실행 완료(grid=${String(ctx.payload?.grid ?? 64)})`,
          metrics: { cflStable: true, grid: Number(ctx.payload?.grid ?? 64) },
        };
      },
    });

    hub.registerExtensionSubsystem({
      id: "wave69MotionToon60fps",
      waveLabel: "Wave 69",
      titleKo: "60fps 모션-툰 인터폴레이터",
      capabilitySummaryKo: "패널 간 2.5D 패럴랙스 · 자동 중간 프레임",
      async execute() {
        return {
          status: "live-connected",
          summaryKo: "60fps 모션-툰 프레임 예산 내 동작",
          metrics: { targetFps: 60 },
        };
      },
    });

    hub.registerExtensionSubsystem({
      id: "wave70NeuralDistillVault",
      waveLabel: "Wave 70",
      titleKo: "뉴럴 증류 · 적응 집중 · Merkle-CRDT 볼트",
      capabilitySummaryKo: "온디바이스 스타일 증류 · 암호화 분산 원고 저장소",
      async execute() {
        return {
          status: "live-connected",
          summaryKo: "Merkle-CRDT 볼트 무결성 확인",
          metrics: { vaultSealed: true },
        };
      },
    });

    expect(hub.getRegisteredSubsystems().length).toBe(11);
    const w68Result = await hub.executeSubsystemAction("wave68ShallowWaterFluid", { grid: 128 });
    expect(w68Result.status).toBe("live-connected");
    expect(w68Result.isExtension).toBe(true);
    expect(w68Result.metrics.grid).toBe(128);

    const report = await hub.runDiagnosticSelfCheck();
    expect(report.subsystems.length).toBe(11);
    expect(report.allHealthy).toBe(true);

    expect(hub.unregisterExtensionSubsystem("wave68ShallowWaterFluid")).toBe(true);
    expect(hub.getRegisteredSubsystems().length).toBe(10);
  });

  it("내장 서브시스템 ID를 확장 슬롯으로 덮어쓰려 하면 오류로 방어한다", () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    expect(() =>
      hub.registerExtensionSubsystem({
        id: "cadShaperPro3d",
        waveLabel: "Wave 99",
        titleKo: "중복 테스트",
        capabilitySummaryKo: "중복 금지",
        async execute() {
          return { status: "live-connected", summaryKo: "nope" };
        },
      }),
    ).toThrow("덮어쓸 수 없습니다");
  });

  it("subscribe가 상태 변화마다 최신 스냅샷을 알리고 구독 해제를 지원한다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    const listener = vi.fn();
    const unsubscribe = hub.subscribe(listener);

    await hub.cycleTactileReliefMode();
    expect(listener).toHaveBeenCalled();
    expect(hub.getSnapshot().tactileReliefMode).toBe("sculpted");

    const countBeforeUnsub = listener.mock.calls.length;
    unsubscribe();
    await hub.cycleTactileReliefMode();
    expect(listener.mock.calls.length).toBe(countBeforeUnsub);
    expect(hub.getSnapshot().tactileReliefMode).toBe("vivid");
  });
});

describe("StudioSupergapStatusDrawer React UI 상호작용 및 접근성", () => {
  const unreachableFetch = vi.fn(async () => {
    throw new Error("ECONNREFUSED");
  }) as unknown as typeof fetch;

  it("브라우저 폴백 모드에서 연결 배지·접근성 region·44px 터치 타깃을 렌더링한다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });

    render(createElement(StudioSupergapStatusDrawer, { hub, autoBootstrap: true }));

    const region = screen.getByRole("region", { name: "초격차 런타임 엔진 허브" });
    expect(region).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByTestId("supergap-connection-pill").textContent).toContain(
        "웹GPU 브라우저 모드 (자동 폴백)",
      );
    });

    const reprobeBtn = screen.getByTestId("supergap-reprobe-btn");
    expect(reprobeBtn.className).toContain("min-h-11");
    expect(reprobeBtn.className).not.toContain("transition-all");
  });

  it("네이티브 루프백 연결 시 데스크톱 네이티브 GPU/NPU 연결됨 배지와 Apple Metal 정보를 표시한다", async () => {
    const token = "drawer-apple-token";
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: {
        baseUrl: "http://127.0.0.1:48123",
        token,
        fetchImpl: createConnectedLoopbackFetchMock(token),
      },
    });

    render(createElement(StudioSupergapStatusDrawer, { hub, autoBootstrap: true }));

    await waitFor(() => {
      expect(screen.getByTestId("supergap-connection-pill").textContent).toContain(
        "데스크톱 네이티브 GPU/NPU 연결됨",
      );
    });
    expect(screen.getByTestId("supergap-hardware-summary").textContent).toContain("metal3");
    expect(screen.getByTestId("supergap-hardware-summary").textContent).toContain(
      "metalfx-temporal",
    );
  });

  it("전체 엔진 실시간 점검 버튼과 실물 입체 브러시 상태 버튼이 실제 상태를 갱신한다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });

    render(
      createElement(StudioSupergapStatusDrawer, {
        hub,
        autoBootstrap: false,
        defaultExpanded: true,
      }),
    );

    const tactileBtn = screen.getByTestId("supergap-tactile-btn");
    fireEvent.click(tactileBtn);
    await waitFor(() => {
      expect(tactileBtn.textContent).toContain("입체");
    });

    const diagBtn = screen.getByTestId("supergap-diagnostic-btn");
    fireEvent.click(diagBtn);

    await waitFor(() => {
      expect(screen.getByTestId("supergap-status-cadShaperPro3d").textContent).toBe("실시간 연결");
    });
    expect(screen.getByTestId("supergap-bridge-metrics").textContent).toContain("8/8 정상");
  });

  it("개별 서브시스템 1-클릭 점검 버튼과 닫기 콜백이 정상 동작한다", async () => {
    const hub = createStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    const onClose = vi.fn();

    render(
      createElement(StudioSupergapStatusDrawer, {
        hub,
        autoBootstrap: false,
        defaultExpanded: true,
        onClose,
      }),
    );

    fireEvent.click(screen.getByTestId("supergap-run-neuralBrushAndProvenance"));
    await waitFor(() => {
      expect(screen.getByTestId("supergap-status-neuralBrushAndProvenance").textContent).toBe(
        "실시간 연결",
      );
    });

    fireEvent.click(screen.getByRole("button", { name: "초격차 런타임 허브 닫기" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("createFullStudioSupergapRuntimeHub가 Wave 68~116 실전 확장까지 55종 전체를 오류 0건으로 진단한다", async () => {
    const hub = createFullStudioSupergapRuntimeHub({
      loopbackConfig: { fetchImpl: unreachableFetch },
    });
    expect(hub.getRegisteredSubsystems().length).toBe(55);

    const report = await hub.runDiagnosticSelfCheck();
    expect(report.allHealthy).toBe(true);
    expect(report.errorCount).toBe(0);
    expect(report.subsystems.length).toBe(55);

    const byId = new Map(report.subsystems.map((item) => [item.id, item]));
    expect(byId.get("wave68ShallowWaterFluid")?.status).toBe("live-connected");
    expect(byId.get("wave68ShallowWaterFluid")?.metrics.withinTwoPercentBudget).toBe(true);
    expect(byId.get("wave68ShallowWaterFluid")?.metrics.wgslAllPassed).toBe(true);
    expect(byId.get("wave69MotionToon60fps")?.status).toBe("live-connected");
    expect(byId.get("wave69MotionToon60fps")?.metrics.zeroBlackBorderSafe).toBe(true);
    expect(byId.get("wave70NeuralDistillVault")?.status).toBe("live-connected");
    expect(byId.get("wave70NeuralDistillVault")?.metrics.isMedicalOrBiometric).toBe(false);
    expect(byId.get("wave70NeuralDistillVault")?.metrics.merkleLedgerValid).toBe(true);
    expect(byId.get("wave73TemporalInkDrying")?.status).toBe("live-connected");
    expect(byId.get("wave74RelightingOpticalBrush")?.status).toBe("live-connected");
    expect(byId.get("wave75PoseToFoldMultiview")?.status).toBe("live-connected");
    expect(byId.get("wave76PrintRecompositionCmyk")?.status).toBe("live-connected");
    expect(byId.get("wave77MultilingualSfxCleanplate")?.status).toBe("live-connected");
    expect(byId.get("wave78CompanionTabletLan")?.status).toBe("live-connected");
    expect(byId.get("wave79AssistantCheckoutSettlement")?.status).toBe("live-connected");
    expect(byId.get("wave80OnDeviceContinuityGuardrail")?.status).toBe("live-connected");
    expect(byId.get("wave81SketchToParametric3d")?.status).toBe("live-connected");
    expect(byId.get("wave82AudioDrivenPacing")?.status).toBe("live-connected");
    expect(byId.get("wave83CvdMobileReadability")?.status).toBe("live-connected");
    expect(byId.get("wave84DeltaTileOfflineSync")?.status).toBe("live-connected");
    expect(byId.get("wave85IpMerchDiecutPack")?.status).toBe("live-connected");
    expect(byId.get("wave86SaliencyPacingTwin")?.status).toBe("live-connected");
    expect(byId.get("wave87CausalTimeTravelCanvas")?.status).toBe("live-connected");
    expect(byId.get("wave88ReactiveTstudioLive")?.status).toBe("live-connected");
    expect(byId.get("wave89MultiverseCanonCompiler")?.status).toBe("live-connected");
    expect(byId.get("wave90CurvilinearPerspectiveBrush")?.status).toBe("live-connected");
    expect(byId.get("wave91KinematicPenTwinCleanup")?.status).toBe("live-connected");
    expect(byId.get("wave92GeoVariantComplianceShield")?.status).toBe("live-connected");
    expect(byId.get("wave93FederatedStudioStyleDelta")?.status).toBe("live-connected");
    expect(byId.get("wave94OvernightFinishingQa")?.status).toBe("live-connected");
    expect(byId.get("wave95SpatialParallaxTheater")?.status).toBe("live-connected");
    expect(byId.get("wave96ScriptToCameraBlocking")?.status).toBe("live-connected");
    expect(byId.get("wave97VoiceLipsyncCutRig")?.status).toBe("live-connected");
    expect(byId.get("wave98CentennialC2paArchive")?.status).toBe("live-connected");
    expect(byId.get("wave99PredictiveInkLatencyZero")?.status).toBe("live-connected");
    expect(byId.get("wave100AutonomousStudioDirector")?.status).toBe("live-connected");
    expect(byId.get("wave101ScreentoneAntiMoire")?.status).toBe("live-connected");
    expect(byId.get("wave102EmotionalColorScript")?.status).toBe("live-connected");
    expect(byId.get("wave103PerspectiveCrowdScatter")?.status).toBe("live-connected");
    expect(byId.get("wave104BalloonFluidTypography")?.status).toBe("live-connected");
    expect(byId.get("wave105ActionSpeedlineImpactFx")?.status).toBe("live-connected");
    expect(byId.get("wave106CharacterTurnaroundRig")?.status).toBe("live-connected");
    expect(byId.get("wave107MultilingualFontTategaki")?.status).toBe("live-connected");
    expect(byId.get("wave108VerticalScrollRhythm")?.status).toBe("live-connected");
    expect(byId.get("wave109SmartThumbnailPackager")?.status).toBe("live-connected");
    expect(byId.get("wave110LocalizationExpansionBridge")?.status).toBe("live-connected");
    expect(byId.get("wave111SilhouetteNormalAoRim")?.status).toBe("live-connected");
    expect(byId.get("wave112HanjiSumieCapillaryInk")?.status).toBe("live-connected");
    expect(byId.get("wave113BackgroundNprLineAndGi")?.status).toBe("live-connected");
    expect(byId.get("wave114KoreanSfxFoleyHaptic")?.status).toBe("live-connected");
    expect(byId.get("wave115StoryboardFlowReflow")?.status).toBe("live-connected");
    expect(byId.get("wave116ArcLengthPatternRibbon")?.status).toBe("live-connected");
  }, 20_000);

  it("StudioSupergapRuntimeHubLazyHost가 열기 전 0 DOM 유지 후 토글 시 11종 허브 드로어를 지연 마운트한다", async () => {
    closeStudioSupergapRuntimeHub();
    render(createElement(StudioSupergapRuntimeHubLazyHost));
    expect(screen.queryByTestId("studio-supergap-status-drawer")).toBeNull();

    toggleStudioSupergapRuntimeHub();
    await waitFor(() => {
      expect(screen.getByTestId("studio-supergap-status-drawer")).toBeTruthy();
    });

    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByTestId("studio-supergap-status-drawer")).toBeNull();
    });
  });
});
