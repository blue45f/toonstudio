// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
  evaluateBarrelRollCalligraphicResponse,
  evaluateStylusDynamicResponse,
  fitStudioStylusPressureProfile,
  normalizeHardwareStylusPacket,
  normalizeStudioStylusPressureProfile,
  resolveStudioStylusPressureInput,
  STUDIO_STYLUS_PRESSURE_PROFILE_POINT_LIMIT,
  studioStylusPressureProfileMap,
  studioStylusPressurePreset,
} from "./studio-stylus-pressure-profile";
import {
  getStudioStylusPressureProfileSnapshot,
  resetStudioStylusPressureProfile,
  setStudioStylusPressureProfile,
  STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY,
  subscribeStudioStylusPressureProfile,
} from "./studio-stylus-pressure-profile-store";

beforeEach(() => {
  window.localStorage.clear();
  resetStudioStylusPressureProfile({ persist: false });
});

describe("studio stylus pressure profile", () => {
  it("normalizes untrusted points into a bounded monotone curve", () => {
    const profile = normalizeStudioStylusPressureProfile({
      enabled: true,
      deadZone: -2,
      saturation: 4,
      points: [
        { input: 0.8, output: 0.3 },
        { input: 0.2, output: 0.6 },
        { input: 0.205, output: 0.4 },
        { input: Number.NaN, output: 0.5 },
        { input: 0.4, output: 0.2 },
        { input: 0.5, output: 0.7 },
        { input: 0.6, output: 0.65 },
        { input: 0.7, output: 0.9 },
        { input: 0.9, output: 0.95 },
      ],
    });

    expect(profile.deadZone).toBe(0);
    expect(profile.saturation).toBe(1);
    expect(profile.points.length).toBeLessThanOrEqual(
      STUDIO_STYLUS_PRESSURE_PROFILE_POINT_LIMIT,
    );
    expect(profile.points[0]).toEqual({ input: 0, output: 0 });
    expect(profile.points.at(-1)).toEqual({ input: 1, output: 1 });

    for (let index = 1; index < profile.points.length; index += 1) {
      expect(profile.points[index]!.input).toBeGreaterThan(
        profile.points[index - 1]!.input,
      );
      expect(profile.points[index]!.output).toBeGreaterThanOrEqual(
        profile.points[index - 1]!.output,
      );
    }
  });

  it("maps the identity preset without changing pressure", () => {
    const profile = studioStylusPressurePreset("linear");

    expect(studioStylusPressureProfileMap(0, profile)).toBe(0);
    expect(studioStylusPressureProfileMap(0.25, profile)).toBeCloseTo(0.25, 6);
    expect(studioStylusPressureProfileMap(0.75, profile)).toBeCloseTo(0.75, 6);
    expect(studioStylusPressureProfileMap(1, profile)).toBe(1);
  });

  it("applies dead-zone and saturation while keeping output monotone", () => {
    const profile = normalizeStudioStylusPressureProfile({
      deadZone: 0.2,
      saturation: 0.8,
      points: [
        { input: 0, output: 0 },
        { input: 0.5, output: 0.75 },
        { input: 1, output: 1 },
      ],
    });

    expect(studioStylusPressureProfileMap(0.1, profile)).toBe(0);
    expect(studioStylusPressureProfileMap(0.8, profile)).toBe(1);

    const mapped = Array.from({ length: 21 }, (_, index) => (
      studioStylusPressureProfileMap(index / 20, profile)
    ));
    for (let index = 1; index < mapped.length; index += 1) {
      expect(mapped[index]).toBeGreaterThanOrEqual(mapped[index - 1]!);
    }
  });

  it("conditions pen and force-touch samples but preserves mouse and fixed touch", () => {
    const profile = studioStylusPressurePreset("light-touch");
    const mappedPen = resolveStudioStylusPressureInput("PEN", 0.25, profile);

    expect(mappedPen).toBeTypeOf("number");
    expect(mappedPen).not.toBe(0.25);
    expect(resolveStudioStylusPressureInput("mouse", 0.25, profile)).toBe(0.25);
    expect(resolveStudioStylusPressureInput("touch", 0.5, profile)).toBe(0.5);
    expect(resolveStudioStylusPressureInput("touch", 0.25, profile)).toBe(mappedPen);
    expect(resolveStudioStylusPressureInput("pen", Number.NaN, profile)).toBeNaN();
    expect(resolveStudioStylusPressureInput("pen", 2, profile)).toBe(2);
  });

  it("fits a finite calibration profile only from a useful pressure range", () => {
    expect(fitStudioStylusPressureProfile([0.2, 0.3, 0.4])).toBeNull();
    expect(fitStudioStylusPressureProfile(Array.from({ length: 20 }, () => 0.5))).toBeNull();

    const fitted = fitStudioStylusPressureProfile(
      Array.from({ length: 32 }, (_, index) => 0.04 + index * 0.029),
    );

    expect(fitted).not.toBeNull();
    expect(fitted!.deadZone).toBeGreaterThanOrEqual(0);
    expect(fitted!.saturation).toBeLessThanOrEqual(1);
    expect(fitted!.points[0]).toEqual({ input: 0, output: 0 });
    expect(fitted!.points.at(-1)).toEqual({ input: 1, output: 1 });
  });

  it("persists profiles and notifies subscribers without leaking document state", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeStudioStylusPressureProfile(listener);
    const profile = studioStylusPressurePreset("inking");

    setStudioStylusPressureProfile(profile);

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStudioStylusPressureProfileSnapshot()).toEqual(profile);
    expect(
      JSON.parse(
        window.localStorage.getItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY) ?? "null",
      ),
    ).toEqual(profile);

    unsubscribe();
    resetStudioStylusPressureProfile();

    expect(listener).toHaveBeenCalledTimes(1);
    expect(getStudioStylusPressureProfileSnapshot()).toEqual(
      DEFAULT_STUDIO_STYLUS_PRESSURE_PROFILE,
    );
    expect(
      window.localStorage.getItem(STUDIO_STYLUS_PRESSURE_PROFILE_STORAGE_KEY),
    ).toBeNull();
  });

  it("evaluates hardware stylus pressure, velocity-simulated mouse pressure, and tilt-broadening factor", () => {
    const penResponse = evaluateStylusDynamicResponse({
      pointerType: "pen",
      rawPressure: 0.72,
      tiltDeg: 65,
      profile: studioStylusPressurePreset("inking"),
    });
    expect(penResponse.sourceMode).toBe("hardware-stylus");
    expect(penResponse.effectivePressure).toBeGreaterThan(0.7);
    expect(penResponse.tiltBroadeningFactor).toBeGreaterThan(1.5);

    const slowMouse = evaluateStylusDynamicResponse({
      pointerType: "mouse",
      rawPressure: 0.5,
      velocityPxPerMs: 0.1,
      tiltDeg: 0,
    });
    const fastMouse = evaluateStylusDynamicResponse({
      pointerType: "mouse",
      rawPressure: 0.5,
      velocityPxPerMs: 3.5,
      tiltDeg: 0,
    });
    expect(slowMouse.sourceMode).toBe("velocity-simulated");
    expect(slowMouse.effectivePressure).toBeGreaterThan(fastMouse.effectivePressure);
    expect(slowMouse.tiltBroadeningFactor).toBe(1);
  });

  it("normalizes 6-DoF hardware stylus packets across tiltX/Y and spherical altitude/azimuth and evaluates barrel-roll calligraphy", () => {
    const fromTilt = normalizeHardwareStylusPacket({
      pointerType: "pen",
      pressure: 0.8,
      tiltX: 45,
      tiltY: 0,
      twist: 90,
      tangentialPressure: 0.5,
    });
    expect(fromTilt.pointerType).toBe("pen");
    expect(fromTilt.tiltMagnitudeDeg).toBeCloseTo(45, 1);
    expect(fromTilt.twistDeg).toBe(90);
    expect(fromTilt.tangentialPressure).toBe(0.5);

    const fromSpherical = normalizeHardwareStylusPacket({
      pointerType: "pen",
      pressure: 0.8,
      altitudeAngle: Math.PI / 4,
      azimuthAngle: 0,
      twist: 0,
    });
    expect(fromSpherical.tiltXDeg).toBeCloseTo(45, 1);
    expect(fromSpherical.tiltYDeg).toBeCloseTo(0, 1);

    // 스트로크 방향(0 rad)과 펜촉 방향(90 deg = PI/2 rad)이 수직일 때 최대 폭(1.0), 평행(0 deg)일 때 최소 폭(1/aspect)
    const broadStroke = evaluateBarrelRollCalligraphicResponse(fromTilt, {
      strokeDirectionRad: 0,
      nibAngleDeg: 0,
      nibAspectRatio: 4,
    });
    const hairlineStroke = evaluateBarrelRollCalligraphicResponse(fromSpherical, {
      strokeDirectionRad: 0,
      nibAngleDeg: 0,
      nibAspectRatio: 4,
    });
    expect(broadStroke.widthScale).toBeGreaterThan(0.95);
    expect(hairlineStroke.widthScale).toBeCloseTo(0.25, 2);
    expect(hairlineStroke.edgeSharpness).toBeGreaterThan(broadStroke.edgeSharpness);
    expect(broadStroke.tangentialFlowScale).toBeGreaterThan(1.2);
  });
});
