import { describe, expect, it } from "vitest";
import {
  DEFAULT_PAPER_REFLECTANCE,
  DEFAULT_PIGMENT_OPTICS,
  FLUID_DEFAULT_MAX_CFL,
  FLUID_PIGMENT_CHANNELS,
  FLUID_SIM_UNIFORM_BYTE_LENGTH,
  PAINT_MEDIUM_PRESETS,
  PIGMENT_ADVECTION_DRYING_WGSL,
  SHALLOW_WATER_VELOCITY_WGSL,
  WET_COMPOSITE_UNIFORM_BYTE_LENGTH,
  WET_MEDIA_COMPOSITE_WGSL,
  advectPigmentSemiLagrangian,
  buildFluidPingPongDispatchPlan,
  compositeShallowWaterFieldToRgba,
  createShallowWaterPaintField,
  depositFluidPaintDrop,
  evaluateKubelkaMunkChannelReflectance,
  evaluateKubelkaMunkPigmentRgb,
  measureCoffeeRingBackrunMetrics,
  measureFluidPigmentCenterOfMass,
  measureFluidPigmentMassConservation,
  packFluidSimUniforms,
  packWetCompositeUniforms,
  stepShallowWaterFluidSimulation,
  validateFluidWgslContracts,
} from "./index";

describe("Wave 68: 실시간 2D 얕은 물방정식 유체 수채화·유화 WebGPU 핑퐁 시뮬레이터", () => {
  it("1. 결정론적 냉압 종이 요철과 4채널 유체 필드를 정확히 초기화한다", () => {
    const fieldA = createShallowWaterPaintField(24, 20, { paperGrainSeed: 777, paperRoughness: 0.7 });
    const fieldB = createShallowWaterPaintField(24, 20, { paperGrainSeed: 777, paperRoughness: 0.7 });

    expect(fieldA.width).toBe(24);
    expect(fieldA.height).toBe(20);
    expect(fieldA.cellCount).toBe(480);
    expect(fieldA.channelCount).toBe(FLUID_PIGMENT_CHANNELS);
    expect(fieldA.mobilePigment.length).toBe(480 * 4);
    expect(fieldA.depositedPigment.length).toBe(480 * 4);
    expect(Array.from(fieldA.paperGrain)).toEqual(Array.from(fieldB.paperGrain));
    for (let i = 0; i < fieldA.paperGrain.length; i += 1) {
      const g = fieldA.paperGrain[i] ?? -1;
      expect(g).toBeGreaterThanOrEqual(0);
      expect(g).toBeLessThanOrEqual(1);
    }
  });

  it("2. 젖은 물감 방울은 유동 안료로, 건식 안료는 즉시 고착 안료로 주입된다", () => {
    const wetField = createShallowWaterPaintField(24, 24);
    const wetRes = depositFluidPaintDrop(wetField, {
      centerX: 12, centerY: 12, radius: 4, waterAmount: 0.8, pigmentAmounts: [0.9, 0.2, 0, 0],
    });
    expect(wetRes.affectedCells).toBeGreaterThan(20);
    const wetMass = measureFluidPigmentMassConservation(wetField, wetRes.addedPigmentByChannel);
    expect(wetMass.totalMobileMass).toBeCloseTo(wetRes.totalAddedPigment, 4);
    expect(wetMass.totalDepositedMass).toBe(0);

    const dryField = createShallowWaterPaintField(24, 24);
    const dryRes = depositFluidPaintDrop(dryField, {
      centerX: 12, centerY: 12, radius: 3.5, waterAmount: 0, pigmentAmounts: [0, 0, 0.75, 0.25],
    });
    const dryMass = measureFluidPigmentMassConservation(dryField, dryRes.addedPigmentByChannel);
    expect(dryMass.totalMobileMass).toBe(0);
    expect(dryMass.totalDepositedMass).toBeCloseTo(dryRes.totalAddedPigment, 4);
  });

  it("3. 수채화 시뮬레이션 45스텝 진행 후 총 안료 질량 보존 오차가 2% 미만이다", () => {
    const field = createShallowWaterPaintField(32, 32);
    const a = depositFluidPaintDrop(field, {
      centerX: 14, centerY: 12, radius: 4.5, waterAmount: 0.9, pigmentAmounts: [0.85, 0.1, 0, 0],
    });
    const b = depositFluidPaintDrop(field, {
      centerX: 19, centerY: 15, radius: 4.0, waterAmount: 0.85, pigmentAmounts: [0, 0.8, 0.35, 0.15],
    });
    const refMass: [number, number, number, number] = [
      a.addedPigmentByChannel[0] + b.addedPigmentByChannel[0],
      a.addedPigmentByChannel[1] + b.addedPigmentByChannel[1],
      a.addedPigmentByChannel[2] + b.addedPigmentByChannel[2],
      a.addedPigmentByChannel[3] + b.addedPigmentByChannel[3],
    ];
    for (let step = 0; step < 45; step += 1) {
      stepShallowWaterFluidSimulation(field, 0.04, { mediumPreset: "watercolor", gravityX: 0.6, gravityY: 1.8 });
    }
    const report = measureFluidPigmentMassConservation(field, refMass);
    expect(report.withinTwoPercentBudget).toBe(true);
    expect(report.relativeErrorPercent).toBeLessThan(2.0);
    expect(report.totalDepositedMass).toBeGreaterThan(0);
  });

  it("4. 4채널 각각의 개별 안료 질량도 혼색·건조 전 과정에서 2% 오차 이내로 보존된다", () => {
    const field = createShallowWaterPaintField(28, 28);
    const drop = depositFluidPaintDrop(field, {
      centerX: 14, centerY: 10, radius: 4.5, waterAmount: 1.0, pigmentAmounts: [0.5, 0.7, 0.4, 0.3],
    });
    for (let i = 0; i < 40; i += 1) {
      stepShallowWaterFluidSimulation(field, 0.04, { mediumPreset: "watercolor", gravityY: 2.4 });
    }
    const report = measureFluidPigmentMassConservation(field, drop.addedPigmentByChannel);
    for (let c = 0; c < 4; c += 1) {
      const refC = report.referenceMassByChannel[c] ?? 0;
      const curC = report.totalMassByChannel[c] ?? 0;
      expect(Math.abs(curC - refC) / Math.max(1e-6, refC)).toBeLessThan(0.02);
    }
  });

  it("5. 강한 중력으로 캔버스 하단 경계 벽에 충돌해도 폐쇄 경계 조건으로 안료가 누출되지 않는다", () => {
    const field = createShallowWaterPaintField(24, 24);
    const drop = depositFluidPaintDrop(field, {
      centerX: 12, centerY: 19, radius: 3.5, waterAmount: 0.95, pigmentAmounts: [0.9, 0, 0.5, 0],
    });
    for (let i = 0; i < 35; i += 1) {
      stepShallowWaterFluidSimulation(field, 0.04, { mediumPreset: "watercolor", gravityY: 9.0, evaporationRate: 0.05 });
    }
    const report = measureFluidPigmentMassConservation(field, drop.addedPigmentByChannel);
    expect(report.withinTwoPercentBudget).toBe(true);
    expect(report.relativeErrorPercent).toBeLessThan(0.5);
  });

  it("6. 태블릿 기울기·중력(+Y) 인가 시 젖은 물감의 무게중심이 뚜렷하게 하향 이동한다", () => {
    const field = createShallowWaterPaintField(32, 40);
    depositFluidPaintDrop(field, {
      centerX: 16, centerY: 10, radius: 4.5, waterAmount: 0.95, pigmentAmounts: [0.85, 0, 0, 0],
    });
    const comBefore = measureFluidPigmentCenterOfMass(field, 0);
    for (let i = 0; i < 45; i += 1) {
      stepShallowWaterFluidSimulation(field, 0.04, {
        mediumPreset: "watercolor", gravityX: 0, gravityY: 6.5, evaporationRate: 0.03, capillarySuction: 0.04,
      });
    }
    const comAfter = measureFluidPigmentCenterOfMass(field, 0);
    expect(comAfter.y - comBefore.y).toBeGreaterThan(2.5);
    expect(Math.abs(comAfter.x - comBefore.x)).toBeLessThan(1.0);
  });

  it("7. 좌/우 수평 중력(±gravityX)에 대해 물감 흐름이 대칭 방향으로 기울어진다", () => {
    const leftField = createShallowWaterPaintField(36, 24);
    const rightField = createShallowWaterPaintField(36, 24);
    const spec = { centerX: 18, centerY: 12, radius: 4.0, waterAmount: 0.9, pigmentAmounts: [0, 0.9, 0, 0] as const };
    depositFluidPaintDrop(leftField, spec);
    depositFluidPaintDrop(rightField, spec);
    for (let i = 0; i < 35; i += 1) {
      stepShallowWaterFluidSimulation(leftField, 0.04, {
        mediumPreset: "watercolor", gravityX: -6.0, evaporationRate: 0.03, capillarySuction: 0.04,
      });
      stepShallowWaterFluidSimulation(rightField, 0.04, {
        mediumPreset: "watercolor", gravityX: 6.0, evaporationRate: 0.03, capillarySuction: 0.04,
      });
    }
    expect(measureFluidPigmentCenterOfMass(leftField, 1).x).toBeLessThan(16.0);
    expect(measureFluidPigmentCenterOfMass(rightField, 1).x).toBeGreaterThan(20.0);
  });

  it("8. 무중력(gravity=0) 조건에서는 물감 방울의 무게중심이 초기 중심 부근에 유지된다", () => {
    const field = createShallowWaterPaintField(32, 32);
    depositFluidPaintDrop(field, {
      centerX: 16, centerY: 16, radius: 4.5, waterAmount: 0.85, pigmentAmounts: [0.8, 0, 0, 0],
    });
    const before = measureFluidPigmentCenterOfMass(field, 0);
    for (let i = 0; i < 30; i += 1) {
      stepShallowWaterFluidSimulation(field, 0.04, { mediumPreset: "watercolor", gravityX: 0, gravityY: 0 });
    }
    const after = measureFluidPigmentCenterOfMass(field, 0);
    expect(Math.abs(after.x - before.x)).toBeLessThan(0.4);
    expect(Math.abs(after.y - before.y)).toBeLessThan(0.4);
  });

  it("9. 저점도 수채화 확산 반경이 고점도 유화(임파스토) 확산 반경보다 유의미하게 크다", () => {
    const wcField = createShallowWaterPaintField(36, 36);
    const oilField = createShallowWaterPaintField(36, 36);
    const spec = {
      centerX: 18, centerY: 18, radius: 4.0, waterAmount: 0.95,
      pigmentAmounts: [0.9, 0, 0, 0] as const, impastoBody: 0.6,
    };
    depositFluidPaintDrop(wcField, spec);
    depositFluidPaintDrop(oilField, spec);
    const initRadius = measureFluidPigmentCenterOfMass(wcField, 0).radiusOfGyration;

    for (let i = 0; i < 40; i += 1) {
      stepShallowWaterFluidSimulation(wcField, 0.04, { mediumPreset: "watercolor", evaporationRate: 0.03 });
      stepShallowWaterFluidSimulation(oilField, 0.04, { mediumPreset: "oil-impasto", evaporationRate: 0.03 });
    }
    const wcSpread = measureFluidPigmentCenterOfMass(wcField, 0).radiusOfGyration;
    const oilSpread = measureFluidPigmentCenterOfMass(oilField, 0).radiusOfGyration;
    expect(wcSpread).toBeGreaterThan(initRadius + 0.8);
    expect(wcSpread).toBeGreaterThan(oilSpread * 1.25);
  });

  it("10. 단일 물리 모델의 점도 프리셋이 수채화 > 과슈 > 유화 순으로 확산도를 일관되게 제어한다", () => {
    const presets = ["watercolor", "gouache", "oil-impasto"] as const;
    const radii: number[] = [];
    for (const preset of presets) {
      const field = createShallowWaterPaintField(36, 36);
      depositFluidPaintDrop(field, {
        centerX: 18, centerY: 18, radius: 4.0, waterAmount: 0.9, pigmentAmounts: [0, 0, 0.85, 0],
      });
      for (let i = 0; i < 30; i += 1) {
        stepShallowWaterFluidSimulation(field, 0.04, { mediumPreset: preset, evaporationRate: 0.04 });
      }
      radii.push(measureFluidPigmentCenterOfMass(field, 2).radiusOfGyration);
    }
    expect(radii[0] ?? 0).toBeGreaterThan(radii[1] ?? 0);
    expect(radii[1] ?? 0).toBeGreaterThan(radii[2] ?? 0);
    expect(PAINT_MEDIUM_PRESETS["oil-impasto"].viscosity).toBeGreaterThan(PAINT_MEDIUM_PRESETS.gouache.viscosity);
  });

  it("11. 고점도 유화는 동일 기울기 중력에서도 빙엄 항복 응력으로 흘러내림을 강하게 억제한다", () => {
    const wcField = createShallowWaterPaintField(28, 36);
    const oilField = createShallowWaterPaintField(28, 36);
    const spec = {
      centerX: 14, centerY: 10, radius: 4.0, waterAmount: 0.9,
      pigmentAmounts: [0, 0, 0, 0.9] as const, impastoBody: 0.8,
    };
    depositFluidPaintDrop(wcField, spec);
    depositFluidPaintDrop(oilField, spec);
    const startY = measureFluidPigmentCenterOfMass(oilField, 3).y;

    for (let i = 0; i < 35; i += 1) {
      stepShallowWaterFluidSimulation(wcField, 0.04, { mediumPreset: "watercolor", gravityY: 5.0, evaporationRate: 0.03 });
      stepShallowWaterFluidSimulation(oilField, 0.04, { mediumPreset: "oil-impasto", gravityY: 5.0, evaporationRate: 0.03 });
    }
    const wcDeltaY = measureFluidPigmentCenterOfMass(wcField, 3).y - startY;
    const oilDeltaY = measureFluidPigmentCenterOfMass(oilField, 3).y - startY;
    expect(wcDeltaY).toBeGreaterThan(1.5);
    expect(oilDeltaY).toBeLessThan(wcDeltaY * 0.25);
  });

  it("12. 모세관 종이 흡수·증발이 진행되면서 표면수는 감소하고 종이 포화도가 상승한다", () => {
    const field = createShallowWaterPaintField(24, 24);
    const drop = depositFluidPaintDrop(field, {
      centerX: 12, centerY: 12, radius: 4.5, waterAmount: 0.85, pigmentAmounts: [0.6, 0, 0, 0],
    });
    const summary = stepShallowWaterFluidSimulation(field, 0.2, {
      mediumPreset: "watercolor", capillarySuction: 0.65, evaporationRate: 0.2,
    });
    let totalSat = 0;
    for (let i = 0; i < field.paperSaturation.length; i += 1) totalSat += field.paperSaturation[i] ?? 0;
    expect(summary.totalWater).toBeLessThan(drop.addedWater);
    expect(totalSat).toBeGreaterThan(0.5);
  });

  it("13. 건조 진행 시 유동 안료가 고착 안료로 단조 전환되며 완전 건조 후 강한 중력에도 이동량이 0이다", () => {
    const field = createShallowWaterPaintField(28, 32);
    const drop = depositFluidPaintDrop(field, {
      centerX: 14, centerY: 12, radius: 4.0, waterAmount: 0.55, pigmentAmounts: [0.7, 0.3, 0, 0],
    });

    let prevDep = 0;
    let last = stepShallowWaterFluidSimulation(field, 0.04, {
      mediumPreset: "watercolor", evaporationRate: 1.4, capillarySuction: 0.5,
    });
    expect(last.totalDepositedPigment).toBeGreaterThan(prevDep);
    prevDep = last.totalDepositedPigment;

    for (let i = 0; i < 40; i += 1) {
      last = stepShallowWaterFluidSimulation(field, 0.04, {
        mediumPreset: "watercolor", evaporationRate: 1.4, capillarySuction: 0.5,
      });
      expect(last.totalDepositedPigment).toBeGreaterThanOrEqual(prevDep - 1e-6);
      prevDep = last.totalDepositedPigment;
    }
    expect(last.activeWetCells).toBe(0);
    expect(last.totalMobilePigment).toBe(0);
    expect(measureFluidPigmentMassConservation(field, drop.addedPigmentByChannel).withinTwoPercentBudget).toBe(true);

    const frozen = Float32Array.from(field.depositedPigment);
    const comBefore = measureFluidPigmentCenterOfMass(field);
    for (let i = 0; i < 25; i += 1) {
      const s = stepShallowWaterFluidSimulation(field, 0.04, { mediumPreset: "watercolor", gravityX: 10, gravityY: 14 });
      expect(s.maxSpeedCellsPerSec).toBe(0);
      expect(s.activeWetCells).toBe(0);
    }
    const comAfter = measureFluidPigmentCenterOfMass(field);
    expect(comAfter.x).toBe(comBefore.x);
    expect(comAfter.y).toBe(comBefore.y);
    expect(Array.from(field.depositedPigment)).toEqual(Array.from(frozen));
  });

  it("14. 건조 전선 가장자리 증발 압력 강하 및 접촉선 피닝으로 수채화 백런(Coffee-Ring) 가장자리 농도가 증가한다", () => {
    const field = createShallowWaterPaintField(36, 36, { paperRoughness: 0.2 });
    const dropRadius = 6.0;
    depositFluidPaintDrop(field, {
      centerX: 18, centerY: 18, radius: dropRadius, waterAmount: 0.9,
      pigmentAmounts: [0.85, 0, 0, 0], edgeSoftness: 0.25,
    });
    const before = measureCoffeeRingBackrunMetrics(field, 18, 18, dropRadius, 0);

    for (let i = 0; i < 90; i += 1) {
      stepShallowWaterFluidSimulation(field, 0.04, {
        mediumPreset: "watercolor",
        gravityX: 0, gravityY: 0, viscosity: 0.05, pressureStiffness: 4.5,
        capillaryWicking: 0.02, capillarySuction: 0.04, evaporationRate: 0.22,
        edgeEvaporationBoost: 3.6, pigmentSettleRate: 0.05, contactPinningDrag: 15.0,
      });
    }
    const after = measureCoffeeRingBackrunMetrics(field, 18, 18, dropRadius, 0);
    expect(after.rimToCenterRatio).toBeGreaterThan(before.rimToCenterRatio * 1.4);
    expect(after.peakRimDensity).toBeGreaterThan(after.centerMeanDensity);
  });

  it("15. 종이 요철 골(낮은 paperGrain)이 봉우리보다 입자성 안료 침착(Granulation)을 더 많이 포집한다", () => {
    const field = createShallowWaterPaintField(20, 20);
    for (let y = 0; y < field.height; y += 1) {
      for (let x = 0; x < field.width; x += 1) {
        field.paperGrain[y * field.width + x] = x % 2 === 0 ? 0.05 : 0.95;
      }
    }
    depositFluidPaintDrop(field, {
      centerX: 10, centerY: 10, radius: 5, waterAmount: 0.9, pigmentAmounts: [0.8, 0, 0, 0], edgeSoftness: 0.1,
    });
    stepShallowWaterFluidSimulation(field, 0.16, {
      viscosity: 40, pressureStiffness: 0.05, capillaryWicking: 0, capillarySuction: 0.5,
      evaporationRate: 0.05, pigmentSettleRate: 1.5, granulationStrength: 1.8,
    });
    let valleyDep = 0; let peakDep = 0;
    for (let y = 8; y <= 12; y += 1) {
      for (let x = 8; x <= 12; x += 1) {
        const dep = field.depositedPigment[(y * field.width + x) * 4] ?? 0;
        if (x % 2 === 0) valleyDep += dep; else peakDep += dep;
      }
    }
    expect(valleyDep).toBeGreaterThan(peakDep * 1.15);
  });

  it("16. Semi-Lagrangian 독립 이류 커널이 속도장 방향으로 안료를 이동시키며 질량을 2% 이내 보존한다", () => {
    const field = createShallowWaterPaintField(32, 32);
    depositFluidPaintDrop(field, {
      centerX: 10, centerY: 10, radius: 3.5, waterAmount: 1.0, pigmentAmounts: [0.9, 0.4, 0, 0],
    });
    field.waterHeight.fill(0.8);
    field.velocityX.fill(4.0);
    field.velocityY.fill(3.0);

    const before = measureFluidPigmentCenterOfMass(field, 0);
    let maxDrift = 0;
    for (let i = 0; i < 12; i += 1) {
      const res = advectPigmentSemiLagrangian(field, 0.1, { compensateDivergence: true, conserveMass: true });
      if (res.relativeMassDrift > maxDrift) maxDrift = res.relativeMassDrift;
    }
    const after = measureFluidPigmentCenterOfMass(field, 0);
    expect(after.x - before.x).toBeGreaterThan(3.5);
    expect(after.y - before.y).toBeGreaterThan(2.5);
    expect(maxDrift).toBeLessThan(0.02);
  });

  it("17. Semi-Lagrangian 커널에 0 이하·NaN dtSec 입력 시 부작용 없이 상태를 보존한다", () => {
    const field = createShallowWaterPaintField(16, 16);
    depositFluidPaintDrop(field, {
      centerX: 8, centerY: 8, radius: 3, waterAmount: 0.7, pigmentAmounts: [0.5, 0.5, 0, 0],
    });
    const before = Float32Array.from(field.mobilePigment);
    expect(advectPigmentSemiLagrangian(field, 0).advectedCells).toBe(0);
    expect(advectPigmentSemiLagrangian(field, -0.5).advectedCells).toBe(0);
    expect(advectPigmentSemiLagrangian(field, Number.NaN).advectedCells).toBe(0);
    expect(Array.from(field.mobilePigment)).toEqual(Array.from(before));
  });

  it("18. Kubelka-Munk 감산 광학에서 프탈로 블루 + 한사 옐로우 혼색이 선명한 녹색을 생성한다", () => {
    const blue = evaluateKubelkaMunkPigmentRgb([1.0, 0, 0, 0]);
    const yellow = evaluateKubelkaMunkPigmentRgb([0, 1.0, 0, 0]);
    const green = evaluateKubelkaMunkPigmentRgb([0.85, 0.85, 0, 0]);

    expect(blue.srgb[2]).toBeGreaterThan(blue.srgb[0] + 0.45);
    expect(yellow.srgb[0]).toBeGreaterThan(0.85);
    expect(yellow.srgb[1]).toBeGreaterThan(0.8);
    expect(yellow.srgb[2]).toBeLessThan(0.45);
    expect(green.srgb[1]).toBeGreaterThan(green.srgb[0] + 0.25);
    expect(green.srgb[1]).toBeGreaterThan(green.srgb[2] + 0.25);
    expect(green.linearRgb[1]).toBeGreaterThan(green.linearRgb[0] * 2.5);
    expect(green.linearRgb[1]).toBeGreaterThan(green.linearRgb[2] * 2.5);
  });

  it("19. Kubelka-Munk 단일 채널 반사율이 S=0(Beer-Lambert 극한)과 초대형 광학 두께에서도 특이점 없이 수렴한다", () => {
    const rg = 0.92;
    expect(evaluateKubelkaMunkChannelReflectance(0.75, 0, rg)).toBeCloseTo(rg * Math.exp(-1.5), 5);

    const opaque = evaluateKubelkaMunkChannelReflectance(1000, 500, rg);
    expect(Number.isFinite(opaque)).toBe(true);
    expect(opaque).toBeCloseTo(500 / (1500 + Math.sqrt(1000 * 2000)), 5);

    const safe = evaluateKubelkaMunkChannelReflectance(Number.NaN, -5, 1.5);
    expect(Number.isFinite(safe)).toBe(true);
    expect(safe).toBeGreaterThanOrEqual(0);
    expect(safe).toBeLessThanOrEqual(1);
  });

  it("20. 파랑·노랑 두 젖은 물방울이 충돌해 섞일 때 혼합 경계 RGBA 픽셀이 선명한 녹색으로 합성된다", () => {
    const field = createShallowWaterPaintField(32, 24);
    depositFluidPaintDrop(field, {
      centerX: 12.5, centerY: 12, radius: 4.5, waterAmount: 0.95,
      pigmentAmounts: [1.0, 0, 0, 0], initialVelocityX: 2.6,
    });
    depositFluidPaintDrop(field, {
      centerX: 19.5, centerY: 12, radius: 4.5, waterAmount: 0.95,
      pigmentAmounts: [0, 1.0, 0, 0], initialVelocityX: -2.6,
    });
    for (let i = 0; i < 20; i += 1) {
      stepShallowWaterFluidSimulation(field, 0.04, {
        mediumPreset: "watercolor", evaporationRate: 0.02, capillarySuction: 0.02,
      });
    }
    const comp = compositeShallowWaterFieldToRgba(field, {
      wetSpecularStrength: 0, impastoShadingStrength: 0, paperGrainVisibility: 0,
    });
    let greenPixels = 0;
    for (let y = 9; y <= 15; y += 1) {
      for (let x = 13; x <= 19; x += 1) {
        const base = (y * field.width + x) * 4;
        const cB = (field.mobilePigment[base] ?? 0) + (field.depositedPigment[base] ?? 0);
        const cY = (field.mobilePigment[base + 1] ?? 0) + (field.depositedPigment[base + 1] ?? 0);
        const r8 = comp.rgba[base] ?? 0;
        const g8 = comp.rgba[base + 1] ?? 0;
        const b8 = comp.rgba[base + 2] ?? 0;
        if (cB > 0.25 && cY > 0.25 && g8 > r8 + 25 && g8 > b8 + 25) greenPixels += 1;
      }
    }
    expect(greenPixels).toBeGreaterThanOrEqual(8);
  });

  it("21. 측면 광원 젖은 광택(Wet Specular Sheen)이 건조 상태 대비 뚜렷한 하이라이트를 생성한다", () => {
    const wetField = createShallowWaterPaintField(24, 24, { paperRoughness: 0.1 });
    const dryField = createShallowWaterPaintField(24, 24, { paperRoughness: 0.1 });
    depositFluidPaintDrop(wetField, {
      centerX: 12, centerY: 12, radius: 5.5, waterAmount: 0.9, pigmentAmounts: [0.85, 0, 0, 0.4], edgeSoftness: 0.75,
    });
    depositFluidPaintDrop(dryField, {
      centerX: 12, centerY: 12, radius: 5.5, waterAmount: 0, pigmentAmounts: [0.85, 0, 0, 0.4], edgeSoftness: 0.75,
    });
    const light = { lightDirX: -0.65, lightDirY: -0.5, lightDirZ: 0.56, wetSpecularStrength: 0.95 };
    const wetComp = compositeShallowWaterFieldToRgba(wetField, light);
    const dryComp = compositeShallowWaterFieldToRgba(dryField, light);

    expect(wetComp.activeWetPixels).toBeGreaterThan(40);
    expect(wetComp.peakWetSpecular).toBeGreaterThan(0.15);
    expect(dryComp.activeWetPixels).toBe(0);
    expect(dryComp.peakWetSpecular).toBe(0);
    expect(wetComp.meanLuminance).toBeGreaterThan(dryComp.meanLuminance);
  });

  it("22. 두꺼운 유화 임파스토 요철은 측면 사광에서 빛을 받는 면이 그림자 면보다 밝게 음영 처리된다", () => {
    const field = createShallowWaterPaintField(24, 24, { paperRoughness: 0 });
    depositFluidPaintDrop(field, {
      centerX: 12, centerY: 12, radius: 5.0, waterAmount: 0,
      pigmentAmounts: [0, 0.4, 0.35, 0.15], impastoBody: 1.2, edgeSoftness: 0.9,
    });
    const comp = compositeShallowWaterFieldToRgba(field, {
      lightDirX: -0.85, lightDirY: 0, lightDirZ: 0.52,
      wetSpecularStrength: 0, impastoShadingStrength: 0.9, paperGrainVisibility: 0,
    });
    const luma = (x: number, y: number): number => {
      const p = (y * field.width + x) * 4;
      return (comp.rgba[p] ?? 0) * 0.2126 + (comp.rgba[p + 1] ?? 0) * 0.7152 + (comp.rgba[p + 2] ?? 0) * 0.0722;
    };
    expect(luma(9, 12)).toBeGreaterThan(luma(15, 12) + 10);
  });

  it("23. 극단적 중력·대형 dtSec·NaN/Infinity 오염 입력에서도 CFL 클램핑과 방어 정화로 발산을 차단한다", () => {
    const field = createShallowWaterPaintField(20, 20);
    depositFluidPaintDrop(field, {
      centerX: 10, centerY: 10, radius: 4, waterAmount: 1.5,
      pigmentAmounts: [1.0, 0.5, 0.5, 0.5], initialVelocityX: 999, initialVelocityY: -999,
    });
    field.waterHeight[0] = Number.NaN;
    field.velocityX[1] = Number.POSITIVE_INFINITY;
    field.mobilePigment[2] = Number.NEGATIVE_INFINITY;
    field.depositedPigment[3] = -5;

    const summary = stepShallowWaterFluidSimulation(field, 5.0, {
      gravityX: 80, gravityY: 80, viscosity: 0.01, maxCflCourant: FLUID_DEFAULT_MAX_CFL,
    });
    expect(summary.hadNonFiniteSanitized).toBe(true);
    expect(summary.cflClampedCells).toBeGreaterThan(0);
    expect(summary.maxSpeedCellsPerSec * 0.04).toBeLessThanOrEqual(FLUID_DEFAULT_MAX_CFL + 1e-3);
    for (let i = 0; i < field.cellCount; i += 1) {
      expect(Number.isFinite(field.waterHeight[i])).toBe(true);
      expect(field.waterHeight[i] ?? -1).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(field.velocityX[i])).toBe(true);
      expect(Number.isFinite(field.velocityY[i])).toBe(true);
    }
    for (let i = 0; i < field.mobilePigment.length; i += 1) {
      expect(Number.isFinite(field.mobilePigment[i])).toBe(true);
      expect(field.mobilePigment[i] ?? -1).toBeGreaterThanOrEqual(0);
      expect(Number.isFinite(field.depositedPigment[i])).toBe(true);
      expect(field.depositedPigment[i] ?? -1).toBeGreaterThanOrEqual(0);
    }
  });

  it("24. WebGPU 3종 WGSL 컴퓨트 셰이더가 구문·엔트리포인트·바인딩·16바이트 정렬 계약을 모두 통과한다", () => {
    const report = validateFluidWgslContracts();
    expect(report.valid).toBe(true);
    expect(report.uniformByteLengthsAligned16).toBe(true);
    expect(report.errors).toEqual([]);
    expect(report.shaders).toHaveLength(3);
    expect(report.shaders[0]?.entryPoints).toEqual(["update_velocity_pressure", "advect_water_flux"]);
    expect(report.shaders[0]?.bindings).toHaveLength(7);
    expect(report.shaders[1]?.entryPoints).toEqual(["advect_and_dry_pigment"]);
    expect(report.shaders[1]?.bindings).toHaveLength(9);
    expect(report.shaders[2]?.entryPoints).toEqual(["composite_wet_media"]);
    expect(report.shaders[2]?.bindings).toHaveLength(7);
  });

  it("25. WGSL 계약 검증기가 괄호 불균형·중복 바인딩·엔트리포인트 누락·금지 토큰을 정확히 적발한다", () => {
    const report = validateFluidWgslContracts({
      velocityWgsl: SHALLOW_WATER_VELOCITY_WGSL
        .replace("@group(0) @binding(1)", "@group(0) @binding(0)")
        .replace("fn advect_water_flux", "fn broken_flux"),
      advectionWgsl: `${PIGMENT_ADVECTION_DRYING_WGSL}\n{`,
      compositeWgsl: `${WET_MEDIA_COMPOSITE_WGSL}\n// NaN`,
    });
    expect(report.valid).toBe(false);
    expect(report.errors.some((e) => e.includes("중복 바인딩"))).toBe(true);
    expect(report.errors.some((e) => e.includes("엔트리포인트 누락"))).toBe(true);
    expect(report.errors.some((e) => e.includes("괄호/중괄호 균형"))).toBe(true);
    expect(report.errors.some((e) => e.includes("금지 식별자"))).toBe(true);
  });

  it("26. FluidSimUniforms(80B) 및 WetCompositeUniforms(192B) 패커가 16바이트 정렬과 정확한 오프셋을 유지한다", () => {
    expect(FLUID_SIM_UNIFORM_BYTE_LENGTH).toBe(80);
    expect(WET_COMPOSITE_UNIFORM_BYTE_LENGTH).toBe(192);
    expect(FLUID_SIM_UNIFORM_BYTE_LENGTH % 16).toBe(0);
    expect(WET_COMPOSITE_UNIFORM_BYTE_LENGTH % 16).toBe(0);

    const simBuf = packFluidSimUniforms({
      width: 128, height: 96, stepIndex: 17, dtSec: 0.016,
      config: { mediumPreset: "watercolor", gravityX: -1.25, gravityY: 4.5, viscosity: 0.12 },
    });
    expect(simBuf.byteLength).toBe(80);
    const sv = new DataView(simBuf);
    expect(sv.getUint32(0, true)).toBe(128);
    expect(sv.getUint32(4, true)).toBe(96);
    expect(sv.getUint32(8, true)).toBe(17);
    expect(sv.getFloat32(16, true)).toBeCloseTo(0.016, 5);
    expect(sv.getFloat32(24, true)).toBeCloseTo(-1.25, 5);
    expect(sv.getFloat32(28, true)).toBeCloseTo(4.5, 5);
    expect(sv.getFloat32(32, true)).toBeCloseTo(0.12, 5);

    const compBuf = packWetCompositeUniforms({
      width: 128, height: 96, palette: DEFAULT_PIGMENT_OPTICS,
      paperReflectance: DEFAULT_PAPER_REFLECTANCE, wetSpecularStrength: 0.88,
    });
    expect(compBuf.byteLength).toBe(192);
    const cv = new DataView(compBuf);
    expect(cv.getUint32(0, true)).toBe(128);
    expect(cv.getUint32(4, true)).toBe(96);
    expect(cv.getFloat32(28, true)).toBeCloseTo(0.88, 5);
    expect(cv.getFloat32(32, true)).toBeCloseTo(DEFAULT_PAPER_REFLECTANCE[0], 5);
    expect(cv.getFloat32(64, true)).toBeCloseTo(DEFAULT_PIGMENT_OPTICS[0].absorptionK[0], 5);
    expect(cv.getFloat32(128, true)).toBeCloseTo(DEFAULT_PIGMENT_OPTICS[0].scatteringS[0], 5);
    expect(cv.getFloat32(176, true)).toBeCloseTo(DEFAULT_PIGMENT_OPTICS[3].scatteringS[0], 5);
  });

  it("27. 핑퐁 디스패치 계획기가 짝수/홀수 스텝마다 읽기·쓰기 버퍼 별칭 없이 A/B 슬롯을 교대한다", () => {
    const evenPlan = buildFluidPingPongDispatchPlan(100, 65, 0);
    const oddPlan = buildFluidPingPongDispatchPlan(100, 65, 1);
    expect(evenPlan.dispatchX).toBe(13);
    expect(evenPlan.dispatchY).toBe(9);
    expect(evenPlan.dispatchZ).toBe(1);
    expect(evenPlan.pingIndex).toBe(0);
    expect(evenPlan.pongIndex).toBe(1);
    expect(oddPlan.pingIndex).toBe(1);
    expect(oddPlan.pongIndex).toBe(0);
    expect(evenPlan.passes).toHaveLength(4);
    for (const plan of [evenPlan, oddPlan]) {
      for (const pass of plan.passes) {
        const readSet = new Set(pass.readSlots);
        for (const writeSlot of pass.writeSlots) {
          expect(readSet.has(writeSlot)).toBe(false);
        }
      }
    }
  });
});
