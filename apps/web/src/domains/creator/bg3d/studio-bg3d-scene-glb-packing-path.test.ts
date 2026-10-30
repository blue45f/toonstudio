import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { buildStudioBg3dSceneGlbGraph, type StudioBg3dSceneGlbGraphResult } from "./studio-bg3d-scene-glb-graph";
import { createStudioBg3dSceneGlbMetalRoughTexture, type StudioBg3dSceneGlbMetalRoughSource } from "./studio-bg3d-scene-glb-metal-rough";
import { createSceneGlbFixture, disposeSceneGlbFixtures } from "./studio-bg3d-scene-glb.test-fixture";
import { bakeStudioBg3dSceneGlbMeshUvs, type StudioBg3dSceneGlbUvBakeResult } from "./studio-bg3d-scene-glb-uv-bake";
import type { StudioBg3dModelNode } from "./studio-bg3d-scene-document-types";

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  disposeSceneGlbFixtures();
  vi.restoreAllMocks();
});

function texture(): THREE.DataTexture {
  const value = new THREE.DataTexture(new Uint8Array([13, 31, 211, 0, 71, 53, 167, 128,
    103, 79, 127, 255, 137, 101, 89, 0]), 2, 2);
  value.minFilter = THREE.NearestFilter; value.magFilter = THREE.NearestFilter;
  value.generateMipmaps = false; value.needsUpdate = true;
  cleanups.push(() => value.dispose()); return value;
}
function shear(value: THREE.Texture, offset = 0.125): void {
  value.matrixAutoUpdate = false;
  value.matrix.set(1, 0.25, offset, 0, 1, -0.125, 0, 0, 1);
}
function standard(binding: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial {
  if (!(binding instanceof THREE.MeshStandardMaterial)) throw Error("단일 PBR 재질 필요");
  return binding;
}
function firstMesh(root: THREE.Object3D): THREE.Mesh {
  let found: THREE.Mesh | undefined;
  root.traverse((object) => { if (!found && object instanceof THREE.Mesh) found = object; });
  if (!found) throw Error("실제 graph 메시 필요"); return found;
}
function graph(result: StudioBg3dSceneGlbGraphResult) {
  if (!result.ok) throw Error(`${result.code}/${result.reason}`);
  cleanups.push(result.dispose); return result;
}
function baked(result: StudioBg3dSceneGlbUvBakeResult) {
  if (!result.ok) throw Error(`${result.code}/${result.reason}`);
  cleanups.push(result.dispose); return result;
}
function maps(material: THREE.MeshStandardMaterial) {
  const rough = material.roughnessMap, metal = material.metalnessMap;
  if (!(rough instanceof THREE.DataTexture) || !(metal instanceof THREE.DataTexture)) throw Error("개인 RGBA8 MR 필요");
  return { rough, metal };
}
function sourceSnapshot(value: THREE.DataTexture) {
  const bytes: unknown = value.image.data;
  if (!(bytes instanceof Uint8Array)) throw Error("원래 RGBA8 필요");
  return { source: value.source, image: value.image, version: value.version, sourceVersion: value.source.version,
    bytes: Array.from(bytes), channel: value.channel, matrix: value.matrix.toArray(), auto: value.matrixAutoUpdate,
    offset: value.offset.toArray(), repeat: value.repeat.toArray(), center: value.center.toArray(), rotation: value.rotation };
}
function uvName(channel: number): string { return channel === 0 ? "uv" : `uv${channel}`; }
function expectBakedUv(output: THREE.BufferGeometry, channel: number, original: THREE.BufferGeometry, matrix: THREE.Matrix3): void {
  const source = original.getAttribute("uv"), actual = output.getAttribute(uvName(channel));
  expect(actual.count).toBe(source.count);
  for (let index = 0; index < source.count; index += 1) {
    const expected = new THREE.Vector2(source.getX(index), source.getY(index)).applyMatrix3(matrix);
    expect(actual.getX(index)).toBe(Math.fround(expected.x)); expect(actual.getY(index)).toBe(Math.fround(expected.y));
  }
}
function pairSource(value: THREE.DataTexture): StudioBg3dSceneGlbMetalRoughSource {
  const rgba: unknown = value.image.data;
  if (!(rgba instanceof Uint8Array)) throw Error("bake 뒤 원래 RGBA8 필요");
  // UV 차이의 packer 거부만 확인한다. 실제 GPU capture·sampler·PNG 검사는 별도 회귀다.
  return { texture: value, capture: { texture: value, rgba, width: value.image.width, height: value.image.height, rowOrder: "top-down" } };
}
async function graphFixture() {
  const fixture = await createSceneGlbFixture(), document = fixture.runtime.current.document;
  const model = document.nodes.find((node): node is StudioBg3dModelNode => node.kind === "model");
  if (!model || !fixture.entry || !fixture.record) throw Error("실제 verified 모델 fixture 필요");
  const sourceMesh = firstMesh(fixture.entry.root), sourceMaterial = standard(sourceMesh.material);
  // 저장 GLB에는 UV가 없으므로 현재 cache의 회귀 입력에만 UV를 합성한다. UV 반입 증거와는 구분한다.
  const position = sourceMesh.geometry.getAttribute("position"), uvs = new Float32Array(position.count * 2);
  for (let index = 0; index < position.count; index += 1) {
    uvs[index * 2] = position.getX(index) * 0.25 + 0.5;
    uvs[index * 2 + 1] = position.getY(index) * 0.25 + 0.5;
  }
  sourceMesh.geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  const rough = texture(), metal = texture(); sourceMaterial.roughnessMap = rough; sourceMaterial.metalnessMap = metal;
  cleanups.push(() => { sourceMaterial.roughnessMap = null; sourceMaterial.metalnessMap = null; });
  return { sourceMesh, sourceMaterial, rough, metal,
    input: { document: { ...document, nodes: [model] }, modelRoots: new Map([[model.attachmentId,
      { root: fixture.entry.root, animations: fixture.entry.animations, sourceBytes: new Uint8Array(await fixture.record.blob.arrayBuffer()) }]]) } };
}
function meshFixture() {
  const geometry = new THREE.PlaneGeometry(2, 2), rough = texture(), metal = texture();
  const material = new THREE.MeshStandardMaterial({ roughnessMap: rough, metalnessMap: metal });
  cleanups.push(() => geometry.dispose(), () => material.dispose());
  return { rough, metal, material, geometry, mesh: new THREE.Mesh(geometry, material) };
}

describe("개인 MR packing의 기본 거부와 artifact opt-in 경계", () => {
  it("기본 graph와 UV bake는 동일 UV의 distinct MR도 계속 거부한다", async () => {
    const fixture = await graphFixture(), before = [sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)];
    expect(await buildStudioBg3dSceneGlbGraph(fixture.input)).toMatchObject({ ok: false, code: "unsupported-feature",
      reason: "separate-metal-rough-textures-require-owned-packing" });
    expect(await buildStudioBg3dSceneGlbGraph({ ...fixture.input, metalRoughPacking: "shared-only" }))
      .toMatchObject({ ok: false, reason: "separate-metal-rough-textures-require-owned-packing" });
    const input = meshFixture(), clone = vi.spyOn(input.geometry, "clone");
    expect(bakeStudioBg3dSceneGlbMeshUvs(input.mesh, "default"))
      .toMatchObject({ ok: false, reason: "separate-metal-rough-textures-require-owned-packing" });
    expect(clone).not.toHaveBeenCalled();
    expect([sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)]).toEqual(before);
  });

  it("deferred-owned를 명시한 graph만 distinct MR을 후속 packing까지 보존한다", async () => {
    const fixture = await graphFixture(), before = [sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)];
    const result = graph(await buildStudioBg3dSceneGlbGraph({ ...fixture.input, metalRoughPacking: "deferred-owned" }));
    const actual = maps(standard(firstMesh(result.scene).material));
    expect(actual.rough).not.toBe(actual.metal);
    expect(actual.rough).not.toBe(fixture.rough); expect(actual.metal).not.toBe(fixture.metal);
    expect(actual.rough.channel).toBe(actual.metal.channel);
    expect(actual.rough.source).not.toBe(fixture.rough.source); expect(actual.metal.source).not.toBe(fixture.metal.source);
    result.dispose();
    expect([sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)]).toEqual(before);
    expect(fixture.sourceMaterial.roughnessMap).toBe(fixture.rough); expect(fixture.sourceMaterial.metalnessMap).toBe(fixture.metal);
  });

  it("같은 shear의 두 MR은 같은 baked channel을 쓰며 원래 Source·bytes·UV를 보존한다", async () => {
    const fixture = await graphFixture(); shear(fixture.rough); shear(fixture.metal);
    const roughSource = fixture.rough.source, metalSource = fixture.metal.source;
    const expectedMatrix = fixture.rough.matrix.clone(), before = [sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)];
    const geometry = fixture.sourceMesh.geometry, originalUv = Array.from(geometry.getAttribute("uv").array);
    const result = graph(await buildStudioBg3dSceneGlbGraph({ ...fixture.input, metalRoughPacking: "deferred-owned" }));
    const output = firstMesh(result.scene), actual = maps(standard(output.material));
    expect(actual.rough).not.toBe(actual.metal); expect(actual.rough.channel).toBe(actual.metal.channel);
    expect(actual.rough.matrix.equals(new THREE.Matrix3())).toBe(true); expect(actual.metal.matrix.equals(new THREE.Matrix3())).toBe(true);
    expectBakedUv(output.geometry, actual.rough.channel, geometry, expectedMatrix);
    expect(actual.rough.source).not.toBe(fixture.rough.source); expect(actual.metal.source).not.toBe(fixture.metal.source);
    const packed = createStudioBg3dSceneGlbMetalRoughTexture({ roughness: pairSource(actual.rough), metalness: pairSource(actual.metal),
      signal: new AbortController().signal, maximumRgbaBytes: 16 });
    if (!packed.ok || packed.value.kind !== "packed") throw Error("동일 baked recipe packing 필요");
    cleanups.push(packed.value.dispose);
    expect(packed.value.texture.channel).toBe(actual.rough.channel);
    expect([sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)]).toEqual(before);
    expect(fixture.rough.source).toBe(roughSource); expect(fixture.metal.source).toBe(metalSource);
    expect(fixture.sourceMesh.geometry).toBe(geometry); expect(Array.from(geometry.getAttribute("uv").array)).toEqual(originalUv);
    result.dispose(); expect([sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)]).toEqual(before);
  });

  it("다른 shear recipe는 identity로 굽힌 뒤에도 channel이 달라 후속 packer가 거부한다", () => {
    const fixture = meshFixture(); shear(fixture.rough, 0.125); shear(fixture.metal, 0.375);
    const before = [sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)];
    const result = baked(bakeStudioBg3dSceneGlbMeshUvs(fixture.mesh, "different", undefined, "deferred-owned"));
    const actual = maps(standard(result.material));
    expect(result.recipes).toHaveLength(2); expect(actual.rough.channel).not.toBe(actual.metal.channel);
    expect(actual.rough.matrix.equals(new THREE.Matrix3())).toBe(true); expect(actual.metal.matrix.equals(new THREE.Matrix3())).toBe(true);
    expectBakedUv(result.geometry, actual.rough.channel, fixture.geometry, fixture.rough.matrix);
    expectBakedUv(result.geometry, actual.metal.channel, fixture.geometry, fixture.metal.matrix);
    expect(createStudioBg3dSceneGlbMetalRoughTexture({ roughness: pairSource(actual.rough), metalness: pairSource(actual.metal),
      signal: new AbortController().signal, maximumRgbaBytes: 16 }))
      .toMatchObject({ ok: false, code: "unsupported-feature", reason: "uv-state-mismatch" });
    expect([sourceSnapshot(fixture.rough), sourceSnapshot(fixture.metal)]).toEqual(before);
  });

  it("opt-in도 graph의 projective 거부와 UV bake의 projective 거부를 우회하지 않는다", async () => {
    const fixture = await graphFixture(); fixture.rough.matrixAutoUpdate = false; fixture.rough.matrix.elements[2] = 0.1;
    const before = sourceSnapshot(fixture.rough);
    expect(await buildStudioBg3dSceneGlbGraph({ ...fixture.input, metalRoughPacking: "deferred-owned" }))
      .toMatchObject({ ok: false, code: "unsupported-feature", reason: "texture-uv-projective-matrix" });
    const input = meshFixture(); input.rough.matrixAutoUpdate = false; input.rough.matrix.elements[2] = 0.1;
    expect(bakeStudioBg3dSceneGlbMeshUvs(input.mesh, "projective", undefined, "deferred-owned"))
      .toMatchObject({ ok: false, code: "unsupported-feature", reason: "uv-projective-transform" });
    expect(sourceSnapshot(fixture.rough)).toEqual(before);
  });

  it("opt-in도 5개 UV recipe와 범위 밖 channel의 기존 예산을 늘리지 않는다", async () => {
    const fixture = await graphFixture(), base = texture(), normal = texture(), ao = texture();
    [fixture.rough, fixture.metal, base, normal, ao].forEach((value, index) => shear(value, index / 8));
    fixture.sourceMaterial.map = base; fixture.sourceMaterial.normalMap = normal; fixture.sourceMaterial.aoMap = ao;
    cleanups.push(() => { fixture.sourceMaterial.map = null; fixture.sourceMaterial.normalMap = null; fixture.sourceMaterial.aoMap = null; });
    const before = [fixture.rough, fixture.metal, base, normal, ao].map(sourceSnapshot);
    expect(await buildStudioBg3dSceneGlbGraph({ ...fixture.input, metalRoughPacking: "deferred-owned" }))
      .toMatchObject({ ok: false, code: "unsupported-feature", reason: "uv-channel-budget-exceeded" });
    expect(bakeStudioBg3dSceneGlbMeshUvs(fixture.sourceMesh, "budget", undefined, "deferred-owned"))
      .toMatchObject({ ok: false, code: "unsupported-feature", reason: "uv-channel-budget-exceeded" });
    expect([fixture.rough, fixture.metal, base, normal, ao].map(sourceSnapshot)).toEqual(before);
    fixture.rough.channel = 4;
    expect(bakeStudioBg3dSceneGlbMeshUvs(fixture.sourceMesh, "channel", undefined, "deferred-owned"))
      .toMatchObject({ ok: false, code: "unsupported-feature", reason: "uv-channel-out-of-range" });
  });
});
