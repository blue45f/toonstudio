// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_FOCUS_AUTO_PAN_CONFIG, StudioFocusPanHapticPanel, WORK_RHYTHM_PRESETS,
  computeFocusAutoPanDelta, createFocusHapticSession, evaluateWorkRhythmSession,
  exportFocusHapticProfileJson, synthesizeNibHapticResponse, triggerSafeNavigatorVibrate,
} from "./index";

afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const preview = (): void => { fireEvent.click(screen.getByTestId("nib-preset-card-marker-smooth")); };

describe("장치 호출 경계 — 실제 장치는 사용하지 않는다", () => {
  it("0ms 진동을 제거해 쉼과 진동 순서를 뒤집지 않는다", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    expect(triggerSafeNavigatorVibrate([0, 40, 20])).toBe(true);
    expect(vibrate).toHaveBeenCalledWith([0, 40, 20]);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1])("비정상 펄스 %s는 장치에 보내지 않는다", (bad) => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    expect(triggerSafeNavigatorVibrate([bad, 40, 20])).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("명시 인수가 false여도 현재 OS 모션 축소를 장치 경계에서 확인한다", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    expect(triggerSafeNavigatorVibrate([10, 10, 10], false)).toBe(false);
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("초기화 뒤에도 OS 모션 축소를 유지하고 장치를 호출하지 않는다", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    render(<StudioFocusPanHapticPanel />);
    fireEvent.click(screen.getByTestId("focus-reset-btn"));
    expect(screen.getByTestId("reduced-motion-guard-btn").getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("nib-vibrate-test-btn"));
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("패널을 연 뒤 OS 설정이 바뀌어도 진동 테스트는 최신 설정을 따른다", () => {
    let reduce = false;
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    vi.stubGlobal("matchMedia", () => ({ matches: reduce }));
    render(<StudioFocusPanHapticPanel />);
    reduce = true;
    fireEvent.click(screen.getByTestId("nib-vibrate-test-btn"));
    expect(vibrate).not.toHaveBeenCalled();
    expect(screen.getByRole("status").textContent).toContain("모션 축소");
  });
});

describe("예제·전달·내보내기 경계", () => {
  it("수동 합성 입력과 실제 캔버스·펜촉 반영을 구분하고 자동 진동은 하지 않는다", () => {
    const vibrate = vi.fn(() => true);
    vi.stubGlobal("navigator", { vibrate });
    render(<StudioFocusPanHapticPanel />);
    expect(screen.getByTestId("focus-example-disclosure").textContent).toContain("합성 예제");
    preview();
    fireEvent.click(screen.getByTestId("focus-toggle-json-btn"));
    const payload = JSON.parse(screen.getByTestId("focus-json-preview").textContent ?? "{}");
    expect(payload.execution).toEqual({ sampleSource: "synthetic-manual-input", canvasMutationVerified: false, hardwareExecutionVerified: false, persistenceVerified: false });
    expect(vibrate).not.toHaveBeenCalled();
  });

  it("비동기 적용 확인 전에는 상태를 확정하거나 중복 전달하지 않는다", async () => {
    let acknowledge: (() => void) | undefined;
    const onApply = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    render(<StudioFocusPanHapticPanel onApply={onApply} />);
    preview(); fireEvent.click(screen.getByTestId("focus-apply-btn"));
    fireEvent.click(screen.getByTestId("focus-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("focus-session-status-badge").textContent).not.toContain("적용됨");
    expect(screen.getByTestId("nib-vibrate-test-btn").matches(":disabled")).toBe(true);
    await act(async () => { acknowledge?.(); });
    expect(screen.getByTestId("focus-session-status-badge").textContent).toContain("예제 적용됨");
  });

  it.each(["throw", "reject", "decline"])("%s 적용 실패 후 최신 void 콜백으로 재시도한다", async (mode) => {
    const failed = vi.fn(() => {
      if (mode === "throw") throw new Error("전달 실패");
      if (mode === "reject") return Promise.reject(new Error("전달 실패"));
      return { accepted: false };
    });
    const view = render(<StudioFocusPanHapticPanel onApply={failed} />);
    preview(); fireEvent.click(screen.getByTestId("focus-apply-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("focus-session-status-badge").textContent).not.toContain("적용됨");
    const received: string[] = [];
    view.rerender(<StudioFocusPanHapticPanel onApply={() => received.push("ok")} />);
    fireEvent.click(screen.getByTestId("focus-apply-btn"));
    expect(received).toEqual(["ok"]);
  });

  it("초기화 복원 거절 시 적용 상태를 보존하고 되돌림으로 재시도한다", async () => {
    const onRevert = vi.fn().mockRejectedValueOnce(new Error("복원 실패")).mockResolvedValueOnce(undefined);
    render(<StudioFocusPanHapticPanel onRevert={onRevert} />);
    preview(); fireEvent.click(screen.getByTestId("focus-apply-btn"));
    fireEvent.click(screen.getByTestId("focus-reset-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("focus-session-status-badge").textContent).toContain("예제 적용됨");
    fireEvent.click(screen.getByTestId("focus-revert-btn"));
    await waitFor(() => expect(screen.getByTestId("nib-haptic-waveform-svg").getAttribute("data-nib-id")).toBe("kent-gpen"));
    expect(onRevert).toHaveBeenCalledTimes(2);
  });

  it("복사 실패를 알리고 JSON 미리보기와 복사 재시도를 제공한다", async () => {
    const writeText = vi.fn().mockRejectedValueOnce(new Error("복사 거절")).mockResolvedValueOnce(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioFocusPanHapticPanel />);
    fireEvent.click(screen.getByTestId("focus-copy-json-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByTestId("focus-json-preview")).toBeTruthy();
    expect(screen.queryByRole("status")?.textContent ?? "").not.toContain("복사했습니다");
    fireEvent.click(screen.getByTestId("focus-copy-json-btn"));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("복사했습니다"));
  });

  it("전달 거절 시 복사를 중복 실행하지 않는다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    render(<StudioFocusPanHapticPanel onExportJson={() => Promise.resolve({ accepted: false })} />);
    fireEvent.click(screen.getByTestId("focus-copy-json-btn"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(writeText).not.toHaveBeenCalled();
  });

  it("다른 펜촉의 파형이나 비유한 파생 수치를 JSON에 섞지 않는다", () => {
    const session = createFocusHapticSession();
    const rhythm = evaluateWorkRhythmSession(WORK_RHYTHM_PRESETS[0].input);
    const pan = computeFocusAutoPanDelta({ cursorNormX: 0.9, cursorNormY: 0.9, velocityX: 10, velocityY: 10, zoomLevel: 320 }, DEFAULT_FOCUS_AUTO_PAN_CONFIG);
    const haptic = synthesizeNibHapticResponse("marker-smooth", { pressure: 0.6, speedPxPerSec: 600 });
    expect(() => exportFocusHapticProfileJson(session, rhythm, pan, haptic)).toThrow();
    const matching = synthesizeNibHapticResponse("kent-gpen", { pressure: 0.6, speedPxPerSec: 600 });
    expect(() => exportFocusHapticProfileJson(session, rhythm, { ...pan, panDeltaX: Number.NaN }, matching)).toThrow();
  });
});
