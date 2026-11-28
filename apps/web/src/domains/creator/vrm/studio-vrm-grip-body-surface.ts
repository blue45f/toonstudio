import { Box3, Matrix4, Mesh, Plane, SkinnedMesh, Triangle, Vector3 } from "three";

import type { VRM } from "@pixiv/three-vrm";
import type { BufferGeometry, Object3D, Quaternion } from "three";

type ConvexSolid = { bounds: Box3; planes: Plane[] };
export type GripMeshSolid = { bounds: Box3; intersects: (triangle: Triangle, offset: Vector3) => boolean };
export type GripBodyCollisionSolid = ConvexSolid | GripMeshSolid;
type BodyFace = { triangle: Triangle; bounds: Box3 };

/** 원본 양장본은 모서리가 둥근 볼록 부품으로 만들어졌으므로 삼각형 면 평면들의 교집합이 실제 내부다. */
export function* bookSolids(root: Object3D) {
  const solids: GripBodyCollisionSolid[] = [];
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  const parts: Mesh[] = [];
  root.traverseVisible(object => { if (object instanceof Mesh) parts.push(object); });
  for (const object of parts) {
    const geometry: BufferGeometry = object.geometry;
    const position = geometry.getAttribute("position");
    if (!position) continue;
    const world = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    const points = Array.from({ length: position.count }, (_, index) =>
      new Vector3().fromBufferAttribute(position, index).applyMatrix4(world));
    const bounds = new Box3().setFromPoints(points);
    const center = bounds.getCenter(new Vector3());
    const planes: Plane[] = [];
    const indices = geometry.index;
    for (let i = 0; i < (indices?.count ?? points.length); i += 3) {
      if (i % 384 === 0) yield;
      const plane = new Plane().setFromCoplanarPoints(points[indices?.getX(i) ?? i]!,
        points[indices?.getX(i + 1) ?? i + 1]!, points[indices?.getX(i + 2) ?? i + 2]!);
      if (plane.normal.lengthSq() < 0.9) continue;
      if (plane.distanceToPoint(center) > 0) plane.negate();
      if (!planes.some(other => other.normal.distanceToSquared(plane.normal) < 1e-8 && Math.abs(plane.constant - other.constant) < 1e-6)) planes.push(plane);
    }
    if (planes.length >= 4) solids.push({ bounds, planes });
  }
  return solids;
}

function* bodyFaces(vrm: VRM, inverseGrip: Matrix4, region: Box3, includeClothes: boolean) {
  const humanoidBones = new Map<Object3D, string>();
  if (includeClothes) {
    for (const [name, bone] of Object.entries(vrm.humanoid.rawHumanBones)) humanoidBones.set(bone.node, name);
  }
  const bodyNames = new Set(["hips", "spine", "chest", "upperChest", "leftUpperLeg", "rightUpperLeg", "leftLowerLeg", "rightLowerLeg", "leftFoot", "rightFoot", "leftToes", "rightToes"]);
  const thighs = [vrm.humanoid.getRawBoneNode("leftUpperLeg"), vrm.humanoid.getRawBoneNode("rightUpperLeg")];
  const faces: BodyFace[] = [];
  vrm.humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  const meshes: SkinnedMesh[] = [];
  vrm.scene.traverseVisible(node => { if (node instanceof SkinnedMesh) meshes.push(node); });
  for (const mesh of meshes) {
    const geometry: BufferGeometry = mesh.geometry;
    const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
    // 치맛단 보조 뼈는 허벅지 자체가 아니라 골반에 매달리기도 한다. 첫 휴머노이드 조상으로 구분해 손가락·소매 접촉을 제외한다.
    const membership = mesh.skeleton.bones.map(bone => {
      if (!includeClothes) return thighs.includes(bone);
      for (let node: Object3D | null = bone; node; node = node.parent) {
        const owner = humanoidBones.get(node);
        if (owner) return bodyNames.has(owner);
      }
      return false;
    });
    if (!indices || !weights || !membership.some(Boolean)) continue;
    const eligible = new Uint8Array(indices.count);
    for (let i = 0; i < indices.count; i++) {
      if (i % 512 === 0) yield;
      let weight = 0;
      for (let j = 0; j < 4; j++) if (membership[indices.getComponent(i, j)]) weight += weights.getComponent(i, j);
      if (weight >= 0.5) eligible[i] = 1;
    }
    const material = mesh.material, order = geometry.index;
    const count = order?.count ?? indices.count;
    const groups = Array.isArray(material) ? geometry.groups.filter(g => material[g.materialIndex ?? 0]?.visible)
      : material.visible ? [{ start: 0, count }] : [];
    const gripFromMesh = new Matrix4().multiplyMatrices(inverseGrip, mesh.matrixWorld);
    const vertices: (Vector3 | undefined)[] = new Array(indices.count);
    const unskinned = new Vector3(), contribution = new Vector3();
    // 같은 본의 자세 행렬은 한 번만 계산하고 표정·체형 morph는 Three.js의 원본 좌표를 사용한다.
    const palette = mesh.skeleton.bones.map((bone, i) => new Matrix4().multiplyMatrices(bone.matrixWorld, mesh.skeleton.boneInverses[i]!));
    const toGrip = gripFromMesh.clone().multiply(mesh.bindMatrixInverse);
    const bounds = new Box3();
    function vertex(i: number) {
      const saved = vertices[i];
      if (saved) return saved;
      Mesh.prototype.getVertexPosition.call(mesh, i, unskinned).applyMatrix4(mesh.bindMatrix);
      const point = new Vector3();
      for (let j = 0; j < 4; j++) {
        const weight = weights.getComponent(i, j);
        if (weight) point.addScaledVector(contribution.copy(unskinned).applyMatrix4(palette[indices.getComponent(i, j)]!), weight);
      }
      point.applyMatrix4(toGrip);
      vertices[i] = point;
      return point;
    }
    for (const group of groups) {
      const end = Math.min(count, group.start + group.count, geometry.drawRange.start + geometry.drawRange.count);
      let remaining = 0;
      for (let j = Math.max(group.start, geometry.drawRange.start); j + 2 < end; j += 3) {
        if (remaining-- <= 0) { remaining = 96; yield; }
        const a = order?.getX(j) ?? j, b = order?.getX(j + 1) ?? j + 1, c = order?.getX(j + 2) ?? j + 2;
        if (!eligible[a] && !eligible[b] && !eligible[c]) continue;
        const va = vertex(a), vb = vertex(b), vc = vertex(c);
        bounds.makeEmpty().expandByPoint(va).expandByPoint(vb).expandByPoint(vc);
        if (Number.isFinite(bounds.min.lengthSq()) && Number.isFinite(bounds.max.lengthSq()) && region.intersectsBox(bounds)) {
          faces.push({ triangle: new Triangle(va, vb, vc), bounds: bounds.clone() });
        }
      }
    }
  }
  return faces;
}

export type GripBodySurface = {
  faces: BodyFace[];
  cell: (value: number) => number;
  byCell: Map<number, BodyFace[]>;
  large: BodyFace[];
};

// 셀 해시가 같은 먼 얼굴은 최종 AABB 검사에서 제외한다.
function cellKey(x: number, y: number, z: number) {
  return ((x & 1023) << 20) | ((y & 1023) << 10) | (z & 1023);
}

function* indexSurface(faces: BodyFace[]): Generator<void, GripBodySurface> {
  const byCell = new Map<number, BodyFace[]>();
  const large: BodyFace[] = [];
  const cell = (value: number) => Math.floor(value / 0.06);
  let remaining = 0;
  for (const face of faces) {
    if (remaining-- <= 0) { remaining = 96; yield; }
    const a = face.bounds.min, b = face.bounds.max;
    const nx = cell(b.x) - cell(a.x) + 1, ny = cell(b.y) - cell(a.y) + 1, nz = cell(b.z) - cell(a.z) + 1;
    if (nx * ny * nz > 96) { large.push(face); continue; }
    for (let x = cell(a.x); x <= cell(b.x); x++) for (let y = cell(a.y); y <= cell(b.y); y++) {
      for (let z = cell(a.z); z <= cell(b.z); z++) {
        const key = cellKey(x, y, z);
        const bucket = byCell.get(key);
        if (bucket) bucket.push(face); else byCell.set(key, [face]);
      }
    }
  }
  return { faces, cell, byCell, large };
}

function triangleInside(triangle: Triangle, solid: ConvexSolid, displacement: Vector3) {
  const { a, b, c } = triangle;
  let insideA = true, insideB = true, insideC = true;
  for (const plane of solid.planes) {
    const limit = plane.normal.dot(displacement) - plane.constant - 1e-5;
    const da = plane.normal.dot(a) - limit, db = plane.normal.dot(b) - limit, dc = plane.normal.dot(c) - limit;
    if (da > 0 && db > 0 && dc > 0) return false;
    insideA &&= da <= 0; insideB &&= db <= 0; insideC &&= dc <= 0;
  }
  if (insideA || insideB || insideC) return true;
  let polygon = [a, b, c];
  for (const plane of solid.planes) {
    const limit = plane.normal.dot(displacement) - plane.constant - 1e-5;
    const distances = polygon.map(p => plane.normal.dot(p) - limit);
    if (distances.every(d => d > 0)) return false;
    if (distances.every(d => d <= 0)) continue;
    const clipped: Vector3[] = [];
    for (let i = 0; i < polygon.length; i++) {
      const j = (i + 1) % polygon.length;
      const start = polygon[i]!, end = polygon[j]!, da = distances[i]!, db = distances[j]!;
      if (da <= 0) clipped.push(start);
      if ((da <= 0) !== (db <= 0)) clipped.push(start.clone().lerp(end, da / (da - db)));
    }
    polygon = clipped;
  }
  return polygon.length > 0;
}

export function* gripIntersectsBody(surface: GripBodySurface, solids: GripBodyCollisionSolid[], displacement: Vector3) {
  const shifted = new Box3();
  for (const solid of solids) {
    shifted.copy(solid.bounds).translate(displacement);
    const touched = new Set<BodyFace>();
    const hit = (face: BodyFace) => {
      if (!shifted.intersectsBox(face.bounds) || touched.has(face)) return false;
      touched.add(face);
      return "intersects" in solid ? solid.intersects(face.triangle, displacement) : triangleInside(face.triangle, solid, displacement);
    };
    let count = 0;
    for (const face of surface.large) {
      if (++count % 48 === 0) yield;
      if (hit(face)) return true;
    }
    const { min, max } = shifted, { cell } = surface;
    for (let x = cell(min.x); x <= cell(max.x); x++) for (let y = cell(min.y); y <= cell(max.y); y++) {
      for (let z = cell(min.z); z <= cell(max.z); z++) {
        const bucket = surface.byCell.get(cellKey(x, y, z));
        if (!bucket) continue;
        for (const face of bucket) {
          if (++count % 48 === 0) yield;
          if (hit(face)) return true;
        }
      }
    }
  }
  return false;
}

export function* gripBodySurface(vrm: VRM, inverseGrip: Matrix4, region: Box3, includeClothes: boolean) {
  return yield* indexSurface(yield* bodyFaces(vrm, inverseGrip, region, includeClothes));
}

/** 손목을 축으로 책을 돌린 좌표계에서 같은 허벅지 삼각형을 비교한다. */
export function* turnGripBodySurface(surface: GripBodySurface, pivot: Vector3, rotation: Quaternion) {
  const cache = new Map<Vector3, Vector3>();
  const rotated = (point: Vector3) => {
    let result = cache.get(point);
    if (!result) {
      result = point.clone().sub(pivot).applyQuaternion(rotation).add(pivot);
      cache.set(point, result);
    }
    return result;
  };
  const faces: BodyFace[] = [];
  let remaining = 0;
  for (const { triangle } of surface.faces) {
    if (remaining-- <= 0) { remaining = 96; yield; }
    const t = new Triangle(rotated(triangle.a), rotated(triangle.b), rotated(triangle.c));
    faces.push({ triangle: t, bounds: new Box3().setFromPoints([t.a, t.b, t.c]) });
  }
  return yield* indexSurface(faces);
}
