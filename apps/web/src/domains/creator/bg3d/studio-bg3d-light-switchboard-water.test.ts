import { describe, expect, it } from "vitest";
import {
  BG3D_MAX_LOCAL_LIGHTS,
  addBg3dLocalLightFixture,
  buildWaterReflectionRenderTargetSpec,
  compileBg3dSwitchboardPass,
  computePlanarReflectionMatrix,
  createBg3dLightSwitchboard,
  createDefaultWaterReflectionConfig,
  createSkyDomePreset,
  deserializeBg3dAtmosphereSnapshot,
  evaluateWaterSurfaceSample,
  kelvinToNormalizedRgb,
  orientSkyDomeWithHorizonLock,
  schlickFresnel,
  serializeBg3dAtmosphereSnapshot,
  toggleBg3dLightFixture,
  toggleBg3dLightGroup,
  transformPointByMatrix4,
  updateBg3dLightFixtureParams,
  type Bg3dLocalLightFixture,
} from "./studio-bg3d-light-switchboard-water";

function makeFixture(
  id: string,
  overrides: Partial<Bg3dLocalLightFixture> = {},
): Bg3dLocalLightFixture {
  return {
    id,
    label: `조명-${id}`,
    kind: "point",
    tag: "light:chandelier",
    groupId: "grp-chandelier",
    enabled: true,
    positionM: [0, 2.8, 0],
    direction: [0, -1, 0],
    kelvin: 3200,
    intensity: 2.0,
    attenuationRadiusM: 8,
    innerConeDeg: 20,
    outerConeDeg: 45,
    emissiveMeshId: `mesh-${id}`,
    emissiveBoost: 1.5,
    godRay: {
      enabled: true,
      coneLengthM: 4,
      coneRadiusM: 1.2,
      opacity01: 0.35,
      toonSteps: 3,
    },
    ...overrides,
  };
}

describe("studio-bg3d-light-switchboard-water", () => {
  it("색온도(2200K~9500K)를 정규화 RGB로 변환하며 난색·한색 경향을 유지한다", () => {
    const warm = kelvinToNormalizedRgb(2400);
    const cool = kelvinToNormalizedRgb(9000);
    expect(warm[0]).toBeGreaterThan(warm[2]);
    expect(cool[2]).toBeGreaterThan(cool[0]);
    for (const ch of [...warm, ...cool]) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });

  it("실내 로컬 조명 16개 예산을 초과하거나 중복 ID 등록 시 거부한다", () => {
    let state = createBg3dLightSwitchboard();
    for (let i = 0; i < BG3D_MAX_LOCAL_LIGHTS; i += 1) {
      const res = addBg3dLocalLightFixture(state, makeFixture(`light-${i}`));
      expect(res.ok).toBe(true);
      if (res.ok) state = res.state;
    }

    const dup = addBg3dLocalLightFixture(state, makeFixture("light-0"));
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.code).toBe("DUPLICATE_FIXTURE_ID");

    const overflow = addBg3dLocalLightFixture(state, makeFixture("light-overflow"));
    expect(overflow.ok).toBe(false);
    if (!overflow.ok) expect(overflow.code).toBe("LIGHT_BUDGET_EXCEEDED");
    expect(state.fixtures).toHaveLength(BG3D_MAX_LOCAL_LIGHTS);
  });

  it("태그 기반 그룹 원클릭 ON/OFF와 발광·갓레이 동기화를 정확히 반영한다", () => {
    const initial = createBg3dLightSwitchboard([
      makeFixture("ch-1", { tag: "light:chandelier", groupId: "grp-ch" }),
      makeFixture("win-1", {
        tag: "light:window",
        groupId: "grp-win",
        kind: "spot",
        kelvin: 6500,
      }),
    ]);

    const toggledOff = toggleBg3dLightGroup(initial, "light:chandelier");
    const compiled = compileBg3dSwitchboardPass(toggledOff);
    expect(compiled.activeLightCount).toBe(1);
    expect(compiled.godRayMeshes).toHaveLength(1);
    expect(compiled.godRayMeshes[0]?.fixtureId).toBe("win-1");

    const chEmissive = compiled.emissiveTargets.find((t) => t.fixtureId === "ch-1");
    expect(chEmissive?.active).toBe(false);
    expect(chEmissive?.emissiveIntensity).toBe(0);

    const toggledIndividual = toggleBg3dLightFixture(toggledOff, "win-1", false);
    expect(compileBg3dSwitchboardPass(toggledIndividual).activeLightCount).toBe(0);

    const updated = updateBg3dLightFixtureParams(initial, "ch-1", {
      kelvin: 2200,
      intensity: 4,
    });
    expect(updated.fixtures[0]?.kelvin).toBe(2200);
    expect(updated.fixtures[0]?.intensity).toBe(4);
  });

  it("평면 수면 거울 반사 행렬이 y=h 평면 대칭과 거듭제곱 항등성을 만족한다", () => {
    const h = 1.25;
    const mat = computePlanarReflectionMatrix([0, 1, 0], h);
    const point: readonly [number, number, number] = [3.5, 4.0, -2.0];
    const reflected = transformPointByMatrix4(mat, point);
    expect(reflected[0]).toBeCloseTo(3.5, 5);
    expect(reflected[1]).toBeCloseTo(2 * h - 4.0, 5);
    expect(reflected[2]).toBeCloseTo(-2.0, 5);

    const doubleReflected = transformPointByMatrix4(mat, reflected);
    expect(doubleReflected[0]).toBeCloseTo(point[0], 5);
    expect(doubleReflected[1]).toBeCloseTo(point[1], 5);
    expect(doubleReflected[2]).toBeCloseTo(point[2], 5);
  });

  it("0.5x DPR 수면 반사 타깃과 결정론적 물결 UV·프레넬 툰 양자화를 생성한다", () => {
    const water = createDefaultWaterReflectionConfig(0.5);
    const spec = buildWaterReflectionRenderTargetSpec(water, 1920, 1080);
    expect(spec.widthPx).toBe(960);
    expect(spec.heightPx).toBe(540);
    expect(spec.ltAlphaMaskPassId).toBe("water-reflection");

    expect(schlickFresnel(1, 0.04, 5)).toBeCloseTo(0.04, 5);
    expect(schlickFresnel(0, 0.04, 5)).toBeCloseTo(1.0, 5);

    const sampleA = evaluateWaterSurfaceSample(water, 0.4, 0.6, 2.5, 0.25);
    const sampleB = evaluateWaterSurfaceSample(water, 0.4, 0.6, 2.5, 0.25);
    expect(sampleA).toEqual(sampleB);
    expect(sampleA.quantizedReflection01 * water.toonQuantizationSteps).toBeCloseTo(
      Math.round(sampleA.quantizedReflection01 * water.toonQuantizationSteps),
      5,
    );
  });

  it("스카이돔 수평선 고정(Horizon Lock)과 전체 스냅샷 직렬화 왕복을 보장한다", () => {
    const sunset = createSkyDomePreset("sunset-glow");
    const locked = orientSkyDomeWithHorizonLock(sunset, -45, 42);
    expect(locked.yawDeg).toBeCloseTo(315, 5);
    expect(locked.pitchDeg).toBe(sunset.maxHorizonPitchDeg);

    const snapshot = {
      schemaVersion: 1 as const,
      switchboard: createBg3dLightSwitchboard([makeFixture("lamp-1", { tag: "light:lamp" })]),
      water: createDefaultWaterReflectionConfig(0.2),
      skyDome: locked,
    };
    const json = serializeBg3dAtmosphereSnapshot(snapshot);
    const restored = deserializeBg3dAtmosphereSnapshot(json);
    expect(restored.switchboard.fixtures).toHaveLength(1);
    expect(restored.water.planeHeightY).toBeCloseTo(0.2, 5);
    expect(restored.skyDome.presetId).toBe("sunset-glow");
    expect(restored.skyDome.yawDeg).toBeCloseTo(315, 5);
  });
});
