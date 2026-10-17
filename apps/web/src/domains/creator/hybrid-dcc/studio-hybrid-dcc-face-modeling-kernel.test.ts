import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  deserializeStudioEditableMesh,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import {
  convexPolygonInsetMargin,
  type StudioPlanarPoint,
} from "./studio-hybrid-dcc-face-modeling-geometry";
import {
  describeStudioEditableMeshFaceForDrawing,
  drawStudioEditableMeshFacePolygon,
} from "./studio-hybrid-dcc-face-modeling-draw";
import {
  insetStudioEditableMeshFacesByDistance,
  offsetStudioEditableMeshFace,
  studioEditableMeshOffsetRange,
  type StudioOffsetDirection,
} from "./studio-hybrid-dcc-face-modeling-kernel";
import {
  analyzeStudioEditableMeshIntegrity,
  findRenderableStartCorner,
  readStudioMeshFaceLoops,
  type StudioFaceModelingOutcome,
  type StudioFaceModelingResult,
  type StudioMeshIntegrityReport,
} from "./studio-hybrid-dcc-face-modeling-mesh";

/** 시드를 고정한 의사 난수(mulberry32). 시험이 매번 같은 입력을 보게 한다. */
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

function expectOk<T>(result: StudioFaceModelingResult<T>): T {
  if (!result.ok) throw new Error(`expected ok but got ${result.code}: ${result.detail}`);
  return result.value;
}

function expectFailure(result: StudioFaceModelingResult<unknown>, code: string) {
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error("unreachable");
  expect(result.code).toBe(code);
  return result;
}

function fullReport(mesh: StudioEditableMesh): StudioMeshIntegrityReport {
  return analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
}

/** 닫힘·방향·퇴화·평면·볼록·렌더 가능성·나비넥타이·오일러 수가 입력과 같은지 한 번에 확인한다. */
function expectHealthy(mesh: StudioEditableMesh, reference: StudioMeshIntegrityReport, label = "") {
  const report = fullReport(mesh);
  const context = label ? ` (${label})` : "";
  expect(report.canonical, `canonical${context}`).toBe(true);
  expect(report.closed, `closed${context}`).toBe(true);
  expect(report.boundaryHalfEdges, `boundary${context}`).toBe(reference.boundaryHalfEdges);
  expect(report.orientationConflicts, `orientation${context}`).toBe(0);
  expect(report.nonManifoldEdges, `non-manifold${context}`).toBe(0);
  expect(report.zeroAreaFaces, `zero-area${context}`).toEqual([]);
  expect(report.nonPlanarFaces, `non-planar${context}`).toEqual([]);
  expect(report.nonConvexFaces, `non-convex${context}`).toEqual([]);
  expect(report.unrenderableFaces, `unrenderable${context}`).toEqual([]);
  expect(report.duplicateVertexFaces, `duplicate${context}`).toEqual([]);
  expect(report.bowTieVertices, `bow-tie${context}`).toBe(0);
  expect(report.isolatedVertexCount, `isolated${context}`).toBe(reference.isolatedVertexCount);
  expect(report.eulerCharacteristic, `euler${context}`).toBe(reference.eulerCharacteristic);
  // 평면 재분할이므로 부피와 겉넓이는 그대로다.
  const volumeScale = Math.max(1, Math.abs(reference.signedVolume));
  expect(Math.abs(report.signedVolume - reference.signedVolume), `volume${context}`)
    .toBeLessThanOrEqual(volumeScale * 1e-9);
  expect(Math.abs(report.totalArea - reference.totalArea), `area${context}`)
    .toBeLessThanOrEqual(reference.totalArea * 1e-9);
  // 저장·복원해도 같은 메시여야 한다(정규 권위 배치).
  const restored = deserializeStudioEditableMesh(serializeStudioEditableMesh(mesh));
  expect(hashStudioEditableMesh(restored), `roundtrip${context}`).toBe(hashStudioEditableMesh(mesh));
}

function expectOutcomeConsistent(source: StudioEditableMesh, outcome: StudioFaceModelingOutcome) {
  const faceCount = outcome.mesh.faces.length;
  for (const id of [...outcome.createdFaceIds, ...outcome.selectionFaceIds]) {
    expect(id).toBeGreaterThanOrEqual(0);
    expect(id).toBeLessThan(faceCount);
  }
  expect(outcome.createdFaceIds).toEqual([...outcome.createdFaceIds].sort((a, b) => a - b));
  expect(new Set(outcome.createdFaceIds).size).toBe(outcome.createdFaceIds.length);
  expect(outcome.faceRemap).toHaveLength(source.faces.length);
  const targets = outcome.faceRemap.map(([, target]) => target).filter((id): id is number => id !== null);
  expect(new Set(targets).size).toBe(targets.length);
}

function randomConvexPolygon(
  random: () => number,
  corners: number,
  radius: number,
  center: StudioPlanarPoint = [0, 0],
  stretch: StudioPlanarPoint = [1, 1],
): StudioPlanarPoint[] {
  for (let attempt = 0; attempt < 500; attempt += 1) {
    const angles = Array.from({ length: corners }, () => random() * Math.PI * 2).sort((a, b) => a - b);
    let widest = angles[0]! + Math.PI * 2 - angles[corners - 1]!;
    let narrowest = widest;
    for (let index = 1; index < corners; index += 1) {
      const gap = angles[index]! - angles[index - 1]!;
      widest = Math.max(widest, gap);
      narrowest = Math.min(narrowest, gap);
    }
    if (widest < Math.PI * 0.85 && narrowest > 0.15) {
      return angles.map((angle) => [
        center[0] + Math.cos(angle) * radius * stretch[0],
        center[1] + Math.sin(angle) * radius * stretch[1],
      ] as const);
    }
  }
  throw new Error("could not generate a well-conditioned convex polygon");
}

function rotateVector(point: StudioMeshVec3, angles: readonly [number, number, number]): StudioMeshVec3 {
  const [ax, ay, az] = angles;
  const cx = Math.cos(ax);
  const sx = Math.sin(ax);
  const cy = Math.cos(ay);
  const sy = Math.sin(ay);
  const cz = Math.cos(az);
  const sz = Math.sin(az);
  const y1 = point.y * cx - point.z * sx;
  const z1 = point.y * sx + point.z * cx;
  const x2 = point.x * cy + z1 * sy;
  const z2 = -point.x * sy + z1 * cy;
  return { x: x2 * cz - y1 * sz, y: x2 * sz + y1 * cz, z: z2 };
}

/** 임의의 볼록 n각 기둥(또는 기울어진 뿔대)을 임의로 돌려 놓은 닫힌 메시. 면 방향은 바깥쪽이다. */
function randomPrismMesh(random: () => number): StudioEditableMesh {
  const corners = 3 + Math.floor(random() * 6);
  const base = randomConvexPolygon(random, corners, 0.5 + random() * 1.5, [0, 0], [
    0.6 + random() * 0.8,
    0.6 + random() * 0.8,
  ]);
  const height = 0.4 + random() * 2;
  const taper = random() < 0.4 ? 1 : 0.35 + random() * 0.6;
  const shift: StudioPlanarPoint = random() < 0.5 ? [0, 0] : [(random() - 0.5) * 0.4, (random() - 0.5) * 0.4];
  const angles: [number, number, number] = [random() * 6.28, random() * 6.28, random() * 6.28];
  const offset: StudioMeshVec3 = { x: (random() - 0.5) * 10, y: (random() - 0.5) * 10, z: (random() - 0.5) * 10 };
  const positions: StudioMeshVec3[] = [
    ...base.map(([x, z]) => ({ x, y: 0, z })),
    ...base.map(([x, z]) => ({ x: x * taper + shift[0], y: height, z: z * taper + shift[1] })),
  ].map((point) => {
    const rotated = rotateVector(point, angles);
    return { x: rotated.x + offset.x, y: rotated.y + offset.y, z: rotated.z + offset.z };
  });
  const bottom = Array.from({ length: corners }, (_, index) => index);
  const top = bottom.map((index) => index + corners);
  const sides = bottom.map((index) => {
    const next = (index + 1) % corners;
    return [index, next, next + corners, index + corners];
  });
  let loops: number[][] = [top, [...bottom].reverse(), ...sides];
  let mesh = createStudioEditableMeshFromPolygons(positions, loops);
  if (fullReport(mesh).signedVolume < 0) {
    loops = loops.map((loop) => [...loop].reverse());
    mesh = createStudioEditableMeshFromPolygons(positions, loops);
  }
  return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: false })) };
}

/** 각 면 위에서 면 좌표 기준으로 면에 완전히 들어오는 임의의 볼록 다각형을 만든다. */
function randomShapeInsideFace(
  random: () => number,
  mesh: StudioEditableMesh,
  faceId: number,
): StudioPlanarPoint[] | null {
  const guide = describeStudioEditableMeshFaceForDrawing(mesh, faceId);
  if (!guide.ok) return null;
  const outline = guide.value.outline;
  const center: StudioPlanarPoint = [
    outline.reduce((sum, point) => sum + point[0], 0) / outline.length,
    outline.reduce((sum, point) => sum + point[1], 0) / outline.length,
  ];
  const reach = convexPolygonInsetMargin(outline, center);
  const radius = reach * (0.12 + random() * 0.5);
  // 점 사이가 도구 해상도보다 가까우면 겹친 점으로 거부되므로, 충분히 큰 도형만 그린다.
  if (!(radius > guide.value.minFeature * 40)) return null;
  const slack = (reach - radius) * 0.7;
  return randomConvexPolygon(
    random,
    3 + Math.floor(random() * 6),
    radius,
    [center[0] + (random() * 2 - 1) * slack * 0.7, center[1] + (random() * 2 - 1) * slack * 0.7],
    [0.5 + random() * 0.5, 1],
  );
}

describe("안쪽 테두리(Inset) 거리 커널", () => {
  it("단위 큐브 윗면을 0.1만큼 줄이면 안쪽 면 하나와 고리 4개가 생기고 닫힌 상태를 유지한다", () => {
    const cube = createStudioUnitCubeMesh();
    const reference = fullReport(cube);
    const outcome = expectOk(insetStudioEditableMeshFacesByDistance(cube, [3], 0.1));
    expect(outcome.operation).toBe("inset");
    expect(outcome.mesh.faces).toHaveLength(6 - 1 + 1 + 4);
    expect(outcome.mesh.vertices).toHaveLength(8 + 4);
    expect(outcome.createdFaceIds).toHaveLength(5);
    expect(outcome.selectionFaceIds).toHaveLength(1);
    expectHealthy(outcome.mesh, reference);
    expectOutcomeConsistent(cube, outcome);
    const inner = readStudioMeshFaceLoops(outcome.mesh)!.find((loop) => loop.id === outcome.selectionFaceIds[0])!;
    const innerPositions = inner.vertexIds.map((id) => outcome.mesh.vertices[id]!.position);
    for (const position of innerPositions) {
      expect(position.y).toBeCloseTo(0.5, 12);
      expect(Math.abs(position.x)).toBeCloseTo(0.4, 12);
      expect(Math.abs(position.z)).toBeCloseTo(0.4, 12);
    }
    // 입력 메시는 그대로다.
    expect(hashStudioEditableMesh(cube)).toBe(hashStudioEditableMesh(createStudioUnitCubeMesh()));
  });

  it("면 속성(평평한 음영·재질 슬롯)과 접힘을 이어받는다", () => {
    const cube = createStudioUnitCubeMesh();
    const marked: StudioEditableMesh = {
      ...cube,
      faces: cube.faces.map((face) => (face.id === 3 ? { ...face, materialSlot: 7 } : face)),
      halfEdges: cube.halfEdges.map((halfEdge) => (halfEdge.face === 3 ? { ...halfEdge, crease: 0.5 } : halfEdge)),
    };
    const outcome = expectOk(insetStudioEditableMeshFacesByDistance(marked, [3], 0.2));
    expect(outcome.mesh.faces.every((face) => !face.smooth)).toBe(true);
    const created = new Set(outcome.createdFaceIds);
    for (const face of outcome.mesh.faces) {
      if (created.has(face.id)) expect(face.materialSlot).toBe(7);
      else expect(face.materialSlot).toBe(0);
    }
    // 원래 모서리 접힘은 바깥 고리 모서리에 남고, 안쪽 모서리는 0이다.
    const creased = outcome.mesh.halfEdges.filter((halfEdge) => halfEdge.crease === 0.5);
    expect(creased).toHaveLength(4);
    expect(creased.every((halfEdge) => created.has(halfEdge.face))).toBe(true);
  });

  it("모서리가 사라지는 거리는 붕괴로 거부하고 허용 최대 거리를 알린다", () => {
    const cube = createStudioUnitCubeMesh();
    const failure = expectFailure(insetStudioEditableMeshFacesByDistance(cube, [3], 0.5), "collapse");
    if (failure.ok) return;
    expect(failure.maxDistance).toBeGreaterThan(0.499);
    expect(failure.maxDistance).toBeLessThan(0.5);
    expect(failure.elementIds).toEqual([3]);
    const justBelow = failure.maxDistance! * 0.999;
    expect(insetStudioEditableMeshFacesByDistance(cube, [3], justBelow).ok).toBe(true);
    expect(insetStudioEditableMeshFacesByDistance(cube, [3], failure.maxDistance! * 1.001).ok).toBe(false);
  });

  it("여러 면은 각각 따로 줄이고 가장 작은 면이 붕괴를 결정한다", () => {
    const positions: StudioMeshVec3[] = [
      { x: 0, y: 0, z: 0 }, { x: 4, y: 0, z: 0 }, { x: 4, y: 1, z: 0 }, { x: 0, y: 1, z: 0 },
      { x: 0, y: 0, z: 1 }, { x: 4, y: 0, z: 1 }, { x: 4, y: 1, z: 1 }, { x: 0, y: 1, z: 1 },
    ];
    const box = createStudioEditableMeshFromPolygons(positions, [
      [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
    ]);
    // 면 0(4x1)과 면 2(4x1)는 0.4까지 되고 면 4(1x1)는 0.5 미만에서 붕괴한다.
    expect(insetStudioEditableMeshFacesByDistance(box, [0, 2], 0.4).ok).toBe(true);
    const failure = expectFailure(insetStudioEditableMeshFacesByDistance(box, [0, 2, 4], 0.6), "collapse");
    if (failure.ok) return;
    expect(failure.elementIds).toEqual([0, 2, 4]);
    expect(failure.maxDistance).toBeLessThan(0.5);
    const both = expectOk(insetStudioEditableMeshFacesByDistance(box, [0, 2, 0], 0.2));
    expect(both.mesh.faces).toHaveLength(6 - 2 + 2 * 5);
    expectHealthy(both.mesh, fullReport(box));
  });

  it("잘못된 거리와 선택을 이유 코드로 거부한다", () => {
    const cube = createStudioUnitCubeMesh();
    for (const distance of [Number.NaN, Number.POSITIVE_INFINITY, 0, -0.1, 1e-9, 1e6]) {
      expectFailure(insetStudioEditableMeshFacesByDistance(cube, [0], distance), "invalid-parameter");
    }
    expectFailure(insetStudioEditableMeshFacesByDistance(cube, [], 0.1), "empty-selection");
    expectFailure(insetStudioEditableMeshFacesByDistance(cube, [99], 0.1), "not-found");
    expectFailure(insetStudioEditableMeshFacesByDistance(cube, [-1], 0.1), "not-found");
    expectFailure(insetStudioEditableMeshFacesByDistance(cube, [1.5], 0.1), "not-found");
  });

  it("일직선 꼭짓점이 있는 면도 뷰포트가 그릴 수 있는 면으로 나눈다", () => {
    // 변마다 중점이 있는 정사각 기둥: 윗면은 꼭짓점 8개(그중 4개는 180도)다.
    const ring: StudioPlanarPoint[] = [
      [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0],
    ];
    const positions: StudioMeshVec3[] = [
      ...ring.map(([x, z]) => ({ x, y: 0, z })),
      ...ring.map(([x, z]) => ({ x, y: 1, z })),
    ];
    const bottom = ring.map((_, index) => index);
    const top = bottom.map((index) => index + 8);
    const sides = bottom.map((index) => [index, (index + 1) % 8, ((index + 1) % 8) + 8, index + 8]);
    // 일직선 꼭짓점이 있는 다각형은 시작 꼭짓점에 따라 뷰포트가 못 그리므로 그릴 수 있는 시작점으로 돌려 놓는다.
    const renderable = (loop: number[]): number[] => {
      const start = findRenderableStartCorner(loop.map((id) => positions[id]!));
      expect(start).toBeGreaterThanOrEqual(0);
      return loop.map((_, index) => loop[(start + index) % loop.length]!);
    };
    const oriented = (flip: boolean) => [top, [...bottom].reverse(), ...sides]
      .map((loop) => (flip ? [...loop].reverse() : loop))
      .map((loop) => (loop.length === 8 ? renderable(loop) : loop));
    let mesh = createStudioEditableMeshFromPolygons(positions, oriented(false));
    if (fullReport(mesh).signedVolume < 0) mesh = createStudioEditableMeshFromPolygons(positions, oriented(true));
    const reference = fullReport(mesh);
    expect(reference.unrenderableFaces).toEqual([]);
    const topFace = mesh.faces.find((face) => {
      const loop = readStudioMeshFaceLoops(mesh)!.find((candidate) => candidate.id === face.id)!;
      return loop.vertexIds.length === 8 && loop.vertexIds.every((id) => mesh.vertices[id]!.position.y === 1);
    })!;
    const outcome = expectOk(insetStudioEditableMeshFacesByDistance(mesh, [topFace.id], 0.3));
    expectHealthy(outcome.mesh, reference);
    expect(outcome.mesh.faces).toHaveLength(mesh.faces.length - 1 + 1 + 8);
  });
});

describe("일직선 꼭짓점과 정점 순서에 흔들리지 않는다", () => {
  /** 변마다 중점이 있는 정사각 기둥. 윗면 8각형의 시작 꼭짓점을 `topStart`만큼 돌려 만든다. */
  function squareColumn(topStart: number): StudioEditableMesh {
    const ring: StudioPlanarPoint[] = [
      [-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0],
    ];
    const positions: StudioMeshVec3[] = [
      ...ring.map(([x, z]) => ({ x, y: 0, z })),
      ...ring.map(([x, z]) => ({ x, y: 1, z })),
    ];
    const bottom = ring.map((_, index) => index);
    const top = bottom.map((index) => index + 8);
    const sides = bottom.map((index) => [index, (index + 1) % 8, ((index + 1) % 8) + 8, index + 8]);
    const build = (flip: boolean) => {
      const orient = (loop: number[]) => (flip ? [...loop].reverse() : loop);
      // 윗면은 시험 변수만큼, 아랫면은 입력 조건이 아니라 배경이므로 항상 뷰포트가 그릴 수 있는 시작점으로 돌린다.
      const topLoop = orient(top);
      const bottomLoop = orient([...bottom].reverse());
      const bottomStart = findRenderableStartCorner(bottomLoop.map((id) => positions[id]!));
      return [
        topLoop.map((_, index) => topLoop[(topStart + index) % topLoop.length]!),
        bottomLoop.map((_, index) => bottomLoop[(bottomStart + index) % bottomLoop.length]!),
        ...sides.map(orient),
      ];
    };
    const mesh = createStudioEditableMeshFromPolygons(positions, build(false));
    return fullReport(mesh).signedVolume < 0 ? createStudioEditableMeshFromPolygons(positions, build(true)) : mesh;
  }

  function topFaceOf(mesh: StudioEditableMesh): number {
    return readStudioMeshFaceLoops(mesh)!.find((loop) => (
      loop.vertexIds.length === 8 && loop.vertexIds.every((id) => mesh.vertices[id]!.position.y === 1)
    ))!.id;
  }

  it.each([0, 1, 2, 3, 4, 5, 6, 7])("윗면 8각형의 시작 꼭짓점이 %i번째여도 면 그리기와 안쪽 테두리가 같은 결과를 낸다", (start) => {
    const mesh = squareColumn(start);
    const reference = fullReport(mesh);
    const face = topFaceOf(mesh);
    const square: StudioPlanarPoint[] = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]];
    const drawn = expectOk(drawStudioEditableMeshFacePolygon(mesh, face, square));
    expectHealthy(drawn.mesh, reference, `draw start ${start}`);
    const inset = expectOk(insetStudioEditableMeshFacesByDistance(mesh, [face], 0.3));
    expectHealthy(inset.mesh, reference, `inset start ${start}`);
  });

  /** 한 변을 n칸으로 나눈 닫힌 정육면체. 큰 면 하나가 같은 평면의 n x n 사각형들이라 영역 경계에 일직선 꼭짓점이 생긴다. */
  function subdividedCube(n: number): { positions: StudioMeshVec3[]; faces: number[][]; centroids: StudioMeshVec3[] } {
    const positions: StudioMeshVec3[] = [];
    const known = new Map<string, number>();
    const vertex = (x: number, y: number, z: number) => {
      const key = `${x},${y},${z}`;
      let id = known.get(key);
      if (id === undefined) {
        id = positions.length;
        known.set(key, id);
        positions.push({ x: x / n - 0.5, y: y / n - 0.5, z: z / n - 0.5 });
      }
      return id;
    };
    const faces: number[][] = [];
    const centroids: StudioMeshVec3[] = [];
    for (const axis of [0, 1, 2]) {
      for (const side of [0, 1]) {
        const u = (axis + 1) % 3;
        const v = (axis + 2) % 3;
        for (let i = 0; i < n; i += 1) {
          for (let j = 0; j < n; j += 1) {
            const corner = (di: number, dj: number) => {
              const c = [0, 0, 0];
              c[axis] = side * n;
              c[u] = i + di;
              c[v] = j + dj;
              return vertex(c[0]!, c[1]!, c[2]!);
            };
            const quad = [corner(0, 0), corner(1, 0), corner(1, 1), corner(0, 1)];
            faces.push(side === 1 ? quad : quad.reverse());
            const center = [0, 0, 0];
            center[axis] = side * n;
            center[u] = i + 0.5;
            center[v] = j + 0.5;
            centroids.push({ x: center[0]! / n - 0.5, y: center[1]! / n - 0.5, z: center[2]! / n - 0.5 });
          }
        }
      }
    }
    return { positions, faces, centroids };
  }

  it("같은 평면 격자의 안쪽 사각형을 바깥으로 오프셋하고, 정점·면 번호와 시작 꼭짓점을 섞어도 결과가 같다", () => {
    const random = seededRandom(8101);
    let checked = 0;
    for (const n of [3, 4, 5]) {
      const cube = subdividedCube(n);
      for (let trial = 0; trial < 8; trial += 1) {
        // 안쪽 사각형(테두리 칸이 아닌 것) 하나를 고른다.
        const interior = cube.faces.map((_, index) => index).filter((index) => {
          const within = index % (n * n);
          const i = Math.floor(within / n);
          const j = within % n;
          return i >= 1 && i <= n - 2 && j >= 1 && j <= n - 2;
        });
        const picked = interior[Math.floor(random() * interior.length)]!;
        const target = cube.centroids[picked]!;
        // 정점 번호, 면 순서, 각 면의 시작 꼭짓점을 무작위로 섞는다.
        const vertexOrder = cube.positions.map((_, index) => index).sort(() => random() - 0.5);
        const newIndex = new Map(vertexOrder.map((oldIndex, position) => [oldIndex, position] as const));
        const positions = vertexOrder.map((oldIndex) => cube.positions[oldIndex]!);
        const faceOrder = cube.faces.map((_, index) => index).sort(() => random() - 0.5);
        const faces = faceOrder.map((faceIndex) => {
          const loop = cube.faces[faceIndex]!.map((id) => newIndex.get(id)!);
          const start = Math.floor(random() * loop.length);
          return loop.map((_, index) => loop[(start + index) % loop.length]!);
        });
        const mesh = createStudioEditableMeshFromPolygons(positions, faces);
        const reference = fullReport(mesh);
        const loops = readStudioMeshFaceLoops(mesh)!;
        const face = loops.find((loop) => {
          const corners = loop.vertexIds.map((id) => mesh.vertices[id]!.position);
          const cx = corners.reduce((sum, point) => sum + point.x, 0) / corners.length;
          const cy = corners.reduce((sum, point) => sum + point.y, 0) / corners.length;
          const cz = corners.reduce((sum, point) => sum + point.z, 0) / corners.length;
          return Math.hypot(cx - target.x, cy - target.y, cz - target.z) < 1e-9;
        })!;
        const distance = 0.2 / n;
        const outcome = expectOk(offsetStudioEditableMeshFace(mesh, face.id, distance, "outward"));
        expectHealthy(outcome.mesh, reference, `n=${n} trial ${trial}`);
        checked += 1;
      }
    }
    expect(checked).toBe(24);
  });
});

describe("오프셋 커널", () => {
  it("안쪽 오프셋은 안쪽 테두리와 같은 기하를 만들고 선택을 고리 면으로 옮긴다", () => {
    const cube = createStudioUnitCubeMesh();
    const inset = expectOk(insetStudioEditableMeshFacesByDistance(cube, [3], 0.15));
    const offset = expectOk(offsetStudioEditableMeshFace(cube, 3, 0.15, "inward"));
    expect(offset.operation).toBe("offset");
    expect(hashStudioEditableMesh(offset.mesh)).toBe(hashStudioEditableMesh(inset.mesh));
    expect(offset.selectionFaceIds).toHaveLength(4);
    expect(offset.selectionFaceIds).not.toEqual(inset.selectionFaceIds);
    expectHealthy(offset.mesh, fullReport(cube));
  });

  it("안쪽 오프셋이 붕괴하면 이유와 최대 거리를 알리고 범위 조회와 일치한다", () => {
    const cube = createStudioUnitCubeMesh();
    const failure = expectFailure(offsetStudioEditableMeshFace(cube, 3, 0.7, "inward"), "collapse");
    const range = expectOk(studioEditableMeshOffsetRange(cube, 3, "inward"));
    if (failure.ok) return;
    expect(failure.maxDistance).toBeCloseTo(range.maxDistance, 12);
  });

  it("같은 평면 이웃이 없는 면은 바깥쪽으로 오프셋할 수 없다", () => {
    const cube = createStudioUnitCubeMesh();
    expectFailure(offsetStudioEditableMeshFace(cube, 3, 0.1, "outward"), "no-coplanar-region");
    expectFailure(studioEditableMeshOffsetRange(cube, 3, "outward"), "no-coplanar-region");
    expectFailure(offsetStudioEditableMeshFace(cube, 3, 0.1, "sideways" as StudioOffsetDirection), "invalid-parameter");
    expectFailure(offsetStudioEditableMeshFace(cube, 3, -0.1, "outward"), "invalid-parameter");
    expectFailure(offsetStudioEditableMeshFace(cube, 42, 0.1, "inward"), "not-found");
  });

  it("면을 그린 뒤 그 안쪽 면을 같은 평면 영역 안에서 바깥쪽으로 오프셋한다", () => {
    const cube = createStudioUnitCubeMesh();
    const reference = fullReport(cube);
    const square: StudioPlanarPoint[] = [[-0.1, -0.1], [0.1, -0.1], [0.1, 0.1], [-0.1, 0.1]];
    const drawn = expectOk(drawStudioEditableMeshFacePolygon(cube, 3, square));
    const inner = drawn.selectionFaceIds[0]!;
    const range = expectOk(studioEditableMeshOffsetRange(drawn.mesh, inner, "outward"));
    // 윗면은 한 변이 1이고 그린 사각형은 반폭이 0.1이라, 경계까지 0.4보다 약간 모자란 만큼 바깥으로 갈 수 있다.
    expect(range.maxDistance).toBeGreaterThan(0.399);
    expect(range.maxDistance).toBeLessThan(0.4);
    const outcome = expectOk(offsetStudioEditableMeshFace(drawn.mesh, inner, 0.1, "outward"));
    expectHealthy(outcome.mesh, reference);
    expectOutcomeConsistent(drawn.mesh, outcome);
    expect(outcome.selectionFaceIds).toHaveLength(4);
    // 그린 면은 그대로 남고(id만 이동) 고리 4개가 면 둘레를 감싼다.
    const remapped = outcome.faceRemap.find(([source]) => source === inner)![1];
    expect(remapped).not.toBeNull();
    const before = readStudioMeshFaceLoops(drawn.mesh)!.find((loop) => loop.id === inner)!;
    const after = readStudioMeshFaceLoops(outcome.mesh)!.find((loop) => loop.id === remapped)!;
    expect(after.vertexIds.map((id) => outcome.mesh.vertices[id]!.position))
      .toEqual(before.vertexIds.map((id) => drawn.mesh.vertices[id]!.position));
    // 영역을 벗어나는 거리는 최대 거리와 함께 거부한다.
    const tooFar = expectFailure(offsetStudioEditableMeshFace(drawn.mesh, inner, 0.45, "outward"), "out-of-region");
    if (tooFar.ok) return;
    expect(tooFar.maxDistance).toBeCloseTo(range.maxDistance, 12);
    expect(offsetStudioEditableMeshFace(drawn.mesh, inner, range.maxDistance * 0.999, "outward").ok).toBe(true);
    expect(offsetStudioEditableMeshFace(drawn.mesh, inner, range.maxDistance * 1.001, "outward").ok).toBe(false);
  });

  it("영역 경계에 닿아 있는 면은 더 바깥으로 갈 곳이 없다", () => {
    const cube = createStudioUnitCubeMesh();
    const square: StudioPlanarPoint[] = [[-0.45, -0.45], [0.45, -0.45], [0.45, 0.45], [-0.45, 0.45]];
    const drawn = expectOk(drawStudioEditableMeshFacePolygon(cube, 3, square));
    const range = expectOk(studioEditableMeshOffsetRange(drawn.mesh, drawn.selectionFaceIds[0]!, "outward"));
    expect(range.maxDistance).toBeGreaterThan(0.049);
    expect(range.maxDistance).toBeLessThan(0.05);
    expectFailure(offsetStudioEditableMeshFace(drawn.mesh, drawn.selectionFaceIds[0]!, 0.06, "outward"), "out-of-region");
  });
});

describe("면 그리기 커널", () => {
  const SQUARE: StudioPlanarPoint[] = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]];

  it("윗면 안쪽에 사각형을 그리면 사각형 면과 볼록 조각으로 나뉘고 이웃 면은 그대로다", () => {
    const cube = createStudioUnitCubeMesh();
    const reference = fullReport(cube);
    const outcome = expectOk(drawStudioEditableMeshFacePolygon(cube, 3, SQUARE));
    expect(outcome.operation).toBe("draw");
    expectHealthy(outcome.mesh, reference);
    expectOutcomeConsistent(cube, outcome);
    expect(outcome.selectionFaceIds).toHaveLength(1);
    expect(outcome.createdFaceIds).toContain(outcome.selectionFaceIds[0]);
    // 정렬된 사각형은 조각 4개로 합쳐진다: 면 6 - 1 + (그린 면 1 + 조각 4).
    expect(outcome.mesh.faces).toHaveLength(6 - 1 + 1 + 4);
    expect(outcome.mesh.vertices).toHaveLength(8 + 4);
    // 윗면 둘레 모서리는 그대로라 옆면의 이웃 관계가 바뀌지 않는다.
    const sideOf = (mesh: StudioEditableMesh, faceId: number) => {
      const loop = readStudioMeshFaceLoops(mesh)!.find((candidate) => candidate.id === faceId)!;
      return loop.vertexIds.map((id) => mesh.vertices[id]!.position);
    };
    for (const sideId of [0, 1, 2, 4, 5]) {
      const target = outcome.faceRemap.find(([source]) => source === sideId)![1]!;
      expect(sideOf(outcome.mesh, target)).toEqual(sideOf(cube, sideId));
    }
    const innerLoop = readStudioMeshFaceLoops(outcome.mesh)!.find((loop) => loop.id === outcome.selectionFaceIds[0])!;
    expect(innerLoop.vertexIds).toHaveLength(4);
  });

  it("시계 방향으로 찍은 점도 같은 결과를 만든다", () => {
    const cube = createStudioUnitCubeMesh();
    const forward = expectOk(drawStudioEditableMeshFacePolygon(cube, 3, SQUARE));
    const backward = expectOk(drawStudioEditableMeshFacePolygon(cube, 3, [...SQUARE].reverse()));
    expect(backward.mesh.faces).toHaveLength(forward.mesh.faces.length);
    expectHealthy(backward.mesh, fullReport(cube));
  });

  it("삼각형·오각형·열두 각 도형도 그리고 부분 면적이 보존된다", () => {
    const cube = createStudioUnitCubeMesh();
    const reference = fullReport(cube);
    const shapes: StudioPlanarPoint[][] = [
      [[-0.2, -0.2], [0.25, -0.1], [0, 0.3]],
      Array.from({ length: 5 }, (_, index) => {
        const angle = (index * 2 * Math.PI) / 5;
        return [Math.cos(angle) * 0.3, Math.sin(angle) * 0.3] as const;
      }),
      Array.from({ length: 12 }, (_, index) => {
        const angle = (index * 2 * Math.PI) / 12;
        return [Math.cos(angle) * 0.35 + 0.05, Math.sin(angle) * 0.25] as const;
      }),
    ];
    for (const shape of shapes) {
      const outcome = expectOk(drawStudioEditableMeshFacePolygon(cube, 3, shape));
      expectHealthy(outcome.mesh, reference, `${shape.length}각형`);
    }
  });

  it("면 밖·경계 위·자기 교차·오목·일직선·겹친 점·점 부족을 이유와 함께 거부한다", () => {
    const cube = createStudioUnitCubeMesh();
    const guide = expectOk(describeStudioEditableMeshFaceForDrawing(cube, 3));
    const [minX, maxX] = [Math.min(...guide.outline.map((p) => p[0])), Math.max(...guide.outline.map((p) => p[0]))];
    expectFailure(drawStudioEditableMeshFacePolygon(cube, 3, [[0, 0], [1, 0]]), "degenerate-input");
    const outside = expectFailure(
      drawStudioEditableMeshFacePolygon(cube, 3, [[0, 0], [maxX + 1, 0], [0, 0.2]]),
      "out-of-face",
    );
    if (!outside.ok) expect(outside.elementIds).toEqual([1]);
    expectFailure(
      drawStudioEditableMeshFacePolygon(cube, 3, [[minX, minX], [0.1, minX + 0.2], [0, 0.2]]),
      "out-of-face",
    );
    const bowTie = expectFailure(
      drawStudioEditableMeshFacePolygon(cube, 3, [[-0.2, -0.2], [0.2, 0.2], [0.2, -0.2], [-0.2, 0.2]]),
      "self-intersection",
    );
    if (!bowTie.ok) expect(bowTie.elementIds!.length).toBeGreaterThanOrEqual(2);
    expectFailure(
      drawStudioEditableMeshFacePolygon(cube, 3, [[-0.3, -0.3], [0.3, -0.3], [0.3, 0.3], [0, 0], [-0.3, 0.3]]),
      "non-convex",
    );
    const line = expectFailure(
      drawStudioEditableMeshFacePolygon(cube, 3, [[-0.2, -0.2], [0, -0.2], [0.2, -0.2], [0, 0.2]]),
      "degenerate-input",
    );
    if (!line.ok) expect(line.elementIds).toEqual([1]);
    expectFailure(
      drawStudioEditableMeshFacePolygon(cube, 3, [[0, 0], [0, 0], [0.2, 0], [0.2, 0.2]]),
      "degenerate-input",
    );
    expectFailure(drawStudioEditableMeshFacePolygon(cube, 3, [[0, 0], [0.1, 0], [Number.NaN, 0.1]]), "invalid-parameter");
    expectFailure(drawStudioEditableMeshFacePolygon(cube, 99, SQUARE), "not-found");
    const many = Array.from({ length: 65 }, (_, index) => {
      const angle = (index * 2 * Math.PI) / 65;
      return [Math.cos(angle) * 0.3, Math.sin(angle) * 0.3] as const;
    });
    expectFailure(drawStudioEditableMeshFacePolygon(cube, 3, many), "budget-exceeded");
    const sixtyFour = many.slice(0, 64).map((_, index) => {
      const angle = (index * 2 * Math.PI) / 64;
      return [Math.cos(angle) * 0.3, Math.sin(angle) * 0.3] as const;
    });
    expectHealthy(expectOk(drawStudioEditableMeshFacePolygon(cube, 3, sixtyFour)).mesh, fullReport(cube));
  });

  it("그리기 좌표계는 면의 첫 모서리를 가로축으로 둔다", () => {
    const cube = createStudioUnitCubeMesh();
    const guide = expectOk(describeStudioEditableMeshFaceForDrawing(cube, 3));
    expect(guide.outline).toHaveLength(4);
    expect(guide.vertexIds).toHaveLength(4);
    expect(guide.frame.area).toBeCloseTo(1, 12);
    expect(guide.minFeature).toBeGreaterThan(0);
    // 윗면(+Y)을 위에서 본 방향.
    expect(guide.frame.normal.y).toBeCloseTo(1, 12);
  });
});

describe("무작위 입력 불변식(시드 고정)", () => {
  it("임의의 볼록 기둥·뿔대의 임의의 면에 안쪽 테두리를 적용해도 닫힘·방향·면적·부피가 유지된다", () => {
    const random = seededRandom(5101);
    let checked = 0;
    for (let round = 0; round < 120; round += 1) {
      const mesh = randomPrismMesh(random);
      const reference = fullReport(mesh);
      expect(reference.closed).toBe(true);
      expect(reference.unrenderableFaces).toEqual([]);
      const faceId = Math.floor(random() * mesh.faces.length);
      const probe = insetStudioEditableMeshFacesByDistance(mesh, [faceId], 1e-3);
      if (!probe.ok) continue;
      const limit = offsetLimit(mesh, faceId);
      const distance = limit * (0.05 + random() * 0.85);
      const outcome = expectOk(insetStudioEditableMeshFacesByDistance(mesh, [faceId], distance));
      expectHealthy(outcome.mesh, reference, `round ${round}`);
      expectOutcomeConsistent(mesh, outcome);
      expectRingWidth(outcome, distance);
      // 한계 바로 위는 붕괴로 거부된다.
      expect(insetStudioEditableMeshFacesByDistance(mesh, [faceId], limit * 1.01).ok).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(80);
  });

  it("임의의 면 안에 임의의 볼록 도형을 그려도 닫힘·방향·면적·부피가 유지되고 조각이 모두 볼록이다", () => {
    const random = seededRandom(6202);
    let checked = 0;
    for (let round = 0; round < 120; round += 1) {
      const mesh = randomPrismMesh(random);
      const reference = fullReport(mesh);
      const faceId = Math.floor(random() * mesh.faces.length);
      const shape = randomShapeInsideFace(random, mesh, faceId);
      if (!shape) continue;
      const outcome = expectOk(drawStudioEditableMeshFacePolygon(mesh, faceId, shape));
      expectHealthy(outcome.mesh, reference, `round ${round}`);
      expectOutcomeConsistent(mesh, outcome);
      expect(outcome.mesh.faces.length).toBeGreaterThan(mesh.faces.length);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(80);
  });

  it("그린 도형을 같은 평면 영역 안에서 바깥쪽으로 오프셋하는 사례도 불변식을 지킨다", () => {
    const random = seededRandom(8404);
    let checked = 0;
    for (let round = 0; round < 120; round += 1) {
      const mesh = randomPrismMesh(random);
      const reference = fullReport(mesh);
      const faceId = Math.floor(random() * mesh.faces.length);
      const shape = randomShapeInsideFace(random, mesh, faceId);
      if (!shape) continue;
      const drawn = expectOk(drawStudioEditableMeshFacePolygon(mesh, faceId, shape));
      const inner = drawn.selectionFaceIds[0]!;
      const range = studioEditableMeshOffsetRange(drawn.mesh, inner, "outward");
      // 아주 뾰족한 도형은 mitre가 너무 길어 거부된다. 그 밖에는 반드시 범위가 나온다.
      if (!range.ok) {
        expect(range.code).toBe("degenerate-input");
        continue;
      }
      expect(range.value.maxDistance).toBeGreaterThan(0);
      const distance = range.value.maxDistance * (0.1 + random() * 0.8);
      if (distance < 1e-4) continue;
      const outcome = expectOk(offsetStudioEditableMeshFace(drawn.mesh, inner, distance, "outward"));
      expectHealthy(outcome.mesh, reference, `round ${round}`);
      expectOutcomeConsistent(drawn.mesh, outcome);
      expect(outcome.selectionFaceIds).toHaveLength(shape.length);
      // 범위 바로 밖은 영역을 벗어난다고 거부된다.
      expect(offsetStudioEditableMeshFace(drawn.mesh, inner, range.value.maxDistance * 1.02, "outward").ok).toBe(false);
      checked += 1;
    }
    expect(checked).toBeGreaterThan(60);
  });

  it("그리기·안쪽 테두리·오프셋을 이어서 적용해도 매 단계 불변식이 유지된다", () => {
    const random = seededRandom(7303);
    let steps = 0;
    for (let round = 0; round < 40; round += 1) {
      let mesh = randomPrismMesh(random);
      const reference = fullReport(mesh);
      for (let step = 0; step < 5; step += 1) {
        const faceCount = mesh.faces.length;
        const faceId = Math.floor(random() * faceCount);
        const choice = random();
        let result: StudioFaceModelingResult<StudioFaceModelingOutcome>;
        if (choice < 0.4) {
          const shape = randomShapeInsideFace(random, mesh, faceId);
          if (!shape) continue;
          result = drawStudioEditableMeshFacePolygon(mesh, faceId, shape);
        } else if (choice < 0.7) {
          const limit = offsetLimit(mesh, faceId);
          if (!(limit > 1e-3)) continue;
          result = insetStudioEditableMeshFacesByDistance(mesh, [faceId], limit * (0.1 + random() * 0.7));
        } else {
          const direction: StudioOffsetDirection = random() < 0.5 ? "inward" : "outward";
          const range = studioEditableMeshOffsetRange(mesh, faceId, direction);
          if (!range.ok || !(range.value.maxDistance > 1e-3)) continue;
          result = offsetStudioEditableMeshFace(
            mesh,
            faceId,
            range.value.maxDistance * (0.1 + random() * 0.7),
            direction,
          );
        }
        // 한계 안쪽 입력은 모두 성공해야 한다. 실패하면 거부 이유를 함께 보여 준다.
        const outcome = expectOk(result);
        expectHealthy(outcome.mesh, reference, `round ${round} step ${step}`);
        mesh = outcome.mesh;
        steps += 1;
      }
    }
    expect(steps).toBeGreaterThan(80);
  });
});

/** 고리 사다리꼴마다 안쪽 변이 바깥 변 직선에서 정확히 distance만큼 떨어져 있는지 3D 거리로 독립 검증한다. */
function expectRingWidth(outcome: StudioFaceModelingOutcome, distance: number) {
  const loops = readStudioMeshFaceLoops(outcome.mesh)!;
  const selection = new Set(outcome.selectionFaceIds);
  let rings = 0;
  for (const loop of loops) {
    if (!outcome.createdFaceIds.includes(loop.id) || selection.has(loop.id)) continue;
    expect(loop.vertexIds).toHaveLength(4);
    const [a, b, c, d] = loop.vertexIds.map((id) => outcome.mesh.vertices[id]!.position) as [
      StudioMeshVec3, StudioMeshVec3, StudioMeshVec3, StudioMeshVec3,
    ];
    const axis = { x: b.x - a.x, y: b.y - a.y, z: b.z - a.z };
    const length = Math.hypot(axis.x, axis.y, axis.z);
    for (const point of [c, d]) {
      const offset = { x: point.x - a.x, y: point.y - a.y, z: point.z - a.z };
      const cross = {
        x: axis.y * offset.z - axis.z * offset.y,
        y: axis.z * offset.x - axis.x * offset.z,
        z: axis.x * offset.y - axis.y * offset.x,
      };
      expect(Math.hypot(cross.x, cross.y, cross.z) / length).toBeCloseTo(distance, 7);
    }
    rings += 1;
  }
  expect(rings).toBeGreaterThanOrEqual(3);
}

/** 안쪽 테두리의 허용 최대 거리를 커널의 붕괴 실패에서 읽는다. */
function offsetLimit(mesh: StudioEditableMesh, faceId: number): number {
  const failure = insetStudioEditableMeshFacesByDistance(mesh, [faceId], 999);
  if (failure.ok) return 0;
  return failure.maxDistance ?? 0;
}
