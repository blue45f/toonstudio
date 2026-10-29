/**
 * 잠재 안료 표 고속 경로 시험.
 *
 * 다른 구현의 출력값을 기대값으로 쓰지 않는다. 비교 대상은 이 저장소의 반복 풀이 혼합기뿐이고,
 * 난수는 고정 시드 선형 합동 생성기만 쓴다.
 */
import { describe, expect, it } from "vitest";

import {
  clearLatentPigmentCache,
  latentPigmentToRgb,
  mixRgbPigments,
  rgbToLatentPigment,
  type LatentPigmentRgb,
} from "./latent-pigment-mixer";
import {
  bakeLatentPigmentTable,
  getLatentPigmentTable,
  isLatentPigmentTableBaked,
  LATENT_PIGMENT_TABLE_DEFAULT_SIZE,
  LATENT_PIGMENT_TABLE_REVISION,
  latentPigmentFromRgbTable,
  mixRgbLatentPigmentsTable,
  mixRgbLatentPigmentTable,
  mixSrgb8LatentPigmentTableInto,
  packLatentPigmentTableAtlas2d,
} from "./latent-pigment-table";

function lcg(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function randomRgb(next: () => number): LatentPigmentRgb {
  return [next(), next(), next()];
}

function maxAbsoluteDifference(a: LatentPigmentRgb, b: LatentPigmentRgb): number {
  return Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]), Math.abs(a[2] - b[2]));
}

function eightBit(rgb: LatentPigmentRgb): number[] {
  return rgb.map((value) => Math.round(value * 255));
}

describe("지연 굽기와 결정성", () => {
  it("모듈을 불러오는 것만으로는 표를 굽지 않고, 첫 사용 때 한 번만 굽는다", () => {
    expect(isLatentPigmentTableBaked()).toBe(false);
    const table = getLatentPigmentTable();
    expect(isLatentPigmentTableBaked()).toBe(true);
    expect(getLatentPigmentTable()).toBe(table);
    expect(table.size).toBe(LATENT_PIGMENT_TABLE_DEFAULT_SIZE);
    expect(table.revision).toBe(LATENT_PIGMENT_TABLE_REVISION);
    expect(table.concentrations).toHaveLength(LATENT_PIGMENT_TABLE_DEFAULT_SIZE ** 3 * 4);
    expect(Object.isFrozen(table)).toBe(true);
  });

  it("같은 크기로 두 번 구우면 비트 단위로 같고, 격자점 값은 반복 풀이의 농도와 같다", () => {
    const first = bakeLatentPigmentTable(5);
    const second = bakeLatentPigmentTable(5);
    expect(Buffer.from(first.concentrations.buffer).equals(Buffer.from(second.concentrations.buffer))).toBe(true);
    for (const [red, green, blue] of [[0, 0, 0], [4, 0, 2], [1, 3, 4], [4, 4, 4], [2, 2, 2]] as const) {
      const offset = ((blue * 5 + green) * 5 + red) * 4;
      const solved = rgbToLatentPigment([red / 4, green / 4, blue / 4]).concentrations;
      for (let component = 0; component < 4; component += 1) {
        expect(first.concentrations[offset + component]).toBe(Math.fround(solved[component]));
      }
    }
  });

  it("격자점 농도는 음수가 아니고 합이 1이다(Float32 저장 오차 안)", () => {
    const { concentrations } = getLatentPigmentTable();
    let worstSum = 0;
    let smallest = Infinity;
    for (let offset = 0; offset < concentrations.length; offset += 4) {
      const sum = concentrations[offset] + concentrations[offset + 1] + concentrations[offset + 2] + concentrations[offset + 3];
      worstSum = Math.max(worstSum, Math.abs(sum - 1));
      smallest = Math.min(smallest, concentrations[offset], concentrations[offset + 1], concentrations[offset + 2], concentrations[offset + 3]);
    }
    expect(worstSum).toBeLessThan(1e-6);
    expect(smallest).toBeGreaterThanOrEqual(0);
  });

  it("범위 밖 크기와 잘못된 표를 거부한다", () => {
    expect(() => bakeLatentPigmentTable(1)).toThrow(RangeError);
    expect(() => bakeLatentPigmentTable(66)).toThrow(RangeError);
    expect(() => bakeLatentPigmentTable(2.5)).toThrow(RangeError);
    const broken = { ...bakeLatentPigmentTable(3), size: 4 };
    expect(() => mixRgbLatentPigmentTable([0, 0, 0], [1, 1, 1], 0.5, broken)).toThrow(TypeError);
  });

  it("2D 아틀라스 텍셀 (r + b·N, g) 는 3D 표 (r, g, b) 와 같다", () => {
    const table = bakeLatentPigmentTable(4);
    const atlas = packLatentPigmentTableAtlas2d(table);
    expect(atlas).toHaveLength(16 * 4 * 4);
    for (let blue = 0; blue < 4; blue += 1) {
      for (let green = 0; green < 4; green += 1) {
        for (let red = 0; red < 4; red += 1) {
          const source = ((blue * 4 + green) * 4 + red) * 4;
          const target = (green * 16 + blue * 4 + red) * 4;
          expect([...atlas.subarray(target, target + 4)]).toEqual([...table.concentrations.subarray(source, source + 4)]);
        }
      }
    }
  });
});

describe("무손실 왕복(표 농도 + 정확한 잔차)", () => {
  it("임의 색 2,000개의 왕복 오차가 1e-12 이하이고 8비트로는 0이다", () => {
    const next = lcg(20261029);
    let worst = 0;
    for (let index = 0; index < 2000; index += 1) {
      const rgb = randomRgb(next);
      const back = latentPigmentToRgb(latentPigmentFromRgbTable(rgb));
      worst = Math.max(worst, maxAbsoluteDifference(back, rgb));
      expect(eightBit(back)).toEqual(eightBit(rgb));
    }
    expect(worst).toBeLessThanOrEqual(1e-12);
  });

  it("단일 색 가중치 1, 그리고 비율 0·1 끝점은 입력 색을 그대로 돌려준다(8비트 오차 0)", () => {
    const next = lcg(7);
    for (let index = 0; index < 200; index += 1) {
      const a = randomRgb(next);
      const b = randomRgb(next);
      expect(eightBit(mixRgbLatentPigmentTable(a, b, 0))).toEqual(eightBit(a));
      expect(eightBit(mixRgbLatentPigmentTable(a, b, 1))).toEqual(eightBit(b));
      expect(eightBit(mixRgbLatentPigmentsTable([{ rgb: a, weight: 2.5 }]))).toEqual(eightBit(a));
    }
  });

  it("표 경로의 농도→색 계산은 반복 풀이 모듈의 latentPigmentToRgb 와 비트 단위로 같다", () => {
    const next = lcg(31);
    for (let index = 0; index < 300; index += 1) {
      const rgb = randomRgb(next);
      const latent = latentPigmentFromRgbTable(rgb);
      expect(mixRgbLatentPigmentsTable([{ rgb, weight: 1 }])).toEqual(latentPigmentToRgb(latent));
    }
  });
});

describe("안료다운 혼합의 방향성(값은 고정하지 않는다)", () => {
  const greenness = (rgb: LatentPigmentRgb): number => rgb[1] - (rgb[0] + rgb[2]) / 2;
  const yellow: LatentPigmentRgb = [1, 0xe0 / 255, 0];
  const blue: LatentPigmentRgb = [0, 0x50 / 255, 0xdc / 255];

  it("파랑+노랑은 초록 쪽이고 선형 RGB 평균보다 더 초록이다", () => {
    const mixed = mixRgbLatentPigmentTable(yellow, blue, 0.5);
    const linear: LatentPigmentRgb = [(yellow[0] + blue[0]) / 2, (yellow[1] + blue[1]) / 2, (yellow[2] + blue[2]) / 2];
    expect(mixed[1]).toBeGreaterThan(mixed[0]);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
    expect(greenness(mixed)).toBeGreaterThan(greenness(linear));
  });

  it("흰색+빨강은 분홍, 빨강+노랑은 주황 쪽이다", () => {
    const red: LatentPigmentRgb = [0.9, 0.1, 0.1];
    const pink = mixRgbLatentPigmentTable([1, 1, 1], red, 0.5);
    expect(pink[0]).toBeGreaterThan(pink[1]);
    expect(pink[0]).toBeGreaterThan(pink[2]);
    expect(pink[1]).toBeGreaterThan(red[1]);
    const orange = mixRgbLatentPigmentTable([0.93, 0.1, 0.1], [1, 0.88, 0.1], 0.5);
    expect(orange[0]).toBeGreaterThan(orange[1]);
    expect(orange[1]).toBeGreaterThan(orange[2]);
  });
});

describe("반복 풀이 혼합기와의 일치(표 근사의 명시 허용치)", () => {
  it("임의 색 쌍 600개 × 임의 비율에서 평균 0.5, p99 4, 최대 20 (1/255 단위) 이내다", () => {
    const next = lcg(777);
    const errors: number[] = [];
    for (let index = 0; index < 600; index += 1) {
      const a = randomRgb(next);
      const b = randomRgb(next);
      const t = next();
      const reference = mixRgbPigments([{ rgb: a, weight: 1 - t }, { rgb: b, weight: t }]);
      errors.push(maxAbsoluteDifference(reference, mixRgbLatentPigmentTable(a, b, t)) * 255);
      if (index % 200 === 199) clearLatentPigmentCache();
    }
    errors.sort((left, right) => left - right);
    const mean = errors.reduce((sum, value) => sum + value, 0) / errors.length;
    const p99 = errors[Math.floor(errors.length * 0.99)];
    console.info(
      `[latent-pigment-table] 반복 풀이 대비 오차(1/255): 평균 ${mean.toFixed(3)}, p50 ${errors[300].toFixed(3)}, `
        + `p99 ${p99.toFixed(3)}, 최대 ${errors[errors.length - 1].toFixed(3)}`,
    );
    expect(mean).toBeLessThan(0.5);
    expect(p99).toBeLessThan(4);
    expect(errors[errors.length - 1]).toBeLessThan(20);
  });

  it("두 색 혼합 = 같은 가중치의 N색 혼합", () => {
    const next = lcg(91);
    for (let index = 0; index < 200; index += 1) {
      const a = randomRgb(next);
      const b = randomRgb(next);
      const t = next();
      const pair = mixRgbLatentPigmentTable(a, b, t);
      const weighted = mixRgbLatentPigmentsTable([{ rgb: a, weight: 1 - t }, { rgb: b, weight: t }]);
      expect(maxAbsoluteDifference(pair, weighted)).toBeLessThan(1e-12);
    }
  });
});

describe("연속성", () => {
  it("입력 색을 1/256 간격으로 움직여도 출력이 입력 변화의 3배 넘게 튀지 않는다(반복 풀이는 접힌 면에서 튈 수 있다)", () => {
    const next = lcg(4242);
    let steepest = 0;
    for (let segment = 0; segment < 40; segment += 1) {
      const start = randomRgb(next);
      const end = randomRgb(next);
      const partner = randomRgb(next);
      const length = Math.hypot(end[0] - start[0], end[1] - start[1], end[2] - start[2]) / 256;
      let previous: LatentPigmentRgb | null = null;
      for (let step = 0; step <= 256; step += 1) {
        const u = step / 256;
        const color: LatentPigmentRgb = [
          start[0] + (end[0] - start[0]) * u,
          start[1] + (end[1] - start[1]) * u,
          start[2] + (end[2] - start[2]) * u,
        ];
        const mixed = mixRgbLatentPigmentTable(color, partner, 0.5);
        if (previous !== null && length > 0) steepest = Math.max(steepest, maxAbsoluteDifference(mixed, previous) / length);
        previous = mixed;
      }
    }
    expect(steepest).toBeLessThan(3);
  });
});

describe("고속 경로와 입력 위생", () => {
  it("0~255 고속 경로는 검증 경로와 같은 값을 낸다", () => {
    const next = lcg(5);
    const out = new Float64Array(3);
    for (let index = 0; index < 300; index += 1) {
      const a = randomRgb(next);
      const b = randomRgb(next);
      const t = next();
      mixSrgb8LatentPigmentTableInto(a[0] * 255, a[1] * 255, a[2] * 255, b[0] * 255, b[1] * 255, b[2] * 255, t, out);
      const validated = mixRgbLatentPigmentTable(
        [Math.min(1, (a[0] * 255) / 255), Math.min(1, (a[1] * 255) / 255), Math.min(1, (a[2] * 255) / 255)],
        [Math.min(1, (b[0] * 255) / 255), Math.min(1, (b[1] * 255) / 255), Math.min(1, (b[2] * 255) / 255)],
        t,
      );
      expect(Math.abs(out[0] - validated[0] * 255)).toBeLessThan(1e-9);
      expect(Math.abs(out[1] - validated[1] * 255)).toBeLessThan(1e-9);
      expect(Math.abs(out[2] - validated[2] * 255)).toBeLessThan(1e-9);
    }
  });

  it("고속 경로는 NaN·범위 밖 값을 0~255 로 잘라 유한한 결과를 낸다", () => {
    const out = new Float64Array(3);
    mixSrgb8LatentPigmentTableInto(Number.NaN, -40, 900, 10, Infinity, 20, Number.NaN, out);
    expect([...out].every((value) => Number.isFinite(value) && value >= 0 && value <= 255)).toBe(true);
  });

  it("검증 경로는 범위 밖·NaN 색, 잘못된 비율·가중치와 빈 목록을 거부한다", () => {
    expect(() => latentPigmentFromRgbTable([1.01, 0, 0])).toThrow(RangeError);
    expect(() => mixRgbLatentPigmentTable([0, Number.NaN, 0], [1, 1, 1], 0.5)).toThrow(RangeError);
    expect(() => mixRgbLatentPigmentTable([0, 0, 0], [1, 1, 1], Number.NaN)).toThrow(RangeError);
    expect(() => mixRgbLatentPigmentsTable([])).toThrow(RangeError);
    expect(() => mixRgbLatentPigmentsTable([{ rgb: [0, 0, 0], weight: -1 }])).toThrow(RangeError);
    expect(() => mixRgbLatentPigmentsTable([{ rgb: [0, 0, 0], weight: 0 }])).toThrow(RangeError);
  });
});

describe("성능 기록(느슨한 상한만 단언한다)", () => {
  it("표 굽기 시간과 초당 혼합 수를 기록한다", () => {
    const bakeStart = performance.now();
    bakeLatentPigmentTable(LATENT_PIGMENT_TABLE_DEFAULT_SIZE);
    const bakeMilliseconds = performance.now() - bakeStart;

    const next = lcg(99);
    const pairs = Array.from({ length: 4000 }, () => [
      next() * 255, next() * 255, next() * 255, next() * 255, next() * 255, next() * 255, next(),
    ]);
    const out = new Float64Array(3);
    for (const pair of pairs) mixSrgb8LatentPigmentTableInto(pair[0], pair[1], pair[2], pair[3], pair[4], pair[5], pair[6], out);
    const tableStart = performance.now();
    for (let repeat = 0; repeat < 5; repeat += 1) {
      for (const pair of pairs) mixSrgb8LatentPigmentTableInto(pair[0], pair[1], pair[2], pair[3], pair[4], pair[5], pair[6], out);
    }
    const tableMilliseconds = performance.now() - tableStart;

    const iterativeStart = performance.now();
    for (const pair of pairs.slice(0, 400)) {
      mixRgbPigments([
        { rgb: [pair[0] / 255, pair[1] / 255, pair[2] / 255], weight: 1 - pair[6] },
        { rgb: [pair[3] / 255, pair[4] / 255, pair[5] / 255], weight: pair[6] },
      ]);
    }
    const iterativeMilliseconds = performance.now() - iterativeStart;
    const tableOps = (pairs.length * 5) / (tableMilliseconds / 1000);
    const iterativeOps = 400 / (iterativeMilliseconds / 1000);
    console.info(
      `[latent-pigment-table] N=${LATENT_PIGMENT_TABLE_DEFAULT_SIZE} 굽기 ${bakeMilliseconds.toFixed(0)}ms, `
        + `표 혼합 ${Math.round(tableOps).toLocaleString("en-US")}건/초, 반복 풀이 혼합 ${Math.round(iterativeOps).toLocaleString("en-US")}건/초`,
    );
    expect(bakeMilliseconds).toBeLessThan(30_000);
    expect(tableMilliseconds).toBeLessThan(5_000);
  });
});
