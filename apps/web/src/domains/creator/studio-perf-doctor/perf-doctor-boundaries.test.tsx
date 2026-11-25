// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useI18n } from "@/shared/lib/i18n";
import {
  StudioPerfDoctorPanel, analyzeFrameTimeRing, applyGuardrailPrescription,
  createFrameTimeRingBuffer, createPerfDoctorScenario, diagnoseStudioRuntimeHealth,
  pushFrameSamples, recommendAdaptiveGuardrail, type FrameTimeSample, type StudioPerfDoctorSnapshot, type AdaptiveGuardrailPlan,
} from "./index";

beforeEach(() => useI18n.setState({ lang: "ko" }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (reason: Error) => void } {
  let resolve = (): void => {};
  let reject = (_reason: Error): void => {};
  const promise = new Promise<void>((accept, deny) => { resolve = accept; reject = deny; });
  return { promise, resolve, reject };
}

function pressureSnapshot(): StudioPerfDoctorSnapshot {
  const original = createPerfDoctorScenario("critical-opfs-stall");
  return {
    ...original,
    telemetry: { ...original.telemetry, vram: { ...original.telemetry.vram, deviceLostCount: 2 } },
  };
}

function prescription(snapshot: StudioPerfDoctorSnapshot): AdaptiveGuardrailPlan {
  const frameAnalysis = analyzeFrameTimeRing(snapshot.ring);
  return recommendAdaptiveGuardrail({
    diagnosis: diagnoseStudioRuntimeHealth({ ...snapshot.telemetry, frameAnalysis }), frameAnalysis,
  }).precision4K;
}

describe("성능 예제의 데이터·콜백 경계", () => {
  it("빈 선택은 모든 지표·링 기록·장치 상실 기록을 그대로 보존한다", () => {
    const snapshot = pressureSnapshot();
    const before = structuredClone(snapshot);
    const result = applyGuardrailPrescription(snapshot, prescription(snapshot), [], 60);
    expect(result.nextRing).toBe(snapshot.ring);
    expect(result.nextTelemetry).toBe(snapshot.telemetry);
    expect(result.afterDiagnosis).toEqual(result.beforeDiagnosis);
    expect(Object.values(result.deltas)).toEqual([0, 0, 0, 0, 0]);
    expect(result.targetHzAfter).toBe(60);
    expect(snapshot).toEqual(before);
    expect(result.runtimeApplied).toBe(false);
  });

  it("WAL 단독 선택은 VRAM·타일·Hz와 deviceLost를 바꾸지 않는다", () => {
    const snapshot = pressureSnapshot();
    const plan = prescription(snapshot);
    const result = applyGuardrailPrescription(snapshot, plan, ["precision-4k-wal-checkpoint"], 120);
    expect(result.nextTelemetry.vram).toEqual(snapshot.telemetry.vram);
    expect(result.nextTelemetry.tileCache).toEqual(snapshot.telemetry.tileCache);
    expect(result.targetHzAfter).toBe(120);
    expect(result.nextTelemetry.opfsWal.lastCheckpointDelayMs).toBeLessThan(snapshot.telemetry.opfsWal.lastCheckpointDelayMs);
    expect(result.nextRing.totalRecorded).toBe(snapshot.ring.totalRecorded);
    expect(result.nextRing.writeIndex).toBe(snapshot.ring.writeIndex);
  });

  it("효과 추정 0인 precision WAL 단계는 프레임과 무관한 지표를 바꾸지 않는다", () => {
    const snapshot = pressureSnapshot();
    const plan = prescription(snapshot);
    const zeroPlan = {
      ...plan,
      steps: plan.steps.map((step) => ({
        ...step, estimatedP99ReductionMs: 0, estimatedVramReleaseMb: 0,
        estimatedTileHitGainPct: 0, estimatedWalReductionMs: 0,
      })),
    };
    const before = structuredClone(snapshot);
    const result = applyGuardrailPrescription(snapshot, zeroPlan, ["precision-4k-wal-checkpoint"], 120);
    expect(result.nextRing).toEqual(snapshot.ring);
    expect(result.nextTelemetry).toEqual(snapshot.telemetry);
    expect(Object.values(result.deltas)).toEqual([0, 0, 0, 0, 0]);
    expect(snapshot).toEqual(before);
  });

  it("누락된 활성 슬롯과 부분 링의 인덱스·기록 불일치를 원본 변경 없이 거부한다", () => {
    const empty = createFrameTimeRingBuffer();
    const valid = pushFrameSamples(empty, [{ totalMs: 4, stages: { input: 1, brushWasm: 1, webgpuComposite: 1, uiReact: 1 } }]);
    const first = valid.slots[0];
    if (!first) throw new Error("Valid fixture needs its first frame");
    const malformed = [
      { ...empty, size: 1, totalRecorded: 1, writeIndex: 1 },
      { ...valid, writeIndex: 2 },
      { ...valid, totalRecorded: 2 },
      { ...valid, slots: [{ ...first, frameIndex: 2 }, ...valid.slots.slice(1)] },
    ];
    for (const ring of malformed) {
      const before = structuredClone(ring);
      expect(() => analyzeFrameTimeRing(ring)).toThrow(RangeError);
      expect(() => pushFrameSamples(ring, [])).toThrow(RangeError);
      expect(ring).toEqual(before);
    }
  });

  it("프레임 합계 미달·NaN 입력은 직접 배열과 링버퍼에서 같은 통계를 만든다", () => {
    const samples: FrameTimeSample[] = [
      { frameIndex: 1, timestampMs: 8.33, totalMs: 1, stages: { input: 0, brushWasm: 20, webgpuComposite: 0, uiReact: 0 } },
      { frameIndex: 2, timestampMs: 16.66, totalMs: Number.NaN, stages: { input: -1, brushWasm: Number.NaN, webgpuComposite: 3.5, uiReact: 1.5 } },
    ];
    const before = structuredClone(samples);
    const direct = analyzeFrameTimeRing(samples);
    const ring = analyzeFrameTimeRing(pushFrameSamples(createFrameTimeRingBuffer(), samples));
    expect(direct).toEqual(ring);
    expect(direct.p99Ms).toBeGreaterThan(19);
    expect(direct.withinTargetBudget).toBe(false);
    expect(direct.stages.brushWasm.sharePct).toBeLessThanOrEqual(100);
    expect(direct.recentWindowMs).toEqual([20, 5]);
    expect(samples).toEqual(before);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("비정상 링 크기 %s를 순회·변경하지 않는다", (size) => {
    const ring = { ...createFrameTimeRingBuffer(), size };
    const before = structuredClone(ring);
    expect(() => analyzeFrameTimeRing(ring)).toThrow(RangeError);
    expect(() => pushFrameSamples(ring, [])).toThrow(RangeError);
    expect(ring).toEqual(before);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("처방 입력의 비정상 수치 %s는 결과를 만들지 않고 거부한다", (allocatedMb) => {
    const snapshot = pressureSnapshot();
    const plan = prescription(snapshot);
    const invalid = { ...snapshot, telemetry: { ...snapshot.telemetry, vram: { ...snapshot.telemetry.vram, allocatedMb } } };
    const before = structuredClone(invalid);
    expect(() => applyGuardrailPrescription(invalid, plan)).toThrow(RangeError);
    expect(invalid).toEqual(before);
  });

  it("실제 계측·정리와 계산 예제를 구분하고 되돌리기는 적용 직전 60Hz를 복원한다", () => {
    render(<StudioPerfDoctorPanel initialTab="runtime-health" />);
    expect(screen.getByTestId("perf-example-scope").textContent).toContain("연결되지 않았습니다");
    fireEvent.click(screen.getByTestId("btn-hz-60"));
    fireEvent.click(screen.getByTestId("btn-apply-guardrail"));
    expect(screen.getByTestId("guardrail-applied-banner").textContent).toContain("예제 계산 완료");
    expect(screen.getByTestId("guardrail-applied-banner").textContent).not.toContain("적용 완료");
    fireEvent.click(screen.getByTestId("btn-revert-guardrail"));
    expect(screen.getByTestId("btn-hz-60").getAttribute("aria-pressed")).toBe("true");
  });

  it("적용 콜백 대기·거부 시 이전 결과를 유지하고 같은 입력을 한 번만 재시도한다", async () => {
    const gate = deferred();
    const onGuardrailApplied = vi.fn<() => void | Promise<void>>().mockImplementationOnce(() => gate.promise).mockImplementation(() => undefined);
    render(<StudioPerfDoctorPanel initialTab="runtime-health" onGuardrailApplied={onGuardrailApplied} />);
    const before = screen.getByTestId("vram-usage-text").textContent;
    const button = screen.getByTestId("btn-apply-guardrail");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(onGuardrailApplied).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId("guardrail-applied-banner")).toBeNull();
    expect(screen.getByTestId("vram-usage-text").textContent).toBe(before);
    await act(async () => gate.reject(new Error("save rejected")));
    expect(screen.getByRole("alert").textContent).toContain("save rejected");
    fireEvent.click(screen.getByRole("button", { name: "같은 입력으로 다시 시도" }));
    await waitFor(() => expect(screen.getByTestId("guardrail-applied-banner")).toBeTruthy());
    expect(onGuardrailApplied).toHaveBeenCalledTimes(2);
    expect(onGuardrailApplied.mock.calls[1]).toEqual(onGuardrailApplied.mock.calls[0]);
  });

  it("두 번째 콜백 실패 재시도에서 성공한 첫 콜백을 반복하지 않는다", async () => {
    const onGuardrailApplied = vi.fn();
    const onDiagnosisChange = vi.fn().mockRejectedValueOnce(new Error("diagnosis rejected")).mockResolvedValue(undefined);
    render(<StudioPerfDoctorPanel initialTab="runtime-health" onGuardrailApplied={onGuardrailApplied} onDiagnosisChange={onDiagnosisChange} />);
    fireEvent.click(screen.getByTestId("btn-apply-guardrail"));
    await screen.findByRole("alert");
    expect(screen.queryByTestId("guardrail-applied-banner")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "같은 입력으로 다시 시도" }));
    await screen.findByTestId("guardrail-applied-banner");
    expect(onGuardrailApplied).toHaveBeenCalledTimes(1);
    expect(onDiagnosisChange).toHaveBeenCalledTimes(2);
  });

  it("동기 예외와 초기화 실패를 표시하고 취소하면 입력을 그대로 수정할 수 있다", () => {
    const onDiagnosisChange = vi.fn(() => { throw new Error("sync failure"); });
    render(<StudioPerfDoctorPanel onDiagnosisChange={onDiagnosisChange} />);
    fireEvent.click(screen.getByTestId("btn-hz-60"));
    expect(screen.getByRole("alert").textContent).toContain("sync failure");
    expect(screen.getByTestId("btn-hz-120").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "오류 닫고 수정" }));
    fireEvent.click(screen.getByTestId("btn-reset-ring"));
    expect(screen.getByRole("alert").textContent).toContain("sync failure");
    expect(onDiagnosisChange).toHaveBeenCalledTimes(2);
  });
});
