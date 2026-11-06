/**
 * 실제 생성 GLSL의 packed 주소를 제한된 AST 해석기로 실행한다.
 * fraction16/23의 RN 가정 모델이며 실물 GPU·전체 GLSL compiler·색 출력 시험이 아니다.
 */
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";

import { latentPigmentPackedAtlasLayout } from "../latent-pigment-float32-atlas";
import { buildLatentPigmentGlsl } from "../latent-pigment-shaders";
import { createGeneratedAddressEvaluator } from "./glsl-address-subset.test-helper.mjs";
import { addressPoints, createAddressArithmetic, integerAddressOracle } from "./latent-pigment-address-model.test-helper.mjs";

const SAFE_INTEGER_BOUND = 2 ** 17;
const inspections = new Map();

function inspect(size, fractionBits = 16) {
  const key = `${size}:${fractionBits}`;
  if (inspections.has(key)) return inspections.get(key);
  const source = buildLatentPigmentGlsl({ version: 100, tableLayout: "atlas-2d", textureEncoding: "packed-float32", tableSize: size });
  const q = createAddressArithmetic(fractionBits), evaluator = createGeneratedAddressEvaluator(source, q);
  const { width } = latentPigmentPackedAtlasLayout(size);
  const digest = createHash("sha256");
  let count = 0, failureCount = 0; const failures = [];
  for (const point of addressPoints(size)) {
    const observed = evaluator.evaluate(point);
    for (let component = 0; component < 4; component++) {
      count++;
      const expected = integerAddressOracle(size, point, component, width);
      const actual = observed[component];
      digest.update(`${actual[0]},${actual[1]};`);
      if (actual[0] !== expected[0] || actual[1] !== expected[1]) {
        failureCount++;
        if (failures.length < 8) failures.push({ point, component, expected, observed: actual });
      }
    }
  }
  const result = { failures, failureCount, count, maximumIntermediate: q.maximum(), digest: digest.digest("hex") };
  inspections.set(key, result);
  return result;
}

describe("실제 생성 packed GLSL 주소의 정밀도 모델", () => {
  it("fraction16 RN에서 N33의 모든 성분이 안전한 중간값으로 정확한 주소를 읽는다", () => {
    const result = inspect(33);
    expect(result.count).toBe(143748);
    expect(result.failures).toEqual([]);
    expect(result.failureCount).toBe(0);
    expect(result.maximumIntermediate).toBeLessThan(SAFE_INTEGER_BOUND);
  }, 15_000);

  it("나머지 N2…65 결정적 표본도 같은 atlas의 정수 oracle과 일치한다", () => {
    for (let size = 2; size <= 65; size++) {
      if (size === 33) continue;
      const result = inspect(size);
      expect(result.failures, `N=${size}`).toEqual([]);
      expect(result.failureCount).toBe(0);
      expect(result.maximumIntermediate).toBeLessThan(SAFE_INTEGER_BOUND);
    }
  }, 15_000);

  it("실제 생성 주소식의 변조·문법 오류·미지원 내장 함수를 검출한다", () => {
    const source = buildLatentPigmentGlsl({ version: 100, tableLayout: "atlas-2d", textureEncoding: "packed-float32", tableSize: 33 });
    const mutant = source.replace("float(i.x)", "(float(i.x) + 1.0)");
    expect(mutant).not.toBe(source);
    expect(createGeneratedAddressEvaluator(mutant, createAddressArithmetic()).evaluate([0, 0, 0])[0]).not.toEqual([0, 0]);
    const bodyStart = source.indexOf("highp vec4 latent_pigment_table_texel(ivec3 i)");
    expect(bodyStart).toBeGreaterThanOrEqual(0);
    const semicolon = source.indexOf(";", bodyStart);
    expect(semicolon).toBeGreaterThan(bodyStart);
    const broken = source.slice(0, semicolon) + source.slice(semicolon + 1);
    expect(() => createGeneratedAddressEvaluator(broken, createAddressArithmetic())).toThrow();
    const unsupported = source.replace("float(i.x)", "sin(float(i.x))");
    expect(() => createGeneratedAddressEvaluator(unsupported, createAddressArithmetic()).evaluate([0, 0, 0])).toThrow(/지원하지 않는 호출/u);
  });

  it("fraction23도 같은 정수 주소이며 fraction16 결과와 일치한다", () => {
    expect(createAddressArithmetic(16).add(2 ** 17, 1)).toBe(2 ** 17);
    expect(createAddressArithmetic(23).add(2 ** 17, 1)).toBe(2 ** 17 + 1);
    for (let size = 2; size <= 65; size++) {
      const result = inspect(size, 23);
      expect(result.failures, `N=${size}, fraction23`).toEqual([]);
      expect(result.failureCount).toBe(0);
      expect(result.maximumIntermediate).toBeLessThan(SAFE_INTEGER_BOUND);
      expect(result.digest).toBe(inspect(size, 16).digest);
    }
  }, 15_000);
});
