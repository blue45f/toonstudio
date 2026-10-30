import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  loopCutStudioEditableMesh,
  validateStudioEditableMeshSerializableAuthority,
  type StudioEditableMesh,
  type StudioEditableMeshResult,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import {
  decodeStudioMeshUvLayer,
  deriveStudioMeshUvIslands,
  hashStudioMeshUvTopology,
  validateStudioMeshUvLayer,
} from "../mesh-uv/studio-mesh-uv-authority";
import { inspectStudioMeshSurfaceForInteractiveProjection } from "../mesh-surface/studio-mesh-surface-interactive";

import {
  analyzeStudioEditableMeshIntegrity,
  readStudioMeshFaceLoops,
} from "./studio-hybrid-dcc-face-modeling-mesh";

function required<T>(value: T | undefined, label: string): T {
  if (value === undefined) throw new Error(label);
  return value;
}

function value<T>(result: StudioEditableMeshResult<T>): T {
  if (!result.ok) throw new Error(`${result.code}: ${result.detail}`);
  return result.value;
}

function faceLoops(mesh: StudioEditableMesh) {
  const loops = readStudioMeshFaceLoops(mesh);
  if (!loops) throw new Error("면 순환이 손상되었습니다.");
  return loops;
}

function endpoints(mesh: StudioEditableMesh, edgeId: number): readonly [StudioMeshVec3, StudioMeshVec3] {
  const edge = required(mesh.halfEdges[edgeId], "반변이 없습니다.");
  const previous = required(mesh.halfEdges[edge.prev], "이전 반변이 없습니다.");
  return [
    required(mesh.vertices[previous.vertex], "시작 정점이 없습니다.").position,
    required(mesh.vertices[edge.vertex], "끝 정점이 없습니다.").position,
  ];
}

function halfEdgeBetween(mesh: StudioEditableMesh, from: number, to: number): number {
  const edge = mesh.halfEdges.find((entry) => entry.vertex === to && mesh.halfEdges[entry.prev]?.vertex === from);
  return required(edge, `반변 ${from}→${to}가 없습니다.`).id;
}

function positionKey(point: StudioMeshVec3): string {
  return [point.x, point.y, point.z].map((coordinate) => coordinate.toFixed(8)).join(",");
}

function positions(mesh: StudioEditableMesh): string[] {
  return mesh.vertices.map(({ position }) => positionKey(position)).sort();
}

function expectHealthy(mesh: StudioEditableMesh) {
  expect(validateStudioEditableMeshSerializableAuthority(mesh).ok).toBe(true);
  const report = analyzeStudioEditableMeshIntegrity(mesh);
  expect(report.canonical).toBe(true);
  expect(report.nonManifoldEdges).toBe(0);
  expect(report.orientationConflicts).toBe(0);
  expect(report.zeroAreaFaces).toEqual([]);
  expect(report.duplicateVertexFaces).toEqual([]);
  expect(report.bowTieVertices).toBe(0);
  expect(report.isolatedVertexCount).toBe(0);
  return report;
}

function openStrip(): StudioEditableMesh {
  return createStudioEditableMeshFromPolygons([
    { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 },
    { x: 2, y: 0, z: 0 }, { x: 3, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 },
    { x: 2, y: 1, z: 0 }, { x: 3, y: 1, z: 0 },
  ], [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6]]);
}

/** 면마다 떨어진 비대칭 UV를 써서 공유 정점 UV의 잘못된 재사용을 검출한다. */
function attributedCube(): StudioEditableMesh {
  const cube = createStudioUnitCubeMesh();
  const mesh: StudioEditableMesh = {
    ...cube,
    vertices: cube.vertices.map((vertex) => ({ ...vertex, crease: vertex.id / 16 })),
    halfEdges: cube.halfEdges.map((edge) => ({ ...edge, crease: (edge.id + 1) / 32 })),
    faces: cube.faces.map((face) => ({ ...face, materialSlot: 100 + face.id, smooth: face.id % 2 === 0 })),
  };
  return {
    ...mesh,
    uvLayer: decodeStudioMeshUvLayer({
      revision: 1,
      topologyHash: hashStudioMeshUvTopology(mesh),
      corners: mesh.halfEdges.map((edge) => ({
        halfEdgeId: edge.id,
        u: Math.fround(edge.face * 11 + (edge.id % 4) ** 2 / 8 - 20),
        v: Math.fround(-edge.face * 7 - (edge.id % 4) ** 3 / 16 + 0.25),
      })),
    }, mesh),
  };
}

/** 위상 ID나 분할 순서에 의존하지 않고 3D 선분의 내분비로 기대값을 구한다. */
function segmentFactor(point: StudioMeshVec3, from: StudioMeshVec3, to: StudioMeshVec3): number | undefined {
  const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
  const lengthSquared = dx * dx + dy * dy + dz * dz;
  const factor = ((point.x - from.x) * dx + (point.y - from.y) * dy + (point.z - from.z) * dz) / lengthSquared;
  if (factor < -1e-10 || factor > 1 + 1e-10) return undefined;
  const error = Math.hypot(point.x - from.x - factor * dx, point.y - from.y - factor * dy, point.z - from.z - factor * dz);
  return error < 1e-10 ? factor : undefined;
}

describe("루프 절단의 실제 면 분할", () => {
  it("정육면체의 24개 반변 어느 것을 골라도 12정점·20모서리·10사각형의 닫힌 상자가 된다", () => {
    const source = createStudioUnitCubeMesh();
    const before = JSON.stringify(source);
    expect(source.halfEdges).toHaveLength(24);
    for (const seed of source.halfEdges) {
      const result = value(loopCutStudioEditableMesh(source, seed.id));
      const report = expectHealthy(result);
      expect(report.usedVertexCount, `seed=${seed.id}`).toBe(12);
      expect(report.edgeCount, `seed=${seed.id}`).toBe(20);
      expect(report.faceCount, `seed=${seed.id}`).toBe(10);
      expect(report.boundaryHalfEdges).toBe(0);
      expect(report.closed).toBe(true);
      expect(report.eulerCharacteristic).toBe(2);
      expect(report.signedVolume).toBeCloseTo(1, 12);
      expect(report.totalArea).toBeCloseTo(6, 12);
      expect(faceLoops(result).every((face) => face.vertexIds.length === 4)).toBe(true);
    }
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([0.2, 0.8])("factor=%s는 seed 방향의 실제 좌표를 따르고 twin 반전에서도 같은 절단면을 만든다", (factor) => {
    const source = createStudioUnitCubeMesh();
    const oldPositions = new Set(positions(source));
    for (const seed of source.halfEdges) {
      const [from, to] = endpoints(source, seed.id);
      const axis = required((["x", "y", "z"] as const).find((name) => from[name] !== to[name]), "절단 축이 없습니다.");
      const coordinate = from[axis] + (to[axis] - from[axis]) * factor;
      const result = value(loopCutStudioEditableMesh(source, seed.id, factor));
      const inserted = result.vertices.filter((vertex) => !oldPositions.has(positionKey(vertex.position)));
      expect(inserted).toHaveLength(4);
      for (const vertex of inserted) expect(vertex.position[axis]).toBeCloseTo(coordinate, 12);
      const twin = value(loopCutStudioEditableMesh(source, seed.twin, 1 - factor));
      expect(positions(twin)).toEqual(positions(result));
      expect(expectHealthy(result).signedVolume).toBeCloseTo(1, 12);
    }
  });

  it("열린 3사각형 띠의 내부 seed에서 양쪽 끝까지 나누고 경계에서도 같은 선을 만든다", () => {
    const source = openStrip();
    const internal = halfEdgeBetween(source, 1, 5);
    const result = value(loopCutStudioEditableMesh(source, internal, 0.25));
    const report = expectHealthy(result);
    expect(report.usedVertexCount).toBe(12);
    expect(report.edgeCount).toBe(17);
    expect(report.faceCount).toBe(6);
    expect(report.eulerCharacteristic).toBe(1);
    expect(report.boundaryHalfEdges).toBe(10);
    expect(report.totalArea).toBeCloseTo(3, 12);
    expect(faceLoops(result).every((face) => face.vertexIds.length === 4)).toBe(true);
    const inserted = result.vertices.filter(({ position }) => position.y > 0 && position.y < 1);
    expect(inserted.map(({ position }) => position.x).sort((a, b) => a - b)).toEqual([0, 1, 2, 3]);
    for (const { position } of inserted) expect(position.y).toBeCloseTo(0.25, 12);
    const boundary = halfEdgeBetween(source, 4, 0);
    expect(positions(value(loopCutStudioEditableMesh(source, boundary, 0.75)))).toEqual(positions(result));
  });

  it("삼각형 앞에서 띠 분할을 멈추면서 공유 변을 갱신해 T자 접합을 만들지 않는다", () => {
    const base = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
      { x: 3, y: 0.5, z: 0 },
    ], [[0, 1, 4, 3], [1, 2, 5, 4], [2, 6, 5]]);
    const source = { ...base, faces: base.faces.map((face) => ({ ...face, materialSlot: face.id })) };
    const result = value(loopCutStudioEditableMesh(source, halfEdgeBetween(source, 1, 4), 0.5));
    const report = expectHealthy(result);
    expect(report.usedVertexCount).toBe(10);
    expect(report.edgeCount).toBe(14);
    expect(report.faceCount).toBe(5);
    expect(report.eulerCharacteristic).toBe(1);
    expect(report.totalArea).toBeCloseTo(2.5, 12);
    const terminal = faceLoops(result).filter((face) => face.materialSlot === 2);
    expect(terminal).toHaveLength(1);
    expect(required(terminal[0], "끝 면이 없습니다.").vertexIds).toHaveLength(4);
  });
});

describe("루프 절단의 UV와 표면 속성 보존", () => {
  it("극히 작은 내분비에서도 연속한 공유 변의 새 UV가 비트 단위로 일치해 가짜 이음새를 만들지 않는다", () => {
    const base = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
      { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
    ], [[0, 1, 4, 3], [1, 2, 5, 4]]);
    const source: StudioEditableMesh = {
      ...base,
      uvLayer: decodeStudioMeshUvLayer({
        revision: 1,
        topologyHash: hashStudioMeshUvTopology(base),
        corners: base.halfEdges.map((edge) => {
          const [point] = endpoints(base, edge.id);
          return { halfEdgeId: edge.id, u: point.y, v: point.x };
        }),
      }, base),
    };
    const factor = 1.5e-10;
    const before = JSON.stringify(source);
    // 반대 방향에서 1-factor를 다시 빼면 Float32 결과도 달라지는 입력이다.
    expect(Math.fround(factor)).not.toBe(Math.fround(1 - (1 - factor)));
    expect(deriveStudioMeshUvIslands(source)).toHaveLength(1);
    const result = value(loopCutStudioEditableMesh(source, halfEdgeBetween(source, 1, 4), factor));
    const shared = required(result.vertices.find(({ position }) => position.x === 1 && position.y > 0 && position.y < 1), "공유 변의 절단 정점이 없습니다.");
    const layer = required(result.uvLayer, "연속 UV가 소실되었습니다.");
    const sharedCorners = result.halfEdges.filter((edge) => result.halfEdges[edge.prev]?.vertex === shared.id)
      .map((edge) => required(layer.corners[edge.id], "공유 코너 UV가 없습니다."));
    const bits = (coordinate: number): number => {
      const view = new DataView(new ArrayBuffer(4));
      view.setFloat32(0, coordinate);
      return view.getUint32(0);
    };
    expect(sharedCorners).toHaveLength(4);
    for (const corner of sharedCorners) {
      expect(bits(corner.u)).toBe(bits(Math.fround(factor)));
      expect(bits(corner.v)).toBe(bits(1));
    }
    expect(validateStudioMeshUvLayer(result)).toBeNull();
    expect(deriveStudioMeshUvIslands(result)).toHaveLength(1);
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([0.2, 0.8])("factor=%s에서 음수·비대칭 면 코너 UV와 이음새를 내분비대로 보존한다", (factor) => {
    const source = attributedCube();
    const before = JSON.stringify(source);
    const result = value(loopCutStudioEditableMesh(source, 0, factor));
    expect(validateStudioMeshUvLayer(result)).toBeNull();
    const outputUv = required(result.uvLayer, "UV 레이어가 사라졌습니다.");
    const sourceUv = required(source.uvLayer, "원본 UV가 없습니다.");
    expect(outputUv.topologyHash).toBe(hashStudioMeshUvTopology(result));
    expect(outputUv.corners).toHaveLength(result.halfEdges.length);
    expect(deriveStudioMeshUvIslands(source)).toHaveLength(6);
    expect(deriveStudioMeshUvIslands(result)).toHaveLength(6);
    for (const face of faceLoops(result)) {
      const parent = required(source.faces.find((entry) => entry.materialSlot === face.materialSlot), "원본 재질 면이 없습니다.");
      expect(face.smooth).toBe(parent.smooth);
      const parentEdges = source.halfEdges.filter((edge) => edge.face === parent.id);
      for (const edgeId of face.halfEdgeIds) {
        const [point] = endpoints(result, edgeId);
        const inherited = parentEdges.map((edge) => {
          const [from, to] = endpoints(source, edge.id);
          return { edge, factor: segmentFactor(point, from, to) };
        }).find((entry) => entry.factor !== undefined);
        const match = required(inherited, "UV 코너가 원본 면 경계에 있지 않습니다.");
        const ratio = required(match.factor, "UV 내분비가 없습니다.");
        const a = required(sourceUv.corners[match.edge.id], "UV 시작점이 없습니다.");
        const b = required(sourceUv.corners[match.edge.next], "UV 끝점이 없습니다.");
        const actual = required(outputUv.corners[edgeId], "결과 UV 코너가 없습니다.");
        expect(actual.u).toBe(Math.fround(a.u + (b.u - a.u) * ratio));
        expect(actual.v).toBe(Math.fround(a.v + (b.v - a.v) * ratio));
      }
    }
    expect(JSON.stringify(source)).toBe(before);
  });

  it("기존 정점 crease·재질·smooth와 분할된 모서리 crease를 보존하고 새 절단선은 crease 0이다", () => {
    const source = attributedCube();
    const result = value(loopCutStudioEditableMesh(source, 0, 0.2));
    for (const vertex of source.vertices) {
      const inherited = required(result.vertices.find((entry) => positionKey(entry.position) === positionKey(vertex.position)), "기존 정점이 사라졌습니다.");
      expect(inherited.crease).toBe(vertex.crease);
    }
    const originalPositions = new Set(positions(source));
    for (const vertex of result.vertices) {
      if (!originalPositions.has(positionKey(vertex.position))) expect(vertex.crease).toBe(0);
    }
    for (const face of result.faces) {
      const parent = required(source.faces.find((entry) => entry.materialSlot === face.materialSlot), "재질 슬롯이 소실되었습니다.");
      expect(face.smooth).toBe(parent.smooth);
    }
    let newCutEdges = 0;
    for (const edge of result.halfEdges) {
      const [from, to] = endpoints(result, edge.id);
      const face = required(result.faces[edge.face], "결과 반변의 면이 없습니다.");
      const parentFace = required(source.faces.find((entry) => entry.materialSlot === face.materialSlot), "반변의 원본 면이 없습니다.");
      const parent = source.halfEdges.find((candidate) => {
        if (candidate.face !== parentFace.id) return false;
        const [a, b] = endpoints(source, candidate.id);
        return segmentFactor(from, a, b) !== undefined && segmentFactor(to, a, b) !== undefined;
      });
      expect(edge.crease).toBe(parent?.crease ?? 0);
      if (!parent) newCutEdges += 1;
    }
    expect(newCutEdges).toBe(8);
  });
});

describe("오목한 사각형의 루프 절단", () => {
  function concaveQuad(): StudioEditableMesh {
    return createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 3, y: 0, z: 0 },
      { x: 1, y: 1, z: 0 }, { x: 0, y: 3, z: 0 },
    ], [[0, 1, 2, 3]]);
  }

  it("내부에 머무는 절단은 두 유효한 사각형을 만들고 면적·경계·UV를 보존한다", () => {
    const base = concaveQuad();
    const cornerUvs = [[-2, -1], [3, -0.5], [0.5, 1.25], [-1, 4]] as const;
    const source: StudioEditableMesh = {
      ...base,
      uvLayer: decodeStudioMeshUvLayer({
        revision: 1,
        topologyHash: hashStudioMeshUvTopology(base),
        corners: base.halfEdges.map((edge) => {
          const [u, v] = required(cornerUvs[edge.id], "오목한 면의 UV가 없습니다.");
          return { halfEdgeId: edge.id, u, v };
        }),
      }, base),
    };
    const before = JSON.stringify(source);
    const result = value(loopCutStudioEditableMesh(source, halfEdgeBetween(source, 0, 1), 0.25));
    const report = expectHealthy(result);
    expect(report.usedVertexCount).toBe(6);
    expect(report.edgeCount).toBe(7);
    expect(report.faceCount).toBe(2);
    expect(report.boundaryHalfEdges).toBe(6);
    expect(report.eulerCharacteristic).toBe(1);
    expect(report.totalArea).toBeCloseTo(3, 12);
    expect(report.nonPlanarFaces).toEqual([]);
    expect(faceLoops(result).every((face) => face.vertexIds.length === 4)).toBe(true);
    const expected = [
      { position: { x: 0, y: 0, z: 0 }, uv: { u: -2, v: -1 } },
      { position: { x: 3, y: 0, z: 0 }, uv: { u: 3, v: -0.5 } },
      { position: { x: 1, y: 1, z: 0 }, uv: { u: 0.5, v: 1.25 } },
      { position: { x: 0, y: 3, z: 0 }, uv: { u: -1, v: 4 } },
      { position: { x: 0.75, y: 0, z: 0 }, uv: { u: -0.75, v: -0.875 } },
      { position: { x: 0.25, y: 2.5, z: 0 }, uv: { u: -0.625, v: 3.3125 } },
    ];
    const uvByPosition = new Map(expected.map((entry) => [positionKey(entry.position), entry.uv]));
    expect(positions(result)).toEqual([...uvByPosition.keys()].sort());
    const layer = required(result.uvLayer, "오목한 면의 UV가 사라졌습니다.");
    expect(validateStudioMeshUvLayer(result)).toBeNull();
    expect(deriveStudioMeshUvIslands(result)).toHaveLength(1);
    for (const edge of result.halfEdges) {
      const [point] = endpoints(result, edge.id);
      const expectedUv = required(uvByPosition.get(positionKey(point)), "기대하지 않은 UV 정점입니다.");
      const actual = required(layer.corners[edge.id], "결과 코너 UV가 없습니다.");
      expect({ u: actual.u, v: actual.v }).toEqual(expectedUv);
    }
    const childAreas = faceLoops(result).map((face) => {
      const points = face.vertexIds.map((id) => required(result.vertices[id], "면 정점이 없습니다.").position);
      return points.reduce((twiceArea, point, index) => {
        const next = required(points[(index + 1) % points.length], "다음 면 정점이 없습니다.");
        return twiceArea + point.x * next.y - point.y * next.x;
      }, 0) / 2;
    }).sort((a, b) => a - b);
    expect(childAreas).toEqual([1.3125, 1.6875]);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("절단선이 원본 밖으로 나가면 뒤집힌 자식 면을 반환하지 않고 원자적으로 거부한다", () => {
    const source = concaveQuad();
    const before = JSON.stringify(source);
    expect(loopCutStudioEditableMesh(source, halfEdgeBetween(source, 0, 1), 0.8).ok).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("자기교차한 나비넥타이 사각형은 절단 전에 원자적으로 거부한다", () => {
    const source = createStudioEditableMeshFromPolygons([
      { x: 0, y: 0, z: 0 }, { x: 2, y: 2, z: 0 },
      { x: 0, y: 2, z: 0 }, { x: 2, y: 0, z: 0 },
    ], [[0, 1, 2, 3]]);
    const before = JSON.stringify(source);
    expect(loopCutStudioEditableMesh(source, 0, 0.25).ok).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });
});

describe("루프 절단의 원자적 거부", () => {
  it.each([0, 1, -0.1, 1.1, NaN, Infinity, -Infinity])("잘못된 factor %s는 원본을 바꾸지 않고 거부한다", (factor) => {
    const source = attributedCube();
    const before = JSON.stringify(source);
    const result = loopCutStudioEditableMesh(source, 0, factor);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("invalid-parameter");
    expect(JSON.stringify(source)).toBe(before);
  });

  it.each([-1, 0.5, 999, NaN, Infinity])("없는 반변 %s는 원본을 바꾸지 않고 거부한다", (edgeId) => {
    const source = attributedCube();
    const before = JSON.stringify(source);
    expect(loopCutStudioEditableMesh(source, edgeId).ok).toBe(false);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("손상된 연결과 오래된 UV 위상은 성공 결과나 부분 변경을 남기지 않는다", () => {
    const base = attributedCube();
    const uv = required(base.uvLayer, "원본 UV가 없습니다.");
    const malformed: StudioEditableMesh[] = [
      { ...base, halfEdges: base.halfEdges.map((edge) => edge.id === 0 ? { ...edge, next: -1 } : edge) },
      { ...base, uvLayer: { ...uv, topologyHash: "uv-topology:stale" } },
    ];
    for (const source of malformed) {
      const before = JSON.stringify(source);
      expect(loopCutStudioEditableMesh(source, 0).ok).toBe(false);
      expect(JSON.stringify(source)).toBe(before);
    }
  });
});

describe("루프 절단 후 실제 화면의 면 코너 예산", () => {
  function polygonWithAttachedQuad(count: number): StudioEditableMesh {
    const points: StudioMeshVec3[] = Array.from({ length: count }, (_, index) => ({
      x: Math.cos(2 * Math.PI * index / count),
      y: Math.sin(2 * Math.PI * index / count),
      z: 0,
    }));
    const a = required(points[0], "다각형의 첫 정점이 없습니다.");
    const b = required(points[1], "다각형의 두 번째 정점이 없습니다.");
    const nx = b.y - a.y, ny = a.x - b.x;
    points.push({ x: a.x + nx, y: a.y + ny, z: 0 }, { x: b.x + nx, y: b.y + ny, z: 0 });
    const base = createStudioEditableMeshFromPolygons(points, [
      Array.from({ length: count }, (_, index) => index),
      [1, 0, count, count + 1],
    ]);
    const mesh: StudioEditableMesh = {
      ...base,
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: vertex.id % 5 / 8 })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: (edge.id % 4 + 1) / 8 })),
      faces: base.faces.map((face) => ({ ...face, materialSlot: 7 + face.id, smooth: false })),
    };
    return {
      ...mesh,
      uvLayer: decodeStudioMeshUvLayer({
        revision: 1,
        topologyHash: hashStudioMeshUvTopology(mesh),
        corners: mesh.halfEdges.map((edge) => {
          const [point] = endpoints(mesh, edge.id);
          return {
            halfEdgeId: edge.id,
            u: Math.fround(point.x * 2 - 3 + edge.face * 10),
            v: Math.fround(point.y * 3 - 1 - edge.face * 6),
          };
        }),
      }, mesh),
    };
  }

  it("127각형 종단은 새 코너를 포함한 128각형으로 갱신해도 실제 화면 계획을 통과한다", () => {
    const source = polygonWithAttachedQuad(127);
    const before = JSON.stringify(source);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(source).ok).toBe(true);
    const result = value(loopCutStudioEditableMesh(source, 127, 0.5));
    const terminal = required(faceLoops(result).find((face) => face.materialSlot === 7), "종단 다각형이 사라졌습니다.");
    expect(terminal.vertexIds).toHaveLength(128);
    expect(result.faces).toHaveLength(3);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(result).ok).toBe(true);
    expect(validateStudioMeshUvLayer(result)).toBeNull();
    expect(result.uvLayer?.corners).toHaveLength(result.halfEdges.length);
    expect(deriveStudioMeshUvIslands(result)).toHaveLength(2);
    expect(JSON.stringify(source)).toBe(before);
  });

  it("128각형 종단을 129코너로 바꿔 화면에서 사라지게 하는 절단은 속성 손실 없이 거부한다", () => {
    const source = polygonWithAttachedQuad(128);
    const before = JSON.stringify(source);
    expect(inspectStudioMeshSurfaceForInteractiveProjection(source).ok).toBe(true);
    expect(validateStudioMeshUvLayer(source)).toBeNull();
    const result = loopCutStudioEditableMesh(source, 128, 0.5);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.code).toBe("budget-exceeded");
    expect(JSON.stringify(source)).toBe(before);
    expect(validateStudioMeshUvLayer(source)).toBeNull();
    expect(inspectStudioMeshSurfaceForInteractiveProjection(source).ok).toBe(true);
  });
});
