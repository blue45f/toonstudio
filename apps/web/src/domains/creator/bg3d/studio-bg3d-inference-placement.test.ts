import { describe, expect, it } from "vitest";

import { applyStudioBg3dInferenceToPlacementTarget } from "./studio-bg3d-inference-placement";
import { createStudioBg3dInferenceService } from "./studio-bg3d-inference-service";

import type { StudioBg3dInferenceCursor } from "./studio-bg3d-inference-types";

const WPP = 1 / 64;

function setup() {
  const service = createStudioBg3dInferenceService({ now: () => 0, scheduler: () => () => undefined });
  service.syncScene({
    entities: [{ id: "A", kind: "box", label: "상자 A", position: [0, 0.5, 0], rotation: [0, 0, 0], scale: [1, 1, 1] }],
  });
  service.begin("generic", { keyboard: false, hud: false });
  return service;
}

function cursor(point: readonly [number, number, number]): StudioBg3dInferenceCursor {
  return { kind: "point", point, worldPerPixel: WPP };
}

describe("배치 목표점 추론 치환", () => {
  it("표면을 가리킨 점이 윗면 모서리 근처면 모서리 끝점으로 붙이고 법선은 유지한다", () => {
    const service = setup();
    service.resolve({ cursor: cursor([0.52, 1, 0.5]) });
    const target = { surfaceHit: { point: [0.52, 1, 0.5] as const, normal: [0, 1, 0] as const } };
    const snapped = applyStudioBg3dInferenceToPlacementTarget(service, target);
    expect(snapped.surfaceHit.point).toEqual([0.5, 1, 0.5]);
    expect(snapped.surfaceHit.normal).toEqual([0, 1, 0]);
    // 입력 객체는 바꾸지 않는다.
    expect(target.surfaceHit.point).toEqual([0.52, 1, 0.5]);
  });

  it("바닥을 가리킨 점이 바닥 위 모서리 근처면 X/Z만 붙인다", () => {
    const service = setup();
    service.resolve({ cursor: cursor([0.52, 0, 0.5]) });
    const snapped = applyStudioBg3dInferenceToPlacementTarget(service, { floorPoint: [0.52, 0.5] as const });
    expect(snapped.floorPoint).toEqual([0.5, 0.5]);
  });

  it("바닥을 가리키는데 추론 점이 공중이면 무시한다 (모델이 떠 버리지 않게)", () => {
    const service = setup();
    // 윗면 모서리(y=1) 근처를 가리키는 레이였지만 목표가 바닥 점인 경우를 흉내 낸다.
    service.resolve({ cursor: cursor([0.52, 1, 0.5]) });
    const target = { floorPoint: [0.52, 0.5] as const };
    const result = applyStudioBg3dInferenceToPlacementTarget(service, target);
    expect(result).toBe(target);
  });

  it("세션이 없거나 추론이 없으면 목표를 그대로 돌려준다", () => {
    const idle = createStudioBg3dInferenceService();
    const target = { surfaceHit: { point: [1, 1, 1] as const, normal: [0, 1, 0] as const } };
    expect(applyStudioBg3dInferenceToPlacementTarget(idle, target)).toBe(target);
    const service = setup();
    service.resolve({ cursor: cursor([9, 0, 9]) });
    expect(applyStudioBg3dInferenceToPlacementTarget(service, { floorPoint: [9, 9] as const })).toEqual({ floorPoint: [9, 9] });
  });

  it("표면도 바닥도 없는 목표는 건드리지 않는다", () => {
    const service = setup();
    const target = {};
    expect(applyStudioBg3dInferenceToPlacementTarget(service, target)).toBe(target);
  });
});
