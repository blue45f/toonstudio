/** 순수 packing 회귀. 실제 bridge·GPU·최종 GLB 통합 검증과 구분한다. */
import { DataTexture, LinearFilter, LinearMipmapLinearFilter, LinearSRGBColorSpace, Matrix3,
  MeshStandardMaterial, NearestFilter, NoColorSpace, RepeatWrapping, SRGBColorSpace, Texture } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createStudioBg3dSceneGlbMetalRoughTexture } from "./studio-bg3d-scene-glb-metal-rough";
import type { StudioBg3dSceneGlbMetalRoughInput, StudioBg3dSceneGlbMetalRoughReason,
  StudioBg3dSceneGlbMetalRoughResult, StudioBg3dSceneGlbMetalRoughSource } from "./studio-bg3d-scene-glb-metal-rough";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); });
const ROUGH = new Uint8Array([1, 10, 101, 0, 2, 20, 102, 128, 3, 30, 103, 255,
  4, 40, 104, 128, 5, 50, 105, 0, 6, 60, 106, 255]);
const METAL = new Uint8Array([71, 81, 91, 128, 72, 82, 92, 0, 73, 83, 93, 255,
  74, 84, 94, 0, 75, 85, 95, 128, 76, 86, 96, 255]);

function source(rgba: Uint8Array = ROUGH, width = 2, height = 3, flipY = false): StudioBg3dSceneGlbMetalRoughSource {
  const original = new DataTexture(Uint8Array.from(rgba), width, height);
  const captured = new Texture({ width, height });
  for (const texture of [original, captured]) {
    texture.minFilter = NearestFilter; texture.magFilter = NearestFilter; texture.generateMipmaps = false;
    texture.colorSpace = NoColorSpace; texture.matrixAutoUpdate = false; texture.matrix.identity();
  }
  captured.flipY = flipY;
  cleanups.push(() => { original.dispose(); captured.dispose(); });
  return { texture: original, capture: { texture: captured, width, height, rgba: Uint8Array.from(rgba), rowOrder: "top-down" } };
}
function configure(input: StudioBg3dSceneGlbMetalRoughSource, change: (texture: Texture) => void): void {
  change(input.texture); change(input.capture.texture);
}
function canonicalUv(texture: Texture): void {
  texture.channel = 1; texture.offset.set(0.2, -0.3); texture.repeat.set(-2, 3); texture.rotation = 0.4;
  texture.center.set(0, 0); texture.matrixAutoUpdate = false;
  const c = Math.cos(texture.rotation), s = Math.sin(texture.rotation);
  texture.matrix.set(texture.repeat.x * c, texture.repeat.y * s, texture.offset.x,
    -texture.repeat.x * s, texture.repeat.y * c, texture.offset.y, 0, 0, 1);
}
function input(roughness = source(), metalness = source(METAL), maximumRgbaBytes = 24): StudioBg3dSceneGlbMetalRoughInput {
  return { roughness, metalness, maximumRgbaBytes, signal: new AbortController().signal };
}
function packed(result: StudioBg3dSceneGlbMetalRoughResult) {
  if (!result.ok || result.value.kind !== "packed") throw Error("새 개인 packed texture가 필요하다");
  cleanups.push(result.value.dispose); return result.value;
}
function rejected(result: StudioBg3dSceneGlbMetalRoughResult, reason: StudioBg3dSceneGlbMetalRoughReason): void {
  if (result.ok) throw Error("이 입력은 명시적으로 거부되어야 한다");
  expect(result.reason).toBe(reason);
}
function snapshot(source: StudioBg3dSceneGlbMetalRoughSource) {
  const texture = source.texture, image: unknown = texture.image;
  const imageBytes = image && typeof image === "object" && "data" in image && image.data instanceof Uint8Array
    ? Uint8Array.from(image.data) : null;
  return { textureVersion: texture.version, sourceVersion: texture.source.version,
    source: texture.source, image: texture.image, imageBytes, mipmaps: texture.mipmaps,
    matrix: texture.matrix.toArray(), offset: texture.offset.toArray(), repeat: texture.repeat.toArray(),
    center: texture.center.toArray(), rotation: texture.rotation, auto: texture.matrixAutoUpdate,
    captured: Uint8Array.from(source.capture.rgba) };
}

describe("선형 roughness·metalness의 개인 RGBA8 packing", () => {
  it("원래 alpha0/128·R/B/G와 관계없이 G/B만 바이트 그대로 합친다", () => {
    const request = input(), value = packed(createStudioBg3dSceneGlbMetalRoughTexture(request));
    expect([...value.rgba]).toEqual([255, 10, 91, 255, 255, 20, 92, 255, 255, 30, 93, 255,
      255, 40, 94, 255, 255, 50, 95, 255, 255, 60, 96, 255]);
    expect(value).toMatchObject({ width: 2, height: 3, additionalRgbaBytes: 24, coverage: "base-level-gb-exact", limitations: [] });
    expect(value.texture.image.data).toBe(value.rgba); expect(value.texture.flipY).toBe(false);
    expect(value.texture.colorSpace).toBe(NoColorSpace); expect(value.texture.premultiplyAlpha).toBe(false);
    expect(value.texture.generateMipmaps).toBe(false); expect(value.texture.userData).toEqual({ mimeType: "image/png" });
  });

  it("GPU top-down flipYtrue와 CPU flipYfalse를 PNG 좌표로 먼저 정렬한다", () => {
    const roughness = source(ROUGH, 2, 3, true), metalness = source(METAL, 2, 3, false);
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)));
    expect([...value.rgba]).toEqual([255, 50, 91, 255, 255, 60, 92, 255, 255, 30, 93, 255,
      255, 40, 94, 255, 255, 10, 95, 255, 255, 20, 96, 255]);
    expect(value.texture.flipY).toBe(false); expect(roughness.capture.texture.flipY).toBe(true);
    expect(roughness.capture.rgba).toEqual(ROUGH); expect(metalness.capture.rgba).toEqual(METAL);
  });

  it("3×5 비정형 행에서도 각 capture의 flipY를 한 번만 적용한다", () => {
    const width = 3, height = 5;
    const roughBytes = new Uint8Array(width * height * 4), metalBytes = new Uint8Array(width * height * 4);
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4;
        roughBytes[index + 1] = row * 10 + column; roughBytes[index + 3] = column === 0 ? 0 : 128;
        metalBytes[index + 2] = 100 + row * 10 + column; metalBytes[index + 3] = column === 1 ? 0 : 255;
      }
    }
    const roughness = source(roughBytes, width, height, true), metalness = source(metalBytes, width, height, false);
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness, roughBytes.length)));
    for (let row = 0; row < height; row += 1) {
      for (let column = 0; column < width; column += 1) {
        const index = (row * width + column) * 4;
        expect([...value.rgba.subarray(index, index + 4)])
          .toEqual([255, (height - row - 1) * 10 + column, 100 + row * 10 + column, 255]);
      }
    }
    expect(value.texture.flipY).toBe(false);
    expect(roughness.capture.rgba).toEqual(roughBytes); expect(metalness.capture.rgba).toEqual(metalBytes);
  });

  it("NoColorSpace와 LinearSRGBColorSpace는 선형 바이트 그대로 합친다", () => {
    const roughness = source(), metalness = source(METAL);
    configure(roughness, (texture) => { texture.colorSpace = LinearSRGBColorSpace; });
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)));
    expect(value.rgba[1]).toBe(10); expect(value.rgba[2]).toBe(91); expect(value.texture.colorSpace).toBe(NoColorSpace);
  });

  it("최종 KHR UV recipe·channel·sampler를 옮기고 원본 matrix를 갱신하지 않는다", () => {
    const roughness = source(), metalness = source(METAL);
    for (const current of [roughness, metalness]) configure(current, (texture) => {
      canonicalUv(texture); texture.wrapS = RepeatWrapping; texture.wrapT = RepeatWrapping;
      texture.minFilter = LinearFilter; texture.magFilter = LinearFilter;
    });
    const beforeRough = snapshot(roughness), beforeMetal = snapshot(metalness);
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)));
    expect(value.texture.matrix.equals(roughness.texture.matrix)).toBe(true); expect(value.texture.channel).toBe(1);
    expect(value.texture.offset.toArray()).toEqual([0.2, -0.3]); expect(value.texture.repeat.toArray()).toEqual([-2, 3]);
    expect(value.texture.center.toArray()).toEqual([0, 0]); expect(value.texture.matrixAutoUpdate).toBe(false);
    expect(value.texture.wrapS).toBe(RepeatWrapping); expect(value.texture.wrapT).toBe(RepeatWrapping);
    expect(value.texture.minFilter).toBe(LinearFilter); expect(value.texture.magFilter).toBe(LinearFilter);
    expect(snapshot(roughness)).toEqual(beforeRough); expect(snapshot(metalness)).toEqual(beforeMetal);
  });

  it("이미 UV geometry에 구워진 identity recipe도 추가 UV 변환 없이 받아들인다", () => {
    const roughness = source(), metalness = source(METAL);
    for (const current of [roughness, metalness]) configure(current, (texture) => {
      texture.channel = 2; texture.matrixAutoUpdate = true; texture.matrix.identity();
    });
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)));
    expect(value.texture.channel).toBe(2); expect(value.texture.matrix.equals(new Matrix3())).toBe(true);
    expect(value.texture.offset.toArray()).toEqual([0, 0]); expect(value.texture.repeat.toArray()).toEqual([1, 1]);
  });

  it("auto matrix는 새 행렬에서만 계산하고 원본의 stale matrix를 갱신하지 않는다", () => {
    const roughness = source(), metalness = source(METAL);
    for (const current of [roughness, metalness]) configure(current, (texture) => {
      texture.matrixAutoUpdate = true; texture.offset.set(0.25, -0.125); texture.matrix.identity();
    });
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)));
    expect(value.texture.matrix.elements[6]).toBe(0.25); expect(value.texture.matrix.elements[7]).toBe(-0.125);
    expect(roughness.texture.matrix.equals(new Matrix3())).toBe(true); expect(metalness.texture.matrix.equals(new Matrix3())).toBe(true);
    expect(roughness.capture.texture.matrix.equals(new Matrix3())).toBe(true);
  });

  it("다른 double 값이어도 GPU Float32 uniform이 같으면 같고 인접 Float32는 합치지 않는다", () => {
    const roughness = source(), metalness = source(METAL);
    configure(metalness, (texture) => { texture.repeat.x = 1 + Number.EPSILON; texture.matrix.elements[0] = texture.repeat.x; });
    expect(roughness.texture.matrix.elements[0]).not.toBe(metalness.texture.matrix.elements[0]);
    expect(packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness))).coverage).toBe("base-level-gb-exact");
    configure(metalness, (texture) => { texture.repeat.x = 1 + 2 ** -23; texture.matrix.elements[0] = texture.repeat.x; });
    rejected(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)), "uv-state-mismatch");
  });

  it("roughness-only는 B=1이며 material 스칼라를 다시 굽거나 1로 덮지 않는다", () => {
    const roughness = source(), material = new MeshStandardMaterial({ roughness: 0.37, metalness: 0.63 });
    cleanups.push(() => material.dispose());
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture({ ...input(), roughness, metalness: null }));
    // caller 설치 예시다. 제품 bridge를 구현한 테스트로 보지 않는다.
    material.roughnessMap = value.texture; material.metalnessMap = value.texture;
    expect([...value.rgba]).toEqual([255, 10, 255, 255, 255, 20, 255, 255, 255, 30, 255, 255,
      255, 40, 255, 255, 255, 50, 255, 255, 255, 60, 255, 255]);
    expect(material.roughness).toBe(0.37); expect(material.metalness).toBe(0.63);
    expect(material.roughnessMap).toBe(material.metalnessMap);
  });

  it("metalness-only는 G=1이며 원래 B를 유지한다", () => {
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture({ ...input(), roughness: null, metalness: source(METAL) }));
    expect([...value.rgba]).toEqual([255, 255, 91, 255, 255, 255, 92, 255, 255, 255, 93, 255,
      255, 255, 94, 255, 255, 255, 95, 255, 255, 255, 96, 255]);
  });

  it("AO가 원래 roughness 이미지를 공유해도 AO/R·AO intensity·scalar를 바꾸지 않는다", () => {
    const roughness = source(), metalness = source(METAL);
    const material = new MeshStandardMaterial({ roughnessMap: roughness.texture, metalnessMap: metalness.texture,
      aoMap: roughness.texture, aoMapIntensity: 0.73, roughness: 0.37, metalness: 0.63 });
    cleanups.push(() => material.dispose());
    const before = snapshot(roughness), value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)));
    // 제품 bridge가 아니라 caller의 두 slot 설치 계약만 검증한다.
    material.roughnessMap = value.texture; material.metalnessMap = value.texture;
    expect(material.aoMap).toBe(roughness.texture); expect(snapshot(roughness)).toEqual(before);
    expect(roughness.capture.rgba[0]).toBe(1); expect(roughness.capture.rgba[4]).toBe(2);
    expect(value.rgba[0]).toBe(255); expect(material.aoMapIntensity).toBe(0.73);
    expect(material.roughness).toBe(0.37); expect(material.metalness).toBe(0.63);
  });

  it("map이 없거나 이미 같은 pointer면 새 texture를 만들지 않는다", () => {
    const shared = source(), dispose = vi.spyOn(shared.texture, "dispose");
    expect(createStudioBg3dSceneGlbMetalRoughTexture({ ...input(), roughness: null, metalness: null, maximumRgbaBytes: 0 }))
      .toEqual({ ok: true, value: { kind: "unchanged", reason: "no-maps" } });
    expect(createStudioBg3dSceneGlbMetalRoughTexture(input(shared, shared, 0)))
      .toEqual({ ok: true, value: { kind: "unchanged", reason: "already-shared-orm" } });
    expect(dispose).not.toHaveBeenCalled();
  });

  it("입력 raw capture를 별도 복사하지 않고 새 packed 출력만 만든다", () => {
    const request = input(), copy = vi.spyOn(Uint8Array, "from");
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(request));
    expect(copy).not.toHaveBeenCalled();
    expect(value.rgba).not.toBe(request.roughness?.capture.rgba);
    expect(value.rgba).not.toBe(request.metalness?.capture.rgba);
    expect(value.additionalRgbaBytes).toBe(24);
  });

  it("입력과 capture를 공유하지 않는 출력만 한 번 dispose한다", () => {
    const roughness = source(), metalness = source(METAL), beforeRough = snapshot(roughness), beforeMetal = snapshot(metalness);
    const sourceDisposes = [vi.spyOn(roughness.texture, "dispose"), vi.spyOn(metalness.texture, "dispose"),
      vi.spyOn(roughness.capture.texture, "dispose"), vi.spyOn(metalness.capture.texture, "dispose")];
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness))), disposed = vi.fn();
    value.texture.addEventListener("dispose", disposed);
    expect(value.texture.source).not.toBe(roughness.texture.source); expect(value.texture.source).not.toBe(metalness.texture.source);
    expect(value.rgba).not.toBe(roughness.capture.rgba); expect(value.rgba).not.toBe(metalness.capture.rgba);
    value.rgba[1] = 250; expect(roughness.capture.rgba[1]).toBe(10);
    value.dispose(); value.dispose(); expect(disposed).toHaveBeenCalledOnce();
    for (const dispose of sourceDisposes) expect(dispose).not.toHaveBeenCalled();
    expect(snapshot(roughness)).toEqual(beforeRough); expect(snapshot(metalness)).toEqual(beforeMetal);
  });

  it("새 출력 한 개의 추가 메모리를 한도에 맞춰 계산하며 입력 capture를 재계산하지 않는다", () => {
    const request = input();
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture({ ...request, maximumRgbaBytes: 24 }));
    expect(value.additionalRgbaBytes).toBe(24);
    rejected(createStudioBg3dSceneGlbMetalRoughTexture({ ...request, maximumRgbaBytes: 23 }), "additional-rgba-over-budget");
    rejected(createStudioBg3dSceneGlbMetalRoughTexture({ ...request, maximumRgbaBytes: -1 }), "invalid-additional-rgba-budget");
  });

  it("자동 mip과 anisotropy의 외부 renderer 한계를 성공 coverage에서 명시한다", () => {
    const roughness = source(), metalness = source(METAL);
    for (const current of [roughness, metalness]) configure(current, (texture) => {
      texture.minFilter = LinearMipmapLinearFilter; texture.generateMipmaps = true; texture.anisotropy = 4;
    });
    const value = packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)));
    expect(value.coverage).toBe("base-level-gb-exact");
    expect(value.limitations).toEqual(["automatic-mip-regeneration-not-verified", "anisotropy-not-encoded-by-gltf-core"]);
    expect(value.texture.anisotropy).toBe(4); expect(value.texture.generateMipmaps).toBe(true);
  });

  it("authored mip을 사용하는 입력은 재생성 mip과 같다고 가정하지 않는다", () => {
    const roughness = source(), metalness = source(METAL);
    for (const current of [roughness, metalness]) configure(current, (texture) => { texture.minFilter = LinearMipmapLinearFilter; texture.generateMipmaps = true; });
    roughness.texture.mipmaps = [{ width: 1, height: 1, data: new Uint8Array([1, 2, 3, 4]) }];
    const before = snapshot(roughness);
    rejected(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)), "authored-mip-chain-not-preserved");
    expect(snapshot(roughness)).toEqual(before);
    configure(roughness, (texture) => { texture.minFilter = NearestFilter; });
    configure(metalness, (texture) => { texture.minFilter = NearestFilter; });
    expect(packed(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness))).coverage).toBe("base-level-gb-exact");
  });

  it("취소된 입력은 새 texture 없이 명시 실패한다", () => {
    const controller = new AbortController(), request = input(); controller.abort();
    rejected(createStudioBg3dSceneGlbMetalRoughTexture({ ...request, signal: controller.signal }), "signal-aborted");
  });
});

const mismatches: readonly { readonly label: string; readonly reason: StudioBg3dSceneGlbMetalRoughReason;
  readonly mutate: (source: StudioBg3dSceneGlbMetalRoughSource) => StudioBg3dSceneGlbMetalRoughSource }[] = [
  { label: "다른 해상도", reason: "capture-size-mismatch", mutate: () => source(METAL, 3, 2) },
  { label: "다른 channel", reason: "uv-state-mismatch", mutate(value) { configure(value, (texture) => { texture.channel = 1; }); return value; } },
  { label: "다른 유효 UV", reason: "uv-state-mismatch", mutate(value) { configure(value, (texture) => { texture.offset.x = 0.25; texture.matrix.setUvTransform(0.25, 0, 1, 1, 0, 0, 0); }); return value; } },
  { label: "다른 wrap", reason: "sampling-state-mismatch", mutate(value) { configure(value, (texture) => { texture.wrapS = RepeatWrapping; }); return value; } },
  { label: "다른 magFilter", reason: "sampling-state-mismatch", mutate(value) { configure(value, (texture) => { texture.magFilter = LinearFilter; }); return value; } },
  { label: "다른 minFilter", reason: "sampling-state-mismatch", mutate(value) { configure(value, (texture) => { texture.minFilter = LinearFilter; }); return value; } },
  { label: "다른 anisotropy", reason: "sampling-state-mismatch", mutate(value) { configure(value, (texture) => { texture.anisotropy = 4; }); return value; } },
  { label: "sRGB data map", reason: "texture-role-color-space-mismatch", mutate(value) { configure(value, (texture) => { texture.colorSpace = SRGBColorSpace; }); return value; } },
  { label: "capture 뒤 sampler 변경", reason: "capture-source-state-mismatch", mutate(value) { value.texture.magFilter = LinearFilter; return value; } },
  { label: "원래 source image의 실제 크기 불일치", reason: "capture-source-state-mismatch", mutate(value) {
    value.texture.image = { width: 3, height: 2, data: Uint8Array.from(METAL) }; return value;
  } },
  { label: "결과 image의 실제 크기 불일치", reason: "capture-source-state-mismatch", mutate(value) {
    value.capture.texture.image = { width: 3, height: 2 }; return value;
  } },
  { label: "원래 source image 누락", reason: "capture-source-state-mismatch", mutate(value) { value.texture.image = null; return value; } },
  { label: "결과 image 크기의 잘못된 타입", reason: "capture-source-state-mismatch", mutate(value) {
    value.capture.texture.image = { width: "2", height: 3 }; return value;
  } },
  { label: "premultiplied source", reason: "premultiplied-source-not-supported", mutate(value) { value.texture.premultiplyAlpha = true; return value; } },
  { label: "범위 밖 channel", reason: "uv-channel-out-of-range", mutate(value) { configure(value, (texture) => { texture.channel = 4; }); return value; } },
  { label: "비유한 UV", reason: "uv-transform-not-finite", mutate(value) { configure(value, (texture) => { texture.matrix.elements[0] = Number.NaN; }); return value; } },
  { label: "Float32 overflow UV", reason: "uv-transform-not-finite", mutate(value) { configure(value, (texture) => { texture.matrix.elements[0] = 1e100; }); return value; } },
  { label: "projective UV", reason: "uv-projective-transform", mutate(value) { configure(value, (texture) => { texture.matrix.elements[2] = 1; }); return value; } },
  { label: "아직 normalize하지 않은 shear", reason: "uv-normalization-or-bake-required", mutate(value) { configure(value, (texture) => { texture.matrix.set(1, 0.2, 0, 0, 1, 0, 0, 0, 1); }); return value; } },
  { label: "잘린 capture", reason: "invalid-capture", mutate(value) { return { ...value, capture: { ...value.capture, rgba: new Uint8Array(4) } }; } },
];
describe("다른 sampling이나 손상된 capture의 원자적 거부", () => {
  it.each(mismatches)("$label", ({ reason, mutate }) => {
    const roughness = source(), metalness = mutate(source(METAL));
    const beforeRough = snapshot(roughness), beforeMetal = snapshot(metalness);
    rejected(createStudioBg3dSceneGlbMetalRoughTexture(input(roughness, metalness)), reason);
    expect(snapshot(roughness)).toEqual(beforeRough); expect(snapshot(metalness)).toEqual(beforeMetal);
  });
});
