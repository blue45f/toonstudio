/**
 * half-edge 편집 연산의 불변식 시험(시드 고정).
 *
 * 임의의 볼록 기둥·기울어진 뿔대(회전·이동 포함)에 기존 연산(영역 밀기, 안쪽 테두리, 모서리 모따기,
 * 루프 컷, 나이프)과 면 모델링 연산을 이어 적용해도 메시가 닫혀 있고(경계 반변 없음, 비다양체 없음),
 * 이웃 면이 같은 방향을 보고(법선 일관), 면적 0인 면이 없고, 저장·복원해도 같은 메시인지 확인한다.
 * 연산은 거부(이유 코드)하거나 건강한 메시를 돌려줘야 하며 깨진 메시를 돌려주는 일은 없어야 한다.
 * 연속 적용 뒤 되돌리기·다시 실행이 단계마다 메시 해시와 문서 상태 해시를 정확히 복원하는지도 본다.
 */
import { describe, expect, it } from "vitest";

import {
  bevelStudioEditableMeshEdges,
  createStudioEditableMeshFromPolygons,
  deserializeStudioEditableMesh,
  extrudeStudioEditableMeshFacesWithReceipt,
  hashStudioEditableMesh,
  insetStudioEditableMeshFaces,
  knifeStudioEditableMesh,
  loopCutStudioEditableMesh,
  serializeStudioEditableMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import {
  createStudioHybridDccComponentSelection,
  mutateStudioHybridDccComponentSelection,
  type StudioHybridDccComponentSelection,
} from "./studio-hybrid-dcc-component-selection";
import { buildStudioPlanarFrame } from "./studio-hybrid-dcc-face-modeling-geometry";
import {
  analyzeStudioEditableMeshIntegrity,
  readStudioMeshFaceLoops,
  studioFaceCornerPositions,
  type StudioMeshIntegrityReport,
} from "./studio-hybrid-dcc-face-modeling-mesh";
import {
  commitStudioHybridDccFaceModeling,
  planStudioHybridDccFaceModeling,
  studioHybridDccFaceDrawingGuide,
  studioHybridDccFaceModelingRange,
  type StudioFaceModelingRequest,
} from "./studio-hybrid-dcc-face-modeling-workspace";
import {
  createStudioHybridDccWorkspace,
  workspaceAddUnitCube,
  workspaceComponentSelectionSource,
  workspaceRedo,
  workspaceUndo,
  type StudioHybridDccWorkspace,
} from "./studio-hybrid-dcc-workspace";

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

function report(mesh: StudioEditableMesh): StudioMeshIntegrityReport {
  return analyzeStudioEditableMeshIntegrity(mesh);
}

function rotate(point: StudioMeshVec3, angles: readonly [number, number, number]): StudioMeshVec3 {
  const [ax, ay, az] = angles;
  const y1 = point.y * Math.cos(ax) - point.z * Math.sin(ax);
  const z1 = point.y * Math.sin(ax) + point.z * Math.cos(ax);
  const x2 = point.x * Math.cos(ay) + z1 * Math.sin(ay);
  const z2 = -point.x * Math.sin(ay) + z1 * Math.cos(ay);
  return { x: x2 * Math.cos(az) - y1 * Math.sin(az), y: x2 * Math.sin(az) + y1 * Math.cos(az), z: z2 };
}

/** 임의의 볼록 n각 기둥(또는 뿔대)을 임의로 돌려 놓은 닫힌 메시. 면 방향은 바깥쪽이다. */
function randomSolid(random: () => number): StudioEditableMesh {
  const corners = 3 + Math.floor(random() * 6);
  // 각도를 고르게 나눈 볼록 밑면(반지름은 조금씩 달라도 볼록이 유지되도록 타원으로 만든다).
  const rx = 0.5 + random() * 1.2;
  const rz = 0.5 + random() * 1.2;
  const phase = random() * Math.PI;
  const base = Array.from({ length: corners }, (_, index) => {
    const angle = phase + (index / corners) * Math.PI * 2;
    return [Math.cos(angle) * rx, Math.sin(angle) * rz] as const;
  });
  const height = 0.5 + random() * 1.5;
  const taper = random() < 0.4 ? 1 : 0.4 + random() * 0.5;
  const angles: [number, number, number] = [random() * 6.28, random() * 6.28, random() * 6.28];
  const offset: StudioMeshVec3 = { x: (random() - 0.5) * 8, y: (random() - 0.5) * 8, z: (random() - 0.5) * 8 };
  const positions = [
    ...base.map(([x, z]) => ({ x, y: 0, z })),
    ...base.map(([x, z]) => ({ x: x * taper, y: height, z: z * taper })),
  ].map((point) => {
    const turned = rotate(point, angles);
    return { x: turned.x + offset.x, y: turned.y + offset.y, z: turned.z + offset.z };
  });
  const bottom = Array.from({ length: corners }, (_, index) => index);
  const top = bottom.map((index) => index + corners);
  const sides = bottom.map((index) => {
    const next = (index + 1) % corners;
    return [index, next, next + corners, index + corners];
  });
  const loops = [top, [...bottom].reverse(), ...sides];
  const mesh = createStudioEditableMeshFromPolygons(positions, loops);
  if (report(mesh).signedVolume >= 0) return mesh;
  return createStudioEditableMeshFromPolygons(positions, loops.map((loop) => [...loop].reverse()));
}

function faceArea(mesh: StudioEditableMesh, faceId: number): number {
  const loop = readStudioMeshFaceLoops(mesh)!.find((candidate) => candidate.id === faceId)!;
  return buildStudioPlanarFrame(studioFaceCornerPositions(mesh, loop.vertexIds))?.area ?? 0;
}

/** 위상 불변식: 모든 연산이 공통으로 지켜야 하는 것만 본다(볼록·평면은 연산마다 달라 따로 본다). */
function expectTopologyHealthy(mesh: StudioEditableMesh, label: string) {
  const result = report(mesh);
  expect(result.canonical, `canonical ${label}`).toBe(true);
  expect(result.boundaryHalfEdges, `boundary ${label}`).toBe(0);
  expect(result.nonManifoldEdges, `non-manifold ${label}`).toBe(0);
  expect(result.orientationConflicts, `orientation ${label}`).toBe(0);
  expect(result.zeroAreaFaces, `zero-area ${label}`).toEqual([]);
  expect(result.duplicateVertexFaces, `duplicate ${label}`).toEqual([]);
  expect(result.bowTieVertices, `bow-tie ${label}`).toBe(0);
  expect(result.isolatedVertexCount, `isolated ${label}`).toBe(0);
  expect(result.eulerCharacteristic, `euler ${label}`).toBe(2);
  expect(result.signedVolume, `outward ${label}`).toBeGreaterThan(0);
  const restored = deserializeStudioEditableMesh(serializeStudioEditableMesh(mesh));
  expect(hashStudioEditableMesh(restored), `roundtrip ${label}`).toBe(hashStudioEditableMesh(mesh));
  return result;
}

const ROUNDS = 80;

describe("half-edge 연산 불변식(시드 고정)", () => {
  it("영역 밀기(바깥): 닫힘·방향·퇴화 없음이 유지되고 부피는 면적 x 거리만큼 늘어난다", () => {
    const random = seededRandom(31001);
    let checked = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const mesh = randomSolid(random);
      const before = expectTopologyHealthy(mesh, `source ${round}`);
      const faceId = Math.floor(random() * mesh.faces.length);
      const distance = (0.02 + random() * 0.6) * Math.sqrt(before.totalArea / mesh.faces.length);
      const result = extrudeStudioEditableMeshFacesWithReceipt(mesh, [faceId], distance);
      if (!result.ok) continue;
      checked += 1;
      const after = expectTopologyHealthy(result.value.mesh, `extrude ${round}`);
      const expected = before.signedVolume + faceArea(mesh, faceId) * distance;
      expect(Math.abs(after.signedVolume - expected), `volume ${round}`).toBeLessThanOrEqual(expected * 1e-8);
    }
    expect(checked).toBeGreaterThan(ROUNDS * 0.9);
  });

  it("안쪽 테두리(비율): 부피와 겉넓이가 그대로이고 면만 늘어난다", () => {
    const random = seededRandom(31002);
    let checked = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const mesh = randomSolid(random);
      const before = expectTopologyHealthy(mesh, `source ${round}`);
      const faceId = Math.floor(random() * mesh.faces.length);
      const result = insetStudioEditableMeshFaces(mesh, [faceId], 0.05 + random() * 0.4);
      if (!result.ok) continue;
      checked += 1;
      const after = expectTopologyHealthy(result.value, `inset ${round}`);
      expect(result.value.faces.length).toBeGreaterThan(mesh.faces.length);
      expect(Math.abs(after.signedVolume - before.signedVolume), `volume ${round}`).toBeLessThanOrEqual(before.signedVolume * 1e-9);
      expect(Math.abs(after.totalArea - before.totalArea), `area ${round}`).toBeLessThanOrEqual(before.totalArea * 1e-9);
    }
    expect(checked).toBeGreaterThan(ROUNDS * 0.9);
  });

  it("모서리 모따기: 모서리 하나~셋을 깎아도 닫힘·방향·퇴화 없음이 유지되고 부피는 줄어든다", () => {
    const random = seededRandom(31003);
    let checked = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const mesh = randomSolid(random);
      const before = expectTopologyHealthy(mesh, `source ${round}`);
      const count = 1 + Math.floor(random() * 3);
      const picked = Array.from({ length: count }, () => mesh.halfEdges[Math.floor(random() * mesh.halfEdges.length)]!.id);
      const result = bevelStudioEditableMeshEdges(mesh, picked, 0.05 + random() * 0.35);
      if (!result.ok) continue;
      checked += 1;
      const after = expectTopologyHealthy(result.value, `bevel ${round}`);
      expect(result.value.faces.length, `faces ${round}`).toBeGreaterThan(mesh.faces.length);
      expect(after.signedVolume, `volume ${round}`).toBeLessThan(before.signedVolume);
    }
    expect(checked).toBeGreaterThan(ROUNDS * 0.9);
  });

  // 예전 구현은 단위 정육면체의 24개 반변 모두에서 경계 반변 8개와 방향 충돌 2개가 남는 열린 메시를 돌려줬다
  // (끝점에 닿은 이웃 면을 함께 고치지 않고 모따기 면 방향도 뒤집혀 있었다). 그 회귀를 그대로 지킨다.
  it("모서리 모따기: 단위 정육면체의 24개 반변 어느 것을 골라도 닫힌 메시를 돌려준다", () => {
    const cube = createStudioEditableMeshFromPolygons(
      [
        { x: -0.5, y: -0.5, z: -0.5 }, { x: 0.5, y: -0.5, z: -0.5 }, { x: 0.5, y: 0.5, z: -0.5 }, { x: -0.5, y: 0.5, z: -0.5 },
        { x: -0.5, y: -0.5, z: 0.5 }, { x: 0.5, y: -0.5, z: 0.5 }, { x: 0.5, y: 0.5, z: 0.5 }, { x: -0.5, y: 0.5, z: 0.5 },
      ],
      [[3, 2, 1, 0], [4, 5, 6, 7], [0, 1, 5, 4], [2, 3, 7, 6], [1, 2, 6, 5], [3, 0, 4, 7]],
    );
    expect(report(cube).closed).toBe(true);
    expect(cube.halfEdges).toHaveLength(24);
    for (const halfEdge of cube.halfEdges) {
      const result = bevelStudioEditableMeshEdges(cube, [halfEdge.id], 0.1);
      expect(result.ok, `half-edge ${halfEdge.id}`).toBe(true);
      if (result.ok) expectTopologyHealthy(result.value, `half-edge ${halfEdge.id}`);
    }
  });

  it("루프 컷: 모양(부피·겉넓이)은 그대로이고 닫힘·방향이 유지된다", () => {
    const random = seededRandom(31004);
    let checked = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const mesh = randomSolid(random);
      const before = expectTopologyHealthy(mesh, `source ${round}`);
      const halfEdge = mesh.halfEdges[Math.floor(random() * mesh.halfEdges.length)]!;
      const result = loopCutStudioEditableMesh(mesh, halfEdge.id, 0.2 + random() * 0.6);
      if (!result.ok) continue;
      checked += 1;
      const after = expectTopologyHealthy(result.value, `loop cut ${round}`);
      expect(Math.abs(after.signedVolume - before.signedVolume), `volume ${round}`).toBeLessThanOrEqual(before.signedVolume * 1e-9);
      expect(Math.abs(after.totalArea - before.totalArea), `area ${round}`).toBeLessThanOrEqual(before.totalArea * 1e-9);
    }
    expect(checked).toBeGreaterThan(ROUNDS * 0.8);
  });

  it("나이프: 어느 평면으로 잘라도 모양(부피·겉넓이)이 그대로이고 닫혀 있다", () => {
    const random = seededRandom(31005);
    let checked = 0;
    for (let round = 0; round < ROUNDS; round += 1) {
      const mesh = randomSolid(random);
      const before = expectTopologyHealthy(mesh, `source ${round}`);
      const centroid = mesh.vertices.reduce(
        (sum, vertex) => ({
          x: sum.x + vertex.position.x / mesh.vertices.length,
          y: sum.y + vertex.position.y / mesh.vertices.length,
          z: sum.z + vertex.position.z / mesh.vertices.length,
        }),
        { x: 0, y: 0, z: 0 },
      );
      const normal = { x: random() - 0.5, y: random() - 0.5, z: random() - 0.5 };
      const result = knifeStudioEditableMesh(mesh, { point: centroid, normal });
      if (!result.ok) continue;
      checked += 1;
      const after = expectTopologyHealthy(result.value, `knife ${round}`);
      // 나이프는 단정밀도 삼각형 수프를 거쳐 다시 만들므로 상대 오차 1e-5(약 6자리)까지 같다고 본다.
      expect(Math.abs(after.signedVolume - before.signedVolume), `volume ${round}`).toBeLessThanOrEqual(before.signedVolume * 1e-5);
      expect(Math.abs(after.totalArea - before.totalArea), `area ${round}`).toBeLessThanOrEqual(before.totalArea * 1e-5);
    }
    expect(checked).toBeGreaterThan(ROUNDS * 0.8);
  });
});

function cubeWorkspace(): StudioHybridDccWorkspace {
  return workspaceAddUnitCube(createStudioHybridDccWorkspace("invariants"), "cube");
}

function faceSelection(workspace: StudioHybridDccWorkspace, ids: readonly number[]): StudioHybridDccComponentSelection {
  const result = mutateStudioHybridDccComponentSelection(createStudioHybridDccComponentSelection(), {
    mode: "face",
    operation: "replace",
    ids,
    activeId: ids.at(-1),
    source: workspaceComponentSelectionSource(workspace)!,
  });
  if (!result.ok) throw new Error(result.diagnostics.map(({ message }) => message).join(" · "));
  return result.value;
}

/** 현재 선택과 메시에서 유효한 임의의 요청 하나. 어느 도구든 범위 안의 거리/도형으로 만든다. */
function randomRequest(
  random: () => number,
  workspace: StudioHybridDccWorkspace,
  selection: StudioHybridDccComponentSelection,
): StudioFaceModelingRequest {
  const tool = (["push-pull", "inset", "offset", "draw"] as const)[Math.floor(random() * 4)]!;
  if (tool === "draw") {
    const guide = studioHybridDccFaceDrawingGuide(workspace, selection);
    if (!guide.ok) return { tool: "inset", distance: 0.01 };
    const outline = guide.value.outline;
    const center: [number, number] = [
      outline.reduce((sum, point) => sum + point[0], 0) / outline.length,
      outline.reduce((sum, point) => sum + point[1], 0) / outline.length,
    ];
    const radius = 0.05 + random() * 0.1;
    const corners = 3 + Math.floor(random() * 4);
    return {
      tool,
      points: Array.from({ length: corners }, (_, index) => {
        const angle = (index / corners) * Math.PI * 2;
        return [center[0] + Math.cos(angle) * radius, center[1] + Math.sin(angle) * radius] as const;
      }),
    };
  }
  const direction = random() < 0.5 ? "inward" : "outward";
  const range = studioHybridDccFaceModelingRange(workspace, selection, tool, direction);
  if (!range.ok) return { tool: "inset", distance: 0.01 };
  const low = tool === "push-pull" ? range.value.minDistance : 0;
  const high = Math.min(range.value.maxDistance, 1);
  const distance = Math.max(0.002, low + random() * (high - low)) * (random() < 0.15 ? 1.5 : 0.9);
  return tool === "offset" ? { tool, distance, direction } : { tool, distance };
}

describe("면 모델링 연속 적용의 불변식과 되돌리기(시드 고정)", () => {
  it("무작위 연산을 이어 적용해도 매 단계 메시가 건강하고, 한 번씩 되돌리고 다시 실행하면 단계마다 정확히 복원된다", () => {
    const random = seededRandom(32001);
    let applied = 0;
    let rejected = 0;
    for (let round = 0; round < 40; round += 1) {
      let workspace = cubeWorkspace();
      let selection = faceSelection(workspace, [Math.floor(random() * 6)]);
      const meshHashes = [workspace.session.state.geometry.records.cube!.meshHash];
      const stateHashes = [workspace.session.state.stateHash];
      const steps = 2 + Math.floor(random() * 5);
      for (let step = 0; step < steps; step += 1) {
        const request = randomRequest(random, workspace, selection);
        const plan = planStudioHybridDccFaceModeling(workspace, selection, request);
        if (!plan.ok) {
          // 거부된 요청은 작업공간을 한 글자도 바꾸지 않는다.
          rejected += 1;
          const again = planStudioHybridDccFaceModeling(workspace, selection, request);
          expect(again.ok).toBe(false);
          expect(workspace.session.state.stateHash).toBe(stateHashes.at(-1));
          continue;
        }
        const result = commitStudioHybridDccFaceModeling(workspace, selection, request);
        workspace = result.workspace;
        selection = result.selection!;
        applied += 1;
        const record = workspace.session.state.geometry.records.cube!;
        const health = report(record.mesh);
        expect(health.closed, `closed round ${round} step ${step}`).toBe(true);
        expect(health.zeroAreaFaces, `zero-area round ${round} step ${step}`).toEqual([]);
        expect(health.canonical, `canonical round ${round} step ${step}`).toBe(true);
        expect(health.signedVolume, `volume round ${round} step ${step}`).toBeGreaterThan(0);
        meshHashes.push(record.meshHash);
        stateHashes.push(workspace.session.state.stateHash);
      }
      const final = workspace;
      for (let step = meshHashes.length - 2; step >= 0; step -= 1) {
        workspace = workspaceUndo(workspace);
        expect(workspace.session.state.geometry.records.cube!.meshHash, `undo mesh ${round}/${step}`).toBe(meshHashes[step]);
        expect(workspace.session.state.stateHash, `undo state ${round}/${step}`).toBe(stateHashes[step]);
      }
      for (let step = 1; step < meshHashes.length; step += 1) {
        workspace = workspaceRedo(workspace);
        expect(workspace.session.state.geometry.records.cube!.meshHash, `redo mesh ${round}/${step}`).toBe(meshHashes[step]);
      }
      expect(workspace.session.state.stateHash).toBe(final.session.state.stateHash);
    }
    // 시험이 비어 있지 않도록: 적용된 단계가 충분하고 거부 경로도 지나갔는지 확인한다.
    expect(applied).toBeGreaterThan(60);
    expect(rejected).toBeGreaterThan(0);
  });
});
