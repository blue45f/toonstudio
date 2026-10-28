import { Quaternion, Vector3 } from "three";
import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons, createStudioUnitCubeMesh,
  deserializeStudioEditableMesh, hashStudioEditableMesh, serializeStudioEditableMesh,
  type StudioEditableMesh, type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import {
  describeStudioEditableMeshFaceForFollowMe, followMeStudioEditableMeshFace,
} from "./studio-hybrid-dcc-face-follow-me";
import {
  analyzeStudioEditableMeshIntegrity, readStudioMeshFaceLoops,
  type StudioFaceModelingOutcome, type StudioFaceModelingResult,
} from "./studio-hybrid-dcc-face-modeling-mesh";

const TOP = 3;
const START: StudioMeshVec3 = { x: 0, y: 0.5, z: 0 };
const STRAIGHT: readonly StudioMeshVec3[] = [START, { x: 0, y: 2.5, z: 0 }];
const BEND: readonly StudioMeshVec3[] = [...STRAIGHT, { x: 2, y: 2.5, z: 0 }];
const SPACE_BEND: readonly StudioMeshVec3[] = [...BEND, { x: 2, y: 2.5, z: 2 }];
const HEALTHY_PATHS: readonly (readonly [string, readonly StudioMeshVec3[], number, StudioMeshVec3])[] = [
  ["직선", STRAIGHT, 3, { x: 0, y: 1, z: 0 }],
  ["직각 경로", BEND, 5, { x: 1, y: 0, z: 0 }],
  ["공간 경로", SPACE_BEND, 7, { x: 0, y: 0, z: 1 }],
];

function expectOk<T>(result: StudioFaceModelingResult<T>): T {
  if (!result.ok) throw new Error(`expected success, got ${result.code}: ${result.detail}`);
  return result.value;
}

function expectFailure(result: StudioFaceModelingResult<unknown>, code: string): void {
  if (result.ok) throw new Error(`expected ${code}, got success`);
  expect(result.code).toBe(code);
}

function report(mesh: StudioEditableMesh) {
  return analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
}

function expectHealthy(source: StudioEditableMesh, result: StudioFaceModelingOutcome, volume: number): void {
  const integrity = report(result.mesh);
  expect(integrity.canonical).toBe(true);
  expect(integrity.closed).toBe(true);
  expect(integrity.orientationConflicts).toBe(0);
  expect(integrity.nonManifoldEdges).toBe(0);
  expect(integrity.zeroAreaFaces).toEqual([]);
  expect(integrity.nonPlanarFaces).toEqual([]);
  expect(integrity.nonConvexFaces).toEqual([]);
  expect(integrity.unrenderableFaces).toEqual([]);
  expect(integrity.bowTieVertices).toBe(0);
  expect(integrity.isolatedVertexCount).toBe(0);
  expect(integrity.eulerCharacteristic).toBe(report(source).eulerCharacteristic);
  expect(integrity.signedVolume).toBeCloseTo(volume, 8);
  expect(result.operation).toBe("follow-me");
  expect(result.selectionFaceIds).toHaveLength(1);
  expect(result.createdFaceIds).toContain(result.selectionFaceIds[0]);
  expect(result.faceRemap).toHaveLength(source.faces.length);
  expect(result.faceRemap.find(([id]) => id === TOP)?.[1]).toBe(result.selectionFaceIds[0]);
  const restored = deserializeStudioEditableMesh(serializeStudioEditableMesh(result.mesh));
  expect(hashStudioEditableMesh(restored)).toBe(hashStudioEditableMesh(result.mesh));
}

function transformMesh(mesh: StudioEditableMesh, transform: (point: StudioMeshVec3) => StudioMeshVec3): StudioEditableMesh {
  const loops = readStudioMeshFaceLoops(mesh);
  if (!loops) throw new Error("test mesh has broken loops");
  return createStudioEditableMeshFromPolygons(mesh.vertices.map(({ position }) => transform(position)), loops.map(({ vertexIds }) => vertexIds));
}

function unionMeshes(meshes: readonly StudioEditableMesh[]): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [];
  const polygons: number[][] = [];
  for (const mesh of meshes) {
    const loops = readStudioMeshFaceLoops(mesh);
    if (!loops) throw new Error("test mesh has broken loops");
    const offset = positions.length;
    positions.push(...mesh.vertices.map(({ position }) => position));
    polygons.push(...loops.map(({ vertexIds }) => vertexIds.map((id) => id + offset)));
  }
  return createStudioEditableMeshFromPolygons(positions, polygons);
}

function cubeAt(center: StudioMeshVec3, scale: number): StudioEditableMesh {
  return transformMesh(createStudioUnitCubeMesh(), (p) => ({
    x: p.x * scale + center.x, y: p.y * scale + center.y, z: p.z * scale + center.z,
  }));
}

function prism(outline: readonly (readonly [number, number])[]): StudioEditableMesh {
  const count = outline.length;
  const positions = [-0.5, 0.5].flatMap((y) => outline.map(([x, z]) => ({ x, y, z })));
  const bottom = outline.map((_, index) => index);
  const top = bottom.map((index) => index + count).reverse();
  const sides = bottom.map((index) => {
    const next = (index + 1) % count;
    return [index, index + count, next + count, next];
  });
  return createStudioEditableMeshFromPolygons(positions, [top, bottom, ...sides]);
}

describe("실제 면 Follow Me: 메시 권위·선택·재질·저장", () => {
  it("실제 면의 면적 중심과 바깥 법선으로 기본 경로를 안내한다", () => {
    const mesh = createStudioUnitCubeMesh();
    const before = hashStudioEditableMesh(mesh);
    const guide = expectOk(describeStudioEditableMeshFaceForFollowMe(mesh, TOP));
    expect(guide.centroid).toEqual(START);
    expect(guide.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(guide.minSegmentLength).toBeGreaterThan(0);
    expect(guide.maxPathPoints).toBe(64);
    expect(hashStudioEditableMesh(mesh)).toBe(before);
  });

  it("비대칭 볼록 면은 꼭짓점 평균이 아닌 면적 중심에서 시작한다", () => {
    const source = prism([[-1, -1], [1, -1], [0.5, 1], [-0.5, 1]]);
    const guide = expectOk(describeStudioEditableMeshFaceForFollowMe(source, 0));
    expect(guide.centroid.x).toBeCloseTo(0, 10);
    expect(guide.centroid.y).toBeCloseTo(0.5, 10);
    expect(guide.centroid.z).toBeCloseTo(-1 / 9, 10);
    const result = expectOk(followMeStudioEditableMeshFace(source, 0, [guide.centroid, { ...guide.centroid, y: 2.5 }]));
    expect(report(result.mesh).closed).toBe(true);
    expect(report(result.mesh).signedVolume).toBeCloseTo(9, 9);
    expectFailure(followMeStudioEditableMeshFace(source, 0, STRAIGHT), "invalid-parameter");
  });

  it.each(HEALTHY_PATHS)("%s는 원래 경계에 붙은 닫힌 메시와 끝 뚜껑 선택을 반환한다", (_label, path, volume, normal) => {
    const source = createStudioUnitCubeMesh();
    const before = hashStudioEditableMesh(source);
    const result = expectOk(followMeStudioEditableMeshFace(source, TOP, path));
    expectHealthy(source, result, volume);
    const capId = result.selectionFaceIds[0];
    if (capId === undefined) throw new Error("no cap selection");
    const capGuide = expectOk(describeStudioEditableMeshFaceForFollowMe(result.mesh, capId));
    expect(capGuide.normal.x).toBeCloseTo(normal.x, 10);
    expect(capGuide.normal.y).toBeCloseTo(normal.y, 10);
    expect(capGuide.normal.z).toBeCloseTo(normal.z, 10);
    expect(result.mesh.vertices.slice(0, source.vertices.length).map(({ position }) => position)).toEqual(source.vertices.map(({ position }) => position));
    expect(hashStudioEditableMesh(source)).toBe(before);
  });

  it("3D로 회전·이동한 프로필에서도 경로와 최종 단면 방향이 같은 변환을 따른다", () => {
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 2, 3).normalize(), 0.713);
    const transform = (p: StudioMeshVec3): StudioMeshVec3 => {
      const v = new Vector3(p.x, p.y, p.z).applyQuaternion(q).add(new Vector3(37, -13, 23));
      return { x: v.x, y: v.y, z: v.z };
    };
    const source = createStudioUnitCubeMesh();
    const plain = expectOk(followMeStudioEditableMeshFace(source, TOP, SPACE_BEND));
    const rotated = transformMesh(source, transform);
    const result = expectOk(followMeStudioEditableMeshFace(rotated, TOP, SPACE_BEND.map(transform)));
    expectHealthy(rotated, result, 7);
    expect(result.mesh.vertices).toHaveLength(plain.mesh.vertices.length);
    for (const vertex of plain.mesh.vertices) {
      const actual = result.mesh.vertices[vertex.id]?.position;
      if (!actual) throw new Error("transformed vertex missing");
      const expected = transform(vertex.position);
      expect(actual.x).toBeCloseTo(expected.x, 9);
      expect(actual.y).toBeCloseTo(expected.y, 9);
      expect(actual.z).toBeCloseTo(expected.z, 9);
    }
  });

  it("직각이 아닌 연속된 공간 꺾임도 면적×경로 길이 부피와 끝 법선을 유지한다", () => {
    const source = createStudioUnitCubeMesh();
    const path = [START, { x: 0, y: 3.5, z: 0 }, { x: 3, y: 5.5, z: 0 }, { x: 5, y: 6.5, z: 3 }];
    const length = 3 + Math.sqrt(13) + Math.sqrt(14);
    const result = expectOk(followMeStudioEditableMeshFace(source, TOP, path));
    expectHealthy(source, result, 1 + length);
    const cap = result.selectionFaceIds[0];
    if (cap === undefined) throw new Error("cap missing");
    const guide = expectOk(describeStudioEditableMeshFaceForFollowMe(result.mesh, cap));
    expect(guide.normal.x).toBeCloseTo(2 / Math.sqrt(14), 9);
    expect(guide.normal.y).toBeCloseTo(1 / Math.sqrt(14), 9);
    expect(guide.normal.z).toBeCloseTo(3 / Math.sqrt(14), 9);
  });

  it("일직선 중간점은 평행 수송을 바꾸지 않고 동일 부피를 만든다", () => {
    const source = createStudioUnitCubeMesh();
    const subdivided = [START, { x: 0, y: 1.5, z: 0 }, ...STRAIGHT.slice(1)];
    const result = expectOk(followMeStudioEditableMeshFace(source, TOP, subdivided));
    expectHealthy(source, result, 3);
    const cap = result.selectionFaceIds[0];
    if (cap === undefined) throw new Error("cap missing");
    const guide = expectOk(describeStudioEditableMeshFaceForFollowMe(result.mesh, cap));
    expect(guide.normal).toEqual({ x: 0, y: 1, z: 0 });
    expect(guide.centroid).toEqual(STRAIGHT[1]);
  });

  it("좌표 한도 부근에서 이동해도 coplanar 충돌 면적에 큰 좌표 상쇄 오차를 넣지 않는다", () => {
    const transform = (p: StudioMeshVec3): StudioMeshVec3 => ({ x: p.x + 900_000, y: p.y + 900_000, z: p.z + 900_000 });
    const source = transformMesh(createStudioUnitCubeMesh(), transform);
    const result = expectOk(followMeStudioEditableMeshFace(source, TOP, SPACE_BEND.map(transform)));
    expectHealthy(source, result, 7);
  });

  it("기존 면과 새 옆면·뚜껑의 재질/평활화 및 단면 경계 crease를 보존한다", () => {
    const base = createStudioUnitCubeMesh();
    const source: StudioEditableMesh = { ...base,
      faces: base.faces.map((face) => ({ ...face, materialSlot: face.id === TOP ? 4 : 2, smooth: face.id === TOP })),
      halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: 0.625 })),
      vertices: base.vertices.map((vertex) => ({ ...vertex, crease: 0.25 })),
    };
    const before = hashStudioEditableMesh(source);
    const result = expectOk(followMeStudioEditableMeshFace(source, TOP, BEND));
    expectHealthy(source, result, 5);
    for (const id of result.createdFaceIds) {
      expect(result.mesh.faces[id]?.materialSlot).toBe(4);
      expect(result.mesh.faces[id]?.smooth).toBe(true);
    }
    for (const [oldId, nextId] of result.faceRemap) {
      if (oldId === TOP || nextId === null) continue;
      expect(result.mesh.faces[nextId]?.materialSlot).toBe(2);
      expect(result.mesh.faces[nextId]?.smooth).toBe(false);
    }
    const capId = result.selectionFaceIds[0];
    const capLoop = readStudioMeshFaceLoops(result.mesh)?.find(({ id }) => id === capId);
    if (!capLoop) throw new Error("cap loop missing");
    expect(capLoop.halfEdgeIds.map((id) => result.mesh.halfEdges[id]?.crease)).toEqual([0.625, 0.625, 0.625, 0.625]);
    expect(result.mesh.vertices.slice(0, source.vertices.length).map(({ crease }) => crease)).toEqual(source.vertices.map(({ crease }) => crease));
    expect(hashStudioEditableMesh(source)).toBe(before);
  });
});

describe("실제 면 Follow Me: 잘못된 입력은 원자적으로 거부한다", () => {
  const invalidPaths: readonly (readonly [string, readonly StudioMeshVec3[], string])[] = [
    ["점 하나", [START], "invalid-parameter"],
    ["중심과 다른 시작점", [{ x: 0.1, y: 0.5, z: 0 }, { x: 0.1, y: 2, z: 0 }], "invalid-parameter"],
    ["프로필에 수직이 아닌 첫 구간", [START, { x: 1, y: 2.5, z: 0 }], "invalid-parameter"],
    ["안쪽 방향", [START, { x: 0, y: -2.5, z: 0 }], "invalid-parameter"],
    ["영 길이 구간", [START, START, { x: 0, y: 2, z: 0 }], "degenerate-input"],
    ["해상도보다 짧은 구간", [START, { x: 0, y: 0.50001, z: 0 }], "self-intersection"],
    ["U턴", [...STRAIGHT, { x: 0, y: 1.5, z: 0 }], "degenerate-input"],
    ["닫힌 경로", [...BEND, START], "self-intersection"],
    ["무한 좌표", [START, { x: 0, y: Infinity, z: 0 }], "invalid-parameter"],
    ["NaN 좌표", [START, { x: NaN, y: 2.5, z: 0 }], "invalid-parameter"],
    ["좌표 한도", [START, { x: 0, y: 1_000_001, z: 0 }], "invalid-parameter"],
    ["전체 경로 길이 한도", [START, { x: 0, y: 1001, z: 0 }], "budget-exceeded"],
    ["점 개수 한도", Array.from({ length: 65 }, (_, i) => ({ x: 0, y: 0.5 + i, z: 0 })), "budget-exceeded"],
  ];
  it.each(invalidPaths)("%s", (_label, path, code) => {
    const source = createStudioUnitCubeMesh();
    const before = hashStudioEditableMesh(source);
    const pathBefore = path.map((p) => ({ ...p }));
    expectFailure(followMeStudioEditableMeshFace(source, TOP, path), code);
    expect(hashStudioEditableMesh(source)).toBe(before);
    expect(path).toEqual(pathBefore);
  });

  it("존재하지 않는 선택과 열린 원본 메시를 거부한다", () => {
    const source = createStudioUnitCubeMesh();
    expectFailure(followMeStudioEditableMeshFace(source, 999, STRAIGHT), "not-found");
    const open = createStudioEditableMeshFromPolygons(source.vertices.map(({ position }) => position), [[3, 7, 6, 2]]);
    expectFailure(followMeStudioEditableMeshFace(open, 0, STRAIGHT), "invalid-mesh");
  });

  it("경로가 기존 표면을 관통하면 변경 없이 거부한다", () => {
    const source = createStudioUnitCubeMesh();
    const before = hashStudioEditableMesh(source);
    const path = [...BEND, { x: 2, y: -1.5, z: 0 }, { x: 0, y: -1.5, z: 0 }, { x: 0, y: 0, z: 0 }];
    expectFailure(followMeStudioEditableMeshFace(source, TOP, path), "would-collide");
    expect(hashStudioEditableMesh(source)).toBe(before);
  });

  it("새 경로가 앞 구간과 교차하면 원본을 바꾸지 않는다", () => {
    const source = createStudioUnitCubeMesh();
    const before = hashStudioEditableMesh(source);
    const path = [...BEND, { x: 2, y: 1, z: 0 }, { x: -1.5, y: 1, z: 0 }];
    expectFailure(followMeStudioEditableMeshFace(source, TOP, path), "self-intersection");
    expect(hashStudioEditableMesh(source)).toBe(before);
  });

  it("밀집한 꺾임이 옆면 삼각형을 무너뜨리면 거부한다", () => {
    const source = createStudioUnitCubeMesh();
    const before = hashStudioEditableMesh(source);
    const path = [...BEND, { x: 2, y: 1.5, z: 0 }, { x: -1.5, y: 1.5, z: 0 }];
    expectFailure(followMeStudioEditableMeshFace(source, TOP, path), "collapse");
    expect(hashStudioEditableMesh(source)).toBe(before);
  });

  it("오목한 프로필과 비평면 프로필은 원본 권위 데이터를 건드리지 않는다", () => {
    const concave = prism([[-1, -1], [1, -1], [0, 0], [1, 1], [-1, 1]]);
    const hash = hashStudioEditableMesh(concave);
    expectFailure(describeStudioEditableMeshFaceForFollowMe(concave, 0), "non-convex");
    expectFailure(followMeStudioEditableMeshFace(concave, 0, STRAIGHT), "non-convex");
    expect(hashStudioEditableMesh(concave)).toBe(hash);
    const cube = createStudioUnitCubeMesh();
    const warped = transformMesh(cube, (p) => p.x > 0 && p.z > 0 && p.y > 0 ? { ...p, y: p.y + 0.2 } : p);
    expectFailure(followMeStudioEditableMeshFace(warped, TOP, STRAIGHT), "unsupported-face");
  });

  it("경로 점 수가 유효해도 생성 면 수 예산을 넘으면 조립 전에 거부한다", () => {
    const outline: (readonly [number, number])[] = Array.from({ length: 64 }, (_, index) => {
      const angle = index * Math.PI * 2 / 64;
      return [Math.cos(angle), Math.sin(angle)];
    });
    const source = prism(outline);
    const before = hashStudioEditableMesh(source);
    const guide = expectOk(describeStudioEditableMeshFaceForFollowMe(source, 0));
    const path = Array.from({ length: 64 }, (_, index) => ({ ...guide.centroid, y: guide.centroid.y + index }));
    expectFailure(followMeStudioEditableMeshFace(source, 0, path), "budget-exceeded");
    expect(hashStudioEditableMesh(source)).toBe(before);
  });

  it("면 수 예산 안에서도 충돌 검사 작업량이 한도를 넘으면 원자적으로 거부한다", () => {
    const distant = Array.from({ length: 400 }, (_, index) => cubeAt({ x: 10 + index * 2, y: -3, z: 0 }, 1));
    const source = unionMeshes([createStudioUnitCubeMesh(), ...distant]);
    const before = hashStudioEditableMesh(source);
    const path = Array.from({ length: 64 }, (_, index) => ({ x: 0, y: 0.5 + index, z: 0 }));
    const result = followMeStudioEditableMeshFace(source, TOP, path);
    expectFailure(result, "budget-exceeded");
    if (result.ok) throw new Error("expected work budget rejection");
    expect(result.detail).toContain("collision work budget");
    expect(hashStudioEditableMesh(source)).toBe(before);
  });

  const obstacles: readonly (readonly [string, StudioMeshVec3, number])[] = [
    ["표면 관통", { x: 0.4, y: 1.5, z: 0 }, 0.4],
    ["면끼리 접촉", { x: 0.7, y: 1.5, z: 0 }, 0.4],
    ["작은 기존 부품을 완전히 감쌈", { x: 0.1, y: 1.5, z: 0.1 }, 0.2],
  ];
  it.each(obstacles)("%s 충돌도 닫힌 메시라는 이유로 허용하지 않는다", (_label, center, scale) => {
    const source = unionMeshes([createStudioUnitCubeMesh(), cubeAt(center, scale)]);
    const before = hashStudioEditableMesh(source);
    expect(report(source).closed).toBe(true);
    expectFailure(followMeStudioEditableMeshFace(source, TOP, STRAIGHT), "would-collide");
    expect(hashStudioEditableMesh(source)).toBe(before);
  });
});
