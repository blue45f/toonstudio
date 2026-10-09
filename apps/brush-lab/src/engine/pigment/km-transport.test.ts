import { describe, expect, it } from "vitest";

import { linearToSrgb, srgbToLinear } from "../core/color";
import { resolveMpmParams } from "../physics/mpm2d/params";
import { Mpm2D } from "../physics/mpm2d/solver";

import { createBandMixer, KM_TABLE_6, KM_TABLE_8 } from "./km-mix";
import {
  buildConcentrationRamp,
  concentrationToColor,
  fillParticleColors,
  KM_TRANSPORT_RAMP_SIZE,
  rampIndex,
  sampleConcentration,
} from "./km-transport";

import type { Rgb3 } from "./km-mix";

const mixer = createBandMixer(KM_TABLE_8);
/** 노랑·울트라마린 계열 파랑(sRGB → 선형). */
const YELLOW: Rgb3 = [srgbToLinear(0.95), srgbToLinear(0.85), srgbToLinear(0.08)];
const BLUE: Rgb3 = [srgbToLinear(0.08), srgbToLinear(0.2), srgbToLinear(0.85)];

describe("농도 → 색 (KM)", () => {
  it("노랑(t=0)과 파랑(t=1)의 중간은 초록이 우세하다", () => {
    const out = new Float32Array(3);
    concentrationToColor(mixer, YELLOW, BLUE, 0.5, out);
    const [r, g, b] = out;
    expect(g).toBeGreaterThan(r * 1.3);
    expect(g).toBeGreaterThan(b * 1.3);
    // sRGB 쌍별 교환(감마 공간 평균)의 중점은 초록 우세가 아니다 — 그 방식을 쓰지 않는 이유.
    const naive = [0, 1, 2].map((k) => ((linearToSrgb(YELLOW[k]) + linearToSrgb(BLUE[k])) / 2)) as [number, number, number];
    expect(naive[1]).toBeLessThan(naive[0] * 1.2);
    // 6밴드 믹서도 같은 결론이다(밴드 수가 정확도를 정하지만 색상 방향은 같다).
    const six = new Float32Array(3);
    concentrationToColor(createBandMixer(KM_TABLE_6), YELLOW, BLUE, 0.5, six);
    expect(six[1]).toBeGreaterThan(six[0]);
    expect(six[1]).toBeGreaterThan(six[2]);
  });

  it("램프의 양 끝은 두 색과 정확히 같고 단수는 2 이상으로 올린다", () => {
    const ramp = buildConcentrationRamp(mixer, YELLOW, BLUE);
    expect(ramp.size).toBe(KM_TRANSPORT_RAMP_SIZE);
    expect(Array.from(ramp.ramp.slice(0, 3))).toEqual(Array.from(Float32Array.from(YELLOW)));
    expect(Array.from(ramp.ramp.slice(-3))).toEqual(Array.from(Float32Array.from(BLUE)));
    expect(buildConcentrationRamp(mixer, YELLOW, BLUE, 1).size).toBe(2);
    expect(buildConcentrationRamp(mixer, YELLOW, BLUE, 7.9).size).toBe(7);
  });

  it("램프 조회는 직접 혼합과 8비트 양자화 이내로 같다(64단)", () => {
    const ramp = buildConcentrationRamp(mixer, YELLOW, BLUE);
    const direct = new Float32Array(3);
    const looked = new Float32Array(3);
    let worst = 0;
    for (let k = 0; k <= 40; k += 1) {
      const t = k / 40;
      concentrationToColor(mixer, YELLOW, BLUE, t, direct);
      sampleConcentration(ramp, t, looked);
      for (let c = 0; c < 3; c += 1) worst = Math.max(worst, Math.abs(linearToSrgb(direct[c]) - linearToSrgb(looked[c])));
    }
    // 64단 양자화(t 오차 ≤ 1/126)라 sRGB 값 차이가 이 안쪽이어야 한다(측정 후 여유).
    expect(worst).toBeLessThan(0.03);
  });

  it("rampIndex는 범위 밖을 클램프하고 NaN은 0으로 본다", () => {
    expect(rampIndex(64, -3)).toBe(0);
    expect(rampIndex(64, 3)).toBe(63);
    expect(rampIndex(64, Number.NaN)).toBe(0);
    expect(rampIndex(64, 0.5)).toBe(32);
    expect(rampIndex(64, Number.POSITIVE_INFINITY)).toBe(63);
  });

  it("fillParticleColors는 입자마다 램프 색을 채우고 짧은 버퍼는 거부한다", () => {
    const ramp = buildConcentrationRamp(mixer, YELLOW, BLUE);
    const conc = Float64Array.from([0, 0.5, 1, 7, -2]);
    const rgb = new Float32Array(15);
    fillParticleColors(ramp, conc, 5, rgb);
    const one = new Float32Array(3);
    for (let p = 0; p < 5; p += 1) {
      sampleConcentration(ramp, conc[p], one);
      expect(Array.from(rgb.slice(p * 3, p * 3 + 3))).toEqual(Array.from(one));
    }
    expect(() => fillParticleColors(ramp, conc, 5, new Float32Array(14))).toThrow(RangeError);
  });
});

describe("입자 수송 + KM", () => {
  /** 왼쪽 노랑(t=0) 블록과 오른쪽 파랑(t=1) 블록을 맞대어 놓고 확산시킨다. */
  function mixedSim(diffusion: number): Mpm2D {
    const sim = new Mpm2D(resolveMpmParams(96, 64, { concDiffusionPerS: diffusion, dragPerS: 40 }));
    for (let j = 0; j < 20; j += 1) {
      for (let i = 0; i < 40; i += 1) sim.inject(28 + i * 1.2, 22 + j * 1.2, 0, 0, i < 20 ? 0 : 1, 1);
    }
    sim.startClock(0);
    sim.advanceTo(400);
    return sim;
  }

  it("농도는 [0,1]에 머물고 맞닿은 면에서 중간 농도가 생기며, 그 색은 초록이 우세하다", () => {
    const sim = mixedSim(16);
    let min = 1;
    let max = 0;
    let midCount = 0;
    const ramp = buildConcentrationRamp(mixer, YELLOW, BLUE);
    const rgb = new Float32Array(sim.count * 3);
    fillParticleColors(ramp, sim.conc, sim.count, rgb);
    let greenish = 0;
    for (let p = 0; p < sim.count; p += 1) {
      const t = sim.conc[p];
      min = Math.min(min, t);
      max = Math.max(max, t);
      if (t > 0.35 && t < 0.65) {
        midCount += 1;
        if (rgb[p * 3 + 1] > rgb[p * 3] * 1.2 && rgb[p * 3 + 1] > rgb[p * 3 + 2] * 1.2) greenish += 1;
      }
    }
    expect(min).toBeGreaterThanOrEqual(0);
    expect(max).toBeLessThanOrEqual(1);
    expect(midCount).toBeGreaterThan(20);
    expect(greenish / midCount).toBeGreaterThan(0.9);
  });

  it("확산율 0이면 농도가 변하지 않아 색이 섞이지 않는다", () => {
    const sim = mixedSim(0);
    for (let p = 0; p < sim.count; p += 1) expect(sim.conc[p] === 0 || sim.conc[p] === 1).toBe(true);
  });

  it("확산은 두 농도의 평균을 거의 보존한다(PIC 블렌드 — 완전 보존은 아니다)", () => {
    const sim = mixedSim(16);
    let sum = 0;
    for (let p = 0; p < sim.count; p += 1) sum += sim.conc[p];
    // 초기 평균은 정확히 0.5(양쪽 같은 개수). 블렌드로 조금 흔들릴 수 있다.
    expect(Math.abs(sum / sim.count - 0.5)).toBeLessThan(0.03);
  });
});
