import * as THREE from "three";
import { describe, expect, it } from "vitest";

import { buildStudioVrmGarmentGeometry } from "./studio-vrm-skinned-garment";
import { shapeStudioVrmBlazerSleeveCap } from "./studio-vrm-blazer-geometry";
import { buildGarmentParts, FALLBACK_WARDROBE_METRICS } from "./studio-vrm-wardrobe";

describe("실측 단면으로 재단한 블레이저", () => {
  it("어깨 안쪽에서 좁게 시작한 소매가 상완에서 본래 굵기와 팔 웨이트를 되찾는다", () => {
    const joint = new THREE.Vector3(-0.10, 1.4, 0);
    const centers = Array.from({ length: 9 }, () => new THREE.Vector3());
    const radii = centers.map(() => 0.05);
    const weights = shapeStudioVrmBlazerSleeveCap(centers, radii, joint,
      new THREE.Vector3(0.10, 1.4, 0), new THREE.Vector3(-0.16, 1.2, 0));
    expect(centers[0]!.x).toBeGreaterThan(joint.x + 0.04);
    expect(radii[0]).toBeLessThan(0.025);
    expect(weights[0]).toBeGreaterThan(0.8);
    expect(weights[3]).toBe(0);
    expect(radii[3]).toBe(0.05);
  });

  it("가슴 앞이 실제로 열려 있고 허리와 등은 몸판으로 덮인다", () => {
    const parts = buildGarmentParts("blazer", FALLBACK_WARDROBE_METRICS);
    const shape = parts[0]!.shape;
    if (shape.kind !== "lathe") throw new Error("몸판 누락");
    const geometry = buildStudioVrmGarmentGeometry(shape);
    const material = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geometry, material);
    const hit = (fraction: number, angle: number) => {
      const y = THREE.MathUtils.lerp(shape.profile[0]!.y, shape.profile.at(-1)!.y, fraction);
      const direction = new THREE.Vector3(Math.sin(angle), 0, Math.cos(angle));
      const ray = new THREE.Raycaster(new THREE.Vector3(direction.x, y, direction.z), direction.negate(), 0, 1);
      return ray.intersectObject(mesh).length > 0;
    };
    expect(hit(0.9, 0.16)).toBe(false);
    expect(hit(0.4, 0.16)).toBe(true);
    expect(hit(0.9, Math.PI)).toBe(true);
    material.dispose();
    geometry.dispose();
  });

  it("깃·포켓·단추는 몸판과 같은 좌표계에 있고 단추만 독립적인 금속색을 쓴다", () => {
    const parts = buildGarmentParts("blazer", FALLBACK_WARDROBE_METRICS);
    const [body, facing, buttons] = parts;
    for (const part of [facing!, buttons!]) {
      expect(part.align).toEqual(body!.align);
      expect(part.offset).toEqual(body!.offset);
      expect(part.forward).toEqual(body!.forward);
      expect(part.squash).toEqual(body!.squash);
      const geometry = buildStudioVrmGarmentGeometry(part.shape);
      geometry.computeBoundingBox();
      expect(geometry.boundingBox!.min.z).toBeGreaterThan(0);
      expect(geometry.getIndex()!.count).toBeLessThan(2_000);
      if (part.shape.kind !== "lathe") throw new Error("재단 단면 누락");
      const shifted = buildStudioVrmGarmentGeometry({ ...part.shape, profile: part.shape.profile.map((ring) =>
        ({ ...ring, centerX: 0.012, centerZ: -0.038 })) });
      const a = geometry.getAttribute("position"), b = shifted.getAttribute("position");
      expect(b.getX(0) - a.getX(0)).toBeCloseTo(0.012, 5);
      expect(b.getZ(0) - a.getZ(0)).toBeCloseTo(-0.038, 5);
      shifted.dispose();
      geometry.dispose();
    }
    expect(facing!.color).toBeUndefined();
    expect(buttons!.metalness).toBeGreaterThan(0.35);
    expect(buttons!.color).toBeTruthy();
  });
});
