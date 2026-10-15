/**
 * 잠재 안료 모델 생성 스크립트 시험. 최소제곱·검열 적합·표본화·직렬화의 성질과 결정성을 확인하고,
 * `--check` 모드를 실제 프로세스로 실행해 커밋된 생성 파일이 최신임을 증명한다.
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  LATENT_PIGMENT_TERM_COUNT,
  evaluateLatentPigmentTerms,
} from "../apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-basis";
import {
  LATENT_PIGMENT_COEFFICIENTS,
  LATENT_PIGMENT_FIT_ERROR,
  LATENT_PIGMENT_MODEL_PIGMENT_IDS,
  LATENT_PIGMENT_MODEL_REVISION,
  LATENT_PIGMENT_REFERENCE_VERTEX_EIGHT_BIT,
} from "../apps/web/src/domains/creator/brush-lab/pigment/latent-pigment-model.generated";

import {
  DEFAULT_GENERATOR_SETTINGS,
  GENERATED_MODEL_RELATIVE_PATH,
  REFERENCE_PIGMENTS,
  buildLatentPigmentModel,
  buildSimplexGrid,
  checkGeneratedModel,
  compareGeneratedText,
  createReferencePigments,
  encodeSrgbSigned,
  fitChannel,
  formatGeneratedNumber,
  renderLatentPigmentModelModule,
  sampleEncodedColor,
  solveWeightedLeastSquares,
} from "./generate-latent-pigment-model.mts";

import type { SpawnSyncReturns } from "node:child_process";

const REPO_ROOT = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const SCRIPT_PATH = path.join(REPO_ROOT, "scripts", "generate-latent-pigment-model.mts");
const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

function designFor(grid: ReturnType<typeof buildSimplexGrid>): Float64Array {
  const design = new Float64Array(grid.length * LATENT_PIGMENT_TERM_COUNT);
  const terms = new Float64Array(LATENT_PIGMENT_TERM_COUNT);
  grid.forEach((point, row) => {
    evaluateLatentPigmentTerms(point, terms);
    design.set(terms, row * LATENT_PIGMENT_TERM_COUNT);
  });
  return design;
}

function predict(design: Float64Array, row: number, coefficients: Float64Array): number {
  let sum = 0;
  for (let term = 0; term < LATENT_PIGMENT_TERM_COUNT; term += 1) {
    sum += design[row * LATENT_PIGMENT_TERM_COUNT + term] * coefficients[term];
  }
  return sum;
}

/** 농도 4개 중 지정한 칸만 값을 주고 나머지는 0인 점. */
function concentrationPoint(...entries: readonly (readonly [index: number, value: number])[]): readonly [number, number, number, number] {
  const values: [number, number, number, number] = [0, 0, 0, 0];
  for (const [index, value] of entries) values[index] = value;
  return values;
}

function runScript(args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, ["--import", "tsx", SCRIPT_PATH, ...args], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    timeout: 240_000,
  });
}

describe("sRGB 인코딩", () => {
  it("0과 1을 보존하고 부호를 보존하는 홀함수이며 단조 증가한다", () => {
    expect(encodeSrgbSigned(0)).toBe(0);
    expect(encodeSrgbSigned(1)).toBeCloseTo(1, 12);
    let previous = encodeSrgbSigned(-2);
    for (let step = -1999; step <= 2000; step += 1) {
      const value = step / 1000;
      expect(encodeSrgbSigned(-value)).toBeCloseTo(-encodeSrgbSigned(value), 12);
      const current = encodeSrgbSigned(value);
      expect(current).toBeGreaterThan(previous);
      previous = current;
    }
  });

  it("선형 구간과 지수 구간의 이음매에서 눈에 보이는 불연속이 없다", () => {
    const joint = 0.0031308;
    // 표준 상수(12.92, 0.0031308, 1.055, 0.055)는 이음매에서 약 3e-8의 반올림 불일치를 갖는다. 1e-6 이하면 무시할 수 있다.
    expect(Math.abs(encodeSrgbSigned(joint * (1 + 1e-9)) - encodeSrgbSigned(joint * (1 - 1e-9)))).toBeLessThan(1e-6);
    // IEC 61966-2-1 표준식의 잘 알려진 점: 선형 0.5 의 인코딩 값은 약 0.7354.
    expect(encodeSrgbSigned(0.5)).toBeCloseTo(0.735357, 5);
  });
});

describe("단체 격자", () => {
  it("분할 20이면 1771점이고 모든 점이 비음수에 합이 1이며 중복이 없다", () => {
    const grid = buildSimplexGrid(20);
    expect(grid).toHaveLength(1771);
    expect(new Set(grid.map((point) => point.join(","))).size).toBe(1771);
    for (const point of grid) {
      expect(point.every((value) => value >= 0 && value <= 1)).toBe(true);
      expect(point.reduce((sum, value) => sum + value, 0)).toBeCloseTo(1, 12);
    }
  });

  it("점 개수는 C(n+3,3)이고 잘못된 분할 수는 거부한다", () => {
    for (const divisions of [1, 2, 5, 30]) {
      expect(buildSimplexGrid(divisions)).toHaveLength(((divisions + 1) * (divisions + 2) * (divisions + 3)) / 6);
    }
    expect(() => buildSimplexGrid(0)).toThrow(RangeError);
    expect(() => buildSimplexGrid(2.5)).toThrow(RangeError);
  });
});

describe("최소제곱과 검열 적합", () => {
  const grid = buildSimplexGrid(8);
  const design = designFor(grid);
  const truth = Float64Array.from({ length: LATENT_PIGMENT_TERM_COUNT }, (_, index) => Math.sin(index + 1) * 0.4 + 0.5);
  const ones = new Float64Array(grid.length).fill(1);

  it("정확한 3차 다항식 표본에서 계수를 복원한다", () => {
    const targets = Float64Array.from({ length: grid.length }, (_, row) => predict(design, row, truth));
    const { solution, diagonalRatio } = solveWeightedLeastSquares(design, grid.length, LATENT_PIGMENT_TERM_COUNT, targets, ones);
    solution.forEach((value, index) => expect(value).toBeCloseTo(truth[index], 9));
    expect(diagonalRatio).toBeGreaterThan(1e-4);
  });

  it("가중치가 0인 행은 해에 영향을 주지 않는다", () => {
    const targets = Float64Array.from({ length: grid.length }, (_, row) => predict(design, row, truth));
    const corrupted = Float64Array.from(targets);
    const weights = Float64Array.from(ones);
    for (let row = 0; row < grid.length; row += 7) {
      corrupted[row] += 5;
      weights[row] = 0;
    }
    const { solution } = solveWeightedLeastSquares(design, grid.length, LATENT_PIGMENT_TERM_COUNT, corrupted, weights);
    solution.forEach((value, index) => expect(value).toBeCloseTo(truth[index], 8));
  });

  it("행 수가 열 수보다 적어 계수가 부족하면 오류를 낸다", () => {
    const tiny = designFor(buildSimplexGrid(1));
    expect(() => solveWeightedLeastSquares(tiny, 4, LATENT_PIGMENT_TERM_COUNT, new Float64Array(4), new Float64Array(4).fill(1))).toThrow(Error);
  });

  it("검열 적합은 색역 밖 표본에 끌려가지 않아 색역 안쪽 오차가 일반 적합보다 크지 않다", () => {
    // 진짜 다항식이 0~1 밖으로 나가는 구간을 가진 자료: 표시값은 잘린 값이다.
    const stretched = Float64Array.from({ length: grid.length }, (_, row) => (predict(design, row, truth) - 0.5) * 2.2 + 0.5);
    const clamped = Float64Array.from(stretched, clamp01);
    const plain = solveWeightedLeastSquares(design, grid.length, LATENT_PIGMENT_TERM_COUNT, clamped, ones).solution;
    const censored = fitChannel(design, grid.length, stretched, ones, true, 60).solution;
    const interiorError = (solution: Float64Array): number => {
      let worst = 0;
      grid.forEach((_, row) => {
        if (stretched[row] > 0.02 && stretched[row] < 0.98) worst = Math.max(worst, Math.abs(predict(design, row, solution) - stretched[row]));
      });
      return worst;
    };
    expect(interiorError(censored)).toBeLessThanOrEqual(interiorError(plain) + 1e-12);
    // 검열 표본(원래 값이 범위 밖)에서 다항식은 표시값을 해치지 않는 쪽에 머문다.
    grid.forEach((_, row) => {
      if (stretched[row] <= 0) expect(predict(design, row, censored)).toBeLessThan(0.05);
      if (stretched[row] >= 1) expect(predict(design, row, censored)).toBeGreaterThan(0.95);
    });
  });

  it("검열하지 않는 모드는 일반 가중 최소제곱과 같다", () => {
    const targets = Float64Array.from({ length: grid.length }, (_, row) => predict(design, row, truth) * 0.8);
    const direct = solveWeightedLeastSquares(design, grid.length, LATENT_PIGMENT_TERM_COUNT, targets, ones).solution;
    const viaFit = fitChannel(design, grid.length, targets, ones, false, 60).solution;
    expect(Array.from(viaFit)).toEqual(Array.from(direct));
  });
});

describe("기준 안료와 KM 표본", () => {
  it("안료는 4종이고 31밴드 반사율이 0~1이며 산란이 양수이고 식별자가 유일하다", () => {
    expect(REFERENCE_PIGMENTS).toHaveLength(4);
    expect(new Set(REFERENCE_PIGMENTS.map((pigment) => pigment.id)).size).toBe(4);
    for (const pigment of REFERENCE_PIGMENTS) {
      expect(pigment.reflectance).toHaveLength(31);
      expect(pigment.reflectance.every((value) => value > 0 && value <= 1)).toBe(true);
      expect(pigment.scattering).toBeGreaterThan(0);
    }
    expect(REFERENCE_PIGMENTS.map((pigment) => pigment.id)).toEqual(LATENT_PIGMENT_MODEL_PIGMENT_IDS);
  });

  it("곡선 모양이 이름과 맞는다(노랑은 장파장이 높고 파랑은 장파장이 낮고 자홍은 녹색 대역이 가장 낮다)", () => {
    const byId = new Map(REFERENCE_PIGMENTS.map((pigment) => [pigment.id, pigment.reflectance]));
    const yellow = byId.get("yellow") ?? [];
    const blue = byId.get("blue") ?? [];
    const magenta = byId.get("magenta") ?? [];
    const white = byId.get("white") ?? [];
    const band = (nm: number): number => (nm - 400) / 10;
    expect(yellow[band(650)]).toBeGreaterThan(5 * yellow[band(450)]);
    expect(blue[band(470)]).toBeGreaterThan(5 * blue[band(620)]);
    expect(magenta[band(540)]).toBeLessThan(magenta[band(450)]);
    expect(magenta[band(540)]).toBeLessThan(magenta[band(660)]);
    expect(white.every((value) => value > 0.8)).toBe(true);
  });

  it("하한 배율은 흡수 대역의 반사율만 키운다", () => {
    const lighter = createReferencePigments(4);
    REFERENCE_PIGMENTS.forEach((pigment, index) => {
      lighter[index].reflectance.forEach((value, band) => expect(value).toBeGreaterThanOrEqual(pigment.reflectance[band] - 1e-12));
    });
  });

  it("순수 안료 꼭짓점의 색이 이름과 맞는다(방향성)", () => {
    const vertex = (index: number): readonly number[] => sampleEncodedColor(
      REFERENCE_PIGMENTS,
      concentrationPoint([index, 1]),
      DEFAULT_GENERATOR_SETTINGS.concentrationExponent,
    );
    const [white, yellow, blue, magenta] = [vertex(0), vertex(1), vertex(2), vertex(3)];
    expect(Math.min(...white)).toBeGreaterThan(0.9);
    expect(yellow[0]).toBeGreaterThan(0.85);
    expect(yellow[1]).toBeGreaterThan(0.7);
    expect(yellow[2]).toBeLessThan(0.2);
    expect(blue[2]).toBeGreaterThan(blue[0]);
    expect(blue[2]).toBeGreaterThan(blue[1]);
    expect(magenta[0]).toBeGreaterThan(magenta[1]);
    expect(magenta[2]).toBeGreaterThan(magenta[1]);
  });

  it("등량 혼합 방향성: 노랑+파랑은 초록, 흰색+자홍은 분홍, 노랑+자홍은 주황 쪽이다", () => {
    const mix = (first: number, second: number): readonly number[] => sampleEncodedColor(
      REFERENCE_PIGMENTS,
      concentrationPoint([first, 0.5], [second, 0.5]),
      DEFAULT_GENERATOR_SETTINGS.concentrationExponent,
    );
    const green = mix(1, 2);
    expect(green[1]).toBeGreaterThan(green[0]);
    expect(green[1]).toBeGreaterThan(green[2]);
    const pink = mix(0, 3);
    expect(pink[0]).toBeGreaterThan(pink[1]);
    expect(pink[0]).toBeGreaterThan(pink[2]);
    expect(pink[1]).toBeGreaterThan(0.3);
    const orange = mix(1, 3);
    expect(orange[0]).toBeGreaterThan(orange[1]);
    expect(orange[1]).toBeGreaterThan(orange[2]);
  });

  it("안료의 농도가 0으로 가면 그 안료를 뺀 색으로 연속적으로 이어진다", () => {
    const withoutBlue = sampleEncodedColor(REFERENCE_PIGMENTS, concentrationPoint([1, 1]), 1.75);
    const almostWithoutBlue = sampleEncodedColor(REFERENCE_PIGMENTS, concentrationPoint([1, 0.999], [2, 0.001]), 1.75);
    for (let channel = 0; channel < 3; channel += 1) {
      expect(Math.abs(withoutBlue[channel] - almostWithoutBlue[channel])).toBeLessThan(0.05);
    }
  });
});

describe("모델 생성의 결정성과 직렬화", () => {
  it("같은 설정으로 두 번 만들면 계수가 비트 단위로 같다", () => {
    const first = buildLatentPigmentModel(DEFAULT_GENERATOR_SETTINGS, false);
    const second = buildLatentPigmentModel(DEFAULT_GENERATOR_SETTINGS, false);
    expect(second.coefficients.map((channel) => Array.from(channel))).toEqual(first.coefficients.map((channel) => Array.from(channel)));
    expect(second.training).toEqual(first.training);
  }, 120_000);

  it("생성 파일의 상수는 생성기가 지금 만드는 모델과 일치한다(계수·꼭짓점·오차)", () => {
    const model = buildLatentPigmentModel(DEFAULT_GENERATOR_SETTINGS, true);
    model.coefficients.forEach((channel, channelIndex) => {
      channel.forEach((value, term) => expect(LATENT_PIGMENT_COEFFICIENTS[channelIndex][term]).toBeCloseTo(value, 8));
    });
    expect(LATENT_PIGMENT_REFERENCE_VERTEX_EIGHT_BIT).toEqual(model.vertexEightBit);
    expect(LATENT_PIGMENT_MODEL_REVISION).toBe(DEFAULT_GENERATOR_SETTINGS.modelRevision);
    expect(LATENT_PIGMENT_FIT_ERROR.training.sampleCount).toBe(1771);
    expect(LATENT_PIGMENT_FIT_ERROR.validation.sampleCount).toBe(5456);
    expect(LATENT_PIGMENT_FIT_ERROR.training.meanEightBit).toBeCloseTo(model.training.meanEightBit, 6);
    expect(LATENT_PIGMENT_FIT_ERROR.validation.maxEightBit).toBeCloseTo(model.validation?.maxEightBit ?? Number.NaN, 6);
  }, 120_000);

  it("적합 오차는 문서가 약속한 상한 안이다(검증 격자 기준 평균 4, p99 15, 최대 40 / 255)", () => {
    expect(LATENT_PIGMENT_FIT_ERROR.validation.meanEightBit).toBeLessThan(4);
    expect(LATENT_PIGMENT_FIT_ERROR.validation.p99EightBit).toBeLessThan(15);
    expect(LATENT_PIGMENT_FIT_ERROR.validation.maxEightBit).toBeLessThan(40);
    expect(LATENT_PIGMENT_FIT_ERROR.training.meanEightBit).toBeLessThan(4);
  });

  it("숫자 서식은 유효숫자 12자리로 줄이고 -0을 0으로 쓴다", () => {
    expect(formatGeneratedNumber(1 / 3)).toBe("0.333333333333");
    expect(formatGeneratedNumber(-0)).toBe("0");
    expect(formatGeneratedNumber(1234.56789012345)).toBe("1234.56789012");
    expect(Number(formatGeneratedNumber(-2.718281828459045))).toBe(-2.71828182846);
  });

  it("생성 텍스트에는 시각·경로·환경 정보가 없고 같은 모델이면 같은 텍스트다", () => {
    const model = buildLatentPigmentModel(DEFAULT_GENERATOR_SETTINGS, true);
    const text = renderLatentPigmentModelModule(model);
    expect(renderLatentPigmentModelModule(model)).toBe(text);
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/u);
    expect(text).not.toContain("/home/");
    expect(text).not.toContain("/tmp/");
    expect(text.split("\n").length).toBeLessThan(120);
  }, 120_000);

  it("텍스트 비교: 같으면 최신, 숫자 오차가 허용 안이면 최신, 구조나 큰 숫자 차이는 최신이 아니다", () => {
    const base = "export const A = [0.5, 1.25, -3];\n// 개정 1\n";
    expect(compareGeneratedText(base, base).upToDate).toBe(true);
    expect(compareGeneratedText(base.replace("0.5,", "0.5000000001,"), base).upToDate).toBe(true);
    expect(compareGeneratedText(base.replace("0.5,", "0.51,"), base).upToDate).toBe(false);
    expect(compareGeneratedText(base.replace("export const A", "export const B"), base).upToDate).toBe(false);
    expect(compareGeneratedText(base.replace("[0.5, 1.25, -3]", "[0.5, 1.25]"), base).upToDate).toBe(false);
    expect(compareGeneratedText(base.replace("개정 1", "개정 2"), base).upToDate).toBe(false);
  });

  it("커밋된 생성 파일이 현재 생성기 출력과 같다(프로세스 안에서 검증)", () => {
    const result = checkGeneratedModel(REPO_ROOT);
    expect(result.detail).not.toContain("가 없습니다");
    expect(result.upToDate).toBe(true);
  }, 120_000);
});

describe("명령행 --check 모드", () => {
  it("생성 파일이 최신이면 종료 코드 0과 안내 문구를 낸다", () => {
    const result = runScript(["--check"]);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(GENERATED_MODEL_RELATIVE_PATH);
    expect(result.stdout).toContain("최신입니다");
  }, 240_000);

  it("알 수 없는 인자나 둘 이상의 모드는 사용법을 출력하고 종료 코드 2를 낸다", () => {
    for (const args of [["--bogus"], ["--check", "--report"]]) {
      const result = runScript(args);
      expect(result.status).toBe(2);
      expect(result.stderr).toContain("사용법");
    }
  }, 240_000);

  it("생성 파일은 생성 헤더로 직접 수정 금지를 알린다", () => {
    const source = readFileSync(path.join(REPO_ROOT, GENERATED_MODEL_RELATIVE_PATH), "utf8");
    expect(source).toContain("생성 파일이다. 직접 고치지 않는다");
    expect(source).toContain("pnpm run generate:latent-pigment-model");
    expect(source).toContain("pnpm run verify:latent-pigment-model");
  });
});
