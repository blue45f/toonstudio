import * as THREE from "three";

import type { GarmentShape } from "./studio-vrm-wardrobe";

type Shell = Extract<GarmentShape, { kind: "lathe" }>;
type Point = readonly [number, number, number];

/** 앞목에서 첫 단추까지의 V와 밑단 트임을 해당 높이 단면의 방위각으로 나타낸다. */
function opening(t: number) {
  return 0.012 + 0.55 * Math.max(0, (t - 0.48) / 0.52) + 0.10 * Math.max(0, 1 - t / 0.19);
}

/** 몸판·라펠·여밈을 같은 실측 가슴/허리 단면 위에 재단해, 품을 바꿔도 장식이 몸판을 따른다. */
export function buildStudioVrmBlazerGeometry(shape: Shell, segments: number): THREE.BufferGeometry {
  const { profile, tailoring } = shape;
  const bottom = profile[0]!.y;
  const height = profile[profile.length - 1]!.y - bottom;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  function surface(t: number, angle: number, lift = 0): Point {
    const y = bottom + height * t;
    let index = 1;
    while (index < profile.length - 1 && profile[index]!.y < y) index++;
    const a = profile[index - 1]!;
    const b = profile[index]!;
    const w = THREE.MathUtils.clamp((y - a.y) / Math.max(1e-6, b.y - a.y), 0, 1);
    const radius = THREE.MathUtils.lerp(a.radius, b.radius, w);
    const depth = THREE.MathUtils.lerp(a.radius * (a.depth ?? 1), b.radius * (b.depth ?? 1), w);
    const x = THREE.MathUtils.lerp(a.centerX ?? 0, b.centerX ?? 0, w);
    const z = THREE.MathUtils.lerp(a.centerZ ?? 0, b.centerZ ?? 0, w);
    return [x + (radius + lift) * Math.sin(angle), y, z + (depth + lift) * Math.cos(angle)];
  }
  function grid(rows: number, columns: number, at: (row: number, u: number) => Point, reverse = false) {
    const base = positions.length / 3;
    for (let row = 0; row <= rows; row++) {
      for (let col = 0; col <= columns; col++) {
        positions.push(...at(row, col / columns));
        uvs.push(col / columns, row / rows);
        if (row === rows || col === columns) continue;
        const a = base + row * (columns + 1) + col;
        const b = a + 1;
        const c = a + columns + 1;
        const d = c + 1;
        if (reverse) indices.push(a, c, b, b, c, d);
        else indices.push(a, b, c, b, d, c);
      }
    }
  }
  if (tailoring === "blazer-body") {
    // 원래 단면의 모든 높이를 살리고 V 절개·밑단이 꺾이는 지점도 꼭짓점으로 남긴다.
    const rows = [...new Set([...profile.map((ring) => (ring.y - bottom) / height), 0.19, 0.48])].sort((a, b) => a - b);
    grid(rows.length - 1, segments, (i, u) => {
      const t = rows[i]!;
      const edge = opening(t);
      return surface(t, THREE.MathUtils.lerp(edge, 2 * Math.PI - edge, u));
    });
  } else if (tailoring === "blazer-facing") {
    // 안단을 접어 올린 높이와 바깥 가장자리 사이에 능선을 둔다. 노치에서 깃과 라펠이 만난다.
    const cuts = [[0.48, 0.01], [0.54, 0.085], [0.66, 0.22], [0.77, 0.32], [0.81, 0.41],
      [0.835, 0.23], [0.845, 0.39], [0.92, 0.33], [1, 0.16]] as const;
    for (const side of [1, -1]) {
      grid(cuts.length - 1, 4, (i, u) => {
        const [t, span] = cuts[i]!;
        const roll = 0.0045 + 0.012 * (1 - Math.abs(2 * u - 1));
        return surface(t, side * (opening(t) + span * u), roll * height);
      }, side < 0);
      // 허리 양쪽 웰트 포켓은 가슴·허리 곡면을 따라 눕는다.
      grid(1, 8, (i, u) => surface(0.266 + 0.022 * i + 0.03 * u,
        side * (0.39 + 0.56 * u), height * (0.007 + 0.003 * i)), side < 0);
    }
  } else {
    // 두 개의 얇은 금속 단추를 한 버퍼에 넣는다. 장착 후에도 몸판과 같은 높이의 스킨 웨이트를 갖는다.
    const radius = height * 0.013;
    for (const t of [0.455, 0.33]) {
      const [x, y, z] = surface(t, 0.042, height * 0.012);
      grid(8, 16, (row, u) => {
        const theta = Math.PI * row / 8;
        const phi = 2 * Math.PI * u;
        return [x + radius * Math.cos(phi) * Math.sin(theta), y + radius * Math.sin(phi) * Math.sin(theta),
          z + radius * 0.44 * Math.cos(theta)];
      }, true);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** 팔을 내리거나 들어도 소매산이 쇄골에서 삼각근을 돌아 자연스럽게 붙도록 세운다. */
export function shapeStudioVrmBlazerSleeveCap(
  centers: THREE.Vector3[],
  radii: number[],
  joint: THREE.Vector3,
  otherShoulder: THREE.Vector3,
  elbow: THREE.Vector3,
): number[] {
  const inset = otherShoulder.clone().sub(joint).multiplyScalar(0.23);
  const chestWeights: number[] = [];
  for (let i = 0; i < centers.length; i++) {
    const t = i / (centers.length - 1);
    // 소매산의 넓은 단면을 관절 위에 쌓지 않고 가슴 안쪽의 작은 단면에서 팔로 펼친다.
    const cap = 1 - THREE.MathUtils.smoothstep(t, 0, 0.30);
    centers[i]!.copy(joint).lerp(elbow, t).addScaledVector(inset, cap);
    radii[i]! *= 1 - 0.62 * cap;
    chestWeights.push(0.84 * cap);
  }
  return chestWeights;
}
