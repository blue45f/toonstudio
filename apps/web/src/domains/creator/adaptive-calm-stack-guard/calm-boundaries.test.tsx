// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_ASSISTANT_SUGGESTIONS, DEFAULT_GESTURE_MACROS, StudioAdaptiveCalmGuardPanel,
  applyAdaptiveCalmSession, computeAdaptiveCalmLayoutPlan, createAdaptiveCalmSession, evaluateDeviceThermalBudget, exportAdaptiveCalmConfigJson,
  rankAndStackAssistantSuggestions, updateGestureMacro, updateWorkingCalmSnapshot } from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function exportInput() {
  const session = createAdaptiveCalmSession(); const working = session.working;
  return { session, layoutPlan: computeAdaptiveCalmLayoutPlan(working.contextId, { focusBoost: working.focusBoost }),
    assistantStack: rankAndStackAssistantSuggestions({ contextId: working.contextId }),
    thermalReport: evaluateDeviceThermalBudget(working.deviceTierId, working.features, working.appliedDegradationIds) };
}

describe("Calm 구성 예제의 원본·ID·출력 경계", () => {
  it("updater가 중첩 객체를 바꾼 뒤 throw해도 현재 설정·baseline을 보존한다", () => {
    const session = createAdaptiveCalmSession(); const before = structuredClone(session);
    expect(() => updateWorkingCalmSnapshot(session, working => {
      Object.assign(working.features, { canvas4k: !working.features.canvas4k });
      throw new Error("설정 계산 실패");
    })).toThrow();
    expect(session).toEqual(before);
  });
  it("중복 제안 ID가 보류·복원과 카드 키를 함께 가리키지 않도록 거부한다", () => {
    const first = DEFAULT_ASSISTANT_SUGGESTIONS[0];
    if (!first) throw new Error("회귀 입력 제안이 없습니다.");
    expect(() => rankAndStackAssistantSuggestions({ contextId: "rough-conti", suggestions: [first, { ...first }] })).toThrow();
  });
  it("큰 제안 목록은 정렬·카드 할당 전에 원본 보존 오류로 거부한다", () => {
    const first = DEFAULT_ASSISTANT_SUGGESTIONS[0];
    if (!first) throw new Error("회귀 입력 제안이 없습니다.");
    const suggestions = Array.from({ length: 65 }, (_, index) => ({ ...first, id: `suggestion-${index}` }));
    const before = structuredClone(suggestions);
    expect(() => rankAndStackAssistantSuggestions({ contextId: "rough-conti", suggestions })).toThrow();
    expect(suggestions).toEqual(before);
  });
  it("같은 제스처 trigger를 두 번 업데이트하지 않고 중복 액션 경고 계약은 유지한다", () => {
    const first = DEFAULT_GESTURE_MACROS[0];
    if (!first) throw new Error("회귀 입력 제스처가 없습니다.");
    const macros = [first, { ...first }]; const before = structuredClone(macros);
    expect(() => updateGestureMacro(macros, first.triggerId, { enabled: false })).toThrow();
    expect(macros).toEqual(before);
  });
  it("stale 레이아웃·NaN 열 지표는 정상 JSON으로 내보내지 않는다", () => {
    const input = exportInput();
    expect(() => exportAdaptiveCalmConfigJson({ ...input, layoutPlan: { ...input.layoutPlan, adaptedViewportPct: NaN } })).toThrow();
    expect(() => exportAdaptiveCalmConfigJson({ ...input, thermalReport: { ...input.thermalReport, current: { ...input.thermalReport.current, estimatedMemoryMb: NaN } } })).toThrow();
  });
  it("현재 수치 모델만 내보내고 외부 metadata·개인정보는 통과시키지 않는다", () => {
    const input = exportInput();
    Object.assign(input.thermalReport.current, { privateNote: "synthetic-private-fixture" });
    const before = structuredClone(input); const json = exportAdaptiveCalmConfigJson(input); const parsed = JSON.parse(json);
    expect(json).not.toContain("synthetic-private-fixture"); expect(parsed.sourceKind).toBe("cpu-config-example");
    expect(parsed.studioSettingsApplied).toBe(false); expect(parsed.hardwareMeasured).toBe(false); expect(input).toEqual(before);
  });
  it("동일 설정 갱신은 선택 상태를 유지하고 실제 변경만 메모리 초안으로 분리한다", () => {
    const session = applyAdaptiveCalmSession(createAdaptiveCalmSession());
    expect(updateWorkingCalmSnapshot(session, working => working).status).toBe("applied");
    const edited = updateWorkingCalmSnapshot(session, working => ({ ...working, focusBoost: !working.focusBoost }));
    expect(edited.status).toBe("idle"); expect(edited.applied).toEqual(session.applied);
    expect(edited.baseline).toEqual(session.baseline);
  });
});

describe("Calm 구성 예제의 수신 확인", () => {
  it("수신자가 없으면 실제 UI·장치 적용 성공이 아닌 메모리 예제로 표시한다", () => {
    render(<StudioAdaptiveCalmGuardPanel />); fireEvent.click(screen.getByTestId("calm-apply-btn"));
    expect(screen.getByTestId("calm-example-scope").textContent).toContain("실제");
    expect(screen.getByTestId("calm-delivery-apply").textContent).toContain("미연결");
  });
  it("클립보드 미지원에서는 외부 알림을 호출하지 않고 재시도를 제공한다", async () => {
    vi.stubGlobal("navigator", {}); const recipient = vi.fn();
    render(<StudioAdaptiveCalmGuardPanel onExportJson={recipient} />); fireEvent.click(screen.getByTestId("calm-copy-json-btn"));
    expect(recipient).not.toHaveBeenCalled(); expect(await screen.findByTestId("calm-copy-retry")).toBeTruthy();
  });
  it("복사 ACK·최신 수신자를 기다리고 pending 중복을 막는다", async () => {
    const gate = Promise.withResolvers<void>(); const write = vi.fn(() => gate.promise); vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn(); const latest = vi.fn(); const view = render(<StudioAdaptiveCalmGuardPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("calm-copy-json-btn")); fireEvent.click(screen.getByTestId("calm-copy-json-btn"));
    expect(write).toHaveBeenCalledTimes(1); expect(first).not.toHaveBeenCalled();
    view.rerender(<StudioAdaptiveCalmGuardPanel onExportJson={latest} />); await act(async () => { gate.resolve(); });
    expect(latest).toHaveBeenCalledTimes(1);
  });
  it("적용 pending 중복·reject를 구분하고 같은 결과를 최신 수신자에게 재알림한다", async () => {
    const gate = Promise.withResolvers<void>(); const first = vi.fn(() => gate.promise); const latest = vi.fn();
    const view = render(<StudioAdaptiveCalmGuardPanel onApply={first} />);
    fireEvent.click(screen.getByTestId("calm-apply-btn")); fireEvent.click(screen.getByTestId("calm-apply-btn"));
    expect(first).toHaveBeenCalledTimes(1); const sent = first.mock.calls[0];
    await act(async () => { gate.reject(new Error("구성 예제 알림 거절")); });
    view.rerender(<StudioAdaptiveCalmGuardPanel />); fireEvent.click(screen.getByTestId("calm-retry-apply"));
    expect(screen.getByTestId("calm-retry-apply")).toBeTruthy();
    view.rerender(<StudioAdaptiveCalmGuardPanel onApply={latest} />); fireEvent.click(screen.getByTestId("calm-retry-apply"));
    expect(latest).toHaveBeenCalledTimes(1); expect(latest.mock.calls[0]).toEqual(sent);
    expect(latest.mock.calls[0]?.[1].historyCount).toBe(1);
  });
  it("동기 throw 후에도 원복 경로와 초기 개인 설정 예제를 보존한다", () => {
    const recipient = vi.fn(() => { throw new Error("동기 알림 실패"); });
    render(<StudioAdaptiveCalmGuardPanel onApply={recipient} initialContextId="line-inking" />);
    fireEvent.click(screen.getByTestId("calm-context-qa-export")); fireEvent.click(screen.getByTestId("calm-apply-btn"));
    expect(screen.getByTestId("calm-retry-apply")).toBeTruthy(); fireEvent.click(screen.getByTestId("calm-revert-btn"));
    expect(screen.getByTestId("calm-context-line-inking").getAttribute("aria-pressed")).toBe("true");
  });
  it("복사 후 알림 실패는 설정 변경 후에도 같은 JSON·UTF-8 크기로 복사 없이 재알림한다", async () => {
    const write = vi.fn().mockResolvedValue(undefined); vi.stubGlobal("navigator", { clipboard: { writeText: write } });
    const first = vi.fn().mockRejectedValue(new Error("JSON 알림 거절")); const latest = vi.fn();
    const view = render(<StudioAdaptiveCalmGuardPanel onExportJson={first} />);
    fireEvent.click(screen.getByTestId("calm-copy-json-btn")); await screen.findByTestId("calm-copy-retry");
    const sent = first.mock.calls[0]; const text = write.mock.calls[0]?.[0];
    fireEvent.click(screen.getByTestId("calm-context-qa-export"));
    view.rerender(<StudioAdaptiveCalmGuardPanel onExportJson={latest} />); fireEvent.click(screen.getByTestId("calm-copy-retry"));
    await waitFor(() => expect(latest).toHaveBeenCalledTimes(1)); expect(latest.mock.calls[0]).toEqual(sent);
    expect(write).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("calm-copy-status").textContent).toContain(`${new TextEncoder().encode(text).byteLength.toLocaleString("ko-KR")} B`);
  });
  it("클립보드 거절 뒤 같은 JSON을 재복사하고 ACK 뒤에만 알린다", async () => {
    const write = vi.fn().mockRejectedValueOnce(new Error("복사 거절")).mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText: write } }); const recipient = vi.fn();
    render(<StudioAdaptiveCalmGuardPanel onExportJson={recipient} />);
    fireEvent.click(screen.getByTestId("calm-copy-json-btn")); await screen.findByTestId("calm-copy-retry");
    expect(recipient).not.toHaveBeenCalled(); const text = write.mock.calls[0]?.[0];
    fireEvent.click(screen.getByTestId("calm-copy-retry")); await waitFor(() => expect(recipient).toHaveBeenCalledTimes(1));
    expect(write.mock.calls[1]?.[0]).toBe(text);
  });
});
