import * as THREE from "three";
import { describe, expect, it } from "vitest";

import {
  bendStudioVrmAuthoredHairAlongSpine,
  createStudioVrmAuthoredHairClumpGeometry,
  createStudioVrmAuthoredHairGeometry,
  mergeStudioVrmAuthoredHairGeometry,
  resolveStudioVrmAuthoredHairClumpCenter,
  studioVrmAuthoredCapHairlineHeight,
} from "./studio-vrm-authored-hair-geometry";

import type { AvatarForgeHairPart } from "./studio-vrm-avatar-forge";

const CLUMP: AvatarForgeHairPart = {
  id: "test-clump",
  role: "bang",
  primitive: "tapered-capsule",
  position: [0, 0, 0],
  rotation: [0, 0, 0],
  scale: [1, 1, 1],
  baseColor: "#25171b",
  shadowColor: "#0d080a",
  tipColor: "#e09bad",
  taper: 0.72,
  curl: 0.35,
  shine: 0.65,
  wave: 0.4,
  waveFrequency: 2.4,
};

function bounds(geometry: THREE.BufferGeometry): THREE.Vector3 {
  geometry.computeBoundingBox();
  const box = geometry.boundingBox;
  if (!box) throw new Error("missing bounds");
  return box.getSize(new THREE.Vector3());
}

describe("studio-vrm-authored-hair-geometry", () => {
  it("builds a closed faceted clump instead of a radial capsule", () => {
    const geometry = createStudioVrmAuthoredHairClumpGeometry(CLUMP);
    const position = geometry.getAttribute("position");
    const normal = geometry.getAttribute("normal");
    const color = geometry.getAttribute("color");
    const uv = geometry.getAttribute("uv");

    expect(position.count).toBe((24 + 1) * (8 + 1) * 2);
    expect(normal.count).toBe(position.count);
    expect(color.count).toBe(position.count);
    expect(uv.count).toBe(position.count);
    const size = bounds(geometry);
    expect(size.x).toBeGreaterThan(size.z * 3);
    expect(size.y).toBeGreaterThan(size.x * 0.8);
    geometry.dispose();
  });

  it("tapers to a narrow tip and carries shadow-to-highlight vertex colour variation", () => {
    const geometry = createStudioVrmAuthoredHairClumpGeometry(CLUMP);
    const position = geometry.getAttribute("position");
    const color = geometry.getAttribute("color");
    const columns = 9;
    const rows = 25;

    const rowWidth = (row: number) => {
      let minimum = Number.POSITIVE_INFINITY;
      let maximum = Number.NEGATIVE_INFINITY;
      for (let column = 0; column < columns; column += 1) {
        const index = row * columns + column;
        minimum = Math.min(minimum, position.getX(index));
        maximum = Math.max(maximum, position.getX(index));
      }
      return maximum - minimum;
    };
    expect(rowWidth(rows - 1)).toBeLessThan(rowWidth(0) * 0.08);

    const edge = new THREE.Color(color.getX(0), color.getY(0), color.getZ(0));
    const ridgeIndex = Math.floor(columns / 2);
    const ridge = new THREE.Color(
      color.getX(ridgeIndex),
      color.getY(ridgeIndex),
      color.getZ(ridgeIndex),
    );
    expect(ridge.getHSL({ h: 0, s: 0, l: 0 }).l).toBeGreaterThan(
      edge.getHSL({ h: 0, s: 0, l: 0 }).l,
    );
    geometry.dispose();
  });

  it("pins the root and bounds extreme thin-part waves during style changes", () => {
    const extreme: AvatarForgeHairPart = {
      ...CLUMP,
      scale: [0.015, 2.8, 0.01],
      curl: 4,
      wave: 8,
      waveFrequency: 99,
    };
    expect(resolveStudioVrmAuthoredHairClumpCenter(extreme, 0)).toEqual([0, 0]);
    for (let step = 0; step <= 100; step += 1) {
      const centre = resolveStudioVrmAuthoredHairClumpCenter(extreme, step / 100);
      expect(centre.every(Number.isFinite)).toBe(true);
      expect(Math.hypot(centre[0], centre[1])).toBeLessThan(0.72);
    }
  });

  it("clamps invalid progress and corrupt aspect values instead of emitting a broken buffer", () => {
    expect(resolveStudioVrmAuthoredHairClumpCenter(CLUMP, Number.NaN)).toEqual([0, 0]);
    expect(resolveStudioVrmAuthoredHairClumpCenter(CLUMP, -5)).toEqual([0, 0]);
    expect(resolveStudioVrmAuthoredHairClumpCenter(CLUMP, 5))
      .toEqual(resolveStudioVrmAuthoredHairClumpCenter(CLUMP, 1));
    const corrupt = {
      ...CLUMP,
      scale: [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY],
    } as AvatarForgeHairPart;
    expect(resolveStudioVrmAuthoredHairClumpCenter(corrupt, 0.6).every(Number.isFinite)).toBe(true);
  });

  it("preserves shell and bun parts while applying authored palette colours", () => {
    const cap = createStudioVrmAuthoredHairGeometry({
      ...CLUMP,
      id: "cap",
      role: "cap",
      primitive: "ellipsoid",
    });
    const bun = createStudioVrmAuthoredHairGeometry({
      ...CLUMP,
      id: "bun",
      role: "bun",
      primitive: "sphere",
    });
    expect(cap.getAttribute("color").count).toBe(cap.getAttribute("position").count);
    expect(bun.getAttribute("color").count).toBe(bun.getAttribute("position").count);
    cap.dispose();
    bun.dispose();
  });

  it("merges many authored parts into one renderable buffer", () => {
    const merged = mergeStudioVrmAuthoredHairGeometry([
      { part: CLUMP, matrix: new THREE.Matrix4().makeTranslation(-0.2, 0, 0) },
      {
        part: { ...CLUMP, id: "right" },
        matrix: new THREE.Matrix4().makeTranslation(0.2, 0, 0),
      },
      {
        part: { ...CLUMP, id: "cap", role: "cap", primitive: "ellipsoid" },
        matrix: new THREE.Matrix4(),
      },
    ]);
    expect(merged).not.toBeNull();
    expect(merged?.getAttribute("position").count).toBeGreaterThan(500);
    expect(merged?.getAttribute("color").count).toBe(merged?.getAttribute("position").count);
    merged?.dispose();
  });

  it("묶은 꼬리는 둥근 다발, 앞머리는 넓고 얕은 면이다 — 꼬리가 옆에서 막대 한 개로 보이지 않게", () => {
    const tail = bounds(createStudioVrmAuthoredHairClumpGeometry({ ...CLUMP, role: "tail", curl: 0, wave: 0 }));
    const bang = bounds(createStudioVrmAuthoredHairClumpGeometry({ ...CLUMP, curl: 0, wave: 0 }));
    expect(tail.z / tail.x).toBeGreaterThan(0.4);
    expect(bang.z / bang.x).toBeLessThan(0.33);
  });

  it("캡 헤어라인은 이마 가운데가 가장 높고 관자놀이·옆으로 갈수록 내려간다(좌우 대칭)", () => {
    expect(studioVrmAuthoredCapHairlineHeight(0)).toBeCloseTo(0.28, 6);
    expect(studioVrmAuthoredCapHairlineHeight(0.5)).toBeLessThan(studioVrmAuthoredCapHairlineHeight(0.2));
    expect(studioVrmAuthoredCapHairlineHeight(0.9)).toBeLessThan(studioVrmAuthoredCapHairlineHeight(0.5));
    expect(studioVrmAuthoredCapHairlineHeight(-0.5)).toBeCloseTo(studioVrmAuthoredCapHairlineHeight(0.5), 9);
    expect(Number.isFinite(studioVrmAuthoredCapHairlineHeight(Number.NaN))).toBe(true);
  });

  it("가닥을 굽은 중심선을 따라 깐다 — 뿌리·끝이 중심선 양 끝에 오고 단면은 중심선 둘레에 머문다", () => {
    const part: AvatarForgeHairPart = { ...CLUMP, curl: 0, wave: 0 };
    const points = Array.from({ length: 9 }, (_, index) => {
      const t = index / 8;
      return new THREE.Vector3(0.01 * t, 0.1 - 0.1 * t, 0.05 + 0.02 * Math.sin(Math.PI * t));
    });
    const spine = {
      points,
      normals: points.map(() => new THREE.Vector3(0, 0, 1)),
      halfWidth: 0.012,
      thickness: 0.006,
    };
    const merged = mergeStudioVrmAuthoredHairGeometry([{ part, matrix: new THREE.Matrix4().makeScale(9, 9, 9), spine }]);
    expect(merged).not.toBeNull();
    const position = merged!.getAttribute("position");
    const columns = 9;
    const rowCentre = (row: number) => {
      const centre = new THREE.Vector3();
      for (let column = 0; column < columns; column += 1) {
        centre.add(new THREE.Vector3().fromBufferAttribute(position, row * columns + column));
      }
      return centre.divideScalar(columns);
    };
    expect(rowCentre(0).distanceTo(points[0]!)).toBeLessThan(spine.thickness);
    expect(rowCentre(24).distanceTo(points[8]!)).toBeLessThan(spine.thickness);
    // 행렬(×9 확대)은 무시되고, 모든 정점이 중심선에서 반폭 + 두께 안쪽이다.
    const segment = new THREE.Line3();
    const closest = new THREE.Vector3();
    for (let index = 0; index < position.count; index += 1) {
      const vertex = new THREE.Vector3().fromBufferAttribute(position, index);
      let nearest = Number.POSITIVE_INFINITY;
      for (let point = 0; point < points.length - 1; point += 1) {
        segment.set(points[point]!, points[point + 1]!).closestPointToPoint(vertex, true, closest);
        nearest = Math.min(nearest, closest.distanceTo(vertex));
      }
      expect(nearest).toBeLessThan(spine.halfWidth + spine.thickness);
    }
    // 앞면(국소 +z)은 중심선 법선(+z) 쪽, 뒷면은 반대쪽이다.
    expect(new THREE.Vector3().fromBufferAttribute(position, 12 * columns + 4).z).toBeGreaterThan(points[4]!.z);
    expect(new THREE.Vector3().fromBufferAttribute(position, (25 + 12) * columns + 4).z).toBeLessThan(points[4]!.z);
    merged!.dispose();
  });

  it("중심선 점이 둘 미만이면 지오메트리를 건드리지 않는다", () => {
    const geometry = createStudioVrmAuthoredHairClumpGeometry(CLUMP);
    const before = Array.from(geometry.getAttribute("position").array);
    bendStudioVrmAuthoredHairAlongSpine(geometry, {
      points: [new THREE.Vector3()], normals: [new THREE.Vector3(0, 0, 1)], halfWidth: 1, thickness: 1,
    });
    expect(Array.from(geometry.getAttribute("position").array)).toEqual(before);
    geometry.dispose();
  });
});
