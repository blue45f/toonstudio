import { describe, expect, it } from "vitest";

import { hashStudioEditableMesh, serializeStudioEditableMesh, validateStudioEditableMeshSerializableAuthority } from "../studio-editable-half-edge-mesh";
import { insetStudioEditableMeshFacesByDistance, offsetStudioEditableMeshFace } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-kernel";
import { drawStudioEditableMeshFacePolygon } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-draw";
import { pushPullStudioEditableMeshFaces } from "../hybrid-dcc/studio-hybrid-dcc-face-pushpull";
import { convertStudioBg3dPrimitiveToEditableMesh } from "./studio-bg3d-primitive-edit-mesh";
import { createStudioBg3dPrimitiveEditAuthoring, parseStudioBg3dPrimitiveEditAuthoring,
  STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_LIMITS } from "./studio-bg3d-primitive-edit-authoring";

import type { StudioEditableMesh } from "../studio-editable-half-edge-mesh";
import type { StudioHybridDccObjectTransform } from "../hybrid-dcc/studio-hybrid-dcc-object-transform";
import type { StudioFaceModelingResult } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-mesh";
import type { StudioPlanarPoint } from "../hybrid-dcc/studio-hybrid-dcc-face-modeling-geometry";
import type { StudioBg3dPrimitiveEditAuthoringResult } from "./studio-bg3d-primitive-edit-authoring";

function kernel<T>(result: StudioFaceModelingResult<T>): T {
  if (!result.ok) throw new Error(result.detail); return result.value;
}
function value(result: StudioBg3dPrimitiveEditAuthoringResult) {
  if (!result.ok) throw new Error(result.messageKo); return result.value;
}
function box() {
  const converted = convertStudioBg3dPrimitiveToEditableMesh({ id: "actual-source-box", kind: "box" });
  if (!converted.ok) throw new Error(converted.detail); return converted.value;
}
function historical(): StudioHybridDccObjectTransform {
  return { revision: 1, position: [2.25, 0.75, -3.5], rotationEulerRad: [0.31, -0.63, 0.24], scale: [1.8, 0.6, 2.2] };
}
function input(mesh = box().mesh) {
  return { assetId: "actual-source-box", revision: 2, mesh, objectTransformAtExport: historical(), colorSrgb: "#c9a876" };
}
function envelope() { return value(createStudioBg3dPrimitiveEditAuthoring(input())).envelope; }
function topologyCases() {
  const source = box().mesh, square: readonly StudioPlanarPoint[] = [[-0.2, -0.2], [0.2, -0.2], [0.2, 0.2], [-0.2, 0.2]];
  const inset = kernel(insetStudioEditableMeshFacesByDistance(source, [2], 0.1));
  const draw = kernel(drawStudioEditableMeshFacePolygon(source, 2, square));
  return [
    { name: "Inset", outcome: inset },
    { name: "inward Offset", outcome: kernel(offsetStudioEditableMeshFace(source, 2, 0.1, "inward")) },
    { name: "Draw 후 outward Offset", outcome: kernel(offsetStudioEditableMeshFace(draw.mesh, draw.selectionFaceIds[0], 0.1, "outward")) },
    { name: "Face Draw", outcome: draw },
    { name: "Draw 후 face extrusion", outcome: kernel(pushPullStudioEditableMeshFaces(draw.mesh, draw.selectionFaceIds, -0.25)) },
    { name: "Inset 후 face extrusion", outcome: kernel(pushPullStudioEditableMeshFaces(inset.mesh, inset.selectionFaceIds, 0.25)) },
  ];
}

describe("기본 도형 면 편집 authoring JSON·mesh 권위", () => {
  it("실제 원본 box의 12 triangles→6 quads와 정확한 snapshot·TRS·색을 분리 보존한다", () => {
    const source = box(), request = input(source.mesh), before = hashStudioEditableMesh(source.mesh);
    const created = value(createStudioBg3dPrimitiveEditAuthoring(request));
    expect(source.sourceTriangleCount).toBe(12); expect(source.mesh.faces).toHaveLength(6);
    expect(source.faceSources[2]?.sourceTriangleIds).toEqual([4, 5]);
    expect(created.envelope).toMatchObject({ format: STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_FORMAT, version: 1,
      coordinates: { space: "object-local", units: "meters", upAxis: "Y", trsBaked: false },
      source: { assetId: request.assetId, revision: 2, meshHash: before, originPrimitiveKind: "box" },
      sourceMaterialAtExport: { kind: "plain-box-v1", colorSrgb: "#c9a876" } });
    expect(created.envelope.objectTransformAtExport).toEqual(historical());
    expect(created.mesh).toEqual(source.mesh); expect(created.mesh).not.toBe(source.mesh);
    expect(created.envelope.mesh).toEqual(serializeStudioEditableMesh(source.mesh));
    expect(hashStudioEditableMesh(source.mesh)).toBe(before);
    expect(created.byteLength).toBe(new TextEncoder().encode(JSON.stringify(created.envelope)).byteLength);
  });

  it("실제 Push/Pull의 double 좌표를 JSON 왕복해도 Float32 렌더 좌표로 바꾸지 않는다", () => {
    const edited = kernel(pushPullStudioEditableMeshFaces(box().mesh, [2], 0.12345678901234566)).mesh;
    const built = value(createStudioBg3dPrimitiveEditAuthoring(input(edited)));
    const json: unknown = JSON.parse(JSON.stringify(built.envelope));
    const restored = value(parseStudioBg3dPrimitiveEditAuthoring(json));
    expect(edited.vertices.some(({ position }) => Math.fround(position.y) !== position.y)).toBe(true);
    expect(restored.mesh).toEqual(edited);
    expect(hashStudioEditableMesh(restored.mesh)).toBe(hashStudioEditableMesh(edited));
    expect(restored.envelope.objectTransformAtExport).toEqual(historical());
  });

  it.each(topologyCases())("$name 결과의 전체 ID·counter·좌표를 추가 remap 없이 정확히 복원한다", ({ outcome }) => {
    const mesh = outcome.mesh, before = hashStudioEditableMesh(mesh), created = value(createStudioBg3dPrimitiveEditAuthoring(input(mesh)));
    const restored = value(parseStudioBg3dPrimitiveEditAuthoring(created.envelope));
    expect(validateStudioEditableMeshSerializableAuthority(mesh).ok).toBe(true);
    expect(restored.mesh).toEqual(mesh); expect(hashStudioEditableMesh(restored.mesh)).toBe(before);
    expect(restored.mesh.nextVertexId).toBe(mesh.vertices.length);
    expect(restored.mesh.nextHalfEdgeId).toBe(mesh.halfEdges.length);
    expect(restored.mesh.nextFaceId).toBe(mesh.faces.length);
    // 연산 자체의 ID 연속성은 이 remap이 담당한다. parser는 확정된 결과를 다시 번호 매기지 않는다.
    expect(outcome.faceRemap.some(([from, to]) => to !== null && from !== to)).toBe(true);
  });

  it("producer의 uppercase hex만 의미를 보존해 canonical lower case로 저장한다", () => {
    const built = value(createStudioBg3dPrimitiveEditAuthoring({ ...input(), colorSrgb: "#C9A876" }));
    expect(built.envelope.sourceMaterialAtExport.colorSrgb).toBe("#c9a876");
    expect(parseStudioBg3dPrimitiveEditAuthoring({ ...built.envelope,
      sourceMaterialAtExport: { kind: "plain-box-v1", colorSrgb: "#C9A876" } })).toMatchObject({ ok: false, code: "invalid-schema" });
  });

  it("input의 후속 변경과 결과 mesh 변경을 서로 격리하고 null prototype JSON도 허용한다", () => {
    const original = envelope(), candidate = { ...original, source: { ...original.source } };
    Object.setPrototypeOf(candidate, null);
    const restored = value(parseStudioBg3dPrimitiveEditAuthoring(candidate));
    candidate.source.assetId = "changed-after-parse";
    expect(restored.envelope.source.assetId).toBe(original.source.assetId);
    expect(restored.envelope.objectTransformAtExport).not.toBe(original.objectTransformAtExport);
    expect(restored.mesh.vertices[0].position).not.toBe(restored.envelope.mesh.positions[0]);
  });

  it("getter와 toJSON을 실행하지 않으며 순환·prototype·sparse 입력을 거부한다", () => {
    const original = envelope(); let calls = 0;
    const getter = { ...original }; Object.defineProperty(getter, "version", { enumerable: true, get() { calls += 1; return 1; } });
    const toJson = { ...original, toJSON() { calls += 1; return original; } };
    const custom = { ...original }; Object.setPrototypeOf(custom, { inherited: true });
    const customArray = structuredClone(original); Object.setPrototypeOf(customArray.mesh.positions, { inherited: true });
    const cycle: Record<string, unknown> = { ...original }; cycle.mesh = cycle;
    const sparse = { ...original, mesh: { ...original.mesh, positions: new Array(8) } };
    for (const candidate of [getter, toJson, custom, customArray, cycle, sparse]) {
      expect(parseStudioBg3dPrimitiveEditAuthoring(candidate)).toMatchObject({ ok: false, code: "invalid-json" });
    }
    expect(calls).toBe(0);
  });

  it("독성 키·symbol·숨긴 속성·custom array 속성을 거부한다", () => {
    const original = envelope(), toxic = { ...original }, symbol = { ...original }, hidden = { ...original };
    Object.defineProperty(toxic, "__proto__", { enumerable: true, value: { polluted: true } });
    Object.defineProperty(symbol, Symbol("untrusted"), { enumerable: true, value: 1 });
    Object.defineProperty(hidden, "hidden", { enumerable: false, value: 1 });
    const arrayProperty = structuredClone(original);
    Object.defineProperty(arrayProperty.mesh.positions, "toJSON", { enumerable: true, value: "invalid" });
    for (const candidate of [toxic, symbol, hidden, arrayProperty, { ...original, constructor: {} }, { ...original, prototype: {} }]) {
      expect(parseStudioBg3dPrimitiveEditAuthoring(candidate)).toMatchObject({ ok: false, code: "invalid-json" });
    }
  });

  it.each([
    ["지원하지 않는 버전", (base: ReturnType<typeof envelope>) => ({ ...base, version: 2 }), "unsupported-version"],
    ["좌표 권위", (base: ReturnType<typeof envelope>) => ({ ...base, coordinates: { ...base.coordinates, trsBaked: true } }), "invalid-schema"],
    ["새 root key", (base: ReturnType<typeof envelope>) => ({ ...base, ignored: true }), "invalid-schema"],
    ["새 nested key", (base: ReturnType<typeof envelope>) => ({ ...base, source: { ...base.source, ignored: true } }), "invalid-schema"],
    ["새 material key", (base: ReturnType<typeof envelope>) => ({ ...base, sourceMaterialAtExport: { ...base.sourceMaterialAtExport, ignored: true } }), "invalid-schema"],
    ["material kind", (base: ReturnType<typeof envelope>) => ({ ...base, sourceMaterialAtExport: { ...base.sourceMaterialAtExport, kind: "pbr" } }), "invalid-schema"],
    ["legacy weak hash", (base: ReturnType<typeof envelope>) => ({ ...base, source: { ...base.source, meshHash: "mesh:12345678" } }), "invalid-schema"],
    ["다른 exact hash", (base: ReturnType<typeof envelope>) => ({ ...base, source: { ...base.source, meshHash: `mesh:sha256:${"0".repeat(64)}` } }), "hash-mismatch"],
    ["next counter", (base: ReturnType<typeof envelope>) => ({ ...base, mesh: { ...base.mesh, authorityCounters: { ...base.mesh.authorityCounters, nextFaceId: 99 } } }), "mesh-invalid"],
    ["정점 인덱스", (base: ReturnType<typeof envelope>) => ({ ...base, mesh: { ...base.mesh, faces: [[0, 1, 999]] } }), "invalid-schema"],
    ["NaN", (base: ReturnType<typeof envelope>) => ({ ...base, mesh: { ...base.mesh, positions: [[Number.NaN, 0, 0]] } }), "invalid-json"],
    ["Infinity TRS", (base: ReturnType<typeof envelope>) => ({ ...base, objectTransformAtExport: { ...base.objectTransformAtExport, scale: [Infinity, 1, 1] } }), "invalid-json"],
    ["zero TRS scale", (base: ReturnType<typeof envelope>) => ({ ...base, objectTransformAtExport: { ...base.objectTransformAtExport, scale: [0, 1, 1] } }), "invalid-schema"],
    ["중복 face attributes", (base: ReturnType<typeof envelope>) => ({ ...base, mesh: { ...base.mesh, faceAttributes: [...(base.mesh.faceAttributes ?? []), { faceIndex: 0, materialSlot: 0, smooth: false }] } }), "budget-exceeded"],
  ])("%s를 한국어 오류로 거부한다", (_label, mutate, code) => {
    const result = parseStudioBg3dPrimitiveEditAuthoring(mutate(envelope()));
    expect(result).toMatchObject({ ok: false, code, messageKo: expect.stringMatching(/[가-힣]/u) });
  });

  it.each(["#abc", "transparent", "#gg0000", "#000000ff"])("producer의 비지원 색 %s를 거부한다", (colorSrgb) => {
    expect(createStudioBg3dPrimitiveEditAuthoring({ ...input(), colorSrgb })).toMatchObject({ ok: false, code: "invalid-schema" });
  });

  it("byte·vertex·face·corner·face corner·depth의 실제 고정 예산을 명시적으로 거부한다", () => {
    const base = envelope(), limits = STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_LIMITS;
    const vertices = { ...base, mesh: { ...base.mesh, positions: Array.from({ length: limits.maxVertices + 1 }, () => [0, 0, 0]) } };
    const faces = { ...base, mesh: { ...base.mesh, faces: Array.from({ length: limits.maxFaces + 1 }, () => [0, 1, 2]) } };
    const corners = { ...base, mesh: { ...base.mesh, faces: Array.from({ length: 129 }, () => Array.from({ length: 256 }, (_, index) => index % 8)) } };
    const faceCorners = { ...base, mesh: { ...base.mesh, faces: [Array.from({ length: limits.maxFaceCorners + 1 }, (_, index) => index % 8)] } };
    const bytes = { ...base, source: { ...base.source, assetId: "가".repeat(limits.maxBytes) } };
    let deep: unknown = null; for (let index = 0; index <= limits.maxDepth; index += 1) deep = { nested: deep };
    for (const candidate of [vertices, faces, corners, faceCorners, bytes, { ...base, ignored: deep }]) {
      expect(parseStudioBg3dPrimitiveEditAuthoring(candidate)).toMatchObject({ ok: false, code: "budget-exceeded" });
    }
  });

  it("producer가 oversized mesh를 hash·snapshot 복제 전에 거부하고 sparse/retired 권위를 재번호 매기지 않는다", () => {
    const mesh = box().mesh, huge: StudioEditableMesh = { ...mesh,
      vertices: new Array<StudioEditableMesh["vertices"][number]>(STUDIO_BG3D_PRIMITIVE_EDIT_AUTHORING_LIMITS.maxVertices + 1) };
    expect(createStudioBg3dPrimitiveEditAuthoring(input(huge))).toMatchObject({ ok: false, code: "budget-exceeded" });
    const spare = { ...mesh, nextFaceId: mesh.nextFaceId + 10 };
    const sparse = { ...mesh, faces: mesh.faces.map((face) => ({ ...face, id: face.id + 10 })),
      halfEdges: mesh.halfEdges.map((edge) => ({ ...edge, face: edge.face < 0 ? edge.face : edge.face + 10 })), nextFaceId: mesh.nextFaceId + 10 };
    for (const candidate of [spare, sparse]) expect(createStudioBg3dPrimitiveEditAuthoring(input(candidate))).toMatchObject({ ok: false, code: "mesh-invalid" });
  });
});
