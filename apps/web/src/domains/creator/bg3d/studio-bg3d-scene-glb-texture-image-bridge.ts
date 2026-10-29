/** 개인 texture의 RGB/alpha를 Canvas 합성 없이 GLB 이미지에 연결한다. 원본 cache는 받지 않는다. */
import { Line, LinearSRGBColorSpace, Material, Mesh, MeshStandardMaterial, NoColorSpace, Object3D, Points, SRGBColorSpace, Texture } from "three";
import { encodeStudioBg3dSceneGlbRgbaPng, StudioBg3dSceneGlbExactImageError,
  type StudioBg3dSceneGlbImageReplacementRegistry } from "./studio-bg3d-scene-glb-exact-images";
import type { StudioBg3dSceneGlbTextureCapture, StudioBg3dSceneGlbTextureExportSupport } from "./studio-bg3d-scene-glb-texture-export";
import { createStudioBg3dSceneGlbMetalRoughTexture,
  type StudioBg3dSceneGlbMetalRoughFailure, type StudioBg3dSceneGlbMetalRoughResult } from "./studio-bg3d-scene-glb-metal-rough";

interface TextureSlot {
  readonly material: Material;
  readonly key: string;
  readonly descriptor: PropertyDescriptor;
  readonly texture: Texture;
  readonly required: boolean;
}
const COLOR_TEXTURE_SLOTS = new Set(["map", "emissiveMap", "sheenColorMap", "specularColorMap"]);
function collectTextureSlots(root: Object3D): TextureSlot[] {
  const slots: TextureSlot[] = [], seen = new Set<Material>();
  root.traverse((object) => {
    if (!(object instanceof Mesh || object instanceof Line || object instanceof Points)) return;
    const binding: Material | Material[] = object.material;
    for (const material of Array.isArray(binding) ? binding : [binding]) {
      if (seen.has(material)) continue;
      seen.add(material);
      for (const key of Object.keys(material)) {
        const descriptor = Object.getOwnPropertyDescriptor(material, key);
        const value: unknown = descriptor && "value" in descriptor ? descriptor.value : undefined;
        if (!descriptor || !(value instanceof Texture)) continue;
        // normal 부호 변환은 파생 이미지를 쓴다. MR의 두 슬롯은 후속 계획에서 같은 개인 texture로 연결한다.
        const sharedOrm = material instanceof MeshStandardMaterial && material.metalnessMap === value && material.roughnessMap === value;
        slots.push({ material, key, descriptor, texture: value, required: key === "map" || key === "aoMap" || key === "emissiveMap" || sharedOrm });
      }
    }
  });
  return slots;
}
export interface StudioBg3dSceneGlbTextureImageBridgeOptions {
  readonly root: Object3D;
  readonly support: StudioBg3dSceneGlbTextureExportSupport;
  readonly registry: StudioBg3dSceneGlbImageReplacementRegistry;
  readonly signal: AbortSignal;
  readonly maximumBytes: number;
  readonly maximumRgbaBytes: number;
  readonly assertCurrent: () => void;
}
export interface StudioBg3dSceneGlbPreparedTextureImages { dispose(): void; }
export class StudioBg3dSceneGlbMetalRoughBridgeError extends Error {
  constructor(readonly code: StudioBg3dSceneGlbMetalRoughFailure["code"],
    readonly reason: StudioBg3dSceneGlbMetalRoughFailure["reason"], messageKo: string) {
    super(messageKo); this.name = "StudioBg3dSceneGlbMetalRoughBridgeError";
  }
}
type Packed = Extract<Extract<StudioBg3dSceneGlbMetalRoughResult, { ok: true }>["value"], { kind: "packed" }>;
interface Binding { readonly material: Material; readonly key: string; readonly descriptor: PropertyDescriptor; }
interface PlannedBinding extends Binding { readonly texture: Texture; readonly required: boolean; }
function binding(material: Material, key: string): Binding {
  const descriptor = Object.getOwnPropertyDescriptor(material, key);
  if (!descriptor || !("value" in descriptor)) throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "material-slot-descriptor-missing");
  return { material, key, descriptor };
}
function sameDescriptor(a: PropertyDescriptor | undefined, b: PropertyDescriptor): boolean {
  return !!a && a.value === b.value && a.get === b.get && a.set === b.set
    && a.writable === b.writable && a.configurable === b.configurable && a.enumerable === b.enumerable;
}
function imageSize(texture: Texture): { width: number; height: number; bytes: number } {
  const image: unknown = texture.image;
  if (!image || typeof image !== "object" || !("width" in image) || !("height" in image)
    || typeof image.width !== "number" || typeof image.height !== "number"
    || !Number.isSafeInteger(image.width) || image.width < 1 || !Number.isSafeInteger(image.height) || image.height < 1
    || !Number.isSafeInteger(image.width * image.height * 4)) {
    throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "texture-image-size-invalid");
  }
  return { width: image.width, height: image.height, bytes: image.width * image.height * 4 };
}
function samplingState(texture: Texture): string {
  return JSON.stringify([texture.version, texture.source.version, texture.colorSpace, texture.flipY,
    texture.premultiplyAlpha, texture.mapping, texture.channel, texture.wrapS, texture.wrapT, texture.minFilter,
    texture.magFilter, texture.anisotropy, texture.generateMipmaps, texture.mipmaps.length,
    texture.offset.toArray(), texture.repeat.toArray(), texture.center.toArray(), texture.rotation,
    texture.matrixAutoUpdate, texture.matrix.toArray()]);
}

/** 원본 캡처→개인 MR packing→PNG 등록을 마친 뒤 binding을 한 번에 설치한다. */
export async function prepareStudioBg3dSceneGlbTextureImages(options: StudioBg3dSceneGlbTextureImageBridgeOptions): Promise<StudioBg3dSceneGlbPreparedTextureImages> {
  const check = () => {
    if (options.signal.aborted) throw new StudioBg3dSceneGlbExactImageError("aborted", "signal-aborted");
    options.assertCurrent();
  };
  check();
  const slots = collectTextureSlots(options.root), textures = new Set(slots.map((slot) => slot.texture));
  // glTF는 slot별 색공간이 고정이다. encoded byte만 복사해 현재 shader의 선형 값을 바꾸지 않는다.
  for (const slot of slots) {
    const valid = COLOR_TEXTURE_SLOTS.has(slot.key) ? slot.texture.colorSpace === SRGBColorSpace
      : slot.texture.colorSpace === NoColorSpace || slot.texture.colorSpace === LinearSRGBColorSpace;
    if (!valid) throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "texture-role-color-space-mismatch");
  }
  const pairs = [...new Set(slots.map((slot) => slot.material))].flatMap((material) =>
    material instanceof MeshStandardMaterial && (material.roughnessMap || material.metalnessMap)
      && material.roughnessMap !== material.metalnessMap
      ? [{ material, roughness: material.roughnessMap, metalness: material.metalnessMap,
        roughnessBinding: binding(material, "roughnessMap"), metalnessBinding: binding(material, "metalnessMap") }] : []);
  const originals: Binding[] = [...slots, ...pairs.flatMap((pair) => [pair.roughnessBinding, pair.metalnessBinding])];
  const states = new Map([...textures].map((texture) => [texture, { source: texture.source, image: texture.image,
    size: imageSize(texture), sampling: samplingState(texture) }]));
  let usedRgbaBytes = 0;
  for (const state of states.values()) usedRgbaBytes += state.size.bytes;
  if (!Number.isSafeInteger(options.maximumRgbaBytes) || options.maximumRgbaBytes < 0
    || !Number.isSafeInteger(usedRgbaBytes) || usedRgbaBytes > options.maximumRgbaBytes) {
    throw new StudioBg3dSceneGlbExactImageError("budget-exceeded", "cumulative-rgba-over-budget");
  }
  const checkTexture = (texture: Texture) => {
    const state = states.get(texture), size = imageSize(texture);
    if (!state || texture.source !== state.source || texture.image !== state.image || samplingState(texture) !== state.sampling
      || size.width !== state.size.width || size.height !== state.size.height) {
      throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "texture-binding-state-changed");
    }
  };
  const checkOriginals = () => {
    check();
    if (originals.some((slot) => !sameDescriptor(Object.getOwnPropertyDescriptor(slot.material, slot.key), slot.descriptor))) {
      throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "texture-binding-state-changed");
    }
    for (const texture of textures) checkTexture(texture);
  };
  const captures = new Map<Texture, StudioBg3dSceneGlbTextureCapture>();
  const owners: Packed[] = [], installed: PlannedBinding[] = [];
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    const errors: unknown[] = [];
    for (const slot of installed.splice(0).reverse()) {
      try {
        const current = Object.getOwnPropertyDescriptor(slot.material, slot.key);
        if (current && "value" in current && current.value === slot.texture) Object.defineProperty(slot.material, slot.key, slot.descriptor);
      } catch (error) { errors.push(error); }
    }
    for (const owner of owners.splice(0).reverse()) { try { owner.dispose(); } catch (error) { errors.push(error); } }
    captures.clear();
    if (errors.length) throw new AggregateError(errors, "개인 재질 채널과 binding 정리에 실패했습니다.");
  };
  const capturedFor = (texture: Texture): StudioBg3dSceneGlbTextureCapture => {
    const captured = captures.get(texture);
    if (!captured) throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "texture-capture-missing");
    return captured;
  };
  try {
    checkOriginals();
    for (const texture of textures) {
      check(); checkTexture(texture);
      const captured = await options.support.capture(texture);
      check(); checkTexture(texture);
      const expected = states.get(texture);
      if (!expected || captured.width !== expected.size.width || captured.height !== expected.size.height
        || !(captured.rgba instanceof Uint8Array) || captured.rgba.byteLength !== expected.size.bytes) {
        throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "texture-capture-size-changed");
      }
      captures.set(texture, captured);
    }
    checkOriginals();
    const packedMaterials = new Map<MeshStandardMaterial, Packed>();
    const pairCache = new Map<Texture | null, Map<Texture | null, Packed>>();
    for (const pair of pairs) {
      check();
      let owned = pairCache.get(pair.roughness)?.get(pair.metalness);
      if (!owned) {
        const result = createStudioBg3dSceneGlbMetalRoughTexture({
          roughness: pair.roughness ? { texture: pair.roughness, capture: capturedFor(pair.roughness) } : null,
          metalness: pair.metalness ? { texture: pair.metalness, capture: capturedFor(pair.metalness) } : null,
          signal: options.signal, maximumRgbaBytes: options.maximumRgbaBytes - usedRgbaBytes,
        });
        if (!result.ok) throw new StudioBg3dSceneGlbMetalRoughBridgeError(result.code, result.reason, result.messageKo);
        if (result.value.kind !== "packed") throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "distinct-maps-not-packed");
        owned = result.value; owners.push(owned);
        usedRgbaBytes += owned.additionalRgbaBytes;
        if (!Number.isSafeInteger(usedRgbaBytes) || usedRgbaBytes > options.maximumRgbaBytes) {
          throw new StudioBg3dSceneGlbExactImageError("budget-exceeded", "cumulative-rgba-over-budget");
        }
        const byMetalness = pairCache.get(pair.roughness) ?? new Map<Texture | null, Packed>();
        byMetalness.set(pair.metalness, owned); pairCache.set(pair.roughness, byMetalness);
      }
      packedMaterials.set(pair.material, owned);
    }
    const plans: PlannedBinding[] = [];
    for (const slot of slots) {
      if (slot.material instanceof MeshStandardMaterial && packedMaterials.has(slot.material)
        && (slot.key === "roughnessMap" || slot.key === "metalnessMap")) continue;
      plans.push({ ...slot, texture: capturedFor(slot.texture).texture });
    }
    for (const pair of pairs) {
      const owned = packedMaterials.get(pair.material);
      if (!owned) throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "packed-material-missing");
      plans.push({ ...pair.roughnessBinding, texture: owned.texture, required: true },
        { ...pair.metalnessBinding, texture: owned.texture, required: true });
    }
    const availableImages = new Map<Texture, StudioBg3dSceneGlbTextureCapture | Packed>([...captures.values()].map((captured) => [captured.texture, captured]));
    for (const owned of owners) availableImages.set(owned.texture, owned);
    const images = new Map<Texture, { captured: StudioBg3dSceneGlbTextureCapture | Packed; required: boolean }>();
    for (const plan of plans) {
      const previous = images.get(plan.texture);
      const captured = availableImages.get(plan.texture);
      if (!captured) throw new StudioBg3dSceneGlbExactImageError("invalid-rgba", "planned-image-missing");
      images.set(plan.texture, { captured, required: plan.required || previous?.required === true });
    }
    for (const [texture, image] of images) {
      check();
      const png = encodeStudioBg3dSceneGlbRgbaPng({ width: image.captured.width, height: image.captured.height, rgba: image.captured.rgba,
        flipY: texture.flipY, signal: options.signal, maximumBytes: options.maximumBytes, maximumRgbaBytes: options.maximumRgbaBytes });
      options.registry.registerTexture(texture, png, { required: image.required });
    }
    checkOriginals();
    for (const slot of plans) {
      Object.defineProperty(slot.material, slot.key, { ...slot.descriptor, value: slot.texture }); installed.push(slot);
    }
    check();
    return { dispose };
  } catch (error) {
    const failures: unknown[] = [error];
    try { dispose(); } catch (cleanupError) { failures.push(cleanupError); }
    if (failures.length > 1) throw new AggregateError(failures, "재질 채널 준비와 정리에 실패했습니다.", { cause: error });
    throw error;
  }
}
