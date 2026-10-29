// @vitest-environment jsdom
import { BoxGeometry, CanvasTexture, DataTexture, Mesh, MeshStandardMaterial, NoColorSpace, Scene, SRGBColorSpace } from "three";
import { afterEach, describe, expect, it, vi } from "vitest";
import { unzlibSync } from "fflate";
import { parsePngChunks } from "../studio-apng-encoder";
import { createStudioBg3dSceneGlbImageReplacementRegistry } from "./studio-bg3d-scene-glb-exact-images";
import { prepareStudioBg3dSceneGlbTextureImages } from "./studio-bg3d-scene-glb-texture-image-bridge";
import type { StudioBg3dSceneGlbTextureCapture, StudioBg3dSceneGlbTextureExportSupport } from "./studio-bg3d-scene-glb-texture-export";

const cleanups: (() => void)[] = [];
afterEach(() => { for (const cleanup of cleanups.splice(0).reverse()) cleanup(); vi.restoreAllMocks(); });
function fixture() {
  const signal = new AbortController().signal, maximumBytes = 1024 * 1024;
  const rgba = new Uint8Array([13, 53, 211, 0, 197, 101, 37, 128]);
  const originalData = Uint8Array.from(rgba);
  const original = new DataTexture(originalData, 1, 2), material = new MeshStandardMaterial({ map: original });
  original.colorSpace = SRGBColorSpace;
  const canvas = document.createElement("canvas"); canvas.width = 1; canvas.height = 2;
  const texture = new CanvasTexture(canvas); texture.flipY = true;
  const captured: StudioBg3dSceneGlbTextureCapture = { texture, width: 1, height: 2, rgba, rowOrder: "top-down" };
  const capture = vi.fn<StudioBg3dSceneGlbTextureExportSupport["capture"]>().mockResolvedValue(captured);
  const support: StudioBg3dSceneGlbTextureExportSupport = { capture, textureUtils: { decompress: async () => { throw Error("이 경로는 raw capture만 쓴다"); } }, dispose: vi.fn(async () => undefined) };
  const geometry = new BoxGeometry(), root = new Scene(); root.add(new Mesh(geometry, material), new Mesh(geometry, material));
  const registry = createStudioBg3dSceneGlbImageReplacementRegistry({ signal, maximumBytes });
  const register = vi.spyOn(registry, "registerTexture"), assertCurrent = vi.fn();
  cleanups.push(() => { registry.dispose(); geometry.dispose(); material.dispose(); original.dispose(); texture.dispose(); });
  return { original, originalData, material, rgba, captured, capture, texture, register, support, assertCurrent,
    options: { root, support, registry, signal, maximumBytes, maximumRgbaBytes: maximumBytes, assertCurrent } };
}

describe("개인 raw RGBA와 최종 GLB image의 연결", () => {
  it("공유 재질·ORM을 한 번만 읽고 alpha0 RGB·flipY를 PNG payload에 보존한다", async () => {
    const f = fixture(); f.original.colorSpace = NoColorSpace; f.material.map = null;
    f.material.roughnessMap = f.original; f.material.metalnessMap = f.original; f.material.aoMap = f.original;
    const originalVersion = f.original.source.version, originalBytes = Uint8Array.from(f.originalData);
    await prepareStudioBg3dSceneGlbTextureImages(f.options);
    expect(f.capture).toHaveBeenCalledOnce(); expect(f.capture).toHaveBeenCalledWith(f.original);
    expect(f.material.aoMap).toBe(f.texture); expect(f.material.roughnessMap).toBe(f.texture); expect(f.material.metalnessMap).toBe(f.texture);
    expect(f.register).toHaveBeenCalledOnce();
    const call = f.register.mock.calls[0]; if (!call) throw Error("실제 PNG 등록 필요");
    const [registered, png, options] = call; expect(registered).toBe(f.texture); expect(options?.required).toBe(true);
    const idat = parsePngChunks(png).find((chunk) => chunk.type === "IDAT"); if (!idat) throw Error("실제 PNG IDAT 필요");
    expect([...unzlibSync(idat.data)]).toEqual([0, 197, 101, 37, 128, 0, 13, 53, 211, 0]);
    expect(f.original.source.version).toBe(originalVersion); expect(f.original.image.data).toEqual(originalBytes);
    expect(f.support.dispose).not.toHaveBeenCalled();
  });
  it("raw capture 대기 중 source가 바뀌면 texture 연결과 PNG 등록을 발행하지 않는다", async () => {
    const f = fixture(); let finish: ((value: StudioBg3dSceneGlbTextureCapture) => void) | undefined;
    f.capture.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
    const pending = prepareStudioBg3dSceneGlbTextureImages(f.options);
    f.assertCurrent.mockImplementation(() => { throw Error("장면 변경"); });
    if (!finish) throw Error("실제 capture 대기 필요"); finish(f.captured);
    await expect(pending).rejects.toThrow("장면 변경");
    expect(f.material.map).toBe(f.original); expect(f.register).not.toHaveBeenCalled();
  });
  it("디코드 예산 초과·이미 취소된 요청은 새 이미지를 붙이지 않는다", async () => {
    const f = fixture();
    await expect(prepareStudioBg3dSceneGlbTextureImages({ ...f.options, maximumRgbaBytes: 7 }))
      .rejects.toMatchObject({ code: "budget-exceeded", reason: "cumulative-rgba-over-budget" });
    expect(f.material.map).toBe(f.original); expect(f.register).not.toHaveBeenCalled();
    const controller = new AbortController(); controller.abort(); f.capture.mockClear();
    await expect(prepareStudioBg3dSceneGlbTextureImages({ ...f.options, signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
    expect(f.capture).not.toHaveBeenCalled();
  });
  it("stock normal 부호 변환처럼 파생 이미지를 만드는 slot은 원본 관측을 필수로 두지 않는다", async () => {
    const f = fixture(); f.original.colorSpace = NoColorSpace; f.material.map = null; f.material.normalMap = f.original;
    await prepareStudioBg3dSceneGlbTextureImages(f.options);
    expect(f.material.normalMap).toBe(f.texture); expect(f.register.mock.calls[0]?.[2]?.required).toBe(false);
  });
  it("glTF slot의 고정 색공간과 다른 source를 변환 손실 없이 성공으로 내보내지 않는다", async () => {
    const f = fixture(); f.original.colorSpace = NoColorSpace;
    await expect(prepareStudioBg3dSceneGlbTextureImages(f.options)).rejects.toMatchObject({ reason: "texture-role-color-space-mismatch" });
    f.material.map = null; f.material.normalMap = f.original; f.original.colorSpace = SRGBColorSpace;
    await expect(prepareStudioBg3dSceneGlbTextureImages(f.options)).rejects.toMatchObject({ reason: "texture-role-color-space-mismatch" });
    expect(f.capture).not.toHaveBeenCalled(); expect(f.register).not.toHaveBeenCalled(); expect(f.material.normalMap).toBe(f.original);
  });
});
