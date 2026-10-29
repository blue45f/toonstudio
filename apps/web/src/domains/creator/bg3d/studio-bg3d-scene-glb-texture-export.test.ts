// @vitest-environment jsdom
import { BoxGeometry, CanvasTexture, CompressedArrayTexture, CompressedTexture, DataTexture, HalfFloatType, Mesh,
  MeshStandardMaterial, RepeatWrapping, RGBA_S3TC_DXT1_Format, Scene, SIGNED_RG11_EAC_Format, SRGBColorSpace, Texture } from "three";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createStudioBg3dSceneGlbTextureExport, normalizeStudioBg3dSceneGlbTextureReadback, StudioBg3dSceneGlbTextureExportError } from "./studio-bg3d-scene-glb-texture-export";
import type { StudioBg3dSceneGlbPrivateTextureDecoder } from "./studio-bg3d-scene-glb-texture-export";

function compressed(width = 4, height = 4): CompressedTexture {
  return new CompressedTexture([{ data: new Uint8Array(Math.max(1, Math.ceil(width / 4) * Math.ceil(height / 4) * 8)).fill(71), width, height }], width, height, RGBA_S3TC_DXT1_Format);
}
function scene(...textures: Texture[]): Scene {
  const result = new Scene();
  for (const texture of textures) result.add(new Mesh(new BoxGeometry(), new MeshStandardMaterial({ map: texture })));
  return result;
}
function canvasTexture(width = 4, height = 4): CanvasTexture {
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  return new CanvasTexture(canvas);
}
function decoder(decompress: (texture: Texture, maximum: number) => CanvasTexture | Promise<CanvasTexture> = () => canvasTexture()) {
  const instance = { decompress: vi.fn(async (sampling: Texture, maximum: number) => {
    const texture = await decompress(sampling, maximum);
    return { texture, rgba: new Uint8Array(texture.image.width * texture.image.height * 4) };
  }), dispose: vi.fn() } satisfies StudioBg3dSceneGlbPrivateTextureDecoder;
  return { instance, factory: vi.fn(async () => instance) };
}
function deferred<T>() {
  let complete: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { complete = resolve; });
  return { promise, resolve(value: T) { if (!complete) throw Error("대기 결과 필요"); complete(value); } };
}
async function ticks() { await Promise.resolve(); await Promise.resolve(); }
const originalContext = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, "getContext");
let writtenPixels = new WeakMap<HTMLCanvasElement, Uint8Array>();
beforeEach(() => {
  writtenPixels = new WeakMap();
  // 실제 GPU는 대체하지 않는다. CPU RGBA→불투명 canvas의 write 경계만 관측한다.
  Object.defineProperty(HTMLCanvasElement.prototype, "getContext", { configurable: true, value(this: HTMLCanvasElement, kind: string) {
    if (kind !== "2d") return null;
    return { createImageData: (width: number, height: number) => ({ width, height, data: new Uint8ClampedArray(width * height * 4) }),
      putImageData: (image: { readonly data: Uint8ClampedArray }) => { writtenPixels.set(this, Uint8Array.from(image.data)); } };
  } });
});
afterEach(() => {
  if (originalContext) Object.defineProperty(HTMLCanvasElement.prototype, "getContext", originalContext);
});

describe("현재 장면 압축 텍스처의 개인 PNG export 수명", () => {
  it("기본 경로도 압축이 없으면 canvas나 GPU를 만들지 않는다", async () => {
    const createElement = vi.spyOn(document, "createElement");
    try {
      const support = await createStudioBg3dSceneGlbTextureExport(scene(new Texture()), { engine: "webgpu", signal: new AbortController().signal });
      await support.dispose(); expect(createElement).not.toHaveBeenCalled();
    } finally { createElement.mockRestore(); }
  });

  it("정리 예외가 있어도 나머지 decoded canvas와 개인 renderer를 모두 정리한다", async () => {
    const first = compressed(), second = compressed(), a = canvasTexture(), b = canvasTexture(); let index = 0;
    a.addEventListener("dispose", () => { throw Error("dispose listener"); }); const disposeB = vi.spyOn(b, "dispose");
    const gpu = decoder(() => index++ === 0 ? a : b);
    const support = await createStudioBg3dSceneGlbTextureExport(scene(first, second), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    await support.textureUtils.decompress(first); await support.textureUtils.decompress(second);
    await expect(support.dispose()).rejects.toBeInstanceOf(AggregateError);
    expect(disposeB).toHaveBeenCalledTimes(1); expect(gpu.instance.dispose).toHaveBeenCalledTimes(1);
    expect(a.image.width).toBe(0); expect(b.image.width).toBe(0);
  });
  it("압축 텍스처가 없으면 개인 renderer를 만들지 않고 일반 texture도 바꾸지 않는다", async () => {
    const original = new Texture(), gpu = decoder(), version = original.source.version;
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    expect(gpu.factory).not.toHaveBeenCalled(); await support.dispose(); await support.dispose();
    expect(original.source.version).toBe(version); expect(gpu.instance.dispose).not.toHaveBeenCalled();
  });

  it.each(["webgl", "webgpu"] as const)("%s: 원본 픽셀 크기·UV·sampler·색공간을 보존하고 원본 Source/캐시는 건드리지 않는다", async (engine) => {
    const original = compressed(8, 4); original.colorSpace = SRGBColorSpace; original.name = "원본 색";
    original.channel = 1; original.wrapS = RepeatWrapping; original.offset.set(0.2, 0.3); original.repeat.set(2, 3);
    original.rotation = 0.7; original.center.set(0.4, 0.6); original.updateMatrix(); original.matrixAutoUpdate = false;
    const image = original.image, source = original.source, mipmaps = original.mipmaps, data = Uint8Array.from(mipmaps[0].data);
    const version = source.version, textureVersion = original.version, disposeOriginal = vi.spyOn(original, "dispose");
    const result = canvasTexture(8, 4), disposeDecoded = vi.spyOn(result, "dispose");
    let copy: CompressedTexture | undefined;
    const gpu = decoder((sampling, maximum) => {
      if (!(sampling instanceof CompressedTexture)) throw Error("압축 sampling 사본 필요");
      copy = sampling; expect(sampling).not.toBe(original); expect(sampling.source).not.toBe(source);
      expect(sampling.image).not.toBe(image); expect(sampling.mipmaps).not.toBe(mipmaps);
      expect(sampling.mipmaps[0].data).not.toBe(mipmaps[0].data); expect(maximum).toBe(Infinity);
      expect(sampling.offset.toArray()).toEqual([0, 0]); expect(sampling.repeat.toArray()).toEqual([1, 1]);
      sampling.mipmaps[0].data[0] = 0; sampling.needsUpdate = true; return result;
    });
    const signal = new AbortController().signal;
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine, signal, createPrivateDecoder: gpu.factory });
    const actual = await support.textureUtils.decompress(original, Infinity);
    expect(gpu.factory).toHaveBeenCalledWith(engine, signal); expect(actual).toBe(result);
    expect(actual.image.width).toBe(8); expect(actual.image.height).toBe(4); expect(actual.colorSpace).toBe(SRGBColorSpace);
    expect(actual.name).toBe(original.name); expect(actual.channel).toBe(1); expect(actual.wrapS).toBe(RepeatWrapping);
    expect(actual.offset.equals(original.offset)).toBe(true); expect(actual.repeat.equals(original.repeat)).toBe(true);
    expect(actual.center.equals(original.center)).toBe(true); expect(actual.rotation).toBe(original.rotation);
    expect(actual.matrix.equals(original.matrix)).toBe(true); expect(actual.matrixAutoUpdate).toBe(false);
    expect(actual.userData).toEqual({ mimeType: "image/png" }); expect(copy).toBeDefined();
    expect(original.source).toBe(source); expect(original.image).toBe(image); expect(original.mipmaps).toBe(mipmaps);
    expect(original.source.version).toBe(version); expect(original.version).toBe(textureVersion); expect(original.mipmaps[0].data).toEqual(data);
    expect(disposeOriginal).not.toHaveBeenCalled(); expect(disposeDecoded).not.toHaveBeenCalled();
    await support.dispose(); await support.dispose();
    expect(disposeDecoded).toHaveBeenCalledTimes(1); expect(gpu.instance.dispose).toHaveBeenCalledTimes(1); expect(disposeOriginal).not.toHaveBeenCalled();
  });

  it("같은 압축 texture가 여러 재질에 쓰여도 decode 결과와 GPU 수명을 한 번만 소유한다", async () => {
    const original = compressed(), gpu = decoder();
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original, original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    const [first, second] = await Promise.all([support.textureUtils.decompress(original), support.textureUtils.decompress(original)]);
    expect(first).toBe(second); expect(gpu.instance.decompress).toHaveBeenCalledTimes(1);
    await support.dispose(); expect(gpu.instance.dispose).toHaveBeenCalledTimes(1);
  });

  it.each(["zero-size", "no-mips", "sparse", "mip-size", "hdr", "signed-compressed", "array"] as const)("준비되지 않았거나 PNG로 손실되는 %s는 GPU 생성 전에 거부한다", async (variant) => {
    let original: CompressedTexture = compressed();
    if (variant === "zero-size") original = compressed(0, 4);
    if (variant === "no-mips") original.mipmaps = [];
    if (variant === "sparse") original.mipmaps = Array(1);
    if (variant === "mip-size") original.mipmaps[0].width = 2;
    if (variant === "hdr") original.type = HalfFloatType;
    if (variant === "signed-compressed") original.format = SIGNED_RG11_EAC_Format;
    if (variant === "array") original = new CompressedArrayTexture([{ data: new Uint8Array(8), width: 4, height: 4 }], 4, 4, 2, RGBA_S3TC_DXT1_Format);
    const gpu = decoder();
    await expect(createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory }))
      .rejects.toMatchObject({ code: "texture-unavailable" });
    expect(gpu.factory).not.toHaveBeenCalled();
  });

  it("해상도 제한과 장면 밖 texture를 소리 없이 처리하지 않는다", async () => {
    const original = compressed(), gpu = decoder();
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    await expect(support.textureUtils.decompress(original, 2)).rejects.toMatchObject({ code: "texture-unavailable" });
    await expect(support.textureUtils.decompress(compressed())).rejects.toMatchObject({ code: "texture-unavailable" });
    expect(gpu.instance.decompress).not.toHaveBeenCalled(); await support.dispose();
  });

  it("decode가 축소된 이미지를 반환하면 결과와 개인 GPU를 정리하고 명시적으로 실패한다", async () => {
    const original = compressed(), result = canvasTexture(2, 2), disposeDecoded = vi.spyOn(result, "dispose"), gpu = decoder(() => result);
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    await expect(support.textureUtils.decompress(original)).rejects.toMatchObject({ code: "decode-failed", reason: "decoder-result-size-changed" });
    expect(disposeDecoded).toHaveBeenCalledTimes(1); expect(gpu.instance.dispose).toHaveBeenCalledTimes(1);
    await support.dispose(); expect(disposeDecoded).toHaveBeenCalledTimes(1);
  });

  it("개인 GPU 준비 실패를 다른 엔진 fallback이나 빈 PNG 성공으로 바꾸지 않는다", async () => {
    const factory = vi.fn(async () => { throw Error("GPU unavailable"); });
    await expect(createStudioBg3dSceneGlbTextureExport(scene(compressed()), { engine: "webgpu", signal: new AbortController().signal, createPrivateDecoder: factory }))
      .rejects.toMatchObject({ code: "gpu-unavailable" });
    expect(factory).toHaveBeenCalledTimes(1);
  });

  it("이미 취소된 요청은 GPU를 만들지 않는다", async () => {
    const controller = new AbortController(), gpu = decoder(); controller.abort();
    await expect(createStudioBg3dSceneGlbTextureExport(scene(compressed()), { engine: "webgl", signal: controller.signal, createPrivateDecoder: gpu.factory }))
      .rejects.toMatchObject({ code: "aborted" }); expect(gpu.factory).not.toHaveBeenCalled();
  });

  it("준비 중 취소 뒤 늦게 도착한 개인 GPU도 정리한다", async () => {
    const controller = new AbortController(), ready = deferred<StudioBg3dSceneGlbPrivateTextureDecoder>(), gpu = decoder();
    const preparing = createStudioBg3dSceneGlbTextureExport(scene(compressed()), { engine: "webgpu", signal: controller.signal, createPrivateDecoder: () => ready.promise });
    controller.abort(); ready.resolve(gpu.instance);
    await expect(preparing).rejects.toMatchObject({ code: "aborted" }); expect(gpu.instance.dispose).toHaveBeenCalledTimes(1);
  });

  it("취소 시 진행 중 decode의 물리 종료를 기다리고 늦은 결과·sampling만 정리한다", async () => {
    const controller = new AbortController(), original = compressed(), completed = deferred<CanvasTexture>();
    const result = canvasTexture(), disposeResult = vi.spyOn(result, "dispose"), disposeOriginal = vi.spyOn(original, "dispose");
    const disposedSampling = vi.fn(), gpu = decoder((sampling) => { sampling.addEventListener("dispose", disposedSampling); return completed.promise; });
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgpu", signal: controller.signal, createPrivateDecoder: gpu.factory });
    const decoding = support.textureUtils.decompress(original); await ticks(); controller.abort();
    const disposal = support.dispose(); expect(gpu.instance.dispose).not.toHaveBeenCalled(); expect(disposedSampling).not.toHaveBeenCalled();
    completed.resolve(result); await expect(decoding).rejects.toMatchObject({ code: "aborted" }); await disposal;
    expect(disposeResult).toHaveBeenCalledTimes(1); expect(disposedSampling).toHaveBeenCalledTimes(1);
    expect(gpu.instance.dispose).toHaveBeenCalledTimes(1); expect(disposeOriginal).not.toHaveBeenCalled();
  });

  it("decode 예외에도 sampling·개인 renderer를 정리하며 원본의 dispose는 호출하지 않는다", async () => {
    const original = compressed(), disposeOriginal = vi.spyOn(original, "dispose"), disposedSampling = vi.fn();
    const gpu = decoder((sampling) => { sampling.addEventListener("dispose", disposedSampling); throw Error("device lost"); });
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    await expect(support.textureUtils.decompress(original)).rejects.toBeInstanceOf(StudioBg3dSceneGlbTextureExportError);
    expect(disposedSampling).toHaveBeenCalledTimes(1); expect(gpu.instance.dispose).toHaveBeenCalledTimes(1); expect(disposeOriginal).not.toHaveBeenCalled();
    await expect(support.textureUtils.decompress(original)).rejects.toMatchObject({ code: "disposed" });
  });

  it("개인 renderer에서 두 texture를 동시에 렌더하지 않고 요청 순서대로 실행한다", async () => {
    const first = compressed(), second = compressed(), wait = deferred<CanvasTexture>(); let count = 0;
    const gpu = decoder(() => { count += 1; return count === 1 ? wait.promise : canvasTexture(); });
    const support = await createStudioBg3dSceneGlbTextureExport(scene(first, second), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    const a = support.textureUtils.decompress(first), b = support.textureUtils.decompress(second); await ticks();
    expect(count).toBe(1); wait.resolve(canvasTexture()); await Promise.all([a, b]); expect(count).toBe(2); await support.dispose();
  });

  it.each([false, true])("RGBA8 DataTexture의 alpha0/128 RGB·원래 행·flipY=%s는 GPU 없이 보관한다", async (flipY) => {
    const data = new Uint8Array([17, 33, 55, 0, 77, 99, 111, 128, 123, 145, 167, 255,
      211, 198, 176, 128, 154, 132, 110, 0, 88, 66, 44, 255]);
    const original = new DataTexture(data, 3, 2); original.flipY = flipY; original.colorSpace = SRGBColorSpace;
    const version = original.source.version, gpu = decoder();
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original, original), { engine: "webgpu", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    const [first, second] = await Promise.all([support.capture(original), support.capture(original)]);
    expect(first).toBe(second); expect(first.rgba).toEqual(data); expect(first.rgba).not.toBe(data);
    expect(first).toMatchObject({ width: 3, height: 2, rowOrder: "top-down" });
    expect(first.texture.flipY).toBe(flipY); expect(first.texture.colorSpace).toBe(SRGBColorSpace);
    const opaque = Uint8Array.from(data); for (let index = 3; index < opaque.length; index += 4) opaque[index] = 255;
    expect(writtenPixels.get(first.texture.image)).toEqual(opaque);
    expect(data[3]).toBe(0); expect(data[7]).toBe(128); expect(original.source.version).toBe(version);
    expect(gpu.factory).not.toHaveBeenCalled(); await support.dispose();
  });

  it("일반 image도 개인 backend로 한 번 읽고 capture와 compressed adapter의 scope를 구분한다", async () => {
    const image = document.createElement("canvas"); image.width = 3; image.height = 2;
    const original = new Texture(image), result = canvasTexture(3, 2), source = original.source;
    const sourceVersion = source.version, disposeCopy = vi.fn(), gpu = decoder((copy) => {
      expect(copy).not.toBe(original); expect(copy.source).not.toBe(source); expect(copy.image).toBe(image);
      expect(copy.offset.toArray()).toEqual([0, 0]); expect(copy.repeat.toArray()).toEqual([1, 1]);
      copy.addEventListener("dispose", disposeCopy); return result;
    });
    const signal = new AbortController().signal;
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original, original), { engine: "webgl", signal, createPrivateDecoder: gpu.factory });
    expect(gpu.factory).not.toHaveBeenCalled();
    const [first, second] = await Promise.all([support.capture(original), support.capture(original)]);
    expect(first).toBe(second); expect(first.texture).toBe(result); expect(first.texture.flipY).toBe(true);
    expect(gpu.factory).toHaveBeenCalledExactlyOnceWith("webgl", signal); expect(disposeCopy).toHaveBeenCalledOnce();
    expect(original.source).toBe(source); expect(source.version).toBe(sourceVersion);
    await expect(support.textureUtils.decompress(original)).rejects.toMatchObject({ code: "texture-unavailable" });
    await expect(support.capture(new Texture(image))).rejects.toMatchObject({ code: "texture-unavailable" });
    await support.dispose(); expect(gpu.instance.dispose).toHaveBeenCalledOnce();
  });

  it("Uint8ClampedArray도 RGBA8로 보존하고 premultiply DataTexture는 raw byte 성공으로 오인하지 않는다", async () => {
    const data = new Uint8ClampedArray([71, 93, 115, 0, 137, 159, 181, 128]);
    const original = new DataTexture(data, 2, 1), gpu = decoder();
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    expect((await support.capture(original)).rgba).toEqual(Uint8Array.from(data)); await support.dispose();
    const premultiplied = new DataTexture(data, 2, 1); premultiplied.premultiplyAlpha = true;
    const rejected = await createStudioBg3dSceneGlbTextureExport(scene(premultiplied), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    await expect(rejected.capture(premultiplied)).rejects.toMatchObject({ code: "texture-unavailable", reason: "premultiplied-data-texture-requires-gpu-sampling" });
    expect(gpu.factory).not.toHaveBeenCalled(); await rejected.dispose();
  });

  it("일반 image의 GPU 불가를 canvas 합성·다른 engine 성공으로 바꾸지 않는다", async () => {
    const image = document.createElement("canvas"); image.width = 3; image.height = 2;
    const original = new Texture(image), factory = vi.fn(async () => { throw Error("GPU unavailable"); });
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgpu", signal: new AbortController().signal, createPrivateDecoder: factory });
    await expect(support.capture(original)).rejects.toMatchObject({ code: "gpu-unavailable" });
    expect(factory).toHaveBeenCalledOnce(); await support.dispose();
  });

  it("잘못된 DataTexture byte 길이와 미준비 일반 image는 캡처를 발행하지 않는다", async () => {
    const original = new DataTexture(new Uint8Array(3), 3, 2), gpu = decoder();
    const support = await createStudioBg3dSceneGlbTextureExport(scene(original), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    await expect(support.capture(original)).rejects.toMatchObject({ code: "texture-unavailable" });
    expect(gpu.factory).not.toHaveBeenCalled();
    const empty = new Texture(), another = await createStudioBg3dSceneGlbTextureExport(scene(empty), { engine: "webgl", signal: new AbortController().signal, createPrivateDecoder: gpu.factory });
    await expect(another.capture(empty)).rejects.toMatchObject({ code: "texture-unavailable" });
    await support.dispose(); await another.dispose();
  });
});

describe("GPU readback의 행·pitch 정규화", () => {
  it.each([3, 5])("너비%d의 다중행 WebGPU padding은 PNG 픽셀에 섞이지 않는다", (width) => {
    const height = 3, stride = 256, rowBytes = width * 4;
    const input = new Uint8Array(stride * (height - 1) + rowBytes).fill(213), expected = new Uint8Array(rowBytes * height);
    for (let y = 0; y < height; y += 1) {
      const row = Uint8Array.from({ length: rowBytes }, (_, index) => y * 60 + index);
      input.set(row, y * stride); expected.set(row, y * rowBytes);
    }
    expect(normalizeStudioBg3dSceneGlbTextureReadback({ width, height, rgba: input, rowStrideBytes: stride, origin: "top-left" })).toEqual(expected);
    const bottomFirst = new Uint8Array(expected.length);
    for (let y = 0; y < height; y += 1) bottomFirst.set(expected.subarray(y * rowBytes, (y + 1) * rowBytes), (height - y - 1) * rowBytes);
    expect(normalizeStudioBg3dSceneGlbTextureReadback({ width, height, rgba: bottomFirst, rowStrideBytes: rowBytes, origin: "bottom-left" })).toEqual(expected);
    expect(input[rowBytes]).toBe(213);
  });
  it("부족한 stride나 잘린 마지막 행을 정상 이미지로 간주하지 않는다", () => {
    expect(() => normalizeStudioBg3dSceneGlbTextureReadback({ width: 3, height: 2, rgba: new Uint8Array(20), rowStrideBytes: 12, origin: "top-left" })).toThrow(StudioBg3dSceneGlbTextureExportError);
    expect(() => normalizeStudioBg3dSceneGlbTextureReadback({ width: 3, height: 2, rgba: new Uint8Array(20), rowStrideBytes: 10, origin: "top-left" })).toThrow(StudioBg3dSceneGlbTextureExportError);
  });
});
