// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { StudioStylusTiltAndMouseSection } from "./StudioStylusTiltAndMouseSection";
import {
  resetStudioStylusPressureProfile,
  setStudioStylusPressureProfile,
  getStudioStylusPressureProfileSnapshot,
} from "./studio-stylus-pressure-profile-store";
import { studioStylusPressurePreset } from "./studio-stylus-pressure-profile";
import {
  DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY,
  applyStudioStylusTiltPreset,
  evaluateStudioLiveStylusOrMouseSample,
  evaluateStudioMousePressureFallback,
  evaluateStudioStylusTiltCurve,
  getStudioStylusTiltMousePolicySnapshot,
  resetStudioStylusTiltMousePolicy,
  setStudioStylusTiltMousePolicy,
} from "./studio-stylus-tilt-mouse-policy";

beforeEach(() => {
  window.localStorage.clear();
  resetStudioStylusTiltMousePolicy();
  resetStudioStylusPressureProfile();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  resetStudioStylusTiltMousePolicy();
  resetStudioStylusPressureProfile();
});

describe("P1-07 필압·기울기 곡선 및 마우스 대체 동작", () => {
  it("기울기 각도에 따라 번짐 배율과 잉크 흐름을 단조 곡선으로 계산하고 프리셋을 적용한다", () => {
    const upright = evaluateStudioStylusTiltCurve(5);
    const angled = evaluateStudioStylusTiltCurve(48);
    const flat = evaluateStudioStylusTiltCurve(82);

    expect(upright.broadeningFactor).toBe(1);
    expect(angled.broadeningFactor).toBeGreaterThan(1.2);
    expect(flat.broadeningFactor).toBeCloseTo(
      DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY.maxTiltBroadening,
      2,
    );
    expect(flat.inkFlowScale).toBeLessThan(upright.inkFlowScale);

    const pencilPolicy = applyStudioStylusTiltPreset(
      DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY,
      "pencil-shade",
    );
    expect(evaluateStudioStylusTiltCurve(45, pencilPolicy).broadeningFactor).toBeGreaterThan(
      angled.broadeningFactor,
    );
  });

  it("마우스 대체 동작 3종(속도 감응·양끝 테이퍼·고정 두께)을 정확히 계산한다", () => {
    const velocitySlow = evaluateStudioMousePressureFallback({
      velocityPxPerMs: 0.1,
      policy: { ...DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY, mouseFallbackMode: "velocity" },
    });
    const velocityFast = evaluateStudioMousePressureFallback({
      velocityPxPerMs: 1.9,
      policy: { ...DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY, mouseFallbackMode: "velocity" },
    });
    expect(velocitySlow).toBeGreaterThan(velocityFast);

    const taperTip = evaluateStudioMousePressureFallback({
      strokeProgress01: 0.02,
      policy: { ...DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY, mouseFallbackMode: "taper-ends" },
    });
    const taperMid = evaluateStudioMousePressureFallback({
      strokeProgress01: 0.5,
      policy: { ...DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY, mouseFallbackMode: "taper-ends" },
    });
    expect(taperMid).toBeGreaterThan(taperTip);

    const fixedA = evaluateStudioMousePressureFallback({
      velocityPxPerMs: 0.1,
      strokeProgress01: 0.05,
      policy: { ...DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY, mouseFallbackMode: "fixed" },
    });
    const fixedB = evaluateStudioMousePressureFallback({
      velocityPxPerMs: 3.2,
      strokeProgress01: 0.95,
      policy: { ...DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY, mouseFallbackMode: "fixed" },
    });
    expect(fixedA).toBe(fixedB);
  });

  it("실시간 샘플 패드가 마우스·스타일러스 입력을 반영하고 기본값 복원 버튼이 필압·기울기·마우스 정책을 함께 초기화한다", () => {
    setStudioStylusPressureProfile(studioStylusPressurePreset("firm-touch"));
    setStudioStylusTiltMousePolicy({
      ...DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY,
      tiltPresetId: "calligraphy",
      tiltExponent: 1.8,
      mouseFallbackMode: "taper-ends",
      mouseSensitivity: 0.9,
    });

    render(<StudioStylusTiltAndMouseSection />);

    const resetBtn = screen.getByRole("button", { name: "필압·기울기 기본값 복원" });
    expect(resetBtn.matches(":disabled")).toBe(false);

    const pad = screen.getByRole("group", { name: "실시간 필압·기울기·마우스 샘플 패드" });
    fireEvent.pointerDown(pad, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 20,
      clientY: 20,
      pressure: 0.5,
      timeStamp: 100,
    });
    fireEvent.pointerMove(pad, {
      pointerId: 1,
      pointerType: "mouse",
      clientX: 120,
      clientY: 28,
      pressure: 0.5,
      timeStamp: 140,
    });
    fireEvent.pointerUp(pad, { pointerId: 1, pointerType: "mouse" });

    expect(screen.getByText(/마우스 대체 · 필압/)).toBeTruthy();
    expect(pad.querySelectorAll("line").length).toBeGreaterThanOrEqual(1);

    const penSample = evaluateStudioLiveStylusOrMouseSample({
      rawEvent: { pointerType: "pen", pressure: 0.65, tiltX: 38, tiltY: 18 },
      velocityPxPerMs: 0.4,
    });
    expect(penSample.pointerSource).toBe("hardware-stylus");
    expect(penSample.tiltDeg).toBeGreaterThan(35);
    expect(penSample.broadeningFactor).toBeGreaterThan(1.1);

    fireEvent.click(resetBtn);
    expect(getStudioStylusTiltMousePolicySnapshot()).toEqual(
      DEFAULT_STUDIO_STYLUS_TILT_MOUSE_POLICY,
    );
    expect(getStudioStylusPressureProfileSnapshot().points).toHaveLength(2);
    expect(resetBtn.matches(":disabled")).toBe(true);
  });
});
