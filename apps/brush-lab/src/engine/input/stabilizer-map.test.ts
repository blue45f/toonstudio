import { describe, expect, it } from "vitest";

import { OneEuroFilter } from "./one-euro";
import {
  clampStabilizerPct,
  LAZY_RADIUS_MAX_PX,
  LAZY_RADIUS_MIN_PX,
  lazyRadiusPxFromPct,
  PEN_LAG_MAX_MS,
  PEN_LAG_MIN_MS,
  penLagMsFromPct,
  STABILIZER_BETA_MAX,
  STABILIZER_BETA_OFF,
  STABILIZER_MIN_CUTOFF_MAX_HZ,
  STABILIZER_MIN_CUTOFF_OFF_HZ,
  stabilizerPctToOneEuro,
} from "./stabilizer-map";

/** 1€ 필터로 sin 지터를 거른 뒤 정상 상태 진폭비(출력/입력). 속도가 0에 가까운 저속 손떨림 모사. */
function jitterGain(pct: number, freqHz: number): number {
  const filter = new OneEuroFilter(stabilizerPctToOneEuro(pct));
  const amp = 0.3;
  const dtMs = 1000 / 240;
  let peak = 0;
  for (let i = 0; i < 2400; i += 1) {
    const tMs = i * dtMs;
    const y = filter.filter(amp * Math.sin(2 * Math.PI * freqHz * (tMs / 1000)), tMs);
    if (i > 1200) peak = Math.max(peak, Math.abs(y));
  }
  return peak / amp;
}

describe("안정화 슬라이더 로그 매핑(1€)", () => {
  it("양 끝점이 정확하다: 0 → 30 Hz·β 0.12, 100 → 0.4 Hz·β 0.006, dCutoff 1", () => {
    expect(stabilizerPctToOneEuro(0)).toEqual({ minCutoff: 30, beta: 0.12, dCutoff: 1 });
    expect(stabilizerPctToOneEuro(100)).toEqual({ minCutoff: 0.4, beta: 0.006, dCutoff: 1 });
    expect(STABILIZER_MIN_CUTOFF_OFF_HZ).toBe(30);
    expect(STABILIZER_MIN_CUTOFF_MAX_HZ).toBe(0.4);
    expect(STABILIZER_BETA_OFF).toBe(0.12);
    expect(STABILIZER_BETA_MAX).toBe(0.006);
  });

  it("중간값은 로그 보간이다: s=50은 기하 평균이다", () => {
    const mid = stabilizerPctToOneEuro(50);
    expect(mid.minCutoff).toBeCloseTo(Math.sqrt(30 * 0.4), 10);
    expect(mid.beta).toBeCloseTo(Math.sqrt(0.12 * 0.006), 10);
  });

  it("minCutoff와 β는 0..100에서 순증가 s에 대해 순감소한다(단조)", () => {
    let prev = stabilizerPctToOneEuro(0);
    for (let s = 1; s <= 100; s += 1) {
      const cur = stabilizerPctToOneEuro(s);
      expect(cur.minCutoff).toBeLessThan(prev.minCutoff);
      expect(cur.beta).toBeLessThan(prev.beta);
      prev = cur;
    }
  });

  it("범위 밖·비유한 값은 가두거나 0(끔)으로 본다", () => {
    expect(stabilizerPctToOneEuro(-50)).toEqual(stabilizerPctToOneEuro(0));
    expect(stabilizerPctToOneEuro(500)).toEqual(stabilizerPctToOneEuro(100));
    expect(stabilizerPctToOneEuro(Number.NaN)).toEqual(stabilizerPctToOneEuro(0));
    expect(clampStabilizerPct(Number.POSITIVE_INFINITY)).toBe(0);
    expect(clampStabilizerPct(37.5)).toBe(37.5);
  });

  it("s=0은 raw 수준이다: 8 Hz 손떨림 진폭이 거의 그대로 통과하고, s=100은 거의 막는다", () => {
    expect(jitterGain(0, 8)).toBeGreaterThan(0.9);
    expect(jitterGain(100, 8)).toBeLessThan(0.1);
    // 슬라이더를 올릴수록 통과 진폭이 줄어든다.
    let prev = Number.POSITIVE_INFINITY;
    for (const s of [0, 20, 40, 60, 80, 100]) {
      const g = jitterGain(s, 8);
      expect(g).toBeLessThan(prev);
      prev = g;
    }
  });
});

describe("끈 당김·물리 펜 슬라이더 매핑", () => {
  it("끈 길이: 0은 정확히 0 px(끈 없음), 그 위는 0.5 → 48 px 로그 단조 증가", () => {
    expect(lazyRadiusPxFromPct(0)).toBe(0);
    expect(lazyRadiusPxFromPct(-3)).toBe(0);
    expect(lazyRadiusPxFromPct(100)).toBe(LAZY_RADIUS_MAX_PX);
    expect(lazyRadiusPxFromPct(1)).toBeGreaterThanOrEqual(LAZY_RADIUS_MIN_PX);
    expect(lazyRadiusPxFromPct(50)).toBeCloseTo(Math.sqrt(LAZY_RADIUS_MIN_PX * LAZY_RADIUS_MAX_PX), 10);
    let prev = 0;
    for (let s = 1; s <= 100; s += 1) {
      const r = lazyRadiusPxFromPct(s);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });

  it("물리 펜 지연: 8 → 60 ms 로그 단조 증가", () => {
    expect(penLagMsFromPct(0)).toBe(PEN_LAG_MIN_MS);
    expect(penLagMsFromPct(100)).toBe(PEN_LAG_MAX_MS);
    expect(penLagMsFromPct(50)).toBeCloseTo(Math.sqrt(PEN_LAG_MIN_MS * PEN_LAG_MAX_MS), 10);
    let prev = 0;
    for (let s = 0; s <= 100; s += 1) {
      const v = penLagMsFromPct(s);
      expect(v).toBeGreaterThan(prev);
      prev = v;
    }
  });
});
