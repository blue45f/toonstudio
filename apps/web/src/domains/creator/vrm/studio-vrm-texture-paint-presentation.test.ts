import { DataTexture, Group, Mesh, MeshStandardMaterial, SRGBColorSpace } from "three";
import { describe, expect, it, vi } from "vitest";

import type { StudioVrmSurfacePaintSettings, StudioVrmSurfacePaintTexture } from "./studio-vrm-scene-document";
import { STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND, STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION } from "./studio-vrm-texture-paint-artifact";
import { stampStudioVrmTexturePaintMaterialLocator } from "./studio-vrm-texture-paint-binding";
import { STUDIO_VRM_TEXTURE_PAINT_CHANNELS, studioVrmTexturePaintChannelEncoding } from "./studio-vrm-texture-paint-channel";
import { restoreStudioVrmPaintPresentation } from "./studio-vrm-texture-paint-presentation";

function fixture(size = 2) {
  const map = new DataTexture(new Uint8Array(size * size * 4), size, size);
  map.colorSpace = SRGBColorSpace;
  map.repeat.set(2, 3);
  const original = { map, roughness: 0.42, metalness: 0.13, transparent: false };
  const material = new MeshStandardMaterial(original);
  const duplicate = new MeshStandardMaterial(original);
  stampStudioVrmTexturePaintMaterialLocator(material, 0);
  stampStudioVrmTexturePaintMaterialLocator(duplicate, 1);
  const scene = new Group().add(new Mesh(undefined, material), new Mesh(undefined, duplicate));
  const entries: StudioVrmSurfacePaintTexture[] = STUDIO_VRM_TEXTURE_PAINT_CHANNELS.map((slot, i) => ({
    hash: `sha256:${String(i + 1).repeat(64)}`, width: size, height: size, byteSize: 64, mime: "image/png",
    materialLocator: "gltf-material:0", bindingKey: `gltf-material-0-${slot}`, textureSlot: slot, ...studioVrmTexturePaintChannelEncoding(slot),
  }));
  const settings: StudioVrmSurfacePaintSettings = { version: 2, textures: [...entries, ...entries.filter(e => e.textureSlot === "baseColor" || e.textureSlot === "opacity")
    .map(e => ({...e, materialLocator: "gltf-material:1", bindingKey: `gltf-material-1-${e.textureSlot}`}))] };
  const blob = new Blob([new Uint8Array(64)], {type: "image/png"});
  const getArtifact = vi.fn(async (hash: string) => {
    const entry = entries.find(e => e.hash === hash)!;
    const contentHash = `sha256:${hash.slice(7)}` as const;
    const metadata = { schemaVersion: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_SCHEMA_VERSION, kind: STUDIO_VRM_TEXTURE_PAINT_ARTIFACT_KIND,
      bindingKey: entry.bindingKey, contentHash, mimeType: entry.mime, byteLength: blob.size, width: size, height: size };
    return { metadata, archiveEntry: {...metadata, path: "assets/paint.png", data: blob} };
  });
  const decodeArtifact = vi.fn(async () => ({width: size, height: size, data: new Uint8ClampedArray(size * size * 4).fill(119)}));
  return { original, material, duplicate, scene, settings, options: {maxAggregateResidentBytes: 64 * 1024 ** 2, dependencies: {getArtifact, decodeArtifact}} };
}

describe("좁은 화면에서 읽는 VRM 표면 채색", () => {
  it("다섯 1K PNG를 일곱 재질 바인딩으로 재사용하고 기존 UV·재질·픽셀을 복구한다", async () => {
    const {scene, material, duplicate, settings, options, original} = fixture(1024);
    const view = await restoreStudioVrmPaintPresentation(scene, settings, options);
    expect(options.dependencies.getArtifact).toHaveBeenCalledTimes(5);
    expect(options.dependencies.decodeArtifact).toHaveBeenCalledTimes(5);
    expect(view.residentBytes).toBe(40 * 1024 ** 2);
    expect(material.map).toBe(duplicate.map);
    expect(material.alphaMap).toBe(duplicate.alphaMap);
    expect(material.map?.repeat.toArray()).toEqual([2, 3]);
    expect(material.map?.colorSpace).toBe(SRGBColorSpace);
    expect(material.metalnessMap?.colorSpace).toBe("");
    expect(material).toMatchObject({roughness: 1, metalness: 1, transparent: true});
    expect(view.peek(duplicate, "opacity")?.texture).toBe(material.alphaMap);
    const lease = view.release(duplicate, "opacity")!;
    expect(lease.bindings).toHaveLength(2);
    expect(lease.image.data[0]).toBe(119);
    expect(duplicate.alphaMap).toBeNull();
    expect(material.alphaMap).toBeNull();
    expect(view.residentBytes).toBe(32 * 1024 ** 2);
    lease.restore();
    expect(material.alphaMap).toBe(duplicate.alphaMap);
    expect(view.residentBytes).toBe(40 * 1024 ** 2);
    const handoff = view.release(material, "baseColor")!;
    expect(material.map).toBe(original.map);
    handoff.commit();
    expect(view.release(material, "baseColor")).toBeUndefined();
    view.dispose();
    expect(material.map === original.map).toBe(true);
    expect([material.roughness, material.metalness, material.transparent]).toEqual([0.42, 0.13, false]);
    expect(material.roughnessMap).toBeNull();
    expect(material.metalnessMap).toBeNull();
    expect(material.emissiveMap).toBeNull();
    expect(material.alphaMap).toBeNull();
    expect(original.map.image.data?.every(v => v === 0)).toBe(true);
  });
  it("GPU와 해독 중인 메모리까지 한도를 넘으면 PNG를 읽기 전에 차단한다", async () => {
    const {scene, material, settings, options, original} = fixture();
    await expect(restoreStudioVrmPaintPresentation(scene, settings, {...options, maxAggregateResidentBytes: 170})).rejects.toThrow("메모리");
    expect(options.dependencies.getArtifact).not.toHaveBeenCalled();
    expect(material.map === original.map).toBe(true);
    expect([material.roughness, material.metalness, material.transparent]).toEqual([0.42, 0.13, false]);
  });
  it("뒤쪽 PNG가 손상됐거나 공유 재질의 원장이 서로 다르면 먼저 읽은 채색도 적용하지 않는다", async () => {
    const {scene, material, settings, options, original} = fixture();
    options.dependencies.decodeArtifact.mockResolvedValueOnce({width: 2, height: 2, data: new Uint8ClampedArray(16)}).mockRejectedValueOnce(new Error("PNG 손상"));
    await expect(restoreStudioVrmPaintPresentation(scene, settings, options)).rejects.toThrow("PNG 손상");
    expect(material.map === original.map).toBe(true);
    expect([material.roughness, material.metalness, material.transparent]).toEqual([0.42, 0.13, false]);
    const textures = settings.textures.map(e => e.materialLocator === "gltf-material:1" ? {...e, hash: settings.textures[1]!.hash} : e);
    await expect(restoreStudioVrmPaintPresentation(scene, {...settings, textures}, options)).rejects.toThrow("서로 다른 채색");
    expect(material.map === original.map).toBe(true);
    expect([material.roughness, material.metalness, material.transparent]).toEqual([0.42, 0.13, false]);
  });
});
