import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  hashStudioEditableMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import {
  buildStudioPlanarFrame,
  type StudioPlanarPoint,
} from "./studio-hybrid-dcc-face-modeling-geometry";
import { drawStudioEditableMeshFacePolygon } from "./studio-hybrid-dcc-face-modeling-draw";
import { insetStudioEditableMeshFacesByDistance } from "./studio-hybrid-dcc-face-modeling-kernel";
import {
  analyzeStudioEditableMeshIntegrity,
  readStudioMeshFaceLoops,
  studioFaceCornerPositions,
  type StudioFaceModelingResult,
  type StudioMeshIntegrityReport,
} from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  pushPullStudioEditableMeshFaces,
  studioEditableMeshPushPullRange,
  type StudioFacePushPullOutcome,
} from "./studio-hybrid-dcc-face-pushpull";

/** 단위 큐브에서 +Y(윗면) 면의 ID. */
const TOP_FACE = 3;

/** 시드를 고정한 의사 난수(mulberry32). */
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

function report(mesh: StudioEditableMesh): StudioMeshIntegrityReport {
  return analyzeStudioEditableMeshIntegrity(mesh, { renderableFaces: "all" });
}

function expectHealthy(mesh: StudioEditableMesh, label = "") {
  const result = report(mesh);
  const context = label ? ` (${label})` : "";
  expect(result.canonical, `canonical${context}`).toBe(true);
  expect(result.closed, `closed${context}`).toBe(true);
  expect(result.zeroAreaFaces, `zero-area${context}`).toEqual([]);
  expect(result.nonPlanarFaces, `non-planar${context}`).toEqual([]);
  expect(result.nonConvexFaces, `non-convex${context}`).toEqual([]);
  expect(result.unrenderableFaces, `unrenderable${context}`).toEqual([]);
  expect(result.bowTieVertices, `bow-tie${context}`).toBe(0);
  expect(result.isolatedVertexCount, `isolated${context}`).toBe(0);
  expect(result.eulerCharacteristic, `euler${context}`).toBe(2);
}

function faceArea(mesh: StudioEditableMesh, faceId: number): number {
  const loop = readStudioMeshFaceLoops(mesh)!.find((candidate) => candidate.id === faceId)!;
  return buildStudioPlanarFrame(studioFaceCornerPositions(mesh, loop.vertexIds))!.area;
}

/** 밀기/당기기는 평면 영역을 d만큼 움직이므로 부피가 면적 x d 만큼 변한다. */
function expectVolumeChange(before: StudioEditableMesh, outcome: StudioFacePushPullOutcome, area: number, distance: number) {
  const delta = report(outcome.mesh).signedVolume - report(before).signedVolume;
  expect(Math.abs(delta - area * distance)).toBeLessThanOrEqual(1e-9 * (1 + Math.abs(area * distance) + Math.abs(report(before).signedVolume)));
}

/** 윗면을 x 방향으로 0.3 밀어 기울인 육면체(사선 기둥). 앞뒤 벽은 법선과 나란하지만 기둥 벽은 아니다. */
function obliquePrism(): StudioEditableMesh {
  const cube = createStudioUnitCubeMesh();
  const top = new Set([2, 3, 6, 7]);
  const positions: StudioMeshVec3[] = cube.vertices.map((vertex) => (
    top.has(vertex.id) ? { ...vertex.position, x: vertex.position.x + 0.3 } : vertex.position
  ));
  return createStudioEditableMeshFromPolygons(positions, [
    [0, 3, 2, 1], [4, 5, 6, 7], [0, 1, 5, 4], [3, 7, 6, 2], [0, 4, 7, 3], [1, 2, 6, 5],
  ]);
}

describe("밀기/당기기 커널: 기둥 벽을 늘이고 줄이는 방식", () => {
  const TOP = TOP_FACE;

  it("큐브 윗면을 밀면 면 수는 그대로이고 벽이 늘어난다", () => {
    const cube = createStudioUnitCubeMesh();
    const outcome = expectOk(pushPullStudioEditableMeshFaces(cube, [TOP], 0.25));
    expect(outcome.method).toBe("stretch");
    expect(outcome.operation).toBe("push-pull");
    expect(outcome.mesh.faces).toHaveLength(6);
    expect(outcome.mesh.vertices).toHaveLength(8);
    expect(outcome.createdFaceIds).toEqual([]);
    expect(outcome.selectionFaceIds).toEqual([TOP]);
    expect(outcome.faceRemap).toEqual(cube.faces.map((face) => [face.id, face.id]));
    expectHealthy(outcome.mesh);
    expectVolumeChange(cube, outcome, 1, 0.25);
    const topY = studioFaceCornerPositions(outcome.mesh, readStudioMeshFaceLoops(outcome.mesh)![TOP]!.vertexIds)
      .map((point) => point.y);
    expect(topY).toEqual([0.75, 0.75, 0.75, 0.75]);
    // 입력 메시는 바뀌지 않는다.
    expect(hashStudioEditableMesh(cube)).toBe(hashStudioEditableMesh(createStudioUnitCubeMesh()));
  });

  it("안쪽으로 당겨도 옆면과 겹치는 이중 벽이 생기지 않고 다시 밀어도 면이 쌓이지 않는다", () => {
    const cube = createStudioUnitCubeMesh();
    const pulled = expectOk(pushPullStudioEditableMeshFaces(cube, [TOP], -0.3));
    expect(pulled.method).toBe("stretch");
    expect(pulled.mesh.faces).toHaveLength(6);
    expectHealthy(pulled.mesh);
    expectVolumeChange(cube, pulled, 1, -0.3);
    let mesh = pulled.mesh;
    for (const distance of [0.5, -0.2, 0.1, 0.25, -0.4]) {
      const next = expectOk(pushPullStudioEditableMeshFaces(mesh, [TOP], distance));
      expect(next.mesh.faces).toHaveLength(6);
      expectVolumeChange(mesh, next, 1, distance);
      mesh = next.mesh;
    }
    expectHealthy(mesh);
  });

  it("벽이 사라지는 깊이는 붕괴로 거부하고 허용 최대 깊이를 알린다", () => {
    const cube = createStudioUnitCubeMesh();
    const range = expectOk(studioEditableMeshPushPullRange(cube, [TOP]));
    expect(range).toMatchObject({ method: "stretch", pullLimitedBy: "wall", pushLimitedBy: "tool" });
    expect(range.minDistance).toBeLessThan(-0.999);
    expect(range.minDistance).toBeGreaterThan(-1);
    expect(range.maxDistance).toBe(1000);
    const failure = expectFailure(pushPullStudioEditableMeshFaces(cube, [TOP], -1), "collapse");
    if (failure.ok) return;
    expect(failure.maxDistance).toBeCloseTo(-range.minDistance, 12);
    expect(pushPullStudioEditableMeshFaces(cube, [TOP], range.minDistance * 0.999).ok).toBe(true);
    expect(pushPullStudioEditableMeshFaces(cube, [TOP], range.minDistance * 1.001).ok).toBe(false);
  });

  it("마주 보는 두 면과 옆으로 선 면도 같은 방식으로 움직이고, 법선 반대쪽은 안쪽으로 들어간다", () => {
    const cube = createStudioUnitCubeMesh();
    const both = expectOk(pushPullStudioEditableMeshFaces(cube, [TOP, 2], 0.2));
    expect(both.method).toBe("stretch");
    expectVolumeChange(cube, both, 1, 0.2 * 2);
    expectHealthy(both.mesh);
    const side = expectOk(pushPullStudioEditableMeshFaces(cube, [5], -0.4));
    expect(side.method).toBe("stretch");
    expectVolumeChange(cube, side, 1, -0.4);
    expectHealthy(side.mesh);
  });

  it("잘못된 거리와 선택을 이유 코드로 거부한다", () => {
    const cube = createStudioUnitCubeMesh();
    for (const distance of [Number.NaN, Number.POSITIVE_INFINITY, 0, 1e-9, -1e-9, 5000, -5000]) {
      expectFailure(pushPullStudioEditableMeshFaces(cube, [TOP], distance), "invalid-parameter");
    }
    expectFailure(pushPullStudioEditableMeshFaces(cube, [], 0.1), "empty-selection");
    expectFailure(pushPullStudioEditableMeshFaces(cube, [77], 0.1), "not-found");
    expectFailure(studioEditableMeshPushPullRange(cube, [77]), "not-found");
  });
});

describe("밀기/당기기 커널: 새 옆면을 만드는 방식", () => {
  const SQUARE: StudioPlanarPoint[] = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]];

  it("윗면에 그린 사각형을 당기면 구덩이가 되고, 밀면 돌출부가 된다", () => {
    const cube = createStudioUnitCubeMesh();
    const drawn = expectOk(drawStudioEditableMeshFacePolygon(cube, 3, SQUARE));
    const inner = drawn.selectionFaceIds[0]!;
    const area = faceArea(drawn.mesh, inner);
    const range = expectOk(studioEditableMeshPushPullRange(drawn.mesh, [inner]));
    expect(range.method).toBe("extrude");
    expect(range.minDistance).toBeLessThan(-0.999);
    const pit = expectOk(pushPullStudioEditableMeshFaces(drawn.mesh, [inner], -0.3));
    expect(pit.method).toBe("extrude");
    expect(pit.extrusion?.receipt.operation).toBe("extrude-region");
    expect(pit.mesh.faces).toHaveLength(drawn.mesh.faces.length + 4);
    expect(pit.selectionFaceIds).toHaveLength(1);
    expectHealthy(pit.mesh);
    expectVolumeChange(drawn.mesh, pit, area, -0.3);
    const boss = expectOk(pushPullStudioEditableMeshFaces(drawn.mesh, [inner], 0.3));
    expectHealthy(boss.mesh);
    expectVolumeChange(drawn.mesh, boss, area, 0.3);
    // 구덩이가 반대편 면을 뚫기 전까지만 파진다.
    const deep = expectFailure(pushPullStudioEditableMeshFaces(drawn.mesh, [inner], -1.2), "would-collide");
    if (deep.ok) return;
    expect(deep.maxDistance).toBeGreaterThan(0.99);
    expect(deep.maxDistance).toBeLessThan(1);
    expect(pushPullStudioEditableMeshFaces(drawn.mesh, [inner], -(deep.maxDistance! * 0.999)).ok).toBe(true);
  });

  it("안쪽 테두리로 만든 안쪽 면도 같은 방식으로 파고 올린다", () => {
    const cube = createStudioUnitCubeMesh();
    const inset = expectOk(insetStudioEditableMeshFacesByDistance(cube, [TOP_FACE], 0.15));
    const inner = inset.selectionFaceIds[0]!;
    const pit = expectOk(pushPullStudioEditableMeshFaces(inset.mesh, [inner], -0.25));
    expect(pit.method).toBe("extrude");
    expectHealthy(pit.mesh);
    // 구덩이 벽(새 옆면 4개)이 생기고 선택은 구덩이 바닥으로 옮겨 간다.
    expect(pit.mesh.faces).toHaveLength(inset.mesh.faces.length + 4);
    expect(pit.selectionFaceIds).toEqual(pit.extrusion!.receipt.capFaceIds);
  });

  it("사선 기둥의 윗면은 밀 수 있지만 안쪽으로 당기면 앞뒤 벽과 겹치므로 거부한다", () => {
    const prism = obliquePrism();
    const range = expectOk(studioEditableMeshPushPullRange(prism, [3]));
    expect(range.method).toBe("extrude");
    expect(range.minDistance).toBe(0);
    expect(range.pullLimitedBy).toBe("overlap");
    expect(range.maxDistance).toBeGreaterThan(0);
    const pulled = expectFailure(pushPullStudioEditableMeshFaces(prism, [3], -0.2), "would-collide");
    if (!pulled.ok) expect(pulled.maxDistance).toBe(0);
    const pushed = expectOk(pushPullStudioEditableMeshFaces(prism, [3], 0.2));
    expect(pushed.method).toBe("extrude");
    expectHealthy(pushed.mesh);
    expectVolumeChange(prism, pushed, faceArea(prism, 3), 0.2);
  });

  it("서로 다른 방향의 인접한 면을 함께 밀면 평균 법선으로 영역 밀기를 한다", () => {
    const cube = createStudioUnitCubeMesh();
    const outcome = expectOk(pushPullStudioEditableMeshFaces(cube, [3, 5], 0.2));
    expect(outcome.method).toBe("extrude");
    expect(outcome.extrusion?.receipt.connectedRegionCount).toBe(1);
    expectHealthy(outcome.mesh);
  });
});

describe("밀기/당기기 무작위 입력 불변식(시드 고정)", () => {
  function randomPrism(random: () => number): StudioEditableMesh {
    const corners = 3 + Math.floor(random() * 6);
    const angles = Array.from({ length: corners }, () => random() * Math.PI * 2).sort((a, b) => a - b);
    const gaps = angles.map((angle, index) => (
      (angles[(index + 1) % corners]! - angle + Math.PI * 2) % (Math.PI * 2)
    ));
    if (Math.max(...gaps) > Math.PI * 0.85 || Math.min(...gaps) < 0.15) return randomPrism(random);
    const radius = 0.5 + random() * 1.5;
    const height = 0.4 + random() * 2;
    const right = random() < 0.5;
    const shear = right ? 0 : (random() - 0.5) * 0.6;
    const positions: StudioMeshVec3[] = [
      ...angles.map((angle) => ({ x: Math.cos(angle) * radius, y: 0, z: Math.sin(angle) * radius })),
      ...angles.map((angle) => ({ x: Math.cos(angle) * radius + shear, y: height, z: Math.sin(angle) * radius })),
    ];
    const bottom = Array.from({ length: corners }, (_, index) => index);
    const top = bottom.map((index) => index + corners);
    const sides = bottom.map((index) => [index, (index + 1) % corners, ((index + 1) % corners) + corners, index + corners]);
    let loops: number[][] = [top, [...bottom].reverse(), ...sides];
    let mesh = createStudioEditableMeshFromPolygons(positions, loops);
    if (report(mesh).signedVolume < 0) {
      loops = loops.map((loop) => [...loop].reverse());
      mesh = createStudioEditableMeshFromPolygons(positions, loops);
    }
    return { ...mesh, faces: mesh.faces.map((face) => ({ ...face, smooth: false })) };
  }

  it("범위 안의 임의의 거리는 항상 성공하고 부피가 면적 x 거리만큼 변하며 범위 밖은 거부된다", () => {
    const random = seededRandom(9001);
    let stretched = 0;
    let extruded = 0;
    let rejected = 0;
    for (let round = 0; round < 150; round += 1) {
      const mesh = randomPrism(random);
      const faceId = Math.floor(random() * mesh.faces.length);
      const range = expectOk(studioEditableMeshPushPullRange(mesh, [faceId]));
      const reach = 3;
      const pull = Math.max(range.minDistance, -reach);
      const push = Math.min(range.maxDistance, reach);
      const distance = random() < 0.5 && pull < -1e-3
        ? pull * (0.05 + random() * 0.9)
        : push * (0.05 + random() * 0.9);
      if (Math.abs(distance) < 1e-3) continue;
      const outcome = expectOk(pushPullStudioEditableMeshFaces(mesh, [faceId], distance));
      expect(outcome.method).toBe(range.method);
      expectHealthy(outcome.mesh, `round ${round}`);
      expectVolumeChange(mesh, outcome, faceArea(mesh, faceId), distance);
      if (outcome.method === "stretch") {
        stretched += 1;
        expect(outcome.mesh.faces).toHaveLength(mesh.faces.length);
        expect(outcome.selectionFaceIds).toEqual([faceId]);
      } else {
        extruded += 1;
        expect(outcome.mesh.faces.length).toBeGreaterThan(mesh.faces.length);
      }
      // 범위를 조금 넘으면 양쪽 모두 거부된다(범위 안/밖 경계가 연산과 일치). 한계가 0이어도 마찬가지다.
      for (const beyond of [range.minDistance * 1.01 - 1e-3, range.maxDistance * 1.01 + 1e-3]) {
        if (Math.abs(beyond) >= 100) continue;
        expect(pushPullStudioEditableMeshFaces(mesh, [faceId], beyond).ok, `round ${round} beyond ${beyond}`).toBe(false);
        rejected += 1;
      }
    }
    expect(stretched).toBeGreaterThan(10);
    expect(extruded).toBeGreaterThan(40);
    expect(rejected).toBeGreaterThan(20);
  });

  it("그리기와 밀기/당기기를 섞어 이어서 적용해도 매 단계 불변식이 유지된다", () => {
    const random = seededRandom(9102);
    let steps = 0;
    for (let round = 0; round < 40; round += 1) {
      let mesh = randomPrism(random);
      for (let step = 0; step < 5; step += 1) {
        const faceId = Math.floor(random() * mesh.faces.length);
        const range = studioEditableMeshPushPullRange(mesh, [faceId]);
        if (!range.ok) continue;
        if (random() < 0.4) {
          const inset = insetStudioEditableMeshFacesByDistance(mesh, [faceId], 0.02 + random() * 0.05);
          if (inset.ok) {
            expectHealthy(inset.value.mesh, `inset round ${round}`);
            mesh = inset.value.mesh;
            steps += 1;
          }
          continue;
        }
        const up = Math.min(range.value.maxDistance, 2);
        const down = Math.max(range.value.minDistance, -2);
        const distance = random() < 0.5 && down < -1e-3 ? down * (0.1 + random() * 0.8) : up * (0.1 + random() * 0.8);
        if (Math.abs(distance) < 1e-3) continue;
        const outcome = expectOk(pushPullStudioEditableMeshFaces(mesh, [faceId], distance));
        expectHealthy(outcome.mesh, `push-pull round ${round} step ${step}`);
        expectVolumeChange(mesh, outcome, faceArea(mesh, faceId), distance);
        mesh = outcome.mesh;
        steps += 1;
      }
    }
    expect(steps).toBeGreaterThan(80);
  });
});
