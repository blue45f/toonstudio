/** 자체 생성 표의 WebGL 업로드. 외부 코드·이미지·격자표를 읽거나 요청하지 않는다. */
import { buildLatentPigmentGlsl, type LatentPigmentGlslTableLayout } from "./latent-pigment-shaders";
import { assertLatentPigmentTable, getLatentPigmentTable, packLatentPigmentTableAtlas2d, type LatentPigmentTable } from "./latent-pigment-table";

import { packLatentPigmentFloat32Atlas, latentPigmentPackedAtlasLayout, type LatentPigmentTextureEncoding } from "./latent-pigment-float32-atlas";

type PigmentWebGl = WebGLRenderingContext | WebGL2RenderingContext;

export interface LatentPigmentWebGlResource {
  readonly texture: WebGLTexture;
  readonly target: number;
  readonly version: 100 | 300;
  readonly tableSize: number;
  readonly shader: string;
  readonly textureEncoding: LatentPigmentTextureEncoding;
  readonly textureWidth: number;
  readonly textureHeight: number;
  /** 호출자가 해당 컨텍스트에서 더 이상 쓰지 않을 때 한 번 해제한다. */
  dispose(): void;
}

export interface LatentPigmentWebGlOptions {
  readonly table?: LatentPigmentTable;
  readonly tableLayout?: LatentPigmentGlslTableLayout;
  readonly samplerName?: string;
  readonly textureEncoding?: LatentPigmentTextureEncoding;
}

function isWebGl2(gl: PigmentWebGl): gl is WebGL2RenderingContext {
  return "texImage3D" in gl;
}

/**
 * WebGL1은 확장이 있으면 float 표, 없으면 동일 Float32 바이트의 RGBA8 표를 쓴다.
 * WebGL2의 float 3D/2D 표와 명시적 RGBA8 보존 표도 지원한다.
 * 현재 활성 텍스처 단위·바인딩을 보존하며, 실패하면 새 텍스처를 해제한다.
 * 반환된 셰이더는 표의 크기·배치와 일치한다. 소유권은 호출자에게 있다.
 */
export function createLatentPigmentWebGlResource(
  gl: PigmentWebGl,
  options: LatentPigmentWebGlOptions = {},
): LatentPigmentWebGlResource {
  if (gl.isContextLost()) throw new Error("안료 텍스처를 만들 WebGL 컨텍스트가 유실되었습니다.");
  const webGl2 = isWebGl2(gl);
  const version = webGl2 ? 300 : 100;
  const floatSupported = webGl2 || (options.textureEncoding !== "packed-float32" && !!gl.getExtension("OES_texture_float"));
  let textureEncoding = options.textureEncoding ?? (floatSupported ? "float32" : "packed-float32");
  if (textureEncoding !== "float32" && textureEncoding !== "packed-float32") throw new RangeError("안료 텍스처 인코딩이 올바르지 않습니다.");
  if (textureEncoding === "float32" && !floatSupported) throw new Error("이 WebGL1 장치는 부동소수 안료 텍스처를 지원하지 않습니다.");
  let packed = textureEncoding === "packed-float32";
  const tableLayout = options.tableLayout ?? (packed || !webGl2 ? "atlas-2d" : "texture-3d");
  const table = assertLatentPigmentTable(options.table ?? getLatentPigmentTable());
  const atlas = tableLayout === "atlas-2d";
  const layout = packed ? latentPigmentPackedAtlasLayout(table.size) : { width: atlas ? table.size * table.size : table.size, height: table.size };
  let { width, height } = layout;
  const maximum = Number(gl.getParameter(atlas ? gl.MAX_TEXTURE_SIZE : webGl2 ? gl.MAX_3D_TEXTURE_SIZE : gl.MAX_TEXTURE_SIZE));
  // 자동 선택의 긴 float 아틀라스만 한도를 넘으면 같은 표의 무손실 바이트 배치를 사용한다.
  if (options.textureEncoding === undefined && atlas && !packed && Number.isFinite(maximum) && (width > maximum || height > maximum)) {
    const fallback = latentPigmentPackedAtlasLayout(table.size);
    if (fallback.width <= maximum && fallback.height <= maximum) {
      textureEncoding = "packed-float32"; packed = true;
      width = fallback.width; height = fallback.height;
    }
  }
  if (!Number.isFinite(maximum) || width > maximum || height > maximum) {
    throw new RangeError("안료 표가 장치의 텍스처 크기 한도를 넘습니다.");
  }
  const shader = buildLatentPigmentGlsl({ version, tableLayout, tableSize: table.size, samplerName: options.samplerName, textureEncoding });
  const data = packed ? packLatentPigmentFloat32Atlas(table).data : atlas ? packLatentPigmentTableAtlas2d(table) : table.concentrations;
  const target = !atlas && webGl2 ? gl.TEXTURE_3D : gl.TEXTURE_2D;
  const previous = gl.getParameter(!atlas && webGl2 ? gl.TEXTURE_BINDING_3D : gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
  // 공용 렌더러가 남긴 stride·skip·PBO·브라우저 이미지 전처리가 표의 배치를 바꾸지 않게 한다.
  const unpackParameters: number[] = [gl.UNPACK_ALIGNMENT, gl.UNPACK_FLIP_Y_WEBGL, gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, gl.UNPACK_COLORSPACE_CONVERSION_WEBGL];
  if (webGl2) unpackParameters.push(gl.UNPACK_ROW_LENGTH, gl.UNPACK_IMAGE_HEIGHT, gl.UNPACK_SKIP_PIXELS, gl.UNPACK_SKIP_ROWS, gl.UNPACK_SKIP_IMAGES);
  const unpackValues = unpackParameters.map((parameter) => gl.getParameter(parameter) as number | boolean);
  const previousUnpackBuffer = webGl2 ? gl.getParameter(gl.PIXEL_UNPACK_BUFFER_BINDING) as WebGLBuffer | null : null;
  const texture = gl.createTexture();
  if (!texture) throw new Error("안료 텍스처를 할당하지 못했습니다.");
  try {
    if (webGl2) gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, null);
    for (const parameter of unpackParameters) {
      gl.pixelStorei(parameter, parameter === gl.UNPACK_ALIGNMENT ? 4 : parameter === gl.UNPACK_COLORSPACE_CONVERSION_WEBGL ? gl.NONE : 0);
    }
    gl.bindTexture(target, texture);
    gl.texParameteri(target, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(target, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(target, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    if (!atlas && webGl2) {
      gl.texParameteri(target, gl.TEXTURE_WRAP_R, gl.CLAMP_TO_EDGE);
      gl.texImage3D(target, 0, gl.RGBA32F, table.size, table.size, table.size, 0, gl.RGBA, gl.FLOAT, table.concentrations);
    } else {
      gl.texImage2D(target, 0, packed || !webGl2 ? gl.RGBA : gl.RGBA32F, width, height, 0, gl.RGBA, packed ? gl.UNSIGNED_BYTE : gl.FLOAT, data);
    }
    const error = gl.getError();
    if (error !== gl.NO_ERROR || gl.isContextLost()) throw new Error(`안료 표 업로드 실패: WebGL ${error}`);
  } catch (error) {
    gl.deleteTexture(texture);
    throw error;
  } finally {
    unpackParameters.forEach((parameter, index) => gl.pixelStorei(parameter, Number(unpackValues[index])));
    if (webGl2) gl.bindBuffer(gl.PIXEL_UNPACK_BUFFER, previousUnpackBuffer);
    gl.bindTexture(target, previous);
  }
  let disposed = false;
  return Object.freeze({
    texture, target, version, tableSize: table.size, shader, textureEncoding, textureWidth: width, textureHeight: height,
    dispose() {
      if (disposed) return;
      disposed = true;
      gl.deleteTexture(texture);
    },
  });
}
