import { Box3, Matrix4, Mesh, Plane, SkinnedMesh, Triangle, Vector3 } from "three";

import type { VRM } from "@pixiv/three-vrm";
import type { BufferGeometry, Object3D, Quaternion } from "three";

type Solid = { bounds: Box3; planes: Plane[] };
type LegFace = { triangle: Triangle; bounds: Box3 };

/** 원본 양장본은 모서리가 둥근 볼록 부품으로 만들어졌으므로 삼각형 면 평면들의 교집합이 실제 내부다. */
export function bookSolids(root: Object3D) {
  const solids: Solid[] = [];
  root.updateWorldMatrix(true, true);
  const inverse = root.matrixWorld.clone().invert();
  root.traverseVisible(object => {
    if (!(object instanceof Mesh)) return;
    const geometry: BufferGeometry = object.geometry;
    const position = geometry.getAttribute("position");
    if (!position) return;
    const world = new Matrix4().multiplyMatrices(inverse, object.matrixWorld);
    const points = Array.from({ length: position.count }, (_, index) =>
      new Vector3().fromBufferAttribute(position, index).applyMatrix4(world));
    const bounds = new Box3().setFromPoints(points);
    const center = bounds.getCenter(new Vector3());
    const planes: Plane[] = [];
    const indices = geometry.index;
    for (let i = 0; i < (indices?.count ?? points.length); i += 3) {
      const plane = new Plane().setFromCoplanarPoints(points[indices?.getX(i) ?? i]!,
        points[indices?.getX(i + 1) ?? i + 1]!, points[indices?.getX(i + 2) ?? i + 2]!);
      if (plane.normal.lengthSq() < 0.9) continue;
      if (plane.distanceToPoint(center) > 0) plane.negate();
      if (!planes.some(other => other.normal.distanceToSquared(plane.normal) < 1e-8 && Math.abs(plane.constant - other.constant) < 1e-6)) planes.push(plane);
    }
    if (planes.length >= 4) solids.push({ bounds, planes });
  });
  return solids;
}

function thighFaces(vrm: VRM, inverseBook: Matrix4, region: Box3) {
  const thighs = [vrm.humanoid.getRawBoneNode("leftUpperLeg"), vrm.humanoid.getRawBoneNode("rightUpperLeg")];
  const faces: LegFace[] = [];
  vrm.humanoid.update();
  vrm.scene.updateMatrixWorld(true);
  vrm.scene.traverseVisible(node => {
    if (!(node instanceof SkinnedMesh)) return;
    const mesh = node;
    const geometry: BufferGeometry = mesh.geometry;
    const indices = geometry.getAttribute("skinIndex"), weights = geometry.getAttribute("skinWeight");
    const membership = mesh.skeleton.bones.map(bone => thighs.includes(bone));
    if (!indices || !weights || !membership.some(Boolean)) return;
    const eligible = new Uint8Array(indices.count);
    for (let i = 0; i < indices.count; i++) {
      let weight = 0;
      for (let j = 0; j < 4; j++) if (membership[indices.getComponent(i, j)]) weight += weights.getComponent(i, j);
      if (weight >= 0.5) eligible[i] = 1;
    }
    const material = mesh.material, order = geometry.index;
    const count = order?.count ?? indices.count;
    const groups = Array.isArray(material) ? geometry.groups.filter(g => material[g.materialIndex ?? 0]?.visible)
      : material.visible ? [{ start: 0, count }] : [];
    const bookFromMesh = new Matrix4().multiplyMatrices(inverseBook, mesh.matrixWorld);
    const vertices = new Map<number, Vector3>();
    function vertex(i: number) {
      const saved = vertices.get(i);
      if (saved) return saved;
      const point = mesh.getVertexPosition(i, new Vector3()).applyMatrix4(bookFromMesh);
      vertices.set(i, point);
      return point;
    }
    for (const group of groups) {
      const end = Math.min(count, group.start + group.count, geometry.drawRange.start + geometry.drawRange.count);
      for (let j = Math.max(group.start, geometry.drawRange.start); j + 2 < end; j += 3) {
        const a = order?.getX(j) ?? j, b = order?.getX(j + 1) ?? j + 1, c = order?.getX(j + 2) ?? j + 2;
        if (!eligible[a] && !eligible[b] && !eligible[c]) continue;
        const triangle = new Triangle(vertex(a), vertex(b), vertex(c));
        const bounds = new Box3().setFromPoints([triangle.a, triangle.b, triangle.c]);
        if (Number.isFinite(bounds.min.lengthSq()) && Number.isFinite(bounds.max.lengthSq()) && region.intersectsBox(bounds)) {
          faces.push({ triangle, bounds });
        }
      }
    }
  });
  return faces;
}

export type BookThighSurface = ReturnType<typeof indexSurface>;

function indexSurface(faces: LegFace[]) {
  const byCell = new Map<string, LegFace[]>();
  const large: LegFace[] = [];
  const cell = (value: number) => Math.floor(value / 0.06);
  for (const face of faces) {
    const a = face.bounds.min, b = face.bounds.max;
    const nx = cell(b.x) - cell(a.x) + 1, ny = cell(b.y) - cell(a.y) + 1, nz = cell(b.z) - cell(a.z) + 1;
    if (nx * ny * nz > 96) { large.push(face); continue; }
    for (let x = cell(a.x); x <= cell(b.x); x++) for (let y = cell(a.y); y <= cell(b.y); y++) {
      for (let z = cell(a.z); z <= cell(b.z); z++) {
        const key = `${x}/${y}/${z}`;
        const bucket = byCell.get(key);
        if (bucket) bucket.push(face); else byCell.set(key, [face]);
      }
    }
  }
  return { faces, cell, byCell, large };
}

function triangleInside(triangle: Triangle, solid: Solid, displacement: Vector3) {
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

export function bookIntersectsThigh(surface: BookThighSurface, solids: Solid[], displacement: Vector3) {
  const shifted = new Box3();
  return solids.some(solid => {
    shifted.copy(solid.bounds).translate(displacement);
    const touched = new Set<LegFace>();
    const hit = (face: LegFace) => {
      if (!shifted.intersectsBox(face.bounds) || touched.has(face)) return false;
      touched.add(face);
      return triangleInside(face.triangle, solid, displacement);
    };
    if (surface.large.some(hit)) return true;
    const { min, max } = shifted, { cell } = surface;
    for (let x = cell(min.x); x <= cell(max.x); x++) for (let y = cell(min.y); y <= cell(max.y); y++) {
      for (let z = cell(min.z); z <= cell(max.z); z++) {
        if (surface.byCell.get(`${x}/${y}/${z}`)?.some(hit)) return true;
      }
    }
    return false;
  });
}

export function bookThighSurface(vrm: VRM, inverseBook: Matrix4, region: Box3) {
  return indexSurface(thighFaces(vrm, inverseBook, region));
}

/** 손목을 축으로 책을 돌린 좌표계에서 같은 허벅지 삼각형을 비교한다. */
export function turnBookThighSurface(surface: BookThighSurface, pivot: Vector3, rotation: Quaternion) {
  const cache = new Map<Vector3, Vector3>();
  const rotated = (point: Vector3) => {
    let result = cache.get(point);
    if (!result) {
      result = point.clone().sub(pivot).applyQuaternion(rotation).add(pivot);
      cache.set(point, result);
    }
    return result;
  };
  return indexSurface(surface.faces.map(({ triangle }) => {
    const t = new Triangle(rotated(triangle.a), rotated(triangle.b), rotated(triangle.c));
    return { triangle: t, bounds: new Box3().setFromPoints([t.a, t.b, t.c]) };
  }));
}
