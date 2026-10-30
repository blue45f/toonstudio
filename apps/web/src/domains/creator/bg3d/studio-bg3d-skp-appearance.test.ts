/**
 * SK13/SK24 공개 baked/instanced API의 앞뒷면 appearance와 이미지 동치 회귀다.
 * 실제 PNG 인코더·CRC·RGBA 디코딩으로 같은 길이·헤더의 다른 이미지를 구분한다.
 * 공개 SkpBuilder가 만든 유효 SKP만 공개 baked/instanced API에 전달한다. 비공개 raw builder,
 * 새 export seam, DOM/GL, filesystem save, projected/Q 매핑은 사용하지 않는다.
 */
import { unzlibSync } from "fflate";
import {
  buildInstancedScene, buildScene, create, parseSkp,
  type Face, type LocalPrimitive, type Material, type Point3, type SceneTexture, type SkpModel, type UvPair,
} from "openskp";
import { describe, expect, it } from "vitest";

import { pngChunkCrc32 } from "../studio-apng-encoder";
import { encodeStudioBg3dSceneGlbRgbaPng } from "./studio-bg3d-scene-glb-exact-images";

type Mode = "baked" | "instanced";
const MODES: readonly Mode[] = ["baked", "instanced"];
const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

interface AppearanceScene {
  readonly primitives: readonly LocalPrimitive[];
  readonly materials: readonly unknown[];
  readonly textures: readonly SceneTexture[];
}

function sceneFor(mode: Mode, bytes: ArrayBuffer): AppearanceScene {
  if (mode === "baked") {
    const scene = buildScene(bytes);
    return { primitives: scene.glbPrimitives, materials: scene.gltfMaterials, textures: scene.textures };
  }
  const scene = buildInstancedScene(bytes);
  return { primitives: scene.meshResources.flatMap((resource) => resource.primitives),
    materials: scene.gltfMaterials, textures: scene.textures };
}

function rgbaPng(rgba: readonly [number, number, number, number]): Uint8Array {
  return encodeStudioBg3dSceneGlbRgbaPng({ width: 1, height: 1, rgba: Uint8Array.from(rgba),
    signal: new AbortController().signal, maximumBytes: 4096, maximumRgbaBytes: 4 });
}

/** 유효 tEXt chunk만 IEND 앞에 추가하여 압축률과 무관하게 두 PNG의 전체 길이를 맞춘다. */
function padPng(png: Uint8Array, totalBytes: number): Uint8Array {
  const payload = new Uint8Array(totalBytes - png.byteLength - 12);
  const keyword = new TextEncoder().encode("Fixture\0");
  if (payload.length < keyword.length) throw new Error("PNG padding 예산이 작습니다.");
  payload.set(keyword); payload.fill(120, keyword.length);
  const chunk = new Uint8Array(payload.length + 12), view = new DataView(chunk.buffer);
  view.setUint32(0, payload.length, false); chunk.set(new TextEncoder().encode("tEXt"), 4);
  chunk.set(payload, 8); view.setUint32(payload.length + 8, pngChunkCrc32("tEXt", payload), false);
  const output = new Uint8Array(totalBytes), beforeEnd = png.byteLength - 12;
  output.set(png.subarray(0, beforeEnd)); output.set(chunk, beforeEnd);
  output.set(png.subarray(beforeEnd), beforeEnd + chunk.length);
  return output;
}

/** 공개 pure encoder의 실제 RGBA8 PNG를 복호화하고 모든 chunk의 경계와 CRC도 검증한다. */
function pngPixel(png: Uint8Array): readonly number[] {
  expect(png.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  const compressed: Uint8Array[] = [];
  let offset = 8, hasHeader = false, hasEnd = false;
  while (offset < png.byteLength) {
    if (offset + 12 > png.byteLength) throw new Error("잘린 PNG chunk입니다.");
    const length = view.getUint32(offset, false), end = offset + 12 + length;
    if (end > png.byteLength) throw new Error("PNG chunk가 파일을 벗어납니다.");
    const type = new TextDecoder().decode(png.subarray(offset + 4, offset + 8));
    const payload = png.subarray(offset + 8, offset + 8 + length);
    expect(view.getUint32(offset + 8 + length, false)).toBe(pngChunkCrc32(type, payload));
    if (type === "IHDR") {
      expect(hasHeader).toBe(false); expect(offset).toBe(8); expect(length).toBe(13);
      const header = new DataView(payload.buffer, payload.byteOffset, payload.byteLength);
      expect(header.getUint32(0, false)).toBe(1); expect(header.getUint32(4, false)).toBe(1);
      expect(Array.from(payload.subarray(8))).toEqual([8, 6, 0, 0, 0]); hasHeader = true;
    } else if (type === "IDAT") compressed.push(payload);
    else if (type === "IEND") { expect(length).toBe(0); expect(end).toBe(png.byteLength); hasEnd = true; }
    offset = end;
  }
  expect(hasHeader).toBe(true); expect(hasEnd).toBe(true); expect(compressed.length).toBeGreaterThan(0);
  const body = new Uint8Array(compressed.reduce((sum, part) => sum + part.length, 0));
  let cursor = 0;
  for (const part of compressed) { body.set(part, cursor); cursor += part.length; }
  const raw = unzlibSync(body);
  expect(raw).toHaveLength(5); expect(raw[0]).toBe(0);
  return Array.from(raw.subarray(1));
}

function collisionPngs() {
  const first = rgbaPng([20, 40, 60, 255]), second = rgbaPng([80, 100, 120, 255]);
  const length = Math.max(first.byteLength, second.byteLength) + 20;
  const a = padPng(first, length), b = padPng(second, length);
  expect(a.byteLength).toBe(b.byteLength); expect(a.subarray(0, 16)).toEqual(b.subarray(0, 16));
  expect(a).not.toEqual(b);
  expect(pngPixel(a)).toEqual([20, 40, 60, 255]); expect(pngPixel(b)).toEqual([80, 100, 120, 255]);
  return { a, b };
}

function fileBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength); new Uint8Array(buffer).set(bytes); return buffer;
}

function triangle(x = 0): Point3[] { return [[x, 0, 0], [x + 10, 0, 0], [x, 10, 0]]; }

function uvPins(shiftU = 0, shiftV = 0): UvPair[] {
  return [[[0, 0, 0], [shiftU, shiftV]], [[10, 0, 0], [1 + shiftU, shiftV]], [[0, 10, 0], [shiftU, 1 + shiftV]]];
}

function faceFixture(options: {
  readonly frontPng: Uint8Array; readonly backPng: Uint8Array;
  readonly backOpacity?: number; readonly shiftedBackUv?: boolean;
}) {
  const builder = create();
  const front = builder.addTextureMaterial("front", options.frontPng, "front.png", 1, 1, 1);
  const back = builder.addTextureMaterial("back", options.backPng, "back.png", 1, 1, options.backOpacity ?? 1);
  builder.addFace(triangle(), { material: front, backMaterial: back, frontUv: uvPins(),
    backUv: options.shiftedBackUv ? uvPins(0.25, 0.5) : uvPins() });
  const bytes = fileBuffer(builder.toBytes()), parsed: SkpModel = parseSkp(bytes);
  expect(parsed.root.faces).toHaveLength(1); expect(parsed.root.vertices).toHaveLength(3);
  const face = parsed.root.faces[0];
  if (!face) throw new Error("공개 writer/parser의 실제 면이 없습니다.");
  const materials = faceMaterials(parsed, face);
  expect([materials.front.color.r, materials.front.color.g, materials.front.color.b])
    .toEqual([materials.back.color.r, materials.back.color.g, materials.back.color.b]);
  expect(face.uvProjected).toBe(false); expect(face.uvProjectedBack).toBe(false);
  expect(materials.front.texture?.data).toEqual(options.frontPng);
  expect(materials.back.texture?.data).toEqual(options.backPng);
  return { bytes, face, ...materials };
}

function faceMaterials(parsed: SkpModel, face: Face): { front: Material; back: Material } {
  const front = face.materialId === null ? undefined : parsed.materialsById.get(face.materialId);
  const back = face.backMaterialId === null ? undefined : parsed.materialsById.get(face.backMaterialId);
  if (!front || !back) throw new Error("실제 반환된 앞뒤 재질 핸들이 해석되지 않았습니다.");
  return { front, back };
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function appearance(scene: AppearanceScene, primitive: LocalPrimitive) {
  const material = scene.materials[primitive.materialIndex];
  if (!record(material) || !record(material.pbrMetallicRoughness)) throw new Error("glTF PBR 재질이 없습니다.");
  const pbr = material.pbrMetallicRoughness, rawFactor: unknown = pbr.baseColorFactor;
  if (!Array.isArray(rawFactor) || rawFactor.length !== 4) throw new Error("glTF baseColorFactor가 없습니다.");
  const factor: number[] = [];
  for (const component of rawFactor) {
    if (typeof component !== "number" || !Number.isFinite(component)) throw new Error("유효하지 않은 색 성분입니다.");
    factor.push(component);
  }
  const texture = pbr.baseColorTexture;
  if (!record(texture) || typeof texture.index !== "number" || !Number.isSafeInteger(texture.index)) {
    throw new Error("실제 texture index가 없습니다.");
  }
  return { factor, textureIndex: texture.index, doubleSided: material.doubleSided === true,
    alphaMode: material.alphaMode ?? "OPAQUE" };
}

function at(values: Float32Array | Uint32Array, index: number): number {
  const value = values[index];
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("primitive 배열 경계를 벗어났습니다.");
  return value;
}

function triangles(scene: AppearanceScene) {
  return scene.primitives.flatMap((primitive) => {
    expect(primitive.indices.length % 3).toBe(0);
    const result: { primitive: LocalPrimitive; vertices: readonly number[]; side: number }[] = [];
    for (let offset = 0; offset < primitive.indices.length; offset += 3) {
      const vertices = [at(primitive.indices, offset), at(primitive.indices, offset + 1), at(primitive.indices, offset + 2)];
      const normalY = vertices.map((index) => at(primitive.normals, index * 3 + 1));
      for (const value of normalY) expect(Math.abs(value)).toBeCloseTo(1, 6);
      const first = normalY[0];
      if (first === undefined) throw new Error("삼각형 법선이 없습니다.");
      expect(normalY.every((value) => Math.sign(value) === Math.sign(first))).toBe(true);
      const a = vertices[0], b = vertices[1], c = vertices[2];
      if (a === undefined || b === undefined || c === undefined) throw new Error("삼각형 인덱스가 없습니다.");
      const ax = at(primitive.positions, a * 3), az = at(primitive.positions, a * 3 + 2);
      const bx = at(primitive.positions, b * 3), bz = at(primitive.positions, b * 3 + 2);
      const cx = at(primitive.positions, c * 3), cz = at(primitive.positions, c * 3 + 2);
      expect(Math.sign((bz - az) * (cx - ax) - (bx - ax) * (cz - az))).toBe(Math.sign(first));
      result.push({ primitive, vertices, side: Math.sign(first) });
    }
    return result;
  });
}

function expectSide(scene: AppearanceScene, side: 1 | -1, material: Material, png: Uint8Array, shiftU = 0, shiftV = 0) {
  const matches = triangles(scene).filter((item) => item.side === side);
  expect(matches).toHaveLength(1);
  const match = matches[0];
  if (!match) throw new Error("앞뒤 중 한쪽 삼각형이 사라졌습니다.");
  const actual = appearance(scene, match.primitive);
  expect(actual.doubleSided).toBe(false);
  const color = material.color;
  expect(actual.factor.slice(0, 3)).toEqual([color.r / 255, color.g / 255, color.b / 255]);
  expect(actual.factor[3]).toBeCloseTo(color.a / 255 * material.transparency, 8);
  expect(scene.textures[actual.textureIndex]?.data).toEqual(png);
  for (const index of match.vertices) {
    const xInches = at(match.primitive.positions, index * 3) / 0.0254;
    const yInches = -at(match.primitive.positions, index * 3 + 2) / 0.0254;
    expect(at(match.primitive.uvs, index * 2)).toBeCloseTo(xInches / 10 + shiftU, 5);
    expect(at(match.primitive.uvs, index * 2 + 1)).toBeCloseTo(yInches / 10 + shiftV, 5);
  }
  return actual;
}

describe.each(MODES)("SK13/SK24 공개 %s appearance 보존", (mode) => {
  it("같은 RGB·image·alpha라도 다른 back affine UV는 별도 앞뒤 삼각형에 보존한다", () => {
    const png = rgbaPng([20, 40, 60, 255]); expect(pngPixel(png)).toEqual([20, 40, 60, 255]);
    const fixture = faceFixture({ frontPng: png, backPng: Uint8Array.from(png), shiftedBackUv: true });
    expect(fixture.face.uvTransform).not.toBeNull(); expect(fixture.face.uvTransformBack).not.toBeNull();
    expect(fixture.face.uvTransformBack).not.toEqual(fixture.face.uvTransform);
    const scene = sceneFor(mode, fixture.bytes);
    expect(scene.textures).toHaveLength(1); expect(triangles(scene)).toHaveLength(2);
    expectSide(scene, 1, fixture.front, png); expectSide(scene, -1, fixture.back, png, 0.25, 0.5);
  });

  it("같은 RGB·UV·alpha라도 서로 다른 back image는 앞뒤 texture 참조를 보존한다", () => {
    const { a, b } = collisionPngs(), fixture = faceFixture({ frontPng: a, backPng: b });
    const scene = sceneFor(mode, fixture.bytes);
    expect(scene.textures).toHaveLength(2); expect(triangles(scene)).toHaveLength(2);
    const front = expectSide(scene, 1, fixture.front, a), back = expectSide(scene, -1, fixture.back, b);
    expect(front.textureIndex).not.toBe(back.textureIndex);
  });

  it("같은 RGB·UV·image라도 다른 back alpha는 독립 PBR alpha로 남는다", () => {
    const png = rgbaPng([20, 40, 60, 255]);
    const fixture = faceFixture({ frontPng: png, backPng: Uint8Array.from(png), backOpacity: 0.4 });
    expect(fixture.front.transparency).toBeCloseTo(1, 8); expect(fixture.back.transparency).toBeCloseTo(0.4, 8);
    const scene = sceneFor(mode, fixture.bytes);
    expect(scene.textures).toHaveLength(1); expect(triangles(scene)).toHaveLength(2);
    const front = expectSide(scene, 1, fixture.front, png), back = expectSide(scene, -1, fixture.back, png);
    expect(front.factor[3]).not.toBe(back.factor[3]); expect(back.alphaMode).toBe("BLEND");
  });

  it("별도 두 면의 유효 PNG가 같은 길이·첫16byte여도 전체 내용이 다르면 합치지 않는다", () => {
    const { a, b } = collisionPngs(), builder = create();
    const first = builder.addTextureMaterial("first", a, "first.png", 1, 1, 1);
    const second = builder.addTextureMaterial("second", b, "second.png", 1, 1, 1);
    builder.addFace(triangle(), { material: first, backMaterial: first });
    builder.addFace(triangle(20), { material: second, backMaterial: second });
    const bytes = fileBuffer(builder.toBytes()), parsed: SkpModel = parseSkp(bytes);
    expect(parsed.root.faces).toHaveLength(2);
    const scene = sceneFor(mode, bytes);
    expect(scene.textures).toHaveLength(2); expect(scene.materials).toHaveLength(2);
    expect(scene.textures.map(({ data }) => Array.from(data))).toEqual([Array.from(a), Array.from(b)]);
    const all = triangles(scene);
    expect(all).toHaveLength(2);
    const minima = all.map(({ primitive, vertices }) => Math.min(...vertices.map((index) => at(primitive.positions, index * 3))) / 0.0254);
    const orderedMinima = [...minima].sort((left, right) => left - right);
    expect(orderedMinima[0]).toBeCloseTo(0, 5); expect(orderedMinima[1]).toBeCloseTo(20, 5);
    const texturesAtTriangle = all.map(({ primitive }) => appearance(scene, primitive).textureIndex);
    expect(new Set(texturesAtTriangle).size).toBe(2);
    for (let index = 0; index < all.length; index++) {
      const item = all[index], minimum = minima[index];
      if (!item || minimum === undefined) throw new Error("원본 면과 출력 삼각형의 대응이 없습니다.");
      const actual = appearance(scene, item.primitive), texture = scene.textures[actual.textureIndex];
      if (!texture) throw new Error("출력 삼각형의 텍스처가 없습니다.");
      const isFirst = Math.abs(minimum) < 1e-5;
      expect(actual.doubleSided).toBe(true);
      expect(texture.data).toEqual(isFirst ? a : b);
      expect(pngPixel(texture.data)).toEqual(isFirst ? [20, 40, 60, 255] : [80, 100, 120, 255]);
    }
    for (const texture of scene.textures) expect(texture.mimeType).toBe("image/png");
  });

  it("다른 material handle이어도 image·UV·RGB·alpha가 완전히 같으면 불필요한 양면 기하·image 중복을 만들지 않는다", () => {
    const png = rgbaPng([20, 40, 60, 255]);
    const fixture = faceFixture({ frontPng: png, backPng: Uint8Array.from(png) });
    expect(fixture.face.materialId).not.toBe(fixture.face.backMaterialId);
    expect(fixture.face.uvTransformBack).toEqual(fixture.face.uvTransform);
    const scene = sceneFor(mode, fixture.bytes), all = triangles(scene);
    expect(scene.textures).toHaveLength(1); expect(scene.materials).toHaveLength(1); expect(all).toHaveLength(1);
    const only = all[0];
    if (!only) throw new Error("동일 appearance의 실제 삼각형이 없습니다.");
    const actual = appearance(scene, only.primitive);
    expect(actual.doubleSided).toBe(true);
    expect(actual.factor).toEqual([fixture.front.color.r / 255, fixture.front.color.g / 255,
      fixture.front.color.b / 255, fixture.front.color.a / 255 * fixture.front.transparency]);
    expect(scene.textures[actual.textureIndex]?.data).toEqual(png);
    for (const index of only.vertices) {
      const xInches = at(only.primitive.positions, index * 3) / 0.0254;
      const yInches = -at(only.primitive.positions, index * 3 + 2) / 0.0254;
      expect(at(only.primitive.uvs, index * 2)).toBeCloseTo(xInches / 10, 5);
      expect(at(only.primitive.uvs, index * 2 + 1)).toBeCloseTo(yInches / 10, 5);
    }
  });
});
