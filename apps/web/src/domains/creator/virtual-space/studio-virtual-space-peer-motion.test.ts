import { describe, expect, it } from "vitest";

import {
  STUDIO_PEER_IMPACT_ABSORB_MS,
  peerImpactExcursion,
  peerImpactOffsetAt,
} from "./studio-virtual-space-peer-motion";
import { DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG } from "./studio-virtual-space-physics";

/**
 * 피어 반발 재생 (VS 120 웨이브 3).
 * 새 곡선을 발명하지 않았는지가 핵심이다 — 오프셋은 로컬 몸과 같은
 * stepFeelVelocity 감쇠를 적분한 궤적이어야 하고, 타임라인이 궤적을 흡수하는
 * 창이 지나면 정확히 0으로 돌아와 이중 변위가 남지 않아야 한다.
 */
describe("피어 반발 재생 곡선", () => {
  it("정지 속도에서는 되돌림이 없다", () => {
    expect(peerImpactExcursion(0, 0)).toEqual({ x: 0, y: 0 });
    expect(peerImpactOffsetAt(0, 0, 100)).toEqual({ x: 0, y: 0 });
  });

  it("되돌림은 반발 속도 방향을 따르고 크기가 유한하다", () => {
    // 로컬 반발 상한(최고 속도 210의 40%) 수준의 반발.
    const excursion = peerImpactExcursion(-84, 0);
    expect(excursion.x).toBeLessThan(0);
    expect(excursion.y).toBe(0);
    expect(Math.abs(excursion.x)).toBeGreaterThan(0.5);
    expect(Math.abs(excursion.x)).toBeLessThan(60);
    const diagonal = peerImpactExcursion(60, 80);
    expect(diagonal.x).toBeGreaterThan(0);
    expect(diagonal.y).toBeGreaterThan(0);
  });

  it("더 빠른 반발일수록 되돌림이 크고, 감속이 강하면 작아진다", () => {
    const slow = peerImpactExcursion(-40, 0);
    const fast = peerImpactExcursion(-160, 0);
    expect(Math.abs(fast.x)).toBeGreaterThan(Math.abs(slow.x));
    const stiff = peerImpactExcursion(-84, 0, { ...DEFAULT_STUDIO_SPACE_PHYSICS_CONFIG, deceleration: 6_000 });
    expect(Math.abs(stiff.x)).toBeLessThan(Math.abs(peerImpactExcursion(-84, 0).x));
  });

  it("오프셋은 온셋 직후에 살아 있고 흡수 창이 지나면 정확히 0이다", () => {
    const early = peerImpactOffsetAt(-84, 0, 40);
    expect(early.x).toBeLessThan(0);
    const mid = peerImpactOffsetAt(-84, 0, 120);
    expect(mid.x).toBeLessThan(0);
    // 흡수 창 끝자락에서는 봉합 때문에 한창일 때보다 훨씬 작아진다.
    const late = peerImpactOffsetAt(-84, 0, STUDIO_PEER_IMPACT_ABSORB_MS - 10);
    expect(Math.abs(late.x)).toBeLessThan(Math.abs(mid.x));
    expect(peerImpactOffsetAt(-84, 0, STUDIO_PEER_IMPACT_ABSORB_MS)).toEqual({ x: 0, y: 0 });
    expect(peerImpactOffsetAt(-84, 0, 5_000)).toEqual({ x: 0, y: 0 });
  });

  it("억제(reduced-motion·효과 low)·잘못된 경과에서는 오프셋이 없다", () => {
    expect(peerImpactOffsetAt(-84, 0, 100, { suppressed: true })).toEqual({ x: 0, y: 0 });
    expect(peerImpactOffsetAt(-84, 0, -5)).toEqual({ x: 0, y: 0 });
    expect(peerImpactOffsetAt(-84, 0, Number.NaN)).toEqual({ x: 0, y: 0 });
    expect(peerImpactOffsetAt(Number.NaN, 0, 100)).toEqual({ x: 0, y: 0 });
  });

  it("오프셋은 전체 되돌림을 넘지 않는다(이중 변위 방지)", () => {
    const excursion = peerImpactExcursion(-84, 30);
    for (const elapsed of [10, 60, 120, 200, 300]) {
      const offset = peerImpactOffsetAt(-84, 30, elapsed);
      expect(Math.abs(offset.x)).toBeLessThanOrEqual(Math.abs(excursion.x) + 1e-9);
      expect(Math.abs(offset.y)).toBeLessThanOrEqual(Math.abs(excursion.y) + 1e-9);
    }
  });
});
