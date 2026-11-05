/**
 * 자체 안료의 CPU·GPU 공개 진입점. 외부 Mixbox의 코드·LUT·latent 데이터와 호환되지 않는다.
 * 제품 브러시는 CPU 어댑터만 가져오므로 GPU 지원 코드를 초기 번들에 추가하지 않는다.
 */
import { toonstudioPigment as cpuPigment } from "./latent-pigment-api";
import { buildLatentPigmentGlsl, buildLatentPigmentWgsl, type LatentPigmentGlslOptions } from "./latent-pigment-shaders";
import { createLatentPigmentWebGlResource, type LatentPigmentWebGlOptions } from "./latent-pigment-webgl";

export * from "./latent-pigment-api";
export { buildLatentPigmentWgsl, createLatentPigmentWebGlResource };

/** 기본은 WebGL1·2 양쪽에서 읽을 2D 아틀라스용 GLSL ES 1.00이다. */
export function glsl(options: LatentPigmentGlslOptions = {}): string {
  // 공개 API의 알파는 CPU와 같은 독립 선형 보간이다. 재료용 coverage 함수는 별도로 유지한다.
  return `${buildLatentPigmentGlsl({ version: 100, tableLayout: "atlas-2d", ...options })}
highp vec3 toonstudio_pigment_lerp(highp vec3 a, highp vec3 b, highp float t) {
  return latent_pigment_mix(a, b, t);
}
highp vec4 toonstudio_pigment_lerp(highp vec4 a, highp vec4 b, highp float t) {
  return vec4(latent_pigment_mix(a.rgb, b.rgb, t), mix(a.a, b.a, clamp(t, 0.0, 1.0)));
}
highp vec3 toonstudio_pigment_lerp_linear(highp vec3 a, highp vec3 b, highp float t) {
  return latent_pigment_mix_linear(a, b, t);
}
highp vec4 toonstudio_pigment_lerp_linear(highp vec4 a, highp vec4 b, highp float t) {
  return vec4(latent_pigment_mix_linear(a.rgb, b.rgb, t), mix(a.a, b.a, clamp(t, 0.0, 1.0)));
}
`;
}

/** 반환 텍스처의 소유자는 호출자다. 사용 후 gl.deleteTexture(texture)로 해제한다. */
export function lutTexture(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
  options: LatentPigmentWebGlOptions = {},
): WebGLTexture {
  return createLatentPigmentWebGlResource(gl, { tableLayout: "atlas-2d", ...options }).texture;
}

export const toonstudioPigment = Object.freeze({ ...cpuPigment, glsl, lutTexture, wgsl: buildLatentPigmentWgsl });
