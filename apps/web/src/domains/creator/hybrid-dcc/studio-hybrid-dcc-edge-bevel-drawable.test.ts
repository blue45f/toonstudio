/**
 * 모서리 모따기 결과를 뷰포트가 실제로 그릴 수 있는가.
 *
 * 열린 메시를 돌려주던 결함을 고친 뒤에도, 삼각형·격자·안쪽 테두리를 낸 메시에서는 성공한 결과의 대부분이 뷰포트의
 * 부채꼴 삼각분할 검증을 통과하지 못해 오브젝트가 통째로 사라졌다(예: 큐브 → 윗면 안쪽 테두리 → 세로 모서리 모따기).
 * 닫힘·방향·넓이 검사만 보던 시험은 이를 잡지 못했다. 여기서는 성공한 모든 결과를 `renderableFaces: "all"` 로 그려 보고,
 * 안쪽 모서리에 남은 꼭짓점이 만든 뚜껑이 이웃 평면 면 위에 반대 방향으로 접히는 경우와 값이 너무 큰 경우는 이유 코드로 거절하는지 본다.
 *
 * 오목 모서리(구덩이 바닥, L 자 안쪽)를 깎으면 모서리를 메워 부피가 오히려 커진다. "부피가 줄어야 한다"는 검사를 그대로 두면
 * 정상 결과가 "값이 너무 크다"로 거절되므로, 오목 모서리가 끼면 부피 증가를 허용하는지, 원점에서 먼 입체와 면 꼭짓점 상한도 본다.
 */
import { describe, expect, it } from "vitest";

import {
  bevelStudioEditableMeshEdges,
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  insetStudioEditableMeshFaces,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import { analyzeStudioEditableMeshIntegrity, readStudioMeshFaceLoops } from "./studio-hybrid-dcc-face-modeling-mesh";
import { STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES } from "./studio-hybrid-dcc-polygon-validation";

function random(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const point = (x: number, y: number, z: number): StudioMeshVec3 => ({ x, y, z });

function outward(positions: StudioMeshVec3[], faces: number[][]): StudioEditableMesh {
  const mesh = createStudioEditableMeshFromPolygons(positions, faces);
  return analyzeStudioEditableMeshIntegrity(mesh).signedVolume > 0
    ? mesh
    : createStudioEditableMeshFromPolygons(positions, faces.map((face) => [...face].reverse()));
}

/** 정육면체의 모든 면을 삼각형 둘로 나눈다: 평평한 대각선 모서리가 꼭짓점마다 끼어 있다. */
function triangulatedCube(): StudioEditableMesh {
  const positions = [
    point(0, 0, 0), point(1, 0, 0), point(1, 1, 0), point(0, 1, 0),
    point(0, 0, 1), point(1, 0, 1), point(1, 1, 1), point(0, 1, 1),
  ];
  const quads = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]];
  return outward(positions, quads.flatMap((quad) => [[quad[0]!, quad[1]!, quad[2]!], [quad[0]!, quad[2]!, quad[3]!]]));
}

/** 면마다 3×3 칸으로 나눈 정육면체. */
function gridCube(): StudioEditableMesh {
  const cells = 3;
  const positions: StudioMeshVec3[] = [];
  const indexOf = new Map<string, number>();
  const at = (x: number, y: number, z: number): number => {
    const key = `${x},${y},${z}`;
    if (!indexOf.has(key)) {
      indexOf.set(key, positions.length);
      positions.push(point(x / cells, y / cells, z / cells));
    }
    return indexOf.get(key)!;
  };
  const faces: number[][] = [];
  for (let i = 0; i < cells; i += 1) {
    for (let j = 0; j < cells; j += 1) {
      faces.push([at(i, j, 0), at(i, j + 1, 0), at(i + 1, j + 1, 0), at(i + 1, j, 0)]);
      faces.push([at(i, j, cells), at(i + 1, j, cells), at(i + 1, j + 1, cells), at(i, j + 1, cells)]);
      faces.push([at(i, 0, j), at(i + 1, 0, j), at(i + 1, 0, j + 1), at(i, 0, j + 1)]);
      faces.push([at(i, cells, j), at(i, cells, j + 1), at(i + 1, cells, j + 1), at(i + 1, cells, j)]);
      faces.push([at(0, i, j), at(0, i, j + 1), at(0, i + 1, j + 1), at(0, i + 1, j)]);
      faces.push([at(cells, i, j), at(cells, i + 1, j), at(cells, i + 1, j + 1), at(cells, i, j + 1)]);
    }
  }
  return outward(positions, faces);
}

function pentagonalBipyramid(): StudioEditableMesh {
  const positions = [point(0, 1, 0), point(0, -1, 0)];
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    positions.push(point(Math.cos(angle), 0, Math.sin(angle)));
  }
  const faces: number[][] = [];
  for (let index = 0; index < 5; index += 1) {
    const from = 2 + index;
    const to = 2 + ((index + 1) % 5);
    faces.push([0, to, from], [1, from, to]);
  }
  return outward(positions, faces);
}

function octahedron(): StudioEditableMesh {
  const positions = [point(1, 0, 0), point(-1, 0, 0), point(0, 1, 0), point(0, -1, 0), point(0, 0, 1), point(0, 0, -1)];
  const faces: number[][] = [];
  for (const sx of [1, -1]) {
    for (const sy of [1, -1]) {
      for (const sz of [1, -1]) {
        const x = sx > 0 ? 0 : 1;
        const y = sy > 0 ? 2 : 3;
        const z = sz > 0 ? 4 : 5;
        faces.push(sx * sy * sz > 0 ? [x, y, z] : [x, z, y]);
      }
    }
  }
  return createStudioEditableMeshFromPolygons(positions, faces);
}

/** 윗면에 안쪽 테두리를 낸 정육면체: 윗면 고리의 연결 모서리가 두 평면 면 사이에 끼어 있다. */
function insetCube(): StudioEditableMesh {
  const cube = createStudioUnitCubeMesh();
  const top = readStudioMeshFaceLoops(cube)![1]!;
  const result = insetStudioEditableMeshFaces(cube, [top.id], 0.2);
  if (!result.ok) throw new Error(result.detail);
  return result.value;
}

const MESHES: readonly (readonly [string, () => StudioEditableMesh])[] = [
  ["삼각형 정육면체", triangulatedCube],
  ["3×3 격자 정육면체", gridCube],
  ["오각 쌍뿔", pentagonalBipyramid],
  ["정팔면체", octahedron],
  ["안쪽 테두리를 낸 정육면체", insetCube],
];

function halfEdgeBetween(mesh: StudioEditableMesh, from: number, to: number): number {
  const found = mesh.halfEdges.find((he) => he.vertex === to && mesh.halfEdges[he.prev]!.vertex === from);
  if (!found) throw new Error(`no half-edge ${from}->${to}`);
  return found.id;
}

/** 이웃 면과 이루는 각이 평평하지 않은(접힌) 반변: 실제로 깎을 만한 모서리. */
function creaseHalfEdges(mesh: StudioEditableMesh): number[] {
  const loops = readStudioMeshFaceLoops(mesh)!;
  const normalOf = (faceId: number): [number, number, number] => {
    const points = loops.find((loop) => loop.id === faceId)!.vertexIds.map((id) => mesh.vertices[id]!.position);
    let nx = 0;
    let ny = 0;
    let nz = 0;
    points.forEach((a, index) => {
      const b = points[(index + 1) % points.length]!;
      nx += (a.y - b.y) * (a.z + b.z);
      ny += (a.z - b.z) * (a.x + b.x);
      nz += (a.x - b.x) * (a.y + b.y);
    });
    const size = Math.hypot(nx, ny, nz) || 1;
    return [nx / size, ny / size, nz / size];
  };
  return mesh.halfEdges
    .filter((he) => {
      const twin = mesh.halfEdges[he.twin];
      if (!twin || twin.face === he.face) return false;
      const a = normalOf(he.face);
      const b = normalOf(twin.face);
      return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] < 0.99;
    })
    .map((he) => he.id);
}

/** 닫혀 있고, 방향이 맞고, 퇴화 면이 없고, 뷰포트가 모든 면을 그릴 수 있고, 부피가 양수다. */
function expectClosedDrawable(mesh: StudioEditableMesh, label: string): ReturnType<typeof analyzeStudioEditableMeshIntegrity> {
  const report = analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
  expect(report.canonical, `canonical ${label}`).toBe(true);
  expect(report.boundaryHalfEdges, `boundary ${label}`).toBe(0);
  expect(report.nonManifoldEdges, `non-manifold ${label}`).toBe(0);
  expect(report.orientationConflicts, `orientation ${label}`).toBe(0);
  expect(report.zeroAreaFaces, `zero-area ${label}`).toEqual([]);
  expect(report.duplicateVertexFaces, `duplicate ${label}`).toEqual([]);
  expect(report.bowTieVertices, `bow-tie ${label}`).toBe(0);
  expect(report.unrenderableFaces, `뷰포트가 그리지 못하는 면 ${label}`).toEqual([]);
  expect(report.signedVolume, `volume ${label}`).toBeGreaterThan(0);
  return report;
}

/** 위에 더해, 깎은 만큼 부피가 줄었다. */
function expectDrawableSolid(mesh: StudioEditableMesh, volumeBefore: number, label: string, strict = true): void {
  const report = expectClosedDrawable(mesh, label);
  // 평평한 모서리(이웃 면이 같은 평면)를 깎으면 부피가 그대로라 느슨하게, 접힌 모서리만 깎으면 반드시 줄어든다.
  if (strict) expect(report.signedVolume, `volume shrinks ${label}`).toBeLessThan(volumeBefore);
  else expect(report.signedVolume, `volume does not grow ${label}`).toBeLessThanOrEqual(volumeBefore * (1 + 1e-9));
}

describe("모서리 모따기: 뷰포트가 그릴 수 있는 결과", () => {
  it("큐브 → 윗면 안쪽 테두리 → 세로 모서리 4개 모따기(리뷰가 찾은 재현)는 오브젝트가 사라지지 않는다", () => {
    const mesh = insetCube();
    const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
    // 세로 모서리: 아래 꼭짓점 i → 윗 꼭짓점 i+4 (정육면체 0..3 이 아래, 4..7 이 위).
    const vertical = [0, 1, 2, 3].map((index) => halfEdgeBetween(mesh, index, index + 4));
    const result = bevelStudioEditableMeshEdges(mesh, vertical, 0.12);
    if (!result.ok) throw new Error(result.detail);
    expectDrawableSolid(result.value, volume, "inset cube vertical edges");
  });

  for (const [name, build] of MESHES) {
    it(`${name}: 접힌 모서리를 1~6개 무작위로 깎으면 항상 성공하고 모든 면을 그릴 수 있다`, () => {
      const mesh = build();
      const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
      const creases = creaseHalfEdges(mesh);
      const next = random(2026);
      for (let round = 0; round < 80; round += 1) {
        const count = 1 + Math.floor(next() * 6);
        const picked = new Set<number>();
        while (picked.size < count) picked.add(creases[Math.floor(next() * creases.length)]!);
        const result = bevelStudioEditableMeshEdges(mesh, [...picked], 0.12);
        if (!result.ok) throw new Error(`${name} round ${round} [${[...picked].join(",")}]: ${result.detail}`);
        expectDrawableSolid(result.value, volume, `${name} round ${round}`);
      }
    });

    it(`${name}: 평평한 모서리까지 섞어 깎아도 성공한 결과는 그릴 수 있고, 아니면 이유 코드로 거절한다`, () => {
      const mesh = build();
      const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
      const next = random(77);
      let succeeded = 0;
      for (let round = 0; round < 80; round += 1) {
        const count = 1 + Math.floor(next() * 6);
        const picked = new Set<number>();
        while (picked.size < count) picked.add(Math.floor(next() * mesh.halfEdges.length));
        const result = bevelStudioEditableMeshEdges(mesh, [...picked], 0.12);
        if (!result.ok) {
          expect(result.code, `${name} round ${round}`).toBe("topology-failed");
          continue;
        }
        succeeded += 1;
        expectDrawableSolid(result.value, volume, `${name} flat mix round ${round}`, false);
      }
      expect(succeeded, "성공한 경우가 있어야 이 시험이 헛돌지 않는다").toBeGreaterThan(0);
    });
  }

  it("좁은 고리 폭을 넘는 큰 값은 접힌 면을 만들지 않고 이유 코드로 거절한다", () => {
    const mesh = insetCube();
    const result = bevelStudioEditableMeshEdges(mesh, [halfEdgeBetween(mesh, 1, 5)], 0.3);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("topology-failed");
    expect(result.detail).toMatch(/folded|too large|cannot draw/u);
  });

  it("큰 값(0.4)으로 정팔면체를 전부 깎으면 부피가 음수가 되는 결과 대신 거절한다", () => {
    const mesh = octahedron();
    const everything = [...new Set(mesh.halfEdges.map((he) => Math.min(he.id, he.twin)))];
    const result = bevelStudioEditableMeshEdges(mesh, everything, 0.4);
    if (result.ok) {
      expect(analyzeStudioEditableMeshIntegrity(result.value).signedVolume).toBeGreaterThan(0);
    } else {
      expect(result.code).toBe("topology-failed");
    }
  });
});

/**
 * 한 변 3 짜리 정육면체 윗면에 1×1 구덩이를 판 입체. 모든 면이 볼록 사각형이고, 구덩이 바닥 테두리와 구덩이 벽 사이 세로 모서리가
 * 오목하다. 꼭짓점: 0~3 아래, 4~7 윗면 바깥 테두리, 8~11 구덩이 입구, 12~15 구덩이 바닥.
 */
function pitCube(floor = 2.4): StudioEditableMesh {
  const positions = [
    point(0, 0, 0), point(3, 0, 0), point(3, 3, 0), point(0, 3, 0),
    point(0, 0, 3), point(3, 0, 3), point(3, 3, 3), point(0, 3, 3),
    point(1, 1, 3), point(2, 1, 3), point(2, 2, 3), point(1, 2, 3),
    point(1, 1, floor), point(2, 1, floor), point(2, 2, floor), point(1, 2, floor),
  ];
  const faces = [
    [0, 3, 2, 1],
    [0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6], [3, 0, 4, 7],
    [4, 5, 9, 8], [5, 6, 10, 9], [6, 7, 11, 10], [7, 4, 8, 11],
    [13, 12, 8, 9], [14, 13, 9, 10], [15, 14, 10, 11], [12, 15, 11, 8],
    [12, 13, 14, 15],
  ];
  return outward(positions, faces);
}

/** 한 변 `size` 정육면체를 (offset, offset, offset) 만큼 옮긴 것. 원점에서 멀어도 모따기가 성공해야 한다. */
function farCube(offset: number, size: number): StudioEditableMesh {
  const corners = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
    [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ] as const;
  const positions = corners.map(([x, y, z]) => point(offset + x * size, offset + y * size, offset + z * size));
  return outward(positions, [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]]);
}

/** 정다각 기둥: 위·아래 면이 `sides` 개 꼭짓점을 가진 큰 면이다. */
function regularPrism(sides: number): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  for (const height of [0, 1]) {
    for (let index = 0; index < sides; index += 1) {
      const angle = (index / sides) * Math.PI * 2;
      positions.push(point(Math.cos(angle), Math.sin(angle), height));
    }
  }
  const faces: number[][] = [
    Array.from({ length: sides }, (_, index) => sides - 1 - index),
    Array.from({ length: sides }, (_, index) => sides + index),
  ];
  for (let index = 0; index < sides; index += 1) {
    const next = (index + 1) % sides;
    faces.push([index, next, next + sides, index + sides]);
  }
  return outward(positions, faces);
}

const PIT_AMOUNTS = [0.05, 0.1, 0.2, 0.3, 0.45] as const;

describe("모서리 모따기: 오목 모서리", () => {
  it("구덩이 바닥 테두리(오목)는 모든 값에서 성공하고 모서리를 메워 부피가 늘어난다", () => {
    const mesh = pitCube();
    const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
    const floorEdge = halfEdgeBetween(mesh, 12, 13);
    for (const amount of PIT_AMOUNTS) {
      const result = bevelStudioEditableMeshEdges(mesh, [floorEdge], amount);
      if (!result.ok) throw new Error(`amount ${amount}: ${result.detail}`);
      const report = expectClosedDrawable(result.value, `pit floor edge ${amount}`);
      expect(report.signedVolume, `volume grows ${amount}`).toBeGreaterThan(volume);
    }
  });

  it("구덩이 바닥 테두리 4개와 벽 사이 세로 모서리(둘 다 오목)도 성공하고 부피가 늘어난다", () => {
    const mesh = pitCube();
    const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
    const floorLoop = [[12, 13], [13, 14], [14, 15], [15, 12]].map(([from, to]) => halfEdgeBetween(mesh, from!, to!));
    const wallEdge = halfEdgeBetween(mesh, 8, 12);
    for (const [label, edges] of [["바닥 테두리 4개", floorLoop], ["벽 사이 세로 모서리", [wallEdge]]] as const) {
      const result = bevelStudioEditableMeshEdges(mesh, edges, 0.1);
      if (!result.ok) throw new Error(`${label}: ${result.detail}`);
      const report = expectClosedDrawable(result.value, label);
      expect(report.signedVolume, `volume grows ${label}`).toBeGreaterThan(volume);
    }
  });

  it("같은 입체의 볼록 모서리(구덩이 입구·바깥 세로)는 여전히 부피가 줄어든다", () => {
    const mesh = pitCube();
    const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
    for (const [label, edge] of [["구덩이 입구", halfEdgeBetween(mesh, 8, 9)], ["바깥 세로", halfEdgeBetween(mesh, 1, 5)]] as const) {
      const result = bevelStudioEditableMeshEdges(mesh, [edge], 0.1);
      if (!result.ok) throw new Error(`${label}: ${result.detail}`);
      expectDrawableSolid(result.value, volume, label);
    }
  });

  it("오목과 볼록 모서리를 함께 고르면 부피가 어느 쪽으로든 변해도 그릴 수 있는 입체만 돌려준다", () => {
    const mesh = pitCube();
    const result = bevelStudioEditableMeshEdges(mesh, [halfEdgeBetween(mesh, 12, 13), halfEdgeBetween(mesh, 10, 11)], 0.1);
    if (!result.ok) throw new Error(result.detail);
    expectClosedDrawable(result.value, "concave + convex");
  });

  it("L 자 기둥의 안쪽 세로 모서리(오목)도 깎이고 부피가 늘어난다", () => {
    const outline: [number, number][] = [[0, 0], [2, 0], [2, 1], [1, 1], [1, 2], [0, 2]];
    const positions = [0, 1].flatMap((z) => outline.map(([x, y]) => point(x, y, z)));
    const sides = outline.length;
    const faces: number[][] = [
      Array.from({ length: sides }, (_, index) => sides - 1 - index),
      Array.from({ length: sides }, (_, index) => sides + index),
    ];
    for (let index = 0; index < sides; index += 1) {
      const next = (index + 1) % sides;
      faces.push([index, next, next + sides, index + sides]);
    }
    const mesh = outward(positions, faces);
    const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
    // 오목 꼭짓점은 (1,1) = 3 번. 아래 3 → 위 9.
    const result = bevelStudioEditableMeshEdges(mesh, [halfEdgeBetween(mesh, 3, 9)], 0.2);
    if (!result.ok) throw new Error(result.detail);
    // 위·아래 L 자 면은 오목 다각형이라 뷰포트 부채꼴로 그려지지 않는 것이 원래 입체의 성질이므로 닫힘·부피만 본다.
    const report = analyzeStudioEditableMeshIntegrity(result.value);
    expect(report.canonical).toBe(true);
    expect(report.boundaryHalfEdges).toBe(0);
    expect(report.signedVolume).toBeGreaterThan(volume);
  });
});

describe("모서리 모따기: 원점에서 먼 입체와 면 꼭짓점 상한", () => {
  for (const [offset, size] of [[1e5, 1], [1e6, 1], [1e7, 1], [1e7, 1e-3]] as const) {
    it(`원점에서 ${offset} 떨어진 변 ${size} 정육면체의 모서리도 깎인다`, () => {
      const mesh = farCube(offset, size);
      const volume = analyzeStudioEditableMeshIntegrity(mesh).signedVolume;
      expect(volume).toBeGreaterThan(0);
      const result = bevelStudioEditableMeshEdges(mesh, [halfEdgeBetween(mesh, 1, 5)], 0.1);
      if (!result.ok) throw new Error(result.detail);
      expectDrawableSolid(result.value, volume, `far cube ${offset}/${size}`);
    });
  }

  it("깎아서 한 면이 뷰포트 상한을 넘는 꼭짓점을 갖게 되면 이유 코드로 거절하고, 상한 안이면 성공한다", () => {
    const limit = STUDIO_HYBRID_DCC_MAX_FACE_LOOP_VERTICES;
    // 위·아래 면이 limit - 1 개: 세로 모서리를 깎으면 limit 개가 되어 그릴 수 있다.
    const fits = regularPrism(limit - 1);
    const fitsResult = bevelStudioEditableMeshEdges(fits, [halfEdgeBetween(fits, 0, limit - 1)], 0.1);
    if (!fitsResult.ok) throw new Error(fitsResult.detail);
    const widest = Math.max(...readStudioMeshFaceLoops(fitsResult.value)!.map((loop) => loop.vertexIds.length));
    expect(widest).toBe(limit);
    expectClosedDrawable(fitsResult.value, "prism at the limit");

    // 위·아래 면이 limit 개: 하나 늘어 limit + 1 개가 되므로 뷰포트가 버릴 면을 만들지 않고 거절한다.
    const over = regularPrism(limit);
    const overResult = bevelStudioEditableMeshEdges(over, [halfEdgeBetween(over, 0, limit)], 0.1);
    expect(overResult.ok).toBe(false);
    if (overResult.ok) return;
    expect(overResult.code).toBe("topology-failed");
    expect(overResult.detail).toContain(String(limit));
  });
});
