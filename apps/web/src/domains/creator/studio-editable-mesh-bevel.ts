/**
 * Edge bevel (chamfer, one segment) for the editable half-edge mesh (MOD-006).
 *
 * Lives in its own file so the mesh module does not grow (source-size ratchet). The mesh module passes the few kernel
 * functions this needs, so there is no run-time import cycle; the public entry point stays
 * `bevelStudioEditableMeshEdges` in `studio-editable-half-edge-mesh.ts`.
 */

import type {
  StudioEditableMesh,
  StudioEditableMeshFailureCode,
  StudioEditableMeshResult,
  StudioMeshVec3,
} from "./studio-editable-half-edge-mesh";

/** Kernel pieces the bevel needs from the mesh module. */
export interface StudioEditableMeshBevelKernel {
  readonly faceLoopVertexIds: (mesh: StudioEditableMesh, faceId: number) => number[];
  readonly createMeshFromPolygons: (
    positions: readonly StudioMeshVec3[],
    faces: readonly (readonly number[])[],
  ) => StudioEditableMesh;
  readonly meshStats: (mesh: StudioEditableMesh) => { readonly faceCount: number; readonly boundaryEdgeCount: number };
  /** Faces with an area at or below this count as flat. */
  readonly areaEpsilon: number;
}

function ok<T>(value: T): StudioEditableMeshResult<T> {
  return { ok: true, value };
}

function fail<T>(code: StudioEditableMeshFailureCode, detail: string): StudioEditableMeshResult<T> {
  return { ok: false, code, detail };
}

function vec(x: number, y: number, z: number): StudioMeshVec3 {
  return { x, y, z };
}

function add(a: StudioMeshVec3, b: StudioMeshVec3): StudioMeshVec3 {
  return vec(a.x + b.x, a.y + b.y, a.z + b.z);
}

function sub(a: StudioMeshVec3, b: StudioMeshVec3): StudioMeshVec3 {
  return vec(a.x - b.x, a.y - b.y, a.z - b.z);
}

function scale(a: StudioMeshVec3, s: number): StudioMeshVec3 {
  return vec(a.x * s, a.y * s, a.z * s);
}

function cross(a: StudioMeshVec3, b: StudioMeshVec3): StudioMeshVec3 {
  return vec(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
}

function length(a: StudioMeshVec3): number {
  return Math.hypot(a.x, a.y, a.z);
}

interface StudioBevelCorner {
  readonly face: number;
  readonly index: number;
  readonly prev: number;
  readonly next: number;
}

/**
 * Orders the corners around one vertex the way its edges are walked: the corner after `c` is the neighbour face
 * that uses edge (v, c.next) in the opposite direction, i.e. the corner whose `prev` is `c.next`.
 * Returns null unless the walk closes into one loop over every corner (boundary vertex or bow-tie).
 */
function chainStudioBevelCorners(corners: readonly StudioBevelCorner[]): StudioBevelCorner[] | null {
  const byPrev = new Map<number, StudioBevelCorner>();
  const nexts = new Set<number>();
  for (const corner of corners) {
    if (corner.prev === corner.next || byPrev.has(corner.prev) || nexts.has(corner.next)) return null;
    byPrev.set(corner.prev, corner);
    nexts.add(corner.next);
  }
  const start = corners[0];
  if (!start) return null;
  const fan: StudioBevelCorner[] = [];
  let current: StudioBevelCorner | undefined = start;
  while (current && fan.length <= corners.length) {
    fan.push(current);
    current = byPrev.get(current.next);
    if (current === start) return fan.length === corners.length ? fan : null;
  }
  return null;
}

/**
 * Bevel (chamfer, one segment) selected edges (MOD-006).
 *
 * Each selected edge between two faces is replaced by one chamfer quad. The quad's long sides sit inside the two
 * faces that shared the edge; its short sides sit on the faces around the edge's end vertices. An end vertex
 * therefore disappears (or is kept only where an untouched edge still ends there), and EVERY face around it gets a
 * new corner, otherwise the neighbours keep pointing at the vertex that no longer exists and the mesh opens up.
 *
 * Per bevel vertex the faces are walked in edge order. A corner whose outgoing/incoming edge is selected is replaced
 * by one point on its other edge (`amount` of the way along it) or, when both edges are selected, by one point inside
 * the face. A corner between two unselected edges keeps the vertex and gains the points of its ported edges. Edge
 * ends that no face shares any more (ports kept by one side only, chamfer ends) are closed with cap faces.
 *
 * Cube, one edge: 8v/6f/12e -> 10v/7f/15e. Cube, all 12 edges: 24v/26f/48e. Boundary edges, vertices on the open
 * boundary and non-manifold vertices are rejected instead of returning an open mesh. Face material and smooth flags
 * are inherited by the faces made from them; chamfer and cap faces inherit from an adjacent face.
 */
export function bevelEditableMeshEdges(
  kernel: StudioEditableMeshBevelKernel,
  mesh: StudioEditableMesh,
  halfEdgeIds: readonly number[],
  amount: number,
): StudioEditableMeshResult<StudioEditableMesh> {
  if (!Number.isFinite(amount) || amount <= 0) {
    return fail("invalid-parameter", "amount must be > 0");
  }
  if (halfEdgeIds.length === 0) return fail("empty-selection", "no edges");

  const t = Math.min(0.49, Math.max(0.01, amount));
  const idMap = new Map(mesh.vertices.map((v, i) => [v.id, i] as const));
  const halfEdgeById = new Map(mesh.halfEdges.map((h) => [h.id, h] as const));
  const positions: StudioMeshVec3[] = mesh.vertices.map((v) => v.position);
  const originalVertexCount = positions.length;
  const faceLoops: number[][] = [];
  for (const face of mesh.faces) {
    const loop = kernel.faceLoopVertexIds(mesh, face.id).map((id) => idMap.get(id));
    if (loop.length < 3 || loop.some((index) => index === undefined)) {
      return fail("invalid-mesh", `face ${face.id}`);
    }
    faceLoops.push(loop as number[]);
  }
  const edgeKey = (a: number, b: number) => (a < b ? `${a}|${b}` : `${b}|${a}`);

  // Selected edges, undirected, as position-index pairs (lo < hi).
  const selected = new Map<string, readonly [number, number]>();
  for (const heId of halfEdgeIds) {
    const he = halfEdgeById.get(heId);
    if (!he) return fail("not-found", `he ${heId}`);
    const origin = halfEdgeById.get(he.prev);
    const a = origin ? idMap.get(origin.vertex) : undefined;
    const b = idMap.get(he.vertex);
    if (a === undefined || b === undefined) {
      return fail("topology-failed", "bevel edge vertices missing");
    }
    selected.set(edgeKey(a, b), a < b ? [a, b] : [b, a]);
  }

  // Faces that use each selected edge lo->hi (forward) and hi->lo (backward).
  const uses = new Map<string, { readonly forward: number[]; readonly backward: number[] }>();
  for (const key of selected.keys()) uses.set(key, { forward: [], backward: [] });
  faceLoops.forEach((loop, faceIndex) => {
    loop.forEach((from, i) => {
      const to = loop[(i + 1) % loop.length]!;
      const use = uses.get(edgeKey(from, to));
      if (use) (from < to ? use.forward : use.backward).push(faceIndex);
    });
  });
  const bevelVertices = new Set<number>();
  for (const [key, [lo, hi]] of selected) {
    const use = uses.get(key)!;
    const total = use.forward.length + use.backward.length;
    if (total === 0) return fail("topology-failed", "selected edge not found on any face");
    if (total === 1) {
      return fail("topology-failed", "cannot bevel a boundary edge (it needs a face on both sides)");
    }
    if (total > 2) return fail("non-manifold", "cannot bevel non-manifold edge");
    if (use.forward.length !== 1) return fail("invalid-mesh", "faces on a selected edge disagree on orientation");
    bevelVertices.add(lo);
    bevelVertices.add(hi);
  }

  const cornersAt = new Map<number, StudioBevelCorner[]>();
  for (let faceIndex = 0; faceIndex < faceLoops.length; faceIndex += 1) {
    const loop = faceLoops[faceIndex]!;
    const seen = new Set<number>();
    for (let index = 0; index < loop.length; index += 1) {
      const vertex = loop[index]!;
      if (!bevelVertices.has(vertex)) continue;
      if (seen.has(vertex)) return fail("invalid-mesh", `face ${mesh.faces[faceIndex]!.id} repeats a bevel vertex`);
      seen.add(vertex);
      const corners = cornersAt.get(vertex) ?? [];
      corners.push({
        face: faceIndex,
        index,
        prev: loop[(index + loop.length - 1) % loop.length]!,
        next: loop[(index + 1) % loop.length]!,
      });
      cornersAt.set(vertex, corners);
    }
  }

  const addPoint = (point: StudioMeshVec3): number => {
    positions.push(point);
    return positions.length - 1;
  };
  const toward = (from: number, to: number): StudioMeshVec3 => scale(sub(positions[to]!, positions[from]!), t);
  /** New vertices (ports and inner points) -> the bevel vertex they stand in for. */
  const hostOf = new Map<number, number>();
  /** `${face}:${corner}` -> vertices that replace that face corner. */
  const replacement = new Map<string, number[]>();
  for (const vertex of bevelVertices) {
    const fan = chainStudioBevelCorners(cornersAt.get(vertex) ?? []);
    if (!fan) {
      return fail(
        "topology-failed",
        `vertex ${mesh.vertices[vertex]!.id} is on the open boundary or is non-manifold; bevel needs a closed face fan`,
      );
    }
    const count = fan.length;
    const before = (j: number) => (j + count - 1) % count;
    const isSelected = fan.map((corner) => selected.has(edgeKey(vertex, corner.next)));
    // An unselected edge next to a selected one gets a port, one point along it from the bevel vertex.
    const port = fan.map((corner, j) => {
      if (isSelected[j] || !(isSelected[before(j)] || isSelected[(j + 1) % count])) return undefined;
      const index = addPoint(add(positions[vertex]!, toward(vertex, corner.next)));
      hostOf.set(index, vertex);
      return index;
    });
    fan.forEach((corner, j) => {
      const incoming = isSelected[before(j)]!;
      const outgoing = isSelected[j]!;
      let replaced: number[];
      if (incoming && outgoing) {
        const inner = addPoint(add(add(positions[vertex]!, toward(vertex, corner.prev)), toward(vertex, corner.next)));
        hostOf.set(inner, vertex);
        replaced = [inner];
      } else if (incoming) {
        replaced = [port[j]!];
      } else if (outgoing) {
        replaced = [port[before(j)]!];
      } else {
        const first = port[before(j)];
        const last = port[j];
        replaced = [];
        if (first !== undefined) replaced.push(first);
        if (first === undefined || last === undefined) replaced.push(vertex);
        if (last !== undefined) replaced.push(last);
      }
      replacement.set(`${corner.face}:${corner.index}`, replaced);
    });
  }

  const polygons: number[][] = faceLoops.map((loop, faceIndex) =>
    loop.flatMap((vertex, index) => replacement.get(`${faceIndex}:${index}`) ?? [vertex]),
  );
  /** Source face (for material/smooth) of every polygon, in `polygons` order. */
  const sourceFace: number[] = faceLoops.map((_, faceIndex) => faceIndex);
  const withoutRepeats = (loop: readonly number[]): number[] => {
    const out: number[] = [];
    for (const vertex of loop) if (out[out.length - 1] !== vertex) out.push(vertex);
    if (out.length > 1 && out[0] === out[out.length - 1]) out.pop();
    return out;
  };

  // One chamfer quad per selected edge: [lo corner in the lo->hi face, lo corner in the hi->lo face,
  // hi corner in the hi->lo face, hi corner in the lo->hi face]. Opposite to both neighbours' new edges.
  const cornerPoint = (face: number, vertex: number): number =>
    replacement.get(`${face}:${faceLoops[face]!.indexOf(vertex)}`)![0]!;
  for (const [key, [lo, hi]] of selected) {
    const use = uses.get(key)!;
    const forward = use.forward[0]!;
    const backward = use.backward[0]!;
    // An end vertex with only two edges (a point cut into a straight edge) gives both faces the same corner point,
    // so the chamfer narrows to a triangle there.
    polygons.push(withoutRepeats([
      cornerPoint(forward, lo),
      cornerPoint(backward, lo),
      cornerPoint(backward, hi),
      cornerPoint(forward, hi),
    ]));
    sourceFace.push(forward);
  }

  // Edges around the bevel vertices that no face shares yet get capped by walking the missing opposite edges.
  const touched = (vertex: number) => vertex >= originalVertexCount || bevelVertices.has(vertex);
  const directedKey = (from: number, to: number) => `${from}>${to}`;
  const collectDirected = (): Set<string> | null => {
    const directed = new Set<string>();
    for (const polygon of polygons) {
      for (let i = 0; i < polygon.length; i += 1) {
        const key = directedKey(polygon[i]!, polygon[(i + 1) % polygon.length]!);
        if (directed.has(key)) return null;
        directed.add(key);
      }
    }
    return directed;
  };
  const directed = collectDirected();
  if (!directed) return fail("topology-failed", "bevel produced inconsistent face orientation");
  const missing = new Map<number, number[]>();
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const from = polygon[i]!;
      const to = polygon[(i + 1) % polygon.length]!;
      if (directed.has(directedKey(to, from)) || !(touched(from) || touched(to))) continue;
      const list = missing.get(to) ?? [];
      list.push(from);
      missing.set(to, list);
    }
  }
  const caps: { readonly vertices: number[]; readonly source: number }[] = [];
  const spent = new Set<string>();
  // Start from kept original vertices: they may be shared by several caps, the ports and inner points are not.
  const starts = [...missing.keys()].sort((a, b) => Number(!bevelVertices.has(a)) - Number(!bevelVertices.has(b)));
  for (const start of starts) {
    for (const first of missing.get(start)!) {
      if (spent.has(directedKey(start, first))) continue;
      spent.add(directedKey(start, first));
      const cap = [start];
      let current = first;
      while (current !== start) {
        cap.push(current);
        const options = (missing.get(current) ?? []).filter((to) => !spent.has(directedKey(current, to)));
        let next: number | undefined;
        if (options.includes(start)) next = start;
        else if (options.length === 1) next = options[0];
        if (next === undefined) return fail("topology-failed", "bevel could not close the corner around an end vertex");
        spent.add(directedKey(current, next));
        current = next;
      }
      if (cap.length < 3) return fail("topology-failed", "bevel could not close the corner around an end vertex");
      const host = cap.map((vertex) => hostOf.get(vertex) ?? (bevelVertices.has(vertex) ? vertex : undefined))
        .find((vertex) => vertex !== undefined);
      caps.push({ vertices: cap, source: host === undefined ? 0 : cornersAt.get(host)![0]!.face });
    }
  }

  const polygonArea = (polygon: readonly number[]): number => {
    const origin = positions[polygon[0]!]!;
    let sum = vec(0, 0, 0);
    for (let i = 1; i + 1 < polygon.length; i += 1) {
      sum = add(sum, cross(sub(positions[polygon[i]!]!, origin), sub(positions[polygon[i + 1]!]!, origin)));
    }
    return 0.5 * length(sum);
  };
  const isFlat = (polygon: readonly number[]): boolean => {
    let longest = 0;
    for (let i = 0; i < polygon.length; i += 1) {
      longest = Math.max(longest, length(sub(positions[polygon[i]!]!, positions[polygon[(i + 1) % polygon.length]!]!)));
    }
    return polygonArea(polygon) <= Math.max(kernel.areaEpsilon, 1e-9 * longest * longest);
  };
  // A cap whose two ports lie on one straight line through the kept vertex (an untouched edge meets a straight line
  // of edges) would be a zero-area triangle. The kept vertex slides along that line to the cap's next point instead,
  // which closes the same corner with no flat face and keeps both neighbours planar.
  for (const cap of caps) {
    const kept = cap.vertices.find((vertex) => bevelVertices.has(vertex));
    const slidable = cap.vertices.length === 3 && kept !== undefined && isFlat(cap.vertices)
      && caps.filter((other) => other.vertices.includes(kept)).length === 1;
    if (!slidable) {
      polygons.push(cap.vertices);
      sourceFace.push(cap.source);
      continue;
    }
    const target = cap.vertices[(cap.vertices.indexOf(kept) + 1) % 3]!;
    for (let i = 0; i < faceLoops.length; i += 1) {
      if (polygons[i]!.includes(kept)) {
        polygons[i] = withoutRepeats(polygons[i]!.map((vertex) => (vertex === kept ? target : vertex)));
      }
    }
  }

  const closed = collectDirected();
  if (!closed) return fail("topology-failed", "bevel produced inconsistent face orientation");
  for (const polygon of polygons) {
    for (let i = 0; i < polygon.length; i += 1) {
      const from = polygon[i]!;
      const to = polygon[(i + 1) % polygon.length]!;
      if (!closed.has(directedKey(to, from)) && (touched(from) || touched(to))) {
        return fail("topology-failed", "bevel left an open edge around an end vertex");
      }
    }
  }

  // A face that was not flat before must not end up flat, repeat a vertex or shrink below a triangle.
  const flatBefore = new Set<number>();
  faceLoops.forEach((loop, index) => {
    if (isFlat(loop)) flatBefore.add(index);
  });
  const collapsed = polygons.findIndex((polygon, index) =>
    polygon.length < 3 || new Set(polygon).size !== polygon.length || (isFlat(polygon) && !flatBefore.has(index)));
  if (collapsed >= 0) return fail("topology-failed", "bevel collapsed a face; use a smaller amount");

  // Bevel vertices no polygon uses any more are dropped; every other position keeps its relative order.
  const used = new Set<number>();
  for (const polygon of polygons) for (const vertex of polygon) used.add(vertex);
  const remap = new Map<number, number>();
  const keptPositions: StudioMeshVec3[] = [];
  positions.forEach((position, index) => {
    if (bevelVertices.has(index) && !used.has(index)) return;
    remap.set(index, keptPositions.length);
    keptPositions.push(position);
  });

  try {
    const built = kernel.createMeshFromPolygons(
      keptPositions,
      polygons.map((polygon) => polygon.map((vertex) => remap.get(vertex)!)),
    );
    const next: StudioEditableMesh = {
      ...built,
      faces: built.faces.map((face, index) => {
        const source = mesh.faces[sourceFace[index]!];
        return source ? { ...face, materialSlot: source.materialSlot, smooth: source.smooth } : face;
      }),
    };
    const before = kernel.meshStats(mesh);
    const after = kernel.meshStats(next);
    if (after.faceCount <= before.faceCount) {
      return fail("topology-failed", `bevel did not add a face (f ${before.faceCount}→${after.faceCount})`);
    }
    if (after.boundaryEdgeCount !== before.boundaryEdgeCount) {
      return fail(
        "topology-failed",
        `bevel changed the open boundary (${before.boundaryEdgeCount}→${after.boundaryEdgeCount} half-edges)`,
      );
    }
    return ok(next);
  } catch (error) {
    return fail(
      "topology-failed",
      error instanceof Error ? error.message : "bevel rebuild failed",
    );
  }
}
