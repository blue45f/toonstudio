import { describe, expect, it } from "vitest";

import {
  computeImpastoReliefNormals,
  createDipPenNibFlexState,
  createImpastoOilCarry,
  createImpastoOilWindow,
  depositImpastoOilWindow,
  evaluateDipPenRailroadingProfile,
  evaluateDipPenReservoirFlow,
  kmMixRgb,
  MANGA_NIB_PERSONALITY_PROFILES,
  measureImpastoVolume,
  sampleDipPenStrokeCrossSection,
  scrapeImpastoPaletteKnife,
  stepDipPenNibFlex,
  stepImpastoBinghamLeveling,
  updateImpastoOilCarry,
} from "./dip-pen-railroading-and-impasto";

describe("dip-pen-railroading-and-impasto", () => {
  it("만화 딥펜 5종 프로파일이 고유 물리 계수를 유지하고 2차계 닙 벌어짐이 정상 상태에 수렴한다", () => {
    const ids = Object.keys(MANGA_NIB_PERSONALITY_PROFILES);
    expect(ids).toEqual(["g-pen", "maru-pen", "kabura-pen", "school-pen", "fude-brush-pen"]);

    const gPen = MANGA_NIB_PERSONALITY_PROFILES["g-pen"];
    const state = createDipPenNibFlexState(gPen.spec, 0.05);
    let out = stepDipPenNibFlex(state, 0.95, 16, gPen.spec);
    for (let i = 0; i < 8; i += 1) {
      out = stepDipPenNibFlex(state, 0.95, 16, gPen.spec);
    }
    expect(out.nibGap).toBeGreaterThan(5.0);
    expect(out.width).toBeGreaterThan(gPen.spec.baseWidth + 5.5);
    expect(out.ry).toBeCloseTo((out.width * gPen.spec.aspect) / 2, 3);
  });

  it("과압 시 철길 갈라짐(Railroading)이 발생해 중앙 알파가 낮아지고 양쪽 Tine 피크가 형성된다", () => {
    const gPen = MANGA_NIB_PERSONALITY_PROFILES["g-pen"];
    const mild = evaluateDipPenRailroadingProfile(gPen.spec.gapMax * 0.4, gPen.spec.gapMax, gPen.railroadThresholdRatio, 0);
    expect(mild.splitRatio).toBe(0);
    expect(mild.centerAlpha).toBeCloseTo(1, 3);

    const heavyCenter = evaluateDipPenRailroadingProfile(gPen.spec.gapMax * 0.98, gPen.spec.gapMax, gPen.railroadThresholdRatio, 0);
    const heavyTine = evaluateDipPenRailroadingProfile(gPen.spec.gapMax * 0.98, gPen.spec.gapMax, gPen.railroadThresholdRatio, 0.72);
    expect(heavyCenter.splitRatio).toBeGreaterThan(0.8);
    expect(heavyTine.crossSectionAlpha).toBeGreaterThan(heavyCenter.crossSectionAlpha);

    const lut = sampleDipPenStrokeCrossSection(gPen.spec.gapMax * 0.98, gPen.spec.gapMax, gPen.railroadThresholdRatio, 33);
    expect(lut).toHaveLength(33);
    expect(lut[16]!).toBeLessThan(lut[4]!);
    expect(lut[16]!).toBeLessThan(lut[28]!);
  });

  it("딥펜 잉크 저장소는 이동 거리와 필압이 커질수록 단조 감쇠한다", () => {
    const fresh = evaluateDipPenReservoirFlow(0, 1400, 0.6);
    const mid = evaluateDipPenReservoirFlow(700, 1400, 0.6);
    const drained = evaluateDipPenReservoirFlow(2800, 1400, 0.9);
    expect(fresh.inkRemainingRatio).toBeCloseTo(1, 4);
    expect(mid.inkRemainingRatio).toBeLessThan(fresh.inkRemainingRatio);
    expect(drained.flowScale).toBeLessThan(mid.flowScale);
    expect(drained.widthScale).toBeLessThan(mid.widthScale);
    expect(drained.flowScale).toBeGreaterThanOrEqual(0.28);
  });

  it("Kubelka-Munk 혼색으로 청색+황색 혼합 시 회색 탁함 대신 녹색 대역이 보존된다", () => {
    const blue: [number, number, number] = [0.06, 0.22, 0.85];
    const yellow: [number, number, number] = [0.95, 0.88, 0.08];
    const mixed = kmMixRgb(blue, yellow, 0.5);
    expect(mixed[1]).toBeGreaterThan(mixed[0]);
    expect(mixed[1]).toBeGreaterThan(mixed[2]);
  });

  it("유화 팔레트 나이프 스크레이프가 총 물감 부피를 보존하면서 중앙을 긁어 가장자리 둑(Ridge)을 형성한다", () => {
    const win = createImpastoOilWindow(15, 15);
    const dep = new Float32Array(15 * 15).fill(0.8);
    depositImpastoOilWindow(win, dep, [0.82, 0.24, 0.16], 0.55);

    const before = measureImpastoVolume(win);
    const centerBefore = win.height[7 * 15 + 7]!;

    scrapeImpastoPaletteKnife(win, {
      centerX: 7,
      centerY: 7,
      radius: 4.5,
      angleRad: 0,
      scrapeStrength: 0.78,
      mixing: 0.5,
    });

    const after = measureImpastoVolume(win);
    expect(after.totalVolume).toBeCloseTo(before.totalVolume, 2);
    expect(after.wetVolume).toBeCloseTo(before.wetVolume, 2);
    expect(win.height[7 * 15 + 7]!).toBeLessThan(centerBefore);

    const normals = computeImpastoReliefNormals(win, 2.5);
    expect(normals).toHaveLength(15 * 15 * 3);
    // 긁힌 경계는 평탄하지 않아 nz < 1인 릴리프 법선이 생긴다.
    let slopedCells = 0;
    for (let i = 0; i < 15 * 15; i += 1) {
      if ((normals[i * 3 + 2] ?? 1) < 0.99) slopedCells += 1;
    }
    expect(slopedCells).toBeGreaterThan(10);
  });

  it("Bingham 레벨링·건조 감쇠와 붓 픽업 캐리(Carry)가 안정적으로 동작한다", () => {
    const win = createImpastoOilWindow(9, 9);
    const dep = new Float32Array(9 * 9);
    dep[4 * 9 + 4] = 3.2;
    depositImpastoOilWindow(win, dep, [0.15, 0.55, 0.85], 0.5);

    const carry = createImpastoOilCarry();
    const first = updateImpastoOilCarry(win, dep, carry, [0.9, 0.8, 0.1], 1, 0.7);
    expect(first[0]).toBeCloseTo(0.9, 3);
    const second = updateImpastoOilCarry(win, dep, carry, [0.9, 0.8, 0.1], 1, 0.7);
    // 청색 물감을 픽업해 녹색 방향으로 이동해야 한다.
    expect(second[0]).toBeLessThan(first[0]);

    const wetBefore = measureImpastoVolume(win).wetVolume;
    const step = stepImpastoBinghamLeveling(win, {
      viscosity: 0.2,
      oilYield: 0.4,
      dryingMs: 1000,
      dtMs: 100,
    });
    expect(step.movedVolume).toBeGreaterThan(0);
    expect(measureImpastoVolume(win).wetVolume).toBeLessThan(wetBefore);
  });
});
