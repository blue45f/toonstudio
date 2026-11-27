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

export function createMicGripMeasurement(vrm, asset) {
  const { handle, faces } = findHandle(asset);
  const surfaces = digits.map((digit) => findFingerSurface(vrm, digit));
  const point = new T.Vector3();
  const closest = new T.Vector3();
  const offset = new T.Vector3();
  return () => {
    handle.updateWorldMatrix(true, false);
    const scale = handle.getWorldScale(new T.Vector3());
    if (Math.max(scale.x, scale.y, scale.z) - Math.min(scale.x, scale.y, scale.z) > 1e-5) {
      throw new Error("손잡이의 비균일 배율을 확인해 주세요.");
    }
    const localToMm = scale.x * 1000;
    return surfaces.map(({ digit, patches, joints }) => {
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
      return { digit, skinVertices, minGapMm, maxPenetrationMm, jointBendDeg,
        deepestSkinInfluences,
        over3mm: penetrations.filter((depth) => depth > 3).length,
        deepestSkinLocalMm: deepest.multiplyScalar(localToMm).toArray(),
        closestSkinLocalMm: closestSkinPoint.multiplyScalar(localToMm).toArray(),
      };
    });
  };
}
