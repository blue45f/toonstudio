/**
 * CC0 MyPaint 도달 범위 추정 시험: libmypaint 1.6.1 의 곡선 계산(끝 구간 직선 연장)·입력 정의역·속도 지수 평균·추적 잡음
 * 건너뛰기를 손으로 계산한 값과 맞춘다. 실제 WASM 렌더와의 비교는 studio-mypaint-cc0-library.test.ts 가 맡는다.
 */
import { describe, expect, it } from "vitest";

import {
  evaluateMypaintCurve, mypaintCurveRange, mypaintFilteredSpeedMaxima, mypaintSpeedInput, studioMypaintCc0ReachPx,
} from "./studio-mypaint-cc0-library-reach";

import type { StudioMypaintCc0ReachRow } from "./studio-mypaint-cc0-library-index.generated";
import type { StudioMypaintCc0SpeedFilter, StudioMypaintCc0StrokeTiming } from "./studio-mypaint-cc0-library-reach";

const GAUSS = 2 * Math.sqrt(3);

/** x 축으로 stepPx 씩, stepMs 간격으로 count 개 표본. */
function line(count: number, stepPx: number, stepMs: number): StudioMypaintCc0StrokeTiming[] {
  return Array.from({ length: count }, (_, index) => ({ x: index * stepPx, y: 0, tMs: index * stepMs }));
}
const instant: StudioMypaintCc0SpeedFilter = {
  speed1Slowness: 0, speed2Slowness: 0, offsetTimeConstant: 0, trackingNoisePx: 0, slowTracking: 0,
};

describe("MyPaint 곡선 계산(mypaint_mapping_calculate)", () => {
  it("안쪽은 선형 보간하고 첫·끝 구간 밖은 직선으로 연장한다", () => {
    expect(evaluateMypaintCurve([0, 0, 1, 1], 0.5)).toBeCloseTo(0.5, 12);
    expect(evaluateMypaintCurve([0, 0, 1, 1], 2)).toBeCloseTo(2, 12);
    expect(evaluateMypaintCurve([0, 0, 1, 1], -1)).toBeCloseTo(-1, 12);
    expect(evaluateMypaintCurve([0, 0, 0.5, 1, 1, 0], 0.75)).toBeCloseTo(0.5, 12);
    expect(evaluateMypaintCurve([0, 0, 0.5, 1, 1, 0], 1.5)).toBeCloseTo(-1, 12);
  });

  it("평평하거나 수직인 구간은 그 구간의 첫 y 를 낸다", () => {
    expect(evaluateMypaintCurve([0, 0.3, 1, 0.3], 5)).toBe(0.3);
    expect(evaluateMypaintCurve([0, 0, 0, 1, 1, 1], -1)).toBe(0);
  });

  it("정의역의 끝점과 안쪽 꺾인 점에서 최솟값·최댓값을 찾는다", () => {
    expect(mypaintCurveRange([0, 0, 0.5, 1, 1, 0], 0, 1)).toEqual([0, 1]);
    const [low, high] = mypaintCurveRange([0, 0, 0.5, 1, 1, 0], 0.6, 2);
    expect(low).toBeCloseTo(-2, 12);
    expect(high).toBeCloseTo(0.8, 12);
  });
});

describe("MyPaint 속도 입력과 지수 평균", () => {
  it("속도 입력은 45px/s 에서 0.5·기울기 0.015 이고 속도에 따라 커진다", () => {
    for (const gammaLog of [1, 4, 5]) {
      expect(mypaintSpeedInput(45, gammaLog)).toBeCloseTo(0.5, 12);
      expect((mypaintSpeedInput(45.001, gammaLog) - mypaintSpeedInput(44.999, gammaLog)) / 0.002).toBeCloseTo(0.015, 6);
      expect(mypaintSpeedInput(2000, gammaLog)).toBeGreaterThan(mypaintSpeedInput(200, gammaLog));
    }
  });

  it("일정한 속도에서 지수 평균은 시간 상수만큼 그 속도에 다가간다", () => {
    const samples = line(251, 8, 8); // 1000px/s 로 2초
    const result = mypaintFilteredSpeedMaxima(samples, { ...instant, speed1Slowness: 0.04, speed2Slowness: 0.8, offsetTimeConstant: 0.01 });
    expect(result.speed1).toBeCloseTo(1000, 0);
    expect(result.speed2 / 1000).toBeCloseTo(1 - Math.exp(-2 / 0.8), 3);
    expect(result.offset).toBeCloseTo(1000, 0);
  });

  it("시간이 같은 표본은 0.0001초로 본다(libmypaint 와 같이 속도가 크게 튄다)", () => {
    const samples = [{ x: 0, y: 0, tMs: 0 }, { x: 10, y: 0, tMs: 0 }];
    expect(mypaintFilteredSpeedMaxima(samples, instant).speed1).toBeCloseTo(100_000, 3);
  });

  it("5초보다 긴 간격은 평균을 리셋한다", () => {
    const burst = (offsetMs: number, from: number) => line(26, 8, 8).map((sample) => ({ ...sample, x: sample.x + from, tMs: sample.tMs + offsetMs }));
    const filter = { ...instant, speed2Slowness: 0.8 };
    const once = mypaintFilteredSpeedMaxima(burst(0, 0), filter).speed2;
    const twice = mypaintFilteredSpeedMaxima([...burst(0, 0), ...burst(6_000, 200)], filter).speed2;
    expect(twice).toBeCloseTo(once, 9);
  });

  it("프라이밍 리셋 뒤 첫 표본은 0.0001초 동안 잡음만큼 움직이고, 그 뒤로는 0.5·잡음 길이를 건너뛰어 합친다", () => {
    const samples = line(11, 3, 10); // 300px/s
    expect(mypaintFilteredSpeedMaxima(samples, instant).speed1).toBeCloseTo(300, 9);
    const jitter = Math.sqrt(Math.PI) * 10; // 잡음 10px 의 평균 변화량
    // 즉시 따라가는 평균: 첫 표본(결정적 이동 0, 0.0001초)의 잡음 이동이 최댓값이다.
    const instantNoisy = mypaintFilteredSpeedMaxima(samples, { ...instant, trackingNoisePx: 10 });
    expect(instantNoisy.speed1).toBeCloseTo(jitter / 0.0001, 3);
    expect(instantNoisy.offset).toBeCloseTo(instantNoisy.speed1, 3);
    // 0.04초 평균: 첫 이벤트 뒤에는 5px 를 건너뛰어 표본 두 개(6px, 0.02초)씩 다섯 번 처리되고, 꼬리는 모두 건너뛴다.
    const events: (readonly [number, number])[] = [[0.0001, jitter / 0.0001], ...Array.from({ length: 5 }, () => [0.02, (6 + jitter) / 0.02] as const)];
    let slow = 0, expected = 0;
    for (const [dt, speed] of events) {
      slow += (speed - slow) * (1 - Math.exp(-dt / 0.04));
      expected = Math.max(expected, slow);
    }
    expect(mypaintFilteredSpeedMaxima(samples, { ...instant, speed1Slowness: 0.04, trackingNoisePx: 10 }).speed1).toBeCloseTo(expected, 6);
  });

  it("느린 추적은 커서를 늦게 따라가게 할 뿐 일정한 속도보다 빠르게 만들지 않는다", () => {
    const samples = line(126, 8, 8);
    const tracked = mypaintFilteredSpeedMaxima(samples, { ...instant, slowTracking: 1 });
    expect(tracked.speed1).toBeLessThanOrEqual(1000 + 1e-6);
    expect(tracked.speed1).toBeGreaterThan(990);
  });
});

describe("MyPaint CC0 도달 범위", () => {
  const still = line(2, 0, 8);

  it("곡선 없는 브러시는 반지름과 무작위 산포만큼 닿는다", () => {
    const rows: StudioMypaintCc0ReachRow[] = [["radius_logarithmic", 0.2], ["offset_by_random", 0.5, { pressure: [0, 0, 1, -0.3] }]];
    expect(studioMypaintCc0ReachPx(rows, 4, still)).toBeCloseTo(4 + GAUSS * 0.5 * 4, 9);
  });

  it("brush_radius 입력은 ln(반지름)이고 곡선 점 밖이면 직선으로 연장한다", () => {
    const rows: StudioMypaintCc0ReachRow[] = [["radius_logarithmic", 2, { brush_radius: [0, 0, 1, 1] }]];
    expect(studioMypaintCc0ReachPx(rows, Math.exp(3), still)).toBeCloseTo(Math.exp(6), 6);
  });

  it("필압 입력은 pressure_gain_log 만큼 커지고, 반지름은 1000px·방향 오프셋은 축마다 3240px 에서 자른다", () => {
    const gained: StudioMypaintCc0ReachRow[] = [["radius_logarithmic", 0, { pressure: [0, 0, 1, 1] }], ["pressure_gain_log", Math.log(2)]];
    expect(studioMypaintCc0ReachPx(gained, 1, still)).toBeCloseTo(Math.exp(2), 9);
    expect(studioMypaintCc0ReachPx([["radius_logarithmic", 0, { brush_radius: [0, 0, 1, 10] }]], Math.exp(2), still)).toBe(1000);
    expect(studioMypaintCc0ReachPx([["offset_x", 1000]], 10, still)).toBeCloseTo(10 + 3240, 9);
  });

  it("custom 입력은 0 과 custom_input 설정 범위 안에 머문다", () => {
    const rows: StudioMypaintCc0ReachRow[] = [["offset_angle", 0, { custom: [0, 0, 1, 1] }], ["custom_input", 5]];
    expect(studioMypaintCc0ReachPx(rows, 2, still)).toBeCloseTo(2 + Math.hypot(10, 10), 9);
  });

  it("viewzoom 은 0, surfacemap 은 gridmap(0–256), 모르는 입력은 ±360 으로 본다", () => {
    expect(studioMypaintCc0ReachPx([["radius_logarithmic", 0, { viewzoom: [0, 0, 1, 5] }]], 3, still)).toBeCloseTo(3, 9);
    expect(studioMypaintCc0ReachPx([["offset_x", 0, { surfacemap_x: [0, 0, 256, 2] }]], 3, still)).toBeCloseTo(3 + 6, 9);
    expect(studioMypaintCc0ReachPx([["offset_y", 0, { mystery: [0, 0, 1, 0.01] }]], 3, still)).toBeCloseTo(3 + 3.6 * 3, 9);
  });

  it("속도 오프셋과 속도 반지름 곡선은 저장된 획의 실제 속도로 커진다", () => {
    const slow = line(126, 1, 8), fast = line(126, 16, 8); // 125px/s, 2000px/s
    const bySpeed: StudioMypaintCc0ReachRow[] = [["offset_by_speed", 1]];
    expect(studioMypaintCc0ReachPx(bySpeed, 4, fast)).toBeCloseTo(4 + 0.1 * 2000, 0);
    const bySpeedRadius: StudioMypaintCc0ReachRow[] = [["radius_logarithmic", 1, { speed1: [0, 0, 1, 0.5] }]];
    const expected = (speed: number) => Math.exp(Math.log(4) + 0.5 * mypaintSpeedInput(speed, 4));
    expect(studioMypaintCc0ReachPx(bySpeedRadius, 4, fast)).toBeCloseTo(expected(2000), 1);
    expect(studioMypaintCc0ReachPx(bySpeedRadius, 4, slow)).toBeCloseTo(expected(125), 1);
  });

  it("추적 잡음은 위치를 축마다 2√3·잡음 흔들고 이동량을 키워 속도 곡선도 키운다", () => {
    const rows: StudioMypaintCc0ReachRow[] = [["tracking_noise", 1], ["radius_logarithmic", 1, { speed1: [0, 0, 1, 0.1] }]];
    const quiet: StudioMypaintCc0ReachRow[] = [["radius_logarithmic", 1, { speed1: [0, 0, 1, 0.1] }]];
    const samples = line(126, 4, 8);
    const noisy = studioMypaintCc0ReachPx(rows, 4, samples), plain = studioMypaintCc0ReachPx(quiet, 4, samples);
    expect(noisy - GAUSS * 4).toBeGreaterThan(plain);
  });
});
