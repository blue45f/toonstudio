import { describe, expect, it, vi } from "vitest";

import { bakeLatentPigmentTable } from "./latent-pigment-table";
import { createLatentPigmentWebGlResource } from "./latent-pigment-webgl";
import { glsl, toonstudioPigment } from "./toonstudio-pigment";

function context(webGl2: boolean, options: { extension?: boolean; maximum?: number; error?: number } = {}) {
  const original = {};
  const texture = {};
  const gl = {
    TEXTURE_2D: 3553, TEXTURE_3D: 32879, TEXTURE_BINDING_2D: 32873, TEXTURE_BINDING_3D: 32874,
    MAX_TEXTURE_SIZE: 3379, MAX_3D_TEXTURE_SIZE: 32883, TEXTURE_MIN_FILTER: 10241,
    TEXTURE_MAG_FILTER: 10240, TEXTURE_WRAP_S: 10242, TEXTURE_WRAP_T: 10243, TEXTURE_WRAP_R: 32882,
    NEAREST: 9728, CLAMP_TO_EDGE: 33071, RGBA: 6408, RGBA32F: 34836, FLOAT: 5126, NO_ERROR: 0,
    UNPACK_ALIGNMENT: 3317, UNPACK_FLIP_Y_WEBGL: 37440, UNPACK_PREMULTIPLY_ALPHA_WEBGL: 37441,
    UNPACK_COLORSPACE_CONVERSION_WEBGL: 37443, NONE: 0, UNPACK_ROW_LENGTH: 3314, UNPACK_IMAGE_HEIGHT: 32878,
    UNPACK_SKIP_PIXELS: 3316, UNPACK_SKIP_ROWS: 3315, UNPACK_SKIP_IMAGES: 32877, PIXEL_UNPACK_BUFFER_BINDING: 35055,
    PIXEL_UNPACK_BUFFER: 35052, pixelStorei: vi.fn(), bindBuffer: vi.fn(),
    isContextLost: vi.fn(() => false), getExtension: vi.fn(() => options.extension === false ? null : {}),
    getParameter: vi.fn((parameter: number) => parameter === 32873 || parameter === 32874 ? original : options.maximum ?? 4096),
    createTexture: vi.fn(() => texture), deleteTexture: vi.fn(), bindTexture: vi.fn(),
    texParameteri: vi.fn(), texImage2D: vi.fn(), getError: vi.fn(() => options.error ?? 0),
    ...(webGl2 ? { texImage3D: vi.fn() } : {}),
  };
  // 장치 경계 fixture: 실제 픽셀·셰이더 검증은 브라우저 프로브가 별도로 수행한다.
  return { gl, device: gl as unknown as WebGL2RenderingContext, original, texture };
}

const table = bakeLatentPigmentTable(2);

describe("자체 안료 WebGL 자원 수명", () => {
  it("WebGL1은 자체 2D float 표와 GLSL100을 쓰며 기존 바인딩을 복원한다", () => {
    const { gl, device, original, texture } = context(false);
    const resource = createLatentPigmentWebGlResource(device, { table });
    expect(resource.version).toBe(100);
    expect(resource.shader).toContain("texture2D(");
    expect(resource.shader).not.toContain("texelFetch(");
    expect(gl.getExtension).toHaveBeenCalledWith("OES_texture_float");
    expect(gl.texImage2D).toHaveBeenCalledWith(gl.TEXTURE_2D, 0, gl.RGBA, 4, 2, 0, gl.RGBA, gl.FLOAT, expect.any(Float32Array));
    expect(gl.bindTexture).toHaveBeenLastCalledWith(gl.TEXTURE_2D, original);
    resource.dispose(); resource.dispose();
    expect(gl.deleteTexture).toHaveBeenCalledExactlyOnceWith(texture);
  });

  it("WebGL2의 3D 표는 원래 농도 배치를 업로드하고 정확한 셰이더를 반환한다", () => {
    const { gl, device, original } = context(true);
    const resource = createLatentPigmentWebGlResource(device, { table });
    expect(resource.version).toBe(300);
    expect(resource.shader).toContain("sampler3D");
    expect(gl.texImage3D).toHaveBeenCalledWith(gl.TEXTURE_3D, 0, gl.RGBA32F, 2, 2, 2, 0, gl.RGBA, gl.FLOAT, table.concentrations);
    expect(gl.bindTexture).toHaveBeenLastCalledWith(gl.TEXTURE_3D, original);
  });

  it("미지원 장치·표 크기는 품질을 낮추거나 잘못된 텍스처를 반환하지 않는다", () => {
    const unsupported = context(false, { extension: false });
    expect(() => createLatentPigmentWebGlResource(unsupported.device, { table })).toThrow("지원하지 않습니다");
    expect(unsupported.gl.createTexture).not.toHaveBeenCalled();
    const small = context(false, { maximum: 2 });
    expect(() => createLatentPigmentWebGlResource(small.device, { table })).toThrow("크기 한도");
    expect(small.gl.createTexture).not.toHaveBeenCalled();
  });

  it("업로드 실패는 새 자원을 해제하고 기존 바인딩을 복원한다", () => {
    const { gl, device, texture, original } = context(true, { error: 1285 });
    expect(() => createLatentPigmentWebGlResource(device, { table })).toThrow("업로드 실패");
    expect(gl.deleteTexture).toHaveBeenCalledWith(texture);
    expect(gl.bindTexture).toHaveBeenLastCalledWith(gl.TEXTURE_3D, original);
  });

  it("통합 API의 GLSL·텍스처는 같은 2D 아틀라스 계약이다", () => {
    const { gl, device, texture } = context(true);
    expect(glsl({ tableSize: 2 })).toContain("sampler2D");
    expect(glsl({ tableSize: 2 })).toContain("toonstudio_pigment_lerp(highp vec4");
    expect(glsl({ tableSize: 2 })).toContain("mix(a.a, b.a, clamp(t, 0.0, 1.0))");
    expect(toonstudioPigment.lutTexture(device, { table })).toBe(texture);
    expect(gl.texImage2D).toHaveBeenCalled();
    expect(gl.texImage3D).not.toHaveBeenCalled();
    expect(toonstudioPigment.lerpFloat([1, 0.8, 0], [0, 0.1, 0.6], 0)).toEqual([1, 0.8, 0]);
  });

  it("명시적으로 선택한 WebGL2 3D 배치를 2D 표로 바꾸지 않는다", () => {
    const { gl, device } = context(true);
    toonstudioPigment.lutTexture(device, { table, tableLayout: "texture-3d" });
    expect(gl.texImage3D).toHaveBeenCalled();
    expect(gl.texImage2D).not.toHaveBeenCalled();
    expect(glsl({ tableSize: 2, version: 300, tableLayout: "texture-3d" })).toContain("sampler3D");
  });
});
