import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { bakeStudioBg3dSceneGlbMeshUvs, type StudioBg3dSceneGlbUvBakeResult } from "./studio-bg3d-scene-glb-uv-bake";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });
function texture(): THREE.DataTexture {
  const value = new THREE.DataTexture(new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 0, 31, 71, 131, 255]), 2, 2);
  value.wrapS = THREE.RepeatWrapping; value.wrapT = THREE.MirroredRepeatWrapping; value.needsUpdate = true;
  cleanups.push(() => value.dispose()); return value;
}
function rgba(texture: THREE.DataTexture): Uint8Array {
  const data: unknown = texture.image.data; if (!(data instanceof Uint8Array)) throw Error("실제 RGBA8 입력 필요"); return data;
}
function fixture() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2));
  geometry.setIndex([0, 1, 2, 0, 2, 3]);
  const map = texture(), material = new THREE.MeshStandardMaterial({ map, color: "#b16537", roughness: 0.7, metalness: 0.2 });
  cleanups.push(() => geometry.dispose(), () => material.dispose());
  return { geometry, map, material, mesh: new THREE.Mesh(geometry, material) };
}
function owned(result: StudioBg3dSceneGlbUvBakeResult) {
  if (!result.ok) throw Error(`${result.code}/${result.reason}`); cleanups.push(result.dispose); return result;
}
function standard(input: THREE.Material | THREE.Material[]): THREE.MeshStandardMaterial {
  const material = Array.isArray(input) ? input[0] : input;
  if (!(material instanceof THREE.MeshStandardMaterial)) throw Error("개인 PBR 재질 필요"); return material;
}
function attributeName(channel: number): string { return channel === 0 ? "uv" : `uv${channel}`; }
function sameBakedUvs(actual: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, source: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, matrix: THREE.Matrix3): void {
  expect(actual.count).toBe(source.count);
  for (let index = 0; index < source.count; index++) {
    const expected = new THREE.Vector2(source.getX(index), source.getY(index)).applyMatrix3(matrix);
    expect(actual.getX(index)).toBe(Math.fround(expected.x)); expect(actual.getY(index)).toBe(Math.fround(expected.y));
  }
}
function firstMesh(root: THREE.Object3D): THREE.Mesh {
  let result: THREE.Mesh | undefined; root.traverse((node) => { if (!result && node instanceof THREE.Mesh) result = node; });
  if (!result) throw Error("재로드한 메시 필요"); return result;
}

describe("migration: 현재 mesh의 개인 affine UV bake", () => {
  it("비균일 repeat+회전+center를 정점 UV에 굽고 source/같은 pixel/나머지 PBR을 보존한다", () => {
    const f = fixture(); f.map.offset.set(0.125, 0.25); f.map.repeat.set(0.75, 0.5); f.map.center.set(0.5, 0.5); f.map.rotation = 0.2;
    const matrix = new THREE.Matrix3().setUvTransform(0.125, 0.25, 0.75, 0.5, 0.2, 0.5, 0.5);
    const original = { uv: Array.from(f.geometry.getAttribute("uv").array), matrix: f.map.matrix.toArray(), sourceVersion: f.map.source.version,
      textureVersion: f.map.version, pixels: Array.from(rgba(f.map)), geometry: JSON.stringify(f.geometry.toJSON()) };
    const result = owned(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")), material = standard(result.material), map = material.map;
    if (!map) throw Error("개인 map 필요");
    sameBakedUvs(result.geometry.getAttribute(attributeName(map.channel)), f.geometry.getAttribute("uv"), matrix);
    expect(result.geometry).not.toBe(f.geometry); expect(material).not.toBe(f.material); expect(map).not.toBe(f.map); expect(map.source).not.toBe(f.map.source);
    expect(map.image).toBe(f.map.image); expect(map.wrapS).toBe(f.map.wrapS); expect(map.wrapT).toBe(f.map.wrapT);
    expect(map.matrix.equals(new THREE.Matrix3())).toBe(true); expect(map.offset.toArray()).toEqual([0, 0]); expect(map.repeat.toArray()).toEqual([1, 1]);
    expect(map.center.toArray()).toEqual([0, 0]); expect(map.rotation).toBe(0); expect(material.roughness).toBe(f.material.roughness);
    expect(material.metalness).toBe(f.material.metalness); expect(material.color.equals(f.material.color)).toBe(true);
    expect(f.mesh.geometry).toBe(f.geometry); expect(f.mesh.material).toBe(f.material); expect(f.material.map).toBe(f.map);
    expect(f.map.matrix.toArray()).toEqual(original.matrix); expect(f.map.source.version).toBe(original.sourceVersion); expect(f.map.version).toBe(original.textureVersion);
    expect(Array.from(rgba(f.map))).toEqual(original.pixels); expect(JSON.stringify(f.geometry.toJSON())).toBe(original.geometry);
    expect(Array.from(f.geometry.getAttribute("uv").array)).toEqual(original.uv);
  });
  it.each([[1, 0.2, 0.3, 0.4, 1, -0.5], [-2, 0, 0.2, 0, 0, 0.3]])("manual shear·음수·0 배율의 실제 행렬을 stale params 대신 사용한다", (a, b, tx, c, d, ty) => {
    const f = fixture(); f.map.matrixAutoUpdate = false; f.map.matrix.set(a, b, tx, c, d, ty, 0, 0, 1);
    f.map.offset.set(90, 80); f.map.repeat.set(7, 8); f.map.rotation = 2.4;
    const expected = f.map.matrix.clone(), result = owned(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")), material = standard(result.material);
    if (!material.map) throw Error("map 필요");
    sameBakedUvs(result.geometry.getAttribute(attributeName(material.map.channel)), f.geometry.getAttribute("uv"), expected);
    expect(f.map.matrix.equals(expected)).toBe(true); expect(f.map.matrixAutoUpdate).toBe(false); expect(f.map.offset.toArray()).toEqual([90, 80]);
  });
  it("동일 recipe와 원래 공유 ORM pointer는 같은 channel/개인 texture를 재사용한다", () => {
    const f = fixture(), other = texture(); f.map.rotation = 0.2; f.map.repeat.set(0.75, 0.5);
    other.rotation = f.map.rotation; other.repeat.copy(f.map.repeat);
    f.material.roughnessMap = f.map; f.material.metalnessMap = f.map; f.material.normalMap = other;
    const result = owned(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")), material = standard(result.material);
    expect(result.recipes).toHaveLength(1); expect(result.recipes[0]?.textureBindingCount).toBe(4);
    expect(material.map).toBe(material.roughnessMap); expect(material.roughnessMap).toBe(material.metalnessMap);
    expect(material.map).not.toBe(material.normalMap); expect(material.map?.channel).toBe(material.normalMap?.channel);
  });
  it("같은 이미지·같은 UV여도 별도 MR pointer는 stock packing에 넘기지 않는다", () => {
    const f = fixture(), separate = texture(); separate.source.data = f.map.source.data;
    f.material.roughnessMap = f.map; f.material.metalnessMap = separate;
    const clone = vi.spyOn(f.geometry, "clone");
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, code: "unsupported-feature",
      nodeIds: ["scene-model"], reason: "separate-metal-rough-textures-require-owned-packing" });
    expect(clone).not.toHaveBeenCalled();
  });
  it.each([THREE.ShaderMaterial, THREE.RawShaderMaterial])("shader uniform의 source version에 닿기 전에 거부한다", (Material) => {
    const f = fixture(), material = new Material({ uniforms: { map: { value: f.map } } }); cleanups.push(() => material.dispose());
    const version = f.map.source.version, clone = vi.spyOn(material, "clone"), input = new THREE.Mesh(f.geometry, material);
    expect(bakeStudioBg3dSceneGlbMeshUvs(input, "scene-model")).toMatchObject({ ok: false, code: "unsupported-feature", reason: "uv-shader-material-unsupported" });
    expect(clone).not.toHaveBeenCalled(); expect(f.map.source.version).toBe(version);
  });
  it("서로 다른 material group의 공유 정점에도 다른 UV channel을 결합한다", () => {
    const f = fixture(), other = texture(); f.map.offset.set(0.1, 0.2); other.matrixAutoUpdate = false; other.matrix.set(1, 0.3, 0.2, -0.2, 1, 0.1, 0, 0, 1);
    const secondMaterial = new THREE.MeshStandardMaterial({ map: other }); cleanups.push(() => secondMaterial.dispose());
    f.geometry.addGroup(0, 3, 0); f.geometry.addGroup(3, 3, 1);
    const input = new THREE.Mesh(f.geometry, [f.material, secondMaterial]);
    const result = owned(bakeStudioBg3dSceneGlbMeshUvs(input, "scene-model")); if (!Array.isArray(result.material)) throw Error("그룹 재질 필요");
    const first = standard(result.material[0] ?? []), second = standard(result.material[1] ?? []);
    if (!first.map || !second.map) throw Error("두 그룹의 map 필요");
    expect(first.map.channel).not.toBe(second.map.channel); expect(result.recipes).toHaveLength(2);
    sameBakedUvs(result.geometry.getAttribute(attributeName(first.map.channel)), f.geometry.getAttribute("uv"), new THREE.Matrix3().setUvTransform(0.1, 0.2, 1, 1, 0, 0, 0));
    sameBakedUvs(result.geometry.getAttribute(attributeName(second.map.channel)), f.geometry.getAttribute("uv"), other.matrix);
    expect(result.geometry.groups).toEqual(f.geometry.groups); expect(input.material).toEqual([f.material, secondMaterial]);
  });
  it("다른 mesh가 source 자원을 공유해도 결과 binding·geometry는 서로 독립이다", () => {
    const f = fixture(), secondMesh = new THREE.Mesh(f.geometry, f.material);
    const a = owned(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "first")), b = owned(bakeStudioBg3dSceneGlbMeshUvs(secondMesh, "second"));
    expect(a.geometry).not.toBe(b.geometry); expect(a.material).not.toBe(b.material); expect(standard(a.material).map).not.toBe(standard(b.material).map);
    a.geometry.getAttribute("uv").setXY(0, 42, 43); expect(b.geometry.getAttribute("uv").getX(0)).toBe(0); expect(f.geometry.getAttribute("uv").getX(0)).toBe(0);
  });
  it("정규화·interleaved UV를 실제 읽기 값으로 bake하고 index·normal·morph position은 보존한다", () => {
    const f = fixture(); f.geometry.setAttribute("uv", new THREE.InterleavedBufferAttribute(new THREE.InterleavedBuffer(new Uint16Array([0, 0, 99, 65535, 0, 99, 65535, 65535, 99, 0, 65535, 99]), 3), 2, 0, true));
    f.geometry.morphAttributes.position = [new THREE.Float32BufferAttribute(new Float32Array(12).fill(0.2), 3)];
    f.map.matrixAutoUpdate = false; f.map.matrix.set(1, 0.2, 0.3, 0, -2, 0.4, 0, 0, 1);
    const result = owned(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model"));
    sameBakedUvs(result.geometry.getAttribute("uv"), f.geometry.getAttribute("uv"), f.map.matrix);
    expect(result.geometry.index?.array).toEqual(f.geometry.index?.array); expect(result.geometry.getAttribute("normal").array).toEqual(f.geometry.getAttribute("normal").array);
    expect(result.geometry.morphAttributes.position?.[0]?.array).toEqual(f.geometry.morphAttributes.position?.[0]?.array);
  });
  it("실제 TEXCOORD_0..3 exporter→loader 경로에서 baked attribute를 다시 읽는다", async () => {
    class ExportFileReader {
      result: ArrayBuffer | null = null; onloadend: (() => void) | null = null; onerror: (() => void) | null = null;
      readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }, () => this.onerror?.()); }
    }
    vi.stubGlobal("FileReader", ExportFileReader);
    const f = fixture(), maps = [f.map, texture(), texture(), texture()];
    maps.forEach((map, index) => { map.channel = index; map.offset.set(index * 0.1, index * -0.2); f.geometry.setAttribute(attributeName(index), f.geometry.getAttribute("uv").clone()); });
    f.material.normalMap = maps[1] ?? null; f.material.aoMap = maps[2] ?? null; f.material.emissiveMap = maps[3] ?? null;
    const result = owned(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model"));
    // 이미지 codec/GPU가 아닌 UV accessor 왕복만 검사한다. texture binding은 앞선 회귀가 직접 검사한다.
    const material = new THREE.MeshStandardMaterial(); cleanups.push(() => material.dispose());
    const exported = await new GLTFExporter().parseAsync(new THREE.Mesh(result.geometry, material), { binary: true });
    if (!(exported instanceof ArrayBuffer)) throw Error("실제 GLB 필요");
    const gltf = await new GLTFLoader().parseAsync(exported, ""), reloaded = firstMesh(gltf.scene);
    cleanups.push(() => { reloaded.geometry.dispose(); const materials = Array.isArray(reloaded.material) ? reloaded.material : [reloaded.material]; materials.forEach((value) => value.dispose()); });
    expect(result.recipes).toHaveLength(4);
    for (const channel of [0, 1, 2, 3]) expect(reloaded.geometry.getAttribute(attributeName(channel)).array).toEqual(result.geometry.getAttribute(attributeName(channel)).array);
  });
  it("서로 다른 UV recipe 5개와 channel4는 명시 거부한다", () => {
    const f = fixture(), maps = [f.map, texture(), texture(), texture(), texture()]; maps.forEach((map, index) => { map.offset.x = index * 0.1; });
    f.material.normalMap = maps[1] ?? null; f.material.aoMap = maps[2] ?? null; f.material.emissiveMap = maps[3] ?? null; f.material.roughnessMap = maps[4] ?? null;
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, reason: "uv-channel-budget-exceeded" });
    f.map.channel = 4;
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, reason: "uv-channel-out-of-range" });
  });
  it("projective·누락 UV·비유한 좌표·Float32 overflow를 자르거나 추측하지 않는다", () => {
    const f = fixture(); f.map.matrixAutoUpdate = false; f.map.matrix.set(1, 0, 0, 0, 1, 0, 0.1, 0, 1);
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, reason: "uv-projective-transform" });
    f.map.matrix.identity(); f.map.channel = 1;
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, reason: "uv-source-attribute-missing" });
    f.map.channel = 0; f.geometry.getAttribute("uv").setX(0, Number.NaN);
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, reason: "uv-source-attribute-invalid" });
    f.geometry.getAttribute("uv").setX(0, 0); f.map.matrix.set(1, 0, 1e100, 0, 1, 0, 0, 0, 1);
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, reason: "uv-baked-coordinate-not-finite" });
  });
  it("dispose는 개인 geometry/material/texture만 한 번 정리하고 취소는 할당 전에 끝난다", () => {
    const f = fixture(), sourceGeometry = vi.spyOn(f.geometry, "dispose"), sourceMaterial = vi.spyOn(f.material, "dispose"), sourceTexture = vi.spyOn(f.map, "dispose");
    const result = owned(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")), material = standard(result.material); if (!material.map) throw Error("개인 map 필요");
    const geometry = vi.spyOn(result.geometry, "dispose"), mat = vi.spyOn(material, "dispose"), tex = vi.spyOn(material.map, "dispose");
    result.dispose(); result.dispose(); expect(geometry).toHaveBeenCalledTimes(1); expect(mat).toHaveBeenCalledTimes(1); expect(tex).toHaveBeenCalledTimes(1);
    expect(sourceGeometry).not.toHaveBeenCalled(); expect(sourceMaterial).not.toHaveBeenCalled(); expect(sourceTexture).not.toHaveBeenCalled();
    const abort = new AbortController(); abort.abort(); const clone = vi.spyOn(f.geometry, "clone");
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model", abort.signal)).toMatchObject({ ok: false, code: "aborted", reason: "aborted" }); expect(clone).not.toHaveBeenCalled();
  });
  it("bake 중 실패하면 할당한 개인 geometry를 해제한다", () => {
    const f = fixture(); f.geometry.getAttribute("uv").setY(1, Number.NaN);
    const copy = f.geometry.clone(), dispose = vi.spyOn(copy, "dispose"); vi.spyOn(f.geometry, "clone").mockReturnValue(copy);
    expect(bakeStudioBg3dSceneGlbMeshUvs(f.mesh, "scene-model")).toMatchObject({ ok: false, reason: "uv-source-attribute-invalid" });
    expect(dispose).toHaveBeenCalledTimes(1);
  });
});
