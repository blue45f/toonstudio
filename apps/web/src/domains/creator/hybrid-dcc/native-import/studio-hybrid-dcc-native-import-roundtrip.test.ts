// @vitest-environment jsdom
import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { hashStudioEditableMesh, type StudioEditableMesh } from "../../studio-editable-half-edge-mesh";
import { exportStudioHybridDccMeshGlb } from "../studio-hybrid-dcc-glb-export";
import { workspaceUnwrapUvActive } from "../studio-hybrid-dcc-uv-edit";
import { workspacePackUvActive } from "../studio-hybrid-dcc-uv-pack-workspace";
import { decodeStudioHybridDccWorkfile, encodeStudioHybridDccWorkfile } from "../studio-hybrid-dcc-workfile";
import { createStudioHybridDccWorkspace, workspaceAddUnitCube, workspaceImportBytes, workspaceSculptActive, workspaceUndo, type StudioHybridDccWorkspace } from "../studio-hybrid-dcc-workspace";
import { deriveStudioHybridDccViewportSnapshot } from "../StudioHybridDccViewportCore";

function active(workspace: StudioHybridDccWorkspace) {
  const record = workspace.session.state.geometry.records[workspace.activeAssetId ?? ""];
  if (!record) throw new Error("편집할 가져온 자산이 없습니다."); return record;
}
function glb(workspace: StudioHybridDccWorkspace): Uint8Array {
  const record = active(workspace);
  const output = exportStudioHybridDccMeshGlb({ assetId: record.assetId, mesh: record.mesh, sourceHash: record.meshHash, sourceRevision: record.revision });
  if (!output.ok) throw new Error(JSON.stringify(output.report.errors)); return output.bytes;
}
interface VertexUvCorner {
  readonly vertexId: number;
  readonly u: number;
  readonly v: number;
  readonly materialSlot: number;
}

/** Sculpt가 유지하는 원본 정점 ID로 UV를 읽는다. production planner/remap은 oracle로 쓰지 않는다. */
function triangleVertexUvCorners(mesh: StudioEditableMesh): readonly (readonly VertexUvCorner[])[] {
  return mesh.faces.map((face) => {
    const corners: VertexUvCorner[] = [];
    let id = face.he;
    do {
      const edge = mesh.halfEdges[id]; const previous = edge ? mesh.halfEdges[edge.prev] : undefined;
      const vertex = previous ? mesh.vertices[previous.vertex] : undefined; const uv = mesh.uvLayer?.corners[id];
      if (!edge || !previous || !vertex || vertex.id !== previous.vertex || !uv || uv.halfEdgeId !== id || corners.length >= 3) {
        throw new Error("삼각형의 원본 정점 ID·UV 코너 대응이 없습니다.");
      }
      corners.push({ vertexId: vertex.id, u: uv.u, v: uv.v, materialSlot: face.materialSlot });
      id = edge.next;
    } while (id !== face.he);
    if (corners.length !== 3) throw new Error("조형 전후 삼각형의 코너 수가 다릅니다.");
    return corners;
  });
}

/** 시작점의 순환 회전만 허용한다. 같은 삼각형도 한 번씩 소비해 중복·누락과 seam을 보존한다. */
function sameVertexUvTriangles(expected: readonly (readonly VertexUvCorner[])[], actual: readonly (readonly VertexUvCorner[])[]): boolean {
  if (expected.length !== actual.length) return false;
  const remaining = new Set(actual.keys());
  for (const triangle of expected) {
    if (triangle.length !== 3) return false;
    const match = [...remaining].find((index) => {
      const candidate = actual[index];
      if (!candidate || candidate.length !== 3) return false;
      return [0, 1, 2].some((rotation) => triangle.every((corner, offset) => {
        const next = candidate[(offset + rotation) % 3];
        return next !== undefined && corner.vertexId === next.vertexId && corner.u === next.u && corner.v === next.v
          && corner.materialSlot === next.materialSlot;
      }));
    });
    if (match === undefined) return false;
    remaining.delete(match);
  }
  return remaining.size === 0;
}

function triangleCorners(mesh: StudioEditableMesh) {
  return mesh.faces.map((face) => {
    const corners: Array<{ readonly point: readonly number[]; readonly u: number; readonly v: number; readonly materialSlot: number }> = [];
    let id = face.he;
    do {
      const edge = mesh.halfEdges[id]; const previous = edge ? mesh.halfEdges[edge.prev] : undefined;
      const position = previous ? mesh.vertices[previous.vertex]?.position : undefined; const uv = mesh.uvLayer?.corners[id];
      if (!edge || !position || !uv) throw new Error("삼각형의 원본 위치·UV가 없습니다.");
      corners.push({ point: [position.x, position.y, position.z], u: uv.u, v: uv.v, materialSlot: face.materialSlot }); id = edge.next;
    } while (id !== face.he);
    expect(corners).toHaveLength(3); return corners;
  });
}

describe("파일에서 시작하는 실제 웹 메시 제작 흐름", () => {
  it("정점·UV·재질 삼각형 비교는 순환 회전만 허용하고 UV 이동·역방향·seam 유실·중복·누락을 거부한다", () => {
    const a: VertexUvCorner = { vertexId: 0, u: .1, v: .2, materialSlot: 4 };
    const b: VertexUvCorner = { vertexId: 1, u: .8, v: .3, materialSlot: 4 };
    const c: VertexUvCorner = { vertexId: 2, u: .4, v: .9, materialSlot: 4 };
    const d: VertexUvCorner = { vertexId: 0, u: .6, v: .7, materialSlot: 9 };
    const e: VertexUvCorner = { vertexId: 2, u: .2, v: .8, materialSlot: 9 };
    const f: VertexUvCorner = { vertexId: 3, u: .9, v: .1, materialSlot: 9 };
    const first = [a, b, c], second = [d, e, f], expected = [first, second];
    expect(sameVertexUvTriangles(expected, [[e, f, d], [b, c, a]])).toBe(true);
    expect(sameVertexUvTriangles(expected, [[
      { ...a, u: b.u, v: b.v }, { ...b, u: c.u, v: c.v }, { ...c, u: a.u, v: a.v },
    ], second])).toBe(false);
    expect(sameVertexUvTriangles(expected, [[a, c, b], second])).toBe(false);
    expect(sameVertexUvTriangles(expected, [first, first])).toBe(false);
    expect(sameVertexUvTriangles(expected, [first])).toBe(false);
    expect(sameVertexUvTriangles(expected, [first, [{ ...d, u: a.u, v: a.v }, e, f]])).toBe(false);
    expect(sameVertexUvTriangles(expected, [first.map((corner) => ({ ...corner, materialSlot: 9 })), second])).toBe(false);
  });

  it("GLB 파일→편집 원본→조형→UV 정리→작업파일→GLB 재진입에서 geometry와 UV를 유지한다", () => {
    const authored = workspaceUnwrapUvActive(workspaceAddUnitCube(createStudioHybridDccWorkspace("file-author"), "cube"));
    const imported = workspaceImportBytes(createStudioHybridDccWorkspace("file-editor"), "cube.glb", Uint8Array.from(glb(authored)));
    expect(active(imported).mesh.faces).toHaveLength(12); expect(active(imported).mesh.uvLayer?.corners).toHaveLength(36);
    const sculpted = workspaceSculptActive(imported, { kind: "grab", center: { x: 0.5, y: 0.5, z: 0.5 }, radius: 2, strength: 0.05, direction: { x: 1, y: 0.5, z: -0.25 } });
    const importedMesh = active(imported).mesh, sculptedMesh = active(sculpted).mesh;
    expect(sculptedMesh.vertices).toHaveLength(importedMesh.vertices.length);
    expect(sculptedMesh.vertices.map(({ id }) => id)).toEqual(importedMesh.vertices.map(({ id }) => id));
    expect(sculptedMesh.vertices.map(({ position }) => position)).not.toEqual(importedMesh.vertices.map(({ position }) => position));
    expect(sameVertexUvTriangles(triangleVertexUvCorners(importedMesh), triangleVertexUvCorners(sculptedMesh))).toBe(true);
    const packed = workspacePackUvActive(sculpted);
    expect(active(packed).mesh.vertices).toBe(active(sculpted).mesh.vertices);
    expect(active(packed).mesh.faces).toEqual(sculptedMesh.faces);
    const reopened = decodeStudioHybridDccWorkfile(Uint8Array.from(encodeStudioHybridDccWorkfile(packed)), { documentId: "file-reopened" });
    expect(active(reopened).meshHash).toBe(hashStudioEditableMesh(active(packed).mesh));
    expect(active(reopened).mesh).toEqual(active(packed).mesh);
    const snapshot = deriveStudioHybridDccViewportSnapshot(reopened);
    expect(snapshot.errors).toEqual([]); expect(snapshot.assets).toHaveLength(1);
    expect(snapshot.assets[0]?.cornerUvs).toHaveLength(72);
    const again = workspaceImportBytes(createStudioHybridDccWorkspace("file-exchange"), "edited.glb", Uint8Array.from(glb(reopened)));
    const a = active(reopened).mesh; const b = active(again).mesh;
    expect(b.vertices.map(({ position }) => position)).toEqual(a.vertices.map(({ position }) => position));
    // 교환 파일은 면 loop 시작점이 바뀔 수 있으므로 위치·UV 결합과 winding을 함께 대조한다.
    const expected = triangleCorners(a); const actual = triangleCorners(b); const remaining = new Set(actual.keys());
    expect(actual).toHaveLength(expected.length);
    for (const triangle of expected) {
      const match = [...remaining].find((index) => [0, 1, 2].some((rotation) => triangle.every((corner, offset) => {
        const next = actual[index]?.[(offset + rotation) % 3];
        return next && corner.point.every((coordinate, axis) => coordinate === next.point[axis])
          && Math.abs(corner.u - next.u) < 1e-6 && Math.abs(corner.v - next.v) < 1e-6
          && corner.materialSlot === next.materialSlot;
      })));
      expect(match).toBeDefined(); if (match === undefined) throw new Error("GLB 삼각형의 위치·UV·방향이 바뀌었습니다."); remaining.delete(match);
    }
    expect(remaining.size).toBe(0);
    expect(Object.keys(workspaceUndo(workspaceUndo(workspaceUndo(packed))).session.state.geometry.records)).toHaveLength(0);
  });

  it("OBJ 혼합 음영·코너 UV는 실제 split-normal 표시와 저장 후에도 남는다", () => {
    const text = "v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nvt 0 0\nvt 1 0\nvt 0 1\ns 1\nf 1/1 2/2 3/3\ns off\nf 1/1 4/3 2/2\n";
    const imported = workspaceImportBytes(createStudioHybridDccWorkspace("mixed-file"), "mixed.obj", Uint8Array.from(new TextEncoder().encode(text)));
    const snapshot = deriveStudioHybridDccViewportSnapshot(imported);
    expect(snapshot.errors).toEqual([]); expect(snapshot.assets[0]?.normalMode).toBe("split");
    expect(snapshot.assets[0]?.cornerNormals).toHaveLength(18); expect(snapshot.assets[0]?.cornerUvs).toHaveLength(12);
    const restored = decodeStudioHybridDccWorkfile(Uint8Array.from(encodeStudioHybridDccWorkfile(imported)), { documentId: "mixed-restored" });
    expect(active(restored).mesh).toEqual(active(imported).mesh);
    expect(glb(restored).byteLength).toBeGreaterThan(100);
  });

  it("실제 VRM의 67개 편집 자산이 원래 world 배치로 뷰포트 표시 경계까지 도달한다", () => {
    const bytes = Uint8Array.from(readFileSync("apps/web/public/vrm/Sendagaya_Shino.vrm"));
    const imported = workspaceImportBytes(createStudioHybridDccWorkspace("real-avatar"), "Sendagaya_Shino.vrm", bytes);
    const snapshot = deriveStudioHybridDccViewportSnapshot(imported);
    expect(snapshot.errors).toEqual([]); expect(snapshot.assets).toHaveLength(67);
    expect(snapshot.assets.reduce((sum, asset) => sum + asset.triangleCount, 0)).toBe(31211);
    for (const asset of snapshot.assets) {
      const transform = imported.session.state.objectTransforms[asset.assetId];
      expect(asset.position).toEqual(transform?.position); expect(asset.rotationEulerRad).toEqual(transform?.rotationEulerRad);
      expect(asset.scale).toEqual(transform?.scale); expect(asset.cornerUvs).toHaveLength(asset.triangleCount * 6);
    }
  });
});
