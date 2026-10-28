import { describe, expect, it, vi } from "vitest";

import {
  createStudioUnitCubeMesh,
  type StudioEditableMesh,
} from "../studio-editable-half-edge-mesh";
import {
  applyStudioGeometryAuthorityModifierStack,
  assertRenderCacheIsNotAuthority,
  commitStudioGeometryAuthorityMesh,
  createStudioGeometryAuthorityRegistry,
  materializeStudioGeometryRenderCache,
  registerStudioGeometryAuthority,
  setStudioGeometryAuthorityModifierStack,
  type StudioGeometryAuthorityRegistry,
} from "../studio-geometry-authority";
import {
  createStudioMeshModifierStack,
  evaluateStudioMeshModifierStack,
  withStudioMeshModifier,
} from "../studio-mesh-modifier-stack";
import { hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";
import { planStudioMeshSurface } from "../mesh-surface/studio-mesh-surface-plan";
import { contentAddressStudioMeshRenderCacheSurface } from "../mesh-surface/studio-mesh-render-cache-surface";
import * as surfaceRender from "../mesh-surface/studio-mesh-surface-render";

function registeredCube(): StudioGeometryAuthorityRegistry {
  const result = registerStudioGeometryAuthority(
    createStudioGeometryAuthorityRegistry(),
    "cube",
    createStudioUnitCubeMesh(),
  );
  if (!result.ok) throw new Error(result.detail);
  return result.value;
}

function withArrayModifier(registry: StudioGeometryAuthorityRegistry) {
  const record = registry.records.cube!;
  const stack = withStudioMeshModifier(createStudioMeshModifierStack(record.mesh), {
    kind: "array",
    id: "array-three",
    enabled: true,
    count: 3,
    offset: { x: 1.25, y: 0, z: 0 },
    mode: "linear",
    radialAngleRad: Math.PI * 2,
    realizeInstances: true,
  });
  const result = setStudioGeometryAuthorityModifierStack(registry, "cube", stack);
  if (!result.ok) throw new Error(result.detail);
  return result.value;
}

describe("Geometry Authority disposable render-cache integrity", () => {
  it("rejects source coordinates outside the renderer budget at every authority boundary", () => {
    const cube = createStudioUnitCubeMesh();
    const oversized = {
      ...cube,
      vertices: cube.vertices.map((vertex, index) => index === 0
        ? { ...vertex, position: { ...vertex.position, x: 1e100 } }
        : vertex),
    };

    expect(registerStudioGeometryAuthority(
      createStudioGeometryAuthorityRegistry(),
      "oversized",
      oversized,
    )).toMatchObject({ ok: false, code: "coordinate-out-of-range" });

    const registered = registeredCube();
    expect(commitStudioGeometryAuthorityMesh(registered, "cube", oversized)).toMatchObject({
      ok: false,
      code: "coordinate-out-of-range",
    });

    const modified = withArrayModifier(registered);
    expect(applyStudioGeometryAuthorityModifierStack(modified, "cube", oversized)).toMatchObject({
      ok: false,
      code: "coordinate-out-of-range",
    });
  });

  it("rejects noncanonical or unserializable meshes at register and commit boundaries", () => {
    const cube = createStudioUnitCubeMesh();
    const alternateOutgoing = cube.halfEdges.find((halfEdge) => (
      cube.halfEdges[halfEdge.prev]!.vertex === 0
      && halfEdge.id !== cube.vertices[0]!.he
    ));
    if (!alternateOutgoing) throw new Error("cube must provide an alternate incident half-edge");
    const variants: readonly (readonly [string, StudioEditableMesh, string])[] = [
      [
        "alternate vertex anchor",
        {
          ...cube,
          vertices: cube.vertices.map((vertex) => (
            vertex.id === 0 ? { ...vertex, he: alternateOutgoing.id } : vertex
          )),
        },
        "canonical first outgoing half-edge",
      ],
      [
        "rotated face anchor",
        {
          ...cube,
          faces: cube.faces.map((face) => (
            face.id === 0 ? { ...face, he: cube.halfEdges[face.he]!.next } : face
          )),
        },
        "canonical first half-edge",
      ],
      [
        "high counters",
        { ...cube, nextHalfEdgeId: cube.nextHalfEdgeId + 1 },
        "canonical dense-ID authority invariant",
      ],
      [
        "invalid vertex crease",
        {
          ...cube,
          vertices: cube.vertices.map((vertex) => (
            vertex.id === 0 ? { ...vertex, crease: -0.01 } : vertex
          )),
        },
        "vertex 0 crease must be finite in [0,1]",
      ],
      [
        "invalid half-edge crease",
        {
          ...cube,
          halfEdges: cube.halfEdges.map((halfEdge) => (
            halfEdge.id === 0 ? { ...halfEdge, crease: Number.POSITIVE_INFINITY } : halfEdge
          )),
        },
        "half-edge 0 crease must be finite in [0,1]",
      ],
      [
        "invalid material slot",
        {
          ...cube,
          faces: cube.faces.map((face) => (
            face.id === 0 ? { ...face, materialSlot: 0.5 } : face
          )),
        },
        "face 0 material slot must be a non-negative safe integer",
      ],
      [
        "invalid smooth flag",
        {
          ...cube,
          faces: cube.faces.map((face) => (
            face.id === 0
              ? { ...face, smooth: "false" as unknown as boolean }
              : face
          )),
        },
        "face 0 smooth flag must be boolean",
      ],
    ];

    const registered = registeredCube();
    for (const [index, [label, mesh, detail]] of variants.entries()) {
      expect(registerStudioGeometryAuthority(
        createStudioGeometryAuthorityRegistry(),
        `invalid-${index}`,
        mesh,
      ), `register: ${label}`).toMatchObject({
        ok: false,
        code: "invalid-mesh",
        detail: expect.stringContaining(detail),
      });
      expect(
        commitStudioGeometryAuthorityMesh(registered, "cube", mesh),
        `commit: ${label}`,
      ).toMatchObject({
        ok: false,
        code: "invalid-mesh",
        detail: expect.stringContaining(detail),
      });
    }
  });

  it("materializes a deterministic projection without advancing authority revision", async () => {
    const registry = withArrayModifier(registeredCube());
    const before = registry.records.cube!;
    const first = await materializeStudioGeometryRenderCache(registry, "cube", { now: 42 });
    if (!first.ok) throw new Error(first.detail);
    const after = first.value.registry.records.cube!;

    expect(after.revision).toBe(before.revision);
    expect(after.mesh).toBe(before.mesh);
    expect(after.meshHash).toBe(before.meshHash);
    expect(first.value.cache.sourceMeshHash).toBe(before.meshHash);
    expect(first.value.cache.sourceModifierStackHash).toMatch(/^modifier-stack:sha256:/u);
    expect(first.value.cache.contentHash).toMatch(/^sha256:[0-9a-f]{64}$/u);
    expect(first.value.cache.derivedFromHash).not.toBe(before.meshHash);
    expect(assertRenderCacheIsNotAuthority(after)).toBe(true);

    const repeated = await materializeStudioGeometryRenderCache(registry, "cube", { now: 99 });
    if (!repeated.ok) throw new Error(repeated.detail);
    expect(repeated.value.registry.records.cube!.revision).toBe(before.revision);
    expect(repeated.value.cache.derivedFromHash).toBe(first.value.cache.derivedFromHash);
    expect(repeated.value.cache.positions).toEqual(first.value.cache.positions);
    expect(repeated.value.cache.indices).toEqual(first.value.cache.indices);
  });

  it("rejects caches detached from authority, stack provenance, or valid triangle data", async () => {
    const registry = withArrayModifier(registeredCube());
    const materialized = await materializeStudioGeometryRenderCache(registry, "cube");
    if (!materialized.ok) throw new Error(materialized.detail);
    const record = materialized.value.registry.records.cube!;
    const cache = record.renderCache!;

    expect(assertRenderCacheIsNotAuthority({
      ...record,
      renderCache: { ...cache, sourceMeshHash: "mesh:deadbeef" },
    })).toBe(false);
    expect(assertRenderCacheIsNotAuthority({
      ...record,
      renderCache: { ...cache, sourceModifierStackHash: "modifier-stack:sha256:stale" },
    })).toBe(false);
    const indices = new Uint32Array(cache.indices);
    indices[0] = cache.positions.length / 3;
    expect(assertRenderCacheIsNotAuthority({
      ...record,
      renderCache: { ...cache, indices },
    })).toBe(false);
    const positions = new Float32Array(cache.positions);
    positions[0] = Number.NaN;
    expect(assertRenderCacheIsNotAuthority({
      ...record,
      renderCache: { ...cache, positions },
    })).toBe(false);
    const oversizedPositions = new Float32Array(cache.positions);
    oversizedPositions[0] = 1_000_001;
    expect(assertRenderCacheIsNotAuthority({
      ...record,
      renderCache: { ...cache, positions: oversizedPositions },
    })).toBe(false);
  });

  it("평가된 Array의 실제 UV·혼합 음영·큰 재질 슬롯을 같은 삼각형 순서로 보존한다", async () => {
    const cube = createStudioUnitCubeMesh();
    const mesh: StudioEditableMesh = {
      ...cube,
      faces: cube.faces.map((face) => ({ ...face, smooth: face.id !== 0, materialSlot: 2 ** 40 + face.id })),
      uvLayer: { revision: 1, topologyHash: hashStudioMeshUvTopology(cube), corners: cube.halfEdges.map(({ id }) => ({
        halfEdgeId: id, u: Math.fround(id / 32 - 0.25), v: Math.fround(0.2 + id / 64),
      })) },
    };
    const registered = registerStudioGeometryAuthority(createStudioGeometryAuthorityRegistry(), "cube", mesh);
    if (!registered.ok) throw new Error(registered.detail);
    const registry = withArrayModifier(registered.value); const before = registry.records.cube;
    if (!before) throw new Error("원본 메시가 없습니다.");
    const evaluated = await evaluateStudioMeshModifierStack(before.modifierStack);
    if (!evaluated.ok) throw new Error(evaluated.detail);
    const plan = planStudioMeshSurface(evaluated.value.mesh);
    if (!plan.ok) throw new Error(plan.issue.detail);
    const result = await materializeStudioGeometryRenderCache(registry, "cube");
    if (!result.ok) throw new Error(result.detail);
    const record = result.value.registry.records.cube; const cache = result.value.cache; const surface = cache.surface;
    if (!record || !surface || !surface.cornerUvs) throw new Error("평가 결과의 표시 속성이 없습니다.");
    expect(record.mesh).toBe(mesh); expect(record.meshHash).toBe(before.meshHash); expect(record.revision).toBe(before.revision);
    expect(before.renderCache).toBeNull(); expect(cache.positions.length).toBe(evaluated.value.mesh.vertices.length * 3);
    expect(cache.indices.length).toBe(plan.value.triangles.length * 3);
    expect(surface.derivedMeshHash).toBe(evaluated.value.resultHash); expect(surface.geometryContentHash).toBe(cache.contentHash);
    expect(surface.cornerNormals).toHaveLength(cache.indices.length * 3);
    expect(new Set(surface.triangleMaterialSlots)).toEqual(new Set(cube.faces.map(({ id }) => 2 ** 40 + id)));
    const uv = new Map(evaluated.value.mesh.uvLayer?.corners.map((corner) => [corner.halfEdgeId, corner]));
    const dense = new Map(evaluated.value.mesh.vertices.map((vertex, index) => [vertex.id, index]));
    for (const [index, triangle] of plan.value.triangles.entries()) {
      expect(surface.triangleMaterialSlots[index]).toBe(evaluated.value.mesh.faces[triangle.faceId]?.materialSlot);
      for (let corner = 0; corner < 3; corner += 1) {
        const sourceId = triangle.vertexIds[corner]; const cornerId = triangle.cornerHalfEdgeIds[corner];
        if (sourceId === undefined || cornerId === undefined) throw new Error("삼각형 원본 코너가 없습니다.");
        const sourceUv = uv.get(cornerId); if (!sourceUv) throw new Error("평가 UV가 없습니다.");
        const write = index * 3 + corner;
        expect(cache.indices[write]).toBe(dense.get(sourceId));
        expect(Array.from(surface.cornerUvs.subarray(write * 2, write * 2 + 2))).toEqual([sourceUv.u, sourceUv.v]);
        expect(Math.hypot(...surface.cornerNormals.subarray(write * 3, write * 3 + 3))).toBeCloseTo(1, 6);
      }
    }
    expect(assertRenderCacheIsNotAuthority(record)).toBe(true);
  });

  it("기하가 같아도 표시 속성의 변조를 거부하며 metadata 없는 legacy cache만 호환한다", async () => {
    const result = await materializeStudioGeometryRenderCache(withArrayModifier(registeredCube()), "cube");
    if (!result.ok) throw new Error(result.detail);
    const record = result.value.registry.records.cube; const cache = result.value.cache; const surface = cache.surface;
    if (!record || !surface) throw new Error("캐시 표시 속성이 없습니다.");
    const normals = new Float32Array(surface.cornerNormals); normals[0] = -(normals[0] ?? 0); normals[1] = 1;
    const slots = new Float64Array(surface.triangleMaterialSlots); slots[0] = 2 ** 40 + 1;
    for (const changed of [{ ...surface, cornerNormals: normals }, { ...surface, triangleMaterialSlots: slots },
      { ...surface, derivedMeshHash: "mesh:deadbeef" }, { ...surface, geometryContentHash: `sha256:${"f".repeat(64)}` as const }]) {
      expect(assertRenderCacheIsNotAuthority({ ...record, renderCache: { ...cache, surface: changed } })).toBe(false);
    }
    const malformed = { ...surface, triangleMaterialSlots: new Float64Array([-1]) };
    expect(assertRenderCacheIsNotAuthority({ ...record, renderCache: { ...cache, surface: { ...malformed, contentHash: contentAddressStudioMeshRenderCacheSurface(malformed) } } })).toBe(false);
    const { surface: removed, ...legacy } = cache;
    expect(removed).toBe(surface); expect(assertRenderCacheIsNotAuthority({ ...record, renderCache: legacy })).toBe(true);
  });

  it("no-op 평가 캐시의 배열을 변조해도 같은 원본 projection과 다른 asset을 오염시키지 않는다", async () => {
    const mesh = createStudioUnitCubeMesh();
    let registry = createStudioGeometryAuthorityRegistry();
    for (const id of ["cube", "other"]) {
      const result = registerStudioGeometryAuthority(registry, id, mesh);
      if (!result.ok) throw new Error(result.detail);
      registry = result.value;
    }
    const observe = vi.spyOn(surfaceRender, "projectStudioMeshSurfaceForRender");
    try {
      const result = await materializeStudioGeometryRenderCache(registry, "cube");
      if (!result.ok) throw new Error(result.detail);
      const call = observe.mock.calls[0], returned = observe.mock.results[0];
      if (!call || !returned || returned.type !== "return") throw new Error("실제 projection 호출이 없습니다.");
      const projection = returned.value, cache = result.value.cache;
      if (!cache.surface) throw new Error("표시 속성이 없습니다.");
      expect(call[0]).toBe(mesh);
      expect(cache.positions).not.toBe(projection.positions); expect(cache.indices).not.toBe(projection.indices);
      expect(cache.surface.cornerNormals).not.toBe(projection.cornerNormals);
      expect(cache.surface.triangleMaterialSlots).not.toBe(projection.triangleMaterialSlots);
      const before = { positions: projection.positions.slice(), indices: projection.indices.slice(),
        normals: projection.cornerNormals.slice(), slots: projection.triangleMaterialSlots.slice() };
      cache.positions[0] = 99; cache.indices[0] = 7;
      cache.surface.cornerNormals.fill(0); cache.surface.triangleMaterialSlots.fill(17);
      const originalDisplay = surfaceRender.projectStudioMeshSurfaceForRender(mesh, call[1]);
      expect(originalDisplay).toBe(projection);
      expect(originalDisplay.positions).toEqual(before.positions); expect(originalDisplay.indices).toEqual(before.indices);
      expect(originalDisplay.cornerNormals).toEqual(before.normals); expect(originalDisplay.triangleMaterialSlots).toEqual(before.slots);
      const other = await materializeStudioGeometryRenderCache(result.value.registry, "other");
      if (!other.ok) throw new Error(other.detail);
      expect(other.value.cache.positions).toEqual(before.positions); expect(other.value.cache.indices).toEqual(before.indices);
      expect(other.value.cache.surface?.cornerNormals).toEqual(before.normals);
      expect(other.value.cache.surface?.triangleMaterialSlots).toEqual(before.slots);
      expect(registry.records.cube?.mesh).toBe(mesh); expect(registry.records.other?.mesh).toBe(mesh);
      expect(mesh.vertices[0]?.position.x).toBe(-0.5);
      const corrupted = result.value.registry.records.cube;
      if (!corrupted) throw new Error("변조 검증 대상이 없습니다.");
      expect(assertRenderCacheIsNotAuthority(corrupted)).toBe(false);
    } finally { observe.mockRestore(); }
  });

  it("flat crease 정본은 GLB의 엄격한 crease 정책과 분리해 캐시를 만들고 원본 값을 유지한다", async () => {
    const cube = createStudioUnitCubeMesh();
    const mesh = { ...cube, vertices: cube.vertices.map((vertex) => ({ ...vertex, crease: .25 })), halfEdges: cube.halfEdges.map((edge) => ({ ...edge, crease: .5 })) };
    const registered = registerStudioGeometryAuthority(createStudioGeometryAuthorityRegistry(), "cube", mesh);
    if (!registered.ok) throw new Error(registered.detail);
    const strict = planStudioMeshSurface(mesh); expect(strict.ok).toBe(false);
    const result = await materializeStudioGeometryRenderCache(registered.value, "cube");
    if (!result.ok) throw new Error(result.detail);
    const record = result.value.registry.records.cube; if (!record) throw new Error("표시할 정본이 없습니다.");
    expect(record.mesh).toBe(mesh); expect(record.renderCache?.surface).toBeDefined();
    expect(record.mesh.halfEdges.every((edge) => edge.crease === .5)).toBe(true);
    expect(assertRenderCacheIsNotAuthority(record)).toBe(true);
  });
});
