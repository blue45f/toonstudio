import * as THREE from "three";

import type { StudioVrmSurfacePaintSettings, StudioVrmSurfacePaintTexture } from "./studio-vrm-scene-document";
import type { StudioVrmTexturePaintArtifactReadableImage } from "./studio-vrm-texture-paint-artifact";
import type { StudioVrmTexturePaintChannel } from "./studio-vrm-texture-paint-channel";
import { StudioVrmTexturePaintMaterialChannels } from "./studio-vrm-texture-paint-material";
import { collectSceneMaterialBindings, copyTextureSampling } from "./studio-vrm-texture-paint-material-bindings";
import { readStudioVrmSavedSurfacePaint, type StudioVrmTexturePaintPersistenceOptions } from "./studio-vrm-texture-paint-persistence";

interface BindingGroup {
  readonly source: THREE.Texture;
  readonly channel: StudioVrmTexturePaintChannel;
  readonly bindings: StudioVrmSurfacePaintTexture[];
  readonly materials: THREE.Material[];
  readonly hash: string;
  readonly rgbaBytes: number;
  image?: StudioVrmTexturePaintArtifactReadableImage;
  texture?: THREE.DataTexture;
}

export interface StudioVrmPaintPresentation {
  readonly residentBytes: number;
  peek(material: THREE.Material, channel: StudioVrmTexturePaintChannel): {texture: THREE.Texture; image: StudioVrmTexturePaintArtifactReadableImage} | undefined;
  release(material: THREE.Material, channel: StudioVrmTexturePaintChannel): {
    readonly source: THREE.Texture;
    readonly image: StudioVrmTexturePaintArtifactReadableImage;
    readonly bindings: readonly StudioVrmSurfacePaintTexture[];
    restore(): void;
    commit(): void;
  } | undefined;
  dispose(): void;
}

function groupBindings(scene: THREE.Object3D, settings: StudioVrmSurfacePaintSettings, channels: StudioVrmTexturePaintMaterialChannels) {
  const groups = new Map<THREE.Texture, BindingGroup>();
  for (const slot of new Set(settings.textures.map(texture => texture.textureSlot))) {
    const registry = [...collectSceneMaterialBindings(scene, slot)].map(([material, binding]) => ({
      material, binding, source: channels.get(material, slot),
    }));
    for (const entry of settings.textures.filter(texture => texture.textureSlot === slot)) {
      const matches = registry.filter(({ binding }) => binding.materialLocator === entry.materialLocator);
      const source = matches[0]?.source;
      if (matches.length !== 1 || !source || (source as THREE.CompressedTexture).isCompressedTexture)
        throw new Error("저장된 채색에 대응하는 모델 재질을 찾지 못했습니다.");
      const size = source.image as { width?: number; height?: number; naturalWidth?: number; naturalHeight?: number } | undefined;
      if ((size?.naturalWidth || size?.width || 2048) !== entry.width || (size?.naturalHeight || size?.height || 2048) !== entry.height)
        throw new Error("저장된 채색과 원래 모델 텍스처의 크기가 다릅니다.");
      const existing = groups.get(source);
      if (existing) {
        if (existing.hash !== entry.hash) throw new Error("같은 모델 표면에 서로 다른 채색이 저장되어 있습니다.");
        existing.bindings.push(entry);
      } else {
        groups.set(source, { source, channel: slot, bindings: [entry], hash: entry.hash,
          rgbaBytes: entry.width * entry.height * 4, materials: registry.filter(item => item.source === source).map(item => item.material) });
      }
    }
  }
  return [...groups.values()];
}

function residentBytes(groups: Iterable<BindingGroup>) {
  const hashes = new Set<string>();
  let bytes = 0;
  for (const group of groups) {
    if (!hashes.has(group.hash)) {
      hashes.add(group.hash);
      bytes += group.rgbaBytes;
    }
    bytes += group.rgbaBytes;
    if (group.source.generateMipmaps) {
      let {width, height} = group.bindings[0]!;
      while (width > 1 || height > 1) {
        width = Math.max(1, Math.floor(width / 2));
        height = Math.max(1, Math.floor(height / 2));
        bytes += width * height * 4;
      }
    }
  }
  return bytes;
}

/** 해독한 원본 RGBA와 GPU 텍스처만 보관한다. 브러시 캔버스와 변경 이력은 편집을 시작한 표면에서만 필요하다. */
export async function restoreStudioVrmPaintPresentation(
  scene: THREE.Object3D,
  settings: StudioVrmSurfacePaintSettings,
  options: StudioVrmTexturePaintPersistenceOptions & { maxAggregateResidentBytes: number },
): Promise<StudioVrmPaintPresentation> {
  const channels = new StudioVrmTexturePaintMaterialChannels();
  const active = new Set<BindingGroup>();
  const owned = new Set<BindingGroup>();
  let disposed = false;
  function bind(group: BindingGroup, paint: boolean) {
    for (const material of group.materials) {
      if (!paint && (!group.texture || !channels.isBound(material, group.channel, group.texture))) continue;
      channels.set(material, group.channel, paint ? group.texture! : group.source);
      material.needsUpdate = true;
    }
  }
  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const group of active) bind(group, false);
    for (const group of owned) group.texture?.dispose();
    active.clear();
    owned.clear();
    channels.dispose();
  }
  try {
    const groups = groupBindings(scene, settings, channels);
    const peakDecodeBytes = Math.max(0, ...groups.map(group => group.rgbaBytes * 2)); // 해독 중에만 존재하는 ImageBitmap과 Canvas2D.
    if (!Number.isFinite(options.maxAggregateResidentBytes) || residentBytes(groups) + peakDecodeBytes > options.maxAggregateResidentBytes)
      throw new Error("현재 기기의 메모리 한도에서 이 채색을 열 수 없습니다.");
    for await (const { textures, image } of readStudioVrmSavedSurfacePaint(settings, options)) {
      for (const group of groups.filter(group => group.hash === textures[0]?.hash)) {
        group.image = image;
        const pixels = new Uint8Array(image.data.buffer, image.data.byteOffset, image.data.byteLength);
        group.texture = new THREE.DataTexture(pixels, image.width, image.height);
        owned.add(group);
        copyTextureSampling(group.source, group.texture);
      }
    }
    options.signal?.throwIfAborted();
    for (const group of owned) {
      if (group.materials.some(material => channels.get(material, group.channel) !== group.source))
        throw new Error("채색을 여는 동안 모델 재질이 바뀌었습니다. 다시 열어 주세요.");
    }
    for (const group of owned) {
      active.add(group);
      bind(group, true);
    }
    function visibleGroup(material: THREE.Material, channel: StudioVrmTexturePaintChannel) {
      return [...active].find(group => group.channel === channel && group.materials.includes(material));
    }
    return {
      peek(material, channel) {
        const group = visibleGroup(material, channel);
        if (group?.image && group.texture) return {image: group.image, texture: group.texture};
      },
      get residentBytes() { return residentBytes(active); },
      release(material, channel) {
        const group = visibleGroup(material, channel);
        if (!group?.image || disposed) return;
        bind(group, false);
        active.delete(group);
        let settled = false;
        return {
          image: group.image, source: group.source, bindings: group.bindings,
          restore() {
            if (settled || disposed) return;
            settled = true;
            active.add(group);
            bind(group, true);
          },
          commit() {
            if (settled || disposed) return;
            settled = true;
            owned.delete(group);
            group.texture?.dispose();
            group.texture = undefined;
            group.image = undefined;
          },
        };
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}
