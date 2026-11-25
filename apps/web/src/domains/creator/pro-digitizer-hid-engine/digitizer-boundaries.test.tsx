// @vitest-environment jsdom
import { StrictMode, useState } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DIGITIZER_CONFIG_SCHEMA_VERSION, StudioProDigitizerCalibratorPanel,
  createDefaultShortcutBindings, createPressureCurveFromPreset, encodeStandardHidDigitizerReport,
  exportDigitizerConfigJson, hidReportToRawPointerSample, importDigitizerConfigJson,
  normalizePointerSampleBatch, parseStandardHidDigitizerReport, samplePressureCurvePoints,
  type DigitizerCalibrationSnapshot,
} from "./index";

function snapshot(): DigitizerCalibrationSnapshot {
  return { profileId: "huion-pw600", curve: createPressureCurveFromPreset("custom-bezier"),
    smoothingStrength: 0.123456, enablePrediction: true, bindings: createDefaultShortcutBindings("huion-pw600") };
}
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe("디지타이저 예제의 입력·원문·내보내기 경계", () => {
  it("유한 극단 좌표·시각과 과대 batch를 계산 전에 거부하고 원본을 보존한다", () => {
    const sample = { x: 1e308, y: -1e308, timestampMs: 1e308, pressure: 0.5 };
    const before = { ...sample };
    const options = { profileId: "huion-pw600" as const, curve: snapshot().curve };
    expect(() => normalizePointerSampleBatch([sample], options)).toThrow();
    expect(sample).toEqual(before);
    expect(() => normalizePointerSampleBatch(Array.from({ length: 4097 }, () => ({ x: 1, y: 2, timestampMs: 1, pressure: 0.5 })), options)).toThrow();
  });
  it("NaN 샘플 수를 빈 정상 곡선으로 반환하지 않는다", () => {
    expect(() => samplePressureCurvePoints(snapshot().curve, Number.NaN)).toThrow();
  });
  it.each([0, 1])("아주 작은 시각 차의 속도·리포트율 overflow를 성공 수치로 반환하지 않는다 (%s)", x => {
    const samples = [{ x: 0, y: 0, timestampMs: 0, pressure: 0.5 },
      { x, y: 0, timestampMs: Number.MIN_VALUE, pressure: 0.5 }];
    const before = structuredClone(samples);
    expect(() => normalizePointerSampleBatch(samples, { profileId: "huion-pw600", curve: snapshot().curve })).toThrow();
    expect(samples).toEqual(before);
  });
  it("잘못된 HID 수치와 외부 투영 메타데이터를 성공 샘플로 바꾸지 않는다", () => {
    expect(() => encodeStandardHidDigitizerReport({ x: Number.NaN, y: 1, tipPressure: 2 })).toThrow();
    const parsed = parseStandardHidDigitizerReport(encodeStandardHidDigitizerReport({ x: 2, y: 3, tipPressure: 4 }));
    if (!parsed.ok) throw new Error("정상 예제 패킷이 필요합니다.");
    expect(() => hidReportToRawPointerSample(parsed.report, 800, 600, Number.NaN)).toThrow();
    expect(() => hidReportToRawPointerSample({ ...parsed.report, xNorm: 2 }, 800, 600, 1)).toThrow();
  });
  it("중복 ID·과대 바인딩·과대 JSON을 조용히 불러오지 않는다", () => {
    const config = snapshot();
    const root = { schema: DIGITIZER_CONFIG_SCHEMA_VERSION, ...config };
    expect(importDigitizerConfigJson(JSON.stringify({ ...root, bindings: [...config.bindings, ...config.bindings] })).ok).toBe(false);
    const first = config.bindings[0];
    if (!first) throw new Error("기본 바인딩이 필요합니다.");
    expect(importDigitizerConfigJson(JSON.stringify({ ...root, bindings: Array.from({ length: 129 }, (_, i) => ({ ...first, id: `b${i}` })) })).ok).toBe(false);
    expect(importDigitizerConfigJson(JSON.stringify({ ...root, padding: "x".repeat(1048576) })).ok).toBe(false);
  });
  it.each([Number.NaN, Number.POSITIVE_INFINITY, 1e308])("잘못된 curve %s를 JSON null/성공으로 내보내지 않는다", (bad) => {
    const config = snapshot();
    expect(() => exportDigitizerConfigJson({ ...config, curve: { ...config.curve, p1: { x: bad, y: 0.4 } } })).toThrow();
  });
  it("분해 한글·이모지·공백·정밀도를 보존하고 외부 provenance를 장치 인증으로 신뢰하지 않는다", () => {
    const original = snapshot();
    const supported = { ...original, bindings: original.bindings.map((binding, i) => i === 0
      ? { ...binding, id: " 가 👨‍👩‍👧‍👦 ", triggerLabelKo: "  가 👨‍👩‍👧‍👦  " } : binding) };
    const config = { ...supported, provenance: { hardwareVerified: true },
      bindings: supported.bindings.map(binding => ({ ...binding, privateLabel: "synthetic-private-fixture" })) };
    const before = structuredClone(config);
    const json = exportDigitizerConfigJson(config);
    const restored = importDigitizerConfigJson(json);
    expect(restored).toEqual({ ok: true, config: supported });
    expect(config).toEqual(before);
    expect(json).not.toContain("synthetic-private-fixture");
    expect(JSON.parse(json).provenance.hardwareVerified).toBe(false);
  });
});

describe("디지타이저 예제 알림·클립보드 ACK", () => {
  it("알림 throw는 화면에 남고 최신 수신자로 같은 snapshot을 재시도한다", async () => {
    const rejected = vi.fn(() => { throw new Error("예제 수신 실패"); });
    const latest = vi.fn();
    const view = render(<StudioProDigitizerCalibratorPanel onConfigChange={rejected} />);
    await screen.findByTestId("digitizer-notify-retry");
    const sent = rejected.mock.calls[0];
    view.rerender(<StudioProDigitizerCalibratorPanel onConfigChange={latest} />);
    fireEvent.click(screen.getByTestId("digitizer-notify-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(sent);
  });
  it("복사 대기 중 추가된 수신자가 거절하면 수신자 제거를 성공으로 처리하지 않는다", async () => {
    const gate = Promise.withResolvers<void>();
    const write = vi.fn(() => gate.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const rejected = vi.fn().mockRejectedValue(new Error("전달 거절"));
    const latest = vi.fn();
    const view = render(<StudioProDigitizerCalibratorPanel />);
    fireEvent.click(screen.getByTestId("digitizer-copy-json-btn"));
    view.rerender(<StudioProDigitizerCalibratorPanel onExportJson={rejected} />);
    await act(async () => { gate.resolve(); });
    await screen.findByTestId("digitizer-copy-retry");
    view.rerender(<StudioProDigitizerCalibratorPanel />);
    fireEvent.click(screen.getByTestId("digitizer-copy-retry"));
    await act(async () => {});
    expect(screen.getByTestId("digitizer-copy-retry")).toBeTruthy();
    view.rerender(<StudioProDigitizerCalibratorPanel onExportJson={latest} />);
    fireEvent.click(screen.getByTestId("digitizer-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(latest.mock.calls[0]).toEqual(rejected.mock.calls[0]);
    expect(write).toHaveBeenCalledTimes(1);
  });
  it("StrictMode와 inline 부모 갱신에서도 같은 snapshot 알림을 반복하지 않는다", async () => {
    let calls = 0;
    function Parent() {
      const [count, setCount] = useState(0);
      return <><output data-testid="count">{count}</output><StudioProDigitizerCalibratorPanel onConfigChange={() => {
        calls += 1;
        if (calls < 4) setCount(n => n + 1);
      }} /></>;
    }
    render(<StrictMode><Parent /></StrictMode>);
    await waitFor(() => expect(screen.getByTestId("count").textContent).toBe("1"));
    expect(calls).toBe(1);
  });
  it("복사 미지원이면 성공이나 외부 전달을 알리지 않는다", async () => {
    vi.stubGlobal("navigator", {});
    const notify = vi.fn();
    render(<StudioProDigitizerCalibratorPanel onExportJson={notify} />);
    fireEvent.click(screen.getByTestId("digitizer-copy-json-btn"));
    await screen.findByTestId("digitizer-copy-retry");
    expect(notify).not.toHaveBeenCalled();
  });
  it("복사 pending은 중복 요청을 막고 ACK 뒤 최신 콜백에만 전달한다", async () => {
    const gate = Promise.withResolvers<void>();
    const write = vi.fn(() => gate.promise);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn();
    const latest = vi.fn();
    const view = render(<StudioProDigitizerCalibratorPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("digitizer-copy-json-btn"));
    fireEvent.click(screen.getByTestId("digitizer-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
    view.rerender(<StudioProDigitizerCalibratorPanel onExportJson={latest} />);
    await act(async () => { gate.resolve(); });
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1));
    expect(first).not.toHaveBeenCalled();
  });
  it("복사 실패 후 같은 payload를 재시도하고 기존 JSON 초안을 덮지 않는다", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("권한 거절")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const notify = vi.fn();
    render(<StudioProDigitizerCalibratorPanel onExportJson={notify} />);
    fireEvent.click(screen.getByTestId("digitizer-copy-json-btn"));
    const draft = "  {미완성 👨‍👩‍👧‍👦  ";
    fireEvent.change(screen.getByTestId("digitizer-json-textarea"), { target: { value: draft } });
    fireEvent.click(await screen.findByTestId("digitizer-copy-retry"));
    await waitFor(() => expect(notify).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[0]?.[0]).toBe(write.mock.calls[1]?.[0]);
    expect((screen.getByTestId("digitizer-json-textarea") as HTMLTextAreaElement).value).toBe(draft);
  });
});
