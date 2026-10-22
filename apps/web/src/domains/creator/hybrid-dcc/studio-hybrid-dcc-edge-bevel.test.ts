/**
 * 모서리 모따기(MOD-006): 닫힌 메시는 닫힌 채로, 방향이 일관되고 퇴화 면 없이 돌려줘야 한다.
 *
 * 예전 구현은 모서리 끝점에 닿은 이웃 면을 고치지 않고 모따기 면의 방향도 뒤집어서, 단위 정육면체의 24개 반변
 * 어느 것을 골라도 경계 반변 8개와 방향 충돌 2개가 남는 열린 메시를 돌려줬다. 여기서는 모서리 하나·여러 개·끝점의
 * 모서리 수가 다른 메시(정육면체·정팔면체·오각뿔)와 거부해야 하는 입력을 본다. 무작위 입력은 half-edge 불변식 시험
 * (`studio-hybrid-dcc-half-edge-invariants.test.ts`)에서 본다.
 */
import { describe, expect, it } from "vitest";

import {
  bevelStudioEditableMeshEdges,
  createStudioEditableMeshFromPolygons,
  createStudioUnitCubeMesh,
  extrudeStudioEditableMeshFaces,
  hashStudioEditableMesh,
  insetStudioEditableMeshFaces,
  loopCutStudioEditableMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";

import { analyzeStudioEditableMeshIntegrity } from "./studio-hybrid-dcc-face-modeling-mesh";

/** `from` → `to` 로 쓰이는 반변 id. 없으면 던진다. */
function halfEdgeBetween(mesh: StudioEditableMesh, from: number, to: number): number {
  const found = mesh.halfEdges.find((he) => he.vertex === to && mesh.halfEdges[he.prev]!.vertex === from);
  if (!found) throw new Error(`no half-edge ${from}->${to}`);
  return found.id;
}

function expectClosedSolid(mesh: StudioEditableMesh, label: string) {
  const report = analyzeStudioEditableMeshIntegrity(mesh);
  expect(report.canonical, `canonical ${label}`).toBe(true);
  expect(report.boundaryHalfEdges, `boundary ${label}`).toBe(0);
  expect(report.nonManifoldEdges, `non-manifold ${label}`).toBe(0);
  expect(report.orientationConflicts, `orientation ${label}`).toBe(0);
  expect(report.zeroAreaFaces, `zero-area ${label}`).toEqual([]);
  expect(report.duplicateVertexFaces, `duplicate ${label}`).toEqual([]);
  expect(report.bowTieVertices, `bow-tie ${label}`).toBe(0);
  expect(report.isolatedVertexCount, `isolated ${label}`).toBe(0);
  expect(report.eulerCharacteristic, `euler ${label}`).toBe(2);
  expect(report.signedVolume, `outward ${label}`).toBeGreaterThan(0);
  return report;
}

/** 정팔면체: 모든 꼭짓점의 모서리가 4개다. 꼭짓점 0:+x 1:-x 2:+y 3:-y 4:+z 5:-z. */
function octahedron(): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [
    { x: 1, y: 0, z: 0 }, { x: -1, y: 0, z: 0 },
    { x: 0, y: 1, z: 0 }, { x: 0, y: -1, z: 0 },
    { x: 0, y: 0, z: 1 }, { x: 0, y: 0, z: -1 },
  ];
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

/** 오각뿔: 꼭대기(0번)의 모서리가 5개, 밑면 꼭짓점의 모서리가 3개다. */
function pentagonalPyramid(): StudioEditableMesh {
  const positions: StudioMeshVec3[] = [{ x: 0, y: 1, z: 0 }];
  for (let index = 0; index < 5; index += 1) {
    const angle = (index / 5) * Math.PI * 2;
    positions.push({ x: Math.cos(angle), y: 0, z: Math.sin(angle) });
  }
  const faces: number[][] = [];
  for (let index = 0; index < 5; index += 1) {
    const from = 1 + index;
    const to = 1 + ((index + 1) % 5);
    faces.push([0, to, from]);
  }
  faces.push([1, 2, 3, 4, 5]);
  const mesh = createStudioEditableMeshFromPolygons(positions, faces);
  return analyzeStudioEditableMeshIntegrity(mesh).signedVolume > 0
    ? mesh
    : createStudioEditableMeshFromPolygons(positions, faces.map((face) => [...face].reverse()));
}

describe("모서리 모따기: 단위 정육면체 한 모서리", () => {
  it("24개 반변 어느 것을 골라도 정점 10·면 7·모서리 15인 닫힌 메시를 돌려준다", () => {
    const cube = createStudioUnitCubeMesh();
    expect(cube.halfEdges).toHaveLength(24);
    for (const halfEdge of cube.halfEdges) {
      const result = bevelStudioEditableMeshEdges(cube, [halfEdge.id], 0.1);
      expect(result.ok, `half-edge ${halfEdge.id}`).toBe(true);
      if (!result.ok) continue;
      const report = expectClosedSolid(result.value, `half-edge ${halfEdge.id}`);
      expect(report.usedVertexCount, `vertices ${halfEdge.id}`).toBe(10);
      expect(report.faceCount, `faces ${halfEdge.id}`).toBe(7);
      expect(report.edgeCount, `edges ${halfEdge.id}`).toBe(15);
    }
  });

  it("깎인 부피와 겉넓이가 기하와 맞는다(꼬인 면 없이 단면이 직각삼각형인 프리즘만 깎인다)", () => {
    const cube = createStudioUnitCubeMesh();
    const amount = 0.1;
    const result = bevelStudioEditableMeshEdges(cube, [halfEdgeBetween(cube, 6, 2)], amount);
    if (!result.ok) throw new Error(result.detail);
    const report = expectClosedSolid(result.value, "6-2");
    // 단면: 변 길이 0.1 인 직각삼각형, 길이 1 인 모서리를 따라 깎는다.
    expect(report.signedVolume).toBeCloseTo(1 - 0.5 * amount * amount, 12);
    // 이웃한 두 면은 폭 0.1 의 띠를, 양 끝 면은 직각삼각형 하나씩을 잃고, 빗변 폭 0.1√2 의 모따기 면이 생긴다.
    expect(report.totalArea).toBeCloseTo(6 - 2 * amount - 2 * 0.5 * amount * amount + amount * Math.SQRT2, 12);
    expect(report.nonPlanarFaces).toEqual([]);
  });

  it("고른 반변이 모서리의 양쪽 어느 쪽이든, 두 반변을 함께 줘도 결과가 같다", () => {
    const cube = createStudioUnitCubeMesh();
    const forward = bevelStudioEditableMeshEdges(cube, [halfEdgeBetween(cube, 6, 2)], 0.2);
    const backward = bevelStudioEditableMeshEdges(cube, [halfEdgeBetween(cube, 2, 6)], 0.2);
    const both = bevelStudioEditableMeshEdges(cube, [halfEdgeBetween(cube, 6, 2), halfEdgeBetween(cube, 2, 6)], 0.2);
    if (!forward.ok || !backward.ok || !both.ok) throw new Error("bevel failed");
    expect(hashStudioEditableMesh(backward.value)).toBe(hashStudioEditableMesh(forward.value));
    expect(hashStudioEditableMesh(both.value)).toBe(hashStudioEditableMesh(forward.value));
  });

  it("원본 메시는 바뀌지 않고, 면 속성(평면 음영·재질 칸)은 이어받는다", () => {
    const cube = createStudioUnitCubeMesh();
    const tagged: StudioEditableMesh = {
      ...cube,
      faces: cube.faces.map((face, index) => ({ ...face, materialSlot: index + 1, smooth: false })),
    };
    const hash = hashStudioEditableMesh(tagged);
    const result = bevelStudioEditableMeshEdges(tagged, [halfEdgeBetween(tagged, 6, 2)], 0.1);
    if (!result.ok) throw new Error(result.detail);
    expect(hashStudioEditableMesh(tagged)).toBe(hash);
    // 원래 면은 같은 자리에서 같은 칸을 유지하고, 모따기 면은 그 모서리를 낀 두 면(윗면 4칸·오른쪽 면 6칸) 중 하나의 칸을 이어받는다.
    expect(result.value.faces.slice(0, 6).map((face) => face.materialSlot)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(result.value.faces.every((face) => !face.smooth)).toBe(true);
    const shared = [
      tagged.faces[tagged.halfEdges[halfEdgeBetween(tagged, 6, 2)]!.face]!.materialSlot,
      tagged.faces[tagged.halfEdges[halfEdgeBetween(tagged, 2, 6)]!.face]!.materialSlot,
    ];
    expect(shared).toEqual([4, 6]);
    expect(shared).toContain(result.value.faces[6]!.materialSlot);
  });

  it("모따기한 결과에 또 모따기해도 닫혀 있다", () => {
    const cube = createStudioUnitCubeMesh();
    const first = bevelStudioEditableMeshEdges(cube, [halfEdgeBetween(cube, 6, 2)], 0.1);
    if (!first.ok) throw new Error(first.detail);
    let current = first.value;
    // 첫 모따기와 닿지 않는 모서리(0→1 밑면, 4→7 세로)를 위치로 찾아 차례로 깎는다.
    for (const [from, to] of [
      [{ x: -0.5, y: -0.5, z: -0.5 }, { x: 0.5, y: -0.5, z: -0.5 }],
      [{ x: -0.5, y: -0.5, z: 0.5 }, { x: -0.5, y: 0.5, z: 0.5 }],
    ] as const) {
      const at = (vertexId: number, point: StudioMeshVec3) => {
        const position = current.vertices[vertexId]!.position;
        return Math.hypot(position.x - point.x, position.y - point.y, position.z - point.z) < 1e-9;
      };
      const found = current.halfEdges.find((he) => at(current.halfEdges[he.prev]!.vertex, from) && at(he.vertex, to));
      if (!found) throw new Error("edge not found after the first bevel");
      const next = bevelStudioEditableMeshEdges(current, [found.id], 0.05);
      if (!next.ok) throw new Error(next.detail);
      expectClosedSolid(next.value, "chained bevel");
      current = next.value;
    }
  });
});

describe("모서리 모따기: 여러 모서리", () => {
  const cube = createStudioUnitCubeMesh();
  const edges = (pairs: readonly (readonly [number, number])[]) =>
    pairs.map(([from, to]) => halfEdgeBetween(cube, from, to));

  const cases: readonly {
    readonly name: string;
    readonly pairs: readonly (readonly [number, number])[];
    readonly counts: readonly [number, number, number];
  }[] = [
    { name: "한 꼭짓점에 모인 세 모서리", pairs: [[6, 2], [6, 5], [6, 7]], counts: [13, 10, 21] },
    // 끝이 세 모서리인 꼭짓점에 선택이 둘이면 두 모따기 면이 안쪽 점과 남은 모서리의 점을 잇는 변을 직접 나눠 쓴다(뚜껑 면 없음).
    { name: "한 꼭짓점의 두 모서리", pairs: [[6, 2], [6, 7]], counts: [11, 8, 17] },
    { name: "한 면을 두른 네 모서리", pairs: [[3, 2], [2, 6], [6, 7], [7, 3]], counts: [12, 10, 20] },
    { name: "서로 만나지 않는 두 모서리", pairs: [[6, 2], [0, 4]], counts: [12, 8, 18] },
    { name: "이웃하지만 꼭짓점을 공유하지 않는 두 모서리(같은 면의 마주 보는 변)", pairs: [[3, 2], [7, 6]], counts: [12, 8, 18] },
  ];

  for (const { name, pairs, counts } of cases) {
    it(`${name}: 닫힌 메시이고 정점·면·모서리 수가 맞다`, () => {
      const result = bevelStudioEditableMeshEdges(cube, edges(pairs), 0.1);
      if (!result.ok) throw new Error(result.detail);
      const report = expectClosedSolid(result.value, name);
      expect([report.usedVertexCount, report.faceCount, report.edgeCount]).toEqual(counts);
    });
  }

  it("12개 모서리를 모두 깎으면 정점 24·면 26·모서리 48이다", () => {
    const every = [...new Set(cube.halfEdges.map((he) => Math.min(he.id, he.twin)))];
    expect(every).toHaveLength(12);
    const result = bevelStudioEditableMeshEdges(cube, every, 0.1);
    if (!result.ok) throw new Error(result.detail);
    const report = expectClosedSolid(result.value, "all edges");
    expect([report.usedVertexCount, report.faceCount, report.edgeCount]).toEqual([24, 26, 48]);
  });
});

describe("모서리 모따기: 끝점의 모서리 수가 다른 메시", () => {
  it("정팔면체(모든 꼭짓점의 모서리 4개): 한 모서리를 깎으면 정점 10·면 11·모서리 19이고 끝점이 남는다", () => {
    const mesh = octahedron();
    expectClosedSolid(mesh, "octahedron");
    const result = bevelStudioEditableMeshEdges(mesh, [halfEdgeBetween(mesh, 0, 2)], 0.2);
    if (!result.ok) throw new Error(result.detail);
    const report = expectClosedSolid(result.value, "octahedron bevel");
    expect([report.usedVertexCount, report.faceCount, report.edgeCount]).toEqual([10, 11, 19]);
  });

  it("정팔면체의 모서리 여러 개(이웃·반대·전체)도 닫힌 메시를 돌려준다", () => {
    const mesh = octahedron();
    const every = [...new Set(mesh.halfEdges.map((he) => Math.min(he.id, he.twin)))];
    expect(every).toHaveLength(12);
    const selections: readonly (readonly number[])[] = [
      [halfEdgeBetween(mesh, 0, 2), halfEdgeBetween(mesh, 2, 1)],
      [halfEdgeBetween(mesh, 0, 2), halfEdgeBetween(mesh, 0, 3), halfEdgeBetween(mesh, 0, 4)],
      [halfEdgeBetween(mesh, 0, 2), halfEdgeBetween(mesh, 1, 3)],
      [halfEdgeBetween(mesh, 0, 2), halfEdgeBetween(mesh, 2, 1), halfEdgeBetween(mesh, 1, 3), halfEdgeBetween(mesh, 3, 0)],
      every,
    ];
    selections.forEach((selection, index) => {
      const result = bevelStudioEditableMeshEdges(mesh, selection, 0.1);
      if (!result.ok) throw new Error(`selection ${index}: ${result.detail}`);
      expectClosedSolid(result.value, `octahedron selection ${index}`);
    });
  });

  it("오각뿔(꼭대기 모서리 5개): 꼭대기에서 밑면으로 내려오는 모서리와 밑면 모서리 모두 닫힌 메시를 돌려준다", () => {
    const mesh = pentagonalPyramid();
    expectClosedSolid(mesh, "pyramid");
    const slopes = [1, 2, 3, 4, 5].map((base) => halfEdgeBetween(mesh, 0, base));
    const rim = [1, 2, 3, 4, 5].map((base) => halfEdgeBetween(mesh, base, 1 + (base % 5)));
    for (const [name, selection] of [
      ["비탈 모서리 하나", [slopes[0]!]],
      ["비탈 모서리 둘", [slopes[0]!, slopes[2]!]],
      ["꼭대기의 모든 모서리", slopes],
      ["밑면 둘레", rim],
      ["모든 모서리", [...slopes, ...rim]],
    ] as const) {
      const result = bevelStudioEditableMeshEdges(mesh, selection, 0.1);
      if (!result.ok) throw new Error(`${name}: ${result.detail}`);
      expectClosedSolid(result.value, `pyramid ${name}`);
    }
  });
});

describe("모서리 모따기: 일직선 모서리가 지나는 꼭짓점", () => {
  function allEdges(mesh: StudioEditableMesh): number[] {
    return [...new Set(mesh.halfEdges.map((he) => (he.twin >= 0 ? Math.min(he.id, he.twin) : he.id)))];
  }

  it("면을 밀어 낸 덩어리의 평평한 고리 모서리를 깎아도 닫혀 있고 넓이 0인 면이 없다", () => {
    const extruded = extrudeStudioEditableMeshFaces(createStudioUnitCubeMesh(), [0], 0.3);
    if (!extruded.ok) throw new Error(extruded.detail);
    expectClosedSolid(extruded.value, "extruded");
    // 0→1 은 원래 정육면체 면과 밀어 낸 벽이 맞닿는 평평한 고리 모서리다. 양 끝 꼭짓점에서 세로 모서리 둘이 일직선이다.
    const result = bevelStudioEditableMeshEdges(extruded.value, [halfEdgeBetween(extruded.value, 0, 1)], 0.15);
    if (!result.ok) throw new Error(result.detail);
    expectClosedSolid(result.value, "flat ring edge");
  });

  for (const [name, build] of [
    ["정육면체", () => createStudioUnitCubeMesh()],
    ["밀어 낸 덩어리", () => {
      const result = extrudeStudioEditableMeshFaces(createStudioUnitCubeMesh(), [0], 0.3);
      if (!result.ok) throw new Error(result.detail);
      return result.value;
    }],
    ["안쪽 테두리를 낸 덩어리", () => {
      const result = insetStudioEditableMeshFaces(createStudioUnitCubeMesh(), [0], 0.2);
      if (!result.ok) throw new Error(result.detail);
      return result.value;
    }],
    ["가운데 절단선을 넣은 정육면체", () => {
      const cube = createStudioUnitCubeMesh();
      const result = loopCutStudioEditableMesh(cube, cube.halfEdges[0]!.id, 0.5);
      if (!result.ok) throw new Error(result.detail);
      return result.value;
    }],
  ] as const) {
    it(`${name}: 모서리를 하나씩 모두 깎아 보면 어느 것도 열린 메시를 돌려주지 않는다`, () => {
      const mesh = build();
      expectClosedSolid(mesh, name);
      let bevelled = 0;
      for (const id of allEdges(mesh)) {
        for (const amount of [0.1, 0.3]) {
          const result = bevelStudioEditableMeshEdges(mesh, [id], amount);
          // 작은 값(0.1)은 모두 깎여야 한다. 큰 값(0.3)은 좁은 고리 폭을 넘어 접힐 수 있어 거절해도 되지만(이유 코드가 있다)
          // 열리거나 뒤틀린 메시를 돌려주는 일은 없어야 한다.
          if (!result.ok) {
            expect(amount, `${name} edge ${id}: ${result.detail}`).toBeGreaterThan(0.1);
            expect(result.code).toBe("topology-failed");
            continue;
          }
          expectClosedSolid(result.value, `${name} edge ${id} amount ${amount}`);
          bevelled += 1;
        }
      }
      expect(bevelled).toBeGreaterThanOrEqual(allEdges(mesh).length);
    });
  }
});

describe("모서리 모따기: 열린 메시를 돌려주는 대신 거절하는 입력", () => {
  const fail = (result: ReturnType<typeof bevelStudioEditableMeshEdges>) => {
    expect(result.ok).toBe(false);
    return result.ok ? null : result;
  };

  it("경계 모서리(면이 한쪽뿐)는 거절한다", () => {
    const sheet = createStudioEditableMeshFromPolygons(
      [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }],
      [[0, 1, 2, 3]],
    );
    const result = fail(bevelStudioEditableMeshEdges(sheet, [0], 0.1));
    expect(result?.code).toBe("topology-failed");
    expect(result?.detail).toContain("boundary");
  });

  it("열린 경계에 닿은 꼭짓점을 끝점으로 하는 안쪽 모서리도 거절한다", () => {
    const strip = createStudioEditableMeshFromPolygons(
      [
        { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 2, y: 0, z: 0 },
        { x: 0, y: 1, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 2, y: 1, z: 0 },
      ],
      [[0, 1, 4, 3], [1, 2, 5, 4]],
    );
    const result = fail(bevelStudioEditableMeshEdges(strip, [halfEdgeBetween(strip, 1, 4)], 0.1));
    expect(result?.code).toBe("topology-failed");
    expect(result?.detail).toContain("open boundary");
  });

  it("세 면이 만나는 모서리는 비다양체로 거절한다", () => {
    const fin = createStudioEditableMeshFromPolygons(
      [
        { x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 },
        { x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 },
      ],
      [[0, 1, 2], [1, 0, 3], [0, 1, 4]],
    );
    const result = fail(bevelStudioEditableMeshEdges(fin, [halfEdgeBetween(fin, 0, 1)], 0.1));
    expect(result?.code).toBe("non-manifold");
  });

  it("잘못된 입력은 이유 코드로 거절한다", () => {
    const cube = createStudioUnitCubeMesh();
    expect(fail(bevelStudioEditableMeshEdges(cube, [0], 0))?.code).toBe("invalid-parameter");
    expect(fail(bevelStudioEditableMeshEdges(cube, [0], Number.NaN))?.code).toBe("invalid-parameter");
    expect(fail(bevelStudioEditableMeshEdges(cube, [], 0.1))?.code).toBe("empty-selection");
    expect(fail(bevelStudioEditableMeshEdges(cube, [9999], 0.1))?.code).toBe("not-found");
  });

  it("거절해도 원본은 그대로이다", () => {
    const sheet = createStudioEditableMeshFromPolygons(
      [{ x: 0, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 1, y: 1, z: 0 }, { x: 0, y: 1, z: 0 }],
      [[0, 1, 2, 3]],
    );
    const hash = hashStudioEditableMesh(sheet);
    bevelStudioEditableMeshEdges(sheet, [0], 0.1);
    expect(hashStudioEditableMesh(sheet)).toBe(hash);
  });
});
