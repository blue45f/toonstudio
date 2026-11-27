import { BufferGeometry, Float32BufferAttribute, Matrix4, Vector3 } from "three";
import { MeshBVH } from "three-mesh-bvh";

const bodyBones = ["neck", "upperChest", "chest", "leftShoulder", "rightShoulder", "leftUpperArm", "rightUpperArm"];
const identity = new Matrix4();

function posedUpperBody(fixture) {
  const bones = new Set(bodyBones.map(name => fixture.vrm.humanoid.getRawBoneNode(name)).filter(Boolean));
  const positions = [];
  for (const mesh of fixture.nativeMeshes) {
    if (!mesh.isSkinnedMesh || !mesh.visible) continue;
    const { position, skinIndex, skinWeight } = mesh.geometry.attributes;
    if (!position || !skinIndex || !skinWeight) continue;
    const joint = mesh.skeleton.bones.map(b => bones.has(b));
    if (!joint.some(Boolean)) continue;
    const weight = new Float32Array(position.count);
    for (let i = 0; i < weight.length; i++) {
      for (let k = 0; k < 4; k++) if (joint[skinIndex.getComponent(i, k)]) weight[i] += skinWeight.getComponent(i, k);
    }
    const index = mesh.geometry.index;
    const count = index?.count ?? position.count;
    const groups = Array.isArray(mesh.material) ? mesh.geometry.groups : [{ start: 0, count, materialIndex: 0 }];
    const cache = new Map();
    const point = i => {
      if (!cache.has(i)) cache.set(i, mesh.getVertexPosition(i, new Vector3()).applyMatrix4(mesh.matrixWorld).toArray());
      return cache.get(i);
    };
    for (const { start, count: length, materialIndex } of groups) {
      const material = Array.isArray(mesh.material) ? mesh.material[materialIndex] : mesh.material;
      if (!material?.visible) continue;
      for (let i = start; i + 2 < Math.min(count, start + length); i += 3) {
        const a = index ? index.getX(i) : i, b = index ? index.getX(i + 1) : i + 1, c = index ? index.getX(i + 2) : i + 2;
        if (Math.max(weight[a], weight[b], weight[c]) >= 0.25) positions.push(...point(a), ...point(b), ...point(c));
      }
    }
  }
  if (!positions.length) throw new Error(`No posed neck/torso/shoulder triangles in ${fixture.model}`);
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(positions, 3));
  return { bvh: new MeshBVH(geometry), triangles: positions.length / 9 };
}

function mountedTail(mesh, span) {
  const start = span.firstVertex;
  const stop = start + span.vertexCount;
  const src = mesh.geometry.getAttribute("position");
  const uv = mesh.geometry.getAttribute("uv");
  const index = mesh.geometry.index;
  const points = [], indices = [], rings = new Map();
  const v = new Vector3();
  for (let i = start; i < stop; i++) {
    v.fromBufferAttribute(src, i).applyMatrix4(mesh.matrixWorld);
    points.push(v.x, v.y, v.z);
    // Both material faces meet at u=0/1, so their opposing endpoints give a centerline
    // independent of the clump's asymmetric highlights, thickness and root pinch.
    const u = uv.getX(i);
    if (u === 0 || u === 1) {
      const t = uv.getY(i);
      const ring = rings.get(t) ?? {};
      ring[u] = v.clone();
      rings.set(t, ring);
    }
  }
  if (!index) throw new Error("Missing mounted ponytail triangle indices");
  for (let i = 0; i < index.count; i += 3) {
    const a = index.getX(i), b = index.getX(i + 1), c = index.getX(i + 2);
    if (a < start || a >= stop) continue;
    if (b < start || b >= stop || c < start || c >= stop) throw new Error("Tail triangle crosses part boundaries");
    indices.push(a - start, b - start, c - start);
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute("position", new Float32BufferAttribute(points, 3));
  geometry.setIndex(indices);
  geometry.boundsTree = new MeshBVH(geometry);
  const sections = [...rings].sort(([a], [b]) => a - b).map(([t, ring]) => {
    if (!ring[0] || !ring[1]) throw new Error(`Incomplete hair section at ${t}`);
    return { t, mid: ring[0].clone().lerp(ring[1], 0.5), width: ring[0].distanceTo(ring[1]) };
  });
  return { geometry, sections };
}

// Trace the exact posed surfaces and the hair mesh used by WebGL. A zero distance/triangle
// crossing indicates contact with this selected mesh region. It does not test enclosed-volume
// containment or predict what happens between the sampled poses.
export function measureMountedTail(fixture) {
  const bodies = new Map();
  const receipts = new WeakMap();
  return (mesh, span, turned) => {
    if (!span) return null;
    const perPose = receipts.get(mesh.geometry) ?? new Map();
    if (perPose.has(turned)) return perPose.get(turned);
    const body = bodies.get(turned) ?? posedUpperBody(fixture);
    bodies.set(turned, body);
    const { geometry, sections } = mountedTail(mesh, span);
    try {
      const closest = body.bvh.closestPointToGeometry(geometry, identity);
      if (!closest || !Number.isFinite(closest.distance) || sections.length < 3) throw new Error("Cannot measure tail/upper body");
      const root = sections[0].mid, tip = sections.at(-1).mid;
      const forward = new Vector3(0, 0, fixture.fit.frontSign).transformDirection(fixture.head.matrixWorld);
      let arcLength = 0, maxDeviation = 0, maxDepthDeviation = 0;
      for (const [i, { t, mid }] of sections.entries()) {
        const offset = mid.clone().sub(root.clone().lerp(tip, t));
        maxDeviation = Math.max(maxDeviation, offset.length());
        maxDepthDeviation = Math.max(maxDepthDeviation, Math.abs(offset.dot(forward)));
        if (i > 0) arcLength += mid.distanceTo(sections[i - 1].mid);
      }
      const result = {
        sections: sections.length, arcLengthMm: arcLength * 1000, chordLengthMm: root.distanceTo(tip) * 1000,
        maxDeviationMm: maxDeviation * 1000, maxDepthDeviationMm: maxDepthDeviation * 1000,
        rootWidthMm: sections[0].width * 1000, tipWidthMm: sections.at(-1).width * 1000,
        bodyTriangles: body.triangles, intersectsUpperBody: body.bvh.intersectsGeometry(geometry, identity),
        upperBodyDistanceMm: closest.distance * 1000,
      };
      perPose.set(turned, result); receipts.set(mesh.geometry, perPose);
      return result;
    } finally { geometry.dispose(); }
  };
}
