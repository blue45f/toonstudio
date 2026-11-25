// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_SPATIAL_RIG_INPUT, DEFAULT_WEARABLE_CONTROL_STATE, SPATIAL_WEARABLE_SCHEMA_ID,
  StudioSpatialWearablePanel, computeMultiDeviceTopology, exportSpatialWearableSessionJson,
  parseSpatialWearableSessionJson, resolveWearableDialAction, type SpatialWearableSessionSnapshot,
} from "./index";

function snapshot(): SpatialWearableSessionSnapshot {
  return { activeDeviceIds: ["mac-studio-primary"], syncTransportMode: "lan-webrtc", availableLinkBandwidthMbps: 150,
    spatialRigInput: { ...DEFAULT_SPATIAL_RIG_INPUT }, wearableMode: "brush-size", wearableState: { ...DEFAULT_WEARABLE_CONTROL_STATE },
    elapsedWorkMinutes: 32, breakIntervalMinutes: 50, hapticNudgeEnabled: true,
    arHudOptions: { presetId: "perspective-grid-minimal", perspectiveGridType: "2-point", gridOpacityPct: 18,
      showDeadlineTimer: true, deadlineRemainingMinutes: 45, peripheralCorner: "top-right" } };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("공간·웨어러블 계산과 JSON 신뢰 경계", () => {
  it("유효한 소수 상한은 기존처럼 정수부로 유지한다", () => {
    const result = resolveWearableDialAction({ mode: "timeline-scrub", gesture: "crown-rotate", detentDelta: 0,
      state: { ...DEFAULT_WEARABLE_CONTROL_STATE, timelineMaxFrames: 120.9, historyMaxIndex: 40.9 } });
    expect(result.nextState.timelineMaxFrames).toBe(120);
    expect(result.nextState.historyMaxIndex).toBe(40);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1e308])("웨어러블 최대값 %s에서도 유한 상태를 반환한다", bad => {
    const result = resolveWearableDialAction({ mode: "timeline-scrub", gesture: "crown-rotate", detentDelta: 1,
      state: { ...DEFAULT_WEARABLE_CONTROL_STATE, timelineMaxFrames: bad, historyMaxIndex: bad } });
    expect(Object.values(result.nextState).every(Number.isFinite)).toBe(true);
    expect(result.nextState.timelineMaxFrames).toBeLessThanOrEqual(3600);
    expect(result.nextState.historyMaxIndex).toBeLessThanOrEqual(200);
  });
  it("큰 양의 detent가 overflow로 타임라인 시작점으로 되돌아가지 않는다", () => {
    const result = resolveWearableDialAction({ mode: "timeline-scrub", gesture: "crown-rotate", detentDelta: 1e308,
      state: DEFAULT_WEARABLE_CONTROL_STATE });
    expect(result.nextValue).toBe(DEFAULT_WEARABLE_CONTROL_STATE.timelineMaxFrames);
  });
  it("중복 기기를 정규화로 숨기거나 무제한 순회하지 않는다", () => {
    expect(() => computeMultiDeviceTopology({ activeDeviceIds: ["mac-studio-primary", "mac-studio-primary"] })).toThrow();
    expect(() => computeMultiDeviceTopology({ activeDeviceIds: Array.from({ length: 7 }, () => "mac-studio-primary" as const) })).toThrow();
  });
  it("잘못된 JSON 수치·enum·boolean을 기본값으로 교체해 성공 처리하지 않는다", () => {
    const config = snapshot();
    const cases = [
      { ...config, availableLinkBandwidthMbps: "fast" },
      { ...config, wearableMode: "unknown-mode" },
      { ...config, wearableState: { ...config.wearableState, timelineMaxFrames: 1e308 } },
      { ...config, arHudOptions: { ...config.arHudOptions, showDeadlineTimer: "true" } },
      { ...config, activeDeviceIds: [...config.activeDeviceIds, ...config.activeDeviceIds] },
    ];
    for (const value of cases) expect(parseSpatialWearableSessionJson(JSON.stringify({ schema: SPATIAL_WEARABLE_SCHEMA_ID, config: value })).ok).toBe(false);
    expect(parseSpatialWearableSessionJson(JSON.stringify({ schema: SPATIAL_WEARABLE_SCHEMA_ID, config, padding: "x".repeat(1048576) })).ok).toBe(false);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1e308])("잘못된 세션 수치 %s를 JSON null/성공으로 내보내지 않는다", bad => {
    const config = snapshot();
    expect(() => exportSpatialWearableSessionJson({ ...config, wearableState: { ...config.wearableState, timelineMaxFrames: bad } })).toThrow();
  });
  it("외부 개인정보 메타데이터는 export하지 않고 원본 입력은 보존한다", () => {
    const config = { ...snapshot(), privateLabel: "synthetic-private-fixture" };
    const before = structuredClone(config);
    const json = exportSpatialWearableSessionJson(config);
    expect(json).not.toContain(config.privateLabel);
    expect(JSON.parse(json).provenance.hardwareVerified).toBe(false);
    expect(config).toEqual(before);
  });
});

describe("공간 예제 알림·실제 클립보드 ACK", () => {
  it.each(["topology", "rig"] as const)("%s 알림 reject 후 최신 수신자로 같은 결과를 재시도한다", async kind => {
    const rejected = vi.fn().mockRejectedValue(new Error("예제 수신 실패"));
    const latest = vi.fn();
    const view = render(<StudioSpatialWearablePanel {...(kind === "topology" ? { onTopologyChange: rejected } : { onRigChange: rejected })} />);
    await screen.findByTestId(`spatial-${kind}-retry`);
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioSpatialWearablePanel {...(kind === "topology" ? { onTopologyChange: latest } : { onRigChange: latest })} />);
    fireEvent.click(screen.getByTestId(`spatial-${kind}-retry`));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
  });
  it("복사 후 전달 거절은 성공한 복사를 중복하지 않고 최신 수신자로 재시도한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const rejected = vi.fn().mockRejectedValue(new Error("전달 거절"));
    const latest = vi.fn();
    const view = render(<StudioSpatialWearablePanel onExportJson={rejected} />);
    fireEvent.click(screen.getByTestId("spatial-copy-json-btn"));
    await screen.findByTestId("spatial-copy-retry");
    view.rerender(<StudioSpatialWearablePanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("spatial-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(rejected.mock.calls[0]);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("StrictMode와 inline 부모 콜백이 같은 topology 알림을 반복하지 않는다", async () => {
    let calls = 0;
    function Parent() {
      const [count, setCount] = useState(0);
      return <><output data-testid="count">{count}</output><StudioSpatialWearablePanel onTopologyChange={() => {
        calls += 1;
        if (calls < 4) setCount(n => n + 1);
      }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(calls).toBe(1);
  });
  it("복사 미지원이면 전달·성공을 알리지 않는다", async () => {
    vi.stubGlobal("navigator", {});
    const notify = vi.fn();
    render(<StudioSpatialWearablePanel onExportJson={notify} />);
    fireEvent.click(screen.getByTestId("spatial-copy-json-btn"));
    await screen.findByTestId("spatial-copy-retry");
    expect(notify).not.toHaveBeenCalled();
  });
  it("pending 중 중복을 막고 실제 복사 ACK 뒤 최신 수신자에게 전달한다", async () => {
    const gate = Promise.withResolvers<void>();
    const write = vi.fn(() => gate.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn();
    const latest = vi.fn();
    const view = render(<StudioSpatialWearablePanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("spatial-copy-json-btn"));
    fireEvent.click(screen.getByTestId("spatial-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    view.rerender(<StudioSpatialWearablePanel onExportJson={latest} />);
    await act(async () => { gate.resolve(); });
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
  });
  it("복사 reject 후 같은 snapshot을 다시 복사·전달한다", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("권한 거절")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const notify = vi.fn();
    render(<StudioSpatialWearablePanel onExportJson={notify} />);
    fireEvent.click(screen.getByTestId("spatial-copy-json-btn"));
    fireEvent.click(await screen.findByTestId("spatial-copy-retry"));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[0]).toBe(write.mock.calls[1]?.[0]);
  });
});
