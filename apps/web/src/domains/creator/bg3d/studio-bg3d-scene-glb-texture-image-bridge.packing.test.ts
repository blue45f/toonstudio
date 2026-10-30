// @vitest-environment jsdom
/** 실제 bridge·packer·PNG registry 회귀다. GPU와 실제 GLTFExporter 실행을 대신하지 않는다. */
import { BoxGeometry, CanvasTexture, ClampToEdgeWrapping, DataTexture, LinearFilter, LinearSRGBColorSpace, Mesh,
  MeshStandardMaterial, NearestFilter, NoColorSpace, Scene, SRGBColorSpace, Texture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzlibSync } from "fflate";
import { parsePngChunks } from "../studio-apng-encoder";
import { createStudioBg3dSceneGlbImageReplacementRegistry, encodeStudioBg3dSceneGlbRgbaPng } from "./studio-bg3d-scene-glb-exact-images";
import { prepareStudioBg3dSceneGlbTextureImages } from "./studio-bg3d-scene-glb-texture-image-bridge";
import type { MeshStandardMaterialParameters } from "three";
import type { StudioBg3dSceneGlbPreparedTextureImages, StudioBg3dSceneGlbTextureImageBridgeOptions } from "./studio-bg3d-scene-glb-texture-image-bridge";
import type { StudioBg3dSceneGlbTextureCapture, StudioBg3dSceneGlbTextureExportSupport } from "./studio-bg3d-scene-glb-texture-export";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); });
const LARGE_BUDGET = 1024 * 1024;
const SLOT_KEYS = ["roughnessMap", "metalnessMap", "aoMap"] as const;

function deferred<T>() {
  let finish: ((value: T) => void) | undefined;
  const promise = new Promise<T>((resolve) => { finish = resolve; });
  return { promise, resolve(value: T) { if (!finish) throw Error("실제 대기 Promise가 필요합니다."); finish(value); } };
}

function source(seed: number, width = 3, height = 5, flipY = false, colorSpace: Texture["colorSpace"] = NoColorSpace) {
  const rgba = new Uint8Array(width * height * 4);
  for (let pixel = 0; pixel < width * height; pixel += 1) {
    rgba[pixel * 4] = (seed + pixel) % 256;
    rgba[pixel * 4 + 1] = (seed + pixel * 3 + 5) % 256;
    rgba[pixel * 4 + 2] = (seed + pixel * 7 + 11) % 256;
    rgba[pixel * 4 + 3] = pixel % 3 === 0 ? 0 : pixel % 3 === 1 ? 128 : 255;
  }
  const originalData = Uint8Array.from(rgba), original = new DataTexture(originalData, width, height);
  const canvas = document.createElement("canvas"); canvas.width = width; canvas.height = height;
  const texture = new CanvasTexture(canvas);
  for (const current of [original, texture]) {
    current.colorSpace = colorSpace; current.flipY = flipY; current.minFilter = NearestFilter;
    current.magFilter = NearestFilter; current.generateMipmaps = false; current.premultiplyAlpha = false;
    current.wrapS = ClampToEdgeWrapping; current.wrapT = ClampToEdgeWrapping; current.anisotropy = 1; current.channel = 0;
    current.offset.set(0, 0); current.repeat.set(1, 1); current.center.set(0, 0); current.rotation = 0;
    current.matrixAutoUpdate = false; current.matrix.identity();
  }
  const capture: StudioBg3dSceneGlbTextureCapture = { texture, rgba, width, height, rowOrder: "top-down" };
  const originalDispose = vi.spyOn(original, "dispose"), captureDispose = vi.spyOn(texture, "dispose");
  cleanups.push(() => { original.dispose(); texture.dispose(); });
  return { original, originalData, capture, originalDispose, captureDispose };
}
type Source = ReturnType<typeof source>;
function material(parameters: MeshStandardMaterialParameters = {}) {
  const value = new MeshStandardMaterial(parameters); cleanups.push(() => value.dispose()); return value;
}
function descriptor(value: MeshStandardMaterial, key: typeof SLOT_KEYS[number]): PropertyDescriptor {
  const result = Object.getOwnPropertyDescriptor(value, key);
  if (!result || !("value" in result)) throw Error("실제 재질의 own data descriptor가 필요합니다.");
  return result;
}
function bindings(materials: readonly MeshStandardMaterial[]) {
  return materials.flatMap((value) => SLOT_KEYS.map((key) => ({ material: value, key, descriptor: descriptor(value, key) })));
}
function expectBindings(expected: ReturnType<typeof bindings>) {
  for (const entry of expected) expect(Object.getOwnPropertyDescriptor(entry.material, entry.key)).toEqual(entry.descriptor);
}
function sourceState(value: Source) {
  const texture = value.original;
  return { source: texture.source, image: texture.image, version: texture.version, sourceVersion: texture.source.version,
    bytes: Uint8Array.from(value.originalData), capturedBytes: Uint8Array.from(value.capture.rgba),
    colorSpace: texture.colorSpace, flipY: texture.flipY, offset: texture.offset.toArray(), repeat: texture.repeat.toArray(),
    center: texture.center.toArray(), rotation: texture.rotation, matrix: texture.matrix.toArray(),
    minFilter: texture.minFilter, magFilter: texture.magFilter, wrapS: texture.wrapS, wrapT: texture.wrapT,
    generateMipmaps: texture.generateMipmaps, mipmaps: texture.mipmaps };
}
function harness(materials: readonly MeshStandardMaterial[], sources: readonly Source[], maximumRgbaBytes = LARGE_BUDGET, maximumBytes = LARGE_BUDGET) {
  const controller = new AbortController(), root = new Scene(), geometry = new BoxGeometry();
  for (const value of materials) root.add(new Mesh(geometry, value));
  const byTexture = new Map<Texture, StudioBg3dSceneGlbTextureCapture>();
  for (const value of sources) byTexture.set(value.original, value.capture);
  const capture = vi.fn<StudioBg3dSceneGlbTextureExportSupport["capture"]>(async (texture) => {
    const value = byTexture.get(texture);
    if (!value) throw Error("새 packed texture나 capture를 다시 캡처하면 안 됩니다.");
    return value;
  });
  const support: StudioBg3dSceneGlbTextureExportSupport = { capture,
    textureUtils: { decompress: async () => { throw Error("이 회귀는 원래 texture의 raw capture만 허용합니다."); } },
    dispose: vi.fn<StudioBg3dSceneGlbTextureExportSupport["dispose"]>().mockResolvedValue(undefined) };
  const registry = createStudioBg3dSceneGlbImageReplacementRegistry({ signal: controller.signal, maximumBytes, maximumRgbaBytes });
  const registerOriginal = registry.registerTexture.bind(registry), register = vi.spyOn(registry, "registerTexture");
  const registryDispose = vi.spyOn(registry, "dispose"), assertCurrent = vi.fn<() => void>();
  const options: StudioBg3dSceneGlbTextureImageBridgeOptions = { root, support, registry, signal: controller.signal,
    maximumBytes, maximumRgbaBytes, assertCurrent };
  cleanups.push(() => { registry.dispose(); geometry.dispose(); });
  return { materials, sources, controller, capture, support, registry, registryDispose, register, registerOriginal,
    assertCurrent, options, originalBindings: bindings(materials) };
}
type Harness = ReturnType<typeof harness>;
async function prepare(f: Harness, overrides: Partial<StudioBg3dSceneGlbTextureImageBridgeOptions> = {}): Promise<StudioBg3dSceneGlbPreparedTextureImages> {
  const result = await prepareStudioBg3dSceneGlbTextureImages({ ...f.options, ...overrides });
  cleanups.push(() => result.dispose()); return result;
}
function borrowedAlive(f: Harness) {
  expect(f.support.dispose).not.toHaveBeenCalled(); expect(f.registryDispose).not.toHaveBeenCalled();
  for (const value of f.sources) {
    expect(value.originalDispose).not.toHaveBeenCalled(); expect(value.captureDispose).not.toHaveBeenCalled();
  }
  for (const [texture] of f.capture.mock.calls) expect(f.sources.some((value) => value.original === texture)).toBe(true);
}
function packedTexture(value: MeshStandardMaterial): DataTexture {
  if (!(value.roughnessMap instanceof DataTexture) || value.roughnessMap !== value.metalnessMap) throw Error("두 MR slot의 같은 개인 DataTexture가 필요합니다.");
  return value.roughnessMap;
}
function registration(f: Harness, texture: Texture) {
  const calls = f.register.mock.calls.filter((call) => call[0] === texture);
  expect(calls).toHaveLength(1);
  const call = calls[0]; if (!call) throw Error("실제 PNG registry 등록이 필요합니다.");
  expect(call[2]?.required).toBe(true); return call[1];
}
function decodePng(png: Uint8Array, width: number, height: number): number[] {
  const chunks = parsePngChunks(png), header = chunks.find((chunk) => chunk.type === "IHDR");
  if (!header) throw Error("실제 RGBA PNG header가 필요합니다.");
  const view = new DataView(header.data.buffer, header.data.byteOffset, header.data.byteLength);
  expect(view.getUint32(0, false)).toBe(width); expect(view.getUint32(4, false)).toBe(height);
  expect([...header.data.subarray(8, 10)]).toEqual([8, 6]);
  const parts = chunks.filter((chunk) => chunk.type === "IDAT"), compressed = new Uint8Array(parts.reduce((sum, part) => sum + part.data.length, 0));
  let offset = 0; for (const part of parts) { compressed.set(part.data, offset); offset += part.data.length; }
  const scanlines = unzlibSync(compressed), stride = width * 4, rgba: number[] = [];
  expect(scanlines.length).toBe((stride + 1) * height);
  for (let row = 0; row < height; row += 1) {
    expect(scanlines[row * (stride + 1)]).toBe(0);
    rgba.push(...scanlines.subarray(row * (stride + 1) + 1, (row + 1) * (stride + 1)));
  }
  return rgba;
}
function expectedChannels(roughness: Source | null, metalness: Source | null): number[] {
  const reference = roughness ?? metalness; if (!reference) throw Error("실제 입력 map이 필요합니다.");
  const { width, height } = reference.capture, expected: number[] = [];
  for (let row = 0; row < height; row += 1) {
    for (let column = 0; column < width; column += 1) {
      const roughRow = roughness?.capture.texture.flipY ? height - row - 1 : row;
      const metalRow = metalness?.capture.texture.flipY ? height - row - 1 : row;
      expected.push(255, roughness ? roughness.capture.rgba[(roughRow * width + column) * 4 + 1] : 255,
        metalness ? metalness.capture.rgba[(metalRow * width + column) * 4 + 2] : 255, 255);
    }
  }
  return expected;
}

describe("실제 장면 이미지 bridge의 개인 MR packing", () => {
  it("alpha0/128의 3×5 raw G/B와 서로 다른 flipY를 실제 PNG에 한 번만 반영한다", async () => {
    const rough = source(7, 3, 5, true), metal = source(101, 3, 5, false, LinearSRGBColorSpace);
    const value = material({ roughnessMap: rough.original, metalnessMap: metal.original, roughness: 0.37, metalness: 0.63 });
    const before = [sourceState(rough), sourceState(metal)], f = harness([value], [rough, metal], 180);
    const result = await prepare(f), packed = packedTexture(value), png = registration(f, packed);
    expect(f.capture).toHaveBeenCalledTimes(2);
    expect(packed).not.toBe(rough.original); expect(packed).not.toBe(metal.original);
    expect(packed).not.toBe(rough.capture.texture); expect(packed).not.toBe(metal.capture.texture);
    expect(packed.flipY).toBe(false); expect(packed.colorSpace).toBe(NoColorSpace);
    const decoded = decodePng(png, 3, 5);
    expect(decoded).toEqual(expectedChannels(rough, metal));
    expect(decoded.slice(0, 12)).toEqual([255, 48, 112, 255, 255, 51, 119, 255, 255, 54, 126, 255]);
    expect(value.roughness).toBe(0.37); expect(value.metalness).toBe(0.63);
    expect([sourceState(rough), sourceState(metal)]).toEqual(before); borrowedAlive(f);
    const disposed = vi.fn(); packed.addEventListener("dispose", disposed);
    result.dispose(); result.dispose(); expect(disposed).toHaveBeenCalledOnce(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it.each(["roughness", "metalness"] as const)("%s-only도 없는 채널을 255로 채우고 양 slot에 같은 pointer를 설치한다", async (kind) => {
    const input = source(17), value = material({ roughness: 0.29, metalness: 0.71 });
    if (kind === "roughness") value.roughnessMap = input.original; else value.metalnessMap = input.original;
    const f = harness([value], [input], 120), result = await prepare(f), packed = packedTexture(value);
    expect(f.capture).toHaveBeenCalledExactlyOnceWith(input.original);
    expect(decodePng(registration(f, packed), 3, 5)).toEqual(expectedChannels(kind === "roughness" ? input : null, kind === "metalness" ? input : null));
    expect(value.roughness).toBe(0.29); expect(value.metalness).toBe(0.71);
    result.dispose(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("같은 MR pointer는 추가 packed 할당 없이 capture identity를 공유한다", async () => {
    const input = source(31), value = material({ roughnessMap: input.original, metalnessMap: input.original, aoMap: input.original });
    const f = harness([value], [input], 60), disposed = vi.spyOn(Texture.prototype, "dispose"), result = await prepare(f);
    expect(value.roughnessMap).toBe(input.capture.texture); expect(value.metalnessMap).toBe(input.capture.texture); expect(value.aoMap).toBe(input.capture.texture);
    expect(f.capture).toHaveBeenCalledExactlyOnceWith(input.original); registration(f, input.capture.texture);
    result.dispose(); result.dispose(); expect(disposed).not.toHaveBeenCalled(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("map 없는 재질은 capture·PNG·packed owner 없이 idempotent 해제한다", async () => {
    const f = harness([material()], [], 0), disposed = vi.spyOn(Texture.prototype, "dispose"), result = await prepare(f);
    expect(f.capture).not.toHaveBeenCalled(); expect(f.register).not.toHaveBeenCalled();
    result.dispose(); result.dispose(); expect(disposed).not.toHaveBeenCalled(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("여러 재질의 같은 ordered pair는 한 allocation만 쓰고 AO는 독립 capture PNG를 유지한다", async () => {
    const rough = source(7, 3, 5, true), metal = source(101);
    const first = material({ roughnessMap: rough.original, metalnessMap: metal.original, roughness: 0.2 });
    const second = material({ roughnessMap: rough.original, metalnessMap: metal.original, roughness: 0.8, aoMap: rough.original, aoMapIntensity: 0.73 });
    const f = harness([first, second, first], [rough, metal], 180), result = await prepare(f), packed = packedTexture(first);
    expect(packedTexture(second)).toBe(packed); expect(f.capture).toHaveBeenCalledTimes(2);
    expect(second.aoMap).toBe(rough.capture.texture); expect(second.aoMap).not.toBe(packed); expect(second.aoMapIntensity).toBe(0.73);
    expect(first.roughness).toBe(0.2); expect(second.roughness).toBe(0.8);
    const aoPixels = decodePng(registration(f, rough.capture.texture), 3, 5);
    expect(aoPixels.slice(0, 12)).toEqual([...rough.capture.rgba.slice(48, 60)]);
    expect(aoPixels[0]).not.toBe(255); expect(aoPixels[3]).toBe(0); registration(f, packed);
    const disposed = vi.fn(); packed.addEventListener("dispose", disposed);
    result.dispose(); result.dispose(); expect(disposed).toHaveBeenCalledOnce(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("R/M을 바꾼 pair는 메모 키를 섞지 않고 각각 다른 G/B를 만든다", async () => {
    const rough = source(7), metal = source(101), first = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const second = material({ roughnessMap: metal.original, metalnessMap: rough.original });
    const f = harness([first, second], [rough, metal], 240), result = await prepare(f);
    const a = packedTexture(first), b = packedTexture(second); expect(a).not.toBe(b); expect(f.capture).toHaveBeenCalledTimes(2);
    expect(decodePng(registration(f, a), 3, 5)).toEqual(expectedChannels(rough, metal));
    expect(decodePng(registration(f, b), 3, 5)).toEqual(expectedChannels(metal, rough));
    result.dispose(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("원래 raw 총합이 1 byte 넘으면 capture나 packed allocation을 시작하지 않는다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal], 119), disposed = vi.spyOn(Texture.prototype, "dispose");
    await expect(prepare(f)).rejects.toMatchObject({ code: "budget-exceeded", reason: "cumulative-rgba-over-budget" });
    expect(f.capture).not.toHaveBeenCalled(); expect(f.register).not.toHaveBeenCalled(); expect(disposed).not.toHaveBeenCalled();
    expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("원본 120+packed 60 byte의 한도보다 1 byte 부족하면 추가 할당 전에 거부한다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal], 179), disposed = vi.spyOn(Texture.prototype, "dispose");
    await expect(prepare(f)).rejects.toMatchObject({ code: "budget-exceeded", reason: "additional-rgba-over-budget" });
    expect(f.capture).toHaveBeenCalledTimes(2); expect(f.register).not.toHaveBeenCalled(); expect(disposed).not.toHaveBeenCalled();
    expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("모든 capture가 끝나기 전에는 먼저 읽은 material도 교체하지 않는다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), started = deferred<void>(), pending = deferred<StudioBg3dSceneGlbTextureCapture>();
    f.capture.mockImplementation(async (texture) => {
      if (texture === metal.original) { started.resolve(undefined); return pending.promise; }
      if (texture !== rough.original) throw Error("원래 texture만 capture할 수 있습니다."); return rough.capture;
    });
    const preparing = prepare(f); await started.promise;
    expectBindings(f.originalBindings); expect(f.register).not.toHaveBeenCalled();
    pending.resolve(metal.capture); const result = await preparing;
    packedTexture(value); result.dispose(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("모든 실제 PNG 등록과 최종 check가 끝나기 전에는 binding을 설치하지 않는다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original, aoMap: rough.original });
    const f = harness([value], [rough, metal]); let registered = 0;
    f.register.mockImplementation((texture, png, options) => {
      expectBindings(f.originalBindings); expect(f.capture).toHaveBeenCalledTimes(2);
      f.registerOriginal(texture, png, options); registered += 1;
    });
    f.assertCurrent.mockImplementation(() => { if (registered > 0 && value.roughnessMap !== rough.original) expect(registered).toBe(2); });
    const result = await prepare(f); expect(registered).toBe(2); packedTexture(value);
    result.dispose(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("두 번째 capture 실패 뒤에도 첫 capture와 원래 binding을 소유 정리하지 않는다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), disposed = vi.spyOn(Texture.prototype, "dispose");
    let count = 0;
    f.capture.mockImplementation(async (texture) => {
      const input = f.sources.find((candidate) => candidate.original === texture);
      if (!input) throw Error("원래 texture만 capture할 수 있습니다.");
      if (++count === 2) throw Error("실제 capture 실패"); return input.capture;
    });
    await expect(prepare(f)).rejects.toThrow("실제 capture 실패");
    expect(f.capture).toHaveBeenCalledTimes(2);
    expectBindings(f.originalBindings); expect(f.register).not.toHaveBeenCalled(); expect(disposed).not.toHaveBeenCalled(); borrowedAlive(f);
  });

  it("준비와 개인 packed 정리가 함께 실패해도 원래 준비 원인과 cleanup 오류를 모두 보존한다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), preparationError = new Error("PNG 등록 오류"), cleanupError = new Error("packed 정리 오류");
    const disposed = vi.fn<() => void>(() => { throw cleanupError; });
    f.register.mockImplementationOnce((texture) => {
      expect(texture).toBeInstanceOf(DataTexture);
      expect(texture).not.toBe(rough.original); expect(texture).not.toBe(metal.original);
      texture.addEventListener("dispose", disposed);
      cleanups.push(() => texture.removeEventListener("dispose", disposed));
      throw preparationError;
    });
    const pending = prepare(f);
    await expect(pending).rejects.toBeInstanceOf(AggregateError);
    await expect(pending).rejects.toMatchObject({ cause: preparationError,
      errors: [preparationError, expect.objectContaining({ errors: [cleanupError] })] });
    expect(disposed).toHaveBeenCalledOnce(); expect(f.register).toHaveBeenCalledOnce();
    expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it.each(["취소", "stale"] as const)("capture await 중 %s면 binding·PNG·packed owner를 발행하지 않는다", async (kind) => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), pending = deferred<StudioBg3dSceneGlbTextureCapture>();
    const started = deferred<void>(), disposed = vi.spyOn(Texture.prototype, "dispose");
    f.capture.mockImplementation(async (texture) => {
      if (texture === metal.original) { started.resolve(undefined); return pending.promise; }
      if (texture !== rough.original) throw Error("원래 texture만 capture할 수 있습니다."); return rough.capture;
    });
    const preparing = prepare(f); await started.promise;
    if (kind === "취소") f.controller.abort(); else f.assertCurrent.mockImplementation(() => { throw Error("장면 권위 변경"); });
    const rejected = kind === "취소" ? expect(preparing).rejects.toMatchObject({ code: "aborted" }) : expect(preparing).rejects.toThrow("장면 권위 변경");
    pending.resolve(metal.capture); await rejected;
    expectBindings(f.originalBindings); expect(f.register).not.toHaveBeenCalled(); expect(disposed).not.toHaveBeenCalled(); borrowedAlive(f);
  });

  it("registry의 실제 PNG 검증 뒤 예외가 나도 binding을 발행하지 않고 packed만 1회 정리한다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original, aoMap: rough.original });
    const f = harness([value], [rough, metal]), disposed = vi.spyOn(Texture.prototype, "dispose"); let packed: Texture | undefined;
    f.register.mockImplementation((texture, png, options) => {
      expectBindings(f.originalBindings); f.registerOriginal(texture, png, options);
      if (texture instanceof DataTexture) { packed = texture; throw Error("registry 게시 실패"); }
    });
    await expect(prepare(f)).rejects.toThrow("registry 게시 실패");
    if (!packed) throw Error("실제로 만든 packed texture가 필요합니다.");
    expect(disposed.mock.contexts).toEqual([packed]); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("PNG 파일 예산이 1 byte 부족하면 만들어 둔 packed를 정리하고 원래 descriptor를 유지한다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), disposed = vi.spyOn(Texture.prototype, "dispose");
    const pixels = Uint8Array.from(expectedChannels(rough, metal));
    const png = encodeStudioBg3dSceneGlbRgbaPng({ width: 3, height: 5, rgba: pixels, signal: f.controller.signal, maximumBytes: LARGE_BUDGET });
    await expect(prepare(f, { maximumBytes: png.byteLength - 1 })).rejects.toMatchObject({ code: "budget-exceeded" });
    expect(disposed).toHaveBeenCalledOnce(); expect(f.register).not.toHaveBeenCalled(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("packed PNG 등록 뒤 취소되어도 최종 설치 없이 소유 allocation만 정리한다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), disposed = vi.spyOn(Texture.prototype, "dispose");
    f.register.mockImplementation((texture, png, options) => { f.registerOriginal(texture, png, options); f.controller.abort(); });
    await expect(prepare(f)).rejects.toMatchObject({ code: "aborted" });
    expect(disposed).toHaveBeenCalledOnce(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("binding 설치 직후 마지막 scope check가 실패하면 전체 descriptor를 원복한다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original, aoMap: rough.original });
    const f = harness([value], [rough, metal]), disposed = vi.spyOn(Texture.prototype, "dispose");
    f.assertCurrent.mockImplementation(() => { if (value.roughnessMap !== rough.original) throw Error("마지막 scope fence 실패"); });
    await expect(prepare(f)).rejects.toThrow("마지막 scope fence 실패");
    expect(disposed).toHaveBeenCalledOnce(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("뒤쪽의 고정 descriptor 설치가 실패하면 먼저 설치한 AO·MR도 원복한다", async () => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original, aoMap: rough.original });
    Object.defineProperty(value, "metalnessMap", { ...descriptor(value, "metalnessMap"), configurable: false, writable: false });
    const f = harness([value], [rough, metal]), disposed = vi.spyOn(Texture.prototype, "dispose");
    await expect(prepare(f)).rejects.toThrow();
    expect(f.capture).toHaveBeenCalledTimes(2); expect(f.register).toHaveBeenCalledTimes(2);
    expect(disposed).toHaveBeenCalledOnce(); expectBindings(f.originalBindings); borrowedAlive(f);
  });

  it("성공 해제는 descriptor flags를 복원하며 외부 교체 pointer는 보존한다", async () => {
    const rough = source(7), metal = source(101), outside = source(53), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    Object.defineProperty(value, "roughnessMap", { ...descriptor(value, "roughnessMap"), writable: false });
    const f = harness([value], [rough, metal]), result = await prepare(f), packed = packedTexture(value), disposed = vi.fn();
    packed.addEventListener("dispose", disposed); value.metalnessMap = outside.original;
    result.dispose(); result.dispose();
    expect(Object.getOwnPropertyDescriptor(value, "roughnessMap")).toEqual(f.originalBindings[0]?.descriptor);
    expect(value.roughnessMap).toBe(rough.original); expect(value.metalnessMap).toBe(outside.original);
    expect(disposed).toHaveBeenCalledOnce(); borrowedAlive(f);
    expect(outside.originalDispose).not.toHaveBeenCalled(); expect(outside.captureDispose).not.toHaveBeenCalled();
  });
});

const sourceMutations: readonly { readonly name: string; readonly mutate: (rough: Source, value: MeshStandardMaterial) => void }[] = [
  { name: "slot descriptor", mutate(_rough, value) { Object.defineProperty(value, "roughnessMap", { ...descriptor(value, "roughnessMap"), writable: false }); } },
  { name: "이미 capture한 texture version", mutate(rough) { rough.original.needsUpdate = true; } },
  { name: "version 증가 없는 UV", mutate(rough) { rough.original.offset.x = 0.25; } },
  { name: "source image pointer", mutate(rough) { rough.original.image = { width: 3, height: 5, data: rough.originalData }; } },
];
describe("await 중 바뀐 재질 권위와 지원하지 않는 pair", () => {
  it.each(sourceMutations)("$name 변경은 외부 변경을 되돌리지 않고 거부한다", async ({ mutate }) => {
    const rough = source(7), metal = source(101), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), pending = deferred<StudioBg3dSceneGlbTextureCapture>(), started = deferred<void>();
    f.capture.mockImplementation(async (texture) => {
      if (texture === metal.original) { started.resolve(undefined); return pending.promise; }
      if (texture !== rough.original) throw Error("원래 texture만 capture할 수 있습니다."); return rough.capture;
    });
    const preparing = prepare(f); await started.promise; mutate(rough, value);
    const externalDescriptor = descriptor(value, "roughnessMap"), externalState = sourceState(rough);
    const rejected = expect(preparing).rejects.toMatchObject({ code: "invalid-rgba", reason: "texture-binding-state-changed" });
    pending.resolve(metal.capture); await rejected;
    expect(Object.getOwnPropertyDescriptor(value, "roughnessMap")).toEqual(externalDescriptor);
    expect(sourceState(rough)).toEqual(externalState); expect(value.metalnessMap).toBe(metal.original);
    expect(f.register).not.toHaveBeenCalled(); borrowedAlive(f);
  });

  it("await 중 새 texture로 교체한 slot도 이전 pointer로 덮지 않는다", async () => {
    const rough = source(7), metal = source(101), outside = source(53), value = material({ roughnessMap: rough.original, metalnessMap: metal.original });
    const f = harness([value], [rough, metal]), pending = deferred<StudioBg3dSceneGlbTextureCapture>(), started = deferred<void>();
    f.capture.mockImplementation(async (texture) => {
      if (texture === metal.original) { started.resolve(undefined); return pending.promise; }
      if (texture !== rough.original) throw Error("원래 texture만 capture할 수 있습니다."); return rough.capture;
    });
    const preparing = prepare(f); await started.promise; value.roughnessMap = outside.original;
    const rejected = expect(preparing).rejects.toMatchObject({ reason: "texture-binding-state-changed" });
    pending.resolve(metal.capture); await rejected;
    expect(value.roughnessMap).toBe(outside.original); expect(value.metalnessMap).toBe(metal.original); borrowedAlive(f);
  });

  it.each(["dimensions", "rgba-length"] as const)("capture %s가 원래 image와 다르면 PNG 전에 거부한다", async (kind) => {
    const rough = source(7), value = material({ roughnessMap: rough.original }), f = harness([value], [rough]);
    f.capture.mockResolvedValue(kind === "dimensions" ? { ...rough.capture, width: 5, height: 3 }
      : { ...rough.capture, rgba: new Uint8Array(59) });
    await expect(prepare(f)).rejects.toMatchObject({ code: "invalid-rgba", reason: "texture-capture-size-changed" });
    expectBindings(f.originalBindings); expect(f.register).not.toHaveBeenCalled(); borrowedAlive(f);
  });

  it.each(["size", "UV", "sampler"] as const)("같지 않은 %s pair를 재표본화하지 않고 원자적으로 거부한다", async (kind) => {
    const rough = source(7), metal = kind === "size" ? source(101, 5, 3) : source(101);
    if (kind === "UV") for (const texture of [metal.original, metal.capture.texture]) { texture.channel = 1; }
    if (kind === "sampler") for (const texture of [metal.original, metal.capture.texture]) { texture.magFilter = LinearFilter; }
    const value = material({ roughnessMap: rough.original, metalnessMap: metal.original }), f = harness([value], [rough, metal]);
    const disposed = vi.spyOn(Texture.prototype, "dispose");
    const reason = kind === "size" ? "capture-size-mismatch" : kind === "UV" ? "uv-state-mismatch" : "sampling-state-mismatch";
    await expect(prepare(f)).rejects.toMatchObject({ code: "unsupported-feature", reason });
    expectBindings(f.originalBindings); expect(f.register).not.toHaveBeenCalled(); expect(disposed).not.toHaveBeenCalled(); borrowedAlive(f);
  });

  it("sRGB data map은 선형으로 간주하거나 두 slot을 바꾸지 않는다", async () => {
    const rough = source(7, 3, 5, false, SRGBColorSpace), metal = source(101);
    const value = material({ roughnessMap: rough.original, metalnessMap: metal.original }), f = harness([value], [rough, metal]);
    await expect(prepare(f)).rejects.toMatchObject({ reason: "texture-role-color-space-mismatch" });
    expect(f.capture).not.toHaveBeenCalled(); expectBindings(f.originalBindings); borrowedAlive(f);
  });
});
