// @vitest-environment jsdom
import { createElement } from "react";

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import {
  StudioP3ColorLightingPanel, type StudioP3ColorLightingPanelProps, createDemoCharacterSurfaceBuffers, evaluateCmykTac,
  getLightingPresetById, renderDynamicLitBuffer, softProofToCmyk,
} from "./index";

afterEach(cleanup);

describe("CMYK 근사 계산 경계", () => {
  it("미등록 프로파일을 거부하고 생략한 옵션의 기본값은 유지한다", () => {
    const cmyk = { c: 0, m: 0, y: 0, k: 0 };
    for (const profileId of ["unknown", "constructor", "toString"]) {
      expect(() => Reflect.apply(evaluateCmykTac, undefined, [cmyk, profileId])).toThrow(RangeError);
      expect(() => Reflect.apply(softProofToCmyk, undefined, [{ r: 0, g: 0, b: 0 }, "srgb", profileId])).toThrow(RangeError);
    }
    expect(softProofToCmyk({ r: 0, g: 0, b: 0 }, "srgb", "FOGRA39", { gcrStrength: undefined }).cmyk)
      .toEqual(softProofToCmyk({ r: 0, g: 0, b: 0 }, "srgb", "FOGRA39").cmyk);
  });
  it.each([NaN, Infinity, -Infinity, -0.01, 1.01])("유효하지 않은 CMYK 채널 %s는 안전 판정을 반환하지 않는다", (value) => {
    for (const channel of ["c", "m", "y", "k"] as const) {
      expect(() => evaluateCmykTac({ c: 0, m: 0, y: 0, k: 0, [channel]: value }, "FOGRA39")).toThrow(RangeError);
    }
    expect(() => softProofToCmyk({ r: value, g: 0, b: 0 }, "srgb", "FOGRA39")).toThrow(RangeError);
  });

  it("정상 CMYK 근사 결과도 ICC 적용·인쇄 적합성 검증 성공이라고 하지 않는다", () => {
    const proof = softProofToCmyk({ r: 1, g: 1, b: 1 }, "srgb", "FOGRA39");
    expect(proof).toMatchObject({ method: "heuristic-cmyk-demo", iccProfileApplied: false, printSafetyVerified: false });
    expect(proof.tac).toMatchObject({ level: "safe", totalInkPercent: 0, printSafetyVerified: false });
    expect(proof.tac.messageKo).toContain("실제 인쇄 적합성 미검증");
    expect(proof.tac.messageEn).not.toContain("print-safe");
    render(createElement<StudioP3ColorLightingPanelProps>(StudioP3ColorLightingPanel, { initialTab: "softproof" }));
    expect(screen.getByTestId("color-lighting-scope-notice").textContent).toContain("ICC 프로파일 없는 근사식");
    fireEvent.click(screen.getByTestId("p3-tab-lighting"));
    expect(screen.getByTestId("lighting-preview-mosaic").getAttribute("aria-label")).toContain("CPU 합성 표면");
    expect(screen.getByText(/미연결 WGSL 참고 코드/).textContent).toContain("컴파일 미검증");
  });
});

describe("CPU 조명 표면 입력·보존 경계", () => {
  const config = getLightingPresetById("seoul-golden-sunset").config;

  it.each([0, -1, 2.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])("잘못된 geometry %s를 거부한다", (width) => {
    expect(() => createDemoCharacterSurfaceBuffers(width, 2)).toThrow(RangeError);
    const surface = createDemoCharacterSurfaceBuffers(2, 2);
    expect(() => renderDynamicLitBuffer({ ...surface, width }, config)).toThrow(RangeError);
  });

  it("잘린 표면 채널 및 비유한·범위 밖 float 채널은 픽셀 성공 결과를 만들지 않는다", () => {
    const surface = createDemoCharacterSurfaceBuffers(2, 2);
    expect(() => renderDynamicLitBuffer({ ...surface, albedoRgba: surface.albedoRgba.slice(0, 4) }, config)).toThrow(RangeError);
    for (const channel of ["normalRgb", "depthBuffer", "skinMask"] as const) {
      expect(() => renderDynamicLitBuffer({ ...surface, [channel]: new Float32Array(0) }, config)).toThrow(RangeError);
      const invalid = surface[channel].slice();
      invalid[0] = NaN;
      expect(() => renderDynamicLitBuffer({ ...surface, [channel]: invalid }, config)).toThrow(RangeError);
      invalid[0] = 2;
      expect(() => renderDynamicLitBuffer({ ...surface, [channel]: invalid }, config)).toThrow(RangeError);
    }
  });

  it("원본 RGBA·normal·depth·mask를 수정하지 않고 출력 알파를 보존한다", () => {
    const surface = createDemoCharacterSurfaceBuffers(2, 2);
    surface.albedoRgba[3] = 0;
    surface.albedoRgba[7] = 64;
    const snapshot = {
      albedoRgba: surface.albedoRgba.slice(), normalRgb: surface.normalRgb.slice(),
      depthBuffer: surface.depthBuffer.slice(), skinMask: surface.skinMask.slice(),
    };
    const result = renderDynamicLitBuffer(surface, config);
    expect(result).toMatchObject({ backend: "cpu", gpuExecuted: false });
    expect(result.rgba).not.toBe(surface.albedoRgba);
    expect(result.rgba[3]).toBe(0);
    expect(result.rgba[7]).toBe(64);
    for (const channel of ["albedoRgba", "normalRgb", "depthBuffer", "skinMask"] as const) {
      expect(surface[channel]).toEqual(snapshot[channel]);
    }
  });
});
