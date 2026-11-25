// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SILICON_NPU_TARGETS, WEBTOON_AI_WORKLOADS, DEGRADATION_LADDER_SPECS, StudioWebNnNpuThermalPanel, buildWebNnNpuThermalPlan, compileWebNnSiliconGraph, exportWebNnThermalPlanJson, formatOklch, getSiliconNpuTarget, type WebNnGraphCompileInput } from "./index";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

it("표준 MLContextOptions와 레거시 장치·전송 계획 힌트를 분리한다", () => {
  const { json, plan } = exportWebNnThermalPlanJson();
  const parsed = JSON.parse(json) as Record<string, unknown>;
  expect(parsed.mlContextOptions).toEqual({ powerPreference: plan.compiledGraph.mlContextOptions.powerPreference, accelerated: true });
  expect(parsed.plannerHints).toEqual(plan.compiledGraph.mlContextOptions);
});

it("NPU·양자화·정확도·센서·정책 적용을 실제 실행한 결과로 기록하지 않는다", () => {
  const { json } = exportWebNnThermalPlanJson();
  const parsed = JSON.parse(json) as { runtimeEvidence?: Record<string, unknown> };
  expect(parsed.runtimeEvidence).toMatchObject({ webnnInvoked: false, graphBuilt: false, npuExecuted: false, quantizationExecuted: false, accuracyMeasured: false, zeroCopyVerified: false, penHoverListenerAttached: false, temperatureMeasured: false, pressureObserverUsed: false, policyApplied: false });
});

it("융합 블록들의 연산수 합계는 전체 그래프 요약과 일치한다", () => {
  for (const target of SILICON_NPU_TARGETS) for (const workload of WEBTOON_AI_WORKLOADS) {
    const { fusionPass: fusion } = compileWebNnSiliconGraph({ siliconId: target.id, workloadId: workload.id });
    expect(fusion.fusedBlocks.reduce((sum, item) => sum + item.originalOpCount, 0)).toBe(fusion.rawOpCount);
    expect(fusion.fusedBlocks.reduce((sum, item) => sum + item.fusedOpCount, 0)).toBe(fusion.fusedOpCount);
    expect(fusion.eliminatedOps + fusion.fusedOpCount).toBe(fusion.rawOpCount);
  }
});

it.each(["zeroCopyMlTensorEnabled", "penHoverWarmupEnabled"] as const)("외부 %s 문자열이 boolean 실행 플래그로 새지 않는다", (key) => {
  const input: WebNnGraphCompileInput = {};
  Reflect.set(input, key, "off");
  const graph = compileWebNnSiliconGraph(input);
  const value = key === "zeroCopyMlTensorEnabled" ? graph.zeroCopyPass.requestedEnabled : graph.hoverWarmupPass.enabled;
  expect(typeof value).toBe("boolean");
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY])("비유한 색상 hue %s를 CSS로 내보내지 않는다", (h) => {
  expect(formatOklch({ l: 0.5, c: 0.1, h })).not.toMatch(/NaN|Infinity/u);
});

it("공개 계획을 바꿔도 정본 실리콘 프로파일은 보존된다", () => {
  const plan = buildWebNnNpuThermalPlan(); const before = getSiliconNpuTarget().relativeComputeSpeedFactor;
  try {
    Reflect.set(plan.siliconTarget, "relativeComputeSpeedFactor", 999999);
    expect(getSiliconNpuTarget().relativeComputeSpeedFactor).toBe(before);
  } finally { Reflect.set(plan.siliconTarget, "relativeComputeSpeedFactor", before); }
});
it("공개 강등 정책을 바꿔도 다음 PID 계산의 정본 계수는 보존된다", () => {
  const plan = buildWebNnNpuThermalPlan(); const step = plan.degradationLadder[0]; const before = DEGRADATION_LADDER_SPECS[0]?.heatMultiplier;
  if (!step || before === undefined) throw new Error("missing tier");
  try { Reflect.set(step, "heatMultiplier", 0.001); expect(DEGRADATION_LADDER_SPECS[0]?.heatMultiplier).toBe(before); }
  finally { Reflect.set(step, "heatMultiplier", before); }
});

it("JSON 복사는 ACK 전에 완료나 외부 전달을 가장하지 않는다", async () => {
  let acknowledge: (() => void) | undefined;
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; })) } });
  const recipient = vi.fn(); render(<StudioWebNnNpuThermalPanel onExportJson={recipient} />);
  fireEvent.click(screen.getByTestId("webnn-export-json-btn"));
  try { expect(screen.queryByText(/복사했습니다/u)).toBeNull(); expect(recipient).not.toHaveBeenCalled(); }
  finally { await act(async () => { acknowledge?.(); }); }
  await waitFor(() => expect(recipient).toHaveBeenCalledOnce());
});

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => { throw new Error("Promise not initialized"); };
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}

function assertFiniteTree(value: unknown): void {
  if (typeof value === "number") expect(Number.isFinite(value)).toBe(true);
  else if (Array.isArray(value)) for (const item of value) assertFiniteTree(item);
  else if (value !== null && typeof value === "object") for (const item of Object.values(value)) assertFiniteTree(item);
}

it.each([Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.MIN_VALUE, -1e308, 1e308])("PID 극값 %s에서도 60스텝·유한 범위와 원본 입력을 보존한다", (extreme) => {
  const input = Object.freeze({ sustainedMinutes: extreme, pidGains: Object.freeze({ kp: extreme, ki: extreme, kd: extreme, integralClamp: extreme }) });
  const before = structuredClone(input);
  const { plan, json } = exportWebNnThermalPlanJson(input);
  const simulation = plan.thermalSimulation;
  expect(input).toEqual(before);
  expect(simulation.trajectory).toHaveLength(60);
  expect(simulation.sustainedMinutes).toBeGreaterThanOrEqual(1);
  expect(simulation.sustainedMinutes).toBeLessThanOrEqual(60);
  expect(plan.compiledGraph.irNodes.length).toBeLessThanOrEqual(64);
  expect(json.length).toBeLessThan(100_000);
  assertFiniteTree(plan);
  for (const point of simulation.trajectory) {
    expect(point.pidThermalIndex).toBeGreaterThanOrEqual(0);
    expect(point.pidThermalIndex).toBeLessThanOrEqual(100);
    expect(point.controlEffort01).toBeGreaterThanOrEqual(0);
    expect(point.controlEffort01).toBeLessThanOrEqual(1);
    expect(Number.isInteger(point.degradationTier)).toBe(true);
    expect(Math.abs(point.integralState)).toBeLessThanOrEqual(simulation.gains.integralClamp);
  }
});

it.each([Number.NaN, Number.POSITIVE_INFINITY, -1e308, 1e308, 1.5])("외부 열 강등 단계 %s는 정수 0~4로 정규화한다", (tier) => {
  const input: WebNnGraphCompileInput = {};
  Reflect.set(input, "thermalOverrideTier", tier);
  const graph = compileWebNnSiliconGraph(input);
  assertFiniteTree(graph);
  const expectedTier = Number.isFinite(tier) ? Math.round(Math.min(4, Math.max(0, tier))) : 0;
  const expected = compileWebNnSiliconGraph({ thermalOverrideTier: expectedTier as 0 | 1 | 2 | 3 | 4 });
  expect(graph).toEqual(expected);
});

it("계산·내보내기가 WebNN·센서 API를 호출하지 않고 두 도해도 예제로 표시한다", () => {
  const forbidden = vi.fn(() => { throw new Error("Unexpected runtime call"); });
  vi.stubGlobal("navigator", { ml: { createContext: forbidden } });
  vi.stubGlobal("PressureObserver", forbidden);
  const { json } = exportWebNnThermalPlanJson();
  expect(json).not.toMatch(/MLTensor\.(?:import|export)/u);
  expect(forbidden).not.toHaveBeenCalled();
  render(<StudioWebNnNpuThermalPanel locale="en" />);
  expect(screen.getByTestId("webnn-pipeline-svg").getAttribute("data-execution-state")).toBe("planning-only");
  expect(screen.getByTestId("thermal-pid-curve-svg").getAttribute("data-execution-state")).toBe("planning-only");
  expect(screen.getByTestId("honesty-notice").textContent).toContain("No WebNN context");
});

it.each(["throw", "reject"] as const)("계획 알림 %s에도 계산을 보존하고 최신 수신자로 재시도한다", async (failure) => {
  const failed = vi.fn(() => {
    if (failure === "throw") throw new Error("recipient failed");
    return Promise.reject(new Error("recipient failed"));
  });
  const nextRecipient = vi.fn();
  const view = render(<StudioWebNnNpuThermalPanel onPlanChange={failed} />);
  expect(failed).not.toHaveBeenCalled();
  fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "47" } });
  await waitFor(() => expect(screen.getByTestId("webnn-notification-retry-btn")).toBeTruthy());
  expect(screen.getByTestId("sustained-minutes-readout").textContent).toContain("47");
  view.rerender(<StudioWebNnNpuThermalPanel onPlanChange={nextRecipient} />);
  expect(nextRecipient).not.toHaveBeenCalled();
  fireEvent.click(screen.getByTestId("webnn-notification-retry-btn"));
  await waitFor(() => expect(nextRecipient).toHaveBeenCalledOnce());
  expect(nextRecipient.mock.calls[0]?.[0].thermalSimulation.sustainedMinutes).toBe(47);
  expect(failed).toHaveBeenCalledOnce();
});

it("대기 중 계획 입력은 최신 한 건만 최신 수신자에게 직렬 전달한다", async () => {
  const acknowledgement = deferred();
  const first = vi.fn(() => acknowledgement.promise);
  const latest = vi.fn();
  const view = render(<StudioWebNnNpuThermalPanel onPlanChange={first} />);
  fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "10" } });
  view.rerender(<StudioWebNnNpuThermalPanel onPlanChange={latest} />);
  fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "20" } });
  fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "45" } });
  expect(first).toHaveBeenCalledOnce();
  expect(latest).not.toHaveBeenCalled();
  expect(screen.getByTestId("webnn-notification-pending")).toBeTruthy();
  await act(async () => { acknowledgement.resolve(); });
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(latest.mock.calls[0]?.[0].thermalSimulation.sustainedMinutes).toBe(45);
});

it("클립보드 실패 재시도는 변경된 UI 대신 실패한 JSON 원문과 최신 수신자를 쓴다", async () => {
  const writeText = vi.fn().mockRejectedValueOnce(new Error("denied")).mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const first = vi.fn();
  const latest = vi.fn();
  const view = render(<StudioWebNnNpuThermalPanel onExportJson={first} />);
  fireEvent.click(screen.getByTestId("webnn-export-json-btn"));
  await waitFor(() => expect(screen.getByTestId("webnn-export-retry-btn")).toBeTruthy());
  const originalJson = writeText.mock.calls[0]?.[0];
  expect(first).not.toHaveBeenCalled();
  expect(screen.queryByText(/요청한 JSON을 복사했습니다/u)).toBeNull();
  fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "60" } });
  view.rerender(<StudioWebNnNpuThermalPanel onExportJson={latest} />);
  fireEvent.click(screen.getByTestId("webnn-export-retry-btn"));
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(writeText).toHaveBeenCalledTimes(2);
  expect(writeText.mock.calls[1]?.[0]).toBe(originalJson);
  expect(latest.mock.calls[0]?.[0]).toBe(originalJson);
  expect(latest.mock.calls[0]?.[1].thermalSimulation.sustainedMinutes).toBe(30);
});

it("ACK 대기 중 추가된 알림이 거절된 뒤 수신자가 제거돼도 성공으로 바꾸지 않는다", async () => {
  const copyAck = deferred();
  const writeText = vi.fn(() => copyAck.promise);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  const rejected = vi.fn(() => Promise.reject(new Error("rejected")));
  const latest = vi.fn();
  const view = render(<StudioWebNnNpuThermalPanel />);
  fireEvent.click(screen.getByTestId("webnn-export-json-btn"));
  view.rerender(<StudioWebNnNpuThermalPanel onExportJson={rejected} />);
  await act(async () => { copyAck.resolve(); });
  await waitFor(() => expect(screen.getByTestId("webnn-export-retry-btn")).toBeTruthy());
  expect(rejected).toHaveBeenCalledOnce();
  view.rerender(<StudioWebNnNpuThermalPanel />);
  fireEvent.click(screen.getByTestId("webnn-export-retry-btn"));
  await waitFor(() => expect(screen.getByTestId("webnn-export-retry-btn")).toBeTruthy());
  expect(screen.queryByText(/요청한 JSON을 복사했습니다/u)).toBeNull();
  view.rerender(<StudioWebNnNpuThermalPanel onExportJson={latest} />);
  fireEvent.click(screen.getByTestId("webnn-export-retry-btn"));
  await waitFor(() => expect(latest).toHaveBeenCalledOnce());
  expect(writeText).toHaveBeenCalledOnce();
});

it("수신자 없는 복사는 실제 ACK 뒤 성공하며, unmount 뒤에는 전달하지 않는다", async () => {
  const copyAck = deferred();
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn(() => copyAck.promise) } });
  const recipient = vi.fn();
  const view = render(<StudioWebNnNpuThermalPanel onExportJson={recipient} />);
  fireEvent.click(screen.getByTestId("webnn-export-json-btn"));
  view.unmount();
  await act(async () => { copyAck.resolve(); });
  expect(recipient).not.toHaveBeenCalled();
  render(<StudioWebNnNpuThermalPanel />);
  fireEvent.click(screen.getByTestId("webnn-export-json-btn"));
  await waitFor(() => expect(screen.getByText(/요청한 JSON을 복사했습니다/u)).toBeTruthy());
});

it("수동 JSON 미리보기는 현재 계산을, 복사 미리보기는 요청한 스냅샷을 유지한다", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } });
  render(<StudioWebNnNpuThermalPanel />);
  fireEvent.click(screen.getByTestId("webnn-toggle-json-btn"));
  fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "59" } });
  expect(screen.getByTestId("webnn-json-preview").textContent).toContain('"sustainedMinutes": 59');
  fireEvent.click(screen.getByTestId("webnn-export-json-btn"));
  await waitFor(() => expect(screen.getByText(/요청한 JSON을 복사했습니다/u)).toBeTruthy());
  fireEvent.change(screen.getByTestId("sustained-minutes-slider"), { target: { value: "22" } });
  expect(screen.getByTestId("webnn-json-preview").textContent).toContain('"sustainedMinutes": 59');
});
