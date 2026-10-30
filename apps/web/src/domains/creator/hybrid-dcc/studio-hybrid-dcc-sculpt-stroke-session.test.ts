import { describe, expect, it } from "vitest";

import {
  createStudioEditableMeshFromPolygons,
  hashStudioEditableMesh,
  serializeStudioEditableMesh,
  type StudioEditableMesh,
  type StudioMeshVec3,
} from "../studio-editable-half-edge-mesh";
import { decodeStudioMeshUvLayer, hashStudioMeshUvTopology } from "../mesh-uv/studio-mesh-uv-authority";

import { applyStudioSculptStroke, type StudioSculptBrushKind } from "./studio-hybrid-sculpt-kernel";
import {
  appendStudioSculptStrokeSample,
  cancelStudioSculptStrokeSession,
  consumeStudioSculptStrokeReceipt,
  createStudioSculptStrokeSession,
  readStudioSculptStrokePreview,
  sealStudioSculptStrokeSession,
  type StudioSculptStrokeBrush,
  type StudioSculptStrokeSession,
  type StudioSculptStrokeSource,
} from "./studio-hybrid-dcc-sculpt-stroke-session";

const POINTS: readonly StudioMeshVec3[] = [
  { x: .13, y: .21, z: -.08 }, { x: .39, y: .17, z: -.04 }, { x: .21, y: .37, z: .09 },
];
const KINDS: readonly StudioSculptBrushKind[] = ["grab", "smooth", "inflate", "clay", "crease", "flatten", "scrape", "snakeHook"];
const BRUSH: StudioSculptStrokeBrush = { kind: "grab", radius: 3, strength: .025, direction: { x: .25, y: .4, z: .1 } };

function fixture(uv = false): StudioEditableMesh {
  const base = createStudioEditableMeshFromPolygons([
    { x: -.13, y: -.21, z: .12 }, { x: 1.23, y: .07, z: .31 },
    { x: .91, y: 1.37, z: -.08 }, { x: -.42, y: .83, z: .27 },
  ], [[0, 1, 2], [0, 2, 3]]);
  const mesh: StudioEditableMesh = {
    ...base,
    vertices: base.vertices.map((vertex) => ({ ...vertex, crease: vertex.id === 2 ? .25 : 0 })),
    halfEdges: base.halfEdges.map((edge) => ({ ...edge, crease: edge.twin === -1 ? .5 : 0 })),
    faces: base.faces.map((face) => ({ ...face, materialSlot: face.id === 0 ? 7 : 2 ** 40 + 3, smooth: false })),
  };
  if (!uv) return mesh;
  return { ...mesh, uvLayer: decodeStudioMeshUvLayer({
    revision: 1, topologyHash: hashStudioMeshUvTopology(mesh),
    corners: mesh.halfEdges.map((edge) => ({ halfEdgeId: edge.id,
      u: Math.fround(.13 + edge.id * edge.id * .17), v: Math.fround(-.21 + edge.id * .31),
    })),
  }, mesh) };
}

function source(mesh = fixture()): StudioSculptStrokeSource {
  return { documentId: "stroke-pure", workspaceIdentity: {}, documentStateIdentity: {},
    assetId: "mesh", mesh, meshHash: hashStudioEditableMesh(mesh), meshRevision: 1,
  };
}

function append(session: StudioSculptStrokeSession, point: StudioMeshVec3): void {
  const step = appendStudioSculptStrokeSample(session, point);
  if (!step.ok) throw new Error(step.detail);
}

function directly(mesh: StudioEditableMesh, brush: StudioSculptStrokeBrush, mask?: Float32Array) {
  let working = mesh;
  for (const center of POINTS) {
    const result = applyStudioSculptStroke(working, { ...brush, center }, mask);
    if (!result.ok) throw new Error(result.detail);
    working = result.mesh;
  }
  return working;
}

function floatBytes(mesh: StudioEditableMesh): Uint8Array {
  const values = new Float32Array(mesh.vertices.flatMap(({ position }) => [position.x, position.y, position.z]));
  return new Uint8Array(values.buffer);
}

describe("한 조형 gesture의 순수 임시 session", () => {
  it.each(KINDS)("%s sample 순서는 기존 kernel 직접 순회의 위치·UV·속성·hash와 같다", (kind) => {
    const original = fixture(true), before = serializeStudioEditableMesh(original), sourceHash = hashStudioEditableMesh(original);
    const brush: StudioSculptStrokeBrush = { ...BRUSH, kind }, mask = new Float32Array([1, .7, .4, .9]);
    const expected = directly(original, brush, mask), session = createStudioSculptStrokeSession(source(original), brush, mask);
    for (const point of POINTS) append(session, point);
    const preview = readStudioSculptStrokePreview(session);
    if (!preview) throw new Error("실제 변형 fixture의 미리보기가 없습니다.");
    expect(floatBytes(preview.mesh)).toEqual(floatBytes(expected));
    expect(serializeStudioEditableMesh(preview.mesh)).toEqual(serializeStudioEditableMesh(expected));
    expect(preview.meshHash).toBe(hashStudioEditableMesh(expected));
    expect(preview).toMatchObject({ assetId: "mesh", sourceMesh: original, sourceMeshHash: sourceHash, sourceMeshRevision: 1, strokeRevision: POINTS.length });
    expect(preview.sourceMesh).toBe(original);
    expect(serializeStudioEditableMesh(original)).toEqual(before);
    expect(hashStudioEditableMesh(original)).toBe(sourceHash);
    expect(preview.mesh.uvLayer).toEqual(original.uvLayer);
    const receipt = sealStudioSculptStrokeSession(session);
    if (!receipt) throw new Error("변형한 gesture의 receipt가 없습니다.");
    expect(sealStudioSculptStrokeSession(session)).toBe(receipt);
    const result = consumeStudioSculptStrokeReceipt(receipt, (data) => data);
    expect(result.mesh).toBe(preview.mesh); expect(result.sampleCount).toBe(POINTS.length);
    expect(readStudioSculptStrokePreview(session)).toBeNull();
    expect(() => consumeStudioSculptStrokeReceipt(receipt, (data) => data)).toThrow(/사용된/u);
  });

  it("brush·direction·mask를 시작 시 복사해 외부 변경이 이미 시작한 gesture를 바꾸지 않는다", () => {
    const mesh = fixture(true), direction = { x: .2, y: .3, z: .4 };
    const brush = { kind: BRUSH.kind, radius: 3, strength: .025, direction };
    const mask = new Float32Array([1, .8, .5, .2]), originalMask = mask.slice();
    const expected = directly(mesh, { ...brush, direction: { ...direction } }, originalMask);
    const session = createStudioSculptStrokeSession(source(mesh), brush, mask);
    brush.strength = .7; brush.radius = .01; direction.x = 100; mask.fill(0);
    for (const point of POINTS) append(session, point);
    const preview = readStudioSculptStrokePreview(session);
    if (!preview) throw new Error("복사한 입력의 조형 미리보기가 없습니다.");
    expect(serializeStudioEditableMesh(preview.mesh)).toEqual(serializeStudioEditableMesh(expected));
    expect(mask).toEqual(new Float32Array(4)); expect(originalMask).toEqual(new Float32Array([1, .8, .5, .2]));
  });

  it.each(["sample 없음", "강도 0", "mask 0", "반경 밖", "Float32 미만"])("%s은 원본 identity를 유지하고 receipt를 발행하지 않는다", (kind) => {
    const mesh = fixture(true), before = serializeStudioEditableMesh(mesh);
    const brush: StudioSculptStrokeBrush = { ...BRUSH, strength: kind === "강도 0" ? 0 : kind === "Float32 미만" ? 1e-50 : BRUSH.strength };
    const session = createStudioSculptStrokeSession(source(mesh), brush, kind === "mask 0" ? new Float32Array(mesh.vertices.length) : undefined);
    if (kind !== "sample 없음") append(session, kind === "반경 밖" ? { x: 100, y: 100, z: 100 } : { x: .13, y: .21, z: -.08 });
    expect(readStudioSculptStrokePreview(session)).toBeNull();
    expect(sealStudioSculptStrokeSession(session)).toBeNull();
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("중간 잘못된 sample은 앞의 유효 부분도 폐기하며 다시 sample/seal하지 않는다", () => {
    const mesh = fixture(true), before = serializeStudioEditableMesh(mesh), session = createStudioSculptStrokeSession(source(mesh), BRUSH);
    append(session, { x: .13, y: .21, z: -.08 });
    expect(readStudioSculptStrokePreview(session)).not.toBeNull();
    expect(appendStudioSculptStrokeSample(session, { x: NaN, y: 0, z: 0 })).toMatchObject({ ok: false, detail: expect.stringContaining("유한") });
    expect(readStudioSculptStrokePreview(session)).toBeNull(); expect(sealStudioSculptStrokeSession(session)).toBeNull();
    expect(appendStudioSculptStrokeSample(session, { x: 0, y: 0, z: 0 }).ok).toBe(false);
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("실제 kernel의 Float32 overflow 실패도 부분 결과를 발행하지 않는다", () => {
    const mesh = fixture(), before = serializeStudioEditableMesh(mesh);
    const session = createStudioSculptStrokeSession(source(mesh), { ...BRUSH, strength: 1e300 });
    const result = appendStudioSculptStrokeSample(session, { x: .13, y: .21, z: -.08 });
    expect(result.ok).toBe(false); expect(readStudioSculptStrokePreview(session)).toBeNull();
    expect(sealStudioSculptStrokeSession(session)).toBeNull(); expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("cancel은 seal한 receipt까지 무효화하며 복제된 handle/receipt도 권위가 아니다", () => {
    const mesh = fixture(), before = serializeStudioEditableMesh(mesh), session = createStudioSculptStrokeSession(source(mesh), BRUSH);
    expect(appendStudioSculptStrokeSample({ ...session }, { x: 0, y: 0, z: 0 }).ok).toBe(false);
    append(session, { x: .13, y: .21, z: -.08 });
    const receipt = sealStudioSculptStrokeSession(session);
    if (!receipt) throw new Error("취소할 receipt가 없습니다.");
    expect(() => consumeStudioSculptStrokeReceipt({ ...receipt }, (data) => data)).toThrow(/발급/u);
    cancelStudioSculptStrokeSession(session); cancelStudioSculptStrokeSession(session);
    expect(readStudioSculptStrokePreview(session)).toBeNull(); expect(sealStudioSculptStrokeSession(session)).toBeNull();
    expect(() => consumeStudioSculptStrokeReceipt(receipt, (data) => data)).toThrow(/취소/u);
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("외부가 candidate를 바꾸면 최종 hash 검사가 receipt를 거부한다", () => {
    const mesh = fixture(), before = serializeStudioEditableMesh(mesh), session = createStudioSculptStrokeSession(source(mesh), BRUSH);
    append(session, { x: .13, y: .21, z: -.08 });
    const preview = readStudioSculptStrokePreview(session), vertex = preview?.mesh.vertices.at(0);
    if (!vertex) throw new Error("변조 회귀의 candidate 정점이 없습니다.");
    Object.defineProperty(vertex.position, "x", { value: vertex.position.x + .1 });
    expect(() => sealStudioSculptStrokeSession(session)).toThrow(/미리보기/u);
    expect(readStudioSculptStrokePreview(session)).toBeNull(); expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });

  it("시작 시 stale hash·잘못된 radius·비유한 방향·mask 정점 대응을 거부한다", () => {
    const input = source();
    expect(() => createStudioSculptStrokeSession({ ...input, meshHash: "stale" }, BRUSH)).toThrow(/해시/u);
    expect(() => createStudioSculptStrokeSession(input, { ...BRUSH, radius: 0 })).toThrow(/반경/u);
    expect(() => createStudioSculptStrokeSession(input, { ...BRUSH, direction: { x: 0, y: Infinity, z: 0 } })).toThrow(/방향/u);
    expect(() => createStudioSculptStrokeSession(input, BRUSH, new Float32Array(1))).toThrow(/정점/u);
    expect(() => createStudioSculptStrokeSession(input, BRUSH, new Float32Array([1, NaN, 1, 1]))).toThrow(/유한/u);
  });

  it("작은 입력도 실제 표시 face-corner 예산을 넘으면 시작하지 않는다", () => {
    const vertices = Array.from({ length: 129 }, (_, index) => ({
      x: Math.cos(index / 129 * Math.PI * 2), y: Math.sin(index / 129 * Math.PI * 2), z: 0,
    }));
    const mesh = createStudioEditableMeshFromPolygons(vertices, [vertices.map((_, index) => index)]);
    const before = serializeStudioEditableMesh(mesh);
    expect(() => createStudioSculptStrokeSession(source(mesh), BRUSH)).toThrow(/표시/u);
    expect(serializeStudioEditableMesh(mesh)).toEqual(before);
  });
});
