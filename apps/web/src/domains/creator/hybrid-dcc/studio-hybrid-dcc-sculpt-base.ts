import { hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { createStudioEditableMeshFromPolygons, type StudioEditableMesh, type StudioMeshVec3 } from "../studio-editable-half-edge-mesh";

/** 극점 쏠림이 없는 균일 6면 분할 사각 구체(Quad-sphere). 조형 시작용 기본 메시. */
export function buildSculptQuadSphereMesh(radius = 0.6, divisions = 6): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  const vertexByKey = new Map<string, number>();
  const faces: number[][] = [];
  const patches: readonly {
    readonly origin: readonly [number, number, number];
    readonly uAxis: readonly [number, number, number];
    readonly vAxis: readonly [number, number, number];
  }[] = [
    { origin: [-divisions, -divisions, divisions], uAxis: [2, 0, 0], vAxis: [0, 2, 0] }, // +Z
    { origin: [divisions, -divisions, -divisions], uAxis: [-2, 0, 0], vAxis: [0, 2, 0] }, // -Z
    { origin: [divisions, -divisions, divisions], uAxis: [0, 0, -2], vAxis: [0, 2, 0] }, // +X
    { origin: [-divisions, -divisions, -divisions], uAxis: [0, 0, 2], vAxis: [0, 2, 0] }, // -X
    { origin: [-divisions, divisions, divisions], uAxis: [2, 0, 0], vAxis: [0, 0, -2] }, // +Y
    { origin: [-divisions, -divisions, -divisions], uAxis: [2, 0, 0], vAxis: [0, 0, 2] }, // -Y
  ];

  const vertexIndex = (gx: number, gy: number, gz: number): number => {
    const key = `${gx}|${gy}|${gz}`;
    const existing = vertexByKey.get(key);
    if (existing !== undefined) return existing;
    const nx = gx / divisions;
    const ny = gy / divisions;
    const nz = gz / divisions;
    // 탄젠트 왜곡을 줄이는 구면 투영
    const sx = nx * Math.sqrt(Math.max(0, 1 - (ny * ny) / 2 - (nz * nz) / 2 + (ny * ny * nz * nz) / 3));
    const sy = ny * Math.sqrt(Math.max(0, 1 - (nz * nz) / 2 - (nx * nx) / 2 + (nz * nz * nx * nx) / 3));
    const sz = nz * Math.sqrt(Math.max(0, 1 - (nx * nx) / 2 - (ny * ny) / 2 + (nx * nx * ny * ny) / 3));
    const length = Math.hypot(sx, sy, sz) || 1;
    const created = positions.length;
    positions.push({ x: (sx / length) * radius, y: (sy / length) * radius, z: (sz / length) * radius });
    vertexByKey.set(key, created);
    return created;
  };

  for (const patch of patches) {
    const grid = (iu: number, iv: number): number =>
      vertexIndex(
        patch.origin[0] + patch.uAxis[0] * iu + patch.vAxis[0] * iv,
        patch.origin[1] + patch.uAxis[1] * iu + patch.vAxis[1] * iv,
        patch.origin[2] + patch.uAxis[2] * iu + patch.vAxis[2] * iv,
      );
    for (let iv = 0; iv < divisions; iv += 1) {
      for (let iu = 0; iu < divisions; iu += 1) {
        faces.push([grid(iu, iv), grid(iu + 1, iv), grid(iu + 1, iv + 1), grid(iu, iv + 1)]);
      }
    }
  }
  const mesh = createStudioEditableMeshFromPolygons(positions, faces);
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: true })) };
}

/** +Z 정면, 턱끝 Y=0. 원본 사각면 연결을 유지한 채 정점 좌표만 빚는다. */
export function buildSculptHeadMesh(shape: { heightCm: number; jawPercent: number; divisions: number }): StudioEditableMesh {
  const mesh = buildSculptQuadSphereMesh(1, shape.divisions);
  const halfHeight = shape.heightCm / 200;
  const oval = (distance: number) => Math.exp(-distance * distance);
  const vertices = mesh.vertices.map((vertex) => {
    const { x, y, z } = vertex.position;
    const lowerFace = Math.max(0, -y);
    const side = Math.abs(x);
    const front = Math.max(0, z) ** 2;
    const jawBand = Math.min(1, 2.2 * lowerFace);
    const jaw = 1 - (1 - shape.jawPercent / 100) * jawBand * jawBand * (3 - 2 * jawBand);
    const brow = oval((side - 0.4) / 0.26) * oval((y - 0.18) / 0.12);
    const orbit = oval((side - 0.4) / 0.20) * oval((y - 0.03) / 0.11);
    const eyeX = (side - 0.40) / 0.215;
    const eyeY = (y - 0.025 - 0.024 * eyeX) / 0.085;
    const lid = 0.10 * oval(1.3 * eyeX) * oval(1.35 * eyeY)
      + 0.055 * oval(eyeX) * oval((eyeY - 0.8 + eyeX * eyeX) / 0.65);
    const cheek = oval((side - 0.56) / 0.24) * oval((y + 0.18) / 0.21);
    const bridge = oval(x / 0.16) * oval(y / 0.33);
    const noseTip = oval(x / 0.16) * oval((y + 0.24) / 0.11);
    const lips = oval(x / 0.30) * (oval((y + 0.43) / 0.065) + 0.65 * oval((y + 0.54) / 0.07));
    const mouthLine = oval(x / 0.28) * oval((y + 0.49 - 0.04 * (x / 0.30) ** 2) / 0.04);
    const noseWing = oval((side - 0.12) / 0.085) * oval((y + 0.23) / 0.08);
    const earRadius = Math.hypot((z + 0.14 - 0.22 * y) / 0.16, (y + 0.09) / 0.26);
    const ear = side ** 6 * (0.065 * oval((earRadius - 0.64) / 0.5) + 0.025 * oval(earRadius));
    const chin = oval(x / 0.34) * oval((y + 0.76) / 0.17);
    const relief = 0.10 * brow - 0.16 * orbit + lid + 0.09 * cheek + 0.15 * bridge + 0.19 * noseTip + 0.085 * noseWing + 0.12 * lips - 0.075 * mouthLine + 0.12 * chin;
    return { ...vertex, position: {
      x: halfHeight * (0.72 * x * jaw + Math.sign(x) * ear),
      y: halfHeight * (y + 1),
      z: halfHeight * (0.79 * z + 0.34 * lowerFace * lowerFace + front * relief),
    } };
  });
  // 큐브의 여섯 패치를 독립 UV 섬으로 쓴다. 얼굴의 굴곡이나 턱 너비가 달라도 솔기는 같은 자리에 남는다.
  const n = shape.divisions;
  const corners = mesh.halfEdges.map((edge) => {
    const patch = Math.floor(edge.face / (n * n));
    const column = edge.face % n;
    const row = Math.floor(edge.face / n) % n;
    const corner = edge.id - mesh.faces[edge.face]!.he;
    const u = (column + Number(corner === 1 || corner === 2)) / n;
    const v = (row + Number(corner >= 2)) / n;
    return { halfEdgeId: edge.id,
      u: Math.fround((patch % 3 + 0.02 + 0.96 * u) / 3),
      v: Math.fround((Math.floor(patch / 3) + 0.02 + 0.96 * v) / 2) };
  });
  return { ...mesh, vertices, uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(mesh), corners } };
}
