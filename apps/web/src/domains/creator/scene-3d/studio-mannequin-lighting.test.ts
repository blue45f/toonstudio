import { describe, expect, it } from "vitest";

import {
  addStudioMannequinLight,
  applyStudioMannequinTimeOfDay,
  createStudioMannequinLightingRig,
  removeStudioMannequinLight,
  resolveStudioMannequinLightingPlan,
  setStudioMannequinShadows,
  STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN,
  studioMannequinLightingToToneHint,
  updateStudioMannequinLight,
  StudioMannequinLightingError,
  STUDIO_MANNEQUIN_MAX_LIGHTS,
  STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS,
} from "./studio-mannequin-lighting";

function addMany(base: ReturnType<typeof createStudioMannequinLightingRig>, count: number) {
  let rig = base;
  for (let i = 0; i < count; i += 1) {
    rig = addStudioMannequinLight(rig, {
      kind: "point",
      intensity: 1,
      color: "#ffffff",
      position: [i, 1, 0],
    });
  }
  return rig;
}

describe("studio mannequin lighting", () => {
  it("조명은 최대 4개까지 추가할 수 있습니다", () => {
    const rig = addMany(createStudioMannequinLightingRig(), STUDIO_MANNEQUIN_MAX_LIGHTS);
    expect(rig.lights).toHaveLength(STUDIO_MANNEQUIN_MAX_LIGHTS);
    expect(() =>
      addStudioMannequinLight(rig, { kind: "point", intensity: 1, color: "#fff", position: [0, 0, 0] }),
    ).toThrowError(StudioMannequinLightingError);
  });

  it("조명 추가/삭제/업데이트가 동작합니다", () => {
    let rig = addStudioMannequinLight(createStudioMannequinLightingRig(), {
      kind: "directional",
      intensity: 2,
      color: "#FF0000",
      position: [1, 2, 3],
    });
    const id = rig.lights[0]?.id ?? "";
    expect(rig.lights[0]?.color).toBe("#ff0000");
    rig = updateStudioMannequinLight(rig, id, { intensity: 5 });
    expect(rig.lights[0]?.intensity).toBe(5);
    rig = removeStudioMannequinLight(rig, id);
    expect(rig.lights).toHaveLength(0);
  });

  it("밝기와 색상 정규화가 적용됩니다", () => {
    const rig = addStudioMannequinLight(createStudioMannequinLightingRig(), {
      kind: "spot",
      intensity: 99,
      color: "not-a-color",
      position: [0, 0, 0],
    });
    expect(rig.lights[0]?.intensity).toBe(10);
    expect(rig.lights[0]?.color).toBe("#ffffff");
  });

  it("그림자 on/off가 동작합니다", () => {
    const rig = setStudioMannequinShadows(createStudioMannequinLightingRig(), false);
    expect(rig.shadowsEnabled).toBe(false);
  });

  it("시간대 프리셋 4종이 모두 정의되어 있습니다", () => {
    expect(Object.keys(STUDIO_MANNEQUIN_TIME_OF_DAY_LABELS)).toEqual(["dawn", "noon", "dusk", "night"]);
    for (const preset of ["dawn", "noon", "dusk", "night"] as const) {
      const rig = applyStudioMannequinTimeOfDay(preset);
      expect(rig.lights.length).toBeGreaterThan(0);
      expect(rig.lights.length).toBeLessThanOrEqual(STUDIO_MANNEQUIN_MAX_LIGHTS);
      // 프리셋 식별자가 릭에 그대로 실려야 스튜디오 활성 표시와 씬 동기화가 어긋나지 않는다.
      expect(rig.timeOfDay).toBe(preset);
    }
  });

  it("빈 rig와 null은 기존 고정 3점 리그 계획으로 폴백합니다", () => {
    expect(resolveStudioMannequinLightingPlan(null)).toBe(STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN);
    expect(resolveStudioMannequinLightingPlan(createStudioMannequinLightingRig())).toBe(
      STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN,
    );
    const plan = STUDIO_MANNEQUIN_DEFAULT_LIGHTING_PLAN;
    expect(plan.isDefault).toBe(true);
    expect(plan.hemisphere?.intensity).toBe(0.95);
    expect(plan.lights.map((light) => light.intensity)).toEqual([1.45, 0.42, 0.28]);
    expect(plan.lights[0]?.castShadow).toBe(true);
  });

  it("시간대 프리셋 계획은 rig의 종류·밝기·색·위치를 그대로 반영합니다", () => {
    const plan = resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("dusk"));
    expect(plan.isDefault).toBe(false);
    expect(plan.lights).toHaveLength(2);
    expect(plan.lights[0]).toMatchObject({
      kind: "directional",
      intensity: 2.8,
      color: "#ff7a4d",
      position: [-4, 1, 2],
      castShadow: true,
    });
    expect(plan.lights[1]).toMatchObject({
      kind: "spot",
      intensity: 1.2,
      color: "#ffd9a0",
      angle: 0.5,
      distance: 10,
      castShadow: false,
    });
  });

  it("그림자 off면 어떤 조명도 그림자를 만들지 않고, point는 켜져 있어도 만들지 않습니다", () => {
    const night = resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("night"));
    expect(night.shadowsEnabled).toBe(false);
    expect(night.lights.every((light) => !light.castShadow)).toBe(true);
    const dawn = resolveStudioMannequinLightingPlan(applyStudioMannequinTimeOfDay("dawn"));
    expect(dawn.lights[0]?.castShadow).toBe(true);
    expect(dawn.lights[1]?.kind).toBe("point");
    expect(dawn.lights[1]?.castShadow).toBe(false);
  });

  it("시간대 프리셋 4종 모두 기본 계획이 아닌 전용 계획으로 변환됩니다", () => {
    for (const preset of ["dawn", "noon", "dusk", "night"] as const) {
      const rig = applyStudioMannequinTimeOfDay(preset);
      const plan = resolveStudioMannequinLightingPlan(rig);
      expect(plan.isDefault, preset).toBe(false);
      expect(plan.shadowsEnabled, preset).toBe(rig.shadowsEnabled);
      expect(plan.lights, preset).toHaveLength(rig.lights.length);
      plan.lights.forEach((planLight, index) => {
        const rigLight = rig.lights[index];
        expect(planLight.kind).toBe(rigLight?.kind);
        expect(planLight.intensity).toBe(rigLight?.intensity);
        expect(planLight.color).toBe(rigLight?.color);
        expect(planLight.position).toEqual(rigLight?.position);
      });
    }
  });

  it("LT 연동 명암 힌트가 주광 방향과 대비를 돌립니다", () => {
    const rig = applyStudioMannequinTimeOfDay("noon");
    const hint = studioMannequinLightingToToneHint(rig);
    expect(hint.contrast).toBeGreaterThan(0);
    const length = Math.hypot(...hint.keyLightDirection);
    expect(length).toBeCloseTo(1, 10);
    expect(hint.shadows).toBe(true);
  });
});
