import * as THREE from "three";

export type StudioBg3dGlbTextureSlot =
  | "baseColor"
  | "normal"
  | "metallicRoughness"
  | "occlusion"
  | "emissive";

export const STUDIO_BG3D_GLB_TEXTURE_SLOT_LABELS: Readonly<
  Record<StudioBg3dGlbTextureSlot, string>
> = Object.freeze({
  baseColor: "기본 색상",
  normal: "노멀(요철)",
  metallicRoughness: "거칠기·금속성",
  occlusion: "주변 차폐(AO)",
  emissive: "발광",
});

export interface StudioBg3dMissingTextureSlotDescriptor {
  readonly slotKey: string;
  readonly materialKey: string;
  readonly materialIndex: number;
  readonly materialName: string;
  readonly slot: StudioBg3dGlbTextureSlot;
  readonly slotLabel: string;
  readonly textureIndex: number | null;
  readonly imageName: string | null;
}

export interface StudioBg3dMissingTextureMaterialMetadata {
  readonly materialKey: string;
  readonly materialIndex: number;
  readonly materialName: string;
  readonly missingSlots: readonly StudioBg3dMissingTextureSlotDescriptor[];
}

export interface StudioBg3dGlbMissingTextureReport {
  readonly totalMaterialCount: number;
  readonly problemMaterialCount: number;
  readonly healthyMaterialCount: number;
  readonly missingSlots: readonly StudioBg3dMissingTextureSlotDescriptor[];
}

export interface StudioBg3dMissingTextureSlotOverride {
  readonly fallbackPreviewEnabled: boolean;
  readonly relinkedTexture?: THREE.Texture | null;
  readonly relinkedFileName?: string | null;
}

export type StudioBg3dInstanceMissingTextureState = Readonly<
  Record<string, StudioBg3dMissingTextureSlotOverride>
>;

export const STUDIO_BG3D_MISSING_TEXTURE_REPORT_KEY = "studioBg3dMissingTextureReport";
export const STUDIO_BG3D_MISSING_TEXTURE_MATERIAL_KEY = "studioBg3dMissingTextureMaterial";
const FALLBACK_TEXTURE_FLAG = "studioBg3dIsMissingTextureFallback";
const RELINK_TEXTURE_FLAG = "studioBg3dIsRelinkedTexture";
const MAX_RELINK_FILE_BYTES = 32 * 1024 * 1024;
const MAX_RELINK_DIMENSION = 8192;

interface MinimalGltfTextureRef {
  readonly index?: unknown;
}

interface MinimalGltfMaterialDef {
  readonly name?: unknown;
  readonly pbrMetallicRoughness?: {
    readonly baseColorTexture?: MinimalGltfTextureRef;
    readonly metallicRoughnessTexture?: MinimalGltfTextureRef;
  };
  readonly normalTexture?: MinimalGltfTextureRef;
  readonly occlusionTexture?: MinimalGltfTextureRef;
  readonly emissiveTexture?: MinimalGltfTextureRef;
  readonly extras?: Record<string, unknown>;
}

export interface MinimalGltfParserLike {
  readonly json?: {
    readonly materials?: readonly MinimalGltfMaterialDef[];
    readonly textures?: readonly { readonly name?: unknown; readonly source?: unknown }[];
    readonly images?: readonly { readonly name?: unknown; readonly uri?: unknown }[];
  };
  readonly associations?: ReadonlyMap<
    unknown,
    { readonly materials?: number } | undefined
  >;
}

type MaterialTextureChannelKey =
  | "map"
  | "normalMap"
  | "roughnessMap"
  | "metalnessMap"
  | "aoMap"
  | "emissiveMap";

type ChannelCarrierMaterial = THREE.Material &
  Partial<Record<MaterialTextureChannelKey, THREE.Texture | null>>;

const SLOT_MATERIAL_KEYS: Readonly<
  Record<StudioBg3dGlbTextureSlot, readonly MaterialTextureChannelKey[]>
> = Object.freeze({
  baseColor: ["map"],
  normal: ["normalMap"],
  metallicRoughness: ["roughnessMap", "metalnessMap"],
  occlusion: ["aoMap"],
  emissive: ["emissiveMap"],
});

function isMissingSlotDescriptorList(
  value: unknown,
): value is readonly StudioBg3dMissingTextureSlotDescriptor[] {
  return Array.isArray(value);
}

function stripAsciiControlChars(value: string): string {
  let out = "";
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i);
    if (code > 0x1f && code !== 0x7f) {
      out += value[i];
    }
  }
  return out;
}

function sanitizeLabel(value: unknown, fallback: string): string {
  if (typeof value !== "string") return fallback;
  const trimmed = stripAsciiControlChars(value).trim();
  if (!trimmed) return fallback;
  return trimmed.slice(0, 96);
}

function sanitizeImageHint(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const cleaned = stripAsciiControlChars(value).trim();
  if (!cleaned || cleaned.startsWith("data:") || cleaned.startsWith("blob:")) return null;
  const tail = cleaned.split(/[\\/]/u).pop()?.trim() ?? cleaned;
  return tail ? tail.slice(0, 96) : null;
}

export function hasLoadedStudioBg3dTextureImage(
  texture: THREE.Texture | null | undefined,
): boolean {
  if (!texture || !(texture instanceof THREE.Texture)) return false;
  if (texture.userData?.[FALLBACK_TEXTURE_FLAG] === true) return false;
  const img = texture.image as
    | { width?: unknown; height?: unknown; videoWidth?: unknown; naturalWidth?: unknown }
    | null
    | undefined;
  if (!img || typeof img !== "object") return false;
  const width =
    typeof img.width === "number"
      ? img.width
      : typeof img.naturalWidth === "number"
        ? img.naturalWidth
        : typeof img.videoWidth === "number"
          ? img.videoWidth
          : 0;
  return Number.isFinite(width) && width > 0;
}

function collectUniqueSceneMaterials(root: THREE.Object3D): THREE.Material[] {
  const seen = new Set<THREE.Material>();
  const ordered: THREE.Material[] = [];
  root.traverse((node) => {
    const isRenderable =
      (node as THREE.Mesh).isMesh ||
      (node as THREE.Points).isPoints ||
      (node as THREE.Line).isLine;
    if (!isRenderable) return;
    const raw = (node as THREE.Mesh).material;
    const list = Array.isArray(raw) ? raw : raw ? [raw] : [];
    for (const mat of list) {
      if (mat && !seen.has(mat)) {
        seen.add(mat);
        ordered.push(mat);
      }
    }
  });
  return ordered;
}

function resolveGltfImageName(
  parser: MinimalGltfParserLike | null | undefined,
  textureIndex: number | null,
): string | null {
  if (textureIndex === null || !parser?.json) return null;
  const texDef = parser.json.textures?.[textureIndex];
  if (!texDef) return null;
  const sourceIdx = typeof texDef.source === "number" ? texDef.source : null;
  const imgDef = sourceIdx !== null ? parser.json.images?.[sourceIdx] : undefined;
  return (
    sanitizeImageHint(imgDef?.name) ??
    sanitizeImageHint(imgDef?.uri) ??
    sanitizeImageHint(texDef.name)
  );
}

function isDeclaredSlotMissingOnMaterial(
  material: ChannelCarrierMaterial,
  slot: StudioBg3dGlbTextureSlot,
): boolean {
  const keys = SLOT_MATERIAL_KEYS[slot];
  return keys.every((key) => !hasLoadedStudioBg3dTextureImage(material[key] ?? null));
}

export function createStudioBg3dMissingTextureSlotKey(
  materialKey: string,
  slot: StudioBg3dGlbTextureSlot,
): string {
  return `${materialKey}:${slot}`;
}

export function attachStudioBg3dGlbMissingTextureMetadata(
  root: THREE.Object3D,
  parser?: MinimalGltfParserLike | null,
): StudioBg3dGlbMissingTextureReport {
  const materials = collectUniqueSceneMaterials(root);
  const materialDefs = parser?.json?.materials ?? [];
  const allMissingSlots: StudioBg3dMissingTextureSlotDescriptor[] = [];
  let problemMaterialCount = 0;

  materials.forEach((material, fallbackOrder) => {
    const assocIndex = parser?.associations?.get(material)?.materials;
    let materialIndex =
      typeof assocIndex === "number" && assocIndex >= 0 ? assocIndex : -1;
    if (materialIndex < 0 && material.name && materialDefs.length > 0) {
      const matched = materialDefs.findIndex((def) => def?.name === material.name);
      if (matched >= 0) materialIndex = matched;
    }
    const effectiveIndex = materialIndex >= 0 ? materialIndex : fallbackOrder;
    const materialDef = materialIndex >= 0 ? materialDefs[materialIndex] : undefined;
    const materialKey = `mat:${effectiveIndex}`;
    const materialName = sanitizeLabel(
      material.name || materialDef?.name,
      `재질 ${effectiveIndex + 1}`,
    );

    const declaredSlots = new Map<StudioBg3dGlbTextureSlot, number | null>();
    const baseIdx = materialDef?.pbrMetallicRoughness?.baseColorTexture?.index;
    if (typeof baseIdx === "number") declaredSlots.set("baseColor", baseIdx);
    const mrIdx = materialDef?.pbrMetallicRoughness?.metallicRoughnessTexture?.index;
    if (typeof mrIdx === "number") declaredSlots.set("metallicRoughness", mrIdx);
    const normIdx = materialDef?.normalTexture?.index;
    if (typeof normIdx === "number") declaredSlots.set("normal", normIdx);
    const occIdx = materialDef?.occlusionTexture?.index;
    if (typeof occIdx === "number") declaredSlots.set("occlusion", occIdx);
    const emiIdx = materialDef?.emissiveTexture?.index;
    if (typeof emiIdx === "number") declaredSlots.set("emissive", emiIdx);

    const extraMissing = materialDef?.extras?.toonstudioMissingTextures;
    if (Array.isArray(extraMissing)) {
      for (const item of extraMissing) {
        if (
          item === "baseColor" ||
          item === "normal" ||
          item === "metallicRoughness" ||
          item === "occlusion" ||
          item === "emissive"
        ) {
          if (!declaredSlots.has(item)) declaredSlots.set(item, null);
        }
      }
    }

    const carrier = material as ChannelCarrierMaterial;
    const materialMissing: StudioBg3dMissingTextureSlotDescriptor[] = [];
    for (const [slot, texIndex] of declaredSlots) {
      if (!isDeclaredSlotMissingOnMaterial(carrier, slot)) continue;
      const descriptor: StudioBg3dMissingTextureSlotDescriptor = {
        slotKey: createStudioBg3dMissingTextureSlotKey(materialKey, slot),
        materialKey,
        materialIndex: effectiveIndex,
        materialName,
        slot,
        slotLabel: STUDIO_BG3D_GLB_TEXTURE_SLOT_LABELS[slot],
        textureIndex: texIndex,
        imageName: resolveGltfImageName(parser, texIndex),
      };
      materialMissing.push(descriptor);
      allMissingSlots.push(descriptor);
    }

    if (materialMissing.length > 0) {
      problemMaterialCount += 1;
      const meta: StudioBg3dMissingTextureMaterialMetadata = {
        materialKey,
        materialIndex: effectiveIndex,
        materialName,
        missingSlots: materialMissing,
      };
      material.userData = {
        ...material.userData,
        [STUDIO_BG3D_MISSING_TEXTURE_MATERIAL_KEY]: meta,
      };
    }
  });

  const report: StudioBg3dGlbMissingTextureReport = {
    totalMaterialCount: materials.length,
    problemMaterialCount,
    healthyMaterialCount: Math.max(0, materials.length - problemMaterialCount),
    missingSlots: allMissingSlots,
  };
  if (allMissingSlots.length > 0) {
    root.userData = {
      ...root.userData,
      [STUDIO_BG3D_MISSING_TEXTURE_REPORT_KEY]: report,
    };
  }
  return report;
}

export function readStudioBg3dGlbMissingTextureReport(
  root: THREE.Object3D | null | undefined,
): StudioBg3dGlbMissingTextureReport | null {
  if (!root?.userData) return null;
  const raw = root.userData[STUDIO_BG3D_MISSING_TEXTURE_REPORT_KEY] as
    | StudioBg3dGlbMissingTextureReport
    | undefined;
  if (!raw || !Array.isArray(raw.missingSlots) || raw.missingSlots.length === 0) {
    return null;
  }
  return raw;
}

export function hasStudioBg3dMissingTextures(
  root: THREE.Object3D | null | undefined,
): boolean {
  return readStudioBg3dGlbMissingTextureReport(root) !== null;
}

const fallbackTextureBySlot = new Map<StudioBg3dGlbTextureSlot, THREE.DataTexture>();

export function getStudioBg3dMissingTextureFallbackPreview(
  slot: StudioBg3dGlbTextureSlot,
): THREE.DataTexture {
  const cached = fallbackTextureBySlot.get(slot);
  if (cached) return cached;

  const size = 64;
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      if (slot === "normal") {
        data[offset] = 128;
        data[offset + 1] = 128;
        data[offset + 2] = 255;
        data[offset + 3] = 255;
      } else if (slot === "metallicRoughness" || slot === "occlusion") {
        data[offset] = 236;
        data[offset + 1] = 196;
        data[offset + 2] = 28;
        data[offset + 3] = 255;
      } else {
        const checker = ((x >> 3) + (y >> 3)) % 2 === 0;
        const border = x % 16 === 0 || y % 16 === 0;
        if (border) {
          data[offset] = 108;
          data[offset + 1] = 126;
          data[offset + 2] = 152;
        } else if (checker) {
          data[offset] = 220;
          data[offset + 1] = 229;
          data[offset + 2] = 242;
        } else {
          data[offset] = 166;
          data[offset + 1] = 182;
          data[offset + 2] = 206;
        }
        data[offset + 3] = 255;
      }
    }
  }

  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.name = `studio-bg3d-missing-fallback:${slot}`;
  tex.colorSpace =
    slot === "baseColor" || slot === "emissive"
      ? THREE.SRGBColorSpace
      : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.flipY = false;
  tex.userData = { [FALLBACK_TEXTURE_FLAG]: true, slot };
  tex.needsUpdate = true;
  fallbackTextureBySlot.set(slot, tex);
  return tex;
}

export function isStudioBg3dFallbackPreviewTexture(
  texture: THREE.Texture | null | undefined,
): boolean {
  return Boolean(texture && texture.userData?.[FALLBACK_TEXTURE_FLAG] === true);
}

export function applyStudioBg3dMissingTextureOverridesToClone(
  cloneRoot: THREE.Object3D,
  instanceState?: StudioBg3dInstanceMissingTextureState,
): void {
  const materials = collectUniqueSceneMaterials(cloneRoot);
  for (const material of materials) {
    const meta = material.userData?.[STUDIO_BG3D_MISSING_TEXTURE_MATERIAL_KEY] as
      | StudioBg3dMissingTextureMaterialMetadata
      | undefined;
    const missingSlots = meta?.missingSlots;
    if (!missingSlots || !isMissingSlotDescriptorList(missingSlots) || missingSlots.length === 0) {
      continue;
    }
    const carrier = material as ChannelCarrierMaterial;
    let changed = false;

    for (const descriptor of missingSlots) {
      const slotOverride = instanceState?.[descriptor.slotKey];
      const fallbackEnabled = slotOverride?.fallbackPreviewEnabled ?? true;
      const relinked = slotOverride?.relinkedTexture ?? null;
      const channelKeys = SLOT_MATERIAL_KEYS[descriptor.slot];

      for (const key of channelKeys) {
        if ( !(key in carrier) && carrier[key] === undefined && !(material instanceof THREE.MeshStandardMaterial) ) {
          // Only assign maps supported by the material class
          if (
            !(material as unknown as Record<string, unknown>)[key] &&
            !(key in (Object.getPrototypeOf(material) as object))
          ) {
            continue;
          }
        }
        const current = carrier[key] ?? null;
        if (relinked) {
          if (current !== relinked) {
            carrier[key] = relinked;
            changed = true;
          }
          continue;
        }
        // Preserve intentional surface PBR overrides (non-fallback, non-relink textures)
        const isManagedOrEmpty =
          current === null ||
          isStudioBg3dFallbackPreviewTexture(current) ||
          Boolean(current.userData?.[RELINK_TEXTURE_FLAG]);
        if (!isManagedOrEmpty) continue;

        const desired = fallbackEnabled
          ? getStudioBg3dMissingTextureFallbackPreview(descriptor.slot)
          : null;
        if (current !== desired) {
          carrier[key] = desired;
          changed = true;
        }
      }
    }

    if (changed) {
      material.needsUpdate = true;
    }
  }
}

const ALLOWED_RELINK_MIMES = new Set(["image/png", "image/jpeg", "image/webp"]);
const ALLOWED_RELINK_EXT = /\.(?:png|jpe?g|webp)$/iu;

export async function decodeStudioBg3dRelinkTextureFile(
  file: File,
  slot: StudioBg3dGlbTextureSlot,
): Promise<THREE.Texture> {
  if (!file || file.size <= 0) {
    throw new Error("비어 있는 이미지 파일은 연결할 수 없어요.");
  }
  if (file.size > MAX_RELINK_FILE_BYTES) {
    throw new Error("32MB 이하의 PNG·JPG·WebP 이미지만 연결할 수 있어요.");
  }
  const mimeOk = ALLOWED_RELINK_MIMES.has(file.type.toLowerCase());
  const extOk = ALLOWED_RELINK_EXT.test(file.name);
  if (!mimeOk && !extOk) {
    throw new Error("PNG, JPG, WebP 형식의 텍스처 이미지만 연결할 수 있어요.");
  }

  let imageSource: ImageBitmap | HTMLImageElement;
  if (typeof createImageBitmap === "function") {
    imageSource = await createImageBitmap(file);
  } else {
    imageSource = await decodeHtmlImageFallback(file);
  }

  const width = imageSource.width;
  const height = imageSource.height;
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_RELINK_DIMENSION ||
    height > MAX_RELINK_DIMENSION
  ) {
    if ("close" in imageSource && typeof imageSource.close === "function") {
      imageSource.close();
    }
    throw new Error("가로·세로 8192px 이하의 유효한 이미지만 연결할 수 있어요.");
  }

  const texture = new THREE.Texture(imageSource);
  texture.name = sanitizeLabel(file.name, "relinked-texture");
  texture.flipY = false;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace =
    slot === "baseColor" || slot === "emissive"
      ? THREE.SRGBColorSpace
      : THREE.NoColorSpace;
  texture.anisotropy = 4;
  texture.userData = {
    [RELINK_TEXTURE_FLAG]: true,
    fileName: sanitizeLabel(file.name, "relinked-texture"),
    slot,
  };
  texture.needsUpdate = true;
  return texture;
}

function decodeHtmlImageFallback(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("선택한 이미지를 디코딩하지 못했어요. 다른 PNG·JPG·WebP 파일로 다시 시도해 주세요."));
    };
    img.src = objectUrl;
  });
}

export function disposeStudioBg3dRelinkedTexture(
  texture: THREE.Texture | null | undefined,
): void {
  if (!texture || texture.userData?.[RELINK_TEXTURE_FLAG] !== true) return;
  const img = texture.image as { close?: () => void } | null | undefined;
  try {
    texture.dispose();
  } catch {
    // ignore
  }
  if (img && typeof img.close === "function") {
    try {
      img.close();
    } catch {
      // ignore
    }
  }
}
