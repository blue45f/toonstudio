import { describe, expect, it } from "vitest";
import { STUDIO_OIL_IDENTITY_TRANSFORM, studioOilDeviceBounds, studioOilWetSettings } from "./studio-oil-readback-plan";

describe("유화 공통 readback 계획", () => {
  const points = [{ x: 20, y: 30 }, { x: 80, y: 60 }];
  it("정본의 정수 bbox와 문서 경계를 보존한다", () => {
    expect(studioOilDeviceBounds(points, 12, STUDIO_OIL_IDENTITY_TRANSFORM, 100, 100))
      .toEqual({ x: 8, y: 18, width: 84, height: 54 });
    expect(studioOilDeviceBounds(points, 40, STUDIO_OIL_IDENTITY_TRANSFORM, 100, 80))
      .toEqual({ x: 0, y: 0, width: 100, height: 80 });
  });
  it("확대·반전에서 같은 네 모서리를 변환한다", () => {
    expect(studioOilDeviceBounds(points, 12, { a: -2, b: 0, c: 0, d: 2, e: 200, f: -20 }, 200, 200))
      .toEqual({ x: 16, y: 16, width: 168, height: 108 });
  });
  it("빈 획과 화면 밖 획은 읽지 않는다", () => {
    expect(studioOilDeviceBounds([], 12, STUDIO_OIL_IDENTITY_TRANSFORM, 100, 100)).toBeNull();
    expect(studioOilDeviceBounds(points, 12, { ...STUDIO_OIL_IDENTITY_TRANSFORM, e: 200 }, 100, 100)).toBeNull();
  });
  it("정본 혼색 설정과 감산 모델을 그대로 사용한다", () => {
    expect(studioOilWetSettings({ stroke: "#123ebe", radiusPx: 9 }))
      .toEqual({ radiusPx: 9, hardness: 0.55, strength: 0.88, wetness: 0.65, pickup: 0.55,
        paintColor: { r: 18, g: 62, b: 190 }, loadDepletion: 0, mixModel: "spectral-wgm" });
  });
});
