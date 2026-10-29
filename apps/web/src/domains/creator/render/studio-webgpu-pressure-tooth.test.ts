/**
 * 셰이더 필압 LUT·종이 이빨 단계 시험.
 *
 * GPU 가 없으므로 (1) wesl 링커로 텍스처 브러시 WGSL 전체를 해석하고, (2) WGSL 산술의 TS 재현(mirror)을
 * 기본값 항등성·LUT 표본·CPU 침착 권위와 대조한다. 실기기 GPU 픽셀은 검증하지 않았다.
 */
import { link } from "wesl";
import { describe, expect, it } from "vitest";

import {
  resolveStudioPaperDepositScaleForHeightV1,
  STUDIO_PAPER_MEDIA_INTERACTION_V1,
  type StudioPaperMediumV1,
} from "../brush/studio-paper-media-profile-v1";
import {
  studioStylusPressurePreset,
  studioStylusPressureProfileMap,
} from "../brush/studio-stylus-pressure-profile";
import { studioPressureCurveMap } from "../studio-pressure-curve-graph";

import { STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_SHADER } from "./studio-engine-webgpu-textured-brush-shader";
import {
  buildStudioWebGpuPressureLut,
  createStudioWebGpuPressureToothResponse,
  isCanonicalStudioWebGpuPressureToothResponse,
  isStudioWebGpuPressureLutIdentity,
  mirrorStudioWebGpuPaperGrainFactor,
  mirrorStudioWebGpuPressureResponse,
  packStudioWebGpuPressureToothUniform,
  studioWebGpuPaperToothForMedium,
  studioWebGpuPressureLutFromCurveExponent,
  studioWebGpuPressureLutFromStylusProfile,
} from "./studio-webgpu-pressure-tooth";
import {
  STUDIO_WEBGPU_PRESSURE_LUT_SIZE,
  STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_BYTES,
  STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_FLOATS,
} from "./studio-webgpu-pressure-tooth-contract";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const f32 = Math.fround;
const legacyGrainFactor = (height: number, depth: number): number => f32(f32(1 * f32(1 - f32(depth))) + f32(f32(height) * f32(depth)));
const PEAK_CATCH_MEDIA = (Object.keys(STUDIO_PAPER_MEDIA_INTERACTION_V1) as StudioPaperMediumV1[])
  .filter((medium) => STUDIO_PAPER_MEDIA_INTERACTION_V1[medium].mode === "peak-catch");

describe("필압 LUT 만들기", () => {
  it("기기 필압 프로필을 칸 i/255 에서 그대로 표본화하고 단조 비감소다", () => {
    for (const preset of ["light-touch", "firm-touch", "inking"] as const) {
      const profile = studioStylusPressurePreset(preset);
      const lut = studioWebGpuPressureLutFromStylusProfile(profile);
      expect(lut).toHaveLength(STUDIO_WEBGPU_PRESSURE_LUT_SIZE);
      lut.forEach((value, index) => {
        expect(value).toBe(f32(studioStylusPressureProfileMap(index / 255, profile)));
        if (index > 0) expect(value).toBeGreaterThanOrEqual(lut[index - 1]);
      });
      expect(isStudioWebGpuPressureLutIdentity(lut)).toBe(false);
    }
    expect(isStudioWebGpuPressureLutIdentity(studioWebGpuPressureLutFromStylusProfile(studioStylusPressurePreset("linear")))).toBe(true);
  });

  it("필압 곡선 그래프의 거듭제곱 곡선을 표본화하고 지수 1 은 항등이다", () => {
    const lut = studioWebGpuPressureLutFromCurveExponent(1.8);
    lut.forEach((value, index) => expect(value).toBe(f32(studioPressureCurveMap(index / 255, 1.8))));
    expect(isStudioWebGpuPressureLutIdentity(studioWebGpuPressureLutFromCurveExponent(1))).toBe(true);
  });

  it("단조가 아닌 매핑은 누적 최댓값으로 고치고 0~1 로 자르며, 유한하지 않은 값은 거부한다", () => {
    const lut = buildStudioWebGpuPressureLut((pressure) => (pressure < 0.5 ? pressure * 2.4 - 0.1 : 0.4));
    expect(lut[0]).toBe(0);
    expect(Math.max(...lut)).toBe(1);
    for (let index = 1; index < lut.length; index += 1) expect(lut[index]).toBeGreaterThanOrEqual(lut[index - 1]);
    expect(() => buildStudioWebGpuPressureLut(() => Number.NaN)).toThrow(RangeError);
  });
});

describe("응답 정규화와 uniform 배치", () => {
  it("항등 LUT 와 꺼진 이빨은 null(계획에 싣지 않음), 항등 LUT 의 비중은 0 으로 정규화한다", () => {
    const identity = studioWebGpuPressureLutFromCurveExponent(1);
    expect(createStudioWebGpuPressureToothResponse({ pressureLut: identity, sizeGain: 1 })).toBeNull();
    expect(createStudioWebGpuPressureToothResponse({})).toBeNull();
    const toothOnly = createStudioWebGpuPressureToothResponse({
      pressureLut: identity,
      sizeGain: 0.5,
      tooth: studioWebGpuPaperToothForMedium("charcoal"),
    });
    expect(toothOnly).toMatchObject({ pressureLut: null, sizeGain: 0, opacityGain: 0, flowGain: 0 });
    expect(Object.isFrozen(toothOnly)).toBe(true);
    expect(isCanonicalStudioWebGpuPressureToothResponse(toothOnly)).toBe(true);
  });

  it("범위·모양·단조를 검증한다", () => {
    const lut = studioWebGpuPressureLutFromCurveExponent(0.6);
    expect(() => createStudioWebGpuPressureToothResponse({ pressureLut: lut.slice(1) })).toThrow(TypeError);
    expect(() => createStudioWebGpuPressureToothResponse({ pressureLut: [...lut].reverse() })).toThrow(RangeError);
    expect(() => createStudioWebGpuPressureToothResponse({ pressureLut: lut, sizeGain: -0.1 })).toThrow(RangeError);
    const tooth = { thresholdLight: 0.5, thresholdHeavy: 0.2, feather: 0.1, pressureCurve: 1 };
    expect(() => createStudioWebGpuPressureToothResponse({ tooth: { ...tooth, thresholdHeavy: 0.6 } })).toThrow(RangeError);
    expect(() => createStudioWebGpuPressureToothResponse({ tooth: { ...tooth, feather: 0 } })).toThrow(RangeError);
    expect(() => createStudioWebGpuPressureToothResponse({ tooth: { ...tooth, pressureCurve: 9 } })).toThrow(RangeError);
    expect(isCanonicalStudioWebGpuPressureToothResponse({ kind: "studio-webgpu-pressure-tooth-response", version: 1 })).toBe(false);
  });

  it("uniform 배치: 머리 12 float + LUT 256 float = 1,072 바이트", () => {
    expect(STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_FLOATS).toBe(268);
    expect(STUDIO_WEBGPU_PRESSURE_TOOTH_UNIFORM_BYTES).toBe(1072);
    const identity = packStudioWebGpuPressureToothUniform(null);
    expect([...identity.subarray(0, 12)]).toEqual([0, 0, 0, 0, 0, 1, 0, 0.5, 1, 0, 0, 0]);
    identity.subarray(12).forEach((value, index) => expect(value).toBe(f32(index / 255)));
    const response = createStudioWebGpuPressureToothResponse({
      pressureLut: studioWebGpuPressureLutFromCurveExponent(2),
      sizeGain: 1,
      opacityGain: 0.5,
      flowGain: 0.25,
      tooth: studioWebGpuPaperToothForMedium("pencil"),
    });
    const packed = packStudioWebGpuPressureToothUniform(response);
    const pencil = STUDIO_PAPER_MEDIA_INTERACTION_V1.pencil;
    expect([...packed.subarray(0, 9)]).toEqual([
      1, 1, 0.5, 0.25, 1,
      f32(pencil.contactThresholdLight), f32(pencil.contactThresholdHeavy), f32(pencil.contactFeather), f32(pencil.pressureCurve),
    ]);
    expect([...packed.subarray(12)]).toEqual(response!.pressureLut);
  });
});

describe("TS 재현 — 기본값은 기존 셰이더 산술과 같다", () => {
  it("항등 uniform 에서 크기·알파 비율은 정확히 1, 결 변조는 기존 mix(1, grain, depth) 와 비트 단위로 같다", () => {
    const uniform = packStudioWebGpuPressureToothUniform(null);
    const next = lcg(8);
    for (let index = 0; index < 2000; index += 1) {
      const pressure = next();
      const response = mirrorStudioWebGpuPressureResponse(uniform, pressure, next());
      expect(response.sizeRatio).toBe(1);
      expect(response.alphaRatio).toBe(1);
      expect(response.mappedPressure).toBe(f32(pressure));
      const height = next();
      const depth = next();
      expect(Object.is(mirrorStudioWebGpuPaperGrainFactor(uniform, height, depth, response.toothThreshold), legacyGrainFactor(height, depth))).toBe(true);
    }
  });

  it("LUT 가 켜져 있어도 항등 매핑 칸에서는 비율이 정확히 1 이다(분모 하한과 무관)", () => {
    const lut = Array.from({ length: 256 }, (_, index) => f32(index / 255));
    lut[255] = 1;
    lut[200] = f32(201 / 255);
    const response = createStudioWebGpuPressureToothResponse({ pressureLut: lut, sizeGain: 1, opacityGain: 1, flowGain: 1 });
    const uniform = packStudioWebGpuPressureToothUniform(response);
    for (const pressure of [0, 1 / 255, 0.004, 0.25, 0.5]) {
      const mirrored = mirrorStudioWebGpuPressureResponse(uniform, f32(pressure), 0.5);
      if (mirrored.mappedPressure === f32(pressure)) {
        expect(mirrored.sizeRatio).toBe(1);
        expect(mirrored.alphaRatio).toBe(1);
      }
    }
  });
});

describe("TS 재현 — LUT 단계", () => {
  const profile = studioStylusPressurePreset("firm-touch");
  const response = createStudioWebGpuPressureToothResponse({
    pressureLut: studioWebGpuPressureLutFromStylusProfile(profile),
    sizeGain: 1,
    opacityGain: 0.5,
    flowGain: 1,
  });
  const uniform = packStudioWebGpuPressureToothUniform(response);

  it("dab 필압은 LUT 로 바뀌고(칸 사이 선형 보간) 기기 프로필 곡선과 1/255 안에서 같다", () => {
    const next = lcg(17);
    for (let index = 0; index < 500; index += 1) {
      const pressure = next();
      const mapped = mirrorStudioWebGpuPressureResponse(uniform, pressure, 1).mappedPressure;
      expect(Math.abs(mapped - studioStylusPressureProfileMap(pressure, profile))).toBeLessThan(1 / 255);
    }
    expect(mirrorStudioWebGpuPressureResponse(uniform, 1, 1).mappedPressure).toBe(1);
    expect(mirrorStudioWebGpuPressureResponse(uniform, 0, 1).mappedPressure).toBe(0);
  });

  it("크기 비율 = r(q)/r(p), 알파는 불투명도·흐름 비율의 곱이며 최종 알파가 1을 넘지 않는다", () => {
    const pressure = 0.4;
    const mirrored = mirrorStudioWebGpuPressureResponse(uniform, pressure, 0.3);
    const q = mirrored.mappedPressure;
    expect(mirrored.sizeRatio).toBeCloseTo(q / f32(pressure), 5);
    const opacity = (0.5 + 0.5 * q) / (0.5 + 0.5 * f32(pressure));
    expect(mirrored.alphaRatio).toBeCloseTo(opacity * (q / f32(pressure)), 5);
    const next = lcg(23);
    for (let index = 0; index < 500; index += 1) {
      const alpha = next();
      const ratio = mirrorStudioWebGpuPressureResponse(packStudioWebGpuPressureToothUniform(createStudioWebGpuPressureToothResponse({
        pressureLut: studioWebGpuPressureLutFromCurveExponent(0.35),
        opacityGain: 1,
        flowGain: 1,
      })), next(), alpha).alphaRatio;
      expect(alpha * ratio).toBeLessThanOrEqual(1 + 1e-6);
      expect(Number.isFinite(ratio)).toBe(true);
    }
  });
});

describe("TS 재현 — 종이 이빨 문턱(CPU peak-catch 권위와 대조)", () => {
  it("건식 매체 프리셋에서 침착은 resolveStudioPaperDepositScaleForHeightV1 과 2e-6 안에서 같다", () => {
    expect(PEAK_CATCH_MEDIA.length).toBeGreaterThan(3);
    const next = lcg(31);
    for (const medium of PEAK_CATCH_MEDIA) {
      const uniform = packStudioWebGpuPressureToothUniform(
        createStudioWebGpuPressureToothResponse({ tooth: studioWebGpuPaperToothForMedium(medium) }),
      );
      for (let index = 0; index < 400; index += 1) {
        const pressure = next();
        const height = next();
        const { toothThreshold } = mirrorStudioWebGpuPressureResponse(uniform, pressure, 1);
        const mirrored = mirrorStudioWebGpuPaperGrainFactor(uniform, height, 1, toothThreshold);
        const cpu = resolveStudioPaperDepositScaleForHeightV1(medium, f32(pressure), 1, f32(height));
        expect(Math.abs(mirrored - cpu)).toBeLessThan(2e-6);
      }
    }
    expect(studioWebGpuPaperToothForMedium("watercolor")).toBeNull();
    expect(studioWebGpuPaperToothForMedium("unknown")).toBeNull();
  });

  it("문턱은 필압이 셀수록 내려가 같은 높이에 더 많이 앉고, 결 깊이 0 이면 변조가 없다", () => {
    const uniform = packStudioWebGpuPressureToothUniform(
      createStudioWebGpuPressureToothResponse({ tooth: studioWebGpuPaperToothForMedium("pencil") }),
    );
    let previousThreshold = Infinity;
    let previousDeposit = -Infinity;
    for (let step = 0; step <= 20; step += 1) {
      const { toothThreshold } = mirrorStudioWebGpuPressureResponse(uniform, step / 20, 1);
      const deposit = mirrorStudioWebGpuPaperGrainFactor(uniform, 0.6, 1, toothThreshold);
      expect(toothThreshold).toBeLessThanOrEqual(previousThreshold);
      expect(deposit).toBeGreaterThanOrEqual(previousDeposit);
      previousThreshold = toothThreshold;
      previousDeposit = deposit;
      expect(mirrorStudioWebGpuPaperGrainFactor(uniform, 0.6, 0, toothThreshold)).toBe(1);
    }
    expect(previousDeposit).toBeGreaterThan(0.5);
  });
});

describe("WGSL 해석(wesl)", () => {
  it("텍스처 브러시 셰이더 전체(필압·이빨 단계 포함)가 해석되고 두 진입점과 단계 함수를 남긴다", async () => {
    const linked = (await link({ weslSrc: { main: STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_SHADER }, rootModuleName: "main" })).dest;
    for (const name of ["vs_main", "fs_main", "studio_pressure_response", "studio_pressure_lut", "studio_pressure_ratio", "studio_paper_grain_factor"]) {
      expect(linked).toContain(`fn ${name}(`);
    }
    expect(linked).toContain("var<uniform> studio_pressure_tooth: StudioPressureToothUniform");
  });

  it("문법 오류를 넣으면 실패한다(해석 시험이 실제로 검사함을 확인)", async () => {
    const broken = STUDIO_ENGINE_WEBGPU_TEXTURED_BRUSH_SHADER.replace("return mix(a, b, f);", "return mix(a, b, f)");
    await expect(link({ weslSrc: { main: broken }, rootModuleName: "main" })).rejects.toThrow();
  });
});
