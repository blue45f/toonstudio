import { describe, expect, it } from "vitest";

import {
  formatStudioBg3dLengthForInput,
  parseStudioBg3dLengthInput,
  STUDIO_BG3D_LENGTH_INPUT_EXAMPLES,
  STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS,
  type StudioBg3dLengthParseFailureReason,
} from "./studio-bg3d-inference-units";

function meters(input: string, options?: Parameters<typeof parseStudioBg3dLengthInput>[1]): number {
  const result = parseStudioBg3dLengthInput(input, options);
  if (!result.ok) throw new Error(`${input}: ${result.reason} ${result.message}`);
  return result.meters;
}

function reason(input: unknown, options?: Parameters<typeof parseStudioBg3dLengthInput>[1]) {
  const result = parseStudioBg3dLengthInput(input, options);
  if (result.ok) throw new Error(`${String(input)} 는 거부되어야 하지만 ${result.meters}m 로 해석되었습니다`);
  return result.reason satisfies StudioBg3dLengthParseFailureReason;
}

describe("studio-bg3d-inference-units 길이 입력 파서", () => {
  it("안내 예시 네 가지를 모두 정확한 미터 값으로 해석한다", () => {
    expect(meters("2.4m")).toBe(2.4);
    expect(meters("80cm")).toBe(0.8);
    expect(meters("1200mm")).toBe(1.2);
    expect(meters("3'6\"")).toBe(1.0668);
    for (const example of STUDIO_BG3D_LENGTH_INPUT_EXAMPLES) {
      expect(parseStudioBg3dLengthInput(example).ok).toBe(true);
    }
  });

  it("대소문자·공백·전각 문자를 허용 범위 안에서 정규화한다", () => {
    expect(meters("2.4 M")).toBe(2.4);
    expect(meters("  80  CM ")).toBe(0.8);
    expect(meters("１２００ｍｍ")).toBe(1.2);
    expect(meters("80㎝")).toBe(0.8);
    expect(meters("3′6″")).toBe(1.0668);
    expect(meters("3’6”")).toBe(1.0668);
  });

  it("피트·인치 조합을 여러 표기로 해석한다", () => {
    expect(meters("3'")).toBeCloseTo(0.9144, 9);
    expect(meters("42\"")).toBeCloseTo(1.0668, 9);
    expect(meters("3' 6\"")).toBe(1.0668);
    expect(meters("3ft 6in")).toBe(1.0668);
    expect(meters("3'6''")).toBe(1.0668);
    // 피트 바로 뒤의 단위 없는 숫자는 인치다 (SketchUp 관례).
    expect(meters("3'6")).toBe(1.0668);
    expect(meters("2.5ft")).toBeCloseTo(0.762, 9);
  });

  it("복합 미터법 표기를 큰 단위부터 합산한다", () => {
    expect(meters("1m 20cm")).toBe(1.2);
    expect(meters("1m20cm")).toBe(1.2);
    expect(meters("1m 20cm 5mm")).toBe(1.205);
  });

  it("한글 단위 별칭을 해석한다", () => {
    expect(meters("2.4미터")).toBe(2.4);
    expect(meters("80센티미터")).toBe(0.8);
    expect(meters("80센티")).toBe(0.8);
    expect(meters("1200밀리미터")).toBe(1.2);
    expect(meters("3피트 6인치")).toBe(1.0668);
  });

  it("영문 단위 별칭을 해석한다", () => {
    expect(meters("2 meters")).toBe(2);
    expect(meters("50 centimeters")).toBe(0.5);
    expect(meters("500 millimetres")).toBe(0.5);
    expect(meters("1 foot")).toBeCloseTo(0.3048, 9);
    expect(meters("2 inches")).toBeCloseTo(0.0508, 9);
  });

  it("단위 없는 숫자는 기본 단위를 쓰고 그 사실을 알려 준다", () => {
    const defaultMeters = parseStudioBg3dLengthInput("2.4");
    expect(defaultMeters.ok && defaultMeters.usedDefaultUnit).toBe(true);
    expect(meters("2.4")).toBe(2.4);
    expect(meters("80", { defaultUnit: "cm" })).toBe(0.8);
    expect(meters("1200", { defaultUnit: "mm" })).toBe(1.2);
    expect(meters(".5")).toBe(0.5);
    const explicit = parseStudioBg3dLengthInput("2.4m");
    expect(explicit.ok && explicit.usedDefaultUnit).toBe(false);
  });

  it("requireUnit 이면 단위 없는 숫자를 거부한다", () => {
    expect(reason("2.4", { requireUnit: true })).toBe("missing-unit");
    expect(meters("2.4m", { requireUnit: true })).toBe(2.4);
  });

  it("부동소수점 잡음을 1e-9m 단위로 정리한다", () => {
    expect(meters("0.1m 0.2cm")).toBe(0.102);
    expect(meters("3'6\"")).toBe(1.0668);
    expect(meters("0.3ft")).toBe(0.09144);
  });

  it("비어 있거나 숫자 없는 입력을 이유와 함께 거부한다", () => {
    expect(reason("")).toBe("empty");
    expect(reason("   ")).toBe("empty");
    expect(reason("m")).toBe("missing-number");
    expect(reason("cm")).toBe("missing-number");
    expect(reason("+")).toBe("missing-number");
    expect(reason(".")).toBe("missing-number");
    expect(reason(".m")).toBe("missing-number");
  });

  it("텍스트가 아닌 입력과 지나치게 긴 입력을 거부한다", () => {
    expect(reason(2.4)).toBe("not-text");
    expect(reason(null)).toBe("not-text");
    expect(reason(undefined)).toBe("not-text");
    expect(reason("1".repeat(STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS + 1))).toBe("too-long");
    expect(reason("1".repeat(STUDIO_BG3D_LENGTH_INPUT_MAX_CHARACTERS * 3))).toBe("too-long");
  });

  it("쉼표·지수·분수·16진수를 조용히 보정하지 않고 거부한다", () => {
    expect(reason("2,4m")).toBe("decimal-comma");
    expect(reason("1,200mm")).toBe("decimal-comma");
    expect(reason("1e3m")).toBe("scientific-notation");
    expect(reason("2.5E-1m")).toBe("scientific-notation");
    expect(reason("1/2\"")).toBe("fraction");
    expect(reason("3 1/2\"")).toBe("fraction");
    expect(reason("0x10")).toBe("unknown-unit");
  });

  it("소수점 오류를 구분한다", () => {
    expect(reason("5.m")).toBe("trailing-decimal-point");
    expect(reason("5.")).toBe("trailing-decimal-point");
    expect(reason("1.2.3m")).toBe("multiple-decimal-points");
  });

  it("알 수 없는 단위와 허용되지 않는 문자를 거부한다", () => {
    expect(reason("2.4km")).toBe("unknown-unit");
    expect(reason("2.4mx")).toBe("unknown-unit");
    expect(reason("80c m")).toBe("unknown-unit");
    expect(reason("2.4m!")).toBe("invalid-character");
    expect(reason("2.4m;")).toBe("invalid-character");
    expect(reason("3-6")).toBe("invalid-character");
  });

  it("단위 순서·중복·혼합을 거부한다", () => {
    expect(reason("20cm 1m")).toBe("unit-order");
    expect(reason("1m 1m")).toBe("unit-repeated");
    expect(reason("1cm 2cm")).toBe("unit-repeated");
    expect(reason("1m 3'")).toBe("mixed-systems");
    expect(reason("3' 20cm")).toBe("mixed-systems");
    expect(reason("6\" 3'")).toBe("unit-order");
  });

  it("모호한 뒤따르는 숫자를 거부한다", () => {
    expect(reason("1m 20")).toBe("ambiguous-trailing-number");
    expect(reason("20 1m")).toBe("ambiguous-trailing-number");
  });

  it("음수는 허용 옵션이 있을 때만 받는다", () => {
    expect(reason("-2m")).toBe("negative-not-allowed");
    expect(meters("-2m", { allowNegative: true })).toBe(-2);
    expect(meters("+2m")).toBe(2);
    expect(meters("−80cm", { allowNegative: true })).toBe(-0.8);
  });

  it("0 과 너무 작은 값은 allowZero 가 없으면 거부한다", () => {
    expect(reason("0")).toBe("zero-not-allowed");
    expect(reason("0cm")).toBe("zero-not-allowed");
    expect(reason("-0m", { allowNegative: true })).toBe("zero-not-allowed");
    expect(meters("0m", { allowZero: true })).toBe(0);
    expect(Object.is(meters("-0m", { allowNegative: true, allowZero: true }), -0)).toBe(false);
    expect(reason("0.0000000001m", { allowZero: true })).toBe("too-small");
    expect(reason("0.0000005m")).toBe("too-small");
  });

  it("경계값: 하한·상한 정확히 일치는 허용, 한 단계 벗어나면 거부", () => {
    expect(meters("0.000001m")).toBe(1e-6);
    expect(reason("0.0000009m")).toBe("too-small");
    expect(meters("20000m")).toBe(20_000);
    expect(reason("20000.001m")).toBe("too-large");
    expect(meters("1000m", { maxMeters: 1000 })).toBe(1000);
    expect(reason("1000.1m", { maxMeters: 1000 })).toBe("too-large");
    expect(meters("-1000m", { maxMeters: 1000, allowNegative: true })).toBe(-1000);
    expect(reason("-1000.1m", { maxMeters: 1000, allowNegative: true })).toBe("too-large");
    expect(meters("1cm", { minMeters: 0.01 })).toBe(0.01);
    expect(reason("9mm", { minMeters: 0.01 })).toBe("too-small");
  });

  it("실패 결과는 사용자에게 보여줄 한국어 안내를 항상 가진다", () => {
    const inputs = ["", "m", "2,4m", "1e3m", "1/2\"", "2.4km", "20cm 1m", "1m 3'", "-2m", "0", "x"];
    for (const input of inputs) {
      const result = parseStudioBg3dLengthInput(input);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.message.length).toBeGreaterThan(5);
        expect(/[가-힣]/u.test(result.message)).toBe(true);
      }
    }
  });

  it("성공 결과의 정규화 표기와 단위 체계를 돌려준다", () => {
    const metric = parseStudioBg3dLengthInput("80cm");
    expect(metric.ok && metric.normalized).toBe("0.8 m");
    expect(metric.ok && metric.system).toBe("metric");
    const imperial = parseStudioBg3dLengthInput("3'6\"");
    expect(imperial.ok && imperial.normalized).toBe("1.0668 m");
    expect(imperial.ok && imperial.system).toBe("imperial");
  });

  it("입력창 되돌려 쓰기 문자열은 문서 단위로 변환하고 부호를 보존한다", () => {
    expect(formatStudioBg3dLengthForInput(1.2, "cm")).toBe("120cm");
    expect(formatStudioBg3dLengthForInput(1.2, "m")).toBe("1.2m");
    expect(formatStudioBg3dLengthForInput(0.0504, "mm")).toBe("50.4mm");
    expect(formatStudioBg3dLengthForInput(-0.25, "m")).toBe("-0.25m");
    expect(formatStudioBg3dLengthForInput(Number.NaN, "m")).toBe("");
    // 되돌려 쓴 문자열은 다시 같은 값으로 해석된다.
    for (const value of [0.0504, 1.2, 12.345, 0.001]) {
      expect(meters(formatStudioBg3dLengthForInput(value, "mm"))).toBeCloseTo(value, 6);
    }
  });
});
