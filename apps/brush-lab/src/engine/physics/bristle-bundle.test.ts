import { describe, expect, it } from "vitest";

import {
  createBristleState,
  evaluateBristleClumpingProfile,
  stepBristle,
  strandPhaseSeed,
} from "./bristle-bundle";
import { DEFAULT_BRISTLE_SPEC } from "./physics-model";

const DT = 1000 / 240;
const SPEC = { ...DEFAULT_BRISTLE_SPEC, baseRadius: 6 };

describe("붓모 다발", () => {
  it("압력 → 폭 단조 증가", () => {
    let prev = 0;
    for (let i = 0; i <= 20; i += 1) {
      const state = createBristleState(1);
      const out = stepBristle(state, { pressure: i / 20, altitudeDeg: 90, dirX: 1, dirY: 0 }, DT, SPEC);
      expect(out.rx).toBeGreaterThanOrEqual(prev);
      expect(out.ry).toBeCloseTo(out.rx, 5);
      prev = out.rx;
    }
    expect(prev).toBeCloseTo(6 * (1 + SPEC.spreadGain), 4);
  });

  it("기울기 → 비대칭 부호: 수직은 0, 기울이면 rx > ry", () => {
    const vertical = stepBristle(createBristleState(1), { pressure: 0.5, altitudeDeg: 90, dirX: 1, dirY: 0 }, DT, SPEC);
    expect(vertical.asymmetry).toBe(0);
    const tilted = stepBristle(createBristleState(1), { pressure: 0.5, altitudeDeg: 45, dirX: 1, dirY: 0 }, DT, SPEC);
    expect(tilted.asymmetry).toBeGreaterThan(0);
    expect(tilted.rx).toBeGreaterThan(tilted.ry);
    const flat = stepBristle(createBristleState(1), { pressure: 0.5, altitudeDeg: 0, dirX: 1, dirY: 0 }, DT, SPEC);
    expect(flat.asymmetry).toBeCloseTo(SPEC.tiltGain, 5);
  });

  it("방향 급변 시 각도가 τ = 30 ms로 지연 추종한다", () => {
    const state = createBristleState(1);
    for (let i = 0; i < 48; i += 1) stepBristle(state, { pressure: 0.5, altitudeDeg: 90, dirX: 1, dirY: 0 }, DT, SPEC);
    const first = stepBristle(state, { pressure: 0.5, altitudeDeg: 90, dirX: 0, dirY: 1 }, DT, SPEC);
    expect(first.angle).toBeGreaterThan(0);
    expect(first.angle).toBeLessThan(Math.PI / 2);
    // 1틱(4.17 ms) 후 비율 1 − e^(−dt/τ)
    expect(first.angle / (Math.PI / 2)).toBeCloseTo(1 - Math.exp(-DT / SPEC.followTauMs), 3);
    let last = first;
    for (let i = 0; i < 96; i += 1) last = stepBristle(state, { pressure: 0.5, altitudeDeg: 90, dirX: 0, dirY: 1 }, DT, SPEC);
    expect(last.angle).toBeCloseTo(Math.PI / 2, 2);
  });

  it("각도는 원형 보간(−π..π 경계)이며 첫 틱은 즉시 정렬", () => {
    const state = createBristleState(1);
    const first = stepBristle(state, { pressure: 0.5, altitudeDeg: 90, dirX: -1, dirY: 0.001 }, DT, SPEC);
    expect(Math.abs(first.angle)).toBeCloseTo(Math.PI, 2);
    const next = stepBristle(state, { pressure: 0.5, altitudeDeg: 90, dirX: -1, dirY: -0.001 }, DT, SPEC);
    expect(Math.abs(next.angle)).toBeCloseTo(Math.PI, 2);
  });

  it("가닥 위상 시드는 결정적이고 24비트이며 가닥마다 다르다", () => {
    const seeds = Array.from({ length: 24 }, (_, i) => strandPhaseSeed(7, i));
    expect(new Set(seeds).size).toBe(24);
    for (const s of seeds) expect(s).toBeLessThanOrEqual(0x00ffffff);
    expect(strandPhaseSeed(7, 3)).toBe(strandPhaseSeed(7, 3));
    expect(strandPhaseSeed(8, 3)).not.toBe(strandPhaseSeed(7, 3));
  });

  it("습식 모세관 응집(Clumping)과 건식 외팔보 벌어짐(Splay)을 물리적으로 구분한다", () => {
    const wetClumped = evaluateBristleClumpingProfile({
      strokeSeed: 42,
      strands: 24,
      pressure: 0.3,
      wetness: 0.92,
      normalizedSpeed: 1,
    });
    const drySplayed = evaluateBristleClumpingProfile({
      strokeSeed: 42,
      strands: 24,
      pressure: 0.85,
      wetness: 0.08,
      normalizedSpeed: 6,
    });
    expect(drySplayed.clumpCount).toBeGreaterThan(wetClumped.clumpCount * 2);
    expect(drySplayed.splayFactor).toBeGreaterThan(wetClumped.splayFactor);
    expect(drySplayed.featheredEdgeContrast).toBeGreaterThan(wetClumped.featheredEdgeContrast);
    expect(drySplayed.strandOffsets.length).toBe(24);
    expect(drySplayed.strandWeights.length).toBe(24);
  });
});

