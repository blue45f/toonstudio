import { describe, expect, it } from "vitest";

import { createStudioUnitCubeMesh, deserializeStudioEditableMesh, hashStudioEditableMesh, matchesStudioEditableMeshPersistedHash, serializeStudioEditableMesh, validateStudioEditableMeshSerializableAuthority } from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, deriveStudioMeshUvIslands, hashStudioMeshUvTopology } from "./studio-mesh-uv-authority";
import { unwrapStudioMeshCornerUvs } from "../hybrid-dcc/studio-hybrid-dcc-uv-edit";

function cube() {
  const mesh = createStudioUnitCubeMesh();
  return { ...mesh, uvLayer: unwrapStudioMeshCornerUvs(mesh) };
}

describe("메시 코너 UV 권위", () => {
  it("기존 무UV hash·snapshot에 키를 더하지 않고 UV가 있을 때만 정확히 결합한다", () => {
    const mesh = createStudioUnitCubeMesh();
    const previous = hashStudioEditableMesh(mesh);
    expect(Object.hasOwn(serializeStudioEditableMesh(mesh), "uvLayer")).toBe(false);
    expect(hashStudioEditableMesh(deserializeStudioEditableMesh(serializeStudioEditableMesh(mesh)))).toBe(previous);
    const uv = cube();
    expect(hashStudioEditableMesh(uv)).not.toBe(previous);
    expect(hashStudioEditableMesh(deserializeStudioEditableMesh(serializeStudioEditableMesh(uv)))).toBe(hashStudioEditableMesh(uv));
    expect(matchesStudioEditableMeshPersistedHash(uv, previous)).toBe(false);
    expect(matchesStudioEditableMeshPersistedHash(mesh, "mesh:1d31fe58")).toBe(true);
    expect(matchesStudioEditableMeshPersistedHash(uv, "mesh:1d31fe58")).toBe(false);
    const edited = { ...uv, uvLayer: { ...uv.uvLayer, corners: uv.uvLayer.corners.map((corner, i) => i === 0 ? { ...corner, u: corner.u + 1 } : corner) } };
    expect(hashStudioEditableMesh(edited)).not.toBe(hashStudioEditableMesh(uv));
  });

  it("위상hash는 좌표·crease·material·smooth를 제외하고 연결 변화는 감지한다", () => {
    const mesh = cube();
    const changed = { ...mesh,
      vertices: mesh.vertices.map((vertex) => ({ ...vertex, crease: 0.5, position: { ...vertex.position, x: vertex.position.x + 2 } })),
      halfEdges: mesh.halfEdges.map((edge) => ({ ...edge, crease: 0.5 })),
      faces: mesh.faces.map((face) => ({ ...face, materialSlot: 3, smooth: true })),
    };
    expect(hashStudioMeshUvTopology(changed)).toBe(mesh.uvLayer.topologyHash);
    expect(validateStudioEditableMeshSerializableAuthority(changed).ok).toBe(true);
    expect(hashStudioMeshUvTopology({ ...mesh, halfEdges: mesh.halfEdges.map((edge, index) => index ? edge : { ...edge, vertex: 7 }) })).not.toBe(mesh.uvLayer.topologyHash);
  });

  it("cube의 24개 face corner를 여섯 비퇴화 패치로 펼친다", () => {
    const mesh = cube();
    expect(mesh.uvLayer.corners).toHaveLength(24);
    expect(deriveStudioMeshUvIslands(mesh)).toHaveLength(6);
    for (const face of mesh.faces) {
      const corners = mesh.uvLayer.corners.slice(face.he, face.he + 4);
      let area = 0;
      corners.forEach((corner, index) => {
        const next = corners[(index + 1) % corners.length]!;
        area += corner.u * next.v - next.u * corner.v;
      });
      expect(Math.abs(area)).toBeGreaterThan(0.01);
    }
  });

  it.each(["topology", "duplicate", "missing", "nonfinite", "non-float32", "extra", "islands"])("손상된 %s 레이어를 정본과 snapshot 양쪽에서 거부한다", (kind) => {
    const mesh = cube();
    const layer = { ...mesh.uvLayer, corners: mesh.uvLayer.corners.map((corner) => ({ ...corner })) };
    const malformed = kind === "topology" ? { ...layer, topologyHash: "foreign" }
      : kind === "duplicate" ? { ...layer, corners: layer.corners.map((corner, index) => index === 1 ? { ...corner, halfEdgeId: 0 } : corner) }
        : kind === "missing" ? { ...layer, corners: layer.corners.slice(1) }
          : kind === "nonfinite" ? { ...layer, corners: [{ halfEdgeId: 0, u: Infinity, v: 0 }, ...layer.corners.slice(1)] }
            : kind === "non-float32" ? { ...layer, corners: [{ halfEdgeId: 0, u: 0.1, v: 0 }, ...layer.corners.slice(1)] }
              : kind === "extra" ? { ...layer, trusted: true } : { ...layer, islands: [] };
    expect(() => decodeStudioMeshUvLayer(malformed, mesh)).toThrow(/UV/u);
    expect(validateStudioEditableMeshSerializableAuthority({ ...mesh, uvLayer: malformed }).ok).toBe(false);
    expect(() => deserializeStudioEditableMesh({ ...serializeStudioEditableMesh(mesh), uvLayer: malformed })).toThrow(/UV/u);
  });

  it("음수 타일·0 UV collapse를 허용하고 아일랜드는 입력 필드 대신 현재 코너에서 파생한다", () => {
    const mesh = cube();
    const layer = decodeStudioMeshUvLayer({ ...mesh.uvLayer, corners: mesh.uvLayer.corners.map((corner) => ({ ...corner, u: -2, v: 0 })) }, mesh);
    expect(deriveStudioMeshUvIslands({ ...mesh, uvLayer: layer })).toHaveLength(1);
  });
});
