/** 복제·위치 변경은 원본 polygon과 코너를 유지하여 UV 보간 대각선을 바꾸지 않는다. */
import { createStudioEditableMeshFromPolygons, type StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";

interface CornerReceipt { readonly vertex: number; readonly sourceCorner: number; readonly sourceEdge: number }
interface FaceReceipt { readonly sourceFace: number; readonly corners: readonly CornerReceipt[] }

function sourceLoops(mesh: StudioEditableMesh): readonly number[][] {
  return mesh.faces.map((face) => {
    const loop: number[] = []; let id = face.he;
    do {
      const edge = mesh.halfEdges[id];
      if (!edge || loop.length >= mesh.halfEdges.length) throw new Error("복제할 원본 polygon 순환이 잘못됐습니다.");
      loop.push(id); id = edge.next;
    } while (id !== face.he);
    return loop;
  });
}

function buildFromReceipts(source: StudioEditableMesh, positions: Float32Array, receipts: readonly FaceReceipt[]): StudioEditableMesh {
  const points = [];
  for (let index = 0; index < positions.length; index += 3) points.push({ x: positions[index] ?? NaN, y: positions[index + 1] ?? NaN, z: positions[index + 2] ?? NaN });
  const mesh = createStudioEditableMeshFromPolygons(points, receipts.map(({ corners }) => corners.map(({ vertex }) => vertex)));
  const outputCorners = receipts.flatMap(({ corners }) => corners);
  if (outputCorners.length !== mesh.halfEdges.length) throw new Error("복제한 polygon의 코너 수가 일치하지 않습니다.");
  const creases = new Map<number, number>();
  const halfEdges = mesh.halfEdges.map((edge, index) => {
    const receipt = outputCorners[index]; const old = receipt ? source.halfEdges[receipt.sourceCorner] : undefined;
    const vertex = old ? source.vertices[source.halfEdges[old.prev]?.vertex ?? -1] : undefined;
    const originalEdge = receipt ? source.halfEdges[receipt.sourceEdge] : undefined;
    const outputVertex = mesh.halfEdges[edge.prev]?.vertex;
    if (!receipt || !vertex || !originalEdge || outputVertex !== receipt.vertex) throw new Error("복제한 코너의 원본 대응이 잘못됐습니다.");
    const previous = creases.get(outputVertex);
    if (previous !== undefined && previous !== vertex.crease) throw new Error("합쳐진 정점의 서로 다른 crease 속성을 보존할 수 없습니다.");
    creases.set(outputVertex, vertex.crease);
    return { ...edge, crease: originalEdge.crease };
  });
  const attributed: StudioEditableMesh = { ...mesh, halfEdges,
    vertices: mesh.vertices.map((vertex) => ({ ...vertex, crease: creases.get(vertex.id) ?? vertex.crease })),
    faces: mesh.faces.map((face) => {
      const receipt = receipts[face.id], original = receipt ? source.faces[receipt.sourceFace] : undefined;
      if (!original) throw new Error("복제한 면의 원본 속성이 없습니다.");
      return { ...face, materialSlot: original.materialSlot, smooth: original.smooth };
    }),
  };
  if (!source.uvLayer) return attributed;
  const corners = outputCorners.map((receipt, halfEdgeId) => {
    const uv = source.uvLayer?.corners[receipt.sourceCorner]; if (!uv) throw new Error("복제할 원본 UV 코너가 없습니다.");
    return { halfEdgeId, u: uv.u, v: uv.v };
  });
  return { ...attributed, uvLayer: decodeStudioMeshUvLayer({ revision: 1, topologyHash: hashStudioMeshUvTopology(attributed), corners }, attributed) };
}

export function arrayStudioModifierPolygons(source: StudioEditableMesh, positions: Float32Array, count: number): StudioEditableMesh {
  const loops = sourceLoops(source), dense = new Map(source.vertices.map((vertex, index) => [vertex.id, index]));
  const receipts: FaceReceipt[] = [];
  for (let copy = 0; copy < count; copy += 1) for (const face of source.faces) {
    const loop = loops[face.id]; if (!loop) throw new Error("복제할 원본 면이 없습니다.");
    receipts.push({ sourceFace: face.id, corners: loop.map((id) => {
      const edge = source.halfEdges[id], vertex = edge ? source.halfEdges[edge.prev]?.vertex : undefined;
      const index = vertex === undefined ? undefined : dense.get(vertex); if (index === undefined) throw new Error("복제할 원본 정점이 없습니다.");
      return { vertex: copy * source.vertices.length + index, sourceCorner: id, sourceEdge: id };
    }) });
  }
  if (positions.length !== source.vertices.length * count * 3) throw new Error("복제 정점의 배치 수가 일치하지 않습니다.");
  return buildFromReceipts(source, positions, receipts);
}

export function mirrorStudioModifierPolygons(source: StudioEditableMesh, positions: Float32Array, mirroredVertex: Uint32Array): StudioEditableMesh {
  const loops = sourceLoops(source), dense = new Map(source.vertices.map((vertex, index) => [vertex.id, index]));
  const front: FaceReceipt[] = [], back: FaceReceipt[] = [];
  for (const face of source.faces) {
    const loop = loops[face.id]; if (!loop) throw new Error("대칭 원본 면이 없습니다.");
    const corners = loop.map((id) => {
      const edge = source.halfEdges[id], vertex = edge ? source.halfEdges[edge.prev]?.vertex : undefined;
      const index = vertex === undefined ? undefined : dense.get(vertex); if (index === undefined) throw new Error("대칭 원본 정점이 없습니다.");
      return { vertex: index, sourceCorner: id, sourceEdge: id };
    });
    front.push({ sourceFace: face.id, corners });
    if (corners.every(({ vertex }) => mirroredVertex[vertex] === vertex)) continue;
    const first = corners[0]; if (!first) throw new Error("대칭 면의 첫 코너가 없습니다.");
    back.push({ sourceFace: face.id, corners: [first, ...corners.slice(1).reverse()].map((corner) => {
      const vertex = mirroredVertex[corner.vertex], previous = source.halfEdges[corner.sourceCorner]?.prev;
      if (vertex === undefined || previous === undefined) throw new Error("대칭 면의 역순 코너가 없습니다.");
      return { vertex, sourceCorner: corner.sourceCorner, sourceEdge: previous };
    }) });
  }
  return buildFromReceipts(source, positions, [...front, ...back]);
}

export function repositionStudioModifierMesh(source: StudioEditableMesh, positions: Float32Array): StudioEditableMesh {
  if (positions.length !== source.vertices.length * 3) throw new Error("변형 정점의 원본 대응 수가 다릅니다.");
  return { ...source, vertices: source.vertices.map((vertex, index) => {
    const x = positions[index * 3], y = positions[index * 3 + 1], z = positions[index * 3 + 2];
    if (x === undefined || y === undefined || z === undefined) throw new Error("변형 정점이 없습니다.");
    return { ...vertex, position: { x, y, z } };
  }) };
}
