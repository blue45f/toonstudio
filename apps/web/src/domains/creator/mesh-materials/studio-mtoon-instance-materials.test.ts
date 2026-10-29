import { MToonMaterial } from "@pixiv/three-vrm";
import * as THREE from "three";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE } from "../bg3d/studio-bg3d-scene-document";
import { createStudioBg3dEditableThreeClone, type StudioBg3dEditableThreeClone } from "../studio-background-3d-model";

import { synchronizeStudioMToonMaterialOverride, updateStudioMToonInstanceMaterials } from "./studio-mtoon-instance-materials";
import { readStudioMToonRuntimeIdentity } from "./studio-mtoon-runtime-identity";
import { StudioMToonMaterial } from "./studio-mtoon-webgl-runtime";

const dispose: Array<() => void> = [];
afterEach(() => { dispose.splice(0).reverse().forEach((release) => release()); vi.restoreAllMocks(); });
function owned<T extends { dispose(): void }>(value: T): T { dispose.push(() => value.dispose()); return value; }
function observed(material: THREE.Material) { const listener = vi.fn(); material.addEventListener("dispose", listener); return listener; }
function compiled(material: MToonMaterial) {
  // 실제 SDK/app hook의 문자열 변환을 호출한다. WebGLRenderer 생성·GPU compile 검증은 아니다.
  const shader = { vertexShader: material.vertexShader, fragmentShader: material.fragmentShader, uniforms: material.uniforms };
  Reflect.apply(material.onBeforeCompile, material, [shader, undefined]);
  return { equal: shader.fragmentShader.includes("if ( a == b )"), orthographic: shader.vertexShader.includes("projectionMatrix[ 3 ][ 3 ] == 0.0"),
    outline: shader.vertexShader.includes("#define OUTLINE_WIDTH_SCREEN"), key: material.customProgramCacheKey() };
}
function fixture() {
  const texture = owned(new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1));
  const geometry = owned(new THREE.BufferGeometry());
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 1, 0, 0, 0, 1, 0], 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1, 0, 0, 1], 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute([0, 0, 1, 0, 0, 1], 2));
  geometry.setIndex([0, 1, 2]); geometry.addGroup(0, 3, 0); geometry.addGroup(0, 3, 1);
  const body = owned(new StudioMToonMaterial({ color: new THREE.Color("#f2f2f2"), shadeColorFactor: new THREE.Color("#56789a"), shadingToonyFactor: 1,
    outlineWidthMode: "screenCoordinates", outlineWidthFactor: .002, map: texture, opacity: 1, side: THREE.DoubleSide }));
  body.uvAnimationScrollXSpeedFactor = .4;
  const outline = owned(body.clone()); outline.isOutline = true; outline.side = THREE.BackSide;
  const root = new THREE.Group(); root.add(new THREE.Mesh(geometry, [body, outline]), new THREE.Mesh(geometry, body));
  return { root, body, outline, geometry, texture };
}
function materials(clone: StudioBg3dEditableThreeClone) {
  const mesh = clone.root.children[0]; if (!(mesh instanceof THREE.Mesh) || !Array.isArray(mesh.material)) throw new Error("실제 clone 재질 배열이 없습니다.");
  const [body, outline] = mesh.material;
  if (!(body instanceof StudioMToonMaterial) || !(outline instanceof StudioMToonMaterial)) throw new Error("승인된 actual MToon clone이 없습니다.");
  return { mesh, body, outline };
}

describe("인스턴스 소유 MToon override·update 경계", () => {
  it("outline BackSide와 opacity·texture matrix uniform을 update(0)으로 동기화한다", () => {
    const { body, outline, texture } = fixture();
    body.opacity = .4; outline.opacity = .4; outline.side = THREE.DoubleSide;
    texture.offset.set(.25, .5); texture.repeat.set(2, 3);
    expect(synchronizeStudioMToonMaterialOverride(body)).toBe(true); expect(synchronizeStudioMToonMaterialOverride(outline)).toBe(true);
    expect(body.uniforms.opacity?.value).toBe(.4); expect(outline.uniforms.opacity?.value).toBe(.4);
    expect(body.side).toBe(THREE.DoubleSide); expect(outline.side).toBe(THREE.BackSide);
    expect(body.uniforms.mapUvTransform?.value).toEqual(texture.matrix);
    expect(outline.uniforms.mapUvTransform?.value).toEqual(texture.matrix);
  });

  it("일반 재질은 건너뛰되 raw SDK·위조 userData·손상된 guard를 승인된 MToon으로 취급하지 않는다", () => {
    const standard = owned(new THREE.MeshStandardMaterial()); standard.userData = { isMToonMaterial: true, studioMToon: true };
    expect(synchronizeStudioMToonMaterialOverride(standard)).toBe(false);
    const raw = owned(new MToonMaterial()); expect(() => synchronizeStudioMToonMaterialOverride(raw)).toThrow("승인된 런타임");
    const source = fixture(); source.body.onBeforeCompile = () => undefined;
    expect(readStudioMToonRuntimeIdentity(source.body)).toBeNull(); expect(() => synchronizeStudioMToonMaterialOverride(source.body)).toThrow("승인된 런타임");
  });

  it("동일 재질은 한 번만 delta를 받고 뒤쪽 손상/잘못된 시간은 앞쪽 시간도 진행하지 않는다", () => {
    const { body } = fixture(), standard = owned(new THREE.MeshStandardMaterial());
    updateStudioMToonInstanceMaterials([body, body, standard], .25);
    expect(body.uniforms.uvAnimationScrollXOffset?.value).toBeCloseTo(.1);
    const before = body.uniforms.uvAnimationScrollXOffset?.value;
    for (const delta of [-1, NaN, Infinity]) expect(() => updateStudioMToonInstanceMaterials([body], delta)).toThrow("인스턴스 시간");
    const raw = owned(new MToonMaterial()); expect(() => updateStudioMToonInstanceMaterials([body, raw], .5)).toThrow("승인된 런타임");
    expect(body.uniforms.uvAnimationScrollXOffset?.value).toBe(before);
  });

  it("actual BG3D clone/override/reset은 guard·outline·uniform을 유지하고 source·sibling·geometry를 바꾸지 않는다", async () => {
    const source = fixture(), groups = JSON.stringify(source.geometry.groups), normals = source.geometry.getAttribute("normal").array.slice(), uvs = source.geometry.getAttribute("uv").array.slice();
    const a = owned(await createStudioBg3dEditableThreeClone(source.root)), b = owned(await createStudioBg3dEditableThreeClone(source.root));
    const current = materials(a), sibling = materials(b), second = a.root.children[1];
    expect(a.materialCount).toBe(2); expect(second instanceof THREE.Mesh && second.material).toBe(current.body);
    expect(current.body).not.toBe(source.body); expect(current.body).not.toBe(sibling.body); expect(current.body.map).toBe(source.texture);
    expect(current.mesh.geometry).toBe(source.geometry);
    for (const value of [current.body, current.outline]) {
      expect(readStudioMToonRuntimeIdentity(value)?.backend).toBe("webgl");
      expect(compiled(value)).toMatchObject({ equal: true, orthographic: true, outline: value.isOutline });
      expect(compiled(value).key).toContain("toonstudio-mtoon-equal-boundary/1;orthographic-width/1");
    }
    for (const opacity of [.5, .2, .8]) {
      a.applyMaterialOverride({ ...DEFAULT_STUDIO_BG3D_MATERIAL_OVERRIDE, colorMode: "replace", color: "#ff0000", colorStrength: 1, opacityMultiplier: opacity, doubleSided: true });
      expect(current.body.opacity).toBe(opacity); expect(current.body.uniforms.opacity?.value).toBe(opacity);
      expect(current.outline.opacity).toBe(opacity); expect(current.outline.uniforms.opacity?.value).toBe(opacity);
      expect(current.outline.side).toBe(THREE.BackSide); expect(current.body.color.getHexString()).toBe("ff0000");
      expect(compiled(current.outline)).toMatchObject({ equal: true, orthographic: true, outline: true });
    }
    expect(source.body.opacity).toBe(1); expect(sibling.body.opacity).toBe(1);
    expect(source.body.color.getHexString()).toBe("f2f2f2"); expect(sibling.body.color.getHexString()).toBe("f2f2f2");
    a.applyMaterialOverride(undefined);
    expect(current.body.opacity).toBe(1); expect(current.body.uniforms.opacity?.value).toBe(1); expect(current.outline.side).toBe(THREE.BackSide);
    expect(current.body.color.getHexString()).toBe("f2f2f2"); expect(compiled(current.body)).toMatchObject({ equal: true, orthographic: true, outline: false });
    expect(JSON.stringify(source.geometry.groups)).toBe(groups); expect(source.geometry.getAttribute("normal").array).toEqual(normals); expect(source.geometry.getAttribute("uv").array).toEqual(uvs);
  });

  it("actual clone update/dispose는 editable만 갱신·각 1회 해제하고 source/형제/공유 자원을 유지한다", async () => {
    const source = fixture(), a = owned(await createStudioBg3dEditableThreeClone(source.root)), b = owned(await createStudioBg3dEditableThreeClone(source.root));
    const current = materials(a), sibling = materials(b);
    a.updateMaterials(.25);
    expect(current.body.uniforms.uvAnimationScrollXOffset?.value).toBeCloseTo(.1); expect(sibling.body.uniforms.uvAnimationScrollXOffset?.value).toBe(0);
    expect(source.body.uniforms.uvAnimationScrollXOffset?.value).toBe(0);
    const bodyDisposed = observed(current.body), outlineDisposed = observed(current.outline), sourceDisposed = observed(source.body), siblingDisposed = observed(sibling.body);
    const geometryDisposed = vi.fn(), textureDisposed = vi.fn(); source.geometry.addEventListener("dispose", geometryDisposed); source.texture.addEventListener("dispose", textureDisposed);
    a.dispose(); a.dispose(); a.updateMaterials(.5);
    expect(current.body.uniforms.uvAnimationScrollXOffset?.value).toBeCloseTo(.1); expect(bodyDisposed).toHaveBeenCalledOnce(); expect(outlineDisposed).toHaveBeenCalledOnce();
    expect(sourceDisposed).not.toHaveBeenCalled(); expect(siblingDisposed).not.toHaveBeenCalled(); expect(geometryDisposed).not.toHaveBeenCalled(); expect(textureDisposed).not.toHaveBeenCalled();
  });

  it("뒤쪽 raw SDK 재질의 clone 실패는 이미 만든 editable만 해제하고 원본을 유지한다", async () => {
    const source = fixture(), raw = owned(new MToonMaterial()); source.root.add(new THREE.Mesh(source.geometry, raw));
    const seen: THREE.Material[] = [], clone = source.body.clone.bind(source.body);
    vi.spyOn(source.body, "clone").mockImplementation(() => { const result = clone(); seen.push(result); return result; });
    const sourceDisposed = observed(source.body), geometryDisposed = vi.fn(); source.geometry.addEventListener("dispose", geometryDisposed);
    const released: string[] = [], actualDispose = StudioMToonMaterial.prototype.dispose;
    vi.spyOn(StudioMToonMaterial.prototype, "dispose").mockImplementation(function (this: StudioMToonMaterial) { released.push(this.uuid); actualDispose.call(this); });
    await expect(createStudioBg3dEditableThreeClone(source.root)).rejects.toThrow();
    expect(seen).toHaveLength(1); expect(released).toHaveLength(2);
    expect(sourceDisposed).not.toHaveBeenCalled(); expect(geometryDisposed).not.toHaveBeenCalled();
  });
});
