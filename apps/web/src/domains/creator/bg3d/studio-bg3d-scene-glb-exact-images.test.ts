import { unzlibSync } from "fflate";
import { BoxGeometry, Mesh, MeshStandardMaterial, Scene, Texture } from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { describe, expect, it, vi } from "vitest";
import { pngChunkCrc32 } from "../studio-apng-encoder";
import { readStudioVrmExportGlb, writeStudioVrmExportGlb } from "../vrm/studio-vrm-export-glb-container";
import { createStudioBg3dSceneGlbImageReplacementRegistry, encodeStudioBg3dSceneGlbRgbaPng } from "./studio-bg3d-scene-glb-exact-images";

function options(maximumBytes = 1024 * 1024) { return { signal: new AbortController().signal, maximumBytes }; }
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function object(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) throw Error("object fixture 필요"); return value;
}
function array(value: unknown): unknown[] { if (!Array.isArray(value)) throw Error("array fixture 필요"); return value; }
function number(value: unknown): number { if (typeof value !== "number") throw Error("number fixture 필요"); return value; }
function png(rgba = new Uint8Array([23, 67, 191, 0])) {
  return encodeStudioBg3dSceneGlbRgbaPng({ ...options(), width: 1, height: 1, rgba });
}
function chunks(bytes: Uint8Array): Array<{ type: string; data: Uint8Array; crc: number }> {
  const result: Array<{ type: string; data: Uint8Array; crc: number }> = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength); let offset = 8;
  while (offset < bytes.length) {
    const length = view.getUint32(offset, false), type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    result.push({ type, data: bytes.subarray(offset + 8, offset + 8 + length), crc: view.getUint32(offset + 8 + length, false) });
    offset += length + 12;
  }
  return result;
}
function changeChunk(bytes: Uint8Array, type: string, change: (data: Uint8Array) => void): Uint8Array {
  const result = Uint8Array.from(bytes), view = new DataView(result.buffer); let offset = 8;
  while (offset < result.length) {
    const length = view.getUint32(offset, false), found = String.fromCharCode(...result.subarray(offset + 4, offset + 8));
    if (found === type) {
      const data = result.subarray(offset + 8, offset + 8 + length); change(data);
      view.setUint32(offset + 8 + length, pngChunkCrc32(type, data), false); return result;
    }
    offset += length + 12;
  }
  throw Error("변경할 PNG chunk 필요");
}
function fixture(mutate?: (json: Record<string, unknown>) => void) {
  const oldPng = png(new Uint8Array([255, 255, 255, 255])), binary = new Uint8Array(Math.ceil((44 + oldPng.length) / 4) * 4 + 1);
  new Float32Array(binary.buffer, 0, 9).set([0, 0, 0, 1, 0, 0, 0, 1, 0]);
  new Uint16Array(binary.buffer, 36, 3).set([0, 1, 2]); binary.set(oldPng, 44);
  const json: Record<string, unknown> = {
    asset: { version: "2.0", generator: "자체 삼각형 RGBA 경계 fixture" },
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36, target: 34962 },
      { buffer: 0, byteOffset: 36, byteLength: 6, target: 34963 }, { buffer: 0, byteOffset: 44, byteLength: oldPng.length }],
    accessors: [{ bufferView: 0, byteOffset: 0, componentType: 5126, count: 3, type: "VEC3", min: [0, 0, 0], max: [1, 1, 0] },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" }],
    images: [{ bufferView: 2, mimeType: "image/png", name: "교체 대상", extras: { keep: "원본 메타" } },
      { bufferView: 2, mimeType: "image/png", name: "기존 view를 공유하지만 교체하지 않는 이미지" }],
    textures: [{ source: 0, sampler: 0 }, { source: 1, sampler: 0 }],
    samplers: [{ wrapS: 10497, wrapT: 33071 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    nodes: [{ mesh: 0, translation: [2, 3, 4] }], scenes: [{ nodes: [0] }], scene: 0,
  };
  mutate?.(json); return { json, binary, bytes: writeStudioVrmExportGlb({ json, binary }) };
}
function registered(pngBytes = png(), required = true) {
  const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options()), texture = new Texture();
  registry.registerTexture(texture, pngBytes, { required }); registry.plugin.writeTexture?.(texture, { source: 0 });
  return { registry, texture };
}
function imageBytes(bytes: Uint8Array, index: number): Uint8Array {
  const { json, binary } = readStudioVrmExportGlb(bytes), image = object(array(json.images)[index]);
  const view = object(array(json.bufferViews)[number(image.bufferView)]);
  const start = number(view.byteOffset ?? 0); return binary.subarray(start, start + number(view.byteLength));
}

describe("Canvas를 거치지 않는 straight-alpha RGBA8 PNG", () => {
  it("alpha0·alpha128·opaque RGB와 행 순서를 deflate payload에 그대로 기록한다", () => {
    const rgba = new Uint8Array([255, 17, 91, 0, 35, 161, 247, 128, 1, 2, 3, 255, 253, 128, 64, 0]);
    const before = Uint8Array.from(rgba), bytes = encodeStudioBg3dSceneGlbRgbaPng({ ...options(), width: 2, height: 2, rgba });
    expect([...bytes.subarray(0, 8)]).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
    const parts = chunks(bytes); expect(parts.map(({ type }) => type)).toEqual(["IHDR", "IDAT", "IEND"]);
    for (const part of parts) expect(part.crc).toBe(pngChunkCrc32(part.type, part.data));
    const header = parts.find(({ type }) => type === "IHDR"), data = parts.find(({ type }) => type === "IDAT");
    if (!header || !data) throw Error("PNG chunk 필요");
    expect([...header.data]).toEqual([0, 0, 0, 2, 0, 0, 0, 2, 8, 6, 0, 0, 0]);
    expect([...unzlibSync(data.data)]).toEqual([0, ...rgba.subarray(0, 8), 0, ...rgba.subarray(8)]);
    expect(parts.find(({ type }) => type === "IEND")?.crc).toBe(0xae426082);
    expect(rgba).toEqual(before);
  });
  it("flipY만 한 번 적용하고 byteOffset이 있는 입력의 다른 바이트를 읽거나 쓰지 않는다", () => {
    const all = new Uint8Array([99, 98, 1, 2, 3, 0, 4, 5, 6, 128, 97]);
    const rgba = all.subarray(2, 10), before = Uint8Array.from(all);
    const bytes = encodeStudioBg3dSceneGlbRgbaPng({ ...options(), width: 1, height: 2, rgba, flipY: true });
    const data = chunks(bytes).find(({ type }) => type === "IDAT"); if (!data) throw Error("IDAT 필요");
    expect([...unzlibSync(data.data)]).toEqual([0, 4, 5, 6, 128, 0, 1, 2, 3, 0]); expect(all).toEqual(before);
  });
  it.each([[0, 1], [1, 0], [1.5, 1], [1, Number.NaN], [0x8000_0000, 1]])("잘못된 %s×%s 입력을 할당 전에 거부한다", (width, height) => {
    expect(() => encodeStudioBg3dSceneGlbRgbaPng({ ...options(), width, height, rgba: new Uint8Array(4) }))
      .toThrow(expect.objectContaining({ code: "invalid-rgba" }));
  });
  it("RGBA 길이·메모리·압축 파일 예산을 각각 거부하고 큰 RGBA 별도 예산을 허용한다", () => {
    expect(() => encodeStudioBg3dSceneGlbRgbaPng({ ...options(), width: 2, height: 1, rgba: new Uint8Array(4) }))
      .toThrow(expect.objectContaining({ code: "invalid-rgba" }));
    expect(() => encodeStudioBg3dSceneGlbRgbaPng({ ...options(), width: 1, height: 1, rgba: new Uint8Array(4), maximumRgbaBytes: 3 }))
      .toThrow(expect.objectContaining({ code: "budget-exceeded" }));
    expect(() => encodeStudioBg3dSceneGlbRgbaPng({ ...options(10), width: 1, height: 1, rgba: new Uint8Array(4) }))
      .toThrow(expect.objectContaining({ code: "budget-exceeded" }));
    expect(encodeStudioBg3dSceneGlbRgbaPng({ ...options(1024), width: 64, height: 64, rgba: new Uint8Array(64 * 64 * 4), maximumRgbaBytes: 64 * 64 * 4 }).length).toBeLessThan(1024);
  });
  it("취소된 PNG는 압축 전에 실패한다", () => {
    const abort = new AbortController(); abort.abort();
    expect(() => encodeStudioBg3dSceneGlbRgbaPng({ ...options(), signal: abort.signal, width: 1, height: 1, rgba: new Uint8Array(4) }))
      .toThrow(expect.objectContaining({ code: "aborted" }));
  });
});

describe("공개 writeTexture plugin과 최종 GLB 이미지 치환", () => {
  it("이미지가 없는 실제 exporter 장면은 이미지 표를 요구하지 않고 그대로 복사한다", async () => {
    class ExportFileReader {
      result: ArrayBuffer | null = null;
      onloadend: (() => void) | null = null;
      onerror: (() => void) | null = null;
      readAsArrayBuffer(blob: Blob) { void blob.arrayBuffer().then((value) => { this.result = value; this.onloadend?.(); }, () => this.onerror?.()); }
    }
    vi.stubGlobal("FileReader", ExportFileReader);
    const geometry = new BoxGeometry(), material = new MeshStandardMaterial(), scene = new Scene(); scene.add(new Mesh(geometry, material));
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options());
    try {
      const exporter = new GLTFExporter(); exporter.register(() => registry.plugin);
      const exported = await exporter.parseAsync(scene, { binary: true });
      if (!(exported instanceof ArrayBuffer)) throw Error("실제 binary GLB 필요");
      const bytes = new Uint8Array(exported), output = registry.replaceGlbImages(bytes);
      expect(readStudioVrmExportGlb(bytes).json.images).toBeUndefined(); expect(output).toEqual(bytes); expect(output).not.toBe(bytes);
    } finally { registry.dispose(); geometry.dispose(); material.dispose(); vi.unstubAllGlobals(); }
  });
  it("새 PNG view만 추가하고 모든 기존 accessor·view index·BIN prefix·이미지 공유를 보존한다", () => {
    const original = fixture(), beforeBytes = Uint8Array.from(original.bytes), beforeJson = JSON.stringify(original.json), exact = png();
    const { registry } = registered(exact), output = registry.replaceGlbImages(original.bytes);
    const parsed = readStudioVrmExportGlb(output), views = array(parsed.json.bufferViews), sourceViews = array(original.json.bufferViews);
    expect(views.slice(0, sourceViews.length)).toEqual(sourceViews); expect(views).toHaveLength(sourceViews.length + 1);
    expect(parsed.json.accessors).toEqual(original.json.accessors); expect(parsed.json.meshes).toEqual(original.json.meshes);
    expect(parsed.json.nodes).toEqual(original.json.nodes); expect(parsed.json.textures).toEqual(original.json.textures);
    expect(parsed.json.samplers).toEqual(original.json.samplers); expect(parsed.binary.subarray(0, original.binary.length)).toEqual(original.binary);
    expect(object(array(parsed.json.images)[0])).toMatchObject({ mimeType: "image/png", name: "교체 대상", extras: { keep: "원본 메타" }, bufferView: 3 });
    expect(object(array(parsed.json.images)[1]).bufferView).toBe(2);
    expect(imageBytes(output, 0)).toEqual(exact); expect(imageBytes(output, 1)).toEqual(imageBytes(original.bytes, 1));
    const appended = object(views[3]); expect(number(appended.byteOffset) % 4).toBe(0); expect(appended.byteLength).toBe(exact.length);
    expect(original.bytes).toEqual(beforeBytes); expect(JSON.stringify(original.json)).toBe(beforeJson);
  });
  it("plugin은 textureDef·원본 texture·전달된 PNG를 수정하지 않고 PNG 사본을 소유한다", () => {
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options()), texture = new Texture(), exact = png(), originalPng = Uint8Array.from(exact);
    texture.offset.set(0.2, 0.3); const version = texture.source.version, userData = texture.userData;
    registry.registerTexture(texture, exact, { required: true }); const textureDef = { source: 0, sampler: 4, extras: { keep: true } };
    registry.plugin.writeTexture?.(texture, textureDef); exact.fill(0);
    expect(imageBytes(registry.replaceGlbImages(fixture().bytes), 0)).toEqual(originalPng);
    expect(textureDef).toEqual({ source: 0, sampler: 4, extras: { keep: true } }); expect(texture.source.version).toBe(version);
    expect(texture.userData).toBe(userData); expect(texture.offset.toArray()).toEqual([0.2, 0.3]);
  });
  it("등록하지 않은 texture는 건드리지 않고 optional 미관측을 허용하되 required는 거부한다", () => {
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options()), optional = new Texture(), required = new Texture(), original = fixture();
    registry.plugin.writeTexture?.(new Texture(), {}); registry.registerTexture(optional, png());
    expect(registry.replaceGlbImages(original.bytes)).toEqual(original.bytes);
    registry.registerTexture(required, png(), { required: true });
    expect(() => registry.replaceGlbImages(original.bytes)).toThrow(expect.objectContaining({ code: "unobserved-texture" }));
  });
  it("동일 texture의 동일 PNG 재등록·required 승격과 같은 image의 동등 payload 공유를 허용한다", () => {
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options()), first = new Texture(), second = new Texture(), exact = png();
    registry.registerTexture(first, exact); registry.registerTexture(first, exact, { required: true }); registry.registerTexture(second, Uint8Array.from(exact));
    registry.plugin.writeTexture?.(first, { source: 0 }); registry.plugin.writeTexture?.(second, { source: 0 });
    expect(array(readStudioVrmExportGlb(registry.replaceGlbImages(fixture().bytes)).json.bufferViews)).toHaveLength(4);
  });
  it("같은 source index 또는 같은 texture에 다른 PNG를 배정하면 실패한다", () => {
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options()), first = new Texture(), second = new Texture();
    registry.registerTexture(first, png()); registry.registerTexture(second, png(new Uint8Array([1, 2, 3, 4])));
    registry.plugin.writeTexture?.(first, { source: 0 });
    expect(() => registry.plugin.writeTexture?.(second, { source: 0 })).toThrow(expect.objectContaining({ code: "conflicting-image" }));
    expect(() => registry.registerTexture(first, png(new Uint8Array([4, 3, 2, 1])))).toThrow(expect.objectContaining({ code: "conflicting-image" }));
  });
  it.each([-1, 0.5, "0", undefined, Number.NaN])("plugin의 잘못된 source %s를 거부한다", (source) => {
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options()), texture = new Texture(); registry.registerTexture(texture, png());
    expect(() => registry.plugin.writeTexture?.(texture, { source })).toThrow(expect.objectContaining({ code: "invalid-texture-source" }));
  });
  it.each(["offset", "length", "buffer", "image-view", "image-uri", "external-buffer", "multi-buffer"])("실제 GLB의 %s 손상은 원본을 바꾸지 않고 실패한다", (variant) => {
    const original = fixture((json) => {
      const first = object(array(json.bufferViews)[0]), image = object(array(json.images)[0]), buffer = object(array(json.buffers)[0]);
      if (variant === "offset") first.byteOffset = 1;
      if (variant === "length") first.byteLength = UINT32_MAX;
      if (variant === "buffer") first.buffer = 1;
      if (variant === "image-view") image.bufferView = 3;
      if (variant === "image-uri") image.uri = "https://invalid.example/image.png";
      if (variant === "external-buffer") buffer.uri = "file.bin";
      if (variant === "multi-buffer") array(json.buffers).push({ byteLength: 0 });
    });
    const before = Uint8Array.from(original.bytes), { registry } = registered();
    expect(() => registry.replaceGlbImages(original.bytes)).toThrow(expect.objectContaining({ code: "invalid-glb" })); expect(original.bytes).toEqual(before);
  });
  it("JSON의 외부 __proto__ 원문 키와 byte-offset 확장의 참조를 삭제하거나 재해석하지 않는다", () => {
    const original = fixture((json) => {
      json.extras = JSON.parse('{"__proto__":{"keep":"literal"},"constructor":"literal"}');
      object(array(json.bufferViews)[0]).extensions = { customAbsoluteOffset: { buffer: 0, byteOffset: 0, byteLength: 36 } };
    });
    // 기존 공통 writer의 키 정규화와 분리해 원문 GLB JSON chunk를 구성한다.
    const rawJson = new TextEncoder().encode(JSON.stringify(original.json)), jsonLength = Math.ceil(rawJson.length / 4) * 4, binaryLength = Math.ceil(original.binary.length / 4) * 4;
    const bytes = new Uint8Array(28 + jsonLength + binaryLength), header = new DataView(bytes.buffer);
    header.setUint32(0, 0x46546c67, true); header.setUint32(4, 2, true); header.setUint32(8, bytes.length, true);
    header.setUint32(12, jsonLength, true); header.setUint32(16, 0x4e4f534a, true); bytes.fill(32, 20, 20 + jsonLength); bytes.set(rawJson, 20);
    header.setUint32(20 + jsonLength, binaryLength, true); header.setUint32(24 + jsonLength, 0x004e4942, true); bytes.set(original.binary, 28 + jsonLength);
    const { registry } = registered(), parsed = readStudioVrmExportGlb(registry.replaceGlbImages(bytes));
    expect(JSON.stringify(parsed.json.extras)).toBe('{"__proto__":{"keep":"literal"},"constructor":"literal"}');
    expect(object(array(parsed.json.bufferViews)[0]).extensions).toEqual({ customAbsoluteOffset: { buffer: 0, byteOffset: 0, byteLength: 36 } });
    expect(parsed.binary.subarray(0, original.binary.length)).toEqual(original.binary);
  });
  it("PNG CRC 손상·등록 합계·최종 GLB·JSON chunk 예산을 각각 거부한다", () => {
    const damaged = png(); damaged[damaged.length - 1] = 0;
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options());
    expect(() => registry.registerTexture(new Texture(), damaged)).toThrow(expect.objectContaining({ code: "invalid-png" }));
    const exact = png(), small = createStudioBg3dSceneGlbImageReplacementRegistry(options(exact.length)); small.registerTexture(new Texture(), exact);
    expect(() => small.registerTexture(new Texture(), exact)).toThrow(expect.objectContaining({ code: "budget-exceeded" }));
    const original = fixture(), outputLimited = createStudioBg3dSceneGlbImageReplacementRegistry(options(original.bytes.length + exact.length - 1)), texture = new Texture();
    outputLimited.registerTexture(texture, exact); outputLimited.plugin.writeTexture?.(texture, { source: 0 });
    expect(() => outputLimited.replaceGlbImages(original.bytes)).toThrow(expect.objectContaining({ code: "budget-exceeded" }));
    const oversizedJson = Uint8Array.from(original.bytes); new DataView(oversizedJson.buffer).setUint32(12, 4 * 1024 * 1024 + 4, true);
    expect(() => registry.replaceGlbImages(oversizedJson)).toThrow(expect.objectContaining({ code: "budget-exceeded" }));
  });
  it("CRC가 맞아도 잘못된 inflate 길이·Adler checksum을 가진 PNG는 등록하지 않는다", () => {
    const registry = createStudioBg3dSceneGlbImageReplacementRegistry(options());
    const long = encodeStudioBg3dSceneGlbRgbaPng({ ...options(), width: 2, height: 1, rgba: new Uint8Array(8) });
    const overlong = changeChunk(long, "IHDR", (data) => new DataView(data.buffer, data.byteOffset, data.byteLength).setUint32(0, 1, false));
    expect(() => registry.registerTexture(new Texture(), overlong)).toThrow(expect.objectContaining({ code: "invalid-png", reason: "png-scanline-length" }));
    const checksum = changeChunk(png(), "IDAT", (data) => { data[data.length - 1] = ((data[data.length - 1] ?? 0) + 1) & 255; });
    expect(() => registry.registerTexture(new Texture(), checksum)).toThrow(expect.objectContaining({ code: "invalid-png" }));
  });
  it("GLB header·source index bounds·0이 아닌 BIN padding도 성공 파일로 반환하지 않는다", () => {
    const original = fixture(), { registry } = registered();
    expect(() => registry.replaceGlbImages(original.bytes.subarray(0, 15))).toThrow(expect.objectContaining({ code: "invalid-glb" }));
    const missing = createStudioBg3dSceneGlbImageReplacementRegistry(options()), texture = new Texture();
    missing.registerTexture(texture, png()); missing.plugin.writeTexture?.(texture, { source: 4 });
    expect(() => missing.replaceGlbImages(original.bytes)).toThrow(expect.objectContaining({ code: "invalid-glb" }));
    const badPadding = Uint8Array.from(original.bytes), parsed = readStudioVrmExportGlb(badPadding);
    if (parsed.layout.binPaddingBytes === 0) throw Error("padding fixture 필요"); badPadding[badPadding.length - 1] = 1;
    expect(() => registry.replaceGlbImages(badPadding)).toThrow(expect.objectContaining({ code: "invalid-glb", reason: "bin-padding-not-zero" }));
  });
  it("scope 취소와 dispose 뒤에는 등록·plugin·치환을 모두 거부한다", () => {
    const abort = new AbortController(), registry = createStudioBg3dSceneGlbImageReplacementRegistry({ ...options(), signal: abort.signal }), texture = new Texture();
    registry.registerTexture(texture, png()); abort.abort();
    expect(() => registry.plugin.writeTexture?.(texture, { source: 0 })).toThrow(expect.objectContaining({ code: "aborted" }));
    expect(() => registry.replaceGlbImages(fixture().bytes)).toThrow(expect.objectContaining({ code: "aborted" }));
    const disposed = createStudioBg3dSceneGlbImageReplacementRegistry(options()); disposed.dispose(); disposed.dispose();
    expect(() => disposed.registerTexture(texture, png())).toThrow(expect.objectContaining({ code: "disposed" }));
    expect(() => disposed.plugin.writeTexture?.(texture, { source: 0 })).toThrow(expect.objectContaining({ code: "disposed" }));
    expect(() => disposed.replaceGlbImages(fixture().bytes)).toThrow(expect.objectContaining({ code: "disposed" }));
  });
});

const UINT32_MAX = 0xffff_ffff;
