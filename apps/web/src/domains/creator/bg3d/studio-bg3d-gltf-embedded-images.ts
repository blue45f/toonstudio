import {
  inspectStrictJpegDimensions,
  inspectStrictStaticWebpDimensions,
} from "@/shared/lib/strict-raster-image-inspector";
import { STUDIO_BG3D_MESHOPT_EXTENSION } from "./studio-bg3d-meshopt";
import {
  STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES,
  STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_FILE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES,
  STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION,
  STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS,
  importError,
  safeAddCount,
  safeMultiplyCount,
  throwIfAborted,
} from "./studio-bg3d-model-import-shared";

import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

export interface StudioBg3dGltfEmbeddedImagesOptions {
  readonly createOwnedObjectUrl: (blob: Blob) => string;
  readonly signal?: AbortSignal;
}

interface EmbeddedImage {
  readonly index: number;
  readonly viewIndex: number;
  readonly definition: Record<string, unknown>;
  readonly mimeType: string;
  readonly bytes: ArrayBuffer;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function table(root: Record<string, unknown>, key: string, limit: number): readonly unknown[] {
  const value = root[key];
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw importError("parse-failed");
  if (value.length > limit) throw importError("image-memory-too-large");
  for (let index = 0; index < value.length; index += 1) {
    if (!Object.hasOwn(value, index)) throw importError("parse-failed");
  }
  return value;
}

/** 설치 loader의 BasisU→WebP→AVIF→core 선택 순서와 optional BasisU fallback을 따른다. */
function referencedImages(parser: GLTFParser, textures: readonly unknown[]): ReadonlySet<number> {
  const result = new Set<number>();
  for (const texture of textures) {
    if (!record(texture)) continue;
    let source = texture.source;
    const extensions = record(texture.extensions) ? texture.extensions : undefined;
    const basis = extensions?.KHR_texture_basisu;
    const webp = extensions?.EXT_texture_webp;
    const avif = extensions?.EXT_texture_avif;
    if (record(basis) && parser.options.ktx2Loader) source = basis.source;
    else if (record(webp)) source = webp.source;
    else if (record(avif)) source = avif.source;
    if (integer(source)) result.add(source);
  }
  return result;
}

function range(buffer: unknown, offset: unknown, length: unknown): { offset: number; length: number } {
  if (!record(buffer) || !integer(buffer.byteLength) || !integer(offset) || !integer(length) || length === 0) {
    throw importError("parse-failed");
  }
  if (buffer.byteLength > STUDIO_BG3D_IMPORT_MAX_DECODED_GEOMETRY_BYTES
    || offset > buffer.byteLength || length > buffer.byteLength - offset) throw importError("parse-failed");
  return { offset, length };
}

async function actualRange(
  parser: GLTFParser, buffers: readonly unknown[], index: unknown, offset: unknown, length: unknown,
  signal?: AbortSignal,
): Promise<void> {
  if (!integer(index)) throw importError("parse-failed");
  const span = range(buffers[index], offset, length);
  throwIfAborted(signal);
  const bytes: unknown = await parser.getDependency("buffer", index);
  throwIfAborted(signal);
  if (!(bytes instanceof ArrayBuffer) || span.offset > bytes.byteLength || span.length > bytes.byteLength - span.offset) {
    throw importError("parse-failed");
  }
}

/** PNG는 기존 가져오기와 같은 헤더 치수 경계다. 실제 이미지 복호화는 stock loader가 수행한다. */
function dimensions(mimeType: string, bytes: Uint8Array): { readonly width: number; readonly height: number } {
  try {
    if (mimeType === "image/jpeg") return inspectStrictJpegDimensions(bytes);
    if (mimeType === "image/webp") return inspectStrictStaticWebpDimensions(bytes);
    if (mimeType === "image/png" && bytes.byteLength >= 24
      && [137, 80, 78, 71, 13, 10, 26, 10].every((byte, index) => bytes[index] === byte)) {
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const width = view.getUint32(16, false), height = view.getUint32(20, false);
      if (width > 0 && height > 0) return { width, height };
    }
  } catch {
    throw importError("invalid-image");
  }
  throw importError("invalid-image");
}

async function imageBytes(
  parser: GLTFParser, buffers: readonly unknown[], view: unknown, index: number, signal?: AbortSignal,
): Promise<ArrayBuffer> {
  if (!record(view) || !integer(view.buffer)) throw importError("parse-failed");
  const span = range(buffers[view.buffer], view.byteOffset === undefined ? 0 : view.byteOffset, view.byteLength);
  const extensions = view.extensions;
  if (extensions !== undefined && !record(extensions)) throw importError("parse-failed");
  const compressed = record(extensions) ? extensions[STUDIO_BG3D_MESHOPT_EXTENSION] : undefined;
  if (compressed !== undefined) {
    if (!record(compressed) || !integer(compressed.count) || compressed.count === 0
      || !integer(compressed.byteStride) || compressed.byteStride === 0
      || safeMultiplyCount(compressed.count, compressed.byteStride, "geometry-memory-too-large") !== span.length) {
      throw importError("parse-failed");
    }
    await actualRange(parser, buffers, compressed.buffer, compressed.byteOffset === undefined ? 0 : compressed.byteOffset, compressed.byteLength, signal);
  } else {
    await actualRange(parser, buffers, view.buffer, span.offset, span.length, signal);
  }
  throwIfAborted(signal);
  // 공개 dependency 경계를 사용하여 설치 loader의 압축 decoder·fallback 선택을 유지한다.
  const bytes: unknown = await parser.getDependency("bufferView", index);
  throwIfAborted(signal);
  if (!(bytes instanceof ArrayBuffer) || bytes.byteLength !== span.length) throw importError("parse-failed");
  return bytes;
}

/** parse가 소유한 JSON 사본만 바꾼다. 입력 GLB/JSON 바이트와 일반 URI 허용 범위는 바꾸지 않는다. */
export function createStudioBg3dGltfEmbeddedImagesPlugin(
  parser: GLTFParser,
  options: StudioBg3dGltfEmbeddedImagesOptions,
): GLTFLoaderPlugin {
  const fallbackImageUris = new Set<string>();
  let textureDefinitions: readonly unknown[] = [];
  return {
    name: "TOONSTUDIO_owned_embedded_images",
    async beforeRoot() {
      const { signal } = options;
      throwIfAborted(signal);
      const root: unknown = parser.json;
      if (!record(root)) throw importError("parse-failed");
      const images = table(root, "images", STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS);
      const views = table(root, "bufferViews", STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES);
      const buffers = table(root, "buffers", STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS);
      textureDefinitions = table(root, "textures", STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS);
      const referenced = referencedImages(parser, textureDefinitions);
      const pending: EmbeddedImage[] = [];
      const reservedViews = new Set<number>();
      let decodedBytes = 0, encodedBytes = 0;
      for (const [index, definition] of images.entries()) {
        throwIfAborted(signal);
        if (!referenced.has(index)) continue;
        if (!record(definition)) throw importError("parse-failed");
        if (definition.bufferView === undefined) continue;
        if (definition.uri !== undefined || !integer(definition.bufferView) || typeof definition.mimeType !== "string") {
          throw importError("parse-failed");
        }
        const view = views[definition.bufferView];
        if (!record(view) || !integer(view.buffer)) throw importError("parse-failed");
        const span = range(buffers[view.buffer], view.byteOffset === undefined ? 0 : view.byteOffset, view.byteLength);
        if (!reservedViews.has(definition.bufferView)) {
          encodedBytes = safeAddCount(encodedBytes, span.length, "image-memory-too-large");
          if (encodedBytes > STUDIO_BG3D_IMPORT_MAX_FILE_BYTES) throw importError("image-memory-too-large");
          reservedViews.add(definition.bufferView);
        }
        const bytes = await imageBytes(parser, buffers, view, definition.bufferView, signal);
        throwIfAborted(signal);
        const size = dimensions(definition.mimeType, new Uint8Array(bytes));
        if (size.width > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION || size.height > STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION) {
          throw importError("image-dimension-too-large");
        }
        decodedBytes = safeAddCount(decodedBytes, safeMultiplyCount(safeMultiplyCount(size.width, size.height,
          "image-memory-too-large"), 4, "image-memory-too-large"), "image-memory-too-large");
        if (decodedBytes > STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES) {
          throw importError("image-memory-too-large");
        }
        pending.push({ index, viewIndex: definition.bufferView, definition, mimeType: definition.mimeType, bytes });
      }
      if (pending.length === 0) return;
      const output = [...images], urls = new Map<number, string>();
      for (const image of pending) {
        throwIfAborted(signal);
        let uri = urls.get(image.viewIndex);
        if (uri === undefined) {
          uri = options.createOwnedObjectUrl(new Blob([image.bytes], { type: image.mimeType }));
          if (typeof uri !== "string" || !uri.startsWith("blob:")) throw importError("environment-unsupported");
          urls.set(image.viewIndex, uri);
        }
        throwIfAborted(signal);
        if (!image.definition.name) fallbackImageUris.add(uri);
        const replacement: Record<string, unknown> = { ...image.definition, uri };
        delete replacement.bufferView;
        output[image.index] = replacement;
      }
      throwIfAborted(signal);
      root.images = output;
    },
    afterRoot(result) {
      if (fallbackImageUris.size === 0) return null;
      // URI 교체로 loader가 보충한 임시 URL 이름만 되돌리고 원본의 명시적 이름은 보존한다.
      for (const [object, reference] of parser.associations) {
        // stock loader는 기본 재질을 복제할 때 association 값이 없는 항목도 남긴다.
        if (!record(reference) || !integer(reference.textures) || !fallbackImageUris.has(object.name)) continue;
        const definition = textureDefinitions[reference.textures];
        if (record(definition) && !definition.name) object.name = "";
      }
      // texCoord 변경으로 생긴 texture clone은 associations에 없을 수 있다.
      for (const scene of result.scenes) scene.traverse((object) => {
        const value: unknown = object;
        if (!record(value)) return;
        const materials: readonly unknown[] = Array.isArray(value.material) ? value.material : [value.material];
        for (const material of materials) {
          if (!record(material)) continue;
          for (const texture of Object.values(material)) {
            if (record(texture) && texture.isTexture === true && typeof texture.name === "string"
              && fallbackImageUris.has(texture.name)) texture.name = "";
          }
        }
      });
      return null;
    },
  };
}
