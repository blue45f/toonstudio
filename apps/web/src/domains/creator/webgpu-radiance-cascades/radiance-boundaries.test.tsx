// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioWebGpuRadiancePanel, RADIANCE_CASCADE_MERGE_AND_CEL_WGSL, buildCascadePyramidMetrics,
  compareWebGpuVsWebGl2Architecture, evaluateOccluderSdf2d, evaluateSceneSdf2d, exportRadianceCascadesJson,
  formatOklch, getRadianceLightingScenario, normalizeRadianceSceneInput, packRadianceUniforms, traceSoftShadow2d, validateRadianceWgslContracts, type WebGpuRadianceSceneEvaluation } from "./index";

import { assertNormalizedRadianceConfig } from "./radiance-input-contract";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const occluder = () => ({ ...getRadianceLightingScenario().occluders[0] });
describe("방어적 CPU 조명 예제 경계", () => {
  it("캐스케이드 상한은 반복문 진입 전에 거부한다(큰 할당·무한 반복을 실행하지 않는다)", () => {
    const config = normalizeRadianceSceneInput();
    expect(() => buildCascadePyramidMetrics({ ...config, cascadeLevels: 7 })).toThrow();
    expect(() => compareWebGpuVsWebGl2Architecture({ ...config, canvasWidth: NaN })).toThrow();
  });
  it("외부 Uniform 설정과 u32 index/step 오류는 패킹 전에 거부한다", () => {
    const config = normalizeRadianceSceneInput(); const before = structuredClone(config);
    expect(() => packRadianceUniforms({ ...config, canvasWidth: NaN })).toThrow();
    expect(() => packRadianceUniforms(config, 0, NaN)).toThrow();
    expect(() => packRadianceUniforms(config, 0, 2 ** 32 + 1)).toThrow(); expect(config).toEqual(before);
  });
  it("빈 최근접 질의·중복ID·과도한 목록·NaN 기하는 유효한 그림자로 표시하지 않는다", () => {
    const occ = occluder(); expect(() => evaluateSceneSdf2d(0, 0, [])).toThrow();
    expect(() => evaluateSceneSdf2d(0, 0, [occ, { ...occ }])).toThrow();
    expect(() => evaluateSceneSdf2d(0, 0, Array.from({ length: 65 }, (_, i) => ({ ...occ, id: String(i) })))).toThrow();
    expect(() => evaluateOccluderSdf2d(NaN, 0, occ)).toThrow();
    expect(() => traceSoftShadow2d(0, 0, NaN, 1, 0.1, 0.5, [occ])).toThrow();
  });
  it("짧은 비영점 capsule도 실제 선분 끝점의 음수 거리를 유지한다", () => {
    const occ = { ...occluder(), shape: "capsule" as const, x: 0, y: 0, x2: 0.00001, y2: 0, radius: 0.000001 };
    expect(evaluateOccluderSdf2d(0.00001, 0, occ)).toBeCloseTo(-0.000001, 12);
  });
  it("유효한 큰 좌표의 최근접 거리를 임의의 1e6 sentinel로 자르지 않는다", () => {
    const occ = { ...occluder(), shape: "circle" as const, x: -1_000_000, y: -1_000_000, radius: 1 };
    expect(evaluateSceneSdf2d(1_000_000, 1_000_000, [occ]).distance).toBeCloseTo(Math.hypot(2_000_000, 2_000_000) - 1, 6);
  });
  it("NaN 휴는 CSS NaN이 되지 않고 유한한 색을 만든다", () => {
    expect(formatOklch({ l: 0.7, c: 0.1, h: NaN })).not.toContain("NaN");
  });
  it("역순 smoothstep을 고치고 GPU 컴파일·parity·원고 적용을 성공으로 표시하지 않는다", () => {
    expect(RADIANCE_CASCADE_MERGE_AND_CEL_WGSL).not.toContain("smoothstep(0.055, 0.0");
    const json = JSON.parse(exportRadianceCascadesJson().json);
    expect(json.gpuSubmitted).toBe(false); expect(json.cpuGpuParityVerified).toBe(false); expect(json.artworkApplied).toBe(false);
    expect(validateRadianceWgslContracts()).toMatchObject({ validationKind: "static-source-contract", gpuCompiled: false });
    expect(() => validateRadianceWgslContracts({ jfaSdfWgsl: "x".repeat(65_537) })).toThrow();
  });
  it("NaN 초기 cascade도 UI와 실제 계산 설정이 일치한다", () => {
    render(<StudioWebGpuRadiancePanel initialCascadeLevels={NaN} />);
    expect((screen.getByTestId("slider-cascade-levels") as HTMLInputElement).value).toBe("5");
    expect(screen.getByTestId("radiance-example-scope").textContent).toContain("CPU");
  });
  it("클립보드 미지원은 export 완료 콜백을 보내지 않는다", async () => {
    vi.stubGlobal("navigator", {}); const receiver = vi.fn(); render(<StudioWebGpuRadiancePanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("export-radiance-json-btn")); expect(receiver).not.toHaveBeenCalled();
    expect(await screen.findByTestId("radiance-copy-retry")).toBeTruthy();
  });
  it("콜백 pending 중 중복을 막고 거절 뒤 최신 수신자에게 같은 계산 결과를 전달한다", async () => {
    const gate = Promise.withResolvers<void>(); const first = vi.fn(() => gate.promise); const latest = vi.fn();
    const view = render(<StudioWebGpuRadiancePanel onSceneChange={first} />);
    fireEvent.click(screen.getByTestId("scenario-card-fantasy-crystal-bounce")); fireEvent.click(screen.getByTestId("scenario-card-noir-spotlight-shadow")); expect(first).toHaveBeenCalledTimes(1);
    await act(async () => { gate.reject(new Error("수신 거절")); }); await screen.findByTestId("radiance-scene-retry");
    view.rerender(<StudioWebGpuRadiancePanel onSceneChange={latest} />); fireEvent.click(screen.getByTestId("radiance-scene-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1)); expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
  });
});


describe("자원 상한·원문·전달 회귀", () => {
  it("무한수·큰 설정은 검증 함수에서 안전하게 거부하며 정상 96B 버퍼는 보존한다", () => {
    const config = normalizeRadianceSceneInput();
    for (const patch of [{ cascadeLevels: Infinity }, { cascadeLevels: Number.MAX_VALUE }, { canvasWidth: Infinity }, { canvasHeight: 4097 }, { baseRayCount: 17 }]) {
      expect(() => assertNormalizedRadianceConfig({ ...config, ...patch })).toThrow();
    }
    const before = structuredClone(config); const packed = packRadianceUniforms(config);
    expect(packed.byteLength).toBe(96); expect(packed.floatView.buffer).toBe(packed.buffer); expect(packed.uintView.buffer).toBe(packed.buffer); expect(config).toEqual(before);
  });
  it("SDF는 Unicode ID·레이블·도형을 바꾸지 않으며 빈 그림자 공간과 퇴화 capsule을 보존한다", () => {
    const occ = { ...occluder(), id: " 한글-é-원본 ", labelKo: "  대사 é 유지  ", shape: "capsule" as const, x2: 0.48, y2: 0.5 };
    const input = [occ]; const before = structuredClone(input);
    const result = evaluateSceneSdf2d(0.48, 0.5, input); expect(result.nearest).toBe(occ); expect(input).toEqual(before);
    expect(evaluateOccluderSdf2d(occ.x, occ.y, occ)).toBe(-occ.radius);
    expect(traceSoftShadow2d(0, 0, 1, 1, 0.1, 0.5, [])).toBe(1);
    expect(() => evaluateSceneSdf2d(0, 0, [{ ...occ, id: " " }])).toThrow();
    expect(() => evaluateOccluderSdf2d(Number.MAX_VALUE, 0, occ)).toThrow();
  });
  it("clipboard ACK를 기다리고 알림 거절 뒤 최신 수신자 재시도는 복사를 반복하지 않는다", async () => {
    const gate = Promise.withResolvers<void>(); const writeText = vi.fn((_text: string) => gate.promise); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const first = vi.fn((_text: string, _evaluation: WebGpuRadianceSceneEvaluation) => { throw new Error("수신 거절"); });
    const latest = vi.fn<(text: string, evaluation: WebGpuRadianceSceneEvaluation) => void>();
    const view = render(<StudioWebGpuRadiancePanel onExportJson={first} />); fireEvent.click(screen.getByTestId("export-radiance-json-btn")); fireEvent.click(screen.getByTestId("export-radiance-json-btn"));
    expect(writeText).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
    await act(async () => { gate.resolve(); }); await screen.findByTestId("radiance-copy-retry");
    view.rerender(<StudioWebGpuRadiancePanel onExportJson={latest} />); fireEvent.click(screen.getByTestId("radiance-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1)); expect(writeText).toHaveBeenCalledTimes(1); expect(latest.mock.calls[0]).toEqual(first.mock.calls[0]);
    const text = writeText.mock.calls[0]?.[0]; if (text) expect(screen.getByTestId("radiance-copy-state").textContent).toContain(String(new TextEncoder().encode(text).byteLength));
  });
  it("복사 거절·수신자 제거는 완료가 아니며 WGSL 재시도도 JSON 알림을 보내지 않는다", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("복사 거절")); vi.stubGlobal("navigator", { clipboard: { writeText } });
    const receiver = vi.fn(); const view = render(<StudioWebGpuRadiancePanel onExportJson={receiver} />);
    fireEvent.click(screen.getByTestId("export-radiance-json-btn")); await screen.findByTestId("radiance-copy-retry"); expect(receiver).not.toHaveBeenCalled();
    writeText.mockResolvedValue(undefined); view.rerender(<StudioWebGpuRadiancePanel />); fireEvent.click(screen.getByTestId("radiance-copy-retry"));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2)); await waitFor(() => expect(screen.getByTestId("radiance-copy-state").getAttribute("data-copy-state")).toBe("error"));
    fireEvent.click(screen.getByTestId("copy-wgsl-btn")); await waitFor(() => expect(screen.getByTestId("radiance-copy-state").getAttribute("data-copy-state")).toBe("copied")); expect(receiver).not.toHaveBeenCalled();
  });
  it("수신자의 동기 throw·장면 수정은 원본 시나리오와 재시도 정본을 바꾸지 않는다", async () => {
    const baseline = exportRadianceCascadesJson({ scenarioId: "fantasy-crystal-bounce" }).evaluation;
    const first = vi.fn((evaluation: WebGpuRadianceSceneEvaluation) => { Object.assign(evaluation.scenario.occluders[0], { labelKo: "외부 수정" }); throw new Error("수신 실패"); });
    const latest = vi.fn<(evaluation: WebGpuRadianceSceneEvaluation) => void>(); const view = render(<StudioWebGpuRadiancePanel onSceneChange={first} />);
    expect(() => fireEvent.click(screen.getByTestId("scenario-card-fantasy-crystal-bounce"))).not.toThrow(); await screen.findByTestId("radiance-scene-retry");
    expect(exportRadianceCascadesJson({ scenarioId: "fantasy-crystal-bounce" }).evaluation).toEqual(baseline);
    view.rerender(<StudioWebGpuRadiancePanel onSceneChange={latest} />); fireEvent.click(screen.getByTestId("radiance-scene-retry"));
    expect(latest.mock.calls[0]?.[0]).toEqual(baseline);
  });
  it("unmount 후 늦은 복사 응답을 회수하고 최신 props reset은 같은 정규화 결과를 보낸다", async () => {
    const gate = Promise.withResolvers<void>(); const writeText = vi.fn((_text: string) => gate.promise); vi.stubGlobal("navigator", { clipboard: { writeText } }); const receiver = vi.fn();
    const view = render(<StudioWebGpuRadiancePanel onExportJson={receiver} />); fireEvent.click(screen.getByTestId("export-radiance-json-btn")); view.unmount(); await act(async () => { gate.resolve(); }); expect(receiver).not.toHaveBeenCalled();
    const changed = vi.fn<(evaluation: WebGpuRadianceSceneEvaluation) => void>(); const reset = render(<StudioWebGpuRadiancePanel initialCascadeLevels={3} />);
    reset.rerender(<StudioWebGpuRadiancePanel initialCascadeLevels={NaN} onSceneChange={changed} />); fireEvent.click(screen.getByTestId("reset-radiance-btn"));
    expect((screen.getByTestId("slider-cascade-levels") as HTMLInputElement).value).toBe("5"); expect(changed.mock.calls[0]?.[0].config.cascadeLevels).toBe(5);
  });
});
