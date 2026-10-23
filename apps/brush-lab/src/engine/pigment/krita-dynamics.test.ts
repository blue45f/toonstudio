import { describe, expect, it } from "vitest";

import golden from "../../../test-data/krita-golden.json" with { type: "json" };
import { SumiError } from "../core/errors";

import {
  computeDabAirbrushRate,
  computeTangentialAngle,
  computeWetSmudgeMix,
  defaultDynamicsConfig,
  defaultDynamicsState,
  evaluatePressureCurve,
  smoothColor,
  updateDynamics,
  validateDynamicsConfig,
  type KritaDynamicsConfig,
  type KritaDynamicsSample,
} from "./krita-dynamics";

interface GoldenSequence {
  readonly name: string;
  readonly dtMs: number;
  readonly samples: readonly KritaDynamicsSample[];
  readonly expected: readonly {
    readonly pressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly speed: number;
  }[];
}

interface GoldenFixture {
  readonly source: string;
  readonly config: KritaDynamicsConfig;
  readonly initialState: {
    readonly pressure: number;
    readonly tiltX: number;
    readonly tiltY: number;
    readonly speed: number;
  };
  readonly sequences: readonly GoldenSequence[];
}

const f32 = Math.fround;
const EPS = 1e-5;

function almost(value: number, expected: number): boolean {
  return Math.abs(value - expected) < EPS;
}

describe("Krita 다이내믹 concept 수식", () => {
  it("설정 구조 검사: timeConstant <= 0, pressureSmoothing/tiltSensitivity/speedDecay 범위 밖 → SumiError('kd-invalid-config')", () => {
    expect(() => validateDynamicsConfig({ ...defaultDynamicsConfig(), timeConstant: 0 })).toThrow(
      SumiError,
    );
    expect(() => validateDynamicsConfig({ ...defaultDynamicsConfig(), timeConstant: -5 })).toThrow(
      SumiError,
    );
    expect(() =>
      validateDynamicsConfig({ ...defaultDynamicsConfig(), pressureSmoothing: 1.2 }),
    ).toThrow(SumiError);
    expect(() =>
      validateDynamicsConfig({ ...defaultDynamicsConfig(), pressureSmoothing: -0.1 }),
    ).toThrow(SumiError);
    expect(() =>
      validateDynamicsConfig({ ...defaultDynamicsConfig(), tiltSensitivity: 2 }),
    ).toThrow(SumiError);
    expect(() =>
      validateDynamicsConfig({ ...defaultDynamicsConfig(), speedDecay: -0.5 }),
    ).toThrow(SumiError);
  });

  it("updateDynamics는 dtMs <= 0일 때 SumiError('kd-invalid-config')를 던진다", () => {
    const state = defaultDynamicsState();
    const sample: KritaDynamicsSample = { pressure: 0.5, tiltX: 0, tiltY: 0, dx: 0, dy: 0 };
    expect(() => updateDynamics(state, sample, 0)).toThrow(SumiError);
    expect(() => updateDynamics(state, sample, -1)).toThrow(SumiError);
    expect(() => updateDynamics(state, sample, NaN as unknown as number)).toThrow(SumiError);
  });

  it("pressureSmoothing=0이면 즉시 target.pressure로 수렴, speedDecay=0이면 속도 무시", () => {
    const config: KritaDynamicsConfig = {
      ...defaultDynamicsConfig(),
      pressureSmoothing: 0,
      speedDecay: 0,
    };
    const state = defaultDynamicsState();
    const sample: KritaDynamicsSample = { pressure: 0.8, tiltX: 0.4, tiltY: -0.2, dx: 100, dy: 0 };

    const next = updateDynamics(state, sample, 16, config);
    expect(next.pressure).toBe(0.8);
    expect(next.speed).toBe(0);
    // 입력 state는 미변형
    expect(state.pressure).toBe(0);
    expect(state.speed).toBe(0);
  });

  it("압력 램프: pressureSmoothing>0이면 점진 수렴(f32)", () => {
    const config: KritaDynamicsConfig = {
      pressureSmoothing: 0.5,
      tiltSensitivity: 0,
      speedDecay: 0,
      timeConstant: 32,
    };
    // alpha = min(1, 16/32) = 0.5, step = 0.5 * 0.5 = 0.25
    // 0 → f32(0.05) → f32(0.1875) → f32(0.390625)
    let state = defaultDynamicsState();
    for (const sample of [
      { pressure: 0.2, tiltX: 0, tiltY: 0, dx: 0, dy: 0 },
      { pressure: 0.6, tiltX: 0, tiltY: 0, dx: 0, dy: 0 },
      { pressure: 1.0, tiltX: 0, tiltY: 0, dx: 0, dy: 0 },
    ]) {
      state = updateDynamics(state, sample, 16, config);
    }
    expect(state.pressure).toBe(f32(0.390625));
  });

  it("기울기 스위프: tiltSensitivity>0이면 점진 수렴", () => {
    const config: KritaDynamicsConfig = {
      pressureSmoothing: 0,
      tiltSensitivity: 0.5,
      speedDecay: 0,
      timeConstant: 32,
    };
    let state = defaultDynamicsState();
    // 두 표본 모두 기울기 1: 0 → f32(0.25) → f32(0.4375)
    for (let i = 0; i < 2; i += 1) {
      state = updateDynamics(
        state,
        { pressure: 0, tiltX: 1, tiltY: 0, dx: 0, dy: 0 },
        16,
        config,
      );
    }
    expect(state.tiltX).toBe(f32(0.4375));
    expect(state.tiltY).toBe(0);
  });

  it("속도 스파이크: speedDecay=0이면 속도 0, 그 외면 dx/dy·dtMs에서 유도", () => {
    const configIgnore: KritaDynamicsConfig = {
      ...defaultDynamicsConfig(),
      speedDecay: 0,
    };
    expect(
      updateDynamics(
        defaultDynamicsState(),
        { pressure: 0, tiltX: 0, tiltY: 0, dx: 100, dy: 0 },
        16,
        configIgnore,
      ).speed,
    ).toBe(0);

    const config: KritaDynamicsConfig = {
      pressureSmoothing: 0,
      tiltSensitivity: 0,
      speedDecay: 0.5,
      timeConstant: 32,
    };
    // newSpeed = 100px / 0.016s = 6250, step = 0.5 * 0.5 = 0.25 → f32(1562.5)
    expect(
      updateDynamics(
        defaultDynamicsState(),
        { pressure: 0, tiltX: 0, tiltY: 0, dx: 100, dy: 0 },
        16,
        config,
      ).speed,
    ).toBe(f32(1562.5));
  });

  it("smoothColor는 kubelka-munk 색공간(K/S) 보간을 사용하고 f32 결과를 낸다", () => {
    // 경계: alpha 0 → prev, 1 → target(K/S 왕복 후 f32 근사, 허용 오차 내)
    const prev: readonly [number, number, number] = [0.1, 0.2, 0.3];
    const target: readonly [number, number, number] = [0.9, 0.8, 0.7];
    const start = smoothColor(prev, target, 0);
    const end = smoothColor(prev, target, 1);
    for (let i = 0; i < 3; i += 1) {
      expect(almost(start[i], prev[i])).toBe(true);
      expect(almost(end[i], target[i])).toBe(true);
    }
    // 중간 값은 (0,1) 사이
    const mid = smoothColor([0, 0, 0], [1, 1, 1], 0.5);
    expect(mid[0]).toBeGreaterThan(0);
    expect(mid[0]).toBeLessThan(1);
  });

  it("골든 피치(krita-golden.json): concept 기대 출력과 비트 동일", () => {
    const fixture: GoldenFixture = golden as unknown as GoldenFixture;
    expect(fixture.source).toBe("concept-verification");
    expect(fixture.initialState).toEqual(defaultDynamicsState());

    for (const seq of fixture.sequences) {
      let state = fixture.initialState;
      for (const [i, sample] of seq.samples.entries()) {
        state = updateDynamics(state, sample, seq.dtMs, fixture.config);
        const expected = seq.expected[i];
        expect(state.pressure).toBe(f32(expected.pressure));
        expect(state.tiltX).toBe(f32(expected.tiltX));
        expect(state.tiltY).toBe(f32(expected.tiltY));
        expect(state.speed).toBe(f32(expected.speed));
      }
    }
  });

  it("evaluatePressureCurve: 단조 증가 및 S-커브/감마 응답을 보장한다", () => {
    expect(evaluatePressureCurve(0, 1.5, 0.5)).toBe(0);
    expect(evaluatePressureCurve(1, 1.5, 0.5)).toBe(1);
    const pLow = evaluatePressureCurve(0.25, 1.6, 0.4);
    const pMid = evaluatePressureCurve(0.5, 1.6, 0.4);
    const pHigh = evaluatePressureCurve(0.75, 1.6, 0.4);
    expect(pLow).toBeLessThan(pMid);
    expect(pMid).toBeLessThan(pHigh);
    expect(() => evaluatePressureCurve(NaN)).toThrow(SumiError);
  });

  it("computeDabAirbrushRate & computeTangentialAngle & computeWetSmudgeMix 동작을 검증한다", () => {
    expect(computeDabAirbrushRate(60, 0.8, 300)).toBeGreaterThan(computeDabAirbrushRate(60, 0.2, 0));
    const angle = computeTangentialAngle(10, 0, 0, 1, 0);
    expect(angle).toBe(0);
    const tiltedAngle = computeTangentialAngle(10, 0, 0, 1, 1);
    expect(Math.abs(tiltedAngle - Math.PI / 2)).toBeLessThan(1e-5);

    const mixed = computeWetSmudgeMix([0.05, 0.25, 0.85], [0.95, 0.85, 0.1], 0.5, 0.6, 0.8);
    expect(mixed[1]).toBeGreaterThan(0.25);
  });
});

