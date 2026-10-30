/**
 * 실제 GLTFLoader/Exporter·공개 SKP importer를 사용한다. Node에서 없는 bitmap/Canvas/FileReader만
 * 원본 바이트를 돌려주는 경계로 대체하므로 native decode·pixel·GPU 성공의 근거는 아니다.
 */
import { buildScene, create, parseSkp } from "openskp";
import { DoubleSide, FrontSide, Mesh, MeshStandardMaterial } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { afterEach, describe, expect, it, vi } from "vitest";

import { disposeStudioBg3dThreeResources } from "../studio-background-3d-model";
import { createStudioBg3dGltfEmbeddedImagesPlugin } from "./studio-bg3d-gltf-embedded-images";
import { createStudioBg3dTrackedLoadingManager } from "./studio-bg3d-import-loading-manager";
import { convertStudioBg3dModelFilesToGlb } from "./studio-bg3d-model-import";
import {
  STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_FILE_BYTES,
  STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES,
  STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION,
  STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS,
  importError,
} from "./studio-bg3d-model-import-shared";
import { encodeStudioBg3dSceneGlbRgbaPng } from "./studio-bg3d-scene-glb-exact-images";

import type { Object3D } from "three";
import type { GLTFLoaderPlugin, GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";

const NativeUrl = URL;
const openUrls = new Set<string>();
const roots: Object3D[] = [];

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function requiredRecord(value: unknown): Record<string, unknown> {
  if (!record(value)) throw new Error("fixture 객체가 없습니다.");
  return value;
}
function requiredArray(value: unknown): readonly unknown[] {
  if (!Array.isArray(value)) throw new Error("fixture 배열이 없습니다.");
  return value;
}
function png(): Uint8Array<ArrayBuffer> {
  return encodeStudioBg3dSceneGlbRgbaPng({ width: 1, height: 1, rgba: Uint8Array.from([20, 40, 60, 255]),
    signal: new AbortController().signal, maximumBytes: 4096, maximumRgbaBytes: 4 });
}
/** stock exporter의 image view는 원본 뒤를 4바이트 경계까지 정확히 0으로 채운다. */
function expectExportedPng(bytes: ArrayBuffer, image: Uint8Array<ArrayBuffer>, decoded: readonly Uint8Array<ArrayBuffer>[]): void {
  const padded = new Uint8Array(Math.ceil(image.length / 4) * 4); padded.set(image);
  expect(padded.length - image.length).toBeGreaterThan(0);
  expect(padded.length - image.length).toBeLessThan(4);
  const view = new DataView(bytes), jsonLength = view.getUint32(12, true);
  const json = requiredRecord(JSON.parse(new TextDecoder().decode(new Uint8Array(bytes, 20, jsonLength))));
  const images = requiredArray(json.images); expect(images).toHaveLength(1);
  const outputImage = requiredRecord(images[0]); expect(outputImage.mimeType).toBe("image/png");
  const imageViewId = outputImage.bufferView;
  if (typeof imageViewId !== "number" || !Number.isSafeInteger(imageViewId) || imageViewId < 0) throw new Error("최종 PNG bufferView 누락");
  const imageView = requiredRecord(requiredArray(json.bufferViews)[imageViewId]);
  expect(imageView.buffer).toBe(0); expect(imageView.byteLength).toBe(padded.length);
  const offset = imageView.byteOffset ?? 0;
  if (typeof offset !== "number" || !Number.isSafeInteger(offset) || offset < 0) throw new Error("최종 PNG offset 오류");
  const binHeader = 20 + jsonLength; expect(view.getUint32(binHeader + 4, true)).toBe(0x004e4942);
  const embedded = new Uint8Array(bytes, binHeader + 8 + offset, padded.length);
  expect(embedded).toEqual(padded);
  expect(embedded.subarray(0, image.length)).toEqual(image);
  expect([...embedded.subarray(image.length)]).toEqual(Array.from({ length: padded.length - image.length }, () => 0));
  expect(decoded).toEqual([image, padded]);
}
function header(width: number, height: number): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(24), view = new DataView(bytes.buffer);
  bytes.set([137, 80, 78, 71, 13, 10, 26, 10]);
  view.setUint32(16, width, false); view.setUint32(20, height, false);
  return bytes;
}
function deferred<T>() {
  let resolve: (value: T) => void = () => { throw new Error("Promise가 준비되지 않았습니다."); };
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

function fixture(options: {
  readonly imageBytes?: Uint8Array;
  readonly images?: readonly unknown[];
  readonly view?: Record<string, unknown>;
  readonly buffer?: Record<string, unknown>;
  readonly change?: (json: Record<string, unknown>) => void;
} = {}) {
  const image = options.imageBytes ?? png();
  const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  const uv = new Float32Array([0, 0, 1, 0, 0, 1]);
  const imageOffset = positions.byteLength + uv.byteLength;
  const binary = new Uint8Array(imageOffset + image.byteLength);
  binary.set(new Uint8Array(positions.buffer)); binary.set(new Uint8Array(uv.buffer), positions.byteLength);
  binary.set(image, imageOffset);
  const json: Record<string, unknown> = {
    asset: { version: "2.0" }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: binary.length, ...options.buffer }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength },
      { buffer: 0, byteOffset: positions.byteLength, byteLength: uv.byteLength },
      { buffer: 0, byteOffset: imageOffset, byteLength: image.byteLength, ...options.view }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5126, count: 3, type: "VEC2" }],
    images: options.images ?? [{ bufferView: 2, mimeType: "image/png" }], textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 }] }],
  };
  options.change?.(json);
  const encoded = new TextEncoder().encode(JSON.stringify(json));
  const jsonLength = Math.ceil(encoded.length / 4) * 4, binLength = Math.ceil(binary.length / 4) * 4;
  const bytes = new Uint8Array(12 + 8 + jsonLength + 8 + binLength), view = new DataView(bytes.buffer);
  view.setUint32(0, 0x46546c67, true); view.setUint32(4, 2, true); view.setUint32(8, bytes.length, true);
  view.setUint32(12, jsonLength, true); view.setUint32(16, 0x4e4f534a, true);
  bytes.fill(32, 20, 20 + jsonLength); bytes.set(encoded, 20);
  view.setUint32(20 + jsonLength, binLength, true); view.setUint32(24 + jsonLength, 0x004e4942, true);
  bytes.set(binary, 28 + jsonLength);
  return { bytes: bytes.buffer, json, image, imageOffset };
}

function owner() {
  const urls = new Map<string, Blob>();
  const createOwnedObjectUrl = vi.fn((blob: Blob): string => {
    const url = URL.createObjectURL(blob); urls.set(url, blob); return url;
  });
  const urlForUri = (uri: string): string => {
    if (urls.has(uri)) return uri;
    throw importError("unsafe-resource-uri");
  };
  return { urls, createOwnedObjectUrl, urlForUri };
}

async function load(bytes: ArrayBuffer, options: {
  readonly signal?: AbortSignal;
  readonly observe?: (json: unknown) => void;
  readonly dependencyPlugin?: (parser: GLTFParser) => GLTFLoaderPlugin;
} = {}) {
  const owned = owner(), tracked = await createStudioBg3dTrackedLoadingManager(owned);
  const loader = new GLTFLoader(tracked.manager);
  if (options.dependencyPlugin) loader.register(options.dependencyPlugin);
  loader.register((parser) => createStudioBg3dGltfEmbeddedImagesPlugin(parser, {
    createOwnedObjectUrl: owned.createOwnedObjectUrl, signal: options.signal,
  }));
  loader.register((parser) => ({ name: "TOONSTUDIO_test_observation", afterRoot: async () => { options.observe?.(parser.json); } }));
  const gltf = await loader.parseAsync(bytes, "");
  roots.push(...gltf.scenes);
  await tracked.waitForIdle(options.signal);
  return { gltf, owned, tracked };
}

/** 이미지 합성은 하지 않는다. exporter가 넘겨받은 bitmap의 원래 PNG bytes만 다시 봉인한다. */
function installImageBoundary(options: { readonly failDecode?: boolean; readonly onDecoded?: () => void } = {}) {
  const decoded: Uint8Array<ArrayBuffer>[] = [], created: string[] = [], revoked: string[] = [];
  const bitmaps: FixtureBitmap[] = [];
  class FixtureBitmap {
    readonly width = 1;
    readonly height = 1;
    closed = 0;
    constructor(readonly bytes: Uint8Array<ArrayBuffer>) {}
    close(): void { this.closed += 1; }
  }
  class FixtureCanvas {
    width = 1;
    height = 1;
    image: FixtureBitmap | null = null;
    getContext() {
      return { drawImage: (image: unknown): void => {
        if (!(image instanceof FixtureBitmap)) throw new Error("fixture bitmap이 아닙니다."); this.image = image;
      }, scale() {}, translate() {} };
    }
    toBlob(callback: (value: Blob | null) => void, type: string): void {
      const image = this.image;
      queueMicrotask(() => callback(image ? new Blob([image.bytes.buffer], { type }) : null));
    }
  }
  class FixtureReader {
    result: string | ArrayBuffer | null = null;
    onloadend: (() => void) | null = null;
    onerror: (() => void) | null = null;
    readAsArrayBuffer(blob: Blob): void {
      void blob.arrayBuffer().then((bytes) => { this.result = bytes; this.onloadend?.(); }, () => this.onerror?.());
    }
    readAsDataURL(blob: Blob): void {
      void blob.arrayBuffer().then((bytes) => {
        this.result = `data:${blob.type};base64,${Buffer.from(bytes).toString("base64")}`; this.onloadend?.();
      }, () => this.onerror?.());
    }
  }
  class FixtureUrl extends NativeUrl {
    static createObjectURL(blob: Blob): string {
      const url = NativeUrl.createObjectURL(blob); openUrls.add(url); created.push(url); return url;
    }
    static revokeObjectURL(url: string): void {
      revoked.push(url); openUrls.delete(url); NativeUrl.revokeObjectURL(url);
    }
  }
  vi.stubGlobal("URL", FixtureUrl); vi.stubGlobal("self", globalThis);
  vi.stubGlobal("ImageBitmap", FixtureBitmap); vi.stubGlobal("OffscreenCanvas", undefined);
  vi.stubGlobal("createImageBitmap", async (blob: Blob) => {
    if (options.failDecode) throw new Error("fixture native 이미지 경계 실패");
    const bytes = new Uint8Array(await blob.arrayBuffer()), bitmap = new FixtureBitmap(bytes);
    decoded.push(bytes); bitmaps.push(bitmap); options.onDecoded?.(); return bitmap;
  });
  vi.stubGlobal("HTMLCanvasElement", FixtureCanvas); vi.stubGlobal("FileReader", FixtureReader);
  vi.stubGlobal("document", { createElement: (name: string) => {
    if (name !== "canvas") throw new Error("fixture는 Canvas 경계만 제공합니다."); return new FixtureCanvas();
  } });
  vi.stubGlobal("ProgressEvent", class {
    constructor(readonly type: string, readonly init?: object) {}
  });
  return { decoded, created, revoked, bitmaps };
}

afterEach(() => {
  for (const root of roots.splice(0)) disposeStudioBg3dThreeResources(root);
  for (const url of openUrls) NativeUrl.revokeObjectURL(url);
  openUrls.clear(); vi.restoreAllMocks(); vi.unstubAllGlobals();
});

describe("공개 GLTFLoader embedded 이미지 소유권", () => {
  it("검증된 bytes의 owned URL만 생성하고 원본·mime·extras·extensions를 보존한다", async () => {
    const boundary = installImageBoundary();
    const f = fixture({ images: [{ bufferView: 2, mimeType: "image/png", name: "원본", extras: { label: "보존" },
      extensions: { TEST_source_metadata: { value: 7 } } }] });
    const before = new Uint8Array(f.bytes).slice(), jsonBefore = JSON.stringify(f.json);
    let parsed: unknown;
    const result = await load(f.bytes, { observe: (value) => { parsed = value; } });
    expect(result.owned.createOwnedObjectUrl).toHaveBeenCalledTimes(1);
    const blob = [...result.owned.urls.values()][0]; if (!blob) throw new Error("owned Blob 누락");
    expect(blob.type).toBe("image/png"); expect(new Uint8Array(await blob.arrayBuffer())).toEqual(f.image);
    expect(boundary.decoded).toEqual([f.image]); expect(boundary.created).toHaveLength(1);
    const image = requiredRecord(requiredArray(requiredRecord(parsed).images)[0]);
    expect(image).toEqual({ uri: boundary.created[0], mimeType: "image/png", name: "원본", extras: { label: "보존" },
      extensions: { TEST_source_metadata: { value: 7 } } });
    expect(new Uint8Array(f.bytes)).toEqual(before); expect(JSON.stringify(f.json)).toBe(jsonBefore);
    for (const url of result.owned.urls.keys()) URL.revokeObjectURL(url);
    expect(boundary.revoked).toEqual(boundary.created);
  });
  it("같은 이미지 view를 공유하는 선언은 URL 하나를 재사용한다", async () => {
    installImageBoundary();
    const result = await load(fixture({ images: [{ bufferView: 2, mimeType: "image/png" },
      { bufferView: 2, mimeType: "image/png", name: "같은 바이트" }],
    change: (json) => { json.textures = [{ source: 0 }, { source: 1 }]; } }).bytes);
    expect(result.owned.createOwnedObjectUrl).toHaveBeenCalledTimes(1);
  });
  it.each([0, 1])("UV 채널 %s의 texture와 clone에 내부 owned URI를 이름으로 남기지 않는다", async (channel) => {
    installImageBoundary(); const result = await load(fixture({ change: (json) => {
      json.materials = [{ pbrMetallicRoughness: { baseColorTexture: { index: 0, texCoord: channel } } }];
      json.meshes = [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1, TEXCOORD_1: 1 }, material: 0 }] }];
    } }).bytes);
    const names: string[] = [];
    result.gltf.scene.traverse((object) => {
      if (!(object instanceof Mesh)) return;
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
        if (material instanceof MeshStandardMaterial && material.map) names.push(material.map.name);
      }
    });
    expect(names).toEqual([""]);
  });
  it("이미지 없는 기존 GLB는 GPU·URL 생성 없이 통과한다", async () => {
    const boundary = installImageBoundary();
    const result = await load(fixture({ change: (json) => {
      delete json.images; delete json.textures;
      json.materials = [{ pbrMetallicRoughness: { metallicFactor: 0, roughnessFactor: 1 } }];
    } }).bytes);
    expect(result.gltf.scene.children).toHaveLength(1); expect(boundary.created).toHaveLength(0);
    expect(boundary.decoded).toHaveLength(0);
  });
  it("이미지와 명시 재질이 없는 기본 glTF 재질도 그대로 불러온다", async () => {
    const boundary = installImageBoundary();
    const result = await load(fixture({ change: (json) => {
      delete json.images; delete json.textures; delete json.materials;
      json.meshes = [{ primitives: [{ attributes: { POSITION: 0 } }] }];
    } }).bytes);
    const materials: MeshStandardMaterial[] = [];
    result.gltf.scene.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) materials.push(object.material);
    });
    expect(materials).toHaveLength(1); expect(materials[0]?.map).toBeNull();
    expect(boundary.created).toHaveLength(0); expect(boundary.decoded).toHaveLength(0);
  });
  it("텍스처 재질과 association 없는 기본 재질이 함께 있어도 둘 다 보존한다", async () => {
    const boundary = installImageBoundary();
    let hasDefaultMaterialAssociation = false;
    const result = await load(fixture({ change: (json) => {
      json.meshes = [{ primitives: [
        { attributes: { POSITION: 0, TEXCOORD_0: 1 }, material: 0 },
        { attributes: { POSITION: 0 } },
      ] }];
    } }).bytes, { dependencyPlugin: (parser) => ({
      name: "TOONSTUDIO_test_default_material_association",
      afterRoot: () => {
        hasDefaultMaterialAssociation = [...parser.associations.values()].some((reference: unknown) => reference === undefined);
        return null;
      },
    }) });
    const materials: MeshStandardMaterial[] = [];
    result.gltf.scene.traverse((object) => {
      if (object instanceof Mesh && object.material instanceof MeshStandardMaterial) materials.push(object.material);
    });
    expect(hasDefaultMaterialAssociation).toBe(true); expect(materials).toHaveLength(2);
    const textured = materials.filter((material) => material.map !== null);
    expect(textured).toHaveLength(1); expect(textured[0]?.map?.name).toBe("");
    expect(materials.filter((material) => material.map === null)).toHaveLength(1);
    expect(boundary.decoded).toEqual([png()]);
    expect(result.owned.createOwnedObjectUrl).toHaveBeenCalledTimes(1);
  });
  it("어떤 texture도 참조하지 않는 손상·비지원·대형 image는 복호화하거나 URL로 만들지 않는다", async () => {
    const boundary = installImageBoundary();
    const result = await load(fixture({ images: [{ bufferView: 2, mimeType: "image/png" },
      { bufferView: 999, mimeType: "image/avif" }, { bufferView: -1, mimeType: "image/ktx2" }, null,
      { bufferView: 3, mimeType: "image/png" }], change: (json) => {
      json.bufferViews = [...requiredArray(json.bufferViews), { buffer: 0, byteLength: STUDIO_BG3D_IMPORT_MAX_FILE_BYTES + 1 }];
    } }).bytes);
    expect(result.owned.createOwnedObjectUrl).toHaveBeenCalledTimes(1); expect(boundary.decoded).toEqual([png()]);
  });
  it("decoder가 없는 optional BasisU의 사용하지 않는 KTX2 대신 원래 core PNG fallback을 처리한다", async () => {
    const boundary = installImageBoundary();
    const result = await load(fixture({ images: [{ bufferView: 2, mimeType: "image/png" },
      { bufferView: 999, mimeType: "image/ktx2" }], change: (json) => {
      json.textures = [{ source: 0, extensions: { KHR_texture_basisu: { source: 1 } } }];
      json.extensionsUsed = ["KHR_texture_basisu"];
    } }).bytes);
    expect(result.owned.createOwnedObjectUrl).toHaveBeenCalledTimes(1); expect(boundary.decoded).toEqual([png()]);
  });
  it.each([
    { name: "잘린 선언 범위", options: { view: { byteLength: 1_000_000 } }, code: "parse-failed" },
    { name: "음수 offset", options: { view: { byteOffset: -1 } }, code: "parse-failed" },
    { name: "명시 null offset", options: { view: { byteOffset: null } }, code: "parse-failed" },
    { name: "분수 index", options: { images: [{ bufferView: 2.5, mimeType: "image/png" }] }, code: "parse-failed" },
    { name: "uri와 view 중복", options: { images: [{ bufferView: 2, uri: "blob:foreign", mimeType: "image/png" }] }, code: "parse-failed" },
    { name: "누락 MIME", options: { images: [{ bufferView: 2 }] }, code: "parse-failed" },
    { name: "잘린 실제 BIN", options: { buffer: { byteLength: 2_000 }, view: { byteOffset: 1_000, byteLength: 100 } }, code: "parse-failed" },
    { name: "잘못된 PNG", options: { imageBytes: new Uint8Array(32) }, code: "invalid-image" },
    { name: "초과 치수", options: { imageBytes: header(STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION + 1, 1) }, code: "image-dimension-too-large" },
  ])("$name를 URL 생성 전 거부한다", async ({ options, code }) => {
    const boundary = installImageBoundary(), f = fixture(options), before = new Uint8Array(f.bytes).slice();
    await expect(load(f.bytes)).rejects.toMatchObject({ code });
    expect(boundary.created).toHaveLength(0); expect(boundary.decoded).toHaveLength(0); expect(new Uint8Array(f.bytes)).toEqual(before);
  });
  it("누적 decoded 이미지 예산 초과는 URL을 만들지 않는다", async () => {
    const boundary = installImageBoundary();
    const width = STUDIO_BG3D_IMPORT_MAX_IMAGE_DIMENSION, height = STUDIO_BG3D_IMPORT_MAX_DECODED_IMAGE_BYTES / (width * 4);
    const f = fixture({ imageBytes: header(width, height), images: [{ bufferView: 2, mimeType: "image/png" }, { bufferView: 2, mimeType: "image/png" }],
      change: (json) => { json.textures = [{ source: 0 }, { source: 1 }]; } });
    await expect(load(f.bytes)).rejects.toMatchObject({ code: "image-memory-too-large" }); expect(boundary.created).toHaveLength(0);
  });
  it("큰 논리 이미지 view는 dependency 복호화 전에 예약 예산으로 거부한다", async () => {
    const boundary = installImageBoundary(), dependency = vi.fn(() => Promise.resolve(new ArrayBuffer(1)));
    const f = fixture({ buffer: { byteLength: STUDIO_BG3D_IMPORT_MAX_FILE_BYTES + 1_000 },
      view: { byteLength: STUDIO_BG3D_IMPORT_MAX_FILE_BYTES + 1 } });
    await expect(load(f.bytes, { dependencyPlugin: () => ({ name: "TOONSTUDIO_test_budget_view",
      loadBufferView: (index) => index === 2 ? dependency() : null }) })).rejects.toMatchObject({ code: "image-memory-too-large" });
    expect(dependency).not.toHaveBeenCalled(); expect(boundary.created).toHaveLength(0);
  });
  it.each(["images", "textures", "buffers", "bufferViews"])("%s 테이블 예산을 먼저 검사한다", async (key) => {
    const boundary = installImageBoundary(), limit = key === "bufferViews" ? STUDIO_BG3D_IMPORT_MAX_GLTF_TABLE_ENTRIES : STUDIO_BG3D_IMPORT_MAX_RESOURCE_RECORDS;
    const f = fixture({ change: (json) => { json[key] = Array.from({ length: limit + 1 }, () => ({})); } });
    await expect(load(f.bytes)).rejects.toMatchObject({ code: "image-memory-too-large" }); expect(boundary.created).toHaveLength(0);
  });
  it("공개 loadBufferView가 잘린 dependency를 반환해도 정확 byteLength 검사를 통과하지 못한다", async () => {
    const boundary = installImageBoundary();
    await expect(load(fixture().bytes, { dependencyPlugin: () => ({ name: "TOONSTUDIO_test_short_view",
      loadBufferView: (index) => index === 2 ? Promise.resolve(new ArrayBuffer(1)) : null }) }))
      .rejects.toMatchObject({ code: "parse-failed" }); expect(boundary.created).toHaveLength(0);
  });
  it("dependency 대기 중 취소되면 URL 생성과 parser 이미지 교체를 하지 않는다", async () => {
    const boundary = installImageBoundary(), controller = new AbortController(), entered = deferred<void>(), released = deferred<ArrayBuffer>();
    const f = fixture();
    const pending = load(f.bytes, { signal: controller.signal, dependencyPlugin: () => ({ name: "TOONSTUDIO_test_deferred_view",
      loadBufferView: (index) => { if (index !== 2) return null; entered.resolve(); return released.promise; } }) });
    await entered.promise; controller.abort(); released.resolve(new Uint8Array(f.image).buffer);
    await expect(pending).rejects.toMatchObject({ code: "aborted" }); expect(boundary.created).toHaveLength(0);
  });
  it("일반 입력의 비소유 blob URI를 허용하지 않고 실제 loader의 삼킨 실패도 추적한다", async () => {
    const boundary = installImageBoundary(), error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(load(fixture({ images: [{ uri: "blob:foreign" }] }).bytes)).rejects.toMatchObject({ code: "unsafe-resource-uri" });
    expect(boundary.created).toHaveLength(0); expect(boundary.decoded).toHaveLength(0); expect(error).toHaveBeenCalled();
  });
  it("이미지 경계의 비동기 오류도 무텍스처 성공으로 반환하지 않는다", async () => {
    installImageBoundary({ failDecode: true }); vi.spyOn(console, "error").mockImplementation(() => undefined);
    await expect(load(fixture().bytes)).rejects.toMatchObject({ code: "missing-resource" });
  });
  it("Meshopt optional fallback은 extensions 존재만으로 거부하지 않는다", async () => {
    const boundary = installImageBoundary(), f = fixture();
    const { gltf, owned } = await load(fixture({ view: { extensions: { EXT_meshopt_compression: {
      buffer: 0, byteOffset: f.imageOffset, byteLength: f.image.length, count: f.image.length, byteStride: 1, mode: "ATTRIBUTES",
    } } } }).bytes);
    expect(gltf.scene.children).toHaveLength(1); expect(owned.createOwnedObjectUrl).toHaveBeenCalledTimes(1);
    expect(boundary.decoded).toEqual([f.image]);
  });
  it("실제 SKP 고수준 API가 앞면 텍스처와 무재질 뒷면을 각각 보존한다", async () => {
    const boundary = installImageBoundary(), image = png(), builder = create();
    const material = builder.addTextureMaterial("자체 PNG", image, "owned.png", 1, 1, 1);
    builder.addFace([[0, 0, 0], [10, 0, 0], [0, 10, 0]], { material });
    const skp = new Uint8Array(builder.toBytes()).buffer, before = new Uint8Array(skp).slice();
    const parsed = parseSkp(skp), originalFace = parsed.root.faces[0];
    if (!originalFace) throw new Error("원본 면 누락");
    expect(originalFace.backMaterialId).toBeNull();
    const originalMaterial = originalFace.materialId === null ? undefined : parsed.materialsById.get(originalFace.materialId);
    if (!originalMaterial) throw new Error("원본 앞면 재질 누락");
    const backMaterial = buildScene(skp).gltfMaterials.find((value) =>
      requiredRecord(requiredRecord(value).pbrMetallicRoughness).baseColorTexture === undefined);
    const backFactor = requiredArray(requiredRecord(requiredRecord(backMaterial).pbrMetallicRoughness).baseColorFactor).map((value) => {
      if (typeof value !== "number") throw new Error("원본 뒷면 색·alpha 누락"); return value;
    });
    const outputs = await convertStudioBg3dModelFilesToGlb([new File([skp], "embedded.skp")], { executionBackend: "direct" });
    expect(outputs).toHaveLength(1); const output = outputs[0]; if (!output) throw new Error("최종 GLB 누락");
    const outputBytes = await output.arrayBuffer();
    const jsonLength = new DataView(outputBytes).getUint32(12, true);
    const outputJson = new TextDecoder().decode(new Uint8Array(outputBytes, 20, jsonLength));
    const outputImages = requiredArray(requiredRecord(JSON.parse(outputJson)).images);
    expect(outputImages).toHaveLength(1); expect(requiredRecord(outputImages[0]).mimeType).toBe("image/png");
    expect(boundary.created.every((uri) => !outputJson.includes(uri))).toBe(true);
    const final = await load(outputBytes);
    expect([...final.owned.urls.values()].map((blob) => blob.type)).toEqual(["image/png"]);
    const meshes: Mesh[] = [];
    final.gltf.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes.length).toBeGreaterThan(0);
    expect(meshes).toHaveLength(2);
    const sides: number[] = [];
    for (const mesh of meshes) {
      const mat = mesh.material;
      if (!(mat instanceof MeshStandardMaterial)) throw new Error("최종 단일 PBR 재질 누락");
      const normal = mesh.geometry.getAttribute("normal"), position = mesh.geometry.getAttribute("position");
      if (!normal || !position) throw new Error("최종 면 위치·normal 누락");
      const front = normal.getY(0) > 0; sides.push(front ? 1 : -1);
      expect(mat.side).toBe(FrontSide);
      for (let index = 0; index < normal.count; index += 1) expect(normal.getY(index)).toBeCloseTo(front ? 1 : -1, 6);
      const indices = mesh.geometry.getIndex(); expect(indices?.count ?? position.count).toBe(3);
      const triangle = [0, 1, 2].map((corner) => indices ? indices.getX(corner) : corner);
      if (triangle.some((id) => !Number.isSafeInteger(id) || id < 0 || id >= position.count)) throw new Error("최종 삼각형 index 오류");
      const [a, b, c] = triangle;
      if (a === undefined || b === undefined || c === undefined) throw new Error("최종 삼각형 누락");
      const abX = position.getX(b) - position.getX(a), abZ = position.getZ(b) - position.getZ(a);
      const acX = position.getX(c) - position.getX(a), acZ = position.getZ(c) - position.getZ(a);
      expect(Math.sign(abZ * acX - abX * acZ)).toBe(front ? 1 : -1);
      if (front) {
        expect(mat.map).not.toBeNull();
        expect(mat.color.toArray()).toEqual([originalMaterial.color.r / 255, originalMaterial.color.g / 255, originalMaterial.color.b / 255]);
        expect(mat.opacity).toBeCloseTo(originalMaterial.color.a / 255 * originalMaterial.transparency, 6);
        const uv = mesh.geometry.getAttribute("uv"); if (!uv) throw new Error("최종 앞면 UV 누락");
        for (let index = 0; index < position.count; index += 1) {
          expect(uv.getX(index)).toBeCloseTo(position.getX(index) / 0.0254, 5);
          expect(uv.getY(index)).toBeCloseTo(-position.getZ(index) / 0.0254, 5);
        }
      } else {
        expect(mat.map).toBeNull(); expect(mat.color.toArray()).toEqual(backFactor.slice(0, 3));
        const alpha = backFactor[3]; if (alpha === undefined) throw new Error("원본 뒷면 alpha 누락");
        expect(mat.opacity).toBeCloseTo(alpha, 6);
      }
    }
    expect(sides.toSorted()).toEqual([-1, 1]);
    expectExportedPng(outputBytes, image, boundary.decoded);
    expect(new Uint8Array(skp)).toEqual(before);
    expect(boundary.revoked.length).toBeGreaterThan(0);
  });
  it("양면에 같은 텍스처를 명시한 원본은 하나의 DoubleSide 재질과 이미지로 보존한다", async () => {
    const boundary = installImageBoundary(), image = png(), builder = create();
    const material = builder.addTextureMaterial("양면 PNG", image, "both.png", 1, 1, 1);
    builder.addFace([[0, 0, 0], [10, 0, 0], [0, 10, 0]], { material, backMaterial: material });
    const skp = new Uint8Array(builder.toBytes()).buffer, parsed = parseSkp(skp), face = parsed.root.faces[0];
    if (!face || face.materialId === null) throw new Error("원본 양면 재질 누락");
    expect(face.backMaterialId).toBe(face.materialId);
    const original = parsed.materialsById.get(face.materialId); if (!original) throw new Error("원본 재질 누락");
    const outputs = await convertStudioBg3dModelFilesToGlb([new File([skp], "both.skp")], { executionBackend: "direct" });
    const output = outputs[0]; if (!output) throw new Error("최종 GLB 누락");
    const outputBytes = await output.arrayBuffer(), final = await load(outputBytes), meshes: Mesh[] = [];
    final.gltf.scene.traverse((object) => { if (object instanceof Mesh) meshes.push(object); });
    expect(meshes).toHaveLength(1);
    const mat = meshes[0]?.material; if (!(mat instanceof MeshStandardMaterial)) throw new Error("최종 PBR 재질 누락");
    expect(mat.map).not.toBeNull(); expect(mat.side).toBe(DoubleSide);
    expect(mat.opacity).toBeCloseTo(original.color.a / 255 * original.transparency, 6);
    const normal = meshes[0]?.geometry.getAttribute("normal"); if (!normal) throw new Error("최종 양면 normal 누락");
    for (let index = 0; index < normal.count; index += 1) expect(normal.getY(index)).toBeCloseTo(1, 6);
    expect(final.owned.createOwnedObjectUrl).toHaveBeenCalledTimes(1);
    expectExportedPng(outputBytes, image, boundary.decoded);
  });
  it("고수준 binary GLB는 embedded plugin이나 새 MIME 검사 없이 기존 원본 passthrough를 유지한다", async () => {
    // 의도적으로 MIME가 다른 입력이다. 이후 strict validator의 KTX2 승인 근거로 사용하지 않는다.
    const f = fixture({ images: [{ bufferView: 2, mimeType: "image/ktx2" }] });
    const source = new File([f.bytes], "existing.glb", { type: "model/gltf-binary" });
    const outputs = await convertStudioBg3dModelFilesToGlb([source], { executionBackend: "direct" });
    expect(outputs).toEqual([source]); expect(new Uint8Array(await source.arrayBuffer())).toEqual(new Uint8Array(f.bytes));
  });
  it("고수준 이미지 완료 직후 취소해도 실제 생성 scene의 bitmap과 owned URL을 정리한다", async () => {
    const controller = new AbortController(), boundary = installImageBoundary({ onDecoded: () => controller.abort() });
    const builder = create(), material = builder.addTextureMaterial("자체 PNG", png(), "owned.png", 1, 1, 1);
    builder.addFace([[0, 0, 0], [10, 0, 0], [0, 10, 0]], { material });
    await expect(convertStudioBg3dModelFilesToGlb([new File([new Uint8Array(builder.toBytes()).buffer], "cancelled.skp")], {
      executionBackend: "direct", signal: controller.signal,
    })).rejects.toMatchObject({ code: "aborted" });
    expect(boundary.bitmaps.length).toBeGreaterThan(0); expect(boundary.bitmaps.every((bitmap) => bitmap.closed === 1)).toBe(true);
    expect(boundary.revoked).toEqual(boundary.created);
  });
});
