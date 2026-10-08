import { describe, expect, it } from "vitest";

import { cameraPosition, resolveFraming } from "../camera-framing";

import { KIT_PREVIEW_VIEW_IDS } from "./cli-args";
import { VIEW_SPECS, framingForView, resolveAnchorCamera } from "./views";

import type { WorldBounds } from "../camera-framing";

const BOUNDS: WorldBounds = { min: [-0.8, 0, -0.15], max: [0.8, 1.7, 0.15] };

describe("뷰 표", () => {
  it("뷰 어휘 전부에 정의가 있고 framing 또는 anchor 중 하나만 가진다", () => {
    for (const id of KIT_PREVIEW_VIEW_IDS) {
      const spec = VIEW_SPECS[id];
      expect(spec.id).toBe(id);
      expect(spec.labelKo.length).toBeGreaterThan(0);
      expect(Boolean(spec.framing) !== Boolean(spec.anchor), id).toBe(true);
    }
  });

  it("전신 뷰의 카메라 방향: front +Z, side +X(캐릭터 왼쪽), back −Z, q3는 +Z와 +X 사이", () => {
    const at = (id: "front" | "side" | "back" | "q3") => {
      const framing = framingForView(id);
      if (!framing) throw new Error("프레이밍이 없습니다.");
      const resolved = resolveFraming(framing, BOUNDS);
      const position = cameraPosition(resolved);
      return { x: position[0] - resolved.target[0], y: position[1] - resolved.target[1], z: position[2] - resolved.target[2] };
    };
    expect(at("front").z).toBeGreaterThan(1);
    expect(Math.abs(at("front").x)).toBeLessThan(1e-9);
    expect(at("side").x).toBeGreaterThan(1);
    expect(Math.abs(at("side").z)).toBeLessThan(1e-6);
    expect(at("back").z).toBeLessThan(-1);
    const q3 = at("q3");
    expect(q3.x).toBeGreaterThan(0.3);
    expect(q3.z).toBeGreaterThan(0.3);
    expect(q3.y).toBeGreaterThan(0);
  });

  it("얼굴·상반신 뷰는 전신보다 가까이, 더 높은 곳을 본다", () => {
    const full = resolveFraming(framingForView("front") ?? { mode: "full-body", yawDeg: 0, pitchDeg: 0, distanceScale: 1 }, BOUNDS);
    const face = resolveFraming(framingForView("face") ?? { mode: "face", yawDeg: 0, pitchDeg: 0, distanceScale: 1 }, BOUNDS);
    const bust = resolveFraming(framingForView("bust") ?? { mode: "bust", yawDeg: 0, pitchDeg: 0, distanceScale: 1 }, BOUNDS);
    expect(face.radius).toBeLessThan(bust.radius);
    expect(bust.radius).toBeLessThan(full.radius);
    expect(face.target[1]).toBeGreaterThan(bust.target[1]);
  });

  it("포즈 배율은 프레이밍 거리에 곱해지고 앵커 뷰에는 프레이밍이 없다", () => {
    expect(framingForView("front", 1.25)?.distanceScale).toBeCloseTo(1.25, 9);
    expect(framingForView("hands")).toBeNull();
    expect(framingForView("feet")).toBeNull();
  });
});

describe("resolveAnchorCamera", () => {
  const hands = VIEW_SPECS.hands.anchor;
  const feet = VIEW_SPECS.feet.anchor;

  it("본 위치 평균을 중심으로 spanM에 맞는 거리를 계산한다", () => {
    if (!hands) throw new Error("hands 앵커가 없습니다.");
    const camera = resolveAnchorCamera(hands, [[0.7, 1.4, 0]], BOUNDS);
    expect(camera).not.toBeNull();
    if (!camera) return;
    expect(camera.target[0]).toBeCloseTo(0.7 + hands.offset[0], 9);
    expect(camera.target[1]).toBeCloseTo(1.4, 9);
    expect(camera.radius).toBeCloseTo(hands.spanM / 2 / Math.tan(0.8 / 2), 9);
    // 위에서(pitch 38°) 내려다보므로 beta < π/2, 정면 쪽으로 약간 왼쪽(−yaw)이라 alpha < π/2
    expect(camera.beta).toBeLessThan(Math.PI / 2);
    expect(camera.alpha).toBeLessThan(Math.PI / 2);
    const palm = VIEW_SPECS["hands-palm"].anchor;
    const below = palm ? resolveAnchorCamera(palm, [[0.7, 1.4, 0]], BOUNDS) : null;
    expect(below?.beta).toBeGreaterThan(Math.PI / 2);
  });

  it("두 발은 두 본의 평균, 포즈 배율이 반경에 곱해진다", () => {
    if (!feet) throw new Error("feet 앵커가 없습니다.");
    const one = resolveAnchorCamera(feet, [[-0.1, 0.08, 0], [0.1, 0.08, 0]], BOUNDS, 1);
    const scaled = resolveAnchorCamera(feet, [[-0.1, 0.08, 0], [0.1, 0.08, 0]], BOUNDS, 2);
    expect(one?.target[0]).toBeCloseTo(0, 9);
    expect(scaled && one ? scaled.radius / one.radius : 0).toBeCloseTo(2, 9);
  });

  it("본이 없으면 발은 바운딩 박스 바닥으로 폴백하고 손은 건너뛴다(null)", () => {
    if (!hands || !feet) throw new Error("앵커가 없습니다.");
    const fallback = resolveAnchorCamera(feet, [], BOUNDS);
    expect(fallback?.target[1]).toBeCloseTo(0.07 + feet.offset[1], 9);
    expect(fallback?.target[0]).toBeCloseTo(0, 9);
    expect(resolveAnchorCamera(feet, [], null)).toBeNull();
    expect(resolveAnchorCamera(hands, [], BOUNDS)).toBeNull();
  });
});
