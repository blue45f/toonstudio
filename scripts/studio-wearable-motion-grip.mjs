/** Compare deformed finger skin vertices with the shipped microphone handle triangles. */
import { THREE as T } from "./runtime/runtime.mjs";

const digits = ["Thumb", "Index", "Middle", "Ring", "Little"];

function findHandle(asset) {
  let handle;
  asset.traverseVisible((node) => {
    if (node.isMesh && (node.material?.name === "MicV5_SatinBody" || node.name.includes("MicV5_SatinBody"))) handle = node;
  });
  if (!handle) throw new Error("마이크 손잡이 원본 메시를 찾지 못했습니다.");
  const position = handle.geometry.getAttribute("position");
  const index = handle.geometry.index;
  const vertex = (n) => new T.Vector3().fromBufferAttribute(position, index ? index.getX(n) : n);
  const faces = [];
  for (let i = 0; i < (index?.count ?? position.count); i += 3) {
    const triangle = new T.Triangle(vertex(i), vertex(i + 1), vertex(i + 2));
    const normal = triangle.getNormal(new T.Vector3());
    if (normal.lengthSq()) faces.push({ triangle, normal });
  }
  return { handle, faces };
}

function drawnVertices(mesh) {
  const geometry = mesh.geometry;
  const indices = geometry.index;
  const count = indices?.count ?? geometry.getAttribute("position").count;
  const drawEnd = Math.min(count, geometry.drawRange.start + geometry.drawRange.count);
  const groups = Array.isArray(mesh.material) ? geometry.groups.filter((group) => mesh.material[group.materialIndex]?.visible)
    : mesh.material.visible ? [{ start: 0, count }] : [];
  const used = new Set();
  for (const group of groups) {
    const end = Math.min(drawEnd, group.start + group.count);
    for (let i = Math.max(geometry.drawRange.start, group.start); i < end; i++) used.add(indices ? indices.getX(i) : i);
  }
  return used;
}

function findFingerSurface(vrm, digit) {
  const parts = digit === "Thumb" ? ["Metacarpal", "Proximal", "Distal"] : ["Proximal", "Intermediate", "Distal"];
  const joints = parts.map((part) => vrm.humanoid.getRawBoneNode("right" + digit + part));
  if (joints.some((joint) => !joint)) throw new Error("오른손 손가락 본 누락: " + digit);
  // The two terminal phalanges define the finger pads. Exclude palm/sleeve vertices.
  const phalanges = new Set(joints.slice(1));
  const patches = [];
  vrm.scene.traverseVisible((mesh) => {
    if (!mesh.isSkinnedMesh || !mesh.skeleton.bones.some((bone) => phalanges.has(bone))) return;
    const indices = mesh.geometry.getAttribute("skinIndex");
    const weights = mesh.geometry.getAttribute("skinWeight");
    const vertices = [];
    for (const i of drawnVertices(mesh)) {
      let influence = 0;
      for (let slot = 0; slot < 4; slot++) {
        const bone = mesh.skeleton.bones[indices.getComponent(i, slot)];
        if (phalanges.has(bone)) influence += weights.getComponent(i, slot);
      }
      if (influence >= 0.5) vertices.push(i);
    }
    if (vertices.length) patches.push({ mesh, vertices });
  });
  if (!patches.length) throw new Error("오른손 손가락 피부 가중치 누락: " + digit);
  return { digit, patches, joints };
}

// This diagnostic holds the measured skin pose fixed. It suggests where to inspect the real
// renderer next; final contact numbers always come from fresh skinned vertices and GLB triangles.
function probeMicrophoneAxis(surfaces, handle, localToMm, centerY) {
  const profile = new Map();
  const points = handle.geometry.getAttribute("position");
  for (let i = 0; i < points.count; i++) {
    const y = Math.round(points.getY(i) * 1e5) / 1e5 * localToMm;
    const radius = Math.hypot(points.getX(i), points.getZ(i)) * localToMm;
    profile.set(y, Math.max(profile.get(y) ?? 0, radius));
  }
  const rings = [...profile].sort((a, b) => a[0] - b[0]);
  function score(dx, dz, tiltX, tiltZ) {
    const dir = new T.Vector3(Math.tan(tiltX * Math.PI / 180), 1, Math.tan(tiltZ * Math.PI / 180)).normalize();
    const digits = [];
    let loss = 0;
    for (const vertices of surfaces) {
      let nearest = Infinity;
      let depth = 0;
      for (const [x, y, z] of vertices) {
        const vx = x - dx, vy = y - centerY, vz = z - dz;
        const along = vx * dir.x + vy * dir.y + vz * dir.z;
        const axial = along + centerY;
        const r = Math.sqrt(Math.max(0, vx * vx + vy * vy + vz * vz - along * along));
        let k = 1;
        while (k < rings.length - 1 && axial > rings[k][0]) k++;
        const [lo, hi] = [rings[k - 1], rings[k]];
        const f = Math.max(0, Math.min(1, (axial - lo[0]) / (hi[0] - lo[0])));
        const signed = r - (lo[1] + f * (hi[1] - lo[1]));
        const endGap = Math.max(rings[0][0] - axial, axial - rings.at(-1)[0], 0);
        if (endGap > 0) nearest = Math.min(nearest, Math.hypot(Math.max(signed, 0), endGap));
        else {
          nearest = Math.min(nearest, Math.abs(signed));
          depth = Math.max(depth, -signed);
        }
      }
      loss += Math.max(0, nearest - 1) ** 2 + 2 * Math.max(0, depth - 1) ** 2;
      digits.push({ gap: nearest, penetration: depth });
    }
    return { dx, dz, tiltX, tiltZ, loss, digits };
  }
  let best = score(0, 0, 0, 0);
  const nominal = best;
  for (const step of [8, 4, 2, 1]) {
    for (let pass = 0; pass < 6; pass++) {
      let improved = false;
      for (const key of ["dx", "dz", "tiltX", "tiltZ"]) {
        for (const sign of [-1, 1]) {
          const options = { ...best, [key]: best[key] + sign * step };
          if (Math.max(Math.abs(options.dx), Math.abs(options.dz)) > 16 || Math.max(Math.abs(options.tiltX), Math.abs(options.tiltZ)) > 32) continue;
          const trial = score(options.dx, options.dz, options.tiltX, options.tiltZ);
          if (trial.loss + 0.001 < best.loss) { best = trial; improved = true; }
        }
      }
      if (!improved) break;
    }
  }
  return { nominal, best, propScale: localToMm / 1000, units: "world mm displacement at grip anchor, degrees toward local X/Z" };
}

export function createMicGripMeasurement(vrm, asset, anchorY) {
  const { handle, faces } = findHandle(asset);
  const surfaces = digits.map((digit) => findFingerSurface(vrm, digit));
  const point = new T.Vector3();
  const closest = new T.Vector3();
  const offset = new T.Vector3();
  let measuredNeutral = false;
  return () => {
    handle.updateWorldMatrix(true, false);
    const scale = handle.getWorldScale(new T.Vector3());
    if (Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z) > 1e-5) {
      throw new Error("손잡이의 비균일 배율을 확인해 주세요.");
    }
    const localToMm = scale.x * 1000;
    const clouds = [];
    const digits = surfaces.map(({ digit, patches, joints }) => {
      const cloud = [];
      const penetrations = [];
      const deepest = new T.Vector3();
      let deepestSkinInfluences = [];
      const closestSkinPoint = new T.Vector3();
      let minGapMm = Infinity;
      let maxPenetrationMm = 0;
      let skinVertices = 0;
      for (const { mesh, vertices } of patches) {
        mesh.updateWorldMatrix(true, false);
        for (const index of vertices) {
          handle.worldToLocal(mesh.localToWorld(mesh.getVertexPosition(index, point)));
          if (!measuredNeutral) cloud.push(point.toArray().map((value) => value * localToMm));
          let minSquare = Infinity;
          let inside = false;
          for (const { triangle, normal } of faces) {
            triangle.closestPointToPoint(point, closest);
            const square = point.distanceToSquared(closest);
            if (square >= minSquare) continue;
            minSquare = square;
            inside = offset.subVectors(point, closest).dot(normal) < 0;
          }
          const distanceMm = Math.sqrt(minSquare) * localToMm;
          if (distanceMm < minGapMm) {
            minGapMm = distanceMm;
            closestSkinPoint.copy(point);
          }
          if (inside) {
            penetrations.push(distanceMm);
            if (distanceMm > maxPenetrationMm) {
              maxPenetrationMm = distanceMm;
              deepest.copy(point);
              const indices = mesh.geometry.getAttribute("skinIndex");
              const weights = mesh.geometry.getAttribute("skinWeight");
              deepestSkinInfluences = [0, 1, 2, 3].map(slot => ({
                bone: mesh.skeleton.bones[indices.getComponent(index, slot)]?.name,
                weight: weights.getComponent(index, slot),
              })).filter(influence => influence.weight > 0).sort((a, b) => b.weight - a.weight);
            }
          }
          skinVertices++;
        }
      }
      const [base, middle, distal] = joints.map((joint) => joint.getWorldPosition(new T.Vector3()));
      const jointBendDeg = T.MathUtils.radToDeg(distal.sub(middle).angleTo(middle.sub(base)));
      clouds.push(cloud);
      return { digit, skinVertices, minGapMm, maxPenetrationMm, jointBendDeg,
        deepestSkinInfluences,
        over3mm: penetrations.filter((depth) => depth > 3).length,
        deepestSkinLocalMm: deepest.multiplyScalar(localToMm).toArray(),
        closestSkinLocalMm: closestSkinPoint.multiplyScalar(localToMm).toArray(),
      };
    });
    const probe = !measuredNeutral && probeMicrophoneAxis(clouds, handle, localToMm, anchorY * localToMm);
    measuredNeutral = true;
    return { digits, probe };
  };
}
