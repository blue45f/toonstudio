/**
 * 잠재 안료 셰이더(WGSL·GLSL ES 3.0) 생성기와 TS 재현 시험.
 *
 * 이 컨테이너에는 GPU 가 없다. WGSL 은 wesl 링커로 구문·식별자를 해석하고, 산술은 TS 재현(shader mirror)으로
 * CPU 표 경로·반복 풀이 혼합기와 대조한다. GLSL 은 해석기가 없어 구조(선언 순서·정밀도·표 배치)만 확인한다.
 * 실기기 GPU 픽셀은 검증하지 않았다.
 */
import { link } from "wesl";
import { describe, expect, it } from "vitest";

import { LATENT_PIGMENT_TERMS } from "./latent-pigment-basis";
import { latentPigmentToRgb, mixRgbPigments, type LatentPigmentRgb } from "./latent-pigment-mixer";
import { LATENT_PIGMENT_COEFFICIENTS } from "./latent-pigment-model.generated";
import {
  mirrorLatentPigmentFromRgb,
  mirrorLatentPigmentLinearToSrgb,
  mirrorLatentPigmentMix,
  mirrorLatentPigmentMixLinear,
  mirrorLatentPigmentMixRgba,
  mirrorLatentPigmentPolynomial,
  mirrorLatentPigmentSrgbToLinear,
  mirrorLatentPigmentTableConcentrations,
  mirrorLatentPigmentToRgb,
} from "./latent-pigment-shader-mirror";
import {
  buildLatentPigmentGlsl,
  buildLatentPigmentWgsl,
  formatLatentPigmentShaderFloat,
  LATENT_PIGMENT_SHADER_FUNCTIONS,
  latentPigmentPolynomialStatements,
  latentPigmentWebGpuTableUpload,
} from "./latent-pigment-shaders";
import {
  bakeLatentPigmentTable,
  getLatentPigmentTable,
  latentPigmentFromRgbTable,
  mixRgbLatentPigmentTable,
} from "./latent-pigment-table";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function maxAbsoluteDifference(a: ArrayLike<number>, b: ArrayLike<number>, length = 3): number {
  let worst = 0;
  for (let index = 0; index < length; index += 1) worst = Math.max(worst, Math.abs(a[index] - b[index]));
  return worst;
}

const eightBit = (rgb: ArrayLike<number>): number[] => Array.from({ length: 3 }, (_, index) => Math.round(rgb[index] * 255));

/** 모든 내보낸 함수를 부르는 시험용 compute 진입점. wesl 은 진입점에서 닿는 선언만 링크하므로 전부 부른다. */
const WGSL_TEST_ENTRY = `
@group(0) @binding(1) var<storage, read_write> latent_pigment_test_out: array<vec4f, 6>;

@compute @workgroup_size(1)
fn main() {
  let a = vec4f(0.1, 0.2, 0.3, 1.0);
  let b = vec4f(0.9, 0.8, 0.1, 0.5);
  let latent = latent_pigment_from_rgb(a.rgb);
  latent_pigment_test_out[0] = vec4f(latent_pigment_to_rgb(latent), latent.concentrations.x);
  latent_pigment_test_out[1] = vec4f(latent_pigment_mix(a.rgb, b.rgb, 0.5), 1.0);
  latent_pigment_test_out[2] = latent_pigment_mix_rgba(a, b, 0.25);
  latent_pigment_test_out[3] = vec4f(latent_pigment_mix_linear(a.rgb, b.rgb, 0.75), 0.0);
  latent_pigment_test_out[4] = latent_pigment_mix_linear_rgba(a, b, 0.5);
  latent_pigment_test_out[5] = vec4f(latent_pigment_polynomial(vec4f(0.25)), 0.0);
}
`;

async function linkWgsl(source: string): Promise<string> {
  const linked = await link({ weslSrc: { main: source }, rootModuleName: "main" });
  return linked.dest;
}

describe("WGSL 모듈", () => {
  it("wesl 링커가 모듈 전체를 진입점과 함께 해석하고 모든 함수를 남긴다", async () => {
    const linked = await linkWgsl(buildLatentPigmentWgsl() + WGSL_TEST_ENTRY);
    for (const name of LATENT_PIGMENT_SHADER_FUNCTIONS) expect(linked).toContain(`fn ${name}(`);
    expect(linked).toContain("texture_3d<f32>");
    expect(linked).toContain("textureLoad(latent_pigment_table");
  });

  it("문법 오류를 넣으면 wesl 링커가 실패한다(해석 시험이 실제로 검사함을 확인)", async () => {
    const broken = buildLatentPigmentWgsl().replace("return mix(y0, y1, f.z);", "return mix(y0, y1, f.z)");
    await expect(linkWgsl(broken + WGSL_TEST_ENTRY)).rejects.toThrow();
  });

  it("@group/@binding 과 표 크기를 주입하고 잘못된 값을 거부한다", () => {
    const wgsl = buildLatentPigmentWgsl({ group: 2, binding: 7, tableSize: 17 });
    expect(wgsl).toContain("@group(2) @binding(7) var latent_pigment_table: texture_3d<f32>;");
    expect(wgsl).toContain("const LATENT_PIGMENT_TABLE_SIZE: i32 = 17;");
    expect(() => buildLatentPigmentWgsl({ binding: -1 })).toThrow(RangeError);
    expect(() => buildLatentPigmentWgsl({ tableSize: 1 })).toThrow(RangeError);
  });
});

describe("계수 주입(빌드 때 생성 파일에서)", () => {
  it("다항식 20줄이 항 순서대로 두 언어에 들어가고, 리터럴은 생성 계수를 그대로 되읽는다", () => {
    const wgsl = buildLatentPigmentWgsl();
    const glsl = buildLatentPigmentGlsl();
    for (const [language, source] of [["wgsl", wgsl], ["glsl", glsl]] as const) {
      const statements = latentPigmentPolynomialStatements(language);
      expect(statements).toHaveLength(20);
      let cursor = 0;
      statements.forEach((statement, term) => {
        const position = source.indexOf(statement, cursor);
        expect(position).toBeGreaterThan(cursor);
        cursor = position;
        const literals = statement.match(/\(([^()]*)\) \*/u)?.[1].split(", ").map(Number) ?? [];
        expect(literals).toEqual([0, 1, 2].map((channel) => LATENT_PIGMENT_COEFFICIENTS[channel][term]));
        const monomial = LATENT_PIGMENT_TERMS[term].map((variable) => `c.${"xyzw"[variable]}`).join(" * ");
        expect(statement.endsWith(`(${monomial});`)).toBe(true);
      });
    }
  });

  it("생성 문자열은 ASCII 만 쓰고 GLSL 에는 정수 모양 리터럴이 없다", () => {
    for (const source of [buildLatentPigmentWgsl(), buildLatentPigmentGlsl(), buildLatentPigmentGlsl({ tableLayout: "atlas-2d" })]) {
      const printableAscii = [...source].every((character) => character === "\n" || character === "\t" || (character >= " " && character <= "~"));
      expect(printableAscii).toBe(true);
    }
    expect(formatLatentPigmentShaderFloat(1)).toBe("1.0");
    expect(formatLatentPigmentShaderFloat(-2)).toBe("-2.0");
    expect(formatLatentPigmentShaderFloat(-0)).toBe("0.0");
    expect(formatLatentPigmentShaderFloat(1e-7)).toBe("1e-7");
    expect(() => formatLatentPigmentShaderFloat(Number.NaN)).toThrow(RangeError);
  });
});

describe("GLSL ES 3.00 모듈(구조 확인)", () => {
  const functionPattern = /^(?:highp \w+|LatentPigment) (latent_pigment_\w+)\(/gmu;

  it("모든 함수를 한 번씩, 쓰기 전에 선언하고 #version 줄은 넣지 않는다", () => {
    const glsl = buildLatentPigmentGlsl();
    expect(glsl).not.toContain("#version");
    const declared = [...glsl.matchAll(functionPattern)].map((match) => match[1]);
    expect(new Set(declared).size).toBe(declared.length);
    for (const name of LATENT_PIGMENT_SHADER_FUNCTIONS) expect(declared).toContain(name);
    for (const name of declared) {
      const declaration = glsl.indexOf(`${name}(`);
      const firstUse = glsl.search(new RegExp(`[^\\w]${name}\\(`, "u"));
      expect(firstUse === -1 || firstUse + 1 >= declaration).toBe(true);
    }
    let depth = 0;
    for (const character of glsl) {
      if (character === "{" || character === "(") depth += 1;
      if (character === "}" || character === ")") depth -= 1;
      expect(depth).toBeGreaterThanOrEqual(0);
    }
    expect(depth).toBe(0);
  });

  it("부동소수 선언에는 모두 highp 가 붙는다(기본 정밀도에 기대지 않는다)", () => {
    const glsl = buildLatentPigmentGlsl();
    const declarations = glsl.split("\n").filter((line) => /^\s*(?:highp\s+)?(?:float|vec[234])\s+\w+\s*=/u.test(line));
    expect(declarations.length).toBeGreaterThan(20);
    for (const line of declarations) expect(line.trim().startsWith("highp ")).toBe(true);
    for (const parameter of glsl.matchAll(/\((?:[^()]*?)\b(float|vec[234]) \w+/gu)) {
      expect(parameter[0]).toMatch(new RegExp(`highp ${parameter[1]} \\w+$`, "u"));
    }
  });

  it("3D 표와 2D 아틀라스 배치의 샘플러·텍셀 주소식이 다르다", () => {
    const volume = buildLatentPigmentGlsl();
    expect(volume).toContain("uniform highp sampler3D u_latentPigmentTable;");
    expect(volume).toContain("return texelFetch(u_latentPigmentTable, i, 0);");
    const atlas = buildLatentPigmentGlsl({ tableLayout: "atlas-2d", samplerName: "u_table" });
    expect(atlas).toContain("uniform highp sampler2D u_table;");
    expect(atlas).toContain("return texelFetch(u_table, ivec2(i.x + i.z * LATENT_PIGMENT_TABLE_SIZE, i.y), 0);");
    expect(() => buildLatentPigmentGlsl({ samplerName: "gl_Table" })).toThrow(RangeError);
  });
});

describe("TS 재현(shader mirror) — 셰이더 산술 대조", () => {
  const table = getLatentPigmentTable();

  it("업로드 서술의 바이트 배치가 재현의 텍셀 주소(x=R, y=G, z=B)와 같다", () => {
    const small = bakeLatentPigmentTable(4);
    const upload = latentPigmentWebGpuTableUpload(small);
    expect(upload).toMatchObject({ dimension: "3d", format: "rgba32float", size: [4, 4, 4], bytesPerRow: 64, rowsPerImage: 4 });
    expect(upload.data).toBe(small.concentrations);
    const concentrations = mirrorLatentPigmentTableConcentrations(small, [1 / 3, 2 / 3, 1]);
    const byteOffset = 3 * upload.rowsPerImage * upload.bytesPerRow + 2 * upload.bytesPerRow + 1 * 16;
    const texel = new Float32Array(upload.data.buffer, byteOffset, 4);
    expect(maxAbsoluteDifference(concentrations, texel, 4)).toBeLessThan(1e-6);
  });

  it("다항식 재현은 CPU(f64) 다항식과 f32 반올림 범위(2e-6) 안에서 같다", () => {
    const next = lcg(13);
    for (let index = 0; index < 500; index += 1) {
      const raw = [next(), next(), next(), next()];
      const total = raw.reduce((sum, value) => sum + value, 0);
      const concentrations = Float32Array.from(raw, (value) => value / total);
      const mirrored = mirrorLatentPigmentPolynomial(concentrations);
      const reference = latentPigmentToRgb({
        concentrations: [concentrations[0], concentrations[1], concentrations[2], concentrations[3]],
        residual: [0, 0, 0],
      });
      for (let channel = 0; channel < 3; channel += 1) {
        const clamped = Math.min(1, Math.max(0, mirrored[channel]));
        expect(Math.abs(clamped - reference[channel])).toBeLessThan(2e-6);
      }
    }
  });

  it("농도 조회·혼합 재현은 CPU 표 경로와 2e-5 안에서 같다", () => {
    const next = lcg(2026);
    for (let index = 0; index < 400; index += 1) {
      const a: LatentPigmentRgb = [next(), next(), next()];
      const b: LatentPigmentRgb = [next(), next(), next()];
      const t = next();
      const cpuLatent = latentPigmentFromRgbTable(a, table);
      const mirrorLatent = mirrorLatentPigmentFromRgb(table, a);
      expect(maxAbsoluteDifference(mirrorLatent.concentrations, cpuLatent.concentrations, 4)).toBeLessThan(2e-6);
      expect(maxAbsoluteDifference(mirrorLatent.residual, cpuLatent.residual)).toBeLessThan(2e-5);
      expect(maxAbsoluteDifference(mirrorLatentPigmentMix(table, a, b, t), mixRgbLatentPigmentTable(a, b, t, table))).toBeLessThan(2e-5);
    }
  });

  it("재현 왕복은 8비트로 무손실이고 끝점은 입력 색이다", () => {
    const next = lcg(77);
    for (let index = 0; index < 400; index += 1) {
      const a: LatentPigmentRgb = [next(), next(), next()];
      const b: LatentPigmentRgb = [next(), next(), next()];
      expect(maxAbsoluteDifference(mirrorLatentPigmentToRgb(mirrorLatentPigmentFromRgb(table, a)), a)).toBeLessThan(3e-7);
      expect(eightBit(mirrorLatentPigmentMix(table, a, b, 0))).toEqual(eightBit(a));
      expect(eightBit(mirrorLatentPigmentMix(table, a, b, 1))).toEqual(eightBit(b));
    }
  });

  it("재현 혼합은 반복 풀이 혼합기와 표 경로와 같은 허용치(평균 0.5, 최대 20 /255) 안이다", () => {
    const next = lcg(555);
    let total = 0;
    let worst = 0;
    for (let index = 0; index < 200; index += 1) {
      const a: LatentPigmentRgb = [next(), next(), next()];
      const b: LatentPigmentRgb = [next(), next(), next()];
      const t = next();
      const reference = mixRgbPigments([{ rgb: a, weight: 1 - t }, { rgb: b, weight: t }]);
      const error = maxAbsoluteDifference(mirrorLatentPigmentMix(table, a, b, t), reference) * 255;
      total += error;
      worst = Math.max(worst, error);
    }
    expect(total / 200).toBeLessThan(0.5);
    expect(worst).toBeLessThan(20);
  });

  it("알파 변형: 투명한 쪽 안료는 섞이지 않고 알파는 선형 보간된다", () => {
    const opaque = [0.8, 0.3, 0.1, 1];
    const clear = [0.05, 0.1, 0.9, 0];
    const mixed = mirrorLatentPigmentMixRgba(table, opaque, clear, 0.6);
    expect(eightBit(mixed)).toEqual(eightBit(opaque));
    expect(mixed[3]).toBeCloseTo(0.4, 6);
    const both = mirrorLatentPigmentMixRgba(table, [0.2, 0.4, 0.9, 1], [1, 0.9, 0.1, 1], 0.5);
    expect(maxAbsoluteDifference(both, mirrorLatentPigmentMix(table, [0.2, 0.4, 0.9], [1, 0.9, 0.1], 0.5))).toBeLessThan(1e-7);
    expect(both[3]).toBe(1);
  });

  it("sRGB↔선형 도우미는 표준 전달함수와 같고 선형 혼합은 끝점을 보존한다", () => {
    for (const value of [0, 0.002, 0.04045, 0.2, 0.5, 0.9, 1]) {
      const linear = mirrorLatentPigmentSrgbToLinear([value, value, value])[0];
      const expected = value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
      expect(Math.abs(linear - expected)).toBeLessThan(2e-6);
      expect(Math.abs(mirrorLatentPigmentLinearToSrgb([linear, linear, linear])[0] - value)).toBeLessThan(2e-6);
    }
    const a = [0.02, 0.3, 0.7];
    const b = [0.9, 0.5, 0.01];
    expect(maxAbsoluteDifference(mirrorLatentPigmentMixLinear(table, a, b, 0), a)).toBeLessThan(2e-3);
    expect(maxAbsoluteDifference(mirrorLatentPigmentMixLinear(table, a, b, 1), b)).toBeLessThan(2e-3);
  });
});
