import { describe, expect, it } from "vitest";

import {
  computeTiltCompassGravity,
  createWetFluidGrid,
  createWetFluidScratchBuffers,
  DEFAULT_WET_FLUID_PHYSICS_PARAMS,
  depositWetPigmentDab,
  dryLayerNow,
  evaluateBlowJetForceAtCell,
  packWetGravityBlowUniforms,
  rewetRegion,
  sampleTiltSensorGravity,
  stepWetGravityBlowField,
  type BlowJetImpulse,
  type WetGravityBlowControllerState,
} from "./studio-wet-gravity-blow-controller";

function sumField(arr: Float32Array): number {
  let total = 0;
  for (let i = 0; i < arr.length; i += 1) total += arr[i]!;
  return total;
}

function pigmentCentroid(grid: ReturnType<typeof createWetFluidGrid>): { x: number; y: number } {
  let wx = 0;
  let wy = 0;
  let mass = 0;
  for (let y = 0; y < grid.height; y += 1) {
    for (let x = 0; x < grid.width; x += 1) {
      const idx = y * grid.width + x;
      const m = grid.suspendedPigment[idx]! + grid.fixedPigment[idx]!;
      wx += x * m;
      wy += y * m;
      mass += m;
    }
  }
  return mass > 0 ? { x: wx / mass, y: wy / mass } : { x: 0, y: 0 };
}

describe("studio-wet-gravity-blow-controller", () => {
  it("중력 기울기 나침반과 G-센서 데드존·화면 회전을 정확히 투영한다", () => {
    const down = computeTiltCompassGravity({ azimuthRad: Math.PI / 2, tiltDeg: 30, strength: 2 });
    expect(down.x).toBeCloseTo(0, 5);
    expect(down.y).toBeCloseTo(1.0, 5);

    // 데드존 이내 미세 흔들림은 0으로 억제
    const dead = sampleTiltSensorGravity(
      { betaDeg: 26, gammaDeg: 1, screenOrientationDeg: 0 },
      { neutralBetaDeg: 25, neutralGammaDeg: 0, deadzoneDeg: 3.5 },
    );
    expect(dead.gravity.x).toBe(0);
    expect(dead.gravity.y).toBe(0);

    // 90도 가로 회전 시 beta/gamma 축 매핑 및 스무딩 검증
    const rotated = sampleTiltSensorGravity(
      { betaDeg: 55, gammaDeg: 0, screenOrientationDeg: 90 },
      { neutralBetaDeg: 25, neutralGammaDeg: 0, deadzoneDeg: 2, smoothingAlpha: 0.5, gain: 1 },
      { x: 0, y: 0 },
    );
    expect(rotated.gravity.x).toBeGreaterThan(0.15);
    expect(Math.abs(rotated.gravity.y)).toBeLessThan(1e-5);
  });

  it("기울기 중력을 가하면 젖은 안료 무게중심이 중력 방향으로 이동하며 총 안료 질량을 보존한다", () => {
    const grid = createWetFluidGrid(24, 24, 42);
    const scratch = createWetFluidScratchBuffers(24, 24);
    depositWetPigmentDab(grid, 12, 8, 3.5, 1.0, 1.0);

    const initialMass = sumField(grid.suspendedPigment) + sumField(grid.fixedPigment);
    const before = pigmentCentroid(grid);

    const controller: WetGravityBlowControllerState = {
      gravity: computeTiltCompassGravity({ azimuthRad: Math.PI / 2, tiltDeg: 45, strength: 1.8 }),
      tiltCompass: { azimuthRad: Math.PI / 2, tiltDeg: 45, strength: 1.8 },
      blowJets: [],
      params: { ...DEFAULT_WET_FLUID_PHYSICS_PARAMS, evaporationRate: 0.0005, settlingRate: 0.05 },
    };

    for (let i = 0; i < 12; i += 1) {
      stepWetGravityBlowField(grid, controller, 1 / 30, scratch);
    }

    const after = pigmentCentroid(grid);
    const finalMass = sumField(grid.suspendedPigment) + sumField(grid.fixedPigment);

    expect(after.y).toBeGreaterThan(before.y + 1.5);
    expect(finalMass).toBeCloseTo(initialMass, 3);
  });

  it("국소 가우시안 바람 제트가 전방으로 강하게 작용하며 결정적 난류를 재현한다", () => {
    const jet: BlowJetImpulse = {
      id: "blow-1",
      x: 10,
      y: 10,
      dirX: 1,
      dirY: 0,
      radius: 5,
      pressure: 4.0,
      coneSpread: 0.45,
      turbulence: 0.25,
      seed: 777,
    };

    const front = evaluateBlowJetForceAtCell(jet, 13, 10, 3);
    const back = evaluateBlowJetForceAtCell(jet, 7, 10, 3);
    const repeatFront = evaluateBlowJetForceAtCell(jet, 13, 10, 3);

    expect(front.x).toBeGreaterThan(back.x);
    expect(front.x).toBe(repeatFront.x);
    expect(front.y).toBe(repeatFront.y);

    const grid = createWetFluidGrid(24, 24, 7);
    depositWetPigmentDab(grid, 11, 10, 3, 1.0, 1.0);
    const beforeX = pigmentCentroid(grid).x;

    const ctrl: WetGravityBlowControllerState = {
      gravity: { x: 0, y: 0 },
      tiltCompass: { azimuthRad: 0, tiltDeg: 0, strength: 0 },
      blowJets: [jet],
      params: DEFAULT_WET_FLUID_PHYSICS_PARAMS,
    };

    for (let i = 0; i < 10; i += 1) {
      stepWetGravityBlowField(grid, ctrl, 1 / 30);
    }
    expect(pigmentCentroid(grid).x).toBeGreaterThan(beforeX + 1.0);
  });

  it("즉시 건조(dryLayerNow) 후 이동이 정지하고 국소 재습윤(rewetRegion) 시 고착 안료가 다시 부유한다", () => {
    const grid = createWetFluidGrid(20, 20, 19);
    depositWetPigmentDab(grid, 10, 10, 3, 1.0, 1.0);
    const initialMass = sumField(grid.suspendedPigment);

    const driedCount = dryLayerNow(grid);
    expect(driedCount).toBeGreaterThan(0);
    expect(sumField(grid.wetness)).toBe(0);
    expect(sumField(grid.suspendedPigment)).toBe(0);
    expect(sumField(grid.fixedPigment)).toBeCloseTo(initialMass, 4);

    // 건조 상태에서는 강한 중력을 줘도 안료가 움직이지 않아야 함
    const beforeDryPos = pigmentCentroid(grid);
    const metrics = stepWetGravityBlowField(
      grid,
      {
        gravity: { x: 2.5, y: 0 },
        tiltCompass: { azimuthRad: 0, tiltDeg: 60, strength: 2.5 },
        blowJets: [],
        params: DEFAULT_WET_FLUID_PHYSICS_PARAMS,
      },
      1 / 30,
    );
    expect(metrics.activeWetCells).toBe(0);
    expect(pigmentCentroid(grid).x).toBeCloseTo(beforeDryPos.x, 5);

    // 물붓 국소 재습윤으로 fixed -> suspended 재활성화
    const rewet = rewetRegion(grid, {
      x: 10,
      y: 10,
      radius: 3.5,
      waterAmount: 0.9,
      liftRatio: 0.8,
      stainingResistance: 0.1,
    });
    expect(rewet.rewettedCells).toBeGreaterThan(0);
    expect(rewet.liftedPigmentTotal).toBeGreaterThan(0);
    expect(sumField(grid.suspendedPigment)).toBeCloseTo(rewet.liftedPigmentTotal, 4);
    expect(sumField(grid.suspendedPigment) + sumField(grid.fixedPigment)).toBeCloseTo(initialMass, 3);
  });

  it("WGSL 컴퓨트 셰이더 유니폼 버퍼를 16바이트 정렬 규격으로 정확히 패킹한다", () => {
    const uniforms = packWetGravityBlowUniforms(
      {
        gravity: { x: 0.5, y: 0.85 },
        tiltCompass: { azimuthRad: 1, tiltDeg: 45, strength: 1 },
        blowJets: [
          {
            id: "j1",
            x: 4,
            y: 6,
            dirX: 3,
            dirY: 4,
            radius: 8,
            pressure: 2.5,
            coneSpread: 0.5,
            turbulence: 0.2,
            seed: 9,
          },
        ],
        params: DEFAULT_WET_FLUID_PHYSICS_PARAMS,
      },
      64,
      64,
      1 / 60,
      5,
    );

    expect(uniforms.length % 4).toBe(0);
    expect(uniforms[0]).toBeCloseTo(0.5, 5);
    expect(uniforms[3]).toBe(1);
    // 방향 벡터 정규화 (3, 4) -> (0.6, 0.8)
    expect(uniforms[14]).toBeCloseTo(0.6, 5);
    expect(uniforms[15]).toBeCloseTo(0.8, 5);
  });
});
