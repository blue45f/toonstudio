// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { StudioSupergapStatusDrawer } from "./StudioSupergapStatusDrawer";
import type {
  HardwareBridgeStatus,
  StudioSupergapHubSnapshot,
  StudioSupergapRuntimeHub,
} from "./studio-supergap-runtime-hub";

vi.mock("./studio-supergap-runtime-hub", () => ({ createStudioSupergapRuntimeHub: vi.fn() }));
afterEach(cleanup);

const browserExample: HardwareBridgeStatus = {
  connectionMode: "browser-webgpu-fallback",
  connected: false,
  webgpuFallbackReady: true,
  vendor: "webgpu-fallback",
  deviceName: "WebGPU sample device",
  graphicsBackend: "WebGPU WGSL",
  upscaler: "sample",
  lowLatencyStack: "sample",
  npuBackend: "sample",
  zeroCopyEnabled: false,
  prewarmedPsoCount: 12,
  loopbackBaseUrl: null,
  fallbackReason: "No desktop daemon",
  checkedAtIso: "2026-11-28T02:00:00Z",
  latencyMs: 9.5,
};

function setup() {
  let snapshot: StudioSupergapHubSnapshot = {
    hardwareBridge: null,
    isBootstrapping: false,
    isRunningDiagnostic: false,
    activeActionSubsystemId: null,
    tactileReliefMode: "off",
    registeredSubsystems: [],
    lastResultsById: {},
    lastReport: null,
    lastErrorKo: null,
  };
  const listeners = new Set<(value: StudioSupergapHubSnapshot) => void>();
  const hub: StudioSupergapRuntimeHub = {
    bootstrapHardwareBridge: vi.fn().mockResolvedValue(browserExample),
    runDiagnosticSelfCheck: vi.fn().mockResolvedValue(undefined),
    executeSubsystemAction: vi.fn().mockResolvedValue(undefined),
    cycleTactileReliefMode: vi.fn().mockResolvedValue("off"),
    refreshTactileReliefMode: vi.fn().mockResolvedValue("off"),
    getRegisteredSubsystems: () => [],
    registerExtensionSubsystem: vi.fn(),
    unregisterExtensionSubsystem: vi.fn(),
    getSnapshot: () => snapshot,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
  const publish = (update: Partial<StudioSupergapHubSnapshot>) => {
    snapshot = { ...snapshot, ...update };
    act(() => { for (const listener of listeners) listener(snapshot); });
  };
  render(<StudioSupergapStatusDrawer hub={hub} autoBootstrap={false} />);
  return { hub, publish };
}

describe("에디터 엔진 상태", () => {
  it("수집 전, 확인 중, 예제 장치를 실제 연결과 구분한다", () => {
    const { hub, publish } = setup();
    const status = screen.getByTestId("supergap-connection-pill");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("네이티브 연결 확인 전");
    expect(hub.bootstrapHardwareBridge).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "네이티브 연결 확인" }));
    expect(hub.bootstrapHardwareBridge).toHaveBeenCalledOnce();
    publish({ isBootstrapping: true });
    expect(status.textContent).toBe("네이티브 연결 확인 중");
    publish({ isBootstrapping: false, hardwareBridge: browserExample });
    expect(status.textContent).toBe("네이티브 연결 없음");
    expect(screen.getByTestId("supergap-hardware-summary").textContent).not.toContain("WebGPU WGSL");
    const metrics = screen.getByTestId("supergap-bridge-metrics");
    expect(metrics.textContent).toContain("실제 GPU 성능 미측정");
    expect(metrics.textContent).not.toContain("9.5ms");
    fireEvent.click(screen.getByRole("button", { name: "예제 진단 실행" }));
    expect(hub.runDiagnosticSelfCheck).toHaveBeenCalledOnce();
  });

  it("분류에 아직 없는 엔진도 기타 점검에서 한 번만 표시하고 실행한다", () => {
    const { hub, publish } = setup();
    publish({
      registeredSubsystems: [{
        id: "future-sample",
        waveLabel: "Future",
        titleKo: "새 엔진",
        capabilitySummaryKo: "예시 데이터로 확인할 수 있는 엔진",
        isExtension: true,
      }],
    });

    const disclosure = screen.getByTestId("supergap-subsystems-disclosure") as HTMLDetailsElement;
    disclosure.open = true;
    const group = disclosure.querySelector<HTMLDetailsElement>('[data-runtime-diagnostic-group="기타 점검"]');
    if (!group) throw new Error("기타 점검 그룹을 찾지 못했습니다");
    group.open = true;
    expect(screen.getAllByTestId("supergap-subsystem-future-sample")).toHaveLength(1);
    expect(within(group).getByText("점검 전")).toBeTruthy();
    fireEvent.click(within(group).getByRole("button", { name: "새 엔진 예시 점검" }));
    expect(hub.executeSubsystemAction).toHaveBeenCalledOnce();
    expect(hub.executeSubsystemAction).toHaveBeenCalledWith("future-sample");
  });

  it("실제 데스크톱 연결 응답이 있으면 장치 이름과 연결 확인 시간을 표시한다", () => {
    const { publish } = setup();
    publish({
      hardwareBridge: {
        ...browserExample,
        connectionMode: "desktop-native-loopback",
        connected: true,
        deviceName: "Actual desktop",
        graphicsBackend: "Metal",
        latencyMs: 3.2,
      },
    });
    expect(screen.getByTestId("supergap-connection-pill").textContent).toBe("데스크톱 앱 연결됨");
    expect(screen.getByTestId("supergap-hardware-summary").textContent).toContain("Actual desktop · Metal");
    expect(screen.getByTestId("supergap-bridge-metrics").textContent).toContain("장치 연결 확인 3.2ms");
  });
});
