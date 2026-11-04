import { describe, expect, it } from "vitest";

import { OFFICE2D_TELEPORT_VEIL_ALPHA, OFFICE2D_TELEPORT_VEIL_MS, Office2dTeleportVeil } from "./office2d-teleport-veil";

describe("Office2dTeleportVeil", () => {
  it("이동 전에는 막이 없고 이동 순간 가장 진하게 시작한다", () => {
    const veil = new Office2dTeleportVeil();
    expect(veil.opacity(1000, false)).toBe(0);
    veil.trigger(1000);
    expect(veil.opacity(1000, false)).toBeCloseTo(OFFICE2D_TELEPORT_VEIL_ALPHA);
  });

  it("시간이 갈수록 단조롭게 옅어지고 지속 시간이 지나면 0이다", () => {
    const veil = new Office2dTeleportVeil();
    veil.trigger(0);
    let previous = Number.POSITIVE_INFINITY;
    for (let elapsed = 0; elapsed < OFFICE2D_TELEPORT_VEIL_MS; elapsed += 20) {
      const value = veil.opacity(elapsed, false);
      expect(value).toBeLessThanOrEqual(previous);
      expect(value).toBeGreaterThan(0);
      previous = value;
    }
    expect(veil.opacity(OFFICE2D_TELEPORT_VEIL_MS, false)).toBe(0);
    expect(veil.opacity(OFFICE2D_TELEPORT_VEIL_MS * 3, false)).toBe(0);
  });

  it("동작 줄이기에서는 항상 0이고, 시계가 뒤로 가도 막이 1을 넘지 않는다", () => {
    const veil = new Office2dTeleportVeil();
    veil.trigger(500);
    expect(veil.opacity(510, true)).toBe(0);
    expect(veil.opacity(100, false)).toBeLessThanOrEqual(OFFICE2D_TELEPORT_VEIL_ALPHA);
  });

  it("다시 이동하면 막이 다시 진하게 시작한다", () => {
    const veil = new Office2dTeleportVeil();
    veil.trigger(0);
    expect(veil.opacity(OFFICE2D_TELEPORT_VEIL_MS + 10, false)).toBe(0);
    veil.trigger(1000);
    expect(veil.opacity(1000, false)).toBeCloseTo(OFFICE2D_TELEPORT_VEIL_ALPHA);
  });
});
