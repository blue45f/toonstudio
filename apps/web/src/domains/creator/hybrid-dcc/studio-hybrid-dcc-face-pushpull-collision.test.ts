import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import { drawStudioEditableMeshFacePolygon, describeStudioEditableMeshFaceForDrawing } from "./studio-hybrid-dcc-face-modeling-draw";
import { insetStudioEditableMeshFacesByDistance, studioEditableMeshInsetRange } from "./studio-hybrid-dcc-face-modeling-kernel";
import { analyzeStudioEditableMeshIntegrity, readStudioMeshFaceLoops, type StudioFaceModelingResult } from "./studio-hybrid-dcc-face-modeling-mesh";
import { pushPullStudioEditableMeshFaces, studioEditableMeshPushPullRange } from "./studio-hybrid-dcc-face-pushpull";

/**
 * 밀기/당기기가 만든 면이 다른 면을 뚫지 않는지 시험한다. 닫힘·부피 같은 위상 검사는 면이 서로 관통해도
 * 통과하므로(뿔대 옆면을 안쪽으로 당기면 새 바닥이 입체 밖으로 나가도 위상은 멀쩡하다), 여기서는 커널
 * 안의 검사와 따로 쓴 삼각형 교차 판정을 오라클로 둔다.
 */

type Point2 = readonly [number, number];

interface Vec {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

const subtract = (a: Vec, b: Vec): Vec => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const dotOf = (a: Vec, b: Vec): number => a.x * b.x + a.y * b.y + a.z * b.z;
const crossOf = (a: Vec, b: Vec): Vec => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });

/** 선분 p-q 가 삼각형 abc 의 안쪽(가장자리에서 eps 이상 떨어진 곳)을 가로지르는지. */
function segmentCrossesTriangle(p: Vec, q: Vec, a: Vec, b: Vec, c: Vec, eps: number): boolean {
  const direction = subtract(q, p);
  const edge1 = subtract(b, a);
  const edge2 = subtract(c, a);
  const h = crossOf(direction, edge2);
  const determinant = dotOf(edge1, h);
  if (Math.abs(determinant) < 1e-14) return false;
  const inverse = 1 / determinant;
  const s = subtract(p, a);
  const u = dotOf(s, h) * inverse;
  if (u < eps || u > 1 - eps) return false;
  const r = crossOf(s, edge1);
  const w = dotOf(direction, r) * inverse;
  if (w < eps || u + w > 1 - eps) return false;
  const t = dotOf(edge2, r) * inverse;
  return t > eps && t < 1 - eps;
}

/** 서로 다른 면의 삼각형 쌍 가운데 정점을 공유하지 않으면서 가로지르는 쌍의 수(독립 오라클). */
function countCrossingTrianglePairs(mesh: StudioEditableMesh): number {
  const triangles: { face: number; ids: number[]; points: Vec[] }[] = [];
  for (const loop of readStudioMeshFaceLoops(mesh)!) {
    for (let corner = 1; corner + 1 < loop.vertexIds.length; corner += 1) {
      const ids = [loop.vertexIds[0]!, loop.vertexIds[corner]!, loop.vertexIds[corner + 1]!];
      triangles.push({ face: loop.id, ids, points: ids.map((id) => mesh.vertices[id]!.position) });
    }
  }
  let pairs = 0;
  for (let i = 0; i < triangles.length; i += 1) {
    for (let j = i + 1; j < triangles.length; j += 1) {
      const first = triangles[i]!;
      const second = triangles[j]!;
      if (first.face === second.face || first.ids.some((id) => second.ids.includes(id))) continue;
      let hit = false;
      for (let k = 0; k < 3 && !hit; k += 1) {
        hit = segmentCrossesTriangle(first.points[k]!, first.points[(k + 1) % 3]!, second.points[0]!, second.points[1]!, second.points[2]!, 1e-7);
      }
      for (let k = 0; k < 3 && !hit; k += 1) {
        hit = segmentCrossesTriangle(second.points[k]!, second.points[(k + 1) % 3]!, first.points[0]!, first.points[1]!, first.points[2]!, 1e-7);
      }
      if (hit) pairs += 1;
    }
  }
  return pairs;
}

/** 꼭짓점이 반시계인 볼록 다각형 밑면을 높이만큼 세운 닫힌 기둥. 윗면 다각형을 따로 주면 뿔대가 된다. 면 0=밑면, 1=윗면, 2..=옆면. */
function prism(poly: readonly Point2[], height: number, topPoly: readonly Point2[] = poly): StudioEditableMesh {
  const count = poly.length;
  const positions: StudioMeshVec3[] = [
    ...poly.map(([x, y]) => ({ x, y, z: 0 })),
    ...topPoly.map(([x, y]) => ({ x, y, z: height })),
  ];
  const faces = [
    Array.from({ length: count }, (_, index) => count - 1 - index),
    Array.from({ length: count }, (_, index) => count + index),
    ...poly.map((_, index) => {
      const next = (index + 1) % count;
      return [index, next, count + next, count + index];
    }),
  ];
  return createStudioEditableMeshFromPolygons(positions, faces);
}

const square = (half: number): Point2[] => [[-half, -half], [half, -half], [half, half], [-half, half]];

function regularPolygon(corners: number, radius: number): Point2[] {
  return Array.from({ length: corners }, (_, index) => [
    Math.cos((index * Math.PI * 2) / corners) * radius,
    Math.sin((index * Math.PI * 2) / corners) * radius,
  ] as const);
}

/** 사각뿔: 면 0=밑면, 1..4=옆면. */
function pyramid(): StudioEditableMesh {
  return createStudioEditableMeshFromPolygons(
    [{ x: -1, y: -1, z: 0 }, { x: 1, y: -1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: -1, y: 1, z: 0 }, { x: 0, y: 0, z: 1.5 }],
    [[0, 3, 2, 1], [0, 1, 4], [1, 2, 4], [2, 3, 4], [3, 0, 4]],
  );
}

/** 윗면을 n x n 칸으로 나눈 상자(가로세로 2, 높이 1). 면 0..n*n-1 은 윗면 칸((i, j)칸은 j*n+i), 그다음 밑면, 그다음 옆면이다. */
function gridTopBox(n: number): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  const at = (i: number, j: number) => j * (n + 1) + i;
  for (let j = 0; j <= n; j += 1) {
    for (let i = 0; i <= n; i += 1) positions.push({ x: -1 + (2 * i) / n, y: -1 + (2 * j) / n, z: 1 });
  }
  const faces: number[][] = [];
  for (let j = 0; j < n; j += 1) {
    for (let i = 0; i < n; i += 1) faces.push([at(i, j), at(i + 1, j), at(i + 1, j + 1), at(i, j + 1)]);
  }
  const ring: number[] = [];
  for (let i = 0; i < n; i += 1) ring.push(at(i, 0));
  for (let j = 0; j < n; j += 1) ring.push(at(n, j));
  for (let i = n; i > 0; i -= 1) ring.push(at(i, n));
  for (let j = n; j > 0; j -= 1) ring.push(at(0, j));
  const bottom = ring.map((id) => {
    positions.push({ ...positions[id]!, z: 0 });
    return positions.length - 1;
  });
  faces.push([...bottom].reverse());
  ring.forEach((top, k) => {
    const next = (k + 1) % ring.length;
    faces.push([top, bottom[k]!, bottom[next]!, ring[next]!]);
  });
  return createStudioEditableMeshFromPolygons(positions, faces);
}

/**
 * 한 변 1인 상자 두 개를 x 방향으로 `gap` 만큼 띄워 한 메시에 담는다. 앞 6개 면이 첫 상자, 뒤 6개 면이 둘째 상자다.
 * 면 순서는 0=밑면(-z), 1=윗면(+z), 2=앞(-y), 3=뒤(+y), 4=왼쪽(-x), 5=오른쪽(+x).
 */
function twoBoxes(gap: number): StudioEditableMesh {
  const corners = (shift: number): StudioMeshVec3[] => [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ].map(([x, y, z]) => ({ x: x! + shift, y: y!, z: z! }));
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  return createStudioEditableMeshFromPolygons(
    [...corners(0), ...corners(1 + gap)],
    [...faces, ...faces.map((face) => face.map((index) => index + 8))],
  );
}

/** 한 변 1인 상자 두 개가 모서리 꼭짓점 하나(정점 ID 공유)로만 맞닿아 있다. 면 1=첫 상자 윗면, 면 6=둘째 상자 밑면. */
function boxesSharingOneCorner(): StudioEditableMesh {
  const first: StudioMeshVec3[] = [
    [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
  ].map(([x, y, z]) => ({ x: x!, y: y!, z: z! }));
  const second: StudioMeshVec3[] = [[1, 0, 0], [1, 1, 0], [0, 1, 0], [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1]]
    .map(([x, y, z]) => ({ x: x! + 1, y: y! + 1, z: z! + 1 }));
  const faces = [[0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5]];
  // 둘째 상자의 (0,0,0) 모서리는 첫 상자의 정점 6(1,1,1)과 같은 정점이다.
  const remap = (index: number) => (index === 0 ? 6 : 8 + index - 1);
  return createStudioEditableMeshFromPolygons([...first, ...second], [...faces, ...faces.map((face) => face.map(remap))]);
}

function expectOk<T>(result: StudioFaceModelingResult<T>): T {
  if (!result.ok) throw new Error(`expected ok but got ${result.code}: ${result.detail}`);
  return result.value;
}

function expectFailure(result: StudioFaceModelingResult<unknown>, code: string) {
  expect(result.ok, `expected ${code} but the operation succeeded`).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.code).toBe(code);
  return result;
}

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("오라클 자체 확인", () => {
  it("정상 입체는 교차가 없고 밑면을 위로 뚫고 올린 입체는 교차가 센다", () => {
    expect(countCrossingTrianglePairs(createStudioUnitCubeMesh())).toBe(0);
    expect(countCrossingTrianglePairs(prism(square(1), 1.5, square(0.5)))).toBe(0);
    // 윗면 꼭짓점 하나를 밑면 아래로 끌어내리면 옆면이 밑면을 가로지른다.
    const broken = prism(square(1), 1);
    const pulled = {
      ...broken,
      vertices: broken.vertices.map((vertex) => (vertex.id === 5 ? { ...vertex, position: { x: 0.2, y: -0.2, z: -0.8 } } : vertex)),
    };
    expect(countCrossingTrianglePairs(pulled)).toBeGreaterThan(0);
  });
});

describe("밀기/당기기가 새 면으로 입체를 뚫는 방향을 거부한다", () => {
  it("윗면이 작은 뿔대의 옆면을 안쪽으로 당기면 새 바닥이 입체 밖으로 나가므로 거부하고 범위도 0이다", () => {
    const frustum = prism(square(1), 1.5, square(0.5));
    const range = expectOk(studioEditableMeshPushPullRange(frustum, [2]));
    expect(range).toMatchObject({ method: "extrude", minDistance: 0, pullLimitedBy: "overlap" });
    expect(range.maxDistance).toBeGreaterThan(0);
    for (const distance of [-0.2, -0.593, -1e-3]) {
      const refused = expectFailure(pushPullStudioEditableMeshFaces(frustum, [2], distance), "would-collide");
      if (!refused.ok) expect(refused.maxDistance).toBe(0);
    }
    // 같은 면을 밖으로 밀면 새 면이 입체 밖에 생기므로 교차가 없다.
    const pushed = expectOk(pushPullStudioEditableMeshFaces(frustum, [2], 0.4));
    expect(countCrossingTrianglePairs(pushed.mesh)).toBe(0);
  });

  it("밑면은 옆면이 안쪽으로 기울어 있으니 위로 당길 수 없고, 윗면은 수직 구덩이가 입체 안에 남는 만큼 당길 수 있다", () => {
    const frustum = prism(square(1), 1.5, square(0.5));
    expect(expectOk(studioEditableMeshPushPullRange(frustum, [0])).minDistance).toBe(0);
    expectFailure(pushPullStudioEditableMeshFaces(frustum, [0], -0.2), "would-collide");
    const range = expectOk(studioEditableMeshPushPullRange(frustum, [1]));
    expect(range.pullLimitedBy).toBe("clearance");
    expect(-range.minDistance).toBeGreaterThan(1.49);
    expect(-range.minDistance).toBeLessThan(1.5);
    const pit = expectOk(pushPullStudioEditableMeshFaces(frustum, [1], range.minDistance));
    expect(countCrossingTrianglePairs(pit.mesh)).toBe(0);
    expectFailure(pushPullStudioEditableMeshFaces(frustum, [1], range.minDistance * 1.01), "would-collide");
  });

  it("윗면이 더 넓은 뿔대는 반대로 윗면을 당길 수 없고 밑면은 당길 수 있다", () => {
    const overhang = prism(square(0.5), 1.5, square(1));
    expectFailure(pushPullStudioEditableMeshFaces(overhang, [1], -0.2), "would-collide");
    const range = expectOk(studioEditableMeshPushPullRange(overhang, [0]));
    expect(range.pullLimitedBy).toBe("clearance");
    const pit = expectOk(pushPullStudioEditableMeshFaces(overhang, [0], range.minDistance));
    expect(countCrossingTrianglePairs(pit.mesh)).toBe(0);
  });

  it("사각뿔 옆면과 밑면은 아무리 깊게 당겨도(-500 m 포함) 거부한다", () => {
    const cone = pyramid();
    for (const face of [0, 1, 2, 3, 4]) {
      for (const distance of [-0.1, -1, -500]) {
        expectFailure(pushPullStudioEditableMeshFaces(cone, [face], distance), "would-collide");
      }
    }
    expectOk(pushPullStudioEditableMeshFaces(cone, [1], 0.3));
  });

  it("큐브 모서리의 세 면은 밀 수 있지만 안쪽으로 당기면 이웃 면 밖으로 나가므로 거부한다", () => {
    const cube = createStudioUnitCubeMesh();
    const loops = readStudioMeshFaceLoops(cube)!;
    const cornerFaces = loops.filter((loop) => loop.vertexIds.includes(0)).map((loop) => loop.id);
    expect(cornerFaces).toHaveLength(3);
    const range = expectOk(studioEditableMeshPushPullRange(cube, cornerFaces));
    expect(range).toMatchObject({ method: "extrude", minDistance: 0, pullLimitedBy: "overlap" });
    expectFailure(pushPullStudioEditableMeshFaces(cube, cornerFaces, -0.1), "would-collide");
    const pushed = expectOk(pushPullStudioEditableMeshFaces(cube, cornerFaces, 0.3));
    expect(countCrossingTrianglePairs(pushed.mesh)).toBe(0);
  });

  it("마주 보는 두 면을 함께 당기면 서로 닿기 전(절반 깊이)까지만 되고 한계값을 알린다", () => {
    const cube = createStudioUnitCubeMesh();
    const range = expectOk(studioEditableMeshPushPullRange(cube, [0, 1]));
    expect(range.method).toBe("stretch");
    expect(range.pullLimitedBy).toBe("clearance");
    expect(-range.minDistance).toBeGreaterThan(0.499);
    expect(-range.minDistance).toBeLessThan(0.5);
    const both = expectOk(pushPullStudioEditableMeshFaces(cube, [0, 1], range.minDistance));
    expect(countCrossingTrianglePairs(both.mesh)).toBe(0);
    const refused = expectFailure(pushPullStudioEditableMeshFaces(cube, [0, 1], -0.5), "would-collide");
    if (!refused.ok) expect(refused.maxDistance).toBeCloseTo(-range.minDistance, 12);
    // 반대로 밀면 서로 멀어지므로 도구 최대 거리까지 열려 있다.
    expect(range.maxDistance).toBe(1000);
  });

  it("마주 보는 두 면과 그 둘을 잇는 면(ㄷ자)처럼 한 방향으로 움직일 수 없는 선택은 처음부터 지원하지 않는다", () => {
    const cube = createStudioUnitCubeMesh();
    const range = expectOk(studioEditableMeshPushPullRange(cube, [0, 1, 2]));
    expect(range).toMatchObject({ minDistance: 0, maxDistance: 0, pullLimitedBy: "region", pushLimitedBy: "region" });
    for (const distance of [0.2, -0.2]) {
      const refused = expectFailure(pushPullStudioEditableMeshFaces(cube, [0, 1, 2], distance), "unsupported-region");
      if (!refused.ok) expect(refused.elementIds).toEqual([0, 1, 2]);
    }
  });
});

describe("밀기/당기기가 다른 물체와 한 덩어리로 움직일 수 없는 선택", () => {
  it("다른 물체 앞에서는 여유를 남기고 멈춘다(밀기)", () => {
    const boxes = twoBoxes(1);
    const range = expectOk(studioEditableMeshPushPullRange(boxes, [5]));
    expect(range).toMatchObject({ method: "stretch", pushLimitedBy: "clearance" });
    expect(range.maxDistance).toBeGreaterThan(0.999);
    expect(range.maxDistance).toBeLessThan(1);
    const reached = expectOk(pushPullStudioEditableMeshFaces(boxes, [5], range.maxDistance));
    expect(countCrossingTrianglePairs(reached.mesh)).toBe(0);
    // 상대 면에 닿는 거리(1)와 그 너머는 거부하고, 허용 최대 거리를 알린다.
    for (const distance of [1, 1.5]) {
      const refused = expectFailure(pushPullStudioEditableMeshFaces(boxes, [5], distance), "would-collide");
      if (!refused.ok) expect(refused.maxDistance).toBeCloseTo(range.maxDistance, 12);
    }
    // 상자를 서로 마주 보는 두 면으로 함께 밀면 둘이 다가오므로 절반 거리까지만 된다.
    const facing = expectOk(studioEditableMeshPushPullRange(boxes, [5, 10]));
    expect(facing.maxDistance).toBeGreaterThan(0.499);
    expect(facing.maxDistance).toBeLessThan(0.5);
  });

  it("서로 다른 영역이 꼭짓점 하나로만 맞닿아 있으면 함께 움직일 수 없다", () => {
    const touching = boxesSharingOneCorner();
    expect(expectOk(studioEditableMeshPushPullRange(touching, [1, 6]))).toMatchObject({ minDistance: 0, maxDistance: 0 });
    for (const distance of [0.2, -0.2]) expectFailure(pushPullStudioEditableMeshFaces(touching, [1, 6], distance), "unsupported-region");
  });

  it("떨어져 있고 이동 축이 나란하지 않은 두 영역은 함께 움직일 수 없다", () => {
    const hexagon = prism(regularPolygon(6, 1), 1);
    // 면 2·4는 육각기둥의 옆면으로, 사이에 면 3을 두고 있어 꼭짓점도 공유하지 않는다.
    expect(expectOk(studioEditableMeshPushPullRange(hexagon, [2, 4]))).toMatchObject({ minDistance: 0, maxDistance: 0, pushLimitedBy: "region" });
    expectFailure(pushPullStudioEditableMeshFaces(hexagon, [2, 4], 0.3), "unsupported-region");
    // 이동 축이 나란한 윗면과 밑면은 함께 움직인다.
    expectOk(pushPullStudioEditableMeshFaces(hexagon, [0, 1], 0.3));
  });

  it("영역 경계가 같은 꼭짓점을 두 번 지나면(칸 두 개가 대각선으로만 이어짐) 지원하지 않는다", () => {
    const grid = gridTopBox(3);
    // 3x3 칸에서 (0,0)칸과 (1,1)칸만 빼면 나머지 7칸은 한 영역이지만 (1,1) 꼭짓점에서 경계가 두 번 만난다.
    const pinched = [1, 2, 3, 5, 6, 7, 8];
    expect(expectOk(studioEditableMeshPushPullRange(grid, pinched))).toMatchObject({ minDistance: 0, maxDistance: 0 });
    expectFailure(pushPullStudioEditableMeshFaces(grid, pinched, 0.2), "unsupported-region");
    // 한 칸(0번)을 더 골라 가운데 칸 하나만 비면 경계가 바깥 고리와 안쪽 고리로 나뉘어 단순하므로 밀 수 있다.
    expectOk(pushPullStudioEditableMeshFaces(grid, [0, ...pinched], 0.2));
    expectOk(pushPullStudioEditableMeshFaces(grid, [0, 1, 2], 0.2));
  });
});

describe("무작위 입체에서 성공한 결과에는 자기 교차가 없다(시드 고정)", () => {
  const solids: Record<string, StudioEditableMesh> = {
    큐브: createStudioUnitCubeMesh(),
    "뿔대(윗면 작음)": prism(square(1), 1.5, square(0.5)),
    "뿔대(윗면 큼)": prism(square(0.5), 1.5, square(1)),
    삼각기둥: prism([[0, 0], [2, 0], [1, 1.5]], 1.2),
    오각기둥: prism([[0, 0], [2, 0], [2, 1.5], [1, 2.4], [0, 1.5]], 2),
    육각기둥: prism(regularPolygon(6, 1), 1),
    사각뿔: pyramid(),
  };

  it("범위 안의 요청은 모두 성공하고, 성공한 결과는 오라클 교차 0·닫힌 입체이며, 범위를 넘으면 거부된다", () => {
    const random = seededRandom(424242);
    let accepted = 0;
    let refusedBeyond = 0;
    let multiFace = 0;
    for (const [name, mesh] of Object.entries(solids)) {
      for (let round = 0; round < 90; round += 1) {
        const count = 1 + Math.floor(random() * Math.min(3, mesh.faces.length));
        const faceIds = [...new Set(Array.from({ length: count }, () => Math.floor(random() * mesh.faces.length)))];
        const range = studioEditableMeshPushPullRange(mesh, faceIds);
        if (!range.ok) continue;
        for (const limit of [range.value.minDistance, Math.min(range.value.maxDistance, 3)]) {
          if (Math.abs(limit) < 2e-4) continue;
          const distance = limit * (0.1 + 0.9 * random());
          if (Math.abs(distance) < 1e-4) continue;
          const outcome = pushPullStudioEditableMeshFaces(mesh, faceIds, distance);
          const label = `${name} faces=[${faceIds}] d=${distance}`;
          expect(outcome.ok, `${label}: ${outcome.ok ? "" : `${outcome.code} ${outcome.detail}`}`).toBe(true);
          if (!outcome.ok) continue;
          accepted += 1;
          if (faceIds.length > 1) multiFace += 1;
          expect(countCrossingTrianglePairs(outcome.value.mesh), `${label}: 자기 교차`).toBe(0);
          const integrity = analyzeStudioEditableMeshIntegrity(outcome.value.mesh, { renderableFaces: "all" });
          expect(integrity.closed, `${label}: 닫힘`).toBe(true);
          expect(integrity.zeroAreaFaces, `${label}: 넓이 0`).toEqual([]);
        }
        // 범위를 한 칸이라도 넘는 거리는 거부된다(상한이 도구 최대 거리일 때는 건너뛴다).
        const beyondPull = range.value.minDistance * 1.02 - 2e-3;
        if (range.value.minDistance > -100 && !pushPullStudioEditableMeshFaces(mesh, faceIds, beyondPull).ok) refusedBeyond += 1;
      }
    }
    expect(accepted).toBeGreaterThan(500);
    expect(multiFace).toBeGreaterThan(250);
    expect(refusedBeyond).toBeGreaterThan(500);
  });

  it("큐브 면의 모든 부분집합(63개)에서 범위 안은 성공하고 범위 밖은 거부되며 성공한 결과에 교차가 없다", () => {
    const cube = createStudioUnitCubeMesh();
    let checkedSubsets = 0;
    let closedSides = 0;
    for (let mask = 1; mask < 1 << cube.faces.length; mask += 1) {
      const faceIds = cube.faces.map((face) => face.id).filter((id) => (mask & (1 << id)) !== 0);
      const range = studioEditableMeshPushPullRange(cube, faceIds);
      if (!range.ok) continue;
      checkedSubsets += 1;
      // 당기기: 한계가 0이면 아무 거리도 안 되고, 아니면 한계 안은 되고 한계를 넘으면 안 된다.
      const pull = range.value.minDistance;
      if (pull === 0) {
        closedSides += 1;
        expect(pushPullStudioEditableMeshFaces(cube, faceIds, -0.1).ok, `[${faceIds}] 당기기 범위 0`).toBe(false);
      } else {
        for (const fraction of [0.3, 0.999]) {
          const outcome = pushPullStudioEditableMeshFaces(cube, faceIds, pull * fraction);
          expect(outcome.ok, `[${faceIds}] d=${pull * fraction}`).toBe(true);
          if (outcome.ok) expect(countCrossingTrianglePairs(outcome.value.mesh), `[${faceIds}] 자기 교차`).toBe(0);
        }
        expect(pushPullStudioEditableMeshFaces(cube, faceIds, pull * 1.2 - 1e-3).ok, `[${faceIds}] 당기기 범위 밖`).toBe(false);
      }
      const push = range.value.maxDistance;
      if (push === 0) {
        closedSides += 1;
        expect(pushPullStudioEditableMeshFaces(cube, faceIds, 0.1).ok, `[${faceIds}] 밀기 범위 0`).toBe(false);
      } else {
        for (const fraction of [0.3, 0.999]) {
          const outcome = pushPullStudioEditableMeshFaces(cube, faceIds, Math.min(push, 2) * fraction);
          expect(outcome.ok, `[${faceIds}] d=${Math.min(push, 2) * fraction}`).toBe(true);
          if (outcome.ok) expect(countCrossingTrianglePairs(outcome.value.mesh), `[${faceIds}] 자기 교차`).toBe(0);
        }
        if (push < 1000) {
          expect(pushPullStudioEditableMeshFaces(cube, faceIds, push * 1.2 + 1e-3).ok, `[${faceIds}] 밀기 범위 밖`).toBe(false);
        }
      }
    }
    // 63개 가운데 마주 보는 면 쌍이 고리를 이루는 4개는 영역 법선이 정해지지 않아 범위 계산부터 거부된다.
    expect(checkedSubsets).toBe(59);
    expect(closedSides).toBeGreaterThan(40);
  });

  it("그리기·안쪽 테두리·밀기/당기기를 섞어 이어서 편집해도 매 단계 교차가 없고 범위 안 요청은 거부되지 않는다", () => {
    const random = seededRandom(5);
    let pushPulls = 0;
    let insets = 0;
    let drawings = 0;
    for (let round = 0; round < 70; round += 1) {
      const names = Object.keys(solids);
      let mesh = solids[names[Math.floor(random() * names.length)]!]!;
      for (let step = 0; step < 8; step += 1) {
        const loops = readStudioMeshFaceLoops(mesh)!;
        const face = loops[Math.floor(random() * loops.length)]!;
        const choice = random();
        const label = `round ${round} step ${step}`;
        if (choice < 0.25) {
          const limit = studioEditableMeshInsetRange(mesh, [face.id]);
          if (!limit.ok) continue;
          const distance = limit.value.maxDistance * (0.1 + 0.5 * random());
          if (distance < 2e-4) continue;
          const inset = insetStudioEditableMeshFacesByDistance(mesh, [face.id], distance);
          if (!inset.ok) continue;
          mesh = inset.value.mesh;
          insets += 1;
        } else if (choice < 0.4) {
          const guide = describeStudioEditableMeshFaceForDrawing(mesh, face.id);
          if (!guide.ok) continue;
          const outline = guide.value.outline;
          const cx = outline.reduce((sum, point) => sum + point[0], 0) / outline.length;
          const cy = outline.reduce((sum, point) => sum + point[1], 0) / outline.length;
          const radius = 0.25 * Math.min(...outline.map((point) => Math.hypot(point[0] - cx, point[1] - cy)));
          const corners = 3 + Math.floor(random() * 3);
          const points: Point2[] = Array.from({ length: corners }, (_, index) => {
            const angle = (index * Math.PI * 2) / corners + random() * 0.2;
            return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius] as const;
          });
          const drawn = drawStudioEditableMeshFacePolygon(mesh, face.id, points);
          if (!drawn.ok) continue;
          mesh = drawn.value.mesh;
          drawings += 1;
        } else {
          const count = random() < 0.8 ? 1 : 2;
          const faceIds = [...new Set(Array.from({ length: count }, () => loops[Math.floor(random() * loops.length)]!.id))];
          const range = studioEditableMeshPushPullRange(mesh, faceIds);
          if (!range.ok) continue;
          const limit = random() < 0.5 ? range.value.minDistance : Math.min(range.value.maxDistance, 2);
          if (Math.abs(limit) < 3e-4) continue;
          const distance = limit * (0.1 + 0.85 * random());
          const outcome = pushPullStudioEditableMeshFaces(mesh, faceIds, distance);
          expect(outcome.ok, `${label}: faces=[${faceIds}] d=${distance}: ${outcome.ok ? "" : outcome.code}`).toBe(true);
          if (!outcome.ok) continue;
          mesh = outcome.value.mesh;
          pushPulls += 1;
        }
        expect(countCrossingTrianglePairs(mesh), `${label}: 자기 교차`).toBe(0);
        const integrity = analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
        expect(integrity.closed, `${label}: 닫힘`).toBe(true);
        expect(integrity.zeroAreaFaces, `${label}: 넓이 0`).toEqual([]);
        expect(integrity.unrenderableFaces, `${label}: 그릴 수 없는 면`).toEqual([]);
      }
    }
    expect(pushPulls).toBeGreaterThan(150);
    expect(insets).toBeGreaterThan(100);
    expect(drawings).toBeGreaterThan(50);
  });
});
