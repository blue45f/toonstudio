// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { StudioPressureCalibrationPanel } from "../StudioPressureCalibrationPanel";

const key = "toonstudio:colordrop-settings:v1";
const props = { pressureCurve: 1, onPressureCurveChange: vi.fn(), pressureMinSize: 0.1, density: "compact" as const };
beforeEach(() => localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("ColorDrop 기기 설정 저장", () => {
  it("허용 오차와 대기 시간 두 필드만 저장하고 복원한다", () => {
    localStorage.setItem("studio-project-original", "원고 원본");
    const view = render(<StudioPressureCalibrationPanel {...props} />);
    fireEvent.change(screen.getByRole("slider", { name: "ColorDrop 허용 오차 임계값" }), { target: { value: "70" } });
    fireEvent.change(screen.getByRole("slider", { name: "ColorDrop 홀드 대기 시간" }), { target: { value: "600" } });
    expect(JSON.parse(localStorage.getItem(key) ?? "null")).toEqual({ thresholdPercent: 70, holdDelayMs: 600 });
    expect(localStorage.getItem("studio-project-original")).toBe("원고 원본");
    view.unmount();
    render(<StudioPressureCalibrationPanel {...props} />);
    expect(screen.getByRole<HTMLInputElement>("slider", { name: "ColorDrop 허용 오차 임계값" }).value).toBe("70");
    expect(screen.getByRole<HTMLInputElement>("slider", { name: "ColorDrop 홀드 대기 시간" }).value).toBe("600");
  });

  it("잘못된 수치는 기본값으로 복원하고 저장 거부 때 화면의 설정을 유지한다", () => {
    const original = JSON.stringify({ thresholdPercent: "invalid", holdDelayMs: 99999, project: "저장하지 않을 필드" });
    localStorage.setItem(key, original);
    render(<StudioPressureCalibrationPanel {...props} />);
    expect(screen.getByRole<HTMLInputElement>("slider", { name: "ColorDrop 허용 오차 임계값" }).value).toBe("35");
    expect(screen.getByRole<HTMLInputElement>("slider", { name: "ColorDrop 홀드 대기 시간" }).value).toBe("800");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("저장 거부"); });
    fireEvent.change(screen.getByRole("slider", { name: "ColorDrop 허용 오차 임계값" }), { target: { value: "65" } });
    expect(screen.getByRole<HTMLInputElement>("slider", { name: "ColorDrop 허용 오차 임계값" }).value).toBe("65");
    expect(localStorage.getItem(key)).toBe(original);
  });
});
