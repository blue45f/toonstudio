/** 원본 ID·loop·연결·다각형 검증의 기존 오류 우선순위를 보존한다. */
import { STUDIO_EDITABLE_MESH_LIMITS, STUDIO_EDITABLE_MESH_REVISION, validateStudioEditableMeshSerializableAuthority, type StudioEditableMesh, type StudioEditableFace, type StudioEditableVertex, type StudioEditableHalfEdge, type StudioMeshVec3 } from "../studio-editable-half-edge-mesh";
import { surfaceIssue as issue,surfacePass as pass,surfaceStop as stop,STUDIO_MESH_SURFACE_MAX_FACE_CORNERS as STUDIO_HYBRID_DCC_GLB_MAX_FACE_CORNERS,STUDIO_MESH_SURFACE_MAX_REPORT_ISSUES as STUDIO_HYBRID_DCC_GLB_EXPORT_MAX_REPORT_ISSUES,type StudioMeshSurfaceResult as InternalResult,type StudioMeshSurfaceValidated as ValidatedMesh,type StudioMeshSurfaceValidatedFace as ValidatedFace,type StudioMeshSurfaceEdgeUse as EdgeUse,type StudioMeshSurfaceIssue as StudioHybridDccGlbIssue,type StudioMeshSurfaceBudget, type StudioMeshSurfaceOptions } from "./studio-mesh-surface-contracts";
import { sub,length3,prepareFaceWithMeter } from "./studio-mesh-surface-triangulation";
import { StudioMeshSurfaceWorkMeter,surfaceBudgetFailure } from "./studio-mesh-surface-work";

const GEOMETRY_EPSILON = 1e-12;
function isRecord(value:unknown):value is Record<string,unknown>{return typeof value === "object" && value !== null && !Array.isArray(value);}
function safeStableId(value:number):boolean{return Number.isSafeInteger(value)&&value>=0;}
function finiteVec3(value:StudioMeshVec3):boolean{return Number.isFinite(value.x)&&Number.isFinite(value.y)&&Number.isFinite(value.z);}
function maximumNumber(values:Iterable<number>):number{let result=-Infinity;for(const value of values)result=Math.max(result,value);return result;}
function compareCodeUnits(left:string,right:string):number{return left<right?-1:left>right?1:0;}
function validateWithMeter(mesh: StudioEditableMesh, meter: StudioMeshSurfaceWorkMeter, allowCreaseMetadata: boolean, topologyPolicy: "strict" | "editable"): InternalResult<ValidatedMesh> {
  if (!isRecord(mesh) || !Array.isArray(mesh.vertices) || !Array.isArray(mesh.halfEdges) || !Array.isArray(mesh.faces)) {
    return stop(issue("error", "invalid-input", "Editable mesh arrays are required"));
  }
  if (mesh.revision !== STUDIO_EDITABLE_MESH_REVISION) {
    return stop(issue("error", "mesh-revision-unsupported", "Editable mesh schema revision is unsupported"));
  }
  if (
    mesh.vertices.length > STUDIO_EDITABLE_MESH_LIMITS.maxVertices ||
    mesh.faces.length > STUDIO_EDITABLE_MESH_LIMITS.maxFaces ||
    mesh.halfEdges.length > STUDIO_EDITABLE_MESH_LIMITS.maxEdges * 2
  ) {
    return stop(issue("error", "mesh-budget-exceeded", "Editable mesh exceeds the authoring export budget"));
  }
  if (mesh.vertices.length === 0 || mesh.faces.length === 0 || mesh.halfEdges.length === 0) {
    return stop(issue("error", "empty-mesh", "A GLB export requires at least one polygon face"));
  }

  meter.checkFaces(mesh.faces.length);
  meter.charge("linear",mesh.vertices.length+mesh.halfEdges.length+mesh.faces.length);
  if (topologyPolicy === "editable") {
    const canonical = validateStudioEditableMeshSerializableAuthority(mesh);
    if (!canonical.ok) return stop(issue("error", "invalid-input", `Editable authority topology is invalid: ${canonical.detail}`));
  }
  let hasEditableTopologyExceptions = false;
  const vertexById = new Map<number, StudioEditableVertex>();
  for (const vertex of mesh.vertices) {
    if (!safeStableId(vertex.id)) {
      return stop(issue("error", "stable-id-invalid", "Every vertex needs a non-negative stable integer ID"));
    }
    if (vertexById.has(vertex.id)) {
      return stop(issue("error", "duplicate-stable-id", `Duplicate vertex ID ${vertex.id}`, { vertexIds: [vertex.id] }));
    }
    if (!finiteVec3(vertex.position)) {
      return stop(issue("error", "position-non-finite", `Vertex ${vertex.id} has a non-finite position`, { vertexIds: [vertex.id] }));
    }
    if (!Number.isFinite(vertex.crease) || vertex.crease < 0 || vertex.crease > 1) {
      return stop(issue("error", "crease-invalid", `Vertex ${vertex.id} has an invalid crease`, { vertexIds: [vertex.id] }));
    }
    if (vertex.crease !== 0 && !allowCreaseMetadata) {
      return stop(issue("error", "crease-unsupported", `Vertex ${vertex.id} crease cannot be represented faithfully`, { vertexIds: [vertex.id] }));
    }
    if (!Number.isSafeInteger(vertex.he) || vertex.he < -1) {
      return stop(issue("error", "vertex-half-edge-invalid", `Vertex ${vertex.id} has an invalid outgoing half-edge`, { vertexIds: [vertex.id] }));
    }
    vertexById.set(vertex.id, vertex);
  }

  const halfEdgeById = new Map<number, StudioEditableHalfEdge>();
  for (const halfEdge of mesh.halfEdges) {
    if (!safeStableId(halfEdge.id)) {
      return stop(issue("error", "stable-id-invalid", "Every half-edge needs a non-negative stable integer ID"));
    }
    if (halfEdgeById.has(halfEdge.id)) {
      return stop(issue("error", "duplicate-stable-id", `Duplicate half-edge ID ${halfEdge.id}`, { halfEdgeIds: [halfEdge.id] }));
    }
    if (
      !Number.isSafeInteger(halfEdge.vertex) ||
      !Number.isSafeInteger(halfEdge.face) ||
      !Number.isSafeInteger(halfEdge.next) ||
      !Number.isSafeInteger(halfEdge.prev) ||
      !Number.isSafeInteger(halfEdge.twin)
    ) {
      return stop(issue("error", "half-edge-reference-invalid", `Half-edge ${halfEdge.id} has a non-integer reference`, { halfEdgeIds: [halfEdge.id] }));
    }
    if (!Number.isFinite(halfEdge.crease) || halfEdge.crease < 0 || halfEdge.crease > 1) {
      return stop(issue("error", "crease-invalid", `Half-edge ${halfEdge.id} has an invalid crease`, { halfEdgeIds: [halfEdge.id] }));
    }
    if (halfEdge.crease !== 0 && !allowCreaseMetadata) {
      return stop(issue("error", "crease-unsupported", `Half-edge ${halfEdge.id} crease cannot be represented faithfully`, { halfEdgeIds: [halfEdge.id] }));
    }
    halfEdgeById.set(halfEdge.id, halfEdge);
  }

  const faceById = new Map<number, StudioEditableFace>();
  for (const face of mesh.faces) {
    if (!safeStableId(face.id)) {
      return stop(issue("error", "stable-id-invalid", "Every face needs a non-negative stable integer ID"));
    }
    if (faceById.has(face.id)) {
      return stop(issue("error", "duplicate-stable-id", `Duplicate face ID ${face.id}`, { faceIds: [face.id] }));
    }
    if (
      !safeStableId(face.he) ||
      !Number.isSafeInteger(face.materialSlot) ||
      face.materialSlot < 0 ||
      typeof face.smooth !== "boolean"
    ) {
      return stop(issue("error", "face-property-invalid", `Face ${face.id} has invalid properties`, { faceIds: [face.id] }));
    }
    faceById.set(face.id, face);
  }

  const maxVertexId = maximumNumber(vertexById.keys());
  const maxHalfEdgeId = maximumNumber(halfEdgeById.keys());
  const maxFaceId = maximumNumber(faceById.keys());
  if (
    !Number.isSafeInteger(mesh.nextVertexId) || mesh.nextVertexId <= maxVertexId ||
    !Number.isSafeInteger(mesh.nextHalfEdgeId) || mesh.nextHalfEdgeId <= maxHalfEdgeId ||
    !Number.isSafeInteger(mesh.nextFaceId) || mesh.nextFaceId <= maxFaceId
  ) {
    return stop(issue("error", "stable-id-counter-invalid", "Stable-ID generation counters must exceed all live IDs"));
  }

  const originByHalfEdgeId = new Map<number, number>();
  for (const halfEdge of [...halfEdgeById.values()].sort((a, b) => a.id - b.id)) {
    const previous = halfEdgeById.get(halfEdge.prev);
    const next = halfEdgeById.get(halfEdge.next);
    if (!vertexById.has(halfEdge.vertex) || !previous || !next || (halfEdge.twin >= 0 && !halfEdgeById.has(halfEdge.twin))) {
      return stop(issue("error", "half-edge-reference-invalid", `Half-edge ${halfEdge.id} references a missing element`, { halfEdgeIds: [halfEdge.id] }));
    }
    if (next.prev !== halfEdge.id || previous.next !== halfEdge.id) {
      return stop(issue("error", "half-edge-link-mismatch", `Half-edge ${halfEdge.id} next/prev links are not reciprocal`, { halfEdgeIds: [halfEdge.id, halfEdge.next, halfEdge.prev] }));
    }
    if (halfEdge.face < -1 || (halfEdge.face >= 0 && !faceById.has(halfEdge.face))) {
      return stop(issue("error", "half-edge-face-mismatch", `Half-edge ${halfEdge.id} references a missing face`, { halfEdgeIds: [halfEdge.id] }));
    }
    originByHalfEdgeId.set(halfEdge.id, previous.vertex);
  }

  const incidentOutgoing = new Map<number, number[]>();
  for (const halfEdge of halfEdgeById.values()) {
    const origin = originByHalfEdgeId.get(halfEdge.id)!;
    const list = incidentOutgoing.get(origin) ?? [];
    list.push(halfEdge.id);
    incidentOutgoing.set(origin, list);
    if (origin === halfEdge.vertex) {
      return stop(issue("error", "edge-zero-length", `Half-edge ${halfEdge.id} starts and ends at vertex ${origin}`, { vertexIds: [origin], halfEdgeIds: [halfEdge.id] }));
    }
    const originPosition = vertexById.get(origin)!.position;
    const destinationPosition = vertexById.get(halfEdge.vertex)!.position;
    if (length3(sub(destinationPosition, originPosition)) <= GEOMETRY_EPSILON) {
      return stop(issue("error", "edge-zero-length", `Half-edge ${halfEdge.id} has coincident endpoint positions`, { vertexIds: [origin, halfEdge.vertex], halfEdgeIds: [halfEdge.id] }));
    }
  }
  for (const vertex of [...vertexById.values()].sort((a, b) => a.id - b.id)) {
    const outgoing = incidentOutgoing.get(vertex.id) ?? [];
    if (outgoing.length === 0) {
      if (topologyPolicy === "editable" && vertex.he === -1) { hasEditableTopologyExceptions = true; continue; }
      return stop(issue("error", "isolated-vertex", `Vertex ${vertex.id} is not part of any polygon`, { vertexIds: [vertex.id] }));
    }
    const selected = halfEdgeById.get(vertex.he);
    if (!selected || originByHalfEdgeId.get(selected.id) !== vertex.id) {
      return stop(issue("error", "vertex-half-edge-invalid", `Vertex ${vertex.id} outgoing half-edge is inconsistent`, { vertexIds: [vertex.id], halfEdgeIds: vertex.he >= 0 ? [vertex.he] : [] }));
    }
  }

  const rawFaceLoops: Array<{
    readonly face: StudioEditableFace;
    readonly halfEdgeIds: readonly number[];
    readonly vertexIds: readonly number[];
  }> = [];
  const ownedHalfEdgeIdsByFace = new Map<number, number[]>();
  for (const halfEdge of halfEdgeById.values()) {
    if (halfEdge.face < 0) continue;
    const owned = ownedHalfEdgeIdsByFace.get(halfEdge.face) ?? [];
    owned.push(halfEdge.id);
    ownedHalfEdgeIdsByFace.set(halfEdge.face, owned);
  }
  for (const owned of ownedHalfEdgeIdsByFace.values()) owned.sort((a, b) => a - b);
  for (const face of [...faceById.values()].sort((a, b) => a.id - b.id)) {
    if (!halfEdgeById.has(face.he)) {
      return stop(issue("error", "half-edge-reference-invalid", `Face ${face.id} starts at a missing half-edge`, { faceIds: [face.id], halfEdgeIds: [face.he] }));
    }
    const halfEdgeIds: number[] = [];
    const vertexIds: number[] = [];
    const visited = new Set<number>();
    let current = face.he;
    for (let guard = 0; guard <= halfEdgeById.size; guard += 1) {
      if (current === face.he && halfEdgeIds.length > 0) break;
      if (visited.has(current)) {
        return stop(issue("error", "face-loop-open", `Face ${face.id} enters a cycle that does not return to its start`, { faceIds: [face.id], halfEdgeIds }));
      }
      const halfEdge = halfEdgeById.get(current);
      if (!halfEdge) {
        return stop(issue("error", "half-edge-reference-invalid", `Face ${face.id} traverses a missing half-edge`, { faceIds: [face.id], halfEdgeIds: [current] }));
      }
      if (halfEdge.face !== face.id) {
        return stop(issue("error", "half-edge-face-mismatch", `Face ${face.id} traverses half-edge ${current} owned by another face`, { faceIds: [face.id], halfEdgeIds: [current] }));
      }
      visited.add(current);
      halfEdgeIds.push(current);
      vertexIds.push(originByHalfEdgeId.get(current)!);
      current = halfEdge.next;
    }
    if (current !== face.he) {
      return stop(issue("error", "face-loop-open", `Face ${face.id} did not close within the topology guard`, { faceIds: [face.id], halfEdgeIds }));
    }
    if (halfEdgeIds.length < 3) {
      return stop(issue("error", "face-loop-too-small", `Face ${face.id} has fewer than three edges`, { faceIds: [face.id], halfEdgeIds }));
    }
    if (halfEdgeIds.length > STUDIO_HYBRID_DCC_GLB_MAX_FACE_CORNERS) {
      return stop(issue(
        "error",
        "face-corner-budget-exceeded",
        `Face ${face.id} exceeds the ${STUDIO_HYBRID_DCC_GLB_MAX_FACE_CORNERS}-corner synchronous export budget`,
        { faceIds: [face.id] },
      ));
    }
    if (new Set(vertexIds).size !== vertexIds.length) {
      return stop(issue("error", "face-loop-duplicate-vertex", `Face ${face.id} repeats a stable vertex`, { faceIds: [face.id], vertexIds }));
    }
    const owned = ownedHalfEdgeIdsByFace.get(face.id) ?? [];
    const traversed = [...halfEdgeIds].sort((a, b) => a - b);
    if (owned.length !== traversed.length || owned.some((id, index) => id !== traversed[index])) {
      return stop(issue("error", "face-loop-incomplete", `Face ${face.id} does not own exactly one closed loop`, { faceIds: [face.id], halfEdgeIds: owned }));
    }
    meter.checkFaceCorners(halfEdgeIds.length);
    meter.charge("linear",halfEdgeIds.length);meter.charge("polygonPairs",halfEdgeIds.length*halfEdgeIds.length);
    rawFaceLoops.push({ face, halfEdgeIds, vertexIds });
  }

  const edgeGroups = new Map<string, StudioEditableHalfEdge[]>();
  for (const halfEdge of halfEdgeById.values()) {
    const origin = originByHalfEdgeId.get(halfEdge.id)!;
    const a = Math.min(origin, halfEdge.vertex);
    const b = Math.max(origin, halfEdge.vertex);
    const key = `${a}|${b}`;
    const group = edgeGroups.get(key) ?? [];
    group.push(halfEdge);
    edgeGroups.set(key, group);
  }
  const edgeUses: EdgeUse[] = [];
  let boundaryEdgeCount = 0;
  for (const [key, unsorted] of [...edgeGroups.entries()].sort(([left], [right]) => compareCodeUnits(left, right))) {
    const halfEdges = [...unsorted].sort((a, b) => a.id - b.id);
    const [aText, bText] = key.split("|");
    const a = Number(aText);
    const b = Number(bText);
    if (halfEdges.length > 2 && topologyPolicy === "strict") {
      return stop(issue("error", "non-manifold-edge", `Edge ${key} is used by ${halfEdges.length} half-edges`, { vertexIds: [a, b], halfEdgeIds: halfEdges.map((entry) => entry.id) }));
    }
    if (halfEdges.length > 2) hasEditableTopologyExceptions = true;
    if (halfEdges.length === 1) {
      if (halfEdges[0]!.twin !== -1 && topologyPolicy === "strict") {
        return stop(issue("error", "half-edge-twin-mismatch", `Boundary half-edge ${halfEdges[0]!.id} has an unreachable twin`, { halfEdgeIds: [halfEdges[0]!.id] }));
      }
      if (halfEdges[0]!.twin !== -1) hasEditableTopologyExceptions = true;
      boundaryEdgeCount += 1;
    } else if (halfEdges.length === 2) {
      const first = halfEdges[0]!;
      const second = halfEdges[1]!;
      const firstOrigin = originByHalfEdgeId.get(first.id)!;
      const secondOrigin = originByHalfEdgeId.get(second.id)!;
      if (
        first.twin !== second.id ||
        second.twin !== first.id ||
        firstOrigin !== second.vertex ||
        secondOrigin !== first.vertex
      ) {
        if (topologyPolicy === "strict") return stop(issue("error", "edge-orientation-mismatch", `Edge ${key} does not have one reciprocal, oppositely oriented pair`, { vertexIds: [a, b], halfEdgeIds: [first.id, second.id] }));
        hasEditableTopologyExceptions = true;
      }
    }
    edgeUses.push({ key, a, b, halfEdges });
  }

  const incidentFaces = new Map<number, Set<number>>();
  for (const loop of rawFaceLoops) {
    for (const vertexId of loop.vertexIds) {
      const faces = incidentFaces.get(vertexId) ?? new Set<number>();
      faces.add(loop.face.id);
      incidentFaces.set(vertexId, faces);
    }
  }
  const faceNeighborsAtVertex = new Map<number, Map<number, Set<number>>>();
  for (const edgeUse of edgeUses) {
    const faceIds = [...new Set(edgeUse.halfEdges.map((entry) => entry.face).filter((id) => id >= 0))];
    if (faceIds.length !== 2) continue;
    for (const vertexId of [edgeUse.a, edgeUse.b]) {
      const byFace = faceNeighborsAtVertex.get(vertexId) ?? new Map<number, Set<number>>();
      const firstNeighbors = byFace.get(faceIds[0]!) ?? new Set<number>();
      const secondNeighbors = byFace.get(faceIds[1]!) ?? new Set<number>();
      firstNeighbors.add(faceIds[1]!);
      secondNeighbors.add(faceIds[0]!);
      byFace.set(faceIds[0]!, firstNeighbors);
      byFace.set(faceIds[1]!, secondNeighbors);
      faceNeighborsAtVertex.set(vertexId, byFace);
    }
  }
  for (const [vertexId, faces] of [...incidentFaces.entries()].sort(([a], [b]) => a - b)) {
    if (faces.size <= 1) continue;
    const sortedFaces = [...faces].sort((a, b) => a - b);
    const seen = new Set<number>([sortedFaces[0]!]);
    const queue = [sortedFaces[0]!];
    const neighbors = faceNeighborsAtVertex.get(vertexId) ?? new Map<number, Set<number>>();
    while (queue.length > 0) {
      const current = queue.shift()!;
      for (const neighbor of [...(neighbors.get(current) ?? [])].sort((a, b) => a - b)) {
        if (!seen.has(neighbor)) {
          seen.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    if (seen.size !== faces.size) {
      if (topologyPolicy === "strict") return stop(issue("error", "bow-tie-vertex", `Vertex ${vertexId} has disconnected face fans`, { vertexIds: [vertexId], faceIds: sortedFaces }));
      hasEditableTopologyExceptions = true;
    }
  }

  const warnings: StudioHybridDccGlbIssue[] = [];
  let warningCount = 0;
  const validatedFaces: ValidatedFace[] = [];
  const preserveCorners = mesh.uvLayer !== undefined || (allowCreaseMetadata
    && (mesh.vertices.some(({ crease }) => crease !== 0) || mesh.halfEdges.some(({ crease }) => crease !== 0)));
  for (const loop of rawFaceLoops) {
    const prepared = prepareFaceWithMeter(loop.face, loop.halfEdgeIds, loop.vertexIds, vertexById, preserveCorners, meter);
    if (!prepared.ok) return prepared;
    meter.charge("triangles",prepared.value.face.triangles.length);
    validatedFaces.push(prepared.value.face);
    warningCount += prepared.value.warnings.length;
    const remainingWarningSlots = STUDIO_HYBRID_DCC_GLB_EXPORT_MAX_REPORT_ISSUES - warnings.length;
    if (remainingWarningSlots > 0) {
      warnings.push(...prepared.value.warnings.slice(0, remainingWarningSlots));
    }
  }
  return pass({
    vertices: [...vertexById.values()].sort((a, b) => a.id - b.id),
    vertexById,
    halfEdgeById,
    faceById,
    faces: validatedFaces,
    edgeUses,
    boundaryEdgeCount,
    warnings,
    warningCount,
    sourceMesh: mesh,
    allowCreaseMetadata,
    topologyPolicy,
    hasEditableTopologyExceptions,
    maxFaceCorners: rawFaceLoops.reduce((maximum, entry) => Math.max(maximum, entry.vertexIds.length), 0),
    work: meter.snapshot(),
  });
}


export function validateStudioMeshSurface(mesh:StudioEditableMesh,budget?:StudioMeshSurfaceBudget,options?:StudioMeshSurfaceOptions):InternalResult<ValidatedMesh>{try{return validateWithMeter(mesh,new StudioMeshSurfaceWorkMeter(budget),options?.allowCreaseMetadata===true, options?.topologyPolicy === "editable" ? "editable" : "strict");}catch(error){return surfaceBudgetFailure(error);}}
